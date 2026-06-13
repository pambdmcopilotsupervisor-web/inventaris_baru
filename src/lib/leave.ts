/**
 * lib/leave.ts
 *
 * Service library untuk fitur Cuti Pegawai:
 * - Konstanta status pengajuan cuti
 * - WorkingDayCalculatorService
 * - SupervisorResolverService
 * - LeaveBalanceService
 * - LeaveApprovalService
 */
import { prisma } from "@/lib/prisma"
import type { Prisma } from "@prisma/client"

type DbClient = typeof prisma | Prisma.TransactionClient

// ─── Konstanta Status Cuti ────────────────────────────────────────
export const STATUS_CUTI = {
  DRAFT:                "draft",
  SUBMITTED:            "submitted",
  APPROVED_SUPERVISOR:  "approved_supervisor",
  REJECTED_SUPERVISOR:  "rejected_supervisor",
  APPROVED_HRD:         "approved_hrd",
  REJECTED_HRD:         "rejected_hrd",
  CANCELLED:            "cancelled",
} as const

export type StatusCuti = typeof STATUS_CUTI[keyof typeof STATUS_CUTI]

export const STATUS_CUTI_LABELS: Record<StatusCuti, string> = {
  draft:               "Draft",
  submitted:           "Menunggu Atasan",
  approved_supervisor: "Disetujui Atasan",
  rejected_supervisor: "Ditolak Atasan",
  approved_hrd:        "Disetujui HRD",
  rejected_hrd:        "Ditolak HRD",
  cancelled:           "Dibatalkan",
}

export const STATUS_CUTI_BADGE: Record<StatusCuti, string> = {
  draft:               "secondary",
  submitted:           "warning",
  approved_supervisor: "info",
  rejected_supervisor: "destructive",
  approved_hrd:        "success",
  rejected_hrd:        "destructive",
  cancelled:           "secondary",
}

export const JABATAN_STAF = ["Staff", "Koordinator", "Bendahara", "Sekretaris", "All Karyawan"]
export const JABATAN_KEPALA = ["Kepala Divisi"]
export const JABATAN_MANAGER = ["Manager", "Ketua"]

/** Cek apakah jabatan memiliki hak sebagai atasan/approver level 1 */
export function isJabatanAtasan(jabatan: string): boolean {
  return [...JABATAN_KEPALA, ...JABATAN_MANAGER].some(j =>
    jabatan.toLowerCase().includes(j.toLowerCase())
  )
}

// ─── WorkingDayCalculatorService ─────────────────────────────────
/**
 * Hitung jumlah hari kerja antara tanggal_mulai dan tanggal_selesai
 * berdasarkan jadwal kerja karyawan dan hari libur.
 *
 * Hari yang dihitung sebagai hari kerja:
 * - Tanggal dalam rentang yang ada di jadwal_shifts karyawan
 * - DAN bukan hari libur
 *
 * Jika tidak ada jadwal kerja, hitungan default: semua hari kecuali Minggu & hari libur.
 */
export async function hitungHariKerja(
  karyawanId: bigint,
  tanggalMulai: Date,
  tanggalSelesai: Date,
): Promise<number> {
  if (tanggalSelesai < tanggalMulai) return 0

  // Ambil hari libur dalam rentang
  const hariLiburs = await prisma.hari_liburs.findMany({
    where: { tanggal: { gte: tanggalMulai, lte: tanggalSelesai } },
    select: { tanggal: true },
  })
  const liburSet = new Set(hariLiburs.map(l => {
    const d = l.tanggal instanceof Date ? l.tanggal : new Date(l.tanggal as string)
    return d.toISOString().slice(0, 10)
  }))

  // Ambil jadwal kerja karyawan dalam rentang
  const jadwals = await prisma.jadwal_shifts.findMany({
    where: {
      karyawan_id: karyawanId,
      tanggal: { gte: tanggalMulai, lte: tanggalSelesai },
    },
    select: { tanggal: true },
  })
  const jadwalSet = new Set(jadwals.map(j => {
    const d = j.tanggal instanceof Date ? j.tanggal : new Date(j.tanggal as string)
    return d.toISOString().slice(0, 10)
  }))

  // Iterasi setiap hari dalam rentang
  let count = 0
  const cur = new Date(tanggalMulai)
  while (cur <= tanggalSelesai) {
    const iso = cur.toISOString().slice(0, 10)
    const isLibur = liburSet.has(iso)

    if (!isLibur) {
      if (jadwalSet.size > 0) {
        // Ada jadwal → hanya hitung hari yg ada di jadwal
        if (jadwalSet.has(iso)) count++
      } else {
        // Tidak ada jadwal → hitung semua hari kecuali Minggu
        if (cur.getDay() !== 0) count++
      }
    }
    cur.setDate(cur.getDate() + 1)
  }
  return count
}

// ─── SupervisorResolverService ────────────────────────────────────
/**
 * Resolusi atasan langsung pegawai:
 * 1. Cek field `atasan_id` di tabel karyawans — jika ada, gunakan langsung.
 * 2. Fallback berdasarkan jabatan + divisi efektif:
 *    - Divisi efektif: ambil dari divisi_id langsung, atau dari subdivisi.divisi_id
 *    - Staff/Koordinator/dll → cari Kepala Divisi di divisi efektif yang sama
 *    - Kepala Divisi → cari Manager di divisi yang sama atau sistem
 *    - Manager/Ketua → null (langsung ke HRD)
 */
export async function resolveAtasan(karyawanId: bigint): Promise<{
  atasan: { id: bigint; nik: string; nama_karyawan: string; jabatan: string } | null
  level: "atasan" | "hrd"
}> {
  const karyawan = await prisma.karyawans.findUnique({
    where: { id: karyawanId },
    select: { id: true, jabatan: true, divisi_id: true, subdivisi_id: true, atasan_id: true },
  })
  if (!karyawan) return { atasan: null, level: "hrd" }

  // 1. Cek atasan_id langsung
  if (karyawan.atasan_id) {
    const atasan = await prisma.karyawans.findUnique({
      where: { id: karyawan.atasan_id },
      select: { id: true, nik: true, nama_karyawan: true, jabatan: true },
    })
    if (atasan) return { atasan, level: "atasan" }
  }

  // 2. Tentukan divisi efektif — dari divisi_id langsung, atau dari subdivisi → divisi
  let effectiveDivisiId: number | null = karyawan.divisi_id ?? null
  if (!effectiveDivisiId && karyawan.subdivisi_id) {
    const sub = await prisma.subdivisis.findUnique({
      where: { id: BigInt(karyawan.subdivisi_id) },
      select: { divisi_id: true },
    })
    effectiveDivisiId = sub?.divisi_id ?? null
  }

  // 3. Fallback: jabatan rules
  const jabatan = karyawan.jabatan ?? ""

  if (JABATAN_MANAGER.some(j => jabatan.toLowerCase().includes(j.toLowerCase()))) {
    // Manager → langsung HRD
    return { atasan: null, level: "hrd" }
  }

  if (JABATAN_KEPALA.some(j => jabatan.toLowerCase().includes(j.toLowerCase()))) {
    // Kepala Divisi → cari Manager di divisi yang sama atau di sistem (bukan diri sendiri)
    const manager = await prisma.karyawans.findFirst({
      where: {
        status_karyawan: "Aktif",
        jabatan: { in: JABATAN_MANAGER },
        NOT: { id: karyawanId },
        ...(effectiveDivisiId ? { divisi_id: effectiveDivisiId } : {}),
      },
      select: { id: true, nik: true, nama_karyawan: true, jabatan: true },
    })
    // Jika tidak ada Manager di divisi, cari di semua divisi
    if (manager) return { atasan: manager, level: "atasan" }
    const anyManager = await prisma.karyawans.findFirst({
      where: { status_karyawan: "Aktif", jabatan: { in: JABATAN_MANAGER }, NOT: { id: karyawanId } },
      select: { id: true, nik: true, nama_karyawan: true, jabatan: true },
    })
    return { atasan: anyManager ?? null, level: "atasan" }
  }

  // Staff/Koordinator dll → cari Kepala Divisi di divisi efektif yang sama
  if (effectiveDivisiId) {
    const kepala = await prisma.karyawans.findFirst({
      where: {
        status_karyawan: "Aktif",
        jabatan: { in: JABATAN_KEPALA },
        divisi_id: effectiveDivisiId,
        // Jangan kembalikan diri sendiri sebagai atasan
        NOT: { id: karyawanId },
      },
      select: { id: true, nik: true, nama_karyawan: true, jabatan: true },
    })
    if (kepala) return { atasan: kepala, level: "atasan" }
  }

  // Tidak ada atasan → langsung ke HRD
  return { atasan: null, level: "hrd" }
}

// ─── LeaveBalanceService ──────────────────────────────────────────
export async function getSaldoCuti(
  karyawanId: bigint,
  jenisCutiId: bigint,
  tahun: number,
): Promise<{ saldo_awal: number; saldo_terpakai: number; saldo_penyesuaian: number; saldo_sisa: number } | null> {
  const s = await prisma.saldo_cutis.findFirst({
    where: { karyawan_id: karyawanId, jenis_cuti_id: jenisCutiId, tahun },
  })
  if (!s) return null
  return {
    saldo_awal:         s.saldo_awal,
    saldo_terpakai:     s.saldo_terpakai,
    saldo_penyesuaian:  s.saldo_penyesuaian,
    saldo_sisa:         s.saldo_awal + s.saldo_penyesuaian - s.saldo_terpakai,
  }
}

/** Kurangi saldo cuti saat pengajuan disetujui */
export async function potongSaldoCuti(
  karyawanId: bigint,
  jenisCutiId: bigint,
  tahun: number,
  jumlahHari: number,
  tx?: DbClient,
): Promise<void> {
  const db = tx ?? prisma
  await db.saldo_cutis.updateMany({
    where: { karyawan_id: karyawanId, jenis_cuti_id: jenisCutiId, tahun },
    data: { saldo_terpakai: { increment: jumlahHari } },
  })
}

/** Kembalikan saldo cuti saat pengajuan ditolak/dibatalkan setelah HRD approve */
export async function kembalikanSaldoCuti(
  karyawanId: bigint,
  jenisCutiId: bigint,
  tahun: number,
  jumlahHari: number,
  tx?: DbClient,
): Promise<void> {
  const db = tx ?? prisma
  await db.saldo_cutis.updateMany({
    where: { karyawan_id: karyawanId, jenis_cuti_id: jenisCutiId, tahun },
    data: { saldo_terpakai: { decrement: jumlahHari } },
  })
}

// ─── LeaveApprovalService: Update Absensi setelah Approve HRD ────
/**
 * Setelah HRD menyetujui cuti, buat/update record absensi untuk setiap hari kerja
 * dalam rentang cuti dengan status_absensi = 'cuti'.
 */
export async function applyLeaveToAbsensi(
  karyawanId: bigint,
  tanggalMulai: Date,
  tanggalSelesai: Date,
  pengajuanCutiId: bigint,
  userId: bigint,
  tx?: DbClient,
): Promise<void> {
  const db = tx ?? prisma
  const hariLiburs = await db.hari_liburs.findMany({
    where: { tanggal: { gte: tanggalMulai, lte: tanggalSelesai } },
    select: { tanggal: true },
  })
  const liburSet = new Set(hariLiburs.map(l => {
    const d = l.tanggal instanceof Date ? l.tanggal : new Date(l.tanggal as string)
    return d.toISOString().slice(0, 10)
  }))

  const jadwals = await db.jadwal_shifts.findMany({
    where: { karyawan_id: karyawanId, tanggal: { gte: tanggalMulai, lte: tanggalSelesai } },
    select: { id: true, tanggal: true },
  })
  const jadwalMap = new Map(jadwals.map(j => {
    const d = j.tanggal instanceof Date ? j.tanggal : new Date(j.tanggal as string)
    return [d.toISOString().slice(0, 10), j.id]
  }))

  const now = new Date()
  const cur = new Date(tanggalMulai)
  while (cur <= tanggalSelesai) {
    const iso = cur.toISOString().slice(0, 10)
    if (!liburSet.has(iso)) {
      const jadwalShiftId = jadwalMap.get(iso) ?? null
      try {
        await db.absensi.upsert({
          where: { karyawan_id_tanggal_absensi: { karyawan_id: karyawanId, tanggal_absensi: new Date(cur) } },
          update: {
            status_absensi: "cuti",
            is_terlambat: false,
            is_pulang_cepat: false,
            is_tidak_absen_masuk: false,
            is_tidak_absen_pulang: false,
            is_manual:      false,
            alasan_manual:  `Cuti disetujui (ID: ${pengajuanCutiId})`,
            updated_by:     userId,
            updated_at:     now,
          },
          create: {
            karyawan_id:     karyawanId,
            jadwal_shift_id: jadwalShiftId,
            tanggal_absensi: new Date(cur),
            status_absensi:  "cuti",
            is_terlambat: false,
            is_pulang_cepat: false,
            is_tidak_absen_masuk: false,
            is_tidak_absen_pulang: false,
            is_manual:       false,
            alasan_manual:   `Cuti disetujui (ID: ${pengajuanCutiId})`,
            generated_at:    now,
            generated_by:    userId,
            created_by:      userId,
            updated_by:      userId,
            created_at:      now,
            updated_at:      now,
          },
        })
      } catch {
        // Jika gagal upsert satu tanggal, lanjutkan tanggal berikutnya
      }
    }
    cur.setDate(cur.getDate() + 1)
  }
}

/** Batalkan status cuti di absensi ketika pengajuan dibatalkan/ditolak setelah approved */
export async function revertLeaveFromAbsensi(
  karyawanId: bigint,
  tanggalMulai: Date,
  tanggalSelesai: Date,
  userId: bigint,
  tx?: DbClient,
): Promise<void> {
  const db = tx ?? prisma
  const now = new Date()
  const cur = new Date(tanggalMulai)
  while (cur <= tanggalSelesai) {
    await db.absensi.updateMany({
      where: {
        karyawan_id:     karyawanId,
        tanggal_absensi: new Date(cur),
        status_absensi:  "cuti",
        is_manual:       false,
      },
      data: {
        status_absensi: "alpha",
        is_terlambat: false,
        is_pulang_cepat: false,
        is_tidak_absen_masuk: true,
        is_tidak_absen_pulang: true,
        alasan_manual:  "Cuti dibatalkan/ditolak",
        updated_by:     userId,
        updated_at:     now,
      },
    })
    cur.setDate(cur.getDate() + 1)
  }
}

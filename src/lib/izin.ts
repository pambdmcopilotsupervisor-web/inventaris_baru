/**
 * lib/izin.ts
 *
 * Service library untuk fitur Izin Pegawai.
 * Menggunakan pola yang sama dengan lib/leave.ts (Cuti).
 */
import { prisma } from "@/lib/prisma"
import { resolveAtasan, isJabatanAtasan, JABATAN_MANAGER } from "@/lib/leave"
import type { Prisma } from "@prisma/client"

type DbClient = typeof prisma | Prisma.TransactionClient

// ─── Konstanta Status Izin ────────────────────────────────────────
export const STATUS_IZIN = {
  DRAFT:               "draft",
  SUBMITTED:           "submitted",
  APPROVED_SUPERVISOR: "approved_supervisor",
  REJECTED_SUPERVISOR: "rejected_supervisor",
  APPROVED_HRD:        "approved_hrd",
  REJECTED_HRD:        "rejected_hrd",
  CANCELLED:           "cancelled",
} as const

export type StatusIzin = typeof STATUS_IZIN[keyof typeof STATUS_IZIN]

export const STATUS_IZIN_LABELS: Record<StatusIzin, string> = {
  draft:               "Draft",
  submitted:           "Menunggu Atasan",
  approved_supervisor: "Disetujui Atasan",
  rejected_supervisor: "Ditolak Atasan",
  approved_hrd:        "Disetujui HRD",
  rejected_hrd:        "Ditolak HRD",
  cancelled:           "Dibatalkan",
}

export const STATUS_IZIN_BADGE: Record<StatusIzin, string> = {
  draft:               "secondary",
  submitted:           "warning",
  approved_supervisor: "info",
  rejected_supervisor: "destructive",
  approved_hrd:        "success",
  rejected_hrd:        "destructive",
  cancelled:           "secondary",
}

// ─── Helper: resolve atasan (reuse dari leave.ts) ─────────────────
export { resolveAtasan, isJabatanAtasan, JABATAN_MANAGER }

// ─── HRD Approver Check (sama dengan cuti) ────────────────────────
/** Level 2 (HRD) hanya bisa dilakukan oleh Kepala Divisi di divisi HRD/SDM, atau admin */
export async function isHrdApproverIzin(karyawanId: number | null, role: string): Promise<boolean> {
  const r = role.toLowerCase()
  if (r === "admin") return true
  if (!karyawanId) return false
  const k = await prisma.karyawans.findUnique({
    where: { id: BigInt(karyawanId) },
    select: { jabatan: true, divisi_id: true },
  })
  if (!k) return false
  // Harus Kepala Divisi (bukan Manager/Ketua)
  if (!k.jabatan?.toLowerCase().includes("kepala divisi")) return false
  if (!k.divisi_id) return false
  const divisi = await prisma.divisis.findUnique({ where: { id: BigInt(k.divisi_id) }, select: { nama_divisi: true } })
  const nama = divisi?.nama_divisi?.toLowerCase() ?? ""
  return nama.includes("hrd") || nama.includes("sdm") || nama.includes("personalia")
}

// ─── Hitung Durasi Izin ───────────────────────────────────────────
export function hitungDurasiIzin(
  tanggalMulai: Date,
  tanggalSelesai: Date,
  satuan: string,
  jamMulai?: string | null,
  jamSelesai?: string | null,
): number {
  if (satuan === "jam" && jamMulai && jamSelesai) {
    const [hm, mm] = jamMulai.split(":").map(Number)
    const [hs, ms] = jamSelesai.split(":").map(Number)
    const mulaiMenit  = hm * 60 + mm
    const selesaiMenit = hs * 60 + ms
    if (selesaiMenit <= mulaiMenit) return 0
    return (selesaiMenit - mulaiMenit) / 60 // dalam jam
  }
  // Hitung hari kalender
  const ms = tanggalSelesai.getTime() - tanggalMulai.getTime()
  return Math.floor(ms / (1000 * 60 * 60 * 24)) + 1
}

// ─── Integrasi Absensi ────────────────────────────────────────────
/**
 * Setelah HRD menyetujui izin, update/buat record absensi.
 * - Izin harian: status absensi = "izin"
 * - Izin jam (datang terlambat/pulang cepat): update keterangan di absensi, tidak ubah status jika sudah hadir
 * - Izin keluar kantor (memotong_absensi=false): tidak ubah status absensi
 */
export async function applyIzinToAbsensi(params: {
  karyawanId: bigint
  tanggalMulai: Date
  tanggalSelesai: Date
  satuan: string
  memotongAbsensi: boolean
  pengajuanIzinId: bigint
  userId: bigint
  tx?: DbClient
}): Promise<void> {
  const { karyawanId, tanggalMulai, tanggalSelesai, satuan, memotongAbsensi, pengajuanIzinId, userId } = params
  const db = params.tx ?? prisma

  if (!memotongAbsensi) return // Izin dinas luar/keluar kantor — tidak ubah status absensi

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
      const newStatus = satuan === "hari" ? "izin" : null // Hanya izin harian yang ganti status absensi

      if (newStatus) {
        try {
          await db.absensi.upsert({
            where: { karyawan_id_tanggal_absensi: { karyawan_id: karyawanId, tanggal_absensi: new Date(cur) } },
            update: {
              status_absensi: newStatus,
              is_terlambat: false,
              is_pulang_cepat: false,
              is_tidak_absen_masuk: false,
              is_tidak_absen_pulang: false,
              is_manual:      false,
              alasan_manual:  `Izin disetujui (ID: ${pengajuanIzinId})`,
              updated_by:     userId,
              updated_at:     now,
            },
            create: {
              karyawan_id:     karyawanId,
              jadwal_shift_id: jadwalShiftId,
              tanggal_absensi: new Date(cur),
              status_absensi:  newStatus,
              is_terlambat: false,
              is_pulang_cepat: false,
              is_tidak_absen_masuk: false,
              is_tidak_absen_pulang: false,
              is_manual:       false,
              alasan_manual:   `Izin disetujui (ID: ${pengajuanIzinId})`,
              generated_at:    now,
              generated_by:    userId,
              created_by:      userId,
              updated_by:      userId,
              created_at:      now,
              updated_at:      now,
            },
          })
        } catch { /* lanjutkan */ }
      }
    }
    cur.setDate(cur.getDate() + 1)
  }
}

/** Validasi overlap dengan cuti/izin/sakit yang sudah ada */
export async function checkIzinOverlap(
  karyawanId: bigint,
  tanggalMulai: Date,
  tanggalSelesai: Date,
  excludeId?: bigint,
): Promise<{ hasOverlap: boolean; message: string }> {
  const activeStatuses = [STATUS_IZIN.SUBMITTED, STATUS_IZIN.APPROVED_SUPERVISOR, STATUS_IZIN.APPROVED_HRD]

  const existing = await prisma.pengajuan_izins.findFirst({
    where: {
      karyawan_id:    karyawanId,
      status:         { in: activeStatuses },
      tanggal_mulai:  { lte: tanggalSelesai },
      tanggal_selesai: { gte: tanggalMulai },
      ...(excludeId ? { NOT: { id: excludeId } } : {}),
    },
    select: { id: true, tanggal_mulai: true, tanggal_selesai: true, jenis_izins: { select: { nama_izin: true } } },
  })

  if (existing) {
    const fmt = (d: Date) => d.toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" })
    return {
      hasOverlap: true,
      message: `Sudah ada izin ${existing.jenis_izins.nama_izin} pada rentang tanggal yang sama (${fmt(existing.tanggal_mulai)} – ${fmt(existing.tanggal_selesai)}).`,
    }
  }
  return { hasOverlap: false, message: "" }
}

/** Enrich izin_approvals dengan nama approver dari karyawans + users */
export async function enrichIzinApprovals(approvals: {
  id: number; approver_id: number | null; approver_user_id: number | null
  approver_role: string; approval_level: number; status: string
  note: string | null; approved_at: string | null
}[]) {
  const karyawanIds = approvals.map(a => a.approver_id).filter(Boolean) as number[]
  const karyawans = karyawanIds.length > 0
    ? await prisma.karyawans.findMany({ where: { id: { in: karyawanIds.map(id => BigInt(id)) } }, select: { id: true, nama_karyawan: true, jabatan: true } })
    : []
  const kMap = new Map(karyawans.map(k => [Number(k.id), k]))

  const userIds = approvals.map(a => a.approver_user_id).filter(Boolean) as number[]
  const users = userIds.length > 0
    ? await prisma.users.findMany({ where: { id: { in: userIds.map(id => BigInt(id)) } }, select: { id: true, name: true } })
    : []
  const uMap = new Map(users.map(u => [Number(u.id), u]))

  return approvals.map(a => ({
    ...a,
    approver_nama:      a.approver_id      ? (kMap.get(a.approver_id)?.nama_karyawan ?? null) : null,
    approver_jabatan:   a.approver_id      ? (kMap.get(a.approver_id)?.jabatan ?? null)       : null,
    diproses_oleh_nama: a.approver_user_id ? (uMap.get(a.approver_user_id)?.name ?? null)     : null,
  }))
}

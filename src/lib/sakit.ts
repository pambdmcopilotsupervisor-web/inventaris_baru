/**
 * lib/sakit.ts
 * Service library untuk fitur Sakit Pegawai.
 * Pola sama dengan lib/leave.ts (Cuti) dan lib/izin.ts (Izin).
 */
import { prisma } from "@/lib/prisma"
import { resolveAtasan, isJabatanAtasan, JABATAN_MANAGER } from "@/lib/leave"
import type { Prisma } from "@prisma/client"

type DbClient = typeof prisma | Prisma.TransactionClient

// ─── Konstanta Status Sakit ───────────────────────────────────────
export const STATUS_SAKIT = {
  DRAFT:               "draft",
  SUBMITTED:           "submitted",
  APPROVED_SUPERVISOR: "approved_supervisor",
  REJECTED_SUPERVISOR: "rejected_supervisor",
  APPROVED_HRD:        "approved_hrd",
  REJECTED_HRD:        "rejected_hrd",
  CANCELLED:           "cancelled",
} as const

export type StatusSakit = typeof STATUS_SAKIT[keyof typeof STATUS_SAKIT]

export const STATUS_SAKIT_LABELS: Record<StatusSakit, string> = {
  draft:               "Draft",
  submitted:           "Menunggu Atasan",
  approved_supervisor: "Disetujui Atasan",
  rejected_supervisor: "Ditolak Atasan",
  approved_hrd:        "Disetujui HRD",
  rejected_hrd:        "Ditolak HRD",
  cancelled:           "Dibatalkan",
}

export const STATUS_SAKIT_BADGE: Record<StatusSakit, string> = {
  draft:               "secondary",
  submitted:           "warning",
  approved_supervisor: "info",
  rejected_supervisor: "destructive",
  approved_hrd:        "success",
  rejected_hrd:        "destructive",
  cancelled:           "secondary",
}

// Reuse dari cuti/izin
export { resolveAtasan, isJabatanAtasan, JABATAN_MANAGER }

// ─── HRD Approver Check ───────────────────────────────────────────
/** Level 2 (HRD) hanya bisa dilakukan oleh Kepala Divisi di divisi HRD/SDM, atau admin */
export async function isHrdApproverSakit(karyawanId: number | null, role: string): Promise<boolean> {
  const r = role.toLowerCase()
  if (r === "admin") return true
  if (!karyawanId) return false
  const k = await prisma.karyawans.findUnique({
    where: { id: BigInt(karyawanId) },
    select: { jabatan: true, divisi_id: true },
  })
  if (!k) return false
  if (!k.jabatan?.toLowerCase().includes("kepala divisi")) return false
  if (!k.divisi_id) return false
  const divisi = await prisma.divisis.findUnique({ where: { id: BigInt(k.divisi_id) }, select: { nama_divisi: true } })
  const nama = divisi?.nama_divisi?.toLowerCase() ?? ""
  return nama.includes("hrd") || nama.includes("sdm") || nama.includes("personalia")
}

// ─── Hitung Jumlah Hari ───────────────────────────────────────────
export function hitungHariSakit(tanggalMulai: Date, tanggalSelesai: Date): number {
  if (tanggalSelesai < tanggalMulai) return 0
  const ms = tanggalSelesai.getTime() - tanggalMulai.getTime()
  return Math.floor(ms / (1000 * 60 * 60 * 24)) + 1
}

// ─── Integrasi Absensi ────────────────────────────────────────────
export async function applySakitToAbsensi(params: {
  karyawanId: bigint
  tanggalMulai: Date
  tanggalSelesai: Date
  pengajuanSakitId: bigint
  userId: bigint
  tx?: DbClient
}): Promise<void> {
  const { karyawanId, tanggalMulai, tanggalSelesai, pengajuanSakitId, userId } = params
  const db = params.tx ?? prisma

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
            status_absensi: "sakit",
            is_terlambat: false,
            is_pulang_cepat: false,
            is_tidak_absen_masuk: false,
            is_tidak_absen_pulang: false,
            is_manual:      false,
            alasan_manual:  `Sakit disetujui (ID: ${pengajuanSakitId})`,
            updated_by:     userId,
            updated_at:     now,
          },
          create: {
            karyawan_id:     karyawanId,
            jadwal_shift_id: jadwalShiftId,
            tanggal_absensi: new Date(cur),
            status_absensi:  "sakit",
            is_terlambat: false,
            is_pulang_cepat: false,
            is_tidak_absen_masuk: false,
            is_tidak_absen_pulang: false,
            is_manual:       false,
            alasan_manual:   `Sakit disetujui (ID: ${pengajuanSakitId})`,
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
    cur.setDate(cur.getDate() + 1)
  }
}

// ─── Validasi Overlap ─────────────────────────────────────────────
export async function checkSakitOverlap(
  karyawanId: bigint,
  tanggalMulai: Date,
  tanggalSelesai: Date,
  excludeId?: bigint,
): Promise<{ hasOverlap: boolean; message: string }> {
  const activeStatuses = [STATUS_SAKIT.SUBMITTED, STATUS_SAKIT.APPROVED_SUPERVISOR, STATUS_SAKIT.APPROVED_HRD]
  const existing = await prisma.pengajuan_sakits.findFirst({
    where: {
      karyawan_id:    karyawanId,
      status:         { in: activeStatuses },
      tanggal_mulai:  { lte: tanggalSelesai },
      tanggal_selesai: { gte: tanggalMulai },
      ...(excludeId ? { NOT: { id: excludeId } } : {}),
    },
    select: { id: true, tanggal_mulai: true, tanggal_selesai: true },
  })
  if (existing) {
    const fmt = (d: Date) => d.toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" })
    return {
      hasOverlap: true,
      message: `Sudah ada pengajuan sakit pada rentang tanggal yang sama (${fmt(existing.tanggal_mulai)} – ${fmt(existing.tanggal_selesai)}).`,
    }
  }
  return { hasOverlap: false, message: "" }
}

// ─── Enrich Approvals ────────────────────────────────────────────
export async function enrichSakitApprovals(approvals: {
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

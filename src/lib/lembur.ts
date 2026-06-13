/**
 * lib/lembur.ts
 *
 * Service library untuk fitur Lembur Pegawai.
 * Termasuk OvertimeCalculationService.
 */
import { prisma } from "@/lib/prisma"
import { resolveAtasan, isJabatanAtasan } from "@/lib/leave"

// ─── Konstanta Status Lembur ──────────────────────────────────────
export const STATUS_LEMBUR = {
  DRAFT:               "draft",
  SUBMITTED:           "submitted",
  APPROVED_SUPERVISOR: "approved_supervisor",
  REJECTED_SUPERVISOR: "rejected_supervisor",
  APPROVED_HRD:        "approved_hrd",
  REJECTED_HRD:        "rejected_hrd",
  CANCELLED:           "cancelled",
  REALIZED:            "realized",
} as const

export type StatusLembur = typeof STATUS_LEMBUR[keyof typeof STATUS_LEMBUR]

export const STATUS_LEMBUR_LABELS: Record<StatusLembur, string> = {
  draft:               "Draft",
  submitted:           "Menunggu Atasan",
  approved_supervisor: "Disetujui Atasan",
  rejected_supervisor: "Ditolak Atasan",
  approved_hrd:        "Disetujui HRD",
  rejected_hrd:        "Ditolak HRD",
  cancelled:           "Dibatalkan",
  realized:            "Terealisasi",
}

export const STATUS_LEMBUR_BADGE: Record<StatusLembur, string> = {
  draft:               "secondary",
  submitted:           "warning",
  approved_supervisor: "info",
  rejected_supervisor: "destructive",
  approved_hrd:        "success",
  rejected_hrd:        "destructive",
  cancelled:           "secondary",
  realized:            "success",
}

export const DEFAULT_MAX_DURASI_LEMBUR_MENIT = 8 * 60

// Reuse dari leave.ts
export { resolveAtasan, isJabatanAtasan }

// ─── HRD Approver Check ───────────────────────────────────────────
/** Level 2 (HRD) hanya bisa dilakukan oleh Kepala Divisi di divisi HRD/SDM, atau admin */
export async function isHrdApproverLembur(karyawanId: number | null, role: string): Promise<boolean> {
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

// ─── OvertimeCalculationService ──────────────────────────────────
export interface OvertimeSetting {
  id: bigint
  metode_perhitungan: string
  tarif_flat: number | string
  tarif_per_jam: number | string
  multiplier_jam_pertama: number | string
  multiplier_jam_berikutnya: number | string
  batas_minimal_menit_lembur: number
  pembulatan_menit: number
}

/** Hitung durasi lembur dalam menit dengan penanganan lintas hari */
export function hitungDurasiLembur(
  jamMulai: string,
  jamSelesai: string,
  lintasHari: boolean,
): number {
  const [hm, mm] = jamMulai.split(":").map(Number)
  const [hs, ms] = jamSelesai.split(":").map(Number)
  const menitMulai  = hm * 60 + mm
  let menitSelesai = hs * 60 + ms
  if (lintasHari && menitSelesai <= menitMulai) menitSelesai += 24 * 60
  return Math.max(0, menitSelesai - menitMulai)
}

function getMaxDurasiLemburMenit(): number {
  const value = Number(process.env.SDM_MAX_DURASI_LEMBUR_MENIT ?? DEFAULT_MAX_DURASI_LEMBUR_MENIT)
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_MAX_DURASI_LEMBUR_MENIT
}

function parseTimeMenit(time: string): number {
  const [h, m] = time.split(":").map(Number)
  return h * 60 + (m ?? 0)
}

function buildRange(jamMulai: string, jamSelesai: string, lintasHari: boolean): { start: number; end: number } {
  const start = parseTimeMenit(jamMulai)
  let end = parseTimeMenit(jamSelesai)
  if (lintasHari && end <= start) end += 24 * 60
  return { start, end }
}

function isOverlap(a: { start: number; end: number }, b: { start: number; end: number }): boolean {
  return a.start < b.end && b.start < a.end
}

export async function validateLemburEligibility(params: {
  karyawanId: bigint
  tanggal: Date
  jamMulai: string
  jamSelesai: string
  isLintasHari: boolean
  mode: "rencana" | "aktual"
}): Promise<{ valid: boolean; errors: string[]; durasiMenit: number }> {
  const errors: string[] = []
  const durasiMenit = hitungDurasiLembur(params.jamMulai, params.jamSelesai, params.isLintasHari)
  const maxDurasi = getMaxDurasiLemburMenit()

  if (durasiMenit <= 0) errors.push("Durasi lembur harus lebih dari 0 menit.")
  if (durasiMenit > maxDurasi) errors.push(`Durasi lembur maksimal ${Math.floor(maxDurasi / 60)} jam ${maxDurasi % 60} menit.`)

  const [cuti, izin, sakit] = await Promise.all([
    prisma.pengajuan_cutis.findFirst({
      where: { karyawan_id: params.karyawanId, status: { in: ["submitted", "approved_supervisor", "approved_hrd"] }, tanggal_mulai: { lte: params.tanggal }, tanggal_selesai: { gte: params.tanggal } },
      select: { id: true },
    }),
    prisma.pengajuan_izins.findFirst({
      where: { karyawan_id: params.karyawanId, status: { in: ["submitted", "approved_supervisor", "approved_hrd"] }, tanggal_mulai: { lte: params.tanggal }, tanggal_selesai: { gte: params.tanggal } },
      select: { id: true },
    }),
    prisma.pengajuan_sakits.findFirst({
      where: { karyawan_id: params.karyawanId, status: { in: ["submitted", "approved_supervisor", "approved_hrd"] }, tanggal_mulai: { lte: params.tanggal }, tanggal_selesai: { gte: params.tanggal } },
      select: { id: true },
    }),
  ])

  if (cuti) errors.push("Karyawan memiliki pengajuan cuti aktif pada tanggal lembur.")
  if (izin) errors.push("Karyawan memiliki pengajuan izin aktif pada tanggal lembur.")
  if (sakit) errors.push("Karyawan memiliki pengajuan sakit aktif pada tanggal lembur.")

  const [hariLibur, jadwal, absensi] = await Promise.all([
    prisma.hari_liburs.findFirst({ where: { tanggal: params.tanggal }, select: { id: true } }),
    prisma.jadwal_shifts.findFirst({
      where: { karyawan_id: params.karyawanId, tanggal: params.tanggal },
      include: { shift_kerjas: true },
    }),
    prisma.absensi.findFirst({ where: { karyawan_id: params.karyawanId, tanggal_absensi: params.tanggal } }),
  ])

  const isWeekend = [0, 6].includes(params.tanggal.getDay())
  if (!jadwal && !hariLibur && !isWeekend) {
    errors.push("Jadwal kerja belum dibuat untuk tanggal lembur.")
  }

  if (jadwal?.shift_kerjas) {
    const shiftRange = buildRange(jadwal.shift_kerjas.jam_masuk, jadwal.shift_kerjas.jam_pulang, jadwal.shift_kerjas.is_lintas_hari)
    const lemburRange = buildRange(params.jamMulai, params.jamSelesai, params.isLintasHari)
    if (isOverlap(lemburRange, shiftRange)) {
      errors.push("Jam lembur tidak boleh overlap dengan jam kerja normal pada jadwal shift.")
    }
  }

  if (absensi && ["cuti", "izin", "sakit", "alpha"].includes(absensi.status_absensi)) {
    errors.push(`Absensi tanggal lembur berstatus ${absensi.status_absensi}, tidak valid untuk lembur.`)
  }

  if (params.mode === "aktual" && jadwal) {
    if (!absensi) {
      errors.push("Absensi aktual belum tersedia untuk tanggal lembur.")
    } else if (!absensi.jam_masuk || !absensi.jam_pulang) {
      errors.push("Absensi aktual belum lengkap. Jam masuk dan jam pulang wajib ada sebelum realisasi lembur.")
    }
  }

  return { valid: errors.length === 0, errors, durasiMenit }
}

/** Bulatkan menit ke interval terdekat (15/30/60) */
export function bulatkanMenit(menit: number, interval: number): number {
  return Math.floor(menit / interval) * interval
}

/** OvertimeCalculationService — hitung uang lembur */
export function hitungUangLembur(params: {
  durasiMenit: number
  setting: OvertimeSetting
  tarifPerJamPegawai?: number | null
}): { totalUang: number; detail: object } {
  const { durasiMenit, setting } = params

  // Bulatkan durasi ke interval setting
  const durasi = bulatkanMenit(durasiMenit, setting.pembulatan_menit)
  const durasiJam = durasi / 60

  let totalUang = 0
  let detail: object = {}

  const metode = setting.metode_perhitungan

  if (metode === "flat") {
    totalUang = Number(setting.tarif_flat)
    detail = { metode: "flat", tarif_flat: totalUang }
  } else if (metode === "per_jam") {
    const tarif = params.tarifPerJamPegawai ?? Number(setting.tarif_per_jam)
    const jam1 = Math.min(durasiJam, 1)
    const jamBerikutnya = Math.max(0, durasiJam - 1)
    const uang1 = jam1 * tarif * Number(setting.multiplier_jam_pertama)
    const uang2 = jamBerikutnya * tarif * Number(setting.multiplier_jam_berikutnya)
    totalUang = uang1 + uang2
    detail = {
      metode: "per_jam",
      tarif_per_jam: tarif,
      durasi_jam: durasiJam,
      jam_pertama: { jam: jam1, multiplier: setting.multiplier_jam_pertama, uang: uang1 },
      jam_berikutnya: { jam: jamBerikutnya, multiplier: setting.multiplier_jam_berikutnya, uang: uang2 },
    }
  } else {
    // formula — default ke per_jam dengan gaji pokok
    const tarif = params.tarifPerJamPegawai ?? Number(setting.tarif_per_jam) ?? 0
    totalUang = durasiJam * tarif
    detail = { metode: "formula", tarif_dasar: tarif, durasi_jam: durasiJam }
  }

  return { totalUang: Math.round(totalUang), detail }
}

/** Deteksi tipe hari (hari_kerja / hari_libur / hari_raya) */
export async function deteksiTipeHari(tanggal: Date): Promise<"hari_kerja" | "hari_libur" | "hari_raya"> {
  const hariLibur = await prisma.hari_liburs.findFirst({ where: { tanggal } })
  if (hariLibur) {
    return hariLibur.tipe_libur === "Nasional" ? "hari_raya" : "hari_libur"
  }
  const dow = tanggal.getDay()
  if (dow === 0 || dow === 6) return "hari_libur"
  return "hari_kerja"
}

/** Ambil setting lembur yang sesuai tipe hari */
export async function getSettingLembur(tipeHari: string): Promise<OvertimeSetting | null> {
  const setting = await prisma.overtime_settings.findFirst({
    where: { tipe_hari: tipeHari, status: "aktif" },
    orderBy: { id: "asc" },
  })
  if (!setting) return null
  return {
    id: setting.id,
    metode_perhitungan: setting.metode_perhitungan,
    tarif_flat: setting.tarif_flat.toString(),
    tarif_per_jam: setting.tarif_per_jam.toString(),
    multiplier_jam_pertama: setting.multiplier_jam_pertama.toString(),
    multiplier_jam_berikutnya: setting.multiplier_jam_berikutnya.toString(),
    batas_minimal_menit_lembur: setting.batas_minimal_menit_lembur,
    pembulatan_menit: setting.pembulatan_menit,
  }
}

// ─── Enrich Approvals ────────────────────────────────────────────
export async function enrichLemburApprovals(approvals: {
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

// ─── Validasi Overlap ─────────────────────────────────────────────
export async function checkLemburOverlap(
  karyawanId: bigint,
  tanggal: Date,
  excludeId?: bigint,
): Promise<{ hasOverlap: boolean; message: string }> {
  const activeStatuses = [STATUS_LEMBUR.SUBMITTED, STATUS_LEMBUR.APPROVED_SUPERVISOR, STATUS_LEMBUR.APPROVED_HRD, STATUS_LEMBUR.REALIZED]
  const existing = await prisma.overtime_requests.findFirst({
    where: {
      karyawan_id:   karyawanId,
      tanggal_lembur: tanggal,
      status:        { in: activeStatuses },
      ...(excludeId ? { NOT: { id: excludeId } } : {}),
    },
    select: { id: true },
  })
  if (existing) {
    return {
      hasOverlap: true,
      message: `Sudah ada pengajuan lembur aktif pada tanggal yang sama.`,
    }
  }
  return { hasOverlap: false, message: "" }
}

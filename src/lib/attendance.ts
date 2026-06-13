/**
 * lib/attendance.ts
 *
 * Service logic untuk Absensi Pegawai:
 * - Konstanta status absensi
 * - Kalkulator keterlambatan, pulang cepat, total jam kerja
 * - Status resolver (dengan placeholder integrasi cuti/izin/sakit)
 */
import { prisma } from "@/lib/prisma"
import type { Prisma } from "@prisma/client"

type DbClient = typeof prisma | Prisma.TransactionClient

// ─── Konstanta Status Absensi ─────────────────────────────────────
export const STATUS_ABSENSI = {
  HADIR:             "hadir",
  TERLAMBAT:         "terlambat",
  PULANG_CEPAT:      "pulang_cepat",
  TIDAK_ABSEN_MASUK: "tidak_absen_masuk",
  TIDAK_ABSEN_PULANG:"tidak_absen_pulang",
  DI_LUAR_JAM_ABSEN: "di_luar_jam_absen",
  ALPHA:             "alpha",
  CUTI:              "cuti",
  IZIN:              "izin",
  SAKIT:             "sakit",
  LIBUR:             "libur",
} as const

export type StatusAbsensi = typeof STATUS_ABSENSI[keyof typeof STATUS_ABSENSI]

export const STATUS_ABSENSI_LABELS: Record<StatusAbsensi, string> = {
  hadir:              "Hadir",
  terlambat:          "Terlambat",
  pulang_cepat:       "Pulang Cepat",
  tidak_absen_masuk:  "Tidak Absen Masuk",
  tidak_absen_pulang: "Tidak Absen Pulang",
  di_luar_jam_absen:  "Di Luar Jam Absen",
  alpha:              "Alpha",
  cuti:               "Cuti",
  izin:               "Izin",
  sakit:              "Sakit",
  libur:              "Libur",
}

export const STATUS_ABSENSI_BADGE: Record<StatusAbsensi, string> = {
  hadir:              "success",
  terlambat:          "warning",
  pulang_cepat:       "warning",
  tidak_absen_masuk:  "info",
  tidak_absen_pulang: "info",
  di_luar_jam_absen:  "warning",
  alpha:              "destructive",
  cuti:               "secondary",
  izin:               "secondary",
  sakit:              "info",
  libur:              "secondary",
}

// ─── Parser waktu ─────────────────────────────────────────────────
/** Ubah string "HH:MM" atau "HH:MM:SS" menjadi menit sejak tengah malam */
export function parseTimeMenit(time: string): number {
  const parts = time.split(":").map(Number)
  return parts[0] * 60 + (parts[1] ?? 0)
}

/** Format menit → "HH:MM" */
export function formatMinutesToTime(menit: number): string {
  const h = Math.floor(Math.abs(menit) / 60)
  const m = Math.abs(menit) % 60
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
}

// ─── AttendanceCalculationService ────────────────────────────────
export interface ShiftInfo {
  jam_masuk: string
  jam_pulang: string
  toleransi_terlambat_menit: number
  is_lintas_hari: boolean
  batas_absen_masuk_mulai?: string | null
  batas_absen_masuk_selesai?: string | null
  batas_absen_pulang_mulai?: string | null
  batas_absen_pulang_selesai?: string | null
}

export interface HitungAbsensiParams {
  jam_masuk?:      string | null
  jam_pulang?:     string | null
  shift?:          ShiftInfo | null
  is_hari_libur?:  boolean
  has_cuti?:       boolean
  has_izin?:       boolean
  has_sakit?:      boolean
}

export interface HitungAbsensiResult {
  status_absensi:        StatusAbsensi
  is_terlambat:          boolean
  is_pulang_cepat:       boolean
  is_tidak_absen_masuk:  boolean
  is_tidak_absen_pulang: boolean
  menit_terlambat:       number
  menit_pulang_cepat:    number
  total_jam_kerja_menit: number
}

function buildResult(params: {
  status_absensi: StatusAbsensi
  menit_terlambat?: number
  menit_pulang_cepat?: number
  total_jam_kerja_menit?: number
  is_tidak_absen_masuk?: boolean
  is_tidak_absen_pulang?: boolean
}): HitungAbsensiResult {
  const menit_terlambat = params.menit_terlambat ?? 0
  const menit_pulang_cepat = params.menit_pulang_cepat ?? 0

  return {
    status_absensi: params.status_absensi,
    is_terlambat: menit_terlambat > 0,
    is_pulang_cepat: menit_pulang_cepat > 0,
    is_tidak_absen_masuk: params.is_tidak_absen_masuk ?? false,
    is_tidak_absen_pulang: params.is_tidak_absen_pulang ?? false,
    menit_terlambat,
    menit_pulang_cepat,
    total_jam_kerja_menit: params.total_jam_kerja_menit ?? 0,
  }
}

function isWithinTimeWindow(time: string, start?: string | null, end?: string | null): boolean {
  if (!start && !end) return true

  const timeMenit = parseTimeMenit(time)
  const startMenit = start ? parseTimeMenit(start) : 0
  const endMenit = end ? parseTimeMenit(end) : 24 * 60 - 1

  if (startMenit <= endMenit) return timeMenit >= startMenit && timeMenit <= endMenit
  return timeMenit >= startMenit || timeMenit <= endMenit
}

/**
 * AttendanceStatusResolverService + AttendanceCalculationService
 *
 * Menentukan status dan kalkulasi metrik absensi berdasarkan:
 * - jam aktual masuk/pulang
 * - data shift
 * - status hari libur
 * - status cuti/izin/sakit (via placeholder)
 */
export function hitungAbsensi(params: HitungAbsensiParams): HitungAbsensiResult {
  const { jam_masuk, jam_pulang, shift, is_hari_libur, has_cuti, has_izin, has_sakit } = params

  const zero = buildResult({ status_absensi: STATUS_ABSENSI.ALPHA })

  // ── 1. Placeholder integrasi cuti/izin/sakit ──────────────────
  if (has_cuti)  return { ...zero, status_absensi: STATUS_ABSENSI.CUTI }
  if (has_izin)  return { ...zero, status_absensi: STATUS_ABSENSI.IZIN }
  if (has_sakit) return { ...zero, status_absensi: STATUS_ABSENSI.SAKIT }

  // ── 2. Hari libur — prioritas tinggi (kecuali ada absensi aktual) ────
  // Jika hari libur DAN karyawan tidak hadir (tidak ada jam_masuk/pulang)
  // → status "libur" terlepas ada jadwal atau tidak
  if (is_hari_libur && !jam_masuk && !jam_pulang) {
    return { ...zero, status_absensi: STATUS_ABSENSI.LIBUR }
  }

  // ── 3. Tidak ada jadwal dan tidak ada jam masuk/pulang ────────
  if (!shift) {
    if (!jam_masuk && !jam_pulang) return { ...zero, status_absensi: STATUS_ABSENSI.ALPHA }
    // Ada jam masuk/pulang tapi tidak ada jadwal → hadir tanpa shift
    let total_jam_kerja_menit = 0
    if (jam_masuk && jam_pulang) {
      const m = parseTimeMenit(jam_masuk)
      let  p = parseTimeMenit(jam_pulang)
      if (p < m) p += 24 * 60 // overnight
      total_jam_kerja_menit = Math.max(0, p - m)
    }
    return buildResult({ status_absensi: STATUS_ABSENSI.HADIR, total_jam_kerja_menit })
  }

  // ── 4. Ada shift ──────────────────────────────────────────────
  const shiftMasukMenit = parseTimeMenit(shift.jam_masuk)
  let   shiftPulangMenit = parseTimeMenit(shift.jam_pulang)
  if (shift.is_lintas_hari && shiftPulangMenit <= shiftMasukMenit) {
    shiftPulangMenit += 24 * 60
  }
  const batasMasukMenit = shiftMasukMenit + shift.toleransi_terlambat_menit

  // Tidak ada jam masuk DAN pulang → alpha
  if (!jam_masuk && !jam_pulang) {
    return buildResult({ status_absensi: STATUS_ABSENSI.ALPHA, is_tidak_absen_masuk: true, is_tidak_absen_pulang: true })
  }
  // Tidak ada jam masuk saja
  if (!jam_masuk) {
    return buildResult({ status_absensi: STATUS_ABSENSI.TIDAK_ABSEN_MASUK, is_tidak_absen_masuk: true })
  }
  // Tidak ada jam pulang saja
  if (!jam_pulang) {
    if (!isWithinTimeWindow(jam_masuk, shift.batas_absen_masuk_mulai, shift.batas_absen_masuk_selesai)) {
      return buildResult({ status_absensi: STATUS_ABSENSI.DI_LUAR_JAM_ABSEN, is_tidak_absen_pulang: true })
    }
    return buildResult({ status_absensi: STATUS_ABSENSI.TIDAK_ABSEN_PULANG, is_tidak_absen_pulang: true })
  }

  // ── 5. Ada jam masuk dan pulang → kalkulasi penuh ─────────────
  const aktualMasukMenit  = parseTimeMenit(jam_masuk)
  let   aktualPulangMenit = parseTimeMenit(jam_pulang)

  // Tangani overnight (lintas hari)
  if (shift.is_lintas_hari && aktualPulangMenit <= aktualMasukMenit) {
    aktualPulangMenit += 24 * 60
  } else if (!shift.is_lintas_hari && aktualPulangMenit < aktualMasukMenit) {
    aktualPulangMenit += 24 * 60 // pulang melewati tengah malam tanpa flag lintas hari
  }

  const total_jam_kerja_menit = Math.max(0, aktualPulangMenit - aktualMasukMenit)
  const menit_terlambat       = Math.max(0, aktualMasukMenit - batasMasukMenit)
  const menit_pulang_cepat    = Math.max(0, shiftPulangMenit - aktualPulangMenit)
  const isDiLuarWindow =
    !isWithinTimeWindow(jam_masuk, shift.batas_absen_masuk_mulai, shift.batas_absen_masuk_selesai) ||
    !isWithinTimeWindow(jam_pulang, shift.batas_absen_pulang_mulai, shift.batas_absen_pulang_selesai)

  let status_absensi: StatusAbsensi
  if      (isDiLuarWindow)         status_absensi = STATUS_ABSENSI.DI_LUAR_JAM_ABSEN
  else if (menit_terlambat > 0)    status_absensi = STATUS_ABSENSI.TERLAMBAT
  else if (menit_pulang_cepat > 0) status_absensi = STATUS_ABSENSI.PULANG_CEPAT
  else                             status_absensi = STATUS_ABSENSI.HADIR

  return buildResult({ status_absensi, menit_terlambat, menit_pulang_cepat, total_jam_kerja_menit })
}

// ─── Placeholder IntegrationService ──────────────────────────────
// Fungsi-fungsi ini akan dihubungkan ke modul cuti/izin/sakit
// saat modul tersebut selesai dibuat.

/** LeaveIntegrationService — cek apakah karyawan memiliki cuti approved pada tanggal tersebut */
export async function checkCutiApproved(
  karyawanId: bigint,
  tanggal: Date,
  tx?: DbClient,
): Promise<boolean> {
  try {
    const db = tx ?? prisma
    const count = await db.pengajuan_cutis.count({
      where: {
        karyawan_id:    karyawanId,
        status:         "approved_hrd",
        tanggal_mulai:  { lte: tanggal },
        tanggal_selesai: { gte: tanggal },
      },
    })
    return count > 0
  } catch {
    return false
  }
}

/** PermissionIntegrationService — cek apakah karyawan memiliki izin approved pada tanggal tersebut */
export async function checkIzinApproved(
  karyawanId: bigint,
  tanggal: Date,
  tx?: DbClient,
): Promise<boolean> {
  try {
    const db = tx ?? prisma
    const count = await db.pengajuan_izins.count({
      where: {
        karyawan_id:    karyawanId,
        status:         "approved_hrd",
        satuan_durasi:  "hari", // hanya izin harian yang mengubah status absensi
        tanggal_mulai:  { lte: tanggal },
        tanggal_selesai: { gte: tanggal },
      },
    })
    return count > 0
  } catch {
    return false
  }
}

/** SickIntegrationService — cek apakah karyawan memiliki surat sakit approved pada tanggal tersebut */
export async function checkSakitApproved(
  karyawanId: bigint,
  tanggal: Date,
  tx?: DbClient,
): Promise<boolean> {
  try {
    const db = tx ?? prisma
    const count = await db.pengajuan_sakits.count({
      where: {
        karyawan_id:    karyawanId,
        status:         "approved_hrd",
        tanggal_mulai:  { lte: tanggal },
        tanggal_selesai: { gte: tanggal },
      },
    })
    return count > 0
  } catch {
    return false
  }
}

/** Resolve semua status leave sekaligus (efisien — satu panggilan) */
export async function resolveLeaveStatus(
  karyawanId: bigint,
  tanggal: Date,
  tx?: DbClient,
): Promise<{ has_cuti: boolean; has_izin: boolean; has_sakit: boolean }> {
  const [has_cuti, has_izin, has_sakit] = await Promise.all([
    checkCutiApproved(karyawanId, tanggal, tx),
    checkIzinApproved(karyawanId, tanggal, tx),
    checkSakitApproved(karyawanId, tanggal, tx),
  ])
  return { has_cuti, has_izin, has_sakit }
}

/** Hitung ulang absensi non-manual dalam rentang tanggal setelah pengajuan dibatalkan */
export async function recalculateAbsensiForRange(params: {
  karyawanId: bigint
  tanggalMulai: Date
  tanggalSelesai: Date
  userId: bigint
  onlyStatus?: StatusAbsensi
  alasanManual?: string
  tx?: DbClient
}): Promise<void> {
  const db = params.tx ?? prisma
  const now = new Date()
  const cur = new Date(params.tanggalMulai)

  while (cur <= params.tanggalSelesai) {
    const tanggalAbsensi = new Date(cur)
    const existing = await db.absensi.findFirst({
      where: {
        karyawan_id: params.karyawanId,
        tanggal_absensi: tanggalAbsensi,
        is_manual: false,
        ...(params.onlyStatus ? { status_absensi: params.onlyStatus } : {}),
      },
      include: { jadwal_shifts: { include: { shift_kerjas: true } } },
    })

    if (existing) {
      const jadwal = existing.jadwal_shifts ?? await db.jadwal_shifts.findFirst({
        where: { karyawan_id: params.karyawanId, tanggal: tanggalAbsensi },
        include: { shift_kerjas: true },
      })
      const hariLibur = await db.hari_liburs.findFirst({ where: { tanggal: tanggalAbsensi } })
      const leaveStatus = await resolveLeaveStatus(params.karyawanId, tanggalAbsensi, db)
      const calculated = hitungAbsensi({
        jam_masuk: existing.jam_masuk,
        jam_pulang: existing.jam_pulang,
        shift: jadwal?.shift_kerjas ?? null,
        is_hari_libur: !!hariLibur,
        ...leaveStatus,
      })

      await db.absensi.update({
        where: { id: existing.id },
        data: {
          jadwal_shift_id: jadwal?.id ?? existing.jadwal_shift_id,
          status_absensi: calculated.status_absensi,
          is_terlambat: calculated.is_terlambat,
          is_pulang_cepat: calculated.is_pulang_cepat,
          is_tidak_absen_masuk: calculated.is_tidak_absen_masuk,
          is_tidak_absen_pulang: calculated.is_tidak_absen_pulang,
          menit_terlambat: calculated.menit_terlambat,
          menit_pulang_cepat: calculated.menit_pulang_cepat,
          total_jam_kerja_menit: calculated.total_jam_kerja_menit,
          alasan_manual: params.alasanManual ?? null,
          updated_by: params.userId,
          updated_at: now,
        },
      })
    }

    cur.setDate(cur.getDate() + 1)
  }
}

export interface RecalculateAbsensiParams {
  karyawanIds: bigint[]
  tanggalMulai: Date
  tanggalSelesai: Date
  userId: bigint
  forceManual?: boolean
  createMissing?: boolean
  includeTanpaJadwal?: boolean
}

export interface RecalculateAbsensiResult {
  dibuat: number
  diperbarui: number
  dilewati: number
  total_target: number
  total_tanggal: number
}

export async function recalculateAbsensi(params: RecalculateAbsensiParams): Promise<RecalculateAbsensiResult> {
  const now = new Date()
  const result: RecalculateAbsensiResult = {
    dibuat: 0,
    diperbarui: 0,
    dilewati: 0,
    total_target: params.karyawanIds.length,
    total_tanggal: 0,
  }

  const tanggals: Date[] = []
  const cur = new Date(params.tanggalMulai)
  while (cur <= params.tanggalSelesai) {
    tanggals.push(new Date(cur))
    cur.setDate(cur.getDate() + 1)
  }
  result.total_tanggal = tanggals.length

  for (const karyawanId of params.karyawanIds) {
    for (const tanggalAbsensi of tanggals) {
      const [existing, jadwal, hariLibur, leaveStatus] = await Promise.all([
        prisma.absensi.findFirst({ where: { karyawan_id: karyawanId, tanggal_absensi: tanggalAbsensi } }),
        prisma.jadwal_shifts.findFirst({ where: { karyawan_id: karyawanId, tanggal: tanggalAbsensi }, include: { shift_kerjas: true } }),
        prisma.hari_liburs.findFirst({ where: { tanggal: tanggalAbsensi } }),
        resolveLeaveStatus(karyawanId, tanggalAbsensi),
      ])

      if (existing?.is_manual && !params.forceManual) {
        result.dilewati++
        continue
      }

      if (!existing && !params.createMissing) {
        result.dilewati++
        continue
      }

      if (!existing && !jadwal && !params.includeTanpaJadwal && !leaveStatus.has_cuti && !leaveStatus.has_izin && !leaveStatus.has_sakit) {
        result.dilewati++
        continue
      }

      const calculated = hitungAbsensi({
        jam_masuk: existing?.jam_masuk ?? null,
        jam_pulang: existing?.jam_pulang ?? null,
        shift: jadwal?.shift_kerjas ?? null,
        is_hari_libur: !!hariLibur,
        ...leaveStatus,
      })

      if (existing) {
        await prisma.absensi.update({
          where: { id: existing.id },
          data: {
            jadwal_shift_id: jadwal?.id ?? existing.jadwal_shift_id,
            status_absensi: calculated.status_absensi,
            is_terlambat: calculated.is_terlambat,
            is_pulang_cepat: calculated.is_pulang_cepat,
            is_tidak_absen_masuk: calculated.is_tidak_absen_masuk,
            is_tidak_absen_pulang: calculated.is_tidak_absen_pulang,
            menit_terlambat: calculated.menit_terlambat,
            menit_pulang_cepat: calculated.menit_pulang_cepat,
            total_jam_kerja_menit: calculated.total_jam_kerja_menit,
            is_manual: params.forceManual ? false : existing.is_manual,
            alasan_manual: params.forceManual ? "Dihitung ulang oleh HRD/Admin" : existing.alasan_manual,
            generated_at: now,
            generated_by: params.userId,
            updated_by: params.userId,
            updated_at: now,
          },
        })
        result.diperbarui++
      } else {
        await prisma.absensi.create({
          data: {
            karyawan_id: karyawanId,
            jadwal_shift_id: jadwal?.id ?? null,
            tanggal_absensi: tanggalAbsensi,
            jam_masuk: null,
            jam_pulang: null,
            status_absensi: calculated.status_absensi,
            is_terlambat: calculated.is_terlambat,
            is_pulang_cepat: calculated.is_pulang_cepat,
            is_tidak_absen_masuk: calculated.is_tidak_absen_masuk,
            is_tidak_absen_pulang: calculated.is_tidak_absen_pulang,
            menit_terlambat: calculated.menit_terlambat,
            menit_pulang_cepat: calculated.menit_pulang_cepat,
            total_jam_kerja_menit: calculated.total_jam_kerja_menit,
            is_manual: false,
            generated_at: now,
            generated_by: params.userId,
            created_by: params.userId,
            updated_by: params.userId,
            created_at: now,
            updated_at: now,
          },
        })
        result.dibuat++
      }
    }
  }

  return result
}

// ─── AttendanceReportService helpers ─────────────────────────────
export interface RekapAbsensi {
  total_hari_kerja:       number
  total_hadir:            number
  total_terlambat:        number
  total_pulang_cepat:     number
  total_alpha:            number
  total_tidak_absen_masuk: number
  total_tidak_absen_pulang: number
  total_di_luar_jam_absen: number
  total_cuti:             number
  total_izin:             number
  total_sakit:            number
  total_libur:            number
  total_menit_terlambat:  number
  total_menit_pulang_cepat: number
  total_jam_kerja_menit:  number
}

export function hitungRekap(absensiList: {
  status_absensi: string
  is_terlambat?: boolean
  is_pulang_cepat?: boolean
  is_tidak_absen_masuk?: boolean
  is_tidak_absen_pulang?: boolean
  menit_terlambat: number
  menit_pulang_cepat: number
  total_jam_kerja_menit: number
}[]): RekapAbsensi {
  const rekap: RekapAbsensi = {
    total_hari_kerja: absensiList.length,
    total_hadir: 0, total_terlambat: 0, total_pulang_cepat: 0,
    total_alpha: 0, total_tidak_absen_masuk: 0, total_tidak_absen_pulang: 0,
    total_di_luar_jam_absen: 0, total_cuti: 0, total_izin: 0, total_sakit: 0, total_libur: 0,
    total_menit_terlambat: 0, total_menit_pulang_cepat: 0, total_jam_kerja_menit: 0,
  }
  for (const a of absensiList) {
    switch (a.status_absensi) {
      case "hadir":              rekap.total_hadir++;             break
      case "di_luar_jam_absen":  rekap.total_di_luar_jam_absen++; break
      case "alpha":              rekap.total_alpha++;             break
      case "cuti":               rekap.total_cuti++;              break
      case "izin":               rekap.total_izin++;              break
      case "sakit":              rekap.total_sakit++;             break
      case "libur":              rekap.total_libur++;             break
    }
    if (a.is_terlambat ?? a.status_absensi === "terlambat") rekap.total_terlambat++
    if (a.is_pulang_cepat ?? a.status_absensi === "pulang_cepat") rekap.total_pulang_cepat++
    if (a.is_tidak_absen_masuk ?? a.status_absensi === "tidak_absen_masuk") rekap.total_tidak_absen_masuk++
    if (a.is_tidak_absen_pulang ?? a.status_absensi === "tidak_absen_pulang") rekap.total_tidak_absen_pulang++
    rekap.total_menit_terlambat   += a.menit_terlambat
    rekap.total_menit_pulang_cepat += a.menit_pulang_cepat
    rekap.total_jam_kerja_menit   += a.total_jam_kerja_menit
  }
  return rekap
}

/**
 * Rekap kehadiran untuk slip — tipe & summarizer bersama.
 * Dipakai payroll-run (untuk snapshot saat hitung) dan slip-data (fallback).
 */

export interface AttendanceSummary {
  working_days: number
  hadir: number
  alfa: number
  terlambat: number
  ijin: number
  sakit: number
  cuti: number
}

export interface AbsensiRow {
  status_absensi: string | null
  is_terlambat: boolean
}

/** Hitung rekap kehadiran dari baris absensi periode. */
export function summarizeAbsensi(rows: AbsensiRow[], workingDaysFallback: number): AttendanceSummary {
  let working = 0, hadir = 0, alfa = 0, terlambat = 0, ijin = 0, sakit = 0, cuti = 0
  for (const r of rows) {
    const s = (r.status_absensi ?? "").toLowerCase()
    if (s === "libur") continue
    working++
    if (s === "alpha") alfa++
    else if (s === "izin") ijin++
    else if (s === "sakit") sakit++
    else if (s === "cuti") cuti++
    else hadir++
    if (r.is_terlambat) terlambat++
  }
  return { working_days: working || workingDaysFallback, hadir, alfa, terlambat, ijin, sakit, cuti }
}

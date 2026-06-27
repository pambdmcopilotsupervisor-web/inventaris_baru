/**
 * Pembangun data slip gaji — SEMUA nilai moneter berasal dari snapshot
 * payroll_slip_details (audit trail), bukan kalkulasi ulang.
 *
 * Catatan: nama/jabatan/departemen karyawan diambil via relasi karyawans
 * (schema payroll_slips tidak menyimpan snapshot identitas). Rekap kehadiran
 * (jumlah hari) bersifat informasional dan dibangun ulang dari tabel `absensi`.
 */
import { prisma } from "@/lib/prisma"
import { terbilangRupiah } from "@/lib/payroll/terbilang"
import { summarizeAbsensi, type AttendanceSummary } from "@/lib/payroll/attendance"

export type { AttendanceSummary }

const MONTHS = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
]

export interface SlipDetailLine {
  no: number
  component_code: string
  component_name: string
  category: string
  basis_value: number
  quantity: number
  amount: number
  notes: string | null
}

export interface SlipData {
  slip_id: number
  slip_number: string
  period: { month: number; year: number; label: string; start_date: string; end_date: string; range_label: string }
  status: string
  employee: { id: number; nama: string; nik: string; jabatan: string; department: string }
  earnings: SlipDetailLine[]
  deductions: SlipDetailLine[]
  total_earnings: number
  total_deductions: number
  net_salary: number
  net_salary_terbilang: string
  attendance: AttendanceSummary
  tax_detail: TaxDetailSnapshot | null
  meta: {
    run_type: string
    tax_method: string | null
    prorata_factor: number
    prorata_note: string | null
  }
}

export interface TaxDetailSnapshot {
  bpjs: {
    lines: { kode: string; nama: string; base: number; employee_amount: number; employer_amount: number }[]
    total_employee: number
    total_employer: number
  } | null
  pph21: {
    pph_month: number
    bruto_month: number
    biaya_jabatan_month: number
    netto_month: number
    netto_year: number
    pkp_year: number
    pph_year: number
    npwp_surcharge_applied: boolean
  } | null
}

/** Selisih hari kalender (b − a), berbasis tanggal lokal. */
function dayDiffSlip(a: Date, b: Date): number {
  const ms = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())
  return Math.round(ms / 86400000)
}

/** Hitung faktor prorata & keterangan dari tanggal masuk/keluar (untuk info slip), berbasis rentang periode. */
function computeProrataInfo(joinDate: Date | null, exitDate: Date | null, periodStart: Date, periodEnd: Date): { factor: number; note: string | null } {
  const totalDays = dayDiffSlip(periodStart, periodEnd) + 1
  if (totalDays <= 0) return { factor: 1, note: null }
  let activeStart = periodStart
  let activeEnd = periodEnd
  let reason: string | null = null
  const fmt = (d: Date) => `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`

  if (joinDate) {
    const j = new Date(joinDate)
    if (dayDiffSlip(periodEnd, j) > 0) return { factor: 0, note: "Belum aktif pada periode ini" }
    if (dayDiffSlip(periodStart, j) > 0) { activeStart = j; reason = `masuk ${fmt(j)}` }
  }
  if (exitDate) {
    const x = new Date(exitDate)
    if (dayDiffSlip(x, periodStart) > 0) return { factor: 0, note: "Sudah keluar sebelum periode ini" }
    if (dayDiffSlip(x, periodEnd) > 0) { activeEnd = x; reason = `keluar ${fmt(x)}` }
  }
  const activeDays = dayDiffSlip(activeStart, activeEnd) + 1
  if (activeDays <= 0) return { factor: 0, note: reason }
  if (activeDays >= totalDays) return { factor: 1, note: null }
  const factor = activeDays / totalDays
  return { factor, note: `Prorata ${Math.round(factor * 100)}% (${activeDays}/${totalDays} hari${reason ? `, ${reason}` : ""})` }
}

async function resolveDepartment(divisiId: number | null, subdivisiId: number | null): Promise<string> {
  if (subdivisiId) {
    const sub = await prisma.subdivisis.findUnique({ where: { id: BigInt(subdivisiId) }, select: { nama_sub: true, divisi_id: true } })
    if (sub) {
      const div = await prisma.divisis.findUnique({ where: { id: BigInt(sub.divisi_id) }, select: { nama_divisi: true } })
      return div?.nama_divisi ?? sub.nama_sub
    }
  }
  if (divisiId) {
    const div = await prisma.divisis.findUnique({ where: { id: BigInt(divisiId) }, select: { nama_divisi: true } })
    return div?.nama_divisi ?? "—"
  }
  return "—"
}

async function buildAttendanceSummary(employeeId: bigint, periodStart: Date, periodEnd: Date, workingDaysFallback: number): Promise<AttendanceSummary> {
  const firstDay = new Date(periodStart.getFullYear(), periodStart.getMonth(), periodStart.getDate())
  const lastDay = new Date(periodEnd.getFullYear(), periodEnd.getMonth(), periodEnd.getDate(), 23, 59, 59)
  const rows = await prisma.absensi.findMany({
    where: { karyawan_id: employeeId, tanggal_absensi: { gte: firstDay, lte: lastDay } },
    select: { status_absensi: true, is_terlambat: true },
  })
  return summarizeAbsensi(rows, workingDaysFallback)
}

/**
 * Bangun data slip gaji dari snapshot. Mengembalikan null jika slip tidak ada.
 */
export async function buildSlipData(slipId: number): Promise<SlipData | null> {
  const slip = await prisma.payroll_slips.findUnique({
    where: { id: BigInt(slipId) },
    include: {
      payroll_periods: { select: { id: true, period_month: true, period_year: true, run_type: true, period_start_date: true, period_end_date: true } },
      karyawans: { select: { id: true, nik: true, nama_karyawan: true, jabatan: true, divisi_id: true, subdivisi_id: true, tanggal_masuk_kerja: true, tanggal_keluar: true } },
      details: { orderBy: { sort_order: "asc" } },
    },
  })
  if (!slip) return null

  const month = slip.payroll_periods.period_month
  const year = slip.payroll_periods.period_year
  // Rentang tanggal aktual (fallback 1..akhir bulan untuk periode lama).
  const periodStart = slip.payroll_periods.period_start_date ? new Date(slip.payroll_periods.period_start_date) : new Date(year, month - 1, 1)
  const periodEnd = slip.payroll_periods.period_end_date ? new Date(slip.payroll_periods.period_end_date) : new Date(year, month, 0)

  // Nomor slip: gunakan yang permanen bila ada; fallback hitung dari urutan id (slip lama).
  let slipNumber = slip.slip_number ?? ""
  if (!slipNumber) {
    const periodSlipIds = await prisma.payroll_slips.findMany({
      where: { payroll_period_id: slip.payroll_period_id },
      select: { id: true },
      orderBy: { id: "asc" },
    })
    const seq = periodSlipIds.findIndex((s) => s.id === slip.id) + 1
    slipNumber = `SLIP/${year}/${String(month).padStart(2, "0")}/${String(seq).padStart(3, "0")}`
  }

  const department = await resolveDepartment(slip.karyawans.divisi_id, slip.karyawans.subdivisi_id)
  // Kehadiran: utamakan snapshot (dibekukan saat hitung); fallback rebuild untuk slip lama.
  const attendance: AttendanceSummary = (slip.attendance_snapshot as AttendanceSummary | null)
    ?? await buildAttendanceSummary(slip.employee_id, periodStart, periodEnd, slip.working_days)

  const earnings: SlipDetailLine[] = []
  const deductions: SlipDetailLine[] = []
  for (const d of slip.details) {
    const line: SlipDetailLine = {
      no: 0,
      component_code: d.component_code,
      component_name: d.component_name,
      category: d.category,
      basis_value: Number(d.basis_value),
      quantity: Number(d.quantity),
      amount: Number(d.amount),
      notes: d.notes,
    }
    if (d.type === "EARNING") earnings.push(line)
    else deductions.push(line)
  }
  earnings.forEach((l, i) => (l.no = i + 1))
  deductions.forEach((l, i) => (l.no = i + 1))

  const net = Number(slip.net_salary)

  // Metadata: metode pajak (dari konfigurasi) & info prorata (dihitung dari tanggal masuk/keluar).
  const taxConfig = await prisma.payroll_tax_configs.findFirst({ select: { metode_pph21: true } })
  const taxMethod = slip.tax_detail ? (taxConfig?.metode_pph21 === "TER" ? "TER (PP 58/2023)" : "Progresif") : null

  const { factor: prorataFactor, note: prorataNote } = computeProrataInfo(
    slip.karyawans.tanggal_masuk_kerja, slip.karyawans.tanggal_keluar, periodStart, periodEnd,
  )

  const fmtDate = (d: Date) => `${String(d.getDate()).padStart(2, "0")} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
  const startIso = `${periodStart.getFullYear()}-${String(periodStart.getMonth() + 1).padStart(2, "0")}-${String(periodStart.getDate()).padStart(2, "0")}`
  const endIso = `${periodEnd.getFullYear()}-${String(periodEnd.getMonth() + 1).padStart(2, "0")}-${String(periodEnd.getDate()).padStart(2, "0")}`

  return {
    slip_id: Number(slip.id),
    slip_number: slipNumber,
    period: {
      month, year,
      label: `${MONTHS[month - 1]} ${year}`,
      start_date: startIso,
      end_date: endIso,
      range_label: `${fmtDate(periodStart)} – ${fmtDate(periodEnd)}`,
    },
    status: slip.status,
    employee: {
      id: Number(slip.employee_id),
      nama: slip.karyawans.nama_karyawan,
      nik: slip.karyawans.nik,
      jabatan: slip.karyawans.jabatan,
      department,
    },
    earnings,
    deductions,
    total_earnings: Number(slip.total_earnings),
    total_deductions: Number(slip.total_deductions),
    net_salary: net,
    net_salary_terbilang: terbilangRupiah(net),
    attendance,
    tax_detail: (slip.tax_detail as TaxDetailSnapshot | null) ?? null,
    meta: {
      run_type: slip.payroll_periods.run_type,
      tax_method: taxMethod,
      prorata_factor: prorataFactor,
      prorata_note: prorataNote,
    },
  }
}

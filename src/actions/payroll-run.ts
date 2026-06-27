"use server"

/**
 * Server Actions — Payroll Run (Periode Penggajian).
 *
 * Konvensi response: { success, data, error }.
 * Kalkulasi memakai engine murni (lib/payroll/engine). Setiap karyawan
 * disimpan dalam transaksi atomik; kegagalan satu karyawan tidak
 * menggagalkan keseluruhan (Promise.allSettled).
 */

import { revalidatePath } from "next/cache"
import { prisma, serialize } from "@/lib/prisma"
import { getSession, type SessionUser } from "@/lib/session"
import { writeAuditLog } from "@/lib/audit"
import {
  calculateEmployeePayroll,
  computeSpecialPayroll,
  type EffectiveComponent,
  type AttendanceRecap,
  type EngineDeductionRule,
  type PayrollEngineResult,
  type PayrollLineItem,
} from "@/lib/payroll/engine"
import type { PayrollTaxInput } from "@/lib/payroll/engine"
import type { BpjsSettingInput, TaxBracket, TerRate } from "@/lib/payroll/tax-engine"
import type { DeductionTier } from "@/lib/payroll/deduction-engine"
import { resolveEffectiveComponents } from "@/lib/payroll/effective-components"
import { summarizeAbsensi, type AttendanceSummary } from "@/lib/payroll/attendance"

const PAGE_PATH = "/dashboard/payroll/run"
const DEFAULT_WORKING_DAYS = 22

// ─── Response standar ────────────────────────────────────────────
export type ActionResult<T> =
  | { success: true; data: T; error: null }
  | { success: false; data: null; error: string }

function ok<T>(data: T): ActionResult<T> {
  return { success: true, data, error: null }
}
function fail(error: string): ActionResult<never> {
  return { success: false, data: null, error }
}

const ALLOWED_ROLES = ["admin", "hrd"]
async function requirePayrollAdmin(): Promise<{ user: SessionUser } | { error: string }> {
  try {
    const session = await getSession()
    if (!session.user) return { error: "Tidak terautentikasi" }
    const role = (session.user.role ?? "user").toLowerCase()
    if (!ALLOWED_ROLES.includes(role)) return { error: "Akses ditolak" }
    return { user: session.user }
  } catch {
    return { error: "Session tidak valid" }
  }
}

/** Rentang tanggal aktual periode. Fallback ke 1..akhir bulan bila kolom kustom kosong (periode lama). */
function resolvePeriodRange(p: { period_month: number; period_year: number; period_start_date: Date | null; period_end_date: Date | null }): { start: Date; end: Date } {
  const start = p.period_start_date ? new Date(p.period_start_date) : new Date(p.period_year, p.period_month - 1, 1)
  const end = p.period_end_date ? new Date(p.period_end_date) : new Date(p.period_year, p.period_month, 0)
  return { start, end }
}

// ─── Helper: komponen efektif per karyawan (merge jabatan + individu) ────
async function loadEffectiveComponents(employeeId: bigint, jabatan: string | null, periodStart: Date, periodEnd: Date): Promise<EffectiveComponent[]> {
  const resolved = await resolveEffectiveComponents({ employeeId, jabatan, periodStart, periodEnd })
  return resolved.map((r) => ({
    component_id: r.component_id,
    code: r.code,
    name: r.name,
    type: r.type,
    calc_method: r.calc_method,
    value: r.value,
    formula_expression: r.formula_expression,
    basis_component_id: r.basis_component_id,
    basis_code: r.basis_code,
    calc_order: r.calc_order,
    is_taxable: r.is_taxable,
    is_prorata: r.is_prorata,
    is_thr_basis: r.is_thr_basis,
  }))
}

// ─── Helper: aturan potongan absensi aktif ───────────────────────
async function loadActiveDeductionRules(): Promise<EngineDeductionRule[]> {
  const rules = await prisma.attendance_deduction_rules.findMany({
    where: { is_active: true },
    include: {
      late_tiers: { orderBy: { late_from_minutes: "asc" } },
      basis_component: { select: { code: true } },
    },
  })
  return rules.map((r) => ({
    id: Number(r.id),
    name: r.name,
    trigger_type: r.trigger_type,
    calc_method: r.calc_method,
    basis_code: r.basis_component?.code ?? null,
    value: Number(r.value),
    working_days: r.working_days,
    tolerance_minutes: r.tolerance_minutes,
    max_deduction_per_month: r.max_deduction_per_month != null ? Number(r.max_deduction_per_month) : null,
    tiers: r.late_tiers.map<DeductionTier>((t) => ({
      late_from_minutes: t.late_from_minutes,
      late_to_minutes: t.late_to_minutes,
      deduction_type: t.deduction_type,
      deduction_value: Number(t.deduction_value),
    })),
  }))
}

// ─── Helper: rekap absensi dari tabel `absensi` ──────────────────
async function buildAttendanceRecap(employeeId: bigint, periodStart: Date, periodEnd: Date): Promise<{ recap: AttendanceRecap; summary: AttendanceSummary }> {
  const firstDay = new Date(periodStart.getFullYear(), periodStart.getMonth(), periodStart.getDate())
  const lastDay = new Date(periodEnd.getFullYear(), periodEnd.getMonth(), periodEnd.getDate(), 23, 59, 59)

  const rows = await prisma.absensi.findMany({
    where: { karyawan_id: employeeId, tanggal_absensi: { gte: firstDay, lte: lastDay } },
    select: { status_absensi: true, menit_terlambat: true, menit_pulang_cepat: true, is_terlambat: true },
  })

  let working = 0, present = 0, alpha = 0, late = 0, early = 0, sick = 0
  for (const r of rows) {
    const s = (r.status_absensi ?? "").toLowerCase()
    if (s === "libur") continue // bukan hari kerja terjadwal
    working++
    if (s === "alpha") alpha++
    else if (s === "sakit") sick++ // pendekatan: sakit tanpa surat
    else present++
    late += r.menit_terlambat ?? 0
    early += r.menit_pulang_cepat ?? 0
  }

  // Lembur terealisasi pada periode.
  const ot = await prisma.overtime_requests.aggregate({
    where: { karyawan_id: employeeId, status: "realized", tanggal_lembur: { gte: firstDay, lte: lastDay } },
    _sum: { durasi_disetujui_menit: true, total_uang_lembur: true },
  })

  const workingDays = working || DEFAULT_WORKING_DAYS
  const recap: AttendanceRecap = {
    working_days: workingDays,
    present_days: present,
    alpha_days: alpha,
    late_minutes: late,
    early_leave_minutes: early,
    sick_no_cert_days: sick,
    overtime_minutes: ot._sum.durasi_disetujui_menit ?? 0,
    overtime_amount: Number(ot._sum.total_uang_lembur ?? 0),
  }
  const summary = summarizeAbsensi(rows, workingDays)
  return { recap, summary }
}

// ─── Helper: konteks pajak & BPJS (dimuat sekali per run) ────────
interface TaxContext {
  config: {
    bpjs_enabled: boolean
    pph21_enabled: boolean
    biaya_jabatan_pct: number
    biaya_jabatan_max_month: number
    npwp_surcharge_pct: number
    pembulatan_pkp: number
    pembulatan_gaji: number
    metode_pph21: "PROGRESIF" | "TER"
  } | null
  bpjs: BpjsSettingInput[]
  brackets: TaxBracket[]
  ptkp: Map<string, number>
  ptkpKategori: Map<string, string>
  ter: Map<string, TerRate[]>
}

async function loadTaxContext(): Promise<TaxContext> {
  const [config, bpjs, brackets, ptkp, terRows] = await Promise.all([
    prisma.payroll_tax_configs.findFirst(),
    prisma.bpjs_settings.findMany({ where: { is_active: true }, orderBy: { urutan: "asc" } }),
    prisma.pph21_brackets.findMany({ orderBy: { urutan: "asc" } }),
    prisma.ptkp_settings.findMany({ where: { is_active: true } }),
    prisma.pph21_ter_rates.findMany({ orderBy: [{ kategori: "asc" }, { bruto_min: "asc" }] }),
  ])
  const ter = new Map<string, TerRate[]>()
  for (const r of terRows) {
    const arr = ter.get(r.kategori) ?? []
    arr.push({ bruto_min: Number(r.bruto_min), bruto_max: r.bruto_max != null ? Number(r.bruto_max) : null, tarif_persen: Number(r.tarif_persen) })
    ter.set(r.kategori, arr)
  }
  return {
    config: config
      ? {
          bpjs_enabled: config.bpjs_enabled,
          pph21_enabled: config.pph21_enabled,
          biaya_jabatan_pct: Number(config.biaya_jabatan_persen),
          biaya_jabatan_max_month: Number(config.biaya_jabatan_maks_bulan),
          npwp_surcharge_pct: Number(config.npwp_surcharge_persen),
          pembulatan_pkp: config.pembulatan_pph,
          pembulatan_gaji: config.pembulatan_gaji,
          metode_pph21: config.metode_pph21 === "TER" ? "TER" : "PROGRESIF",
        }
      : null,
    bpjs: bpjs.map((b) => ({
      kode: b.kode,
      nama: b.nama,
      rate_karyawan: Number(b.rate_karyawan),
      rate_perusahaan: Number(b.rate_perusahaan),
      batas_atas_upah: b.batas_atas_upah != null ? Number(b.batas_atas_upah) : null,
      basis_code: b.basis_component_code,
      menambah_bruto_pajak: b.menambah_bruto_pajak,
      pengurang_pajak: b.pengurang_pajak,
    })),
    brackets: brackets.map((br) => ({
      batas_bawah: Number(br.batas_bawah),
      batas_atas: br.batas_atas != null ? Number(br.batas_atas) : null,
      tarif_persen: Number(br.tarif_persen),
    })),
    ptkp: new Map(ptkp.map((p) => [p.kode, Number(p.nominal_setahun)])),
    ptkpKategori: new Map(ptkp.map((p) => [p.kode, p.kategori_ter])),
    ter,
  }
}

interface YtdTax { bruto: number; bpjs_deductible: number; pph_withheld: number }

function buildTaxInput(
  ctx: TaxContext,
  employee: { status_ptkp: string; punya_npwp: boolean },
  month: number,
  ytd?: YtdTax,
): PayrollTaxInput | null {
  if (!ctx.config) return null
  const ptkpYearly = ctx.ptkp.get(employee.status_ptkp) ?? ctx.ptkp.get("TK/0") ?? 54000000
  const kategori = ctx.ptkpKategori.get(employee.status_ptkp) ?? "A"
  return {
    bpjs_enabled: ctx.config.bpjs_enabled,
    pph21_enabled: ctx.config.pph21_enabled,
    bpjs_settings: ctx.bpjs,
    biaya_jabatan_pct: ctx.config.biaya_jabatan_pct,
    biaya_jabatan_max_month: ctx.config.biaya_jabatan_max_month,
    ptkp_yearly: ptkpYearly,
    brackets: ctx.brackets,
    has_npwp: employee.punya_npwp,
    npwp_surcharge_pct: ctx.config.npwp_surcharge_pct,
    pembulatan_pkp: ctx.config.pembulatan_pkp,
    metode: ctx.config.metode_pph21,
    ter_rates: ctx.ter.get(kategori) ?? [],
    is_december: month === 12,
    ytd,
  }
}

// ─── Helper: tetapkan nomor slip permanen (SLIP/YYYY/MM/NNN) ─────
async function assignSlipNumbers(periodId: bigint, month: number, year: number): Promise<void> {
  const numbered = await prisma.payroll_slips.count({ where: { payroll_period_id: periodId, slip_number: { not: null } } })
  const pending = await prisma.payroll_slips.findMany({
    where: { payroll_period_id: periodId, slip_number: null },
    select: { id: true },
    orderBy: { id: "asc" },
  })
  let seq = numbered
  const prefix = `SLIP/${year}/${String(month).padStart(2, "0")}/`
  for (const s of pending) {
    seq++
    await prisma.payroll_slips.update({ where: { id: s.id }, data: { slip_number: `${prefix}${String(seq).padStart(3, "0")}` } })
  }
}

// ─── Helper: faktor prorata & masa kerja (karyawan baru / resign) ─────────
/** Selisih hari kalender (b − a), berbasis tanggal lokal (abaikan jam). */
function dayDiff(a: Date, b: Date): number {
  const ms = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())
  return Math.round(ms / 86400000)
}

/**
 * Faktor prorata (0..1) untuk rentang periode kustom [periodStart, periodEnd].
 * Memperhitungkan tanggal masuk (joinDate) & tanggal keluar (exitDate).
 */
function prorataFactor(joinDate: Date | null, exitDate: Date | null, periodStart: Date, periodEnd: Date): number {
  const totalDays = dayDiff(periodStart, periodEnd) + 1
  if (totalDays <= 0) return 1

  let activeStart = periodStart
  let activeEnd = periodEnd

  if (joinDate) {
    const join = new Date(joinDate)
    if (dayDiff(periodEnd, join) > 0) return 0          // masuk setelah periode berakhir
    if (dayDiff(periodStart, join) > 0) activeStart = join
  }
  if (exitDate) {
    const exit = new Date(exitDate)
    if (dayDiff(exit, periodStart) > 0) return 0        // keluar sebelum periode mulai
    if (dayDiff(exit, periodEnd) > 0) activeEnd = exit
  }

  const activeDays = dayDiff(activeStart, activeEnd) + 1
  if (activeDays <= 0) return 0
  if (activeDays >= totalDays) return 1
  return Math.min(1, Math.max(0, activeDays / totalDays))
}

function masaKerjaBulan(joinDate: Date | null, month: number, year: number): number {
  if (!joinDate) return 999
  const j = new Date(joinDate)
  const ref = new Date(year, month - 1, 1)
  return (ref.getFullYear() - j.getFullYear()) * 12 + (ref.getMonth() - j.getMonth())
}

/** Total penghasilan bruto kena pajak bulanan reguler (FIXED/PERCENT taxable). */
function monthlyTaxable(components: EffectiveComponent[]): number {
  const fixedByCode: Record<string, number> = {}
  for (const c of components) if (c.calc_method === "FIXED") fixedByCode[c.code] = c.value
  let total = 0
  for (const c of components) {
    if (c.type !== "EARNING" || !c.is_taxable) continue
    if (c.calc_method === "FIXED") total += c.value
    else if (c.calc_method === "PERCENT") total += ((c.basis_code ? fixedByCode[c.basis_code] ?? 0 : 0) * c.value) / 100
  }
  return Math.round(total)
}

interface RunInfo {
  run_type: "REGULER" | "THR" | "BONUS"
  month: number
  year: number
  period_start: Date
  period_end: Date
  thr_min_masa_bulan: number
  bonus_multiplier: number
  run_label: string | null
}

/** Akumulasi PPh/BPJS untuk rekonsiliasi Desember TER: REGULER Jan..(bulan−1) + semua THR/BONUS tahun berjalan. */
async function gatherYtdTax(employeeId: bigint, year: number, beforeMonth: number): Promise<{ bruto: number; bpjs_deductible: number; pph_withheld: number }> {
  const slips = await prisma.payroll_slips.findMany({
    where: {
      employee_id: employeeId,
      OR: [
        // Gaji reguler sebelum bulan rekonsiliasi (Jan–Nov)
        { payroll_periods: { period_year: year, run_type: "REGULER", period_month: { lt: beforeMonth } } },
        // THR & Bonus sepanjang tahun berjalan (kapan pun dibayarkan)
        { payroll_periods: { period_year: year, run_type: { in: ["THR", "BONUS"] } } },
      ],
    },
    select: { tax_detail: true },
  })
  let bruto = 0, ded = 0, pph = 0
  for (const s of slips) {
    const td = s.tax_detail as { pph21?: { bruto_month?: number; pph_month?: number }; bpjs?: { deductible?: number } } | null
    if (td?.pph21) { bruto += Number(td.pph21.bruto_month ?? 0); pph += Number(td.pph21.pph_month ?? 0) }
    if (td?.bpjs) ded += Number(td.bpjs.deductible ?? 0)
  }
  return { bruto, bpjs_deductible: ded, pph_withheld: pph }
}

// ─── Helper: cicilan pinjaman aktif untuk satu karyawan pada periode ──
interface LoanDeduction { loan_id: bigint; code: string; name: string; amount: number; principal: number; paid_before: number }

async function loadEmployeeLoanDeductions(periodId: bigint, employeeId: bigint, month: number, year: number): Promise<LoanDeduction[]> {
  const loans = await prisma.employee_loans.findMany({
    where: {
      employee_id: employeeId,
      OR: [
        // Pinjaman aktif yang sudah masuk periode mulai potong
        { AND: [{ status: "ACTIVE" }, { OR: [{ start_year: { lt: year } }, { AND: [{ start_year: year }, { start_month: { lte: month } }] }] }] },
        // Atau pinjaman (non-cancel) yang sudah punya potongan di periode ini (untuk recalc idempotent)
        { AND: [{ status: { not: "CANCELLED" } }, { payments: { some: { payroll_period_id: periodId } } }] },
      ],
    },
    include: { payments: { select: { amount: true, payroll_period_id: true } } },
  })
  const result: LoanDeduction[] = []
  for (const l of loans) {
    const principal = Number(l.principal_amount)
    // Total terbayar dari periode LAIN (kecualikan periode berjalan agar idempotent saat hitung ulang).
    const paidBefore = l.payments
      .filter((p) => p.payroll_period_id == null || p.payroll_period_id !== periodId)
      .reduce((s, p) => s + Number(p.amount), 0)
    const remaining = principal - paidBefore
    if (remaining <= 0) continue
    const installment = Math.min(Number(l.installment_amount), remaining)
    if (installment <= 0) continue
    result.push({
      loan_id: l.id,
      code: l.loan_number?.trim() || `LOAN-${l.id}`,
      name: `Cicilan: ${l.title}`,
      amount: installment,
      principal,
      paid_before: paidBefore,
    })
  }
  return result
}

// ─── Helper: penyesuaian sekali jalan → komponen FIXED sintetis ──
async function loadEmployeeAdjustments(periodId: bigint, employeeId: bigint): Promise<EffectiveComponent[]> {
  const rows = await prisma.payroll_adjustments.findMany({
    where: { payroll_period_id: periodId, employee_id: employeeId },
    orderBy: { id: "asc" },
  })
  return rows.map((a, idx) => ({
    component_id: 0,
    code: `ADJ-${a.id}`,
    name: a.label,
    type: a.type,
    calc_method: "FIXED" as const,
    value: Number(a.amount),
    formula_expression: null,
    basis_component_id: null,
    basis_code: null,
    calc_order: 9000 + idx, // dihitung paling akhir, tidak jadi basis komponen lain
    is_taxable: a.type === "EARNING" ? a.is_taxable : false,
    is_prorata: false,
    is_thr_basis: false,
  }))
}

// ─── Helper: hitung & simpan slip untuk 1 karyawan (atomik) ──────
async function computeAndSaveEmployee(
  periodId: bigint,
  employee: { id: bigint; nik: string; nama_karyawan: string; jabatan: string; status_ptkp: string; punya_npwp: boolean; tanggal_masuk_kerja: Date | null; tanggal_keluar: Date | null },
  run: RunInfo,
  deductionRules: EngineDeductionRule[],
  taxCtx: TaxContext,
): Promise<{ warnings: string[] }> {
  const { month, year } = run
  const periodStart = run.period_start
  const periodEnd = run.period_end
  const warnings: string[] = []
  let result: PayrollEngineResult
  let workingDays = 0
  let attendanceSnapshot: object | undefined
  let loanDeductions: LoanDeduction[] = []

  if (run.run_type === "REGULER") {
    const [components, recapData, loans, adjustments] = await Promise.all([
      loadEffectiveComponents(employee.id, employee.jabatan, periodStart, periodEnd),
      buildAttendanceRecap(employee.id, periodStart, periodEnd),
      loadEmployeeLoanDeductions(periodId, employee.id, month, year),
      loadEmployeeAdjustments(periodId, employee.id),
    ])
    const recap = recapData.recap
    workingDays = recap.working_days
    attendanceSnapshot = recapData.summary as unknown as object
    loanDeductions = loans
    // Gabungkan penyesuaian sekali jalan sebagai komponen FIXED (calc_order tinggi → dihitung terakhir).
    const components2 = [...components, ...adjustments]

    // Untuk metode TER bulan Desember: kumpulkan akumulasi Jan–Nov.
    const ytd = (month === 12 && taxCtx.config?.metode_pph21 === "TER")
      ? await gatherYtdTax(employee.id, year, 12)
      : undefined

    result = calculateEmployeePayroll({
      employee_id: employee.id.toString(),
      period_month: month,
      period_year: year,
      salary_components: components2,
      attendance_recap: recap,
      deduction_rules: deductionRules,
      working_days_standard: recap.working_days || DEFAULT_WORKING_DAYS,
      prorata_factor: prorataFactor(employee.tanggal_masuk_kerja, employee.tanggal_keluar, periodStart, periodEnd),
      extra_deductions: loanDeductions.map((l) => ({ code: l.code, name: l.name, amount: l.amount, category: "LOAN" as const, notes: null })),
      round_net_to: taxCtx.config?.pembulatan_gaji ?? 0,
      tax: buildTaxInput(taxCtx, employee, month, ytd),
    })

    if (components.length === 0) warnings.push("Tidak ada komponen gaji yang berlaku")
    else if (!components.some((c) => c.code === "GAJI_POKOK")) warnings.push("Tanpa komponen GAJI_POKOK")
    if (result.total_earnings === 0) warnings.push("Total pendapatan Rp0")
    if (result.net_salary < 0) warnings.push("Gaji bersih negatif (potongan + cicilan melebihi pendapatan)")
    warnings.push(...result.warnings)
  } else {
    // THR / BONUS
    const [components, loans, adjustments] = await Promise.all([
      loadEffectiveComponents(employee.id, employee.jabatan, periodStart, periodEnd),
      loadEmployeeLoanDeductions(periodId, employee.id, month, year),
      loadEmployeeAdjustments(periodId, employee.id),
    ])
    loanDeductions = loans
    let factor = run.bonus_multiplier
    if (run.run_type === "THR") {
      const masa = masaKerjaBulan(employee.tanggal_masuk_kerja, month, year)
      factor = run.thr_min_masa_bulan > 0 ? Math.min(1, masa / run.thr_min_masa_bulan) : 1
    }
    const label = run.run_label ?? (run.run_type === "THR" ? "Tunjangan Hari Raya" : "Bonus")
    // Penyesuaian sekali jalan untuk periode THR/Bonus: earning vs deduction terpisah.
    const extraEarnings = adjustments
      .filter((a) => a.type === "EARNING")
      .map((a) => ({ code: a.code, name: a.name, amount: a.value, is_taxable: a.is_taxable, notes: null }))
    const extraDeductions = [
      ...adjustments.filter((a) => a.type === "DEDUCTION").map((a) => ({ code: a.code, name: a.name, amount: a.value, category: "OTHER" as const, notes: null })),
      ...loanDeductions.map((l) => ({ code: l.code, name: l.name, amount: l.amount, category: "LOAN" as const, notes: null })),
    ]
    result = computeSpecialPayroll({
      run_type: run.run_type,
      label,
      components,
      factor,
      regular_monthly_taxable: monthlyTaxable(components),
      extra_earnings: extraEarnings,
      extra_deductions: extraDeductions,
      round_net_to: taxCtx.config?.pembulatan_gaji ?? 0,
      tax: buildTaxInput(taxCtx, employee, month),
    })
    if (!components.some((c) => c.is_thr_basis)) warnings.push("Tanpa komponen basis THR/Bonus")
    if (result.total_earnings === 0) warnings.push(run.run_type === "THR" ? "THR Rp0 (cek masa kerja/basis)" : "Bonus Rp0")
    warnings.push(...result.warnings)
  }

  // Susun semua line item menjadi payroll_slip_details (snapshot).
  const allItems: PayrollLineItem[] = [...result.earnings, ...result.deductions, ...result.attendance_deductions]

  await prisma.$transaction(async (tx) => {
    // Pertahankan nomor slip lama (untuk recalculate satu karyawan).
    const prev = await tx.payroll_slips.findFirst({
      where: { payroll_period_id: periodId, employee_id: employee.id },
      select: { slip_number: true },
    })
    // Hapus slip lama (cascade ke details) agar idempotent saat recalculate.
    await tx.payroll_slips.deleteMany({ where: { payroll_period_id: periodId, employee_id: employee.id } })

    const slip = await tx.payroll_slips.create({
      data: {
        payroll_period_id: periodId,
        employee_id: employee.id,
        slip_number: prev?.slip_number ?? null,
        working_days: workingDays,
        total_earnings: result.total_earnings,
        total_deductions: result.total_deductions,
        net_salary: result.net_salary,
        status: "PENDING",
        tax_detail: result.tax_breakdown ? (JSON.parse(JSON.stringify(result.tax_breakdown)) as object) : undefined,
        attendance_snapshot: attendanceSnapshot,
        created_at: new Date(),
        updated_at: new Date(),
      },
    })

    if (allItems.length > 0) {
      await tx.payroll_slip_details.createMany({
        data: allItems.map((it, idx) => ({
          payroll_slip_id: slip.id,
          component_id: it.component_id ? BigInt(it.component_id) : null,
          component_code: it.code,
          component_name: it.name,
          type: it.type,
          category: it.category,
          basis_value: it.basis_value,
          quantity: it.quantity,
          amount: it.amount,
          notes: it.notes ? it.notes.slice(0, 255) : null,
          sort_order: idx,
          created_at: new Date(),
          updated_at: new Date(),
        })),
      })
    }

    // Catat potongan cicilan pinjaman (idempotent: hapus SEMUA pembayaran periode ini milik karyawan, lalu buat ulang).
    await tx.employee_loan_payments.deleteMany({ where: { payroll_period_id: periodId, loan: { employee_id: employee.id } } })
    if (loanDeductions.length > 0) {
      for (const ld of loanDeductions) {
        await tx.employee_loan_payments.create({
          data: {
            loan_id: ld.loan_id,
            payroll_slip_id: slip.id,
            payroll_period_id: periodId,
            period_month: month,
            period_year: year,
            amount: ld.amount,
            created_at: new Date(),
            updated_at: new Date(),
          },
        })
        // Tandai LUNAS bila pokok sudah tertutup; jika belum, pastikan tetap ACTIVE.
        const newStatus = ld.paid_before + ld.amount >= ld.principal - 0.005 ? "COMPLETED" : "ACTIVE"
        await tx.employee_loans.update({ where: { id: ld.loan_id }, data: { status: newStatus, updated_at: new Date() } })
      }
    }
  })

  return { warnings }
}

// ─── 1. Buat periode ─────────────────────────────────────────────
export interface CreatePeriodOptions {
  run_type?: "REGULER" | "THR" | "BONUS"
  thr_min_masa_bulan?: number
  bonus_multiplier?: number
  run_label?: string | null
  /** Rentang tanggal kustom (opsional). Format "YYYY-MM-DD". Kosong = 1..akhir bulan. */
  start_date?: string | null
  end_date?: string | null
}

export async function createPayrollPeriod(month: number, year: number, options: CreatePeriodOptions = {}) {
  const auth = await requirePayrollAdmin()
  if ("error" in auth) return fail(auth.error)
  if (month < 1 || month > 12) return fail("Bulan tidak valid")
  if (year < 2000 || year > 2100) return fail("Tahun tidak valid")

  const runType = options.run_type ?? "REGULER"
  const thrMin = options.thr_min_masa_bulan != null && options.thr_min_masa_bulan > 0 ? Math.trunc(options.thr_min_masa_bulan) : 12
  const bonusMult = options.bonus_multiplier != null && options.bonus_multiplier >= 0 ? options.bonus_multiplier : 1

  // Rentang tanggal: default 1..akhir bulan; bisa di-override dengan tanggal kustom.
  let startDate = new Date(year, month - 1, 1)
  let endDate = new Date(year, month, 0)
  if (options.start_date || options.end_date) {
    const s = options.start_date ? new Date(options.start_date) : startDate
    const e = options.end_date ? new Date(options.end_date) : endDate
    if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return fail("Tanggal periode tidak valid")
    if (e.getTime() < s.getTime()) return fail("Tanggal akhir tidak boleh sebelum tanggal mulai")
    startDate = s
    endDate = e
  }

  try {
    const existing = await prisma.payroll_periods.findFirst({ where: { period_month: month, period_year: year, run_type: runType } })
    if (existing && existing.status !== "CLOSED") {
      return fail(`Periode ${runType} untuk bulan/tahun ini sudah ada`)
    }
    if (existing) return fail(`Periode ${runType} untuk bulan/tahun ini sudah ada (tertutup)`)

    const created = await prisma.payroll_periods.create({
      data: {
        period_month: month,
        period_year: year,
        period_start_date: startDate,
        period_end_date: endDate,
        run_type: runType,
        thr_min_masa_bulan: thrMin,
        bonus_multiplier: bonusMult,
        run_label: options.run_label?.trim() || null,
        status: "DRAFT",
        created_by: BigInt(auth.user.id),
        created_at: new Date(),
        updated_at: new Date(),
      },
    })
    await writeAuditLog({ user: auth.user, action: "CREATE", modelType: "payroll_periods", modelId: created.id, dataBaru: serialize(created) })
    revalidatePath(PAGE_PATH)
    return ok(serialize(created))
  } catch {
    return fail("Gagal membuat periode payroll")
  }
}

// ─── 2. Hitung seluruh karyawan ──────────────────────────────────
export async function calculatePayrollPeriod(periodId: number) {
  const auth = await requirePayrollAdmin()
  if ("error" in auth) return fail(auth.error)
  if (!periodId || periodId <= 0) return fail("ID periode tidak valid")

  try {
    const period = await prisma.payroll_periods.findUnique({ where: { id: BigInt(periodId) } })
    if (!period) return fail("Periode tidak ditemukan")
    if (!["DRAFT", "CALCULATED"].includes(period.status)) {
      return fail("Periode tidak dapat dihitung pada status saat ini")
    }

    const month = period.period_month
    const year = period.period_year
    const { start: periodStart, end: periodEnd } = resolvePeriodRange(period)
    // Sertakan karyawan aktif + karyawan yang keluar dalam rentang periode ini (untuk gaji prorata terakhir).
    const employees = await prisma.karyawans.findMany({
      where: {
        OR: [
          { status_karyawan: "Aktif" },
          { tanggal_keluar: { gte: periodStart, lte: periodEnd } },
        ],
      },
      select: { id: true, nik: true, nama_karyawan: true, jabatan: true, status_ptkp: true, punya_npwp: true, tanggal_masuk_kerja: true, tanggal_keluar: true },
    })
    if (employees.length === 0) return fail("Tidak ada karyawan aktif")

    const [deductionRules, taxCtx] = await Promise.all([loadActiveDeductionRules(), loadTaxContext()])
    const runInfo: RunInfo = {
      run_type: period.run_type,
      month, year,
      period_start: periodStart,
      period_end: periodEnd,
      thr_min_masa_bulan: period.thr_min_masa_bulan,
      bonus_multiplier: Number(period.bonus_multiplier),
      run_label: period.run_label,
    }

    // Proses bertahap (batch) agar tidak menjenuhkan connection pool DB.
    const BATCH_SIZE = 20
    const settled: PromiseSettledResult<{ warnings: string[] }>[] = []
    for (let i = 0; i < employees.length; i += BATCH_SIZE) {
      const batch = employees.slice(i, i + BATCH_SIZE)
      const batchResults = await Promise.allSettled(
        batch.map((emp) => computeAndSaveEmployee(BigInt(periodId), emp, runInfo, deductionRules, taxCtx)),
      )
      settled.push(...batchResults)
    }

    const errors: { employee_id: number; nama: string; error: string }[] = []
    const warnings: { employee_id: number; nama: string; warning: string }[] = []
    let successCount = 0
    settled.forEach((res, i) => {
      const emp = employees[i]
      if (res.status === "fulfilled") {
        successCount++
        for (const w of res.value.warnings) warnings.push({ employee_id: Number(emp.id), nama: emp.nama_karyawan, warning: w })
      } else {
        const msg = res.reason instanceof Error ? res.reason.message : "Gagal menghitung"
        console.error(`[payroll] Gagal hitung karyawan ${emp.nama_karyawan} (${emp.id}):`, res.reason)
        errors.push({ employee_id: Number(emp.id), nama: emp.nama_karyawan, error: msg })
      }
    })

    if (errors.length === 0) {
      await prisma.payroll_periods.update({
        where: { id: BigInt(periodId) },
        data: { status: "CALCULATED", updated_at: new Date() },
      })

      // Tetapkan nomor slip permanen hanya setelah seluruh karyawan berhasil dihitung.
      await assignSlipNumbers(BigInt(periodId), month, year)
    } else {
      await prisma.payroll_periods.update({
        where: { id: BigInt(periodId) },
        data: { status: "DRAFT", updated_at: new Date() },
      })
    }

    await writeAuditLog({ user: auth.user, action: "UPDATE", modelType: "payroll_periods", modelId: BigInt(periodId), dataBaru: { status: errors.length === 0 ? "CALCULATED" : "DRAFT", success: successCount, failed: errors.length } })
    revalidatePath(PAGE_PATH)
    revalidatePath(`${PAGE_PATH}/${periodId}`)
    return ok({ success_count: successCount, failed_count: errors.length, errors, warnings })
  } catch {
    return fail("Gagal menjalankan kalkulasi payroll")
  }
}

// ─── 2b. Validasi pra-kalkulasi (checklist) ──────────────────────
export async function validatePayrollPeriod(periodId: number) {
  const auth = await requirePayrollAdmin()
  if ("error" in auth) return fail(auth.error)
  if (!periodId || periodId <= 0) return fail("ID periode tidak valid")

  try {
    const period = await prisma.payroll_periods.findUnique({ where: { id: BigInt(periodId) } })
    if (!period) return fail("Periode tidak ditemukan")

    const month = period.period_month
    const year = period.period_year
    const { start: periodStart, end: periodEnd } = resolvePeriodRange(period)

    const checks: { level: "error" | "warning" | "ok"; message: string; detail?: string }[] = []

    // 1. Konfigurasi pajak
    const taxCtx = await loadTaxContext()
    if (!taxCtx.config) {
      checks.push({ level: "error", message: "Konfigurasi Pajak & BPJS belum diatur", detail: "Buka menu Pajak & BPJS → tab Konfigurasi" })
    } else {
      if (taxCtx.config.bpjs_enabled && taxCtx.bpjs.length === 0)
        checks.push({ level: "warning", message: "BPJS aktif tetapi belum ada setting BPJS", detail: "Tambahkan tarif di tab BPJS" })
      if (taxCtx.config.pph21_enabled) {
        if (taxCtx.config.metode_pph21 === "PROGRESIF" && taxCtx.brackets.length === 0)
          checks.push({ level: "error", message: "Metode PPh21 Progresif tetapi lapisan tarif kosong", detail: "Isi lapisan di tab PPh21" })
        if (taxCtx.config.metode_pph21 === "TER" && taxCtx.ter.size === 0)
          checks.push({ level: "error", message: "Metode PPh21 TER tetapi tabel tarif TER kosong", detail: "Isi tarif di tab Tarif TER" })
        if (taxCtx.ptkp.size === 0)
          checks.push({ level: "error", message: "Tabel PTKP kosong", detail: "Isi nilai PTKP di tab PTKP" })
      }
    }

    // 2. Karyawan yang akan diproses
    const employees = await prisma.karyawans.findMany({
      where: {
        OR: [
          { status_karyawan: "Aktif" },
          { tanggal_keluar: { gte: periodStart, lte: periodEnd } },
        ],
      },
      select: { id: true, nama_karyawan: true, jabatan: true, status_ptkp: true, no_rekening: true },
    })
    if (employees.length === 0) {
      checks.push({ level: "error", message: "Tidak ada karyawan yang akan diproses" })
    }

    // 3. Validasi per karyawan (hanya untuk run REGULER yang butuh komponen lengkap)
    const noComponent: string[] = []
    const noGapok: string[] = []
    const ptkpInvalid: string[] = []
    const terKategoriKosong: string[] = []
    const noRekening: string[] = []

    const sample = employees.slice(0, 500) // batasi pemeriksaan komponen agar tetap cepat
    for (const emp of sample) {
      // PTKP terdaftar?
      if (taxCtx.config?.pph21_enabled && taxCtx.ptkp.size > 0 && !taxCtx.ptkp.has(emp.status_ptkp)) {
        ptkpInvalid.push(`${emp.nama_karyawan} (${emp.status_ptkp || "kosong"})`)
      }
      // TER kategori ada?
      if (taxCtx.config?.pph21_enabled && taxCtx.config.metode_pph21 === "TER") {
        const kat = taxCtx.ptkpKategori.get(emp.status_ptkp)
        if (!kat || (taxCtx.ter.get(kat) ?? []).length === 0) terKategoriKosong.push(emp.nama_karyawan)
      }
      // No rekening (untuk transfer bank)
      if (!emp.no_rekening?.trim()) noRekening.push(emp.nama_karyawan)

      // Komponen efektif hanya untuk REGULER
      if (period.run_type === "REGULER") {
        const comps = await loadEffectiveComponents(emp.id, emp.jabatan, periodStart, periodEnd)
        if (comps.length === 0) noComponent.push(emp.nama_karyawan)
        else if (!comps.some((c) => c.code === "GAJI_POKOK")) noGapok.push(emp.nama_karyawan)
      }
    }

    const summarize = (list: string[]) => list.length <= 5 ? list.join(", ") : `${list.slice(0, 5).join(", ")} +${list.length - 5} lainnya`

    if (noComponent.length) checks.push({ level: "error", message: `${noComponent.length} karyawan tanpa komponen gaji`, detail: summarize(noComponent) })
    if (noGapok.length) checks.push({ level: "warning", message: `${noGapok.length} karyawan tanpa GAJI_POKOK`, detail: summarize(noGapok) })
    if (ptkpInvalid.length) checks.push({ level: "error", message: `${ptkpInvalid.length} karyawan status PTKP tidak terdaftar`, detail: summarize(ptkpInvalid) })
    if (terKategoriKosong.length) checks.push({ level: "warning", message: `${terKategoriKosong.length} karyawan tanpa tarif TER (kategori kosong)`, detail: summarize(terKategoriKosong) })
    if (noRekening.length) checks.push({ level: "warning", message: `${noRekening.length} karyawan tanpa no. rekening`, detail: summarize(noRekening) })

    const errorCount = checks.filter((c) => c.level === "error").length
    const warningCount = checks.filter((c) => c.level === "warning").length
    if (errorCount === 0 && warningCount === 0) checks.push({ level: "ok", message: "Semua pemeriksaan lolos. Siap dihitung." })

    return ok({ employee_count: employees.length, error_count: errorCount, warning_count: warningCount, can_calculate: errorCount === 0, checks })
  } catch {
    return fail("Gagal menjalankan validasi pra-kalkulasi")
  }
}

// ─── 3. Hitung ulang 1 karyawan ──────────────────────────────────
export async function recalculateEmployeePayroll(periodId: number, employeeId: number) {
  const auth = await requirePayrollAdmin()
  if ("error" in auth) return fail(auth.error)
  if (!periodId || !employeeId) return fail("Parameter tidak valid")

  try {
    const period = await prisma.payroll_periods.findUnique({ where: { id: BigInt(periodId) } })
    if (!period) return fail("Periode tidak ditemukan")
    if (!["DRAFT", "CALCULATED"].includes(period.status)) {
      return fail("Hitung ulang hanya untuk periode DRAFT/CALCULATED")
    }
    const employee = await prisma.karyawans.findUnique({
      where: { id: BigInt(employeeId) },
      select: { id: true, nik: true, nama_karyawan: true, jabatan: true, status_ptkp: true, punya_npwp: true, tanggal_masuk_kerja: true, tanggal_keluar: true },
    })
    if (!employee) return fail("Karyawan tidak ditemukan")

    const [deductionRules, taxCtx] = await Promise.all([loadActiveDeductionRules(), loadTaxContext()])
    const { start: recalcStart, end: recalcEnd } = resolvePeriodRange(period)
    const runInfo: RunInfo = {
      run_type: period.run_type,
      month: period.period_month,
      year: period.period_year,
      period_start: recalcStart,
      period_end: recalcEnd,
      thr_min_masa_bulan: period.thr_min_masa_bulan,
      bonus_multiplier: Number(period.bonus_multiplier),
      run_label: period.run_label,
    }

    // Snapshot nilai sebelum (untuk audit before/after).
    const before = await prisma.payroll_slips.findFirst({
      where: { payroll_period_id: BigInt(periodId), employee_id: BigInt(employeeId) },
      select: { total_earnings: true, total_deductions: true, net_salary: true },
    })

    await computeAndSaveEmployee(BigInt(periodId), employee, runInfo, deductionRules, taxCtx)

    const after = await prisma.payroll_slips.findFirst({
      where: { payroll_period_id: BigInt(periodId), employee_id: BigInt(employeeId) },
      select: { total_earnings: true, total_deductions: true, net_salary: true },
    })

    await writeAuditLog({
      user: auth.user,
      action: "UPDATE",
      modelType: "payroll_slips",
      modelId: BigInt(employeeId),
      dataLama: before ? serialize({ periode: periodId, ...before }) : { periode: periodId },
      dataBaru: after ? serialize({ periode: periodId, recalculated: true, ...after }) : { periode: periodId, recalculated: true },
    })
    revalidatePath(`${PAGE_PATH}/${periodId}`)
    return ok({ employee_id: employeeId })
  } catch (e) {
    console.error("[payroll] recalculate error:", e)
    return fail("Gagal menghitung ulang karyawan")
  }
}

// ─── 4. Approve periode ──────────────────────────────────────────
export async function approvePayrollPeriod(periodId: number) {
  const auth = await requirePayrollAdmin()
  if ("error" in auth) return fail(auth.error)
  if (!periodId || periodId <= 0) return fail("ID periode tidak valid")

  try {
    const period = await prisma.payroll_periods.findUnique({ where: { id: BigInt(periodId) } })
    if (!period) return fail("Periode tidak ditemukan")
    if (period.status !== "CALCULATED") return fail("Hanya periode CALCULATED yang dapat di-approve")

    const [slips, activeEmployeeCount] = await Promise.all([
      prisma.payroll_slips.findMany({
        where: { payroll_period_id: BigInt(periodId) },
        select: {
          id: true,
          net_salary: true,
          total_earnings: true,
          total_deductions: true,
          _count: { select: { details: true } },
        },
      }),
      prisma.karyawans.count({ where: { status_karyawan: "Aktif" } }),
    ])

    if (slips.length === 0) return fail("Periode belum memiliki slip payroll")
    if (slips.length < activeEmployeeCount) {
      return fail(`Slip payroll belum lengkap (${slips.length}/${activeEmployeeCount} karyawan aktif). Hitung ulang periode sebelum approve`)
    }
    if (slips.some((s) => s._count.details === 0 || (Number(s.total_earnings) === 0 && Number(s.total_deductions) === 0 && Number(s.net_salary) === 0))) {
      return fail("Terdapat slip kosong. Periksa komponen gaji dan hitung ulang sebelum approve")
    }
    if (slips.some((s) => Number(s.net_salary) < 0)) {
      return fail("Terdapat slip dengan gaji bersih negatif. Periksa potongan sebelum approve")
    }

    await prisma.$transaction(async (tx) => {
      await tx.payroll_periods.update({
        where: { id: BigInt(periodId) },
        data: { status: "APPROVED", approved_by: BigInt(auth.user.id), updated_at: new Date() },
      })
      await tx.payroll_slips.updateMany({
        where: { payroll_period_id: BigInt(periodId) },
        data: { status: "APPROVED", updated_at: new Date() },
      })
    })

    await writeAuditLog({ user: auth.user, action: "UPDATE", modelType: "payroll_periods", modelId: BigInt(periodId), dataBaru: { status: "APPROVED" } })
    revalidatePath(PAGE_PATH)
    revalidatePath(`${PAGE_PATH}/${periodId}`)
    return ok({ id: periodId, status: "APPROVED" })
  } catch {
    return fail("Gagal meng-approve periode")
  }
}

// ─── 4b. Tandai dibayar (APPROVED → PAID) ────────────────────────
export async function markPayrollPaid(periodId: number, tanggalBayar: string | Date) {
  const auth = await requirePayrollAdmin()
  if ("error" in auth) return fail(auth.error)
  if (!periodId || periodId <= 0) return fail("ID periode tidak valid")
  const tgl = new Date(tanggalBayar)
  if (isNaN(tgl.getTime())) return fail("Tanggal bayar tidak valid")

  try {
    const period = await prisma.payroll_periods.findUnique({ where: { id: BigInt(periodId) }, select: { status: true } })
    if (!period) return fail("Periode tidak ditemukan")
    if (period.status !== "APPROVED") return fail("Hanya periode APPROVED yang dapat ditandai dibayar")

    await prisma.payroll_periods.update({
      where: { id: BigInt(periodId) },
      data: { status: "PAID", tanggal_bayar: tgl, paid_by: BigInt(auth.user.id), paid_at: new Date(), updated_at: new Date() },
    })
    await writeAuditLog({ user: auth.user, action: "UPDATE", modelType: "payroll_periods", modelId: BigInt(periodId), dataBaru: { status: "PAID", tanggal_bayar: tgl } })
    revalidatePath(PAGE_PATH)
    revalidatePath(`${PAGE_PATH}/${periodId}`)
    return ok({ id: periodId, status: "PAID" })
  } catch {
    return fail("Gagal menandai periode dibayar")
  }
}

// ─── 4c. Tutup periode (PAID → CLOSED) ───────────────────────────
export async function closePayrollPeriod(periodId: number) {
  const auth = await requirePayrollAdmin()
  if ("error" in auth) return fail(auth.error)
  if (!periodId || periodId <= 0) return fail("ID periode tidak valid")

  try {
    const period = await prisma.payroll_periods.findUnique({ where: { id: BigInt(periodId) }, select: { status: true } })
    if (!period) return fail("Periode tidak ditemukan")
    if (period.status !== "PAID") return fail("Hanya periode PAID yang dapat ditutup")

    await prisma.payroll_periods.update({
      where: { id: BigInt(periodId) },
      data: { status: "CLOSED", closed_at: new Date(), updated_at: new Date() },
    })
    await writeAuditLog({ user: auth.user, action: "UPDATE", modelType: "payroll_periods", modelId: BigInt(periodId), dataBaru: { status: "CLOSED" } })
    revalidatePath(PAGE_PATH)
    revalidatePath(`${PAGE_PATH}/${periodId}`)
    return ok({ id: periodId, status: "CLOSED" })
  } catch {
    return fail("Gagal menutup periode")
  }
}

// ─── Helper: resolve departemen karyawan ─────────────────────────
async function resolveDepartments(employeeIds: bigint[]): Promise<Map<string, string>> {
  if (employeeIds.length === 0) return new Map()
  const karyawans = await prisma.karyawans.findMany({
    where: { id: { in: employeeIds } },
    select: { id: true, divisi_id: true, subdivisi_id: true },
  })
  const subIds = karyawans.map((k) => k.subdivisi_id).filter((x): x is number => x != null)
  const divIds = karyawans.map((k) => k.divisi_id).filter((x): x is number => x != null)

  const [subs, divs] = await Promise.all([
    subIds.length ? prisma.subdivisis.findMany({ where: { id: { in: subIds.map((i) => BigInt(i)) } }, select: { id: true, nama_sub: true, divisi_id: true } }) : Promise.resolve([]),
    divIds.length ? prisma.divisis.findMany({ where: { id: { in: divIds.map((i) => BigInt(i)) } }, select: { id: true, nama_divisi: true } }) : Promise.resolve([]),
  ])
  const subMap = new Map(subs.map((s) => [s.id.toString(), s]))
  const divMap = new Map(divs.map((d) => [d.id.toString(), d.nama_divisi]))

  const result = new Map<string, string>()
  for (const k of karyawans) {
    let dept = "—"
    if (k.subdivisi_id) {
      const sub = subMap.get(String(k.subdivisi_id))
      if (sub) dept = divMap.get(String(sub.divisi_id)) ?? sub.nama_sub
    } else if (k.divisi_id) {
      dept = divMap.get(String(k.divisi_id)) ?? "—"
    }
    result.set(k.id.toString(), dept)
  }
  return result
}

// ─── 5. Ringkasan periode ────────────────────────────────────────
export async function getPayrollPeriodSummary(periodId: number) {
  const auth = await requirePayrollAdmin()
  if ("error" in auth) return fail(auth.error)
  if (!periodId || periodId <= 0) return fail("ID periode tidak valid")

  try {
    const slips = await prisma.payroll_slips.findMany({
      where: { payroll_period_id: BigInt(periodId) },
      select: { employee_id: true, total_earnings: true, total_deductions: true, net_salary: true },
    })
    const deptMap = await resolveDepartments(slips.map((s) => s.employee_id))

    let totalEarnings = 0, totalDeductions = 0, totalNet = 0
    const byDept = new Map<string, { count: number; earnings: number; deductions: number; net: number }>()
    for (const s of slips) {
      const e = Number(s.total_earnings), d = Number(s.total_deductions), n = Number(s.net_salary)
      totalEarnings += e; totalDeductions += d; totalNet += n
      const dept = deptMap.get(s.employee_id.toString()) ?? "—"
      const cur = byDept.get(dept) ?? { count: 0, earnings: 0, deductions: 0, net: 0 }
      cur.count++; cur.earnings += e; cur.deductions += d; cur.net += n
      byDept.set(dept, cur)
    }

    // Ringkasan cicilan pinjaman & penyesuaian pada periode ini.
    const [loanAgg, adjAgg] = await Promise.all([
      prisma.employee_loan_payments.aggregate({ where: { payroll_period_id: BigInt(periodId) }, _sum: { amount: true }, _count: { _all: true } }),
      prisma.payroll_adjustments.groupBy({ by: ["type"], where: { payroll_period_id: BigInt(periodId) }, _sum: { amount: true }, _count: { _all: true } }),
    ])
    const adjEarning = adjAgg.find((a) => a.type === "EARNING")
    const adjDeduction = adjAgg.find((a) => a.type === "DEDUCTION")

    return ok({
      total_karyawan: slips.length,
      total_earnings: Math.round(totalEarnings * 100) / 100,
      total_deductions: Math.round(totalDeductions * 100) / 100,
      total_net: Math.round(totalNet * 100) / 100,
      by_department: Array.from(byDept.entries()).map(([department, v]) => ({ department, ...v })),
      loan_total: Number(loanAgg._sum.amount ?? 0),
      loan_count: loanAgg._count._all,
      adjustment_earning_total: Number(adjEarning?._sum.amount ?? 0),
      adjustment_deduction_total: Number(adjDeduction?._sum.amount ?? 0),
      adjustment_count: (adjEarning?._count._all ?? 0) + (adjDeduction?._count._all ?? 0),
    })
  } catch {
    return fail("Gagal memuat ringkasan periode")
  }
}

// ─── List periode ────────────────────────────────────────────────
export async function getPayrollPeriods() {
  const auth = await requirePayrollAdmin()
  if ("error" in auth) return fail(auth.error)
  try {
    const periods = await prisma.payroll_periods.findMany({
      orderBy: [{ period_year: "desc" }, { period_month: "desc" }],
      include: { _count: { select: { payroll_slips: true } } },
    })
    return ok(serialize(periods))
  } catch {
    return fail("Gagal memuat daftar periode")
  }
}

// ─── Detail periode (info + slip per karyawan) ───────────────────
export async function getPayrollPeriodDetail(periodId: number) {
  const auth = await requirePayrollAdmin()
  if ("error" in auth) return fail(auth.error)
  if (!periodId || periodId <= 0) return fail("ID periode tidak valid")

  try {
    const period = await prisma.payroll_periods.findUnique({ where: { id: BigInt(periodId) } })
    if (!period) return fail("Periode tidak ditemukan")

    const slips = await prisma.payroll_slips.findMany({
      where: { payroll_period_id: BigInt(periodId) },
      include: { karyawans: { select: { id: true, nik: true, nama_karyawan: true, jabatan: true } } },
      orderBy: { id: "asc" },
    })
    const deptMap = await resolveDepartments(slips.map((s) => s.employee_id))

    const rows = slips.map((s) => ({
      id: Number(s.id),
      employee_id: Number(s.employee_id),
      nama: s.karyawans.nama_karyawan,
      nik: s.karyawans.nik,
      jabatan: s.karyawans.jabatan,
      department: deptMap.get(s.employee_id.toString()) ?? "—",
      working_days: s.working_days,
      total_earnings: Number(s.total_earnings),
      total_deductions: Number(s.total_deductions),
      net_salary: Number(s.net_salary),
      status: s.status,
    }))

    return ok({ period: serialize(period), slips: rows })
  } catch {
    return fail("Gagal memuat detail periode")
  }
}

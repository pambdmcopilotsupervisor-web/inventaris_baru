/**
 * Payroll Engine — pure function (tanpa side-effect DB).
 *
 * calculateEmployeePayroll() menghitung slip gaji satu karyawan untuk satu
 * periode, dengan urutan kalkulasi yang ketat:
 *   1. EARNING (FIXED/PERCENT) urut calc_order
 *   2. DEDUCTION (FIXED/PERCENT) urut calc_order
 *   3. Potongan absensi per aturan aktif
 *   4. FORMULA (EARNING & DEDUCTION) urut calc_order — bisa akses semua nilai di atas
 *   5. Akumulasi total
 */

import { create, all } from "mathjs"
import {
  computeRuleDeduction,
  type DeductionRuleConfig,
  type DeductionTier,
} from "@/lib/payroll/deduction-engine"
import {
  computeBpjs,
  computePph21,
  computePph21AnnualTax,
  computePph21Ter,
  computePph21TerDecember,
  type BpjsSettingInput,
  type TaxBracket,
  type TerRate,
  type BpjsResult,
  type Pph21Result,
} from "@/lib/payroll/tax-engine"

// ─── mathjs terbatas (aman) ──────────────────────────────────────
const math = create(all, {})
const parseFormula = math.parse.bind(math)
// Nonaktifkan fungsi yang berisiko keamanan.
math.import(
  {
    import: function () { throw new Error("disabled") },
    createUnit: function () { throw new Error("disabled") },
    evaluate: function () { throw new Error("disabled") },
    parse: function () { throw new Error("disabled") },
    simplify: function () { throw new Error("disabled") },
    derivative: function () { throw new Error("disabled") },
  },
  { override: true },
)

function evaluateFormula(expression: string, scope: Record<string, number>): { value: number; error: string | null } {
  try {
    const node = parseFormula(expression)
    const result = node.evaluate(scope)
    const num = typeof result === "number" ? result : Number(result)
    if (!Number.isFinite(num)) return { value: 0, error: "hasil formula bukan angka valid" }
    return { value: num, error: null }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "formula tidak dapat dievaluasi"
    return { value: 0, error: msg }
  }
}

/** Pembulatan ke rupiah utuh (IDR tanpa pecahan). Hindari float drift pada akumulasi. */
function roundRp(n: number): number {
  return Math.round(n)
}

// ─── Tipe Input/Output ───────────────────────────────────────────
export type ComponentType = "EARNING" | "DEDUCTION"
export type CalcMethod = "FIXED" | "PERCENT" | "FORMULA"

export interface EffectiveComponent {
  component_id: number
  code: string
  name: string
  type: ComponentType
  calc_method: CalcMethod
  /** Nominal (FIXED) atau persentase (PERCENT). Diabaikan untuk FORMULA. */
  value: number
  formula_expression: string | null
  basis_component_id: number | null
  basis_code: string | null
  calc_order: number
  is_taxable: boolean
  is_prorata: boolean
  is_thr_basis: boolean
}

export interface AttendanceRecap {
  working_days: number
  present_days: number
  alpha_days: number
  late_minutes: number
  early_leave_minutes: number
  sick_no_cert_days: number
  overtime_minutes: number
  overtime_amount: number
}

export interface EngineDeductionRule {
  id: number
  name: string
  trigger_type: DeductionRuleConfig["trigger_type"]
  calc_method: DeductionRuleConfig["calc_method"]
  basis_code: string | null
  value: number
  working_days: number
  tolerance_minutes: number | null
  max_deduction_per_month: number | null
  tiers: DeductionTier[]
}

export interface PayrollEngineInput {
  employee_id: string
  period_month: number
  period_year: number
  salary_components: EffectiveComponent[]
  attendance_recap: AttendanceRecap
  deduction_rules: EngineDeductionRule[]
  working_days_standard: number
  /** Faktor prorata 0..1 (karyawan masuk/keluar tengah bulan). Default 1. */
  prorata_factor?: number
  /** Potongan tambahan non-pajak (mis. cicilan pinjaman). Dikurangkan dari net. */
  extra_deductions?: { component_id?: number | null; code: string; name: string; amount: number; category?: "LOAN" | "OTHER"; notes?: string | null }[]
  /** Pembulatan gaji bersih ke kelipatan (mis. 1000). 0 = tanpa pembulatan. */
  round_net_to?: number
  /** Konfigurasi pajak & BPJS (opsional; bila tidak ada, BPJS/PPh dilewati). */
  tax?: PayrollTaxInput | null
}

export interface PayrollLineItem {
  component_id: number | null
  code: string
  name: string
  type: ComponentType
  category: "SALARY" | "ATTENDANCE_DEDUCTION" | "TAX" | "BPJS" | "LOAN" | "OTHER"
  calc_method: CalcMethod | "RULE"
  basis_value: number
  quantity: number
  amount: number
  is_taxable: boolean
  notes: string | null
}

/** Konfigurasi pajak untuk satu karyawan (sudah diresolusi). */
export interface PayrollTaxInput {
  bpjs_enabled: boolean
  pph21_enabled: boolean
  bpjs_settings: BpjsSettingInput[]
  biaya_jabatan_pct: number
  biaya_jabatan_max_month: number
  ptkp_yearly: number
  brackets: TaxBracket[]
  has_npwp: boolean
  npwp_surcharge_pct: number
  pembulatan_pkp: number
  /** Metode PPh21: PROGRESIF (disetahunkan) atau TER (PP 58/2023). */
  metode?: "PROGRESIF" | "TER"
  /** Tarif TER untuk kategori karyawan (dipakai bila metode = TER). */
  ter_rates?: TerRate[]
  /** Apakah periode ini bulan Desember (rekonsiliasi tahunan TER). */
  is_december?: boolean
  /** Akumulasi Jan..(bulan−1) untuk rekonsiliasi Desember TER. */
  ytd?: { bruto: number; bpjs_deductible: number; pph_withheld: number }
}

export interface TaxBreakdown {
  bpjs: BpjsResult | null
  pph21: Pph21Result | null
}

export interface PayrollEngineResult {
  earnings: PayrollLineItem[]
  deductions: PayrollLineItem[]
  attendance_deductions: PayrollLineItem[]
  total_earnings: number
  total_deductions: number
  net_salary: number
  tax_breakdown: TaxBreakdown | null
  warnings: string[]
}

function categoryOf(c: EffectiveComponent): PayrollLineItem["category"] {
  if (c.calc_method === "FORMULA" && c.type === "DEDUCTION") {
    // Heuristik: komponen pajak biasanya berkode mengandung "PPH"/"PAJAK"/"TAX".
    if (/PPH|PAJAK|TAX/i.test(c.code)) return "TAX"
  }
  return c.type === "DEDUCTION" ? "OTHER" : "SALARY"
}

/**
 * Hitung payroll satu karyawan. Pure & deterministik.
 */
export function calculateEmployeePayroll(input: PayrollEngineInput): PayrollEngineResult {
  const { salary_components, attendance_recap, deduction_rules } = input
  const workingDays = input.working_days_standard > 0 ? input.working_days_standard : 22

  const earnings: PayrollLineItem[] = []
  const deductions: PayrollLineItem[] = []
  const attendanceDeductions: PayrollLineItem[] = []
  const warnings: string[] = []

  // Peta nilai per kode komponen (untuk basis & formula).
  const values: Record<string, number> = {}

  const sorted = [...salary_components].sort((a, b) => a.calc_order - b.calc_order)
  const fixedPercent = sorted.filter((c) => c.calc_method !== "FORMULA")
  const formulas = sorted.filter((c) => c.calc_method === "FORMULA")

  const recordValue = (code: string, amount: number) => { values[code] = amount }

  // Faktor prorata (karyawan masuk/keluar tengah bulan); 1 = sebulan penuh.
  const prorataFactor = input.prorata_factor != null && input.prorata_factor > 0 && input.prorata_factor <= 1
    ? input.prorata_factor
    : 1

  // ── Step 1: EARNING (FIXED/PERCENT) ──
  for (const c of fixedPercent.filter((x) => x.type === "EARNING")) {
    let amount = 0
    let basisValue = 0
    if (c.calc_method === "FIXED") {
      amount = c.value
    } else {
      basisValue = c.basis_code ? values[c.basis_code] ?? 0 : 0
      amount = (basisValue * c.value) / 100
    }
    // Prorata hanya untuk komponen yang ditandai is_prorata.
    if (c.is_prorata && prorataFactor < 1) amount = amount * prorataFactor
    amount = roundRp(amount)
    recordValue(c.code, amount)
    earnings.push({
      component_id: c.component_id, code: c.code, name: c.name, type: "EARNING",
      category: categoryOf(c), calc_method: c.calc_method, basis_value: basisValue,
      quantity: 1, amount, is_taxable: c.is_taxable, notes: null,
    })
  }

  // ── Step 2: DEDUCTION (FIXED/PERCENT) ──
  for (const c of fixedPercent.filter((x) => x.type === "DEDUCTION")) {
    let amount = 0
    let basisValue = 0
    if (c.calc_method === "FIXED") {
      amount = c.value
    } else {
      basisValue = c.basis_code ? values[c.basis_code] ?? 0 : 0
      amount = (basisValue * c.value) / 100
    }
    amount = roundRp(amount)
    recordValue(c.code, amount)
    deductions.push({
      component_id: c.component_id, code: c.code, name: c.name, type: "DEDUCTION",
      category: categoryOf(c), calc_method: c.calc_method, basis_value: basisValue,
      quantity: 1, amount, is_taxable: false, notes: null,
    })
  }

  // ── Step 3: Potongan absensi per aturan aktif ──
  let totalAttendanceDeduction = 0
  for (const rule of deduction_rules) {
    const basisValue = rule.basis_code ? values[rule.basis_code] ?? 0 : 0
    const config: DeductionRuleConfig = {
      trigger_type: rule.trigger_type,
      calc_method: rule.calc_method,
      value: rule.value,
      working_days: rule.working_days > 0 ? rule.working_days : workingDays,
      tolerance_minutes: rule.tolerance_minutes,
      max_deduction_per_month: rule.max_deduction_per_month,
    }
    const res = computeRuleDeduction(config, rule.tiers, {
      alfa_days: attendance_recap.alpha_days,
      late_minutes: attendance_recap.late_minutes,
      early_leave_minutes: attendance_recap.early_leave_minutes,
      sick_no_cert_days: attendance_recap.sick_no_cert_days,
      basis_value: basisValue,
    })
    if (res.total_deduction > 0) {
      totalAttendanceDeduction += res.total_deduction
      attendanceDeductions.push({
        component_id: null, code: `RULE_${rule.id}`, name: rule.name, type: "DEDUCTION",
        category: "ATTENDANCE_DEDUCTION", calc_method: "RULE", basis_value: basisValue,
        quantity: 1, amount: roundRp(res.total_deduction), is_taxable: false,
        notes: res.breakdown.map((b) => `${b.label}: ${b.detail}`).join("; ") || null,
      })
    }
  }
  totalAttendanceDeduction = roundRp(totalAttendanceDeduction)

  // Variabel agregat untuk FORMULA.
  const sumEarnings = () => roundRp(earnings.reduce((s, e) => s + e.amount, 0))
  const sumTaxable = () => roundRp(earnings.filter((e) => e.is_taxable).reduce((s, e) => s + e.amount, 0))

  // ── Step 4: FORMULA (urut calc_order) ──
  for (const c of formulas) {
    const scope: Record<string, number> = {
      ...values,
      total_earnings: sumEarnings(),
      total_taxable: sumTaxable(),
      total_attendance_deduction: totalAttendanceDeduction,
      working_days: attendance_recap.working_days || workingDays,
      present_days: attendance_recap.present_days,
      alpha_days: attendance_recap.alpha_days,
      late_minutes: attendance_recap.late_minutes,
      early_leave_minutes: attendance_recap.early_leave_minutes,
      sick_no_cert_days: attendance_recap.sick_no_cert_days,
      overtime_minutes: attendance_recap.overtime_minutes,
      overtime_amount: attendance_recap.overtime_amount,
    }
    const evalResult = c.formula_expression ? evaluateFormula(c.formula_expression, scope) : { value: 0, error: null }
    const amount = roundRp(evalResult.value)
    if (evalResult.error) warnings.push(`Formula "${c.code}" gagal: ${evalResult.error}`)
    recordValue(c.code, amount)
    const item: PayrollLineItem = {
      component_id: c.component_id, code: c.code, name: c.name, type: c.type,
      category: categoryOf(c), calc_method: "FORMULA", basis_value: 0,
      quantity: 1, amount, is_taxable: c.is_taxable, notes: evalResult.error ? `⚠ ${evalResult.error}` : c.formula_expression,
    }
    if (c.type === "EARNING") earnings.push(item)
    else deductions.push(item)
  }

  // ── Step 5: BPJS & PPh21 (compliance) ──
  let taxBreakdown: TaxBreakdown | null = null
  if (input.tax) {
    const tax = input.tax
    let bpjsResult: BpjsResult | null = null
    let pph21Result: Pph21Result | null = null

    // BPJS — porsi karyawan jadi potongan; porsi perusahaan disimpan untuk laporan.
    if (tax.bpjs_enabled && tax.bpjs_settings.length > 0) {
      bpjsResult = computeBpjs(tax.bpjs_settings, values)
      for (const l of bpjsResult.lines) {
        if (l.employee_amount <= 0) continue
        deductions.push({
          component_id: null, code: `BPJS_${l.kode}`, name: l.nama, type: "DEDUCTION",
          category: "BPJS", calc_method: "RULE", basis_value: l.base, quantity: 1,
          amount: l.employee_amount, is_taxable: false,
          notes: `Porsi karyawan; perusahaan ${l.employer_amount}`,
        })
      }
    }

    // PPh21 — atas penghasilan bruto kena pajak (earnings is_taxable + porsi perusahaan BPJS taxable).
    if (tax.pph21_enabled) {
      const taxableEarnings = roundRp(earnings.filter((e) => e.is_taxable).reduce((s, e) => s + e.amount, 0))
      const bpjsTaxableAdd = bpjsResult?.taxable_addition ?? 0
      const bpjsDeductible = bpjsResult?.deductible ?? 0
      let pphNotes = ""

      if (tax.metode === "TER" && tax.ter_rates && tax.ter_rates.length > 0) {
        if (tax.is_december) {
          // Rekonsiliasi Desember: progresif setahun − PPh terpotong Jan–Nov.
          const dec = computePph21TerDecember({
            taxable_earnings_month: taxableEarnings,
            bpjs_taxable_addition_month: bpjsTaxableAdd,
            bpjs_deductible_month: bpjsDeductible,
            ytd_bruto: tax.ytd?.bruto ?? 0,
            ytd_bpjs_deductible: tax.ytd?.bpjs_deductible ?? 0,
            ytd_pph_withheld: tax.ytd?.pph_withheld ?? 0,
            biaya_jabatan_pct: tax.biaya_jabatan_pct,
            biaya_jabatan_max_month: tax.biaya_jabatan_max_month,
            ptkp_yearly: tax.ptkp_yearly,
            brackets: tax.brackets,
            has_npwp: tax.has_npwp,
            npwp_surcharge_pct: tax.npwp_surcharge_pct,
          })
          pph21Result = {
            pph_month: dec.pph_month,
            bruto_month: roundRp(taxableEarnings + bpjsTaxableAdd),
            biaya_jabatan_month: 0,
            netto_month: 0,
            netto_year: dec.netto_year,
            pkp_year: dec.pkp_year,
            pph_year: dec.pph_year,
            npwp_surcharge_applied: !tax.has_npwp && tax.npwp_surcharge_pct > 0,
          }
          pphNotes = `TER Desember: setahun ${dec.pph_year} − terpotong ${dec.pph_withheld}`
        } else {
          const ter = computePph21Ter({
            taxable_earnings_month: taxableEarnings,
            bpjs_taxable_addition_month: bpjsTaxableAdd,
            ter_rates: tax.ter_rates,
          })
          pph21Result = {
            pph_month: ter.pph_month,
            bruto_month: ter.bruto_month,
            biaya_jabatan_month: 0,
            netto_month: 0,
            netto_year: 0,
            pkp_year: 0,
            pph_year: 0,
            npwp_surcharge_applied: false,
          }
          pphNotes = `TER ${ter.ter_rate}% × ${ter.bruto_month}`
        }
      } else {
        pph21Result = computePph21({
          taxable_earnings_month: taxableEarnings,
          bpjs_taxable_addition_month: bpjsTaxableAdd,
          bpjs_deductible_month: bpjsDeductible,
          biaya_jabatan_pct: tax.biaya_jabatan_pct,
          // Biaya jabatan diprorata untuk karyawan masuk/keluar tengah bulan.
          biaya_jabatan_max_month: roundRp(tax.biaya_jabatan_max_month * prorataFactor),
          ptkp_yearly: tax.ptkp_yearly,
          brackets: tax.brackets,
          has_npwp: tax.has_npwp,
          npwp_surcharge_pct: tax.npwp_surcharge_pct,
          pembulatan_pkp: tax.pembulatan_pkp,
        })
        pphNotes = `PKP setahun ${pph21Result.pkp_year}${pph21Result.npwp_surcharge_applied ? " (+20% tanpa NPWP)" : ""}`
      }

      if (pph21Result.pph_month > 0) {
        deductions.push({
          component_id: null, code: "PPH21", name: "PPh 21", type: "DEDUCTION",
          category: "TAX", calc_method: "RULE", basis_value: pph21Result.bruto_month, quantity: 1,
          amount: pph21Result.pph_month, is_taxable: false,
          notes: pphNotes,
        })
      }
    }

    taxBreakdown = { bpjs: bpjsResult, pph21: pph21Result }
  }

  // ── Step 5b: Potongan tambahan (cicilan pinjaman, dll.) ──
  if (input.extra_deductions && input.extra_deductions.length > 0) {
    for (const ed of input.extra_deductions) {
      const amount = roundRp(ed.amount)
      if (amount <= 0) continue
      deductions.push({
        component_id: ed.component_id ?? null,
        code: ed.code,
        name: ed.name,
        type: "DEDUCTION",
        category: ed.category ?? "LOAN",
        calc_method: "RULE",
        basis_value: 0,
        quantity: 1,
        amount,
        is_taxable: false,
        notes: ed.notes ?? null,
      })
    }
  }

  // ── Step 6: Akumulasi total ──
  const total_earnings = roundRp(earnings.reduce((s, e) => s + e.amount, 0))
  let total_deductions = roundRp(
    deductions.reduce((s, d) => s + d.amount, 0) + totalAttendanceDeduction,
  )
  let net_salary = roundRp(total_earnings - total_deductions)

  // ── Step 7: Pembulatan gaji bersih (opsional) ──
  // Selisih pembulatan dicatat sebagai baris agar total tetap konsisten (E − D = net).
  const roundTo = input.round_net_to ?? 0
  if (roundTo > 1) {
    const rounded = Math.round(net_salary / roundTo) * roundTo
    const diff = rounded - net_salary
    if (diff !== 0) {
      if (diff > 0) {
        // Dibulatkan ke atas → tambah pendapatan "Pembulatan".
        earnings.push({
          component_id: null, code: "PEMBULATAN", name: "Pembulatan", type: "EARNING",
          category: "OTHER", calc_method: "RULE", basis_value: 0, quantity: 1,
          amount: diff, is_taxable: false, notes: `Pembulatan ke kelipatan ${roundTo}`,
        })
      } else {
        // Dibulatkan ke bawah → tambah potongan "Pembulatan".
        deductions.push({
          component_id: null, code: "PEMBULATAN", name: "Pembulatan", type: "DEDUCTION",
          category: "OTHER", calc_method: "RULE", basis_value: 0, quantity: 1,
          amount: -diff, is_taxable: false, notes: `Pembulatan ke kelipatan ${roundTo}`,
        })
        total_deductions = roundRp(total_deductions + (-diff))
      }
      net_salary = rounded
    }
  }

  const final_total_earnings = roundRp(earnings.reduce((s, e) => s + e.amount, 0))

  return {
    earnings,
    deductions,
    attendance_deductions: attendanceDeductions,
    total_earnings: final_total_earnings,
    total_deductions,
    net_salary,
    tax_breakdown: taxBreakdown,
    warnings,
  }
}

// ─── Run non-rutin: THR / Bonus ──────────────────────────────────
export interface SpecialPayrollInput {
  run_type: "THR" | "BONUS"
  label: string
  /** Komponen efektif karyawan (untuk menghitung basis is_thr_basis). */
  components: EffectiveComponent[]
  /** THR: faktor masa kerja (0..1). BONUS: pengali (mis. 1, 2). */
  factor: number
  /** Total penghasilan bruto kena pajak bulanan reguler (untuk metode selisih PPh). */
  regular_monthly_taxable: number
  /** Penyesuaian sekali jalan tipe pendapatan (one-time). */
  extra_earnings?: { code: string; name: string; amount: number; is_taxable: boolean; notes?: string | null }[]
  /** Potongan tambahan (penyesuaian deduction + cicilan pinjaman). */
  extra_deductions?: { code: string; name: string; amount: number; category?: "LOAN" | "OTHER"; notes?: string | null }[]
  /** Pembulatan gaji bersih ke kelipatan (0 = tanpa). */
  round_net_to?: number
  tax?: PayrollTaxInput | null
}

/** Resolusi nilai komponen is_thr_basis menjadi nominal (FIXED & PERCENT). */
function resolveThrBasis(components: EffectiveComponent[]): { basis: number; basisTaxable: number } {
  const fixedByCode: Record<string, number> = {}
  for (const c of components) if (c.calc_method === "FIXED") fixedByCode[c.code] = c.value

  let basis = 0
  let basisTaxable = 0
  for (const c of components) {
    if (!c.is_thr_basis) continue
    let amount = 0
    if (c.calc_method === "FIXED") amount = c.value
    else if (c.calc_method === "PERCENT") amount = ((c.basis_code ? fixedByCode[c.basis_code] ?? 0 : 0) * c.value) / 100
    else continue // FORMULA tidak dipakai sebagai basis THR
    amount = roundRp(amount)
    basis += amount
    if (c.is_taxable) basisTaxable += amount
  }
  return { basis: roundRp(basis), basisTaxable: roundRp(basisTaxable) }
}

/**
 * Hitung payroll non-rutin (THR/Bonus). PPh21 memakai metode selisih:
 * PPh(reguler setahun + THR taxable) − PPh(reguler setahun).
 */
export function computeSpecialPayroll(input: SpecialPayrollInput): PayrollEngineResult {
  const { basis, basisTaxable } = resolveThrBasis(input.components)
  const amount = roundRp(basis * input.factor)
  const thrTaxable = roundRp(basisTaxable * input.factor)

  const earnings: PayrollLineItem[] = [{
    component_id: null,
    code: input.run_type,
    name: input.label,
    type: "EARNING",
    category: "SALARY",
    calc_method: "RULE",
    basis_value: basis,
    quantity: input.factor,
    amount,
    is_taxable: true,
    notes: `${basis} × ${input.factor}`,
  }]

  // Penyesuaian sekali jalan tipe pendapatan.
  let extraTaxable = 0
  for (const ee of input.extra_earnings ?? []) {
    const amt = roundRp(ee.amount)
    if (amt <= 0) continue
    if (ee.is_taxable) extraTaxable += amt
    earnings.push({
      component_id: null, code: ee.code, name: ee.name, type: "EARNING",
      category: "OTHER", calc_method: "RULE", basis_value: 0, quantity: 1,
      amount: amt, is_taxable: ee.is_taxable, notes: ee.notes ?? null,
    })
  }
  const totalTaxable = roundRp(thrTaxable + extraTaxable)

  const deductions: PayrollLineItem[] = []
  let pph = 0
  let pphReg = 0
  let pphWith = 0
  if (input.tax?.pph21_enabled && totalTaxable > 0) {
    const t = input.tax
    const regularYear = input.regular_monthly_taxable * 12
    const annualBase = {
      biaya_jabatan_pct: t.biaya_jabatan_pct,
      biaya_jabatan_max_month: t.biaya_jabatan_max_month,
      ptkp_yearly: t.ptkp_yearly,
      brackets: t.brackets,
      has_npwp: t.has_npwp,
      npwp_surcharge_pct: t.npwp_surcharge_pct,
    }
    pphReg = computePph21AnnualTax({ bruto_year: regularYear, ...annualBase })
    pphWith = computePph21AnnualTax({ bruto_year: regularYear + totalTaxable, ...annualBase })
    pph = Math.max(0, roundRp(pphWith - pphReg))
    if (pph > 0) {
      deductions.push({
        component_id: null,
        code: "PPH21",
        name: "PPh 21 atas " + (input.run_type === "THR" ? "THR" : "Bonus"),
        type: "DEDUCTION",
        category: "TAX",
        calc_method: "RULE",
        basis_value: totalTaxable,
        quantity: 1,
        amount: pph,
        is_taxable: false,
        notes: `Selisih PPh tahunan (${pphWith} − ${pphReg})`,
      })
    }
  }

  // Potongan tambahan (penyesuaian deduction + cicilan pinjaman).
  for (const ed of input.extra_deductions ?? []) {
    const amt = roundRp(ed.amount)
    if (amt <= 0) continue
    deductions.push({
      component_id: null, code: ed.code, name: ed.name, type: "DEDUCTION",
      category: ed.category ?? "OTHER", calc_method: "RULE", basis_value: 0, quantity: 1,
      amount: amt, is_taxable: false, notes: ed.notes ?? null,
    })
  }

  let total_earnings = roundRp(earnings.reduce((s, e) => s + e.amount, 0))
  let total_deductions = roundRp(deductions.reduce((s, d) => s + d.amount, 0))
  let net_salary = roundRp(total_earnings - total_deductions)

  // Pembulatan gaji bersih (opsional) — selisih dicatat sebagai baris.
  const roundTo = input.round_net_to ?? 0
  if (roundTo > 1) {
    const rounded = Math.round(net_salary / roundTo) * roundTo
    const diff = rounded - net_salary
    if (diff !== 0) {
      if (diff > 0) {
        earnings.push({ component_id: null, code: "PEMBULATAN", name: "Pembulatan", type: "EARNING", category: "OTHER", calc_method: "RULE", basis_value: 0, quantity: 1, amount: diff, is_taxable: false, notes: `Pembulatan ke kelipatan ${roundTo}` })
        total_earnings = roundRp(total_earnings + diff)
      } else {
        deductions.push({ component_id: null, code: "PEMBULATAN", name: "Pembulatan", type: "DEDUCTION", category: "OTHER", calc_method: "RULE", basis_value: 0, quantity: 1, amount: -diff, is_taxable: false, notes: `Pembulatan ke kelipatan ${roundTo}` })
        total_deductions = roundRp(total_deductions + (-diff))
      }
      net_salary = rounded
    }
  }

  return {
    earnings,
    deductions,
    attendance_deductions: [],
    total_earnings,
    total_deductions,
    net_salary,
    tax_breakdown: input.tax?.pph21_enabled
      ? { bpjs: null, pph21: { pph_month: pph, bruto_month: roundRp(amount + extraTaxable), biaya_jabatan_month: 0, netto_month: amount, netto_year: 0, pkp_year: 0, pph_year: pph, npwp_surcharge_applied: !input.tax.has_npwp && input.tax.npwp_surcharge_pct > 0 } }
      : null,
    warnings: [],
  }
}

/**
 * Tax Engine — BPJS & PPh21 (pure, tanpa side-effect DB).
 *
 * PPh21 memakai metode progresif-disetahunkan (PER-16/PJ-2016):
 *   bruto bulanan → biaya jabatan & pengurang BPJS → netto → ×12 →
 *   dikurangi PTKP → PKP → tarif progresif (UU HPP) → ÷12.
 * BPJS: porsi karyawan & perusahaan dengan ceiling (batas atas upah).
 */

function round0(n: number): number {
  return Math.round(n)
}

// ─── BPJS ────────────────────────────────────────────────────────
export interface BpjsSettingInput {
  kode: string
  nama: string
  rate_karyawan: number
  rate_perusahaan: number
  batas_atas_upah: number | null
  basis_code: string
  menambah_bruto_pajak: boolean
  pengurang_pajak: boolean
}

export interface BpjsLine {
  kode: string
  nama: string
  base: number
  employee_amount: number
  employer_amount: number
}

export interface BpjsResult {
  lines: BpjsLine[]
  total_employee: number
  total_employer: number
  /** Porsi perusahaan yang menambah penghasilan bruto kena pajak. */
  taxable_addition: number
  /** Porsi karyawan yang menjadi pengurang penghasilan bruto (JHT/JP). */
  deductible: number
}

export function computeBpjs(settings: BpjsSettingInput[], basisByCode: Record<string, number>): BpjsResult {
  const lines: BpjsLine[] = []
  let totalEmployee = 0
  let totalEmployer = 0
  let taxableAddition = 0
  let deductible = 0

  for (const s of settings) {
    const basis = basisByCode[s.basis_code] ?? 0
    const capped = s.batas_atas_upah != null ? Math.min(basis, s.batas_atas_upah) : basis
    const employee = round0((capped * s.rate_karyawan) / 100)
    const employer = round0((capped * s.rate_perusahaan) / 100)
    if (employee === 0 && employer === 0) continue
    lines.push({ kode: s.kode, nama: s.nama, base: capped, employee_amount: employee, employer_amount: employer })
    totalEmployee += employee
    totalEmployer += employer
    if (s.menambah_bruto_pajak) taxableAddition += employer
    if (s.pengurang_pajak) deductible += employee
  }

  return {
    lines,
    total_employee: round0(totalEmployee),
    total_employer: round0(totalEmployer),
    taxable_addition: round0(taxableAddition),
    deductible: round0(deductible),
  }
}

// ─── PPh21 ───────────────────────────────────────────────────────
export interface TaxBracket {
  batas_bawah: number
  batas_atas: number | null
  tarif_persen: number
}

export interface Pph21Input {
  taxable_earnings_month: number
  bpjs_taxable_addition_month: number
  bpjs_deductible_month: number
  biaya_jabatan_pct: number
  biaya_jabatan_max_month: number
  ptkp_yearly: number
  brackets: TaxBracket[]
  has_npwp: boolean
  npwp_surcharge_pct: number
  pembulatan_pkp: number
}

export interface Pph21Result {
  pph_month: number
  bruto_month: number
  biaya_jabatan_month: number
  netto_month: number
  netto_year: number
  pkp_year: number
  pph_year: number
  npwp_surcharge_applied: boolean
}

/** Tarif progresif berlapis. */
function progressiveTax(pkp: number, brackets: TaxBracket[]): number {
  if (pkp <= 0) return 0
  const sorted = [...brackets].sort((a, b) => a.batas_bawah - b.batas_bawah)
  let tax = 0
  for (const b of sorted) {
    if (pkp <= b.batas_bawah) break
    const upper = b.batas_atas ?? Number.POSITIVE_INFINITY
    const taxableInLayer = Math.min(pkp, upper) - b.batas_bawah
    if (taxableInLayer > 0) tax += (taxableInLayer * b.tarif_persen) / 100
  }
  return tax
}

export function computePph21(input: Pph21Input): Pph21Result {
  const bruto = input.taxable_earnings_month + input.bpjs_taxable_addition_month
  const biayaJabatan = Math.min((bruto * input.biaya_jabatan_pct) / 100, input.biaya_jabatan_max_month)
  const netto = Math.max(0, bruto - biayaJabatan - input.bpjs_deductible_month)
  const nettoYear = netto * 12

  let pkp = Math.max(0, nettoYear - input.ptkp_yearly)
  if (input.pembulatan_pkp > 0) pkp = Math.floor(pkp / input.pembulatan_pkp) * input.pembulatan_pkp

  let pphYear = progressiveTax(pkp, input.brackets)
  const npwpSurcharge = !input.has_npwp && input.npwp_surcharge_pct > 0
  if (npwpSurcharge) pphYear *= 1 + input.npwp_surcharge_pct / 100

  const pphMonth = round0(pphYear / 12)

  return {
    pph_month: pphMonth,
    bruto_month: round0(bruto),
    biaya_jabatan_month: round0(biayaJabatan),
    netto_month: round0(netto),
    netto_year: round0(nettoYear),
    pkp_year: round0(pkp),
    pph_year: round0(pphYear),
    npwp_surcharge_applied: npwpSurcharge,
  }
}

// ─── PPh21 atas penghasilan TAHUNAN (untuk metode selisih THR/Bonus) ─
export interface Pph21AnnualInput {
  bruto_year: number
  biaya_jabatan_pct: number
  biaya_jabatan_max_month: number
  ptkp_yearly: number
  brackets: TaxBracket[]
  has_npwp: boolean
  npwp_surcharge_pct: number
}

/** Hitung PPh21 setahun atas penghasilan bruto setahun. */
export function computePph21AnnualTax(input: Pph21AnnualInput): number {
  const biayaJabatan = Math.min((input.bruto_year * input.biaya_jabatan_pct) / 100, input.biaya_jabatan_max_month * 12)
  const netto = Math.max(0, input.bruto_year - biayaJabatan)
  const pkp = Math.max(0, netto - input.ptkp_yearly)
  let pph = progressiveTax(pkp, input.brackets)
  if (!input.has_npwp && input.npwp_surcharge_pct > 0) pph *= 1 + input.npwp_surcharge_pct / 100
  return round0(pph)
}

// ─── PPh21 metode TER (PP 58/2023) ───────────────────────────────
export interface TerRate {
  bruto_min: number
  bruto_max: number | null
  tarif_persen: number
}

/** Cari tarif TER (%) untuk bruto bulanan pada kategori tertentu. */
export function findTerRate(rates: TerRate[], bruto: number): number {
  for (const r of rates) {
    if (bruto >= r.bruto_min && (r.bruto_max === null || bruto <= r.bruto_max)) return r.tarif_persen
  }
  return 0
}

export interface TerMonthlyInput {
  taxable_earnings_month: number
  bpjs_taxable_addition_month: number
  ter_rates: TerRate[]
}

export interface TerMonthlyResult {
  bruto_month: number
  ter_rate: number
  pph_month: number
}

/** PPh21 bulanan metode TER: bruto × tarif efektif. */
export function computePph21Ter(input: TerMonthlyInput): TerMonthlyResult {
  const bruto = round0(input.taxable_earnings_month + input.bpjs_taxable_addition_month)
  const rate = findTerRate(input.ter_rates, bruto)
  return { bruto_month: bruto, ter_rate: rate, pph_month: round0((bruto * rate) / 100) }
}

export interface TerDecemberInput {
  // Bulan berjalan (Desember)
  taxable_earnings_month: number
  bpjs_taxable_addition_month: number
  bpjs_deductible_month: number
  // Akumulasi Januari..November (dari slip terdahulu)
  ytd_bruto: number
  ytd_bpjs_deductible: number
  ytd_pph_withheld: number
  // Parameter tahunan
  biaya_jabatan_pct: number
  biaya_jabatan_max_month: number
  ptkp_yearly: number
  brackets: TaxBracket[]
  has_npwp: boolean
  npwp_surcharge_pct: number
}

export interface TerDecemberResult {
  bruto_year: number
  netto_year: number
  pkp_year: number
  pph_year: number
  pph_withheld: number
  pph_month: number
}

/** Rekonsiliasi Desember: PPh setahun (progresif) − PPh terpotong Jan–Nov. */
export function computePph21TerDecember(input: TerDecemberInput): TerDecemberResult {
  const brutoDec = input.taxable_earnings_month + input.bpjs_taxable_addition_month
  const brutoYear = input.ytd_bruto + brutoDec
  const biayaJabatanYear = Math.min((brutoYear * input.biaya_jabatan_pct) / 100, input.biaya_jabatan_max_month * 12)
  const bpjsDeductibleYear = input.ytd_bpjs_deductible + input.bpjs_deductible_month
  const netto = Math.max(0, brutoYear - biayaJabatanYear - bpjsDeductibleYear)
  const pkp = Math.max(0, netto - input.ptkp_yearly)
  let pphYear = progressiveTax(pkp, input.brackets)
  if (!input.has_npwp && input.npwp_surcharge_pct > 0) pphYear *= 1 + input.npwp_surcharge_pct / 100
  pphYear = round0(pphYear)
  const pphMonth = Math.max(0, round0(pphYear - input.ytd_pph_withheld))
  return {
    bruto_year: round0(brutoYear),
    netto_year: round0(netto),
    pkp_year: round0(pkp),
    pph_year: pphYear,
    pph_withheld: round0(input.ytd_pph_withheld),
    pph_month: pphMonth,
  }
}

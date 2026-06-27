/**
 * Engine kalkulasi potongan absensi — pure & deterministik.
 * Dipakai oleh simulator (server action) maupun engine payroll.
 * Bukan file "use server" agar fungsi sinkron dapat diekspor & dipakai bersama.
 */

export interface DeductionTier {
  late_from_minutes: number
  late_to_minutes: number | null
  deduction_type: "FIXED" | "PERCENT" | "PER_HOUR"
  deduction_value: number
}

export interface DeductionRuleConfig {
  trigger_type: "ALFA" | "LATE" | "EARLY_LEAVE" | "SICK_NO_CERT"
  calc_method: "PER_DAY" | "PER_HOUR" | "PER_MINUTE" | "FLAT" | "PERCENT"
  value: number
  working_days: number
  tolerance_minutes: number | null
  max_deduction_per_month: number | null
}

export interface SimulationValues {
  alfa_days: number
  late_minutes: number
  early_leave_minutes: number
  sick_no_cert_days: number
  basis_value: number
}

export interface DeductionBreakdownItem {
  label: string
  detail: string
  amount: number
}

export interface DeductionResult {
  breakdown: DeductionBreakdownItem[]
  total_deduction: number
  capped: boolean
}

/** Pembulatan ke rupiah utuh (IDR tanpa pecahan). */
function roundRp(n: number): number {
  return Math.round(n)
}

/**
 * Hitung potongan absensi untuk satu aturan.
 * - ALFA / SICK_NO_CERT: PER_DAY=(basis/working_days)×hari, PERCENT=basis×%×hari, FLAT=value×hari
 * - EARLY_LEAVE: efektif = max(0, menit − toleransi); PER_MINUTE/PER_HOUR/FLAT/PERCENT
 * - LATE: cari tier cocok; PER_HOUR=(menit/60)×nilai, FIXED=nilai, PERCENT=basis×%
 * - Terapkan max_deduction_per_month bila ada.
 */
export function computeRuleDeduction(
  rule: DeductionRuleConfig,
  tiers: DeductionTier[],
  input: SimulationValues,
): DeductionResult {
  const breakdown: DeductionBreakdownItem[] = []
  const basis = input.basis_value
  const workingDays = rule.working_days > 0 ? rule.working_days : 22

  if (rule.trigger_type === "ALFA" || rule.trigger_type === "SICK_NO_CERT") {
    const days = rule.trigger_type === "ALFA" ? input.alfa_days : input.sick_no_cert_days
    if (days > 0) {
      let unit = 0
      let detail = ""
      if (rule.calc_method === "PER_DAY") {
        unit = basis / workingDays
        detail = `(${basis} / ${workingDays}) × ${days} hari`
      } else if (rule.calc_method === "PERCENT") {
        unit = (basis * rule.value) / 100
        detail = `${basis} × ${rule.value}% × ${days} hari`
      } else {
        unit = rule.value
        detail = `${rule.value} × ${days} hari`
      }
      breakdown.push({
        label: rule.trigger_type === "ALFA" ? "Potongan Alfa" : "Potongan Sakit (tanpa surat)",
        detail,
        amount: roundRp(unit * days),
      })
    }
  } else if (rule.trigger_type === "EARLY_LEAVE") {
    const tolerance = rule.tolerance_minutes ?? 0
    const effective = Math.max(0, input.early_leave_minutes - tolerance)
    if (effective > 0) {
      let amount = 0
      let detail = ""
      if (rule.calc_method === "PER_MINUTE") {
        amount = rule.value * effective
        detail = `${rule.value} × ${effective} menit (toleransi ${tolerance})`
      } else if (rule.calc_method === "PER_HOUR") {
        amount = rule.value * (effective / 60)
        detail = `${rule.value} × ${(effective / 60).toFixed(2)} jam (toleransi ${tolerance})`
      } else if (rule.calc_method === "PERCENT") {
        amount = (basis * rule.value) / 100
        detail = `${basis} × ${rule.value}%`
      } else {
        amount = rule.value
        detail = `Flat ${rule.value}`
      }
      breakdown.push({ label: "Potongan Pulang Cepat", detail, amount: roundRp(amount) })
    }
  } else if (rule.trigger_type === "LATE") {
    const lateMin = input.late_minutes
    if (lateMin > 0) {
      const tier = tiers.find(
        (t) => lateMin >= t.late_from_minutes && (t.late_to_minutes === null || lateMin <= t.late_to_minutes),
      )
      if (tier) {
        let amount = 0
        let detail = ""
        if (tier.deduction_type === "PER_HOUR") {
          amount = (lateMin / 60) * tier.deduction_value
          detail = `(${lateMin} / 60) × ${tier.deduction_value}`
        } else if (tier.deduction_type === "PERCENT") {
          amount = (basis * tier.deduction_value) / 100
          detail = `${basis} × ${tier.deduction_value}%`
        } else {
          amount = tier.deduction_value
          detail = `Flat ${tier.deduction_value}`
        }
        const range = tier.late_to_minutes === null
          ? `${tier.late_from_minutes}+ menit`
          : `${tier.late_from_minutes}–${tier.late_to_minutes} menit`
        breakdown.push({ label: `Potongan Terlambat (${range})`, detail, amount: roundRp(amount) })
      }
    }
  }

  let total = roundRp(breakdown.reduce((sum, b) => sum + b.amount, 0))
  let capped = false
  if (rule.max_deduction_per_month != null && total > rule.max_deduction_per_month) {
    total = roundRp(rule.max_deduction_per_month)
    capped = true
  }

  return { breakdown, total_deduction: total, capped }
}

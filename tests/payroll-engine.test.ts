import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  calculateEmployeePayroll,
  type AttendanceRecap,
  type EffectiveComponent,
  type EngineDeductionRule,
} from "../src/lib/payroll/engine"

const emptyAttendance: AttendanceRecap = {
  working_days: 22,
  present_days: 22,
  alpha_days: 0,
  late_minutes: 0,
  early_leave_minutes: 0,
  sick_no_cert_days: 0,
  overtime_minutes: 0,
  overtime_amount: 0,
}

function component(overrides: Partial<EffectiveComponent> & Pick<EffectiveComponent, "component_id" | "code" | "name">): EffectiveComponent {
  return {
    type: "EARNING",
    calc_method: "FIXED",
    value: 0,
    formula_expression: null,
    basis_component_id: null,
    basis_code: null,
    calc_order: 0,
    is_taxable: false,
    is_prorata: false,
    is_thr_basis: false,
    ...overrides,
  }
}

function calculate(salaryComponents: EffectiveComponent[], deductionRules: EngineDeductionRule[] = [], attendance: AttendanceRecap = emptyAttendance) {
  return calculateEmployeePayroll({
    employee_id: "1",
    period_month: 1,
    period_year: 2026,
    salary_components: salaryComponents,
    attendance_recap: attendance,
    deduction_rules: deductionRules,
    working_days_standard: 22,
    prorata_factor: 1,
    tax: null,
  })
}

describe("calculateEmployeePayroll", () => {
  it("calculates fixed, percent, and formula components in order", () => {
    const result = calculate([
      component({ component_id: 1, code: "GAJI_POKOK", name: "Gaji Pokok", value: 5_000_000, calc_order: 1, is_taxable: true }),
      component({ component_id: 2, code: "TUNJANGAN", name: "Tunjangan", value: 1_000_000, calc_order: 2, is_taxable: true }),
      component({ component_id: 3, code: "BONUS_FORMULA", name: "Bonus Formula", calc_method: "FORMULA", formula_expression: "GAJI_POKOK * 0.1 + TUNJANGAN", calc_order: 3, is_taxable: true }),
      component({ component_id: 4, code: "POTONGAN_FORMULA", name: "Potongan Formula", type: "DEDUCTION", calc_method: "FORMULA", formula_expression: "total_earnings * 0.05", calc_order: 4 }),
    ])

    assert.equal(result.earnings.find((line) => line.code === "BONUS_FORMULA")?.amount, 1_500_000)
    assert.equal(result.deductions.find((line) => line.code === "POTONGAN_FORMULA")?.amount, 375_000)
    assert.equal(result.total_earnings, 7_500_000)
    assert.equal(result.total_deductions, 375_000)
    assert.equal(result.net_salary, 7_125_000)
  })

  it("keeps dangerous formula functions disabled", () => {
    const result = calculate([
      component({ component_id: 1, code: "GAJI_POKOK", name: "Gaji Pokok", value: 5_000_000, calc_order: 1 }),
      component({ component_id: 2, code: "BAD_FORMULA", name: "Bad Formula", calc_method: "FORMULA", formula_expression: "evaluate('2 + 2')", calc_order: 2 }),
    ])

    assert.equal(result.earnings.find((line) => line.code === "BAD_FORMULA")?.amount, 0)
    assert.equal(result.total_earnings, 5_000_000)
  })

  it("applies prorata only to components marked prorata", () => {
    const result = calculateEmployeePayroll({
      employee_id: "1",
      period_month: 1,
      period_year: 2026,
      salary_components: [
        component({ component_id: 1, code: "GAJI_POKOK", name: "Gaji Pokok", value: 6_000_000, calc_order: 1, is_prorata: true }),
        component({ component_id: 2, code: "TUNJANGAN_TETAP", name: "Tunjangan Tetap", value: 1_000_000, calc_order: 2 }),
      ],
      attendance_recap: emptyAttendance,
      deduction_rules: [],
      working_days_standard: 22,
      prorata_factor: 0.5,
      tax: null,
    })

    assert.equal(result.earnings.find((line) => line.code === "GAJI_POKOK")?.amount, 3_000_000)
    assert.equal(result.earnings.find((line) => line.code === "TUNJANGAN_TETAP")?.amount, 1_000_000)
    assert.equal(result.net_salary, 4_000_000)
  })

  it("adds attendance deductions to total deductions", () => {
    const result = calculate(
      [component({ component_id: 1, code: "GAJI_POKOK", name: "Gaji Pokok", value: 4_400_000, calc_order: 1 })],
      [{
        id: 1,
        name: "Potongan Alfa",
        trigger_type: "ALFA",
        calc_method: "PER_DAY",
        basis_code: "GAJI_POKOK",
        value: 0,
        working_days: 22,
        tolerance_minutes: null,
        max_deduction_per_month: null,
        tiers: [],
      }],
      { ...emptyAttendance, present_days: 20, alpha_days: 2 },
    )

    assert.equal(result.attendance_deductions[0]?.amount, 400_000)
    assert.equal(result.total_deductions, 400_000)
    assert.equal(result.net_salary, 4_000_000)
  })
})

"use server"

/**
 * Server Actions — Aturan Potongan Absensi (attendance_deduction_rules).
 *
 * Konvensi response: { success, data, error }.
 * computeRuleDeduction() bersifat pure → dipakai simulator & engine payroll.
 */

import { revalidatePath } from "next/cache"
import { prisma, serialize } from "@/lib/prisma"
import { getSession, type SessionUser } from "@/lib/session"
import { writeAuditLog } from "@/lib/audit"
import {
  deductionRuleSchema,
  simulateInputSchema,
  lateTierSchema,
  validateTiers,
  firstZodError,
  type DeductionRuleInput,
  type SimulateInput,
  type LateTierInput,
} from "@/lib/validations/attendance-deduction-rule"
import {
  computeRuleDeduction,
  type DeductionRuleConfig,
  type DeductionTier,
} from "@/lib/payroll/deduction-engine"
import { z } from "zod"

export type { DeductionRuleInput, SimulateInput, LateTierInput }

const PAGE_PATH = "/dashboard/payroll/deduction-rules"

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

// ─── Engine Kalkulasi ────────────────────────────────────────────
// computeRuleDeduction berada di lib/payroll/deduction-engine (pure, dapat
// dipakai bersama oleh simulator & engine payroll).

const ruleInclude = {
  late_tiers: { orderBy: { late_from_minutes: "asc" } },
  basis_component: { select: { id: true, code: true, name: true } },
} as const

// ─── 1. List aturan ──────────────────────────────────────────────
export async function getDeductionRules() {
  const auth = await requirePayrollAdmin()
  if ("error" in auth) return fail(auth.error)
  try {
    const rows = await prisma.attendance_deduction_rules.findMany({
      include: ruleInclude,
      orderBy: [{ trigger_type: "asc" }, { id: "asc" }],
    })
    return ok(serialize(rows))
  } catch {
    return fail("Gagal memuat aturan potongan absensi")
  }
}

// ─── 2. Create ───────────────────────────────────────────────────
export async function createDeductionRule(input: DeductionRuleInput) {
  const auth = await requirePayrollAdmin()
  if ("error" in auth) return fail(auth.error)

  const parsed = deductionRuleSchema.safeParse(input)
  if (!parsed.success) return fail(firstZodError(parsed.error))
  const d = parsed.data

  // Validasi tiers untuk LATE
  if (d.trigger_type === "LATE") {
    const tierErr = validateTiers(d.tiers)
    if (tierErr) return fail(tierErr)
  }

  try {
    if (d.basis_component_id) {
      const basis = await prisma.salary_components.findUnique({ where: { id: BigInt(d.basis_component_id) }, select: { id: true } })
      if (!basis) return fail("Komponen acuan tidak ditemukan")
    }

    const created = await prisma.$transaction(async (tx) => {
      const rule = await tx.attendance_deduction_rules.create({
        data: {
          name: d.name,
          trigger_type: d.trigger_type,
          calc_method: d.calc_method,
          basis_component_id: d.basis_component_id ? BigInt(d.basis_component_id) : null,
          value: d.value,
          working_days: d.working_days,
          tolerance_minutes: d.tolerance_minutes ?? null,
          max_deduction_per_month: d.max_deduction_per_month ?? null,
          is_active: d.is_active,
          created_at: new Date(),
          updated_at: new Date(),
        },
      })
      if (d.trigger_type === "LATE" && d.tiers.length > 0) {
        await tx.attendance_late_tiers.createMany({
          data: d.tiers.map((t) => ({
            rule_id: rule.id,
            late_from_minutes: t.late_from_minutes,
            late_to_minutes: t.late_to_minutes ?? null,
            deduction_type: t.deduction_type,
            deduction_value: t.deduction_value,
            created_at: new Date(),
            updated_at: new Date(),
          })),
        })
      }
      return rule
    })

    await writeAuditLog({ user: auth.user, action: "CREATE", modelType: "attendance_deduction_rules", modelId: created.id, dataBaru: serialize(created) })
    revalidatePath(PAGE_PATH)
    return ok(serialize(created))
  } catch {
    return fail("Gagal menyimpan aturan potongan")
  }
}

// ─── 3. Update ───────────────────────────────────────────────────
export async function updateDeductionRule(id: number, input: DeductionRuleInput) {
  const auth = await requirePayrollAdmin()
  if ("error" in auth) return fail(auth.error)
  if (!id || id <= 0) return fail("ID tidak valid")

  const parsed = deductionRuleSchema.safeParse(input)
  if (!parsed.success) return fail(firstZodError(parsed.error))
  const d = parsed.data

  if (d.trigger_type === "LATE") {
    const tierErr = validateTiers(d.tiers)
    if (tierErr) return fail(tierErr)
  }

  try {
    const existing = await prisma.attendance_deduction_rules.findUnique({ where: { id: BigInt(id) } })
    if (!existing) return fail("Aturan tidak ditemukan")

    // Tidak boleh ubah trigger_type jika ada payroll yang sudah APPROVED/PAID/CLOSED.
    if (existing.trigger_type !== d.trigger_type) {
      const lockedPeriod = await prisma.payroll_periods.count({ where: { status: { in: ["APPROVED", "PAID", "CLOSED"] } } })
      if (lockedPeriod > 0) {
        return fail("Tipe trigger tidak dapat diubah karena sudah ada payroll yang disetujui")
      }
    }

    if (d.basis_component_id) {
      const basis = await prisma.salary_components.findUnique({ where: { id: BigInt(d.basis_component_id) }, select: { id: true } })
      if (!basis) return fail("Komponen acuan tidak ditemukan")
    }

    const updated = await prisma.$transaction(async (tx) => {
      const rule = await tx.attendance_deduction_rules.update({
        where: { id: BigInt(id) },
        data: {
          name: d.name,
          trigger_type: d.trigger_type,
          calc_method: d.calc_method,
          basis_component_id: d.basis_component_id ? BigInt(d.basis_component_id) : null,
          value: d.value,
          working_days: d.working_days,
          tolerance_minutes: d.tolerance_minutes ?? null,
          max_deduction_per_month: d.max_deduction_per_month ?? null,
          is_active: d.is_active,
          updated_at: new Date(),
        },
      })
      // Sinkronkan tiers (hapus & insert ulang) bila LATE; bila bukan LATE, bersihkan tiers.
      await tx.attendance_late_tiers.deleteMany({ where: { rule_id: BigInt(id) } })
      if (d.trigger_type === "LATE" && d.tiers.length > 0) {
        await tx.attendance_late_tiers.createMany({
          data: d.tiers.map((t) => ({
            rule_id: BigInt(id),
            late_from_minutes: t.late_from_minutes,
            late_to_minutes: t.late_to_minutes ?? null,
            deduction_type: t.deduction_type,
            deduction_value: t.deduction_value,
            created_at: new Date(),
            updated_at: new Date(),
          })),
        })
      }
      return rule
    })

    await writeAuditLog({ user: auth.user, action: "UPDATE", modelType: "attendance_deduction_rules", modelId: BigInt(id), dataLama: serialize(existing), dataBaru: serialize(updated) })
    revalidatePath(PAGE_PATH)
    return ok(serialize(updated))
  } catch {
    return fail("Gagal memperbarui aturan potongan")
  }
}

// ─── 4. Upsert tiers (hapus semua → insert ulang) ────────────────
export async function upsertLateTiers(ruleId: number, tiers: LateTierInput[]) {
  const auth = await requirePayrollAdmin()
  if ("error" in auth) return fail(auth.error)
  if (!ruleId || ruleId <= 0) return fail("ID aturan tidak valid")

  const parsed = z.array(lateTierSchema).safeParse(tiers)
  if (!parsed.success) return fail(firstZodError(parsed.error))
  const list = parsed.data

  const tierErr = validateTiers(list)
  if (tierErr) return fail(tierErr)

  try {
    const rule = await prisma.attendance_deduction_rules.findUnique({ where: { id: BigInt(ruleId) }, select: { id: true, trigger_type: true } })
    if (!rule) return fail("Aturan tidak ditemukan")
    if (rule.trigger_type !== "LATE") return fail("Tier hanya berlaku untuk trigger LATE")

    await prisma.$transaction(async (tx) => {
      await tx.attendance_late_tiers.deleteMany({ where: { rule_id: BigInt(ruleId) } })
      await tx.attendance_late_tiers.createMany({
        data: list.map((t) => ({
          rule_id: BigInt(ruleId),
          late_from_minutes: t.late_from_minutes,
          late_to_minutes: t.late_to_minutes ?? null,
          deduction_type: t.deduction_type,
          deduction_value: t.deduction_value,
          created_at: new Date(),
          updated_at: new Date(),
        })),
      })
    })

    await writeAuditLog({ user: auth.user, action: "UPDATE", modelType: "attendance_late_tiers", modelId: BigInt(ruleId), dataBaru: serialize(list) })
    revalidatePath(PAGE_PATH)
    return ok({ count: list.length })
  } catch {
    return fail("Gagal menyimpan tier keterlambatan")
  }
}

// ─── 5. Simulasi ─────────────────────────────────────────────────
export async function simulateDeductionRule(ruleId: number, testInput: SimulateInput) {
  const auth = await requirePayrollAdmin()
  if ("error" in auth) return fail(auth.error)
  if (!ruleId || ruleId <= 0) return fail("ID aturan tidak valid")

  const parsed = simulateInputSchema.safeParse(testInput)
  if (!parsed.success) return fail(firstZodError(parsed.error))
  const input = parsed.data

  try {
    const rule = await prisma.attendance_deduction_rules.findUnique({
      where: { id: BigInt(ruleId) },
      include: { late_tiers: { orderBy: { late_from_minutes: "asc" } } },
    })
    if (!rule) return fail("Aturan tidak ditemukan")

    const config: DeductionRuleConfig = {
      trigger_type: rule.trigger_type,
      calc_method: rule.calc_method,
      value: Number(rule.value),
      working_days: rule.working_days,
      tolerance_minutes: rule.tolerance_minutes,
      max_deduction_per_month: rule.max_deduction_per_month != null ? Number(rule.max_deduction_per_month) : null,
    }
    const tiers: DeductionTier[] = rule.late_tiers.map((t) => ({
      late_from_minutes: t.late_from_minutes,
      late_to_minutes: t.late_to_minutes,
      deduction_type: t.deduction_type,
      deduction_value: Number(t.deduction_value),
    }))

    const result = computeRuleDeduction(config, tiers, input)
    return ok(result)
  } catch {
    return fail("Gagal menjalankan simulasi")
  }
}

// ─── Toggle aktif/nonaktif ───────────────────────────────────────
export async function toggleDeductionRule(id: number) {
  const auth = await requirePayrollAdmin()
  if ("error" in auth) return fail(auth.error)
  if (!id || id <= 0) return fail("ID tidak valid")
  try {
    const existing = await prisma.attendance_deduction_rules.findUnique({ where: { id: BigInt(id) }, select: { id: true, is_active: true } })
    if (!existing) return fail("Aturan tidak ditemukan")
    const updated = await prisma.attendance_deduction_rules.update({
      where: { id: BigInt(id) },
      data: { is_active: !existing.is_active, updated_at: new Date() },
    })
    await writeAuditLog({ user: auth.user, action: "UPDATE", modelType: "attendance_deduction_rules", modelId: BigInt(id), dataBaru: { is_active: updated.is_active } })
    revalidatePath(PAGE_PATH)
    return ok(serialize(updated))
  } catch {
    return fail("Gagal mengubah status aturan")
  }
}

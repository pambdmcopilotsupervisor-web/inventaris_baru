"use server"

/**
 * Server Actions — Master Komponen Gaji (salary_components)
 *
 * Konvensi response: { success, data, error }
 * Validasi: Zod. Mutasi: server actions Next.js.
 */

import { revalidatePath } from "next/cache"
import { prisma, serialize } from "@/lib/prisma"
import { getSession, type SessionUser } from "@/lib/session"
import { writeAuditLog } from "@/lib/audit"
import type { Prisma } from "@prisma/client"
import {
  salaryComponentSchema,
  firstZodError,
  CALC_METHOD_VALUES,
  type SalaryComponentInput,
} from "@/lib/validations/salary-component"
import { validatePayrollFormula } from "@/lib/payroll/engine"

export type { SalaryComponentInput }

const PAGE_PATH = "/dashboard/payroll/components"

// ─── Tipe Response Standar ───────────────────────────────────────
export type ActionResult<T> =
  | { success: true; data: T; error: null }
  | { success: false; data: null; error: string }

function ok<T>(data: T): ActionResult<T> {
  return { success: true, data, error: null }
}
function fail(error: string): ActionResult<never> {
  return { success: false, data: null, error }
}

// ─── Auth Helper ─────────────────────────────────────────────────
const ALLOWED_ROLES = ["admin", "hrd"]

async function requirePayrollAdmin(): Promise<
  { user: SessionUser } | { error: string }
> {
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

// ─── Zod Schema ──────────────────────────────────────────────────
// Skema divalidasi via salaryComponentSchema (lihat lib/validations/salary-component).

/** Map metode → { formula_expression, default_rate } yang disimpan.
 *  PERCENT  → rate disimpan di default_rate (bukan lagi formula_expression).
 *  FORMULA  → ekspresi di formula_expression.
 *  FIXED    → keduanya null (nilai diset per karyawan/jabatan). */
function resolveStoredValues(
  method: (typeof CALC_METHOD_VALUES)[number],
  percent: number | null | undefined,
  formula: string | null | undefined,
): { formula_expression: string | null; default_rate: number | null } {
  if (method === "PERCENT") return { formula_expression: null, default_rate: percent ?? null }
  if (method === "FORMULA") return { formula_expression: formula?.trim() ?? null, default_rate: null }
  return { formula_expression: null, default_rate: null }
}

/** Variabel bawaan engine yang valid di formula (bukan referensi komponen). */
const ENGINE_VARS = new Set([
  "total_earnings", "total_taxable", "total_attendance_deduction", "working_days",
  "present_days", "alpha_days", "late_minutes", "early_leave_minutes",
  "sick_no_cert_days", "overtime_minutes", "overtime_amount",
])

/** Ekstrak token identifier dari ekspresi formula. */
function extractIdentifiers(expr: string | null | undefined): string[] {
  if (!expr) return []
  return expr.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? []
}

/**
 * Validasi referensi formula:
 * - cegah referensi ke diri sendiri,
 * - cegah dependency melingkar (A→B→A) antar komponen FORMULA.
 * `selfCode` = kode komponen yang sedang disimpan; `selfFormula` = ekspresinya.
 * `selfId` dipakai agar saat update tidak menabrak record lamanya sendiri.
 * Mengembalikan pesan error bila ada masalah, atau null bila aman.
 */
async function validateFormulaGraph(selfCode: string, selfFormula: string | null, selfId: number | null): Promise<string | null> {
  // Muat semua komponen FORMULA selain record yang sedang disimpan.
  const formulaComps = await prisma.salary_components.findMany({
    where: { calc_method: "FORMULA", ...(selfId ? { id: { not: BigInt(selfId) } } : {}) },
    select: { code: true, formula_expression: true },
  })

  const codeSet = new Set<string>(formulaComps.map((c) => c.code))
  codeSet.add(selfCode)

  // Bangun graf dependency: kode → daftar kode komponen FORMULA yang dirujuk.
  const graph = new Map<string, string[]>()
  const addNode = (code: string, formula: string | null) => {
    const refs = extractIdentifiers(formula)
      .filter((t) => !ENGINE_VARS.has(t) && codeSet.has(t))
    graph.set(code, refs)
  }
  for (const c of formulaComps) addNode(c.code, c.formula_expression)
  addNode(selfCode, selfFormula)

  // Referensi ke diri sendiri.
  if ((graph.get(selfCode) ?? []).includes(selfCode)) {
    return `Formula "${selfCode}" merujuk ke dirinya sendiri`
  }

  // Deteksi siklus yang melibatkan selfCode (DFS).
  const visiting = new Set<string>()
  const done = new Set<string>()
  let cyclePath: string[] | null = null
  const dfs = (node: string, path: string[]): boolean => {
    if (visiting.has(node)) { cyclePath = [...path, node]; return true }
    if (done.has(node)) return false
    visiting.add(node)
    for (const next of graph.get(node) ?? []) {
      if (dfs(next, [...path, node])) return true
    }
    visiting.delete(node)
    done.add(node)
    return false
  }
  if (dfs(selfCode, [])) {
    const path = (cyclePath ?? [selfCode]).join(" → ")
    return `Formula melingkar terdeteksi: ${path}`
  }
  return null
}

// ─── READ ────────────────────────────────────────────────────────
export async function getSalaryComponents() {
  const auth = await requirePayrollAdmin()
  if ("error" in auth) return fail(auth.error)
  try {
    const rows = await prisma.salary_components.findMany({
      include: { basis_component: { select: { id: true, code: true, name: true } } },
      orderBy: [{ calc_order: "asc" }, { id: "asc" }],
    })
    return ok(serialize(rows))
  } catch {
    return fail("Gagal memuat komponen gaji")
  }
}

// ─── CREATE ──────────────────────────────────────────────────────
export async function createSalaryComponent(input: SalaryComponentInput) {
  const auth = await requirePayrollAdmin()
  if ("error" in auth) return fail(auth.error)

  const parsed = salaryComponentSchema.safeParse(input)
  if (!parsed.success) return fail(firstZodError(parsed.error))
  const d = parsed.data

  try {
    // code harus unik
    const dup = await prisma.salary_components.findUnique({ where: { code: d.code }, select: { id: true } })
    if (dup) return fail(`Kode "${d.code}" sudah digunakan`)

    // basis_component_id harus ada bila diisi
    if (d.basis_component_id) {
      const basis = await prisma.salary_components.findUnique({
        where: { id: BigInt(d.basis_component_id) },
        select: { id: true },
      })
      if (!basis) return fail("Komponen acuan (basis) tidak ditemukan")
    }

    const { formula_expression, default_rate } = resolveStoredValues(d.calc_method, d.percent, d.formula_expression)
    if (d.calc_method === "FORMULA" && formula_expression) {
      const formulaError = validatePayrollFormula(formula_expression)
      if (formulaError) return fail(`Formula tidak valid: ${formulaError}`)
    }

    // Validasi formula melingkar / referensi diri sendiri.
    if (d.calc_method === "FORMULA") {
      const cycleErr = await validateFormulaGraph(d.code, formula_expression, null)
      if (cycleErr) return fail(cycleErr)
    }

    const created = await prisma.$transaction(async (tx) => {
      // Sisipkan pada calc_order yang diminta → geser komponen lain yang >= target.
      await tx.salary_components.updateMany({
        where: { calc_order: { gte: d.calc_order } },
        data: { calc_order: { increment: 1 } },
      })
      return tx.salary_components.create({
        data: {
          code: d.code,
          name: d.name,
          type: d.type,
          calc_method: d.calc_method,
          formula_expression,
          default_rate,
          basis_component_id: d.basis_component_id ? BigInt(d.basis_component_id) : null,
          calc_order: d.calc_order,
          is_taxable: d.is_taxable,
          is_active: d.is_active,
          is_prorata: d.is_prorata,
          is_thr_basis: d.is_thr_basis,
          created_at: new Date(),
          updated_at: new Date(),
        },
      })
    })

    await writeAuditLog({ user: auth.user, action: "CREATE", modelType: "salary_components", modelId: created.id, dataBaru: serialize(created) })
    revalidatePath(PAGE_PATH)
    return ok(serialize(created))
  } catch {
    return fail("Gagal menyimpan komponen gaji")
  }
}

// ─── UPDATE ──────────────────────────────────────────────────────
export async function updateSalaryComponent(id: number, input: SalaryComponentInput) {
  const auth = await requirePayrollAdmin()
  if ("error" in auth) return fail(auth.error)
  if (!id || id <= 0) return fail("ID tidak valid")

  const parsed = salaryComponentSchema.safeParse(input)
  if (!parsed.success) return fail(firstZodError(parsed.error))
  const d = parsed.data

  try {
    const existing = await prisma.salary_components.findUnique({ where: { id: BigInt(id) } })
    if (!existing) return fail("Komponen gaji tidak ditemukan")

    // Tidak boleh mengubah TYPE jika komponen sudah dipakai di payroll slip (snapshot).
    if (existing.type !== d.type) {
      const usedInSlip = await prisma.payroll_slip_details.count({ where: { component_id: BigInt(id) } })
      if (usedInSlip > 0) {
        return fail("Tipe komponen tidak dapat diubah karena sudah dipakai pada slip payroll")
      }
    }

    // Kode unik (jika diubah)
    if (existing.code !== d.code) {
      const dup = await prisma.salary_components.findFirst({ where: { code: d.code, id: { not: BigInt(id) } }, select: { id: true } })
      if (dup) return fail(`Kode "${d.code}" sudah digunakan`)
    }

    // Cegah komponen menjadi basis dirinya sendiri
    if (d.basis_component_id && d.basis_component_id === id) {
      return fail("Komponen tidak boleh menjadi acuan bagi dirinya sendiri")
    }
    if (d.basis_component_id) {
      const basis = await prisma.salary_components.findUnique({ where: { id: BigInt(d.basis_component_id) }, select: { id: true } })
      if (!basis) return fail("Komponen acuan (basis) tidak ditemukan")
    }

    const { formula_expression, default_rate } = resolveStoredValues(d.calc_method, d.percent, d.formula_expression)
    if (d.calc_method === "FORMULA" && formula_expression) {
      const formulaError = validatePayrollFormula(formula_expression)
      if (formulaError) return fail(`Formula tidak valid: ${formulaError}`)
    }
    const orderChanged = existing.calc_order !== d.calc_order

    // Validasi formula melingkar / referensi diri sendiri (abaikan record ini sendiri).
    if (d.calc_method === "FORMULA") {
      const cycleErr = await validateFormulaGraph(d.code, formula_expression, id)
      if (cycleErr) return fail(cycleErr)
    }

    const updated = await prisma.$transaction(async (tx) => {
      // Auto-reorder bila urutan berubah: geser komponen lain pada/ sesudah target.
      if (orderChanged) {
        await tx.salary_components.updateMany({
          where: { calc_order: { gte: d.calc_order }, id: { not: BigInt(id) } },
          data: { calc_order: { increment: 1 } },
        })
      }
      return tx.salary_components.update({
        where: { id: BigInt(id) },
        data: {
          code: d.code,
          name: d.name,
          type: d.type,
          calc_method: d.calc_method,
          formula_expression,
          default_rate,
          basis_component_id: d.basis_component_id ? BigInt(d.basis_component_id) : null,
          calc_order: d.calc_order,
          is_taxable: d.is_taxable,
          is_active: d.is_active,
          is_prorata: d.is_prorata,
          is_thr_basis: d.is_thr_basis,
          updated_at: new Date(),
        },
      })
    })

    await writeAuditLog({
      user: auth.user,
      action: "UPDATE",
      modelType: "salary_components",
      modelId: BigInt(id),
      dataLama: serialize(existing),
      dataBaru: serialize(updated),
    })
    revalidatePath(PAGE_PATH)
    return ok(serialize(updated))
  } catch {
    return fail("Gagal memperbarui komponen gaji")
  }
}

// ─── TOGGLE STATUS ───────────────────────────────────────────────
export async function toggleSalaryComponent(id: number) {
  const auth = await requirePayrollAdmin()
  if ("error" in auth) return fail(auth.error)
  if (!id || id <= 0) return fail("ID tidak valid")

  try {
    const existing = await prisma.salary_components.findUnique({ where: { id: BigInt(id) }, select: { id: true, is_active: true } })
    if (!existing) return fail("Komponen gaji tidak ditemukan")

    // Saat menonaktifkan: cek apakah masih dipakai di struktur gaji karyawan yang aktif.
    if (existing.is_active) {
      const today = new Date()
      const activeUsage = await prisma.employee_salary_components.count({
        where: {
          component_id: BigInt(id),
          OR: [{ end_date: null }, { end_date: { gte: today } }],
        },
      })
      if (activeUsage > 0) {
        return fail(`Tidak dapat menonaktifkan: komponen masih dipakai oleh ${activeUsage} karyawan aktif`)
      }
    }

    const updated = await prisma.salary_components.update({
      where: { id: BigInt(id) },
      data: { is_active: !existing.is_active, updated_at: new Date() },
    })

    await writeAuditLog({
      user: auth.user,
      action: "UPDATE",
      modelType: "salary_components",
      modelId: BigInt(id),
      dataBaru: { is_active: updated.is_active } as Prisma.InputJsonValue,
    })
    revalidatePath(PAGE_PATH)
    return ok(serialize(updated))
  } catch {
    return fail("Gagal mengubah status komponen gaji")
  }
}

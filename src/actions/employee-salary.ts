"use server"

/**
 * Server Actions — Assignment Komponen Gaji ke Karyawan.
 *
 * Konvensi response: { success, data, error }.
 * Mendukung effective date (historis) — record lama ditutup (end_date)
 * saat ada nilai baru, sehingga snapshot per periode tetap akurat.
 */

import { revalidatePath } from "next/cache"
import { prisma, serialize } from "@/lib/prisma"
import { getSession, type SessionUser } from "@/lib/session"
import { writeAuditLog } from "@/lib/audit"
import {
  assignComponentSchema,
  endComponentSchema,
  firstZodError,
  type AssignComponentInput,
} from "@/lib/validations/employee-salary"
import { resolveEffectiveComponents, type ResolvedComponent } from "@/lib/payroll/effective-components"

export type { AssignComponentInput }

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

function pagePath(employeeId: number | bigint) {
  return `/dashboard/payroll/employees/${employeeId}/salary`
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

/** Hitung amount per baris berdasarkan metode komponen. FORMULA → null (dihitung engine). */
function computeAmount(
  method: string,
  value: number,
  basisValue: number,
): number | null {
  if (method === "FIXED") return value
  if (method === "PERCENT") return (basisValue * value) / 100
  return null // FORMULA
}

type EnrichedComponent = {
  id: number
  source: "employee" | "jabatan"
  component_id: number
  value: number
  effective_date: string
  end_date: string | null
  code: string
  name: string
  type: "EARNING" | "DEDUCTION"
  calc_method: "FIXED" | "PERCENT" | "FORMULA"
  formula_expression: string | null
  basis_component_id: number | null
  basis_code: string | null
  basis_name: string | null
  calc_order: number
  is_taxable: boolean
  amount: number | null
}

/** Enrich hasil resolver (gabungan jabatan + individu) dengan amount & total. */
function enrichResolved(
  resolved: ResolvedComponent[],
): { rows: EnrichedComponent[]; totalEarnings: number; totalDeductions: number } {
  const fixedValueByComponent = new Map<number, number>()
  for (const r of resolved) {
    if (r.calc_method === "FIXED") fixedValueByComponent.set(r.component_id, r.value)
  }

  let totalEarnings = 0
  let totalDeductions = 0
  const rows: EnrichedComponent[] = resolved.map((r) => {
    const basisValue = r.basis_component_id ? fixedValueByComponent.get(r.basis_component_id) ?? 0 : 0
    const amount = computeAmount(r.calc_method, r.value, basisValue)
    if (amount != null) {
      if (r.type === "EARNING") totalEarnings += amount
      else totalDeductions += amount
    }
    return {
      id: r.row_id,
      source: r.source,
      component_id: r.component_id,
      value: r.value,
      effective_date: r.effective_date,
      end_date: r.end_date,
      code: r.code,
      name: r.name,
      type: r.type,
      calc_method: r.calc_method,
      formula_expression: r.formula_expression,
      basis_component_id: r.basis_component_id,
      basis_code: r.basis_code,
      basis_name: r.basis_name,
      calc_order: r.calc_order,
      is_taxable: r.is_taxable,
      amount,
    }
  })

  return { rows, totalEarnings, totalDeductions }
}

const componentInclude = {
  salary_components: {
    select: {
      code: true,
      name: true,
      type: true,
      calc_method: true,
      formula_expression: true,
      basis_component_id: true,
      calc_order: true,
      is_taxable: true,
      basis_component: { select: { code: true, name: true } },
    },
  },
} as const

// ─── 1. Komponen aktif karyawan (merge jabatan + individu, berlaku hari ini) ──
export async function getEmployeeSalaryComponents(employeeId: number) {
  const auth = await requirePayrollAdmin()
  if ("error" in auth) return fail(auth.error)
  if (!employeeId || employeeId <= 0) return fail("Karyawan tidak valid")

  try {
    const k = await prisma.karyawans.findUnique({ where: { id: BigInt(employeeId) }, select: { jabatan: true } })
    const today = new Date()
    const resolved = await resolveEffectiveComponents({
      employeeId: BigInt(employeeId),
      jabatan: k?.jabatan ?? null,
      periodStart: today,
      periodEnd: today,
    })
    return ok(enrichResolved(resolved))
  } catch {
    return fail("Gagal memuat komponen gaji karyawan")
  }
}

// ─── 2. Riwayat perubahan komponen tertentu ──────────────────────
export async function getEmployeeSalaryHistory(employeeId: number, componentId: number) {
  const auth = await requirePayrollAdmin()
  if ("error" in auth) return fail(auth.error)
  if (!employeeId || !componentId) return fail("Parameter tidak valid")

  try {
    const rows = await prisma.employee_salary_components.findMany({
      where: { employee_id: BigInt(employeeId), component_id: BigInt(componentId) },
      include: componentInclude,
      orderBy: [{ effective_date: "desc" }, { id: "desc" }],
    })
    return ok(serialize(rows))
  } catch {
    return fail("Gagal memuat riwayat komponen gaji")
  }
}

// ─── 3. Assign komponen (dengan penutupan record lama) ───────────
export async function assignSalaryComponent(input: AssignComponentInput) {
  const auth = await requirePayrollAdmin()
  if ("error" in auth) return fail(auth.error)

  const parsed = assignComponentSchema.safeParse(input)
  if (!parsed.success) return fail(firstZodError(parsed.error))
  const d = parsed.data

  try {
    const [employee, component] = await Promise.all([
      prisma.karyawans.findUnique({ where: { id: BigInt(d.employee_id) }, select: { id: true } }),
      prisma.salary_components.findUnique({ where: { id: BigInt(d.component_id) }, select: { id: true, is_active: true } }),
    ])
    if (!employee) return fail("Karyawan tidak ditemukan")
    if (!component) return fail("Komponen gaji tidak ditemukan")
    if (!component.is_active) return fail("Komponen gaji tidak aktif")

    // Cegah duplikat aktif pada periode yang sama (effektif sama).
    const sameDate = await prisma.employee_salary_components.findFirst({
      where: {
        employee_id: BigInt(d.employee_id),
        component_id: BigInt(d.component_id),
        effective_date: d.effective_date,
      },
      select: { id: true },
    })

    // Jika sudah ada record pada tanggal yang sama → update nilainya (upsert).
    if (sameDate) {
      const updated = await prisma.employee_salary_components.update({
        where: { id: sameDate.id },
        data: { value: d.value, end_date: d.end_date ?? null, updated_at: new Date() },
      })
      await writeAuditLog({
        user: auth.user,
        action: "UPDATE",
        modelType: "employee_salary_components",
        modelId: updated.id,
        dataBaru: serialize(updated),
      })
      revalidatePath(pagePath(d.employee_id))
      return ok(serialize(updated))
    }

    const created = await prisma.$transaction(async (tx) => {
      // Tutup record lama yang masih aktif pada/ sesudah effective_date baru.
      const closeDate = addDays(d.effective_date, -1)
      await tx.employee_salary_components.updateMany({
        where: {
          employee_id: BigInt(d.employee_id),
          component_id: BigInt(d.component_id),
          effective_date: { lt: d.effective_date },
          OR: [{ end_date: null }, { end_date: { gte: d.effective_date } }],
        },
        data: { end_date: closeDate, updated_at: new Date() },
      })

      return tx.employee_salary_components.create({
        data: {
          employee_id: BigInt(d.employee_id),
          component_id: BigInt(d.component_id),
          value: d.value,
          effective_date: d.effective_date,
          end_date: d.end_date ?? null,
          created_at: new Date(),
          updated_at: new Date(),
        },
      })
    })

    await writeAuditLog({
      user: auth.user,
      action: "CREATE",
      modelType: "employee_salary_components",
      modelId: created.id,
      dataBaru: serialize(created),
    })
    revalidatePath(pagePath(d.employee_id))
    return ok(serialize(created))
  } catch {
    return fail("Gagal meng-assign komponen gaji")
  }
}

// ─── 4. Akhiri komponen (set end_date) ───────────────────────────
export async function endSalaryComponent(id: number, endDate: string | Date) {
  const auth = await requirePayrollAdmin()
  if ("error" in auth) return fail(auth.error)

  const parsed = endComponentSchema.safeParse({ id, end_date: endDate })
  if (!parsed.success) return fail(firstZodError(parsed.error))
  const d = parsed.data

  try {
    const existing = await prisma.employee_salary_components.findUnique({
      where: { id: BigInt(d.id) },
      select: { id: true, employee_id: true, effective_date: true },
    })
    if (!existing) return fail("Komponen gaji karyawan tidak ditemukan")
    if (d.end_date < existing.effective_date) {
      return fail("Tanggal akhir tidak boleh sebelum tanggal berlaku")
    }

    const updated = await prisma.employee_salary_components.update({
      where: { id: BigInt(d.id) },
      data: { end_date: d.end_date, updated_at: new Date() },
    })

    await writeAuditLog({
      user: auth.user,
      action: "UPDATE",
      modelType: "employee_salary_components",
      modelId: BigInt(d.id),
      dataBaru: serialize(updated),
    })
    revalidatePath(pagePath(existing.employee_id))
    return ok(serialize(updated))
  } catch {
    return fail("Gagal mengakhiri komponen gaji")
  }
}

// ─── 5. Snapshot komponen efektif pada periode (engine payroll) ──
export async function getEffectiveSalarySnapshot(
  employeeId: number,
  periodMonth: number,
  periodYear: number,
) {
  const auth = await requirePayrollAdmin()
  if ("error" in auth) return fail(auth.error)
  if (!employeeId || periodMonth < 1 || periodMonth > 12 || periodYear < 2000) {
    return fail("Parameter periode tidak valid")
  }

  try {
    // Rentang bulan periode.
    const firstDay = new Date(periodYear, periodMonth - 1, 1)
    const lastDay = new Date(periodYear, periodMonth, 0) // hari terakhir bulan

    const k = await prisma.karyawans.findUnique({ where: { id: BigInt(employeeId) }, select: { jabatan: true } })
    const resolved = await resolveEffectiveComponents({
      employeeId: BigInt(employeeId),
      jabatan: k?.jabatan ?? null,
      periodStart: firstDay,
      periodEnd: lastDay,
    })
    return ok(enrichResolved(resolved))
  } catch {
    return fail("Gagal memuat snapshot gaji periode")
  }
}

// ─── Info karyawan (header halaman) ──────────────────────────────
export async function getEmployeeBasic(employeeId: number) {
  const auth = await requirePayrollAdmin()
  if ("error" in auth) return fail(auth.error)
  if (!employeeId || employeeId <= 0) return fail("Karyawan tidak valid")

  try {
    const k = await prisma.karyawans.findUnique({
      where: { id: BigInt(employeeId) },
      select: { id: true, nik: true, nama_karyawan: true, jabatan: true, divisi_id: true, subdivisi_id: true, status_karyawan: true },
    })
    if (!k) return fail("Karyawan tidak ditemukan")

    let nama_divisi: string | null = null
    let nama_subdivisi: string | null = null
    if (k.subdivisi_id) {
      const sub = await prisma.subdivisis.findUnique({ where: { id: BigInt(k.subdivisi_id) }, select: { nama_sub: true, divisi_id: true } })
      nama_subdivisi = sub?.nama_sub ?? null
      if (sub?.divisi_id) {
        const div = await prisma.divisis.findUnique({ where: { id: BigInt(sub.divisi_id) }, select: { nama_divisi: true } })
        nama_divisi = div?.nama_divisi ?? null
      }
    } else if (k.divisi_id) {
      const div = await prisma.divisis.findUnique({ where: { id: BigInt(k.divisi_id) }, select: { nama_divisi: true } })
      nama_divisi = div?.nama_divisi ?? null
    }

    return ok({
      id: Number(k.id),
      nik: k.nik,
      nama_karyawan: k.nama_karyawan,
      jabatan: k.jabatan,
      status_karyawan: k.status_karyawan,
      nama_divisi,
      nama_subdivisi,
    })
  } catch {
    return fail("Gagal memuat data karyawan")
  }
}

"use server"

/**
 * Server Actions — Komponen Gaji per Jabatan.
 * Konvensi response: { success, data, error }.
 */

import { revalidatePath } from "next/cache"
import { prisma, serialize } from "@/lib/prisma"
import { getSession, type SessionUser } from "@/lib/session"
import { writeAuditLog } from "@/lib/audit"
import {
  assignJabatanComponentSchema,
  endJabatanComponentSchema,
  firstZodError,
  type AssignJabatanComponentInput,
} from "@/lib/validations/jabatan-salary"

export type { AssignJabatanComponentInput }

const PAGE_PATH = "/dashboard/payroll/positions"

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

function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

// ─── Daftar jabatan (distinct dari karyawans) ───────────────────
export async function getJabatanList() {
  const auth = await requirePayrollAdmin()
  if ("error" in auth) return fail(auth.error)
  try {
    const rows = await prisma.karyawans.findMany({
      where: { jabatan: { not: "" } },
      distinct: ["jabatan"],
      select: { jabatan: true },
      orderBy: { jabatan: "asc" },
    })
    const list = rows.map((r) => r.jabatan).filter(Boolean)
    return ok(list)
  } catch {
    return fail("Gagal memuat daftar jabatan")
  }
}

// ─── Komponen aktif untuk satu jabatan ──────────────────────────
export async function getJabatanSalaryComponents(jabatan: string) {
  const auth = await requirePayrollAdmin()
  if ("error" in auth) return fail(auth.error)
  if (!jabatan?.trim()) return fail("Jabatan tidak valid")

  try {
    const today = new Date(); today.setHours(0, 0, 0, 0)
    // Tampilkan semua record (aktif, mendatang, maupun yang sudah berakhir) untuk riwayat lengkap
    const rows = await prisma.jabatan_salary_components.findMany({
      where: { jabatan },
      include: {
        salary_components: {
          select: {
            code: true, name: true, type: true, calc_method: true, formula_expression: true,
            basis_component_id: true, calc_order: true,
            basis_component: { select: { code: true, name: true } },
          },
        },
      },
      orderBy: [{ salary_components: { calc_order: "asc" } }, { effective_date: "desc" }],
    })

    const data = rows.map((r) => {
      const eff = new Date(r.effective_date); eff.setHours(0, 0, 0, 0)
      const end = r.end_date ? (() => { const d = new Date(r.end_date!); d.setHours(0, 0, 0, 0); return d })() : null
      const status: "active" | "upcoming" | "ended" =
        end && end < today ? "ended"
        : eff > today ? "upcoming"
        : "active"
      return {
        id: Number(r.id),
        component_id: Number(r.component_id),
        value: Number(r.value),
        effective_date: r.effective_date.toISOString(),
        end_date: r.end_date ? r.end_date.toISOString() : null,
        code: r.salary_components.code,
        name: r.salary_components.name,
        type: r.salary_components.type,
        calc_method: r.salary_components.calc_method,
        formula_expression: r.salary_components.formula_expression,
        basis_component_id: r.salary_components.basis_component_id ? Number(r.salary_components.basis_component_id) : null,
        basis_code: r.salary_components.basis_component?.code ?? null,
        basis_name: r.salary_components.basis_component?.name ?? null,
        calc_order: r.salary_components.calc_order,
        status,
      }
    }).sort((a, b) => {
      if (a.calc_order !== b.calc_order) return a.calc_order - b.calc_order
      return new Date(b.effective_date).getTime() - new Date(a.effective_date).getTime()
    })

    return ok(data)
  } catch {
    return fail("Gagal memuat komponen jabatan")
  }
}

// ─── Riwayat perubahan komponen per jabatan ─────────────────────
export async function getJabatanSalaryHistory(jabatan: string, componentId: number) {
  const auth = await requirePayrollAdmin()
  if ("error" in auth) return fail(auth.error)
  if (!jabatan?.trim() || !componentId) return fail("Parameter tidak valid")
  try {
    const rows = await prisma.jabatan_salary_components.findMany({
      where: { jabatan, component_id: BigInt(componentId) },
      include: { salary_components: { select: { code: true, name: true } } },
      orderBy: [{ effective_date: "desc" }, { id: "desc" }],
    })
    return ok(serialize(rows))
  } catch {
    return fail("Gagal memuat riwayat komponen jabatan")
  }
}

// ─── Assign komponen ke jabatan (tutup record lama) ─────────────
export async function assignJabatanComponent(input: AssignJabatanComponentInput) {
  const auth = await requirePayrollAdmin()
  if ("error" in auth) return fail(auth.error)

  const parsed = assignJabatanComponentSchema.safeParse(input)
  if (!parsed.success) return fail(firstZodError(parsed.error))
  const d = parsed.data

  try {
    const component = await prisma.salary_components.findUnique({
      where: { id: BigInt(d.component_id) },
      select: { id: true, is_active: true },
    })
    if (!component) return fail("Komponen gaji tidak ditemukan")
    if (!component.is_active) return fail("Komponen gaji tidak aktif")

    const sameDate = await prisma.jabatan_salary_components.findFirst({
      where: { jabatan: d.jabatan, component_id: BigInt(d.component_id), effective_date: d.effective_date },
      select: { id: true },
    })

    // Jika sudah ada record dengan tanggal yang sama, update nilai dan end_date (upsert)
    if (sameDate) {
      const updated = await prisma.jabatan_salary_components.update({
        where: { id: sameDate.id },
        data: { value: d.value, end_date: d.end_date ?? null, updated_at: new Date() },
      })
      await writeAuditLog({ user: auth.user, action: "UPDATE", modelType: "jabatan_salary_components", modelId: updated.id, dataBaru: serialize(updated) })
      revalidatePath(PAGE_PATH)
      return ok(serialize(updated))
    }

    const created = await prisma.$transaction(async (tx) => {
      const closeDate = addDays(d.effective_date, -1)
      await tx.jabatan_salary_components.updateMany({
        where: {
          jabatan: d.jabatan,
          component_id: BigInt(d.component_id),
          effective_date: { lt: d.effective_date },
          OR: [{ end_date: null }, { end_date: { gte: d.effective_date } }],
        },
        data: { end_date: closeDate, updated_at: new Date() },
      })
      return tx.jabatan_salary_components.create({
        data: {
          jabatan: d.jabatan,
          component_id: BigInt(d.component_id),
          value: d.value,
          effective_date: d.effective_date,
          end_date: d.end_date ?? null,
          created_at: new Date(),
          updated_at: new Date(),
        },
      })
    })

    await writeAuditLog({ user: auth.user, action: "CREATE", modelType: "jabatan_salary_components", modelId: created.id, dataBaru: serialize(created) })
    revalidatePath(PAGE_PATH)
    return ok(serialize(created))
  } catch {
    return fail("Gagal meng-assign komponen jabatan")
  }
}

// ─── Akhiri komponen jabatan ────────────────────────────────────
export async function endJabatanComponent(id: number, endDate: string | Date) {
  const auth = await requirePayrollAdmin()
  if ("error" in auth) return fail(auth.error)

  const parsed = endJabatanComponentSchema.safeParse({ id, end_date: endDate })
  if (!parsed.success) return fail(firstZodError(parsed.error))
  const d = parsed.data

  try {
    const existing = await prisma.jabatan_salary_components.findUnique({
      where: { id: BigInt(d.id) },
      select: { id: true, effective_date: true },
    })
    if (!existing) return fail("Komponen jabatan tidak ditemukan")
    if (d.end_date < existing.effective_date) return fail("Tanggal akhir tidak boleh sebelum tanggal berlaku")

    const updated = await prisma.jabatan_salary_components.update({
      where: { id: BigInt(d.id) },
      data: { end_date: d.end_date, updated_at: new Date() },
    })
    await writeAuditLog({ user: auth.user, action: "UPDATE", modelType: "jabatan_salary_components", modelId: BigInt(d.id), dataBaru: serialize(updated) })
    revalidatePath(PAGE_PATH)
    return ok(serialize(updated))
  } catch {
    return fail("Gagal mengakhiri komponen jabatan")
  }
}

// ─── Hapus record komponen jabatan (khusus yang belum berlaku) ──
export async function deleteJabatanComponent(id: number) {
  const auth = await requirePayrollAdmin()
  if ("error" in auth) return fail(auth.error)
  if (!id || id <= 0) return fail("ID tidak valid")

  try {
    const existing = await prisma.jabatan_salary_components.findUnique({
      where: { id: BigInt(id) },
      select: { id: true, effective_date: true },
    })
    if (!existing) return fail("Komponen jabatan tidak ditemukan")

    const today = new Date(); today.setHours(0, 0, 0, 0)
    if (existing.effective_date <= today) return fail("Hanya record yang belum berlaku yang dapat dihapus. Gunakan 'Akhiri' untuk menonaktifkan record aktif.")

    await prisma.jabatan_salary_components.delete({ where: { id: BigInt(id) } })
    await writeAuditLog({ user: auth.user, action: "DELETE", modelType: "jabatan_salary_components", modelId: BigInt(id), dataLama: { id } })
    revalidatePath(PAGE_PATH)
    return ok({ id })
  } catch {
    return fail("Gagal menghapus komponen jabatan")
  }
}

"use server"

/**
 * Server Actions — Penyesuaian Gaji Massal (bulk salary adjustment).
 * Menerapkan kenaikan persen / nominal pada satu komponen FIXED untuk
 * banyak karyawan sekaligus, membuat record employee_salary_components
 * baru yang effective-dated (record lama ditutup).
 * Konvensi response: { success, data, error }.
 */

import { revalidatePath } from "next/cache"
import { prisma, serialize } from "@/lib/prisma"
import { getSession, type SessionUser } from "@/lib/session"
import { writeAuditLog } from "@/lib/audit"
import { bulkAdjustSchema, firstZodError, type BulkAdjustInput } from "@/lib/validations/bulk-salary"

export type { BulkAdjustInput }

const PAGE_PATH = "/dashboard/payroll/bulk-adjust"

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

function computeNew(mode: string, current: number, value: number): number {
  if (mode === "PERCENT") return Math.round(current * (1 + value / 100))
  if (mode === "NOMINAL_ADD") return Math.round(current + value)
  return Math.round(value) // NOMINAL_SET
}

// ─── Komponen FIXED untuk dropdown ───────────────────────────────
export async function getBulkComponents() {
  const auth = await requirePayrollAdmin()
  if ("error" in auth) return fail(auth.error)
  try {
    const rows = await prisma.salary_components.findMany({
      where: { calc_method: "FIXED", is_active: true },
      select: { id: true, code: true, name: true, type: true },
      orderBy: [{ calc_order: "asc" }, { id: "asc" }],
    })
    return ok(rows.map((r) => ({ id: Number(r.id), code: r.code, name: r.name, type: r.type })))
  } catch {
    return fail("Gagal memuat komponen")
  }
}

// ─── Daftar jabatan (distinct) ───────────────────────────────────
export async function getBulkJabatanList() {
  const auth = await requirePayrollAdmin()
  if ("error" in auth) return fail(auth.error)
  try {
    const rows = await prisma.karyawans.findMany({
      where: { status_karyawan: "Aktif", jabatan: { not: "" } },
      distinct: ["jabatan"],
      select: { jabatan: true },
      orderBy: { jabatan: "asc" },
    })
    return ok(rows.map((r) => r.jabatan).filter(Boolean))
  } catch {
    return fail("Gagal memuat daftar jabatan")
  }
}

/** Resolusi nilai komponen saat ini (individu menang atas jabatan) untuk daftar karyawan. */
async function resolveCurrentValues(
  componentId: bigint,
  employees: { id: bigint; jabatan: string }[],
  asOf: Date,
): Promise<Map<string, number>> {
  const empIds = employees.map((e) => e.id)
  const jabatanSet = Array.from(new Set(employees.map((e) => e.jabatan)))

  const [indiv, jabatanRows] = await Promise.all([
    prisma.employee_salary_components.findMany({
      where: {
        component_id: componentId,
        employee_id: { in: empIds },
        effective_date: { lte: asOf },
        OR: [{ end_date: null }, { end_date: { gte: asOf } }],
      },
      select: { employee_id: true, value: true, effective_date: true },
      orderBy: { effective_date: "desc" },
    }),
    prisma.jabatan_salary_components.findMany({
      where: {
        component_id: componentId,
        jabatan: { in: jabatanSet },
        effective_date: { lte: asOf },
        OR: [{ end_date: null }, { end_date: { gte: asOf } }],
      },
      select: { jabatan: true, value: true, effective_date: true },
      orderBy: { effective_date: "desc" },
    }),
  ])

  // Ambil nilai efektif terbaru per karyawan & per jabatan.
  const indivLatest = new Map<string, number>()
  for (const r of indiv) {
    const key = r.employee_id.toString()
    if (!indivLatest.has(key)) indivLatest.set(key, Number(r.value))
  }
  const jabatanLatest = new Map<string, number>()
  for (const r of jabatanRows) {
    if (!jabatanLatest.has(r.jabatan)) jabatanLatest.set(r.jabatan, Number(r.value))
  }

  const result = new Map<string, number>()
  for (const e of employees) {
    const key = e.id.toString()
    const v = indivLatest.has(key) ? indivLatest.get(key)! : (jabatanLatest.get(e.jabatan) ?? 0)
    result.set(key, v)
  }
  return result
}

// ─── Preview (tidak menyimpan) ───────────────────────────────────
export async function previewBulkAdjust(input: BulkAdjustInput) {
  const auth = await requirePayrollAdmin()
  if ("error" in auth) return fail(auth.error)

  const parsed = bulkAdjustSchema.safeParse(input)
  if (!parsed.success) return fail(firstZodError(parsed.error))
  const d = parsed.data

  try {
    const component = await prisma.salary_components.findUnique({
      where: { id: BigInt(d.component_id) },
      select: { id: true, code: true, name: true, calc_method: true },
    })
    if (!component) return fail("Komponen tidak ditemukan")
    if (component.calc_method !== "FIXED") return fail("Penyesuaian massal hanya untuk komponen FIXED")

    const employees = await prisma.karyawans.findMany({
      where: { status_karyawan: "Aktif", ...(d.scope === "JABATAN" ? { jabatan: d.jabatan } : {}) },
      select: { id: true, nik: true, nama_karyawan: true, jabatan: true },
      orderBy: { nama_karyawan: "asc" },
    })
    if (employees.length === 0) return fail("Tidak ada karyawan dalam scope ini")

    const currentMap = await resolveCurrentValues(BigInt(d.component_id), employees, d.effective_date)

    const rows = employees.map((e) => {
      const current = currentMap.get(e.id.toString()) ?? 0
      const next = computeNew(d.mode, current, d.value)
      return {
        employee_id: Number(e.id),
        nama_karyawan: e.nama_karyawan,
        nik: e.nik,
        jabatan: e.jabatan,
        current_value: current,
        new_value: Math.max(0, next),
        delta: Math.max(0, next) - current,
      }
    })
    return ok({ component: { code: component.code, name: component.name }, count: rows.length, rows })
  } catch {
    return fail("Gagal membuat preview penyesuaian")
  }
}

// ─── Terapkan penyesuaian massal ─────────────────────────────────
export async function applyBulkAdjust(input: BulkAdjustInput) {
  const auth = await requirePayrollAdmin()
  if ("error" in auth) return fail(auth.error)

  const parsed = bulkAdjustSchema.safeParse(input)
  if (!parsed.success) return fail(firstZodError(parsed.error))
  const d = parsed.data

  try {
    const component = await prisma.salary_components.findUnique({
      where: { id: BigInt(d.component_id) },
      select: { id: true, code: true, calc_method: true },
    })
    if (!component) return fail("Komponen tidak ditemukan")
    if (component.calc_method !== "FIXED") return fail("Penyesuaian massal hanya untuk komponen FIXED")

    const employees = await prisma.karyawans.findMany({
      where: { status_karyawan: "Aktif", ...(d.scope === "JABATAN" ? { jabatan: d.jabatan } : {}) },
      select: { id: true, jabatan: true },
    })
    if (employees.length === 0) return fail("Tidak ada karyawan dalam scope ini")

    const currentMap = await resolveCurrentValues(BigInt(d.component_id), employees, d.effective_date)
    const componentId = BigInt(d.component_id)
    const closeDate = addDays(d.effective_date, -1)

    let applied = 0
    let skipped = 0

    // Proses SEQUENTIAL (satu per satu) untuk menghindari deadlock antar transaksi.
    for (const e of employees) {
      const current = currentMap.get(e.id.toString()) ?? 0
      const next = Math.max(0, computeNew(d.mode, current, d.value))
      if (next === current) { skipped++; continue }

      let ok = false
      for (let attempt = 0; attempt < 3 && !ok; attempt++) {
        try {
          await prisma.$transaction(async (tx) => {
            const same = await tx.employee_salary_components.findFirst({
              where: { employee_id: e.id, component_id: componentId, effective_date: d.effective_date },
              select: { id: true },
            })
            if (same) {
              await tx.employee_salary_components.update({ where: { id: same.id }, data: { value: next, end_date: null, updated_at: new Date() } })
            } else {
              await tx.employee_salary_components.updateMany({
                where: {
                  employee_id: e.id,
                  component_id: componentId,
                  effective_date: { lt: d.effective_date },
                  OR: [{ end_date: null }, { end_date: { gte: d.effective_date } }],
                },
                data: { end_date: closeDate, updated_at: new Date() },
              })
              await tx.employee_salary_components.create({
                data: {
                  employee_id: e.id,
                  component_id: componentId,
                  value: next,
                  effective_date: d.effective_date,
                  end_date: null,
                  created_at: new Date(),
                  updated_at: new Date(),
                },
              })
            }
          })
          ok = true
        } catch (err) {
          const isDeadlock = err instanceof Error && /deadlock|write conflict/i.test(err.message)
          if (!isDeadlock || attempt === 2) throw err
          // Tunggu sebentar sebelum retry (exponential backoff kecil).
          await new Promise((r) => setTimeout(r, 50 * (attempt + 1)))
        }
      }
      applied++
    }

    await writeAuditLog({
      user: auth.user,
      action: "UPDATE",
      modelType: "employee_salary_components",
      modelId: componentId,
      dataBaru: serialize({ bulk: true, component: component.code, scope: d.scope, jabatan: d.jabatan ?? null, mode: d.mode, value: d.value, effective_date: d.effective_date, applied, skipped }),
    })
    revalidatePath(PAGE_PATH)
    return ok({ applied, skipped, total: employees.length })
  } catch {
    return fail("Gagal menerapkan penyesuaian massal")
  }
}

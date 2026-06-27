"use server"

/**
 * Server Actions — Penyesuaian Sekali Jalan (one-time adjustment) per periode.
 * Konvensi response: { success, data, error }.
 */

import { revalidatePath } from "next/cache"
import { prisma, serialize } from "@/lib/prisma"
import { getSession, type SessionUser } from "@/lib/session"
import { writeAuditLog } from "@/lib/audit"
import {
  adjustmentSchema,
  firstZodError,
  type AdjustmentInput,
} from "@/lib/validations/payroll-adjustment"

export type { AdjustmentInput }

const PAGE_PATH = "/dashboard/payroll/run"

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

// ─── Daftar penyesuaian untuk satu periode ───────────────────────
export async function getPeriodAdjustments(periodId: number) {
  const auth = await requirePayrollAdmin()
  if ("error" in auth) return fail(auth.error)
  if (!periodId || periodId <= 0) return fail("ID periode tidak valid")
  try {
    const rows = await prisma.payroll_adjustments.findMany({
      where: { payroll_period_id: BigInt(periodId) },
      include: { karyawans: { select: { nama_karyawan: true, nik: true, jabatan: true } } },
      orderBy: { id: "desc" },
    })
    const data = rows.map((r) => ({
      id: Number(r.id),
      employee_id: Number(r.employee_id),
      nama_karyawan: r.karyawans.nama_karyawan,
      nik: r.karyawans.nik,
      jabatan: r.karyawans.jabatan,
      type: r.type,
      label: r.label,
      amount: Number(r.amount),
      is_taxable: r.is_taxable,
      notes: r.notes,
    }))
    return ok(data)
  } catch {
    return fail("Gagal memuat penyesuaian periode")
  }
}

// ─── Karyawan pada periode (untuk dropdown) ──────────────────────
export async function getAdjustmentEmployees() {
  const auth = await requirePayrollAdmin()
  if ("error" in auth) return fail(auth.error)
  try {
    const rows = await prisma.karyawans.findMany({
      where: { status_karyawan: "Aktif" },
      select: { id: true, nik: true, nama_karyawan: true, jabatan: true },
      orderBy: { nama_karyawan: "asc" },
    })
    return ok(rows.map((r) => ({ id: Number(r.id), nik: r.nik, nama_karyawan: r.nama_karyawan, jabatan: r.jabatan })))
  } catch {
    return fail("Gagal memuat daftar karyawan")
  }
}

// ─── Tambah penyesuaian ──────────────────────────────────────────
export async function createAdjustment(input: AdjustmentInput) {
  const auth = await requirePayrollAdmin()
  if ("error" in auth) return fail(auth.error)

  const parsed = adjustmentSchema.safeParse(input)
  if (!parsed.success) return fail(firstZodError(parsed.error))
  const d = parsed.data

  try {
    const period = await prisma.payroll_periods.findUnique({ where: { id: BigInt(d.payroll_period_id) }, select: { id: true, status: true } })
    if (!period) return fail("Periode tidak ditemukan")
    if (!["DRAFT", "CALCULATED"].includes(period.status)) return fail("Penyesuaian hanya dapat ditambah pada periode DRAFT/CALCULATED")

    const employee = await prisma.karyawans.findUnique({ where: { id: BigInt(d.employee_id) }, select: { id: true } })
    if (!employee) return fail("Karyawan tidak ditemukan")

    const created = await prisma.payroll_adjustments.create({
      data: {
        payroll_period_id: BigInt(d.payroll_period_id),
        employee_id: BigInt(d.employee_id),
        type: d.type,
        label: d.label,
        amount: d.amount,
        is_taxable: d.type === "EARNING" ? d.is_taxable : false,
        notes: d.notes?.trim() || null,
        created_at: new Date(),
        updated_at: new Date(),
      },
    })
    await writeAuditLog({ user: auth.user, action: "CREATE", modelType: "payroll_adjustments", modelId: created.id, dataBaru: serialize(created) })
    revalidatePath(`${PAGE_PATH}/${d.payroll_period_id}`)
    return ok(serialize(created))
  } catch {
    return fail("Gagal menambah penyesuaian")
  }
}

// ─── Hapus penyesuaian ───────────────────────────────────────────
export async function deleteAdjustment(id: number) {
  const auth = await requirePayrollAdmin()
  if ("error" in auth) return fail(auth.error)
  if (!id || id <= 0) return fail("ID tidak valid")
  try {
    const adj = await prisma.payroll_adjustments.findUnique({
      where: { id: BigInt(id) },
      select: { id: true, payroll_period_id: true, payroll_periods: { select: { status: true } } },
    })
    if (!adj) return fail("Penyesuaian tidak ditemukan")
    if (!["DRAFT", "CALCULATED"].includes(adj.payroll_periods.status)) return fail("Tidak dapat menghapus pada status periode saat ini")

    await prisma.payroll_adjustments.delete({ where: { id: BigInt(id) } })
    await writeAuditLog({ user: auth.user, action: "DELETE", modelType: "payroll_adjustments", modelId: BigInt(id), dataLama: { id } })
    revalidatePath(`${PAGE_PATH}/${Number(adj.payroll_period_id)}`)
    return ok({ id })
  } catch {
    return fail("Gagal menghapus penyesuaian")
  }
}

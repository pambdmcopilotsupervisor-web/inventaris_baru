"use server"

/**
 * Server Actions — Pinjaman/Cicilan Karyawan.
 * Konvensi response: { success, data, error }.
 */

import { revalidatePath } from "next/cache"
import { prisma, serialize } from "@/lib/prisma"
import { getSession, type SessionUser } from "@/lib/session"
import { writeAuditLog } from "@/lib/audit"
import {
  loanSchema,
  updateLoanSchema,
  firstZodError,
  type LoanInput,
  type UpdateLoanInput,
} from "@/lib/validations/employee-loan"

export type { LoanInput, UpdateLoanInput }

const PAGE_PATH = "/dashboard/payroll/loans"

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

// ─── Daftar karyawan aktif (untuk dropdown) ─────────────────────
export async function getLoanEmployees() {
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

// ─── Daftar pinjaman + sisa pokok ────────────────────────────────
export async function getEmployeeLoans() {
  const auth = await requirePayrollAdmin()
  if ("error" in auth) return fail(auth.error)
  try {
    const loans = await prisma.employee_loans.findMany({
      include: {
        karyawans: { select: { nama_karyawan: true, nik: true, jabatan: true } },
        payments: { select: { amount: true } },
      },
      orderBy: [{ status: "asc" }, { id: "desc" }],
    })
    const data = loans.map((l) => {
      const paid = l.payments.reduce((s, p) => s + Number(p.amount), 0)
      const principal = Number(l.principal_amount)
      return {
        id: Number(l.id),
        employee_id: Number(l.employee_id),
        nama_karyawan: l.karyawans.nama_karyawan,
        nik: l.karyawans.nik,
        jabatan: l.karyawans.jabatan,
        loan_number: l.loan_number,
        title: l.title,
        principal_amount: principal,
        installment_amount: Number(l.installment_amount),
        tenor_months: l.tenor_months,
        start_month: l.start_month,
        start_year: l.start_year,
        status: l.status,
        paid_amount: paid,
        remaining_amount: Math.max(0, principal - paid),
        payment_count: l.payments.length,
        notes: l.notes,
      }
    })
    return ok(data)
  } catch {
    return fail("Gagal memuat data pinjaman")
  }
}

// ─── Detail pinjaman + riwayat potongan ──────────────────────────
export async function getLoanDetail(id: number) {
  const auth = await requirePayrollAdmin()
  if ("error" in auth) return fail(auth.error)
  if (!id || id <= 0) return fail("ID tidak valid")
  try {
    const loan = await prisma.employee_loans.findUnique({
      where: { id: BigInt(id) },
      include: {
        karyawans: { select: { nama_karyawan: true, nik: true, jabatan: true } },
        payments: { orderBy: [{ period_year: "asc" }, { period_month: "asc" }] },
      },
    })
    if (!loan) return fail("Pinjaman tidak ditemukan")
    return ok(serialize(loan))
  } catch {
    return fail("Gagal memuat detail pinjaman")
  }
}

// ─── Buat pinjaman baru ──────────────────────────────────────────
export async function createLoan(input: LoanInput) {
  const auth = await requirePayrollAdmin()
  if ("error" in auth) return fail(auth.error)

  const parsed = loanSchema.safeParse(input)
  if (!parsed.success) return fail(firstZodError(parsed.error))
  const d = parsed.data

  try {
    const employee = await prisma.karyawans.findUnique({ where: { id: BigInt(d.employee_id) }, select: { id: true } })
    if (!employee) return fail("Karyawan tidak ditemukan")

    const tenor = Math.ceil(d.principal_amount / d.installment_amount)
    const created = await prisma.employee_loans.create({
      data: {
        employee_id: BigInt(d.employee_id),
        loan_number: d.loan_number?.trim() || null,
        title: d.title,
        principal_amount: d.principal_amount,
        installment_amount: d.installment_amount,
        tenor_months: tenor,
        start_month: d.start_month,
        start_year: d.start_year,
        status: "ACTIVE",
        notes: d.notes?.trim() || null,
        created_at: new Date(),
        updated_at: new Date(),
      },
    })
    await writeAuditLog({ user: auth.user, action: "CREATE", modelType: "employee_loans", modelId: created.id, dataBaru: serialize(created) })
    revalidatePath(PAGE_PATH)
    return ok(serialize(created))
  } catch {
    return fail("Gagal membuat pinjaman")
  }
}

// ─── Ubah pinjaman (judul/cicilan/catatan) ───────────────────────
export async function updateLoan(input: UpdateLoanInput) {
  const auth = await requirePayrollAdmin()
  if ("error" in auth) return fail(auth.error)

  const parsed = updateLoanSchema.safeParse(input)
  if (!parsed.success) return fail(firstZodError(parsed.error))
  const d = parsed.data

  try {
    const loan = await prisma.employee_loans.findUnique({ where: { id: BigInt(d.id) }, select: { id: true, status: true, principal_amount: true } })
    if (!loan) return fail("Pinjaman tidak ditemukan")
    if (loan.status !== "ACTIVE") return fail("Hanya pinjaman berstatus ACTIVE yang dapat diubah")
    if (d.installment_amount > Number(loan.principal_amount)) return fail("Cicilan tidak boleh melebihi pokok pinjaman")

    const tenor = Math.ceil(Number(loan.principal_amount) / d.installment_amount)
    const updated = await prisma.employee_loans.update({
      where: { id: BigInt(d.id) },
      data: {
        title: d.title,
        loan_number: d.loan_number?.trim() || null,
        installment_amount: d.installment_amount,
        tenor_months: tenor,
        notes: d.notes?.trim() || null,
        updated_at: new Date(),
      },
    })
    await writeAuditLog({ user: auth.user, action: "UPDATE", modelType: "employee_loans", modelId: BigInt(d.id), dataBaru: serialize(updated) })
    revalidatePath(PAGE_PATH)
    return ok(serialize(updated))
  } catch {
    return fail("Gagal mengubah pinjaman")
  }
}

// ─── Batalkan pinjaman ───────────────────────────────────────────
export async function cancelLoan(id: number) {
  const auth = await requirePayrollAdmin()
  if ("error" in auth) return fail(auth.error)
  if (!id || id <= 0) return fail("ID tidak valid")
  try {
    const loan = await prisma.employee_loans.findUnique({ where: { id: BigInt(id) }, select: { id: true, status: true } })
    if (!loan) return fail("Pinjaman tidak ditemukan")
    if (loan.status === "COMPLETED") return fail("Pinjaman sudah lunas, tidak dapat dibatalkan")

    const updated = await prisma.employee_loans.update({
      where: { id: BigInt(id) },
      data: { status: "CANCELLED", updated_at: new Date() },
    })
    await writeAuditLog({ user: auth.user, action: "UPDATE", modelType: "employee_loans", modelId: BigInt(id), dataBaru: { status: "CANCELLED" } })
    revalidatePath(PAGE_PATH)
    return ok(serialize(updated))
  } catch {
    return fail("Gagal membatalkan pinjaman")
  }
}

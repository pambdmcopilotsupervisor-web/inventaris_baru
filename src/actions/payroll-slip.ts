"use server"

/**
 * Server Actions — Slip Gaji.
 * Konvensi response: { success, data, error }. Data slip dari snapshot.
 */

import { prisma } from "@/lib/prisma"
import { getSession, type SessionUser } from "@/lib/session"
import { buildSlipData, type SlipData } from "@/lib/payroll/slip-data"

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
async function requirePayrollAccess(): Promise<{ user: SessionUser } | { error: string }> {
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

// ─── 1. Detail slip ──────────────────────────────────────────────
export async function getPayrollSlip(slipId: number): Promise<ActionResult<SlipData>> {
  const auth = await requirePayrollAccess()
  if ("error" in auth) return fail(auth.error)
  if (!slipId || slipId <= 0) return fail("ID slip tidak valid")

  try {
    const data = await buildSlipData(slipId)
    if (!data) return fail("Slip gaji tidak ditemukan")
    return ok(data)
  } catch {
    return fail("Gagal memuat slip gaji")
  }
}

// ─── 2. Riwayat payroll karyawan ─────────────────────────────────
export async function getEmployeePayrollHistory(employeeId: number, limit = 12) {
  const auth = await requirePayrollAccess()
  if ("error" in auth) return fail(auth.error)
  if (!employeeId || employeeId <= 0) return fail("Karyawan tidak valid")

  try {
    const slips = await prisma.payroll_slips.findMany({
      where: { employee_id: BigInt(employeeId) },
      include: { payroll_periods: { select: { period_month: true, period_year: true, status: true } } },
      orderBy: { id: "desc" },
      take: Math.min(Math.max(limit, 1), 60),
    })

    const MONTHS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"]
    const rows = slips.map((s) => ({
      slip_id: Number(s.id),
      period_month: s.payroll_periods.period_month,
      period_year: s.payroll_periods.period_year,
      period_label: `${MONTHS[s.payroll_periods.period_month - 1]} ${s.payroll_periods.period_year}`,
      period_status: s.payroll_periods.status,
      total_earnings: Number(s.total_earnings),
      total_deductions: Number(s.total_deductions),
      net_salary: Number(s.net_salary),
      status: s.status,
    }))
    return ok(rows)
  } catch {
    return fail("Gagal memuat riwayat payroll")
  }
}

import { NextRequest, NextResponse } from "next/server"
import { prisma, serialize } from "@/lib/prisma"
import { requireMobileAuth } from "@/lib/mobile-auth"

export const runtime = "nodejs"

const MONTHS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"]
const VISIBLE = ["APPROVED", "PAID", "CLOSED"] as const

// GET /api/mobile/payroll/slips → daftar slip gaji milik karyawan yang login
export async function GET(req: NextRequest) {
  const auth = await requireMobileAuth(req)
  if ("error" in auth) return auth.error

  const karyawanId = auth.user.karyawan_id
  if (!karyawanId) return NextResponse.json({ error: "Akun belum terhubung ke data karyawan" }, { status: 422 })

  try {
    const slips = await prisma.payroll_slips.findMany({
      where: {
        employee_id: BigInt(karyawanId),
        payroll_periods: { status: { in: [...VISIBLE] } },
      },
      include: { payroll_periods: { select: { period_month: true, period_year: true, status: true, tanggal_bayar: true } } },
      orderBy: { id: "desc" },
    })

    const data = slips.map((s) => ({
      slip_id: Number(s.id),
      period_month: s.payroll_periods.period_month,
      period_year: s.payroll_periods.period_year,
      period_label: `${MONTHS[s.payroll_periods.period_month - 1]} ${s.payroll_periods.period_year}`,
      period_status: s.payroll_periods.status,
      tanggal_bayar: s.payroll_periods.tanggal_bayar,
      total_earnings: Number(s.total_earnings),
      total_deductions: Number(s.total_deductions),
      net_salary: Number(s.net_salary),
    }))

    return NextResponse.json(serialize({ data }))
  } catch (err) {
    console.error("[mobile payroll slips]", err)
    return NextResponse.json({ error: "Gagal memuat daftar slip" }, { status: 500 })
  }
}

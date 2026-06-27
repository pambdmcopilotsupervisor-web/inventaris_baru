import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireMobileAuth } from "@/lib/mobile-auth"
import { buildSlipData } from "@/lib/payroll/slip-data"

export const runtime = "nodejs"

const VISIBLE = ["APPROVED", "PAID", "CLOSED"]

// GET /api/mobile/payroll/slip/[id] → detail slip gaji milik karyawan yang login
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireMobileAuth(req)
  if ("error" in auth) return auth.error

  const karyawanId = auth.user.karyawan_id
  if (!karyawanId) return NextResponse.json({ error: "Akun belum terhubung ke data karyawan" }, { status: 422 })

  try {
    const { id } = await params
    const slipId = Number(id)
    if (!Number.isInteger(slipId) || slipId <= 0) {
      return NextResponse.json({ error: "ID slip tidak valid" }, { status: 400 })
    }

    // Validasi kepemilikan + status periode (hanya yang sudah disetujui).
    const slip = await prisma.payroll_slips.findUnique({
      where: { id: BigInt(slipId) },
      select: { employee_id: true, payroll_periods: { select: { status: true } } },
    })
    if (!slip) return NextResponse.json({ error: "Slip tidak ditemukan" }, { status: 404 })
    if (Number(slip.employee_id) !== karyawanId) {
      return NextResponse.json({ error: "Tidak diizinkan mengakses slip ini" }, { status: 403 })
    }
    if (!VISIBLE.includes(slip.payroll_periods.status)) {
      return NextResponse.json({ error: "Slip belum tersedia" }, { status: 403 })
    }

    const data = await buildSlipData(slipId)
    if (!data) return NextResponse.json({ error: "Slip tidak ditemukan" }, { status: 404 })

    return NextResponse.json({ data })
  } catch (err) {
    console.error("[mobile payroll slip detail]", err)
    return NextResponse.json({ error: "Gagal memuat slip" }, { status: 500 })
  }
}

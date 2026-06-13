import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireMobileAuth } from "@/lib/mobile-auth"
import { STATUS_LEMBUR } from "@/lib/lembur"

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireMobileAuth(req)
  if ("error" in auth) return auth.error
  const karyawanId = auth.user.karyawan_id
  try {
    const { id } = await params
    const overtime = await prisma.overtime_requests.findUnique({ where: { id: BigInt(id) } })
    if (!overtime) return NextResponse.json({ error: "Tidak ditemukan" }, { status: 404 })
    if (karyawanId && Number(overtime.karyawan_id) !== karyawanId) return NextResponse.json({ error: "Tidak diizinkan" }, { status: 403 })
    const cancellableStatuses: string[] = [STATUS_LEMBUR.DRAFT, STATUS_LEMBUR.SUBMITTED]
    if (!cancellableStatuses.includes(overtime.status)) {
      return NextResponse.json({ error: "Hanya draft atau submitted yang dapat dibatalkan" }, { status: 422 })
    }
    const now = new Date()
    await prisma.overtime_requests.update({ where: { id: BigInt(id) }, data: { status: STATUS_LEMBUR.CANCELLED, updated_at: now } })
    await prisma.overtime_approvals.updateMany({ where: { overtime_request_id: BigInt(id), status: "pending" }, data: { status: "cancelled", updated_at: now } })
    return NextResponse.json({ success: true, message: "Pengajuan lembur dibatalkan" })
  } catch { return NextResponse.json({ error: "Gagal" }, { status: 500 }) }
}

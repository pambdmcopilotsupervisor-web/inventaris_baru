import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireRole, getClientIp } from "@/lib/auth"
import { writeAuditLog } from "@/lib/audit"
import { STATUS_LEMBUR } from "@/lib/lembur"

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(req, ["admin", "hrd", "atasan", "user", "operator"])
  if ("error" in auth) return auth.error
  try {
    const { id } = await params
    const overtime = await prisma.overtime_requests.findUnique({ where: { id: BigInt(id) } })
    if (!overtime) return NextResponse.json({ error: "Tidak ditemukan" }, { status: 404 })

    const cancelable = [STATUS_LEMBUR.DRAFT, STATUS_LEMBUR.SUBMITTED, STATUS_LEMBUR.APPROVED_SUPERVISOR, STATUS_LEMBUR.APPROVED_HRD]
    if (!cancelable.includes(overtime.status as never)) return NextResponse.json({ error: "Tidak dapat dibatalkan" }, { status: 422 })

    const role = (auth.user.role ?? "user").toLowerCase()
    if (role !== "admin" && role !== "hrd") {
      const kId = auth.user.karyawan_id
      if (!kId || Number(overtime.karyawan_id) !== kId) return NextResponse.json({ error: "Tidak diizinkan" }, { status: 403 })
      if (!["draft", "submitted"].includes(overtime.status)) return NextResponse.json({ error: "Hanya HRD/Admin yang bisa batalkan yang sudah diproses" }, { status: 422 })
    }

    await prisma.$transaction(async (tx) => {
      await tx.overtime_requests.update({ where: { id: BigInt(id) }, data: { status: STATUS_LEMBUR.CANCELLED, updated_at: new Date() } })
      await writeAuditLog({ user: auth.user, action: "UPDATE", modelType: "overtime_requests", modelId: BigInt(id), dataBaru: { status: "cancelled" }, ip: getClientIp(req), tx })
    })
    return NextResponse.json({ success: true })
  } catch { return NextResponse.json({ error: "Gagal membatalkan" }, { status: 500 }) }
}

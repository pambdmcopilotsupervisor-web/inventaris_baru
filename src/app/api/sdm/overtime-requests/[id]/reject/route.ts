import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireRole, getClientIp } from "@/lib/auth"
import { writeAuditLog } from "@/lib/audit"
import { STATUS_LEMBUR } from "@/lib/lembur"
import { isAdminRole, isHrdUser, isRecordedApprover } from "@/lib/approval"

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(req, ["admin", "hrd", "atasan", "user", "operator"])
  if ("error" in auth) return auth.error
  try {
    const { id } = await params
    const body = await req.json()
    if (!body.note?.trim()) return NextResponse.json({ error: "Catatan penolakan wajib diisi" }, { status: 400 })

    const overtime = await prisma.overtime_requests.findUnique({
      where: { id: BigInt(id) },
      include: { overtime_approvals: { orderBy: { approval_level: "asc" } } },
    })
    if (!overtime) return NextResponse.json({ error: "Tidak ditemukan" }, { status: 404 })

    const now = new Date()
    const userId = BigInt(auth.user.id)
    const role = auth.user.role ?? "user"
    const karyawanId = auth.user.karyawan_id
    const isAdmin = isAdminRole(role)
    const isHrd = await isHrdUser(karyawanId)

    let newStatus: string
    let approvalLevel: number
    if (overtime.status === STATUS_LEMBUR.SUBMITTED) {
      if (overtime.status !== STATUS_LEMBUR.SUBMITTED) return NextResponse.json({ error: "Status tidak valid" }, { status: 422 })
      newStatus = STATUS_LEMBUR.REJECTED_SUPERVISOR; approvalLevel = 1
    } else if (overtime.status === STATUS_LEMBUR.APPROVED_SUPERVISOR) {
      if (overtime.status !== STATUS_LEMBUR.APPROVED_SUPERVISOR) return NextResponse.json({ error: "Status tidak valid" }, { status: 422 })
      newStatus = STATUS_LEMBUR.REJECTED_HRD; approvalLevel = 2
    } else {
      return NextResponse.json({ error: "Status tidak valid" }, { status: 422 })
    }

    const ap = overtime.overtime_approvals.find(a => a.approval_level === approvalLevel && a.status === "pending")
    if (!ap) return NextResponse.json({ error: "Tidak ada approval pending untuk level ini" }, { status: 422 })
    if (approvalLevel === 1 && !isAdmin && !isRecordedApprover(ap.approver_id, karyawanId)) {
      return NextResponse.json({ error: "Anda bukan approver yang tercatat untuk pengajuan ini" }, { status: 403 })
    }
    if (approvalLevel === 2 && !isAdmin && !isHrd) {
      return NextResponse.json({ error: "Anda tidak memiliki hak penolakan level 2 (HRD)" }, { status: 403 })
    }

    await prisma.$transaction(async (tx) => {
      await tx.overtime_approvals.update({ where: { id: ap.id }, data: { status: "rejected", approver_user_id: userId, note: body.note.trim(), approved_at: now, updated_at: now } })
      await tx.overtime_requests.update({ where: { id: BigInt(id) }, data: { status: newStatus, updated_at: now } })
      await writeAuditLog({ user: auth.user, action: "UPDATE", modelType: "overtime_requests", modelId: BigInt(id), dataBaru: { status: newStatus, note: body.note }, ip: getClientIp(req), tx })
    })
    return NextResponse.json({ success: true, message: "Lembur ditolak" })
  } catch (err) {
    console.error("[reject overtime]", err)
    return NextResponse.json({ error: "Gagal menolak" }, { status: 500 })
  }
}

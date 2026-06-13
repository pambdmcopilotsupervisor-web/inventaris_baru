import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireRole, getClientIp } from "@/lib/auth"
import { writeAuditLog } from "@/lib/audit"
import { STATUS_IZIN } from "@/lib/izin"
import { isAdminRole, isHrdUser, isRecordedApprover } from "@/lib/approval"

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(req, ["admin", "hrd", "atasan", "user", "operator"])
  if ("error" in auth) return auth.error
  try {
    const { id } = await params
    const body = await req.json()
    if (!body.note?.trim()) return NextResponse.json({ error: "Catatan penolakan wajib diisi" }, { status: 400 })

    const pengajuan = await prisma.pengajuan_izins.findUnique({
      where: { id: BigInt(id) },
      include: { izin_approvals: { orderBy: { approval_level: "asc" } } },
    })
    if (!pengajuan) return NextResponse.json({ error: "Tidak ditemukan" }, { status: 404 })

    const now = new Date()
    const userId = BigInt(auth.user.id)
    const role = auth.user.role ?? "user"
    const karyawanId = auth.user.karyawan_id
    const isAdmin = isAdminRole(role)
    const isHrd = await isHrdUser(karyawanId)

    let newStatus: string
    let approvalLevel: number
    if (pengajuan.status === STATUS_IZIN.SUBMITTED) {
      if (pengajuan.status !== STATUS_IZIN.SUBMITTED) return NextResponse.json({ error: "Status tidak valid" }, { status: 422 })
      newStatus = STATUS_IZIN.REJECTED_SUPERVISOR; approvalLevel = 1
    } else if (pengajuan.status === STATUS_IZIN.APPROVED_SUPERVISOR) {
      if (pengajuan.status !== STATUS_IZIN.APPROVED_SUPERVISOR) return NextResponse.json({ error: "Status tidak valid" }, { status: 422 })
      newStatus = STATUS_IZIN.REJECTED_HRD; approvalLevel = 2
    } else {
      return NextResponse.json({ error: "Status tidak valid" }, { status: 422 })
    }

    const ap = pengajuan.izin_approvals.find(a => a.approval_level === approvalLevel && a.status === "pending")
    if (!ap) return NextResponse.json({ error: "Tidak ada approval pending untuk level ini" }, { status: 422 })
    if (approvalLevel === 1 && !isAdmin && !isRecordedApprover(ap.approver_id, karyawanId)) {
      return NextResponse.json({ error: "Anda bukan approver yang tercatat untuk pengajuan ini" }, { status: 403 })
    }
    if (approvalLevel === 2 && !isAdmin && !isHrd) {
      return NextResponse.json({ error: "Anda tidak memiliki hak penolakan level 2 (HRD)" }, { status: 403 })
    }

    await prisma.$transaction(async (tx) => {
      await tx.izin_approvals.update({ where: { id: ap.id }, data: { status: "rejected", approver_user_id: userId, note: body.note.trim(), approved_at: now, updated_at: now } })
      await tx.pengajuan_izins.update({ where: { id: BigInt(id) }, data: { status: newStatus, updated_at: now } })
      await writeAuditLog({ user: auth.user, action: "UPDATE", modelType: "pengajuan_izins", modelId: BigInt(id), dataBaru: { status: newStatus, note: body.note }, ip: getClientIp(req), tx })
    })
    return NextResponse.json({ success: true, message: "Izin ditolak" })
  } catch (err) {
    console.error("[reject izin]", err)
    return NextResponse.json({ error: "Gagal menolak" }, { status: 500 })
  }
}

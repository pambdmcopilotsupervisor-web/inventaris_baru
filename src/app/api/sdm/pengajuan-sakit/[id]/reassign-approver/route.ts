import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireRole, getClientIp } from "@/lib/auth"
import { writeAuditLog } from "@/lib/audit"
import { STATUS_SAKIT } from "@/lib/sakit"
import { canManageApproval, resolveApproverReassignment } from "@/lib/approval"

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(req, ["admin", "hrd", "atasan", "user", "operator"])
  if ("error" in auth) return auth.error

  try {
    const role = auth.user.role ?? "user"
    const karyawanId = auth.user.karyawan_id
    const canManage = await canManageApproval({ role, karyawanId })
    if (!canManage) return NextResponse.json({ error: "Hanya Admin atau HRD yang dapat mengganti approver" }, { status: 403 })

    const { id } = await params
    const body = await req.json()
    const alasan = body.alasan?.trim()
    if (!alasan) return NextResponse.json({ error: "Alasan perubahan approver wajib diisi" }, { status: 400 })

    const pengajuan = await prisma.pengajuan_sakits.findUnique({ where: { id: BigInt(id) }, include: { sakit_approvals: { orderBy: { approval_level: "asc" } } } })
    if (!pengajuan) return NextResponse.json({ error: "Pengajuan tidak ditemukan" }, { status: 404 })
    if (pengajuan.status !== STATUS_SAKIT.SUBMITTED) return NextResponse.json({ error: "Approver hanya dapat diganti saat pengajuan menunggu atasan" }, { status: 422 })

    const approvalL1 = pengajuan.sakit_approvals.find(a => a.approval_level === 1 && a.status === "pending")
    if (!approvalL1) return NextResponse.json({ error: "Tidak ada approval level 1 yang pending" }, { status: 422 })

    const reassignment = await resolveApproverReassignment({ karyawanId: pengajuan.karyawan_id, approverId: body.approver_id, refresh: body.refresh === true, skipToHrd: body.skip_to_hrd === true })
    if (reassignment.type === "error") return NextResponse.json({ error: reassignment.error }, { status: 422 })

    const now = new Date()
    const userId = BigInt(auth.user.id)

    await prisma.$transaction(async (tx) => {
      if (reassignment.type === "skip_to_hrd") {
        await tx.sakit_approvals.update({ where: { id: approvalL1.id }, data: { status: "approved", approver_user_id: userId, note: `Dilewati ke HRD. Alasan: ${alasan}`, approved_at: now, updated_at: now } })
        if (!pengajuan.sakit_approvals.some(a => a.approval_level === 2)) {
          await tx.sakit_approvals.create({ data: { pengajuan_sakit_id: pengajuan.id, approver_id: null, approver_role: "hrd", approval_level: 2, status: "pending", created_at: now, updated_at: now } })
        }
        await tx.pengajuan_sakits.update({ where: { id: pengajuan.id }, data: { status: STATUS_SAKIT.APPROVED_SUPERVISOR, updated_at: now } })
      } else {
        await tx.sakit_approvals.update({ where: { id: approvalL1.id }, data: { approver_id: reassignment.approver.id, approver_role: "atasan", note: alasan, updated_at: now } })
      }

      await writeAuditLog({ user: auth.user, action: "UPDATE", modelType: "sakit_approvals", modelId: approvalL1.id, dataLama: { approver_id: approvalL1.approver_id?.toString() ?? null, status: approvalL1.status }, dataBaru: { mode: reassignment.type, approver_id: reassignment.type === "approver" ? reassignment.approver.id.toString() : null, alasan }, ip: getClientIp(req), tx })
    })
    return NextResponse.json({ success: true, message: "Approver sakit berhasil diperbarui" })
  } catch (err) {
    console.error("[reassign approver sakit]", err)
    return NextResponse.json({ error: "Gagal mengganti approver" }, { status: 500 })
  }
}

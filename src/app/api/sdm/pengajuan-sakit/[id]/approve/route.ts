import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireRole, getClientIp } from "@/lib/auth"
import { writeAuditLog } from "@/lib/audit"
import { STATUS_SAKIT, applySakitToAbsensi } from "@/lib/sakit"
import { isAdminRole, isHrdUser, isRecordedApprover } from "@/lib/approval"

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(req, ["admin", "hrd", "atasan", "user", "operator"])
  if ("error" in auth) return auth.error
  try {
    const { id } = await params
    const body = await req.json()
    const pengajuan = await prisma.pengajuan_sakits.findUnique({
      where: { id: BigInt(id) },
      include: { sakit_approvals: { orderBy: { approval_level: "asc" } } },
    })
    if (!pengajuan) return NextResponse.json({ error: "Tidak ditemukan" }, { status: 404 })

    const now = new Date()
    const userId = BigInt(auth.user.id)
    const role = auth.user.role ?? "user"
    const karyawanId = auth.user.karyawan_id

    const isAdmin = isAdminRole(role)
    const isHrd = await isHrdUser(karyawanId)

    const doAtasanApproval = pengajuan.status === STATUS_SAKIT.SUBMITTED
    const doHrdApproval    = pengajuan.status === STATUS_SAKIT.APPROVED_SUPERVISOR
    if (!doAtasanApproval && !doHrdApproval) return NextResponse.json({ error: "Status tidak dapat disetujui" }, { status: 422 })

    await prisma.$transaction(async (tx) => {
    if (doAtasanApproval) {
      const ap = pengajuan.sakit_approvals.find(a => a.approval_level === 1 && a.status === "pending")
      if (!ap) return NextResponse.json({ error: "Tidak ada approval level 1 pending" }, { status: 422 })
      if (!isAdmin && !isRecordedApprover(ap.approver_id, karyawanId)) {
        return NextResponse.json({ error: "Anda bukan approver yang tercatat untuk pengajuan ini" }, { status: 403 })
      }
      await tx.sakit_approvals.update({
        where: { id: ap.id },
        data: { status: "approved", approver_user_id: userId, approver_id: ap.approver_id, note: body.note || null, approved_at: now, updated_at: now },
      })
      await tx.sakit_approvals.create({
        data: { pengajuan_sakit_id: BigInt(id), approver_id: null, approver_role: "hrd", approval_level: 2, status: "pending", created_at: now, updated_at: now },
      })
      await tx.pengajuan_sakits.update({ where: { id: BigInt(id) }, data: { status: STATUS_SAKIT.APPROVED_SUPERVISOR, updated_at: now } })
    } else {
      if (!isAdmin && !isHrd) return NextResponse.json({ error: "Anda tidak memiliki hak approval level 2 (HRD)" }, { status: 403 })
      const ap = pengajuan.sakit_approvals.find(a => a.approval_level === 2 && a.status === "pending")
      if (!ap) return NextResponse.json({ error: "Tidak ada approval HRD pending" }, { status: 422 })
      await tx.sakit_approvals.update({
        where: { id: ap.id },
        data: { status: "approved", approver_user_id: userId, approver_id: karyawanId ? BigInt(karyawanId) : ap.approver_id, note: body.note || null, approved_at: now, updated_at: now },
      })
      await tx.pengajuan_sakits.update({ where: { id: BigInt(id) }, data: { status: STATUS_SAKIT.APPROVED_HRD, updated_at: now } })
      await applySakitToAbsensi({ karyawanId: pengajuan.karyawan_id, tanggalMulai: pengajuan.tanggal_mulai, tanggalSelesai: pengajuan.tanggal_selesai, pengajuanSakitId: BigInt(id), userId, tx })
    }

    await writeAuditLog({ user: auth.user, action: "UPDATE", modelType: "pengajuan_sakits", modelId: BigInt(id), dataBaru: { status: "approved" }, ip: getClientIp(req), tx })
    }, { timeout: 20000 })
    return NextResponse.json({ success: true, message: "Sakit disetujui" })
  } catch (err) {
    console.error("[approve sakit]", err)
    return NextResponse.json({ error: "Gagal menyetujui" }, { status: 500 })
  }
}

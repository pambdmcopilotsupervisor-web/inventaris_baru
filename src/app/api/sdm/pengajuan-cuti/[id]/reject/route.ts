import { NextRequest, NextResponse } from "next/server"
import { prisma, serialize } from "@/lib/prisma"
import { requireRole, getClientIp } from "@/lib/auth"
import { writeAuditLog } from "@/lib/audit"
import { STATUS_CUTI, kembalikanSaldoCuti } from "@/lib/leave"
import { isAdminRole, isHrdUser, isRecordedApprover } from "@/lib/approval"

// POST /api/sdm/pengajuan-cuti/[id]/reject
// Akses: berdasarkan jabatan atau role hrd/admin

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(req, ["admin", "hrd", "atasan", "user", "operator"])
  if ("error" in auth) return auth.error
  try {
    const { id } = await params
    const body = await req.json()
    if (!body.note?.trim()) return NextResponse.json({ error: "Catatan penolakan wajib diisi" }, { status: 400 })

    const pengajuan = await prisma.pengajuan_cutis.findUnique({
      where: { id: BigInt(id) },
      include: { jenis_cutis: true, approvals: { orderBy: { approval_level: "asc" } } },
    })
    if (!pengajuan) return NextResponse.json({ error: "Tidak ditemukan" }, { status: 404 })

    const now    = new Date()
    const userId = BigInt(auth.user.id)
    const role   = auth.user.role ?? "user"
    const karyawanId = auth.user.karyawan_id
    const isAdmin = isAdminRole(role)
    const isHrd = await isHrdUser(karyawanId)

    let newStatus: string
    let approvalLevel: number

    if (pengajuan.status === STATUS_CUTI.SUBMITTED) {
      if (pengajuan.status !== STATUS_CUTI.SUBMITTED) return NextResponse.json({ error: "Status tidak valid untuk ditolak atasan" }, { status: 422 })
      newStatus = STATUS_CUTI.REJECTED_SUPERVISOR
      approvalLevel = 1
    } else if (pengajuan.status === STATUS_CUTI.APPROVED_SUPERVISOR) {
      if (pengajuan.status !== STATUS_CUTI.APPROVED_SUPERVISOR) return NextResponse.json({ error: "Status tidak valid untuk ditolak HRD" }, { status: 422 })
      newStatus = STATUS_CUTI.REJECTED_HRD
      approvalLevel = 2
    } else {
      return NextResponse.json({ error: "Status tidak valid untuk ditolak" }, { status: 422 })
    }

    const approval = pengajuan.approvals.find(a => a.approval_level === approvalLevel && a.status === "pending")
    if (!approval) return NextResponse.json({ error: "Tidak ada approval pending untuk level ini" }, { status: 422 })

    if (approvalLevel === 1 && !isAdmin && !isRecordedApprover(approval.approver_id, karyawanId)) {
      return NextResponse.json({ error: "Anda bukan approver yang tercatat untuk pengajuan ini" }, { status: 403 })
    }
    if (approvalLevel === 2 && !isAdmin && !isHrd) {
      return NextResponse.json({ error: "Anda tidak memiliki hak penolakan level 2 (HRD)" }, { status: 403 })
    }

    await prisma.$transaction(async (tx) => {
      await tx.leave_request_approvals.update({
        where: { id: approval.id },
        data: { status: "rejected", approver_user_id: userId, note: body.note.trim(), approved_at: now, updated_at: now },
      })

      await tx.pengajuan_cutis.update({ where: { id: BigInt(id) }, data: { status: newStatus, updated_at: now } })

      if (isHrd && pengajuan.jenis_cutis.potong_saldo_cuti && pengajuan.jumlah_hari > 0) {
        await kembalikanSaldoCuti(pengajuan.karyawan_id, pengajuan.jenis_cuti_id, pengajuan.tanggal_mulai.getFullYear(), pengajuan.jumlah_hari, tx)
      }

      await writeAuditLog({ user: auth.user, action: "UPDATE", modelType: "pengajuan_cutis", modelId: BigInt(id), dataBaru: { status: newStatus, note: body.note }, ip: getClientIp(req), tx })
    }, { timeout: 20000 })
    return NextResponse.json({ success: true, message: "Pengajuan berhasil ditolak" })
  } catch (err) {
    console.error("[reject cuti]", err)
    return NextResponse.json({ error: "Gagal menolak pengajuan" }, { status: 500 })
  }
}

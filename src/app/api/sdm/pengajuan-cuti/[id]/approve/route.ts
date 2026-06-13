import { NextRequest, NextResponse } from "next/server"
import { prisma, serialize } from "@/lib/prisma"
import { requireRole, getClientIp } from "@/lib/auth"
import { writeAuditLog } from "@/lib/audit"
import { STATUS_CUTI, potongSaldoCuti, applyLeaveToAbsensi } from "@/lib/leave"
import { isAdminRole, isHrdUser, isRecordedApprover } from "@/lib/approval"

// POST /api/sdm/pengajuan-cuti/[id]/approve
// Akses: berdasarkan jabatan karyawan ATAU role hrd/admin

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(req, ["admin", "hrd", "atasan", "user", "operator"])
  if ("error" in auth) return auth.error
  try {
    const { id } = await params
    const body = await req.json()
    const { note } = body

    const pengajuan = await prisma.pengajuan_cutis.findUnique({
      where: { id: BigInt(id) },
      include: { karyawans: true, jenis_cutis: true, approvals: { orderBy: { approval_level: "asc" } } },
    })
    if (!pengajuan) return NextResponse.json({ error: "Pengajuan tidak ditemukan" }, { status: 404 })

    const now    = new Date()
    const userId = BigInt(auth.user.id)
    const role   = auth.user.role ?? "user"
    const karyawanId = auth.user.karyawan_id

    const isAdmin = isAdminRole(role)
    const isHrdCapable = await isHrdUser(karyawanId)

    // Tentukan level approval berdasarkan status pengajuan
    // Admin bisa approve level 1 ATAU level 2 sesuai kondisi saat ini
    const doAtasanApproval = pengajuan.status === STATUS_CUTI.SUBMITTED
    const doHrdApproval    = pengajuan.status === STATUS_CUTI.APPROVED_SUPERVISOR

    if (!doAtasanApproval && !doHrdApproval) {
      return NextResponse.json({ error: "Pengajuan tidak dalam status yang dapat disetujui" }, { status: 422 })
    }

    await prisma.$transaction(async (tx) => {
    if (doAtasanApproval) {
      // Level 1 dikunci ke approver_id yang tercatat, kecuali admin.
      const approvalL1 = pengajuan.approvals.find(a => a.approval_level === 1 && a.status === "pending")
      if (!approvalL1) return NextResponse.json({ error: "Tidak ada approval level 1 yang pending" }, { status: 422 })
      if (!isAdmin && !isRecordedApprover(approvalL1.approver_id, karyawanId)) {
        return NextResponse.json({ error: "Anda bukan approver yang tercatat untuk pengajuan ini" }, { status: 403 })
      }

      await tx.leave_request_approvals.update({
        where: { id: approvalL1.id },
        data: {
          status:           "approved",
          approver_user_id: userId,
          approver_id:      approvalL1.approver_id,
          note:             note || null,
          approved_at:      now,
          updated_at:       now,
        },
      })

      await tx.leave_request_approvals.create({
        data: { pengajuan_cuti_id: BigInt(id), approver_id: null, approver_role: "hrd", approval_level: 2, status: "pending", created_at: now, updated_at: now },
      })

      await tx.pengajuan_cutis.update({ where: { id: BigInt(id) }, data: { status: STATUS_CUTI.APPROVED_SUPERVISOR, updated_at: now } })

    } else {
      // doHrdApproval — Level 2: HRD approve (final)
      // Hanya HRD capable atau admin yang bisa approve level 2
      if (!isHrdCapable && !isAdmin) {
        return NextResponse.json({ error: "Anda tidak memiliki hak approval level 2 (HRD)" }, { status: 403 })
      }
      const approvalL2 = pengajuan.approvals.find(a => a.approval_level === 2 && a.status === "pending")
      if (!approvalL2) return NextResponse.json({ error: "Tidak ada approval HRD yang pending" }, { status: 422 })

      await tx.leave_request_approvals.update({
        where: { id: approvalL2.id },
        data: {
          status:           "approved",
          approver_user_id: userId,
          // Jika yang approve adalah admin, catat karyawan_id admin sebagai approver
          approver_id:      karyawanId ? BigInt(karyawanId) : approvalL2.approver_id,
          note:             note || null,
          approved_at:      now,
          updated_at:       now,
        },
      })

      await tx.pengajuan_cutis.update({ where: { id: BigInt(id) }, data: { status: STATUS_CUTI.APPROVED_HRD, updated_at: now } })

      if (pengajuan.jenis_cutis.potong_saldo_cuti && pengajuan.jumlah_hari > 0) {
        await potongSaldoCuti(pengajuan.karyawan_id, pengajuan.jenis_cuti_id, pengajuan.tanggal_mulai.getFullYear(), pengajuan.jumlah_hari, tx)
      }

      await applyLeaveToAbsensi(pengajuan.karyawan_id, pengajuan.tanggal_mulai, pengajuan.tanggal_selesai, BigInt(id), userId, tx)

      try {
        await (tx as unknown as { notifications: { create: (args: unknown) => Promise<unknown> } }).notifications.create({
          data: { id: crypto.randomUUID(), type: "cuti.approved_hrd", notifiable_type: "karyawans", notifiable_id: pengajuan.karyawan_id,
            data: JSON.stringify({ message: `Pengajuan cuti ${pengajuan.jenis_cutis.nama_cuti} Anda telah disetujui HRD`, pengajuan_id: String(id) }),
            created_at: now, updated_at: now },
        })
      } catch { /* notifikasi gagal tidak merusak flow */ }
    }

    await writeAuditLog({ user: auth.user, action: "UPDATE", modelType: "pengajuan_cutis", modelId: BigInt(id), dataBaru: { status: "approved", isHrdCapable }, ip: getClientIp(req), tx })
    }, { timeout: 20000 })
    return NextResponse.json({ success: true, message: "Pengajuan berhasil disetujui" })
  } catch (err) {
    console.error("[approve cuti]", err)
    return NextResponse.json({ error: "Gagal menyetujui pengajuan" }, { status: 500 })
  }
}

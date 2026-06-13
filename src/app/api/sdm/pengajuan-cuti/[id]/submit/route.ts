import { NextRequest, NextResponse } from "next/server"
import { prisma, serialize } from "@/lib/prisma"
import { requireRole, getClientIp } from "@/lib/auth"
import { writeAuditLog } from "@/lib/audit"
import { STATUS_CUTI, resolveAtasan, potongSaldoCuti, applyLeaveToAbsensi } from "@/lib/leave"

// POST /api/sdm/pengajuan-cuti/[id]/submit
// Ubah status draft → submitted, buat approval record

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(req, ["admin", "hrd", "atasan", "user", "operator"])
  if ("error" in auth) return auth.error
  try {
    const { id } = await params
    const pengajuan = await prisma.pengajuan_cutis.findUnique({
      where: { id: BigInt(id) },
      include: { karyawans: true, jenis_cutis: true },
    })
    if (!pengajuan) return NextResponse.json({ error: "Tidak ditemukan" }, { status: 404 })
    if (pengajuan.status !== STATUS_CUTI.DRAFT) {
      return NextResponse.json({ error: "Hanya pengajuan berstatus draft yang dapat di-submit" }, { status: 422 })
    }

    const now = new Date()
    const userId = BigInt(auth.user.id)

    // Resolusi atasan
    const { atasan, level } = await resolveAtasan(pengajuan.karyawan_id)

    // Update status
    await prisma.pengajuan_cutis.update({
      where: { id: BigInt(id) },
      data: { status: STATUS_CUTI.SUBMITTED, updated_at: now },
    })

    // Buat approval record level 1 (atasan)
    await prisma.leave_request_approvals.create({
      data: {
        pengajuan_cuti_id: BigInt(id),
        approver_id:       atasan?.id ?? null,
        approver_role:     level,
        approval_level:    1,
        status:            "pending",
        created_at:        now, updated_at: now,
      },
    })

    // Jika tidak ada atasan → langsung buat approval level 2 (HRD) sebagai pending
    if (level === "hrd" || !atasan) {
      await prisma.leave_request_approvals.create({
        data: {
          pengajuan_cuti_id: BigInt(id),
          approver_id:       null,
          approver_role:     "hrd",
          approval_level:    2,
          status:            "pending",
          created_at:        now, updated_at: now,
        },
      })
      // Update status langsung ke approved_supervisor (skip atasan)
      await prisma.pengajuan_cutis.update({
        where: { id: BigInt(id) },
        data: { status: STATUS_CUTI.APPROVED_SUPERVISOR, updated_at: now },
      })
    }

    // Notifikasi (pakai tabel notifications yang sudah ada)
    try {
      const notifTarget = atasan?.id ? atasan.id : null
      if (notifTarget) {
        await (prisma as unknown as { notifications: { create: (args: unknown) => Promise<unknown> } }).notifications.create({
          data: {
            id: crypto.randomUUID(),
            type: "cuti.submitted",
            notifiable_type: "karyawans",
            notifiable_id: notifTarget,
            data: JSON.stringify({
              message: `${pengajuan.karyawans.nama_karyawan} mengajukan cuti ${pengajuan.jenis_cutis.nama_cuti}`,
              pengajuan_id: String(id),
            }),
            created_at: now, updated_at: now,
          },
        })
      }
    } catch { /* notifikasi gagal tidak merusak flow */ }

    await writeAuditLog({ user: auth.user, action: "UPDATE", modelType: "pengajuan_cutis", modelId: BigInt(id), dataBaru: { status: "submitted" }, ip: getClientIp(req) })
    return NextResponse.json({ success: true, message: "Pengajuan berhasil disubmit" })
  } catch (err) {
    console.error("[submit cuti]", err)
    return NextResponse.json({ error: "Gagal submit pengajuan" }, { status: 500 })
  }
}

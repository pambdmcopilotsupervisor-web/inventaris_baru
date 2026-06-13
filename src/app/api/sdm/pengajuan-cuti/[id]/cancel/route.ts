import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireRole, getClientIp } from "@/lib/auth"
import { writeAuditLog } from "@/lib/audit"
import { STATUS_CUTI, kembalikanSaldoCuti, revertLeaveFromAbsensi } from "@/lib/leave"

// POST /api/sdm/pengajuan-cuti/[id]/cancel
// Body: { note?: string }

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(req, ["admin", "hrd", "atasan", "user", "operator"])
  if ("error" in auth) return auth.error
  try {
    const { id } = await params
    const body = await req.json()

    const pengajuan = await prisma.pengajuan_cutis.findUnique({
      where: { id: BigInt(id) },
      include: { jenis_cutis: true },
    })
    if (!pengajuan) return NextResponse.json({ error: "Tidak ditemukan" }, { status: 404 })

    const cancelableStatuses = [STATUS_CUTI.DRAFT, STATUS_CUTI.SUBMITTED, STATUS_CUTI.APPROVED_SUPERVISOR, STATUS_CUTI.APPROVED_HRD]
    if (!cancelableStatuses.includes(pengajuan.status as never)) {
      return NextResponse.json({ error: "Pengajuan ini tidak dapat dibatalkan" }, { status: 422 })
    }

    // User biasa hanya bisa batalkan miliknya sendiri yang masih draft/submitted
    if (auth.user.role === "user" || auth.user.role === "atasan") {
      if (auth.user.karyawan_id && pengajuan.karyawan_id !== BigInt(auth.user.karyawan_id)) {
        return NextResponse.json({ error: "Tidak diizinkan membatalkan pengajuan orang lain" }, { status: 403 })
      }
      if (!["draft", "submitted"].includes(pengajuan.status)) {
        return NextResponse.json({ error: "Pengajuan yang sudah diproses hanya bisa dibatalkan oleh HRD/Admin" }, { status: 422 })
      }
    }

    const now    = new Date()
    const userId = BigInt(auth.user.id)

    await prisma.$transaction(async (tx) => {
      await tx.pengajuan_cutis.update({
        where: { id: BigInt(id) },
        data: { status: STATUS_CUTI.CANCELLED, updated_at: now },
      })

      // Kembalikan saldo jika sudah pernah di-approved HRD dan potong saldo
      if (pengajuan.status === STATUS_CUTI.APPROVED_HRD && pengajuan.jenis_cutis.potong_saldo_cuti && pengajuan.jumlah_hari > 0) {
        await kembalikanSaldoCuti(pengajuan.karyawan_id, pengajuan.jenis_cuti_id, pengajuan.tanggal_mulai.getFullYear(), pengajuan.jumlah_hari, tx)
        await revertLeaveFromAbsensi(pengajuan.karyawan_id, pengajuan.tanggal_mulai, pengajuan.tanggal_selesai, userId, tx)
      }

      await writeAuditLog({ user: auth.user, action: "UPDATE", modelType: "pengajuan_cutis", modelId: BigInt(id), dataBaru: { status: "cancelled", note: body.note }, ip: getClientIp(req), tx })
    }, { timeout: 20000 })
    return NextResponse.json({ success: true, message: "Pengajuan berhasil dibatalkan" })
  } catch (err) {
    console.error("[cancel cuti]", err)
    return NextResponse.json({ error: "Gagal membatalkan pengajuan" }, { status: 500 })
  }
}

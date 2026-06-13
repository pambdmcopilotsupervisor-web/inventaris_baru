import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireRole, getClientIp } from "@/lib/auth"
import { writeAuditLog } from "@/lib/audit"
import { STATUS_SAKIT } from "@/lib/sakit"
import { recalculateAbsensiForRange, STATUS_ABSENSI } from "@/lib/attendance"

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(req, ["admin", "hrd", "atasan", "user", "operator"])
  if ("error" in auth) return auth.error
  try {
    const { id } = await params
    const pengajuan = await prisma.pengajuan_sakits.findUnique({ where: { id: BigInt(id) } })
    if (!pengajuan) return NextResponse.json({ error: "Tidak ditemukan" }, { status: 404 })

    const cancelable = [STATUS_SAKIT.DRAFT, STATUS_SAKIT.SUBMITTED, STATUS_SAKIT.APPROVED_SUPERVISOR, STATUS_SAKIT.APPROVED_HRD]
    if (!cancelable.includes(pengajuan.status as never)) return NextResponse.json({ error: "Tidak dapat dibatalkan" }, { status: 422 })

    const role = (auth.user.role ?? "user").toLowerCase()
    if (role !== "admin" && role !== "hrd") {
      const kId = auth.user.karyawan_id
      if (!kId || Number(pengajuan.karyawan_id) !== kId) return NextResponse.json({ error: "Tidak diizinkan" }, { status: 403 })
      if (!["draft", "submitted"].includes(pengajuan.status)) return NextResponse.json({ error: "Hanya HRD/Admin yang bisa batalkan pengajuan yang sudah diproses" }, { status: 422 })
    }

    const now = new Date()
    await prisma.$transaction(async (tx) => {
      await tx.pengajuan_sakits.update({ where: { id: BigInt(id) }, data: { status: STATUS_SAKIT.CANCELLED, updated_at: now } })

      if (pengajuan.status === STATUS_SAKIT.APPROVED_HRD) {
        await recalculateAbsensiForRange({
          karyawanId: pengajuan.karyawan_id,
          tanggalMulai: pengajuan.tanggal_mulai,
          tanggalSelesai: pengajuan.tanggal_selesai,
          userId: BigInt(auth.user.id),
          onlyStatus: STATUS_ABSENSI.SAKIT,
          alasanManual: `Sakit dibatalkan (ID: ${id})`,
          tx,
        })
      }

      await writeAuditLog({ user: auth.user, action: "UPDATE", modelType: "pengajuan_sakits", modelId: BigInt(id), dataBaru: { status: "cancelled" }, ip: getClientIp(req), tx })
    }, { timeout: 20000 })
    return NextResponse.json({ success: true })
  } catch { return NextResponse.json({ error: "Gagal membatalkan" }, { status: 500 }) }
}

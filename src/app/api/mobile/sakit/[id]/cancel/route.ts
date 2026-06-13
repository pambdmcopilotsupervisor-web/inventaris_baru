import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireMobileAuth } from "@/lib/mobile-auth"
import { STATUS_SAKIT } from "@/lib/sakit"

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireMobileAuth(req)
  if ("error" in auth) return auth.error
  const karyawanId = auth.user.karyawan_id
  try {
    const { id } = await params
    const pengajuan = await prisma.pengajuan_sakits.findUnique({ where: { id: BigInt(id) } })
    if (!pengajuan) return NextResponse.json({ error: "Tidak ditemukan" }, { status: 404 })
    if (karyawanId && Number(pengajuan.karyawan_id) !== karyawanId) return NextResponse.json({ error: "Tidak diizinkan" }, { status: 403 })
    const cancellableStatuses: string[] = [STATUS_SAKIT.DRAFT, STATUS_SAKIT.SUBMITTED]
    if (!cancellableStatuses.includes(pengajuan.status)) {
      return NextResponse.json({ error: "Hanya draft atau submitted yang dapat dibatalkan" }, { status: 422 })
    }
    const now = new Date()
    await prisma.pengajuan_sakits.update({ where: { id: BigInt(id) }, data: { status: STATUS_SAKIT.CANCELLED, updated_at: now } })
    await prisma.sakit_approvals.updateMany({ where: { pengajuan_sakit_id: BigInt(id), status: "pending" }, data: { status: "cancelled", updated_at: now } })
    return NextResponse.json({ success: true, message: "Pengajuan sakit dibatalkan" })
  } catch { return NextResponse.json({ error: "Gagal" }, { status: 500 }) }
}

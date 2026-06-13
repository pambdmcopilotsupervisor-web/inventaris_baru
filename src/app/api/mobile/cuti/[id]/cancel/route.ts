import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireMobileAuth } from "@/lib/mobile-auth"
import { STATUS_CUTI } from "@/lib/leave"

// POST /api/mobile/cuti/[id]/cancel — batalkan pengajuan (hanya draft/submitted milik sendiri)

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireMobileAuth(req)
  if ("error" in auth) return auth.error

  const karyawanId = auth.user.karyawan_id
  try {
    const { id } = await params
    const pengajuan = await prisma.pengajuan_cutis.findUnique({ where: { id: BigInt(id) } })
    if (!pengajuan) return NextResponse.json({ error: "Tidak ditemukan" }, { status: 404 })
    if (karyawanId && Number(pengajuan.karyawan_id) !== karyawanId) return NextResponse.json({ error: "Tidak diizinkan" }, { status: 403 })
    if (!["draft", "submitted"].includes(pengajuan.status)) {
      return NextResponse.json({ error: "Pengajuan yang sudah diproses HRD hanya bisa dibatalkan via web" }, { status: 422 })
    }
    await prisma.pengajuan_cutis.update({ where: { id: BigInt(id) }, data: { status: STATUS_CUTI.CANCELLED, updated_at: new Date() } })
    return NextResponse.json({ success: true, message: "Pengajuan cuti dibatalkan" })
  } catch { return NextResponse.json({ error: "Gagal membatalkan" }, { status: 500 }) }
}

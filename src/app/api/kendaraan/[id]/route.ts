import { NextRequest, NextResponse } from "next/server"
import { requireSession } from "@/lib/auth"
import { prisma, serialize } from "@/lib/prisma"
import { canCreateOrEditTransaksi, canDeleteTransaksi, getTransaksiActionError } from "@/lib/transaksi-role"
import { sanitizeKendaraanUpdateData } from "@/lib/kendaraan-input"
import { applyManualStopTagihanStatus, STATUS_SEWA_KONTRAK_BERJALAN, syncRunningContractBilling } from "@/lib/kendaraan-rental-status"
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { const { id } = await params; const data = await prisma.data_r2r4s.findUnique({ where: { id: BigInt(id) } }); if (!data) return NextResponse.json({ error: "Tidak ditemukan" }, { status: 404 }); return NextResponse.json(serialize(data)) } catch { return NextResponse.json({ error: "Server error" }, { status: 500 }) }
}
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSession(req)
  if ("error" in auth) return auth.error
  if (!canCreateOrEditTransaksi(auth.user.role)) return NextResponse.json({ error: getTransaksiActionError("update") }, { status: 403 })
  try {
    const { id } = await params
    const body = await req.json()
    const existing = await prisma.data_r2r4s.findUnique({
      where: { id: BigInt(id) },
      select: { stat: true, tgl_stop_tagihan: true },
    })
    if (!existing) return NextResponse.json({ error: "Tidak ditemukan" }, { status: 404 })

    const updateData = sanitizeKendaraanUpdateData(body)
    applyManualStopTagihanStatus(updateData, existing.stat, existing.tgl_stop_tagihan)
    let data = await prisma.data_r2r4s.update({ where: { id: BigInt(id) }, data: updateData })
    if (data.stat === STATUS_SEWA_KONTRAK_BERJALAN) {
      await syncRunningContractBilling([Number(data.id)])
      data = await prisma.data_r2r4s.findUniqueOrThrow({ where: { id: BigInt(id) } })
    }
    return NextResponse.json(serialize(data))
  } catch {
    return NextResponse.json({ error: "Gagal" }, { status: 500 })
  }
}
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSession(req)
  if ("error" in auth) return auth.error
  if (!canDeleteTransaksi(auth.user.role)) return NextResponse.json({ error: getTransaksiActionError("delete") }, { status: 403 })
  try { const { id } = await params; await prisma.data_r2r4s.delete({ where: { id: BigInt(id) } }); return NextResponse.json({ success: true }) } catch { return NextResponse.json({ error: "Gagal" }, { status: 500 }) }
}

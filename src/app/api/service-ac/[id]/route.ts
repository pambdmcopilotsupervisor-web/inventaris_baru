import { NextRequest, NextResponse } from "next/server"
import { prisma, serialize } from "@/lib/prisma"

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json()
    const { tanggal_service, jenis_pekerjaan, biaya, teknisi, keterangan } = body
    const data = await prisma.riwayat_service_acs.update({
      where: { id: BigInt(id) },
      data: { tanggal_service: new Date(tanggal_service), jenis_pekerjaan, biaya: biaya ? Number(biaya) : 0, teknisi: teknisi ?? null, keterangan: keterangan ?? null },
    })
    return NextResponse.json(serialize(data))
  } catch { return NextResponse.json({ error: "Gagal memperbarui" }, { status: 500 }) }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    await prisma.riwayat_service_acs.delete({ where: { id: BigInt(id) } })
    return NextResponse.json({ success: true })
  } catch { return NextResponse.json({ error: "Gagal menghapus" }, { status: 500 }) }
}

import { NextRequest, NextResponse } from "next/server"
import { prisma, serialize } from "@/lib/prisma"

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const data = await prisma.kontraks.findUnique({ where: { id: BigInt(id) } })
    if (!data) return NextResponse.json({ error: "Tidak ditemukan" }, { status: 404 })
    return NextResponse.json(serialize(data))
  } catch { return NextResponse.json({ error: "Server error" }, { status: 500 }) }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json()
    const { no_kontrak, judul, tgl_awal, tgl_akhir, kendaraan_ids } = body

    const updated = await prisma.kontraks.update({
      where: { id: BigInt(id) },
      data: { no_kontrak: no_kontrak ?? null, judul, tgl_awal: new Date(tgl_awal), tgl_akhir: new Date(tgl_akhir) },
    })

    // Update kontrak details: hapus semua lama, buat ulang
    await prisma.kontrak_details.deleteMany({ where: { kontrak_id: Number(id) } })
    if (kendaraan_ids && Array.isArray(kendaraan_ids) && kendaraan_ids.length > 0) {
      await prisma.kontrak_details.createMany({
        data: kendaraan_ids.filter(Boolean).map((kid: number) => ({
          kontrak_id:   Number(id),
          data_r2r4_id: Number(kid),
        })),
      })
    }

    return NextResponse.json(serialize(updated))
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: "Gagal memperbarui" }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    await prisma.kontrak_details.deleteMany({ where: { kontrak_id: Number(id) } })
    await prisma.kontraks.delete({ where: { id: BigInt(id) } })
    return NextResponse.json({ success: true })
  } catch { return NextResponse.json({ error: "Gagal menghapus" }, { status: 500 }) }
}

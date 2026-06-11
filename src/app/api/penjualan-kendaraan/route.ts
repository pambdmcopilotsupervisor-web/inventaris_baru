import { NextRequest, NextResponse } from "next/server"
import { prisma, serialize } from "@/lib/prisma"

export async function GET() {
  try {
    const list = await prisma.penjualan_r2r4s.findMany({
      orderBy: { tgl_jual: "desc" },
    })

    const kendaraans = await prisma.data_r2r4s.findMany({
      select: { id: true, kode_brg: true, plat: true, nm_brg: true, jns_brg: true },
    })
    const kMap = new Map(kendaraans.map(k => [Number(k.id), k]))

    const enriched = list.map(p => {
      const k = p.data_r2r4_id ? kMap.get(p.data_r2r4_id) : null
      return {
        ...p,
        plat:     k?.plat    ?? "—",
        nm_brg:   k?.nm_brg  ?? "—",
        kode_brg: k?.kode_brg ?? "—",
        jns_brg:  k?.jns_brg  ?? "—",
      }
    })

    return NextResponse.json(serialize(enriched))
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { data_r2r4_id, tgl_jual, hrg_jual, nm_pembeli } = body

    if (!data_r2r4_id) {
      return NextResponse.json({ error: "Pilih kendaraan" }, { status: 400 })
    }

    // Cek kendaraan ada dan belum terjual
    const kendaraan = await prisma.data_r2r4s.findUnique({ where: { id: BigInt(data_r2r4_id) } })
    if (!kendaraan) return NextResponse.json({ error: "Kendaraan tidak ditemukan" }, { status: 404 })
    if (kendaraan.stat === "Terjual") return NextResponse.json({ error: "Kendaraan ini sudah terjual" }, { status: 400 })

    // Buat record penjualan
    const penjualan = await prisma.penjualan_r2r4s.create({
      data: {
        data_r2r4_id: Number(data_r2r4_id),
        tgl_jual:     tgl_jual ? new Date(tgl_jual) : null,
        hrg_jual:     hrg_jual ? Number(hrg_jual) : null,
        nm_pembeli:   nm_pembeli ?? null,
      },
    })

    // UPDATE kendaraan stat → 'Terjual' (sesuai afterCreate Filament)
    await prisma.data_r2r4s.update({
      where: { id: BigInt(data_r2r4_id) },
      data: { stat: "Terjual" },
    })

    return NextResponse.json(serialize(penjualan), { status: 201 })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: "Gagal menyimpan" }, { status: 500 })
  }
}

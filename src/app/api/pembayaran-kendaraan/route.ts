import { NextRequest, NextResponse } from "next/server"
import { prisma, serialize } from "@/lib/prisma"

export async function GET(req: NextRequest) {
  try {
    const kendaraanId = new URL(req.url).searchParams.get("kendaraan_id")

    const list = await prisma.riwayat_pembayaran_r2r4s.findMany({
      where: kendaraanId ? { data_r2r4_id: BigInt(kendaraanId) } : {},
      include: { data_r2r4s: { select: { kode_brg: true, plat: true, nm_brg: true } } },
      orderBy: { tanggal_pembayaran: "desc" },
    })
    return NextResponse.json(serialize(list))
  } catch { return NextResponse.json({ error: "Server error" }, { status: 500 }) }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { data_r2r4_id, jenis_pembayaran, tanggal_pembayaran, biaya, jatuh_tempo_berikutnya, keterangan } = body
    if (!data_r2r4_id || !jenis_pembayaran || !tanggal_pembayaran) {
      return NextResponse.json({ error: "Field wajib tidak lengkap" }, { status: 400 })
    }
    const data = await prisma.riwayat_pembayaran_r2r4s.create({
      data: {
        data_r2r4_id: BigInt(data_r2r4_id),
        jenis_pembayaran: jenis_pembayaran as "Pajak" | "STNK" | "KIR",
        tanggal_pembayaran: new Date(tanggal_pembayaran),
        biaya: biaya ? BigInt(biaya) : BigInt(0),
        jatuh_tempo_berikutnya: jatuh_tempo_berikutnya ? new Date(jatuh_tempo_berikutnya) : null,
        keterangan: keterangan ?? null,
      },
    })
    return NextResponse.json(serialize(data), { status: 201 })
  } catch { return NextResponse.json({ error: "Gagal menyimpan" }, { status: 500 }) }
}

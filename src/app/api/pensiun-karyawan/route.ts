import { NextRequest, NextResponse } from "next/server"
import { prisma, serialize } from "@/lib/prisma"

export async function GET() {
  try {
    const list = await prisma.pensiun_karyawans.findMany({
      orderBy: { tgl_pensiun: "desc" },
    })

    const [karyawans, divisis, subdivisis] = await Promise.all([
      prisma.karyawans.findMany({ select: { id: true, nik: true, nama_karyawan: true } }),
      prisma.divisis.findMany({ select: { id: true, nama_divisi: true } }),
      prisma.subdivisis.findMany({ select: { id: true, nama_sub: true } }),
    ])

    const kMap = new Map(karyawans.map(k  => [Number(k.id), `${k.nik} — ${k.nama_karyawan}`]))
    const dMap = new Map(divisis.map(d    => [Number(d.id), d.nama_divisi]))
    const sMap = new Map(subdivisis.map(s => [Number(s.id), s.nama_sub]))

    const enriched = list.map(p => ({
      ...p,
      nama_karyawan:       kMap.get(Number(p.karyawan_id)) ?? "—",
      divisi_terakhir:     p.divisi_terakhir_id    ? dMap.get(Number(p.divisi_terakhir_id))    ?? "—" : "—",
      subdivisi_terakhir:  p.subdivisi_terakhir_id ? sMap.get(Number(p.subdivisi_terakhir_id)) ?? "—" : "—",
    }))

    return NextResponse.json(serialize(enriched))
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      karyawan_id, tgl_pensiun, jenis_pensiun, no_sk,
      jabatan_terakhir, divisi_terakhir_id, subdivisi_terakhir_id,
      pesangon, keterangan,
    } = body

    if (!karyawan_id || !tgl_pensiun || !jenis_pensiun) {
      return NextResponse.json({ error: "Field wajib tidak lengkap" }, { status: 400 })
    }

    // Ambil data karyawan saat ini
    const karyawan = await prisma.karyawans.findUnique({ where: { id: BigInt(karyawan_id) } })
    if (!karyawan) return NextResponse.json({ error: "Karyawan tidak ditemukan" }, { status: 404 })

    // Buat record pensiun
    const pensiun = await prisma.pensiun_karyawans.create({
      data: {
        karyawan_id:           BigInt(karyawan_id),
        tgl_pensiun:           new Date(tgl_pensiun),
        jenis_pensiun:         jenis_pensiun,
        no_sk:                 no_sk ?? null,
        jabatan_terakhir:      jabatan_terakhir ?? karyawan.jabatan,
        divisi_terakhir_id:    divisi_terakhir_id    ? BigInt(divisi_terakhir_id)    : null,
        subdivisi_terakhir_id: subdivisi_terakhir_id ? BigInt(subdivisi_terakhir_id) : null,
        pesangon:              pesangon ? Number(pesangon) : 0,
        keterangan:            keterangan ?? null,
      },
    })

    // UPDATE karyawan — set status menjadi Pensiun
    await prisma.karyawans.update({
      where: { id: BigInt(karyawan_id) },
      data: { status_karyawan: "Pensiun" },
    })

    return NextResponse.json(serialize(pensiun), { status: 201 })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: "Gagal menyimpan data pensiun" }, { status: 500 })
  }
}

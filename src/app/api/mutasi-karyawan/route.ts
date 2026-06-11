import { NextRequest, NextResponse } from "next/server"
import { prisma, serialize } from "@/lib/prisma"

export async function GET() {
  try {
    const mutasiList = await prisma.mutasi_karyawans.findMany({
      orderBy: { tgl_mutasi: "desc" },
    })

    const [karyawans, divisis, subdivisis] = await Promise.all([
      prisma.karyawans.findMany({ select: { id: true, nik: true, nama_karyawan: true } }),
      prisma.divisis.findMany({ select: { id: true, nama_divisi: true } }),
      prisma.subdivisis.findMany({ select: { id: true, nama_sub: true, divisi_id: true } }),
    ])

    const kMap  = new Map(karyawans.map(k  => [Number(k.id),  `${k.nik} — ${k.nama_karyawan}`]))
    const dMap  = new Map(divisis.map(d    => [Number(d.id),  d.nama_divisi]))
    const sMap  = new Map(subdivisis.map(s => [Number(s.id),  s.nama_sub]))

    const enriched = mutasiList.map(m => ({
      ...m,
      nama_karyawan:    kMap.get(Number(m.karyawan_id)) ?? "—",
      divisi_asal:      m.divisi_asal_id    ? dMap.get(Number(m.divisi_asal_id))    ?? "—" : "—",
      subdivisi_asal:   m.subdivisi_asal_id ? sMap.get(Number(m.subdivisi_asal_id)) ?? "—" : "—",
      divisi_tujuan:    m.divisi_tujuan_id  ? dMap.get(Number(m.divisi_tujuan_id))  ?? "—" : "—",
      subdivisi_tujuan: m.subdivisi_tujuan_id ? sMap.get(Number(m.subdivisi_tujuan_id)) ?? "—" : "—",
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
      karyawan_id, no_sk, tgl_mutasi,
      jabatan_asal, divisi_asal_id, subdivisi_asal_id,
      jabatan_tujuan, divisi_tujuan_id, subdivisi_tujuan_id,
      alasan,
    } = body

    if (!karyawan_id || !tgl_mutasi || !jabatan_tujuan || !divisi_tujuan_id || !subdivisi_tujuan_id) {
      return NextResponse.json({ error: "Field wajib tidak lengkap" }, { status: 400 })
    }

    // Ambil data karyawan saat ini untuk data ASAL
    const karyawan = await prisma.karyawans.findUnique({ where: { id: BigInt(karyawan_id) } })
    if (!karyawan) return NextResponse.json({ error: "Karyawan tidak ditemukan" }, { status: 404 })

    // Buat record mutasi
    const mutasi = await prisma.mutasi_karyawans.create({
      data: {
        karyawan_id:         BigInt(karyawan_id),
        tgl_mutasi:          new Date(tgl_mutasi),
        no_sk:               no_sk ?? null,
        jabatan_asal:        jabatan_asal ?? karyawan.jabatan,
        divisi_asal_id:      divisi_asal_id    ? BigInt(divisi_asal_id)    : null,
        subdivisi_asal_id:   subdivisi_asal_id ? BigInt(subdivisi_asal_id) : null,
        jabatan_tujuan:      jabatan_tujuan,
        divisi_tujuan_id:    divisi_tujuan_id  ? BigInt(divisi_tujuan_id)  : null,
        subdivisi_tujuan_id: subdivisi_tujuan_id ? BigInt(subdivisi_tujuan_id) : null,
        alasan:              alasan ?? null,
      },
    })

    // UPDATE karyawan — jabatan, subdivisi, dan set status kembali Aktif
    await prisma.karyawans.update({
      where: { id: BigInt(karyawan_id) },
      data: {
        jabatan:         jabatan_tujuan,
        subdivisi_id:    subdivisi_tujuan_id ? Number(subdivisi_tujuan_id) : karyawan.subdivisi_id,
        status_karyawan: "Aktif",
      },
    })

    return NextResponse.json(serialize(mutasi), { status: 201 })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: "Gagal menyimpan mutasi karyawan" }, { status: 500 })
  }
}

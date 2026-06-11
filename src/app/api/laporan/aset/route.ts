import { NextRequest, NextResponse } from "next/server"
import { prisma, serialize } from "@/lib/prisma"

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl
    const kelompok_asset = searchParams.get("kelompok_asset") || null
    const ruangan_id     = searchParams.get("ruangan_id")     ? Number(searchParams.get("ruangan_id")) : null
    const status_barang  = searchParams.get("status_barang")  || null

    const assets = await prisma.assets.findMany({
      where: {
        ...(kelompok_asset ? { kelompok_asset } : {}),
        ...(ruangan_id     ? { ruangan_id }     : {}),
        ...(status_barang  ? { status_barang }  : {}),
      },
      orderBy: { kode_asset: "asc" },
    })

    // Enrich dengan ruangan & karyawan
    const ruanganIds  = [...new Set(assets.map(a => a.ruangan_id).filter(Boolean))] as number[]
    const karyawanIds = [...new Set([
      ...assets.map(a => a.penanggung_jawab_id),
      ...assets.map(a => a.karyawan_id),
    ].filter(Boolean))] as number[]

    const [ruangans, karyawans] = await Promise.all([
      prisma.ruangans.findMany({ where: { id: { in: ruanganIds } } }),
      prisma.karyawans.findMany({ where: { id: { in: karyawanIds } }, select: { id: true, nama_karyawan: true } }),
    ])

    const rMap = new Map(ruangans.map(r => [Number(r.id), r]))
    const kMap = new Map(karyawans.map(k => [Number(k.id), k]))

    const enriched = assets.map((a, i) => ({
      ...a,
      no: i + 1,
      nama_ruangan: rMap.get(Number(a.ruangan_id))?.ruangan ?? null,
      lokasi:       rMap.get(Number(a.ruangan_id))?.lokasi  ?? null,
      nama_pj:      kMap.get(Number(a.penanggung_jawab_id))?.nama_karyawan ?? null,
      nama_pemakai: kMap.get(Number(a.karyawan_id))?.nama_karyawan ?? null,
    }))

    return NextResponse.json(serialize(enriched))
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}

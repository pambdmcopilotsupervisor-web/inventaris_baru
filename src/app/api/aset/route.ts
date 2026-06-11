import { NextRequest, NextResponse } from "next/server"
import { prisma, serialize } from "@/lib/prisma"

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const search   = searchParams.get("search") ?? ""
    const kelompok = searchParams.get("kelompok") ?? ""

    const assets = await prisma.assets.findMany({
      where: {
        AND: [
          search
            ? { OR: [{ kode_asset: { contains: search } }, { nama_asset: { contains: search } }] }
            : {},
          kelompok ? { kelompok_asset: kelompok } : {},
        ],
      },
      orderBy: { kode_asset: "asc" },
    })

    // Enrichment: join karyawans, ruangans, subdivisis, divisis
    const [karyawans, ruangans, subdivisis, divisis] = await Promise.all([
      prisma.karyawans.findMany({ select: { id: true, nama_karyawan: true, subdivisi_id: true } }),
      prisma.ruangans.findMany({ select: { id: true, ruangan: true, lokasi: true } }),
      prisma.subdivisis.findMany({ select: { id: true, nama_sub: true, divisi_id: true } }),
      prisma.divisis.findMany({ select: { id: true, nama_divisi: true } }),
    ])

    const kMap  = new Map(karyawans.map(k => [Number(k.id), k]))
    const rMap  = new Map(ruangans.map(r => [Number(r.id), r]))
    const sMap  = new Map(subdivisis.map(s => [Number(s.id), s]))
    const dMap  = new Map(divisis.map(d => [Number(d.id), d.nama_divisi]))

    const enriched = assets.map(a => {
      const ruangan       = a.ruangan_id         ? rMap.get(a.ruangan_id)                : null
      const pj            = kMap.get(a.penanggung_jawab_id)
      const pemakai       = kMap.get(a.karyawan_id)
      const pjSub         = pj?.subdivisi_id      ? sMap.get(pj.subdivisi_id)             : null
      const pjDivisi      = pjSub                 ? dMap.get(pjSub.divisi_id)             : null

      return {
        ...a,
        nama_ruangan:   ruangan?.ruangan   ?? null,
        lokasi:         ruangan?.lokasi    ?? null,
        nama_pj:        pj?.nama_karyawan  ?? null,
        divisi_pj:      pjDivisi           ?? null,
        nama_pemakai:   pemakai?.nama_karyawan ?? null,
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
    const data = await prisma.assets.create({ data: body })
    return NextResponse.json(serialize(data), { status: 201 })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: "Gagal menyimpan" }, { status: 500 })
  }
}

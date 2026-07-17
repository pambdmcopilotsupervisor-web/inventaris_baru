import { NextRequest, NextResponse } from "next/server"
import { requireSession } from "@/lib/auth"
import { prisma, serialize } from "@/lib/prisma"
import { canCreateOrEditTransaksi, getTransaksiActionError } from "@/lib/transaksi-role"

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const search = searchParams.get("search") ?? ""
    const jns    = searchParams.get("jns") ?? ""

    const kendaraans = await prisma.data_r2r4s.findMany({
      where: {
        AND: [
          search ? { OR: [{ plat: { contains: search } }, { nm_brg: { contains: search } }, { kode_brg: { contains: search } }] } : {},
          jns    ? { jns_brg: jns } : {},
        ],
      },
      orderBy: { kode_brg: "asc" },
    })

    // Ambil kontrak details untuk setiap kendaraan
    const kontrakDetails = await prisma.kontrak_details.findMany({
      where: { data_r2r4_id: { in: kendaraans.map(k => Number(k.id)) } },
    })

    // Ambil kontrak data
    const kontrakIds = [...new Set(kontrakDetails.map(d => d.kontrak_id).filter(Boolean))]
    const kontraks = kontrakIds.length > 0
      ? await prisma.kontraks.findMany({ where: { id: { in: kontrakIds.map(id => BigInt(id)) } } })
      : []

    const kontrakMap = new Map(kontraks.map(k => [Number(k.id), k]))

    // Group kontrak details by kendaraan id
    const kontrakByKendaraan = new Map<number, typeof kontraks>()
    for (const detail of kontrakDetails) {
      if (!detail.data_r2r4_id || !detail.kontrak_id) continue
      if (!kontrakByKendaraan.has(detail.data_r2r4_id)) {
        kontrakByKendaraan.set(detail.data_r2r4_id, [])
      }
      const k = kontrakMap.get(detail.kontrak_id)
      if (k) kontrakByKendaraan.get(detail.data_r2r4_id)!.push(k)
    }

    const today = new Date()

    const enriched = kendaraans.map(k => {
      const kontraksForKendaraan = kontrakByKendaraan.get(Number(k.id)) ?? []
      const kontrakInfo = kontraksForKendaraan.map(kt => {
        const tglAkhir = new Date(kt.tgl_akhir)
        const aktif    = today >= new Date(kt.tgl_awal) && today <= tglAkhir
        const masaSewa = Math.round(
          (new Date(kt.tgl_akhir).getTime() - new Date(kt.tgl_awal).getTime()) / (30 * 24 * 60 * 60 * 1000)
        )
        return {
          id:         Number(kt.id),
          no_kontrak: kt.no_kontrak,
          judul:      kt.judul,
          tgl_awal:   kt.tgl_awal,
          tgl_akhir:  kt.tgl_akhir,
          masa_sewa:  masaSewa,
          aktif,
        }
      })

      return {
        ...k,
        kontrak_info: kontrakInfo,
      }
    })

    return NextResponse.json(serialize(enriched))
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireSession(req)
  if ("error" in auth) return auth.error
  if (!canCreateOrEditTransaksi(auth.user.role)) {
    return NextResponse.json({ error: getTransaksiActionError("create") }, { status: 403 })
  }

  try {
    const body = await req.json()
    const data = await prisma.data_r2r4s.create({ data: body })
    return NextResponse.json(serialize(data), { status: 201 })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: "Gagal menyimpan" }, { status: 500 })
  }
}

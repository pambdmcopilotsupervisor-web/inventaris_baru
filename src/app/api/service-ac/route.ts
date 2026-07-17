import { NextRequest, NextResponse } from "next/server"
import { requireSession } from "@/lib/auth"
import { prisma, serialize } from "@/lib/prisma"
import { canCreateOrEditTransaksi, getTransaksiActionError } from "@/lib/transaksi-role"

export async function GET() {
  try {
    const list = await prisma.riwayat_service_acs.findMany({
      orderBy: { tanggal_service: "desc" },
    })

    const assets = await prisma.assets.findMany({
      select: { id: true, kode_asset: true, nama_asset: true, status_barang: true, ruangan_id: true, penanggung_jawab_id: true },
    })
    const ruangans  = await prisma.ruangans.findMany({ select: { id: true, ruangan: true } })
    const karyawans = await prisma.karyawans.findMany({ select: { id: true, nama_karyawan: true } })

    const aMap = new Map(assets.map(a => [Number(a.id), a]))
    const rMap = new Map(ruangans.map(r  => [Number(r.id), r.ruangan]))
    const kMap = new Map(karyawans.map(k => [Number(k.id), k.nama_karyawan]))

    const enriched = list.map(s => {
      const asset = aMap.get(Number(s.asset_id))
      return {
        ...s,
        kode_asset:   asset?.kode_asset   ?? "—",
        nama_asset:   asset?.nama_asset   ?? "—",
        kondisi_aset: asset?.status_barang ?? "—",
        nama_ruangan: asset?.ruangan_id          ? rMap.get(asset.ruangan_id)          ?? "—" : "—",
        nama_pj:      asset?.penanggung_jawab_id ? kMap.get(asset.penanggung_jawab_id) ?? "—" : "—",
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
    const { asset_id, tanggal_service, jenis_pekerjaan, biaya, teknisi, keterangan } = body

    if (!asset_id || !tanggal_service || !jenis_pekerjaan) {
      return NextResponse.json({ error: "Field wajib tidak lengkap" }, { status: 400 })
    }

    const data = await prisma.riwayat_service_acs.create({
      data: {
        asset_id:         BigInt(asset_id),
        tanggal_service:  new Date(tanggal_service),
        jenis_pekerjaan,
        biaya:            biaya ? Number(biaya) : 0,
        teknisi:          teknisi ?? null,
        keterangan:       keterangan ?? null,
      },
    })

    return NextResponse.json(serialize(data), { status: 201 })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: "Gagal menyimpan" }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from "next/server"
import { requireSession } from "@/lib/auth"
import { prisma, serialize } from "@/lib/prisma"
import { canCreateOrEditTransaksi, getTransaksiActionError } from "@/lib/transaksi-role"

export async function GET(req: NextRequest) {
  try {
    const assetId = req.nextUrl.searchParams.get("asset_id")
    const mutasiList = await prisma.mutasi_assets.findMany({
      where: assetId ? { asset_id: Number(assetId) } : undefined,
      orderBy: { tgl_mutasi: "desc" },
    })

    // Manual enrichment — join dengan karyawans dan ruangans
    const [karyawans, ruangans, assets] = await Promise.all([
      prisma.karyawans.findMany({ select: { id: true, nama_karyawan: true } }),
      prisma.ruangans.findMany({ select: { id: true, ruangan: true, lokasi: true } }),
      prisma.assets.findMany({ select: { id: true, kode_asset: true, nama_asset: true } }),
    ])

    // Konversi BigInt ke number untuk Map keys
    const kMap = new Map(karyawans.map(k => [Number(k.id), k.nama_karyawan]))
    const rMap = new Map(ruangans.map(r => [Number(r.id), `${r.ruangan} — ${r.lokasi}`]))
    const aMap = new Map(assets.map(a => [Number(a.id), `${a.kode_asset} — ${a.nama_asset}`]))

    const enriched = mutasiList.map(m => ({
      ...m,
      nama_asset:           aMap.get(m.asset_id) ?? "—",
      ruangan_asal:         rMap.get(m.ruangan_id_a) ?? "—",
      ruangan_tujuan:       rMap.get(m.ruangan_id_t) ?? "—",
      pj_asal:              kMap.get(m.penanggung_jawab_id_a) ?? "—",
      pj_tujuan:            kMap.get(m.penanggung_jawab_id_t) ?? "—",
      pemakai_asal:         kMap.get(m.karyawan_id_a) ?? "—",
      pemakai_tujuan:       kMap.get(m.karyawan_id_t) ?? "—",
    }))

    return NextResponse.json(serialize(enriched))
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: "Gagal mengambil data mutasi aset" }, { status: 500 })
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
    const { asset_id, ruangan_id_t, penanggung_jawab_id_t, karyawan_id_t, tgl_mutasi, deskripsi } = body

    if (!asset_id || !ruangan_id_t || !tgl_mutasi || !deskripsi) {
      return NextResponse.json({ error: "Field wajib tidak lengkap" }, { status: 400 })
    }

    // 1. Ambil data aset saat ini (data ASAL / sebelum mutasi)
    const asset = await prisma.assets.findUnique({ where: { id: BigInt(asset_id) } })
    if (!asset) {
      return NextResponse.json({ error: "Aset tidak ditemukan" }, { status: 404 })
    }

    // 2. Buat record mutasi — catat data ASAL dari asset saat ini
    const mutasi = await prisma.mutasi_assets.create({
      data: {
        asset_id:             Number(asset_id),
        // Data ASAL (otomatis diambil dari kondisi asset saat ini)
        ruangan_id_a:         Number(asset.ruangan_id ?? 0),
        penanggung_jawab_id_a: Number(asset.penanggung_jawab_id ?? 0),
        karyawan_id_a:        Number(asset.karyawan_id ?? 0),
        gambar_awal:          asset.gambar ?? null,
        // Data TUJUAN (input user)
        ruangan_id_t:         Number(ruangan_id_t),
        penanggung_jawab_id_t: Number(penanggung_jawab_id_t ?? 0),
        karyawan_id_t:        Number(karyawan_id_t ?? 0),
        gambar_terbaru:       null,
        tgl_mutasi:           new Date(tgl_mutasi),
        deskripsi:            String(deskripsi),
      },
    })

    // 3. UPDATE asset dengan data TUJUAN — inilah business logic utamanya
    await prisma.assets.update({
      where: { id: BigInt(asset_id) },
      data: {
        ruangan_id:          Number(ruangan_id_t),
        penanggung_jawab_id: Number(penanggung_jawab_id_t ?? asset.penanggung_jawab_id),
        karyawan_id:         Number(karyawan_id_t ?? asset.karyawan_id),
      },
    })

    return NextResponse.json(serialize(mutasi), { status: 201 })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: "Gagal menyimpan mutasi aset" }, { status: 500 })
  }
}

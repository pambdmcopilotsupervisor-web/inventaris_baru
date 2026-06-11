import { NextRequest, NextResponse } from "next/server"
import { prisma, serialize } from "@/lib/prisma"

const BULAN_ROMAWI: Record<number, string> = {
  1:'I', 2:'II', 3:'III', 4:'IV', 5:'V', 6:'VI',
  7:'VII', 8:'VIII', 9:'IX', 10:'X', 11:'XI', 12:'XII',
}

function formatNomor(nomor: string): string {
  if (!nomor) return nomor
  const now = new Date()
  const bulan = BULAN_ROMAWI[now.getMonth() + 1]
  const tahun = now.getFullYear()
  return `${nomor.toUpperCase()}.20/KK-PEDAMI/${bulan}/${tahun}`
}

export async function GET() {
  try {
    const list = await prisma.permohonan_disposal.findMany({
      orderBy: { tgl_pengajuan: "desc" },
    })

    const [karyawans, assets] = await Promise.all([
      prisma.karyawans.findMany({ select: { id: true, nama_karyawan: true, jabatan: true } }),
      prisma.assets.findMany({ select: { id: true, kode_asset: true, nama_asset: true } }),
    ])

    const kMap = new Map(karyawans.map(k => [Number(k.id), k]))
    const aMap = new Map(assets.map(a => [Number(a.id), `${a.kode_asset} — ${a.nama_asset}`]))

    const enriched = list.map(d => ({
      ...d,
      nama_asset:     d.asset_id ? aMap.get(d.asset_id) ?? "—" : "—",
      dibuat_oleh_nm: d.dibuat_oleh ? kMap.get(d.dibuat_oleh)?.nama_karyawan ?? "—" : "—",
      manager_nm:     d.manager_id ? kMap.get(d.manager_id)?.nama_karyawan ?? "—" : "—",
      ketua_nm:       d.ketua_id   ? kMap.get(d.ketua_id)?.nama_karyawan   ?? "—" : "—",
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
    const { nomor, asset_id, tgl_pengajuan, kondisi, keterangan, dibuat_oleh } = body

    if (!asset_id || !tgl_pengajuan || !kondisi || !keterangan) {
      return NextResponse.json({ error: "Field wajib tidak lengkap" }, { status: 400 })
    }

    // Auto-fill ketua_id dan manager_id dari jabatan
    const [ketua, manager] = await Promise.all([
      prisma.karyawans.findFirst({ where: { jabatan: "Ketua" } }),
      prisma.karyawans.findFirst({ where: { jabatan: "Manager" } }),
    ])

    // Format nomor surat
    const nomorFormatted = nomor ? formatNomor(String(nomor)) : null

    const disposal = await prisma.permohonan_disposal.create({
      data: {
        nomor:         nomorFormatted,
        asset_id:      Number(asset_id),
        tgl_pengajuan: new Date(tgl_pengajuan),
        kondisi:       kondisi,
        keterangan:    keterangan,
        // Status awal: belum diverifikasi
        verif_manager: 0,
        verif_ketua:   0,
        dibuat_oleh:   dibuat_oleh ? Number(dibuat_oleh) : null,
        manager_id:    manager ? Number(manager.id) : null,
        ketua_id:      ketua   ? Number(ketua.id)   : null,
      },
    })

    return NextResponse.json(serialize(disposal), { status: 201 })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: "Gagal menyimpan permohonan disposal" }, { status: 500 })
  }
}

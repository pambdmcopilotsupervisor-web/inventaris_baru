import { prisma, serialize } from "@/lib/prisma"

export interface AsetReportFilters {
  kelompok_asset?: string | null
  ruangan_id?: number | null
  status_barang?: string | null
}

export interface AsetReportRow {
  no: number
  kode_asset: string
  nama_asset: string
  kelompok_asset: string
  tgl_beli: string | Date | null
  hrg_beli: number | null
  nama_ruangan: string | null
  lokasi: string | null
  nama_pj: string | null
  nama_pemakai: string | null
  status_barang: string
}

export async function getAsetReportRows(filters: AsetReportFilters): Promise<AsetReportRow[]> {
  const assets = await prisma.assets.findMany({
    where: {
      ...(filters.kelompok_asset ? { kelompok_asset: filters.kelompok_asset } : {}),
      ...(filters.ruangan_id ? { ruangan_id: filters.ruangan_id } : {}),
      ...(filters.status_barang ? { status_barang: filters.status_barang } : {}),
    },
    orderBy: { kode_asset: "asc" },
  })

  const ruanganIds = [...new Set(assets.map((asset) => asset.ruangan_id).filter(Boolean))] as number[]
  const karyawanIds = [...new Set([
    ...assets.map((asset) => asset.penanggung_jawab_id),
    ...assets.map((asset) => asset.karyawan_id),
  ].filter(Boolean))] as number[]

  const [ruangans, karyawans] = await Promise.all([
    prisma.ruangans.findMany({ where: { id: { in: ruanganIds } } }),
    prisma.karyawans.findMany({
      where: { id: { in: karyawanIds } },
      select: { id: true, nama_karyawan: true },
    }),
  ])

  const ruanganMap = new Map(ruangans.map((ruangan) => [Number(ruangan.id), ruangan]))
  const karyawanMap = new Map(karyawans.map((karyawan) => [Number(karyawan.id), karyawan]))

  return serialize(assets.map((asset, index) => ({
    no: index + 1,
    kode_asset: asset.kode_asset,
    nama_asset: asset.nama_asset,
    kelompok_asset: asset.kelompok_asset,
    tgl_beli: asset.tgl_beli,
    hrg_beli: asset.hrg_beli === null ? null : Number(asset.hrg_beli),
    nama_ruangan: ruanganMap.get(Number(asset.ruangan_id))?.ruangan ?? null,
    lokasi: ruanganMap.get(Number(asset.ruangan_id))?.lokasi ?? null,
    nama_pj: karyawanMap.get(Number(asset.penanggung_jawab_id))?.nama_karyawan ?? null,
    nama_pemakai: karyawanMap.get(Number(asset.karyawan_id))?.nama_karyawan ?? null,
    status_barang: asset.status_barang,
  })))
}


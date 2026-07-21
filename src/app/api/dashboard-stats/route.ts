import { NextResponse } from "next/server"
import { prisma, serialize } from "@/lib/prisma"
import { ensureServiceDueColumns } from "@/lib/service-due"

const EXCLUDED_DIVISI = [
  "ketua koperasi konsumen pedami",
  "bendahara koperasi konsumen pedami",
  "sekretaris koperasi konsumen pedami",
  "all divisi",
]

export async function GET() {
  try {
    await ensureServiceDueColumns()

    const now = new Date()
    const today = new Date(now)
    today.setHours(0, 0, 0, 0)
    const threeMonthsAhead = new Date(today)
    threeMonthsAhead.setMonth(threeMonthsAhead.getMonth() + 3)
    const sixMonthsAhead = new Date(today)
    sixMonthsAhead.setMonth(sixMonthsAhead.getMonth() + 6)

    const [
      totalAset,
      asetKomputer,
      asetKantor,
      asetKondisi,
      r2Operasional,
      r2Dinas,
      r4Operasional,
      r4Dinas,
      totalKaryawan,
      karyawanAktif,
      karyawanPensiun,
      karyawanNonaktif,
      karyawanLaki,
      karyawanPerempuan,
      kontrakAktif,
      alertPajak,
      alertStnk,
      jadwalKir,
      jadwalService,
      jadwalServiceAset,
    ] = await Promise.all([
      prisma.assets.count(),
      prisma.assets.count({ where: { kelompok_asset: "komputer" } }),
      prisma.assets.count({ where: { kelompok_asset: "kantor" } }),
      prisma.assets.groupBy({ by: ["status_barang"], _count: { id: true } }),
      prisma.data_r2r4s.count({ where: { jns_brg: "R2 Operasional" } }),
      prisma.data_r2r4s.count({ where: { jns_brg: "R2 Dinas" } }),
      prisma.data_r2r4s.count({ where: { jns_brg: "R4 Operasional" } }),
      prisma.data_r2r4s.count({ where: { jns_brg: "R4 Dinas" } }),
      prisma.karyawans.count(),
      prisma.karyawans.count({ where: { status_karyawan: "Aktif" } }),
      prisma.karyawans.count({ where: { status_karyawan: "Pensiun" } }),
      prisma.karyawans.count({ where: { status_karyawan: "Nonaktif" } }),
      prisma.karyawans.count({ where: { status_karyawan: "Aktif", jkel: "Laki-Laki" } }),
      prisma.karyawans.count({ where: { status_karyawan: "Aktif", jkel: "Perempuan" } }),
      prisma.kontraks.findMany({
        where: { tgl_akhir: { gte: new Date() } },
        orderBy: { tgl_akhir: "asc" },
        take: 5,
      }),
      // Alert Pajak kendaraan
      prisma.data_r2r4s.findMany({
        where: {
          pajak: {
            gte: new Date(),
            lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          },
          stat: { not: "Jual" },
        },
        select: { id: true, plat: true, nm_brg: true, pajak: true },
        orderBy: { pajak: "asc" },
        take: 5,
      }),
      // Alert STNK akan berakhir (dalam 3 bulan ke depan) — sesuai StnkWidget pedami
      prisma.data_r2r4s.findMany({
        where: {
          stnk: {
            gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), // sudah lewat 3 bulan
          },
        },
        select: { id: true, plat: true, nm_brg: true, stnk: true, jns_brg: true },
        orderBy: { stnk: "asc" },
        take: 8,
      }),
      prisma.data_r2r4s.findMany({
        where: {
          tgl_akhir_kir: {
            gte: today,
            lte: threeMonthsAhead,
          },
          stat: { not: "Jual" },
        },
        select: { id: true, plat: true, nm_brg: true, jns_brg: true, tgl_akhir_kir: true },
        orderBy: { tgl_akhir_kir: "asc" },
        take: 8,
      }),
      prisma.data_r2r4s.findMany({
        where: {
          service: {
            gte: today,
            lte: sixMonthsAhead,
          },
          stat: { not: "Jual" },
        },
        select: { id: true, plat: true, nm_brg: true, jns_brg: true, service: true },
        orderBy: { service: "asc" },
        take: 8,
      }),
      prisma.riwayat_service_acs.findMany({
        where: {
          jatuh_tempo_berikutnya: {
            gte: today,
            lte: sixMonthsAhead,
          },
        },
        select: {
          id: true,
          asset_id: true,
          tanggal_service: true,
          jatuh_tempo_berikutnya: true,
          jenis_pekerjaan: true,
          teknisi: true,
        },
        orderBy: { jatuh_tempo_berikutnya: "asc" },
        take: 8,
      }),
    ])

    const serviceAssetIds = [...new Set(jadwalServiceAset.map((item) => item.asset_id))]
    const serviceAssets = serviceAssetIds.length > 0
      ? await prisma.assets.findMany({
          where: { id: { in: serviceAssetIds } },
          select: { id: true, kode_asset: true, nama_asset: true, status_barang: true, ruangan_id: true },
        })
      : []
    const serviceRuanganIds = [...new Set(serviceAssets.map((asset) => asset.ruangan_id).filter(Boolean))] as number[]
    const serviceRuangans = serviceRuanganIds.length > 0
      ? await prisma.ruangans.findMany({
          where: { id: { in: serviceRuanganIds } },
          select: { id: true, ruangan: true, lokasi: true },
        })
      : []
    const serviceAssetMap = new Map(serviceAssets.map((asset) => [Number(asset.id), asset]))
    const serviceRuanganMap = new Map(serviceRuangans.map((ruangan) => [Number(ruangan.id), ruangan]))

    // Gender per Divisi — sesuai KaryawanGenderPerDivisiChart
    const genderPerDivisi = await prisma.$queryRaw<
      { divisi: string; laki_laki: bigint; perempuan: bigint; campuran: bigint }[]
    >`
      SELECT
        COALESCE(d.nama_divisi, 'Tanpa Divisi') AS divisi,
        SUM(CASE WHEN k.jkel = 'Laki-Laki' AND k.status_karyawan = 'Aktif' THEN 1 ELSE 0 END) AS laki_laki,
        SUM(CASE WHEN k.jkel = 'Perempuan' AND k.status_karyawan = 'Aktif'
          AND LOWER(COALESCE(d.nama_divisi, '')) NOT IN (${EXCLUDED_DIVISI[0]},${EXCLUDED_DIVISI[1]},${EXCLUDED_DIVISI[2]},${EXCLUDED_DIVISI[3]})
          THEN 1 ELSE 0 END) AS perempuan,
        SUM(CASE WHEN k.jkel = 'L/P' AND k.status_karyawan = 'Aktif'
          AND LOWER(COALESCE(d.nama_divisi, '')) NOT IN (${EXCLUDED_DIVISI[0]},${EXCLUDED_DIVISI[1]},${EXCLUDED_DIVISI[2]},${EXCLUDED_DIVISI[3]})
          THEN 1 ELSE 0 END) AS campuran
      FROM karyawans k
      LEFT JOIN subdivisis s ON k.subdivisi_id = s.id
      LEFT JOIN divisis d ON s.divisi_id = d.id
      GROUP BY divisi
      ORDER BY divisi
    `

    return NextResponse.json(
      serialize({
        aset: {
          total: totalAset,
          komputer: asetKomputer,
          kantor: asetKantor,
          kondisi: asetKondisi,
        },
        kendaraan: { r2Operasional, r2Dinas, r4Operasional, r4Dinas },
        karyawan: {
          total: totalKaryawan,
          aktif: karyawanAktif,
          pensiun: karyawanPensiun,
          nonaktif: karyawanNonaktif,
          lakiLaki: karyawanLaki,
          perempuan: karyawanPerempuan,
        },
        kontrakAktif,
        alertPajak,
        alertStnk,
        jadwalKir,
        jadwalService,
        jadwalServiceAset: jadwalServiceAset.map((item) => ({
          id: item.id,
          asset_id: Number(item.asset_id),
          kode_asset: serviceAssetMap.get(Number(item.asset_id))?.kode_asset ?? "—",
          nama_asset: serviceAssetMap.get(Number(item.asset_id))?.nama_asset ?? "—",
          status_barang: serviceAssetMap.get(Number(item.asset_id))?.status_barang ?? "—",
          ruangan: serviceRuanganMap.get(Number(serviceAssetMap.get(Number(item.asset_id))?.ruangan_id))?.ruangan ?? null,
          lokasi: serviceRuanganMap.get(Number(serviceAssetMap.get(Number(item.asset_id))?.ruangan_id))?.lokasi ?? null,
          tanggal_service: item.tanggal_service,
          jatuh_tempo_berikutnya: item.jatuh_tempo_berikutnya,
          jenis_pekerjaan: item.jenis_pekerjaan,
          teknisi: item.teknisi,
        })),
        genderPerDivisi: genderPerDivisi.map(r => ({
          divisi: r.divisi,
          laki_laki: Number(r.laki_laki),
          perempuan: Number(r.perempuan),
          campuran: Number(r.campuran),
        })),
      })
    )
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: "Gagal mengambil statistik" }, { status: 500 })
  }
}

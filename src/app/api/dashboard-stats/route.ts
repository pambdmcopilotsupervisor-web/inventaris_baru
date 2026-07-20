import { NextResponse } from "next/server"
import { prisma, serialize } from "@/lib/prisma"

const EXCLUDED_DIVISI = [
  "ketua koperasi konsumen pedami",
  "bendahara koperasi konsumen pedami",
  "sekretaris koperasi konsumen pedami",
  "all divisi",
]

export async function GET() {
  try {
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
    ])

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

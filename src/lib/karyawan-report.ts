import { prisma, serialize } from "@/lib/prisma"

export interface KaryawanReportRow {
  no: number
  nik: string
  nama_karyawan: string
  jabatan: string
  nama_divisi: string | null
  nama_subdivisi: string | null
  jkel: string
  status_karyawan: string | null
  tanggal_lahir: Date | string | null
  tanggal_masuk_kerja: Date | string | null
  tanggal_keluar: Date | string | null
  tempat_lahir: string | null
  agama: string | null
  pendidikan_terakhir: string | null
  no_hp: string | null
  no_ktp: string | null
  no_rekening: string | null
  nama_bank: string | null
  no_bpjs_ketenagakerjaan: string | null
  no_bpjs_kesehatan: string | null
  kontak_darurat: string | null
  alamat: string | null
}

export async function getKaryawanReportRows(): Promise<KaryawanReportRow[]> {
  const [karyawans, divisis, subdivisis] = await Promise.all([
    prisma.karyawans.findMany({ orderBy: { nama_karyawan: "asc" } }),
    prisma.divisis.findMany({ select: { id: true, nama_divisi: true } }),
    prisma.subdivisis.findMany({ select: { id: true, divisi_id: true, nama_sub: true } }),
  ])

  const divisiMap = new Map(divisis.map((divisi) => [Number(divisi.id), divisi.nama_divisi]))
  const subdivisiMap = new Map(subdivisis.map((subdivisi) => [Number(subdivisi.id), subdivisi]))

  return serialize(
    karyawans.map((karyawan, index) => {
      const subdivisi = karyawan.subdivisi_id ? subdivisiMap.get(Number(karyawan.subdivisi_id)) : null
      const divisiId = subdivisi?.divisi_id ?? karyawan.divisi_id ?? null

      return {
        no: index + 1,
        nik: karyawan.nik,
        nama_karyawan: karyawan.nama_karyawan,
        jabatan: karyawan.jabatan,
        nama_divisi: divisiId ? divisiMap.get(Number(divisiId)) ?? null : null,
        nama_subdivisi: subdivisi?.nama_sub ?? null,
        jkel: karyawan.jkel,
        status_karyawan: karyawan.status_karyawan,
        tanggal_lahir: karyawan.tanggal_lahir,
        tanggal_masuk_kerja: karyawan.tanggal_masuk_kerja,
        tanggal_keluar: karyawan.tanggal_keluar,
        tempat_lahir: karyawan.tempat_lahir,
        agama: karyawan.agama,
        pendidikan_terakhir: karyawan.pendidikan_terakhir,
        no_hp: karyawan.no_hp,
        no_ktp: karyawan.no_ktp,
        no_rekening: karyawan.no_rekening,
        nama_bank: karyawan.nama_bank,
        no_bpjs_ketenagakerjaan: karyawan.no_bpjs_ketenagakerjaan,
        no_bpjs_kesehatan: karyawan.no_bpjs_kesehatan,
        kontak_darurat: karyawan.kontak_darurat,
        alamat: karyawan.alamat,
      }
    })
  )
}

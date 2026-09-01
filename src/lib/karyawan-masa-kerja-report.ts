import { prisma, serialize } from "@/lib/prisma"

export interface KaryawanMasaKerjaReportFilters {
  karyawanId?: number
  divisiId?: number
}

export interface KaryawanMasaKerjaReportRow {
  no: number
  karyawan_id: number
  divisi_id: number | null
  nik: string
  nama_karyawan: string
  status_karyawan: string | null
  jabatan: string | null
  divisi: string | null
  subdivisi: string | null
  tanggal_mulai: Date | string | null
  tanggal_sampai: Date | string | null
  sampai_label: string
  masa_kerja: string
  aktif: boolean
}

type KaryawanRow = Awaited<ReturnType<typeof prisma.karyawans.findMany>>[number]
type MutasiRow = Awaited<ReturnType<typeof prisma.mutasi_karyawans.findMany>>[number]

function parseDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  date.setHours(0, 0, 0, 0)
  return date
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function formatDurasiKerja(mulai: Date | null, sampai: Date | null): string {
  if (!mulai || !sampai || sampai.getTime() < mulai.getTime()) return "-"
  const diff = sampai.getTime() - mulai.getTime()
  const y = Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000))
  const rem = diff - y * 365.25 * 24 * 60 * 60 * 1000
  const m = Math.floor(rem / (30.44 * 24 * 60 * 60 * 1000))
  const d = Math.floor((rem - m * 30.44 * 24 * 60 * 60 * 1000) / (24 * 60 * 60 * 1000))
  return `${y} tahun ${m} bulan ${d} hari`
}

function getCurrentPlacement(
  karyawan: KaryawanRow,
  divisiMap: Map<string, string>,
  subdivisiMap: Map<string, { nama_sub: string; divisi_id: number }>
) {
  const subdivisi = karyawan.subdivisi_id ? subdivisiMap.get(String(karyawan.subdivisi_id)) : null
  const divisiId = subdivisi?.divisi_id ?? karyawan.divisi_id ?? null

  return {
    divisiId,
    divisi: divisiId ? divisiMap.get(String(divisiId)) ?? null : null,
    subdivisi: subdivisi?.nama_sub ?? null,
  }
}

function getMutasiPlacement(
  divisiId: bigint | null,
  subdivisiId: bigint | null,
  divisiMap: Map<string, string>,
  subdivisiMap: Map<string, { nama_sub: string; divisi_id: number }>
) {
  const subdivisi = subdivisiId ? subdivisiMap.get(subdivisiId.toString()) : null
  const resolvedDivisiId = divisiId ? Number(divisiId) : subdivisi?.divisi_id ?? null

  return {
    divisiId: resolvedDivisiId,
    divisi: resolvedDivisiId ? divisiMap.get(String(resolvedDivisiId)) ?? null : null,
    subdivisi: subdivisi?.nama_sub ?? null,
  }
}

function buildRowsForKaryawan(
  karyawan: KaryawanRow,
  mutasis: MutasiRow[],
  divisiMap: Map<string, string>,
  subdivisiMap: Map<string, { nama_sub: string; divisi_id: number }>
): Omit<KaryawanMasaKerjaReportRow, "no">[] {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const tanggalMasuk = parseDate(karyawan.tanggal_masuk_kerja)
  const tanggalKeluar = parseDate(karyawan.tanggal_keluar)
  const selesaiAktif = tanggalKeluar ?? today
  const current = getCurrentPlacement(karyawan, divisiMap, subdivisiMap)
  const sortedMutasis = [...mutasis].sort((a, b) => {
    const dateA = parseDate(a.tgl_mutasi)?.getTime() ?? 0
    const dateB = parseDate(b.tgl_mutasi)?.getTime() ?? 0
    return dateA - dateB
  })

  const base = {
    karyawan_id: Number(karyawan.id),
    nik: karyawan.nik,
    nama_karyawan: karyawan.nama_karyawan,
    status_karyawan: karyawan.status_karyawan,
  }

  if (sortedMutasis.length === 0) {
    return [{
      ...base,
      divisi_id: current.divisiId,
      jabatan: karyawan.jabatan,
      divisi: current.divisi,
      subdivisi: current.subdivisi,
      tanggal_mulai: tanggalMasuk,
      tanggal_sampai: tanggalKeluar,
      sampai_label: tanggalKeluar ? "" : "Sekarang",
      masa_kerja: formatDurasiKerja(tanggalMasuk, selesaiAktif),
      aktif: !tanggalKeluar,
    }]
  }

  const rows: Omit<KaryawanMasaKerjaReportRow, "no">[] = []
  const firstMutation = sortedMutasis[0]
  const firstMutationDate = parseDate(firstMutation?.tgl_mutasi)
  const firstPlacement = firstMutation
    ? getMutasiPlacement(firstMutation.divisi_asal_id, firstMutation.subdivisi_asal_id, divisiMap, subdivisiMap)
    : { divisiId: null, divisi: null, subdivisi: null }

  rows.push({
    ...base,
    divisi_id: firstPlacement.divisiId,
    jabatan: firstMutation?.jabatan_asal ?? null,
    divisi: firstPlacement.divisi,
    subdivisi: firstPlacement.subdivisi,
    tanggal_mulai: tanggalMasuk,
    tanggal_sampai: firstMutationDate ? addDays(firstMutationDate, -1) : null,
    sampai_label: "",
    masa_kerja: formatDurasiKerja(tanggalMasuk, firstMutationDate),
    aktif: false,
  })

  sortedMutasis.forEach((mutasi, index) => {
    const mulai = parseDate(mutasi.tgl_mutasi)
    const nextMulai = parseDate(sortedMutasis[index + 1]?.tgl_mutasi)
    const isLast = index === sortedMutasis.length - 1
    const sampai = nextMulai ? addDays(nextMulai, -1) : tanggalKeluar
    const durasiSampai = nextMulai ?? selesaiAktif
    const mutasiPlacement = getMutasiPlacement(mutasi.divisi_tujuan_id, mutasi.subdivisi_tujuan_id, divisiMap, subdivisiMap)
    const placement = isLast && !mutasiPlacement.divisiId ? current : mutasiPlacement

    rows.push({
      ...base,
      divisi_id: placement.divisiId,
      jabatan: isLast ? mutasi.jabatan_tujuan ?? karyawan.jabatan : mutasi.jabatan_tujuan,
      divisi: placement.divisi,
      subdivisi: placement.subdivisi,
      tanggal_mulai: mulai,
      tanggal_sampai: sampai,
      sampai_label: !nextMulai && !tanggalKeluar ? "Sekarang" : "",
      masa_kerja: formatDurasiKerja(mulai, durasiSampai),
      aktif: isLast && !tanggalKeluar,
    })
  })

  return rows
}

export async function getKaryawanMasaKerjaReportRows(
  filters: KaryawanMasaKerjaReportFilters = {}
): Promise<KaryawanMasaKerjaReportRow[]> {
  const [karyawans, mutasis, divisis, subdivisis] = await Promise.all([
    prisma.karyawans.findMany({ orderBy: { nama_karyawan: "asc" } }),
    prisma.mutasi_karyawans.findMany({ orderBy: { tgl_mutasi: "asc" } }),
    prisma.divisis.findMany({ select: { id: true, nama_divisi: true } }),
    prisma.subdivisis.findMany({ select: { id: true, nama_sub: true, divisi_id: true } }),
  ])

  const divisiMap = new Map(divisis.map((divisi) => [divisi.id.toString(), divisi.nama_divisi]))
  const subdivisiMap = new Map(subdivisis.map((subdivisi) => [
    subdivisi.id.toString(),
    { nama_sub: subdivisi.nama_sub, divisi_id: subdivisi.divisi_id },
  ]))
  const mutasiByKaryawan = new Map<string, MutasiRow[]>()

  mutasis.forEach((mutasi) => {
    const key = mutasi.karyawan_id.toString()
    const rows = mutasiByKaryawan.get(key) ?? []
    rows.push(mutasi)
    mutasiByKaryawan.set(key, rows)
  })

  const filteredKaryawans = filters.karyawanId
    ? karyawans.filter((karyawan) => Number(karyawan.id) === filters.karyawanId)
    : karyawans

  const rows = filteredKaryawans
    .flatMap((karyawan) => buildRowsForKaryawan(
      karyawan,
      mutasiByKaryawan.get(karyawan.id.toString()) ?? [],
      divisiMap,
      subdivisiMap
    ))
    .filter((row) => filters.divisiId ? row.divisi_id === filters.divisiId : true)
    .sort((a, b) => {
      const divisi = (a.divisi ?? "Tanpa Divisi").localeCompare(b.divisi ?? "Tanpa Divisi")
      if (divisi !== 0) return divisi
      const nama = a.nama_karyawan.localeCompare(b.nama_karyawan)
      if (nama !== 0) return nama
      return (parseDate(a.tanggal_mulai)?.getTime() ?? 0) - (parseDate(b.tanggal_mulai)?.getTime() ?? 0)
    })
    .map((row, index) => ({ no: index + 1, ...row }))

  return serialize(rows)
}

import { prisma } from "@/lib/prisma"

type PeriodePenilaianRow = {
  id: bigint
  tanggal_mulai: Date
  tanggal_selesai: Date
  status: "draft" | "aktif" | "tutup"
}

export type HasilNilaiKehadiran = {
  id_pegawai: number
  id_periode: number
  tanggal_mulai: string
  tanggal_selesai: string
  total_hari_kerja: number
  jumlah_hadir: number
  jumlah_izin: number
  jumlah_sakit: number
  jumlah_cuti_sah: number
  jumlah_alpha: number
  jumlah_terlambat: number
  persentase_hadir: number
  pengurangan_alpha: number
  pengurangan_terlambat: number
  nilai_kehadiran: number
}

export type HasilHitungMassalKehadiran = {
  id_periode: number
  total_pegawai: number
  berhasil: number
  gagal: number
  hasil: HasilNilaiKehadiran[]
  errors: { id_pegawai: number; error: string }[]
}

const STATUS_SAH = new Set(["hadir", "terlambat", "pulang_cepat", "tidak_absen_pulang", "di_luar_jam_absen"])
const STATUS_IZIN = "izin"
const STATUS_SAKIT = "sakit"
const STATUS_CUTI = "cuti"
const STATUS_ALPHA = "alpha"
const STATUS_LIBUR = "libur"
const BATAS_TERLAMBAT_MENIT = 8 * 60 + 15

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function dateFromIso(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`)
}

function addDaysIso(iso: string, days: number): string {
  const date = new Date(`${iso}T12:00:00`)
  date.setDate(date.getDate() + days)
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-")
}

function maxIsoDate(a: string, b: string): string {
  return a >= b ? a : b
}

function minIsoDate(a: string, b: string): string {
  return a <= b ? a : b
}

function isSunday(iso: string): boolean {
  return new Date(`${iso}T12:00:00`).getDay() === 0
}

function parseTimeMenit(time?: string | null): number | null {
  if (!time) return null
  const [hour, minute] = time.split(":").map(Number)
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null
  return hour * 60 + minute
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

async function getPeriodePenilaian(idPeriode: number | bigint): Promise<PeriodePenilaianRow> {
  const rows = await prisma.$queryRaw<PeriodePenilaianRow[]>`
    SELECT id, tanggal_mulai, tanggal_selesai, status
    FROM periode_penilaian
    WHERE id = ${BigInt(idPeriode)}
    LIMIT 1
  `
  const periode = rows[0]
  if (!periode) throw new Error("Periode penilaian tidak ditemukan")
  return periode
}

async function getHariLiburSet(startIso: string, endIso: string): Promise<Set<string>> {
  const rows = await prisma.hari_liburs.findMany({
    where: { tanggal: { gte: dateFromIso(startIso), lte: dateFromIso(endIso) } },
    select: { tanggal: true },
  })
  return new Set(rows.map(row => toIsoDate(row.tanggal)))
}

async function getTanggalKerjaPegawai(karyawanId: bigint, startIso: string, endIso: string, hariLiburSet: Set<string>): Promise<string[]> {
  const jadwals = await prisma.jadwal_shifts.findMany({
    where: {
      karyawan_id: karyawanId,
      tanggal: { gte: dateFromIso(startIso), lte: dateFromIso(endIso) },
    },
    select: { tanggal: true },
    orderBy: { tanggal: "asc" },
  })

  if (jadwals.length > 0) {
    return Array.from(new Set(jadwals.map(row => toIsoDate(row.tanggal))))
      .filter(date => !hariLiburSet.has(date))
      .sort()
  }

  const dates: string[] = []
  for (let current = startIso; current <= endIso; current = addDaysIso(current, 1)) {
    if (!isSunday(current) && !hariLiburSet.has(current)) dates.push(current)
  }
  return dates
}

async function simpanNilaiKehadiran(idPegawai: bigint, idPeriode: bigint, nilaiKehadiran: number): Promise<void> {
  await prisma.$executeRaw`
    INSERT INTO penilaian_kinerja
      (id_periode, id_pegawai, status, nilai_kehadiran, created_at, updated_at)
    VALUES
      (${idPeriode}, ${idPegawai}, 'draft', ${nilaiKehadiran}, NOW(), NOW())
    ON DUPLICATE KEY UPDATE
      nilai_kehadiran = VALUES(nilai_kehadiran),
      updated_at = NOW()
  `
}

export async function hitungNilaiKehadiran(
  p_id_pegawai: number | bigint,
  p_id_periode: number | bigint,
  options: { asOfDate?: Date; save?: boolean } = {},
): Promise<HasilNilaiKehadiran> {
  const idPegawai = BigInt(p_id_pegawai)
  const idPeriode = BigInt(p_id_periode)
  const save = options.save ?? true

  const [periode, karyawan] = await Promise.all([
    getPeriodePenilaian(idPeriode),
    prisma.karyawans.findUnique({
      where: { id: idPegawai },
      select: { id: true, tanggal_masuk_kerja: true },
    }),
  ])

  if (!karyawan) throw new Error("Pegawai tidak ditemukan")

  const periodeStartIso = toIsoDate(periode.tanggal_mulai)
  const periodeEndIso = toIsoDate(periode.tanggal_selesai)
  const asOfIso = toIsoDate(options.asOfDate ?? new Date())
  const tanggalMasukIso = karyawan.tanggal_masuk_kerja ? toIsoDate(karyawan.tanggal_masuk_kerja) : periodeStartIso
  const startIso = maxIsoDate(periodeStartIso, tanggalMasukIso)
  const endIso = minIsoDate(periodeEndIso, asOfIso)

  if (startIso > endIso) {
    const emptyResult: HasilNilaiKehadiran = {
      id_pegawai: Number(idPegawai),
      id_periode: Number(idPeriode),
      tanggal_mulai: startIso,
      tanggal_selesai: endIso,
      total_hari_kerja: 0,
      jumlah_hadir: 0,
      jumlah_izin: 0,
      jumlah_sakit: 0,
      jumlah_cuti_sah: 0,
      jumlah_alpha: 0,
      jumlah_terlambat: 0,
      persentase_hadir: 100,
      pengurangan_alpha: 0,
      pengurangan_terlambat: 0,
      nilai_kehadiran: 100,
    }
    if (save) await simpanNilaiKehadiran(idPegawai, idPeriode, emptyResult.nilai_kehadiran)
    return emptyResult
  }

  const hariLiburSet = await getHariLiburSet(startIso, endIso)
  const tanggalKerja = await getTanggalKerjaPegawai(idPegawai, startIso, endIso, hariLiburSet)
  const absensiRows = await prisma.absensi.findMany({
    where: {
      karyawan_id: idPegawai,
      tanggal_absensi: { gte: dateFromIso(startIso), lte: dateFromIso(endIso) },
    },
    select: { tanggal_absensi: true, status_absensi: true, jam_masuk: true },
  })
  const absensiByDate = new Map(absensiRows.map(row => [toIsoDate(row.tanggal_absensi), row]))

  let totalHariKerja = 0
  let jumlahHadir = 0
  let jumlahIzin = 0
  let jumlahSakit = 0
  let jumlahCutiSah = 0
  let jumlahAlpha = 0
  let jumlahTerlambat = 0

  for (const tanggal of tanggalKerja) {
    const absensi = absensiByDate.get(tanggal)
    const status = absensi?.status_absensi?.toLowerCase() ?? STATUS_ALPHA
    if (status === STATUS_LIBUR) continue

    totalHariKerja++

    if (!absensi) {
      jumlahAlpha++
      continue
    }

    if (status === STATUS_IZIN) jumlahIzin++
    else if (status === STATUS_SAKIT) jumlahSakit++
    else if (status === STATUS_CUTI) jumlahCutiSah++
    else if (status === STATUS_ALPHA) jumlahAlpha++
    else if (STATUS_SAH.has(status)) jumlahHadir++

    const jamMasukMenit = parseTimeMenit(absensi.jam_masuk)
    if (jamMasukMenit !== null && ![STATUS_IZIN, STATUS_SAKIT, STATUS_CUTI, STATUS_ALPHA, STATUS_LIBUR].includes(status)) {
      if (jamMasukMenit > BATAS_TERLAMBAT_MENIT) jumlahTerlambat++
    }
  }

  const jumlahHariSah = jumlahHadir + jumlahIzin + jumlahSakit + jumlahCutiSah
  const persentaseHadir = totalHariKerja > 0 ? (jumlahHariSah / totalHariKerja) * 100 : 100
  const penguranganAlpha = jumlahAlpha * 2
  const penguranganTerlambat = Math.floor(jumlahTerlambat / 5)
  const nilaiKehadiran = round2(clamp(persentaseHadir - penguranganAlpha - penguranganTerlambat, 0, 100))

  const result: HasilNilaiKehadiran = {
    id_pegawai: Number(idPegawai),
    id_periode: Number(idPeriode),
    tanggal_mulai: startIso,
    tanggal_selesai: endIso,
    total_hari_kerja: totalHariKerja,
    jumlah_hadir: jumlahHadir,
    jumlah_izin: jumlahIzin,
    jumlah_sakit: jumlahSakit,
    jumlah_cuti_sah: jumlahCutiSah,
    jumlah_alpha: jumlahAlpha,
    jumlah_terlambat: jumlahTerlambat,
    persentase_hadir: round2(persentaseHadir),
    pengurangan_alpha: penguranganAlpha,
    pengurangan_terlambat: penguranganTerlambat,
    nilai_kehadiran: nilaiKehadiran,
  }

  if (save) await simpanNilaiKehadiran(idPegawai, idPeriode, nilaiKehadiran)
  return result
}

export async function hitungNilaiKehadiranSemuaPegawaiAktif(
  p_id_periode: number | bigint,
  options: { asOfDate?: Date; save?: boolean } = {},
): Promise<HasilHitungMassalKehadiran> {
  const periode = await getPeriodePenilaian(p_id_periode)
  const periodeEnd = periode.tanggal_selesai
  const pegawais = await prisma.karyawans.findMany({
    where: {
      OR: [
        { status_karyawan: null },
        { status_karyawan: { notIn: ["Pensiun", "Nonaktif"] } },
      ],
      AND: [
        {
          OR: [
            { tanggal_masuk_kerja: null },
            { tanggal_masuk_kerja: { lte: periodeEnd } },
          ],
        },
      ],
    },
    select: { id: true },
    orderBy: { id: "asc" },
  })

  const hasil: HasilNilaiKehadiran[] = []
  const errors: { id_pegawai: number; error: string }[] = []

  for (const pegawai of pegawais) {
    try {
      hasil.push(await hitungNilaiKehadiran(pegawai.id, p_id_periode, options))
    } catch (error) {
      errors.push({ id_pegawai: Number(pegawai.id), error: error instanceof Error ? error.message : "Gagal hitung nilai kehadiran" })
    }
  }

  return {
    id_periode: Number(p_id_periode),
    total_pegawai: pegawais.length,
    berhasil: hasil.length,
    gagal: errors.length,
    hasil,
    errors,
  }
}

export async function bukaPeriodePenilaianDanHitungKehadiranAwal(p_id_periode: number | bigint): Promise<HasilHitungMassalKehadiran> {
  const idPeriode = BigInt(p_id_periode)
  await getPeriodePenilaian(idPeriode)

  await prisma.$executeRaw`
    UPDATE periode_penilaian
    SET status = 'aktif', updated_at = NOW()
    WHERE id = ${idPeriode}
  `

  return hitungNilaiKehadiranSemuaPegawaiAktif(idPeriode, { asOfDate: new Date(), save: true })
}

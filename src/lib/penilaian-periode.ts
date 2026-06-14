import { prisma } from "@/lib/prisma"

type PeriodeGuardRow = {
  id: bigint
  nama_periode: string
  tanggal_buka: Date
  tanggal_tutup: Date
  status: "draft" | "aktif" | "tutup"
}

export type PeriodePenilaianAktifRow = {
  id: bigint
  kode_periode: string
  nama_periode: string
  tanggal_mulai: Date
  tanggal_selesai: Date
  tanggal_buka: Date
  tanggal_tutup: Date
  status: "draft" | "aktif" | "tutup"
}

function toLocalIsoDate(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-")
}

export async function assertPeriodePenilaianTerbuka(
  idPeriode: number | bigint,
  action = "melakukan perubahan penilaian",
): Promise<PeriodeGuardRow> {
  const rows = await prisma.$queryRaw<PeriodeGuardRow[]>`
    SELECT id, nama_periode, tanggal_buka, tanggal_tutup, status
    FROM periode_penilaian
    WHERE id = ${BigInt(idPeriode)}
    LIMIT 1
  `
  const periode = rows[0]
  if (!periode) throw new Error("Periode penilaian tidak ditemukan")
  if (periode.status !== "aktif") {
    throw new Error(`Tidak dapat ${action}: periode '${periode.nama_periode}' tidak aktif`)
  }

  const today = toLocalIsoDate(new Date())
  const tanggalBuka = toLocalIsoDate(periode.tanggal_buka)
  const tanggalTutup = toLocalIsoDate(periode.tanggal_tutup)

  if (today < tanggalBuka) {
    throw new Error(`Tidak dapat ${action}: periode '${periode.nama_periode}' baru dibuka pada ${tanggalBuka}`)
  }
  if (today > tanggalTutup) {
    throw new Error(`Tidak dapat ${action}: periode '${periode.nama_periode}' sudah melewati batas ${tanggalTutup}`)
  }

  return periode
}

export async function getPeriodeAktifAtauTerbaru(idPeriode?: number | bigint): Promise<PeriodePenilaianAktifRow | null> {
  if (idPeriode) {
    const rows = await prisma.$queryRaw<PeriodePenilaianAktifRow[]>`
      SELECT id, kode_periode, nama_periode, tanggal_mulai, tanggal_selesai, tanggal_buka, tanggal_tutup, status
      FROM periode_penilaian
      WHERE id = ${BigInt(idPeriode)}
      LIMIT 1
    `
    return rows[0] ?? null
  }

  const rows = await prisma.$queryRaw<PeriodePenilaianAktifRow[]>`
    SELECT id, kode_periode, nama_periode, tanggal_mulai, tanggal_selesai, tanggal_buka, tanggal_tutup, status
    FROM periode_penilaian
    ORDER BY
      CASE
        WHEN status = 'aktif' AND CURRENT_DATE() BETWEEN tanggal_buka AND tanggal_tutup THEN 0
        WHEN status = 'aktif' THEN 1
        ELSE 2
      END,
      tanggal_buka DESC,
      tanggal_mulai DESC,
      id DESC
    LIMIT 1
  `
  return rows[0] ?? null
}

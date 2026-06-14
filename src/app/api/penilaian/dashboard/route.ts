import { NextRequest, NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { prisma, serialize } from "@/lib/prisma"
import { requireRole } from "@/lib/auth"
import { getPeriodeAktifAtauTerbaru } from "@/lib/penilaian-periode"

type PeriodeRow = {
  id: bigint
  kode_periode: string
  nama_periode: string
  tanggal_mulai: Date
}

type EffectiveDivisiRow = {
  jabatan: string | null
  divisi_id: bigint | number | null
  nama_divisi: string | null
}

type EmployeeRow = {
  id: bigint
  nik: string
  nama_karyawan: string
  jabatan: string
  divisi_id: bigint | number | null
  nama_divisi: string | null
  status: string | null
  nilai_kehadiran: string | number | null
  nilai_capaian_sasaran: string | number | null
  nilai_perilaku: string | number | null
  nilai_pengembangan: string | number | null
  nilai_akhir: string | number | null
  prev_nilai_akhir: string | number | null
}

type TrendRow = {
  id_periode: bigint
  nama_periode: string
  divisi_id: bigint | number | null
  nama_divisi: string | null
  rata_nilai: string | number | null
}

type TrendOverallRow = {
  id_periode: bigint
  nama_periode: string
  rata_nilai: string | number | null
}

const PREDIKAT = ["Istimewa", "Sangat Baik", "Baik", "Cukup", "Kurang"]
const CHART_COLORS = ["#2563eb", "#16a34a", "#ea580c", "#7c3aed", "#0891b2", "#dc2626", "#4f46e5", "#ca8a04"]

function predikat(nilai: number | null): string | null {
  if (nilai == null) return null
  if (nilai >= 95) return "Istimewa"
  if (nilai >= 90) return "Sangat Baik"
  if (nilai >= 80) return "Baik"
  if (nilai >= 70) return "Cukup"
  return "Kurang"
}

function toNumber(value: string | number | null | undefined): number | null {
  if (value == null) return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function avg(values: number[]): number | null {
  if (values.length === 0) return null
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100
}

async function getEffectiveDivisi(karyawanId: number): Promise<EffectiveDivisiRow | null> {
  const rows = await prisma.$queryRaw<EffectiveDivisiRow[]>`
    SELECT k.jabatan,
           COALESCE(k.divisi_id, s.divisi_id) AS divisi_id,
           COALESCE(d.nama_divisi, sub_d.nama_divisi, s.nama_sub) AS nama_divisi
    FROM karyawans k
    LEFT JOIN divisis d ON d.id = k.divisi_id
    LEFT JOIN subdivisis s ON s.id = k.subdivisi_id
    LEFT JOIN divisis sub_d ON sub_d.id = s.divisi_id
    WHERE k.id = ${BigInt(karyawanId)}
    LIMIT 1
  `
  return rows[0] ?? null
}

async function getScopedEmployeeIds(canSeeAll: boolean, karyawanId: number, divisiId: number | null): Promise<bigint[]> {
  if (canSeeAll) {
    const rows = await prisma.$queryRaw<{ id: bigint }[]>`
      SELECT id FROM karyawans WHERE status_karyawan IS NULL OR status_karyawan NOT IN ('Pensiun', 'Nonaktif')
    `
    return rows.map(row => row.id)
  }

  if (divisiId) {
    const rows = await prisma.$queryRaw<{ id: bigint }[]>`
      SELECT k.id
      FROM karyawans k
      LEFT JOIN subdivisis s ON s.id = k.subdivisi_id
      WHERE (k.status_karyawan IS NULL OR k.status_karyawan NOT IN ('Pensiun', 'Nonaktif'))
        AND COALESCE(k.divisi_id, s.divisi_id) = ${divisiId}
    `
    return rows.map(row => row.id)
  }

  return [BigInt(karyawanId)]
}

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, ["admin", "hrd", "atasan", "user", "operator"])
  if ("error" in auth) return auth.error
  if (!auth.user.karyawan_id) return NextResponse.json({ error: "Akun belum terhubung ke data karyawan" }, { status: 422 })

  try {
    const { searchParams } = new URL(req.url)
    const requestedPeriodeId = searchParams.get("id_periode")
    const requestedDivisiId = searchParams.get("divisi_id")
    const periode = await getPeriodeAktifAtauTerbaru(requestedPeriodeId ? Number(requestedPeriodeId) : undefined)
    if (!periode) return NextResponse.json({ error: "Periode penilaian belum tersedia" }, { status: 404 })

    const userInfo = await getEffectiveDivisi(auth.user.karyawan_id)
    const canSeeAll = auth.user.role === "admin" || auth.user.role === "hrd" || userInfo?.jabatan === "Manager"
    const enforcedDivisiId = canSeeAll ? (requestedDivisiId ? Number(requestedDivisiId) : null) : Number(userInfo?.divisi_id ?? 0) || null
    const scopeEmployeeIds = await getScopedEmployeeIds(canSeeAll, auth.user.karyawan_id, Number(userInfo?.divisi_id ?? 0) || null)

    if (scopeEmployeeIds.length === 0) {
      return NextResponse.json(serialize({
        periode,
        periodes: [],
        divisis: [],
        scope: { can_see_all: canSeeAll, enforced_divisi_id: enforcedDivisiId },
        summary: { rata_nilai: null, total_pegawai: 0, total_final: 0, completion_percent: 0, predikat_counts: PREDIKAT.map(label => ({ label, count: 0 })), prev_rata_nilai: null, delta: null },
        trend: { labels: [], datasets: [] },
        distribution: { labels: PREDIKAT, counts: PREDIKAT.map(() => 0) },
        ranking: [],
      }))
    }

    const currentRows = await prisma.$queryRaw<EmployeeRow[]>`
      SELECT k.id, k.nik, k.nama_karyawan, k.jabatan,
             COALESCE(k.divisi_id, s.divisi_id) AS divisi_id,
             COALESCE(d.nama_divisi, sub_d.nama_divisi, s.nama_sub) AS nama_divisi,
             pk.status,
             pk.nilai_kehadiran,
             pk.nilai_capaian_sasaran,
             pk.nilai_perilaku,
             pk.nilai_pengembangan,
             pk.nilai_akhir,
             prev.nilai_akhir AS prev_nilai_akhir
      FROM karyawans k
      LEFT JOIN divisis d ON d.id = k.divisi_id
      LEFT JOIN subdivisis s ON s.id = k.subdivisi_id
      LEFT JOIN divisis sub_d ON sub_d.id = s.divisi_id
      LEFT JOIN penilaian_kinerja pk ON pk.id_pegawai = k.id AND pk.id_periode = ${periode.id}
      LEFT JOIN penilaian_kinerja prev ON prev.id_pegawai = k.id AND prev.id_periode = (
        SELECT pp.id
        FROM periode_penilaian pp
        WHERE pp.tanggal_mulai < ${periode.tanggal_mulai}
           OR (pp.tanggal_mulai = ${periode.tanggal_mulai} AND pp.id < ${periode.id})
        ORDER BY pp.tanggal_mulai DESC, pp.id DESC
        LIMIT 1
      )
      WHERE k.id IN (${Prisma.join(scopeEmployeeIds)})
      ORDER BY k.nama_karyawan ASC
    `

    const filteredRows = enforcedDivisiId
      ? currentRows.filter(row => Number(row.divisi_id ?? 0) === enforcedDivisiId)
      : currentRows

    const allDivisisMap = new Map<string, { id: number; nama_divisi: string }>()
    currentRows.forEach(row => {
      const id = Number(row.divisi_id ?? 0)
      if (id > 0) allDivisisMap.set(String(id), { id, nama_divisi: row.nama_divisi ?? "Tanpa Divisi" })
    })
    const divisis = Array.from(allDivisisMap.values()).sort((a, b) => a.nama_divisi.localeCompare(b.nama_divisi))

    const nilaiAkhirValues = filteredRows.map(row => toNumber(row.nilai_akhir)).filter((value): value is number => value != null)
    const prevValues = filteredRows.map(row => toNumber(row.prev_nilai_akhir)).filter((value): value is number => value != null)
    const rataNilai = avg(nilaiAkhirValues)
    const prevRataNilai = avg(prevValues)
    const predikatCounts = PREDIKAT.map(label => ({ label, count: filteredRows.filter(row => predikat(toNumber(row.nilai_akhir)) === label).length }))
    const totalPegawai = filteredRows.length
    const totalFinal = filteredRows.filter(row => row.status === "final").length

    const ranking = filteredRows
      .map(row => {
        const nilaiAkhir = toNumber(row.nilai_akhir)
        const prevNilai = toNumber(row.prev_nilai_akhir)
        return {
          id: Number(row.id),
          nik: row.nik,
          nama_karyawan: row.nama_karyawan,
          jabatan: row.jabatan,
          divisi_id: row.divisi_id == null ? null : Number(row.divisi_id),
          nama_divisi: row.nama_divisi,
          nilai_akhir: nilaiAkhir,
          predikat: predikat(nilaiAkhir),
          delta: nilaiAkhir != null && prevNilai != null ? Math.round((nilaiAkhir - prevNilai) * 100) / 100 : null,
          komponen: {
            kehadiran: toNumber(row.nilai_kehadiran) ?? 0,
            capaian: toNumber(row.nilai_capaian_sasaran) ?? 0,
            perilaku: toNumber(row.nilai_perilaku) ?? 0,
            kompetensi: toNumber(row.nilai_pengembangan) ?? 0,
          },
        }
      })
      .sort((a, b) => (b.nilai_akhir ?? -1) - (a.nilai_akhir ?? -1))
      .map((row, index) => ({ ...row, peringkat: index + 1 }))

    const periodRowsDesc = await prisma.$queryRaw<PeriodeRow[]>`
      SELECT id, kode_periode, nama_periode, tanggal_mulai
      FROM periode_penilaian
      WHERE tanggal_mulai < ${periode.tanggal_mulai}
         OR (tanggal_mulai = ${periode.tanggal_mulai} AND id <= ${periode.id})
      ORDER BY tanggal_mulai DESC, id DESC
      LIMIT 6
    `
    const periodRows = periodRowsDesc.reverse()
    const periodIds = periodRows.map(row => row.id)
    const trend = { labels: periodRows.map(row => row.nama_periode), datasets: [] as { label: string; data: (number | null)[]; borderColor: string; backgroundColor: string }[] }

    const trendEmployeeIds = filteredRows.map(row => row.id)
    if (periodIds.length > 0 && trendEmployeeIds.length > 0) {
      if (canSeeAll && !enforcedDivisiId) {
        const trendRows = await prisma.$queryRaw<TrendRow[]>`
          SELECT pk.id_periode, pp.nama_periode,
                 COALESCE(k.divisi_id, s.divisi_id) AS divisi_id,
                 COALESCE(d.nama_divisi, sub_d.nama_divisi, s.nama_sub) AS nama_divisi,
                 ROUND(AVG(pk.nilai_akhir), 2) AS rata_nilai
          FROM penilaian_kinerja pk
          JOIN periode_penilaian pp ON pp.id = pk.id_periode
          JOIN karyawans k ON k.id = pk.id_pegawai
          LEFT JOIN divisis d ON d.id = k.divisi_id
          LEFT JOIN subdivisis s ON s.id = k.subdivisi_id
          LEFT JOIN divisis sub_d ON sub_d.id = s.divisi_id
          WHERE pk.id_periode IN (${Prisma.join(periodIds)})
            AND pk.id_pegawai IN (${Prisma.join(trendEmployeeIds)})
            AND pk.nilai_akhir IS NOT NULL
          GROUP BY pk.id_periode, pp.nama_periode, COALESCE(k.divisi_id, s.divisi_id), COALESCE(d.nama_divisi, sub_d.nama_divisi, s.nama_sub)
        `
        const divisiKeys = Array.from(new Set(trendRows.map(row => String(row.divisi_id ?? "none"))))
        trend.datasets = divisiKeys.map((key, index) => {
          const sample = trendRows.find(row => String(row.divisi_id ?? "none") === key)
          return {
            label: sample?.nama_divisi ?? "Tanpa Divisi",
            data: periodRows.map(periodRow => toNumber(trendRows.find(row => String(row.id_periode) === String(periodRow.id) && String(row.divisi_id ?? "none") === key)?.rata_nilai)),
            borderColor: CHART_COLORS[index % CHART_COLORS.length],
            backgroundColor: CHART_COLORS[index % CHART_COLORS.length],
          }
        })
      } else {
        const trendRows = await prisma.$queryRaw<TrendOverallRow[]>`
          SELECT pk.id_periode, pp.nama_periode, ROUND(AVG(pk.nilai_akhir), 2) AS rata_nilai
          FROM penilaian_kinerja pk
          JOIN periode_penilaian pp ON pp.id = pk.id_periode
          WHERE pk.id_periode IN (${Prisma.join(periodIds)})
            AND pk.id_pegawai IN (${Prisma.join(trendEmployeeIds)})
            AND pk.nilai_akhir IS NOT NULL
          GROUP BY pk.id_periode, pp.nama_periode
        `
        trend.datasets = [{
          label: enforcedDivisiId ? (divisis.find(d => d.id === enforcedDivisiId)?.nama_divisi ?? "Divisi") : "Organisasi",
          data: periodRows.map(periodRow => toNumber(trendRows.find(row => String(row.id_periode) === String(periodRow.id))?.rata_nilai)),
          borderColor: CHART_COLORS[0],
          backgroundColor: CHART_COLORS[0],
        }]
      }
    }

    return NextResponse.json(serialize({
      periode,
      periodes: periodRowsDesc.reverse(),
      divisis,
      scope: { can_see_all: canSeeAll, enforced_divisi_id: enforcedDivisiId },
      summary: {
        rata_nilai: rataNilai,
        total_pegawai: totalPegawai,
        total_final: totalFinal,
        completion_percent: totalPegawai > 0 ? Math.round((totalFinal / totalPegawai) * 10000) / 100 : 0,
        predikat_counts: predikatCounts,
        prev_rata_nilai: prevRataNilai,
        delta: rataNilai != null && prevRataNilai != null ? Math.round((rataNilai - prevRataNilai) * 100) / 100 : null,
      },
      trend,
      distribution: { labels: PREDIKAT, counts: predikatCounts.map(item => item.count) },
      ranking,
    }))
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Gagal mengambil dashboard kinerja" }, { status: 500 })
  }
}

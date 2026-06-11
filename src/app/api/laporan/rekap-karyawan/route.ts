import { NextResponse } from "next/server"
import { prisma, serialize } from "@/lib/prisma"

/**
 * EXCLUDED_REKAP_ACTIVE_DIVISIONS
 * Sama persis dengan Karyawan::EXCLUDED_REKAP_ACTIVE_DIVISIONS di pedami-inventaris
 * Divisi ini TIDAK dihitung dalam "Aktif untuk rekap"
 */
const EXCLUDED_DIVISIONS = [
  'ketua koperasi konsumen pedami',
  'bendahara koperasi konsumen pedami',
  'sekretaris koperasi konsumen pedami',
  'all divisi',
]

/**
 * Usia pensiun di pedami-inventaris = 56 tahun
 * Warning period = 1 tahun ke depan
 */
const USIA_PENSIUN = 56
const WARNING_DAYS = 365

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const summaryOnly = searchParams.get("summary") === "true"

  try {
    // ── 1. Fetch semua karyawan dengan subdivisi → divisi ──────────────────
    const karyawans = await prisma.karyawans.findMany({
      include: {
        // Tidak ada relasi langsung di schema, manual join
      },
    })

    const subdivisis = await prisma.subdivisis.findMany({
      select: { id: true, nama_sub: true, divisi_id: true },
    })
    const divisis = await prisma.divisis.findMany({
      select: { id: true, nama_divisi: true },
    })

    const subMap = new Map(subdivisis.map(s => [Number(s.id), s]))
    const divMap = new Map(divisis.map(d => [Number(d.id), d.nama_divisi]))

    // Helper: nama divisi karyawan
    const getDivisi = (k: typeof karyawans[0]) => {
      if (!k.subdivisi_id) return null
      const sub = subMap.get(k.subdivisi_id)
      if (!sub) return null
      return divMap.get(sub.divisi_id) ?? null
    }

    // Helper: apakah divisi termasuk excluded?
    const isExcludedDivisi = (divisiName: string | null) => {
      if (!divisiName) return false
      return EXCLUDED_DIVISIONS.includes(divisiName.toLowerCase())
    }

    // ── 2. Stats (sesuai KaryawanStatsOverview) ────────────────────────────
    const total   = karyawans.length
    const pensiun = karyawans.filter(k => k.status_karyawan === 'Pensiun').length
    const nonaktif = karyawans.filter(k => k.status_karyawan === 'Nonaktif').length

    // aktifUntukRekap: status Aktif + NOT in excluded divisions
    const aktifUntukRekap = karyawans.filter(k => {
      if (k.status_karyawan !== 'Aktif') return false
      const divisiName = getDivisi(k)
      return !isExcludedDivisi(divisiName)
    })

    const aktif    = aktifUntukRekap.length
    const lakiLaki = aktifUntukRekap.filter(k => k.jkel === 'Laki-Laki').length
    const perempuan = aktifUntukRekap.filter(k => k.jkel === 'Perempuan').length

    const stats = { total, aktif, pensiun, nonaktif, lakiLaki, perempuan }

    // ── 3. Rekap Per Divisi (sesuai getRekapPerDivisi) ────────────────────
    // Group karyawan by divisi
    const divisiGroups = new Map<string, typeof karyawans>()

    for (const k of karyawans) {
      const divisiName = getDivisi(k) ?? 'Tanpa Divisi'
      if (!divisiGroups.has(divisiName)) divisiGroups.set(divisiName, [])
      divisiGroups.get(divisiName)!.push(k)
    }

    const rekapPerDivisi = Array.from(divisiGroups.entries())
      .map(([divisi, members]) => {
        const isExcluded = isExcludedDivisi(divisi)

        // laki_laki: Aktif + laki-laki (tanpa exclusion sesuai pedami SQL)
        const laki_laki = members.filter(k => k.jkel === 'Laki-Laki' && k.status_karyawan === 'Aktif').length

        // perempuan, campuran, aktif: WITH exclusion filter
        const perempuan = isExcluded ? 0 : members.filter(k => k.jkel === 'Perempuan' && k.status_karyawan === 'Aktif').length
        const campuran  = isExcluded ? 0 : members.filter(k => k.jkel === 'L/P' && k.status_karyawan === 'Aktif').length
        const aktifDiv  = isExcluded ? 0 : members.filter(k => k.status_karyawan === 'Aktif').length
        const pensiunDiv  = members.filter(k => k.status_karyawan === 'Pensiun').length
        const nonaktifDiv = members.filter(k => k.status_karyawan === 'Nonaktif').length
        const total       = members.length

        return { divisi, laki_laki, perempuan, campuran, aktif: aktifDiv, pensiun: pensiunDiv, nonaktif: nonaktifDiv, total }
      })
      .sort((a, b) => a.divisi.localeCompare(b.divisi))

    // ── 4. Karyawan Mendekati Pensiun (usia 56 tahun, warning 1 tahun) ────
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const warningUntil = new Date(today)
    warningUntil.setDate(warningUntil.getDate() + WARNING_DAYS)

    const mendekatiPensiun = karyawans
      .filter(k => k.tanggal_lahir && ['Aktif', 'Pengurus'].includes(k.status_karyawan ?? ''))
      .map(k => {
        const tglLahir = new Date(k.tanggal_lahir!)
        const tglPensiun = new Date(tglLahir)
        tglPensiun.setFullYear(tglPensiun.getFullYear() + USIA_PENSIUN)
        tglPensiun.setHours(0, 0, 0, 0)

        const sisaMs   = tglPensiun.getTime() - today.getTime()
        const sisaHari = Math.floor(sisaMs / (1000 * 60 * 60 * 24))

        // Hitung sisa bulan dan hari
        const sisaTahun  = Math.floor(sisaHari / 365)
        const remAfterY  = sisaHari % 365
        const sisaBulan  = Math.floor(remAfterY / 30)
        const sisaHariRem = remAfterY % 30

        // Hitung umur
        const umurMs    = today.getTime() - tglLahir.getTime()
        const umurTahun = Math.floor(umurMs / (365.25 * 24 * 60 * 60 * 1000))
        const remUmur   = umurMs - umurTahun * 365.25 * 24 * 60 * 60 * 1000
        const umurBulan = Math.floor(remUmur / (30.44 * 24 * 60 * 60 * 1000))

        const divisiName = getDivisi(k) ?? 'Tanpa Divisi'

        return {
          id:              Number(k.id),
          nik:             k.nik ?? '-',
          nama_karyawan:   k.nama_karyawan,
          jabatan:         k.jabatan ?? '-',
          divisi:          divisiName,
          umur:            `${umurTahun} tahun ${umurBulan} bulan`,
          tanggal_pensiun: tglPensiun.toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' }),
          sisa_hari:       sisaHari,
          sisa_waktu:      `${sisaTahun > 0 ? sisaTahun + ' tahun ' : ''}${sisaBulan} bulan ${sisaHariRem} hari`,
          _sort:           tglPensiun.getTime(),
        }
      })
      .filter(k => k.sisa_hari >= 0 && k.sisa_hari <= WARNING_DAYS)
      .sort((a, b) => a._sort - b._sort)
      .map(({ _sort, ...rest }) => rest)

    // ── 5. Chart data: Gender per Divisi ─────────────────────────────────
    const genderPerDivisiData = Array.from(divisiGroups.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([divisi, members]) => ({
        divisi,
        laki_laki: members.filter(k => k.jkel === 'Laki-Laki' && k.status_karyawan === 'Aktif').length,
        perempuan: isExcludedDivisi(divisi) ? 0 : members.filter(k => k.jkel === 'Perempuan' && k.status_karyawan === 'Aktif').length,
        campuran:  isExcludedDivisi(divisi) ? 0 : members.filter(k => k.jkel === 'L/P' && k.status_karyawan === 'Aktif').length,
      }))

    // Jika hanya butuh summary (untuk SDM dashboard)
    if (summaryOnly) {
      return NextResponse.json(serialize({ mendekatiPensiun }))
    }

    return NextResponse.json(serialize({
      stats,
      rekapPerDivisi,
      mendekatiPensiun,
      genderPerDivisiData,
    }))
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: "Gagal mengambil rekap karyawan" }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from "next/server"
import { prisma, serialize } from "@/lib/prisma"
import { requireRole } from "@/lib/auth"
import { hitungAbsensi, hitungRekap, resolveLeaveStatus } from "@/lib/attendance"

// GET /api/sdm/absensi/rekap
// Query: karyawan_id (wajib), bulan (1-12), tahun (YYYY)
// Atau: tgl_mulai + tgl_selesai

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, ["admin", "hrd", "atasan", "user"])
  if ("error" in auth) return auth.error

  try {
    const { searchParams } = new URL(req.url)
    const karyawanId  = searchParams.get("karyawan_id")
    const bulan       = searchParams.get("bulan")
    const tahun       = searchParams.get("tahun")
    const tglMulai    = searchParams.get("tgl_mulai")
    const tglSelesai  = searchParams.get("tgl_selesai")

    if (!karyawanId) return NextResponse.json({ error: "Karyawan wajib dipilih" }, { status: 400 })

    let dtMulai: Date, dtSelesai: Date

    if (tglMulai && tglSelesai) {
      dtMulai   = new Date(tglMulai)
      dtSelesai = new Date(tglSelesai)
    } else {
      const y = tahun  ? parseInt(tahun)  : new Date().getFullYear()
      const m = bulan  ? parseInt(bulan)  : new Date().getMonth() + 1
      const mm = String(m).padStart(2, "0")
      const lastDay = new Date(y, m, 0).getDate()
      // Gunakan string ISO agar di-parse sebagai UTC midnight (konsisten dengan @db.Date)
      dtMulai   = new Date(`${y}-${mm}-01`)
      dtSelesai = new Date(`${y}-${mm}-${lastDay}`)
    }

    const absensiList = await prisma.absensi.findMany({
      where: {
        karyawan_id:     BigInt(karyawanId),
        tanggal_absensi: { gte: dtMulai, lte: dtSelesai },
      },
      orderBy: { tanggal_absensi: "asc" },
      include: {
        jadwal_shifts: { include: { shift_kerjas: { select: { kode_shift: true, nama_shift: true, jam_masuk: true, jam_pulang: true } } } },
      },
    })

    const jadwals = await prisma.jadwal_shifts.findMany({
      where: {
        karyawan_id: BigInt(karyawanId),
        tanggal: { gte: dtMulai, lte: dtSelesai },
      },
      include: { shift_kerjas: { select: { kode_shift: true, nama_shift: true, jam_masuk: true, jam_pulang: true, toleransi_terlambat_menit: true, is_lintas_hari: true, batas_absen_masuk_mulai: true, batas_absen_masuk_selesai: true, batas_absen_pulang_mulai: true, batas_absen_pulang_selesai: true } } },
    })

    const hariLiburs = await prisma.hari_liburs.findMany({
      where: { tanggal: { gte: dtMulai, lte: dtSelesai } },
      select: { tanggal: true, nama_libur: true, tipe_libur: true },
    })

    /** dateKey aman di semua timezone: pakai komponen UTC (Date dari @db.Date = UTC midnight) */
    const dateKey = (date: Date) => date.toISOString().slice(0, 10)
    const absensiMap = new Map(absensiList.map(a => [dateKey(a.tanggal_absensi), a]))
    const jadwalMap = new Map(jadwals.map(j => [dateKey(j.tanggal), j]))
    const liburMap = new Map(hariLiburs.map(l => [dateKey(l.tanggal), l]))

    const detail: Array<Record<string, unknown>> = []
    // cur mulai dari UTC midnight — setDate() bergerak dalam local days tapi hasil toISOString konsisten
    const cur = new Date(dtMulai)
    while (cur <= dtSelesai) {
      const tanggal = new Date(cur)
      const key = dateKey(tanggal)  // UTC date string — konsisten dengan map keys
      const absensi = absensiMap.get(key)
      const jadwal = jadwalMap.get(key)
      const hariLibur = liburMap.get(key)

      if (absensi) {
        detail.push({ ...absensi, sumber_rekap: "absensi", is_hari_kerja_valid: !!jadwal, hari_libur: hariLibur ?? null })
      } else {
        const leaveStatus = await resolveLeaveStatus(BigInt(karyawanId), tanggal)
        const calculated = hitungAbsensi({
          jam_masuk: null,
          jam_pulang: null,
          shift: jadwal?.shift_kerjas ?? null,
          is_hari_libur: !!hariLibur,
          ...leaveStatus,
        })
        detail.push({
          id: null,
          karyawan_id: Number(karyawanId),
          jadwal_shift_id: jadwal?.id ?? null,
          tanggal_absensi: tanggal,
          jam_masuk: null,
          jam_pulang: null,
          ...calculated,
          is_manual: false,
          alasan_manual: null,
          catatan_manual: null,
          jadwal_shifts: jadwal ? { shift_kerjas: jadwal.shift_kerjas } : null,
          hari_libur: hariLibur ?? null,
          sumber_rekap: "kalender",
          is_hari_kerja_valid: !!jadwal || !!hariLibur || leaveStatus.has_cuti || leaveStatus.has_izin || leaveStatus.has_sakit,
        })
      }

      cur.setDate(cur.getDate() + 1)
    }

    const karyawan = await prisma.karyawans.findUnique({
      where: { id: BigInt(karyawanId) },
      select: { id: true, nik: true, nama_karyawan: true, jabatan: true, divisi_id: true },
    })

    const rekap = hitungRekap(detail.map(d => ({
      status_absensi: String(d.status_absensi),
      is_terlambat: Boolean(d.is_terlambat),
      is_pulang_cepat: Boolean(d.is_pulang_cepat),
      is_tidak_absen_masuk: Boolean(d.is_tidak_absen_masuk),
      is_tidak_absen_pulang: Boolean(d.is_tidak_absen_pulang),
      menit_terlambat: Number(d.menit_terlambat ?? 0),
      menit_pulang_cepat: Number(d.menit_pulang_cepat ?? 0),
      total_jam_kerja_menit: Number(d.total_jam_kerja_menit ?? 0),
    })))

    return NextResponse.json(serialize({ karyawan, rekap, detail }))
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}

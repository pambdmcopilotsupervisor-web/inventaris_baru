import { NextRequest, NextResponse } from "next/server"
import { prisma, serialize } from "@/lib/prisma"
import { requireMobileAuth } from "@/lib/mobile-auth"

// GET /api/mobile/absensi/hari-ini
// Status absensi hari ini + info shift + apakah bisa absen masuk/pulang

export async function GET(req: NextRequest) {
  const auth = await requireMobileAuth(req)
  if ("error" in auth) return auth.error

  const karyawanId = auth.user.karyawan_id
  if (!karyawanId) {
    return NextResponse.json({ error: "Akun belum terhubung ke data karyawan" }, { status: 422 })
  }

  try {
    const now = new Date()
    const tglStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`
    const tglDate = new Date(tglStr) // UTC midnight — benar untuk Prisma ↔ MySQL DATE

    // Data absensi hari ini
    const absensi = await prisma.absensi.findFirst({
      where: { karyawan_id: BigInt(karyawanId), tanggal_absensi: tglDate },
      include: {
        jadwal_shifts: { include: { shift_kerjas: true } },
      },
    })

    // Jadwal shift hari ini
    const jadwal = await prisma.jadwal_shifts.findFirst({
      where: { karyawan_id: BigInt(karyawanId), tanggal: tglDate },
      include: { shift_kerjas: true },
    })

    // Hari libur
    const hariLibur = await prisma.hari_liburs.findFirst({ where: { tanggal: tglDate } })

    // Lokasi config
    const lokasiConfig = await prisma.absensi_lokasi_configs.findFirst({ where: { aktif: true } })

    const bisa_masuk  = !absensi?.jam_masuk && !hariLibur
    const bisa_pulang = !!absensi?.jam_masuk && !absensi?.jam_pulang && !hariLibur

    return NextResponse.json(serialize({
      tanggal:    tglDate,
      is_hari_libur: !!hariLibur,
      nama_hari_libur: hariLibur?.nama_libur ?? null,
      shift: jadwal?.shift_kerjas ? {
        kode_shift:                jadwal.shift_kerjas.kode_shift,
        nama_shift:                jadwal.shift_kerjas.nama_shift,
        jam_masuk:                 jadwal.shift_kerjas.jam_masuk,
        jam_pulang:                jadwal.shift_kerjas.jam_pulang,
        toleransi_terlambat_menit: jadwal.shift_kerjas.toleransi_terlambat_menit,
        is_lintas_hari:            jadwal.shift_kerjas.is_lintas_hari,
      } : null,
      absensi: absensi ? {
        id:                    absensi.id,
        jam_masuk:             absensi.jam_masuk,
        jam_pulang:            absensi.jam_pulang,
        status_absensi:        absensi.status_absensi,
        is_terlambat:          absensi.is_terlambat,
        is_pulang_cepat:       absensi.is_pulang_cepat,
        menit_terlambat:       absensi.menit_terlambat,
        menit_pulang_cepat:    absensi.menit_pulang_cepat,
        total_jam_kerja_menit: absensi.total_jam_kerja_menit,
        metode_input:          absensi.metode_input,
        foto_masuk:            absensi.foto_masuk,
        foto_pulang:           absensi.foto_pulang,
      } : null,
      bisa_masuk,
      bisa_pulang,
      lokasi_config: lokasiConfig ? {
        nama_lokasi:  lokasiConfig.nama_lokasi,
        latitude:     lokasiConfig.latitude,
        longitude:    lokasiConfig.longitude,
        radius_meter: lokasiConfig.radius_meter,
      } : null,
    }))
  } catch (err) {
    console.error("[mobile absensi hari-ini]", err)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}

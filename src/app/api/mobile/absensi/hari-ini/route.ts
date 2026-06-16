import { NextRequest, NextResponse } from "next/server"
import { prisma, serialize } from "@/lib/prisma"
import { requireMobileAuth, getTodayWIB } from "@/lib/mobile-auth"

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
    const { tglDate } = getTodayWIB()

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

    // Lokasi config — ambil semua lokasi aktif
    const semuaLokasi = await prisma.absensi_lokasi_configs.findMany({ where: { aktif: true } })
    const lokasiConfig = semuaLokasi[0] ?? null // backward-compat: lokasi utama (terdekat dipilih saat absen)

    // Jika ada shift hari ini, karyawan tetap bisa absen meski hari libur
    const bisa_masuk  = !absensi?.jam_masuk && !!jadwal
    const bisa_pulang = !!absensi?.jam_masuk && !absensi?.jam_pulang

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
      lokasi_configs: semuaLokasi.map(lk => ({
        id:           lk.id,
        nama_lokasi:  lk.nama_lokasi,
        latitude:     lk.latitude,
        longitude:    lk.longitude,
        radius_meter: lk.radius_meter,
      })),
    }))
  } catch (err) {
    console.error("[mobile absensi hari-ini]", err)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}

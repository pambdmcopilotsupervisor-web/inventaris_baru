import { NextRequest, NextResponse } from "next/server"
import { prisma, serialize } from "@/lib/prisma"
import { requireMobileAuth, hitungJarakMeter, getTodayWIB } from "@/lib/mobile-auth"
import { writeAuditLog } from "@/lib/audit"
import { hitungAbsensi, resolveLeaveStatus } from "@/lib/attendance"

// POST /api/mobile/absensi/pulang

export async function POST(req: NextRequest) {
  const auth = await requireMobileAuth(req)
  if ("error" in auth) return auth.error

  const karyawanId = auth.user.karyawan_id
  if (!karyawanId) {
    return NextResponse.json({ error: "Akun belum terhubung ke data karyawan" }, { status: 422 })
  }

  try {
    const body = await req.json()
    const { latitude, longitude, foto_path, catatan, perangkat_info } = body

    if (latitude == null || longitude == null) {
      return NextResponse.json({ error: "Koordinat lokasi wajib dikirim" }, { status: 400 })
    }
    if (!foto_path?.trim()) {
      return NextResponse.json({ error: "Foto selfie wajib dikirim" }, { status: 400 })
    }

    const { tglDate } = getTodayWIB()
    const now = new Date()
    const jamPulang = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`

    // Cek apakah sudah absen masuk
    const existing = await prisma.absensi.findFirst({
      where: { karyawan_id: BigInt(karyawanId), tanggal_absensi: tglDate },
      include: { jadwal_shifts: { include: { shift_kerjas: true } } },
    })
    // Tidak ada cek 409 — absen pulang bisa diulang untuk koreksi jam
    // (Tetap wajib sudah ada absen masuk)
    if (!existing) {
      return NextResponse.json({ error: "Belum ada data absen masuk hari ini. Lakukan absen masuk terlebih dahulu." }, { status: 422 })
    }

    // Validasi radius — cek semua lokasi aktif, lolos jika dalam radius salah satu
    const semuaLokasi = await prisma.absensi_lokasi_configs.findMany({ where: { aktif: true } })
    let jarakMeter: number | null = null
    let lokasiValid = semuaLokasi.length === 0
    let lokasiDipakai: { nama_lokasi: string; jarak: number } | null = null
    for (const lk of semuaLokasi) {
      const jarak = Math.round(hitungJarakMeter(
        Number(latitude), Number(longitude),
        Number(lk.latitude), Number(lk.longitude),
      ))
      if (jarakMeter === null || jarak < jarakMeter) jarakMeter = jarak
      if (jarak <= lk.radius_meter) {
        lokasiValid = true
        lokasiDipakai = { nama_lokasi: lk.nama_lokasi, jarak }
        break
      }
    }
    if (!lokasiValid) {
      return NextResponse.json({
        error: `Anda berada di luar radius semua lokasi absensi. Jarak ke lokasi terdekat: ${jarakMeter}m.`,
        jarak_meter: jarakMeter,
      }, { status: 422 })
    }

    // Ambil shift
    const shift = existing.jadwal_shifts?.shift_kerjas ?? null
    const hariLibur = await prisma.hari_liburs.findFirst({ where: { tanggal: tglDate } })
    const { has_cuti, has_izin, has_sakit } = await resolveLeaveStatus(BigInt(karyawanId), tglDate)

    // Hitung status lengkap
    const hasil = hitungAbsensi({
      jam_masuk:     existing.jam_masuk,
      jam_pulang:    jamPulang,
      shift,
      is_hari_libur: !!hariLibur,
      has_cuti, has_izin, has_sakit,
    })

    const userId = BigInt(auth.user.id)

    const data = await prisma.absensi.update({
      where: { id: existing.id },
      data: {
        jam_pulang:            jamPulang,
        status_absensi:        hasil.status_absensi,
        is_terlambat:          hasil.is_terlambat,
        is_pulang_cepat:       hasil.is_pulang_cepat,
        is_tidak_absen_pulang: false,
        menit_terlambat:       hasil.menit_terlambat,
        menit_pulang_cepat:    hasil.menit_pulang_cepat,
        total_jam_kerja_menit: hasil.total_jam_kerja_menit,
        foto_pulang:           foto_path.trim(),
        lokasi_pulang_lat:     Number(latitude),
        lokasi_pulang_lng:     Number(longitude),
        metode_input:          "mobile",
        perangkat_info:        perangkat_info ?? existing.perangkat_info,
        catatan_manual:        catatan?.trim() || existing.catatan_manual,
        updated_by:            userId,
        updated_at:            now,
      },
    })

    await writeAuditLog({
      user: { id: auth.user.id, name: auth.user.name, email: auth.user.email ?? "", role: auth.user.role, karyawan_id: auth.user.karyawan_id, jabatan: auth.user.jabatan, nama_karyawan: auth.user.nama_karyawan },
      action: "UPDATE", modelType: "absensi_mobile_pulang",
      modelId: data.id, dataBaru: { jam_pulang: jamPulang, lat: latitude, lng: longitude, jarak_meter: jarakMeter },
      ip: req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown",
    })

    const totalJamMenit = hasil.total_jam_kerja_menit
    const jam = Math.floor(totalJamMenit / 60)
    const menit = totalJamMenit % 60

    return NextResponse.json(serialize({
      success:           true,
      message:           `Absen pulang berhasil pukul ${jamPulang}${lokasiDipakai ? ` di ${lokasiDipakai.nama_lokasi}` : ""}`,
      jam_pulang:        jamPulang,
      status_absensi:    hasil.status_absensi,
      is_pulang_cepat:   hasil.is_pulang_cepat,
      menit_pulang_cepat: hasil.menit_pulang_cepat,
      total_jam_kerja:   `${jam}j ${menit}m`,
      jarak_meter:       jarakMeter,
      lokasi_dipakai:    lokasiDipakai?.nama_lokasi ?? null,
      absensi_id:        data.id,
    }))
  } catch (err) {
    console.error("[mobile absensi pulang]", err)
    return NextResponse.json({ error: "Absen pulang gagal" }, { status: 500 })
  }
}

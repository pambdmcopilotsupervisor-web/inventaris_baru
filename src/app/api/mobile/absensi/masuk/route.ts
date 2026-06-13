import { NextRequest, NextResponse } from "next/server"
import { prisma, serialize } from "@/lib/prisma"
import { requireMobileAuth, hitungJarakMeter, getTodayWIB } from "@/lib/mobile-auth"
import { writeAuditLog } from "@/lib/audit"
import { hitungAbsensi, resolveLeaveStatus } from "@/lib/attendance"

// POST /api/mobile/absensi/masuk
// Body (JSON):
//   latitude: number, longitude: number, foto_path: string (path setelah upload)
// Atau Body (multipart/form-data):
//   latitude, longitude, foto (file)

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
      return NextResponse.json({ error: "Koordinat lokasi (latitude, longitude) wajib dikirim" }, { status: 400 })
    }
    if (!foto_path?.trim()) {
      return NextResponse.json({ error: "Foto selfie wajib dikirim (upload foto terlebih dahulu)" }, { status: 400 })
    }

    // Validasi karyawan aktif
    const karyawan = await prisma.karyawans.findUnique({
      where: { id: BigInt(karyawanId) },
      select: { status_karyawan: true, nama_karyawan: true },
    })
    if (!karyawan || karyawan.status_karyawan === "Pensiun" || karyawan.status_karyawan === "Nonaktif") {
      return NextResponse.json({ error: "Status karyawan tidak aktif" }, { status: 422 })
    }

    const { tglDate } = getTodayWIB()
    const now = new Date()
    const jamMasuk = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`

    // Validasi radius lokasi
    const lokasiConfig = await prisma.absensi_lokasi_configs.findFirst({ where: { aktif: true } })
    let jarakMeter: number | null = null
    let lokasiValid = true
    if (lokasiConfig) {
      jarakMeter = Math.round(hitungJarakMeter(
        Number(latitude), Number(longitude),
        Number(lokasiConfig.latitude), Number(lokasiConfig.longitude),
      ))
      lokasiValid = jarakMeter <= lokasiConfig.radius_meter
    }

    if (!lokasiValid && lokasiConfig) {
      return NextResponse.json({
        error: `Anda berada di luar radius absensi. Jarak Anda: ${jarakMeter}m, radius maksimum: ${lokasiConfig.radius_meter}m.`,
        jarak_meter: jarakMeter,
      }, { status: 422 })
    }

    // Ambil data absen existing jika ada (untuk upsert)
    const existing = await prisma.absensi.findFirst({
      where: { karyawan_id: BigInt(karyawanId), tanggal_absensi: tglDate },
    })
    // Tidak ada cek 409 — absen masuk bisa diulang untuk koreksi jam

    // Ambil jadwal shift
    const jadwal = await prisma.jadwal_shifts.findFirst({
      where: { karyawan_id: BigInt(karyawanId), tanggal: tglDate },
      include: { shift_kerjas: true },
    })
    const shift = jadwal?.shift_kerjas ?? null

    // Cek hari libur
    const hariLibur = await prisma.hari_liburs.findFirst({ where: { tanggal: tglDate } })

    // Resolve leave status
    const { has_cuti, has_izin, has_sakit } = await resolveLeaveStatus(BigInt(karyawanId), tglDate)

    // Hitung status (masuk saja, belum pulang)
    const hasil = hitungAbsensi({
      jam_masuk:     jamMasuk,
      jam_pulang:    null,
      shift,
      is_hari_libur: !!hariLibur,
      has_cuti, has_izin, has_sakit,
    })

    const userId = BigInt(auth.user.id)

    const data = await prisma.absensi.upsert({
      where: { karyawan_id_tanggal_absensi: { karyawan_id: BigInt(karyawanId), tanggal_absensi: tglDate } },
      update: {
        jam_masuk:             jamMasuk,
        status_absensi:        hasil.status_absensi,
        is_terlambat:          hasil.is_terlambat,
        is_tidak_absen_masuk:  false,
        menit_terlambat:       hasil.menit_terlambat,
        foto_masuk:            foto_path.trim(),
        lokasi_masuk_lat:      Number(latitude),
        lokasi_masuk_lng:      Number(longitude),
        metode_input:          "mobile",
        perangkat_info:        perangkat_info ?? null,
        updated_by:            userId,
        updated_at:            now,
      },
      create: {
        karyawan_id:           BigInt(karyawanId),
        jadwal_shift_id:       jadwal?.id ?? null,
        tanggal_absensi:       tglDate,
        jam_masuk:             jamMasuk,
        status_absensi:        hasil.status_absensi,
        is_terlambat:          hasil.is_terlambat,
        is_pulang_cepat:       false,
        is_tidak_absen_masuk:  false,
        is_tidak_absen_pulang: true,
        menit_terlambat:       hasil.menit_terlambat,
        menit_pulang_cepat:    0,
        total_jam_kerja_menit: 0,
        is_manual:             false,
        foto_masuk:            foto_path.trim(),
        lokasi_masuk_lat:      Number(latitude),
        lokasi_masuk_lng:      Number(longitude),
        metode_input:          "mobile",
        perangkat_info:        perangkat_info ?? null,
        catatan_manual:        catatan?.trim() || null,
        created_by:            userId,
        updated_by:            userId,
        created_at:            now,
        updated_at:            now,
      },
    })

    await writeAuditLog({
      user: { id: auth.user.id, name: auth.user.name, email: auth.user.email ?? "", role: auth.user.role, karyawan_id: auth.user.karyawan_id, jabatan: auth.user.jabatan, nama_karyawan: auth.user.nama_karyawan },
      action: "CREATE", modelType: "absensi_mobile_masuk",
      modelId: data.id, dataBaru: { jam_masuk: jamMasuk, lat: latitude, lng: longitude, jarak_meter: jarakMeter },
      ip: req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown",
    })

    return NextResponse.json(serialize({
      success:         true,
      message:         `Absen masuk berhasil pukul ${jamMasuk}`,
      jam_masuk:       jamMasuk,
      status_absensi:  hasil.status_absensi,
      is_terlambat:    hasil.is_terlambat,
      menit_terlambat: hasil.menit_terlambat,
      jarak_meter:     jarakMeter,
      shift:           shift ? { kode_shift: shift.kode_shift, nama_shift: shift.nama_shift, jam_masuk: shift.jam_masuk, jam_pulang: shift.jam_pulang } : null,
      absensi_id:      data.id,
    }))
  } catch (err) {
    console.error("[mobile absensi masuk]", err)
    return NextResponse.json({ error: "Absen masuk gagal" }, { status: 500 })
  }
}

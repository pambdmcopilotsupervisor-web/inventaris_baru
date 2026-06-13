import { NextRequest, NextResponse } from "next/server"
import { prisma, serialize } from "@/lib/prisma"
import { requireMobileAuth } from "@/lib/mobile-auth"

// GET /api/mobile/absensi/riwayat
// Query: tgl_mulai (YYYY-MM-DD), tgl_selesai (YYYY-MM-DD)
// Default: 7 hari terakhir

export async function GET(req: NextRequest) {
  const auth = await requireMobileAuth(req)
  if ("error" in auth) return auth.error

  const karyawanId = auth.user.karyawan_id
  if (!karyawanId) {
    return NextResponse.json({ error: "Akun belum terhubung ke data karyawan" }, { status: 422 })
  }

  try {
    const { searchParams } = new URL(req.url)
    const tglMulai   = searchParams.get("tgl_mulai")
    const tglSelesai = searchParams.get("tgl_selesai")

    let dtMulai: Date, dtSelesai: Date
    if (tglMulai && tglSelesai) {
      dtMulai   = new Date(tglMulai)
      dtSelesai = new Date(tglSelesai)
    } else {
      // Default: bulan ini
      const now = new Date()
      dtMulai   = new Date(now.getFullYear(), now.getMonth(), 1)
      dtSelesai = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    }

    const absensiList = await prisma.absensi.findMany({
      where: {
        karyawan_id:     BigInt(karyawanId),
        tanggal_absensi: { gte: dtMulai, lte: dtSelesai },
      },
      orderBy: { tanggal_absensi: "desc" },
      include: {
        jadwal_shifts: {
          include: {
            shift_kerjas: {
              select: {
                kode_shift: true, nama_shift: true,
                jam_masuk: true, jam_pulang: true,
              },
            },
          },
        },
      },
    })

    // Rekap ringkas
    const rekap = {
      hadir:             0,
      terlambat:         0,
      pulang_cepat:      0,
      alpha:             0,
      tidak_masuk:       0,
      tidak_pulang:      0,
      cuti:              0,
      izin:              0,
      sakit:             0,
      libur:             0,
      total_jam_menit:   0,
      total_terlambat_menit: 0,
    }
    for (const a of absensiList) {
      switch (a.status_absensi) {
        case "hadir":              rekap.hadir++;            break
        case "terlambat":          rekap.terlambat++;        break
        case "pulang_cepat":       rekap.pulang_cepat++;     break
        case "alpha":              rekap.alpha++;            break
        case "tidak_absen_masuk":  rekap.tidak_masuk++;      break
        case "tidak_absen_pulang": rekap.tidak_pulang++;     break
        case "cuti":               rekap.cuti++;             break
        case "izin":               rekap.izin++;             break
        case "sakit":              rekap.sakit++;            break
        case "libur":              rekap.libur++;            break
      }
      rekap.total_jam_menit += a.total_jam_kerja_menit
      rekap.total_terlambat_menit += a.menit_terlambat
    }

    const formatted = absensiList.map(a => ({
      id:                    a.id,
      tanggal_absensi:       a.tanggal_absensi,
      jam_masuk:             a.jam_masuk,
      jam_pulang:            a.jam_pulang,
      status_absensi:        a.status_absensi,
      is_terlambat:          a.is_terlambat,
      is_pulang_cepat:       a.is_pulang_cepat,
      menit_terlambat:       a.menit_terlambat,
      menit_pulang_cepat:    a.menit_pulang_cepat,
      total_jam_kerja_menit: a.total_jam_kerja_menit,
      metode_input:          a.metode_input,
      shift:                 a.jadwal_shifts?.shift_kerjas ?? null,
    }))

    return NextResponse.json(serialize({ rekap, data: formatted, periode: { dtMulai, dtSelesai } }))
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}

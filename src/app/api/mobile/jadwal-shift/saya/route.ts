import { NextRequest, NextResponse } from "next/server"
import { prisma, serialize } from "@/lib/prisma"
import { requireMobileAuth } from "@/lib/mobile-auth"

// GET /api/mobile/jadwal-shift/saya
// Query: tgl_mulai, tgl_selesai (default: 7 hari ke depan dari hari ini)

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
      // Default: 7 hari ke depan
      const now = new Date()
      dtMulai   = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      dtSelesai = new Date(dtMulai.getTime() + 6 * 24 * 60 * 60 * 1000)
    }

    const jadwals = await prisma.jadwal_shifts.findMany({
      where: {
        karyawan_id: BigInt(karyawanId),
        tanggal:     { gte: dtMulai, lte: dtSelesai },
      },
      orderBy: { tanggal: "asc" },
      include: {
        shift_kerjas: {
          select: {
            id: true, kode_shift: true, nama_shift: true,
            jam_masuk: true, jam_pulang: true,
            toleransi_terlambat_menit: true, is_lintas_hari: true,
            durasi_kerja_menit: true,
          },
        },
      },
    })

    // Cek hari libur dalam rentang
    const hariLiburs = await prisma.hari_liburs.findMany({
      where: { tanggal: { gte: dtMulai, lte: dtSelesai } },
      select: { tanggal: true, nama_libur: true, tipe_libur: true },
    })
    const liburMap = new Map(hariLiburs.map(l => [l.tanggal.toISOString().slice(0, 10), l]))

    const data = jadwals.map(j => ({
      id:          j.id,
      tanggal:     j.tanggal,
      is_hari_libur: liburMap.has(j.tanggal.toISOString().slice(0, 10)),
      hari_libur:  liburMap.get(j.tanggal.toISOString().slice(0, 10)) ?? null,
      shift:       j.shift_kerjas,
    }))

    return NextResponse.json(serialize({ data, periode: { dtMulai, dtSelesai } }))
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}

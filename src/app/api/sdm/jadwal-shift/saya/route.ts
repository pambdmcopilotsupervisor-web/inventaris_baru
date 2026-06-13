import { NextRequest, NextResponse } from "next/server"
import { prisma, serialize } from "@/lib/prisma"
import { requireRole } from "@/lib/auth"

// GET /api/sdm/jadwal-shift/saya
// Jadwal shift milik karyawan yang sedang login
// Query: ?tgl_mulai=YYYY-MM-DD&tgl_selesai=YYYY-MM-DD

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, ["admin", "hrd", "atasan", "user"])
  if ("error" in auth) return auth.error

  const karyawanId = auth.user.karyawan_id
  if (!karyawanId) {
    return NextResponse.json({ error: "Akun ini tidak terhubung ke data karyawan" }, { status: 422 })
  }

  try {
    const { searchParams } = new URL(req.url)
    const tglMulai   = searchParams.get("tgl_mulai")
    const tglSelesai = searchParams.get("tgl_selesai")

    const tanggalWhere: Record<string, unknown> = {}
    if (tglMulai && tglSelesai) {
      tanggalWhere.gte = new Date(tglMulai)
      tanggalWhere.lte = new Date(tglSelesai)
    } else if (tglMulai) {
      tanggalWhere.gte = new Date(tglMulai)
    } else {
      // Default: bulan ini
      const now = new Date()
      tanggalWhere.gte = new Date(now.getFullYear(), now.getMonth(), 1)
      tanggalWhere.lte = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    }

    const data = await prisma.jadwal_shifts.findMany({
      where: {
        karyawan_id: BigInt(karyawanId),
        tanggal:     tanggalWhere,
      },
      orderBy: { tanggal: "asc" },
      include: {
        shift_kerjas: {
          select: {
            id: true, kode_shift: true, nama_shift: true,
            jam_masuk: true, jam_pulang: true,
            toleransi_terlambat_menit: true, is_lintas_hari: true,
          },
        },
      },
    })

    return NextResponse.json(serialize(data))
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}

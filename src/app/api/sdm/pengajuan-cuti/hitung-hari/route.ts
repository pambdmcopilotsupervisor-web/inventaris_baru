import { NextRequest, NextResponse } from "next/server"
import { requireRole } from "@/lib/auth"
import { hitungHariKerja } from "@/lib/leave"

// GET /api/sdm/pengajuan-cuti/hitung-hari
// Query: karyawan_id, tanggal_mulai, tanggal_selesai

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, ["admin", "hrd", "atasan", "user", "operator"])
  if ("error" in auth) return auth.error
  try {
    const { searchParams } = new URL(req.url)
    const karyawanId  = searchParams.get("karyawan_id")
    const tglMulai    = searchParams.get("tanggal_mulai")
    const tglSelesai  = searchParams.get("tanggal_selesai")

    if (!karyawanId || !tglMulai || !tglSelesai) {
      return NextResponse.json({ error: "Parameter tidak lengkap" }, { status: 400 })
    }

    const dtMulai   = new Date(tglMulai)
    const dtSelesai = new Date(tglSelesai)
    if (dtSelesai < dtMulai) return NextResponse.json({ jumlah_hari: 0 })

    const jumlah_hari = await hitungHariKerja(BigInt(karyawanId), dtMulai, dtSelesai)
    return NextResponse.json({ jumlah_hari })
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from "next/server"
import { prisma, serialize } from "@/lib/prisma"
import { requireRole } from "@/lib/auth"

type KomponenRow = {
  id: bigint
  kode_komponen: string
  nama_komponen: string
  deskripsi: string | null
  default_bobot_percent: string | number
  urutan: number
  aktif: number
}

// GET /api/sdm/komponen-penilaian — daftar komponen penilaian
export async function GET(req: NextRequest) {
  const auth = await requireRole(req, ["admin", "hrd", "atasan", "user"])
  if ("error" in auth) return auth.error
  try {
    const rows = await prisma.$queryRaw<KomponenRow[]>`
      SELECT id, kode_komponen, nama_komponen, deskripsi, default_bobot_percent, urutan, aktif
      FROM komponen_penilaian
      ORDER BY urutan ASC, id ASC
    `
    return NextResponse.json(serialize(rows))
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}

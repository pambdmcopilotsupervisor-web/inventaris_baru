import { NextRequest, NextResponse } from "next/server"
import { serialize } from "@/lib/prisma"
import { requireRole } from "@/lib/auth"
import { getDaftarPenilaianBawahan } from "@/lib/penilaian-atasan"

// GET /api/penilaian-atasan?id_periode=...
// Daftar penilaian bawahan untuk periode tertentu

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, ["admin", "hrd", "atasan", "user", "operator"])
  if ("error" in auth) return auth.error

  try {
    const { searchParams } = new URL(req.url)
    const idPeriode = searchParams.get("id_periode")
    const data = await getDaftarPenilaianBawahan(auth.user, idPeriode ? Number(idPeriode) : undefined)
    return NextResponse.json(serialize(data))
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Gagal mengambil data" }, { status: 500 })
  }
}

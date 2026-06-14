import { NextRequest, NextResponse } from "next/server"
import { serialize } from "@/lib/prisma"
import { requireRole } from "@/lib/auth"
import { getMenungguSaya } from "@/lib/penilaian-workflow"

// GET /api/penilaian/menunggu-saya?id_periode=...
// Daftar penilaian yang perlu tindakan dari user yang login

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, ["admin", "hrd", "atasan", "user", "operator"])
  if ("error" in auth) return auth.error

  const karyawanId = auth.user.karyawan_id
  if (!karyawanId) return NextResponse.json({ error: "Akun belum terhubung ke data karyawan" }, { status: 422 })

  try {
    const { searchParams } = new URL(req.url)
    const idPeriode = searchParams.get("id_periode")
    const rows = await getMenungguSaya(karyawanId, auth.user.role ?? "user", idPeriode ? Number(idPeriode) : undefined)
    return NextResponse.json(serialize(rows))
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Server error" }, { status: 500 })
  }
}

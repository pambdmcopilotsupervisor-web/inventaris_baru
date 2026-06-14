import { NextRequest, NextResponse } from "next/server"
import { serialize } from "@/lib/prisma"
import { requireRole } from "@/lib/auth"
import { canAccessPegawaiTarget, getTargetKerja } from "@/lib/penilaian-target"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; id_periode: string }> },
) {
  const auth = await requireRole(req, ["admin", "hrd", "atasan", "user", "operator"])
  if ("error" in auth) return auth.error

  try {
    const { id, id_periode } = await params
    const canAccess = await canAccessPegawaiTarget(auth.user, Number(id))
    if (!canAccess) return NextResponse.json({ error: "Tidak diizinkan mengakses target pegawai ini" }, { status: 403 })

    const rows = await getTargetKerja(Number(id), Number(id_periode))
    return NextResponse.json(serialize(rows))
  } catch {
    return NextResponse.json({ error: "Gagal mengambil target kerja" }, { status: 500 })
  }
}

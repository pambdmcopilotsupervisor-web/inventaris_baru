import { NextRequest, NextResponse } from "next/server"
import { serialize } from "@/lib/prisma"
import { requireRole, getClientIp } from "@/lib/auth"
import { writeAuditLog } from "@/lib/audit"
import { getPenilaianMandiri, simpanPenilaianMandiri } from "@/lib/penilaian-mandiri"

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, ["admin", "hrd", "atasan", "user", "operator"])
  if ("error" in auth) return auth.error

  try {
    const { searchParams } = new URL(req.url)
    const idPeriode = searchParams.get("id_periode")
    const data = await getPenilaianMandiri(auth.user, idPeriode ? Number(idPeriode) : undefined)
    return NextResponse.json(serialize(data))
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Gagal mengambil penilaian mandiri" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, ["admin", "hrd", "atasan", "user", "operator"])
  if ("error" in auth) return auth.error

  try {
    const body = await req.json()
    const result = await simpanPenilaianMandiri(auth.user, body)

    await writeAuditLog({
      user: auth.user,
      action: "UPDATE",
      modelType: "penilaian_kinerja",
      dataBaru: { id_periode: body.id_periode, status: result.status, submit: !!body.submit },
      ip: getClientIp(req),
    })

    return NextResponse.json({ success: true, ...result, message: body.submit ? "Penilaian mandiri berhasil dikirim ke atasan. Notifikasi sistem telah dibuat." : "Draft penilaian mandiri berhasil disimpan." })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Gagal menyimpan penilaian mandiri" }, { status: 400 })
  }
}

import { NextRequest, NextResponse } from "next/server"
import { serialize } from "@/lib/prisma"
import { requireRole, getClientIp } from "@/lib/auth"
import { writeAuditLog } from "@/lib/audit"
import { getPenilaianUntukAtasan, simpanPenilaianAtasan } from "@/lib/penilaian-atasan"

// GET /api/penilaian/[id]/nilai-atasan  — baca detail untuk form atasan
// PUT /api/penilaian/[id]/nilai-atasan  — simpan penilaian atasan

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireRole(req, ["admin", "hrd", "atasan", "user", "operator"])
  if ("error" in auth) return auth.error

  try {
    const { id } = await params
    const data = await getPenilaianUntukAtasan(auth.user, Number(id))
    return NextResponse.json(serialize(data))
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Gagal mengambil data"
    const status = msg.includes("tidak diizinkan") || msg.includes("Tidak diizinkan") ? 403 : 500
    return NextResponse.json({ error: msg }, { status })
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireRole(req, ["admin", "hrd", "atasan", "user", "operator"])
  if ("error" in auth) return auth.error

  try {
    const { id } = await params
    const body = await req.json()
    const result = await simpanPenilaianAtasan(auth.user, { ...body, id_penilaian: Number(id) })

    await writeAuditLog({
      user: auth.user,
      action: "UPDATE",
      modelType: "penilaian_kinerja",
      modelId: Number(id),
      dataBaru: { status: result.status, nilai_akhir: result.nilai_akhir, submit: !!body.submit },
      ip: getClientIp(req),
    })

    return NextResponse.json({
      success: true,
      ...result,
      message: body.submit
        ? "Penilaian atasan berhasil diselesaikan dan siap diverifikasi."
        : "Draft penilaian atasan berhasil disimpan.",
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Gagal menyimpan penilaian"
    const status = msg.includes("tidak diizinkan") || msg.includes("Tidak diizinkan") ? 403 : 400
    return NextResponse.json({ error: msg }, { status })
  }
}

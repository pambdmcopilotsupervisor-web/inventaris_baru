import { NextRequest, NextResponse } from "next/server"
import { serialize } from "@/lib/prisma"
import { requireRole, getClientIp } from "@/lib/auth"
import { writeAuditLog } from "@/lib/audit"
import { doTransition, getNextActions } from "@/lib/penilaian-workflow"
import type { StatusPenilaian } from "@/lib/penilaian-workflow"

// POST /api/penilaian/:id/transisi
// Body: { ke: StatusPenilaian, catatan?: string }

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireRole(req, ["admin", "hrd", "atasan", "user", "operator"])
  if ("error" in auth) return auth.error

  const karyawanId = auth.user.karyawan_id
  if (!karyawanId) return NextResponse.json({ error: "Akun belum terhubung ke data karyawan" }, { status: 422 })

  try {
    const { id } = await params
    const body = await req.json()
    const ke      = body.ke      as StatusPenilaian | undefined
    const catatan = (body.catatan as string | undefined) ?? ""

    if (!ke) return NextResponse.json({ error: "Field 'ke' wajib diisi" }, { status: 400 })

    const result = await doTransition({
      idPenilaian: Number(id),
      ke,
      karyawanId,
      role: auth.user.role ?? "user",
      catatan,
    })

    await writeAuditLog({
      user: auth.user,
      action: "UPDATE",
      modelType: "penilaian_kinerja",
      modelId: Number(id),
      dataBaru: { status: result.status, catatan },
      ip: getClientIp(req),
    })

    return NextResponse.json({ success: true, ...result })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Gagal melakukan transisi"
    const status = msg.includes("tidak diizinkan") || msg.includes("Tidak diizinkan") ? 403 : 400
    return NextResponse.json({ error: msg }, { status })
  }
}

// GET /api/penilaian/:id/transisi — daftar aksi yang tersedia untuk user
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireRole(req, ["admin", "hrd", "atasan", "user", "operator"])
  if ("error" in auth) return auth.error

  const karyawanId = auth.user.karyawan_id
  if (!karyawanId) return NextResponse.json({ error: "Akun belum terhubung ke data karyawan" }, { status: 422 })

  try {
    const { id } = await params
    const actions = await getNextActions(Number(id), karyawanId, auth.user.role ?? "user")
    return NextResponse.json(serialize(actions))
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Server error" }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from "next/server"
import { serialize } from "@/lib/prisma"
import { requireRole, getClientIp } from "@/lib/auth"
import { writeAuditLog } from "@/lib/audit"
import {
  canAccessPegawaiTarget,
  getMonitoringTarget,
  normalizeTargetInputs,
  saveTargetKerja,
  validateTargetInputs,
  type TargetKerjaInput,
} from "@/lib/penilaian-target"

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, ["admin", "hrd", "atasan", "user", "operator"])
  if ("error" in auth) return auth.error

  try {
    const { searchParams } = new URL(req.url)
    const idPeriode = searchParams.get("id_periode")
    if (!idPeriode) return NextResponse.json({ error: "id_periode wajib diisi" }, { status: 400 })

    const atasanId = auth.user.role === "admin" || auth.user.role === "hrd" ? null : auth.user.karyawan_id
    const rows = await getMonitoringTarget(Number(idPeriode), atasanId)
    return NextResponse.json(serialize(rows))
  } catch {
    return NextResponse.json({ error: "Gagal mengambil monitoring target" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, ["admin", "hrd", "atasan", "user", "operator"])
  if ("error" in auth) return auth.error

  try {
    const body = await req.json()
    const idPeriode = Number(body.id_periode)
    const idPegawai = Number(body.id_pegawai ?? auth.user.karyawan_id)
    const targets = normalizeTargetInputs((body.targets ?? []) as TargetKerjaInput[])

    if (!idPeriode) return NextResponse.json({ error: "id_periode wajib diisi" }, { status: 400 })
    if (!idPegawai) return NextResponse.json({ error: "id_pegawai wajib diisi atau akun harus terhubung ke karyawan" }, { status: 400 })

    const canAccess = await canAccessPegawaiTarget(auth.user, idPegawai)
    if (!canAccess) return NextResponse.json({ error: "Tidak diizinkan menyimpan target pegawai ini" }, { status: 403 })

    const validationError = validateTargetInputs(targets)
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400 })

    await saveTargetKerja(BigInt(idPegawai), BigInt(idPeriode), targets)

    await writeAuditLog({
      user: auth.user,
      action: "CREATE",
      modelType: "target_kerja",
      dataBaru: { id_periode: idPeriode, id_pegawai: idPegawai, jumlah_target: targets.length },
      ip: getClientIp(req),
    })

    return NextResponse.json({ success: true, message: "Target kerja berhasil diajukan" })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Gagal menyimpan target kerja" }, { status: 500 })
  }
}

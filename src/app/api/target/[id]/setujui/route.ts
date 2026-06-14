import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireRole, getClientIp } from "@/lib/auth"
import { writeAuditLog } from "@/lib/audit"
import { approveTargetKerja, canApprovePegawaiTarget } from "@/lib/penilaian-target"
import { assertPeriodePenilaianTerbuka } from "@/lib/penilaian-periode"

type TargetRef = {
  id: bigint
  id_pegawai: bigint
  id_periode: bigint
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireRole(req, ["admin", "hrd", "atasan", "user", "operator"])
  if ("error" in auth) return auth.error

  try {
    const { id } = await params
    const body = await req.json().catch(() => ({}))
    const applyAll = body.apply_all !== false

    const rows = await prisma.$queryRaw<TargetRef[]>`
      SELECT id, id_pegawai, id_periode
      FROM target_kerja
      WHERE id = ${BigInt(id)}
      LIMIT 1
    `
    const target = rows[0]
    if (!target) return NextResponse.json({ error: "Target kerja tidak ditemukan" }, { status: 404 })

    const canApprove = await canApprovePegawaiTarget(auth.user, target.id_pegawai, true)
    if (!canApprove) return NextResponse.json({ error: "Tidak diizinkan menyetujui target pegawai ini" }, { status: 403 })
    await assertPeriodePenilaianTerbuka(target.id_periode, "menyetujui target kerja")
    const approverId = auth.user.karyawan_id ? BigInt(auth.user.karyawan_id) : null

    if (applyAll) {
      await prisma.$executeRaw`
        UPDATE target_kerja
        SET status = 'disetujui',
            disetujui_oleh = ${approverId},
            disetujui_pada = NOW(),
            catatan = COALESCE(${body.catatan?.trim() || null}, catatan),
            updated_at = NOW()
        WHERE id_pegawai = ${target.id_pegawai}
          AND id_periode = ${target.id_periode}
      `
    } else {
      await approveTargetKerja(target.id, approverId, body.catatan)
    }

    await writeAuditLog({
      user: auth.user,
      action: "UPDATE",
      modelType: "target_kerja",
      modelId: target.id,
      dataBaru: { status: "disetujui", apply_all: applyAll },
      ip: getClientIp(req),
    })

    return NextResponse.json({ success: true, message: applyAll ? "Semua target pegawai disetujui" : "Target kerja disetujui" })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Gagal menyetujui target kerja" }, { status: 500 })
  }
}

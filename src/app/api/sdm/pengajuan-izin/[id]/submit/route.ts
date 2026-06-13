import { NextRequest, NextResponse } from "next/server"
import { prisma, serialize } from "@/lib/prisma"
import { requireRole, getClientIp } from "@/lib/auth"
import { writeAuditLog } from "@/lib/audit"
import { STATUS_IZIN, resolveAtasan } from "@/lib/izin"

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(req, ["admin", "hrd", "atasan", "user", "operator"])
  if ("error" in auth) return auth.error
  try {
    const { id } = await params
    const pengajuan = await prisma.pengajuan_izins.findUnique({ where: { id: BigInt(id) }, include: { karyawans: true, jenis_izins: true } })
    if (!pengajuan) return NextResponse.json({ error: "Tidak ditemukan" }, { status: 404 })
    if (pengajuan.status !== STATUS_IZIN.DRAFT) return NextResponse.json({ error: "Hanya draft yang dapat di-submit" }, { status: 422 })

    const now = new Date()
    const { atasan, level } = await resolveAtasan(pengajuan.karyawan_id)

    await prisma.pengajuan_izins.update({ where: { id: BigInt(id) }, data: { status: STATUS_IZIN.SUBMITTED, updated_at: now } })

    await prisma.izin_approvals.create({
      data: { pengajuan_izin_id: BigInt(id), approver_id: atasan?.id ?? null, approver_role: level, approval_level: 1, status: "pending", created_at: now, updated_at: now },
    })

    if (level === "hrd" || !atasan) {
      await prisma.izin_approvals.create({
        data: { pengajuan_izin_id: BigInt(id), approver_id: null, approver_role: "hrd", approval_level: 2, status: "pending", created_at: now, updated_at: now },
      })
      await prisma.pengajuan_izins.update({ where: { id: BigInt(id) }, data: { status: STATUS_IZIN.APPROVED_SUPERVISOR, updated_at: now } })
    }

    await writeAuditLog({ user: auth.user, action: "UPDATE", modelType: "pengajuan_izins", modelId: BigInt(id), dataBaru: { status: "submitted" }, ip: getClientIp(req) })
    return NextResponse.json({ success: true, message: "Pengajuan izin berhasil disubmit" })
  } catch (err) {
    console.error("[submit izin]", err)
    return NextResponse.json({ error: "Gagal submit" }, { status: 500 })
  }
}

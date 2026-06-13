import { NextRequest, NextResponse } from "next/server"
import { prisma, serialize } from "@/lib/prisma"
import { requireRole, getClientIp } from "@/lib/auth"
import { writeAuditLog } from "@/lib/audit"
import { STATUS_SAKIT, resolveAtasan, isHrdApproverSakit, isJabatanAtasan, applySakitToAbsensi } from "@/lib/sakit"

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(req, ["admin", "hrd", "atasan", "user", "operator"])
  if ("error" in auth) return auth.error
  try {
    const { id } = await params
    const pengajuan = await prisma.pengajuan_sakits.findUnique({ where: { id: BigInt(id) }, include: { karyawans: true } })
    if (!pengajuan) return NextResponse.json({ error: "Tidak ditemukan" }, { status: 404 })
    if (pengajuan.status !== STATUS_SAKIT.DRAFT) return NextResponse.json({ error: "Hanya draft yang dapat di-submit" }, { status: 422 })

    const now = new Date()
    const { atasan, level } = await resolveAtasan(pengajuan.karyawan_id)

    await prisma.pengajuan_sakits.update({
      where: { id: BigInt(id) },
      data: { status: STATUS_SAKIT.SUBMITTED, submitted_at: now, updated_at: now },
    })
    await prisma.sakit_approvals.create({
      data: { pengajuan_sakit_id: BigInt(id), approver_id: atasan?.id ?? null, approver_role: level, approval_level: 1, status: "pending", created_at: now, updated_at: now },
    })
    if (level === "hrd" || !atasan) {
      await prisma.sakit_approvals.create({
        data: { pengajuan_sakit_id: BigInt(id), approver_id: null, approver_role: "hrd", approval_level: 2, status: "pending", created_at: now, updated_at: now },
      })
      await prisma.pengajuan_sakits.update({ where: { id: BigInt(id) }, data: { status: STATUS_SAKIT.APPROVED_SUPERVISOR, updated_at: now } })
    }

    await writeAuditLog({ user: auth.user, action: "UPDATE", modelType: "pengajuan_sakits", modelId: BigInt(id), dataBaru: { status: "submitted" }, ip: getClientIp(req) })
    return NextResponse.json({ success: true, message: "Pengajuan sakit berhasil disubmit" })
  } catch (err) {
    console.error("[submit sakit]", err)
    return NextResponse.json({ error: "Gagal submit" }, { status: 500 })
  }
}

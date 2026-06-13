import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireMobileAuth } from "@/lib/mobile-auth"
import { resolveAtasan, isJabatanAtasan, STATUS_SAKIT } from "@/lib/sakit"

// POST /api/mobile/sakit/[id]/submit
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireMobileAuth(req)
  if ("error" in auth) return auth.error
  const karyawanId = auth.user.karyawan_id
  try {
    const { id } = await params
    const pengajuan = await prisma.pengajuan_sakits.findUnique({ where: { id: BigInt(id) } })
    if (!pengajuan) return NextResponse.json({ error: "Tidak ditemukan" }, { status: 404 })
    if (karyawanId && Number(pengajuan.karyawan_id) !== karyawanId) return NextResponse.json({ error: "Tidak diizinkan" }, { status: 403 })
    if (pengajuan.status !== STATUS_SAKIT.DRAFT) return NextResponse.json({ error: "Hanya draft yang dapat di-submit" }, { status: 422 })

    const now = new Date()
    const { atasan, level } = await resolveAtasan(pengajuan.karyawan_id)
    await prisma.pengajuan_sakits.update({ where: { id: BigInt(id) }, data: { status: STATUS_SAKIT.SUBMITTED, submitted_at: now, updated_at: now } })
    await prisma.sakit_approvals.create({ data: { pengajuan_sakit_id: BigInt(id), approver_id: atasan?.id ?? null, approver_role: level, approval_level: 1, status: "pending", created_at: now, updated_at: now } })
    if (level === "hrd" || !atasan) {
      await prisma.sakit_approvals.create({ data: { pengajuan_sakit_id: BigInt(id), approver_id: null, approver_role: "hrd", approval_level: 2, status: "pending", created_at: now, updated_at: now } })
      await prisma.pengajuan_sakits.update({ where: { id: BigInt(id) }, data: { status: STATUS_SAKIT.APPROVED_SUPERVISOR, updated_at: now } })
    }
    return NextResponse.json({ success: true, message: "Pengajuan sakit berhasil disubmit" })
  } catch (err) { console.error("[mobile sakit submit]", err); return NextResponse.json({ error: "Gagal" }, { status: 500 }) }
}

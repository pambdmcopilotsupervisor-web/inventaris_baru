import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireMobileAuth } from "@/lib/mobile-auth"
import { resolveAtasan, STATUS_LEMBUR } from "@/lib/lembur"

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireMobileAuth(req)
  if ("error" in auth) return auth.error
  const karyawanId = auth.user.karyawan_id
  try {
    const { id } = await params
    const overtime = await prisma.overtime_requests.findUnique({ where: { id: BigInt(id) } })
    if (!overtime) return NextResponse.json({ error: "Tidak ditemukan" }, { status: 404 })
    if (karyawanId && Number(overtime.karyawan_id) !== karyawanId) return NextResponse.json({ error: "Tidak diizinkan" }, { status: 403 })
    if (overtime.status !== STATUS_LEMBUR.DRAFT) return NextResponse.json({ error: "Hanya draft yang dapat di-submit" }, { status: 422 })

    const now = new Date()
    const { atasan, level } = await resolveAtasan(overtime.karyawan_id)
    await prisma.overtime_requests.update({ where: { id: BigInt(id) }, data: { status: STATUS_LEMBUR.SUBMITTED, submitted_at: now, updated_at: now } })
    await prisma.overtime_approvals.create({ data: { overtime_request_id: BigInt(id), approver_id: atasan?.id ?? null, approver_role: level, approval_level: 1, status: "pending", created_at: now, updated_at: now } })
    if (level === "hrd" || !atasan) {
      await prisma.overtime_approvals.create({ data: { overtime_request_id: BigInt(id), approver_id: null, approver_role: "hrd", approval_level: 2, status: "pending", created_at: now, updated_at: now } })
      await prisma.overtime_requests.update({ where: { id: BigInt(id) }, data: { status: STATUS_LEMBUR.APPROVED_SUPERVISOR, updated_at: now } })
    }
    return NextResponse.json({ success: true, message: "Pengajuan lembur berhasil disubmit" })
  } catch (err) { console.error("[mobile lembur submit]", err); return NextResponse.json({ error: "Gagal" }, { status: 500 }) }
}

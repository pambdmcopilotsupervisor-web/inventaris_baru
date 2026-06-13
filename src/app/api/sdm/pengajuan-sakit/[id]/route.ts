import { NextRequest, NextResponse } from "next/server"
import { prisma, serialize } from "@/lib/prisma"
import { requireRole, getClientIp } from "@/lib/auth"
import { writeAuditLog } from "@/lib/audit"
import { STATUS_SAKIT, resolveAtasan, enrichSakitApprovals } from "@/lib/sakit"

const INCLUDE = {
  karyawans:       { select: { id: true, nik: true, nama_karyawan: true, jabatan: true, divisi_id: true } },
  sakit_approvals: { orderBy: { approval_level: "asc" as const } },
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(req, ["admin", "hrd", "atasan", "user", "operator"])
  if ("error" in auth) return auth.error
  try {
    const { id } = await params
    const data = await prisma.pengajuan_sakits.findUnique({ where: { id: BigInt(id) }, include: INCLUDE })
    if (!data) return NextResponse.json({ error: "Tidak ditemukan" }, { status: 404 })

    // Auto-fix approver_id null
    for (const ap of data.sakit_approvals) {
      if (ap.approval_level === 1 && ap.status === "pending" && !ap.approver_id) {
        const { atasan } = await resolveAtasan(data.karyawan_id)
        if (atasan) {
          await prisma.sakit_approvals.update({ where: { id: ap.id }, data: { approver_id: atasan.id, updated_at: new Date() } })
          ap.approver_id = atasan.id
        }
      }
    }

    const serialized = serialize(data) as Record<string, unknown>
    const approvals = (serialized.sakit_approvals ?? []) as { id: number; approver_id: number | null; approver_user_id: number | null; approver_role: string; approval_level: number; status: string; note: string | null; approved_at: string | null }[]
    const enriched = await enrichSakitApprovals(approvals)
    return NextResponse.json({ ...serialized, sakit_approvals: enriched })
  } catch { return NextResponse.json({ error: "Server error" }, { status: 500 }) }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(req, ["admin", "hrd", "atasan", "user", "operator"])
  if ("error" in auth) return auth.error
  try {
    const { id } = await params
    const existing = await prisma.pengajuan_sakits.findUnique({ where: { id: BigInt(id) } })
    if (!existing) return NextResponse.json({ error: "Tidak ditemukan" }, { status: 404 })
    if (existing.status === STATUS_SAKIT.APPROVED_HRD) return NextResponse.json({ error: "Gunakan Batalkan untuk sakit yang sudah disetujui HRD" }, { status: 422 })

    const role = (auth.user.role ?? "user").toLowerCase()
    if (role !== "admin" && role !== "hrd") {
      const kId = auth.user.karyawan_id
      if (!kId || Number(existing.karyawan_id) !== kId) return NextResponse.json({ error: "Hanya bisa hapus pengajuan milik sendiri" }, { status: 403 })
      if (!["draft", "submitted"].includes(existing.status)) return NextResponse.json({ error: "Gunakan Batalkan untuk yang sudah diproses" }, { status: 422 })
    }

    await prisma.pengajuan_sakits.delete({ where: { id: BigInt(id) } })
    await writeAuditLog({ user: auth.user, action: "DELETE", modelType: "pengajuan_sakits", modelId: BigInt(id), dataLama: serialize(existing), ip: getClientIp(req) })
    return NextResponse.json({ success: true })
  } catch { return NextResponse.json({ error: "Gagal menghapus" }, { status: 500 }) }
}

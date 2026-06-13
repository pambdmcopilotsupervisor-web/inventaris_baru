import { NextRequest, NextResponse } from "next/server"
import { prisma, serialize } from "@/lib/prisma"
import { requireMobileAuth } from "@/lib/mobile-auth"
import { resolveAtasan, STATUS_CUTI } from "@/lib/leave"
import { enrichSakitApprovals } from "@/lib/sakit"

// GET /api/mobile/cuti/[id] — detail + riwayat approval

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireMobileAuth(req)
  if ("error" in auth) return auth.error

  const karyawanId = auth.user.karyawan_id
  try {
    const { id } = await params
    const data = await prisma.pengajuan_cutis.findUnique({
      where: { id: BigInt(id) },
      include: {
        jenis_cutis: { select: { id: true, kode_cuti: true, nama_cuti: true } },
        approvals:   { orderBy: { approval_level: "asc" } },
      },
    })
    if (!data) return NextResponse.json({ error: "Tidak ditemukan" }, { status: 404 })
    // Hanya pemilik atau admin yang bisa lihat
    if (karyawanId && Number(data.karyawan_id) !== karyawanId && auth.user.role?.toLowerCase() !== "admin") {
      return NextResponse.json({ error: "Tidak diizinkan" }, { status: 403 })
    }

    // Auto-fix approver_id
    for (const ap of data.approvals) {
      if (ap.approval_level === 1 && ap.status === "pending" && !ap.approver_id) {
        const { atasan } = await resolveAtasan(data.karyawan_id)
        if (atasan) {
          await prisma.leave_request_approvals.update({ where: { id: ap.id }, data: { approver_id: atasan.id, updated_at: new Date() } })
          ap.approver_id = atasan.id
        }
      }
    }

    const serialized = serialize(data) as Record<string, unknown>
    const approvals = (serialized.approvals ?? []) as { id: number; approver_id: number | null; approver_user_id: number | null; approver_role: string; approval_level: number; status: string; note: string | null; approved_at: string | null }[]
    const enriched = await enrichSakitApprovals(approvals)
    return NextResponse.json({ ...serialized, approvals: enriched })
  } catch { return NextResponse.json({ error: "Server error" }, { status: 500 }) }
}

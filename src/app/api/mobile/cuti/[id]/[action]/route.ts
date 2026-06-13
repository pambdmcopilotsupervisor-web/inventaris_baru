import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireMobileAuth } from "@/lib/mobile-auth"
import { isJabatanAtasan, STATUS_CUTI } from "@/lib/leave"

// POST /api/mobile/cuti/[id]/approve  — approve level 1 (atasan)
// POST /api/mobile/cuti/[id]/reject   — reject level 1 (atasan)

async function handleApproveReject(req: NextRequest, id: string, action: "approve" | "reject") {
  const auth = await requireMobileAuth(req)
  if ("error" in auth) return auth.error

  const karyawanId = auth.user.karyawan_id
  if (!karyawanId) return NextResponse.json({ error: "Akun belum terhubung ke karyawan" }, { status: 422 })

  try {
    const body = await req.json().catch(() => ({}))
    const { note } = body
    if (action === "reject" && !note?.trim()) return NextResponse.json({ error: "Catatan penolakan wajib diisi" }, { status: 400 })

    // Cek jabatan atasan
    const k = await prisma.karyawans.findUnique({ where: { id: BigInt(karyawanId) }, select: { jabatan: true } })
    if (!k || !isJabatanAtasan(k.jabatan)) return NextResponse.json({ error: "Anda tidak memiliki hak approval" }, { status: 403 })

    const pengajuan = await prisma.pengajuan_cutis.findUnique({
      where: { id: BigInt(id) },
      include: { approvals: { orderBy: { approval_level: "asc" } } },
    })
    if (!pengajuan) return NextResponse.json({ error: "Tidak ditemukan" }, { status: 404 })
    if (pengajuan.status !== STATUS_CUTI.SUBMITTED) return NextResponse.json({ error: "Status tidak valid untuk diproses" }, { status: 422 })

    const ap = pengajuan.approvals.find(a => a.approval_level === 1 && a.status === "pending")
    if (!ap) return NextResponse.json({ error: "Tidak ada approval level 1 yang pending" }, { status: 422 })

    const now = new Date()
    const userId = BigInt(auth.user.id)

    if (action === "approve") {
      await prisma.leave_request_approvals.update({
        where: { id: ap.id },
        data: { status: "approved", approver_user_id: userId, approver_id: BigInt(karyawanId), note: note || null, approved_at: now, updated_at: now },
      })
      await prisma.leave_request_approvals.create({
        data: { pengajuan_cuti_id: BigInt(id), approver_id: null, approver_role: "hrd", approval_level: 2, status: "pending", created_at: now, updated_at: now },
      })
      await prisma.pengajuan_cutis.update({ where: { id: BigInt(id) }, data: { status: STATUS_CUTI.APPROVED_SUPERVISOR, updated_at: now } })
      return NextResponse.json({ success: true, message: "Pengajuan cuti disetujui. Menunggu verifikasi HRD." })
    } else {
      await prisma.leave_request_approvals.update({
        where: { id: ap.id },
        data: { status: "rejected", approver_user_id: userId, approver_id: BigInt(karyawanId), note: note?.trim(), approved_at: now, updated_at: now },
      })
      await prisma.pengajuan_cutis.update({ where: { id: BigInt(id) }, data: { status: STATUS_CUTI.REJECTED_SUPERVISOR, updated_at: now } })
      return NextResponse.json({ success: true, message: "Pengajuan cuti ditolak" })
    }
  } catch (err) {
    console.error(`[mobile cuti ${action}]`, err)
    return NextResponse.json({ error: "Gagal memproses" }, { status: 500 })
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; action: string }> }) {
  const { id, action } = await params
  if (action !== "approve" && action !== "reject") {
    return NextResponse.json({ error: "Aksi tidak valid" }, { status: 400 })
  }
  return handleApproveReject(req, id, action)
}

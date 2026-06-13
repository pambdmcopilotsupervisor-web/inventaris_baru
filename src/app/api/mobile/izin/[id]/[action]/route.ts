import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireMobileAuth } from "@/lib/mobile-auth"
import { isJabatanAtasan, STATUS_IZIN } from "@/lib/izin"

// POST /api/mobile/izin/[id]/[action] — approve atau reject (atasan level 1)
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; action: string }> }) {
  const auth = await requireMobileAuth(req)
  if ("error" in auth) return auth.error
  const karyawanId = auth.user.karyawan_id
  if (!karyawanId) return NextResponse.json({ error: "Tidak ada akses" }, { status: 403 })

  const { id, action } = await params
  if (action !== "approve" && action !== "reject") return NextResponse.json({ error: "Aksi tidak valid" }, { status: 400 })

  try {
    const body = await req.json().catch(() => ({}))
    const { note } = body
    if (action === "reject" && !note?.trim()) return NextResponse.json({ error: "Catatan penolakan wajib diisi" }, { status: 400 })

    const k = await prisma.karyawans.findUnique({ where: { id: BigInt(karyawanId) }, select: { jabatan: true } })
    if (!k || !isJabatanAtasan(k.jabatan)) return NextResponse.json({ error: "Tidak memiliki hak approval" }, { status: 403 })

    const pengajuan = await prisma.pengajuan_izins.findUnique({ where: { id: BigInt(id) }, include: { izin_approvals: { orderBy: { approval_level: "asc" } } } })
    if (!pengajuan) return NextResponse.json({ error: "Tidak ditemukan" }, { status: 404 })
    if (pengajuan.status !== STATUS_IZIN.SUBMITTED) return NextResponse.json({ error: "Status tidak valid" }, { status: 422 })

    const ap = pengajuan.izin_approvals.find(a => a.approval_level === 1 && a.status === "pending")
    if (!ap) return NextResponse.json({ error: "Tidak ada approval level 1 pending" }, { status: 422 })

    const now = new Date(), userId = BigInt(auth.user.id)
    if (action === "approve") {
      await prisma.izin_approvals.update({ where: { id: ap.id }, data: { status: "approved", approver_user_id: userId, approver_id: BigInt(karyawanId), note: note || null, approved_at: now, updated_at: now } })
      await prisma.izin_approvals.create({ data: { pengajuan_izin_id: BigInt(id), approver_id: null, approver_role: "hrd", approval_level: 2, status: "pending", created_at: now, updated_at: now } })
      await prisma.pengajuan_izins.update({ where: { id: BigInt(id) }, data: { status: STATUS_IZIN.APPROVED_SUPERVISOR, updated_at: now } })
      return NextResponse.json({ success: true, message: "Izin disetujui. Menunggu verifikasi HRD." })
    } else {
      await prisma.izin_approvals.update({ where: { id: ap.id }, data: { status: "rejected", approver_user_id: userId, approver_id: BigInt(karyawanId), note: note.trim(), approved_at: now, updated_at: now } })
      await prisma.pengajuan_izins.update({ where: { id: BigInt(id) }, data: { status: STATUS_IZIN.REJECTED_SUPERVISOR, updated_at: now } })
      return NextResponse.json({ success: true, message: "Izin ditolak" })
    }
  } catch { return NextResponse.json({ error: "Gagal memproses" }, { status: 500 }) }
}

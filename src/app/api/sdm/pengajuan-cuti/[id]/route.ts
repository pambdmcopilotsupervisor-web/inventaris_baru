import { NextRequest, NextResponse } from "next/server"
import { prisma, serialize } from "@/lib/prisma"
import { requireRole, getClientIp } from "@/lib/auth"
import { writeAuditLog } from "@/lib/audit"
import { STATUS_CUTI, resolveAtasan, potongSaldoCuti, kembalikanSaldoCuti, applyLeaveToAbsensi, revertLeaveFromAbsensi } from "@/lib/leave"

const INCLUDE = {
  karyawans:  { select: { id: true, nik: true, nama_karyawan: true, jabatan: true, divisi_id: true } },
  jenis_cutis: { select: { id: true, kode_cuti: true, nama_cuti: true, potong_saldo_cuti: true } },
  approvals:  { orderBy: { approval_level: "asc" as const } },
}

/** Enrich approval list dengan nama approver dari tabel karyawans DAN users */
async function enrichApprovals(approvals: { id: number; approver_id: number | null; approver_user_id: number | null; approver_role: string; approval_level: number; status: string; note: string | null; approved_at: string | null }[]) {
  // Ambil nama dari karyawans (approver_id)
  const karyawanIds = approvals.map(a => a.approver_id).filter(Boolean) as number[]
  const karyawans = karyawanIds.length > 0
    ? await prisma.karyawans.findMany({ where: { id: { in: karyawanIds.map(id => BigInt(id)) } }, select: { id: true, nama_karyawan: true, jabatan: true } })
    : []
  const kMap = new Map(karyawans.map(k => [Number(k.id), k]))

  // Ambil nama dari users (approver_user_id) — untuk mencatat siapa yang meng-aksi
  const userIds = approvals.map(a => a.approver_user_id).filter(Boolean) as number[]
  const users = userIds.length > 0
    ? await prisma.users.findMany({ where: { id: { in: userIds.map(id => BigInt(id)) } }, select: { id: true, name: true } })
    : []
  const uMap = new Map(users.map(u => [Number(u.id), u]))

  return approvals.map(a => ({
    ...a,
    approver_nama:      a.approver_id      ? (kMap.get(a.approver_id)?.nama_karyawan ?? null) : null,
    approver_jabatan:   a.approver_id      ? (kMap.get(a.approver_id)?.jabatan ?? null)       : null,
    diproses_oleh_nama: a.approver_user_id ? (uMap.get(a.approver_user_id)?.name ?? null)     : null,
  }))
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(req, ["admin", "hrd", "atasan", "user", "operator"])
  if ("error" in auth) return auth.error
  try {
    const { id } = await params
    const data = await prisma.pengajuan_cutis.findUnique({ where: { id: BigInt(id) }, include: INCLUDE })
    if (!data) return NextResponse.json({ error: "Tidak ditemukan" }, { status: 404 })

    // Auto-fix: jika ada approval level 1 yang approver_id masih null & pending,
    // resolve atasan sekarang dan update record
    for (const ap of data.approvals) {
      if (ap.approval_level === 1 && ap.status === "pending" && !ap.approver_id) {
        const { atasan } = await resolveAtasan(data.karyawan_id)
        if (atasan) {
          await prisma.leave_request_approvals.update({
            where: { id: ap.id },
            data: { approver_id: atasan.id, updated_at: new Date() },
          })
          ap.approver_id = atasan.id
        }
      }
    }

    const serialized = serialize(data) as Record<string, unknown>
    const approvals = (serialized.approvals ?? []) as { id: number; approver_id: number | null; approver_user_id: number | null; approver_role: string; approval_level: number; status: string; note: string | null; approved_at: string | null }[]
    const enriched = await enrichApprovals(approvals)
    return NextResponse.json({ ...serialized, approvals: enriched })
  } catch { return NextResponse.json({ error: "Server error" }, { status: 500 }) }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(req, ["admin", "hrd"])
  if ("error" in auth) return auth.error
  try {
    const { id } = await params
    const body = await req.json()
    const existing = await prisma.pengajuan_cutis.findUnique({ where: { id: BigInt(id) } })
    if (!existing) return NextResponse.json({ error: "Tidak ditemukan" }, { status: 404 })
    if ([STATUS_CUTI.APPROVED_HRD, STATUS_CUTI.CANCELLED].includes(existing.status as never)) {
      return NextResponse.json({ error: "Pengajuan yang sudah final tidak dapat diedit" }, { status: 422 })
    }
    const data = await prisma.pengajuan_cutis.update({
      where: { id: BigInt(id) },
      data: {
        alasan:             body.alasan?.trim() || existing.alasan,
        alamat_selama_cuti: body.alamat_selama_cuti?.trim() || null,
        keterangan:         body.keterangan?.trim() || null,
        updated_at:         new Date(),
      } as never,
    })
    await writeAuditLog({ user: auth.user, action: "UPDATE", modelType: "pengajuan_cutis", modelId: BigInt(id), dataLama: serialize(existing), dataBaru: serialize(data), ip: getClientIp(req) })
    return NextResponse.json(serialize(data))
  } catch { return NextResponse.json({ error: "Gagal memperbarui" }, { status: 500 }) }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(req, ["admin", "hrd", "atasan", "user", "operator"])
  if ("error" in auth) return auth.error
  try {
    const { id } = await params
    const existing = await prisma.pengajuan_cutis.findUnique({ where: { id: BigInt(id) }, include: { jenis_cutis: true } })
    if (!existing) return NextResponse.json({ error: "Tidak ditemukan" }, { status: 404 })
    if (existing.status === STATUS_CUTI.APPROVED_HRD) {
      return NextResponse.json({ error: "Gunakan fitur Batalkan untuk pengajuan yang sudah disetujui HRD" }, { status: 422 })
    }

    // User biasa hanya bisa hapus pengajuan miliknya sendiri yang masih draft/submitted
    const role = auth.user.role ?? "user"
    if (role !== "admin" && role !== "hrd") {
      const karyawanId = auth.user.karyawan_id
      if (!karyawanId || Number(existing.karyawan_id) !== karyawanId) {
        return NextResponse.json({ error: "Anda hanya bisa menghapus pengajuan cuti milik sendiri" }, { status: 403 })
      }
      if (!["draft", "submitted"].includes(existing.status)) {
        return NextResponse.json({ error: "Pengajuan yang sudah diproses tidak dapat dihapus. Gunakan Batalkan." }, { status: 422 })
      }
    }

    await prisma.pengajuan_cutis.delete({ where: { id: BigInt(id) } })
    await writeAuditLog({ user: auth.user, action: "DELETE", modelType: "pengajuan_cutis", modelId: BigInt(id), dataLama: serialize(existing), ip: getClientIp(req) })
    return NextResponse.json({ success: true })
  } catch { return NextResponse.json({ error: "Gagal menghapus" }, { status: 500 }) }
}

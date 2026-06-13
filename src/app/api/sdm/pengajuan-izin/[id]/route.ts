import { NextRequest, NextResponse } from "next/server"
import { prisma, serialize } from "@/lib/prisma"
import { requireRole, getClientIp } from "@/lib/auth"
import { writeAuditLog } from "@/lib/audit"
import { STATUS_IZIN, enrichIzinApprovals, resolveAtasan, isHrdApproverIzin, applyIzinToAbsensi } from "@/lib/izin"

const INCLUDE = {
  karyawans:  { select: { id: true, nik: true, nama_karyawan: true, jabatan: true, divisi_id: true } },
  jenis_izins: { select: { id: true, kode_izin: true, nama_izin: true, satuan: true, memotong_absensi: true } },
  izin_approvals: { orderBy: { approval_level: "asc" as const } },
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(req, ["admin", "hrd", "atasan", "user", "operator"])
  if ("error" in auth) return auth.error
  try {
    const { id } = await params
    const data = await prisma.pengajuan_izins.findUnique({ where: { id: BigInt(id) }, include: INCLUDE })
    if (!data) return NextResponse.json({ error: "Tidak ditemukan" }, { status: 404 })

    // Auto-fix approver_id null
    for (const ap of data.izin_approvals) {
      if (ap.approval_level === 1 && ap.status === "pending" && !ap.approver_id) {
        const { atasan } = await resolveAtasan(data.karyawan_id)
        if (atasan) {
          await prisma.izin_approvals.update({ where: { id: ap.id }, data: { approver_id: atasan.id, updated_at: new Date() } })
          ap.approver_id = atasan.id
        }
      }
    }

    const serialized = serialize(data) as Record<string, unknown>
    const approvals = (serialized.izin_approvals ?? []) as { id: number; approver_id: number | null; approver_user_id: number | null; approver_role: string; approval_level: number; status: string; note: string | null; approved_at: string | null }[]
    const enriched = await enrichIzinApprovals(approvals)
    return NextResponse.json({ ...serialized, izin_approvals: enriched })
  } catch { return NextResponse.json({ error: "Server error" }, { status: 500 }) }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(req, ["admin", "hrd", "atasan", "user", "operator"])
  if ("error" in auth) return auth.error
  try {
    const { id } = await params
    const existing = await prisma.pengajuan_izins.findUnique({ where: { id: BigInt(id) } })
    if (!existing) return NextResponse.json({ error: "Tidak ditemukan" }, { status: 404 })
    if (existing.status === STATUS_IZIN.APPROVED_HRD) {
      return NextResponse.json({ error: "Gunakan Batalkan untuk izin yang sudah disetujui HRD" }, { status: 422 })
    }

    const role = (auth.user.role ?? "user").toLowerCase()
    if (role !== "admin" && role !== "hrd") {
      const kId = auth.user.karyawan_id
      if (!kId || Number(existing.karyawan_id) !== kId) return NextResponse.json({ error: "Hanya bisa hapus izin milik sendiri" }, { status: 403 })
      if (!["draft", "submitted"].includes(existing.status)) return NextResponse.json({ error: "Gunakan Batalkan untuk izin yang sudah diproses" }, { status: 422 })
    }

    await prisma.pengajuan_izins.delete({ where: { id: BigInt(id) } })
    await writeAuditLog({ user: auth.user, action: "DELETE", modelType: "pengajuan_izins", modelId: BigInt(id), dataLama: serialize(existing), ip: getClientIp(req) })
    return NextResponse.json({ success: true })
  } catch { return NextResponse.json({ error: "Gagal menghapus" }, { status: 500 }) }
}

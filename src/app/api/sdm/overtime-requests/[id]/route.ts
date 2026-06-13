import { NextRequest, NextResponse } from "next/server"
import { prisma, serialize } from "@/lib/prisma"
import { requireRole, getClientIp } from "@/lib/auth"
import { writeAuditLog } from "@/lib/audit"
import { STATUS_LEMBUR, resolveAtasan, enrichLemburApprovals } from "@/lib/lembur"

const INCLUDE = {
  karyawans:          { select: { id: true, nik: true, nama_karyawan: true, jabatan: true, divisi_id: true, tarif_lembur_per_jam: true } },
  overtime_settings:  true,
  overtime_approvals: { orderBy: { approval_level: "asc" as const } },
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(req, ["admin", "hrd", "atasan", "user", "operator"])
  if ("error" in auth) return auth.error
  try {
    const { id } = await params
    const data = await prisma.overtime_requests.findUnique({ where: { id: BigInt(id) }, include: INCLUDE })
    if (!data) return NextResponse.json({ error: "Tidak ditemukan" }, { status: 404 })

    // Auto-fix approver_id null
    for (const ap of data.overtime_approvals) {
      if (ap.approval_level === 1 && ap.status === "pending" && !ap.approver_id) {
        const { atasan } = await resolveAtasan(data.karyawan_id)
        if (atasan) {
          await prisma.overtime_approvals.update({ where: { id: ap.id }, data: { approver_id: atasan.id, updated_at: new Date() } })
          ap.approver_id = atasan.id
        }
      }
    }

    const serialized = serialize(data) as Record<string, unknown>
    const approvals = (serialized.overtime_approvals ?? []) as { id: number; approver_id: number | null; approver_user_id: number | null; approver_role: string; approval_level: number; status: string; note: string | null; approved_at: string | null }[]
    const enriched = await enrichLemburApprovals(approvals)
    return NextResponse.json({ ...serialized, overtime_approvals: enriched })
  } catch { return NextResponse.json({ error: "Server error" }, { status: 500 }) }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(req, ["admin", "hrd"])
  if ("error" in auth) return auth.error
  try {
    const { id } = await params
    const body = await req.json()
    const existing = await prisma.overtime_requests.findUnique({ where: { id: BigInt(id) } })
    if (!existing) return NextResponse.json({ error: "Tidak ditemukan" }, { status: 404 })
    if ([STATUS_LEMBUR.APPROVED_HRD, STATUS_LEMBUR.REALIZED].includes(existing.status as never)) {
      return NextResponse.json({ error: "Tidak dapat diedit setelah disetujui HRD" }, { status: 422 })
    }
    const data = await prisma.overtime_requests.update({
      where: { id: BigInt(id) },
      data: {
        jam_mulai_aktual:      body.jam_mulai_aktual || null,
        jam_selesai_aktual:    body.jam_selesai_aktual || null,
        durasi_aktual_menit:   body.durasi_aktual_menit !== undefined ? Number(body.durasi_aktual_menit) : null,
        durasi_disetujui_menit: body.durasi_disetujui_menit !== undefined ? Number(body.durasi_disetujui_menit) : null,
        catatan_realisasi:     body.catatan_realisasi?.trim() || null,
        updated_at:            new Date(),
      },
    })
    await writeAuditLog({ user: auth.user, action: "UPDATE", modelType: "overtime_requests", modelId: BigInt(id), dataLama: serialize(existing), dataBaru: serialize(data), ip: getClientIp(req) })
    return NextResponse.json(serialize(data))
  } catch { return NextResponse.json({ error: "Gagal memperbarui" }, { status: 500 }) }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(req, ["admin", "hrd", "atasan", "user", "operator"])
  if ("error" in auth) return auth.error
  try {
    const { id } = await params
    const existing = await prisma.overtime_requests.findUnique({ where: { id: BigInt(id) } })
    if (!existing) return NextResponse.json({ error: "Tidak ditemukan" }, { status: 404 })
    if ([STATUS_LEMBUR.APPROVED_HRD, STATUS_LEMBUR.REALIZED].includes(existing.status as never)) {
      return NextResponse.json({ error: "Gunakan Batalkan untuk lembur yang sudah disetujui HRD" }, { status: 422 })
    }
    const role = (auth.user.role ?? "user").toLowerCase()
    if (role !== "admin" && role !== "hrd") {
      const kId = auth.user.karyawan_id
      if (!kId || Number(existing.karyawan_id) !== kId) return NextResponse.json({ error: "Hanya bisa hapus milik sendiri" }, { status: 403 })
      if (!["draft", "submitted"].includes(existing.status)) return NextResponse.json({ error: "Gunakan Batalkan untuk yang sudah diproses" }, { status: 422 })
    }
    await prisma.overtime_requests.delete({ where: { id: BigInt(id) } })
    await writeAuditLog({ user: auth.user, action: "DELETE", modelType: "overtime_requests", modelId: BigInt(id), dataLama: serialize(existing), ip: getClientIp(req) })
    return NextResponse.json({ success: true })
  } catch { return NextResponse.json({ error: "Gagal menghapus" }, { status: 500 }) }
}

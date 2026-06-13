import { NextRequest, NextResponse } from "next/server"
import { prisma, serialize } from "@/lib/prisma"
import { requireMobileAuth } from "@/lib/mobile-auth"
import { STATUS_LEMBUR, STATUS_LEMBUR_LABELS, isJabatanAtasan } from "@/lib/lembur"

// GET /api/mobile/lembur/approval-pending — list lembur pending untuk atasan
export async function GET(req: NextRequest) {
  const auth = await requireMobileAuth(req)
  if ("error" in auth) return auth.error
  const karyawanId = auth.user.karyawan_id
  if (!karyawanId) return NextResponse.json({ error: "Tidak ada akses" }, { status: 403 })
  try {
    const k = await prisma.karyawans.findUnique({ where: { id: BigInt(karyawanId) }, select: { jabatan: true } })
    if (!k || !isJabatanAtasan(k.jabatan)) return NextResponse.json({ error: "Tidak memiliki hak approval" }, { status: 403 })

    const pendingApIds = await prisma.overtime_approvals.findMany({
      where: { approver_id: BigInt(karyawanId), approval_level: 1, status: "pending" },
      select: { id: true, overtime_request_id: true },
    })
    const overtimeIds = pendingApIds.map(a => a.overtime_request_id)
    const overtimes = await prisma.overtime_requests.findMany({
      where: { id: { in: overtimeIds }, status: STATUS_LEMBUR.SUBMITTED },
      include: { karyawans: { select: { id: true, nama_karyawan: true, jabatan: true, foto: true } }, overtime_settings: { select: { nama_setting: true, tipe_hari: true } } },
      orderBy: { submitted_at: "asc" },
    })
    const result = overtimes.map(o => ({
      overtime_id: o.id,
      karyawan: o.karyawans,
      tanggal_lembur: o.tanggal_lembur, jam_mulai_rencana: o.jam_mulai_rencana,
      jam_selesai_rencana: o.jam_selesai_rencana, durasi_rencana_menit: o.durasi_rencana_menit,
      alasan_lembur: o.alasan_lembur, pekerjaan_lembur: o.pekerjaan_lembur,
      is_lintas_hari: o.is_lintas_hari, tipe_hari: o.overtime_settings?.tipe_hari,
      status: o.status, status_label: STATUS_LEMBUR_LABELS[o.status as keyof typeof STATUS_LEMBUR_LABELS] ?? o.status,
      submitted_at: o.submitted_at,
    }))
    return NextResponse.json(serialize(result))
  } catch { return NextResponse.json({ error: "Server error" }, { status: 500 }) }
}

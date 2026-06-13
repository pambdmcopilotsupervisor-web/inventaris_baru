import { NextRequest, NextResponse } from "next/server"
import { prisma, serialize } from "@/lib/prisma"
import { requireMobileAuth } from "@/lib/mobile-auth"

/**
 * GET /api/mobile/lembur/approval-history
 * Riwayat approval lembur level 1 yang dilakukan oleh atasan langsung
 */
export async function GET(req: NextRequest) {
  const auth = await requireMobileAuth(req)
  if ("error" in auth) return auth.error

  const karyawanId = auth.user.karyawan_id
  if (!karyawanId) return NextResponse.json([])

  try {
    const approvalHistory = await prisma.overtime_approvals.findMany({
      where: {
        approval_level: 1,
        status: { in: ["approved", "rejected"] },
        approver_id: BigInt(karyawanId),
      },
      orderBy: { approved_at: "desc" },
      include: {
        overtime_requests: {
          select: {
            id: true,
            karyawan_id: true,
            tanggal_lembur: true,
            durasi_rencana_menit: true,
            alasan_lembur: true,
            pekerjaan_lembur: true,
            status: true,
            karyawans: { select: { nama_karyawan: true, nik: true } },
          },
        },
      },
    })

    const history = approvalHistory.map((approval) => ({
      id: approval.id,
      approval_id: approval.id,
      status: approval.status,
      note: approval.note,
      approved_at: approval.approved_at,
      pengajuan: {
        id: approval.overtime_requests.id,
        karyawan_nama: approval.overtime_requests.karyawans.nama_karyawan,
        karyawan_nip: approval.overtime_requests.karyawans.nik,
        tanggal_mulai: approval.overtime_requests.tanggal_lembur,
        durasi_jam: Math.round(approval.overtime_requests.durasi_rencana_menit / 60),
        keterangan: approval.overtime_requests.alasan_lembur,
        status: approval.overtime_requests.status,
      },
    }))

    return NextResponse.json(serialize(history))
  } catch (error) {
    console.error("[approval-history lembur] Error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

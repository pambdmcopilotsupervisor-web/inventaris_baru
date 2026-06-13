import { NextRequest, NextResponse } from "next/server"
import { prisma, serialize } from "@/lib/prisma"
import { requireMobileAuth } from "@/lib/mobile-auth"

/**
 * GET /api/mobile/cuti/approval-history
 * Riwayat approval cuti level 1 yang dilakukan oleh atasan langsung
 */
export async function GET(req: NextRequest) {
  const auth = await requireMobileAuth(req)
  if ("error" in auth) return auth.error

  const karyawanId = auth.user.karyawan_id
  if (!karyawanId) return NextResponse.json([])

  try {
    const approvalHistory = await prisma.leave_request_approvals.findMany({
      where: {
        approval_level: 1,
        status: { in: ["approved", "rejected"] },
        approver_id: BigInt(karyawanId),
      },
      orderBy: { approved_at: "desc" },
      include: {
        pengajuan_cutis: {
          select: {
            id: true,
            karyawan_id: true,
            tanggal_mulai: true,
            tanggal_selesai: true,
            jumlah_hari: true,
            alasan: true,
            status: true,
            jenis_cutis: { select: { nama_cuti: true } },
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
        id: approval.pengajuan_cutis.id,
        karyawan_nama: approval.pengajuan_cutis.karyawans.nama_karyawan,
        karyawan_nip: approval.pengajuan_cutis.karyawans.nik,
        tipe_cuti: approval.pengajuan_cutis.jenis_cutis?.nama_cuti || "Cuti",
        tanggal_mulai: approval.pengajuan_cutis.tanggal_mulai,
        tanggal_selesai: approval.pengajuan_cutis.tanggal_selesai,
        durasi_hari: approval.pengajuan_cutis.jumlah_hari,
        keterangan: approval.pengajuan_cutis.alasan,
        status: approval.pengajuan_cutis.status,
      },
    }))

    return NextResponse.json(serialize(history))
  } catch (error) {
    console.error("[approval-history cuti] Error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from "next/server"
import { prisma, serialize } from "@/lib/prisma"
import { requireMobileAuth } from "@/lib/mobile-auth"

/**
 * GET /api/mobile/sakit/approval-history
 * Riwayat approval sakit level 1 yang dilakukan oleh atasan langsung
 */
export async function GET(req: NextRequest) {
  const auth = await requireMobileAuth(req)
  if ("error" in auth) return auth.error

  const karyawanId = auth.user.karyawan_id
  if (!karyawanId) return NextResponse.json([])

  try {
    const approvalHistory = await prisma.sakit_approvals.findMany({
      where: {
        approval_level: 1,
        status: { in: ["approved", "rejected"] },
        approver_id: BigInt(karyawanId),
      },
      orderBy: { approved_at: "desc" },
      include: {
        pengajuan_sakits: {
          select: {
            id: true,
            karyawan_id: true,
            tanggal_mulai: true,
            tanggal_selesai: true,
            jumlah_hari: true,
            lampiran_path: true,
            status: true,
            keterangan_sakit: true,
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
        id: approval.pengajuan_sakits.id,
        karyawan_nama: approval.pengajuan_sakits.karyawans.nama_karyawan,
        karyawan_nip: approval.pengajuan_sakits.karyawans.nik,
        tanggal_mulai: approval.pengajuan_sakits.tanggal_mulai,
        tanggal_selesai: approval.pengajuan_sakits.tanggal_selesai,
        durasi_hari: approval.pengajuan_sakits.jumlah_hari,
        bukti_dokter: approval.pengajuan_sakits.lampiran_path,
        keterangan: approval.pengajuan_sakits.keterangan_sakit,
        status: approval.pengajuan_sakits.status,
      },
    }))

    return NextResponse.json(serialize(history))
  } catch (error) {
    console.error("[approval-history] Error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

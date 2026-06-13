import { NextRequest, NextResponse } from "next/server"
import { prisma, serialize } from "@/lib/prisma"
import { requireMobileAuth } from "@/lib/mobile-auth"

/**
 * GET /api/mobile/izin/approval-history
 * Riwayat approval izin level 1 yang dilakukan oleh atasan langsung
 */
export async function GET(req: NextRequest) {
  const auth = await requireMobileAuth(req)
  if ("error" in auth) return auth.error

  const karyawanId = auth.user.karyawan_id
  if (!karyawanId) return NextResponse.json([])

  try {
    const approvalHistory = await prisma.izin_approvals.findMany({
      where: {
        approval_level: 1,
        status: { in: ["approved", "rejected"] },
        approver_id: BigInt(karyawanId),
      },
      orderBy: { approved_at: "desc" },
      include: {
        pengajuan_izins: {
          select: {
            id: true,
            karyawan_id: true,
            tanggal_mulai: true,
            tanggal_selesai: true,
            durasi: true,
            satuan_durasi: true,
            alasan: true,
            status: true,
            jenis_izins: { select: { nama_izin: true } },
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
        id: approval.pengajuan_izins.id,
        karyawan_nama: approval.pengajuan_izins.karyawans.nama_karyawan,
        karyawan_nip: approval.pengajuan_izins.karyawans.nik,
        tipe_pengajuan: approval.pengajuan_izins.jenis_izins?.nama_izin || "Izin",
        tanggal_mulai: approval.pengajuan_izins.tanggal_mulai,
        tanggal_selesai: approval.pengajuan_izins.tanggal_selesai,
        durasi_hari: approval.pengajuan_izins.satuan_durasi === "hari" ? Number(approval.pengajuan_izins.durasi) : null,
        durasi_jam: approval.pengajuan_izins.satuan_durasi === "jam" ? Number(approval.pengajuan_izins.durasi) : null,
        keterangan: approval.pengajuan_izins.alasan,
        status: approval.pengajuan_izins.status,
      },
    }))

    return NextResponse.json(serialize(history))
  } catch (error) {
    console.error("[approval-history izin] Error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

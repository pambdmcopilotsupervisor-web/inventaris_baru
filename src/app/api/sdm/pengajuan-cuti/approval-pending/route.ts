import { NextRequest, NextResponse } from "next/server"
import { prisma, serialize } from "@/lib/prisma"
import { requireRole } from "@/lib/auth"
import { STATUS_CUTI, resolveAtasan, isJabatanAtasan } from "@/lib/leave"
import { isAdminRole, isHrdUser } from "@/lib/approval"

// GET /api/sdm/pengajuan-cuti/approval-pending
// Daftar pengajuan yang menunggu persetujuan user yang login
// Akses berdasarkan jabatan karyawan, bukan role user

export async function GET(req: NextRequest) {
  // Siapa pun yang sudah login bisa akses endpoint ini
  const auth = await requireRole(req, ["admin", "hrd", "atasan", "user", "operator"])
  if ("error" in auth) return auth.error
  try {
    const userRole    = auth.user.role ?? "user"
    const isAdmin     = isAdminRole(userRole)
    const karyawanId  = auth.user.karyawan_id

    // Tentukan apakah user ini adalah atasan berdasarkan jabatan karyawans
    let isAtasanByJabatan = false
    let loggedInKaryawan: { divisi_id: number | null; jabatan: string } | null = null

    if (karyawanId) {
      const k = await prisma.karyawans.findUnique({
        where: { id: BigInt(karyawanId) },
        select: { divisi_id: true, jabatan: true },
      })
      loggedInKaryawan = k
      if (k && isJabatanAtasan(k.jabatan)) {
        isAtasanByJabatan = true
      }
    }

    // Akses HRD level 2: admin ATAU Kepala Divisi di Divisi HRD
    const isHrd = isAdmin || await isHrdUser(karyawanId)

    // Tentukan status yang dicari berdasarkan hak akses
    let whereStatus: string[]
    if (isAdmin) {
      whereStatus = [STATUS_CUTI.SUBMITTED, STATUS_CUTI.APPROVED_SUPERVISOR]
    } else if (isHrd && isAtasanByJabatan) {
      // Kepala Divisi HRD → bisa approve level 1 DAN level 2
      whereStatus = [STATUS_CUTI.SUBMITTED, STATUS_CUTI.APPROVED_SUPERVISOR]
    } else if (isHrd) {
      // HRD saja → hanya antrian level 2
      whereStatus = [STATUS_CUTI.APPROVED_SUPERVISOR]
    } else if (isAtasanByJabatan || userRole === "atasan") {
      // Atasan biasa → hanya antrian level 1
      whereStatus = [STATUS_CUTI.SUBMITTED]
    } else {
      // User biasa tidak punya antrian approval
      return NextResponse.json([])
    }

    // Auto-fix: update approver_id yang masih null untuk approval level 1
    // Lakukan sebelum filtering agar approver_id tersedia untuk filter
    if (whereStatus.includes(STATUS_CUTI.SUBMITTED)) {
      const toFix = await prisma.pengajuan_cutis.findMany({
        where: { status: STATUS_CUTI.SUBMITTED },
        include: { approvals: { where: { approval_level: 1, status: "pending", approver_id: null } } },
      })
      for (const p of toFix) {
        for (const ap of p.approvals) {
          if (!ap.approver_id) {
            const { atasan } = await resolveAtasan(p.karyawan_id)
            if (atasan) {
              await prisma.leave_request_approvals.update({ where: { id: ap.id }, data: { approver_id: atasan.id, updated_at: new Date() } })
            }
          }
        }
      }
    }

    let pengajuans = await prisma.pengajuan_cutis.findMany({
      where: { status: { in: whereStatus } },
      orderBy: { created_at: "asc" },
      include: {
        karyawans:  { select: { id: true, nik: true, nama_karyawan: true, jabatan: true, divisi_id: true, subdivisi_id: true, atasan_id: true } },
        jenis_cutis: { select: { id: true, kode_cuti: true, nama_cuti: true } },
        approvals:  { orderBy: { approval_level: "asc" } },
      },
    })

    // Filter: untuk atasan, filter SUBMITTED berdasarkan divisi/approver_id
    // Untuk HRD, APPROVED_SUPERVISOR tampil semua (tidak difilter per divisi)
    if (!isAdmin && (isAtasanByJabatan || userRole === "atasan") && karyawanId) {
      // Ambil subdivisi yang milik divisi atasan ini
      const subDivisisDivisi = loggedInKaryawan?.divisi_id
        ? await prisma.subdivisis.findMany({
            where: { divisi_id: loggedInKaryawan.divisi_id },
            select: { id: true },
          })
        : []
      const subIds = new Set(subDivisisDivisi.map(s => Number(s.id)))

      pengajuans = pengajuans.filter(p => {
        const k = p.karyawans
        if (!k) return false
        // Jangan tampilkan pengajuan atasan itu sendiri
        if (Number(k.id) === karyawanId) return false

        // UTAMA: cek apakah user ini ter-assign sebagai approver di approval level 1
        const approvalL1 = p.approvals.find(a => a.approval_level === 1 && a.status === "pending")
        if (approvalL1 && approvalL1.approver_id && Number(approvalL1.approver_id) === karyawanId) return true

        // Fallback: cek via divisi/subdivisi
        if (k.atasan_id && Number(k.atasan_id) === karyawanId) return true
        if (k.divisi_id && loggedInKaryawan?.divisi_id && k.divisi_id === loggedInKaryawan.divisi_id) return true
        if (k.divisi_id === null && k.subdivisi_id !== null && subIds.has(Number(k.subdivisi_id))) return true

        return false
      })
      // Jika isHrd juga, tambahkan APPROVED_SUPERVISOR items yang tidak difilter per divisi
      if (isHrd) {
        const approvedSupervisorItems = await prisma.pengajuan_cutis.findMany({
          where: { status: STATUS_CUTI.APPROVED_SUPERVISOR },
          orderBy: { created_at: "asc" },
          include: {
            karyawans:  { select: { id: true, nik: true, nama_karyawan: true, jabatan: true, divisi_id: true, subdivisi_id: true, atasan_id: true } },
            jenis_cutis: { select: { id: true, kode_cuti: true, nama_cuti: true } },
            approvals:  { orderBy: { approval_level: "asc" } },
          },
        })
        // Merge, hindari duplikat
        const existingIds = new Set(pengajuans.map(p => Number(p.id)))
        for (const p of approvedSupervisorItems) {
          if (!existingIds.has(Number(p.id))) pengajuans.push(p)
        }
      }
    }

    return NextResponse.json(serialize(pengajuans))  } catch (err) {
    console.error("[approval-pending GET]", err)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}

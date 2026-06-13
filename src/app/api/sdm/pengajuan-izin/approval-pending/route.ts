import { NextRequest, NextResponse } from "next/server"
import { prisma, serialize } from "@/lib/prisma"
import { requireRole } from "@/lib/auth"
import { STATUS_IZIN, resolveAtasan, isJabatanAtasan } from "@/lib/izin"
import { isAdminRole, isHrdUser } from "@/lib/approval"

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, ["admin", "hrd", "atasan", "user", "operator"])
  if ("error" in auth) return auth.error
  try {
    const userRole   = (auth.user.role ?? "user").toLowerCase()
    const isAdmin    = isAdminRole(userRole)
    const karyawanId = auth.user.karyawan_id

    let isAtasanByJabatan = false
    let loggedInKaryawan: { divisi_id: number | null; jabatan: string } | null = null

    if (karyawanId) {
      const k = await prisma.karyawans.findUnique({ where: { id: BigInt(karyawanId) }, select: { divisi_id: true, jabatan: true } })
      loggedInKaryawan = k
      if (k && isJabatanAtasan(k.jabatan)) {
        isAtasanByJabatan = true
      }
    }

    const isHrd = isAdmin || await isHrdUser(karyawanId)

    let whereStatus: string[]
    if (isAdmin) {
      whereStatus = [STATUS_IZIN.SUBMITTED, STATUS_IZIN.APPROVED_SUPERVISOR]
    } else if (isHrd && isAtasanByJabatan) {
      whereStatus = [STATUS_IZIN.SUBMITTED, STATUS_IZIN.APPROVED_SUPERVISOR]
    } else if (isHrd) {
      whereStatus = [STATUS_IZIN.APPROVED_SUPERVISOR]
    } else if (isAtasanByJabatan || userRole === "atasan") {
      whereStatus = [STATUS_IZIN.SUBMITTED]
    } else {
      return NextResponse.json([])
    }

    // Auto-fix approver_id null
    if (whereStatus.includes(STATUS_IZIN.SUBMITTED)) {
      const toFix = await prisma.pengajuan_izins.findMany({
        where: { status: STATUS_IZIN.SUBMITTED },
        include: { izin_approvals: { where: { approval_level: 1, status: "pending", approver_id: null } } },
      })
      for (const p of toFix) {
        for (const ap of p.izin_approvals) {
          if (!ap.approver_id) {
            const { atasan } = await resolveAtasan(p.karyawan_id)
            if (atasan) await prisma.izin_approvals.update({ where: { id: ap.id }, data: { approver_id: atasan.id, updated_at: new Date() } })
          }
        }
      }
    }

    let pengajuans = await prisma.pengajuan_izins.findMany({
      where: { status: { in: whereStatus } },
      orderBy: { created_at: "asc" },
      include: {
        karyawans:  { select: { id: true, nik: true, nama_karyawan: true, jabatan: true, divisi_id: true, subdivisi_id: true, atasan_id: true } },
        jenis_izins: { select: { id: true, kode_izin: true, nama_izin: true, satuan: true } },
        izin_approvals: { orderBy: { approval_level: "asc" } },
      },
    })

    // Filter SUBMITTED per divisi/approver_id untuk atasan
    if (!isAdmin && (isAtasanByJabatan || userRole === "atasan") && karyawanId) {
      const subDivisis = loggedInKaryawan?.divisi_id
        ? await prisma.subdivisis.findMany({ where: { divisi_id: loggedInKaryawan.divisi_id }, select: { id: true } })
        : []
      const subIds = new Set(subDivisis.map(s => Number(s.id)))

      pengajuans = pengajuans.filter(p => {
        const k = p.karyawans
        if (!k || Number(k.id) === karyawanId) return false

        // Izin approved_supervisor tampil semua untuk HRD
        if (isHrd && p.status === STATUS_IZIN.APPROVED_SUPERVISOR) return true

        // Untuk SUBMITTED: filter per divisi
        const ap1 = p.izin_approvals.find(a => a.approval_level === 1 && a.status === "pending")
        if (ap1 && ap1.approver_id && Number(ap1.approver_id) === karyawanId) return true
        if (k.atasan_id && Number(k.atasan_id) === karyawanId) return true
        if (k.divisi_id && loggedInKaryawan?.divisi_id && k.divisi_id === loggedInKaryawan.divisi_id) return true
        if (k.divisi_id === null && k.subdivisi_id !== null && subIds.has(Number(k.subdivisi_id))) return true
        return false
      })

      // Tambahkan APPROVED_SUPERVISOR jika isHrd
      if (isHrd) {
        const approvedItems = await prisma.pengajuan_izins.findMany({
          where: { status: STATUS_IZIN.APPROVED_SUPERVISOR },
          orderBy: { created_at: "asc" },
          include: {
            karyawans:  { select: { id: true, nik: true, nama_karyawan: true, jabatan: true, divisi_id: true, subdivisi_id: true, atasan_id: true } },
            jenis_izins: { select: { id: true, kode_izin: true, nama_izin: true, satuan: true } },
            izin_approvals: { orderBy: { approval_level: "asc" } },
          },
        })
        const existingIds = new Set(pengajuans.map(p => Number(p.id)))
        for (const p of approvedItems) {
          if (!existingIds.has(Number(p.id))) pengajuans.push(p)
        }
      }
    }

    return NextResponse.json(serialize(pengajuans))
  } catch (err) {
    console.error("[approval-pending izin]", err)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from "next/server"
import { prisma, serialize } from "@/lib/prisma"
import { requireRole } from "@/lib/auth"
import { STATUS_LEMBUR, resolveAtasan, isJabatanAtasan } from "@/lib/lembur"
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
      whereStatus = [STATUS_LEMBUR.SUBMITTED, STATUS_LEMBUR.APPROVED_SUPERVISOR]
    } else if (isHrd && isAtasanByJabatan) {
      whereStatus = [STATUS_LEMBUR.SUBMITTED, STATUS_LEMBUR.APPROVED_SUPERVISOR]
    } else if (isHrd) {
      whereStatus = [STATUS_LEMBUR.APPROVED_SUPERVISOR]
    } else if (isAtasanByJabatan || userRole === "atasan") {
      whereStatus = [STATUS_LEMBUR.SUBMITTED]
    } else {
      return NextResponse.json([])
    }

    // Auto-fix approver_id null
    if (whereStatus.includes(STATUS_LEMBUR.SUBMITTED)) {
      const toFix = await prisma.overtime_requests.findMany({
        where: { status: STATUS_LEMBUR.SUBMITTED },
        include: { overtime_approvals: { where: { approval_level: 1, status: "pending", approver_id: null } } },
      })
      for (const p of toFix) {
        for (const ap of p.overtime_approvals) {
          if (!ap.approver_id) {
            const { atasan } = await resolveAtasan(p.karyawan_id)
            if (atasan) await prisma.overtime_approvals.update({ where: { id: ap.id }, data: { approver_id: atasan.id, updated_at: new Date() } })
          }
        }
      }
    }

    let overtimes = await prisma.overtime_requests.findMany({
      where: { status: { in: whereStatus } },
      orderBy: { tanggal_lembur: "asc" },
      include: {
        karyawans:          { select: { id: true, nik: true, nama_karyawan: true, jabatan: true, divisi_id: true, subdivisi_id: true, atasan_id: true } },
        overtime_settings:  { select: { id: true, nama_setting: true, tipe_hari: true } },
        overtime_approvals: { orderBy: { approval_level: "asc" } },
      },
    })

    // Filter SUBMITTED per divisi untuk atasan
    if (!isAdmin && (isAtasanByJabatan || userRole === "atasan") && karyawanId) {
      const subDivisis = loggedInKaryawan?.divisi_id
        ? await prisma.subdivisis.findMany({ where: { divisi_id: loggedInKaryawan.divisi_id }, select: { id: true } })
        : []
      const subIds = new Set(subDivisis.map(s => Number(s.id)))

      overtimes = overtimes.filter(p => {
        const k = p.karyawans
        if (!k || Number(k.id) === karyawanId) return false
        if (isHrd && p.status === STATUS_LEMBUR.APPROVED_SUPERVISOR) return true
        const ap1 = p.overtime_approvals.find(a => a.approval_level === 1 && a.status === "pending")
        if (ap1 && ap1.approver_id && Number(ap1.approver_id) === karyawanId) return true
        if (k.atasan_id && Number(k.atasan_id) === karyawanId) return true
        if (k.divisi_id && loggedInKaryawan?.divisi_id && k.divisi_id === loggedInKaryawan.divisi_id) return true
        if (k.divisi_id === null && k.subdivisi_id !== null && subIds.has(Number(k.subdivisi_id))) return true
        return false
      })

      if (isHrd) {
        const approvedItems = await prisma.overtime_requests.findMany({
          where: { status: STATUS_LEMBUR.APPROVED_SUPERVISOR },
          orderBy: { tanggal_lembur: "asc" },
          include: {
            karyawans:          { select: { id: true, nik: true, nama_karyawan: true, jabatan: true, divisi_id: true, subdivisi_id: true, atasan_id: true } },
            overtime_settings:  { select: { id: true, nama_setting: true, tipe_hari: true } },
            overtime_approvals: { orderBy: { approval_level: "asc" } },
          },
        })
        const existingIds = new Set(overtimes.map(p => Number(p.id)))
        for (const p of approvedItems) {
          if (!existingIds.has(Number(p.id))) overtimes.push(p)
        }
      }
    }

    return NextResponse.json(serialize(overtimes))
  } catch (err) {
    console.error("[approval-pending overtime]", err)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}

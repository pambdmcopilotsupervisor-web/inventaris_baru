import { NextRequest, NextResponse } from "next/server"
import { prisma, serialize } from "@/lib/prisma"
import { requireRole } from "@/lib/auth"
import { STATUS_SAKIT, resolveAtasan, isJabatanAtasan } from "@/lib/sakit"
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
      whereStatus = [STATUS_SAKIT.SUBMITTED, STATUS_SAKIT.APPROVED_SUPERVISOR]
    } else if (isHrd && isAtasanByJabatan) {
      whereStatus = [STATUS_SAKIT.SUBMITTED, STATUS_SAKIT.APPROVED_SUPERVISOR]
    } else if (isHrd) {
      whereStatus = [STATUS_SAKIT.APPROVED_SUPERVISOR]
    } else if (isAtasanByJabatan || userRole === "atasan") {
      whereStatus = [STATUS_SAKIT.SUBMITTED]
    } else {
      return NextResponse.json([])
    }

    // Auto-fix approver_id null
    if (whereStatus.includes(STATUS_SAKIT.SUBMITTED)) {
      const toFix = await prisma.pengajuan_sakits.findMany({
        where: { status: STATUS_SAKIT.SUBMITTED },
        include: { sakit_approvals: { where: { approval_level: 1, status: "pending", approver_id: null } } },
      })
      for (const p of toFix) {
        for (const ap of p.sakit_approvals) {
          if (!ap.approver_id) {
            const { atasan } = await resolveAtasan(p.karyawan_id)
            if (atasan) await prisma.sakit_approvals.update({ where: { id: ap.id }, data: { approver_id: atasan.id, updated_at: new Date() } })
          }
        }
      }
    }

    let pengajuans = await prisma.pengajuan_sakits.findMany({
      where: { status: { in: whereStatus } },
      orderBy: { created_at: "asc" },
      include: {
        karyawans:       { select: { id: true, nik: true, nama_karyawan: true, jabatan: true, divisi_id: true, subdivisi_id: true, atasan_id: true } },
        sakit_approvals: { orderBy: { approval_level: "asc" } },
      },
    })

    // Filter SUBMITTED per divisi untuk atasan
    if (!isAdmin && (isAtasanByJabatan || userRole === "atasan") && karyawanId) {
      const subDivisis = loggedInKaryawan?.divisi_id
        ? await prisma.subdivisis.findMany({ where: { divisi_id: loggedInKaryawan.divisi_id }, select: { id: true } })
        : []
      const subIds = new Set(subDivisis.map(s => Number(s.id)))

      pengajuans = pengajuans.filter(p => {
        const k = p.karyawans
        if (!k || Number(k.id) === karyawanId) return false
        if (isHrd && p.status === STATUS_SAKIT.APPROVED_SUPERVISOR) return true
        const ap1 = p.sakit_approvals.find(a => a.approval_level === 1 && a.status === "pending")
        if (ap1 && ap1.approver_id && Number(ap1.approver_id) === karyawanId) return true
        if (k.atasan_id && Number(k.atasan_id) === karyawanId) return true
        if (k.divisi_id && loggedInKaryawan?.divisi_id && k.divisi_id === loggedInKaryawan.divisi_id) return true
        if (k.divisi_id === null && k.subdivisi_id !== null && subIds.has(Number(k.subdivisi_id))) return true
        return false
      })

      if (isHrd) {
        const approvedItems = await prisma.pengajuan_sakits.findMany({
          where: { status: STATUS_SAKIT.APPROVED_SUPERVISOR },
          orderBy: { created_at: "asc" },
          include: {
            karyawans:       { select: { id: true, nik: true, nama_karyawan: true, jabatan: true, divisi_id: true, subdivisi_id: true, atasan_id: true } },
            sakit_approvals: { orderBy: { approval_level: "asc" } },
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
    console.error("[approval-pending sakit]", err)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}

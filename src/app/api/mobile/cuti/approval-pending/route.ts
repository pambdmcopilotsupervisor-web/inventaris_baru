import { NextRequest, NextResponse } from "next/server"
import { prisma, serialize } from "@/lib/prisma"
import { requireMobileAuth } from "@/lib/mobile-auth"
import { isJabatanAtasan, STATUS_CUTI } from "@/lib/leave"
import { enrichSakitApprovals } from "@/lib/sakit"
import { resolveAtasan } from "@/lib/leave"

// GET /api/mobile/cuti/approval-pending
// Daftar cuti yang menunggu approval level 1 dari atasan yang login

export async function GET(req: NextRequest) {
  const auth = await requireMobileAuth(req)
  if ("error" in auth) return auth.error

  const karyawanId = auth.user.karyawan_id
  if (!karyawanId) return NextResponse.json([])

  try {
    // Cek apakah user adalah atasan berdasarkan jabatan
    const k = await prisma.karyawans.findUnique({
      where: { id: BigInt(karyawanId) },
      select: { jabatan: true, divisi_id: true, subdivisi_id: true },
    })
    if (!k || !isJabatanAtasan(k.jabatan)) return NextResponse.json([])

    // Auto-fix approver_id null untuk submitted items
    const toFix = await prisma.pengajuan_cutis.findMany({
      where: { status: STATUS_CUTI.SUBMITTED },
      include: { approvals: { where: { approval_level: 1, status: "pending", approver_id: null } } },
    })
    for (const p of toFix) {
      for (const ap of p.approvals) {
        if (!ap.approver_id) {
          const { atasan } = await resolveAtasan(p.karyawan_id)
          if (atasan) await prisma.leave_request_approvals.update({ where: { id: ap.id }, data: { approver_id: atasan.id, updated_at: new Date() } })
        }
      }
    }

    // Ambil pengajuan yang menunggu approval level 1
    let pengajuans = await prisma.pengajuan_cutis.findMany({
      where: { status: STATUS_CUTI.SUBMITTED },
      orderBy: { created_at: "asc" },
      include: {
        karyawans:  { select: { id: true, nik: true, nama_karyawan: true, jabatan: true, divisi_id: true, subdivisi_id: true, atasan_id: true } },
        jenis_cutis: { select: { id: true, kode_cuti: true, nama_cuti: true } },
        approvals:  { orderBy: { approval_level: "asc" } },
      },
    })

    // Filter berdasarkan divisi/atasan_id
    const subDivisis = k.divisi_id
      ? await prisma.subdivisis.findMany({ where: { divisi_id: k.divisi_id }, select: { id: true } })
      : []
    const subIds = new Set(subDivisis.map(s => Number(s.id)))

    pengajuans = pengajuans.filter(p => {
      const emp = p.karyawans
      if (!emp || Number(emp.id) === karyawanId) return false
      const ap1 = p.approvals.find(a => a.approval_level === 1 && a.status === "pending")
      if (ap1 && ap1.approver_id && Number(ap1.approver_id) === karyawanId) return true
      if (emp.atasan_id && Number(emp.atasan_id) === karyawanId) return true
      if (emp.divisi_id && k.divisi_id && emp.divisi_id === k.divisi_id) return true
      if (emp.divisi_id === null && emp.subdivisi_id !== null && subIds.has(Number(emp.subdivisi_id))) return true
      return false
    })

    return NextResponse.json(serialize(pengajuans))
  } catch (err) {
    console.error("[mobile cuti approval-pending]", err)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}

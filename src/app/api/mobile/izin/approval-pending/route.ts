import { NextRequest, NextResponse } from "next/server"
import { prisma, serialize } from "@/lib/prisma"
import { requireMobileAuth } from "@/lib/mobile-auth"
import { isJabatanAtasan, STATUS_IZIN } from "@/lib/izin"
import { resolveAtasan } from "@/lib/leave"

// GET /api/mobile/izin/approval-pending
// Daftar izin yang menunggu approval level 1 dari atasan yang login
export async function GET(req: NextRequest) {
  const auth = await requireMobileAuth(req)
  if ("error" in auth) return auth.error

  const karyawanId = auth.user.karyawan_id
  if (!karyawanId) return NextResponse.json([])

  try {
    const k = await prisma.karyawans.findUnique({
      where: { id: BigInt(karyawanId) },
      select: { jabatan: true, divisi_id: true, subdivisi_id: true },
    })
    if (!k || !isJabatanAtasan(k.jabatan)) return NextResponse.json([])

    const toFix = await prisma.pengajuan_izins.findMany({
      where: { status: STATUS_IZIN.SUBMITTED },
      include: {
        izin_approvals: {
          where: { approval_level: 1, status: "pending", approver_id: null },
        },
      },
    })

    for (const p of toFix) {
      for (const ap of p.izin_approvals) {
        if (!ap.approver_id) {
          const { atasan } = await resolveAtasan(p.karyawan_id)
          if (atasan) {
            await prisma.izin_approvals.update({
              where: { id: ap.id },
              data: { approver_id: atasan.id, updated_at: new Date() },
            })
          }
        }
      }
    }

    let pengajuans = await prisma.pengajuan_izins.findMany({
      where: { status: STATUS_IZIN.SUBMITTED },
      orderBy: { created_at: "asc" },
      include: {
        karyawans: {
          select: {
            id: true,
            nik: true,
            nama_karyawan: true,
            jabatan: true,
            divisi_id: true,
            subdivisi_id: true,
            atasan_id: true,
          },
        },
        jenis_izins: { select: { id: true, kode_izin: true, nama_izin: true, satuan: true } },
        izin_approvals: { orderBy: { approval_level: "asc" } },
      },
    })

    const subDivisis = k.divisi_id
      ? await prisma.subdivisis.findMany({ where: { divisi_id: k.divisi_id }, select: { id: true } })
      : []
    const subIds = new Set(subDivisis.map((s) => Number(s.id)))

    pengajuans = pengajuans.filter((p) => {
      const emp = p.karyawans
      if (!emp || Number(emp.id) === karyawanId) return false

      const ap1 = p.izin_approvals.find((a) => a.approval_level === 1 && a.status === "pending")
      if (ap1 && ap1.approver_id && Number(ap1.approver_id) === karyawanId) return true
      if (emp.atasan_id && Number(emp.atasan_id) === karyawanId) return true
      if (emp.divisi_id && k.divisi_id && emp.divisi_id === k.divisi_id) return true
      if (emp.divisi_id === null && emp.subdivisi_id !== null && subIds.has(Number(emp.subdivisi_id))) return true
      return false
    })

    return NextResponse.json(serialize(pengajuans))
  } catch (err) {
    console.error("[mobile izin approval-pending]", err)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}

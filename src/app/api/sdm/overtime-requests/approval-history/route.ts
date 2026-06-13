import { NextRequest, NextResponse } from "next/server"
import { prisma, serialize } from "@/lib/prisma"
import { requireRole } from "@/lib/auth"
import { isAdminRole, isHrdUser } from "@/lib/approval"
import { isJabatanAtasan } from "@/lib/lembur"

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, ["admin", "hrd", "atasan", "user", "operator"])
  if ("error" in auth) return auth.error

  try {
    const role = auth.user.role ?? "user"
    const userId = BigInt(auth.user.id)
    const karyawanId = auth.user.karyawan_id
    const isAdmin = isAdminRole(role)
    const isHrd = isAdmin || await isHrdUser(karyawanId)

    let isAtasan = role.toLowerCase() === "atasan"
    if (karyawanId) {
      const k = await prisma.karyawans.findUnique({ where: { id: BigInt(karyawanId) }, select: { jabatan: true } })
      if (k && isJabatanAtasan(k.jabatan)) isAtasan = true
    }
    if (!isAdmin && !isHrd && !isAtasan) return NextResponse.json([])

    const levelConditions = []
    if (isAdmin) levelConditions.push({ approval_level: { in: [1, 2] } })
    else {
      if (isHrd) levelConditions.push({ approval_level: 2 })
      if (isAtasan && karyawanId) levelConditions.push({ approval_level: 1, OR: [{ approver_id: BigInt(karyawanId) }, { approver_user_id: userId }] })
    }

    const approvals = await prisma.overtime_approvals.findMany({
      where: { status: "approved", OR: levelConditions },
      orderBy: [{ approved_at: "desc" }, { updated_at: "desc" }],
      take: 100,
      include: {
        overtime_requests: {
          include: {
            karyawans: { select: { id: true, nik: true, nama_karyawan: true, jabatan: true } },
            overtime_settings: { select: { id: true, nama_setting: true, tipe_hari: true } },
            overtime_approvals: { orderBy: { approval_level: "asc" } },
          },
        },
      },
    })

    const userIds = approvals.map(a => a.approver_user_id).filter((id): id is bigint => id != null)
    const users = userIds.length ? await prisma.users.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } }) : []
    const userMap = new Map(users.map(u => [u.id.toString(), u.name]))
    const data = approvals.map(a => ({
      ...a.overtime_requests,
      approval_history: { id: a.id, approval_level: a.approval_level, approver_role: a.approver_role, status: a.status, note: a.note, approved_at: a.approved_at, approver_user_id: a.approver_user_id, diproses_oleh_nama: a.approver_user_id ? userMap.get(a.approver_user_id.toString()) ?? null : null },
    }))

    return NextResponse.json(serialize(data))
  } catch (err) {
    console.error("[approval-history lembur]", err)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}

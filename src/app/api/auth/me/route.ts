import { NextResponse } from "next/server"
import { getSession } from "@/lib/session"
import { prisma } from "@/lib/prisma"

export async function GET() {
  try {
    const session = await getSession()
    if (!session.user) {
      return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 })
    }

    if (!session.user.karyawan_id) return NextResponse.json(session.user)

    const karyawan = await prisma.karyawans.findUnique({
      where: { id: BigInt(session.user.karyawan_id) },
      select: { jabatan: true, nama_karyawan: true, divisi_id: true },
    })
    const divisi = karyawan?.divisi_id
      ? await prisma.divisis.findUnique({ where: { id: BigInt(karyawan.divisi_id) }, select: { nama_divisi: true } })
      : null

    return NextResponse.json({
      ...session.user,
      jabatan: karyawan?.jabatan ?? session.user.jabatan,
      nama_karyawan: karyawan?.nama_karyawan ?? session.user.nama_karyawan,
      divisi_id: karyawan?.divisi_id ?? null,
      nama_divisi: divisi?.nama_divisi ?? null,
      allowed_menus: session.user.allowed_menus ?? null,
    })
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}

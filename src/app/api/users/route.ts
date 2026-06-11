import { NextRequest, NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { prisma, serialize } from "@/lib/prisma"

export async function GET() {
  try {
    const users = await prisma.users.findMany({
      select: { id: true, name: true, email: true, role: true, karyawan_id: true, created_at: true },
      orderBy: { name: "asc" },
    })

    // Enrichment: nama karyawan
    const karyawans = await prisma.karyawans.findMany({ select: { id: true, nama_karyawan: true, jabatan: true } })
    const kMap = new Map(karyawans.map(k => [Number(k.id), k]))

    const enriched = users.map(u => ({
      ...u,
      nama_karyawan: u.karyawan_id ? kMap.get(u.karyawan_id)?.nama_karyawan ?? null : null,
      jabatan:       u.karyawan_id ? kMap.get(u.karyawan_id)?.jabatan       ?? null : null,
    }))

    return NextResponse.json(serialize(enriched))
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { name, email, password, role, karyawan_id } = body

    if (!name || !email || !password || !role) {
      return NextResponse.json({ error: "Field wajib tidak lengkap" }, { status: 400 })
    }

    // Hash password dengan bcrypt (kompatibel dengan Laravel)
    const hashedPassword = await bcrypt.hash(password, 12)

    const user = await prisma.users.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role,
        karyawan_id: karyawan_id ? Number(karyawan_id) : null,
      },
    })

    return NextResponse.json(serialize({ id: user.id, name: user.name, email: user.email, role: user.role }), { status: 201 })
  } catch (err: any) {
    if (err.code === "P2002") return NextResponse.json({ error: "Email sudah terdaftar" }, { status: 400 })
    return NextResponse.json({ error: "Gagal menyimpan" }, { status: 500 })
  }
}

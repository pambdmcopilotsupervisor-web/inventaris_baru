import { NextRequest, NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { prisma, serialize } from "@/lib/prisma"

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json()
    const { name, email, password, role, karyawan_id } = body

    const updateData: Record<string, unknown> = { name, email, role, karyawan_id: karyawan_id ? Number(karyawan_id) : null }

    // Hanya update password jika diisi
    if (password && password.trim()) {
      updateData.password = await bcrypt.hash(password, 12)
    }

    const updated = await prisma.users.update({ where: { id: BigInt(id) }, data: updateData })
    return NextResponse.json(serialize({ id: updated.id, name: updated.name, email: updated.email, role: updated.role }))
  } catch {
    return NextResponse.json({ error: "Gagal memperbarui" }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    await prisma.users.delete({ where: { id: BigInt(id) } })
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: "Gagal menghapus" }, { status: 500 })
  }
}

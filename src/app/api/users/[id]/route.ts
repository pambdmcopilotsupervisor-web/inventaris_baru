import { NextRequest, NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { prisma, serialize } from "@/lib/prisma"

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json()
    const { name, email, password, role, karyawan_id } = body

    const updateData: Record<string, unknown> = { name, email, role, karyawan_id: karyawan_id ? Number(karyawan_id) : null }

    // Hanya update password_baru jika password diisi (tidak menyentuh password lama pedami)
    if (password && password.trim()) {
      const hashed = await bcrypt.hash(password, 12)
      // Coba update password_baru; jika kolom belum ada (migration belum jalan), update password biasa
      try {
        updateData.password_baru = hashed
        const updated = await prisma.users.update({ where: { id: BigInt(id) }, data: updateData })
        return NextResponse.json(serialize({ id: updated.id, name: updated.name, email: updated.email, role: updated.role }))
      } catch (err: any) {
        if (err?.message?.includes("password_baru") || err?.code === "P2009") {
          // Kolom belum ada, fallback ke password lama
          delete updateData.password_baru
          updateData.password = hashed
        } else throw err
      }
    }

    const updated = await prisma.users.update({ where: { id: BigInt(id) }, data: updateData })
    return NextResponse.json(serialize({ id: updated.id, name: updated.name, email: updated.email, role: updated.role }))
  } catch (err: unknown) {
    console.error("[users PUT]", err)
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes("Unique") || (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "P2002")) {
      return NextResponse.json({ error: "Email sudah digunakan oleh user lain" }, { status: 409 })
    }
    return NextResponse.json({ error: `Gagal memperbarui: ${msg}` }, { status: 500 })
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

import { NextRequest, NextResponse } from "next/server"
import { prisma, serialize } from "@/lib/prisma"

// Pedami tidak punya edit untuk mutasi R2R4 — hanya delete
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    await prisma.mutasi_r2r4s.delete({ where: { id: BigInt(id) } })
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: "Gagal menghapus" }, { status: 500 })
  }
}

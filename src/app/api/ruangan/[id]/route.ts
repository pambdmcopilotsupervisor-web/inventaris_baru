import { NextRequest, NextResponse } from "next/server"
import { prisma, serialize } from "@/lib/prisma"
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { const { id } = await params; const body = await req.json(); const data = await prisma.ruangans.update({ where: { id: BigInt(id) }, data: body }); return NextResponse.json(serialize(data)) } catch { return NextResponse.json({ error: "Gagal" }, { status: 500 }) }
}
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { const { id } = await params; await prisma.ruangans.delete({ where: { id: BigInt(id) } }); return NextResponse.json({ success: true }) } catch { return NextResponse.json({ error: "Gagal" }, { status: 500 }) }
}

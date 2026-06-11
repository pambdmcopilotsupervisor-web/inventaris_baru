import { NextRequest, NextResponse } from "next/server"
import { prisma, serialize } from "@/lib/prisma"
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { const { id } = await params; const data = await prisma.data_r2r4s.findUnique({ where: { id: BigInt(id) } }); if (!data) return NextResponse.json({ error: "Tidak ditemukan" }, { status: 404 }); return NextResponse.json(serialize(data)) } catch { return NextResponse.json({ error: "Server error" }, { status: 500 }) }
}
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { const { id } = await params; const body = await req.json(); const data = await prisma.data_r2r4s.update({ where: { id: BigInt(id) }, data: body }); return NextResponse.json(serialize(data)) } catch { return NextResponse.json({ error: "Gagal" }, { status: 500 }) }
}
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { const { id } = await params; await prisma.data_r2r4s.delete({ where: { id: BigInt(id) } }); return NextResponse.json({ success: true }) } catch { return NextResponse.json({ error: "Gagal" }, { status: 500 }) }
}

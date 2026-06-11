import { NextRequest, NextResponse } from "next/server"
import { prisma, serialize } from "@/lib/prisma"
export async function GET() {
  try { const data = await prisma.ruangans.findMany({ orderBy: { ruangan: "asc" } }); return NextResponse.json(serialize(data)) } catch { return NextResponse.json({ error: "Server error" }, { status: 500 }) }
}
export async function POST(req: NextRequest) {
  try { const body = await req.json(); const data = await prisma.ruangans.create({ data: body }); return NextResponse.json(serialize(data), { status: 201 }) } catch { return NextResponse.json({ error: "Gagal menyimpan" }, { status: 500 }) }
}

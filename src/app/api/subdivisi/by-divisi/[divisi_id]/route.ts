import { NextRequest, NextResponse } from "next/server"
import { prisma, serialize } from "@/lib/prisma"

export async function GET(_req: NextRequest, { params }: { params: Promise<{ divisi_id: string }> }) {
  try {
    const { divisi_id } = await params
    const data = await prisma.subdivisis.findMany({
      where: { divisi_id: Number(divisi_id) },
      orderBy: { nama_sub: "asc" },
    })
    return NextResponse.json(serialize(data))
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}

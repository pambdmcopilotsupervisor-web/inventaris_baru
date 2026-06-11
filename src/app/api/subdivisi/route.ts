import { NextRequest, NextResponse } from "next/server"
import { prisma, serialize } from "@/lib/prisma"

export async function GET() {
  try {
    const subdivisis = await prisma.subdivisis.findMany({ orderBy: { kode_sub: "asc" } })
    const divisis    = await prisma.divisis.findMany({ select: { id: true, nama_divisi: true, kode_divisi: true } })
    const dMap = new Map(divisis.map(d => [Number(d.id), d]))

    const enriched = subdivisis.map(s => ({
      ...s,
      nama_divisi:  dMap.get(s.divisi_id)?.nama_divisi  ?? "—",
      kode_divisi:  dMap.get(s.divisi_id)?.kode_divisi  ?? "—",
    }))

    return NextResponse.json(serialize(enriched))
  } catch { return NextResponse.json({ error: "Server error" }, { status: 500 }) }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { nama_sub, divisi_id } = body
    if (!nama_sub || !divisi_id) return NextResponse.json({ error: "Field wajib tidak lengkap" }, { status: 400 })

    // Auto-generate kode_sub (format: KS001, KS002, ...)
    const last = await prisma.subdivisis.findFirst({ orderBy: { kode_sub: "desc" } })
    const nextNum = last ? parseInt(last.kode_sub.slice(2)) + 1 : 1
    const kode_sub = `KS${String(nextNum).padStart(3, "0")}`

    const data = await prisma.subdivisis.create({ data: { kode_sub, nama_sub, divisi_id: Number(divisi_id) } })
    return NextResponse.json(serialize(data), { status: 201 })
  } catch { return NextResponse.json({ error: "Gagal menyimpan" }, { status: 500 }) }
}

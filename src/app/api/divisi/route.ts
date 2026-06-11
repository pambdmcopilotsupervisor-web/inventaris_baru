import { NextRequest, NextResponse } from "next/server"
import { prisma, serialize } from "@/lib/prisma"

export async function GET() {
  try {
    const data = await prisma.divisis.findMany({ orderBy: { kode_divisi: "asc" } })
    return NextResponse.json(serialize(data))
  } catch { return NextResponse.json({ error: "Server error" }, { status: 500 }) }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { nama_divisi } = body
    if (!nama_divisi) return NextResponse.json({ error: "Nama divisi wajib diisi" }, { status: 400 })

    // Auto-generate kode_divisi (format: KD001, KD002, ...)
    const last = await prisma.divisis.findFirst({ orderBy: { kode_divisi: "desc" } })
    const nextNum = last ? parseInt(last.kode_divisi.slice(2)) + 1 : 1
    const kode_divisi = `KD${String(nextNum).padStart(3, "0")}`

    const data = await prisma.divisis.create({ data: { kode_divisi, nama_divisi } })
    return NextResponse.json(serialize(data), { status: 201 })
  } catch { return NextResponse.json({ error: "Gagal menyimpan" }, { status: 500 }) }
}

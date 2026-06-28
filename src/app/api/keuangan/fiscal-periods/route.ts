import { NextRequest, NextResponse } from "next/server"
import { requireRole, type AppRole } from "@/lib/auth"
import { prisma, serialize } from "@/lib/prisma"

export const runtime = "nodejs"

const ALLOWED: AppRole[] = ["admin", "keuangan"]

// GET /api/keuangan/fiscal-periods
export async function GET(req: NextRequest) {
  const auth = await requireRole(req, ALLOWED)
  if ("error" in auth) return auth.error

  const rows = await prisma.keu_periode_fiskal.findMany({
    orderBy: [{ tahun: "desc" }, { bulan: "desc" }],
  })
  return NextResponse.json(serialize(rows))
}

// POST /api/keuangan/fiscal-periods
export async function POST(req: NextRequest) {
  const auth = await requireRole(req, ALLOWED)
  if ("error" in auth) return auth.error

  const body = await req.json()
  const { tahun, bulan, catatan } = body

  if (!tahun || !bulan) {
    return NextResponse.json({ error: "Field wajib: tahun, bulan" }, { status: 400 })
  }
  if (bulan < 1 || bulan > 12) {
    return NextResponse.json({ error: "Bulan tidak valid (1-12)" }, { status: 400 })
  }

  const MONTHS = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"]

  const tgl_mulai = new Date(Date.UTC(tahun, bulan - 1, 1))
  const tgl_selesai = new Date(Date.UTC(tahun, bulan, 0))

  const row = await prisma.keu_periode_fiskal.create({
    data: {
      tahun: Number(tahun),
      bulan: Number(bulan),
      nama: `${MONTHS[bulan - 1]} ${tahun}`,
      tgl_mulai,
      tgl_selesai,
      status: "BUKA",
      catatan: catatan ?? null,
      created_at: new Date(),
      updated_at: new Date(),
    },
  })
  return NextResponse.json(serialize(row), { status: 201 })
}

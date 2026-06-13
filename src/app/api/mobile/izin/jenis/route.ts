import { NextRequest, NextResponse } from "next/server"
import { prisma, serialize } from "@/lib/prisma"
import { requireMobileAuth } from "@/lib/mobile-auth"

// GET /api/mobile/izin/jenis
// List semua jenis izin yang aktif

export async function GET(req: NextRequest) {
  const auth = await requireMobileAuth(req)
  if ("error" in auth) return auth.error

  try {
    const data = await prisma.jenis_izins.findMany({
      where: { status: "aktif" },
      orderBy: { nama_izin: "asc" },
      select: { id: true, kode_izin: true, nama_izin: true, satuan: true, maksimal_durasi: true, membutuhkan_lampiran: true },
    })
    return NextResponse.json(serialize(data))
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}

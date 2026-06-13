import { NextRequest, NextResponse } from "next/server"
import { prisma, serialize } from "@/lib/prisma"
import { requireMobileAuth } from "@/lib/mobile-auth"

// GET /api/mobile/cuti/jenis
// List semua jenis cuti yang aktif

export async function GET(req: NextRequest) {
  const auth = await requireMobileAuth(req)
  if ("error" in auth) return auth.error

  try {
    const data = await prisma.jenis_cutis.findMany({
      where: { status: "aktif" },
      orderBy: { nama_cuti: "asc" },
      select: { id: true, kode_cuti: true, nama_cuti: true, jatah_hari_default: true, membutuhkan_lampiran: true },
    })
    return NextResponse.json(serialize(data))
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}

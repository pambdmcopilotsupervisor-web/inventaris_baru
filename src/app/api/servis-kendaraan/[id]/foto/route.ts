import { NextRequest, NextResponse } from "next/server"
import { requireSession } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { readServiceBuktiFile } from "@/lib/service-bukti-file"

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSession(req)
  if ("error" in auth) return auth.error

  try {
    const { id } = await params
    const record = await prisma.riwayat_servis_r2r4s.findUnique({
      where: { id: BigInt(id) },
      select: { struk_foto: true },
    })

    if (!record?.struk_foto) {
      return new NextResponse(null, { status: 404 })
    }

    const { buffer, contentType } = await readServiceBuktiFile(record.struk_foto)
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=0, must-revalidate",
      },
    })
  } catch (err) {
    console.error("[servis-kendaraan/foto] GET error:", err)
    return new NextResponse(null, { status: 404 })
  }
}
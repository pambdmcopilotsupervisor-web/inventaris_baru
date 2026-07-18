import { NextRequest, NextResponse } from "next/server"
import { requireSession } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { readServiceBuktiFile } from "@/lib/service-bukti-file"

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSession(req)
  if ("error" in auth) return auth.error

  try {
    const { id } = await params
    const record = await prisma.riwayat_service_acs.findUnique({
      where: { id: BigInt(id) },
      select: { bukti_foto: true },
    })

    if (!record?.bukti_foto) {
      return new NextResponse(null, { status: 404 })
    }

    const { buffer, contentType } = await readServiceBuktiFile(record.bukti_foto)
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=0, must-revalidate",
      },
    })
  } catch (err) {
    console.error("[service-ac/foto] GET error:", err)
    return new NextResponse(null, { status: 404 })
  }
}
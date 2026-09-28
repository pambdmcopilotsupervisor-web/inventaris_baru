import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { readServiceBuktiFile } from "@/lib/service-bukti-file"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const disposal = await prisma.permohonan_disposal.findUnique({
      where: { id: BigInt(id) },
      select: { gambar: true },
    })

    if (!disposal?.gambar) {
      return new NextResponse(null, { status: 404 })
    }

    const { buffer, contentType } = await readServiceBuktiFile(disposal.gambar)
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    })
  } catch (err) {
    console.error("[disposal/gambar] GET error:", err)
    return new NextResponse(null, { status: 404 })
  }
}

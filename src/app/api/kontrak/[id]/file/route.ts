import { NextRequest, NextResponse } from "next/server"
import { requireSession } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { readKontrakFile } from "@/lib/kontrak-file"

function sanitizeFilename(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSession(req)
  if ("error" in auth) return auth.error

  try {
    const { id } = await params
    const kontrak = await prisma.kontraks.findUnique({
      where: { id: BigInt(id) },
      select: { file: true, no_kontrak: true, judul: true },
    })

    if (!kontrak?.file) {
      return NextResponse.json({ error: "File kontrak tidak ditemukan" }, { status: 404 })
    }

    const { buffer, contentType } = await readKontrakFile(kontrak.file)
    const baseName = sanitizeFilename(kontrak.no_kontrak ?? kontrak.judul ?? `kontrak-${id}`) || `kontrak-${id}`
    const filename = baseName.toLowerCase().endsWith(".pdf") ? baseName : `${baseName}.pdf`

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": contentType || "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, max-age=0, must-revalidate",
      },
    })
  } catch (err) {
    console.error("[kontrak/file] GET error:", err)
    return NextResponse.json({ error: "Gagal mengunduh file kontrak" }, { status: 500 })
  }
}
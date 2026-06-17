import { NextRequest, NextResponse } from "next/server"
import { readFile } from "fs/promises"
import { join, resolve } from "path"
import { existsSync } from "fs"

// GET /uploads/[...path]
// Melayani file upload (foto selfie, foto sakit, dll.) dari direktori public/uploads/
// Diperlukan karena Next.js standalone mode tidak melayani runtime-uploaded files secara otomatis.

const UPLOADS_DIR = resolve(process.cwd(), "public", "uploads")

const MIME_MAP: Record<string, string> = {
  jpg:  "image/jpeg",
  jpeg: "image/jpeg",
  png:  "image/png",
  webp: "image/webp",
  pdf:  "application/pdf",
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  try {
    const { path: segments } = await params

    // Validasi: hanya karakter aman (cegah path traversal)
    if (segments.some(s => s.includes("..") || s.includes("\0"))) {
      return new NextResponse("Forbidden", { status: 403 })
    }

    const filePath = resolve(UPLOADS_DIR, ...segments)

    // Double-check path masih di dalam UPLOADS_DIR
    if (!filePath.startsWith(UPLOADS_DIR + "/") && filePath !== UPLOADS_DIR) {
      return new NextResponse("Forbidden", { status: 403 })
    }

    if (!existsSync(filePath)) {
      return new NextResponse("Not Found", { status: 404 })
    }

    const buffer = await readFile(filePath)
    const ext = filePath.split(".").pop()?.toLowerCase() ?? ""
    const contentType = MIME_MAP[ext] ?? "application/octet-stream"

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=3600",
        "X-Content-Type-Options": "nosniff",
      },
    })
  } catch {
    return new NextResponse("Internal Server Error", { status: 500 })
  }
}

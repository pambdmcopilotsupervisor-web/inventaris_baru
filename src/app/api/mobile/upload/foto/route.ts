import { NextRequest, NextResponse } from "next/server"
import { requireMobileAuth } from "@/lib/mobile-auth"
import { writeFile, mkdir } from "fs/promises"
import { join, extname } from "path"
import { randomUUID } from "crypto"

// POST /api/mobile/upload/foto
// Body: multipart/form-data dengan field "foto"
// Max: 5 MB, accept: JPG/JPEG/PNG/WEBP

const ALLOWED_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"]
const MAX_SIZE_MB   = 5
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024

export async function POST(req: NextRequest) {
  const auth = await requireMobileAuth(req)
  if ("error" in auth) return auth.error

  try {
    const formData = await req.formData()
    const file = formData.get("foto") as File | null

    // Debug log untuk diagnosa
    console.log("[upload/foto] fields:", [...formData.keys()])
    console.log("[upload/foto] file:", file ? `name=${file.name}, type=${file.type}, size=${file.size}` : "null")

    if (!file) return NextResponse.json({ error: "File foto wajib disertakan (field: foto)" }, { status: 400 })

    // Cek MIME type — fallback ke deteksi ekstensi jika type kosong
    let mimeType = file.type
    if (!mimeType || mimeType === "application/octet-stream") {
      const ext = extname(file.name).toLowerCase()
      const extMap: Record<string, string> = {
        ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
        ".png": "image/png",  ".webp": "image/webp",
      }
      mimeType = extMap[ext] ?? ""
    }

    if (!ALLOWED_TYPES.includes(mimeType)) {
      return NextResponse.json({
        error: `Tipe file tidak diizinkan. Diterima: type="${file.type}", name="${file.name}", mimeResolved="${mimeType}". Gunakan JPG, PNG, atau WEBP.`
      }, { status: 400 })
    }
    if (file.size > MAX_SIZE_BYTES) {
      return NextResponse.json({ error: `Ukuran foto maksimal ${MAX_SIZE_MB} MB` }, { status: 400 })
    }

    const ext = extname(file.name).toLowerCase() || ".jpg"
    const uniqueName  = `${randomUUID()}${ext}`
    const uploadDir   = join(process.cwd(), "public", "uploads", "mobile", "selfie")
    const filePath    = join(uploadDir, uniqueName)

    await mkdir(uploadDir, { recursive: true })
    const buffer = Buffer.from(await file.arrayBuffer())
    await writeFile(filePath, buffer)

    const relativePath = `/uploads/mobile/selfie/${uniqueName}`
    return NextResponse.json({ path: relativePath, size: file.size })
  } catch {
    return NextResponse.json({ error: "Upload foto gagal" }, { status: 500 })
  }
}

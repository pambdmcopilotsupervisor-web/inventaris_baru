import { NextRequest, NextResponse } from "next/server"
import { requireMobileAuth } from "@/lib/mobile-auth"
import { extname } from "path"
import { randomUUID } from "crypto"
import { uploadToMinIO } from "@/lib/storage"

// POST /api/mobile/upload/foto
// Body: multipart/form-data dengan field "foto"
// Max: 5 MB, accept: JPG/JPEG/PNG/WEBP
// File disimpan ke MinIO dan URL publik dikembalikan.

const ALLOWED_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"]
const MAX_SIZE_MB    = 5
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024

export async function POST(req: NextRequest) {
  const auth = await requireMobileAuth(req)
  if ("error" in auth) return auth.error

  try {
    const formData = await req.formData()
    const file = formData.get("foto") as File | null

    if (!file) return NextResponse.json({ error: "File foto wajib disertakan (field: foto)" }, { status: 400 })

    // Resolve MIME type — fallback ke ekstensi jika type kosong/generic
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
        error: `Tipe file tidak diizinkan (${mimeType}). Gunakan JPG, PNG, atau WEBP.`,
      }, { status: 400 })
    }
    if (file.size > MAX_SIZE_BYTES) {
      return NextResponse.json({ error: `Ukuran foto maksimal ${MAX_SIZE_MB} MB` }, { status: 400 })
    }

    const ext        = extname(file.name).toLowerCase() || ".jpg"
    const objectKey  = `mobile/selfie/${randomUUID()}${ext}`
    const buffer     = Buffer.from(await file.arrayBuffer())
    const publicUrl  = await uploadToMinIO(objectKey, buffer, mimeType)

    return NextResponse.json({ path: publicUrl, size: file.size })
  } catch (err) {
    console.error("[upload/foto]", err)
    return NextResponse.json({ error: "Upload foto gagal" }, { status: 500 })
  }
}

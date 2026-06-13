import { NextRequest, NextResponse } from "next/server"
import { requireRole } from "@/lib/auth"
import { writeFile, mkdir } from "fs/promises"
import { join, extname } from "path"
import { randomUUID } from "crypto"

// POST /api/upload/sakit
// Form: field "file" (PDF/JPG/JPEG/PNG), maks 5 MB

const ALLOWED_TYPES = ["application/pdf", "image/jpeg", "image/jpg", "image/png"]
const ALLOWED_EXT   = [".pdf", ".jpg", ".jpeg", ".png"]
const MAX_SIZE_MB   = 5
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, ["admin", "hrd", "atasan", "user", "operator"])
  if ("error" in auth) return auth.error

  try {
    const formData = await req.formData()
    const file = formData.get("file") as File | null

    if (!file) return NextResponse.json({ error: "File wajib disertakan" }, { status: 400 })

    // Validasi tipe MIME
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: `Tipe file tidak diizinkan. Gunakan: PDF, JPG, JPEG, atau PNG` }, { status: 400 })
    }

    // Validasi ekstensi
    const ext = extname(file.name).toLowerCase()
    if (!ALLOWED_EXT.includes(ext)) {
      return NextResponse.json({ error: `Ekstensi file tidak diizinkan. Gunakan: .pdf, .jpg, .jpeg, .png` }, { status: 400 })
    }

    // Validasi ukuran
    if (file.size > MAX_SIZE_BYTES) {
      return NextResponse.json({ error: `Ukuran file maksimal ${MAX_SIZE_MB} MB` }, { status: 400 })
    }

    // Generate nama file unik agar tidak bisa ditebak
    const uniqueName = `${randomUUID()}${ext}`
    const uploadDir  = join(process.cwd(), "public", "uploads", "sakit")
    const filePath   = join(uploadDir, uniqueName)

    // Pastikan direktori ada
    await mkdir(uploadDir, { recursive: true })

    // Simpan file
    const buffer = Buffer.from(await file.arrayBuffer())
    await writeFile(filePath, buffer)

    // Path yang disimpan di DB (relatif dari public/)
    const relativePath = `/uploads/sakit/${uniqueName}`

    return NextResponse.json({ path: relativePath, original_name: file.name, size: file.size })
  } catch {
    return NextResponse.json({ error: "Gagal mengupload file" }, { status: 500 })
  }
}

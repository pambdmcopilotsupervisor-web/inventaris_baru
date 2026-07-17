import { NextRequest, NextResponse } from "next/server"
import { requireRole } from "@/lib/auth"
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3"
import { prisma, serialize } from "@/lib/prisma"
import { randomUUID } from "crypto"
import { extname } from "path"
import type { Readable } from "stream"

const BUCKET   = process.env.MINIO_BUCKET   ?? "inventaris-baru"
const ENDPOINT = process.env.MINIO_ENDPOINT ?? "http://minio.paymentpedami.com:9000"
const REGION   = process.env.MINIO_REGION   ?? "us-east-1"

const s3 = new S3Client({
  endpoint:        ENDPOINT,
  region:          REGION,
  credentials: {
    accessKeyId:     process.env.MINIO_ACCESS_KEY_ID     ?? "",
    secretAccessKey: process.env.MINIO_SECRET_ACCESS_KEY ?? "",
  },
  forcePathStyle: true,
})

const ALLOWED_TYPES  = ["image/jpeg", "image/jpg", "image/png", "image/webp"]
const MAX_SIZE_BYTES = 5 * 1024 * 1024

/**
 * GET /api/aset/[id]/gambar
 * Proxy gambar dari MinIO via S3 auth — tidak perlu bucket public.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const asset = await prisma.assets.findUnique({
      where:  { id: BigInt(id) },
      select: { gambar: true },
    })

    if (!asset?.gambar) {
      return new NextResponse(null, { status: 404 })
    }

    // gambar menyimpan key saja (mis. "uuid.jpg")
    const key = asset.gambar

    const cmd = new GetObjectCommand({ Bucket: BUCKET, Key: key })
    const obj = await s3.send(cmd)

    const contentType = (obj.ContentType as string | undefined) ?? "image/jpeg"
    const stream      = obj.Body as Readable

    // Stream body ke response
    const chunks: Buffer[] = []
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    }
    const buffer = Buffer.concat(chunks)

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type":  contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    })
  } catch (err) {
    console.error("[aset/gambar] GET error:", err)
    return new NextResponse(null, { status: 404 })
  }
}

/**
 * POST /api/aset/[id]/gambar
 * Upload gambar aset ke MinIO, simpan KEY (bukan URL) ke kolom `gambar`.
 * Gambar diakses via GET endpoint ini (proxy authenticated).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireRole(req, ["admin", "operator"])
  if ("error" in auth) return auth.error

  try {
    const { id } = await params

    const formData = await req.formData()
    const file = formData.get("file") as File | null

    if (!file) {
      return NextResponse.json({ error: "File wajib disertakan" }, { status: 400 })
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: "Hanya JPG, PNG, atau WEBP yang diizinkan" }, { status: 400 })
    }
    if (file.size > MAX_SIZE_BYTES) {
      return NextResponse.json({ error: "Ukuran maksimal 5 MB" }, { status: 400 })
    }

    const ext    = extname(file.name).toLowerCase() || ".jpg"
    const key    = `${randomUUID()}${ext}`
    const buffer = Buffer.from(await file.arrayBuffer())

    // Upload ke MinIO
    await s3.send(new PutObjectCommand({
      Bucket:      BUCKET,
      Key:         key,
      Body:        buffer,
      ContentType: file.type,
    }))

    // Simpan KEY saja di kolom gambar
    const updated = await prisma.assets.update({
      where: { id: BigInt(id) },
      data:  { gambar: key },
    })

    // URL proxy melalui app sendiri
    const proxyUrl = `/api/aset/${id}/gambar`
    return NextResponse.json({ url: proxyUrl, asset: serialize(updated) })
  } catch (err) {
    console.error("[aset/gambar] POST error:", err)
    return NextResponse.json({ error: "Gagal mengupload gambar" }, { status: 500 })
  }
}

/**
 * DELETE /api/aset/[id]/gambar
 * Hapus gambar (set null di DB). File di MinIO tidak dihapus.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireRole(req, ["admin", "operator"])
  if ("error" in auth) return auth.error

  try {
    const { id } = await params
    await prisma.assets.update({
      where: { id: BigInt(id) },
      data:  { gambar: null },
    })
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: "Gagal menghapus gambar" }, { status: 500 })
  }
}

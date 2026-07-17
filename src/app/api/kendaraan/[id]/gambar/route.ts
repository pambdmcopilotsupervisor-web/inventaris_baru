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

const ALLOWED_FIELDS = ["gambar_fisik", "gambar_pajak", "gambar_stnk", "gbr_barang"] as const
type ImageField = typeof ALLOWED_FIELDS[number]

const ALLOWED_TYPES  = ["image/jpeg", "image/jpg", "image/png", "image/webp"]
const MAX_SIZE_BYTES = 5 * 1024 * 1024

function getField(req: NextRequest): ImageField | null {
  const field = new URL(req.url).searchParams.get("field")
  return ALLOWED_FIELDS.includes(field as ImageField) ? (field as ImageField) : null
}

/**
 * GET /api/kendaraan/[id]/gambar?field=gambar_fisik
 * Proxy gambar dari MinIO via S3 auth — tidak perlu bucket public.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const field   = getField(req)
    if (!field) return new NextResponse(null, { status: 400 })

    const kendaraan = await prisma.data_r2r4s.findUnique({
      where:  { id: BigInt(id) },
      select: { [field]: true },
    }) as Record<string, string | null> | null

    const key = kendaraan?.[field]
    if (!key) return new NextResponse(null, { status: 404 })

    const cmd = new GetObjectCommand({ Bucket: BUCKET, Key: key })
    const obj = await s3.send(cmd)

    const contentType = (obj.ContentType as string | undefined) ?? "image/jpeg"
    const stream      = obj.Body as Readable

    const chunks: Buffer[] = []
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    }

    return new NextResponse(Buffer.concat(chunks), {
      status: 200,
      headers: {
        "Content-Type":  contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    })
  } catch (err) {
    console.error("[kendaraan/gambar] GET error:", err)
    return new NextResponse(null, { status: 404 })
  }
}

/**
 * POST /api/kendaraan/[id]/gambar?field=gambar_fisik
 * Upload gambar ke MinIO, simpan key ke kolom yang dipilih.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireRole(req, ["admin", "operator"])
  if ("error" in auth) return auth.error

  const field = getField(req)
  if (!field) return NextResponse.json({ error: "Field tidak valid" }, { status: 400 })

  try {
    const { id } = await params

    const formData = await req.formData()
    const file = formData.get("file") as File | null

    if (!file) return NextResponse.json({ error: "File wajib disertakan" }, { status: 400 })
    if (!ALLOWED_TYPES.includes(file.type)) return NextResponse.json({ error: "Hanya JPG, PNG, atau WEBP" }, { status: 400 })
    if (file.size > MAX_SIZE_BYTES) return NextResponse.json({ error: "Ukuran maksimal 5 MB" }, { status: 400 })

    const ext    = extname(file.name).toLowerCase() || ".jpg"
    const key    = `${randomUUID()}${ext}`
    const buffer = Buffer.from(await file.arrayBuffer())

    await s3.send(new PutObjectCommand({
      Bucket:      BUCKET,
      Key:         key,
      Body:        buffer,
      ContentType: file.type,
    }))

    const updated = await prisma.data_r2r4s.update({
      where: { id: BigInt(id) },
      data:  { [field]: key },
    })

    return NextResponse.json({ key, field, kendaraan: serialize(updated) })
  } catch (err) {
    console.error("[kendaraan/gambar] POST error:", err)
    return NextResponse.json({ error: "Gagal mengupload gambar" }, { status: 500 })
  }
}

/**
 * DELETE /api/kendaraan/[id]/gambar?field=gambar_fisik
 * Set kolom gambar menjadi null di DB.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireRole(req, ["admin", "operator"])
  if ("error" in auth) return auth.error

  const field = getField(req)
  if (!field) return NextResponse.json({ error: "Field tidak valid" }, { status: 400 })

  try {
    const { id } = await params
    await prisma.data_r2r4s.update({
      where: { id: BigInt(id) },
      data:  { [field]: null },
    })
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: "Gagal menghapus gambar" }, { status: 500 })
  }
}

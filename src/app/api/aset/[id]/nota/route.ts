import { NextRequest, NextResponse } from "next/server"
import { requireRole } from "@/lib/auth"
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3"
import { prisma, serialize } from "@/lib/prisma"
import { ensureAssetBuktiNotaColumn } from "@/lib/asset-schema"
import { randomUUID } from "crypto"
import { extname } from "path"
import type { Readable } from "stream"

const BUCKET   = process.env.MINIO_BUCKET   ?? "inventaris-baru"
const ENDPOINT = process.env.MINIO_ENDPOINT ?? "http://minio.paymentpedami.com:9000"
const REGION   = process.env.MINIO_REGION   ?? "us-east-1"

const s3 = new S3Client({
  endpoint: ENDPOINT,
  region: REGION,
  credentials: {
    accessKeyId: process.env.MINIO_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.MINIO_SECRET_ACCESS_KEY ?? "",
  },
  forcePathStyle: true,
})

const ALLOWED_TYPES  = ["image/jpeg", "image/jpg", "image/png", "image/webp", "application/pdf"]
const MAX_SIZE_BYTES = 5 * 1024 * 1024

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const hasBuktiNota = await ensureAssetBuktiNotaColumn()
    if (!hasBuktiNota) {
      return new NextResponse(null, { status: 404 })
    }

    const { id } = await params
    const rows = await prisma.$queryRaw<Array<{ bukti_nota: string | null }>>`
      SELECT bukti_nota FROM assets WHERE id = ${BigInt(id)} LIMIT 1
    `
    const buktiNota = rows[0]?.bukti_nota ?? null

    if (!buktiNota) {
      return new NextResponse(null, { status: 404 })
    }

    const obj = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: buktiNota }))
    const contentType = (obj.ContentType as string | undefined) ?? "image/jpeg"
    const stream = obj.Body as Readable

    const chunks: Buffer[] = []
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    }

    return new NextResponse(new Uint8Array(Buffer.concat(chunks)), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    })
  } catch (err) {
    console.error("[aset/nota] GET error:", err)
    return new NextResponse(null, { status: 404 })
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireRole(req, ["admin", "operator"])
  if ("error" in auth) return auth.error

  try {
    const hasBuktiNota = await ensureAssetBuktiNotaColumn()
    if (!hasBuktiNota) {
      return NextResponse.json({ error: "Kolom bukti nota belum tersedia di database" }, { status: 500 })
    }

    const { id } = await params
    const formData = await req.formData()
    const file = formData.get("file") as File | null

    if (!file) {
      return NextResponse.json({ error: "File wajib disertakan" }, { status: 400 })
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: "Hanya JPG, PNG, PDF, atau WEBP yang diizinkan" }, { status: 400 })
    }
    if (file.size > MAX_SIZE_BYTES) {
      return NextResponse.json({ error: "Ukuran maksimal 5 MB" }, { status: 400 })
    }

    const ext = extname(file.name).toLowerCase() || ".jpg"
    const key = `${randomUUID()}${ext}`
    const buffer = Buffer.from(await file.arrayBuffer())

    await s3.send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: buffer,
      ContentType: file.type,
    }))

    await prisma.$executeRaw`
      UPDATE assets
      SET bukti_nota = ${key}, updated_at = NOW()
      WHERE id = ${BigInt(id)}
    `

    return NextResponse.json({ url: `/api/aset/${id}/nota`, asset: serialize({ id: Number(id), bukti_nota: key }) })
  } catch (err) {
    console.error("[aset/nota] POST error:", err)
    return NextResponse.json({ error: "Gagal mengupload bukti nota" }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireRole(req, ["admin", "operator"])
  if ("error" in auth) return auth.error

  try {
    const hasBuktiNota = await ensureAssetBuktiNotaColumn()
    if (!hasBuktiNota) {
      return NextResponse.json({ error: "Kolom bukti nota belum tersedia di database" }, { status: 500 })
    }

    const { id } = await params
    await prisma.$executeRaw`
      UPDATE assets
      SET bukti_nota = NULL, updated_at = NOW()
      WHERE id = ${BigInt(id)}
    `
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: "Gagal menghapus bukti nota" }, { status: 500 })
  }
}

import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3"
import { randomUUID } from "crypto"
import { extname } from "path"
import type { Readable } from "stream"

const BUCKET = process.env.MINIO_BUCKET ?? "inventaris-baru"
const ENDPOINT = process.env.MINIO_ENDPOINT ?? "http://minio.paymentpedami.com:9000"
const REGION = process.env.MINIO_REGION ?? "us-east-1"

const s3 = new S3Client({
  endpoint: ENDPOINT,
  region: REGION,
  credentials: {
    accessKeyId: process.env.MINIO_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.MINIO_SECRET_ACCESS_KEY ?? "",
  },
  forcePathStyle: true,
})

export const KONTRAK_ALLOWED_TYPES = ["application/pdf"]
export const KONTRAK_MAX_SIZE_MB = 10
export const KONTRAK_MAX_SIZE_BYTES = KONTRAK_MAX_SIZE_MB * 1024 * 1024

function resolvePdfMimeType(file: File): string {
  if (file.type && file.type !== "application/octet-stream") return file.type
  return extname(file.name).toLowerCase() === ".pdf" ? "application/pdf" : ""
}

export function validateKontrakPdf(file: File): string | null {
  const mimeType = resolvePdfMimeType(file)
  if (!KONTRAK_ALLOWED_TYPES.includes(mimeType)) {
    return "File kontrak harus berformat PDF"
  }
  if (file.size > KONTRAK_MAX_SIZE_BYTES) {
    return `Ukuran file maksimal ${KONTRAK_MAX_SIZE_MB} MB`
  }
  return null
}

export async function uploadKontrakPdf(file: File): Promise<string> {
  const validationError = validateKontrakPdf(file)
  if (validationError) throw new Error(validationError)

  const ext = extname(file.name).toLowerCase() || ".pdf"
  const key = `kontrak/${randomUUID()}${ext}`
  const buffer = Buffer.from(await file.arrayBuffer())
  const contentType = resolvePdfMimeType(file) || "application/pdf"

  await s3.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  }))

  return key
}

export async function readKontrakFile(storedValue: string): Promise<{ buffer: Buffer; contentType: string }> {
  if (storedValue.startsWith("http://") || storedValue.startsWith("https://")) {
    const response = await fetch(storedValue, { cache: "no-store" })
    if (!response.ok) {
      throw new Error(`Gagal mengambil file kontrak (${response.status})`)
    }

    return {
      buffer: Buffer.from(await response.arrayBuffer()),
      contentType: response.headers.get("content-type") ?? "application/pdf",
    }
  }

  const object = await s3.send(new GetObjectCommand({
    Bucket: BUCKET,
    Key: storedValue,
  }))

  const stream = object.Body as Readable
  const chunks: Buffer[] = []
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }

  return {
    buffer: Buffer.concat(chunks),
    contentType: (object.ContentType as string | undefined) ?? "application/pdf",
  }
}
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

export const SERVICE_BUKTI_ALLOWED_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"]
export const SERVICE_BUKTI_MAX_SIZE_MB = 5
export const SERVICE_BUKTI_MAX_SIZE_BYTES = SERVICE_BUKTI_MAX_SIZE_MB * 1024 * 1024

function resolveImageMimeType(file: File): string {
  if (file.type && file.type !== "application/octet-stream") return file.type

  const ext = extname(file.name).toLowerCase()
  const mimeMap: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
  }

  return mimeMap[ext] ?? ""
}

export function validateServiceBuktiImage(file: File): string | null {
  const mimeType = resolveImageMimeType(file)

  if (!SERVICE_BUKTI_ALLOWED_TYPES.includes(mimeType)) {
    return "Bukti foto harus berupa JPG, PNG, atau WEBP"
  }

  if (file.size > SERVICE_BUKTI_MAX_SIZE_BYTES) {
    return `Ukuran foto maksimal ${SERVICE_BUKTI_MAX_SIZE_MB} MB`
  }

  return null
}

export async function uploadServiceBuktiImage(
  file: File,
  folder: "servis-kendaraan" | "service-aset",
): Promise<string> {
  const validationError = validateServiceBuktiImage(file)
  if (validationError) throw new Error(validationError)

  const ext = extname(file.name).toLowerCase() || ".jpg"
  const key = `service-bukti/${folder}/${randomUUID()}${ext}`
  const buffer = Buffer.from(await file.arrayBuffer())
  const contentType = resolveImageMimeType(file) || "image/jpeg"

  await s3.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  }))

  return key
}

export async function readServiceBuktiFile(storedValue: string): Promise<{ buffer: Buffer; contentType: string }> {
  if (storedValue.startsWith("http://") || storedValue.startsWith("https://")) {
    const response = await fetch(storedValue, { cache: "no-store" })
    if (!response.ok) {
      throw new Error(`Gagal mengambil bukti foto (${response.status})`)
    }

    return {
      buffer: Buffer.from(await response.arrayBuffer()),
      contentType: response.headers.get("content-type") ?? "image/jpeg",
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
    contentType: (object.ContentType as string | undefined) ?? "image/jpeg",
  }
}
/**
 * lib/storage.ts
 *
 * MinIO / S3-compatible storage client.
 * Semua upload foto absensi mobile disimpan di MinIO.
 * URL publik dikembalikan dan disimpan langsung ke database.
 */
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3"

const BUCKET   = process.env.MINIO_BUCKET   ?? "absensi"
const ENDPOINT = process.env.MINIO_ENDPOINT ?? "https://storage.pedami-inventaris.com"
const REGION   = process.env.MINIO_REGION   ?? "us-east-1"

const s3 = new S3Client({
  endpoint:        ENDPOINT,
  region:          REGION,
  credentials: {
    accessKeyId:     process.env.MINIO_ACCESS_KEY_ID     ?? "",
    secretAccessKey: process.env.MINIO_SECRET_ACCESS_KEY ?? "",
  },
  forcePathStyle: true, // wajib untuk MinIO path-style endpoint
})

/**
 * Upload buffer ke MinIO.
 * @param key  Contoh: "mobile/selfie/uuid.jpg"
 * @param body Buffer konten file
 * @param contentType MIME type, default "image/jpeg"
 * @returns URL publik file di MinIO
 */
export async function uploadToMinIO(
  key: string,
  body: Buffer,
  contentType = "image/jpeg",
): Promise<string> {
  await s3.send(new PutObjectCommand({
    Bucket:      BUCKET,
    Key:         key,
    Body:        body,
    ContentType: contentType,
    // File publik — dapat diakses langsung via URL
    ACL:         "public-read",
  }))

  return `${ENDPOINT}/${BUCKET}/${key}`
}

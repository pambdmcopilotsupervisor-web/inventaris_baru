import { Prisma } from "@prisma/client"
import { toNullableDate, toNullableNumber, toNullableString } from "@/lib/asset-input"

type KaryawanWriteBody = {
  nik?: unknown
  nama_karyawan?: unknown
  divisi_id?: unknown
  jabatan?: unknown
  subdivisi_id?: unknown
  atasan_id?: unknown
  tarif_lembur_per_jam?: unknown
  jkel?: unknown
  no_ktp?: unknown
  no_hp?: unknown
  no_rekening?: unknown
  alamat?: unknown
  tanggal_lahir?: unknown
  tanggal_masuk_kerja?: unknown
  tanggal_keluar?: unknown
  tempat_lahir?: unknown
  nama_bank?: unknown
  kontak_darurat?: unknown
  status_karyawan?: unknown
  masa_kerja?: unknown
  no_bpjs_ketenagakerjaan?: unknown
  no_bpjs_kesehatan?: unknown
  pendidikan_terakhir?: unknown
  umur?: unknown
  agama?: unknown
  foto?: unknown
  status_ptkp?: unknown
  punya_npwp?: unknown
}

const WRITABLE_FIELDS = [
  "nik",
  "nama_karyawan",
  "divisi_id",
  "jabatan",
  "subdivisi_id",
  "atasan_id",
  "tarif_lembur_per_jam",
  "jkel",
  "no_ktp",
  "no_hp",
  "no_rekening",
  "alamat",
  "tanggal_lahir",
  "tanggal_masuk_kerja",
  "tanggal_keluar",
  "tempat_lahir",
  "nama_bank",
  "kontak_darurat",
  "status_karyawan",
  "masa_kerja",
  "no_bpjs_ketenagakerjaan",
  "no_bpjs_kesehatan",
  "pendidikan_terakhir",
  "umur",
  "agama",
  "foto",
  "status_ptkp",
  "punya_npwp",
] as const

function toNullableBigInt(value: unknown): bigint | null | undefined {
  const number = toNullableNumber(value)
  if (typeof number === "undefined" || number === null) return number
  return Number.isSafeInteger(number) && number > 0 ? BigInt(number) : null
}

function toNullableBoolean(value: unknown): boolean | null | undefined {
  if (typeof value === "undefined") return undefined
  if (value === null || value === "") return null
  if (typeof value === "boolean") return value
  if (typeof value === "number") return value === 1

  const text = String(value).trim().toLowerCase()
  if (["true", "1", "ya", "yes"].includes(text)) return true
  if (["false", "0", "tidak", "no"].includes(text)) return false
  return null
}

function normalizeKaryawanData(body: KaryawanWriteBody, partial: boolean): Record<string, unknown> {
  const data: Record<string, unknown> = {}

  for (const field of WRITABLE_FIELDS) {
    if (partial && !Object.prototype.hasOwnProperty.call(body, field)) continue
    data[field] = body[field]
  }

  for (const field of ["nik", "nama_karyawan", "jabatan", "jkel"] as const) {
    if (field in data) data[field] = toNullableString(data[field])?.trim() ?? ""
  }

  for (const field of [
    "no_ktp",
    "no_hp",
    "no_rekening",
    "alamat",
    "tempat_lahir",
    "nama_bank",
    "kontak_darurat",
    "status_karyawan",
    "no_bpjs_ketenagakerjaan",
    "no_bpjs_kesehatan",
    "pendidikan_terakhir",
    "agama",
    "foto",
    "status_ptkp",
  ] as const) {
    if (field in data) data[field] = toNullableString(data[field])
  }

  for (const field of ["tanggal_lahir", "tanggal_masuk_kerja", "tanggal_keluar"] as const) {
    if (field in data) data[field] = toNullableDate(data[field])
  }

  for (const field of ["divisi_id", "subdivisi_id", "masa_kerja", "umur"] as const) {
    if (field in data) data[field] = toNullableNumber(data[field])
  }

  if ("atasan_id" in data) data.atasan_id = toNullableBigInt(data.atasan_id)
  if ("tarif_lembur_per_jam" in data) data.tarif_lembur_per_jam = toNullableNumber(data.tarif_lembur_per_jam)
  if ("punya_npwp" in data) data.punya_npwp = toNullableBoolean(data.punya_npwp)

  for (const key of Object.keys(data)) {
    if (typeof data[key] === "undefined") delete data[key]
  }

  return data
}

export function normalizeKaryawanCreateData(body: KaryawanWriteBody): Prisma.karyawansUncheckedCreateInput {
  return {
    ...normalizeKaryawanData(body, false),
    created_at: new Date(),
    updated_at: new Date(),
  } as Prisma.karyawansUncheckedCreateInput
}

export function sanitizeKaryawanUpdateData(body: Record<string, unknown>): Prisma.karyawansUncheckedUpdateInput {
  return {
    ...normalizeKaryawanData(body, true),
    updated_at: new Date(),
  } as Prisma.karyawansUncheckedUpdateInput
}

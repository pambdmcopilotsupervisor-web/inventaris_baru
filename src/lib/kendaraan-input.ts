import { Prisma } from "@prisma/client"
import { toNullableDate, toNullableNumber, toNullableString } from "@/lib/asset-input"

type KendaraanWriteBody = {
  kode_brg?: unknown
  jns_brg?: unknown
  plat?: unknown
  nm_brg?: unknown
  gambar_fisik?: unknown
  thn?: unknown
  no_rangka?: unknown
  no_mesin?: unknown
  pajak?: unknown
  gambar_pajak?: unknown
  stnk?: unknown
  gambar_stnk?: unknown
  bpkb?: unknown
  warna?: unknown
  service?: unknown
  foto?: unknown
  pemegang?: unknown
  departemen?: unknown
  gbr_barang?: unknown
  stat?: unknown
  no_bpkb?: unknown
  tgl_akhir_kir?: unknown
  tgl_stop_tagihan?: unknown
  hrg_sewa?: unknown
  hrg_beli?: unknown
  deskripsi?: unknown
  alasan_stop_tagihan?: unknown
}

const WRITABLE_FIELDS = [
  "kode_brg",
  "jns_brg",
  "plat",
  "nm_brg",
  "gambar_fisik",
  "thn",
  "no_rangka",
  "no_mesin",
  "pajak",
  "gambar_pajak",
  "stnk",
  "gambar_stnk",
  "bpkb",
  "warna",
  "service",
  "foto",
  "pemegang",
  "departemen",
  "gbr_barang",
  "stat",
  "no_bpkb",
  "tgl_akhir_kir",
  "tgl_stop_tagihan",
  "hrg_sewa",
  "hrg_beli",
  "deskripsi",
  "alasan_stop_tagihan",
] as const

function normalizeKendaraanData(body: KendaraanWriteBody, partial: boolean): Record<string, unknown> {
  const data: Record<string, unknown> = {}

  for (const field of WRITABLE_FIELDS) {
    if (partial && !Object.prototype.hasOwnProperty.call(body, field)) continue
    data[field] = body[field]
  }

  if ("kode_brg" in data) data.kode_brg = toNullableString(data.kode_brg)?.trim() ?? ""
  if ("jns_brg" in data) data.jns_brg = toNullableString(data.jns_brg) ?? ""
  if ("plat" in data) data.plat = toNullableString(data.plat) ?? ""
  if ("nm_brg" in data) data.nm_brg = toNullableString(data.nm_brg) ?? ""

  for (const field of ["gambar_fisik", "gambar_pajak", "gambar_stnk", "bpkb", "warna", "foto", "pemegang", "departemen", "gbr_barang", "stat", "no_bpkb", "deskripsi", "alasan_stop_tagihan"] as const) {
    if (field in data) data[field] = toNullableString(data[field])
  }

  for (const field of ["pajak", "stnk", "service", "tgl_akhir_kir", "tgl_stop_tagihan"] as const) {
    if (field in data) data[field] = toNullableDate(data[field])
  }

  for (const field of ["thn", "hrg_sewa", "hrg_beli"] as const) {
    if (field in data) data[field] = toNullableNumber(data[field])
  }

  return data
}

export function normalizeKendaraanCreateData(body: KendaraanWriteBody, fallbackKodeBarang: string): Prisma.data_r2r4sUncheckedCreateInput {
  const data = normalizeKendaraanData(body, false)
  data.kode_brg = fallbackKodeBarang
  return data as Prisma.data_r2r4sUncheckedCreateInput
}

export function sanitizeKendaraanUpdateData(body: Record<string, unknown>): Prisma.data_r2r4sUncheckedUpdateInput {
  return {
    ...normalizeKendaraanData(body, true),
    updated_at: new Date(),
  } as Prisma.data_r2r4sUncheckedUpdateInput
}

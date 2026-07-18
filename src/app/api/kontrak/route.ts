import { NextRequest, NextResponse } from "next/server"
import { requireSession } from "@/lib/auth"
import { prisma, serialize } from "@/lib/prisma"
import { canCreateOrEditTransaksi, getTransaksiActionError } from "@/lib/transaksi-role"
import { uploadKontrakPdf } from "@/lib/kontrak-file"

function getStatus(tglAwal: Date, tglAkhir: Date): string {
  const now = new Date(); now.setHours(0, 0, 0, 0)
  const akhir = new Date(tglAkhir); akhir.setHours(0, 0, 0, 0)
  const awal  = new Date(tglAwal);  awal.setHours(0, 0, 0, 0)
  const diffToAkhir = Math.floor((akhir.getTime() - now.getTime()) / 86400000)

  if (now > akhir)                           return "EXPIRED"
  if (diffToAkhir >= 0 && diffToAkhir <= 30) return "SEGERA BERAKHIR"
  if (now >= awal && now <= akhir)           return "AKTIF"
  if (now < awal)                            return "AKAN DATANG"
  return "UNKNOWN"
}

function getMasaSewa(tglAwal: Date, tglAkhir: Date): number {
  return Math.round((tglAkhir.getTime() - tglAwal.getTime()) / (30 * 24 * 60 * 60 * 1000))
}

function toNullableString(value: FormDataEntryValue | string | null | undefined): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function parseKendaraanIds(value: unknown): number[] {
  if (!value) return []

  if (Array.isArray(value)) {
    return value.map((item) => Number(item)).filter((item) => Number.isFinite(item) && item > 0)
  }

  if (typeof value === "string") {
    const trimmed = value.trim()
    if (!trimmed) return []

    try {
      const parsed = JSON.parse(trimmed)
      if (Array.isArray(parsed)) {
        return parsed.map((item) => Number(item)).filter((item) => Number.isFinite(item) && item > 0)
      }
    } catch {
      return trimmed
        .split(",")
        .map((item) => Number(item.trim()))
        .filter((item) => Number.isFinite(item) && item > 0)
    }
  }

  return []
}

async function parseKontrakRequest(req: NextRequest) {
  const contentType = req.headers.get("content-type") ?? ""

  if (contentType.includes("multipart/form-data")) {
    const formData = await req.formData()
    const rawFile = formData.get("file")
    const file = rawFile instanceof File && rawFile.size > 0 ? rawFile : null

    return {
      no_kontrak: toNullableString(formData.get("no_kontrak")),
      judul: toNullableString(formData.get("judul")) ?? "",
      tgl_awal: toNullableString(formData.get("tgl_awal")) ?? "",
      tgl_akhir: toNullableString(formData.get("tgl_akhir")) ?? "",
      kendaraan_ids: parseKendaraanIds(formData.get("kendaraan_ids")),
      file,
      fileValue: undefined as string | null | undefined,
    }
  }

  const body = await req.json()
  return {
    no_kontrak: toNullableString(body.no_kontrak),
    judul: toNullableString(body.judul) ?? "",
    tgl_awal: toNullableString(body.tgl_awal) ?? "",
    tgl_akhir: toNullableString(body.tgl_akhir) ?? "",
    kendaraan_ids: parseKendaraanIds(body.kendaraan_ids),
    file: null,
    fileValue: Object.prototype.hasOwnProperty.call(body, "file") ? toNullableString(body.file) : undefined,
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const statusFilter = searchParams.get("status") ?? ""

    const kontraks = await prisma.kontraks.findMany({
      orderBy: { tgl_akhir: "desc" },
    })

    // Ambil kontrak details (kendaraan terkait)
    const allDetails = await prisma.kontrak_details.findMany()
    const kendaraans = await prisma.data_r2r4s.findMany({
      select: { id: true, plat: true, nm_brg: true, jns_brg: true },
    })
    const kMap = new Map(kendaraans.map(k => [Number(k.id), k]))

    const enriched = kontraks.map(k => {
      const status   = getStatus(k.tgl_awal, k.tgl_akhir)
      const masaSewa = getMasaSewa(k.tgl_awal, k.tgl_akhir)

      const details = allDetails
        .filter(d => d.kontrak_id === Number(k.id) && d.data_r2r4_id)
        .map(d => {
          const kendaraan = kMap.get(d.data_r2r4_id!)
          return kendaraan ? { id: Number(d.id), data_r2r4_id: d.data_r2r4_id, plat: kendaraan.plat, nm_brg: kendaraan.nm_brg, jns_brg: kendaraan.jns_brg } : null
        })
        .filter(Boolean)

      return { ...k, status, masa_sewa: masaSewa, kendaraan_list: details }
    })

    // Filter status
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const near30 = new Date(today); near30.setDate(near30.getDate() + 30)

    const filtered = statusFilter
      ? enriched.filter(k => {
          if (statusFilter === "aktif")   return k.status === "AKTIF"
          if (statusFilter === "expired") return k.status === "EXPIRED"
          if (statusFilter === "segera")  return k.status === "SEGERA BERAKHIR"
          if (statusFilter === "coming")  return k.status === "AKAN DATANG"
          return true
        })
      : enriched

    return NextResponse.json(serialize(filtered))
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireSession(req)
  if ("error" in auth) return auth.error
  if (!canCreateOrEditTransaksi(auth.user.role)) {
    return NextResponse.json({ error: getTransaksiActionError("create") }, { status: 403 })
  }

  try {
    const { no_kontrak, judul, tgl_awal, tgl_akhir, file, fileValue, kendaraan_ids } = await parseKontrakRequest(req)

    if (!judul || !tgl_awal || !tgl_akhir) {
      return NextResponse.json({ error: "Field wajib tidak lengkap" }, { status: 400 })
    }

    const storedFile = file ? await uploadKontrakPdf(file) : (fileValue ?? null)

    // Buat kontrak
    const kontrak = await prisma.kontraks.create({
      data: { no_kontrak, judul, tgl_awal: new Date(tgl_awal), tgl_akhir: new Date(tgl_akhir), file: storedFile },
    })

    // Buat kontrak details (kendaraan terkait)
    if (kendaraan_ids && Array.isArray(kendaraan_ids) && kendaraan_ids.length > 0) {
      await prisma.kontrak_details.createMany({
        data: kendaraan_ids.filter(Boolean).map((kid: number) => ({
          kontrak_id:   Number(kontrak.id),
          data_r2r4_id: Number(kid),
        })),
      })
    }

    return NextResponse.json(serialize(kontrak), { status: 201 })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: err instanceof Error ? err.message : "Gagal menyimpan kontrak" }, { status: 500 })
  }
}

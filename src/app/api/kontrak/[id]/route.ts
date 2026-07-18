import { NextRequest, NextResponse } from "next/server"
import { requireSession } from "@/lib/auth"
import { prisma, serialize } from "@/lib/prisma"
import { canCreateOrEditTransaksi, canDeleteTransaksi, getTransaksiActionError } from "@/lib/transaksi-role"
import { uploadKontrakPdf } from "@/lib/kontrak-file"

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

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const data = await prisma.kontraks.findUnique({ where: { id: BigInt(id) } })
    if (!data) return NextResponse.json({ error: "Tidak ditemukan" }, { status: 404 })
    return NextResponse.json(serialize(data))
  } catch { return NextResponse.json({ error: "Server error" }, { status: 500 }) }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSession(req)
  if ("error" in auth) return auth.error
  if (!canCreateOrEditTransaksi(auth.user.role)) {
    return NextResponse.json({ error: getTransaksiActionError("update") }, { status: 403 })
  }

  try {
    const { id } = await params
    const { no_kontrak, judul, tgl_awal, tgl_akhir, kendaraan_ids, file, fileValue } = await parseKontrakRequest(req)

    if (!judul || !tgl_awal || !tgl_akhir) {
      return NextResponse.json({ error: "Field wajib tidak lengkap" }, { status: 400 })
    }

    const data: { no_kontrak: string | null; judul: string; tgl_awal: Date; tgl_akhir: Date; file?: string | null } = {
      no_kontrak,
      judul,
      tgl_awal: new Date(tgl_awal),
      tgl_akhir: new Date(tgl_akhir),
    }

    if (file) {
      data.file = await uploadKontrakPdf(file)
    } else if (typeof fileValue !== "undefined") {
      data.file = fileValue
    }

    const updated = await prisma.kontraks.update({
      where: { id: BigInt(id) },
      data,
    })

    // Update kontrak details: hapus semua lama, buat ulang
    await prisma.kontrak_details.deleteMany({ where: { kontrak_id: Number(id) } })
    if (kendaraan_ids && Array.isArray(kendaraan_ids) && kendaraan_ids.length > 0) {
      await prisma.kontrak_details.createMany({
        data: kendaraan_ids.filter(Boolean).map((kid: number) => ({
          kontrak_id:   Number(id),
          data_r2r4_id: Number(kid),
        })),
      })
    }

    return NextResponse.json(serialize(updated))
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: err instanceof Error ? err.message : "Gagal memperbarui" }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSession(req)
  if ("error" in auth) return auth.error
  if (!canDeleteTransaksi(auth.user.role)) {
    return NextResponse.json({ error: getTransaksiActionError("delete") }, { status: 403 })
  }

  try {
    const { id } = await params
    await prisma.kontrak_details.deleteMany({ where: { kontrak_id: Number(id) } })
    await prisma.kontraks.delete({ where: { id: BigInt(id) } })
    return NextResponse.json({ success: true })
  } catch { return NextResponse.json({ error: "Gagal menghapus" }, { status: 500 }) }
}

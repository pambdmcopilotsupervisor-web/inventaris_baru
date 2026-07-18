import { NextRequest, NextResponse } from "next/server"
import { requireSession } from "@/lib/auth"
import { prisma, serialize } from "@/lib/prisma"
import { canCreateOrEditTransaksi, canDeleteTransaksi, getTransaksiActionError } from "@/lib/transaksi-role"
import { uploadServiceBuktiImage } from "@/lib/service-bukti-file"

function toNullableString(value: FormDataEntryValue | string | null | undefined): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function toNullableNumber(value: FormDataEntryValue | number | string | null | undefined): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  if (!trimmed) return null
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : null
}

async function parseServisKendaraanRequest(req: NextRequest) {
  const contentType = req.headers.get("content-type") ?? ""

  if (contentType.includes("multipart/form-data")) {
    const formData = await req.formData()
    const rawFoto = formData.get("foto")
    const foto = rawFoto instanceof File && rawFoto.size > 0 ? rawFoto : null

    return {
      tanggal_servis: toNullableString(formData.get("tanggal_servis")) ?? "",
      jenis_servis: toNullableString(formData.get("jenis_servis")) ?? "",
      biaya: toNullableNumber(formData.get("biaya")) ?? 0,
      bengkel: toNullableString(formData.get("bengkel")),
      keterangan: toNullableString(formData.get("keterangan")),
      foto,
      struk_foto: undefined as string | null | undefined,
    }
  }

  const body = await req.json()
  return {
    tanggal_servis: toNullableString(body.tanggal_servis) ?? "",
    jenis_servis: toNullableString(body.jenis_servis) ?? "",
    biaya: toNullableNumber(body.biaya) ?? 0,
    bengkel: toNullableString(body.bengkel),
    keterangan: toNullableString(body.keterangan),
    foto: null,
    struk_foto: Object.prototype.hasOwnProperty.call(body, "struk_foto") ? toNullableString(body.struk_foto) : undefined,
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSession(req)
  if ("error" in auth) return auth.error
  if (!canCreateOrEditTransaksi(auth.user.role)) {
    return NextResponse.json({ error: getTransaksiActionError("update") }, { status: 403 })
  }

  try {
    const { id } = await params
    const { tanggal_servis, jenis_servis, biaya, bengkel, keterangan, foto, struk_foto } = await parseServisKendaraanRequest(req)

    const data: {
      tanggal_servis: Date
      jenis_servis: string
      biaya: number
      bengkel: string | null
      keterangan: string | null
      struk_foto?: string | null
    } = {
      tanggal_servis: new Date(tanggal_servis),
      jenis_servis,
      biaya: biaya ? Number(biaya) : 0,
      bengkel: bengkel ?? null,
      keterangan: keterangan ?? null,
    }

    if (foto) {
      data.struk_foto = await uploadServiceBuktiImage(foto, "servis-kendaraan")
    } else if (typeof struk_foto !== "undefined") {
      data.struk_foto = struk_foto
    }

    const updated = await prisma.riwayat_servis_r2r4s.update({
      where: { id: BigInt(id) },
      data,
    })

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
    await prisma.riwayat_servis_r2r4s.delete({ where: { id: BigInt(id) } })
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: "Gagal menghapus" }, { status: 500 })
  }
}
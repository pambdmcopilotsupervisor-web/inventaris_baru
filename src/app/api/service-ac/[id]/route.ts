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

async function parseServiceAcRequest(req: NextRequest) {
  const contentType = req.headers.get("content-type") ?? ""

  if (contentType.includes("multipart/form-data")) {
    const formData = await req.formData()
    const rawFoto = formData.get("foto")
    const foto = rawFoto instanceof File && rawFoto.size > 0 ? rawFoto : null

    return {
      tanggal_service: toNullableString(formData.get("tanggal_service")) ?? "",
      jenis_pekerjaan: toNullableString(formData.get("jenis_pekerjaan")) ?? "",
      biaya: toNullableNumber(formData.get("biaya")) ?? 0,
      teknisi: toNullableString(formData.get("teknisi")),
      keterangan: toNullableString(formData.get("keterangan")),
      foto,
      bukti_foto: undefined as string | null | undefined,
    }
  }

  const body = await req.json()
  return {
    tanggal_service: toNullableString(body.tanggal_service) ?? "",
    jenis_pekerjaan: toNullableString(body.jenis_pekerjaan) ?? "",
    biaya: toNullableNumber(body.biaya) ?? 0,
    teknisi: toNullableString(body.teknisi),
    keterangan: toNullableString(body.keterangan),
    foto: null,
    bukti_foto: Object.prototype.hasOwnProperty.call(body, "bukti_foto") ? toNullableString(body.bukti_foto) : undefined,
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
    const { tanggal_service, jenis_pekerjaan, biaya, teknisi, keterangan, foto, bukti_foto } = await parseServiceAcRequest(req)

    const data: {
      tanggal_service: Date
      jenis_pekerjaan: string
      biaya: number
      teknisi: string | null
      keterangan: string | null
      bukti_foto?: string | null
    } = {
      tanggal_service: new Date(tanggal_service),
      jenis_pekerjaan,
      biaya: biaya ? Number(biaya) : 0,
      teknisi: teknisi ?? null,
      keterangan: keterangan ?? null,
    }

    if (foto) {
      data.bukti_foto = await uploadServiceBuktiImage(foto, "service-aset")
    } else if (typeof bukti_foto !== "undefined") {
      data.bukti_foto = bukti_foto
    }

    const updated = await prisma.riwayat_service_acs.update({
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
    await prisma.riwayat_service_acs.delete({ where: { id: BigInt(id) } })
    return NextResponse.json({ success: true })
  } catch { return NextResponse.json({ error: "Gagal menghapus" }, { status: 500 }) }
}

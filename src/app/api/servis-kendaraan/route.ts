import { NextRequest, NextResponse } from "next/server"
import { requireSession } from "@/lib/auth"
import { prisma, serialize } from "@/lib/prisma"
import { canCreateOrEditTransaksi, getTransaksiActionError } from "@/lib/transaksi-role"
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
      data_r2r4_id: toNullableNumber(formData.get("data_r2r4_id")),
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
    data_r2r4_id: toNullableNumber(body.data_r2r4_id),
    tanggal_servis: toNullableString(body.tanggal_servis) ?? "",
    jenis_servis: toNullableString(body.jenis_servis) ?? "",
    biaya: toNullableNumber(body.biaya) ?? 0,
    bengkel: toNullableString(body.bengkel),
    keterangan: toNullableString(body.keterangan),
    foto: null,
    struk_foto: Object.prototype.hasOwnProperty.call(body, "struk_foto") ? toNullableString(body.struk_foto) : undefined,
  }
}

export async function GET(req: NextRequest) {
  try {
    const kendaraanId = new URL(req.url).searchParams.get("kendaraan_id")

    const list = await prisma.riwayat_servis_r2r4s.findMany({
      where: kendaraanId ? { data_r2r4_id: BigInt(kendaraanId) } : {},
      include: { data_r2r4s: { select: { kode_brg: true, plat: true, nm_brg: true } } },
      orderBy: { tanggal_servis: "desc" },
    })
    return NextResponse.json(serialize(list))
  } catch { return NextResponse.json({ error: "Server error" }, { status: 500 }) }
}

export async function POST(req: NextRequest) {
  const auth = await requireSession(req)
  if ("error" in auth) return auth.error
  if (!canCreateOrEditTransaksi(auth.user.role)) {
    return NextResponse.json({ error: getTransaksiActionError("create") }, { status: 403 })
  }

  try {
    const { data_r2r4_id, tanggal_servis, jenis_servis, biaya, bengkel, keterangan, foto, struk_foto } = await parseServisKendaraanRequest(req)
    if (!data_r2r4_id || !tanggal_servis || !jenis_servis) {
      return NextResponse.json({ error: "Field wajib tidak lengkap" }, { status: 400 })
    }

    const storedFoto = foto ? await uploadServiceBuktiImage(foto, "servis-kendaraan") : (struk_foto ?? null)

    const data = await prisma.riwayat_servis_r2r4s.create({
      data: {
        data_r2r4_id: BigInt(data_r2r4_id),
        tanggal_servis: new Date(tanggal_servis),
        jenis_servis,
        biaya: biaya ? Number(biaya) : 0,
        bengkel: bengkel ?? null,
        keterangan: keterangan ?? null,
        struk_foto: storedFoto,
      },
    })
    return NextResponse.json(serialize(data), { status: 201 })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: err instanceof Error ? err.message : "Gagal menyimpan" }, { status: 500 })
  }
}

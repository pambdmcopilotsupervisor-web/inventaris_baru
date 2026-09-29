import { NextRequest, NextResponse } from "next/server"
import { requireSession } from "@/lib/auth"
import { prisma, serialize } from "@/lib/prisma"
import { canCreateOrEditTransaksi, getTransaksiActionError } from "@/lib/transaksi-role"
import { uploadServiceBuktiImage } from "@/lib/service-bukti-file"

const BULAN_ROMAWI: Record<number, string> = {
  1:'I', 2:'II', 3:'III', 4:'IV', 5:'V', 6:'VI',
  7:'VII', 8:'VIII', 9:'IX', 10:'X', 11:'XI', 12:'XII',
}

function formatNomor(nomor: string): string {
  if (!nomor) return nomor
  const now = new Date()
  const bulan = BULAN_ROMAWI[now.getMonth() + 1]
  const tahun = now.getFullYear()
  return `${nomor.toUpperCase()}.20/KK-PEDAMI/${bulan}/${tahun}`
}

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

async function parseDisposalRequest(req: NextRequest) {
  const contentType = req.headers.get("content-type") ?? ""

  if (contentType.includes("multipart/form-data")) {
    const formData = await req.formData()
    const rawFoto = formData.get("foto") ?? formData.get("gambar")
    const foto = rawFoto instanceof File && rawFoto.size > 0 ? rawFoto : null

    return {
      nomor: toNullableString(formData.get("nomor")),
      asset_id: toNullableNumber(formData.get("asset_id")),
      tgl_pengajuan: toNullableString(formData.get("tgl_pengajuan")) ?? "",
      kondisi: toNullableString(formData.get("kondisi")) ?? "",
      keterangan: toNullableString(formData.get("keterangan")) ?? "",
      foto,
      gambar: undefined as string | null | undefined,
    }
  }

  const body = await req.json()
  return {
    nomor: toNullableString(body.nomor),
    asset_id: toNullableNumber(body.asset_id),
    tgl_pengajuan: toNullableString(body.tgl_pengajuan) ?? "",
    kondisi: toNullableString(body.kondisi) ?? "",
    keterangan: toNullableString(body.keterangan) ?? "",
    foto: null,
    gambar: Object.prototype.hasOwnProperty.call(body, "gambar") ? toNullableString(body.gambar) : undefined,
  }
}

export async function GET(req: NextRequest) {
  try {
    const assetId = req.nextUrl.searchParams.get("asset_id")
    const list = await prisma.permohonan_disposal.findMany({
      where: assetId ? { asset_id: Number(assetId) } : undefined,
      orderBy: { tgl_pengajuan: "desc" },
    })

    const [karyawans, assets] = await Promise.all([
      prisma.karyawans.findMany({ select: { id: true, nama_karyawan: true, jabatan: true } }),
      prisma.assets.findMany({ select: { id: true, kode_asset: true, nama_asset: true, gambar: true } }),
    ])

    const kMap = new Map(karyawans.map(k => [Number(k.id), k]))
    const aMap = new Map(assets.map(a => [Number(a.id), a]))

    const enriched = list.map(d => {
      const asset = d.asset_id ? aMap.get(d.asset_id) : null

      return {
        ...d,
        nama_asset:     asset ? `${asset.kode_asset} — ${asset.nama_asset}` : "—",
        asset_gambar:   asset?.gambar ?? null,
        dibuat_oleh_nm: d.dibuat_oleh ? kMap.get(d.dibuat_oleh)?.nama_karyawan ?? "—" : "—",
        manager_nm:     d.manager_id ? kMap.get(d.manager_id)?.nama_karyawan ?? "—" : "—",
        ketua_nm:       d.ketua_id ? kMap.get(d.ketua_id)?.nama_karyawan ?? "—" : "—",
        bendahara_nm:   d.bendahara_id ? kMap.get(d.bendahara_id)?.nama_karyawan ?? "—" : "—",
      }
    })

    return NextResponse.json(serialize(enriched))
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
    const { nomor, asset_id, tgl_pengajuan, kondisi, keterangan, foto, gambar } = await parseDisposalRequest(req)

    if (!asset_id || !tgl_pengajuan || !kondisi || !keterangan) {
      return NextResponse.json({ error: "Field wajib tidak lengkap" }, { status: 400 })
    }
    if (!auth.user.karyawan_id) {
      return NextResponse.json({ error: "User login belum terhubung dengan data karyawan" }, { status: 400 })
    }

    // Auto-fill manager_id dari jabatan. bendahara_id diisi dari user login saat Verif Pengurus.
    const manager = await prisma.karyawans.findFirst({ where: { jabatan: "Manager" } })

    // Format nomor surat
    const nomorFormatted = nomor ? formatNomor(String(nomor)) : null
    const storedFoto = foto ? await uploadServiceBuktiImage(foto, "disposal") : (gambar ?? null)

    const now = new Date()
    const disposal = await prisma.permohonan_disposal.create({
      data: {
        nomor:         nomorFormatted,
        asset_id:      Number(asset_id),
        tgl_pengajuan: new Date(tgl_pengajuan),
        gambar:        storedFoto,
        kondisi:       kondisi,
        keterangan:    keterangan,
        // Status awal: belum diverifikasi
        verif_manager: 0,
        verif_ketua:   0,
        verif_bendahara: 0,
        dibuat_oleh:   auth.user.karyawan_id,
        manager_id:    manager ? Number(manager.id) : null,
        ketua_id:      null,
        bendahara_id:  null,
        created_at:    now,
        updated_at:    now,
      },
    })

    return NextResponse.json(serialize(disposal), { status: 201 })
  } catch (err) {
    console.error(err)
    if (err instanceof Error && (err.message.includes("JPG") || err.message.includes("Ukuran"))) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    return NextResponse.json({ error: "Gagal menyimpan permohonan disposal" }, { status: 500 })
  }
}

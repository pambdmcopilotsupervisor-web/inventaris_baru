import { NextRequest, NextResponse } from "next/server"
import { requireSession } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { generateDisposalPdf } from "@/lib/disposal-pdf"

export const runtime = "nodejs"

function safeFilePart(value: string | null | undefined, fallback: string): string {
  const cleaned = value?.replace(/[^a-z0-9_-]+/gi, "_").replace(/^_+|_+$/g, "")
  return cleaned || fallback
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSession(req)
  if ("error" in auth) return auth.error

  try {
    const { id } = await params
    const disposal = await prisma.permohonan_disposal.findUnique({ where: { id: BigInt(id) } })
    if (!disposal) return NextResponse.json({ error: "Permohonan disposal tidak ditemukan" }, { status: 404 })

    const asset = await prisma.assets.findUnique({ where: { id: BigInt(disposal.asset_id) } })
    if (!asset) return NextResponse.json({ error: "Aset tidak ditemukan" }, { status: 404 })

    const [
      ruangan,
      pengaju,
      manager,
      ketua,
      bendahara,
      penanggungJawab,
      pemakai,
    ] = await Promise.all([
      asset.ruangan_id ? prisma.ruangans.findUnique({ where: { id: asset.ruangan_id } }) : null,
      disposal.dibuat_oleh ? prisma.karyawans.findUnique({ where: { id: BigInt(disposal.dibuat_oleh) } }) : null,
      disposal.manager_id ? prisma.karyawans.findUnique({ where: { id: BigInt(disposal.manager_id) } }) : null,
      disposal.ketua_id ? prisma.karyawans.findUnique({ where: { id: BigInt(disposal.ketua_id) } }) : null,
      disposal.bendahara_id ? prisma.karyawans.findUnique({ where: { id: BigInt(disposal.bendahara_id) } }) : null,
      asset.penanggung_jawab_id ? prisma.karyawans.findUnique({ where: { id: BigInt(asset.penanggung_jawab_id) } }) : null,
      asset.karyawan_id ? prisma.karyawans.findUnique({ where: { id: BigInt(asset.karyawan_id) } }) : null,
    ])

    const pdf = await generateDisposalPdf({
      id: Number(disposal.id),
      nomor: disposal.nomor,
      tgl_pengajuan: disposal.tgl_pengajuan,
      diajukan_pada: disposal.created_at,
      kondisi: disposal.kondisi,
      keterangan: disposal.keterangan,
      gambar: disposal.gambar,
      dibuat_oleh_nm: pengaju?.nama_karyawan ?? null,
      manager_nm: manager?.nama_karyawan ?? null,
      bendahara_nm: bendahara?.nama_karyawan ?? null,
      ketua_nm: ketua?.nama_karyawan ?? null,
      tgl_verif_manager: disposal.tgl_verif_manager,
      tgl_verif_bendahara: disposal.tgl_verif_bendahara,
      tgl_verif_ketua: disposal.tgl_verif_ketua,
      verif_manager: disposal.verif_manager,
      verif_bendahara: disposal.verif_bendahara,
      verif_ketua: disposal.verif_ketua,
      asset: {
        id: Number(asset.id),
        kode_asset: asset.kode_asset,
        nama_asset: asset.nama_asset,
        kelompok_asset: asset.kelompok_asset,
        status_barang: asset.status_barang,
        gambar: asset.gambar,
        hrg_beli: asset.hrg_beli,
        tgl_beli: asset.tgl_beli,
        nama_ruangan: ruangan?.ruangan ?? null,
        lokasi: ruangan?.lokasi ?? null,
        nama_pj: penanggungJawab?.nama_karyawan ?? null,
        nama_pemakai: pemakai?.nama_karyawan ?? null,
      },
    }, {
      printedBy: auth.user.nama_karyawan?.trim() || auth.user.name?.trim() || auth.user.email?.trim() || "Sistem",
    })

    const filePart = safeFilePart(disposal.nomor ?? asset.kode_asset, String(disposal.id))
    const filename = `Permohonan_Disposal_${filePart}.pdf`
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    })
  } catch (error) {
    console.error("[disposal pdf]", error)
    return NextResponse.json({ error: "Gagal membuat PDF permohonan disposal" }, { status: 500 })
  }
}

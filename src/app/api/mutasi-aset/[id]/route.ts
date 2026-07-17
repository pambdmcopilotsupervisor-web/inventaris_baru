import { NextRequest, NextResponse } from "next/server"
import { requireSession } from "@/lib/auth"
import { prisma, serialize } from "@/lib/prisma"
import { canCreateOrEditTransaksi, canDeleteTransaksi, getTransaksiActionError } from "@/lib/transaksi-role"

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const data = await prisma.mutasi_assets.findUnique({ where: { id: Number(id) } })
    if (!data) return NextResponse.json({ error: "Tidak ditemukan" }, { status: 404 })
    return NextResponse.json(serialize(data))
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 })
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
    const body = await req.json()
    const { ruangan_id_t, penanggung_jawab_id_t, karyawan_id_t, tgl_mutasi, deskripsi } = body

    // Ambil record mutasi yang ada
    const mutasi = await prisma.mutasi_assets.findUnique({ where: { id: Number(id) } })
    if (!mutasi) return NextResponse.json({ error: "Mutasi tidak ditemukan" }, { status: 404 })

    // asset_id dikunci — tidak boleh diubah
    const asset = await prisma.assets.findUnique({ where: { id: BigInt(mutasi.asset_id) } })
    if (!asset) return NextResponse.json({ error: "Aset tidak ditemukan" }, { status: 404 })

    // Update record mutasi
    const updated = await prisma.mutasi_assets.update({
      where: { id: Number(id) },
      data: {
        ruangan_id_t:         Number(ruangan_id_t),
        penanggung_jawab_id_t: Number(penanggung_jawab_id_t ?? mutasi.penanggung_jawab_id_t),
        karyawan_id_t:        Number(karyawan_id_t ?? mutasi.karyawan_id_t),
        tgl_mutasi:           new Date(tgl_mutasi),
        deskripsi:            String(deskripsi),
        // gambar_awal dan asset_id dikunci — tidak diubah
      },
    })

    // UPDATE asset dengan data tujuan yang baru
    await prisma.assets.update({
      where: { id: BigInt(mutasi.asset_id) },
      data: {
        ruangan_id:          Number(ruangan_id_t),
        penanggung_jawab_id: Number(penanggung_jawab_id_t ?? mutasi.penanggung_jawab_id_t),
        karyawan_id:         Number(karyawan_id_t ?? mutasi.karyawan_id_t),
      },
    })

    return NextResponse.json(serialize(updated))
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: "Gagal memperbarui mutasi" }, { status: 500 })
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
    await prisma.mutasi_assets.delete({ where: { id: Number(id) } })
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: "Gagal menghapus" }, { status: 500 })
  }
}

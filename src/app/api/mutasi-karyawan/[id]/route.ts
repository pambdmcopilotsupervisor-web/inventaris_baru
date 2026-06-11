import { NextRequest, NextResponse } from "next/server"
import { prisma, serialize } from "@/lib/prisma"

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json()
    const { jabatan_tujuan, divisi_tujuan_id, subdivisi_tujuan_id, tgl_mutasi, no_sk, alasan } = body

    const mutasi = await prisma.mutasi_karyawans.findUnique({ where: { id: BigInt(id) } })
    if (!mutasi) return NextResponse.json({ error: "Tidak ditemukan" }, { status: 404 })

    const updated = await prisma.mutasi_karyawans.update({
      where: { id: BigInt(id) },
      data: {
        jabatan_tujuan,
        divisi_tujuan_id:    divisi_tujuan_id    ? BigInt(divisi_tujuan_id)    : null,
        subdivisi_tujuan_id: subdivisi_tujuan_id ? BigInt(subdivisi_tujuan_id) : null,
        tgl_mutasi: new Date(tgl_mutasi),
        no_sk: no_sk ?? null,
        alasan: alasan ?? null,
      },
    })

    // Update karyawan dengan jabatan dan subdivisi tujuan yang baru
    await prisma.karyawans.update({
      where: { id: mutasi.karyawan_id },
      data: {
        jabatan:         jabatan_tujuan,
        subdivisi_id:    subdivisi_tujuan_id ? Number(subdivisi_tujuan_id) : undefined,
        status_karyawan: "Aktif",
      },
    })

    return NextResponse.json(serialize(updated))
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: "Gagal memperbarui" }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    await prisma.mutasi_karyawans.delete({ where: { id: BigInt(id) } })
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: "Gagal menghapus" }, { status: 500 })
  }
}

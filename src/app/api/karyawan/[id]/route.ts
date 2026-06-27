import { NextRequest, NextResponse } from "next/server"
import { prisma, serialize } from "@/lib/prisma"

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const karyawan = await prisma.karyawans.findUnique({ where: { id: BigInt(id) } })
    if (!karyawan) return NextResponse.json({ error: "Tidak ditemukan" }, { status: 404 })

    // Ambil subdivisi + divisi untuk keperluan auto-fill form
    let divisi_id: number | null = null
    let nama_divisi: string | null = null
    let nama_subdivisi: string | null = null

    if (karyawan.subdivisi_id) {
      const subdivisi = await prisma.subdivisis.findUnique({
        where: { id: BigInt(karyawan.subdivisi_id) },
      })
      if (subdivisi) {
        nama_subdivisi = subdivisi.nama_sub
        divisi_id = subdivisi.divisi_id
        const divisi = await prisma.divisis.findUnique({ where: { id: BigInt(subdivisi.divisi_id) } })
        if (divisi) nama_divisi = divisi.nama_divisi
      }
    }

    return NextResponse.json(serialize({
      ...karyawan,
      divisi_id,
      nama_divisi,
      nama_subdivisi,
    }))
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json()
    // Hapus field computed yang tidak ada di db
    const { divisi_id: _d, nama_divisi: _nd, nama_subdivisi: _ns, ...data } = body
    // Normalisasi field tanggal: string kosong → null (hindari error Prisma @db.Date)
    for (const k of ["tanggal_masuk_kerja", "tanggal_keluar", "tanggal_lahir"]) {
      if (k in data && (data[k] === "" || data[k] === undefined)) data[k] = null
    }
    const updated = await prisma.karyawans.update({ where: { id: BigInt(id) }, data })
    return NextResponse.json(serialize(updated))
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: "Gagal memperbarui" }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    await prisma.karyawans.delete({ where: { id: BigInt(id) } })
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: "Gagal menghapus" }, { status: 500 })
  }
}

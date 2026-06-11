import { NextRequest, NextResponse } from "next/server"
import { prisma, serialize } from "@/lib/prisma"

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json()
    const { tgl_pensiun, jenis_pensiun, no_sk, pesangon, keterangan } = body

    const updated = await prisma.pensiun_karyawans.update({
      where: { id: BigInt(id) },
      data: {
        tgl_pensiun:  new Date(tgl_pensiun),
        jenis_pensiun,
        no_sk:        no_sk ?? null,
        pesangon:     pesangon ? Number(pesangon) : 0,
        keterangan:   keterangan ?? null,
      },
    })

    return NextResponse.json(serialize(updated))
  } catch {
    return NextResponse.json({ error: "Gagal memperbarui" }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params

    // Ambil dulu untuk tahu karyawan_id-nya
    const record = await prisma.pensiun_karyawans.findUnique({ where: { id: BigInt(id) } })

    await prisma.pensiun_karyawans.delete({ where: { id: BigInt(id) } })

    // Jika karyawan masih berstatus Pensiun, kembalikan ke Nonaktif saat dihapus
    if (record) {
      const karyawan = await prisma.karyawans.findUnique({ where: { id: record.karyawan_id } })
      if (karyawan?.status_karyawan === "Pensiun") {
        await prisma.karyawans.update({
          where: { id: record.karyawan_id },
          data: { status_karyawan: "Nonaktif" },
        })
      }
    }

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: "Gagal menghapus" }, { status: 500 })
  }
}

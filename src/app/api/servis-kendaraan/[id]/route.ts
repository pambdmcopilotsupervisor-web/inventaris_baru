import { NextRequest, NextResponse } from "next/server"
import { requireSession } from "@/lib/auth"
import { prisma, serialize } from "@/lib/prisma"
import { canCreateOrEditTransaksi, canDeleteTransaksi, getTransaksiActionError } from "@/lib/transaksi-role"

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSession(req)
  if ("error" in auth) return auth.error
  if (!canCreateOrEditTransaksi(auth.user.role)) {
    return NextResponse.json({ error: getTransaksiActionError("update") }, { status: 403 })
  }

  try {
    const { id } = await params
    const body = await req.json()
    const { tanggal_servis, jenis_servis, biaya, bengkel, keterangan } = body

    const data = await prisma.riwayat_servis_r2r4s.update({
      where: { id: BigInt(id) },
      data: {
        tanggal_servis: new Date(tanggal_servis),
        jenis_servis,
        biaya: biaya ? Number(biaya) : 0,
        bengkel: bengkel ?? null,
        keterangan: keterangan ?? null,
      },
    })

    return NextResponse.json(serialize(data))
  } catch {
    return NextResponse.json({ error: "Gagal memperbarui" }, { status: 500 })
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
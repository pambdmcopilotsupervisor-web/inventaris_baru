import { NextRequest, NextResponse } from "next/server"
import { requireSession } from "@/lib/auth"
import { prisma, serialize } from "@/lib/prisma"
import { canDeleteTransaksi, getTransaksiActionError } from "@/lib/transaksi-role"

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSession(req)
  if ("error" in auth) return auth.error
  if (!canDeleteTransaksi(auth.user.role)) {
    return NextResponse.json({ error: getTransaksiActionError("delete") }, { status: 403 })
  }

  try {
    const { id } = await params
    // Ambil dulu untuk tahu kendaraan_id
    const record = await prisma.penjualan_r2r4s.findUnique({ where: { id: Number(id) } })
    
    await prisma.penjualan_r2r4s.delete({ where: { id: Number(id) } })
    
    // Kembalikan status kendaraan dari 'Terjual' ke 'Operasional Pedami'
    if (record?.data_r2r4_id) {
      const kendaraan = await prisma.data_r2r4s.findUnique({ where: { id: BigInt(record.data_r2r4_id) } })
      if (kendaraan?.stat === "Terjual") {
        await prisma.data_r2r4s.update({
          where: { id: BigInt(record.data_r2r4_id) },
          data: { stat: "Operasional Pedami" },
        })
      }
    }
    
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: "Gagal menghapus" }, { status: 500 })
  }
}

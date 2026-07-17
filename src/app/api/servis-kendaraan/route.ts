import { NextRequest, NextResponse } from "next/server"
import { requireSession } from "@/lib/auth"
import { prisma, serialize } from "@/lib/prisma"
import { canCreateOrEditTransaksi, getTransaksiActionError } from "@/lib/transaksi-role"

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
    const body = await req.json()
    const { data_r2r4_id, tanggal_servis, jenis_servis, biaya, bengkel, keterangan } = body
    if (!data_r2r4_id || !tanggal_servis || !jenis_servis) {
      return NextResponse.json({ error: "Field wajib tidak lengkap" }, { status: 400 })
    }
    const data = await prisma.riwayat_servis_r2r4s.create({
      data: { data_r2r4_id: BigInt(data_r2r4_id), tanggal_servis: new Date(tanggal_servis), jenis_servis, biaya: biaya ? Number(biaya) : 0, bengkel: bengkel ?? null, keterangan: keterangan ?? null },
    })
    return NextResponse.json(serialize(data), { status: 201 })
  } catch { return NextResponse.json({ error: "Gagal menyimpan" }, { status: 500 }) }
}

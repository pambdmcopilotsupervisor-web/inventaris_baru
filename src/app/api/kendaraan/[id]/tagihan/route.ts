import { NextRequest, NextResponse } from "next/server"
import { requireSession } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getCurrentBillingPeriod, getVehicleBillingHistory } from "@/lib/kendaraan-billing"

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSession(req)
  if ("error" in auth) return auth.error

  const { id } = await params
  const currentPeriod = getCurrentBillingPeriod()
  const period = req.nextUrl.searchParams.get("periode") ?? currentPeriod
  if (!/^\d+$/.test(id) || !Number.isSafeInteger(Number(id)) || Number(id) <= 0) {
    return NextResponse.json({ error: "ID kendaraan tidak valid" }, { status: 400 })
  }
  if (!/^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(period) || period > currentPeriod) {
    return NextResponse.json({ error: "Periode harus berupa YYYY-MM dan tidak melebihi bulan berjalan" }, { status: 400 })
  }

  try {
    const [vehicle, details, sales] = await Promise.all([
      prisma.data_r2r4s.findUnique({ where: { id: BigInt(id) }, select: { tgl_stop_tagihan: true } }),
      prisma.kontrak_details.findMany({ where: { data_r2r4_id: Number(id) }, select: { kontrak_id: true } }),
      prisma.penjualan_r2r4s.findMany({
        where: { data_r2r4_id: Number(id), tgl_jual: { not: null } },
        orderBy: { tgl_jual: "asc" }, select: { tgl_jual: true }, take: 1,
      }),
    ])
    if (!vehicle) return NextResponse.json({ error: "Kendaraan tidak ditemukan" }, { status: 404 })

    const ids = [...new Set(details.map(detail => detail.kontrak_id))]
    const contracts = ids.length ? await prisma.kontraks.findMany({
      where: { id: { in: ids.map(id => BigInt(id)) } },
      select: { id: true, no_kontrak: true, tgl_awal: true, tgl_akhir: true },
    }) : []
    return NextResponse.json(getVehicleBillingHistory({
      contracts, period, stopDate: vehicle.tgl_stop_tagihan, saleDate: sales[0]?.tgl_jual ?? null,
    }))
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: "Gagal mengambil riwayat tagihan kendaraan" }, { status: 500 })
  }
}

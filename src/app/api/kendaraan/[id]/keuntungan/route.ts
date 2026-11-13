import { NextRequest, NextResponse } from "next/server"
import { requireSession } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getCurrentBillingPeriod } from "@/lib/kendaraan-billing"
import { getVehicleRentalProfit, type VehicleRentalCost } from "@/lib/kendaraan-profit"

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSession(req)
  if ("error" in auth) return auth.error

  const { id } = await params
  const currentPeriod = getCurrentBillingPeriod()
  const endPeriod = req.nextUrl.searchParams.get("sampai") ?? currentPeriod
  const startPeriod = req.nextUrl.searchParams.get("mulai") || undefined
  const validPeriod = /^[1-9]\d{3}-(0[1-9]|1[0-2])$/
  if (!/^\d+$/.test(id) || !Number.isSafeInteger(Number(id)) || Number(id) <= 0) {
    return NextResponse.json({ error: "ID kendaraan tidak valid" }, { status: 400 })
  }
  if (!validPeriod.test(endPeriod) || endPeriod > currentPeriod || (startPeriod && (!validPeriod.test(startPeriod) || startPeriod > endPeriod))) {
    return NextResponse.json({ error: "Rentang periode tidak valid atau melebihi bulan berjalan" }, { status: 400 })
  }

  try {
    const endDate = new Date(`${endPeriod}-01T00:00:00Z`)
    endDate.setUTCMonth(endDate.getUTCMonth() + 1)
    const dateRange = { ...(startPeriod ? { gte: new Date(`${startPeriod}-01T00:00:00Z`) } : {}), lt: endDate }
    const [vehicle, details, sales, services, payments] = await Promise.all([
      prisma.data_r2r4s.findUnique({ where: { id: BigInt(id) }, select: { hrg_sewa: true, tgl_stop_tagihan: true } }),
      prisma.kontrak_details.findMany({ where: { data_r2r4_id: Number(id) }, select: { kontrak_id: true } }),
      prisma.penjualan_r2r4s.findMany({
        where: { data_r2r4_id: Number(id), tgl_jual: { not: null } },
        orderBy: { tgl_jual: "asc" }, select: { tgl_jual: true }, take: 1,
      }),
      prisma.riwayat_servis_r2r4s.findMany({
        where: { data_r2r4_id: BigInt(id), tanggal_servis: dateRange }, select: { tanggal_servis: true, biaya: true },
      }),
      prisma.riwayat_pembayaran_r2r4s.findMany({
        where: { data_r2r4_id: BigInt(id), tanggal_pembayaran: dateRange },
        select: { tanggal_pembayaran: true, jenis_pembayaran: true, biaya: true },
      }),
    ])
    if (!vehicle) return NextResponse.json({ error: "Kendaraan tidak ditemukan" }, { status: 404 })
    const ids = [...new Set(details.map(detail => detail.kontrak_id))]
    const contracts = ids.length ? await prisma.kontraks.findMany({
      where: { id: { in: ids.map(id => BigInt(id)) } },
      select: { id: true, no_kontrak: true, tgl_awal: true, tgl_akhir: true },
    }) : []
    const paymentKinds = { Pajak: "pajak", STNK: "stnk", KIR: "kir" } as const
    const costs: VehicleRentalCost[] = [
      ...services.map(service => ({ tanggal: service.tanggal_servis, jenis: "servis" as const, biaya: Number(service.biaya) })),
      ...payments.map(payment => ({ tanggal: payment.tanggal_pembayaran, jenis: paymentKinds[payment.jenis_pembayaran], biaya: Number(payment.biaya) })),
    ]
    return NextResponse.json(getVehicleRentalProfit({
      contracts, stopDate: vehicle.tgl_stop_tagihan, saleDate: sales[0]?.tgl_jual ?? null,
      rentalPrice: vehicle.hrg_sewa, costs, startPeriod, endPeriod,
    }))
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: "Gagal mengambil keuntungan sewa kendaraan" }, { status: 500 })
  }
}

import { getVehicleBillingHistory, type BillingContract } from "./kendaraan-billing"

type CostKind = "servis" | "pajak" | "stnk" | "kir"

export interface VehicleRentalCost {
  tanggal: Date
  jenis: CostKind
  biaya: number
}

export interface VehicleProfitMonth {
  periode: string
  ditagihkan: boolean
  no_kontrak: string | null
  pendapatan: number | null
  servis: number
  pajak: number
  stnk: number
  kir: number
  total_biaya: number
  keuntungan: number | null
}

export interface VehicleRentalProfit {
  periode_mulai: string
  periode_sampai: string
  harga_sewa: number | null
  bulan_tagihan: number
  pendapatan: number | null
  servis: number
  pajak: number
  stnk: number
  kir: number
  total_biaya: number
  keuntungan: number | null
  margin_persen: number | null
  riwayat: VehicleProfitMonth[]
}

function monthIndex(period: string): number {
  const [year, month] = period.split("-").map(Number)
  return year * 12 + month - 1
}

export function getVehicleRentalProfit({ contracts, stopDate, saleDate, rentalPrice, costs, startPeriod, endPeriod }: {
  contracts: BillingContract[]
  stopDate?: Date | null
  saleDate?: Date | null
  rentalPrice: number | null
  costs: VehicleRentalCost[]
  startPeriod?: string
  endPeriod: string
}): VehicleRentalProfit {
  const billing = getVehicleBillingHistory({ contracts, stopDate, saleDate, period: endPeriod })
  const firstPeriod = billing.tgl_awal_kontrak?.slice(0, 7)
  const start = startPeriod ?? (firstPeriod && firstPeriod < endPeriod ? firstPeriod : endPeriod)
  const billingByPeriod = new Map(billing.riwayat.map(row => [row.periode, row]))
  const knownPrice = rentalPrice !== null && Number.isFinite(rentalPrice) && rentalPrice >= 0 ? rentalPrice : null
  const costByPeriod = new Map<string, { servis: number; pajak: number; stnk: number; kir: number }>()
  for (const cost of costs) {
    if (!Number.isFinite(cost.tanggal.getTime())) continue
    const period = cost.tanggal.toISOString().slice(0, 7)
    if (period < start || period > endPeriod) continue
    const totals = costByPeriod.get(period) ?? { servis: 0, pajak: 0, stnk: 0, kir: 0 }
    totals[cost.jenis] += cost.biaya
    costByPeriod.set(period, totals)
  }

  const rows: VehicleProfitMonth[] = []
  for (let index = monthIndex(start); index <= monthIndex(endPeriod); index++) {
    const period = `${Math.floor(index / 12)}-${String(index % 12 + 1).padStart(2, "0")}`
    const bill = billingByPeriod.get(period)
    const expenses = costByPeriod.get(period) ?? { servis: 0, pajak: 0, stnk: 0, kir: 0 }
    const totalCost = expenses.servis + expenses.pajak + expenses.stnk + expenses.kir
    const income = bill?.ditagihkan ? knownPrice : 0
    rows.push({
      periode: period, ditagihkan: bill?.ditagihkan ?? false, no_kontrak: bill?.no_kontrak ?? null,
      pendapatan: income, ...expenses, total_biaya: totalCost, keuntungan: income === null ? null : income - totalCost,
    })
  }

  const billedMonths = rows.filter(row => row.ditagihkan).length
  const income = rows.some(row => row.pendapatan === null) ? null : rows.reduce((sum, row) => sum + (row.pendapatan ?? 0), 0)
  const expenses = rows.reduce((sum, row) => ({
    servis: sum.servis + row.servis, pajak: sum.pajak + row.pajak,
    stnk: sum.stnk + row.stnk, kir: sum.kir + row.kir,
  }), { servis: 0, pajak: 0, stnk: 0, kir: 0 })
  const totalCost = expenses.servis + expenses.pajak + expenses.stnk + expenses.kir
  const profit = income === null ? null : income - totalCost

  return {
    periode_mulai: start, periode_sampai: endPeriod, harga_sewa: knownPrice, bulan_tagihan: billedMonths,
    pendapatan: income, ...expenses, total_biaya: totalCost, keuntungan: profit,
    margin_persen: income !== null && income > 0 && profit !== null ? profit / income * 100 : null,
    riwayat: rows.reverse(),
  }
}

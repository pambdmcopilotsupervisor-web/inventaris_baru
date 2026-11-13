/** Aturan periode yang dipakai laporan tagihan, pendapatan, dan detail kendaraan. */
export const BILLING_CUTOFF_DAY = 19

export interface BillingContract {
  id: bigint | number
  no_kontrak?: string | null
  tgl_awal: Date
  tgl_akhir: Date
}

export function isStillBillableThisPeriod(date: Date | null, year: number, month: number): boolean {
  if (!date) return true
  return date.getTime() > Date.UTC(year, month - 1, BILLING_CUTOFF_DAY)
}

export function stopsBillingInThisPeriod(date: Date | null, year: number, month: number): boolean {
  return date !== null && !isStillBillableThisPeriod(date, year, month)
}

export function getContractForBillingPeriod<T extends BillingContract>(contracts: T[], year: number, month: number): T | null {
  const startDate = Date.UTC(year, month - 1, 1)
  const cutoffDate = Date.UTC(year, month - 1, BILLING_CUTOFF_DAY)
  // Satu kendaraan satu tagihan; pilih kontrak berakhir paling akhir seperti laporan.
  return contracts.filter(contract =>
    contract.tgl_awal.getTime() <= cutoffDate && contract.tgl_akhir.getTime() >= startDate,
  ).sort((a, b) => b.tgl_akhir.getTime() - a.tgl_akhir.getTime() || Number(b.id) - Number(a.id))[0] ?? null
}

export function getBillingStopReasons(contractEnd: Date, saleDate: Date | null, stopDate: Date | null, year: number, month: number): string[] {
  const reasons: string[] = []
  if (stopsBillingInThisPeriod(contractEnd, year, month)) reasons.push("kontrak berakhir")
  if (stopsBillingInThisPeriod(saleDate, year, month)) reasons.push("kendaraan terjual")
  if (stopsBillingInThisPeriod(stopDate, year, month)) reasons.push("tagihan dihentikan")
  return reasons
}

export function getVehicleSaleDates(sales: { data_r2r4_id: number | null; tgl_jual: Date | null }[]): Map<number, Date> {
  const dates = new Map<number, Date>()
  for (const sale of sales) {
    if (sale.data_r2r4_id === null || !sale.tgl_jual) continue
    const existing = dates.get(sale.data_r2r4_id)
    if (!existing || sale.tgl_jual < existing) dates.set(sale.data_r2r4_id, sale.tgl_jual)
  }
  return dates
}

export function getCurrentBillingPeriod(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Makassar", year: "numeric", month: "2-digit",
  }).formatToParts(now)
  return `${parts.find(part => part.type === "year")!.value}-${parts.find(part => part.type === "month")!.value}`
}

export interface VehicleBillingMonth {
  periode: string
  ditagihkan: boolean
  no_kontrak: string | null
  tgl_awal: string | null
  tgl_akhir: string | null
  keterangan: string
}

export interface VehicleBillingHistory {
  periode: string
  tgl_awal_kontrak: string | null
  periode_pertama: string | null
  periode_terakhir: string | null
  total_bulan: number
  bulan_jeda: number
  riwayat: VehicleBillingMonth[]
}

export function getVehicleBillingHistory({ contracts, stopDate = null, saleDate = null, period }: {
  contracts: BillingContract[]
  stopDate?: Date | null
  saleDate?: Date | null
  period: string
}): VehicleBillingHistory {
  const sorted = contracts.filter(contract =>
    Number.isFinite(contract.tgl_awal.getTime()) && Number.isFinite(contract.tgl_akhir.getTime()) && contract.tgl_awal <= contract.tgl_akhir,
  ).sort((a, b) => a.tgl_awal.getTime() - b.tgl_awal.getTime())
  const firstStart = sorted[0]?.tgl_awal ?? null
  const rows: VehicleBillingMonth[] = []
  const [year, month] = period.split("-").map(Number)
  const endIndex = year * 12 + month - 1
  const startIndex = firstStart ? firstStart.getUTCFullYear() * 12 + firstStart.getUTCMonth() : endIndex + 1

  for (let index = startIndex; index <= endIndex; index++) {
    const rowYear = Math.floor(index / 12)
    const rowMonth = index % 12 + 1
    const contract = getContractForBillingPeriod(sorted, rowYear, rowMonth)
    const reasons = contract
      ? getBillingStopReasons(contract.tgl_akhir, saleDate, stopDate, rowYear, rowMonth)
      : ["tidak ada kontrak yang memenuhi periode tagihan"]
    // Tetap tampilkan penyebab stop/penjualan pada bulan tanpa kontrak.
    if (!contract) {
      if (stopsBillingInThisPeriod(saleDate, rowYear, rowMonth)) reasons.push("kendaraan terjual")
      if (stopsBillingInThisPeriod(stopDate, rowYear, rowMonth)) reasons.push("tagihan dihentikan")
    }
    rows.push({
      periode: `${rowYear}-${String(rowMonth).padStart(2, "0")}`,
      ditagihkan: contract !== null && reasons.length === 0,
      no_kontrak: contract?.no_kontrak ?? null,
      tgl_awal: contract?.tgl_awal.toISOString().slice(0, 10) ?? null,
      tgl_akhir: contract?.tgl_akhir.toISOString().slice(0, 10) ?? null,
      keterangan: reasons.length ? reasons.join(", ") : "Masuk perhitungan tagihan sewa",
    })
  }

  const billed = rows.filter(row => row.ditagihkan)
  const first = billed[0]?.periode ?? null
  const last = billed[billed.length - 1]?.periode ?? null
  return {
    periode: period,
    tgl_awal_kontrak: firstStart?.toISOString().slice(0, 10) ?? null,
    periode_pertama: first,
    periode_terakhir: last,
    total_bulan: billed.length,
    // Hanya jeda di antara dua periode tagihan, bukan bulan setelah sewa berakhir.
    bulan_jeda: first && last ? rows.filter(row => !row.ditagihkan && row.periode > first && row.periode < last).length : 0,
    riwayat: rows.reverse(),
  }
}

import assert from "node:assert/strict"
import { after, before, it } from "node:test"
import { NextRequest } from "next/server"
import { getVehicleBillingHistory } from "../src/lib/kendaraan-billing"

const date = (value: string) => new Date(`${value}T00:00:00Z`)
const contracts = [
  { id: BigInt(1), no_kontrak: "K-1", judul: "Kontrak awal", tgl_awal: date("2026-01-19"), tgl_akhir: date("2026-02-28") },
  { id: BigInt(2), no_kontrak: "K-2", judul: "Perpanjangan", tgl_awal: date("2026-05-20"), tgl_akhir: date("2026-12-31") },
  { id: BigInt(3), no_kontrak: "K-3", judul: "Kontrak tahunan", tgl_awal: date("2026-01-01"), tgl_akhir: date("2026-12-31") },
  { id: BigInt(4), no_kontrak: "K-4", judul: "Kontrak mendatang", tgl_awal: date("2026-12-01"), tgl_akhir: date("2027-12-31") },
]
const vehicles = [
  { id: BigInt(1), jns_brg: "R2 Operasional", hrg_sewa: 500_000, tgl_stop_tagihan: null },
  { id: BigInt(2), jns_brg: "R4 Dinas", hrg_sewa: 2_000_000, tgl_stop_tagihan: date("2026-04-20") },
  { id: BigInt(3), jns_brg: "R4 Dinas", hrg_sewa: 3_000_000, tgl_stop_tagihan: null },
  { id: BigInt(4), jns_brg: "R2 Operasional", hrg_sewa: 0, tgl_stop_tagihan: null },
  { id: BigInt(5), jns_brg: "R2 Operasional", hrg_sewa: 100_000, tgl_stop_tagihan: null },
].map(vehicle => ({ ...vehicle, kode_brg: `V-${vehicle.id}`, plat: `PLAT-${vehicle.id}`, nm_brg: "Kendaraan", stat: "Habis Kontrak" }))
const details = [
  { data_r2r4_id: 1, kontrak_id: 1 }, { data_r2r4_id: 1, kontrak_id: 2 },
  { data_r2r4_id: 2, kontrak_id: 3 }, { data_r2r4_id: 3, kontrak_id: 3 },
  { data_r2r4_id: 4, kontrak_id: 3 }, { data_r2r4_id: 4, kontrak_id: 3 },
  { data_r2r4_id: 5, kontrak_id: 4 },
]
// Urutan sengaja tidak berdasarkan tanggal; catatan kosong tidak boleh menghapus penjualan.
const sales = [
  { data_r2r4_id: 3, tgl_jual: date("2026-03-19") },
  { data_r2r4_id: 3, tgl_jual: date("2026-06-20") },
  { data_r2r4_id: 3, tgl_jual: null },
]

let reportGet: typeof import("../src/app/api/laporan/tagihan-sewa/route").GET
let getIncome: typeof import("../src/lib/pendapatan-aset-report").getPendapatanAsetReport
const prismaGlobal = globalThis as unknown as { prisma?: unknown }
const previousPrisma = prismaGlobal.prisma

before(async () => {
  // Seluruh query memakai fixture di memori; pengujian tidak mengakses database.
  prismaGlobal.prisma = {
    data_r2r4s: { findMany: async () => vehicles },
    kontrak_details: { findMany: async () => details },
    kontraks: { findMany: async () => contracts },
    penjualan_r2r4s: { findMany: async () => sales, aggregate: async () => ({ _sum: { hrg_jual: 0 } }) },
  }
  const [report, income] = await Promise.all([
    import("../src/app/api/laporan/tagihan-sewa/route"),
    import("../src/lib/pendapatan-aset-report"),
  ])
  reportGet = report.GET
  getIncome = income.getPendapatanAsetReport
})

after(() => { prismaGlobal.prisma = previousPrisma })

it("menyamakan rincian kendaraan dengan laporan tagihan dan pendapatan setiap bulan", async () => {
  const income = await getIncome({ year: 2026, startMonth: 1, endMonth: 7 })
  const expectedPlates = [
    ["PLAT-1", "PLAT-2", "PLAT-3", "PLAT-4"],
    ["PLAT-1", "PLAT-2", "PLAT-3", "PLAT-4"],
    ["PLAT-2", "PLAT-4"], ["PLAT-2", "PLAT-4"], ["PLAT-4"],
    ["PLAT-1", "PLAT-4"], ["PLAT-1", "PLAT-4"],
  ]
  for (let month = 1; month <= 7; month++) {
    const response = await reportGet(new NextRequest(`http://localhost/api/laporan/tagihan-sewa?year=2026&month=${month}`))
    assert.equal(response.status, 200)
    const report = await response.json()
    const active = [...report.roda2, ...report.roda4]
    assert.deepEqual(active.map(row => row.plat).sort(), expectedPlates[month - 1])
    assert.equal(income.incomeTotalsByMonth[month], report.summary.roda2.nominal + report.summary.roda4.nominal)
    assert.equal(income.unitRows[0].months[month], report.summary.roda2.unit)
    assert.equal(income.unitRows[1].months[month], report.summary.roda4.unit)
    for (const vehicle of vehicles) {
      const ids = details.filter(detail => detail.data_r2r4_id === Number(vehicle.id)).map(detail => detail.kontrak_id)
      const history = getVehicleBillingHistory({
        contracts: contracts.filter(contract => ids.includes(Number(contract.id))),
        period: `2026-${String(month).padStart(2, "0")}`,
        stopDate: vehicle.tgl_stop_tagihan,
        saleDate: vehicle.id === BigInt(3) ? date("2026-03-19") : null,
      })
      assert.equal(history.riwayat[0]?.ditagihkan ?? false, active.some(row => row.plat === vehicle.plat))
    }
  }
})

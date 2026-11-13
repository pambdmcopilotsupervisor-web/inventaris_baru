import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { getVehicleRentalProfit, type VehicleRentalCost } from "../src/lib/kendaraan-profit"
import type { BillingContract } from "../src/lib/kendaraan-billing"

const date = (value: string) => new Date(`${value}T00:00:00Z`)
const contract = (id: number, start: string, end: string): BillingContract => ({
  id, no_kontrak: `K-${id}`, tgl_awal: date(start), tgl_akhir: date(end),
})
const cost = (tanggal: string, jenis: VehicleRentalCost["jenis"], biaya: number): VehicleRentalCost => ({ tanggal: date(tanggal), jenis, biaya })

describe("estimasi keuntungan sewa kendaraan", () => {
  it("mengurangi semua kategori biaya dari sewa bulanan dan menghitung margin", () => {
    const result = getVehicleRentalProfit({
      contracts: [contract(1, "2026-01-01", "2026-12-31")], rentalPrice: 1_000_000, endPeriod: "2026-03",
      costs: [cost("2026-01-15", "servis", 200_000), cost("2026-02-19", "pajak", 300_000), cost("2026-02-28", "stnk", 50_000), cost("2026-03-20", "kir", 50_000)],
    })
    assert.equal(result.periode_mulai, "2026-01")
    assert.equal(result.bulan_tagihan, 3)
    assert.equal(result.pendapatan, 3_000_000)
    assert.equal(result.servis, 200_000)
    assert.equal(result.pajak, 300_000)
    assert.equal(result.stnk, 50_000)
    assert.equal(result.kir, 50_000)
    assert.equal(result.total_biaya, 600_000)
    assert.equal(result.keuntungan, 2_400_000)
    assert.equal(result.margin_persen, 80)
    assert.equal(result.riwayat.reduce((sum, row) => sum + (row.keuntungan ?? 0), 0), result.keuntungan)
  })

  it("membatasi biaya dan pendapatan pada kedua ujung rentang bulan termasuk akhir Februari kabisat", () => {
    const result = getVehicleRentalProfit({
      contracts: [contract(1, "2023-01-01", "2025-12-31")], rentalPrice: 1_000_000, startPeriod: "2024-02", endPeriod: "2024-03",
      costs: [cost("2024-01-31", "servis", 900_000), cost("2024-02-01", "servis", 100_000), cost("2024-02-29", "servis", 200_000), cost("2024-03-31", "pajak", 300_000), cost("2024-04-01", "kir", 900_000)],
    })
    assert.equal(result.pendapatan, 2_000_000)
    assert.equal(result.total_biaya, 600_000)
    assert.equal(result.keuntungan, 1_400_000)
    assert.deepEqual(result.riwayat.map(row => row.periode), ["2024-03", "2024-02"])
  })

  it("tetap memasukkan biaya bulan jeda dan setelah berhenti serta menghitung rugi", () => {
    const result = getVehicleRentalProfit({
      contracts: [contract(1, "2026-01-01", "2026-01-31"), contract(2, "2026-04-20", "2026-06-30")],
      rentalPrice: 500_000, endPeriod: "2026-07",
      costs: [cost("2026-03-15", "servis", 800_000), cost("2026-07-10", "pajak", 1_000_000)],
    })
    assert.equal(result.bulan_tagihan, 3, "Januari, Mei, Juni")
    assert.equal(result.pendapatan, 1_500_000)
    assert.equal(result.total_biaya, 1_800_000)
    assert.equal(result.keuntungan, -300_000)
    assert.equal(result.margin_persen, -20)
    assert.equal(result.riwayat.find(row => row.periode === "2026-03")?.keuntungan, -800_000)
    assert.equal(result.riwayat[0].keuntungan, -1_000_000)
  })

  it("menerapkan cutoff penjualan dan stop tanpa menghapus biaya berikutnya", () => {
    for (const stop of [{ saleDate: date("2026-02-19") }, { stopDate: date("2026-02-19") }]) {
      const result = getVehicleRentalProfit({
        contracts: [contract(1, "2026-01-01", "2026-12-31")], rentalPrice: 1_000_000, endPeriod: "2026-03",
        ...stop, costs: [cost("2026-03-25", "servis", 300_000)],
      })
      assert.equal(result.bulan_tagihan, 1)
      assert.equal(result.pendapatan, 1_000_000)
      assert.equal(result.keuntungan, 700_000)
      assert.equal(result.riwayat[0].pendapatan, 0)
      assert.equal(result.riwayat[0].servis, 300_000)
    }
  })

  it("tidak menggandakan pendapatan saat kontrak tumpang tindih atau diperpanjang lintas tahun", () => {
    const result = getVehicleRentalProfit({
      contracts: [contract(1, "2025-12-20", "2026-02-28"), contract(2, "2026-02-01", "2026-12-31")],
      rentalPrice: 750_000, costs: [], endPeriod: "2026-03",
    })
    assert.equal(result.bulan_tagihan, 3)
    assert.equal(result.pendapatan, 2_250_000)
    assert.equal(result.total_biaya, 0)
    assert.equal(result.keuntungan, 2_250_000)
    assert.equal(result.riwayat.find(row => row.periode === "2026-02")?.no_kontrak, "K-2")
  })

  it("tidak menyamakan harga sewa kosong dengan tarif nol", () => {
    const input = {
      contracts: [contract(1, "2026-01-01", "2026-12-31")], costs: [cost("2026-01-05", "servis", 100_000)], endPeriod: "2026-01",
    }
    const unknown = getVehicleRentalProfit({ ...input, rentalPrice: null })
    assert.equal(unknown.pendapatan, null)
    assert.equal(unknown.keuntungan, null)
    assert.equal(unknown.margin_persen, null)
    assert.equal(unknown.total_biaya, 100_000)
    const free = getVehicleRentalProfit({ ...input, rentalPrice: 0 })
    assert.equal(free.pendapatan, 0)
    assert.equal(free.keuntungan, -100_000)
    assert.equal(free.margin_persen, null)
  })

  it("menghitung biaya meskipun tidak ada kontrak atau seluruh kontrak masih akan datang", () => {
    for (const contracts of [[], [contract(1, "2026-12-01", "2027-12-31")]]) {
      const result = getVehicleRentalProfit({
        contracts, rentalPrice: null, costs: [cost("2026-03-05", "kir", 50_000)], endPeriod: "2026-03",
      })
      assert.equal(result.periode_mulai, "2026-03")
      assert.equal(result.bulan_tagihan, 0)
      assert.equal(result.pendapatan, 0)
      assert.equal(result.keuntungan, -50_000)
      assert.equal(result.margin_persen, null)
    }
  })

  it("memungkinkan analisis biaya sebelum kontrak bila rentang dipilih secara eksplisit", () => {
    const result = getVehicleRentalProfit({
      contracts: [contract(1, "2026-03-19", "2026-12-31")], rentalPrice: 1_000_000, startPeriod: "2026-01", endPeriod: "2026-03",
      costs: [cost("2026-01-15", "servis", 250_000)],
    })
    assert.equal(result.bulan_tagihan, 1)
    assert.equal(result.keuntungan, 750_000)
    assert.equal(result.riwayat.find(row => row.periode === "2026-01")?.keuntungan, -250_000)
  })
})

import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  getContractForBillingPeriod, getCurrentBillingPeriod, getVehicleBillingHistory, getVehicleSaleDates,
  isStillBillableThisPeriod, type BillingContract,
} from "../src/lib/kendaraan-billing"

const date = (value: string) => new Date(`${value}T00:00:00Z`)
function contract(id: number, start: string, end: string): BillingContract {
  return { id, no_kontrak: `K-${id}`, tgl_awal: date(start), tgl_akhir: date(end) }
}
const billedPeriods = (history: ReturnType<typeof getVehicleBillingHistory>) =>
  history.riwayat.filter(row => row.ditagihkan).map(row => row.periode).reverse()

describe("rincian penagihan kendaraan", () => {
  it("membedakan mulai tanggal 19 dan 20 serta hanya menghitung sampai periode pilihan", () => {
    const early = getVehicleBillingHistory({ contracts: [contract(1, "2026-06-19", "2027-06-30")], period: "2026-08" })
    const late = getVehicleBillingHistory({ contracts: [contract(1, "2026-06-20", "2027-06-30")], period: "2026-08" })
    assert.deepEqual(billedPeriods(early), ["2026-06", "2026-07", "2026-08"])
    assert.deepEqual(billedPeriods(late), ["2026-07", "2026-08"])
    assert.equal(late.tgl_awal_kontrak, "2026-06-20")
    assert.equal(late.periode_pertama, "2026-07")
    assert.equal(late.periode_terakhir, "2026-08")
    assert.equal(late.total_bulan, 2)
    assert.equal(late.bulan_jeda, 0)
  })

  it("mengecualikan bulan berakhir tanggal 19 dan menyertakan bulan berakhir tanggal 20", () => {
    for (const [day, expected] of [["19", ["2026-01", "2026-02"]], ["20", ["2026-01", "2026-02", "2026-03"]]] as const) {
      const result = getVehicleBillingHistory({ contracts: [contract(1, "2026-01-01", `2026-03-${day}`)], period: "2026-06" })
      assert.deepEqual(billedPeriods(result), expected)
      assert.equal(result.bulan_jeda, 0, "bulan setelah kontrak berakhir bukan jeda antartagihan")
    }
  })

  it("menggabungkan perpanjangan lintas tahun tanpa menggandakan bulan tumpang tindih", () => {
    const result = getVehicleBillingHistory({ contracts: [
      contract(1, "2025-11-01", "2026-01-31"), contract(2, "2026-01-01", "2026-04-30"),
      contract(2, "2026-01-01", "2026-04-30"),
    ], period: "2026-03" })
    assert.deepEqual(billedPeriods(result), ["2025-11", "2025-12", "2026-01", "2026-02", "2026-03"])
    assert.equal(result.total_bulan, 5)
    assert.equal(result.riwayat.find(row => row.periode === "2026-01")?.no_kontrak, "K-2")
    assert.equal(result.bulan_jeda, 0)
  })

  it("mengecualikan jeda dan awal perpanjangan setelah tanggal 19 dari total", () => {
    const result = getVehicleBillingHistory({ contracts: [
      contract(1, "2026-01-01", "2026-02-28"), contract(2, "2026-05-20", "2026-09-30"),
    ], period: "2026-07" })
    assert.deepEqual(billedPeriods(result), ["2026-01", "2026-02", "2026-06", "2026-07"])
    assert.equal(result.total_bulan, 4)
    assert.equal(result.bulan_jeda, 3)
    assert.equal(result.riwayat.find(row => row.periode === "2026-05")?.ditagihkan, false)
  })

  it("menerapkan batas tanggal 19 pada stop manual dan penjualan", () => {
    for (const key of ["stopDate", "saleDate"] as const) {
      for (const [day, expected] of [["19", 2], ["20", 3]] as const) {
        const result = getVehicleBillingHistory({
          contracts: [contract(1, "2026-01-01", "2026-12-31")], period: "2026-06", [key]: date(`2026-03-${day}`),
        })
        assert.equal(result.total_bulan, expected)
        assert.equal(result.bulan_jeda, 0)
        assert.match(result.riwayat[0].keterangan, key === "stopDate" ? /tagihan dihentikan/ : /kendaraan terjual/)
      }
    }
  })

  it("menggunakan penghentian paling awal dan tidak menagih lagi lewat perpanjangan setelah penjualan", () => {
    const result = getVehicleBillingHistory({ contracts: [
      contract(1, "2026-01-01", "2026-06-30"), contract(2, "2026-07-01", "2026-12-31"),
    ], period: "2026-10", saleDate: date("2026-04-19"), stopDate: date("2026-08-20") })
    assert.deepEqual(billedPeriods(result), ["2026-01", "2026-02", "2026-03"])
    assert.equal(result.riwayat[0].ditagihkan, false)
  })

  it("menggunakan tanggal penjualan pertama meskipun ada beberapa catatan atau tanggal kosong", () => {
    const sales = [
      { data_r2r4_id: 1, tgl_jual: date("2026-08-20") },
      { data_r2r4_id: 1, tgl_jual: date("2026-03-19") },
      { data_r2r4_id: 1, tgl_jual: null },
      { data_r2r4_id: null, tgl_jual: date("2026-01-01") },
    ]
    assert.deepEqual(getVehicleSaleDates(sales), new Map([[1, date("2026-03-19")]]))
    assert.deepEqual(getVehicleSaleDates([...sales].reverse()), getVehicleSaleDates(sales))
  })

  it("tidak menghitung kontrak akan datang, kontrak singkat tanpa periode layak, atau kendaraan tanpa kontrak", () => {
    for (const contracts of [[], [contract(1, "2026-12-01", "2027-12-31")], [contract(1, "2026-06-20", "2026-07-19")]]) {
      const result = getVehicleBillingHistory({ contracts, period: "2026-08" })
      assert.equal(result.total_bulan, 0)
      assert.equal(result.periode_pertama, null)
      assert.equal(result.periode_terakhir, null)
      assert.equal(result.bulan_jeda, 0)
    }
  })

  it("periode historis tidak memasukkan perpanjangan dan tagihan masa depan", () => {
    const result = getVehicleBillingHistory({ contracts: [
      contract(1, "2026-01-01", "2026-02-28"), contract(2, "2026-05-01", "2026-12-31"),
    ], period: "2026-04" })
    assert.deepEqual(billedPeriods(result), ["2026-01", "2026-02"])
    assert.equal(result.bulan_jeda, 0)
    assert.equal(result.riwayat[0].periode, "2026-04")
    assert.equal(result.riwayat[0].ditagihkan, false)
  })

  it("memilih kontrak dengan akhir terjauh lalu ID terbesar seperti laporan", () => {
    const contracts = [contract(1, "2026-01-01", "2026-02-28"), contract(2, "2026-01-01", "2026-12-31"), contract(3, "2026-01-01", "2026-12-31")]
    assert.equal(getContractForBillingPeriod(contracts, 2026, 2)?.id, 3)
    assert.deepEqual(contracts.map(contract => contract.id), [1, 2, 3], "tidak mengubah urutan data sumber")
    assert.equal(getContractForBillingPeriod(contracts, 2025, 12), null)
    assert.equal(isStillBillableThisPeriod(null, 2026, 2), true)
  })

  it("menggunakan bulan WITA saat pergantian bulan UTC dan menangani Februari kabisat", () => {
    assert.equal(getCurrentBillingPeriod(new Date("2026-11-30T16:00:00Z")), "2026-12")
    assert.equal(getCurrentBillingPeriod(new Date("2026-11-30T15:59:59Z")), "2026-11")
    const result = getVehicleBillingHistory({ contracts: [contract(1, "2024-01-20", "2024-02-29")], period: "2024-03" })
    assert.deepEqual(billedPeriods(result), ["2024-02"])
  })
})

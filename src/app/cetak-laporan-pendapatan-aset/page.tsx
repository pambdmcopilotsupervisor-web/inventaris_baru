"use client"

import { useEffect, useMemo, useRef, useState } from "react"

interface IncomeRow {
  label: string
  months: Record<number, number>
  total: number
}

interface TrendVehicleItem {
  id: number
  kode: string
  plat: string
  nama: string
  pemegang: string
  departemen: string
  hrg: number
}

interface TrendEntry {
  added: TrendVehicleItem[]
  removed: TrendVehicleItem[]
}

interface ReportData {
  periodLabel: string
  year: number
  startMonth: number
  endMonth: number
  months: number[]
  monthLabels: Record<number, string>
  incomeRows: IncomeRow[]
  unitRows: IncomeRow[]
  incomeTotalsByMonth: Record<number, number>
  grandTotal: number
  vehicleTrendDetails: { r2: Record<number, TrendEntry>; r4: Record<number, TrendEntry> }
}

interface FilterParams {
  start_month: number
  end_month: number
  year: number
}

const MONTHS: Record<number, string> = {
  1: "Januari", 2: "Februari", 3: "Maret", 4: "April", 5: "Mei", 6: "Juni",
  7: "Juli", 8: "Agustus", 9: "September", 10: "Oktober", 11: "November", 12: "Desember",
}

const MONTH_SHORT: Record<number, string> = {
  1: "Jan", 2: "Feb", 3: "Mar", 4: "Apr", 5: "Mei", 6: "Jun",
  7: "Jul", 8: "Agu", 9: "Sep", 10: "Okt", 11: "Nov", 12: "Des",
}

const rupiahAccountingFormatter = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  currencyDisplay: "symbol",
  currencySign: "accounting",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

function formatRupiahAccounting(value: number): string {
  return rupiahAccountingFormatter.format(Number(value) || 0).replace(/\u00A0/g, " ")
}

function formatTableAmount(value: number): string {
  if (!value) return "-"
  return new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(value)
}

function formatCompactRupiah(value: number): string {
  const amount = Number(value) || 0
  if (Math.abs(amount) >= 1_000_000_000) return `Rp ${(amount / 1_000_000_000).toLocaleString("id-ID", { maximumFractionDigits: 1 })} M`
  if (Math.abs(amount) >= 1_000_000) return `Rp ${(amount / 1_000_000).toLocaleString("id-ID", { maximumFractionDigits: 1 })} jt`
  return formatRupiahAccounting(amount)
}

function buildSubtitle(params: FilterParams | null): string {
  if (!params) return "Semua Periode"
  const startLabel = MONTHS[params.start_month] ?? String(params.start_month)
  const endLabel = MONTHS[params.end_month] ?? String(params.end_month)
  return params.start_month === params.end_month
    ? `Periode: ${startLabel} ${params.year}`
    : `Periode: ${startLabel} – ${endLabel} ${params.year}`
}

function buildNotes(
  label: string,
  months: Record<number, number>,
  monthLabels: Record<number, string>,
  vehicleTrend: Record<number, TrendEntry>,
  periodLabel: string,
): string[] {
  const notes: string[] = []
  const monthNums = Object.keys(months).map(Number)
  let prevValue: number | null = null
  let prevMonth: number | null = null

  for (const month of monthNums) {
    const value = months[month] ?? 0
    if (prevValue !== null && value !== prevValue) {
      const delta = value - prevValue
      const status = delta > 0 ? "kenaikan" : "penurunan"
      const trend = vehicleTrend[month] ?? { added: [], removed: [] }
      const details: string[] = []

      if (status === "kenaikan" && trend.added.length > 0) {
        details.push("kendaraan bertambah: " + trend.added.map((vehicle) => (
          `${vehicle.kode ?? "-"} / ${vehicle.plat ?? "-"} / ${vehicle.nama ?? "-"} / ${vehicle.pemegang ?? "-"} / ${vehicle.departemen ?? "-"}`
        )).join("; "))
      }

      if (status === "penurunan" && trend.removed.length > 0) {
        details.push("kendaraan berkurang: " + trend.removed.map((vehicle) => (
          `${vehicle.kode ?? "-"} / ${vehicle.plat ?? "-"} / ${vehicle.nama ?? "-"} / ${vehicle.pemegang ?? "-"} / ${vehicle.departemen ?? "-"}`
        )).join("; "))
      }

      notes.push(
        `${label} mengalami ${status} sebesar ${formatRupiahAccounting(Math.abs(delta))} dari ${(monthLabels[prevMonth!] ?? "").toUpperCase()} ke ${(monthLabels[month] ?? "").toUpperCase()}` +
        (details.length > 0 ? ` dengan ${details.join(" | ")}` : "") + ".",
      )
    }

    prevValue = value
    prevMonth = month
  }

  if (notes.length === 0) {
    notes.push(`${label} cenderung stabil pada periode ${periodLabel}.`)
  }

  return notes
}

function readStoredParams(): FilterParams {
  try {
    const stored = sessionStorage.getItem("cetak-laporan-pendapatan-aset-params")
    return stored ? JSON.parse(stored) : {
      start_month: new Date().getMonth() + 1,
      end_month: new Date().getMonth() + 1,
      year: new Date().getFullYear(),
    }
  } catch {
    return {
      start_month: new Date().getMonth() + 1,
      end_month: new Date().getMonth() + 1,
      year: new Date().getFullYear(),
    }
  }
}

export default function CetakLaporanPendapatanAsetPage() {
  const [data, setData] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [params] = useState<FilterParams>(readStoredParams)
  const didPrint = useRef(false)
  const printedAt = useMemo(
    () => new Date().toLocaleString("id-ID", {
      timeZone: "Asia/Makassar",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }),
    [],
  )

  useEffect(() => {
    const qs = new URLSearchParams({
      start_month: String(params.start_month),
      end_month: String(params.end_month),
      year: String(params.year),
    })

    fetch(`/api/laporan/pendapatan-aset?${qs.toString()}`)
      .then((response) => response.json())
      .then((json) => { setData(json); setLoading(false) })
      .catch(() => setLoading(false))
  }, [params])

  useEffect(() => {
    if (!loading && data && !didPrint.current) {
      didPrint.current = true
      setTimeout(() => window.print(), 400)
    }
  }, [loading, data])

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "sans-serif", color: "#666" }}>
        Memuat laporan pendapatan aset...
      </div>
    )
  }

  if (!data) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "sans-serif", color: "#666" }}>
        Gagal memuat laporan pendapatan aset.
      </div>
    )
  }

  const incomeTotals = data.months.map((month) => data.incomeTotalsByMonth[month] ?? 0)
  const unitTotals = data.months.map((month) => data.unitRows.reduce((sum, row) => sum + (row.months[month] ?? 0), 0))
  const maxIncomeTotal = Math.max(...incomeTotals, 1)
  const maxUnitTotal = Math.max(...unitTotals, 1)
  const monthHeaderLabels = data.months.length > 6 ? MONTH_SHORT : data.monthLabels
  const roda2Notes = buildNotes(
    "Pendapatan kendaraan roda dua",
    data.incomeRows[0]?.months ?? {},
    data.monthLabels,
    data.vehicleTrendDetails?.r2 ?? {},
    data.periodLabel,
  )
  const roda4Notes = buildNotes(
    "Pendapatan kendaraan roda empat",
    data.incomeRows[1]?.months ?? {},
    data.monthLabels,
    data.vehicleTrendDetails?.r4 ?? {},
    data.periodLabel,
  )

  return (
    <>
      <style>{`
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: sans-serif; font-size: 8pt; color: #333; background: #fff; }
        .print-page { padding: 8mm 10mm; }
        .header { text-align: center; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 2px solid #000; }
        .header h1 { font-size: 13pt; font-weight: bold; color: #000; }
        .header h2 { font-size: 11pt; font-weight: bold; color: #000; margin-top: 4px; }
        .header p { font-size: 8.5pt; margin-top: 4px; color: #555; }
        .section { break-inside: avoid; page-break-inside: avoid; }
        .section-title { font-size: 9.5pt; font-weight: 700; margin-top: 14px; margin-bottom: 5px; }
        .section-title small { color: #64748b; font-size: 7.5pt; font-weight: 400; }
        table { width: 100%; border-collapse: collapse; table-layout: fixed; }
        th, td { border: 1px solid #000; padding: 3px 2px; font-size: 6.7pt; word-wrap: break-word; overflow-wrap: break-word; vertical-align: middle; }
        th { background: #e5e7eb; text-align: center; font-weight: 700; }
        tfoot td { background: #f1f5f9; }
        .col-no { width: 3.5%; }
        .col-label { width: 16%; }
        .col-total { width: 10.5%; }
        .month-cell { width: auto; }
        .income-table th, .income-table td { font-size: 6.2pt; padding: 2.5px 1.5px; }
        .unit-table th, .unit-table td { font-size: 6.8pt; padding: 3px 2px; }
        .text-center { text-align: center; }
        .text-right { text-align: right; }
        .chart-section { margin-top: 14px; break-inside: avoid; page-break-inside: avoid; }
        .chart-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .chart-box { border: 1px solid #cbd5e1; padding: 8px; min-height: 132px; break-inside: avoid; page-break-inside: avoid; }
        .chart-title { font-size: 8.5pt; font-weight: 700; margin-bottom: 6px; color: #0f172a; }
        .bar-chart { height: 92px; display: flex; align-items: end; gap: 4px; border-left: 1px solid #94a3b8; border-bottom: 1px solid #94a3b8; padding: 4px 4px 0; }
        .bar-item { flex: 1; min-width: 0; height: 100%; display: flex; align-items: end; justify-content: center; }
        .bar { width: 70%; min-height: 2px; background: #1E40AF; }
        .bar.unit { background: #7C3AED; }
        .chart-labels { display: flex; gap: 4px; margin-top: 3px; font-size: 5.8pt; color: #475569; }
        .chart-labels span { flex: 1; text-align: center; white-space: nowrap; }
        .chart-values { margin-top: 4px; font-size: 6.2pt; color: #475569; text-align: center; }
        .notes { margin-top: 14px; padding: 10px; border: 1px solid #d97706; background: #fffbeb; break-inside: avoid; page-break-inside: avoid; }
        .notes h3 { font-size: 9pt; margin-bottom: 8px; }
        .notes ul { padding-left: 18px; }
        .notes li { margin-bottom: 3px; line-height: 1.35; }
        .no-print { margin: 20px; display: flex; gap: 10px; }
        @media print {
          .no-print { display: none !important; }
          @page { margin: 7mm; size: A4 landscape; }
          body { font-size: 7.5pt; }
          .print-page { padding: 0; }
          .header { margin-bottom: 9px; }
          .section-title { margin-top: 10px; }
          .chart-section { break-before: auto; }
          .notes { break-inside: auto; page-break-inside: auto; }
        }
      `}</style>

      <div className="no-print">
        <button
          onClick={() => window.print()}
          style={{ padding: "8px 20px", background: "#1E40AF", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "13px", fontWeight: 600 }}
        >
          🖨️ Cetak / Simpan PDF
        </button>
        <button
          onClick={() => window.close()}
          style={{ padding: "8px 16px", background: "#f1f5f9", color: "#333", border: "1px solid #cbd5e1", borderRadius: "6px", cursor: "pointer", fontSize: "13px" }}
        >
          Tutup
        </button>
      </div>

      <div className="print-page">
        <div className="header">
          <h1>LAPORAN PENDAPATAN ASET</h1>
          <h2>KOPERASI KONSUMEN PEDAMI</h2>
          <p>{buildSubtitle(params)}</p>
          <p>Dicetak pada: {printedAt}</p>
        </div>

        <div className="section">
        <p className="section-title">Tabel Pendapatan <small>(nominal bulan dalam rupiah)</small></p>
        <table className="income-table">
          <thead>
            <tr>
              <th className="col-no">No</th>
              <th className="col-label">Jenis Pendapatan</th>
              {data.months.map((month) => (
                <th key={month} className="month-cell">{monthHeaderLabels[month]}</th>
              ))}
              <th className="col-total">Total</th>
            </tr>
          </thead>
          <tbody>
            {data.incomeRows.map((row, index) => (
              <tr key={row.label}>
                <td className="text-center">{index + 1}</td>
                <td>{row.label}</td>
                {data.months.map((month) => (
                  <td key={month} className="text-right">{formatTableAmount(row.months[month] ?? 0)}</td>
                ))}
                <td className="text-right"><strong>{formatTableAmount(row.total)}</strong></td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={2}><strong>TOTAL PENDAPATAN</strong></td>
              {data.months.map((month) => (
                <td key={month} className="text-right"><strong>{formatTableAmount(data.incomeTotalsByMonth[month] ?? 0)}</strong></td>
              ))}
              <td className="text-right"><strong>{formatTableAmount(data.grandTotal)}</strong></td>
            </tr>
          </tfoot>
        </table>
        </div>

        <div className="section">
        <p className="section-title">Jumlah Unit Aktif Tagihan</p>
        <table className="unit-table">
          <thead>
            <tr>
              <th className="col-no">No</th>
              <th className="col-label">Jenis</th>
              {data.months.map((month) => (
                <th key={month} className="month-cell">{monthHeaderLabels[month]}</th>
              ))}
              <th className="col-total">Total</th>
            </tr>
          </thead>
          <tbody>
            {data.unitRows.map((row, index) => (
              <tr key={row.label}>
                <td className="text-center">{index + 1}</td>
                <td>{row.label}</td>
                {data.months.map((month) => (
                  <td key={month} className="text-center">{row.months[month] ? row.months[month] : "—"}</td>
                ))}
                <td className="text-center"><strong>{row.total}</strong></td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>

        <div className="chart-section">
          <p className="section-title">Grafik Ringkasan</p>
          <div className="chart-grid">
            <div className="chart-box">
              <p className="chart-title">Total Pendapatan per Bulan</p>
              <div className="bar-chart" aria-label="Grafik total pendapatan per bulan">
                {data.months.map((month, index) => (
                  <div className="bar-item" key={month} title={`${data.monthLabels[month]}: ${formatRupiahAccounting(incomeTotals[index] ?? 0)}`}>
                    <div className="bar" style={{ height: `${Math.max(((incomeTotals[index] ?? 0) / maxIncomeTotal) * 100, incomeTotals[index] ? 4 : 2)}%` }} />
                  </div>
                ))}
              </div>
              <div className="chart-labels">
                {data.months.map((month) => <span key={month}>{MONTH_SHORT[month]}</span>)}
              </div>
              <div className="chart-values">
                Tertinggi: {formatCompactRupiah(maxIncomeTotal)} • Total: {formatCompactRupiah(data.grandTotal)}
              </div>
            </div>

            <div className="chart-box">
              <p className="chart-title">Jumlah Unit Aktif per Bulan</p>
              <div className="bar-chart" aria-label="Grafik jumlah unit aktif per bulan">
                {data.months.map((month, index) => (
                  <div className="bar-item" key={month} title={`${data.monthLabels[month]}: ${unitTotals[index] ?? 0} unit`}>
                    <div className="bar unit" style={{ height: `${Math.max(((unitTotals[index] ?? 0) / maxUnitTotal) * 100, unitTotals[index] ? 4 : 2)}%` }} />
                  </div>
                ))}
              </div>
              <div className="chart-labels">
                {data.months.map((month) => <span key={month}>{MONTH_SHORT[month]}</span>)}
              </div>
              <div className="chart-values">
                Tertinggi: {maxUnitTotal} unit • Total akumulasi: {unitTotals.reduce((sum, value) => sum + value, 0)} unit
              </div>
            </div>
          </div>
        </div>

        <div className="notes">
          <h3>Catatan</h3>
          <div style={{ marginBottom: 10 }}>
            <strong>Roda Dua (R2)</strong>
            <ul>
              {roda2Notes.map((note, index) => <li key={`r2-${index}`}>{note}</li>)}
            </ul>
          </div>
          <div>
            <strong>Roda Empat (R4)</strong>
            <ul>
              {roda4Notes.map((note, index) => <li key={`r4-${index}`}>{note}</li>)}
            </ul>
          </div>
        </div>
      </div>
    </>
  )
}

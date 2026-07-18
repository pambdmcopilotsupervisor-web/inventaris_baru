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

function formatNumber(value: number): string {
  return value.toLocaleString("id-ID")
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
        `${label} mengalami ${status} sebesar Rp ${Math.abs(delta).toLocaleString("id-ID")} dari ${(monthLabels[prevMonth!] ?? "").toUpperCase()} ke ${(monthLabels[month] ?? "").toUpperCase()}` +
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
        .header { text-align: center; margin-bottom: 16px; padding-bottom: 8px; border-bottom: 2px solid #000; }
        .header h1 { font-size: 13pt; font-weight: bold; color: #000; }
        .header h2 { font-size: 11pt; font-weight: bold; color: #000; margin-top: 4px; }
        .header p { font-size: 8.5pt; margin-top: 4px; color: #555; }
        .section-title { font-size: 10pt; font-weight: 700; margin-top: 18px; margin-bottom: 6px; }
        table { width: 100%; border-collapse: collapse; table-layout: fixed; }
        th, td { border: 1px solid #000; padding: 4px 3px; font-size: 7.5pt; word-wrap: break-word; overflow-wrap: break-word; }
        th { background: #e5e7eb; text-align: center; font-weight: 700; }
        .text-center { text-align: center; }
        .text-right { text-align: right; }
        .notes { margin-top: 18px; padding: 12px; border: 1px solid #d97706; background: #fffbeb; }
        .notes h3 { font-size: 9pt; margin-bottom: 8px; }
        .notes ul { padding-left: 18px; }
        .notes li { margin-bottom: 4px; line-height: 1.5; }
        .no-print { margin: 20px; display: flex; gap: 10px; }
        @media print {
          .no-print { display: none !important; }
          @page { margin: 8mm; size: A4 landscape; }
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

      <div style={{ padding: "8mm 12mm" }}>
        <div className="header">
          <h1>LAPORAN PENDAPATAN ASET</h1>
          <h2>KOPERASI KONSUMEN PEDAMI</h2>
          <p>{buildSubtitle(params)}</p>
          <p>Dicetak pada: {printedAt}</p>
        </div>

        <p className="section-title">Tabel Pendapatan</p>
        <table>
          <thead>
            <tr>
              <th style={{ width: "4%" }}>No</th>
              <th style={{ width: "20%" }}>Jenis Pendapatan</th>
              {data.months.map((month) => (
                <th key={month}>{data.monthLabels[month]}</th>
              ))}
              <th style={{ width: "12%" }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {data.incomeRows.map((row, index) => (
              <tr key={row.label}>
                <td className="text-center">{index + 1}</td>
                <td>{row.label}</td>
                {data.months.map((month) => (
                  <td key={month} className="text-right">{row.months[month] ? formatNumber(row.months[month]) : "—"}</td>
                ))}
                <td className="text-right"><strong>{formatNumber(row.total)}</strong></td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={2}><strong>TOTAL PENDAPATAN</strong></td>
              {data.months.map((month) => (
                <td key={month} className="text-right"><strong>{formatNumber(data.incomeTotalsByMonth[month] ?? 0)}</strong></td>
              ))}
              <td className="text-right"><strong>{formatNumber(data.grandTotal)}</strong></td>
            </tr>
          </tfoot>
        </table>

        <p className="section-title">Jumlah Unit Aktif Tagihan</p>
        <table>
          <thead>
            <tr>
              <th style={{ width: "4%" }}>No</th>
              <th style={{ width: "20%" }}>Jenis</th>
              {data.months.map((month) => (
                <th key={month}>{data.monthLabels[month]}</th>
              ))}
              <th style={{ width: "12%" }}>Total</th>
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
          <div style={{ marginTop: 10 }}>
            <strong>Grafik Total Pendapatan:</strong> {incomeTotals.map((value) => formatNumber(value)).join(" • ")}
          </div>
        </div>
      </div>
    </>
  )
}
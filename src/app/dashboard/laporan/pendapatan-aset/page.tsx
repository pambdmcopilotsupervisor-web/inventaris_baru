"use client"

import React, { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Modal } from "@/components/ui/modal"
import { Select } from "@/components/ui/select"
import { FileText, RefreshCw } from "lucide-react"
import { useApi } from "@/hooks/useApi"

/* ── Types ─────────────────────────────────────────────────────── */
interface IncomeRow {
  label: string; months: Record<number, number>; total: number
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
interface TrendEntry { added: TrendVehicleItem[]; removed: TrendVehicleItem[] }
interface ReportData {
  periodLabel: string; year: number; startMonth: number; endMonth: number
  months: number[]; monthLabels: Record<number, string>
  incomeRows: IncomeRow[]; unitRows: IncomeRow[]
  incomeTotalsByMonth: Record<number, number>; grandTotal: number
  vehicleTrendDetails: { r2: Record<number, TrendEntry>; r4: Record<number, TrendEntry> }
}

/* ── Month/Year options ─────────────────────────────────────────── */
const MONTHS = [
  {value:"1",label:"Januari"},{value:"2",label:"Februari"},
  {value:"3",label:"Maret"},{value:"4",label:"April"},
  {value:"5",label:"Mei"},{value:"6",label:"Juni"},
  {value:"7",label:"Juli"},{value:"8",label:"Agustus"},
  {value:"9",label:"September"},{value:"10",label:"Oktober"},
  {value:"11",label:"November"},{value:"12",label:"Desember"},
]
const YEARS = Array.from({length:new Date().getFullYear()-2019},(_,i)=>{
  const y=String(new Date().getFullYear()+1-i); return {value:y,label:y}
})

/* ── Sparkline SVG (sesuai $buildSparklinePoints di pedami) ─────── */
function Sparkline({ values, color = "#0ea5e9", width = 120, height = 32 }: {
  values: number[]; color?: string; width?: number; height?: number
}) {
  if (values.length === 0) return <span>—</span>
  
  const pts = values.length === 1
    ? `0,${height / 2}`
    : values.map((v, i) => {
        const min = Math.min(...values)
        const max = Math.max(...values)
        const range = max - min
        const x = (i / Math.max(values.length - 1, 1)) * width
        const y = range === 0
          ? height / 2
          : height - (((v - min) / range) * (height - 6)) - 3
        return `${x.toFixed(1)},${y.toFixed(1)}`
      }).join(" ")

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ overflow: "visible" }}>
      <polyline
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        points={pts}
      />
    </svg>
  )
}

/* ── Row colors for sparkline ───────────────────────────────────── */
const SPARKLINE_COLORS: Record<string, string> = {
  "Tagihan sewa kendaraan Roda Dua (R2)": "#0ea5e9",
  "Tagihan sewa kendaraan Roda Empat (R4)": "#1E40AF",
  "Penjualan Kendaraan": "#f59e0b",
  "Unit Roda Dua (R2)": "#f59e0b",
  "Unit Roda Empat (R4)": "#7c3aed",
}

/* ── Build catatan/notes (sama dengan buildTrendNotes di pedami) ── */
function buildNotes(
  label: string,
  typeKey: "r2" | "r4",
  months: Record<number, number>,
  monthLabels: Record<number, string>,
  vehicleTrend: Record<number, TrendEntry>,
  periodLabel: string
): string[] {
  const notes: string[] = []
  const monthNums = Object.keys(months).map(Number)
  let prevValue: number | null = null
  let prevMonth: number | null = null

  for (const m of monthNums) {
    const value = months[m] ?? 0
    if (prevValue !== null && value !== prevValue) {
      const selisih   = value - prevValue
      const status    = selisih > 0 ? "kenaikan" : "penurunan"
      const trend     = vehicleTrend[m] ?? { added: [], removed: [] }
      const identitas: string[] = []

      if (status === "kenaikan" && trend.added.length > 0) {
        identitas.push("kendaraan bertambah: " + trend.added.map((v: TrendVehicleItem) =>
          `${v.kode ?? "-"} / ${v.plat ?? "-"} / ${v.nama ?? "-"} / ${v.pemegang ?? "-"} / ${v.departemen ?? "-"}`
        ).join("; "))
      }
      if (status === "penurunan" && trend.removed.length > 0) {
        identitas.push("kendaraan berkurang: " + trend.removed.map((v: TrendVehicleItem) =>
          `${v.kode ?? "-"} / ${v.plat ?? "-"} / ${v.nama ?? "-"} / ${v.pemegang ?? "-"} / ${v.departemen ?? "-"}`
        ).join("; "))
      }

      notes.push(
        `${label} mengalami ${status} sebesar Rp ${Math.abs(selisih).toLocaleString("id-ID")} ` +
        `dari ${(monthLabels[prevMonth!] ?? "").toUpperCase()} ke ${(monthLabels[m] ?? "").toUpperCase()}` +
        (identitas.length > 0 ? ` dengan ${identitas.join(" | ")}` : "") + "."
      )
    }
    prevValue = value
    prevMonth = m
  }

  if (notes.length === 0) {
    notes.push(`${label} cenderung stabil pada periode ${periodLabel}.`)
  }

  return notes
}

/* ── Main Page ──────────────────────────────────────────────────── */
export default function PendapatanAsetPage() {
  const now = new Date()
  const [startMonth, setStartMonth] = useState(String(now.getMonth() + 1))
  const [endMonth,   setEndMonth]   = useState(String(now.getMonth() + 1))
  const [year, setYear]             = useState(String(now.getFullYear()))
  const [laporanOpen, setLaporanOpen] = useState(false)
  const [laporanLoading, setLaporanLoading] = useState(false)
  const [laporanFormat, setLaporanFormat] = useState<"pdf" | "excel">("pdf")
  const [queryParams, setQueryParams] = useState(
    `start_month=${now.getMonth()+1}&end_month=${now.getMonth()+1}&year=${now.getFullYear()}`
  )

  const { data, loading, error } = useApi<ReportData>(`/api/laporan/pendapatan-aset?${queryParams}`)

  const getEffectivePeriod = () => {
    const sm = parseInt(startMonth)
    const em = parseInt(endMonth)
    const effEnd = em >= sm ? em : sm
    return { startMonth: sm, endMonth: effEnd, year: parseInt(year) }
  }

  const handleLoad = () => {
    const period = getEffectivePeriod()
    setEndMonth(String(period.endMonth))
    setQueryParams(`start_month=${period.startMonth}&end_month=${period.endMonth}&year=${period.year}`)
  }

  const handleCetakLaporan = async () => {
    const period = getEffectivePeriod()
    setLaporanLoading(true)
    try {
      if (laporanFormat === "pdf") {
        const qs = new URLSearchParams({
          start_month: String(period.startMonth),
          end_month: String(period.endMonth),
          year: String(period.year),
        })
        const response = await fetch(`/api/laporan/pendapatan-aset/pdf?${qs.toString()}`)
        if (!response.ok) throw new Error("Gagal mengunduh PDF")
        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        const link = document.createElement("a")
        link.href = url
        link.download = `Laporan_Pendapatan_Aset_${period.year}_${String(period.startMonth).padStart(2, "0")}-${String(period.endMonth).padStart(2, "0")}.pdf`
        document.body.appendChild(link)
        link.click()
        link.remove()
        window.URL.revokeObjectURL(url)
        setLaporanOpen(false)
        return
      }

      const qs = new URLSearchParams({
        start_month: String(period.startMonth),
        end_month: String(period.endMonth),
        year: String(period.year),
      })
      const response = await fetch(`/api/laporan/pendapatan-aset?${qs.toString()}`)
      const report = await response.json() as ReportData

      const { utils, writeFile } = await import("xlsx")
      const wb = utils.book_new()
      const incomeSheetData: (string | number)[][] = [
        ["LAPORAN PENDAPATAN ASET"],
        ["KOPERASI KONSUMEN PEDAMI"],
        [`Periode: ${report.periodLabel}`],
        [`Dicetak pada: ${new Date().toLocaleString("id-ID")}`],
        [],
        ["No", "Jenis Pendapatan", ...report.months.map((month) => report.monthLabels[month]), "Total"],
        ...report.incomeRows.map((row, index) => [
          index + 1,
          row.label,
          ...report.months.map((month) => row.months[month] ?? 0),
          row.total,
        ]),
        ["", "TOTAL PENDAPATAN", ...report.months.map((month) => report.incomeTotalsByMonth[month] ?? 0), report.grandTotal],
        [],
        ["No", "Jumlah Unit Aktif", ...report.months.map((month) => report.monthLabels[month]), "Total"],
        ...report.unitRows.map((row, index) => [
          index + 1,
          row.label,
          ...report.months.map((month) => row.months[month] ?? 0),
          row.total,
        ]),
      ]

      const ws = utils.aoa_to_sheet(incomeSheetData)
      ws["!cols"] = [
        { wch: 5 },
        { wch: 32 },
        ...report.months.map(() => ({ wch: 14 })),
        { wch: 16 },
      ]
      utils.book_append_sheet(wb, ws, "Pendapatan Aset")
      writeFile(wb, `Laporan_Pendapatan_Aset_${period.year}_${String(period.startMonth).padStart(2, "0")}-${String(period.endMonth).padStart(2, "0")}.xlsx`)
      setLaporanOpen(false)
    } finally {
      setLaporanLoading(false)
    }
  }

  /* ── Compute totals per month ──────────────────────────────────── */
  const incomeTotals = data?.months.map(m =>
    data.incomeTotalsByMonth[m] ?? 0
  ) ?? []

  /* ── Compute catatan ─────────────────────────────────────────── */
  const roda2Notes = data ? buildNotes(
    "Pendapatan kendaraan roda dua", "r2",
    data.incomeRows[0]?.months ?? {},
    data.monthLabels,
    data.vehicleTrendDetails?.r2 ?? {},
    data.periodLabel,
  ) : []
  const roda4Notes = data ? buildNotes(
    "Pendapatan kendaraan roda empat", "r4",
    data.incomeRows[1]?.months ?? {},
    data.monthLabels,
    data.vehicleTrendDetails?.r4 ?? {},
    data.periodLabel,
  ) : []

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--text-900)" }}>Laporan Pendapatan Aset</h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-subtle)" }}>
            Rekapitulasi pendapatan dari sewa kendaraan dan penjualan aset
          </p>
        </div>
        <Button variant="outline" size="sm" style={{ color: "var(--info)", borderColor: "var(--info)" }} onClick={() => { setLaporanFormat("pdf"); setLaporanOpen(true) }}>
          <FileText className="h-3.5 w-3.5 mr-1.5" /> Cetak Laporan
        </Button>
      </div>

      {/* Filter */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium" style={{ color: "var(--text-muted)" }}>Dari Bulan:</label>
              <Select value={startMonth} onValueChange={setStartMonth} options={MONTHS} className="w-40" />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium" style={{ color: "var(--text-muted)" }}>Sampai Bulan:</label>
              <Select value={endMonth} onValueChange={setEndMonth} options={MONTHS} className="w-40" />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium" style={{ color: "var(--text-muted)" }}>Tahun:</label>
              <Select value={year} onValueChange={setYear} options={YEARS} className="w-28" />
            </div>
            <Button size="sm" onClick={handleLoad} disabled={loading}>
              {loading ? <><RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" />Memuat...</> : "Tampilkan"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Error */}
      {error && <div className="rounded-xl p-4 text-sm" style={{ background:"var(--danger-bg)", color:"var(--danger)", border:"1px solid #FECACA" }}>Gagal mengambil laporan: {error}</div>}

      {/* Loading */}
      {loading && (
        <div className="rounded-xl p-12 text-center" style={{ background:"var(--surface)", border:"1px solid var(--border)" }}>
          <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-3" style={{ color:"var(--primary)" }} />
          <p className="text-sm" style={{ color:"var(--text-subtle)" }}>Menghitung laporan pendapatan...</p>
        </div>
      )}

      {!loading && data && (
        <>
          {/* ── TABEL PENDAPATAN dengan GRAFIK di dalam kolom ──────── */}
          <Card>
            <CardHeader className="pb-3">
              <div>
                <CardTitle>Total Pendapatan Aset Koperasi Konsumen Pedami</CardTitle>
                <p className="text-xs mt-0.5" style={{ color: "var(--text-subtle)" }}>
                  Periode {data.periodLabel}
                </p>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ background: "var(--surface-muted)", borderBottom: "1px solid var(--border)" }}>
                      <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide w-8" style={{ color: "var(--text-subtle)" }}>No</th>
                      <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-subtle)", minWidth: 240 }}>Jenis Pendapatan</th>
                      {data.months.map(m => (
                        <th key={m} className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide whitespace-nowrap" style={{ color: "var(--text-subtle)" }}>
                          {data.monthLabels[m]?.toUpperCase()}
                        </th>
                      ))}
                      <th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--primary)" }}>TOTAL</th>
                      <th className="px-3 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-subtle)" }}>GRAFIK</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.incomeRows.map((row, ri) => (
                      <tr key={ri} className="transition-colors duration-150" style={{ borderBottom: "1px solid var(--border)" }}
                        onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = "var(--surface-hover)")}
                        onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = "transparent")}
                      >
                        <td className="px-3 py-2.5 text-xs" style={{ color: "var(--text-subtle)" }}>{ri + 1}</td>
                        <td className="px-3 py-2.5 font-medium text-sm" style={{ color: SPARKLINE_COLORS[row.label] ?? "var(--text-900)" }}>{row.label}</td>
                        {data.months.map(m => (
                          <td key={m} className="px-3 py-2.5 text-right font-mono text-sm">
                            {(row.months[m] ?? 0) > 0
                              ? <span>{(row.months[m]).toLocaleString("id-ID")}</span>
                              : <span style={{ color: "var(--text-subtle)" }}>—</span>
                            }
                          </td>
                        ))}
                        <td className="px-3 py-2.5 text-right font-mono font-bold text-sm" style={{ color: SPARKLINE_COLORS[row.label] ?? "var(--primary)" }}>
                          {row.total.toLocaleString("id-ID")}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <Sparkline values={data.months.map(m => row.months[m] ?? 0)} color={SPARKLINE_COLORS[row.label] ?? "#0ea5e9"} />
                        </td>
                      </tr>
                    ))}
                    {/* Total row */}
                    <tr style={{ background: "var(--primary-light)", borderTop: "2px solid var(--primary-mid)" }}>
                      <td colSpan={2} className="px-3 py-2.5 font-bold text-sm" style={{ color: "var(--primary)" }}>TOTAL PENDAPATAN</td>
                      {data.months.map(m => (
                        <td key={m} className="px-3 py-2.5 text-right font-mono font-bold text-sm" style={{ color: "var(--primary)" }}>
                          {(data.incomeTotalsByMonth[m] ?? 0).toLocaleString("id-ID")}
                        </td>
                      ))}
                      <td className="px-3 py-2.5 text-right font-mono font-bold text-base" style={{ color: "var(--primary)" }}>
                        {data.grandTotal.toLocaleString("id-ID")}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <Sparkline values={incomeTotals} color="#16a34a" />
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* ── TABEL UNIT dengan GRAFIK di dalam kolom ─────────────── */}
          <Card>
            <CardHeader className="pb-3">
              <div>
                <CardTitle>Jumlah Unit Aktif Tagihan</CardTitle>
                <p className="text-xs mt-0.5" style={{ color: "var(--text-subtle)" }}>Periode {data.periodLabel}</p>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ background: "var(--surface-muted)", borderBottom: "1px solid var(--border)" }}>
                      <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide w-8" style={{ color: "var(--text-subtle)" }}>No</th>
                      <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-subtle)", minWidth: 240 }}>Jenis</th>
                      {data.months.map(m => (
                        <th key={m} className="px-3 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wide whitespace-nowrap" style={{ color: "var(--text-subtle)" }}>
                          {data.monthLabels[m]?.toUpperCase()}
                        </th>
                      ))}
                      <th className="px-3 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--primary)" }}>TOTAL</th>
                      <th className="px-3 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-subtle)" }}>GRAFIK</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.unitRows.map((row, ri) => (
                      <tr key={ri} className="transition-colors duration-150" style={{ borderBottom: "1px solid var(--border)" }}
                        onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = "var(--surface-hover)")}
                        onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = "transparent")}
                      >
                        <td className="px-3 py-2.5 text-xs" style={{ color: "var(--text-subtle)" }}>{ri + 1}</td>
                        <td className="px-3 py-2.5 font-medium text-sm" style={{ color: SPARKLINE_COLORS[row.label] ?? "var(--text-900)" }}>{row.label}</td>
                        {data.months.map(m => (
                          <td key={m} className="px-3 py-2.5 text-center text-sm">
                            {(row.months[m] ?? 0) > 0
                              ? <span className="font-semibold">{row.months[m]}</span>
                              : <span style={{ color: "var(--text-subtle)" }}>—</span>
                            }
                          </td>
                        ))}
                        <td className="px-3 py-2.5 text-center font-bold text-sm" style={{ color: SPARKLINE_COLORS[row.label] ?? "var(--primary)" }}>
                          {row.total}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <Sparkline values={data.months.map(m => row.months[m] ?? 0)} color={SPARKLINE_COLORS[row.label] ?? "#f59e0b"} />
                        </td>
                      </tr>
                    ))}
                    {/* Total row unit */}
                    <tr style={{ background: "var(--primary-light)", borderTop: "2px solid var(--primary-mid)" }}>
                      <td colSpan={2} className="px-3 py-2.5 font-bold text-sm" style={{ color: "var(--primary)" }}>TOTAL JUMLAH UNIT</td>
                      {data.months.map(m => (
                        <td key={m} className="px-3 py-2.5 text-center font-bold text-sm" style={{ color: "var(--primary)" }}>
                          {data.unitRows.reduce((s, r) => s + (r.months[m] ?? 0), 0)}
                        </td>
                      ))}
                      <td className="px-3 py-2.5 text-center font-bold text-base" style={{ color: "var(--primary)" }}>
                        {data.unitRows.reduce((s, r) => s + r.total, 0)}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <Sparkline values={data.months.map(m => data.unitRows.reduce((s, r) => s + (r.months[m] ?? 0), 0))} color="#7c3aed" />
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* ── CATATAN (amber box, sesuai pedami) ────────────────────── */}
          <div className="rounded-xl p-5" style={{ background: "#FFFBEB", border: "1px solid #FDE68A", color: "#92400E" }}>
            <p className="font-semibold text-sm mb-3">Catatan:</p>
            <div className="space-y-4">
              {/* R2 Notes */}
              <div>
                <p className="font-medium text-sm mb-1" style={{ color: "#78350F" }}>Roda Dua (R2)</p>
                <ul className="list-disc pl-5 space-y-1">
                  {roda2Notes.map((note, i) => (
                    <li key={i} className="text-xs leading-relaxed">{note}</li>
                  ))}
                </ul>
              </div>
              {/* R4 Notes */}
              <div>
                <p className="font-medium text-sm mb-1" style={{ color: "#78350F" }}>Roda Empat (R4)</p>
                <ul className="list-disc pl-5 space-y-1">
                  {roda4Notes.map((note, i) => (
                    <li key={i} className="text-xs leading-relaxed">{note}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </>
      )}

      <Modal
        open={laporanOpen}
        onClose={() => setLaporanOpen(false)}
        size="md"
        title="Cetak Laporan Pendapatan Aset"
        footer={
          <>
            <Button variant="outline" onClick={() => setLaporanOpen(false)}>Batal</Button>
            <Button onClick={handleCetakLaporan} disabled={laporanLoading} style={{ background: "var(--info)", color: "#fff" }}>
              <FileText className="h-3.5 w-3.5 mr-1.5" />
              {laporanLoading ? "Menyiapkan..." : "Unduh Laporan"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-xs" style={{ color: "var(--text-subtle)" }}>
            Gunakan filter periode di atas untuk menentukan dari bulan, sampai bulan, dan tahun laporan yang akan dicetak.
          </p>

          <div className="rounded-xl p-4" style={{ background: "var(--surface-muted)", border: "1px solid var(--border)" }}>
            <p className="text-sm font-semibold" style={{ color: "var(--text-900)" }}>
              Periode terpilih: {MONTHS.find((month) => month.value === startMonth)?.label} {year}
              {Number(endMonth) !== Number(startMonth) ? ` s/d ${MONTHS.find((month) => month.value === String(getEffectivePeriod().endMonth))?.label} ${year}` : ""}
            </p>
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Format Laporan</label>
            <div className="flex gap-3">
              {(["pdf", "excel"] as const).map((format) => (
                <button
                  key={format}
                  type="button"
                  onClick={() => setLaporanFormat(format)}
                  className="flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all"
                  style={{
                    border: `2px solid ${laporanFormat === format ? "var(--primary)" : "var(--border)"}`,
                    background: laporanFormat === format ? "var(--primary-light)" : "var(--surface)",
                    color: laporanFormat === format ? "var(--primary)" : "var(--text-muted)",
                  }}
                >
                  {format === "pdf" ? "📄 PDF (.pdf)" : "📊 Excel (.xlsx)"}
                </button>
              ))}
            </div>
            {laporanFormat === "pdf" && (
              <p className="text-xs" style={{ color: "var(--text-subtle)" }}>
                Akan membuka tab baru — gunakan Ctrl+P / Cmd+P untuk mencetak atau simpan sebagai PDF.
              </p>
            )}
          </div>
        </div>
      </Modal>
    </div>
  )
}

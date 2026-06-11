"use client"

import React, { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Select } from "@/components/ui/select"
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell
} from "@/components/ui/table"
import { FileSpreadsheet, RefreshCw, AlertTriangle } from "lucide-react"
import { formatCurrency, formatDate } from "@/lib/utils"
import { useApi } from "@/hooks/useApi"

/* ── Types ─────────────────────────────────────────────────────── */
interface TarifRow {
  no: number; no_kontrak: string | null; plat: string; jenis_type: string
  tahun: number | null; nomor_mesin: string | null; nomor_rangka: string | null
  awal: string; akhir: string; uraian: string
  harga_kontrak: number; penanggung_jawab: string | null; departemen: string | null
  tgl_stop_tagihan?: string | null; alasan_stop_tagihan?: string | null
  status?: string; keterangan?: string
}

interface ReportData {
  periodLabel: string
  roda2: TarifRow[]; roda4: TarifRow[]
  historyRoda2: TarifRow[]; historyRoda4: TarifRow[]
  summary: {
    roda2: { unit: number; nominal: number }
    roda4: { unit: number; nominal: number }
  }
}

/* ── Month/Year options ─────────────────────────────────────────── */
const MONTHS = [
  { value: "01", label: "Januari" }, { value: "02", label: "Februari" },
  { value: "03", label: "Maret" },   { value: "04", label: "April" },
  { value: "05", label: "Mei" },     { value: "06", label: "Juni" },
  { value: "07", label: "Juli" },    { value: "08", label: "Agustus" },
  { value: "09", label: "September" }, { value: "10", label: "Oktober" },
  { value: "11", label: "November" }, { value: "12", label: "Desember" },
]

const YEARS = Array.from({ length: new Date().getFullYear() - 2019 }, (_, i) => {
  const y = String(new Date().getFullYear() + 1 - i)
  return { value: y, label: y }
})

/* ── Tabel rows component ───────────────────────────────────────── */
function TarifTable({ rows, type, isHistory = false }: {
  rows: TarifRow[]; type: "R2" | "R4"; isHistory?: boolean
}) {
  if (rows.length === 0) return (
    <div className="py-8 text-center text-sm" style={{ color: "var(--text-subtle)" }}>
      Tidak ada data kendaraan {type} untuk periode ini
    </div>
  )

  const total = rows.reduce((s, r) => s + r.harga_kontrak, 0)

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow style={{ background: "var(--surface-muted)" }}>
            <TableHead className="w-8 text-center" style={{ color: "var(--text-subtle)" }}>No</TableHead>
            <TableHead style={{ color: "var(--text-subtle)" }}>No Kontrak</TableHead>
            <TableHead style={{ color: "var(--text-subtle)" }}>Plat</TableHead>
            <TableHead style={{ color: "var(--text-subtle)" }}>Nama Kendaraan</TableHead>
            <TableHead style={{ color: "var(--text-subtle)" }}>Tahun</TableHead>
            <TableHead style={{ color: "var(--text-subtle)" }}>Uraian</TableHead>
            <TableHead className="text-right" style={{ color: "var(--text-subtle)" }}>Harga Kontrak</TableHead>
            <TableHead style={{ color: "var(--text-subtle)" }}>Pemegang</TableHead>
            <TableHead style={{ color: "var(--text-subtle)" }}>Departemen</TableHead>
            {isHistory && <TableHead style={{ color: "var(--text-subtle)" }}>Keterangan</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.no} className="transition-colors duration-150">
              <TableCell className="text-center text-xs" style={{ color: "var(--text-subtle)" }}>{row.no}</TableCell>
              <TableCell className="font-mono text-xs font-medium" style={{ color: "var(--primary)" }}>{row.no_kontrak ?? "—"}</TableCell>
              <TableCell className="font-mono font-semibold text-sm">{row.plat}</TableCell>
              <TableCell className="text-sm">{row.jenis_type}</TableCell>
              <TableCell className="text-xs">{row.tahun ?? "—"}</TableCell>
              <TableCell className="text-xs max-w-xs">{row.uraian}</TableCell>
              <TableCell className="text-right font-mono font-semibold text-sm">{formatCurrency(row.harga_kontrak)}</TableCell>
              <TableCell className="text-xs">{row.penanggung_jawab ?? "—"}</TableCell>
              <TableCell className="text-xs">{row.departemen ?? "—"}</TableCell>
              {isHistory && (
                <TableCell className="text-xs italic max-w-xs" style={{ color: "var(--warning)" }}>
                  {row.keterangan ?? "—"}
                </TableCell>
              )}
            </TableRow>
          ))}
          {/* Total row */}
          <TableRow style={{ background: "var(--primary-light)", borderTop: "2px solid var(--primary-mid)" }}>
            <TableCell colSpan={6} className="text-right font-bold text-sm" style={{ color: "var(--primary)" }}>TOTAL</TableCell>
            <TableCell className="text-right font-bold font-mono" style={{ color: "var(--primary)" }}>{formatCurrency(total)}</TableCell>
            <TableCell colSpan={isHistory ? 3 : 2} />
          </TableRow>
        </TableBody>
      </Table>
    </div>
  )
}

/* ── Main Page ──────────────────────────────────────────────────── */
export default function TagihanSewaPage() {
  const [month, setMonth] = useState(String(new Date().getMonth() + 1).padStart(2, "0"))
  const [year, setYear]   = useState(String(new Date().getFullYear()))
  const [queryParams, setQueryParams] = useState(`month=${String(new Date().getMonth() + 1).padStart(2, "0")}&year=${String(new Date().getFullYear())}`)

  const { data, loading, error } = useApi<ReportData>(`/api/laporan/tagihan-sewa?${queryParams}`)

  const handleLoadReport = () => {
    setQueryParams(`month=${month}&year=${year}`)
  }

  const hasData = data && (data.roda2.length > 0 || data.roda4.length > 0)
  const grandTotal = data ? data.summary.roda2.nominal + data.summary.roda4.nominal : 0
  const hasHistory = data && (data.historyRoda2.length > 0 || data.historyRoda4.length > 0)

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--text-900)" }}>Laporan Tagihan Sewa Kendaraan</h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-subtle)" }}>
            Rekapitulasi tagihan sewa kendaraan R2/R4 per periode
          </p>
        </div>
        {hasData && (
          <Button variant="outline" size="sm">
            <FileSpreadsheet className="h-3.5 w-3.5 mr-1.5" /> Export Excel
          </Button>
        )}
      </div>

      {/* Filter */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium" style={{ color: "var(--text-muted)" }}>Bulan:</label>
              <Select value={month} onValueChange={setMonth} options={MONTHS} className="w-40" />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium" style={{ color: "var(--text-muted)" }}>Tahun:</label>
              <Select value={year} onValueChange={setYear} options={YEARS} className="w-28" />
            </div>
            <Button size="sm" onClick={handleLoadReport} disabled={loading}>
              {loading ? <><RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" />Memuat...</> : "Tampilkan"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Error */}
      {error && (
        <div className="rounded-xl p-4 text-sm" style={{ background: "var(--danger-bg)", color: "var(--danger)", border: "1px solid #FECACA" }}>
          Gagal mengambil laporan: {error}
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="rounded-xl p-12 text-center" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-3" style={{ color: "var(--primary)" }} />
          <p className="text-sm" style={{ color: "var(--text-subtle)" }}>Memuat data laporan...</p>
        </div>
      )}

      {/* Report content */}
      {!loading && data && (
        <>

          {/* Summary cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="border-l-4" style={{ borderLeftColor: "var(--success)" }}>
              <CardContent className="p-4">
                <p className="text-sm" style={{ color: "var(--text-subtle)" }}>Total Roda 2 (R2)</p>
                <p className="text-xl font-bold font-mono mt-0.5" style={{ color: "var(--success)" }}>
                  {formatCurrency(data.summary.roda2.nominal)}
                </p>
                <p className="text-xs mt-1" style={{ color: "var(--text-subtle)" }}>{data.summary.roda2.unit} unit kendaraan</p>
              </CardContent>
            </Card>
            <Card className="border-l-4" style={{ borderLeftColor: "var(--primary)" }}>
              <CardContent className="p-4">
                <p className="text-sm" style={{ color: "var(--text-subtle)" }}>Total Roda 4 (R4)</p>
                <p className="text-xl font-bold font-mono mt-0.5" style={{ color: "var(--primary)" }}>
                  {formatCurrency(data.summary.roda4.nominal)}
                </p>
                <p className="text-xs mt-1" style={{ color: "var(--text-subtle)" }}>{data.summary.roda4.unit} unit kendaraan</p>
              </CardContent>
            </Card>
            <Card className="border-l-4" style={{ borderLeftColor: "#7C3AED" }}>
              <CardContent className="p-4">
                <p className="text-sm" style={{ color: "var(--text-subtle)" }}>Grand Total</p>
                <p className="text-xl font-bold font-mono mt-0.5" style={{ color: "#7C3AED" }}>
                  {formatCurrency(grandTotal)}
                </p>
                <p className="text-xs mt-1" style={{ color: "var(--text-subtle)" }}>
                  {data.summary.roda2.unit + data.summary.roda4.unit} unit total
                </p>
              </CardContent>
            </Card>
          </div>

          {/* No data */}
          {!hasData && (
            <div className="rounded-xl p-12 text-center" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
              <p className="text-sm" style={{ color: "var(--text-subtle)" }}>
                Tidak ada data tagihan sewa kendaraan untuk periode {data.periodLabel}
              </p>
            </div>
          )}

          {/* Tabel R2 */}
          {data.roda2.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2">
                  <Badge variant="success">R2</Badge>
                  Kendaraan Roda 2 Aktif — {data.periodLabel}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <TarifTable rows={data.roda2} type="R2" />
              </CardContent>
            </Card>
          )}

          {/* Tabel R4 */}
          {data.roda4.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2">
                  <Badge variant="default">R4</Badge>
                  Kendaraan Roda 4 Aktif — {data.periodLabel}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <TarifTable rows={data.roda4} type="R4" />
              </CardContent>
            </Card>
          )}

          {/* History: Kendaraan yang berhenti ditagihkan */}
          {hasHistory && (
            <>
              <div className="flex items-center gap-2 pt-2">
                <AlertTriangle className="h-4 w-4" style={{ color: "var(--warning)" }} />
                <h3 className="text-base font-semibold" style={{ color: "var(--text-900)" }}>
                  Riwayat Kendaraan Berhenti Ditagihkan
                </h3>
              </div>
              <div className="text-xs p-3 rounded-xl" style={{ background: "var(--warning-bg)", border: "1px solid #FDE68A", color: "#92400E" }}>
                Kendaraan di bawah ini kontraknya berakhir, sudah terjual, atau tagihannya dihentikan sebelum/pada periode {data.periodLabel}. Tidak termasuk dalam total tagihan aktif.
              </div>

              {data.historyRoda2.length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-amber-600">
                      <Badge variant="warning">R2</Badge>
                      Riwayat Roda 2 — Berhenti Ditagihkan
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <TarifTable rows={data.historyRoda2} type="R2" isHistory />
                  </CardContent>
                </Card>
              )}

              {data.historyRoda4.length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-amber-600">
                      <Badge variant="warning">R4</Badge>
                      Riwayat Roda 4 — Berhenti Ditagihkan
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <TarifTable rows={data.historyRoda4} type="R4" isHistory />
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}

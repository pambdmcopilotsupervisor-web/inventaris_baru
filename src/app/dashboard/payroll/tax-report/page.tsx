"use client"

import React, { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { DataTable, Column } from "@/components/ui/data-table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { SelectField } from "@/components/ui/form-field"
import { FileText, Download, RefreshCw } from "lucide-react"
import { formatCurrency } from "@/lib/utils"
import { getTaxReportYears, getAnnualTaxRecap } from "@/actions/payroll-tax-report"

interface RecapRow {
  employee_id: number; nik: string; nama: string; jabatan: string
  status_ptkp: string; punya_npwp: boolean
  bruto_year: number; pph_terutang: number; pph_dipotong: number; selisih: number
}
interface Recap { year: number; count: number; rows: RecapRow[]; totals: { bruto: number; terutang: number; dipotong: number } }

export default function TaxReportPage() {
  const router = useRouter()
  const now = new Date()
  const [years, setYears] = useState<number[]>([])
  const [year, setYear] = useState(String(now.getFullYear()))
  const [recap, setRecap] = useState<Recap | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadRecap = async (y: string) => {
    setLoading(true); setError(null)
    const res = await getAnnualTaxRecap(Number(y))
    if (res.success) setRecap(res.data as unknown as Recap)
    else { setError(res.error); setRecap(null) }
    setLoading(false)
  }

  useEffect(() => {
    let active = true
    getTaxReportYears().then((res) => {
      if (!active) return
      if (res.success) {
        const ys = res.data as number[]
        setYears(ys)
        const initial = ys.includes(now.getFullYear()) ? now.getFullYear() : ys[0]
        setYear(String(initial))
        loadRecap(String(initial))
      } else { setError(res.error); setLoading(false) }
    })
    return () => { active = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const columns: Column<RecapRow>[] = [
    { key: "nama", header: "Karyawan", cell: (r) => <div><p className="font-medium">{r.nama}</p><p className="text-xs font-mono" style={{ color: "var(--text-subtle)" }}>{r.nik}</p></div> },
    { key: "status_ptkp", header: "PTKP", cell: (r) => <span className="flex items-center gap-1.5"><span className="font-mono text-xs">{r.status_ptkp}</span>{!r.punya_npwp && <Badge variant="warning" className="text-[10px] px-1.5 py-0">Non-NPWP</Badge>}</span> },
    { key: "bruto_year", header: "Bruto Setahun", cell: (r) => <span className="font-mono">{formatCurrency(r.bruto_year)}</span> },
    { key: "pph_terutang", header: "PPh21 Terutang", cell: (r) => <span className="font-mono">{formatCurrency(r.pph_terutang)}</span> },
    { key: "pph_dipotong", header: "PPh21 Dipotong", cell: (r) => <span className="font-mono">{formatCurrency(r.pph_dipotong)}</span> },
    { key: "selisih", header: "Selisih", cell: (r) => {
      if (r.selisih === 0) return <Badge variant="success">Nihil</Badge>
      return <span className="font-mono" style={{ color: r.selisih > 0 ? "var(--danger)" : "var(--info, var(--primary))" }}>
        {r.selisih > 0 ? "Kurang " : "Lebih "}{formatCurrency(Math.abs(r.selisih))}
      </span>
    } },
  ]

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--text-900)" }}>Laporan Pajak Tahunan (1721-A1)</h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-subtle)" }}>Rekap PPh21 setahun per karyawan & cetak Bukti Potong 1721-A1. Dihitung dari snapshot pajak seluruh slip (gaji, THR, bonus) pada tahun terpilih.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => loadRecap(year)}><RefreshCw className="h-3.5 w-3.5" /></Button>
          <Button variant="outline" size="sm" onClick={() => window.open(`/api/payroll/tax-report/${year}/export`, "_blank")} disabled={!recap || recap.count === 0}><Download className="h-3.5 w-3.5 mr-1.5" />Ekspor Excel</Button>
        </div>
      </div>

      {error && <div className="rounded-lg px-4 py-3 text-sm" style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>{error}</div>}

      <div className="flex flex-wrap items-end gap-3">
        <SelectField label="Tahun Pajak" className="w-40" value={year}
          onChange={(e) => { setYear(e.target.value); loadRecap(e.target.value) }}
          options={years.map((y) => ({ value: String(y), label: String(y) }))} />
      </div>

      {recap && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card><CardContent className="p-4"><p className="text-xs" style={{ color: "var(--text-subtle)" }}>Jumlah Karyawan</p><p className="text-2xl font-bold font-mono mt-0.5" style={{ color: "var(--primary)" }}>{recap.count}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs" style={{ color: "var(--text-subtle)" }}>Total Bruto</p><p className="text-lg font-bold font-mono mt-0.5">{formatCurrency(recap.totals.bruto)}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs" style={{ color: "var(--text-subtle)" }}>Total PPh21 Terutang</p><p className="text-lg font-bold font-mono mt-0.5" style={{ color: "var(--warning)" }}>{formatCurrency(recap.totals.terutang)}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs" style={{ color: "var(--text-subtle)" }}>Total PPh21 Dipotong</p><p className="text-lg font-bold font-mono mt-0.5" style={{ color: "var(--success)" }}>{formatCurrency(recap.totals.dipotong)}</p></CardContent></Card>
        </div>
      )}

      <DataTable
        data={(recap?.rows ?? []) as unknown as Record<string, unknown>[]}
        columns={columns as unknown as Column<Record<string, unknown>>[]}
        searchKeys={["nama", "nik"]}
        loading={loading}
        emptyMessage="Belum ada data slip pada tahun ini"
        actions={(row: Record<string, unknown>) => {
          const r = row as unknown as RecapRow
          return (
            <Button variant="ghost" size="sm" style={{ color: "var(--primary)" }} title="Cetak Bukti Potong 1721-A1"
              onClick={() => router.push(`/dashboard/payroll/tax-report/${r.employee_id}?year=${year}`)}>
              <FileText className="h-3.5 w-3.5 mr-1" />1721-A1
            </Button>
          )
        }}
      />
    </div>
  )
}

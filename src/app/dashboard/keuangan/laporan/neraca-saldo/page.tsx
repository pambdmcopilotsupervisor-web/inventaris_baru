"use client"

import React, { useEffect, useState } from "react"
import { Scale, RefreshCw, Download, Printer } from "lucide-react"
import { Button } from "@/components/ui/button"
import { SelectField } from "@/components/ui/form-field"
import { getPeriodeFiskal, type PeriodeFiskalRow } from "@/actions/keuangan-periode"
import { downloadCsv, printToPdf } from "@/lib/keuangan/client-export"

const rp = (n: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(n)

type Row = { kode: string; nama: string; jenis: string; saldo_normal: string; total_debit: number; total_kredit: number; saldo: number }
type Data = { tgl_mulai: string; tgl_selesai: string; rows: Row[]; total_debit: number; total_kredit: number }

export default function NeracaSaldoPage() {
  const [periods, setPeriods] = useState<PeriodeFiskalRow[]>([])
  const [periodeId, setPeriodeId] = useState("")
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getPeriodeFiskal().then((r) => {
      if (!r.success) return
      setPeriods(r.data)
      if (r.data[0]) setPeriodeId(String(r.data[0].id))
    })
  }, [])

  async function load() {
    if (!periodeId) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/keuangan/summary?type=trial_balance&periode_id=${periodeId}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Gagal memuat neraca saldo")
      setData(json)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat neraca saldo")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { if (periodeId) load() }, [periodeId])

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Scale className="h-5 w-5" style={{ color: "var(--primary)" }} />
          <h1 className="text-xl font-semibold" style={{ color: "var(--text-900)" }}>Neraca Saldo</h1>
        </div>
        <div className="flex gap-2 flex-wrap">
          <SelectField label="Periode" value={periodeId} onChange={(e) => setPeriodeId(e.target.value)} options={[{ value: "", label: "Pilih Periode" }, ...periods.map((p) => ({ value: String(p.id), label: p.nama }))]} className="w-44" />
          <Button variant="ghost" size="sm" onClick={load}><RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /></Button>
          <Button variant="ghost" size="sm" onClick={() => data && downloadCsv("neraca-saldo.csv", data.rows)}><Download className="h-3.5 w-3.5 mr-1" />CSV</Button>
          <Button variant="ghost" size="sm" onClick={printToPdf}><Printer className="h-3.5 w-3.5 mr-1" />PDF</Button>
        </div>
      </div>

      {error && <div className="p-3 rounded-lg text-sm" style={{ background: "rgba(220,38,38,0.08)", color: "rgb(220,38,38)" }}>{error}</div>}

      {data && (
        <div className="rounded-xl overflow-hidden" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          <table className="w-full text-sm">
            <thead style={{ background: "var(--surface-muted)" }}>
              <tr>
                <th className="p-2 text-left">Kode</th>
                <th className="p-2 text-left">Akun</th>
                <th className="p-2 text-left">Jenis</th>
                <th className="p-2 text-right">Debit</th>
                <th className="p-2 text-right">Kredit</th>
                <th className="p-2 text-right">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.kode} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="p-2 font-mono text-xs">{r.kode}</td>
                  <td className="p-2">{r.nama}</td>
                  <td className="p-2 text-xs">{r.jenis}</td>
                  <td className="p-2 text-right">{rp(r.total_debit)}</td>
                  <td className="p-2 text-right">{rp(r.total_kredit)}</td>
                  <td className="p-2 text-right font-medium">{rp(r.saldo)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot style={{ background: "var(--surface-muted)" }}>
              <tr className="font-semibold">
                <td colSpan={3} className="p-2 text-right">Total</td>
                <td className="p-2 text-right">{rp(data.total_debit)}</td>
                <td className="p-2 text-right">{rp(data.total_kredit)}</td>
                <td className="p-2 text-right">{Math.abs(data.total_debit - data.total_kredit) < 1 ? "Balance" : "Tidak Balance"}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}

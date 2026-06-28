"use client"

import React, { useEffect, useState } from "react"
import { Landmark, RefreshCw, Download, Printer } from "lucide-react"
import { Button } from "@/components/ui/button"
import { SelectField } from "@/components/ui/form-field"
import { getPeriodeFiskal, type PeriodeFiskalRow } from "@/actions/keuangan-periode"
import { downloadCsv, printToPdf } from "@/lib/keuangan/client-export"

const rp = (n: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(n)

type Row = { tanggal: string; nomor_jurnal: string; akun: string; keterangan: string; penerimaan: number; pengeluaran: number; mutasi: number }
type Data = { saldo_awal: number; penerimaan: number; pengeluaran: number; saldo_akhir: number; rows: Row[] }

export default function ArusKasPage() {
  const [periods, setPeriods] = useState<PeriodeFiskalRow[]>([])
  const [periodeId, setPeriodeId] = useState("")
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getPeriodeFiskal().then((r) => {
      if (r.success) {
        setPeriods(r.data)
        if (r.data[0]) setPeriodeId(String(r.data[0].id))
      }
    })
  }, [])

  async function load() {
    if (!periodeId) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/keuangan/summary?type=arus_kas&periode_id=${periodeId}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Gagal memuat arus kas")
      setData(json)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat arus kas")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { if (periodeId) load() }, [periodeId])

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Landmark className="h-5 w-5" style={{ color: "var(--primary)" }} />
          <h1 className="text-xl font-semibold" style={{ color: "var(--text-900)" }}>Arus Kas</h1>
        </div>
        <div className="flex gap-2 flex-wrap">
          <SelectField label="Periode" value={periodeId} onChange={(e) => setPeriodeId(e.target.value)} options={[{ value: "", label: "Pilih Periode" }, ...periods.map((p) => ({ value: String(p.id), label: p.nama }))]} className="w-44" />
          <Button variant="ghost" size="sm" onClick={load}><RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /></Button>
          <Button variant="ghost" size="sm" onClick={() => data && downloadCsv("arus-kas.csv", data.rows)}><Download className="h-3.5 w-3.5 mr-1" />CSV</Button>
          <Button variant="ghost" size="sm" onClick={printToPdf}><Printer className="h-3.5 w-3.5 mr-1" />PDF</Button>
        </div>
      </div>

      {error && <div className="p-3 rounded-lg text-sm" style={{ background: "rgba(220,38,38,0.08)", color: "rgb(220,38,38)" }}>{error}</div>}

      {data && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[{ label: "Saldo Awal", value: data.saldo_awal }, { label: "Penerimaan", value: data.penerimaan }, { label: "Pengeluaran", value: data.pengeluaran }, { label: "Saldo Akhir", value: data.saldo_akhir }].map((item) => (
              <div key={item.label} className="rounded-xl p-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                <p className="text-xs" style={{ color: "var(--text-subtle)" }}>{item.label}</p>
                <p className="font-bold">{rp(item.value)}</p>
              </div>
            ))}
          </div>
          <div className="rounded-xl overflow-hidden" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
            <table className="w-full text-sm">
              <thead style={{ background: "var(--surface-muted)" }}><tr><th className="p-2 text-left">Tanggal</th><th className="p-2 text-left">Nomor</th><th className="p-2 text-left">Akun</th><th className="p-2 text-left">Keterangan</th><th className="p-2 text-right">Masuk</th><th className="p-2 text-right">Keluar</th></tr></thead>
              <tbody>
                {data.rows.map((r, i) => <tr key={`${r.nomor_jurnal}-${i}`} className="border-t" style={{ borderColor: "var(--border)" }}><td className="p-2">{new Date(r.tanggal).toLocaleDateString("id-ID")}</td><td className="p-2 font-mono text-xs">{r.nomor_jurnal}</td><td className="p-2">{r.akun}</td><td className="p-2">{r.keterangan}</td><td className="p-2 text-right">{r.penerimaan ? rp(r.penerimaan) : "-"}</td><td className="p-2 text-right">{r.pengeluaran ? rp(r.pengeluaran) : "-"}</td></tr>)}
                {data.rows.length === 0 && <tr><td colSpan={6} className="p-4 text-center text-sm" style={{ color: "var(--text-subtle)" }}>Tidak ada mutasi kas/bank</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

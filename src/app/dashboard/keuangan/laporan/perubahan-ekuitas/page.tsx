"use client"

import React, { useEffect, useState } from "react"
import { PieChart, RefreshCw, Download, Printer } from "lucide-react"
import { Button } from "@/components/ui/button"
import { SelectField } from "@/components/ui/form-field"
import { getPeriodeFiskal, type PeriodeFiskalRow } from "@/actions/keuangan-periode"
import { downloadCsv, printToPdf } from "@/lib/keuangan/client-export"

const rp = (n: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(n)

type Data = { ekuitas_awal: number; tambahan_ekuitas: number; shu: number; ekuitas_akhir: number }

export default function PerubahanEkuitasPage() {
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
      const res = await fetch(`/api/keuangan/summary?type=perubahan_ekuitas&periode_id=${periodeId}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Gagal memuat perubahan ekuitas")
      setData(json)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat perubahan ekuitas")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { if (periodeId) load() }, [periodeId])

  const rows = data ? [
    { uraian: "Ekuitas awal", jumlah: data.ekuitas_awal },
    { uraian: "Tambahan/perubahan ekuitas", jumlah: data.tambahan_ekuitas },
    { uraian: "SHU periode berjalan", jumlah: data.shu },
    { uraian: "Ekuitas akhir", jumlah: data.ekuitas_akhir },
  ] : []

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <PieChart className="h-5 w-5" style={{ color: "var(--primary)" }} />
          <h1 className="text-xl font-semibold" style={{ color: "var(--text-900)" }}>Perubahan Ekuitas</h1>
        </div>
        <div className="flex gap-2 flex-wrap">
          <SelectField label="Periode" value={periodeId} onChange={(e) => setPeriodeId(e.target.value)} options={[{ value: "", label: "Pilih Periode" }, ...periods.map((p) => ({ value: String(p.id), label: p.nama }))]} className="w-44" />
          <Button variant="ghost" size="sm" onClick={load}><RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /></Button>
          <Button variant="ghost" size="sm" onClick={() => downloadCsv("perubahan-ekuitas.csv", rows)}><Download className="h-3.5 w-3.5 mr-1" />CSV</Button>
          <Button variant="ghost" size="sm" onClick={printToPdf}><Printer className="h-3.5 w-3.5 mr-1" />PDF</Button>
        </div>
      </div>

      {error && <div className="p-3 rounded-lg text-sm" style={{ background: "rgba(220,38,38,0.08)", color: "rgb(220,38,38)" }}>{error}</div>}

      {data && <div className="rounded-xl overflow-hidden max-w-2xl" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}><table className="w-full text-sm"><tbody>{rows.map((r, i) => <tr key={r.uraian} className="border-b last:border-0" style={{ borderColor: "var(--border)", background: i === rows.length - 1 ? "var(--surface-muted)" : undefined }}><td className="p-3 font-medium">{r.uraian}</td><td className="p-3 text-right font-semibold">{rp(r.jumlah)}</td></tr>)}</tbody></table></div>}
    </div>
  )
}

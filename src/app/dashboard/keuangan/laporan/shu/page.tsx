"use client"

import React, { useEffect, useState } from "react"
import { SelectField } from "@/components/ui/form-field"
import { Button } from "@/components/ui/button"
import { TrendingUp, RefreshCw, AlertCircle, Download, Printer } from "lucide-react"
import { getPeriodeFiskal, type PeriodeFiskalRow } from "@/actions/keuangan-periode"
import { downloadCsv, printToPdf } from "@/lib/keuangan/client-export"

const rp = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(n)

interface AkunSaldo { kode: string; nama: string; saldo: number }
interface SHUData {
  pendapatan: number; beban: number; shu: number
  pendapatan_rows: AkunSaldo[]; beban_rows: AkunSaldo[]
  tgl_mulai: string; tgl_selesai: string
}

function SectionTable({ rows, colorPositive }: { rows: AkunSaldo[]; colorPositive: boolean }) {
  return (
    <table className="w-full text-sm">
      <tbody>
        {rows.map((r) => (
          <tr key={r.kode} className="border-b last:border-0" style={{ borderColor: "var(--border)" }}>
            <td className="py-1.5 px-3 font-mono text-xs" style={{ color: "var(--text-subtle)" }}>{r.kode}</td>
            <td className="py-1.5 px-2">{r.nama}</td>
            <td className="py-1.5 px-3 text-right font-medium" style={{ color: colorPositive ? "rgb(5,150,105)" : "rgb(220,38,38)" }}>
              {rp(r.saldo)}
            </td>
          </tr>
        ))}
        {rows.length === 0 && (
          <tr><td colSpan={3} className="py-3 text-center text-xs" style={{ color: "var(--text-subtle)" }}>Tidak ada data</td></tr>
        )}
      </tbody>
    </table>
  )
}

export default function SHUPage() {
  const now = new Date()
  const [periods, setPeriods] = useState<PeriodeFiskalRow[]>([])
  const [periodeId, setPeriodeId] = useState("")
  const [data, setData] = useState<SHUData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getPeriodeFiskal().then((r) => {
      if (r.success) {
        setPeriods(r.data)
        const cur = r.data.find((p) => p.tahun === now.getFullYear() && p.bulan === now.getMonth() + 1)
        if (cur) setPeriodeId(String(cur.id))
        else if (r.data.length) setPeriodeId(String(r.data[0].id))
      }
    })
  }, [])

  const load = async () => {
    if (!periodeId) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/keuangan/summary?type=shu&periode_id=${periodeId}`)
      if (!res.ok) { const j = await res.json(); throw new Error(j.error ?? "Gagal") }
      setData(await res.json())
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat laporan SHU")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { if (periodeId) load() }, [periodeId])

  const periodOptions = [
    { value: "", label: "— Pilih Periode —" },
    ...periods.map((p) => ({ value: String(p.id), label: p.nama })),
  ]
  const exportRows = data ? [
    ...data.pendapatan_rows.map((r) => ({ kelompok: "PENDAPATAN", kode: r.kode, nama: r.nama, saldo: r.saldo })),
    ...data.beban_rows.map((r) => ({ kelompok: "BEBAN", kode: r.kode, nama: r.nama, saldo: r.saldo })),
    { kelompok: "SHU", kode: "", nama: "SHU Bersih", saldo: data.shu },
  ] : []

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5" style={{ color: "var(--primary)" }} />
          <h1 className="text-xl font-semibold" style={{ color: "var(--text-900)" }}>Laporan SHU</h1>
          <span className="text-sm" style={{ color: "var(--text-subtle)" }}>— Sisa Hasil Usaha</span>
        </div>
        <div className="flex gap-2">
          <SelectField label="Periode" value={periodeId} onChange={(e) => setPeriodeId(e.target.value)} options={periodOptions} className="w-44" />
          <Button variant="ghost" size="sm" onClick={load}><RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /></Button>
          <Button variant="ghost" size="sm" onClick={() => downloadCsv("shu.csv", exportRows)}><Download className="h-3.5 w-3.5 mr-1" />CSV</Button>
          <Button variant="ghost" size="sm" onClick={printToPdf}><Printer className="h-3.5 w-3.5 mr-1" />PDF</Button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg text-sm"
          style={{ background: "rgba(220,38,38,0.08)", color: "rgb(220,38,38)" }}>
          <AlertCircle className="h-4 w-4" />{error}
        </div>
      )}

      {loading && (
        <div className="space-y-3">
          {[1,2,3].map((i) => <div key={i} className="h-10 rounded-lg animate-pulse" style={{ background: "var(--surface-muted)" }} />)}
        </div>
      )}

      {!loading && data && (
        <div className="space-y-4">
          {/* Periode info */}
          <p className="text-sm" style={{ color: "var(--text-subtle)" }}>
            {new Date(data.tgl_mulai).toLocaleDateString("id-ID")} — {new Date(data.tgl_selesai).toLocaleDateString("id-ID")}
          </p>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Pendapatan */}
            <div className="rounded-xl p-5 space-y-3" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-base" style={{ color: "var(--text-900)" }}>Pendapatan</h2>
                <span className="font-bold text-base" style={{ color: "rgb(5,150,105)" }}>{rp(data.pendapatan)}</span>
              </div>
              <SectionTable rows={data.pendapatan_rows} colorPositive={true} />
            </div>

            {/* Beban */}
            <div className="rounded-xl p-5 space-y-3" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-base" style={{ color: "var(--text-900)" }}>Beban</h2>
                <span className="font-bold text-base" style={{ color: "rgb(220,38,38)" }}>{rp(data.beban)}</span>
              </div>
              <SectionTable rows={data.beban_rows} colorPositive={false} />
            </div>
          </div>

          {/* SHU Summary */}
          <div className="rounded-xl p-5"
            style={{
              background: data.shu >= 0 ? "rgba(109,40,217,0.06)" : "rgba(220,38,38,0.06)",
              border: `1px solid ${data.shu >= 0 ? "rgba(109,40,217,0.3)" : "rgba(220,38,38,0.3)"}`,
            }}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold" style={{ color: "var(--text-subtle)" }}>SISA HASIL USAHA (SHU)</p>
                <p className="text-xs mt-0.5" style={{ color: "var(--text-subtle)" }}>Pendapatan − Beban</p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold" style={{ color: data.shu >= 0 ? "rgb(109,40,217)" : "rgb(220,38,38)" }}>
                  {rp(data.shu)}
                </p>
                <p className="text-xs mt-0.5" style={{ color: "var(--text-subtle)" }}>
                  {data.shu >= 0 ? "Surplus" : "Defisit"}
                </p>
              </div>
            </div>

            {/* Breakdown */}
            <div className="mt-4 space-y-2">
              {[
                { label: "Total Pendapatan", val: data.pendapatan, color: "rgb(5,150,105)" },
                { label: "Total Beban", val: data.beban, color: "rgb(220,38,38)", isNeg: true },
              ].map(({ label, val, color, isNeg }) => (
                <div key={label} className="flex justify-between items-center text-sm py-1 border-b last:border-0" style={{ borderColor: "var(--border)" }}>
                  <span style={{ color: "var(--text-subtle)" }}>{label}</span>
                  <span className="font-medium" style={{ color }}>{isNeg ? "(" + rp(val) + ")" : rp(val)}</span>
                </div>
              ))}
              <div className="flex justify-between items-center text-sm font-bold pt-1">
                <span style={{ color: "var(--text-900)" }}>SHU Bersih</span>
                <span style={{ color: data.shu >= 0 ? "rgb(109,40,217)" : "rgb(220,38,38)" }}>{rp(data.shu)}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

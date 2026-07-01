"use client"

import React, { useEffect, useState } from "react"
import { SelectField } from "@/components/ui/form-field"
import { Button } from "@/components/ui/button"
import { BarChart3, RefreshCw, AlertCircle, Download, Printer } from "lucide-react"
import { getRapbRealisasi, type RealisasiData } from "@/actions/keuangan-anggaran"
import { printToPdf, downloadCsv } from "@/lib/keuangan/client-export"
import { rp } from "@/lib/keuangan/format"

const MONTHS = ["","Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"]

function pct(val: number, max: number): number {
  if (max <= 0) return val > 0 ? 100 : 0
  return Math.min(Math.round((val / max) * 100), 150)
}

function ProgressBar({ value, target, positive }: { value: number; target: number; positive: boolean }) {
  const p = pct(value, target)
  const over = p > 100
  const color = positive ? (over ? "rgb(220,38,38)" : "rgb(5,150,105)") : (over ? "rgb(220,38,38)" : "rgb(217,119,6)")
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--surface-muted)" }}>
        <div className="h-full rounded-full" style={{ width: `${Math.min(p, 100)}%`, background: color }} />
      </div>
      <span className="text-xs shrink-0 font-mono" style={{ color, minWidth: "42px", textAlign: "right" }}>{p}%</span>
    </div>
  )
}

export default function RapbRealisasiPage() {
  const now = new Date()
  const [tahun, setTahun] = useState(String(now.getFullYear()))
  const [bulan, setBulan] = useState("0")
  const [data, setData] = useState<RealisasiData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - 1 + i)
  const bulanOptions = [
    { value: "0", label: "Tahunan" },
    ...MONTHS.slice(1).map((m, i) => ({ value: String(i + 1), label: m })),
  ]

  const load = async () => {
    setLoading(true); setError(null)
    const res = await getRapbRealisasi(Number(tahun), Number(bulan))
    if (res.success) setData(res.data)
    else setError(res.error)
    setLoading(false)
  }

  useEffect(() => { load() }, [tahun, bulan])

  const periodLabel = bulan === "0" ? `Tahunan ${tahun}` : `${MONTHS[Number(bulan)]} ${tahun}`

  const exportRows = data?.rows.map((r) => ({
    Kode: r.kode, Nama: r.nama, Jenis: r.jenis,
    "Anggaran (Rp)": r.anggaran, "Realisasi (Rp)": r.realisasi,
    "Selisih (Rp)": r.selisih, "Persen (%)": r.persen,
  })) ?? []

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5" style={{ color: "var(--primary)" }} />
          <h1 className="text-xl font-semibold" style={{ color: "var(--text-900)" }}>RAPB vs Realisasi</h1>
        </div>
        <div className="flex gap-2 flex-wrap items-end">
          <SelectField label="Tahun" value={tahun} onChange={(e) => setTahun(e.target.value)} options={years.map((y) => ({ value: String(y), label: String(y) }))} className="w-28" />
          <SelectField label="Periode" value={bulan} onChange={(e) => setBulan(e.target.value)} options={bulanOptions} className="w-40" />
          <Button variant="ghost" size="sm" onClick={load}><RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /></Button>
          <Button variant="ghost" size="sm" onClick={() => downloadCsv(`rapb-realisasi-${tahun}.csv`, exportRows)}><Download className="h-3.5 w-3.5 mr-1" />CSV</Button>
          <Button variant="ghost" size="sm" onClick={printToPdf}><Printer className="h-3.5 w-3.5 mr-1" />PDF</Button>
        </div>
      </div>

      {error && <div className="flex items-center gap-2 p-3 rounded-lg text-sm" style={{ background: "rgba(220,38,38,0.08)", color: "rgb(220,38,38)" }}><AlertCircle className="h-4 w-4" />{error}</div>}

      {/* KPI ringkasan */}
      {data && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {[
            { label: "Anggaran Pendapatan", angg: data.total_anggaran_pendapatan, real: data.total_realisasi_pendapatan, positive: true },
            { label: "Anggaran Beban", angg: data.total_anggaran_beban, real: data.total_realisasi_beban, positive: false },
            { label: "Rencana SHU", angg: data.shu_anggaran, real: data.shu_realisasi, positive: true },
          ].map(({ label, angg, real, positive }) => (
            <div key={label} className="rounded-xl p-4 space-y-2" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
              <p className="text-xs font-medium" style={{ color: "var(--text-subtle)" }}>{label}</p>
              <div className="flex justify-between text-xs" style={{ color: "var(--text-subtle)" }}>
                <span>Anggaran: {rp(angg)}</span>
                <span>Realisasi: {rp(real)}</span>
              </div>
              <ProgressBar value={real} target={angg} positive={positive} />
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <div className="space-y-2">{[1,2,3,4,5].map((i) => <div key={i} className="h-10 rounded-lg animate-pulse" style={{ background: "var(--surface-muted)" }} />)}</div>
      ) : data && (
        <div className="rounded-xl overflow-hidden border" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: "var(--surface-muted)" }}>
                <th className="text-left p-2.5 text-xs font-semibold w-20">Kode</th>
                <th className="text-left p-2.5 text-xs font-semibold">Nama Akun</th>
                <th className="text-right p-2.5 text-xs font-semibold w-36">Anggaran</th>
                <th className="text-right p-2.5 text-xs font-semibold w-36">Realisasi</th>
                <th className="text-right p-2.5 text-xs font-semibold w-32">Selisih</th>
                <th className="p-2.5 text-xs font-semibold w-36">Capaian</th>
              </tr>
            </thead>
            <tbody>
              {/* Pendapatan */}
              {data.rows.filter((r) => r.jenis === "PENDAPATAN").length > 0 && (
                <>
                  <tr><td colSpan={6} className="px-2.5 py-2 text-xs font-bold uppercase tracking-wider" style={{ background: "var(--surface-muted)", color: "var(--text-subtle)" }}>Pendapatan</td></tr>
                  {data.rows.filter((r) => r.jenis === "PENDAPATAN").map((r) => (
                    <tr key={r.kode} className="border-t" style={{ borderColor: "var(--border)" }}>
                      <td className="p-2 font-mono text-xs" style={{ color: "var(--text-subtle)" }}>{r.kode}</td>
                      <td className="p-2">{r.nama}</td>
                      <td className="p-2 text-right text-xs">{r.anggaran > 0 ? rp(r.anggaran) : <span style={{ color: "var(--text-subtle)" }}>—</span>}</td>
                      <td className="p-2 text-right text-xs">{rp(r.realisasi)}</td>
                      <td className="p-2 text-right text-xs" style={{ color: r.selisih >= 0 ? "rgb(5,150,105)" : "rgb(220,38,38)" }}>{rp(r.selisih)}</td>
                      <td className="p-2"><ProgressBar value={r.realisasi} target={r.anggaran} positive={true} /></td>
                    </tr>
                  ))}
                  <tr className="border-t font-semibold" style={{ borderColor: "var(--border)", background: "var(--surface-muted)" }}>
                    <td colSpan={2} className="p-2.5 text-right">Total Pendapatan</td>
                    <td className="p-2.5 text-right">{rp(data.total_anggaran_pendapatan)}</td>
                    <td className="p-2.5 text-right">{rp(data.total_realisasi_pendapatan)}</td>
                    <td className="p-2.5 text-right" style={{ color: data.total_realisasi_pendapatan >= data.total_anggaran_pendapatan ? "rgb(5,150,105)" : "rgb(220,38,38)" }}>
                      {rp(data.total_realisasi_pendapatan - data.total_anggaran_pendapatan)}
                    </td>
                    <td />
                  </tr>
                </>
              )}
              {/* Beban */}
              {data.rows.filter((r) => r.jenis === "BEBAN").length > 0 && (
                <>
                  <tr><td colSpan={6} className="px-2.5 py-2 text-xs font-bold uppercase tracking-wider" style={{ background: "var(--surface-muted)", color: "var(--text-subtle)" }}>Beban</td></tr>
                  {data.rows.filter((r) => r.jenis === "BEBAN").map((r) => (
                    <tr key={r.kode} className="border-t" style={{ borderColor: "var(--border)" }}>
                      <td className="p-2 font-mono text-xs" style={{ color: "var(--text-subtle)" }}>{r.kode}</td>
                      <td className="p-2">{r.nama}</td>
                      <td className="p-2 text-right text-xs">{r.anggaran > 0 ? rp(r.anggaran) : <span style={{ color: "var(--text-subtle)" }}>—</span>}</td>
                      <td className="p-2 text-right text-xs">{rp(r.realisasi)}</td>
                      <td className="p-2 text-right text-xs" style={{ color: r.realisasi <= r.anggaran ? "rgb(5,150,105)" : "rgb(220,38,38)" }}>{rp(r.selisih)}</td>
                      <td className="p-2"><ProgressBar value={r.realisasi} target={r.anggaran} positive={false} /></td>
                    </tr>
                  ))}
                  <tr className="border-t font-semibold" style={{ borderColor: "var(--border)", background: "var(--surface-muted)" }}>
                    <td colSpan={2} className="p-2.5 text-right">Total Beban</td>
                    <td className="p-2.5 text-right">{rp(data.total_anggaran_beban)}</td>
                    <td className="p-2.5 text-right">{rp(data.total_realisasi_beban)}</td>
                    <td className="p-2.5 text-right" style={{ color: data.total_realisasi_beban <= data.total_anggaran_beban ? "rgb(5,150,105)" : "rgb(220,38,38)" }}>
                      {rp(data.total_realisasi_beban - data.total_anggaran_beban)}
                    </td>
                    <td />
                  </tr>
                </>
              )}
              {/* SHU */}
              <tr className="border-t" style={{ borderColor: "var(--border)" }}>
                <td colSpan={2} className="p-2.5 font-bold text-right" style={{ background: "var(--surface-muted)" }}>SHU (Pendapatan − Beban)</td>
                <td className="p-2.5 text-right font-bold" style={{ background: "var(--surface-muted)", color: "rgb(109,40,217)" }}>{rp(data.shu_anggaran)}</td>
                <td className="p-2.5 text-right font-bold" style={{ background: "var(--surface-muted)", color: data.shu_realisasi >= 0 ? "rgb(109,40,217)" : "rgb(220,38,38)" }}>{rp(data.shu_realisasi)}</td>
                <td className="p-2.5 text-right font-bold" style={{ background: "var(--surface-muted)", color: data.shu_realisasi >= data.shu_anggaran ? "rgb(5,150,105)" : "rgb(220,38,38)" }}>
                  {rp(data.shu_realisasi - data.shu_anggaran)}
                </td>
                <td style={{ background: "var(--surface-muted)" }} />
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

"use client"

import React, { useEffect, useState } from "react"
import { SelectField } from "@/components/ui/form-field"
import { Button } from "@/components/ui/button"
import { Wallet, RefreshCw, AlertCircle, Download, Printer } from "lucide-react"
import { getPeriodeFiskal, type PeriodeFiskalRow } from "@/actions/keuangan-periode"
import { downloadCsv, printToPdf } from "@/lib/keuangan/client-export"

const rp = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(n)

interface AkunSaldo { kode: string; nama: string; saldo: number; kelompok?: string | null }
interface NeracaData {
  aset: number; kewajiban: number; ekuitas: number
  simpanan_pokok: number; simpanan_wajib: number; shu: number
  aset_rows: AkunSaldo[]; kewajiban_rows: AkunSaldo[]; ekuitas_rows: AkunSaldo[]
  tgl_mulai: string; tgl_selesai: string
}

function SectionTable({ title, rows, total, color }: { title: string; rows: AkunSaldo[]; total: number; color: string }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between px-2 py-1.5 rounded font-semibold text-sm"
        style={{ background: `${color}18`, color }}>
        <span>{title}</span>
        <span>{rp(total)}</span>
      </div>
      <table className="w-full text-sm">
        <tbody>
          {rows.map((r) => (
            <tr key={r.kode} className="border-b last:border-0" style={{ borderColor: "var(--border)" }}>
              <td className="py-1.5 px-3 font-mono text-xs" style={{ color: "var(--text-subtle)" }}>{r.kode}</td>
              <td className="py-1.5 px-2">{r.nama}</td>
              <td className="py-1.5 px-3 text-right font-medium">{rp(r.saldo)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function NeracaPage() {
  const now = new Date()
  const [periods, setPeriods] = useState<PeriodeFiskalRow[]>([])
  const [periodeId, setPeriodeId] = useState("")
  const [data, setData] = useState<NeracaData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getPeriodeFiskal().then((r) => {
      if (r.success) {
        setPeriods(r.data)
        // default: periode bulan ini atau pertama
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
      const res = await fetch(`/api/keuangan/summary?type=neraca&periode_id=${periodeId}`)
      if (!res.ok) { const j = await res.json(); throw new Error(j.error ?? "Gagal") }
      setData(await res.json())
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat neraca")
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
    ...data.aset_rows.map((r) => ({ kelompok: "ASET", kode: r.kode, nama: r.nama, saldo: r.saldo })),
    ...data.kewajiban_rows.map((r) => ({ kelompok: "KEWAJIBAN", kode: r.kode, nama: r.nama, saldo: r.saldo })),
    ...data.ekuitas_rows.map((r) => ({ kelompok: "EKUITAS", kode: r.kode, nama: r.nama, saldo: r.saldo })),
  ] : []

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Wallet className="h-5 w-5" style={{ color: "var(--primary)" }} />
          <h1 className="text-xl font-semibold" style={{ color: "var(--text-900)" }}>Neraca</h1>
          <span className="text-sm" style={{ color: "var(--text-subtle)" }}>— Laporan Posisi Keuangan</span>
        </div>
        <div className="flex gap-2">
          <SelectField label="Periode" value={periodeId} onChange={(e) => setPeriodeId(e.target.value)} options={periodOptions} className="w-44" />
          <Button variant="ghost" size="sm" onClick={load}><RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /></Button>
          <Button variant="ghost" size="sm" onClick={() => downloadCsv("neraca.csv", exportRows)}><Download className="h-3.5 w-3.5 mr-1" />CSV</Button>
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
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* ASET */}
          <div className="rounded-xl p-5 space-y-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
            <h2 className="font-semibold text-base" style={{ color: "var(--text-900)" }}>ASET</h2>
            <SectionTable title="Total Aset" rows={data.aset_rows} total={data.aset} color="rgb(37,99,235)" />
          </div>

          {/* KEWAJIBAN + EKUITAS */}
          <div className="rounded-xl p-5 space-y-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
            <h2 className="font-semibold text-base" style={{ color: "var(--text-900)" }}>KEWAJIBAN & EKUITAS</h2>
            <SectionTable title="Kewajiban" rows={data.kewajiban_rows} total={data.kewajiban} color="rgb(217,119,6)" />
            <div className="border-t my-2" style={{ borderColor: "var(--border)" }} />
            <SectionTable title="Ekuitas" rows={data.ekuitas_rows} total={data.ekuitas} color="rgb(5,150,105)" />
            {/* Khas Koperasi */}
            <div className="mt-3 rounded-lg p-3 space-y-1.5" style={{ background: "rgba(5,150,105,0.06)", border: "1px solid rgba(5,150,105,0.2)" }}>
              <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: "rgb(5,150,105)" }}>Rincian Ekuitas Koperasi</p>
              {[
                { label: "Simpanan Pokok", val: data.simpanan_pokok },
                { label: "Simpanan Wajib", val: data.simpanan_wajib },
                { label: "SHU (akumulasi)", val: data.shu },
              ].map(({ label, val }) => (
                <div key={label} className="flex justify-between text-sm">
                  <span style={{ color: "var(--text-subtle)" }}>{label}</span>
                  <span className="font-medium">{rp(val)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Persamaan akuntansi */}
          <div className="lg:col-span-2 rounded-xl p-4 flex flex-wrap gap-4 items-center justify-center text-sm font-medium"
            style={{ background: Math.abs(data.aset - (data.kewajiban + data.ekuitas)) < 1 ? "rgba(5,150,105,0.08)" : "rgba(220,38,38,0.08)", border: `1px solid ${Math.abs(data.aset - (data.kewajiban + data.ekuitas)) < 1 ? "rgba(5,150,105,0.3)" : "rgba(220,38,38,0.3)"}` }}>
            <span>Aset: <strong>{rp(data.aset)}</strong></span>
            <span style={{ color: "var(--text-subtle)" }}>=</span>
            <span>Kewajiban: <strong>{rp(data.kewajiban)}</strong></span>
            <span style={{ color: "var(--text-subtle)" }}>+</span>
            <span>Ekuitas: <strong>{rp(data.ekuitas)}</strong></span>
            {Math.abs(data.aset - (data.kewajiban + data.ekuitas)) < 1
              ? <span style={{ color: "rgb(5,150,105)" }}>✓ Balance</span>
              : <span style={{ color: "rgb(220,38,38)" }}>⚠ Tidak Balance</span>}
          </div>
        </div>
      )}
    </div>
  )
}

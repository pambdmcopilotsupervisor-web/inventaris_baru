"use client"

import React, { useEffect, useState } from "react"
import Link from "next/link"
import { BookOpen, RefreshCw, Download, Printer } from "lucide-react"
import { Button } from "@/components/ui/button"
import { SelectField } from "@/components/ui/form-field"
import { SearchableSelect } from "@/components/ui/searchable-select"
import { getAkun, type AkunRow } from "@/actions/keuangan-akun"
import { getPeriodeFiskal, type PeriodeFiskalRow } from "@/actions/keuangan-periode"
import { downloadCsv, printToPdf } from "@/lib/keuangan/client-export"

const rp = (n: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(n)

type Row = { tanggal: string; nomor_jurnal: string; jenis: string; keterangan: string; debit: number; kredit: number; saldo: number }
type Data = { akun: { kode: string; nama: string; saldo_normal: string }; saldo_awal: number; saldo_akhir: number; rows: Row[] }
type SummaryRow = { akun_id: number; kode: string; nama: string; jenis: string; saldo_normal: string; saldo_awal: number; total_debit: number; total_kredit: number; saldo_akhir: number }
type SummaryData = { rows: SummaryRow[]; total_debit: number; total_kredit: number }

export default function BukuBesarPage() {
  const [periods, setPeriods] = useState<PeriodeFiskalRow[]>([])
  const [akuns, setAkuns] = useState<AkunRow[]>([])
  const [periodeId, setPeriodeId] = useState("")
  const [akunId, setAkunId] = useState("")
  const [tab, setTab] = useState<"summary" | "detail">("summary")
  const [data, setData] = useState<Data | null>(null)
  const [summary, setSummary] = useState<SummaryData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getPeriodeFiskal().then((r) => {
      if (r.success) {
        setPeriods(r.data)
        if (r.data[0]) setPeriodeId(String(r.data[0].id))
      }
    })
    getAkun({ is_detail: true, is_active: true }).then((r) => {
      if (r.success) {
        setAkuns(r.data)
        if (r.data[0]) setAkunId(String(r.data[0].id))
      }
    })
  }, [])

  async function load() {
    if (!periodeId) return
    setLoading(true)
    setError(null)
    try {
      if (tab === "summary") {
        const res = await fetch(`/api/keuangan/summary?type=buku_besar_summary&periode_id=${periodeId}`)
        const json = await res.json()
        if (!res.ok) throw new Error(json.error ?? "Gagal memuat ringkasan buku besar")
        setSummary(json)
        return
      }
      if (!akunId) return
      const res = await fetch(`/api/keuangan/summary?type=buku_besar&periode_id=${periodeId}&akun_id=${akunId}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Gagal memuat buku besar")
      setData(json)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat buku besar")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (periodeId && (tab === "summary" || akunId)) void Promise.resolve().then(load)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodeId, akunId, tab])

  const exportRows = data?.rows.map((r) => ({ ...r, tanggal: new Date(r.tanggal).toLocaleDateString("id-ID") })) ?? []
  const summaryExportRows = summary?.rows ?? []
  const accountOptions = akuns.map((a) => ({ value: String(a.id), label: `${a.kode} - ${a.nama}`, description: a.jenis }))

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <BookOpen className="h-5 w-5" style={{ color: "var(--primary)" }} />
          <h1 className="text-xl font-semibold" style={{ color: "var(--text-900)" }}>Buku Besar</h1>
        </div>
        <div className="flex gap-2 flex-wrap">
          <SelectField label="Periode" value={periodeId} onChange={(e) => setPeriodeId(e.target.value)} options={[{ value: "", label: "Pilih Periode" }, ...periods.map((p) => ({ value: String(p.id), label: p.nama }))]} className="w-44" />
          {tab === "detail" && <SearchableSelect label="Akun" value={akunId} onChange={setAkunId} options={accountOptions} placeholder="Pilih Akun" searchPlaceholder="Cari kode/nama akun..." className="w-72" />}
          <Button variant="ghost" size="sm" onClick={load}><RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /></Button>
          <Button variant="ghost" size="sm" onClick={() => downloadCsv(tab === "summary" ? "buku-besar-ringkasan.csv" : "buku-besar.csv", tab === "summary" ? summaryExportRows : exportRows)}><Download className="h-3.5 w-3.5 mr-1" />CSV</Button>
          <Button variant="ghost" size="sm" onClick={printToPdf}><Printer className="h-3.5 w-3.5 mr-1" />PDF</Button>
        </div>
      </div>

      <div className="flex gap-1 p-1 rounded-lg w-fit" style={{ background: "var(--surface-muted)" }}>
        {([['summary', 'Ringkasan Akun'], ['detail', 'Detail Akun']] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} className="px-3 py-1.5 rounded-md text-sm font-medium transition-colors" style={tab === key ? { background: "var(--surface)", color: "var(--text-900)", boxShadow: "0 1px 2px rgba(0,0,0,0.05)" } : { color: "var(--text-subtle)" }}>{label}</button>
        ))}
      </div>

      {error && <div className="p-3 rounded-lg text-sm" style={{ background: "rgba(220,38,38,0.08)", color: "rgb(220,38,38)" }}>{error}</div>}

      {tab === "summary" && summary && (
        <div className="rounded-xl overflow-hidden overflow-x-auto" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          <table className="w-full text-sm">
            <thead style={{ background: "var(--surface-muted)" }}><tr><th className="p-2 text-left">Kode</th><th className="p-2 text-left">Akun</th><th className="p-2 text-left">Jenis</th><th className="p-2 text-right">Saldo Awal</th><th className="p-2 text-right">Debit</th><th className="p-2 text-right">Kredit</th><th className="p-2 text-right">Saldo Akhir</th></tr></thead>
            <tbody>
              {summary.rows.map((r) => (
                <tr key={r.akun_id} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="p-2 font-mono text-xs">{r.kode}</td>
                  <td className="p-2"><button className="font-medium text-left hover:underline" style={{ color: "var(--primary)" }} onClick={() => { setAkunId(String(r.akun_id)); setTab("detail") }}>{r.nama}</button></td>
                  <td className="p-2 text-xs">{r.jenis}</td>
                  <td className="p-2 text-right">{rp(r.saldo_awal)}</td>
                  <td className="p-2 text-right">{r.total_debit ? rp(r.total_debit) : "-"}</td>
                  <td className="p-2 text-right">{r.total_kredit ? rp(r.total_kredit) : "-"}</td>
                  <td className="p-2 text-right font-semibold">{rp(r.saldo_akhir)}</td>
                </tr>
              ))}
              {summary.rows.length === 0 && <tr><td colSpan={7} className="p-4 text-center" style={{ color: "var(--text-subtle)" }}>Tidak ada mutasi akun pada periode ini</td></tr>}
            </tbody>
            <tfoot style={{ background: "var(--surface-muted)" }}><tr className="font-bold"><td colSpan={4} className="p-2 text-right">Total Mutasi</td><td className="p-2 text-right">{rp(summary.total_debit)}</td><td className="p-2 text-right">{rp(summary.total_kredit)}</td><td /></tr></tfoot>
          </table>
        </div>
      )}

      {tab === "detail" && data && (
        <div className="space-y-3">
          <div className="rounded-xl p-4 flex justify-between gap-3 flex-wrap" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
            <div>
              <p className="text-xs" style={{ color: "var(--text-subtle)" }}>Akun</p>
              <p className="font-semibold">{data.akun.kode} - {data.akun.nama}</p>
            </div>
            <div className="text-right"><p className="text-xs" style={{ color: "var(--text-subtle)" }}>Saldo Awal</p><p className="font-semibold">{rp(data.saldo_awal)}</p></div>
            <div className="text-right"><p className="text-xs" style={{ color: "var(--text-subtle)" }}>Saldo Akhir</p><p className="font-semibold">{rp(data.saldo_akhir)}</p></div>
          </div>

          <div className="rounded-xl overflow-hidden" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
            <table className="w-full text-sm">
              <thead style={{ background: "var(--surface-muted)" }}>
                <tr>
                  <th className="p-2 text-left">Tanggal</th>
                  <th className="p-2 text-left">Nomor</th>
                  <th className="p-2 text-left">Keterangan</th>
                  <th className="p-2 text-right">Debit</th>
                  <th className="p-2 text-right">Kredit</th>
                  <th className="p-2 text-right">Saldo</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r, i) => (
                  <tr key={`${r.nomor_jurnal}-${i}`} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="p-2">{new Date(r.tanggal).toLocaleDateString("id-ID")}</td>
                    <td className="p-2 font-mono text-xs"><Link href="/dashboard/keuangan/jurnal" className="hover:underline" style={{ color: "var(--primary)" }}>{r.nomor_jurnal}</Link></td>
                    <td className="p-2">{r.keterangan}</td>
                    <td className="p-2 text-right">{r.debit ? rp(r.debit) : "-"}</td>
                    <td className="p-2 text-right">{r.kredit ? rp(r.kredit) : "-"}</td>
                    <td className="p-2 text-right font-medium">{rp(r.saldo)}</td>
                  </tr>
                ))}
                {data.rows.length === 0 && <tr><td colSpan={6} className="p-4 text-center text-sm" style={{ color: "var(--text-subtle)" }}>Tidak ada mutasi periode ini</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

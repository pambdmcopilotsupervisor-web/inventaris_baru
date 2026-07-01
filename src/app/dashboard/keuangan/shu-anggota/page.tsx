"use client"

import React, { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { SelectField } from "@/components/ui/form-field"
import { PieChart, RefreshCw, Save, AlertCircle, CheckCircle2, Printer } from "lucide-react"
import { getShuAnggotaPreview, saveShuAnggotaAllocation, type ShuAnggotaPreview } from "@/actions/keuangan-shu"
import { rp } from "@/lib/keuangan/format"
import { printToPdf } from "@/lib/keuangan/client-export"

export default function ShuAnggotaPage() {
  const now = new Date()
  const years = Array.from({ length: 6 }, (_, i) => now.getFullYear() - i)
  const [tahun, setTahun] = useState(String(now.getFullYear()))
  const [data, setData] = useState<ShuAnggotaPreview | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  async function load() {
    setLoading(true); setError(null); setDone(null)
    const res = await getShuAnggotaPreview(Number(tahun))
    if (res.success) setData(res.data)
    else { setData(null); setError(res.error) }
    setLoading(false)
  }

  useEffect(() => {
    void Promise.resolve().then(load)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tahun])

  async function handleSave() {
    if (!confirm(`Simpan alokasi SHU anggota tahun ${tahun}?`)) return
    setSaving(true); setError(null); setDone(null)
    const res = await saveShuAnggotaAllocation(Number(tahun))
    setSaving(false)
    if (res.success) { setDone(`${res.data.count} alokasi anggota tersimpan`); load() }
    else setError(res.error)
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <PieChart className="h-5 w-5" style={{ color: "var(--primary)" }} />
          <div>
            <h1 className="text-xl font-semibold" style={{ color: "var(--text-900)" }}>SHU per Anggota</h1>
            <p className="text-xs" style={{ color: "var(--text-subtle)" }}>Membagi pos SHU Bagian Anggota berdasarkan proporsi saldo simpanan.</p>
          </div>
        </div>
        <div className="flex gap-2 items-end flex-wrap">
          <SelectField label="Tahun Buku" value={tahun} onChange={(e) => setTahun(e.target.value)} options={years.map((y) => ({ value: String(y), label: String(y) }))} className="w-32" />
          <Button variant="ghost" size="sm" onClick={load}><RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /></Button>
          <Button variant="ghost" size="sm" onClick={() => printToPdf("SHU per Anggota")} disabled={!data}><Printer className="h-3.5 w-3.5 mr-1" />PDF</Button>
        </div>
      </div>

      {done && <div className="flex items-center gap-2 p-3 rounded-lg text-sm" style={{ background: "rgba(5,150,105,0.08)", color: "rgb(5,150,105)", border: "1px solid rgba(5,150,105,0.25)" }}><CheckCircle2 className="h-4 w-4" />{done}</div>}
      {error && <div className="flex items-center gap-2 p-3 rounded-lg text-sm" style={{ background: "rgba(220,38,38,0.08)", color: "rgb(220,38,38)" }}><AlertCircle className="h-4 w-4" />{error}</div>}

      {data && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="rounded-xl p-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}><p className="text-xs" style={{ color: "var(--text-subtle)" }}>SHU Bagian Anggota</p><p className="font-bold text-purple-700">{rp(data.total_bagian_anggota)}</p></div>
            <div className="rounded-xl p-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}><p className="text-xs" style={{ color: "var(--text-subtle)" }}>Basis Simpanan</p><p className="font-bold">{rp(data.total_basis)}</p></div>
            <div className="rounded-xl p-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}><p className="text-xs" style={{ color: "var(--text-subtle)" }}>Jumlah Anggota</p><p className="font-bold">{data.rows.length}</p></div>
            <div className="rounded-xl p-4" style={{ background: data.already_saved ? "rgba(5,150,105,0.08)" : "rgba(217,119,6,0.08)", border: "1px solid var(--border)" }}><p className="text-xs" style={{ color: "var(--text-subtle)" }}>Status</p><p className="font-bold">{data.already_saved ? "Tersimpan" : "Preview"}</p></div>
          </div>

          <div className="rounded-xl overflow-hidden overflow-x-auto" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
            <table className="w-full text-sm">
              <thead style={{ background: "var(--surface-muted)" }}><tr><th className="p-2 text-left">No. Anggota</th><th className="p-2 text-left">Nama</th><th className="p-2 text-right">Basis Simpanan</th><th className="p-2 text-right">Porsi</th><th className="p-2 text-right">SHU</th></tr></thead>
              <tbody>
                {data.rows.map((r) => <tr key={r.anggota_id} className="border-t" style={{ borderColor: "var(--border)" }}><td className="p-2 font-mono text-xs">{r.no_anggota}</td><td className="p-2 font-medium">{r.nama}</td><td className="p-2 text-right">{rp(r.basis_simpanan)}</td><td className="p-2 text-right">{r.porsi.toFixed(4)}%</td><td className="p-2 text-right font-bold text-purple-700">{rp(r.jumlah)}</td></tr>)}
                {data.rows.length === 0 && <tr><td colSpan={5} className="p-4 text-center" style={{ color: "var(--text-subtle)" }}>Tidak ada anggota dengan basis simpanan</td></tr>}
              </tbody>
              <tfoot style={{ background: "var(--surface-muted)" }}><tr className="font-bold"><td colSpan={2} className="p-2 text-right">Total</td><td className="p-2 text-right">{rp(data.total_basis)}</td><td className="p-2 text-right">100%</td><td className="p-2 text-right">{rp(data.rows.reduce((s, r) => s + r.jumlah, 0))}</td></tr></tfoot>
            </table>
          </div>

          {!data.already_saved && <div className="flex justify-end"><Button onClick={handleSave} disabled={saving || data.rows.length === 0}><Save className="h-4 w-4 mr-1" />{saving ? "Menyimpan..." : "Simpan Alokasi SHU Anggota"}</Button></div>}
        </>
      )}
    </div>
  )
}

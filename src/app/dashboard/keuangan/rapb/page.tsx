"use client"

import React, { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { SelectField } from "@/components/ui/form-field"
import { ClipboardList, Save, RefreshCw, CheckCircle2, AlertCircle } from "lucide-react"
import { getAkun, type AkunRow } from "@/actions/keuangan-akun"
import { getAnggaran, saveAnggaran } from "@/actions/keuangan-anggaran"
import { rp, formatThousand, parseThousand } from "@/lib/keuangan/format"

const MONTHS = ["","Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"]
const JENIS_ORDER = ["PENDAPATAN", "BEBAN"]
const JENIS_LABEL: Record<string, string> = { PENDAPATAN: "Pendapatan", BEBAN: "Beban" }

export default function RAPBPage() {
  const now = new Date()
  const [tahun, setTahun] = useState(String(now.getFullYear()))
  const [bulan, setBulan] = useState("0") // 0 = tahunan
  const [akuns, setAkuns] = useState<AkunRow[]>([])
  const [values, setValues] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - 1 + i)
  const bulanOptions = [
    { value: "0", label: "Tahunan (RAPB)" },
    ...MONTHS.slice(1).map((m, i) => ({ value: String(i + 1), label: m })),
  ]

  const loadData = async () => {
    setLoading(true); setDone(false)
    const [akunRes, anggaranRes] = await Promise.all([
      getAkun({ is_detail: true, is_active: true }),
      getAnggaran(Number(tahun), Number(bulan)),
    ])
    if (akunRes.success) setAkuns(akunRes.data.filter((a) => ["PENDAPATAN", "BEBAN"].includes(a.jenis)))
    if (anggaranRes.success) {
      const init: Record<string, string> = {}
      anggaranRes.data.forEach((r) => { if (r.jumlah > 0) init[r.akun_id] = formatThousand(r.jumlah) })
      setValues(init)
    }
    setLoading(false)
  }

  useEffect(() => { loadData() }, [tahun, bulan])

  const grouped = useMemo(() => {
    const g: Record<string, AkunRow[]> = {}
    for (const a of akuns) (g[a.jenis] ??= []).push(a)
    for (const k of Object.keys(g)) g[k].sort((x, y) => x.kode.localeCompare(y.kode))
    return g
  }, [akuns])

  const totalPendapatan = akuns.filter((a) => a.jenis === "PENDAPATAN").reduce((s, a) => s + parseThousand(values[a.id] ?? ""), 0)
  const totalBeban = akuns.filter((a) => a.jenis === "BEBAN").reduce((s, a) => s + parseThousand(values[a.id] ?? ""), 0)
  const shuAnggaran = totalPendapatan - totalBeban

  async function handleSave() {
    setSaving(true); setError(null); setDone(false)
    const items = akuns
      .filter((a) => parseThousand(values[a.id] ?? "") > 0)
      .map((a) => ({ akun_id: a.id, jumlah: parseThousand(values[a.id] ?? "") }))
    const res = await saveAnggaran({ tahun: Number(tahun), bulan: Number(bulan), items })
    setSaving(false)
    if (res.success) setDone(true)
    else setError(res.error)
  }

  const periodLabel = bulan === "0" ? `Tahunan ${tahun}` : `${MONTHS[Number(bulan)]} ${tahun}`

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <ClipboardList className="h-5 w-5" style={{ color: "var(--primary)" }} />
          <h1 className="text-xl font-semibold" style={{ color: "var(--text-900)" }}>RAPB</h1>
          <span className="text-sm" style={{ color: "var(--text-subtle)" }}>— Rencana Anggaran Pendapatan &amp; Belanja</span>
        </div>
        <div className="flex gap-2 items-end flex-wrap">
          <SelectField label="Tahun" value={tahun} onChange={(e) => setTahun(e.target.value)} options={years.map((y) => ({ value: String(y), label: String(y) }))} className="w-28" />
          <SelectField label="Periode" value={bulan} onChange={(e) => setBulan(e.target.value)} options={bulanOptions} className="w-44" />
          <Button variant="ghost" size="sm" onClick={loadData}><RefreshCw className="h-3.5 w-3.5" /></Button>
        </div>
      </div>

      <p className="text-sm" style={{ color: "var(--text-subtle)" }}>
        Input rencana anggaran untuk akun Pendapatan &amp; Beban. Setelah disimpan, dapat dibandingkan dengan realisasi di <strong>Laporan RAPB vs Realisasi</strong>.
      </p>

      {done && (
        <div className="flex items-center gap-2 p-3 rounded-lg text-sm" style={{ background: "rgba(5,150,105,0.08)", color: "rgb(5,150,105)", border: "1px solid rgba(5,150,105,0.25)" }}>
          <CheckCircle2 className="h-4 w-4" />RAPB {periodLabel} berhasil disimpan.
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg text-sm" style={{ background: "rgba(220,38,38,0.08)", color: "rgb(220,38,38)" }}>
          <AlertCircle className="h-4 w-4" />{error}
        </div>
      )}

      {loading ? (
        <div className="space-y-2">{[1,2,3,4].map((i) => <div key={i} className="h-10 rounded-lg animate-pulse" style={{ background: "var(--surface-muted)" }} />)}</div>
      ) : (
        <div className="rounded-xl overflow-hidden border" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: "var(--surface-muted)" }}>
                <th className="text-left p-2.5 text-xs font-semibold w-24">Kode</th>
                <th className="text-left p-2.5 text-xs font-semibold">Nama Akun</th>
                <th className="text-right p-2.5 text-xs font-semibold w-48">Anggaran {periodLabel} (Rp)</th>
              </tr>
            </thead>
            <tbody>
              {JENIS_ORDER.filter((j) => grouped[j]?.length).map((jenis) => (
                <React.Fragment key={jenis}>
                  <tr>
                    <td colSpan={3} className="px-2.5 py-2 text-xs font-bold uppercase tracking-wider"
                      style={{ background: "var(--surface-muted)", color: "var(--text-subtle)" }}>
                      {JENIS_LABEL[jenis]}
                    </td>
                  </tr>
                  {grouped[jenis].map((a) => (
                    <tr key={a.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                      <td className="p-2 font-mono text-xs" style={{ color: "var(--text-subtle)" }}>{a.kode}</td>
                      <td className="p-2">{a.nama}</td>
                      <td className="p-1.5">
                        <input
                          inputMode="numeric"
                          value={values[a.id] ?? ""}
                          onChange={(e) => setValues((prev) => ({ ...prev, [a.id]: formatThousand(e.target.value) }))}
                          className="w-full text-xs rounded px-2 py-1.5 border text-right"
                          style={{ borderColor: parseThousand(values[a.id] ?? "") > 0 ? "var(--primary)" : "var(--border)", background: "var(--surface)", color: "var(--text-900)" }}
                          placeholder="0"
                        />
                      </td>
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
            <tfoot>
              {[
                { label: "Total Anggaran Pendapatan", val: totalPendapatan, color: "rgb(5,150,105)" },
                { label: "Total Anggaran Beban", val: totalBeban, color: "rgb(220,38,38)" },
                { label: "Rencana SHU", val: shuAnggaran, color: shuAnggaran >= 0 ? "rgb(109,40,217)" : "rgb(220,38,38)" },
              ].map(({ label, val, color }) => (
                <tr key={label} className="border-t" style={{ borderColor: "var(--border)", background: "var(--surface-muted)" }}>
                  <td colSpan={2} className="p-2.5 text-right font-semibold">{label}</td>
                  <td className="p-2.5 text-right font-bold" style={{ color }}>{rp(val)}</td>
                </tr>
              ))}
            </tfoot>
          </table>
        </div>
      )}

      <div className="flex justify-end sticky bottom-0 py-3" style={{ background: "var(--bg)" }}>
        <Button onClick={handleSave} disabled={saving}>
          <Save className="h-4 w-4 mr-1" />{saving ? "Menyimpan…" : "Simpan RAPB"}
        </Button>
      </div>
    </div>
  )
}

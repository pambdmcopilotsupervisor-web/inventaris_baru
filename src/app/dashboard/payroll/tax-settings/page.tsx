"use client"

import React, { useEffect, useMemo, useState } from "react"
import { DataTable, Column } from "@/components/ui/data-table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Modal } from "@/components/ui/modal"
import { ConfirmDelete } from "@/components/ui/confirm-delete"
import { TextField, SelectField } from "@/components/ui/form-field"
import { Plus, Pencil, Trash2, RefreshCw, Save } from "lucide-react"
import { formatCurrency } from "@/lib/utils"
import {
  getTaxSettings, updateTaxConfig,
  saveBpjsSetting, deleteBpjsSetting,
  savePtkpSetting, deletePtkpSetting,
  saveBrackets,
  getTerRates, saveTerRates,
} from "@/actions/payroll-tax"

interface Config {
  biaya_jabatan_persen: number; biaya_jabatan_maks_bulan: number; metode_pph21: string
  npwp_surcharge_persen: number; pembulatan_pph: number; pembulatan_gaji: number; bpjs_enabled: boolean; pph21_enabled: boolean
}
interface Bpjs {
  id: number; kode: string; nama: string; rate_karyawan: number; rate_perusahaan: number
  batas_atas_upah: number | null; basis_component_code: string; menambah_bruto_pajak: boolean
  pengurang_pajak: boolean; is_active: boolean; urutan: number
}
interface Ptkp { id: number; kode: string; nama: string; nominal_setahun: number; kategori_ter: string; is_active: boolean; urutan: number }
interface Bracket { urutan: number; batas_bawah: number; batas_atas: number | null; tarif_persen: number }
interface TerRate { id?: number; kategori: string; bruto_min: number; bruto_max: number | null; tarif_persen: number }
interface GuardrailIssue { level: "error" | "warning"; message: string }

const TABS = [["config", "Konfigurasi"], ["bpjs", "BPJS"], ["ptkp", "PTKP"], ["bracket", "Tarif PPh21"], ["ter", "Tarif TER"]] as const
type Tab = (typeof TABS)[number][0]

const EMPTY_BPJS: Bpjs = { id: 0, kode: "", nama: "", rate_karyawan: 0, rate_perusahaan: 0, batas_atas_upah: null, basis_component_code: "GAJI_POKOK", menambah_bruto_pajak: false, pengurang_pajak: false, is_active: true, urutan: 0 }
const EMPTY_PTKP: Ptkp = { id: 0, kode: "", nama: "", nominal_setahun: 0, kategori_ter: "A", is_active: true, urutan: 0 }

function analyzeRanges(rows: Array<{ min: number; max: number | null; rate: number }>, label: string): GuardrailIssue[] {
  const issues: GuardrailIssue[] = []
  const normalized = rows.map((r) => ({
    min: Number(r.min),
    max: r.max == null ? null : Number(r.max),
    rate: Number(r.rate),
  }))
  const sorted = [...normalized].sort((a, b) => a.min - b.min)

  if (sorted.length === 0) {
    issues.push({ level: "warning", message: `${label} masih kosong.` })
    return issues
  }

  for (let i = 0; i < sorted.length; i++) {
    const r = sorted[i]
    if (!Number.isFinite(r.min) || r.min < 0) issues.push({ level: "error", message: `Baris ${i + 1}: nilai minimum tidak valid.` })
    if (r.max != null && (!Number.isFinite(r.max) || r.max <= r.min)) issues.push({ level: "error", message: `Baris ${i + 1}: nilai maksimum harus lebih besar dari minimum.` })
    if (!Number.isFinite(r.rate) || r.rate < 0) issues.push({ level: "error", message: `Baris ${i + 1}: tarif harus >= 0.` })
  }

  if (sorted[0].min > 0) {
    issues.push({ level: "warning", message: `Rentang mulai dari ${sorted[0].min.toLocaleString("id-ID")}, ada gap dari 0.` })
  }

  for (let i = 0; i < sorted.length - 1; i++) {
    const cur = sorted[i]
    const next = sorted[i + 1]
    if (cur.max == null) {
      issues.push({ level: "error", message: `Baris ${i + 1}: maksimum tak terbatas harus jadi baris terakhir.` })
      continue
    }
    if (next.min <= cur.max) {
      issues.push({ level: "error", message: `Rentang overlap antara baris ${i + 1} dan ${i + 2}.` })
    } else if (next.min > cur.max + 1) {
      issues.push({ level: "warning", message: `Ada gap rentang antara ${cur.max.toLocaleString("id-ID")} dan ${next.min.toLocaleString("id-ID")}.` })
    }
  }

  return issues
}

export default function TaxSettingsPage() {
  const [tab, setTab] = useState<Tab>("config")
  const [config, setConfig] = useState<Config | null>(null)
  const [bpjs, setBpjs] = useState<Bpjs[]>([])
  const [ptkp, setPtkp] = useState<Ptkp[]>([])
  const [brackets, setBrackets] = useState<Bracket[]>([])
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState<string | null>(null)

  const [bpjsModal, setBpjsModal] = useState<Bpjs | null>(null)
  const [ptkpModal, setPtkpModal] = useState<Ptkp | null>(null)
  const [delBpjs, setDelBpjs] = useState<Bpjs | null>(null)
  const [delPtkp, setDelPtkp] = useState<Ptkp | null>(null)
  const [saving, setSaving] = useState(false)

  const [terAll, setTerAll] = useState<TerRate[]>([])
  const [terKat, setTerKat] = useState("A")
  const [terRows, setTerRows] = useState<TerRate[]>([])

  const bracketIssues = useMemo(
    () => analyzeRanges(brackets.map((b) => ({ min: b.batas_bawah, max: b.batas_atas, rate: b.tarif_persen })), "Tarif PPh21"),
    [brackets],
  )
  const terIssues = useMemo(
    () => analyzeRanges(terRows.map((r) => ({ min: r.bruto_min, max: r.bruto_max, rate: r.tarif_persen })), `Tarif TER ${terKat}`),
    [terRows, terKat],
  )
  const hasBracketError = bracketIssues.some((x) => x.level === "error")
  const hasTerError = terIssues.some((x) => x.level === "error")

  const loadTer = async () => {
    const res = await getTerRates()
    if (res.success) setTerAll(res.data as unknown as TerRate[])
  }

  const load = async () => {
    const res = await getTaxSettings()
    if (res.success) {
      setConfig(res.data.config as unknown as Config | null)
      setBpjs(res.data.bpjs as unknown as Bpjs[])
      setPtkp(res.data.ptkp as unknown as Ptkp[])
      setBrackets(res.data.brackets as unknown as Bracket[])
    }
    setLoading(false)
  }
  useEffect(() => {
    let active = true
    getTaxSettings().then((res) => {
      if (!active) return
      if (res.success) {
        setConfig(res.data.config as unknown as Config | null)
        setBpjs(res.data.bpjs as unknown as Bpjs[]); setPtkp(res.data.ptkp as unknown as Ptkp[]); setBrackets(res.data.brackets as unknown as Bracket[])
      }
      setLoading(false)
    })
    getTerRates().then((res) => {
      if (!active || !res.success) return
      const rows = res.data as unknown as TerRate[]
      setTerAll(rows)
      setTerRows(rows.filter((r) => r.kategori === "A").sort((a, b) => a.bruto_min - b.bruto_min))
    })
    return () => { active = false }
  }, [])

  const selectTerKat = (k: string) => {
    setTerKat(k)
    setTerRows(terAll.filter((r) => r.kategori === k).sort((a, b) => a.bruto_min - b.bruto_min))
  }

  const flash = (m: string) => { setNotice(m); setTimeout(() => setNotice(null), 3000) }

  // ── Config save ──
  const saveConfig = async () => {
    if (!config) return
    setSaving(true)
    const res = await updateTaxConfig(config as unknown as Parameters<typeof updateTaxConfig>[0])
    setSaving(false)
    if (!res.success) { alert(res.error); return }
    flash("Konfigurasi tersimpan")
  }

  // ── BPJS ──
  const submitBpjs = async () => {
    if (!bpjsModal) return
    setSaving(true)
    const res = await saveBpjsSetting({ ...bpjsModal, id: bpjsModal.id || undefined })
    setSaving(false)
    if (!res.success) { alert(res.error); return }
    setBpjsModal(null); load(); flash("BPJS tersimpan")
  }
  const removeBpjs = async () => {
    if (!delBpjs) return
    setSaving(true)
    const res = await deleteBpjsSetting(delBpjs.id)
    setSaving(false); setDelBpjs(null)
    if (!res.success) { alert(res.error); return }
    load()
  }

  // ── PTKP ──
  const submitPtkp = async () => {
    if (!ptkpModal) return
    setSaving(true)
    const res = await savePtkpSetting({ ...ptkpModal, id: ptkpModal.id || undefined } as unknown as Parameters<typeof savePtkpSetting>[0])
    setSaving(false)
    if (!res.success) { alert(res.error); return }
    setPtkpModal(null); load(); flash("PTKP tersimpan")
  }
  const removePtkp = async () => {
    if (!delPtkp) return
    setSaving(true)
    const res = await deletePtkpSetting(delPtkp.id)
    setSaving(false); setDelPtkp(null)
    if (!res.success) { alert(res.error); return }
    load()
  }

  // ── Brackets ──
  const setBracket = (i: number, k: keyof Bracket, v: string) =>
    setBrackets((bs) => bs.map((b, idx) => idx === i ? { ...b, [k]: k === "batas_atas" && v === "" ? null : Number(v) } : b))
  const addBracket = () => setBrackets((bs) => [...bs, { urutan: bs.length + 1, batas_bawah: 0, batas_atas: null, tarif_persen: 0 }])
  const delBracket = (i: number) => setBrackets((bs) => bs.filter((_, idx) => idx !== i))
  const submitBrackets = async () => {
    setSaving(true)
    const res = await saveBrackets(brackets)
    setSaving(false)
    if (!res.success) { alert(res.error); return }
    load(); flash("Tarif PPh21 tersimpan")
  }

  // ── TER ──
  const setTer = (i: number, k: keyof TerRate, v: string) =>
    setTerRows((rs) => rs.map((r, idx) => idx === i ? { ...r, [k]: k === "bruto_max" && v === "" ? null : Number(v) } : r))
  const addTer = () => setTerRows((rs) => [...rs, { kategori: terKat, bruto_min: 0, bruto_max: null, tarif_persen: 0 }])
  const delTer = (i: number) => setTerRows((rs) => rs.filter((_, idx) => idx !== i))
  const submitTer = async () => {
    setSaving(true)
    const res = await saveTerRates(terKat, terRows.map((r) => ({ bruto_min: r.bruto_min, bruto_max: r.bruto_max, tarif_persen: r.tarif_persen })))
    setSaving(false)
    if (!res.success) { alert(res.error); return }
    await loadTer(); flash(`Tarif TER kategori ${terKat} tersimpan`)
  }

  const bpjsCols: Column<Bpjs>[] = [
    { key: "kode", header: "Kode", cell: (r) => <span className="font-mono font-semibold">{r.kode}</span> },
    { key: "nama", header: "Nama", cell: (r) => r.nama },
    { key: "rate_karyawan", header: "Karyawan", cell: (r) => `${r.rate_karyawan}%` },
    { key: "rate_perusahaan", header: "Perusahaan", cell: (r) => `${r.rate_perusahaan}%` },
    { key: "batas_atas_upah", header: "Ceiling", cell: (r) => r.batas_atas_upah != null ? formatCurrency(r.batas_atas_upah) : "—" },
    { key: "is_active", header: "Status", cell: (r) => <Badge variant={r.is_active ? "success" : "secondary"}>{r.is_active ? "Aktif" : "Nonaktif"}</Badge> },
  ]
  const ptkpCols: Column<Ptkp>[] = [
    { key: "kode", header: "Kode", cell: (r) => <span className="font-mono font-semibold">{r.kode}</span> },
    { key: "nama", header: "Keterangan", cell: (r) => r.nama },
    { key: "nominal_setahun", header: "Nominal/Tahun", cell: (r) => formatCurrency(r.nominal_setahun) },
    { key: "kategori_ter", header: "Kategori TER", cell: (r) => <Badge variant="info">{r.kategori_ter}</Badge> },
  ]

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--text-900)" }}>Pengaturan Pajak &amp; BPJS</h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-subtle)" }}>Tarif BPJS, PTKP, dan lapisan tarif PPh21 — semua dapat dikonfigurasi (default nilai 2024)</p>
        </div>
        <Button variant="outline" size="sm" onClick={load}><RefreshCw className="h-3.5 w-3.5" /></Button>
      </div>

      {notice && <div className="rounded-lg px-4 py-2.5 text-sm" style={{ background: "var(--success-bg, #ecfdf5)", color: "var(--success)" }}>{notice}</div>}

      <div className="flex gap-1 border-b" style={{ borderColor: "var(--border)" }}>
        {TABS.map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className="px-4 py-2 text-sm font-medium -mb-px border-b-2 transition-colors"
            style={{ borderColor: tab === k ? "var(--primary)" : "transparent", color: tab === k ? "var(--primary)" : "var(--text-subtle)" }}>
            {label}
          </button>
        ))}
      </div>

      {loading ? <Card><CardContent className="p-8 text-center text-sm" style={{ color: "var(--text-subtle)" }}>Memuat…</CardContent></Card> : (
        <>
          {/* Konfigurasi */}
          {tab === "config" && config && (
            <Card><CardContent className="p-5 space-y-4 max-w-2xl">
              <div className="grid grid-cols-2 gap-4">
                <TextField label="Biaya Jabatan (%)" type="number" step="0.01" value={String(config.biaya_jabatan_persen)} onChange={(e) => setConfig({ ...config, biaya_jabatan_persen: Number(e.target.value) })} />
                <TextField label="Maks. Biaya Jabatan / Bulan (Rp)" type="number" value={String(config.biaya_jabatan_maks_bulan)} onChange={(e) => setConfig({ ...config, biaya_jabatan_maks_bulan: Number(e.target.value) })} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <SelectField label="Metode PPh21" value={config.metode_pph21} options={[{ value: "PROGRESIF", label: "Progresif Disetahunkan" }, { value: "TER", label: "TER (PP 58/2023)" }]} onChange={(e) => setConfig({ ...config, metode_pph21: e.target.value })} />
                <TextField label="Tambahan Tanpa NPWP (%)" type="number" step="0.01" value={String(config.npwp_surcharge_persen)} onChange={(e) => setConfig({ ...config, npwp_surcharge_persen: Number(e.target.value) })} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <TextField label="Pembulatan PKP (Rp, 0 = tanpa)" type="number" value={String(config.pembulatan_pph)} onChange={(e) => setConfig({ ...config, pembulatan_pph: Number(e.target.value) })} />
                <SelectField label="Pembulatan Gaji Bersih" value={String(config.pembulatan_gaji)} options={[{ value: "0", label: "Tanpa pembulatan" }, { value: "100", label: "Kelipatan Rp100" }, { value: "500", label: "Kelipatan Rp500" }, { value: "1000", label: "Kelipatan Rp1.000" }, { value: "5000", label: "Kelipatan Rp5.000" }, { value: "10000", label: "Kelipatan Rp10.000" }]} onChange={(e) => setConfig({ ...config, pembulatan_gaji: Number(e.target.value) })} />
              </div>
              <div className="flex items-center gap-6 pt-1">
                <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: "var(--text-muted)" }}>
                  <input type="checkbox" className="h-4 w-4" checked={config.bpjs_enabled} onChange={(e) => setConfig({ ...config, bpjs_enabled: e.target.checked })} /> Aktifkan BPJS
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: "var(--text-muted)" }}>
                  <input type="checkbox" className="h-4 w-4" checked={config.pph21_enabled} onChange={(e) => setConfig({ ...config, pph21_enabled: e.target.checked })} /> Aktifkan PPh21
                </label>
              </div>
              <Button onClick={saveConfig} disabled={saving}><Save className="h-3.5 w-3.5 mr-1.5" />{saving ? "Menyimpan..." : "Simpan Konfigurasi"}</Button>
            </CardContent></Card>
          )}

          {/* BPJS */}
          {tab === "bpjs" && (
            <div className="space-y-3">
              <div className="flex justify-end"><Button size="sm" onClick={() => setBpjsModal({ ...EMPTY_BPJS })}><Plus className="h-3.5 w-3.5 mr-1.5" />Tambah BPJS</Button></div>
              <DataTable data={bpjs as unknown as Record<string, unknown>[]} columns={bpjsCols as unknown as Column<Record<string, unknown>>[]} searchable={false}
                actions={(row) => { const r = row as unknown as Bpjs; return (
                  <div className="flex items-center justify-center gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" style={{ color: "var(--warning)" }} onClick={() => setBpjsModal({ ...r })}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" style={{ color: "var(--danger)" }} onClick={() => setDelBpjs(r)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                )}}
              />
            </div>
          )}

          {/* PTKP */}
          {tab === "ptkp" && (
            <div className="space-y-3">
              <div className="flex justify-end"><Button size="sm" onClick={() => setPtkpModal({ ...EMPTY_PTKP })}><Plus className="h-3.5 w-3.5 mr-1.5" />Tambah PTKP</Button></div>
              <DataTable data={ptkp as unknown as Record<string, unknown>[]} columns={ptkpCols as unknown as Column<Record<string, unknown>>[]} searchable={false}
                actions={(row) => { const r = row as unknown as Ptkp; return (
                  <div className="flex items-center justify-center gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" style={{ color: "var(--warning)" }} onClick={() => setPtkpModal({ ...r })}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" style={{ color: "var(--danger)" }} onClick={() => setDelPtkp(r)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                )}}
              />
            </div>
          )}

          {/* Bracket PPh21 */}
          {tab === "bracket" && (
            <Card><CardContent className="p-5 space-y-3">
              {bracketIssues.length > 0 && (
                <div className="rounded-lg px-3 py-2.5 text-xs space-y-1" style={{ border: "1px solid var(--border)", background: "var(--surface-hover)" }}>
                  {bracketIssues.map((issue, i) => (
                    <p key={i} style={{ color: issue.level === "error" ? "var(--danger)" : "var(--warning)" }}>
                      {issue.level === "error" ? "Error" : "Peringatan"}: {issue.message}
                    </p>
                  ))}
                </div>
              )}
              <div className="overflow-x-auto rounded-lg" style={{ border: "1px solid var(--border)" }}>
                <table className="w-full text-sm">
                  <thead><tr style={{ background: "var(--surface-hover)", color: "var(--text-subtle)" }}>
                    <th className="px-3 py-2 text-left text-xs font-semibold">Lapisan</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold">Batas Bawah (PKP)</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold">Batas Atas (kosong = ∞)</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold">Tarif (%)</th>
                    <th className="px-3 py-2 w-10"></th>
                  </tr></thead>
                  <tbody>
                    {brackets.map((b, i) => (
                      <tr key={i} style={{ borderTop: "1px solid var(--border)" }}>
                        <td className="px-3 py-1.5 font-mono">{i + 1}</td>
                        <td className="px-2 py-1.5"><input type="number" className="w-full rounded border px-2 py-1 text-sm" style={{ borderColor: "var(--border-strong)", background: "var(--surface)" }} value={String(b.batas_bawah)} onChange={(e) => setBracket(i, "batas_bawah", e.target.value)} /></td>
                        <td className="px-2 py-1.5"><input type="number" placeholder="∞" className="w-full rounded border px-2 py-1 text-sm" style={{ borderColor: "var(--border-strong)", background: "var(--surface)" }} value={b.batas_atas ?? ""} onChange={(e) => setBracket(i, "batas_atas", e.target.value)} /></td>
                        <td className="px-2 py-1.5"><input type="number" step="0.01" className="w-full rounded border px-2 py-1 text-sm" style={{ borderColor: "var(--border-strong)", background: "var(--surface)" }} value={String(b.tarif_persen)} onChange={(e) => setBracket(i, "tarif_persen", e.target.value)} /></td>
                        <td className="px-2 py-1.5 text-center"><button type="button" onClick={() => delBracket(i)} style={{ color: "var(--danger)" }}><Trash2 className="h-3.5 w-3.5" /></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={addBracket}><Plus className="h-3.5 w-3.5 mr-1" />Tambah Lapisan</Button>
                <Button size="sm" onClick={submitBrackets} disabled={saving || hasBracketError}><Save className="h-3.5 w-3.5 mr-1.5" />{saving ? "Menyimpan..." : "Simpan Tarif"}</Button>
              </div>
            </CardContent></Card>
          )}

          {/* Tarif TER */}
          {tab === "ter" && (
            <Card><CardContent className="p-5 space-y-3">
              {terIssues.length > 0 && (
                <div className="rounded-lg px-3 py-2.5 text-xs space-y-1" style={{ border: "1px solid var(--border)", background: "var(--surface-hover)" }}>
                  {terIssues.map((issue, i) => (
                    <p key={i} style={{ color: issue.level === "error" ? "var(--danger)" : "var(--warning)" }}>
                      {issue.level === "error" ? "Error" : "Peringatan"}: {issue.message}
                    </p>
                  ))}
                </div>
              )}
              <div className="flex items-end justify-between flex-wrap gap-3">
                <SelectField label="Kategori TER" className="w-40" value={terKat} onChange={(e) => selectTerKat(e.target.value)}
                  options={[{ value: "A", label: "Kategori A" }, { value: "B", label: "Kategori B" }, { value: "C", label: "Kategori C" }]} />
                <p className="text-xs" style={{ color: "var(--text-subtle)" }}>Tarif efektif bulanan (PP 58/2023). Bruto = penghasilan bruto bulanan.</p>
              </div>
              <div className="overflow-x-auto rounded-lg" style={{ border: "1px solid var(--border)", maxHeight: 420 }}>
                <table className="w-full text-sm">
                  <thead><tr style={{ background: "var(--surface-hover)", color: "var(--text-subtle)" }}>
                    <th className="px-3 py-2 text-left text-xs font-semibold">#</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold">Bruto Min</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold">Bruto Max (kosong = ∞)</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold">Tarif (%)</th>
                    <th className="px-3 py-2 w-10"></th>
                  </tr></thead>
                  <tbody>
                    {terRows.map((r, i) => (
                      <tr key={i} style={{ borderTop: "1px solid var(--border)" }}>
                        <td className="px-3 py-1.5 font-mono">{i + 1}</td>
                        <td className="px-2 py-1.5"><input type="number" className="w-full rounded border px-2 py-1 text-sm" style={{ borderColor: "var(--border-strong)", background: "var(--surface)" }} value={String(r.bruto_min)} onChange={(e) => setTer(i, "bruto_min", e.target.value)} /></td>
                        <td className="px-2 py-1.5"><input type="number" placeholder="∞" className="w-full rounded border px-2 py-1 text-sm" style={{ borderColor: "var(--border-strong)", background: "var(--surface)" }} value={r.bruto_max ?? ""} onChange={(e) => setTer(i, "bruto_max", e.target.value)} /></td>
                        <td className="px-2 py-1.5"><input type="number" step="0.001" className="w-full rounded border px-2 py-1 text-sm" style={{ borderColor: "var(--border-strong)", background: "var(--surface)" }} value={String(r.tarif_persen)} onChange={(e) => setTer(i, "tarif_persen", e.target.value)} /></td>
                        <td className="px-2 py-1.5 text-center"><button type="button" onClick={() => delTer(i)} style={{ color: "var(--danger)" }}><Trash2 className="h-3.5 w-3.5" /></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={addTer}><Plus className="h-3.5 w-3.5 mr-1" />Tambah Baris</Button>
                <Button size="sm" onClick={submitTer} disabled={saving || hasTerError}><Save className="h-3.5 w-3.5 mr-1.5" />{saving ? "Menyimpan..." : `Simpan Kategori ${terKat}`}</Button>
              </div>
            </CardContent></Card>
          )}
        </>
      )}

      {/* BPJS Modal */}
      <Modal open={!!bpjsModal} onClose={() => setBpjsModal(null)} title={bpjsModal?.id ? "Edit BPJS" : "Tambah BPJS"} size="md"
        footer={<><Button variant="outline" onClick={() => setBpjsModal(null)}>Batal</Button><Button onClick={submitBpjs} disabled={saving}>{saving ? "..." : "Simpan"}</Button></>}>
        {bpjsModal && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <TextField label="Kode" value={bpjsModal.kode} onChange={(e) => setBpjsModal({ ...bpjsModal, kode: e.target.value.toUpperCase() })} />
              <TextField label="Nama" value={bpjsModal.nama} onChange={(e) => setBpjsModal({ ...bpjsModal, nama: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <TextField label="Rate Karyawan (%)" type="number" step="0.0001" value={String(bpjsModal.rate_karyawan)} onChange={(e) => setBpjsModal({ ...bpjsModal, rate_karyawan: Number(e.target.value) })} />
              <TextField label="Rate Perusahaan (%)" type="number" step="0.0001" value={String(bpjsModal.rate_perusahaan)} onChange={(e) => setBpjsModal({ ...bpjsModal, rate_perusahaan: Number(e.target.value) })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <TextField label="Ceiling Upah (kosong = tanpa)" type="number" value={bpjsModal.batas_atas_upah ?? ""} onChange={(e) => setBpjsModal({ ...bpjsModal, batas_atas_upah: e.target.value === "" ? null : Number(e.target.value) })} />
              <TextField label="Basis (kode komponen)" value={bpjsModal.basis_component_code} onChange={(e) => setBpjsModal({ ...bpjsModal, basis_component_code: e.target.value.toUpperCase() })} />
            </div>
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: "var(--text-muted)" }}><input type="checkbox" checked={bpjsModal.menambah_bruto_pajak} onChange={(e) => setBpjsModal({ ...bpjsModal, menambah_bruto_pajak: e.target.checked })} /> Porsi perusahaan menambah bruto pajak (mis. Kes/JKK/JKM)</label>
              <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: "var(--text-muted)" }}><input type="checkbox" checked={bpjsModal.pengurang_pajak} onChange={(e) => setBpjsModal({ ...bpjsModal, pengurang_pajak: e.target.checked })} /> Porsi karyawan jadi pengurang pajak (mis. JHT/JP)</label>
              <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: "var(--text-muted)" }}><input type="checkbox" checked={bpjsModal.is_active} onChange={(e) => setBpjsModal({ ...bpjsModal, is_active: e.target.checked })} /> Aktif</label>
            </div>
          </div>
        )}
      </Modal>

      {/* PTKP Modal */}
      <Modal open={!!ptkpModal} onClose={() => setPtkpModal(null)} title={ptkpModal?.id ? "Edit PTKP" : "Tambah PTKP"} size="md"
        footer={<><Button variant="outline" onClick={() => setPtkpModal(null)}>Batal</Button><Button onClick={submitPtkp} disabled={saving}>{saving ? "..." : "Simpan"}</Button></>}>
        {ptkpModal && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <TextField label="Kode (mis. TK/0)" value={ptkpModal.kode} onChange={(e) => setPtkpModal({ ...ptkpModal, kode: e.target.value.toUpperCase() })} />
              <SelectField label="Kategori TER" value={ptkpModal.kategori_ter} options={[{ value: "A", label: "A" }, { value: "B", label: "B" }, { value: "C", label: "C" }]} onChange={(e) => setPtkpModal({ ...ptkpModal, kategori_ter: e.target.value })} />
            </div>
            <TextField label="Keterangan" value={ptkpModal.nama} onChange={(e) => setPtkpModal({ ...ptkpModal, nama: e.target.value })} />
            <TextField label="Nominal Setahun (Rp)" type="number" value={String(ptkpModal.nominal_setahun)} onChange={(e) => setPtkpModal({ ...ptkpModal, nominal_setahun: Number(e.target.value) })} />
            <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: "var(--text-muted)" }}><input type="checkbox" checked={ptkpModal.is_active} onChange={(e) => setPtkpModal({ ...ptkpModal, is_active: e.target.checked })} /> Aktif</label>
          </div>
        )}
      </Modal>

      <ConfirmDelete open={!!delBpjs} onClose={() => setDelBpjs(null)} onConfirm={removeBpjs} loading={saving} title="Hapus BPJS" description={delBpjs ? `Hapus pengaturan "${delBpjs.nama}"?` : ""} />
      <ConfirmDelete open={!!delPtkp} onClose={() => setDelPtkp(null)} onConfirm={removePtkp} loading={saving} title="Hapus PTKP" description={delPtkp ? `Hapus PTKP "${delPtkp.kode}"?` : ""} />
    </div>
  )
}

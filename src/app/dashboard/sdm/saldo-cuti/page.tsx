"use client"
import React, { useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Modal } from "@/components/ui/modal"
import { TextField, SelectField, TextareaField } from "@/components/ui/form-field"
import { SearchableSelect } from "@/components/ui/searchable-select"
import { RefreshCw, Plus, Play, Pencil } from "lucide-react"
import { useApi } from "@/hooks/useApi"

interface SaldoCuti {
  id: number; karyawan_id: number; jenis_cuti_id: number; tahun: number
  saldo_awal: number; saldo_terpakai: number; saldo_penyesuaian: number; saldo_sisa: number
  karyawans?: { id: number; nik: string; nama_karyawan: string; jabatan: string }
  jenis_cutis?: { id: number; kode_cuti: string; nama_cuti: string; potong_saldo_cuti: boolean }
}
interface Karyawan { id: number; nik: string; nama_karyawan: string; jabatan: string; status_karyawan: string | null }
interface JenisCuti { id: number; kode_cuti: string; nama_cuti: string; jatah_hari_default: number; status: string }

const TAHUN_NOW = new Date().getFullYear()

export default function SaldoCutiPage() {
  const [tahun, setTahun]         = useState(String(TAHUN_NOW))
  const [karyawanId, setKaryawanId] = useState("")

  const queryStr = karyawanId ? `tahun=${tahun}&karyawan_id=${karyawanId}` : `tahun=${tahun}`
  const { data, loading, refetch } = useApi<SaldoCuti[]>(`/api/sdm/saldo-cuti?${queryStr}`, [queryStr])
  const { data: karyawans }  = useApi<Karyawan[]>("/api/karyawan")
  const { data: jenisCutis } = useApi<JenisCuti[]>("/api/sdm/jenis-cuti")
  const list = data ?? []

  /* ── Set/Adjust Saldo Modal ──────────────────────────────────── */
  const [setOpen, setSetOpen]   = useState(false)
  const [setForm, setSetForm]   = useState({ karyawan_id: "", jenis_cuti_id: "", tahun: String(TAHUN_NOW), saldo_awal: "0", saldo_penyesuaian: "0", keterangan_penyesuaian: "" })
  const [setSaving, setSetSaving] = useState(false)
  const [setErrors, setSetErrors] = useState<Record<string, string>>({})

  /* ── Generate Saldo Modal ────────────────────────────────────── */
  const [genOpen, setGenOpen]   = useState(false)
  const [genForm, setGenForm]   = useState({ tahun: String(TAHUN_NOW), jenis_cuti_id: "", skip_existing: true })
  const [genSaving, setGenSaving] = useState(false)
  const [genResult, setGenResult] = useState<{ dibuat: number; diperbarui: number; dilewati: number; message: string } | null>(null)

  const karyawanOpts = (karyawans ?? [])
    .filter(k => k.status_karyawan !== "Pensiun" && k.status_karyawan !== "Nonaktif")
    .map(k => ({ value: String(k.id), label: `${k.nik} — ${k.nama_karyawan}`, description: k.jabatan }))

  const jenisCutiOpts = (jenisCutis ?? []).filter(j => j.status === "aktif")
    .map(j => ({ value: String(j.id), label: `${j.kode_cuti} — ${j.nama_cuti}` }))

  const handleSetSubmit = async () => {
    const e: Record<string, string> = {}
    if (!setForm.karyawan_id)   e.karyawan_id   = "Pilih karyawan"
    if (!setForm.jenis_cuti_id) e.jenis_cuti_id = "Pilih jenis cuti"
    if (!setForm.tahun)         e.tahun = "Tahun wajib diisi"
    setSetErrors(e); if (Object.keys(e).length) return
    setSetSaving(true)
    try {
      const res = await fetch("/api/sdm/saldo-cuti", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(setForm) })
      if (!res.ok) { const j = await res.json(); setSetErrors({ _: j.error ?? "Gagal" }); return }
      setSetOpen(false); refetch()
    } finally { setSetSaving(false) }
  }

  const handleGenerate = async () => {
    setGenSaving(true)
    try {
      const res = await fetch("/api/sdm/saldo-cuti/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(genForm) })
      const j = await res.json()
      if (!res.ok) { alert(j.error ?? "Gagal"); return }
      setGenResult(j); refetch()
    } finally { setGenSaving(false) }
  }

  const tahunOpts = Array.from({ length: 5 }, (_, i) => TAHUN_NOW - 2 + i)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--text-900)" }}>Saldo Cuti Pegawai</h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-subtle)" }}>Kelola saldo dan jatah cuti pegawai</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={refetch}><RefreshCw className="h-3.5 w-3.5" /></Button>
          <Button variant="secondary" size="sm" onClick={() => { setGenResult(null); setGenOpen(true) }}><Play className="h-3.5 w-3.5 mr-1.5" />Generate Saldo</Button>
          <Button size="sm" onClick={() => { setSetErrors({}); setSetOpen(true) }}><Plus className="h-3.5 w-3.5 mr-1.5" />Set / Sesuaikan Saldo</Button>
        </div>
      </div>

      {/* Filter */}
      <div className="rounded-xl p-4 grid grid-cols-1 sm:grid-cols-3 gap-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <div className="space-y-1.5">
          <label className="block text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Tahun</label>
          <select value={tahun} onChange={e => setTahun(e.target.value)} className="h-8 w-full rounded-lg px-3 text-sm cursor-pointer"
            style={{ border: "1px solid var(--border-strong)", background: "var(--surface)", color: "var(--text-900)" }}>
            {tahunOpts.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="block text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Karyawan (opsional)</label>
          <SearchableSelect label="" options={karyawanOpts} value={karyawanId} onChange={(v: string) => setKaryawanId(v)} placeholder="— Semua Karyawan —" />
        </div>
        <div className="flex items-end">
          <Button variant="outline" size="sm" className="h-8" onClick={() => setKaryawanId("")}>Reset</Button>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="h-32 rounded-xl animate-pulse" style={{ background: "var(--surface-muted)" }} />
      ) : list.length === 0 ? (
        <div className="rounded-xl py-16 text-center" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          <p className="text-sm" style={{ color: "var(--text-subtle)" }}>Tidak ada data saldo cuti untuk tahun {tahun}</p>
        </div>
      ) : (
        <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)", background: "var(--surface)" }}>
          <table className="w-full text-sm">
            <thead style={{ background: "var(--surface-muted)", borderBottom: "1px solid var(--border)" }}>
              <tr>
                {["#","Karyawan","Jenis Cuti","Saldo Awal","Terpakai","Penyesuaian","Sisa"].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-subtle)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.map((s, i) => (
                <tr key={s.id} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td className="px-4 py-3 text-xs text-center" style={{ color: "var(--text-subtle)" }}>{i+1}</td>
                  <td className="px-4 py-3">
                    <p className="font-semibold">{s.karyawans?.nama_karyawan ?? "—"}</p>
                    <p className="text-xs font-mono" style={{ color: "var(--text-subtle)" }}>{s.karyawans?.nik}</p>
                  </td>
                  <td className="px-4 py-3"><Badge variant="secondary" className="font-mono text-xs">{s.jenis_cutis?.kode_cuti}</Badge> {s.jenis_cutis?.nama_cuti}</td>
                  <td className="px-4 py-3 font-mono text-center">{s.saldo_awal}</td>
                  <td className="px-4 py-3 font-mono text-center" style={{ color: s.saldo_terpakai > 0 ? "var(--danger)" : "var(--text-subtle)" }}>{s.saldo_terpakai}</td>
                  <td className="px-4 py-3 font-mono text-center" style={{ color: s.saldo_penyesuaian !== 0 ? "var(--warning)" : "var(--text-subtle)" }}>{s.saldo_penyesuaian >= 0 ? "+" : ""}{s.saldo_penyesuaian}</td>
                  <td className="px-4 py-3 font-mono text-center font-bold" style={{ color: s.saldo_sisa <= 0 ? "var(--danger)" : "var(--success)" }}>{s.saldo_sisa}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal: Set/Sesuaikan Saldo */}
      <Modal open={setOpen} onClose={() => setSetOpen(false)} title="Set / Sesuaikan Saldo Cuti" size="md"
        footer={<><Button variant="outline" onClick={() => setSetOpen(false)}>Batal</Button><Button onClick={handleSetSubmit} disabled={setSaving}>{setSaving ? "Menyimpan..." : "Simpan"}</Button></>}
      >
        {setErrors._ && <div className="mb-4 rounded-lg px-4 py-3 text-sm" style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>{setErrors._}</div>}
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Karyawan *</label>
            <SearchableSelect label="" options={karyawanOpts} value={setForm.karyawan_id} onChange={(v: string) => setSetForm(f => ({ ...f, karyawan_id: v }))} placeholder="Pilih karyawan..." />
            {setErrors.karyawan_id && <p className="text-xs" style={{ color: "var(--danger)" }}>{setErrors.karyawan_id}</p>}
          </div>
          <SelectField label="Jenis Cuti *" error={setErrors.jenis_cuti_id} value={setForm.jenis_cuti_id}
            placeholder="— Pilih Jenis Cuti —" options={jenisCutiOpts}
            onChange={e => setSetForm(f => ({ ...f, jenis_cuti_id: e.target.value }))} />
          <div className="grid grid-cols-3 gap-3">
            <SelectField label="Tahun *" value={setForm.tahun}
              options={tahunOpts.map(y => ({ value: String(y), label: String(y) }))}
              onChange={e => setSetForm(f => ({ ...f, tahun: e.target.value }))} />
            <TextField label="Saldo Awal" type="number" min={0} value={setForm.saldo_awal}
              onChange={e => setSetForm(f => ({ ...f, saldo_awal: e.target.value }))} />
            <TextField label="Penyesuaian (+/-)" type="number" value={setForm.saldo_penyesuaian}
              onChange={e => setSetForm(f => ({ ...f, saldo_penyesuaian: e.target.value }))} />
          </div>
          <TextareaField label="Keterangan Penyesuaian" value={setForm.keterangan_penyesuaian}
            onChange={e => setSetForm(f => ({ ...f, keterangan_penyesuaian: e.target.value }))} />
        </div>
      </Modal>

      {/* Modal: Generate Saldo */}
      <Modal open={genOpen} onClose={() => setGenOpen(false)} title="Generate Saldo Cuti Tahunan" size="sm"
        footer={genResult ? <Button onClick={() => setGenOpen(false)}>Tutup</Button> :
          <><Button variant="outline" onClick={() => setGenOpen(false)}>Batal</Button><Button onClick={handleGenerate} disabled={genSaving}>{genSaving ? "Memproses..." : "Generate"}</Button></>}
      >
        {genResult ? (
          <div className="text-center py-4 space-y-2">
            <div className="text-4xl font-bold" style={{ color: "var(--success)" }}>{genResult.dibuat}</div>
            <p className="text-sm font-semibold" style={{ color: "var(--text-900)" }}>Saldo baru dibuat</p>
            <p className="text-sm" style={{ color: "var(--text-subtle)" }}>{genResult.message}</p>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm" style={{ color: "var(--text-subtle)" }}>Generate saldo cuti berdasarkan jatah hari default jenis cuti untuk semua karyawan aktif.</p>
            <SelectField label="Jenis Cuti *" value={genForm.jenis_cuti_id} placeholder="— Pilih Jenis Cuti —"
              options={jenisCutiOpts} onChange={e => setGenForm(f => ({ ...f, jenis_cuti_id: e.target.value }))} />
            <SelectField label="Tahun *" value={genForm.tahun}
              options={tahunOpts.map(y => ({ value: String(y), label: String(y) }))}
              onChange={e => setGenForm(f => ({ ...f, tahun: e.target.value }))} />
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={genForm.skip_existing}
                onChange={e => setGenForm(f => ({ ...f, skip_existing: e.target.checked }))}
                className="h-4 w-4" style={{ accentColor: "var(--primary)" }} />
              <span className="text-sm" style={{ color: "var(--text-900)" }}>Lewati jika sudah ada (aman)</span>
            </label>
          </div>
        )}
      </Modal>
    </div>
  )
}

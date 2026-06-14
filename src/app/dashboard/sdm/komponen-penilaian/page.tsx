"use client"
import React, { useState } from "react"
import { DataTable, Column } from "@/components/ui/data-table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Modal } from "@/components/ui/modal"
import { TextField, SelectField, TextareaField } from "@/components/ui/form-field"
import { Pencil, RefreshCw, AlertTriangle, CheckCircle2 } from "lucide-react"
import { useApi } from "@/hooks/useApi"

interface Komponen {
  id: number
  kode_komponen: string
  nama_komponen: string
  deskripsi: string | null
  default_bobot_percent: number
  urutan: number
  aktif: number
}

const EMPTY: Partial<Komponen> = { kode_komponen: "", nama_komponen: "", deskripsi: "", default_bobot_percent: 0, urutan: 0, aktif: 1 }

export default function KomponenPenilaianPage() {
  const { data, loading, refetch } = useApi<Komponen[]>("/api/sdm/komponen-penilaian")
  const list = data ?? []

  const [modalOpen, setModalOpen]   = useState(false)
  const [selected, setSelected]     = useState<Komponen | null>(null)
  const [form, setForm]             = useState<Partial<Komponen>>(EMPTY)
  const [saving, setSaving]         = useState(false)
  const [errors, setErrors]         = useState<Record<string, string>>({})

  const set = <K extends keyof Komponen>(k: K, v: Komponen[K]) => setForm(f => ({ ...f, [k]: v }))

  const totalBobotAktif = list.filter(k => k.aktif).reduce((s, k) => s + Number(k.default_bobot_percent), 0)
  const bobotValid = Math.abs(totalBobotAktif - 100) < 0.01

  const openEdit = (row: Komponen) => { setSelected(row); setForm({ ...row }); setErrors({}); setModalOpen(true) }

  const handleSubmit = async () => {
    if (!selected) return
    const e: Record<string, string> = {}
    if (!form.nama_komponen?.trim()) e.nama_komponen = "Nama wajib diisi"
    const b = Number(form.default_bobot_percent ?? 0)
    if (b < 0 || b > 100) e.default_bobot_percent = "Bobot 0-100"
    setErrors(e); if (Object.keys(e).length) return
    setSaving(true)
    try {
      const res = await fetch(`/api/sdm/komponen-penilaian/${selected.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) })
      if (!res.ok) { const j = await res.json(); setErrors({ _: j.error ?? "Gagal" }); return }
      setModalOpen(false); refetch()
    } finally { setSaving(false) }
  }

  const columns: Column<Komponen>[] = [
    { key: "urutan", header: "No", cell: (r) => <span className="font-mono">{r.urutan}</span> },
    { key: "kode_komponen", header: "Kode", cell: (r) => <Badge variant="secondary" className="font-mono">{r.kode_komponen}</Badge> },
    { key: "nama_komponen", header: "Nama Komponen", cell: (r) => <span className="font-semibold">{r.nama_komponen}</span> },
    { key: "default_bobot_percent", header: "Bobot", cell: (r) => <span className="font-mono font-bold" style={{ color: "var(--primary)" }}>{Number(r.default_bobot_percent)}%</span> },
    { key: "deskripsi", header: "Deskripsi", cell: (r) => <span className="text-xs" style={{ color: "var(--text-subtle)" }}>{r.deskripsi ?? "—"}</span> },
    { key: "aktif", header: "Status", cell: (r) => r.aktif ? <Badge variant="success">Aktif</Badge> : <Badge variant="secondary">Nonaktif</Badge> },
  ]

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--text-900)" }}>Komponen Penilaian Kinerja</h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-subtle)" }}>Kelola komponen dan bobot default penilaian kinerja</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={refetch}><RefreshCw className="h-3.5 w-3.5" /></Button>
        </div>
      </div>

      {/* Indikator total bobot */}
      <div className="rounded-xl p-4 flex items-center gap-3" style={{ background: bobotValid ? "var(--success-bg, #f0fdf4)" : "var(--danger-bg, #fef2f2)", border: `1px solid ${bobotValid ? "#16a34a" : "#dc2626"}` }}>
        {bobotValid
          ? <CheckCircle2 className="h-5 w-5 shrink-0" style={{ color: "#16a34a" }} />
          : <AlertTriangle className="h-5 w-5 shrink-0" style={{ color: "#dc2626" }} />}
        <div>
          <p className="text-sm font-semibold" style={{ color: bobotValid ? "#15803d" : "#dc2626" }}>
            Total Bobot Komponen Aktif: {totalBobotAktif}%
          </p>
          <p className="text-xs" style={{ color: bobotValid ? "#15803d" : "#991b1b" }}>
            {bobotValid ? "Bobot sudah seimbang (100%)." : "Total bobot komponen aktif harus tepat 100% agar perhitungan nilai akhir akurat."}
          </p>
        </div>
      </div>

      <DataTable data={list as unknown as Record<string, unknown>[]} columns={columns as unknown as Column<Record<string, unknown>>[]}
        searchKeys={["kode_komponen", "nama_komponen"]} loading={loading}
        actions={(row: Record<string, unknown>) => {
          const r = row as unknown as Komponen
          return (
            <div className="flex items-center justify-center gap-1">
              <Button variant="ghost" size="icon" className="h-7 w-7" style={{ color: "var(--warning)" }} onClick={() => openEdit(r)}><Pencil className="h-3.5 w-3.5" /></Button>
            </div>
          )
        }}
      />

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Edit Komponen" size="md"
        footer={<><Button variant="outline" onClick={() => setModalOpen(false)}>Batal</Button><Button onClick={handleSubmit} disabled={saving}>{saving ? "Menyimpan..." : "Simpan"}</Button></>}
      >
        {errors._ && <div className="mb-4 rounded-lg px-4 py-3 text-sm" style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>{errors._}</div>}
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <TextField label="Kode Komponen" value={form.kode_komponen ?? ""} disabled
              onChange={() => {}} />
            <TextField label="Urutan" type="number" min={0} value={String(form.urutan ?? 0)}
              onChange={e => set("urutan", Number(e.target.value) as unknown as never)} />
          </div>
          <TextField label="Nama Komponen" required error={errors.nama_komponen} value={form.nama_komponen ?? ""}
            onChange={e => set("nama_komponen", e.target.value)} />
          <TextField label="Bobot (%)" type="number" min={0} max={100} required error={errors.default_bobot_percent}
            value={String(form.default_bobot_percent ?? 0)}
            onChange={e => set("default_bobot_percent", Number(e.target.value) as unknown as never)} />
          <TextareaField label="Deskripsi" value={form.deskripsi ?? ""} onChange={e => set("deskripsi", e.target.value)} />
          <SelectField label="Status" value={String(form.aktif ?? 1)}
            onChange={e => set("aktif", Number(e.target.value) as unknown as never)}
            options={[{ value: "1", label: "Aktif" }, { value: "0", label: "Nonaktif" }]} />
        </div>
      </Modal>
    </div>
  )
}

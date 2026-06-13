"use client"
import React, { useState } from "react"
import { DataTable, Column } from "@/components/ui/data-table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Modal } from "@/components/ui/modal"
import { ConfirmDelete } from "@/components/ui/confirm-delete"
import { TextField, SelectField, TextareaField } from "@/components/ui/form-field"
import { Plus, Pencil, Trash2, RefreshCw } from "lucide-react"
import { formatCurrency } from "@/lib/utils"
import { useApi } from "@/hooks/useApi"

interface Setting {
  id: number; nama_setting: string; tipe_hari: string; metode_perhitungan: string
  tarif_flat: number; tarif_per_jam: number
  multiplier_jam_pertama: number; multiplier_jam_berikutnya: number
  batas_minimal_menit_lembur: number; pembulatan_menit: number
  status: string; keterangan: string | null
}

const TIPE_HARI = [{ value: "hari_kerja", label: "Hari Kerja" }, { value: "hari_libur", label: "Hari Libur" }, { value: "hari_raya", label: "Hari Raya" }]
const METODE   = [{ value: "flat", label: "Tarif Flat" }, { value: "per_jam", label: "Per Jam + Multiplier" }, { value: "formula", label: "Formula Gaji" }]
const EMPTY: Partial<Setting> = { nama_setting: "", tipe_hari: "hari_kerja", metode_perhitungan: "per_jam", tarif_flat: 0, tarif_per_jam: 20000, multiplier_jam_pertama: 1.5, multiplier_jam_berikutnya: 2.0, batas_minimal_menit_lembur: 30, pembulatan_menit: 30, status: "aktif", keterangan: "" }

export default function OvertimeSettingsPage() {
  const { data, loading, refetch } = useApi<Setting[]>("/api/sdm/overtime-settings")
  const list = data ?? []

  const [modalOpen, setModalOpen]   = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [editMode, setEditMode]     = useState(false)
  const [selected, setSelected]     = useState<Setting | null>(null)
  const [form, setForm]             = useState<Partial<Setting>>(EMPTY)
  const [saving, setSaving]         = useState(false)
  const [deleting, setDeleting]     = useState(false)
  const [errors, setErrors]         = useState<Record<string, string>>({})

  const set = <K extends keyof Setting>(k: K, v: Setting[K]) => setForm(f => ({ ...f, [k]: v }))
  const openAdd  = () => { setEditMode(false); setSelected(null); setForm(EMPTY); setErrors({}); setModalOpen(true) }
  const openEdit = (row: Setting) => { setEditMode(true); setSelected(row); setForm({ ...row }); setErrors({}); setModalOpen(true) }

  const handleSubmit = async () => {
    if (!form.nama_setting?.trim()) { setErrors({ nama_setting: "Nama wajib diisi" }); return }
    setSaving(true)
    try {
      const url = editMode && selected ? `/api/sdm/overtime-settings/${selected.id}` : "/api/sdm/overtime-settings"
      const method = editMode ? "PUT" : "POST"
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) })
      if (!res.ok) { const j = await res.json(); setErrors({ _: j.error ?? "Gagal" }); return }
      setModalOpen(false); refetch()
    } finally { setSaving(false) }
  }

  const handleDelete = async () => {
    if (!selected) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/sdm/overtime-settings/${selected.id}`, { method: "DELETE" })
      if (!res.ok) { const j = await res.json(); alert(j.error ?? "Gagal"); }
      setDeleteOpen(false); refetch()
    } finally { setDeleting(false) }
  }

  const columns: Column<Setting>[] = [
    { key: "nama_setting", header: "Nama Setting", cell: (r) => <span className="font-semibold">{r.nama_setting}</span> },
    { key: "tipe_hari", header: "Tipe Hari", cell: (r) => <Badge variant="secondary">{TIPE_HARI.find(t => t.value === r.tipe_hari)?.label ?? r.tipe_hari}</Badge> },
    { key: "metode_perhitungan", header: "Metode", cell: (r) => METODE.find(m => m.value === r.metode_perhitungan)?.label ?? r.metode_perhitungan },
    { key: "tarif_per_jam", header: "Tarif/Jam", cell: (r) => <span className="font-mono">{formatCurrency(Number(r.tarif_per_jam))}</span> },
    { key: "multiplier_jam_pertama", header: "Multiplier", cell: (r) => <span className="font-mono">×{r.multiplier_jam_pertama} / ×{r.multiplier_jam_berikutnya}</span> },
    { key: "status", header: "Status", cell: (r) => <Badge variant={r.status === "aktif" ? "success" : "secondary"}>{r.status === "aktif" ? "Aktif" : "Nonaktif"}</Badge> },
  ]

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--text-900)" }}>Setting Lembur</h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-subtle)" }}>Konfigurasi tarif & aturan perhitungan lembur per tipe hari</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={refetch}><RefreshCw className="h-3.5 w-3.5" /></Button>
          <Button size="sm" onClick={openAdd}><Plus className="h-3.5 w-3.5 mr-1.5" />Tambah Setting</Button>
        </div>
      </div>

      <DataTable data={list as unknown as Record<string, unknown>[]} columns={columns as unknown as Column<Record<string, unknown>>[]}
        searchKeys={["nama_setting"]} loading={loading}
        actions={(row: Record<string, unknown>) => {
          const r = row as unknown as Setting
          return (
            <div className="flex items-center justify-center gap-1">
              <Button variant="ghost" size="icon" className="h-7 w-7" style={{ color: "var(--warning)" }} onClick={() => openEdit(r)}><Pencil className="h-3.5 w-3.5" /></Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" style={{ color: "var(--danger)" }} onClick={() => { setSelected(r); setDeleteOpen(true) }}><Trash2 className="h-3.5 w-3.5" /></Button>
            </div>
          )
        }}
      />

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editMode ? "Edit Setting Lembur" : "Tambah Setting Lembur"} size="lg"
        footer={<><Button variant="outline" onClick={() => setModalOpen(false)}>Batal</Button><Button onClick={handleSubmit} disabled={saving}>{saving ? "Menyimpan..." : "Simpan"}</Button></>}
      >
        {errors._ && <div className="mb-4 rounded-lg px-4 py-3 text-sm" style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>{errors._}</div>}
        <div className="space-y-4">
          <TextField label="Nama Setting *" required error={errors.nama_setting} value={form.nama_setting ?? ""} onChange={e => set("nama_setting", e.target.value)} />
          <div className="grid grid-cols-2 gap-4">
            <SelectField label="Tipe Hari" value={form.tipe_hari ?? "hari_kerja"} options={TIPE_HARI} onChange={e => set("tipe_hari", e.target.value)} />
            <SelectField label="Metode Perhitungan" value={form.metode_perhitungan ?? "per_jam"} options={METODE} onChange={e => set("metode_perhitungan", e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <TextField label="Tarif Flat (Rp)" type="number" min={0} value={String(form.tarif_flat ?? 0)} onChange={e => set("tarif_flat", Number(e.target.value) as unknown as never)} />
            <TextField label="Tarif per Jam (Rp)" type="number" min={0} value={String(form.tarif_per_jam ?? 0)} onChange={e => set("tarif_per_jam", Number(e.target.value) as unknown as never)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <TextField label="Multiplier Jam Pertama" type="number" step={0.5} min={1} value={String(form.multiplier_jam_pertama ?? 1.5)} onChange={e => set("multiplier_jam_pertama", Number(e.target.value) as unknown as never)} />
            <TextField label="Multiplier Jam Berikutnya" type="number" step={0.5} min={1} value={String(form.multiplier_jam_berikutnya ?? 2.0)} onChange={e => set("multiplier_jam_berikutnya", Number(e.target.value) as unknown as never)} />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <TextField label="Minimal Menit" type="number" min={0} value={String(form.batas_minimal_menit_lembur ?? 30)} onChange={e => set("batas_minimal_menit_lembur", Number(e.target.value) as unknown as never)} />
            <SelectField label="Pembulatan (menit)" value={String(form.pembulatan_menit ?? 30)}
              options={[{ value: "15", label: "15 menit" }, { value: "30", label: "30 menit" }, { value: "60", label: "60 menit" }]}
              onChange={e => set("pembulatan_menit", Number(e.target.value) as unknown as never)} />
            <SelectField label="Status" value={form.status ?? "aktif"}
              options={[{ value: "aktif", label: "Aktif" }, { value: "nonaktif", label: "Nonaktif" }]}
              onChange={e => set("status", e.target.value)} />
          </div>
          <TextareaField label="Keterangan" value={form.keterangan ?? ""} onChange={e => set("keterangan", e.target.value)} />
        </div>
      </Modal>

      <ConfirmDelete open={deleteOpen} onClose={() => setDeleteOpen(false)} onConfirm={handleDelete} loading={deleting}
        description={`Hapus setting "${selected?.nama_setting}"? Setting yang masih digunakan tidak dapat dihapus.`} />
    </div>
  )
}

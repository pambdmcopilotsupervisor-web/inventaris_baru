"use client"
import React, { useState } from "react"
import { DataTable, Column } from "@/components/ui/data-table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Modal } from "@/components/ui/modal"
import { ConfirmDelete } from "@/components/ui/confirm-delete"
import { TextField, SelectField, TextareaField } from "@/components/ui/form-field"
import { Plus, Pencil, Trash2, RefreshCw } from "lucide-react"
import { useApi } from "@/hooks/useApi"

interface JenisIzin {
  id: number; kode_izin: string; nama_izin: string; satuan: string
  maksimal_durasi: number; membutuhkan_lampiran: boolean; memotong_absensi: boolean
  status: string; keterangan: string | null
}

const EMPTY: Partial<JenisIzin> = { kode_izin: "", nama_izin: "", satuan: "hari", maksimal_durasi: 1, membutuhkan_lampiran: false, memotong_absensi: true, status: "aktif", keterangan: "" }

export default function JenisIzinPage() {
  const { data, loading, refetch } = useApi<JenisIzin[]>("/api/sdm/jenis-izin")
  const list = data ?? []

  const [modalOpen, setModalOpen]   = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [editMode, setEditMode]     = useState(false)
  const [selected, setSelected]     = useState<JenisIzin | null>(null)
  const [form, setForm]             = useState<Partial<JenisIzin>>(EMPTY)
  const [saving, setSaving]         = useState(false)
  const [deleting, setDeleting]     = useState(false)
  const [errors, setErrors]         = useState<Record<string, string>>({})

  const set = <K extends keyof JenisIzin>(k: K, v: JenisIzin[K]) => setForm(f => ({ ...f, [k]: v }))
  const openAdd  = () => { setEditMode(false); setSelected(null); setForm(EMPTY); setErrors({}); setModalOpen(true) }
  const openEdit = (row: JenisIzin) => { setEditMode(true); setSelected(row); setForm({ ...row }); setErrors({}); setModalOpen(true) }

  const handleSubmit = async () => {
    const e: Record<string, string> = {}
    if (!form.kode_izin?.trim()) e.kode_izin = "Kode wajib diisi"
    if (!form.nama_izin?.trim()) e.nama_izin = "Nama wajib diisi"
    setErrors(e); if (Object.keys(e).length) return
    setSaving(true)
    try {
      const url    = editMode && selected ? `/api/sdm/jenis-izin/${selected.id}` : "/api/sdm/jenis-izin"
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
      const res = await fetch(`/api/sdm/jenis-izin/${selected.id}`, { method: "DELETE" })
      if (!res.ok) { const j = await res.json(); alert(j.error ?? "Gagal"); }
      setDeleteOpen(false); refetch()
    } finally { setDeleting(false) }
  }

  const columns: Column<JenisIzin>[] = [
    { key: "kode_izin",    header: "Kode",    cell: (r) => <Badge variant="secondary" className="font-mono">{r.kode_izin}</Badge> },
    { key: "nama_izin",    header: "Nama",    cell: (r) => <span className="font-semibold">{r.nama_izin}</span> },
    { key: "satuan",       header: "Satuan",  cell: (r) => <Badge variant="info" className="text-[10px]">{r.satuan === "jam" ? "Per Jam" : "Per Hari"}</Badge> },
    { key: "maksimal_durasi", header: "Maks. Durasi", cell: (r) => <span className="font-mono">{r.maksimal_durasi} {r.satuan}</span> },
    { key: "memotong_absensi", header: "Potong Absensi", cell: (r) => r.memotong_absensi ? <Badge variant="warning">Ya</Badge> : <Badge variant="secondary">Tidak</Badge> },
    { key: "membutuhkan_lampiran", header: "Lampiran", cell: (r) => r.membutuhkan_lampiran ? <Badge variant="info">Wajib</Badge> : <span style={{ color: "var(--text-subtle)" }}>Opsional</span> },
    { key: "status", header: "Status", cell: (r) => <Badge variant={r.status === "aktif" ? "success" : "secondary"}>{r.status === "aktif" ? "Aktif" : "Nonaktif"}</Badge> },
  ]

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--text-900)" }}>Master Jenis Izin</h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-subtle)" }}>Kelola jenis-jenis izin pegawai</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={refetch}><RefreshCw className="h-3.5 w-3.5" /></Button>
          <Button size="sm" onClick={openAdd}><Plus className="h-3.5 w-3.5 mr-1.5" />Tambah Jenis Izin</Button>
        </div>
      </div>

      <DataTable data={list as unknown as Record<string, unknown>[]} columns={columns as unknown as Column<Record<string, unknown>>[]}
        searchKeys={["kode_izin", "nama_izin"]} loading={loading}
        actions={(row: Record<string, unknown>) => {
          const r = row as unknown as JenisIzin
          return (
            <div className="flex items-center justify-center gap-1">
              <Button variant="ghost" size="icon" className="h-7 w-7" style={{ color: "var(--warning)" }} onClick={() => openEdit(r)}><Pencil className="h-3.5 w-3.5" /></Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" style={{ color: "var(--danger)" }} onClick={() => { setSelected(r); setDeleteOpen(true) }}><Trash2 className="h-3.5 w-3.5" /></Button>
            </div>
          )
        }}
      />

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editMode ? "Edit Jenis Izin" : "Tambah Jenis Izin"} size="md"
        footer={<><Button variant="outline" onClick={() => setModalOpen(false)}>Batal</Button><Button onClick={handleSubmit} disabled={saving}>{saving ? "Menyimpan..." : "Simpan"}</Button></>}
      >
        {errors._ && <div className="mb-4 rounded-lg px-4 py-3 text-sm" style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>{errors._}</div>}
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <TextField label="Kode Izin" required error={errors.kode_izin} value={form.kode_izin ?? ""}
              placeholder="IP / IK / IT" onChange={e => set("kode_izin", e.target.value.toUpperCase())} />
            <TextField label="Nama Izin" required error={errors.nama_izin} value={form.nama_izin ?? ""}
              onChange={e => set("nama_izin", e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <SelectField label="Satuan" value={form.satuan ?? "hari"}
              onChange={e => set("satuan", e.target.value)}
              options={[{ value: "hari", label: "Per Hari" }, { value: "jam", label: "Per Jam" }]} />
            <TextField label={`Maksimal Durasi (${form.satuan === "jam" ? "jam" : "hari"})`} type="number" min={1} value={String(form.maksimal_durasi ?? 1)}
              onChange={e => set("maksimal_durasi", Number(e.target.value) as unknown as never)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Potong Absensi</label>
              <label className="flex items-center gap-2 cursor-pointer h-8">
                <input type="checkbox" checked={!!form.memotong_absensi}
                  onChange={e => set("memotong_absensi", e.target.checked as unknown as never)}
                  className="h-4 w-4" style={{ accentColor: "var(--primary)" }} />
                <span className="text-sm" style={{ color: "var(--text-900)" }}>{form.memotong_absensi ? "Ya" : "Tidak"}</span>
              </label>
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Wajib Lampiran</label>
              <label className="flex items-center gap-2 cursor-pointer h-8">
                <input type="checkbox" checked={!!form.membutuhkan_lampiran}
                  onChange={e => set("membutuhkan_lampiran", e.target.checked as unknown as never)}
                  className="h-4 w-4" style={{ accentColor: "var(--primary)" }} />
                <span className="text-sm" style={{ color: "var(--text-900)" }}>{form.membutuhkan_lampiran ? "Ya" : "Tidak"}</span>
              </label>
            </div>
          </div>
          <SelectField label="Status" value={form.status ?? "aktif"}
            onChange={e => set("status", e.target.value)}
            options={[{ value: "aktif", label: "Aktif" }, { value: "nonaktif", label: "Nonaktif" }]} />
          <TextareaField label="Keterangan" value={form.keterangan ?? ""} onChange={e => set("keterangan", e.target.value)} />
        </div>
      </Modal>

      <ConfirmDelete open={deleteOpen} onClose={() => setDeleteOpen(false)} onConfirm={handleDelete} loading={deleting}
        description={`Hapus jenis izin "${selected?.nama_izin}"? Jika masih digunakan, tidak dapat dihapus.`} />
    </div>
  )
}

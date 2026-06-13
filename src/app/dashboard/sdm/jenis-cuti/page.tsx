"use client"
import React, { useState } from "react"
import { DataTable, Column } from "@/components/ui/data-table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Modal } from "@/components/ui/modal"
import { ConfirmDelete } from "@/components/ui/confirm-delete"
import { TextField, SelectField, TextareaField } from "@/components/ui/form-field"
import { Plus, Pencil, Trash2, RefreshCw, Check, X } from "lucide-react"
import { useApi } from "@/hooks/useApi"

interface JenisCuti {
  id: number; kode_cuti: string; nama_cuti: string; jatah_hari_default: number
  membutuhkan_lampiran: boolean; potong_saldo_cuti: boolean; status: string; keterangan: string | null
}

const EMPTY: Partial<JenisCuti> = { kode_cuti: "", nama_cuti: "", jatah_hari_default: 12, membutuhkan_lampiran: false, potong_saldo_cuti: true, status: "aktif", keterangan: "" }

export default function JenisCutiPage() {
  const { data, loading, refetch } = useApi<JenisCuti[]>("/api/sdm/jenis-cuti")
  const list = data ?? []

  const [modalOpen, setModalOpen]   = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [editMode, setEditMode]     = useState(false)
  const [selected, setSelected]     = useState<JenisCuti | null>(null)
  const [form, setForm]             = useState<Partial<JenisCuti>>(EMPTY)
  const [saving, setSaving]         = useState(false)
  const [deleting, setDeleting]     = useState(false)
  const [errors, setErrors]         = useState<Record<string, string>>({})

  const set = <K extends keyof JenisCuti>(k: K, v: JenisCuti[K]) => setForm(f => ({ ...f, [k]: v }))

  const openAdd  = () => { setEditMode(false); setSelected(null); setForm(EMPTY); setErrors({}); setModalOpen(true) }
  const openEdit = (row: JenisCuti) => { setEditMode(true); setSelected(row); setForm({ ...row }); setErrors({}); setModalOpen(true) }

  const handleSubmit = async () => {
    const e: Record<string, string> = {}
    if (!form.kode_cuti?.trim()) e.kode_cuti = "Kode wajib diisi"
    if (!form.nama_cuti?.trim()) e.nama_cuti = "Nama wajib diisi"
    setErrors(e); if (Object.keys(e).length) return
    setSaving(true)
    try {
      const url    = editMode && selected ? `/api/sdm/jenis-cuti/${selected.id}` : "/api/sdm/jenis-cuti"
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
      const res = await fetch(`/api/sdm/jenis-cuti/${selected.id}`, { method: "DELETE" })
      if (!res.ok) { const j = await res.json(); alert(j.error ?? "Gagal menghapus"); }
      setDeleteOpen(false); refetch()
    } finally { setDeleting(false) }
  }

  const columns: Column<JenisCuti>[] = [
    { key: "kode_cuti",   header: "Kode",  cell: (r) => <Badge variant="secondary" className="font-mono">{r.kode_cuti}</Badge> },
    { key: "nama_cuti",   header: "Nama",  cell: (r) => <span className="font-semibold">{r.nama_cuti}</span> },
    { key: "jatah_hari_default", header: "Jatah Hari", cell: (r) => <span className="font-mono">{r.jatah_hari_default} hari</span> },
    { key: "potong_saldo_cuti", header: "Potong Saldo", cell: (r) => r.potong_saldo_cuti ? <Badge variant="warning">Ya</Badge> : <Badge variant="secondary">Tidak</Badge> },
    { key: "membutuhkan_lampiran", header: "Butuh Lampiran", cell: (r) => r.membutuhkan_lampiran ? <Badge variant="info">Ya</Badge> : <span style={{ color: "var(--text-subtle)" }}>Tidak</span> },
    { key: "status", header: "Status", cell: (r) => <Badge variant={r.status === "aktif" ? "success" : "secondary"}>{r.status === "aktif" ? "Aktif" : "Nonaktif"}</Badge> },
    { key: "keterangan", header: "Keterangan", cell: (r) => <span className="text-xs" style={{ color: "var(--text-subtle)" }}>{r.keterangan ?? "—"}</span> },
  ]

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--text-900)" }}>Master Jenis Cuti</h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-subtle)" }}>Kelola jenis-jenis cuti pegawai</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={refetch}><RefreshCw className="h-3.5 w-3.5" /></Button>
          <Button size="sm" onClick={openAdd}><Plus className="h-3.5 w-3.5 mr-1.5" />Tambah Jenis Cuti</Button>
        </div>
      </div>

      <DataTable data={list as unknown as Record<string, unknown>[]} columns={columns as unknown as Column<Record<string, unknown>>[]}
        searchKeys={["kode_cuti", "nama_cuti"]} loading={loading}
        actions={(row: Record<string, unknown>) => {
          const r = row as unknown as JenisCuti
          return (
            <div className="flex items-center justify-center gap-1">
              <Button variant="ghost" size="icon" className="h-7 w-7" style={{ color: "var(--warning)" }} onClick={() => openEdit(r)}><Pencil className="h-3.5 w-3.5" /></Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" style={{ color: "var(--danger)" }} onClick={() => { setSelected(r); setDeleteOpen(true) }}><Trash2 className="h-3.5 w-3.5" /></Button>
            </div>
          )
        }}
      />

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editMode ? "Edit Jenis Cuti" : "Tambah Jenis Cuti"} size="md"
        footer={<><Button variant="outline" onClick={() => setModalOpen(false)}>Batal</Button><Button onClick={handleSubmit} disabled={saving}>{saving ? "Menyimpan..." : "Simpan"}</Button></>}
      >
        {errors._ && <div className="mb-4 rounded-lg px-4 py-3 text-sm" style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>{errors._}</div>}
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <TextField label="Kode Cuti" required error={errors.kode_cuti} value={form.kode_cuti ?? ""}
              placeholder="CT / CM / CN" onChange={e => set("kode_cuti", e.target.value.toUpperCase())} />
            <TextField label="Nama Cuti" required error={errors.nama_cuti} value={form.nama_cuti ?? ""}
              onChange={e => set("nama_cuti", e.target.value)} />
          </div>
          <TextField label="Jatah Hari Default" type="number" min={0} value={String(form.jatah_hari_default ?? 0)}
            onChange={e => set("jatah_hari_default", Number(e.target.value) as unknown as never)} />
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Potong Saldo Cuti</label>
              <label className="flex items-center gap-2 cursor-pointer h-8">
                <input type="checkbox" checked={!!form.potong_saldo_cuti}
                  onChange={e => set("potong_saldo_cuti", e.target.checked as unknown as never)}
                  className="h-4 w-4" style={{ accentColor: "var(--primary)" }} />
                <span className="text-sm" style={{ color: "var(--text-900)" }}>{form.potong_saldo_cuti ? "Ya, memotong saldo" : "Tidak"}</span>
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
        description={`Hapus jenis cuti "${selected?.nama_cuti}"? Jika sudah digunakan, tidak dapat dihapus (nonaktifkan saja).`} />
    </div>
  )
}

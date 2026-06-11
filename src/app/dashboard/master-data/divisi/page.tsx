"use client"
import React, { useState, useEffect } from "react"
import { DataTable, Column } from "@/components/ui/data-table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Modal } from "@/components/ui/modal"
import { ConfirmDelete } from "@/components/ui/confirm-delete"
import { TextField } from "@/components/ui/form-field"
import { Plus, Pencil, Trash2, RefreshCw } from "lucide-react"
import { useApi } from "@/hooks/useApi"

interface Divisi { id: number; kode_divisi: string; nama_divisi: string }
const EMPTY = { nama_divisi: "" }

export default function DivisiPage() {
  const { data, loading, refetch } = useApi<Divisi[]>("/api/divisi")
  const list = data ?? []

  const [modalOpen, setModalOpen]   = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [editMode, setEditMode]     = useState(false)
  const [selected, setSelected]     = useState<Divisi | null>(null)
  const [form, setForm]             = useState(EMPTY)
  const [saving, setSaving]         = useState(false)
  const [deleting, setDeleting]     = useState(false)
  const [errors, setErrors]         = useState<Record<string, string>>({})
  const [previewKode, setPreviewKode] = useState("")

  // Auto-generate kode_divisi preview
  useEffect(() => {
    if (!modalOpen || editMode) return
    const last = list.length > 0 ? list[list.length - 1] : null
    const nextNum = last ? parseInt(last.kode_divisi.slice(2)) + 1 : 1
    setPreviewKode(`KD${String(nextNum).padStart(3, "0")}`)
  }, [modalOpen, list, editMode])

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  const openAdd = () => { setEditMode(false); setSelected(null); setForm(EMPTY); setErrors({}); setModalOpen(true) }
  const openEdit = (row: Divisi) => { setEditMode(true); setSelected(row); setForm({ nama_divisi: row.nama_divisi }); setErrors({}); setModalOpen(true) }

  const handleSubmit = async () => {
    if (!form.nama_divisi) { setErrors({ nama_divisi: "Wajib diisi" }); return }
    setSaving(true)
    try {
      const url    = editMode && selected ? `/api/divisi/${selected.id}` : "/api/divisi"
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
      await fetch(`/api/divisi/${selected.id}`, { method: "DELETE" })
      setDeleteOpen(false); refetch()
    } finally { setDeleting(false) }
  }

  const cols: Column<Divisi>[] = [
    { key: "kode_divisi", header: "Kode Divisi", cell: (r) => <Badge variant="secondary" className="font-mono">{r.kode_divisi}</Badge> },
    { key: "nama_divisi", header: "Nama Divisi", cell: (r) => <span className="font-semibold">{r.nama_divisi}</span> },
  ]

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div><h1 className="text-xl font-bold" style={{ color: "var(--text-900)" }}>Data Divisi</h1>
        <p className="text-xs mt-0.5" style={{ color: "var(--text-subtle)" }}>Total {list.length} divisi · Kode auto-generate (KD001, KD002...)</p></div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={refetch}><RefreshCw className="h-3.5 w-3.5" /></Button>
          <Button size="sm" onClick={openAdd}><Plus className="h-3.5 w-3.5 mr-1.5" />Tambah Divisi</Button>
        </div>
      </div>
      <DataTable data={list as any} columns={cols as any} searchKeys={["kode_divisi","nama_divisi"]} loading={loading}
        actions={(row: any) => (
          <div className="flex items-center justify-center gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" style={{ color: "var(--warning)" }} onClick={() => openEdit(row)}><Pencil className="h-3.5 w-3.5" /></Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" style={{ color: "var(--danger)" }} onClick={() => { setSelected(row); setDeleteOpen(true) }}><Trash2 className="h-3.5 w-3.5" /></Button>
          </div>
        )} />

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} size="sm"
        title={editMode ? "Edit Divisi" : "Tambah Divisi Baru"}
        footer={<><Button variant="outline" onClick={() => setModalOpen(false)}>Batal</Button><Button onClick={handleSubmit} disabled={saving}>{saving ? "Menyimpan..." : "Simpan"}</Button></>}
      >
        {errors._ && <div className="mb-4 rounded-lg px-4 py-3 text-sm" style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>{errors._}</div>}
        <div className="space-y-4">
          {/* Kode Divisi — READ-ONLY, auto-generated (sesuai Filament readOnly) */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
              Kode Divisi
            </label>
            <div className="flex h-8 items-center rounded-lg px-3 text-sm font-mono font-semibold" style={{ border: "1px solid var(--border)", background: "var(--surface-muted)", color: "var(--primary)" }}>
              {editMode ? selected?.kode_divisi : previewKode || "KD..."}
            </div>
            {!editMode && <p className="text-xs" style={{ color: "var(--text-subtle)" }}>Kode otomatis di-generate oleh sistem</p>}
          </div>
          <TextField label="Nama Divisi" required error={errors.nama_divisi}
            value={form.nama_divisi} onChange={e => set("nama_divisi", e.target.value)} />
        </div>
      </Modal>

      <ConfirmDelete open={deleteOpen} onClose={() => setDeleteOpen(false)}
        onConfirm={handleDelete} loading={deleting}
        description={`Hapus divisi "${selected?.nama_divisi}" (${selected?.kode_divisi})?`} />
    </div>
  )
}

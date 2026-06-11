"use client"
import React, { useState, useEffect } from "react"
import { DataTable, Column } from "@/components/ui/data-table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Modal } from "@/components/ui/modal"
import { ConfirmDelete } from "@/components/ui/confirm-delete"
import { TextField } from "@/components/ui/form-field"
import { SearchableSelect } from "@/components/ui/searchable-select"
import { Plus, Pencil, Trash2, RefreshCw } from "lucide-react"
import { useApi } from "@/hooks/useApi"

interface Subdivisi { id: number; kode_sub: string; divisi_id: number; nama_sub: string; nama_divisi?: string; kode_divisi?: string }
interface Divisi { id: number; kode_divisi: string; nama_divisi: string }
const EMPTY = { nama_sub: "", divisi_id: "" }

export default function SubdivisiPage() {
  const { data, loading, refetch } = useApi<Subdivisi[]>("/api/subdivisi")
  const { data: divisis }          = useApi<Divisi[]>("/api/divisi")
  const list = data ?? []

  const [modalOpen, setModalOpen]   = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [editMode, setEditMode]     = useState(false)
  const [selected, setSelected]     = useState<Subdivisi | null>(null)
  const [form, setForm]             = useState(EMPTY)
  const [saving, setSaving]         = useState(false)
  const [deleting, setDeleting]     = useState(false)
  const [errors, setErrors]         = useState<Record<string, string>>({})
  const [previewKode, setPreviewKode] = useState("")

  // Auto-generate kode_sub preview
  useEffect(() => {
    if (!modalOpen || editMode) return
    const last = list.length > 0 ? list[list.length - 1] : null
    const nextNum = last ? parseInt(last.kode_sub.slice(2)) + 1 : 1
    setPreviewKode(`KS${String(nextNum).padStart(3, "0")}`)
  }, [modalOpen, list, editMode])

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  const openAdd = () => { setEditMode(false); setSelected(null); setForm(EMPTY); setErrors({}); setModalOpen(true) }
  const openEdit = (row: Subdivisi) => {
    setEditMode(true); setSelected(row); setErrors({})
    setForm({ nama_sub: row.nama_sub, divisi_id: String(row.divisi_id) })
    setModalOpen(true)
  }

  const handleSubmit = async () => {
    const e: Record<string, string> = {}
    if (!form.nama_sub)  e.nama_sub  = "Wajib diisi"
    if (!form.divisi_id) e.divisi_id = "Pilih divisi"
    setErrors(e); if (Object.keys(e).length) return

    setSaving(true)
    try {
      const url    = editMode && selected ? `/api/subdivisi/${selected.id}` : "/api/subdivisi"
      const method = editMode ? "PUT" : "POST"
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, divisi_id: Number(form.divisi_id) }) })
      if (!res.ok) { const j = await res.json(); setErrors({ _: j.error ?? "Gagal" }); return }
      setModalOpen(false); refetch()
    } finally { setSaving(false) }
  }

  const handleDelete = async () => {
    if (!selected) return
    setDeleting(true)
    try {
      await fetch(`/api/subdivisi/${selected.id}`, { method: "DELETE" })
      setDeleteOpen(false); refetch()
    } finally { setDeleting(false) }
  }

  const cols: Column<Subdivisi>[] = [
    { key: "kode_sub",    header: "Kode",          cell: (r) => <Badge variant="secondary" className="font-mono">{r.kode_sub}</Badge> },
    { key: "nama_divisi", header: "Divisi",         cell: (r) => <Badge variant="outline">{r.nama_divisi ?? "—"}</Badge> },
    { key: "nama_sub",    header: "Nama Sub Divisi", cell: (r) => <span className="font-semibold">{r.nama_sub}</span> },
  ]

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div><h1 className="text-xl font-bold" style={{ color: "var(--text-900)" }}>Data Sub Divisi</h1>
        <p className="text-xs mt-0.5" style={{ color: "var(--text-subtle)" }}>Total {list.length} sub divisi · Kode auto-generate (KS001, KS002...)</p></div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={refetch}><RefreshCw className="h-3.5 w-3.5" /></Button>
          <Button size="sm" onClick={openAdd}><Plus className="h-3.5 w-3.5 mr-1.5" />Tambah Sub Divisi</Button>
        </div>
      </div>
      <DataTable data={list as any} columns={cols as any} searchKeys={["kode_sub","nama_sub","nama_divisi"]} loading={loading}
        actions={(row: any) => (
          <div className="flex items-center justify-center gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" style={{ color: "var(--warning)" }} onClick={() => openEdit(row)}><Pencil className="h-3.5 w-3.5" /></Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" style={{ color: "var(--danger)" }} onClick={() => { setSelected(row); setDeleteOpen(true) }}><Trash2 className="h-3.5 w-3.5" /></Button>
          </div>
        )} />

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} size="sm"
        title={editMode ? "Edit Sub Divisi" : "Tambah Sub Divisi Baru"}
        footer={<><Button variant="outline" onClick={() => setModalOpen(false)}>Batal</Button><Button onClick={handleSubmit} disabled={saving}>{saving ? "Menyimpan..." : "Simpan"}</Button></>}
      >
        {errors._ && <div className="mb-4 rounded-lg px-4 py-3 text-sm" style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>{errors._}</div>}
        <div className="space-y-4">
          {/* Kode Sub Divisi — READ-ONLY, auto-generated */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Kode Sub Divisi</label>
            <div className="flex h-8 items-center rounded-lg px-3 text-sm font-mono font-semibold" style={{ border: "1px solid var(--border)", background: "var(--surface-muted)", color: "var(--primary)" }}>
              {editMode ? selected?.kode_sub : previewKode || "KS..."}
            </div>
            {!editMode && <p className="text-xs" style={{ color: "var(--text-subtle)" }}>Kode otomatis di-generate oleh sistem</p>}
          </div>
          <SearchableSelect label="Divisi" required error={errors.divisi_id}
            value={form.divisi_id} onChange={v => set("divisi_id", v)}
            searchPlaceholder="Cari divisi..."
            placeholder="— Pilih Divisi —"
            options={(divisis ?? []).map(d => ({ value: String(d.id), label: d.nama_divisi, description: d.kode_divisi }))} />
          <TextField label="Nama Sub Divisi" required error={errors.nama_sub}
            value={form.nama_sub} onChange={e => set("nama_sub", e.target.value)} />
        </div>
      </Modal>

      <ConfirmDelete open={deleteOpen} onClose={() => setDeleteOpen(false)}
        onConfirm={handleDelete} loading={deleting}
        description={`Hapus sub divisi "${selected?.nama_sub}" (${selected?.kode_sub})?`} />
    </div>
  )
}

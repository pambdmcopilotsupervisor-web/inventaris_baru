"use client"
import React, { useState } from "react"
import { DataTable, Column } from "@/components/ui/data-table"
import { Button } from "@/components/ui/button"
import { Modal } from "@/components/ui/modal"
import { ConfirmDelete } from "@/components/ui/confirm-delete"
import { TextField, SelectField } from "@/components/ui/form-field"
import { Plus, Pencil, Trash2, RefreshCw } from "lucide-react"
import { useApi } from "@/hooks/useApi"
import { useCrud } from "@/hooks/useCrud"

interface Ruangan { id: number; ruangan: string; lokasi: string }
const EMPTY: Partial<Ruangan> = {}
const LOKASIS = ["Jl. Pramuka (PTAM Bandarmasih IPA 2)","Jl. A. Yani Km. 2 (PTAM Bandarmasih)","Jl. S. Parman (Booster PTAM Bandarmasih)","Jl. Beruntung Km. 7","Jl. Sutoyo S. (Tower PTAM Bandarmasih)","Jl. Cemara (Kantor Bantu PTAM Bandarmasih)","Jl. A. Yani Km. 2 Kebun Bunga","Jl. Banjar Indah"]

export default function RuanganPage() {
  const { data, loading, refetch } = useApi<Ruangan[]>("/api/ruangan")
  const list = data ?? []
  const { create, update, remove, saving, deleting } = useCrud<Ruangan>({ apiPath: "/api/ruangan", onSuccess: refetch })
  const [modalOpen, setModalOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [selected, setSelected] = useState<Ruangan|null>(null)
  const [form, setForm] = useState<Partial<Ruangan>>(EMPTY)
  const set = (k: keyof Ruangan, v: string) => setForm(f => ({ ...f, [k]: v }))
  const handleSubmit = async () => { const ok = selected ? await update(selected.id, form) : await create(form); if (ok) setModalOpen(false) }
  const handleDelete = async () => { if (!selected) return; const ok = await remove(selected.id); if (ok) setDeleteOpen(false) }

  const cols: Column<Ruangan>[] = [
    { key: "ruangan", header: "Nama Ruangan", cell: (r) => <span className="font-semibold">{r.ruangan}</span> },
    { key: "lokasi", header: "Lokasi" },
  ]
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div><h1 className="text-xl font-bold" style={{ color: "var(--text-900)" }}>Data Ruangan</h1><p className="text-xs mt-0.5" style={{ color: "var(--text-subtle)" }}>Total {list.length} ruangan</p></div>
        <div className="flex gap-2"><Button variant="outline" size="sm" onClick={refetch}><RefreshCw className="h-3.5 w-3.5" /></Button><Button size="sm" onClick={() => { setSelected(null); setForm(EMPTY); setModalOpen(true) }}><Plus className="h-3.5 w-3.5 mr-1.5" />Tambah Ruangan</Button></div>
      </div>
      <DataTable data={list as any} columns={cols as any} searchKeys={["ruangan","lokasi"]} loading={loading}
        actions={(row: any) => (
          <div className="flex items-center justify-center gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" style={{ color: "var(--warning)" }} onClick={() => { setSelected(row); setForm(row); setModalOpen(true) }}><Pencil className="h-3.5 w-3.5" /></Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" style={{ color: "var(--danger)" }} onClick={() => { setSelected(row); setDeleteOpen(true) }}><Trash2 className="h-3.5 w-3.5" /></Button>
          </div>
        )} />
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={selected ? "Edit Ruangan" : "Tambah Ruangan"} size="sm"
        footer={<><Button variant="outline" onClick={() => setModalOpen(false)}>Batal</Button><Button onClick={handleSubmit} disabled={saving}>{saving ? "Menyimpan..." : "Simpan"}</Button></>}>
        <div className="space-y-4">
          <TextField label="Nama Ruangan" required value={form.ruangan ?? ""} onChange={e => set("ruangan", e.target.value)} />
          <SelectField label="Lokasi" required value={form.lokasi ?? ""} onChange={e => set("lokasi", e.target.value)} placeholder="— Pilih Lokasi —" options={LOKASIS.map(l => ({ value: l, label: l }))} />
        </div>
      </Modal>
      <ConfirmDelete open={deleteOpen} onClose={() => setDeleteOpen(false)} onConfirm={handleDelete} loading={deleting} description={`Hapus ruangan "${selected?.ruangan}"?`} />
    </div>
  )
}

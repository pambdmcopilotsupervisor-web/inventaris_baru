"use client"

import React, { useCallback, useEffect, useState } from "react"
import { DataTable, Column } from "@/components/ui/data-table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Modal } from "@/components/ui/modal"
import { TextField, SelectField } from "@/components/ui/form-field"
import { Users, Plus, Pencil, RefreshCw } from "lucide-react"
import {
  getAnggota, createAnggota, updateAnggota, nextNoAnggota, type AnggotaRow,
} from "@/actions/keuangan-anggota"

const STATUS_VARIANT: Record<string, string> = { AKTIF: "success", NONAKTIF: "warning", KELUAR: "destructive" }
const STATUS_OPTIONS = [
  { value: "AKTIF", label: "Aktif" },
  { value: "NONAKTIF", label: "Nonaktif" },
  { value: "KELUAR", label: "Keluar" },
]
const STATUS_FILTER = [{ value: "", label: "Semua Status" }, ...STATUS_OPTIONS]

const emptyForm = {
  no_anggota: "", nama: "", no_ktp: "", no_hp: "", alamat: "",
  tgl_gabung: new Date().toISOString().split("T")[0], status: "AKTIF", keterangan: "",
}

export default function AnggotaPage() {
  const [rows, setRows] = useState<AnggotaRow[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState("")
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<AnggotaRow | null>(null)
  const [form, setForm] = useState({ ...emptyForm })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await getAnggota(statusFilter ? { status: statusFilter } : undefined)
    if (res.success) setRows(res.data)
    setLoading(false)
  }, [statusFilter])

  useEffect(() => { load() }, [load])

  async function openCreate() {
    setEditing(null)
    const no = await nextNoAnggota()
    setForm({ ...emptyForm, no_anggota: no.success ? no.data : "" })
    setError(null)
    setFormOpen(true)
  }

  function openEdit(r: AnggotaRow) {
    setEditing(r)
    setForm({
      no_anggota: r.no_anggota, nama: r.nama, no_ktp: r.no_ktp ?? "", no_hp: r.no_hp ?? "",
      alamat: r.alamat ?? "", tgl_gabung: new Date(r.tgl_gabung).toISOString().split("T")[0],
      status: r.status, keterangan: r.keterangan ?? "",
    })
    setError(null)
    setFormOpen(true)
  }

  async function handleSave() {
    if (!form.no_anggota || !form.nama) { setError("Nomor & nama anggota wajib diisi"); return }
    setSaving(true); setError(null)
    const payload = {
      no_anggota: form.no_anggota, nama: form.nama, no_ktp: form.no_ktp || undefined,
      no_hp: form.no_hp || undefined, alamat: form.alamat || undefined,
      tgl_gabung: form.tgl_gabung, status: form.status, keterangan: form.keterangan || undefined,
    }
    const res = editing ? await updateAnggota(editing.id, payload) : await createAnggota(payload)
    setSaving(false)
    if (res.success) { setFormOpen(false); load() }
    else setError(res.error)
  }

  const columns: Column<AnggotaRow>[] = [
    { key: "no_anggota", header: "No. Anggota", cell: (r) => <span className="font-mono text-xs">{r.no_anggota}</span> },
    { key: "nama", header: "Nama", cell: (r) => <span className="font-medium">{r.nama}</span> },
    { key: "no_hp", header: "No. HP", cell: (r) => r.no_hp ?? "—" },
    { key: "tgl_gabung", header: "Bergabung", cell: (r) => new Date(r.tgl_gabung).toLocaleDateString("id-ID") },
    { key: "status", header: "Status", cell: (r) => <Badge variant={STATUS_VARIANT[r.status] as never}>{r.status}</Badge> },
  ]

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5" style={{ color: "var(--primary)" }} />
          <h1 className="text-xl font-semibold" style={{ color: "var(--text-900)" }}>Anggota Koperasi</h1>
          <span className="text-sm" style={{ color: "var(--text-subtle)" }}>({rows.length})</span>
        </div>
        <div className="flex gap-2">
          <SelectField label="Filter Status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} options={STATUS_FILTER} className="w-40" />
          <Button variant="ghost" size="sm" onClick={load}><RefreshCw className="h-3.5 w-3.5" /></Button>
          <Button onClick={openCreate}><Plus className="h-4 w-4 mr-1" />Tambah Anggota</Button>
        </div>
      </div>

      <DataTable
        columns={columns as unknown as Column<Record<string, unknown>>[]}
        data={rows as unknown as Record<string, unknown>[]}
        loading={loading}
        emptyMessage="Belum ada anggota"
        searchKeys={["no_anggota", "nama"]}
        actions={(row) => {
          const r = row as unknown as AnggotaRow
          return <Button size="sm" variant="ghost" onClick={() => openEdit(r)}><Pencil className="h-3.5 w-3.5" /></Button>
        }}
      />

      <Modal open={formOpen} onClose={() => setFormOpen(false)} title={editing ? `Edit Anggota — ${editing.no_anggota}` : "Tambah Anggota"} size="md">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <TextField label="No. Anggota *" value={form.no_anggota} onChange={(e) => setForm({ ...form, no_anggota: e.target.value })} />
            <TextField label="Nama *" value={form.nama} onChange={(e) => setForm({ ...form, nama: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <TextField label="No. KTP" value={form.no_ktp} onChange={(e) => setForm({ ...form, no_ktp: e.target.value })} />
            <TextField label="No. HP" value={form.no_hp} onChange={(e) => setForm({ ...form, no_hp: e.target.value })} />
          </div>
          <TextField label="Alamat" value={form.alamat} onChange={(e) => setForm({ ...form, alamat: e.target.value })} />
          <div className="grid grid-cols-2 gap-3">
            <TextField label="Tanggal Bergabung *" value={form.tgl_gabung} onChange={(e) => setForm({ ...form, tgl_gabung: e.target.value })} type="date" />
            <SelectField label="Status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} options={STATUS_OPTIONS} />
          </div>
          {error && <p className="text-sm" style={{ color: "rgb(220,38,38)" }}>{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setFormOpen(false)}>Batal</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "Menyimpan…" : "Simpan"}</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

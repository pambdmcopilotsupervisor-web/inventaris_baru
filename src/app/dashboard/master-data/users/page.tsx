"use client"

import React, { useState } from "react"
import { DataTable, Column } from "@/components/ui/data-table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Modal } from "@/components/ui/modal"
import { ConfirmDelete } from "@/components/ui/confirm-delete"
import { TextField, SelectField } from "@/components/ui/form-field"
import { SearchableSelect } from "@/components/ui/searchable-select"
import { Plus, Pencil, Trash2, RefreshCw, Shield } from "lucide-react"
import { formatDate } from "@/lib/utils"
import { useApi } from "@/hooks/useApi"
import { useAuth } from "@/contexts/AuthContext"

interface User {
  id: number; name: string; email: string | null; role: string | null
  karyawan_id: number | null; created_at: string | null
  nama_karyawan?: string | null; jabatan?: string | null
}
interface Karyawan { id: number; nik: string; nama_karyawan: string; jabatan: string }
type UserRow = User & Record<string, unknown>

const ROLE_OPTIONS = [
  { value: "admin",    label: "Admin" },
  { value: "operator", label: "Operator" },
  { value: "user",     label: "User" },
]

const ROLE_VARIANT: Record<string, "default" | "warning" | "secondary"> = {
  admin:    "default",
  operator: "warning",
  user:     "secondary",
}

const EMPTY = { name: "", email: "", password: "", role: "user", karyawan_id: "" }

export default function UsersPage() {
  const { user } = useAuth()
  const { data, loading, refetch } = useApi<User[]>("/api/users")
  const { data: karyawans }        = useApi<Karyawan[]>("/api/karyawan")
  const list = data ?? []
  const canManageUsers = (user?.role ?? "user").toLowerCase() !== "user"

  const [modalOpen, setModalOpen]   = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [editMode, setEditMode]     = useState(false)
  const [selected, setSelected]     = useState<User | null>(null)
  const [form, setForm]             = useState(EMPTY)
  const [saving, setSaving]         = useState(false)
  const [deleting, setDeleting]     = useState(false)
  const [errors, setErrors]         = useState<Record<string, string>>({})

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  const openAdd = () => {
    setEditMode(false); setSelected(null); setForm(EMPTY); setErrors({})
    setModalOpen(true)
  }

  const openEdit = (row: User) => {
    setEditMode(true); setSelected(row); setErrors({})
    setForm({
      name:       row.name,
      email:      row.email ?? "",
      password:   "", // kosong — hanya diisi jika mau ganti password
      role:       row.role ?? "user",
      karyawan_id: row.karyawan_id ? String(row.karyawan_id) : "",
    })
    setModalOpen(true)
  }

  const handleSubmit = async () => {
    const e: Record<string, string> = {}
    if (!form.name)  e.name  = "Nama wajib diisi"
    if (!form.email) e.email = "Email wajib diisi"
    if (!editMode && !form.password) e.password = "Password wajib diisi untuk user baru"
    if (!form.role)  e.role  = "Pilih role"
    setErrors(e); if (Object.keys(e).length) return

    setSaving(true)
    try {
      const url    = editMode && selected ? `/api/users/${selected.id}` : "/api/users"
      const method = editMode ? "PUT" : "POST"
      const body: Record<string, unknown> = {
        name:        form.name,
        email:       form.email,
        role:        form.role,
        karyawan_id: form.karyawan_id ? Number(form.karyawan_id) : null,
      }
      if (form.password) body.password = form.password
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      if (!res.ok) { const j = await res.json(); setErrors({ _: j.error ?? "Gagal" }); return }
      setModalOpen(false); refetch()
    } finally { setSaving(false) }
  }

  const handleDelete = async () => {
    if (!selected) return
    setDeleting(true)
    try {
      await fetch(`/api/users/${selected.id}`, { method: "DELETE" })
      setDeleteOpen(false); refetch()
    } finally { setDeleting(false) }
  }

  const columns: Column<UserRow>[] = [
    { key: "name",  header: "Nama", cell: (r) => <span className="font-semibold">{r.name}</span> },
    { key: "email", header: "Email", cell: (r) => <span className="font-mono text-xs">{r.email ?? "—"}</span> },
    { key: "role",  header: "Role", cell: (r) => (
      <Badge variant={ROLE_VARIANT[r.role ?? "user"] ?? "secondary"}>
        <Shield className="h-3 w-3 mr-1" />{r.role ?? "user"}
      </Badge>
    )},
    { key: "nama_karyawan", header: "Karyawan Terkait", cell: (r) => (
      r.nama_karyawan
        ? <div><p className="font-medium text-sm">{r.nama_karyawan}</p><p className="text-xs" style={{ color: "var(--text-subtle)" }}>{r.jabatan ?? "—"}</p></div>
        : <span style={{ color: "var(--text-subtle)" }}>—</span>
    )},
    { key: "created_at", header: "Dibuat", cell: (r) => r.created_at ? formatDate(r.created_at) : "—" },
  ]

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--text-900)" }}>Manajemen Users</h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-subtle)" }}>
            Kelola akun pengguna — role menentukan hak akses dalam sistem
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={refetch}><RefreshCw className="h-3.5 w-3.5" /></Button>
          {canManageUsers && (
            <Button size="sm" onClick={openAdd}><Plus className="h-3.5 w-3.5 mr-1.5" />Tambah User</Button>
          )}
        </div>
      </div>

      {/* Role legend */}
      <div className="flex items-center gap-4 p-4 rounded-xl text-xs" style={{ background: "var(--primary-light)", border: "1px solid var(--primary-mid)" }}>
        <span className="font-semibold" style={{ color: "var(--primary)" }}>Role:</span>
        {[
          { role: "admin",    label: "Admin — akses penuh, dapat edit semua data & approve semua cuti" },
          { role: "operator", label: "Operator — verifikasi (Manager/Ketua)" },
          { role: "user",     label: "User — akses read + ajukan cuti (hak approval otomatis dari jabatan)" },
        ].map(r => (
          <div key={r.role} className="flex items-center gap-1.5">
            <Badge variant={ROLE_VARIANT[r.role] ?? "secondary"} className="text-[10px]">{r.role}</Badge>
            <span style={{ color: "var(--text-muted)" }}>{r.label}</span>
          </div>
        ))}
      </div>

      <DataTable
        data={list as UserRow[]} columns={columns}
        searchKeys={["name", "email", "nama_karyawan"]} loading={loading}
        actions={canManageUsers ? (row) => (
          <div className="flex items-center justify-center gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" style={{ color: "var(--warning)" }} onClick={() => openEdit(row)}><Pencil className="h-3.5 w-3.5" /></Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" style={{ color: "var(--danger)" }} onClick={() => { setSelected(row); setDeleteOpen(true) }}><Trash2 className="h-3.5 w-3.5" /></Button>
          </div>
        ) : undefined}
      />

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} size="md"
        title={editMode ? "Edit User" : "Tambah User Baru"}
        footer={<><Button variant="outline" onClick={() => setModalOpen(false)}>Batal</Button><Button onClick={handleSubmit} disabled={saving}>{saving ? "Menyimpan..." : "Simpan"}</Button></>}
      >
        <div className="space-y-4">
          {errors._ && <div className="rounded-lg px-4 py-3 text-sm" style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>{errors._}</div>}
          <TextField label="Nama" required error={errors.name} value={form.name} onChange={e => set("name", e.target.value)} />
          <TextField label="Email" type="email" required error={errors.email} value={form.email} onChange={e => set("email", e.target.value)} />
          <TextField label={editMode ? "Password Baru (kosongkan jika tidak diubah)" : "Password"} type="password"
            required={!editMode} error={errors.password}
            value={form.password} onChange={e => set("password", e.target.value)}
            placeholder={editMode ? "Kosongkan jika tidak diubah" : "Minimal 8 karakter"} />
          <SelectField label="Role" required error={errors.role} value={form.role} onChange={e => set("role", e.target.value)} options={ROLE_OPTIONS} />
          <SearchableSelect label="Karyawan Terkait"
            value={form.karyawan_id}
            onChange={v => set("karyawan_id", v)}
            placeholder="— Opsional: hubungkan ke karyawan —"
            searchPlaceholder="Cari NIK atau nama..."
            options={(karyawans ?? []).map(k => ({ value: String(k.id), label: k.nama_karyawan, description: `${k.nik} • ${k.jabatan}` }))} />
          {form.karyawan_id && (
            <p className="text-xs px-2" style={{ color: "var(--text-subtle)" }}>
              Jabatan karyawan akan digunakan untuk menentukan hak verifikasi disposal aset.
            </p>
          )}
        </div>
      </Modal>

      <ConfirmDelete open={deleteOpen} onClose={() => setDeleteOpen(false)}
        onConfirm={handleDelete} loading={deleting}
        description={`Hapus user "${selected?.name}" (${selected?.email})?`}
      />
    </div>
  )
}

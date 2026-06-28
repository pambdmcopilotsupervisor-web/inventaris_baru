"use client"

import React, { useCallback, useEffect, useMemo, useState } from "react"
import { DataTable, Column } from "@/components/ui/data-table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Modal } from "@/components/ui/modal"
import { TextField, SelectField } from "@/components/ui/form-field"
import { BookOpen, Plus, Pencil, Power, RefreshCw } from "lucide-react"
import {
  getAkun, createAkun, updateAkun, toggleAkun,
  type AkunRow,
} from "@/actions/keuangan-akun"

const JENIS_OPTIONS = [
  { value: "", label: "Semua Jenis" },
  { value: "ASET", label: "Aset" },
  { value: "KEWAJIBAN", label: "Kewajiban" },
  { value: "EKUITAS", label: "Ekuitas" },
  { value: "PENDAPATAN", label: "Pendapatan" },
  { value: "BEBAN", label: "Beban" },
]

const JENIS_FORM_OPTIONS = JENIS_OPTIONS.slice(1)

const SALDO_OPTIONS = [
  { value: "DEBIT", label: "Debit" },
  { value: "KREDIT", label: "Kredit" },
]

const JENIS_VARIANT: Record<string, string> = {
  ASET: "info",
  KEWAJIBAN: "warning",
  EKUITAS: "success",
  PENDAPATAN: "secondary",
  BEBAN: "destructive",
}

const defaultForm = {
  kode: "",
  nama: "",
  jenis: "ASET",
  kelompok: "",
  saldo_normal: "DEBIT",
  level: 3,
  parent_id: "",
  is_detail: true,
  is_active: true,
  urutan: 0,
  keterangan: "",
}

export default function BaganAkunPage() {
  const [rows, setRows] = useState<AkunRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [jenisFilter, setJenisFilter] = useState("")
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<AkunRow | null>(null)
  const [form, setForm] = useState({ ...defaultForm })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    const res = await getAkun(jenisFilter ? { jenis: jenisFilter } : undefined)
    if (res.success) setRows(res.data)
    else setLoadError(res.error)
    setLoading(false)
  }, [jenisFilter])

  useEffect(() => { load() }, [load])

  const filtered = useMemo(() =>
    jenisFilter ? rows.filter((r) => r.jenis === jenisFilter) : rows,
    [rows, jenisFilter]
  )

  // Daftar akun induk (is_detail=false) untuk pilihan parent
  const indukOptions = useMemo(() => [
    { value: "", label: "— Tidak ada —" },
    ...rows.filter((r) => !r.is_detail).map((r) => ({ value: String(r.id), label: `${r.kode} — ${r.nama}` })),
  ], [rows])

  function openCreate() {
    setEditing(null)
    setForm({ ...defaultForm })
    setFormError(null)
    setFormOpen(true)
  }

  function openEdit(row: AkunRow) {
    setEditing(row)
    setForm({
      kode: row.kode,
      nama: row.nama,
      jenis: row.jenis,
      kelompok: row.kelompok ?? "",
      saldo_normal: row.saldo_normal,
      level: row.level,
      parent_id: row.parent_id ? String(row.parent_id) : "",
      is_detail: row.is_detail,
      is_active: row.is_active,
      urutan: row.urutan,
      keterangan: row.keterangan ?? "",
    })
    setFormError(null)
    setFormOpen(true)
  }

  async function handleSave() {
    setSaving(true)
    setFormError(null)
    const payload = {
      kode: form.kode,
      nama: form.nama,
      jenis: form.jenis,
      kelompok: form.kelompok || undefined,
      saldo_normal: form.saldo_normal,
      level: Number(form.level),
      parent_id: form.parent_id ? Number(form.parent_id) : undefined,
      is_detail: form.is_detail,
      is_active: form.is_active,
      urutan: Number(form.urutan),
      keterangan: form.keterangan || undefined,
    }
    const res = editing
      ? await updateAkun(editing.id, payload)
      : await createAkun(payload)
    setSaving(false)
    if (res.success) {
      setFormOpen(false)
      load()
    } else {
      setFormError(res.error)
    }
  }

  async function handleToggle(row: AkunRow) {
    const res = await toggleAkun(row.id, !row.is_active)
    if (res.success) load()
  }

  const columns: Column<AkunRow>[] = [
    { key: "kode", header: "Kode", cell: (r) => <span className="font-mono text-xs">{r.kode}</span> },
    {
      key: "nama", header: "Nama Akun",
      cell: (r) => (
        <span style={{ paddingLeft: `${(r.level - 1) * 12}px` }} className="block">
          {!r.is_detail && <span className="font-semibold">{r.nama}</span>}
          {r.is_detail && r.nama}
        </span>
      ),
    },
    {
      key: "jenis", header: "Jenis",
      cell: (r) => <Badge variant={JENIS_VARIANT[r.jenis] as never}>{r.jenis}</Badge>,
    },
    { key: "kelompok", header: "Kelompok", cell: (r) => r.kelompok ?? "—" },
    {
      key: "saldo_normal", header: "Saldo Normal",
      cell: (r) => (
        <span className="text-xs font-medium" style={{ color: r.saldo_normal === "DEBIT" ? "rgb(37,99,235)" : "rgb(5,150,105)" }}>
          {r.saldo_normal}
        </span>
      ),
    },
    {
      key: "is_detail", header: "Tipe",
      cell: (r) => <Badge variant={r.is_detail ? "secondary" : "outline"}>{r.is_detail ? "Detail" : "Induk"}</Badge>,
    },
    {
      key: "is_active", header: "Status",
      cell: (r) => <Badge variant={r.is_active ? "success" : "destructive"}>{r.is_active ? "Aktif" : "Nonaktif"}</Badge>,
    },
  ]

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <BookOpen className="h-5 w-5" style={{ color: "var(--primary)" }} />
          <h1 className="text-xl font-semibold" style={{ color: "var(--text-900)" }}>Bagan Akun</h1>
          <span className="text-sm" style={{ color: "var(--text-subtle)" }}>— Chart of Accounts (PSAK 27)</span>
        </div>
        <div className="flex gap-2 flex-wrap">
          <SelectField
            label="Filter Jenis"
            value={jenisFilter}
            onChange={(e) => setJenisFilter(e.target.value)}
            options={JENIS_OPTIONS}
            className="w-40"
          />
          <Button variant="ghost" size="sm" onClick={load}><RefreshCw className="h-3.5 w-3.5" /></Button>
          <Button onClick={openCreate}><Plus className="h-4 w-4 mr-1" />Tambah Akun</Button>
        </div>
      </div>

      {loadError && (
        <div className="p-3 rounded-lg text-sm" style={{ background: "rgba(220,38,38,0.08)", color: "rgb(220,38,38)" }}>
          {loadError}
        </div>
      )}

      <DataTable
        columns={columns as unknown as Column<Record<string, unknown>>[]}
        data={filtered as unknown as Record<string, unknown>[]}
        loading={loading}
        emptyMessage="Belum ada akun"
        searchKeys={["kode", "nama"]}
        actions={(row) => {
          const r = row as unknown as AkunRow
          return (
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" onClick={() => openEdit(r)}><Pencil className="h-3.5 w-3.5" /></Button>
              <Button size="sm" variant="ghost" onClick={() => handleToggle(r)}>
                <Power className={`h-3.5 w-3.5 ${r.is_active ? "text-green-600" : "text-gray-400"}`} />
              </Button>
            </div>
          )
        }}
      />

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? `Edit Akun — ${editing.kode}` : "Tambah Akun Baru"}
        size="md"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <TextField label="Kode Akun *" value={form.kode} onChange={(e) => setForm({ ...form, kode: e.target.value })} placeholder="mis: 1.1.1" />
            <TextField label="Nama Akun *" value={form.nama} onChange={(e) => setForm({ ...form, nama: e.target.value })} placeholder="mis: Kas" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <SelectField label="Jenis *" value={form.jenis} onChange={(e) => setForm({ ...form, jenis: e.target.value })} options={JENIS_FORM_OPTIONS} />
            <SelectField label="Saldo Normal *" value={form.saldo_normal} onChange={(e) => setForm({ ...form, saldo_normal: e.target.value })} options={SALDO_OPTIONS} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <TextField label="Level (1=Induk, 3=Detail)" value={String(form.level)} onChange={(e) => setForm({ ...form, level: parseInt(e.target.value) || 1 })} type="number" />
            <SelectField label="Akun Induk" value={form.parent_id} onChange={(e) => setForm({ ...form, parent_id: e.target.value })} options={indukOptions} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <TextField label="Kelompok (opsional)" value={form.kelompok} onChange={(e) => setForm({ ...form, kelompok: e.target.value })} placeholder="mis: Simpanan Pokok" />
            <TextField label="Urutan" value={String(form.urutan)} onChange={(e) => setForm({ ...form, urutan: parseInt(e.target.value) || 0 })} type="number" />
          </div>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: "var(--text-900)" }}>
              <input type="checkbox" checked={form.is_detail} onChange={(e) => setForm({ ...form, is_detail: e.target.checked })} className="rounded" />
              Akun Detail (bisa dipakai di jurnal)
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: "var(--text-900)" }}>
              <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} className="rounded" />
              Aktif
            </label>
          </div>
          <TextField label="Keterangan" value={form.keterangan} onChange={(e) => setForm({ ...form, keterangan: e.target.value })} />
          {formError && <p className="text-sm" style={{ color: "rgb(220,38,38)" }}>{formError}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setFormOpen(false)}>Batal</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "Menyimpan…" : "Simpan"}</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

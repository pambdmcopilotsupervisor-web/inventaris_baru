"use client"
import React, { useState } from "react"
import { DataTable, Column } from "@/components/ui/data-table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Modal } from "@/components/ui/modal"
import { ConfirmDelete } from "@/components/ui/confirm-delete"
import { TextField, SelectField, TextareaField } from "@/components/ui/form-field"
import { Plus, Pencil, Trash2, RefreshCw, Clock, Moon, Check, X } from "lucide-react"
import { useApi } from "@/hooks/useApi"

/* ─── Types ─────────────────────────────────────────────────────── */
interface Shift {
  id: number
  kode_shift: string
  nama_shift: string
  jam_masuk: string
  jam_pulang: string
  toleransi_terlambat_menit: number
  batas_absen_masuk_mulai: string | null
  batas_absen_masuk_selesai: string | null
  batas_absen_pulang_mulai: string | null
  batas_absen_pulang_selesai: string | null
  is_lintas_hari: boolean
  durasi_kerja_menit: number | null
  status: string
  keterangan: string | null
}

const EMPTY: Partial<Shift> = {
  kode_shift: "", nama_shift: "",
  jam_masuk: "08:00", jam_pulang: "16:00",
  toleransi_terlambat_menit: 15,
  batas_absen_masuk_mulai: "07:30", batas_absen_masuk_selesai: "08:30",
  batas_absen_pulang_mulai: "15:30", batas_absen_pulang_selesai: "16:30",
  is_lintas_hari: false,
  durasi_kerja_menit: null, status: "aktif", keterangan: "",
}

function formatDurasi(menit: number | null): string {
  if (!menit) return "—"
  const j = Math.floor(menit / 60)
  const m = menit % 60
  return m > 0 ? `${j}j ${m}m` : `${j} jam`
}

/* ─── Main Page ──────────────────────────────────────────────────── */
export default function ShiftPage() {
  const { data, loading, refetch } = useApi<Shift[]>("/api/sdm/shift")
  const list = data ?? []

  const [modalOpen, setModalOpen]   = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [editMode, setEditMode]     = useState(false)
  const [selected, setSelected]     = useState<Shift | null>(null)
  const [form, setForm]             = useState<Partial<Shift>>(EMPTY)
  const [saving, setSaving]         = useState(false)
  const [deleting, setDeleting]     = useState(false)
  const [errors, setErrors]         = useState<Record<string, string>>({})

  const set = <K extends keyof Shift>(k: K, v: Shift[K]) =>
    setForm(f => ({ ...f, [k]: v }))

  const openAdd = () => {
    setEditMode(false); setSelected(null); setForm(EMPTY); setErrors({}); setModalOpen(true)
  }
  const openEdit = (row: Shift) => {
    setEditMode(true); setSelected(row)
    setForm({
      ...row,
      jam_masuk:  row.jam_masuk.slice(0, 5),
      jam_pulang: row.jam_pulang.slice(0, 5),
      batas_absen_masuk_mulai:    row.batas_absen_masuk_mulai?.slice(0, 5)    ?? "",
      batas_absen_masuk_selesai:  row.batas_absen_masuk_selesai?.slice(0, 5)  ?? "",
      batas_absen_pulang_mulai:   row.batas_absen_pulang_mulai?.slice(0, 5)   ?? "",
      batas_absen_pulang_selesai: row.batas_absen_pulang_selesai?.slice(0, 5) ?? "",
    })
    setErrors({}); setModalOpen(true)
  }

  const handleSubmit = async () => {
    const e: Record<string, string> = {}
    if (!form.kode_shift?.trim()) e.kode_shift = "Kode shift wajib diisi"
    if (!form.nama_shift?.trim()) e.nama_shift = "Nama shift wajib diisi"
    if (!form.jam_masuk)          e.jam_masuk  = "Jam masuk wajib diisi"
    if (!form.jam_pulang)         e.jam_pulang = "Jam pulang wajib diisi"
    setErrors(e); if (Object.keys(e).length) return

    setSaving(true)
    try {
      const url    = editMode && selected ? `/api/sdm/shift/${selected.id}` : "/api/sdm/shift"
      const method = editMode ? "PUT" : "POST"
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          kode_shift: form.kode_shift?.trim().toUpperCase(),
          toleransi_terlambat_menit: Number(form.toleransi_terlambat_menit ?? 15),
          batas_absen_masuk_mulai:    form.batas_absen_masuk_mulai    || null,
          batas_absen_masuk_selesai:  form.batas_absen_masuk_selesai  || null,
          batas_absen_pulang_mulai:   form.batas_absen_pulang_mulai   || null,
          batas_absen_pulang_selesai: form.batas_absen_pulang_selesai || null,
        }),
      })
      if (!res.ok) { const j = await res.json(); setErrors({ _: j.error ?? "Gagal" }); return }
      setModalOpen(false); refetch()
    } finally { setSaving(false) }
  }

  const handleDelete = async () => {
    if (!selected) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/sdm/shift/${selected.id}`, { method: "DELETE" })
      if (!res.ok) { const j = await res.json(); setErrors({ _: j.error ?? "Gagal menghapus" }); setDeleteOpen(false); return }
      setDeleteOpen(false); refetch()
    } finally { setDeleting(false) }
  }

  const toggleStatus = async (row: Shift) => {
    await fetch(`/api/sdm/shift/${row.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...row, status: row.status === "aktif" ? "nonaktif" : "aktif" }),
    })
    refetch()
  }

  /* ─── Stats ──────────────────────────────────────────────────── */
  const aktif    = list.filter(s => s.status === "aktif").length
  const nonaktif = list.filter(s => s.status === "nonaktif").length
  const lintas   = list.filter(s => s.is_lintas_hari).length

  /* ─── Columns ────────────────────────────────────────────────── */
  const columns: Column<Shift>[] = [
    {
      key: "kode_shift", header: "Kode",
      cell: (r) => <Badge variant="secondary" className="font-mono">{r.kode_shift}</Badge>,
    },
    {
      key: "nama_shift", header: "Nama Shift",
      cell: (r) => (
        <div className="flex items-center gap-2">
          {r.is_lintas_hari ? <Moon className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--primary)" }} /> : <Clock className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--text-subtle)" }} />}
          <span className="font-semibold">{r.nama_shift}</span>
        </div>
      ),
    },
    {
      key: "jam_masuk", header: "Jam Kerja",
      cell: (r) => (
        <span className="font-mono text-sm">
          {r.jam_masuk.slice(0, 5)} – {r.jam_pulang.slice(0, 5)}
          {r.is_lintas_hari && <span className="ml-1 text-[10px]" style={{ color: "var(--primary)" }}>+1h</span>}
        </span>
      ),
    },
    {
      key: "toleransi_terlambat_menit", header: "Toleransi",
      cell: (r) => <span className="text-sm">{r.toleransi_terlambat_menit} mnt</span>,
    },
    {
      key: "durasi_kerja_menit", header: "Durasi",
      cell: (r) => <span className="text-sm">{formatDurasi(r.durasi_kerja_menit)}</span>,
    },
    {
      key: "status", header: "Status",
      cell: (r) => (
        <Badge variant={r.status === "aktif" ? "success" : "secondary"}>
          {r.status === "aktif" ? "Aktif" : "Nonaktif"}
        </Badge>
      ),
    },
  ]

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--text-900)" }}>Master Shift Kerja</h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-subtle)" }}>
            Kelola shift kerja untuk penjadwalan pegawai
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={refetch}><RefreshCw className="h-3.5 w-3.5" /></Button>
          <Button size="sm" onClick={openAdd}><Plus className="h-3.5 w-3.5 mr-1.5" />Tambah Shift</Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-3">
        {[
          { label: "Total Shift", value: list.length,  color: "var(--primary)" },
          { label: "Aktif",        value: aktif,        color: "var(--success)" },
          { label: "Lintas Hari",  value: lintas,       color: "var(--warning)" },
        ].map(s => (
          <div key={s.label} className="rounded-xl p-4 flex items-center gap-3" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
            <div>
              <p className="text-xs" style={{ color: "var(--text-subtle)" }}>{s.label}</p>
              <p className="text-2xl font-bold font-mono mt-0.5" style={{ color: s.color }}>{s.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Table */}
      <DataTable
        data={list as unknown as Record<string, unknown>[]}
        columns={columns as unknown as Column<Record<string, unknown>>[]}
        searchKeys={["kode_shift", "nama_shift"]}
        loading={loading}
        actions={(row: Record<string, unknown>) => {
          const r = row as unknown as Shift
          return (
            <div className="flex items-center justify-center gap-1">
              <Button
                variant="ghost" size="icon" className="h-7 w-7"
                title={r.status === "aktif" ? "Nonaktifkan" : "Aktifkan"}
                style={{ color: r.status === "aktif" ? "var(--success)" : "var(--text-subtle)" }}
                onClick={() => toggleStatus(r)}
              >
                {r.status === "aktif" ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" style={{ color: "var(--warning)" }} onClick={() => openEdit(r)}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" style={{ color: "var(--danger)" }} onClick={() => { setSelected(r); setDeleteOpen(true) }}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          )
        }}
      />

      {/* Modal Create/Edit */}
      <Modal
        open={modalOpen} onClose={() => setModalOpen(false)}
        title={editMode ? "Edit Shift" : "Tambah Shift Baru"}
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Batal</Button>
            <Button onClick={handleSubmit} disabled={saving}>{saving ? "Menyimpan..." : "Simpan"}</Button>
          </>
        }
      >
        {errors._ && (
          <div className="mb-4 rounded-lg px-4 py-3 text-sm" style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>
            {errors._}
          </div>
        )}

        <div className="space-y-5">
          {/* Baris 1: Kode + Nama */}
          <div className="grid grid-cols-2 gap-4">
            <TextField label="Kode Shift" required error={errors.kode_shift}
              value={form.kode_shift ?? ""} placeholder="PAGI / SIANG / MALAM"
              onChange={e => set("kode_shift", e.target.value.toUpperCase())} />
            <TextField label="Nama Shift" required error={errors.nama_shift}
              value={form.nama_shift ?? ""}
              onChange={e => set("nama_shift", e.target.value)} />
          </div>

          {/* Baris 2: Jam Masuk + Pulang + Toleransi */}
          <div className="grid grid-cols-3 gap-4">
            <TextField label="Jam Masuk" required error={errors.jam_masuk}
              type="time" value={form.jam_masuk ?? ""}
              onChange={e => set("jam_masuk", e.target.value)} />
            <TextField label="Jam Pulang" required error={errors.jam_pulang}
              type="time" value={form.jam_pulang ?? ""}
              onChange={e => set("jam_pulang", e.target.value)} />
            <TextField label="Toleransi Terlambat (menit)"
              type="number" min={0} max={120}
              value={String(form.toleransi_terlambat_menit ?? 15)}
              onChange={e => set("toleransi_terlambat_menit", Number(e.target.value) as unknown as never)} />
          </div>

          {/* Baris 3: Batas absen masuk */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--text-subtle)" }}>
              Batas Absen Masuk
            </p>
            <div className="grid grid-cols-2 gap-4">
              <TextField label="Mulai" type="time"
                value={form.batas_absen_masuk_mulai ?? ""}
                onChange={e => set("batas_absen_masuk_mulai", e.target.value)} />
              <TextField label="Selesai" type="time"
                value={form.batas_absen_masuk_selesai ?? ""}
                onChange={e => set("batas_absen_masuk_selesai", e.target.value)} />
            </div>
          </div>

          {/* Baris 4: Batas absen pulang */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--text-subtle)" }}>
              Batas Absen Pulang
            </p>
            <div className="grid grid-cols-2 gap-4">
              <TextField label="Mulai" type="time"
                value={form.batas_absen_pulang_mulai ?? ""}
                onChange={e => set("batas_absen_pulang_mulai", e.target.value)} />
              <TextField label="Selesai" type="time"
                value={form.batas_absen_pulang_selesai ?? ""}
                onChange={e => set("batas_absen_pulang_selesai", e.target.value)} />
            </div>
          </div>

          {/* Baris 5: Lintas hari + Durasi + Status */}
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                Lintas Hari (Shift Malam)
              </label>
              <div className="flex items-center gap-3 h-8">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!form.is_lintas_hari}
                    onChange={e => set("is_lintas_hari", e.target.checked as unknown as never)}
                    className="h-4 w-4 rounded cursor-pointer"
                    style={{ accentColor: "var(--primary)" }}
                  />
                  <span className="text-sm" style={{ color: "var(--text-900)" }}>
                    {form.is_lintas_hari ? "Ya (pulang +1 hari)" : "Tidak"}
                  </span>
                </label>
              </div>
            </div>
            <TextField label="Durasi Kerja (menit) — opsional"
              type="number" min={0}
              placeholder="Otomatis dihitung"
              value={form.durasi_kerja_menit != null ? String(form.durasi_kerja_menit) : ""}
              onChange={e => set("durasi_kerja_menit", e.target.value ? Number(e.target.value) as unknown as never : null as unknown as never)} />
            <SelectField label="Status" required
              value={form.status ?? "aktif"}
              onChange={e => set("status", e.target.value)}
              options={[{ value: "aktif", label: "Aktif" }, { value: "nonaktif", label: "Nonaktif" }]} />
          </div>

          {/* Keterangan */}
          <TextareaField label="Keterangan"
            value={form.keterangan ?? ""}
            onChange={e => set("keterangan", e.target.value)} />
        </div>
      </Modal>

      {/* Confirm Delete */}
      <ConfirmDelete
        open={deleteOpen} onClose={() => setDeleteOpen(false)}
        onConfirm={handleDelete} loading={deleting}
        description={`Hapus shift "${selected?.nama_shift}" (${selected?.kode_shift})? Shift yang masih digunakan di jadwal tidak dapat dihapus.`}
      />
    </div>
  )
}

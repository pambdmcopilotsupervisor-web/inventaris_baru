"use client"
import React, { useState } from "react"
import { DataTable, Column } from "@/components/ui/data-table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Modal } from "@/components/ui/modal"
import { ConfirmDelete } from "@/components/ui/confirm-delete"
import { TextField, SelectField, TextareaField } from "@/components/ui/form-field"
import { Plus, Pencil, Trash2, RefreshCw, CalendarOff } from "lucide-react"
import { formatDateLong } from "@/lib/utils"
import { useApi } from "@/hooks/useApi"

/* ─── Types ─────────────────────────────────────────────────────── */
interface HariLibur {
  id: number
  tanggal: string
  nama_libur: string
  tipe_libur: string
  keterangan: string | null
}

const TIPE_LIBUR = [
  { value: "Nasional",      label: "Hari Libur Nasional" },
  { value: "Cuti_Bersama",  label: "Cuti Bersama" },
  { value: "Perusahaan",    label: "Libur Perusahaan" },
]

const EMPTY: Partial<HariLibur> = { tanggal: "", nama_libur: "", tipe_libur: "Nasional", keterangan: "" }

const tipeVariant = (tipe: string) => {
  if (tipe === "Nasional")     return "destructive"
  if (tipe === "Cuti_Bersama") return "warning"
  return "info"
}

const tipeLabel = (tipe: string) =>
  TIPE_LIBUR.find(t => t.value === tipe)?.label ?? tipe

/* ─── Main Page ──────────────────────────────────────────────────── */
export default function HariLiburPage() {
  const tahunSekarang = new Date().getFullYear()
  const [tahunFilter, setTahunFilter] = useState(String(tahunSekarang))
  const [bulanFilter, setBulanFilter] = useState("") // kosong = semua bulan
  const queryStr = bulanFilter ? `tahun=${tahunFilter}&bulan=${bulanFilter}` : `tahun=${tahunFilter}`
  const { data, loading, refetch } = useApi<HariLibur[]>(`/api/sdm/hari-libur?${queryStr}`, [tahunFilter, bulanFilter])
  const list = data ?? []

  const [modalOpen, setModalOpen]   = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [editMode, setEditMode]     = useState(false)
  const [selected, setSelected]     = useState<HariLibur | null>(null)
  const [form, setForm]             = useState<Partial<HariLibur>>(EMPTY)
  const [saving, setSaving]         = useState(false)
  const [deleting, setDeleting]     = useState(false)
  const [errors, setErrors]         = useState<Record<string, string>>({})

  const set = <K extends keyof HariLibur>(k: K, v: HariLibur[K]) =>
    setForm(f => ({ ...f, [k]: v }))

  const openAdd = () => {
    setEditMode(false); setSelected(null); setForm(EMPTY); setErrors({}); setModalOpen(true)
  }
  const openEdit = (row: HariLibur) => {
    setEditMode(true); setSelected(row)
    setForm({ ...row, tanggal: row.tanggal.slice(0, 10) })
    setErrors({}); setModalOpen(true)
  }

  const handleSubmit = async () => {
    const e: Record<string, string> = {}
    if (!form.tanggal)             e.tanggal    = "Tanggal wajib diisi"
    if (!form.nama_libur?.trim())  e.nama_libur = "Nama libur wajib diisi"
    setErrors(e); if (Object.keys(e).length) return

    setSaving(true)
    try {
      const url    = editMode && selected ? `/api/sdm/hari-libur/${selected.id}` : "/api/sdm/hari-libur"
      const method = editMode ? "PUT" : "POST"
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      if (!res.ok) { const j = await res.json(); setErrors({ _: j.error ?? "Gagal" }); return }
      setModalOpen(false); refetch()
    } finally { setSaving(false) }
  }

  const handleDelete = async () => {
    if (!selected) return
    setDeleting(true)
    try {
      await fetch(`/api/sdm/hari-libur/${selected.id}`, { method: "DELETE" })
      setDeleteOpen(false); refetch()
    } finally { setDeleting(false) }
  }

  /* Pilihan tahun: ±3 tahun */
  const tahunOptions = Array.from({ length: 7 }, (_, i) => tahunSekarang - 3 + i)

  /* Stats per tipe */
  const countByTipe = TIPE_LIBUR.map(t => ({
    label: t.label,
    value: list.filter(l => l.tipe_libur === t.value).length,
  }))

  const columns: Column<HariLibur>[] = [
    {
      key: "tanggal", header: "Tanggal",
      cell: (r) => (
        <div>
          <p className="font-semibold text-sm">{formatDateLong(r.tanggal)}</p>
          <p className="text-xs font-mono" style={{ color: "var(--text-subtle)" }}>
            {new Date(r.tanggal).toLocaleDateString("id-ID", { weekday: "long" })}
          </p>
        </div>
      ),
    },
    {
      key: "nama_libur", header: "Nama Hari Libur",
      cell: (r) => <span className="font-semibold">{r.nama_libur}</span>,
    },
    {
      key: "tipe_libur", header: "Tipe",
      cell: (r) => <Badge variant={tipeVariant(r.tipe_libur) as "destructive" | "warning" | "info"}>{tipeLabel(r.tipe_libur)}</Badge>,
    },
    {
      key: "keterangan", header: "Keterangan",
      cell: (r) => <span style={{ color: "var(--text-subtle)" }}>{r.keterangan ?? "—"}</span>,
    },
  ]

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--text-900)" }}>Master Hari Libur</h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-subtle)" }}>
            Kelola hari libur nasional, cuti bersama, dan libur perusahaan
          </p>
        </div>
        <div className="flex gap-2 items-center">
          {/* Filter tahun */}
          <select
            value={tahunFilter}
            onChange={e => { setTahunFilter(e.target.value) }}
            className="h-8 rounded-lg px-3 text-sm cursor-pointer"
            style={{ border: "1px solid var(--border-strong)", background: "var(--surface)", color: "var(--text-900)" }}
          >
            {tahunOptions.map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          {/* Filter bulan */}
          <select
            value={bulanFilter}
            onChange={e => setBulanFilter(e.target.value)}
            className="h-8 rounded-lg px-3 text-sm cursor-pointer"
            style={{ border: "1px solid var(--border-strong)", background: "var(--surface)", color: "var(--text-900)" }}
          >
            <option value="">Semua Bulan</option>
            {["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"].map((bln, i) => (
              <option key={i+1} value={String(i+1).padStart(2,"0")}>{bln}</option>
            ))}
          </select>
          <Button variant="outline" size="sm" onClick={refetch}><RefreshCw className="h-3.5 w-3.5" /></Button>
          <Button size="sm" onClick={openAdd}><Plus className="h-3.5 w-3.5 mr-1.5" />Tambah Hari Libur</Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl p-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          <p className="text-xs" style={{ color: "var(--text-subtle)" }}>Total {tahunFilter}{bulanFilter ? ` / ${["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Ags","Sep","Okt","Nov","Des"][Number(bulanFilter)-1]}` : ""}</p>
          <p className="text-2xl font-bold font-mono mt-0.5" style={{ color: "var(--primary)" }}>{list.length}</p>
        </div>
        {countByTipe.map(s => (
          <div key={s.label} className="rounded-xl p-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
            <p className="text-xs truncate" style={{ color: "var(--text-subtle)" }}>{s.label}</p>
            <p className="text-2xl font-bold font-mono mt-0.5" style={{ color: "var(--text-900)" }}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      <DataTable
        data={list as unknown as Record<string, unknown>[]}
        columns={columns as unknown as Column<Record<string, unknown>>[]}
        searchKeys={["nama_libur", "tanggal"]}
        loading={loading}
        emptyMessage={`Tidak ada hari libur untuk ${tahunFilter}${bulanFilter ? ` / ${["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"][Number(bulanFilter)-1]}` : ""}`}
        actions={(row: Record<string, unknown>) => {
          const r = row as unknown as HariLibur
          return (
            <div className="flex items-center justify-center gap-1">
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

      {/* Modal */}
      <Modal
        open={modalOpen} onClose={() => setModalOpen(false)}
        title={editMode ? "Edit Hari Libur" : "Tambah Hari Libur"}
        size="sm"
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
        <div className="space-y-4">
          <TextField label="Tanggal" required error={errors.tanggal}
            type="date" value={form.tanggal ?? ""}
            onChange={e => set("tanggal", e.target.value)} />
          <TextField label="Nama Hari Libur" required error={errors.nama_libur}
            value={form.nama_libur ?? ""}
            placeholder="cth: Hari Raya Idul Fitri"
            onChange={e => set("nama_libur", e.target.value)} />
          <SelectField label="Tipe Libur" required
            value={form.tipe_libur ?? "Nasional"}
            onChange={e => set("tipe_libur", e.target.value)}
            options={TIPE_LIBUR} />
          <TextareaField label="Keterangan"
            value={form.keterangan ?? ""}
            onChange={e => set("keterangan", e.target.value)} />
        </div>
      </Modal>

      <ConfirmDelete
        open={deleteOpen} onClose={() => setDeleteOpen(false)}
        onConfirm={handleDelete} loading={deleting}
        description={`Hapus hari libur "${selected?.nama_libur}" tanggal ${selected?.tanggal ? formatDateLong(selected.tanggal) : ""}?`}
      />
    </div>
  )
}

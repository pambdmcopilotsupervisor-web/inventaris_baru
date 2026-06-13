"use client"
import React, { useState } from "react"
import Link from "next/link"
import { DataTable, Column } from "@/components/ui/data-table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Modal } from "@/components/ui/modal"
import { ConfirmDelete } from "@/components/ui/confirm-delete"
import { TextField, SelectField, TextareaField } from "@/components/ui/form-field"
import { SearchableSelect } from "@/components/ui/searchable-select"
import {
  Plus, Pencil, Trash2, RefreshCw, Eye, Play,
  AlertTriangle, CalendarDays,
} from "lucide-react"
import { formatDate } from "@/lib/utils"
import { useApi } from "@/hooks/useApi"
import { STATUS_ABSENSI_LABELS, STATUS_ABSENSI_BADGE, StatusAbsensi } from "@/lib/attendance"

/* ─── Types ─────────────────────────────────────────────────────── */
interface AbsensiRow {
  id: number; karyawan_id: number; jadwal_shift_id: number | null
  tanggal_absensi: string; jam_masuk: string | null; jam_pulang: string | null
  status_absensi: string; menit_terlambat: number; menit_pulang_cepat: number
  is_terlambat?: boolean; is_pulang_cepat?: boolean; is_tidak_absen_masuk?: boolean; is_tidak_absen_pulang?: boolean
  total_jam_kerja_menit: number; is_manual: boolean; alasan_manual: string | null
  catatan_manual: string | null
  karyawans?: { id: number; nik: string; nama_karyawan: string; jabatan: string; divisi_id: number | null }
  jadwal_shifts?: { shift_kerjas?: { kode_shift: string; nama_shift: string; jam_masuk: string; jam_pulang: string } | null } | null
}
interface Karyawan { id: number; nik: string; nama_karyawan: string; jabatan: string; status_karyawan: string | null; divisi_id: number | null }
interface Divisi   { id: number; nama_divisi: string }
interface Subdivisi { id: number; nama_sub: string; divisi_id: number }

const STATUS_LIST = Object.entries(STATUS_ABSENSI_LABELS).map(([v, l]) => ({ value: v, label: l }))

function formatMenit(menit: number): string {
  if (!menit) return "—"
  const j = Math.floor(menit / 60); const m = menit % 60
  return j > 0 ? `${j}j ${m}m` : `${m}m`
}

function getFlagLabels(row: AbsensiRow): string[] {
  const flags: string[] = []
  if (row.is_terlambat) flags.push("Terlambat")
  if (row.is_pulang_cepat) flags.push("Pulang cepat")
  if (row.is_tidak_absen_masuk) flags.push("Tidak absen masuk")
  if (row.is_tidak_absen_pulang) flags.push("Tidak absen pulang")
  return flags
}

/* ─── Main Page ──────────────────────────────────────────────────── */
export default function AbsensiPage() {
  const today = new Date().toISOString().slice(0, 10)

  /* ── Filter state ───────────────────────────────────────────── */
  const [filter, setFilter] = useState({ tanggal: today, divisi_id: "", subdivisi_id: "", status: "", karyawan_id: "" })

  const queryStr = new URLSearchParams(
    Object.fromEntries(Object.entries(filter).filter(([, v]) => v !== ""))
  ).toString()

  const { data, loading, refetch } = useApi<AbsensiRow[]>(`/api/sdm/absensi?${queryStr}`, [queryStr])
  const { data: karyawans } = useApi<Karyawan[]>("/api/karyawan")
  const { data: divisis }   = useApi<Divisi[]>("/api/divisi")
  const list = data ?? []

  const [subdivisis, setSubdivisis] = useState<Subdivisi[]>([])
  const loadSub = async (divisiId: string) => {
    if (!divisiId) { setSubdivisis([]); return }
    const r = await fetch(`/api/subdivisi/by-divisi/${divisiId}`)
    setSubdivisis(await r.json())
  }

  /* ── Modals state ────────────────────────────────────────────── */
  const [addOpen, setAddOpen]       = useState(false)
  const [editOpen, setEditOpen]     = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [detailOpen, setDetailOpen] = useState(false)
  const [genOpen, setGenOpen]       = useState(false)
  const [recalcOpen, setRecalcOpen] = useState(false)
  const [selected, setSelected]     = useState<AbsensiRow | null>(null)

  /* ── Add form state ──────────────────────────────────────────── */
  const [addForm, setAddForm] = useState({
    karyawan_id: "", tanggal_absensi: today, jadwal_shift_id: "",
    jam_masuk: "", jam_pulang: "", status_absensi: "",
    alasan_manual: "", catatan_manual: "",
  })
  const [addErrors, setAddErrors] = useState<Record<string, string>>({})
  const [saving, setSaving]       = useState(false)

  /* ── Edit form state ─────────────────────────────────────────── */
  const [editForm, setEditForm] = useState({
    jam_masuk: "", jam_pulang: "", status_absensi: "",
    alasan_manual: "", catatan_manual: "",
  })
  const [editErrors, setEditErrors] = useState<Record<string, string>>({})

  /* ── Generate state ──────────────────────────────────────────── */
  const [genTanggal, setGenTanggal]       = useState(today)
  const [genForce, setGenForce]           = useState(false)
  const [genSaving, setGenSaving]         = useState(false)
  const [genResult, setGenResult]         = useState<{ dibuat: number; diperbarui: number; dilewati: number; message: string } | null>(null)

  /* ── Recalculate state ───────────────────────────────────────── */
  const [recalcForm, setRecalcForm] = useState({
    target: "all", karyawan_id: "", divisi_id: "", subdivisi_id: "",
    tgl_mulai: today, tgl_selesai: today,
    force_manual: false, create_missing: true, include_tanpa_jadwal: false,
  })
  const [recalcSubdivisis, setRecalcSubdivisis] = useState<Subdivisi[]>([])
  const [recalcSaving, setRecalcSaving] = useState(false)
  const [recalcResult, setRecalcResult] = useState<{ dibuat: number; diperbarui: number; dilewati: number; total_target: number; total_tanggal: number; message: string } | null>(null)

  const loadRecalcSub = async (divisiId: string) => {
    if (!divisiId) { setRecalcSubdivisis([]); return }
    const r = await fetch(`/api/subdivisi/by-divisi/${divisiId}`)
    setRecalcSubdivisis(await r.json())
  }

  /* ── Deleting ────────────────────────────────────────────────── */
  const [deleting, setDeleting] = useState(false)

  /* ── Add submit ──────────────────────────────────────────────── */
  const handleAddSubmit = async () => {
    const e: Record<string, string> = {}
    if (!addForm.karyawan_id)     e.karyawan_id = "Pilih karyawan"
    if (!addForm.tanggal_absensi) e.tanggal_absensi = "Tanggal wajib diisi"
    if (!addForm.jam_masuk && !addForm.jam_pulang && !addForm.status_absensi) e.jam_masuk = "Jam masuk, jam pulang, atau status wajib diisi"
    if (!addForm.alasan_manual)   e.alasan_manual = "Alasan manual wajib diisi"
    setAddErrors(e); if (Object.keys(e).length) return

    setSaving(true)
    try {
      const res = await fetch("/api/sdm/absensi", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(addForm),
      })
      if (!res.ok) { const j = await res.json(); setAddErrors({ _: j.error ?? "Gagal" }); return }
      setAddOpen(false)
      setAddForm({ karyawan_id: "", tanggal_absensi: today, jadwal_shift_id: "", jam_masuk: "", jam_pulang: "", status_absensi: "", alasan_manual: "", catatan_manual: "" })
      refetch()
    } finally { setSaving(false) }
  }

  /* ── Edit open ───────────────────────────────────────────────── */
  const openEdit = (row: AbsensiRow) => {
    setSelected(row)
    setEditForm({
      jam_masuk:      row.jam_masuk?.slice(0, 5)  ?? "",
      jam_pulang:     row.jam_pulang?.slice(0, 5) ?? "",
      status_absensi: row.status_absensi,
      alasan_manual:  row.alasan_manual  ?? "",
      catatan_manual: row.catatan_manual ?? "",
    })
    setEditErrors({}); setEditOpen(true)
  }

  /* ── Edit submit ─────────────────────────────────────────────── */
  const handleEditSubmit = async () => {
    if (!editForm.alasan_manual) { setEditErrors({ alasan_manual: "Alasan koreksi wajib diisi" }); return }
    setSaving(true)
    try {
      const res = await fetch(`/api/sdm/absensi/${selected!.id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      })
      if (!res.ok) { const j = await res.json(); setEditErrors({ _: j.error ?? "Gagal" }); return }
      setEditOpen(false); refetch()
    } finally { setSaving(false) }
  }

  /* ── Delete ──────────────────────────────────────────────────── */
  const handleDelete = async () => {
    if (!selected) return
    setDeleting(true)
    try {
      await fetch(`/api/sdm/absensi/${selected.id}`, { method: "DELETE" })
      setDeleteOpen(false); refetch()
    } finally { setDeleting(false) }
  }

  /* ── Generate ────────────────────────────────────────────────── */
  const handleGenerate = async () => {
    setGenSaving(true)
    try {
      const res = await fetch("/api/sdm/absensi/generate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tanggal: genTanggal, force_update: genForce }),
      })
      const j = await res.json()
      if (!res.ok) { alert(j.error ?? "Gagal generate"); return }
      setGenResult(j); refetch()
    } finally { setGenSaving(false) }
  }

  const handleRecalculate = async () => {
    if (!recalcForm.tgl_mulai || !recalcForm.tgl_selesai) { alert("Tanggal mulai dan tanggal selesai wajib diisi"); return }
    if (recalcForm.target === "karyawan" && !recalcForm.karyawan_id) { alert("Karyawan wajib dipilih"); return }
    if (recalcForm.target === "divisi" && !recalcForm.divisi_id) { alert("Divisi wajib dipilih"); return }
    if (recalcForm.target === "subdivisi" && !recalcForm.subdivisi_id) { alert("Sub divisi wajib dipilih"); return }

    setRecalcSaving(true)
    try {
      const body: Record<string, unknown> = {
        tgl_mulai: recalcForm.tgl_mulai,
        tgl_selesai: recalcForm.tgl_selesai,
        force_manual: recalcForm.force_manual,
        create_missing: recalcForm.create_missing,
        include_tanpa_jadwal: recalcForm.include_tanpa_jadwal,
      }
      if (recalcForm.target === "karyawan") body.karyawan_id = recalcForm.karyawan_id
      if (recalcForm.target === "divisi") body.divisi_id = recalcForm.divisi_id
      if (recalcForm.target === "subdivisi") body.subdivisi_id = recalcForm.subdivisi_id

      const res = await fetch("/api/sdm/absensi/recalculate", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      })
      const j = await res.json()
      if (!res.ok) { alert(j.error ?? "Gagal hitung ulang absensi"); return }
      setRecalcResult(j); refetch()
    } finally { setRecalcSaving(false) }
  }

  /* ── Stats ringkas ───────────────────────────────────────────── */
  const statsMap = list.reduce((acc, a) => {
    acc[a.status_absensi] = (acc[a.status_absensi] ?? 0) + 1; return acc
  }, {} as Record<string, number>)

  /* ── Karyawan options ────────────────────────────────────────── */
  const karyawanOpts = (karyawans ?? [])
    .filter(k => k.status_karyawan !== "Pensiun" && k.status_karyawan !== "Nonaktif")
    .map(k => ({ value: String(k.id), label: `${k.nik} — ${k.nama_karyawan}`, description: k.jabatan }))

  /* ── Columns ─────────────────────────────────────────────────── */
  const columns: Column<AbsensiRow>[] = [
    {
      key: "karyawan_id", header: "Karyawan",
      cell: (r) => (
        <div>
          <p className="font-semibold text-sm">{r.karyawans?.nama_karyawan ?? "—"}</p>
          <p className="text-xs font-mono" style={{ color: "var(--text-subtle)" }}>{r.karyawans?.nik}</p>
        </div>
      ),
    },
    {
      key: "tanggal_absensi", header: "Tanggal",
      cell: (r) => <span className="font-mono text-sm">{formatDate(r.tanggal_absensi)}</span>,
    },
    {
      key: "jadwal_shift_id", header: "Shift",
      cell: (r) => r.jadwal_shifts?.shift_kerjas
        ? <div><Badge variant="secondary" className="font-mono text-[10px] mr-1">{r.jadwal_shifts.shift_kerjas.kode_shift}</Badge>
            <span className="text-xs font-mono">{r.jadwal_shifts.shift_kerjas.jam_masuk.slice(0,5)}–{r.jadwal_shifts.shift_kerjas.jam_pulang.slice(0,5)}</span></div>
        : <span style={{ color: "var(--text-subtle)" }}>—</span>,
    },
    {
      key: "jam_masuk", header: "Masuk / Pulang",
      cell: (r) => (
        <div className="font-mono text-sm">
          <span style={{ color: r.jam_masuk ? "var(--text-900)" : "var(--text-subtle)" }}>{r.jam_masuk?.slice(0,5) ?? "—"}</span>
          <span className="mx-1" style={{ color: "var(--text-subtle)" }}>/</span>
          <span style={{ color: r.jam_pulang ? "var(--text-900)" : "var(--text-subtle)" }}>{r.jam_pulang?.slice(0,5) ?? "—"}</span>
        </div>
      ),
    },
    {
      key: "status_absensi", header: "Status",
      cell: (r) => (
        <div className="space-y-1">
          <div className="flex items-center gap-1.5">
            <Badge variant={STATUS_ABSENSI_BADGE[r.status_absensi as StatusAbsensi] as "success" | "warning" | "destructive" | "secondary" | "info"}>
              {STATUS_ABSENSI_LABELS[r.status_absensi as StatusAbsensi] ?? r.status_absensi}
            </Badge>
            {r.is_manual && <AlertTriangle className="h-3 w-3" style={{ color: "var(--warning)" }} />}
          </div>
          {getFlagLabels(r).length > 0 && (
            <div className="flex flex-wrap gap-1">
              {getFlagLabels(r).map(flag => <Badge key={flag} variant="secondary" className="text-[10px]">{flag}</Badge>)}
            </div>
          )}
        </div>
      ),
    },
    {
      key: "menit_terlambat", header: "Terlambat",
      cell: (r) => <span className="text-xs" style={{ color: r.menit_terlambat > 0 ? "var(--danger)" : "var(--text-subtle)" }}>{formatMenit(r.menit_terlambat)}</span>,
    },
    {
      key: "total_jam_kerja_menit", header: "Jam Kerja",
      cell: (r) => <span className="text-xs font-mono">{formatMenit(r.total_jam_kerja_menit)}</span>,
    },
  ]

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--text-900)" }}>Monitoring Absensi</h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-subtle)" }}>
            Input manual, koreksi, dan monitoring absensi pegawai
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={refetch}><RefreshCw className="h-3.5 w-3.5" /></Button>
          <Link href="/dashboard/sdm/absensi/bulanan">
            <Button variant="outline" size="sm"><CalendarDays className="h-3.5 w-3.5 mr-1.5" />Absensi Bulanan</Button>
          </Link>
          <Button variant="secondary" size="sm" onClick={() => { setGenResult(null); setGenOpen(true) }}>
            <Play className="h-3.5 w-3.5 mr-1.5" />Generate Absensi
          </Button>
          <Button variant="outline" size="sm" onClick={() => { setRecalcResult(null); setRecalcOpen(true) }}>
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />Recalculate
          </Button>
          <Button size="sm" onClick={() => { setAddErrors({}); setAddOpen(true) }}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />Input Manual
          </Button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="rounded-xl p-4 space-y-3" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-subtle)" }}>Tanggal</label>
            <input type="date" value={filter.tanggal} className="h-8 w-full rounded-lg px-3 text-sm"
              style={{ border: "1px solid var(--border-strong)", background: "var(--surface)", color: "var(--text-900)" }}
              onChange={e => setFilter(f => ({ ...f, tanggal: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-subtle)" }}>Divisi</label>
            <select value={filter.divisi_id} className="h-8 w-full rounded-lg px-3 text-sm cursor-pointer"
              style={{ border: "1px solid var(--border-strong)", background: "var(--surface)", color: "var(--text-900)" }}
              onChange={e => { setFilter(f => ({ ...f, divisi_id: e.target.value, subdivisi_id: "" })); loadSub(e.target.value) }}>
              <option value="">— Semua Divisi</option>
              {(divisis ?? []).map(d => <option key={d.id} value={d.id}>{d.nama_divisi}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-subtle)" }}>Sub Divisi</label>
            <select value={filter.subdivisi_id} className="h-8 w-full rounded-lg px-3 text-sm cursor-pointer"
              style={{ border: "1px solid var(--border-strong)", background: "var(--surface)", color: "var(--text-900)" }}
              onChange={e => setFilter(f => ({ ...f, subdivisi_id: e.target.value }))}>
              <option value="">— Semua</option>
              {subdivisis.map(s => <option key={s.id} value={s.id}>{s.nama_sub}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-subtle)" }}>Status</label>
            <select value={filter.status} className="h-8 w-full rounded-lg px-3 text-sm cursor-pointer"
              style={{ border: "1px solid var(--border-strong)", background: "var(--surface)", color: "var(--text-900)" }}
              onChange={e => setFilter(f => ({ ...f, status: e.target.value }))}>
              <option value="">— Semua Status</option>
              {STATUS_LIST.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          <div className="flex items-end">
            <Button variant="outline" size="sm" className="w-full"
              onClick={() => setFilter({ tanggal: today, divisi_id: "", subdivisi_id: "", status: "", karyawan_id: "" })}>
              Reset Filter
            </Button>
          </div>
        </div>
      </div>

      {/* Stats strip */}
      <div className="flex gap-2 flex-wrap">
        {[
          { label: "Total", value: list.length, color: "var(--primary)" },
          { label: "Hadir",     value: statsMap["hadir"] ?? 0,              color: "var(--success)" },
          { label: "Terlambat", value: statsMap["terlambat"] ?? 0,          color: "var(--warning)" },
          { label: "Luar Jam",  value: statsMap["di_luar_jam_absen"] ?? 0,  color: "var(--warning)" },
          { label: "Alpha",     value: statsMap["alpha"] ?? 0,              color: "var(--danger)" },
          { label: "Lainnya",   value: list.length - ((statsMap["hadir"] ?? 0) + (statsMap["terlambat"] ?? 0) + (statsMap["di_luar_jam_absen"] ?? 0) + (statsMap["alpha"] ?? 0)), color: "var(--text-subtle)" },
        ].map(s => (
          <div key={s.label} className="rounded-lg px-4 py-2 flex items-center gap-2"
            style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
            <span className="text-xs" style={{ color: "var(--text-subtle)" }}>{s.label}</span>
            <span className="text-base font-bold font-mono" style={{ color: s.color }}>{s.value}</span>
          </div>
        ))}
      </div>

      {/* Table */}
      <DataTable
        data={list as unknown as Record<string, unknown>[]}
        columns={columns as unknown as Column<Record<string, unknown>>[]}
        searchKeys={["tanggal_absensi"]}
        loading={loading}
        emptyMessage={`Tidak ada data absensi pada ${filter.tanggal ? formatDate(filter.tanggal) : "periode ini"}`}
        actions={(row: Record<string, unknown>) => {
          const r = row as unknown as AbsensiRow
          return (
            <div className="flex items-center justify-center gap-1">
              <Button variant="ghost" size="icon" className="h-7 w-7" title="Detail"
                style={{ color: "var(--primary)" }} onClick={() => { setSelected(r); setDetailOpen(true) }}>
                <Eye className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" title="Koreksi"
                style={{ color: "var(--warning)" }} onClick={() => openEdit(r)}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" title="Hapus"
                style={{ color: "var(--danger)" }} onClick={() => { setSelected(r); setDeleteOpen(true) }}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          )
        }}
      />

      {/* ── Modal: Input Manual ──────────────────────────────────── */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Input Absensi Manual" size="lg"
        footer={<><Button variant="outline" onClick={() => setAddOpen(false)}>Batal</Button><Button onClick={handleAddSubmit} disabled={saving}>{saving ? "Menyimpan..." : "Simpan"}</Button></>}
      >
        {addErrors._ && <div className="mb-4 rounded-lg px-4 py-3 text-sm" style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>{addErrors._}</div>}
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Karyawan <span style={{ color: "var(--danger)" }}>*</span></label>
            <SearchableSelect label="" options={karyawanOpts} value={addForm.karyawan_id}
              onChange={(v: string) => setAddForm(f => ({ ...f, karyawan_id: v }))} placeholder="Pilih karyawan..." />
            {addErrors.karyawan_id && <p className="text-xs" style={{ color: "var(--danger)" }}>{addErrors.karyawan_id}</p>}
          </div>
          <TextField label="Tanggal Absensi" required error={addErrors.tanggal_absensi}
            type="date" value={addForm.tanggal_absensi}
            onChange={e => setAddForm(f => ({ ...f, tanggal_absensi: e.target.value }))} />
          <div className="grid grid-cols-2 gap-4">
            <TextField label="Jam Masuk" error={addErrors.jam_masuk}
              type="time" value={addForm.jam_masuk}
              onChange={e => setAddForm(f => ({ ...f, jam_masuk: e.target.value }))} />
            <TextField label="Jam Pulang"
              type="time" value={addForm.jam_pulang}
              onChange={e => setAddForm(f => ({ ...f, jam_pulang: e.target.value }))} />
          </div>
          <SelectField label="Override Status (opsional)" placeholder="— Otomatis dihitung —"
            value={addForm.status_absensi}
            options={STATUS_LIST}
            onChange={e => setAddForm(f => ({ ...f, status_absensi: e.target.value }))} />
          <TextField label="Alasan Manual" required error={addErrors.alasan_manual}
            value={addForm.alasan_manual} placeholder="Contoh: Input susulan karena sistem offline"
            onChange={e => setAddForm(f => ({ ...f, alasan_manual: e.target.value }))} />
          <TextareaField label="Catatan Tambahan"
            value={addForm.catatan_manual}
            onChange={e => setAddForm(f => ({ ...f, catatan_manual: e.target.value }))} />
        </div>
      </Modal>

      {/* ── Modal: Koreksi ───────────────────────────────────────── */}
      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Koreksi Absensi" size="lg"
        footer={<><Button variant="outline" onClick={() => setEditOpen(false)}>Batal</Button><Button onClick={handleEditSubmit} disabled={saving}>{saving ? "Menyimpan..." : "Simpan Koreksi"}</Button></>}
      >
        {editErrors._ && <div className="mb-4 rounded-lg px-4 py-3 text-sm" style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>{editErrors._}</div>}
        {selected && (
          <div className="mb-4 rounded-lg px-4 py-3" style={{ background: "var(--surface-muted)", border: "1px solid var(--border)" }}>
            <p className="font-semibold text-sm">{selected.karyawans?.nama_karyawan}</p>
            <p className="text-xs mt-0.5" style={{ color: "var(--text-subtle)" }}>
              {selected.karyawans?.nik} · {formatDate(selected.tanggal_absensi)} · Status saat ini: <strong>{STATUS_ABSENSI_LABELS[selected.status_absensi as StatusAbsensi] ?? selected.status_absensi}</strong>
            </p>
          </div>
        )}
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <TextField label="Jam Masuk" type="time" value={editForm.jam_masuk}
              onChange={e => setEditForm(f => ({ ...f, jam_masuk: e.target.value }))} />
            <TextField label="Jam Pulang" type="time" value={editForm.jam_pulang}
              onChange={e => setEditForm(f => ({ ...f, jam_pulang: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
              Override Status
            </label>
            <SelectField label="" placeholder="— Hitung Ulang Otomatis (dari jam masuk/pulang) —"
              value={editForm.status_absensi} options={STATUS_LIST}
              onChange={e => setEditForm(f => ({ ...f, status_absensi: e.target.value }))} />
            <p className="text-xs" style={{ color: "var(--text-subtle)" }}>
              Kosongkan untuk menghitung ulang status berdasarkan jam masuk &amp; pulang yang diisi di atas.
            </p>
          </div>
          <TextField label="Alasan Koreksi" required error={editErrors.alasan_manual}
            value={editForm.alasan_manual} placeholder="Wajib diisi untuk setiap koreksi"
            onChange={e => setEditForm(f => ({ ...f, alasan_manual: e.target.value }))} />
          <TextareaField label="Catatan"
            value={editForm.catatan_manual}
            onChange={e => setEditForm(f => ({ ...f, catatan_manual: e.target.value }))} />
        </div>
      </Modal>

      {/* ── Modal: Detail ────────────────────────────────────────── */}
      <Modal open={detailOpen} onClose={() => setDetailOpen(false)} title="Detail Absensi" size="md"
        footer={<Button onClick={() => setDetailOpen(false)}>Tutup</Button>}
      >
        {selected && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Karyawan",    value: selected.karyawans?.nama_karyawan ?? "—" },
                { label: "NIK",         value: selected.karyawans?.nik ?? "—" },
                { label: "Tanggal",     value: formatDate(selected.tanggal_absensi) },
                { label: "Shift",       value: selected.jadwal_shifts?.shift_kerjas?.nama_shift ?? "Tidak ada jadwal" },
                { label: "Jam Shift",   value: selected.jadwal_shifts?.shift_kerjas ? `${selected.jadwal_shifts.shift_kerjas.jam_masuk.slice(0,5)} – ${selected.jadwal_shifts.shift_kerjas.jam_pulang.slice(0,5)}` : "—" },
                { label: "Jam Masuk",   value: selected.jam_masuk?.slice(0,5) ?? "—" },
                { label: "Jam Pulang",  value: selected.jam_pulang?.slice(0,5) ?? "—" },
                { label: "Total Kerja", value: (() => { const j = Math.floor(selected.total_jam_kerja_menit/60); const m = selected.total_jam_kerja_menit%60; return selected.total_jam_kerja_menit ? `${j}j ${m}m` : "—" })() },
                { label: "Terlambat",   value: selected.menit_terlambat ? `${selected.menit_terlambat} mnt` : "—" },
                { label: "Pulang Cepat",value: selected.menit_pulang_cepat ? `${selected.menit_pulang_cepat} mnt` : "—" },
              ].map(item => (
                <div key={item.label} className="rounded-lg p-3" style={{ background: "var(--surface-muted)", border: "1px solid var(--border)" }}>
                  <p className="text-xs" style={{ color: "var(--text-subtle)" }}>{item.label}</p>
                  <p className="text-sm font-semibold mt-0.5" style={{ color: "var(--text-900)" }}>{item.value}</p>
                </div>
              ))}
            </div>
            <div className="rounded-lg p-3 flex items-center gap-3" style={{ background: "var(--surface-muted)", border: "1px solid var(--border)" }}>
              <div>
                <p className="text-xs" style={{ color: "var(--text-subtle)" }}>Status Akhir</p>
                <div className="mt-1">
                  <Badge variant={STATUS_ABSENSI_BADGE[selected.status_absensi as StatusAbsensi] as "success" | "warning" | "destructive" | "secondary" | "info"} className="text-sm px-3 py-1">
                    {STATUS_ABSENSI_LABELS[selected.status_absensi as StatusAbsensi] ?? selected.status_absensi}
                  </Badge>
                </div>
                {getFlagLabels(selected).length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {getFlagLabels(selected).map(flag => <Badge key={flag} variant="secondary" className="text-[10px]">{flag}</Badge>)}
                  </div>
                )}
              </div>
            </div>
            {(selected.alasan_manual || selected.catatan_manual) && (
              <div className="rounded-lg p-3" style={{ background: "var(--surface-muted)", border: "1px solid var(--border)" }}>
                {selected.alasan_manual && <p className="text-xs"><strong>Alasan:</strong> {selected.alasan_manual}</p>}
                {selected.catatan_manual && <p className="text-xs mt-1"><strong>Catatan:</strong> {selected.catatan_manual}</p>}
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* ── Modal: Generate Absensi ──────────────────────────────── */}
      <Modal open={genOpen} onClose={() => setGenOpen(false)} title="Generate Status Absensi Harian" size="sm"
        footer={
          genResult
            ? <Button onClick={() => setGenOpen(false)}>Tutup</Button>
            : <><Button variant="outline" onClick={() => setGenOpen(false)}>Batal</Button><Button onClick={handleGenerate} disabled={genSaving}>{genSaving ? "Memproses..." : "Generate Sekarang"}</Button></>
        }
      >
        {genResult ? (
          <div className="text-center py-4 space-y-3">
            <div className="text-4xl font-bold" style={{ color: "var(--success)" }}>{genResult.dibuat + genResult.diperbarui}</div>
            <p className="text-sm font-semibold" style={{ color: "var(--text-900)" }}>Absensi diproses</p>
            <p className="text-sm" style={{ color: "var(--text-subtle)" }}>{genResult.message}</p>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm" style={{ color: "var(--text-subtle)" }}>
              Generate status absensi awal (alpha) untuk semua pegawai yang memiliki jadwal kerja pada tanggal yang dipilih.
            </p>
            <TextField label="Tanggal" required type="date" value={genTanggal}
              onChange={e => setGenTanggal(e.target.value)} />
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={genForce}
                onChange={e => setGenForce(e.target.checked)}
                className="h-4 w-4" style={{ accentColor: "var(--primary)" }} />
              <span className="text-sm" style={{ color: "var(--text-900)" }}>
                Force update (timpa data manual yang sudah ada)
              </span>
            </label>
            {genForce && (
              <div className="rounded-lg px-3 py-2 text-xs" style={{ background: "rgba(239,68,68,0.1)", color: "var(--danger)", border: "1px solid rgba(239,68,68,0.3)" }}>
                ⚠ Force update akan menimpa data absensi yang sudah dikoreksi manual oleh HRD!
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* ── Modal: Recalculate Absensi ───────────────────────────── */}
      <Modal open={recalcOpen} onClose={() => setRecalcOpen(false)} title="Recalculate Absensi" size="lg"
        footer={
          recalcResult
            ? <Button onClick={() => setRecalcOpen(false)}>Tutup</Button>
            : <><Button variant="outline" onClick={() => setRecalcOpen(false)}>Batal</Button><Button onClick={handleRecalculate} disabled={recalcSaving}>{recalcSaving ? "Memproses..." : "Hitung Ulang"}</Button></>
        }
      >
        {recalcResult ? (
          <div className="text-center py-4 space-y-3">
            <div className="text-4xl font-bold" style={{ color: "var(--success)" }}>{recalcResult.dibuat + recalcResult.diperbarui}</div>
            <p className="text-sm font-semibold" style={{ color: "var(--text-900)" }}>Absensi dihitung ulang</p>
            <p className="text-sm" style={{ color: "var(--text-subtle)" }}>{recalcResult.message}</p>
            <p className="text-xs" style={{ color: "var(--text-subtle)" }}>Target: {recalcResult.total_target} karyawan · {recalcResult.total_tanggal} tanggal</p>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm" style={{ color: "var(--text-subtle)" }}>
              Hitung ulang status absensi berdasarkan jadwal terbaru, jam masuk/pulang existing, hari libur, serta cuti/izin/sakit approved. Secara default data manual tidak ditimpa.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <TextField label="Tanggal Mulai" required type="date" value={recalcForm.tgl_mulai}
                onChange={e => setRecalcForm(f => ({ ...f, tgl_mulai: e.target.value }))} />
              <TextField label="Tanggal Selesai" required type="date" value={recalcForm.tgl_selesai}
                onChange={e => setRecalcForm(f => ({ ...f, tgl_selesai: e.target.value }))} />
            </div>

            <SelectField label="Target" value={recalcForm.target}
              options={[
                { value: "all", label: "Semua karyawan aktif" },
                { value: "karyawan", label: "Satu karyawan" },
                { value: "divisi", label: "Per divisi" },
                { value: "subdivisi", label: "Per sub divisi" },
              ]}
              onChange={e => setRecalcForm(f => ({ ...f, target: e.target.value, karyawan_id: "", divisi_id: "", subdivisi_id: "" }))} />

            {recalcForm.target === "karyawan" && (
              <SearchableSelect label="Karyawan" required options={karyawanOpts} value={recalcForm.karyawan_id}
                onChange={(v: string) => setRecalcForm(f => ({ ...f, karyawan_id: v }))} placeholder="Pilih karyawan..." />
            )}
            {recalcForm.target === "divisi" && (
              <SelectField label="Divisi" required value={recalcForm.divisi_id}
                placeholder="— Pilih Divisi —"
                options={(divisis ?? []).map(d => ({ value: String(d.id), label: d.nama_divisi }))}
                onChange={e => setRecalcForm(f => ({ ...f, divisi_id: e.target.value }))} />
            )}
            {recalcForm.target === "subdivisi" && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <SelectField label="Divisi" required value={recalcForm.divisi_id}
                  placeholder="— Pilih Divisi —"
                  options={(divisis ?? []).map(d => ({ value: String(d.id), label: d.nama_divisi }))}
                  onChange={e => { setRecalcForm(f => ({ ...f, divisi_id: e.target.value, subdivisi_id: "" })); loadRecalcSub(e.target.value) }} />
                <SelectField label="Sub Divisi" required value={recalcForm.subdivisi_id}
                  placeholder="— Pilih Sub Divisi —"
                  options={recalcSubdivisis.map(s => ({ value: String(s.id), label: s.nama_sub }))}
                  onChange={e => setRecalcForm(f => ({ ...f, subdivisi_id: e.target.value }))} />
              </div>
            )}

            <div className="space-y-2 rounded-lg p-3" style={{ background: "var(--surface-muted)", border: "1px solid var(--border)" }}>
              {[
                { key: "create_missing", label: "Buat absensi yang belum ada" },
                { key: "include_tanpa_jadwal", label: "Proses juga karyawan tanpa jadwal" },
                { key: "force_manual", label: "Timpa data manual/koreksi HRD" },
              ].map(item => (
                <label key={item.key} className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={Boolean(recalcForm[item.key as keyof typeof recalcForm])}
                    onChange={e => setRecalcForm(f => ({ ...f, [item.key]: e.target.checked }))}
                    className="h-4 w-4" style={{ accentColor: "var(--primary)" }} />
                  <span className="text-sm" style={{ color: item.key === "force_manual" && recalcForm.force_manual ? "var(--danger)" : "var(--text-900)" }}>{item.label}</span>
                </label>
              ))}
            </div>
          </div>
        )}
      </Modal>

      {/* ── Confirm Delete ───────────────────────────────────────── */}
      <ConfirmDelete open={deleteOpen} onClose={() => setDeleteOpen(false)}
        onConfirm={handleDelete} loading={deleting}
        description={`Hapus data absensi ${selected?.karyawans?.nama_karyawan ?? ""} pada ${selected?.tanggal_absensi ? formatDate(selected.tanggal_absensi) : ""}?`}
      />
    </div>
  )
}

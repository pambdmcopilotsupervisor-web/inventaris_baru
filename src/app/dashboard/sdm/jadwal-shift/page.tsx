"use client"
import React, { useState, useMemo } from "react"
import { DataTable, Column } from "@/components/ui/data-table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Modal } from "@/components/ui/modal"
import { ConfirmDelete } from "@/components/ui/confirm-delete"
import { TextField, SelectField, TextareaField } from "@/components/ui/form-field"
import { SearchableSelect } from "@/components/ui/searchable-select"
import {
  Plus, Pencil, Trash2, RefreshCw, Calendar, Users,
  ChevronLeft, ChevronRight, List,
} from "lucide-react"
import { formatDate, formatDateLong } from "@/lib/utils"
import { useApi } from "@/hooks/useApi"

/* ─── Types ─────────────────────────────────────────────────────── */
interface Shift {
  id: number; kode_shift: string; nama_shift: string
  jam_masuk: string; jam_pulang: string; is_lintas_hari: boolean; status: string
}
interface Karyawan {
  id: number; nik: string; nama_karyawan: string; jabatan: string
  divisi_id: number | null; subdivisi_id: number | null; status_karyawan: string | null
}
interface Divisi    { id: number; kode_divisi: string; nama_divisi: string }
interface Subdivisi { id: number; kode_sub: string; nama_sub: string; divisi_id: number }
interface JadwalRow {
  id: number; karyawan_id: number; shift_id: number; tanggal: string; keterangan: string | null
  karyawans?: { id: number; nik: string; nama_karyawan: string; jabatan: string; divisi_id: number | null }
  shift_kerjas?: { id: number; kode_shift: string; nama_shift: string; jam_masuk: string; jam_pulang: string; is_lintas_hari: boolean }
}

const HARI = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"]
const HARI_FULL = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"]

/** Ambil string tanggal "YYYY-MM-DD" dari komponen lokal — aman di semua timezone */
function isoDate(d: Date): string {
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-")
}
function addDays(d: Date, n: number): Date { const r = new Date(d); r.setDate(r.getDate() + n); return r }

/* ─── Calendar View ──────────────────────────────────────────────── */
function CalendarView({
  year, month, jadwals, onCellClick,
}: {
  year: number; month: number
  jadwals: JadwalRow[]
  onCellClick: (date: string) => void
}) {
  const firstDay = new Date(year, month, 1)
  const startDow = firstDay.getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells = Array.from({ length: startDow + daysInMonth }, (_, i) =>
    i < startDow ? null : new Date(year, month, i - startDow + 1)
  )

  const byDate = useMemo(() => {
    const m = new Map<string, JadwalRow[]>()
    jadwals.forEach(j => {
      // Prisma mengembalikan tanggal sebagai UTC ISO string — ambil bagian tanggal UTC-nya
      // lalu konversi ke representasi lokal agar cocok dengan isoDate(cell)
      const raw = j.tanggal.slice(0, 10)          // "2026-06-06" dari UTC ISO
      // Buat Date dari UTC string, lalu ambil komponen lokal (UTC+7: hasilnya sama)
      const d = new Date(raw + "T12:00:00Z")       // pakai tengah hari UTC → aman di semua timezone ±12
      const key = isoDate(d)
      if (!m.has(key)) m.set(key, [])
      m.get(key)!.push(j)
    })
    return m
  }, [jadwals])

  const today = isoDate(new Date())

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)", background: "var(--surface)" }}>
      {/* Day headers */}
      <div className="grid grid-cols-7">
        {HARI.map(h => (
          <div key={h} className="py-2 text-center text-[11px] font-semibold uppercase tracking-wide"
            style={{ color: "var(--text-subtle)", borderBottom: "1px solid var(--border)", background: "var(--surface-muted)" }}>
            {h}
          </div>
        ))}
      </div>
      {/* Days */}
      <div className="grid grid-cols-7">
        {cells.map((date, i) => {
          if (!date) return <div key={i} className="min-h-[80px]" style={{ background: "var(--surface-muted)", borderRight: "1px solid var(--border)", borderBottom: "1px solid var(--border)" }} />
          const iso = isoDate(date)
          const entries = byDate.get(iso) ?? []
          const isToday = iso === today
          return (
            <div key={i} className="min-h-[80px] p-1.5 cursor-pointer transition-colors duration-100"
              style={{ borderRight: "1px solid var(--border)", borderBottom: "1px solid var(--border)" }}
              onClick={() => onCellClick(iso)}
              onMouseEnter={e => (e.currentTarget.style.background = "var(--surface-hover)")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >
              <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${isToday ? "text-white" : ""}`}
                style={isToday ? { background: "var(--primary)" } : { color: "var(--text-900)" }}>
                {date.getDate()}
              </span>
              <div className="mt-1 space-y-0.5">
                {entries.slice(0, 3).map((e, j) => (
                  <div key={j} className="rounded px-1 py-0.5 text-[10px] font-medium truncate"
                    style={{ background: "var(--primary-light)", color: "var(--primary)" }}>
                    {e.karyawans?.nama_karyawan?.split(" ")[0]} · {e.shift_kerjas?.kode_shift}
                  </div>
                ))}
                {entries.length > 3 && (
                  <div className="text-[10px]" style={{ color: "var(--text-subtle)" }}>+{entries.length - 3} lainnya</div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ─── Main Page ──────────────────────────────────────────────────── */
export default function JadwalShiftPage() {
  const today = new Date()
  const [viewMode, setViewMode]  = useState<"list" | "calendar">("list")
  const [calYear, setCalYear]    = useState(today.getFullYear())
  const [calMonth, setCalMonth]  = useState(today.getMonth())

  // State: modal daftar pegawai saat klik sel kalender
  const [dateDetailOpen, setDateDetailOpen] = useState(false)
  const [dateDetailDate, setDateDetailDate] = useState("")

  // Filter state (client-side pada data yang sudah di-fetch)
  const [filterSearch, setFilterSearch]     = useState("")
  const [filterShiftId, setFilterShiftId]   = useState("")
  const [filterDivisiId, setFilterDivisiId] = useState("")

  // Rentang tanggal untuk fetch (bulan kalender atau 30 hari ke depan untuk list)
  const tglMulai   = isoDate(new Date(calYear, calMonth, 1))
  const tglSelesai = isoDate(new Date(calYear, calMonth + 1, 0))

  const { data: jadwals,   loading,  refetch } = useApi<JadwalRow[]>(
    `/api/sdm/jadwal-shift?tgl_mulai=${tglMulai}&tgl_selesai=${tglSelesai}`,
    [tglMulai, tglSelesai],
  )
  const { data: shifts }    = useApi<Shift[]>("/api/sdm/shift")
  const { data: karyawans } = useApi<Karyawan[]>("/api/karyawan")
  const { data: divisis }   = useApi<Divisi[]>("/api/divisi")

  const rawList     = jadwals ?? []
  const shiftList   = (shifts ?? []).filter(s => s.status === "aktif")
  const karyawanList = karyawans ?? []

  // ── Filter client-side ─────────────────────────────────────────
  const list = useMemo(() => {
    let data = rawList
    if (filterSearch) {
      const q = filterSearch.toLowerCase()
      data = data.filter(j =>
        j.karyawans?.nama_karyawan?.toLowerCase().includes(q) ||
        j.karyawans?.nik?.toLowerCase().includes(q) ||
        j.karyawans?.jabatan?.toLowerCase().includes(q)
      )
    }
    if (filterShiftId) {
      data = data.filter(j => String(j.shift_id) === filterShiftId)
    }
    if (filterDivisiId) {
      data = data.filter(j => String(j.karyawans?.divisi_id) === filterDivisiId)
    }
    return data
  }, [rawList, filterSearch, filterShiftId, filterDivisiId])

  /* ── Single Add state ──────────────────────────────────────────── */
  const [addOpen, setAddOpen]     = useState(false)
  const [editOpen, setEditOpen]   = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [selected, setSelected]   = useState<JadwalRow | null>(null)
  const [addForm, setAddForm]     = useState({ karyawan_id: "", shift_id: "", tanggal: "", keterangan: "" })
  const [editForm, setEditForm]   = useState({ shift_id: "", tanggal: "", keterangan: "" })
  const [saving, setSaving]       = useState(false)
  const [deleting, setDeleting]   = useState(false)
  const [addErrors, setAddErrors] = useState<Record<string, string>>({})
  const [editErrors, setEditErrors] = useState<Record<string, string>>({})

  /* ── Assign Massal state ─────────────────────────────────────────── */
  const [massalOpen, setMassalOpen] = useState(false)
  const [massalForm, setMassalForm] = useState({
    shift_id: "", tgl_mulai: tglMulai, tgl_selesai: tglSelesai,
    mode: "karyawan" as "karyawan" | "divisi" | "subdivisi",
    karyawan_id: "", divisi_id: "", subdivisi_id: "",
    excludeHariLibur: true, excludeHari: [0] as number[],
  })
  const [massalSaving, setMassalSaving] = useState(false)
  const [massalErrors, setMassalErrors] = useState<Record<string, string>>({})
  const [massalResult, setMassalResult] = useState<{ dibuat: number; diperbarui: number; dihapus?: number; gagal?: number; message: string } | null>(null)

  // Subdivisi options tergantung divisi terpilih di form massal
  const [subdivisiOptions, setSubdivisiOptions] = useState<Subdivisi[]>([])
  const loadSubdivisi = async (divisiId: string) => {
    if (!divisiId) { setSubdivisiOptions([]); return }
    const res = await fetch(`/api/subdivisi/by-divisi/${divisiId}`)
    const d = await res.json()
    setSubdivisiOptions(d)
  }

  /* ── Single Add ─────────────────────────────────────────────────── */
  const handleAddSubmit = async () => {
    const e: Record<string, string> = {}
    if (!addForm.karyawan_id) e.karyawan_id = "Pilih karyawan"
    if (!addForm.shift_id)    e.shift_id    = "Pilih shift"
    if (!addForm.tanggal)     e.tanggal     = "Pilih tanggal"
    setAddErrors(e); if (Object.keys(e).length) return

    setSaving(true)
    try {
      const res = await fetch("/api/sdm/jadwal-shift", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(addForm),
      })
      if (!res.ok) { const j = await res.json(); setAddErrors({ _: j.error ?? "Gagal" }); return }
      setAddOpen(false)
      setAddForm({ karyawan_id: "", shift_id: "", tanggal: "", keterangan: "" })
      refetch()
    } finally { setSaving(false) }
  }

  /* ── Edit ───────────────────────────────────────────────────────── */
  const openEdit = (row: JadwalRow) => {
    setSelected(row)
    setEditForm({ shift_id: String(row.shift_id), tanggal: row.tanggal.slice(0, 10), keterangan: row.keterangan ?? "" })
    setEditErrors({}); setEditOpen(true)
  }
  const handleEditSubmit = async () => {
    const e: Record<string, string> = {}
    if (!editForm.shift_id) e.shift_id = "Pilih shift"
    if (!editForm.tanggal)  e.tanggal  = "Pilih tanggal"
    setEditErrors(e); if (Object.keys(e).length) return

    setSaving(true)
    try {
      const res = await fetch(`/api/sdm/jadwal-shift/${selected!.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      })
      if (!res.ok) { const j = await res.json(); setEditErrors({ _: j.error ?? "Gagal" }); return }
      setEditOpen(false); refetch()
    } finally { setSaving(false) }
  }

  /* ── Delete ─────────────────────────────────────────────────────── */
  const handleDelete = async () => {
    if (!selected) return
    setDeleting(true)
    try {
      await fetch(`/api/sdm/jadwal-shift/${selected.id}`, { method: "DELETE" })
      setDeleteOpen(false); refetch()
    } finally { setDeleting(false) }
  }

  /* ── Assign Massal ──────────────────────────────────────────────── */
  const handleMassalSubmit = async () => {
    const e: Record<string, string> = {}
    if (!massalForm.shift_id)   e.shift_id   = "Pilih shift"
    if (!massalForm.tgl_mulai)  e.tgl_mulai  = "Tanggal mulai wajib diisi"
    if (!massalForm.tgl_selesai) e.tgl_selesai = "Tanggal selesai wajib diisi"
    if (massalForm.tgl_selesai < massalForm.tgl_mulai) e.tgl_selesai = "Tanggal selesai tidak boleh lebih kecil dari tanggal mulai"
    if (massalForm.mode === "karyawan"  && !massalForm.karyawan_id) e.karyawan_id = "Pilih karyawan"
    if (massalForm.mode === "divisi"    && !massalForm.divisi_id)   e.divisi_id   = "Pilih divisi"
    if (massalForm.mode === "subdivisi" && !massalForm.subdivisi_id) e.subdivisi_id = "Pilih sub divisi"
    setMassalErrors(e); if (Object.keys(e).length) return

    const payload: Record<string, unknown> = {
      shift_id:          Number(massalForm.shift_id),
      tgl_mulai:         massalForm.tgl_mulai,
      tgl_selesai:       massalForm.tgl_selesai,
      excludeHariLibur:  massalForm.excludeHariLibur,
      excludeHari:       massalForm.excludeHari,
    }
    if (massalForm.mode === "karyawan")   payload.karyawan_ids = [Number(massalForm.karyawan_id)]
    if (massalForm.mode === "divisi")     payload.divisi_id    = Number(massalForm.divisi_id)
    if (massalForm.mode === "subdivisi")  payload.subdivisi_id = Number(massalForm.subdivisi_id)

    setMassalSaving(true)
    try {
      const res = await fetch("/api/sdm/jadwal-shift/assign-massal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const j = await res.json()
      if (!res.ok) { setMassalErrors({ _: j.error ?? "Gagal assign" }); return }
      setMassalResult(j)
      refetch()
    } finally { setMassalSaving(false) }
  }

  /* ── Calendar nav ───────────────────────────────────────────────── */
  const prevMonth = () => { if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1) } else setCalMonth(m => m - 1) }
  const nextMonth = () => { if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1) } else setCalMonth(m => m + 1) }
  const BULAN_ID = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"]

  /* ── Table columns ──────────────────────────────────────────────── */
  const columns: Column<JadwalRow>[] = [
    {
      key: "tanggal", header: "Tanggal",
      cell: (r) => (
        <div>
          <p className="font-semibold text-sm">{formatDate(r.tanggal)}</p>
          <p className="text-xs" style={{ color: "var(--text-subtle)" }}>
            {HARI_FULL[new Date(r.tanggal).getDay()]}
          </p>
        </div>
      ),
    },
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
      key: "shift_id", header: "Shift",
      cell: (r) => r.shift_kerjas ? (
        <div>
          <Badge variant="secondary" className="font-mono mr-1">{r.shift_kerjas.kode_shift}</Badge>
          <span className="text-sm">{r.shift_kerjas.nama_shift}</span>
          <p className="text-xs mt-0.5 font-mono" style={{ color: "var(--text-subtle)" }}>
            {r.shift_kerjas.jam_masuk.slice(0, 5)} – {r.shift_kerjas.jam_pulang.slice(0, 5)}
            {r.shift_kerjas.is_lintas_hari && <span className="ml-1" style={{ color: "var(--primary)" }}>+1h</span>}
          </p>
        </div>
      ) : "—",
    },
    {
      key: "keterangan", header: "Keterangan",
      cell: (r) => <span style={{ color: "var(--text-subtle)" }}>{r.keterangan ?? "—"}</span>,
    },
  ]

  /* ── Karyawan options for SearchableSelect ───────────────────────── */
  const karyawanOptions = karyawanList
    .filter(k => k.status_karyawan !== "Pensiun" && k.status_karyawan !== "Nonaktif")
    .map(k => ({ value: String(k.id), label: `${k.nik} — ${k.nama_karyawan}`, description: k.jabatan }))

  const shiftOptions = shiftList.map(s => ({
    value: String(s.id),
    label: `${s.kode_shift} — ${s.nama_shift}`,
    description: `${s.jam_masuk.slice(0, 5)} – ${s.jam_pulang.slice(0, 5)}${s.is_lintas_hari ? " (+1 hari)" : ""}`,
  }))

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--text-900)" }}>Jadwal Kerja Pegawai</h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-subtle)" }}>
            {BULAN_ID[calMonth]} {calYear} · {list.length} jadwal
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {/* Navigasi bulan */}
          <div className="flex items-center gap-1 rounded-lg" style={{ border: "1px solid var(--border)", padding: "2px" }}>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={prevMonth}><ChevronLeft className="h-4 w-4" /></Button>
            <span className="px-2 text-sm font-semibold" style={{ color: "var(--text-900)" }}>{BULAN_ID[calMonth]} {calYear}</span>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={nextMonth}><ChevronRight className="h-4 w-4" /></Button>
          </div>
          {/* View toggle */}
          <div className="flex rounded-lg overflow-hidden" style={{ border: "1px solid var(--border)" }}>
            <button onClick={() => setViewMode("list")} className="h-8 px-3 text-xs font-semibold transition-colors"
              style={viewMode === "list" ? { background: "var(--primary)", color: "#fff" } : { background: "var(--surface)", color: "var(--text-muted)" }}>
              <List className="h-3.5 w-3.5 inline mr-1" />List
            </button>
            <button onClick={() => setViewMode("calendar")} className="h-8 px-3 text-xs font-semibold transition-colors"
              style={viewMode === "calendar" ? { background: "var(--primary)", color: "#fff" } : { background: "var(--surface)", color: "var(--text-muted)" }}>
              <Calendar className="h-3.5 w-3.5 inline mr-1" />Kalender
            </button>
          </div>
          <Button variant="outline" size="sm" onClick={refetch}><RefreshCw className="h-3.5 w-3.5" /></Button>
          <Button variant="secondary" size="sm" onClick={() => { setMassalResult(null); setMassalErrors({}); setMassalOpen(true) }}>
            <Users className="h-3.5 w-3.5 mr-1.5" />Assign Massal
          </Button>
          <Button size="sm" onClick={() => { setAddErrors({}); setAddOpen(true) }}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />Tambah Jadwal
          </Button>
        </div>
      </div>

      {/* ── Filter Bar ───────────────────────────────────────────── */}
      <div className="rounded-xl p-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Search nama/NIK */}
          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-subtle)" }}>Cari Nama / NIK</label>
            <div className="relative">
              <input
                type="text"
                value={filterSearch}
                placeholder="Ketik nama atau NIK..."
                onChange={e => setFilterSearch(e.target.value)}
                className="h-8 w-full rounded-lg pl-3 pr-8 text-sm"
                style={{ border: "1px solid var(--border-strong)", background: "var(--surface)", color: "var(--text-900)" }}
              />
              {filterSearch && (
                <button onClick={() => setFilterSearch("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-xs cursor-pointer"
                  style={{ color: "var(--text-subtle)" }}>✕</button>
              )}
            </div>
          </div>
          {/* Filter Shift */}
          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-subtle)" }}>Shift</label>
            <select value={filterShiftId} className="h-8 w-full rounded-lg px-3 text-sm cursor-pointer"
              style={{ border: "1px solid var(--border-strong)", background: "var(--surface)", color: "var(--text-900)" }}
              onChange={e => setFilterShiftId(e.target.value)}>
              <option value="">— Semua Shift</option>
              {shiftList.map(s => <option key={s.id} value={s.id}>{s.kode_shift} — {s.nama_shift}</option>)}
            </select>
          </div>
          {/* Filter Divisi */}
          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-subtle)" }}>Divisi</label>
            <select value={filterDivisiId} className="h-8 w-full rounded-lg px-3 text-sm cursor-pointer"
              style={{ border: "1px solid var(--border-strong)", background: "var(--surface)", color: "var(--text-900)" }}
              onChange={e => setFilterDivisiId(e.target.value)}>
              <option value="">— Semua Divisi</option>
              {(divisis ?? []).map(d => <option key={d.id} value={d.id}>{d.nama_divisi}</option>)}
            </select>
          </div>
          {/* Reset + Info */}
          <div className="flex items-end gap-2">
            <Button variant="outline" size="sm" className="h-8"
              onClick={() => { setFilterSearch(""); setFilterShiftId(""); setFilterDivisiId("") }}>
              Reset Filter
            </Button>
            <span className="text-xs self-center" style={{ color: "var(--text-subtle)" }}>
              {list.length} dari {rawList.length} data
            </span>
          </div>
        </div>
      </div>

      {/* Content: Calendar or List */}
      {viewMode === "calendar" ? (
        <CalendarView
          year={calYear} month={calMonth} jadwals={list}
          onCellClick={(date) => {
            setDateDetailDate(date)
            setDateDetailOpen(true)
          }}
        />
      ) : (
        <DataTable
          data={list as unknown as Record<string, unknown>[]}
          columns={columns as unknown as Column<Record<string, unknown>>[]}
          searchKeys={["tanggal"]}
          loading={loading}
          emptyMessage={`Tidak ada jadwal untuk ${BULAN_ID[calMonth]} ${calYear}`}
          actions={(row: Record<string, unknown>) => {
            const r = row as unknown as JadwalRow
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
      )}

      {/* ── Modal: Tambah Jadwal Single ────────────────────────────── */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Tambah Jadwal Kerja" size="md"
        footer={<><Button variant="outline" onClick={() => setAddOpen(false)}>Batal</Button><Button onClick={handleAddSubmit} disabled={saving}>{saving ? "Menyimpan..." : "Simpan"}</Button></>}
      >
        {addErrors._ && <div className="mb-4 rounded-lg px-4 py-3 text-sm" style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>{addErrors._}</div>}
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
              Karyawan <span style={{ color: "var(--danger)" }}>*</span>
            </label>
            <SearchableSelect
              label=""
              options={karyawanOptions}
              value={addForm.karyawan_id}
              onChange={(v: string) => setAddForm(f => ({ ...f, karyawan_id: v }))}
              placeholder="Pilih karyawan..."
            />
            {addErrors.karyawan_id && <p className="text-xs" style={{ color: "var(--danger)" }}>{addErrors.karyawan_id}</p>}
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
              Shift <span style={{ color: "var(--danger)" }}>*</span>
            </label>
            <SearchableSelect
              label=""
              options={shiftOptions}
              value={addForm.shift_id}
              onChange={(v: string) => setAddForm(f => ({ ...f, shift_id: v }))}
              placeholder="Pilih shift..."
            />
            {addErrors.shift_id && <p className="text-xs" style={{ color: "var(--danger)" }}>{addErrors.shift_id}</p>}
          </div>

          <TextField label="Tanggal" required error={addErrors.tanggal}
            type="date" value={addForm.tanggal}
            onChange={e => setAddForm(f => ({ ...f, tanggal: e.target.value }))} />

          <TextareaField label="Keterangan"
            value={addForm.keterangan}
            onChange={e => setAddForm(f => ({ ...f, keterangan: e.target.value }))} />
        </div>
      </Modal>

      {/* ── Modal: Edit Jadwal ────────────────────────────────────── */}
      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Edit Jadwal Kerja" size="md"
        footer={<><Button variant="outline" onClick={() => setEditOpen(false)}>Batal</Button><Button onClick={handleEditSubmit} disabled={saving}>{saving ? "Menyimpan..." : "Simpan"}</Button></>}
      >
        {editErrors._ && <div className="mb-4 rounded-lg px-4 py-3 text-sm" style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>{editErrors._}</div>}
        {selected && (
          <div className="mb-4 rounded-lg px-4 py-3 text-sm" style={{ background: "var(--surface-muted)", border: "1px solid var(--border)" }}>
            <p className="font-semibold">{selected.karyawans?.nama_karyawan}</p>
            <p className="text-xs mt-0.5" style={{ color: "var(--text-subtle)" }}>{selected.karyawans?.nik} · {formatDate(selected.tanggal)}</p>
          </div>
        )}
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
              Shift <span style={{ color: "var(--danger)" }}>*</span>
            </label>
            <SearchableSelect
              label=""
              options={shiftOptions}
              value={editForm.shift_id}
              onChange={(v: string) => setEditForm(f => ({ ...f, shift_id: v }))}
              placeholder="Pilih shift..."
            />
            {editErrors.shift_id && <p className="text-xs" style={{ color: "var(--danger)" }}>{editErrors.shift_id}</p>}
          </div>
          <TextField label="Tanggal" required error={editErrors.tanggal}
            type="date" value={editForm.tanggal}
            onChange={e => setEditForm(f => ({ ...f, tanggal: e.target.value }))} />
          <TextareaField label="Keterangan"
            value={editForm.keterangan}
            onChange={e => setEditForm(f => ({ ...f, keterangan: e.target.value }))} />
        </div>
      </Modal>

      {/* ── Modal: Assign Massal ──────────────────────────────────── */}
      <Modal open={massalOpen} onClose={() => setMassalOpen(false)} title="Assign Jadwal Massal" size="lg"
        footer={
          massalResult
            ? <Button onClick={() => setMassalOpen(false)}>Tutup</Button>
            : <>
                <Button variant="outline" onClick={() => setMassalOpen(false)}>Batal</Button>
                <Button onClick={handleMassalSubmit} disabled={massalSaving}>{massalSaving ? "Memproses..." : "Assign Sekarang"}</Button>
              </>
        }
      >
        {massalResult ? (
          /* Hasil assign */
          <div className="space-y-4 text-center py-4">
            <div className="flex items-center justify-center gap-6 flex-wrap">
              <div>
                <div className="text-4xl font-bold" style={{ color: "var(--success)" }}>{massalResult.dibuat}</div>
                <p className="text-xs mt-1" style={{ color: "var(--text-subtle)" }}>Jadwal baru</p>
              </div>
              <div>
                <div className="text-4xl font-bold" style={{ color: "var(--primary)" }}>{massalResult.diperbarui}</div>
                <p className="text-xs mt-1" style={{ color: "var(--text-subtle)" }}>Diperbarui</p>
              </div>
              {(massalResult.dihapus ?? 0) > 0 && (
                <div>
                  <div className="text-4xl font-bold" style={{ color: "var(--danger)" }}>{massalResult.dihapus}</div>
                  <p className="text-xs mt-1" style={{ color: "var(--text-subtle)" }}>Dihapus</p>
                </div>
              )}
            </div>
            <p className="text-sm" style={{ color: "var(--text-subtle)" }}>{massalResult.message}</p>
          </div>
        ) : (
          <div className="space-y-5">
            {massalErrors._ && <div className="rounded-lg px-4 py-3 text-sm" style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>{massalErrors._}</div>}

            {/* Shift */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                Shift <span style={{ color: "var(--danger)" }}>*</span>
              </label>
              <SearchableSelect
              label=""
              options={shiftOptions}
              value={massalForm.shift_id}
              onChange={(v: string) => setMassalForm(f => ({ ...f, shift_id: v }))}
                placeholder="Pilih shift..."
              />
              {massalErrors.shift_id && <p className="text-xs" style={{ color: "var(--danger)" }}>{massalErrors.shift_id}</p>}
            </div>

            {/* Rentang tanggal */}
            <div className="grid grid-cols-2 gap-4">
              <TextField label="Tanggal Mulai" required error={massalErrors.tgl_mulai}
                type="date" value={massalForm.tgl_mulai}
                onChange={e => setMassalForm(f => ({ ...f, tgl_mulai: e.target.value }))} />
              <TextField label="Tanggal Selesai" required error={massalErrors.tgl_selesai}
                type="date" value={massalForm.tgl_selesai}
                onChange={e => setMassalForm(f => ({ ...f, tgl_selesai: e.target.value }))} />
            </div>

            {/* Target */}
            <div className="space-y-3">
              <label className="block text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Target Pegawai</label>
              <div className="flex gap-3">
                {(["karyawan", "divisi", "subdivisi"] as const).map(mode => (
                  <label key={mode} className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" checked={massalForm.mode === mode}
                      onChange={() => setMassalForm(f => ({ ...f, mode, karyawan_id: "", divisi_id: "", subdivisi_id: "" }))}
                      style={{ accentColor: "var(--primary)" }} />
                    <span className="text-sm capitalize" style={{ color: "var(--text-900)" }}>{mode === "subdivisi" ? "Sub Divisi" : mode.charAt(0).toUpperCase() + mode.slice(1)}</span>
                  </label>
                ))}
              </div>

              {massalForm.mode === "karyawan" && (
                <div className="space-y-1.5">
                  <SearchableSelect
                    label=""
                    options={karyawanOptions}
                    value={massalForm.karyawan_id}
                    onChange={(v: string) => setMassalForm(f => ({ ...f, karyawan_id: v }))}
                    placeholder="Pilih karyawan..."
                  />
                  {massalErrors.karyawan_id && <p className="text-xs" style={{ color: "var(--danger)" }}>{massalErrors.karyawan_id}</p>}
                </div>
              )}

              {massalForm.mode === "divisi" && (
                <div className="space-y-1.5">
                  <SelectField label="" options={(divisis ?? []).map(d => ({ value: String(d.id), label: d.nama_divisi }))}
                    placeholder="— Pilih Divisi —"
                    value={massalForm.divisi_id} error={massalErrors.divisi_id}
                    onChange={e => setMassalForm(f => ({ ...f, divisi_id: e.target.value }))} />
                </div>
              )}

              {massalForm.mode === "subdivisi" && (
                <div className="grid grid-cols-2 gap-3">
                  <SelectField label="Divisi" options={(divisis ?? []).map(d => ({ value: String(d.id), label: d.nama_divisi }))}
                    placeholder="— Pilih Divisi —" value={massalForm.divisi_id}
                    onChange={e => { setMassalForm(f => ({ ...f, divisi_id: e.target.value, subdivisi_id: "" })); loadSubdivisi(e.target.value) }} />
                  <SelectField label="Sub Divisi" options={subdivisiOptions.map(s => ({ value: String(s.id), label: s.nama_sub }))}
                    placeholder="— Pilih Sub Divisi —" value={massalForm.subdivisi_id}
                    error={massalErrors.subdivisi_id}
                    onChange={e => setMassalForm(f => ({ ...f, subdivisi_id: e.target.value }))} />
                </div>
              )}
            </div>

            {/* Pengecualian */}
            <div className="rounded-xl p-4 space-y-3" style={{ background: "var(--surface-muted)", border: "1px solid var(--border)" }}>
              <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-subtle)" }}>Pengecualian</p>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={massalForm.excludeHariLibur}
                  onChange={e => setMassalForm(f => ({ ...f, excludeHariLibur: e.target.checked }))}
                  style={{ accentColor: "var(--primary)" }} className="h-4 w-4" />
                <span className="text-sm" style={{ color: "var(--text-900)" }}>Lewati hari libur nasional/perusahaan</span>
              </label>
              <div>
                <p className="text-xs mb-2" style={{ color: "var(--text-subtle)" }}>Lewati hari dalam seminggu:</p>
                <div className="flex gap-2 flex-wrap">
                  {HARI_FULL.map((h, i) => (
                    <label key={i} className="flex items-center gap-1 cursor-pointer">
                      <input type="checkbox"
                        checked={massalForm.excludeHari.includes(i)}
                        onChange={e => {
                          setMassalForm(f => ({
                            ...f,
                            excludeHari: e.target.checked
                              ? [...f.excludeHari, i]
                              : f.excludeHari.filter(d => d !== i),
                          }))
                        }}
                        style={{ accentColor: "var(--primary)" }} className="h-3.5 w-3.5" />
                      <span className="text-xs" style={{ color: "var(--text-900)" }}>{h}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Modal: Detail Daftar Pegawai per Tanggal ────────────── */}
      <Modal
        open={dateDetailOpen}
        onClose={() => setDateDetailOpen(false)}
        title={dateDetailDate ? `Jadwal Kerja — ${formatDateLong(dateDetailDate + "T12:00:00Z")}` : "Jadwal Kerja"}
        description={(() => {
          if (!dateDetailDate) return undefined
          const entries = list.filter(j => {
            const raw = j.tanggal.slice(0, 10)
            return isoDate(new Date(raw + "T12:00:00Z")) === dateDetailDate
          })
          return `${HARI_FULL[new Date(dateDetailDate + "T12:00:00Z").getDay()]} · ${entries.length} pegawai terjadwal`
        })()}
        size="lg"
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => {
              setAddForm(f => ({ ...f, tanggal: dateDetailDate }))
              setAddErrors({})
              setDateDetailOpen(false)
              setAddOpen(true)
            }}>
              <Plus className="h-3.5 w-3.5 mr-1.5" />Tambah Jadwal Tanggal Ini
            </Button>
            <Button onClick={() => setDateDetailOpen(false)}>Tutup</Button>
          </div>
        }
      >
        {(() => {
          const entries = list.filter(j => {
            const raw = j.tanggal.slice(0, 10)
            return isoDate(new Date(raw + "T12:00:00Z")) === dateDetailDate
          })
          if (entries.length === 0) {
            return (
              <div className="py-8 text-center">
                <p className="text-sm" style={{ color: "var(--text-subtle)" }}>Tidak ada pegawai terjadwal pada tanggal ini</p>
              </div>
            )
          }
          // Kelompokkan per shift
          const byShift = new Map<string, { shiftName: string; jamMasuk: string; jamPulang: string; entries: JadwalRow[] }>()
          entries.forEach(e => {
            const key = e.shift_kerjas?.kode_shift ?? "NO_SHIFT"
            if (!byShift.has(key)) {
              byShift.set(key, {
                shiftName: e.shift_kerjas?.nama_shift ?? "—",
                jamMasuk:  e.shift_kerjas?.jam_masuk  ?? "",
                jamPulang: e.shift_kerjas?.jam_pulang ?? "",
                entries: [],
              })
            }
            byShift.get(key)!.entries.push(e)
          })
          return (
            <div className="space-y-5">
              {Array.from(byShift.entries()).map(([kode, group]) => (
                <div key={kode}>
                  {/* Shift header */}
                  <div className="flex items-center gap-2 mb-3">
                    <Badge variant="secondary" className="font-mono">{kode}</Badge>
                    <span className="font-semibold text-sm" style={{ color: "var(--text-900)" }}>{group.shiftName}</span>
                    {group.jamMasuk && (
                      <span className="text-xs font-mono" style={{ color: "var(--text-subtle)" }}>
                        {group.jamMasuk.slice(0,5)} – {group.jamPulang.slice(0,5)}
                      </span>
                    )}
                    <Badge variant="info" className="ml-auto">{group.entries.length} pegawai</Badge>
                  </div>
                  {/* Daftar pegawai */}
                  <div className="space-y-1">
                    {group.entries.map((e, idx) => (
                      <div key={e.id} className="flex items-center justify-between rounded-lg px-3 py-2.5"
                        style={{ background: "var(--surface-muted)", border: "1px solid var(--border)" }}>
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-mono w-5 text-right" style={{ color: "var(--text-subtle)" }}>{idx + 1}</span>
                          <div>
                            <p className="text-sm font-semibold" style={{ color: "var(--text-900)" }}>{e.karyawans?.nama_karyawan ?? "—"}</p>
                            <p className="text-xs font-mono" style={{ color: "var(--text-subtle)" }}>{e.karyawans?.nik} · {e.karyawans?.jabatan}</p>
                          </div>
                        </div>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" style={{ color: "var(--warning)" }}
                            onClick={() => { openEdit(e); setDateDetailOpen(false) }}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" style={{ color: "var(--danger)" }}
                            onClick={() => { setSelected(e); setDateDetailOpen(false); setDeleteOpen(true) }}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )
        })()}
      </Modal>

      {/* Confirm Delete */}
      <ConfirmDelete
        open={deleteOpen} onClose={() => setDeleteOpen(false)}
        onConfirm={handleDelete} loading={deleting}
        description={`Hapus jadwal ${selected?.karyawans?.nama_karyawan ?? ""} pada ${selected?.tanggal ? formatDate(selected.tanggal) : ""}?`}
      />
    </div>
  )
}

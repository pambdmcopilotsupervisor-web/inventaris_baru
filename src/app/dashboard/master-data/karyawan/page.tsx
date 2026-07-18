"use client"

import React, { useState, useEffect } from "react"
import { DataTable, Column } from "@/components/ui/data-table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Modal } from "@/components/ui/modal"
import { ConfirmDelete } from "@/components/ui/confirm-delete"
import { TextField, SelectField, TextareaField } from "@/components/ui/form-field"
import { SearchableSelect } from "@/components/ui/searchable-select"
import { Plus, Pencil, Trash2, Eye, RefreshCw } from "lucide-react"
import { formatDate } from "@/lib/utils"
import { useApi } from "@/hooks/useApi"

/* ─── Types ─────────────────────────────────────────────────────── */
interface Karyawan {
  id: number; nik: string; nama_karyawan: string; jabatan: string
  subdivisi_id: number | null; jkel: string; status_karyawan: string | null
  tanggal_masuk_kerja: string | null; tanggal_keluar: string | null; tanggal_lahir: string | null
  no_hp: string | null; no_ktp: string | null; alamat: string | null
  tempat_lahir: string | null; agama: string | null
  pendidikan_terakhir: string | null; no_bpjs_ketenagakerjaan: string | null
  no_bpjs_kesehatan: string | null; no_rekening: string | null
  nama_bank: string | null; kontak_darurat: string | null
  // computed (dari API [id])
  divisi_id?: number | null
  nama_divisi?: string | null
  nama_subdivisi?: string | null
}
interface Divisi    { id: number; kode_divisi: string; nama_divisi: string }
interface Subdivisi { id: number; kode_sub: string; nama_sub: string; divisi_id: number }

const JABATAN = ["Ketua","Bendahara","Sekretaris","Manager","Kepala Divisi","Koordinator","Staff","All Karyawan"]
const BANK    = ["BCA","BRI","BNI","Mandiri","BTN","BSI","CIMB Niaga","Bank Danamon","Permata Bank","Bank Mega","Bank Panin","OCBC NISP","Bank Muamalat","Bank Syariah Bukopin","Bank Kaltimtara"]
const STATUS  = ["Aktif","Pengurus","Pensiun","Nonaktif"]
const AGAMA   = ["Islam","Kristen","Katolik","Hindu","Buddha","Konghucu"]
const PEND    = ["SD","SMP","SMA/SMK/MA","D1","D2","D3","D4","S1","S2","S3"]

/* ─── Helper: hitung umur & masa kerja ──────────────────────────── */
function hitungUmur(tgl: string): string {
  if (!tgl) return ""
  const diff = new Date().getTime() - new Date(tgl).getTime()
  const y = Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000))
  const rem = diff - y * 365.25 * 24 * 60 * 60 * 1000
  const m = Math.floor(rem / (30.44 * 24 * 60 * 60 * 1000))
  return `${y} tahun ${m} bulan`
}

function hitungMasaKerja(tgl: string): string {
  if (!tgl) return ""
  const diff = new Date().getTime() - new Date(tgl).getTime()
  const y = Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000))
  const rem = diff - y * 365.25 * 24 * 60 * 60 * 1000
  const m = Math.floor(rem / (30.44 * 24 * 60 * 60 * 1000))
  const d = Math.floor((rem - m * 30.44 * 24 * 60 * 60 * 1000) / (24 * 60 * 60 * 1000))
  return `${y} tahun ${m} bulan ${d} hari`
}

const EMPTY: Partial<Karyawan> = { jkel: "Laki-Laki", status_karyawan: "Aktif", jabatan: "Staff" }

/* ─── Main Page ──────────────────────────────────────────────────── */
export default function KaryawanPage() {
  const { data, loading, refetch } = useApi<Karyawan[]>("/api/karyawan")
  const { data: divisis }    = useApi<Divisi[]>("/api/divisi")
  const list = data ?? []

  const [modalOpen, setModalOpen]   = useState(false)
  const [viewOpen, setViewOpen]     = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [editMode, setEditMode]     = useState(false)
  const [selected, setSelected]     = useState<Karyawan | null>(null)
  const [saving, setSaving]         = useState(false)
  const [deleting, setDeleting]     = useState(false)
  const [form, setForm]             = useState<Partial<Karyawan>>(EMPTY)
  const [errors, setErrors]         = useState<Record<string, string>>({})

  // State untuk cascade Divisi → Subdivisi
  const [selectedDivisiId, setSelectedDivisiId] = useState<string>("")
  const [subdivisiOptions, setSubdivisiOptions] = useState<Subdivisi[]>([])
  const [loadingSubdivisi, setLoadingSubdivisi] = useState(false)

  // Computed display (tidak disimpan ke DB)
  const umur      = form.tanggal_lahir     ? hitungUmur(form.tanggal_lahir)       : ""
  const masaKerja = form.tanggal_masuk_kerja ? hitungMasaKerja(form.tanggal_masuk_kerja) : ""

  // Fetch subdivisi saat divisi berubah
  useEffect(() => {
    if (!selectedDivisiId) { setSubdivisiOptions([]); return }
    setLoadingSubdivisi(true)
    fetch(`/api/subdivisi/by-divisi/${selectedDivisiId}`)
      .then(r => r.json())
      .then(d => setSubdivisiOptions(d))
      .catch(() => setSubdivisiOptions([]))
      .finally(() => setLoadingSubdivisi(false))
  }, [selectedDivisiId])

  const set = (k: keyof Karyawan, v: string) => setForm(f => ({ ...f, [k]: v || null }))

  const openAdd = () => {
    setEditMode(false); setSelected(null); setForm(EMPTY)
    setSelectedDivisiId(""); setSubdivisiOptions([]); setErrors({}); setModalOpen(true)
  }

  const openEdit = async (row: Karyawan) => {
    setEditMode(true); setSelected(row); setErrors({})
    // Fetch detail karyawan termasuk divisi_id
    try {
      const res = await fetch(`/api/karyawan/${row.id}`)
      const detail = await res.json()
      setForm(detail)
      if (detail.divisi_id) {
        setSelectedDivisiId(String(detail.divisi_id))
      } else {
        setSelectedDivisiId(""); setSubdivisiOptions([])
      }
    } catch {
      setForm(row); setSelectedDivisiId("")
    }
    setModalOpen(true)
  }

  const handleSubmit = async () => {
    const e: Record<string, string> = {}
    if (!form.nik)           e.nik = "NIK wajib diisi"
    if (!form.nama_karyawan) e.nama_karyawan = "Nama wajib diisi"
    if (!form.jabatan)       e.jabatan = "Jabatan wajib dipilih"
    if (!form.jkel)          e.jkel = "Jenis kelamin wajib dipilih"
    if (!form.status_karyawan) e.status_karyawan = "Status wajib dipilih"
    setErrors(e); if (Object.keys(e).length > 0) return

    setSaving(true)
    try {
      const url    = editMode && selected ? `/api/karyawan/${selected.id}` : "/api/karyawan"
      const method = editMode ? "PUT" : "POST"
      // Hapus field computed sebelum kirim
      const { divisi_id: _d, nama_divisi: _nd, nama_subdivisi: _ns, ...payload } = form as any
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!res.ok) { const j = await res.json(); setErrors({ _: j.error ?? "Gagal menyimpan" }); return }
      setModalOpen(false); refetch()
    } finally { setSaving(false) }
  }

  const handleDelete = async () => {
    if (!selected) return
    setDeleting(true)
    try {
      await fetch(`/api/karyawan/${selected.id}`, { method: "DELETE" })
      setDeleteOpen(false); refetch()
    } finally { setDeleting(false) }
  }

  const statusVariant = (s: string | null) => {
    switch (s) {
      case "Aktif":    return "success"
      case "Pengurus": return "warning"
      case "Pensiun":  return "destructive"
      default:         return "secondary"
    }
  }

  /* ─── Columns ────────────────────────────────────────────────── */
  const columns: Column<Karyawan>[] = [
    { key: "nik",           header: "NIK",    cell: (r) => <span className="font-mono text-xs">{r.nik}</span> },
    { key: "nama_karyawan", header: "Nama",   cell: (r) => (
      <div>
        <p className="font-semibold text-sm" style={{ color: "var(--text-900)" }}>{r.nama_karyawan}</p>
        <p className="text-xs" style={{ color: "var(--text-subtle)" }}>{r.jabatan}</p>
      </div>
    )},
    { key: "jkel", header: "JK", cell: (r) => (
      <Badge variant={r.jkel === "Laki-Laki" ? "default" : "warning"} className="text-[10px]">
        {r.jkel === "Laki-Laki" ? "L" : r.jkel === "Perempuan" ? "P" : "L/P"}
      </Badge>
    )},
    { key: "status_karyawan", header: "Status", cell: (r) => (
      <Badge variant={statusVariant(r.status_karyawan) as any}>{r.status_karyawan ?? "—"}</Badge>
    )},
    { key: "tanggal_masuk_kerja", header: "Tgl Masuk",  cell: (r) => r.tanggal_masuk_kerja ? formatDate(r.tanggal_masuk_kerja) : "—" },
    { key: "no_hp",               header: "No HP",      cell: (r) => r.no_hp ?? "—" },
  ]

  /* ─── Stats ──────────────────────────────────────────────────── */
  const stats = [
    { label: "Total",    value: list.length,                                      color: "var(--primary)" },
    { label: "Aktif",    value: list.filter(d => d.status_karyawan === "Aktif").length, color: "var(--success)" },
    { label: "Pengurus", value: list.filter(d => d.status_karyawan === "Pengurus").length, color: "var(--warning)" },
    { label: "Pensiun",  value: list.filter(d => d.status_karyawan === "Pensiun").length,  color: "var(--danger)" },
    { label: "Nonaktif", value: list.filter(d => d.status_karyawan === "Nonaktif").length, color: "var(--text-subtle)" },
  ]

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--text-900)" }}>Data Karyawan</h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-subtle)" }}>Kelola data seluruh karyawan Koperasi Konsumen Pedami</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={refetch}><RefreshCw className="h-3.5 w-3.5" /></Button>
          <Button size="sm" onClick={openAdd}><Plus className="h-3.5 w-3.5 mr-1.5" />Tambah Karyawan</Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {stats.map(s => (
          <Card key={s.label}><CardContent className="p-4">
            <p className="text-xs" style={{ color: "var(--text-subtle)" }}>{s.label}</p>
            <p className="text-2xl font-bold font-mono mt-0.5" style={{ color: s.color }}>{loading ? "…" : s.value}</p>
          </CardContent></Card>
        ))}
      </div>

      {/* Table */}
      <DataTable
        data={list as any} columns={columns as any}
        searchKeys={["nik", "nama_karyawan", "jabatan"]} loading={loading}
        actions={(row: any) => (
          <div className="flex items-center justify-center gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" style={{ color: "var(--info)" }}    onClick={() => { setSelected(row); setViewOpen(true) }}><Eye className="h-3.5 w-3.5" /></Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" style={{ color: "var(--warning)" }} onClick={() => openEdit(row)}><Pencil className="h-3.5 w-3.5" /></Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" style={{ color: "var(--danger)" }}  onClick={() => { setSelected(row); setDeleteOpen(true) }}><Trash2 className="h-3.5 w-3.5" /></Button>
          </div>
        )}
      />

      {/* ── Add / Edit Modal ──────────────────────────────────────── */}
      <Modal
        open={modalOpen} onClose={() => setModalOpen(false)} size="xl"
        title={editMode ? "Edit Data Karyawan" : "Tambah Karyawan Baru"}
        footer={<>
          <Button variant="outline" onClick={() => setModalOpen(false)}>Batal</Button>
          <Button onClick={handleSubmit} disabled={saving}>{saving ? "Menyimpan..." : "Simpan"}</Button>
        </>}
      >
        {errors._ && (
          <div className="mb-4 rounded-lg px-4 py-3 text-sm" style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>{errors._}</div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

          {/* Data Utama */}
          <TextField label="NIK" required error={errors.nik}
            value={form.nik ?? ""} onChange={e => set("nik", e.target.value)} />
          <TextField label="Nama Karyawan" required error={errors.nama_karyawan}
            value={form.nama_karyawan ?? ""} onChange={e => set("nama_karyawan", e.target.value)} />

          <SelectField label="Jabatan" required error={errors.jabatan}
            value={form.jabatan ?? ""} onChange={e => set("jabatan", e.target.value)}
            placeholder="— Pilih Jabatan —"
            options={JABATAN.map(v => ({ value: v, label: v }))} />
          <SelectField label="Jenis Kelamin" required error={errors.jkel}
            value={form.jkel ?? ""} onChange={e => set("jkel", e.target.value)}
            options={[{ value: "Laki-Laki", label: "Laki-Laki" }, { value: "Perempuan", label: "Perempuan" }, { value: "L/P", label: "L/P" }]} />

          {/* Divisi → Subdivisi cascade */}
          <SearchableSelect label="Divisi"
            value={selectedDivisiId}
            onChange={v => {
              setSelectedDivisiId(v)
              setForm(f => ({ ...f, subdivisi_id: null }))
            }}
            placeholder="— Pilih Divisi —"
            searchPlaceholder="Cari divisi..."
            options={(divisis ?? []).map(d => ({ value: String(d.id), label: d.nama_divisi }))} />
          <SearchableSelect label="Sub Divisi"
            value={String(form.subdivisi_id ?? "")}
            onChange={v => setForm(f => ({ ...f, subdivisi_id: v ? Number(v) : null }))}
            placeholder={loadingSubdivisi ? "Memuat..." : selectedDivisiId ? "— Pilih Sub Divisi —" : "— Pilih Divisi Dulu —"}
            searchPlaceholder="Cari sub divisi..."
            options={subdivisiOptions.map(s => ({ value: String(s.id), label: s.nama_sub }))}
            disabled={!selectedDivisiId || loadingSubdivisi} />

          <SelectField label="Status Karyawan" required error={errors.status_karyawan}
            value={form.status_karyawan ?? ""} onChange={e => set("status_karyawan", e.target.value)}
            options={STATUS.map(v => ({ value: v, label: v }))} />
          <SelectField label="Agama"
            value={form.agama ?? ""} onChange={e => set("agama", e.target.value)}
            placeholder="— Pilih Agama —"
            options={AGAMA.map(v => ({ value: v, label: v }))} />

          <SelectField label="Pendidikan Terakhir"
            value={form.pendidikan_terakhir ?? ""} onChange={e => set("pendidikan_terakhir", e.target.value)}
            placeholder="— Pilih Pendidikan —"
            options={PEND.map(v => ({ value: v, label: v }))} />
          <TextField label="Tempat Lahir"
            value={form.tempat_lahir ?? ""} onChange={e => set("tempat_lahir", e.target.value)} />

          {/* Tanggal Lahir + Umur otomatis */}
          <TextField label="Tanggal Lahir" type="date"
            value={form.tanggal_lahir?.split("T")[0] ?? ""}
            onChange={e => set("tanggal_lahir", e.target.value)} />
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Umur</label>
            <div className="flex h-8 items-center rounded-lg px-3 text-sm" style={{ border: "1px solid var(--border)", background: "var(--surface-muted)", color: "var(--text-muted)" }}>
              {umur || <span className="italic" style={{ color: "var(--text-subtle)" }}>Otomatis dihitung dari tanggal lahir</span>}
            </div>
          </div>

          {/* Tanggal Masuk + Masa Kerja otomatis */}
          <TextField label="Tanggal Masuk Kerja" type="date"
            value={form.tanggal_masuk_kerja?.split("T")[0] ?? ""}
            onChange={e => set("tanggal_masuk_kerja", e.target.value)} />
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Masa Kerja</label>
            <div className="flex h-8 items-center rounded-lg px-3 text-sm" style={{ border: "1px solid var(--border)", background: "var(--surface-muted)", color: "var(--text-muted)" }}>
              {masaKerja || <span className="italic" style={{ color: "var(--text-subtle)" }}>Otomatis dihitung dari tanggal masuk</span>}
            </div>
          </div>

          {/* Tanggal Keluar (resign/pensiun) — untuk prorata gaji bulan terakhir */}
          <TextField label="Tanggal Keluar (hari kerja terakhir)" type="date"
            value={form.tanggal_keluar?.split("T")[0] ?? ""}
            onChange={e => set("tanggal_keluar", e.target.value)} />

          <TextField label="No HP" value={form.no_hp ?? ""} onChange={e => set("no_hp", e.target.value)} />
          <TextField label="No KTP" value={form.no_ktp ?? ""} onChange={e => set("no_ktp", e.target.value)} />
          <TextField label="No Rekening" value={form.no_rekening ?? ""} onChange={e => set("no_rekening", e.target.value)} />
          <SelectField label="Nama Bank"
            value={form.nama_bank ?? ""} onChange={e => set("nama_bank", e.target.value)}
            placeholder="— Pilih Bank —"
            options={BANK.map(v => ({ value: v, label: v }))} />
          <TextField label="No BPJS Ketenagakerjaan"
            value={form.no_bpjs_ketenagakerjaan ?? ""} onChange={e => set("no_bpjs_ketenagakerjaan", e.target.value)} />
          <TextField label="No BPJS Kesehatan"
            value={form.no_bpjs_kesehatan ?? ""} onChange={e => set("no_bpjs_kesehatan", e.target.value)} />
          <TextField label="Kontak Darurat"
            value={form.kontak_darurat ?? ""} onChange={e => set("kontak_darurat", e.target.value)} />
          <TextareaField label="Alamat"
            value={form.alamat ?? ""} onChange={e => set("alamat", e.target.value)}
            className="md:col-span-2" />
        </div>
      </Modal>

      {/* ── View Detail Modal ──────────────────────────────────────── */}
      <Modal open={viewOpen} onClose={() => setViewOpen(false)} title="Detail Karyawan" size="lg">
        {selected && (
          <div className="grid grid-cols-2 gap-4 text-sm">
            {[
              ["NIK", selected.nik], ["Nama", selected.nama_karyawan],
              ["Jabatan", selected.jabatan], ["Status", selected.status_karyawan],
              ["Jenis Kelamin", selected.jkel], ["Agama", selected.agama],
              ["Pendidikan", selected.pendidikan_terakhir], ["Tempat Lahir", selected.tempat_lahir],
              ["Tanggal Lahir", selected.tanggal_lahir ? formatDate(selected.tanggal_lahir) : null],
              ["Umur", selected.tanggal_lahir ? hitungUmur(selected.tanggal_lahir) : null],
              ["Tgl Masuk Kerja", selected.tanggal_masuk_kerja ? formatDate(selected.tanggal_masuk_kerja) : null],
              ["Masa Kerja", selected.tanggal_masuk_kerja ? hitungMasaKerja(selected.tanggal_masuk_kerja) : null],
              ["No HP", selected.no_hp], ["No KTP", selected.no_ktp],
              ["No Rekening", selected.no_rekening], ["Nama Bank", selected.nama_bank],
              ["BPJS TK", selected.no_bpjs_ketenagakerjaan], ["BPJS Kes", selected.no_bpjs_kesehatan],
              ["Kontak Darurat", selected.kontak_darurat],
            ].map(([k, v]) => (
              <div key={String(k)}>
                <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-subtle)" }}>{k}</p>
                <p className="mt-0.5 font-medium" style={{ color: "var(--text-900)" }}>{v ?? "—"}</p>
              </div>
            ))}
            <div className="col-span-2">
              <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-subtle)" }}>Alamat</p>
              <p className="mt-0.5 font-medium" style={{ color: "var(--text-900)" }}>{selected.alamat ?? "—"}</p>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDelete
        open={deleteOpen} onClose={() => setDeleteOpen(false)}
        onConfirm={handleDelete} loading={deleting}
        description={`Hapus karyawan "${selected?.nama_karyawan}"? Semua data terkait akan ikut terhapus.`}
      />
    </div>
  )
}

"use client"

import React, { useState } from "react"
import { DataTable, Column } from "@/components/ui/data-table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Modal } from "@/components/ui/modal"
import { ConfirmDelete } from "@/components/ui/confirm-delete"
import { TextField, TextareaField, FormField } from "@/components/ui/form-field"
import { Plus, Pencil, Trash2, RefreshCw, Search, Info } from "lucide-react"
import { formatDate, formatCurrency } from "@/lib/utils"
import { useApi } from "@/hooks/useApi"
import { useCrud } from "@/hooks/useCrud"

/* ── Types ─────────────────────────────────────────────────────── */
interface ServisKendaraan {
  id: number; data_r2r4_id: number
  tanggal_servis: string; jenis_servis: string
  biaya: number; bengkel: string | null; keterangan: string | null
  // enriched
  kode_brg?: string; plat?: string; nm_brg?: string
  data_r2r4s?: { kode_brg: string; plat: string; nm_brg: string }
}
interface Kendaraan {
  id: number; kode_brg: string; plat: string; nm_brg: string
  thn: number | null; pemegang: string | null; departemen: string | null
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-subtle)" }}>{label}</span>
      <span className="text-sm font-medium" style={{ color: "var(--text-900)" }}>{value || "—"}</span>
    </div>
  )
}

const EMPTY = { data_r2r4_id: "", tanggal_servis: "", jenis_servis: "", biaya: "0", bengkel: "", keterangan: "" }

export default function ServisKendaraanPage() {
  const { data, loading, refetch } = useApi<ServisKendaraan[]>("/api/servis-kendaraan")
  const { data: allKendaraans }    = useApi<Kendaraan[]>("/api/kendaraan")
  const list = data ?? []
  const { remove, deleting } = useCrud<ServisKendaraan>({ apiPath: "/api/servis-kendaraan", onSuccess: refetch })

  const [modalOpen, setModalOpen]   = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [editMode, setEditMode]     = useState(false)
  const [selected, setSelected]     = useState<ServisKendaraan | null>(null)
  const [saving, setSaving]         = useState(false)
  const [form, setForm]             = useState(EMPTY)
  const [errors, setErrors]         = useState<Record<string, string>>({})

  // Info kendaraan auto-fill (READ-ONLY — sesuai Filament Placeholder 'vehicle_info')
  const [vehicleInfo, setVehicleInfo] = useState<{
    plat: string; kode: string; nama: string; tahun: string; pemegang: string; departemen: string
  } | null>(null)

  // Search kendaraan
  const [kendaraanSearch, setKendaraanSearch] = useState("")
  const [kendaraanDropdown, setKendaraanDropdown] = useState(false)

  const filteredKendaraans = (allKendaraans ?? []).filter(k =>
    kendaraanSearch.length >= 2 &&
    (k.plat.toLowerCase().includes(kendaraanSearch.toLowerCase()) ||
     k.nm_brg.toLowerCase().includes(kendaraanSearch.toLowerCase()) ||
     k.kode_brg.toLowerCase().includes(kendaraanSearch.toLowerCase()))
  ).slice(0, 20)

  const setF = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  // Saat pilih kendaraan → auto-fill info kendaraan (READ-ONLY)
  const handleSelectKendaraan = (k: Kendaraan) => {
    // Format: plat - nm_brg (departemen) sesuai pedami
    setKendaraanSearch(`${k.plat} - ${k.nm_brg}${k.departemen ? ` (${k.departemen})` : ""}`)
    setKendaraanDropdown(false)
    setF("data_r2r4_id", String(k.id))
    setVehicleInfo({
      plat:      k.plat,
      kode:      k.kode_brg,
      nama:      k.nm_brg,
      tahun:     k.thn ? String(k.thn) : "—",
      pemegang:  k.pemegang ?? "—",
      departemen: k.departemen ?? "—",
    })
  }

  const openAdd = () => {
    setEditMode(false); setSelected(null); setErrors({})
    setForm({ ...EMPTY, tanggal_servis: new Date().toISOString().split("T")[0] })
    setKendaraanSearch(""); setVehicleInfo(null)
    setModalOpen(true)
  }

  const openEdit = (row: ServisKendaraan) => {
    setEditMode(true); setSelected(row); setErrors({})
    const k = (allKendaraans ?? []).find(k => k.id === row.data_r2r4_id)
    setKendaraanSearch(k ? `${k.plat} - ${k.nm_brg}${k.departemen ? ` (${k.departemen})` : ""}` : row.plat ?? `ID ${row.data_r2r4_id}`)
    if (k) setVehicleInfo({ plat: k.plat, kode: k.kode_brg, nama: k.nm_brg, tahun: k.thn ? String(k.thn) : "—", pemegang: k.pemegang ?? "—", departemen: k.departemen ?? "—" })
    setForm({
      data_r2r4_id:   String(row.data_r2r4_id),
      tanggal_servis: row.tanggal_servis?.split("T")[0] ?? "",
      jenis_servis:   row.jenis_servis ?? "",
      biaya:          String(row.biaya ?? 0),
      bengkel:        row.bengkel ?? "",
      keterangan:     row.keterangan ?? "",
    })
    setModalOpen(true)
  }

  const handleSubmit = async () => {
    const e: Record<string, string> = {}
    if (!form.data_r2r4_id)    e.data_r2r4_id    = "Pilih kendaraan"
    if (!form.tanggal_servis)  e.tanggal_servis  = "Isi tanggal servis"
    if (!form.jenis_servis)    e.jenis_servis    = "Isi jenis servis"
    if (!form.biaya)           e.biaya           = "Isi biaya"
    setErrors(e); if (Object.keys(e).length) return

    setSaving(true)
    try {
      const url    = editMode && selected ? `/api/servis-kendaraan/${selected.id}` : "/api/servis-kendaraan"
      const method = editMode ? "PUT" : "POST"
      const res = await fetch(url, {
        method, headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          data_r2r4_id:  Number(form.data_r2r4_id),
          tanggal_servis: form.tanggal_servis,
          jenis_servis:  form.jenis_servis,
          biaya:         Number(form.biaya) || 0,
          bengkel:       form.bengkel || null,
          keterangan:    form.keterangan || null,
        }),
      })
      if (!res.ok) { const j = await res.json(); setErrors({ _: j.error ?? "Gagal" }); return }
      setModalOpen(false); refetch()
    } finally { setSaving(false) }
  }

  const handleDelete = async () => {
    if (!selected) return
    const ok = await remove(selected.id)
    if (ok) setDeleteOpen(false)
  }

  // Totals
  const totalBiaya = list.reduce((s, r) => s + Number(r.biaya), 0)

  /* ── Columns (sesuai table di Filament) ─────────────────────── */
  const columns: Column<ServisKendaraan>[] = [
    {
      key: "plat",
      header: "Plat / Kendaraan",
      cell: (r) => (
        <div>
          <p className="font-semibold text-sm font-mono" style={{ color: "var(--text-900)" }}>
            {r.data_r2r4s?.plat ?? r.plat ?? "—"}
          </p>
          <p className="text-xs" style={{ color: "var(--text-subtle)" }}>
            {r.data_r2r4s?.nm_brg ?? r.nm_brg ?? "Tidak ada data"}
          </p>
        </div>
      ),
    },
    { key: "tanggal_servis", header: "Tanggal",   cell: (r) => formatDate(r.tanggal_servis) },
    { key: "jenis_servis",   header: "Pekerjaan", cell: (r) => <span className="text-sm">{r.jenis_servis}</span> },
    {
      key: "biaya",
      header: "Total Biaya",
      cell: (r) => <span className="font-mono font-semibold">{formatCurrency(Number(r.biaya))}</span>,
    },
    { key: "bengkel", header: "Bengkel", cell: (r) => r.bengkel ?? "—" },
  ]

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--text-900)" }}>Riwayat Service Kendaraan</h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-subtle)" }}>
            Kelola riwayat service & perawatan kendaraan R2/R4
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={refetch}><RefreshCw className="h-3.5 w-3.5" /></Button>
          <Button size="sm" onClick={openAdd}><Plus className="h-3.5 w-3.5 mr-1.5" />Tambah Service</Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Total Records",  value: list.length,                               color: "var(--primary)" },
          { label: "Total Biaya",    value: formatCurrency(totalBiaya),               color: "var(--warning)", isText: true },
          { label: "Bulan Ini",      value: list.filter(s => { const d = new Date(s.tanggal_servis); const n = new Date(); return d.getMonth() === n.getMonth() && d.getFullYear() === n.getFullYear() }).length, color: "var(--success)" },
        ].map(s => (
          <div key={s.label} className="rounded-xl p-4" style={{ border: "1px solid var(--border)", background: "var(--surface)" }}>
            <p className="text-xs" style={{ color: "var(--text-subtle)" }}>{s.label}</p>
            <p className={`font-bold font-mono mt-0.5 ${s.isText ? "text-base" : "text-2xl"}`} style={{ color: s.color }}>
              {loading ? "…" : s.value}
            </p>
          </div>
        ))}
      </div>

      {/* Table */}
      <DataTable
        data={list as any} columns={columns as any}
        searchKeys={["jenis_servis", "bengkel"]} loading={loading}
        actions={(row: any) => (
          <div className="flex items-center justify-center gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" style={{ color: "var(--warning)" }}
              onClick={() => openEdit(row)}><Pencil className="h-3.5 w-3.5" /></Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" style={{ color: "var(--danger)" }}
              onClick={() => { setSelected(row); setDeleteOpen(true) }}><Trash2 className="h-3.5 w-3.5" /></Button>
          </div>
        )}
      />

      {/* ── Create / Edit Modal ──────────────────────────────────── */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} size="lg"
        title={editMode ? "Edit Service Kendaraan" : "Tambah Service Kendaraan"}
        description="Catat riwayat service & perbaikan kendaraan"
        footer={<>
          <Button variant="outline" onClick={() => setModalOpen(false)}>Batal</Button>
          <Button onClick={handleSubmit} disabled={saving}>{saving ? "Menyimpan..." : "Simpan"}</Button>
        </>}
      >
        <div className="space-y-5">
          {errors._ && <div className="rounded-lg px-4 py-3 text-sm" style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>{errors._}</div>}

          {/* Section: Informasi Kendaraan (sesuai Filament Section 'Informasi Kendaraan') */}
          <div className="rounded-xl" style={{ border: "1px solid var(--border)" }}>
            <div className="px-4 py-2.5" style={{ background: "var(--surface-muted)", borderBottom: "1px solid var(--border)" }}>
              <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Informasi Kendaraan</span>
            </div>
            <div className="p-4 space-y-4">
              {/* Pilih Kendaraan — format: plat - nm_brg (departemen) */}
              <FormField label="Pilih Kendaraan" required error={errors.data_r2r4_id}>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5" style={{ color: "var(--text-subtle)" }} />
                  <input type="text"
                    placeholder={editMode ? "Kendaraan terkunci" : "Cari plat, nama, atau kode kendaraan..."}
                    value={kendaraanSearch}
                    disabled={editMode}
                    onChange={e => { if (editMode) return; setKendaraanSearch(e.target.value); setKendaraanDropdown(true) }}
                    className="w-full h-8 rounded-lg pl-9 pr-3 text-sm focus:outline-none transition-all duration-150"
                    style={{
                      border: `1px solid ${errors.data_r2r4_id ? "var(--danger)" : "var(--border-strong)"}`,
                      background: editMode ? "var(--surface-muted)" : "var(--surface)",
                      color: "var(--text-900)",
                    }}
                  />
                  {kendaraanSearch.length >= 2 && kendaraanDropdown && !editMode && (
                    <div className="absolute z-50 mt-1 w-full rounded-xl shadow-xl" style={{ border: "1px solid var(--border)", background: "var(--surface)", maxHeight: 220, overflowY: "auto" }}>
                      {filteredKendaraans.length === 0 ? (
                        <div className="px-4 py-3 text-xs" style={{ color: "var(--text-subtle)" }}>Tidak ada kendaraan yang cocok</div>
                      ) : (
                        filteredKendaraans.map(k => (
                          <button key={k.id} type="button" onClick={() => handleSelectKendaraan(k)}
                            className="flex w-full items-start gap-3 px-4 py-2.5 text-left text-sm cursor-pointer transition-colors duration-100"
                            style={{ borderBottom: "1px solid var(--border)" }}
                            onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = "var(--primary-light)")}
                            onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = "transparent")}
                          >
                            <div>
                              <p className="font-semibold font-mono" style={{ color: "var(--text-900)" }}>{k.plat}</p>
                              <p className="text-xs" style={{ color: "var(--text-subtle)" }}>
                                {k.nm_brg} · {k.kode_brg}{k.departemen ? ` · ${k.departemen}` : ""}
                              </p>
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
                {!editMode && kendaraanSearch.length < 2 && (
                  <p className="text-xs mt-1" style={{ color: "var(--text-subtle)" }}>Ketik minimal 2 karakter</p>
                )}
              </FormField>

              {/* Auto-fill info kendaraan (READ-ONLY — sesuai Filament Placeholder 'vehicle_info') */}
              {vehicleInfo && (
                <div className="grid grid-cols-2 gap-4 rounded-xl p-4" style={{ background: "var(--primary-light)", border: "1px solid var(--primary-mid)" }}>
                  <InfoRow label="Plat Nomor / Kode"    value={`${vehicleInfo.plat} / ${vehicleInfo.kode}`} />
                  <InfoRow label="Nama Kendaraan"        value={vehicleInfo.nama} />
                  <InfoRow label="Tahun"                 value={vehicleInfo.tahun} />
                  <InfoRow label="Pemegang / Departemen" value={`${vehicleInfo.pemegang} / ${vehicleInfo.departemen}`} />
                </div>
              )}
            </div>
          </div>

          {/* Section: Detail Servis (sesuai Filament Section 'Detail Servis') */}
          <div className="rounded-xl" style={{ border: "1px solid var(--border)" }}>
            <div className="px-4 py-2.5" style={{ background: "var(--surface-muted)", borderBottom: "1px solid var(--border)" }}>
              <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Detail Servis</span>
            </div>
            <div className="p-4 space-y-4">
              {/* Jenis servis — full width (columnSpanFull) */}
              <TextField label="Jenis Pekerjaan / Servis" required error={errors.jenis_servis}
                placeholder="Contoh: Ganti Oli, Perbaikan AC, Ban Baru, Tune Up..."
                value={form.jenis_servis} onChange={e => setF("jenis_servis", e.target.value)} />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <TextField label="Tanggal Servis" type="date" required error={errors.tanggal_servis}
                  value={form.tanggal_servis} onChange={e => setF("tanggal_servis", e.target.value)} />
                <TextField label="Total Biaya (Rp)" type="number" required error={errors.biaya}
                  value={form.biaya} onChange={e => setF("biaya", e.target.value)} />
                <TextField label="Nama Bengkel / Toko"
                  placeholder="Auto2000, Bengkel Mandiri, AHASS..."
                  value={form.bengkel} onChange={e => setF("bengkel", e.target.value)} />
              </div>

              {/* Catatan — full width */}
              <TextareaField label="Catatan Tambahan"
                value={form.keterangan} onChange={e => setF("keterangan", e.target.value)}
                placeholder="Catatan tambahan tentang service ini..." />
            </div>
          </div>
        </div>
      </Modal>

      <ConfirmDelete open={deleteOpen} onClose={() => setDeleteOpen(false)}
        onConfirm={handleDelete} loading={deleting}
        description={`Hapus record service "${selected?.jenis_servis}" untuk kendaraan "${selected?.data_r2r4s?.plat ?? selected?.plat ?? ""}"?`}
      />
    </div>
  )
}

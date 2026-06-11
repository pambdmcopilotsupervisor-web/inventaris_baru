"use client"

import React, { useState, useEffect } from "react"
import { DataTable, Column } from "@/components/ui/data-table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Modal } from "@/components/ui/modal"
import { ConfirmDelete } from "@/components/ui/confirm-delete"
import { TextField } from "@/components/ui/form-field"
import { Plus, Eye, Pencil, Trash2, RefreshCw, Search, X, AlertCircle, Info } from "lucide-react"
import { formatDate } from "@/lib/utils"
import { useApi } from "@/hooks/useApi"

/* ── Types ─────────────────────────────────────────────────────── */
interface KendaraanDetail { id: number; data_r2r4_id: number | null; plat: string; nm_brg: string; jns_brg: string }
interface Kontrak {
  id: number; no_kontrak: string | null; judul: string
  tgl_awal: string; tgl_akhir: string; file: string | null
  // computed (dari API)
  status: string; masa_sewa: number; kendaraan_list?: KendaraanDetail[]
}
interface Kendaraan { id: number; plat: string; nm_brg: string; jns_brg: string }

/* ── Status badge ───────────────────────────────────────────────── */
function StatusBadge({ status }: { status: string }) {
  const v = status === "AKTIF" ? "success" : status === "SEGERA BERAKHIR" ? "warning" : status === "AKAN DATANG" ? "info" : "destructive"
  return (
    <div className="flex items-center gap-1">
      {status === "SEGERA BERAKHIR" && <AlertCircle className="h-3.5 w-3.5" style={{ color: "var(--warning)" }} />}
      <Badge variant={v}>{status}</Badge>
    </div>
  )
}

/* ── Masa sewa compute ──────────────────────────────────────────── */
function getMasaSewa(tglAwal: string, tglAkhir: string): number {
  if (!tglAwal || !tglAkhir) return 0
  return Math.round((new Date(tglAkhir).getTime() - new Date(tglAwal).getTime()) / (30 * 24 * 60 * 60 * 1000))
}

/* ── Main Page ──────────────────────────────────────────────────── */
export default function KontrakPage() {
  const { data, loading, refetch } = useApi<Kontrak[]>("/api/kontrak")
  const { data: allKendaraans }    = useApi<Kendaraan[]>("/api/kendaraan")
  const list = data ?? []

  const [modalOpen, setModalOpen]   = useState(false)
  const [viewOpen, setViewOpen]     = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [editMode, setEditMode]     = useState(false)
  const [selected, setSelected]     = useState<Kontrak | null>(null)
  const [saving, setSaving]         = useState(false)
  const [deleting, setDeleting]     = useState(false)
  const [errors, setErrors]         = useState<Record<string, string>>({})

  // Filter
  const [statusFilter, setStatusFilter] = useState("")

  // Form
  const [form, setForm] = useState({ no_kontrak: "", judul: "", tgl_awal: "", tgl_akhir: "" })
  // Repeater: daftar kendaraan dalam kontrak
  const [selectedKendaraans, setSelectedKendaraans] = useState<number[]>([])
  // Search kendaraan untuk repeater
  const [kendaraanSearch, setKendaraanSearch] = useState("")
  const [kendaraanDropdown, setKendaraanDropdown] = useState(false)

  // Auto-calculated masa sewa
  const masaSewa = getMasaSewa(form.tgl_awal, form.tgl_akhir)

  const setF = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  const filteredKendaraanOptions = (allKendaraans ?? []).filter(k =>
    kendaraanSearch.length >= 2 &&
    !selectedKendaraans.includes(k.id) &&
    (k.plat.toLowerCase().includes(kendaraanSearch.toLowerCase()) ||
     k.nm_brg.toLowerCase().includes(kendaraanSearch.toLowerCase()))
  ).slice(0, 20)

  const openAdd = () => {
    setEditMode(false); setSelected(null); setErrors({})
    setForm({ no_kontrak: "", judul: "", tgl_awal: "", tgl_akhir: "" })
    setSelectedKendaraans([])
    setKendaraanSearch("")
    setModalOpen(true)
  }

  const openEdit = (row: Kontrak) => {
    setEditMode(true); setSelected(row); setErrors({})
    setForm({ no_kontrak: row.no_kontrak ?? "", judul: row.judul, tgl_awal: row.tgl_awal?.split("T")[0] ?? "", tgl_akhir: row.tgl_akhir?.split("T")[0] ?? "" })
    setSelectedKendaraans((row.kendaraan_list ?? []).map(d => d.data_r2r4_id!).filter(Boolean))
    setKendaraanSearch("")
    setModalOpen(true)
  }

  const handleAddKendaraan = (k: Kendaraan) => {
    setSelectedKendaraans(prev => [...prev, k.id])
    setKendaraanSearch("")
    setKendaraanDropdown(false)
  }

  const handleRemoveKendaraan = (id: number) => {
    setSelectedKendaraans(prev => prev.filter(k => k !== id))
  }

  const getKendaraanInfo = (id: number) => (allKendaraans ?? []).find(k => k.id === id)

  const handleSubmit = async () => {
    const e: Record<string, string> = {}
    if (!form.judul)    e.judul    = "Wajib diisi"
    if (!form.tgl_awal) e.tgl_awal = "Wajib diisi"
    if (!form.tgl_akhir) e.tgl_akhir = "Wajib diisi"
    setErrors(e); if (Object.keys(e).length) return

    setSaving(true)
    try {
      const url    = editMode && selected ? `/api/kontrak/${selected.id}` : "/api/kontrak"
      const method = editMode ? "PUT" : "POST"
      const res = await fetch(url, {
        method, headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, kendaraan_ids: selectedKendaraans }),
      })
      if (!res.ok) { const j = await res.json(); setErrors({ _: j.error ?? "Gagal" }); return }
      setModalOpen(false); refetch()
    } finally { setSaving(false) }
  }

  const handleDelete = async () => {
    if (!selected) return
    setDeleting(true)
    try {
      await fetch(`/api/kontrak/${selected.id}`, { method: "DELETE" })
      setDeleteOpen(false); refetch()
    } finally { setDeleting(false) }
  }

  /* ── Filter by status ───────────────────────────────────────── */
  const filteredList = statusFilter
    ? list.filter(k => {
        if (statusFilter === "aktif")   return k.status === "AKTIF"
        if (statusFilter === "expired") return k.status === "EXPIRED"
        if (statusFilter === "segera")  return k.status === "SEGERA BERAKHIR"
        if (statusFilter === "coming")  return k.status === "AKAN DATANG"
        return true
      })
    : list

  /* ── Stats ──────────────────────────────────────────────────── */
  const statsData = [
    { label: "Total Kontrak",      value: list.length,                                     color: "var(--primary)" },
    { label: "AKTIF",              value: list.filter(k => k.status === "AKTIF").length,   color: "var(--success)" },
    { label: "SEGERA BERAKHIR",    value: list.filter(k => k.status === "SEGERA BERAKHIR").length, color: "var(--warning)" },
    { label: "EXPIRED",            value: list.filter(k => k.status === "EXPIRED").length, color: "var(--danger)" },
    { label: "AKAN DATANG",        value: list.filter(k => k.status === "AKAN DATANG").length, color: "var(--info)" },
  ]

  /* ── Columns ────────────────────────────────────────────────── */
  const columns: Column<Kontrak>[] = [
    { key: "no_kontrak", header: "No. Kontrak", cell: (r) => (
      r.no_kontrak
        ? <span className="font-mono text-xs font-semibold" style={{ color: "var(--primary)" }}>{r.no_kontrak}</span>
        : <span style={{ color: "var(--text-subtle)" }}>—</span>
    )},
    { key: "judul", header: "Judul Kontrak", cell: (r) => (
      <p className="font-semibold text-sm max-w-xs" style={{ color: "var(--text-900)", wordBreak: "break-word" }}>
        {r.judul.length > 40 ? r.judul.slice(0, 40) + "…" : r.judul}
      </p>
    )},
    { key: "tgl_awal",  header: "Tgl Awal",  cell: (r) => formatDate(r.tgl_awal) },
    { key: "tgl_akhir", header: "Tgl Akhir", cell: (r) => formatDate(r.tgl_akhir) },
    { key: "masa_sewa", header: "Masa Sewa", cell: (r) => (
      <Badge variant="info">{r.masa_sewa} Bulan</Badge>
    )},
    { key: "kendaraan_list", header: "Kendaraan", cell: (r) => (
      <span className="text-xs" style={{ color: "var(--text-muted)" }}>
        {(r.kendaraan_list ?? []).length} unit
      </span>
    )},
    { key: "status", header: "Status", cell: (r) => <StatusBadge status={r.status} /> },
  ]

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--text-900)" }}>Kontrak Sewa Kendaraan</h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-subtle)" }}>
            Kelola kontrak sewa kendaraan — status otomatis berdasarkan tanggal
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={refetch}><RefreshCw className="h-3.5 w-3.5" /></Button>
          <Button size="sm" onClick={openAdd}><Plus className="h-3.5 w-3.5 mr-1.5" />Tambah Kontrak</Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {statsData.map(s => (
          <Card key={s.label}><CardContent className="p-4">
            <p className="text-xs" style={{ color: "var(--text-subtle)" }}>{s.label}</p>
            <p className="text-xl font-bold font-mono mt-0.5" style={{ color: s.color }}>{loading ? "…" : s.value}</p>
          </CardContent></Card>
        ))}
      </div>

      {/* Filter status */}
      <div className="flex items-center gap-3 flex-wrap">
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="h-8 rounded-lg px-3 text-sm cursor-pointer"
          style={{ border: "1px solid var(--border-strong)", background: "var(--surface)", color: "var(--text-900)" }}>
          <option value="">Semua Status</option>
          <option value="aktif">AKTIF</option>
          <option value="segera">SEGERA BERAKHIR (&lt;30 hari)</option>
          <option value="expired">EXPIRED</option>
          <option value="coming">AKAN DATANG</option>
        </select>
        {statusFilter && (
          <Button variant="ghost" size="sm" onClick={() => setStatusFilter("")}>Reset Filter</Button>
        )}
        {statusFilter && (
          <p className="text-xs" style={{ color: "var(--text-subtle)" }}>
            Menampilkan {filteredList.length} kontrak
          </p>
        )}
      </div>

      {/* Table */}
      <DataTable
        data={filteredList as any} columns={columns as any}
        searchKeys={["no_kontrak", "judul"]} loading={loading}
        emptyMessage="Tidak ada kontrak"
        actions={(row: any) => (
          <div className="flex items-center justify-center gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" style={{ color: "var(--info)" }}
              onClick={() => { setSelected(row); setViewOpen(true) }}><Eye className="h-3.5 w-3.5" /></Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" style={{ color: "var(--warning)" }}
              onClick={() => openEdit(row)}><Pencil className="h-3.5 w-3.5" /></Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" style={{ color: "var(--danger)" }}
              onClick={() => { setSelected(row); setDeleteOpen(true) }}><Trash2 className="h-3.5 w-3.5" /></Button>
          </div>
        )}
      />

      {/* ── Create / Edit Modal ────────────────────────────────── */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} size="lg"
        title={editMode ? "Edit Kontrak" : "Tambah Kontrak Baru"}
        footer={<><Button variant="outline" onClick={() => setModalOpen(false)}>Batal</Button><Button onClick={handleSubmit} disabled={saving}>{saving ? "Menyimpan..." : "Simpan"}</Button></>}
      >
        <div className="space-y-5">
          {errors._ && <div className="rounded-lg px-4 py-3 text-sm" style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>{errors._}</div>}

          {/* Nomor & Judul */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <TextField label="No. Kontrak" value={form.no_kontrak} onChange={e => setF("no_kontrak", e.target.value)} placeholder="Opsional" />
            <div /> {/* spacer */}
            <TextField label="Judul Kontrak" required error={errors.judul}
              value={form.judul} onChange={e => setF("judul", e.target.value)}
              className="md:col-span-2" />
          </div>

          {/* Tanggal + Masa Sewa auto-hitung */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <TextField label="Tanggal Awal Kontrak" type="date" required error={errors.tgl_awal}
              value={form.tgl_awal} onChange={e => setF("tgl_awal", e.target.value)} />
            <TextField label="Tanggal Akhir Kontrak" type="date" required error={errors.tgl_akhir}
              value={form.tgl_akhir} onChange={e => setF("tgl_akhir", e.target.value)} />
            {/* Masa Sewa — READ-ONLY, otomatis dihitung */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                Masa Sewa
              </label>
              <div className="flex h-8 items-center rounded-lg px-3 text-sm font-semibold" style={{ border: "1px solid var(--border)", background: "var(--surface-muted)", color: form.tgl_awal && form.tgl_akhir ? "var(--primary)" : "var(--text-subtle)" }}>
                {form.tgl_awal && form.tgl_akhir ? `${masaSewa} Bulan` : "Otomatis terisi..."}
              </div>
            </div>
          </div>

          {/* Repeater: Kendaraan terkait kontrak (sesuai Filament Repeater) */}
          <div className="rounded-xl" style={{ border: "1px solid var(--border)" }}>
            <div className="px-4 py-2.5" style={{ background: "var(--surface-muted)", borderBottom: "1px solid var(--border)" }}>
              <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                Kendaraan Terkait Kontrak ({selectedKendaraans.length} unit)
              </span>
            </div>
            <div className="p-4 space-y-3">
              {/* Search untuk tambah kendaraan */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5" style={{ color: "var(--text-subtle)" }} />
                <input type="text"
                  placeholder="Cari plat atau nama kendaraan untuk ditambahkan..."
                  value={kendaraanSearch}
                  onChange={e => { setKendaraanSearch(e.target.value); setKendaraanDropdown(true) }}
                  className="w-full h-8 rounded-lg pl-9 pr-3 text-sm focus:outline-none transition-all duration-150"
                  style={{ border: "1px solid var(--border-strong)", background: "var(--surface)", color: "var(--text-900)" }}
                />
                {kendaraanSearch.length >= 2 && kendaraanDropdown && (
                  <div className="absolute z-50 mt-1 w-full rounded-xl shadow-xl" style={{ border: "1px solid var(--border)", background: "var(--surface)", maxHeight: 200, overflowY: "auto" }}>
                    {filteredKendaraanOptions.length === 0 ? (
                      <div className="px-4 py-3 text-xs" style={{ color: "var(--text-subtle)" }}>Tidak ada kendaraan yang cocok</div>
                    ) : (
                      filteredKendaraanOptions.map(k => (
                        <button key={k.id} type="button" onClick={() => handleAddKendaraan(k)}
                          className="flex w-full items-start gap-3 px-4 py-2.5 text-left text-sm cursor-pointer transition-colors duration-100"
                          style={{ borderBottom: "1px solid var(--border)" }}
                          onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = "var(--primary-light)")}
                          onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = "transparent")}
                        >
                          <div>
                            <p className="font-semibold" style={{ color: "var(--text-900)" }}>{k.plat}</p>
                            <p className="text-xs" style={{ color: "var(--text-subtle)" }}>{k.nm_brg} · {k.jns_brg}</p>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* List kendaraan yang sudah dipilih */}
              {selectedKendaraans.length === 0 ? (
                <p className="text-xs italic py-2" style={{ color: "var(--text-subtle)" }}>
                  Belum ada kendaraan terkait. Cari dan tambahkan di atas.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {selectedKendaraans.map(id => {
                    const k = getKendaraanInfo(id)
                    return (
                      <div key={id} className="flex items-center justify-between gap-3 rounded-lg px-3 py-2"
                        style={{ background: "var(--primary-light)", border: "1px solid var(--primary-mid)" }}>
                        <div>
                          <span className="text-sm font-semibold font-mono" style={{ color: "var(--primary)" }}>{k?.plat ?? `ID ${id}`}</span>
                          {k && <span className="text-xs ml-2" style={{ color: "var(--text-muted)" }}>{k.nm_brg} · {k.jns_brg}</span>}
                        </div>
                        <button type="button" onClick={() => handleRemoveKendaraan(id)}
                          className="flex h-6 w-6 items-center justify-center rounded-lg transition-colors duration-150 cursor-pointer"
                          style={{ color: "var(--danger)" }}
                          onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = "var(--danger-bg)")}
                          onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = "transparent")}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </Modal>

      {/* ── View Detail Modal ──────────────────────────────────── */}
      <Modal open={viewOpen} onClose={() => setViewOpen(false)} title="Detail Kontrak" size="lg">
        {selected && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-subtle)" }}>No. Kontrak</p>
                <p className="mt-0.5 font-mono font-semibold" style={{ color: "var(--primary)" }}>{selected.no_kontrak ?? "—"}</p>
              </div>
              <div><p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-subtle)" }}>Status</p><div className="mt-1"><StatusBadge status={selected.status} /></div></div>
              <div className="col-span-2">
                <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-subtle)" }}>Judul Kontrak</p>
                <p className="mt-0.5 font-semibold" style={{ color: "var(--text-900)" }}>{selected.judul}</p>
              </div>
              <div><p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-subtle)" }}>Tgl Awal</p><p className="mt-0.5 font-medium">{formatDate(selected.tgl_awal)}</p></div>
              <div><p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-subtle)" }}>Tgl Akhir</p><p className="mt-0.5 font-medium">{formatDate(selected.tgl_akhir)}</p></div>
              <div><p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-subtle)" }}>Masa Sewa</p><Badge variant="info" className="mt-1">{selected.masa_sewa} Bulan</Badge></div>
            </div>

            {/* Daftar kendaraan */}
            {(selected.kendaraan_list ?? []).length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--text-subtle)" }}>
                  Kendaraan dalam Kontrak ({(selected.kendaraan_list ?? []).length} unit)
                </p>
                <div className="space-y-1.5">
                  {(selected.kendaraan_list ?? []).map(k => (
                    <div key={k.id} className="flex items-center gap-3 px-3 py-2 rounded-lg"
                      style={{ background: "var(--surface-muted)", border: "1px solid var(--border)" }}>
                      <span className="font-mono font-semibold text-sm" style={{ color: "var(--primary)" }}>{k.plat}</span>
                      <span className="text-xs" style={{ color: "var(--text-muted)" }}>{k.nm_brg}</span>
                      <Badge variant={k.jns_brg.includes("R2") ? "success" : "default"} className="ml-auto text-[10px]">{k.jns_brg}</Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      <ConfirmDelete open={deleteOpen} onClose={() => setDeleteOpen(false)}
        onConfirm={handleDelete} loading={deleting}
        title="Hapus Kontrak"
        description={`Hapus kontrak "${selected?.judul}"? Semua data kendaraan terkait dalam kontrak ini juga akan dihapus.`}
      />
    </div>
  )
}

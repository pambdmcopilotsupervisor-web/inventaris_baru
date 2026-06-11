"use client"

import React, { useState, useEffect } from "react"
import { DataTable, Column } from "@/components/ui/data-table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Modal } from "@/components/ui/modal"
import { ConfirmDelete } from "@/components/ui/confirm-delete"
import { TextField, SelectField, TextareaField, FormField } from "@/components/ui/form-field"
import { SearchableSelect } from "@/components/ui/searchable-select"
import { Plus, Pencil, Eye, Trash2, RefreshCw, Search, ArrowRight, Info } from "lucide-react"
import { formatDate } from "@/lib/utils"
import { useApi } from "@/hooks/useApi"
import { useCrud } from "@/hooks/useCrud"

/* ── Types ─────────────────────────────────────────────────────── */
interface MutasiAset {
  id: number
  asset_id: number
  tgl_mutasi: string
  deskripsi: string
  // Asal (sebelum mutasi)
  ruangan_id_a: number
  penanggung_jawab_id_a: number
  karyawan_id_a: number
  gambar_awal: string | null
  // Tujuan (sesudah mutasi)
  ruangan_id_t: number
  penanggung_jawab_id_t: number
  karyawan_id_t: number
  gambar_terbaru: string | null
  // Enriched (dari API)
  nama_asset?: string
  ruangan_asal?: string
  ruangan_tujuan?: string
  pj_asal?: string
  pj_tujuan?: string
  pemakai_asal?: string
  pemakai_tujuan?: string
}

interface Asset {
  id: number
  kode_asset: string
  nama_asset: string
  ruangan_id: number | null
  penanggung_jawab_id: number
  karyawan_id: number
  pemakai: string | null
  gambar: string | null
}

interface Ruangan { id: number; ruangan: string; lokasi: string }
interface Karyawan { id: number; nik: string; nama_karyawan: string }

const EMPTY_FORM = {
  asset_id: "",
  ruangan_id_t: "",
  penanggung_jawab_id_t: "",
  karyawan_id_t: "",
  tgl_mutasi: "",
  deskripsi: "",
}

/* ── Read-only Section Info Component ──────────────────────────── */
function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-subtle)" }}>
        {label}
      </span>
      <span className="text-sm font-medium" style={{ color: "var(--text-900)" }}>
        {value || "—"}
      </span>
    </div>
  )
}

/* ── Main Page ──────────────────────────────────────────────────── */
export default function MutasiAsetPage() {
  const { data, loading, refetch } = useApi<MutasiAset[]>("/api/mutasi-aset")
  const { data: ruangans } = useApi<Ruangan[]>("/api/ruangan")
  const { data: karyawans } = useApi<Karyawan[]>("/api/karyawan")
  const { data: allAsets } = useApi<Asset[]>("/api/aset")
  const list = data ?? []

  const { remove, deleting } = useCrud<MutasiAset>({
    apiPath: "/api/mutasi-aset",
    onSuccess: refetch,
  })

  // Modal state
  const [modalOpen, setModalOpen]   = useState(false)
  const [viewOpen, setViewOpen]     = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [editMode, setEditMode]     = useState(false)
  const [selected, setSelected]     = useState<MutasiAset | null>(null)

  // Form state
  const [form, setForm] = useState(EMPTY_FORM)
  // Auto-fill dari aset yang dipilih (data ASAL — read-only di form)
  const [asalData, setAsalData] = useState<{
    ruangan: string; pj: string; pemakai: string; gambar: string | null
  } | null>(null)
  // Search aset
  const [assetSearch, setAssetSearch] = useState("")
  const [assetDropdown, setAssetDropdown] = useState(false)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Filter aset hasil search
  const filteredAsets = (allAsets ?? []).filter(a =>
    assetSearch.length >= 2 &&
    (a.kode_asset.toLowerCase().includes(assetSearch.toLowerCase()) ||
     a.nama_asset.toLowerCase().includes(assetSearch.toLowerCase()))
  ).slice(0, 20)

  // Helper maps
  const rMap = new Map((ruangans ?? []).map(r => [r.id, `${r.ruangan} — ${r.lokasi}`]))
  const kMap = new Map((karyawans ?? []).map(k => [k.id, k.nama_karyawan]))

  // Saat pilih aset dari dropdown — auto-fill data ASAL
  const handleSelectAsset = (asset: Asset) => {
    setForm(f => ({ ...f, asset_id: String(asset.id) }))
    setAssetSearch(`${asset.kode_asset} — ${asset.nama_asset}`)
    setAssetDropdown(false)

    // Auto-fill section "Sebelum Mutasi" dari data aset saat ini
    setAsalData({
      ruangan: asset.ruangan_id ? (rMap.get(asset.ruangan_id) ?? `ID ${asset.ruangan_id}`) : "—",
      pj:      kMap.get(asset.penanggung_jawab_id) ?? `ID ${asset.penanggung_jawab_id}`,
      pemakai: kMap.get(asset.karyawan_id) ?? `ID ${asset.karyawan_id}`,
      gambar:  asset.gambar,
    })
  }

  // Buka modal tambah
  const openAdd = () => {
    setEditMode(false)
    setSelected(null)
    setForm(EMPTY_FORM)
    setAsalData(null)
    setAssetSearch("")
    setErrors({})
    setModalOpen(true)
  }

  // Buka modal edit
  const openEdit = (row: MutasiAset) => {
    setEditMode(true)
    setSelected(row)
    setForm({
      asset_id:             String(row.asset_id),
      ruangan_id_t:         String(row.ruangan_id_t),
      penanggung_jawab_id_t: String(row.penanggung_jawab_id_t),
      karyawan_id_t:        String(row.karyawan_id_t),
      tgl_mutasi:           row.tgl_mutasi?.split("T")[0] ?? "",
      deskripsi:            row.deskripsi ?? "",
    })
    // Tampilkan data ASAL dari record mutasi (read-only, tidak berubah)
    setAsalData({
      ruangan: rMap.get(row.ruangan_id_a) ?? "—",
      pj:      kMap.get(row.penanggung_jawab_id_a) ?? "—",
      pemakai: kMap.get(row.karyawan_id_a) ?? "—",
      gambar:  row.gambar_awal,
    })
    // Tampilkan nama aset
    const a = (allAsets ?? []).find(a => a.id === row.asset_id)
    setAssetSearch(a ? `${a.kode_asset} — ${a.nama_asset}` : `Asset ID ${row.asset_id}`)
    setErrors({})
    setModalOpen(true)
  }

  // Validasi
  const validate = () => {
    const e: Record<string, string> = {}
    if (!form.asset_id)      e.asset_id = "Pilih aset"
    if (!form.ruangan_id_t)  e.ruangan_id_t = "Pilih ruangan tujuan"
    if (!form.tgl_mutasi)    e.tgl_mutasi = "Isi tanggal mutasi"
    if (!form.deskripsi)     e.deskripsi = "Isi deskripsi"
    setErrors(e)
    return Object.keys(e).length === 0
  }

  // Submit
  const handleSubmit = async () => {
    if (!validate()) return
    setSaving(true)
    try {
      const url = editMode && selected ? `/api/mutasi-aset/${selected.id}` : "/api/mutasi-aset"
      const method = editMode ? "PUT" : "POST"
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          asset_id:             Number(form.asset_id),
          ruangan_id_t:         Number(form.ruangan_id_t),
          penanggung_jawab_id_t: form.penanggung_jawab_id_t ? Number(form.penanggung_jawab_id_t) : null,
          karyawan_id_t:        form.karyawan_id_t ? Number(form.karyawan_id_t) : null,
          tgl_mutasi:           form.tgl_mutasi,
          deskripsi:            form.deskripsi,
        }),
      })
      if (!res.ok) {
        const j = await res.json()
        setErrors({ _: j.error ?? "Gagal menyimpan" })
        return
      }
      setModalOpen(false)
      refetch()
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!selected) return
    const ok = await remove(selected.id)
    if (ok) setDeleteOpen(false)
  }

  /* ── Table columns ─────────────────────────────────────────── */
  const columns: Column<MutasiAset>[] = [
    {
      key: "nama_asset",
      header: "Aset",
      cell: (r) => <span className="font-semibold text-sm" style={{ color: "var(--text-900)" }}>{r.nama_asset}</span>,
    },
    {
      key: "ruangan_asal",
      header: "Ruangan Asal",
      cell: (r) => <span className="text-xs" style={{ color: "var(--text-muted)" }}>{r.ruangan_asal}</span>,
    },
    {
      key: "arrow",
      header: "",
      cell: () => <ArrowRight className="h-3.5 w-3.5 mx-auto" style={{ color: "var(--primary)" }} />,
      className: "w-8 text-center",
    },
    {
      key: "ruangan_tujuan",
      header: "Ruangan Tujuan",
      cell: (r) => <span className="text-xs font-semibold" style={{ color: "var(--primary)" }}>{r.ruangan_tujuan}</span>,
    },
    {
      key: "pemakai_tujuan",
      header: "Pemakai Baru",
      cell: (r) => r.pemakai_tujuan ?? "—",
    },
    {
      key: "tgl_mutasi",
      header: "Tgl Mutasi",
      cell: (r) => formatDate(r.tgl_mutasi),
    },
    {
      key: "deskripsi",
      header: "Deskripsi",
      cell: (r) => <span className="text-xs max-w-xs truncate block">{r.deskripsi}</span>,
    },
  ]

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--text-900)" }}>Mutasi Aset</h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-subtle)" }}>
            Perpindahan lokasi / kepemilikan aset — setiap mutasi otomatis memperbarui data aset
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={refetch}><RefreshCw className="h-3.5 w-3.5" /></Button>
          <Button size="sm" onClick={openAdd}><Plus className="h-3.5 w-3.5 mr-1.5" />Buat Mutasi</Button>
        </div>
      </div>

      {/* Info box */}
      <div className="flex items-start gap-3 rounded-xl p-4" style={{ background: "var(--primary-light)", border: "1px solid var(--primary-mid)" }}>
        <Info className="h-4 w-4 mt-0.5 shrink-0" style={{ color: "var(--primary)" }} />
        <p className="text-xs" style={{ color: "var(--text-700)" }}>
          <strong>Alur Mutasi Aset:</strong> Pilih aset → sistem otomatis mencatat kondisi aset saat ini sebagai data "Sebelum Mutasi" → isi data tujuan "Sesudah Mutasi" → setelah disimpan, <strong>data aset akan diperbarui</strong> sesuai lokasi & kepemilikan baru.
        </p>
      </div>

      {/* Table */}
      <DataTable
        data={list as any}
        columns={columns as any}
        searchKeys={["nama_asset", "deskripsi", "ruangan_asal", "ruangan_tujuan"]}
        loading={loading}
        actions={(row: any) => (
          <div className="flex items-center justify-center gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" style={{ color: "var(--info)" }}
              onClick={() => { setSelected(row); setViewOpen(true) }}>
              <Eye className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" style={{ color: "var(--warning)" }}
              onClick={() => openEdit(row)}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" style={{ color: "var(--danger)" }}
              onClick={() => { setSelected(row); setDeleteOpen(true) }}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      />

      {/* ── Create / Edit Modal ────────────────────────────────── */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editMode ? "Edit Mutasi Aset" : "Buat Mutasi Aset"}
        description={editMode
          ? "Edit data tujuan mutasi — aset akan diperbarui otomatis"
          : "Pilih aset dan tentukan tujuan mutasi — data aset akan diperbarui otomatis"}
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Batal</Button>
            <Button onClick={handleSubmit} disabled={saving}>
              {saving ? "Menyimpan..." : editMode ? "Simpan Perubahan" : "Simpan & Update Aset"}
            </Button>
          </>
        }
      >
        <div className="space-y-5">
          {/* Error global */}
          {errors._ && (
            <div className="rounded-lg px-4 py-3 text-sm" style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>
              {errors._}
            </div>
          )}

          {/* ── Pilih Aset ──────────────────────────────────────── */}
          <FormField label="Pilih Aset" required error={errors.asset_id}>
            <div className="relative">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5" style={{ color: "var(--text-subtle)" }} />
                <input
                  type="text"
                  placeholder={editMode ? "Aset terkunci (tidak dapat diubah)" : "Cari kode aset atau nama aset..."}
                  value={assetSearch}
                  onChange={e => {
                    if (editMode) return // locked on edit
                    setAssetSearch(e.target.value)
                    setAssetDropdown(true)
                    if (!e.target.value) { setForm(f => ({ ...f, asset_id: "" })); setAsalData(null) }
                  }}
                  disabled={editMode}
                  className="w-full h-8 rounded-lg pl-9 pr-3 text-sm transition-all duration-150 focus:outline-none"
                  style={{
                    border: `1px solid ${errors.asset_id ? "var(--danger)" : "var(--border-strong)"}`,
                    background: editMode ? "var(--surface-muted)" : "var(--surface)",
                    color: "var(--text-900)",
                  }}
                />
              </div>
              {/* Dropdown hasil search */}
              {assetDropdown && filteredAsets.length > 0 && (
                <div
                  className="absolute z-[300] mt-1 w-full rounded-xl shadow-xl"
                  style={{ border: "1px solid var(--border)", background: "var(--surface)", maxHeight: 220, overflowY: "auto" }}
                >
                  {filteredAsets.map(a => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => handleSelectAsset(a)}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors duration-100 cursor-pointer"
                      style={{ borderBottom: "1px solid var(--border)" }}
                      onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "var(--primary-light)")}
                      onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "transparent")}
                    >
                      <div>
                        <p className="font-semibold" style={{ color: "var(--text-900)" }}>{a.kode_asset}</p>
                        <p className="text-xs" style={{ color: "var(--text-subtle)" }}>{a.nama_asset}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {!editMode && assetSearch.length < 2 && (
              <p className="text-xs mt-1" style={{ color: "var(--text-subtle)" }}>Ketik minimal 2 karakter untuk mencari</p>
            )}
          </FormField>

          {/* ── Section: Sebelum Mutasi (READ-ONLY) ──────────────── */}
          <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)" }}>
            <div className="px-4 py-2.5 flex items-center gap-2" style={{ background: "var(--surface-muted)", borderBottom: "1px solid var(--border)" }}>
              <div className="h-2 w-2 rounded-full bg-gray-400" />
              <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                Sebelum Mutasi (Kondisi Aset Saat Ini)
              </span>
              <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ background: "var(--surface-hover)", color: "var(--text-subtle)" }}>
                Read-only · Otomatis diisi
              </span>
            </div>
            <div className="p-4">
              {!asalData ? (
                <p className="text-xs italic" style={{ color: "var(--text-subtle)" }}>
                  {editMode ? "Memuat data..." : "Pilih aset di atas untuk melihat kondisi saat ini"}
                </p>
              ) : (
                <div className="grid grid-cols-3 gap-4">
                  <InfoRow label="Ruangan / Lokasi" value={asalData.ruangan} />
                  <InfoRow label="Penanggung Jawab" value={asalData.pj} />
                  <InfoRow label="Pemakai" value={asalData.pemakai} />
                </div>
              )}
            </div>
          </div>

          {/* ── Section: Sesudah Mutasi (EDITABLE) ───────────────── */}
          <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--primary-mid)" }}>
            <div className="px-4 py-2.5 flex items-center gap-2" style={{ background: "var(--primary-light)", borderBottom: "1px solid var(--primary-mid)" }}>
              <div className="h-2 w-2 rounded-full" style={{ background: "var(--primary)" }} />
              <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--primary)" }}>
                Sesudah Mutasi (Tujuan)
              </span>
              <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ background: "var(--primary-mid)", color: "var(--primary)" }}>
                Wajib diisi
              </span>
            </div>
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <SearchableSelect
                  label="Ruangan Tujuan" required
                  error={errors.ruangan_id_t}
                  value={form.ruangan_id_t}
                  onChange={v => setForm(f => ({ ...f, ruangan_id_t: v }))}
                  placeholder="— Pilih Ruangan Tujuan —"
                  searchPlaceholder="Cari ruangan..."
                  options={(ruangans ?? []).map(r => ({ value: String(r.id), label: r.ruangan, description: r.lokasi }))}
                />
                <SearchableSelect
                  label="Penanggung Jawab Tujuan"
                  value={form.penanggung_jawab_id_t}
                  onChange={v => setForm(f => ({ ...f, penanggung_jawab_id_t: v }))}
                  placeholder="— Pilih Penanggung Jawab —"
                  searchPlaceholder="Cari nama karyawan..."
                  options={(karyawans ?? []).map(k => ({ value: String(k.id), label: k.nama_karyawan }))}
                />
                <SearchableSelect
                  label="Pemakai Tujuan"
                  value={form.karyawan_id_t}
                  onChange={v => setForm(f => ({ ...f, karyawan_id_t: v }))}
                  placeholder="— Pilih Pemakai —"
                  searchPlaceholder="Cari nama karyawan..."
                  options={(karyawans ?? []).map(k => ({ value: String(k.id), label: k.nama_karyawan }))}
                />
                <TextField
                  label="Tanggal Mutasi" required type="date"
                  error={errors.tgl_mutasi}
                  value={form.tgl_mutasi}
                  onChange={e => setForm(f => ({ ...f, tgl_mutasi: e.target.value }))}
                />
              </div>
              <TextField
                label="Deskripsi / Keterangan" required
                error={errors.deskripsi}
                value={form.deskripsi}
                placeholder="Alasan/keterangan mutasi..."
                onChange={e => setForm(f => ({ ...f, deskripsi: e.target.value }))}
              />
            </div>
          </div>

          {/* Catatan */}
          {!editMode && form.asset_id && (
            <p className="text-xs flex items-center gap-1.5" style={{ color: "var(--warning)" }}>
              <Info className="h-3.5 w-3.5" />
              Setelah disimpan, data aset akan diperbarui otomatis: ruangan, penanggung jawab, dan pemakai akan berubah sesuai tujuan di atas.
            </p>
          )}
        </div>
      </Modal>

      {/* ── View Detail Modal ──────────────────────────────────── */}
      <Modal open={viewOpen} onClose={() => setViewOpen(false)} title="Detail Mutasi Aset" size="lg">
        {selected && (
          <div className="space-y-5">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: "var(--text-subtle)" }}>Aset</p>
              <p className="font-semibold" style={{ color: "var(--text-900)" }}>{selected.nama_asset}</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Sebelum */}
              <div className="rounded-xl p-4 space-y-3" style={{ background: "var(--surface-muted)", border: "1px solid var(--border)" }}>
                <p className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--text-subtle)" }}>Sebelum Mutasi</p>
                <InfoRow label="Ruangan" value={selected.ruangan_asal ?? "—"} />
                <InfoRow label="Penanggung Jawab" value={selected.pj_asal ?? "—"} />
                <InfoRow label="Pemakai" value={selected.pemakai_asal ?? "—"} />
              </div>
              {/* Sesudah */}
              <div className="rounded-xl p-4 space-y-3" style={{ background: "var(--primary-light)", border: "1px solid var(--primary-mid)" }}>
                <p className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--primary)" }}>Sesudah Mutasi</p>
                <InfoRow label="Ruangan" value={selected.ruangan_tujuan ?? "—"} />
                <InfoRow label="Penanggung Jawab" value={selected.pj_tujuan ?? "—"} />
                <InfoRow label="Pemakai" value={selected.pemakai_tujuan ?? "—"} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <InfoRow label="Tanggal Mutasi" value={formatDate(selected.tgl_mutasi)} />
              <InfoRow label="Deskripsi" value={selected.deskripsi} />
            </div>
          </div>
        )}
      </Modal>

      {/* ── Confirm Delete ─────────────────────────────────────── */}
      <ConfirmDelete
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={handleDelete}
        loading={deleting}
        title="Hapus Mutasi Aset"
        description={`Hapus record mutasi untuk aset "${selected?.nama_asset}"? Catatan: data aset TIDAK akan dikembalikan ke kondisi semula.`}
      />
    </div>
  )
}

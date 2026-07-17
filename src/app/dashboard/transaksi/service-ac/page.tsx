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
import { useAuth } from "@/contexts/AuthContext"
import { canCreateOrEditTransaksi, canDeleteTransaksi } from "@/lib/transaksi-role"

/* ── Types ─────────────────────────────────────────────────────── */
interface ServiceAC {
  id: number; asset_id: number; tanggal_service: string
  jenis_pekerjaan: string; biaya: number; teknisi: string | null; keterangan: string | null
  // enriched
  kode_asset?: string; nama_asset?: string; kondisi_aset?: string
  nama_ruangan?: string; nama_pj?: string
}

interface Asset {
  id: number; kode_asset: string; nama_asset: string; status_barang: string
  nama_ruangan?: string | null; lokasi?: string | null; nama_pj?: string | null
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-subtle)" }}>{label}</span>
      <span className="text-sm font-medium" style={{ color: "var(--text-900)" }}>{value || "—"}</span>
    </div>
  )
}

const EMPTY = { asset_id: "", tanggal_service: "", jenis_pekerjaan: "", biaya: "0", teknisi: "", keterangan: "" }

export default function ServiceACPage() {
  const { user } = useAuth()
  const { data, loading, refetch } = useApi<ServiceAC[]>("/api/service-ac")
  const { data: allAssets, loading: assetsLoading } = useApi<Asset[]>("/api/aset")
  const list = data ?? []
  const canManageData = canCreateOrEditTransaksi(user?.role)
  const canDeleteData = canDeleteTransaksi(user?.role)

  const [modalOpen, setModalOpen]   = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [editMode, setEditMode]     = useState(false)
  const [selected, setSelected]     = useState<ServiceAC | null>(null)
  const [saving, setSaving]         = useState(false)
  const [deleting, setDeleting]     = useState(false)
  const [form, setForm]             = useState(EMPTY)
  const [errors, setErrors]         = useState<Record<string, string>>({})

  // Info aset auto-fill (READ-ONLY sesuai Filament)
  const [assetInfo, setAssetInfo] = useState<{
    kode: string; nama: string; kondisi: string; lokasi: string; pj: string
  } | null>(null)

  // Asset search
  const [assetSearch, setAssetSearch] = useState("")
  const [assetDropdown, setAssetDropdown] = useState(false)

  const filteredAssets = (allAssets ?? []).filter(a =>
    assetSearch.length >= 2 &&
    (a.kode_asset.toLowerCase().includes(assetSearch.toLowerCase()) ||
     a.nama_asset.toLowerCase().includes(assetSearch.toLowerCase()))
  ).slice(0, 20)

  const handleSelectAsset = (asset: Asset) => {
    setAssetSearch(`${asset.kode_asset} — ${asset.nama_asset}`)
    setAssetDropdown(false)
    setForm(f => ({ ...f, asset_id: String(asset.id) }))
    setAssetInfo({
      kode:    asset.kode_asset,
      nama:    asset.nama_asset,
      kondisi: asset.status_barang,
      lokasi:  asset.nama_ruangan ?? "—",
      pj:      asset.nama_pj ?? "—",
    })
  }

  const setF = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  const openAdd = () => {
    if (!canManageData) return
    setEditMode(false); setSelected(null); setErrors({})
    setForm({ ...EMPTY, tanggal_service: new Date().toISOString().split("T")[0] })
    setAssetSearch(""); setAssetInfo(null)
    setModalOpen(true)
  }

  const openEdit = (row: ServiceAC) => {
    if (!canManageData) return
    setEditMode(true); setSelected(row); setErrors({})
    const a = allAssets?.find(a => a.id === row.asset_id)
    setAssetSearch(a ? `${a.kode_asset} — ${a.nama_asset}` : row.nama_asset ?? `ID ${row.asset_id}`)
    setAssetInfo({
      kode:    row.kode_asset ?? "—",
      nama:    row.nama_asset ?? "—",
      kondisi: row.kondisi_aset ?? "—",
      lokasi:  row.nama_ruangan ?? "—",
      pj:      row.nama_pj ?? "—",
    })
    setForm({
      asset_id:        String(row.asset_id),
      tanggal_service: row.tanggal_service?.split("T")[0] ?? "",
      jenis_pekerjaan: row.jenis_pekerjaan ?? "",
      biaya:           String(row.biaya ?? 0),
      teknisi:         row.teknisi ?? "",
      keterangan:      row.keterangan ?? "",
    })
    setModalOpen(true)
  }

  const handleSubmit = async () => {
    if (!canManageData) return
    const e: Record<string, string> = {}
    if (!form.asset_id)        e.asset_id        = "Pilih aset"
    if (!form.tanggal_service) e.tanggal_service  = "Isi tanggal service"
    if (!form.jenis_pekerjaan) e.jenis_pekerjaan  = "Isi jenis pekerjaan"
    setErrors(e); if (Object.keys(e).length) return

    setSaving(true)
    try {
      const url    = editMode && selected ? `/api/service-ac/${selected.id}` : "/api/service-ac"
      const method = editMode ? "PUT" : "POST"
      const res = await fetch(url, {
        method, headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          asset_id:        Number(form.asset_id),
          tanggal_service: form.tanggal_service,
          jenis_pekerjaan: form.jenis_pekerjaan,
          biaya:           Number(form.biaya) || 0,
          teknisi:         form.teknisi || null,
          keterangan:      form.keterangan || null,
        }),
      })
      if (!res.ok) { const j = await res.json(); setErrors({ _: j.error ?? "Gagal" }); return }
      setModalOpen(false); refetch()
    } finally { setSaving(false) }
  }

  const handleDelete = async () => {
    if (!selected || !canDeleteData) return
    setDeleting(true)
    try {
      await fetch(`/api/service-ac/${selected.id}`, { method: "DELETE" })
      setDeleteOpen(false); refetch()
    } finally { setDeleting(false) }
  }

  /* ── Columns (sesuai table di Filament) ─────────────────────── */
  const columns: Column<ServiceAC>[] = [
    {
      key: "nama_asset",
      header: "Nama Aset",
      cell: (r) => (
        <div>
          <p className="font-semibold text-sm" style={{ color: "var(--text-900)" }}>{r.nama_asset ?? "—"}</p>
          <p className="text-xs font-mono" style={{ color: "var(--text-subtle)" }}>{r.kode_asset ?? "—"}</p>
        </div>
      ),
    },
    { key: "tanggal_service", header: "Tanggal", cell: (r) => formatDate(r.tanggal_service) },
    {
      key: "jenis_pekerjaan",
      header: "Jenis Pekerjaan",
      cell: (r) => <Badge variant="info">{r.jenis_pekerjaan}</Badge>,
    },
    {
      key: "biaya",
      header: "Biaya",
      cell: (r) => <span className="font-mono text-sm font-semibold">{formatCurrency(Number(r.biaya))}</span>,
    },
    { key: "teknisi", header: "Teknisi / Vendor", cell: (r) => r.teknisi ?? "—" },
  ]

  /* ── Total biaya ────────────────────────────────────────────── */
  const totalBiaya = list.reduce((sum, s) => sum + Number(s.biaya), 0)

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--text-900)" }}>Riwayat Service Aset</h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-subtle)" }}>
            Kelola riwayat service & pemeliharaan aset (AC, peralatan, dll)
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={refetch}><RefreshCw className="h-3.5 w-3.5" /></Button>
          {canManageData && <Button size="sm" onClick={openAdd}><Plus className="h-3.5 w-3.5 mr-1.5" />Tambah Service</Button>}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {[
          { label: "Total Records",  value: list.length,       color: "var(--primary)" },
          { label: "Total Biaya",    value: formatCurrency(totalBiaya), color: "var(--warning)", isCurrency: true },
          { label: "Bulan Ini",      value: list.filter(s => new Date(s.tanggal_service).getMonth() === new Date().getMonth()).length, color: "var(--success)" },
        ].map(s => (
          <div key={s.label} className="rounded-xl p-4" style={{ border: "1px solid var(--border)", background: "var(--surface)" }}>
            <p className="text-xs" style={{ color: "var(--text-subtle)" }}>{s.label}</p>
            <p className="font-bold font-mono mt-0.5" style={{ color: s.color, fontSize: s.isCurrency ? "1rem" : "1.5rem" }}>
              {loading ? "…" : s.value}
            </p>
          </div>
        ))}
      </div>

      {/* Table */}
      <DataTable
        data={list as any} columns={columns as any}
        searchKeys={["nama_asset", "kode_asset", "jenis_pekerjaan", "teknisi"]} loading={loading}
        actions={(row: any) => (
          <div className="flex items-center justify-center gap-1">
            {canManageData && <Button variant="ghost" size="icon" className="h-7 w-7" style={{ color: "var(--warning)" }}
              onClick={() => openEdit(row)}><Pencil className="h-3.5 w-3.5" /></Button>}
            {canDeleteData && <Button variant="ghost" size="icon" className="h-7 w-7" style={{ color: "var(--danger)" }}
              onClick={() => { setSelected(row); setDeleteOpen(true) }}><Trash2 className="h-3.5 w-3.5" /></Button>}
          </div>
        )}
      />

      {/* ── Create / Edit Modal ──────────────────────────────────── */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} size="lg"
        title={editMode ? "Edit Service Aset" : "Tambah Service Aset"}
        description="Catat riwayat pemeliharaan atau perbaikan aset"
        footer={<>
          <Button variant="outline" onClick={() => setModalOpen(false)}>Batal</Button>
          {canManageData && <Button onClick={handleSubmit} disabled={saving}>{saving ? "Menyimpan..." : "Simpan"}</Button>}
        </>}
      >
        <div className="space-y-5">
          {errors._ && <div className="rounded-lg px-4 py-3 text-sm" style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>{errors._}</div>}

          {/* Section: Informasi Aset */}
          <div className="rounded-xl" style={{ border: "1px solid var(--border)" }}>
            <div className="px-4 py-2.5" style={{ background: "var(--surface-muted)", borderBottom: "1px solid var(--border)" }}>
              <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Informasi Aset</span>
            </div>
            <div className="p-4 space-y-4">
              {/* Pilih Aset */}
              <FormField label="Pilih Aset" required error={errors.asset_id}>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5" style={{ color: "var(--text-subtle)" }} />
                  <input
                    type="text"
                    placeholder={editMode ? "Aset terkunci" : "Cari kode atau nama aset..."}
                    value={assetSearch}
                    disabled={editMode}
                    onChange={e => { if (editMode) return; setAssetSearch(e.target.value); setAssetDropdown(true) }}
                    onFocus={() => { if (!editMode && assetSearch.length >= 2) setAssetDropdown(true) }}
                    className="w-full h-8 rounded-lg pl-9 pr-3 text-sm focus:outline-none transition-all duration-150"
                    style={{
                      border: `1px solid ${errors.asset_id ? "var(--danger)" : "var(--border-strong)"}`,
                      background: editMode ? "var(--surface-muted)" : "var(--surface)",
                      color: "var(--text-900)",
                    }}
                  />
                  {/* Dropdown hasil pencarian */}
                  {assetSearch.length >= 2 && assetDropdown && (
                    <div className="absolute z-50 mt-1 w-full rounded-xl shadow-xl" style={{ border: "1px solid var(--border)", background: "var(--surface)", maxHeight: 220, overflowY: "auto" }}>
                      {assetsLoading ? (
                        <div className="px-4 py-3 text-xs" style={{ color: "var(--text-subtle)" }}>
                          Memuat data aset... (total {allAssets?.length ?? 0} aset)
                        </div>
                      ) : filteredAssets.length === 0 ? (
                        <div className="px-4 py-3 text-xs" style={{ color: "var(--text-subtle)" }}>
                          Tidak ada aset yang cocok dengan "{assetSearch}"
                        </div>
                      ) : (
                        filteredAssets.map(a => (
                          <button key={a.id} type="button" onClick={() => handleSelectAsset(a)}
                            className="flex w-full items-start gap-3 px-4 py-2.5 text-left text-sm cursor-pointer transition-colors duration-100"
                            style={{ borderBottom: "1px solid var(--border)" }}
                            onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = "var(--primary-light)")}
                            onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = "transparent")}
                          >
                            <div>
                              <p className="font-semibold" style={{ color: "var(--text-900)" }}>{a.kode_asset}</p>
                              <p className="text-xs" style={{ color: "var(--text-subtle)" }}>{a.nama_asset}</p>
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
                {!editMode && assetSearch.length < 2 && (
                  <p className="text-xs mt-1" style={{ color: "var(--text-subtle)" }}>Ketik minimal 2 karakter untuk mencari aset</p>
                )}
              </FormField>

              {/* Auto-fill info aset (READ-ONLY — sesuai Filament Placeholder 'asset_info') */}
              {assetInfo && (
                <div className="grid grid-cols-2 gap-4 rounded-xl p-4" style={{ background: "var(--primary-light)", border: "1px solid var(--primary-mid)" }}>
                  <InfoRow label="Kode Aset"      value={assetInfo.kode} />
                  <InfoRow label="Kondisi Saat Ini" value={assetInfo.kondisi} />
                  <InfoRow label="Lokasi / Ruangan" value={assetInfo.lokasi} />
                  <InfoRow label="Penanggung Jawab" value={assetInfo.pj} />
                </div>
              )}
            </div>
          </div>

          {/* Section: Detail Pemeliharaan (sesuai Filament Section 'Detail Pemeliharaan') */}
          <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)" }}>
            <div className="px-4 py-2.5" style={{ background: "var(--surface-muted)", borderBottom: "1px solid var(--border)" }}>
              <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Detail Pemeliharaan</span>
            </div>
            <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              <TextField label="Tanggal Servis" type="date" required error={errors.tanggal_service}
                value={form.tanggal_service} onChange={e => setF("tanggal_service", e.target.value)} />
              <TextField label="Jenis Pekerjaan" required error={errors.jenis_pekerjaan}
                placeholder="Cuci AC, Tambah Freon, Ganti Sparepart..."
                value={form.jenis_pekerjaan} onChange={e => setF("jenis_pekerjaan", e.target.value)} />
              <TextField label="Total Biaya (Rp)" type="number"
                value={form.biaya} onChange={e => setF("biaya", e.target.value)} />
              <TextField label="Nama Teknisi / Vendor"
                placeholder="CV Maju Jaya, Pak Budi..."
                value={form.teknisi} onChange={e => setF("teknisi", e.target.value)} />
              <TextareaField label="Catatan Tambahan"
                value={form.keterangan} onChange={e => setF("keterangan", e.target.value)}
                className="md:col-span-2" />
            </div>
          </div>
        </div>
      </Modal>

      <ConfirmDelete open={deleteOpen} onClose={() => setDeleteOpen(false)}
        onConfirm={handleDelete} loading={deleting}
        description={`Hapus record service aset "${selected?.nama_asset}"?`}
      />
    </div>
  )
}

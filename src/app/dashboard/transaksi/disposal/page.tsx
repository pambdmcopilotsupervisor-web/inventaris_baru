"use client"

import React, { useState, useEffect } from "react"
import { DataTable, Column } from "@/components/ui/data-table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Modal } from "@/components/ui/modal"
import { ConfirmDelete } from "@/components/ui/confirm-delete"
import { TextField, SelectField, TextareaField, FormField } from "@/components/ui/form-field"
import { Plus, Eye, Pencil, Trash2, RefreshCw, Search, CheckCircle, Clock, AlertTriangle, Printer, Info } from "lucide-react"
import { formatDate, formatCurrency } from "@/lib/utils"
import { useApi } from "@/hooks/useApi"
import { useAuth, canVerifManager, canVerifKetua } from "@/contexts/AuthContext"
import { canCreateOrEditTransaksi, canDeleteTransaksi } from "@/lib/transaksi-role"

/* ── Types ─────────────────────────────────────────────────────── */
interface Disposal {
  id: number; nomor: string | null; asset_id: number; tgl_pengajuan: string
  kondisi: string | null; keterangan: string | null
  dibuat_oleh: number | null; verif_manager: number; verif_ketua: number
  tgl_verif_manager: string | null; tgl_verif_ketua: string | null
  manager_id: number | null; ketua_id: number | null
  // enriched
  nama_asset?: string; dibuat_oleh_nm?: string; manager_nm?: string; ketua_nm?: string
}

interface Asset {
  id: number; kode_asset: string; nama_asset: string
  hrg_beli: number | null; ruangan_id: number | null
  nama_ruangan?: string | null; lokasi?: string | null
}

interface Karyawan { id: number; nik: string; nama_karyawan: string; jabatan: string }

/* ── Helper: bulan romawi ───────────────────────────────────────── */
const BULAN_ROMAWI: Record<number, string> = {
  1:'I',2:'II',3:'III',4:'IV',5:'V',6:'VI',
  7:'VII',8:'VIII',9:'IX',10:'X',11:'XI',12:'XII',
}

function previewNomor(kode: string): string {
  if (!kode) return ""
  const now = new Date()
  return `${kode.toUpperCase()}.20/KK-PEDAMI/${BULAN_ROMAWI[now.getMonth()+1]}/${now.getFullYear()}`
}

/* ── Badge helper ───────────────────────────────────────────────── */
function VerifBadge({ value, tgl }: { value: number; tgl: string | null }) {
  return value === 1
    ? <div className="flex flex-col gap-0.5">
        <Badge variant="success" className="text-[10px]"><CheckCircle className="h-3 w-3 mr-1" />Sudah Verifikasi</Badge>
        {tgl && <span className="text-[10px]" style={{ color: "var(--text-subtle)" }}>{formatDate(tgl)}</span>}
      </div>
    : <Badge variant="destructive" className="text-[10px]"><Clock className="h-3 w-3 mr-1" />Belum Verifikasi</Badge>
}

/* ── Main Page ──────────────────────────────────────────────────── */
export default function DisposalPage() {
  const { data, loading, refetch } = useApi<Disposal[]>("/api/disposal")
  const { data: allAssets }    = useApi<Asset[]>("/api/aset")
  const { data: allKaryawans } = useApi<Karyawan[]>("/api/karyawan")
  const { user: authUser }     = useAuth()
  const list = data ?? []
  const canManageData = canCreateOrEditTransaksi(authUser?.role)
  const canDeleteData = canDeleteTransaksi(authUser?.role)

  const [modalOpen, setModalOpen]     = useState(false)
  const [viewOpen, setViewOpen]       = useState(false)
  const [deleteOpen, setDeleteOpen]   = useState(false)
  const [verifOpen, setVerifOpen]     = useState(false)
  const [selected, setSelected]       = useState<Disposal | null>(null)
  const [saving, setSaving]           = useState(false)
  const [deleting, setDeleting]       = useState(false)
  const [verifAction, setVerifAction] = useState<"verif_manager" | "verif_ketua" | null>(null)
  const [errors, setErrors]           = useState<Record<string, string>>({})

  // Form state
  const [form, setForm] = useState({
    nomor: "", asset_id: "", tgl_pengajuan: "", kondisi: "", keterangan: "", dibuat_oleh: "",
  })

  // Info aset auto-fill (read-only)
  const [assetInfo, setAssetInfo] = useState<{
    kode: string; nama: string; hrg_beli: string; lokasi: string
  } | null>(null)

  // Asset search
  const [assetSearch, setAssetSearch] = useState("")
  const [assetDropdown, setAssetDropdown] = useState(false)

  const filteredAssets = (allAssets ?? []).filter(a =>
    assetSearch.length >= 2 &&
    (a.kode_asset.toLowerCase().includes(assetSearch.toLowerCase()) ||
     a.nama_asset.toLowerCase().includes(assetSearch.toLowerCase()))
  ).slice(0, 20)

  // Saat pilih aset → auto-fill info aset (READ-ONLY sesuai Filament afterStateUpdated)
  const handleSelectAsset = async (asset: Asset) => {
    setAssetSearch(`${asset.kode_asset} — ${asset.nama_asset}`)
    setAssetDropdown(false)
    setForm(f => ({ ...f, asset_id: String(asset.id) }))

    setAssetInfo({
      kode:    asset.kode_asset,
      nama:    asset.nama_asset,
      hrg_beli: asset.hrg_beli ? formatCurrency(asset.hrg_beli) : "—",
      lokasi:  asset.nama_ruangan
        ? `${asset.nama_ruangan}${asset.lokasi ? ` — ${asset.lokasi}` : ""}`
        : "—",
    })
  }

  const openAdd = () => {
    if (!canManageData) return
    setSelected(null); setErrors({})
    setForm({ nomor: "", asset_id: "", tgl_pengajuan: new Date().toISOString().split("T")[0], kondisi: "", keterangan: "", dibuat_oleh: "" })
    setAssetSearch(""); setAssetInfo(null)
    setModalOpen(true)
  }

  const openEdit = (row: Disposal) => {
    if (!canManageData) return
    // Edit hanya boleh jika KEDUA verifikasi = 0
    if (row.verif_manager !== 0 || row.verif_ketua !== 0) return
    setSelected(row)
    const a = allAssets?.find(a => a.id === row.asset_id)
    setAssetSearch(a ? `${a.kode_asset} — ${a.nama_asset}` : `ID ${row.asset_id}`)
    if (a) {
      setAssetInfo({
        kode:     a.kode_asset,
        nama:     a.nama_asset,
        hrg_beli: a.hrg_beli ? formatCurrency(a.hrg_beli) : "—",
        lokasi:   a.nama_ruangan ?? "—",
      })
    }
    // Tampilkan hanya kode awal dari nomor surat (strip suffix)
    const nomorKode = row.nomor?.split(".")[0] ?? ""
    setForm({
      nomor:        nomorKode,
      asset_id:     String(row.asset_id),
      tgl_pengajuan: row.tgl_pengajuan?.split("T")[0] ?? "",
      kondisi:      row.kondisi ?? "",
      keterangan:   row.keterangan ?? "",
      dibuat_oleh:  String(row.dibuat_oleh ?? ""),
    })
    setErrors({})
    setModalOpen(true)
  }

  const handleSubmit = async () => {
    if (!canManageData) return
    const e: Record<string, string> = {}
    if (!form.asset_id)      e.asset_id      = "Pilih aset"
    if (!form.tgl_pengajuan) e.tgl_pengajuan = "Isi tanggal pengajuan"
    if (!form.kondisi)       e.kondisi       = "Pilih kondisi"
    if (!form.keterangan)    e.keterangan    = "Isi keterangan"
    setErrors(e); if (Object.keys(e).length) return

    setSaving(true)
    try {
      const url    = selected ? `/api/disposal/${selected.id}` : "/api/disposal"
      const method = selected ? "PUT" : "POST"
      const res = await fetch(url, {
        method, headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nomor:         form.nomor || null,
          asset_id:      Number(form.asset_id),
          tgl_pengajuan: form.tgl_pengajuan,
          kondisi:       form.kondisi,
          keterangan:    form.keterangan,
          dibuat_oleh:   form.dibuat_oleh ? Number(form.dibuat_oleh) : null,
        }),
      })
      if (!res.ok) { const j = await res.json(); setErrors({ _: j.error ?? "Gagal" }); return }
      setModalOpen(false); refetch()
    } finally { setSaving(false) }
  }

  // Verifikasi Manager atau Ketua
  const handleVerifikasi = async () => {
    if (!selected || !verifAction) return
    setSaving(true)
    try {
      const res = await fetch(`/api/disposal/${selected.id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: verifAction }),
      })
      if (!res.ok) { const j = await res.json(); alert(j.error ?? "Gagal verifikasi"); return }
      setVerifOpen(false); refetch()
    } finally { setSaving(false) }
  }

  const handleDelete = async () => {
    if (!selected || !canDeleteData) return
    setDeleting(true)
    try {
      await fetch(`/api/disposal/${selected.id}`, { method: "DELETE" })
      setDeleteOpen(false); refetch()
    } finally { setDeleting(false) }
  }

  /* ── Status disposal overall ──────────────────────────────────── */
  const getStatusBadge = (row: Disposal) => {
    if (row.verif_ketua === 1)   return <Badge variant="success">Disetujui</Badge>
    if (row.verif_manager === 1) return <Badge variant="info">Menunggu Ketua</Badge>
    return <Badge variant="warning">Menunggu Manager</Badge>
  }

  /* ── Columns ──────────────────────────────────────────────────── */
  const columns: Column<Disposal>[] = [
    { key: "nomor",        header: "No. Surat",    cell: (r) => r.nomor ? <span className="font-mono text-xs font-medium" style={{ color: "var(--primary)" }}>{r.nomor}</span> : "—" },
    { key: "nama_asset",   header: "Aset",         cell: (r) => <span className="font-semibold">{r.nama_asset}</span> },
    { key: "tgl_pengajuan",header: "Tgl Pengajuan",cell: (r) => formatDate(r.tgl_pengajuan) },
    { key: "dibuat_oleh_nm",header:"Diajukan Oleh",cell: (r) => r.dibuat_oleh_nm ?? "—" },
    { key: "kondisi",      header: "Kondisi",      cell: (r) => r.kondisi ? <Badge variant="warning" className="text-xs">{r.kondisi}</Badge> : "—" },
    { key: "verif_manager",header: "Verif Manager",cell: (r) => <VerifBadge value={r.verif_manager} tgl={r.tgl_verif_manager} /> },
    { key: "verif_ketua",  header: "Verif Ketua",  cell: (r) => <VerifBadge value={r.verif_ketua} tgl={r.tgl_verif_ketua} /> },
    { key: "status",       header: "Status",       cell: (r) => getStatusBadge(r) },
  ]

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--text-900)" }}>Permohonan Disposal Aset</h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-subtle)" }}>
            Proses penghapusan aset — membutuhkan verifikasi 2 tahap (Manager → Ketua)
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={refetch}><RefreshCw className="h-3.5 w-3.5" /></Button>
          {canManageData && <Button size="sm" onClick={openAdd}><Plus className="h-3.5 w-3.5 mr-1.5" />Buat Permohonan</Button>}
        </div>
      </div>

      {/* Info alur verifikasi */}
      <div className="flex items-start gap-3 rounded-xl p-4" style={{ background: "var(--warning-bg)", border: "1px solid #FDE68A" }}>
        <Info className="h-4 w-4 mt-0.5 shrink-0" style={{ color: "var(--warning)" }} />
        <p className="text-xs" style={{ color: "#92400E" }}>
          <strong>Alur Disposal:</strong> Buat permohonan → <strong>Verifikasi Manager</strong> (set status Disetujui Manager) → <strong>Verifikasi Ketua</strong> (set status Disposal &amp; ubah kondisi aset menjadi "Disposal") → Cetak PDF
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total Permohonan",     value: list.length,                                            color: "var(--primary)" },
          { label: "Menunggu Manager",     value: list.filter(d => d.verif_manager === 0).length,        color: "var(--warning)" },
          { label: "Menunggu Ketua",       value: list.filter(d => d.verif_manager === 1 && d.verif_ketua === 0).length, color: "var(--info)" },
          { label: "Disetujui (Disposal)", value: list.filter(d => d.verif_ketua === 1).length,          color: "var(--success)" },
        ].map(s => (
          <Card key={s.label}><CardContent className="p-4">
            <p className="text-xs" style={{ color: "var(--text-subtle)" }}>{s.label}</p>
            <p className="text-2xl font-bold font-mono mt-0.5" style={{ color: s.color }}>{loading ? "…" : s.value}</p>
          </CardContent></Card>
        ))}
      </div>

      {/* Table */}
      <DataTable
        data={list as any} columns={columns as any}
        searchKeys={["nomor", "nama_asset", "keterangan", "dibuat_oleh_nm"]} loading={loading}
        actions={(row: any) => (
          <div className="flex items-center justify-center gap-0.5 flex-nowrap">
            {/* View */}
            <Button variant="ghost" size="icon" className="h-7 w-7" style={{ color: "var(--info)" }}
              title="Detail" onClick={() => { setSelected(row); setViewOpen(true) }}>
              <Eye className="h-3.5 w-3.5" />
            </Button>
            {/* Edit — hanya jika belum ada verifikasi DAN user adalah admin */}
            {row.verif_manager === 0 && row.verif_ketua === 0 && canManageData && (
              <Button variant="ghost" size="icon" className="h-7 w-7" style={{ color: "var(--warning)" }}
                title="Edit" onClick={() => openEdit(row)}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            )}
            {/* Verifikasi Manager — hanya tampil jika user punya jabatan Manager */}
            {row.verif_manager === 0 && canVerifManager(authUser) && (
              <Button variant="ghost" size="icon" className="h-7 w-7" style={{ color: "var(--success)" }}
                title="Verifikasi Manager — klik untuk menyetujui sebagai Manager"
                onClick={() => { setSelected(row); setVerifAction("verif_manager"); setVerifOpen(true) }}>
                <CheckCircle className="h-3.5 w-3.5" />
              </Button>
            )}
            {/* Verifikasi Ketua — hanya tampil jika Manager sudah verif DAN user punya jabatan Ketua */}
            {row.verif_manager === 1 && row.verif_ketua === 0 && canVerifKetua(authUser) && (
              <Button variant="ghost" size="icon" className="h-7 w-7" style={{ color: "var(--primary)" }}
                title="Verifikasi Ketua — klik untuk menyetujui (aset akan jadi Disposal)"
                onClick={() => { setSelected(row); setVerifAction("verif_ketua"); setVerifOpen(true) }}>
                <CheckCircle className="h-3.5 w-3.5" />
              </Button>
            )}
            {/* Cetak PDF — hanya setelah KEDUA verifikasi selesai */}
            {row.verif_manager === 1 && row.verif_ketua === 1 && (
              <Button variant="ghost" size="icon" className="h-7 w-7" style={{ color: "var(--primary)" }}
                title="Cetak PDF" onClick={() => alert("Cetak PDF — akan tersedia segera")}>
                <Printer className="h-3.5 w-3.5" />
              </Button>
            )}
            {/* Delete */}
            {canDeleteData && (
              <Button variant="ghost" size="icon" className="h-7 w-7" style={{ color: "var(--danger)" }}
                title="Hapus" onClick={() => { setSelected(row); setDeleteOpen(true) }}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        )}
      />

      {/* ── Create / Edit Modal ──────────────────────────────────── */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} size="lg"
        title={selected ? "Edit Permohonan Disposal" : "Buat Permohonan Disposal"}
        description={selected ? "Edit hanya bisa dilakukan sebelum verifikasi dimulai" : "Isi detail permohonan penghapusan aset"}
        footer={<>
          <Button variant="outline" onClick={() => setModalOpen(false)}>Batal</Button>
          {canManageData && <Button onClick={handleSubmit} disabled={saving}>{saving ? "Menyimpan..." : "Simpan Permohonan"}</Button>}
        </>}
      >
        <div className="space-y-4">
          {errors._ && <div className="rounded-lg px-4 py-3 text-sm" style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>{errors._}</div>}

          {/* Nomor surat */}
          <div className="space-y-1.5">
            <FormField label="Kode Nomor Surat" error={errors.nomor}>
              <TextField label="" placeholder="Contoh: 001"
                value={form.nomor}
                onChange={e => setForm(f => ({ ...f, nomor: e.target.value }))} />
            </FormField>
            {form.nomor && (
              <p className="text-xs px-2" style={{ color: "var(--text-subtle)" }}>
                Format tersimpan: <strong className="font-mono" style={{ color: "var(--primary)" }}>{previewNomor(form.nomor)}</strong>
              </p>
            )}
          </div>

          {/* Pilih Aset */}
          <FormField label="Pilih Aset" required error={errors.asset_id}>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5" style={{ color: "var(--text-subtle)" }} />
              <input type="text"
                placeholder={selected ? "Aset terkunci (tidak dapat diubah)" : "Cari kode atau nama aset..."}
                value={assetSearch}
                disabled={!!selected}
                onChange={e => { if (selected) return; setAssetSearch(e.target.value); setAssetDropdown(true) }}
                className="w-full h-8 rounded-lg pl-9 pr-3 text-sm focus:outline-none transition-all duration-150"
                style={{
                  border: `1px solid ${errors.asset_id ? "var(--danger)" : "var(--border-strong)"}`,
                  background: selected ? "var(--surface-muted)" : "var(--surface)",
                  color: "var(--text-900)",
                }}
              />
              {assetDropdown && filteredAssets.length > 0 && (
                <div className="absolute z-[300] mt-1 w-full rounded-xl shadow-xl" style={{ border: "1px solid var(--border)", background: "var(--surface)", maxHeight: 200, overflowY: "auto" }}>
                  {filteredAssets.map(a => (
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
                  ))}
                </div>
              )}
            </div>
          </FormField>

          {/* Info Aset — READ-ONLY (sesuai Section 'Informasi Aset' di Filament) */}
          {assetInfo && (
            <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)" }}>
              <div className="px-4 py-2.5 flex items-center gap-2" style={{ background: "var(--surface-muted)", borderBottom: "1px solid var(--border)" }}>
                <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Informasi Aset</span>
                <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ background: "var(--surface-hover)", color: "var(--text-subtle)" }}>Read-only · Otomatis diisi</span>
              </div>
              <div className="p-4 grid grid-cols-2 gap-4 text-sm">
                {[
                  ["Kode Aset",   assetInfo.kode],
                  ["Nama Aset",   assetInfo.nama],
                  ["Harga Beli",  assetInfo.hrg_beli],
                  ["Lokasi Aset", assetInfo.lokasi],
                ].map(([k, v]) => (
                  <div key={String(k)}>
                    <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-subtle)" }}>{k}</p>
                    <p className="mt-0.5 font-medium" style={{ color: "var(--text-900)" }}>{v}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <TextField label="Tanggal Pengajuan" type="date" required error={errors.tgl_pengajuan}
              value={form.tgl_pengajuan} onChange={e => setForm(f => ({ ...f, tgl_pengajuan: e.target.value }))} />
            <SelectField label="Kondisi Aset" required error={errors.kondisi}
              value={form.kondisi} onChange={e => setForm(f => ({ ...f, kondisi: e.target.value }))}
              placeholder="— Pilih Kondisi —"
              options={[{ value: "Rusak Sebagian", label: "Rusak Sebagian" }, { value: "Rusak Total", label: "Rusak Total" }]} />
          </div>

          <TextareaField label="Keterangan / Alasan Disposal" required error={errors.keterangan}
            value={form.keterangan} onChange={e => setForm(f => ({ ...f, keterangan: e.target.value }))}
            placeholder="Jelaskan alasan pengajuan disposal aset..." />
        </div>
      </Modal>

      {/* ── Konfirmasi Verifikasi Modal ───────────────────────────── */}
      <Modal
        open={verifOpen} onClose={() => setVerifOpen(false)} size="sm"
        title={verifAction === "verif_manager" ? "Verifikasi Manager" : "Verifikasi Ketua"}
        footer={<>
          <Button variant="outline" onClick={() => setVerifOpen(false)}>Batal</Button>
          <Button onClick={handleVerifikasi} disabled={saving}
            style={{ background: verifAction === "verif_ketua" ? "var(--primary)" : "var(--success)", color: "#fff" }}>
            {saving ? "Memproses..." : "Ya, Verifikasi"}
          </Button>
        </>}
      >
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full" style={{ background: verifAction === "verif_ketua" ? "var(--primary-light)" : "var(--success-bg)" }}>
            <CheckCircle className="h-5 w-5" style={{ color: verifAction === "verif_ketua" ? "var(--primary)" : "var(--success)" }} />
          </div>
          <div className="pt-1">
            <p className="text-sm font-semibold" style={{ color: "var(--text-900)" }}>
              {verifAction === "verif_manager"
                ? "Verifikasi sebagai Manager"
                : "Verifikasi sebagai Ketua"}
            </p>
            <p className="text-xs mt-1" style={{ color: "var(--text-subtle)" }}>
              Aset: <strong>{selected?.nama_asset}</strong>
            </p>
            {verifAction === "verif_ketua" && (
              <div className="mt-3 rounded-lg px-3 py-2 text-xs" style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>
                <strong>⚠ Perhatian:</strong> Setelah verifikasi Ketua, status aset akan <strong>berubah menjadi "Disposal"</strong> secara permanen.
              </div>
            )}
          </div>
        </div>
      </Modal>

      {/* ── View Detail Modal ──────────────────────────────────────── */}
      <Modal open={viewOpen} onClose={() => setViewOpen(false)} title="Detail Permohonan Disposal" size="lg">
        {selected && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-4 text-sm">
              {[
                ["No. Surat",      selected.nomor ?? "—"],
                ["Aset",           selected.nama_asset ?? "—"],
                ["Tgl Pengajuan",  formatDate(selected.tgl_pengajuan)],
                ["Kondisi",        selected.kondisi ?? "—"],
                ["Diajukan Oleh",  selected.dibuat_oleh_nm ?? "—"],
                ["Keterangan",     selected.keterangan ?? "—"],
              ].map(([k, v]) => (
                <div key={String(k)}>
                  <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-subtle)" }}>{k}</p>
                  <p className="mt-0.5 font-medium" style={{ color: "var(--text-900)" }}>{v}</p>
                </div>
              ))}
            </div>

            {/* Verifikasi status */}
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-xl p-4 space-y-2" style={{ background: selected.verif_manager === 1 ? "var(--success-bg)" : "var(--danger-bg)", border: `1px solid ${selected.verif_manager === 1 ? "#A7F3D0" : "#FECACA"}` }}>
                <p className="text-xs font-bold uppercase tracking-wider" style={{ color: selected.verif_manager === 1 ? "var(--success)" : "var(--danger)" }}>Verifikasi Manager</p>
                <p className="font-semibold text-sm">{selected.manager_nm ?? "—"}</p>
                <VerifBadge value={selected.verif_manager} tgl={selected.tgl_verif_manager} />
              </div>
              <div className="rounded-xl p-4 space-y-2" style={{ background: selected.verif_ketua === 1 ? "var(--success-bg)" : "var(--primary-light)", border: `1px solid ${selected.verif_ketua === 1 ? "#A7F3D0" : "var(--primary-mid)"}` }}>
                <p className="text-xs font-bold uppercase tracking-wider" style={{ color: selected.verif_ketua === 1 ? "var(--success)" : "var(--primary)" }}>Verifikasi Ketua</p>
                <p className="font-semibold text-sm">{selected.ketua_nm ?? "—"}</p>
                <VerifBadge value={selected.verif_ketua} tgl={selected.tgl_verif_ketua} />
              </div>
            </div>

            {/* Overall status */}
            <div className="flex items-center justify-between p-4 rounded-xl" style={{ background: "var(--surface-muted)", border: "1px solid var(--border)" }}>
              <span className="text-sm font-semibold" style={{ color: "var(--text-900)" }}>Status Permohonan</span>
              {getStatusBadge(selected)}
            </div>
          </div>
        )}
      </Modal>

      {/* Delete confirm */}
      <ConfirmDelete open={deleteOpen} onClose={() => setDeleteOpen(false)}
        onConfirm={handleDelete} loading={deleting}
        title="Hapus Permohonan Disposal"
        description={`Hapus permohonan disposal untuk aset "${selected?.nama_asset}"? ${selected?.verif_ketua === 1 ? "Status aset akan dikembalikan ke 'Baik'." : ""}`}
      />
    </div>
  )
}

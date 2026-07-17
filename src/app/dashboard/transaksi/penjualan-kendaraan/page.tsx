"use client"

import React, { useState } from "react"
import { DataTable, Column } from "@/components/ui/data-table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Modal } from "@/components/ui/modal"
import { ConfirmDelete } from "@/components/ui/confirm-delete"
import { TextField, FormField } from "@/components/ui/form-field"
import { Plus, Trash2, RefreshCw, Search, AlertTriangle, Info } from "lucide-react"
import { formatDate, formatCurrency } from "@/lib/utils"
import { useApi } from "@/hooks/useApi"
import { useAuth } from "@/contexts/AuthContext"
import { canCreateOrEditTransaksi, canDeleteTransaksi } from "@/lib/transaksi-role"

/* ── Types ─────────────────────────────────────────────────────── */
interface PenjualanR2r4 {
  id: number; data_r2r4_id: number | null
  tgl_jual: string | null; hrg_jual: number | null; nm_pembeli: string | null
  // enriched
  plat?: string; nm_brg?: string; kode_brg?: string; jns_brg?: string
}
interface Kendaraan {
  id: number; kode_brg: string; plat: string; nm_brg: string; jns_brg: string
  thn: number | null; no_rangka: string | null; no_mesin: string | null
  warna: string | null; no_bpkb: string | null; stat: string | null
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-subtle)" }}>{label}</span>
      <span className="text-sm font-medium" style={{ color: "var(--text-900)" }}>{value || "—"}</span>
    </div>
  )
}

const EMPTY = { data_r2r4_id: "", tgl_jual: "", hrg_jual: "", nm_pembeli: "" }

export default function PenjualanKendaraanPage() {
  const { user } = useAuth()
  const { data, loading, refetch } = useApi<PenjualanR2r4[]>("/api/penjualan-kendaraan")
  // Hanya tampilkan kendaraan yang BELUM terjual (stat !== 'Terjual') untuk dipilih
  const { data: allKendaraans } = useApi<Kendaraan[]>("/api/kendaraan")
  const list = data ?? []

  const [modalOpen, setModalOpen]   = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [selected, setSelected]     = useState<PenjualanR2r4 | null>(null)
  const [saving, setSaving]         = useState(false)
  const [deleting, setDeleting]     = useState(false)
  const [form, setForm]             = useState(EMPTY)
  const [errors, setErrors]         = useState<Record<string, string>>({})
  const canManageData = canCreateOrEditTransaksi(user?.role)
  const canDeleteData = canDeleteTransaksi(user?.role)

  // Info kendaraan auto-fill (READ-ONLY — sesuai Filament afterStateUpdated)
  const [vehicleInfo, setVehicleInfo] = useState<{
    kode: string; plat: string; jenis: string; nama: string
    thn: string; no_rangka: string; no_mesin: string; warna: string; bpkb: string
  } | null>(null)

  // Search kendaraan (format: {kode_brg} - {plat})
  const [kendaraanSearch, setKendaraanSearch] = useState("")
  const [kendaraanDropdown, setKendaraanDropdown] = useState(false)

  // Filter: hanya tampilkan yang belum terjual
  const availableKendaraans = (allKendaraans ?? []).filter(k => k.stat !== "Terjual")

  const filteredKendaraans = availableKendaraans.filter(k =>
    kendaraanSearch.length >= 2 &&
    (k.kode_brg.toLowerCase().includes(kendaraanSearch.toLowerCase()) ||
     k.plat.toLowerCase().includes(kendaraanSearch.toLowerCase()) ||
     k.nm_brg.toLowerCase().includes(kendaraanSearch.toLowerCase()))
  ).slice(0, 20)

  const setF = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  // Saat pilih kendaraan → auto-fill semua info (READ-ONLY sesuai Filament)
  const handleSelectKendaraan = (k: Kendaraan) => {
    // Format: kode_brg - plat (sesuai getOptionLabelFromRecordUsing Filament)
    setKendaraanSearch(`${k.kode_brg} - ${k.plat}`)
    setKendaraanDropdown(false)
    setF("data_r2r4_id", String(k.id))
    setVehicleInfo({
      kode:     k.kode_brg,
      plat:     k.plat,
      jenis:    k.jns_brg,
      nama:     k.nm_brg,
      thn:      k.thn ? String(k.thn) : "—",
      no_rangka: k.no_rangka ?? "—",
      no_mesin:  k.no_mesin  ?? "—",
      warna:    k.warna      ?? "—",
      bpkb:     k.no_bpkb    ?? "—",
    })
  }

  const openAdd = () => {
    if (!canManageData) return
    setSelected(null); setErrors({})
    setForm({ ...EMPTY, tgl_jual: new Date().toISOString().split("T")[0] })
    setKendaraanSearch(""); setVehicleInfo(null)
    setModalOpen(true)
  }

  const handleSubmit = async () => {
    if (!canManageData) return
    const e: Record<string, string> = {}
    if (!form.data_r2r4_id) e.data_r2r4_id = "Pilih kendaraan"
    setErrors(e); if (Object.keys(e).length) return

    setSaving(true)
    try {
      const res = await fetch("/api/penjualan-kendaraan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          data_r2r4_id: Number(form.data_r2r4_id),
          tgl_jual:     form.tgl_jual || null,
          hrg_jual:     form.hrg_jual ? Number(form.hrg_jual) : null,
          nm_pembeli:   form.nm_pembeli || null,
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
      await fetch(`/api/penjualan-kendaraan/${selected.id}`, { method: "DELETE" })
      setDeleteOpen(false); refetch()
    } finally { setDeleting(false) }
  }

  const totalPendapatan = list.reduce((s, p) => s + Number(p.hrg_jual ?? 0), 0)

  /* ── Columns (sesuai Filament table) ────────────────────────── */
  const columns: Column<PenjualanR2r4>[] = [
    {
      key: "plat",
      header: "Nopol / Kendaraan",
      cell: (r) => (
        <div>
          <p className="font-semibold font-mono text-sm" style={{ color: "var(--text-900)" }}>{r.plat ?? "—"}</p>
          <p className="text-xs" style={{ color: "var(--text-subtle)" }}>{r.nm_brg ?? "—"}</p>
        </div>
      ),
    },
    { key: "jns_brg", header: "Jenis", cell: (r) => r.jns_brg ? <Badge variant="secondary" className="text-xs">{r.jns_brg}</Badge> : "—" },
    { key: "tgl_jual", header: "Tgl Jual", cell: (r) => r.tgl_jual ? formatDate(r.tgl_jual) : "—" },
    {
      key: "hrg_jual",
      header: "Harga Jual",
      cell: (r) => r.hrg_jual
        ? <span className="font-mono font-semibold" style={{ color: "var(--success)" }}>{formatCurrency(Number(r.hrg_jual))}</span>
        : "—",
    },
    { key: "nm_pembeli", header: "Nama Pembeli", cell: (r) => r.nm_pembeli ?? "—" },
  ]

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--text-900)" }}>Penjualan R2 & R4</h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-subtle)" }}>
            Data penjualan kendaraan — setelah dijual, status kendaraan berubah menjadi "Terjual" permanen
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={refetch}><RefreshCw className="h-3.5 w-3.5" /></Button>
          {canManageData && <Button size="sm" onClick={openAdd}><Plus className="h-3.5 w-3.5 mr-1.5" />Tambah Penjualan</Button>}
        </div>
      </div>

      {/* Warning */}
      <div className="flex items-start gap-3 rounded-xl p-4" style={{ background: "var(--danger-bg)", border: "1px solid #FECACA" }}>
        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" style={{ color: "var(--danger)" }} />
        <p className="text-xs" style={{ color: "#991B1B" }}>
          <strong>Perhatian:</strong> Setelah data penjualan disimpan, <strong>status kendaraan akan berubah menjadi "Terjual" secara permanen</strong> dan tidak bisa dipilih lagi dalam form lain. Hanya kendaraan yang belum terjual yang dapat dipilih.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Total Penjualan",     value: list.length,             color: "var(--primary)" },
          { label: "Total Pendapatan",    value: formatCurrency(totalPendapatan), color: "var(--success)", isText: true },
          { label: "Kendaraan Tersedia", value: `${availableKendaraans.length} unit`, color: "var(--info)", isText: true },
        ].map(s => (
          <Card key={s.label}><CardContent className="p-4">
            <p className="text-xs" style={{ color: "var(--text-subtle)" }}>{s.label}</p>
            <p className={`font-bold font-mono mt-0.5 ${s.isText ? "text-base" : "text-2xl"}`} style={{ color: s.color }}>
              {loading ? "…" : s.value}
            </p>
          </CardContent></Card>
        ))}
      </div>

      {/* Table */}
      <DataTable
        data={list as any} columns={columns as any}
        searchKeys={["nm_pembeli"]} loading={loading}
        emptyMessage="Tidak ada data penjualan"
        actions={(row: any) => (
          canDeleteData ? (
            <Button variant="ghost" size="icon" className="h-7 w-7" style={{ color: "var(--danger)" }}
              onClick={() => { setSelected(row); setDeleteOpen(true) }}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          ) : null
        )}
      />

      {/* ── Add Modal ─────────────────────────────────────────── */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} size="lg"
        title="Tambah Data Penjualan Kendaraan"
        description="Pilih kendaraan yang akan dijual"
        footer={<>
          <Button variant="outline" onClick={() => setModalOpen(false)}>Batal</Button>
          {canManageData && <Button onClick={handleSubmit} disabled={saving}
            style={{ background: "var(--danger)", color: "#fff" }}>
            {saving ? "Menyimpan..." : "Simpan & Set Terjual"}
          </Button>}
        </>}
      >
        <div className="space-y-5">
          {errors._ && <div className="rounded-lg px-4 py-3 text-sm" style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>{errors._}</div>}

          {/* Pilih Kendaraan — format: kode_brg - plat */}
          <FormField label="Pilih Kendaraan (Belum Terjual)" required error={errors.data_r2r4_id}>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5" style={{ color: "var(--text-subtle)" }} />
              <input type="text"
                placeholder="Cari kode, plat, atau nama kendaraan yang belum terjual..."
                value={kendaraanSearch}
                onChange={e => { setKendaraanSearch(e.target.value); setKendaraanDropdown(true) }}
                className="w-full h-8 rounded-lg pl-9 pr-3 text-sm focus:outline-none transition-all duration-150"
                style={{ border: `1px solid ${errors.data_r2r4_id ? "var(--danger)" : "var(--border-strong)"}`, background: "var(--surface)", color: "var(--text-900)" }}
              />
              {kendaraanSearch.length >= 2 && kendaraanDropdown && (
                <div className="absolute z-50 mt-1 w-full rounded-xl shadow-xl" style={{ border: "1px solid var(--border)", background: "var(--surface)", maxHeight: 200, overflowY: "auto" }}>
                  {filteredKendaraans.length === 0 ? (
                    <div className="px-4 py-3 text-xs" style={{ color: "var(--text-subtle)" }}>Tidak ada kendaraan yang cocok (atau sudah terjual)</div>
                  ) : (
                    filteredKendaraans.map(k => (
                      <button key={k.id} type="button" onClick={() => handleSelectKendaraan(k)}
                        className="flex w-full items-start gap-3 px-4 py-2.5 text-left text-sm cursor-pointer transition-colors duration-100"
                        style={{ borderBottom: "1px solid var(--border)" }}
                        onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = "var(--primary-light)")}
                        onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = "transparent")}
                      >
                        <div>
                          <p className="font-semibold font-mono" style={{ color: "var(--text-900)" }}>{k.kode_brg} - {k.plat}</p>
                          <p className="text-xs" style={{ color: "var(--text-subtle)" }}>{k.nm_brg} · {k.jns_brg}</p>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          </FormField>

          {/* Section Informasi Kendaraan — READ-ONLY (sesuai Filament Section 'Informasi Kendaraan' visible when data_r2r4_id filled) */}
          {vehicleInfo && (
            <div className="rounded-xl" style={{ border: "1px solid var(--border)" }}>
              <div className="px-4 py-2.5" style={{ background: "var(--surface-muted)", borderBottom: "1px solid var(--border)" }}>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Informasi Kendaraan</span>
                  <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ background: "var(--surface-hover)", color: "var(--text-subtle)" }}>Read-only</span>
                </div>
              </div>
              <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-4">
                <InfoRow label="Kode / Jenis"  value={`${vehicleInfo.kode} / ${vehicleInfo.jenis}`} />
                <InfoRow label="Nama Kendaraan" value={vehicleInfo.nama} />
                <InfoRow label="Tahun"          value={vehicleInfo.thn} />
                <InfoRow label="Warna"          value={vehicleInfo.warna} />
                <InfoRow label="No Rangka"      value={vehicleInfo.no_rangka} />
                <InfoRow label="No Mesin"       value={vehicleInfo.no_mesin} />
                <InfoRow label="No BPKB"        value={vehicleInfo.bpkb} />
              </div>
            </div>
          )}

          {/* Data penjualan */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <TextField label="Tanggal Jual" type="date"
              value={form.tgl_jual} onChange={e => setF("tgl_jual", e.target.value)} />
            <TextField label="Harga Jual (Rp)" type="number"
              value={form.hrg_jual} onChange={e => setF("hrg_jual", e.target.value)} />
            <TextField label="Nama Pembeli" placeholder="Nama pembeli kendaraan"
              value={form.nm_pembeli} onChange={e => setF("nm_pembeli", e.target.value)} />
          </div>

          {vehicleInfo && (
            <div className="flex items-start gap-2 rounded-xl p-3 text-xs" style={{ background: "var(--danger-bg)", border: "1px solid #FECACA" }}>
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" style={{ color: "var(--danger)" }} />
              <span style={{ color: "#991B1B" }}>
                Setelah disimpan, kendaraan <strong>{vehicleInfo.kode} - {vehicleInfo.plat}</strong> akan berstatus <strong>"Terjual"</strong> dan tidak bisa dipilih dalam transaksi lain.
              </span>
            </div>
          )}
        </div>
      </Modal>

      <ConfirmDelete open={deleteOpen} onClose={() => setDeleteOpen(false)}
        onConfirm={handleDelete} loading={deleting}
        title="Hapus Data Penjualan"
        description={`Hapus penjualan kendaraan "${selected?.plat ?? ""}"? Status kendaraan akan dikembalikan ke "Operasional Pedami".`}
      />
    </div>
  )
}

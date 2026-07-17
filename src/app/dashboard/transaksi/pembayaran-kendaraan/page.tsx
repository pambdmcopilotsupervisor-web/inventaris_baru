"use client"

import React, { useState } from "react"
import { DataTable, Column } from "@/components/ui/data-table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Modal } from "@/components/ui/modal"
import { ConfirmDelete } from "@/components/ui/confirm-delete"
import { TextField, SelectField, TextareaField, FormField } from "@/components/ui/form-field"
import { Plus, Trash2, RefreshCw, Search, AlertTriangle, CheckCircle } from "lucide-react"
import { formatDate, formatCurrency } from "@/lib/utils"
import { useApi } from "@/hooks/useApi"
import { useCrud } from "@/hooks/useCrud"
import { useAuth } from "@/contexts/AuthContext"
import { canCreateOrEditTransaksi, canDeleteTransaksi } from "@/lib/transaksi-role"

/* ── Types ─────────────────────────────────────────────────────── */
interface Pembayaran {
  id: number; data_r2r4_id: number
  jenis_pembayaran: string; tanggal_pembayaran: string
  biaya: number; jatuh_tempo_berikutnya: string | null; keterangan: string | null
  // enriched
  data_r2r4s?: { kode_brg: string; plat: string; nm_brg: string }
}
interface Kendaraan {
  id: number; kode_brg: string; plat: string; nm_brg: string
  pemegang: string | null; departemen: string | null
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-subtle)" }}>{label}</span>
      <span className="text-sm font-medium" style={{ color: "var(--text-900)" }}>{value || "—"}</span>
    </div>
  )
}

const JENIS_OPTS = [
  { value: "Pajak", label: "Pajak Tahunan" },
  { value: "STNK",  label: "STNK / Ganti Plat (5 Tahun)" },
  { value: "KIR",   label: "KIR (Uji Berkala)" },
]

const JENIS_VARIANT: Record<string, "default" | "success" | "warning"> = {
  Pajak: "default", STNK: "success", KIR: "warning",
}

const EMPTY = { data_r2r4_id: "", jenis_pembayaran: "Pajak", tanggal_pembayaran: "", biaya: "0", jatuh_tempo_berikutnya: "", keterangan: "" }

const isJatuhTempoLewat = (tgl: string | null) => tgl && new Date(tgl) < new Date()
const isJatuhTempoDekat = (tgl: string | null) => {
  if (!tgl) return false
  const sisa = Math.floor((new Date(tgl).getTime() - Date.now()) / 86400000)
  return sisa >= 0 && sisa <= 30
}

export default function PembayaranKendaraanPage() {
  const { user } = useAuth()
  const { data, loading, refetch } = useApi<Pembayaran[]>("/api/pembayaran-kendaraan")
  const { data: allKendaraans }    = useApi<Kendaraan[]>("/api/kendaraan")
  const list = data ?? []
  const { remove, deleting } = useCrud<Pembayaran>({ apiPath: "/api/pembayaran-kendaraan", onSuccess: refetch })
  const canManageData = canCreateOrEditTransaksi(user?.role)
  const canDeleteData = canDeleteTransaksi(user?.role)

  const [modalOpen, setModalOpen]   = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [selected, setSelected]     = useState<Pembayaran | null>(null)
  const [saving, setSaving]         = useState(false)
  const [form, setForm]             = useState(EMPTY)
  const [errors, setErrors]         = useState<Record<string, string>>({})
  const [jenisFilter, setJenisFilter] = useState("")

  // Info kendaraan auto-fill
  const [vehicleInfo, setVehicleInfo] = useState<{
    plat: string; nama: string; pemegang: string; departemen: string
  } | null>(null)

  // Search kendaraan
  const [kendaraanSearch, setKendaraanSearch] = useState("")
  const [kendaraanDropdown, setKendaraanDropdown] = useState(false)

  const filteredKendaraans = (allKendaraans ?? []).filter(k =>
    kendaraanSearch.length >= 2 &&
    (k.plat.toLowerCase().includes(kendaraanSearch.toLowerCase()) ||
     k.nm_brg.toLowerCase().includes(kendaraanSearch.toLowerCase()))
  ).slice(0, 20)

  const setF = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  const handleSelectKendaraan = (k: Kendaraan) => {
    setKendaraanSearch(`${k.plat} - ${k.nm_brg}${k.departemen ? ` (${k.departemen})` : ""}`)
    setKendaraanDropdown(false)
    setF("data_r2r4_id", String(k.id))
    setVehicleInfo({
      plat:      k.plat,
      nama:      k.nm_brg,
      pemegang:  k.pemegang ?? "—",
      departemen: k.departemen ?? "—",
    })
  }

  const openAdd = () => {
    if (!canManageData) return
    setSelected(null); setErrors({})
    setForm({ ...EMPTY, tanggal_pembayaran: new Date().toISOString().split("T")[0] })
    setKendaraanSearch(""); setVehicleInfo(null)
    setModalOpen(true)
  }

  const handleSubmit = async () => {
    if (!canManageData) return
    const e: Record<string, string> = {}
    if (!form.data_r2r4_id)        e.data_r2r4_id        = "Pilih kendaraan"
    if (!form.jenis_pembayaran)     e.jenis_pembayaran    = "Pilih jenis pembayaran"
    if (!form.tanggal_pembayaran)   e.tanggal_pembayaran  = "Isi tanggal pembayaran"
    if (!form.biaya)                e.biaya               = "Isi biaya"
    setErrors(e); if (Object.keys(e).length) return

    setSaving(true)
    try {
      const res = await fetch("/api/pembayaran-kendaraan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          data_r2r4_id:          Number(form.data_r2r4_id),
          jenis_pembayaran:      form.jenis_pembayaran,
          tanggal_pembayaran:    form.tanggal_pembayaran,
          biaya:                 Number(form.biaya) || 0,
          jatuh_tempo_berikutnya: form.jatuh_tempo_berikutnya || null,
          keterangan:            form.keterangan || null,
        }),
      })
      if (!res.ok) { const j = await res.json(); setErrors({ _: j.error ?? "Gagal" }); return }
      setModalOpen(false); refetch()
    } finally { setSaving(false) }
  }

  const handleDelete = async () => {
    if (!selected || !canDeleteData) return
    const ok = await remove(selected.id)
    if (ok) setDeleteOpen(false)
  }

  // Filter by jenis
  const filteredList = jenisFilter ? list.filter(p => p.jenis_pembayaran === jenisFilter) : list
  const totalBiaya   = filteredList.reduce((s, p) => s + Number(p.biaya), 0)

  /* ── Columns (sesuai Filament table) ────────────────────────── */
  const columns: Column<Pembayaran>[] = [
    {
      key: "plat",
      header: "Plat / Kendaraan",
      cell: (r) => (
        <div>
          <p className="font-semibold font-mono text-sm" style={{ color: "var(--text-900)" }}>
            {r.data_r2r4s?.plat ?? "—"}
          </p>
          <p className="text-xs" style={{ color: "var(--text-subtle)" }}>
            {r.data_r2r4s?.nm_brg ?? "—"}
          </p>
        </div>
      ),
    },
    {
      key: "jenis_pembayaran",
      header: "Jenis",
      cell: (r) => <Badge variant={JENIS_VARIANT[r.jenis_pembayaran] ?? "secondary"}>{r.jenis_pembayaran}</Badge>,
    },
    { key: "tanggal_pembayaran", header: "Tanggal Bayar", cell: (r) => formatDate(r.tanggal_pembayaran) },
    {
      key: "biaya",
      header: "Biaya",
      cell: (r) => <span className="font-mono font-semibold">{formatCurrency(Number(r.biaya))}</span>,
    },
    {
      key: "jatuh_tempo_berikutnya",
      header: "Jatuh Tempo",
      cell: (r) => {
        if (!r.jatuh_tempo_berikutnya) return <span style={{ color: "var(--text-subtle)" }}>—</span>
        const lewat = isJatuhTempoLewat(r.jatuh_tempo_berikutnya)
        const dekat = isJatuhTempoDekat(r.jatuh_tempo_berikutnya)
        return (
          <div className="flex items-center gap-1">
            {lewat
              ? <AlertTriangle className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--danger)" }} />
              : dekat
              ? <AlertTriangle className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--warning)" }} />
              : <CheckCircle  className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--success)" }} />
            }
            <span style={{
              color: lewat ? "var(--danger)" : dekat ? "var(--warning)" : "var(--text-900)",
              fontWeight: lewat || dekat ? 600 : 400,
            }}>
              {formatDate(r.jatuh_tempo_berikutnya)}
              {lewat ? " ⚠ Lewat!" : dekat ? " (Segera)" : ""}
            </span>
          </div>
        )
      },
    },
    { key: "keterangan", header: "Catatan", cell: (r) => <span className="text-xs">{r.keterangan ?? "—"}</span> },
  ]

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--text-900)" }}>Riwayat Pembayaran Pajak / STNK / KIR</h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-subtle)" }}>
            Kelola riwayat pembayaran pajak tahunan, STNK, dan KIR kendaraan
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={refetch}><RefreshCw className="h-3.5 w-3.5" /></Button>
          {canManageData && <Button size="sm" onClick={openAdd}><Plus className="h-3.5 w-3.5 mr-1.5" />Tambah Pembayaran</Button>}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total Records",   value: list.length,                                   color: "var(--primary)" },
          { label: "Pajak",           value: list.filter(p => p.jenis_pembayaran === "Pajak").length, color: "var(--primary)" },
          { label: "STNK",            value: list.filter(p => p.jenis_pembayaran === "STNK").length,  color: "var(--success)" },
          { label: "KIR",             value: list.filter(p => p.jenis_pembayaran === "KIR").length,   color: "var(--warning)" },
        ].map(s => (
          <div key={s.label} className="rounded-xl p-4" style={{ border: "1px solid var(--border)", background: "var(--surface)" }}>
            <p className="text-xs" style={{ color: "var(--text-subtle)" }}>{s.label}</p>
            <p className="text-xl font-bold font-mono mt-0.5" style={{ color: s.color }}>{loading ? "…" : s.value}</p>
          </div>
        ))}
      </div>

      {/* Filter jenis pembayaran */}
      <div className="flex items-center gap-3 flex-wrap">
        <select value={jenisFilter} onChange={e => setJenisFilter(e.target.value)}
          className="h-8 rounded-lg px-3 text-sm cursor-pointer"
          style={{ border: "1px solid var(--border-strong)", background: "var(--surface)", color: "var(--text-900)" }}>
          <option value="">Semua Jenis</option>
          {JENIS_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        {jenisFilter && (
          <Button variant="ghost" size="sm" onClick={() => setJenisFilter("")}>Reset</Button>
        )}
        <span className="text-xs ml-auto font-semibold" style={{ color: "var(--text-muted)" }}>
          Total: {formatCurrency(totalBiaya)}
        </span>
      </div>

      {/* Table */}
      <DataTable
        data={filteredList as any} columns={columns as any}
        searchKeys={["jenis_pembayaran"]} loading={loading}
        emptyMessage="Tidak ada data pembayaran"
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
        title="Tambah Pembayaran Pajak / STNK / KIR"
        description="Catat riwayat pembayaran dokumen kendaraan"
        footer={<>
          <Button variant="outline" onClick={() => setModalOpen(false)}>Batal</Button>
          {canManageData && <Button onClick={handleSubmit} disabled={saving}>{saving ? "Menyimpan..." : "Simpan"}</Button>}
        </>}
      >
        <div className="space-y-5">
          {errors._ && <div className="rounded-lg px-4 py-3 text-sm" style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>{errors._}</div>}

          {/* Section: Informasi Kendaraan */}
          <div className="rounded-xl" style={{ border: "1px solid var(--border)" }}>
            <div className="px-4 py-2.5" style={{ background: "var(--surface-muted)", borderBottom: "1px solid var(--border)" }}>
              <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Informasi Kendaraan</span>
            </div>
            <div className="p-4 space-y-4">
              <FormField label="Pilih Kendaraan" required error={errors.data_r2r4_id}>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5" style={{ color: "var(--text-subtle)" }} />
                  <input type="text"
                    placeholder="Cari plat atau nama kendaraan..."
                    value={kendaraanSearch}
                    onChange={e => { setKendaraanSearch(e.target.value); setKendaraanDropdown(true) }}
                    className="w-full h-8 rounded-lg pl-9 pr-3 text-sm focus:outline-none transition-all duration-150"
                    style={{ border: `1px solid ${errors.data_r2r4_id ? "var(--danger)" : "var(--border-strong)"}`, background: "var(--surface)", color: "var(--text-900)" }}
                  />
                  {kendaraanSearch.length >= 2 && kendaraanDropdown && (
                    <div className="absolute z-50 mt-1 w-full rounded-xl shadow-xl" style={{ border: "1px solid var(--border)", background: "var(--surface)", maxHeight: 200, overflowY: "auto" }}>
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
                                {k.nm_brg}{k.departemen ? ` · ${k.departemen}` : ""}
                              </p>
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </FormField>

              {/* Auto-fill info kendaraan (READ-ONLY) */}
              {vehicleInfo && (
                <div className="grid grid-cols-2 gap-4 rounded-xl p-4" style={{ background: "var(--primary-light)", border: "1px solid var(--primary-mid)" }}>
                  <InfoRow label="Plat Nomor"         value={vehicleInfo.plat} />
                  <InfoRow label="Nama Kendaraan"     value={vehicleInfo.nama} />
                  <InfoRow label="Pemegang / Departemen" value={`${vehicleInfo.pemegang} / ${vehicleInfo.departemen}`} />
                </div>
              )}
            </div>
          </div>

          {/* Section: Rincian Pembayaran */}
          <div className="rounded-xl" style={{ border: "1px solid var(--border)" }}>
            <div className="px-4 py-2.5" style={{ background: "var(--surface-muted)", borderBottom: "1px solid var(--border)" }}>
              <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Rincian Pembayaran</span>
            </div>
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <SelectField label="Jenis Pembayaran" required error={errors.jenis_pembayaran}
                  value={form.jenis_pembayaran} onChange={e => setF("jenis_pembayaran", e.target.value)}
                  options={JENIS_OPTS} />
                <TextField label="Tanggal Pembayaran" type="date" required error={errors.tanggal_pembayaran}
                  value={form.tanggal_pembayaran} onChange={e => setF("tanggal_pembayaran", e.target.value)} />
                <TextField label="Total Biaya (Rp)" type="number" required error={errors.biaya}
                  value={form.biaya} onChange={e => setF("biaya", e.target.value)} />
                <TextField label="Jatuh Tempo Berikutnya" type="date"
                  value={form.jatuh_tempo_berikutnya} onChange={e => setF("jatuh_tempo_berikutnya", e.target.value)} />
              </div>
              <TextareaField label="Catatan"
                value={form.keterangan} onChange={e => setF("keterangan", e.target.value)}
                placeholder="Catatan tentang pembayaran ini..." />
            </div>
          </div>
        </div>
      </Modal>

      <ConfirmDelete open={deleteOpen} onClose={() => setDeleteOpen(false)}
        onConfirm={handleDelete} loading={deleting}
        description={`Hapus record pembayaran "${selected?.jenis_pembayaran}" untuk kendaraan "${selected?.data_r2r4s?.plat ?? ""}"?`}
      />
    </div>
  )
}

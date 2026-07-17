"use client"

import React, { useState } from "react"
import { DataTable, Column } from "@/components/ui/data-table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Modal } from "@/components/ui/modal"
import { ConfirmDelete } from "@/components/ui/confirm-delete"
import { TextField, FormField } from "@/components/ui/form-field"
import { Plus, Eye, Trash2, RefreshCw, Search, ArrowRight, Info } from "lucide-react"
import { formatDate } from "@/lib/utils"
import { useApi } from "@/hooks/useApi"
import { useAuth } from "@/contexts/AuthContext"
import { canCreateOrEditTransaksi, canDeleteTransaksi } from "@/lib/transaksi-role"

/* ── Types ─────────────────────────────────────────────────────── */
interface MutasiR2R4 {
  id: number; data_r2r4_id: number
  pemegang_awal: string | null; departemen_awal: string | null
  pemegang_tujuan: string; departemen_tujuan: string
  tgl_mutasi: string; deskripsi: string | null
  // enriched
  plat?: string; nm_brg?: string; kode_brg?: string
}
interface Kendaraan { id: number; plat: string; nm_brg: string; kode_brg: string; pemegang: string | null; departemen: string | null }
interface KaryawanForSearch { id: number; nik: string; nama_karyawan: string; jabatan: string; nama_divisi?: string | null }

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-subtle)" }}>{label}</span>
      <span className="text-sm font-medium" style={{ color: "var(--text-900)" }}>{value || "—"}</span>
    </div>
  )
}

const EMPTY = { data_r2r4_id: "", pemegang_tujuan: "", departemen_tujuan: "", tgl_mutasi: "", deskripsi: "" }

export default function MutasiKendaraanPage() {
  const { user } = useAuth()
  const { data, loading, refetch } = useApi<MutasiR2R4[]>("/api/mutasi-kendaraan")
  const { data: allKendaraans }    = useApi<Kendaraan[]>("/api/kendaraan")
  // Ambil karyawan dengan info divisi untuk search pemegang tujuan
  const { data: allKaryawans }     = useApi<KaryawanForSearch[]>("/api/karyawan")
  const { data: allDivisis }       = useApi<{ id: number; nama_divisi: string }[]>("/api/divisi")
  const { data: allSubdivisis }    = useApi<{ id: number; divisi_id: number; nama_sub: string }[]>("/api/subdivisi")
  const list = data ?? []
  const canManageData = canCreateOrEditTransaksi(user?.role)
  const canDeleteData = canDeleteTransaksi(user?.role)

  const [modalOpen, setModalOpen]   = useState(false)
  const [viewOpen, setViewOpen]     = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [selected, setSelected]     = useState<MutasiR2R4 | null>(null)
  const [saving, setSaving]         = useState(false)
  const [deleting, setDeleting]     = useState(false)
  const [form, setForm]             = useState(EMPTY)
  const [errors, setErrors]         = useState<Record<string, string>>({})

  // Info kendaraan auto-fill (READ-ONLY sesuai Filament afterStateUpdated)
  const [kendaraanInfo, setKendaraanInfo] = useState<{
    plat: string; nama: string; pemegang: string; departemen: string
  } | null>(null)

  // Search kendaraan
  const [kendaraanSearch, setKendaraanSearch] = useState("")
  const [kendaraanDropdown, setKendaraanDropdown] = useState(false)

  // Search karyawan untuk pemegang tujuan
  const [pemegangSearch, setPemegangSearch]     = useState("")
  const [pemegangDropdown, setPemegangDropdown] = useState(false)

  // Build karyawan list dengan divisi name
  const karyawanWithDivisi = (allKaryawans ?? []).map(k => {
    const sub = (allSubdivisis ?? []).find(s => s.id === (k as any).subdivisi_id)
    const div = sub ? (allDivisis ?? []).find(d => d.id === sub.divisi_id) : null
    return { ...k, nama_divisi: div?.nama_divisi ?? null }
  })

  const filteredKaryawans = karyawanWithDivisi.filter(k =>
    pemegangSearch.length >= 2 &&
    (k.nama_karyawan.toLowerCase().includes(pemegangSearch.toLowerCase()) ||
     k.nik.toLowerCase().includes(pemegangSearch.toLowerCase()))
  ).slice(0, 20)

  const handleAddKendaraan = () => {} // unused placeholder

  // Pilih karyawan sebagai pemegang tujuan → auto-fill pemegang & departemen
  const handleSelectPemegang = (k: typeof karyawanWithDivisi[0]) => {
    setPemegangSearch(`${k.nik} — ${k.nama_karyawan}`)
    setPemegangDropdown(false)
    setF("pemegang_tujuan", k.nama_karyawan)
    setF("departemen_tujuan", k.nama_divisi ?? "")
  }

  const filteredKendaraanOptions = (allKendaraans ?? []).filter(k =>
    kendaraanSearch.length >= 2 &&
    (k.plat.toLowerCase().includes(kendaraanSearch.toLowerCase()) ||
     k.nm_brg.toLowerCase().includes(kendaraanSearch.toLowerCase()) ||
     k.kode_brg.toLowerCase().includes(kendaraanSearch.toLowerCase()))
  ).slice(0, 20)

  const setF = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  // Pilih kendaraan → auto-fill data ASAL (pemegang & departemen saat ini)
  const handleSelectKendaraan = (k: Kendaraan) => {
    setKendaraanSearch(`${k.plat} — ${k.nm_brg}`)
    setKendaraanDropdown(false)
    setF("data_r2r4_id", String(k.id))
    setKendaraanInfo({
      plat:      k.plat,
      nama:      k.nm_brg,
      pemegang:  k.pemegang ?? "—",
      departemen: k.departemen ?? "—",
    })
  }

  const openAdd = () => {
    if (!canManageData) return
    setSelected(null); setErrors({})
    setForm({ ...EMPTY, tgl_mutasi: new Date().toISOString().split("T")[0] })
    setKendaraanSearch(""); setKendaraanInfo(null)
    setModalOpen(true)
  }

  const handleSubmit = async () => {
    if (!canManageData) return
    const e: Record<string, string> = {}
    if (!form.data_r2r4_id)      e.data_r2r4_id      = "Pilih kendaraan"
    if (!form.pemegang_tujuan)   e.pemegang_tujuan   = "Wajib diisi"
    if (!form.departemen_tujuan) e.departemen_tujuan = "Wajib diisi"
    if (!form.tgl_mutasi)        e.tgl_mutasi        = "Wajib diisi"
    setErrors(e); if (Object.keys(e).length) return

    setSaving(true)
    try {
      const res = await fetch("/api/mutasi-kendaraan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          data_r2r4_id:     Number(form.data_r2r4_id),
          pemegang_tujuan:  form.pemegang_tujuan,
          departemen_tujuan: form.departemen_tujuan,
          tgl_mutasi:       form.tgl_mutasi,
          deskripsi:        form.deskripsi || null,
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
      await fetch(`/api/mutasi-kendaraan/${selected.id}`, { method: "DELETE" })
      setDeleteOpen(false); refetch()
    } finally { setDeleting(false) }
  }

  /* ── Columns (sesuai table di Filament) ─────────────────────── */
  const columns: Column<MutasiR2R4>[] = [
    { key: "tgl_mutasi",    header: "Tanggal",          cell: (r) => formatDate(r.tgl_mutasi) },
    { key: "plat",          header: "Kendaraan",        cell: (r) => (
      <div>
        <p className="font-semibold text-sm" style={{ color: "var(--text-900)" }}>{r.nm_brg ?? "—"}</p>
        <p className="text-xs font-mono" style={{ color: "var(--text-subtle)" }}>{r.plat ?? "—"}</p>
      </div>
    )},
    { key: "pemegang_awal",   header: "Pemegang Awal",   cell: (r) => <span className="text-xs" style={{ color: "var(--text-muted)" }}>{r.pemegang_awal ?? "—"}</span> },
    { key: "arrow",           header: "",                 cell: () => <ArrowRight className="h-3.5 w-3.5 mx-auto" style={{ color: "var(--primary)" }} />, className: "w-8 text-center" },
    { key: "pemegang_tujuan", header: "Pemegang Baru",   cell: (r) => <span className="font-semibold text-sm" style={{ color: "var(--primary)" }}>{r.pemegang_tujuan}</span> },
    { key: "departemen_tujuan", header: "Departemen Baru", cell: (r) => r.departemen_tujuan },
    { key: "deskripsi",       header: "Deskripsi",       cell: (r) => <span className="text-xs max-w-xs truncate block">{r.deskripsi ?? "—"}</span> },
  ]

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--text-900)" }}>Mutasi R2/R4</h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-subtle)" }}>
            Perpindahan pemegang kendaraan — setiap mutasi otomatis memperbarui data kendaraan
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={refetch}><RefreshCw className="h-3.5 w-3.5" /></Button>
          {canManageData && <Button size="sm" onClick={openAdd}><Plus className="h-3.5 w-3.5 mr-1.5" />Buat Mutasi</Button>}
        </div>
      </div>

      {/* Info box */}
      <div className="flex items-start gap-3 rounded-xl p-4" style={{ background: "var(--primary-light)", border: "1px solid var(--primary-mid)" }}>
        <Info className="h-4 w-4 mt-0.5 shrink-0" style={{ color: "var(--primary)" }} />
        <p className="text-xs" style={{ color: "var(--text-700)" }}>
          <strong>Alur Mutasi R2/R4:</strong> Pilih kendaraan → sistem otomatis mencatat pemegang saat ini sebagai "Sebelum Mutasi" → isi pemegang baru → setelah disimpan, <strong>data kendaraan diperbarui</strong> otomatis.
        </p>
      </div>

      {/* Table */}
      <DataTable
        data={list as any} columns={columns as any}
        searchKeys={["plat", "nm_brg", "pemegang_awal", "pemegang_tujuan"]} loading={loading}
        actions={(row: any) => (
          <div className="flex items-center justify-center gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" style={{ color: "var(--info)" }}
              onClick={() => { setSelected(row); setViewOpen(true) }}><Eye className="h-3.5 w-3.5" /></Button>
            {/* Pedami tidak punya edit untuk mutasi R2R4 */}
            {canDeleteData && <Button variant="ghost" size="icon" className="h-7 w-7" style={{ color: "var(--danger)" }}
              onClick={() => { setSelected(row); setDeleteOpen(true) }}><Trash2 className="h-3.5 w-3.5" /></Button>}
          </div>
        )}
      />

      {/* ── Create Modal ───────────────────────────────────────── */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} size="lg"
        title="Buat Mutasi Kendaraan"
        description="Pemegang asal diambil otomatis dari data kendaraan saat ini"
        footer={<>
          <Button variant="outline" onClick={() => setModalOpen(false)}>Batal</Button>
          {canManageData && <Button onClick={handleSubmit} disabled={saving}>
            {saving ? "Menyimpan..." : "Simpan & Update Kendaraan"}
          </Button>}
        </>}
      >
        <div className="space-y-5">
          {errors._ && <div className="rounded-lg px-4 py-3 text-sm" style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>{errors._}</div>}

          {/* Pilih Kendaraan */}
          <FormField label="Pilih Kendaraan" required error={errors.data_r2r4_id}>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5" style={{ color: "var(--text-subtle)" }} />
              <input type="text"
                placeholder="Cari plat, nama, atau kode kendaraan..."
                value={kendaraanSearch}
                onChange={e => { setKendaraanSearch(e.target.value); setKendaraanDropdown(true) }}
                className="w-full h-8 rounded-lg pl-9 pr-3 text-sm focus:outline-none transition-all duration-150"
                style={{ border: `1px solid ${errors.data_r2r4_id ? "var(--danger)" : "var(--border-strong)"}`, background: "var(--surface)", color: "var(--text-900)" }}
              />
              {kendaraanSearch.length >= 2 && kendaraanDropdown && (
                <div className="absolute z-50 mt-1 w-full rounded-xl shadow-xl" style={{ border: "1px solid var(--border)", background: "var(--surface)", maxHeight: 200, overflowY: "auto" }}>
                  {filteredKendaraanOptions.length === 0 ? (
                    <div className="px-4 py-3 text-xs" style={{ color: "var(--text-subtle)" }}>Tidak ada kendaraan yang cocok</div>
                  ) : (
                    filteredKendaraanOptions.map(k => (
                      <button key={k.id} type="button" onClick={() => handleSelectKendaraan(k)}
                        className="flex w-full items-start gap-3 px-4 py-2.5 text-left text-sm cursor-pointer transition-colors duration-100"
                        style={{ borderBottom: "1px solid var(--border)" }}
                        onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = "var(--primary-light)")}
                        onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = "transparent")}
                      >
                        <div>
                          <p className="font-semibold font-mono" style={{ color: "var(--text-900)" }}>{k.plat}</p>
                          <p className="text-xs" style={{ color: "var(--text-subtle)" }}>{k.nm_brg} · {k.kode_brg}</p>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          </FormField>

          {/* Info kendaraan terpilih */}
          {kendaraanInfo && (
            <div className="grid grid-cols-4 gap-3 rounded-xl p-3" style={{ background: "var(--primary-light)", border: "1px solid var(--primary-mid)" }}>
              <InfoRow label="Plat"      value={kendaraanInfo.plat} />
              <InfoRow label="Nama"      value={kendaraanInfo.nama} />
              <InfoRow label="Pemegang"  value={kendaraanInfo.pemegang} />
              <InfoRow label="Departemen" value={kendaraanInfo.departemen} />
            </div>
          )}

          {/* Section: Sebelum Mutasi (READ-ONLY) */}
          <div className="rounded-xl" style={{ border: "1px solid var(--border)" }}>
            <div className="px-4 py-2.5 flex items-center gap-2" style={{ background: "var(--surface-muted)", borderBottom: "1px solid var(--border)" }}>
              <div className="h-2 w-2 rounded-full bg-gray-400" />
              <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Sebelum Mutasi</span>
              <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ background: "var(--surface-hover)", color: "var(--text-subtle)" }}>Read-only · Otomatis diisi</span>
            </div>
            <div className="p-4">
              {!kendaraanInfo ? (
                <p className="text-xs italic" style={{ color: "var(--text-subtle)" }}>Pilih kendaraan untuk melihat pemegang saat ini</p>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  <InfoRow label="Pemegang Awal"   value={kendaraanInfo.pemegang} />
                  <InfoRow label="Departemen Awal" value={kendaraanInfo.departemen} />
                </div>
              )}
            </div>
          </div>

          {/* Section: Sesudah Mutasi (EDITABLE) */}
          <div className="rounded-xl" style={{ border: "1px solid var(--primary-mid)" }}>
            <div className="px-4 py-2.5 flex items-center gap-2" style={{ background: "var(--primary-light)", borderBottom: "1px solid var(--primary-mid)" }}>
              <div className="h-2 w-2 rounded-full" style={{ background: "var(--primary)" }} />
              <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--primary)" }}>Sesudah Mutasi (Tujuan)</span>
              <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ background: "var(--primary-mid)", color: "var(--primary)" }}>Wajib diisi</span>
            </div>
            <div className="p-4 space-y-4">
              {/* Search Karyawan untuk Pemegang Tujuan */}
              <FormField label="Pemegang Baru (Karyawan)" required error={errors.pemegang_tujuan}>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5" style={{ color: "var(--text-subtle)" }} />
                  <input type="text"
                    placeholder="Cari NIK atau nama karyawan..."
                    value={pemegangSearch}
                    onChange={e => { setPemegangSearch(e.target.value); setPemegangDropdown(true) }}
                    className="w-full h-8 rounded-lg pl-9 pr-3 text-sm focus:outline-none transition-all duration-150"
                    style={{ border: `1px solid ${errors.pemegang_tujuan ? "var(--danger)" : "var(--border-strong)"}`, background: "var(--surface)", color: "var(--text-900)" }}
                  />
                  {pemegangSearch.length >= 2 && pemegangDropdown && (
                    <div className="absolute z-50 mt-1 w-full rounded-xl shadow-xl" style={{ border: "1px solid var(--border)", background: "var(--surface)", maxHeight: 200, overflowY: "auto" }}>
                      {filteredKaryawans.length === 0 ? (
                        <div className="px-4 py-3 text-xs" style={{ color: "var(--text-subtle)" }}>Tidak ada karyawan yang cocok</div>
                      ) : (
                        filteredKaryawans.map(k => (
                          <button key={k.id} type="button" onClick={() => handleSelectPemegang(k)}
                            className="flex w-full items-start gap-3 px-4 py-2.5 text-left text-sm cursor-pointer transition-colors duration-100"
                            style={{ borderBottom: "1px solid var(--border)" }}
                            onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = "var(--primary-light)")}
                            onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = "transparent")}
                          >
                            <div>
                              <p className="font-semibold" style={{ color: "var(--text-900)" }}>{k.nama_karyawan}</p>
                              <p className="text-xs" style={{ color: "var(--text-subtle)" }}>{k.nik} · {k.jabatan} · {k.nama_divisi ?? "—"}</p>
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </FormField>

              {/* Departemen — auto-fill dari divisi karyawan (tetap bisa di-edit manual) */}
              <TextField label="Departemen / Divisi Baru" required error={errors.departemen_tujuan}
                value={form.departemen_tujuan} onChange={e => setF("departemen_tujuan", e.target.value)}
                placeholder="Otomatis terisi saat karyawan dipilih, atau isi manual" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <TextField label="Tanggal Mutasi" type="date" required error={errors.tgl_mutasi}
              value={form.tgl_mutasi} onChange={e => setF("tgl_mutasi", e.target.value)} />
            <TextField label="Deskripsi / Keterangan"
              value={form.deskripsi} onChange={e => setF("deskripsi", e.target.value)}
              placeholder="Alasan perpindahan kendaraan..." />
          </div>

          {form.data_r2r4_id && (
            <p className="text-xs flex items-center gap-1.5" style={{ color: "var(--warning)" }}>
              <Info className="h-3.5 w-3.5" />
              Setelah disimpan, data kendaraan akan diperbarui: pemegang dan departemen akan berubah sesuai tujuan.
            </p>
          )}
        </div>
      </Modal>

      {/* View Detail */}
      <Modal open={viewOpen} onClose={() => setViewOpen(false)} title="Detail Mutasi Kendaraan" size="lg">
        {selected && (
          <div className="space-y-5">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: "var(--text-subtle)" }}>Kendaraan</p>
              <p className="font-semibold" style={{ color: "var(--text-900)" }}>{selected.nm_brg} ({selected.plat})</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-xl p-4 space-y-3" style={{ background: "var(--surface-muted)", border: "1px solid var(--border)" }}>
                <p className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--text-subtle)" }}>Sebelum Mutasi</p>
                <InfoRow label="Pemegang Awal"   value={selected.pemegang_awal ?? "—"} />
                <InfoRow label="Departemen Awal" value={selected.departemen_awal ?? "—"} />
              </div>
              <div className="rounded-xl p-4 space-y-3" style={{ background: "var(--primary-light)", border: "1px solid var(--primary-mid)" }}>
                <p className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--primary)" }}>Sesudah Mutasi</p>
                <InfoRow label="Pemegang Baru"   value={selected.pemegang_tujuan} />
                <InfoRow label="Departemen Baru" value={selected.departemen_tujuan} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <InfoRow label="Tgl Mutasi" value={formatDate(selected.tgl_mutasi)} />
              <InfoRow label="Deskripsi"  value={selected.deskripsi ?? "—"} />
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDelete open={deleteOpen} onClose={() => setDeleteOpen(false)}
        onConfirm={handleDelete} loading={deleting}
        title="Hapus Mutasi Kendaraan"
        description={`Hapus record mutasi "${selected?.nm_brg} (${selected?.plat})"? Catatan: data kendaraan TIDAK akan dikembalikan ke pemegang semula.`}
      />
    </div>
  )
}

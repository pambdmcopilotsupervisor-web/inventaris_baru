"use client"

import React, { useState } from "react"
import { DataTable, Column } from "@/components/ui/data-table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Modal } from "@/components/ui/modal"
import { ConfirmDelete } from "@/components/ui/confirm-delete"
import { TextField, SelectField, TextareaField, FormField } from "@/components/ui/form-field"
import { Plus, Eye, Pencil, Trash2, RefreshCw, Search, Info } from "lucide-react"
import { formatDate, formatCurrency } from "@/lib/utils"
import { useApi } from "@/hooks/useApi"

interface PensiunKaryawan {
  id: number; karyawan_id: number
  tgl_pensiun: string; jenis_pensiun: string; no_sk: string | null
  jabatan_terakhir: string | null
  divisi_terakhir_id: number | null; subdivisi_terakhir_id: number | null
  pesangon: number; keterangan: string | null
  // enriched
  nama_karyawan?: string; divisi_terakhir?: string; subdivisi_terakhir?: string
}
interface Karyawan { id: number; nik: string; nama_karyawan: string; jabatan: string; subdivisi_id: number | null }

const JENIS_PENSIUN = [
  { value: "Normal",         label: "Pensiun Normal (Usia)" },
  { value: "Dini",           label: "Pensiun Dini (Permohonan Sendiri)" },
  { value: "Sakit",          label: "Pensiun Karena Sakit" },
  { value: "Meninggal",      label: "Meninggal Dunia" },
  { value: "Diberhentikan",  label: "Diberhentikan Dengan Hormat" },
  { value: "Tidak Hormat",   label: "Diberhentikan Tidak Dengan Hormat" },
]

const JENIS_VARIANT: Record<string, any> = {
  Normal: "success", Dini: "warning", Sakit: "info",
  Meninggal: "secondary", Diberhentikan: "warning", "Tidak Hormat": "destructive",
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-subtle)" }}>{label}</span>
      <span className="text-sm font-medium" style={{ color: "var(--text-900)" }}>{value || "—"}</span>
    </div>
  )
}

export default function PensiunKaryawanPage() {
  const { data, loading, refetch } = useApi<PensiunKaryawan[]>("/api/pensiun-karyawan")
  const { data: allKaryawans } = useApi<Karyawan[]>("/api/karyawan")
  const list = data ?? []

  const [modalOpen, setModalOpen]   = useState(false)
  const [viewOpen, setViewOpen]     = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [editMode, setEditMode]     = useState(false)
  const [selected, setSelected]     = useState<PensiunKaryawan | null>(null)
  const [saving, setSaving]         = useState(false)
  const [deleting, setDeleting]     = useState(false)
  const [errors, setErrors]         = useState<Record<string, string>>({})

  const [form, setForm] = useState({
    karyawan_id: "", tgl_pensiun: "", jenis_pensiun: "Normal",
    no_sk: "", pesangon: "0", keterangan: "",
    jabatan_terakhir: "", divisi_terakhir_id: "", subdivisi_terakhir_id: "",
  })

  // Info karyawan terpilih (auto-fill posisi terakhir)
  const [karyawanInfo, setKaryawanInfo] = useState<{
    nama: string; nik: string; jabatan: string; divisi: string; subdivisi: string
  } | null>(null)

  // Search
  const [karyawanSearch, setKaryawanSearch] = useState("")
  const [karyawanDropdown, setKaryawanDropdown] = useState(false)

  const filteredKaryawans = (allKaryawans ?? []).filter(k =>
    karyawanSearch.length >= 2 &&
    (k.nama_karyawan.toLowerCase().includes(karyawanSearch.toLowerCase()) ||
     k.nik.toLowerCase().includes(karyawanSearch.toLowerCase()))
  ).slice(0, 20)

  const setF = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  // Auto-fill posisi terakhir dari karyawan terpilih
  const handleSelectKaryawan = async (k: Karyawan) => {
    setKaryawanSearch(`${k.nik} — ${k.nama_karyawan}`)
    setKaryawanDropdown(false)
    setF("karyawan_id", String(k.id))

    try {
      const res    = await fetch(`/api/karyawan/${k.id}`)
      const detail = await res.json()

      setF("jabatan_terakhir",      detail.jabatan ?? "")
      setF("divisi_terakhir_id",    detail.divisi_id ? String(detail.divisi_id) : "")
      setF("subdivisi_terakhir_id", detail.subdivisi_id ? String(detail.subdivisi_id) : "")

      setKaryawanInfo({
        nama:     k.nama_karyawan,
        nik:      k.nik,
        jabatan:  detail.jabatan ?? "—",
        divisi:   detail.nama_divisi ?? "—",
        subdivisi: detail.nama_subdivisi ?? "—",
      })
    } catch {
      setKaryawanInfo(null)
    }
  }

  const openAdd = () => {
    setEditMode(false); setSelected(null); setErrors({})
    setKaryawanSearch(""); setKaryawanInfo(null)
    setForm({
      karyawan_id: "", tgl_pensiun: new Date().toISOString().split("T")[0],
      jenis_pensiun: "Normal", no_sk: "", pesangon: "0", keterangan: "",
      jabatan_terakhir: "", divisi_terakhir_id: "", subdivisi_terakhir_id: "",
    })
    setModalOpen(true)
  }

  const openEdit = (row: PensiunKaryawan) => {
    setEditMode(true); setSelected(row); setErrors({})
    const k = allKaryawans?.find(k => k.id === row.karyawan_id)
    setKaryawanSearch(k ? `${k.nik} — ${k.nama_karyawan}` : `ID ${row.karyawan_id}`)
    setForm({
      karyawan_id:          String(row.karyawan_id),
      tgl_pensiun:          row.tgl_pensiun?.split("T")[0] ?? "",
      jenis_pensiun:        row.jenis_pensiun,
      no_sk:                row.no_sk ?? "",
      pesangon:             String(row.pesangon ?? 0),
      keterangan:           row.keterangan ?? "",
      jabatan_terakhir:     row.jabatan_terakhir ?? "",
      divisi_terakhir_id:   row.divisi_terakhir_id ? String(row.divisi_terakhir_id) : "",
      subdivisi_terakhir_id: row.subdivisi_terakhir_id ? String(row.subdivisi_terakhir_id) : "",
    })
    setKaryawanInfo({
      nama:      row.nama_karyawan ?? "—",
      nik:       k?.nik ?? "—",
      jabatan:   row.jabatan_terakhir ?? "—",
      divisi:    row.divisi_terakhir ?? "—",
      subdivisi: row.subdivisi_terakhir ?? "—",
    })
    setModalOpen(true)
  }

  const handleSubmit = async () => {
    const e: Record<string, string> = {}
    if (!form.karyawan_id)   e.karyawan_id  = "Pilih karyawan"
    if (!form.tgl_pensiun)   e.tgl_pensiun  = "Isi tanggal pensiun"
    if (!form.jenis_pensiun) e.jenis_pensiun = "Pilih jenis pensiun"
    setErrors(e); if (Object.keys(e).length) return

    setSaving(true)
    try {
      const url = editMode && selected ? `/api/pensiun-karyawan/${selected.id}` : "/api/pensiun-karyawan"
      const res = await fetch(url, {
        method: editMode ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          karyawan_id:           Number(form.karyawan_id),
          tgl_pensiun:           form.tgl_pensiun,
          jenis_pensiun:         form.jenis_pensiun,
          no_sk:                 form.no_sk || null,
          jabatan_terakhir:      form.jabatan_terakhir || null,
          divisi_terakhir_id:    form.divisi_terakhir_id    ? Number(form.divisi_terakhir_id)    : null,
          subdivisi_terakhir_id: form.subdivisi_terakhir_id ? Number(form.subdivisi_terakhir_id) : null,
          pesangon:              Number(form.pesangon) || 0,
          keterangan:            form.keterangan || null,
        }),
      })
      if (!res.ok) { const j = await res.json(); setErrors({ _: j.error ?? "Gagal" }); return }
      setModalOpen(false); refetch()
    } finally { setSaving(false) }
  }

  const handleDelete = async () => {
    if (!selected) return
    setDeleting(true)
    try {
      await fetch(`/api/pensiun-karyawan/${selected.id}`, { method: "DELETE" })
      setDeleteOpen(false); refetch()
    } finally { setDeleting(false) }
  }

  const columns: Column<PensiunKaryawan>[] = [
    { key: "nama_karyawan",  header: "Karyawan", cell: (r) => <span className="font-semibold">{r.nama_karyawan}</span> },
    { key: "tgl_pensiun",    header: "Tgl Pensiun", cell: (r) => formatDate(r.tgl_pensiun) },
    { key: "jenis_pensiun",  header: "Jenis", cell: (r) => <Badge variant={JENIS_VARIANT[r.jenis_pensiun] ?? "secondary"}>{r.jenis_pensiun}</Badge> },
    { key: "jabatan_terakhir", header: "Jabatan Terakhir", cell: (r) => r.jabatan_terakhir ?? "—" },
    { key: "divisi_terakhir",  header: "Divisi Terakhir",  cell: (r) => r.divisi_terakhir ?? "—" },
    { key: "no_sk",          header: "No SK", cell: (r) => r.no_sk ? <Badge variant="secondary" className="font-mono text-xs">{r.no_sk}</Badge> : "—" },
    { key: "pesangon",       header: "Pesangon", cell: (r) => <span className="font-mono text-sm">{formatCurrency(Number(r.pesangon))}</span> },
  ]

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--text-900)" }}>Pensiun Karyawan</h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-subtle)" }}>
            Data karyawan pensiun — setiap penambahan otomatis mengubah status karyawan menjadi Pensiun
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={refetch}><RefreshCw className="h-3.5 w-3.5" /></Button>
          <Button size="sm" onClick={openAdd}><Plus className="h-3.5 w-3.5 mr-1.5" />Tambah Data</Button>
        </div>
      </div>

      <div className="flex items-start gap-3 rounded-xl p-4" style={{ background: "var(--danger-bg)", border: "1px solid #FECACA" }}>
        <Info className="h-4 w-4 mt-0.5 shrink-0" style={{ color: "var(--danger)" }} />
        <p className="text-xs" style={{ color: "#991B1B" }}>
          <strong>Perhatian:</strong> Setelah data pensiun disimpan, <strong>status karyawan akan otomatis berubah menjadi "Pensiun"</strong>. Jika data dihapus, status karyawan akan dikembalikan ke "Nonaktif".
        </p>
      </div>

      <DataTable
        data={list as any} columns={columns as any}
        searchKeys={["nama_karyawan", "no_sk", "jabatan_terakhir"]} loading={loading}
        actions={(row: any) => (
          <div className="flex items-center justify-center gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" style={{ color: "var(--info)" }}    onClick={() => { setSelected(row); setViewOpen(true) }}><Eye className="h-3.5 w-3.5" /></Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" style={{ color: "var(--warning)" }} onClick={() => openEdit(row)}><Pencil className="h-3.5 w-3.5" /></Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" style={{ color: "var(--danger)" }}  onClick={() => { setSelected(row); setDeleteOpen(true) }}><Trash2 className="h-3.5 w-3.5" /></Button>
          </div>
        )}
      />

      {/* ── Add / Edit Modal ────────────────────────────────────── */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} size="lg"
        title={editMode ? "Edit Data Pensiun" : "Tambah Data Pensiun Karyawan"}
        description="Posisi terakhir diambil otomatis dari data karyawan saat ini"
        footer={<>
          <Button variant="outline" onClick={() => setModalOpen(false)}>Batal</Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? "Menyimpan..." : editMode ? "Simpan Perubahan" : "Simpan & Set Status Pensiun"}
          </Button>
        </>}
      >
        <div className="space-y-5">
          {errors._ && <div className="rounded-lg px-4 py-3 text-sm" style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>{errors._}</div>}

          {/* Pilih Karyawan */}
          <div className="rounded-xl" style={{ border: "1px solid var(--border)", overflow: "visible" }}>
            <div className="px-4 py-2.5" style={{ background: "var(--surface-muted)", borderBottom: "1px solid var(--border)" }}>
              <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Data Karyawan</span>
            </div>
            <div className="p-4 space-y-4">
              <FormField label="Karyawan" required error={errors.karyawan_id}>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5" style={{ color: "var(--text-subtle)" }} />
                  <input type="text"
                    placeholder={editMode ? "Karyawan terkunci" : "Cari NIK atau nama karyawan..."}
                    value={karyawanSearch}
                    disabled={editMode}
                    onChange={e => { if (editMode) return; setKaryawanSearch(e.target.value); setKaryawanDropdown(true) }}
                    className="w-full h-8 rounded-lg pl-9 pr-3 text-sm focus:outline-none transition-all duration-150"
                    style={{
                      border: `1px solid ${errors.karyawan_id ? "var(--danger)" : "var(--border-strong)"}`,
                      background: editMode ? "var(--surface-muted)" : "var(--surface)",
                      color: "var(--text-900)",
                    }}
                  />
                  {karyawanDropdown && filteredKaryawans.length > 0 && (
                    <div className="absolute z-[300] mt-1 w-full rounded-xl shadow-xl" style={{ border: "1px solid var(--border)", background: "var(--surface)", maxHeight: 200, overflowY: "auto" }}>
                      {filteredKaryawans.map(k => (
                        <button key={k.id} type="button" onClick={() => handleSelectKaryawan(k)}
                          className="flex w-full items-start gap-3 px-4 py-2.5 text-left text-sm cursor-pointer transition-colors duration-100"
                          style={{ borderBottom: "1px solid var(--border)" }}
                          onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = "var(--primary-light)")}
                          onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = "transparent")}
                        >
                          <div>
                            <p className="font-semibold" style={{ color: "var(--text-900)" }}>{k.nama_karyawan}</p>
                            <p className="text-xs" style={{ color: "var(--text-subtle)" }}>{k.nik} · {k.jabatan}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </FormField>

              {/* Info karyawan terpilih */}
              {karyawanInfo && (
                <div className="grid grid-cols-4 gap-3 rounded-xl p-3" style={{ background: "var(--danger-bg)", border: "1px solid #FECACA" }}>
                  <InfoRow label="NIK"       value={karyawanInfo.nik} />
                  <InfoRow label="Jabatan"   value={karyawanInfo.jabatan} />
                  <InfoRow label="Divisi"    value={karyawanInfo.divisi} />
                  <InfoRow label="Sub Divisi" value={karyawanInfo.subdivisi} />
                </div>
              )}
            </div>
          </div>

          {/* Detail Pensiun */}
          <div className="rounded-xl overflow-hidden" style={{ border: "1px solid #FECACA" }}>
            <div className="px-4 py-2.5" style={{ background: "var(--danger-bg)", borderBottom: "1px solid #FECACA" }}>
              <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--danger)" }}>Detail Pensiun</span>
            </div>
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <TextField label="Tanggal Pensiun" type="date" required error={errors.tgl_pensiun}
                  value={form.tgl_pensiun} onChange={e => setF("tgl_pensiun", e.target.value)} />
                <SelectField label="Jenis Pensiun" required error={errors.jenis_pensiun}
                  value={form.jenis_pensiun} onChange={e => setF("jenis_pensiun", e.target.value)}
                  options={JENIS_PENSIUN} />
                <TextField label="No. SK Pensiun"
                  value={form.no_sk} onChange={e => setF("no_sk", e.target.value)} />
                <TextField label="Pesangon / Uang Penghargaan (Rp)" type="number"
                  value={form.pesangon} onChange={e => setF("pesangon", e.target.value)} />
              </div>
            </div>
          </div>

          {/* Posisi Terakhir — READ-ONLY */}
          <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)" }}>
            <div className="px-4 py-2.5 flex items-center gap-2" style={{ background: "var(--surface-muted)", borderBottom: "1px solid var(--border)" }}>
              <div className="h-2 w-2 rounded-full bg-gray-400" />
              <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Posisi Terakhir</span>
              <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ background: "var(--surface-hover)", color: "var(--text-subtle)" }}>Read-only · Otomatis diisi</span>
            </div>
            <div className="p-4">
              {!karyawanInfo ? (
                <p className="text-xs italic" style={{ color: "var(--text-subtle)" }}>Pilih karyawan untuk melihat posisi terakhir</p>
              ) : (
                <div className="grid grid-cols-3 gap-4">
                  <InfoRow label="Jabatan Terakhir"   value={form.jabatan_terakhir} />
                  <InfoRow label="Divisi Terakhir"    value={karyawanInfo.divisi} />
                  <InfoRow label="Sub Divisi Terakhir" value={karyawanInfo.subdivisi} />
                </div>
              )}
            </div>
          </div>

          <TextareaField label="Keterangan Tambahan"
            value={form.keterangan} onChange={e => setF("keterangan", e.target.value)}
            placeholder="Catatan tambahan terkait pensiun..." />
        </div>
      </Modal>

      {/* View Detail */}
      <Modal open={viewOpen} onClose={() => setViewOpen(false)} title="Detail Pensiun Karyawan" size="lg">
        {selected && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <InfoRow label="Karyawan"    value={selected.nama_karyawan ?? "—"} />
              <InfoRow label="Jenis Pensiun" value={selected.jenis_pensiun} />
              <InfoRow label="Tgl Pensiun" value={formatDate(selected.tgl_pensiun)} />
              <InfoRow label="No SK"       value={selected.no_sk ?? "—"} />
              <InfoRow label="Pesangon"    value={formatCurrency(Number(selected.pesangon))} />
              <InfoRow label="Keterangan"  value={selected.keterangan ?? "—"} />
            </div>
            <div className="rounded-xl p-4 space-y-3" style={{ background: "var(--surface-muted)", border: "1px solid var(--border)" }}>
              <p className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--text-subtle)" }}>Posisi Terakhir</p>
              <div className="grid grid-cols-3 gap-4">
                <InfoRow label="Jabatan"    value={selected.jabatan_terakhir ?? "—"} />
                <InfoRow label="Divisi"     value={selected.divisi_terakhir ?? "—"} />
                <InfoRow label="Sub Divisi" value={selected.subdivisi_terakhir ?? "—"} />
              </div>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDelete open={deleteOpen} onClose={() => setDeleteOpen(false)}
        onConfirm={handleDelete} loading={deleting}
        title="Hapus Data Pensiun"
        description={`Hapus data pensiun "${selected?.nama_karyawan}"? Status karyawan akan dikembalikan ke "Nonaktif".`}
      />
    </div>
  )
}

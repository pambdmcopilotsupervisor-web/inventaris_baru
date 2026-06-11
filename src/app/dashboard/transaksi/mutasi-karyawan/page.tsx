"use client"

import React, { useState, useEffect } from "react"
import { DataTable, Column } from "@/components/ui/data-table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Modal } from "@/components/ui/modal"
import { ConfirmDelete } from "@/components/ui/confirm-delete"
import { TextField, SelectField, TextareaField, FormField } from "@/components/ui/form-field"
import { Plus, Eye, Pencil, Trash2, RefreshCw, Search, ArrowRight, Info } from "lucide-react"
import { formatDate } from "@/lib/utils"
import { useApi } from "@/hooks/useApi"

interface MutasiKaryawan {
  id: number; karyawan_id: number; tgl_mutasi: string; no_sk: string | null
  jabatan_asal: string | null; divisi_asal_id: number | null; subdivisi_asal_id: number | null
  jabatan_tujuan: string | null; divisi_tujuan_id: number | null; subdivisi_tujuan_id: number | null
  alasan: string | null
  // enriched
  nama_karyawan?: string; divisi_asal?: string; subdivisi_asal?: string
  divisi_tujuan?: string; subdivisi_tujuan?: string
}
interface Karyawan  { id: number; nik: string; nama_karyawan: string; jabatan: string; subdivisi_id: number | null; divisi_id?: number | null }
interface Divisi    { id: number; nama_divisi: string }
interface Subdivisi { id: number; nama_sub: string; divisi_id: number }

const JABATAN = ["Ketua","Bendahara","Sekretaris","Manager","Kepala Divisi","Koordinator","Staff","All Karyawan"]

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-subtle)" }}>{label}</span>
      <span className="text-sm font-medium" style={{ color: "var(--text-900)" }}>{value || "—"}</span>
    </div>
  )
}

export default function MutasiKaryawanPage() {
  const { data, loading, refetch } = useApi<MutasiKaryawan[]>("/api/mutasi-karyawan")
  const { data: allKaryawans } = useApi<Karyawan[]>("/api/karyawan")
  const { data: divisis }      = useApi<Divisi[]>("/api/divisi")
  const list = data ?? []

  const [modalOpen, setModalOpen]   = useState(false)
  const [viewOpen, setViewOpen]     = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [editMode, setEditMode]     = useState(false)
  const [selected, setSelected]     = useState<MutasiKaryawan | null>(null)
  const [saving, setSaving]         = useState(false)
  const [deleting, setDeleting]     = useState(false)
  const [errors, setErrors]         = useState<Record<string, string>>({})

  // Form
  const [form, setForm] = useState({
    karyawan_id: "", no_sk: "", tgl_mutasi: "", alasan: "",
    jabatan_tujuan: "", divisi_tujuan_id: "", subdivisi_tujuan_id: "",
    // asal (read-only)
    jabatan_asal: "", divisi_asal_id: "", subdivisi_asal_id: "",
  })

  // Info karyawan yang dipilih (auto-fill posisi asal)
  const [asalInfo, setAsalInfo] = useState<{
    jabatan: string; divisi: string; subdivisi: string; nik: string
  } | null>(null)

  // Search karyawan
  const [karyawanSearch, setKaryawanSearch] = useState("")
  const [karyawanDropdown, setKaryawanDropdown] = useState(false)

  // Subdivisi cascade untuk TUJUAN
  const [subdivisiTujuan, setSubdivisiTujuan] = useState<Subdivisi[]>([])
  const [loadingSub, setLoadingSub] = useState(false)

  const filteredKaryawans = (allKaryawans ?? []).filter(k =>
    karyawanSearch.length >= 2 &&
    (k.nama_karyawan.toLowerCase().includes(karyawanSearch.toLowerCase()) ||
     k.nik.toLowerCase().includes(karyawanSearch.toLowerCase()))
  ).slice(0, 20)

  useEffect(() => {
    if (!form.divisi_tujuan_id) { setSubdivisiTujuan([]); return }
    setLoadingSub(true)
    fetch(`/api/subdivisi/by-divisi/${form.divisi_tujuan_id}`)
      .then(r => r.json()).then(setSubdivisiTujuan).catch(() => setSubdivisiTujuan([]))
      .finally(() => setLoadingSub(false))
  }, [form.divisi_tujuan_id])

  const setF = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  // Saat pilih karyawan dari dropdown → auto-fill posisi ASAL
  const handleSelectKaryawan = async (k: Karyawan) => {
    setKaryawanSearch(`${k.nik} — ${k.nama_karyawan}`)
    setKaryawanDropdown(false)
    setF("karyawan_id", String(k.id))

    try {
      const res    = await fetch(`/api/karyawan/${k.id}`)
      const detail = await res.json()

      setF("jabatan_asal",   detail.jabatan ?? "")
      setF("divisi_asal_id", detail.divisi_id ? String(detail.divisi_id) : "")
      setF("subdivisi_asal_id", detail.subdivisi_id ? String(detail.subdivisi_id) : "")

      // Map ke nama untuk tampilan info box
      const dName = divisis?.find(d => d.id === detail.divisi_id)?.nama_divisi ?? "—"
      setAsalInfo({
        jabatan:    detail.jabatan ?? "—",
        divisi:     detail.nama_divisi ?? dName,
        subdivisi:  detail.nama_subdivisi ?? "—",
        nik:        k.nik,
      })
    } catch {
      setAsalInfo(null)
    }
  }

  const openAdd = () => {
    setEditMode(false); setSelected(null); setErrors({})
    setKaryawanSearch(""); setAsalInfo(null)
    setForm({ karyawan_id: "", no_sk: "", tgl_mutasi: new Date().toISOString().split("T")[0], alasan: "",
      jabatan_tujuan: "", divisi_tujuan_id: "", subdivisi_tujuan_id: "",
      jabatan_asal: "", divisi_asal_id: "", subdivisi_asal_id: "" })
    setSubdivisiTujuan([])
    setModalOpen(true)
  }

  const openEdit = (row: MutasiKaryawan) => {
    setEditMode(true); setSelected(row); setErrors({})
    const k = allKaryawans?.find(k => k.id === row.karyawan_id)
    setKaryawanSearch(k ? `${k.nik} — ${k.nama_karyawan}` : `ID ${row.karyawan_id}`)
    setForm({
      karyawan_id:          String(row.karyawan_id),
      no_sk:                row.no_sk ?? "",
      tgl_mutasi:           row.tgl_mutasi?.split("T")[0] ?? "",
      alasan:               row.alasan ?? "",
      jabatan_tujuan:       row.jabatan_tujuan ?? "",
      divisi_tujuan_id:     row.divisi_tujuan_id ? String(row.divisi_tujuan_id) : "",
      subdivisi_tujuan_id:  row.subdivisi_tujuan_id ? String(row.subdivisi_tujuan_id) : "",
      jabatan_asal:         row.jabatan_asal ?? "",
      divisi_asal_id:       row.divisi_asal_id ? String(row.divisi_asal_id) : "",
      subdivisi_asal_id:    row.subdivisi_asal_id ? String(row.subdivisi_asal_id) : "",
    })
    setAsalInfo({
      jabatan:   row.jabatan_asal ?? "—",
      divisi:    row.divisi_asal ?? "—",
      subdivisi: row.subdivisi_asal ?? "—",
      nik:       k?.nik ?? "—",
    })
    setModalOpen(true)
  }

  const handleSubmit = async () => {
    const e: Record<string, string> = {}
    if (!form.karyawan_id)       e.karyawan_id      = "Pilih karyawan"
    if (!form.tgl_mutasi)        e.tgl_mutasi       = "Isi tanggal mutasi"
    if (!form.jabatan_tujuan)    e.jabatan_tujuan   = "Pilih jabatan baru"
    if (!form.divisi_tujuan_id)  e.divisi_tujuan_id = "Pilih divisi baru"
    if (!form.subdivisi_tujuan_id) e.subdivisi_tujuan_id = "Pilih sub divisi baru"
    setErrors(e); if (Object.keys(e).length) return

    setSaving(true)
    try {
      const url = editMode && selected ? `/api/mutasi-karyawan/${selected.id}` : "/api/mutasi-karyawan"
      const res = await fetch(url, {
        method: editMode ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          karyawan_id:          Number(form.karyawan_id),
          no_sk:                form.no_sk || null,
          tgl_mutasi:           form.tgl_mutasi,
          alasan:               form.alasan || null,
          jabatan_asal:         form.jabatan_asal || null,
          divisi_asal_id:       form.divisi_asal_id    ? Number(form.divisi_asal_id)    : null,
          subdivisi_asal_id:    form.subdivisi_asal_id ? Number(form.subdivisi_asal_id) : null,
          jabatan_tujuan:       form.jabatan_tujuan,
          divisi_tujuan_id:     Number(form.divisi_tujuan_id),
          subdivisi_tujuan_id:  Number(form.subdivisi_tujuan_id),
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
      await fetch(`/api/mutasi-karyawan/${selected.id}`, { method: "DELETE" })
      setDeleteOpen(false); refetch()
    } finally { setDeleting(false) }
  }

  const columns: Column<MutasiKaryawan>[] = [
    { key: "tgl_mutasi",     header: "Tanggal",   cell: (r) => formatDate(r.tgl_mutasi) },
    { key: "no_sk",          header: "No SK",      cell: (r) => r.no_sk ? <Badge variant="secondary" className="font-mono text-xs">{r.no_sk}</Badge> : "—" },
    { key: "nama_karyawan",  header: "Karyawan",   cell: (r) => <span className="font-semibold">{r.nama_karyawan}</span> },
    { key: "jabatan_asal",   header: "Jabatan Asal",  cell: (r) => <span className="text-xs" style={{ color: "var(--text-muted)" }}>{r.jabatan_asal ?? "—"}</span> },
    { key: "arrow",          header: "",           cell: () => <ArrowRight className="h-3.5 w-3.5" style={{ color: "var(--primary)" }} />, className: "w-8 text-center" },
    { key: "jabatan_tujuan", header: "Jabatan Baru", cell: (r) => <Badge variant="success">{r.jabatan_tujuan ?? "—"}</Badge> },
    { key: "divisi_tujuan",  header: "Divisi Baru",  cell: (r) => <Badge variant="default">{r.divisi_tujuan ?? "—"}</Badge> },
  ]

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--text-900)" }}>Mutasi Karyawan</h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-subtle)" }}>
            Perpindahan jabatan/divisi — setiap mutasi otomatis memperbarui data karyawan
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={refetch}><RefreshCw className="h-3.5 w-3.5" /></Button>
          <Button size="sm" onClick={openAdd}><Plus className="h-3.5 w-3.5 mr-1.5" />Tambah Mutasi</Button>
        </div>
      </div>

      <div className="flex items-start gap-3 rounded-xl p-4" style={{ background: "var(--primary-light)", border: "1px solid var(--primary-mid)" }}>
        <Info className="h-4 w-4 mt-0.5 shrink-0" style={{ color: "var(--primary)" }} />
        <p className="text-xs" style={{ color: "var(--text-700)" }}>
          <strong>Alur Mutasi Karyawan:</strong> Pilih karyawan → sistem otomatis mencatat posisi saat ini sebagai data "Posisi Asal" → isi posisi baru → setelah disimpan, <strong>data karyawan akan diperbarui</strong>: jabatan, sub divisi, dan status dikembalikan ke Aktif.
        </p>
      </div>

      <DataTable
        data={list as any} columns={columns as any}
        searchKeys={["nama_karyawan", "no_sk", "jabatan_asal", "jabatan_tujuan"]} loading={loading}
        actions={(row: any) => (
          <div className="flex items-center justify-center gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" style={{ color: "var(--info)" }}    onClick={() => { setSelected(row); setViewOpen(true) }}><Eye className="h-3.5 w-3.5" /></Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" style={{ color: "var(--warning)" }} onClick={() => openEdit(row)}><Pencil className="h-3.5 w-3.5" /></Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" style={{ color: "var(--danger)" }}  onClick={() => { setSelected(row); setDeleteOpen(true) }}><Trash2 className="h-3.5 w-3.5" /></Button>
          </div>
        )}
      />

      {/* ── Create / Edit Modal ─────────────────────────────────── */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} size="lg"
        title={editMode ? "Edit Mutasi Karyawan" : "Tambah Mutasi Karyawan"}
        description="Posisi asal diambil otomatis dari data karyawan saat ini"
        footer={<>
          <Button variant="outline" onClick={() => setModalOpen(false)}>Batal</Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? "Menyimpan..." : editMode ? "Simpan Perubahan" : "Simpan & Update Karyawan"}
          </Button>
        </>}
      >
        <div className="space-y-5">
          {errors._ && <div className="rounded-lg px-4 py-3 text-sm" style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>{errors._}</div>}

          {/* Data Karyawan & SK */}
          <div className="rounded-xl" style={{ border: "1px solid var(--border)", overflow: "visible" }}>
            <div className="px-4 py-2.5" style={{ background: "var(--surface-muted)", borderBottom: "1px solid var(--border)" }}>
              <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Data Karyawan</span>
            </div>
            <div className="p-4 space-y-4">
              {/* Pilih Karyawan — searchable */}
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
              {asalInfo && (
                <div className="grid grid-cols-4 gap-3 rounded-xl p-3" style={{ background: "var(--primary-light)", border: "1px solid var(--primary-mid)" }}>
                  <InfoRow label="NIK"      value={asalInfo.nik} />
                  <InfoRow label="Jabatan"  value={asalInfo.jabatan} />
                  <InfoRow label="Divisi"   value={asalInfo.divisi} />
                  <InfoRow label="Sub Divisi" value={asalInfo.subdivisi} />
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <TextField label="No. SK Mutasi" value={form.no_sk} onChange={e => setF("no_sk", e.target.value)} />
                <TextField label="Tanggal Mutasi" type="date" required error={errors.tgl_mutasi}
                  value={form.tgl_mutasi} onChange={e => setF("tgl_mutasi", e.target.value)} />
              </div>
            </div>
          </div>

          {/* Posisi Asal — READ-ONLY */}
          <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)" }}>
            <div className="px-4 py-2.5 flex items-center gap-2" style={{ background: "var(--surface-muted)", borderBottom: "1px solid var(--border)" }}>
              <div className="h-2 w-2 rounded-full bg-gray-400" />
              <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Posisi Asal</span>
              <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ background: "var(--surface-hover)", color: "var(--text-subtle)" }}>Read-only · Otomatis diisi</span>
            </div>
            <div className="p-4">
              {!asalInfo ? (
                <p className="text-xs italic" style={{ color: "var(--text-subtle)" }}>Pilih karyawan untuk melihat posisi saat ini</p>
              ) : (
                <div className="grid grid-cols-3 gap-4">
                  <InfoRow label="Jabatan Asal"   value={form.jabatan_asal} />
                  <InfoRow label="Divisi Asal"    value={asalInfo.divisi} />
                  <InfoRow label="Sub Divisi Asal" value={asalInfo.subdivisi} />
                </div>
              )}
            </div>
          </div>

          {/* Posisi Tujuan — EDITABLE dengan cascade */}
          <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--primary-mid)" }}>
            <div className="px-4 py-2.5 flex items-center gap-2" style={{ background: "var(--primary-light)", borderBottom: "1px solid var(--primary-mid)" }}>
              <div className="h-2 w-2 rounded-full" style={{ background: "var(--primary)" }} />
              <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--primary)" }}>Posisi Tujuan (Baru)</span>
              <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ background: "var(--primary-mid)", color: "var(--primary)" }}>Wajib diisi</span>
            </div>
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <SelectField label="Jabatan Baru" required error={errors.jabatan_tujuan}
                  value={form.jabatan_tujuan} onChange={e => setF("jabatan_tujuan", e.target.value)}
                  placeholder="— Pilih Jabatan —"
                  options={JABATAN.map(v => ({ value: v, label: v }))} />
                {/* Divisi Tujuan — reset subdivisi saat berubah */}
                <SelectField label="Divisi Baru" required error={errors.divisi_tujuan_id}
                  value={form.divisi_tujuan_id}
                  onChange={e => { setF("divisi_tujuan_id", e.target.value); setF("subdivisi_tujuan_id", "") }}
                  placeholder="— Pilih Divisi —"
                  options={(divisis ?? []).map(d => ({ value: String(d.id), label: d.nama_divisi }))} />
                {/* Subdivisi Tujuan — cascade dari divisi */}
                <SelectField label="Sub Divisi Baru" required error={errors.subdivisi_tujuan_id}
                  value={form.subdivisi_tujuan_id}
                  onChange={e => setF("subdivisi_tujuan_id", e.target.value)}
                  placeholder={loadingSub ? "Memuat..." : form.divisi_tujuan_id ? "— Pilih Sub Divisi —" : "— Pilih Divisi Dulu —"}
                  options={subdivisiTujuan.map(s => ({ value: String(s.id), label: s.nama_sub }))}
                  disabled={!form.divisi_tujuan_id || loadingSub} />
              </div>
            </div>
          </div>

          <TextareaField label="Alasan / Keterangan Mutasi"
            value={form.alasan} onChange={e => setF("alasan", e.target.value)}
            placeholder="Alasan pemindahan jabatan..." />
        </div>
      </Modal>

      {/* View Detail */}
      <Modal open={viewOpen} onClose={() => setViewOpen(false)} title="Detail Mutasi Karyawan" size="lg">
        {selected && (
          <div className="space-y-5">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: "var(--text-subtle)" }}>Karyawan</p>
              <p className="font-semibold" style={{ color: "var(--text-900)" }}>{selected.nama_karyawan}</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-xl p-4 space-y-3" style={{ background: "var(--surface-muted)", border: "1px solid var(--border)" }}>
                <p className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--text-subtle)" }}>Posisi Asal</p>
                <InfoRow label="Jabatan"    value={selected.jabatan_asal ?? "—"} />
                <InfoRow label="Divisi"     value={selected.divisi_asal ?? "—"} />
                <InfoRow label="Sub Divisi" value={selected.subdivisi_asal ?? "—"} />
              </div>
              <div className="rounded-xl p-4 space-y-3" style={{ background: "var(--primary-light)", border: "1px solid var(--primary-mid)" }}>
                <p className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--primary)" }}>Posisi Tujuan</p>
                <InfoRow label="Jabatan"    value={selected.jabatan_tujuan ?? "—"} />
                <InfoRow label="Divisi"     value={selected.divisi_tujuan ?? "—"} />
                <InfoRow label="Sub Divisi" value={selected.subdivisi_tujuan ?? "—"} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <InfoRow label="Tgl Mutasi" value={formatDate(selected.tgl_mutasi)} />
              <InfoRow label="No SK"      value={selected.no_sk ?? "—"} />
              <InfoRow label="Alasan"     value={selected.alasan ?? "—"} />
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDelete open={deleteOpen} onClose={() => setDeleteOpen(false)}
        onConfirm={handleDelete} loading={deleting}
        title="Hapus Mutasi Karyawan"
        description={`Hapus record mutasi "${selected?.nama_karyawan}"? Catatan: jabatan karyawan TIDAK akan dikembalikan ke posisi semula.`}
      />
    </div>
  )
}

"use client"

import React, { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Modal } from "@/components/ui/modal"
import { ConfirmDelete } from "@/components/ui/confirm-delete"
import { TextField, SelectField, TextareaField } from "@/components/ui/form-field"
import { Input } from "@/components/ui/input"
import { Plus, Pencil, Trash2, Eye, AlertTriangle, RefreshCw, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Search, Wrench, CreditCard, Info, FileText, ImagePlus, X, ImageOff } from "lucide-react"
import { formatCurrency, formatDate } from "@/lib/utils"
import { useApi } from "@/hooks/useApi"
import { useCrud } from "@/hooks/useCrud"
import { useAuth } from "@/contexts/AuthContext"
import { canCreateOrEditTransaksi, canDeleteTransaksi } from "@/lib/transaksi-role"

/* ── Types ─────────────────────────────────────────────────────── */
interface KontrakInfo {
  id: number; no_kontrak: string | null; judul: string
  tgl_awal: string; tgl_akhir: string; masa_sewa: number; aktif: boolean
}
interface Kendaraan {
  id: number; kode_brg: string; jns_brg: string; plat: string; nm_brg: string
  thn: number | null; no_rangka: string | null; no_mesin: string | null
  pajak: string | null; stnk: string | null; tgl_akhir_kir: string | null
  warna: string | null; pemegang: string | null; departemen: string | null
  hrg_beli: number | null; hrg_sewa: number | null
  stat: string | null; tgl_stop_tagihan: string | null; alasan_stop_tagihan: string | null
  deskripsi: string | null; no_bpkb: string | null
  gambar_fisik: string | null; gambar_pajak: string | null
  gambar_stnk: string | null; gbr_barang: string | null
  kontrak_info?: KontrakInfo[]
}
interface RiwayatServis { id: number; tanggal_servis: string; jenis_servis: string; biaya: number; bengkel: string | null; keterangan: string | null }
interface RiwayatPembayaran { id: number; jenis_pembayaran: string; tanggal_pembayaran: string; biaya: number; jatuh_tempo_berikutnya: string | null; keterangan: string | null }

/* ── Helper: src gambar via proxy ───────────────────────────────── */
type ImgField = "gambar_fisik" | "gambar_pajak" | "gambar_stnk" | "gbr_barang"
const IMG_LABELS: Record<ImgField, string> = {
  gambar_fisik: "Foto Fisik",
  gambar_pajak: "Foto Pajak",
  gambar_stnk:  "Foto STNK",
  gbr_barang:   "Foto Kendaraan",
}
function gambarSrc(id: number, key: string | null, field: ImgField): string | null {
  if (!key) return null
  if (key.startsWith("http://") || key.startsWith("https://") || key.startsWith("/")) return key
  return `/api/kendaraan/${id}/gambar?field=${field}`
}

const JNS_VARIANT: Record<string, "default" | "info" | "success" | "warning"> = {  "R4 Operasional": "default", "R4 Dinas": "info", "R2 Operasional": "success", "R2 Dinas": "warning"
}

const STAT_OPTIONS = [
  "Habis Kontrak", "Di pakai - Tidak ada Kontrak",
  "Sewa - Kontrak Berjalan", "Sewa dihentikan", "Operasional Pedami"
]

const ALASAN_STOP = ["Pensiun", "Mutasi", "Unit Ditarik", "Kontrak Dihentikan", "Lainnya"]

const isPajak30 = (tgl: string | null) => {
  if (!tgl) return false
  const d = Math.floor((new Date(tgl).getTime() - Date.now()) / 86400000)
  return d >= 0 && d <= 30
}
const getSisaHari = (tgl: string | null) => tgl ? Math.max(0, Math.floor((new Date(tgl).getTime() - Date.now()) / 86400000)) : null

const EMPTY: Partial<Kendaraan> = { jns_brg: "R2 Operasional", stat: "Operasional Pedami" }
const PER_PAGE = 10

/* ── Main Page ──────────────────────────────────────────────────── */
export default function KendaraanPage() {
  const { user } = useAuth()
  const { data, loading, refetch } = useApi<Kendaraan[]>("/api/kendaraan")
  const list = data ?? []
  const { create, update, remove, saving, deleting } = useCrud<Kendaraan>({ apiPath: "/api/kendaraan", onSuccess: refetch })
  const canManageData = canCreateOrEditTransaksi(user?.role)
  const canDeleteData = canDeleteTransaksi(user?.role)

  const [modalOpen, setModalOpen]   = useState(false)
  const [viewOpen, setViewOpen]     = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [editMode, setEditMode]     = useState(false)
  const [selected, setSelected]     = useState<Kendaraan | null>(null)
  const [form, setForm]             = useState<Partial<Kendaraan>>(EMPTY)
  const [errors, setErrors]         = useState<Record<string, string>>({})

  // Riwayat servis & pembayaran untuk detail view
  const [riwayatServis, setRiwayatServis]       = useState<RiwayatServis[]>([])
  const [riwayatPembayaran, setRiwayatPembayaran] = useState<RiwayatPembayaran[]>([])
  const [detailTab, setDetailTab] = useState<"info" | "foto" | "servis" | "pembayaran">("info")
  const [loadingRelasi, setLoadingRelasi]       = useState(false)

  // Filter + pagination
  const [search, setSearch]     = useState("")
  const [jnsFilter, setJnsFilter] = useState("")
  const [page, setPage]         = useState(1)

  const filtered = list.filter(k => {
    const matchSearch = !search || [k.plat, k.nm_brg, k.kode_brg, k.pemegang ?? ""].some(v => v.toLowerCase().includes(search.toLowerCase()))
    const matchJns    = !jnsFilter || k.jns_brg === jnsFilter
    return matchSearch && matchJns
  })
  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE))
  const paginated  = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE)

  const setF = (k: keyof Kendaraan, v: string) => setForm(f => {
    const next = { ...f, [k]: v || null }
    // Business logic: tgl_stop_tagihan → auto set stat
    if (k === "tgl_stop_tagihan") {
      if (v) {
        next.stat = "Sewa dihentikan"
      } else if (f.stat === "Sewa dihentikan") {
        next.stat = "Sewa - Kontrak Berjalan"
      }
    }
    return next
  })

  const openAdd = () => {
    if (!canManageData) return
    setEditMode(false); setSelected(null); setForm(EMPTY); setErrors({}); setLocalPreviews({})
    setModalOpen(true)
  }
  const openEdit = (row: Kendaraan) => {
    if (!canManageData) return
    setEditMode(true); setSelected(row); setForm(row); setErrors({}); setLocalPreviews({})
    setModalOpen(true)
  }

  const openView = async (row: Kendaraan) => {
    setSelected(row); setDetailTab("info"); setViewOpen(true)
    setLoadingRelasi(true)
    try {
      const [s, p] = await Promise.all([
        fetch(`/api/servis-kendaraan?kendaraan_id=${row.id}`).then(r => r.ok ? r.json() : []),
        fetch(`/api/pembayaran-kendaraan?kendaraan_id=${row.id}`).then(r => r.ok ? r.json() : []),
      ])
      setRiwayatServis(s)
      setRiwayatPembayaran(p)
    } catch {
      setRiwayatServis([]); setRiwayatPembayaran([])
    } finally {
      setLoadingRelasi(false)
    }
  }

  const handleSubmit = async () => {
    if (!canManageData) return
    const e: Record<string, string> = {}
    if (!form.kode_brg) e.kode_brg = "Wajib diisi"
    if (!form.jns_brg)  e.jns_brg  = "Wajib dipilih"
    if (!form.plat)     e.plat     = "Wajib diisi"
    if (!form.nm_brg)   e.nm_brg   = "Wajib diisi"
    setErrors(e); if (Object.keys(e).length) return

    // Hapus computed fields
    const { kontrak_info: _ki, ...payload } = form as any
    const ok = editMode && selected ? await update(selected.id, payload) : await create(payload)
    if (ok) setModalOpen(false)
  }

  const handleDelete = async () => {
    if (!selected || !canDeleteData) return
    const ok = await remove(selected.id)
    if (ok) setDeleteOpen(false)
  }

  const [uploading, setUploading]   = useState<ImgField | null>(null)
  const [uploadErr, setUploadErr]   = useState<string | null>(null)
  const [localPreviews, setLocalPreviews] = useState<Partial<Record<ImgField, string>>>({})

  const handleUploadGambar = async (file: File, kendaraanId: number, field: ImgField) => {
    // Preview instan sebelum upload selesai
    const objectUrl = URL.createObjectURL(file)
    setLocalPreviews(p => ({ ...p, [field]: objectUrl }))
    setUploading(field); setUploadErr(null)
    try {
      const fd = new FormData(); fd.append("file", file)
      const res  = await fetch(`/api/kendaraan/${kendaraanId}/gambar?field=${field}`, { method: "POST", body: fd })
      const json = await res.json()
      if (!res.ok) {
        setUploadErr(json.error ?? "Gagal upload")
        URL.revokeObjectURL(objectUrl)
        setLocalPreviews(p => { const n = { ...p }; delete n[field]; return n })
        return
      }
      const newKey = json.kendaraan?.[field] ?? null
      setForm(f => ({ ...f, [field]: newKey }))
      setSelected(s => s ? { ...s, [field]: newKey } : s)
      refetch()
    } catch {
      setUploadErr("Gagal upload gambar")
      URL.revokeObjectURL(objectUrl)
      setLocalPreviews(p => { const n = { ...p }; delete n[field]; return n })
    } finally  { setUploading(null) }
  }

  const handleHapusGambar = async (kendaraanId: number, field: ImgField) => {
    if (localPreviews[field]) { URL.revokeObjectURL(localPreviews[field]!); setLocalPreviews(p => { const n = { ...p }; delete n[field]; return n }) }
    setUploading(field)
    try {
      await fetch(`/api/kendaraan/${kendaraanId}/gambar?field=${field}`, { method: "DELETE" })
      setForm(f => ({ ...f, [field]: null }))
      setSelected(s => s ? { ...s, [field]: null } : s)
      refetch()
    } finally { setUploading(null) }
  }

  const stats = [
    { label: "R2 Operasional", value: list.filter(d => d.jns_brg === "R2 Operasional").length, color: "var(--success)" },
    { label: "R2 Dinas",       value: list.filter(d => d.jns_brg === "R2 Dinas").length,       color: "var(--warning)" },
    { label: "R4 Operasional", value: list.filter(d => d.jns_brg === "R4 Operasional").length, color: "var(--primary)" },
    { label: "R4 Dinas",       value: list.filter(d => d.jns_brg === "R4 Dinas").length,       color: "var(--info)" },
    { label: "Stop Tagihan",   value: list.filter(d => d.tgl_stop_tagihan).length,             color: "var(--danger)" },
  ]

  /* ── Cetak Laporan ───────────────────────────────────────── */
  const [laporanOpen, setLaporanOpen]       = useState(false)
  const [laporanLoading, setLaporanLoading] = useState(false)
  const [laporanJns, setLaporanJns]         = useState("")
  const [laporanStat, setLaporanStat]       = useState("")
  const [laporanFormat, setLaporanFormat]   = useState<"pdf" | "excel">("pdf")

  const handleCetakLaporan = async () => {
    setLaporanLoading(true)
    try {
      const params: Record<string, string> = {}
      if (laporanJns)  params.jns_brg = laporanJns
      if (laporanStat) params.stat    = laporanStat

      if (laporanFormat === "pdf") {
        sessionStorage.setItem("cetak-laporan-kendaraan-params", JSON.stringify(params))
        window.open("/cetak-laporan-kendaraan", "_blank")
        setLaporanOpen(false)
      } else {
        const qs = new URLSearchParams(params)
        const res = await fetch(`/api/laporan/kendaraan?${qs}`)
        const rows = await res.json()

        const { utils, writeFile } = await import("xlsx")
        const wb = utils.book_new()
        const wsData: (string | number | null)[][] = [
          ["LAPORAN PENDATAAN KENDARAAN (R2 & R4)"],
          ["KOPERASI KONSUMEN PEDAMI"],
          [`Dicetak pada: ${new Date().toLocaleString("id-ID")}`],
          [],
          ["No", "Kode", "Jenis", "Plat", "Nama Barang", "Tahun", "Pajak", "STNK", "Pemegang", "Departemen", "Status", "Harga Sewa"],
          ...rows.map((r: any, i: number) => [
            i + 1,
            r.kode_brg, r.jns_brg, r.plat, r.nm_brg, r.thn ?? "-",
            r.pajak ? new Date(r.pajak).toLocaleDateString("id-ID") : "-",
            r.stnk  ? new Date(r.stnk).toLocaleDateString("id-ID")  : "-",
            r.pemegang ?? "-", r.departemen ?? "-", r.stat ?? "-",
            Number(r.hrg_sewa) || 0,
          ]),
          ["", "", "", "", "", "", "", "", "", "", "Total:", rows.reduce((s: number, r: any) => s + (Number(r.hrg_sewa) || 0), 0)],
        ]
        const ws = utils.aoa_to_sheet(wsData)
        ws["!cols"] = [{wch:4},{wch:8},{wch:14},{wch:10},{wch:25},{wch:6},{wch:10},{wch:10},{wch:18},{wch:16},{wch:20},{wch:14}]
        utils.book_append_sheet(wb, ws, "Laporan Kendaraan")
        writeFile(wb, `Laporan_Kendaraan_R2R4_${new Date().toISOString().slice(0,10)}.xlsx`)
        setLaporanOpen(false)
      }
    } finally { setLaporanLoading(false) }
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--text-900)" }}>Data Roda 2 & 4</h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-subtle)" }}>Kelola data kendaraan operasional, dinas, dan sewa</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={refetch}><RefreshCw className="h-3.5 w-3.5" /></Button>
          <Button variant="outline" size="sm" style={{ color: "var(--info)", borderColor: "var(--info)" }}
            onClick={() => { setLaporanJns(""); setLaporanStat(""); setLaporanFormat("pdf"); setLaporanOpen(true) }}>
            <FileText className="h-3.5 w-3.5 mr-1.5" />
            Cetak Laporan
          </Button>
          {canManageData && <Button size="sm" onClick={openAdd}><Plus className="h-3.5 w-3.5 mr-1.5" />Tambah Kendaraan</Button>}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {stats.map(s => (
          <Card key={s.label}><CardContent className="p-4">
            <p className="text-xs" style={{ color: "var(--text-subtle)" }}>{s.label}</p>
            <p className="text-xl font-bold font-mono mt-0.5" style={{ color: s.color }}>{loading ? "…" : s.value}</p>
          </CardContent></Card>
        ))}
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5" style={{ color: "var(--text-subtle)" }} />
          <Input placeholder="Cari plat, nama, kode..." value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} className="pl-9 h-8" />
        </div>
        <select value={jnsFilter} onChange={e => { setJnsFilter(e.target.value); setPage(1) }}
          className="h-8 rounded-lg px-3 text-sm cursor-pointer"
          style={{ border: "1px solid var(--border-strong)", background: "var(--surface)", color: "var(--text-900)" }}>
          <option value="">Semua Jenis</option>
          {["R2 Operasional","R2 Dinas","R4 Operasional","R4 Dinas"].map(j => <option key={j} value={j}>{j}</option>)}
        </select>
        {(search || jnsFilter) && <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setJnsFilter(""); setPage(1) }}>Reset</Button>}
      </div>

      {/* Table */}
      <div className="rounded-xl overflow-x-auto" style={{ border: "1px solid var(--border)", background: "var(--surface)" }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: "var(--surface-muted)", borderBottom: "1px solid var(--border)" }}>
              {["#","Kode","Kendaraan","Jenis","Tahun","Pajak","STNK","KIR","Pemegang","Kontrak","Status","Aksi"].map(h => (
                <th key={h} className="px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-wide whitespace-nowrap" style={{ color: "var(--text-subtle)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}><td colSpan={12} className="p-4">
                  <div className="h-4 rounded animate-pulse" style={{ background: "var(--primary-light)" }} />
                </td></tr>
              ))
            ) : paginated.length === 0 ? (
              <tr><td colSpan={12} className="py-16 text-center" style={{ color: "var(--text-subtle)" }}>Tidak ada data kendaraan</td></tr>
            ) : (
              paginated.map((row, i) => (
                <tr key={row.id} className="transition-colors duration-150"
                  style={{ borderBottom: "1px solid var(--border)" }}
                  onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = "var(--surface-hover)")}
                  onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = "transparent")}
                >
                  <td className="px-3 py-3 text-xs" style={{ color: "var(--text-subtle)" }}>{(page-1)*PER_PAGE+i+1}</td>
                  <td className="px-3 py-3"><Badge variant="secondary" className="font-mono text-xs">{row.kode_brg}</Badge></td>
                  <td className="px-3 py-3 min-w-[160px]">
                    <p className="font-semibold" style={{ color: "var(--text-900)" }}>{row.nm_brg}</p>
                    <p className="text-xs font-mono" style={{ color: "var(--text-subtle)" }}>{row.plat}</p>
                  </td>
                  <td className="px-3 py-3"><Badge variant={JNS_VARIANT[row.jns_brg] ?? "secondary"}>{row.jns_brg}</Badge></td>
                  <td className="px-3 py-3 text-xs">{row.thn ?? "—"}</td>
                  {/* Pajak dengan alert */}
                  <td className="px-3 py-3 text-xs">
                    <div className="flex items-center gap-1">
                      {isPajak30(row.pajak) && <AlertTriangle className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--danger)" }} />}
                      <span style={isPajak30(row.pajak) ? { color: "var(--danger)", fontWeight: 600 } : {}}>{row.pajak ? formatDate(row.pajak) : "—"}</span>
                    </div>
                  </td>
                  {/* STNK */}
                  <td className="px-3 py-3 text-xs">
                    <div className="flex items-center gap-1">
                      {isPajak30(row.stnk) && <AlertTriangle className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--warning)" }} />}
                      <span style={isPajak30(row.stnk) ? { color: "var(--warning)", fontWeight: 600 } : {}}>{row.stnk ? formatDate(row.stnk) : "—"}</span>
                    </div>
                  </td>
                  {/* KIR */}
                  <td className="px-3 py-3 text-xs">{row.tgl_akhir_kir ? formatDate(row.tgl_akhir_kir) : "—"}</td>
                  <td className="px-3 py-3 text-xs">{row.pemegang ?? "—"}</td>
                  {/* Kontrak (badge AKTIF/EXPIRED sesuai pedami) */}
                  <td className="px-3 py-3 min-w-[160px]">
                    {(row.kontrak_info ?? []).length === 0 ? (
                      <span className="text-xs" style={{ color: "var(--text-subtle)" }}>—</span>
                    ) : (
                      <div className="space-y-1">
                        {(row.kontrak_info ?? []).slice(0, 2).map(k => (
                          <div key={k.id} className="flex items-center gap-1 text-xs">
                            <Badge variant={k.aktif ? "success" : "secondary"} className="text-[9px] shrink-0">
                              {k.aktif ? "AKTIF" : "EXPIRED"}
                            </Badge>
                            <span className="font-mono font-semibold truncate max-w-[80px]">{k.no_kontrak ?? "—"}</span>
                            <span style={{ color: "var(--text-subtle)" }}>({k.masa_sewa}bln)</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </td>
                  {/* Status */}
                  <td className="px-3 py-3">
                    {row.stat ? (
                      <div>
                        <Badge variant={
                          row.stat === "Terjual" ? "destructive" :
                          row.stat === "Sewa dihentikan" ? "warning" :
                          row.stat === "Sewa - Kontrak Berjalan" ? "success" :
                          row.stat === "Operasional Pedami" ? "info" : "secondary"
                        } className="text-[10px] whitespace-nowrap">{row.stat}</Badge>
                        {row.tgl_stop_tagihan && (
                          <p className="text-[10px] mt-0.5" style={{ color: "var(--danger)" }}>
                            Stop: {formatDate(row.tgl_stop_tagihan)}
                          </p>
                        )}
                      </div>
                    ) : "—"}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-0.5">
                      <Button variant="ghost" size="icon" className="h-7 w-7" style={{ color: "var(--info)" }} title="Detail + Riwayat" onClick={() => openView(row)}><Eye className="h-3.5 w-3.5" /></Button>
                      {canManageData && <Button variant="ghost" size="icon" className="h-7 w-7" style={{ color: "var(--warning)" }} title="Edit" onClick={() => openEdit(row)}><Pencil className="h-3.5 w-3.5" /></Button>}
                      {canDeleteData && <Button variant="ghost" size="icon" className="h-7 w-7" style={{ color: "var(--danger)" }} title="Hapus" onClick={() => { setSelected(row); setDeleteOpen(true) }}><Trash2 className="h-3.5 w-3.5" /></Button>}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs" style={{ color: "var(--text-subtle)" }}>{(page-1)*PER_PAGE+1}–{Math.min(page*PER_PAGE, filtered.length)} dari {filtered.length}</p>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setPage(1)} disabled={page===1}><ChevronsLeft className="h-3.5 w-3.5" /></Button>
            <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setPage(p=>p-1)} disabled={page===1}><ChevronLeft className="h-3.5 w-3.5" /></Button>
            <span className="px-3 text-xs" style={{ color: "var(--text-700)" }}>{page}/{totalPages}</span>
            <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setPage(p=>p+1)} disabled={page===totalPages}><ChevronRight className="h-3.5 w-3.5" /></Button>
            <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setPage(totalPages)} disabled={page===totalPages}><ChevronsRight className="h-3.5 w-3.5" /></Button>
          </div>
        </div>
      )}

      {/* ── Create / Edit Modal ──────────────────────────────────── */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} size="xl"
        title={editMode ? "Edit Data Kendaraan" : "Tambah Data Kendaraan"}
        footer={<><Button variant="outline" onClick={() => setModalOpen(false)}>Batal</Button>{canManageData && <Button onClick={handleSubmit} disabled={saving}>{saving ? "Menyimpan..." : "Simpan"}</Button>}</>}
      >
        {errors._ && <div className="mb-4 rounded-lg px-4 py-3 text-sm" style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>{errors._}</div>}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <TextField label="Kode Barang" required error={errors.kode_brg} value={form.kode_brg ?? ""} onChange={e => setF("kode_brg", e.target.value)} />
          <SelectField label="Jenis Kendaraan" required error={errors.jns_brg}
            value={form.jns_brg ?? ""} onChange={e => setF("jns_brg", e.target.value)}
            options={["R2 Operasional","R2 Dinas","R4 Operasional","R4 Dinas"].map(v => ({ value: v, label: v }))} />
          <TextField label="No Plat" required error={errors.plat} value={form.plat ?? ""} onChange={e => setF("plat", e.target.value)} />
          <TextField label="Nama Kendaraan" required error={errors.nm_brg} value={form.nm_brg ?? ""} onChange={e => setF("nm_brg", e.target.value)} />
          <TextField label="Tahun" type="number" value={String(form.thn ?? "")} onChange={e => setForm(f => ({ ...f, thn: e.target.value ? Number(e.target.value) : null }))} />
          <TextField label="Warna" value={form.warna ?? ""} onChange={e => setF("warna", e.target.value)} />
          <TextField label="No Rangka" value={form.no_rangka ?? ""} onChange={e => setF("no_rangka", e.target.value)} />
          <TextField label="No Mesin" value={form.no_mesin ?? ""} onChange={e => setF("no_mesin", e.target.value)} />
          <TextField label="No BPKB" value={form.no_bpkb ?? ""} onChange={e => setF("no_bpkb", e.target.value)} />
          <TextField label="Harga Beli (Rp)" type="number" value={String(form.hrg_beli ?? "")} onChange={e => setForm(f => ({ ...f, hrg_beli: e.target.value ? Number(e.target.value) : null }))} />
          <TextField label="Harga Sewa (Rp)" type="number" value={String(form.hrg_sewa ?? "")} onChange={e => setForm(f => ({ ...f, hrg_sewa: e.target.value ? Number(e.target.value) : null }))} />
          <TextField label="Pemegang" value={form.pemegang ?? ""} onChange={e => setF("pemegang", e.target.value)} />
          <TextField label="Departemen" value={form.departemen ?? ""} onChange={e => setF("departemen", e.target.value)} />
          <TextField label="Pajak (Tgl Exp)" type="date" value={form.pajak?.split("T")[0] ?? ""} onChange={e => setF("pajak", e.target.value)} />
          <TextField label="STNK (Tgl Exp)" type="date" value={form.stnk?.split("T")[0] ?? ""} onChange={e => setF("stnk", e.target.value)} />
          <TextField label="KIR (Tgl Akhir)" type="date" value={form.tgl_akhir_kir?.split("T")[0] ?? ""} onChange={e => setF("tgl_akhir_kir", e.target.value)} />

          {/* Status — disabled jika Terjual */}
          <div>
            <SelectField label="Status"
              value={form.stat ?? ""}
              onChange={e => setF("stat", e.target.value)}
              disabled={form.stat === "Terjual"}
              options={[
                ...STAT_OPTIONS.map(v => ({ value: v, label: v })),
                // Show 'Terjual' only when already set to 'Terjual'
                ...(form.stat === "Terjual" ? [{ value: "Terjual", label: "Terjual" }] : []),
              ]}
            />
            {form.stat === "Terjual" && (
              <p className="text-xs mt-1 px-1" style={{ color: "var(--text-subtle)" }}>Status terkunci — kendaraan sudah terjual</p>
            )}
          </div>

          {/* tgl_stop_tagihan — visible jika stat berhubungan sewa */}
          {(form.stat === "Sewa - Kontrak Berjalan" || form.stat === "Sewa dihentikan" || form.tgl_stop_tagihan) && (
            <TextField label="Tanggal Stop Tagihan"
              type="date"
              value={form.tgl_stop_tagihan?.split("T")[0] ?? ""}
              onChange={e => setF("tgl_stop_tagihan", e.target.value)}
            />
          )}

          {/* Alasan stop tagihan — visible jika tgl_stop diisi */}
          {form.tgl_stop_tagihan && (
            <SelectField label="Alasan Stop Tagihan"
              value={form.alasan_stop_tagihan ?? ""}
              onChange={e => setF("alasan_stop_tagihan", e.target.value)}
              placeholder="— Pilih Alasan —"
              options={ALASAN_STOP.map(v => ({ value: v, label: v }))}
            />
          )}

          <TextareaField label="Deskripsi" value={form.deskripsi ?? ""} onChange={e => setF("deskripsi", e.target.value)} className="md:col-span-3" />

          {/* ── Upload Gambar (edit mode only) ───────────────────── */}
          {editMode && selected && canManageData && (
            <div className="md:col-span-3 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Gambar</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {(["gambar_fisik","gambar_pajak","gambar_stnk","gbr_barang"] as ImgField[]).map(field => {
                  const key  = form[field] as string | null
                  const src  = localPreviews[field] ?? gambarSrc(selected.id, key, field)
                  const busy = uploading === field
                  return (
                    <div key={field} className="space-y-1.5">
                      <p className="text-xs font-medium" style={{ color: "var(--text-700)" }}>{IMG_LABELS[field]}</p>
                      <div className="relative">
                        {src ? (
                          <>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={src} alt={IMG_LABELS[field]}
                              className="w-full h-24 rounded-lg object-cover"
                              style={{ border: "1px solid var(--border)" }} />
                            <button type="button" disabled={busy}
                              onClick={() => handleHapusGambar(selected.id, field)}
                              className="absolute -top-2 -right-2 h-5 w-5 rounded-full flex items-center justify-center text-white"
                              style={{ background: "var(--danger)", opacity: busy ? 0.5 : 1 }}>
                              <X className="h-3 w-3" />
                            </button>
                          </>
                        ) : (
                          <div className="w-full h-24 rounded-lg flex items-center justify-center"
                            style={{ border: "1px dashed var(--border-strong)", background: "var(--surface-muted)" }}>
                            <ImageOff className="h-5 w-5" style={{ color: "var(--text-subtle)" }} />
                          </div>
                        )}
                      </div>
                      <label className="flex items-center justify-center gap-1.5 w-full rounded-lg px-2 py-1.5 text-xs font-medium cursor-pointer transition-colors"
                        style={{
                          border: "1px solid var(--border-strong)",
                          background: "var(--surface-muted)",
                          color: "var(--text-700)",
                          opacity: busy ? 0.6 : 1,
                          pointerEvents: busy ? "none" : "auto",
                        }}>
                        <ImagePlus className="h-3.5 w-3.5" />
                        {busy ? "Uploading..." : src ? "Ganti" : "Upload"}
                        <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
                          disabled={busy}
                          onChange={e => {
                            const file = e.target.files?.[0]
                            if (file) handleUploadGambar(file, selected.id, field)
                            e.target.value = ""
                          }} />
                      </label>
                    </div>
                  )
                })}
              </div>
              {uploadErr && <p className="text-xs" style={{ color: "var(--danger)" }}>{uploadErr}</p>}
              <p className="text-xs" style={{ color: "var(--text-subtle)" }}>JPG, PNG, atau WEBP · Maks 5 MB per gambar</p>
            </div>
          )}
        </div>

        {/* Business logic info */}
        {(form.stat === "Sewa - Kontrak Berjalan" || form.stat === "Sewa dihentikan") && (
          <div className="mt-4 flex items-start gap-2 rounded-xl p-3 text-xs" style={{ background: "var(--warning-bg)", border: "1px solid #FDE68A" }}>
            <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" style={{ color: "var(--warning)" }} />
            <span style={{ color: "#92400E" }}>
              Mengisi <strong>Tanggal Stop Tagihan</strong> akan otomatis mengubah status menjadi <strong>"Sewa dihentikan"</strong>. Kosongkan kembali untuk kembali ke "Sewa - Kontrak Berjalan".
            </span>
          </div>
        )}
      </Modal>

      {/* ── Detail View Modal dengan TABS ────────────────────────── */}
      <Modal open={viewOpen} onClose={() => setViewOpen(false)} title={`Detail Kendaraan: ${selected?.nm_brg ?? ""}`} size="xl">
        {selected && (
          <div className="space-y-5">
            {/* Tab buttons */}
            <div className="flex gap-2 border-b" style={{ borderColor: "var(--border)" }}>
              {[
                { key: "info",        label: "Informasi", icon: <Eye className="h-3.5 w-3.5" /> },
                { key: "foto",        label: "Foto", icon: <ImageOff className="h-3.5 w-3.5" /> },
                { key: "servis",      label: `Riwayat Servis (${riwayatServis.length})`, icon: <Wrench className="h-3.5 w-3.5" /> },
                { key: "pembayaran",  label: `Riwayat Pembayaran (${riwayatPembayaran.length})`, icon: <CreditCard className="h-3.5 w-3.5" /> },
              ].map(tab => (
                <button key={tab.key} onClick={() => setDetailTab(tab.key as any)}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors duration-150 cursor-pointer"
                  style={{
                    borderBottomColor: detailTab === tab.key ? "var(--primary)" : "transparent",
                    color: detailTab === tab.key ? "var(--primary)" : "var(--text-muted)",
                  }}
                >
                  {tab.icon} {tab.label}
                </button>
              ))}
            </div>

            {/* Tab: Informasi */}
            {detailTab === "info" && (
              <div className="space-y-5">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {[
                    ["Kode Barang", selected.kode_brg], ["Jenis", selected.jns_brg],
                    ["No Plat", selected.plat], ["Nama", selected.nm_brg],
                    ["Tahun", selected.thn], ["Warna", selected.warna],
                    ["No Rangka", selected.no_rangka], ["No Mesin", selected.no_mesin],
                    ["No BPKB", selected.no_bpkb], ["Pemegang", selected.pemegang],
                    ["Departemen", selected.departemen],
                    ["Pajak", selected.pajak ? formatDate(selected.pajak) : null],
                    ["STNK", selected.stnk ? formatDate(selected.stnk) : null],
                    ["KIR", selected.tgl_akhir_kir ? formatDate(selected.tgl_akhir_kir) : null],
                    ["Status", selected.stat], ["Harga Beli", selected.hrg_beli ? formatCurrency(Number(selected.hrg_beli)) : null],
                    ["Harga Sewa", selected.hrg_sewa ? formatCurrency(Number(selected.hrg_sewa)) : null],
                    ["Stop Tagihan", selected.tgl_stop_tagihan ? formatDate(selected.tgl_stop_tagihan) : null],
                    ["Alasan Stop", selected.alasan_stop_tagihan],
                  ].map(([k, v]) => (
                    <div key={String(k)}>
                      <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-subtle)" }}>{k}</p>
                      <p className="mt-0.5 font-medium" style={{ color: "var(--text-900)" }}>{String(v ?? "—")}</p>
                    </div>
                  ))}
                </div>

                {/* Kontrak list */}
                {(selected.kontrak_info ?? []).length > 0 && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--text-subtle)" }}>Kontrak Terkait</p>
                    <div className="space-y-2">
                      {(selected.kontrak_info ?? []).map(k => (
                        <div key={k.id} className="flex items-center justify-between gap-3 p-3 rounded-lg" style={{ background: "var(--surface-muted)", border: "1px solid var(--border)" }}>
                          <div>
                            <p className="text-sm font-semibold font-mono" style={{ color: "var(--text-900)" }}>{k.no_kontrak ?? "—"}</p>
                            <p className="text-xs mt-0.5" style={{ color: "var(--text-subtle)" }}>{k.judul} · {k.masa_sewa} bulan</p>
                            <p className="text-xs" style={{ color: "var(--text-subtle)" }}>{formatDate(k.tgl_awal)} – {formatDate(k.tgl_akhir)}</p>
                          </div>
                          <Badge variant={k.aktif ? "success" : "secondary"}>{k.aktif ? "AKTIF" : "EXPIRED"}</Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Tab: Foto */}
            {detailTab === "foto" && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {(["gambar_fisik","gambar_pajak","gambar_stnk","gbr_barang"] as ImgField[]).map(field => {
                  const src = gambarSrc(selected.id, selected[field] as string | null, field)
                  return (
                    <div key={field} className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-subtle)" }}>
                        {IMG_LABELS[field]}
                      </p>
                      {src ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={src} alt={IMG_LABELS[field]}
                          className="w-full rounded-xl object-cover"
                          style={{ maxHeight: 180, border: "1px solid var(--border)", background: "var(--surface-muted)" }} />
                      ) : (
                        <div className="w-full h-28 rounded-xl flex flex-col items-center justify-center gap-1"
                          style={{ border: "1px dashed var(--border)", background: "var(--surface-muted)" }}>
                          <ImageOff className="h-5 w-5" style={{ color: "var(--text-subtle)" }} />
                          <p className="text-xs" style={{ color: "var(--text-subtle)" }}>Belum ada foto</p>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {/* Tab: Riwayat Servis */}
            {detailTab === "servis" && (              <div>
                {loadingRelasi ? (
                  <p className="text-sm text-center py-8" style={{ color: "var(--text-subtle)" }}>Memuat riwayat servis...</p>
                ) : riwayatServis.length === 0 ? (
                  <p className="text-sm text-center py-8" style={{ color: "var(--text-subtle)" }}>Belum ada riwayat servis</p>
                ) : (
                  <div className="space-y-2">
                    {riwayatServis.map(s => (
                      <div key={s.id} className="flex items-start justify-between gap-3 p-3 rounded-lg" style={{ background: "var(--surface-muted)", border: "1px solid var(--border)" }}>
                        <div>
                          <p className="text-sm font-semibold" style={{ color: "var(--text-900)" }}>{s.jenis_servis}</p>
                          <p className="text-xs mt-0.5" style={{ color: "var(--text-subtle)" }}>{formatDate(s.tanggal_servis)} · {s.bengkel ?? "—"}</p>
                          {s.keterangan && <p className="text-xs mt-0.5 italic" style={{ color: "var(--text-subtle)" }}>{s.keterangan}</p>}
                        </div>
                        <span className="font-mono font-semibold text-sm shrink-0" style={{ color: "var(--warning)" }}>{formatCurrency(Number(s.biaya))}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Tab: Riwayat Pembayaran */}
            {detailTab === "pembayaran" && (
              <div>
                {loadingRelasi ? (
                  <p className="text-sm text-center py-8" style={{ color: "var(--text-subtle)" }}>Memuat riwayat pembayaran...</p>
                ) : riwayatPembayaran.length === 0 ? (
                  <p className="text-sm text-center py-8" style={{ color: "var(--text-subtle)" }}>Belum ada riwayat pembayaran</p>
                ) : (
                  <div className="space-y-2">
                    {riwayatPembayaran.map(p => (
                      <div key={p.id} className="flex items-start justify-between gap-3 p-3 rounded-lg" style={{ background: "var(--surface-muted)", border: "1px solid var(--border)" }}>
                        <div>
                          <div className="flex items-center gap-2">
                            <Badge variant={p.jenis_pembayaran === "Pajak" ? "default" : p.jenis_pembayaran === "STNK" ? "success" : "warning"}>{p.jenis_pembayaran}</Badge>
                            <span className="text-sm font-medium" style={{ color: "var(--text-900)" }}>{formatDate(p.tanggal_pembayaran)}</span>
                          </div>
                          {p.jatuh_tempo_berikutnya && (
                            <p className="text-xs mt-0.5" style={{ color: new Date(p.jatuh_tempo_berikutnya) < new Date() ? "var(--danger)" : "var(--text-subtle)" }}>
                              Tempo berikutnya: {formatDate(p.jatuh_tempo_berikutnya)}
                              {new Date(p.jatuh_tempo_berikutnya) < new Date() ? " ⚠ Sudah lewat!" : ""}
                            </p>
                          )}
                          {p.keterangan && <p className="text-xs mt-0.5 italic" style={{ color: "var(--text-subtle)" }}>{p.keterangan}</p>}
                        </div>
                        <span className="font-mono font-semibold text-sm shrink-0" style={{ color: "var(--primary)" }}>{formatCurrency(Number(p.biaya))}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </Modal>

      <ConfirmDelete open={deleteOpen} onClose={() => setDeleteOpen(false)}
        onConfirm={handleDelete} loading={deleting}
        description={`Hapus kendaraan "${selected?.nm_brg} (${selected?.plat})"?`}
      />
      {/* ── Modal Cetak Laporan ───────────────────────────────────── */}
      <Modal
        open={laporanOpen}
        onClose={() => setLaporanOpen(false)}
        size="md"
        title="Cetak Laporan Pendataan R2 & R4"
        footer={
          <>
            <Button variant="outline" onClick={() => setLaporanOpen(false)}>Batal</Button>
            <Button onClick={handleCetakLaporan} disabled={laporanLoading}
              style={{ background: "var(--info)", color: "#fff" }}>
              <FileText className="h-3.5 w-3.5 mr-1.5" />
              {laporanLoading ? "Menyiapkan..." : "Unduh Laporan"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-xs" style={{ color: "var(--text-subtle)" }}>
            Filter opsional — kosongkan untuk mengambil semua data.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Jenis Kendaraan */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Jenis Kendaraan</label>
              <select value={laporanJns} onChange={e => setLaporanJns(e.target.value)}
                className="h-8 w-full rounded-lg px-3 text-sm"
                style={{ border: "1px solid var(--border-strong)", background: "var(--surface)", color: "var(--text-900)" }}>
                <option value="">Semua Jenis</option>
                <option value="R2 Operasional">R2 Operasional</option>
                <option value="R4 Operasional">R4 Operasional</option>
                <option value="R2 Dinas">R2 Dinas</option>
                <option value="R4 Dinas">R4 Dinas</option>
              </select>
            </div>

            {/* Status */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Status</label>
              <select value={laporanStat} onChange={e => setLaporanStat(e.target.value)}
                className="h-8 w-full rounded-lg px-3 text-sm"
                style={{ border: "1px solid var(--border-strong)", background: "var(--surface)", color: "var(--text-900)" }}>
                <option value="">Semua Status</option>
                <option value="Habis Kontrak">Habis Kontrak</option>
                <option value="Di pakai - Tidak ada Kontrak">Di pakai - Tidak ada Kontrak</option>
                <option value="Sewa - Kontrak Berjalan">Sewa - Kontrak Berjalan</option>
                <option value="Operasional Pedami">Operasional Pedami</option>
                <option value="Terjual">Terjual</option>
              </select>
            </div>
          </div>

          {/* Format */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Format Laporan</label>
            <div className="flex gap-3">
              {(["pdf", "excel"] as const).map(fmt => (
                <button key={fmt} type="button"
                  onClick={() => setLaporanFormat(fmt)}
                  className="flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all"
                  style={{
                    border: `2px solid ${laporanFormat === fmt ? "var(--primary)" : "var(--border)"}`,
                    background: laporanFormat === fmt ? "var(--primary-light)" : "var(--surface)",
                    color: laporanFormat === fmt ? "var(--primary)" : "var(--text-muted)",
                  }}>
                  {fmt === "pdf" ? "📄 PDF (.pdf)" : "📊 Excel (.xlsx)"}
                </button>
              ))}
            </div>
            {laporanFormat === "pdf" && (
              <p className="text-xs" style={{ color: "var(--text-subtle)" }}>
                Akan membuka tab baru — gunakan Ctrl+P / Cmd+P untuk mencetak atau simpan sebagai PDF.
              </p>
            )}
          </div>
        </div>
      </Modal>    </div>
  )
}

"use client"

import React, { useState, useMemo } from "react"
import { QRCodeSVG } from "qrcode.react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Modal } from "@/components/ui/modal"
import { ConfirmDelete } from "@/components/ui/confirm-delete"
import { TextField, SelectField, TextareaField } from "@/components/ui/form-field"
import { SearchableSelect } from "@/components/ui/searchable-select"
import { Input } from "@/components/ui/input"
import {
  Plus, Pencil, Trash2, Eye, QrCode, Printer, RefreshCw,
  Search, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
  FileText, ImagePlus, X,
} from "lucide-react"
import { formatCurrency, formatDate } from "@/lib/utils"
import { useApi } from "@/hooks/useApi"
import { useCrud } from "@/hooks/useCrud"
import { useAuth } from "@/contexts/AuthContext"
import { canCreateOrEditTransaksi, canDeleteTransaksi } from "@/lib/transaksi-role"

/* ── Types ─────────────────────────────────────────────────────── */
interface Asset {
  id: number; kode_asset: string; nama_asset: string; kelompok_asset: string
  ruangan_id: number | null; penanggung_jawab_id: number; karyawan_id: number
  pemakai: string | null; status_barang: string
  tgl_beli: string | null; hrg_beli: number | null; deskripsi: string | null
  gambar: string | null; kode_nama: string | null
  // enriched
  nama_ruangan?: string | null; lokasi?: string | null
  nama_pj?: string | null; divisi_pj?: string | null; nama_pemakai?: string | null
}
interface Ruangan { id: number; ruangan: string; lokasi: string }
interface Karyawan { id: number; nik: string; nama_karyawan: string }
interface AssetReportRow {
  kode_asset: string
  nama_asset: string
  kelompok_asset: string
  tgl_beli: string | null
  hrg_beli: number | null
  nama_ruangan?: string | null
  lokasi?: string | null
  nama_pj?: string | null
  nama_pemakai?: string | null
  status_barang: string
}
interface BarcodePrintAsset {
  id: number
  kode_asset: string
  nama_asset: string
  kelompok_asset: string
  divisi_pj: string | null
  status_barang: string
  nama_ruangan?: string | null
  lokasi?: string | null
}
interface BarcodePrintMeta {
  ruangan: string | null
  kondisi: string | null
  lokasi: string | null
  total: number
}

const EMPTY: Partial<Asset> = { kelompok_asset: "komputer", status_barang: "Baik" }
const PER_PAGE = 10

/* ── Badge kondisi ──────────────────────────────────────────────── */
function KondisiBadge({ status }: { status: string }) {
  const v = status === "Baik" ? "success" : status === "Rusak Ringan" ? "warning" : "destructive"
  return <Badge variant={v}>{status}</Badge>
}

/* ── Helper: src gambar via proxy ───────────────────────────────── */
function gambarSrc(assetId: number, gambar: string | null): string | null {
  if (!gambar) return null
  // Gambar baru: hanya key (mis. "uuid.jpg") → proxy endpoint
  // Gambar lama: URL penuh → masih pakai langsung (backward compat)
  if (gambar.startsWith("http://") || gambar.startsWith("https://") || gambar.startsWith("/")) {
    return gambar
  }
  return `/api/aset/${assetId}/gambar`
}

/* ── Main Page ──────────────────────────────────────────────────── */
export default function AsetPage() {
  const { user } = useAuth()
  const { data, loading, refetch } = useApi<Asset[]>("/api/aset")
  const { data: ruangans }   = useApi<Ruangan[]>("/api/ruangan")
  const { data: karyawans }  = useApi<Karyawan[]>("/api/karyawan")
  const list = useMemo(() => data ?? [], [data])
  const canManageData = canCreateOrEditTransaksi(user?.role)
  const canDeleteData = canDeleteTransaksi(user?.role)

  const { create, update, remove, saving, deleting } = useCrud<Asset>({ apiPath: "/api/aset", onSuccess: refetch })

  /* ── State ──────────────────────────────────────────────────── */
  const [modalOpen, setModalOpen]   = useState(false)
  const [viewOpen, setViewOpen]     = useState(false)
  const [qrOpen, setQrOpen]         = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [editMode, setEditMode]     = useState(false)
  const [selected, setSelected]     = useState<Asset | null>(null)
  const [form, setForm]             = useState<Partial<Asset>>(EMPTY)
  const [errors, setErrors]         = useState<Record<string, string>>({})

  /* ── Upload gambar ──────────────────────────────────────────── */
  const [uploading, setUploading]     = useState(false)
  const [uploadErr, setUploadErr]     = useState<string | null>(null)
  const [localPreview, setLocalPreview] = useState<string | null>(null)
  /* ── Filters & pagination ───────────────────────────────────── */
  const [search, setSearch]       = useState("")
  const [kelompokFilter, setKelompokFilter] = useState<string>("")
  const [divisiFilter, setDivisiFilter] = useState<string>("")
  const [ruanganFilter, setRuanganFilter] = useState<string>("")
  const [page, setPage]           = useState(1)

  const divisiOptions = useMemo(() => {
    return Array.from(
      new Set(
        list
          .map((asset) => asset.divisi_pj?.trim())
          .filter((value): value is string => Boolean(value))
      )
    ).sort((a, b) => a.localeCompare(b, "id"))
  }, [list])

  const ruanganOptions = useMemo(() => {
    return Array.from(
      new Set(
        list
          .map((asset) => asset.nama_ruangan?.trim())
          .filter((value): value is string => Boolean(value))
      )
    ).sort((a, b) => a.localeCompare(b, "id"))
  }, [list])

  const lokasiOptions = useMemo(() => {
    return Array.from(
      new Set(
        list
          .map((asset) => asset.lokasi?.trim())
          .filter((value): value is string => Boolean(value))
      )
    ).sort((a, b) => a.localeCompare(b, "id"))
  }, [list])

  /* ── Multi-select untuk cetak barcode massal ────────────────── */
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [barcodeOpen, setBarcodeOpen] = useState(false)
  const [barcodeRuangan, setBarcodeRuangan] = useState("")
  const [barcodeKondisi, setBarcodeKondisi] = useState("")
  const [barcodeLokasi, setBarcodeLokasi] = useState("")
  const [barcodeDownloading, setBarcodeDownloading] = useState(false)

  const toggleSelect = (id: number) =>
    setSelectedIds(prev => {
      const s = new Set(prev)
      if (s.has(id)) {
        s.delete(id)
      } else {
        s.add(id)
      }
      return s
    })
  const toggleAll = () => {
    if (selectedIds.size === filtered.length) setSelectedIds(new Set())
    else setSelectedIds(new Set(filtered.map(a => a.id)))
  }

  /* ── Filter data ────────────────────────────────────────────── */
  const filtered = list.filter(a => {
    const matchSearch = !search || [a.kode_asset, a.nama_asset, a.pemakai ?? "", a.nama_pj ?? "", a.divisi_pj ?? "", a.nama_ruangan ?? ""]
      .some(v => v.toLowerCase().includes(search.toLowerCase()))
    const matchKelompok = !kelompokFilter || a.kelompok_asset === kelompokFilter
    const matchDivisi = !divisiFilter || (a.divisi_pj ?? "") === divisiFilter
    const matchRuangan = !ruanganFilter || (a.nama_ruangan ?? "") === ruanganFilter
    return matchSearch && matchKelompok && matchDivisi && matchRuangan
  })

  const barcodeSource = selectedIds.size > 0
    ? list.filter((asset) => selectedIds.has(asset.id))
    : filtered

  const barcodeFilteredAssets = barcodeSource.filter((asset) => {
    const matchRuangan = !barcodeRuangan || (asset.nama_ruangan ?? "") === barcodeRuangan
    const matchKondisi = !barcodeKondisi || asset.status_barang === barcodeKondisi
    const matchLokasi = !barcodeLokasi || (asset.lokasi ?? "") === barcodeLokasi
    return matchRuangan && matchKondisi && matchLokasi
  })

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE))
  const paginated  = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE)

  /* ── Form helpers ───────────────────────────────────────────── */
  const set = (k: keyof Asset, v: string) => setForm(f => ({ ...f, [k]: v || null }))

  const openAdd = () => {
    if (!canManageData) return
    setEditMode(false); setSelected(null); setForm(EMPTY); setErrors({}); setLocalPreview(null); setModalOpen(true)
  }
  const openEdit = (row: Asset) => {
    if (!canManageData) return
    setEditMode(true); setSelected(row); setForm(row); setErrors({}); setLocalPreview(null); setModalOpen(true)
  }

  const handleSubmit = async () => {
    if (!canManageData) return
    const e: Record<string, string> = {}
    if (!form.kode_asset)  e.kode_asset  = "Wajib diisi"
    if (!form.nama_asset)  e.nama_asset  = "Wajib diisi"
    if (!form.kelompok_asset) e.kelompok_asset = "Wajib dipilih"
    setErrors(e); if (Object.keys(e).length) return

    const payload: Partial<Asset> = {
      id: form.id,
      kode_asset: form.kode_asset,
      nama_asset: form.nama_asset,
      kelompok_asset: form.kelompok_asset,
      ruangan_id: form.ruangan_id,
      penanggung_jawab_id: form.penanggung_jawab_id,
      karyawan_id: form.karyawan_id,
      pemakai: form.pemakai,
      status_barang: form.status_barang,
      tgl_beli: form.tgl_beli,
      hrg_beli: form.hrg_beli,
      deskripsi: form.deskripsi,
      gambar: form.gambar,
      kode_nama: form.kode_nama,
    }
    const ok = editMode && selected ? await update(selected.id, payload) : await create(payload)
    if (ok) setModalOpen(false)
  }
  const handleDelete = async () => {
    if (!selected || !canDeleteData) return
    const ok = await remove(selected.id)
    if (ok) setDeleteOpen(false)
  }

  /* ── Upload gambar ke MinIO (aset yang sudah ada) ───────────── */
  const handleUploadGambar = async (file: File, assetId: number) => {
    // Tampilkan preview instan sebelum upload selesai
    const objectUrl = URL.createObjectURL(file)
    setLocalPreview(objectUrl)
    setUploading(true)
    setUploadErr(null)
    try {
      const fd = new FormData()
      fd.append("file", file)
      const res = await fetch(`/api/aset/${assetId}/gambar`, { method: "POST", body: fd })
      const json = await res.json()
      if (!res.ok) {
        setUploadErr(json.error ?? "Gagal upload")
        URL.revokeObjectURL(objectUrl)
        setLocalPreview(null)
        return
      }
      const newKey = json.asset?.gambar ?? null
      setForm(f => ({ ...f, gambar: newKey }))
      setSelected(s => s ? { ...s, gambar: newKey } : s)
      refetch()
    } catch {
      setUploadErr("Gagal upload gambar")
      URL.revokeObjectURL(objectUrl)
      setLocalPreview(null)
    } finally { setUploading(false) }
  }

  /* ── Hapus gambar ───────────────────────────────────────────── */
  const handleHapusGambar = async (assetId: number) => {
    if (localPreview) { URL.revokeObjectURL(localPreview); setLocalPreview(null) }
    setUploading(true)
    try {
      await fetch(`/api/aset/${assetId}/gambar`, { method: "DELETE" })
      setForm(f => ({ ...f, gambar: null }))
      setSelected(s => s ? { ...s, gambar: null } : s)
      refetch()
    } finally { setUploading(false) }
  }

  /* ── Cetak barcode massal ───────────────────────────────────── */
  const openBarcodeModal = () => {
    setBarcodeRuangan("")
    setBarcodeKondisi("")
    setBarcodeLokasi("")
    setBarcodeOpen(true)
  }

  const handleCetakBarcode = async (assetsToPrint: BarcodePrintAsset[]) => {
    const cetakData = assetsToPrint.map((a) => ({
      id: a.id,
      kode_asset: a.kode_asset,
      nama_asset: a.nama_asset,
      kelompok_asset: a.kelompok_asset,
      divisi_pj: a.divisi_pj,
      status_barang: a.status_barang,
      nama_ruangan: a.nama_ruangan ?? null,
      lokasi: a.lokasi ?? null,
    }))

    const meta: BarcodePrintMeta = {
      ruangan: barcodeRuangan || null,
      kondisi: barcodeKondisi || null,
      lokasi: barcodeLokasi || null,
      total: cetakData.length,
    }

    setBarcodeDownloading(true)
    try {
      const response = await fetch("/api/aset/barcode-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assets: cetakData, meta }),
      })

      if (!response.ok) {
        let message = "Gagal mengunduh PDF barcode"
        try {
          const json = await response.json() as { error?: string }
          message = json.error ?? message
        } catch {}
        throw new Error(message)
      }

      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = `Barcode_Aset_${new Date().toISOString().slice(0, 10)}.pdf`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
      setBarcodeOpen(false)
      setQrOpen(false)
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Gagal mengunduh PDF barcode")
    } finally {
      setBarcodeDownloading(false)
    }
  }

  /* ── Cetak Laporan ─────────────────────────────────────────── */
  const [laporanOpen, setLaporanOpen]           = useState(false)
  const [laporanLoading, setLaporanLoading]     = useState(false)
  const [laporanKelompok, setLaporanKelompok]   = useState("")
  const [laporanRuangan, setLaporanRuangan]     = useState("")
  const [laporanStatus, setLaporanStatus]       = useState("")
  const [laporanFormat, setLaporanFormat]       = useState<"pdf" | "excel">("pdf")

  const handleCetakLaporan = async () => {
    setLaporanLoading(true)
    try {
      const params: Record<string, string> = {}
      if (laporanKelompok) params.kelompok_asset = laporanKelompok
      if (laporanRuangan)  params.ruangan_id     = laporanRuangan
      if (laporanStatus)   params.status_barang  = laporanStatus

      if (laporanFormat === "pdf") {
        sessionStorage.setItem("cetak-laporan-aset-params", JSON.stringify(params))
        window.open("/cetak-laporan-aset", "_blank")
        setLaporanOpen(false)
      } else {
        // Excel export menggunakan xlsx
        const qs = new URLSearchParams(params)
        const res = await fetch(`/api/laporan/aset?${qs}`)
        const rows: AssetReportRow[] = await res.json()

        const { utils, writeFile } = await import("xlsx")
        const wb = utils.book_new()

        // Header rows
        const wsData: (string | number | null)[][] = [
          ["LAPORAN INVENTARIS ASET"],
          ["KOPERASI KONSUMEN PEDAMI"],
          [`Dicetak pada: ${new Date().toLocaleString("id-ID")}`],
          [],
          ["No", "Kode Aset", "Nama Aset", "Kelompok", "Tgl Beli", "Harga Beli", "Lokasi/Ruangan", "Penanggung Jawab", "Pemakai", "Kondisi"],
          ...rows.map((r, i: number) => [
            i + 1,
            r.kode_asset,
            r.nama_asset,
            r.kelompok_asset,
            r.tgl_beli ? new Date(r.tgl_beli).toLocaleDateString("id-ID") : "-",
            Number(r.hrg_beli) || 0,
            r.nama_ruangan ? `${r.nama_ruangan} - ${r.lokasi ?? ""}` : "-",
            r.nama_pj ?? "-",
            r.nama_pemakai ?? "-",
            r.status_barang,
          ]),
          ["", "", "", "", "Total Nilai Aset:", rows.reduce((s: number, r) => s + (Number(r.hrg_beli) || 0), 0)],
        ]

        const ws = utils.aoa_to_sheet(wsData)
        ws["!cols"] = [{ wch: 5 }, { wch: 10 }, { wch: 30 }, { wch: 12 }, { wch: 12 }, { wch: 16 }, { wch: 25 }, { wch: 20 }, { wch: 20 }, { wch: 12 }]
        utils.book_append_sheet(wb, ws, "Laporan Aset")
        writeFile(wb, `Laporan_Inventaris_Aset_${new Date().toISOString().slice(0, 10)}.xlsx`)
        setLaporanOpen(false)
      }
    } finally { setLaporanLoading(false) }
  }

  /* ── Stats ──────────────────────────────────────────────────── */
  const stats = [
    { label: "Total Aset",     value: list.length, color: "var(--primary)" },
    { label: "Kondisi Baik",   value: list.filter(a => a.status_barang === "Baik").length, color: "var(--success)" },
    { label: "Rusak Ringan",   value: list.filter(a => a.status_barang === "Rusak Ringan").length, color: "var(--warning)" },
    { label: "Disposal",       value: list.filter(a => a.status_barang === "Disposal").length, color: "var(--danger)" },
    { label: "Komputer",       value: list.filter(a => a.kelompok_asset === "komputer").length, color: "var(--info)" },
    { label: "Perabotan Kantor", value: list.filter(a => a.kelompok_asset === "kantor").length, color: "#7C3AED" },
  ]

  const origin = typeof window !== "undefined" ? window.location.origin : ""

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--text-900)" }}>Inventaris Aset</h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-subtle)" }}>Kelola inventaris aset kantor — Peralatan Komputer &amp; Perabotan Kantor</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={refetch}><RefreshCw className="h-3.5 w-3.5" /></Button>
          <Button variant="outline" size="sm" onClick={openBarcodeModal}>
            <Printer className="h-3.5 w-3.5 mr-1.5" />
            Unduh Barcode PDF {selectedIds.size > 0 ? `(${selectedIds.size})` : `(${filtered.length})`}
          </Button>
          <Button variant="outline" size="sm" style={{ color: "var(--info)", borderColor: "var(--info)" }}
            onClick={() => { setLaporanKelompok(""); setLaporanRuangan(""); setLaporanStatus(""); setLaporanFormat("pdf"); setLaporanOpen(true) }}>
            <FileText className="h-3.5 w-3.5 mr-1.5" />
            Cetak Laporan
          </Button>
          {canManageData && <Button size="sm" onClick={openAdd}><Plus className="h-3.5 w-3.5 mr-1.5" />Tambah Aset</Button>}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
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
          <Input placeholder="Cari kode, nama, pemakai, divisi, ruangan..." value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }} className="pl-9 h-8" />
        </div>
        <select
          value={kelompokFilter}
          onChange={e => { setKelompokFilter(e.target.value); setPage(1) }}
          className="h-8 rounded-lg px-3 text-sm cursor-pointer"
          style={{ border: "1px solid var(--border-strong)", background: "var(--surface)", color: "var(--text-900)" }}
        >
          <option value="">Semua Kelompok</option>
          <option value="komputer">Peralatan Komputer</option>
          <option value="kantor">Perabotan Kantor</option>
        </select>
        <select
          value={divisiFilter}
          onChange={e => { setDivisiFilter(e.target.value); setPage(1) }}
          className="h-8 rounded-lg px-3 text-sm cursor-pointer"
          style={{ border: "1px solid var(--border-strong)", background: "var(--surface)", color: "var(--text-900)" }}
        >
          <option value="">Semua Divisi</option>
          {divisiOptions.map((divisi) => (
            <option key={divisi} value={divisi}>{divisi}</option>
          ))}
        </select>
        <select
          value={ruanganFilter}
          onChange={e => { setRuanganFilter(e.target.value); setPage(1) }}
          className="h-8 rounded-lg px-3 text-sm cursor-pointer"
          style={{ border: "1px solid var(--border-strong)", background: "var(--surface)", color: "var(--text-900)" }}
        >
          <option value="">Semua Ruangan</option>
          {ruanganOptions.map((ruangan) => (
            <option key={ruangan} value={ruangan}>{ruangan}</option>
          ))}
        </select>
        {(search || kelompokFilter || divisiFilter || ruanganFilter) && (
          <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setKelompokFilter(""); setDivisiFilter(""); setRuanganFilter(""); setPage(1) }}>
            Reset Filter
          </Button>
        )}
        {selectedIds.size > 0 && (
          <span className="text-xs font-medium px-3 py-1 rounded-lg" style={{ background: "var(--primary-light)", color: "var(--primary)" }}>
            {selectedIds.size} aset dipilih untuk cetak
          </span>
        )}
      </div>

      {/* Table */}
      <div className="rounded-xl overflow-hidden overflow-x-auto" style={{ border: "1px solid var(--border)", background: "var(--surface)" }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: "var(--surface-muted)", borderBottom: "1px solid var(--border)" }}>
              {/* Checkbox kolom */}
              <th className="w-10 p-3 text-center">
                <input type="checkbox"
                  checked={selectedIds.size === filtered.length && filtered.length > 0}
                  onChange={toggleAll}
                  style={{ accentColor: "var(--primary)", cursor: "pointer" }}
                />
              </th>
              {["Kode Aset","Nama Aset","Kelompok","Ruangan","Lokasi","Penanggung Jawab","Divisi PJ","Pemakai","Kondisi","Tgl Beli","Harga Beli"].map(h => (
                <th key={h} className="px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-subtle)" }}>{h}</th>
              ))}
              <th className="px-3 py-3 text-center text-[11px] font-semibold uppercase tracking-wide w-36" style={{ color: "var(--text-subtle)" }}>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}><td colSpan={13} className="p-4">
                  <div className="h-4 rounded animate-pulse" style={{ background: "var(--primary-light)" }} />
                </td></tr>
              ))
            ) : paginated.length === 0 ? (
              <tr><td colSpan={13} className="py-16 text-center" style={{ color: "var(--text-subtle)" }}>
                Tidak ada data aset
              </td></tr>
            ) : (
              paginated.map(row => (
                <tr key={row.id}
                  className="transition-colors duration-150"
                  style={{
                    borderBottom: "1px solid var(--border)",
                    background: selectedIds.has(row.id) ? "var(--primary-light)" : "transparent",
                  }}
                  onMouseEnter={e => { if (!selectedIds.has(row.id)) (e.currentTarget as HTMLElement).style.background = "var(--surface-hover)" }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = selectedIds.has(row.id) ? "var(--primary-light)" : "transparent" }}
                >
                  <td className="px-3 py-3 text-center">
                    <input type="checkbox" checked={selectedIds.has(row.id)}
                      onChange={() => toggleSelect(row.id)}
                      style={{ accentColor: "var(--primary)", cursor: "pointer" }}
                    />
                  </td>
                  <td className="px-3 py-3">
                    <Badge variant="secondary" className="font-mono text-xs">{row.kode_asset}</Badge>
                  </td>
                  <td className="px-3 py-3">
                    <p className="font-semibold" style={{ color: "var(--text-900)" }}>{row.nama_asset}</p>
                    {row.deskripsi && <p className="text-xs truncate max-w-[180px]" style={{ color: "var(--text-subtle)" }}>{row.deskripsi}</p>}
                  </td>
                  <td className="px-3 py-3 text-xs">
                    {row.kelompok_asset === "komputer"
                      ? <Badge variant="default" className="text-[10px]">Komputer</Badge>
                      : <Badge variant="secondary" className="text-[10px]">Kantor</Badge>}
                  </td>
                  <td className="px-3 py-3 text-xs" style={{ color: "var(--text-muted)" }}>{row.nama_ruangan ?? "—"}</td>
                  <td className="px-3 py-3 text-xs" style={{ color: "var(--text-subtle)" }}>{row.lokasi ?? "—"}</td>
                  <td className="px-3 py-3 text-xs font-medium" style={{ color: "var(--text-900)" }}>{row.nama_pj ?? "—"}</td>
                  <td className="px-3 py-3 text-xs">
                    {row.divisi_pj ? <Badge variant="outline" className="text-[10px]">{row.divisi_pj}</Badge> : "—"}
                  </td>
                  <td className="px-3 py-3 text-xs" style={{ color: "var(--text-muted)" }}>{row.nama_pemakai ?? "—"}</td>
                  <td className="px-3 py-3"><KondisiBadge status={row.status_barang} /></td>
                  <td className="px-3 py-3 text-xs" style={{ color: "var(--text-subtle)" }}>{row.tgl_beli ? formatDate(row.tgl_beli) : "—"}</td>
                  <td className="px-3 py-3 text-xs font-mono">{row.hrg_beli ? formatCurrency(row.hrg_beli) : "—"}</td>
                  <td className="px-3 py-3">
                    <div className="flex items-center justify-center gap-1">
                      {/* QR Code per baris */}
                      <Button variant="ghost" size="icon" className="h-7 w-7" title="Barcode / QR Code"
                        style={{ color: "var(--primary)" }}
                        onClick={() => { setSelected(row); setQrOpen(true) }}>
                        <QrCode className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" title="Detail"
                        style={{ color: "var(--info)" }}
                        onClick={() => { setSelected(row); setViewOpen(true) }}>
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                      {canManageData && (
                        <Button variant="ghost" size="icon" className="h-7 w-7" title="Edit"
                          style={{ color: "var(--warning)" }}
                          onClick={() => openEdit(row)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {canDeleteData && (
                        <Button variant="ghost" size="icon" className="h-7 w-7" title="Hapus"
                          style={{ color: "var(--danger)" }}
                          onClick={() => { setSelected(row); setDeleteOpen(true) }}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
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
          <p className="text-xs" style={{ color: "var(--text-subtle)" }}>
            {(page-1)*PER_PAGE+1}–{Math.min(page*PER_PAGE, filtered.length)} dari {filtered.length} data
          </p>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setPage(1)} disabled={page===1}><ChevronsLeft className="h-3.5 w-3.5" /></Button>
            <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setPage(p=>p-1)} disabled={page===1}><ChevronLeft className="h-3.5 w-3.5" /></Button>
            <span className="px-3 text-xs" style={{ color: "var(--text-700)" }}>{page} / {totalPages}</span>
            <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setPage(p=>p+1)} disabled={page===totalPages}><ChevronRight className="h-3.5 w-3.5" /></Button>
            <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setPage(totalPages)} disabled={page===totalPages}><ChevronsRight className="h-3.5 w-3.5" /></Button>
          </div>
        </div>
      )}

      {/* ── QR Code Modal (sesuai barcode-modal.blade.php) ──────── */}
      <Modal open={qrOpen} onClose={() => setQrOpen(false)} title="Barcode Aset" size="sm">
        {selected && (
          <div>
            {/* Stiker design */}
            <div style={{ border: "2px solid #1e293b", borderRadius: 8, overflow: "hidden", maxWidth: 340, margin: "0 auto" }}>
              {/* Header */}
              <div style={{ background: "#1e293b", color: "#fff", textAlign: "center", padding: "8px 12px", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>
                Inventaris Koperasi Konsumen Pedami
              </div>
              {/* Body */}
              <div style={{ padding: "12px", display: "flex", gap: 12, alignItems: "center", background: "#fff" }}>
                <div className="flex-1 min-w-0">
                  <p style={{ fontWeight: 800, fontSize: 18, color: "#0f172a", fontFamily: "monospace", margin: 0 }}>{selected.kode_asset}</p>
                  <p style={{ fontSize: 12, color: "#475569", margin: "4px 0 0", fontWeight: 500, lineHeight: 1.3 }}>
                    {selected.nama_asset.length > 30 ? selected.nama_asset.slice(0,30)+"..." : selected.nama_asset}
                  </p>
                  <p style={{ fontSize: 10, color: "#64748b", marginTop: 6, background: "#f1f5f9", padding: "2px 8px", borderRadius: 4, display: "inline-block" }}>
                    {selected.divisi_pj ?? "Tanpa Divisi"}
                  </p>
                </div>
                <div style={{ flexShrink: 0 }}>
                  <div style={{ border: "1px solid #e2e8f0", padding: 4, borderRadius: 4, background: "#fff", display: "inline-block" }}>
                    <QRCodeSVG
                      value={`${origin}/info-asset/${selected.id}`}
                      size={80}
                      bgColor="#ffffff"
                      fgColor="#0f172a"
                      level="M"
                    />
                  </div>
                </div>
              </div>
              {/* Footer */}
              <div style={{ textAlign: "center", fontSize: 9, fontStyle: "italic", color: "#ef4444", padding: "6px 8px", borderTop: "1px dashed #cbd5e1", background: "#fff" }}>
                Dilarang mencabut/melepas stiker ini!
              </div>
            </div>

            {/* QR URL info */}
            <p className="text-center text-xs mt-3" style={{ color: "var(--text-subtle)" }}>
              QR mengarah ke: <code className="font-mono" style={{ color: "var(--primary)" }}>/info-asset/{selected.id}</code>
            </p>

            {/* Print single */}
            <div className="flex justify-center mt-4">
              <Button variant="outline" size="sm" onClick={() => {
                handleCetakBarcode([{
                  id: selected.id,
                  kode_asset: selected.kode_asset,
                  nama_asset: selected.nama_asset,
                  kelompok_asset: selected.kelompok_asset,
                  divisi_pj: selected.divisi_pj,
                  status_barang: selected.status_barang,
                  nama_ruangan: selected.nama_ruangan,
                  lokasi: selected.lokasi,
                }])
              }}>
                <Printer className="h-3.5 w-3.5 mr-1.5" /> Unduh PDF Stiker Ini
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={barcodeOpen}
        onClose={() => setBarcodeOpen(false)}
        size="md"
        title="Unduh Barcode Aset ke PDF"
        footer={
          <>
            <Button variant="outline" onClick={() => setBarcodeOpen(false)} disabled={barcodeDownloading}>Batal</Button>
            <Button
              onClick={() => handleCetakBarcode(barcodeFilteredAssets)}
              disabled={barcodeFilteredAssets.length === 0 || barcodeDownloading}
            >
              <Printer className="h-3.5 w-3.5 mr-1.5" />
              {barcodeDownloading ? "Mengunduh..." : "Unduh Barcode PDF"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-xs" style={{ color: "var(--text-subtle)" }}>
            Filter tambahan untuk unduh barcode. Sistem akan langsung membuat dan menyimpan file PDF.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Ruangan</label>
              <select
                value={barcodeRuangan}
                onChange={(e) => setBarcodeRuangan(e.target.value)}
                className="h-8 w-full rounded-lg px-3 text-sm"
                style={{ border: "1px solid var(--border-strong)", background: "var(--surface)", color: "var(--text-900)" }}
              >
                <option value="">Semua Ruangan</option>
                {ruanganOptions.map((ruangan) => (
                  <option key={ruangan} value={ruangan}>{ruangan}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Kondisi</label>
              <select
                value={barcodeKondisi}
                onChange={(e) => setBarcodeKondisi(e.target.value)}
                className="h-8 w-full rounded-lg px-3 text-sm"
                style={{ border: "1px solid var(--border-strong)", background: "var(--surface)", color: "var(--text-900)" }}
              >
                <option value="">Semua Kondisi</option>
                <option value="Baik">Baik</option>
                <option value="Rusak Ringan">Rusak Ringan</option>
                <option value="Disposal">Disposal</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Lokasi</label>
              <select
                value={barcodeLokasi}
                onChange={(e) => setBarcodeLokasi(e.target.value)}
                className="h-8 w-full rounded-lg px-3 text-sm"
                style={{ border: "1px solid var(--border-strong)", background: "var(--surface)", color: "var(--text-900)" }}
              >
                <option value="">Semua Lokasi</option>
                {lokasiOptions.map((lokasi) => (
                  <option key={lokasi} value={lokasi}>{lokasi}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="rounded-xl p-4" style={{ background: "var(--surface-muted)", border: "1px solid var(--border)" }}>
            <p className="text-sm font-semibold" style={{ color: "var(--text-900)" }}>
              {selectedIds.size > 0
                ? `${selectedIds.size} aset dipilih manual`
                : `${filtered.length} aset mengikuti filter tabel saat ini`}
            </p>
            <p className="text-xs mt-1" style={{ color: "var(--text-subtle)" }}>
              Hasil cetak setelah filter barcode: <span className="font-semibold">{barcodeFilteredAssets.length}</span> aset
            </p>
          </div>
        </div>
      </Modal>

      {/* ── Detail View Modal ────────────────────────────────────── */}
      <Modal open={viewOpen} onClose={() => setViewOpen(false)} title="Detail Aset" size="lg">
        {selected && (
          <div className="space-y-5">
            {/* Gambar aset */}
            {selected.gambar && (
              <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={gambarSrc(selected.id, selected.gambar) ?? ""}
                  alt={selected.nama_asset}
                  className="w-full max-h-72 object-contain"
                  style={{ background: "var(--surface-muted)" }}
                />
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              {[
                ["Kode Aset", selected.kode_asset],
                ["Nama Aset", selected.nama_asset],
                ["Kelompok", selected.kelompok_asset === "komputer" ? "Peralatan Komputer" : "Perabotan Kantor"],
                ["Kondisi", selected.status_barang],
                ["Ruangan", selected.nama_ruangan],
                ["Lokasi", selected.lokasi],
                ["Penanggung Jawab", selected.nama_pj],
                ["Divisi PJ", selected.divisi_pj],
                ["Pemakai", selected.nama_pemakai],
                ["Tanggal Beli", selected.tgl_beli ? formatDate(selected.tgl_beli) : null],
                ["Harga Beli", selected.hrg_beli ? formatCurrency(selected.hrg_beli) : null],
                ["Deskripsi", selected.deskripsi],
              ].map(([k, v]) => (
                <div key={String(k)}>
                  <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-subtle)" }}>{k}</p>
                  <p className="mt-0.5 font-medium" style={{ color: "var(--text-900)" }}>{v ?? "—"}</p>
                </div>
              ))}
            </div>

            {/* QR Code preview kecil di detail */}
            <div className="flex items-center gap-4 p-4 rounded-xl" style={{ background: "var(--primary-light)", border: "1px solid var(--primary-mid)" }}>
              <QRCodeSVG value={`${origin}/info-asset/${selected.id}`} size={60} level="M" />
              <div>
                <p className="text-xs font-semibold" style={{ color: "var(--primary)" }}>QR Code Aset</p>
                <p className="text-xs mt-0.5" style={{ color: "var(--text-subtle)" }}>Scan untuk melihat info aset</p>
                <Button variant="outline" size="sm" className="mt-2" onClick={() => { setViewOpen(false); setQrOpen(true) }}>
                  <QrCode className="h-3.5 w-3.5 mr-1.5" /> Lihat Barcode
                </Button>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Add / Edit Modal ──────────────────────────────────────── */}
      <Modal open={modalOpen} onClose={() => { setModalOpen(false); if (localPreview) { URL.revokeObjectURL(localPreview); setLocalPreview(null) } }} size="lg"
        title={editMode ? "Edit Aset" : "Tambah Aset Baru"}
        footer={<>
          <Button variant="outline" onClick={() => setModalOpen(false)}>Batal</Button>
          {canManageData && <Button onClick={handleSubmit} disabled={saving}>{saving ? "Menyimpan..." : "Simpan"}</Button>}
        </>}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <TextField label="Kode Aset" required error={errors.kode_asset}
            value={form.kode_asset ?? ""} onChange={e => set("kode_asset", e.target.value)} />
          <TextField label="Nama Aset" required error={errors.nama_asset}
            value={form.nama_asset ?? ""} onChange={e => set("nama_asset", e.target.value)} />
          <SelectField label="Kelompok Aset" required error={errors.kelompok_asset}
            value={form.kelompok_asset ?? ""} onChange={e => set("kelompok_asset", e.target.value)}
            options={[{ value: "komputer", label: "Peralatan Komputer" }, { value: "kantor", label: "Perabotan Kantor" }]} />
          <SelectField label="Kondisi" required
            value={form.status_barang ?? ""} onChange={e => set("status_barang", e.target.value)}
            options={[{ value: "Baik", label: "Baik" }, { value: "Rusak Ringan", label: "Rusak Ringan" }, { value: "Disposal", label: "Disposal" }]} />
          <SearchableSelect label="Ruangan / Lokasi"
            value={String(form.ruangan_id ?? "")}
            onChange={v => setForm(f => ({ ...f, ruangan_id: v ? Number(v) : null }))}
            placeholder="— Pilih Ruangan —"
            searchPlaceholder="Cari ruangan..."
            options={(ruangans ?? []).map(r => ({ value: String(r.id), label: r.ruangan, description: r.lokasi }))} />
          <SearchableSelect label="Penanggung Jawab"
            value={String(form.penanggung_jawab_id ?? "")}
            onChange={v => setForm(f => ({ ...f, penanggung_jawab_id: Number(v) }))}
            placeholder="— Pilih PJ —"
            searchPlaceholder="Cari nama karyawan..."
            options={(karyawans ?? []).map(k => ({ value: String(k.id), label: k.nama_karyawan }))} />
          <SearchableSelect label="Pemakai"
            value={String(form.karyawan_id ?? "")}
            onChange={v => setForm(f => ({ ...f, karyawan_id: Number(v) }))}
            placeholder="— Pilih Pemakai —"
            searchPlaceholder="Cari nama karyawan..."
            options={(karyawans ?? []).map(k => ({ value: String(k.id), label: k.nama_karyawan }))} />
          <TextField label="Tanggal Beli" type="date"
            value={form.tgl_beli?.split("T")[0] ?? ""}
            onChange={e => set("tgl_beli", e.target.value)} />
          <TextField label="Harga Beli (Rp)" type="number"
            value={String(form.hrg_beli ?? "")}
            onChange={e => setForm(f => ({ ...f, hrg_beli: e.target.value ? Number(e.target.value) : null }))} />
          <TextareaField label="Deskripsi"
            value={form.deskripsi ?? ""}
            onChange={e => set("deskripsi", e.target.value)}
            className="md:col-span-2" />

          {/* Gambar Aset */}
          <div className="md:col-span-2 space-y-2">
            <label className="block text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
              Gambar Aset
            </label>

            {/* Preview gambar yang sudah ada */}
            {(localPreview ?? (form.gambar && selected ? gambarSrc(selected.id, form.gambar ?? null) : null)) && (
              <div className="relative inline-block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={localPreview ?? (selected ? gambarSrc(selected.id, form.gambar ?? null) ?? "" : "")}
                  alt="Gambar aset"
                  className="h-32 w-48 rounded-xl object-cover"
                  style={{ border: "1px solid var(--border)" }}
                />
                {/* Tombol hapus */}
                {editMode && selected && canManageData && (
                  <button
                    type="button"
                    disabled={uploading}
                    onClick={() => handleHapusGambar(selected.id)}
                    className="absolute -top-2 -right-2 h-6 w-6 rounded-full flex items-center justify-center text-white transition-opacity hover:opacity-80"
                    style={{ background: "var(--danger)" }}
                    title="Hapus gambar"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            )}

            {/* Upload area */}
            {editMode && selected && canManageData ? (
              /* Edit mode: langsung upload ke API */
              <label
                className="flex items-center gap-2 w-fit rounded-lg px-4 py-2 text-sm font-medium cursor-pointer transition-colors"
                style={{
                  border: "1px dashed var(--border-strong)",
                  background: "var(--surface-muted)",
                  color: "var(--text-700)",
                  opacity: uploading ? 0.6 : 1,
                  pointerEvents: uploading ? "none" : "auto",
                }}
              >
                <ImagePlus className="h-4 w-4" />
                {uploading ? "Mengupload..." : form.gambar ? "Ganti Gambar" : "Upload Gambar"}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  disabled={uploading}
                  onChange={e => {
                    const file = e.target.files?.[0]
                    if (file) handleUploadGambar(file, selected.id)
                    e.target.value = ""
                  }}
                />
              </label>
            ) : !editMode ? (
              /* Tambah baru: gambar bisa diupload setelah disimpan */
              <p className="text-xs" style={{ color: "var(--text-subtle)" }}>
                Gambar dapat ditambahkan setelah aset disimpan (klik Edit).
              </p>
            ) : null}

            {uploadErr && (
              <p className="text-xs" style={{ color: "var(--danger)" }}>{uploadErr}</p>
            )}
            <p className="text-xs" style={{ color: "var(--text-subtle)" }}>
              Format JPG, PNG, atau WEBP. Maks 5 MB.
            </p>
          </div>
        </div>
      </Modal>

      <ConfirmDelete
        open={deleteOpen} onClose={() => setDeleteOpen(false)}
        onConfirm={handleDelete} loading={deleting}
        description={`Hapus aset "${selected?.nama_asset}" (${selected?.kode_asset})?`}
      />

      {/* ── Modal Cetak Laporan ───────────────────────────────── */}
      <Modal
        open={laporanOpen}
        onClose={() => setLaporanOpen(false)}
        size="md"
        title="Cetak Laporan Inventaris Aset"
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

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Kelompok Aset */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Kelompok Aset</label>
              <select value={laporanKelompok} onChange={e => setLaporanKelompok(e.target.value)}
                className="h-8 w-full rounded-lg px-3 text-sm"
                style={{ border: "1px solid var(--border-strong)", background: "var(--surface)", color: "var(--text-900)" }}>
                <option value="">Semua Kelompok</option>
                <option value="komputer">Peralatan Komputer</option>
                <option value="kantor">Perabotan Kantor</option>
              </select>
            </div>

            {/* Ruangan */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Ruangan</label>
              <select value={laporanRuangan} onChange={e => setLaporanRuangan(e.target.value)}
                className="h-8 w-full rounded-lg px-3 text-sm"
                style={{ border: "1px solid var(--border-strong)", background: "var(--surface)", color: "var(--text-900)" }}>
                <option value="">Semua Ruangan</option>
                {(ruangans ?? []).map(r => (
                  <option key={r.id} value={String(r.id)}>{r.ruangan} — {r.lokasi}</option>
                ))}
              </select>
            </div>

            {/* Status Barang */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Status Barang</label>
              <select value={laporanStatus} onChange={e => setLaporanStatus(e.target.value)}
                className="h-8 w-full rounded-lg px-3 text-sm"
                style={{ border: "1px solid var(--border-strong)", background: "var(--surface)", color: "var(--text-900)" }}>
                <option value="">Semua Status</option>
                <option value="Baik">Baik</option>
                <option value="Rusak Ringan">Rusak Ringan</option>
                <option value="Disposal">Disposal</option>
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
      </Modal>
    </div>
  )
}

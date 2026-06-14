"use client"
import React, { useState, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { TextareaField } from "@/components/ui/form-field"
import { Modal } from "@/components/ui/modal"
import { useApi } from "@/hooks/useApi"
import {
  Users, CheckCircle, RefreshCw, Save, Send, ArrowLeft,
  TrendingUp, Eye, Clock, FileDown,
} from "lucide-react"

/* ─── Types ─────────────────────────────────────────────────────── */
type Aspek = "integritas" | "kerjasama" | "inisiatif" | "orientasi_layanan" | "kedisiplinan"

type DaftarItem = {
  penilaian_id: number | null
  id_pegawai: number
  nik: string
  nama_karyawan: string
  jabatan: string
  nama_divisi: string | null
  status: string | null
  nilai_kehadiran: number | null
  nilai_capaian_sasaran: number | null
  nilai_perilaku: number | null
  nilai_pengembangan: number | null
  nilai_akhir: number | null
  tanggal_diajukan: string | null
  id_penilai_atasan: number | null   // null = atasan belum isi form penilaian
}

type DaftarResponse = {
  periode: { id: number; nama_periode: string; tanggal_tutup: string }
  list: DaftarItem[]
}

type TargetItem = {
  id: number
  uraian_tugas: string
  satuan: string
  target_nilai: number
  realisasi_nilai: number | null
  bobot_dalam_capaian: number
  catatan: string | null
  catatan_pegawai: string | null
  catatan_atasan: string | null
}

type PerilakuItem = {
  aspek: Aspek
  nilai: number
  sumber: "mandiri" | "atasan"
  catatan: string | null
}

type DetailData = {
  penilaian: {
    id: number
    status: string
    id_penilai_atasan: number | null
    nilai_kehadiran: number | null
    nilai_pengembangan: number | null
    catatan_atasan: string | null
  }
  identitas: { nik: string; nama_karyawan: string; jabatan: string; nama_divisi: string | null; nama_atasan: string | null } | null
  periode: { id: number; nama_periode: string } | null
  targets: TargetItem[]
  perilaku: PerilakuItem[]
  pengembanganPegawai: { pelatihan: string[]; rencana_pengembangan: string; pencapaian_terbaik: string; saran_pimpinan?: string | null }
}

type VerifikasiTargetInput = { id: number; realisasi_nilai_atasan: number | null; catatan_verifikasi: string }
type PerilakuAtasanInput   = { aspek: Aspek; nilai: number; catatan: string }

/* ─── Constants ──────────────────────────────────────────────────── */
const ASPEK_LIST: Aspek[] = ["integritas", "kerjasama", "inisiatif", "orientasi_layanan", "kedisiplinan"]
const ASPEK_LABELS: Record<Aspek, string> = {
  integritas: "Integritas",
  kerjasama: "Kerjasama",
  inisiatif: "Inisiatif & Kreativitas",
  orientasi_layanan: "Orientasi Layanan",
  kedisiplinan: "Kedisiplinan",
}
const SCORE_HINTS = [
  "1 = Sangat kurang",
  "2 = Kurang",
  "3 = Cukup / memenuhi standar",
  "4 = Baik / konsisten",
  "5 = Sangat baik / menjadi teladan",
]

const STATUS_BADGE: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" | "success" | "warning" }> = {
  draft:         { label: "Belum diisi", variant: "outline" },
  diajukan:      { label: "Menunggu Atasan", variant: "warning" },
  diverifikasi:  { label: "Selesai Dinilai", variant: "success" },
  disetujui:     { label: "Disetujui", variant: "success" },
  final:         { label: "Final", variant: "default" },
}

function capaianPct(realisasi: number, target: number): number {
  if (!target) return 0
  return Math.min(120, Math.max(0, (realisasi / target) * 100))
}

/* ─── Main Page ──────────────────────────────────────────────────── */
export default function PenilaianAtasanPage() {
  const { data: daftar, loading: loadingDaftar, refetch: refetchDaftar } =
    useApi<DaftarResponse>("/api/penilaian-atasan")

  const [selectedId, setSelectedId]     = useState<number | null>(null)
  const [detail, setDetail]             = useState<DetailData | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [targets, setTargets]           = useState<VerifikasiTargetInput[]>([])
  const [perilaku, setPerilaku]         = useState<PerilakuAtasanInput[]>([])
  const [nilaiPengembangan, setNilaiPengembangan] = useState(70)
  const [catatanAtasan, setCatatanAtasan] = useState("")
  const [errors, setErrors]             = useState<Record<string, string>>({})
  const [saving, setSaving]             = useState(false)
  const [message, setMessage]           = useState("")
  const [compareOpen, setCompareOpen]   = useState(false)

  const readonly = detail ? detail.penilaian.status !== "diajukan" || detail.penilaian.id_penilai_atasan != null : true

  const fetchDetail = useCallback(async (id: number) => {
    setLoadingDetail(true)
    setMessage("")
    setErrors({})
    try {
      const res = await fetch(`/api/penilaian/${id}/nilai-atasan`)
      if (!res.ok) { const j = await res.json(); setErrors({ _: j.error ?? "Gagal" }); return }
      const data: DetailData = await res.json()
      setDetail(data)
      setTargets(data.targets.map(t => ({
        id: t.id,
        realisasi_nilai_atasan: null, // null = terima nilai pegawai
        catatan_verifikasi: t.catatan_atasan ?? "",
      })))
      const existingAtasan = new Map(data.perilaku.filter(p => p.sumber === "atasan").map(p => [p.aspek, p]))
      setPerilaku(ASPEK_LIST.map(aspek => ({
        aspek,
        nilai: existingAtasan.get(aspek)?.nilai ?? 3,
        catatan: existingAtasan.get(aspek)?.catatan ?? "",
      })))
      setNilaiPengembangan(data.penilaian.nilai_pengembangan != null ? Number(data.penilaian.nilai_pengembangan) : 70)
      setCatatanAtasan(data.penilaian.catatan_atasan ?? "")
    } finally {
      setLoadingDetail(false)
    }
  }, [])

  const openDetail = async (id: number) => {
    setSelectedId(id)
    await fetchDetail(id)
  }

  const validate = (): boolean => {
    const e: Record<string, string> = {}
    if (!catatanAtasan.trim()) e.catatan = "Catatan atasan wajib diisi sebelum menyelesaikan"
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const save = async (isSubmit: boolean) => {
    if (isSubmit && !validate()) return
    if (!selectedId || !detail) return
    setSaving(true)
    setMessage("")
    try {
      const res = await fetch(`/api/penilaian/${selectedId}/nilai-atasan`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targets,
          perilaku,
          nilai_pengembangan: nilaiPengembangan,
          catatan_atasan: catatanAtasan,
          submit: isSubmit,
        }),
      })
      const json = await res.json()
      if (!res.ok) { setErrors({ _: json.error ?? "Gagal menyimpan" }); return }
      setMessage(json.message ?? "Berhasil")
      await fetchDetail(selectedId)
      refetchDaftar()
    } finally {
      setSaving(false)
    }
  }

  /* ─── Daftar View ──────────────────────────────────────────────── */
  const [filterStatus, setFilterStatus] = useState<"semua" | "belum_mengisi" | "diajukan" | "sudah_dinilai">("semua")
  const [searchNama, setSearchNama]     = useState("")
  const [daftarPage, setDaftarPage]     = useState(1)
  const DAFTAR_PER_PAGE = 15

  if (!selectedId) {
    const list = daftar?.list ?? []
    const sudahDinilai = list.filter(r => r.status === "diverifikasi" || r.status === "disetujui" || r.status === "final").length
    const menunggu     = list.filter(r => r.status === "diajukan").length
    const belumMengisi = list.filter(r => !r.status || r.status === "draft").length

    const filtered = list.filter(row => {
      const matchStatus =
        filterStatus === "semua" ? true :
        filterStatus === "belum_mengisi" ? (!row.status || row.status === "draft") :
        filterStatus === "diajukan"      ? row.status === "diajukan" :
        filterStatus === "sudah_dinilai" ? (row.status === "diverifikasi" || row.status === "disetujui" || row.status === "final") :
        true
      const matchNama = !searchNama || row.nama_karyawan.toLowerCase().includes(searchNama.toLowerCase()) || row.nik.includes(searchNama)
      return matchStatus && matchNama
    })

    const totalPages = Math.max(1, Math.ceil(filtered.length / DAFTAR_PER_PAGE))
    const paginated  = filtered.slice((daftarPage - 1) * DAFTAR_PER_PAGE, daftarPage * DAFTAR_PER_PAGE)

    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-xl font-bold" style={{ color: "var(--text-900)" }}>Penilaian Kinerja — Atasan</h1>
            <p className="text-xs mt-0.5" style={{ color: "var(--text-subtle)" }}>
              {daftar?.periode.nama_periode ?? "Periode penilaian aktif"}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={refetchDaftar}>
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Statistik — juga berfungsi sebagai tombol filter */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {([
            { key: "semua",         label: "Semua",            value: list.length,   icon: <Users className="h-4 w-4" />,       color: "var(--primary)" },
            { key: "belum_mengisi", label: "Belum Mengisi",    value: belumMengisi,  icon: <Clock className="h-4 w-4" />,       color: "var(--text-subtle)" },
            { key: "diajukan",      label: "Menunggu Dinilai", value: menunggu,      icon: <Clock className="h-4 w-4" />,       color: "var(--warning, #d97706)" },
            { key: "sudah_dinilai", label: "Sudah Dinilai",    value: sudahDinilai,  icon: <CheckCircle className="h-4 w-4" />, color: "var(--success, #16a34a)" },
          ] as const).map(item => (
            <button key={item.key} onClick={() => { setFilterStatus(item.key); setDaftarPage(1) }}
              className="rounded-xl p-4 text-left transition-all"
              style={{
                background: filterStatus === item.key ? "var(--primary-light)" : "var(--surface)",
                border: filterStatus === item.key ? "2px solid var(--primary)" : "1px solid var(--border)",
              }}>
              <div className="flex items-center gap-2 mb-1" style={{ color: item.color }}>{item.icon}<span className="text-xs font-semibold">{item.label}</span></div>
              <p className="text-2xl font-bold" style={{ color: "var(--text-900)" }}>{item.value}</p>
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="flex gap-2">
          <input value={searchNama} onChange={e => { setSearchNama(e.target.value); setDaftarPage(1) }}
            placeholder="Cari nama atau NIK..."
            className="h-9 rounded-lg px-3 text-sm flex-1 max-w-xs"
            style={{ border: "1px solid var(--border-strong)", background: "var(--surface)", color: "var(--text-900)" }} />
          {(searchNama || filterStatus !== "semua") && (
            <Button variant="outline" size="sm" onClick={() => { setSearchNama(""); setFilterStatus("semua"); setDaftarPage(1) }}>Reset</Button>
          )}
          <span className="text-xs self-center" style={{ color: "var(--text-subtle)" }}>
            {filtered.length} pegawai
          </span>
        </div>

        {/* Tabel daftar */}
        <div className="rounded-xl overflow-hidden overflow-x-auto" style={{ border: "1px solid var(--border)", background: "var(--surface)" }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: "var(--surface-muted)", borderBottom: "1px solid var(--border)" }}>
                {["#", "Pegawai", "Jabatan / Divisi", "Status", "Nilai Akhir", "Diajukan", ""].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-subtle)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loadingDaftar && <tr><td colSpan={7} className="px-4 py-8 text-center text-sm" style={{ color: "var(--text-subtle)" }}>Memuat...</td></tr>}
              {!loadingDaftar && paginated.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-sm" style={{ color: "var(--text-subtle)" }}>Tidak ada data</td></tr>}
              {paginated.map((row, i) => {
                const st = STATUS_BADGE[row.status ?? "draft"] ?? { label: row.status ?? "Belum Mengisi", variant: "outline" as const }
                return (
                  <tr key={row.id_pegawai} style={{ borderBottom: "1px solid var(--border)" }}
                    onMouseEnter={e => (e.currentTarget.style.background = "var(--surface-muted)")}
                    onMouseLeave={e => (e.currentTarget.style.background = "")}>
                    <td className="px-4 py-3 text-xs" style={{ color: "var(--text-subtle)" }}>
                      {(daftarPage - 1) * DAFTAR_PER_PAGE + i + 1}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-sm" style={{ color: "var(--text-900)" }}>{row.nama_karyawan}</p>
                      <p className="text-xs" style={{ color: "var(--text-subtle)" }}>{row.nik}</p>
                    </td>
                    <td className="px-4 py-3 text-xs" style={{ color: "var(--text-700)" }}>
                      {row.jabatan}<br /><span style={{ color: "var(--text-subtle)" }}>{row.nama_divisi ?? "—"}</span>
                    </td>
                    <td className="px-4 py-3"><Badge variant={st.variant}>{st.label}</Badge></td>
                    <td className="px-4 py-3 text-sm font-mono font-bold" style={{ color: "var(--primary)" }}>
                      {row.nilai_akhir != null ? Number(row.nilai_akhir).toFixed(2) : "—"}
                    </td>
                    <td className="px-4 py-3 text-xs" style={{ color: "var(--text-subtle)" }}>
                      {row.tanggal_diajukan ? new Date(row.tanggal_diajukan).toLocaleDateString("id-ID") : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {row.penilaian_id && row.status === "diajukan" && !row.id_penilai_atasan ? (
                        // Status diajukan: perlu isi penilaian atasan dulu
                        <div className="space-y-1">
                          <Button size="sm" variant="default"
                            onClick={() => openDetail(row.penilaian_id!)}>
                            <Send className="h-3.5 w-3.5" />Isi Penilaian
                          </Button>
                        </div>
                      ) : row.penilaian_id ? (
                        <Button size="sm" variant="outline"
                          onClick={() => openDetail(row.penilaian_id!)}>
                          <Eye className="h-3.5 w-3.5" />{row.status === "diajukan" && row.id_penilai_atasan ? "Siap Diverifikasi" : "Lihat"}
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2">
            <Button variant="outline" size="sm" disabled={daftarPage <= 1} onClick={() => setDaftarPage(p => p - 1)}>‹</Button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const start = Math.max(1, Math.min(daftarPage - 2, totalPages - 4))
              const p = start + i
              return (
                <Button key={p} variant={p === daftarPage ? "default" : "outline"} size="sm" onClick={() => setDaftarPage(p)} className="w-9">{p}</Button>
              )
            })}
            <Button variant="outline" size="sm" disabled={daftarPage >= totalPages} onClick={() => setDaftarPage(p => p + 1)}>›</Button>
          </div>
        )}
      </div>
    )
  }

  /* ─── Detail/Form View ─────────────────────────────────────────── */
  if (loadingDetail) return <div className="p-6 text-sm" style={{ color: "var(--text-subtle)" }}>Memuat data penilaian...</div>
  if (!detail) return (
    <div className="p-6 space-y-3">
      {errors._ && <div className="rounded-lg px-4 py-3 text-sm" style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>{errors._}</div>}
      <Button variant="outline" onClick={() => setSelectedId(null)}><ArrowLeft className="h-3.5 w-3.5" />Kembali</Button>
    </div>
  )

  const { identitas, periode, penilaian } = detail
  const perilakuMandiri = detail.perilaku.filter(p => p.sumber === "mandiri")

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => { setSelectedId(null); setDetail(null) }}>
            <ArrowLeft className="h-3.5 w-3.5" />
          </Button>
          <div>
            <h1 className="text-xl font-bold" style={{ color: "var(--text-900)" }}>
              Penilaian: {identitas?.nama_karyawan}
            </h1>
            <p className="text-xs mt-0.5" style={{ color: "var(--text-subtle)" }}>{periode?.nama_periode}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Badge variant={STATUS_BADGE[penilaian.status]?.variant ?? "outline"}>
            {STATUS_BADGE[penilaian.status]?.label ?? penilaian.status}
          </Badge>
          <a href={`/api/penilaian/${selectedId}/pdf`} target="_blank" rel="noopener noreferrer">
            <Button variant="outline" size="sm"><FileDown className="h-3.5 w-3.5" />PDF</Button>
          </a>
          <Button variant="outline" size="sm" onClick={() => fetchDetail(selectedId!)}>
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {errors._ && <div className="rounded-lg px-4 py-3 text-sm" style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>{errors._}</div>}
      {message && <div className="rounded-lg px-4 py-3 text-sm" style={{ background: "var(--success-bg)", color: "var(--success)" }}>{message}</div>}

      {/* Bagian 1 — Identitas */}
      <section className="rounded-xl p-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <h2 className="font-bold mb-3" style={{ color: "var(--text-900)" }}>Bagian 1 — Identitas Pegawai</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
          {[["Nama", identitas?.nama_karyawan], ["NIP/NIK", identitas?.nik], ["Jabatan", identitas?.jabatan], ["Divisi", identitas?.nama_divisi ?? "—"], ["Atasan", identitas?.nama_atasan ?? "—"], ["Status", penilaian.status]].map(([label, value]) => (
            <div key={label} className="rounded-lg p-3" style={{ background: "var(--surface-muted)" }}>
              <p className="text-xs" style={{ color: "var(--text-subtle)" }}>{label}</p>
              <p className="font-semibold" style={{ color: "var(--text-900)" }}>{value}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Bagian 2 — Ringkasan Kehadiran */}
      <section className="rounded-xl p-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <h2 className="font-bold mb-3" style={{ color: "var(--text-900)" }}>Bagian 2 — Nilai Kehadiran (Read-Only)</h2>
        <div className="rounded-lg p-3 text-xs" style={{ background: "var(--surface-muted)", color: "var(--text-subtle)" }}>
          Nilai kehadiran dihitung otomatis dari data absensi dan tidak dapat diubah.
        </div>
        <p className="mt-3 text-2xl font-bold font-mono" style={{ color: "var(--primary)" }}>
          {penilaian.nilai_kehadiran != null ? `${Number(penilaian.nilai_kehadiran).toFixed(2)} / 100` : "Belum dihitung"}
        </p>
      </section>

      {/* Bagian 3 — Verifikasi Capaian Sasaran */}
      <section className="rounded-xl p-4 space-y-3" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-bold" style={{ color: "var(--text-900)" }}>Bagian 3 — Verifikasi Capaian Sasaran Kerja</h2>
          <span className="text-xs" style={{ color: "var(--text-subtle)" }}>Kosongkan kolom Override untuk menerima nilai pegawai</span>
        </div>
        {detail.targets.length === 0
          ? <p className="text-sm" style={{ color: "var(--danger)" }}>Target kerja belum tersedia.</p>
          : detail.targets.map(t => {
            const inp = targets.find(i => i.id === t.id)
            const nilaiEfektif = inp?.realisasi_nilai_atasan != null ? inp.realisasi_nilai_atasan : Number(t.realisasi_nilai ?? 0)
            const capaian = capaianPct(nilaiEfektif, Number(t.target_nilai))
            return (
              <div key={t.id} className="rounded-xl p-3 space-y-2" style={{ background: "var(--surface-muted)", border: "1px solid var(--border)" }}>
                <div className="grid grid-cols-1 lg:grid-cols-[1fr_100px_100px_120px_120px] gap-2 text-sm">
                  <div><p className="text-xs" style={{ color: "var(--text-subtle)" }}>Uraian</p><p className="font-semibold" style={{ color: "var(--text-900)" }}>{t.uraian_tugas}</p></div>
                  <div><p className="text-xs" style={{ color: "var(--text-subtle)" }}>Target</p><p className="font-mono">{t.target_nilai}</p></div>
                   <div><p className="text-xs" style={{ color: "var(--text-subtle)" }}>Realisasi Pegawai</p><p className="font-mono font-semibold" style={{ color: "var(--primary)" }}>{t.realisasi_nilai ?? "—"}</p></div>
                  <div>
                    <p className="text-xs mb-1" style={{ color: "var(--text-subtle)" }}>Override Atasan</p>
                    <input disabled={readonly} type="number" placeholder="Kosongkan = terima" value={inp?.realisasi_nilai_atasan ?? ""}
                      onChange={e => setTargets(prev => prev.map(r => r.id === t.id ? { ...r, realisasi_nilai_atasan: e.target.value === "" ? null : Number(e.target.value) } : r))}
                      className="h-8 w-full rounded-lg px-2 text-sm" style={{ border: "1px solid var(--border-strong)", background: "var(--surface)", color: "var(--text-900)" }} />
                  </div>
                  <div><p className="text-xs" style={{ color: "var(--text-subtle)" }}>Capaian</p><p className={`font-mono font-bold ${capaian < 80 ? "text-red-500" : ""}`} style={capaian >= 80 ? { color: "var(--success, #16a34a)" } : undefined}>{capaian.toFixed(1)}%</p></div>
                </div>
                {t.catatan_pegawai && (
                  <div className="rounded-lg px-3 py-2 text-xs" style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-700)" }}>
                    <span className="font-semibold">Kendala pegawai:</span> {t.catatan_pegawai}
                  </div>
                )}
                <input disabled={readonly} type="text" placeholder="Catatan verifikasi atasan (opsional)"
                  value={inp?.catatan_verifikasi ?? ""}
                  onChange={e => setTargets(prev => prev.map(r => r.id === t.id ? { ...r, catatan_verifikasi: e.target.value } : r))}
                  className="h-8 w-full rounded-lg px-3 text-xs" style={{ border: "1px solid var(--border-strong)", background: "var(--surface)", color: "var(--text-700)" }} />
              </div>
            )
          })
        }
      </section>

      {/* Bagian 4 — Penilaian Perilaku */}
      <section className="rounded-xl p-4 space-y-3" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h2 className="font-bold" style={{ color: "var(--text-900)" }}>Bagian 4 — Penilaian Perilaku Kerja</h2>
          <Button variant="outline" size="sm" onClick={() => setCompareOpen(true)}>
            <TrendingUp className="h-3.5 w-3.5" />Bandingkan dengan Mandiri
          </Button>
        </div>
        <div className="rounded-lg p-3 text-xs" style={{ background: "var(--surface-muted)", color: "var(--text-subtle)" }}>
          Bobot penilaian perilaku: Mandiri 30% + Atasan 70%. | {SCORE_HINTS.join(" | ")}
        </div>
        {ASPEK_LIST.map(aspek => {
          const atasanItem = perilaku.find(i => i.aspek === aspek)
          const mandiriItem = perilakuMandiri.find(i => i.aspek === aspek)
          return (
            <div key={aspek} className="rounded-lg p-3" style={{ background: "var(--surface-muted)", border: "1px solid var(--border)" }}>
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <p className="font-semibold text-sm" style={{ color: "var(--text-900)" }}>{ASPEK_LABELS[aspek]}</p>
                  <p className="text-xs" style={{ color: "var(--text-subtle)" }}>Nilai mandiri pegawai: <strong>{mandiriItem?.nilai ?? "—"}</strong></p>
                </div>
                <div className="flex gap-2">
                  {[1,2,3,4,5].map(score => (
                    <button disabled={readonly} key={score} title={SCORE_HINTS[score - 1]}
                      onClick={() => setPerilaku(p => p.map(r => r.aspek === aspek ? { ...r, nilai: score } : r))}
                      className="h-8 w-8 rounded-full text-sm font-bold transition-colors"
                      style={{ background: atasanItem?.nilai === score ? "var(--primary)" : "var(--surface)", color: atasanItem?.nilai === score ? "#fff" : "var(--text-900)", border: "1px solid var(--border)" }}>
                      {score}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )
        })}
      </section>

      {/* Bagian 5 — Penilaian Pengembangan */}
      <section className="rounded-xl p-4 space-y-3" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <h2 className="font-bold" style={{ color: "var(--text-900)" }}>Bagian 5 — Verifikasi Pengembangan Kompetensi</h2>

        {detail.pengembanganPegawai.pelatihan.filter(Boolean).length > 0 && (
          <div>
            <p className="text-xs font-semibold mb-1" style={{ color: "var(--text-subtle)" }}>Pelatihan yang diklaim pegawai</p>
            <ul className="text-sm space-y-1">
              {detail.pengembanganPegawai.pelatihan.filter(Boolean).map((p, i) => (
                <li key={i} className="flex items-center gap-2">
                  <CheckCircle className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--success, #16a34a)" }} />{p}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div>
          <label className="block text-xs font-semibold mb-1 uppercase tracking-wide" style={{ color: "var(--text-subtle)" }}>
            Nilai Pengembangan (0 – 100)
          </label>
          <div className="flex items-center gap-3">
            <input disabled={readonly} type="range" min={0} max={100} value={nilaiPengembangan}
              onChange={e => setNilaiPengembangan(Number(e.target.value))} className="flex-1 h-2 rounded" />
            <span className="text-lg font-bold font-mono w-12 text-center" style={{ color: "var(--primary)" }}>{nilaiPengembangan}</span>
          </div>
        </div>

        <TextareaField label="Catatan Atasan & Rekomendasi Pengembangan" required={true}
          error={errors.catatan} disabled={readonly}
          value={catatanAtasan} onChange={e => setCatatanAtasan(e.target.value)} />
      </section>

      {/* Sticky footer */}
      <div className="sticky bottom-0 rounded-xl p-3 flex justify-end gap-2" style={{ background: "var(--surface)", border: "1px solid var(--border)", boxShadow: "0 -8px 30px rgba(15,23,42,0.08)" }}>
        {!readonly ? (
          <>
            <Button variant="outline" onClick={() => save(false)} disabled={saving}>
              <Save className="h-3.5 w-3.5" />{saving ? "Menyimpan..." : "Simpan Draft"}
            </Button>
            <Button onClick={() => save(true)} disabled={saving}>
              <Send className="h-3.5 w-3.5" />Selesaikan Penilaian
            </Button>
          </>
        ) : (
          <Badge variant="success"><CheckCircle className="h-3 w-3 mr-1" />Penilaian sudah diselesaikan</Badge>
        )}
      </div>

      {/* Modal Perbandingan Nilai Perilaku */}
      <Modal open={compareOpen} onClose={() => setCompareOpen(false)} title="Perbandingan Nilai Perilaku" size="lg">
        <div className="rounded-lg overflow-hidden text-sm" style={{ border: "1px solid var(--border)" }}>
          <div className="grid grid-cols-4 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide"
            style={{ background: "var(--surface-muted)", color: "var(--text-subtle)", borderBottom: "1px solid var(--border)" }}>
            <span>Aspek</span><span className="text-center">Nilai Mandiri</span><span className="text-center">Nilai Atasan</span><span className="text-center">Gabungan*</span>
          </div>
          {ASPEK_LIST.map(aspek => {
            const mandiri = perilakuMandiri.find(p => p.aspek === aspek)?.nilai ?? 0
            const atasan  = perilaku.find(p => p.aspek === aspek)?.nilai ?? 0
            const gabungan = ((mandiri * 0.3 + atasan * 0.7) / 5 * 100).toFixed(1)
            return (
              <div key={aspek} className="grid grid-cols-4 px-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
                <span className="font-semibold" style={{ color: "var(--text-900)" }}>{ASPEK_LABELS[aspek]}</span>
                <span className="text-center font-mono" style={{ color: "var(--text-700)" }}>{mandiri} / 5</span>
                <span className="text-center font-mono font-bold" style={{ color: "var(--primary)" }}>{atasan} / 5</span>
                <span className="text-center font-mono font-bold" style={{ color: "var(--success, #16a34a)" }}>{gabungan}</span>
              </div>
            )
          })}
          <div className="px-4 py-2 text-xs" style={{ color: "var(--text-subtle)" }}>
            * Gabungan = (mandiri × 30% + atasan × 70%) / 5 × 100
          </div>
        </div>
      </Modal>
    </div>
  )
}

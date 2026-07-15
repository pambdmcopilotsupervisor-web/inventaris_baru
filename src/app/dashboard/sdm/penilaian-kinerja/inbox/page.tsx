"use client"
import React, { useState, useCallback, useEffect, useMemo } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { TextareaField } from "@/components/ui/form-field"
import { Modal } from "@/components/ui/modal"
import { useAuth } from "@/contexts/AuthContext"
import { useApi } from "@/hooks/useApi"
import {
  CheckCircle, Clock, RefreshCw, Send, ArrowRight,
  AlertTriangle, TrendingUp, Users, Lock, ChevronRight, FileDown, FileArchive,
} from "lucide-react"

/* ─── Types ─────────────────────────────────────────────────────── */
type StatusPenilaian = "draft" | "diajukan" | "diverifikasi" | "disetujui" | "final"

type RiwayatItem = {
  id: number; id_periode: number; kode_periode: string; nama_periode: string
  status: StatusPenilaian; nilai_akhir: number | null; tanggal_final: string | null
  catatan_atasan: string | null
}

type PenilaianMandiriStatus = {
  penilaian: { id: number; status: StatusPenilaian }
  periode: { id: number; nama_periode: string; tanggal_tutup: string }
}

type MenungguItem = {
  id: number; id_periode: number; nama_periode: string
  nik: string; nama_karyawan: string; jabatan: string
  status: StatusPenilaian; tanggal_diajukan: string | null
  id_penilai_atasan?: number | null   // null = atasan belum isi form
}

type RingkasanDivisi = {
  divisi_id: number | null; nama_divisi: string | null
  total: number; draft: number; diajukan: number; diverifikasi: number; disetujui: number; final: number
  rata_nilai_akhir: number | null
}

type RingkasanTotal = {
  total: number; draft: number; diajukan: number; diverifikasi: number; disetujui: number; final: number
  rata_nilai_akhir: number | null
}

type RingkasanResponse = {
  periode: { id: number; nama_periode: string }
  divisi: RingkasanDivisi[]
  total: RingkasanTotal
}

type ReviewData = {
  penilaian: {
    id: number
    status: StatusPenilaian
    nilai_akhir: number | null
    nama_karyawan: string
    jabatan: string
    nama_divisi: string | null
    nama_periode: string
    tanggal_diajukan: string | null
    tanggal_diverifikasi: string | null
    tanggal_disetujui: string | null
    tanggal_final: string | null
    catatan_pegawai: string | null
    catatan_atasan: string | null
  }
  timeline: {
    id: number
    aksi: string
    status_dari: string | null
    status_ke: string | null
    catatan: string | null
    created_at: string
    actor_nama: string | null
    actor_jabatan: string | null
  }[]
  actions: { ke: StatusPenilaian; label: string; butuh_catatan: boolean }[]
}

/* ─── Helpers ────────────────────────────────────────────────────── */
const STATUS_LABEL: Record<StatusPenilaian, string> = {
  draft: "Draft", diajukan: "Menunggu Verifikasi",
  diverifikasi: "Menunggu Persetujuan", disetujui: "Disetujui", final: "Final",
}
const STATUS_BADGE_VARIANT: Record<StatusPenilaian, "outline" | "secondary" | "warning" | "success" | "default"> = {
  draft: "outline", diajukan: "warning", diverifikasi: "secondary", disetujui: "success", final: "default",
}

const STATUS_STEPS: StatusPenilaian[] = ["draft", "diajukan", "diverifikasi", "disetujui", "final"]

function predikat(nilai: number | null): string {
  if (nilai == null) return "—"
  if (nilai >= 91) return "Sangat Baik"
  if (nilai >= 76) return "Baik"
  if (nilai >= 61) return "Cukup"
  if (nilai >= 51) return "Kurang"
  return "Sangat Kurang"
}

function pctBar(v: number, total: number) {
  return total ? Math.round((v / total) * 100) : 0
}

function getAgingDays(tanggal: string | null | undefined): number | null {
  if (!tanggal) return null
  const t = new Date(tanggal)
  if (Number.isNaN(t.getTime())) return null
  const diffMs = Date.now() - t.getTime()
  return Math.max(0, Math.floor(diffMs / 86400000))
}

function getSlaMeta(days: number | null) {
  if (days == null) return { label: "-", tone: "neutral" as const }
  if (days <= 2) return { label: `${days}h`, tone: "good" as const }
  if (days <= 5) return { label: `${days}h`, tone: "warn" as const }
  return { label: `${days}h`, tone: "bad" as const }
}

function SlaBadge({ tanggal }: { tanggal: string | null | undefined }) {
  const days = getAgingDays(tanggal)
  const meta = getSlaMeta(days)
  const palette = meta.tone === "good"
    ? { bg: "rgba(5,150,105,0.12)", color: "rgb(5,150,105)", border: "rgba(5,150,105,0.3)" }
    : meta.tone === "warn"
      ? { bg: "rgba(217,119,6,0.12)", color: "rgb(180,83,9)", border: "rgba(217,119,6,0.3)" }
      : meta.tone === "bad"
        ? { bg: "rgba(220,38,38,0.12)", color: "rgb(220,38,38)", border: "rgba(220,38,38,0.3)" }
        : { bg: "var(--surface-muted)", color: "var(--text-subtle)", border: "var(--border)" }
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold"
      style={{ background: palette.bg, color: palette.color, border: `1px solid ${palette.border}` }}
    >
      SLA {meta.label}
    </span>
  )
}

function NotificationCenter({ title, items }: { title: string; items: { label: string; value: number; action: string; tone?: "good" | "warn" | "bad" }[] }) {
  return (
    <div className="rounded-xl p-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
      <p className="font-bold text-sm mb-3" style={{ color: "var(--text-900)" }}>{title}</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {items.map((it) => {
          const color = it.tone === "bad" ? "rgb(220,38,38)" : it.tone === "warn" ? "rgb(180,83,9)" : "rgb(5,150,105)"
          return (
            <div key={it.label} className="rounded-lg p-3" style={{ border: "1px solid var(--border)", background: "var(--surface-muted)" }}>
              <p className="text-[11px]" style={{ color: "var(--text-subtle)" }}>{it.label}</p>
              <p className="text-lg font-bold" style={{ color }}>{it.value}</p>
              <p className="text-[11px]" style={{ color: "var(--text-subtle)" }}>{it.action}</p>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ReviewDrawer({
  open,
  loading,
  data,
  error,
  onClose,
}: {
  open: boolean
  loading: boolean
  data: ReviewData | null
  error: string
  onClose: () => void
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0" style={{ background: "rgba(15,23,42,0.45)" }} onClick={onClose} />
      <div className="absolute right-0 top-0 h-full w-full max-w-xl overflow-y-auto p-4" style={{ background: "var(--surface)", borderLeft: "1px solid var(--border)" }}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-bold" style={{ color: "var(--text-900)" }}>Detail Review Penilaian</h3>
          <Button variant="outline" size="sm" onClick={onClose}>Tutup</Button>
        </div>

        {loading && <p className="text-sm" style={{ color: "var(--text-subtle)" }}>Memuat detail...</p>}
        {!loading && error && <div className="rounded-lg px-3 py-2 text-sm" style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>{error}</div>}

        {!loading && data && (
          <div className="space-y-4">
            <div className="rounded-lg p-3" style={{ border: "1px solid var(--border)", background: "var(--surface-muted)" }}>
              <p className="font-semibold" style={{ color: "var(--text-900)" }}>{data.penilaian.nama_karyawan}</p>
              <p className="text-xs" style={{ color: "var(--text-subtle)" }}>{data.penilaian.jabatan} · {data.penilaian.nama_divisi ?? "-"}</p>
              <p className="text-xs mt-1" style={{ color: "var(--text-subtle)" }}>{data.penilaian.nama_periode}</p>
              <div className="mt-2 flex items-center gap-2">
                <Badge variant={STATUS_BADGE_VARIANT[data.penilaian.status]}>{STATUS_LABEL[data.penilaian.status]}</Badge>
                <span className="text-xs font-mono" style={{ color: "var(--primary)" }}>Nilai: {data.penilaian.nilai_akhir != null ? Number(data.penilaian.nilai_akhir).toFixed(2) : "-"}</span>
              </div>
            </div>

            <div className="rounded-lg p-3" style={{ border: "1px solid var(--border)", background: "var(--surface)" }}>
              <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--text-subtle)" }}>Timeline Audit</p>
              <div className="space-y-2">
                {data.timeline.length === 0 && <p className="text-xs" style={{ color: "var(--text-subtle)" }}>Belum ada riwayat approval.</p>}
                {data.timeline.map((t) => (
                  <div key={t.id} className="rounded-md px-3 py-2" style={{ background: "var(--surface-muted)", border: "1px solid var(--border)" }}>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold" style={{ color: "var(--text-900)" }}>{t.aksi.replaceAll("_", " ")}</p>
                      <p className="text-[11px]" style={{ color: "var(--text-subtle)" }}>{new Date(t.created_at).toLocaleString("id-ID")}</p>
                    </div>
                    <p className="text-[11px] mt-0.5" style={{ color: "var(--text-subtle)" }}>
                      {t.actor_nama ?? "Sistem"}{t.actor_jabatan ? ` · ${t.actor_jabatan}` : ""}
                      {t.status_dari || t.status_ke ? ` · ${t.status_dari ?? "-"} -> ${t.status_ke ?? "-"}` : ""}
                    </p>
                    {t.catatan && <p className="text-[11px] mt-1" style={{ color: "var(--text-700)" }}>{t.catatan}</p>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/* ─── Status Steps ────────────────────────────────────────────────── */
function StatusSteps({ status }: { status: StatusPenilaian }) {
  const current = STATUS_STEPS.indexOf(status)
  return (
    <div className="flex items-center gap-0 overflow-x-auto">
      {STATUS_STEPS.map((s, i) => (
        <React.Fragment key={s}>
          <div className="flex flex-col items-center min-w-[80px]">
            <div className="h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold"
              style={{ background: i <= current ? "var(--primary)" : "var(--surface-muted)", color: i <= current ? "#fff" : "var(--text-subtle)", border: `2px solid ${i <= current ? "var(--primary)" : "var(--border)"}` }}>
              {i < current ? "✓" : i + 1}
            </div>
            <p className="text-[10px] mt-1 text-center" style={{ color: i === current ? "var(--primary)" : "var(--text-subtle)", fontWeight: i === current ? 700 : 400 }}>
              {STATUS_LABEL[s]}
            </p>
          </div>
          {i < STATUS_STEPS.length - 1 && (
            <div className="h-0.5 flex-1 min-w-[16px] mb-4" style={{ background: i < current ? "var(--primary)" : "var(--border)" }} />
          )}
        </React.Fragment>
      ))}
    </div>
  )
}

/* ─── View Staf ──────────────────────────────────────────────────── */
function ViewStaf() {
  const { data: mandiri } = useApi<PenilaianMandiriStatus>("/api/penilaian-mandiri")
  const { data: riwayat, loading: loadRiwayat, refetch: refetchRiwayat } = useApi<RiwayatItem[]>("/api/penilaian/riwayat-saya")

  const status = mandiri?.penilaian.status ?? "draft"
  const isDikembalikan = status === "draft" && !!(riwayat?.find(r => r.id === mandiri?.penilaian.id)?.catatan_atasan)
  const catatanKembali = riwayat?.find(r => r.id === mandiri?.penilaian.id)?.catatan_atasan ?? ""

  return (
    <div className="space-y-5">
      {/* Status sekarang */}
      <div className="rounded-xl p-5" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <p className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: "var(--text-subtle)" }}>Status Penilaian Saya</p>
        <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
          <div>
            <Badge variant={STATUS_BADGE_VARIANT[status]}>{STATUS_LABEL[status]}</Badge>
            <p className="text-xs mt-1" style={{ color: "var(--text-subtle)" }}>{mandiri?.periode.nama_periode ?? "—"}</p>
          </div>
          {status === "draft" && (
            <Link href="/dashboard/sdm/penilaian-kinerja/mandiri">
              <Button><Send className="h-3.5 w-3.5" />Isi Penilaian</Button>
            </Link>
          )}
        </div>
        <StatusSteps status={status} />
        {isDikembalikan && catatanKembali && (
          <div className="mt-4 rounded-lg p-3 flex gap-2" style={{ background: "var(--danger-bg, #fef2f2)", border: "1px solid var(--danger, #dc2626)" }}>
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" style={{ color: "var(--danger, #dc2626)" }} />
            <div>
              <p className="text-sm font-semibold" style={{ color: "var(--danger, #dc2626)" }}>Penilaian Dikembalikan</p>
              <p className="text-xs mt-0.5" style={{ color: "var(--text-700)" }}>Alasan: {catatanKembali}</p>
            </div>
          </div>
        )}
      </div>

      {/* Riwayat */}
      <div className="rounded-xl p-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <div className="flex items-center justify-between mb-3">
          <p className="font-bold text-sm" style={{ color: "var(--text-900)" }}>Riwayat Penilaian</p>
          <Button variant="outline" size="sm" onClick={refetchRiwayat}><RefreshCw className="h-3.5 w-3.5" /></Button>
        </div>
        {loadRiwayat && <p className="text-xs" style={{ color: "var(--text-subtle)" }}>Memuat...</p>}
        {!loadRiwayat && (!riwayat || riwayat.length === 0) && (
          <p className="text-xs" style={{ color: "var(--text-subtle)" }}>Belum ada riwayat penilaian.</p>
        )}
        <div className="space-y-2">
          {(riwayat ?? []).map(r => (
            <div key={r.id} className="flex items-center justify-between gap-3 rounded-lg px-3 py-2" style={{ background: "var(--surface-muted)", border: "1px solid var(--border)" }}>
              <div>
                <p className="text-sm font-semibold" style={{ color: "var(--text-900)" }}>{r.nama_periode}</p>
                <p className="text-xs" style={{ color: "var(--text-subtle)" }}>{r.kode_periode}</p>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold font-mono" style={{ color: "var(--primary)" }}>{r.nilai_akhir != null ? Number(r.nilai_akhir).toFixed(2) : "—"}</p>
                <p className="text-xs" style={{ color: "var(--text-subtle)" }}>{predikat(r.nilai_akhir)}</p>
              </div>
              <Badge variant={STATUS_BADGE_VARIANT[r.status]}>{STATUS_LABEL[r.status]}</Badge>
              <a href={`/api/penilaian/${r.id}/pdf`} target="_blank" rel="noopener noreferrer">
                <Button variant="outline" size="sm"><FileDown className="h-3.5 w-3.5" />PDF</Button>
              </a>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ─── View Kepala Divisi ─────────────────────────────────────────── */
function ViewKepalaDivisi() {
  type DaftarItem = {
    penilaian_id: number | null
    id_pegawai: number
    nik: string
    nama_karyawan: string
    jabatan: string
    nama_divisi: string | null
    status: string | null
    tanggal_diajukan: string | null
    id_penilai_atasan: number | null
  }
  type DaftarResponse = { periode: { nama_periode: string }; list: DaftarItem[] }
  const { data: daftar, loading, refetch } = useApi<DaftarResponse>("/api/penilaian-atasan")
  const [filterStatus, setFilterStatus] = useState<"semua" | "belum_mengisi" | "menunggu_saya" | "sudah_selesai">("semua")
  const [actionModal, setActionModal] = useState<{ id: number; ke: "diverifikasi" | "draft" } | null>(null)
  const [catatan, setCatatan]   = useState("")
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [bulkModal, setBulkModal] = useState(false)
  const [bulkAction, setBulkAction] = useState<"diverifikasi" | "draft">("diverifikasi")
  const [bulkCatatan, setBulkCatatan] = useState("")
  const [saving, setSaving]     = useState(false)
  const [errMsg, setErrMsg]     = useState("")
  const [successMsg, setSuccessMsg] = useState("")
  const [reviewOpen, setReviewOpen] = useState(false)
  const [reviewLoading, setReviewLoading] = useState(false)
  const [reviewError, setReviewError] = useState("")
  const [reviewData, setReviewData] = useState<ReviewData | null>(null)

  const list = daftar?.list ?? []
  const total       = list.length
  const belumMengisi = list.filter(r => !r.status || r.status === "draft").length
  const menunggu    = list.filter(r => r.status === "diajukan").length
  const sudahSelesai = list.filter(r => r.status === "diverifikasi" || r.status === "disetujui" || r.status === "final").length
  const pctSelesai  = total ? Math.round((sudahSelesai / total) * 100) : 0

  const filtered = list.filter(r => {
    if (filterStatus === "semua")         return true
    if (filterStatus === "belum_mengisi") return !r.status || r.status === "draft"
    if (filterStatus === "menunggu_saya") return r.status === "diajukan"
    if (filterStatus === "sudah_selesai") return r.status === "diverifikasi" || r.status === "disetujui" || r.status === "final"
    return true
  })

  const siapVerifikasi = filtered.filter(r => r.status === "diajukan" && !!r.penilaian_id && !!r.id_penilai_atasan)
  const toggleSelect = (id: number) => setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  const selectAll = () => setSelectedIds(siapVerifikasi.map(r => Number(r.penilaian_id)).filter(Boolean))
  const clearSelected = () => setSelectedIds([])

  const doAction = async () => {
    if (!actionModal) return
    if (actionModal.ke === "draft" && !catatan.trim()) { setErrMsg("Catatan alasan wajib diisi"); return }
    setSaving(true); setErrMsg("")
    try {
      const res = await fetch(`/api/penilaian/${actionModal.id}/transisi`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ke: actionModal.ke, catatan }),
      })
      const j = await res.json()
      if (!res.ok) { setErrMsg(j.error ?? "Gagal"); return }
      setSuccessMsg(j.message ?? "Berhasil")
      setActionModal(null); setCatatan(""); refetch()
    } finally { setSaving(false) }
  }

  const doBulkAction = async () => {
    if (!selectedIds.length) return
    if (bulkAction === "draft" && !bulkCatatan.trim()) { setErrMsg("Catatan alasan wajib diisi untuk pengembalian bulk"); return }
    setSaving(true); setErrMsg("")
    try {
      const res = await fetch("/api/penilaian/bulk-transisi", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selectedIds, ke: bulkAction, catatan: bulkCatatan }),
      })
      const j = await res.json()
      if (!res.ok) { setErrMsg(j.error ?? "Gagal"); return }
      setSuccessMsg(j.message ?? "Berhasil")
      setBulkModal(false)
      setBulkCatatan("")
      setSelectedIds([])
      refetch()
    } finally { setSaving(false) }
  }

  const notificationItems = useMemo(() => {
    const urgent = filtered.filter(r => (getAgingDays(r.tanggal_diajukan) ?? 0) > 5 && r.status === "diajukan").length
    const perluNilai = filtered.filter(r => r.status === "diajukan" && !r.id_penilai_atasan).length
    const ready = siapVerifikasi.length
    return [
      { label: "Urgent SLA > 5 hari", value: urgent, action: "Prioritaskan review segera", tone: "bad" as const },
      { label: "Perlu Nilai Atasan", value: perluNilai, action: "Lengkapi nilai atasan dulu", tone: "warn" as const },
      { label: "Siap Diverifikasi", value: ready, action: "Gunakan verifikasi bulk", tone: "good" as const },
    ]
  }, [filtered, siapVerifikasi.length])

  const openReviewDrawer = async (id: number) => {
    setReviewOpen(true)
    setReviewLoading(true)
    setReviewError("")
    setReviewData(null)
    try {
      const res = await fetch(`/api/penilaian/${id}/review`)
      const j = await res.json()
      if (!res.ok) { setReviewError(j.error ?? "Gagal memuat detail review"); return }
      setReviewData(j as ReviewData)
    } catch {
      setReviewError("Gagal memuat detail review")
    } finally {
      setReviewLoading(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--text-900)" }}>Inbox Approval — Kepala Divisi</h1>
          <p className="text-xs" style={{ color: "var(--text-subtle)" }}>{daftar?.periode.nama_periode}</p>
        </div>
        <Button variant="outline" size="sm" onClick={refetch}><RefreshCw className="h-3.5 w-3.5" /></Button>
      </div>

      {successMsg && <div className="rounded-lg px-4 py-3 text-sm" style={{ background: "var(--success-bg)", color: "var(--success)" }}>{successMsg}</div>}

      <NotificationCenter title="Notification Center" items={notificationItems} />

      {/* Progress bar divisi */}
      <div className="rounded-xl p-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold" style={{ color: "var(--text-subtle)" }}>Progress Divisi Selesai</span>
          <span className="text-sm font-bold font-mono" style={{ color: "var(--primary)" }}>{pctSelesai}%</span>
        </div>
        <div className="h-3 rounded-full overflow-hidden" style={{ background: "var(--surface-muted)" }}>
          <div className="h-full rounded-full transition-all" style={{ width: `${pctSelesai}%`, background: pctSelesai === 100 ? "var(--success, #16a34a)" : "var(--primary)" }} />
        </div>
        <p className="text-xs mt-1" style={{ color: "var(--text-subtle)" }}>{sudahSelesai} dari {total} pegawai sudah selesai dinilai</p>
      </div>

      {/* Filter sesuai spec */}
      <div className="flex gap-2 flex-wrap">
        {([
          { key: "semua",          label: `Semua (${total})` },
          { key: "belum_mengisi",  label: `Belum Mengisi (${belumMengisi})` },
          { key: "menunggu_saya",  label: `Menunggu Saya (${menunggu})` },
          { key: "sudah_selesai",  label: `Sudah Selesai (${sudahSelesai})` },
        ] as const).map(f => (
          <button key={f.key} onClick={() => setFilterStatus(f.key)}
            className="px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
            style={{ background: filterStatus === f.key ? "var(--primary)" : "var(--surface)", color: filterStatus === f.key ? "#fff" : "var(--text-900)", border: "1px solid var(--border)" }}>
            {f.label}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-xs" style={{ color: "var(--text-subtle)" }}>Item siap diverifikasi: {siapVerifikasi.length}</p>
        {selectedIds.length > 0 ? (
          <div className="flex gap-2">
            <Button size="sm" onClick={() => { setBulkAction("diverifikasi"); setBulkModal(true) }}>
              <CheckCircle className="h-3.5 w-3.5" />Verifikasi Bulk ({selectedIds.length})
            </Button>
            <Button size="sm" variant="outline" onClick={() => { setBulkAction("draft"); setBulkModal(true) }}>
              Kembalikan Bulk
            </Button>
            <Button size="sm" variant="ghost" onClick={clearSelected}>Batal Pilih</Button>
          </div>
        ) : siapVerifikasi.length > 0 ? (
          <Button size="sm" variant="outline" onClick={selectAll}>Pilih Semua Siap Verifikasi</Button>
        ) : null}
      </div>

      <div className="rounded-xl overflow-hidden overflow-x-auto" style={{ border: "1px solid var(--border)", background: "var(--surface)" }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: "var(--surface-muted)", borderBottom: "1px solid var(--border)" }}>
              {["Pegawai", "Status", "Diajukan/SLA", "Aksi"].map(h => (
                <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-subtle)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={4} className="px-4 py-8 text-center text-sm" style={{ color: "var(--text-subtle)" }}>Memuat...</td></tr>}
            {!loading && filtered.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-sm" style={{ color: "var(--text-subtle)" }}>Tidak ada data</td></tr>}
            {filtered.map(row => (
              <tr key={row.id_pegawai} style={{ borderBottom: "1px solid var(--border)" }}
                onMouseEnter={e => (e.currentTarget.style.background = "var(--surface-muted)")}
                onMouseLeave={e => (e.currentTarget.style.background = "")}>
                <td className="px-4 py-3">
                  {row.status === "diajukan" && row.id_penilai_atasan && row.penilaian_id && (
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(Number(row.penilaian_id))}
                      onChange={() => toggleSelect(Number(row.penilaian_id))}
                      className="mr-2 h-4 w-4 align-middle"
                      style={{ accentColor: "var(--primary)" }}
                    />
                  )}
                  <p className="font-semibold" style={{ color: "var(--text-900)" }}>{row.nama_karyawan}</p>
                  <p className="text-xs" style={{ color: "var(--text-subtle)" }}>{row.jabatan}</p>
                </td>
                <td className="px-4 py-3">
                  {/* Status badge: untuk diajukan, tampilkan sub-status berdasarkan penilaian atasan */}
                  {row.status === "diajukan" && !row.id_penilai_atasan
                    ? <Badge variant="warning">Perlu Dinilai Atasan</Badge>
                    : row.status === "diajukan" && row.id_penilai_atasan
                    ? <Badge variant="secondary">Siap Diverifikasi</Badge>
                    : <Badge variant={STATUS_BADGE_VARIANT[(row.status as StatusPenilaian) ?? "draft"]}>{STATUS_LABEL[(row.status as StatusPenilaian) ?? "draft"]}</Badge>
                  }
                </td>
                <td className="px-4 py-3 text-xs" style={{ color: "var(--text-subtle)" }}>
                  <div className="space-y-1">
                    <p>{row.tanggal_diajukan ? new Date(row.tanggal_diajukan).toLocaleDateString("id-ID") : "—"}</p>
                    <SlaBadge tanggal={row.tanggal_diajukan} />
                  </div>
                </td>
                <td className="px-4 py-3">
                  {row.status === "diajukan" && row.penilaian_id && (
                    <div className="flex gap-2">
                      {row.id_penilai_atasan ? (
                        // CTA kontekstual: sudah dinilai atasan → verifikasi langsung
                        <Button size="sm"
                          onClick={() => { if (row.penilaian_id) { setActionModal({ id: row.penilaian_id, ke: "diverifikasi" }); setCatatan(""); setErrMsg("") } }}>
                          <CheckCircle className="h-3.5 w-3.5" />Verifikasi Sekarang
                        </Button>
                      ) : (
                        // CTA kontekstual: belum dinilai → isi nilai atasan dulu
                        <Link href="/dashboard/sdm/penilaian-kinerja/atasan">
                          <Button size="sm">
                            <CheckCircle className="h-3.5 w-3.5" />Isi Nilai Atasan
                          </Button>
                        </Link>
                      )}
                      <Button size="sm" variant="outline" onClick={() => { if (row.penilaian_id) { setActionModal({ id: row.penilaian_id, ke: "draft" }); setCatatan(""); setErrMsg("") } }}>
                        Kembalikan
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => openReviewDrawer(row.penilaian_id!)}>
                        Review
                      </Button>
                    </div>
                  )}
                  {(row.status !== "diajukan" || !row.penilaian_id) && row.penilaian_id && (
                    <div className="flex gap-2">
                      <Link href="/dashboard/sdm/penilaian-kinerja/atasan">
                        <Button size="sm" variant="outline"><ArrowRight className="h-3.5 w-3.5" />Lihat Progress</Button>
                      </Link>
                      <Button size="sm" variant="outline" onClick={() => openReviewDrawer(row.penilaian_id!)}>
                        Review
                      </Button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={!!actionModal} onClose={() => setActionModal(null)}
        title={actionModal?.ke === "draft" ? "Kembalikan Penilaian" : "Verifikasi Penilaian"}>
        {errMsg && <div className="mb-3 rounded-lg px-3 py-2 text-sm" style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>{errMsg}</div>}
        {actionModal?.ke === "diverifikasi" ? (
          <p className="text-sm mb-4" style={{ color: "var(--text-700)" }}>Konfirmasi verifikasi penilaian mandiri pegawai ini?</p>
        ) : (
          <TextareaField label="Catatan Alasan Pengembalian (wajib)" required value={catatan} onChange={e => setCatatan(e.target.value)} />
        )}
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={() => setActionModal(null)}>Batal</Button>
          <Button onClick={doAction} disabled={saving}>{saving ? "Memproses..." : "Konfirmasi"}</Button>
        </div>
      </Modal>

      <Modal open={bulkModal} onClose={() => setBulkModal(false)} title={bulkAction === "diverifikasi" ? `Verifikasi Bulk (${selectedIds.length})` : `Kembalikan Bulk (${selectedIds.length})`}>
        {errMsg && <div className="mb-3 rounded-lg px-3 py-2 text-sm" style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>{errMsg}</div>}
        <p className="text-sm mb-3" style={{ color: "var(--text-700)" }}>
          {bulkAction === "diverifikasi"
            ? `Konfirmasi verifikasi ${selectedIds.length} penilaian sekaligus?`
            : `Konfirmasi pengembalian ${selectedIds.length} penilaian sekaligus ke Draft?`}
        </p>
        {bulkAction === "draft" && (
          <TextareaField label="Catatan Alasan Pengembalian (wajib)" required value={bulkCatatan} onChange={e => setBulkCatatan(e.target.value)} />
        )}
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={() => setBulkModal(false)}>Batal</Button>
          <Button onClick={doBulkAction} disabled={saving}>{saving ? "Memproses..." : "Konfirmasi"}</Button>
        </div>
      </Modal>

      <ReviewDrawer
        open={reviewOpen}
        loading={reviewLoading}
        data={reviewData}
        error={reviewError}
        onClose={() => setReviewOpen(false)}
      />
    </div>
  )
}

/* ─── View Manager ────────────────────────────────────────────────── */
function ViewManager() {
  type DaftarKD = {
    penilaian_id: number | null
    id_pegawai: number
    nama_karyawan: string
    jabatan: string
    status: string | null
    id_penilai_atasan: number | null
    tanggal_diajukan: string | null
  }
  const { data: menunggu, loading: loadMenunggu, refetch: refetchMenunggu } = useApi<MenungguItem[]>("/api/penilaian/menunggu-saya")
  const { data: ringkasan, loading: loadRingkasan, refetch: refetchRingkasan } = useApi<RingkasanResponse>("/api/penilaian/ringkasan")
  const { data: daftarBawahan, refetch: refetchDaftar } = useApi<{ list: DaftarKD[] }>("/api/penilaian-atasan")
  const [selected, setSelected] = useState<number[]>([])
  const [bulkModal, setBulkModal] = useState(false)
  const [bulkAction, setBulkAction] = useState<"disetujui" | "diajukan">("disetujui")
  const [catatan, setCatatan]    = useState("")
  const [saving, setSaving]      = useState(false)
  const [msg, setMsg]            = useState("")
  const [errMsg, setErrMsg]      = useState("")
  const [reviewOpen, setReviewOpen] = useState(false)
  const [reviewLoading, setReviewLoading] = useState(false)
  const [reviewError, setReviewError] = useState("")
  const [reviewData, setReviewData] = useState<ReviewData | null>(null)
  // Verifikasi Kepala Divisi (Manager sebagai atasan langsung Kepala Divisi)
  const [kdActionModal, setKdActionModal] = useState<{ id: number; ke: "diverifikasi" | "draft" } | null>(null)
  const [kdCatatan, setKdCatatan] = useState("")

  const KEPALA_LIST = ["Kepala Divisi", "Kepala Bagian"]
  const daftarKepalaDivisi = (daftarBawahan?.list ?? []).filter(r =>
    KEPALA_LIST.some(j => r.jabatan.includes(j)) && r.status === "diajukan"
  )

  const daftarMenunggu = (menunggu ?? []).filter(r => r.status === "diverifikasi")

  const toggleSelect = (id: number) => setSelected(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id])
  const selectAll    = () => setSelected(daftarMenunggu.map(r => r.id))
  const deselectAll  = () => setSelected([])

  const doKdAction = async () => {
    if (!kdActionModal) return
    if (kdActionModal.ke === "draft" && !kdCatatan.trim()) { setErrMsg("Catatan alasan wajib diisi"); return }
    setSaving(true); setErrMsg("")
    try {
      const res = await fetch(`/api/penilaian/${kdActionModal.id}/transisi`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ke: kdActionModal.ke, catatan: kdCatatan }),
      })
      const j = await res.json()
      if (!res.ok) { setErrMsg(j.error ?? "Gagal"); return }
      setMsg(j.message ?? "Berhasil")
      setKdActionModal(null); setKdCatatan(""); refetchDaftar(); refetchMenunggu(); refetchRingkasan()
    } finally { setSaving(false) }
  }

  const doBulkApprove = async () => {
    if (!selected.length) return
    if (bulkAction === "diajukan" && !catatan.trim()) { setErrMsg("Catatan alasan wajib diisi untuk pengembalian bulk"); return }
    setSaving(true); setErrMsg("")
    try {
      const res = await fetch("/api/penilaian/bulk-transisi", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selected, ke: bulkAction, catatan }),
      })
      const j = await res.json()
      if (!res.ok) { setErrMsg(j.error ?? "Gagal"); return }
      setMsg(j.message ?? "Berhasil")
      setBulkModal(false); setSelected([]); setCatatan("")
      refetchMenunggu(); refetchRingkasan()
    } finally { setSaving(false) }
  }

  const managerNotificationItems = useMemo(() => {
    const urgentApproval = daftarMenunggu.filter(r => (getAgingDays(r.tanggal_diajukan) ?? 0) > 5).length
    const waitingKdInput = daftarKepalaDivisi.filter(r => !r.id_penilai_atasan).length
    const readyApprove = daftarMenunggu.length
    return [
      { label: "Approval Urgent > 5 hari", value: urgentApproval, action: "Setujui prioritas dulu", tone: "bad" as const },
      { label: "Kepala Divisi Belum Menilai", value: waitingKdInput, action: "Dorong pengisian atasan", tone: "warn" as const },
      { label: "Siap Disetujui", value: readyApprove, action: "Gunakan bulk approval", tone: "good" as const },
    ]
  }, [daftarMenunggu, daftarKepalaDivisi])

  const openReviewDrawer = async (id: number) => {
    setReviewOpen(true)
    setReviewLoading(true)
    setReviewError("")
    setReviewData(null)
    try {
      const res = await fetch(`/api/penilaian/${id}/review`)
      const j = await res.json()
      if (!res.ok) { setReviewError(j.error ?? "Gagal memuat detail review"); return }
      setReviewData(j as ReviewData)
    } catch {
      setReviewError("Gagal memuat detail review")
    } finally {
      setReviewLoading(false)
    }
  }

  const total = ringkasan?.total

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--text-900)" }}>Inbox Approval — Manager</h1>
          <p className="text-xs" style={{ color: "var(--text-subtle)" }}>{ringkasan?.periode.nama_periode}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => { refetchMenunggu(); refetchRingkasan() }}><RefreshCw className="h-3.5 w-3.5" /></Button>
      </div>

      {msg && <div className="rounded-lg px-4 py-3 text-sm" style={{ background: "var(--success-bg)", color: "var(--success)" }}>{msg}</div>}
      {errMsg && <div className="rounded-lg px-4 py-3 text-sm" style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>{errMsg}</div>}

      <NotificationCenter title="Notification Center" items={managerNotificationItems} />

      {/* Verifikasi penilaian Kepala Divisi (Manager = atasan langsung) */}
      <div className="rounded-xl p-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <p className="font-bold text-sm mb-3" style={{ color: "var(--text-900)" }}>
          Perlu Verifikasi Anda — Kepala Divisi ({daftarKepalaDivisi.length})
        </p>
        {daftarKepalaDivisi.length === 0 && <p className="text-xs" style={{ color: "var(--text-subtle)" }}>Tidak ada penilaian Kepala Divisi yang menunggu verifikasi.</p>}
        <div className="space-y-2">
          {daftarKepalaDivisi.map(row => (
            <div key={row.id_pegawai} className="flex items-center justify-between gap-3 rounded-lg px-3 py-2" style={{ background: "var(--surface-muted)", border: "1px solid var(--border)" }}>
              <div className="flex-1">
                <p className="font-semibold text-sm" style={{ color: "var(--text-900)" }}>{row.nama_karyawan}</p>
                <p className="text-xs" style={{ color: "var(--text-subtle)" }}>{row.jabatan}</p>
                <div className="mt-1"><SlaBadge tanggal={row.tanggal_diajukan} /></div>
              </div>
              {!row.id_penilai_atasan
                ? <Badge variant="warning">Perlu Dinilai</Badge>
                : <Badge variant="secondary">Siap Diverifikasi</Badge>}
              <div className="flex gap-2">
                {row.penilaian_id && (row.id_penilai_atasan ? (
                  <Button size="sm" onClick={() => { setKdActionModal({ id: row.penilaian_id!, ke: "diverifikasi" }); setKdCatatan(""); setErrMsg("") }}>
                    <CheckCircle className="h-3.5 w-3.5" />Verifikasi Sekarang
                  </Button>
                ) : (
                  <Link href="/dashboard/sdm/penilaian-kinerja/atasan">
                    <Button size="sm"><CheckCircle className="h-3.5 w-3.5" />Isi Nilai Atasan</Button>
                  </Link>
                ))}
                {row.penilaian_id && (
                  <Button size="sm" variant="outline" onClick={() => openReviewDrawer(row.penilaian_id!)}>Review</Button>
                )}
                {row.penilaian_id && (
                  <Button size="sm" variant="outline" onClick={() => { setKdActionModal({ id: row.penilaian_id!, ke: "draft" }); setKdCatatan(""); setErrMsg("") }}>
                    Kembalikan
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
      {loadRingkasan ? <p className="text-xs" style={{ color: "var(--text-subtle)" }}>Memuat ringkasan...</p> : ringkasan && (
        <div className="rounded-xl p-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          <p className="font-bold text-sm mb-3" style={{ color: "var(--text-900)" }}>Ringkasan per Divisi</p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  {["Divisi", "Total", "Draft", "Diajukan", "Diverifikasi", "Disetujui", "Final", "Rata Nilai", "Progress"].map(h => (
                    <th key={h} className="pb-2 pr-3 text-left font-semibold uppercase tracking-wide" style={{ color: "var(--text-subtle)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ringkasan.divisi.map((d, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td className="py-2 pr-3 font-semibold" style={{ color: "var(--text-900)" }}>{d.nama_divisi ?? "—"}</td>
                    <td className="py-2 pr-3">{Number(d.total)}</td>
                    <td className="py-2 pr-3" style={{ color: "var(--text-subtle)" }}>{Number(d.draft)}</td>
                    <td className="py-2 pr-3" style={{ color: "var(--warning, #d97706)" }}>{Number(d.diajukan)}</td>
                    <td className="py-2 pr-3" style={{ color: "var(--primary)" }}>{Number(d.diverifikasi)}</td>
                    <td className="py-2 pr-3" style={{ color: "var(--success, #16a34a)" }}>{Number(d.disetujui)}</td>
                    <td className="py-2 pr-3 font-bold">{Number(d.final)}</td>
                    <td className="py-2 pr-3 font-mono">{d.rata_nilai_akhir != null ? Number(d.rata_nilai_akhir).toFixed(1) : "—"}</td>
                    <td className="py-2 pr-3 min-w-[80px]">
                      <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--surface-muted)" }}>
                        <div className="h-full rounded-full" style={{ width: `${pctBar(Number(d.final) + Number(d.disetujui), Number(d.total))}%`, background: "var(--primary)" }} />
                      </div>
                    </td>
                  </tr>
                ))}
                {/* Total row */}
                {total && (
                  <tr style={{ background: "var(--surface-muted)" }}>
                    <td className="py-2 pr-3 font-bold" style={{ color: "var(--primary)" }}>TOTAL</td>
                    <td className="py-2 pr-3 font-bold">{Number(total.total)}</td>
                    <td className="py-2 pr-3">{Number(total.draft)}</td>
                    <td className="py-2 pr-3">{Number(total.diajukan)}</td>
                    <td className="py-2 pr-3">{Number(total.diverifikasi)}</td>
                    <td className="py-2 pr-3">{Number(total.disetujui)}</td>
                    <td className="py-2 pr-3 font-bold">{Number(total.final)}</td>
                    <td className="py-2 pr-3 font-mono">{total.rata_nilai_akhir != null ? Number(total.rata_nilai_akhir).toFixed(1) : "—"}</td>
                    <td className="py-2 pr-3">
                      <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--border)" }}>
                        <div className="h-full rounded-full" style={{ width: `${pctBar(Number(total.final) + Number(total.disetujui), Number(total.total))}%`, background: "var(--primary)" }} />
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Daftar menunggu persetujuan */}
      <div className="rounded-xl p-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <div className="flex items-center justify-between gap-2 mb-3">
          <p className="font-bold text-sm" style={{ color: "var(--text-900)" }}>
            Menunggu Persetujuan Anda ({daftarMenunggu.length})
          </p>
          {selected.length > 0 ? (
            <div className="flex gap-2">
              <span className="text-xs self-center" style={{ color: "var(--primary)" }}>{selected.length} dipilih</span>
              <Button size="sm" onClick={() => { setBulkAction("disetujui"); setBulkModal(true) }}>
                <CheckCircle className="h-3.5 w-3.5" />Setujui ({selected.length})
              </Button>
              <Button size="sm" variant="outline" onClick={() => { setBulkAction("diajukan"); setBulkModal(true) }}>
                Kembalikan Bulk
              </Button>
              <Button size="sm" variant="outline" onClick={deselectAll}>Batal</Button>
            </div>
          ) : daftarMenunggu.length > 0 ? (
            <Button size="sm" variant="outline" onClick={selectAll}>Pilih Semua</Button>
          ) : null}
        </div>

        {loadMenunggu && <p className="text-xs" style={{ color: "var(--text-subtle)" }}>Memuat...</p>}
        {!loadMenunggu && daftarMenunggu.length === 0 && <p className="text-xs" style={{ color: "var(--text-subtle)" }}>Tidak ada penilaian yang menunggu persetujuan.</p>}

        <div className="space-y-2">
          {daftarMenunggu.map(row => (
            <div key={row.id} className="flex items-center gap-3 rounded-lg px-3 py-2 cursor-pointer"
              style={{ background: selected.includes(row.id) ? "var(--primary-light)" : "var(--surface-muted)", border: `1px solid ${selected.includes(row.id) ? "var(--primary)" : "var(--border)"}` }}
              onClick={() => toggleSelect(row.id)}>
              <input type="checkbox" checked={selected.includes(row.id)} onChange={() => {}} className="h-4 w-4" style={{ accentColor: "var(--primary)" }} />
              <div className="flex-1">
                <p className="font-semibold text-sm" style={{ color: "var(--text-900)" }}>{row.nama_karyawan}</p>
                <p className="text-xs" style={{ color: "var(--text-subtle)" }}>{row.jabatan} · {row.nama_periode}</p>
                <div className="mt-1"><SlaBadge tanggal={row.tanggal_diajukan} /></div>
              </div>
              <Badge variant="secondary">Diverifikasi</Badge>
              <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); openReviewDrawer(row.id) }}>Review</Button>
            </div>
          ))}
        </div>
      </div>

      <Modal open={bulkModal} onClose={() => setBulkModal(false)} title={bulkAction === "disetujui" ? `Setujui ${selected.length} Penilaian` : `Kembalikan ${selected.length} Penilaian`}>
        {errMsg && <div className="mb-3 rounded-lg px-3 py-2 text-sm" style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>{errMsg}</div>}
        <p className="text-sm mb-3" style={{ color: "var(--text-700)" }}>
          {bulkAction === "disetujui"
            ? `Konfirmasi persetujuan ${selected.length} penilaian sekaligus?`
            : `Konfirmasi pengembalian ${selected.length} penilaian ke tahap diajukan?`}
        </p>
        <TextareaField label={bulkAction === "disetujui" ? "Catatan (opsional)" : "Catatan Alasan Pengembalian (wajib)"} value={catatan} onChange={e => setCatatan(e.target.value)} />
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={() => setBulkModal(false)}>Batal</Button>
          <Button onClick={doBulkApprove} disabled={saving}>{saving ? "Memproses..." : bulkAction === "disetujui" ? `Setujui ${selected.length}` : `Kembalikan ${selected.length}`}</Button>
        </div>
      </Modal>

      <ReviewDrawer
        open={reviewOpen}
        loading={reviewLoading}
        data={reviewData}
        error={reviewError}
        onClose={() => setReviewOpen(false)}
      />

      {/* Modal verifikasi/kembalikan Kepala Divisi */}
      <Modal open={!!kdActionModal} onClose={() => setKdActionModal(null)}
        title={kdActionModal?.ke === "draft" ? "Kembalikan Penilaian" : "Verifikasi Penilaian"}>
        {errMsg && <div className="mb-3 rounded-lg px-3 py-2 text-sm" style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>{errMsg}</div>}
        {kdActionModal?.ke === "diverifikasi"
          ? <p className="text-sm mb-4" style={{ color: "var(--text-700)" }}>Konfirmasi verifikasi penilaian Kepala Divisi ini?</p>
          : <TextareaField label="Catatan Alasan Pengembalian (wajib)" required value={kdCatatan} onChange={e => setKdCatatan(e.target.value)} />}
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={() => setKdActionModal(null)}>Batal</Button>
          <Button onClick={doKdAction} disabled={saving}>{saving ? "Memproses..." : "Konfirmasi"}</Button>
        </div>
      </Modal>
    </div>
  )
}

/* ─── View Admin/HRD ─────────────────────────────────────────────── */
function ViewAdminHrd() {
  type PeriodeItem = { id: number; nama_periode: string; status: string }
  const { data: periodeList } = useApi<PeriodeItem[]>("/api/periode")
  const [selectedPeriode, setSelectedPeriode] = useState("")
  const [filterDivisi, setFilterDivisi]       = useState("")
  const [filterStatus, setFilterStatus]       = useState("")

  const periodeQuery = selectedPeriode ? `?id_periode=${selectedPeriode}` : ""
  const { data: ringkasan, loading, refetch } = useApi<RingkasanResponse>(`/api/penilaian/ringkasan${periodeQuery}`, [selectedPeriode])
  const [kunciModal, setKunciModal] = useState(false)
  const [saving, setSaving]        = useState(false)
  const [msg, setMsg]              = useState("")
  const [errMsg, setErrMsg]        = useState("")

  const total = ringkasan?.total
  const siapFinal = Number(total?.disetujui ?? 0)

  // Filter tabel per divisi/status
  const divisiFiltered = (ringkasan?.divisi ?? []).filter(d => {
    if (filterDivisi && !d.nama_divisi?.toLowerCase().includes(filterDivisi.toLowerCase())) return false
    if (filterStatus === "belum_selesai" && Number(d.final) === Number(d.total)) return false
    if (filterStatus === "ada_menunggu" && Number(d.diajukan) + Number(d.diverifikasi) === 0) return false
    return true
  })

  const doKunciSemua = async () => {
    setSaving(true); setErrMsg("")
    try {
      const menungguRes = await fetch("/api/penilaian/menunggu-saya")
      const menungguData: MenungguItem[] = await menungguRes.json()
      const disetujuiIds = menungguData.filter(r => r.status === "disetujui").map(r => r.id)

      if (!disetujuiIds.length) { setErrMsg("Tidak ada penilaian yang perlu difinalisasi."); return }

      const finalRes = await fetch("/api/penilaian/bulk-transisi", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: disetujuiIds, ke: "final" }),
      })
      const j = await finalRes.json()
      if (!finalRes.ok) { setErrMsg(j.error ?? "Gagal"); return }
      setMsg(j.message ?? "Berhasil")
      setKunciModal(false); refetch()
    } finally { setSaving(false) }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--text-900)" }}>Monitoring Penilaian — Admin/HRD</h1>
          <p className="text-xs" style={{ color: "var(--text-subtle)" }}>{ringkasan?.periode.nama_periode}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={refetch}><RefreshCw className="h-3.5 w-3.5" /></Button>
          {ringkasan?.periode.id && (
            <a href={`/api/periode/${ringkasan.periode.id}/pdf-semua`} target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="sm"><FileArchive className="h-3.5 w-3.5" />Download Semua (ZIP)</Button>
            </a>
          )}
          {siapFinal > 0 && (
            <Button onClick={() => setKunciModal(true)}>
              <Lock className="h-3.5 w-3.5" />Kunci Semua ({siapFinal})
            </Button>
          )}
        </div>
      </div>

      {/* Filter periode, divisi, status */}
      <div className="rounded-xl p-4 grid grid-cols-1 sm:grid-cols-3 gap-3" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <div>
          <label className="block text-xs font-semibold mb-1 uppercase tracking-wide" style={{ color: "var(--text-subtle)" }}>Periode</label>
          <select value={selectedPeriode} onChange={e => setSelectedPeriode(e.target.value)}
            className="h-9 w-full rounded-lg px-3 text-sm" style={{ border: "1px solid var(--border-strong)", background: "var(--surface)", color: "var(--text-900)" }}>
            <option value="">Periode Aktif/Terbaru</option>
            {(periodeList ?? []).map(p => <option key={p.id} value={p.id}>{p.nama_periode}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold mb-1 uppercase tracking-wide" style={{ color: "var(--text-subtle)" }}>Cari Divisi</label>
          <input value={filterDivisi} onChange={e => setFilterDivisi(e.target.value)} placeholder="Filter nama divisi..."
            className="h-9 w-full rounded-lg px-3 text-sm" style={{ border: "1px solid var(--border-strong)", background: "var(--surface)", color: "var(--text-900)" }} />
        </div>
        <div>
          <label className="block text-xs font-semibold mb-1 uppercase tracking-wide" style={{ color: "var(--text-subtle)" }}>Filter Status</label>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            className="h-9 w-full rounded-lg px-3 text-sm" style={{ border: "1px solid var(--border-strong)", background: "var(--surface)", color: "var(--text-900)" }}>
            <option value="">Semua Divisi</option>
            <option value="ada_menunggu">Ada yang Menunggu</option>
            <option value="belum_selesai">Belum 100% Final</option>
          </select>
        </div>
      </div>

      {msg && <div className="rounded-lg px-4 py-3 text-sm" style={{ background: "var(--success-bg)", color: "var(--success)" }}>{msg}</div>}

      {/* Statistik */}
      {total && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: "Total", value: Number(total.total), color: "var(--text-900)" },
            { label: "Draft", value: Number(total.draft), color: "var(--text-subtle)" },
            { label: "Diajukan", value: Number(total.diajukan), color: "var(--warning, #d97706)" },
            { label: "Diverifikasi", value: Number(total.diverifikasi), color: "var(--primary)" },
            { label: "Disetujui", value: Number(total.disetujui), color: "var(--success, #16a34a)" },
            { label: "Final", value: Number(total.final), color: "var(--text-900)" },
          ].map(item => (
            <div key={item.label} className="rounded-xl p-3 text-center" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
              <p className="text-xs" style={{ color: "var(--text-subtle)" }}>{item.label}</p>
              <p className="text-2xl font-bold" style={{ color: item.color }}>{item.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Tabel per divisi */}
      {loading ? <p className="text-xs" style={{ color: "var(--text-subtle)" }}>Memuat...</p> : ringkasan && (
        <div className="rounded-xl overflow-hidden overflow-x-auto" style={{ border: "1px solid var(--border)", background: "var(--surface)" }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: "var(--surface-muted)", borderBottom: "1px solid var(--border)" }}>
                {["Divisi", "Total", "Draft", "Diajukan", "Diverifikasi", "Disetujui", "Final", "Rata Nilai", "Progress"].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-subtle)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {divisiFiltered.map((d, i) => {
                const pct = pctBar(Number(d.final), Number(d.total))
                return (
                  <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td className="px-4 py-3 font-semibold" style={{ color: "var(--text-900)" }}>{d.nama_divisi ?? "—"}</td>
                    <td className="px-4 py-3">{Number(d.total)}</td>
                    <td className="px-4 py-3" style={{ color: "var(--text-subtle)" }}>{Number(d.draft)}</td>
                    <td className="px-4 py-3" style={{ color: "var(--warning, #d97706)" }}>{Number(d.diajukan)}</td>
                    <td className="px-4 py-3" style={{ color: "var(--primary)" }}>{Number(d.diverifikasi)}</td>
                    <td className="px-4 py-3" style={{ color: "var(--success, #16a34a)" }}>{Number(d.disetujui)}</td>
                    <td className="px-4 py-3 font-bold">{Number(d.final)}</td>
                    <td className="px-4 py-3 font-mono text-xs">{d.rata_nilai_akhir != null ? Number(d.rata_nilai_akhir).toFixed(1) : "—"}</td>
                    <td className="px-4 py-3 min-w-[100px]">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: "var(--surface-muted)" }}>
                          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "var(--primary)" }} />
                        </div>
                        <span className="text-xs font-mono" style={{ color: "var(--text-subtle)" }}>{pct}%</span>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={kunciModal} onClose={() => setKunciModal(false)} title={`Kunci ${siapFinal} Penilaian`}>
        {errMsg && <div className="mb-3 rounded-lg px-3 py-2 text-sm" style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>{errMsg}</div>}
        <p className="text-sm mb-3" style={{ color: "var(--text-700)" }}>
          Finalisasi {siapFinal} penilaian yang sudah disetujui Manager? Data tidak dapat diubah setelah dikunci.
        </p>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={() => setKunciModal(false)}>Batal</Button>
          <Button onClick={doKunciSemua} disabled={saving}>
            <Lock className="h-3.5 w-3.5" />{saving ? "Memproses..." : `Kunci ${siapFinal} Penilaian`}
          </Button>
        </div>
      </Modal>
    </div>
  )
}

/* ─── Main Page ──────────────────────────────────────────────────── */
export default function InboxApprovalPage() {
  const { user, loading: authLoading } = useAuth()

  // Daftar bawahan (menentukan apakah user punya bawahan & jabatan apa)
  const { data: daftarBawahan, loading: loadDaftar } = useApi<{ list: { jabatan: string; status: string | null }[] }>("/api/penilaian-atasan")
  // Data yang menunggu tindakan (untuk Manager detection)
  const { data: menungguData, loading: loadMenunggu } = useApi<MenungguItem[]>("/api/penilaian/menunggu-saya")

  if (authLoading || loadDaftar || loadMenunggu) return <div className="p-6 text-sm" style={{ color: "var(--text-subtle)" }}>Memuat...</div>

  const role        = user?.role ?? "user"
  const jabatan     = (user as { jabatan?: string | null })?.jabatan ?? ""
  const isAdminHrd  = role === "admin" || role === "hrd"

  const JABATAN_KEPALA_LIST = ["Kepala Divisi", "Kepala Bagian"]
  const JABATAN_MANAGER_LIST = ["Manager", "Manajer", "Direktur"]

  // Deteksi berdasarkan jabatan user sendiri (bukan jabatan bawahan)
  const isKepalaDivisi = JABATAN_KEPALA_LIST.some(j => jabatan.includes(j))
  const isManager      = JABATAN_MANAGER_LIST.some(j => jabatan.toLowerCase().includes(j.toLowerCase()))
  // Fallback jika jabatan tidak dikenali: cek daftar bawahan
  const hasBawahanStaf   = !isKepalaDivisi && !isManager && (daftarBawahan?.list ?? []).some(r => ["Staff","Staf","Koordinator","Bendahara","Sekretaris","Ketua"].includes(r.jabatan))
  const hasBawahanKepala = !isKepalaDivisi && !isManager && (daftarBawahan?.list ?? []).some(r => JABATAN_KEPALA_LIST.some(j => r.jabatan.includes(j)))

  const showKepalaDivisi = isKepalaDivisi || hasBawahanStaf
  const showManager      = isManager || hasBawahanKepala
  const hasBawahan       = showKepalaDivisi || showManager

  // Admin/HRD: tampilan monitoring penuh
  if (isAdminHrd) return (
    <div className="space-y-8">
      <ViewAdminHrd />
      <div style={{ borderTop: "2px dashed var(--border)" }} />
      <h2 className="text-base font-bold" style={{ color: "var(--text-900)" }}>Penilaian Mandiri Saya</h2>
      <ViewStaf />
    </div>
  )

  // Punya bawahan: tampilkan panel team sesuai peran
  if (hasBawahan) return (
    <div className="space-y-8">
      {/* Kepala Divisi: punya bawahan Staf/Koordinator yang perlu diverifikasi */}
      {showKepalaDivisi && (
        <>
          <ViewKepalaDivisi />
          <div style={{ borderTop: "2px dashed var(--border)" }} />
        </>
      )}
      {/* Manager: punya bawahan Kepala Divisi yang perlu disetujui */}
      {showManager && (
        <>
          <ViewManager />
          <div style={{ borderTop: "2px dashed var(--border)" }} />
        </>
      )}
      <h2 className="text-base font-bold" style={{ color: "var(--text-900)" }}>Penilaian Mandiri Saya</h2>
      <ViewStaf />
    </div>
  )

  // Staf biasa (tidak punya bawahan atau queue kosong)
  return <ViewStaf />
}


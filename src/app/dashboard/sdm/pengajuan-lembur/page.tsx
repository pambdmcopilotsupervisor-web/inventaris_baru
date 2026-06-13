"use client"
import React, { useState } from "react"
import { DataTable, Column } from "@/components/ui/data-table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Modal } from "@/components/ui/modal"
import { ConfirmDelete } from "@/components/ui/confirm-delete"
import { TextField, TextareaField } from "@/components/ui/form-field"
import { SearchableSelect } from "@/components/ui/searchable-select"
import { Plus, Eye, Trash2, RefreshCw, Send, Check, X, Clock } from "lucide-react"
import { formatDate, formatDateLong, formatCurrency } from "@/lib/utils"
import { useApi } from "@/hooks/useApi"
import { useAuth } from "@/contexts/AuthContext"
import { STATUS_LEMBUR_LABELS, STATUS_LEMBUR_BADGE, StatusLembur, STATUS_LEMBUR } from "@/lib/lembur"

interface OvertimeRequest {
  id: number; karyawan_id: number; tanggal_lembur: string
  jam_mulai_rencana: string; jam_selesai_rencana: string; durasi_rencana_menit: number
  jam_mulai_aktual: string | null; jam_selesai_aktual: string | null; durasi_aktual_menit: number | null
  durasi_disetujui_menit: number | null; alasan_lembur: string; pekerjaan_lembur: string | null
  status: string; total_uang_lembur: number | null; is_lintas_hari: boolean
  karyawans?: { id: number; nik: string; nama_karyawan: string; jabatan: string }
  overtime_settings?: { id: number; nama_setting: string; tipe_hari: string } | null
  overtime_approvals?: { id: number; approver_role: string; approval_level: number; status: string; note: string | null; approved_at: string | null; approver_nama?: string | null; approver_jabatan?: string | null; diproses_oleh_nama?: string | null }[]
}
interface Karyawan { id: number; nik: string; nama_karyawan: string; jabatan: string; status_karyawan: string | null }

function formatMenit(m: number | null) {
  if (!m) return "—"
  const j = Math.floor(m / 60); const mn = m % 60
  return j > 0 ? `${j}j ${mn}m` : `${mn}m`
}

export default function PengajuanLemburPage() {
  const { user: authUser } = useAuth()
  const isAdmin = authUser?.role?.toLowerCase() === "admin"

  const { data, loading, refetch }  = useApi<OvertimeRequest[]>("/api/sdm/overtime-requests")
  const { data: karyawans }         = useApi<Karyawan[]>("/api/karyawan")
  const list = data ?? []

  const [filterStatus, setFilterStatus] = useState("")
  const filtered = filterStatus ? list.filter(p => p.status === filterStatus) : list

  /* ── Form state ──────────────────────────────────────────────── */
  const [addOpen, setAddOpen]   = useState(false)
  const [form, setForm]         = useState({ karyawan_id: "", tanggal_lembur: "", jam_mulai_rencana: "", jam_selesai_rencana: "", alasan_lembur: "", pekerjaan_lembur: "", is_lintas_hari: false })
  const [addErrors, setAddErrors] = useState<Record<string, string>>({})
  const [saving, setSaving]     = useState(false)

  /* ── Realize form ────────────────────────────────────────────── */
  const [realizeOpen, setRealizeOpen] = useState(false)
  const [realizeForm, setRealizeForm] = useState({ jam_mulai_aktual: "", jam_selesai_aktual: "", durasi_disetujui_menit: "", catatan_realisasi: "" })
  const [realizeSaving, setRealizeSaving] = useState(false)
  const [recalcSaving, setRecalcSaving]   = useState(false)

  /* ── Detail / Action ─────────────────────────────────────────── */
  const [detailOpen, setDetailOpen]     = useState(false)
  const [selected, setSelected]         = useState<OvertimeRequest | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [actionType, setActionType]     = useState<"approve" | "reject" | "submit" | "cancel" | null>(null)
  const [actionNote, setActionNote]     = useState("")
  const [actionSaving, setActionSaving] = useState(false)
  const [deleteOpen, setDeleteOpen]     = useState(false)
  const [deleting, setDeleting]         = useState(false)

  const karyawanOpts = (karyawans ?? []).filter(k => k.status_karyawan !== "Pensiun" && k.status_karyawan !== "Nonaktif")
    .map(k => ({ value: String(k.id), label: `${k.nik} — ${k.nama_karyawan}`, description: k.jabatan }))

  /* ── Add submit ──────────────────────────────────────────────── */
  const handleAdd = async () => {
    const e: Record<string, string> = {}
    if (isAdmin && !form.karyawan_id)  e.karyawan_id = "Pilih karyawan"
    if (!form.tanggal_lembur)          e.tanggal_lembur = "Tanggal wajib diisi"
    if (!form.jam_mulai_rencana)       e.jam_mulai_rencana = "Jam mulai wajib"
    if (!form.jam_selesai_rencana)     e.jam_selesai_rencana = "Jam selesai wajib"
    if (!form.alasan_lembur.trim())    e.alasan_lembur = "Alasan wajib diisi"
    setAddErrors(e)
    if (Object.keys(e).filter(k => e[k]).length) return

    setSaving(true)
    try {
      const res = await fetch("/api/sdm/overtime-requests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) })
      if (!res.ok) { const j = await res.json(); setAddErrors({ _: j.error ?? "Gagal" }); return }
      setAddOpen(false); refetch()
    } finally { setSaving(false) }
  }

  const openDetail = async (row: OvertimeRequest) => {
    setSelected(row); setDetailOpen(true); setDetailLoading(true)
    try {
      const res = await fetch(`/api/sdm/overtime-requests/${row.id}`)
      if (res.ok) setSelected(await res.json())
    } finally { setDetailLoading(false) }
  }

  const handleAction = async () => {
    if (!selected || !actionType) return
    if (actionType === "reject" && !actionNote.trim()) { alert("Catatan penolakan wajib diisi"); return }
    setActionSaving(true)
    try {
      const res = await fetch(`/api/sdm/overtime-requests/${selected.id}/${actionType}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ note: actionNote }),
      })
      const j = await res.json()
      if (!res.ok) { alert(j.error ?? "Gagal"); return }
      setActionType(null); setActionNote(""); setDetailOpen(false); refetch()
    } finally { setActionSaving(false) }
  }

  const handleRealize = async () => {
    if (!selected) return
    setRealizeSaving(true)
    try {
      const res = await fetch(`/api/sdm/overtime-requests/${selected.id}/realize`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(realizeForm),
      })
      const j = await res.json()
      if (!res.ok) { alert(j.error ?? "Gagal"); return }
      setRealizeOpen(false); setDetailOpen(false); refetch()
    } finally { setRealizeSaving(false) }
  }

  const handleRecalculate = async () => {
    if (!selected) return
    if (!confirm("Hitung ulang uang lembur berdasarkan setting terkini? Nilai lama akan ditimpa.")) return
    setRecalcSaving(true)
    try {
      const res = await fetch(`/api/sdm/overtime-requests/${selected.id}/recalculate`, {
        method: "POST", headers: { "Content-Type": "application/json" },
      })
      const j = await res.json()
      if (!res.ok) { alert(j.error ?? "Gagal"); return }
      alert(j.message ?? "Berhasil dihitung ulang")
      // Refresh detail
      const detailRes = await fetch(`/api/sdm/overtime-requests/${selected.id}`)
      if (detailRes.ok) setSelected(await detailRes.json())
      refetch()
    } finally { setRecalcSaving(false) }
  }

  const handleDelete = async () => {
    if (!selected) return
    setDeleting(true)
    try {
      await fetch(`/api/sdm/overtime-requests/${selected.id}`, { method: "DELETE" })
      setDeleteOpen(false); refetch()
    } finally { setDeleting(false) }
  }

  const columns: Column<OvertimeRequest>[] = [
    { key: "karyawan_id", header: "Karyawan",
      cell: (r) => <div><p className="font-semibold text-sm">{r.karyawans?.nama_karyawan ?? "—"}</p><p className="text-xs font-mono" style={{ color: "var(--text-subtle)" }}>{r.karyawans?.nik}</p></div> },
    { key: "tanggal_lembur", header: "Tanggal",
      cell: (r) => <div><p className="font-mono text-sm">{formatDate(r.tanggal_lembur)}</p><p className="text-xs font-mono" style={{ color: "var(--text-subtle)" }}>{r.jam_mulai_rencana.slice(0,5)} – {r.jam_selesai_rencana.slice(0,5)}{r.is_lintas_hari ? " (+1h)" : ""}</p></div> },
    { key: "durasi_rencana_menit", header: "Durasi", cell: (r) => <span className="font-mono font-bold">{formatMenit(r.durasi_rencana_menit)}</span> },
    { key: "overtime_settings", header: "Tipe",
      cell: (r) => r.overtime_settings
        ? <Badge variant="secondary" className="text-[10px]">{r.overtime_settings.tipe_hari.replace("_", " ")}</Badge>
        : <span style={{ color: "var(--text-subtle)" }}>—</span> },
    { key: "total_uang_lembur", header: "Est. Uang",
      cell: (r) => r.total_uang_lembur ? <span className="font-mono text-sm" style={{ color: "var(--success)" }}>{formatCurrency(Number(r.total_uang_lembur))}</span> : <span style={{ color: "var(--text-subtle)" }}>—</span> },
    { key: "status", header: "Status",
      cell: (r) => <Badge variant={STATUS_LEMBUR_BADGE[r.status as StatusLembur] as "success"|"warning"|"destructive"|"secondary"|"info"}>{STATUS_LEMBUR_LABELS[r.status as StatusLembur] ?? r.status}</Badge> },
  ]

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--text-900)" }}>Pengajuan Lembur</h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-subtle)" }}>Kelola pengajuan lembur pegawai</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={refetch}><RefreshCw className="h-3.5 w-3.5" /></Button>
          <Button size="sm" onClick={() => {
            setAddErrors({})
            setForm({ karyawan_id: "", tanggal_lembur: "", jam_mulai_rencana: "", jam_selesai_rencana: "", alasan_lembur: "", pekerjaan_lembur: "", is_lintas_hari: false })
            setAddOpen(true)
          }}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />Ajukan Lembur
          </Button>
        </div>
      </div>

      {/* Filter status */}
      <div className="flex gap-2 flex-wrap">
        {["", ...Object.keys(STATUS_LEMBUR_LABELS)].map(s => (
          <button key={s} onClick={() => setFilterStatus(s)}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors"
            style={filterStatus === s ? { background: "var(--primary)", color: "#fff" } : { background: "var(--surface)", color: "var(--text-muted)", border: "1px solid var(--border)" }}>
            {s === "" ? `Semua (${list.length})` : `${STATUS_LEMBUR_LABELS[s as StatusLembur]} (${list.filter(p => p.status === s).length})`}
          </button>
        ))}
      </div>

      <DataTable data={filtered as unknown as Record<string, unknown>[]} columns={columns as unknown as Column<Record<string, unknown>>[]}
        searchKeys={[]} loading={loading}
        actions={(row: Record<string, unknown>) => {
          const r = row as unknown as OvertimeRequest
          return (
            <div className="flex items-center justify-center gap-1">
              <Button variant="ghost" size="icon" className="h-7 w-7" style={{ color: "var(--primary)" }} onClick={() => openDetail(r)}><Eye className="h-3.5 w-3.5" /></Button>
              {r.status === STATUS_LEMBUR.DRAFT && (
                <Button variant="ghost" size="icon" className="h-7 w-7" style={{ color: "var(--success)" }}
                  onClick={() => { setSelected(r); setActionType("submit"); setActionNote("") }}><Send className="h-3.5 w-3.5" /></Button>
              )}
              {isAdmin && r.status === STATUS_LEMBUR.APPROVED_HRD && (
                <Button variant="ghost" size="icon" className="h-7 w-7" style={{ color: "var(--warning)" }}
                  title="Input Realisasi"
                  onClick={() => {
                    setSelected(r)
                    setRealizeForm({ jam_mulai_aktual: r.jam_mulai_rencana.slice(0,5), jam_selesai_aktual: r.jam_selesai_rencana.slice(0,5), durasi_disetujui_menit: String(r.durasi_rencana_menit), catatan_realisasi: "" })
                    setRealizeOpen(true)
                  }}><Clock className="h-3.5 w-3.5" /></Button>
              )}
              {isAdmin && [STATUS_LEMBUR.SUBMITTED, STATUS_LEMBUR.APPROVED_SUPERVISOR].includes(r.status as never) && (
                <>
                  <Button variant="ghost" size="icon" className="h-7 w-7" style={{ color: "var(--success)" }}
                    onClick={() => { setSelected(r); setActionType("approve"); setActionNote("") }}><Check className="h-3.5 w-3.5" /></Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" style={{ color: "var(--danger)" }}
                    onClick={() => { setSelected(r); setActionType("reject"); setActionNote("") }}><X className="h-3.5 w-3.5" /></Button>
                </>
              )}
              {![STATUS_LEMBUR.APPROVED_HRD, STATUS_LEMBUR.REALIZED, STATUS_LEMBUR.CANCELLED].includes(r.status as never) && (
                <Button variant="ghost" size="icon" className="h-7 w-7" style={{ color: "var(--danger)" }}
                  onClick={() => { setSelected(r); setDeleteOpen(true) }}><Trash2 className="h-3.5 w-3.5" /></Button>
              )}
            </div>
          )
        }}
      />

      {/* Modal: Ajukan Lembur */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Ajukan Lembur" size="lg"
        footer={<><Button variant="outline" onClick={() => setAddOpen(false)}>Batal</Button><Button onClick={handleAdd} disabled={saving}>{saving ? "Menyimpan..." : "Simpan Draft"}</Button></>}
      >
        {addErrors._ && <div className="mb-4 rounded-lg px-4 py-3 text-sm" style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>{addErrors._}</div>}
        {Object.entries(addErrors).filter(([k, v]) => k !== "_" && v).length > 0 && !addErrors._ && (
          <div className="mb-4 rounded-lg px-4 py-3 text-sm" style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>Mohon lengkapi semua field yang wajib.</div>
        )}
        <div className="space-y-4">
          {isAdmin ? (
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Karyawan *</label>
              <SearchableSelect label="" options={karyawanOpts} value={form.karyawan_id}
                onChange={(v: string) => setForm(f => ({ ...f, karyawan_id: v }))} placeholder="Pilih karyawan..." />
              {addErrors.karyawan_id && <p className="text-xs" style={{ color: "var(--danger)" }}>{addErrors.karyawan_id}</p>}
            </div>
          ) : (
            <div className="rounded-lg px-4 py-3" style={{ background: "var(--surface-muted)", border: "1px solid var(--border)" }}>
              <p className="text-xs" style={{ color: "var(--text-subtle)" }}>Pegawai</p>
              <p className="text-sm font-semibold mt-0.5">{(karyawans ?? []).find(k => k.id === authUser?.karyawan_id)?.nama_karyawan ?? "Karyawan Anda"}</p>
            </div>
          )}
          <TextField label="Tanggal Lembur *" error={addErrors.tanggal_lembur} type="date" value={form.tanggal_lembur}
            onChange={e => setForm(f => ({ ...f, tanggal_lembur: e.target.value }))} />
          <div className="grid grid-cols-3 gap-4">
            <TextField label="Jam Mulai *" error={addErrors.jam_mulai_rencana} type="time" value={form.jam_mulai_rencana}
              onChange={e => setForm(f => ({ ...f, jam_mulai_rencana: e.target.value }))} />
            <TextField label="Jam Selesai *" error={addErrors.jam_selesai_rencana} type="time" value={form.jam_selesai_rencana}
              onChange={e => setForm(f => ({ ...f, jam_selesai_rencana: e.target.value }))} />
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Lintas Hari</label>
              <label className="flex items-center gap-2 cursor-pointer h-8">
                <input type="checkbox" checked={!!form.is_lintas_hari}
                  onChange={e => setForm(f => ({ ...f, is_lintas_hari: e.target.checked }))}
                  className="h-4 w-4" style={{ accentColor: "var(--primary)" }} />
                <span className="text-sm">Ya (selesai +1 hari)</span>
              </label>
            </div>
          </div>
          <TextareaField label="Alasan Lembur *" error={addErrors.alasan_lembur} value={form.alasan_lembur}
            onChange={e => setForm(f => ({ ...f, alasan_lembur: e.target.value }))} />
          <TextareaField label="Pekerjaan yang Dilakukan"  value={form.pekerjaan_lembur}
            onChange={e => setForm(f => ({ ...f, pekerjaan_lembur: e.target.value }))} />
        </div>
      </Modal>

      {/* Modal: Detail */}
      <Modal open={detailOpen} onClose={() => setDetailOpen(false)} title="Detail Pengajuan Lembur" size="lg"
        footer={
          <div className="flex gap-2 flex-wrap">
            {selected?.status === STATUS_LEMBUR.DRAFT && (
              <Button variant="secondary" size="sm" onClick={() => { setActionType("submit"); setActionNote("") }}>
                <Send className="h-3.5 w-3.5 mr-1.5" />Submit ke Atasan
              </Button>
            )}
            {isAdmin && selected?.status === STATUS_LEMBUR.SUBMITTED && (
              <>
                <Button size="sm" style={{ background: "var(--success)", color: "#fff" }} onClick={() => { setActionType("approve"); setActionNote("") }}>
                  <Check className="h-3.5 w-3.5 mr-1.5" />Setujui (Atasan)
                </Button>
                <Button variant="destructive" size="sm" onClick={() => { setActionType("reject"); setActionNote("") }}>Tolak</Button>
              </>
            )}
            {isAdmin && selected?.status === STATUS_LEMBUR.APPROVED_SUPERVISOR && (
              <>
                <Button size="sm" style={{ background: "var(--success)", color: "#fff" }} onClick={() => { setActionType("approve"); setActionNote("") }}>
                  <Check className="h-3.5 w-3.5 mr-1.5" />Setujui (HRD Final)
                </Button>
                <Button variant="destructive" size="sm" onClick={() => { setActionType("reject"); setActionNote("") }}>Tolak HRD</Button>
              </>
            )}
            {isAdmin && selected?.status === STATUS_LEMBUR.APPROVED_HRD && (
              <Button variant="secondary" size="sm" onClick={() => {
                setRealizeForm({ jam_mulai_aktual: selected.jam_mulai_rencana.slice(0,5), jam_selesai_aktual: selected.jam_selesai_rencana.slice(0,5), durasi_disetujui_menit: String(selected.durasi_rencana_menit), catatan_realisasi: "" })
                setRealizeOpen(true)
              }}>
                <Clock className="h-3.5 w-3.5 mr-1.5" />Input Realisasi
              </Button>
            )}
            {isAdmin && [STATUS_LEMBUR.APPROVED_HRD, STATUS_LEMBUR.REALIZED].includes((selected?.status ?? "") as never) && (
              <Button variant="outline" size="sm" disabled={recalcSaving} onClick={handleRecalculate}
                style={{ color: "var(--primary)", borderColor: "var(--primary)" }}>
                {recalcSaving ? "Menghitung..." : "Hitung Ulang Uang Lembur"}
              </Button>
            )}
            {![STATUS_LEMBUR.APPROVED_HRD, STATUS_LEMBUR.REALIZED, STATUS_LEMBUR.CANCELLED].includes((selected?.status ?? "") as never) && (
              <Button variant="outline" size="sm" onClick={() => { setActionType("cancel"); setActionNote("") }}>Batalkan</Button>
            )}
            <Button onClick={() => setDetailOpen(false)}>Tutup</Button>
          </div>
        }
      >
        {detailLoading ? (
          <div className="py-8 text-center text-sm" style={{ color: "var(--text-subtle)" }}>Memuat detail...</div>
        ) : selected && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Karyawan",    value: `${selected.karyawans?.nama_karyawan} (${selected.karyawans?.nik})` },
                { label: "Tanggal",     value: formatDateLong(selected.tanggal_lembur) },
                { label: "Jam Rencana", value: `${selected.jam_mulai_rencana.slice(0,5)} – ${selected.jam_selesai_rencana.slice(0,5)}${selected.is_lintas_hari ? " (+1 hari)" : ""}` },
                { label: "Durasi Rencana", value: formatMenit(selected.durasi_rencana_menit) },
                ...(selected.jam_mulai_aktual ? [
                  { label: "Jam Aktual", value: `${selected.jam_mulai_aktual.slice(0,5)} – ${selected.jam_selesai_aktual?.slice(0,5)}` },
                  { label: "Durasi Aktual", value: formatMenit(selected.durasi_aktual_menit) },
                ] : []),
                ...(selected.durasi_disetujui_menit ? [{ label: "Durasi Disetujui", value: formatMenit(selected.durasi_disetujui_menit) }] : []),
                ...(selected.total_uang_lembur ? [{ label: "Estimasi Uang Lembur", value: formatCurrency(Number(selected.total_uang_lembur)) }] : []),
              ].map(item => (
                <div key={item.label} className="rounded-lg p-3" style={{ background: "var(--surface-muted)", border: "1px solid var(--border)" }}>
                  <p className="text-xs" style={{ color: "var(--text-subtle)" }}>{item.label}</p>
                  <p className="text-sm font-semibold mt-0.5">{item.value}</p>
                </div>
              ))}
            </div>
            {selected.alasan_lembur && (
              <div className="rounded-lg p-3" style={{ background: "var(--surface-muted)", border: "1px solid var(--border)" }}>
                <p className="text-xs" style={{ color: "var(--text-subtle)" }}>Alasan</p>
                <p className="text-sm mt-0.5">{selected.alasan_lembur}</p>
              </div>
            )}
            {/* Kalkulasi detail — hanya tampil jika sudah approved HRD */}
            {selected.total_uang_lembur !== null && (selected as unknown as { calculation_detail?: object }).calculation_detail && (
              <div className="rounded-lg p-3 text-xs font-mono" style={{ background: "var(--surface-muted)", border: "1px solid var(--border)" }}>
                <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: "var(--text-subtle)" }}>Detail Kalkulasi</p>
                <pre className="whitespace-pre-wrap text-[11px]" style={{ color: "var(--text-900)" }}>
                  {JSON.stringify((selected as unknown as { calculation_detail: object }).calculation_detail, null, 2)}
                </pre>
              </div>
            )}
            <div className="rounded-lg p-3" style={{ background: "var(--surface-muted)", border: "1px solid var(--border)" }}>
              <p className="text-xs" style={{ color: "var(--text-subtle)" }}>Status</p>
              <div className="mt-1">
                <Badge variant={STATUS_LEMBUR_BADGE[selected.status as StatusLembur] as "success"|"warning"|"destructive"|"secondary"|"info"} className="text-sm px-3">
                  {STATUS_LEMBUR_LABELS[selected.status as StatusLembur] ?? selected.status}
                </Badge>
              </div>
            </div>
            {/* Detail kalkulasi */}
            {selected.overtime_approvals && selected.overtime_approvals.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--text-subtle)" }}>Riwayat Approval</p>
                <div className="space-y-2">
                  {selected.overtime_approvals.map(ap => (
                    <div key={ap.id} className="flex items-start gap-3 rounded-lg p-3" style={{ background: "var(--surface-muted)", border: "1px solid var(--border)" }}>
                      <Badge variant={ap.status === "approved" ? "success" : ap.status === "rejected" ? "destructive" : "warning"} className="text-[10px] mt-0.5 shrink-0">Level {ap.approval_level}</Badge>
                      <div className="flex-1">
                        <p className="text-xs font-semibold">{ap.approver_role === "atasan" ? "Atasan Langsung" : "HRD"} — {ap.status === "approved" ? "Disetujui" : ap.status === "rejected" ? "Ditolak" : "Menunggu"}</p>
                        {ap.approver_nama && <p className="text-xs mt-0.5 font-medium" style={{ color: "var(--primary)" }}>Ditugaskan ke: {ap.approver_nama} {ap.approver_jabatan ? `(${ap.approver_jabatan})` : ""}</p>}
                        {ap.diproses_oleh_nama && ap.status !== "pending" && <p className="text-xs mt-0.5" style={{ color: "var(--text-subtle)" }}>Diproses oleh: <strong>{ap.diproses_oleh_nama}</strong></p>}
                        {ap.note && <p className="text-xs mt-0.5" style={{ color: "var(--text-subtle)" }}>{ap.note}</p>}
                        {ap.approved_at && <p className="text-[10px] mt-0.5 font-mono" style={{ color: "var(--text-subtle)" }}>{formatDate(ap.approved_at)}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Modal: Realisasi */}
      <Modal open={realizeOpen} onClose={() => setRealizeOpen(false)} title="Input Realisasi Lembur" size="md"
        footer={<><Button variant="outline" onClick={() => setRealizeOpen(false)}>Batal</Button><Button onClick={handleRealize} disabled={realizeSaving}>{realizeSaving ? "Menyimpan..." : "Simpan Realisasi"}</Button></>}
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <TextField label="Jam Mulai Aktual" type="time" value={realizeForm.jam_mulai_aktual}
              onChange={e => setRealizeForm(f => ({ ...f, jam_mulai_aktual: e.target.value }))} />
            <TextField label="Jam Selesai Aktual" type="time" value={realizeForm.jam_selesai_aktual}
              onChange={e => setRealizeForm(f => ({ ...f, jam_selesai_aktual: e.target.value }))} />
          </div>
          <TextField label="Durasi Disetujui (menit)" type="number" value={realizeForm.durasi_disetujui_menit}
            onChange={e => setRealizeForm(f => ({ ...f, durasi_disetujui_menit: e.target.value }))} />
          <TextareaField label="Catatan Realisasi" value={realizeForm.catatan_realisasi}
            onChange={e => setRealizeForm(f => ({ ...f, catatan_realisasi: e.target.value }))} />
        </div>
      </Modal>

      {/* Action Confirm */}
      <Modal open={!!actionType} onClose={() => setActionType(null)}
        title={actionType === "approve" ? "Setujui Lembur" : actionType === "reject" ? "Tolak Lembur" : actionType === "submit" ? "Submit Lembur" : "Batalkan Lembur"} size="sm"
        footer={<><Button variant="outline" onClick={() => setActionType(null)}>Batal</Button>
          <Button onClick={handleAction} disabled={actionSaving}
            style={actionType === "approve" ? { background: "var(--success)", color: "#fff" } : actionType === "reject" ? { background: "var(--danger)", color: "#fff" } : undefined}>
            {actionSaving ? "Memproses..." : "Konfirmasi"}
          </Button></>}
      >
        <div className="space-y-3">
          {selected && <p className="text-sm" style={{ color: "var(--text-subtle)" }}>{selected.karyawans?.nama_karyawan} — {formatDate(selected.tanggal_lembur)} ({formatMenit(selected.durasi_rencana_menit)})</p>}
          {(actionType === "reject" || actionType === "cancel") && (
            <TextareaField label="Catatan / Alasan" required value={actionNote} onChange={e => setActionNote(e.target.value)} />
          )}
          {actionType === "approve" && (
            <TextareaField label="Catatan (opsional)" value={actionNote} onChange={e => setActionNote(e.target.value)} />
          )}
        </div>
      </Modal>

      <ConfirmDelete open={deleteOpen} onClose={() => setDeleteOpen(false)} onConfirm={handleDelete} loading={deleting}
        description={`Hapus pengajuan lembur ${selected?.karyawans?.nama_karyawan ?? ""}?`} />
    </div>
  )
}

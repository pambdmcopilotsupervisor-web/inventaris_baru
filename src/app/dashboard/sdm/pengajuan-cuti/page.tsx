"use client"
import React, { useState } from "react"
import { DataTable, Column } from "@/components/ui/data-table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Modal } from "@/components/ui/modal"
import { ConfirmDelete } from "@/components/ui/confirm-delete"
import { TextField, SelectField, TextareaField } from "@/components/ui/form-field"
import { SearchableSelect } from "@/components/ui/searchable-select"
import { Plus, Eye, Trash2, RefreshCw, Send, Check, X } from "lucide-react"
import { formatDate, formatDateLong } from "@/lib/utils"
import { useApi } from "@/hooks/useApi"
import { useAuth } from "@/contexts/AuthContext"
import { STATUS_CUTI_LABELS, STATUS_CUTI_BADGE, StatusCuti, STATUS_CUTI } from "@/lib/leave"

/* ─── Types ─────────────────────────────────────────────────────── */
interface PengajuanCuti {
  id: number; karyawan_id: number; jenis_cuti_id: number
  tanggal_mulai: string; tanggal_selesai: string; jumlah_hari: number
  alasan: string; alamat_selama_cuti: string | null; lampiran: string | null
  status: string
  karyawans?: { id: number; nik: string; nama_karyawan: string; jabatan: string; divisi_id: number | null }
  jenis_cutis?: { id: number; kode_cuti: string; nama_cuti: string; potong_saldo_cuti: boolean }
  approvals?: {
    id: number; approver_role: string; approval_level: number; status: string
    note: string | null; approved_at: string | null
    approver_nama?: string | null; approver_jabatan?: string | null
    diproses_oleh_nama?: string | null
  }[]
}
interface Karyawan { id: number; nik: string; nama_karyawan: string; jabatan: string; status_karyawan: string | null }
interface JenisCuti { id: number; kode_cuti: string; nama_cuti: string; jatah_hari_default: number; status: string; membutuhkan_lampiran: boolean; potong_saldo_cuti: boolean }

const STATUS_FILTER = ["", ...Object.keys(STATUS_CUTI_LABELS)]

export default function PengajuanCutiPage() {
  const { user: authUser } = useAuth()
  const isAdminOrHrd = authUser?.role?.toLowerCase() === "admin" || authUser?.role?.toLowerCase() === "hrd"

  const { data, loading, refetch }  = useApi<PengajuanCuti[]>("/api/sdm/pengajuan-cuti")
  const { data: karyawans }         = useApi<Karyawan[]>("/api/karyawan")
  const { data: jenisCutis }        = useApi<JenisCuti[]>("/api/sdm/jenis-cuti")
  const list = data ?? []

  const [filterStatus, setFilterStatus] = useState("")
  const filtered = filterStatus ? list.filter(p => p.status === filterStatus) : list

  /* ── Add form ────────────────────────────────────────────────── */
  const [addOpen, setAddOpen]   = useState(false)
  const [form, setForm]         = useState({ karyawan_id: "", jenis_cuti_id: "", tanggal_mulai: "", tanggal_selesai: "", alasan: "", alamat_selama_cuti: "" })
  const [addErrors, setAddErrors] = useState<Record<string, string>>({})
  const [saving, setSaving]     = useState(false)
  const [jumlahHari, setJumlahHari] = useState<number | null>(null)
  const [loadingHari, setLoadingHari] = useState(false)

  /* ── Detail modal ────────────────────────────────────────────── */
  const [detailOpen, setDetailOpen] = useState(false)
  const [selected, setSelected]     = useState<PengajuanCuti | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const openDetail = async (row: PengajuanCuti) => {
    setSelected(row)
    setDetailOpen(true)
    setDetailLoading(true)
    try {
      const res = await fetch(`/api/sdm/pengajuan-cuti/${row.id}`)
      if (res.ok) {
        const detail = await res.json()
        setSelected(detail)
      }
    } finally {
      setDetailLoading(false)
    }
  }

  /* ── Action modals ───────────────────────────────────────────── */
  const [actionType, setActionType]   = useState<"approve" | "reject" | "submit" | "cancel" | null>(null)
  const [actionNote, setActionNote]   = useState("")
  const [actionSaving, setActionSaving] = useState(false)
  const [deleteOpen, setDeleteOpen]   = useState(false)
  const [deleting, setDeleting]       = useState(false)

  const karyawanOpts = (karyawans ?? [])
    .filter(k => k.status_karyawan !== "Pensiun" && k.status_karyawan !== "Nonaktif")
    .map(k => ({ value: String(k.id), label: `${k.nik} — ${k.nama_karyawan}`, description: k.jabatan }))
  const jenisCutiOpts = (jenisCutis ?? []).filter(j => j.status === "aktif")
    .map(j => ({ value: String(j.id), label: `${j.kode_cuti} — ${j.nama_cuti}` }))

  /* ── Hitung hari kerja (preview) ─────────────────────────────── */
  const hitungPreview = async (kId: string, jenis: string, mulai: string, selesai: string) => {
    if (!kId || !mulai || !selesai) { setJumlahHari(null); return }
    setLoadingHari(true)
    try {
      const r = await fetch(`/api/sdm/pengajuan-cuti/hitung-hari?karyawan_id=${kId}&tanggal_mulai=${mulai}&tanggal_selesai=${selesai}`)
      if (r.ok) { const j = await r.json(); setJumlahHari(j.jumlah_hari) }
    } finally { setLoadingHari(false) }
  }

  /* ── Add submit ──────────────────────────────────────────────── */
  const handleAdd = async () => {
    const e: Record<string, string> = {}
    if (authUser?.role?.toLowerCase() === "admin" && !form.karyawan_id) e.karyawan_id = "Pilih karyawan"
    if (!form.jenis_cuti_id)  e.jenis_cuti_id  = "Pilih jenis cuti"
    if (!form.tanggal_mulai)  e.tanggal_mulai  = "Tanggal mulai wajib diisi"
    if (!form.tanggal_selesai) e.tanggal_selesai = "Tanggal selesai wajib diisi"
    if (!form.alasan.trim())  e.alasan = "Alasan wajib diisi"
    if (form.tanggal_selesai < form.tanggal_mulai) e.tanggal_selesai = "Tidak boleh sebelum tanggal mulai"
    setAddErrors(e); if (Object.keys(e).length) return
    setSaving(true)
    try {
      const res = await fetch("/api/sdm/pengajuan-cuti", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) })
      if (!res.ok) { const j = await res.json(); setAddErrors({ _: j.error ?? "Gagal" }); return }
      setAddOpen(false); refetch()
    } finally { setSaving(false) }
  }

  /* ── Workflow actions ────────────────────────────────────────── */
  const handleAction = async () => {
    if (!selected || !actionType) return
    if ((actionType === "reject") && !actionNote.trim()) { alert("Catatan wajib diisi"); return }
    setActionSaving(true)
    try {
      const url = `/api/sdm/pengajuan-cuti/${selected.id}/${actionType}`
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ note: actionNote }) })
      const j = await res.json()
      if (!res.ok) { alert(j.error ?? "Gagal"); return }
      setActionType(null); setActionNote(""); setDetailOpen(false); refetch()
    } finally { setActionSaving(false) }
  }

  const handleDelete = async () => {
    if (!selected) return
    setDeleting(true)
    try {
      await fetch(`/api/sdm/pengajuan-cuti/${selected.id}`, { method: "DELETE" })
      setDeleteOpen(false); refetch()
    } finally { setDeleting(false) }
  }

  const columns: Column<PengajuanCuti>[] = [
    { key: "karyawan_id", header: "Karyawan",
      cell: (r) => <div><p className="font-semibold text-sm">{r.karyawans?.nama_karyawan ?? "—"}</p><p className="text-xs font-mono" style={{ color: "var(--text-subtle)" }}>{r.karyawans?.nik}</p></div> },
    { key: "jenis_cuti_id", header: "Jenis Cuti",
      cell: (r) => <div><Badge variant="secondary" className="font-mono text-[10px] mr-1">{r.jenis_cutis?.kode_cuti}</Badge>{r.jenis_cutis?.nama_cuti ?? "—"}</div> },
    { key: "tanggal_mulai", header: "Periode",
      cell: (r) => <div className="font-mono text-xs"><p>{formatDate(r.tanggal_mulai)}</p><p style={{ color: "var(--text-subtle)" }}>s/d {formatDate(r.tanggal_selesai)}</p></div> },
    { key: "jumlah_hari", header: "Hari", cell: (r) => <span className="font-mono font-bold">{r.jumlah_hari}h</span> },
    { key: "status", header: "Status",
      cell: (r) => <Badge variant={STATUS_CUTI_BADGE[r.status as StatusCuti] as "success"|"warning"|"destructive"|"secondary"|"info"}>{STATUS_CUTI_LABELS[r.status as StatusCuti] ?? r.status}</Badge> },
  ]

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--text-900)" }}>Pengajuan Cuti</h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-subtle)" }}>Kelola pengajuan cuti pegawai</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={refetch}><RefreshCw className="h-3.5 w-3.5" /></Button>
          <Button size="sm" onClick={() => { setAddErrors({}); setForm({ karyawan_id: "", jenis_cuti_id: "", tanggal_mulai: "", tanggal_selesai: "", alasan: "", alamat_selama_cuti: "" }); setJumlahHari(null); setAddOpen(true) }}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />Ajukan Cuti
          </Button>
        </div>
      </div>

      {/* Filter Status */}
      <div className="flex gap-2 flex-wrap">
        {["", ...Object.keys(STATUS_CUTI_LABELS)].map(s => (
          <button key={s} onClick={() => setFilterStatus(s)}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors"
            style={filterStatus === s ? { background: "var(--primary)", color: "#fff" } : { background: "var(--surface)", color: "var(--text-muted)", border: "1px solid var(--border)" }}>
            {s === "" ? `Semua (${list.length})` : `${STATUS_CUTI_LABELS[s as StatusCuti]} (${list.filter(p => p.status === s).length})`}
          </button>
        ))}
      </div>

      <DataTable data={filtered as unknown as Record<string, unknown>[]} columns={columns as unknown as Column<Record<string, unknown>>[]}
        searchKeys={[]} loading={loading}
        actions={(row: Record<string, unknown>) => {
          const r = row as unknown as PengajuanCuti
          return (
            <div className="flex items-center justify-center gap-1">
              <Button variant="ghost" size="icon" className="h-7 w-7" style={{ color: "var(--primary)" }}
                onClick={() => openDetail(r)}><Eye className="h-3.5 w-3.5" /></Button>
              {r.status === STATUS_CUTI.DRAFT && (
                <Button variant="ghost" size="icon" className="h-7 w-7" style={{ color: "var(--success)" }}
                  onClick={() => { setSelected(r); setActionType("submit"); setActionNote("") }}>
                  <Send className="h-3.5 w-3.5" />
                </Button>
              )}
              {isAdminOrHrd && [STATUS_CUTI.SUBMITTED, STATUS_CUTI.APPROVED_SUPERVISOR].includes(r.status as never) && (
                <>
                  <Button variant="ghost" size="icon" className="h-7 w-7" style={{ color: "var(--success)" }}
                    onClick={() => { setSelected(r); setActionType("approve"); setActionNote("") }}><Check className="h-3.5 w-3.5" /></Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" style={{ color: "var(--danger)" }}
                    onClick={() => { setSelected(r); setActionType("reject"); setActionNote("") }}><X className="h-3.5 w-3.5" /></Button>
                </>
              )}
              {![STATUS_CUTI.APPROVED_HRD, STATUS_CUTI.CANCELLED].includes(r.status as never) && (
                <Button variant="ghost" size="icon" className="h-7 w-7" style={{ color: "var(--danger)" }}
                  onClick={() => { setSelected(r); setDeleteOpen(true) }}><Trash2 className="h-3.5 w-3.5" /></Button>
              )}
            </div>
          )
        }}
      />

      {/* ── Modal: Ajukan Cuti ────────────────────────────────── */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Ajukan Cuti" size="lg"
        footer={<><Button variant="outline" onClick={() => setAddOpen(false)}>Batal</Button><Button onClick={handleAdd} disabled={saving}>{saving ? "Menyimpan..." : "Simpan Draft"}</Button></>}
      >
        {addErrors._ && <div className="mb-4 rounded-lg px-4 py-3 text-sm" style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>{addErrors._}</div>}
        {Object.entries(addErrors).filter(([k, v]) => k !== "_" && v).length > 0 && !addErrors._ && (
          <div className="mb-4 rounded-lg px-4 py-3 text-sm" style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>
            Mohon lengkapi semua field yang wajib diisi sebelum menyimpan.
          </div>
        )}
        <div className="space-y-4">
          {/* Hanya admin yang bisa pilih karyawan lain */}
          {authUser?.role?.toLowerCase() === "admin" ? (
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Karyawan *</label>
              <SearchableSelect label="" options={karyawanOpts} value={form.karyawan_id}
                onChange={(v: string) => { setForm(f => ({ ...f, karyawan_id: v })); hitungPreview(v, form.jenis_cuti_id, form.tanggal_mulai, form.tanggal_selesai) }}
                placeholder="Pilih karyawan..." />
              {addErrors.karyawan_id && <p className="text-xs" style={{ color: "var(--danger)" }}>{addErrors.karyawan_id}</p>}
            </div>
          ) : (
            <div className="rounded-lg px-4 py-3" style={{ background: "var(--surface-muted)", border: "1px solid var(--border)" }}>
              <p className="text-xs" style={{ color: "var(--text-subtle)" }}>Pengaju</p>
              <p className="text-sm font-semibold mt-0.5" style={{ color: "var(--text-900)" }}>
                {(karyawans ?? []).find(k => k.id === authUser?.karyawan_id)?.nama_karyawan ?? "Karyawan Anda"}
              </p>
              <p className="text-xs mt-0.5" style={{ color: "var(--text-subtle)" }}>Pengajuan disimpan atas nama Anda</p>
            </div>
          )}
          <SelectField label="Jenis Cuti *" error={addErrors.jenis_cuti_id} value={form.jenis_cuti_id}
            placeholder="— Pilih Jenis Cuti —" options={jenisCutiOpts}
            onChange={e => { setForm(f => ({ ...f, jenis_cuti_id: e.target.value })); hitungPreview(form.karyawan_id, e.target.value, form.tanggal_mulai, form.tanggal_selesai) }} />
          <div className="grid grid-cols-2 gap-4">
            <TextField label="Tanggal Mulai *" error={addErrors.tanggal_mulai} type="date" value={form.tanggal_mulai}
              onChange={e => { setForm(f => ({ ...f, tanggal_mulai: e.target.value })); hitungPreview(form.karyawan_id, form.jenis_cuti_id, e.target.value, form.tanggal_selesai) }} />
            <TextField label="Tanggal Selesai *" error={addErrors.tanggal_selesai} type="date" value={form.tanggal_selesai}
              onChange={e => { setForm(f => ({ ...f, tanggal_selesai: e.target.value })); hitungPreview(form.karyawan_id, form.jenis_cuti_id, form.tanggal_mulai, e.target.value) }} />
          </div>
          {jumlahHari !== null && (
            <div className="rounded-lg px-4 py-2 text-sm" style={{ background: "var(--primary-light)", color: "var(--primary)" }}>
              {loadingHari ? "Menghitung hari kerja..." : `Jumlah hari kerja: ${jumlahHari} hari`}
            </div>
          )}
          <TextareaField label="Alasan *" value={form.alasan} error={addErrors.alasan} onChange={e => setForm(f => ({ ...f, alasan: e.target.value }))} />
          <TextField label="Alamat Selama Cuti (opsional)" value={form.alamat_selama_cuti}
            onChange={e => setForm(f => ({ ...f, alamat_selama_cuti: e.target.value }))} />
        </div>
      </Modal>

      {/* ── Modal: Detail Pengajuan ───────────────────────────── */}
      <Modal open={detailOpen} onClose={() => setDetailOpen(false)} title="Detail Pengajuan Cuti" size="lg"
        footer={
          <div className="flex gap-2 flex-wrap">
            {selected?.status === STATUS_CUTI.DRAFT && (
              <Button variant="secondary" size="sm" onClick={() => { setActionType("submit"); setActionNote("") }}>
                <Send className="h-3.5 w-3.5 mr-1.5" />Submit ke Atasan
              </Button>
            )}
            {selected?.status === STATUS_CUTI.SUBMITTED && isAdminOrHrd && (
              <>
                <Button size="sm" style={{ background: "var(--success)", color: "#fff" }} onClick={() => { setActionType("approve"); setActionNote("") }}>
                  <Check className="h-3.5 w-3.5 mr-1.5" />Setujui (Atasan)
                </Button>
                <Button variant="destructive" size="sm" onClick={() => { setActionType("reject"); setActionNote("") }}>
                  <X className="h-3.5 w-3.5 mr-1.5" />Tolak
                </Button>
              </>
            )}
            {selected?.status === STATUS_CUTI.APPROVED_SUPERVISOR && isAdminOrHrd && (
              <>
                <Button size="sm" style={{ background: "var(--success)", color: "#fff" }} onClick={() => { setActionType("approve"); setActionNote("") }}>
                  <Check className="h-3.5 w-3.5 mr-1.5" />Setujui (HRD Final)
                </Button>
                <Button variant="destructive" size="sm" onClick={() => { setActionType("reject"); setActionNote("") }}>
                  <X className="h-3.5 w-3.5 mr-1.5" />Tolak HRD
                </Button>
              </>
            )}
            {![STATUS_CUTI.APPROVED_HRD, STATUS_CUTI.CANCELLED].includes((selected?.status ?? "") as never) && (
              <Button variant="outline" size="sm" onClick={() => { setActionType("cancel"); setActionNote("") }}>
                Batalkan
              </Button>
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
                { label: "Karyawan",      value: `${selected.karyawans?.nama_karyawan} (${selected.karyawans?.nik})` },
                { label: "Jabatan",       value: selected.karyawans?.jabatan ?? "—" },
                { label: "Jenis Cuti",    value: `${selected.jenis_cutis?.kode_cuti} — ${selected.jenis_cutis?.nama_cuti}` },
                { label: "Jumlah Hari",   value: `${selected.jumlah_hari} hari kerja` },
                { label: "Tanggal Mulai", value: formatDateLong(selected.tanggal_mulai) },
                { label: "Tanggal Selesai", value: formatDateLong(selected.tanggal_selesai) },
              ].map(item => (
                <div key={item.label} className="rounded-lg p-3" style={{ background: "var(--surface-muted)", border: "1px solid var(--border)" }}>
                  <p className="text-xs" style={{ color: "var(--text-subtle)" }}>{item.label}</p>
                  <p className="text-sm font-semibold mt-0.5" style={{ color: "var(--text-900)" }}>{item.value}</p>
                </div>
              ))}
            </div>
            <div className="rounded-lg p-3 flex items-center gap-3" style={{ background: "var(--surface-muted)", border: "1px solid var(--border)" }}>
              <div>
                <p className="text-xs" style={{ color: "var(--text-subtle)" }}>Status</p>
                <div className="mt-1">
                  <Badge variant={STATUS_CUTI_BADGE[selected.status as StatusCuti] as "success"|"warning"|"destructive"|"secondary"|"info"} className="text-sm px-3">
                    {STATUS_CUTI_LABELS[selected.status as StatusCuti] ?? selected.status}
                  </Badge>
                </div>
              </div>
            </div>
            {selected.alasan && (
              <div className="rounded-lg p-3" style={{ background: "var(--surface-muted)", border: "1px solid var(--border)" }}>
                <p className="text-xs" style={{ color: "var(--text-subtle)" }}>Alasan</p>
                <p className="text-sm mt-0.5" style={{ color: "var(--text-900)" }}>{selected.alasan}</p>
              </div>
            )}
            {/* Riwayat approval */}
            {selected.approvals && selected.approvals.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--text-subtle)" }}>Riwayat Approval</p>
                <div className="space-y-2">
                  {selected.approvals.map(ap => (
                    <div key={ap.id} className="flex items-start gap-3 rounded-lg p-3" style={{ background: "var(--surface-muted)", border: "1px solid var(--border)" }}>
                      <Badge variant={ap.status === "approved" ? "success" : ap.status === "rejected" ? "destructive" : "warning"} className="text-[10px] mt-0.5 shrink-0">
                        Level {ap.approval_level}
                      </Badge>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold" style={{ color: "var(--text-900)" }}>
                          {ap.approver_role === "atasan" ? "Atasan Langsung" : "HRD"} — {ap.status === "approved" ? "Disetujui" : ap.status === "rejected" ? "Ditolak" : "Menunggu"}
                        </p>
                        {/* Tampilkan nama approver */}
                        {ap.approver_nama && (
                          <p className="text-xs mt-0.5 font-medium" style={{ color: "var(--primary)" }}>
                            Ditugaskan ke: {ap.approver_nama} {ap.approver_jabatan ? `(${ap.approver_jabatan})` : ""}
                          </p>
                        )}
                        {ap.diproses_oleh_nama && ap.status !== "pending" && (
                          <p className="text-xs mt-0.5" style={{ color: "var(--text-subtle)" }}>
                            Diproses oleh: <strong>{ap.diproses_oleh_nama}</strong>
                          </p>
                        )}
                        {!ap.approver_nama && ap.status === "pending" && (
                          <p className="text-xs mt-0.5" style={{ color: "var(--text-subtle)" }}>Menunggu penugasan approver</p>
                        )}
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
      <Modal open={!!actionType && actionType !== null} onClose={() => setActionType(null)}
        title={actionType === "approve" ? "Setujui Pengajuan" : actionType === "reject" ? "Tolak Pengajuan" : actionType === "submit" ? "Submit Pengajuan" : "Batalkan Pengajuan"}
        size="sm"
        footer={<><Button variant="outline" onClick={() => setActionType(null)}>Batal</Button>
          <Button onClick={handleAction} disabled={actionSaving}
            style={actionType === "approve" ? { background: "var(--success)", color: "#fff" } : actionType === "reject" ? { background: "var(--danger)", color: "#fff" } : undefined}>
            {actionSaving ? "Memproses..." : "Konfirmasi"}
          </Button></>}
      >
        <div className="space-y-3">
          {selected && <p className="text-sm" style={{ color: "var(--text-subtle)" }}>{selected.karyawans?.nama_karyawan} — {selected.jenis_cutis?.nama_cuti} ({selected.jumlah_hari} hari)</p>}
          {(actionType === "reject" || actionType === "cancel") && (
            <TextareaField label="Catatan / Alasan" required value={actionNote} onChange={e => setActionNote(e.target.value)} />
          )}
          {actionType === "approve" && (
            <TextareaField label="Catatan (opsional)" value={actionNote} onChange={e => setActionNote(e.target.value)} />
          )}
        </div>
      </Modal>

      <ConfirmDelete open={deleteOpen} onClose={() => setDeleteOpen(false)} onConfirm={handleDelete} loading={deleting}
        description={`Hapus pengajuan cuti ${selected?.karyawans?.nama_karyawan ?? ""}?`} />
    </div>
  )
}

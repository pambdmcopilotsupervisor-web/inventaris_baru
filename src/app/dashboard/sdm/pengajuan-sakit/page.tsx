"use client"
import React, { useState, useRef } from "react"
import { DataTable, Column } from "@/components/ui/data-table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Modal } from "@/components/ui/modal"
import { ConfirmDelete } from "@/components/ui/confirm-delete"
import { TextField, TextareaField } from "@/components/ui/form-field"
import { SearchableSelect } from "@/components/ui/searchable-select"
import { Plus, Eye, Trash2, RefreshCw, Send, Check, X, Upload, FileText } from "lucide-react"
import { formatDate, formatDateLong } from "@/lib/utils"
import { useApi } from "@/hooks/useApi"
import { useAuth } from "@/contexts/AuthContext"
import { STATUS_SAKIT_LABELS, STATUS_SAKIT_BADGE, StatusSakit, STATUS_SAKIT } from "@/lib/sakit"

interface PengajuanSakit {
  id: number; karyawan_id: number; tanggal_mulai: string; tanggal_selesai: string
  jumlah_hari: number; keterangan_sakit: string | null; nama_dokter: string | null
  nama_fasilitas_kesehatan: string | null; nomor_surat_sakit: string | null
  lampiran_path: string | null; status: string
  karyawans?: { id: number; nik: string; nama_karyawan: string; jabatan: string }
  sakit_approvals?: { id: number; approver_role: string; approval_level: number; status: string; note: string | null; approved_at: string | null; approver_nama?: string | null; approver_jabatan?: string | null; diproses_oleh_nama?: string | null }[]
}
interface Karyawan { id: number; nik: string; nama_karyawan: string; jabatan: string; status_karyawan: string | null }

export default function PengajuanSakitPage() {
  const { user: authUser } = useAuth()
  const isAdmin = authUser?.role?.toLowerCase() === "admin"

  const { data, loading, refetch }  = useApi<PengajuanSakit[]>("/api/sdm/pengajuan-sakit")
  const { data: karyawans }         = useApi<Karyawan[]>("/api/karyawan")
  const list = data ?? []

  const [filterStatus, setFilterStatus] = useState("")
  const filtered = filterStatus ? list.filter(p => p.status === filterStatus) : list

  /* ── Form state ──────────────────────────────────────────────── */
  const [addOpen, setAddOpen]   = useState(false)
  const [form, setForm]         = useState({ karyawan_id: "", tanggal_mulai: "", tanggal_selesai: "", keterangan_sakit: "", nama_dokter: "", nama_fasilitas_kesehatan: "", nomor_surat_sakit: "", lampiran_path: "" })
  const [addErrors, setAddErrors] = useState<Record<string, string>>({})
  const [saving, setSaving]     = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadedName, setUploadedName] = useState("")
  const fileRef = useRef<HTMLInputElement>(null)

  /* ── Detail / Action ─────────────────────────────────────────── */
  const [detailOpen, setDetailOpen]     = useState(false)
  const [selected, setSelected]         = useState<PengajuanSakit | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [actionType, setActionType]     = useState<"approve" | "reject" | "submit" | "cancel" | null>(null)
  const [actionNote, setActionNote]     = useState("")
  const [actionSaving, setActionSaving] = useState(false)
  const [deleteOpen, setDeleteOpen]     = useState(false)
  const [deleting, setDeleting]         = useState(false)

  const karyawanOpts = (karyawans ?? []).filter(k => k.status_karyawan !== "Pensiun" && k.status_karyawan !== "Nonaktif")
    .map(k => ({ value: String(k.id), label: `${k.nik} — ${k.nama_karyawan}`, description: k.jabatan }))

  /* ── Upload lampiran ─────────────────────────────────────────── */
  const handleUpload = async (file: File) => {
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append("file", file)
      const res = await fetch("/api/upload/sakit", { method: "POST", body: fd })
      const j = await res.json()
      if (!res.ok) { setAddErrors(e => ({ ...e, lampiran_path: j.error ?? "Upload gagal" })); return }
      setForm(f => ({ ...f, lampiran_path: j.path }))
      setUploadedName(file.name)
      setAddErrors(e => ({ ...e, lampiran_path: "" }))
    } finally { setUploading(false) }
  }

  /* ── Add submit ──────────────────────────────────────────────── */
  const handleAdd = async () => {
    const e: Record<string, string> = {}
    if (isAdmin && !form.karyawan_id) e.karyawan_id = "Pilih karyawan"
    if (!form.tanggal_mulai)   e.tanggal_mulai = "Tanggal mulai wajib diisi"
    if (!form.tanggal_selesai) e.tanggal_selesai = "Tanggal selesai wajib diisi"
    if (!form.lampiran_path)   e.lampiran_path = "Lampiran surat sakit wajib diupload"
    setAddErrors(e)
    if (Object.keys(e).filter(k => e[k]).length) return

    setSaving(true)
    try {
      const res = await fetch("/api/sdm/pengajuan-sakit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) })
      if (!res.ok) { const j = await res.json(); setAddErrors({ _: j.error ?? "Gagal" }); return }
      setAddOpen(false); refetch()
    } finally { setSaving(false) }
  }

  const openDetail = async (row: PengajuanSakit) => {
    setSelected(row); setDetailOpen(true); setDetailLoading(true)
    try {
      const res = await fetch(`/api/sdm/pengajuan-sakit/${row.id}`)
      if (res.ok) setSelected(await res.json())
    } finally { setDetailLoading(false) }
  }

  const handleAction = async () => {
    if (!selected || !actionType) return
    if (actionType === "reject" && !actionNote.trim()) { alert("Catatan penolakan wajib diisi"); return }
    setActionSaving(true)
    try {
      const res = await fetch(`/api/sdm/pengajuan-sakit/${selected.id}/${actionType}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ note: actionNote }),
      })
      const j = await res.json()
      if (!res.ok) { alert(j.error ?? "Gagal"); return }
      setActionType(null); setActionNote(""); setDetailOpen(false); refetch()
    } finally { setActionSaving(false) }
  }

  const handleDelete = async () => {
    if (!selected) return
    setDeleting(true)
    try {
      await fetch(`/api/sdm/pengajuan-sakit/${selected.id}`, { method: "DELETE" })
      setDeleteOpen(false); refetch()
    } finally { setDeleting(false) }
  }

  const columns: Column<PengajuanSakit>[] = [
    { key: "karyawan_id", header: "Karyawan",
      cell: (r) => <div><p className="font-semibold text-sm">{r.karyawans?.nama_karyawan ?? "—"}</p><p className="text-xs font-mono" style={{ color: "var(--text-subtle)" }}>{r.karyawans?.nik}</p></div> },
    { key: "tanggal_mulai", header: "Periode",
      cell: (r) => <div className="font-mono text-xs"><p>{formatDate(r.tanggal_mulai)}</p><p style={{ color: "var(--text-subtle)" }}>s/d {formatDate(r.tanggal_selesai)}</p></div> },
    { key: "jumlah_hari", header: "Hari", cell: (r) => <span className="font-mono font-bold">{r.jumlah_hari}h</span> },
    { key: "keterangan_sakit", header: "Keluhan",
      cell: (r) => <span className="text-xs" style={{ color: "var(--text-subtle)" }}>{r.keterangan_sakit?.slice(0, 40) ?? "—"}{(r.keterangan_sakit?.length ?? 0) > 40 ? "..." : ""}</span> },
    { key: "lampiran_path", header: "Lampiran",
      cell: (r) => r.lampiran_path
        ? <a href={r.lampiran_path} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs" style={{ color: "var(--primary)" }}>
            <FileText className="h-3.5 w-3.5" />Lihat
          </a>
        : <span style={{ color: "var(--text-subtle)" }}>—</span> },
    { key: "status", header: "Status",
      cell: (r) => <Badge variant={STATUS_SAKIT_BADGE[r.status as StatusSakit] as "success"|"warning"|"destructive"|"secondary"|"info"}>{STATUS_SAKIT_LABELS[r.status as StatusSakit] ?? r.status}</Badge> },
  ]

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--text-900)" }}>Pengajuan Sakit</h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-subtle)" }}>Kelola pengajuan sakit pegawai dengan lampiran surat sakit</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={refetch}><RefreshCw className="h-3.5 w-3.5" /></Button>
          <Button size="sm" onClick={() => {
            setAddErrors({}); setUploadedName("")
            setForm({ karyawan_id: "", tanggal_mulai: "", tanggal_selesai: "", keterangan_sakit: "", nama_dokter: "", nama_fasilitas_kesehatan: "", nomor_surat_sakit: "", lampiran_path: "" })
            setAddOpen(true)
          }}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />Ajukan Sakit
          </Button>
        </div>
      </div>

      {/* Filter status */}
      <div className="flex gap-2 flex-wrap">
        {["", ...Object.keys(STATUS_SAKIT_LABELS)].map(s => (
          <button key={s} onClick={() => setFilterStatus(s)}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors"
            style={filterStatus === s ? { background: "var(--primary)", color: "#fff" } : { background: "var(--surface)", color: "var(--text-muted)", border: "1px solid var(--border)" }}>
            {s === "" ? `Semua (${list.length})` : `${STATUS_SAKIT_LABELS[s as StatusSakit]} (${list.filter(p => p.status === s).length})`}
          </button>
        ))}
      </div>

      <DataTable data={filtered as unknown as Record<string, unknown>[]} columns={columns as unknown as Column<Record<string, unknown>>[]}
        searchKeys={[]} loading={loading}
        actions={(row: Record<string, unknown>) => {
          const r = row as unknown as PengajuanSakit
          return (
            <div className="flex items-center justify-center gap-1">
              <Button variant="ghost" size="icon" className="h-7 w-7" style={{ color: "var(--primary)" }} onClick={() => openDetail(r)}><Eye className="h-3.5 w-3.5" /></Button>
              {r.status === STATUS_SAKIT.DRAFT && (
                <Button variant="ghost" size="icon" className="h-7 w-7" style={{ color: "var(--success)" }}
                  onClick={() => { setSelected(r); setActionType("submit"); setActionNote("") }}><Send className="h-3.5 w-3.5" /></Button>
              )}
              {isAdmin && [STATUS_SAKIT.SUBMITTED, STATUS_SAKIT.APPROVED_SUPERVISOR].includes(r.status as never) && (
                <>
                  <Button variant="ghost" size="icon" className="h-7 w-7" style={{ color: "var(--success)" }}
                    onClick={() => { setSelected(r); setActionType("approve"); setActionNote("") }}><Check className="h-3.5 w-3.5" /></Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" style={{ color: "var(--danger)" }}
                    onClick={() => { setSelected(r); setActionType("reject"); setActionNote("") }}><X className="h-3.5 w-3.5" /></Button>
                </>
              )}
              {![STATUS_SAKIT.APPROVED_HRD, STATUS_SAKIT.CANCELLED].includes(r.status as never) && (
                <Button variant="ghost" size="icon" className="h-7 w-7" style={{ color: "var(--danger)" }}
                  onClick={() => { setSelected(r); setDeleteOpen(true) }}><Trash2 className="h-3.5 w-3.5" /></Button>
              )}
            </div>
          )
        }}
      />

      {/* Modal: Ajukan Sakit */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Ajukan Sakit" size="lg"
        footer={<><Button variant="outline" onClick={() => setAddOpen(false)}>Batal</Button><Button onClick={handleAdd} disabled={saving}>{saving ? "Menyimpan..." : "Simpan Draft"}</Button></>}
      >
        {addErrors._ && <div className="mb-4 rounded-lg px-4 py-3 text-sm" style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>{addErrors._}</div>}
        {Object.entries(addErrors).filter(([k, v]) => k !== "_" && v).length > 0 && !addErrors._ && (
          <div className="mb-4 rounded-lg px-4 py-3 text-sm" style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>
            Mohon lengkapi semua field yang wajib diisi termasuk upload lampiran surat sakit.
          </div>
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
              <p className="text-xs" style={{ color: "var(--text-subtle)" }}>Pengaju</p>
              <p className="text-sm font-semibold mt-0.5">{(karyawans ?? []).find(k => k.id === authUser?.karyawan_id)?.nama_karyawan ?? "Karyawan Anda"}</p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <TextField label="Tanggal Mulai *" error={addErrors.tanggal_mulai} type="date" value={form.tanggal_mulai}
              onChange={e => setForm(f => ({ ...f, tanggal_mulai: e.target.value }))} />
            <TextField label="Tanggal Selesai *" error={addErrors.tanggal_selesai} type="date" value={form.tanggal_selesai}
              onChange={e => setForm(f => ({ ...f, tanggal_selesai: e.target.value }))} />
          </div>

          {/* Upload Lampiran */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
              Lampiran Surat Sakit * <span className="normal-case font-normal">(PDF/JPG/PNG, maks 5 MB)</span>
            </label>
            <div
              className="rounded-lg p-4 flex items-center justify-between cursor-pointer transition-colors"
              style={{ border: `2px dashed ${addErrors.lampiran_path ? "var(--danger)" : "var(--border-strong)"}`, background: "var(--surface-muted)" }}
              onClick={() => fileRef.current?.click()}
            >
              {form.lampiran_path ? (
                <div className="flex items-center gap-2">
                  <FileText className="h-5 w-5 shrink-0" style={{ color: "var(--success)" }} />
                  <div>
                    <p className="text-sm font-semibold" style={{ color: "var(--success)" }}>{uploadedName}</p>
                    <p className="text-xs" style={{ color: "var(--text-subtle)" }}>Klik untuk ganti file</p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Upload className="h-5 w-5 shrink-0" style={{ color: "var(--text-subtle)" }} />
                  <p className="text-sm" style={{ color: "var(--text-subtle)" }}>{uploading ? "Mengupload..." : "Klik untuk upload surat sakit"}</p>
                </div>
              )}
              <Button variant="outline" size="sm" disabled={uploading} onClick={e => { e.stopPropagation(); fileRef.current?.click() }}>
                {uploading ? "Uploading..." : "Pilih File"}
              </Button>
            </div>
            {addErrors.lampiran_path && <p className="text-xs" style={{ color: "var(--danger)" }}>{addErrors.lampiran_path}</p>}
            <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f) }} />
          </div>

          <TextareaField label="Keluhan / Keterangan Sakit" value={form.keterangan_sakit}
            onChange={e => setForm(f => ({ ...f, keterangan_sakit: e.target.value }))} />
          <div className="grid grid-cols-2 gap-4">
            <TextField label="Nama Dokter" value={form.nama_dokter}
              onChange={e => setForm(f => ({ ...f, nama_dokter: e.target.value }))} />
            <TextField label="Fasilitas Kesehatan" value={form.nama_fasilitas_kesehatan}
              onChange={e => setForm(f => ({ ...f, nama_fasilitas_kesehatan: e.target.value }))} />
          </div>
          <TextField label="Nomor Surat Sakit (opsional)" value={form.nomor_surat_sakit}
            onChange={e => setForm(f => ({ ...f, nomor_surat_sakit: e.target.value }))} />
        </div>
      </Modal>

      {/* Modal: Detail */}
      <Modal open={detailOpen} onClose={() => setDetailOpen(false)} title="Detail Pengajuan Sakit" size="lg"
        footer={
          <div className="flex gap-2 flex-wrap">
            {selected?.status === STATUS_SAKIT.DRAFT && (
              <Button variant="secondary" size="sm" onClick={() => { setActionType("submit"); setActionNote("") }}>
                <Send className="h-3.5 w-3.5 mr-1.5" />Submit ke Atasan
              </Button>
            )}
            {isAdmin && selected?.status === STATUS_SAKIT.SUBMITTED && (
              <>
                <Button size="sm" style={{ background: "var(--success)", color: "#fff" }} onClick={() => { setActionType("approve"); setActionNote("") }}>
                  <Check className="h-3.5 w-3.5 mr-1.5" />Setujui (Atasan)
                </Button>
                <Button variant="destructive" size="sm" onClick={() => { setActionType("reject"); setActionNote("") }}>Tolak</Button>
              </>
            )}
            {isAdmin && selected?.status === STATUS_SAKIT.APPROVED_SUPERVISOR && (
              <>
                <Button size="sm" style={{ background: "var(--success)", color: "#fff" }} onClick={() => { setActionType("approve"); setActionNote("") }}>
                  <Check className="h-3.5 w-3.5 mr-1.5" />Setujui (HRD Final)
                </Button>
                <Button variant="destructive" size="sm" onClick={() => { setActionType("reject"); setActionNote("") }}>Tolak HRD</Button>
              </>
            )}
            {![STATUS_SAKIT.APPROVED_HRD, STATUS_SAKIT.CANCELLED].includes((selected?.status ?? "") as never) && (
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
                { label: "Karyawan",     value: `${selected.karyawans?.nama_karyawan} (${selected.karyawans?.nik})` },
                { label: "Periode",      value: `${formatDateLong(selected.tanggal_mulai)} s/d ${formatDateLong(selected.tanggal_selesai)}` },
                { label: "Jumlah Hari",  value: `${selected.jumlah_hari} hari` },
                { label: "Dokter",       value: selected.nama_dokter ?? "—" },
                { label: "Faskes",       value: selected.nama_fasilitas_kesehatan ?? "—" },
                { label: "No. Surat",    value: selected.nomor_surat_sakit ?? "—" },
              ].map(item => (
                <div key={item.label} className="rounded-lg p-3" style={{ background: "var(--surface-muted)", border: "1px solid var(--border)" }}>
                  <p className="text-xs" style={{ color: "var(--text-subtle)" }}>{item.label}</p>
                  <p className="text-sm font-semibold mt-0.5" style={{ color: "var(--text-900)" }}>{item.value}</p>
                </div>
              ))}
            </div>
            {selected.keterangan_sakit && (
              <div className="rounded-lg p-3" style={{ background: "var(--surface-muted)", border: "1px solid var(--border)" }}>
                <p className="text-xs" style={{ color: "var(--text-subtle)" }}>Keluhan</p>
                <p className="text-sm mt-0.5">{selected.keterangan_sakit}</p>
              </div>
            )}
            {/* Lampiran */}
            {selected.lampiran_path && (
              <a href={selected.lampiran_path} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-lg px-4 py-3 transition-colors"
                style={{ background: "var(--primary-light)", border: "1px solid var(--primary-mid)", color: "var(--primary)" }}>
                <FileText className="h-4 w-4 shrink-0" />
                <span className="text-sm font-semibold">Lihat Lampiran Surat Sakit</span>
              </a>
            )}
            {/* Status */}
            <div className="rounded-lg p-3" style={{ background: "var(--surface-muted)", border: "1px solid var(--border)" }}>
              <p className="text-xs" style={{ color: "var(--text-subtle)" }}>Status</p>
              <div className="mt-1">
                <Badge variant={STATUS_SAKIT_BADGE[selected.status as StatusSakit] as "success"|"warning"|"destructive"|"secondary"|"info"} className="text-sm px-3">
                  {STATUS_SAKIT_LABELS[selected.status as StatusSakit] ?? selected.status}
                </Badge>
              </div>
            </div>
            {/* Riwayat Approval */}
            {selected.sakit_approvals && selected.sakit_approvals.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--text-subtle)" }}>Riwayat Approval</p>
                <div className="space-y-2">
                  {selected.sakit_approvals.map(ap => (
                    <div key={ap.id} className="flex items-start gap-3 rounded-lg p-3" style={{ background: "var(--surface-muted)", border: "1px solid var(--border)" }}>
                      <Badge variant={ap.status === "approved" ? "success" : ap.status === "rejected" ? "destructive" : "warning"} className="text-[10px] mt-0.5 shrink-0">Level {ap.approval_level}</Badge>
                      <div className="flex-1">
                        <p className="text-xs font-semibold" style={{ color: "var(--text-900)" }}>
                          {ap.approver_role === "atasan" ? "Atasan Langsung" : "HRD"} — {ap.status === "approved" ? "Disetujui" : ap.status === "rejected" ? "Ditolak" : "Menunggu"}
                        </p>
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

      {/* Action Confirm */}
      <Modal open={!!actionType} onClose={() => setActionType(null)}
        title={actionType === "approve" ? "Setujui Sakit" : actionType === "reject" ? "Tolak Sakit" : actionType === "submit" ? "Submit Pengajuan" : "Batalkan Sakit"} size="sm"
        footer={<><Button variant="outline" onClick={() => setActionType(null)}>Batal</Button>
          <Button onClick={handleAction} disabled={actionSaving}
            style={actionType === "approve" ? { background: "var(--success)", color: "#fff" } : actionType === "reject" ? { background: "var(--danger)", color: "#fff" } : undefined}>
            {actionSaving ? "Memproses..." : "Konfirmasi"}
          </Button></>}
      >
        <div className="space-y-3">
          {selected && <p className="text-sm" style={{ color: "var(--text-subtle)" }}>{selected.karyawans?.nama_karyawan} — {selected.jumlah_hari} hari</p>}
          {(actionType === "reject" || actionType === "cancel") && (
            <TextareaField label="Catatan / Alasan" required value={actionNote} onChange={e => setActionNote(e.target.value)} />
          )}
          {actionType === "approve" && (
            <TextareaField label="Catatan (opsional)" value={actionNote} onChange={e => setActionNote(e.target.value)} />
          )}
        </div>
      </Modal>

      <ConfirmDelete open={deleteOpen} onClose={() => setDeleteOpen(false)} onConfirm={handleDelete} loading={deleting}
        description={`Hapus pengajuan sakit ${selected?.karyawans?.nama_karyawan ?? ""}?`} />
    </div>
  )
}

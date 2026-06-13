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
import { STATUS_IZIN_LABELS, STATUS_IZIN_BADGE, StatusIzin, STATUS_IZIN } from "@/lib/izin"

interface PengajuanIzin {
  id: number; karyawan_id: number; jenis_izin_id: number
  tanggal_mulai: string; tanggal_selesai: string
  jam_mulai: string | null; jam_selesai: string | null
  durasi: number; satuan_durasi: string; alasan: string; status: string
  karyawans?: { id: number; nik: string; nama_karyawan: string; jabatan: string }
  jenis_izins?: { id: number; kode_izin: string; nama_izin: string; satuan: string; memotong_absensi: boolean; membutuhkan_lampiran: boolean }
  izin_approvals?: { id: number; approver_role: string; approval_level: number; status: string; note: string | null; approved_at: string | null; approver_nama?: string | null; approver_jabatan?: string | null; diproses_oleh_nama?: string | null }[]
}
interface Karyawan { id: number; nik: string; nama_karyawan: string; jabatan: string; status_karyawan: string | null }
interface JenisIzin { id: number; kode_izin: string; nama_izin: string; satuan: string; status: string; membutuhkan_lampiran: boolean }

export default function PengajuanIzinPage() {
  const { user: authUser } = useAuth()
  const isAdmin = authUser?.role?.toLowerCase() === "admin"

  const { data, loading, refetch }  = useApi<PengajuanIzin[]>("/api/sdm/pengajuan-izin")
  const { data: karyawans }         = useApi<Karyawan[]>("/api/karyawan")
  const { data: jenisIzins }        = useApi<JenisIzin[]>("/api/sdm/jenis-izin")
  const list = data ?? []

  const [filterStatus, setFilterStatus] = useState("")
  const filtered = filterStatus ? list.filter(p => p.status === filterStatus) : list

  const [addOpen, setAddOpen]   = useState(false)
  const [form, setForm]         = useState({ karyawan_id: "", jenis_izin_id: "", tanggal_mulai: "", tanggal_selesai: "", jam_mulai: "", jam_selesai: "", alasan: "" })
  const [addErrors, setAddErrors] = useState<Record<string, string>>({})
  const [saving, setSaving]     = useState(false)

  const [detailOpen, setDetailOpen] = useState(false)
  const [selected, setSelected]     = useState<PengajuanIzin | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const [actionType, setActionType]   = useState<"approve" | "reject" | "submit" | "cancel" | null>(null)
  const [actionNote, setActionNote]   = useState("")
  const [actionSaving, setActionSaving] = useState(false)
  const [deleteOpen, setDeleteOpen]   = useState(false)
  const [deleting, setDeleting]       = useState(false)

  // Apakah jenis izin yang dipilih berbasis jam?
  const selectedJenis = jenisIzins?.find(j => String(j.id) === form.jenis_izin_id)
  const isBasisJam = selectedJenis?.satuan === "jam"

  const karyawanOpts = (karyawans ?? []).filter(k => k.status_karyawan !== "Pensiun" && k.status_karyawan !== "Nonaktif")
    .map(k => ({ value: String(k.id), label: `${k.nik} — ${k.nama_karyawan}`, description: k.jabatan }))
  const jenisOpts = (jenisIzins ?? []).filter(j => j.status === "aktif")
    .map(j => ({ value: String(j.id), label: `${j.kode_izin} — ${j.nama_izin}` }))

  const handleAdd = async () => {
    const e: Record<string, string> = {}
    if (isAdmin && !form.karyawan_id) e.karyawan_id = "Pilih karyawan"
    if (!form.jenis_izin_id)   e.jenis_izin_id = "Pilih jenis izin"
    if (!form.tanggal_mulai)   e.tanggal_mulai = "Tanggal mulai wajib diisi"
    if (!form.tanggal_selesai) e.tanggal_selesai = "Tanggal selesai wajib diisi"
    if (isBasisJam && !form.jam_mulai)   e.jam_mulai = "Jam mulai wajib"
    if (isBasisJam && !form.jam_selesai) e.jam_selesai = "Jam selesai wajib"
    if (!form.alasan.trim())   e.alasan = "Alasan wajib diisi"
    setAddErrors(e); if (Object.keys(e).length) return
    setSaving(true)
    try {
      const res = await fetch("/api/sdm/pengajuan-izin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) })
      if (!res.ok) { const j = await res.json(); setAddErrors({ _: j.error ?? "Gagal" }); return }
      setAddOpen(false); refetch()
    } finally { setSaving(false) }
  }

  const openDetail = async (row: PengajuanIzin) => {
    setSelected(row); setDetailOpen(true); setDetailLoading(true)
    try {
      const res = await fetch(`/api/sdm/pengajuan-izin/${row.id}`)
      if (res.ok) setSelected(await res.json())
    } finally { setDetailLoading(false) }
  }

  const handleAction = async () => {
    if (!selected || !actionType) return
    if (actionType === "reject" && !actionNote.trim()) { alert("Catatan penolakan wajib diisi"); return }
    setActionSaving(true)
    try {
      const res = await fetch(`/api/sdm/pengajuan-izin/${selected.id}/${actionType}`, {
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
      await fetch(`/api/sdm/pengajuan-izin/${selected.id}`, { method: "DELETE" })
      setDeleteOpen(false); refetch()
    } finally { setDeleting(false) }
  }

  const columns: Column<PengajuanIzin>[] = [
    { key: "karyawan_id", header: "Karyawan",
      cell: (r) => <div><p className="font-semibold text-sm">{r.karyawans?.nama_karyawan ?? "—"}</p><p className="text-xs font-mono" style={{ color: "var(--text-subtle)" }}>{r.karyawans?.nik}</p></div> },
    { key: "jenis_izin_id", header: "Jenis Izin",
      cell: (r) => <div><Badge variant="secondary" className="font-mono text-[10px] mr-1">{r.jenis_izins?.kode_izin}</Badge>{r.jenis_izins?.nama_izin ?? "—"}</div> },
    { key: "tanggal_mulai", header: "Periode / Jam",
      cell: (r) => (
        <div className="text-xs">
          <p className="font-mono">{formatDate(r.tanggal_mulai)}{r.tanggal_selesai !== r.tanggal_mulai ? ` – ${formatDate(r.tanggal_selesai)}` : ""}</p>
          {r.jam_mulai && <p className="font-mono" style={{ color: "var(--text-subtle)" }}>{r.jam_mulai.slice(0,5)} – {r.jam_selesai?.slice(0,5)}</p>}
        </div>
      ) },
    { key: "durasi", header: "Durasi",
      cell: (r) => <span className="font-mono font-bold">{Number(r.durasi)} {r.satuan_durasi}</span> },
    { key: "status", header: "Status",
      cell: (r) => <Badge variant={STATUS_IZIN_BADGE[r.status as StatusIzin] as "success"|"warning"|"destructive"|"secondary"|"info"}>{STATUS_IZIN_LABELS[r.status as StatusIzin] ?? r.status}</Badge> },
  ]

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--text-900)" }}>Pengajuan Izin</h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-subtle)" }}>Kelola pengajuan izin pegawai</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={refetch}><RefreshCw className="h-3.5 w-3.5" /></Button>
          <Button size="sm" onClick={() => { setAddErrors({}); setForm({ karyawan_id: "", jenis_izin_id: "", tanggal_mulai: "", tanggal_selesai: "", jam_mulai: "", jam_selesai: "", alasan: "" }); setAddOpen(true) }}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />Ajukan Izin
          </Button>
        </div>
      </div>

      {/* Filter Status */}
      <div className="flex gap-2 flex-wrap">
        {["", ...Object.keys(STATUS_IZIN_LABELS)].map(s => (
          <button key={s} onClick={() => setFilterStatus(s)}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors"
            style={filterStatus === s ? { background: "var(--primary)", color: "#fff" } : { background: "var(--surface)", color: "var(--text-muted)", border: "1px solid var(--border)" }}>
            {s === "" ? `Semua (${list.length})` : `${STATUS_IZIN_LABELS[s as StatusIzin]} (${list.filter(p => p.status === s).length})`}
          </button>
        ))}
      </div>

      <DataTable data={filtered as unknown as Record<string, unknown>[]} columns={columns as unknown as Column<Record<string, unknown>>[]}
        searchKeys={[]} loading={loading}
        actions={(row: Record<string, unknown>) => {
          const r = row as unknown as PengajuanIzin
          return (
            <div className="flex items-center justify-center gap-1">
              <Button variant="ghost" size="icon" className="h-7 w-7" style={{ color: "var(--primary)" }} onClick={() => openDetail(r)}><Eye className="h-3.5 w-3.5" /></Button>
              {r.status === STATUS_IZIN.DRAFT && (
                <Button variant="ghost" size="icon" className="h-7 w-7" style={{ color: "var(--success)" }}
                  onClick={() => { setSelected(r); setActionType("submit"); setActionNote("") }}><Send className="h-3.5 w-3.5" /></Button>
              )}
              {isAdmin && [STATUS_IZIN.SUBMITTED, STATUS_IZIN.APPROVED_SUPERVISOR].includes(r.status as never) && (
                <>
                  <Button variant="ghost" size="icon" className="h-7 w-7" style={{ color: "var(--success)" }}
                    onClick={() => { setSelected(r); setActionType("approve"); setActionNote("") }}><Check className="h-3.5 w-3.5" /></Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" style={{ color: "var(--danger)" }}
                    onClick={() => { setSelected(r); setActionType("reject"); setActionNote("") }}><X className="h-3.5 w-3.5" /></Button>
                </>
              )}
              {![STATUS_IZIN.APPROVED_HRD, STATUS_IZIN.CANCELLED].includes(r.status as never) && (
                <Button variant="ghost" size="icon" className="h-7 w-7" style={{ color: "var(--danger)" }}
                  onClick={() => { setSelected(r); setDeleteOpen(true) }}><Trash2 className="h-3.5 w-3.5" /></Button>
              )}
            </div>
          )
        }}
      />

      {/* Modal: Ajukan Izin */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Ajukan Izin" size="lg"
        footer={<><Button variant="outline" onClick={() => setAddOpen(false)}>Batal</Button><Button onClick={handleAdd} disabled={saving}>{saving ? "Menyimpan..." : "Simpan Draft"}</Button></>}
      >
        {addErrors._ && <div className="mb-4 rounded-lg px-4 py-3 text-sm" style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>{addErrors._}</div>}
        {/* Tampilkan ringkasan error jika ada field yang belum diisi */}
        {Object.entries(addErrors).filter(([k, v]) => k !== "_" && v).length > 0 && !addErrors._ && (
          <div className="mb-4 rounded-lg px-4 py-3 text-sm" style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>
            Mohon lengkapi semua field yang wajib diisi sebelum menyimpan.
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
              <p className="text-sm font-semibold mt-0.5" style={{ color: "var(--text-900)" }}>
                {(karyawans ?? []).find(k => k.id === authUser?.karyawan_id)?.nama_karyawan ?? "Karyawan Anda"}
              </p>
            </div>
          )}
          <SelectField label="Jenis Izin *" error={addErrors.jenis_izin_id} value={form.jenis_izin_id}
            placeholder="— Pilih Jenis Izin —" options={jenisOpts}
            onChange={e => setForm(f => ({ ...f, jenis_izin_id: e.target.value, jam_mulai: "", jam_selesai: "" }))} />
          <div className="grid grid-cols-2 gap-4">
            <TextField label="Tanggal Mulai *" error={addErrors.tanggal_mulai} type="date" value={form.tanggal_mulai}
              onChange={e => setForm(f => ({ ...f, tanggal_mulai: e.target.value }))} />
            <TextField label="Tanggal Selesai *" error={addErrors.tanggal_selesai} type="date" value={form.tanggal_selesai}
              onChange={e => setForm(f => ({ ...f, tanggal_selesai: e.target.value }))} />
          </div>
          {isBasisJam && (
            <div className="grid grid-cols-2 gap-4">
              <TextField label="Jam Mulai *" error={addErrors.jam_mulai} type="time" value={form.jam_mulai}
                onChange={e => setForm(f => ({ ...f, jam_mulai: e.target.value }))} />
              <TextField label="Jam Selesai *" error={addErrors.jam_selesai} type="time" value={form.jam_selesai}
                onChange={e => setForm(f => ({ ...f, jam_selesai: e.target.value }))} />
            </div>
          )}
          <TextareaField label="Alasan *" value={form.alasan} error={addErrors.alasan} onChange={e => setForm(f => ({ ...f, alasan: e.target.value }))} />
        </div>
      </Modal>

      {/* Modal: Detail */}
      <Modal open={detailOpen} onClose={() => setDetailOpen(false)} title="Detail Pengajuan Izin" size="lg"
        footer={
          <div className="flex gap-2 flex-wrap">
            {selected?.status === STATUS_IZIN.DRAFT && (
              <Button variant="secondary" size="sm" onClick={() => { setActionType("submit"); setActionNote("") }}>
                <Send className="h-3.5 w-3.5 mr-1.5" />Submit ke Atasan
              </Button>
            )}
            {isAdmin && selected?.status === STATUS_IZIN.SUBMITTED && (
              <>
                <Button size="sm" style={{ background: "var(--success)", color: "#fff" }} onClick={() => { setActionType("approve"); setActionNote("") }}>
                  <Check className="h-3.5 w-3.5 mr-1.5" />Setujui (Atasan)
                </Button>
                <Button variant="destructive" size="sm" onClick={() => { setActionType("reject"); setActionNote("") }}>Tolak</Button>
              </>
            )}
            {isAdmin && selected?.status === STATUS_IZIN.APPROVED_SUPERVISOR && (
              <>
                <Button size="sm" style={{ background: "var(--success)", color: "#fff" }} onClick={() => { setActionType("approve"); setActionNote("") }}>
                  <Check className="h-3.5 w-3.5 mr-1.5" />Setujui (HRD Final)
                </Button>
                <Button variant="destructive" size="sm" onClick={() => { setActionType("reject"); setActionNote("") }}>Tolak HRD</Button>
              </>
            )}
            {![STATUS_IZIN.APPROVED_HRD, STATUS_IZIN.CANCELLED].includes((selected?.status ?? "") as never) && (
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
                { label: "Karyawan",  value: `${selected.karyawans?.nama_karyawan} (${selected.karyawans?.nik})` },
                { label: "Jenis Izin", value: `${selected.jenis_izins?.kode_izin} — ${selected.jenis_izins?.nama_izin}` },
                { label: "Tanggal Mulai", value: formatDateLong(selected.tanggal_mulai) },
                { label: "Tanggal Selesai", value: formatDateLong(selected.tanggal_selesai) },
                { label: "Durasi", value: `${Number(selected.durasi)} ${selected.satuan_durasi}` },
                ...(selected.jam_mulai ? [{ label: "Jam", value: `${selected.jam_mulai.slice(0,5)} – ${selected.jam_selesai?.slice(0,5)}` }] : []),
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
                  <Badge variant={STATUS_IZIN_BADGE[selected.status as StatusIzin] as "success"|"warning"|"destructive"|"secondary"|"info"} className="text-sm px-3">
                    {STATUS_IZIN_LABELS[selected.status as StatusIzin] ?? selected.status}
                  </Badge>
                </div>
              </div>
            </div>
            {selected.alasan && (
              <div className="rounded-lg p-3" style={{ background: "var(--surface-muted)", border: "1px solid var(--border)" }}>
                <p className="text-xs" style={{ color: "var(--text-subtle)" }}>Alasan</p>
                <p className="text-sm mt-0.5">{selected.alasan}</p>
              </div>
            )}
            {selected.izin_approvals && selected.izin_approvals.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--text-subtle)" }}>Riwayat Approval</p>
                <div className="space-y-2">
                  {selected.izin_approvals.map(ap => (
                    <div key={ap.id} className="flex items-start gap-3 rounded-lg p-3" style={{ background: "var(--surface-muted)", border: "1px solid var(--border)" }}>
                      <Badge variant={ap.status === "approved" ? "success" : ap.status === "rejected" ? "destructive" : "warning"} className="text-[10px] mt-0.5 shrink-0">Level {ap.approval_level}</Badge>
                      <div className="flex-1">
                        <p className="text-xs font-semibold" style={{ color: "var(--text-900)" }}>
                          {ap.approver_role === "atasan" ? "Atasan Langsung" : "HRD"} — {ap.status === "approved" ? "Disetujui" : ap.status === "rejected" ? "Ditolak" : "Menunggu"}
                        </p>
                        {ap.approver_nama && <p className="text-xs mt-0.5 font-medium" style={{ color: "var(--primary)" }}>Ditugaskan ke: {ap.approver_nama} {ap.approver_jabatan ? `(${ap.approver_jabatan})` : ""}</p>}
                        {ap.diproses_oleh_nama && ap.status !== "pending" && <p className="text-xs mt-0.5" style={{ color: "var(--text-subtle)" }}>Diproses oleh: <strong>{ap.diproses_oleh_nama}</strong></p>}
                        {!ap.approver_nama && ap.status === "pending" && <p className="text-xs mt-0.5" style={{ color: "var(--text-subtle)" }}>Menunggu penugasan approver</p>}
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
        title={actionType === "approve" ? "Setujui Izin" : actionType === "reject" ? "Tolak Izin" : actionType === "submit" ? "Submit Izin" : "Batalkan Izin"} size="sm"
        footer={<><Button variant="outline" onClick={() => setActionType(null)}>Batal</Button>
          <Button onClick={handleAction} disabled={actionSaving}
            style={actionType === "approve" ? { background: "var(--success)", color: "#fff" } : actionType === "reject" ? { background: "var(--danger)", color: "#fff" } : undefined}>
            {actionSaving ? "Memproses..." : "Konfirmasi"}
          </Button></>}
      >
        <div className="space-y-3">
          {selected && <p className="text-sm" style={{ color: "var(--text-subtle)" }}>{selected.karyawans?.nama_karyawan} — {selected.jenis_izins?.nama_izin} ({Number(selected.durasi)} {selected.satuan_durasi})</p>}
          {(actionType === "reject" || actionType === "cancel") && (
            <TextareaField label="Catatan / Alasan" required value={actionNote} onChange={e => setActionNote(e.target.value)} />
          )}
          {actionType === "approve" && (
            <TextareaField label="Catatan (opsional)" value={actionNote} onChange={e => setActionNote(e.target.value)} />
          )}
        </div>
      </Modal>

      <ConfirmDelete open={deleteOpen} onClose={() => setDeleteOpen(false)} onConfirm={handleDelete} loading={deleting}
        description={`Hapus pengajuan izin ${selected?.karyawans?.nama_karyawan ?? ""}?`} />
    </div>
  )
}

"use client"
import React, { useState } from "react"
import { DataTable, Column } from "@/components/ui/data-table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Modal } from "@/components/ui/modal"
import { TextareaField } from "@/components/ui/form-field"
import { RefreshCw, Check, X, Eye, FileText, UserCog } from "lucide-react"
import { formatDate, formatDateLong } from "@/lib/utils"
import { useApi } from "@/hooks/useApi"
import { STATUS_SAKIT_LABELS, STATUS_SAKIT_BADGE, StatusSakit, STATUS_SAKIT } from "@/lib/sakit"
import { useAuth } from "@/contexts/AuthContext"
import { ReassignApproverModal } from "@/components/sdm/reassign-approver-modal"

interface PengajuanSakit {
  id: number; karyawan_id: number; tanggal_mulai: string; tanggal_selesai: string
  jumlah_hari: number; keterangan_sakit: string | null; lampiran_path: string | null; status: string
  karyawans?: { id: number; nik: string; nama_karyawan: string; jabatan: string }
  sakit_approvals?: { id: number; approver_role: string; approval_level: number; status: string; note: string | null; approved_at: string | null }[]
  approval_history?: { approval_level: number; approver_role: string; note: string | null; approved_at: string | null; diproses_oleh_nama?: string | null }
}

function formatApprovalTime(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"
}

export default function ApprovalSakitPage() {
  const { user: authUser } = useAuth()
  const canReassignApprover = authUser?.role?.toLowerCase() === "admin" || ((authUser?.jabatan ?? "").toLowerCase().includes("kepala divisi") && (authUser?.nama_divisi ?? "").toLowerCase().includes("hrd"))
  const { data, loading, refetch } = useApi<PengajuanSakit[]>("/api/sdm/pengajuan-sakit/approval-pending")
  const { data: historyData, loading: historyLoading, refetch: refetchHistory } = useApi<PengajuanSakit[]>("/api/sdm/pengajuan-sakit/approval-history")
  const list = data ?? []
  const historyList = historyData ?? []

  const [selected, setSelected]     = useState<PengajuanSakit | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [actionType, setActionType] = useState<"approve" | "reject" | null>(null)
  const [actionNote, setActionNote] = useState("")
  const [actionSaving, setActionSaving] = useState(false)
  const [reassignOpen, setReassignOpen] = useState(false)

  const handleAction = async () => {
    if (!selected || !actionType) return
    if (actionType === "reject" && !actionNote.trim()) { alert("Catatan wajib diisi"); return }
    setActionSaving(true)
    try {
      const res = await fetch(`/api/sdm/pengajuan-sakit/${selected.id}/${actionType}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ note: actionNote }),
      })
      const j = await res.json()
      if (!res.ok) { alert(j.error ?? "Gagal"); return }
      setActionType(null); setActionNote(""); setDetailOpen(false); refetch(); refetchHistory()
    } finally { setActionSaving(false) }
  }

  const columns: Column<PengajuanSakit>[] = [
    {
      key: "level_approval", header: "Level",
      cell: (r) => r.status === STATUS_SAKIT.SUBMITTED
        ? <div><Badge variant="warning" className="text-[10px]">Level 1 — Atasan</Badge></div>
        : <div><Badge variant="info" className="text-[10px]">Level 2 — HRD Final</Badge></div>,
    },
    { key: "karyawan_id", header: "Karyawan",
      cell: (r) => <div><p className="font-semibold">{r.karyawans?.nama_karyawan ?? "—"}</p><p className="text-xs font-mono" style={{ color: "var(--text-subtle)" }}>{r.karyawans?.nik}</p></div> },
    { key: "tanggal_mulai", header: "Periode",
      cell: (r) => <div className="font-mono text-xs"><p>{formatDate(r.tanggal_mulai)}</p><p style={{ color: "var(--text-subtle)" }}>s/d {formatDate(r.tanggal_selesai)}</p></div> },
    { key: "jumlah_hari", header: "Hari", cell: (r) => <span className="font-mono font-bold">{r.jumlah_hari}h</span> },
    { key: "lampiran_path", header: "Lampiran",
      cell: (r) => r.lampiran_path
        ? <a href={r.lampiran_path} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs" style={{ color: "var(--primary)" }}>
            <FileText className="h-3.5 w-3.5" />Lihat
          </a>
        : <span style={{ color: "var(--text-subtle)" }}>—</span> },
  ]

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--text-900)" }}>Approval Sakit</h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-subtle)" }}>Daftar pengajuan sakit yang menunggu persetujuan — {list.length} pengajuan</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => { refetch(); refetchHistory() }}><RefreshCw className="h-3.5 w-3.5" /></Button>
      </div>

      {list.length === 0 && !loading ? (
        <div className="rounded-xl py-16 text-center" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          <Check className="h-10 w-10 mx-auto mb-3" style={{ color: "var(--success)" }} />
          <p className="text-sm font-semibold" style={{ color: "var(--text-900)" }}>Tidak ada yang menunggu</p>
        </div>
      ) : (
        <DataTable data={list as unknown as Record<string, unknown>[]} columns={columns as unknown as Column<Record<string, unknown>>[]}
          searchKeys={[]} loading={loading}
          actions={(row: Record<string, unknown>) => {
            const r = row as unknown as PengajuanSakit
            const isL2 = r.status === STATUS_SAKIT.APPROVED_SUPERVISOR
            return (
              <div className="flex items-center justify-center gap-1">
                <Button variant="ghost" size="icon" className="h-7 w-7" style={{ color: "var(--primary)" }}
                  onClick={() => { setSelected(r); setDetailOpen(true) }}><Eye className="h-3.5 w-3.5" /></Button>
                {canReassignApprover && r.status === STATUS_SAKIT.SUBMITTED && (
                  <Button variant="ghost" size="icon" className="h-7 w-7" style={{ color: "var(--warning)" }}
                    title="Ganti Approver" onClick={() => { setSelected(r); setReassignOpen(true) }}><UserCog className="h-3.5 w-3.5" /></Button>
                )}
                <Button variant="ghost" size="icon" className="h-7 w-7" style={{ color: "var(--success)" }}
                  title={isL2 ? "Setujui (HRD)" : "Setujui (Atasan)"}
                  onClick={() => { setSelected(r); setActionType("approve"); setActionNote("") }}><Check className="h-3.5 w-3.5" /></Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" style={{ color: "var(--danger)" }}
                  title="Tolak"
                  onClick={() => { setSelected(r); setActionType("reject"); setActionNote("") }}><X className="h-3.5 w-3.5" /></Button>
              </div>
            )
          }}
        />
      )}

      <div className="rounded-xl overflow-hidden" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid var(--border)" }}>
          <div><p className="text-sm font-semibold" style={{ color: "var(--text-900)" }}>Riwayat Approval Sakit</p><p className="text-xs" style={{ color: "var(--text-subtle)" }}>Pengajuan yang sudah disetujui level 1 atau level 2</p></div>
          <Badge variant="secondary">{historyList.length} riwayat</Badge>
        </div>
        {historyLoading ? <div className="h-40 animate-pulse" style={{ background: "var(--surface-muted)" }} /> : historyList.length === 0 ? <div className="py-10 text-center text-sm" style={{ color: "var(--text-subtle)" }}>Belum ada riwayat approval.</div> : (
          <div className="overflow-x-auto"><table className="w-full text-sm" style={{ borderCollapse: "collapse" }}><thead style={{ background: "var(--surface-muted)" }}><tr>{["Level", "Karyawan", "Periode", "Hari", "Diproses Oleh", "Waktu", "Catatan"].map(h => <th key={h} className="px-3 py-2 text-left text-[11px] uppercase tracking-wide" style={{ color: "var(--text-muted)", borderBottom: "1px solid var(--border)" }}>{h}</th>)}</tr></thead><tbody>
            {historyList.map(r => <tr key={`${r.id}-${r.approval_history?.approval_level}-${r.approval_history?.approved_at}`}>
              <td className="px-3 py-2" style={{ borderBottom: "1px solid var(--border)" }}><Badge variant={r.approval_history?.approval_level === 2 ? "info" : "warning"}>Level {r.approval_history?.approval_level}</Badge></td>
              <td className="px-3 py-2 min-w-[190px]" style={{ borderBottom: "1px solid var(--border)" }}><p className="font-semibold">{r.karyawans?.nama_karyawan}</p><p className="text-xs font-mono" style={{ color: "var(--text-subtle)" }}>{r.karyawans?.nik}</p></td>
              <td className="px-3 py-2 font-mono text-xs whitespace-nowrap" style={{ borderBottom: "1px solid var(--border)" }}>{formatDate(r.tanggal_mulai)} - {formatDate(r.tanggal_selesai)}</td>
              <td className="px-3 py-2 font-mono whitespace-nowrap" style={{ borderBottom: "1px solid var(--border)" }}>{r.jumlah_hari}h</td>
              <td className="px-3 py-2" style={{ borderBottom: "1px solid var(--border)" }}>{r.approval_history?.diproses_oleh_nama ?? "—"}</td>
              <td className="px-3 py-2 font-mono text-xs whitespace-nowrap" style={{ borderBottom: "1px solid var(--border)" }}>{formatApprovalTime(r.approval_history?.approved_at)}</td>
              <td className="px-3 py-2 max-w-[240px] truncate" style={{ borderBottom: "1px solid var(--border)" }}>{r.approval_history?.note ?? "—"}</td>
            </tr>)}
          </tbody></table></div>
        )}
      </div>

      {/* Detail */}
      <Modal open={detailOpen} onClose={() => setDetailOpen(false)} title="Detail Sakit" size="md"
        footer={
          <div className="flex gap-2">
            {canReassignApprover && selected?.status === STATUS_SAKIT.SUBMITTED && (
              <Button variant="outline" size="sm" onClick={() => setReassignOpen(true)}>
                <UserCog className="h-3.5 w-3.5 mr-1.5" />Ganti Approver
              </Button>
            )}
            <Button size="sm" style={{ background: "var(--success)", color: "#fff" }} onClick={() => { setActionType("approve"); setActionNote("") }}>
              <Check className="h-3.5 w-3.5 mr-1.5" />{selected?.status === STATUS_SAKIT.APPROVED_SUPERVISOR ? "Setujui (HRD)" : "Setujui (Atasan)"}
            </Button>
            <Button variant="destructive" size="sm" onClick={() => { setActionType("reject"); setActionNote("") }}>Tolak</Button>
            <Button variant="outline" onClick={() => setDetailOpen(false)}>Tutup</Button>
          </div>
        }
      >
        {selected && (
          <div className="space-y-3">
            {[
              { label: "Karyawan", value: `${selected.karyawans?.nama_karyawan} (${selected.karyawans?.nik})` },
              { label: "Periode",  value: `${formatDateLong(selected.tanggal_mulai)} s/d ${formatDateLong(selected.tanggal_selesai)}` },
              { label: "Hari",     value: `${selected.jumlah_hari} hari` },
              ...(selected.keterangan_sakit ? [{ label: "Keluhan", value: selected.keterangan_sakit }] : []),
            ].map(item => (
              <div key={item.label} className="rounded-lg p-3" style={{ background: "var(--surface-muted)", border: "1px solid var(--border)" }}>
                <p className="text-xs" style={{ color: "var(--text-subtle)" }}>{item.label}</p>
                <p className="text-sm font-semibold mt-0.5">{item.value}</p>
              </div>
            ))}
            {selected.lampiran_path && (
              <a href={selected.lampiran_path} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-lg px-4 py-3"
                style={{ background: "var(--primary-light)", border: "1px solid var(--primary-mid)", color: "var(--primary)" }}>
                <FileText className="h-4 w-4" />
                <span className="text-sm font-semibold">Lihat Lampiran Surat Sakit</span>
              </a>
            )}
          </div>
        )}
      </Modal>

      <ReassignApproverModal
        open={reassignOpen}
        onClose={() => setReassignOpen(false)}
        requestId={selected?.id ?? null}
        endpointBase="/api/sdm/pengajuan-sakit"
        title="Ganti Approver Sakit"
        description={selected ? `${selected.karyawans?.nama_karyawan ?? "Karyawan"} — ${selected.jumlah_hari} hari` : undefined}
        onSuccess={() => { setDetailOpen(false); refetch(); refetchHistory() }}
      />

      {/* Action Confirm */}
      <Modal open={!!actionType} onClose={() => setActionType(null)}
        title={(() => {
          if (!selected) return "Konfirmasi"
          const isL2 = selected.status === STATUS_SAKIT.APPROVED_SUPERVISOR
          return actionType === "approve" ? (isL2 ? "Setujui Sakit — HRD Final" : "Setujui Sakit — Atasan") : (isL2 ? "Tolak Sakit — HRD" : "Tolak Sakit — Atasan")
        })()} size="sm"
        footer={<>
          <Button variant="outline" onClick={() => setActionType(null)}>Batal</Button>
          <Button onClick={handleAction} disabled={actionSaving}
            style={actionType === "approve" ? { background: "var(--success)", color: "#fff" } : { background: "var(--danger)", color: "#fff" }}>
            {actionSaving ? "Memproses..." : actionType === "approve" ? (selected?.status === STATUS_SAKIT.APPROVED_SUPERVISOR ? "Setujui (HRD)" : "Setujui (Atasan)") : "Tolak"}
          </Button>
        </>}
      >
        <div className="space-y-3">
          {selected && <p className="text-sm" style={{ color: "var(--text-subtle)" }}><strong>{selected.karyawans?.nama_karyawan}</strong> — {selected.jumlah_hari} hari</p>}
          <TextareaField label={actionType === "reject" ? "Alasan Penolakan (wajib)" : "Catatan (opsional)"}
            required={actionType === "reject"}
            value={actionNote} onChange={e => setActionNote(e.target.value)} />
        </div>
      </Modal>
    </div>
  )
}

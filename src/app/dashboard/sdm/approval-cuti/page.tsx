"use client"
import React, { useState } from "react"
import { DataTable, Column } from "@/components/ui/data-table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Modal } from "@/components/ui/modal"
import { TextareaField } from "@/components/ui/form-field"
import { RefreshCw, Check, X, Eye, UserCog } from "lucide-react"
import { formatDate, formatDateLong } from "@/lib/utils"
import { useApi } from "@/hooks/useApi"
import { useAuth } from "@/contexts/AuthContext"
import { STATUS_CUTI_LABELS, STATUS_CUTI_BADGE, StatusCuti, STATUS_CUTI } from "@/lib/leave"
import { ReassignApproverModal } from "@/components/sdm/reassign-approver-modal"

interface PengajuanCuti {
  id: number; karyawan_id: number; jenis_cuti_id: number
  tanggal_mulai: string; tanggal_selesai: string; jumlah_hari: number
  alasan: string; status: string
  karyawans?: { id: number; nik: string; nama_karyawan: string; jabatan: string }
  jenis_cutis?: { id: number; kode_cuti: string; nama_cuti: string }
  approvals?: {
    id: number; approver_role: string; approval_level: number; status: string
    note: string | null; approved_at: string | null
    approver_nama?: string | null; approver_jabatan?: string | null
  }[]
  approval_history?: { approval_level: number; approver_role: string; note: string | null; approved_at: string | null; diproses_oleh_nama?: string | null }
}

function formatApprovalTime(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"
}

export default function ApprovalCutiPage() {
  const { user: authUser } = useAuth()
  const isHrd = authUser?.role?.toLowerCase() === "admin" || authUser?.role?.toLowerCase() === "hrd"
  const isAtasanByRole = authUser?.role === "atasan"
  const canReassignApprover = authUser?.role?.toLowerCase() === "admin" || ((authUser?.jabatan ?? "").toLowerCase().includes("kepala divisi") && (authUser?.nama_divisi ?? "").toLowerCase().includes("hrd"))

  // Tampilkan tab berdasarkan role
  // Jika isHrd: hanya tampilkan level 2
  // Jika bukan: tampilkan level 1 (dan mungkin level 2 jika jabatannya HRD)
  const { data, loading, refetch } = useApi<PengajuanCuti[]>("/api/sdm/pengajuan-cuti/approval-pending")
  const { data: historyData, loading: historyLoading, refetch: refetchHistory } = useApi<PengajuanCuti[]>("/api/sdm/pengajuan-cuti/approval-history")
  const list = data ?? []
  const historyList = historyData ?? []

  const [selected, setSelected]     = useState<PengajuanCuti | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [actionType, setActionType] = useState<"approve" | "reject" | null>(null)
  const [actionNote, setActionNote] = useState("")
  const [actionSaving, setActionSaving] = useState(false)
  const [reassignOpen, setReassignOpen] = useState(false)

  const handleAction = async () => {
    if (!selected || !actionType) return
    if (actionType === "reject" && !actionNote.trim()) { alert("Catatan penolakan wajib diisi"); return }
    setActionSaving(true)
    try {
      const res = await fetch(`/api/sdm/pengajuan-cuti/${selected.id}/${actionType}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: actionNote }),
      })
      const j = await res.json()
      if (!res.ok) { alert(j.error ?? "Gagal"); return }
      setActionType(null); setActionNote(""); setDetailOpen(false); refetch(); refetchHistory()
    } finally { setActionSaving(false) }
  }

  const columns: Column<PengajuanCuti>[] = [
    {
      key: "level_approval", header: "Level Approval",
      cell: (r) => (
        r.status === STATUS_CUTI.SUBMITTED
          ? <div>
              <Badge variant="warning" className="text-[10px]">Level 1 — Atasan Langsung</Badge>
              <p className="text-[10px] mt-0.5" style={{ color: "var(--text-subtle)" }}>Menunggu persetujuan Anda</p>
            </div>
          : <div>
              <Badge variant="info" className="text-[10px]">Level 2 — HRD Final</Badge>
              <p className="text-[10px] mt-0.5" style={{ color: "var(--text-subtle)" }}>Sudah disetujui atasan</p>
            </div>
      ),
    },
    { key: "karyawan_id", header: "Karyawan",
      cell: (r) => <div><p className="font-semibold">{r.karyawans?.nama_karyawan ?? "—"}</p><p className="text-xs font-mono" style={{ color: "var(--text-subtle)" }}>{r.karyawans?.nik} · {r.karyawans?.jabatan}</p></div> },
    { key: "jenis_cuti_id", header: "Jenis Cuti",
      cell: (r) => <span><Badge variant="secondary" className="font-mono text-[10px] mr-1">{r.jenis_cutis?.kode_cuti}</Badge>{r.jenis_cutis?.nama_cuti}</span> },
    { key: "tanggal_mulai", header: "Periode",
      cell: (r) => <div className="font-mono text-xs"><p>{formatDate(r.tanggal_mulai)}</p><p style={{ color: "var(--text-subtle)" }}>s/d {formatDate(r.tanggal_selesai)}</p></div> },
    { key: "jumlah_hari", header: "Hari", cell: (r) => <span className="font-mono font-bold">{r.jumlah_hari}h</span> },
    { key: "status", header: "Status",
      cell: (r) => <Badge variant={STATUS_CUTI_BADGE[r.status as StatusCuti] as "warning"|"info"}>{STATUS_CUTI_LABELS[r.status as StatusCuti] ?? r.status}</Badge> },
  ]

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--text-900)" }}>Approval Cuti</h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-subtle)" }}>
            {isHrd ? "Pengajuan cuti yang sudah disetujui atasan — menunggu persetujuan HRD" : "Daftar pengajuan cuti yang menunggu persetujuan Anda"} — {list.length} pengajuan
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => { refetch(); refetchHistory() }}><RefreshCw className="h-3.5 w-3.5" /></Button>
      </div>

      {list.length === 0 && !loading ? (
        <div className="rounded-xl py-16 text-center" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          <Check className="h-10 w-10 mx-auto mb-3" style={{ color: "var(--success)" }} />
          <p className="text-sm font-semibold" style={{ color: "var(--text-900)" }}>Tidak ada pengajuan yang menunggu</p>
          <p className="text-xs mt-1" style={{ color: "var(--text-subtle)" }}>Semua pengajuan sudah diproses</p>
        </div>
      ) : (
        <DataTable data={list as unknown as Record<string, unknown>[]} columns={columns as unknown as Column<Record<string, unknown>>[]}
          searchKeys={[]} loading={loading}
          actions={(row: Record<string, unknown>) => {
            const r = row as unknown as PengajuanCuti
            const labelApprove = r.status === STATUS_CUTI.SUBMITTED ? "Setujui (Atasan)" : "Setujui (HRD Final)"
            const labelReject  = r.status === STATUS_CUTI.SUBMITTED ? "Tolak (Atasan)"   : "Tolak (HRD)"
            return (
              <div className="flex items-center justify-center gap-1">
                <Button variant="ghost" size="icon" className="h-7 w-7" style={{ color: "var(--primary)" }} onClick={() => { setSelected(r); setDetailOpen(true) }} title="Detail">
                  <Eye className="h-3.5 w-3.5" />
                </Button>
                {canReassignApprover && r.status === STATUS_CUTI.SUBMITTED && (
                  <Button variant="ghost" size="icon" className="h-7 w-7" style={{ color: "var(--warning)" }}
                    onClick={() => { setSelected(r); setReassignOpen(true) }} title="Ganti Approver">
                    <UserCog className="h-3.5 w-3.5" />
                  </Button>
                )}
                <Button variant="ghost" size="icon" className="h-7 w-7" style={{ color: "var(--success)" }}
                  onClick={() => { setSelected(r); setActionType("approve"); setActionNote("") }} title={labelApprove}>
                  <Check className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" style={{ color: "var(--danger)" }}
                  onClick={() => { setSelected(r); setActionType("reject"); setActionNote("") }} title={labelReject}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            )
          }}
        />
      )}

      <div className="rounded-xl overflow-hidden" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid var(--border)" }}>
          <div>
            <p className="text-sm font-semibold" style={{ color: "var(--text-900)" }}>Riwayat Approval Cuti</p>
            <p className="text-xs" style={{ color: "var(--text-subtle)" }}>Pengajuan yang sudah disetujui level 1 atau level 2</p>
          </div>
          <Badge variant="secondary">{historyList.length} riwayat</Badge>
        </div>
        {historyLoading ? (
          <div className="h-40 animate-pulse" style={{ background: "var(--surface-muted)" }} />
        ) : historyList.length === 0 ? (
          <div className="py-10 text-center text-sm" style={{ color: "var(--text-subtle)" }}>Belum ada riwayat approval.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
              <thead style={{ background: "var(--surface-muted)" }}>
                <tr>{["Level", "Karyawan", "Jenis", "Periode", "Diproses Oleh", "Waktu", "Catatan"].map(h => <th key={h} className="px-3 py-2 text-left text-[11px] uppercase tracking-wide" style={{ color: "var(--text-muted)", borderBottom: "1px solid var(--border)" }}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {historyList.map(r => (
                  <tr key={`${r.id}-${r.approval_history?.approval_level}-${r.approval_history?.approved_at}`}>
                    <td className="px-3 py-2" style={{ borderBottom: "1px solid var(--border)" }}><Badge variant={r.approval_history?.approval_level === 2 ? "info" : "warning"}>Level {r.approval_history?.approval_level}</Badge></td>
                    <td className="px-3 py-2 min-w-[190px]" style={{ borderBottom: "1px solid var(--border)" }}><p className="font-semibold">{r.karyawans?.nama_karyawan}</p><p className="text-xs font-mono" style={{ color: "var(--text-subtle)" }}>{r.karyawans?.nik}</p></td>
                    <td className="px-3 py-2" style={{ borderBottom: "1px solid var(--border)" }}>{r.jenis_cutis?.nama_cuti}</td>
                    <td className="px-3 py-2 font-mono text-xs whitespace-nowrap" style={{ borderBottom: "1px solid var(--border)" }}>{formatDate(r.tanggal_mulai)} - {formatDate(r.tanggal_selesai)}</td>
                    <td className="px-3 py-2" style={{ borderBottom: "1px solid var(--border)" }}>{r.approval_history?.diproses_oleh_nama ?? "—"}</td>
                    <td className="px-3 py-2 font-mono text-xs whitespace-nowrap" style={{ borderBottom: "1px solid var(--border)" }}>{formatApprovalTime(r.approval_history?.approved_at)}</td>
                    <td className="px-3 py-2 max-w-[240px] truncate" style={{ borderBottom: "1px solid var(--border)" }}>{r.approval_history?.note ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detail */}
      <Modal open={detailOpen} onClose={() => setDetailOpen(false)} title="Detail Pengajuan" size="md"
        footer={
          <div className="flex gap-2">
            {canReassignApprover && selected?.status === STATUS_CUTI.SUBMITTED && (
              <Button variant="outline" size="sm" onClick={() => setReassignOpen(true)}>
                <UserCog className="h-3.5 w-3.5 mr-1.5" />Ganti Approver
              </Button>
            )}
            <Button size="sm" style={{ background: "var(--success)", color: "#fff" }} onClick={() => { setActionType("approve"); setActionNote("") }}>
              <Check className="h-3.5 w-3.5 mr-1.5" />Setujui
            </Button>
            <Button variant="destructive" size="sm" onClick={() => { setActionType("reject"); setActionNote("") }}>
              <X className="h-3.5 w-3.5 mr-1.5" />Tolak
            </Button>
            <Button variant="outline" onClick={() => setDetailOpen(false)}>Tutup</Button>
          </div>
        }
      >
        {selected && (
          <div className="space-y-3">
            {[
              { label: "Karyawan",     value: `${selected.karyawans?.nama_karyawan} (${selected.karyawans?.nik})` },
              { label: "Jabatan",      value: selected.karyawans?.jabatan ?? "—" },
              { label: "Jenis Cuti",   value: `${selected.jenis_cutis?.kode_cuti} — ${selected.jenis_cutis?.nama_cuti}` },
              { label: "Periode",      value: `${formatDateLong(selected.tanggal_mulai)} s/d ${formatDateLong(selected.tanggal_selesai)}` },
              { label: "Jumlah Hari",  value: `${selected.jumlah_hari} hari kerja` },
              { label: "Alasan",       value: selected.alasan },
            ].map(item => (
              <div key={item.label} className="rounded-lg p-3" style={{ background: "var(--surface-muted)", border: "1px solid var(--border)" }}>
                <p className="text-xs" style={{ color: "var(--text-subtle)" }}>{item.label}</p>
                <p className="text-sm font-semibold mt-0.5" style={{ color: "var(--text-900)" }}>{item.value}</p>
              </div>
            ))}
          </div>
        )}
      </Modal>

      <ReassignApproverModal
        open={reassignOpen}
        onClose={() => setReassignOpen(false)}
        requestId={selected?.id ?? null}
        endpointBase="/api/sdm/pengajuan-cuti"
        title="Ganti Approver Cuti"
        description={selected ? `${selected.karyawans?.nama_karyawan ?? "Karyawan"} — ${selected.jenis_cutis?.nama_cuti ?? "Cuti"}` : undefined}
        onSuccess={() => { setDetailOpen(false); refetch(); refetchHistory() }}
      />

      {/* Action Confirm */}
      <Modal open={!!actionType} onClose={() => setActionType(null)}
        title={(() => {
          if (!selected) return "Konfirmasi"
          const isLevel2 = selected.status === STATUS_CUTI.APPROVED_SUPERVISOR
          if (actionType === "approve") return isLevel2 ? "Setujui Pengajuan — HRD Final" : "Setujui Pengajuan — Atasan Langsung"
          return isLevel2 ? "Tolak Pengajuan — HRD" : "Tolak Pengajuan — Atasan Langsung"
        })()} size="sm"
        footer={<>
          <Button variant="outline" onClick={() => setActionType(null)}>Batal</Button>
          <Button onClick={handleAction} disabled={actionSaving}
            style={actionType === "approve" ? { background: "var(--success)", color: "#fff" } : { background: "var(--danger)", color: "#fff" }}>
            {actionSaving ? "Memproses..." : actionType === "approve"
              ? (selected?.status === STATUS_CUTI.APPROVED_SUPERVISOR ? "Setujui (HRD Final)" : "Setujui (Atasan)")
              : (selected?.status === STATUS_CUTI.APPROVED_SUPERVISOR ? "Tolak (HRD)" : "Tolak (Atasan)")}
          </Button>
        </>}
      >
        <div className="space-y-3">
          {selected && <p className="text-sm" style={{ color: "var(--text-subtle)" }}><strong>{selected.karyawans?.nama_karyawan}</strong> — {selected.jenis_cutis?.nama_cuti} ({selected.jumlah_hari} hari)</p>}
          <TextareaField
            label={actionType === "reject" ? "Alasan Penolakan (wajib)" : "Catatan (opsional)"}
            required={actionType === "reject"}
            value={actionNote}
            onChange={e => setActionNote(e.target.value)} />
        </div>
      </Modal>
    </div>
  )
}

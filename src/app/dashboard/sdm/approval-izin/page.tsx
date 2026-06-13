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
import { STATUS_IZIN_LABELS, STATUS_IZIN_BADGE, StatusIzin, STATUS_IZIN } from "@/lib/izin"
import { useAuth } from "@/contexts/AuthContext"
import { ReassignApproverModal } from "@/components/sdm/reassign-approver-modal"

interface PengajuanIzin {
  id: number; karyawan_id: number; tanggal_mulai: string; tanggal_selesai: string
  jam_mulai: string | null; jam_selesai: string | null; durasi: number; satuan_durasi: string; alasan: string; status: string
  karyawans?: { id: number; nik: string; nama_karyawan: string; jabatan: string }
  jenis_izins?: { id: number; kode_izin: string; nama_izin: string; satuan: string }
  izin_approvals?: { id: number; approver_role: string; approval_level: number; status: string; note: string | null; approved_at: string | null }[]
  approval_history?: { approval_level: number; approver_role: string; note: string | null; approved_at: string | null; diproses_oleh_nama?: string | null }
}

function formatApprovalTime(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"
}

export default function ApprovalIzinPage() {
  const { user: authUser } = useAuth()
  const canReassignApprover = authUser?.role?.toLowerCase() === "admin" || ((authUser?.jabatan ?? "").toLowerCase().includes("kepala divisi") && (authUser?.nama_divisi ?? "").toLowerCase().includes("hrd"))
  const { data, loading, refetch } = useApi<PengajuanIzin[]>("/api/sdm/pengajuan-izin/approval-pending")
  const { data: historyData, loading: historyLoading, refetch: refetchHistory } = useApi<PengajuanIzin[]>("/api/sdm/pengajuan-izin/approval-history")
  const list = data ?? []
  const historyList = historyData ?? []

  const [selected, setSelected]     = useState<PengajuanIzin | null>(null)
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
      const res = await fetch(`/api/sdm/pengajuan-izin/${selected.id}/${actionType}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ note: actionNote }),
      })
      const j = await res.json()
      if (!res.ok) { alert(j.error ?? "Gagal"); return }
      setActionType(null); setActionNote(""); setDetailOpen(false); refetch(); refetchHistory()
    } finally { setActionSaving(false) }
  }

  const columns: Column<PengajuanIzin>[] = [
    {
      key: "level_approval", header: "Level Approval",
      cell: (r) => r.status === STATUS_IZIN.SUBMITTED
        ? <div><Badge variant="warning" className="text-[10px]">Level 1 — Atasan Langsung</Badge><p className="text-[10px] mt-0.5" style={{ color: "var(--text-subtle)" }}>Menunggu persetujuan Anda</p></div>
        : <div><Badge variant="info" className="text-[10px]">Level 2 — HRD Final</Badge><p className="text-[10px] mt-0.5" style={{ color: "var(--text-subtle)" }}>Sudah disetujui atasan</p></div>,
    },
    { key: "karyawan_id", header: "Karyawan",
      cell: (r) => <div><p className="font-semibold">{r.karyawans?.nama_karyawan ?? "—"}</p><p className="text-xs font-mono" style={{ color: "var(--text-subtle)" }}>{r.karyawans?.nik} · {r.karyawans?.jabatan}</p></div> },
    { key: "jenis_izin_id", header: "Jenis Izin",
      cell: (r) => <span><Badge variant="secondary" className="font-mono text-[10px] mr-1">{r.jenis_izins?.kode_izin}</Badge>{r.jenis_izins?.nama_izin}</span> },
    { key: "tanggal_mulai", header: "Periode",
      cell: (r) => (
        <div className="text-xs">
          <p className="font-mono">{formatDate(r.tanggal_mulai)}{r.tanggal_selesai !== r.tanggal_mulai ? ` – ${formatDate(r.tanggal_selesai)}` : ""}</p>
          {r.jam_mulai && <p className="font-mono" style={{ color: "var(--text-subtle)" }}>{r.jam_mulai.slice(0,5)} – {r.jam_selesai?.slice(0,5)}</p>}
        </div>
      ) },
    { key: "durasi", header: "Durasi", cell: (r) => <span className="font-mono font-bold">{Number(r.durasi)} {r.satuan_durasi}</span> },
  ]

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--text-900)" }}>Approval Izin</h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-subtle)" }}>Daftar pengajuan izin yang menunggu persetujuan — {list.length} pengajuan</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => { refetch(); refetchHistory() }}><RefreshCw className="h-3.5 w-3.5" /></Button>
      </div>

      {list.length === 0 && !loading ? (
        <div className="rounded-xl py-16 text-center" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          <Check className="h-10 w-10 mx-auto mb-3" style={{ color: "var(--success)" }} />
          <p className="text-sm font-semibold" style={{ color: "var(--text-900)" }}>Tidak ada pengajuan yang menunggu</p>
        </div>
      ) : (
        <DataTable data={list as unknown as Record<string, unknown>[]} columns={columns as unknown as Column<Record<string, unknown>>[]}
          searchKeys={[]} loading={loading}
          actions={(row: Record<string, unknown>) => {
            const r = row as unknown as PengajuanIzin
            const isL2 = r.status === STATUS_IZIN.APPROVED_SUPERVISOR
            return (
              <div className="flex items-center justify-center gap-1">
                <Button variant="ghost" size="icon" className="h-7 w-7" style={{ color: "var(--primary)" }} onClick={() => { setSelected(r); setDetailOpen(true) }}><Eye className="h-3.5 w-3.5" /></Button>
                {canReassignApprover && r.status === STATUS_IZIN.SUBMITTED && (
                  <Button variant="ghost" size="icon" className="h-7 w-7" style={{ color: "var(--warning)" }}
                    title="Ganti Approver" onClick={() => { setSelected(r); setReassignOpen(true) }}><UserCog className="h-3.5 w-3.5" /></Button>
                )}
                <Button variant="ghost" size="icon" className="h-7 w-7" style={{ color: "var(--success)" }}
                  title={isL2 ? "Setujui (HRD Final)" : "Setujui (Atasan)"}
                  onClick={() => { setSelected(r); setActionType("approve"); setActionNote("") }}><Check className="h-3.5 w-3.5" /></Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" style={{ color: "var(--danger)" }}
                  title={isL2 ? "Tolak (HRD)" : "Tolak (Atasan)"}
                  onClick={() => { setSelected(r); setActionType("reject"); setActionNote("") }}><X className="h-3.5 w-3.5" /></Button>
              </div>
            )
          }}
        />
      )}

      <div className="rounded-xl overflow-hidden" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid var(--border)" }}>
          <div><p className="text-sm font-semibold" style={{ color: "var(--text-900)" }}>Riwayat Approval Izin</p><p className="text-xs" style={{ color: "var(--text-subtle)" }}>Pengajuan yang sudah disetujui level 1 atau level 2</p></div>
          <Badge variant="secondary">{historyList.length} riwayat</Badge>
        </div>
        {historyLoading ? <div className="h-40 animate-pulse" style={{ background: "var(--surface-muted)" }} /> : historyList.length === 0 ? <div className="py-10 text-center text-sm" style={{ color: "var(--text-subtle)" }}>Belum ada riwayat approval.</div> : (
          <div className="overflow-x-auto"><table className="w-full text-sm" style={{ borderCollapse: "collapse" }}><thead style={{ background: "var(--surface-muted)" }}><tr>{["Level", "Karyawan", "Jenis", "Periode", "Durasi", "Diproses Oleh", "Waktu", "Catatan"].map(h => <th key={h} className="px-3 py-2 text-left text-[11px] uppercase tracking-wide" style={{ color: "var(--text-muted)", borderBottom: "1px solid var(--border)" }}>{h}</th>)}</tr></thead><tbody>
            {historyList.map(r => <tr key={`${r.id}-${r.approval_history?.approval_level}-${r.approval_history?.approved_at}`}>
              <td className="px-3 py-2" style={{ borderBottom: "1px solid var(--border)" }}><Badge variant={r.approval_history?.approval_level === 2 ? "info" : "warning"}>Level {r.approval_history?.approval_level}</Badge></td>
              <td className="px-3 py-2 min-w-[190px]" style={{ borderBottom: "1px solid var(--border)" }}><p className="font-semibold">{r.karyawans?.nama_karyawan}</p><p className="text-xs font-mono" style={{ color: "var(--text-subtle)" }}>{r.karyawans?.nik}</p></td>
              <td className="px-3 py-2" style={{ borderBottom: "1px solid var(--border)" }}>{r.jenis_izins?.nama_izin}</td>
              <td className="px-3 py-2 font-mono text-xs whitespace-nowrap" style={{ borderBottom: "1px solid var(--border)" }}>{formatDate(r.tanggal_mulai)} - {formatDate(r.tanggal_selesai)}</td>
              <td className="px-3 py-2 font-mono whitespace-nowrap" style={{ borderBottom: "1px solid var(--border)" }}>{Number(r.durasi)} {r.satuan_durasi}</td>
              <td className="px-3 py-2" style={{ borderBottom: "1px solid var(--border)" }}>{r.approval_history?.diproses_oleh_nama ?? "—"}</td>
              <td className="px-3 py-2 font-mono text-xs whitespace-nowrap" style={{ borderBottom: "1px solid var(--border)" }}>{formatApprovalTime(r.approval_history?.approved_at)}</td>
              <td className="px-3 py-2 max-w-[240px] truncate" style={{ borderBottom: "1px solid var(--border)" }}>{r.approval_history?.note ?? "—"}</td>
            </tr>)}
          </tbody></table></div>
        )}
      </div>

      {/* Detail Modal */}
      <Modal open={detailOpen} onClose={() => setDetailOpen(false)} title="Detail Izin" size="md"
        footer={
          <div className="flex gap-2">
            {canReassignApprover && selected?.status === STATUS_IZIN.SUBMITTED && (
              <Button variant="outline" size="sm" onClick={() => setReassignOpen(true)}>
                <UserCog className="h-3.5 w-3.5 mr-1.5" />Ganti Approver
              </Button>
            )}
            <Button size="sm" style={{ background: "var(--success)", color: "#fff" }} onClick={() => { setActionType("approve"); setActionNote("") }}>
              <Check className="h-3.5 w-3.5 mr-1.5" />{selected?.status === STATUS_IZIN.APPROVED_SUPERVISOR ? "Setujui (HRD)" : "Setujui (Atasan)"}
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
              { label: "Karyawan",  value: `${selected.karyawans?.nama_karyawan} (${selected.karyawans?.nik})` },
              { label: "Jabatan",   value: selected.karyawans?.jabatan ?? "—" },
              { label: "Jenis Izin", value: `${selected.jenis_izins?.kode_izin} — ${selected.jenis_izins?.nama_izin}` },
              { label: "Periode",   value: `${formatDateLong(selected.tanggal_mulai)}${selected.tanggal_selesai !== selected.tanggal_mulai ? ` s/d ${formatDateLong(selected.tanggal_selesai)}` : ""}` },
              ...(selected.jam_mulai ? [{ label: "Jam", value: `${selected.jam_mulai.slice(0,5)} – ${selected.jam_selesai?.slice(0,5)}` }] : []),
              { label: "Durasi",    value: `${Number(selected.durasi)} ${selected.satuan_durasi}` },
              { label: "Alasan",    value: selected.alasan },
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
        endpointBase="/api/sdm/pengajuan-izin"
        title="Ganti Approver Izin"
        description={selected ? `${selected.karyawans?.nama_karyawan ?? "Karyawan"} — ${selected.jenis_izins?.nama_izin ?? "Izin"}` : undefined}
        onSuccess={() => { setDetailOpen(false); refetch(); refetchHistory() }}
      />

      {/* Action Confirm */}
      <Modal open={!!actionType} onClose={() => setActionType(null)}
        title={(() => {
          if (!selected) return "Konfirmasi"
          const isL2 = selected.status === STATUS_IZIN.APPROVED_SUPERVISOR
          return actionType === "approve" ? (isL2 ? "Setujui Izin — HRD Final" : "Setujui Izin — Atasan Langsung") : (isL2 ? "Tolak Izin — HRD" : "Tolak Izin — Atasan Langsung")
        })()} size="sm"
        footer={<>
          <Button variant="outline" onClick={() => setActionType(null)}>Batal</Button>
          <Button onClick={handleAction} disabled={actionSaving}
            style={actionType === "approve" ? { background: "var(--success)", color: "#fff" } : { background: "var(--danger)", color: "#fff" }}>
            {actionSaving ? "Memproses..." : actionType === "approve" ? (selected?.status === STATUS_IZIN.APPROVED_SUPERVISOR ? "Setujui (HRD Final)" : "Setujui (Atasan)") : (selected?.status === STATUS_IZIN.APPROVED_SUPERVISOR ? "Tolak (HRD)" : "Tolak (Atasan)")}
          </Button>
        </>}
      >
        <div className="space-y-3">
          {selected && <p className="text-sm" style={{ color: "var(--text-subtle)" }}><strong>{selected.karyawans?.nama_karyawan}</strong> — {selected.jenis_izins?.nama_izin} ({Number(selected.durasi)} {selected.satuan_durasi})</p>}
          <TextareaField label={actionType === "reject" ? "Alasan Penolakan (wajib)" : "Catatan (opsional)"}
            required={actionType === "reject"}
            value={actionNote} onChange={e => setActionNote(e.target.value)} />
        </div>
      </Modal>
    </div>
  )
}

"use client"
import React, { useState, useCallback } from "react"
import { Modal } from "@/components/ui/modal"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { SelectField, TextField } from "@/components/ui/form-field"
import { History, Eye, RefreshCw, ChevronLeft, ChevronRight } from "lucide-react"

/* ─── Types ─────────────────────────────────────────────────────── */
interface AuditLog {
  id:         number
  user_id:    number | null
  user_name:  string | null
  action:     "CREATE" | "UPDATE" | "DELETE"
  model_type: string
  model_id:   number | null
  data_lama:  unknown
  data_baru:  unknown
  ip_address: string | null
  created_at: string | null
}

interface AuditResponse {
  data:        AuditLog[]
  total:       number
  page:        number
  limit:       number
  total_pages: number
}

/* ─── Constants ──────────────────────────────────────────────────── */
const MODEL_TYPE_LABELS: Record<string, string> = {
  absensi:          "Absensi",
  karyawan:         "Karyawan",
  cuti:             "Cuti",
  izin:             "Izin",
  sakit:            "Sakit",
  lembur:           "Lembur",
  jadwal_shift:     "Jadwal Shift",
  shift_kerja:      "Shift Kerja",
  hari_libur:       "Hari Libur",
  pengajuan_cuti:   "Pengajuan Cuti",
  pengajuan_izin:   "Pengajuan Izin",
  pengajuan_sakit:  "Pengajuan Sakit",
  pengajuan_lembur: "Pengajuan Lembur",
  user:             "User",
}

const ACTION_OPTIONS = [
  { value: "",       label: "Semua Aksi" },
  { value: "CREATE", label: "Tambah (CREATE)" },
  { value: "UPDATE", label: "Ubah (UPDATE)" },
  { value: "DELETE", label: "Hapus (DELETE)" },
]

const MODEL_OPTIONS = [
  { value: "", label: "Semua Modul" },
  ...Object.entries(MODEL_TYPE_LABELS).map(([v, l]) => ({ value: v, label: l })),
]

const LIMIT_OPTIONS = [
  { value: "25", label: "25 per halaman" },
  { value: "50", label: "50 per halaman" },
  { value: "100", label: "100 per halaman" },
]

function actionBadge(action: string) {
  if (action === "CREATE") return <Badge variant="success">Tambah</Badge>
  if (action === "DELETE") return <Badge variant="destructive">Hapus</Badge>
  return <Badge variant="secondary">Ubah</Badge>
}

function modelLabel(model_type: string) {
  return MODEL_TYPE_LABELS[model_type] ?? model_type
}

function formatDateTime(dt: string | null) {
  if (!dt) return "—"
  const d = new Date(dt)
  return d.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })
    + " " + d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
}

/* ─── JSON Diff Viewer ───────────────────────────────────────────── */
function JsonDiff({ lama, baru }: { lama: unknown; baru: unknown }) {
  if (!lama && !baru) return <p className="text-sm text-gray-400">Tidak ada data perubahan.</p>

  const lamaObj = (lama && typeof lama === "object") ? lama as Record<string, unknown> : null
  const baruObj = (baru && typeof baru === "object") ? baru as Record<string, unknown> : null

  if (!lamaObj && !baruObj) {
    return (
      <pre className="text-xs rounded-lg p-3 overflow-auto max-h-60" style={{ background: "var(--surface-muted)", color: "var(--text-700)" }}>
        {JSON.stringify(lama ?? baru, null, 2)}
      </pre>
    )
  }

  // Show side-by-side for UPDATE, single panel for CREATE/DELETE
  if (lamaObj && baruObj) {
    const allKeys = Array.from(new Set([...Object.keys(lamaObj), ...Object.keys(baruObj)]))
    const changedKeys = allKeys.filter(k => JSON.stringify(lamaObj[k]) !== JSON.stringify(baruObj[k]))
    const unchangedKeys = allKeys.filter(k => !changedKeys.includes(k))

    return (
      <div className="space-y-3">
        {changedKeys.length > 0 && (
          <div>
            <p className="text-xs font-semibold mb-2" style={{ color: "var(--text-subtle)" }}>Field yang berubah ({changedKeys.length})</p>
            <div className="rounded-lg overflow-hidden text-xs" style={{ border: "1px solid var(--border)" }}>
              <div className="grid grid-cols-3 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide" style={{ background: "var(--surface-muted)", color: "var(--text-subtle)", borderBottom: "1px solid var(--border)" }}>
                <span>Field</span><span className="col-span-1">Sebelum</span><span>Sesudah</span>
              </div>
              {changedKeys.map(k => (
                <div key={k} className="grid grid-cols-3 px-3 py-1.5" style={{ borderBottom: "1px solid var(--border)" }}>
                  <span className="font-mono font-semibold" style={{ color: "var(--primary)" }}>{k}</span>
                  <span className="font-mono break-all pr-2" style={{ color: "var(--error, #dc2626)" }}>
                    {lamaObj[k] == null ? <span className="italic opacity-50">null</span> : JSON.stringify(lamaObj[k])}
                  </span>
                  <span className="font-mono break-all" style={{ color: "var(--secondary, #16a34a)" }}>
                    {baruObj[k] == null ? <span className="italic opacity-50">null</span> : JSON.stringify(baruObj[k])}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
        {unchangedKeys.length > 0 && (
          <details>
            <summary className="text-xs cursor-pointer" style={{ color: "var(--text-subtle)" }}>
              {unchangedKeys.length} field tidak berubah
            </summary>
            <pre className="text-xs mt-2 rounded-lg p-3 overflow-auto max-h-40" style={{ background: "var(--surface-muted)", color: "var(--text-subtle)" }}>
              {JSON.stringify(Object.fromEntries(unchangedKeys.map(k => [k, lamaObj[k]])), null, 2)}
            </pre>
          </details>
        )}
      </div>
    )
  }

  return (
    <pre className="text-xs rounded-lg p-3 overflow-auto max-h-60" style={{ background: "var(--surface-muted)", color: "var(--text-700)" }}>
      {JSON.stringify(lamaObj ?? baruObj, null, 2)}
    </pre>
  )
}

/* ─── Main Page ──────────────────────────────────────────────────── */
export default function AuditLogPage() {
  const today = new Date().toISOString().slice(0, 10)
  const monthStart = today.slice(0, 8) + "01"

  const [filter, setFilter] = useState({
    model_type: "",
    action: "",
    user_name: "",
    date_from: monthStart,
    date_to: today,
  })
  const [page, setPage]     = useState(1)
  const [limit, setLimit]   = useState(50)
  const [data, setData]     = useState<AuditResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [detailOpen, setDetailOpen] = useState(false)
  const [selected, setSelected]     = useState<AuditLog | null>(null)

  const fetchLogs = useCallback(async (pg = page, lim = limit) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(pg), limit: String(lim) })
      if (filter.model_type) params.set("model_type", filter.model_type)
      if (filter.action)     params.set("action",     filter.action)
      if (filter.user_name)  params.set("user_name",  filter.user_name)
      if (filter.date_from)  params.set("date_from",  filter.date_from)
      if (filter.date_to)    params.set("date_to",    filter.date_to)
      const res = await fetch(`/api/audit-log?${params}`)
      if (res.ok) setData(await res.json())
    } finally {
      setLoading(false)
    }
  }, [filter, page, limit])

  // Load on mount
  React.useEffect(() => {
    const timer = window.setTimeout(() => { void fetchLogs(1, 50) }, 0)
    return () => window.clearTimeout(timer)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearch = () => { setPage(1); fetchLogs(1, limit) }
  const handlePage = (p: number) => { setPage(p); fetchLogs(p, limit) }
  const handleLimit = (e: React.ChangeEvent<HTMLSelectElement>) => { const l = parseInt(e.target.value); setLimit(l); setPage(1); fetchLogs(1, l) }

  const rows = data?.data ?? []

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ background: "var(--primary-light)" }}>
          <History className="h-5 w-5" style={{ color: "var(--primary)" }} />
        </div>
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--text-900)" }}>Audit Log</h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-subtle)" }}>
            Riwayat perubahan data di seluruh sistem
          </p>
        </div>
      </div>

      {/* Filter */}
      <div className="rounded-xl p-4 space-y-3" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SelectField
            label="Modul"
            value={filter.model_type}
            onChange={e => setFilter(f => ({ ...f, model_type: e.target.value }))}
            options={MODEL_OPTIONS}
          />
          <SelectField
            label="Aksi"
            value={filter.action}
            onChange={e => setFilter(f => ({ ...f, action: e.target.value }))}
            options={ACTION_OPTIONS}
          />
          <TextField
            label="Nama User"
            value={filter.user_name}
            onChange={e => setFilter(f => ({ ...f, user_name: (e as React.ChangeEvent<HTMLInputElement>).target.value }))}
            placeholder="Cari nama user..."
          />
          <SelectField
            label="Tampilkan"
            value={String(limit)}
            onChange={handleLimit}
            options={LIMIT_OPTIONS}
          />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <TextField
            label="Tanggal Dari"
            type="date"
            value={filter.date_from}
            onChange={e => setFilter(f => ({ ...f, date_from: (e as React.ChangeEvent<HTMLInputElement>).target.value }))}
          />
          <TextField
            label="Tanggal Sampai"
            type="date"
            value={filter.date_to}
            onChange={e => setFilter(f => ({ ...f, date_to: (e as React.ChangeEvent<HTMLInputElement>).target.value }))}
          />
          <div className="flex items-end gap-2 col-span-2">
            <Button onClick={handleSearch} disabled={loading} size="sm" className="h-9">
              {loading ? <RefreshCw className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
              Cari
            </Button>
            <Button variant="outline" size="sm" className="h-9"
              onClick={() => { setFilter({ model_type: "", action: "", user_name: "", date_from: monthStart, date_to: today }); setPage(1); setTimeout(() => fetchLogs(1, limit), 0) }}>
              Reset
            </Button>
          </div>
        </div>
      </div>

      {/* Stats */}
      {data && (
        <div className="flex items-center justify-between text-xs" style={{ color: "var(--text-subtle)" }}>
          <span>Total {data.total.toLocaleString("id-ID")} record — halaman {data.page} dari {data.total_pages}</span>
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl overflow-hidden overflow-x-auto" style={{ border: "1px solid var(--border)", background: "var(--surface)" }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: "var(--surface-muted)", borderBottom: "1px solid var(--border)" }}>
              {["#", "Waktu", "User", "Aksi", "Modul", "ID Data", ""].map(h => (
                <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-subtle)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-sm" style={{ color: "var(--text-subtle)" }}>Memuat...</td></tr>
            )}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-sm" style={{ color: "var(--text-subtle)" }}>Tidak ada data</td></tr>
            )}
            {!loading && rows.map((row, i) => (
              <tr key={row.id} style={{ borderBottom: "1px solid var(--border)" }}
                className="transition-colors" onMouseEnter={e => (e.currentTarget.style.background = "var(--surface-muted)")}
                onMouseLeave={e => (e.currentTarget.style.background = "")}>
                <td className="px-4 py-3 text-xs" style={{ color: "var(--text-subtle)" }}>
                  {(page - 1) * limit + i + 1}
                </td>
                <td className="px-4 py-3 text-xs whitespace-nowrap" style={{ color: "var(--text-700)" }}>
                  {formatDateTime(row.created_at)}
                </td>
                <td className="px-4 py-3 text-xs font-medium" style={{ color: "var(--text-900)" }}>
                  {row.user_name ?? <span className="italic opacity-50">—</span>}
                </td>
                <td className="px-4 py-3">{actionBadge(row.action)}</td>
                <td className="px-4 py-3 text-xs font-semibold" style={{ color: "var(--primary)" }}>
                  {modelLabel(row.model_type)}
                </td>
                <td className="px-4 py-3 text-xs" style={{ color: "var(--text-subtle)" }}>
                  {row.model_id ?? "—"}
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => { setSelected(row); setDetailOpen(true) }}
                    className="flex items-center gap-1 text-xs rounded-md px-2 py-1 transition-colors"
                    style={{ color: "var(--primary)" }}
                    onMouseEnter={e => (e.currentTarget.style.background = "var(--primary-light)")}
                    onMouseLeave={e => (e.currentTarget.style.background = "")}>
                    <Eye className="h-3.5 w-3.5" /> Detail
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {data && data.total_pages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => handlePage(page - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          {Array.from({ length: Math.min(5, data.total_pages) }, (_, i) => {
            const start = Math.max(1, Math.min(page - 2, data.total_pages - 4))
            const p = start + i
            return (
              <Button key={p} variant={p === page ? "default" : "outline"} size="sm"
                onClick={() => handlePage(p)} className="w-9">
                {p}
              </Button>
            )
          })}
          <Button variant="outline" size="sm" disabled={page >= data.total_pages} onClick={() => handlePage(page + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Detail Modal */}
      <Modal open={detailOpen} onClose={() => setDetailOpen(false)} title="Detail Perubahan" size="lg">
        {selected && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs mb-0.5" style={{ color: "var(--text-subtle)" }}>Waktu</p>
                <p className="font-medium" style={{ color: "var(--text-900)" }}>{formatDateTime(selected.created_at)}</p>
              </div>
              <div>
                <p className="text-xs mb-0.5" style={{ color: "var(--text-subtle)" }}>User</p>
                <p className="font-medium" style={{ color: "var(--text-900)" }}>{selected.user_name ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs mb-0.5" style={{ color: "var(--text-subtle)" }}>Aksi</p>
                {actionBadge(selected.action)}
              </div>
              <div>
                <p className="text-xs mb-0.5" style={{ color: "var(--text-subtle)" }}>Modul / ID</p>
                <p className="font-medium" style={{ color: "var(--text-900)" }}>
                  {modelLabel(selected.model_type)} #{selected.model_id ?? "—"}
                </p>
              </div>
              {selected.ip_address && (
                <div>
                  <p className="text-xs mb-0.5" style={{ color: "var(--text-subtle)" }}>IP Address</p>
                  <p className="font-mono text-xs" style={{ color: "var(--text-700)" }}>{selected.ip_address}</p>
                </div>
              )}
            </div>

            <div style={{ borderTop: "1px solid var(--border)" }} className="pt-4">
              <p className="text-sm font-semibold mb-3" style={{ color: "var(--text-900)" }}>Perubahan Data</p>
              <JsonDiff lama={selected.data_lama} baru={selected.data_baru} />
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

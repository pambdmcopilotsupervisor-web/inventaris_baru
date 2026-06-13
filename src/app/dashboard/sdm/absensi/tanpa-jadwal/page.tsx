"use client"

import React, { useMemo, useState, useEffect } from "react"
import { CalendarX, RefreshCw, ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { SearchableSelect } from "@/components/ui/searchable-select"
import { useApi } from "@/hooks/useApi"

interface Divisi {
  id: number
  kode_divisi: string
  nama_divisi: string
}

interface TanpaJadwalRow {
  id: number
  nik: string
  nama_karyawan: string
  jabatan: string
  status_karyawan: string | null
  nama_divisi: string | null
  total_hari_target: number
  total_jadwal: number
  total_tanpa_jadwal: number
  tanggal_tanpa_jadwal: string[]
  status_jadwal: "tanpa_jadwal" | "parsial" | "lengkap"
}

interface TanpaJadwalResponse {
  summary: { total: number; tanpa_jadwal: number; parsial: number; total_hari_target: number }
  data: TanpaJadwalRow[]
}

/** Format Date ke YYYY-MM-DD menggunakan komponen lokal — aman di timezone UTC+7 */
function dateInput(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-")
}

function formatTanggal(date: string) {
  return new Date(date).toLocaleDateString("id-ID", { day: "2-digit", month: "short" })
}

function SummaryCard({ label, value, tone = "var(--text-900)" }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-xl p-3" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
      <p className="text-[11px] uppercase tracking-wide font-semibold" style={{ color: "var(--text-subtle)" }}>{label}</p>
      <p className="text-2xl font-bold font-mono mt-1" style={{ color: tone }}>{value}</p>
    </div>
  )
}

export default function KaryawanTanpaJadwalPage() {
  const now = new Date()
  const [tglMulai, setTglMulai] = useState(dateInput(new Date(now.getFullYear(), now.getMonth(), 1)))
  const [tglSelesai, setTglSelesai] = useState(dateInput(new Date(now.getFullYear(), now.getMonth() + 1, 0)))
  const [divisiId, setDivisiId] = useState("")
  const [includePartial, setIncludePartial] = useState(false)

  const { data: divisis } = useApi<Divisi[]>("/api/divisi")
  const queryStr = useMemo(() => {
    const params = new URLSearchParams({ tgl_mulai: tglMulai, tgl_selesai: tglSelesai })
    if (divisiId) params.set("divisi_id", divisiId)
    if (includePartial) params.set("include_partial", "true")
    return params.toString()
  }, [tglMulai, tglSelesai, divisiId, includePartial])

  const { data, loading, error, refetch } = useApi<TanpaJadwalResponse>(`/api/sdm/absensi/tanpa-jadwal?${queryStr}`, [queryStr])
  const rows = data?.data ?? []
  const summary = data?.summary ?? { total: 0, tanpa_jadwal: 0, parsial: 0, total_hari_target: 0 }
  const divisiOpts = (divisis ?? []).map(d => ({ value: String(d.id), label: d.nama_divisi, description: d.kode_divisi }))

  // ── Paging ──────────────────────────────────────────────────────
  const PER_PAGE = 10
  const [page, setPage] = useState(1)

  // Reset ke halaman 1 setiap kali filter berubah
  useEffect(() => { setPage(1) }, [queryStr])

  const totalPages = Math.max(1, Math.ceil(rows.length / PER_PAGE))
  const paginatedRows = rows.slice((page - 1) * PER_PAGE, page * PER_PAGE)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2">
            <CalendarX className="h-5 w-5" style={{ color: "var(--danger)" }} />
            <h1 className="text-xl font-bold" style={{ color: "var(--text-900)" }}>Karyawan Aktif Tanpa Jadwal</h1>
          </div>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-subtle)" }}>Temukan pegawai aktif yang belum punya jadwal shift pada periode tertentu.</p>
        </div>
        <Button variant="outline" size="sm" onClick={refetch}><RefreshCw className="h-3.5 w-3.5 mr-1.5" />Refresh</Button>
      </div>

      <div className="rounded-xl p-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_auto] gap-4 items-end" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <div className="space-y-1.5">
          <label className="block text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Tanggal Mulai</label>
          <input type="date" value={tglMulai} onChange={e => setTglMulai(e.target.value)} className="h-8 w-full rounded-lg px-3 text-sm focus:outline-none" style={{ border: "1px solid var(--border-strong)", background: "var(--surface)", color: "var(--text-900)" }} />
        </div>
        <div className="space-y-1.5">
          <label className="block text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Tanggal Selesai</label>
          <input type="date" value={tglSelesai} onChange={e => setTglSelesai(e.target.value)} className="h-8 w-full rounded-lg px-3 text-sm focus:outline-none" style={{ border: "1px solid var(--border-strong)", background: "var(--surface)", color: "var(--text-900)" }} />
        </div>
        <SearchableSelect label="Divisi" options={divisiOpts} value={divisiId} onChange={setDivisiId} placeholder="Semua divisi" />
        <label className="flex h-8 items-center gap-2 text-sm cursor-pointer" style={{ color: "var(--text-900)" }}>
          <input type="checkbox" checked={includePartial} onChange={e => setIncludePartial(e.target.checked)} />
          Tampilkan parsial
        </label>
      </div>

      {error && <div className="rounded-xl p-4 text-sm" style={{ background: "var(--danger-soft)", color: "var(--danger)" }}>Gagal memuat laporan: {error}</div>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard label="Total Ditampilkan" value={summary.total} tone={summary.total > 0 ? "var(--danger)" : "var(--text-subtle)"} />
        <SummaryCard label="Tanpa Jadwal" value={summary.tanpa_jadwal} tone="var(--danger)" />
        <SummaryCard label="Parsial" value={summary.parsial} tone="var(--warning)" />
        <SummaryCard label="Hari Target" value={summary.total_hari_target} tone="var(--primary)" />
      </div>

      <div className="rounded-xl overflow-hidden" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid var(--border)" }}>
          <p className="text-sm font-semibold" style={{ color: "var(--text-900)" }}>Daftar Pegawai</p>
          <Badge variant="secondary">{rows.length} pegawai</Badge>
        </div>        {loading ? (
          <div className="h-72 animate-pulse" style={{ background: "var(--surface-muted)" }} />
        ) : rows.length === 0 ? (
          <div className="py-16 text-center text-sm" style={{ color: "var(--text-subtle)" }}>Semua pegawai aktif sudah memiliki jadwal pada periode ini.</div>
        ) : (
          <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
              <thead style={{ background: "var(--surface-muted)" }}>
                <tr>
                  {["#", "Pegawai", "Divisi", "Status Jadwal", "Jadwal", "Tanpa Jadwal", "Tanggal Kosong"].map(head => (
                    <th key={head} className="px-3 py-2 text-left text-[11px] uppercase tracking-wide whitespace-nowrap" style={{ color: "var(--text-muted)", borderBottom: "1px solid var(--border)" }}>{head}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paginatedRows.map((row, idx) => (
                  <tr key={row.id} className="hover:bg-black/5">
                    <td className="px-3 py-2 text-xs text-center" style={{ borderBottom: "1px solid var(--border)", color: "var(--text-subtle)" }}>
                      {(page - 1) * PER_PAGE + idx + 1}
                    </td>
                    <td className="px-3 py-2 min-w-[240px]" style={{ borderBottom: "1px solid var(--border)" }}>
                      <p className="font-semibold" style={{ color: "var(--text-900)" }}>{row.nama_karyawan}</p>
                      <p className="text-xs" style={{ color: "var(--text-subtle)" }}>{row.nik} - {row.jabatan}</p>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap" style={{ borderBottom: "1px solid var(--border)" }}>{row.nama_divisi ?? "-"}</td>
                    <td className="px-3 py-2" style={{ borderBottom: "1px solid var(--border)" }}>
                      <Badge variant={row.status_jadwal === "tanpa_jadwal" ? "destructive" : "warning"}>{row.status_jadwal === "tanpa_jadwal" ? "Tanpa Jadwal" : "Parsial"}</Badge>
                    </td>
                    <td className="px-3 py-2 font-mono" style={{ borderBottom: "1px solid var(--border)" }}>{row.total_jadwal}/{row.total_hari_target}</td>
                    <td className="px-3 py-2 font-mono" style={{ borderBottom: "1px solid var(--border)" }}>{row.total_tanpa_jadwal}</td>
                    <td className="px-3 py-2 min-w-[280px]" style={{ borderBottom: "1px solid var(--border)" }}>
                      <div className="flex flex-wrap gap-1">
                        {row.tanggal_tanpa_jadwal.slice(0, 12).map(tanggal => <Badge key={tanggal} variant="secondary" className="text-[10px]">{formatTanggal(tanggal)}</Badge>)}
                        {row.tanggal_tanpa_jadwal.length > 12 && <Badge variant="info" className="text-[10px]">+{row.tanggal_tanpa_jadwal.length - 12}</Badge>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* ── Paging Controls ───────────────────────────────── */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3" style={{ borderTop: "1px solid var(--border)" }}>
              <p className="text-xs" style={{ color: "var(--text-subtle)" }}>
                Menampilkan {(page - 1) * PER_PAGE + 1}–{Math.min(page * PER_PAGE, rows.length)} dari {rows.length} pegawai
              </p>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="h-7 w-7" disabled={page === 1} onClick={() => setPage(1)}>
                  <ChevronLeft className="h-4 w-4" /><ChevronLeft className="h-4 w-4 -ml-2" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  const start = Math.max(1, Math.min(page - 2, totalPages - 4))
                  const p = start + i
                  return (
                    <button key={p} onClick={() => setPage(p)}
                      className="h-7 min-w-[28px] px-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer"
                      style={p === page ? { background: "var(--primary)", color: "#fff" } : { color: "var(--text-muted)" }}>
                      {p}
                    </button>
                  )
                })}
                <Button variant="ghost" size="icon" className="h-7 w-7" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" disabled={page === totalPages} onClick={() => setPage(totalPages)}>
                  <ChevronRight className="h-4 w-4" /><ChevronRight className="h-4 w-4 -ml-2" />
                </Button>
              </div>
            </div>
          )}
          </>
        )}
      </div>
    </div>
  )
}

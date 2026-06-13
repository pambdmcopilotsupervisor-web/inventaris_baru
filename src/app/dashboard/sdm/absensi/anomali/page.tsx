"use client"

import React, { useMemo, useState } from "react"
import { AlertTriangle, FilterX, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { SearchableSelect } from "@/components/ui/searchable-select"
import { useApi } from "@/hooks/useApi"
import { STATUS_ABSENSI_BADGE, STATUS_ABSENSI_LABELS, StatusAbsensi } from "@/lib/attendance"

interface Karyawan {
  id: number
  nik: string
  nama_karyawan: string
  jabatan: string
  status_karyawan: string | null
  divisi_id: number | null
}

interface Divisi {
  id: number
  kode_divisi: string
  nama_divisi: string
}

interface AnomalyRow {
  id: number
  tanggal_absensi: string
  jam_masuk: string | null
  jam_pulang: string | null
  status_absensi: string
  is_terlambat: boolean
  is_pulang_cepat: boolean
  is_tidak_absen_masuk: boolean
  is_tidak_absen_pulang: boolean
  menit_terlambat: number
  menit_pulang_cepat: number
  alasan_manual: string | null
  anomaly_types: string[]
  karyawans: { nik: string; nama_karyawan: string; jabatan: string; divisis?: { nama_divisi: string } | null }
  jadwal_shifts?: { shift_kerjas?: { kode_shift: string; nama_shift: string; jam_masuk: string; jam_pulang: string } | null } | null
}

interface AnomalyResponse {
  summary: Record<string, number>
  data: AnomalyRow[]
}

const ANOMALY_OPTIONS = [
  { key: "terlambat", label: "Terlambat" },
  { key: "pulang_cepat", label: "Pulang Cepat" },
  { key: "tidak_absen_masuk", label: "Tidak Absen Masuk" },
  { key: "tidak_absen_pulang", label: "Tidak Absen Pulang" },
  { key: "di_luar_jam_absen", label: "Di Luar Jam" },
  { key: "alpha", label: "Alpha" },
]

/** Format Date ke YYYY-MM-DD menggunakan komponen lokal — aman di timezone UTC+7 */
function dateInput(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-")
}

function formatTanggal(date: string) {
  return new Date(date).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })
}

function formatJam(jam: string | null) {
  return jam ? jam.slice(0, 5) : "-"
}

function formatMenit(menit: number) {
  if (!menit) return "-"
  const jam = Math.floor(menit / 60)
  const sisa = menit % 60
  return jam > 0 ? `${jam}j ${sisa}m` : `${sisa}m`
}

function statusVariant(status: string) {
  return STATUS_ABSENSI_BADGE[status as StatusAbsensi] as "success" | "warning" | "destructive" | "secondary" | "info" | undefined
}

function statusLabel(status: string) {
  return STATUS_ABSENSI_LABELS[status as StatusAbsensi] ?? status
}

function SummaryCard({ label, value, tone = "var(--text-900)" }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-xl p-3" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
      <p className="text-[11px] uppercase tracking-wide font-semibold" style={{ color: "var(--text-subtle)" }}>{label}</p>
      <p className="text-2xl font-bold font-mono mt-1" style={{ color: tone }}>{value}</p>
    </div>
  )
}

export default function LaporanAnomaliAbsensiPage() {
  const now = new Date()
  const [tglMulai, setTglMulai] = useState(dateInput(new Date(now.getFullYear(), now.getMonth(), 1)))
  const [tglSelesai, setTglSelesai] = useState(dateInput(new Date(now.getFullYear(), now.getMonth() + 1, 0)))
  const [karyawanId, setKaryawanId] = useState("")
  const [divisiId, setDivisiId] = useState("")
  const [selectedTypes, setSelectedTypes] = useState<string[]>([])

  const { data: karyawans } = useApi<Karyawan[]>("/api/karyawan")
  const { data: divisis } = useApi<Divisi[]>("/api/divisi")

  const queryStr = useMemo(() => {
    const params = new URLSearchParams({ tgl_mulai: tglMulai, tgl_selesai: tglSelesai })
    if (karyawanId) params.set("karyawan_id", karyawanId)
    if (divisiId) params.set("divisi_id", divisiId)
    if (selectedTypes.length > 0) params.set("types", selectedTypes.join(","))
    return params.toString()
  }, [tglMulai, tglSelesai, karyawanId, divisiId, selectedTypes])

  const { data, loading, error, refetch } = useApi<AnomalyResponse>(`/api/sdm/absensi/anomali?${queryStr}`, [queryStr])
  const rows = data?.data ?? []
  const summary = data?.summary ?? {}

  const karyawanOpts = (karyawans ?? [])
    .filter(k => k.status_karyawan !== "Pensiun" && k.status_karyawan !== "Nonaktif")
    .map(k => ({ value: String(k.id), label: `${k.nik} - ${k.nama_karyawan}`, description: k.jabatan }))
  const divisiOpts = (divisis ?? []).map(d => ({ value: String(d.id), label: d.nama_divisi, description: d.kode_divisi }))

  const toggleType = (type: string) => {
    setSelectedTypes(prev => prev.includes(type) ? prev.filter(item => item !== type) : [...prev, type])
  }

  const resetFilters = () => {
    setKaryawanId("")
    setDivisiId("")
    setSelectedTypes([])
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" style={{ color: "var(--warning)" }} />
            <h1 className="text-xl font-bold" style={{ color: "var(--text-900)" }}>Laporan Anomali Absensi</h1>
          </div>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-subtle)" }}>Pantau terlambat, pulang cepat, alpha, tidak absen, dan absen di luar window shift.</p>
        </div>
        <Button variant="outline" size="sm" onClick={refetch}><RefreshCw className="h-3.5 w-3.5 mr-1.5" />Refresh</Button>
      </div>

      <div className="rounded-xl p-4 space-y-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 items-end">
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Tanggal Mulai</label>
            <input type="date" value={tglMulai} onChange={e => setTglMulai(e.target.value)} className="h-8 w-full rounded-lg px-3 text-sm focus:outline-none" style={{ border: "1px solid var(--border-strong)", background: "var(--surface)", color: "var(--text-900)" }} />
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Tanggal Selesai</label>
            <input type="date" value={tglSelesai} onChange={e => setTglSelesai(e.target.value)} className="h-8 w-full rounded-lg px-3 text-sm focus:outline-none" style={{ border: "1px solid var(--border-strong)", background: "var(--surface)", color: "var(--text-900)" }} />
          </div>
          <SearchableSelect label="Divisi" options={divisiOpts} value={divisiId} onChange={setDivisiId} placeholder="Semua divisi" />
          <SearchableSelect label="Karyawan" options={karyawanOpts} value={karyawanId} onChange={setKaryawanId} placeholder="Semua pegawai" />
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>Jenis anomali:</span>
          {ANOMALY_OPTIONS.map(opt => (
            <Button key={opt.key} type="button" variant={selectedTypes.includes(opt.key) ? "default" : "outline"} size="sm" onClick={() => toggleType(opt.key)}>
              {opt.label}
            </Button>
          ))}
          <Button type="button" variant="ghost" size="sm" onClick={resetFilters}><FilterX className="h-3.5 w-3.5 mr-1.5" />Reset</Button>
        </div>
      </div>

      {error && <div className="rounded-xl p-4 text-sm" style={{ background: "var(--danger-soft)", color: "var(--danger)" }}>Gagal memuat laporan: {error}</div>}

      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-7 gap-3">
        <SummaryCard label="Total" value={summary.total ?? 0} tone={(summary.total ?? 0) > 0 ? "var(--danger)" : "var(--text-subtle)"} />
        {ANOMALY_OPTIONS.map(opt => <SummaryCard key={opt.key} label={opt.label} value={summary[opt.key] ?? 0} tone="var(--warning)" />)}
      </div>

      <div className="rounded-xl overflow-hidden" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid var(--border)" }}>
          <p className="text-sm font-semibold" style={{ color: "var(--text-900)" }}>Detail Anomali</p>
          <Badge variant="secondary">{rows.length} record</Badge>
        </div>
        {loading ? (
          <div className="h-72 animate-pulse" style={{ background: "var(--surface-muted)" }} />
        ) : rows.length === 0 ? (
          <div className="py-16 text-center text-sm" style={{ color: "var(--text-subtle)" }}>Tidak ada anomali pada filter ini.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
              <thead style={{ background: "var(--surface-muted)" }}>
                <tr>
                  {["Tanggal", "Pegawai", "Divisi", "Shift", "Masuk", "Pulang", "Status", "Anomali", "Durasi"].map(head => (
                    <th key={head} className="px-3 py-2 text-left text-[11px] uppercase tracking-wide whitespace-nowrap" style={{ color: "var(--text-muted)", borderBottom: "1px solid var(--border)" }}>{head}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <tr key={row.id} className="hover:bg-black/5">
                    <td className="px-3 py-2 whitespace-nowrap" style={{ borderBottom: "1px solid var(--border)" }}>{formatTanggal(row.tanggal_absensi)}</td>
                    <td className="px-3 py-2 min-w-[220px]" style={{ borderBottom: "1px solid var(--border)" }}>
                      <p className="font-semibold" style={{ color: "var(--text-900)" }}>{row.karyawans.nama_karyawan}</p>
                      <p className="text-xs" style={{ color: "var(--text-subtle)" }}>{row.karyawans.nik} - {row.karyawans.jabatan}</p>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap" style={{ borderBottom: "1px solid var(--border)" }}>{row.karyawans.divisis?.nama_divisi ?? "-"}</td>
                    <td className="px-3 py-2 whitespace-nowrap" style={{ borderBottom: "1px solid var(--border)" }}>{row.jadwal_shifts?.shift_kerjas?.kode_shift ?? "-"}</td>
                    <td className="px-3 py-2 font-mono" style={{ borderBottom: "1px solid var(--border)" }}>{formatJam(row.jam_masuk)}</td>
                    <td className="px-3 py-2 font-mono" style={{ borderBottom: "1px solid var(--border)" }}>{formatJam(row.jam_pulang)}</td>
                    <td className="px-3 py-2" style={{ borderBottom: "1px solid var(--border)" }}><Badge variant={statusVariant(row.status_absensi)}>{statusLabel(row.status_absensi)}</Badge></td>
                    <td className="px-3 py-2 min-w-[220px]" style={{ borderBottom: "1px solid var(--border)" }}>
                      <div className="flex flex-wrap gap-1">
                        {row.anomaly_types.map(type => <Badge key={type} variant="warning" className="text-[10px]">{ANOMALY_OPTIONS.find(opt => opt.key === type)?.label ?? type}</Badge>)}
                      </div>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap" style={{ borderBottom: "1px solid var(--border)" }}>
                      <span className="font-mono">T: {formatMenit(row.menit_terlambat)}</span>
                      <span className="mx-1" style={{ color: "var(--text-subtle)" }}>/</span>
                      <span className="font-mono">PC: {formatMenit(row.menit_pulang_cepat)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

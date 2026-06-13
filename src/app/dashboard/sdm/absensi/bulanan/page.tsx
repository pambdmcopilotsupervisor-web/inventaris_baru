"use client"

import React, { useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { SearchableSelect } from "@/components/ui/searchable-select"
import { useApi } from "@/hooks/useApi"
import { STATUS_ABSENSI_BADGE, STATUS_ABSENSI_LABELS, StatusAbsensi } from "@/lib/attendance"
import { ChevronLeft, ChevronRight, CalendarDays, Table2, RefreshCw } from "lucide-react"

interface Karyawan {
  id: number
  nik: string
  nama_karyawan: string
  jabatan: string
  status_karyawan: string | null
}

interface DetailAbsensiBulanan {
  id: number | null
  tanggal_absensi: string
  jam_masuk: string | null
  jam_pulang: string | null
  status_absensi: string
  is_terlambat?: boolean
  is_pulang_cepat?: boolean
  is_tidak_absen_masuk?: boolean
  is_tidak_absen_pulang?: boolean
  menit_terlambat: number
  menit_pulang_cepat: number
  total_jam_kerja_menit: number
  alasan_manual: string | null
  catatan_manual: string | null
  sumber_rekap?: string
  hari_libur?: { nama_libur: string; tipe_libur: string } | null
  jadwal_shifts?: { shift_kerjas?: { kode_shift: string; nama_shift: string; jam_masuk: string; jam_pulang: string } | null } | null
}

interface RekapResponse {
  karyawan: { id: number; nik: string; nama_karyawan: string; jabatan: string } | null
  detail: DetailAbsensiBulanan[]
}

const BULAN_ID = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"]
const HARI_ID = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"]

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

function getFlagLabels(row: DetailAbsensiBulanan) {
  const flags: string[] = []
  if (row.is_terlambat) flags.push("Terlambat")
  if (row.is_pulang_cepat) flags.push("Pulang cepat")
  if (row.is_tidak_absen_masuk) flags.push("Tidak absen masuk")
  if (row.is_tidak_absen_pulang) flags.push("Tidak absen pulang")
  return flags
}

function statusVariant(status: string) {
  return STATUS_ABSENSI_BADGE[status as StatusAbsensi] as "success" | "warning" | "destructive" | "secondary" | "info" | undefined
}

function statusLabel(status: string) {
  return STATUS_ABSENSI_LABELS[status as StatusAbsensi] ?? status
}

function statusColor(status: string) {
  switch (status) {
    case "hadir": return "var(--success)"
    case "terlambat": return "var(--warning)"
    case "pulang_cepat": return "var(--warning)"
    case "di_luar_jam_absen": return "var(--warning)"
    case "alpha": return "var(--danger)"
    case "sakit": return "var(--info)"
    case "cuti": return "var(--primary)"
    case "izin": return "var(--primary)"
    case "libur": return "var(--text-subtle)"
    default: return "var(--text-muted)"
  }
}

function SummaryCard({ label, value, color = "var(--text-900)", note }: { label: string; value: number | string; color?: string; note?: string }) {
  return (
    <div className="rounded-xl p-3" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
      <p className="text-[11px] uppercase tracking-wide font-semibold" style={{ color: "var(--text-subtle)" }}>{label}</p>
      <p className="text-xl font-bold font-mono mt-1" style={{ color }}>{value}</p>
      {note && <p className="text-[10px] mt-0.5" style={{ color: "var(--text-subtle)" }}>{note}</p>}
    </div>
  )
}

function buildCalendarCells(detail: DetailAbsensiBulanan[], bulan: number, tahun: number) {
  const first = new Date(tahun, bulan - 1, 1)
  const last = new Date(tahun, bulan, 0)

  /** Format Date ke YYYY-MM-DD pakai komponen lokal — aman di UTC+7 */
  function localKey(d: Date) {
    return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-")
  }

  // Tanggal dari API adalah UTC ISO string "2026-06-01T00:00:00.000Z"
  // Ambil bagian tanggal (YYYY-MM-DD) dulu, lalu jadikan noon UTC agar getDate() lokal benar
  const map = new Map(detail.map(row => {
    const datePart = String(row.tanggal_absensi).slice(0, 10)  // "2026-06-01"
    const d = new Date(datePart + "T12:00:00Z")                 // noon UTC — aman di ±12 timezone
    return [localKey(d), row]
  }))

  const cells: Array<{ date: Date | null; row: DetailAbsensiBulanan | null }> = []
  for (let i = 0; i < first.getDay(); i++) cells.push({ date: null, row: null })
  for (let day = 1; day <= last.getDate(); day++) {
    const date = new Date(tahun, bulan - 1, day)
    const key = localKey(date)                         // local components → aman
    cells.push({ date, row: map.get(key) ?? null })
  }
  while (cells.length % 7 !== 0) cells.push({ date: null, row: null })
  return cells
}

export default function AbsensiBulananPage() {
  const now = new Date()
  const [bulan, setBulan] = useState(now.getMonth() + 1)
  const [tahun, setTahun] = useState(now.getFullYear())
  const [karyawanId, setKaryawanId] = useState("")
  const [mode, setMode] = useState<"table" | "calendar">("table")

  const { data: karyawans } = useApi<Karyawan[]>("/api/karyawan")
  const karyawanOpts = (karyawans ?? [])
    .filter(k => k.status_karyawan !== "Pensiun" && k.status_karyawan !== "Nonaktif")
    .map(k => ({ value: String(k.id), label: `${k.nik} - ${k.nama_karyawan}`, description: k.jabatan }))

  const queryStr = karyawanId ? `karyawan_id=${karyawanId}&bulan=${bulan}&tahun=${tahun}` : ""
  const { data, loading, refetch } = useApi<RekapResponse>(queryStr ? `/api/sdm/absensi/rekap?${queryStr}` : "", [queryStr])
  const detail = useMemo(() => [...(data?.detail ?? [])].sort((a, b) => new Date(a.tanggal_absensi).getTime() - new Date(b.tanggal_absensi).getTime()), [data?.detail])
  const calendarCells = useMemo(() => buildCalendarCells(detail, bulan, tahun), [detail, bulan, tahun])
  const summary = useMemo(() => {
    const statusCounts: Record<string, number> = {}
    let totalMenitKerja = 0
    let totalMenitTerlambat = 0
    let totalMenitPulangCepat = 0
    let totalFlags = 0
    let totalManual = 0
    let totalKalender = 0

    for (const row of detail) {
      statusCounts[row.status_absensi] = (statusCounts[row.status_absensi] ?? 0) + 1
      totalMenitKerja += row.total_jam_kerja_menit ?? 0
      totalMenitTerlambat += row.menit_terlambat ?? 0
      totalMenitPulangCepat += row.menit_pulang_cepat ?? 0
      if (getFlagLabels(row).length > 0) totalFlags++
      if (row.alasan_manual) totalManual++
      if (row.sumber_rekap === "kalender") totalKalender++
    }

    return { statusCounts, totalMenitKerja, totalMenitTerlambat, totalMenitPulangCepat, totalFlags, totalManual, totalKalender }
  }, [detail])

  const prevBulan = () => { if (bulan === 1) { setBulan(12); setTahun(y => y - 1) } else setBulan(b => b - 1) }
  const nextBulan = () => { if (bulan === 12) { setBulan(1); setTahun(y => y + 1) } else setBulan(b => b + 1) }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--text-900)" }}>Absensi Bulanan Pegawai</h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-subtle)" }}>Lihat absensi tanggal 1 sampai akhir bulan dalam bentuk tabel dan kalender</p>
        </div>
        <Button variant="outline" size="sm" onClick={refetch}><RefreshCw className="h-3.5 w-3.5" /></Button>
      </div>

      <div className="rounded-xl p-4 grid grid-cols-1 lg:grid-cols-[1fr_auto_auto] gap-4 items-end" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <SearchableSelect label="Karyawan" options={karyawanOpts} value={karyawanId} onChange={setKaryawanId} placeholder="Pilih pegawai..." />
        <div className="space-y-1.5">
          <label className="block text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Periode</label>
          <div className="flex items-center gap-2 min-w-[240px]">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={prevBulan}><ChevronLeft className="h-4 w-4" /></Button>
            <span className="flex-1 text-center text-sm font-semibold" style={{ color: "var(--text-900)" }}>{BULAN_ID[bulan - 1]} {tahun}</span>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={nextBulan}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant={mode === "table" ? "default" : "outline"} size="sm" onClick={() => setMode("table")}><Table2 className="h-3.5 w-3.5 mr-1.5" />Tabel</Button>
          <Button variant={mode === "calendar" ? "default" : "outline"} size="sm" onClick={() => setMode("calendar")}><CalendarDays className="h-3.5 w-3.5 mr-1.5" />Kalender</Button>
        </div>
      </div>

      {!karyawanId ? (
        <div className="rounded-xl py-16 text-center" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          <p className="text-sm" style={{ color: "var(--text-subtle)" }}>Pilih pegawai untuk melihat absensi bulanan.</p>
        </div>
      ) : loading ? (
        <div className="h-72 rounded-xl animate-pulse" style={{ background: "var(--surface-muted)" }} />
      ) : (
        <div className="space-y-4">
          {data?.karyawan && (
            <div className="rounded-2xl p-4" style={{ background: "linear-gradient(135deg, var(--surface), var(--surface-muted))", border: "1px solid var(--border)" }}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-bold text-lg" style={{ color: "var(--text-900)" }}>{data.karyawan.nama_karyawan}</p>
                  <p className="text-xs mt-0.5" style={{ color: "var(--text-subtle)" }}>{data.karyawan.nik} - {data.karyawan.jabatan} - {BULAN_ID[bulan - 1]} {tahun}</p>
                </div>
                <div className="text-right">
                  <p className="text-[11px] uppercase tracking-wide font-semibold" style={{ color: "var(--text-subtle)" }}>Total Kalender</p>
                  <p className="text-2xl font-bold font-mono" style={{ color: "var(--primary)" }}>{detail.length}</p>
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <SummaryCard label="Hadir" value={summary.statusCounts.hadir ?? 0} color="var(--success)" />
            <SummaryCard label="Terlambat" value={summary.statusCounts.terlambat ?? 0} color="var(--warning)" note={`${formatMenit(summary.totalMenitTerlambat)} total`} />
            <SummaryCard label="Pulang Cepat" value={summary.statusCounts.pulang_cepat ?? 0} color="var(--warning)" note={`${formatMenit(summary.totalMenitPulangCepat)} total`} />
            <SummaryCard label="Alpha" value={summary.statusCounts.alpha ?? 0} color="var(--danger)" />
            <SummaryCard label="Cuti" value={summary.statusCounts.cuti ?? 0} color="var(--primary)" />
            <SummaryCard label="Izin" value={summary.statusCounts.izin ?? 0} color="var(--primary)" />
            <SummaryCard label="Sakit" value={summary.statusCounts.sakit ?? 0} color="var(--info)" />
            <SummaryCard label="Libur" value={summary.statusCounts.libur ?? 0} color="var(--text-subtle)" />
            <SummaryCard label="Luar Jam" value={summary.statusCounts.di_luar_jam_absen ?? 0} color="var(--warning)" />
            <SummaryCard label="Anomali" value={summary.totalFlags} color={summary.totalFlags > 0 ? "var(--danger)" : "var(--text-subtle)"} />
            <SummaryCard label="Manual" value={summary.totalManual} color="var(--warning)" />
            <SummaryCard label="Jam Kerja" value={formatMenit(summary.totalMenitKerja)} color="var(--primary)" />
          </div>

          <div className="rounded-xl p-3 flex flex-wrap gap-2 items-center" style={{ background: "var(--surface-muted)", border: "1px solid var(--border)" }}>
            <span className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>Legenda:</span>
            {Object.entries(summary.statusCounts).sort(([a], [b]) => a.localeCompare(b)).map(([status, count]) => (
              <Badge key={status} variant={statusVariant(status)} className="text-[10px]">{statusLabel(status)}: {count}</Badge>
            ))}
            {summary.totalKalender > 0 && <Badge variant="info" className="text-[10px]">Dari kalender: {summary.totalKalender}</Badge>}
          </div>

          {mode === "table" ? (
            <div className="rounded-xl overflow-hidden" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
                  <thead style={{ background: "var(--surface-muted)" }}>
                    <tr>
                      {["Tanggal", "Shift", "Masuk", "Pulang", "Status", "Keterangan", "Jam Kerja"].map(head => (
                        <th key={head} className="px-3 py-2 text-left text-[11px] uppercase tracking-wide" style={{ color: "var(--text-muted)", borderBottom: "1px solid var(--border)" }}>{head}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {detail.map(row => {
                      const flags = getFlagLabels(row)
                      return (
                        <tr key={row.tanggal_absensi} style={{ borderBottom: "1px solid var(--border)" }}>
                          <td className="px-3 py-2 font-mono text-xs">{formatTanggal(row.tanggal_absensi)}</td>
                          <td className="px-3 py-2 text-xs">
                            {row.jadwal_shifts?.shift_kerjas ? (
                              <div>
                                <Badge variant="secondary" className="font-mono text-[10px] mr-1">{row.jadwal_shifts.shift_kerjas.kode_shift}</Badge>
                                <span>{row.jadwal_shifts.shift_kerjas.nama_shift}</span>
                              </div>
                            ) : row.hari_libur ? <span>{row.hari_libur.nama_libur}</span> : <span style={{ color: "var(--text-subtle)" }}>-</span>}
                          </td>
                          <td className="px-3 py-2 font-mono text-xs">{formatJam(row.jam_masuk)}</td>
                          <td className="px-3 py-2 font-mono text-xs">{formatJam(row.jam_pulang)}</td>
                          <td className="px-3 py-2"><Badge variant={statusVariant(row.status_absensi)}>{statusLabel(row.status_absensi)}</Badge></td>
                          <td className="px-3 py-2 text-xs">
                            <div className="flex flex-wrap gap-1">
                              {flags.map(flag => <Badge key={flag} variant="secondary" className="text-[10px]">{flag}</Badge>)}
                              {row.sumber_rekap === "kalender" && <Badge variant="info" className="text-[10px]">Dari kalender</Badge>}
                              {row.alasan_manual && <Badge variant="warning" className="text-[10px]">Manual</Badge>}
                              {flags.length === 0 && row.sumber_rekap !== "kalender" && !row.alasan_manual && <span style={{ color: "var(--text-subtle)" }}>-</span>}
                            </div>
                          </td>
                          <td className="px-3 py-2 font-mono text-xs">{formatMenit(row.total_jam_kerja_menit)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="rounded-xl p-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
              <div className="grid grid-cols-7 gap-2 mb-2">
                {HARI_ID.map(hari => <div key={hari} className="text-center text-xs font-semibold" style={{ color: "var(--text-subtle)" }}>{hari}</div>)}
              </div>
              <div className="grid grid-cols-7 gap-2">
                {calendarCells.map((cell, index) => (
                  <div key={index} className="min-h-[118px] rounded-xl p-2" style={{ background: cell.date ? "var(--surface-muted)" : "transparent", border: cell.date ? `1px solid ${cell.row ? statusColor(cell.row.status_absensi) : "var(--border)"}` : "1px solid transparent", boxShadow: cell.row ? `inset 3px 0 0 ${statusColor(cell.row.status_absensi)}` : undefined }}>
                    {cell.date && cell.row && (
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-xs font-bold font-mono" style={{ color: "var(--text-900)" }}>{cell.date.getDate()}</span>
                          <Badge variant={statusVariant(cell.row.status_absensi)} className="text-[9px] px-1.5 py-0.5">{statusLabel(cell.row.status_absensi)}</Badge>
                        </div>
                        <div className="text-[10px] font-mono" style={{ color: "var(--text-subtle)" }}>{formatJam(cell.row.jam_masuk)} / {formatJam(cell.row.jam_pulang)}</div>
                        {cell.row.jadwal_shifts?.shift_kerjas && <div className="text-[10px] truncate" style={{ color: "var(--text-muted)" }}>{cell.row.jadwal_shifts.shift_kerjas.kode_shift} {cell.row.jadwal_shifts.shift_kerjas.jam_masuk.slice(0,5)}-{cell.row.jadwal_shifts.shift_kerjas.jam_pulang.slice(0,5)}</div>}
                        <div className="flex flex-wrap gap-1">
                          {getFlagLabels(cell.row).slice(0, 2).map(flag => <Badge key={flag} variant="secondary" className="text-[9px] px-1">{flag}</Badge>)}
                          {cell.row.sumber_rekap === "kalender" && <Badge variant="info" className="text-[9px] px-1">Kalender</Badge>}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

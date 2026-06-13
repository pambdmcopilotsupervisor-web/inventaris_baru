"use client"
import React, { useState } from "react"
import { DataTable, Column } from "@/components/ui/data-table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { RefreshCw, ChevronLeft, ChevronRight } from "lucide-react"
import { formatDate } from "@/lib/utils"
import { useApi } from "@/hooks/useApi"
import { SearchableSelect } from "@/components/ui/searchable-select"
import { STATUS_ABSENSI_LABELS, STATUS_ABSENSI_BADGE, StatusAbsensi } from "@/lib/attendance"

interface AbsensiRow {
  id: number; tanggal_absensi: string; jam_masuk: string | null; jam_pulang: string | null
  status_absensi: string; menit_terlambat: number; menit_pulang_cepat: number
  total_jam_kerja_menit: number; is_manual: boolean; alasan_manual: string | null; catatan_manual: string | null
  jadwal_shifts?: { shift_kerjas?: { kode_shift: string; jam_masuk: string; jam_pulang: string } | null } | null
}
interface Karyawan { id: number; nik: string; nama_karyawan: string; jabatan: string; status_karyawan: string | null }

const HARI = ["Minggu","Senin","Selasa","Rabu","Kamis","Jumat","Sabtu"]
function formatMenit(m: number) { if (!m) return "—"; const j = Math.floor(m/60); const mn = m%60; return j > 0 ? `${j}j ${mn}m` : `${mn}m` }

export default function RiwayatAbsensiPage() {
  const now = new Date()
  const [bulan, setBulan] = useState(now.getMonth() + 1)
  const [tahun, setTahun] = useState(now.getFullYear())
  const [karyawanId, setKaryawanId] = useState("")

  const { data: karyawans } = useApi<Karyawan[]>("/api/karyawan")
  const karyawanOpts = (karyawans ?? [])
    .filter(k => k.status_karyawan !== "Pensiun" && k.status_karyawan !== "Nonaktif")
    .map(k => ({ value: String(k.id), label: `${k.nik} — ${k.nama_karyawan}`, description: k.jabatan }))

  const queryStr = karyawanId
    ? `karyawan_id=${karyawanId}&tgl_mulai=${tahun}-${String(bulan).padStart(2,"0")}-01&tgl_selesai=${tahun}-${String(bulan).padStart(2,"0")}-${new Date(tahun, bulan, 0).getDate()}`
    : ""

  const { data, loading, refetch } = useApi<AbsensiRow[]>(
    queryStr ? `/api/sdm/absensi?${queryStr}` : "",
    [queryStr]
  )
  const list = (queryStr ? data : null) ?? []

  const BULAN = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"]
  const prevBulan = () => { if (bulan === 1) { setBulan(12); setTahun(y => y-1) } else setBulan(b => b-1) }
  const nextBulan = () => { if (bulan === 12) { setBulan(1); setTahun(y => y+1) } else setBulan(b => b+1) }

  const columns: Column<AbsensiRow>[] = [
    {
      key: "tanggal_absensi", header: "Tanggal",
      cell: (r) => (
        <div>
          <p className="font-semibold text-sm">{formatDate(r.tanggal_absensi)}</p>
          <p className="text-xs" style={{ color: "var(--text-subtle)" }}>{HARI[new Date(r.tanggal_absensi + "T12:00:00Z").getDay()]}</p>
        </div>
      ),
    },
    {
      key: "jadwal_shifts", header: "Shift",
      cell: (r) => r.jadwal_shifts?.shift_kerjas
        ? <span className="font-mono text-xs"><Badge variant="secondary" className="mr-1">{r.jadwal_shifts.shift_kerjas.kode_shift}</Badge>{r.jadwal_shifts.shift_kerjas.jam_masuk.slice(0,5)}–{r.jadwal_shifts.shift_kerjas.jam_pulang.slice(0,5)}</span>
        : <span style={{ color: "var(--text-subtle)" }}>—</span>,
    },
    {
      key: "jam_masuk", header: "Masuk / Pulang",
      cell: (r) => <span className="font-mono text-sm">{r.jam_masuk?.slice(0,5) ?? "—"} / {r.jam_pulang?.slice(0,5) ?? "—"}</span>,
    },
    {
      key: "status_absensi", header: "Status",
      cell: (r) => (
        <Badge variant={STATUS_ABSENSI_BADGE[r.status_absensi as StatusAbsensi] as "success"|"warning"|"destructive"|"secondary"|"info"}>
          {STATUS_ABSENSI_LABELS[r.status_absensi as StatusAbsensi] ?? r.status_absensi}
        </Badge>
      ),
    },
    {
      key: "menit_terlambat", header: "Terlambat",
      cell: (r) => <span className="text-xs" style={{ color: r.menit_terlambat > 0 ? "var(--danger)" : "var(--text-subtle)" }}>{formatMenit(r.menit_terlambat)}</span>,
    },
    {
      key: "menit_pulang_cepat", header: "Pulang Cepat",
      cell: (r) => <span className="text-xs" style={{ color: r.menit_pulang_cepat > 0 ? "var(--warning)" : "var(--text-subtle)" }}>{formatMenit(r.menit_pulang_cepat)}</span>,
    },
    {
      key: "total_jam_kerja_menit", header: "Jam Kerja",
      cell: (r) => <span className="text-xs font-mono">{formatMenit(r.total_jam_kerja_menit)}</span>,
    },
    {
      key: "catatan_manual", header: "Catatan",
      cell: (r) => <span className="text-xs" style={{ color: "var(--text-subtle)" }}>{r.catatan_manual || r.alasan_manual || "—"}</span>,
    },
  ]

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--text-900)" }}>Riwayat Absensi</h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-subtle)" }}>Riwayat absensi per pegawai per bulan</p>
        </div>
        <Button variant="outline" size="sm" onClick={refetch}><RefreshCw className="h-3.5 w-3.5" /></Button>
      </div>

      {/* Filter */}
      <div className="rounded-xl p-4 grid grid-cols-1 sm:grid-cols-3 gap-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        {/* Karyawan */}
        <div className="space-y-1.5">
          <label className="block text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Karyawan</label>
          <SearchableSelect label="" options={karyawanOpts} value={karyawanId}
            onChange={(v: string) => setKaryawanId(v)} placeholder="Pilih karyawan..." />
        </div>
        {/* Navigasi bulan */}
        <div className="space-y-1.5">
          <label className="block text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Periode</label>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={prevBulan}><ChevronLeft className="h-4 w-4" /></Button>
            <span className="flex-1 text-center text-sm font-semibold" style={{ color: "var(--text-900)" }}>{BULAN[bulan-1]} {tahun}</span>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={nextBulan}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>
        {/* Info total */}
        <div className="flex items-end">
          {karyawanId && !loading && (
            <p className="text-sm" style={{ color: "var(--text-subtle)" }}>{list.length} catatan absensi</p>
          )}
        </div>
      </div>

      {!karyawanId ? (
        <div className="rounded-xl py-16 text-center" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          <p className="text-sm" style={{ color: "var(--text-subtle)" }}>Pilih karyawan untuk melihat riwayat absensi</p>
        </div>
      ) : (
        <DataTable
          data={list as unknown as Record<string, unknown>[]}
          columns={columns as unknown as Column<Record<string, unknown>>[]}
          searchKeys={["status_absensi"]}
          loading={loading}
          emptyMessage={`Tidak ada data absensi untuk ${BULAN[bulan-1]} ${tahun}`}
        />
      )}
    </div>
  )
}

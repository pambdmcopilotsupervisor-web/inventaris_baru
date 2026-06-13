"use client"
import React, { useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { RefreshCw, ChevronLeft, ChevronRight } from "lucide-react"
import { useApi } from "@/hooks/useApi"
import { SearchableSelect } from "@/components/ui/searchable-select"
import { STATUS_ABSENSI_LABELS, StatusAbsensi, RekapAbsensi } from "@/lib/attendance"

interface Karyawan { id: number; nik: string; nama_karyawan: string; jabatan: string; status_karyawan: string | null }
interface RekapResponse {
  karyawan: { id: number; nik: string; nama_karyawan: string; jabatan: string } | null
  rekap: RekapAbsensi
  detail: { sumber_rekap?: string; status_absensi?: string }[]
}

function Stat({ label, value, color = "var(--text-900)" }: { label: string; value: number | string; color?: string }) {
  return (
    <div className="rounded-xl p-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
      <p className="text-xs" style={{ color: "var(--text-subtle)" }}>{label}</p>
      <p className="text-2xl font-bold font-mono mt-0.5" style={{ color }}>{value}</p>
    </div>
  )
}

function formatMenitShort(m: number): string {
  if (!m) return "0m"
  const j = Math.floor(m / 60); const mn = m % 60
  return j > 0 ? `${j}j ${mn}m` : `${mn}m`
}

const BULAN_ID = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"]

export default function RekapAbsensiPage() {
  const now = new Date()
  const [bulan, setBulan] = useState(now.getMonth() + 1)
  const [tahun, setTahun] = useState(now.getFullYear())
  const [karyawanId, setKaryawanId] = useState("")

  const { data: karyawans } = useApi<Karyawan[]>("/api/karyawan")
  const karyawanOpts = (karyawans ?? [])
    .filter(k => k.status_karyawan !== "Pensiun" && k.status_karyawan !== "Nonaktif")
    .map(k => ({ value: String(k.id), label: `${k.nik} — ${k.nama_karyawan}`, description: k.jabatan }))

  const queryStr = karyawanId ? `karyawan_id=${karyawanId}&bulan=${bulan}&tahun=${tahun}` : ""
  const { data, loading, refetch } = useApi<RekapResponse>(
    queryStr ? `/api/sdm/absensi/rekap?${queryStr}` : "",
    [queryStr]
  )

  const rekap = data?.rekap
  const karyawan = data?.karyawan

  const prevBulan = () => { if (bulan === 1) { setBulan(12); setTahun(y => y-1) } else setBulan(b => b-1) }
  const nextBulan = () => { if (bulan === 12) { setBulan(1); setTahun(y => y+1) } else setBulan(b => b+1) }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--text-900)" }}>Rekap Absensi</h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-subtle)" }}>Rekap ringkas absensi pegawai per periode</p>
        </div>
        <Button variant="outline" size="sm" onClick={refetch}><RefreshCw className="h-3.5 w-3.5" /></Button>
      </div>

      {/* Filter */}
      <div className="rounded-xl p-4 grid grid-cols-1 sm:grid-cols-2 gap-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <div className="space-y-1.5">
          <label className="block text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Karyawan</label>
          <SearchableSelect label="" options={karyawanOpts} value={karyawanId}
            onChange={(v: string) => setKaryawanId(v)} placeholder="Pilih karyawan..." />
        </div>
        <div className="space-y-1.5">
          <label className="block text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Periode</label>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={prevBulan}><ChevronLeft className="h-4 w-4" /></Button>
            <span className="flex-1 text-center text-sm font-semibold" style={{ color: "var(--text-900)" }}>{BULAN_ID[bulan-1]} {tahun}</span>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={nextBulan}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>
      </div>

      {!karyawanId ? (
        <div className="rounded-xl py-16 text-center" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          <p className="text-sm" style={{ color: "var(--text-subtle)" }}>Pilih karyawan untuk melihat rekap absensi</p>
        </div>
      ) : loading ? (
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3">
          {Array.from({length:12}).map((_,i) => <div key={i} className="h-20 rounded-xl animate-pulse" style={{ background: "var(--surface-muted)" }} />)}
        </div>
      ) : rekap ? (
        <div className="space-y-5">
          {/* Info karyawan */}
          {karyawan && (
            <div className="rounded-xl p-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
              <p className="font-bold text-base" style={{ color: "var(--text-900)" }}>{karyawan.nama_karyawan}</p>
              <p className="text-xs mt-0.5" style={{ color: "var(--text-subtle)" }}>{karyawan.nik} · {karyawan.jabatan} · {BULAN_ID[bulan-1]} {tahun}</p>
              <p className="text-xs mt-1" style={{ color: "var(--text-subtle)" }}>
                Rekap berbasis kalender/jadwal: {data?.detail.length ?? 0} tanggal dihitung, termasuk tanggal tanpa record absensi.
              </p>
            </div>
          )}

          {/* Stats grid */}
          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3">
            <Stat label="Total Hari"   value={rekap.total_hari_kerja}       color="var(--primary)" />
            <Stat label="Hadir"        value={rekap.total_hadir}            color="var(--success)" />
            <Stat label="Terlambat"    value={rekap.total_terlambat}        color="var(--warning)" />
            <Stat label="Pulang Cepat" value={rekap.total_pulang_cepat}     color="var(--warning)" />
            <Stat label="Alpha"        value={rekap.total_alpha}            color="var(--danger)" />
            <Stat label="Tidak Masuk"  value={rekap.total_tidak_absen_masuk} color="var(--text-subtle)" />
            <Stat label="Tidak Pulang" value={rekap.total_tidak_absen_pulang} color="var(--text-subtle)" />
            <Stat label="Cuti"         value={rekap.total_cuti}             color="var(--text-subtle)" />
            <Stat label="Izin"         value={rekap.total_izin}             color="var(--text-subtle)" />
            <Stat label="Sakit"        value={rekap.total_sakit}            color="var(--info)" />
            <Stat label="Libur"        value={rekap.total_libur}            color="var(--text-subtle)" />
            <Stat label="Luar Jam"     value={rekap.total_di_luar_jam_absen ?? 0} color="var(--warning)" />
          </div>

          {/* Waktu summary */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl p-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
              <p className="text-xs" style={{ color: "var(--text-subtle)" }}>Total Jam Kerja</p>
              <p className="text-lg font-bold font-mono mt-0.5" style={{ color: "var(--primary)" }}>{formatMenitShort(rekap.total_jam_kerja_menit)}</p>
            </div>
            <div className="rounded-xl p-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
              <p className="text-xs" style={{ color: "var(--text-subtle)" }}>Total Menit Terlambat</p>
              <p className="text-lg font-bold font-mono mt-0.5" style={{ color: rekap.total_menit_terlambat > 0 ? "var(--danger)" : "var(--text-subtle)" }}>{formatMenitShort(rekap.total_menit_terlambat)}</p>
            </div>
            <div className="rounded-xl p-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
              <p className="text-xs" style={{ color: "var(--text-subtle)" }}>Total Menit Pulang Cepat</p>
              <p className="text-lg font-bold font-mono mt-0.5" style={{ color: rekap.total_menit_pulang_cepat > 0 ? "var(--warning)" : "var(--text-subtle)" }}>{formatMenitShort(rekap.total_menit_pulang_cepat)}</p>
            </div>
          </div>

          {/* Note export */}
          <div className="rounded-xl px-4 py-3 text-xs" style={{ background: "var(--surface-muted)", border: "1px solid var(--border)", color: "var(--text-subtle)" }}>
            Hari tanpa record absensi tetap dihitung dari kalender kerja/jadwal. Jika ada jadwal tetapi belum ada absensi, statusnya dihitung sebagai Alpha.
          </div>
        </div>
      ) : null}
    </div>
  )
}

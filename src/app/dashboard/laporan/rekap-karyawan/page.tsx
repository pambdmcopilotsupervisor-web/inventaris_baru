"use client"

import React from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { StatsCard } from "@/components/dashboard/stats-card"
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts"
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from "@/components/ui/table"
import { Users, TrendingDown, UserCheck, AlertTriangle, RefreshCw } from "lucide-react"
import { useApi } from "@/hooks/useApi"

interface RekapData {
  stats: {
    total: number; aktif: number; pensiun: number; nonaktif: number
    lakiLaki: number; perempuan: number
  }
  rekapPerDivisi: {
    divisi: string; laki_laki: number; perempuan: number; campuran: number
    aktif: number; pensiun: number; nonaktif: number; total: number
  }[]
  mendekatiPensiun: {
    id: number; nik: string; nama_karyawan: string; jabatan: string
    divisi: string; umur: string; tanggal_pensiun: string
    sisa_hari: number; sisa_waktu: string
  }[]
  genderPerDivisiData: {
    divisi: string; laki_laki: number; perempuan: number; campuran: number
  }[]
}

const STATUS_COLORS = ['#059669', '#DC2626', '#94A3B8']

export default function RekapKaryawanPage() {
  const { data, loading, refetch } = useApi<RekapData>("/api/laporan/rekap-karyawan")

  const stats            = data?.stats
  const rekapPerDivisi   = data?.rekapPerDivisi ?? []
  const mendekatiPensiun = data?.mendekatiPensiun ?? []
  const genderData       = data?.genderPerDivisiData ?? []

  const statusData = stats
    ? [
        { name: "Aktif (Rekap)",  value: stats.aktif,    color: "#059669" },
        { name: "Pensiun",        value: stats.pensiun,  color: "#DC2626" },
        { name: "Nonaktif",       value: stats.nonaktif, color: "#94A3B8" },
      ]
    : []

  // Totals rekap tabel
  const totalRekap = rekapPerDivisi.reduce(
    (acc, r) => ({
      laki_laki: acc.laki_laki + r.laki_laki,
      perempuan: acc.perempuan + r.perempuan,
      campuran:  acc.campuran  + r.campuran,
      aktif:     acc.aktif     + r.aktif,
      pensiun:   acc.pensiun   + r.pensiun,
      nonaktif:  acc.nonaktif  + r.nonaktif,
      total:     acc.total     + r.total,
    }),
    { laki_laki: 0, perempuan: 0, campuran: 0, aktif: 0, pensiun: 0, nonaktif: 0, total: 0 }
  )

  const getSisaVariant = (sisa: number) => {
    if (sisa <= 30)  return "destructive"
    if (sisa <= 90)  return "warning"
    if (sisa <= 180) return "info"
    return "secondary"
  }

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--text-900)" }}>Rekap Karyawan</h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-subtle)" }}>
            Rekapitulasi data karyawan — usia pensiun 56 tahun, warning 1 tahun ke depan
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={refetch} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* ── Stats (sesuai KaryawanStatsOverview) ────────────────── */}
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-widest mb-3" style={{ color: "var(--text-subtle)" }}>
          Statistik Karyawan
        </p>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatsCard title="Total Karyawan"  value={loading ? "…" : (stats?.total ?? 0)}
            description="Seluruh data karyawan" color="blue" icon={<Users className="h-5 w-5" />} mono />
          <StatsCard title="Aktif (Rekap)"   value={loading ? "…" : (stats?.aktif ?? 0)}
            description="Aktif, eksklusi jabatan khusus" color="green" icon={<UserCheck className="h-5 w-5" />} mono />
          <StatsCard title="Pensiun"         value={loading ? "…" : (stats?.pensiun ?? 0)}
            description="Status pensiun" color="red" icon={<TrendingDown className="h-5 w-5" />} mono />
          <StatsCard title="Nonaktif"        value={loading ? "…" : (stats?.nonaktif ?? 0)}
            description="Status nonaktif" color="amber" icon={<Users className="h-5 w-5" />} mono />
          <StatsCard title="Laki-Laki"       value={loading ? "…" : (stats?.lakiLaki ?? 0)}
            description="Karyawan aktif rekap" color="cyan" icon={<Users className="h-5 w-5" />} mono />
          <StatsCard title="Perempuan"       value={loading ? "…" : (stats?.perempuan ?? 0)}
            description="Karyawan aktif rekap" color="purple" icon={<Users className="h-5 w-5" />} mono />
        </div>
      </div>

      {/* ── Charts (sesuai widget Filament) ─────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Bar chart: Gender per Divisi (KaryawanGenderPerDivisiChart) */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle>Komposisi Jenis Kelamin per Divisi</CardTitle>
            <p className="text-xs" style={{ color: "var(--text-subtle)" }}>Karyawan aktif (rekap)</p>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="h-[260px] flex items-center justify-center" style={{ color: "var(--text-subtle)" }}>Memuat data...</div>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={genderData} margin={{ top: 5, right: 10, left: -20, bottom: 40 }} barSize={10} barGap={2}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="divisi" tick={{ fontSize: 10, fill: "var(--text-subtle)" }}
                    axisLine={false} tickLine={false} angle={-35} textAnchor="end" />
                  <YAxis tick={{ fontSize: 11, fill: "var(--text-subtle)" }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid var(--border)" }} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                  <Bar dataKey="laki_laki"  name="Laki-Laki" fill="#1E40AF" radius={[3,3,0,0]} />
                  <Bar dataKey="perempuan"  name="Perempuan"  fill="#EC4899" radius={[3,3,0,0]} />
                  <Bar dataKey="campuran"   name="L/P"        fill="#7C3AED" radius={[3,3,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Doughnut: Status Karyawan (KaryawanStatusChart) */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Distribusi Status Karyawan</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="h-[200px] flex items-center justify-center" style={{ color: "var(--text-subtle)" }}>Memuat...</div>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie data={statusData} cx="50%" cy="50%" innerRadius={50} outerRadius={76} paddingAngle={4} dataKey="value" strokeWidth={0}>
                      {statusData.map((e, i) => <Cell key={i} fill={e.color} />)}
                    </Pie>
                    <Tooltip formatter={(v) => [`${v} orang`, ""]} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="mt-3 space-y-1.5">
                  {statusData.map((e) => (
                    <div key={e.name} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full shrink-0" style={{ background: e.color }} />
                        <span style={{ color: "var(--text-muted)" }}>{e.name}</span>
                      </div>
                      <span className="font-bold font-mono" style={{ color: "var(--text-900)" }}>{e.value}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Rekap Per Divisi (getRekapPerDivisi) ────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Rekap Karyawan per Divisi</CardTitle>
          <p className="text-xs" style={{ color: "var(--text-subtle)" }}>
            Kolom "Aktif" mengecualikan jabatan: Ketua/Bendahara/Sekretaris Koperasi &amp; All Divisi
          </p>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow style={{ background: "var(--surface-muted)" }}>
                  <TableHead className="w-8 text-center" style={{ color: "var(--text-subtle)" }}>#</TableHead>
                  <TableHead style={{ color: "var(--text-subtle)" }}>Divisi</TableHead>
                  <TableHead className="text-center" style={{ color: "#1E40AF" }}>Laki-Laki</TableHead>
                  <TableHead className="text-center" style={{ color: "#EC4899" }}>Perempuan</TableHead>
                  <TableHead className="text-center" style={{ color: "#7C3AED" }}>L/P</TableHead>
                  <TableHead className="text-center" style={{ color: "var(--success)" }}>Aktif</TableHead>
                  <TableHead className="text-center" style={{ color: "var(--danger)" }}>Pensiun</TableHead>
                  <TableHead className="text-center" style={{ color: "var(--text-subtle)" }}>Nonaktif</TableHead>
                  <TableHead className="text-center font-bold" style={{ color: "var(--text-900)" }}>Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={9}>
                        <div className="h-4 rounded animate-pulse" style={{ background: "var(--primary-light)" }} />
                      </TableCell>
                    </TableRow>
                  ))
                ) : rekapPerDivisi.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="py-12 text-center" style={{ color: "var(--text-subtle)" }}>
                      Tidak ada data
                    </TableCell>
                  </TableRow>
                ) : (
                  rekapPerDivisi.map((row, i) => (
                    <TableRow key={row.divisi} className="transition-colors duration-150">
                      <TableCell className="text-center text-xs" style={{ color: "var(--text-subtle)" }}>{i + 1}</TableCell>
                      <TableCell className="font-semibold text-sm">{row.divisi}</TableCell>
                      <TableCell className="text-center font-mono">{row.laki_laki || "—"}</TableCell>
                      <TableCell className="text-center font-mono">{row.perempuan || "—"}</TableCell>
                      <TableCell className="text-center font-mono">{row.campuran || "—"}</TableCell>
                      <TableCell className="text-center">
                        {row.aktif > 0 ? <Badge variant="success" className="font-mono">{row.aktif}</Badge> : <span style={{ color: "var(--text-subtle)" }}>—</span>}
                      </TableCell>
                      <TableCell className="text-center">
                        {row.pensiun > 0 ? <Badge variant="destructive" className="font-mono">{row.pensiun}</Badge> : <span style={{ color: "var(--text-subtle)" }}>—</span>}
                      </TableCell>
                      <TableCell className="text-center">
                        {row.nonaktif > 0 ? <Badge variant="secondary" className="font-mono">{row.nonaktif}</Badge> : <span style={{ color: "var(--text-subtle)" }}>—</span>}
                      </TableCell>
                      <TableCell className="text-center font-bold font-mono" style={{ color: "var(--text-900)" }}>{row.total}</TableCell>
                    </TableRow>
                  ))
                )}

                {/* Total Row */}
                {!loading && rekapPerDivisi.length > 0 && (
                  <TableRow style={{ background: "var(--primary-light)", borderTop: "2px solid var(--primary-mid)" }}>
                    <TableCell colSpan={2} className="font-bold text-right" style={{ color: "var(--primary)" }}>TOTAL</TableCell>
                    <TableCell className="text-center font-bold font-mono" style={{ color: "#1E40AF" }}>{totalRekap.laki_laki}</TableCell>
                    <TableCell className="text-center font-bold font-mono" style={{ color: "#EC4899" }}>{totalRekap.perempuan}</TableCell>
                    <TableCell className="text-center font-bold font-mono" style={{ color: "#7C3AED" }}>{totalRekap.campuran}</TableCell>
                    <TableCell className="text-center font-bold font-mono" style={{ color: "var(--success)" }}>{totalRekap.aktif}</TableCell>
                    <TableCell className="text-center font-bold font-mono" style={{ color: "var(--danger)" }}>{totalRekap.pensiun}</TableCell>
                    <TableCell className="text-center font-bold font-mono" style={{ color: "var(--text-subtle)" }}>{totalRekap.nonaktif}</TableCell>
                    <TableCell className="text-center font-bold font-mono text-base" style={{ color: "var(--primary)" }}>{totalRekap.total}</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* ── Karyawan Mendekati Pensiun (getKaryawanMendekatiPensiun) ── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" style={{ color: "var(--warning)" }} />
            <CardTitle>Karyawan Mendekati Pensiun</CardTitle>
            <Badge variant="warning" className="ml-auto">{mendekatiPensiun.length} karyawan</Badge>
          </div>
          <p className="text-xs" style={{ color: "var(--text-subtle)" }}>
            Usia pensiun: 56 tahun · Menampilkan karyawan yang pensiun dalam 1 tahun ke depan
          </p>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center" style={{ color: "var(--text-subtle)" }}>Memuat data...</div>
          ) : mendekatiPensiun.length === 0 ? (
            <div className="p-8 text-center" style={{ color: "var(--text-subtle)" }}>
              Tidak ada karyawan yang akan pensiun dalam 1 tahun ke depan
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow style={{ background: "var(--surface-muted)" }}>
                    <TableHead className="w-8 text-center" style={{ color: "var(--text-subtle)" }}>#</TableHead>
                    <TableHead style={{ color: "var(--text-subtle)" }}>NIK</TableHead>
                    <TableHead style={{ color: "var(--text-subtle)" }}>Nama Karyawan</TableHead>
                    <TableHead style={{ color: "var(--text-subtle)" }}>Jabatan</TableHead>
                    <TableHead style={{ color: "var(--text-subtle)" }}>Divisi</TableHead>
                    <TableHead style={{ color: "var(--text-subtle)" }}>Umur</TableHead>
                    <TableHead style={{ color: "var(--text-subtle)" }}>Tgl Pensiun</TableHead>
                    <TableHead className="text-center" style={{ color: "var(--text-subtle)" }}>Sisa Waktu</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mendekatiPensiun.map((row, i) => (
                    <TableRow key={row.id} className="transition-colors duration-150"
                      style={row.sisa_hari <= 30 ? { background: "var(--danger-bg)" } : row.sisa_hari <= 90 ? { background: "var(--warning-bg)" } : {}}>
                      <TableCell className="text-center text-xs" style={{ color: "var(--text-subtle)" }}>{i + 1}</TableCell>
                      <TableCell className="font-mono text-xs">{row.nik}</TableCell>
                      <TableCell>
                        <p className="font-semibold text-sm" style={{ color: "var(--text-900)" }}>{row.nama_karyawan}</p>
                      </TableCell>
                      <TableCell className="text-xs">{row.jabatan}</TableCell>
                      <TableCell className="text-xs">{row.divisi}</TableCell>
                      <TableCell className="text-xs">{row.umur}</TableCell>
                      <TableCell className="text-xs font-medium">{row.tanggal_pensiun}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant={getSisaVariant(row.sisa_hari)}>{row.sisa_waktu}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

    </div>
  )
}

"use client"

import React from "react"
import { StatsCard } from "@/components/dashboard/stats-card"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts"
import { Users, AlertTriangle, RefreshCw } from "lucide-react"
import { formatDate } from "@/lib/utils"
import { useApi } from "@/hooks/useApi"
import Link from "next/link"

interface SDMStats {
  karyawan: { total: number; aktif: number; pensiun: number; nonaktif: number; lakiLaki: number; perempuan: number }
  genderPerDivisi: { divisi: string; laki_laki: number; perempuan: number; campuran: number }[]
}

interface KaryawanMendekatiPensiun {
  id: number; nik: string; nama_karyawan: string; jabatan: string
  divisi: string; umur: string
  tanggal_pensiun: string; sisa_hari: number; sisa_waktu: string
}

export default function SDMDashboardPage() {
  const { data: stats, loading, refetch } = useApi<SDMStats>("/api/dashboard-stats")

  // Karyawan mendekati pensiun (dari laporan rekap-karyawan)
  const { data: mendekatiData } = useApi<{ mendekatiPensiun: KaryawanMendekatiPensiun[] }>("/api/laporan/rekap-karyawan?summary=true")
  const mendekati = mendekatiData?.mendekatiPensiun ?? []

  const statusData = [
    { name: "Aktif",    value: stats?.karyawan.aktif    ?? 0, color: "#10b981" },
    { name: "Pensiun",  value: stats?.karyawan.pensiun  ?? 0, color: "#ef4444" },
    { name: "Nonaktif", value: stats?.karyawan.nonaktif ?? 0, color: "#94a3b8" },
  ]

  const getSisaUsia = (sisa_hari: number) => sisa_hari

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--text-900)" }}>Dashboard SDM</h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-subtle)" }}>
            Statistik dan ringkasan Sumber Daya Manusia
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={refetch}><RefreshCw className="h-3.5 w-3.5" /></Button>
          <Link href="/dashboard/master-data/karyawan">
            <Button size="sm"><Users className="h-3.5 w-3.5 mr-1.5" />Data Karyawan</Button>
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <StatsCard title="Total Karyawan" value={loading ? "…" : (stats?.karyawan.total ?? 0)} description="Seluruh data" color="blue" icon={<Users className="h-5 w-5" />} mono />
        <StatsCard title="Karyawan Aktif" value={loading ? "…" : (stats?.karyawan.aktif ?? 0)} color="green" icon={<Users className="h-5 w-5" />} mono />
        <StatsCard title="Pensiun"        value={loading ? "…" : (stats?.karyawan.pensiun ?? 0)} color="red" icon={<Users className="h-5 w-5" />} mono />
        <StatsCard title="Laki-Laki"      value={loading ? "…" : (stats?.karyawan.lakiLaki ?? 0)} color="cyan" icon={<Users className="h-5 w-5" />} mono />
        <StatsCard title="Perempuan"      value={loading ? "…" : (stats?.karyawan.perempuan ?? 0)} color="amber" icon={<Users className="h-5 w-5" />} mono />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Distribusi Status Karyawan */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Distribusi Status Karyawan</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <ResponsiveContainer width="55%" height={160}>
                <PieChart>
                  <Pie data={statusData} cx="50%" cy="50%" innerRadius={45} outerRadius={68} paddingAngle={4} dataKey="value" strokeWidth={0}>
                    {statusData.map((e, i) => <Cell key={i} fill={e.color} />)}
                  </Pie>
                  <Tooltip formatter={(v) => [`${v} orang`, ""]} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2 flex-1">
                {statusData.map(e => (
                  <div key={e.name} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full" style={{ background: e.color }} />
                      <span style={{ color: "var(--text-muted)" }}>{e.name}</span>
                    </div>
                    <span className="font-bold font-mono" style={{ color: "var(--text-900)" }}>{loading ? "…" : e.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Komposisi Gender per Divisi */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Komposisi Gender per Divisi</CardTitle>
            <p className="text-xs" style={{ color: "var(--text-subtle)" }}>Karyawan aktif</p>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="h-40 animate-pulse rounded-lg" style={{ background: "var(--primary-light)" }} />
            ) : (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={stats?.genderPerDivisi ?? []} margin={{ top: 5, right: 5, left: -20, bottom: 25 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="divisi" tick={{ fontSize: 8, fill: "var(--text-subtle)" }} axisLine={false} tickLine={false} angle={-30} textAnchor="end" interval={0} />
                  <YAxis tick={{ fontSize: 10, fill: "var(--text-subtle)" }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 10 }} />
                  <Bar dataKey="laki_laki" name="L" stackId="a" fill="#3b82f6" />
                  <Bar dataKey="perempuan" name="P" stackId="a" fill="#ec4899" />
                  <Bar dataKey="campuran"  name="L/P" stackId="a" fill="#8b5cf6" radius={[3,3,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Karyawan Mendekati Pensiun */}
      <Card>
        <CardHeader className="pb-0">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" style={{ color: "var(--warning)" }} />Karyawan Mendekati Pensiun
              {mendekati.length > 0 && (
                <Badge variant="warning" className="text-xs">{mendekati.length} orang</Badge>
              )}
            </CardTitle>
            <Link href="/dashboard/laporan/rekap-karyawan">
              <Button variant="ghost" size="sm" className="text-xs h-7">Lihat laporan lengkap</Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          {mendekati.length === 0 ? (
            <p className="text-sm text-center py-6" style={{ color: "var(--text-subtle)" }}>Tidak ada karyawan mendekati usia pensiun</p>
          ) : (
            <div className="rounded-lg overflow-hidden" style={{ border: "1px solid var(--border)" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ background: "var(--surface-muted)" }}>
                    {["NIK", "Nama", "Jabatan", "Divisi", "Umur", "Tgl Pensiun", "Sisa Waktu"].map(h => (
                      <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)", borderBottom: "1px solid var(--border)" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {mendekati.slice(0, 8).map((k, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}
                      onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = "var(--warning-bg)")}
                      onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = "transparent")}>
                      <td style={{ padding: "8px 12px", fontFamily: "monospace", fontSize: 11 }}>{k.nik}</td>
                      <td style={{ padding: "8px 12px", fontWeight: 600 }}>{k.nama_karyawan}</td>
                      <td style={{ padding: "8px 12px", color: "var(--text-muted)" }}>{k.jabatan}</td>
                      <td style={{ padding: "8px 12px", color: "var(--text-muted)" }}>{k.divisi}</td>
                      <td style={{ padding: "8px 12px", color: "var(--text-muted)" }}>{k.umur}</td>
                      <td style={{ padding: "8px 12px", color: "var(--text-muted)" }}>{k.tanggal_pensiun}</td>
                      <td style={{ padding: "8px 12px" }}>
                        <Badge variant={k.sisa_hari <= 90 ? "destructive" : "warning"}>
                          {k.sisa_waktu}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

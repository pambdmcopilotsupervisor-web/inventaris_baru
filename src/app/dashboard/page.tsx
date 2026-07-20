"use client"

import React from "react"
import { StatsCard } from "@/components/dashboard/stats-card"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts"
import { Archive, Truck, Users, AlertTriangle, FileText, Calendar, MoreHorizontal, Shield, Wrench } from "lucide-react"
import { formatDate } from "@/lib/utils"
import { useApi } from "@/hooks/useApi"
import { ACTIVE_MODULE_STORAGE_KEY, getModulePath, inferModulFromPathname, writeStoredDashboardHomePath } from "@/lib/module-navigation"

const DASHBOARD_TIME_ZONE = "Asia/Makassar"
const dashboardHeaderDateFormatter = new Intl.DateTimeFormat("id-ID", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: DASHBOARD_TIME_ZONE,
})
const dashboardMonthFormatter = new Intl.DateTimeFormat("id-ID", {
  month: "long",
  year: "numeric",
  timeZone: DASHBOARD_TIME_ZONE,
})
const dashboardTimeFormatter = new Intl.DateTimeFormat("id-ID", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
  timeZone: DASHBOARD_TIME_ZONE,
})

interface DashboardStats {
  aset: { total: number; komputer: number; kantor: number; kondisi: { status_barang: string; _count: { id: number } }[] }
  kendaraan: { r2Operasional: number; r2Dinas: number; r4Operasional: number; r4Dinas: number }
  karyawan: { total: number; aktif: number; pensiun: number; nonaktif: number; lakiLaki: number; perempuan: number }
  kontrakAktif: { id: number; no_kontrak: string | null; judul: string; tgl_akhir: string }[]
  alertPajak: { id: number; plat: string; nm_brg: string; pajak: string }[]
  alertStnk: { id: number; plat: string; nm_brg: string; stnk: string; jns_brg: string }[]
  jadwalKir: { id: number; plat: string; nm_brg: string; jns_brg: string; tgl_akhir_kir: string }[]
  jadwalService: { id: number; plat: string; nm_brg: string; jns_brg: string; service: string }[]
  genderPerDivisi: { divisi: string; laki_laki: number; perempuan: number; campuran: number }[]
}

// Static trend chart (augmented with real stats when loaded)
const pendapatanBulanan = [
  { bulan: "Jan", r2: 3.6, r4: 22 }, { bulan: "Feb", r2: 3.6, r4: 22 },
  { bulan: "Mar", r2: 4.2, r4: 24 }, { bulan: "Apr", r2: 3.9, r4: 22 },
  { bulan: "Mei", r2: 4.5, r4: 26 }, { bulan: "Jun", r2: 3.6, r4: 22 },
]

type CustomTooltipPayload = {
  color?: string
  name?: string
  value?: number | string
}

const CustomTooltip = ({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: CustomTooltipPayload[]
  label?: string
}) => {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl px-4 py-3 shadow-xl text-sm" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
      <p className="font-semibold mb-1.5" style={{ color: "var(--text-900)" }}>{label}</p>
      {payload.map((p, i) => (
        <p key={i} className="text-xs" style={{ color: p.color }}>{p.name}: <strong>Rp {p.value}jt</strong></p>
      ))}
    </div>
  )
}

const getStatus = (tgl: string) => {
  const days = Math.floor((new Date(tgl).getTime() - Date.now()) / 86400000)
  if (days < 0) return "Berakhir"
  if (days <= 30) return "Hampir Habis"
  return "Aktif"
}

const getSisaHari = (tgl: string) => {
  const days = Math.floor((new Date(tgl).getTime() - Date.now()) / 86400000)
  return Math.max(0, days)
}

export default function DashboardPage() {
  const { data: stats, loading } = useApi<DashboardStats>("/api/dashboard-stats")
  const [currentDateTime, setCurrentDateTime] = React.useState<Date | null>(null)

  // Redirect ke select-module jika belum pilih modul
  React.useEffect(() => {
    const modul = localStorage.getItem(ACTIVE_MODULE_STORAGE_KEY)
    if (modul) return

    const inferredModul = inferModulFromPathname(window.location.pathname)
    if (inferredModul) {
      localStorage.setItem(ACTIVE_MODULE_STORAGE_KEY, inferredModul)
      writeStoredDashboardHomePath(getModulePath(inferredModul))
      return
    }

    if (!modul) {
      window.location.href = "/select-module"
    }
  }, [])

  React.useEffect(() => {
    const initialTimer = window.setTimeout(() => {
      setCurrentDateTime(new Date())
    }, 0)

    const timer = window.setInterval(() => {
      setCurrentDateTime(new Date())
    }, 1000)

    return () => {
      window.clearTimeout(initialTimer)
      window.clearInterval(timer)
    }
  }, [])

  const currentDateLabel = React.useMemo(() => {
    if (!currentDateTime) return "Memuat tanggal..."
    return dashboardHeaderDateFormatter.format(currentDateTime)
  }, [currentDateTime])

  const currentMonthLabel = React.useMemo(() => {
    if (!currentDateTime) return "Memuat bulan..."
    return dashboardMonthFormatter.format(currentDateTime)
  }, [currentDateTime])

  const currentTimeLabel = React.useMemo(() => {
    if (!currentDateTime) return "--:--:--"
    return dashboardTimeFormatter.format(currentDateTime)
  }, [currentDateTime])

  const kondisiData = stats
    ? stats.aset.kondisi.map((k) => ({
        name: k.status_barang, value: k._count.id,
        color: k.status_barang === "Baik" ? "#059669" : k.status_barang === "Rusak Ringan" ? "#D97706" : "#DC2626",
      }))
    : [{ name: "Baik", value: 0, color: "#059669" }]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--text-900)" }}>Dashboard</h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-subtle)" }}>
            Selamat datang · {currentDateLabel}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div
            className="rounded-md border px-3 py-1.5 text-right"
            style={{ borderColor: "var(--border)", background: "var(--surface)", minWidth: 120 }}
          >
            <p className="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-subtle)" }}>
              Waktu sekarang
            </p>
            <p className="font-mono text-sm font-semibold" style={{ color: "var(--text-900)" }}>
              {currentTimeLabel}
            </p>
          </div>
          <Button size="sm" variant="outline"><Calendar className="h-3.5 w-3.5 mr-1.5" />{currentMonthLabel}</Button>
        </div>
      </div>

      {/* Aset Stats */}
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-widest mb-3" style={{ color: "var(--text-subtle)" }}>Inventaris Aset</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatsCard title="Peralatan Komputer" value={loading ? "…" : (stats?.aset.komputer ?? 0)} trend={{ value: 2.3, label: "vs bulan lalu" }} color="blue" icon={<Archive className="h-5 w-5" />} mono />
          <StatsCard title="Perabotan Kantor"   value={loading ? "…" : (stats?.aset.kantor ?? 0)} trend={{ value: 0 }} color="purple" icon={<Archive className="h-5 w-5" />} mono />
          <StatsCard title="R2 Operasional"     value={loading ? "…" : (stats?.kendaraan.r2Operasional ?? 0)} trend={{ value: 4.9 }} color="green" icon={<Truck className="h-5 w-5" />} mono />
          <StatsCard title="R2 Dinas"           value={loading ? "…" : (stats?.kendaraan.r2Dinas ?? 0)} trend={{ value: 0 }} color="cyan" icon={<Truck className="h-5 w-5" />} mono />
          <StatsCard title="R4 Operasional"     value={loading ? "…" : (stats?.kendaraan.r4Operasional ?? 0)} trend={{ value: -4.0 }} color="amber" icon={<Truck className="h-5 w-5" />} mono />
          <StatsCard title="R4 Dinas"           value={loading ? "…" : (stats?.kendaraan.r4Dinas ?? 0)} trend={{ value: 0 }} color="red" icon={<Truck className="h-5 w-5" />} mono />
        </div>
      </div>

      {/* Karyawan Stats */}
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-widest mb-3" style={{ color: "var(--text-subtle)" }}>Data Karyawan</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <StatsCard title="Total Karyawan" value={loading ? "…" : (stats?.karyawan.total ?? 0)} description="Seluruh data" color="blue" icon={<Users className="h-5 w-5" />} mono />
          <StatsCard title="Karyawan Aktif" value={loading ? "…" : (stats?.karyawan.aktif ?? 0)} trend={{ value: 1.4, label: "vs thn lalu" }} color="green" icon={<Users className="h-5 w-5" />} mono />
          <StatsCard title="Pensiun"        value={loading ? "…" : (stats?.karyawan.pensiun ?? 0)} trend={{ value: -2.3 }} color="red" icon={<Users className="h-5 w-5" />} mono />
          <StatsCard title="Laki-Laki"      value={loading ? "…" : (stats?.karyawan.lakiLaki ?? 0)} description="Karyawan aktif" color="cyan" icon={<Users className="h-5 w-5" />} mono />
          <StatsCard title="Perempuan"      value={loading ? "…" : (stats?.karyawan.perempuan ?? 0)} description="Karyawan aktif" color="amber" icon={<Users className="h-5 w-5" />} mono />
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Pendapatan Sewa Kendaraan</CardTitle>
                <p className="text-xs mt-0.5" style={{ color: "var(--text-subtle)" }}>Januari — Juni 2026</p>
              </div>
              <Button variant="ghost" size="icon" className="h-7 w-7"><MoreHorizontal className="h-4 w-4" /></Button>
            </div>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={pendapatanBulanan} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="gT" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#1E40AF" stopOpacity={0.20} />
                    <stop offset="95%" stopColor="#1E40AF" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="gR4" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.20} />
                    <stop offset="95%" stopColor="#F59E0B" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="bulan" tick={{ fontSize: 11, fill: "var(--text-subtle)" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "var(--text-subtle)" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}jt`} />
                <Tooltip content={<CustomTooltip />} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                <Area type="monotone" dataKey="r4" name="Roda 4" stroke="#F59E0B" strokeWidth={2} fill="url(#gR4)" dot={false} activeDot={{ r: 4 }} />
                <Area type="monotone" dataKey="r2" name="Roda 2" stroke="#1E40AF" strokeWidth={2} fill="url(#gT)" dot={false} activeDot={{ r: 4 }} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Kondisi Aset</CardTitle>
            <p className="text-xs" style={{ color: "var(--text-subtle)" }}>Total {stats?.aset.total ?? 0} unit</p>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={170}>
              <PieChart>
                <Pie data={kondisiData} cx="50%" cy="50%" innerRadius={48} outerRadius={72} paddingAngle={4} dataKey="value" strokeWidth={0}>
                  {kondisiData.map((e, i) => <Cell key={i} fill={e.color} />)}
                </Pie>
                <Tooltip formatter={(v) => [`${v} unit`, ""]} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="mt-3 space-y-1.5">
              {kondisiData.map((e) => (
                <div key={e.name} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full shrink-0" style={{ background: e.color }} />
                    <span style={{ color: "var(--text-muted)" }}>{e.name}</span>
                  </div>
                  <span className="font-semibold font-mono" style={{ color: "var(--text-900)" }}>{e.value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card>
          <CardHeader className="pb-0">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-4 w-4" style={{ color: "var(--primary)" }} />Kontrak Berjalan
              </CardTitle>
              <Button variant="ghost" size="sm" className="text-xs h-7">Lihat semua</Button>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            {loading ? (
              <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-14 rounded-lg animate-pulse" style={{ background: "var(--primary-light)" }} />)}</div>
            ) : (stats?.kontrakAktif ?? []).length === 0 ? (
              <p className="text-sm text-center py-6" style={{ color: "var(--text-subtle)" }}>Tidak ada kontrak aktif</p>
            ) : (
              <div className="space-y-2">
                {(stats?.kontrakAktif ?? []).slice(0, 4).map((k, i) => {
                  const s = getStatus(k.tgl_akhir)
                  return (
                    <div key={i} className="flex items-center justify-between gap-3 rounded-lg p-3 transition-colors duration-150 cursor-pointer"
                      style={{ background: "var(--surface-muted)" }}
                      onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "var(--primary-light)")}
                      onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "var(--surface-muted)")}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold truncate" style={{ color: "var(--text-900)" }}>{k.judul}</p>
                        <p className="text-[10px] mt-0.5 flex items-center gap-1" style={{ color: "var(--text-subtle)" }}>
                          <Calendar className="h-2.5 w-2.5" />Berakhir {formatDate(k.tgl_akhir)}
                        </p>
                      </div>
                      <Badge variant={s === "Aktif" ? "success" : s === "Hampir Habis" ? "warning" : "destructive"}>{s}</Badge>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-0">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" style={{ color: "var(--warning)" }} />Alert Pajak Kendaraan
              </CardTitle>
              <Button variant="ghost" size="sm" className="text-xs h-7">Lihat semua</Button>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            {loading ? (
              <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-14 rounded-lg animate-pulse" style={{ background: "var(--warning-bg)" }} />)}</div>
            ) : (stats?.alertPajak ?? []).length === 0 ? (
              <p className="text-sm text-center py-6" style={{ color: "var(--text-subtle)" }}>Tidak ada alert pajak</p>
            ) : (
              <div className="space-y-2">
                {(stats?.alertPajak ?? []).map((s, i) => {
                  const sisa = getSisaHari(s.pajak)
                  return (
                    <div key={i} className="flex items-center justify-between gap-3 rounded-lg p-3 transition-colors duration-150 cursor-pointer"
                      style={{ background: sisa <= 14 ? "var(--danger-bg)" : "var(--surface-muted)" }}
                      onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "var(--primary-light)")}
                      onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = sisa <= 14 ? "var(--danger-bg)" : "var(--surface-muted)")}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold" style={{ color: "var(--text-900)" }}>{s.nm_brg}</p>
                        <p className="text-[10px] mt-0.5" style={{ color: "var(--text-subtle)" }}>{s.plat} · Pajak</p>
                      </div>
                      <div className="text-right shrink-0">
                        <Badge variant={sisa <= 14 ? "destructive" : "warning"}>{sisa}h lagi</Badge>
                        <p className="text-[10px] mt-0.5" style={{ color: "var(--text-subtle)" }}>{formatDate(s.pajak)}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Row: Jadwal KIR & Service Mendatang */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card>
          <CardHeader className="pb-0">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-4 w-4" style={{ color: "var(--info)" }} />Jadwal KIR (0–3 Bulan)
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            {loading ? (
              <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-12 rounded-lg animate-pulse" style={{ background: "var(--surface-muted)" }} />)}</div>
            ) : (stats?.jadwalKir ?? []).length === 0 ? (
              <p className="text-sm text-center py-6" style={{ color: "var(--text-subtle)" }}>Tidak ada jadwal KIR dalam 3 bulan ke depan</p>
            ) : (
              <div className="space-y-2">
                {(stats?.jadwalKir ?? []).map((item, i) => {
                  const sisa = getSisaHari(item.tgl_akhir_kir)
                  return (
                    <div key={i} className="flex items-center justify-between gap-3 rounded-lg p-3" style={{ background: "var(--surface-muted)" }}>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold" style={{ color: "var(--text-900)" }}>{item.nm_brg}</p>
                        <p className="text-[10px] mt-0.5" style={{ color: "var(--text-subtle)" }}>{item.plat} · {item.jns_brg}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <Badge variant={sisa <= 30 ? "warning" : "info"}>{formatDate(item.tgl_akhir_kir)}</Badge>
                        <p className="text-[10px] mt-0.5" style={{ color: "var(--text-subtle)" }}>{sisa}h lagi</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-0">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Wrench className="h-4 w-4" style={{ color: "var(--warning)" }} />Jadwal Service (0–6 Bulan)
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            {loading ? (
              <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-12 rounded-lg animate-pulse" style={{ background: "var(--surface-muted)" }} />)}</div>
            ) : (stats?.jadwalService ?? []).length === 0 ? (
              <p className="text-sm text-center py-6" style={{ color: "var(--text-subtle)" }}>Tidak ada jadwal service dalam 6 bulan ke depan</p>
            ) : (
              <div className="space-y-2">
                {(stats?.jadwalService ?? []).map((item, i) => {
                  const sisa = getSisaHari(item.service)
                  return (
                    <div key={i} className="flex items-center justify-between gap-3 rounded-lg p-3" style={{ background: "var(--surface-muted)" }}>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold" style={{ color: "var(--text-900)" }}>{item.nm_brg}</p>
                        <p className="text-[10px] mt-0.5" style={{ color: "var(--text-subtle)" }}>{item.plat} · {item.jns_brg}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <Badge variant={sisa <= 30 ? "warning" : "secondary"}>{formatDate(item.service)}</Badge>
                        <p className="text-[10px] mt-0.5" style={{ color: "var(--text-subtle)" }}>{sisa}h lagi</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Row 3: Distribusi Aset + Status Karyawan ──────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Distribusi Kelompok Aset — AssetKelompokChart */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Distribusi Berdasarkan Kelompok</CardTitle>
            <p className="text-xs" style={{ color: "var(--text-subtle)" }}>Jumlah aset per kelompok</p>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={[
                { name: "Komputer", total: stats?.aset.komputer ?? 0 },
                { name: "Kantor",   total: stats?.aset.kantor   ?? 0 },
              ]} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "var(--text-subtle)" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "var(--text-subtle)" }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Bar dataKey="total" name="Jumlah Aset" radius={[4,4,0,0]}>
                  <Cell fill="#3b82f6" />
                  <Cell fill="#8b5cf6" />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Distribusi Status Karyawan — KaryawanStatusChart */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Distribusi Status Karyawan</CardTitle>
            <p className="text-xs" style={{ color: "var(--text-subtle)" }}>Aktif / Pensiun / Nonaktif</p>
          </CardHeader>
          <CardContent>
            {(() => {
              const statusData = [
                { name: "Aktif",    value: stats?.karyawan.aktif    ?? 0, color: "#10b981" },
                { name: "Pensiun",  value: stats?.karyawan.pensiun  ?? 0, color: "#ef4444" },
                { name: "Nonaktif", value: stats?.karyawan.nonaktif ?? 0, color: "#94a3b8" },
              ]
              return (
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
              )
            })()}
          </CardContent>
        </Card>
      </div>

      {/* ── Row 4: Gender per Divisi (full) — KaryawanGenderPerDivisiChart ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Komposisi Jenis Kelamin per Divisi</CardTitle>
          <p className="text-xs" style={{ color: "var(--text-subtle)" }}>Karyawan aktif, berdasarkan divisi</p>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="h-48 animate-pulse rounded-lg" style={{ background: "var(--primary-light)" }} />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={stats?.genderPerDivisi ?? []} margin={{ top: 5, right: 10, left: -20, bottom: 30 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="divisi" tick={{ fontSize: 9, fill: "var(--text-subtle)" }} axisLine={false} tickLine={false} angle={-35} textAnchor="end" interval={0} />
                <YAxis tick={{ fontSize: 11, fill: "var(--text-subtle)" }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="laki_laki" name="Laki-Laki" stackId="a" fill="#3b82f6" radius={[0,0,0,0]} />
                <Bar dataKey="perempuan" name="Perempuan" stackId="a" fill="#ec4899" />
                <Bar dataKey="campuran"  name="L/P"       stackId="a" fill="#8b5cf6" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* ── Row 5: STNK Akan Berakhir — StnkWidget ────────────────── */}
      <Card>
        <CardHeader className="pb-0">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-4 w-4" style={{ color: "var(--success)" }} />Jadwal STNK R2 &amp; R4 (Akan Berakhir)
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          {loading ? (
            <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-12 rounded-lg animate-pulse" style={{ background: "var(--surface-muted)" }} />)}</div>
          ) : (stats?.alertStnk ?? []).length === 0 ? (
            <p className="text-sm text-center py-6" style={{ color: "var(--text-subtle)" }}>Tidak ada STNK yang akan berakhir</p>
          ) : (
            <div className="overflow-x-auto rounded-lg" style={{ border: "1px solid var(--border)" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ background: "var(--surface-muted)" }}>
                    {["Plat", "Nama Kendaraan", "Jenis", "STNK"].map(h => (
                      <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)", borderBottom: "1px solid var(--border)" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(stats?.alertStnk ?? []).map((s, i) => {
                    const stnkDate = new Date(s.stnk)
                    const today    = new Date()
                    const sisa     = Math.floor((stnkDate.getTime() - today.getTime()) / 86400000)
                    const variant  = sisa < 0 ? "destructive" : sisa <= 30 ? "warning" : "success"
                    return (
                      <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}
                        onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = "var(--primary-light)")}
                        onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = "transparent")}>
                        <td style={{ padding: "8px 12px", fontWeight: 700, fontFamily: "monospace" }}>{s.plat}</td>
                        <td style={{ padding: "8px 12px", color: "var(--text-900)" }}>{s.nm_brg}</td>
                        <td style={{ padding: "8px 12px" }}><Badge variant="secondary" className="text-[10px]">{s.jns_brg}</Badge></td>
                        <td style={{ padding: "8px 12px" }}>
                          <Badge variant={variant}>{formatDate(s.stnk)}</Badge>
                          <span className="ml-2 text-[10px]" style={{ color: "var(--text-subtle)" }}>
                            {sisa < 0 ? `${Math.abs(sisa)}h lalu` : `${sisa}h lagi`}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

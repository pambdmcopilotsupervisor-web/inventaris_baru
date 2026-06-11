"use client"

import React from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { useAuth } from "@/contexts/AuthContext"
import { Info, Database, Shield, Clock, Code2 } from "lucide-react"
import { useApi } from "@/hooks/useApi"

interface AppInfo {
  aset: { total: number }
  karyawan: { total: number; aktif: number }
  kendaraan: { r2Operasional: number; r2Dinas: number; r4Operasional: number; r4Dinas: number }
}

const APP_VERSION = "1.0.0"
const APP_NAME    = "Inventaris Baru"
const ORG_NAME    = "Koperasi Konsumen Pedami"

export default function PengaturanPage() {
  const { user } = useAuth()
  const { data: stats } = useApi<AppInfo>("/api/dashboard-stats")

  const totalKendaraan = stats
    ? stats.kendaraan.r2Operasional + stats.kendaraan.r2Dinas + stats.kendaraan.r4Operasional + stats.kendaraan.r4Dinas
    : 0

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-bold" style={{ color: "var(--text-900)" }}>Pengaturan</h1>
        <p className="text-xs mt-0.5" style={{ color: "var(--text-subtle)" }}>Informasi sistem dan konfigurasi aplikasi</p>
      </div>

      {/* Info Aplikasi */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <Info className="h-4 w-4" style={{ color: "var(--primary)" }} />Informasi Aplikasi
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[
              { label: "Nama Aplikasi",    value: APP_NAME,    icon: <Code2 className="h-3.5 w-3.5" /> },
              { label: "Versi",            value: APP_VERSION, icon: <Code2 className="h-3.5 w-3.5" /> },
              { label: "Organisasi",       value: ORG_NAME,    icon: <Info className="h-3.5 w-3.5" /> },
              { label: "Framework",        value: "Next.js (App Router)",  icon: <Code2 className="h-3.5 w-3.5" /> },
              { label: "Database",         value: "MySQL / MariaDB via Prisma", icon: <Database className="h-3.5 w-3.5" /> },
              { label: "Autentikasi",      value: "iron-session (bcrypt)",  icon: <Shield className="h-3.5 w-3.5" /> },
            ].map(({ label, value, icon }) => (
              <div key={label} className="flex items-center justify-between py-2" style={{ borderBottom: "1px solid var(--border)" }}>
                <div className="flex items-center gap-2 text-xs" style={{ color: "var(--text-muted)" }}>
                  {icon} {label}
                </div>
                <span className="text-xs font-medium" style={{ color: "var(--text-900)" }}>{value}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Statistik Database */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <Database className="h-4 w-4" style={{ color: "var(--success)" }} />Ringkasan Data
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "Total Aset",         value: stats?.aset.total       ?? "—", color: "var(--primary)" },
              { label: "Total Karyawan",     value: stats?.karyawan.total   ?? "—", color: "var(--success)" },
              { label: "Karyawan Aktif",     value: stats?.karyawan.aktif   ?? "—", color: "var(--success)" },
              { label: "Total Kendaraan",    value: totalKendaraan || "—",          color: "var(--warning)" },
            ].map(({ label, value, color }) => (
              <div key={label} className="rounded-xl p-4 text-center" style={{ background: "var(--surface-muted)", border: "1px solid var(--border)" }}>
                <p className="text-xs mb-1" style={{ color: "var(--text-subtle)" }}>{label}</p>
                <p className="text-2xl font-bold font-mono" style={{ color }}>{value}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Info sesi */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-4 w-4" style={{ color: "var(--info)" }} />Sesi Aktif
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[
              { label: "Login sebagai",  value: user?.name ?? "—" },
              { label: "Email",          value: user?.email ?? "—" },
              { label: "Role",           value: user?.role ?? "—" },
              { label: "Jabatan",        value: user?.jabatan ?? "—" },
              { label: "Durasi sesi",    value: "7 hari" },
              { label: "Status",         value: "Aktif" },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center justify-between py-2" style={{ borderBottom: "1px solid var(--border)" }}>
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>{label}</span>
                <div className="flex items-center gap-1.5">
                  {label === "Status" && <span className="h-2 w-2 rounded-full" style={{ background: "var(--success)" }} />}
                  <span className="text-xs font-medium" style={{ color: "var(--text-900)" }}>{value}</span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Hak Akses */}
      {user?.role === "admin" && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-4 w-4" style={{ color: "var(--danger)" }} />Hak Akses Administrator
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {["Kelola Users", "Kelola Karyawan", "Kelola Aset", "Kelola Kendaraan", "Laporan", "Master Data", "Disposal", "Pensiun"].map(p => (
                <Badge key={p} variant="secondary" className="text-xs">{p}</Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

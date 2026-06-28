"use client"

import React, { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import {
  LayoutDashboard, Users, Building2, GitBranch, DoorOpen, UserCog,
  Archive, Truck, FileText, ArrowLeftRight, UserMinus, Trash2,
  Wrench, AirVent, CreditCard, ShoppingCart, UserX, BarChart3,
  TrendingUp, Receipt, ChevronDown, ChevronRight, Package, X,
    Clock, CalendarDays, CalendarOff, CalendarCheck, AlertTriangle, CalendarX,
    MapPin, Banknote, Settings2, ClipboardList, PlayCircle, Wallet,
} from "lucide-react"

interface NavItem { label: string; href: string; icon: React.ReactNode }
interface NavGroup { group: string; items: NavItem[] }

const navGroups: NavGroup[] = [
  {
    group: "",
    items: [{ label: "Dashboard", href: "/dashboard", icon: <LayoutDashboard className="h-4 w-4" /> }],
  },
  {
    group: "Master Data",
    items: [
      { label: "Karyawan", href: "/dashboard/master-data/karyawan", icon: <Users className="h-4 w-4" /> },
      { label: "Divisi", href: "/dashboard/master-data/divisi", icon: <Building2 className="h-4 w-4" /> },
      { label: "Sub Divisi", href: "/dashboard/master-data/subdivisi", icon: <GitBranch className="h-4 w-4" /> },
      { label: "Ruangan", href: "/dashboard/master-data/ruangan", icon: <DoorOpen className="h-4 w-4" /> },
      { label: "Users", href: "/dashboard/master-data/users", icon: <UserCog className="h-4 w-4" /> },
    ],
  },
  {
    group: "SDM",
    items: [
      { label: "Dashboard SDM",   href: "/dashboard/sdm",                   icon: <LayoutDashboard className="h-4 w-4" /> },
      { label: "Master Shift",    href: "/dashboard/sdm/shift",              icon: <Clock className="h-4 w-4" /> },
      { label: "Jadwal Kerja",    href: "/dashboard/sdm/jadwal-shift",       icon: <CalendarDays className="h-4 w-4" /> },
      { label: "Absensi Bulanan Pegawai", href: "/dashboard/sdm/absensi/bulanan",    icon: <CalendarCheck className="h-4 w-4" /> },
      { label: "Anomali Absensi", href: "/dashboard/sdm/absensi/anomali",    icon: <AlertTriangle className="h-4 w-4" /> },
      { label: "Karyawan Tanpa Jadwal", href: "/dashboard/sdm/absensi/tanpa-jadwal",    icon: <CalendarX className="h-4 w-4" /> },
      { label: "Lokasi Absensi Mobile", href: "/dashboard/sdm/absensi/lokasi-config", icon: <MapPin className="h-4 w-4" /> },
      { label: "Hari Libur",      href: "/dashboard/sdm/hari-libur",         icon: <CalendarOff className="h-4 w-4" /> },
    ],
  },
  {
    group: "Transaksi",
    items: [
      { label: "Inventaris Aset", href: "/dashboard/transaksi/aset", icon: <Archive className="h-4 w-4" /> },
      { label: "Kendaraan R2/R4", href: "/dashboard/transaksi/kendaraan", icon: <Truck className="h-4 w-4" /> },
      { label: "Kontrak", href: "/dashboard/transaksi/kontrak", icon: <FileText className="h-4 w-4" /> },
      { label: "Mutasi Aset", href: "/dashboard/transaksi/mutasi-aset", icon: <ArrowLeftRight className="h-4 w-4" /> },
      { label: "Mutasi Karyawan", href: "/dashboard/transaksi/mutasi-karyawan", icon: <UserMinus className="h-4 w-4" /> },
      { label: "Mutasi R2/R4", href: "/dashboard/transaksi/mutasi-kendaraan", icon: <ArrowLeftRight className="h-4 w-4" /> },
      { label: "Disposal", href: "/dashboard/transaksi/disposal", icon: <Trash2 className="h-4 w-4" /> },
      { label: "Servis R2/R4", href: "/dashboard/transaksi/servis-kendaraan", icon: <Wrench className="h-4 w-4" /> },
      { label: "Service AC", href: "/dashboard/transaksi/service-ac", icon: <AirVent className="h-4 w-4" /> },
      { label: "Pembayaran R2/R4", href: "/dashboard/transaksi/pembayaran-kendaraan", icon: <CreditCard className="h-4 w-4" /> },
      { label: "Penjualan R2/R4", href: "/dashboard/transaksi/penjualan-kendaraan", icon: <ShoppingCart className="h-4 w-4" /> },
      { label: "Pensiun Karyawan", href: "/dashboard/transaksi/pensiun-karyawan", icon: <UserX className="h-4 w-4" /> },
    ],
  },
  {
    group: "Penggajian",
    items: [
      { label: "Komponen Gaji",     href: "/dashboard/payroll/components",     icon: <Settings2 className="h-4 w-4" /> },
      { label: "Komponen per Jabatan", href: "/dashboard/payroll/positions",    icon: <Banknote className="h-4 w-4" /> },
      { label: "Aturan Potongan",   href: "/dashboard/payroll/deduction-rules", icon: <ClipboardList className="h-4 w-4" /> },
      { label: "Pajak & BPJS",      href: "/dashboard/payroll/tax-settings",    icon: <Receipt className="h-4 w-4" /> },
      { label: "Penyesuaian Massal", href: "/dashboard/payroll/bulk-adjust",     icon: <TrendingUp className="h-4 w-4" /> },
      { label: "Pinjaman Karyawan", href: "/dashboard/payroll/loans",            icon: <Wallet className="h-4 w-4" /> },
      { label: "Payroll Run",       href: "/dashboard/payroll/run",             icon: <PlayCircle className="h-4 w-4" /> },
      { label: "Laporan Pajak (1721-A1)", href: "/dashboard/payroll/tax-report", icon: <FileText className="h-4 w-4" /> },
    ],
  },
  {
    group: "Laporan",
    items: [
      { label: "Tagihan Sewa", href: "/dashboard/laporan/tagihan-sewa", icon: <Receipt className="h-4 w-4" /> },
      { label: "Rekap Karyawan", href: "/dashboard/laporan/rekap-karyawan", icon: <BarChart3 className="h-4 w-4" /> },
      { label: "Pendapatan Aset", href: "/dashboard/laporan/pendapatan-aset", icon: <TrendingUp className="h-4 w-4" /> },
    ],
  },
]

export function Sidebar({ collapsed = false }: { collapsed?: boolean }) {
  const pathname = usePathname()
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    "Master Data": true, "SDM": true, "Transaksi": true, "Penggajian": true, "Laporan": true,
  })

  const toggleGroup = (g: string) =>
    setOpenGroups((prev) => ({ ...prev, [g]: !prev[g] }))

  return (
    <aside
      className={cn("flex h-full flex-col transition-all duration-300 scrollbar-thin", collapsed ? "w-[64px]" : "w-[240px]")}
      style={{ background: "var(--sb-bg)", color: "var(--sb-fg)", borderRight: "1px solid var(--sb-border)" }}
    >
      {/* Brand */}
      <div className="flex h-14 shrink-0 items-center gap-3 px-4" style={{ borderBottom: "1px solid var(--sb-border)" }}>
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg" style={{ background: "var(--primary)" }}>
          <Package className="h-4 w-4 text-white" />
        </div>
        {!collapsed && (
          <span className="text-sm font-bold tracking-wide text-white truncate">PEDAMI Inventaris</span>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto scrollbar-thin py-3">
        {navGroups.map((group) => (
          <div key={group.group} className={cn(!collapsed && group.group ? "mb-1" : "mb-0")}>
            {/* Group label */}
            {group.group && !collapsed && (
              <button
                onClick={() => toggleGroup(group.group)}
                className="flex w-full items-center justify-between px-4 py-1.5 cursor-pointer transition-colors duration-150"
                style={{ color: "var(--sb-label)" }}
              >
                <span className="text-[10px] font-semibold uppercase tracking-widest">{group.group}</span>
                {openGroups[group.group] ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronRight className="h-3 w-3" />
                )}
              </button>
            )}

            {/* Items */}
            {(group.group === "" || !collapsed ? openGroups[group.group] ?? true : true) &&
              group.items.map((item) => {
                const isActive = pathname === item.href
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={collapsed ? item.label : undefined}
                    className={cn(
                      "flex items-center gap-3 mx-2 my-0.5 rounded-md px-3 py-2 text-[13px] font-medium transition-all duration-150 cursor-pointer",
                      collapsed && "justify-center px-0 mx-1",
                    )}
                    style={
                      isActive
                        ? { background: "var(--sb-active-bg)", color: "var(--sb-active-fg)" }
                        : { color: "var(--sb-fg)" }
                    }
                    onMouseEnter={(e) => {
                      if (!isActive) {
                        const el = e.currentTarget as HTMLElement
                        el.style.background = "var(--sb-hover-bg)"
                        el.style.color = "var(--sb-hover-fg)"
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) {
                        const el = e.currentTarget as HTMLElement
                        el.style.background = "transparent"
                        el.style.color = "var(--sb-fg)"
                      }
                    }}
                  >
                    <span className="shrink-0 opacity-80">{item.icon}</span>
                    {!collapsed && <span className="truncate">{item.label}</span>}
                  </Link>
                )
              })}
          </div>
        ))}
      </nav>

      {/* User footer */}
      {!collapsed && (
        <div
          className="shrink-0 flex items-center gap-3 px-4 py-3"
          style={{ borderTop: "1px solid var(--sb-border)" }}
        >
          <div
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
            style={{ background: "var(--primary)" }}
          >
            A
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-white truncate">Admin</p>
            <p className="text-[10px] truncate" style={{ color: "var(--sb-label)" }}>admin@pedami.id</p>
          </div>
        </div>
      )}
    </aside>
  )
}

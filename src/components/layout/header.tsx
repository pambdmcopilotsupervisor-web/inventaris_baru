"use client"

import React, { useState } from "react"
import { usePathname } from "next/navigation"
import { Menu, Bell, Search, ChevronDown, LogOut, User, Settings, ChevronRight } from "lucide-react"

const BREADCRUMB_MAP: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/dashboard/master-data/karyawan": "Karyawan",
  "/dashboard/master-data/divisi": "Divisi",
  "/dashboard/master-data/subdivisi": "Sub Divisi",
  "/dashboard/master-data/ruangan": "Ruangan",
  "/dashboard/master-data/users": "Users",
  "/dashboard/transaksi/aset": "Inventaris Aset",
  "/dashboard/transaksi/kendaraan": "Kendaraan R2/R4",
  "/dashboard/transaksi/kontrak": "Kontrak",
  "/dashboard/transaksi/mutasi-aset": "Mutasi Aset",
  "/dashboard/transaksi/mutasi-karyawan": "Mutasi Karyawan",
  "/dashboard/transaksi/mutasi-kendaraan": "Mutasi R2/R4",
  "/dashboard/transaksi/disposal": "Permohonan Disposal",
  "/dashboard/transaksi/servis-kendaraan": "Servis R2/R4",
  "/dashboard/transaksi/service-ac": "Service AC",
  "/dashboard/transaksi/pembayaran-kendaraan": "Pembayaran R2/R4",
  "/dashboard/transaksi/penjualan-kendaraan": "Penjualan R2/R4",
  "/dashboard/transaksi/pensiun-karyawan": "Pensiun Karyawan",
  "/dashboard/laporan/tagihan-sewa": "Tagihan Sewa Kendaraan",
  "/dashboard/laporan/rekap-karyawan": "Rekap Karyawan",
  "/dashboard/laporan/pendapatan-aset": "Pendapatan Aset",
}

const SECTION_MAP: Record<string, string> = {
  "master-data": "Master Data",
  "transaksi": "Transaksi",
  "laporan": "Laporan",
}

function getBreadcrumbs(pathname: string) {
  const parts = pathname.split("/").filter(Boolean)
  const crumbs: { label: string; href: string }[] = [{ label: "Dashboard", href: "/dashboard" }]
  if (parts.length > 1) {
    const section = SECTION_MAP[parts[1]]
    if (section) crumbs.push({ label: section, href: "#" })
  }
  const fullLabel = BREADCRUMB_MAP[pathname]
  if (fullLabel && parts.length > 1) crumbs.push({ label: fullLabel, href: pathname })
  return crumbs
}

export function Header({ onToggleSidebar }: { onToggleSidebar: () => void; title?: string }) {
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const pathname = usePathname()
  const crumbs = getBreadcrumbs(pathname)
  const pageTitle = BREADCRUMB_MAP[pathname] ?? "Dashboard"

  return (
    <header
      className="flex h-14 shrink-0 items-center justify-between px-4 lg:px-6 gap-4"
      style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)" }}
    >
      {/* Left: Toggle + Breadcrumb */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={onToggleSidebar}
          className="shrink-0 flex h-8 w-8 items-center justify-center rounded-md transition-colors duration-150 cursor-pointer"
          style={{ color: "var(--text-muted)" }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "var(--surface-hover)")}
          onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "transparent")}
          aria-label="Toggle sidebar"
        >
          <Menu className="h-4 w-4" />
        </button>

        {/* Breadcrumbs — UX: show user location (design system rule) */}
        <nav className="hidden md:flex items-center gap-1 text-sm" aria-label="Breadcrumb">
          {crumbs.map((crumb, i) => (
            <React.Fragment key={i}>
              {i > 0 && <ChevronRight className="h-3 w-3 shrink-0" style={{ color: "var(--text-subtle)" }} />}
              {i === crumbs.length - 1 ? (
                <span className="font-semibold truncate max-w-[200px]" style={{ color: "var(--text-900)" }}>
                  {crumb.label}
                </span>
              ) : (
                <a
                  href={crumb.href}
                  className="transition-colors duration-150 truncate cursor-pointer hover:underline"
                  style={{ color: "var(--text-subtle)" }}
                >
                  {crumb.label}
                </a>
              )}
            </React.Fragment>
          ))}
        </nav>

        {/* Mobile page title */}
        <span className="md:hidden font-semibold text-sm truncate" style={{ color: "var(--text-900)" }}>
          {pageTitle}
        </span>
      </div>

      {/* Right: Search + Notif + User */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Search */}
        <div
          className="hidden lg:flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm w-48 cursor-text transition-all duration-150"
          style={{ border: "1px solid var(--border)", background: "var(--surface-muted)", color: "var(--text-subtle)" }}
          onFocus={(e) => ((e.currentTarget as HTMLElement).style.borderColor = "var(--secondary)")}
          onBlur={(e) => ((e.currentTarget as HTMLElement).style.borderColor = "var(--border)")}
        >
          <Search className="h-3.5 w-3.5 shrink-0" />
          <input
            type="text"
            placeholder="Cari..."
            className="bg-transparent outline-none w-full text-xs"
            style={{ color: "var(--text-900)", fontFamily: "var(--font-body)" }}
          />
        </div>

        {/* Notifications */}
        <button
          className="relative flex h-8 w-8 items-center justify-center rounded-md transition-colors duration-150 cursor-pointer"
          style={{ color: "var(--text-muted)" }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "var(--surface-hover)")}
          onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "transparent")}
          aria-label="Notifikasi"
        >
          <Bell className="h-4 w-4" />
          <span
            className="absolute top-1 right-1 h-2 w-2 rounded-full ring-2 ring-white"
            style={{ background: "var(--cta)" }}
          />
        </button>

        {/* User dropdown */}
        <div className="relative">
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors duration-150 cursor-pointer"
            onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "var(--surface-hover)")}
            onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "transparent")}
          >
            <div
              className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-white shrink-0"
              style={{ background: "var(--primary)" }}
            >
              A
            </div>
            <div className="hidden md:block text-left">
              <p className="text-xs font-semibold leading-tight" style={{ color: "var(--text-900)" }}>Admin</p>
              <p className="text-[10px] leading-tight" style={{ color: "var(--text-muted)" }}>Administrator</p>
            </div>
            <ChevronDown className="hidden md:block h-3.5 w-3.5" style={{ color: "var(--text-subtle)" }} />
          </button>

          {dropdownOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setDropdownOpen(false)} />
              <div
                className="absolute right-0 mt-1 w-52 rounded-xl shadow-xl z-50 overflow-hidden"
                style={{ border: "1px solid var(--border)", background: "var(--surface)" }}
              >
                <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
                  <p className="text-xs font-semibold" style={{ color: "var(--text-900)" }}>Admin</p>
                  <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>admin@pedami.id</p>
                </div>
                <div className="p-1">
                  {[
                    { icon: <User className="h-4 w-4" />, label: "Profile", danger: false },
                    { icon: <Settings className="h-4 w-4" />, label: "Pengaturan", danger: false },
                  ].map((item) => (
                    <button
                      key={item.label}
                      className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors duration-150 cursor-pointer"
                      style={{ color: "var(--text-700)" }}
                      onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "var(--primary-light)")}
                      onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "transparent")}
                    >
                      {item.icon} {item.label}
                    </button>
                  ))}
                  <div style={{ borderTop: "1px solid var(--border)", margin: "4px 0" }} />
                  <button
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors duration-150 cursor-pointer"
                    style={{ color: "var(--danger)" }}
                    onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "var(--danger-bg)")}
                    onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "transparent")}
                  >
                    <LogOut className="h-4 w-4" /> Keluar
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  )
}

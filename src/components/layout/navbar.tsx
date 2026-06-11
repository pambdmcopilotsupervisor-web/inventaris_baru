"use client"

import React, { useState, useRef, useEffect } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { useAuth } from "@/contexts/AuthContext"
import {
  LayoutDashboard, Users, Archive, Truck, BarChart3, Database,
  Bell, Search, ChevronDown, LogOut, User, Settings, Package,
  Cpu, ArrowLeftRight, UserMinus, UserX, Trash2, AirVent,
  Building2, GitBranch, DoorOpen, UserCog, FileText, Wrench,
  CreditCard, ShoppingCart, Receipt, TrendingUp, ChevronRight,
  Menu, X,
} from "lucide-react"

/* ────────────────────────────────────────────
   MENU STRUCTURE — dikelompokkan secara logis
   ──────────────────────────────────────────── */
const NAV_GROUPS = [
  {
    key: "dashboard",
    label: "Dashboard",
    icon: <LayoutDashboard className="h-4 w-4" />,
    href: "/dashboard",
    items: [],
  },
  {
    key: "sdm",
    label: "SDM",
    icon: <Users className="h-4 w-4" />,
    items: [
      {
        section: "Data Karyawan",
        links: [
          { label: "Data Karyawan",    href: "/dashboard/master-data/karyawan",             icon: <Users className="h-3.5 w-3.5" />, desc: "Kelola data seluruh karyawan" },
          { label: "Mutasi Karyawan",  href: "/dashboard/transaksi/mutasi-karyawan",        icon: <ArrowLeftRight className="h-3.5 w-3.5" />, desc: "Rotasi & perpindahan jabatan" },
          { label: "Pensiun Karyawan", href: "/dashboard/transaksi/pensiun-karyawan",       icon: <UserX className="h-3.5 w-3.5" />, desc: "Data karyawan pensiun" },
        ],
      },
      {
        section: "Laporan SDM",
        links: [
          { label: "Rekap Karyawan",   href: "/dashboard/laporan/rekap-karyawan",           icon: <BarChart3 className="h-3.5 w-3.5" />, desc: "Statistik & rekap per divisi" },
        ],
      },
    ],
  },
  {
    key: "aset",
    label: "Aset Kantor",
    icon: <Archive className="h-4 w-4" />,
    items: [
      {
        section: "Pengelolaan Aset",
        links: [
          { label: "Inventaris Aset",     href: "/dashboard/transaksi/aset",          icon: <Archive className="h-3.5 w-3.5" />,   desc: "Komputer & perabotan kantor" },
          { label: "Mutasi Aset",         href: "/dashboard/transaksi/mutasi-aset",    icon: <ArrowLeftRight className="h-3.5 w-3.5" />, desc: "Perpindahan lokasi aset" },
          { label: "Permohonan Disposal", href: "/dashboard/transaksi/disposal",       icon: <Trash2 className="h-3.5 w-3.5" />,    desc: "Penghapusan aset tidak terpakai" },
          { label: "Service Aset",          href: "/dashboard/transaksi/service-ac",     icon: <AirVent className="h-3.5 w-3.5" />,   desc: "Riwayat perawatan & service aset" },
        ],
      },
    ],
  },
  {
    key: "kendaraan",
    label: "Kendaraan",
    icon: <Truck className="h-4 w-4" />,
    items: [
      {
        section: "Data & Transaksi",
        links: [
          { label: "Data R2/R4",       href: "/dashboard/transaksi/kendaraan",               icon: <Truck className="h-3.5 w-3.5" />,    desc: "Pendataan seluruh kendaraan" },
          { label: "Kontrak Sewa",     href: "/dashboard/transaksi/kontrak",                  icon: <FileText className="h-3.5 w-3.5" />, desc: "Kontrak sewa kendaraan" },
          { label: "Mutasi R2/R4",     href: "/dashboard/transaksi/mutasi-kendaraan",         icon: <ArrowLeftRight className="h-3.5 w-3.5" />, desc: "Perpindahan pemegang" },
        ],
      },
      {
        section: "Perawatan & Pembayaran",
        links: [
          { label: "Servis Kendaraan",  href: "/dashboard/transaksi/servis-kendaraan",       icon: <Wrench className="h-3.5 w-3.5" />,   desc: "Riwayat service & perbaikan" },
          { label: "Pembayaran Sewa",   href: "/dashboard/transaksi/pembayaran-kendaraan",   icon: <CreditCard className="h-3.5 w-3.5" />, desc: "Riwayat tagihan terbayar" },
          { label: "Penjualan R2/R4",   href: "/dashboard/transaksi/penjualan-kendaraan",   icon: <ShoppingCart className="h-3.5 w-3.5" />, desc: "Data penjualan kendaraan" },
        ],
      },
    ],
  },
  {
    key: "laporan",
    label: "Laporan",
    icon: <BarChart3 className="h-4 w-4" />,
    items: [
      {
        section: "Keuangan & Pendapatan",
        links: [
          { label: "Tagihan Sewa Kendaraan", href: "/dashboard/laporan/tagihan-sewa",       icon: <Receipt className="h-3.5 w-3.5" />,  desc: "Rekap tagihan per periode" },
          { label: "Pendapatan Aset",        href: "/dashboard/laporan/pendapatan-aset",    icon: <TrendingUp className="h-3.5 w-3.5" />, desc: "Analisis pendapatan bulanan" },
        ],
      },
    ],
  },
  {
    key: "master",
    label: "Master Data",
    icon: <Database className="h-4 w-4" />,
    items: [
      {
        section: "Referensi Data",
        links: [
          { label: "Divisi",     href: "/dashboard/master-data/divisi",     icon: <Building2 className="h-3.5 w-3.5" />, desc: "Divisi & departemen" },
          { label: "Sub Divisi", href: "/dashboard/master-data/subdivisi",  icon: <GitBranch className="h-3.5 w-3.5" />, desc: "Sub divisi & unit" },
          { label: "Ruangan",    href: "/dashboard/master-data/ruangan",    icon: <DoorOpen className="h-3.5 w-3.5" />,  desc: "Ruangan & lokasi aset" },
          { label: "Users",      href: "/dashboard/master-data/users",      icon: <UserCog className="h-3.5 w-3.5" />,   desc: "Akun & hak akses" },
        ],
      },
    ],
  },
]

/* ────────────────────────────────────────
   Dropdown Menu
   ──────────────────────────────────────── */
function DropdownMenu({ group, pathname }: { group: typeof NAV_GROUPS[0]; pathname: string }) {
  const isGroupActive = group.items.some((s) =>
    s.links.some((l) => pathname.startsWith(l.href))
  )

  return (
    <div className="space-y-4">
      {group.items.map((section) => (
        <div key={section.section}>
          <p className="text-[10px] font-bold uppercase tracking-widest mb-2 px-2" style={{ color: "var(--sb-label)" }}>
            {section.section}
          </p>
          <div className="space-y-0.5">
            {section.links.map((link) => {
              const isActive = pathname === link.href
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className="flex items-start gap-3 rounded-lg px-3 py-2.5 transition-colors duration-150 cursor-pointer group/item"
                  style={isActive ? { background: "var(--primary-light)" } : {}}
                  onMouseEnter={(e) => {
                    if (!isActive) (e.currentTarget as HTMLElement).style.background = "var(--surface-muted)"
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) (e.currentTarget as HTMLElement).style.background = "transparent"
                  }}
                >
                  <span className="mt-0.5 shrink-0" style={{ color: isActive ? "var(--primary)" : "var(--text-subtle)" }}>
                    {link.icon}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium leading-tight" style={{ color: isActive ? "var(--primary)" : "var(--text-900)" }}>
                      {link.label}
                    </p>
                    <p className="text-xs mt-0.5 leading-tight" style={{ color: "var(--text-subtle)" }}>
                      {link.desc}
                    </p>
                  </div>
                </Link>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

/* ────────────────────────────────────────
   Main Navbar
   ──────────────────────────────────────── */
export function Navbar() {
  const pathname = usePathname()
  const { user, logout } = useAuth()
  const [openDropdown, setOpenDropdown] = useState<string | null>(null)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [userOpen, setUserOpen] = useState(false)
  const navRef = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setOpenDropdown(null)
        setUserOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [])

  return (
    <>
      {/* ── Top bar ─────────────────────────────────────── */}
      <header
        ref={navRef}
        className="fixed top-0 left-0 right-0 z-50 flex h-14 items-center px-4 lg:px-6 gap-4"
        style={{ background: "var(--sb-bg)", borderBottom: "1px solid var(--sb-border)" }}
      >
        {/* Logo */}
        <Link href="/dashboard" className="flex items-center gap-2.5 shrink-0 mr-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ background: "var(--primary)" }}>
            <Package className="h-4 w-4 text-white" />
          </div>
          <span className="hidden sm:block text-sm font-bold text-white tracking-wide">PEDAMI</span>
        </Link>

        {/* Nav items — desktop */}
        <nav className="hidden lg:flex items-center gap-1 flex-1">
          {NAV_GROUPS.map((group) => {
            const isActive = group.href
              ? pathname === group.href
              : group.items.some((s) => s.links.some((l) => pathname.startsWith(l.href)))
            const isOpen = openDropdown === group.key

            return group.items.length === 0 ? (
              /* Direct link (Dashboard) */
              <Link
                key={group.key}
                href={group.href!}
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-all duration-150 cursor-pointer"
                style={isActive
                  ? { background: "rgba(255,255,255,0.12)", color: "#fff" }
                  : { color: "var(--sb-fg)" }
                }
                onMouseEnter={(e) => { if (!isActive) (e.currentTarget as HTMLElement).style.background = "var(--sb-hover-bg)" }}
                onMouseLeave={(e) => { if (!isActive) (e.currentTarget as HTMLElement).style.background = "transparent" }}
              >
                {group.icon}
                {group.label}
              </Link>
            ) : (
              /* Dropdown trigger */
              <div key={group.key} className="relative">
                <button
                  onClick={() => setOpenDropdown(isOpen ? null : group.key)}
                  className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-all duration-150 cursor-pointer"
                  style={isActive || isOpen
                    ? { background: "rgba(255,255,255,0.12)", color: "#fff" }
                    : { color: "var(--sb-fg)" }
                  }
                  onMouseEnter={(e) => { if (!isActive && !isOpen) (e.currentTarget as HTMLElement).style.background = "var(--sb-hover-bg)" }}
                  onMouseLeave={(e) => { if (!isActive && !isOpen) (e.currentTarget as HTMLElement).style.background = isActive || isOpen ? "rgba(255,255,255,0.12)" : "transparent" }}
                >
                  {group.icon}
                  {group.label}
                  <ChevronDown className={cn("h-3 w-3 transition-transform duration-150", isOpen && "rotate-180")} />
                </button>

                {/* Dropdown panel */}
                {isOpen && (
                  <div
                    className="absolute top-full left-0 mt-2 w-72 rounded-xl shadow-2xl p-4"
                    style={{ background: "var(--surface)", border: "1px solid var(--border)", zIndex: 60 }}
                  >
                    <DropdownMenu group={group} pathname={pathname} />
                  </div>
                )}
              </div>
            )
          })}
        </nav>

        {/* Right actions */}
        <div className="flex items-center gap-1.5 ml-auto shrink-0">
          {/* Search */}
          <div
            className="hidden md:flex items-center gap-2 rounded-lg px-3 py-1.5 w-44 cursor-text transition-all duration-150"
            style={{ border: "1px solid var(--sb-border)", background: "rgba(255,255,255,0.05)", color: "var(--sb-label)" }}
          >
            <Search className="h-3.5 w-3.5 shrink-0" />
            <input
              type="text"
              placeholder="Cari..."
              className="bg-transparent outline-none w-full text-xs text-white placeholder-[--sb-label]"
              style={{ fontFamily: "var(--font-body)" }}
            />
          </div>

          {/* Bell */}
          <button
            className="relative flex h-8 w-8 items-center justify-center rounded-lg transition-colors duration-150 cursor-pointer"
            style={{ color: "var(--sb-fg)" }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "var(--sb-hover-bg)")}
            onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "transparent")}
          >
            <Bell className="h-4 w-4" />
            <span className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full" style={{ background: "var(--cta)" }} />
          </button>

          {/* User */}
          <div className="relative">
            <button
              onClick={() => setUserOpen(!userOpen)}
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors duration-150 cursor-pointer"
              onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "var(--sb-hover-bg)")}
              onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "transparent")}
            >
              <div className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-white shrink-0" style={{ background: "var(--primary)" }}>A</div>
              <div className="hidden md:block text-left">
                <p className="text-xs font-semibold text-white leading-tight">{user?.nama_karyawan ?? user?.name ?? "User"}</p>
                <p className="text-[10px] leading-tight" style={{ color: "var(--sb-label)" }}>{user?.jabatan ?? user?.role ?? ""}</p>
              </div>
              <ChevronDown className="hidden md:block h-3.5 w-3.5" style={{ color: "var(--sb-label)" }} />
            </button>

            {userOpen && (
              <div
                className="absolute right-0 mt-1 w-52 rounded-xl shadow-xl overflow-hidden"
                style={{ background: "var(--surface)", border: "1px solid var(--border)", zIndex: 60 }}
              >
                <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
                  <p className="text-xs font-semibold" style={{ color: "var(--text-900)" }}>{user?.nama_karyawan ?? user?.name ?? "User"}</p>
                  <p className="text-[11px]" style={{ color: "var(--text-subtle)" }}>{user?.email ?? ""}</p>
                </div>
                <div className="p-1">
                  {[
                    { icon: <User className="h-4 w-4" />, label: "Profile",     href: "/dashboard/profile" },
                    { icon: <Settings className="h-4 w-4" />, label: "Pengaturan", href: "/dashboard/pengaturan" },
                  ].map((item) => (
                    <button key={item.label}
                      className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm cursor-pointer transition-colors duration-150"
                      style={{ color: "var(--text-700)" }}
                      onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "var(--primary-light)")}
                      onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "transparent")}
                      onClick={() => { setUserOpen(false); window.location.href = item.href }}
                    >
                      {item.icon} {item.label}
                    </button>
                  ))}
                  <div style={{ borderTop: "1px solid var(--border)", margin: "4px 0" }} />
                  <button className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm cursor-pointer transition-colors duration-150"
                    style={{ color: "var(--danger)" }}
                    onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "var(--danger-bg)")}
                    onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "transparent")}
                    onClick={() => logout()}
                  >
                    <LogOut className="h-4 w-4" /> Keluar
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="flex lg:hidden h-8 w-8 items-center justify-center rounded-lg transition-colors duration-150 cursor-pointer"
            style={{ color: "var(--sb-fg)" }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "var(--sb-hover-bg)")}
            onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "transparent")}
          >
            {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </header>

      {/* ── Mobile menu drawer ──────────────────────────── */}
      {mobileOpen && (
        <div
          className="fixed inset-x-0 top-14 z-40 lg:hidden overflow-y-auto max-h-[calc(100vh-56px)] pb-6"
          style={{ background: "var(--sb-bg)", borderBottom: "1px solid var(--sb-border)" }}
        >
          {NAV_GROUPS.map((group) => (
            <div key={group.key} style={{ borderBottom: "1px solid var(--sb-border)" }}>
              {group.items.length === 0 ? (
                <Link
                  href={group.href!}
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center gap-3 px-5 py-3.5 text-sm font-semibold cursor-pointer"
                  style={{ color: pathname === group.href ? "#fff" : "var(--sb-fg)" }}
                >
                  {group.icon} {group.label}
                </Link>
              ) : (
                <div className="px-5 py-4">
                  <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest mb-3" style={{ color: "var(--sb-label)" }}>
                    {group.icon} {group.label}
                  </p>
                  <div className="space-y-1 pl-2">
                    {group.items.flatMap((s) => s.links).map((link) => (
                      <Link
                        key={link.href}
                        href={link.href}
                        onClick={() => setMobileOpen(false)}
                        className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm cursor-pointer transition-colors duration-150"
                        style={pathname === link.href
                          ? { background: "var(--primary)", color: "#fff" }
                          : { color: "var(--sb-fg)" }
                        }
                      >
                        {link.icon} {link.label}
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Overlay for dropdowns ───────────────────────── */}
      {openDropdown && (
        <div className="fixed inset-0 z-30" onClick={() => setOpenDropdown(null)} />
      )}
    </>
  )
}

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
  Menu, X, Layers, Clock, CalendarDays, CalendarOff, CalendarX, ClipboardList,
  Umbrella, CheckSquare, Wallet, ClipboardCheck, LogIn, Stethoscope, Timer, AlertTriangle,
  MapPin, Shield, History, Banknote, Settings2, PlayCircle,
} from "lucide-react"

/* ────────────────────────────────────────────
   MENU STRUCTURE — dikelompokkan secara logis
   ──────────────────────────────────────────── */
type NavLink = {
  label: string
  href: string
  icon: React.ReactNode
  desc: string
}

type NavSection = {
  section: string
  links: NavLink[]
}

type NavGroup = {
  key: string
  label: string
  icon: React.ReactNode
  href?: string
  items: NavSection[]
}

type AppModul = "aset" | "sdm" | "kinerja"

function readStoredModul(): AppModul | null {
  if (typeof window === "undefined") return null
  const value = localStorage.getItem("pedami_modul")
  return value === "aset" || value === "sdm" || value === "kinerja" ? value : null
}

const modulLabels: Record<AppModul, string> = {
  aset: "Modul Aset",
  sdm: "Modul SDM",
  kinerja: "Modul Kinerja",
}

const modulColors: Record<AppModul, string> = {
  aset: "rgba(30,64,175,0.3)",
  sdm: "rgba(22,101,52,0.3)",
  kinerja: "rgba(234,88,12,0.3)",
}

const NAV_GROUPS: NavGroup[] = [
  {
    key: "dashboard",
    label: "Dashboard",
    icon: <LayoutDashboard className="h-4 w-4" />,
    href: "/dashboard/sdm",
    items: [],
  },
  {
    key: "sdm",
    label: "Karyawan",
    icon: <Users className="h-4 w-4" />,
    items: [
      {
        section: "Data Karyawan",
        links: [
          { label: "Data Karyawan",    href: "/dashboard/master-data/karyawan",      icon: <Users className="h-3.5 w-3.5" />,         desc: "Kelola data seluruh karyawan" },
          { label: "Mutasi Karyawan",  href: "/dashboard/transaksi/mutasi-karyawan", icon: <ArrowLeftRight className="h-3.5 w-3.5" />, desc: "Rotasi & perpindahan jabatan" },
          { label: "Pensiun Karyawan", href: "/dashboard/transaksi/pensiun-karyawan",icon: <UserX className="h-3.5 w-3.5" />,          desc: "Data karyawan pensiun" },
        ],
      },
      {
        section: "Laporan",
        links: [
          { label: "Rekap Karyawan", href: "/dashboard/laporan/rekap-karyawan", icon: <BarChart3 className="h-3.5 w-3.5" />, desc: "Statistik & rekap per divisi" },
        ],
      },
    ],
  },
  {
    key: "jadwal-kerja",
    label: "Jadwal Kerja",
    icon: <CalendarDays className="h-4 w-4" />,
    items: [
      {
        section: "Shift & Jadwal",
        links: [
          { label: "Master Shift",  href: "/dashboard/sdm/shift",        icon: <Clock className="h-3.5 w-3.5" />,       desc: "Definisi shift Pagi / Siang / Malam" },
          { label: "Jadwal Kerja",  href: "/dashboard/sdm/jadwal-shift", icon: <CalendarDays className="h-3.5 w-3.5" />, desc: "Assign jadwal shift pegawai" },
        ],
      },
      {
        section: "Kalender",
        links: [
          { label: "Hari Libur", href: "/dashboard/sdm/hari-libur", icon: <CalendarOff className="h-3.5 w-3.5" />, desc: "Kalender libur nasional & perusahaan" },
        ],
      },
    ],
  },
  {
    key: "absensi",
    label: "Absensi",
    icon: <ClipboardList className="h-4 w-4" />,
    items: [
      {
        section: "Monitoring & Input",
        links: [
          { label: "Monitoring Absensi", href: "/dashboard/sdm/absensi", icon: <ClipboardList className="h-3.5 w-3.5" />, desc: "Input manual & monitoring absensi harian" },
        ],
      },
      {
        section: "Laporan Absensi",
        links: [
          { label: "Absensi Bulanan Pegawai", href: "/dashboard/sdm/absensi/bulanan", icon: <CalendarDays className="h-3.5 w-3.5" />, desc: "Absensi pegawai per bulan dalam tabel & kalender" },
          { label: "Anomali Absensi", href: "/dashboard/sdm/absensi/anomali", icon: <AlertTriangle className="h-3.5 w-3.5" />, desc: "Pantau telat, alpha, tidak absen, dan absen di luar jam" },
          { label: "Karyawan Tanpa Jadwal", href: "/dashboard/sdm/absensi/tanpa-jadwal", icon: <CalendarX className="h-3.5 w-3.5" />, desc: "Pegawai aktif yang belum memiliki jadwal shift" },
          { label: "Lokasi Absensi Mobile", href: "/dashboard/sdm/absensi/lokasi-config", icon: <MapPin className="h-3.5 w-3.5" />, desc: "Atur titik lokasi dan radius absensi mobile" },
          { label: "Rekap Absensi",   href: "/dashboard/sdm/absensi/rekap",   icon: <BarChart3 className="h-3.5 w-3.5" />,    desc: "Rekap ringkas absensi per periode" },
        ],
      },
    ],
  },
  {
    key: "pengajuan",
    label: "Pengajuan",
    icon: <ClipboardList className="h-4 w-4" />,
    items: [
      {
        section: "Cuti",
        links: [
          { label: "Pengajuan Cuti",  href: "/dashboard/sdm/pengajuan-cuti", icon: <Umbrella className="h-3.5 w-3.5" />,     desc: "Ajukan & kelola cuti" },
          { label: "Approval Cuti",   href: "/dashboard/sdm/approval-cuti",  icon: <CheckSquare className="h-3.5 w-3.5" />,  desc: "Antrian persetujuan cuti" },
          { label: "Jenis Cuti",      href: "/dashboard/sdm/jenis-cuti",     icon: <FileText className="h-3.5 w-3.5" />,     desc: "Master jenis cuti" },
          { label: "Saldo Cuti",      href: "/dashboard/sdm/saldo-cuti",     icon: <Wallet className="h-3.5 w-3.5" />,       desc: "Saldo cuti per pegawai" },
        ],
      },
      {
        section: "Izin",
        links: [
          { label: "Pengajuan Izin",  href: "/dashboard/sdm/pengajuan-izin", icon: <ClipboardCheck className="h-3.5 w-3.5" />, desc: "Ajukan & kelola izin" },
          { label: "Approval Izin",   href: "/dashboard/sdm/approval-izin",  icon: <CheckSquare className="h-3.5 w-3.5" />,    desc: "Antrian persetujuan izin" },
          { label: "Jenis Izin",      href: "/dashboard/sdm/jenis-izin",     icon: <FileText className="h-3.5 w-3.5" />,       desc: "Master jenis izin" },
        ],
      },
      {
        section: "Sakit",
        links: [
          { label: "Pengajuan Sakit",  href: "/dashboard/sdm/pengajuan-sakit", icon: <Stethoscope className="h-3.5 w-3.5" />, desc: "Ajukan sakit + lampiran surat sakit" },
          { label: "Approval Sakit",   href: "/dashboard/sdm/approval-sakit",  icon: <CheckSquare className="h-3.5 w-3.5" />,  desc: "Antrian persetujuan sakit" },
        ],
      },
    ],
  },
  {
    key: "lembur",
    label: "Lembur",
    icon: <Timer className="h-4 w-4" />,
    items: [
      {
        section: "Pengajuan",
        links: [
          { label: "Pengajuan Lembur",  href: "/dashboard/sdm/pengajuan-lembur", icon: <Timer className="h-3.5 w-3.5" />,       desc: "Ajukan & kelola pengajuan lembur" },
          { label: "Approval Lembur",   href: "/dashboard/sdm/approval-lembur",  icon: <CheckSquare className="h-3.5 w-3.5" />, desc: "Daftar lembur menunggu persetujuan" },
        ],
      },
      {
        section: "Konfigurasi",
        links: [
          { label: "Setting Lembur",  href: "/dashboard/sdm/overtime-settings",  icon: <Settings className="h-3.5 w-3.5" />,  desc: "Tarif & aturan perhitungan lembur" },
        ],
      },
    ],
  },
  {
    key: "penggajian",
    label: "Penggajian",
    icon: <Banknote className="h-4 w-4" />,
    items: [
      {
        section: "Master Konfigurasi",
        links: [
          { label: "Komponen Gaji",   href: "/dashboard/payroll/components",      icon: <Settings2 className="h-3.5 w-3.5" />,    desc: "Definisi komponen pendapatan & potongan" },
          { label: "Komponen per Jabatan", href: "/dashboard/payroll/positions",  icon: <Banknote className="h-3.5 w-3.5" />,     desc: "Set tunjangan/potongan berdasarkan jabatan" },
          { label: "Aturan Potongan", href: "/dashboard/payroll/deduction-rules", icon: <ClipboardList className="h-3.5 w-3.5" />, desc: "Konfigurasi potongan absensi dinamis" },
          { label: "Pajak & BPJS",    href: "/dashboard/payroll/tax-settings",     icon: <Receipt className="h-3.5 w-3.5" />,      desc: "Tarif BPJS, PTKP & lapisan PPh21" },
          { label: "Penyesuaian Gaji Massal", href: "/dashboard/payroll/bulk-adjust", icon: <TrendingUp className="h-3.5 w-3.5" />, desc: "Naikkan komponen gaji untuk banyak karyawan sekaligus" },
        ],
      },
      {
        section: "Proses Gaji",
        links: [
          { label: "Payroll Run", href: "/dashboard/payroll/run", icon: <PlayCircle className="h-3.5 w-3.5" />, desc: "Hitung & kelola periode gaji bulanan, THR, dan Bonus" },
        ],
      },
      {
        section: "Per Karyawan",
        links: [
          { label: "Pinjaman Karyawan", href: "/dashboard/payroll/loans", icon: <Wallet className="h-3.5 w-3.5" />, desc: "Kelola pinjaman & cicilan, dipotong otomatis saat payroll" },
          { label: "Struktur Gaji Karyawan", href: "/dashboard/master-data/karyawan", icon: <Users className="h-3.5 w-3.5" />, desc: "Buka Data Karyawan → ikon Wallet untuk atur gaji per orang" },
        ],
      },
    ],
  },
  {
    key: "dashboard-kinerja",
    label: "Dashboard Kinerja",
    icon: <BarChart3 className="h-4 w-4" />,
    href: "/dashboard/sdm/penilaian-kinerja/dashboard",
    items: [],
  },
  {
    key: "penilaian",
    label: "Penilaian",
    icon: <ClipboardCheck className="h-4 w-4" />,
    items: [
      {
        section: "Kinerja Pegawai",
        links: [
          { label: "Target Kerja",     href: "/dashboard/sdm/penilaian-kinerja/target",  icon: <ClipboardCheck className="h-3.5 w-3.5" />, desc: "Penetapan target kerja awal periode" },
          { label: "Penilaian Mandiri", href: "/dashboard/sdm/penilaian-kinerja/mandiri", icon: <ClipboardList className="h-3.5 w-3.5" />,  desc: "Form self-assessment penilaian kinerja" },
          { label: "Penilaian Atasan",  href: "/dashboard/sdm/penilaian-kinerja/atasan",  icon: <Users className="h-3.5 w-3.5" />,          desc: "Form penilaian kinerja bawahan" },
          { label: "Inbox Approval",    href: "/dashboard/sdm/penilaian-kinerja/inbox",   icon: <CheckSquare className="h-3.5 w-3.5" />,    desc: "Monitoring & approval penilaian kinerja" },
        ],
      },
      {
        section: "Konfigurasi",
        links: [
          { label: "Komponen Penilaian", href: "/dashboard/sdm/komponen-penilaian", icon: <Settings className="h-3.5 w-3.5" />, desc: "Kelola komponen & bobot penilaian" },
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
function DropdownMenu({ group, pathname, onClose }: { group: NavGroup; pathname: string; onClose?: () => void }) {
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
                  href={link.href}                  onClick={onClose}                  className="flex items-start gap-3 rounded-lg px-3 py-2.5 transition-colors duration-150 cursor-pointer group/item"
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
  const { user, logout, loading: authLoading } = useAuth()
  const [openDropdown, setOpenDropdown] = useState<string | null>(null)
  const [dropdownLeft, setDropdownLeft] = useState(0)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [userOpen, setUserOpen] = useState(false)
  const [modul, setModul] = useState<AppModul | null>(null)
  const navRef = useRef<HTMLDivElement>(null)
  const triggerRefs = useRef<Record<string, HTMLButtonElement | null>>({})

  // Baca localStorage setelah hydration selesai agar SSR dan client match
  useEffect(() => {
    const timeoutId = window.setTimeout(() => setModul(readStoredModul()), 0)
    return () => window.clearTimeout(timeoutId)
  }, [])

  // Sinkronkan jika localStorage berubah dari tab/window lain.
  useEffect(() => {
    const handleStorage = () => setModul(readStoredModul())
    window.addEventListener("storage", handleStorage)
    return () => window.removeEventListener("storage", handleStorage)
  }, [])

  // Filter menu berdasarkan modul aktif
  const activeGroups = NAV_GROUPS.filter(g => {
    if (!modul) return true // tampilkan semua jika belum pilih
    if (modul === "aset") return ["dashboard", "aset", "kendaraan", "laporan"].includes(g.key)
    if (modul === "sdm")  return ["dashboard", "sdm", "jadwal-kerja", "absensi", "pengajuan", "lembur", "penggajian", "master"].includes(g.key)
    if (modul === "kinerja") return ["dashboard-kinerja", "penilaian"].includes(g.key)
    return true
  }).map((g) => {
    // Filter menu items berdasarkan allowed_menus user
    // Admin (role=admin) atau user tanpa batasan (allowed_menus=null) lihat semua
    if (!user || user.role === "admin" || !user.allowed_menus) return g
    if (g.href) return user.allowed_menus.includes(g.href) ? g : { ...g, href: undefined, items: [] }

    return {
      ...g,
      items: g.items
        .map((section) => ({
          ...section,
          links: section.links.filter((l) => user.allowed_menus!.includes(l.href)),
        }))
        .filter((section) => section.links.length > 0),
    }
  }).filter((g) => {
    // Hapus group yang tidak punya items setelah filter (kecuali direct link seperti dashboard)
    if (g.items.length === 0 && !g.href) return false
    return true
  })

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
        <nav className="hidden lg:flex flex-1 min-w-0 overflow-x-auto scrollbar-none">
          <div className="flex items-center gap-1 py-0.5">
            {authLoading ? (
              /* Placeholder selama loading — cegah flash semua menu */
              <div className="flex gap-1">
                {[1,2,3].map((i) => (
                  <div key={i} className="h-7 w-20 rounded-lg animate-pulse shrink-0" style={{ background: "rgba(255,255,255,0.08)" }} />
                ))}
              </div>
            ) : activeGroups.map((group) => {
              const isActive = group.href
                ? pathname === group.href
                : group.items.some((s) => s.links.some((l) => pathname.startsWith(l.href)))
              const isOpen = openDropdown === group.key

              return group.items.length === 0 ? (
                /* Direct link (Dashboard) */
                <Link
                  key={group.key}
                  href={group.href!}
                  className="shrink-0 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-all duration-150 cursor-pointer"
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
                /* Dropdown trigger — panel is rendered at header level, not here */
                <button
                  key={group.key}
                  ref={(el) => { triggerRefs.current[group.key] = el }}
                  onClick={() => {
                    if (openDropdown === group.key) {
                      setOpenDropdown(null)
                    } else {
                      const el = triggerRefs.current[group.key]
                      if (el) {
                        const rect = el.getBoundingClientRect()
                        setDropdownLeft(rect.left)
                      }
                      setOpenDropdown(group.key)
                    }
                  }}
                  className="shrink-0 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-all duration-150 cursor-pointer"
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
              )
            })}
          </div>
        </nav>

        {/* Dropdown panel — rendered at header level, not inside nav, so overflow-x:auto doesn't clip it */}
        {openDropdown && (() => {
          const group = activeGroups.find((g) => g.key === openDropdown)
          if (!group || group.items.length === 0) return null
          const safeLeft = Math.min(dropdownLeft, (typeof window !== "undefined" ? window.innerWidth : 1024) - 288 - 16)
          return (
            <div
              className="absolute mt-1 w-72 rounded-xl shadow-2xl p-4"
              style={{ top: "56px", left: safeLeft, background: "var(--surface)", border: "1px solid var(--border)", zIndex: 60 }}
            >
              <DropdownMenu group={group} pathname={pathname} onClose={() => setOpenDropdown(null)} />
            </div>
          )
        })()}

        {/* Right actions */}
        <div className="flex items-center gap-1.5 ml-auto shrink-0">

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

          {/* Tombol ganti modul */}
          {modul && (
            <button
              onClick={() => { localStorage.removeItem("pedami_modul"); window.location.href = "/select-module" }}
              className="hidden md:flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors duration-150 cursor-pointer mr-1"
              title="Ganti Modul"
              style={{ background: modulColors[modul], color: "#fff", border: "1px solid rgba(255,255,255,0.15)" }}
              onMouseEnter={e => ((e.currentTarget as HTMLElement).style.opacity = "0.8")}
              onMouseLeave={e => ((e.currentTarget as HTMLElement).style.opacity = "1")}
            >
              <Layers className="h-3 w-3" />
              {modulLabels[modul]}
            </button>
          )}

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
                    ...(user?.role === "admin" || user?.role === "hrd" ? [{ icon: <History className="h-4 w-4" />, label: "Audit Log", href: "/dashboard/pengaturan/audit-log" }] : []),
                    ...(user?.role === "admin" ? [{ icon: <Shield className="h-4 w-4" />, label: "Hak Akses Menu", href: "/dashboard/pengaturan/hak-akses" }] : []),
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
          {activeGroups.map((group) => (
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

export type ModulKey = "aset" | "sdm" | "kinerja" | "keuangan"

export const ACTIVE_MODULE_STORAGE_KEY = "pedami_modul"
export const DASHBOARD_HOME_STORAGE_KEY = "pedami_dashboard_home"

export function normalizeModulKey(value: string | null | undefined): ModulKey | null {
  const normalized = value?.trim().toLowerCase()
  if (
    normalized === "aset" ||
    normalized === "sdm" ||
    normalized === "kinerja" ||
    normalized === "keuangan"
  ) {
    return normalized
  }

  return null
}

export function getModulePath(modul: ModulKey): string {
  switch (modul) {
    case "aset":
      return "/dashboard"
    case "sdm":
      return "/dashboard/sdm"
    case "kinerja":
      return "/dashboard/sdm/penilaian-kinerja/dashboard"
    case "keuangan":
      return "/dashboard/keuangan"
    default:
      return "/dashboard"
  }
}

export function inferModulFromPathname(pathname: string): ModulKey | null {
  if (pathname === "/dashboard/keuangan" || pathname.startsWith("/dashboard/keuangan/")) {
    return "keuangan"
  }

  if (
    pathname.startsWith("/dashboard/sdm/penilaian-kinerja") ||
    pathname.startsWith("/dashboard/sdm/komponen-penilaian")
  ) {
    return "kinerja"
  }

  if (
    pathname === "/dashboard/sdm" ||
    pathname.startsWith("/dashboard/sdm/") ||
    pathname.startsWith("/dashboard/payroll") ||
    pathname.startsWith("/dashboard/master-data") ||
    pathname.startsWith("/dashboard/transaksi/mutasi-karyawan") ||
    pathname.startsWith("/dashboard/transaksi/pensiun-karyawan") ||
    pathname.startsWith("/dashboard/laporan/rekap-karyawan")
  ) {
    return "sdm"
  }

  if (
    pathname === "/dashboard" ||
    pathname.startsWith("/dashboard/transaksi/aset") ||
    pathname.startsWith("/dashboard/transaksi/mutasi-aset") ||
    pathname.startsWith("/dashboard/transaksi/disposal") ||
    pathname.startsWith("/dashboard/transaksi/service-ac") ||
    pathname.startsWith("/dashboard/transaksi/kendaraan") ||
    pathname.startsWith("/dashboard/transaksi/kontrak") ||
    pathname.startsWith("/dashboard/transaksi/mutasi-kendaraan") ||
    pathname.startsWith("/dashboard/transaksi/servis-kendaraan") ||
    pathname.startsWith("/dashboard/transaksi/pembayaran-kendaraan") ||
    pathname.startsWith("/dashboard/transaksi/penjualan-kendaraan") ||
    pathname.startsWith("/dashboard/laporan/tagihan-sewa") ||
    pathname.startsWith("/dashboard/laporan/pendapatan-aset") ||
    pathname.startsWith("/cetak-laporan-aset") ||
    pathname.startsWith("/cetak-laporan-kendaraan") ||
    pathname.startsWith("/cetak-barcode")
  ) {
    return "aset"
  }

  return null
}

export function readStoredDashboardHomePath(): string | null {
  if (typeof window === "undefined") return null

  const value = window.localStorage.getItem(DASHBOARD_HOME_STORAGE_KEY)?.trim()
  return value ? value : null
}

export function writeStoredDashboardHomePath(path: string | null | undefined): void {
  if (typeof window === "undefined") return

  const normalizedPath = path?.trim()
  if (!normalizedPath) {
    window.localStorage.removeItem(DASHBOARD_HOME_STORAGE_KEY)
    return
  }

  window.localStorage.setItem(DASHBOARD_HOME_STORAGE_KEY, normalizedPath)
}

export function clearStoredModuleNavigation(): void {
  if (typeof window === "undefined") return

  window.localStorage.removeItem(ACTIVE_MODULE_STORAGE_KEY)
  window.localStorage.removeItem(DASHBOARD_HOME_STORAGE_KEY)
}
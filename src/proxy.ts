import { NextRequest, NextResponse } from "next/server"

// Routes yang tidak memerlukan autentikasi
const PUBLIC_PATHS = ["/login", "/api/auth/login"]

// CORS headers untuk endpoint mobile
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS, PATCH",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
  "Access-Control-Max-Age": "86400",
}

// ─────────────────────────────────────────────────────────────────
//  Proteksi modul berdasarkan env NEXT_PUBLIC_MODULE_*
//  Modul nonaktif (nilai "false") → redirect ke /select-module
// ─────────────────────────────────────────────────────────────────
type ModuleRule = {
  envKey: string
  modulName: string
  test: (pathname: string) => boolean
}

const MODULE_RULES: ModuleRule[] = [
  {
    envKey: "NEXT_PUBLIC_MODULE_ASET",
    modulName: "aset",
    test: (p) =>
      p.startsWith("/dashboard/transaksi/aset") ||
      p.startsWith("/dashboard/transaksi/mutasi-aset") ||
      p.startsWith("/dashboard/transaksi/disposal") ||
      p.startsWith("/dashboard/transaksi/service-ac") ||
      p.startsWith("/dashboard/transaksi/kendaraan") ||
      p.startsWith("/dashboard/transaksi/kontrak") ||
      p.startsWith("/dashboard/transaksi/mutasi-kendaraan") ||
      p.startsWith("/dashboard/transaksi/servis-kendaraan") ||
      p.startsWith("/dashboard/transaksi/pembayaran-kendaraan") ||
      p.startsWith("/dashboard/transaksi/penjualan-kendaraan") ||
      p.startsWith("/dashboard/laporan/tagihan-sewa") ||
      p.startsWith("/dashboard/laporan/pendapatan-aset") ||
      p.startsWith("/cetak-laporan-aset") ||
      p.startsWith("/cetak-laporan-kendaraan") ||
      p.startsWith("/cetak-barcode"),
  },
  {
    // Kinerja diperiksa SEBELUM SDM agar pengecualian SDM tidak perlu
    // menghapus path kinerja secara manual
    envKey: "NEXT_PUBLIC_MODULE_KINERJA",
    modulName: "kinerja",
    test: (p) =>
      p.startsWith("/dashboard/sdm/penilaian-kinerja") ||
      p.startsWith("/dashboard/sdm/komponen-penilaian"),
  },
  {
    envKey: "NEXT_PUBLIC_MODULE_SDM",
    modulName: "sdm",
    test: (p) => {
      // Jangan blokir path kinerja — sudah dihandle rule di atas
      if (
        p.startsWith("/dashboard/sdm/penilaian-kinerja") ||
        p.startsWith("/dashboard/sdm/komponen-penilaian")
      ) return false
      return (
        p === "/dashboard/sdm" ||
        p.startsWith("/dashboard/sdm/") ||
        p.startsWith("/dashboard/payroll") ||
        p.startsWith("/dashboard/master-data") ||
        p.startsWith("/dashboard/transaksi/mutasi-karyawan") ||
        p.startsWith("/dashboard/transaksi/pensiun-karyawan") ||
        p.startsWith("/dashboard/laporan/rekap-karyawan")
      )
    },
  },
  {
    envKey: "NEXT_PUBLIC_MODULE_KEUANGAN",
    modulName: "keuangan",
    test: (p) =>
      p === "/dashboard/keuangan" ||
      p.startsWith("/dashboard/keuangan/"),
  },
]

function checkModuleAccess(pathname: string, req: NextRequest): NextResponse | null {
  for (const rule of MODULE_RULES) {
    if (process.env[rule.envKey] === "false" && rule.test(pathname)) {
      const url = new URL("/select-module", req.url)
      url.searchParams.set("blocked", rule.modulName)
      return NextResponse.redirect(url)
    }
  }
  return null
}

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl

  // ── CORS untuk semua endpoint /api/mobile/* ────────────────────────────
  if (pathname.startsWith("/api/mobile")) {
    // Handle preflight OPTIONS request
    if (req.method === "OPTIONS") {
      return new NextResponse(null, { status: 200, headers: CORS_HEADERS })
    }
    // Tambah CORS headers ke response normal (lanjut ke route handler)
    const response = NextResponse.next()
    Object.entries(CORS_HEADERS).forEach(([k, v]) => response.headers.set(k, v))
    return response
  }

  // ── Auth guard untuk halaman web ──────────────────────────────────────
  // Skip public paths, static files, dan API lain
  if (
    PUBLIC_PATHS.some(p => pathname.startsWith(p)) ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/info-asset") ||
    pathname.startsWith("/info-karyawan") ||
    pathname.includes(".")
  ) {
    return NextResponse.next()
  }

  // Cek session cookie
  const sessionCookie = req.cookies.get("pedami_session")

  if (!sessionCookie?.value) {
    // Redirect ke login jika belum login
    if (pathname.startsWith("/dashboard") || pathname === "/" || pathname === "/select-module") {
      return NextResponse.redirect(new URL("/login", req.url))
    }
  }

  // Jika sudah login dan ke halaman /login → redirect ke select-module
  if (sessionCookie?.value && pathname === "/login") {
    return NextResponse.redirect(new URL("/select-module", req.url))
  }

  // ── Proteksi modul nonaktif ────────────────────────────────────────────
  if (sessionCookie?.value) {
    const moduleBlock = checkModuleAccess(pathname, req)
    if (moduleBlock) return moduleBlock
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
}

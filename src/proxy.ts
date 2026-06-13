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
    pathname.startsWith("/cetak-barcode") ||
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

  return NextResponse.next()
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
}

import { NextRequest, NextResponse } from "next/server"

// Routes yang tidak memerlukan autentikasi
const PUBLIC_PATHS = ["/login", "/api/auth/login", "/api/debug"]

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

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
    if (pathname.startsWith("/dashboard") || pathname === "/") {
      return NextResponse.redirect(new URL("/login", req.url))
    }
  }

  // Jika sudah login dan ke halaman /login → redirect ke dashboard
  if (sessionCookie?.value && pathname === "/login") {
    return NextResponse.redirect(new URL("/dashboard", req.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
}

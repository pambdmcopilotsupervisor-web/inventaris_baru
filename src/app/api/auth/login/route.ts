import { NextRequest, NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { prisma, serialize } from "@/lib/prisma"
import { getSession } from "@/lib/session"
import { getDefaultModule, getDefaultModuleRedirectPath } from "@/lib/modules"
import { withRequiredRoleMenuHrefs } from "@/lib/menu-access"

// Simple in-memory rate limiter (per-IP, max 10 attempt/menit)
const loginAttempts = new Map<string, { count: number; resetAt: number }>()

function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const entry = loginAttempts.get(ip)
  if (!entry || now > entry.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + 60_000 })
    return true
  }
  if (entry.count >= 10) return false
  entry.count++
  return true
}

export async function POST(req: NextRequest) {
  try {
    // Rate limiting per IP
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? req.headers.get("x-real-ip") ?? "unknown"
    if (!checkRateLimit(ip)) {
      return NextResponse.json({ error: "Terlalu banyak percobaan login. Coba lagi dalam 1 menit." }, { status: 429 })
    }

    const body = await req.json()
    // Tidak lowercase email — biarkan MySQL handle case-insensitive comparison
    const email    = typeof body.email    === "string" ? body.email.trim()    : ""
    const password = typeof body.password === "string" ? body.password : ""

    if (!email || !password) {
      return NextResponse.json({ error: "Email dan password wajib diisi" }, { status: 400 })
    }

    // Validasi format email sederhana (case tidak diubah)
    if (!email.includes("@")) {
      return NextResponse.json({ error: "Format email tidak valid" }, { status: 400 })
    }

    // Cari user — coba ambil password_baru, jika kolom belum ada (migration belum jalan) fallback
    let user: { id: bigint; name: string; email: string | null; password: string; password_baru?: string | null; role: string | null; karyawan_id: number | null } | null = null
    try {
      const usersFound = await prisma.$queryRaw<{
        id: bigint; name: string; email: string | null;
        password: string; password_baru: string | null;
        role: string | null; karyawan_id: number | null
      }[]>`
        SELECT id, name, email, password, password_baru, role, karyawan_id
        FROM users WHERE LOWER(email) = LOWER(${email}) LIMIT 1
      `
      user = usersFound[0] ?? null
    } catch {
      // Fallback: kolom password_baru belum ada (migration belum dijalankan)
      const usersFound = await prisma.$queryRaw<{
        id: bigint; name: string; email: string | null;
        password: string; role: string | null; karyawan_id: number | null
      }[]>`
        SELECT id, name, email, password, role, karyawan_id
        FROM users WHERE LOWER(email) = LOWER(${email}) LIMIT 1
      `
      user = usersFound[0] ? { ...usersFound[0], password_baru: null } : null
    }
    if (!user) {
      // Timing-safe: tetap jalankan bcrypt untuk mencegah timing attack
      await bcrypt.compare(password, "$2a$12$fakehashfakehashfakehashfakehashfakehashfakehashfakeh")
      return NextResponse.json({ error: "Email atau password salah" }, { status: 401 })
    }

    // Verifikasi password:
    // 1. Coba password_baru (khusus inventaris_baru) — jika tidak null
    // 2. Fallback ke password lama (dari pedami-inventaris)
    const hashToCheck = user.password_baru ?? user.password
    const valid = await bcrypt.compare(password, hashToCheck)
    if (!valid) {
      return NextResponse.json({ error: "Email atau password salah" }, { status: 401 })
    }

    // Ambil data karyawan terkait untuk jabatan
    let jabatan: string | null = null
    let nama_karyawan: string | null = null
    let divisi_id: number | null = null
    let nama_divisi: string | null = null
    if (user.karyawan_id) {
      const karyawan = await prisma.karyawans.findUnique({
        where: { id: BigInt(user.karyawan_id) },
        select: { jabatan: true, nama_karyawan: true, divisi_id: true },
      })
      jabatan = karyawan?.jabatan ?? null
      nama_karyawan = karyawan?.nama_karyawan ?? null
      divisi_id = karyawan?.divisi_id ?? null
      if (divisi_id) {
        const divisi = await prisma.divisis.findUnique({ where: { id: BigInt(divisi_id) }, select: { nama_divisi: true } })
        nama_divisi = divisi?.nama_divisi ?? null
      }
    }

    // Simpan ke session
    const session = await getSession()

    // Load menu permissions (null = tampilkan semua, array = filter)
    // Wrapped in try-catch: jika tabel belum ada (migration belum jalan), login tetap berhasil
    let allowed_menus: string[] | null = null
    if (user.role !== "admin") {
      try {
        const perms = await prisma.user_menu_permissions.findMany({
          where: { user_id: user.id },
          select: { menu_href: true },
        })
        if (perms.length > 0) {
          allowed_menus = perms.map((p) => p.menu_href)
        }
      } catch {
        // Tabel belum ada (migration belum dijalankan) — abaikan, tampilkan semua menu
      }
    }
    allowed_menus = withRequiredRoleMenuHrefs(user.role, allowed_menus)

    session.user = {
      id:           Number(user.id),
      name:         user.name,
      email:        user.email ?? "",
      role:         user.role,
      karyawan_id:  user.karyawan_id,
      jabatan,
      nama_karyawan,
      divisi_id,
      nama_divisi,
      allowed_menus,
    }
    await session.save()

    const defaultModule = getDefaultModule()
    const redirectTo = getDefaultModuleRedirectPath() ?? "/select-module"

    return NextResponse.json(serialize({
      id: user.id, name: user.name, email: user.email,
      role: user.role, karyawan_id: user.karyawan_id, jabatan, nama_karyawan, divisi_id, nama_divisi,
      defaultModule,
      redirectTo,
    }))
  } catch (err) {
    // Jangan expose detail error ke client
    console.error("Login error:", err)
    return NextResponse.json({ error: "Terjadi kesalahan server" }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { prisma, serialize } from "@/lib/prisma"
import { getSession } from "@/lib/session"

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
    const email    = typeof body.email    === "string" ? body.email.trim().toLowerCase()  : ""
    const password = typeof body.password === "string" ? body.password : ""

    if (!email || !password) {
      return NextResponse.json({ error: "Email dan password wajib diisi" }, { status: 400 })
    }

    // Validasi format email sederhana
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Format email tidak valid" }, { status: 400 })
    }

    // Cari user di database
    const user = await prisma.users.findUnique({ where: { email } })
    if (!user) {
      // Timing-safe: tetap jalankan bcrypt untuk mencegah timing attack
      await bcrypt.compare(password, "$2a$12$fakehashfakehashfakehashfakehashfakehashfakehashfakeh")
      return NextResponse.json({ error: "Email atau password salah" }, { status: 401 })
    }

    // Verifikasi password (bcrypt — kompatibel dengan Laravel)
    const valid = await bcrypt.compare(password, user.password)
    if (!valid) {
      return NextResponse.json({ error: "Email atau password salah" }, { status: 401 })
    }

    // Ambil data karyawan terkait untuk jabatan
    let jabatan: string | null = null
    let nama_karyawan: string | null = null
    if (user.karyawan_id) {
      const karyawan = await prisma.karyawans.findUnique({
        where: { id: BigInt(user.karyawan_id) },
        select: { jabatan: true, nama_karyawan: true },
      })
      jabatan = karyawan?.jabatan ?? null
      nama_karyawan = karyawan?.nama_karyawan ?? null
    }

    // Simpan ke session
    const session = await getSession()
    session.user = {
      id:           Number(user.id),
      name:         user.name,
      email:        user.email ?? "",
      role:         user.role,
      karyawan_id:  user.karyawan_id,
      jabatan,
      nama_karyawan,
    }
    await session.save()

    return NextResponse.json(serialize({
      id: user.id, name: user.name, email: user.email,
      role: user.role, karyawan_id: user.karyawan_id, jabatan, nama_karyawan,
    }))
  } catch (err) {
    // Jangan expose detail error ke client
    console.error("Login error:", err)
    return NextResponse.json({ error: "Terjadi kesalahan server" }, { status: 500 })
  }
}

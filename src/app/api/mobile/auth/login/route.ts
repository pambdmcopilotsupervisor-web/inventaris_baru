import { NextRequest, NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { prisma } from "@/lib/prisma"
import { createMobileSession } from "@/lib/mobile-auth"

// POST /api/mobile/auth/login
// Body: { email, password, device_info? }
// Response: { token, user, expires_at }

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { email, password, device_info } = body

    if (!email?.trim() || !password) {
      return NextResponse.json({ error: "Email dan password wajib diisi" }, { status: 400 })
    }

    // Cari user
    const users = await prisma.$queryRaw<{
      id: bigint; name: string; email: string | null;
      password: string; password_baru: string | null;
      role: string | null; karyawan_id: number | null
    }[]>`
      SELECT id, name, email, password, password_baru, role, karyawan_id
      FROM users WHERE LOWER(email) = LOWER(${email.trim()}) LIMIT 1
    `
    const user = users[0] ?? null

    if (!user) {
      await bcrypt.compare(password, "$2a$12$fakehashfakehashfakehashfakehashfakehashfakehashfakeh")
      return NextResponse.json({ error: "Email atau password salah" }, { status: 401 })
    }

    // Verifikasi password
    const hashToCheck = user.password_baru ?? user.password
    const valid = await bcrypt.compare(password, hashToCheck)
    if (!valid) {
      return NextResponse.json({ error: "Email atau password salah" }, { status: 401 })
    }

    // Cek karyawan_id — mobile hanya untuk pegawai yang linked ke karyawan
    if (!user.karyawan_id) {
      return NextResponse.json({ error: "Akun ini belum terhubung ke data karyawan. Hubungi Admin." }, { status: 403 })
    }

    // Ambil info karyawan
    const karyawan = await prisma.karyawans.findUnique({
      where: { id: BigInt(user.karyawan_id) },
      select: { nama_karyawan: true, jabatan: true, divisi_id: true, status_karyawan: true, foto: true, nik: true },
    })

    if (karyawan?.status_karyawan === "Pensiun" || karyawan?.status_karyawan === "Nonaktif") {
      return NextResponse.json({ error: `Karyawan sudah ${karyawan.status_karyawan}. Tidak dapat login.` }, { status: 403 })
    }

    // Buat mobile session
    const rawToken = await createMobileSession(user.id, device_info ?? null)
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)

    return NextResponse.json({
      token:      rawToken,
      expires_at: expiresAt.toISOString(),
      user: {
        id:           Number(user.id),
        name:         user.name,
        email:        user.email,
        role:         user.role,
        karyawan_id:  user.karyawan_id,
        nik:          karyawan?.nik ?? null,
        nama_karyawan: karyawan?.nama_karyawan ?? null,
        jabatan:      karyawan?.jabatan ?? null,
        foto:         karyawan?.foto ?? null,
      },
    })
  } catch (err) {
    console.error("[mobile login]", err)
    return NextResponse.json({ error: "Login gagal" }, { status: 500 })
  }
}

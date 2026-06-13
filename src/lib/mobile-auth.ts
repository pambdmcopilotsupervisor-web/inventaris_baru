/**
 * lib/mobile-auth.ts
 *
 * Autentikasi berbasis token untuk aplikasi mobile.
 * Mobile app mengirim: Authorization: Bearer <token>
 */
import { prisma } from "@/lib/prisma"
import { NextRequest, NextResponse } from "next/server"
import { randomBytes, createHash } from "crypto"

/**
 * Dapatkan tanggal hari ini dalam format YYYY-MM-DD di timezone WIB (Asia/Jakarta UTC+7).
 * Aman digunakan di lingkungan server UTC maupun UTC+7.
 * Menghindari bug timezone: `now.getDate()` bergantung pada server TZ,
 * sedangkan user di WIB (UTC+7) sebelum jam 07:00 pagi masih di hari sebelumnya di UTC.
 */
export function getTodayWIB(): { tglStr: string; tglDate: Date } {
  const wibDateStr = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Jakarta",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date()) // format: "2026-06-13"
  return {
    tglStr: wibDateStr,
    tglDate: new Date(wibDateStr), // UTC midnight — benar untuk query Prisma ↔ MySQL DATE
  }
}

export interface MobileUser {
  id: number           // users.id
  name: string
  email: string | null
  role: string | null
  karyawan_id: number | null
  jabatan: string | null
  nama_karyawan: string | null
}

/** Durasi token mobile: 30 hari */
const TOKEN_EXPIRES_DAYS = 30

/** Generate token acak yang aman */
export function generateMobileToken(): string {
  return randomBytes(48).toString("hex")
}

/** Hash token sebelum disimpan ke DB */
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}

/**
 * Buat session mobile untuk user yang berhasil login.
 * Kembalikan raw token (yang dikirim ke mobile app).
 */
export async function createMobileSession(
  userId: bigint,
  deviceInfo?: string | null,
): Promise<string> {
  const rawToken = generateMobileToken()
  const hashedToken = hashToken(rawToken)
  const now = new Date()
  const expiresAt = new Date(now.getTime() + TOKEN_EXPIRES_DAYS * 24 * 60 * 60 * 1000)

  // Hapus session lama dari device yang sama jika ada
  if (deviceInfo) {
    await prisma.mobile_sessions.deleteMany({
      where: { user_id: userId, device_info: deviceInfo },
    })
  }

  await prisma.mobile_sessions.create({
    data: {
      user_id:     userId,
      token:       hashedToken,
      device_info: deviceInfo ?? null,
      expires_at:  expiresAt,
      created_at:  now,
      updated_at:  now,
    },
  })

  return rawToken
}

/**
 * Middleware helper: require valid mobile token.
 * Gunakan di API route: const auth = await requireMobileAuth(req)
 */
export async function requireMobileAuth(req: NextRequest): Promise<
  { user: MobileUser } | { error: NextResponse }
> {
  try {
    const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization")
    if (!authHeader?.startsWith("Bearer ")) {
      return { error: NextResponse.json({ error: "Token tidak ditemukan. Sertakan header: Authorization: Bearer <token>" }, { status: 401 }) }
    }

    const rawToken = authHeader.slice(7).trim()
    if (!rawToken) {
      return { error: NextResponse.json({ error: "Token kosong" }, { status: 401 }) }
    }

    const hashedToken = hashToken(rawToken)
    const session = await prisma.mobile_sessions.findFirst({
      where: { token: hashedToken },
    })

    if (!session) {
      return { error: NextResponse.json({ error: "Token tidak valid atau sudah kadaluarsa" }, { status: 401 }) }
    }

    // Cek expiry
    if (session.expires_at && session.expires_at < new Date()) {
      await prisma.mobile_sessions.delete({ where: { id: session.id } })
      return { error: NextResponse.json({ error: "Token sudah kadaluarsa. Silakan login kembali." }, { status: 401 }) }
    }

    // Update last_used_at — bungkus dalam try-catch agar race condition tidak throw 401
    try {
      await prisma.mobile_sessions.update({
        where: { id: session.id },
        data:  { last_used_at: new Date(), updated_at: new Date() },
      })
    } catch {
      // Abaikan error update last_used_at (race condition pada concurrent requests)
    }

    // Ambil data user
    const userRecord = await prisma.users.findUnique({
      where: { id: session.user_id },
      select: { id: true, name: true, email: true, role: true, karyawan_id: true },
    })
    if (!userRecord) {
      return { error: NextResponse.json({ error: "User tidak ditemukan" }, { status: 401 }) }
    }

    // Ambil data karyawan jika ada
    let jabatan: string | null = null
    let nama_karyawan: string | null = null
    if (userRecord.karyawan_id) {
      const karyawan = await prisma.karyawans.findUnique({
        where: { id: BigInt(userRecord.karyawan_id) },
        select: { jabatan: true, nama_karyawan: true },
      })
      jabatan = karyawan?.jabatan ?? null
      nama_karyawan = karyawan?.nama_karyawan ?? null
    }

    return {
      user: {
        id:            Number(userRecord.id),
        name:          userRecord.name,
        email:         userRecord.email,
        role:          userRecord.role,
        karyawan_id:   userRecord.karyawan_id,
        jabatan,
        nama_karyawan,
      },
    }
  } catch {
    return { error: NextResponse.json({ error: "Autentikasi gagal" }, { status: 401 }) }
  }
}

/**
 * Hitung jarak antara dua koordinat menggunakan formula Haversine.
 * Return: jarak dalam meter.
 */
export function hitungJarakMeter(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const R = 6371000 // radius bumi dalam meter
  const φ1 = (lat1 * Math.PI) / 180
  const φ2 = (lat2 * Math.PI) / 180
  const Δφ = ((lat2 - lat1) * Math.PI) / 180
  const Δλ = ((lng2 - lng1) * Math.PI) / 180

  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

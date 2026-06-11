import { getIronSession, IronSession, IronSessionData } from "iron-session"
import { cookies } from "next/headers"

export interface SessionUser {
  id: number
  name: string
  email: string
  role: string | null
  karyawan_id: number | null
  jabatan: string | null  // jabatan dari tabel karyawans
  nama_karyawan: string | null
}

declare module "iron-session" {
  interface IronSessionData {
    user?: SessionUser
  }
}

// Validasi SESSION_SECRET saat diakses pertama kali (runtime saja, bukan build time)
function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET
  if (!secret) throw new Error("SESSION_SECRET environment variable wajib diisi!")
  if (secret.length < 32) throw new Error("SESSION_SECRET harus minimal 32 karakter!")
  return secret
}

const sessionOptions = {
  cookieName: "pedami_session",
  get password() { return getSessionSecret() },
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    sameSite: "strict" as const,
    maxAge: 60 * 60 * 24 * 7, // 7 hari
  },
}

export async function getSession(): Promise<IronSession<IronSessionData>> {
  const cookieStore = await cookies()
  return getIronSession<IronSessionData>(cookieStore, sessionOptions)
}

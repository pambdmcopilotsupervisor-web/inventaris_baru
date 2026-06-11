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

const sessionOptions = {
  cookieName: "pedami_session",
  password: process.env.SESSION_SECRET!,
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    sameSite: "strict" as const,
    maxAge: 60 * 60 * 24 * 7, // 7 hari (dikurangi dari 30)
  },
}

export async function getSession(): Promise<IronSession<IronSessionData>> {
  const cookieStore = await cookies()
  return getIronSession<IronSessionData>(cookieStore, sessionOptions)
}

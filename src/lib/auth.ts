import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/session"

export type AppRole = "admin" | "hrd" | "atasan" | "user" | "operator" | "keuangan"

/**
 * Validasi session dari API route.
 * Kembalikan user jika valid, atau NextResponse 401 jika tidak.
 */
export async function requireSession(req: NextRequest): Promise<
  { user: NonNullable<Awaited<ReturnType<typeof getSession>>["user"]> } |
  { error: NextResponse }
> {
  try {
    const session = await getSession()
    if (!session.user) {
      return { error: NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 }) }
    }
    return { user: session.user }
  } catch {
    return { error: NextResponse.json({ error: "Session tidak valid" }, { status: 401 }) }
  }
}

/**
 * Validasi session + role.
 * allowedRoles: ["admin","hrd"] → user harus memiliki salah satu role tsb.
 */
export async function requireRole(
  req: NextRequest,
  allowedRoles: AppRole[],
): Promise<
  { user: NonNullable<Awaited<ReturnType<typeof getSession>>["user"]> } |
  { error: NextResponse }
> {
  const result = await requireSession(req)
  if ("error" in result) return result
  const role = (result.user.role ?? "user") as AppRole
  if (!allowedRoles.includes(role)) {
    return { error: NextResponse.json({ error: "Akses ditolak" }, { status: 403 }) }
  }
  return result
}

/** Ambil IP dari request header */
export function getClientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  )
}

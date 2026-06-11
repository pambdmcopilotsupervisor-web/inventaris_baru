import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/session"

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

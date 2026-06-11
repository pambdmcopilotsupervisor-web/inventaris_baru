import { NextResponse } from "next/server"
import { getSession } from "@/lib/session"

export async function GET() {
  try {
    const session = await getSession()
    if (!session.user) {
      return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 })
    }
    return NextResponse.json(session.user)
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}

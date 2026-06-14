import { NextRequest, NextResponse } from "next/server"
import { prisma, serialize } from "@/lib/prisma"
import { requireRole } from "@/lib/auth"

// GET /api/audit-log
// Query params: model_type, action, user_name, date_from, date_to, page, limit

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, ["admin", "hrd"])
  if ("error" in auth) return auth.error

  try {
    const { searchParams } = req.nextUrl
    const model_type = searchParams.get("model_type") ?? undefined
    const action      = searchParams.get("action")     ?? undefined
    const user_name   = searchParams.get("user_name")  ?? undefined
    const date_from   = searchParams.get("date_from")  ?? undefined
    const date_to     = searchParams.get("date_to")    ?? undefined
    const page        = Math.max(1, parseInt(searchParams.get("page") ?? "1"))
    const limit       = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "50")))
    const skip        = (page - 1) * limit

    const where: Record<string, unknown> = {}
    if (model_type)         where.model_type = model_type
    if (action)             where.action     = action
    if (user_name)          where.user_name  = { contains: user_name }
    if (date_from || date_to) {
      where.created_at = {
        ...(date_from ? { gte: new Date(date_from + "T00:00:00") } : {}),
        ...(date_to   ? { lte: new Date(date_to   + "T23:59:59") } : {}),
      }
    }

    const [total, rows] = await Promise.all([
      prisma.audit_logs.count({ where }),
      prisma.audit_logs.findMany({
        where,
        orderBy: { created_at: "desc" },
        skip,
        take: limit,
      }),
    ])

    return NextResponse.json({
      data:       serialize(rows),
      total,
      page,
      limit,
      total_pages: Math.ceil(total / limit),
    })
  } catch (err) {
    console.error("[audit-log GET]", err)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}

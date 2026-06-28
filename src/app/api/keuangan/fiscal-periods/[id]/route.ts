import { NextRequest, NextResponse } from "next/server"
import { requireRole, type AppRole } from "@/lib/auth"
import { prisma, serialize } from "@/lib/prisma"

export const runtime = "nodejs"

const ALLOWED: AppRole[] = ["admin", "keuangan"]

type Ctx = { params: Promise<{ id: string }> }

// PATCH /api/keuangan/fiscal-periods/[id] — ubah status
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const auth = await requireRole(req, ALLOWED)
  if ("error" in auth) return auth.error

  const { id } = await ctx.params
  const body = await req.json()
  const { status } = body

  if (!["BUKA", "TUTUP", "KUNCI"].includes(status)) {
    return NextResponse.json({ error: "Status tidak valid: BUKA | TUTUP | KUNCI" }, { status: 400 })
  }

  const existing = await prisma.keu_periode_fiskal.findUnique({ where: { id: BigInt(id) } })
  if (!existing) return NextResponse.json({ error: "Periode tidak ditemukan" }, { status: 404 })

  const order: Record<string, number> = { BUKA: 0, TUTUP: 1, KUNCI: 2 }
  if (order[status] < order[existing.status]) {
    return NextResponse.json({ error: `Tidak dapat mengubah status dari ${existing.status} ke ${status}` }, { status: 400 })
  }

  const row = await prisma.keu_periode_fiskal.update({
    where: { id: BigInt(id) },
    data: {
      status,
      ...(status !== "BUKA" ? {
        ditutup_oleh: BigInt(auth.user.id),
        ditutup_pada: new Date(),
      } : {}),
      updated_at: new Date(),
    },
  })
  return NextResponse.json(serialize(row))
}

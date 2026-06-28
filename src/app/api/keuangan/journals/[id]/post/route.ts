import { NextRequest, NextResponse } from "next/server"
import { requireRole, type AppRole } from "@/lib/auth"
import { prisma, serialize } from "@/lib/prisma"
import { validatePostedJurnal } from "@/lib/keuangan/jurnal"
import { writeAuditLog } from "@/lib/audit"

export const runtime = "nodejs"

const ALLOWED: AppRole[] = ["admin", "keuangan"]
type Ctx = { params: Promise<{ id: string }> }

// POST /api/keuangan/journals/[id]/post — posting jurnal (DRAFT → POSTED)
export async function POST(req: NextRequest, ctx: Ctx) {
  const auth = await requireRole(req, ALLOWED)
  if ("error" in auth) return auth.error

  const { id } = await ctx.params
  const existing = await prisma.keu_jurnal.findUnique({ where: { id: BigInt(id) } })
  if (!existing) return NextResponse.json({ error: "Jurnal tidak ditemukan" }, { status: 404 })
  if (existing.status === "POSTED") return NextResponse.json({ error: "Jurnal sudah diposting" }, { status: 422 })
  try {
    await validatePostedJurnal(existing.id)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Jurnal tidak valid" }, { status: 422 })
  }

  const row = await prisma.keu_jurnal.update({
    where: { id: BigInt(id) },
    data: {
      status: "POSTED",
      diposting_oleh: BigInt(auth.user.id),
      diposting_pada: new Date(),
      updated_at: new Date(),
    },
    select: { id: true, nomor_jurnal: true, status: true, diposting_pada: true },
  })
  await writeAuditLog({ user: auth.user, action: "UPDATE", modelType: "keu_jurnal", modelId: BigInt(id), dataBaru: { status: "POSTED" } })
  return NextResponse.json(serialize(row))
}

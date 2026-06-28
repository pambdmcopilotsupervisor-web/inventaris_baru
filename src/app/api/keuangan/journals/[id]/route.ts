import { NextRequest, NextResponse } from "next/server"
import { requireRole, type AppRole } from "@/lib/auth"
import { prisma, serialize } from "@/lib/prisma"
import { validateJurnalInput } from "@/lib/keuangan/jurnal"
import { writeAuditLog } from "@/lib/audit"

export const runtime = "nodejs"

const ALLOWED: AppRole[] = ["admin", "keuangan"]
type Ctx = { params: Promise<{ id: string }> }

// GET /api/keuangan/journals/[id]
export async function GET(req: NextRequest, ctx: Ctx) {
  const auth = await requireRole(req, ALLOWED)
  if ("error" in auth) return auth.error

  const { id } = await ctx.params
  const row = await prisma.keu_jurnal.findUnique({
    where: { id: BigInt(id) },
    include: {
      periode: { select: { nama: true, status: true } },
      details: {
        orderBy: { urutan: "asc" },
        include: { akun: { select: { kode: true, nama: true, jenis: true } } },
      },
    },
  })
  if (!row) return NextResponse.json({ error: "Jurnal tidak ditemukan" }, { status: 404 })
  return NextResponse.json(serialize(row))
}

// PATCH /api/keuangan/journals/[id]
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const auth = await requireRole(req, ALLOWED)
  if ("error" in auth) return auth.error

  const { id } = await ctx.params
  const body = await req.json()

  const existing = await prisma.keu_jurnal.findUnique({
    where: { id: BigInt(id) },
    include: { details: { orderBy: { urutan: "asc" } } },
  })
  if (!existing) return NextResponse.json({ error: "Jurnal tidak ditemukan" }, { status: 404 })
  if (existing.status === "POSTED") return NextResponse.json({ error: "Jurnal sudah diposting" }, { status: 422 })

  const { tanggal, keterangan, details } = body
  let validated
  try {
    validated = await validateJurnalInput({
      tanggal: tanggal ?? existing.tanggal,
      periode_id: existing.periode_id,
      jenis: existing.jenis,
      details: Array.isArray(details) ? details : existing.details.map((d) => ({
        akun_id: Number(d.akun_id),
        keterangan: d.keterangan ?? undefined,
        debit: Number(d.debit),
        kredit: Number(d.kredit),
        urutan: d.urutan,
      })),
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Jurnal tidak valid" }, { status: 422 })
  }

  const row = await prisma.$transaction(async (tx) => {
    if (Array.isArray(details)) {
      await tx.keu_jurnal_detail.deleteMany({ where: { jurnal_id: BigInt(id) } })
      await tx.keu_jurnal_detail.createMany({
        data: validated.details.map((d) => ({
          jurnal_id: BigInt(id),
          ...d,
        })),
      })
    }
    return tx.keu_jurnal.update({
      where: { id: BigInt(id) },
      data: {
        ...(tanggal ? { tanggal: validated.tanggal } : {}),
        ...(keterangan ? { keterangan } : {}),
        total_debit: validated.totalDebit,
        total_kredit: validated.totalKredit,
        updated_at: new Date(),
      },
    })
  })
  await writeAuditLog({ user: auth.user, action: "UPDATE", modelType: "keu_jurnal", modelId: BigInt(id), dataBaru: { nomor: row.nomor_jurnal } })
  return NextResponse.json(serialize(row))
}

// DELETE /api/keuangan/journals/[id]
export async function DELETE(req: NextRequest, ctx: Ctx) {
  const auth = await requireRole(req, ALLOWED)
  if ("error" in auth) return auth.error

  const { id } = await ctx.params
  const existing = await prisma.keu_jurnal.findUnique({ where: { id: BigInt(id) }, include: { periode: true } })
  if (!existing) return NextResponse.json({ error: "Jurnal tidak ditemukan" }, { status: 404 })
  if (existing.status === "POSTED") return NextResponse.json({ error: "Jurnal sudah diposting, tidak dapat dihapus" }, { status: 422 })
  if (existing.periode.status !== "BUKA") return NextResponse.json({ error: "Jurnal hanya dapat dihapus saat periode masih buka" }, { status: 422 })

  await prisma.keu_jurnal.delete({ where: { id: BigInt(id) } })
  await writeAuditLog({ user: auth.user, action: "DELETE", modelType: "keu_jurnal", modelId: BigInt(id), dataBaru: { nomor: existing.nomor_jurnal } })
  return NextResponse.json({ ok: true })
}

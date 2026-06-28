import { NextRequest, NextResponse } from "next/server"
import { requireRole, type AppRole } from "@/lib/auth"
import { prisma, serialize } from "@/lib/prisma"

export const runtime = "nodejs"

const ALLOWED: AppRole[] = ["admin", "keuangan"]

// GET /api/keuangan/accounts — daftar semua akun
export async function GET(req: NextRequest) {
  const auth = await requireRole(req, ALLOWED)
  if ("error" in auth) return auth.error

  const { searchParams } = new URL(req.url)
  const jenis = searchParams.get("jenis") ?? undefined
  const is_detail = searchParams.get("is_detail")
  const is_active = searchParams.get("is_active")

  const rows = await prisma.keu_akun.findMany({
    where: {
      ...(jenis ? { jenis } : {}),
      ...(is_detail !== null ? { is_detail: is_detail === "1" || is_detail === "true" } : {}),
      ...(is_active !== null ? { is_active: is_active === "1" || is_active === "true" } : {}),
    },
    orderBy: [{ urutan: "asc" }, { kode: "asc" }],
  })
  return NextResponse.json(serialize(rows))
}

// POST /api/keuangan/accounts — buat akun baru
export async function POST(req: NextRequest) {
  const auth = await requireRole(req, ALLOWED)
  if ("error" in auth) return auth.error

  const body = await req.json()
  const { kode, nama, jenis, kelompok, saldo_normal, level, parent_id, is_detail, is_active, urutan, keterangan } = body

  if (!kode || !nama || !jenis || !saldo_normal || !level) {
    return NextResponse.json({ error: "Field wajib: kode, nama, jenis, saldo_normal, level" }, { status: 400 })
  }

  const row = await prisma.keu_akun.create({
    data: {
      kode: String(kode).trim(),
      nama: String(nama).trim(),
      jenis,
      kelompok: kelompok ?? null,
      saldo_normal,
      level: Number(level),
      parent_id: parent_id ? BigInt(parent_id) : null,
      is_detail: is_detail ?? true,
      is_active: is_active ?? true,
      urutan: urutan ?? 0,
      keterangan: keterangan ?? null,
      created_at: new Date(),
      updated_at: new Date(),
    },
  })
  return NextResponse.json(serialize(row), { status: 201 })
}

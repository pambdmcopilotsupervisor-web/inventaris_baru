"use server"

/**
 * Server Actions — Modul Keuangan: Bagan Akun (Chart of Accounts)
 * Koperasi Pedami — PSAK 27 / ISAK 35
 */

import { revalidatePath } from "next/cache"
import { prisma, serialize } from "@/lib/prisma"
import { getSession, type SessionUser } from "@/lib/session"
import { writeAuditLog } from "@/lib/audit"

const PAGE_PATH = "/dashboard/keuangan/bagan-akun"

export type ActionResult<T> =
  | { success: true; data: T; error: null }
  | { success: false; data: null; error: string }

function ok<T>(data: T): ActionResult<T> {
  return { success: true, data, error: null }
}
function fail(error: string): ActionResult<never> {
  return { success: false, data: null, error }
}

export type AkunRow = {
  id: number
  kode: string
  nama: string
  jenis: "ASET" | "KEWAJIBAN" | "EKUITAS" | "PENDAPATAN" | "BEBAN"
  kelompok: string | null
  saldo_normal: "DEBIT" | "KREDIT"
  level: number
  parent_id: number | null
  is_detail: boolean
  is_active: boolean
  urutan: number
  keterangan: string | null
}

async function requireKeuanganRole(): Promise<{ user: SessionUser } | { error: string }> {
  try {
    const session = await getSession()
    if (!session.user) return { error: "Tidak terautentikasi" }
    const role = (session.user.role ?? "user").toLowerCase()
    if (!["admin", "keuangan"].includes(role)) return { error: "Akses ditolak" }
    return { user: session.user }
  } catch {
    return { error: "Session tidak valid" }
  }
}

export async function getAkun(params?: {
  jenis?: string
  is_detail?: boolean
  is_active?: boolean
}): Promise<ActionResult<AkunRow[]>> {
  try {
    const rows = await prisma.keu_akun.findMany({
      where: {
        ...(params?.jenis ? { jenis: params.jenis } : {}),
        ...(params?.is_detail !== undefined ? { is_detail: params.is_detail } : {}),
        ...(params?.is_active !== undefined ? { is_active: params.is_active } : {}),
      },
      orderBy: [{ urutan: "asc" }, { kode: "asc" }],
    })
    return ok(serialize(rows) as unknown as AkunRow[])
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Gagal memuat data akun")
  }
}

export async function createAkun(payload: {
  kode: string
  nama: string
  jenis: string
  kelompok?: string
  saldo_normal: string
  level: number
  parent_id?: number
  is_detail?: boolean
  is_active?: boolean
  urutan?: number
  keterangan?: string
}): Promise<ActionResult<AkunRow>> {
  const auth = await requireKeuanganRole()
  if ("error" in auth) return fail(auth.error)

  try {
    const row = await prisma.keu_akun.create({
      data: {
        kode: payload.kode.trim(),
        nama: payload.nama.trim(),
        jenis: payload.jenis,
        kelompok: payload.kelompok ?? null,
        saldo_normal: payload.saldo_normal,
        level: payload.level,
        parent_id: payload.parent_id ? BigInt(payload.parent_id) : null,
        is_detail: payload.is_detail ?? true,
        is_active: payload.is_active ?? true,
        urutan: payload.urutan ?? 0,
        keterangan: payload.keterangan ?? null,
        created_at: new Date(),
        updated_at: new Date(),
      },
    })
    await writeAuditLog({ user: auth.user, action: "CREATE", modelType: "keu_akun", modelId: row.id, dataBaru: { kode: row.kode, nama: row.nama } })
    revalidatePath(PAGE_PATH)
    return ok(serialize(row) as unknown as AkunRow)
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Gagal membuat akun")
  }
}

export async function updateAkun(
  id: number,
  payload: Partial<{
    kode: string
    nama: string
    jenis: string
    kelompok: string | null
    saldo_normal: string
    level: number
    parent_id: number | null
    is_detail: boolean
    is_active: boolean
    urutan: number
    keterangan: string | null
  }>
): Promise<ActionResult<AkunRow>> {
  const auth = await requireKeuanganRole()
  if ("error" in auth) return fail(auth.error)

  try {
    const row = await prisma.keu_akun.update({
      where: { id: BigInt(id) },
      data: {
        ...payload,
        ...(payload.parent_id !== undefined ? { parent_id: payload.parent_id ? BigInt(payload.parent_id) : null } : {}),
        updated_at: new Date(),
      },
    })
    await writeAuditLog({ user: auth.user, action: "UPDATE", modelType: "keu_akun", modelId: BigInt(id), dataBaru: { kode: row.kode } })
    revalidatePath(PAGE_PATH)
    return ok(serialize(row) as unknown as AkunRow)
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Gagal memperbarui akun")
  }
}

export async function toggleAkun(id: number, is_active: boolean): Promise<ActionResult<{ id: number; is_active: boolean }>> {
  const auth = await requireKeuanganRole()
  if ("error" in auth) return fail(auth.error)

  try {
    const row = await prisma.keu_akun.update({
      where: { id: BigInt(id) },
      data: { is_active, updated_at: new Date() },
      select: { id: true, is_active: true, kode: true },
    })
    await writeAuditLog({ user: auth.user, action: "UPDATE", modelType: "keu_akun", modelId: BigInt(id), dataBaru: { is_active } })
    revalidatePath(PAGE_PATH)
    return ok({ id: Number(row.id), is_active: row.is_active })
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Gagal mengubah status akun")
  }
}

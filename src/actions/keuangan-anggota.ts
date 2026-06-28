"use server"

/**
 * Server Actions — Anggota Koperasi.
 */

import { revalidatePath } from "next/cache"
import { prisma, serialize } from "@/lib/prisma"
import { getSession, type SessionUser } from "@/lib/session"
import { writeAuditLog } from "@/lib/audit"

const PAGE_PATH = "/dashboard/keuangan/anggota"

export type ActionResult<T> =
  | { success: true; data: T; error: null }
  | { success: false; data: null; error: string }

function ok<T>(data: T): ActionResult<T> { return { success: true, data, error: null } }
function fail(error: string): ActionResult<never> { return { success: false, data: null, error } }

export type AnggotaRow = {
  id: number
  no_anggota: string
  nama: string
  karyawan_id: number | null
  no_ktp: string | null
  no_hp: string | null
  alamat: string | null
  tgl_gabung: string
  tgl_keluar: string | null
  status: "AKTIF" | "NONAKTIF" | "KELUAR"
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

export async function getAnggota(params?: { status?: string; search?: string }): Promise<ActionResult<AnggotaRow[]>> {
  try {
    const rows = await prisma.keu_anggota.findMany({
      where: {
        ...(params?.status ? { status: params.status } : {}),
        ...(params?.search ? { OR: [{ nama: { contains: params.search } }, { no_anggota: { contains: params.search } }] } : {}),
      },
      orderBy: [{ status: "asc" }, { no_anggota: "asc" }],
    })
    return ok(serialize(rows) as unknown as AnggotaRow[])
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Gagal memuat anggota")
  }
}

/** Saran nomor anggota berikutnya (format A-0001). */
export async function nextNoAnggota(): Promise<ActionResult<string>> {
  try {
    const last = await prisma.keu_anggota.findFirst({
      where: { no_anggota: { startsWith: "A-" } },
      orderBy: { no_anggota: "desc" },
      select: { no_anggota: true },
    })
    let seq = 1
    if (last) seq = (parseInt(last.no_anggota.replace("A-", ""), 10) || 0) + 1
    return ok(`A-${String(seq).padStart(4, "0")}`)
  } catch {
    return ok("A-0001")
  }
}

export async function createAnggota(payload: {
  no_anggota: string
  nama: string
  karyawan_id?: number | null
  no_ktp?: string
  no_hp?: string
  alamat?: string
  tgl_gabung: string
  status?: string
  keterangan?: string
}): Promise<ActionResult<AnggotaRow>> {
  const auth = await requireKeuanganRole()
  if ("error" in auth) return fail(auth.error)
  try {
    const row = await prisma.keu_anggota.create({
      data: {
        no_anggota: payload.no_anggota.trim(),
        nama: payload.nama.trim(),
        karyawan_id: payload.karyawan_id ? BigInt(payload.karyawan_id) : null,
        no_ktp: payload.no_ktp || null,
        no_hp: payload.no_hp || null,
        alamat: payload.alamat || null,
        tgl_gabung: new Date(payload.tgl_gabung),
        status: payload.status ?? "AKTIF",
        keterangan: payload.keterangan || null,
        created_at: new Date(),
        updated_at: new Date(),
      },
    })
    await writeAuditLog({ user: auth.user, action: "CREATE", modelType: "keu_anggota", modelId: row.id, dataBaru: { no: row.no_anggota, nama: row.nama } })
    revalidatePath(PAGE_PATH)
    return ok(serialize(row) as unknown as AnggotaRow)
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Gagal menambah anggota")
  }
}

export async function updateAnggota(id: number, payload: Partial<{
  no_anggota: string; nama: string; karyawan_id: number | null
  no_ktp: string | null; no_hp: string | null; alamat: string | null
  tgl_gabung: string; tgl_keluar: string | null; status: string; keterangan: string | null
}>): Promise<ActionResult<AnggotaRow>> {
  const auth = await requireKeuanganRole()
  if ("error" in auth) return fail(auth.error)
  try {
    const row = await prisma.keu_anggota.update({
      where: { id: BigInt(id) },
      data: {
        ...(payload.no_anggota !== undefined ? { no_anggota: payload.no_anggota.trim() } : {}),
        ...(payload.nama !== undefined ? { nama: payload.nama.trim() } : {}),
        ...(payload.karyawan_id !== undefined ? { karyawan_id: payload.karyawan_id ? BigInt(payload.karyawan_id) : null } : {}),
        ...(payload.no_ktp !== undefined ? { no_ktp: payload.no_ktp } : {}),
        ...(payload.no_hp !== undefined ? { no_hp: payload.no_hp } : {}),
        ...(payload.alamat !== undefined ? { alamat: payload.alamat } : {}),
        ...(payload.tgl_gabung !== undefined ? { tgl_gabung: new Date(payload.tgl_gabung) } : {}),
        ...(payload.tgl_keluar !== undefined ? { tgl_keluar: payload.tgl_keluar ? new Date(payload.tgl_keluar) : null } : {}),
        ...(payload.status !== undefined ? { status: payload.status } : {}),
        ...(payload.keterangan !== undefined ? { keterangan: payload.keterangan } : {}),
        updated_at: new Date(),
      },
    })
    await writeAuditLog({ user: auth.user, action: "UPDATE", modelType: "keu_anggota", modelId: BigInt(id), dataBaru: { no: row.no_anggota } })
    revalidatePath(PAGE_PATH)
    return ok(serialize(row) as unknown as AnggotaRow)
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Gagal memperbarui anggota")
  }
}

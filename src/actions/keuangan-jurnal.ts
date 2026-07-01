"use server"

/**
 * Server Actions — Modul Keuangan: Jurnal Akuntansi
 * Mendukung: buat jurnal DRAFT, posting, edit (hanya DRAFT), hapus (hanya DRAFT)
 */

import { revalidatePath } from "next/cache"
import { prisma, serialize } from "@/lib/prisma"
import { getSession, type SessionUser } from "@/lib/session"
import { writeAuditLog } from "@/lib/audit"
import { validateJurnalInput, validatePostedJurnal, type JurnalDetailInput } from "@/lib/keuangan/jurnal"

export type { JurnalDetailInput }

const PAGE_PATH = "/dashboard/keuangan/jurnal"

export type ActionResult<T> =
  | { success: true; data: T; error: null }
  | { success: false; data: null; error: string }

function ok<T>(data: T): ActionResult<T> {
  return { success: true, data, error: null }
}
function fail(error: string): ActionResult<never> {
  return { success: false, data: null, error }
}

export type JurnalRow = {
  id: number
  nomor_jurnal: string
  tanggal: string
  keterangan: string
  jenis: string
  status: "DRAFT" | "POSTED"
  periode_id: number
  source_modul: string | null
  source_ref_id: string | null
  total_debit: number
  total_kredit: number
  dibuat_oleh: number
  diposting_oleh: number | null
  diposting_pada: string | null
  details?: JurnalDetailRow[]
}

export type JurnalDetailRow = {
  id: number
  jurnal_id: number
  akun_id: number
  urutan: number
  keterangan: string | null
  debit: number
  kredit: number
  akun?: { kode: string; nama: string; jenis: string }
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

/** Generate nomor jurnal: JU-YYYYMM-NNNN */
async function generateNomorJurnal(tanggal: Date, jenis: string): Promise<string> {
  const prefix = {
    UMUM: "JU",
    PENYESUAIAN: "JP",
    PENUTUP: "JT",
    BALIK: "JB",
    KHUSUS: "JK",
  }[jenis] ?? "JU"

  const ym = `${tanggal.getFullYear()}${String(tanggal.getMonth() + 1).padStart(2, "0")}`

  const last = await prisma.keu_jurnal.findFirst({
    where: { nomor_jurnal: { startsWith: `${prefix}-${ym}-` } },
    orderBy: { nomor_jurnal: "desc" },
    select: { nomor_jurnal: true },
  })

  let seq = 1
  if (last) {
    const parts = last.nomor_jurnal.split("-")
    seq = (parseInt(parts[parts.length - 1], 10) || 0) + 1
  }
  return `${prefix}-${ym}-${String(seq).padStart(4, "0")}`
}

export async function getJurnals(params?: {
  periode_id?: number
  status?: string
  jenis?: string
  page?: number
  limit?: number
}): Promise<ActionResult<{ rows: JurnalRow[]; total: number }>> {
  try {
    const page = params?.page ?? 1
    const limit = params?.limit ?? 30
    const skip = (page - 1) * limit

    const where = {
      ...(params?.periode_id ? { periode_id: BigInt(params.periode_id) } : {}),
      ...(params?.status ? { status: params.status } : {}),
      ...(params?.jenis ? { jenis: params.jenis } : {}),
    }

    const [rows, total] = await Promise.all([
      prisma.keu_jurnal.findMany({
        where,
        orderBy: [{ tanggal: "desc" }, { nomor_jurnal: "desc" }],
        skip,
        take: limit,
      }),
      prisma.keu_jurnal.count({ where }),
    ])

    return ok({ rows: serialize(rows) as unknown as JurnalRow[], total })
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Gagal memuat jurnal")
  }
}

export async function getJurnalById(id: number): Promise<ActionResult<JurnalRow>> {
  try {
    const row = await prisma.keu_jurnal.findUnique({
      where: { id: BigInt(id) },
      include: {
        details: {
          orderBy: { urutan: "asc" },
          include: {
            akun: { select: { kode: true, nama: true, jenis: true } },
          },
        },
      },
    })
    if (!row) return fail("Jurnal tidak ditemukan")
    return ok(serialize(row) as unknown as JurnalRow)
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Gagal memuat jurnal")
  }
}

export async function createJurnal(payload: {
  tanggal: string
  keterangan: string
  jenis?: string
  periode_id: number
  source_modul?: string
  source_ref_id?: string
  details: JurnalDetailInput[]
}): Promise<ActionResult<JurnalRow>> {
  const auth = await requireKeuanganRole()
  if ("error" in auth) return fail(auth.error)

  const jenis = payload.jenis ?? "UMUM"

  try {
    const validated = await validateJurnalInput(payload)
    const nomor_jurnal = await generateNomorJurnal(validated.tanggal, jenis)

    const row = await prisma.keu_jurnal.create({
      data: {
        nomor_jurnal,
        tanggal: validated.tanggal,
        keterangan: payload.keterangan,
        jenis,
        status: "DRAFT",
        periode_id: BigInt(payload.periode_id),
        source_modul: payload.source_modul ?? null,
        source_ref_id: payload.source_ref_id ?? null,
        total_debit: validated.totalDebit,
        total_kredit: validated.totalKredit,
        dibuat_oleh: BigInt(auth.user.id),
        created_at: new Date(),
        updated_at: new Date(),
        details: {
          create: validated.details,
        },
      },
      include: { details: true },
    })

    await writeAuditLog({ user: auth.user, action: "CREATE", modelType: "keu_jurnal", modelId: row.id, dataBaru: { nomor: row.nomor_jurnal } })
    revalidatePath(PAGE_PATH)
    return ok(serialize(row) as unknown as JurnalRow)
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Gagal membuat jurnal")
  }
}

export async function updateJurnal(
  id: number,
  payload: {
    tanggal?: string
    keterangan?: string
    details?: JurnalDetailInput[]
  }
): Promise<ActionResult<JurnalRow>> {
  const auth = await requireKeuanganRole()
  if ("error" in auth) return fail(auth.error)

  try {
    const existing = await prisma.keu_jurnal.findUnique({
      where: { id: BigInt(id) },
      include: { details: { orderBy: { urutan: "asc" } } },
    })
    if (!existing) return fail("Jurnal tidak ditemukan")
    if (existing.status === "POSTED") return fail("Jurnal sudah diposting, tidak dapat diubah")
    if (existing.source_modul) return fail("Jurnal otomatis tidak dapat diubah manual. Buat jurnal pembalik/koreksi bila diperlukan.")

    const validated = await validateJurnalInput({
      tanggal: payload.tanggal ?? existing.tanggal,
      periode_id: existing.periode_id,
      jenis: existing.jenis,
      details: payload.details ?? existing.details.map((d) => ({
        akun_id: Number(d.akun_id),
        keterangan: d.keterangan ?? undefined,
        debit: Number(d.debit),
        kredit: Number(d.kredit),
        urutan: d.urutan,
      })),
    })

    const row = await prisma.$transaction(async (tx) => {
      if (payload.details) {
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
          ...(payload.tanggal ? { tanggal: validated.tanggal } : {}),
          ...(payload.keterangan ? { keterangan: payload.keterangan } : {}),
          total_debit: validated.totalDebit,
          total_kredit: validated.totalKredit,
          updated_at: new Date(),
        },
        include: { details: true },
      })
    })

    await writeAuditLog({ user: auth.user, action: "UPDATE", modelType: "keu_jurnal", modelId: BigInt(id), dataBaru: { nomor: row.nomor_jurnal } })
    revalidatePath(PAGE_PATH)
    return ok(serialize(row) as unknown as JurnalRow)
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Gagal memperbarui jurnal")
  }
}

export async function postJurnal(id: number): Promise<ActionResult<{ id: number; status: string; nomor_jurnal: string }>> {
  const auth = await requireKeuanganRole()
  if ("error" in auth) return fail(auth.error)

  try {
    const existing = await prisma.keu_jurnal.findUnique({
      where: { id: BigInt(id) },
    })
    if (!existing) return fail("Jurnal tidak ditemukan")
    if (existing.status === "POSTED") return fail("Jurnal sudah diposting")
    await validatePostedJurnal(id)

    const row = await prisma.keu_jurnal.update({
      where: { id: BigInt(id) },
      data: {
        status: "POSTED",
        diposting_oleh: BigInt(auth.user.id),
        diposting_pada: new Date(),
        updated_at: new Date(),
      },
      select: { id: true, status: true, nomor_jurnal: true },
    })

    await writeAuditLog({ user: auth.user, action: "UPDATE", modelType: "keu_jurnal", modelId: BigInt(id), dataBaru: { status: "POSTED" } })
    revalidatePath(PAGE_PATH)
    return ok({ id: Number(row.id), status: row.status, nomor_jurnal: row.nomor_jurnal })
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Gagal memposting jurnal")
  }
}

export async function deleteJurnal(id: number): Promise<ActionResult<{ id: number }>> {
  const auth = await requireKeuanganRole()
  if ("error" in auth) return fail(auth.error)

  try {
    const existing = await prisma.keu_jurnal.findUnique({ where: { id: BigInt(id) }, include: { periode: true } })
    if (!existing) return fail("Jurnal tidak ditemukan")
    if (existing.status === "POSTED") return fail("Jurnal sudah diposting, tidak dapat dihapus")
    if (existing.source_modul) return fail("Jurnal otomatis tidak dapat dihapus manual. Buat jurnal pembalik/koreksi bila diperlukan.")
    if (existing.periode.status !== "BUKA") return fail("Jurnal hanya dapat dihapus saat periode masih buka")

    await prisma.keu_jurnal.delete({ where: { id: BigInt(id) } })
    await writeAuditLog({ user: auth.user, action: "DELETE", modelType: "keu_jurnal", modelId: BigInt(id), dataBaru: { nomor: existing.nomor_jurnal } })
    revalidatePath(PAGE_PATH)
    return ok({ id })
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Gagal menghapus jurnal")
  }
}

export async function reverseJurnal(
  id: number,
  payload?: { tanggal?: string; keterangan?: string }
): Promise<ActionResult<JurnalRow>> {
  const auth = await requireKeuanganRole()
  if ("error" in auth) return fail(auth.error)

  try {
    const existing = await prisma.keu_jurnal.findUnique({
      where: { id: BigInt(id) },
      include: { details: { orderBy: { urutan: "asc" }, include: { akun: { select: { kode: true, nama: true } } } } },
    })
    if (!existing) return fail("Jurnal tidak ditemukan")
    if (existing.status !== "POSTED") return fail("Hanya jurnal POSTED yang dapat dibuatkan jurnal pembalik")
    if (existing.source_modul === "reversal") return fail("Jurnal pembalik tidak dapat dibalikkan lagi")

    const source_ref_id = `reversal:${existing.id.toString()}`
    const already = await prisma.keu_jurnal.findFirst({ where: { source_modul: "reversal", source_ref_id } })
    if (already) return fail(`Jurnal pembalik sudah pernah dibuat: ${already.nomor_jurnal}`)

    const tanggal = payload?.tanggal ? new Date(payload.tanggal) : new Date()
    if (Number.isNaN(tanggal.getTime())) return fail("Tanggal jurnal pembalik tidak valid")

    const periode = await prisma.keu_periode_fiskal.findFirst({
      where: { status: "BUKA", tgl_mulai: { lte: tanggal }, tgl_selesai: { gte: tanggal } },
    })
    if (!periode) return fail("Periode fiskal terbuka untuk tanggal jurnal pembalik tidak ditemukan")

    const details: JurnalDetailInput[] = existing.details.map((d, i) => ({
      akun_id: Number(d.akun_id),
      keterangan: `Pembalik ${existing.nomor_jurnal} - ${d.akun.kode}`,
      debit: Number(d.kredit),
      kredit: Number(d.debit),
      urutan: i,
    }))

    const validated = await validateJurnalInput({ tanggal, periode_id: periode.id, jenis: "BALIK", details })
    const nomor_jurnal = await generateNomorJurnal(validated.tanggal, "BALIK")

    const row = await prisma.keu_jurnal.create({
      data: {
        nomor_jurnal,
        tanggal: validated.tanggal,
        keterangan: payload?.keterangan?.trim() || `Jurnal pembalik ${existing.nomor_jurnal}`,
        jenis: "BALIK",
        status: "DRAFT",
        periode_id: periode.id,
        source_modul: "reversal",
        source_ref_id,
        total_debit: validated.totalDebit,
        total_kredit: validated.totalKredit,
        dibuat_oleh: BigInt(auth.user.id),
        created_at: new Date(),
        updated_at: new Date(),
        details: { create: validated.details },
      },
      include: { details: true },
    })

    await writeAuditLog({ user: auth.user, action: "CREATE", modelType: "keu_jurnal", modelId: row.id, dataBaru: { nomor: row.nomor_jurnal, reversal_of: existing.nomor_jurnal } })
    revalidatePath(PAGE_PATH)
    return ok(serialize(row) as unknown as JurnalRow)
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Gagal membuat jurnal pembalik")
  }
}

export async function createJurnalPenutup(periodeId: number): Promise<ActionResult<JurnalRow>> {
  const auth = await requireKeuanganRole()
  if ("error" in auth) return fail(auth.error)

  try {
    const periode = await prisma.keu_periode_fiskal.findUnique({ where: { id: BigInt(periodeId) } })
    if (!periode) return fail("Periode tidak ditemukan")
    if (periode.status !== "BUKA") return fail("Jurnal penutup hanya dapat dibuat saat periode masih buka")

    const source_ref_id = `closing:${periode.id.toString()}`
    const existing = await prisma.keu_jurnal.findFirst({ where: { source_modul: "keuangan", source_ref_id } })
    if (existing) return fail(`Jurnal penutup sudah pernah dibuat: ${existing.nomor_jurnal}`)

    const shuAkun = await prisma.keu_akun.findFirst({ where: { kode: "3.5", is_active: true, is_detail: true } })
    if (!shuAkun) return fail("Akun 3.5 SHU Tahun Berjalan tidak ditemukan atau tidak aktif")

    const details = await prisma.keu_jurnal_detail.findMany({
      where: {
        akun: { jenis: { in: ["PENDAPATAN", "BEBAN"] } },
        jurnal: { status: "POSTED", tanggal: { gte: periode.tgl_mulai, lte: periode.tgl_selesai } },
      },
      include: { akun: { select: { id: true, kode: true, nama: true, jenis: true, saldo_normal: true } } },
    })

    const byAkun = new Map<string, { akun: typeof details[number]["akun"]; debit: number; kredit: number }>()
    for (const d of details) {
      const key = d.akun.id.toString()
      const row = byAkun.get(key) ?? { akun: d.akun, debit: 0, kredit: 0 }
      row.debit += Number(d.debit)
      row.kredit += Number(d.kredit)
      byAkun.set(key, row)
    }

    const closingDetails: JurnalDetailInput[] = []
    for (const row of byAkun.values()) {
      const saldo = row.akun.saldo_normal === "DEBIT" ? row.debit - row.kredit : row.kredit - row.debit
      if (Math.abs(saldo) < 0.01) continue
      if (row.akun.jenis === "PENDAPATAN") {
        closingDetails.push({ akun_id: Number(row.akun.id), keterangan: `Tutup ${row.akun.kode} - ${row.akun.nama}`, debit: Math.abs(saldo), kredit: 0 })
      } else {
        closingDetails.push({ akun_id: Number(row.akun.id), keterangan: `Tutup ${row.akun.kode} - ${row.akun.nama}`, debit: 0, kredit: Math.abs(saldo) })
      }
    }

    const totalDebit = closingDetails.reduce((s, d) => s + Number(d.debit ?? 0), 0)
    const totalKredit = closingDetails.reduce((s, d) => s + Number(d.kredit ?? 0), 0)
    const selisih = totalDebit - totalKredit
    if (closingDetails.length === 0 || Math.abs(selisih) < 0.01) return fail("Tidak ada saldo pendapatan/beban yang perlu ditutup")

    closingDetails.push({
      akun_id: Number(shuAkun.id),
      keterangan: "Pindah SHU periode berjalan",
      debit: selisih < 0 ? Math.abs(selisih) : 0,
      kredit: selisih > 0 ? selisih : 0,
    })

    const tanggal = periode.tgl_selesai.toISOString().split("T")[0]
    const validated = await validateJurnalInput({ tanggal, periode_id: periode.id, jenis: "PENUTUP", details: closingDetails })
    const nomor_jurnal = await generateNomorJurnal(validated.tanggal, "PENUTUP")

    const row = await prisma.keu_jurnal.create({
      data: {
        nomor_jurnal,
        tanggal: validated.tanggal,
        keterangan: `Jurnal penutup ${periode.nama}`,
        jenis: "PENUTUP",
        status: "DRAFT",
        periode_id: periode.id,
        source_modul: "keuangan",
        source_ref_id,
        total_debit: validated.totalDebit,
        total_kredit: validated.totalKredit,
        dibuat_oleh: BigInt(auth.user.id),
        created_at: new Date(),
        updated_at: new Date(),
        details: { create: validated.details },
      },
      include: { details: true },
    })

    await writeAuditLog({ user: auth.user, action: "CREATE", modelType: "keu_jurnal", modelId: row.id, dataBaru: { nomor: row.nomor_jurnal, jenis: "PENUTUP" } })
    revalidatePath(PAGE_PATH)
    revalidatePath("/dashboard/keuangan/periode-fiskal")
    return ok(serialize(row) as unknown as JurnalRow)
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Gagal membuat jurnal penutup")
  }
}

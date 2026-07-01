"use server"

/**
 * Server Actions — Rekonsiliasi Bank.
 * Mencocokkan mutasi rekening bank fisik dengan jurnal akuntansi.
 *  1. Buat header rekonsiliasi per akun bank per periode
 *  2. Input baris mutasi bank (manual atau upload CSV)
 *  3. Auto-match: cari jurnal_detail dengan akun & nominal yang sama
 *  4. Tandai status: BELUM / COCOK / BEDA
 */

import { revalidatePath } from "next/cache"
import { prisma, serialize } from "@/lib/prisma"
import { getSession, type SessionUser } from "@/lib/session"
import { writeAuditLog } from "@/lib/audit"

export type ActionResult<T> =
  | { success: true; data: T; error: null }
  | { success: false; data: null; error: string }

function ok<T>(data: T): ActionResult<T> { return { success: true, data, error: null } }
function fail(error: string): ActionResult<never> { return { success: false, data: null, error } }

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

export type RekonsiliasiRow = {
  id: number
  akun_id: number
  kode_akun: string
  nama_akun: string
  periode_id: number
  nama_periode: string
  tanggal_mulai: string
  tanggal_selesai: string
  saldo_buku: number
  saldo_bank: number
  selisih: number
  status: "DRAFT" | "SELESAI"
  item_count: number
  cocok_count: number
}

export type RekonsiliasiItem = {
  id: number
  tanggal: string
  keterangan: string
  debit: number
  kredit: number
  status_cocok: "BELUM" | "COCOK" | "BEDA"
  jurnal_detail_id: number | null
  catatan: string | null
  jurnal?: { nomor_jurnal: string; keterangan: string } | null
}

/** Daftar semua rekonsiliasi yang pernah dibuat. */
export async function getRekonsiliasiList(): Promise<ActionResult<RekonsiliasiRow[]>> {
  try {
    const rows = await prisma.keu_rekonsiliasi.findMany({
      include: {
        akun: { select: { kode: true, nama: true } },
        periode: { select: { nama: true } },
        _count: { select: { items: true } },
        items: { where: { status_cocok: "COCOK" }, select: { id: true } },
      },
      orderBy: [{ created_at: "desc" }],
    })
    return ok(rows.map((r) => ({
      id: Number(r.id), akun_id: Number(r.akun_id),
      kode_akun: r.akun.kode, nama_akun: r.akun.nama,
      periode_id: Number(r.periode_id), nama_periode: r.periode.nama,
      tanggal_mulai: r.tanggal_mulai.toISOString(),
      tanggal_selesai: r.tanggal_selesai.toISOString(),
      saldo_buku: Number(r.saldo_buku), saldo_bank: Number(r.saldo_bank),
      selisih: Number(r.saldo_bank) - Number(r.saldo_buku),
      status: r.status as "DRAFT" | "SELESAI",
      item_count: r._count.items, cocok_count: r.items.length,
    })))
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Gagal memuat rekonsiliasi")
  }
}

/** Buat header rekonsiliasi baru. */
export async function createRekonsiliasi(payload: {
  akun_id: number
  periode_id: number
  saldo_bank: number
}): Promise<ActionResult<{ id: number }>> {
  const auth = await requireKeuanganRole()
  if ("error" in auth) return fail(auth.error)
  try {
    const periode = await prisma.keu_periode_fiskal.findUnique({ where: { id: BigInt(payload.periode_id) } })
    if (!periode) return fail("Periode tidak ditemukan")

    // Hitung saldo buku akun per tanggal akhir periode
    const akunRecord = await prisma.keu_akun.findUnique({ where: { id: BigInt(payload.akun_id) } })
    if (!akunRecord) return fail("Akun tidak ditemukan")

    const agg = await prisma.keu_jurnal_detail.aggregate({
      where: { akun_id: BigInt(payload.akun_id), jurnal: { status: "POSTED", tanggal: { lte: periode.tgl_selesai } } },
      _sum: { debit: true, kredit: true },
    })
    const saldo_buku = akunRecord.saldo_normal === "DEBIT"
      ? Number(agg._sum.debit ?? 0) - Number(agg._sum.kredit ?? 0)
      : Number(agg._sum.kredit ?? 0) - Number(agg._sum.debit ?? 0)

    const now = new Date()
    const row = await prisma.keu_rekonsiliasi.create({
      data: {
        akun_id: BigInt(payload.akun_id), periode_id: BigInt(payload.periode_id),
        tanggal_mulai: periode.tgl_mulai, tanggal_selesai: periode.tgl_selesai,
        saldo_buku, saldo_bank: payload.saldo_bank,
        status: "DRAFT", dibuat_oleh: BigInt(auth.user.id),
        created_at: now, updated_at: now,
      },
      select: { id: true },
    })
    await writeAuditLog({ user: auth.user, action: "CREATE", modelType: "keu_rekonsiliasi", modelId: row.id })
    revalidatePath("/dashboard/keuangan/rekonsiliasi-bank")
    return ok({ id: Number(row.id) })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes("uq_rekonsiliasi")) return fail("Rekonsiliasi untuk akun & periode ini sudah ada")
    return fail(msg || "Gagal membuat rekonsiliasi")
  }
}

/** Ambil item rekonsiliasi beserta saldo buku per periode. */
export async function getRekonsiliasiDetail(id: number): Promise<ActionResult<{
  header: RekonsiliasiRow
  items: RekonsiliasiItem[]
  jurnal_rows: { id: number; nomor_jurnal: string; tanggal: string; keterangan: string; debit: number; kredit: number }[]
}>> {
  try {
    const header = await prisma.keu_rekonsiliasi.findUnique({
      where: { id: BigInt(id) },
      include: {
        akun: { select: { kode: true, nama: true } },
        periode: { select: { nama: true } },
        items: { orderBy: { tanggal: "asc" } },
        _count: { select: { items: true } },
      },
    })
    if (!header) return fail("Rekonsiliasi tidak ditemukan")

    // Ambil jurnal_detail terkait akun dalam rentang periode
    const jurnalRows = await prisma.keu_jurnal_detail.findMany({
      where: {
        akun_id: header.akun_id,
        jurnal: { status: "POSTED", tanggal: { gte: header.tanggal_mulai, lte: header.tanggal_selesai } },
      },
      include: { jurnal: { select: { nomor_jurnal: true, tanggal: true, keterangan: true } } },
      orderBy: [{ jurnal: { tanggal: "asc" } }, { jurnal: { nomor_jurnal: "asc" } }],
    })

    const matchedIds = new Set(header.items.map((i) => i.jurnal_detail_id?.toString()).filter(Boolean))

    return ok({
      header: {
        id: Number(header.id), akun_id: Number(header.akun_id),
        kode_akun: header.akun.kode, nama_akun: header.akun.nama,
        periode_id: Number(header.periode_id), nama_periode: header.periode.nama,
        tanggal_mulai: header.tanggal_mulai.toISOString(),
        tanggal_selesai: header.tanggal_selesai.toISOString(),
        saldo_buku: Number(header.saldo_buku), saldo_bank: Number(header.saldo_bank),
        selisih: Number(header.saldo_bank) - Number(header.saldo_buku),
        status: header.status as "DRAFT" | "SELESAI",
        item_count: header._count.items, cocok_count: header.items.filter((i) => i.status_cocok === "COCOK").length,
      },
      items: header.items.map((i) => ({
        id: Number(i.id), tanggal: i.tanggal.toISOString(),
        keterangan: i.keterangan, debit: Number(i.debit), kredit: Number(i.kredit),
        status_cocok: i.status_cocok as "BELUM" | "COCOK" | "BEDA",
        jurnal_detail_id: i.jurnal_detail_id ? Number(i.jurnal_detail_id) : null,
        catatan: i.catatan,
        jurnal: null,
      })),
      jurnal_rows: jurnalRows
        .filter((j) => !matchedIds.has(j.id.toString()))
        .map((j) => ({
          id: Number(j.id), nomor_jurnal: j.jurnal.nomor_jurnal,
          tanggal: j.jurnal.tanggal.toISOString(), keterangan: j.jurnal.keterangan,
          debit: Number(j.debit), kredit: Number(j.kredit),
        })),
    })
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Gagal memuat detail rekonsiliasi")
  }
}

/** Tambah baris mutasi bank. */
export async function addRekonsiliasiItem(rekonsiliasi_id: number, items: {
  tanggal: string; keterangan: string; debit: number; kredit: number
}[]): Promise<ActionResult<{ count: number }>> {
  const auth = await requireKeuanganRole()
  if ("error" in auth) return fail(auth.error)
  try {
    const now = new Date()
    await prisma.keu_rekonsiliasi_item.createMany({
      data: items.map((i) => ({
        rekonsiliasi_id: BigInt(rekonsiliasi_id),
        tanggal: new Date(i.tanggal), keterangan: i.keterangan,
        debit: i.debit, kredit: i.kredit, status_cocok: "BELUM",
        created_at: now, updated_at: now,
      })),
    })
    revalidatePath("/dashboard/keuangan/rekonsiliasi-bank")
    return ok({ count: items.length })
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Gagal menambah item")
  }
}

/** Cocokkan item bank dengan jurnal_detail. */
export async function matchItem(item_id: number, jurnal_detail_id: number | null, status: "COCOK" | "BEDA" | "BELUM", catatan?: string): Promise<ActionResult<{ id: number }>> {
  const auth = await requireKeuanganRole()
  if ("error" in auth) return fail(auth.error)
  try {
    const row = await prisma.keu_rekonsiliasi_item.update({
      where: { id: BigInt(item_id) },
      data: {
        jurnal_detail_id: jurnal_detail_id ? BigInt(jurnal_detail_id) : null,
        status_cocok: status, catatan: catatan ?? null, updated_at: new Date(),
      },
      select: { id: true },
    })
    revalidatePath("/dashboard/keuangan/rekonsiliasi-bank")
    return ok({ id: Number(row.id) })
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Gagal mencocokkan item")
  }
}

/** Auto-match: cari jurnal_detail dengan nilai debit/kredit yang sama. */
export async function autoMatch(rekonsiliasi_id: number): Promise<ActionResult<{ matched: number }>> {
  const auth = await requireKeuanganRole()
  if ("error" in auth) return fail(auth.error)
  try {
    const header = await prisma.keu_rekonsiliasi.findUnique({ where: { id: BigInt(rekonsiliasi_id) } })
    if (!header) return fail("Rekonsiliasi tidak ditemukan")

    const items = await prisma.keu_rekonsiliasi_item.findMany({
      where: { rekonsiliasi_id: BigInt(rekonsiliasi_id), status_cocok: "BELUM" },
    })
    const jurnalRows = await prisma.keu_jurnal_detail.findMany({
      where: {
        akun_id: header.akun_id,
        jurnal: { status: "POSTED", tanggal: { gte: header.tanggal_mulai, lte: header.tanggal_selesai } },
      },
      include: { jurnal: { select: { tanggal: true } } },
    })

    // Group jurnal by (debit,kredit,tanggal) for matching
    const usedJds = new Set<string>()
    const alreadyMatched = await prisma.keu_rekonsiliasi_item.findMany({
      where: { rekonsiliasi_id: BigInt(rekonsiliasi_id), status_cocok: "COCOK" },
      select: { jurnal_detail_id: true },
    })
    alreadyMatched.forEach((i) => { if (i.jurnal_detail_id) usedJds.add(i.jurnal_detail_id.toString()) })

    const now = new Date()
    let matched = 0

    for (const item of items) {
      const jd = jurnalRows.find((j) =>
        !usedJds.has(j.id.toString()) &&
        Number(j.debit) === Number(item.debit) &&
        Number(j.kredit) === Number(item.kredit)
      )
      if (jd) {
        usedJds.add(jd.id.toString())
        await prisma.keu_rekonsiliasi_item.update({
          where: { id: item.id },
          data: { jurnal_detail_id: jd.id, status_cocok: "COCOK", updated_at: now },
        })
        matched++
      }
    }
    revalidatePath("/dashboard/keuangan/rekonsiliasi-bank")
    return ok({ matched })
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Gagal auto-match")
  }
}

/** Update saldo bank & tutup rekonsiliasi. */
export async function updateSaldoBank(id: number, saldo_bank: number): Promise<ActionResult<{ id: number }>> {
  const auth = await requireKeuanganRole()
  if ("error" in auth) return fail(auth.error)
  try {
    const row = await prisma.keu_rekonsiliasi.update({
      where: { id: BigInt(id) }, data: { saldo_bank, updated_at: new Date() }, select: { id: true },
    })
    revalidatePath("/dashboard/keuangan/rekonsiliasi-bank")
    return ok({ id: Number(row.id) })
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Gagal update saldo bank")
  }
}

export async function selesaiRekonsiliasi(id: number): Promise<ActionResult<{ id: number }>> {
  const auth = await requireKeuanganRole()
  if ("error" in auth) return fail(auth.error)
  try {
    const row = await prisma.keu_rekonsiliasi.update({
      where: { id: BigInt(id) }, data: { status: "SELESAI", updated_at: new Date() }, select: { id: true },
    })
    revalidatePath("/dashboard/keuangan/rekonsiliasi-bank")
    return ok({ id: Number(row.id) })
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Gagal menyelesaikan rekonsiliasi")
  }
}

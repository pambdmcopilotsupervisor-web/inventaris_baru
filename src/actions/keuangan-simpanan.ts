"use server"

/**
 * Server Actions — Simpanan Anggota.
 * Setiap transaksi simpanan otomatis membuat jurnal akuntansi (POSTED).
 *  - SETOR  : Debit Kas/Bank, Kredit akun simpanan
 *  - TARIK  : Debit akun simpanan, Kredit Kas/Bank
 * Mapping akun simpanan: POKOK=3.1, WAJIB=3.2, SUKARELA=2.1.6.
 */

import { revalidatePath } from "next/cache"
import { prisma, serialize } from "@/lib/prisma"
import { getSession, type SessionUser } from "@/lib/session"
import { writeAuditLog } from "@/lib/audit"

const PAGE_PATH = "/dashboard/keuangan/simpanan"

const SIMPANAN_AKUN: Record<string, string> = {
  POKOK: "3.1",
  WAJIB: "3.2",
  SUKARELA: "2.1.6",
}
const KAS_DEFAULT = "1.1.1"

export type ActionResult<T> =
  | { success: true; data: T; error: null }
  | { success: false; data: null; error: string }

function ok<T>(data: T): ActionResult<T> { return { success: true, data, error: null } }
function fail(error: string): ActionResult<never> { return { success: false, data: null, error } }

export type SimpananRow = {
  id: number
  anggota_id: number
  jenis: "POKOK" | "WAJIB" | "SUKARELA"
  tipe: "SETOR" | "TARIK"
  tanggal: string
  jumlah: number
  keterangan: string | null
  jurnal_id: number | null
  anggota?: { no_anggota: string; nama: string }
  jurnal?: { nomor_jurnal: string } | null
}

export type SimpananSaldo = {
  anggota_id: number
  no_anggota: string
  nama: string
  pokok: number
  wajib: number
  sukarela: number
  total: number
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

async function generateNomor(tanggal: Date): Promise<string> {
  const ym = `${tanggal.getFullYear()}${String(tanggal.getMonth() + 1).padStart(2, "0")}`
  const last = await prisma.keu_jurnal.findFirst({
    where: { nomor_jurnal: { startsWith: `JK-${ym}-` } },
    orderBy: { nomor_jurnal: "desc" },
    select: { nomor_jurnal: true },
  })
  let seq = 1
  if (last) {
    const parts = last.nomor_jurnal.split("-")
    seq = (parseInt(parts[parts.length - 1], 10) || 0) + 1
  }
  return `JK-${ym}-${String(seq).padStart(4, "0")}`
}

export async function getSimpanan(params?: {
  anggota_id?: number; jenis?: string; tahun?: number
}): Promise<ActionResult<SimpananRow[]>> {
  try {
    const where: Record<string, unknown> = {}
    if (params?.anggota_id) where.anggota_id = BigInt(params.anggota_id)
    if (params?.jenis) where.jenis = params.jenis
    if (params?.tahun) where.tanggal = { gte: new Date(params.tahun, 0, 1), lte: new Date(params.tahun, 11, 31) }

    const rows = await prisma.keu_simpanan.findMany({
      where,
      orderBy: [{ tanggal: "desc" }, { id: "desc" }],
      include: {
        anggota: { select: { no_anggota: true, nama: true } },
        jurnal: { select: { nomor_jurnal: true } },
      },
      take: 500,
    })
    return ok(serialize(rows) as unknown as SimpananRow[])
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Gagal memuat simpanan")
  }
}

/** Rekap saldo simpanan per anggota (semua jenis). */
export async function getSimpananSaldo(): Promise<ActionResult<SimpananSaldo[]>> {
  try {
    const [anggota, trx] = await Promise.all([
      prisma.keu_anggota.findMany({ where: { status: { not: "KELUAR" } }, select: { id: true, no_anggota: true, nama: true }, orderBy: { no_anggota: "asc" } }),
      prisma.keu_simpanan.groupBy({ by: ["anggota_id", "jenis", "tipe"], _sum: { jumlah: true } }),
    ])
    const map = new Map<string, SimpananSaldo>()
    for (const a of anggota) {
      map.set(a.id.toString(), { anggota_id: Number(a.id), no_anggota: a.no_anggota, nama: a.nama, pokok: 0, wajib: 0, sukarela: 0, total: 0 })
    }
    for (const t of trx) {
      const e = map.get(t.anggota_id.toString())
      if (!e) continue
      const amt = Number(t._sum.jumlah ?? 0) * (t.tipe === "SETOR" ? 1 : -1)
      if (t.jenis === "POKOK") e.pokok += amt
      else if (t.jenis === "WAJIB") e.wajib += amt
      else if (t.jenis === "SUKARELA") e.sukarela += amt
    }
    for (const e of map.values()) e.total = e.pokok + e.wajib + e.sukarela
    return ok([...map.values()])
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Gagal memuat saldo simpanan")
  }
}

export async function createSimpanan(payload: {
  anggota_id: number
  jenis: "POKOK" | "WAJIB" | "SUKARELA"
  tipe: "SETOR" | "TARIK"
  tanggal: string
  jumlah: number
  akun_kas_id?: number
  keterangan?: string
}): Promise<ActionResult<{ id: number; nomor_jurnal: string }>> {
  const auth = await requireKeuanganRole()
  if ("error" in auth) return fail(auth.error)

  if (!payload.jumlah || payload.jumlah <= 0) return fail("Jumlah harus lebih dari nol")

  try {
    const tanggal = new Date(payload.tanggal)

    const anggota = await prisma.keu_anggota.findUnique({ where: { id: BigInt(payload.anggota_id) } })
    if (!anggota) return fail("Anggota tidak ditemukan")

    const periode = await prisma.keu_periode_fiskal.findFirst({
      where: { status: "BUKA", tgl_mulai: { lte: tanggal }, tgl_selesai: { gte: tanggal } },
    })
    if (!periode) return fail("Periode fiskal terbuka untuk tanggal tersebut tidak ditemukan")

    const simpananKode = SIMPANAN_AKUN[payload.jenis]
    const [akunSimpanan, akunKas] = await Promise.all([
      prisma.keu_akun.findUnique({ where: { kode: simpananKode } }),
      payload.akun_kas_id
        ? prisma.keu_akun.findUnique({ where: { id: BigInt(payload.akun_kas_id) } })
        : prisma.keu_akun.findUnique({ where: { kode: KAS_DEFAULT } }),
    ])
    if (!akunSimpanan) return fail(`Akun simpanan ${simpananKode} tidak ditemukan`)
    if (!akunKas) return fail("Akun kas tidak ditemukan")

    // Validasi penarikan tidak melebihi saldo (per jenis)
    if (payload.tipe === "TARIK") {
      const agg = await prisma.keu_simpanan.groupBy({
        by: ["tipe"], where: { anggota_id: BigInt(payload.anggota_id), jenis: payload.jenis }, _sum: { jumlah: true },
      })
      const setor = Number(agg.find((a) => a.tipe === "SETOR")?._sum.jumlah ?? 0)
      const tarik = Number(agg.find((a) => a.tipe === "TARIK")?._sum.jumlah ?? 0)
      const saldo = setor - tarik
      if (payload.jumlah > saldo) return fail(`Penarikan melebihi saldo ${payload.jenis} (saldo: ${saldo.toLocaleString("id-ID")})`)
      if (payload.jenis === "POKOK") return fail("Simpanan Pokok tidak dapat ditarik selama menjadi anggota")
    }

    const now = new Date()
    const isSetor = payload.tipe === "SETOR"
    const details = isSetor
      ? [
          { akun_id: akunKas.id, urutan: 0, keterangan: `Setoran ${payload.jenis}`, debit: payload.jumlah, kredit: 0, created_at: now, updated_at: now },
          { akun_id: akunSimpanan.id, urutan: 1, keterangan: `Setoran ${payload.jenis} - ${anggota.nama}`, debit: 0, kredit: payload.jumlah, created_at: now, updated_at: now },
        ]
      : [
          { akun_id: akunSimpanan.id, urutan: 0, keterangan: `Penarikan ${payload.jenis} - ${anggota.nama}`, debit: payload.jumlah, kredit: 0, created_at: now, updated_at: now },
          { akun_id: akunKas.id, urutan: 1, keterangan: `Penarikan ${payload.jenis}`, debit: 0, kredit: payload.jumlah, created_at: now, updated_at: now },
        ]

    const nomor_jurnal = await generateNomor(tanggal)

    const result = await prisma.$transaction(async (tx) => {
      const jurnal = await tx.keu_jurnal.create({
        data: {
          nomor_jurnal,
          tanggal,
          keterangan: `${isSetor ? "Setoran" : "Penarikan"} simpanan ${payload.jenis} — ${anggota.no_anggota} ${anggota.nama}`,
          jenis: "KHUSUS",
          status: "POSTED",
          periode_id: periode.id,
          source_modul: "simpanan",
          total_debit: payload.jumlah,
          total_kredit: payload.jumlah,
          dibuat_oleh: BigInt(auth.user.id),
          diposting_oleh: BigInt(auth.user.id),
          diposting_pada: now,
          created_at: now,
          updated_at: now,
          details: { create: details },
        },
        select: { id: true, nomor_jurnal: true },
      })

      const simpanan = await tx.keu_simpanan.create({
        data: {
          anggota_id: BigInt(payload.anggota_id),
          jenis: payload.jenis,
          tipe: payload.tipe,
          tanggal,
          jumlah: payload.jumlah,
          keterangan: payload.keterangan || null,
          jurnal_id: jurnal.id,
          akun_kas_id: akunKas.id,
          dibuat_oleh: BigInt(auth.user.id),
          created_at: now,
          updated_at: now,
        },
        select: { id: true },
      })

      await tx.keu_jurnal.update({ where: { id: jurnal.id }, data: { source_ref_id: `simpanan:${simpanan.id}` } })
      return { id: Number(simpanan.id), nomor_jurnal: jurnal.nomor_jurnal }
    })

    await writeAuditLog({ user: auth.user, action: "CREATE", modelType: "keu_simpanan", modelId: result.id, dataBaru: { jenis: payload.jenis, tipe: payload.tipe, jumlah: payload.jumlah } })
    revalidatePath(PAGE_PATH)
    revalidatePath("/dashboard/keuangan/jurnal")
    return ok(result)
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Gagal menyimpan transaksi simpanan")
  }
}

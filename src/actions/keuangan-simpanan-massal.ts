"use server"

/**
 * Server Action — Setoran Simpanan Massal.
 * Memproses setoran simpanan (biasanya WAJIB) untuk banyak anggota sekaligus
 * dalam satu batch. Menghasilkan:
 *  - Satu record keu_simpanan per anggota
 *  - Satu jurnal gabungan (POSTED): Debit Kas sejumlah total, Kredit akun simpanan per anggota
 */

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"
import { getSession, type SessionUser } from "@/lib/session"
import { writeAuditLog } from "@/lib/audit"

export type ActionResult<T> =
  | { success: true; data: T; error: null }
  | { success: false; data: null; error: string }

function ok<T>(data: T): ActionResult<T> { return { success: true, data, error: null } }
function fail(error: string): ActionResult<never> { return { success: false, data: null, error } }

const SIMPANAN_AKUN: Record<string, string> = {
  POKOK: "3.1", WAJIB: "3.2", SUKARELA: "2.1.6",
}
const KAS_DEFAULT = "1.1.1"

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

async function generateNomor(tanggal: Date, prefix: string): Promise<string> {
  const ym = `${tanggal.getFullYear()}${String(tanggal.getMonth() + 1).padStart(2, "0")}`
  const last = await prisma.keu_jurnal.findFirst({
    where: { nomor_jurnal: { startsWith: `${prefix}-${ym}-` } },
    orderBy: { nomor_jurnal: "desc" },
    select: { nomor_jurnal: true },
  })
  const seq = last ? (parseInt(last.nomor_jurnal.split("-").at(-1) ?? "0", 10) || 0) + 1 : 1
  return `${prefix}-${ym}-${String(seq).padStart(4, "0")}`
}

export type MassalAnggotaInput = {
  anggota_id: number
  jumlah: number
}

export type MassalPreviewRow = {
  id: number
  no_anggota: string
  nama: string
  saldo_wajib: number
  saldo_pokok: number
  default_jumlah: number
}

export type MassalResult = {
  sukses: number
  total: number
  nomor_jurnal: string
}

/** Ambil daftar anggota aktif beserta saldo simpanan untuk preview form massal. */
export async function getMassalPreview(jenis: "POKOK" | "WAJIB" | "SUKARELA"): Promise<ActionResult<MassalPreviewRow[]>> {
  try {
    const anggota = await prisma.keu_anggota.findMany({
      where: { status: "AKTIF" },
      orderBy: { no_anggota: "asc" },
    })

    const agg = await prisma.keu_simpanan.groupBy({
      by: ["anggota_id", "jenis", "tipe"],
      _sum: { jumlah: true },
    })

    // Bangun saldo per anggota
    const saldoMap = new Map<string, { wajib: number; pokok: number }>()
    for (const a of agg) {
      const k = a.anggota_id.toString()
      const e = saldoMap.get(k) ?? { wajib: 0, pokok: 0 }
      const amt = Number(a._sum.jumlah ?? 0) * (a.tipe === "SETOR" ? 1 : -1)
      if (a.jenis === "WAJIB") e.wajib += amt
      if (a.jenis === "POKOK") e.pokok += amt
      saldoMap.set(k, e)
    }

    return ok(anggota.map((a) => {
      const s = saldoMap.get(a.id.toString()) ?? { wajib: 0, pokok: 0 }
      return {
        id: Number(a.id),
        no_anggota: a.no_anggota,
        nama: a.nama,
        saldo_wajib: s.wajib,
        saldo_pokok: s.pokok,
        default_jumlah: 0,
      }
    }))
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Gagal memuat data anggota")
  }
}

/** Proses setoran massal. Satu jurnal gabungan untuk seluruh batch. */
export async function createSimpananMassal(payload: {
  jenis: "POKOK" | "WAJIB" | "SUKARELA"
  tanggal: string
  akun_kas_id?: number
  keterangan?: string
  items: MassalAnggotaInput[]
}): Promise<ActionResult<MassalResult>> {
  const auth = await requireKeuanganRole()
  if ("error" in auth) return fail(auth.error)

  const validItems = payload.items.filter((i) => i.jumlah > 0)
  if (validItems.length === 0) return fail("Tidak ada anggota dengan jumlah setoran > 0")

  const total = validItems.reduce((s, i) => s + i.jumlah, 0)
  const tanggal = new Date(payload.tanggal)

  try {
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

    // Cek anggota valid
    const anggotaIds = validItems.map((i) => BigInt(i.anggota_id))
    const anggotaList = await prisma.keu_anggota.findMany({
      where: { id: { in: anggotaIds }, status: "AKTIF" },
      select: { id: true, no_anggota: true, nama: true },
    })
    if (anggotaList.length !== validItems.length) {
      return fail("Beberapa anggota tidak ditemukan atau tidak aktif")
    }
    const anggotaById = new Map(anggotaList.map((a) => [a.id.toString(), a]))

    const now = new Date()
    const nomor_jurnal = await generateNomor(tanggal, "JK")
    const ket = payload.keterangan || `Setoran massal ${payload.jenis} — ${validItems.length} anggota`

    const result = await prisma.$transaction(async (tx) => {
      // Baris jurnal: Debit Kas total, Kredit per anggota
      const jurnalDetails: { akun_id: bigint; urutan: number; keterangan: string; debit: number; kredit: number; created_at: Date; updated_at: Date }[] = []
      jurnalDetails.push({
        akun_id: akunKas!.id, urutan: 0, keterangan: ket, debit: total, kredit: 0, created_at: now, updated_at: now,
      })
      validItems.forEach((item, i) => {
        const a = anggotaById.get(String(item.anggota_id))!
        jurnalDetails.push({
          akun_id: akunSimpanan!.id, urutan: i + 1,
          keterangan: `${payload.jenis} — ${a.no_anggota} ${a.nama}`,
          debit: 0, kredit: item.jumlah, created_at: now, updated_at: now,
        })
      })

      const jurnal = await tx.keu_jurnal.create({
        data: {
          nomor_jurnal, tanggal, keterangan: ket,
          jenis: "KHUSUS", status: "POSTED",
          periode_id: periode.id,
          source_modul: "simpanan_massal",
          total_debit: total, total_kredit: total,
          dibuat_oleh: BigInt(auth.user.id),
          diposting_oleh: BigInt(auth.user.id),
          diposting_pada: now,
          created_at: now, updated_at: now,
          details: { create: jurnalDetails },
        },
        select: { id: true, nomor_jurnal: true },
      })

      // Buat record simpanan per anggota
      await tx.keu_simpanan.createMany({
        data: validItems.map((item) => ({
          anggota_id: BigInt(item.anggota_id),
          jenis: payload.jenis,
          tipe: "SETOR",
          tanggal,
          jumlah: item.jumlah,
          keterangan: ket,
          jurnal_id: jurnal.id,
          akun_kas_id: akunKas!.id,
          dibuat_oleh: BigInt(auth.user.id),
          created_at: now,
          updated_at: now,
        })),
      })

      return { sukses: validItems.length, total, nomor_jurnal: jurnal.nomor_jurnal }
    })

    await writeAuditLog({
      user: auth.user, action: "CREATE", modelType: "keu_simpanan_massal",
      dataBaru: { jenis: payload.jenis, jumlah_anggota: result.sukses, total, nomor_jurnal: result.nomor_jurnal },
    })
    revalidatePath("/dashboard/keuangan/simpanan")
    revalidatePath("/dashboard/keuangan/simpanan-massal")
    return ok(result)
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Gagal memproses setoran massal")
  }
}

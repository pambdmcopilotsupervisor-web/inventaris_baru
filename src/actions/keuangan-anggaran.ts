"use server"

/**
 * Server Actions — RAPB (Rencana Anggaran Pendapatan dan Belanja).
 * Kelola anggaran per akun per bulan/tahun, dan laporan realisasi vs anggaran.
 */

import { revalidatePath } from "next/cache"
import { prisma, serialize } from "@/lib/prisma"
import { getSession, type SessionUser } from "@/lib/session"

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

export type AnggaranRow = { akun_id: number; kode: string; nama: string; jenis: string; jumlah: number }

/** Ambil semua anggaran untuk tahun tertentu (bulan=0 = tahunan). */
export async function getAnggaran(tahun: number, bulan = 0): Promise<ActionResult<AnggaranRow[]>> {
  try {
    const rows = await prisma.keu_anggaran.findMany({
      where: { tahun, bulan },
      include: { akun: { select: { kode: true, nama: true, jenis: true } } },
      orderBy: [{ akun: { kode: "asc" } }],
    })
    return ok(rows.map((r) => ({
      akun_id: Number(r.akun_id), kode: r.akun.kode, nama: r.akun.nama, jenis: r.akun.jenis, jumlah: Number(r.jumlah),
    })))
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Gagal memuat anggaran")
  }
}

/** Simpan anggaran batch (upsert per akun). */
export async function saveAnggaran(payload: {
  tahun: number
  bulan: number
  items: { akun_id: number; jumlah: number }[]
}): Promise<ActionResult<{ count: number }>> {
  const auth = await requireKeuanganRole()
  if ("error" in auth) return fail(auth.error)
  try {
    const now = new Date()
    // Upsert satu per satu (Prisma upsert on unique constraint)
    const ops = payload.items.map((item) =>
      prisma.keu_anggaran.upsert({
        where: { akun_id_tahun_bulan: { akun_id: BigInt(item.akun_id), tahun: payload.tahun, bulan: payload.bulan } },
        create: { akun_id: BigInt(item.akun_id), tahun: payload.tahun, bulan: payload.bulan, jumlah: item.jumlah, created_at: now, updated_at: now },
        update: { jumlah: item.jumlah, updated_at: now },
      })
    )
    await prisma.$transaction(ops)
    revalidatePath("/dashboard/keuangan/rapb")
    revalidatePath("/dashboard/keuangan/laporan/rapb-realisasi")
    return ok({ count: payload.items.length })
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Gagal menyimpan anggaran")
  }
}

export type RealisasiRow = {
  kode: string
  nama: string
  jenis: string
  anggaran: number
  realisasi: number
  selisih: number
  persen: number
}

export type RealisasiData = {
  tahun: number
  tgl_mulai: string
  tgl_selesai: string
  rows: RealisasiRow[]
  total_anggaran_pendapatan: number
  total_realisasi_pendapatan: number
  total_anggaran_beban: number
  total_realisasi_beban: number
  shu_anggaran: number
  shu_realisasi: number
}

/** Laporan RAPB vs Realisasi untuk tahun/bulan tertentu. */
export async function getRapbRealisasi(tahun: number, bulan = 0): Promise<ActionResult<RealisasiData>> {
  try {
    const tgl_mulai = bulan === 0 ? new Date(Date.UTC(tahun, 0, 1)) : new Date(Date.UTC(tahun, bulan - 1, 1))
    const tgl_selesai = bulan === 0 ? new Date(Date.UTC(tahun, 11, 31)) : new Date(Date.UTC(tahun, bulan, 0))

    const [anggaran, details] = await Promise.all([
      prisma.keu_anggaran.findMany({
        where: { tahun, bulan },
        include: { akun: { select: { kode: true, nama: true, jenis: true, saldo_normal: true } } },
      }),
      prisma.keu_jurnal_detail.findMany({
        where: {
          akun: { jenis: { in: ["PENDAPATAN", "BEBAN"] } },
          jurnal: { status: "POSTED", tanggal: { gte: tgl_mulai, lte: tgl_selesai } },
        },
        include: { akun: { select: { kode: true, nama: true, jenis: true, saldo_normal: true } } },
      }),
    ])

    // Realisasi per akun
    const realisasiMap = new Map<string, { kode: string; nama: string; jenis: string; debit: number; kredit: number; saldo_normal: string }>()
    for (const d of details) {
      const k = d.akun_id.toString()
      const e = realisasiMap.get(k) ?? { kode: d.akun.kode, nama: d.akun.nama, jenis: d.akun.jenis, debit: 0, kredit: 0, saldo_normal: d.akun.saldo_normal }
      e.debit += Number(d.debit); e.kredit += Number(d.kredit)
      realisasiMap.set(k, e)
    }

    // Gabungkan anggaran dengan realisasi (tampilkan semua yang ada anggaran, tambahkan yang ada realisasi tapi tidak punya anggaran)
    const allKeys = new Set([...anggaran.map((a) => a.akun_id.toString()), ...realisasiMap.keys()])
    const anggaranMap = new Map(anggaran.map((a) => [a.akun_id.toString(), a]))

    const rows: RealisasiRow[] = []
    for (const k of allKeys) {
      const a = anggaranMap.get(k)
      const r = realisasiMap.get(k)
      const jenis = a?.akun.jenis ?? r?.jenis ?? ""
      if (!["PENDAPATAN", "BEBAN"].includes(jenis)) continue

      const angg = Number(a?.jumlah ?? 0)
      const saldo_normal = a?.akun.saldo_normal ?? r?.saldo_normal ?? "KREDIT"
      const real = r ? (saldo_normal === "KREDIT" ? r.kredit - r.debit : r.debit - r.kredit) : 0
      const selisih = real - angg
      const persen = angg > 0 ? Math.round((real / angg) * 10000) / 100 : (real > 0 ? 100 : 0)

      rows.push({
        kode: a?.akun.kode ?? r?.kode ?? "", nama: a?.akun.nama ?? r?.nama ?? "",
        jenis, anggaran: angg, realisasi: real, selisih, persen,
      })
    }
    rows.sort((a, b) => a.kode.localeCompare(b.kode))

    const pendapatan = rows.filter((r) => r.jenis === "PENDAPATAN")
    const beban = rows.filter((r) => r.jenis === "BEBAN")

    return ok({
      tahun, tgl_mulai: tgl_mulai.toISOString(), tgl_selesai: tgl_selesai.toISOString(), rows,
      total_anggaran_pendapatan: pendapatan.reduce((s, r) => s + r.anggaran, 0),
      total_realisasi_pendapatan: pendapatan.reduce((s, r) => s + r.realisasi, 0),
      total_anggaran_beban: beban.reduce((s, r) => s + r.anggaran, 0),
      total_realisasi_beban: beban.reduce((s, r) => s + r.realisasi, 0),
      shu_anggaran: pendapatan.reduce((s, r) => s + r.anggaran, 0) - beban.reduce((s, r) => s + r.anggaran, 0),
      shu_realisasi: pendapatan.reduce((s, r) => s + r.realisasi, 0) - beban.reduce((s, r) => s + r.realisasi, 0),
    })
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Gagal memuat laporan RAPB vs Realisasi")
  }
}

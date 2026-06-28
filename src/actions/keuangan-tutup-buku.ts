"use server"

/**
 * Server Action — Tutup Buku Tahunan (Jurnal Penutup).
 * Menutup akun nominal (Pendapatan & Beban) ke akun SHU Tahun Berjalan (3.5).
 * Menghasilkan jurnal jenis PENUTUP berstatus POSTED, bertanggal akhir tahun.
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

const SHU_BERJALAN_KODE = "3.5"

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
    where: { nomor_jurnal: { startsWith: `JT-${ym}-` } },
    orderBy: { nomor_jurnal: "desc" },
    select: { nomor_jurnal: true },
  })
  let seq = 1
  if (last) {
    const parts = last.nomor_jurnal.split("-")
    seq = (parseInt(parts[parts.length - 1], 10) || 0) + 1
  }
  return `JT-${ym}-${String(seq).padStart(4, "0")}`
}

export type ClosingPreview = {
  tahun: number
  pendapatan: number
  beban: number
  shu: number
  pendapatan_rows: { kode: string; nama: string; saldo: number }[]
  beban_rows: { kode: string; nama: string; saldo: number }[]
  already_closed: boolean
  draft_count: number
  can_close: boolean
  message: string | null
}

/** Hitung saldo nominal tahun berjalan & status kelayakan tutup buku. */
export async function getClosingPreview(tahun: number): Promise<ActionResult<ClosingPreview>> {
  try {
    const start = new Date(Date.UTC(tahun, 0, 1))
    const end = new Date(Date.UTC(tahun, 11, 31))

    const existing = await prisma.keu_jurnal.findFirst({
      where: { source_modul: "tutup_buku", source_ref_id: `tutup_buku:${tahun}` },
      select: { nomor_jurnal: true },
    })

    const draftCount = await prisma.keu_jurnal.count({
      where: { status: "DRAFT", tanggal: { gte: start, lte: end } },
    })

    const details = await prisma.keu_jurnal_detail.findMany({
      where: {
        akun: { jenis: { in: ["PENDAPATAN", "BEBAN"] } },
        jurnal: { status: "POSTED", tanggal: { gte: start, lte: end }, source_modul: { not: "tutup_buku" } },
      },
      include: { akun: { select: { kode: true, nama: true, jenis: true, saldo_normal: true } } },
    })

    const byAkun = new Map<string, { kode: string; nama: string; jenis: string; saldo_normal: string; debit: number; kredit: number }>()
    for (const d of details) {
      const k = d.akun_id.toString()
      const e = byAkun.get(k) ?? { kode: d.akun.kode, nama: d.akun.nama, jenis: d.akun.jenis, saldo_normal: d.akun.saldo_normal, debit: 0, kredit: 0 }
      e.debit += Number(d.debit); e.kredit += Number(d.kredit)
      byAkun.set(k, e)
    }
    const rows = [...byAkun.values()].map((a) => ({
      kode: a.kode, nama: a.nama, jenis: a.jenis,
      saldo: a.saldo_normal === "DEBIT" ? a.debit - a.kredit : a.kredit - a.debit,
    }))
    const pendapatan_rows = rows.filter((r) => r.jenis === "PENDAPATAN").sort((a, b) => a.kode.localeCompare(b.kode))
    const beban_rows = rows.filter((r) => r.jenis === "BEBAN").sort((a, b) => a.kode.localeCompare(b.kode))
    const pendapatan = pendapatan_rows.reduce((s, r) => s + r.saldo, 0)
    const beban = beban_rows.reduce((s, r) => s + r.saldo, 0)
    const shu = pendapatan - beban

    let message: string | null = null
    let can_close = true
    if (existing) { can_close = false; message = `Tahun ${tahun} sudah ditutup (${existing.nomor_jurnal}).` }
    else if (draftCount > 0) { can_close = false; message = `Masih ada ${draftCount} jurnal DRAFT pada ${tahun}. Posting semua sebelum tutup buku.` }
    else if (pendapatan === 0 && beban === 0) { can_close = false; message = `Tidak ada transaksi pendapatan/beban pada ${tahun}.` }

    return ok({
      tahun, pendapatan, beban, shu,
      pendapatan_rows: pendapatan_rows.map(({ kode, nama, saldo }) => ({ kode, nama, saldo })),
      beban_rows: beban_rows.map(({ kode, nama, saldo }) => ({ kode, nama, saldo })),
      already_closed: !!existing, draft_count: draftCount, can_close, message,
    })
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Gagal memuat pratinjau tutup buku")
  }
}

export async function createClosingEntry(tahun: number): Promise<ActionResult<{ id: number; nomor_jurnal: string; shu: number }>> {
  const auth = await requireKeuanganRole()
  if ("error" in auth) return fail(auth.error)

  try {
    const preview = await getClosingPreview(tahun)
    if (!preview.success) return fail(preview.error)
    if (!preview.data.can_close) return fail(preview.data.message ?? "Tidak dapat menutup buku")

    const end = new Date(Date.UTC(tahun, 11, 31))

    // Periode fiskal untuk menampung jurnal penutup (Desember tahun ybs)
    const periode = await prisma.keu_periode_fiskal.findFirst({
      where: { status: "BUKA", tgl_mulai: { lte: end }, tgl_selesai: { gte: end } },
    })
    if (!periode) return fail("Periode fiskal terbuka untuk akhir tahun tidak ditemukan. Buat/aktifkan periode Desember dulu.")

    const shuAkun = await prisma.keu_akun.findUnique({ where: { kode: SHU_BERJALAN_KODE } })
    if (!shuAkun) return fail("Akun SHU Tahun Berjalan (3.5) tidak ditemukan")

    // Ambil saldo per akun untuk membuat baris penutup
    const start = new Date(Date.UTC(tahun, 0, 1))
    const details = await prisma.keu_jurnal_detail.findMany({
      where: {
        akun: { jenis: { in: ["PENDAPATAN", "BEBAN"] } },
        jurnal: { status: "POSTED", tanggal: { gte: start, lte: end }, source_modul: { not: "tutup_buku" } },
      },
      include: { akun: { select: { id: true, kode: true, jenis: true, saldo_normal: true } } },
    })

    const byAkun = new Map<string, { id: bigint; saldo_normal: string; debit: number; kredit: number }>()
    for (const d of details) {
      const k = d.akun_id.toString()
      const e = byAkun.get(k) ?? { id: d.akun.id, saldo_normal: d.akun.saldo_normal, debit: 0, kredit: 0 }
      e.debit += Number(d.debit); e.kredit += Number(d.kredit)
      byAkun.set(k, e)
    }

    const jurnalDetails: { akun_id: bigint; urutan: number; keterangan: string; debit: number; kredit: number; created_at: Date; updated_at: Date }[] = []
    let urut = 0
    const now = new Date()
    for (const a of byAkun.values()) {
      const saldo = a.saldo_normal === "DEBIT" ? a.debit - a.kredit : a.kredit - a.debit
      if (Math.abs(saldo) < 0.01) continue
      // Untuk menutup: balik posisi normalnya
      if (a.saldo_normal === "KREDIT") {
        // Pendapatan → debit untuk menutup
        jurnalDetails.push({ akun_id: a.id, urutan: urut++, keterangan: "Penutup pendapatan", debit: saldo, kredit: 0, created_at: now, updated_at: now })
      } else {
        // Beban → kredit untuk menutup
        jurnalDetails.push({ akun_id: a.id, urutan: urut++, keterangan: "Penutup beban", debit: 0, kredit: saldo, created_at: now, updated_at: now })
      }
    }

    const shu = preview.data.shu
    // Baris penyeimbang ke SHU Tahun Berjalan
    if (shu >= 0) {
      jurnalDetails.push({ akun_id: shuAkun.id, urutan: urut++, keterangan: "SHU tahun berjalan", debit: 0, kredit: shu, created_at: now, updated_at: now })
    } else {
      jurnalDetails.push({ akun_id: shuAkun.id, urutan: urut++, keterangan: "Defisit tahun berjalan", debit: Math.abs(shu), kredit: 0, created_at: now, updated_at: now })
    }

    const totalDebit = jurnalDetails.reduce((s, d) => s + d.debit, 0)
    const totalKredit = jurnalDetails.reduce((s, d) => s + d.kredit, 0)
    if (Math.abs(totalDebit - totalKredit) > 0.01) return fail("Jurnal penutup tidak balance (kesalahan kalkulasi)")

    const nomor_jurnal = await generateNomor(end)
    const row = await prisma.keu_jurnal.create({
      data: {
        nomor_jurnal,
        tanggal: end,
        keterangan: `Jurnal Penutup Tahun ${tahun}`,
        jenis: "PENUTUP",
        status: "POSTED",
        periode_id: periode.id,
        source_modul: "tutup_buku",
        source_ref_id: `tutup_buku:${tahun}`,
        total_debit: totalDebit,
        total_kredit: totalKredit,
        dibuat_oleh: BigInt(auth.user.id),
        diposting_oleh: BigInt(auth.user.id),
        diposting_pada: new Date(),
        created_at: new Date(),
        updated_at: new Date(),
        details: { create: jurnalDetails },
      },
      select: { id: true, nomor_jurnal: true },
    })

    await writeAuditLog({ user: auth.user, action: "CREATE", modelType: "keu_jurnal", modelId: row.id, dataBaru: { nomor: row.nomor_jurnal, tutup_buku: tahun, shu } })
    revalidatePath("/dashboard/keuangan/tutup-buku")
    revalidatePath("/dashboard/keuangan/jurnal")
    return ok({ id: Number(row.id), nomor_jurnal: row.nomor_jurnal, shu })
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Gagal membuat jurnal penutup")
  }
}

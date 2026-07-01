import { NextRequest, NextResponse } from "next/server"
import { requireRole, type AppRole } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export const runtime = "nodejs"

const ALLOWED: AppRole[] = ["admin", "keuangan"]

/**
 * GET /api/keuangan/summary
 * Query params:
  *   type    = trial_balance | neraca | shu | kas_bank | buku_besar | arus_kas | perubahan_ekuitas
 *   tahun   = 2025
 *   bulan   = 1-12 (optional — jika tidak ada → seluruh tahun)
 *   periode_id (optional — alternatif dari tahun+bulan)
 *
 * Semua angka berdasarkan jurnal berstatus POSTED.
 */
export async function GET(req: NextRequest) {
  const auth = await requireRole(req, ALLOWED)
  if ("error" in auth) return auth.error

  const { searchParams } = new URL(req.url)
  const type = searchParams.get("type") ?? "trial_balance"
  const tahun = searchParams.get("tahun") ? parseInt(searchParams.get("tahun")!, 10) : new Date().getFullYear()
  const bulan = searchParams.get("bulan") ? parseInt(searchParams.get("bulan")!, 10) : null
  const periode_id = searchParams.get("periode_id")

  // ── Hitung range tanggal ──────────────────────────────────────
  let tgl_mulai: Date
  let tgl_selesai: Date

  if (periode_id) {
    const p = await prisma.keu_periode_fiskal.findUnique({ where: { id: BigInt(periode_id) } })
    if (!p) return NextResponse.json({ error: "Periode tidak ditemukan" }, { status: 404 })
    tgl_mulai = p.tgl_mulai
    tgl_selesai = p.tgl_selesai
  } else if (bulan) {
    tgl_mulai = new Date(Date.UTC(tahun, bulan - 1, 1))
    tgl_selesai = new Date(Date.UTC(tahun, bulan, 0))
  } else {
    tgl_mulai = new Date(Date.UTC(tahun, 0, 1))
    tgl_selesai = new Date(Date.UTC(tahun, 11, 31))
  }

  function saldoNormal(saldo_normal: string, debit: number, kredit: number) {
    return saldo_normal === "DEBIT" ? debit - kredit : kredit - debit
  }

  if (type === "buku_besar_summary") {
    const accounts = await prisma.keu_akun.findMany({
      where: { is_detail: true, is_active: true },
      select: { id: true, kode: true, nama: true, jenis: true, saldo_normal: true },
      orderBy: [{ kode: "asc" }],
    })
    const accountIds = accounts.map((a) => a.id)

    const [openingDetails, periodDetails] = await Promise.all([
      accountIds.length ? prisma.keu_jurnal_detail.findMany({
        where: { akun_id: { in: accountIds }, jurnal: { status: "POSTED", tanggal: { lt: tgl_mulai } } },
        select: { akun_id: true, debit: true, kredit: true },
      }) : [],
      accountIds.length ? prisma.keu_jurnal_detail.findMany({
        where: { akun_id: { in: accountIds }, jurnal: { status: "POSTED", tanggal: { gte: tgl_mulai, lte: tgl_selesai } } },
        select: { akun_id: true, debit: true, kredit: true },
      }) : [],
    ])

    const opening = new Map<string, { debit: number; kredit: number }>()
    for (const d of openingDetails) {
      const key = d.akun_id.toString()
      const row = opening.get(key) ?? { debit: 0, kredit: 0 }
      row.debit += Number(d.debit); row.kredit += Number(d.kredit)
      opening.set(key, row)
    }

    const period = new Map<string, { debit: number; kredit: number }>()
    for (const d of periodDetails) {
      const key = d.akun_id.toString()
      const row = period.get(key) ?? { debit: 0, kredit: 0 }
      row.debit += Number(d.debit); row.kredit += Number(d.kredit)
      period.set(key, row)
    }

    const rows = accounts.map((a) => {
      const o = opening.get(a.id.toString()) ?? { debit: 0, kredit: 0 }
      const p = period.get(a.id.toString()) ?? { debit: 0, kredit: 0 }
      const saldo_awal = saldoNormal(a.saldo_normal, o.debit, o.kredit)
      const mutasi = saldoNormal(a.saldo_normal, p.debit, p.kredit)
      return {
        akun_id: Number(a.id), kode: a.kode, nama: a.nama, jenis: a.jenis, saldo_normal: a.saldo_normal,
        saldo_awal, total_debit: p.debit, total_kredit: p.kredit, saldo_akhir: saldo_awal + mutasi,
      }
    }).filter((r) => Math.abs(r.saldo_awal) > 0.01 || r.total_debit > 0 || r.total_kredit > 0 || Math.abs(r.saldo_akhir) > 0.01)

    return NextResponse.json({
      type, tgl_mulai, tgl_selesai, rows,
      total_debit: rows.reduce((s, r) => s + r.total_debit, 0),
      total_kredit: rows.reduce((s, r) => s + r.total_kredit, 0),
    })
  }

  if (type === "buku_besar") {
    const akun_id = searchParams.get("akun_id")
    if (!akun_id) return NextResponse.json({ error: "akun_id wajib diisi" }, { status: 400 })

    const akun = await prisma.keu_akun.findUnique({ where: { id: BigInt(akun_id) } })
    if (!akun) return NextResponse.json({ error: "Akun tidak ditemukan" }, { status: 404 })

    const openingDetails = await prisma.keu_jurnal_detail.findMany({
      where: {
        akun_id: akun.id,
        jurnal: { status: "POSTED", tanggal: { lt: tgl_mulai } },
      },
    })
    const openingDebit = openingDetails.reduce((s, d) => s + Number(d.debit), 0)
    const openingKredit = openingDetails.reduce((s, d) => s + Number(d.kredit), 0)
    let running = saldoNormal(akun.saldo_normal, openingDebit, openingKredit)

    const rows = await prisma.keu_jurnal_detail.findMany({
      where: {
        akun_id: akun.id,
        jurnal: { status: "POSTED", tanggal: { gte: tgl_mulai, lte: tgl_selesai } },
      },
      include: { jurnal: { select: { tanggal: true, nomor_jurnal: true, keterangan: true, jenis: true, source_modul: true, source_ref_id: true } } },
      orderBy: [{ jurnal: { tanggal: "asc" } }, { jurnal: { nomor_jurnal: "asc" } }, { urutan: "asc" }],
    })

    const entries = rows.map((d) => {
      running += saldoNormal(akun.saldo_normal, Number(d.debit), Number(d.kredit))
      return {
        tanggal: d.jurnal.tanggal,
        nomor_jurnal: d.jurnal.nomor_jurnal,
        jenis: d.jurnal.jenis,
        keterangan: d.keterangan ?? d.jurnal.keterangan,
        source_modul: d.jurnal.source_modul,
        source_ref_id: d.jurnal.source_ref_id,
        debit: Number(d.debit),
        kredit: Number(d.kredit),
        saldo: running,
      }
    })

    return NextResponse.json({
      type, tgl_mulai, tgl_selesai,
      akun: { id: Number(akun.id), kode: akun.kode, nama: akun.nama, saldo_normal: akun.saldo_normal },
      saldo_awal: saldoNormal(akun.saldo_normal, openingDebit, openingKredit),
      saldo_akhir: running,
      rows: entries,
    })
  }

  if (type === "arus_kas") {
    const kasBank = await prisma.keu_akun.findMany({
      where: { kode: { in: ["1.1.1", "1.1.2"] }, is_active: true },
      select: { id: true, kode: true, nama: true, saldo_normal: true },
    })
    const ids = kasBank.map((a) => a.id)
    const openingDetails = ids.length ? await prisma.keu_jurnal_detail.findMany({
      where: { akun_id: { in: ids }, jurnal: { status: "POSTED", tanggal: { lt: tgl_mulai } } },
    }) : []
    const periodDetails = ids.length ? await prisma.keu_jurnal_detail.findMany({
      where: { akun_id: { in: ids }, jurnal: { status: "POSTED", tanggal: { gte: tgl_mulai, lte: tgl_selesai } } },
      include: { akun: { select: { kode: true, nama: true, saldo_normal: true } }, jurnal: { select: { tanggal: true, nomor_jurnal: true, keterangan: true } } },
      orderBy: [{ jurnal: { tanggal: "asc" } }, { jurnal: { nomor_jurnal: "asc" } }],
    }) : []

    const saldo_awal = openingDetails.reduce((s, d) => s + Number(d.debit) - Number(d.kredit), 0)
    const rows = periodDetails.map((d) => {
      const mutasi = Number(d.debit) - Number(d.kredit)
      return {
        tanggal: d.jurnal.tanggal,
        nomor_jurnal: d.jurnal.nomor_jurnal,
        akun: `${d.akun.kode} - ${d.akun.nama}`,
        keterangan: d.jurnal.keterangan,
        penerimaan: mutasi > 0 ? mutasi : 0,
        pengeluaran: mutasi < 0 ? Math.abs(mutasi) : 0,
        mutasi,
      }
    })
    const penerimaan = rows.reduce((s, r) => s + r.penerimaan, 0)
    const pengeluaran = rows.reduce((s, r) => s + r.pengeluaran, 0)
    const saldo_akhir = saldo_awal + penerimaan - pengeluaran

    return NextResponse.json({ type, tgl_mulai, tgl_selesai, saldo_awal, penerimaan, pengeluaran, saldo_akhir, rows })
  }

  if (type === "perubahan_ekuitas") {
    const equityDetails = await prisma.keu_jurnal_detail.findMany({
      where: {
        akun: { jenis: { in: ["EKUITAS", "PENDAPATAN", "BEBAN"] } },
        jurnal: { status: "POSTED", tanggal: { lte: tgl_selesai } },
      },
      include: { akun: { select: { kode: true, nama: true, jenis: true, kelompok: true, saldo_normal: true } }, jurnal: { select: { tanggal: true } } },
    })
    const before = equityDetails.filter((d) => d.jurnal.tanggal < tgl_mulai)
    const period = equityDetails.filter((d) => d.jurnal.tanggal >= tgl_mulai && d.jurnal.tanggal <= tgl_selesai)
    const sum = (rows: typeof equityDetails, jenis: string) => rows
      .filter((d) => d.akun.jenis === jenis)
      .reduce((s, d) => s + saldoNormal(d.akun.saldo_normal, Number(d.debit), Number(d.kredit)), 0)

    const ekuitas_awal = sum(before, "EKUITAS") + sum(before, "PENDAPATAN") - sum(before, "BEBAN")
    const tambahan_ekuitas = sum(period, "EKUITAS")
    const shu = sum(period, "PENDAPATAN") - sum(period, "BEBAN")
    const ekuitas_akhir = ekuitas_awal + tambahan_ekuitas + shu

    return NextResponse.json({ type, tgl_mulai, tgl_selesai, ekuitas_awal, tambahan_ekuitas, shu, ekuitas_akhir })
  }

  // Neraca adalah posisi pada tanggal tertentu, bukan aktivitas periode.
  const tanggalWhere = type === "neraca"
    ? { lte: tgl_selesai }
    : { gte: tgl_mulai, lte: tgl_selesai }

  // ── Ambil semua detail jurnal POSTED dalam range ──────────────
  const details = await prisma.keu_jurnal_detail.findMany({
    where: {
      jurnal: {
        status: "POSTED",
        tanggal: tanggalWhere,
      },
    },
    include: {
      akun: { select: { id: true, kode: true, nama: true, jenis: true, saldo_normal: true, kelompok: true, level: true, is_detail: true } },
    },
  })

  // ── Agregasi per akun ─────────────────────────────────────────
  const byAkun = new Map<string, {
    akun: typeof details[0]["akun"]
    total_debit: number
    total_kredit: number
  }>()

  for (const d of details) {
    const key = d.akun_id.toString()
    const existing = byAkun.get(key) ?? { akun: d.akun, total_debit: 0, total_kredit: 0 }
    existing.total_debit += Number(d.debit)
    existing.total_kredit += Number(d.kredit)
    byAkun.set(key, existing)
  }

  const akuns = Array.from(byAkun.values())

  // ── Fungsi helper: saldo normal ───────────────────────────────
  function saldoAkun(a: { total_debit: number; total_kredit: number; akun: { saldo_normal: string } }) {
    return a.akun.saldo_normal === "DEBIT"
      ? a.total_debit - a.total_kredit
      : a.total_kredit - a.total_debit
  }

  // ── Respon per tipe laporan ───────────────────────────────────
  if (type === "trial_balance") {
    const rows = akuns
      .map((a) => ({
        kode: a.akun.kode,
        nama: a.akun.nama,
        jenis: a.akun.jenis,
        saldo_normal: a.akun.saldo_normal,
        total_debit: a.total_debit,
        total_kredit: a.total_kredit,
        saldo: saldoAkun(a),
      }))
      .sort((a, b) => a.kode.localeCompare(b.kode))

    const total_debit = rows.reduce((s, r) => s + r.total_debit, 0)
    const total_kredit = rows.reduce((s, r) => s + r.total_kredit, 0)

    return NextResponse.json({ type, tgl_mulai, tgl_selesai, rows, total_debit, total_kredit })
  }

  if (type === "neraca") {
    // Aset, Kewajiban, Ekuitas
    const aset = akuns.filter((a) => a.akun.jenis === "ASET").reduce((s, a) => s + saldoAkun(a), 0)
    const kewajiban = akuns.filter((a) => a.akun.jenis === "KEWAJIBAN").reduce((s, a) => s + saldoAkun(a), 0)
    const ekuitasAkun = akuns.filter((a) => a.akun.jenis === "EKUITAS").reduce((s, a) => s + saldoAkun(a), 0)
    const pendapatanBerjalan = akuns.filter((a) => a.akun.jenis === "PENDAPATAN").reduce((s, a) => s + saldoAkun(a), 0)
    const bebanBerjalan = akuns.filter((a) => a.akun.jenis === "BEBAN").reduce((s, a) => s + saldoAkun(a), 0)
    const shuBerjalan = pendapatanBerjalan - bebanBerjalan
    const ekuitas = ekuitasAkun + shuBerjalan
    const simpanan_pokok = akuns.filter((a) => a.akun.kelompok === "Simpanan Pokok").reduce((s, a) => s + saldoAkun(a), 0)
    const simpanan_wajib = akuns.filter((a) => a.akun.kelompok === "Simpanan Wajib").reduce((s, a) => s + saldoAkun(a), 0)
    const shu = akuns.filter((a) => a.akun.kelompok === "SHU").reduce((s, a) => s + saldoAkun(a), 0)

    const aset_rows = akuns.filter((a) => a.akun.jenis === "ASET").map((a) => ({
      kode: a.akun.kode, nama: a.akun.nama, saldo: saldoAkun(a),
    })).sort((a, b) => a.kode.localeCompare(b.kode))

    const kewajiban_rows = akuns.filter((a) => a.akun.jenis === "KEWAJIBAN").map((a) => ({
      kode: a.akun.kode, nama: a.akun.nama, saldo: saldoAkun(a),
    })).sort((a, b) => a.kode.localeCompare(b.kode))

    const ekuitas_rows = akuns.filter((a) => a.akun.jenis === "EKUITAS").map((a) => ({
      kode: a.akun.kode, nama: a.akun.nama, saldo: saldoAkun(a), kelompok: a.akun.kelompok,
    })).sort((a, b) => a.kode.localeCompare(b.kode))
    if (Math.abs(shuBerjalan) > 0.01) {
      ekuitas_rows.push({ kode: "3.SHU", nama: "SHU Tahun Berjalan", saldo: shuBerjalan, kelompok: "SHU" })
    }

    return NextResponse.json({
      type, tgl_mulai, tgl_selesai,
      aset, kewajiban, ekuitas,
      simpanan_pokok, simpanan_wajib, shu: shu + shuBerjalan,
      shu_berjalan: shuBerjalan,
      aset_rows, kewajiban_rows, ekuitas_rows,
    })
  }

  if (type === "shu") {
    // SHU = Pendapatan - Beban
    const pendapatan = akuns.filter((a) => a.akun.jenis === "PENDAPATAN").reduce((s, a) => s + saldoAkun(a), 0)
    const beban = akuns.filter((a) => a.akun.jenis === "BEBAN").reduce((s, a) => s + saldoAkun(a), 0)
    const shu = pendapatan - beban

    const pendapatan_rows = akuns.filter((a) => a.akun.jenis === "PENDAPATAN").map((a) => ({
      kode: a.akun.kode, nama: a.akun.nama, saldo: saldoAkun(a),
    })).sort((a, b) => a.kode.localeCompare(b.kode))

    const beban_rows = akuns.filter((a) => a.akun.jenis === "BEBAN").map((a) => ({
      kode: a.akun.kode, nama: a.akun.nama, saldo: saldoAkun(a),
    })).sort((a, b) => a.kode.localeCompare(b.kode))

    return NextResponse.json({
      type, tgl_mulai, tgl_selesai,
      pendapatan, beban, shu,
      pendapatan_rows, beban_rows,
    })
  }

  if (type === "kas_bank") {
    const kas_bank = akuns
      .filter((a) => ["1.1.1", "1.1.2"].includes(a.akun.kode))
      .map((a) => ({ kode: a.akun.kode, nama: a.akun.nama, saldo: saldoAkun(a) }))
    const total = kas_bank.reduce((s, r) => s + r.saldo, 0)
    return NextResponse.json({ type, tgl_mulai, tgl_selesai, kas_bank, total })
  }

  return NextResponse.json({ error: "type tidak valid: trial_balance | neraca | shu | kas_bank | buku_besar | buku_besar_summary | arus_kas | perubahan_ekuitas" }, { status: 400 })
}

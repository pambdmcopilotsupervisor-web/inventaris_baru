"use server"

/**
 * Server Actions — Distribusi SHU (Sisa Hasil Usaha).
 * Mengalokasikan saldo SHU Tahun Berjalan (akun 3.5) ke pos-pos pembagian
 * sesuai AD/ART koperasi, lalu membuat jurnal distribusi (POSTED).
 *
 *   Debit  3.5 SHU Tahun Berjalan  (sebesar total SHU)
 *   Kredit akun pos alokasi        (cadangan/dana-dana, sesuai persentase)
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

const SHU_BERJALAN_KODE = "3.5"

/** Pos default distribusi SHU (dapat disesuaikan di UI). */
const DEFAULT_POS: { nama_pos: string; kode: string; persen: number }[] = [
  { nama_pos: "Dana Cadangan", kode: "3.3", persen: 25 },
  { nama_pos: "SHU Bagian Anggota", kode: "2.3.1", persen: 40 },
  { nama_pos: "Dana Pengurus & Pengawas", kode: "2.3.2", persen: 10 },
  { nama_pos: "Dana Pendidikan", kode: "2.3.3", persen: 10 },
  { nama_pos: "Dana Kesejahteraan Pegawai", kode: "2.3.4", persen: 5 },
  { nama_pos: "Dana Sosial", kode: "2.3.5", persen: 5 },
  { nama_pos: "Dana Pembangunan Daerah Kerja", kode: "2.3.6", persen: 5 },
]

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

export type ShuPos = { nama_pos: string; akun_id: number; kode: string; nama_akun: string; persen: number; jumlah: number }
export type ShuConfig = {
  tahun: number
  total_shu: number
  already_distributed: boolean
  jurnal_nomor: string | null
  pos: ShuPos[]
}

/** Hitung saldo SHU 3.5 untuk tahun & susun pos default. */
export async function getShuConfig(tahun: number): Promise<ActionResult<ShuConfig>> {
  try {
    const end = new Date(Date.UTC(tahun, 11, 31))
    const shuAkun = await prisma.keu_akun.findUnique({ where: { kode: SHU_BERJALAN_KODE } })
    if (!shuAkun) return fail("Akun SHU Tahun Berjalan (3.5) tidak ditemukan")

    // Saldo 3.5 (kredit normal) sampai akhir tahun
    const agg = await prisma.keu_jurnal_detail.aggregate({
      where: { akun_id: shuAkun.id, jurnal: { status: "POSTED", tanggal: { lte: end } } },
      _sum: { debit: true, kredit: true },
    })
    const total_shu = Number(agg._sum.kredit ?? 0) - Number(agg._sum.debit ?? 0)

    const existing = await prisma.keu_shu_run.findUnique({
      where: { tahun }, include: { jurnal: { select: { nomor_jurnal: true } }, alokasi: { include: { akun: { select: { kode: true, nama: true } } } } },
    })

    if (existing && existing.status === "POSTED") {
      const pos: ShuPos[] = existing.alokasi.map((a) => ({
        nama_pos: a.nama_pos, akun_id: Number(a.akun_id), kode: a.akun.kode, nama_akun: a.akun.nama,
        persen: Number(a.persen), jumlah: Number(a.jumlah),
      }))
      return ok({ tahun, total_shu: Number(existing.total_shu), already_distributed: true, jurnal_nomor: existing.jurnal?.nomor_jurnal ?? null, pos })
    }

    // Susun pos default
    const akuns = await prisma.keu_akun.findMany({ where: { kode: { in: DEFAULT_POS.map((p) => p.kode) } }, select: { id: true, kode: true, nama: true } })
    const byKode = new Map(akuns.map((a) => [a.kode, a]))
    const pos: ShuPos[] = DEFAULT_POS.filter((p) => byKode.has(p.kode)).map((p) => {
      const a = byKode.get(p.kode)!
      return { nama_pos: p.nama_pos, akun_id: Number(a.id), kode: a.kode, nama_akun: a.nama, persen: p.persen, jumlah: Math.round(total_shu * p.persen / 100) }
    })

    return ok({ tahun, total_shu, already_distributed: false, jurnal_nomor: null, pos })
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Gagal memuat konfigurasi SHU")
  }
}

export async function createShuDistribution(payload: {
  tahun: number
  tanggal: string
  pos: { nama_pos: string; akun_id: number; persen: number; jumlah: number }[]
}): Promise<ActionResult<{ id: number; nomor_jurnal: string }>> {
  const auth = await requireKeuanganRole()
  if ("error" in auth) return fail(auth.error)

  try {
    const cfg = await getShuConfig(payload.tahun)
    if (!cfg.success) return fail(cfg.error)
    if (cfg.data.already_distributed) return fail(`SHU tahun ${payload.tahun} sudah didistribusikan`)
    if (cfg.data.total_shu <= 0) return fail("Tidak ada SHU untuk didistribusikan. Lakukan tutup buku dulu.")

    const totalAlokasi = payload.pos.reduce((s, p) => s + (p.jumlah || 0), 0)
    if (Math.abs(totalAlokasi - cfg.data.total_shu) > 1) {
      return fail(`Total alokasi (${totalAlokasi.toLocaleString("id-ID")}) harus sama dengan total SHU (${cfg.data.total_shu.toLocaleString("id-ID")})`)
    }
    const valid = payload.pos.filter((p) => p.akun_id && p.jumlah > 0)
    if (valid.length === 0) return fail("Tidak ada pos alokasi yang valid")

    const tanggal = new Date(payload.tanggal)
    const periode = await prisma.keu_periode_fiskal.findFirst({
      where: { status: "BUKA", tgl_mulai: { lte: tanggal }, tgl_selesai: { gte: tanggal } },
    })
    if (!periode) return fail("Periode fiskal terbuka untuk tanggal distribusi tidak ditemukan")

    const shuAkun = await prisma.keu_akun.findUnique({ where: { kode: SHU_BERJALAN_KODE } })
    if (!shuAkun) return fail("Akun SHU Tahun Berjalan tidak ditemukan")

    const now = new Date()
    const details: { akun_id: bigint; urutan: number; keterangan: string; debit: number; kredit: number; created_at: Date; updated_at: Date }[] = []
    details.push({ akun_id: shuAkun.id, urutan: 0, keterangan: `Distribusi SHU ${payload.tahun}`, debit: totalAlokasi, kredit: 0, created_at: now, updated_at: now })
    valid.forEach((p, i) => {
      details.push({ akun_id: BigInt(p.akun_id), urutan: i + 1, keterangan: p.nama_pos, debit: 0, kredit: p.jumlah, created_at: now, updated_at: now })
    })

    const nomor_jurnal = await generateNomor(tanggal)

    const result = await prisma.$transaction(async (tx) => {
      const jurnal = await tx.keu_jurnal.create({
        data: {
          nomor_jurnal, tanggal,
          keterangan: `Distribusi SHU Tahun ${payload.tahun}`,
          jenis: "PENUTUP", status: "POSTED", periode_id: periode.id,
          source_modul: "shu_distribusi", source_ref_id: `shu:${payload.tahun}`,
          total_debit: totalAlokasi, total_kredit: totalAlokasi,
          dibuat_oleh: BigInt(auth.user.id), diposting_oleh: BigInt(auth.user.id), diposting_pada: now,
          created_at: now, updated_at: now,
          details: { create: details },
        },
        select: { id: true, nomor_jurnal: true },
      })

      const run = await tx.keu_shu_run.upsert({
        where: { tahun: payload.tahun },
        create: {
          tahun: payload.tahun, total_shu: cfg.data.total_shu, tanggal, status: "POSTED",
          jurnal_id: jurnal.id, dibuat_oleh: BigInt(auth.user.id), created_at: now, updated_at: now,
        },
        update: { total_shu: cfg.data.total_shu, tanggal, status: "POSTED", jurnal_id: jurnal.id, updated_at: now },
        select: { id: true },
      })

      await tx.keu_shu_alokasi.deleteMany({ where: { run_id: run.id } })
      await tx.keu_shu_alokasi.createMany({
        data: valid.map((p, i) => ({
          run_id: run.id, nama_pos: p.nama_pos, persen: p.persen, jumlah: p.jumlah, akun_id: BigInt(p.akun_id), urutan: i, created_at: now, updated_at: now,
        })),
      })
      return { id: Number(run.id), nomor_jurnal: jurnal.nomor_jurnal }
    })

    await writeAuditLog({ user: auth.user, action: "CREATE", modelType: "keu_shu_run", modelId: result.id, dataBaru: { tahun: payload.tahun, total: totalAlokasi } })
    revalidatePath("/dashboard/keuangan/shu-distribusi")
    revalidatePath("/dashboard/keuangan/jurnal")
    return ok(result)
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Gagal mendistribusikan SHU")
  }
}

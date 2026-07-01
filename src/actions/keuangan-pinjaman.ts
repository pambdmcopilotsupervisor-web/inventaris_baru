"use server"

import { revalidatePath } from "next/cache"
import { prisma, serialize } from "@/lib/prisma"
import { getSession, type SessionUser } from "@/lib/session"
import { writeAuditLog } from "@/lib/audit"

export type ActionResult<T> =
  | { success: true; data: T; error: null }
  | { success: false; data: null; error: string }

function ok<T>(data: T): ActionResult<T> { return { success: true, data, error: null } }
function fail(error: string): ActionResult<never> { return { success: false, data: null, error } }

const PAGE_PATH = "/dashboard/keuangan/pinjaman"
const AKUN_PIUTANG = "1.1.3"
const AKUN_KAS = "1.1.1"
const AKUN_PENDAPATAN_JASA = "4.2.2"

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

async function generateNomorPinjaman(tanggal: Date): Promise<string> {
  const ym = `${tanggal.getFullYear()}${String(tanggal.getMonth() + 1).padStart(2, "0")}`
  const last = await prisma.keu_pinjaman.findFirst({
    where: { nomor_pinjaman: { startsWith: `PJM-${ym}-` } },
    orderBy: { nomor_pinjaman: "desc" },
    select: { nomor_pinjaman: true },
  })
  const seq = last ? (parseInt(last.nomor_pinjaman.split("-").at(-1) ?? "0", 10) || 0) + 1 : 1
  return `PJM-${ym}-${String(seq).padStart(4, "0")}`
}

async function generateNomorJurnal(tanggal: Date): Promise<string> {
  const ym = `${tanggal.getFullYear()}${String(tanggal.getMonth() + 1).padStart(2, "0")}`
  const last = await prisma.keu_jurnal.findFirst({
    where: { nomor_jurnal: { startsWith: `JK-${ym}-` } },
    orderBy: { nomor_jurnal: "desc" },
    select: { nomor_jurnal: true },
  })
  const seq = last ? (parseInt(last.nomor_jurnal.split("-").at(-1) ?? "0", 10) || 0) + 1 : 1
  return `JK-${ym}-${String(seq).padStart(4, "0")}`
}

export type PinjamanAnggotaRow = {
  id: number
  anggota_id: number
  nomor_pinjaman: string
  tanggal: string
  nama: string
  no_anggota: string
  pokok: number
  jasa: number
  tenor_bulan: number
  angsuran_pokok: number
  angsuran_jasa: number
  status: "AKTIF" | "LUNAS" | "BATAL"
  keterangan: string | null
  paid_pokok: number
  paid_jasa: number
  sisa_pokok: number
  jurnal_nomor: string | null
}

export async function getPinjamanAnggota(): Promise<ActionResult<PinjamanAnggotaRow[]>> {
  try {
    const rows = await prisma.keu_pinjaman.findMany({
      include: {
        anggota: { select: { no_anggota: true, nama: true } },
        pembayaran: { select: { pokok: true, jasa: true } },
        jurnal_cair: { select: { nomor_jurnal: true } },
      },
      orderBy: [{ status: "asc" }, { tanggal: "desc" }, { id: "desc" }],
    })
    return ok(rows.map((r) => {
      const paid_pokok = r.pembayaran.reduce((s, p) => s + Number(p.pokok), 0)
      const paid_jasa = r.pembayaran.reduce((s, p) => s + Number(p.jasa), 0)
      const pokok = Number(r.pokok)
      return {
        id: Number(r.id), anggota_id: Number(r.anggota_id), nomor_pinjaman: r.nomor_pinjaman,
        tanggal: r.tanggal.toISOString(), nama: r.anggota.nama, no_anggota: r.anggota.no_anggota,
        pokok, jasa: Number(r.jasa), tenor_bulan: r.tenor_bulan,
        angsuran_pokok: Number(r.angsuran_pokok), angsuran_jasa: Number(r.angsuran_jasa),
        status: r.status as "AKTIF" | "LUNAS" | "BATAL", keterangan: r.keterangan,
        paid_pokok, paid_jasa, sisa_pokok: Math.max(0, pokok - paid_pokok),
        jurnal_nomor: r.jurnal_cair?.nomor_jurnal ?? null,
      }
    }))
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Gagal memuat pinjaman anggota")
  }
}

export async function createPinjamanAnggota(payload: {
  anggota_id: number
  tanggal: string
  pokok: number
  jasa?: number
  tenor_bulan: number
  angsuran_pokok?: number
  angsuran_jasa?: number
  keterangan?: string
}): Promise<ActionResult<{ id: number; nomor_pinjaman: string; nomor_jurnal: string }>> {
  const auth = await requireKeuanganRole()
  if ("error" in auth) return fail(auth.error)
  if (!payload.anggota_id) return fail("Pilih anggota")
  if (!payload.pokok || payload.pokok <= 0) return fail("Pokok pinjaman harus lebih dari nol")

  try {
    const tanggal = new Date(payload.tanggal)
    if (Number.isNaN(tanggal.getTime())) return fail("Tanggal tidak valid")
    const anggota = await prisma.keu_anggota.findUnique({ where: { id: BigInt(payload.anggota_id) } })
    if (!anggota) return fail("Anggota tidak ditemukan")
    const periode = await prisma.keu_periode_fiskal.findFirst({ where: { status: "BUKA", tgl_mulai: { lte: tanggal }, tgl_selesai: { gte: tanggal } } })
    if (!periode) return fail("Periode fiskal terbuka untuk tanggal tersebut tidak ditemukan")

    const [akunPiutang, akunKas] = await Promise.all([
      prisma.keu_akun.findUnique({ where: { kode: AKUN_PIUTANG } }),
      prisma.keu_akun.findUnique({ where: { kode: AKUN_KAS } }),
    ])
    if (!akunPiutang) return fail(`Akun piutang anggota ${AKUN_PIUTANG} tidak ditemukan`)
    if (!akunKas) return fail(`Akun kas ${AKUN_KAS} tidak ditemukan`)

    const now = new Date()
    const nomor_pinjaman = await generateNomorPinjaman(tanggal)
    const nomor_jurnal = await generateNomorJurnal(tanggal)
    const tenor = Math.max(1, Number(payload.tenor_bulan || 1))
    const angsuranPokok = payload.angsuran_pokok && payload.angsuran_pokok > 0 ? payload.angsuran_pokok : Math.ceil(payload.pokok / tenor)
    const angsuranJasa = payload.angsuran_jasa ?? Math.ceil(Number(payload.jasa ?? 0) / tenor)

    const result = await prisma.$transaction(async (tx) => {
      const jurnal = await tx.keu_jurnal.create({
        data: {
          nomor_jurnal, tanggal, keterangan: `Pencairan pinjaman ${nomor_pinjaman} - ${anggota.no_anggota} ${anggota.nama}`,
          jenis: "KHUSUS", status: "POSTED", periode_id: periode.id, source_modul: "pinjaman",
          total_debit: payload.pokok, total_kredit: payload.pokok,
          dibuat_oleh: BigInt(auth.user.id), diposting_oleh: BigInt(auth.user.id), diposting_pada: now,
          created_at: now, updated_at: now,
          details: { create: [
            { akun_id: akunPiutang.id, urutan: 0, keterangan: `Piutang anggota ${nomor_pinjaman}`, debit: payload.pokok, kredit: 0, created_at: now, updated_at: now },
            { akun_id: akunKas.id, urutan: 1, keterangan: `Kas keluar pinjaman ${nomor_pinjaman}`, debit: 0, kredit: payload.pokok, created_at: now, updated_at: now },
          ] },
        },
        select: { id: true, nomor_jurnal: true },
      })
      const pinjaman = await tx.keu_pinjaman.create({
        data: {
          anggota_id: BigInt(payload.anggota_id), nomor_pinjaman, tanggal,
          pokok: payload.pokok, jasa: payload.jasa ?? 0, tenor_bulan: tenor,
          angsuran_pokok: angsuranPokok, angsuran_jasa: angsuranJasa,
          status: "AKTIF", keterangan: payload.keterangan || null,
          akun_kas_id: akunKas.id, jurnal_cair_id: jurnal.id, dibuat_oleh: BigInt(auth.user.id),
          created_at: now, updated_at: now,
        },
        select: { id: true, nomor_pinjaman: true },
      })
      await tx.keu_jurnal.update({ where: { id: jurnal.id }, data: { source_ref_id: `pinjaman:${pinjaman.id}` } })
      return { id: Number(pinjaman.id), nomor_pinjaman: pinjaman.nomor_pinjaman, nomor_jurnal: jurnal.nomor_jurnal }
    })

    await writeAuditLog({ user: auth.user, action: "CREATE", modelType: "keu_pinjaman", modelId: result.id, dataBaru: result })
    revalidatePath(PAGE_PATH); revalidatePath("/dashboard/keuangan/jurnal"); revalidatePath("/dashboard/keuangan/buku-pembantu")
    return ok(result)
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Gagal membuat pinjaman anggota")
  }
}

export async function createPembayaranPinjaman(payload: {
  pinjaman_id: number
  tanggal: string
  pokok: number
  jasa?: number
  keterangan?: string
}): Promise<ActionResult<{ id: number; nomor_jurnal: string; status: string }>> {
  const auth = await requireKeuanganRole()
  if ("error" in auth) return fail(auth.error)
  if (!payload.pinjaman_id) return fail("Pilih pinjaman")
  if ((payload.pokok ?? 0) <= 0 && (payload.jasa ?? 0) <= 0) return fail("Isi pokok atau jasa pembayaran")

  try {
    const tanggal = new Date(payload.tanggal)
    if (Number.isNaN(tanggal.getTime())) return fail("Tanggal tidak valid")
    const pinjaman = await prisma.keu_pinjaman.findUnique({
      where: { id: BigInt(payload.pinjaman_id) },
      include: { anggota: true, pembayaran: { select: { pokok: true } } },
    })
    if (!pinjaman) return fail("Pinjaman tidak ditemukan")
    if (pinjaman.status !== "AKTIF") return fail("Hanya pinjaman aktif yang bisa dibayar")
    const paidPokok = pinjaman.pembayaran.reduce((s, p) => s + Number(p.pokok), 0)
    const sisaPokok = Number(pinjaman.pokok) - paidPokok
    if (payload.pokok > sisaPokok) return fail(`Pembayaran pokok melebihi sisa pinjaman (${sisaPokok.toLocaleString("id-ID")})`)

    const periode = await prisma.keu_periode_fiskal.findFirst({ where: { status: "BUKA", tgl_mulai: { lte: tanggal }, tgl_selesai: { gte: tanggal } } })
    if (!periode) return fail("Periode fiskal terbuka untuk tanggal tersebut tidak ditemukan")
    const [akunPiutang, akunKas, akunJasa] = await Promise.all([
      prisma.keu_akun.findUnique({ where: { kode: AKUN_PIUTANG } }),
      prisma.keu_akun.findUnique({ where: { kode: AKUN_KAS } }),
      prisma.keu_akun.findUnique({ where: { kode: AKUN_PENDAPATAN_JASA } }),
    ])
    if (!akunPiutang || !akunKas) return fail("Akun kas/piutang anggota tidak lengkap")
    if ((payload.jasa ?? 0) > 0 && !akunJasa) return fail(`Akun pendapatan jasa ${AKUN_PENDAPATAN_JASA} tidak ditemukan`)

    const now = new Date()
    const total = payload.pokok + (payload.jasa ?? 0)
    const nomor_jurnal = await generateNomorJurnal(tanggal)
    const result = await prisma.$transaction(async (tx) => {
      const details = [
        { akun_id: akunKas.id, urutan: 0, keterangan: `Pembayaran pinjaman ${pinjaman.nomor_pinjaman}`, debit: total, kredit: 0, created_at: now, updated_at: now },
        { akun_id: akunPiutang.id, urutan: 1, keterangan: `Angsuran pokok ${pinjaman.nomor_pinjaman}`, debit: 0, kredit: payload.pokok, created_at: now, updated_at: now },
      ]
      if ((payload.jasa ?? 0) > 0 && akunJasa) {
        details.push({ akun_id: akunJasa.id, urutan: 2, keterangan: `Jasa pinjaman ${pinjaman.nomor_pinjaman}`, debit: 0, kredit: payload.jasa ?? 0, created_at: now, updated_at: now })
      }
      const jurnal = await tx.keu_jurnal.create({
        data: {
          nomor_jurnal, tanggal, keterangan: `Pembayaran pinjaman ${pinjaman.nomor_pinjaman} - ${pinjaman.anggota.nama}`,
          jenis: "KHUSUS", status: "POSTED", periode_id: periode.id, source_modul: "pinjaman_bayar",
          total_debit: total, total_kredit: total,
          dibuat_oleh: BigInt(auth.user.id), diposting_oleh: BigInt(auth.user.id), diposting_pada: now,
          created_at: now, updated_at: now, details: { create: details },
        },
        select: { id: true, nomor_jurnal: true },
      })
      const bayar = await tx.keu_pinjaman_pembayaran.create({
        data: {
          pinjaman_id: pinjaman.id, tanggal, pokok: payload.pokok, jasa: payload.jasa ?? 0,
          keterangan: payload.keterangan || null, jurnal_id: jurnal.id, dibuat_oleh: BigInt(auth.user.id),
          created_at: now, updated_at: now,
        },
        select: { id: true },
      })
      const status = payload.pokok >= sisaPokok ? "LUNAS" : "AKTIF"
      if (status === "LUNAS") await tx.keu_pinjaman.update({ where: { id: pinjaman.id }, data: { status, updated_at: now } })
      await tx.keu_jurnal.update({ where: { id: jurnal.id }, data: { source_ref_id: `pinjaman_bayar:${bayar.id}` } })
      return { id: Number(bayar.id), nomor_jurnal: jurnal.nomor_jurnal, status }
    })

    await writeAuditLog({ user: auth.user, action: "CREATE", modelType: "keu_pinjaman_pembayaran", modelId: result.id, dataBaru: result })
    revalidatePath(PAGE_PATH); revalidatePath("/dashboard/keuangan/jurnal"); revalidatePath("/dashboard/keuangan/buku-pembantu")
    return ok(result)
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Gagal menyimpan pembayaran pinjaman")
  }
}

export async function getPembayaranPinjaman(pinjaman_id: number) {
  try {
    const rows = await prisma.keu_pinjaman_pembayaran.findMany({
      where: { pinjaman_id: BigInt(pinjaman_id) },
      include: { jurnal: { select: { nomor_jurnal: true } } },
      orderBy: [{ tanggal: "desc" }, { id: "desc" }],
    })
    return ok(serialize(rows))
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Gagal memuat pembayaran pinjaman")
  }
}

"use server"

/**
 * Server Actions — Modul Keuangan: Periode Fiskal
 */

import { revalidatePath } from "next/cache"
import { prisma, serialize } from "@/lib/prisma"
import { getSession, type SessionUser } from "@/lib/session"
import { writeAuditLog } from "@/lib/audit"

const PAGE_PATH = "/dashboard/keuangan/periode-fiskal"

export type ActionResult<T> =
  | { success: true; data: T; error: null }
  | { success: false; data: null; error: string }

function ok<T>(data: T): ActionResult<T> {
  return { success: true, data, error: null }
}
function fail(error: string): ActionResult<never> {
  return { success: false, data: null, error }
}

export type PeriodeFiskalRow = {
  id: number
  tahun: number
  bulan: number
  nama: string
  tgl_mulai: string
  tgl_selesai: string
  status: "BUKA" | "TUTUP" | "KUNCI"
  catatan: string | null
  ditutup_oleh: number | null
  ditutup_pada: string | null
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

export async function getPeriodeFiskal(): Promise<ActionResult<PeriodeFiskalRow[]>> {
  try {
    const rows = await prisma.keu_periode_fiskal.findMany({
      orderBy: [{ tahun: "desc" }, { bulan: "desc" }],
    })
    return ok(serialize(rows) as unknown as PeriodeFiskalRow[])
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Gagal memuat periode fiskal")
  }
}

export async function createPeriodeFiskal(payload: {
  tahun: number
  bulan: number
  catatan?: string
}): Promise<ActionResult<PeriodeFiskalRow>> {
  const auth = await requireKeuanganRole()
  if ("error" in auth) return fail(auth.error)

  const MONTHS = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"]
  const { tahun, bulan } = payload

  if (bulan < 1 || bulan > 12) return fail("Bulan tidak valid (1-12)")

  // Hitung tanggal awal dan akhir bulan (UTC agar konsisten dengan kolom @db.Date)
  const tgl_mulai = new Date(Date.UTC(tahun, bulan - 1, 1))
  const tgl_selesai = new Date(Date.UTC(tahun, bulan, 0)) // akhir bulan

  try {
    const row = await prisma.keu_periode_fiskal.create({
      data: {
        tahun,
        bulan,
        nama: `${MONTHS[bulan - 1]} ${tahun}`,
        tgl_mulai,
        tgl_selesai,
        status: "BUKA",
        catatan: payload.catatan ?? null,
        created_at: new Date(),
        updated_at: new Date(),
      },
    })
    await writeAuditLog({ user: auth.user, action: "CREATE", modelType: "keu_periode_fiskal", modelId: row.id, dataBaru: { nama: row.nama } })
    revalidatePath(PAGE_PATH)
    return ok(serialize(row) as unknown as PeriodeFiskalRow)
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Gagal membuat periode fiskal")
  }
}

export async function updateStatusPeriode(
  id: number,
  status: "BUKA" | "TUTUP" | "KUNCI"
): Promise<ActionResult<PeriodeFiskalRow>> {
  const auth = await requireKeuanganRole()
  if ("error" in auth) return fail(auth.error)

  try {
    const existing = await prisma.keu_periode_fiskal.findUnique({ where: { id: BigInt(id) } })
    if (!existing) return fail("Periode tidak ditemukan")

    // Validasi transisi status: BUKA → TUTUP → KUNCI (tidak bisa mundur)
    const order = { BUKA: 0, TUTUP: 1, KUNCI: 2 }
    if (order[status] < order[existing.status as keyof typeof order]) {
      return fail(`Tidak dapat mengubah status dari ${existing.status} ke ${status}`)
    }
    if (order[status] > order[existing.status as keyof typeof order] + 1) {
      return fail("Status periode harus ditutup bertahap: BUKA → TUTUP → KUNCI")
    }

    if (status === "TUTUP" || status === "KUNCI") {
      const draftCount = await prisma.keu_jurnal.count({
        where: { periode_id: existing.id, status: "DRAFT" },
      })
      if (draftCount > 0) {
        return fail(`Masih ada ${draftCount} jurnal DRAFT pada periode ini. Posting atau hapus draft sebelum menutup/mengunci periode.`)
      }

      const totals = await prisma.keu_jurnal_detail.aggregate({
        where: { jurnal: { periode_id: existing.id, status: "POSTED" } },
        _sum: { debit: true, kredit: true },
      })
      const totalDebit = Number(totals._sum.debit ?? 0)
      const totalKredit = Number(totals._sum.kredit ?? 0)
      if (Math.abs(totalDebit - totalKredit) > 0.01) {
        return fail(`Periode tidak balance: total debit ${totalDebit.toLocaleString("id-ID")} dan kredit ${totalKredit.toLocaleString("id-ID")}`)
      }
    }

    const row = await prisma.keu_periode_fiskal.update({
      where: { id: BigInt(id) },
      data: {
        status,
        ...(status !== "BUKA" ? {
          ditutup_oleh: BigInt(auth.user.id),
          ditutup_pada: new Date(),
        } : {}),
        updated_at: new Date(),
      },
    })
    await writeAuditLog({ user: auth.user, action: "UPDATE", modelType: "keu_periode_fiskal", modelId: BigInt(id), dataBaru: { status } })
    revalidatePath(PAGE_PATH)
    return ok(serialize(row) as unknown as PeriodeFiskalRow)
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Gagal memperbarui status periode")
  }
}

/** Cari periode aktif (status BUKA) untuk tanggal tertentu */
export async function findPeriodeAktif(tanggal?: Date): Promise<ActionResult<PeriodeFiskalRow | null>> {
  try {
    const tgl = tanggal ?? new Date()
    const row = await prisma.keu_periode_fiskal.findFirst({
      where: {
        status: "BUKA",
        tgl_mulai: { lte: tgl },
        tgl_selesai: { gte: tgl },
      },
    })
    return ok(row ? (serialize(row) as unknown as PeriodeFiskalRow) : null)
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Gagal mencari periode aktif")
  }
}

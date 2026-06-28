"use server"

/**
 * Server Action — Saldo Awal / Neraca Pembukaan.
 * Membuat satu jurnal pembukaan (POSTED) berisi saldo awal tiap akun.
 * Total debit harus sama dengan total kredit (Aset = Kewajiban + Ekuitas).
 */

import { revalidatePath } from "next/cache"
import { prisma, serialize } from "@/lib/prisma"
import { getSession, type SessionUser } from "@/lib/session"
import { writeAuditLog } from "@/lib/audit"
import { validateJurnalInput } from "@/lib/keuangan/jurnal"

const PAGE_PATH = "/dashboard/keuangan/saldo-awal"

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

async function generateNomor(tanggal: Date): Promise<string> {
  const ym = `${tanggal.getFullYear()}${String(tanggal.getMonth() + 1).padStart(2, "0")}`
  const last = await prisma.keu_jurnal.findFirst({
    where: { nomor_jurnal: { startsWith: `JU-${ym}-` } },
    orderBy: { nomor_jurnal: "desc" },
    select: { nomor_jurnal: true },
  })
  let seq = 1
  if (last) {
    const parts = last.nomor_jurnal.split("-")
    seq = (parseInt(parts[parts.length - 1], 10) || 0) + 1
  }
  return `JU-${ym}-${String(seq).padStart(4, "0")}`
}

export type SaldoAwalLine = { akun_id: number; debit: number; kredit: number }

/** Cek apakah saldo awal sudah pernah dibuat. */
export async function getSaldoAwalStatus(): Promise<ActionResult<{ exists: boolean; nomor_jurnal: string | null }>> {
  try {
    const existing = await prisma.keu_jurnal.findFirst({
      where: { source_modul: "saldo_awal" },
      orderBy: { created_at: "desc" },
      select: { nomor_jurnal: true },
    })
    return ok({ exists: !!existing, nomor_jurnal: existing?.nomor_jurnal ?? null })
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Gagal memeriksa saldo awal")
  }
}

export async function createSaldoAwal(payload: {
  periode_id: number
  tanggal: string
  lines: SaldoAwalLine[]
}): Promise<ActionResult<{ id: number; nomor_jurnal: string }>> {
  const auth = await requireKeuanganRole()
  if ("error" in auth) return fail(auth.error)

  const details = payload.lines
    .filter((l) => l.akun_id && (l.debit > 0 || l.kredit > 0))
    .map((l, i) => ({
      akun_id: l.akun_id,
      keterangan: "Saldo awal",
      debit: l.debit || 0,
      kredit: l.kredit || 0,
      urutan: i,
    }))

  if (details.length < 2) return fail("Minimal 2 akun memiliki saldo awal")

  try {
    const validated = await validateJurnalInput({
      tanggal: payload.tanggal,
      periode_id: payload.periode_id,
      jenis: "UMUM",
      details,
    })
    const nomor_jurnal = await generateNomor(validated.tanggal)

    const row = await prisma.keu_jurnal.create({
      data: {
        nomor_jurnal,
        tanggal: validated.tanggal,
        keterangan: "Saldo Awal / Neraca Pembukaan",
        jenis: "UMUM",
        status: "POSTED",
        periode_id: BigInt(payload.periode_id),
        source_modul: "saldo_awal",
        source_ref_id: `saldo_awal:${validated.tanggal.getFullYear()}`,
        total_debit: validated.totalDebit,
        total_kredit: validated.totalKredit,
        dibuat_oleh: BigInt(auth.user.id),
        diposting_oleh: BigInt(auth.user.id),
        diposting_pada: new Date(),
        created_at: new Date(),
        updated_at: new Date(),
        details: { create: validated.details },
      },
      select: { id: true, nomor_jurnal: true },
    })

    await writeAuditLog({ user: auth.user, action: "CREATE", modelType: "keu_jurnal", modelId: row.id, dataBaru: { nomor: row.nomor_jurnal, saldo_awal: true } })
    revalidatePath(PAGE_PATH)
    revalidatePath("/dashboard/keuangan/jurnal")
    return ok({ id: Number(row.id), nomor_jurnal: row.nomor_jurnal })
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Gagal menyimpan saldo awal")
  }
}

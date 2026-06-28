import { prisma } from "@/lib/prisma"

export type JurnalDetailInput = {
  akun_id: number
  keterangan?: string
  debit?: number
  kredit?: number
  urutan?: number
}

export type ValidatedJurnalDetail = {
  akun_id: bigint
  urutan: number
  keterangan: string | null
  debit: number
  kredit: number
  created_at: Date
  updated_at: Date
}

export type ValidatedJurnal = {
  tanggal: Date
  totalDebit: number
  totalKredit: number
  details: ValidatedJurnalDetail[]
}

function parseAmount(value: number | undefined): number {
  const n = Number(value ?? 0)
  return Number.isFinite(n) ? n : Number.NaN
}

function dateOnly(value: Date): Date {
  // Normalisasi ke UTC midnight agar konsisten dengan kolom MySQL @db.Date (pakai UTC).
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()))
}

export async function validateJurnalInput(payload: {
  tanggal: string | Date
  periode_id: number | bigint
  jenis?: string
  details: JurnalDetailInput[]
}): Promise<ValidatedJurnal> {
  const tanggal = payload.tanggal instanceof Date ? payload.tanggal : new Date(payload.tanggal)
  if (Number.isNaN(tanggal.getTime())) throw new Error("Tanggal jurnal tidak valid")

  const periode = await prisma.keu_periode_fiskal.findUnique({
    where: { id: BigInt(payload.periode_id) },
  })
  if (!periode) throw new Error("Periode fiskal tidak ditemukan")
  if (periode.status === "KUNCI") throw new Error("Periode sudah dikunci")
  if (periode.status === "TUTUP") throw new Error("Periode sudah ditutup")

  const tgl = dateOnly(tanggal)
  const mulai = dateOnly(periode.tgl_mulai)
  const selesai = dateOnly(periode.tgl_selesai)
  if (tgl < mulai || tgl > selesai) {
    throw new Error("Tanggal jurnal harus berada dalam rentang periode fiskal")
  }

  if (!Array.isArray(payload.details) || payload.details.length < 2) {
    throw new Error("Jurnal minimal 2 baris")
  }

  const now = new Date()
  const details = payload.details.map((d, i) => {
    const debit = parseAmount(d.debit)
    const kredit = parseAmount(d.kredit)
    if (!Number.isFinite(debit) || !Number.isFinite(kredit)) {
      throw new Error(`Nominal baris ${i + 1} tidak valid`)
    }
    if (debit < 0 || kredit < 0) {
      throw new Error(`Debit/kredit baris ${i + 1} tidak boleh negatif`)
    }
    if (debit > 0 && kredit > 0) {
      throw new Error(`Baris ${i + 1} tidak boleh memiliki debit dan kredit sekaligus`)
    }
    if (debit === 0 && kredit === 0) {
      throw new Error(`Baris ${i + 1} harus memiliki nilai debit atau kredit`)
    }
    if (!d.akun_id) throw new Error(`Akun baris ${i + 1} wajib dipilih`)

    return {
      akun_id: BigInt(d.akun_id),
      urutan: d.urutan ?? i,
      keterangan: d.keterangan ?? null,
      debit,
      kredit,
      created_at: now,
      updated_at: now,
    }
  })

  const akunIds = [...new Set(details.map((d) => d.akun_id.toString()))].map(BigInt)
  const akuns = await prisma.keu_akun.findMany({
    where: { id: { in: akunIds } },
    select: { id: true, kode: true, nama: true, is_active: true, is_detail: true },
  })
  const akunById = new Map(akuns.map((a) => [a.id.toString(), a]))

  for (const detail of details) {
    const akun = akunById.get(detail.akun_id.toString())
    if (!akun) throw new Error("Akun jurnal tidak ditemukan")
    if (!akun.is_active) throw new Error(`Akun ${akun.kode} - ${akun.nama} tidak aktif`)
    if (!akun.is_detail) throw new Error(`Akun ${akun.kode} - ${akun.nama} adalah akun induk dan tidak boleh dipakai di jurnal`)
  }

  const totalDebit = details.reduce((s, d) => s + d.debit, 0)
  const totalKredit = details.reduce((s, d) => s + d.kredit, 0)
  if (totalDebit <= 0 || totalKredit <= 0) throw new Error("Total debit dan kredit harus lebih dari nol")
  if (Math.abs(totalDebit - totalKredit) > 0.01) {
    throw new Error(`Jurnal tidak balance: Debit ${totalDebit.toLocaleString("id-ID")} tidak sama dengan Kredit ${totalKredit.toLocaleString("id-ID")}`)
  }

  return { tanggal: tgl, totalDebit, totalKredit, details }
}

export async function validatePostedJurnal(id: number | bigint): Promise<ValidatedJurnal> {
  const jurnal = await prisma.keu_jurnal.findUnique({
    where: { id: BigInt(id) },
    include: { details: { orderBy: { urutan: "asc" } } },
  })
  if (!jurnal) throw new Error("Jurnal tidak ditemukan")

  return validateJurnalInput({
    tanggal: jurnal.tanggal,
    periode_id: jurnal.periode_id,
    jenis: jurnal.jenis,
    details: jurnal.details.map((d) => ({
      akun_id: Number(d.akun_id),
      keterangan: d.keterangan ?? undefined,
      debit: Number(d.debit),
      kredit: Number(d.kredit),
      urutan: d.urutan,
    })),
  })
}

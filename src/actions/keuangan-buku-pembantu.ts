"use server"

import { prisma } from "@/lib/prisma"

export type ActionResult<T> =
  | { success: true; data: T; error: null }
  | { success: false; data: null; error: string }

function ok<T>(data: T): ActionResult<T> { return { success: true, data, error: null } }
function fail(error: string): ActionResult<never> { return { success: false, data: null, error } }

export type BukuPembantuRow = {
  tanggal: string
  kelompok: "SIMPANAN" | "PINJAMAN" | "SHU"
  ref: string
  keterangan: string
  masuk: number
  keluar: number
  saldo_simpanan: number
  saldo_pinjaman: number
}

export type BukuPembantuData = {
  anggota: { id: number; no_anggota: string; nama: string; status: string }
  ringkasan: { simpanan: number; pinjaman: number; shu: number }
  rows: BukuPembantuRow[]
}

export async function getBukuPembantuAnggota(anggota_id: number): Promise<ActionResult<BukuPembantuData>> {
  if (!anggota_id) return fail("Pilih anggota")
  try {
    const anggota = await prisma.keu_anggota.findUnique({ where: { id: BigInt(anggota_id) } })
    if (!anggota) return fail("Anggota tidak ditemukan")

    const [simpanan, pinjaman, pembayaran, shu] = await Promise.all([
      prisma.keu_simpanan.findMany({
        where: { anggota_id: BigInt(anggota_id) },
        include: { jurnal: { select: { nomor_jurnal: true } } },
      }),
      prisma.keu_pinjaman.findMany({ where: { anggota_id: BigInt(anggota_id) } }),
      prisma.keu_pinjaman_pembayaran.findMany({
        where: { pinjaman: { anggota_id: BigInt(anggota_id) } },
        include: { pinjaman: { select: { nomor_pinjaman: true } }, jurnal: { select: { nomor_jurnal: true } } },
      }),
      prisma.keu_shu_anggota.findMany({
        where: { anggota_id: BigInt(anggota_id) },
        include: { run: { select: { tahun: true } } },
      }),
    ])

    const events: Array<Omit<BukuPembantuRow, "saldo_simpanan" | "saldo_pinjaman"> & { sort: number }> = []
    for (const s of simpanan) {
      const jumlah = Number(s.jumlah)
      events.push({
        tanggal: s.tanggal.toISOString(), sort: s.tanggal.getTime(), kelompok: "SIMPANAN",
        ref: s.jurnal?.nomor_jurnal ?? `SIMP-${s.id.toString()}`,
        keterangan: `${s.tipe === "SETOR" ? "Setor" : "Tarik"} ${s.jenis}${s.keterangan ? ` - ${s.keterangan}` : ""}`,
        masuk: s.tipe === "SETOR" ? jumlah : 0,
        keluar: s.tipe === "TARIK" ? jumlah : 0,
      })
    }
    for (const p of pinjaman) {
      const pokok = Number(p.pokok)
      events.push({
        tanggal: p.tanggal.toISOString(), sort: p.tanggal.getTime(), kelompok: "PINJAMAN",
        ref: p.nomor_pinjaman, keterangan: `Pencairan pinjaman${p.keterangan ? ` - ${p.keterangan}` : ""}`,
        masuk: 0, keluar: pokok,
      })
    }
    for (const b of pembayaran) {
      events.push({
        tanggal: b.tanggal.toISOString(), sort: b.tanggal.getTime(), kelompok: "PINJAMAN",
        ref: b.jurnal?.nomor_jurnal ?? b.pinjaman.nomor_pinjaman,
        keterangan: `Pembayaran pinjaman ${b.pinjaman.nomor_pinjaman}`,
        masuk: Number(b.pokok) + Number(b.jasa), keluar: 0,
      })
    }
    for (const s of shu) {
      events.push({
        tanggal: new Date(Date.UTC(s.run.tahun, 11, 31)).toISOString(), sort: Date.UTC(s.run.tahun, 11, 31), kelompok: "SHU",
        ref: `SHU-${s.run.tahun}`, keterangan: `Alokasi SHU tahun ${s.run.tahun}`,
        masuk: Number(s.jumlah), keluar: 0,
      })
    }

    events.sort((a, b) => a.sort - b.sort || a.ref.localeCompare(b.ref))
    let saldoSimpanan = 0
    let saldoPinjaman = 0
    const rows: BukuPembantuRow[] = events.map((e) => {
      if (e.kelompok === "SIMPANAN") saldoSimpanan += e.masuk - e.keluar
      if (e.kelompok === "PINJAMAN") saldoPinjaman += e.keluar - e.masuk
      return {
        tanggal: e.tanggal,
        kelompok: e.kelompok,
        ref: e.ref,
        keterangan: e.keterangan,
        masuk: e.masuk,
        keluar: e.keluar,
        saldo_simpanan: saldoSimpanan,
        saldo_pinjaman: Math.max(0, saldoPinjaman),
      }
    }).reverse()

    return ok({
      anggota: { id: Number(anggota.id), no_anggota: anggota.no_anggota, nama: anggota.nama, status: anggota.status },
      ringkasan: {
        simpanan: saldoSimpanan,
        pinjaman: Math.max(0, saldoPinjaman),
        shu: shu.reduce((sum, row) => sum + Number(row.jumlah), 0),
      },
      rows,
    })
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Gagal memuat buku pembantu anggota")
  }
}

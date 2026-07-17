import { NextRequest, NextResponse } from "next/server"
import { requireSession } from "@/lib/auth"
import { prisma, serialize } from "@/lib/prisma"
import { canCreateOrEditTransaksi, getTransaksiActionError } from "@/lib/transaksi-role"

export async function GET() {
  try {
    const list = await prisma.mutasi_r2r4s.findMany({
      orderBy: { tgl_mutasi: "desc" },
    })

    const kendaraans = await prisma.data_r2r4s.findMany({
      select: { id: true, plat: true, nm_brg: true, kode_brg: true },
    })
    const kMap = new Map(kendaraans.map(k => [Number(k.id), k]))

    const enriched = list.map(m => {
      const k = kMap.get(Number(m.data_r2r4_id))
      return {
        ...m,
        plat:    k?.plat    ?? "—",
        nm_brg:  k?.nm_brg  ?? "—",
        kode_brg: k?.kode_brg ?? "—",
      }
    })

    return NextResponse.json(serialize(enriched))
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireSession(req)
  if ("error" in auth) return auth.error
  if (!canCreateOrEditTransaksi(auth.user.role)) {
    return NextResponse.json({ error: getTransaksiActionError("create") }, { status: 403 })
  }

  try {
    const body = await req.json()
    const { data_r2r4_id, pemegang_tujuan, departemen_tujuan, tgl_mutasi, deskripsi } = body

    if (!data_r2r4_id || !pemegang_tujuan || !departemen_tujuan || !tgl_mutasi) {
      return NextResponse.json({ error: "Field wajib tidak lengkap" }, { status: 400 })
    }

    // 1. Ambil data kendaraan saat ini (data ASAL)
    const vehicle = await prisma.data_r2r4s.findUnique({ where: { id: BigInt(data_r2r4_id) } })
    if (!vehicle) {
      return NextResponse.json({ error: "Kendaraan tidak ditemukan" }, { status: 404 })
    }

    // 2. Buat record mutasi — catat pemegang ASAL dari kendaraan saat ini
    const mutasi = await prisma.mutasi_r2r4s.create({
      data: {
        data_r2r4_id:     BigInt(data_r2r4_id),
        pemegang_awal:    vehicle.pemegang ?? null,
        departemen_awal:  vehicle.departemen ?? null,
        pemegang_tujuan,
        departemen_tujuan,
        tgl_mutasi:       new Date(tgl_mutasi),
        deskripsi:        deskripsi ?? null,
      },
    })

    // 3. UPDATE kendaraan — pemegang dan departemen berubah ke tujuan
    await prisma.data_r2r4s.update({
      where: { id: BigInt(data_r2r4_id) },
      data: {
        pemegang:   pemegang_tujuan,
        departemen: departemen_tujuan,
      },
    })

    return NextResponse.json(serialize(mutasi), { status: 201 })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: "Gagal menyimpan mutasi kendaraan" }, { status: 500 })
  }
}

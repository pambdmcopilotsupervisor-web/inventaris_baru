import { NextRequest, NextResponse } from "next/server"
import { prisma, serialize } from "@/lib/prisma"
import { requireRole, getClientIp } from "@/lib/auth"
import { writeAuditLog } from "@/lib/audit"

// POST /api/sdm/hari-libur/bulk
// Body: { tanggals: string[], nama_libur: string, tipe_libur: string, keterangan?: string }
// Menerima array tanggal, simpan semua sekaligus (skip duplikat)

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, ["admin", "hrd"])
  if ("error" in auth) return auth.error

  try {
    const body = await req.json()
    const { tanggals, nama_libur, tipe_libur, keterangan } = body

    if (!Array.isArray(tanggals) || tanggals.length === 0)
      return NextResponse.json({ error: "Pilih minimal 1 tanggal" }, { status: 400 })
    if (!nama_libur?.trim())
      return NextResponse.json({ error: "Nama libur wajib diisi" }, { status: 400 })

    const results = { inserted: 0, skipped: 0, errors: [] as string[] }

    for (const tgl of tanggals) {
      try {
        await prisma.hari_liburs.create({
          data: {
            tanggal:    new Date(tgl),
            nama_libur: nama_libur.trim(),
            tipe_libur: tipe_libur ?? "Nasional",
            keterangan: keterangan?.trim() || null,
            created_at: new Date(),
            updated_at: new Date(),
          },
        })
        results.inserted++
      } catch (e: unknown) {
        if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2002") {
          results.skipped++ // tanggal sudah ada, lewati
        } else {
          results.errors.push(tgl)
        }
      }
    }

    await writeAuditLog({
      user: auth.user, action: "CREATE", modelType: "hari_liburs",
      dataBaru: { bulk: true, ...results, nama_libur, tipe_libur },
      ip: getClientIp(req),
    })

    return NextResponse.json({
      success: true,
      message: `${results.inserted} hari libur ditambahkan${results.skipped > 0 ? `, ${results.skipped} sudah ada (dilewati)` : ""}${results.errors.length > 0 ? `, ${results.errors.length} gagal` : ""}.`,
      ...results,
    }, { status: 201 })
  } catch {
    return NextResponse.json({ error: "Gagal menyimpan hari libur" }, { status: 500 })
  }
}

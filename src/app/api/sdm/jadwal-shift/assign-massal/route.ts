import { NextRequest, NextResponse } from "next/server"
import { prisma, serialize } from "@/lib/prisma"
import { requireRole, getClientIp } from "@/lib/auth"
import { writeAuditLog } from "@/lib/audit"

// POST /api/sdm/jadwal-shift/assign-massal
// Body: {
//   shift_id, tgl_mulai, tgl_selesai,
//   karyawan_ids?: number[]   — assign individu
//   divisi_id?:   number      — assign per divisi
//   subdivisi_id?: number     — assign per subdivisi
//   excludeHariLibur: boolean — lewati hari libur nasional
//   excludeHari: number[]     — hari dalam seminggu yg dikecualikan (0=Minggu,6=Sabtu)
// }

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, ["admin", "hrd"])
  if ("error" in auth) return auth.error

  try {
    const body = await req.json()
    const {
      shift_id, tgl_mulai, tgl_selesai,
      karyawan_ids, divisi_id, subdivisi_id,
      excludeHariLibur = true,
      excludeHari = [0], // default: kecualikan Minggu
    } = body

    // Validasi dasar
    if (!shift_id)    return NextResponse.json({ error: "Shift wajib dipilih" }, { status: 400 })
    if (!tgl_mulai)   return NextResponse.json({ error: "Tanggal mulai wajib diisi" }, { status: 400 })
    if (!tgl_selesai) return NextResponse.json({ error: "Tanggal selesai wajib diisi" }, { status: 400 })

    const dtMulai   = new Date(tgl_mulai)
    const dtSelesai = new Date(tgl_selesai)
    if (dtSelesai < dtMulai) {
      return NextResponse.json({ error: "Tanggal selesai tidak boleh lebih kecil dari tanggal mulai" }, { status: 400 })
    }

    // Cek shift aktif
    const shift = await prisma.shift_kerjas.findUnique({ where: { id: BigInt(shift_id) } })
    if (!shift)                  return NextResponse.json({ error: "Shift tidak ditemukan" }, { status: 404 })
    if (shift.status !== "aktif") return NextResponse.json({ error: "Shift sudah tidak aktif" }, { status: 422 })

    // Kumpulkan ID karyawan yang ditarget
    let targetIds: bigint[] = []
    if (karyawan_ids && Array.isArray(karyawan_ids) && karyawan_ids.length > 0) {
      targetIds = karyawan_ids.map((id: number) => BigInt(id))
    } else if (divisi_id || subdivisi_id) {
      // Ambil karyawan aktif berdasarkan divisi atau subdivisi.
      // Kondisi divisi: divisi_id cocok LANGSUNG atau NULL tapi subdivisi-nya milik divisi tersebut.
      if (subdivisi_id) {
        // Filter per subdivisi langsung
        const karyawans = await prisma.karyawans.findMany({
          where: {
            status_karyawan: { notIn: ["Pensiun", "Nonaktif"] },
            subdivisi_id:    Number(subdivisi_id),
          },
          select: { id: true },
        })
        targetIds = karyawans.map(k => k.id)
      } else if (divisi_id) {
        // Filter per divisi: divisi_id cocok, ATAU divisi_id NULL tapi subdivisi milik divisi ini
        const rows = await prisma.$queryRaw<{ id: bigint }[]>`
          SELECT k.id
          FROM karyawans k
          LEFT JOIN subdivisis s ON s.id = k.subdivisi_id
          WHERE k.status_karyawan NOT IN ('Pensiun', 'Nonaktif')
            AND (
              k.divisi_id = ${Number(divisi_id)}
              OR (k.divisi_id IS NULL AND s.divisi_id = ${Number(divisi_id)})
            )
        `
        targetIds = rows.map(r => BigInt(r.id))
      }
    } else {
      return NextResponse.json({ error: "Pilih karyawan, divisi, atau sub divisi yang akan dijadwalkan" }, { status: 400 })
    }

    if (targetIds.length === 0) {
      return NextResponse.json({ error: "Tidak ada karyawan aktif yang memenuhi kriteria" }, { status: 422 })
    }

    // Kumpulkan hari libur dalam rentang jika excludeHariLibur
    const hariLiburSet = new Set<string>()
    if (excludeHariLibur) {
      const liburs = await prisma.hari_liburs.findMany({
        where: { tanggal: { gte: dtMulai, lte: dtSelesai } },
        select: { tanggal: true },
      })
      liburs.forEach(l => {
        const d = l.tanggal instanceof Date ? l.tanggal : new Date(l.tanggal as string)
        hariLiburSet.add(d.toISOString().slice(0, 10))
      })
    }

    // Generate rentang tanggal
    const tanggals: Date[] = []
    const cur = new Date(dtMulai)
    while (cur <= dtSelesai) {
      const dayOfWeek = cur.getDay()
      const isoStr    = cur.toISOString().slice(0, 10)
      if (!excludeHari.includes(dayOfWeek) && !hariLiburSet.has(isoStr)) {
        tanggals.push(new Date(cur))
      }
      cur.setDate(cur.getDate() + 1)
    }

    if (tanggals.length === 0) {
      return NextResponse.json({ error: "Tidak ada tanggal kerja dalam rentang tersebut setelah pengecualian" }, { status: 422 })
    }

    // Batch upsert jadwal — jika sudah ada akan di-UPDATE shift-nya
    // Jadwal di hari yang dikecualikan (excludeHari/hari libur) akan DIHAPUS jika ada
    let dibuat = 0
    let diperbarui = 0
    let dihapus = 0
    let gagal = 0
    const now = new Date()

    // Bangun set tanggal yang dikecualikan (untuk dihapus)
    const excludedDates = new Set<string>()
    const curEx = new Date(dtMulai)
    while (curEx <= dtSelesai) {
      const dayOfWeek = curEx.getDay()
      const isoStr    = curEx.toISOString().slice(0, 10)
      if (excludeHari.includes(dayOfWeek) || hariLiburSet.has(isoStr)) {
        excludedDates.add(isoStr)
      }
      curEx.setDate(curEx.getDate() + 1)
    }

    for (const karyawanId of targetIds) {
      // Hapus jadwal di tanggal yang dikecualikan jika ada
      if (excludedDates.size > 0) {
        const toDelete = await prisma.jadwal_shifts.findMany({
          where: {
            karyawan_id: karyawanId,
            tanggal: { gte: dtMulai, lte: dtSelesai },
          },
          select: { id: true, tanggal: true },
        })
        for (const jd of toDelete) {
          const isoTgl = (jd.tanggal instanceof Date ? jd.tanggal : new Date(jd.tanggal as string)).toISOString().slice(0, 10)
          if (excludedDates.has(isoTgl)) {
            try {
              await prisma.jadwal_shifts.delete({ where: { id: jd.id } })
              dihapus++
            } catch { /* abaikan error hapus */ }
          }
        }
      }

      for (const tgl of tanggals) {
        try {
          const existing = await prisma.jadwal_shifts.findFirst({
            where: { karyawan_id: karyawanId, tanggal: tgl },
            select: { id: true },
          })
          await prisma.jadwal_shifts.upsert({
            where: {
              karyawan_id_tanggal: {
                karyawan_id: karyawanId,
                tanggal:     tgl,
              },
            },
            update: {
              shift_id:   BigInt(shift_id),
              updated_at: now,
            },
            create: {
              karyawan_id: karyawanId,
              shift_id:    BigInt(shift_id),
              tanggal:     tgl,
              created_at:  now,
              updated_at:  now,
            },
          })
          if (existing) diperbarui++
          else dibuat++
        } catch {
          gagal++
        }
      }
    }

    await writeAuditLog({
      user: auth.user, action: "CREATE", modelType: "jadwal_shifts",
      dataBaru: {
        shift_id, tgl_mulai, tgl_selesai,
        jumlah_karyawan: targetIds.length,
        jumlah_tanggal: tanggals.length,
        dibuat, diperbarui, dihapus, gagal,
      },
      ip: getClientIp(req),
    })

    return NextResponse.json({
      success: true,
      dibuat,
      diperbarui,
      dihapus,
      gagal,
      jumlah_karyawan: targetIds.length,
      jumlah_tanggal:  tanggals.length,
      message: `${dibuat} jadwal baru dibuat, ${diperbarui} diperbarui${dihapus > 0 ? `, ${dihapus} dihapus (hari dikecualikan)` : ""}${gagal > 0 ? `, ${gagal} gagal` : ""}.`,
    })
  } catch {
    return NextResponse.json({ error: "Gagal assign jadwal massal" }, { status: 500 })
  }
}

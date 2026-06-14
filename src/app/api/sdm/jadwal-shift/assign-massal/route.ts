import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireRole, getClientIp } from "@/lib/auth"
import { writeAuditLog } from "@/lib/audit"

type WeeklyPattern = Record<string, number | string | null | undefined>
type MonthlyScheduleEntry = {
  karyawan_id?: number | string
  tanggal?: string
  shift_id?: number | string | null
}

// POST /api/sdm/jadwal-shift/assign-massal
// Body: {
//   shift_id OR weeklyPattern, tgl_mulai, tgl_selesai,
//   allKaryawan?: boolean    — assign semua pegawai aktif
//   karyawan_ids?: number[]   — assign individu
//   divisi_id?:   number      — assign per divisi
//   subdivisi_id?: number     — assign per subdivisi
//   excludeHariLibur: boolean — lewati hari libur nasional
//   excludeHari: number[]     — hari dalam seminggu yg dikecualikan (0=Minggu,6=Sabtu)
//   weeklyPattern?: { [day: string]: shift_id } — pola mingguan (0=Minggu,6=Sabtu)
//   monthlySchedules?: { karyawan_id, tanggal, shift_id|null }[] — grid bulanan fleksibel
// }

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, ["admin", "hrd"])
  if ("error" in auth) return auth.error

  try {
    const body = await req.json()
    const {
      shift_id, tgl_mulai, tgl_selesai,
      allKaryawan, karyawan_ids, divisi_id, subdivisi_id,
      excludeHariLibur = true,
      excludeHari = [0], // default: kecualikan Minggu
      weeklyPattern,
      monthlySchedules,
    } = body

    const pattern = weeklyPattern && typeof weeklyPattern === "object" ? weeklyPattern as WeeklyPattern : null
    const isWeeklyPattern = !!pattern
    const monthlyEntries = Array.isArray(monthlySchedules) ? monthlySchedules as MonthlyScheduleEntry[] : null
    const isMonthlySchedule = !!monthlyEntries

    // Validasi dasar
    if (!tgl_mulai)   return NextResponse.json({ error: "Tanggal mulai wajib diisi" }, { status: 400 })
    if (!tgl_selesai) return NextResponse.json({ error: "Tanggal selesai wajib diisi" }, { status: 400 })
    if (!isWeeklyPattern && !isMonthlySchedule && !shift_id) return NextResponse.json({ error: "Shift wajib dipilih" }, { status: 400 })

    const dtMulai   = new Date(tgl_mulai)
    const dtSelesai = new Date(tgl_selesai)
    if (dtSelesai < dtMulai) {
      return NextResponse.json({ error: "Tanggal selesai tidak boleh lebih kecil dari tanggal mulai" }, { status: 400 })
    }

    const shiftByDay = new Map<number, bigint>()
    if (isWeeklyPattern) {
      for (const [day, rawShiftId] of Object.entries(pattern)) {
        const dayNumber = Number(day)
        if (!Number.isInteger(dayNumber) || dayNumber < 0 || dayNumber > 6 || rawShiftId === null || rawShiftId === undefined || rawShiftId === "") continue
        const shiftIdText = String(rawShiftId)
        if (!/^\d+$/.test(shiftIdText)) {
          return NextResponse.json({ error: "Pola mingguan berisi shift tidak valid" }, { status: 400 })
        }
        shiftByDay.set(dayNumber, BigInt(shiftIdText))
      }

      if (shiftByDay.size === 0) {
        return NextResponse.json({ error: "Pilih minimal satu shift pada pola mingguan" }, { status: 400 })
      }

      const uniqueShiftIds = Array.from(new Set(Array.from(shiftByDay.values()).map(id => id.toString()))).map(id => BigInt(id))
      const shifts = await prisma.shift_kerjas.findMany({ where: { id: { in: uniqueShiftIds } }, select: { id: true, status: true } })
      const activeShiftIds = new Set(shifts.filter(s => s.status === "aktif").map(s => s.id.toString()))
      if (activeShiftIds.size !== uniqueShiftIds.length) {
        return NextResponse.json({ error: "Pola mingguan berisi shift yang tidak ditemukan atau tidak aktif" }, { status: 422 })
      }
    } else if (!isMonthlySchedule) {
      // Cek shift aktif
      const shift = await prisma.shift_kerjas.findUnique({ where: { id: BigInt(shift_id) } })
      if (!shift)                   return NextResponse.json({ error: "Shift tidak ditemukan" }, { status: 404 })
      if (shift.status !== "aktif") return NextResponse.json({ error: "Shift sudah tidak aktif" }, { status: 422 })
    }

    // Kumpulkan ID karyawan yang ditarget
    let targetIds: bigint[] = []
    if (allKaryawan) {
      const karyawans = await prisma.karyawans.findMany({
        where: { status_karyawan: { notIn: ["Pensiun", "Nonaktif"] } },
        select: { id: true },
      })
      targetIds = karyawans.map(k => k.id)
    } else if (karyawan_ids && Array.isArray(karyawan_ids) && karyawan_ids.length > 0) {
      const invalidKaryawanId = karyawan_ids.some((id: number | string) => !/^\d+$/.test(String(id)))
      if (invalidKaryawanId) {
        return NextResponse.json({ error: "Daftar karyawan berisi ID tidak valid" }, { status: 400 })
      }
      targetIds = karyawan_ids.map((id: number | string) => BigInt(id))
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
      return NextResponse.json({ error: "Pilih karyawan, semua pegawai, divisi, atau sub divisi yang akan dijadwalkan" }, { status: 400 })
    }

    if (targetIds.length === 0) {
      return NextResponse.json({ error: "Tidak ada karyawan aktif yang memenuhi kriteria" }, { status: 422 })
    }

    if (isMonthlySchedule) {
      if (!monthlyEntries || monthlyEntries.length === 0) {
        return NextResponse.json({ error: "Isi minimal satu jadwal bulanan" }, { status: 400 })
      }

      const targetIdSet = new Set(targetIds.map(id => id.toString()))
      const monthlyShiftIds = new Set<string>()
      for (const entry of monthlyEntries) {
        const karyawanId = String(entry.karyawan_id ?? "")
        const tanggal = String(entry.tanggal ?? "")
        const shiftId = entry.shift_id == null || entry.shift_id === "" ? "" : String(entry.shift_id)
        if (!/^\d+$/.test(karyawanId) || !/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) {
          return NextResponse.json({ error: "Jadwal bulanan berisi data pegawai atau tanggal tidak valid" }, { status: 400 })
        }
        if (!targetIdSet.has(karyawanId)) {
          return NextResponse.json({ error: "Jadwal bulanan berisi pegawai di luar target" }, { status: 400 })
        }
        const tanggalEntry = new Date(tanggal)
        if (tanggalEntry < dtMulai || tanggalEntry > dtSelesai) {
          return NextResponse.json({ error: "Jadwal bulanan berisi tanggal di luar periode" }, { status: 400 })
        }
        if (shiftId) {
          if (!/^\d+$/.test(shiftId)) {
            return NextResponse.json({ error: "Jadwal bulanan berisi shift tidak valid" }, { status: 400 })
          }
          monthlyShiftIds.add(shiftId)
        }
      }

      if (monthlyShiftIds.size > 0) {
        const shifts = await prisma.shift_kerjas.findMany({
          where: { id: { in: Array.from(monthlyShiftIds).map(id => BigInt(id)) } },
          select: { id: true, status: true },
        })
        const activeShiftIds = new Set(shifts.filter(s => s.status === "aktif").map(s => s.id.toString()))
        if (activeShiftIds.size !== monthlyShiftIds.size) {
          return NextResponse.json({ error: "Jadwal bulanan berisi shift yang tidak ditemukan atau tidak aktif" }, { status: 422 })
        }
      }
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

    if (isMonthlySchedule) {
      let dibuat = 0
      let diperbarui = 0
      let dihapus = 0
      let gagal = 0
      const now = new Date()
      const touchedDates = new Set<string>()

      for (const entry of monthlyEntries) {
        const tanggalText = String(entry.tanggal)
        const shiftId = entry.shift_id == null || entry.shift_id === "" ? "" : String(entry.shift_id)
        const tanggal = new Date(tanggalText)
        const isHariLibur = excludeHariLibur && hariLiburSet.has(tanggalText)
        touchedDates.add(tanggalText)

        try {
          const existing = await prisma.jadwal_shifts.findFirst({
            where: { karyawan_id: BigInt(String(entry.karyawan_id)), tanggal },
            select: { id: true },
          })

          if (!shiftId || isHariLibur) {
            if (existing) {
              await prisma.jadwal_shifts.delete({ where: { id: existing.id } })
              dihapus++
            }
            continue
          }

          await prisma.jadwal_shifts.upsert({
            where: {
              karyawan_id_tanggal: {
                karyawan_id: BigInt(String(entry.karyawan_id)),
                tanggal,
              },
            },
            update: {
              shift_id:   BigInt(shiftId),
              updated_at: now,
            },
            create: {
              karyawan_id: BigInt(String(entry.karyawan_id)),
              shift_id:    BigInt(shiftId),
              tanggal,
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

      await writeAuditLog({
        user: auth.user, action: "CREATE", modelType: "jadwal_shifts",
        dataBaru: {
          mode: "monthly",
          tgl_mulai, tgl_selesai,
          jumlah_karyawan: targetIds.length,
          jumlah_tanggal: touchedDates.size,
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
        jumlah_tanggal: touchedDates.size,
        message: `${dibuat} jadwal baru dibuat, ${diperbarui} diperbarui${dihapus > 0 ? `, ${dihapus} dihapus (Off/libur)` : ""}${gagal > 0 ? `, ${gagal} gagal` : ""}.`,
      })
    }

    // Generate rentang tanggal
    const jadwalTargets: { tanggal: Date; shiftId: bigint }[] = []
    const cur = new Date(dtMulai)
    while (cur <= dtSelesai) {
      const dayOfWeek = cur.getDay()
      const isoStr    = cur.toISOString().slice(0, 10)
      if (!excludeHari.includes(dayOfWeek) && !hariLiburSet.has(isoStr)) {
        const targetShiftId = isWeeklyPattern ? shiftByDay.get(dayOfWeek) : BigInt(shift_id)
        if (targetShiftId) jadwalTargets.push({ tanggal: new Date(cur), shiftId: targetShiftId })
      }
      cur.setDate(cur.getDate() + 1)
    }

    if (jadwalTargets.length === 0) {
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
    const targetDateSet = new Set(jadwalTargets.map(j => j.tanggal.toISOString().slice(0, 10)))
    const excludedDates = new Set<string>()
    const curEx = new Date(dtMulai)
    while (curEx <= dtSelesai) {
      const dayOfWeek = curEx.getDay()
      const isoStr    = curEx.toISOString().slice(0, 10)
      if (excludeHari.includes(dayOfWeek) || hariLiburSet.has(isoStr) || !targetDateSet.has(isoStr)) {
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

      for (const target of jadwalTargets) {
        try {
          const existing = await prisma.jadwal_shifts.findFirst({
            where: { karyawan_id: karyawanId, tanggal: target.tanggal },
            select: { id: true },
          })
          await prisma.jadwal_shifts.upsert({
            where: {
              karyawan_id_tanggal: {
                karyawan_id: karyawanId,
                tanggal:     target.tanggal,
              },
            },
            update: {
              shift_id:   target.shiftId,
              updated_at: now,
            },
            create: {
              karyawan_id: karyawanId,
              shift_id:    target.shiftId,
              tanggal:     target.tanggal,
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
        shift_id: isWeeklyPattern ? null : shift_id,
        weeklyPattern: isWeeklyPattern ? Object.fromEntries(Array.from(shiftByDay.entries()).map(([day, id]) => [day, id.toString()])) : null,
        tgl_mulai, tgl_selesai,
        allKaryawan: !!allKaryawan,
        jumlah_karyawan: targetIds.length,
        jumlah_tanggal: jadwalTargets.length,
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
      jumlah_tanggal:  jadwalTargets.length,
      message: `${dibuat} jadwal baru dibuat, ${diperbarui} diperbarui${dihapus > 0 ? `, ${dihapus} dihapus (hari dikecualikan)` : ""}${gagal > 0 ? `, ${gagal} gagal` : ""}.`,
    })
  } catch {
    return NextResponse.json({ error: "Gagal assign jadwal massal" }, { status: 500 })
  }
}

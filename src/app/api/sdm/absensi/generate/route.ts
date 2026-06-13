import { NextRequest, NextResponse } from "next/server"
import { prisma, serialize } from "@/lib/prisma"
import { requireRole, getClientIp } from "@/lib/auth"
import { writeAuditLog } from "@/lib/audit"
import { hitungAbsensi, resolveLeaveStatus } from "@/lib/attendance"

// POST /api/sdm/absensi/generate
// Generate atau update status absensi harian berdasarkan jadwal kerja
// Body: { tanggal: "YYYY-MM-DD", force_update?: boolean }

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, ["admin", "hrd"])
  if ("error" in auth) return auth.error

  try {
    const body = await req.json()
    const { tanggal, force_update = false } = body

    if (!tanggal) return NextResponse.json({ error: "Tanggal wajib diisi" }, { status: 400 })

    const tglDate = new Date(tanggal)
    const now     = new Date()
    const userId  = BigInt(auth.user.id)

    // Cek apakah hari libur
    const hariLibur = await prisma.hari_liburs.findFirst({ where: { tanggal: tglDate } })

    // Ambil semua jadwal pada tanggal tersebut beserta shift dan karyawan
    const jadwals = await prisma.jadwal_shifts.findMany({
      where: { tanggal: tglDate },
      include: {
        shift_kerjas: true,
        karyawans: { select: { id: true, status_karyawan: true } },
      },
    })

    let dibuat = 0, diperbarui = 0, dilewati = 0

    for (const jadwal of jadwals) {
      // Lewati karyawan tidak aktif
      const k = jadwal.karyawans
      if (!k || k.status_karyawan === "Pensiun" || k.status_karyawan === "Nonaktif") {
        dilewati++; continue
      }

      // Cek apakah sudah ada absensi
      const existing = await prisma.absensi.findFirst({
        where: { karyawan_id: jadwal.karyawan_id, tanggal_absensi: tglDate },
      })

      // Skip rules — jangan timpa:
      // 1. Record manual (is_manual=true) → hanya force_update yang boleh
      // 2. Record dengan status "cuti"/"izin"/"sakit"/"libur" yang sudah ada (approved leave)
      //    → hanya force_update yang boleh menimpa
      const isApprovedLeaveStatus = ["cuti", "izin", "sakit", "libur"].includes(existing?.status_absensi ?? "")
      if (existing && !force_update && (existing.is_manual || isApprovedLeaveStatus)) {
        dilewati++; continue
      }

      // Resolve leave placeholders
      const { has_cuti, has_izin, has_sakit } = await resolveLeaveStatus(jadwal.karyawan_id, tglDate)

      // Hitung status berdasarkan data yang ada (jam masuk/pulang jika sudah ada)
      const { status_absensi, is_terlambat, is_pulang_cepat, is_tidak_absen_masuk, is_tidak_absen_pulang, menit_terlambat, menit_pulang_cepat, total_jam_kerja_menit } =
        hitungAbsensi({
          jam_masuk:     existing?.jam_masuk ?? null,
          jam_pulang:    existing?.jam_pulang ?? null,
          shift:         jadwal.shift_kerjas,
          is_hari_libur: !!hariLibur,
          has_cuti, has_izin, has_sakit,
        })

      if (existing) {
        await prisma.absensi.update({
          where: { id: existing.id },
          data: {
            jadwal_shift_id:       jadwal.id,
            status_absensi,
            is_terlambat,
            is_pulang_cepat,
            is_tidak_absen_masuk,
            is_tidak_absen_pulang,
            menit_terlambat,
            menit_pulang_cepat,
            total_jam_kerja_menit,
            generated_at:          now,
            generated_by:          userId,
            updated_at:            now,
          },
        })
        diperbarui++
      } else {
        await prisma.absensi.create({
          data: {
            karyawan_id:           jadwal.karyawan_id,
            jadwal_shift_id:       jadwal.id,
            tanggal_absensi:       tglDate,
            jam_masuk:             null,
            jam_pulang:            null,
            status_absensi,
            is_terlambat,
            is_pulang_cepat,
            is_tidak_absen_masuk,
            is_tidak_absen_pulang,
            menit_terlambat,
            menit_pulang_cepat,
            total_jam_kerja_menit,
            is_manual:             false,
            generated_at:          now,
            generated_by:          userId,
            created_by:            userId,
            updated_by:            userId,
            created_at:            now,
            updated_at:            now,
          },
        })
        dibuat++
      }
    }

    await writeAuditLog({
      user: auth.user, action: "CREATE", modelType: "absensi_generate",
      dataBaru: { tanggal, dibuat, diperbarui, dilewati, force_update },
      ip: getClientIp(req),
    })

    return NextResponse.json({
      success: true,
      dibuat,
      diperbarui,
      dilewati,
      total_jadwal: jadwals.length,
      message: `${dibuat} absensi dibuat, ${diperbarui} diperbarui, ${dilewati} dilewati.`,
    })
  } catch {
    return NextResponse.json({ error: "Gagal generate absensi" }, { status: 500 })
  }
}

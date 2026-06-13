import { NextRequest, NextResponse } from "next/server"
import { prisma, serialize } from "@/lib/prisma"
import { requireRole, getClientIp } from "@/lib/auth"
import { writeAuditLog } from "@/lib/audit"
import { STATUS_IZIN, resolveAtasan, hitungDurasiIzin, checkIzinOverlap, JABATAN_MANAGER } from "@/lib/izin"
import { checkSdmConflicts } from "@/lib/sdm-validation"

const INCLUDE = {
  karyawans:  { select: { id: true, nik: true, nama_karyawan: true, jabatan: true, divisi_id: true } },
  jenis_izins: { select: { id: true, kode_izin: true, nama_izin: true, satuan: true, memotong_absensi: true, membutuhkan_lampiran: true } },
  izin_approvals: { orderBy: { approval_level: "asc" as const } },
}

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, ["admin", "hrd", "atasan", "user", "operator"])
  if ("error" in auth) return auth.error
  try {
    const { searchParams } = new URL(req.url)
    const karyawanId = searchParams.get("karyawan_id")
    const status     = searchParams.get("status")
    const tglMulai   = searchParams.get("tgl_mulai")
    const tglSelesai = searchParams.get("tgl_selesai")

    const where: Record<string, unknown> = {}
    if (karyawanId) where.karyawan_id = BigInt(karyawanId)
    if (status)     where.status = status
    if (tglMulai && tglSelesai) where.tanggal_mulai = { gte: new Date(tglMulai), lte: new Date(tglSelesai) }

    // Akses data: admin → semua, Kepala Divisi → divisinya, lainnya → milik sendiri
    const role = (auth.user.role ?? "user").toLowerCase()

    if (role === "admin") {
      // tidak ada filter tambahan
    } else if (auth.user.karyawan_id) {
      const loggedInK = await prisma.karyawans.findUnique({
        where: { id: BigInt(auth.user.karyawan_id) },
        select: { jabatan: true, divisi_id: true },
      })
      const isKepala = loggedInK?.jabatan?.toLowerCase().includes("kepala divisi")

      if (isKepala && loggedInK?.divisi_id) {
        const subDivisis = await prisma.subdivisis.findMany({ where: { divisi_id: loggedInK.divisi_id }, select: { id: true } })
        const subIds = subDivisis.map(s => Number(s.id))
        const karyawanDivisi = await prisma.karyawans.findMany({
          where: { OR: [{ divisi_id: loggedInK.divisi_id }, { divisi_id: null, subdivisi_id: { in: subIds } }] },
          select: { id: true },
        })
        where.karyawan_id = { in: karyawanDivisi.map(k => k.id) }
      } else {
        where.karyawan_id = BigInt(auth.user.karyawan_id)
      }
    } else {
      return NextResponse.json([])
    }

    const data = await prisma.pengajuan_izins.findMany({
      where, orderBy: { created_at: "desc" }, include: INCLUDE,
    })
    return NextResponse.json(serialize(data))
  } catch { return NextResponse.json({ error: "Server error" }, { status: 500 }) }
}

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, ["admin", "hrd", "atasan", "user", "operator"])
  if ("error" in auth) return auth.error
  try {
    const body = await req.json()
    const { karyawan_id, jenis_izin_id, tanggal_mulai, tanggal_selesai, jam_mulai, jam_selesai, alasan, lampiran } = body

    // Hanya admin yang bisa input untuk orang lain
    let targetKaryawanId: bigint
    const role = (auth.user.role ?? "user").toLowerCase()
    if (role === "admin") {
      if (!karyawan_id) return NextResponse.json({ error: "Karyawan wajib dipilih" }, { status: 400 })
      targetKaryawanId = BigInt(karyawan_id)
    } else {
      if (!auth.user.karyawan_id) return NextResponse.json({ error: "Akun belum terhubung ke data karyawan" }, { status: 422 })
      targetKaryawanId = BigInt(auth.user.karyawan_id)
    }

    if (!jenis_izin_id)   return NextResponse.json({ error: "Jenis izin wajib dipilih" }, { status: 400 })
    if (!tanggal_mulai)   return NextResponse.json({ error: "Tanggal mulai wajib diisi" }, { status: 400 })
    if (!tanggal_selesai) return NextResponse.json({ error: "Tanggal selesai wajib diisi" }, { status: 400 })
    if (!alasan?.trim())  return NextResponse.json({ error: "Alasan wajib diisi" }, { status: 400 })

    const dtMulai   = new Date(tanggal_mulai)
    const dtSelesai = new Date(tanggal_selesai)
    if (dtSelesai < dtMulai) return NextResponse.json({ error: "Tanggal selesai tidak boleh sebelum tanggal mulai" }, { status: 400 })

    // Cek karyawan aktif
    const karyawan = await prisma.karyawans.findUnique({ where: { id: targetKaryawanId }, select: { status_karyawan: true, nama_karyawan: true, jabatan: true } })
    if (!karyawan) return NextResponse.json({ error: "Karyawan tidak ditemukan" }, { status: 404 })
    if (karyawan.status_karyawan === "Pensiun" || karyawan.status_karyawan === "Nonaktif") {
      return NextResponse.json({ error: `Karyawan ${karyawan.nama_karyawan} sudah ${karyawan.status_karyawan}` }, { status: 422 })
    }

    // Cek jenis izin
    const jenisIzin = await prisma.jenis_izins.findUnique({ where: { id: BigInt(jenis_izin_id) } })
    if (!jenisIzin || jenisIzin.status !== "aktif") return NextResponse.json({ error: "Jenis izin tidak tersedia" }, { status: 422 })

    // Cek lampiran jika wajib
    if (jenisIzin.membutuhkan_lampiran && !lampiran) {
      return NextResponse.json({ error: `Jenis izin "${jenisIzin.nama_izin}" wajib menyertakan lampiran` }, { status: 400 })
    }

    // Validasi jam untuk izin berbasis jam
    if (jenisIzin.satuan === "jam") {
      if (!jam_mulai || !jam_selesai) return NextResponse.json({ error: "Jam mulai dan jam selesai wajib diisi untuk izin berbasis jam" }, { status: 400 })
      const [hm, mm] = jam_mulai.split(":").map(Number)
      const [hs, ms] = jam_selesai.split(":").map(Number)
      if (hs * 60 + ms <= hm * 60 + mm) return NextResponse.json({ error: "Jam selesai harus lebih besar dari jam mulai" }, { status: 400 })
    }

    // Cek overlap
    const { hasOverlap, message } = await checkIzinOverlap(targetKaryawanId, dtMulai, dtSelesai)
    if (hasOverlap) return NextResponse.json({ error: message }, { status: 409 })

    const crossModuleConflict = await checkSdmConflicts({
      karyawanId: targetKaryawanId,
      tanggalMulai: dtMulai,
      tanggalSelesai: dtSelesai,
      modules: ["cuti", "sakit", "lembur"],
    })
    if (crossModuleConflict.hasConflict) {
      return NextResponse.json({ error: crossModuleConflict.message, conflicts: crossModuleConflict.conflicts }, { status: 409 })
    }

    // Validasi atasan — sama dengan cuti
    const jabatanKaryawan = karyawan.jabatan ?? ""
    const isManagerKetua = JABATAN_MANAGER.some(j => jabatanKaryawan.toLowerCase().includes(j.toLowerCase()))
    const { atasan } = await resolveAtasan(targetKaryawanId)
    if (!isManagerKetua && !atasan) {
      return NextResponse.json({
        error: `Pengajuan izin tidak dapat dibuat. Atasan langsung untuk ${karyawan.nama_karyawan} belum dikonfigurasi.`,
      }, { status: 422 })
    }

    // Hitung durasi
    const durasi = hitungDurasiIzin(dtMulai, dtSelesai, jenisIzin.satuan, jam_mulai, jam_selesai)

    const now = new Date()
    const data = await prisma.pengajuan_izins.create({
      data: {
        karyawan_id:    targetKaryawanId,
        jenis_izin_id:  BigInt(jenis_izin_id),
        tanggal_mulai:  dtMulai,
        tanggal_selesai: dtSelesai,
        jam_mulai:      jam_mulai  || null,
        jam_selesai:    jam_selesai || null,
        durasi,
        satuan_durasi:  jenisIzin.satuan,
        alasan:         alasan.trim(),
        lampiran:       lampiran || null,
        status:         STATUS_IZIN.DRAFT,
        dibuat_oleh:    BigInt(auth.user.id),
        created_at:     now, updated_at: now,
      },
    })
    await writeAuditLog({ user: auth.user, action: "CREATE", modelType: "pengajuan_izins", modelId: data.id, dataBaru: serialize(data), ip: getClientIp(req) })
    return NextResponse.json(serialize(data), { status: 201 })
  } catch (err) {
    console.error("[pengajuan-izin POST]", err)
    return NextResponse.json({ error: err instanceof Error ? err.message : "Gagal menyimpan pengajuan izin" }, { status: 500 })
  }
}

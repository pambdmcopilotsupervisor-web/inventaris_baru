import { NextRequest, NextResponse } from "next/server"
import { prisma, serialize } from "@/lib/prisma"
import { requireRole, getClientIp } from "@/lib/auth"
import { writeAuditLog } from "@/lib/audit"
import { STATUS_SAKIT, resolveAtasan, hitungHariSakit, checkSakitOverlap, JABATAN_MANAGER } from "@/lib/sakit"
import { checkSdmConflicts } from "@/lib/sdm-validation"

const INCLUDE = {
  karyawans:       { select: { id: true, nik: true, nama_karyawan: true, jabatan: true, divisi_id: true } },
  sakit_approvals: { orderBy: { approval_level: "asc" as const } },
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

    const data = await prisma.pengajuan_sakits.findMany({
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
    const { karyawan_id, tanggal_mulai, tanggal_selesai, keterangan_sakit, nama_dokter, nama_fasilitas_kesehatan, nomor_surat_sakit, lampiran_path } = body

    // Target karyawan
    let targetKaryawanId: bigint
    const role = (auth.user.role ?? "user").toLowerCase()
    if (role === "admin") {
      if (!karyawan_id) return NextResponse.json({ error: "Karyawan wajib dipilih" }, { status: 400 })
      targetKaryawanId = BigInt(karyawan_id)
    } else {
      if (!auth.user.karyawan_id) return NextResponse.json({ error: "Akun belum terhubung ke data karyawan" }, { status: 422 })
      targetKaryawanId = BigInt(auth.user.karyawan_id)
    }

    if (!tanggal_mulai)   return NextResponse.json({ error: "Tanggal mulai wajib diisi" }, { status: 400 })
    if (!tanggal_selesai) return NextResponse.json({ error: "Tanggal selesai wajib diisi" }, { status: 400 })
    if (!lampiran_path?.trim()) return NextResponse.json({ error: "Lampiran surat sakit wajib disertakan" }, { status: 400 })

    const dtMulai   = new Date(tanggal_mulai)
    const dtSelesai = new Date(tanggal_selesai)
    if (dtSelesai < dtMulai) return NextResponse.json({ error: "Tanggal selesai tidak boleh sebelum tanggal mulai" }, { status: 400 })

    // Cek karyawan aktif
    const karyawan = await prisma.karyawans.findUnique({ where: { id: targetKaryawanId }, select: { status_karyawan: true, nama_karyawan: true, jabatan: true } })
    if (!karyawan) return NextResponse.json({ error: "Karyawan tidak ditemukan" }, { status: 404 })
    if (karyawan.status_karyawan === "Pensiun" || karyawan.status_karyawan === "Nonaktif") {
      return NextResponse.json({ error: `Karyawan ${karyawan.nama_karyawan} sudah ${karyawan.status_karyawan}` }, { status: 422 })
    }

    // Validasi overlap
    const { hasOverlap, message } = await checkSakitOverlap(targetKaryawanId, dtMulai, dtSelesai)
    if (hasOverlap) return NextResponse.json({ error: message }, { status: 409 })

    const crossModuleConflict = await checkSdmConflicts({
      karyawanId: targetKaryawanId,
      tanggalMulai: dtMulai,
      tanggalSelesai: dtSelesai,
      modules: ["cuti", "izin", "lembur"],
    })
    if (crossModuleConflict.hasConflict) {
      return NextResponse.json({ error: crossModuleConflict.message, conflicts: crossModuleConflict.conflicts }, { status: 409 })
    }

    // Validasi atasan
    const jabatanKaryawan = karyawan.jabatan ?? ""
    const isManagerKetua = JABATAN_MANAGER.some(j => jabatanKaryawan.toLowerCase().includes(j.toLowerCase()))
    const { atasan } = await resolveAtasan(targetKaryawanId)
    if (!isManagerKetua && !atasan) {
      return NextResponse.json({ error: `Atasan langsung untuk ${karyawan.nama_karyawan} belum dikonfigurasi. Hubungi HRD.` }, { status: 422 })
    }

    const jumlahHari = hitungHariSakit(dtMulai, dtSelesai)
    const now = new Date()

    const data = await prisma.pengajuan_sakits.create({
      data: {
        karyawan_id:              targetKaryawanId,
        tanggal_mulai:            dtMulai,
        tanggal_selesai:          dtSelesai,
        jumlah_hari:              jumlahHari,
        keterangan_sakit:         keterangan_sakit?.trim() || null,
        nama_dokter:              nama_dokter?.trim() || null,
        nama_fasilitas_kesehatan: nama_fasilitas_kesehatan?.trim() || null,
        nomor_surat_sakit:        nomor_surat_sakit?.trim() || null,
        lampiran_path:            lampiran_path.trim(),
        status:                   STATUS_SAKIT.DRAFT,
        dibuat_oleh:              BigInt(auth.user.id),
        created_at:               now, updated_at: now,
      },
    })
    await writeAuditLog({ user: auth.user, action: "CREATE", modelType: "pengajuan_sakits", modelId: data.id, dataBaru: serialize(data), ip: getClientIp(req) })
    return NextResponse.json(serialize(data), { status: 201 })
  } catch (err) {
    console.error("[pengajuan-sakit POST]", err)
    return NextResponse.json({ error: err instanceof Error ? err.message : "Gagal menyimpan" }, { status: 500 })
  }
}

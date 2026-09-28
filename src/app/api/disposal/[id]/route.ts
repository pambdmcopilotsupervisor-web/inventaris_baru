import { NextRequest, NextResponse } from "next/server"
import { requireSession } from "@/lib/auth"
import { prisma, serialize } from "@/lib/prisma"
import { canCreateOrEditTransaksi, canDeleteTransaksi, getTransaksiActionError, hasRequiredJabatan } from "@/lib/transaksi-role"

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const data = await prisma.permohonan_disposal.findUnique({ where: { id: BigInt(id) } })
    if (!data) return NextResponse.json({ error: "Tidak ditemukan" }, { status: 404 })
    return NextResponse.json(serialize(data))
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSession(req)
  if ("error" in auth) return auth.error

  try {
    const { id } = await params
    const body = await req.json()
    const { action, ...data } = body

    const record = await prisma.permohonan_disposal.findUnique({ where: { id: BigInt(id) } })
    if (!record) return NextResponse.json({ error: "Tidak ditemukan" }, { status: 404 })

    // ── Verifikasi Manager ───────────────────────────────────────────
    if (action === "verif_manager") {
      if (!hasRequiredJabatan(auth.user.jabatan, "Manager")) {
        return NextResponse.json({ error: "Hanya user dengan jabatan Manager yang dapat melakukan verifikasi manager" }, { status: 403 })
      }
      if (record.verif_manager === 1) {
        return NextResponse.json({ error: "Sudah diverifikasi oleh Manager" }, { status: 400 })
      }
      const updated = await prisma.permohonan_disposal.update({
        where: { id: BigInt(id) },
        data: {
          verif_manager:     1,
          tgl_verif_manager: new Date(),
        },
      })
      return NextResponse.json(serialize(updated))
    }

    // ── Verifikasi Pengurus/Bendahara ────────────────────────────────
    // Syarat: Manager harus sudah verifikasi dulu
    if (action === "verif_bendahara") {
      if (!hasRequiredJabatan(auth.user.jabatan, "Bendahara")) {
        return NextResponse.json({ error: "Hanya user dengan jabatan Bendahara yang dapat melakukan Verif Pengurus" }, { status: 403 })
      }
      if (!auth.user.karyawan_id) {
        return NextResponse.json({ error: "User Bendahara harus terhubung dengan data karyawan" }, { status: 403 })
      }
      if (!record.verif_manager) {
        return NextResponse.json({ error: "Harus diverifikasi Manager terlebih dahulu" }, { status: 400 })
      }
      if (record.verif_ketua === 1) {
        return NextResponse.json({ error: "Permohonan ini sudah diverifikasi oleh Ketua" }, { status: 400 })
      }
      if (record.verif_bendahara === 1) {
        return NextResponse.json({ error: "Sudah diverifikasi oleh Pengurus" }, { status: 400 })
      }

      const updated = await prisma.permohonan_disposal.update({
        where: { id: BigInt(id) },
        data: {
          verif_bendahara:     1,
          tgl_verif_bendahara: new Date(),
          bendahara_id:        auth.user.karyawan_id,
        },
      })

      // UPDATE asset status_barang → 'Disposal' setelah Verif Pengurus
      await prisma.assets.update({
        where: { id: BigInt(record.asset_id) },
        data: { status_barang: "Disposal" },
      })

      return NextResponse.json(serialize(updated))
    }

    // ── Edit biasa ─── hanya boleh jika belum ada verifikasi
    if (!canCreateOrEditTransaksi(auth.user.role)) {
      return NextResponse.json({ error: getTransaksiActionError("update") }, { status: 403 })
    }

    if ((record.verif_manager ?? 0) !== 0 || (record.verif_ketua ?? 0) !== 0 || (record.verif_bendahara ?? 0) !== 0) {
      return NextResponse.json({ error: "Tidak dapat diubah — sudah dalam proses verifikasi" }, { status: 400 })
    }

    const updated = await prisma.permohonan_disposal.update({
      where: { id: BigInt(id) },
      data: {
        tgl_pengajuan: data.tgl_pengajuan ? new Date(data.tgl_pengajuan) : undefined,
        kondisi:       data.kondisi ?? undefined,
        keterangan:    data.keterangan ?? undefined,
      },
    })
    return NextResponse.json(serialize(updated))
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: "Gagal memperbarui" }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSession(req)
  if ("error" in auth) return auth.error
  if (!canDeleteTransaksi(auth.user.role)) {
    return NextResponse.json({ error: getTransaksiActionError("delete") }, { status: 403 })
  }

  try {
    const { id } = await params
    const record = await prisma.permohonan_disposal.findUnique({ where: { id: BigInt(id) } })

    // Jika sudah diverifikasi Ketua lama atau Pengurus baru (status disposal sudah set), batalkan status aset
    if (record && (record.verif_ketua === 1 || record.verif_bendahara === 1)) {
      await prisma.assets.update({
        where: { id: BigInt(record.asset_id) },
        data: { status_barang: "Baik" },
      })
    }

    await prisma.permohonan_disposal.delete({ where: { id: BigInt(id) } })
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: "Gagal menghapus" }, { status: 500 })
  }
}

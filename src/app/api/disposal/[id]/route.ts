import { NextRequest, NextResponse } from "next/server"
import { requireSession } from "@/lib/auth"
import { prisma, serialize } from "@/lib/prisma"
import { canCreateOrEditTransaksi, canDeleteTransaksi, getTransaksiActionError, hasRequiredJabatan } from "@/lib/transaksi-role"
import { uploadServiceBuktiImage } from "@/lib/service-bukti-file"

function toNullableString(value: FormDataEntryValue | string | null | undefined): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

async function parseDisposalEditRequest(req: NextRequest, jsonBody?: Record<string, unknown>) {
  const contentType = req.headers.get("content-type") ?? ""

  if (contentType.includes("multipart/form-data")) {
    const formData = await req.formData()
    const rawFoto = formData.get("foto") ?? formData.get("gambar")
    const foto = rawFoto instanceof File && rawFoto.size > 0 ? rawFoto : null

    return {
      tgl_pengajuan: toNullableString(formData.get("tgl_pengajuan")),
      kondisi: toNullableString(formData.get("kondisi")),
      keterangan: toNullableString(formData.get("keterangan")),
      foto,
      gambar: formData.has("gambar") && typeof formData.get("gambar") === "string" ? toNullableString(formData.get("gambar")) : undefined,
    }
  }

  const body = jsonBody ?? await req.json()
  return {
    tgl_pengajuan: toNullableString(body.tgl_pengajuan as string | null | undefined),
    kondisi: toNullableString(body.kondisi as string | null | undefined),
    keterangan: toNullableString(body.keterangan as string | null | undefined),
    foto: null,
    gambar: Object.prototype.hasOwnProperty.call(body, "gambar") ? toNullableString(body.gambar as string | null | undefined) : undefined,
  }
}

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
    const contentType = req.headers.get("content-type") ?? ""
    const body = contentType.includes("multipart/form-data") ? null : await req.json()
    const action = body?.action

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

    const data = await parseDisposalEditRequest(req, body ?? undefined)
    const storedFoto = data.foto ? await uploadServiceBuktiImage(data.foto, "disposal") : data.gambar

    const updated = await prisma.permohonan_disposal.update({
      where: { id: BigInt(id) },
      data: {
        tgl_pengajuan: data.tgl_pengajuan ? new Date(data.tgl_pengajuan) : undefined,
        kondisi:       data.kondisi ?? undefined,
        keterangan:    data.keterangan ?? undefined,
        gambar:        typeof storedFoto !== "undefined" ? storedFoto : undefined,
      },
    })
    return NextResponse.json(serialize(updated))
  } catch (err) {
    console.error(err)
    if (err instanceof Error && (err.message.includes("JPG") || err.message.includes("Ukuran"))) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
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

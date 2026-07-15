import { NextResponse } from "next/server"

/**
 * GET /api/modules
 *
 * Mengembalikan status aktif/nonaktif tiap modul.
 * Dibaca dari environment variable server-side (MODULE_*) saat RUNTIME,
 * sehingga perubahan .env langsung berlaku setelah restart container
 * tanpa perlu rebuild Docker image.
 *
 * Response: { aset: boolean, sdm: boolean, kinerja: boolean, keuangan: boolean }
 */
export async function GET() {
  return NextResponse.json({
    aset:     process.env.MODULE_ASET     !== "false",
    sdm:      process.env.MODULE_SDM      !== "false",
    kinerja:  process.env.MODULE_KINERJA  !== "false",
    keuangan: process.env.MODULE_KEUANGAN !== "false",
  })
}

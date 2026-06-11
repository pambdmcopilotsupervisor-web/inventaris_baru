import { NextRequest, NextResponse } from "next/server"
import { prisma, serialize } from "@/lib/prisma"

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const month = searchParams.get("month") ?? String(new Date().getMonth() + 1).padStart(2, "0")
    const year  = searchParams.get("year")  ?? String(new Date().getFullYear())

    // Gunakan Date.UTC() untuk timezone-safe comparison (sama dengan pedami Carbon startOfDay)
    const monthNum  = parseInt(month)
    const yearNum   = parseInt(year)
    const startDate = new Date(Date.UTC(yearNum, monthNum - 1, 1))
    const endDate   = new Date(Date.UTC(yearNum, monthNum, 0, 23, 59, 59, 999))

    const periodLabel = startDate.toLocaleDateString("id-ID", { month: "long", year: "numeric", timeZone: "UTC" })

    // Ambil kendaraan dengan status sewa atau pernah dijual
    const vehicles = await prisma.data_r2r4s.findMany({
      where: {
        OR: [
          { stat: { in: ["Sewa - Kontrak Berjalan", "Sewa dihentikan"] } },
          // Kendaraan terjual (yang mungkin masih ada kontrak aktif saat itu)
        ],
      },
    })

    // Ambil kontrak details dan kontrak
    const kontrakDetails = await prisma.kontrak_details.findMany()
    const kontraks       = await prisma.kontraks.findMany()

    // Ambil penjualan
    const penjualans = await prisma.penjualan_r2r4s.findMany()

    const kontrakMap = new Map(kontraks.map(k => [Number(k.id), k]))
    const penjualanMap = new Map(penjualans.map(p => [p.data_r2r4_id, p]))

    // Group kontrak detail by kendaraan
    const kontrakByVehicle = new Map<number, typeof kontraks>()
    for (const detail of kontrakDetails) {
      if (!detail.data_r2r4_id || !detail.kontrak_id) continue
      if (!kontrakByVehicle.has(detail.data_r2r4_id)) kontrakByVehicle.set(detail.data_r2r4_id, [])
      const k = kontrakMap.get(detail.kontrak_id)
      if (k) kontrakByVehicle.get(detail.data_r2r4_id)!.push(k)
    }

    const activeRows: any[]  = []
    const historyRows: any[] = []

    for (const vehicle of vehicles) {
      const vehicleId = Number(vehicle.id)
      const vehicleKontraks = kontrakByVehicle.get(vehicleId) ?? []
      const penjualan = penjualanMap.get(vehicleId)

      // Cari kontrak aktif untuk periode ini
      const activeDetail = vehicleKontraks.find(k => {
        const kStart = new Date(k.tgl_awal)   // Prisma returns UTC date
        const kEnd   = new Date(k.tgl_akhir)
        return kStart <= endDate && kEnd >= startDate
      })

      if (!activeDetail) continue

      const kontrak = activeDetail
      const contractEnd = new Date(kontrak.tgl_akhir)
      const saleDate = penjualan?.tgl_jual ? new Date(penjualan.tgl_jual) : null
      const stopDate = vehicle.tgl_stop_tagihan ? new Date(vehicle.tgl_stop_tagihan) : null

      // Cek apakah tagihan sudah berhenti sebelum/pada periode ini
      const stopReasons: string[] = []
      if (contractEnd < startDate) stopReasons.push("kontrak berakhir")
      if (saleDate && saleDate <= startDate) stopReasons.push("kendaraan terjual")
      if (stopDate && stopDate <= startDate) stopReasons.push("tagihan dihentikan")

      const type = vehicle.jns_brg?.toUpperCase().includes("R4") ? "R4" : "R2"

      const baseRow = {
        type,
        no_kontrak:    kontrak.no_kontrak,
        plat:          vehicle.plat,
        jenis_type:    vehicle.nm_brg,
        tahun:         vehicle.thn,
        nomor_mesin:   vehicle.no_mesin,
        nomor_rangka:  vehicle.no_rangka,
        awal:          kontrak.tgl_awal,
        akhir:         kontrak.tgl_akhir,
        uraian:        kontrak.judul || `Sewa kendaraan ${(vehicle.jns_brg ?? "").toLowerCase()}`,
        harga_kontrak: Number(vehicle.hrg_sewa ?? 0),
        penanggung_jawab: vehicle.pemegang,
        departemen:    vehicle.departemen,
        tgl_stop_tagihan:    vehicle.tgl_stop_tagihan,
        alasan_stop_tagihan: vehicle.alasan_stop_tagihan,
      }

      if (stopReasons.length > 0) {
        // Berhenti ditagihkan
        const effectiveEnd = [
          saleDate && saleDate <= startDate ? saleDate : null,
          contractEnd < startDate ? contractEnd : null,
          stopDate && stopDate <= startDate ? stopDate : null,
        ].filter(Boolean).sort((a: any, b: any) => a - b)[0]

        historyRows.push({
          ...baseRow,
          status:     vehicle.stat,
          keterangan: `Berhenti ditagihkan per ${effectiveEnd ? new Date(effectiveEnd!).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" }) : "-"} (${stopReasons.join(", ")})`,
        })
      } else {
        // Masih aktif ditagih periode ini
        activeRows.push(baseRow)
      }
    }

    // Group by type dan hitung jumlah unit per kontrak
    const reindex = (rows: any[]) =>
      rows.map((r, i) => ({ ...r, no: i + 1 }))

    const roda2 = reindex(activeRows.filter(r => r.type === "R2"))
    const roda4 = reindex(activeRows.filter(r => r.type === "R4"))
    const historyRoda2 = reindex(historyRows.filter(r => r.type === "R2"))
    const historyRoda4 = reindex(historyRows.filter(r => r.type === "R4"))

    return NextResponse.json(serialize({
      periodLabel,
      roda2,
      roda4,
      historyRoda2,
      historyRoda4,
      summary: {
        roda2: { unit: roda2.length, nominal: roda2.reduce((s: number, r: any) => s + r.harga_kontrak, 0) },
        roda4: { unit: roda4.length, nominal: roda4.reduce((s: number, r: any) => s + r.harga_kontrak, 0) },
      },
    }))
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: "Gagal mengambil laporan" }, { status: 500 })
  }
}

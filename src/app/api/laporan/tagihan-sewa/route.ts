import { NextRequest, NextResponse } from "next/server"
import { prisma, serialize } from "@/lib/prisma"

type ReportType = "R2" | "R4"

interface ReportRow {
  type: ReportType
  no_kontrak: string | null
  plat: string
  jenis_type: string
  tahun: number | null
  nomor_mesin: string | null
  nomor_rangka: string | null
  awal: Date
  akhir: Date
  uraian: string
  harga_kontrak: number
  penanggung_jawab: string | null
  departemen: string | null
  tgl_stop_tagihan: Date | null
  alasan_stop_tagihan: string | null
  status?: string | null
  keterangan?: string
}

type IndexedReportRow = ReportRow & { no: number }
const BILLING_CUTOFF_DAY = 20

function sortKontraksByEndDateDesc<T extends { tgl_akhir: Date; id: bigint | number }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const endDiff = new Date(b.tgl_akhir).getTime() - new Date(a.tgl_akhir).getTime()
    if (endDiff !== 0) return endDiff
    return Number(b.id) - Number(a.id)
  })
}

function isSameUtcMonth(date: Date, year: number, month: number): boolean {
  return date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month
}

function stopsBillingInThisPeriod(date: Date | null, year: number, month: number): boolean {
  if (!date) return false

  if (date.getUTCFullYear() < year) return true
  if (date.getUTCFullYear() === year && date.getUTCMonth() + 1 < month) return true

  if (!isSameUtcMonth(date, year, month)) return false

  return date.getUTCDate() <= BILLING_CUTOFF_DAY
}

function isStillBillableThisPeriod(date: Date | null, year: number, month: number): boolean {
  if (!date) return true

  if (date.getUTCFullYear() > year) return true
  if (date.getUTCFullYear() === year && date.getUTCMonth() + 1 > month) return true

  if (!isSameUtcMonth(date, year, month)) return false

  return date.getUTCDate() > BILLING_CUTOFF_DAY
}

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

    const activeRows: ReportRow[] = []
    const historyRows: ReportRow[] = []

    for (const vehicle of vehicles) {
      const vehicleId = Number(vehicle.id)
      const vehicleKontraks = sortKontraksByEndDateDesc(kontrakByVehicle.get(vehicleId) ?? [])
      const penjualan = penjualanMap.get(vehicleId)

      // Cari kontrak yang relevan untuk periode ini
      const periodKontraks = vehicleKontraks.filter(k => {
        const kStart = new Date(k.tgl_awal)   // Prisma returns UTC date
        const kEnd   = new Date(k.tgl_akhir)
        return kStart <= endDate && kEnd >= startDate
      })

      if (periodKontraks.length === 0) continue

      const kontrak = periodKontraks[0]
      const contractEnd = new Date(kontrak.tgl_akhir)
      const saleDate = penjualan?.tgl_jual ? new Date(penjualan.tgl_jual) : null
      const stopDate = vehicle.tgl_stop_tagihan ? new Date(vehicle.tgl_stop_tagihan) : null

      const billableByContract = isStillBillableThisPeriod(contractEnd, yearNum, monthNum)
      const billableBySale = isStillBillableThisPeriod(saleDate, yearNum, monthNum)
      const billableByStop = isStillBillableThisPeriod(stopDate, yearNum, monthNum)

      // Cek apakah tagihan sudah berhenti sebelum atau di dalam periode ini
      const stopReasons: string[] = []
      if (!billableByContract && stopsBillingInThisPeriod(contractEnd, yearNum, monthNum)) stopReasons.push("kontrak berakhir")
      if (!billableBySale && stopsBillingInThisPeriod(saleDate, yearNum, monthNum)) stopReasons.push("kendaraan terjual")
      if (!billableByStop && stopsBillingInThisPeriod(stopDate, yearNum, monthNum)) stopReasons.push("tagihan dihentikan")

      const type: ReportType = vehicle.jns_brg?.toUpperCase().includes("R4") ? "R4" : "R2"

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
          !billableBySale && stopsBillingInThisPeriod(saleDate, yearNum, monthNum) ? saleDate : null,
          !billableByContract && stopsBillingInThisPeriod(contractEnd, yearNum, monthNum) ? contractEnd : null,
          !billableByStop && stopsBillingInThisPeriod(stopDate, yearNum, monthNum) ? stopDate : null,
        ].filter((value): value is Date => value instanceof Date)
          .sort((a, b) => a.getTime() - b.getTime())[0]

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
    const reindex = (rows: ReportRow[]): IndexedReportRow[] =>
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
        roda2: { unit: roda2.length, nominal: roda2.reduce((s, r) => s + Number(r.harga_kontrak ?? 0), 0) },
        roda4: { unit: roda4.length, nominal: roda4.reduce((s, r) => s + Number(r.harga_kontrak ?? 0), 0) },
      },
    }))
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: "Gagal mengambil laporan" }, { status: 500 })
  }
}

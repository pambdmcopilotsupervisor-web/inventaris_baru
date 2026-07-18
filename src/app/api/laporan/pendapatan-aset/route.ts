import { NextRequest, NextResponse } from "next/server"
import { prisma, serialize } from "@/lib/prisma"

const BULAN_ID: Record<number, string> = {
  1:"Januari",2:"Februari",3:"Maret",4:"April",5:"Mei",6:"Juni",
  7:"Juli",8:"Agustus",9:"September",10:"Oktober",11:"November",12:"Desember",
}

function sortKontraksByEndDateDesc<T extends { tgl_akhir: Date; id: bigint | number }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const endDiff = new Date(b.tgl_akhir).getTime() - new Date(a.tgl_akhir).getTime()
    if (endDiff !== 0) return endDiff
    return Number(b.id) - Number(a.id)
  })
}

interface ContractLike {
  id: bigint | number
  tgl_awal: Date
  tgl_akhir: Date
}

interface SaleLike {
  tgl_jual?: Date | null
}

interface ActiveVehicleEntry {
  id: number
  kode: string
  plat: string
  nama: string
  pemegang: string
  departemen: string
  hrg: number
}

interface VehicleMonthMap {
  r2: Map<number, ActiveVehicleEntry>
  r4: Map<number, ActiveVehicleEntry>
}

interface VehicleTrendChange {
  added: ActiveVehicleEntry[]
  removed: ActiveVehicleEntry[]
}

const BILLING_CUTOFF_DAY = 20

function isSameUtcMonth(date: Date, year: number, month: number): boolean {
  return date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month
}

function isStillBillableThisPeriod(date: Date | null, year: number, month: number): boolean {
  if (!date) return true

  if (date.getUTCFullYear() > year) return true
  if (date.getUTCFullYear() === year && date.getUTCMonth() + 1 > month) return true

  if (!isSameUtcMonth(date, year, month)) return false

  return date.getUTCDate() > BILLING_CUTOFF_DAY
}

// ── Shared DB data cache (loaded once per request) ───────────────
async function loadSharedData() {
  const [penjualanRaw, kontrakDetails, kontraks, penjualans, allVehicles] = await Promise.all([
    prisma.penjualan_r2r4s.findMany({ select: { data_r2r4_id: true } }),
    prisma.kontrak_details.findMany(),
    prisma.kontraks.findMany(),
    prisma.penjualan_r2r4s.findMany(),
    prisma.data_r2r4s.findMany({
      select: {
        id: true, kode_brg: true, plat: true, nm_brg: true, jns_brg: true,
        hrg_sewa: true, tgl_stop_tagihan: true, pemegang: true, departemen: true, stat: true
      }
    }),
  ])

  const penjualanIds = penjualanRaw.map(p => p.data_r2r4_id).filter(Boolean) as number[]

  const vehicles = allVehicles.filter(v =>
    v.stat === "Sewa - Kontrak Berjalan" ||
    v.stat === "Sewa dihentikan" ||
    penjualanIds.includes(Number(v.id))
  )

  const kontrakMap = new Map(kontraks.map(k => [Number(k.id), k]))
  const penjualanMap = new Map(penjualans.map(p => [p.data_r2r4_id, p]))

  const kontrakByVehicle = new Map<number, typeof kontraks>()
  for (const detail of kontrakDetails) {
    if (!detail.data_r2r4_id || !detail.kontrak_id) continue
    if (!kontrakByVehicle.has(detail.data_r2r4_id)) kontrakByVehicle.set(detail.data_r2r4_id, [])
    const k = kontrakMap.get(detail.kontrak_id)
    if (k) kontrakByVehicle.get(detail.data_r2r4_id)!.push(k)
  }

  return { vehicles, kontrakByVehicle, penjualanMap }
}

type SharedVehicle = Awaited<ReturnType<typeof loadSharedData>>["vehicles"][number]

// ── Get active vehicles for a month (with full filtering) ────────
function getActiveVehicles(
  year: number, month: number,
  vehicles: SharedVehicle[],
  kontrakByVehicle: Map<number, ContractLike[]>,
  penjualanMap: Map<number | null, SaleLike>
) {
  const startDate = new Date(Date.UTC(year, month - 1, 1))
  const endDate   = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999))

  const result: {
    r2: ActiveVehicleEntry[]
    r4: ActiveVehicleEntry[]
    r2Nominal: number; r4Nominal: number; r2Unit: number; r4Unit: number
  } = { r2: [], r4: [], r2Nominal: 0, r4Nominal: 0, r2Unit: 0, r4Unit: 0 }

  for (const vehicle of vehicles) {
    const vehicleId = Number(vehicle.id)
    const vKontraks = sortKontraksByEndDateDesc(kontrakByVehicle.get(vehicleId) ?? [])

    const periodKontraks = vKontraks.filter(k => {
      const kStart = new Date(k.tgl_awal)
      const kEnd   = new Date(k.tgl_akhir)
      return kStart <= endDate && kEnd >= startDate
    })
    if (periodKontraks.length === 0) continue

    const kontrak = periodKontraks[0]
    const contractEnd = new Date(kontrak.tgl_akhir)
    if (!isStillBillableThisPeriod(contractEnd, year, month)) continue

    const penjualan = penjualanMap.get(vehicleId)
    const saleDate  = penjualan?.tgl_jual ? new Date(penjualan.tgl_jual) : null
    if (!isStillBillableThisPeriod(saleDate, year, month)) continue

    const stopDate = vehicle.tgl_stop_tagihan ? new Date(vehicle.tgl_stop_tagihan) : null
    if (!isStillBillableThisPeriod(stopDate, year, month)) continue

    const isR4 = (vehicle.jns_brg ?? "").toUpperCase().includes("R4")
    const hrg  = Number(vehicle.hrg_sewa ?? 0)
    const entry: ActiveVehicleEntry = {
      id:         vehicleId,
      kode:       vehicle.kode_brg ?? "-",
      plat:       vehicle.plat,
      nama:       vehicle.nm_brg,
      pemegang:   vehicle.pemegang ?? "-",
      departemen: vehicle.departemen ?? "-",
      hrg,
    }

    if (isR4) { result.r4.push(entry); result.r4Nominal += hrg; result.r4Unit++ }
    else       { result.r2.push(entry); result.r2Nominal += hrg; result.r2Unit++ }
  }

  return result
}

async function getMonthlySales(year: number, month: number): Promise<number> {
  const result = await prisma.penjualan_r2r4s.aggregate({
    _sum: { hrg_jual: true },
    where: {
      tgl_jual: {
        gte: new Date(Date.UTC(year, month - 1, 1)),
        lte: new Date(Date.UTC(year, month, 0, 23, 59, 59, 999)),
      },
    },
  })
  return Number(result._sum.hrg_jual ?? 0)
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const year       = parseInt(searchParams.get("year")        ?? String(new Date().getFullYear()))
    const startMonth = parseInt(searchParams.get("start_month") ?? String(new Date().getMonth() + 1))
    const endMonth   = parseInt(searchParams.get("end_month")   ?? String(startMonth))

    const months = Array.from(
      { length: endMonth - startMonth + 1 },
      (_, i) => startMonth + i
    ).filter(m => m >= 1 && m <= 12)

    const monthLabels: Record<number, string> = {}
    months.forEach(m => { monthLabels[m] = BULAN_ID[m] })

    // Load shared DB data once
    const { vehicles, kontrakByVehicle, penjualanMap } = await loadSharedData()

    // Build data per bulan
    const r2Income:    Record<number, number> = {}
    const r4Income:    Record<number, number> = {}
    const salesIncome: Record<number, number> = {}
    const r2Units:     Record<number, number> = {}
    const r4Units:     Record<number, number> = {}

    // Vehicle maps per month (for trend detection)
    const vehicleMapByMonth: Record<number, VehicleMonthMap> = {}

    for (const month of months) {
      const data = getActiveVehicles(year, month, vehicles, kontrakByVehicle, penjualanMap)
      r2Income[month]    = data.r2Nominal
      r4Income[month]    = data.r4Nominal
      r2Units[month]     = data.r2Unit
      r4Units[month]     = data.r4Unit
      salesIncome[month] = await getMonthlySales(year, month)

      vehicleMapByMonth[month] = {
        r2: new Map(data.r2.map(v => [v.id, v])),
        r4: new Map(data.r4.map(v => [v.id, v])),
      }
    }

    // Build vehicle trend details (same as pedami buildVehicleTrendDetails)
    const vehicleTrendDetails: Record<"r2" | "r4", Record<number, VehicleTrendChange>> = {
      r2: {}, r4: {}
    }

    let prevMaps: typeof vehicleMapByMonth[number] | null = null
    for (const month of months) {
      const curr = vehicleMapByMonth[month]
      if (prevMaps) {
        for (const type of ["r2", "r4"] as const) {
          const prevIds = Array.from(prevMaps[type].keys())
          const currIds = Array.from(curr[type].keys())
          vehicleTrendDetails[type][month] = {
            added:   currIds.filter(id => !prevIds.includes(id)).map(id => curr[type].get(id)),
            removed: prevIds.filter(id => !currIds.includes(id)).map(id => prevMaps![type].get(id)),
          }
        }
      } else {
        vehicleTrendDetails.r2[month] = { added: [], removed: [] }
        vehicleTrendDetails.r4[month] = { added: [], removed: [] }
      }
      prevMaps = curr
    }

    const makeRow = (label: string, data: Record<number, number>) => ({
      label,
      months: data,
      total: Object.values(data).reduce((s, v) => s + v, 0),
    })

    const incomeRows = [
      makeRow("Tagihan sewa kendaraan Roda Dua (R2)", r2Income),
      makeRow("Tagihan sewa kendaraan Roda Empat (R4)", r4Income),
      makeRow("Penjualan Kendaraan", salesIncome),
    ]
    const unitRows = [
      makeRow("Unit Roda Dua (R2)", r2Units),
      makeRow("Unit Roda Empat (R4)", r4Units),
    ]

    const incomeTotalsByMonth: Record<number, number> = {}
    months.forEach(m => {
      incomeTotalsByMonth[m] = (r2Income[m] ?? 0) + (r4Income[m] ?? 0) + (salesIncome[m] ?? 0)
    })

    const grandTotal = Object.values(incomeTotalsByMonth).reduce((s, v) => s + v, 0)

    const periodLabel = startMonth === endMonth
      ? `${BULAN_ID[startMonth]} ${year}`
      : `${BULAN_ID[startMonth]} – ${BULAN_ID[endMonth]} ${year}`

    return NextResponse.json(serialize({
      periodLabel, year, startMonth, endMonth, months, monthLabels,
      incomeRows, unitRows, incomeTotalsByMonth, grandTotal,
      vehicleTrendDetails,
    }))
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: "Gagal mengambil laporan" }, { status: 500 })
  }
}

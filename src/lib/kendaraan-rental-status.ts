import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"

export const STATUS_SEWA_KONTRAK_BERJALAN = "Sewa - Kontrak Berjalan"
export const STATUS_SEWA_DIHENTIKAN = "Sewa dihentikan"
export const STATUS_HABIS_KONTRAK = "Habis Kontrak"

function startOfDate(value: Date): Date {
  const date = new Date(value)
  date.setHours(0, 0, 0, 0)
  return date
}

function isSameOrBeforeToday(value: Date): boolean {
  return startOfDate(value).getTime() <= startOfDate(new Date()).getTime()
}

function isContractActive(tglAwal: Date, tglAkhir: Date): boolean {
  const today = startOfDate(new Date())
  return today >= startOfDate(tglAwal) && today <= startOfDate(tglAkhir)
}

function dateValueTime(value: unknown): number | null {
  if (!value) return null
  if (!(value instanceof Date)) return null
  return startOfDate(value).getTime()
}

function uniqueVehicleIds(kendaraanIds: number[]): number[] {
  return [...new Set(kendaraanIds.filter((id) => Number.isFinite(id) && id > 0))]
}

type VehicleContractBilling = {
  activeEnd: Date | null
  latestEnd: Date | null
}

async function getContractBillingByVehicleIds(kendaraanIds: number[]): Promise<Map<number, VehicleContractBilling>> {
  const ids = uniqueVehicleIds(kendaraanIds)
  if (ids.length === 0) return new Map()

  const details = await prisma.kontrak_details.findMany({
    where: { data_r2r4_id: { in: ids } },
  })
  const kontrakIds = uniqueVehicleIds(details.map((detail) => detail.kontrak_id))
  if (kontrakIds.length === 0) return new Map()

  const kontraks = await prisma.kontraks.findMany({
    where: { id: { in: kontrakIds.map((id) => BigInt(id)) } },
    select: { id: true, tgl_awal: true, tgl_akhir: true },
  })
  const kontrakMap = new Map(kontraks.map((kontrak) => [Number(kontrak.id), kontrak]))

  const billingByVehicle = new Map<number, VehicleContractBilling>()
  for (const detail of details) {
    if (!detail.data_r2r4_id) continue

    const kontrak = kontrakMap.get(detail.kontrak_id)
    if (!kontrak) continue

    const existing = billingByVehicle.get(detail.data_r2r4_id) ?? { activeEnd: null, latestEnd: null }
    if (!existing.latestEnd || startOfDate(kontrak.tgl_akhir).getTime() > startOfDate(existing.latestEnd).getTime()) {
      existing.latestEnd = kontrak.tgl_akhir
    }
    if (
      isContractActive(kontrak.tgl_awal, kontrak.tgl_akhir)
      && (!existing.activeEnd || startOfDate(kontrak.tgl_akhir).getTime() > startOfDate(existing.activeEnd).getTime())
    ) {
      existing.activeEnd = kontrak.tgl_akhir
    }
    billingByVehicle.set(detail.data_r2r4_id, existing)
  }

  return billingByVehicle
}

export function applyManualStopTagihanStatus(
  data: Prisma.data_r2r4sUncheckedCreateInput | Prisma.data_r2r4sUncheckedUpdateInput,
  existingStatus?: string | null,
  existingStopTagihan?: Date | null,
) {
  if (!Object.prototype.hasOwnProperty.call(data, "tgl_stop_tagihan")) return data
  if (!data.tgl_stop_tagihan) return data
  if (dateValueTime(data.tgl_stop_tagihan) === dateValueTime(existingStopTagihan)) return data

  const status = existingStatus ?? (typeof data.stat === "string" ? data.stat : null)
  if (status === STATUS_SEWA_KONTRAK_BERJALAN) {
    data.stat = STATUS_SEWA_DIHENTIKAN
  }

  return data
}

type SyncRunningContractBillingOptions = {
  includeHabisKontrak?: boolean
}

export async function syncRunningContractBilling(kendaraanIds?: number[], options: SyncRunningContractBillingOptions = {}) {
  const syncedStatuses = options.includeHabisKontrak
    ? [STATUS_SEWA_KONTRAK_BERJALAN, STATUS_HABIS_KONTRAK]
    : [STATUS_SEWA_KONTRAK_BERJALAN]
  const where = kendaraanIds
    ? { id: { in: uniqueVehicleIds(kendaraanIds).map((id) => BigInt(id)) }, stat: { in: syncedStatuses } }
    : { stat: { in: syncedStatuses } }

  const runningVehicles = await prisma.data_r2r4s.findMany({
    where,
    select: { id: true, stat: true, tgl_stop_tagihan: true },
  })
  const runningIds = runningVehicles.map((vehicle) => Number(vehicle.id))
  if (runningIds.length === 0) return

  const billingByVehicle = await getContractBillingByVehicleIds(runningIds)

  const updates: Promise<unknown>[] = []

  for (const vehicle of runningVehicles) {
    const id = Number(vehicle.id)
    const billing = billingByVehicle.get(id) ?? { activeEnd: null, latestEnd: null }
    const tglAkhir = billing.activeEnd ?? billing.latestEnd
    const nextStatus = billing.activeEnd
      ? STATUS_SEWA_KONTRAK_BERJALAN
      : tglAkhir && isSameOrBeforeToday(tglAkhir)
      ? STATUS_HABIS_KONTRAK
      : STATUS_SEWA_KONTRAK_BERJALAN

    if (
      dateValueTime(tglAkhir) === dateValueTime(vehicle.tgl_stop_tagihan)
      && nextStatus === vehicle.stat
    ) {
      continue
    }

    const data: Prisma.data_r2r4sUncheckedUpdateInput = {
      tgl_stop_tagihan: tglAkhir,
      updated_at: new Date(),
    }

    if (nextStatus !== vehicle.stat) {
      data.stat = nextStatus
    }

    const update = prisma.data_r2r4s.update({
      where: { id: BigInt(id) },
      data,
    })
    updates.push(update)
  }

  await Promise.all(updates)
}

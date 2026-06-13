import { prisma } from "@/lib/prisma"

export type SdmValidationModule = "cuti" | "izin" | "sakit" | "lembur"

export interface SdmConflict {
  module: SdmValidationModule
  id: string
  label: string
  status: string
  tanggal_mulai: Date
  tanggal_selesai: Date
}

export interface CheckSdmConflictsParams {
  karyawanId: bigint
  tanggalMulai: Date
  tanggalSelesai?: Date
  modules?: SdmValidationModule[]
  exclude?: Partial<Record<SdmValidationModule, bigint>>
  includeIzinJam?: boolean
}

const ACTIVE_REQUEST_STATUSES = ["submitted", "approved_supervisor", "approved_hrd"]
const ACTIVE_LEMBUR_STATUSES = ["submitted", "approved_supervisor", "approved_hrd", "realized"]

function formatTanggal(date: Date): string {
  return date.toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" })
}

function formatRentang(tanggalMulai: Date, tanggalSelesai: Date): string {
  const mulai = formatTanggal(tanggalMulai)
  const selesai = formatTanggal(tanggalSelesai)
  return mulai === selesai ? mulai : `${mulai} - ${selesai}`
}

export function buildSdmConflictMessage(conflicts: SdmConflict[]): string {
  if (conflicts.length === 0) return ""

  const detail = conflicts
    .map(c => `${c.label} (${formatRentang(c.tanggal_mulai, c.tanggal_selesai)}, status: ${c.status})`)
    .join("; ")

  return `Karyawan sudah memiliki pengajuan aktif pada rentang tanggal tersebut: ${detail}.`
}

export async function checkSdmConflicts(params: CheckSdmConflictsParams): Promise<{
  hasConflict: boolean
  conflicts: SdmConflict[]
  message: string
}> {
  const tanggalMulai = params.tanggalMulai
  const tanggalSelesai = params.tanggalSelesai ?? params.tanggalMulai
  const modules = params.modules ?? ["cuti", "izin", "sakit", "lembur"]
  const includeIzinJam = params.includeIzinJam ?? true
  const conflicts: SdmConflict[] = []

  if (modules.includes("cuti")) {
    const cutis = await prisma.pengajuan_cutis.findMany({
      where: {
        karyawan_id: params.karyawanId,
        status: { in: ACTIVE_REQUEST_STATUSES },
        tanggal_mulai: { lte: tanggalSelesai },
        tanggal_selesai: { gte: tanggalMulai },
        ...(params.exclude?.cuti ? { NOT: { id: params.exclude.cuti } } : {}),
      },
      select: {
        id: true,
        status: true,
        tanggal_mulai: true,
        tanggal_selesai: true,
        jenis_cutis: { select: { nama_cuti: true } },
      },
    })

    for (const cuti of cutis) {
      conflicts.push({
        module: "cuti",
        id: cuti.id.toString(),
        label: `Cuti ${cuti.jenis_cutis.nama_cuti}`,
        status: cuti.status,
        tanggal_mulai: cuti.tanggal_mulai,
        tanggal_selesai: cuti.tanggal_selesai,
      })
    }
  }

  if (modules.includes("izin")) {
    const izins = await prisma.pengajuan_izins.findMany({
      where: {
        karyawan_id: params.karyawanId,
        status: { in: ACTIVE_REQUEST_STATUSES },
        tanggal_mulai: { lte: tanggalSelesai },
        tanggal_selesai: { gte: tanggalMulai },
        ...(includeIzinJam ? {} : { satuan_durasi: "hari" }),
        ...(params.exclude?.izin ? { NOT: { id: params.exclude.izin } } : {}),
      },
      select: {
        id: true,
        status: true,
        tanggal_mulai: true,
        tanggal_selesai: true,
        satuan_durasi: true,
        jenis_izins: { select: { nama_izin: true } },
      },
    })

    for (const izin of izins) {
      conflicts.push({
        module: "izin",
        id: izin.id.toString(),
        label: `Izin ${izin.jenis_izins.nama_izin}${izin.satuan_durasi === "jam" ? " (jam)" : ""}`,
        status: izin.status,
        tanggal_mulai: izin.tanggal_mulai,
        tanggal_selesai: izin.tanggal_selesai,
      })
    }
  }

  if (modules.includes("sakit")) {
    const sakits = await prisma.pengajuan_sakits.findMany({
      where: {
        karyawan_id: params.karyawanId,
        status: { in: ACTIVE_REQUEST_STATUSES },
        tanggal_mulai: { lte: tanggalSelesai },
        tanggal_selesai: { gte: tanggalMulai },
        ...(params.exclude?.sakit ? { NOT: { id: params.exclude.sakit } } : {}),
      },
      select: { id: true, status: true, tanggal_mulai: true, tanggal_selesai: true },
    })

    for (const sakit of sakits) {
      conflicts.push({
        module: "sakit",
        id: sakit.id.toString(),
        label: "Sakit",
        status: sakit.status,
        tanggal_mulai: sakit.tanggal_mulai,
        tanggal_selesai: sakit.tanggal_selesai,
      })
    }
  }

  if (modules.includes("lembur")) {
    const lemburs = await prisma.overtime_requests.findMany({
      where: {
        karyawan_id: params.karyawanId,
        status: { in: ACTIVE_LEMBUR_STATUSES },
        tanggal_lembur: { gte: tanggalMulai, lte: tanggalSelesai },
        ...(params.exclude?.lembur ? { NOT: { id: params.exclude.lembur } } : {}),
      },
      select: {
        id: true,
        status: true,
        tanggal_lembur: true,
        jam_mulai_rencana: true,
        jam_selesai_rencana: true,
      },
    })

    for (const lembur of lemburs) {
      conflicts.push({
        module: "lembur",
        id: lembur.id.toString(),
        label: `Lembur ${lembur.jam_mulai_rencana.slice(0, 5)}-${lembur.jam_selesai_rencana.slice(0, 5)}`,
        status: lembur.status,
        tanggal_mulai: lembur.tanggal_lembur,
        tanggal_selesai: lembur.tanggal_lembur,
      })
    }
  }

  return {
    hasConflict: conflicts.length > 0,
    conflicts,
    message: buildSdmConflictMessage(conflicts),
  }
}

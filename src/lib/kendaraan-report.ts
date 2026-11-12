import { prisma } from "@/lib/prisma"

export interface KendaraanReportFilters {
  jns_brg?: string | null
  stat?: string | null
}

export function getKendaraanReportRecords(filters: KendaraanReportFilters) {
  return prisma.data_r2r4s.findMany({
    where: {
      ...(filters.jns_brg ? { jns_brg: filters.jns_brg } : {}),
      ...(filters.stat ? { stat: filters.stat } : {}),
    },
    orderBy: { kode_brg: "asc" },
  })
}

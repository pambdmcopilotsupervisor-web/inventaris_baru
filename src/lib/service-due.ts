import { prisma } from "@/lib/prisma"

const SERVICE_DUE_MONTHS = 6

let ensureServiceDueColumnsPromise: Promise<boolean> | null = null

export function calculateServiceDueDate(serviceDate: string | Date): Date {
  const date = serviceDate instanceof Date ? new Date(serviceDate) : new Date(serviceDate)
  date.setMonth(date.getMonth() + SERVICE_DUE_MONTHS)
  return date
}

async function ensureColumn(tableName: string, afterColumn: string): Promise<void> {
  const rows = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*) AS count
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = ${tableName}
      AND COLUMN_NAME = 'jatuh_tempo_berikutnya'
  `

  if (Number(rows[0]?.count ?? 0) === 0) {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE ${tableName} ADD COLUMN jatuh_tempo_berikutnya DATE NULL AFTER ${afterColumn}`
    )
  }
}

export function ensureServiceDueColumns(): Promise<boolean> {
  ensureServiceDueColumnsPromise ??= (async () => {
    await ensureColumn("riwayat_servis_r2r4s", "tanggal_servis")
    await ensureColumn("riwayat_service_acs", "tanggal_service")
    await prisma.$executeRaw`
      UPDATE riwayat_servis_r2r4s
      SET jatuh_tempo_berikutnya = DATE_ADD(tanggal_servis, INTERVAL 6 MONTH)
    `
    await prisma.$executeRaw`
      UPDATE riwayat_service_acs
      SET jatuh_tempo_berikutnya = DATE_ADD(tanggal_service, INTERVAL 6 MONTH)
    `
    await prisma.$executeRawUnsafe(`
      UPDATE data_r2r4s k
      SET service = (
        SELECT r.jatuh_tempo_berikutnya
        FROM riwayat_servis_r2r4s r
        WHERE r.data_r2r4_id = k.id
        ORDER BY r.tanggal_servis DESC, r.id DESC
        LIMIT 1
      )
      WHERE EXISTS (
        SELECT 1 FROM riwayat_servis_r2r4s r
        WHERE r.data_r2r4_id = k.id
      )
    `)
    return true
  })().catch((error) => {
    console.error("[service-due] Gagal memastikan kolom jatuh tempo service:", error)
    ensureServiceDueColumnsPromise = null
    return false
  })

  return ensureServiceDueColumnsPromise
}

export async function syncKendaraanServiceDueDate(dataR2r4Id: bigint | number): Promise<void> {
  const latest = await prisma.riwayat_servis_r2r4s.findFirst({
    where: { data_r2r4_id: BigInt(dataR2r4Id) },
    orderBy: [{ tanggal_servis: "desc" }, { id: "desc" }],
    select: { jatuh_tempo_berikutnya: true },
  })

  await prisma.data_r2r4s.update({
    where: { id: BigInt(dataR2r4Id) },
    data: { service: latest?.jatuh_tempo_berikutnya ?? null },
  })
}

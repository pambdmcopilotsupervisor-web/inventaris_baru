import { prisma } from "@/lib/prisma"

let ensureBuktiNotaColumnPromise: Promise<boolean> | null = null

export function ensureAssetBuktiNotaColumn(): Promise<boolean> {
  ensureBuktiNotaColumnPromise ??= (async () => {
    const rows = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) AS count
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'assets'
        AND COLUMN_NAME = 'bukti_nota'
    `

    if (Number(rows[0]?.count ?? 0) === 0) {
      await prisma.$executeRawUnsafe("ALTER TABLE assets ADD COLUMN bukti_nota VARCHAR(100) NULL AFTER gambar")
    }

    return true
  })().catch((error) => {
    console.error("[asset-schema] Gagal memastikan kolom bukti_nota:", error)
    ensureBuktiNotaColumnPromise = null
    return false
  })

  return ensureBuktiNotaColumnPromise
}

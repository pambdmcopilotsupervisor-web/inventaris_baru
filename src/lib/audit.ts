import { prisma } from "@/lib/prisma"
import { SessionUser } from "@/lib/session"
import type { Prisma } from "@prisma/client"

type DbClient = typeof prisma | Prisma.TransactionClient

interface AuditParams {
  user?: SessionUser | null
  action: "CREATE" | "UPDATE" | "DELETE"
  modelType: string
  modelId?: number | bigint | null
  dataLama?: unknown
  dataBaru?: unknown
  ip?: string | null
  tx?: DbClient
}

/**
 * Tulis audit log. Kegagalan tidak boleh menghentikan flow utama.
 */
export async function writeAuditLog({
  user, action, modelType, modelId, dataLama, dataBaru, ip, tx,
}: AuditParams): Promise<void> {
  try {
    const db = tx ?? prisma
    await db.audit_logs.create({
      data: {
        user_id:    user?.id   ? BigInt(user.id)   : null,
        user_name:  user?.name ?? null,
        action,
        model_type: modelType,
        model_id:   modelId != null ? BigInt(modelId as number) : null,
        data_lama:  dataLama !== undefined ? (dataLama as object) : undefined,
        data_baru:  dataBaru !== undefined ? (dataBaru as object) : undefined,
        ip_address: ip ?? null,
        created_at: new Date(),
      },
    })
  } catch {
    // Audit log gagal tidak merusak flow utama
  }
}

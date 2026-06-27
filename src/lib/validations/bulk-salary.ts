/**
 * Skema validasi Zod — Penyesuaian Gaji Massal (bulk salary adjustment).
 */
import { z } from "zod"

export const bulkAdjustSchema = z.object({
  component_id: z.coerce.number().int().positive("Komponen wajib dipilih"),
  scope: z.enum(["ALL", "JABATAN"]),
  jabatan: z.string().trim().max(255).optional().or(z.literal("")),
  mode: z.enum(["PERCENT", "NOMINAL_ADD", "NOMINAL_SET"]),
  value: z.coerce.number(),
  effective_date: z.coerce.date({ message: "Tanggal berlaku tidak valid" }),
}).refine((d) => d.scope !== "JABATAN" || (d.jabatan && d.jabatan.length > 0), {
  message: "Jabatan wajib dipilih untuk scope per jabatan",
  path: ["jabatan"],
}).refine((d) => d.mode !== "NOMINAL_SET" || d.value >= 0, {
  message: "Nilai set tidak boleh negatif",
  path: ["value"],
})

export type BulkAdjustInput = z.input<typeof bulkAdjustSchema>

export function firstZodError(err: z.ZodError): string {
  return err.issues[0]?.message ?? "Data tidak valid"
}

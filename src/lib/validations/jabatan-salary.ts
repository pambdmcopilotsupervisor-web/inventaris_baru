/**
 * Skema validasi Zod — Komponen Gaji per Jabatan.
 */
import { z } from "zod"

export const assignJabatanComponentSchema = z.object({
  jabatan: z.string().trim().min(1, "Jabatan wajib dipilih").max(255),
  component_id: z.coerce.number().int().positive("Komponen wajib dipilih"),
  value: z.coerce.number().min(0, "Nilai tidak boleh negatif"),
  effective_date: z.coerce.date({ message: "Tanggal berlaku tidak valid" }),
  end_date: z.union([z.coerce.date(), z.literal(""), z.null(), z.undefined()]).optional().transform((v) => (v === "" || v == null ? undefined : v instanceof Date ? v : undefined)),
}).refine((d) => {
  if (!d.end_date) return true
  return d.end_date >= d.effective_date
}, { message: "Tanggal sampai tidak boleh sebelum tanggal berlaku", path: ["end_date"] })

export type AssignJabatanComponentInput = z.input<typeof assignJabatanComponentSchema>

export const endJabatanComponentSchema = z.object({
  id: z.coerce.number().int().positive("ID tidak valid"),
  end_date: z.coerce.date({ message: "Tanggal akhir tidak valid" }),
})

export function firstZodError(err: z.ZodError): string {
  return err.issues[0]?.message ?? "Data tidak valid"
}

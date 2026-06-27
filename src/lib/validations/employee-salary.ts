/**
 * Skema validasi Zod — Assignment Komponen Gaji ke Karyawan.
 * Dipisah dari file server actions agar dapat dipakai komponen client.
 */
import { z } from "zod"

export const assignComponentSchema = z.object({
  employee_id: z.coerce.number().int().positive("Karyawan tidak valid"),
  component_id: z.coerce.number().int().positive("Komponen wajib dipilih"),
  value: z.coerce.number().min(0, "Nilai tidak boleh negatif"),
  effective_date: z.coerce.date({ message: "Tanggal berlaku tidak valid" }),
  end_date: z.union([z.coerce.date(), z.literal(""), z.null(), z.undefined()]).optional().transform((v) => (v === "" || v == null ? undefined : v instanceof Date ? v : undefined)),
}).refine((d) => {
  if (!d.end_date) return true
  return d.end_date >= d.effective_date
}, { message: "Tanggal sampai tidak boleh sebelum tanggal berlaku", path: ["end_date"] })

export type AssignComponentInput = z.input<typeof assignComponentSchema>

export const endComponentSchema = z.object({
  id: z.coerce.number().int().positive("ID tidak valid"),
  end_date: z.coerce.date({ message: "Tanggal akhir tidak valid" }),
})

export type EndComponentInput = z.input<typeof endComponentSchema>

export function firstZodError(err: z.ZodError): string {
  return err.issues[0]?.message ?? "Data tidak valid"
}

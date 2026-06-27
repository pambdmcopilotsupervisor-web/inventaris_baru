/**
 * Skema validasi Zod — Penyesuaian Sekali Jalan (one-time adjustment).
 * Dipisah dari server actions agar dapat dipakai komponen client.
 */
import { z } from "zod"

export const adjustmentSchema = z.object({
  payroll_period_id: z.coerce.number().int().positive("Periode tidak valid"),
  employee_id: z.coerce.number().int().positive("Karyawan wajib dipilih"),
  type: z.enum(["EARNING", "DEDUCTION"]),
  label: z.string().trim().min(1, "Keterangan wajib diisi").max(150),
  amount: z.coerce.number().positive("Nominal harus lebih dari 0"),
  is_taxable: z.boolean().default(false),
  notes: z.string().trim().max(255).optional().or(z.literal("")),
})

export type AdjustmentInput = z.input<typeof adjustmentSchema>

export function firstZodError(err: z.ZodError): string {
  return err.issues[0]?.message ?? "Data tidak valid"
}

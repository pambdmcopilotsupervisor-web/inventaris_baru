/**
 * Skema validasi Zod — Pinjaman/Cicilan Karyawan.
 * Dipisah dari file server actions agar dapat dipakai komponen client.
 */
import { z } from "zod"

export const loanSchema = z.object({
  employee_id: z.coerce.number().int().positive("Karyawan wajib dipilih"),
  title: z.string().trim().min(1, "Judul/keterangan wajib diisi").max(150),
  loan_number: z.string().trim().max(40).optional().or(z.literal("")),
  principal_amount: z.coerce.number().positive("Pokok pinjaman harus lebih dari 0"),
  installment_amount: z.coerce.number().positive("Cicilan per bulan harus lebih dari 0"),
  start_month: z.coerce.number().int().min(1, "Bulan tidak valid").max(12, "Bulan tidak valid"),
  start_year: z.coerce.number().int().min(2000, "Tahun tidak valid").max(2100, "Tahun tidak valid"),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
}).refine((d) => d.installment_amount <= d.principal_amount, {
  message: "Cicilan per bulan tidak boleh melebihi pokok pinjaman",
  path: ["installment_amount"],
})

export type LoanInput = z.input<typeof loanSchema>

export const updateLoanSchema = z.object({
  id: z.coerce.number().int().positive("ID tidak valid"),
  title: z.string().trim().min(1, "Judul/keterangan wajib diisi").max(150),
  loan_number: z.string().trim().max(40).optional().or(z.literal("")),
  installment_amount: z.coerce.number().positive("Cicilan per bulan harus lebih dari 0"),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
})

export type UpdateLoanInput = z.input<typeof updateLoanSchema>

export function firstZodError(err: z.ZodError): string {
  return err.issues[0]?.message ?? "Data tidak valid"
}

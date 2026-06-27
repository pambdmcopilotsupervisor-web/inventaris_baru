/**
 * Skema validasi Zod — Master Komponen Gaji.
 * Dipisah dari file server actions ("use server") agar nilai schema dapat
 * diimport oleh komponen client (react-hook-form) maupun server actions.
 */
import { z } from "zod"

const COMPONENT_TYPES = ["EARNING", "DEDUCTION"] as const
const CALC_METHODS = ["FIXED", "PERCENT", "FORMULA"] as const

export const salaryComponentSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(1, "Kode wajib diisi")
      .max(40, "Kode maksimal 40 karakter")
      .regex(/^[A-Z0-9_]+$/, "Kode hanya boleh huruf kapital, angka, dan underscore"),
    name: z.string().trim().min(1, "Nama wajib diisi").max(150, "Nama maksimal 150 karakter"),
    type: z.enum(COMPONENT_TYPES),
    calc_method: z.enum(CALC_METHODS),
    // Untuk PERCENT: persentase 0–100 (disimpan ke formula_expression)
    percent: z
      .preprocess((v) => (v === "" || v === null ? undefined : v), z.coerce.number().min(0, "Minimal 0").max(100, "Maksimal 100"))
      .optional(),
    // Untuk FORMULA: ekspresi matematika
    formula_expression: z.string().trim().max(1000, "Formula maksimal 1000 karakter").nullish(),
    basis_component_id: z
      .preprocess((v) => (v === "" || v === null ? undefined : v), z.coerce.number().int().positive())
      .optional(),
    calc_order: z.coerce.number().int().min(0, "Urutan tidak boleh negatif").default(0),
    is_taxable: z.boolean().default(false),
    is_active: z.boolean().default(true),
    is_prorata: z.boolean().default(false),
    is_thr_basis: z.boolean().default(false),
  })
  .superRefine((d, ctx) => {
    if (d.calc_method === "FORMULA" && !d.formula_expression?.trim()) {
      ctx.addIssue({ code: "custom", path: ["formula_expression"], message: "Formula wajib diisi untuk metode FORMULA" })
    }
    if (d.calc_method === "PERCENT") {
      if (d.percent === null || d.percent === undefined) {
        ctx.addIssue({ code: "custom", path: ["percent"], message: "Persentase wajib diisi (0–100)" })
      }
      if (!d.basis_component_id) {
        ctx.addIssue({ code: "custom", path: ["basis_component_id"], message: "Komponen acuan wajib dipilih untuk metode PERCENT" })
      }
    }
  })

export type SalaryComponentInput = z.input<typeof salaryComponentSchema>

export const CALC_METHOD_VALUES = CALC_METHODS

export function firstZodError(err: z.ZodError): string {
  return err.issues[0]?.message ?? "Data tidak valid"
}

/**
 * Skema validasi Zod — Pengaturan Pajak & BPJS.
 */
import { z } from "zod"

export const bpjsSettingSchema = z.object({
  id: z.coerce.number().int().positive().nullish(),
  kode: z.string().trim().min(1, "Kode wajib").max(20).regex(/^[A-Z0-9_]+$/, "Kode huruf kapital/angka"),
  nama: z.string().trim().min(1, "Nama wajib").max(100),
  rate_karyawan: z.coerce.number().min(0).max(100),
  rate_perusahaan: z.coerce.number().min(0).max(100),
  batas_atas_upah: z.preprocess((v) => (v === "" || v === null ? null : v), z.coerce.number().min(0).nullable()),
  basis_component_code: z.string().trim().min(1).max(40).default("GAJI_POKOK"),
  menambah_bruto_pajak: z.boolean().default(false),
  pengurang_pajak: z.boolean().default(false),
  is_active: z.boolean().default(true),
  urutan: z.coerce.number().int().min(0).default(0),
})
export type BpjsSettingInputForm = z.input<typeof bpjsSettingSchema>

export const ptkpSettingSchema = z.object({
  id: z.coerce.number().int().positive().nullish(),
  kode: z.string().trim().min(1, "Kode wajib").max(10),
  nama: z.string().trim().min(1, "Nama wajib").max(100),
  nominal_setahun: z.coerce.number().min(0, "Tidak boleh negatif"),
  kategori_ter: z.enum(["A", "B", "C"]),
  is_active: z.boolean().default(true),
  urutan: z.coerce.number().int().min(0).default(0),
})
export type PtkpSettingInputForm = z.input<typeof ptkpSettingSchema>


export const taxConfigSchema = z.object({
  biaya_jabatan_persen: z.coerce.number().min(0).max(100),
  biaya_jabatan_maks_bulan: z.coerce.number().min(0),
  metode_pph21: z.enum(["PROGRESIF", "TER"]).default("PROGRESIF"),
  npwp_surcharge_persen: z.coerce.number().min(0).max(100),
  pembulatan_pph: z.coerce.number().int().min(0),
  pembulatan_gaji: z.coerce.number().int().min(0),
  bpjs_enabled: z.boolean().default(true),
  pph21_enabled: z.boolean().default(true),
})
export type TaxConfigInputForm = z.input<typeof taxConfigSchema>

export const bracketSchema = z.object({
  urutan: z.coerce.number().int().min(0),
  batas_bawah: z.coerce.number().min(0),
  batas_atas: z.preprocess((v) => (v === "" || v === null ? null : v), z.coerce.number().min(0).nullable()),
  tarif_persen: z.coerce.number().min(0).max(100),
})
export const bracketsSchema = z.array(bracketSchema).min(1, "Minimal 1 lapisan")
export type BracketInputForm = z.input<typeof bracketSchema>

export const terRateSchema = z.object({
  bruto_min: z.coerce.number().min(0),
  bruto_max: z.preprocess((v) => (v === "" || v === null ? null : v), z.coerce.number().min(0).nullable()),
  tarif_persen: z.coerce.number().min(0).max(100),
})
export const terRatesSchema = z.array(terRateSchema).min(1, "Minimal 1 lapisan TER")
export type TerRateInputForm = z.input<typeof terRateSchema>

export const employeeTaxProfileSchema = z.object({
  employee_id: z.coerce.number().int().positive(),
  status_ptkp: z.string().trim().min(1, "Status PTKP wajib").max(10),
  punya_npwp: z.boolean().default(true),
})
export type EmployeeTaxProfileInput = z.input<typeof employeeTaxProfileSchema>

export function firstZodError(err: z.ZodError): string {
  return err.issues[0]?.message ?? "Data tidak valid"
}

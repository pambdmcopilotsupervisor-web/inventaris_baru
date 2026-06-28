/**
 * Skema validasi Zod — Aturan Potongan Absensi.
 * Dipisah dari file server actions agar dapat dipakai komponen client.
 */
import { z } from "zod"

export const TRIGGER_TYPES = ["ALFA", "LATE", "EARLY_LEAVE", "SICK_NO_CERT"] as const
export const DEDUCTION_METHODS = ["PER_DAY", "PER_HOUR", "PER_MINUTE", "FLAT", "PERCENT"] as const
export const TIER_TYPES = ["FIXED", "PERCENT", "PER_HOUR"] as const

export const lateTierSchema = z.object({
  late_from_minutes: z.coerce.number().int().min(0, "Menit awal tidak boleh negatif"),
  late_to_minutes: z.preprocess(
    // String kosong, null, undefined → null (tier tanpa batas akhir)
    (v) => (v === "" || v === null || v === undefined ? null : Number(v)),
    z.number().int().positive().nullable(),
  ),
  deduction_type: z.enum(TIER_TYPES),
  deduction_value: z.coerce.number().min(0, "Nilai tidak boleh negatif"),
})

export type LateTierInput = z.input<typeof lateTierSchema>

export const deductionRuleSchema = z
  .object({
    name: z.string().trim().min(1, "Nama aturan wajib diisi").max(150, "Nama maksimal 150 karakter"),
    trigger_type: z.enum(TRIGGER_TYPES),
    calc_method: z.enum(DEDUCTION_METHODS),
    basis_component_id: z
      .preprocess((v) => (v === "" || v === null ? undefined : v), z.coerce.number().int().positive())
      .nullish(),
    value: z.coerce.number().min(0, "Nilai tidak boleh negatif").default(0),
    working_days: z.coerce.number().int().min(1, "Hari kerja minimal 1").max(31, "Hari kerja maksimal 31").default(22),
    tolerance_minutes: z
      .preprocess((v) => (v === "" || v === null ? undefined : v), z.coerce.number().int().min(0))
      .nullish(),
    max_deduction_per_month: z
      .preprocess((v) => (v === "" || v === null ? undefined : v), z.coerce.number().min(0))
      .nullish(),
    is_active: z.boolean().default(true),
    tiers: z.array(lateTierSchema).default([]),
  })
  .superRefine((d, ctx) => {
    // LATE wajib minimal 1 tier
    if (d.trigger_type === "LATE") {
      if (!d.tiers || d.tiers.length === 0) {
        ctx.addIssue({ code: "custom", path: ["tiers"], message: "Trigger LATE wajib memiliki minimal 1 tier keterlambatan" })
      }
    }
    // basis_component wajib untuk PERCENT / PER_DAY / PER_HOUR
    if (["PERCENT", "PER_DAY", "PER_HOUR"].includes(d.calc_method) && d.trigger_type !== "LATE") {
      if (!d.basis_component_id) {
        ctx.addIssue({ code: "custom", path: ["basis_component_id"], message: "Komponen acuan wajib diisi untuk metode ini" })
      }
    }
  })

export type DeductionRuleInput = z.input<typeof deductionRuleSchema>

export const simulateInputSchema = z.object({
  alfa_days: z.coerce.number().min(0).default(0),
  late_minutes: z.coerce.number().min(0).default(0),
  early_leave_minutes: z.coerce.number().min(0).default(0),
  sick_no_cert_days: z.coerce.number().min(0).default(0),
  basis_value: z.coerce.number().min(0).default(0),
})

export type SimulateInput = z.input<typeof simulateInputSchema>

/** Validasi tier: tidak boleh overlap & harus ada tier unbounded (late_to_minutes = null). */
export function validateTiers(
  tiers: Array<{ late_from_minutes: number; late_to_minutes?: number | null }>,
): string | null {
  if (tiers.length === 0) return "Minimal 1 tier diperlukan"

  const sorted = [...tiers].sort((a, b) => a.late_from_minutes - b.late_from_minutes)
  let hasUnbounded = false
  for (let i = 0; i < sorted.length; i++) {
    const t = sorted[i]
    const to = t.late_to_minutes ?? null
    if (to === null) hasUnbounded = true
    if (to !== null && to <= t.late_from_minutes) {
      return "Menit 'sampai' harus lebih besar dari 'dari'"
    }
    // Cek overlap dengan tier berikutnya
    if (i < sorted.length - 1) {
      const next = sorted[i + 1]
      if (to === null) return "Tier unbounded (tanpa batas) harus menjadi tier terakhir"
      if (next.late_from_minutes < to) {
        return `Tier overlap: ${next.late_from_minutes} berada dalam rentang sebelumnya (≤ ${to})`
      }
    }
  }
  if (!hasUnbounded) return "Harus ada satu tier tanpa batas akhir (late_to_minutes kosong)"
  return null
}

export function firstZodError(err: z.ZodError): string {
  return err.issues[0]?.message ?? "Data tidak valid"
}

"use server"

/**
 * Server Actions — Pengaturan Pajak (PPh21) & BPJS + profil pajak karyawan.
 * Konvensi response: { success, data, error }.
 */

import { revalidatePath } from "next/cache"
import { prisma, serialize } from "@/lib/prisma"
import { getSession, type SessionUser } from "@/lib/session"
import { writeAuditLog } from "@/lib/audit"
import {
  bpjsSettingSchema,
  ptkpSettingSchema,
  bracketsSchema,
  terRatesSchema,
  taxConfigSchema,
  employeeTaxProfileSchema,
  firstZodError,
  type BpjsSettingInputForm,
  type PtkpSettingInputForm,
  type BracketInputForm,
  type TerRateInputForm,
  type TaxConfigInputForm,
  type EmployeeTaxProfileInput,
} from "@/lib/validations/payroll-tax"

export type { BpjsSettingInputForm, PtkpSettingInputForm, BracketInputForm, TerRateInputForm, TaxConfigInputForm, EmployeeTaxProfileInput }

const PAGE_PATH = "/dashboard/payroll/tax-settings"

export type ActionResult<T> =
  | { success: true; data: T; error: null }
  | { success: false; data: null; error: string }

function ok<T>(data: T): ActionResult<T> {
  return { success: true, data, error: null }
}
function fail(error: string): ActionResult<never> {
  return { success: false, data: null, error }
}

const ALLOWED_ROLES = ["admin", "hrd"]
async function requirePayrollAdmin(): Promise<{ user: SessionUser } | { error: string }> {
  try {
    const session = await getSession()
    if (!session.user) return { error: "Tidak terautentikasi" }
    const role = (session.user.role ?? "user").toLowerCase()
    if (!ALLOWED_ROLES.includes(role)) return { error: "Akses ditolak" }
    return { user: session.user }
  } catch {
    return { error: "Session tidak valid" }
  }
}

// ─── Baca semua pengaturan pajak ─────────────────────────────────
export async function getTaxSettings() {
  const auth = await requirePayrollAdmin()
  if ("error" in auth) return fail(auth.error)
  try {
    const [config, bpjs, ptkp, brackets] = await Promise.all([
      prisma.payroll_tax_configs.findFirst(),
      prisma.bpjs_settings.findMany({ orderBy: { urutan: "asc" } }),
      prisma.ptkp_settings.findMany({ orderBy: { urutan: "asc" } }),
      prisma.pph21_brackets.findMany({ orderBy: { urutan: "asc" } }),
    ])
    return ok({
      config: config ? serialize(config) : null,
      bpjs: serialize(bpjs),
      ptkp: serialize(ptkp),
      brackets: serialize(brackets),
    })
  } catch {
    return fail("Gagal memuat pengaturan pajak")
  }
}

export async function getPtkpOptions() {
  const auth = await requirePayrollAdmin()
  if ("error" in auth) return fail(auth.error)
  try {
    const rows = await prisma.ptkp_settings.findMany({ where: { is_active: true }, orderBy: { urutan: "asc" }, select: { kode: true, nama: true, nominal_setahun: true } })
    return ok(rows.map((r) => ({ kode: r.kode, nama: r.nama, nominal_setahun: Number(r.nominal_setahun) })))
  } catch {
    return fail("Gagal memuat opsi PTKP")
  }
}

// ─── Konfigurasi global ──────────────────────────────────────────
export async function updateTaxConfig(input: TaxConfigInputForm) {
  const auth = await requirePayrollAdmin()
  if ("error" in auth) return fail(auth.error)
  const parsed = taxConfigSchema.safeParse(input)
  if (!parsed.success) return fail(firstZodError(parsed.error))
  const d = parsed.data
  try {
    const existing = await prisma.payroll_tax_configs.findFirst()
    const data = {
      biaya_jabatan_persen: d.biaya_jabatan_persen,
      biaya_jabatan_maks_bulan: d.biaya_jabatan_maks_bulan,
      metode_pph21: d.metode_pph21,
      npwp_surcharge_persen: d.npwp_surcharge_persen,
      pembulatan_pph: d.pembulatan_pph,
      pembulatan_gaji: d.pembulatan_gaji,
      bpjs_enabled: d.bpjs_enabled,
      pph21_enabled: d.pph21_enabled,
      updated_at: new Date(),
    }
    const saved = existing
      ? await prisma.payroll_tax_configs.update({ where: { id: existing.id }, data })
      : await prisma.payroll_tax_configs.create({ data: { ...data, created_at: new Date() } })
    await writeAuditLog({ user: auth.user, action: "UPDATE", modelType: "payroll_tax_configs", modelId: saved.id, dataBaru: serialize(saved) })
    revalidatePath(PAGE_PATH)
    return ok(serialize(saved))
  } catch {
    return fail("Gagal menyimpan konfigurasi pajak")
  }
}

// ─── BPJS ────────────────────────────────────────────────────────
export async function saveBpjsSetting(input: BpjsSettingInputForm) {
  const auth = await requirePayrollAdmin()
  if ("error" in auth) return fail(auth.error)
  const parsed = bpjsSettingSchema.safeParse(input)
  if (!parsed.success) return fail(firstZodError(parsed.error))
  const d = parsed.data
  try {
    const dup = await prisma.bpjs_settings.findFirst({ where: { kode: d.kode, id: d.id ? { not: BigInt(d.id) } : undefined }, select: { id: true } })
    if (dup) return fail(`Kode "${d.kode}" sudah digunakan`)
    const data = {
      kode: d.kode, nama: d.nama,
      rate_karyawan: d.rate_karyawan, rate_perusahaan: d.rate_perusahaan,
      batas_atas_upah: d.batas_atas_upah ?? null,
      basis_component_code: d.basis_component_code,
      menambah_bruto_pajak: d.menambah_bruto_pajak, pengurang_pajak: d.pengurang_pajak,
      is_active: d.is_active, urutan: d.urutan, updated_at: new Date(),
    }
    const saved = d.id
      ? await prisma.bpjs_settings.update({ where: { id: BigInt(d.id) }, data })
      : await prisma.bpjs_settings.create({ data: { ...data, created_at: new Date() } })
    await writeAuditLog({ user: auth.user, action: d.id ? "UPDATE" : "CREATE", modelType: "bpjs_settings", modelId: saved.id, dataBaru: serialize(saved) })
    revalidatePath(PAGE_PATH)
    return ok(serialize(saved))
  } catch {
    return fail("Gagal menyimpan pengaturan BPJS")
  }
}

export async function deleteBpjsSetting(id: number) {
  const auth = await requirePayrollAdmin()
  if ("error" in auth) return fail(auth.error)
  if (!id) return fail("ID tidak valid")
  try {
    await prisma.bpjs_settings.delete({ where: { id: BigInt(id) } })
    await writeAuditLog({ user: auth.user, action: "DELETE", modelType: "bpjs_settings", modelId: BigInt(id) })
    revalidatePath(PAGE_PATH)
    return ok({ id })
  } catch {
    return fail("Gagal menghapus pengaturan BPJS")
  }
}

// ─── PTKP ────────────────────────────────────────────────────────
export async function savePtkpSetting(input: PtkpSettingInputForm) {
  const auth = await requirePayrollAdmin()
  if ("error" in auth) return fail(auth.error)
  const parsed = ptkpSettingSchema.safeParse(input)
  if (!parsed.success) return fail(firstZodError(parsed.error))
  const d = parsed.data
  try {
    const dup = await prisma.ptkp_settings.findFirst({ where: { kode: d.kode, id: d.id ? { not: BigInt(d.id) } : undefined }, select: { id: true } })
    if (dup) return fail(`Kode "${d.kode}" sudah digunakan`)
    const data = {
      kode: d.kode, nama: d.nama, nominal_setahun: d.nominal_setahun,
      kategori_ter: d.kategori_ter, is_active: d.is_active, urutan: d.urutan, updated_at: new Date(),
    }
    const saved = d.id
      ? await prisma.ptkp_settings.update({ where: { id: BigInt(d.id) }, data })
      : await prisma.ptkp_settings.create({ data: { ...data, created_at: new Date() } })
    await writeAuditLog({ user: auth.user, action: d.id ? "UPDATE" : "CREATE", modelType: "ptkp_settings", modelId: saved.id, dataBaru: serialize(saved) })
    revalidatePath(PAGE_PATH)
    return ok(serialize(saved))
  } catch {
    return fail("Gagal menyimpan PTKP")
  }
}

export async function deletePtkpSetting(id: number) {
  const auth = await requirePayrollAdmin()
  if ("error" in auth) return fail(auth.error)
  if (!id) return fail("ID tidak valid")
  try {
    await prisma.ptkp_settings.delete({ where: { id: BigInt(id) } })
    await writeAuditLog({ user: auth.user, action: "DELETE", modelType: "ptkp_settings", modelId: BigInt(id) })
    revalidatePath(PAGE_PATH)
    return ok({ id })
  } catch {
    return fail("Gagal menghapus PTKP")
  }
}

// ─── Bracket PPh21 (replace all) ─────────────────────────────────
export async function saveBrackets(list: BracketInputForm[]) {
  const auth = await requirePayrollAdmin()
  if ("error" in auth) return fail(auth.error)
  const parsed = bracketsSchema.safeParse(list)
  if (!parsed.success) return fail(firstZodError(parsed.error))
  const rows = parsed.data
  try {
    await prisma.$transaction(async (tx) => {
      await tx.pph21_brackets.deleteMany({})
      await tx.pph21_brackets.createMany({
        data: rows.map((r, i) => ({
          urutan: r.urutan || i + 1,
          batas_bawah: r.batas_bawah,
          batas_atas: r.batas_atas ?? null,
          tarif_persen: r.tarif_persen,
          created_at: new Date(), updated_at: new Date(),
        })),
      })
    })
    await writeAuditLog({ user: auth.user, action: "UPDATE", modelType: "pph21_brackets", dataBaru: serialize(rows) })
    revalidatePath(PAGE_PATH)
    return ok({ count: rows.length })
  } catch {
    return fail("Gagal menyimpan lapisan tarif")
  }
}

// ─── Tarif TER (per kategori, replace all) ───────────────────────
export async function getTerRates() {
  const auth = await requirePayrollAdmin()
  if ("error" in auth) return fail(auth.error)
  try {
    const rows = await prisma.pph21_ter_rates.findMany({ orderBy: [{ kategori: "asc" }, { bruto_min: "asc" }] })
    return ok(serialize(rows))
  } catch {
    return fail("Gagal memuat tarif TER")
  }
}

export async function saveTerRates(kategori: string, list: TerRateInputForm[]) {
  const auth = await requirePayrollAdmin()
  if ("error" in auth) return fail(auth.error)
  if (!["A", "B", "C"].includes(kategori)) return fail("Kategori TER tidak valid")
  const parsed = terRatesSchema.safeParse(list)
  if (!parsed.success) return fail(firstZodError(parsed.error))
  const rows = parsed.data
  try {
    await prisma.$transaction(async (tx) => {
      await tx.pph21_ter_rates.deleteMany({ where: { kategori } })
      await tx.pph21_ter_rates.createMany({
        data: rows.map((r, i) => ({
          kategori,
          bruto_min: r.bruto_min,
          bruto_max: r.bruto_max ?? null,
          tarif_persen: r.tarif_persen,
          urutan: i + 1,
          created_at: new Date(), updated_at: new Date(),
        })),
      })
    })
    await writeAuditLog({ user: auth.user, action: "UPDATE", modelType: "pph21_ter_rates", dataBaru: serialize({ kategori, count: rows.length }) })
    revalidatePath(PAGE_PATH)
    return ok({ count: rows.length })
  } catch {
    return fail("Gagal menyimpan tarif TER")
  }
}

// ─── Profil pajak karyawan ───────────────────────────────────────
export async function getEmployeeTaxProfile(employeeId: number) {
  const auth = await requirePayrollAdmin()
  if ("error" in auth) return fail(auth.error)
  if (!employeeId) return fail("Karyawan tidak valid")
  try {
    const k = await prisma.karyawans.findUnique({ where: { id: BigInt(employeeId) }, select: { status_ptkp: true, punya_npwp: true } })
    if (!k) return fail("Karyawan tidak ditemukan")
    return ok({ status_ptkp: k.status_ptkp, punya_npwp: k.punya_npwp })
  } catch {
    return fail("Gagal memuat profil pajak")
  }
}

export async function updateEmployeeTaxProfile(input: EmployeeTaxProfileInput) {
  const auth = await requirePayrollAdmin()
  if ("error" in auth) return fail(auth.error)
  const parsed = employeeTaxProfileSchema.safeParse(input)
  if (!parsed.success) return fail(firstZodError(parsed.error))
  const d = parsed.data
  try {
    const ptkp = await prisma.ptkp_settings.findUnique({ where: { kode: d.status_ptkp }, select: { id: true } })
    if (!ptkp) return fail("Status PTKP tidak dikenal")
    const updated = await prisma.karyawans.update({
      where: { id: BigInt(d.employee_id) },
      data: { status_ptkp: d.status_ptkp, punya_npwp: d.punya_npwp, updated_at: new Date() },
      select: { id: true, status_ptkp: true, punya_npwp: true },
    })
    await writeAuditLog({ user: auth.user, action: "UPDATE", modelType: "karyawans", modelId: BigInt(d.employee_id), dataBaru: { status_ptkp: updated.status_ptkp, punya_npwp: updated.punya_npwp } })
    revalidatePath(`/dashboard/payroll/employees/${d.employee_id}/salary`)
    return ok({ status_ptkp: updated.status_ptkp, punya_npwp: updated.punya_npwp })
  } catch {
    return fail("Gagal menyimpan profil pajak karyawan")
  }
}

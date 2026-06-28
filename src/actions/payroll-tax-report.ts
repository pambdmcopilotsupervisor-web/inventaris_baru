"use server"

/**
 * Server Actions — Rekap PPh21 Tahunan & Bukti Potong 1721-A1.
 * Mengagregasi snapshot pajak (tax_detail) dari seluruh slip REGULER + THR/BONUS
 * pada satu tahun pajak, lalu menghitung PPh21 terutang setahun (progresif).
 * Konvensi response: { success, data, error }.
 */

import { prisma } from "@/lib/prisma"
import { getSession, type SessionUser } from "@/lib/session"

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

interface Bracket { batas_bawah: number; batas_atas: number | null; tarif_persen: number }

function progressiveTax(pkp: number, brackets: Bracket[]): number {
  if (pkp <= 0) return 0
  const sorted = [...brackets].sort((a, b) => a.batas_bawah - b.batas_bawah)
  let tax = 0
  for (const b of sorted) {
    if (pkp <= b.batas_bawah) break
    const upper = b.batas_atas ?? Number.POSITIVE_INFINITY
    const taxableInLayer = Math.min(pkp, upper) - b.batas_bawah
    if (taxableInLayer > 0) tax += (taxableInLayer * b.tarif_persen) / 100
  }
  return Math.round(tax)
}

type TaxDetail = {
  pph21?: { bruto_month?: number; pph_month?: number } | null
  bpjs?: { deductible?: number } | null
} | null

interface YearConfig {
  biaya_jabatan_pct: number
  biaya_jabatan_max_month: number
  npwp_surcharge_pct: number
  pembulatan_pph: number
  brackets: Bracket[]
  ptkp: Map<string, number>
}

async function loadYearConfig(): Promise<YearConfig> {
  const [config, brackets, ptkp] = await Promise.all([
    prisma.payroll_tax_configs.findFirst(),
    prisma.pph21_brackets.findMany({ orderBy: { urutan: "asc" } }),
    prisma.ptkp_settings.findMany({ where: { is_active: true } }),
  ])
  return {
    biaya_jabatan_pct: config ? Number(config.biaya_jabatan_persen) : 5,
    biaya_jabatan_max_month: config ? Number(config.biaya_jabatan_maks_bulan) : 500000,
    npwp_surcharge_pct: config ? Number(config.npwp_surcharge_persen) : 20,
    pembulatan_pph: config ? config.pembulatan_pph : 0,
    brackets: brackets.map((b) => ({ batas_bawah: Number(b.batas_bawah), batas_atas: b.batas_atas != null ? Number(b.batas_atas) : null, tarif_persen: Number(b.tarif_persen) })),
    ptkp: new Map(ptkp.map((p) => [p.kode, Number(p.nominal_setahun)])),
  }
}

/** Hitung field tahunan 1721-A1 dari agregat bruto/BPJS/PPh-dipotong. */
function compute1721(agg: { bruto_reguler: number; bruto_tidak_teratur: number; bpjs_deductible: number; pph_dipotong: number }, ptkpYearly: number, cfg: YearConfig, hasNpwp: boolean) {
  const brutoYear = agg.bruto_reguler + agg.bruto_tidak_teratur
  const biayaJabatan = Math.min((brutoYear * cfg.biaya_jabatan_pct) / 100, cfg.biaya_jabatan_max_month * 12)
  const netto = Math.max(0, brutoYear - biayaJabatan - agg.bpjs_deductible)
  let pkp = Math.max(0, netto - ptkpYearly)
  if (cfg.pembulatan_pph > 0) pkp = Math.floor(pkp / cfg.pembulatan_pph) * cfg.pembulatan_pph
  let pphTerutang = progressiveTax(pkp, cfg.brackets)
  const npwpSurcharge = !hasNpwp && cfg.npwp_surcharge_pct > 0
  if (npwpSurcharge) pphTerutang = Math.round(pphTerutang * (1 + cfg.npwp_surcharge_pct / 100))
  const selisih = pphTerutang - agg.pph_dipotong
  return {
    bruto_year: Math.round(brutoYear),
    biaya_jabatan: Math.round(biayaJabatan),
    bpjs_deductible: Math.round(agg.bpjs_deductible),
    netto_year: Math.round(netto),
    ptkp: ptkpYearly,
    pkp_year: Math.round(pkp),
    pph_terutang: pphTerutang,
    pph_dipotong: Math.round(agg.pph_dipotong),
    selisih, // >0 kurang potong, <0 lebih potong
    npwp_surcharge: npwpSurcharge,
  }
}

// ─── Daftar tahun yang punya periode payroll ─────────────────────
export async function getTaxReportYears() {
  const auth = await requirePayrollAdmin()
  if ("error" in auth) return fail(auth.error)
  try {
    const rows = await prisma.payroll_periods.findMany({ distinct: ["period_year"], select: { period_year: true }, orderBy: { period_year: "desc" } })
    const years = rows.map((r) => r.period_year)
    return ok(years.length ? years : [new Date().getFullYear()])
  } catch {
    return fail("Gagal memuat daftar tahun")
  }
}

// ─── Rekap PPh21 tahunan (semua karyawan) ────────────────────────
export async function getAnnualTaxRecap(year: number) {
  const auth = await requirePayrollAdmin()
  if ("error" in auth) return fail(auth.error)
  if (!year || year < 2000) return fail("Tahun tidak valid")

  try {
    const cfg = await loadYearConfig()
    const slips = await prisma.payroll_slips.findMany({
      where: { payroll_periods: { period_year: year } },
      select: {
        employee_id: true,
        tax_detail: true,
        payroll_periods: { select: { run_type: true } },
        karyawans: { select: { id: true, nik: true, nama_karyawan: true, jabatan: true, status_ptkp: true, punya_npwp: true } },
      },
    })

    // Agregasi per karyawan.
    const byEmp = new Map<string, {
      emp: { id: number; nik: string; nama: string; jabatan: string; status_ptkp: string; punya_npwp: boolean }
      bruto_reguler: number; bruto_tidak_teratur: number; bpjs_deductible: number; pph_dipotong: number
    }>()

    for (const s of slips) {
      const key = s.employee_id.toString()
      let cur = byEmp.get(key)
      if (!cur) {
        cur = {
          emp: { id: Number(s.karyawans.id), nik: s.karyawans.nik, nama: s.karyawans.nama_karyawan, jabatan: s.karyawans.jabatan, status_ptkp: s.karyawans.status_ptkp, punya_npwp: s.karyawans.punya_npwp },
          bruto_reguler: 0, bruto_tidak_teratur: 0, bpjs_deductible: 0, pph_dipotong: 0,
        }
        byEmp.set(key, cur)
      }
      const td = s.tax_detail as TaxDetail
      const bruto = Number(td?.pph21?.bruto_month ?? 0)
      const pph = Number(td?.pph21?.pph_month ?? 0)
      const ded = Number(td?.bpjs?.deductible ?? 0)
      if (s.payroll_periods.run_type === "REGULER") cur.bruto_reguler += bruto
      else cur.bruto_tidak_teratur += bruto
      cur.bpjs_deductible += ded
      cur.pph_dipotong += pph
    }

    const rows = Array.from(byEmp.values()).map((v) => {
      const ptkpYearly = cfg.ptkp.get(v.emp.status_ptkp) ?? cfg.ptkp.get("TK/0") ?? 54000000
      const c = compute1721(v, ptkpYearly, cfg, v.emp.punya_npwp)
      return {
        employee_id: v.emp.id,
        nik: v.emp.nik,
        nama: v.emp.nama,
        jabatan: v.emp.jabatan,
        status_ptkp: v.emp.status_ptkp,
        punya_npwp: v.emp.punya_npwp,
        bruto_year: c.bruto_year,
        pph_terutang: c.pph_terutang,
        pph_dipotong: c.pph_dipotong,
        selisih: c.selisih,
      }
    }).sort((a, b) => a.nama.localeCompare(b.nama))

    const totals = rows.reduce((acc, r) => {
      acc.bruto += r.bruto_year; acc.terutang += r.pph_terutang; acc.dipotong += r.pph_dipotong
      return acc
    }, { bruto: 0, terutang: 0, dipotong: 0 })

    return ok({ year, count: rows.length, rows, totals })
  } catch {
    return fail("Gagal menyusun rekap pajak tahunan")
  }
}

// ─── Detail Bukti Potong 1721-A1 (per karyawan) ──────────────────
export async function getEmployee1721A1(employeeId: number, year: number) {
  const auth = await requirePayrollAdmin()
  if ("error" in auth) return fail(auth.error)
  if (!employeeId || !year) return fail("Parameter tidak valid")

  try {
    const cfg = await loadYearConfig()
    const employee = await prisma.karyawans.findUnique({
      where: { id: BigInt(employeeId) },
      select: {
        id: true, nik: true, no_ktp: true, nama_karyawan: true, jabatan: true, alamat: true,
        status_ptkp: true, punya_npwp: true, jkel: true,
      },
    })
    if (!employee) return fail("Karyawan tidak ditemukan")

    const slips = await prisma.payroll_slips.findMany({
      where: { employee_id: BigInt(employeeId), payroll_periods: { period_year: year } },
      select: {
        tax_detail: true,
        payroll_periods: { select: { run_type: true, period_month: true } },
      },
      orderBy: { id: "asc" },
    })
    if (slips.length === 0) return fail("Belum ada slip pada tahun ini untuk karyawan ini")

    let bruto_reguler = 0, bruto_tidak_teratur = 0, bpjs_deductible = 0, pph_dipotong = 0
    let months = 0
    for (const s of slips) {
      const td = s.tax_detail as TaxDetail
      const bruto = Number(td?.pph21?.bruto_month ?? 0)
      const pph = Number(td?.pph21?.pph_month ?? 0)
      const ded = Number(td?.bpjs?.deductible ?? 0)
      if (s.payroll_periods.run_type === "REGULER") { bruto_reguler += bruto; months++ }
      else bruto_tidak_teratur += bruto
      bpjs_deductible += ded
      pph_dipotong += pph
    }

    const ptkpYearly = cfg.ptkp.get(employee.status_ptkp) ?? cfg.ptkp.get("TK/0") ?? 54000000
    const c = compute1721({ bruto_reguler, bruto_tidak_teratur, bpjs_deductible, pph_dipotong }, ptkpYearly, cfg, employee.punya_npwp)

    return ok({
      year,
      employee: {
        id: Number(employee.id),
        nik: employee.nik,
        npwp: employee.no_ktp ?? null,
        nama: employee.nama_karyawan,
        jabatan: employee.jabatan,
        alamat: employee.alamat ?? "-",
        status_ptkp: employee.status_ptkp,
        punya_npwp: employee.punya_npwp,
        jkel: employee.jkel,
      },
      months,
      rincian: {
        gaji_tunjangan_teratur: Math.round(bruto_reguler),
        bonus_thr_tidak_teratur: Math.round(bruto_tidak_teratur),
        bruto_year: c.bruto_year,
        biaya_jabatan: c.biaya_jabatan,
        iuran_pensiun_bpjs: c.bpjs_deductible,
        netto_year: c.netto_year,
        ptkp: c.ptkp,
        pkp_year: c.pkp_year,
        pph_terutang: c.pph_terutang,
        pph_dipotong: c.pph_dipotong,
        selisih: c.selisih,
        npwp_surcharge: c.npwp_surcharge,
      },
    })
  } catch {
    return fail("Gagal menyusun bukti potong 1721-A1")
  }
}

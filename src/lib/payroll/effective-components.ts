/**
 * Resolver komponen gaji efektif untuk seorang karyawan pada rentang periode.
 * Menggabungkan dua sumber:
 *   - jabatan_salary_components  (per JABATAN)
 *   - employee_salary_components (per INDIVIDU) — MENANG sebagai override
 *
 * Bukan file "use server" agar dapat dipakai bersama oleh engine payroll
 * maupun server actions.
 */
import { prisma } from "@/lib/prisma"

export type ComponentSource = "employee" | "jabatan"

export interface ResolvedComponent {
  row_id: number
  source: ComponentSource
  component_id: number
  code: string
  name: string
  type: "EARNING" | "DEDUCTION"
  calc_method: "FIXED" | "PERCENT" | "FORMULA"
  value: number
  formula_expression: string | null
  basis_component_id: number | null
  basis_code: string | null
  basis_name: string | null
  calc_order: number
  is_taxable: boolean
  is_prorata: boolean
  is_thr_basis: boolean
  effective_date: string
  end_date: string | null
}

const componentSelect = {
  code: true,
  name: true,
  type: true,
  calc_method: true,
  formula_expression: true,
  basis_component_id: true,
  calc_order: true,
  is_taxable: true,
  is_active: true,
  is_statutory: true,
  is_prorata: true,
  is_thr_basis: true,
  basis_component: { select: { code: true, name: true } },
} as const

interface SourceRow {
  id: bigint
  component_id: bigint
  value: unknown
  effective_date: Date
  end_date: Date | null
  salary_components: {
    code: string
    name: string
    type: string
    calc_method: string
    formula_expression: string | null
    basis_component_id: bigint | null
    calc_order: number
    is_taxable: boolean
    is_active: boolean
    is_statutory: boolean
    is_prorata: boolean
    is_thr_basis: boolean
    basis_component: { code: string; name: string } | null
  }
}

/** Ambil record efektif terbaru per component_id. */
function pickLatest(rows: SourceRow[]): Map<string, SourceRow> {
  const map = new Map<string, SourceRow>()
  for (const r of rows) {
    const key = r.component_id.toString()
    const cur = map.get(key)
    if (!cur || r.effective_date > cur.effective_date) map.set(key, r)
  }
  return map
}

function toResolved(source: ComponentSource, r: SourceRow): ResolvedComponent {
  const sc = r.salary_components
  return {
    row_id: Number(r.id),
    source,
    component_id: Number(r.component_id),
    code: sc.code,
    name: sc.name,
    type: sc.type as ResolvedComponent["type"],
    calc_method: sc.calc_method as ResolvedComponent["calc_method"],
    value: Number(r.value),
    formula_expression: sc.formula_expression,
    basis_component_id: sc.basis_component_id ? Number(sc.basis_component_id) : null,
    basis_code: sc.basis_component?.code ?? null,
    basis_name: sc.basis_component?.name ?? null,
    calc_order: sc.calc_order,
    is_taxable: sc.is_taxable,
    is_prorata: sc.is_prorata,
    is_thr_basis: sc.is_thr_basis,
    effective_date: r.effective_date.toISOString(),
    end_date: r.end_date ? r.end_date.toISOString() : null,
  }
}

export async function resolveEffectiveComponents(params: {
  employeeId: bigint
  jabatan: string | null
  periodStart: Date
  periodEnd: Date
}): Promise<ResolvedComponent[]> {
  const { employeeId, jabatan, periodStart, periodEnd } = params

  const dateFilter = {
    effective_date: { lte: periodEnd },
    OR: [{ end_date: null }, { end_date: { gte: periodStart } }],
  }

  const [empRows, jabRows] = await Promise.all([
    prisma.employee_salary_components.findMany({
      where: { employee_id: employeeId, ...dateFilter },
      include: { salary_components: { select: componentSelect } },
      orderBy: [{ effective_date: "desc" }],
    }),
    jabatan
      ? prisma.jabatan_salary_components.findMany({
          where: { jabatan, ...dateFilter },
          include: { salary_components: { select: componentSelect } },
          orderBy: [{ effective_date: "desc" }],
        })
      : Promise.resolve([]),
  ])

  const empLatest = pickLatest(empRows as SourceRow[])
  const jabLatest = pickLatest(jabRows as SourceRow[])

  const merged = new Map<string, ResolvedComponent>()
  // Per-jabatan dulu …
  for (const [cid, r] of jabLatest) {
    if (!r.salary_components.is_active || r.salary_components.is_statutory) continue
    merged.set(cid, toResolved("jabatan", r))
  }
  // … lalu override per-individu (menang).
  for (const [cid, r] of empLatest) {
    if (!r.salary_components.is_active || r.salary_components.is_statutory) continue
    merged.set(cid, toResolved("employee", r))
  }

  return Array.from(merged.values()).sort((a, b) => a.calc_order - b.calc_order)
}

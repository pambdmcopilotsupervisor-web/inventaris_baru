export type TransaksiCrudAction = "create" | "update" | "delete"

export function normalizeTransaksiRole(role?: string | null): string {
  return (role ?? "user").toLowerCase()
}

export function canCreateOrEditTransaksi(role?: string | null): boolean {
  const normalizedRole = normalizeTransaksiRole(role)
  return normalizedRole === "admin" || normalizedRole === "operator"
}

export function canDeleteTransaksi(role?: string | null): boolean {
  return normalizeTransaksiRole(role) === "admin"
}

export function isTransaksiActionAllowed(role: string | null | undefined, action: TransaksiCrudAction): boolean {
  if (action === "delete") return canDeleteTransaksi(role)
  return canCreateOrEditTransaksi(role)
}

export function getTransaksiActionError(action: TransaksiCrudAction): string {
  if (action === "delete") return "Hanya admin yang dapat menghapus data pada menu ini"
  return "Hanya admin atau operator yang dapat menambah atau mengubah data pada menu ini"
}

export function hasRequiredJabatan(jabatan: string | null | undefined, expectedJabatan: string): boolean {
  return (jabatan ?? "").trim().toLowerCase() === expectedJabatan.trim().toLowerCase()
}
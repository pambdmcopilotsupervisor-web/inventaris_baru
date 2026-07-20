export const ROLE_DEFAULT_HOME_MENU_HREFS = ["/dashboard", "/dashboard/sdm"] as const

export function getRequiredRoleMenuHrefs(role: string | null | undefined): string[] {
  const normalizedRole = (role ?? "user").toLowerCase()
  return normalizedRole === "operator" || normalizedRole === "user"
    ? [...ROLE_DEFAULT_HOME_MENU_HREFS]
    : []
}

export function withRequiredRoleMenuHrefs(
  role: string | null | undefined,
  menuHrefs: string[] | null,
): string[] | null {
  if (!menuHrefs) return menuHrefs

  return Array.from(new Set([...menuHrefs, ...getRequiredRoleMenuHrefs(role)]))
}

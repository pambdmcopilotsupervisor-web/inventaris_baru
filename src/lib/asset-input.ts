export function toNullableString(value: unknown): string | null | undefined {
  if (typeof value === "undefined") return undefined
  if (value === null || value === "") return null
  return String(value)
}

export function toNullableNumber(value: unknown): number | null | undefined {
  if (typeof value === "undefined") return undefined
  if (value === null || value === "") return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

export function toRequiredNumber(value: unknown): number | undefined {
  if (typeof value === "undefined" || value === null || value === "") return undefined
  const number = Number(value)
  return Number.isFinite(number) ? number : undefined
}

export function toNullableDate(value: unknown): Date | null | undefined {
  if (typeof value === "undefined") return undefined
  if (value === null || value === "") return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value

  const text = String(value).trim()
  if (!text) return null

  const date = /^\d{4}-\d{2}-\d{2}$/.test(text)
    ? new Date(`${text}T00:00:00.000Z`)
    : new Date(text)

  return Number.isNaN(date.getTime()) ? null : date
}

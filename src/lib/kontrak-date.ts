type DateParts = {
  year: number
  month: number
  day: number
}

function toDateParts(value: string | Date | null | undefined): DateParts | null {
  if (!value) return null

  const dateText = typeof value === "string" ? value.slice(0, 10) : value.toISOString().slice(0, 10)
  const match = dateText.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null

  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  }
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

function toTime(parts: DateParts): number {
  return Date.UTC(parts.year, parts.month - 1, parts.day)
}

export function calculateMasaSewaBulan(tglAwal: string | Date | null | undefined, tglAkhir: string | Date | null | undefined): number {
  const awal = toDateParts(tglAwal)
  const akhir = toDateParts(tglAkhir)
  if (!awal || !akhir || toTime(akhir) < toTime(awal)) return 0

  let months = (akhir.year - awal.year) * 12 + (akhir.month - awal.month)

  if (awal.day === 1 && akhir.day === lastDayOfMonth(akhir.year, akhir.month)) {
    months += 1
  } else if (akhir.day < awal.day) {
    months -= 1
  }

  return Math.max(0, months)
}

/**
 * Helper format angka untuk modul keuangan.
 */

/** Format Rupiah penuh: Rp1.500.000 */
export function rp(n: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency", currency: "IDR", minimumFractionDigits: 0,
  }).format(n || 0)
}

/** Format ribuan tanpa simbol: 1.500.000 (untuk input). */
export function formatThousand(value: string | number): string {
  const digits = String(value).replace(/[^\d]/g, "")
  if (!digits) return ""
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".")
}

/** Parse string berformat ribuan menjadi number: "1.500.000" -> 1500000. */
export function parseThousand(value: string): number {
  const digits = String(value).replace(/[^\d]/g, "")
  return digits ? parseInt(digits, 10) : 0
}

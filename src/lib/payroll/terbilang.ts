/**
 * Konversi angka ke teks Bahasa Indonesia (terbilang).
 * Mendukung sampai triliunan.
 */

const SATUAN = [
  "", "Satu", "Dua", "Tiga", "Empat", "Lima", "Enam", "Tujuh", "Delapan", "Sembilan",
  "Sepuluh", "Sebelas",
]

function terbilang(n: number): string {
  if (n < 12) return SATUAN[n]
  if (n < 20) return `${terbilang(n - 10)} Belas`
  if (n < 100) {
    const sisa = n % 10
    return `${terbilang(Math.floor(n / 10))} Puluh${sisa ? ` ${terbilang(sisa)}` : ""}`
  }
  if (n < 200) {
    const sisa = n - 100
    return `Seratus${sisa ? ` ${terbilang(sisa)}` : ""}`
  }
  if (n < 1000) {
    const sisa = n % 100
    return `${terbilang(Math.floor(n / 100))} Ratus${sisa ? ` ${terbilang(sisa)}` : ""}`
  }
  if (n < 2000) {
    const sisa = n - 1000
    return `Seribu${sisa ? ` ${terbilang(sisa)}` : ""}`
  }
  if (n < 1_000_000) {
    const sisa = n % 1000
    return `${terbilang(Math.floor(n / 1000))} Ribu${sisa ? ` ${terbilang(sisa)}` : ""}`
  }
  if (n < 1_000_000_000) {
    const sisa = n % 1_000_000
    return `${terbilang(Math.floor(n / 1_000_000))} Juta${sisa ? ` ${terbilang(sisa)}` : ""}`
  }
  if (n < 1_000_000_000_000) {
    const sisa = n % 1_000_000_000
    return `${terbilang(Math.floor(n / 1_000_000_000))} Miliar${sisa ? ` ${terbilang(sisa)}` : ""}`
  }
  const sisa = n % 1_000_000_000_000
  return `${terbilang(Math.floor(n / 1_000_000_000_000))} Triliun${sisa ? ` ${terbilang(sisa)}` : ""}`
}

/** 5000000 → "Lima Juta Rupiah". Dibulatkan ke rupiah penuh. */
export function terbilangRupiah(amount: number): string {
  const n = Math.round(Math.abs(amount))
  if (n === 0) return "Nol Rupiah"
  const words = terbilang(n).replace(/\s+/g, " ").trim()
  const prefix = amount < 0 ? "Minus " : ""
  return `${prefix}${words} Rupiah`
}

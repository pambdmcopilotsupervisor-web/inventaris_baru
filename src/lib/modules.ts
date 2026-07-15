/**
 * Konfigurasi status modul — dibaca dari environment variable NEXT_PUBLIC_MODULE_*.
 *
 * Cara penggunaan di .env:
 *   NEXT_PUBLIC_MODULE_ASET=true
 *   NEXT_PUBLIC_MODULE_SDM=false   ← modul ini akan dinonaktifkan
 *
 * Default: aktif (true), kecuali nilainya secara eksplisit "false".
 */

export type ModulKey = "aset" | "sdm" | "kinerja" | "keuangan"

/** Kembalikan true jika modul aktif, false jika dinonaktifkan via .env */
export function isModuleEnabled(modul: ModulKey): boolean {
  switch (modul) {
    case "aset":     return process.env.NEXT_PUBLIC_MODULE_ASET     !== "false"
    case "sdm":      return process.env.NEXT_PUBLIC_MODULE_SDM      !== "false"
    case "kinerja":  return process.env.NEXT_PUBLIC_MODULE_KINERJA  !== "false"
    case "keuangan": return process.env.NEXT_PUBLIC_MODULE_KEUANGAN !== "false"
    default:         return true
  }
}

/** Snapshot status semua modul — berguna untuk render kondisional di client */
export const MODULE_STATUS: Record<ModulKey, boolean> = {
  aset:     process.env.NEXT_PUBLIC_MODULE_ASET     !== "false",
  sdm:      process.env.NEXT_PUBLIC_MODULE_SDM      !== "false",
  kinerja:  process.env.NEXT_PUBLIC_MODULE_KINERJA  !== "false",
  keuangan: process.env.NEXT_PUBLIC_MODULE_KEUANGAN !== "false",
}

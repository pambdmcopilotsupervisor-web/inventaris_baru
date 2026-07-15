/**
 * Konfigurasi status modul — dibaca dari environment variable MODULE_*.
 * Variabel ini adalah SERVER-SIDE ONLY (bukan NEXT_PUBLIC_), sehingga
 * nilainya dibaca saat RUNTIME tanpa perlu rebuild Docker image.
 *
 * Cara penggunaan di .env atau docker-compose.yml:
 *   MODULE_ASET=true
 *   MODULE_SDM=false   ← modul ini akan dinonaktifkan
 *
 * Default: aktif (true), kecuali nilainya secara eksplisit "false".
 *
 * ⚠️  File ini hanya untuk server-side (middleware, API routes).
 *     Untuk client-side, gunakan endpoint /api/modules.
 */

export type ModulKey = "aset" | "sdm" | "kinerja" | "keuangan"

/** Kembalikan true jika modul aktif, false jika dinonaktifkan via .env */
export function isModuleEnabled(modul: ModulKey): boolean {
  switch (modul) {
    case "aset":     return process.env.MODULE_ASET     !== "false"
    case "sdm":      return process.env.MODULE_SDM      !== "false"
    case "kinerja":  return process.env.MODULE_KINERJA  !== "false"
    case "keuangan": return process.env.MODULE_KEUANGAN !== "false"
    default:         return true
  }
}

/** Snapshot status semua modul — untuk digunakan di server-side code */
export function getAllModuleStatus(): Record<ModulKey, boolean> {
  return {
    aset:     process.env.MODULE_ASET     !== "false",
    sdm:      process.env.MODULE_SDM      !== "false",
    kinerja:  process.env.MODULE_KINERJA  !== "false",
    keuangan: process.env.MODULE_KEUANGAN !== "false",
  }
}

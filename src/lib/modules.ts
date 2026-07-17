import { getModulePath, normalizeModulKey, type ModulKey } from "@/lib/module-navigation"

/**
 * Konfigurasi status modul — dibaca dari environment variable MODULE_*.
 * Variabel ini adalah SERVER-SIDE ONLY (bukan NEXT_PUBLIC_), sehingga
 * nilainya dibaca saat RUNTIME tanpa perlu rebuild Docker image.
 *
 * Cara penggunaan di .env atau docker-compose.yml:
 *   MODULE_ASET=true
 *   MODULE_SDM=false   ← modul ini akan dinonaktifkan
 *   DEFAULT_MODUL=1    ← lewati halaman pilih modul setelah login
 *   DEFAULT_MODUL_AKTIF=SDM
 *
 * Default: aktif (true), kecuali nilainya secara eksplisit "false".
 */

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

export function isDefaultModuleEnabled(): boolean {
  return process.env.DEFAULT_MODUL === "1"
}

export function getConfiguredDefaultModule(): ModulKey | null {
  return normalizeModulKey(process.env.DEFAULT_MODUL_AKTIF)
}

export function getDefaultModule(): ModulKey | null {
  if (!isDefaultModuleEnabled()) return null

  const modul = getConfiguredDefaultModule()
  if (!modul) return null
  if (!isModuleEnabled(modul)) return null

  return modul
}

export function getDefaultModuleRedirectPath(): string | null {
  const modul = getDefaultModule()
  return modul ? getModulePath(modul) : null
}

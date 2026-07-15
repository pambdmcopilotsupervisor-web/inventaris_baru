-- ============================================================
-- Modul Keuangan — Integrity Constraints
-- Catatan  : Idempotent — menggunakan CREATE INDEX IF NOT EXISTS (MariaDB).
-- ============================================================

-- Cegah jurnal otomatis dibuat lebih dari sekali untuk sumber transaksi yang sama.
-- MySQL tetap mengizinkan banyak baris NULL, sehingga jurnal manual tanpa source_ref_id tidak terdampak.
CREATE UNIQUE INDEX IF NOT EXISTS uq_keu_jurnal_source
  ON keu_jurnal (source_modul, source_ref_id);

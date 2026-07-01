-- ============================================================
-- Modul Keuangan — Integrity Constraints
-- ============================================================

-- Cegah jurnal otomatis dibuat lebih dari sekali untuk sumber transaksi yang sama.
-- MySQL tetap mengizinkan banyak baris NULL, sehingga jurnal manual tanpa source_ref_id tidak terdampak.
ALTER TABLE keu_jurnal
  ADD UNIQUE KEY uq_keu_jurnal_source (source_modul, source_ref_id);

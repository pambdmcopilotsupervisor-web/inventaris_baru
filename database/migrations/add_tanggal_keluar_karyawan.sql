-- ============================================================
-- Migration: Tambah kolom tanggal_keluar di tabel karyawans
-- Untuk: dukungan prorata gaji karyawan resign/keluar tengah bulan
-- (hari kerja terakhir). NULL = masih aktif / tidak ada tanggal keluar.
-- DELIMITER procedure agar idempotent (MySQL tanpa ADD COLUMN IF NOT EXISTS).
-- ============================================================

DROP PROCEDURE IF EXISTS _add_tanggal_keluar;
DELIMITER //
CREATE PROCEDURE _add_tanggal_keluar()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'karyawans'
      AND COLUMN_NAME  = 'tanggal_keluar'
  ) THEN
    ALTER TABLE karyawans
      ADD COLUMN `tanggal_keluar` DATE NULL
      COMMENT 'Hari kerja terakhir karyawan (resign/pensiun). NULL = masih aktif. Dipakai untuk prorata gaji bulan terakhir.'
      AFTER `tanggal_masuk_kerja`;
  END IF;
END //
DELIMITER ;
CALL _add_tanggal_keluar();
DROP PROCEDURE IF EXISTS _add_tanggal_keluar;

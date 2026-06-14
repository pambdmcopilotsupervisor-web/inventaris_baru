-- ============================================================
-- Migration: Pisahkan catatan target pegawai dan atasan
-- Database : MariaDB / MySQL
-- Tanggal  : 2026-06-14
-- ============================================================

SET @add_catatan_pegawai = (
  SELECT IF(
    EXISTS (
      SELECT 1
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'target_kerja'
        AND COLUMN_NAME = 'catatan_pegawai'
    ),
    'SELECT 1',
    'ALTER TABLE target_kerja ADD COLUMN catatan_pegawai TEXT NULL AFTER catatan'
  )
);

PREPARE stmt FROM @add_catatan_pegawai;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @add_catatan_atasan = (
  SELECT IF(
    EXISTS (
      SELECT 1
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'target_kerja'
        AND COLUMN_NAME = 'catatan_atasan'
    ),
    'SELECT 1',
    'ALTER TABLE target_kerja ADD COLUMN catatan_atasan TEXT NULL AFTER catatan_pegawai'
  )
);

PREPARE stmt FROM @add_catatan_atasan;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================================
-- Migration: API Mobile Absensi Pegawai
-- Tanggal  : 2026-06-12
-- ============================================================

-- 1. Tambah kolom mobile ke tabel absensi (idempotent)
DROP PROCEDURE IF EXISTS _add_mobile_absensi_cols;
DELIMITER //
CREATE PROCEDURE _add_mobile_absensi_cols()
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='absensi' AND COLUMN_NAME='foto_masuk') THEN
    ALTER TABLE absensi ADD COLUMN foto_masuk VARCHAR(255) NULL AFTER attachment_path;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='absensi' AND COLUMN_NAME='foto_pulang') THEN
    ALTER TABLE absensi ADD COLUMN foto_pulang VARCHAR(255) NULL AFTER foto_masuk;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='absensi' AND COLUMN_NAME='lokasi_masuk_lat') THEN
    ALTER TABLE absensi ADD COLUMN lokasi_masuk_lat DECIMAL(10,7) NULL AFTER foto_pulang;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='absensi' AND COLUMN_NAME='lokasi_masuk_lng') THEN
    ALTER TABLE absensi ADD COLUMN lokasi_masuk_lng DECIMAL(10,7) NULL AFTER lokasi_masuk_lat;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='absensi' AND COLUMN_NAME='lokasi_pulang_lat') THEN
    ALTER TABLE absensi ADD COLUMN lokasi_pulang_lat DECIMAL(10,7) NULL AFTER lokasi_masuk_lng;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='absensi' AND COLUMN_NAME='lokasi_pulang_lng') THEN
    ALTER TABLE absensi ADD COLUMN lokasi_pulang_lng DECIMAL(10,7) NULL AFTER lokasi_pulang_lat;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='absensi' AND COLUMN_NAME='metode_input') THEN
    ALTER TABLE absensi ADD COLUMN metode_input VARCHAR(20) NOT NULL DEFAULT 'system' AFTER lokasi_pulang_lng;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='absensi' AND COLUMN_NAME='perangkat_info') THEN
    ALTER TABLE absensi ADD COLUMN perangkat_info VARCHAR(255) NULL AFTER metode_input;
  END IF;
END //
DELIMITER ;
CALL _add_mobile_absensi_cols();
DROP PROCEDURE IF EXISTS _add_mobile_absensi_cols;

-- 2. Mobile Sessions (API token untuk mobile app)
CREATE TABLE IF NOT EXISTS mobile_sessions (
  id            BIGINT UNSIGNED  NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id       BIGINT UNSIGNED  NOT NULL,
  token         VARCHAR(255)     NOT NULL,
  device_info   VARCHAR(255)     NULL,
  last_used_at  TIMESTAMP        NULL,
  expires_at    TIMESTAMP        NULL,
  created_at    TIMESTAMP        NULL,
  updated_at    TIMESTAMP        NULL,
  UNIQUE KEY mobile_sessions_token_unique (token),
  KEY mobile_sessions_user_id_index (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Konfigurasi Lokasi Absensi (radius kantor)
CREATE TABLE IF NOT EXISTS absensi_lokasi_configs (
  id            BIGINT UNSIGNED  NOT NULL AUTO_INCREMENT PRIMARY KEY,
  nama_lokasi   VARCHAR(100)     NOT NULL,
  latitude      DECIMAL(10,7)    NOT NULL,
  longitude     DECIMAL(10,7)    NOT NULL,
  radius_meter  INT              NOT NULL DEFAULT 100,
  aktif         TINYINT(1)       NOT NULL DEFAULT 1,
  keterangan    VARCHAR(255)     NULL,
  created_at    TIMESTAMP        NULL,
  updated_at    TIMESTAMP        NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Seed: contoh konfigurasi lokasi (update sesuai koordinat kantor)
INSERT IGNORE INTO absensi_lokasi_configs
  (nama_lokasi, latitude, longitude, radius_meter, aktif, keterangan, created_at, updated_at)
VALUES
  ('Kantor Utama', -3.3194374, 114.5907741, 100, 1, 'Radius 100 meter dari kantor utama — sesuaikan koordinat dengan lokasi kantor sebenarnya', NOW(), NOW());

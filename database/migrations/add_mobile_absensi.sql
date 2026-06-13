-- ============================================================
-- Migration: API Mobile Absensi Pegawai
-- Tanggal  : 2026-06-12
-- ============================================================

-- 1. Tambah kolom mobile ke tabel absensi
ALTER TABLE absensi
  ADD COLUMN foto_masuk        VARCHAR(255)   NULL AFTER attachment_path,
  ADD COLUMN foto_pulang       VARCHAR(255)   NULL AFTER foto_masuk,
  ADD COLUMN lokasi_masuk_lat  DECIMAL(10,7)  NULL AFTER foto_pulang,
  ADD COLUMN lokasi_masuk_lng  DECIMAL(10,7)  NULL AFTER lokasi_masuk_lat,
  ADD COLUMN lokasi_pulang_lat DECIMAL(10,7)  NULL AFTER lokasi_masuk_lng,
  ADD COLUMN lokasi_pulang_lng DECIMAL(10,7)  NULL AFTER lokasi_pulang_lat,
  ADD COLUMN metode_input      VARCHAR(20)    NOT NULL DEFAULT 'system' AFTER lokasi_pulang_lng,
  ADD COLUMN perangkat_info    VARCHAR(255)   NULL AFTER metode_input;

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

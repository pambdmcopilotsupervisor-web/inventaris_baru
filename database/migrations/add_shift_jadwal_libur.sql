-- ============================================================
-- Migration: Shift Kerja, Jadwal Shift, Hari Libur, Audit Log
-- Tanggal  : 2026-06-11
-- ============================================================

-- 1. Master Shift Kerja
CREATE TABLE IF NOT EXISTS shift_kerjas (
  id                         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  kode_shift                 VARCHAR(20)     NOT NULL,
  nama_shift                 VARCHAR(100)    NOT NULL,
  jam_masuk                  VARCHAR(8)      NOT NULL,   -- HH:MM:SS
  jam_pulang                 VARCHAR(8)      NOT NULL,   -- HH:MM:SS
  toleransi_terlambat_menit  INT             NOT NULL DEFAULT 15,
  batas_absen_masuk_mulai    VARCHAR(8)      NULL,
  batas_absen_masuk_selesai  VARCHAR(8)      NULL,
  batas_absen_pulang_mulai   VARCHAR(8)      NULL,
  batas_absen_pulang_selesai VARCHAR(8)      NULL,
  is_lintas_hari             TINYINT(1)      NOT NULL DEFAULT 0,
  durasi_kerja_menit         INT             NULL,
  status                     VARCHAR(10)     NOT NULL DEFAULT 'aktif',
  keterangan                 VARCHAR(255)    NULL,
  created_at                 TIMESTAMP       NULL,
  updated_at                 TIMESTAMP       NULL,
  UNIQUE KEY shift_kerjas_kode_shift_unique (kode_shift)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Hari Libur (Nasional / Cuti Bersama / Perusahaan)
CREATE TABLE IF NOT EXISTS hari_liburs (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tanggal    DATE            NOT NULL,
  nama_libur VARCHAR(100)    NOT NULL,
  tipe_libur VARCHAR(20)     NOT NULL DEFAULT 'Nasional',
  keterangan VARCHAR(255)    NULL,
  created_at TIMESTAMP       NULL,
  updated_at TIMESTAMP       NULL,
  UNIQUE KEY hari_liburs_tanggal_unique (tanggal)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Jadwal Shift Pegawai
CREATE TABLE IF NOT EXISTS jadwal_shifts (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  karyawan_id BIGINT UNSIGNED NOT NULL,
  shift_id    BIGINT UNSIGNED NOT NULL,
  tanggal     DATE            NOT NULL,
  keterangan  VARCHAR(255)    NULL,
  created_at  TIMESTAMP       NULL,
  updated_at  TIMESTAMP       NULL,
  UNIQUE KEY jadwal_shifts_karyawan_tanggal_unique (karyawan_id, tanggal),
  KEY jadwal_shifts_shift_id_index (shift_id),
  KEY jadwal_shifts_tanggal_index  (tanggal),
  CONSTRAINT jadwal_shifts_karyawan_id_foreign
    FOREIGN KEY (karyawan_id) REFERENCES karyawans (id) ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT jadwal_shifts_shift_id_foreign
    FOREIGN KEY (shift_id)    REFERENCES shift_kerjas (id) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Audit Log
CREATE TABLE IF NOT EXISTS audit_logs (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id    BIGINT UNSIGNED NULL,
  user_name  VARCHAR(255)    NULL,
  action     VARCHAR(100)    NOT NULL,
  model_type VARCHAR(100)    NOT NULL,
  model_id   BIGINT          NULL,
  data_lama  JSON            NULL,
  data_baru  JSON            NULL,
  ip_address VARCHAR(45)     NULL,
  created_at TIMESTAMP       NULL,
  INDEX audit_logs_model_index   (model_type, model_id),
  INDEX audit_logs_user_index    (user_id),
  INDEX audit_logs_created_index (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Seed: Shift Umum
INSERT IGNORE INTO shift_kerjas
  (kode_shift, nama_shift, jam_masuk, jam_pulang, toleransi_terlambat_menit,
   batas_absen_masuk_mulai, batas_absen_masuk_selesai,
   batas_absen_pulang_mulai, batas_absen_pulang_selesai,
   is_lintas_hari, durasi_kerja_menit, status, keterangan, created_at, updated_at)
VALUES
  ('PAGI',  'Shift Pagi',   '08:00:00', '16:00:00', 15,
   '07:30:00', '08:30:00', '15:30:00', '16:30:00',
   0, 480, 'aktif', 'Shift pagi reguler 08:00 - 16:00', NOW(), NOW()),

  ('SIANG', 'Shift Siang',  '14:00:00', '22:00:00', 15,
   '13:30:00', '14:30:00', '21:30:00', '22:30:00',
   0, 480, 'aktif', 'Shift siang 14:00 - 22:00', NOW(), NOW()),

  ('MALAM', 'Shift Malam',  '22:00:00', '06:00:00', 15,
   '21:30:00', '22:30:00', '05:30:00', '06:30:00',
   1, 480, 'aktif', 'Shift malam lintas hari 22:00 - 06:00', NOW(), NOW());

-- ============================================================
-- Migration: Fitur Lembur Pegawai
-- Tanggal  : 2026-06-12
-- ============================================================

-- 1. Master Setting Lembur
CREATE TABLE IF NOT EXISTS overtime_settings (
  id                         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  nama_setting               VARCHAR(100)    NOT NULL,
  tipe_hari                  VARCHAR(20)     NOT NULL DEFAULT 'hari_kerja',  -- hari_kerja|hari_libur|hari_raya
  metode_perhitungan         VARCHAR(20)     NOT NULL DEFAULT 'per_jam',     -- flat|per_jam|formula
  tarif_flat                 DECIMAL(15,2)   NOT NULL DEFAULT 0,
  tarif_per_jam              DECIMAL(15,2)   NOT NULL DEFAULT 0,
  multiplier_jam_pertama     DECIMAL(5,2)    NOT NULL DEFAULT 1.5,
  multiplier_jam_berikutnya  DECIMAL(5,2)    NOT NULL DEFAULT 2.0,
  batas_minimal_menit_lembur INT             NOT NULL DEFAULT 30,
  pembulatan_menit           INT             NOT NULL DEFAULT 30,  -- 15|30|60
  status                     VARCHAR(10)     NOT NULL DEFAULT 'aktif',
  keterangan                 VARCHAR(255)    NULL,
  created_at                 TIMESTAMP       NULL,
  updated_at                 TIMESTAMP       NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Tarif Lembur per Pegawai — idempotent
DROP PROCEDURE IF EXISTS _add_lembur_col;
DELIMITER //
CREATE PROCEDURE _add_lembur_col()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'karyawans' AND COLUMN_NAME = 'tarif_lembur_per_jam'
  ) THEN
    ALTER TABLE karyawans ADD COLUMN tarif_lembur_per_jam DECIMAL(15,2) NULL AFTER atasan_id;
  END IF;
END //
DELIMITER ;
CALL _add_lembur_col();
DROP PROCEDURE IF EXISTS _add_lembur_col;

-- 3. Pengajuan Lembur
CREATE TABLE IF NOT EXISTS overtime_requests (
  id                       BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  karyawan_id              BIGINT UNSIGNED NOT NULL,
  tanggal_lembur           DATE            NOT NULL,
  jam_mulai_rencana        VARCHAR(8)      NOT NULL,
  jam_selesai_rencana      VARCHAR(8)      NOT NULL,
  durasi_rencana_menit     INT             NOT NULL DEFAULT 0,
  jam_mulai_aktual         VARCHAR(8)      NULL,
  jam_selesai_aktual       VARCHAR(8)      NULL,
  durasi_aktual_menit      INT             NULL,
  durasi_disetujui_menit   INT             NULL,
  alasan_lembur            TEXT            NOT NULL,
  pekerjaan_lembur         TEXT            NULL,
  lampiran                 VARCHAR(255)    NULL,
  status                   VARCHAR(30)     NOT NULL DEFAULT 'draft',
  total_uang_lembur        DECIMAL(15,2)   NULL,
  calculation_detail       JSON            NULL,
  catatan_realisasi        TEXT            NULL,
  is_lintas_hari           TINYINT(1)      NOT NULL DEFAULT 0,
  overtime_setting_id      BIGINT UNSIGNED NULL,
  submitted_at             TIMESTAMP       NULL,
  realized_at              TIMESTAMP       NULL,
  dibuat_oleh              BIGINT UNSIGNED NULL,
  created_at               TIMESTAMP       NULL,
  updated_at               TIMESTAMP       NULL,
  KEY overtime_requests_karyawan_id_index   (karyawan_id),
  KEY overtime_requests_status_index        (status),
  KEY overtime_requests_tanggal_index       (tanggal_lembur),
  CONSTRAINT overtime_requests_karyawan_id_foreign
    FOREIGN KEY (karyawan_id) REFERENCES karyawans (id) ON DELETE CASCADE ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Approval Lembur
CREATE TABLE IF NOT EXISTS overtime_approvals (
  id                     BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  overtime_request_id    BIGINT UNSIGNED NOT NULL,
  approver_id            BIGINT UNSIGNED NULL,
  approver_user_id       BIGINT UNSIGNED NULL,
  approver_role          VARCHAR(50)     NOT NULL,
  approval_level         INT             NOT NULL,
  status                 VARCHAR(20)     NOT NULL DEFAULT 'pending',
  note                   TEXT            NULL,
  approved_at            TIMESTAMP       NULL,
  created_at             TIMESTAMP       NULL,
  updated_at             TIMESTAMP       NULL,
  KEY oa_overtime_request_id_index (overtime_request_id),
  KEY oa_approver_id_index         (approver_id),
  KEY oa_status_index              (status),
  CONSTRAINT oa_overtime_request_id_foreign
    FOREIGN KEY (overtime_request_id) REFERENCES overtime_requests (id) ON DELETE CASCADE ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Seed: Setting Lembur Default
INSERT IGNORE INTO overtime_settings
  (nama_setting, tipe_hari, metode_perhitungan, tarif_flat, tarif_per_jam, multiplier_jam_pertama, multiplier_jam_berikutnya, batas_minimal_menit_lembur, pembulatan_menit, status, keterangan, created_at, updated_at)
VALUES
  ('Lembur Hari Kerja',  'hari_kerja',  'per_jam', 0, 20000, 1.5, 2.0, 30, 30, 'aktif', 'Lembur hari kerja biasa — setelah jam pulang shift', NOW(), NOW()),
  ('Lembur Hari Libur',  'hari_libur',  'per_jam', 0, 30000, 2.0, 3.0, 30, 30, 'aktif', 'Lembur hari libur mingguan', NOW(), NOW()),
  ('Lembur Hari Raya',   'hari_raya',   'per_jam', 0, 40000, 3.0, 4.0, 30, 30, 'aktif', 'Lembur hari raya nasional', NOW(), NOW());

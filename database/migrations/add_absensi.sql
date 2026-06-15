-- ============================================================
-- Migration: Tabel Absensi Pegawai
-- Tanggal  : 2026-06-11
-- ============================================================

CREATE TABLE IF NOT EXISTS absensi (
  id                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  karyawan_id           BIGINT UNSIGNED NOT NULL,
  jadwal_shift_id       BIGINT UNSIGNED NULL,
  tanggal_absensi       DATE NOT NULL,
  jam_masuk             VARCHAR(8)  NULL,           -- HH:MM:SS aktual
  jam_pulang            VARCHAR(8)  NULL,           -- HH:MM:SS aktual
  status_absensi        VARCHAR(30) NOT NULL DEFAULT 'alpha',
  menit_terlambat       INT         NOT NULL DEFAULT 0,
  menit_pulang_cepat    INT         NOT NULL DEFAULT 0,
  total_jam_kerja_menit INT         NOT NULL DEFAULT 0,
  is_manual             TINYINT(1)  NOT NULL DEFAULT 0,
  alasan_manual         VARCHAR(255) NULL,
  catatan_manual        TEXT NULL,
  attachment_path       VARCHAR(255) NULL,
  generated_at          TIMESTAMP   NULL,
  generated_by          BIGINT UNSIGNED NULL,
  created_by            BIGINT UNSIGNED NULL,
  updated_by            BIGINT UNSIGNED NULL,
  created_at            TIMESTAMP   NULL,
  updated_at            TIMESTAMP   NULL,

  -- Satu catatan absensi per karyawan per hari (shift malam dicatat di tanggal mulai shift)
  UNIQUE KEY absensi_karyawan_tanggal_unique (karyawan_id, tanggal_absensi),
  KEY absensi_jadwal_shift_id_index (jadwal_shift_id),
  KEY absensi_status_index           (status_absensi),
  KEY absensi_tanggal_index          (tanggal_absensi),
  KEY absensi_created_by_index       (created_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tambahkan foreign key via stored procedure (IF NOT EXISTS tidak didukung MariaDB untuk CONSTRAINT)
SET FOREIGN_KEY_CHECKS=0;

DROP PROCEDURE IF EXISTS _add_absensi_fk;
DELIMITER //
CREATE PROCEDURE _add_absensi_fk()
BEGIN
  -- FK karyawan_id
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE()
      AND TABLE_NAME = 'absensi'
      AND CONSTRAINT_NAME = 'absensi_karyawan_id_foreign'
  ) THEN
    ALTER TABLE absensi ADD CONSTRAINT absensi_karyawan_id_foreign
      FOREIGN KEY (karyawan_id) REFERENCES karyawans (id) ON DELETE CASCADE ON UPDATE RESTRICT;
  END IF;
  -- FK jadwal_shift_id
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE()
      AND TABLE_NAME = 'absensi'
      AND CONSTRAINT_NAME = 'absensi_jadwal_shift_id_foreign'
  ) THEN
    ALTER TABLE absensi ADD CONSTRAINT absensi_jadwal_shift_id_foreign
      FOREIGN KEY (jadwal_shift_id) REFERENCES jadwal_shifts (id) ON DELETE SET NULL ON UPDATE RESTRICT;
  END IF;
END //
DELIMITER ;
CALL _add_absensi_fk();
DROP PROCEDURE IF EXISTS _add_absensi_fk;

SET FOREIGN_KEY_CHECKS=1;

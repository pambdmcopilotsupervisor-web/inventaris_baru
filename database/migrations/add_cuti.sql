-- ============================================================
-- Migration: Fitur Cuti Pegawai
-- Tanggal  : 2026-06-11
-- ============================================================

-- 1. Tambah atasan_id ke karyawans (self-referencing FK) — idempotent
DROP PROCEDURE IF EXISTS _add_cuti_cols;
DELIMITER //
CREATE PROCEDURE _add_cuti_cols()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'karyawans' AND COLUMN_NAME = 'atasan_id'
  ) THEN
    ALTER TABLE karyawans ADD COLUMN atasan_id BIGINT UNSIGNED NULL AFTER subdivisi_id;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE()
      AND TABLE_NAME = 'karyawans'
      AND CONSTRAINT_NAME = 'karyawans_atasan_id_foreign'
  ) THEN
    ALTER TABLE karyawans ADD CONSTRAINT karyawans_atasan_id_foreign
      FOREIGN KEY (atasan_id) REFERENCES karyawans (id) ON DELETE SET NULL ON UPDATE RESTRICT;
  END IF;
END //
DELIMITER ;
CALL _add_cuti_cols();
DROP PROCEDURE IF EXISTS _add_cuti_cols;

-- 2. Master Jenis Cuti
CREATE TABLE IF NOT EXISTS jenis_cutis (
  id                   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  kode_cuti            VARCHAR(20)     NOT NULL,
  nama_cuti            VARCHAR(100)    NOT NULL,
  jatah_hari_default   INT             NOT NULL DEFAULT 12,
  membutuhkan_lampiran TINYINT(1)      NOT NULL DEFAULT 0,
  potong_saldo_cuti    TINYINT(1)      NOT NULL DEFAULT 1,
  status               VARCHAR(10)     NOT NULL DEFAULT 'aktif',
  keterangan           VARCHAR(255)    NULL,
  created_at           TIMESTAMP       NULL,
  updated_at           TIMESTAMP       NULL,
  UNIQUE KEY jenis_cutis_kode_unique (kode_cuti)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Saldo Cuti Pegawai per Tahun
CREATE TABLE IF NOT EXISTS saldo_cutis (
  id                      BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  karyawan_id             BIGINT UNSIGNED NOT NULL,
  jenis_cuti_id           BIGINT UNSIGNED NOT NULL,
  tahun                   YEAR            NOT NULL,
  saldo_awal              INT             NOT NULL DEFAULT 0,
  saldo_terpakai          INT             NOT NULL DEFAULT 0,
  saldo_penyesuaian       INT             NOT NULL DEFAULT 0,
  keterangan_penyesuaian  VARCHAR(255)    NULL,
  created_at              TIMESTAMP       NULL,
  updated_at              TIMESTAMP       NULL,
  UNIQUE KEY saldo_cutis_karyawan_jenis_tahun_unique (karyawan_id, jenis_cuti_id, tahun),
  KEY saldo_cutis_jenis_cuti_id_index (jenis_cuti_id),
  CONSTRAINT saldo_cutis_karyawan_id_foreign
    FOREIGN KEY (karyawan_id)   REFERENCES karyawans (id)   ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT saldo_cutis_jenis_cuti_id_foreign
    FOREIGN KEY (jenis_cuti_id) REFERENCES jenis_cutis (id) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Pengajuan Cuti
CREATE TABLE IF NOT EXISTS pengajuan_cutis (
  id                   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  karyawan_id          BIGINT UNSIGNED NOT NULL,
  jenis_cuti_id        BIGINT UNSIGNED NOT NULL,
  tanggal_mulai        DATE            NOT NULL,
  tanggal_selesai      DATE            NOT NULL,
  jumlah_hari          INT             NOT NULL DEFAULT 0,
  alasan               TEXT            NOT NULL,
  alamat_selama_cuti   VARCHAR(255)    NULL,
  lampiran             VARCHAR(255)    NULL,
  status               VARCHAR(30)     NOT NULL DEFAULT 'draft',
  dibuat_oleh          BIGINT UNSIGNED NULL,
  created_at           TIMESTAMP       NULL,
  updated_at           TIMESTAMP       NULL,
  KEY pengajuan_cutis_karyawan_id_index (karyawan_id),
  KEY pengajuan_cutis_status_index      (status),
  KEY pengajuan_cutis_tanggal_index     (tanggal_mulai),
  CONSTRAINT pengajuan_cutis_karyawan_id_foreign
    FOREIGN KEY (karyawan_id)   REFERENCES karyawans (id)   ON DELETE CASCADE  ON UPDATE RESTRICT,
  CONSTRAINT pengajuan_cutis_jenis_cuti_id_foreign
    FOREIGN KEY (jenis_cuti_id) REFERENCES jenis_cutis (id) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Riwayat Approval Pengajuan Cuti
CREATE TABLE IF NOT EXISTS leave_request_approvals (
  id                   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  pengajuan_cuti_id    BIGINT UNSIGNED NOT NULL,
  approver_id          BIGINT UNSIGNED NULL,           -- karyawan_id approver (nullable jika belum ditentukan)
  approver_user_id     BIGINT UNSIGNED NULL,           -- users.id yang melakukan aksi
  approver_role        VARCHAR(50)     NOT NULL,       -- 'atasan' | 'hrd'
  approval_level       INT             NOT NULL,       -- 1=atasan, 2=hrd
  status               VARCHAR(20)     NOT NULL DEFAULT 'pending', -- pending|approved|rejected
  note                 TEXT            NULL,
  approved_at          TIMESTAMP       NULL,
  created_at           TIMESTAMP       NULL,
  updated_at           TIMESTAMP       NULL,
  KEY lra_pengajuan_id_index  (pengajuan_cuti_id),
  KEY lra_approver_id_index   (approver_id),
  KEY lra_status_index        (status),
  CONSTRAINT lra_pengajuan_cuti_id_foreign
    FOREIGN KEY (pengajuan_cuti_id) REFERENCES pengajuan_cutis (id) ON DELETE CASCADE ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. Seed: Jenis Cuti Umum
INSERT IGNORE INTO jenis_cutis
  (kode_cuti, nama_cuti, jatah_hari_default, membutuhkan_lampiran, potong_saldo_cuti, status, keterangan, created_at, updated_at)
VALUES
  ('CT',  'Cuti Tahunan',    12, 0, 1, 'aktif', 'Cuti tahunan reguler 12 hari kerja',                   NOW(), NOW()),
  ('CM',  'Cuti Melahirkan', 90, 1, 0, 'aktif', 'Cuti melahirkan, tidak memotong saldo cuti tahunan',   NOW(), NOW()),
  ('CN',  'Cuti Menikah',     3, 1, 0, 'aktif', 'Cuti menikah 3 hari kerja, surat nikah wajib',         NOW(), NOW()),
  ('CP',  'Cuti Penting',     2, 0, 1, 'aktif', 'Cuti untuk keperluan penting mendesak',                NOW(), NOW()),
  ('CB',  'Cuti Bersama',     0, 0, 0, 'aktif', 'Cuti bersama nasional, tidak memotong saldo',          NOW(), NOW());

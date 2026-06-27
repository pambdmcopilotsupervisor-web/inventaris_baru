-- ============================================================
-- Migration: Compliance Pajak (PPh21) & BPJS
-- Tanggal  : 2026-06-22
-- Prinsip  : tarif/PTKP/bracket configurable di DB (seed nilai 2024).
--   - BPJS: porsi karyawan & perusahaan, ceiling (batas atas upah).
--   - PPh21: metode progresif-disetahunkan (PER-16/PJ-2016) — PTKP + bracket UU HPP.
--   - Komponen BPJS/PPh lama di salary_components ditandai is_statutory agar
--     tidak dihitung ganda (ditangani tax engine).
-- Catatan  : Idempotent.
-- ============================================================

-- 1. Pengaturan BPJS (per jenis: KES, JHT, JP, JKK, JKM)
CREATE TABLE IF NOT EXISTS bpjs_settings (
  id                   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  kode                 VARCHAR(20)     NOT NULL,
  nama                 VARCHAR(100)    NOT NULL,
  rate_karyawan        DECIMAL(7,4)    NOT NULL DEFAULT 0,   -- % dipotong dari karyawan
  rate_perusahaan      DECIMAL(7,4)    NOT NULL DEFAULT 0,   -- % ditanggung perusahaan
  batas_atas_upah      DECIMAL(15,2)   NULL,                 -- ceiling upah (NULL = tanpa batas)
  basis_component_code VARCHAR(40)     NOT NULL DEFAULT 'GAJI_POKOK',
  menambah_bruto_pajak TINYINT(1)      NOT NULL DEFAULT 0,   -- porsi perusahaan menambah bruto kena pajak
  pengurang_pajak      TINYINT(1)      NOT NULL DEFAULT 0,   -- porsi karyawan jadi pengurang penghasilan bruto
  is_active            TINYINT(1)      NOT NULL DEFAULT 1,
  urutan               INT             NOT NULL DEFAULT 0,
  keterangan           VARCHAR(255)    NULL,
  created_at           TIMESTAMP       NULL,
  updated_at           TIMESTAMP       NULL,
  UNIQUE KEY bpjs_settings_kode_unique (kode)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. PTKP (Penghasilan Tidak Kena Pajak) + kategori TER
CREATE TABLE IF NOT EXISTS ptkp_settings (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  kode           VARCHAR(10)     NOT NULL,                 -- TK/0, K/1, ...
  nama           VARCHAR(100)    NOT NULL,
  nominal_setahun DECIMAL(15,2)  NOT NULL,
  kategori_ter   ENUM('A','B','C') NOT NULL DEFAULT 'A',
  is_active      TINYINT(1)      NOT NULL DEFAULT 1,
  urutan         INT             NOT NULL DEFAULT 0,
  created_at     TIMESTAMP       NULL,
  updated_at     TIMESTAMP       NULL,
  UNIQUE KEY ptkp_settings_kode_unique (kode)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Lapisan tarif progresif PPh21 (UU HPP)
CREATE TABLE IF NOT EXISTS pph21_brackets (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  urutan      INT             NOT NULL DEFAULT 0,
  batas_bawah DECIMAL(18,2)   NOT NULL DEFAULT 0,
  batas_atas  DECIMAL(18,2)   NULL,                        -- NULL = tak terbatas (lapisan terakhir)
  tarif_persen DECIMAL(5,2)   NOT NULL DEFAULT 0,
  created_at  TIMESTAMP       NULL,
  updated_at  TIMESTAMP       NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Konfigurasi pajak global (single row)
CREATE TABLE IF NOT EXISTS payroll_tax_configs (
  id                       BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  biaya_jabatan_persen     DECIMAL(5,2)    NOT NULL DEFAULT 5.00,
  biaya_jabatan_maks_bulan DECIMAL(15,2)   NOT NULL DEFAULT 500000,
  metode_pph21             VARCHAR(20)     NOT NULL DEFAULT 'PROGRESIF',  -- PROGRESIF | TER (TER ekstensi)
  npwp_surcharge_persen    DECIMAL(5,2)    NOT NULL DEFAULT 20.00,        -- tambahan 20% bila tanpa NPWP
  pembulatan_pph           INT             NOT NULL DEFAULT 0,            -- pembulatan ke bawah PKP (mis. 1000)
  bpjs_enabled             TINYINT(1)      NOT NULL DEFAULT 1,
  pph21_enabled            TINYINT(1)      NOT NULL DEFAULT 1,
  created_at               TIMESTAMP       NULL,
  updated_at               TIMESTAMP       NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Flag is_statutory + kolom karyawan + slip (idempotent ALTER via procedure)
DROP PROCEDURE IF EXISTS _payroll_tax_alters;
DELIMITER //
CREATE PROCEDURE _payroll_tax_alters()
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='salary_components' AND COLUMN_NAME='is_statutory') THEN
    ALTER TABLE salary_components ADD COLUMN is_statutory TINYINT(1) NOT NULL DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='karyawans' AND COLUMN_NAME='status_ptkp') THEN
    ALTER TABLE karyawans ADD COLUMN status_ptkp VARCHAR(10) NOT NULL DEFAULT 'TK/0';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='karyawans' AND COLUMN_NAME='punya_npwp') THEN
    ALTER TABLE karyawans ADD COLUMN punya_npwp TINYINT(1) NOT NULL DEFAULT 1;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='payroll_slips' AND COLUMN_NAME='tax_detail') THEN
    ALTER TABLE payroll_slips ADD COLUMN tax_detail JSON NULL;
  END IF;
END //
DELIMITER ;
CALL _payroll_tax_alters();
DROP PROCEDURE IF EXISTS _payroll_tax_alters;

-- Tandai komponen BPJS/PPh lama sebagai statutory (ditangani tax engine).
UPDATE salary_components SET is_statutory = 1 WHERE code IN ('BPJS_TK', 'BPJS_KES', 'PPH21');

-- Tambah kategori BPJS pada detail slip (idempotent — MODIFY definisi enum).
ALTER TABLE payroll_slip_details MODIFY COLUMN category ENUM('SALARY','ATTENDANCE_DEDUCTION','TAX','BPJS','OTHER') NOT NULL DEFAULT 'OTHER';

-- ============================================================
-- SEED (nilai 2024) — idempotent (INSERT IGNORE pada kolom unik)
-- ============================================================
INSERT IGNORE INTO bpjs_settings (kode, nama, rate_karyawan, rate_perusahaan, batas_atas_upah, basis_component_code, menambah_bruto_pajak, pengurang_pajak, urutan, is_active, created_at, updated_at) VALUES
  ('KES', 'BPJS Kesehatan',            1.0000, 4.0000, 12000000, 'GAJI_POKOK', 1, 0, 1, 1, NOW(), NOW()),
  ('JHT', 'BPJS TK - Jaminan Hari Tua', 2.0000, 3.7000, NULL,     'GAJI_POKOK', 0, 1, 2, 1, NOW(), NOW()),
  ('JP',  'BPJS TK - Jaminan Pensiun',  1.0000, 2.0000, 9559600,  'GAJI_POKOK', 0, 1, 3, 1, NOW(), NOW()),
  ('JKK', 'BPJS TK - Kecelakaan Kerja', 0.0000, 0.2400, NULL,     'GAJI_POKOK', 1, 0, 4, 1, NOW(), NOW()),
  ('JKM', 'BPJS TK - Jaminan Kematian', 0.0000, 0.3000, NULL,     'GAJI_POKOK', 1, 0, 5, 1, NOW(), NOW());

INSERT IGNORE INTO ptkp_settings (kode, nama, nominal_setahun, kategori_ter, urutan, is_active, created_at, updated_at) VALUES
  ('TK/0', 'Tidak Kawin, 0 tanggungan', 54000000, 'A', 1, 1, NOW(), NOW()),
  ('TK/1', 'Tidak Kawin, 1 tanggungan', 58500000, 'A', 2, 1, NOW(), NOW()),
  ('TK/2', 'Tidak Kawin, 2 tanggungan', 63000000, 'B', 3, 1, NOW(), NOW()),
  ('TK/3', 'Tidak Kawin, 3 tanggungan', 67500000, 'B', 4, 1, NOW(), NOW()),
  ('K/0',  'Kawin, 0 tanggungan',       58500000, 'A', 5, 1, NOW(), NOW()),
  ('K/1',  'Kawin, 1 tanggungan',       63000000, 'B', 6, 1, NOW(), NOW()),
  ('K/2',  'Kawin, 2 tanggungan',       67500000, 'B', 7, 1, NOW(), NOW()),
  ('K/3',  'Kawin, 3 tanggungan',       72000000, 'C', 8, 1, NOW(), NOW());

-- Bracket UU HPP (idempotent: hanya insert bila tabel masih kosong)
INSERT INTO pph21_brackets (urutan, batas_bawah, batas_atas, tarif_persen, created_at, updated_at)
SELECT * FROM (
  SELECT 1 AS urutan, 0 AS batas_bawah, 60000000 AS batas_atas, 5.00 AS tarif_persen, NOW() AS created_at, NOW() AS updated_at
  UNION ALL SELECT 2, 60000000, 250000000, 15.00, NOW(), NOW()
  UNION ALL SELECT 3, 250000000, 500000000, 25.00, NOW(), NOW()
  UNION ALL SELECT 4, 500000000, 5000000000, 30.00, NOW(), NOW()
  UNION ALL SELECT 5, 5000000000, NULL, 35.00, NOW(), NOW()
) AS seed
WHERE NOT EXISTS (SELECT 1 FROM pph21_brackets LIMIT 1);

-- Konfigurasi global (idempotent: hanya insert bila kosong)
INSERT INTO payroll_tax_configs (biaya_jabatan_persen, biaya_jabatan_maks_bulan, metode_pph21, npwp_surcharge_persen, pembulatan_pph, bpjs_enabled, pph21_enabled, created_at, updated_at)
SELECT 5.00, 500000, 'PROGRESIF', 20.00, 0, 1, 1, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM payroll_tax_configs LIMIT 1);

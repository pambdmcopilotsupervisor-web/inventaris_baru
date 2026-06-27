-- ============================================================
-- Migration: Modul Payroll (Penggajian)
-- Tanggal  : 2026-06-22
-- Prinsip  :
--   1. Komponen gaji dinamis/configurable (tidak hardcode)
--   2. Setiap payroll = SNAPSHOT (immutable). Kode/nama/nilai komponen
--      dibekukan di payroll_slip_details, tidak ikut berubah meski master
--      komponen / nilai per karyawan diubah kemudian.
--   3. Semua nilai mengacu pada data periode berjalan.
-- Catatan  : Idempotent (CREATE TABLE IF NOT EXISTS + INSERT IGNORE).
-- ============================================================

-- ------------------------------------------------------------
-- 1. Master Komponen Gaji (dinamis & configurable)
--    type        : EARNING | DEDUCTION
--    calc_method : FIXED | PERCENT | FORMULA
--    PERCENT     → persentase dari basis_component_id; rate default disimpan
--                  di formula_expression, dapat dioverride per karyawan via
--                  employee_salary_components.value
--    FORMULA     → ekspresi matematika di formula_expression
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS salary_components (
  id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  code               VARCHAR(40)     NOT NULL,
  name               VARCHAR(150)    NOT NULL,
  type               ENUM('EARNING','DEDUCTION')        NOT NULL DEFAULT 'EARNING',
  calc_method        ENUM('FIXED','PERCENT','FORMULA')  NOT NULL DEFAULT 'FIXED',
  formula_expression TEXT            NULL,
  basis_component_id BIGINT UNSIGNED NULL,
  calc_order         INT             NOT NULL DEFAULT 0,
  is_taxable         TINYINT(1)      NOT NULL DEFAULT 0,
  is_active          TINYINT(1)      NOT NULL DEFAULT 1,
  created_at         TIMESTAMP       NULL,
  updated_at         TIMESTAMP       NULL,
  UNIQUE KEY salary_components_code_unique (code),
  KEY salary_components_type_index (type),
  KEY salary_components_calc_order_index (calc_order),
  KEY salary_components_is_active_index (is_active),
  KEY salary_components_basis_id_index (basis_component_id),
  CONSTRAINT salary_components_basis_id_foreign FOREIGN KEY (basis_component_id) REFERENCES salary_components (id) ON DELETE SET NULL ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 2. Komponen Gaji per Karyawan (effective-dated)
--    value = nominal (FIXED) atau persentase (PERCENT)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS employee_salary_components (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  employee_id    BIGINT UNSIGNED NOT NULL,
  component_id   BIGINT UNSIGNED NOT NULL,
  value          DECIMAL(15,4)   NOT NULL DEFAULT 0,
  effective_date DATE            NOT NULL,
  end_date       DATE            NULL,
  created_at     TIMESTAMP       NULL,
  updated_at     TIMESTAMP       NULL,
  KEY esc_employee_id_index (employee_id),
  KEY esc_component_id_index (component_id),
  KEY esc_effective_index (effective_date, end_date),
  CONSTRAINT esc_employee_id_foreign FOREIGN KEY (employee_id) REFERENCES karyawans (id) ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT esc_component_id_foreign FOREIGN KEY (component_id) REFERENCES salary_components (id) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 3. Aturan Potongan Absensi (configurable)
--    trigger_type: ALFA | LATE | EARLY_LEAVE | SICK_NO_CERT
--    calc_method : PER_DAY | PER_HOUR | PER_MINUTE | FLAT | PERCENT
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS attendance_deduction_rules (
  id                      BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name                    VARCHAR(150)    NOT NULL,
  trigger_type            ENUM('ALFA','LATE','EARLY_LEAVE','SICK_NO_CERT')         NOT NULL,
  calc_method             ENUM('PER_DAY','PER_HOUR','PER_MINUTE','FLAT','PERCENT') NOT NULL,
  basis_component_id      BIGINT UNSIGNED NULL,
  value                   DECIMAL(15,4)   NOT NULL DEFAULT 0,
  working_days            INT             NOT NULL DEFAULT 22,
  tolerance_minutes       INT             NULL,
  max_deduction_per_month DECIMAL(15,2)   NULL,
  is_active               TINYINT(1)      NOT NULL DEFAULT 1,
  created_at              TIMESTAMP       NULL,
  updated_at              TIMESTAMP       NULL,
  KEY adr_trigger_type_index (trigger_type),
  KEY adr_is_active_index (is_active),
  KEY adr_basis_component_id_index (basis_component_id),
  CONSTRAINT adr_basis_component_id_foreign FOREIGN KEY (basis_component_id) REFERENCES salary_components (id) ON DELETE SET NULL ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 4. Tier Keterlambatan (progresif, untuk trigger_type = LATE)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS attendance_late_tiers (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  rule_id           BIGINT UNSIGNED NOT NULL,
  late_from_minutes INT             NOT NULL,
  late_to_minutes   INT             NULL,
  deduction_type    ENUM('FIXED','PERCENT','PER_HOUR') NOT NULL,
  deduction_value   DECIMAL(15,4)   NOT NULL DEFAULT 0,
  created_at        TIMESTAMP       NULL,
  updated_at        TIMESTAMP       NULL,
  KEY alt_rule_id_index (rule_id),
  KEY alt_late_from_index (late_from_minutes),
  CONSTRAINT alt_rule_id_foreign FOREIGN KEY (rule_id) REFERENCES attendance_deduction_rules (id) ON DELETE CASCADE ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 5. Periode Payroll (per bulan)
--    status: DRAFT | CALCULATED | APPROVED | PAID | CLOSED
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payroll_periods (
  id           BIGINT UNSIGNED   NOT NULL AUTO_INCREMENT PRIMARY KEY,
  period_month TINYINT UNSIGNED  NOT NULL,
  period_year  SMALLINT UNSIGNED NOT NULL,
  status       ENUM('DRAFT','CALCULATED','APPROVED','PAID','CLOSED') NOT NULL DEFAULT 'DRAFT',
  notes        TEXT              NULL,
  created_by   BIGINT UNSIGNED   NULL,
  approved_by  BIGINT UNSIGNED   NULL,
  created_at   TIMESTAMP         NULL,
  updated_at   TIMESTAMP         NULL,
  UNIQUE KEY payroll_periods_month_year_unique (period_month, period_year),
  KEY payroll_periods_status_index (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 6. Header Payroll per Karyawan — SNAPSHOT
--    status: PENDING | REVIEWED | APPROVED
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payroll_slips (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  payroll_period_id BIGINT UNSIGNED NOT NULL,
  employee_id       BIGINT UNSIGNED NOT NULL,
  working_days      INT             NOT NULL DEFAULT 0,
  total_earnings    DECIMAL(18,2)   NOT NULL DEFAULT 0,
  total_deductions  DECIMAL(18,2)   NOT NULL DEFAULT 0,
  net_salary        DECIMAL(18,2)   NOT NULL DEFAULT 0,
  status            ENUM('PENDING','REVIEWED','APPROVED') NOT NULL DEFAULT 'PENDING',
  created_at        TIMESTAMP       NULL,
  updated_at        TIMESTAMP       NULL,
  UNIQUE KEY payroll_slips_period_employee_unique (payroll_period_id, employee_id),
  KEY payroll_slips_employee_id_index (employee_id),
  KEY payroll_slips_status_index (status),
  CONSTRAINT ps_payroll_period_id_foreign FOREIGN KEY (payroll_period_id) REFERENCES payroll_periods (id) ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT ps_employee_id_foreign FOREIGN KEY (employee_id) REFERENCES karyawans (id) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 7. Detail Payroll per Komponen — SNAPSHOT baris
--    component_code/component_name dibekukan; component_id hanya referensi.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payroll_slip_details (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  payroll_slip_id BIGINT UNSIGNED NOT NULL,
  component_id    BIGINT UNSIGNED NULL,
  component_code  VARCHAR(40)     NOT NULL,
  component_name  VARCHAR(150)    NOT NULL,
  type            ENUM('EARNING','DEDUCTION') NOT NULL,
  category        ENUM('SALARY','ATTENDANCE_DEDUCTION','TAX','OTHER') NOT NULL DEFAULT 'OTHER',
  basis_value     DECIMAL(18,2)   NOT NULL DEFAULT 0,
  quantity        DECIMAL(10,2)   NOT NULL DEFAULT 1,
  amount          DECIMAL(18,2)   NOT NULL DEFAULT 0,
  notes           VARCHAR(255)    NULL,
  sort_order      INT             NOT NULL DEFAULT 0,
  created_at      TIMESTAMP       NULL,
  updated_at      TIMESTAMP       NULL,
  KEY payroll_slip_details_slip_id_index (payroll_slip_id),
  KEY payroll_slip_details_component_id_index (component_id),
  CONSTRAINT psd_payroll_slip_id_foreign FOREIGN KEY (payroll_slip_id) REFERENCES payroll_slips (id) ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT psd_component_id_foreign FOREIGN KEY (component_id) REFERENCES salary_components (id) ON DELETE SET NULL ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- SEED: Komponen gaji umum (idempotent via INSERT IGNORE pada kolom unik `code`)
--   Catatan: untuk komponen PERCENT (BPJS), nilai rate default disimpan di
--   formula_expression (mis. '4.24' = 4.24%). Dapat dioverride per karyawan.
-- ============================================================
INSERT IGNORE INTO salary_components (code, name, type, calc_method, formula_expression, calc_order, is_taxable, is_active, created_at, updated_at) VALUES
  ('GAJI_POKOK',       'Gaji Pokok',                   'EARNING',   'FIXED',   NULL,    1,  1, 1, NOW(), NOW()),
  ('TJ_JABATAN',       'Tunjangan Jabatan',            'EARNING',   'FIXED',   NULL,    2,  1, 1, NOW(), NOW()),
  ('TJ_MAKAN',         'Tunjangan Makan',              'EARNING',   'FIXED',   NULL,    3,  0, 1, NOW(), NOW()),
  ('BPJS_TK',          'BPJS Ketenagakerjaan',         'DEDUCTION', 'PERCENT', '4.24', 10,  0, 1, NOW(), NOW()),
  ('BPJS_KES',         'BPJS Kesehatan',               'DEDUCTION', 'PERCENT', '1',    11,  0, 1, NOW(), NOW()),
  ('POTONGAN_ABSENSI', 'Potongan Absensi',             'DEDUCTION', 'FORMULA', NULL,   20,  0, 1, NOW(), NOW()),
  ('PPH21',            'PPh 21',                       'DEDUCTION', 'FORMULA', NULL,   30,  0, 1, NOW(), NOW());

-- Set basis_component_id komponen PERCENT (BPJS) → GAJI_POKOK (idempotent).
-- JOIN derived table agar MySQL mengizinkan referensi tabel yang sedang di-UPDATE.
UPDATE salary_components sc
JOIN (SELECT id AS gp_id FROM salary_components WHERE code = 'GAJI_POKOK' LIMIT 1) g
SET sc.basis_component_id = g.gp_id
WHERE sc.code IN ('BPJS_TK', 'BPJS_KES') AND sc.basis_component_id IS NULL;

-- ------------------------------------------------------------
-- Idempotent: tambah kolom working_days bila tabel sudah ada sebelumnya
-- ------------------------------------------------------------
DROP PROCEDURE IF EXISTS _add_adr_working_days;
DELIMITER //
CREATE PROCEDURE _add_adr_working_days()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'attendance_deduction_rules' AND COLUMN_NAME = 'working_days'
  ) THEN
    ALTER TABLE attendance_deduction_rules ADD COLUMN working_days INT NOT NULL DEFAULT 22 AFTER value;
  END IF;
END //
DELIMITER ;
CALL _add_adr_working_days();
DROP PROCEDURE IF EXISTS _add_adr_working_days;


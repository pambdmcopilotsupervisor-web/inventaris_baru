-- ============================================================
-- Migration: Komponen Gaji per Jabatan
-- Tanggal  : 2026-06-22
-- Tujuan   : Memungkinkan setup komponen gaji (mis. TJ_JABATAN, TJ_MAKAN)
--            berdasarkan JABATAN karyawan, bukan hanya per individu.
--            Nilai per-karyawan (employee_salary_components) tetap menang
--            sebagai override; jika tidak ada, dipakai nilai per-jabatan.
-- Catatan  : Idempotent (CREATE TABLE IF NOT EXISTS).
-- ============================================================

CREATE TABLE IF NOT EXISTS jabatan_salary_components (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  jabatan        VARCHAR(255)    NOT NULL,
  component_id   BIGINT UNSIGNED NOT NULL,
  value          DECIMAL(15,4)   NOT NULL DEFAULT 0,
  effective_date DATE            NOT NULL,
  end_date       DATE            NULL,
  created_at     TIMESTAMP       NULL,
  updated_at     TIMESTAMP       NULL,
  KEY jsc_jabatan_index (jabatan),
  KEY jsc_component_id_index (component_id),
  KEY jsc_effective_index (effective_date, end_date),
  CONSTRAINT jsc_component_id_foreign FOREIGN KEY (component_id) REFERENCES salary_components (id) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

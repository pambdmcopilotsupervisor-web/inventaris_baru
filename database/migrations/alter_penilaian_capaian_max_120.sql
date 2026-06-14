-- ============================================================
-- Migration: Allow nilai_capaian_sasaran up to 120
-- Database : MariaDB / MySQL
-- Tanggal  : 2026-06-14
-- ============================================================

DELIMITER //

CREATE PROCEDURE alter_penilaian_capaian_max_120()
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.CHECK_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE()
      AND CONSTRAINT_NAME = 'penilaian_nilai_capaian_check'
  ) THEN
    IF VERSION() LIKE '%MariaDB%' THEN
      SET @drop_sql = 'ALTER TABLE penilaian_kinerja DROP CONSTRAINT penilaian_nilai_capaian_check';
    ELSE
      SET @drop_sql = 'ALTER TABLE penilaian_kinerja DROP CHECK penilaian_nilai_capaian_check';
    END IF;

    PREPARE drop_stmt FROM @drop_sql;
    EXECUTE drop_stmt;
    DEALLOCATE PREPARE drop_stmt;
  END IF;

  ALTER TABLE penilaian_kinerja
    ADD CONSTRAINT penilaian_nilai_capaian_check
    CHECK (nilai_capaian_sasaran IS NULL OR (nilai_capaian_sasaran >= 0 AND nilai_capaian_sasaran <= 120));
END//

DELIMITER ;

CALL alter_penilaian_capaian_max_120();
DROP PROCEDURE alter_penilaian_capaian_max_120;

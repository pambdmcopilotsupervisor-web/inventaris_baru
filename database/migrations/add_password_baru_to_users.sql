-- ============================================================
-- Migration: Tambah kolom password_baru di tabel users
-- Untuk: aplikasi inventaris_baru (Next.js)
-- Kolom baru ini TIDAK mengubah kolom password yang sudah ada
-- sehingga aplikasi pedami-inventaris (Laravel) tetap berjalan normal
-- ============================================================

-- Tambah kolom password_baru jika belum ada (idempotent)
DROP PROCEDURE IF EXISTS _add_password_baru;
DELIMITER //
CREATE PROCEDURE _add_password_baru()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'users'
      AND COLUMN_NAME  = 'password_baru'
  ) THEN
    ALTER TABLE users
      ADD COLUMN `password_baru` VARCHAR(255) NULL
      COMMENT 'Password khusus aplikasi inventaris_baru (Next.js). NULL = gunakan kolom password lama.'
      AFTER `password`;
  END IF;
END //
DELIMITER ;
CALL _add_password_baru();
DROP PROCEDURE IF EXISTS _add_password_baru;

-- ============================================================
-- Set password awal untuk akun Riny87@pedami.com
-- Password awal: admin123
-- Hash bcrypt 12 rounds ($2b$12$...)
-- ============================================================
UPDATE users
  SET password_baru = '$2b$12$m4A3/xN.dVY/HeGGSVWUq.K0cdRpw6IT3Ky1K9N6N8pJyxwZ71S4.'
WHERE LOWER(email) = 'riny87@pedami.com';

-- Verifikasi
SELECT id, name, email,
  LEFT(password, 10) AS old_pass_prefix,
  CASE WHEN password_baru IS NULL THEN 'BELUM DISET' ELSE LEFT(password_baru, 10) END AS new_pass_prefix
FROM users;

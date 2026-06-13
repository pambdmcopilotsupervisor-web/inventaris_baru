ALTER TABLE absensi
  ADD COLUMN is_terlambat TINYINT(1) NOT NULL DEFAULT 0 AFTER status_absensi,
  ADD COLUMN is_pulang_cepat TINYINT(1) NOT NULL DEFAULT 0 AFTER is_terlambat,
  ADD COLUMN is_tidak_absen_masuk TINYINT(1) NOT NULL DEFAULT 0 AFTER is_pulang_cepat,
  ADD COLUMN is_tidak_absen_pulang TINYINT(1) NOT NULL DEFAULT 0 AFTER is_tidak_absen_masuk;

UPDATE absensi
SET
  is_terlambat = CASE WHEN menit_terlambat > 0 OR status_absensi = 'terlambat' THEN 1 ELSE 0 END,
  is_pulang_cepat = CASE WHEN menit_pulang_cepat > 0 OR status_absensi = 'pulang_cepat' THEN 1 ELSE 0 END,
  is_tidak_absen_masuk = CASE WHEN status_absensi = 'tidak_absen_masuk' THEN 1 ELSE 0 END,
  is_tidak_absen_pulang = CASE WHEN status_absensi = 'tidak_absen_pulang' THEN 1 ELSE 0 END;

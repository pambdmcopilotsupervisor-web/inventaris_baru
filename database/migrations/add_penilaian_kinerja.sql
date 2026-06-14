-- ============================================================
-- Migration: Modul Penilaian Kinerja Pegawai
-- Database : MariaDB / MySQL
-- Tanggal  : 2026-06-14
-- ============================================================

-- 1. Periode Penilaian
CREATE TABLE IF NOT EXISTS periode_penilaian (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  kode_periode    VARCHAR(50)     NOT NULL,
  nama_periode    VARCHAR(150)    NOT NULL,
  tanggal_mulai   DATE            NOT NULL,
  tanggal_selesai DATE            NOT NULL,
  tanggal_buka    DATE            NOT NULL,
  tanggal_tutup   DATE            NOT NULL,
  status          ENUM('draft','aktif','tutup') NOT NULL DEFAULT 'draft',
  keterangan      TEXT            NULL,
  created_at      TIMESTAMP       NULL,
  updated_at      TIMESTAMP       NULL,
  UNIQUE KEY periode_penilaian_kode_unique (kode_periode),
  KEY periode_penilaian_status_index (status),
  KEY periode_penilaian_tanggal_index (tanggal_mulai, tanggal_selesai),
  CONSTRAINT periode_penilaian_tanggal_check
    CHECK (tanggal_selesai >= tanggal_mulai),
  CONSTRAINT periode_penilaian_buka_tutup_check
    CHECK (tanggal_tutup >= tanggal_buka)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Master Komponen Penilaian
CREATE TABLE IF NOT EXISTS komponen_penilaian (
  id                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  kode_komponen         VARCHAR(50)     NOT NULL,
  nama_komponen         VARCHAR(150)    NOT NULL,
  deskripsi             TEXT            NULL,
  default_bobot_percent DECIMAL(5,2)    NOT NULL DEFAULT 0,
  urutan                INT             NOT NULL DEFAULT 0,
  aktif                 TINYINT(1)      NOT NULL DEFAULT 1,
  created_at            TIMESTAMP       NULL,
  updated_at            TIMESTAMP       NULL,
  UNIQUE KEY komponen_penilaian_kode_unique (kode_komponen),
  KEY komponen_penilaian_aktif_index (aktif),
  CONSTRAINT komponen_penilaian_bobot_check
    CHECK (default_bobot_percent >= 0 AND default_bobot_percent <= 100)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Bobot Komponen per Periode
CREATE TABLE IF NOT EXISTS periode_komponen_penilaian (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  id_periode     BIGINT UNSIGNED NOT NULL,
  id_komponen    BIGINT UNSIGNED NOT NULL,
  bobot_percent  DECIMAL(5,2)    NOT NULL,
  aktif          TINYINT(1)      NOT NULL DEFAULT 1,
  created_at     TIMESTAMP       NULL,
  updated_at     TIMESTAMP       NULL,
  UNIQUE KEY periode_komponen_unique (id_periode, id_komponen),
  KEY periode_komponen_periode_index (id_periode),
  KEY periode_komponen_komponen_index (id_komponen),
  CONSTRAINT periode_komponen_periode_foreign
    FOREIGN KEY (id_periode) REFERENCES periode_penilaian (id) ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT periode_komponen_komponen_foreign
    FOREIGN KEY (id_komponen) REFERENCES komponen_penilaian (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT periode_komponen_bobot_check
    CHECK (bobot_percent >= 0 AND bobot_percent <= 100)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Target Kerja Pegawai per Periode
CREATE TABLE IF NOT EXISTS target_kerja (
  id                   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  id_periode           BIGINT UNSIGNED NOT NULL,
  id_pegawai           BIGINT UNSIGNED NOT NULL,
  uraian_tugas         TEXT            NOT NULL,
  satuan               VARCHAR(50)     NOT NULL,
  target_nilai         DECIMAL(14,2)   NOT NULL DEFAULT 0,
  realisasi_nilai      DECIMAL(14,2)   NULL,
  bobot_dalam_capaian  DECIMAL(5,2)    NOT NULL DEFAULT 0,
  status               ENUM('draft','diajukan','disetujui','ditolak') NOT NULL DEFAULT 'draft',
  disetujui_oleh       BIGINT UNSIGNED NULL,
  disetujui_pada       TIMESTAMP       NULL,
  catatan              TEXT            NULL,
  catatan_pegawai      TEXT            NULL,
  catatan_atasan       TEXT            NULL,
  created_at           TIMESTAMP       NULL,
  updated_at           TIMESTAMP       NULL,
  KEY target_kerja_periode_pegawai_index (id_periode, id_pegawai),
  KEY target_kerja_pegawai_index (id_pegawai),
  KEY target_kerja_status_index (status),
  KEY target_kerja_disetujui_oleh_index (disetujui_oleh),
  CONSTRAINT target_kerja_periode_foreign
    FOREIGN KEY (id_periode) REFERENCES periode_penilaian (id) ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT target_kerja_pegawai_foreign
    FOREIGN KEY (id_pegawai) REFERENCES karyawans (id) ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT target_kerja_disetujui_oleh_foreign
    FOREIGN KEY (disetujui_oleh) REFERENCES karyawans (id) ON DELETE SET NULL ON UPDATE RESTRICT,
  CONSTRAINT target_kerja_target_check
    CHECK (target_nilai >= 0),
  CONSTRAINT target_kerja_realisasi_check
    CHECK (realisasi_nilai IS NULL OR realisasi_nilai >= 0),
  CONSTRAINT target_kerja_bobot_check
    CHECK (bobot_dalam_capaian >= 0 AND bobot_dalam_capaian <= 100)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Header Penilaian Kinerja Pegawai per Periode
CREATE TABLE IF NOT EXISTS penilaian_kinerja (
  id                       BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  id_periode               BIGINT UNSIGNED NOT NULL,
  id_pegawai               BIGINT UNSIGNED NOT NULL,
  id_penilai_atasan        BIGINT UNSIGNED NULL,
  id_verifikator           BIGINT UNSIGNED NULL,
  id_approver_final        BIGINT UNSIGNED NULL,
  status                   ENUM('draft','diajukan','diverifikasi','disetujui','final') NOT NULL DEFAULT 'draft',
  nilai_kehadiran          DECIMAL(5,2)    NULL,
  nilai_capaian_sasaran    DECIMAL(5,2)    NULL,
  nilai_perilaku           DECIMAL(5,2)    NULL,
  nilai_pengembangan       DECIMAL(5,2)    NULL,
  nilai_akhir              DECIMAL(5,2)    NULL,
  tanggal_diajukan         TIMESTAMP       NULL,
  tanggal_diverifikasi     TIMESTAMP       NULL,
  tanggal_disetujui        TIMESTAMP       NULL,
  tanggal_final            TIMESTAMP       NULL,
  catatan_pegawai          TEXT            NULL,
  catatan_atasan           TEXT            NULL,
  catatan_verifikator      TEXT            NULL,
  created_at               TIMESTAMP       NULL,
  updated_at               TIMESTAMP       NULL,
  UNIQUE KEY penilaian_periode_pegawai_unique (id_periode, id_pegawai),
  KEY penilaian_kinerja_periode_status_index (id_periode, status),
  KEY penilaian_kinerja_pegawai_index (id_pegawai),
  KEY penilaian_kinerja_penilai_index (id_penilai_atasan),
  KEY penilaian_kinerja_verifikator_index (id_verifikator),
  KEY penilaian_kinerja_approver_index (id_approver_final),
  CONSTRAINT penilaian_kinerja_periode_foreign
    FOREIGN KEY (id_periode) REFERENCES periode_penilaian (id) ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT penilaian_kinerja_pegawai_foreign
    FOREIGN KEY (id_pegawai) REFERENCES karyawans (id) ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT penilaian_kinerja_penilai_foreign
    FOREIGN KEY (id_penilai_atasan) REFERENCES karyawans (id) ON DELETE SET NULL ON UPDATE RESTRICT,
  CONSTRAINT penilaian_kinerja_verifikator_foreign
    FOREIGN KEY (id_verifikator) REFERENCES karyawans (id) ON DELETE SET NULL ON UPDATE RESTRICT,
  CONSTRAINT penilaian_kinerja_approver_foreign
    FOREIGN KEY (id_approver_final) REFERENCES karyawans (id) ON DELETE SET NULL ON UPDATE RESTRICT,
  CONSTRAINT penilaian_nilai_kehadiran_check
    CHECK (nilai_kehadiran IS NULL OR (nilai_kehadiran >= 0 AND nilai_kehadiran <= 100)),
  CONSTRAINT penilaian_nilai_capaian_check
    CHECK (nilai_capaian_sasaran IS NULL OR (nilai_capaian_sasaran >= 0 AND nilai_capaian_sasaran <= 120)),
  CONSTRAINT penilaian_nilai_perilaku_check
    CHECK (nilai_perilaku IS NULL OR (nilai_perilaku >= 0 AND nilai_perilaku <= 100)),
  CONSTRAINT penilaian_nilai_pengembangan_check
    CHECK (nilai_pengembangan IS NULL OR (nilai_pengembangan >= 0 AND nilai_pengembangan <= 100)),
  CONSTRAINT penilaian_nilai_akhir_check
    CHECK (nilai_akhir IS NULL OR (nilai_akhir >= 0 AND nilai_akhir <= 100))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. Detail Penilaian Perilaku Kerja
CREATE TABLE IF NOT EXISTS penilaian_perilaku (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  id_penilaian   BIGINT UNSIGNED NOT NULL,
  aspek          ENUM('integritas','kerjasama','inisiatif','orientasi_layanan','kedisiplinan') NOT NULL,
  nilai          TINYINT UNSIGNED NOT NULL,
  sumber         ENUM('mandiri','atasan') NOT NULL,
  id_penilai     BIGINT UNSIGNED NULL,
  catatan        TEXT            NULL,
  created_at     TIMESTAMP       NULL,
  updated_at     TIMESTAMP       NULL,
  UNIQUE KEY penilaian_perilaku_aspek_sumber_unique (id_penilaian, aspek, sumber),
  KEY penilaian_perilaku_penilaian_index (id_penilaian),
  KEY penilaian_perilaku_sumber_index (sumber),
  KEY penilaian_perilaku_penilai_index (id_penilai),
  CONSTRAINT penilaian_perilaku_penilaian_foreign
    FOREIGN KEY (id_penilaian) REFERENCES penilaian_kinerja (id) ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT penilaian_perilaku_penilai_foreign
    FOREIGN KEY (id_penilai) REFERENCES karyawans (id) ON DELETE SET NULL ON UPDATE RESTRICT,
  CONSTRAINT penilaian_perilaku_nilai_check
    CHECK (nilai >= 1 AND nilai <= 5)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. Log Approval / Perubahan Status Penilaian
CREATE TABLE IF NOT EXISTS approval_log (
  id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  id_penilaian       BIGINT UNSIGNED NOT NULL,
  actor_karyawan_id  BIGINT UNSIGNED NULL,
  aksi               VARCHAR(100)    NOT NULL,
  status_dari        ENUM('draft','diajukan','diverifikasi','disetujui','final') NULL,
  status_ke          ENUM('draft','diajukan','diverifikasi','disetujui','final') NULL,
  catatan            TEXT            NULL,
  created_at         TIMESTAMP       NULL,
  KEY approval_log_penilaian_created_index (id_penilaian, created_at),
  KEY approval_log_actor_created_index (actor_karyawan_id, created_at),
  CONSTRAINT approval_log_penilaian_foreign
    FOREIGN KEY (id_penilaian) REFERENCES penilaian_kinerja (id) ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT approval_log_actor_foreign
    FOREIGN KEY (actor_karyawan_id) REFERENCES karyawans (id) ON DELETE SET NULL ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 8. Seed Komponen Default
INSERT INTO komponen_penilaian
  (kode_komponen, nama_komponen, deskripsi, default_bobot_percent, urutan, aktif, created_at, updated_at)
VALUES
  ('KEHADIRAN', 'Kehadiran', 'Komponen penilaian dari data absensi pegawai', 20.00, 1, 1, NOW(), NOW()),
  ('CAPAIAN_SASARAN', 'Capaian Sasaran Kerja', 'Komponen penilaian dari target kerja dan realisasi pegawai', 40.00, 2, 1, NOW(), NOW()),
  ('PERILAKU_KERJA', 'Perilaku Kerja', 'Komponen penilaian perilaku kerja berdasarkan aspek perilaku', 30.00, 3, 1, NOW(), NOW()),
  ('PENGEMBANGAN_KOMPETENSI', 'Pengembangan Kompetensi', 'Komponen penilaian pengembangan kompetensi pegawai', 10.00, 4, 1, NOW(), NOW())
ON DUPLICATE KEY UPDATE
  nama_komponen = VALUES(nama_komponen),
  deskripsi = VALUES(deskripsi),
  default_bobot_percent = VALUES(default_bobot_percent),
  urutan = VALUES(urutan),
  aktif = VALUES(aktif),
  updated_at = NOW();

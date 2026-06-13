-- ============================================================
-- Migration: Fitur Izin Pegawai
-- Tanggal  : 2026-06-11
-- ============================================================

-- 1. Master Jenis Izin
CREATE TABLE IF NOT EXISTS jenis_izins (
  id                   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  kode_izin            VARCHAR(20)     NOT NULL,
  nama_izin            VARCHAR(100)    NOT NULL,
  satuan               VARCHAR(5)      NOT NULL DEFAULT 'hari',  -- hari | jam
  maksimal_durasi      INT             NOT NULL DEFAULT 1,
  membutuhkan_lampiran TINYINT(1)      NOT NULL DEFAULT 0,
  memotong_absensi     TINYINT(1)      NOT NULL DEFAULT 1,
  status               VARCHAR(10)     NOT NULL DEFAULT 'aktif',
  keterangan           VARCHAR(255)    NULL,
  created_at           TIMESTAMP       NULL,
  updated_at           TIMESTAMP       NULL,
  UNIQUE KEY jenis_izins_kode_unique (kode_izin)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Pengajuan Izin
CREATE TABLE IF NOT EXISTS pengajuan_izins (
  id                   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  karyawan_id          BIGINT UNSIGNED NOT NULL,
  jenis_izin_id        BIGINT UNSIGNED NOT NULL,
  tanggal_mulai        DATE            NOT NULL,
  tanggal_selesai      DATE            NOT NULL,
  jam_mulai            VARCHAR(8)      NULL,   -- HH:MM (untuk izin berbasis jam)
  jam_selesai          VARCHAR(8)      NULL,
  durasi               DECIMAL(5,2)    NOT NULL DEFAULT 0,
  satuan_durasi        VARCHAR(5)      NOT NULL DEFAULT 'hari',
  alasan               TEXT            NOT NULL,
  lampiran             VARCHAR(255)    NULL,
  status               VARCHAR(30)     NOT NULL DEFAULT 'draft',
  dibuat_oleh          BIGINT UNSIGNED NULL,
  created_at           TIMESTAMP       NULL,
  updated_at           TIMESTAMP       NULL,
  KEY pengajuan_izins_karyawan_id_index (karyawan_id),
  KEY pengajuan_izins_status_index      (status),
  KEY pengajuan_izins_tanggal_index     (tanggal_mulai),
  CONSTRAINT pengajuan_izins_karyawan_id_foreign
    FOREIGN KEY (karyawan_id)   REFERENCES karyawans (id)   ON DELETE CASCADE  ON UPDATE RESTRICT,
  CONSTRAINT pengajuan_izins_jenis_izin_id_foreign
    FOREIGN KEY (jenis_izin_id) REFERENCES jenis_izins (id) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Approval Izin (pola sama dengan leave_request_approvals)
CREATE TABLE IF NOT EXISTS izin_approvals (
  id                   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  pengajuan_izin_id    BIGINT UNSIGNED NOT NULL,
  approver_id          BIGINT UNSIGNED NULL,
  approver_user_id     BIGINT UNSIGNED NULL,
  approver_role        VARCHAR(50)     NOT NULL,
  approval_level       INT             NOT NULL,
  status               VARCHAR(20)     NOT NULL DEFAULT 'pending',
  note                 TEXT            NULL,
  approved_at          TIMESTAMP       NULL,
  created_at           TIMESTAMP       NULL,
  updated_at           TIMESTAMP       NULL,
  KEY izin_approvals_pengajuan_id_index (pengajuan_izin_id),
  KEY izin_approvals_approver_id_index  (approver_id),
  KEY izin_approvals_status_index       (status),
  CONSTRAINT izin_approvals_pengajuan_izin_id_foreign
    FOREIGN KEY (pengajuan_izin_id) REFERENCES pengajuan_izins (id) ON DELETE CASCADE ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Seed: Jenis Izin Umum
INSERT IGNORE INTO jenis_izins
  (kode_izin, nama_izin, satuan, maksimal_durasi, membutuhkan_lampiran, memotong_absensi, status, keterangan, created_at, updated_at)
VALUES
  ('IP',  'Izin Pribadi',         'hari', 3, 0, 1, 'aktif', 'Izin keperluan pribadi maksimal 3 hari',        NOW(), NOW()),
  ('IK',  'Izin Keluarga',        'hari', 3, 1, 1, 'aktif', 'Izin keperluan keluarga, surat keterangan wajib', NOW(), NOW()),
  ('IT',  'Izin Datang Terlambat','jam',  4, 0, 1, 'aktif', 'Izin terlambat, maksimal 4 jam',               NOW(), NOW()),
  ('IPC', 'Izin Pulang Cepat',    'jam',  4, 0, 1, 'aktif', 'Izin pulang lebih awal, maksimal 4 jam',       NOW(), NOW()),
  ('IKK', 'Izin Keluar Kantor',   'jam',  8, 0, 0, 'aktif', 'Izin keluar kantor sementara, status hadir tetap dihitung', NOW(), NOW()),
  ('IDL', 'Izin Dinas Luar',      'hari', 7, 1, 0, 'aktif', 'Dinas luar kota, surat tugas wajib',           NOW(), NOW());

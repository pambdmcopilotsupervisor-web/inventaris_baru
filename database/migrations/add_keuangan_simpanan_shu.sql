-- ============================================================
-- Modul Keuangan — Lanjutan: Simpanan Anggota & Distribusi SHU
-- Koperasi Pedami — PSAK 27 / ISAK 35
-- Prefix: keu_
-- ============================================================

-- -----------------------------------------------------------
-- 1. Akun baru: Simpanan Sukarela & Dana-dana Distribusi SHU
--    (Simpanan sukarela = KEWAJIBAN karena dapat ditarik.
--     Dana distribusi SHU = KEWAJIBAN sampai dibayarkan.)
-- -----------------------------------------------------------
INSERT IGNORE INTO keu_akun (kode, nama, jenis, kelompok, saldo_normal, level, parent_id, is_detail, is_active, urutan) VALUES
('2.1.6',  'Simpanan Sukarela',            'KEWAJIBAN', 'Simpanan Sukarela', 'KREDIT', 3, NULL, 1, 1, 37),
('2.3',    'Dana Pembagian SHU',           'KEWAJIBAN', NULL,                'KREDIT', 2, NULL, 0, 1, 45),
('2.3.1',  'SHU Bagian Anggota',           'KEWAJIBAN', 'Dana SHU',          'KREDIT', 3, NULL, 1, 1, 46),
('2.3.2',  'Dana Pengurus & Pengawas',     'KEWAJIBAN', 'Dana SHU',          'KREDIT', 3, NULL, 1, 1, 47),
('2.3.3',  'Dana Pendidikan',              'KEWAJIBAN', 'Dana SHU',          'KREDIT', 3, NULL, 1, 1, 48),
('2.3.4',  'Dana Kesejahteraan Pegawai',   'KEWAJIBAN', 'Dana SHU',          'KREDIT', 3, NULL, 1, 1, 49),
('2.3.5',  'Dana Sosial',                  'KEWAJIBAN', 'Dana SHU',          'KREDIT', 3, NULL, 1, 1, 50),
('2.3.6',  'Dana Pembangunan Daerah Kerja','KEWAJIBAN', 'Dana SHU',          'KREDIT', 3, NULL, 1, 1, 51),
('3.7',    'Ikhtisar Laba Rugi',           'EKUITAS',   NULL,                'KREDIT', 2, NULL, 1, 0, 57);

-- -----------------------------------------------------------
-- 2. Anggota Koperasi
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS keu_anggota (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  no_anggota    VARCHAR(30)  NOT NULL,
  nama          VARCHAR(150) NOT NULL,
  karyawan_id   BIGINT UNSIGNED NULL COMMENT 'Opsional: tautan ke data karyawan',
  no_ktp        VARCHAR(30)  NULL,
  no_hp         VARCHAR(30)  NULL,
  alamat        VARCHAR(255) NULL,
  tgl_gabung    DATE         NOT NULL,
  tgl_keluar    DATE         NULL,
  status        ENUM('AKTIF','NONAKTIF','KELUAR') NOT NULL DEFAULT 'AKTIF',
  keterangan    VARCHAR(255) NULL,
  created_at    TIMESTAMP    NULL,
  updated_at    TIMESTAMP    NULL,
  UNIQUE KEY uq_keu_anggota_no (no_anggota),
  KEY idx_keu_anggota_status (status),
  KEY idx_keu_anggota_karyawan (karyawan_id),
  CONSTRAINT fk_keu_anggota_karyawan FOREIGN KEY (karyawan_id)
    REFERENCES karyawans (id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -----------------------------------------------------------
-- 3. Transaksi Simpanan
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS keu_simpanan (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  anggota_id    BIGINT UNSIGNED NOT NULL,
  jenis         ENUM('POKOK','WAJIB','SUKARELA') NOT NULL,
  tipe          ENUM('SETOR','TARIK') NOT NULL DEFAULT 'SETOR',
  tanggal       DATE         NOT NULL,
  jumlah        DECIMAL(18,2) NOT NULL,
  keterangan    VARCHAR(255) NULL,
  -- Integrasi ke jurnal akuntansi (otomatis saat diposting)
  jurnal_id     BIGINT UNSIGNED NULL,
  -- Akun kas/bank lawan transaksi
  akun_kas_id   BIGINT UNSIGNED NULL,
  dibuat_oleh   BIGINT UNSIGNED NULL,
  created_at    TIMESTAMP    NULL,
  updated_at    TIMESTAMP    NULL,
  KEY idx_keu_simpanan_anggota (anggota_id),
  KEY idx_keu_simpanan_jenis (jenis),
  KEY idx_keu_simpanan_tanggal (tanggal),
  CONSTRAINT fk_keu_simpanan_anggota FOREIGN KEY (anggota_id)
    REFERENCES keu_anggota (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_keu_simpanan_jurnal FOREIGN KEY (jurnal_id)
    REFERENCES keu_jurnal (id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_keu_simpanan_akun FOREIGN KEY (akun_kas_id)
    REFERENCES keu_akun (id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_keu_simpanan_user FOREIGN KEY (dibuat_oleh)
    REFERENCES users (id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -----------------------------------------------------------
-- 4. Distribusi SHU — Header (per tahun buku)
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS keu_shu_run (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tahun         SMALLINT UNSIGNED NOT NULL,
  total_shu     DECIMAL(18,2) NOT NULL DEFAULT 0,
  tanggal       DATE         NOT NULL,
  status        ENUM('DRAFT','POSTED') NOT NULL DEFAULT 'DRAFT',
  jurnal_id     BIGINT UNSIGNED NULL,
  catatan       VARCHAR(255) NULL,
  dibuat_oleh   BIGINT UNSIGNED NULL,
  created_at    TIMESTAMP    NULL,
  updated_at    TIMESTAMP    NULL,
  UNIQUE KEY uq_keu_shu_run_tahun (tahun),
  CONSTRAINT fk_keu_shu_run_jurnal FOREIGN KEY (jurnal_id)
    REFERENCES keu_jurnal (id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_keu_shu_run_user FOREIGN KEY (dibuat_oleh)
    REFERENCES users (id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -----------------------------------------------------------
-- 5. Distribusi SHU — Alokasi (per pos pembagian)
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS keu_shu_alokasi (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  run_id        BIGINT UNSIGNED NOT NULL,
  nama_pos      VARCHAR(100) NOT NULL COMMENT 'mis: Jasa Anggota, Cadangan, Dana Pendidikan',
  persen        DECIMAL(5,2) NOT NULL DEFAULT 0,
  jumlah        DECIMAL(18,2) NOT NULL DEFAULT 0,
  akun_id       BIGINT UNSIGNED NOT NULL COMMENT 'Akun kredit tujuan alokasi',
  urutan        SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  created_at    TIMESTAMP    NULL,
  updated_at    TIMESTAMP    NULL,
  KEY idx_keu_shu_alokasi_run (run_id),
  CONSTRAINT fk_keu_shu_alokasi_run FOREIGN KEY (run_id)
    REFERENCES keu_shu_run (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_keu_shu_alokasi_akun FOREIGN KEY (akun_id)
    REFERENCES keu_akun (id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- Modul Keuangan — Koperasi Pedami
-- Standar: PSAK 27 / ISAK 35 (Koperasi)
-- Semua tabel diberi prefix keu_
-- ============================================================

-- -----------------------------------------------------------
-- 1. Bagan Akun (Chart of Accounts)
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS keu_akun (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  kode          VARCHAR(20)  NOT NULL COMMENT 'Nomor akun, mis: 1-1100',
  nama          VARCHAR(150) NOT NULL,
  jenis         ENUM('ASET','KEWAJIBAN','EKUITAS','PENDAPATAN','BEBAN') NOT NULL,
  -- Kelompok khas koperasi (opsional, untuk pengelompokan laporan)
  kelompok      VARCHAR(80)  NULL COMMENT 'Contoh: Simpanan Pokok, SHU, Dana Cadangan',
  saldo_normal  ENUM('DEBIT','KREDIT') NOT NULL,
  level         TINYINT UNSIGNED NOT NULL DEFAULT 1 COMMENT '1=Induk, 2=Sub, 3=Detail',
  parent_id     BIGINT UNSIGNED NULL,
  is_detail     TINYINT(1)   NOT NULL DEFAULT 1 COMMENT '1=dapat dipakai di jurnal',
  is_active     TINYINT(1)   NOT NULL DEFAULT 1,
  urutan        SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  keterangan    VARCHAR(255) NULL,
  created_at    TIMESTAMP    NULL,
  updated_at    TIMESTAMP    NULL,
  UNIQUE KEY uq_keu_akun_kode (kode),
  KEY idx_keu_akun_jenis (jenis),
  KEY idx_keu_akun_parent (parent_id),
  CONSTRAINT fk_keu_akun_parent FOREIGN KEY (parent_id)
    REFERENCES keu_akun (id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -----------------------------------------------------------
-- 2. Periode Fiskal
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS keu_periode_fiskal (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tahun         SMALLINT UNSIGNED NOT NULL,
  bulan         TINYINT UNSIGNED NOT NULL COMMENT '1-12',
  nama          VARCHAR(80)  NOT NULL COMMENT 'mis: Januari 2025',
  tgl_mulai     DATE         NOT NULL,
  tgl_selesai   DATE         NOT NULL,
  status        ENUM('BUKA','TUTUP','KUNCI') NOT NULL DEFAULT 'BUKA',
  catatan       VARCHAR(255) NULL,
  ditutup_oleh  BIGINT UNSIGNED NULL,
  ditutup_pada  TIMESTAMP    NULL,
  created_at    TIMESTAMP    NULL,
  updated_at    TIMESTAMP    NULL,
  UNIQUE KEY uq_keu_periode (tahun, bulan),
  KEY idx_keu_periode_status (status),
  CONSTRAINT fk_keu_periode_user FOREIGN KEY (ditutup_oleh)
    REFERENCES users (id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -----------------------------------------------------------
-- 3. Header Jurnal
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS keu_jurnal (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  nomor_jurnal    VARCHAR(30)  NOT NULL COMMENT 'Auto-generate: JU-202501-0001',
  tanggal         DATE         NOT NULL,
  keterangan      VARCHAR(255) NOT NULL,
  jenis           ENUM('UMUM','PENYESUAIAN','PENUTUP','BALIK','KHUSUS') NOT NULL DEFAULT 'UMUM',
  status          ENUM('DRAFT','POSTED') NOT NULL DEFAULT 'DRAFT',
  periode_id      BIGINT UNSIGNED NOT NULL,
  -- Integrasi modul lain
  source_modul    VARCHAR(50)  NULL COMMENT 'payroll / aset / manual',
  source_ref_id   VARCHAR(50)  NULL COMMENT 'ID referensi di modul asal',
  total_debit     DECIMAL(18,2) NOT NULL DEFAULT 0,
  total_kredit    DECIMAL(18,2) NOT NULL DEFAULT 0,
  dibuat_oleh     BIGINT UNSIGNED NOT NULL,
  diposting_oleh  BIGINT UNSIGNED NULL,
  diposting_pada  TIMESTAMP    NULL,
  created_at      TIMESTAMP    NULL,
  updated_at      TIMESTAMP    NULL,
  UNIQUE KEY uq_keu_jurnal_nomor (nomor_jurnal),
  KEY idx_keu_jurnal_tanggal (tanggal),
  KEY idx_keu_jurnal_status (status),
  KEY idx_keu_jurnal_periode (periode_id),
  CONSTRAINT fk_keu_jurnal_periode FOREIGN KEY (periode_id)
    REFERENCES keu_periode_fiskal (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_keu_jurnal_dibuat FOREIGN KEY (dibuat_oleh)
    REFERENCES users (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_keu_jurnal_diposting FOREIGN KEY (diposting_oleh)
    REFERENCES users (id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -----------------------------------------------------------
-- 4. Baris Jurnal (Debit / Kredit)
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS keu_jurnal_detail (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  jurnal_id     BIGINT UNSIGNED NOT NULL,
  akun_id       BIGINT UNSIGNED NOT NULL,
  urutan        SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  keterangan    VARCHAR(255) NULL,
  debit         DECIMAL(18,2) NOT NULL DEFAULT 0,
  kredit        DECIMAL(18,2) NOT NULL DEFAULT 0,
  created_at    TIMESTAMP    NULL,
  updated_at    TIMESTAMP    NULL,
  KEY idx_keu_jd_jurnal (jurnal_id),
  KEY idx_keu_jd_akun (akun_id),
  CONSTRAINT fk_keu_jd_jurnal FOREIGN KEY (jurnal_id)
    REFERENCES keu_jurnal (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_keu_jd_akun FOREIGN KEY (akun_id)
    REFERENCES keu_akun (id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -----------------------------------------------------------
-- 5. Anggaran (RAPB)
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS keu_anggaran (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  akun_id       BIGINT UNSIGNED NOT NULL,
  tahun         SMALLINT UNSIGNED NOT NULL,
  bulan         TINYINT UNSIGNED NOT NULL COMMENT '0 = tahunan (bukan bulanan)',
  jumlah        DECIMAL(18,2) NOT NULL DEFAULT 0,
  keterangan    VARCHAR(255) NULL,
  created_at    TIMESTAMP    NULL,
  updated_at    TIMESTAMP    NULL,
  UNIQUE KEY uq_keu_anggaran (akun_id, tahun, bulan),
  KEY idx_keu_anggaran_tahun (tahun),
  CONSTRAINT fk_keu_anggaran_akun FOREIGN KEY (akun_id)
    REFERENCES keu_akun (id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -----------------------------------------------------------
-- Seed: Bagan Akun default koperasi (PSAK 27 / ISAK 35)
-- Hanya insert bila tabel masih kosong
-- -----------------------------------------------------------
INSERT IGNORE INTO keu_akun (kode, nama, jenis, kelompok, saldo_normal, level, parent_id, is_detail, is_active, urutan) VALUES
-- ASET
('1', 'ASET', 'ASET', NULL, 'DEBIT', 1, NULL, 0, 1, 10),
('1.1', 'Aset Lancar', 'ASET', NULL, 'DEBIT', 2, NULL, 0, 1, 11),
('1.1.1', 'Kas', 'ASET', NULL, 'DEBIT', 3, NULL, 1, 1, 12),
('1.1.2', 'Bank', 'ASET', NULL, 'DEBIT', 3, NULL, 1, 1, 13),
('1.1.3', 'Piutang Anggota', 'ASET', NULL, 'DEBIT', 3, NULL, 1, 1, 14),
('1.1.4', 'Piutang Lain-lain', 'ASET', NULL, 'DEBIT', 3, NULL, 1, 1, 15),
('1.1.5', 'Persediaan', 'ASET', NULL, 'DEBIT', 3, NULL, 1, 1, 16),
('1.1.6', 'Perlengkapan', 'ASET', NULL, 'DEBIT', 3, NULL, 1, 1, 17),
('1.2', 'Aset Tidak Lancar', 'ASET', NULL, 'DEBIT', 2, NULL, 0, 1, 20),
('1.2.1', 'Aset Tetap', 'ASET', NULL, 'DEBIT', 3, NULL, 1, 1, 21),
('1.2.2', 'Akumulasi Penyusutan Aset Tetap', 'ASET', NULL, 'KREDIT', 3, NULL, 1, 1, 22),
('1.2.3', 'Investasi', 'ASET', NULL, 'DEBIT', 3, NULL, 1, 1, 23),
-- KEWAJIBAN
('2', 'KEWAJIBAN', 'KEWAJIBAN', NULL, 'KREDIT', 1, NULL, 0, 1, 30),
('2.1', 'Kewajiban Jangka Pendek', 'KEWAJIBAN', NULL, 'KREDIT', 2, NULL, 0, 1, 31),
('2.1.1', 'Hutang Usaha', 'KEWAJIBAN', NULL, 'KREDIT', 3, NULL, 1, 1, 32),
('2.1.2', 'Hutang Gaji', 'KEWAJIBAN', NULL, 'KREDIT', 3, NULL, 1, 1, 33),
('2.1.3', 'Hutang Pajak', 'KEWAJIBAN', NULL, 'KREDIT', 3, NULL, 1, 1, 34),
('2.1.4', 'Hutang BPJS', 'KEWAJIBAN', NULL, 'KREDIT', 3, NULL, 1, 1, 35),
('2.1.5', 'Kewajiban Lancar Lain-lain', 'KEWAJIBAN', NULL, 'KREDIT', 3, NULL, 1, 1, 36),
('2.2', 'Kewajiban Jangka Panjang', 'KEWAJIBAN', NULL, 'KREDIT', 2, NULL, 0, 1, 40),
('2.2.1', 'Hutang Bank Jangka Panjang', 'KEWAJIBAN', NULL, 'KREDIT', 3, NULL, 1, 1, 41),
-- EKUITAS (khas koperasi)
('3', 'EKUITAS', 'EKUITAS', NULL, 'KREDIT', 1, NULL, 0, 1, 50),
('3.1', 'Simpanan Pokok', 'EKUITAS', 'Simpanan Pokok', 'KREDIT', 2, NULL, 1, 1, 51),
('3.2', 'Simpanan Wajib', 'EKUITAS', 'Simpanan Wajib', 'KREDIT', 2, NULL, 1, 1, 52),
('3.3', 'Dana Cadangan', 'EKUITAS', 'Dana Cadangan', 'KREDIT', 2, NULL, 1, 1, 53),
('3.4', 'Hibah / Donasi', 'EKUITAS', NULL, 'KREDIT', 2, NULL, 1, 1, 54),
('3.5', 'SHU Tahun Berjalan', 'EKUITAS', 'SHU', 'KREDIT', 2, NULL, 1, 1, 55),
('3.6', 'SHU Ditahan', 'EKUITAS', 'SHU', 'KREDIT', 2, NULL, 1, 1, 56),
-- PENDAPATAN
('4', 'PENDAPATAN', 'PENDAPATAN', NULL, 'KREDIT', 1, NULL, 0, 1, 60),
('4.1', 'Pendapatan Usaha', 'PENDAPATAN', NULL, 'KREDIT', 2, NULL, 0, 1, 61),
('4.1.1', 'Pendapatan Sewa Kendaraan', 'PENDAPATAN', NULL, 'KREDIT', 3, NULL, 1, 1, 62),
('4.1.2', 'Pendapatan Jasa Lainnya', 'PENDAPATAN', NULL, 'KREDIT', 3, NULL, 1, 1, 63),
('4.2', 'Pendapatan Non-Usaha', 'PENDAPATAN', NULL, 'KREDIT', 2, NULL, 0, 1, 65),
('4.2.1', 'Pendapatan Bunga', 'PENDAPATAN', NULL, 'KREDIT', 3, NULL, 1, 1, 66),
('4.2.2', 'Pendapatan Lain-lain', 'PENDAPATAN', NULL, 'KREDIT', 3, NULL, 1, 1, 67),
-- BEBAN
('5', 'BEBAN', 'BEBAN', NULL, 'DEBIT', 1, NULL, 0, 1, 70),
('5.1', 'Beban Operasional', 'BEBAN', NULL, 'DEBIT', 2, NULL, 0, 1, 71),
('5.1.1', 'Beban Gaji & Tunjangan', 'BEBAN', NULL, 'DEBIT', 3, NULL, 1, 1, 72),
('5.1.2', 'Beban BPJS Perusahaan', 'BEBAN', NULL, 'DEBIT', 3, NULL, 1, 1, 73),
('5.1.3', 'Beban Lembur', 'BEBAN', NULL, 'DEBIT', 3, NULL, 1, 1, 74),
('5.1.4', 'Beban Perjalanan Dinas', 'BEBAN', NULL, 'DEBIT', 3, NULL, 1, 1, 75),
('5.2', 'Beban Administrasi & Umum', 'BEBAN', NULL, 'DEBIT', 2, NULL, 0, 1, 80),
('5.2.1', 'Beban Alat Tulis Kantor', 'BEBAN', NULL, 'DEBIT', 3, NULL, 1, 1, 81),
('5.2.2', 'Beban Listrik & Air', 'BEBAN', NULL, 'DEBIT', 3, NULL, 1, 1, 82),
('5.2.3', 'Beban Telepon & Internet', 'BEBAN', NULL, 'DEBIT', 3, NULL, 1, 1, 83),
('5.2.4', 'Beban Pemeliharaan', 'BEBAN', NULL, 'DEBIT', 3, NULL, 1, 1, 84),
('5.3', 'Beban Penyusutan & Amortisasi', 'BEBAN', NULL, 'DEBIT', 2, NULL, 0, 1, 85),
('5.3.1', 'Beban Penyusutan Aset Tetap', 'BEBAN', NULL, 'DEBIT', 3, NULL, 1, 1, 86),
('5.4', 'Beban Lain-lain', 'BEBAN', NULL, 'DEBIT', 2, NULL, 0, 1, 90),
('5.4.1', 'Beban Bunga & Keuangan', 'BEBAN', NULL, 'DEBIT', 3, NULL, 1, 1, 91),
('5.4.2', 'Beban Lain-lain', 'BEBAN', NULL, 'DEBIT', 3, NULL, 1, 1, 92);

-- Hubungkan parent-child berdasarkan kode bertingkat, mis. 1.1.1 -> 1.1.
UPDATE keu_akun child
JOIN keu_akun parent
  ON parent.kode = LEFT(child.kode, LENGTH(child.kode) - LOCATE('.', REVERSE(child.kode)))
SET child.parent_id = parent.id
WHERE child.kode LIKE '%.%'
  AND child.parent_id IS NULL;

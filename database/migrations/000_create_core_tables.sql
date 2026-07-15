-- ============================================================
-- 000_create_core_tables.sql
-- Membuat tabel-tabel "core" yang ada di Prisma schema tapi
-- TIDAK memiliki CREATE TABLE di file migration lainnya.
--
-- File ini HARUS dijalankan PERTAMA (nama dimulai '0' agar
-- urut sebelum add_*.sql dan alter_*.sql).
--
-- Semua statement idempotent (CREATE TABLE IF NOT EXISTS).
-- Aman dijalankan berulang kali.
-- ============================================================

-- ─────────────────────────────────────────────────────────────────────
-- Framework / Laravel tables
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `cache` (
  `key`        varchar(255) NOT NULL,
  `value`      mediumtext   NOT NULL,
  `expiration` int          NOT NULL,
  PRIMARY KEY (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `cache_locks` (
  `key`        varchar(255) NOT NULL,
  `owner`      varchar(255) NOT NULL,
  `expiration` int          NOT NULL,
  PRIMARY KEY (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `migrations` (
  `id`        int UNSIGNED NOT NULL AUTO_INCREMENT,
  `migration` varchar(255) NOT NULL,
  `batch`     int          NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `jobs` (
  `id`           bigint UNSIGNED  NOT NULL AUTO_INCREMENT,
  `queue`        varchar(255)     NOT NULL,
  `payload`      longtext         NOT NULL,
  `attempts`     tinyint UNSIGNED NOT NULL,
  `reserved_at`  int UNSIGNED     DEFAULT NULL,
  `available_at` int UNSIGNED     NOT NULL,
  `created_at`   int UNSIGNED     NOT NULL,
  PRIMARY KEY (`id`),
  KEY `jobs_queue_index` (`queue`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `job_batches` (
  `id`             varchar(255) NOT NULL,
  `name`           varchar(255) NOT NULL,
  `total_jobs`     int          NOT NULL,
  `pending_jobs`   int          NOT NULL,
  `failed_jobs`    int          NOT NULL,
  `failed_job_ids` longtext     NOT NULL,
  `options`        mediumtext   DEFAULT NULL,
  `cancelled_at`   int          DEFAULT NULL,
  `created_at`     int          NOT NULL,
  `finished_at`    int          DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `sessions` (
  `id`            varchar(255)  NOT NULL,
  `user_id`       bigint UNSIGNED DEFAULT NULL,
  `ip_address`    varchar(45)   DEFAULT NULL,
  `user_agent`    text          DEFAULT NULL,
  `payload`       longtext      NOT NULL,
  `last_activity` int           NOT NULL,
  PRIMARY KEY (`id`),
  KEY `sessions_last_activity_index` (`last_activity`),
  KEY `sessions_user_id_index` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `notifications` (
  `id`              char(36)      NOT NULL,
  `type`            varchar(255)  NOT NULL,
  `notifiable_type` varchar(255)  NOT NULL,
  `notifiable_id`   bigint UNSIGNED NOT NULL,
  `data`            text          NOT NULL,
  `read_at`         timestamp     NULL DEFAULT NULL,
  `created_at`      timestamp     NULL DEFAULT NULL,
  `updated_at`      timestamp     NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `notifications_notifiable_type_notifiable_id_index` (`notifiable_type`, `notifiable_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `password_reset_tokens` (
  `email`      varchar(255) NOT NULL,
  `token`      varchar(255) NOT NULL,
  `created_at` timestamp    NULL DEFAULT NULL,
  PRIMARY KEY (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────
-- Users (core auth — wajib ada sebelum exports, imports, keuangan)
-- Kolom password_baru ditambahkan via add_password_baru_to_users.sql
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `users` (
  `id`                bigint UNSIGNED NOT NULL AUTO_INCREMENT,
  `name`              varchar(255)    NOT NULL,
  `email`             varchar(255)    DEFAULT NULL,
  `email_verified_at` timestamp       NULL DEFAULT NULL,
  `password`          varchar(255)    NOT NULL,
  `remember_token`    varchar(100)    DEFAULT NULL,
  `created_at`        timestamp       NULL DEFAULT NULL,
  `updated_at`        timestamp       NULL DEFAULT NULL,
  `role`              varchar(50)     DEFAULT NULL,
  `karyawan_id`       int             DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `users_email_unique` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────
-- Exports & Imports (Filament / Laravel)
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `exports` (
  `id`              bigint UNSIGNED NOT NULL AUTO_INCREMENT,
  `completed_at`    timestamp       NULL DEFAULT NULL,
  `file_disk`       varchar(255)    NOT NULL,
  `file_name`       varchar(255)    DEFAULT NULL,
  `exporter`        varchar(255)    NOT NULL,
  `processed_rows`  int UNSIGNED    NOT NULL DEFAULT 0,
  `total_rows`      int UNSIGNED    NOT NULL,
  `successful_rows` int UNSIGNED    NOT NULL DEFAULT 0,
  `user_id`         bigint UNSIGNED NOT NULL,
  `created_at`      timestamp       NULL DEFAULT NULL,
  `updated_at`      timestamp       NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `exports_user_id_foreign` (`user_id`),
  CONSTRAINT `exports_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `imports` (
  `id`              bigint UNSIGNED NOT NULL AUTO_INCREMENT,
  `completed_at`    timestamp       NULL DEFAULT NULL,
  `file_name`       varchar(255)    NOT NULL,
  `file_path`       varchar(255)    NOT NULL,
  `importer`        varchar(255)    NOT NULL,
  `processed_rows`  int UNSIGNED    NOT NULL DEFAULT 0,
  `total_rows`      int UNSIGNED    NOT NULL,
  `successful_rows` int UNSIGNED    NOT NULL DEFAULT 0,
  `user_id`         bigint UNSIGNED NOT NULL,
  `created_at`      timestamp       NULL DEFAULT NULL,
  `updated_at`      timestamp       NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `imports_user_id_foreign` (`user_id`),
  CONSTRAINT `imports_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `failed_import_rows` (
  `id`               bigint UNSIGNED NOT NULL AUTO_INCREMENT,
  `data`             longtext        NOT NULL,
  `import_id`        bigint UNSIGNED NOT NULL,
  `validation_error` text            DEFAULT NULL,
  `created_at`       timestamp       NULL DEFAULT NULL,
  `updated_at`       timestamp       NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `failed_import_rows_import_id_foreign` (`import_id`),
  CONSTRAINT `failed_import_rows_import_id_foreign` FOREIGN KEY (`import_id`) REFERENCES `imports` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────
-- SDM: Divisi, Sub-divisi, Ruangan
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `divisis` (
  `id`          bigint UNSIGNED NOT NULL AUTO_INCREMENT,
  `kode_divisi` varchar(255)    NOT NULL,
  `nama_divisi` varchar(255)    NOT NULL,
  `created_at`  timestamp       NULL DEFAULT NULL,
  `updated_at`  timestamp       NULL DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `subdivisis` (
  `id`        bigint UNSIGNED NOT NULL AUTO_INCREMENT,
  `kode_sub`  varchar(255)    NOT NULL,
  `divisi_id` int             NOT NULL,
  `nama_sub`  varchar(255)    NOT NULL,
  `created_at` timestamp      NULL DEFAULT NULL,
  `updated_at` timestamp      NULL DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ruangans` (
  `id`         bigint UNSIGNED NOT NULL AUTO_INCREMENT,
  `ruangan`    varchar(255)    NOT NULL,
  `created_at` timestamp       NULL DEFAULT NULL,
  `updated_at` timestamp       NULL DEFAULT NULL,
  `lokasi`     varchar(50)     NOT NULL DEFAULT '',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────
-- Karyawans — WAJIB ada sebelum semua tabel SDM/Payroll lain
-- Catatan:
--   - atasan_id (self FK) ditambahkan via ALTER di add_payroll_p3.sql
--   - tanggal_keluar ditambahkan via ALTER di add_tanggal_keluar_karyawan.sql
--   - tarif_lembur_per_jam ditambahkan via ALTER di add_lembur.sql
--   - status_ptkp & punya_npwp ditambahkan via ALTER di add_payroll_tax.sql
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `karyawans` (
  `id`                        bigint UNSIGNED NOT NULL AUTO_INCREMENT,
  `nik`                       varchar(255)    NOT NULL,
  `nama_karyawan`             varchar(255)    NOT NULL,
  `divisi_id`                 int             DEFAULT NULL,
  `jabatan`                   varchar(255)    NOT NULL,
  `subdivisi_id`              int             DEFAULT NULL,
  `jkel`                      varchar(15)     NOT NULL,
  `created_at`                timestamp       NULL DEFAULT NULL,
  `updated_at`                timestamp       NULL DEFAULT NULL,
  `no_ktp`                    varchar(255)    DEFAULT NULL,
  `no_hp`                     varchar(255)    DEFAULT NULL,
  `no_rekening`               varchar(255)    DEFAULT NULL,
  `alamat`                    varchar(255)    DEFAULT NULL,
  `tanggal_lahir`             date            DEFAULT NULL,
  `tanggal_masuk_kerja`       date            DEFAULT NULL,
  `tempat_lahir`              varchar(100)    DEFAULT NULL,
  `nama_bank`                 varchar(100)    DEFAULT NULL,
  `kontak_darurat`            varchar(255)    DEFAULT NULL,
  `status_karyawan`           varchar(100)    DEFAULT NULL,
  `masa_kerja`                int             DEFAULT NULL,
  `no_bpjs_ketenagakerjaan`   varchar(255)    DEFAULT NULL,
  `no_bpjs_kesehatan`         varchar(255)    DEFAULT NULL,
  `pendidikan_terakhir`       varchar(100)    DEFAULT NULL,
  `umur`                      int             DEFAULT NULL,
  `agama`                     varchar(50)     DEFAULT NULL,
  `foto`                      varchar(100)    DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────
-- Mutasi Karyawan, Pensiun
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `mutasi_karyawans` (
  `id`                  bigint UNSIGNED NOT NULL AUTO_INCREMENT,
  `karyawan_id`         bigint UNSIGNED NOT NULL,
  `tgl_mutasi`          date            NOT NULL,
  `jabatan_asal`        varchar(255)    DEFAULT NULL,
  `jabatan_tujuan`      varchar(255)    DEFAULT NULL,
  `divisi_asal_id`      bigint UNSIGNED DEFAULT NULL,
  `subdivisi_asal_id`   bigint UNSIGNED DEFAULT NULL,
  `divisi_tujuan_id`    bigint UNSIGNED DEFAULT NULL,
  `subdivisi_tujuan_id` bigint UNSIGNED DEFAULT NULL,
  `alasan`              varchar(255)    DEFAULT NULL,
  `no_sk`               varchar(255)    DEFAULT NULL,
  `created_at`          timestamp       NULL DEFAULT NULL,
  `updated_at`          timestamp       NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `mutasi_karyawans_karyawan_id_foreign` (`karyawan_id`),
  KEY `mutasi_karyawans_divisi_asal_id_foreign` (`divisi_asal_id`),
  KEY `mutasi_karyawans_divisi_tujuan_id_foreign` (`divisi_tujuan_id`),
  KEY `mutasi_karyawans_subdivisi_asal_id_foreign` (`subdivisi_asal_id`),
  KEY `mutasi_karyawans_subdivisi_tujuan_id_foreign` (`subdivisi_tujuan_id`),
  CONSTRAINT `mutasi_karyawans_karyawan_id_foreign` FOREIGN KEY (`karyawan_id`) REFERENCES `karyawans` (`id`) ON DELETE CASCADE,
  CONSTRAINT `mutasi_karyawans_divisi_asal_id_foreign` FOREIGN KEY (`divisi_asal_id`) REFERENCES `divisis` (`id`),
  CONSTRAINT `mutasi_karyawans_divisi_tujuan_id_foreign` FOREIGN KEY (`divisi_tujuan_id`) REFERENCES `divisis` (`id`),
  CONSTRAINT `mutasi_karyawans_subdivisi_asal_id_foreign` FOREIGN KEY (`subdivisi_asal_id`) REFERENCES `subdivisis` (`id`),
  CONSTRAINT `mutasi_karyawans_subdivisi_tujuan_id_foreign` FOREIGN KEY (`subdivisi_tujuan_id`) REFERENCES `subdivisis` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `pensiun_karyawans` (
  `id`                    bigint UNSIGNED NOT NULL AUTO_INCREMENT,
  `karyawan_id`           bigint UNSIGNED NOT NULL,
  `tgl_pensiun`           date            NOT NULL,
  `jenis_pensiun`         varchar(255)    NOT NULL,
  `no_sk`                 varchar(255)    DEFAULT NULL,
  `jabatan_terakhir`      varchar(255)    DEFAULT NULL,
  `divisi_terakhir_id`    bigint UNSIGNED DEFAULT NULL,
  `subdivisi_terakhir_id` bigint UNSIGNED DEFAULT NULL,
  `pesangon`              decimal(15,2)   NOT NULL DEFAULT 0.00,
  `keterangan`            text            DEFAULT NULL,
  `created_at`            timestamp       NULL DEFAULT NULL,
  `updated_at`            timestamp       NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `pensiun_karyawans_karyawan_id_foreign` (`karyawan_id`),
  KEY `pensiun_karyawans_divisi_terakhir_id_foreign` (`divisi_terakhir_id`),
  KEY `pensiun_karyawans_subdivisi_terakhir_id_foreign` (`subdivisi_terakhir_id`),
  CONSTRAINT `pensiun_karyawans_karyawan_id_foreign` FOREIGN KEY (`karyawan_id`) REFERENCES `karyawans` (`id`) ON DELETE CASCADE,
  CONSTRAINT `pensiun_karyawans_divisi_terakhir_id_foreign` FOREIGN KEY (`divisi_terakhir_id`) REFERENCES `divisis` (`id`),
  CONSTRAINT `pensiun_karyawans_subdivisi_terakhir_id_foreign` FOREIGN KEY (`subdivisi_terakhir_id`) REFERENCES `subdivisis` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────
-- Kendaraan (R2/R4)
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `data_r2r4s` (
  `id`                  bigint UNSIGNED NOT NULL AUTO_INCREMENT,
  `kode_brg`            varchar(255)    NOT NULL,
  `jns_brg`             varchar(255)    NOT NULL,
  `plat`                varchar(255)    NOT NULL,
  `nm_brg`              varchar(255)    NOT NULL,
  `gambar_fisik`        varchar(100)    DEFAULT NULL,
  `thn`                 int             DEFAULT NULL,
  `no_rangka`           varchar(255)    DEFAULT NULL,
  `no_mesin`            varchar(255)    DEFAULT NULL,
  `pajak`               date            DEFAULT NULL,
  `gambar_pajak`        varchar(100)    DEFAULT NULL,
  `stnk`                date            DEFAULT NULL,
  `gambar_stnk`         varchar(100)    DEFAULT NULL,
  `bpkb`                varchar(100)    DEFAULT NULL,
  `warna`               varchar(255)    DEFAULT NULL,
  `service`             date            DEFAULT NULL,
  `foto`                varchar(100)    DEFAULT NULL,
  `pemegang`            varchar(255)    DEFAULT NULL,
  `departemen`          varchar(255)    DEFAULT NULL,
  `gbr_barang`          varchar(100)    DEFAULT NULL,
  `stat`                varchar(255)    DEFAULT NULL,
  `created_at`          timestamp       NULL DEFAULT NULL,
  `updated_at`          timestamp       NULL DEFAULT NULL,
  `no_bpkb`             varchar(50)     DEFAULT NULL,
  `tgl_akhir_kir`       date            DEFAULT NULL,
  `tgl_stop_tagihan`    date            DEFAULT NULL,
  `hrg_sewa`            int             DEFAULT NULL,
  `hrg_beli`            decimal(15,2)   DEFAULT NULL,
  `deskripsi`           varchar(250)    DEFAULT NULL,
  `alasan_stop_tagihan` varchar(255)    DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `mutasi_r2r4s` (
  `id`               bigint UNSIGNED NOT NULL AUTO_INCREMENT,
  `data_r2r4_id`     bigint UNSIGNED NOT NULL,
  `pemegang_awal`    varchar(255)    DEFAULT NULL,
  `departemen_awal`  varchar(255)    DEFAULT NULL,
  `pemegang_tujuan`  varchar(255)    NOT NULL,
  `departemen_tujuan` varchar(255)   NOT NULL,
  `tgl_mutasi`       date            NOT NULL,
  `deskripsi`        varchar(255)    DEFAULT NULL,
  `created_at`       timestamp       NULL DEFAULT NULL,
  `updated_at`       timestamp       NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `mutasi_r2r4s_data_r2r4_id_foreign` (`data_r2r4_id`),
  CONSTRAINT `mutasi_r2r4s_data_r2r4_id_foreign` FOREIGN KEY (`data_r2r4_id`) REFERENCES `data_r2r4s` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `riwayat_pembayaran_r2r4s` (
  `id`                     bigint UNSIGNED                  NOT NULL AUTO_INCREMENT,
  `data_r2r4_id`           bigint UNSIGNED                  NOT NULL,
  `jenis_pembayaran`       ENUM('Pajak','STNK','KIR')       NOT NULL,
  `tanggal_pembayaran`     date                             NOT NULL,
  `biaya`                  bigint                           NOT NULL DEFAULT 0,
  `jatuh_tempo_berikutnya` date                             DEFAULT NULL,
  `keterangan`             text                             DEFAULT NULL,
  `bukti_foto`             varchar(255)                     DEFAULT NULL,
  `created_at`             timestamp                        NULL DEFAULT NULL,
  `updated_at`             timestamp                        NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `riwayat_pembayaran_r2r4s_data_r2r4_id_foreign` (`data_r2r4_id`),
  CONSTRAINT `riwayat_pembayaran_r2r4s_data_r2r4_id_foreign` FOREIGN KEY (`data_r2r4_id`) REFERENCES `data_r2r4s` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `riwayat_servis_r2r4s` (
  `id`             bigint UNSIGNED NOT NULL AUTO_INCREMENT,
  `data_r2r4_id`   bigint UNSIGNED NOT NULL,
  `tanggal_servis` date            NOT NULL,
  `jenis_servis`   varchar(255)    NOT NULL,
  `biaya`          bigint          NOT NULL DEFAULT 0,
  `bengkel`        varchar(255)    DEFAULT NULL,
  `keterangan`     text            DEFAULT NULL,
  `struk_foto`     varchar(255)    DEFAULT NULL,
  `created_at`     timestamp       NULL DEFAULT NULL,
  `updated_at`     timestamp       NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `riwayat_servis_r2r4s_data_r2r4_id_foreign` (`data_r2r4_id`),
  CONSTRAINT `riwayat_servis_r2r4s_data_r2r4_id_foreign` FOREIGN KEY (`data_r2r4_id`) REFERENCES `data_r2r4s` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `penjualan_r2r4s` (
  `id`           int           NOT NULL AUTO_INCREMENT,
  `created_at`   timestamp     NULL DEFAULT NULL,
  `updated_at`   timestamp     NULL DEFAULT NULL,
  `data_r2r4_id` int           DEFAULT NULL,
  `tgl_jual`     date          DEFAULT NULL,
  `hrg_jual`     int           DEFAULT NULL,
  `nm_pembeli`   varchar(50)   DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────
-- Aset (inventaris kantor/AC/dll)
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `assets` (
  `id`                 bigint UNSIGNED NOT NULL AUTO_INCREMENT,
  `kode_asset`         varchar(255)    NOT NULL,
  `nama_asset`         varchar(255)    NOT NULL,
  `gambar`             varchar(100)    DEFAULT NULL,
  `tgl_beli`           date            DEFAULT NULL,
  `hrg_beli`           int             DEFAULT NULL,
  `kelompok_asset`     varchar(255)    NOT NULL,
  `ruangan_id`         int             DEFAULT NULL,
  `penanggung_jawab_id` int            NOT NULL,
  `pemakai`            varchar(50)     DEFAULT NULL,
  `divisi`             varchar(100)    DEFAULT NULL,
  `status_barang`      varchar(15)     NOT NULL,
  `karyawan_id`        int             NOT NULL,
  `created_at`         timestamp       NULL DEFAULT NULL,
  `updated_at`         timestamp       NULL DEFAULT NULL,
  `foto`               varchar(100)    DEFAULT NULL,
  `deskripsi`          varchar(250)    DEFAULT NULL,
  `kode_nama`          varchar(100)    DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `riwayat_service_acs` (
  `id`               bigint UNSIGNED NOT NULL AUTO_INCREMENT,
  `asset_id`         bigint UNSIGNED NOT NULL,
  `tanggal_service`  date            NOT NULL,
  `jenis_pekerjaan`  varchar(255)    NOT NULL,
  `biaya`            bigint          NOT NULL DEFAULT 0,
  `teknisi`          varchar(255)    DEFAULT NULL,
  `keterangan`       text            DEFAULT NULL,
  `bukti_foto`       varchar(255)    DEFAULT NULL,
  `created_at`       timestamp       NULL DEFAULT NULL,
  `updated_at`       timestamp       NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `riwayat_service_acs_asset_id_foreign` (`asset_id`),
  CONSTRAINT `riwayat_service_acs_asset_id_foreign` FOREIGN KEY (`asset_id`) REFERENCES `assets` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `mutasi_assets` (
  `id`                   int           NOT NULL AUTO_INCREMENT,
  `created_at`           timestamp     NULL DEFAULT NULL,
  `updated_at`           timestamp     NULL DEFAULT NULL,
  `ruangan_id_a`         int           NOT NULL,
  `penanggung_jawab_id_a` int          NOT NULL,
  `karyawan_id_a`        int           NOT NULL,
  `ruangan_id_t`         int           NOT NULL,
  `penanggung_jawab_id_t` int          NOT NULL,
  `karyawan_id_t`        int           NOT NULL,
  `tgl_mutasi`           date          NOT NULL,
  `deskripsi`            varchar(100)  NOT NULL,
  `asset_id`             int           NOT NULL,
  `penanggung_jawab_id`  int           DEFAULT NULL,
  `ruangan_id`           int           DEFAULT NULL,
  `karyawan_id`          int           DEFAULT NULL,
  `gambar_awal`          varchar(100)  DEFAULT NULL,
  `gambar_terbaru`       varchar(100)  DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `permohonan_disposal` (
  `id`               bigint UNSIGNED NOT NULL AUTO_INCREMENT,
  `nomor`            varchar(30)     DEFAULT NULL,
  `asset_id`         int             NOT NULL,
  `tgl_pengajuan`    date            NOT NULL,
  `gambar`           varchar(100)    DEFAULT NULL,
  `kondisi`          varchar(50)     DEFAULT NULL,
  `dibuat_oleh`      int             DEFAULT NULL,
  `verif_manager`    int             DEFAULT NULL,
  `verif_ketua`      int             DEFAULT NULL,
  `keterangan`       varchar(255)    DEFAULT NULL,
  `created_at`       timestamp       NULL DEFAULT NULL,
  `updated_at`       timestamp       NULL DEFAULT NULL,
  `tgl_verif_manager` datetime       DEFAULT NULL,
  `tgl_verif_ketua`  datetime        DEFAULT NULL,
  `ketua_id`         int             DEFAULT NULL,
  `manager_id`       int             DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────
-- Kontrak
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `kontraks` (
  `id`         bigint UNSIGNED NOT NULL AUTO_INCREMENT,
  `created_at` timestamp       NULL DEFAULT NULL,
  `updated_at` timestamp       NULL DEFAULT NULL,
  `no_kontrak` varchar(50)     DEFAULT NULL,
  `judul`      varchar(250)    NOT NULL,
  `tgl_awal`   date            NOT NULL,
  `tgl_akhir`  date            NOT NULL,
  `file`       varchar(100)    DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `kontrak_details` (
  `id`           bigint UNSIGNED NOT NULL AUTO_INCREMENT,
  `created_at`   timestamp       NULL DEFAULT NULL,
  `updated_at`   timestamp       NULL DEFAULT NULL,
  `data_r2r4_id` int             DEFAULT NULL,
  `kontrak_id`   int             NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

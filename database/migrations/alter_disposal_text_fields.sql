-- Perlonggar field teks disposal agar pengajuan tidak gagal saat nomor/alasan panjang.

ALTER TABLE `permohonan_disposal`
  MODIFY COLUMN `nomor` varchar(100) DEFAULT NULL,
  MODIFY COLUMN `keterangan` text DEFAULT NULL;

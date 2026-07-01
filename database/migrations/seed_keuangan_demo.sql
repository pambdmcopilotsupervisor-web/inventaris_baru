-- ============================================================
-- Demo Seed Modul Keuangan
-- Aman dijalankan ulang: jurnal memakai source_modul/source_ref_id demo.
-- Tahun demo: 2026
-- ============================================================

SET @user_id := (SELECT id FROM users ORDER BY id LIMIT 1);

-- Periode fiskal 2026
INSERT IGNORE INTO keu_periode_fiskal (tahun, bulan, nama, tgl_mulai, tgl_selesai, status, catatan, created_at, updated_at) VALUES
(2026, 1, 'Januari 2026', '2026-01-01', '2026-01-31', 'BUKA', 'Demo seed', NOW(), NOW()),
(2026, 2, 'Februari 2026', '2026-02-01', '2026-02-28', 'BUKA', 'Demo seed', NOW(), NOW()),
(2026, 3, 'Maret 2026', '2026-03-01', '2026-03-31', 'BUKA', 'Demo seed', NOW(), NOW()),
(2026, 4, 'April 2026', '2026-04-01', '2026-04-30', 'BUKA', 'Demo seed', NOW(), NOW()),
(2026, 5, 'Mei 2026', '2026-05-01', '2026-05-31', 'BUKA', 'Demo seed', NOW(), NOW()),
(2026, 6, 'Juni 2026', '2026-06-01', '2026-06-30', 'BUKA', 'Demo seed', NOW(), NOW()),
(2026, 7, 'Juli 2026', '2026-07-01', '2026-07-31', 'BUKA', 'Demo seed', NOW(), NOW()),
(2026, 8, 'Agustus 2026', '2026-08-01', '2026-08-31', 'BUKA', 'Demo seed', NOW(), NOW()),
(2026, 9, 'September 2026', '2026-09-01', '2026-09-30', 'BUKA', 'Demo seed', NOW(), NOW()),
(2026, 10, 'Oktober 2026', '2026-10-01', '2026-10-31', 'BUKA', 'Demo seed', NOW(), NOW()),
(2026, 11, 'November 2026', '2026-11-01', '2026-11-30', 'BUKA', 'Demo seed', NOW(), NOW()),
(2026, 12, 'Desember 2026', '2026-12-01', '2026-12-31', 'BUKA', 'Demo seed', NOW(), NOW());

-- Anggota demo
INSERT IGNORE INTO keu_anggota (no_anggota, nama, no_hp, alamat, tgl_gabung, status, keterangan, created_at, updated_at) VALUES
('A-9001', 'Andi Saputra', '081234560001', 'Makassar', '2025-01-10', 'AKTIF', 'Demo seed', NOW(), NOW()),
('A-9002', 'Bunga Lestari', '081234560002', 'Gowa', '2025-02-15', 'AKTIF', 'Demo seed', NOW(), NOW()),
('A-9003', 'Chandra Wijaya', '081234560003', 'Maros', '2025-03-20', 'AKTIF', 'Demo seed', NOW(), NOW());

-- Helper: saldo awal 2026
INSERT IGNORE INTO keu_jurnal (nomor_jurnal, tanggal, keterangan, jenis, status, periode_id, source_modul, source_ref_id, total_debit, total_kredit, dibuat_oleh, diposting_oleh, diposting_pada, created_at, updated_at)
SELECT 'DEMO-202601-0001', '2026-01-01', 'Demo Saldo Awal 2026', 'UMUM', 'POSTED', p.id, 'demo_seed', 'demo:opening:2026', 320000000, 320000000, @user_id, @user_id, NOW(), NOW(), NOW()
FROM keu_periode_fiskal p WHERE p.tahun = 2026 AND p.bulan = 1;

INSERT INTO keu_jurnal_detail (jurnal_id, akun_id, urutan, keterangan, debit, kredit, created_at, updated_at)
SELECT j.id, a.id, x.urutan, x.ket, x.debit, x.kredit, NOW(), NOW()
FROM keu_jurnal j
JOIN (
  SELECT '1.1.1' kode, 0 urutan, 'Saldo awal kas' ket, 50000000 debit, 0 kredit UNION ALL
  SELECT '1.1.2', 1, 'Saldo awal bank', 150000000, 0 UNION ALL
  SELECT '1.1.3', 2, 'Saldo awal piutang anggota', 20000000, 0 UNION ALL
  SELECT '1.2.1', 3, 'Saldo awal aset tetap', 100000000, 0 UNION ALL
  SELECT '1.2.2', 4, 'Akumulasi penyusutan awal', 0, 80000000 UNION ALL
  SELECT '2.1.1', 5, 'Hutang usaha awal', 0, 20000000 UNION ALL
  SELECT '3.1', 6, 'Simpanan pokok awal', 0, 60000000 UNION ALL
  SELECT '3.2', 7, 'Simpanan wajib awal', 0, 90000000 UNION ALL
  SELECT '3.3', 8, 'Dana cadangan awal', 0, 40000000 UNION ALL
  SELECT '3.6', 9, 'SHU ditahan awal', 0, 30000000
) x JOIN keu_akun a ON a.kode = x.kode
WHERE j.source_modul = 'demo_seed' AND j.source_ref_id = 'demo:opening:2026'
  AND NOT EXISTS (SELECT 1 FROM keu_jurnal_detail d WHERE d.jurnal_id = j.id);

-- Transaksi jurnal demo bulanan
INSERT IGNORE INTO keu_jurnal (nomor_jurnal, tanggal, keterangan, jenis, status, periode_id, source_modul, source_ref_id, total_debit, total_kredit, dibuat_oleh, diposting_oleh, diposting_pada, created_at, updated_at)
SELECT 'DEMO-202601-0002', '2026-01-10', 'Demo penerimaan pendapatan jasa', 'KHUSUS', 'POSTED', p.id, 'demo_seed', 'demo:income:jan', 25000000, 25000000, @user_id, @user_id, NOW(), NOW(), NOW() FROM keu_periode_fiskal p WHERE p.tahun=2026 AND p.bulan=1;
INSERT INTO keu_jurnal_detail (jurnal_id, akun_id, urutan, keterangan, debit, kredit, created_at, updated_at)
SELECT j.id, a.id, x.urutan, x.ket, x.debit, x.kredit, NOW(), NOW() FROM keu_jurnal j JOIN (SELECT '1.1.2' kode, 0 urutan, 'Bank masuk jasa' ket, 25000000 debit, 0 kredit UNION ALL SELECT '4.1.2', 1, 'Pendapatan jasa', 0, 25000000) x JOIN keu_akun a ON a.kode=x.kode WHERE j.source_ref_id='demo:income:jan' AND NOT EXISTS (SELECT 1 FROM keu_jurnal_detail d WHERE d.jurnal_id=j.id);

INSERT IGNORE INTO keu_jurnal (nomor_jurnal, tanggal, keterangan, jenis, status, periode_id, source_modul, source_ref_id, total_debit, total_kredit, dibuat_oleh, diposting_oleh, diposting_pada, created_at, updated_at)
SELECT 'DEMO-202601-0003', '2026-01-15', 'Demo pembayaran gaji dan tunjangan', 'KHUSUS', 'POSTED', p.id, 'demo_seed', 'demo:expense:gaji:jan', 12000000, 12000000, @user_id, @user_id, NOW(), NOW(), NOW() FROM keu_periode_fiskal p WHERE p.tahun=2026 AND p.bulan=1;
INSERT INTO keu_jurnal_detail (jurnal_id, akun_id, urutan, keterangan, debit, kredit, created_at, updated_at)
SELECT j.id, a.id, x.urutan, x.ket, x.debit, x.kredit, NOW(), NOW() FROM keu_jurnal j JOIN (SELECT '5.1.1' kode, 0 urutan, 'Beban gaji' ket, 12000000 debit, 0 kredit UNION ALL SELECT '1.1.2', 1, 'Bank keluar gaji', 0, 12000000) x JOIN keu_akun a ON a.kode=x.kode WHERE j.source_ref_id='demo:expense:gaji:jan' AND NOT EXISTS (SELECT 1 FROM keu_jurnal_detail d WHERE d.jurnal_id=j.id);

INSERT IGNORE INTO keu_jurnal (nomor_jurnal, tanggal, keterangan, jenis, status, periode_id, source_modul, source_ref_id, total_debit, total_kredit, dibuat_oleh, diposting_oleh, diposting_pada, created_at, updated_at)
SELECT 'DEMO-202602-0001', '2026-02-10', 'Demo pendapatan sewa kendaraan', 'KHUSUS', 'POSTED', p.id, 'demo_seed', 'demo:income:sewa:feb', 35000000, 35000000, @user_id, @user_id, NOW(), NOW(), NOW() FROM keu_periode_fiskal p WHERE p.tahun=2026 AND p.bulan=2;
INSERT INTO keu_jurnal_detail (jurnal_id, akun_id, urutan, keterangan, debit, kredit, created_at, updated_at)
SELECT j.id, a.id, x.urutan, x.ket, x.debit, x.kredit, NOW(), NOW() FROM keu_jurnal j JOIN (SELECT '1.1.2' kode, 0 urutan, 'Bank masuk sewa' ket, 35000000 debit, 0 kredit UNION ALL SELECT '4.1.1', 1, 'Pendapatan sewa kendaraan', 0, 35000000) x JOIN keu_akun a ON a.kode=x.kode WHERE j.source_ref_id='demo:income:sewa:feb' AND NOT EXISTS (SELECT 1 FROM keu_jurnal_detail d WHERE d.jurnal_id=j.id);

INSERT IGNORE INTO keu_jurnal (nomor_jurnal, tanggal, keterangan, jenis, status, periode_id, source_modul, source_ref_id, total_debit, total_kredit, dibuat_oleh, diposting_oleh, diposting_pada, created_at, updated_at)
SELECT 'DEMO-202602-0002', '2026-02-18', 'Demo beban listrik dan air', 'KHUSUS', 'POSTED', p.id, 'demo_seed', 'demo:expense:listrik:feb', 4000000, 4000000, @user_id, @user_id, NOW(), NOW(), NOW() FROM keu_periode_fiskal p WHERE p.tahun=2026 AND p.bulan=2;
INSERT INTO keu_jurnal_detail (jurnal_id, akun_id, urutan, keterangan, debit, kredit, created_at, updated_at)
SELECT j.id, a.id, x.urutan, x.ket, x.debit, x.kredit, NOW(), NOW() FROM keu_jurnal j JOIN (SELECT '5.2.2' kode, 0 urutan, 'Beban listrik dan air' ket, 4000000 debit, 0 kredit UNION ALL SELECT '1.1.1', 1, 'Kas keluar listrik', 0, 4000000) x JOIN keu_akun a ON a.kode=x.kode WHERE j.source_ref_id='demo:expense:listrik:feb' AND NOT EXISTS (SELECT 1 FROM keu_jurnal_detail d WHERE d.jurnal_id=j.id);

-- Simpanan anggota demo Maret
INSERT IGNORE INTO keu_jurnal (nomor_jurnal, tanggal, keterangan, jenis, status, periode_id, source_modul, source_ref_id, total_debit, total_kredit, dibuat_oleh, diposting_oleh, diposting_pada, created_at, updated_at)
SELECT 'DEMO-202603-0001', '2026-03-05', 'Demo setoran simpanan anggota', 'KHUSUS', 'POSTED', p.id, 'demo_seed', 'demo:simpanan:mar', 9000000, 9000000, @user_id, @user_id, NOW(), NOW(), NOW() FROM keu_periode_fiskal p WHERE p.tahun=2026 AND p.bulan=3;
INSERT INTO keu_jurnal_detail (jurnal_id, akun_id, urutan, keterangan, debit, kredit, created_at, updated_at)
SELECT j.id, a.id, x.urutan, x.ket, x.debit, x.kredit, NOW(), NOW() FROM keu_jurnal j JOIN (SELECT '1.1.1' kode, 0 urutan, 'Kas masuk simpanan' ket, 9000000 debit, 0 kredit UNION ALL SELECT '3.1', 1, 'Simpanan pokok demo', 0, 3000000 UNION ALL SELECT '3.2', 2, 'Simpanan wajib demo', 0, 6000000) x JOIN keu_akun a ON a.kode=x.kode WHERE j.source_ref_id='demo:simpanan:mar' AND NOT EXISTS (SELECT 1 FROM keu_jurnal_detail d WHERE d.jurnal_id=j.id);

INSERT INTO keu_simpanan (anggota_id, jenis, tipe, tanggal, jumlah, keterangan, jurnal_id, akun_kas_id, dibuat_oleh, created_at, updated_at)
SELECT ag.id, x.jenis, 'SETOR', '2026-03-05', x.jumlah, x.ket, j.id, kas.id, @user_id, NOW(), NOW()
FROM (SELECT 'A-9001' no, 'POKOK' jenis, 1000000 jumlah, 'DEMO-SEED simpanan pokok A-9001' ket UNION ALL SELECT 'A-9001','WAJIB',2000000,'DEMO-SEED simpanan wajib A-9001' UNION ALL SELECT 'A-9002','POKOK',1000000,'DEMO-SEED simpanan pokok A-9002' UNION ALL SELECT 'A-9002','WAJIB',2000000,'DEMO-SEED simpanan wajib A-9002' UNION ALL SELECT 'A-9003','POKOK',1000000,'DEMO-SEED simpanan pokok A-9003' UNION ALL SELECT 'A-9003','WAJIB',2000000,'DEMO-SEED simpanan wajib A-9003') x
JOIN keu_anggota ag ON ag.no_anggota=x.no
JOIN keu_jurnal j ON j.source_ref_id='demo:simpanan:mar'
JOIN keu_akun kas ON kas.kode='1.1.1'
WHERE NOT EXISTS (SELECT 1 FROM keu_simpanan s WHERE s.keterangan=x.ket);

-- Pinjaman anggota demo dan pembayaran
INSERT IGNORE INTO keu_jurnal (nomor_jurnal, tanggal, keterangan, jenis, status, periode_id, source_modul, source_ref_id, total_debit, total_kredit, dibuat_oleh, diposting_oleh, diposting_pada, created_at, updated_at)
SELECT 'DEMO-202604-0001', '2026-04-05', 'Demo pencairan pinjaman anggota', 'KHUSUS', 'POSTED', p.id, 'demo_seed', 'demo:pinjaman:cair', 15000000, 15000000, @user_id, @user_id, NOW(), NOW(), NOW() FROM keu_periode_fiskal p WHERE p.tahun=2026 AND p.bulan=4;
INSERT INTO keu_jurnal_detail (jurnal_id, akun_id, urutan, keterangan, debit, kredit, created_at, updated_at)
SELECT j.id, a.id, x.urutan, x.ket, x.debit, x.kredit, NOW(), NOW() FROM keu_jurnal j JOIN (SELECT '1.1.3' kode, 0 urutan, 'Piutang anggota demo' ket, 15000000 debit, 0 kredit UNION ALL SELECT '1.1.1', 1, 'Kas keluar pinjaman demo', 0, 15000000) x JOIN keu_akun a ON a.kode=x.kode WHERE j.source_ref_id='demo:pinjaman:cair' AND NOT EXISTS (SELECT 1 FROM keu_jurnal_detail d WHERE d.jurnal_id=j.id);

INSERT IGNORE INTO keu_pinjaman (anggota_id, nomor_pinjaman, tanggal, pokok, jasa, tenor_bulan, angsuran_pokok, angsuran_jasa, status, keterangan, akun_kas_id, jurnal_cair_id, dibuat_oleh, created_at, updated_at)
SELECT ag.id, 'PJM-DEMO-202604-0001', '2026-04-05', 15000000, 1500000, 5, 3000000, 300000, 'AKTIF', 'DEMO-SEED pinjaman anggota', kas.id, j.id, @user_id, NOW(), NOW()
FROM keu_anggota ag JOIN keu_akun kas ON kas.kode='1.1.1' JOIN keu_jurnal j ON j.source_ref_id='demo:pinjaman:cair'
WHERE ag.no_anggota='A-9001';

INSERT IGNORE INTO keu_jurnal (nomor_jurnal, tanggal, keterangan, jenis, status, periode_id, source_modul, source_ref_id, total_debit, total_kredit, dibuat_oleh, diposting_oleh, diposting_pada, created_at, updated_at)
SELECT 'DEMO-202605-0001', '2026-05-05', 'Demo pembayaran pinjaman anggota', 'KHUSUS', 'POSTED', p.id, 'demo_seed', 'demo:pinjaman:bayar:1', 3300000, 3300000, @user_id, @user_id, NOW(), NOW(), NOW() FROM keu_periode_fiskal p WHERE p.tahun=2026 AND p.bulan=5;
INSERT INTO keu_jurnal_detail (jurnal_id, akun_id, urutan, keterangan, debit, kredit, created_at, updated_at)
SELECT j.id, a.id, x.urutan, x.ket, x.debit, x.kredit, NOW(), NOW() FROM keu_jurnal j JOIN (SELECT '1.1.1' kode, 0 urutan, 'Kas masuk angsuran pinjaman' ket, 3300000 debit, 0 kredit UNION ALL SELECT '1.1.3', 1, 'Angsuran pokok pinjaman', 0, 3000000 UNION ALL SELECT '4.2.2', 2, 'Pendapatan jasa pinjaman', 0, 300000) x JOIN keu_akun a ON a.kode=x.kode WHERE j.source_ref_id='demo:pinjaman:bayar:1' AND NOT EXISTS (SELECT 1 FROM keu_jurnal_detail d WHERE d.jurnal_id=j.id);

INSERT INTO keu_pinjaman_pembayaran (pinjaman_id, tanggal, pokok, jasa, keterangan, jurnal_id, dibuat_oleh, created_at, updated_at)
SELECT pj.id, '2026-05-05', 3000000, 300000, 'DEMO-SEED pembayaran pinjaman 1', j.id, @user_id, NOW(), NOW()
FROM keu_pinjaman pj JOIN keu_jurnal j ON j.source_ref_id='demo:pinjaman:bayar:1'
WHERE pj.nomor_pinjaman='PJM-DEMO-202604-0001'
  AND NOT EXISTS (SELECT 1 FROM keu_pinjaman_pembayaran b WHERE b.keterangan='DEMO-SEED pembayaran pinjaman 1');

-- Penyusutan Juni
INSERT IGNORE INTO keu_jurnal (nomor_jurnal, tanggal, keterangan, jenis, status, periode_id, source_modul, source_ref_id, total_debit, total_kredit, dibuat_oleh, diposting_oleh, diposting_pada, created_at, updated_at)
SELECT 'DEMO-202606-0001', '2026-06-20', 'Demo penyusutan aset tetap', 'PENYESUAIAN', 'POSTED', p.id, 'demo_seed', 'demo:depreciation:jun', 5000000, 5000000, @user_id, @user_id, NOW(), NOW(), NOW() FROM keu_periode_fiskal p WHERE p.tahun=2026 AND p.bulan=6;
INSERT INTO keu_jurnal_detail (jurnal_id, akun_id, urutan, keterangan, debit, kredit, created_at, updated_at)
SELECT j.id, a.id, x.urutan, x.ket, x.debit, x.kredit, NOW(), NOW() FROM keu_jurnal j JOIN (SELECT '5.3.1' kode, 0 urutan, 'Beban penyusutan' ket, 5000000 debit, 0 kredit UNION ALL SELECT '1.2.2', 1, 'Akumulasi penyusutan', 0, 5000000) x JOIN keu_akun a ON a.kode=x.kode WHERE j.source_ref_id='demo:depreciation:jun' AND NOT EXISTS (SELECT 1 FROM keu_jurnal_detail d WHERE d.jurnal_id=j.id);

-- Demo run SHU per anggota agar halaman SHU anggota langsung terlihat.
INSERT IGNORE INTO keu_shu_run (tahun, total_shu, tanggal, status, catatan, dibuat_oleh, created_at, updated_at)
VALUES (2026, 44300000, '2026-12-31', 'POSTED', 'Demo seed SHU', @user_id, NOW(), NOW());

INSERT INTO keu_shu_alokasi (run_id, nama_pos, persen, jumlah, akun_id, urutan, created_at, updated_at)
SELECT run.id, x.nama_pos, x.persen, x.jumlah, a.id, x.urutan, NOW(), NOW()
FROM keu_shu_run run
JOIN (SELECT 'Dana Cadangan' nama_pos, '3.3' kode, 25 persen, 11075000 jumlah, 0 urutan UNION ALL SELECT 'SHU Bagian Anggota','2.3.1',40,17720000,1 UNION ALL SELECT 'Dana Pendidikan','2.3.3',10,4430000,2 UNION ALL SELECT 'Dana Sosial','2.3.5',5,2215000,3 UNION ALL SELECT 'Dana Pengurus & Pengawas','2.3.2',20,8860000,4) x
JOIN keu_akun a ON a.kode=x.kode
WHERE run.tahun=2026
  AND NOT EXISTS (SELECT 1 FROM keu_shu_alokasi al WHERE al.run_id=run.id);

-- Alokasi SHU anggota demo berdasarkan saldo simpanan demo.
INSERT INTO keu_shu_anggota (run_id, anggota_id, basis_simpanan, porsi, jumlah, status, created_at, updated_at)
SELECT run.id, ag.id, x.basis, x.porsi, x.jumlah, 'DIALOKASIKAN', NOW(), NOW()
FROM keu_shu_run run
JOIN (SELECT 'A-9001' no, 3000000 basis, 33.3333 porsi, 5906667 jumlah UNION ALL SELECT 'A-9002',3000000,33.3333,5906667 UNION ALL SELECT 'A-9003',3000000,33.3334,5906666) x
JOIN keu_anggota ag ON ag.no_anggota=x.no
WHERE run.tahun=2026
  AND NOT EXISTS (SELECT 1 FROM keu_shu_anggota sa WHERE sa.run_id=run.id);

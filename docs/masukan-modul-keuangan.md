# Masukan Modul Keuangan

Dokumen ini mencatat hasil peninjauan modul keuangan aplikasi inventaris/koperasi agar bisa dijadikan referensi pengembangan berikutnya.

## Ringkasan Modul Saat Ini

Modul keuangan sudah memiliki cakupan yang cukup lengkap:

- Dashboard keuangan.
- Bagan akun / chart of accounts.
- Periode fiskal.
- Jurnal umum dengan status DRAFT dan POSTED.
- Saldo awal / neraca pembukaan.
- Anggota koperasi.
- Simpanan anggota.
- Tutup buku.
- Distribusi SHU.
- Laporan neraca saldo, buku besar, neraca, SHU, arus kas, dan perubahan ekuitas.
- Integrasi jurnal dari modul payroll dan simpanan.

Referensi kode utama:

- `src/app/dashboard/keuangan/*`
- `src/actions/keuangan-*.ts`
- `src/app/api/keuangan/summary/route.ts`
- `src/lib/keuangan/*`
- `prisma/schema.prisma`

## Kekuatan Saat Ini

- Sudah memakai konsep akuntansi double-entry.
- Jurnal divalidasi balance sebelum disimpan atau diposting.
- Jurnal POSTED tidak bisa diedit langsung, ini baik untuk integritas histori.
- Periode fiskal memiliki status BUKA, TUTUP, dan KUNCI.
- Transaksi simpanan otomatis membuat jurnal.
- Payroll sudah terhubung ke jurnal keuangan.
- Laporan utama sudah berbasis jurnal POSTED.
- Sebagian besar aksi penting sudah menulis audit log.
- Skema database sudah menyiapkan tabel anggaran/RAPB (`keu_anggaran`).

## Rekomendasi UI/UX

1. Tingkatkan dashboard keuangan.

   Tambahkan grafik tren kas, pendapatan, beban, SHU, saldo simpanan, serta notifikasi seperti jurnal draft, periode belum ditutup, saldo tidak balance, dan transaksi bulan berjalan.

2. Perbaiki form jurnal.

   Tambahkan fitur auto-copy keterangan header ke baris jurnal, tombol buat baris penyeimbang, shortcut tambah baris debit/kredit, dan indikator selisih debit-kredit yang lebih jelas.

3. Tambahkan template jurnal.

   Sediakan template untuk transaksi rutin seperti biaya operasional, transfer kas-bank, pembayaran gaji, setoran anggota, dan penyusutan aset.

4. Perbaiki output PDF.

   Saat ini export PDF memakai `window.print()`. Sebaiknya dibuat layout cetak resmi dengan header koperasi, periode, tanggal cetak, nomor halaman, dan area tanda tangan.

5. Tambahkan filter laporan yang fleksibel.

   Selain periode fiskal bulanan, tambahkan filter rentang tanggal custom, tahunan, kuartal, dan perbandingan antar periode.

6. Perkuat tampilan laporan di mobile.

   Tambahkan sticky header, sticky kolom kode/nama akun, dan density mode agar tabel laporan lebih mudah dibaca di layar kecil.

7. Buat checklist proses akuntansi bulanan.

   Tampilkan alur kerja seperti buat periode, saldo awal, input transaksi, review draft, posting, laporan, tutup buku, dan distribusi SHU.

## Rekomendasi Perbaikan Sistem

1. Amankan penomoran jurnal dari race condition.

   Nomor jurnal dibuat dengan mencari nomor terakhir lalu menambah 1. Jika dua user menyimpan bersamaan, nomor bisa bentrok. Buat tabel sequence per prefix/bulan atau retry otomatis saat unique constraint gagal.

2. Hindari hard-coded akun penting.

   Akun seperti `1.1.1`, `3.1`, `3.2`, `2.1.6`, dan `3.5` masih hard-coded di beberapa action. Buat halaman atau tabel konfigurasi akun default agar chart of accounts bisa berubah tanpa edit kode.

3. Pisahkan jurnal manual dan jurnal sistem.

   Jurnal otomatis dari simpanan, payroll, saldo awal, tutup buku, dan SHU sebaiknya tidak bisa diubah/hapus dari halaman jurnal umum. Koreksi sebaiknya lewat reversal journal.

4. Tambahkan reversal journal.

   Karena jurnal POSTED tidak boleh diedit, perlu fitur jurnal pembalik/koreksi agar kesalahan posting dapat diperbaiki secara akuntansi.

5. Batasi saldo awal.

   Saat ini sistem hanya memberi peringatan bila saldo awal sudah pernah dibuat, tetapi masih memungkinkan dibuat lagi. Sebaiknya batasi satu saldo awal per tahun/periode atau wajib memakai proses koreksi.

6. Perkuat validasi tutup periode.

   Sebelum periode ditutup atau dikunci, sistem sebaiknya memastikan tidak ada jurnal DRAFT, neraca saldo balance, dan tidak ada transaksi pending dari modul lain.

7. Konsolidasikan mekanisme tutup buku.

   Ada flow penutup periode yang membuat draft dan flow tutup buku tahunan yang langsung POSTED. Standarkan menjadi satu alur resmi: preview, generate draft, review, posting, lalu lock period.

8. Tambahkan constraint database.

   Tambahkan constraint untuk nominal debit/kredit tidak negatif, satu baris tidak boleh debit dan kredit sekaligus, dan unique `source_modul + source_ref_id` untuk mencegah jurnal otomatis dobel.

9. Optimalkan laporan untuk data besar.

   API summary masih banyak mengambil detail jurnal lalu agregasi di aplikasi. Untuk data besar, gunakan agregasi SQL/groupBy, pagination buku besar, dan index gabungan yang sesuai.

10. Standarkan pengolahan nilai uang.

    Input saat ini berbasis integer rupiah. Jika nanti perlu desimal/sen, pastikan kalkulasi tetap memakai Decimal dari database sampai layer laporan.

## Rekomendasi Fitur Tambahan

1. Modul Anggaran/RAPB.

   Tabel `keu_anggaran` sudah ada, tetapi belum ada UI. Buat input anggaran per akun per tahun/bulan dan laporan realisasi vs anggaran.

2. Rekonsiliasi kas/bank.

   Tambahkan pencocokan saldo sistem dengan kas fisik atau rekening bank, termasuk upload mutasi bank CSV dan status matched/unmatched.

3. Approval workflow jurnal.

   Buat alur maker-checker: staf membuat jurnal, supervisor/ketua mereview, lalu jurnal diposting.

4. Lampiran bukti transaksi.

   Tambahkan upload bukti untuk jurnal, simpanan, pengeluaran, pendapatan, dan transaksi payroll.

5. Buku pembantu anggota.

   Tambahkan mutasi per anggota, kartu anggota, histori simpanan wajib, tunggakan simpanan wajib, dan rekap cetak.

6. Modul pinjaman/piutang anggota.

   Kembangkan fitur pengajuan pinjaman, pencairan, jadwal angsuran, bunga/jasa, pembayaran, dan integrasi payroll.

7. Distribusi SHU per anggota.

   Saat ini distribusi SHU baru ke pos alokasi. Tambahkan perhitungan bagian anggota berdasarkan simpanan, transaksi usaha, masa keanggotaan, atau formula AD/ART.

8. Cashflow forecast.

   Tambahkan proyeksi kas berdasarkan kewajiban, payroll, piutang, simpanan sukarela yang berpotensi ditarik, dan rencana pengeluaran.

9. Audit trail UI.

   Audit log sudah ditulis di action. Buat halaman riwayat aktivitas keuangan untuk melihat siapa membuat, mengubah, posting, dan menutup periode.

10. Export Excel resmi.

    Tambahkan export XLSX multi-sheet untuk ringkasan, detail akun, jurnal sumber, dan area tanda tangan.

## Prioritas Implementasi

1. Keamanan dan integritas data.

   Implementasikan sequence nomor jurnal, proteksi jurnal otomatis, reversal journal, dan validasi tutup periode.

2. Produktivitas user.

   Tambahkan template jurnal, pengaturan akun default, dan dashboard status bulan berjalan.

3. Pelaporan.

   Perbaiki PDF resmi, export Excel, filter tanggal custom, dan laporan RAPB aktual vs anggaran.

4. Fitur koperasi.

   Tambahkan buku pembantu anggota, SHU per anggota, serta pinjaman/piutang anggota.

5. Kontrol internal.

   Tambahkan approval workflow, lampiran bukti, dan halaman audit trail.

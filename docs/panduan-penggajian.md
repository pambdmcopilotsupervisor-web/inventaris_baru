# Panduan Sistem Penggajian (Payroll)

Dokumen ini menjelaskan cara kerja lengkap sistem penggajian — mulai dari setup konfigurasi awal hingga proses hitung gaji bulanan, THR, dan bonus.

---

## Daftar Isi

1. [Konsep Dasar](#1-konsep-dasar)
2. [Setup Awal](#2-setup-awal)
   - 2.1 [Komponen Gaji](#21-komponen-gaji)
   - 2.2 [Komponen per Jabatan](#22-komponen-per-jabatan)
   - 2.3 [Struktur Gaji per Karyawan](#23-struktur-gaji-per-karyawan)
   - 2.4 [Aturan Potongan Absensi](#24-aturan-potongan-absensi)
   - 2.5 [BPJS](#25-bpjs)
   - 2.6 [PTKP](#26-ptkp)
   - 2.7 [PPh21 — Pilih Metode](#27-pph21--pilih-metode)
   - 2.8 [Tarif TER (jika metode TER)](#28-tarif-ter-jika-metode-ter)
   - 2.9 [Profil Pajak Karyawan](#29-profil-pajak-karyawan)
3. [Proses Penggajian Bulanan (REGULER)](#3-proses-penggajian-bulanan-reguler)
4. [Proses THR](#4-proses-thr)
5. [Proses Bonus](#5-proses-bonus)
6. [Alur Persetujuan & Pembayaran](#6-alur-persetujuan--pembayaran)
7. [Slip Gaji & Ekspor](#7-slip-gaji--ekspor)
8. [Detail Perhitungan Gaji](#8-detail-perhitungan-gaji)
   - 8.1 [Komponen Pendapatan (EARNING)](#81-komponen-pendapatan-earning)
   - 8.2 [Komponen Potongan (DEDUCTION)](#82-komponen-potongan-deduction)
   - 8.3 [Potongan Absensi](#83-potongan-absensi)
   - 8.4 [BPJS — Kalkulasi](#84-bpjs--kalkulasi)
   - 8.5 [PPh21 Progresif](#85-pph21-progresif)
   - 8.6 [PPh21 TER (PP 58/2023)](#86-pph21-ter-pp-582023)
9. [Prorata (Karyawan Baru)](#9-prorata-karyawan-baru)
10. [Snapshot & Immutability](#10-snapshot--immutability)
11. [Rekalkukasi & Audit](#11-rekalkulasi--audit)

---

## 1. Konsep Dasar

| Prinsip | Penjelasan |
|---|---|
| **Dinamis / Configurable** | Semua komponen gaji didefinisikan di database — tidak ada nilai yang hardcode di kode |
| **Snapshot** | Setiap payroll run disimpan sebagai snapshot permanen — nilai gaji tidak berubah meski konfigurasi berubah setelah run |
| **Metode berlaku efektif** | Komponen (baik per jabatan maupun per karyawan) menggunakan `effective_date` & `end_date` — nilai historis terjaga |
| **Hierarki override** | Nilai per karyawan **menang** atas nilai per jabatan |

---

## 2. Setup Awal

### 2.1 Komponen Gaji

**Menu:** Penggajian → Komponen Gaji

Komponen gaji adalah blok pembangun slip gaji. Setiap komponen memiliki:

| Field | Keterangan |
|---|---|
| **Kode** | Kode unik, misal `GAPOK`, `TJ_MAKAN`, `BPJS_TK_EE` |
| **Nama** | Label tampilan |
| **Tipe** | `EARNING` (pendapatan) atau `DEDUCTION` (potongan) |
| **Metode Kalkulasi** | Lihat tabel di bawah |
| **Urutan Hitung** | Menentukan urutan di slip dan dependency antar komponen |
| **Kena Pajak** | Apakah masuk penghitungan PPh21 |
| **Prorata** | Apakah diperhitungkan prorata untuk karyawan baru |
| **Basis THR** | Apakah masuk basis kalkulasi THR |
| **Statutory** | Khusus BPJS/pajak — dihitung engine, tidak bisa di-assign manual |

**Metode Kalkulasi:**

| Metode | Cara Kerja |
|---|---|
| `FIXED` | Nilai nominal tetap (Rp) |
| `PERCENT` | Persentase dari komponen acuan (misal: 5% × GAPOK) |
| `FORMULA` | Ekspresi mathjs, misal `GAPOK * 0.1 + TJ_MAKAN` |

> **Tips:** Komponen BPJS dan PPh21 adalah `is_statutory = true` — dikelola otomatis, tidak perlu di-assign ke jabatan/karyawan.

---

### 2.2 Komponen per Jabatan

**Menu:** Penggajian → Komponen per Jabatan

Set nilai default komponen untuk semua karyawan berdasarkan jabatan. Contoh: semua jabatan "Staf" mendapat TJ_MAKAN = Rp 600.000.

- **Berlaku Sejak** (`effective_date`): tanggal komponen mulai berlaku
- **Sampai** (`end_date`, opsional): tanggal berakhir; kosong = berlaku tak terbatas
- Jika jabatan berubah nilai, buat record baru dengan tanggal berlaku baru — record lama otomatis ditutup

**Status record:**
- **Aktif** (hijau): berlaku saat ini
- **Mendatang** (kuning): belum berlaku, bisa dihapus
- **Berakhir** (abu): riwayat, tidak bisa diubah

---

### 2.3 Struktur Gaji per Karyawan

**Menu:** Karyawan → (buka karyawan) → ikon Wallet

Override nilai komponen tertentu untuk karyawan spesifik. Nilai ini **menang** atas nilai per jabatan.

Contoh: Jabatan Staf secara default GAPOK = Rp 5.000.000, tapi Budi GAPOK = Rp 5.500.000 → set di halaman ini.

---

### 2.4 Aturan Potongan Absensi

**Menu:** Penggajian → Aturan Potongan

Konfigurasi rumus potongan otomatis berdasarkan data absensi. Trigger yang tersedia:

| Trigger | Keterangan |
|---|---|
| `ALPHA` | Tidak masuk tanpa keterangan |
| `LATE` | Terlambat (menggunakan tier) |
| `EARLY_LEAVE` | Pulang lebih awal |
| `SICK_NO_CERT` | Sakit tanpa surat dokter |

**Metode potongan:**
- `FIXED`: potongan nominal tetap per kejadian
- `PER_COMPONENT_DAILY`: proporsi dari komponen tertentu ÷ hari kerja × jumlah kejadian
- `TIER_LATE`: potongan bertingkat berdasarkan durasi keterlambatan (dalam menit)

Gunakan field **Hari Kerja** untuk menentukan pembagi (misal 22 hari/bulan).

---

### 2.5 BPJS

**Menu:** Penggajian → Pajak & BPJS → tab "BPJS"

| Jenis | Ditanggung | Field |
|---|---|---|
| BPJS Kesehatan Karyawan | Karyawan | `jkn_employee_pct` |
| BPJS Kesehatan Perusahaan | Perusahaan | `jkn_employer_pct` |
| BPJS Ketenagakerjaan JHT Karyawan | Karyawan | `jht_employee_pct` |
| BPJS Ketenagakerjaan JHT Perusahaan | Perusahaan | `jht_employer_pct` |
| BPJS JP Karyawan | Karyawan | `jp_employee_pct` |
| BPJS JP Perusahaan | Perusahaan | `jp_employer_pct` |
| BPJS JKK | Perusahaan | `jkk_pct` |
| BPJS JKM | Perusahaan | `jkm_pct` |

Semua basis perhitungan menggunakan **gaji bruto** (EARNING sebelum potongan), dengan batas maksimum sesuai peraturan.

---

### 2.6 PTKP

**Menu:** Penggajian → Pajak & BPJS → tab "PTKP"

Isikan nilai PTKP per status:

| Kode | Keterangan | Contoh Nilai |
|---|---|---|
| TK/0 | Tidak kawin, 0 tanggungan | Rp 54.000.000 |
| TK/1 | Tidak kawin, 1 tanggungan | Rp 58.500.000 |
| K/0 | Kawin, 0 tanggungan | Rp 58.500.000 |
| K/1 | Kawin, 1 tanggungan | Rp 63.000.000 |
| ... | | |

---

### 2.7 PPh21 — Pilih Metode

**Menu:** Penggajian → Pajak & BPJS → tab "Konfigurasi"

Pilih metode pemotongan PPh21:

| Metode | Keterangan |
|---|---|
| **Progresif** | Metode klasik: anualisasi gaji → hitung pajak tahunan → bagi 12 |
| **TER (PP 58/2023)** | Tarif Efektif Rata-rata: tarik tarif dari tabel TER sesuai bruto & kategori |

---

### 2.8 Tarif TER (jika metode TER)

**Menu:** Penggajian → Pajak & BPJS → tab "Tarif TER"

Tabel tarif sudah di-seed sesuai PP 58/2023 dengan 3 kategori:

| Kategori | Berlaku untuk |
|---|---|
| **A** | PTKP TK/0 |
| **B** | PTKP TK/1, TK/2, TK/3, K/0 |
| **C** | PTKP K/1, K/2, K/3 |

Tarif dapat diedit per baris jika ada perubahan regulasi.

---

### 2.9 Profil Pajak Karyawan

**Menu:** Karyawan → (buka karyawan) → bagian Profil Pajak

Set per karyawan:
- **Status PTKP** (misal: K/1)
- **Punya NPWP** — jika tidak, PPh dinaikan 20% (ketentuan pasal 21)

---

## 3. Proses Penggajian Bulanan (REGULER)

### Langkah 1 — Buat Periode

**Menu:** Penggajian → Payroll Run → tombol "Buat Periode"

Isi:
- Bulan & tahun
- Tipe run: **REGULER**
- (opsional) Label, tanggal bayar

### Langkah 2 — Hitung Gaji

Klik tombol **"Hitung Gaji"** pada periode. Sistem akan:

1. Mengambil semua karyawan aktif
2. Untuk setiap karyawan, menjalankan `calculateEmployeePayroll()`
3. Menyimpan slip gaji beserta snapshot

### Langkah 3 — Review

Cek rekap di halaman detail periode:
- Total pendapatan, potongan, dan gaji bersih per karyawan
- Klik nama karyawan → buka slip detail

### Langkah 4 — Approve

Klik **"Approve"** → status periode menjadi `APPROVED`.

### Langkah 5 — Bayar

Klik **"Tandai Dibayar"** → isi tanggal bayar dan nama pembayar → status menjadi `PAID`.

> Setelah PAID, slip tidak bisa diubah.

### Langkah 6 — Tutup

Klik **"Tutup Periode"** → status menjadi `CLOSED`. Periode terkunci permanen.

---

## 4. Proses THR

THR menggunakan rumus: **THR = Gaji Basis THR × (masa kerja / 12)**

Untuk karyawan dengan masa kerja ≥ 12 bulan: THR = 1 bulan penuh.

### Langkah:

1. Buat Periode → Tipe Run: **THR**
2. Sistem menghitung `resolveThrBasis()` — mengambil komponen yang `is_thr_basis = true`
3. PPh21 THR dihitung dengan **metode selisih tahunan** (perbedaan pajak gaji + THR vs gaji saja)
4. Lanjutkan alur Approve → Bayar → Tutup seperti REGULER

---

## 5. Proses Bonus

Serupa THR, tetapi tipe run: **BONUS**.

- Input `bonus_multiplier` (misal: 2 = 2 bulan gaji)
- Basis: komponen yang `is_thr_basis = true`
- PPh21 dihitung dengan metode selisih tahunan

---

## 6. Alur Persetujuan & Pembayaran

```
DRAFT → CALCULATED → APPROVED → PAID → CLOSED
```

| Status | Arti | Aksi tersedia |
|---|---|---|
| DRAFT | Periode baru dibuat | Hitung Gaji |
| CALCULATED | Gaji sudah dihitung | Approve, Rekalkukasi per karyawan |
| APPROVED | Disetujui | Tandai Dibayar, Ekspor Bank Transfer |
| PAID | Sudah dibayarkan | Tutup Periode |
| CLOSED | Terkunci permanen | Lihat, Ekspor laporan |

---

## 7. Slip Gaji & Ekspor

### Slip per Karyawan

**Menu:** Payroll Run → detail periode → klik nama karyawan → Cetak Slip

Tampilan slip mencakup:
- Rincian pendapatan
- Potongan (BPJS, absensi, dll.)
- PPh21 (dengan keterangan metode & detail)
- Rekap absensi bulan tersebut
- Gaji bersih + terbilang

### Ekspor Excel (Rekap Periode)

Tombol **"Ekspor Excel"** di halaman detail periode — berisi semua karyawan dalam satu file.

### Ekspor CSV Bank Transfer

Tombol **"Bank Transfer"** — berisi format transfer massal ke bank (nomor rekening + jumlah bersih).

---

## 8. Detail Perhitungan Gaji

### 8.1 Komponen Pendapatan (EARNING)

Urutan hitung berdasarkan `calc_order`:

**FIXED:** nilai diambil langsung dari konfigurasi (per jabatan atau per karyawan, dengan override karyawan menang).

**PERCENT:**
```
Nilai = basis_value × (rate / 100)
```
`basis_value` adalah nilai komponen acuan yang sudah dihitung sebelumnya (pastikan `calc_order` komponen acuan lebih kecil).

**FORMULA:**  
Ekspresi dievaluasi menggunakan `mathjs`. Variabel yang tersedia adalah kode komponen yang sudah dihitung (misal: `GAPOK`, `TJ_MAKAN`). Fungsi `import`, `createUnit`, dan `evaluate` dinonaktifkan untuk keamanan.

**Prorata** (karyawan baru di tengah bulan):  
Jika komponen memiliki flag `is_prorata = true`, nilainya dikalikan faktor prorata:
```
prorata_factor = hari_kerja_aktif / total_hari_kerja_bulan
```

### 8.2 Komponen Potongan (DEDUCTION)

Dihitung dengan cara yang sama seperti EARNING, kemudian dikurangkan dari total pendapatan.

### 8.3 Potongan Absensi

Dihitung dari rekap data absensi bulan tersebut menggunakan aturan yang dikonfigurasi di menu Aturan Potongan.

**Contoh: potongan ALPHA dengan metode PER_COMPONENT_DAILY**
```
potongan = nilai_komponen / hari_kerja × jumlah_hari_alpha
```

**Contoh: potongan LATE dengan TIER_LATE**

| Menit Terlambat | Potongan |
|---|---|
| 1–30 menit | Rp 50.000 |
| 31–60 menit | Rp 100.000 |
| > 60 menit | Rp 200.000 |

### 8.4 BPJS — Kalkulasi

Basis = gaji bruto SEBELUM potongan absensi.

```
BPJS JKN Karyawan    = bruto × jkn_employee_pct%
BPJS JKN Perusahaan  = bruto × jkn_employer_pct%
BPJS JHT Karyawan    = bruto × jht_employee_pct%
BPJS JHT Perusahaan  = bruto × jht_employer_pct%
BPJS JP Karyawan     = min(bruto, batas_jp) × jp_employee_pct%
BPJS JP Perusahaan   = min(bruto, batas_jp) × jp_employer_pct%
BPJS JKK             = bruto × jkk_pct%
BPJS JKM             = bruto × jkm_pct%
```

Bagian karyawan (JKN + JHT + JP) dipotong dari gaji. Bagian perusahaan dicatat di slip sebagai informasi.

BPJS yang ditanggung karyawan juga menjadi **pengurang penghasilan neto** dalam penghitungan PPh21.

### 8.5 PPh21 Progresif

```
Bruto setahun       = total_pendapatan_kena_pajak × 12
Biaya jabatan       = min(bruto × 5%, 6.000.000)
BPJS deductible     = total_bpjs_karyawan_setahun
Neto setahun        = bruto - biaya_jabatan - BPJS
PKP                 = neto - PTKP
PPh setahun         = lapisan_progresif(PKP)  -- tarif 5/15/25/30/35%
PPh bulanan         = PPh_setahun / 12
```

Tarif lapisan progresif (UU HPP 2021):
| PKP | Tarif |
|---|---|
| s.d. Rp 60 juta | 5% |
| Rp 60–250 juta | 15% |
| Rp 250–500 juta | 25% |
| Rp 500 juta – Rp 5 miliar | 30% |
| > Rp 5 miliar | 35% |

### 8.6 PPh21 TER (PP 58/2023)

**Bulan Januari s.d. November:**
```
Tarif TER = findTerRate(tabel_TER[kategori_karyawan], bruto_bulanan)
PPh bulan ini = bruto_bulanan × Tarif_TER
```

Tarif TER diambil dari tabel `pph21_ter_rates` sesuai kategori (A/B/C) dan range bruto.

**Bulan Desember — Rekonsiliasi:**
```
Bruto setahun       = akumulasi bruto Jan–Nov + bruto Desember
Biaya jabatan       = min(bruto × 5%, 6.000.000) per tahun
BPJS setahun        = akumulasi BPJS Jan–Nov + BPJS Desember
Neto setahun        = bruto - biaya_jabatan - BPJS
PKP                 = neto - PTKP
PPh setahun         = lapisan_progresif(PKP)
PPh Desember        = PPh_setahun − total_PPh_Jan_Nov
```

Ini memastikan total PPh12bulan = PPh tahunan yang seharusnya.

---

## 9. Prorata (Karyawan Baru)

Jika karyawan baru bergabung di tengah bulan (field `tanggal_masuk_kerja` di data karyawan):

```
hari_kerja_sisa     = hari_kerja_bulan − (hari_kerja_sebelum_tanggal_masuk)
prorata_factor      = hari_kerja_sisa / total_hari_kerja_bulan
```

Komponen dengan `is_prorata = true` dikalikan `prorata_factor`. Komponen lain (misal tunjangan tetap non-prorata) dibayar penuh.

---

## 10. Snapshot & Immutability

Setiap slip yang tersimpan menyertakan **snapshot data** saat run dilakukan:

- `tax_detail` (JSON): rincian PPh21 (metode, bruto, biaya jabatan, PTKP, PKP, PPh)
- `attendance_snapshot` (JSON): rekap absensi (hadir, alfa, telat, sakit, dll.)

Dengan demikian, meski konfigurasi BPJS atau PTKP berubah setelah payroll run, slip gaji yang sudah tersimpan tidak terpengaruh.

---

## 11. Rekalkulasi & Audit

### Rekalkulasi per Karyawan

Di halaman detail periode (status CALCULATED), klik ikon rekalkukasi pada baris karyawan → sistem mengulang hitung untuk 1 karyawan tersebut dengan konfigurasi terkini.

Audit log mencatat nilai **sebelum** dan **sesudah** rekalkulasi.

### Audit Log

Semua perubahan data (create/update/delete) tercatat di tabel `audit_logs`. Dapat dilihat di menu Pengaturan → Audit Log (khusus Admin & HRD).

---

## Referensi

| File | Keterangan |
|---|---|
| `src/lib/payroll/engine.ts` | Engine utama kalkulasi gaji per karyawan |
| `src/lib/payroll/tax-engine.ts` | Kalkulasi BPJS, PPh21 Progresif, PPh21 TER |
| `src/lib/payroll/deduction-engine.ts` | Kalkulasi potongan absensi |
| `src/lib/payroll/effective-components.ts` | Resolve komponen efektif (jabatan vs karyawan) |
| `src/actions/payroll-run.ts` | Server actions: buat periode, hitung batch, approve, bayar, tutup |
| `src/actions/payroll-tax.ts` | CRUD BPJS, PTKP, brackets PPh, Tarif TER |
| `prisma/schema.prisma` | Definisi lengkap semua tabel payroll |
| `database/migrations/add_payroll*.sql` | Migrasi DB bertahap |

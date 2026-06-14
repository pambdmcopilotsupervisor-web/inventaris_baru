# Context Modul Penilaian Kinerja

File ini adalah sumber konteks berkelanjutan untuk pengembangan modul **Penilaian Kinerja**.

Setiap kali ada pengembangan terkait penilaian kinerja, update file ini agar konteks tetap bisa dilanjutkan di sesi berikutnya.

## Tujuan Modul

Membangun sistem penilaian kinerja pegawai yang terintegrasi dengan data karyawan, absensi, struktur atasan, dan approval berjenjang.

Struktur organisasi yang digunakan:

- Staf
- Kepala Divisi
- Manager

## Keputusan Desain

- Data pegawai menggunakan tabel existing `karyawans`.
- Data absensi menggunakan tabel existing `absensi`.
- Penilaian dilakukan per periode melalui tabel `periode_penilaian`.
- Komponen penilaian dibuat configurable per periode melalui tabel `periode_komponen_penilaian`.
- Header hasil penilaian per pegawai disimpan di `penilaian_kinerja`.
- Target kerja pegawai disimpan di `target_kerja`.
- Detail perilaku kerja disimpan di `penilaian_perilaku`.
- Riwayat perubahan status disimpan di `approval_log`.
- Service aplikasi menggunakan TypeScript/Node.js dengan Prisma.
- Untuk tabel penilaian kinerja yang belum masuk `schema.prisma`, service memakai raw SQL Prisma (`$queryRaw` / `$executeRaw`).

## Komponen Penilaian Default

| Kode | Nama | Bobot Default |
|---|---|---:|
| `KEHADIRAN` | Kehadiran | 20% |
| `CAPAIAN_SASARAN` | Capaian Sasaran Kerja | 40% |
| `PERILAKU_KERJA` | Perilaku Kerja | 30% |
| `PENGEMBANGAN_KOMPETENSI` | Pengembangan Kompetensi | 10% |

## Status Implementasi Saat Ini

### Dokumentasi Schema

File:

- `docs/schema-penilaian-kinerja.md`

Isi:

- ERD teks/mermaid.
- SQL migration versi PostgreSQL.
- Penjelasan relasi antar tabel.
- Index yang disarankan.

### Migration MariaDB

File:

- `database/migrations/add_penilaian_kinerja.sql`
- `database/migrations/alter_penilaian_capaian_max_120.sql`
- `database/migrations/alter_target_kerja_split_catatan.sql`

Isi tabel:

- `periode_penilaian`
- `komponen_penilaian`
- `periode_komponen_penilaian`
- `target_kerja`
- `penilaian_kinerja`
- `penilaian_perilaku`
- `approval_log`

Catatan:

- Migration memakai `BIGINT UNSIGNED` agar kompatibel dengan `karyawans.id`.
- Foreign key mengarah ke `karyawans(id)`.
- Komponen default di-seed dengan `INSERT ... ON DUPLICATE KEY UPDATE`.
- `nilai_capaian_sasaran` boleh sampai 120 agar konsisten dengan kalkulasi overachievement target. `nilai_akhir` tetap dibatasi maksimum 100.
- Jika database sudah pernah menjalankan migration awal saat constraint masih maksimum 100, jalankan `alter_penilaian_capaian_max_120.sql`.
- `target_kerja.catatan` dipertahankan untuk catatan target awal/approval target.
- `target_kerja.catatan_pegawai` menyimpan kendala/keterangan realisasi dari form penilaian mandiri.
- `target_kerja.catatan_atasan` menyimpan catatan verifikasi capaian dari form penilaian atasan.

Cara menjalankan migration:

```bash
cd ~/inventaris_baru
mysql -h HOST -P 3306 -u USER -p NAMA_DATABASE < database/migrations/add_penilaian_kinerja.sql
mysql -h HOST -P 3306 -u USER -p NAMA_DATABASE < database/migrations/alter_penilaian_capaian_max_120.sql
mysql -h HOST -P 3306 -u USER -p NAMA_DATABASE < database/migrations/alter_target_kerja_split_catatan.sql
```

### Service Perhitungan Kehadiran

File:

- `src/lib/penilaian-kehadiran.ts`

Fungsi yang tersedia:

- `hitungNilaiKehadiran(p_id_pegawai, p_id_periode, options?)`
- `hitungNilaiKehadiranSemuaPegawaiAktif(p_id_periode, options?)`
- `bukaPeriodePenilaianDanHitungKehadiranAwal(p_id_periode)`

Formula nilai kehadiran:

```text
persentase_hadir = (hadir + izin + sakit + cuti_sah) / total_hari_kerja * 100
pengurangan_alpha = jumlah_alpha * 2
pengurangan_terlambat = floor(jumlah_terlambat / 5)
nilai_kehadiran = clamp(persentase_hadir - pengurangan_alpha - pengurangan_terlambat, 0, 100)
```

Catatan implementasi:

- Izin, sakit, dan cuti sah tidak mengurangi nilai.
- Alpha mengurangi 2 poin per kejadian.
- Setiap 5 keterlambatan mengurangi 1 poin.
- Keterlambatan dihitung jika `jam_masuk > 08:15`.
- Pegawai baru dihitung mulai dari `tanggal_masuk_kerja`.
- Periode berjalan hanya dihitung sampai hari ini (`asOfDate`) agar hari masa depan tidak dianggap alpha.
- Jika pegawai punya jadwal shift, hari kerja diambil dari `jadwal_shifts`.
- Jika tidak ada jadwal shift, fallback hari kerja adalah semua hari kecuali Minggu dan hari libur.
- Jika total hari kerja 0, nilai default 100.

### Service Target Kerja

File:

- `src/lib/penilaian-target.ts`

Fungsi utama:

- `normalizeTargetInputs(items)`
- `validateTargetInputs(items)`
- `getPeriodePenilaian(idPeriode)`
- `getTargetKerja(idPegawai, idPeriode)`
- `getBawahanIds(karyawanId, recursive)`
- `canAccessPegawaiTarget(user, idPegawai)`
- `canApprovePegawaiTarget(user, idPegawai, final)`
- `createPenilaianDraftForEmployees(idPeriode, employeeIds)`
- `saveTargetKerja(idPegawai, idPeriode, items)`
- `approveTargetKerja(idTarget, approverId, catatan)`
- `getMonitoringTarget(idPeriode, atasanId)`

Catatan implementasi:

- Scope bawahan memakai relasi existing `karyawans.atasan_id`.
- `getBawahanIds(..., true)` mengambil bawahan secara recursive, cocok untuk Manager.
- `getBawahanIds(..., false)` mengambil bawahan langsung, cocok untuk Kepala Divisi jika nanti perlu dibedakan.
- Saat periode dibuat, sistem membuat draft `penilaian_kinerja` untuk pegawai target supaya form target periode tersedia.
- Karena `target_kerja.uraian_tugas` wajib diisi, sistem tidak membuat row target kosong. Form kosong ditangani di UI.

### API Target Kerja Awal Periode

File endpoint:

- `src/app/api/periode/route.ts`
- `src/app/api/target/route.ts`
- `src/app/api/target/[id_pegawai]/[id_periode]/route.ts`
- `src/app/api/target/[id]/setujui/route.ts`

Endpoint:

- `GET /api/periode` untuk daftar periode penilaian.
- `POST /api/periode` untuk membuat periode baru dan membuat draft form penilaian pegawai dalam scope manager/admin.
- `GET /api/target/:id_pegawai/:id_periode` untuk mengambil target pegawai pada periode tertentu.
- `GET /api/target?id_periode=...` untuk monitoring target pegawai dalam scope atasan.
- `POST /api/target` untuk menyimpan usulan target pegawai.
- `PUT /api/target/:id/setujui` untuk menyetujui target. Default `apply_all = true`, sehingga semua target pegawai pada periode yang sama ikut disetujui.

Validasi target:

- Minimal 3 tugas, maksimal 5 tugas.
- `uraian_tugas` wajib diisi.
- `satuan` hanya boleh `dokumen`, `kegiatan`, `laporan`, `persentase`, `lainnya`.
- `target_nilai` harus lebih dari 0.
- `bobot_dalam_capaian` harus lebih dari 0.
- Total bobot semua tugas pegawai dalam satu periode harus tepat 100%.

### Workflow Approval Penilaian (State Machine)

File:

- `src/lib/penilaian-workflow.ts` — service state machine
- `src/app/api/penilaian/[id]/transisi/route.ts` — POST transisi + GET aksi tersedia
- `src/app/api/penilaian/bulk-transisi/route.ts` — POST transisi massal, validasi ID/status, dan hasil per item
- `src/app/api/penilaian/menunggu-saya/route.ts` — GET daftar yang perlu tindakan

State machine:

```
draft → diajukan → diverifikasi → disetujui → final
                ↘ draft (kembalikan)   ↘ diajukan (kembalikan ke Kepala Divisi)
```

Transisi yang diizinkan:

| Dari | Ke | Peran |
|---|---|---|
| draft | diajukan | pegawai, admin, hrd |
| diajukan | diverifikasi | kepala_divisi, admin, hrd |
| diajukan | draft | kepala_divisi, admin, hrd (butuh catatan) |
| diverifikasi | disetujui | manager, admin, hrd |
| diverifikasi | diajukan | manager, admin, hrd (butuh catatan) |
| disetujui | final | admin, hrd |

Fungsi utama:

- `canTransition(dari, ke, roleEfektif)` — cek izin transisi
- `doTransition({ idPenilaian, ke, karyawanId, role, catatan })` — eksekusi transisi + log + notifikasi
- `getNextActions(idPenilaian, karyawanId, role)` — daftar aksi tersedia untuk user
- `getMenungguSaya(karyawanId, role, idPeriode?)` — daftar penilaian yang perlu tindakan

Guard khusus:

- `doTransition` memvalidasi runtime `idPenilaian`, `karyawanId`, dan status tujuan sebelum query DB.
- Transisi `draft → diajukan` wajib memiliki target dengan realisasi lengkap, 5 aspek perilaku mandiri, nilai komponen mandiri, dan JSON pengembangan pegawai.
- Transisi `diajukan → diverifikasi` wajib memiliki `id_penilai_atasan`, `catatan_atasan`, dan 5 aspek `penilaian_perilaku` sumber `atasan`.
- Transisi `diverifikasi → disetujui` wajib memiliki `id_penilai_atasan`, `tanggal_diverifikasi`, dan `nilai_akhir`.
- Transisi `disetujui → final` wajib memiliki `tanggal_disetujui` dan `nilai_akhir`.

Validasi bulk transisi:

- `ids` harus array integer positif, dedupe otomatis, maksimum 100 ID.
- `ke` divalidasi dengan `isStatusPenilaian`.
- Query row bulk menggunakan parameterized `Prisma.join`, bukan string dari body.
- ID tidak ditemukan dan ID di luar scope dikembalikan sebagai hasil gagal per item.
- Eksekusi tetap memanggil `doTransition`, sehingga semua guard workflow tetap berlaku.

Notifikasi otomatis per transisi:

- `draft → diajukan`: notif ke atasan langsung pegawai
- `diajukan → diverifikasi`: notif ke manager (atasan dari penilai)
- `dikembalikan (→ draft)`: notif ke pegawai dengan alasan
- `diverifikasi → diajukan (kembalikan)`: notif ke kepala divisi
- `diverifikasi → disetujui`: notif ke pegawai
- `disetujui → final`: notif ke pegawai

### Form Penilaian Atasan

File:

- `src/lib/penilaian-atasan.ts` — service layer (kalkulasi + DB)
- `src/app/api/penilaian-atasan/route.ts` — GET daftar bawahan
- `src/app/api/penilaian/[id]/nilai-atasan/route.ts` — GET detail + PUT simpan
- `src/app/dashboard/sdm/penilaian-kinerja/atasan/page.tsx` — halaman UI

Fitur:

- Tampilan daftar: semua bawahan dalam scope + statistik (menunggu, sudah dinilai)
- Form per pegawai:
  - Bagian 1: Identitas (read-only)
  - Bagian 2: Nilai kehadiran (read-only, dari absensi)
  - Bagian 3: Verifikasi capaian — atasan bisa melihat kendala pegawai, override realisasi, dan mengisi catatan verifikasi terpisah
  - Bagian 4: Penilaian perilaku atasan (5 aspek, skala 1-5) + modal perbandingan mandiri vs atasan
  - Bagian 5: Nilai pengembangan (slider 0-100) + catatan atasan (wajib saat submit)
- Tombol Simpan Draft menyimpan nilai atasan tanpa mengisi `id_penilai_atasan`.
- Tombol Selesaikan Penilaian mengisi `id_penilai_atasan` dan membuat data siap diverifikasi, tetapi status tetap `diajukan`.
- Perubahan status `diajukan → diverifikasi` hanya dilakukan melalui workflow approval (`/api/penilaian/[id]/transisi`).

Kalkulasi nilai akhir:

- `nilai_kehadiran` × 20%
- `nilai_capaian_sasaran` × 40% (realisasi tertimbang per target, maks 120%)
- `nilai_perilaku` × 30% = (mandiri × 30% + atasan × 70%) / 5 × 100
- `nilai_pengembangan` × 10% (dari input atasan)
- `nilai_akhir` = jumlah di atas, clamp 0-100

Validasi akses:

- Admin dan HRD: bisa akses semua pegawai
- Atasan: hanya bisa akses bawahan rekursif (via `getBawahanIds`)

Link menu di navbar: modul `Kinerja` → section `Kinerja Pegawai`

### Form Penilaian Mandiri (Self-Assessment)

File:

- `src/lib/penilaian-mandiri.ts` — service layer
- `src/app/api/penilaian-mandiri/route.ts` — GET (baca data) + POST (simpan draft/submit)
- `src/app/dashboard/sdm/penilaian-kinerja/mandiri/page.tsx` — halaman form

Fitur UI (5 bagian):

- Bagian 1: Identitas pegawai (read-only dari data karyawan)
- Bagian 2: Rekap kehadiran (read-only, dihitung otomatis dari absensi)
- Bagian 3: Capaian sasaran kerja (input realisasi per target, keterangan wajib jika capaian < 80%)
- Bagian 4: Penilaian perilaku kerja mandiri (5 aspek, skala 1-5)
- Bagian 5: Pengembangan kompetensi (pelatihan multiple, rencana pengembangan, pencapaian terbaik, saran pimpinan)

Ketentuan:

- Simpan Draft: status tetap `draft`, bisa simpan berkali-kali
- Kirim ke Atasan: status berubah ke `diajukan`, form tidak bisa diedit lagi
- Notifikasi dikirim ke atasan saat submit via `prisma.notifications`
- Audit log ditulis ke `audit_logs` via `writeAuditLog`
- Progress bar kelengkapan pengisian (6 check poin)
- Countdown batas waktu (badge merah jika < 3 hari)
- Link menu di navbar: modul `Kinerja` → section `Kinerja Pegawai`

Penyimpanan data:

- `target_kerja.realisasi_nilai` diupdate per target
- `target_kerja.catatan_pegawai` menyimpan kendala/keterangan realisasi pegawai, tidak menimpa catatan target awal
- `penilaian_perilaku` (INSERT ON DUPLICATE KEY UPDATE, sumber=`mandiri`)
- `penilaian_kinerja.catatan_pegawai` menyimpan JSON pengembangan (pelatihan, rencana, pencapaian, saran)
- `approval_log` dibuat saat submit

Nilai yang dihitung:

- `nilai_capaian_sasaran`: weighted average capaian target (maks 120%)
- `nilai_perilaku`: rata-rata skor aspek / 5 × 100
- `nilai_pengembangan`: pelatihan 40 + rencana 30 + pencapaian 30

### UI Target Kerja Awal Periode

File:

- `src/app/dashboard/sdm/penilaian-kinerja/target/page.tsx`

Fitur UI:

- Pilih periode penilaian.
- Buat periode baru.
- Form target kerja 3-5 baris.
- Field: uraian tugas, satuan pengukuran, target nilai, bobot, catatan.
- Validasi total bobot harus 100%.
- Tombol `Simpan Usulan`.
- Tombol `Setujui Target` untuk atasan/admin.
- Monitoring pegawai dalam scope atasan.
- Statistik pegawai `Belum Mengisi`, `Diajukan`, dan `Disetujui`.

Integrasi menu:

- `src/components/layout/navbar.tsx`
- `src/app/select-module/page.tsx`
- Modul baru `Kinerja` ditambahkan di halaman pilih modul, berdampingan dengan `Aset` dan `SDM`.
- Semua menu terkait penilaian kinerja dipisahkan ke modul `Kinerja`, tidak lagi tampil di modul `SDM`.
- Navbar modul `Kinerja` hanya menampilkan group `Penilaian`.
- Nilai `localStorage.pedami_modul` sekarang mendukung `aset`, `sdm`, dan `kinerja`.
- Link: `/dashboard/sdm/penilaian-kinerja/target`.

## Dependensi Data Existing

Tabel existing yang dipakai:

- `karyawans`
- `absensi`
- `jadwal_shifts`
- `hari_liburs`

Status absensi yang diperhitungkan:

- Hadir/sah: `hadir`, `terlambat`, `pulang_cepat`, `tidak_absen_pulang`, `di_luar_jam_absen`
- Sah tidak mengurangi nilai: `izin`, `sakit`, `cuti`
- Mengurangi nilai: `alpha`
- Dilewati: `libur`

## Validasi Terakhir

Per terakhir kali file ini diupdate:

```bash
npx tsc --noEmit
```

Berhasil tanpa error.

```bash
npx eslint "src/app/api/penilaian/bulk-transisi/route.ts" "src/lib/penilaian-workflow.ts"
```

Berhasil tanpa error.

## Logika Hierarki Bawahan (getBawahanByJabatanDivisi)

Dipakai di semua fitur penilaian kinerja (target, mandiri, atasan, workflow, inbox).

Algoritma (priority):
1. **Manager/Manajer/Direktur** → semua `Kepala Divisi/Bagian` aktif + semua Staf dari setiap Kepala Divisi (multi-level)
2. **Kepala Divisi/Bagian** → Staf/Koordinator/dll di: (a) subdivisi yang sama, (b) divisi yang sama, (c) atasan_id langsung
3. **Fallback** → `atasan_id` rekursif (untuk jabatan non-standar)

Implementasi tersebar di:
- `src/lib/penilaian-atasan.ts` → `getBawahanPenilaianIds()` (exported, untuk penilaian)
- `src/lib/penilaian-target.ts` → `getBawahanByJabatanDivisi()` (internal, untuk target kerja)
- `src/lib/penilaian-workflow.ts` → menggunakan `getBawahanPenilaianIds` + multi-level traversal

## Hal Yang Belum Dikerjakan

- Membuat halaman rekap/laporan cetak nilai akhir per periode.
- Membuat API endpoint untuk CRUD komponen/bobot per periode.
- Menambahkan model Prisma untuk tabel penilaian kinerja ke `prisma/schema.prisma`.

## Aturan Pengembangan Berikutnya

Jika melakukan perubahan terkait modul penilaian kinerja, update bagian yang relevan di file ini:

- Tambahkan file baru yang dibuat.
- Catat perubahan schema atau migration.
- Catat perubahan formula nilai.
- Catat endpoint/API baru.
- Catat UI/menu baru.
- Catat hasil verifikasi terakhir.
- Catat keputusan desain baru.

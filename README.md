# Manufaktur OS

Sistem operasi internal PT Talahome / Tala Living — pengganti `john-lau`,
Google Sheets dan Google Chat.

**Fase 1 selesai**: seluruh alur kerja sebagai frontend di atas data demo yang
hidup di browser. **Fase 2 berjalan**: backend Supabase, dan belum tersambung ke
layar mana pun.

```bash
npm install
npm run dev              # http://localhost:3000
```

## Keadaan sekarang

| | Status |
|---|---|
| Rute aplikasi | **62**, tidak ada placeholder yang tersisa |
| Sebelas layanan (procurement, accounting, HR, produksi, inventory, marketing, delivery, dokumen, identitas, aset, asisten) | Jadi, di atas **data demo** |
| Migrasi Supabase | 22 berkas — `ops_core` 13 tabel, `ops_procure` 22, `ops_acct` 11; `ops_hr` / `ops_inv` / `ops_prod` dibuat kosong |
| Klien Supabase (`src/lib/api/`) | identity, procurement, accounting — **belum di-import layar mana pun**, dan masih kurang 43 fungsi (`npm run check:api`) |
| Autentikasi | **Belum ada.** `/signin` adalah pemilih akun demo tanpa kata sandi, dan hanya dirender dalam mode demo |
| Deployment | Belum pernah |

Mode ditentukan satu tempat: `REAL` di `src/demo/api/index.ts`. Selama ia
`false`, badge *Demo · data is not real*, tombol Reset dan pemilih akun tampil;
ketiganya hilang sendiri kalau ia `true`. Lihat `docs/plan/deploy/README.md`
sebelum men-deploy apa pun.

## Pemeriksaan

Semuanya juga berjalan di CI (`.github/workflows/checks.yml`). Jalankan dan
**laporkan apa katanya**, bukan bahwa Anda menjalankannya.

```bash
npm run lint
npx tsc --noEmit
npm run check:fixtures   # kunci ganda & rujukan menggantung di seed — tanpa server
npm run check:api        # jarak antara src/demo/api dan src/lib/api
npm run build

# butuh aplikasi berjalan (PROBE_URL, default http://localhost:3100)
npm run check:refusals   # 28 probe penolakan di /demo        ~15 detik
npm run check:routes     # 62 rute + menu 8 akun               ~10 menit
npm run check:layout     # 62 rute x 390/768/1440              ~10 menit
```

Tiga di antaranya memakai daftar yang **dideklarasikan** — `KNOWN_GAP`,
`INTENTIONAL_REDIRECTS`, `KNOWN_OVERFLOW`, `UNRESOLVED` — berisi keadaan yang
sudah diketahui beserta alasannya. Yang **baru** tetap menggagalkan. Daftar itu
menyusut adalah ukuran kemajuan yang jujur; jangan menambahnya tanpa menulis
sebabnya.

## Dokumen

`docs/plan/` adalah catatan hidup dan diperbarui **dalam commit yang sama**
dengan pekerjaannya: `README.md` (papan milestone), `findings.md` (apa yang
layar ajarkan — deliverable Fase 1 sebesar aplikasinya sendiri),
`06-decisions.md`, `backlog.md`, dan `deploy/README.md`.

## Cara kerjanya

**Menu adalah data.** `src/lib/nav.ts` mendefinisikan seluruh navigasi sebagai
array. Sidebar menyaringnya dengan `can(item.permission)` — item yang tidak
diizinkan **tidak dirender sama sekali**, bukan disembunyikan CSS, dan seksi
yang jadi kosong ikut hilang. Menambah halaman = menambah satu baris di
`nav.ts`, bukan menyunting komponen navigasi.

**Izin didefinisikan di kode**, bukan sebagai data yang diketik manusia
(`src/lib/roles.ts`). Konsekuensinya database baru bisa di-bootstrap ulang dari
nol tanpa ada yang menebak peran apa saja yang seharusnya ada, dan penambahan
modul terlihat sebagai perubahan yang bisa di-review.

> `can()` di frontend hanya menyembunyikan menu. Penegakan yang sebenarnya
> harus ada di backend — siapa pun bisa memanggil API tanpa lewat halaman ini.

**Detail dibuka di panel kanan (Drawer), bukan halaman baru.** Navigasi antar
halaman hanya untuk berpindah modul. Ini yang membuatnya terasa seperti
perangkat lunak desktop: konteks tabel di belakang tetap terlihat, dan menutup
panel mengembalikan pengguna persis ke tempatnya semula. Lihat Dashboard —
klik salah satu baris order.

**Motion hanya dua keyframe**: `fade-in` dan `slide-in`. Sisanya
`transition-colors`. Aplikasi yang dipakai delapan jam sehari tidak boleh
membuat penggunanya menunggu animasi.

## Catatan uji

Grafik recharts **tampak kosong pada screenshot headless Chrome** — animasi
masuknya tidak pernah maju di bawah virtual time, jadi bentuknya tertangkap
pada keadaan awal (nol). Di browser sungguhan normal. Kalau perlu memverifikasi
grafik lewat screenshot otomatis, matikan animasinya sementara
(`isAnimationActive={false}`), jangan menyimpulkan grafiknya rusak.

## Yang perlu dibangun berikutnya

Ada di `docs/plan/backlog.md` — S2 (menutup jarak 43 fungsi di seam),
S3 (sign-in dan menu pengguna untuk mode live), S4 (dua belas pergerakan rak
tanpa tanda terima), S5 (tiga rute yang meluap di 390px), dan W3 (QR di PDF
vendor, butuh rute publik).

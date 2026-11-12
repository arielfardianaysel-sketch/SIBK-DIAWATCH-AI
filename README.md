# DiaWatch AI
Aplikasi skrining risiko diabetes (HTML, CSS, JavaScript). Untuk edukasi, bukan diagnosis medis.

## Menjalankan

Pertahankan cara menjalankan Qwen, frontend, dan backend yang sudah bekerja.
Semua dependensi Python sekarang ada di satu `backend/requirements.txt`.
Contoh di bawah memakai environment WSL; bila backend sudah berjalan di Windows,
gunakan interpreter backend tersebut. `.venv-linux` adalah opsi WSL, bukan syarat
untuk mengganti environment Windows yang sudah bekerja.

Dari root repository, bila memakai WSL:

```bash
backend/.venv-linux/bin/python -m uvicorn main:app --app-dir backend --host 127.0.0.1 --port 8000
```

Di terminal kedua:

```bash
backend/.venv-linux/bin/python -m http.server 5500 --bind 127.0.0.1 --directory frontend
```

Buka http://localhost:5500. Jalankan llama.cpp dengan model dan adapter yang
sudah dikonfigurasi pada port 8080 untuk menggunakan prediksi.

Di editor WSL, pilih `backend/.venv-linux/bin/python` melalui **Python: Select
Interpreter**. Interpreter Windows berada di `backend/.venv/Scripts/python.exe`;
jangan memakai executable Windows dari terminal Linux.

Jika perlu memasang dependensi pada environment WSL yang sudah dibuat:

```bash
backend/.venv-linux/bin/python -m pip install -r backend/requirements.txt
```

## Rekomendasi personal AI

`backend/ai.py` menangani Qwen, retrieval berdasarkan topik, dan validasi hasil.
Klasifikasi tetap menggunakan prompt 17 fitur dan adapter DiaWatch. Untuk saran,
seluruh 20 jawaban dan BMI dikirim ke Qwen Instruct bersama kutipan referensi CDC.
Adapter klasifikasi dinonaktifkan melalui `lora: []` hanya pada permintaan saran;
adapter global server tidak diubah. Server llama.cpp perlu mendukung parameter
LoRA per permintaan serta `response_format` JSON.

`backend/health_knowledge.json` berisi referensi publik, URL, dan waktu pengambilan.
File ini diperlukan untuk retrieval; bukan file konfigurasi rahasia. Perbarui dengan:

```bash
backend/.venv-linux/bin/python backend/build_health_kb.py
```

Tidak ada jawaban kuesioner yang dikirim ke CDC. Saran dibuat oleh Qwen, bukan
fungsi aturan. URL sumber dipilih backend dari referensi yang diambil. Riwayat
merokok seumur hidup tidak dianggap sebagai bukti masih merokok saat ini.

Jika saran gagal, klasifikasi tetap tersimpan. Laporan menyediakan tombol untuk
membuat ulang saran, termasuk untuk laporan lama. Saran lama tetap bisa dibaca.
Saran generatif perlu ditinjau; referensi tidak menjamin semua keluaran model benar.

Rujukan implementasi: [llama.cpp server](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md),
[CDC merokok](https://www.cdc.gov/diabetes/risk-factors/diabetes-and-smoking.html),
[CDC pencegahan](https://www.cdc.gov/diabetes/prevention-type-2/index.html).

## Hasil skrining dan evaluasi

Dashboard, riwayat, dan laporan menampilkan **Terindikasi diabetes** atau
**Tidak terindikasi diabetes** berdasarkan label Qwen + adapter DiaWatch.
Hasil bukan diagnosis; label positif dataset mencakup prediabetes/diabetes.
Tidak ada persentase atau level risiko yang dihitung.

Evaluasi klasifikasi biasa tetap tersedia untuk kebutuhan akademik:

```bash
backend/.venv-linux/bin/python backend/evaluate_model.py
```

Evaluasi ini menghasilkan Accuracy, Precision, Recall, F1, CSV prediksi dan
confusion matrix. Evaluasi dijalankan terpisah dan tidak diperlukan saat website berjalan.

## Pengujian

```bash
backend/.venv-linux/bin/python -m unittest discover -s backend/tests -v
```

Tes memakai data sintetis dan mock UCI/Qwen/Supabase, menonaktifkan pembacaan `.env`,
dan tidak membuktikan performa model sebenarnya atau akses database produksi.

## Integrasi yang digunakan

Frontend menggunakan Supabase Auth dan FastAPI melalui
`frontend/js/diawatch-supabase.js`; `frontend/js/api.js` menyediakan normalisasi
dan antarmuka kompatibilitas. Pada jalur ini, `USE_MOCK` dan `API_URL` dalam
konfigurasi lama tidak mengalihkan permintaan jaringan.

Endpoint backend: `GET /health`, `POST /api/predict`, `GET /api/history`,
`GET /api/history/{id}`, dan `POST /api/history/{id}/recommendations`.
Health melaporkan kesiapan knowledge base, bukan bukti model aktif.
Penghapusan riwayat menggunakan Supabase dan bergantung
pada RLS. Konfigurasi rahasia tetap dikelola secara lokal; jangan memasukkannya
ke dokumentasi atau commit.

## Profil akun

Klik nama pengguna di navigasi untuk membuka `profile.html`.
Nama dan tanggal lahir diperbarui melalui metadata Supabase Auth lalu otomatis
tersinkron ke `public.profiles` (`id`, `display_name`, `birth_date`, `created_at`)
melalui trigger database, dalam transaksi yang sama. Halaman profil membaca tabel ini.
Usia skrining berikutnya mengikuti tanggal lahir baru; riwayat lama tidak ditulis ulang.

SQL sinkronisasi tersedia di `backend/sql/sync_profiles.sql` dan diterapkan sekali
pada proyek Supabase. Kolom `birth_date` ditambahkan pada tabel yang sudah ada;
akun lama disinkronkan dari metadata. Tanggal tidak valid disimpan sebagai NULL
agar tidak memblokir registrasi lama. RLS membatasi pembacaan ke pemilik akun;
frontend tetap menyimpan perubahan melalui Auth, bukan menulis tabel secara langsung.
Email dan password tidak disalin ke `profiles`.

Email dan password diperbarui melalui Supabase Auth untuk akun yang sedang login.
Email aktif tidak diganti secara lokal sebelum Supabase mengonfirmasi perubahan.
Jika konfirmasi email diaktifkan, selesaikan tautan yang dikirim sesuai pengaturan
proyek. Daftarkan `http://localhost:5500/profile.html` dan
`http://127.0.0.1:5500/profile.html` di Authentication → URL Configuration → Redirect URLs
agar tautan konfirmasi dapat kembali ke halaman profil.
Password saat ini diverifikasi sebelum pembaruan; form password dikosongkan setelah
permintaan selesai. Password tidak disimpan di localStorage atau tabel profil.

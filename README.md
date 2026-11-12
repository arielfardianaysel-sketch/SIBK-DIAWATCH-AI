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

## Skor persentase dan level

Label `0/1` tidak otomatis menjadi `0%/100%` atau level risiko. Backend hanya
menampilkan persentase setelah ada artefak kalibrasi yang cocok dengan versi model
dan prompt. Tanpa artefak, laporan menampilkan indikasi klasifikasi serta keterangan
bahwa skor/level belum tersedia. Angka pengganti dashboard telah dihapus.

Mode evaluasi lama tetap tersedia:

```bash
backend/.venv-linux/bin/python backend/evaluate_model.py
```

Mode kalibrasi membutuhkan ekspor **split asli dari notebook pelatihan**: CSV train,
calibration, dan test dengan `row_id` asal, 17 fitur di `questionnaire.FEATURES`,
serta `Diabetes_binary` atau `target`. Jangan membuat ulang row_id per split.
Ketiga split wajib terpisah; calibration dan test masing-masing minimal 30 baris
per kelas. Jumlah ini batas teknis awal, bukan jaminan validitas penelitian.

Jalankan `evaluate_model.py --help` untuk parameter `--calibrate`, `--train-csv`,
`--calibration-csv`, `--test-csv`, `--model-revision`, `--low-threshold`,
`--high-threshold`, dan `--threshold-rationale`. Ambang harus ditetapkan dengan
alasan penelitian sebelum melihat test; tidak ada ambang klinis bawaan.
`--model-revision` harus mengidentifikasi base GGUF, adapter, serta konfigurasi
server yang dipakai; gunakan digest/revisi yang sama saat melayani prediksi.

Skor mentah adalah selisih logprob token `1` dan `0` pada posisi pertama. Jika
salah satu token tidak tersedia, proses berhenti. Kalibrasi sigmoid dipasang pada
split calibration dan dinilai pada test melalui Brier, log loss, ROC AUC, precision,
recall, F1, dan reliability bins. Artefak `backend/calibration.json` hanya ditulis
jika Brier test tidak memburuk dan ROC AUC di atas 0.5; kriteria ini bukan validasi
klinis. Jangan memasang kalibrasi dari data tes atau membuat artefak secara manual.

Untuk mengaktifkan artefak yang sudah ditinjau, set variabel proses
`DIAWATCH_MODEL_REVISION` sama dengan revisi saat kalibrasi sebelum menjalankan
backend. Tidak perlu mengedit `.env`. Backend memverifikasi fingerprint dan
checksum artefak. Identitas model server tetap harus sesuai dengan revisi yang
dideklarasikan; pergantian model/adapter membutuhkan kalibrasi ulang.

Level rendah/sedang/tinggi adalah **band skor model**, bukan kepastian atau peluang
diabetes masa depan. Skor, ambang, dan ID kalibrasi disimpan sebagai entri bertag
`kind: model_score` di JSON `screenings.recommendations` yang sudah ada; tidak ada
migrasi database. Frontend memisahkan entri metadata tersebut dari kartu saran.
Laporan lama tidak diberi skor atau level baru secara retroaktif.

Rujukan: [kalibrasi scikit-learn](https://scikit-learn.org/stable/modules/calibration.html).

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
Health melaporkan kesiapan knowledge base dan kalibrasi, bukan bukti model aktif.
Penghapusan riwayat menggunakan Supabase dan bergantung
pada RLS. Konfigurasi rahasia tetap dikelola secara lokal; jangan memasukkannya
ke dokumentasi atau commit.

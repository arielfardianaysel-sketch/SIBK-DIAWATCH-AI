# Environment Python DiaWatch

Gunakan terminal **Ubuntu/WSL** untuk perintah di dokumen ini. Jalankan dari root
repository kecuali dinyatakan lain. Environment Windows `backend/.venv` tetap
tersedia; jangan memakai executable di `Scripts/` dari Linux.

## Membuat environment Linux

```bash
python3 -m venv backend/.venv-linux
backend/.venv-linux/bin/python -m pip install -r backend/requirements.txt
```

Jika muncul `ensurepip is not available`, paket `python3-venv` yang sesuai dengan
versi interpreter perlu dipasang oleh administrator Ubuntu. Alternatif tanpa
mengubah paket sistem adalah memakai zipapp pip resmi PyPA:

```bash
python3 -m venv --without-pip backend/.venv-linux
curl --fail --location https://bootstrap.pypa.io/pip/pip.pyz --output /tmp/diawatch-pip.pyz
python3 /tmp/diawatch-pip.pyz --python backend/.venv-linux/bin/python install pip -r backend/requirements.txt
```

Gunakan URL PyPA di atas; jangan mengeksekusi unduhan dari sumber lain. Semua
paket dipasang ke `.venv-linux`, bukan Python sistem. Folder ini diabaikan Git.

Untuk evaluasi dan pengumpulan referensi:

```bash
backend/.venv-linux/bin/python -m pip install --only-binary=:all: -r backend/requirements-evaluation.txt
backend/.venv-linux/bin/python backend/check_environment.py --evaluation
backend/.venv-linux/bin/python -m pip check
```

`--only-binary=:all:` meminta wheel yang kompatibel; bila tidak tersedia,
instalasi berhenti dengan pesan error alih-alih mencoba kompilasi lokal.
Instalasi Linux ini tidak mengubah kebijakan Windows Application Control.

Snapshot dependensi yang diuji tersedia di `requirements-linux.lock.txt`.
Untuk mereproduksinya pada Linux/Python 3.14:

```bash
backend/.venv-linux/bin/python -m pip install --only-binary=:all: -r backend/requirements-linux.lock.txt
```

## Memilih interpreter editor

Buka repository melalui VS Code di WSL (indikator kiri bawah menunjukkan WSL).
Pilih **Python: Select Interpreter**, kemudian
`backend/.venv-linux/bin/python`. Tidak perlu mengubah pengaturan global atau
environment Windows. Perintah eksplisit di dokumen ini tetap bekerja tanpa
aktivasi shell.

Konfigurasi editor tidak lagi memaksa executable Windows. Jika sebelumnya
interpreter Windows sudah dipilih, jalankan **Python: Select Interpreter** dan
pilih ulang path Linux di atas, kemudian **Python: Restart Language Server**.
Mengubah `python.defaultInterpreterPath` saja tidak mengganti pilihan interpreter
yang sudah tersimpan. Di Pylance, konfigurasi `venv`/`venvPath` Pyright juga tidak
memilih interpreter; Pylance memakai pilihan interpreter VS Code.

Rujukan: [pengaturan environment VS Code](https://code.visualstudio.com/docs/python/environments)
dan [konfigurasi Pyright](https://github.com/microsoft/pyright/blob/main/docs/configuration.md).

## Pengujian tanpa layanan eksternal

```bash
cd backend
.venv-linux/bin/python -m unittest discover -s tests -v
```

Pengujian menonaktifkan pemuatan `.env`, mengosongkan environment konfigurasi
saat mengimpor backend, dan mengganti Qwen serta Supabase dengan mock.
Pengujian memeriksa validasi, kontrak fitur, label model, autentikasi,
pembatasan riwayat berdasarkan pemilik, penyimpanan, dan penanganan kegagalan.
Tidak ada data yang ditulis ke Supabase asli.

Perintah yang setara dari root repository:

```bash
backend/.venv-linux/bin/python -m unittest discover -s backend/tests -v
```

VS Code Test Explorer sudah dikonfigurasi untuk `unittest` dan pola `test_*.py`
di `backend/tests`. `test_evaluation.py` menambahkan pengujian dengan data sintetis
dan HTTP mock untuk keluaran label, fallback, CSV, serta grafik. Tes tersebut
tidak menghitung performa Qwen yang sebenarnya.

## Evaluasi model lokal

Setelah llama.cpp beserta model dan adapter aktif pada port 8080:

```bash
backend/.venv-linux/bin/python backend/evaluate_model.py
```

Skrip ini mengunduh dataset UCI dan mengirim sampel ke Qwen. CSV disimpan di
folder `backend`; grafik hanya dibuat jika ada prediksi valid. Label selain
teks `0`/`1` dicatat sebagai invalid dan tidak diubah menjadi label negatif.

Fallback NumPy pada `evaluation_fallback.py` tetap tersedia bila import sklearn
gagal. Fallback itu **bukan** reproduksi pembagian data scikit-learn/Colab.
Untuk laporan final, gunakan environment sklearn yang berfungsi dan cocokkan
ID/baris pengujian dengan manifest pelatihan. Skrip ini belum melakukan kalibrasi
dan tidak menghasilkan persentase risiko.

## Menjalankan aplikasi

Backend memuat konfigurasi yang sudah ada melalui mekanisme sebelumnya.
Jangan menyalin isi `.env` ke log atau Git.

```bash
cd backend
.venv-linux/bin/python -m uvicorn main:app --host 127.0.0.1 --port 8000
```

Terminal kedua, dari root repository:

```bash
backend/.venv-linux/bin/python -m http.server 5500 --bind 127.0.0.1 --directory frontend
```

Qwen/llama.cpp tetap dijalankan melalui konfigurasi model dan adapter yang
sudah berhasil digunakan, di port 8080. Jika backend dan Qwen dijalankan pada
lingkungan Windows/WSL yang berbeda, periksa keterjangkauan alamat dari
terminal tempat backend dijalankan.

`check_environment.py` hanya memeriksa interpreter dan import paket. Keberhasilan
perintah itu tidak membuktikan koneksi database, autentikasi, atau kesiapan Qwen.
Skrip `evaluate_model.py` dan `build_health_kb.py` saat ini melakukan pekerjaan
jaringan saat dijalankan; keduanya bukan bagian dari pemeriksaan environment.

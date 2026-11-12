-- DOKUMENTASI HAK AKSES DAN ROW LEVEL SECURITY (RLS)
-- Dibaca setelah 01_tables.sql. File ini tidak dijalankan otomatis.
-- GRANT menentukan jenis operasi; RLS menentukan baris yang boleh diakses.

alter table public.profiles enable row level security;
alter table public.screenings enable row level security;

-- Pengunjung tanpa login tidak mendapat akses ke kedua tabel.
revoke all on public.profiles from public, anon, authenticated;
revoke all on public.screenings from public, anon, authenticated;

-- Browser: baca profil sendiri, baca/hapus riwayat sendiri.
grant select on public.profiles to authenticated;
grant select, delete on public.screenings to authenticated;

-- Role server digunakan backend; kredensialnya tidak boleh dimasukkan ke frontend.
-- Ini mendokumentasikan hak role database, bukan menyimpan nilai API key.
grant all on public.profiles to service_role;
grant all on public.screenings to service_role;

create policy profile_select_own on public.profiles
  for select to authenticated
  using (id = (select auth.uid()));

-- Policy ini masih ada pada database yang diperiksa.
-- Role authenticated TIDAK diberi GRANT UPDATE, sehingga policy ini sendiri
-- tidak mengizinkan penulisan dari browser. Perubahan profil melalui Auth + trigger.
create policy profile_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy screenings_select_own on public.screenings
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy screenings_delete_own on public.screenings
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- Tidak ada policy INSERT/UPDATE screenings untuk browser.
-- FastAPI memvalidasi JWT dengan Supabase Auth, mengambil ID pemilik dari JWT,
-- lalu menyimpan hasil prediksi/rekomendasi menggunakan role server.
-- Role server melewati RLS: filter user_id pada backend tetap diperlukan.

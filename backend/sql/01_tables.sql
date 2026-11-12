create table public.profiles (
  id uuid not null,
  display_name text,
  created_at timestamptz not null default now(),
  constraint profiles_pkey primary key (id),
  constraint profiles_id_fkey foreign key (id)
    references auth.users(id) on delete cascade,
  constraint profiles_display_name_check check (char_length(display_name) <= 100)
);

-- Satu akun dapat memiliki banyak hasil skrining.
-- JSONB menyimpan jawaban dan rekomendasi tanpa membuat kolom untuk setiap pertanyaan.
create table public.screenings (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  questionnaire_answers jsonb not null,
  questionnaire_version text not null default 'v1',
  bmi numeric,
  predicted_label smallint not null,
  -- Kolom lama masih ada di database, tetapi TIDAK digunakan fitur saat ini.
  -- Aplikasi hanya menampilkan label 0/1, tanpa persentase maupun level.
  experimental_score_percent numeric,
  recommendations jsonb not null default '[]'::jsonb,
  model_name text not null,
  created_at timestamptz not null default now(),
  constraint screenings_pkey primary key (id),
  constraint screenings_user_id_fkey foreign key (user_id)
    references auth.users(id) on delete cascade,
  constraint screenings_questionnaire_answers_check
    check (jsonb_typeof(questionnaire_answers) = 'object'),
  constraint screenings_bmi_check check (bmi > 0 and bmi < 150),
  constraint screenings_predicted_label_check check (predicted_label in (0, 1)),
  constraint screenings_experimental_score_percent_check
    check (experimental_score_percent >= 0 and experimental_score_percent <= 100),
  constraint screenings_recommendations_check
    check (jsonb_typeof(recommendations) = 'array')
);

-- Mempercepat pencarian riwayat satu pengguna, dari pemeriksaan terbaru.
create index screenings_user_created_idx
  on public.screenings (user_id, created_at desc);

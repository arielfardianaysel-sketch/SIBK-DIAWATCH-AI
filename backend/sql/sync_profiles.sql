-- TAHAP 4: SINKRONISASI PROFIL (sudah diterapkan sebelumnya pada proyek DiaWatch).
-- Dokumentasi penambahan profil; bukan skrip yang dijalankan otomatis.
-- Pada setup kosong, baca/jalankan 01, 02, dan 03 terlebih dahulu.
-- Jangan diterapkan ulang pada proyek aktif: trigger bernama sama sudah ada.
-- File-file dokumentasi SQL tambahan tidak menerapkan ulang perubahan ini.

alter table public.profiles add column if not exists birth_date date;

create or replace function public.handle_diawatch_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  birth_text text := new.raw_user_meta_data ->> 'birth_date';
  parsed_birth date := null;
begin
  if birth_text ~ '^\d{4}-\d{2}-\d{2}$'
     and pg_catalog.pg_input_is_valid(birth_text, 'date') then
    parsed_birth := birth_text::date;
    if parsed_birth > current_date then
      parsed_birth := null;
    end if;
  end if;
  insert into public.profiles (id, display_name, birth_date)
  values (new.id, left(coalesce(new.raw_user_meta_data ->> 'display_name', ''), 100), parsed_birth)
  on conflict (id) do update
    set display_name = excluded.display_name, birth_date = excluded.birth_date;
  return new;
end;
$$;

-- Trigger functions must not be exposed as a callable public API.
revoke all on function public.handle_diawatch_new_user() from public, anon, authenticated;

-- Keep the existing registration trigger; add a metadata-update trigger.
create trigger on_diawatch_auth_profile_updated
  after update of raw_user_meta_data on auth.users
  for each row
  when (old.raw_user_meta_data is distinct from new.raw_user_meta_data)
  execute function public.handle_diawatch_new_user();

-- Bring existing accounts into sync; invalid or absent dates remain NULL.
insert into public.profiles (id, display_name, birth_date)
select id, left(coalesce(raw_user_meta_data ->> 'display_name', ''), 100),
  case when raw_user_meta_data ->> 'birth_date' ~ '^\d{4}-\d{2}-\d{2}$'
        and pg_catalog.pg_input_is_valid(raw_user_meta_data ->> 'birth_date', 'date')
    then case when (raw_user_meta_data ->> 'birth_date')::date <= current_date
              then (raw_user_meta_data ->> 'birth_date')::date end
  end
from auth.users
on conflict (id) do update
  set display_name = excluded.display_name, birth_date = excluded.birth_date;

alter table public.profiles enable row level security;


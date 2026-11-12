
create or replace function public.handle_diawatch_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    left(coalesce(new.raw_user_meta_data ->> 'display_name', ''), 100)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- SECURITY DEFINER dibutuhkan agar proses Auth dapat membuat profil lewat
-- trigger, tanpa memberi browser hak INSERT ke profiles. Search path dikunci,
-- nama tabel menggunakan schema lengkap, dan fungsi tidak dibuka sebagai RPC.
revoke all on function public.handle_diawatch_new_user()
  from public, anon, authenticated;

create trigger on_diawatch_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_diawatch_new_user();

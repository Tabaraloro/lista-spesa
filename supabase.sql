-- Lista della spesa: la tabella dove l'app salva tutto.
-- Da incollare in Supabase > SQL Editor > New query, e premere Run. Si lancia una volta sola.
--
-- Una riga per documento: wishlist (un documento per mazzo), aggiunte (carte aggiunte a mano),
-- cercate, carrello, trovate (un documento per carta). Ogni utente vede e scrive solo le sue righe.

create table if not exists public.stato (
  user_id    uuid        not null default auth.uid() references auth.users(id) on delete cascade,
  collezione text        not null,
  chiave     text        not null,
  dati       jsonb       not null,
  aggiornato timestamptz not null default now(),
  primary key (user_id, collezione, chiave)
);

alter table public.stato enable row level security;

drop policy if exists "leggo i miei"    on public.stato;
drop policy if exists "scrivo i miei"   on public.stato;
drop policy if exists "aggiorno i miei" on public.stato;
drop policy if exists "cancello i miei" on public.stato;
create policy "leggo i miei"    on public.stato for select using (auth.uid() = user_id);
create policy "scrivo i miei"   on public.stato for insert with check (auth.uid() = user_id);
create policy "aggiorno i miei" on public.stato for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "cancello i miei" on public.stato for delete using (auth.uid() = user_id);

-- aggiornamenti in tempo reale: quello che segni sul telefono compare subito sul PC
alter publication supabase_realtime add table public.stato;

-- ---------- far vedere la wishlist con un link segreto (sola lettura) ----------
create table if not exists public.condivisioni (
  token text primary key default replace(gen_random_uuid()::text, '-', ''),
  user_id uuid not null unique default auth.uid() references auth.users(id) on delete cascade,
  nome text check (nome is null or char_length(nome) <= 40),
  creato timestamptz not null default now()
);
alter table public.condivisioni enable row level security;
drop policy if exists "condivisioni: leggo la mia" on public.condivisioni;
drop policy if exists "condivisioni: creo la mia" on public.condivisioni;
drop policy if exists "condivisioni: cambio la mia" on public.condivisioni;
drop policy if exists "condivisioni: tolgo la mia" on public.condivisioni;
create policy "condivisioni: leggo la mia" on public.condivisioni for select to authenticated using (user_id = (select auth.uid()));
create policy "condivisioni: creo la mia" on public.condivisioni for insert to authenticated with check (user_id = (select auth.uid()));
create policy "condivisioni: cambio la mia" on public.condivisioni for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "condivisioni: tolgo la mia" on public.condivisioni for delete to authenticated using (user_id = (select auth.uid()));

-- dato il token, restituisce solo cosa serve per vedere le carte che mancano: niente prezzi pagati, niente negozi
create or replace function public.wishlist_condivisa(t text) returns jsonb
language sql stable security definer set search_path = '' as $$
  with u as (select c.user_id, c.nome from public.condivisioni c where c.token = t)
  select case when not exists (select 1 from u) then null else jsonb_build_object(
    'nome', (select nome from u),
    'wishlist', coalesce((select jsonb_object_agg(s.chiave, jsonb_build_object('carte',
        coalesce((select jsonb_agg(jsonb_build_object('nome', x->>'nome', 'copie', x->'copie')) from jsonb_array_elements(s.dati->'carte') x), '[]'::jsonb)))
      from public.stato s, u where s.user_id = u.user_id and s.collezione = 'wishlist'), '{}'::jsonb),
    'aggiunte', coalesce((select jsonb_object_agg(s.chiave, jsonb_build_object('nome', s.dati->>'nome', 'mazzo', s.dati->>'mazzo', 'copie', s.dati->'copie'))
      from public.stato s, u where s.user_id = u.user_id and s.collezione = 'aggiunte'), '{}'::jsonb),
    'escluse', coalesce((select jsonb_object_agg(s.chiave, jsonb_build_object('nome', s.dati->>'nome'))
      from public.stato s, u where s.user_id = u.user_id and s.collezione = 'escluse'), '{}'::jsonb),
    'prese', coalesce((select jsonb_object_agg(p.chiave, p.mazzi) from (
        select v.chiave, jsonb_agg(jsonb_build_object('mazzo', v.mazzo)) as mazzi from (
          select s.chiave, e->>'mazzo' as mazzo from public.stato s, u, jsonb_array_elements(s.dati->'trovate') e
            where s.user_id = u.user_id and s.collezione = 'trovate'
          union all
          select s.chiave, e->>'mazzo' from public.stato s, u, jsonb_array_elements(s.dati->'voci') e
            where s.user_id = u.user_id and s.collezione = 'carrello'
        ) v group by v.chiave) p), '{}'::jsonb)
  ) end
$$;
revoke all on function public.wishlist_condivisa(text) from public;
grant execute on function public.wishlist_condivisa(text) to anon, authenticated;

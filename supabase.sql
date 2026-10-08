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

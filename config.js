// Il collegamento a Supabase, dove si salvano i dati per vederli uguali su telefono e PC.
// Copia qui i due valori del tuo progetto: Supabase > Project Settings > API
// ("Project URL" e la chiave "publishable", o la vecchia "anon public"). La chiave anon puo' stare in un sito pubblico:
// i dati li protegge la sicurezza per riga della tabella (vedi supabase.sql).
// Lasciali vuoti e l'app salva tutto solo nel browser che stai usando.
window.CONFIG = {
  SUPABASE_URL: "https://rbxyqllifejltpuznbqk.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_Gr16STgiST5ZMhwUrkoHNw_yrN7etQd",
};

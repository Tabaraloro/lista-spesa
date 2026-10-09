// Funzione "cardtrader": fa da tramite fra l'app e l'API di CardTrader.
// La chiave personale di CardTrader sta nel segreto CARDTRADER_TOKEN (Supabase → Edge Functions → Secrets),
// mai nel sito. Chi chiama deve essere entrato nell'app (JWT di Supabase): riceve, per ogni id Scryfall,
// l'offerta più bassa su CardTrader, la media delle offerte e la più bassa fra i venditori «CardTrader Zero».
// I risultati restano in memoria (tabella ct_prezzi) per 12 ore, così CardTrader non viene chiamato a ogni apertura.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const CT = "https://api.cardtrader.com/api/v2";
const VALIDITA_MS = 12 * 60 * 60 * 1000;          // 12 ore
const ESPANSIONI_MS = 7 * 24 * 60 * 60 * 1000;    // la lista dei set cambia di rado
const MAX_IDS = 60;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const token = () => Deno.env.get("CARDTRADER_TOKEN") || "";
let ultimaChiamata = 0;
async function ct(path: string) {
  // CardTrader: al massimo 10 richieste al secondo sul marketplace; stiamo larghi
  const attesa = 150 - (Date.now() - ultimaChiamata);
  if (attesa > 0) await new Promise((r) => setTimeout(r, attesa));
  ultimaChiamata = Date.now();
  const r = await fetch(CT + path, { headers: { Authorization: "Bearer " + token(), Accept: "application/json" } });
  if (r.status === 429) { await new Promise((res) => setTimeout(res, 1500)); return ct(path); }
  if (!r.ok) throw new Error(`CardTrader ${r.status} su ${path}`);
  return r.json();
}

type Stampa = { id: string; set: string; set_nome?: string; foil?: boolean };
type Riga = { scryfall_id: string; blueprint_id: number | null; prezzo_min: number | null; cond_min: string | null;
  prezzo_medio: number | null; prezzo_zero: number | null; cond_zero: string | null; offerte: number; aggiornato: string };

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ errore: "solo POST" }, 405);
  if (!token()) return json({ errore: "manca il segreto CARDTRADER_TOKEN su Supabase" }, 503);

  let corpo: { stampe?: Stampa[] };
  try { corpo = await req.json(); } catch { return json({ errore: "corpo non valido" }, 400); }
  const stampe = (corpo.stampe || []).filter((s) => s && typeof s.id === "string" && typeof s.set === "string").slice(0, MAX_IDS);
  if (!stampe.length) return json({ prezzi: {} });

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const ids = stampe.map((s) => s.id);
  const { data: inMemoria } = await db.from("ct_prezzi").select("*").in("scryfall_id", ids);
  const prezzi: Record<string, Riga> = {};
  for (const r of (inMemoria || []) as Riga[]) prezzi[r.scryfall_id] = r;
  const adesso = Date.now();
  const daFare = stampe.filter((s) => !prezzi[s.id] || adesso - new Date(prezzi[s.id].aggiornato).getTime() > VALIDITA_MS);
  const errori: string[] = [];
  const falliti = new Set<string>();

  if (daFare.length) {
    // 1) la lista dei set di CardTrader, per trovare il set giusto a partire dal codice Scryfall
    let { data: esp } = await db.from("ct_espansioni").select("id, codice, nome, aggiornato");
    const vecchia = !esp || !esp.length || adesso - new Date(esp[0].aggiornato).getTime() > ESPANSIONI_MS;
    if (vecchia) {
      try {
        const lista = await ct("/expansions") as { id: number; code: string; name: string; game_id: number }[];
        const magic = lista.filter((e) => e.game_id === 1);     // su CardTrader il gioco 1 è Magic
        const righe = (magic.length ? magic : lista).map((e) => ({ id: e.id, codice: e.code, nome: e.name, aggiornato: new Date().toISOString() }));
        if (righe.length) { await db.from("ct_espansioni").upsert(righe); esp = righe as typeof esp; }
      } catch (e) { errori.push(String(e)); }
    }
    const perCodice = new Map<string, number>();
    const perNome = new Map<string, number>();
    for (const e of esp || []) { perCodice.set(String(e.codice).toLowerCase(), e.id); perNome.set(String(e.nome).toLowerCase(), e.id); }
    const blueprintsDiSet = new Map<number, { id: number; scryfall_id?: string }[]>();

    for (const s of daFare) {
      const riga: Riga = { scryfall_id: s.id, blueprint_id: prezzi[s.id]?.blueprint_id ?? null, prezzo_min: null, cond_min: null,
        prezzo_medio: null, prezzo_zero: null, cond_zero: null, offerte: 0, aggiornato: new Date().toISOString() };
      try {
        // 2) il "blueprint" (la stampa) di CardTrader che corrisponde a questa stampa Scryfall
        if (!riga.blueprint_id) {
          const idSet = perCodice.get(s.set.toLowerCase()) ?? (s.set_nome ? perNome.get(s.set_nome.toLowerCase()) : undefined);
          if (idSet) {
            if (!blueprintsDiSet.has(idSet)) blueprintsDiSet.set(idSet, await ct(`/blueprints/export?expansion_id=${idSet}`));
            const b = (blueprintsDiSet.get(idSet) || []).find((x) => x.scryfall_id === s.id);
            if (b) riga.blueprint_id = b.id;
          }
        }
        // 3) le offerte: la più bassa in euro, e la più bassa fra i venditori "Zero"
        if (riga.blueprint_id) {
          const r = await ct(`/marketplace/products?blueprint_id=${riga.blueprint_id}&foil=${s.foil ? "true" : "false"}`);
          const offerte = (Object.values(r || {}).flat() as any[]).filter((p) =>
            p && p.price && p.price.currency === "EUR" && !p.on_vacation && !p.graded && (p.bundle_size || 1) === 1 && (p.quantity || 0) > 0);
          riga.offerte = offerte.length;
          const cond = (p: any) => (p.properties_hash && (p.properties_hash.condition || p.properties_hash.mtg_condition)) || null;
          const ord = offerte.slice().sort((a, b) => a.price.cents - b.price.cents);
          if (ord[0]) { riga.prezzo_min = ord[0].price.cents / 100; riga.cond_min = cond(ord[0]); }
          // media semplice di tutte le offerte in euro (ogni offerta conta una volta, non per quantità)
          if (ord.length) riga.prezzo_medio = Math.round(ord.reduce((t, p) => t + p.price.cents, 0) / ord.length) / 100;
          const zero = ord.find((p) => p.user && p.user.can_sell_via_hub);
          if (zero) { riga.prezzo_zero = zero.price.cents / 100; riga.cond_zero = cond(zero); }
        }
      } catch (e) { errori.push(`${s.id}: ${e}`); falliti.add(s.id); }
      prezzi[s.id] = riga;
    }
    // si salva anche chi non ha un blueprint: così non si richiede a CardTrader per 12 ore
    const daSalvare = daFare.filter((s) => !falliti.has(s.id)).map((s) => prezzi[s.id]);
    if (daSalvare.length) await db.from("ct_prezzi").upsert(daSalvare);
  }

  const risposta: Record<string, unknown> = {};
  for (const id of ids) {
    const r = prezzi[id]; if (!r) continue;
    risposta[id] = { blueprint: r.blueprint_id, min: r.prezzo_min, cond_min: r.cond_min, medio: r.prezzo_medio ?? null, zero: r.prezzo_zero, cond_zero: r.cond_zero, offerte: r.offerte, quando: r.aggiornato };
  }
  return json({ prezzi: risposta, errori: errori.length ? errori : undefined });
});

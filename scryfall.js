// Dati delle carte presi dal vivo da Scryfall, nel browser.
//
// Per ogni carta della wishlist chiede a Scryfall tutte le stampe cartacee, in inglese e in
// italiano, e le trasforma nella forma che usa la pagina (la stessa di mtgwizard/uscita/wishlist.py).
// Tutto resta in cache nel browser per 24 ore, come chiede Scryfall: riaprire la pagina non
// rifà le richieste. "Aggiorna prezzi" svuota la cache e richiede tutto.
(function(){
"use strict";
const API = "https://api.scryfall.com";
const VERSIONE = 1;                       // cambia quando cambia la forma dei dati in cache
const DURATA = 24 * 3600 * 1000;
const PAUSA = 550;                        // la ricerca di Scryfall accetta al massimo 2 richieste al secondo

const TIPI_N = new Set(["core","expansion","draft_innovation","masters"]);
const SPECIALI = new Set(["plst","mb1","mb2","cmb1","cmb2","fmb1","sld","sls","slx"]);
const CORNICI = {showcase:"showcase", extendedart:"arte estesa", etched:"foil inciso", shatteredglass:"vetro infranto", fullart:"arte piena", textless:"senza testo"};
const PROMO = {prerelease:"prerelease", promopack:"promo pack", bundle:"bundle", buyabox:"buy-a-box", serialized:"serializzata",
  judgegift:"promo giudice", playpromo:"promo play", storechampionship:"promo negozio", gameday:"game day", release:"promo uscita"};
const COLORI = {W:"Bianco", U:"Blu", B:"Nero", R:"Rosso", G:"Verde"};

const chiave = n => n.toLowerCase().replace(/[^a-z0-9]/g, "");
const catSet = (tipo, codice) => SPECIALI.has(String(codice).toLowerCase()) ? "speciale"
  : tipo === "commander" ? "commander" : TIPI_N.has(tipo) ? "normale" : "speciale";
const immagine = c => ((c.image_uris || (c.card_faces && c.card_faces[0] && c.card_faces[0].image_uris) || {}).normal) || null;
const num = x => x == null || x === "" ? null : Number(x);

function variante(s){
  const parti = (s.cornice || []).filter(x => CORNICI[x]).map(x => CORNICI[x]);
  if (s.bordo === "borderless") parti.push("senza bordo");
  else if (s.bordo && s.bordo !== "black" && s.bordo !== "white") parti.push("bordo " + s.bordo);
  if (s.arte_piena && !parti.includes("arte piena")) parti.push("arte piena");
  if (s.promo) { const p = (s.promo_tipi || []).find(x => PROMO[x]); parti.push(p ? PROMO[p] : "promo"); }
  if (!(s.finiture || []).includes("nonfoil")) parti.push("solo foil");
  if ((s.cornice_anno === "1993" || s.cornice_anno === "1997") && s.uscita >= "2003-07-28") parti.push("cornice retrò");
  return parti.join(", ");
}
function stampa(c){
  const p = c.prices || {};
  const s = {set: c.set, set_nome: c.set_name, numero: c.collector_number, uscita: c.released_at, lingua: c.lang,
    rarita: c.rarity, immagine: immagine(c), eur: num(p.eur), eur_foil: num(p.eur_foil), finiture: c.finishes || [],
    promo: !!c.promo, digitale: !!c.digital, id: c.id, tipo_set: c.set_type, cornice: c.frame_effects || [],
    bordo: c.border_color, arte_piena: !!c.full_art, promo_tipi: c.promo_types || [], cornice_anno: c.frame};
  s.categoria = catSet(s.tipo_set, s.set);
  s.variante = variante(s);
  return s;
}
const numOrd = n => { const m = String(n).match(/^(\D*)(\d*)(.*)$/); return [m[1], m[2] ? Number(m[2]) : -1, m[3]]; };
function confronta(a, b){
  const la = a.lingua === "en" ? 0 : 1, lb = b.lingua === "en" ? 0 : 1;
  if (la !== lb) return la - lb;
  if (a.uscita !== b.uscita) return a.uscita < b.uscita ? -1 : 1;
  const x = numOrd(a.numero), y = numOrd(b.numero);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
  return 0;
}
function pt(f){
  if (f.power != null) return `${f.power}/${f.toughness ?? ""}`;
  if (f.loyalty != null) return `fedeltà ${f.loyalty}`;
  if (f.defense != null) return `difesa ${f.defense}`;
  return "";
}
function facce(c, it){
  const fs = c.card_faces && !c.oracle_text ? c.card_faces : [c];
  return fs.map(f => ({
    nome: it ? (f.printed_name || f.name || "") : (f.name || ""),
    costo: f.mana_cost || "",
    tipo: it ? (f.printed_type_line || f.type_line || "") : (f.type_line || ""),
    testo: (it ? f.printed_text : f.oracle_text) || "",
    pt: pt(f)}));
}
function facceIt(lista){
  for (const x of lista) {
    if (x.set_type === "memorabilia") continue;
    const fs = x.card_faces && !x.printed_text ? x.card_faces : [x];
    if (!fs.every(f => f.printed_text)) continue;
    const it = facce(x, true);
    if (it.every((f, i) => f.testo === (fs[i].oracle_text || ""))) continue;   // non e' una traduzione
    return it;
  }
  return null;
}

// ---------- richieste, una alla volta ----------
let coda = Promise.resolve(), ultima = 0, ultimoErrore = null;
function chiedi(url){
  const giro = coda.then(async () => {
    const attesa = ultima + PAUSA - Date.now();
    if (attesa > 0) await new Promise(r => setTimeout(r, attesa));
    // Quando Scryfall dice "troppe richieste" la risposta spesso arriva senza i permessi per il
    // browser, e fetch fallisce senza dire perche': in tutti e due i casi si aspetta e si riprova.
    // Dopo un "troppe richieste" Scryfall blocca per 30 secondi: le attese coprono quel tempo.
    const ATTESE = [2000, 4000, 8000, 16000, 30000];
    let errore = null;
    for (let t = 0; t <= ATTESE.length; t++) {
      if (t > 0) await new Promise(r2 => setTimeout(r2, ATTESE[t - 1]));
      ultima = Date.now();
      let r;
      try { r = await fetch(url, {headers: {Accept: "application/json"}}); }
      catch(e){ errore = e; continue; }
      if (r.status === 404) return {data: []};
      if (r.status === 429 || r.status >= 500) { errore = new Error(`Scryfall ${r.status}`); continue; }
      if (!r.ok) throw new Error(`Scryfall ${r.status}`);
      return r.json();
    }
    throw errore || new Error("Scryfall non risponde");
  });
  coda = giro.catch(() => {});
  return giro;
}
// una richiesta sola per carta, inglese e italiano insieme (la ricerca e' la parte lenta: 2 al secondo)
async function tutteLeStampe(nome){
  const fronte = nome.split(" // ")[0];
  const q = `!"${fronte}" game:paper (lang:en or lang:it)`;
  let url = `${API}/cards/search?` + new URLSearchParams({q, unique: "prints", order: "released", dir: "asc",
    include_extras: "true", include_variations: "true"});
  const tutte = [];
  while (url) {
    const j = await chiedi(url);
    tutte.push(...(j.data || []));
    url = j.has_more ? j.next_page : null;
  }
  return tutte;
}

// ---------- cache nel browser ----------
const CHIAVE_CACHE = n => `scry:v${VERSIONE}:${chiave(n)}`;
function leggiCache(nome){
  try {
    const x = JSON.parse(localStorage.getItem(CHIAVE_CACHE(nome)) || "null");
    return x && Date.now() - x.t < DURATA ? x : null;
  } catch(e){ return null; }
}
function scriviCache(nome, dati){
  try { localStorage.setItem(CHIAVE_CACHE(nome), JSON.stringify(dati)); }
  catch(e){ svuotaCache(true); try { localStorage.setItem(CHIAVE_CACHE(nome), JSON.stringify(dati)); } catch(e2){} }
}
function svuotaCache(soloScadute){
  try {
    for (const k of Object.keys(localStorage)) {
      if (!k.startsWith("scry:")) continue;
      if (soloScadute) { try { const x = JSON.parse(localStorage.getItem(k)); if (x && Date.now() - x.t < DURATA) continue; } catch(e){} }
      localStorage.removeItem(k);
    }
  } catch(e){}
}

// la scheda di una carta: dalla cache se c'e', altrimenti da Scryfall
async function scheda(nome){
  const c = leggiCache(nome);
  if (c) return c;
  const tutte = await tutteLeStampe(nome);
  const en = tutte.filter(x => x.lang === "en"), it = tutte.filter(x => x.lang === "it");
  const buone = [...en, ...it].filter(x => x.set_type !== "memorabilia" && !x.digital);
  const prima = buone[0] || en[0] || it[0];
  if (!prima) { const vuota = {t: Date.now(), trovata: false}; scriviCache(nome, vuota); return vuota; }
  const fr = (prima.card_faces || [prima])[0];
  const colori = prima.colors != null ? prima.colors : (fr.colors || []);
  const dati = {t: Date.now(), trovata: true, colori, tipo: prima.type_line || "", cmc: Number(prima.cmc || 0),
    testo: facce(prima, false), testo_it: facceIt(it), stampe: buone.map(stampa).sort(confronta)};
  scriviCache(nome, dati);
  return dati;
}
function gruppo(colori, tipo){
  if (tipo.split("//")[0].includes("Land") && !colori.length) return "Terre";
  if (colori.length > 1) return "Multicolore";
  if (!colori.length) return "Incolori";
  return COLORI[colori[0]];
}

// voci: [{nome, copie, mazzi}] -> {carte, errori}
// una carta di cui Scryfall non ha dato i dati: resta in lista, cosi' la wishlist non si accorcia di nascosto
const vuota = (v, perche) => ({chiave: chiave(v.nome), nome: v.nome, copie: v.copie, mazzi: v.mazzi, per: v.per, colori: [], gruppo: "Incolori",
  tipo: "", cmc: 0, prezzo_min: null, stampe: [], testo: [], testo_it: null, aggiornata: Date.now(), problema: perche});
async function costruisci(voci, avanzamento, vivo){
  const carte = [], errori = [], mancanti = [];
  let n = 0;
  for (const v of voci) {
    if (vivo && !vivo()) return null;           // superato da un caricamento piu' recente
    try {
      const d = await scheda(v.nome);
      if (!d.trovata) { errori.push(v.nome); carte.push(vuota(v, "non trovata su Scryfall")); continue; }
      const ps = d.stampe.filter(s => s.eur != null).map(s => s.eur);
      const pf = d.stampe.filter(s => s.eur_foil != null).map(s => s.eur_foil);
      carte.push({chiave: chiave(v.nome), nome: v.nome, copie: v.copie, mazzi: v.mazzi, per: v.per, colori: d.colori,
        gruppo: gruppo(d.colori, d.tipo), tipo: d.tipo, cmc: d.cmc,
        prezzo_min: ps.length ? Math.min(...ps) : pf.length ? Math.min(...pf) : null,
        stampe: d.stampe, testo: d.testo, testo_it: d.testo_it, aggiornata: d.t});
    } catch(e){ errori.push(v.nome); mancanti.push(v.nome); carte.push(vuota(v, "non ancora scaricata da Scryfall")); ultimoErrore = e && e.message || String(e); }
    n++; if (avanzamento) avanzamento(n, voci.length);
  }
  carte.sort((a,b) => a.nome.localeCompare(b.nome));
  return {carte, errori, mancanti};
}
async function suggerimenti(testo){
  if (!testo || testo.length < 2) return [];
  const j = await chiedi(`${API}/cards/autocomplete?` + new URLSearchParams({q: testo}));
  return j.data || [];
}

window.Scry = {costruisci, suggerimenti, svuotaCache, chiave, get ultimoErrore(){ return ultimoErrore; }};
})();

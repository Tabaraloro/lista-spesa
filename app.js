// Lista della spesa — l'app. Vedi LEGGIMI.md.
(function(){
"use strict";
// i dati delle carte arrivano da Scryfall dopo che e' arrivata la wishlist: finche' non ci sono
// la pagina mostra a che punto e' il caricamento
const GRUPPI = ["Bianco","Blu","Nero","Rosso","Verde","Multicolore","Incolori","Terre"];
let carte = [], perChiave = {}, mazziTutti = [], generato = null, datiPronti = false, statoCarico = "Collegamento…";
const piccola = s => s && s.immagine ? s.immagine.replace("/normal/", "/small/") : null;
const grande = s => s && s.immagine ? s.immagine : null;
const eur = v => v == null ? "—" : v.toFixed(2).replace(".", ",") + " €";
const COL = {Bianco:"--W",Blu:"--U",Nero:"--B",Rosso:"--R",Verde:"--G",Multicolore:"--M",Incolori:"--C",Terre:"--L"};
// i tre scaffali: espansioni e set base, mazzi Commander precostruiti, tutto il resto (in genere più caro)
const ORDINE_CAT = ["normale", "commander", "speciale"];
const CAT = {normale:"Set normali", commander:"Set Commander", speciale:"Set speciali"};
const CAT_SOTTO = {normale:"espansioni, set base, Masters", commander:"mazzi precostruiti", speciale:"The List, Secret Lair, promo, bonus sheet, prodotti a parte"};
const catDi = s => s.categoria || "normale";
const varDi = s => s.variante || "";
const numOrd = n => { const m = String(n||"").match(/^\d+/); return m ? Number(m[0]) : 1e6; };
const perNumero = (a,b) => numOrd(a.numero) - numOrd(b.numero) || String(a.numero).localeCompare(String(b.numero));

// ---------- stato: trovate (db dell'artefatto, o localStorage se manca) ----------
let trovate = {};          // chiave -> [{mazzo, negozio, prezzo, set, set_nome, numero, variante, lingua, quando}]
let db = null, dbPronto = false;
const LS = "lista-spesa-trovate";
function leggiLocale(){ try { return JSON.parse(localStorage.getItem(LS) || "{}"); } catch(e){ return {}; } }
function scriviLocale(){ try { localStorage.setItem(LS, JSON.stringify(trovate)); } catch(e){} }
trovate = leggiLocale();

async function collegaDb(){
  try {
    db = await Store.collega();
    if (!db) { mostraAccesso(); return; }
    if (Store.recupero) setTimeout(() => apriPassword(true), 300);
    collegaWishlist();
    collegaCercate();
    collegaCarrello();
    db.collection("trovate").onSnapshot(snap => {
      const nuovo = {};
      snap.docs.forEach(d => { const b = d.data(); if (b && Array.isArray(b.trovate) && b.trovate.length) nuovo[d.id] = b.trovate; });
      trovate = nuovo; dbPronto = true; scriviLocale(); render();
    }, err => { db = null; toast("Non riesco a leggere le carte trovate salvate online: le modifiche restano su questo dispositivo", 6000); });
  } catch(e){ db = null; }
}
// lista e voci si passano esplicite quando si salvano piu' carte di fila: fra una scrittura e
// l'altra puo' arrivare una rilettura dal database che rimette in memoria lo stato di prima
async function salvaTrovate(chiave, lista = trovate[chiave] || []){
  scriviLocale();
  if (cercate[chiave] && perChiave[chiave] && completa(perChiave[chiave])) { delete cercate[chiave]; await salvaCercata(chiave); }
  if (db) {
    try {
      const doc = db.collection("trovate").doc(chiave);
      const c = perChiave[chiave] || {nome: chiave, copie: lista.length};
      if (lista.length) await doc.set({nome: c.nome, copie_volute: c.copie, trovate: lista});
      else await doc.delete();
    } catch(e){ toast("Salvato solo su questo telefono: " + (e && e.code || "errore")); }
  }
}
// ---------- stato: le carte che sto cercando (db dell'artefatto, o localStorage se manca) ----------
// Una carta e' "cercata" se l'hai segnata e ne manca ancora almeno una copia: quando la trovi
// tutta smette di esserlo da sola. Le segnate che non sono piu' in wishlist vengono tolte.
let cercate = {};          // chiave -> {quando}
const LSC = "lista-spesa-cercate";
try { cercate = JSON.parse(localStorage.getItem(LSC) || "{}"); } catch(e){ cercate = {}; }
function scriviCercateLocale(){ try { localStorage.setItem(LSC, JSON.stringify(cercate)); } catch(e){} }
function collegaCercate(){
  db.collection("cercate").onSnapshot(snap => {
    const nuovo = {};
    snap.docs.forEach(d => { nuovo[d.id] = d.data() || {}; });
    cercate = nuovo; scriviCercateLocale();
    // Le cercate di carte non piu' in wishlist non si cancellano: semplicemente non si vedono.
    // Nell'app la wishlist arriva a pezzi (un mazzo alla volta) e cancellarle sarebbe pericoloso;
    // se la carta torna in wishlist, torna anche cercata.
    render();
  }, err => {});
}
async function salvaCercata(chiave){
  scriviCercateLocale();
  if (!db) return;
  try {
    const doc = db.collection("cercate").doc(chiave);
    if (cercate[chiave]) await doc.set({nome: perChiave[chiave] ? perChiave[chiave].nome : chiave, quando: cercate[chiave].quando});
    else await doc.delete();
  } catch(e){ toast("Salvato solo su questo telefono: " + (e && e.code || "errore")); }
}
// ---------- stato: il carrello (carte trovate e messe da parte, non ancora comprate) ----------
// Stessa forma delle trovate: chiave -> [{mazzo, negozio, prezzo, set, set_nome, numero, variante, lingua, quando}].
// "Comprate tutte" le sposta nelle trovate cosi' come sono.
let carrello = {};
const LSK = "lista-spesa-carrello";
try { carrello = JSON.parse(localStorage.getItem(LSK) || "{}"); } catch(e){ carrello = {}; }
function scriviCarrelloLocale(){ try { localStorage.setItem(LSK, JSON.stringify(carrello)); } catch(e){} }
function collegaCarrello(){
  db.collection("carrello").onSnapshot(snap => {
    const nuovo = {};
    snap.docs.forEach(d => { const b = d.data(); if (b && Array.isArray(b.voci) && b.voci.length) nuovo[d.id] = b.voci; });
    carrello = nuovo; scriviCarrelloLocale(); render();
  }, err => {});
}
async function salvaCarrello(chiave, voci = carrello[chiave] || []){
  scriviCarrelloLocale();
  if (!db) return;
  try {
    const doc = db.collection("carrello").doc(chiave);
    if (voci.length) await doc.set({nome: perChiave[chiave] ? perChiave[chiave].nome : chiave, voci});
    else await doc.delete();
  } catch(e){ toast("Salvato solo su questo telefono: " + (e && e.code || "errore")); }
}
const nelCarrello = ch => (carrello[ch] || []).length;
const carrelloPer = (ch, mazzo) => (carrello[ch] || []).filter(v => v.mazzo === mazzo).length;
const trovateDi = ch => (trovate[ch] || []).length;
const trovatePer = (ch, mazzo) => (trovate[ch] || []).filter(t => t.mazzo === mazzo).length;
const completa = c => trovateDi(c.chiave) >= c.copie;
const cercata = c => !!cercate[c.chiave] && !completa(c);
const mancanti = c => Math.max(0, c.copie - trovateDi(c.chiave) - nelCarrello(c.chiave));

// ---------- filtri ----------
const F = {vista:"set", cerca:"", mazzo:"", maxprezzo:"", soloit:false, nascondi:true, categoria:"", estesi:true};
try { Object.assign(F, JSON.parse(localStorage.getItem("lista-spesa-filtri") || "{}")); } catch(e){}
F.cerca = "";
function salvaFiltri(){ try { localStorage.setItem("lista-spesa-filtri", JSON.stringify({...F, cerca: ""})); } catch(e){} }
// le stampe di una carta che i filtri lasciano vedere (lingua e scaffale)
function stampeDi(c){
  return c.stampe.filter(s => (F.soloit ? s.lingua === "it" : s.lingua === "en") && (!F.categoria || catDi(s) === F.categoria));
}
function prezzoMin(c){
  const p = stampeDi(c).filter(s => s.eur != null).map(s => s.eur);
  return p.length ? Math.min(...p) : (F.categoria || F.soloit ? null : c.prezzo_min);
}
const cercaNome = c => !F.cerca || c.nome.toLowerCase().includes(F.cerca.toLowerCase());
// ricerca, mazzo, scaffale, lingua e prezzo: valgono per Wishlist e La cerco
function passaFiltri(c){
  if (!cercaNome(c)) return false;
  if (F.mazzo && !c.mazzi.includes(F.mazzo)) return false;
  if ((F.soloit || F.categoria) && !stampeDi(c).length) return false;
  const p = prezzoMin(c);
  if (F.maxprezzo !== "" && p != null && p > Number(F.maxprezzo)) return false;
  return true;
}
const filtriAttivi = () => [F.mazzo, F.categoria, F.maxprezzo !== "", F.soloit, !F.nascondi].filter(Boolean).length;

// ---------- aspetto e sezioni ----------
// Le carte si guardano in due modi, a scelta, e la scelta resta su ogni dispositivo:
//  "elenco":       righe compatte, con una sola azione per riga;
//  "raccoglitore": griglia di immagini grandi, con le azioni nella scheda della carta.
// Tutto il resto (intestazione, barra delle sezioni in basso, carrello, menu) e' uguale.
// Le sezioni seguono il giro di una carta: la vorrei (Wishlist) -> la cerco -> nel carrello -> trovata.
const SEZIONI = {wish:"Wishlist", cerco:"La cerco", carr:"Carrello", trov:"Trovate"};
const ASPETTI = {elenco:"Elenco", raccoglitore:"Raccoglitore"};
let aspetto = "elenco", sezione = "wish";
try {
  if (ASPETTI[localStorage.getItem("lista-spesa-aspetto")]) aspetto = localStorage.getItem("lista-spesa-aspetto");
  if (SEZIONI[localStorage.getItem("lista-spesa-sezione")]) sezione = localStorage.getItem("lista-spesa-sezione");
} catch(e){}
function scegliAspetto(a){
  if (!ASPETTI[a]) return;
  aspetto = a; try { localStorage.setItem("lista-spesa-aspetto", a); } catch(e){}
  render();
}
function scegliSezione(s){
  if (!SEZIONI[s]) return;
  sezione = s; try { localStorage.setItem("lista-spesa-sezione", s); } catch(e){}
  window.scrollTo(0, 0); render();
}
const IC = {
  lista: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01"/></svg>',
  griglia: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="4" y="4" width="6.5" height="8" rx="1.2"/><rect x="13.5" y="4" width="6.5" height="8" rx="1.2"/><rect x="4" y="14.5" width="6.5" height="5.5" rx="1.2"/><rect x="13.5" y="14.5" width="6.5" height="5.5" rx="1.2"/></svg>',
  seg: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M7 4h10a1 1 0 0 1 1 1v15l-6-4-6 4V5a1 1 0 0 1 1-1z"/></svg>',
  carr: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4h2l2.4 11h10.2L20 8H6.2"/><circle cx="9" cy="19.5" r="1.3"/><circle cx="17" cy="19.5" r="1.3"/></svg>',
  ok: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
};

// ---------- quali carte in quale sezione ----------
// La cerco: segnate, e ne manca ancora almeno una copia (quelle gia' nel carrello non mancano piu').
const daCercare = c => cercata(c) && mancanti(c) > 0;
function carteDi(sez){
  if (sez === "wish") return carte.filter(c => passaFiltri(c) && !(F.nascondi && completa(c)));
  if (sez === "cerco") return carte.filter(c => daCercare(c) && passaFiltri(c));
  if (sez === "carr") return carte.filter(c => nelCarrello(c.chiave) && cercaNome(c));
  return carte.filter(c => trovateDi(c.chiave) && cercaNome(c));
}
const perNome = (a,b) => a.nome.localeCompare(b.nome);
// la stampa da mostrare per una carta fuori dalla vista per set: la piu' economica fra quelle che i filtri lasciano vedere
function piuEconomica(c){
  const vis = stampeDi(c).length ? stampeDi(c) : c.stampe;
  return vis.filter(x => x.eur != null).sort((a,b) => a.eur - b.eur)[0] || vis[0] || null;
}
// la stampa che hai segnato nel carrello o fra le trovate, se l'hai indicata
function stampaDaVoce(c, v){
  const s = v && v.set ? c.stampe.find(x => x.set === v.set && String(x.numero) === String(v.numero) && x.lingua === (v.lingua || "en")) : null;
  return s || piuEconomica(c);
}
function stampaSezione(c){
  if (sezione === "carr") return stampaDaVoce(c, (carrello[c.chiave] || [])[0]);
  if (sezione === "trov") { const ts = trovate[c.chiave] || []; return stampaDaVoce(c, ts[ts.length - 1]); }
  return piuEconomica(c);
}
const prezzoStampa = s => !s ? null : s.eur != null ? s.eur : s.eur_foil;
const sommaVoci = vs => vs.reduce((t,x) => t + (Number(x.prezzo) || 0), 0);

// ---------- gruppi: per set, per colore, per mazzo ----------
// Nella vista per set una carta compare in ogni set in cui e' stata stampata: e' la vista per
// cercare nei raccoglitori del negozio, ordinati per set.
const nomeSet = s => F.estesi ? s.set_nome : s.set.toUpperCase();
// le stampe della stessa carta nello stesso set (e lingua): la normale per prima, poi le varianti
function varianti(c, s){
  return c.stampe.filter(x => x.set === s.set && x.lingua === s.lingua)
    .sort((a,b) => (varDi(a) ? 1 : 0) - (varDi(b) ? 1 : 0) || perNumero(a,b));
}
const aperti = new Set(), chiusi = new Set();
// nella Wishlist i set sono tanti e partono chiusi; in La cerco le carte sono poche e tutto parte aperto
const perSetChiusi = id => id.startsWith("set-") && sezione === "wish";
const aperto = id => perSetChiusi(id) ? aperti.has(id) : !chiusi.has(id);
const nCarte = n => `${n} ${n === 1 ? "carta" : "carte"}`;
function gruppi(lista){
  const out = [];
  if (F.vista === "set") {
    const perSet = new Map();
    for (const c of lista) {
      const visti = new Set();
      for (const s of stampeDi(c)) {
        if (visti.has(s.set)) continue;
        visti.add(s.set);
        if (!perSet.has(s.set)) perSet.set(s.set, {set:s.set, nome:s.set_nome, uscita:s.uscita, categoria:catDi(s), voci:[]});
        perSet.get(s.set).voci.push({c, s: varianti(c, s)[0]});
      }
    }
    for (const cat of ORDINE_CAT) {
      const gs = [...perSet.values()].filter(g => g.categoria === cat)
        .sort((a,b) => b.voci.length - a.voci.length || (b.uscita||"").localeCompare(a.uscita||""));
      if (!gs.length) continue;
      const n = new Set(gs.flatMap(g => g.voci.map(v => v.c.chiave))).size;
      out.push({intestazione: `<h2 class="sezione">${CAT[cat]} <small>${gs.length} set · ${nCarte(n)}</small><div class="spiega">${CAT_SOTTO[cat]}</div></h2>`});
      for (const g of gs) {
        g.voci.sort((a,b) => perNumero(a.s, b.s));
        out.push({id: "set-" + g.set, nome: g.nome, sotto: `<span class="mono">${esc(g.set.toUpperCase())}</span> · ${(g.uscita||"").slice(0,4)}`, voci: g.voci});
      }
    }
    // le carte senza stampe visibili (per esempio non ancora scaricate da Scryfall) non sparirebbero in silenzio
    const senza = lista.filter(c => !stampeDi(c).length);
    if (senza.length) out.push({id: "set-?", nome: "Senza stampe da mostrare", sotto: "non ancora scaricate, o escluse dai filtri", voci: senza.sort(perNome).map(c => ({c, s: null}))});
  } else if (F.vista === "colore") {
    for (const gn of GRUPPI) {
      const cs = lista.filter(c => c.gruppo === gn).sort(perNome);
      if (cs.length) out.push({id: "col-" + gn, nome: gn, swatch: COL[gn], voci: cs.map(c => ({c, s: piuEconomica(c)}))});
    }
  } else {
    for (const m of mazziTutti) {
      const cs = lista.filter(c => c.mazzi.includes(m)).sort(perNome);
      if (!cs.length) continue;
      const tot = cs.reduce((t,c) => t + (prezzoMin(c) || 0), 0);
      out.push({id: "mazzo-" + m, nome: m, sotto: `${eur(tot)} alla stampa più economica`, voci: cs.map(c => ({c, s: piuEconomica(c)}))});
    }
  }
  return out;
}
function gruppoHtml(g, corpo){
  return `<details class="gruppo" data-gruppo="${esc(g.id)}" ${aperto(g.id) ? "open" : ""}>
    <summary>${g.swatch ? `<span class="swatch" style="background:var(${g.swatch})"></span>` : ""}
      <div class="titolo"><div class="nome">${esc(g.nome)}</div>${g.sotto ? `<div class="sotto">${g.sotto}</div>` : ""}</div>
      <span class="conta">${g.voci.length}</span><span class="freccia" aria-hidden="true">›</span></summary>
    ${corpo}
  </details>`;
}

// ---------- una carta: l'immagine, con il nome sotto se l'immagine non c'e' ----------
function miniatura(c, s, big){
  const x = s && s.immagine ? s : c.stampe.find(y => y.immagine);
  const src = x ? (big ? grande(x) : piccola(x)) : null;
  return `<span class="mini" style="background:var(${COL[c.gruppo] || "--C"})"><span class="mini-n">${esc(c.nome)}</span>${src ? `<img src="${src}" alt="" loading="lazy" decoding="async" onerror="this.remove()">` : ""}</span>`;
}
const brevi = c => esc(c.mazzi.join(", "));
function copieTesto(c){
  const n = trovateDi(c.chiave), k = nelCarrello(c.chiave);
  if (c.copie === 1 && !n && !k) return "";
  return `${n}/${c.copie} ${c.copie === 1 ? "copia" : "copie"}${k ? ` · <span class="nelc">${k} nel carrello</span>` : ""}`;
}
function sottoRiga(c, s, sez){
  const p = [];
  if (sez === "trov") {
    const ts = trovate[c.chiave] || [];
    p.push(`${ts.length}/${c.copie} · pagata <b>${eur(sommaVoci(ts))}</b>`);
    const neg = [...new Set(ts.map(x => x.negozio).filter(Boolean))];
    if (neg.length) p.push(esc(neg.join(", ")));
    p.push(esc([...new Set(ts.map(x => x.mazzo))].join(", ")));
    return p.join(" · ");
  }
  if (F.vista === "set" && s) {
    p.push(`<span class="mono">#${esc(s.numero)}</span>${varDi(s) ? ` ${esc(varDi(s))}` : ""} <b>${s.eur != null ? eur(s.eur) : s.eur_foil != null ? "foil " + eur(s.eur_foil) : "—"}</b>${s.lingua === "it" ? " · IT" : ""}`);
  } else {
    p.push(`da <b>${eur(prezzoMin(c))}</b>${s ? ` <span class="set">(${esc(nomeSet(s))} #${esc(s.numero)})</span>` : ""}`);
  }
  const cp = copieTesto(c); if (cp) p.push(cp);
  if (c.problema) p.push(esc(c.problema));
  p.push(brevi(c));
  return p.join(" · ");
}
// Elenco: una riga, una sola azione a destra, e cambia con la sezione
function riga(c, s, sez){
  const fatta = sez === "wish" && completa(c);
  let az = "";
  if (sez === "wish") az = fatta ? `<span class="spunta" title="Trovata">${IC.ok}</span>`
    : `<button class="segna" data-cerco="${c.chiave}" aria-pressed="${cercata(c)}" aria-label="${cercata(c) ? `La cerchi: tocca per smettere (${esc(c.nome)})` : `La cerco (${esc(c.nome)})`}">${IC.seg}</button>`;
  else if (sez === "cerco") az = `<button class="btn" data-trova="${c.chiave}">Trovata</button>`;
  else if (sez === "trov") az = `<button class="btn sec piccolo" data-trova="${c.chiave}">Modifica</button>`;
  const id = s ? s.id : "";
  return `<div class="r ${fatta ? "fatta" : ""}" data-chiave="${c.chiave}" data-stampa="${id}">
    <button class="r-img" data-stampe="${c.chiave}" data-img="${id}" aria-label="Apri ${esc(c.nome)}">${miniatura(c, s, false)}</button>
    <div class="r-tx" data-stampe="${c.chiave}" data-img="${id}"><div class="r-nm">${esc(c.nome)}</div><div class="r-sb">${sottoRiga(c, s, sez)}</div></div>
    ${az}</div>`;
}
// Raccoglitore: una casella con l'immagine; le azioni stanno nella scheda che si apre toccandola
function casella(c, s, sez){
  const st = completa(c) ? "trov" : nelCarrello(c.chiave) ? "carr" : cercata(c) ? "cerco" : "";
  const marca = st ? `<span class="marca ${st}" title="${st === "trov" ? "Trovata" : st === "carr" ? "Nel carrello" : "La cerchi"}">${st === "trov" ? IC.ok : st === "carr" ? IC.carr : IC.seg}</span>` : "";
  const prezzo = sez === "carr" ? sommaVoci(carrello[c.chiave] || []) : sez === "trov" ? sommaVoci(trovate[c.chiave] || [])
    : F.vista === "set" ? prezzoStampa(s) : prezzoMin(c);
  const copie = c.copie > 1 ? `<span class="copie-b">${trovateDi(c.chiave)}/${c.copie}</span>` : "";
  return `<button class="cas ${st === "trov" && sez !== "trov" ? "fatta" : ""}" data-stampe="${c.chiave}" data-img="${s ? s.id : ""}" aria-label="${esc(c.nome)}">
    <span class="cas-im">${miniatura(c, s, true)}<span class="pz">${prezzo == null ? "—" : eur(prezzo).replace(" €", "")}</span>${marca}${copie}</span>
    <span class="cas-n">${esc(c.nome)}</span>${F.vista === "set" && s && (sez === "wish" || sez === "cerco") ? `<span class="cas-s">#${esc(s.numero)}${varDi(s) ? ` · ${esc(varDi(s))}` : ""}</span>` : ""}</button>`;
}

// ---------- la pagina ----------
const VUOTO = {
  cerco: "<b>Non stai cercando nessuna carta</b>Nella Wishlist tocca il segnalibro, o «La cerco» nella scheda della carta, su quelle che vuoi cercare in negozio o online.",
  carr: "<b>Il carrello è vuoto</b>Quando trovi una carta tocca «Trovata», scrivi prezzo e negozio e scegli «Nel carrello»: resta da parte finché non decidi di comprarla.",
  trov: "<b>Ancora nessuna carta trovata</b>",
};
let rimandato = false;
function render(){
  document.body.dataset.aspetto = aspetto;
  testata();
  const lista = document.getElementById("lista");
  // mentre scrivi un prezzo nel carrello la pagina non si ridisegna: lo fa quando esci dal campo
  const a = document.activeElement;
  if (a && a.matches && a.matches("#lista [data-prezzo]")) { rimandato = true; return; }
  rimandato = false;
  if (!datiPronti) { lista.innerHTML = `<div class="vuoto">${statoCarico}</div>`; return; }
  const cs = carteDi(sezione);
  let html = "";
  if (sezione === "carr" && nCarrello()) {
    html = `<div class="carr-pagina">${corpoCarrello()}</div>
      <div class="piede"><div class="t">Totale<br><b class="mono">${eur(totCarrello())}</b></div><button class="btn" data-compra>Comprate tutte</button></div>`;
  } else if (!cs.length) {
    const qualcuna = sezione === "wish" ? carte.length : sezione === "cerco" ? carte.some(daCercare)
      : sezione === "carr" ? nCarrello() : carte.some(c => trovateDi(c.chiave));
    html = `<div class="vuoto">${sezione === "wish" && !carte.length ? "<b>La wishlist è vuota</b>Apri il Menu e importa l'export di Archidekt, oppure aggiungi una carta a mano."
      : qualcuna ? "<b>Niente da mostrare</b>Nessuna carta con questi filtri o con questa ricerca." : VUOTO[sezione]}</div>`;
  } else {
    const gs = sezione === "wish" || sezione === "cerco" ? gruppi(cs) : [{voci: cs.sort(perNome).map(c => ({c, s: stampaSezione(c)}))}];
    for (const g of gs) {
      if (g.intestazione) { html += g.intestazione; continue; }
      const corpo = aspetto === "elenco"
        ? `<div class="righe">${g.voci.map(v => riga(v.c, v.s, sezione)).join("")}</div>`
        : `<div class="cas-griglia">${g.voci.map(v => casella(v.c, v.s, sezione)).join("")}</div>`;
      html += g.id ? gruppoHtml(g, corpo) : corpo;
    }
  }
  html += `<div class="nota">Prezzi e stampe da Scryfall${generato ? ` del ${generato}` : ""}${db && db.modo === "online" ? ` · dati sincronizzati (${esc(db.utente || "")})` : " · dati salvati in questo browser"}</div>`;
  lista.innerHTML = html;
}
// intestazione, riepilogo, sezioni e barre: tutto quello che sta intorno alla lista
function testata(){
  const el = id => document.getElementById(id);
  const pronto = datiPronti && !!db;
  el("titolo").textContent = pronto ? SEZIONI[sezione] : "Lista della spesa";
  const altro = aspetto === "elenco" ? "raccoglitore" : "elenco";
  el("aspetto").innerHTML = aspetto === "elenco" ? IC.griglia : IC.lista;
  el("aspetto").setAttribute("aria-label", `Passa all'aspetto ${ASPETTI[altro]}`);
  el("aspetto").title = `Passa all'aspetto ${ASPETTI[altro]}`;
  const nf = filtriAttivi();
  el("apri-filtri").innerHTML = `Filtri${nf ? ` · ${nf}` : ""}`;
  el("aggiungi").hidden = !pronto;
  // conti
  const cs = carte.filter(daCercare);
  const nVoci = nCarrello();
  const conta = {wish: carte.filter(c => !completa(c)).length, cerco: cs.length, carr: nVoci, trov: carte.filter(c => trovateDi(c.chiave)).length};
  // le quattro sezioni stanno nella barra in basso, con qualunque aspetto
  el("nav").hidden = !pronto;
  const icone = {wish: IC.lista, cerco: IC.seg, carr: IC.carr, trov: IC.ok};
  el("nav").innerHTML = Object.entries(SEZIONI).map(([k, n]) =>
    `<button data-sezione="${k}" ${sezione === k ? 'aria-current="page"' : ""}><span class="pill">${icone[k]}</span>${n}${(k === "cerco" || k === "carr") && conta[k] ? `<span class="num">${conta[k]}</span>` : ""}</button>`).join("");
  el("viste").hidden = !pronto || !(sezione === "wish" || sezione === "cerco");
  el("viste").innerHTML = [["set","Per set"],["colore","Per colore"],["mazzo","Per mazzo"]].map(([v, t]) =>
    `<button data-vista="${v}" aria-pressed="${F.vista === v}">${t}</button>`).join("");
  // l'avviso in basso si tiene sopra la barra delle sezioni e, nel carrello, sopra il totale
  const piede = sezione === "carr" && nVoci && pronto;
  document.documentElement.style.setProperty("--basso", (piede ? 154 : pronto ? 84 : 20) + "px");
  // riepilogo della sezione
  let r = "";
  if (pronto) {
    if (sezione === "wish") {
      const copie = carte.reduce((t,c) => t + Math.max(0, c.copie - trovateDi(c.chiave)), 0);
      const stima = carte.reduce((t,c) => t + (c.prezzo_min || 0) * Math.max(0, c.copie - trovateDi(c.chiave)), 0);
      r = `<span><b>${copie}</b> ${copie === 1 ? "copia" : "copie"} da trovare · <b>${eur(stima)}</b> alla stampa più economica</span>`;
    } else if (sezione === "cerco") {
      const copie = cs.reduce((t,c) => t + mancanti(c), 0);
      const tot = cs.reduce((t,c) => t + (c.prezzo_min || 0) * mancanti(c), 0);
      r = `<span><b>${cs.length}</b> ${cs.length === 1 ? "carta" : "carte"}${copie !== cs.length ? ` (${copie} copie)` : ""} · <b>${eur(tot)}</b></span>
        <button class="btn sec piccolo" id="esporta" ${cs.length ? "" : "disabled"}>Copia per i siti</button>`;
    } else if (sezione === "carr") {
      r = `<span><b>${nVoci}</b> ${nVoci === 1 ? "copia" : "copie"} non ancora comprate · <b>${eur(totCarrello())}</b></span>`;
    } else {
      const copie = carte.reduce((t,c) => t + trovateDi(c.chiave), 0);
      const speso = Object.values(trovate).flat().reduce((t,x) => t + (Number(x.prezzo) || 0), 0);
      r = `<span><b>${copie}</b> ${copie === 1 ? "copia trovata" : "copie trovate"}${speso ? ` · spesi <b>${eur(speso)}</b>` : ""}</span>`;
    }
  }
  el("riepilogo").innerHTML = r;
  el("riepilogo").hidden = !r;
  misuraAlto();
}
// i titoli dei gruppi restano attaccati sotto l'intestazione mentre scorri: serve sapere quanto e' alta
function misuraAlto(){
  const h = document.querySelector("header"); if (!h) return;
  document.documentElement.style.setProperty("--alto", Math.round(h.getBoundingClientRect().height + (parseFloat(getComputedStyle(h).top) || 0)) + "px");
}
addEventListener("resize", misuraAlto);
if (document.fonts && document.fonts.ready) document.fonts.ready.then(misuraAlto);

// ---------- carrello: nel foglio (Raccoglitore) o nella sua sezione (Elenco) ----------
const vociCarrello = () => Object.entries(carrello).filter(([ch]) => perChiave[ch])
  .flatMap(([ch, vs]) => vs.map((v, i) => ({ch, i, v, c: perChiave[ch]})))
  .sort((a,b) => (a.v.negozio || "").localeCompare(b.v.negozio || "") || a.c.nome.localeCompare(b.c.nome));
const nCarrello = () => vociCarrello().length;
const prezzoDi = v => v.prezzo == null || v.prezzo === "" ? null : Number(v.prezzo);
const totCarrello = () => vociCarrello().reduce((t,x) => t + (prezzoDi(x.v) || 0), 0);
// il prezzo con cui confrontare: la stampa che hai scelto, se l'hai scelta, altrimenti la piu' economica
function riferimento(c, v){
  const s = v.set ? c.stampe.find(x => x.set === v.set && String(x.numero) === String(v.numero) && x.lingua === (v.lingua || "en")) : null;
  if (s && s.eur != null) return {p: s.eur, cosa: "questa stampa"};
  if (s && s.eur_foil != null && s.eur == null) return {p: s.eur_foil, cosa: "questa stampa, foil"};
  return {p: c.prezzo_min, cosa: "la più economica"};
}
function deltaHtml(p, rif){
  if (p == null || rif == null) return "";
  const d = p - rif;
  if (Math.abs(d) < 0.005) return `<span class="delta">= riferimento</span>`;
  return `<span class="delta ${d > 0 ? "su" : "giu"}">${d > 0 ? "+" : "−"}${eur(Math.abs(d))}</span>`;
}
// la pagina del carrello: le voci con prezzo modificabile e i conti
function corpoCarrello(){
  const vs = vociCarrello();
  const negozi = [...new Set(vs.map(x => x.v.negozio || ""))];
  const tot = vs.reduce((t,x) => t + (prezzoDi(x.v) || 0), 0);
  const conRif = vs.filter(x => prezzoDi(x.v) != null && riferimento(x.c, x.v).p != null);
  const totRif = conRif.reduce((t,x) => t + riferimento(x.c, x.v).p, 0);
  const totPagCmp = conRif.reduce((t,x) => t + prezzoDi(x.v), 0);
  const senzaPrezzo = vs.filter(x => prezzoDi(x.v) == null).length;
  let righe = "";
  for (const n of negozi) {
    const qui = vs.filter(x => (x.v.negozio || "") === n);
    if (negozi.length > 1) righe += `<h3>${esc(n || "Negozio non indicato")} <small class="sd">${qui.length} · ${eur(qui.reduce((t,x) => t + (prezzoDi(x.v) || 0), 0))}</small></h3>`;
    righe += qui.map(x => {
      const r = riferimento(x.c, x.v);
      return `<div class="voce-c">
        <button class="vi" data-stampe="${x.ch}" data-img="${(stampaDaVoce(x.c, x.v) || {}).id || ""}" aria-label="Apri ${esc(x.c.nome)}">${miniatura(x.c, stampaDaVoce(x.c, x.v), false)}</button>
        <div class="vn">${esc(x.c.nome)}</div>
        <div class="vp"><input type="number" min="0" step="0.05" inputmode="decimal" value="${prezzoDi(x.v) ?? ""}" placeholder="€" data-prezzo="${x.ch}|${x.i}" aria-label="Prezzo di ${esc(x.c.nome)}">
          <button class="btn sec piccolo" data-toglic="${x.ch}|${x.i}" aria-label="Togli ${esc(x.c.nome)} dal carrello">Togli</button></div>
        <div class="vd">per ${esc(x.v.mazzo)}${negozi.length === 1 && x.v.negozio ? ` · ${esc(x.v.negozio)}` : ""}${x.v.set ? ` · ${descStampa(x.v)}` : ""}<br>
          riferimento ${eur(r.p)} <span class="sd">(${r.cosa})</span> ${deltaHtml(prezzoDi(x.v), r.p)}</div>
      </div>`;
    }).join("");
  }
  return `${righe}
    <div class="totali">
      <span class="t">Totale del carrello</span><b class="mono">${eur(tot)}</b>
      <span class="t">Le stesse carte al prezzo di riferimento</span><span class="mono">${eur(totRif)}</span>
      <span class="t">Differenza</span><span>${deltaHtml(totPagCmp, totRif) || "—"}</span>
      ${senzaPrezzo ? `<span class="t" style="grid-column:1 / -1">${senzaPrezzo} ${senzaPrezzo === 1 ? "carta senza prezzo, esclusa" : "carte senza prezzo, escluse"} dai conti</span>` : ""}
    </div>
    <div class="scelte">
      <button class="btn sec" data-svuota>Svuota il carrello</button>
    </div>`;
}
const aggiornaCarrello = () => render();
async function cambiaPrezzo(inp){
  const [ch, i] = inp.dataset.prezzo.split("|"); const v = (carrello[ch] || [])[Number(i)]; if (!v) return;
  v.prezzo = inp.value === "" ? null : Number(inp.value);
  inCoda(() => salvaCarrello(ch));
  setTimeout(aggiornaCarrello, 0);
}
// Le scritture dei pulsanti con «Annulla» vanno in fila: annullare aspetta che l'azione sia salvata,
// cosi' il database finisce sempre nello stato giusto.
let fila = Promise.resolve();
const inCoda = f => (fila = fila.then(f, f));
const copiaVoci = vs => (vs || []).map(v => ({...v}));
async function azioneCarrello(t){
  if (t.hasAttribute("data-toglic")) {
    const [ch, i] = t.dataset.toglic.split("|");
    const nome = perChiave[ch] ? perChiave[ch].nome : ch;
    const prima = copiaVoci(carrello[ch]);
    const dopo = prima.filter((_, k) => k !== Number(i));
    if (dopo.length) carrello[ch] = dopo; else delete carrello[ch];
    aggiornaCarrello(); inCoda(() => salvaCarrello(ch, dopo));
    toast(`${nome}: tolta dal carrello`, 5000, () => inCoda(async () => { carrello[ch] = prima; aggiornaCarrello(); await salvaCarrello(ch, prima); }));
    return;
  }
  if (t.hasAttribute("data-svuota")) {
    const prima = Object.fromEntries(Object.entries(carrello).map(([ch, vs]) => [ch, copiaVoci(vs)]));
    const chiavi = Object.keys(prima); if (!chiavi.length) return;
    carrello = {}; aggiornaCarrello();
    inCoda(async () => { for (const ch of chiavi) await salvaCarrello(ch, []); });
    toast("Carrello svuotato", 6000, () => inCoda(async () => { Object.assign(carrello, prima); aggiornaCarrello(); for (const ch of chiavi) await salvaCarrello(ch, prima[ch]); }));
    return;
  }
  if (t.hasAttribute("data-compra")) compraTutte();
}
// «Comprate tutte»: ogni carta passa dal carrello alle trovate con i suoi dati (prezzo, negozio, stampa)
function compraTutte(){
  const vs = vociCarrello(); if (!vs.length) return;
  const chiavi = [...new Set(vs.map(x => x.ch))];
  // il piano si fissa prima di scrivere; si tiene anche lo stato di prima, per «Annulla»
  const prima = chiavi.map(ch => ({ch, trov: copiaVoci(trovate[ch]), carr: copiaVoci(carrello[ch]), cerc: cercate[ch] ? {...cercate[ch]} : null}));
  const piano = chiavi.map(ch => ({ch, lista: [...copiaVoci(trovate[ch]), ...copiaVoci(carrello[ch])]}));
  for (const p of piano) { trovate[p.ch] = p.lista; delete carrello[p.ch]; }
  aggiornaCarrello();
  inCoda(async () => { for (const p of piano) { await salvaTrovate(p.ch, p.lista); await salvaCarrello(p.ch, []); } });
  toast(`Segnate comprate ${vs.length} ${vs.length === 1 ? "carta" : "carte"}`, 7000, () => inCoda(async () => {
    for (const p of prima) {
      if (p.trov.length) trovate[p.ch] = p.trov; else delete trovate[p.ch];
      carrello[p.ch] = p.carr;
      if (p.cerc) cercate[p.ch] = p.cerc;
    }
    aggiornaCarrello();
    for (const p of prima) {
      if (p.cerc) await salvaCercata(p.ch);
      await salvaTrovate(p.ch, p.trov); await salvaCarrello(p.ch, p.carr);
    }
  }));
}

// ---------- export per Cardmarket e CardTrader ----------
// Una riga per carta: copie che mancano e nome, senza stampa, cosi' il sito cerca fra tutte.
// Cardmarket chiama le carte a due facce col nome intero ("A // B"); per CardTrader si usa la
// faccia davanti, che e' la forma accettata da quasi tutti gli import di liste.
const SITI = {
  cardmarket: {nome: "Cardmarket", riga: c => `${mancanti(c)} ${c.nome}`},
  cardtrader: {nome: "CardTrader", riga: c => `${mancanti(c)} ${c.nome.split(" // ")[0]}`},
};
const testoPer = sito => carte.filter(c => cercata(c) && mancanti(c) > 0).sort((a,b) => a.nome.localeCompare(b.nome)).map(SITI[sito].riga).join("\n");
async function copia(testo, area){
  try { await navigator.clipboard.writeText(testo); return true; } catch(e){}
  try { area.value = testo; area.focus(); area.select(); if (document.execCommand("copy")) return true; } catch(e){}
  return false;
}
function apriEsporta(){
  const wrap = document.getElementById("foglio-wrap");
  let sito = "cardmarket";
  try { sito = localStorage.getItem("lista-spesa-sito") || "cardmarket"; } catch(e){}
  if (!SITI[sito]) sito = "cardmarket";
  const n = carte.filter(c => cercata(c) && mancanti(c) > 0).length;
  wrap.innerHTML = `<div class="velo" data-chiudi></div>
    <div class="foglio" role="dialog" aria-label="Copia per i siti">
      <div class="testa"><div><h2>Copia per i siti</h2>
        <div class="sub">${n} ${n === 1 ? "carta" : "carte"} che stai cercando, una per riga con le copie che ti mancano (quelle già nel carrello non contano). Incolla il testo nella finestra di import del sito: per Cardmarket in una lista di carte cercate (Wants).</div></div>
        <button class="btn sec" data-chiudi aria-label="Chiudi">✕</button></div>
      <div class="ordina">${Object.entries(SITI).map(([k,v]) => `<button data-sito="${k}" aria-pressed="${k === sito}">${v.nome}</button>`).join("")}</div>
      <textarea id="testo-export" readonly></textarea>
      <div class="scelte"><button class="btn" data-copia>Copia per ${SITI[sito].nome}</button><button class="btn sec" data-chiudi>Chiudi</button></div>
    </div>`;
  const area = wrap.querySelector("#testo-export");
  const aggiorna = () => {
    area.value = testoPer(sito);
    wrap.querySelectorAll("[data-sito]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.sito === sito)));
    wrap.querySelector("[data-copia]").textContent = `Copia per ${SITI[sito].nome}`;
  };
  aggiorna();
  wrap.hidden = false;
  wrap.onclick = async ev => {
    const t = ev.target.closest("[data-chiudi],[data-sito],[data-copia]");
    if (!t) return;
    if (t.hasAttribute("data-chiudi")) { wrap.hidden = true; return; }
    if (t.hasAttribute("data-sito")) { sito = t.dataset.sito; try { localStorage.setItem("lista-spesa-sito", sito); } catch(e){} aggiorna(); return; }
    const ok = await copia(testoPer(sito), area);
    toast(ok ? `Copiato: incollalo su ${SITI[sito].nome}` : "Non riesco a copiare da qui: seleziona il testo e copialo a mano", 2600);
  };
}

// ---------- scheda della carta: immagine grande e testo ----------
const esc = t => String(t == null ? "" : t).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
const simboli = t => esc(t).replace(/\{([^}]+)\}/g, (_, x) => `<span class="sim">${x}</span>`).replace(/\n/g, "<br>");
let linguaTesto = "it";
try { linguaTesto = localStorage.getItem("lista-spesa-lingua-testo") || "it"; } catch(e){}
function schedaCarta(c, idImg){
  const s = (idImg && c.stampe.find(x => x.id === idImg && x.immagine))
    || c.stampe.filter(x => x.immagine && x.lingua === "en" && !varDi(x))[0]
    || c.stampe.find(x => x.immagine);
  const lingua = c.testo_it && linguaTesto === "it" ? "it" : "en";
  const facce = (lingua === "it" ? c.testo_it : c.testo) || [];
  const scelta = c.testo_it ? `<div class="lingue" role="group" aria-label="Lingua del testo">
      <button data-lingua="it" aria-pressed="${lingua === "it"}">Italiano</button><button data-lingua="en" aria-pressed="${lingua === "en"}">English</button></div>` : "";
  const testo = facce.length ? facce.map(f => `<div class="faccia">
      <div class="tc-nome">${esc(f.nome)} ${simboli(f.costo)}</div>
      <div class="tc-tipo">${esc(f.tipo)}</div>
      <div>${simboli(f.testo) || "<i>senza testo</i>"}</div>
      ${f.pt ? `<div class="tc-pt">${esc(f.pt)}</div>` : ""}</div>`).join("")
    : `<div class="sub">Testo non disponibile.</div>`;
  const notaIt = lingua === "it" ? `<div class="nota-it">Testo stampato sulla carta italiana: se è una stampa vecchia può essere superato, fa fede il testo inglese.</div>`
    : (!c.testo_it ? `<div class="nota-it">Nessuna stampa italiana con il testo tradotto.</div>` : "");
  return `<div class="scheda">
    ${s ? `<img class="grande" src="${grande(s)}" alt="${esc(c.nome)}" data-zoom title="Tocca per ingrandire">` : ""}
    <div class="testo-carta">${scelta}${testo}${notaIt}</div>
  </div>`;
}

// ---------- foglio "tutte le stampe" ----------
let ordineStampe = "set";
try { ordineStampe = localStorage.getItem("lista-spesa-ordine-stampe") || "set"; } catch(e){}
function tessera(c, s, scelta){
  const src = piccola(s);
  const img = src ? `<img src="${src}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">`
                  : `<div class="segnap"><span class="mono">${esc(s.set.toUpperCase())}</span><span>senza immagine</span></div>`;
  return `<button class="stampa" data-scegli="${s.id}" aria-pressed="${s.id === scelta}" title="Mostra questa stampa">
    ${img}
    <span class="sn">${esc(s.set_nome || s.set.toUpperCase())}</span>
    <span class="sd"><span class="mono">${esc(s.set.toUpperCase())} #${esc(s.numero)}</span>${s.lingua === "it" ? ` · <span class="badge it">IT</span>` : ""}</span>
    <span class="sd">${esc(varDi(s) || "normale")}${s.uscita ? ` · ${s.uscita.slice(0,4)}` : ""}</span>
    <span class="sp">${eur(s.eur)}${s.eur_foil && s.eur == null ? ` <small class="sd">foil ${eur(s.eur_foil)}</small>` : ""}</span>
  </button>`;
}
// La scheda di una carta: immagine grande, testo, tutte le stampe e le azioni.
// Toccare una stampa la mostra grande; «Trovata» ricorda la stampa scelta (prezzo, set, numero).
function apriStampe(chiave, idImg){
  const c = perChiave[chiave]; if (!c) return;
  const wrap = document.getElementById("foglio-wrap");
  const tutte = c.stampe.slice();
  const nSet = new Set(tutte.map(s => s.set)).size;
  const nIt = tutte.filter(s => s.lingua === "it").length;
  let idGrande = idImg && tutte.some(s => s.id === idImg) ? idImg : null, zoom = false;
  const corpo = () => {
    if (ordineStampe === "prezzo") {
      const ord = tutte.slice().sort((a,b) => (a.eur ?? 1e9) - (b.eur ?? 1e9) || (b.uscita||"").localeCompare(a.uscita||""));
      return `<div class="griglia">${ord.map(s => tessera(c, s, idGrande)).join("")}</div>`;
    }
    let html = "";
    for (const cat of ORDINE_CAT) {
      const qui = tutte.filter(s => catDi(s) === cat)
        .sort((a,b) => (b.uscita||"").localeCompare(a.uscita||"") || a.set.localeCompare(b.set)
          || (a.lingua === b.lingua ? 0 : a.lingua === "en" ? -1 : 1)
          || (varDi(a) ? 1 : 0) - (varDi(b) ? 1 : 0) || perNumero(a,b));
      if (!qui.length) continue;
      html += `<h3>${CAT[cat]} <small class="sd">${new Set(qui.map(s => s.set)).size} set</small></h3><div class="griglia">${qui.map(s => tessera(c, s, idGrande)).join("")}</div>`;
    }
    return html;
  };
  const azioni = () => {
    const fatta = completa(c), s = tutte.find(x => x.id === idGrande);
    const stato = copieTesto(c);
    return `${s ? `<div class="scelta-c">Stampa scelta: ${descStampa(s)} · <b>${s.eur != null ? eur(s.eur) : s.eur_foil != null ? "foil " + eur(s.eur_foil) : "—"}</b></div>` : ""}
      <div class="azioni-c">
        ${fatta ? "" : `<button class="btn ${cercata(c) ? "cerco-on" : "sec"}" data-cerco-f aria-pressed="${cercata(c)}">${cercata(c) ? "✓ La cerco" : "La cerco"}</button>`}
        <button class="btn ${fatta ? "ok" : ""}" data-trova-f>${fatta ? "✓ Trovata: modifica" : "Trovata"}</button>
      </div><div class="stato-c">${stato ? stato + " · " : ""}per ${esc(c.mazzi.join(", "))}<button class="btn sec piccolo" type="button" data-togli-f>Togli dalla wishlist</button></div>`;
  };
  const disegna = () => {
    wrap.innerHTML = `<div class="velo" data-chiudi></div>
      <div class="foglio" role="dialog" aria-label="${esc(c.nome)}">
        <div class="testa"><div><h2>${esc(c.nome)}</h2>
          <div class="sub">${tutte.length} stampe in ${nSet} set${nIt ? ` · ${nIt} in italiano` : ""} · da ${eur(c.prezzo_min)}</div></div>
          <button class="btn sec" data-chiudi aria-label="Chiudi">✕</button></div>
        ${azioni()}
        ${schedaCarta(c, idGrande)}
        <div class="sub">Tocca una stampa per vederla grande: «Trovata» userà quella.</div>
        <div class="ordina"><button data-ordina="set" aria-pressed="${ordineStampe === "set"}">Per scaffale e set</button><button data-ordina="prezzo" aria-pressed="${ordineStampe === "prezzo"}">Per prezzo</button></div>
        ${corpo()}
      </div>`;
    if (zoom) { const im = wrap.querySelector("[data-zoom]"); if (im) im.classList.add("zoom"); }
  };
  const ridisegna = (y) => { const f = wrap.querySelector(".foglio"); const prima = f ? f.scrollTop : 0; disegna(); const g = wrap.querySelector(".foglio"); if (g) g.scrollTop = y == null ? prima : y; };
  disegna();
  wrap.hidden = false;
  wrap.onchange = null;
  wrap.onclick = ev => {
    const t = ev.target.closest("[data-chiudi],[data-ordina],[data-scegli],[data-zoom],[data-lingua],[data-cerco-f],[data-trova-f],[data-togli-f]");
    if (!t) return;
    if (t.hasAttribute("data-chiudi")) { wrap.hidden = true; return; }
    if (t.hasAttribute("data-togli-f")) { wrap.hidden = true; togliCarta(chiave); return; }
    if (t.hasAttribute("data-zoom")) { zoom = !zoom; t.classList.toggle("zoom", zoom); t.title = zoom ? "Tocca per rimpicciolire" : "Tocca per ingrandire"; return; }
    if (t.hasAttribute("data-cerco-f")) { toggleCerco(chiave); ridisegna(); return; }
    if (t.hasAttribute("data-trova-f")) { apriFoglio(chiave, idGrande); return; }
    if (t.hasAttribute("data-lingua")) {
      linguaTesto = t.dataset.lingua;
      try { localStorage.setItem("lista-spesa-lingua-testo", linguaTesto); } catch(e){}
      ridisegna(); return;
    }
    if (t.hasAttribute("data-ordina")) {
      ordineStampe = t.dataset.ordina;
      try { localStorage.setItem("lista-spesa-ordine-stampe", ordineStampe); } catch(e){}
      ridisegna(); return;
    }
    // una stampa: diventa quella scelta, e si torna su a vederla grande
    idGrande = t.dataset.scegli; ridisegna();
    const g = wrap.querySelector(".foglio"); if (g) g.scrollTo({top: 0, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"});
  };
}

// ---------- foglio "trovata" ----------
const descStampa = s => `${s.set_nome || String(s.set||"").toUpperCase()} <span class="mono">${String(s.set||"").toUpperCase()} #${s.numero}</span>${s.variante ? ` · ${s.variante}` : ""}${s.lingua === "it" ? " · IT" : ""}`;
function apriFoglio(chiave, idStampa){
  const c = perChiave[chiave];
  const s = c.stampe.find(x => x.id === idStampa) || null;
  const ultimoNegozio = (() => { try { return localStorage.getItem("lista-spesa-negozio") || ""; } catch(e){ return ""; } })();
  const volute = m => (c.per && c.per[m]) || 1;          // copie volute in quel mazzo (di solito una)
  const mancano = c.mazzi.map(m => ({m, n: Math.max(0, volute(m) - trovatePer(chiave, m) - carrelloPer(chiave, m))})).filter(x => x.n > 0);
  const storico = trovate[chiave] || [];
  const nelC = carrello[chiave] || [];
  const wrap = document.getElementById("foglio-wrap");
  let modo = "carrello";
  try { modo = localStorage.getItem("lista-spesa-modo") || "carrello"; } catch(e){}
  if (modo !== "comprata") modo = "carrello";
  const verbo = () => modo === "carrello" ? "Nel carrello" : "Comprata";
  const scelte = () => mancano.length === 0 ? `<div class="sub">Tutte le copie sono già nel carrello o segnate come comprate.</div>` :
    mancano.length === 1 && c.copie === 1 ? `<button class="btn ${modo === "carrello" ? "carrello" : ""}" data-segna="${mancano[0].m}">${verbo()} <small>per ${mancano[0].m}</small></button>` :
    mancano.map(x => `<button class="btn ${modo === "carrello" ? "carrello" : ""}" data-segna="${x.m}">${verbo()}: una copia <small>per ${x.m}${x.n > 1 ? ` (ne mancano ${x.n})` : ""}</small></button>`).join("") +
      (mancano.length > 1 ? `<button class="btn sec" data-segna="*">${verbo()}: tutte e ${mancano.length} <small>${mancano.map(x => x.m).join(", ")}</small></button>` : "");
  wrap.innerHTML = `<div class="velo" data-chiudi></div>
    <div class="foglio" role="dialog" aria-label="Segna come trovata">
      <h2>${c.nome}</h2>
      <div class="sub">${c.copie === 1 ? "Ne cerchi una" : `Ne cerchi ${c.copie}`} · ${c.mazzi.join(", ")}${s ? `<br>stampa: ${descStampa(s)}` : ""}</div>
      <div class="campi">
        <input id="f-negozio" placeholder="Negozio (facoltativo)" value="${ultimoNegozio.replace(/"/g,"&quot;")}" autocomplete="off">
        <input id="f-prezzo" placeholder="€ prezzo" type="number" min="0" step="0.05" inputmode="decimal" value="${s && s.eur != null ? s.eur : ""}">
      </div>
      <div class="modo" role="group" aria-label="Cosa fai con la carta">
        <button data-modo="carrello" aria-pressed="${modo === "carrello"}">🛒 La metto nel carrello</button>
        <button data-modo="comprata" aria-pressed="${modo === "comprata"}">✓ L'ho già comprata</button></div>
      <div class="scelte"><div id="f-scelte" class="scelte">${scelte()}</div><button class="btn sec" data-chiudi>Annulla</button></div>
      ${nelC.length ? `<div class="storico"><div class="sub">Nel carrello</div>${nelC.map((t,i) =>
        `<div><span>${t.mazzo}${t.negozio ? ` · ${t.negozio}` : ""}${t.prezzo != null && t.prezzo !== "" ? ` · ${eur(Number(t.prezzo))}` : ""}${t.set ? ` · ${descStampa(t)}` : ""}</span><button class="btn sec" data-toglic="${i}">Togli</button></div>`).join("")}</div>` : ""}
      ${storico.length ? `<div class="storico"><div class="sub">Già trovate</div>${storico.map((t,i) =>
        `<div><span>${t.mazzo}${t.negozio ? ` · ${t.negozio}` : ""}${t.prezzo != null && t.prezzo !== "" ? ` · ${eur(Number(t.prezzo))}` : ""}${t.set ? ` · ${descStampa(t)}` : ""}</span><button class="btn sec" data-togli="${i}">Rimuovi</button></div>`).join("")}</div>` : ""}
    </div>`;
  wrap.hidden = false;
  wrap.onclick = async (ev) => {
    const t = ev.target.closest("[data-chiudi],[data-segna],[data-togli],[data-modo],[data-toglic]");
    if (!t) return;
    if (t.hasAttribute("data-chiudi")) { wrap.hidden = true; return; }
    if (t.hasAttribute("data-modo")) {
      modo = t.dataset.modo; try { localStorage.setItem("lista-spesa-modo", modo); } catch(e){}
      wrap.querySelectorAll("[data-modo]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.modo === modo)));
      wrap.querySelector("#f-scelte").innerHTML = scelte(); return;
    }
    if (t.hasAttribute("data-toglic")) {
      carrello[chiave] = (carrello[chiave] || []).filter((_, i) => i !== Number(t.dataset.toglic));
      if (!carrello[chiave].length) delete carrello[chiave];
      wrap.hidden = true; render(); await salvaCarrello(chiave); toast("Tolta dal carrello"); return;
    }
    const negozio = document.getElementById("f-negozio").value.trim();
    const prezzo = document.getElementById("f-prezzo").value;
    try { if (negozio) localStorage.setItem("lista-spesa-negozio", negozio); } catch(e){}
    if (t.hasAttribute("data-togli")) {
      trovate[chiave] = (trovate[chiave] || []).filter((_, i) => i !== Number(t.dataset.togli));
      if (!trovate[chiave].length) delete trovate[chiave];
      wrap.hidden = true; render(); await salvaTrovate(chiave); toast("Rimossa"); return;
    }
    const quali = t.dataset.segna === "*" ? mancano.map(x => x.m) : [t.dataset.segna];
    const voce = m => ({mazzo: m, negozio, prezzo: prezzo === "" ? null : Number(prezzo),
      set: s ? s.set : null, set_nome: s ? s.set_nome : null, numero: s ? s.numero : null, variante: s ? varDi(s) : null,
      lingua: s ? s.lingua : null, quando: new Date().toISOString().slice(0,10)});
    if (modo === "carrello") {
      carrello[chiave] = [...(carrello[chiave] || []), ...quali.map(voce)];
      wrap.hidden = true; render(); await salvaCarrello(chiave);
      toast(quali.length === 1 ? `Nel carrello per ${quali[0]}` : `${quali.length} copie nel carrello`); return;
    }
    trovate[chiave] = [...(trovate[chiave] || []), ...quali.map(voce)];
    wrap.hidden = true; render(); await salvaTrovate(chiave);
    toast(quali.length === 1 ? `Comprata per ${quali[0]}` : `Comprate ${quali.length} copie`);
  };
}
// avviso in basso; con "annulla" mostra il pulsante Annulla, che chiama quella funzione
let toastT = null, toastAnnulla = null;
function toast(msg, ms, annulla, debole){
  const el = document.getElementById("toast");
  if (debole && toastAnnulla && !el.hidden) return;          // un avviso di servizio non copre un «Annulla» ancora valido
  toastAnnulla = annulla || null;
  el.innerHTML = `<span>${esc(msg)}</span>${annulla ? `<button type="button" data-annulla>Annulla</button>` : ""}`;
  el.hidden = false; clearTimeout(toastT);
  toastT = setTimeout(() => { el.hidden = true; toastAnnulla = null; }, ms || (annulla ? 5000 : 1800));
}

// ---------- wishlist: mazzi importati da Archidekt + carte aggiunte a mano ----------
// "wishlist": un documento per mazzo, {carte: [{nome, copie}], importato, file}
// "aggiunte": un documento per carta e mazzo, {nome, mazzo, copie}; restano anche quando
// si reimporta Archidekt, e se la carta compare poi nella Wishlist di quel mazzo non si conta due volte.
// "escluse": le carte tolte a mano dalla wishlist, {nome, quando}: non tornano al prossimo import,
// finche' non le rimetti dal Menu.
let wl = null, aggiunte = null, escluse = {};   // null: non ancora arrivate
let ridisegnaMenu = null;                 // se il menu e' aperto, si ridisegna quando cambiano i dati
function collegaWishlist(){
  const errore = e => {
    statoCarico = `<div><b>Non riesco a leggere i dati salvati online</b><br>${esc(e && e.message || e)}<br><br>Controlla la connessione. Se non usi l'app da più di una settimana, il progetto Supabase può essere in pausa: riattivalo dal sito di Supabase («Resume project»), poi ricarica.<br><br><button class="btn" type="button" onclick="location.reload()">Ricarica</button></div>`;
    if (!datiPronti) render();
  };
  db.collection("wishlist").onSnapshot(snap => { wl = {}; snap.docs.forEach(d => { wl[d.id] = d.data(); }); ricalcola(); if (ridisegnaMenu) ridisegnaMenu(); }, errore);
  db.collection("aggiunte").onSnapshot(snap => { aggiunte = {}; snap.docs.forEach(d => { aggiunte[d.id] = d.data(); }); ricalcola(); if (ridisegnaMenu) ridisegnaMenu(); }, errore);
  db.collection("escluse").onSnapshot(snap => { escluse = {}; snap.docs.forEach(d => { escluse[d.id] = d.data() || {}; }); ricalcola(); if (ridisegnaMenu) ridisegnaMenu(); }, err => {});
}
function vociWishlist(){
  const per = {};                        // mazzo -> Map(chiave -> {nome, copie})
  for (const [mazzo, d] of Object.entries(wl || {})) {
    const m = per[mazzo] = per[mazzo] || new Map();
    for (const x of (d.carte || [])) {
      const k = Scry.chiave(x.nome), e = m.get(k);
      if (e) e.copie += Number(x.copie) || 1; else m.set(k, {nome: x.nome, copie: Number(x.copie) || 1});
    }
  }
  for (const a of Object.values(aggiunte || {})) {
    const m = per[a.mazzo] = per[a.mazzo] || new Map();
    const k = Scry.chiave(a.nome);
    if (!m.has(k)) m.set(k, {nome: a.nome, copie: Number(a.copie) || 1});
  }
  const voci = new Map();
  for (const mazzo of Object.keys(per).sort()) for (const [k, x] of per[mazzo]) {
    if (escluse[k]) continue;
    const v = voci.get(k) || {nome: x.nome, copie: 0, mazzi: [], per: {}};
    v.copie += x.copie; if (!v.mazzi.includes(mazzo)) v.mazzi.push(mazzo);
    v.per[mazzo] = (v.per[mazzo] || 0) + x.copie;
    voci.set(k, v);
  }
  return [...voci.values()].sort((a,b) => a.nome.localeCompare(b.nome));
}
let giro = 0, ultimaFirma = null, giaRiletto = false, riprova = null;
// le scritture arrivano a raffica (un import scrive un documento per mazzo): si aspetta che si calmino
let attesaRicalcolo = null;
function ricalcola(forza){
  clearTimeout(attesaRicalcolo);
  attesaRicalcolo = setTimeout(() => ricalcolaOra(forza), 250);
}
function ricalcolaOra(forza){
  if (wl === null || aggiunte === null) return;
  const voci = vociWishlist();
  const firma = JSON.stringify(voci);
  if (firma === ultimaFirma && !forza) return;
  ultimaFirma = firma;
  caricaCarte(voci);
}
async function caricaCarte(voci){
  const mio = ++giro;
  if (!carte.length && voci.length) datiPronti = false;        // niente da mostrare nel frattempo: si vede l'avanzamento
  if (!datiPronti) { statoCarico = `Carico le carte da Scryfall…`; render(); }
  const r = await Scry.costruisci(voci, (n, t) => {
    if (mio !== giro) return;
    if (!datiPronti) { statoCarico = `Carico le carte da Scryfall: ${n} di ${t}…`; render(); }
    else if (n < t) toast(`Aggiorno da Scryfall: ${n} di ${t}`, 4000, null, true);
  }, () => mio === giro);
  if (!r || mio !== giro) return;
  carte = r.carte;
  perChiave = Object.fromEntries(carte.map(c => [c.chiave, c]));
  mazziTutti = [...new Set(carte.flatMap(c => c.mazzi))].sort();
  generato = carte.some(c => !c.problema) ? new Date(Math.min(...carte.filter(c => !c.problema).map(c => c.aggiornata))).toLocaleString("it-IT", {dateStyle: "short", timeStyle: "short"}) : null;
  const primo = !giaRiletto && carte.length > 0;
  if (primo) giaRiletto = true;
  datiPronti = true; riempiMazzi(); render();
  if (r.mancanti.length) {
    toast(`Scryfall non ha risposto per ${r.mancanti.length} ${r.mancanti.length === 1 ? "carta" : "carte"}: riprovo fra un minuto`, 6000, null, true);
    clearTimeout(riprova); riprova = setTimeout(() => ricalcola(true), 60000);
  } else if (r.errori.length) toast(`Non trovate su Scryfall: ${r.errori.join(", ")}`, 6000, null, true);
  else if (!primo && carte.length) toast("Carte aggiornate", 1500, null, true);
  if (primo && db && db.ricarica) db.ricarica();       // ora si possono riconoscere le cercate uscite dalla wishlist
}

// ---------- accesso: email e password, oppure link via email (solo con Supabase configurato) ----------
// Due schermate separate: «Entra» (chi ha già l'account) e «Crea account».
let modoAccesso = "entra";
function mostraAccesso(modo, email){
  if (modo) modoAccesso = modo;
  const crea = modoAccesso === "crea";
  const em = `<input id="acc-email" name="email" type="email" autocomplete="username" inputmode="email" placeholder="Email" value="${esc(email || "")}" required>`;
  statoCarico = crea
    ? `<form class="accesso" id="acc-form" autocomplete="on">
    <h2>Crea un account</h2>
    <p>Scegli l'email e una password: ti arriva una mail per confermare l'account, poi entri con quelle.</p>
    ${em}
    <input id="acc-pw" name="password" type="password" autocomplete="new-password" placeholder="Password (almeno 6 caratteri)" minlength="6" required>
    <input id="acc-pw2" name="password2" type="password" autocomplete="new-password" placeholder="Ripeti la password" minlength="6" required>
    <button class="btn" type="submit">Crea account</button>
    <div class="sub" id="acc-msg" role="status"></div>
    <p class="acc-cambio">Hai già un account? <button class="link" type="button" data-acc="vai-entra">Entra</button></p></form>`
    : `<form class="accesso" id="acc-form" autocomplete="on">
    <h2>Entra</h2>
    <p>Wishlist, carte cercate, carrello e trovate restano legati al tuo account e li vedi uguali dal telefono e dal PC.</p>
    ${em}
    <input id="acc-pw" name="password" type="password" autocomplete="current-password" placeholder="Password" minlength="6">
    <button class="btn" type="submit">Entra</button>
    <div class="acc-altro">
      <button class="btn sec piccolo" type="button" data-acc="dimenticata">Password dimenticata?</button>
      <button class="btn sec piccolo" type="button" data-acc="link">Entra con un link via email</button>
    </div>
    <div class="sub" id="acc-msg" role="status"></div>
    <p class="acc-cambio">Non hai ancora un account? <button class="link" type="button" data-acc="vai-crea">Crea account</button></p></form>`;
  render();
  if (modo) { const i = document.getElementById(email ? "acc-pw" : "acc-email"); if (i) i.focus(); }
}
async function azioneAccesso(cosa){
  const email = document.getElementById("acc-email").value.trim();
  if (cosa === "vai-crea" || cosa === "vai-entra") { mostraAccesso(cosa.slice(4), email); return; }
  const pw = document.getElementById("acc-pw").value;
  const msg = document.getElementById("acc-msg");
  if (!email) { msg.textContent = "Scrivi prima l'email."; return; }
  if ((cosa === "entra" || cosa === "crea") && pw.length < 6) { msg.textContent = "Scrivi la password: almeno 6 caratteri."; return; }
  if (cosa === "crea" && pw !== document.getElementById("acc-pw2").value) { msg.textContent = "Le due password non sono uguali."; return; }
  msg.textContent = "Un momento…";
  try {
    if (cosa === "entra") { await Store.entra(email, pw); msg.textContent = "Dentro!"; location.reload(); return; }
    if (cosa === "crea") {
      const r = await Store.creaAccount(email, pw);
      if (r === "dentro") { location.reload(); return; }
      msg.textContent = r === "esiste"
        ? "Esiste già un account con questa email: premi «Entra» qui sotto. Se non hai mai scelto una password (entravi col link), da lì premi «Password dimenticata?» per sceglierla."
        : `Ti ho mandato una mail a ${email}: apri il link per confermare l'account, poi torna qui ed entra con email e password.`;
      return;
    }
    if (cosa === "dimenticata") { await Store.passwordDimenticata(email); msg.textContent = `Ti ho mandato una mail a ${email}: apri il link e potrai scegliere la password nuova. Se non la vedi, guarda nello spam.`; return; }
    if (cosa === "link") { await Store.accedi(email); msg.textContent = `Fatto: apri il link che ti è arrivato a ${email}. Se non lo vedi, guarda nello spam.`; return; }
  } catch(err){ msg.textContent = (err && err.message) || String(err); }
}
document.getElementById("lista").addEventListener("submit", e => {
  if (e.target.id !== "acc-form") return;
  e.preventDefault(); azioneAccesso(modoAccesso);
});
document.getElementById("lista").addEventListener("click", e => {
  const b = e.target.closest("[data-acc]"); if (b) azioneAccesso(b.dataset.acc);
});

// ---------- scegliere o cambiare la password ----------
// Si apre dal Menu, e da solo quando si arriva dal link "password dimenticata".
function apriPassword(recupero){
  const wrap = document.getElementById("foglio-wrap");
  wrap.innerHTML = `<div class="velo" ${recupero ? "" : "data-chiudi"}></div>
    <form class="foglio" role="dialog" aria-label="Password" id="pw-form">
      <h2>${recupero ? "Scegli la password nuova" : "Password"}</h2>
      <div class="sub">${recupero ? "Sei entrato col link della mail. Scegli la password con cui entrerai d'ora in poi." : "Scegli la password con cui entrare, insieme alla tua email. Se finora entravi col link, da adesso puoi usare anche questa."}</div>
      <input type="email" autocomplete="username" value="${esc(db && db.utente || "")}" hidden readonly>
      <div class="campi" style="grid-template-columns:1fr">
        <input id="pw-1" type="password" autocomplete="new-password" placeholder="Password nuova (almeno 6 caratteri)" minlength="6" required>
        <input id="pw-2" type="password" autocomplete="new-password" placeholder="Ripeti la password" minlength="6" required>
      </div>
      <div class="scelte"><button class="btn" type="submit">Salva la password</button>${recupero ? "" : `<button class="btn sec" type="button" data-chiudi>Annulla</button>`}</div>
      <div class="sub" id="pw-msg" role="status"></div>
    </form>`;
  wrap.hidden = false;
  wrap.onclick = e => { if (e.target.closest("[data-chiudi]")) wrap.hidden = true; };
  wrap.onsubmit = async e => {
    e.preventDefault();
    const p1 = wrap.querySelector("#pw-1").value, p2 = wrap.querySelector("#pw-2").value, msg = wrap.querySelector("#pw-msg");
    if (p1.length < 6) { msg.textContent = "Almeno 6 caratteri."; return; }
    if (p1 !== p2) { msg.textContent = "Le due password non sono uguali."; return; }
    msg.textContent = "Salvo…";
    try { await Store.cambiaPassword(p1); wrap.hidden = true; toast("Password salvata", 2500); }
    catch(err){ msg.textContent = (err && err.message) || String(err); }
  };
}

// ---------- import dell'export di Archidekt ----------
function righeCsv(t){
  const rows = []; let row = [], f = "", q = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (q) { if (ch === '"') { if (t[i+1] === '"') { f += '"'; i++; } else q = false; } else f += ch; }
    else if (ch === '"') q = true;
    else if (ch === ",") { row.push(f); f = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && t[i+1] === "\n") i++; row.push(f); rows.push(row); row = []; f = ""; }
    else f += ch;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  return rows.filter(r => r.length > 1);
}
// La categoria Wishlist la scrivi a mano su Archidekt: si riconosce anche scritta male (Whishlist, Whislist…)
const eWishlist = c => c.toLowerCase().replace(/[^a-z]/g, "").replace(/h/g, "") === "wislist";
function wishlistDaCsv(testo){
  const rows = righeCsv(testo.replace(/^﻿/, ""));
  if (!rows.length) return [];
  const h = rows[0].map(x => x.trim());
  // Nell'export di Archidekt manca una virgola: "Edition dateCategory" e' una colonna sola
  // nell'intestazione, quindi dopo di lei le colonne dei dati sono spostate di una.
  let iCat = h.indexOf("Category"), sposta = 0;
  if (iCat < 0) { iCat = h.findIndex(x => /Category$/.test(x) && !/^Secondary/i.test(x)); sposta = 1; }
  const iSec = h.findIndex(x => /^Secondary categories$/i.test(x));
  const iQ = h.indexOf("Quantity"), iN = h.indexOf("Name");
  if (iCat < 0 || iN < 0) throw new Error("non sembra un export CSV di Archidekt");
  const fuori = [];
  for (const r of rows.slice(1)) {
    const cat = (r[iCat + sposta] || "") + "," + (iSec >= 0 ? (r[iSec + sposta] || "") : "");
    if (cat.split(",").some(x => eWishlist(x.trim()))) fuori.push({nome: r[iN], copie: Number(r[iQ]) || 1});
  }
  return fuori;
}
const nomeMazzo = fn => fn.split("/").pop().replace(/\.csv$/i, "").replace(/_/g, " ").replace(/\s+/g, " ").trim();
async function importaArchidekt(file){
  const mazzi = {}; let intero = false;
  if (/\.zip$/i.test(file.name)) {
    if (!window.JSZip) throw new Error("manca la libreria per leggere gli zip");
    const zip = await JSZip.loadAsync(file); intero = true;
    for (const f of Object.values(zip.files)) if (!f.dir && /\.csv$/i.test(f.name)) mazzi[nomeMazzo(f.name)] = wishlistDaCsv(await f.async("string"));
  } else mazzi[nomeMazzo(file.name)] = wishlistDaCsv(await file.text());
  const nomi = Object.keys(mazzi);
  if (!nomi.length) throw new Error("nello zip non ci sono file CSV");
  const quando = new Date().toISOString().slice(0, 10);
  for (const m of nomi) await db.collection("wishlist").doc(m).set({carte: mazzi[m], importato: quando, file: file.name});
  let tolti = 0;
  if (intero) for (const m of Object.keys(wl || {})) if (!mazzi[m]) { await db.collection("wishlist").doc(m).delete(); tolti++; }
  const n = nomi.reduce((t, m) => t + mazzi[m].length, 0);
  return `${nomi.length} ${nomi.length === 1 ? "mazzo importato" : "mazzi importati"}, ${n} carte in Wishlist${tolti ? `, ${tolti} mazzi tolti perché non più nell'export` : ""}`;
}

// ---------- salvataggio: copia di tutti i dati, e ripristino ----------
const COLLEZIONI = ["wishlist", "aggiunte", "escluse", "cercate", "carrello", "trovate"];
function leggiUnaVolta(n){
  return new Promise((ok, ko) => {
    let stop = null, fatto = false;
    stop = db.collection(n).onSnapshot(snap => {
      if (fatto) return; fatto = true;
      const x = {}; snap.docs.forEach(d => { x[d.id] = d.data(); });
      setTimeout(() => stop && stop(), 0); ok(x);
    }, ko);
  });
}
async function esportaTutto(){
  const out = {versione: 1, esportato: new Date().toISOString(), collezioni: {}};
  for (const n of COLLEZIONI) out.collezioni[n] = await leggiUnaVolta(n);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify(out, null, 1)], {type: "application/json"}));
  a.download = `lista-della-spesa-${out.esportato.slice(0, 10)}.json`;
  document.body.appendChild(a); a.click(); a.remove();
}
async function importaSalvataggio(file){
  const j = JSON.parse(await file.text());
  if (!j || !j.collezioni) throw new Error("non è un salvataggio della Lista della spesa");
  let n = 0;
  for (const c of COLLEZIONI) for (const [id, d] of Object.entries(j.collezioni[c] || {})) { await db.collection(c).doc(id).set(d); n++; }
  return `${n} documenti caricati`;
}

// ---------- aggiungere una carta a mano, e toglierla ----------
const idAggiunta = (nome, mazzo) => `${Scry.chiave(nome)}@${Scry.chiave(mazzo)}`;
let suggTimer = null;
function suggerisci(wrap){
  wrap.oninput = e => {
    if (e.target.id !== "m-nome") return;
    clearTimeout(suggTimer);
    const q = e.target.value.trim();
    suggTimer = setTimeout(async () => {
      try { const s = await Scry.suggerimenti(q); const dl = wrap.querySelector("#m-sugg"); if (dl) dl.innerHTML = s.map(n => `<option value="${esc(n)}">`).join(""); } catch(err){}
    }, 250);
  };
}
function apriAggiungi(){
  if (!db) { toast("Prima entra con il tuo account", 2500); return; }
  const wrap = document.getElementById("foglio-wrap");
  const ultimo = (() => { try { return localStorage.getItem("lista-spesa-ultimo-mazzo") || ""; } catch(e){ return ""; } })();
  wrap.innerHTML = `<div class="velo" data-chiudi></div>
    <form class="foglio" role="dialog" aria-label="Aggiungi una carta" id="agg-form" autocomplete="off">
      <div class="testa"><div><h2>Aggiungi una carta</h2>
        <div class="sub">Il nome in inglese: mentre scrivi, i suggerimenti arrivano da Scryfall. La carta resta in wishlist anche quando reimporti Archidekt.</div></div>
        <button class="btn sec" type="button" data-chiudi aria-label="Chiudi">✕</button></div>
      <div class="campi tre">
        <input id="m-nome" list="m-sugg" placeholder="Nome della carta" required autofocus>
        <input id="m-mazzo" list="m-mazzi" placeholder="Mazzo" value="${esc(mazziTutti.includes(ultimo) ? ultimo : "")}" required>
        <input id="m-copie" type="number" min="1" step="1" value="1" inputmode="numeric" aria-label="Copie">
      </div>
      <datalist id="m-sugg"></datalist>
      <datalist id="m-mazzi">${mazziTutti.map(m => `<option value="${esc(m)}">`).join("")}</datalist>
      <div class="scelte"><button class="btn" type="submit">Aggiungi alla wishlist</button><button class="btn sec" type="button" data-chiudi>Annulla</button></div>
      <div class="sub" id="agg-msg" role="status"></div>
    </form>`;
  wrap.hidden = false;
  suggerisci(wrap);
  wrap.onchange = null;
  wrap.onclick = e => { if (e.target.closest("[data-chiudi]")) wrap.hidden = true; };
  wrap.onsubmit = async e => {
    e.preventDefault();
    const nome = wrap.querySelector("#m-nome").value.trim(), mazzo = wrap.querySelector("#m-mazzo").value.trim();
    const copie = Math.max(1, Number(wrap.querySelector("#m-copie").value) || 1);
    const msg = wrap.querySelector("#agg-msg");
    if (!nome || !mazzo) { msg.textContent = "Scrivi il nome della carta e il mazzo."; return; }
    const k = Scry.chiave(nome);
    if (perChiave[k] && perChiave[k].mazzi.includes(mazzo)) { msg.textContent = `${nome} è già in wishlist per ${mazzo}.`; return; }
    msg.textContent = "Salvo…";
    try {
      try { localStorage.setItem("lista-spesa-ultimo-mazzo", mazzo); } catch(err){}
      const eraEsclusa = escluse[k] ? {...escluse[k]} : null;
      if (eraEsclusa) await db.collection("escluse").doc(k).delete();      // se l'avevi tolta, torna
      await db.collection("aggiunte").doc(idAggiunta(nome, mazzo)).set({nome, mazzo, copie});
      wrap.hidden = true;
      toast(`${nome}: aggiunta per ${mazzo}`, 5000, async () => {
        try { await db.collection("aggiunte").doc(idAggiunta(nome, mazzo)).delete(); if (eraEsclusa) await db.collection("escluse").doc(k).set(eraEsclusa); }
        catch(err){ toast("Non è andata: " + (err && err.message || err), 4000); }
      });
    } catch(err){ msg.textContent = "Non è andata: " + (err && err.message || err); }
  };
  setTimeout(() => { const i = wrap.querySelector("#m-nome"); if (i) i.focus(); }, 50);
}
// Togliere una carta: le sue aggiunte a mano si cancellano; se viene da Archidekt finisce fra le
// escluse, cosi' non torna al prossimo import (dal Menu si puo' rimettere).
async function togliCarta(chiave){
  const c = perChiave[chiave]; if (!c || !db) return;
  const agg = Object.entries(aggiunte || {}).filter(([id, a]) => Scry.chiave(a.nome) === chiave).map(([id, a]) => [id, {...a}]);
  const daArchidekt = Object.values(wl || {}).some(d => (d.carte || []).some(x => Scry.chiave(x.nome) === chiave));
  try {
    for (const [id] of agg) await db.collection("aggiunte").doc(id).delete();
    if (daArchidekt) await db.collection("escluse").doc(chiave).set({nome: c.nome, quando: oggi()});
  } catch(err){ toast("Non è andata: " + (err && err.message || err), 4000); return; }
  toast(`${c.nome}: tolta dalla wishlist`, 6000, async () => {
    try {
      if (daArchidekt) await db.collection("escluse").doc(chiave).delete();
      for (const [id, a] of agg) await db.collection("aggiunte").doc(id).set(a);
    } catch(err){ toast("Non è andata: " + (err && err.message || err), 4000); }
  });
}

// ---------- menu ----------
function apriMenu(){
  const wrap = document.getElementById("foglio-wrap");
  const disegna = () => {
    const online = db && db.modo === "online";
    const mazziWl = Object.entries(wl || {}).sort((a,b) => a[0].localeCompare(b[0]));
    const nAgg = Object.keys(aggiunte || {}).length;
    const tolte = Object.entries(escluse || {}).sort((a,b) => (a[1].nome || "").localeCompare(b[1].nome || ""));
    wrap.innerHTML = `<div class="velo" data-chiudi></div>
      <div class="foglio menu" role="dialog" aria-label="Menu">
        <div class="testa"><div><h2>Menu</h2></div><button class="btn sec" data-chiudi aria-label="Chiudi">✕</button></div>

        <section class="blocco">
          <h3>Account</h3>
          <div class="sub">${!db ? "Non sei collegato." : online ? `Collegato come <b>${esc(db.utente)}</b>: telefono e PC vedono gli stessi dati.` : Store.configurato ? "Collegato." : "Dati salvati solo in questo browser (Supabase non configurato: vedi la guida)."}</div>
          ${online ? `<div class="due"><button class="btn sec" data-password>Cambia password</button><button class="btn sec" data-esci>Esci</button></div>` : ""}
        </section>

        <section class="blocco">
          <h3>Wishlist</h3>
          <div class="sub">Viene dall'export di Archidekt (le carte nella categoria Wishlist). Uno zip con tutti i mazzi la sostituisce tutta, un CSV solo il suo mazzo.${nAgg ? ` ${nAgg} ${nAgg === 1 ? "carta aggiunta" : "carte aggiunte"} a mano col pulsante «+».` : ""}</div>
          <label class="btn" style="display:block;text-align:center">Importa l'export di Archidekt<input type="file" accept=".zip,.csv" data-importa hidden></label>
          ${mazziWl.length ? `<div class="storico">${mazziWl.map(([m, d]) => `<div><span>${esc(m)} <small class="sd">${(d.carte || []).length} carte${d.importato ? ` · ${d.importato}` : ""}</small></span><button class="btn sec" data-toglimazzo="${esc(m)}">Togli</button></div>`).join("")}</div>` : ""}
          ${tolte.length ? `<details class="piega"><summary>Carte tolte a mano <small class="sd">${tolte.length}</small></summary>
            <div class="sub">Non tornano quando reimporti Archidekt. «Rimetti» le fa tornare.</div>
            <div class="storico">${tolte.map(([k, x]) => `<div><span>${esc(x.nome || k)}${x.quando ? ` <small class="sd">${esc(x.quando)}</small>` : ""}</span><button class="btn sec" data-rimetti="${esc(k)}">Rimetti</button></div>`).join("")}</div></details>` : ""}
        </section>

        <section class="blocco">
          <h3>Aspetto</h3>
          <div class="ordina">${Object.entries(ASPETTI).map(([k, n]) => `<button data-aspetto="${k}" aria-pressed="${aspetto === k}">${n}</button>`).join("")}</div>
          <div class="sub">Cambia solo come si vedono le carte. <b>Elenco</b>: righe compatte, con il segnalibro e «Trovata» sulla riga. <b>Raccoglitore</b>: griglia di immagini grandi; le azioni sono nella scheda della carta.</div>
        </section>

        <section class="blocco">
          <h3>Dati</h3>
          <div class="sub">Prezzi e stampe arrivano da Scryfall e si rinnovano ogni 24 ore${generato ? ` (ultimi: ${generato})` : ""}.</div>
          <button class="btn sec" data-aggiorna style="width:100%">Aggiorna adesso da Scryfall</button>
          <div class="due" style="margin-top:8px"><button class="btn sec" data-esporta>Scarica una copia</button>
            <label class="btn sec" style="text-align:center">Carica una copia<input type="file" accept=".json,application/json" data-salvataggio hidden></label></div>
          <div class="sub" style="margin-top:6px">La copia è un file con wishlist, carte cercate, carrello e trovate: serve come salvataggio.</div>
        </section>

        <details class="piega blocco"><summary>Come funziona</summary>
          <div class="sub">Una carta fa questo giro:</div>
          <ol class="sub passi">
            <li><b>Wishlist</b>: tutte le carte che vorresti. Il segnalibro (o «La cerco» nella scheda) la mette fra quelle che cerchi.</li>
            <li><b>La cerco</b>: quelle che cerchi in negozio o online. «Copia per i siti» prepara la lista per Cardmarket e CardTrader.</li>
            <li><b>Carrello</b>: trovate, con prezzo e negozio, ma non ancora comprate. Qui vedi il totale e il confronto col prezzo di riferimento.</li>
            <li><b>Trovate</b>: comprate. «Comprate tutte» nel carrello le sposta qui.</li>
          </ol>
          <div class="sub">Tocca una carta per la scheda: immagine grande, testo, tutte le stampe, «Trovata» e «Togli dalla wishlist». Il pulsante «+» in alto aggiunge una carta a mano.</div>
        </details>
      </div>`;
  };
  disegna();
  wrap.hidden = false;
  const ridisegna = () => {
    if (wrap.hidden || !wrap.querySelector(".foglio.menu")) { ridisegnaMenu = null; return; }
    const f = wrap.querySelector(".foglio"); const y = f ? f.scrollTop : 0;
    const aperte = [...wrap.querySelectorAll("details[open]")].map((d, i) => d.querySelector("summary").textContent);
    disegna();
    const g = wrap.querySelector(".foglio"); if (g) g.scrollTop = y;
    wrap.querySelectorAll("details").forEach(d => { if (aperte.includes(d.querySelector("summary").textContent)) d.open = true; });
  };
  ridisegnaMenu = ridisegna;
  wrap.oninput = null; wrap.onsubmit = null;
  wrap.onchange = async e => {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    if (!db) { toast("Prima entra con il tuo account, poi carica il file", 3000); e.target.value = ""; return; }
    try {
      if (e.target.hasAttribute("data-importa")) toast(await importaArchidekt(f), 4000);
      if (e.target.hasAttribute("data-salvataggio")) toast(await importaSalvataggio(f), 3000);
    } catch(err){ toast("Non riesco a leggere il file: " + (err && err.message || err), 5000); }
    e.target.value = ""; ridisegna();
  };
  wrap.onclick = async e => {
    // "button[data-aspetto]": anche <body> ha data-aspetto, e closest() salirebbe fino a li'
    const t = e.target.closest("[data-chiudi],[data-esci],[data-password],[data-toglimazzo],[data-rimetti],[data-aggiorna],[data-esporta],button[data-aspetto]");
    if (!t || !wrap.contains(t)) return;
    if (t.hasAttribute("data-chiudi")) { wrap.hidden = true; ridisegnaMenu = null; return; }
    if (t.hasAttribute("data-aspetto")) { scegliAspetto(t.dataset.aspetto); ridisegna(); return; }
    try {
      if (t.hasAttribute("data-esci")) return db.esci();
      if (t.hasAttribute("data-password")) { ridisegnaMenu = null; apriPassword(false); return; }
      if (t.hasAttribute("data-toglimazzo")) {
        const m = t.dataset.toglimazzo, prima = wl && wl[m] ? JSON.parse(JSON.stringify(wl[m])) : null;
        await db.collection("wishlist").doc(m).delete();
        toast(`${m}: mazzo tolto dalla wishlist`, 6000, prima ? async () => { try { await db.collection("wishlist").doc(m).set(prima); } catch(err){ toast("Non è andata: " + (err && err.message || err), 4000); } } : null);
      }
      if (t.hasAttribute("data-rimetti")) { const k = t.dataset.rimetti, nome = escluse[k] && escluse[k].nome; await db.collection("escluse").doc(k).delete(); toast(`${nome || k}: torna in wishlist`, 2500); }
      if (t.hasAttribute("data-aggiorna")) { Scry.svuotaCache(); wrap.hidden = true; ridisegnaMenu = null; ricalcola(true); return; }
      if (t.hasAttribute("data-esporta")) { await esportaTutto(); return; }
    } catch(err){ toast("Non è andata: " + (err && err.message || err), 5000); }
    setTimeout(ridisegna, 300);
  };
}
document.getElementById("apri-menu").addEventListener("click", apriMenu);
document.getElementById("aggiungi").addEventListener("click", apriAggiungi);

// ---------- eventi ----------
const oggi = () => new Date().toISOString().slice(0,10);
function impostaCerco(ch, si){
  if (si) cercate[ch] = cercate[ch] || {quando: oggi()}; else delete cercate[ch];
  render(); inCoda(() => salvaCercata(ch));
}
function toggleCerco(ch){
  const nome = perChiave[ch] ? perChiave[ch].nome : ch;
  const ora = !cercate[ch];
  impostaCerco(ch, ora);
  toast(ora ? `${nome}: la cerchi` : `${nome}: non la cerchi più`, 4000, () => impostaCerco(ch, !ora));
}
const lista = document.getElementById("lista");
lista.addEventListener("click", ev => {
  const cb = ev.target.closest("[data-cerco]");
  if (cb) { toggleCerco(cb.dataset.cerco); return; }
  const b = ev.target.closest("[data-trova]");
  if (b) { const r = b.closest("[data-stampa]"); apriFoglio(b.dataset.trova, r && r.dataset.stampa); return; }
  const st = ev.target.closest("[data-stampe]");
  if (st) { apriStampe(st.dataset.stampe, st.dataset.img); return; }
  const t = ev.target.closest("[data-toglic],[data-compra],[data-svuota]");
  if (t) azioneCarrello(t);
});
lista.addEventListener("change", ev => { const inp = ev.target.closest("[data-prezzo]"); if (inp) cambiaPrezzo(inp); });
lista.addEventListener("focusout", () => setTimeout(() => { if (rimandato) render(); }, 0));
lista.addEventListener("toggle", ev => {
  const d = ev.target; if (d.tagName !== "DETAILS") return;
  const id = d.dataset.gruppo;
  if (perSetChiusi(id)) { if (d.open) aperti.add(id); else aperti.delete(id); }
  else { if (d.open) chiusi.delete(id); else chiusi.add(id); }
}, true);
// sezioni (in alto nel Raccoglitore, in basso nell'Elenco), viste, riepilogo, barra del carrello
document.getElementById("nav").addEventListener("click", e => {
  const b = e.target.closest("[data-sezione]"); if (b) scegliSezione(b.dataset.sezione);
});
document.getElementById("viste").addEventListener("click", e => {
  const b = e.target.closest("[data-vista]"); if (!b) return;
  F.vista = b.dataset.vista; salvaFiltri(); render();
});
document.getElementById("riepilogo").addEventListener("click", e => {
  if (e.target.closest("#esporta")) apriEsporta();
});
document.getElementById("aspetto").addEventListener("click", () => {
  const a = aspetto === "elenco" ? "raccoglitore" : "elenco";
  scegliAspetto(a); toast(`Aspetto: ${ASPETTI[a]}`);
});
document.getElementById("toast").addEventListener("click", e => {
  if (!e.target.closest("[data-annulla]")) return;
  const f = toastAnnulla; toastAnnulla = null; document.getElementById("toast").hidden = true;
  if (f) f();
});
// filtri
const sel = document.getElementById("mazzo");
function riempiMazzi(){
  const v = F.mazzo;
  sel.innerHTML = `<option value="">Tutti i mazzi</option>` + mazziTutti.map(m => `<option>${esc(m)}</option>`).join("");
  sel.value = mazziTutti.includes(v) ? v : "";
}
const selCat = document.getElementById("categoria");
if (!["set","colore","mazzo"].includes(F.vista)) F.vista = "set";
document.getElementById("cerca").value = F.cerca; sel.value = F.mazzo; document.getElementById("maxprezzo").value = F.maxprezzo;
selCat.value = ORDINE_CAT.includes(F.categoria) ? F.categoria : "";
document.getElementById("soloit").checked = F.soloit; document.getElementById("nascondi").checked = F.nascondi;
document.getElementById("estesi").checked = F.estesi !== false;
document.getElementById("cerca").addEventListener("input", e => { F.cerca = e.target.value; salvaFiltri(); render(); });
sel.addEventListener("change", e => { F.mazzo = e.target.value; salvaFiltri(); render(); });
selCat.addEventListener("change", e => { F.categoria = e.target.value; salvaFiltri(); render(); });
document.getElementById("maxprezzo").addEventListener("input", e => { F.maxprezzo = e.target.value; salvaFiltri(); render(); });
document.getElementById("soloit").addEventListener("change", e => { F.soloit = e.target.checked; salvaFiltri(); render(); });
document.getElementById("nascondi").addEventListener("change", e => { F.nascondi = e.target.checked; salvaFiltri(); render(); });
document.getElementById("estesi").addEventListener("change", e => { F.estesi = e.target.checked; salvaFiltri(); render(); });
document.getElementById("apri-filtri").addEventListener("click", e => {
  const x = document.getElementById("filtri-extra"); x.hidden = !x.hidden; e.currentTarget.setAttribute("aria-expanded", String(!x.hidden));
  misuraAlto();
});
document.addEventListener("keydown", e => { if (e.key === "Escape") document.getElementById("foglio-wrap").hidden = true; });
// Il tasto Indietro del telefono chiude il foglio aperto, invece di uscire dall'app.
(function(){
  const wrap = document.getElementById("foglio-wrap");
  let segnato = false, daIndietro = false;
  new MutationObserver(() => {
    if (!wrap.hidden && !segnato) { segnato = true; history.pushState({foglio: true}, ""); }
    else if (wrap.hidden && segnato) { segnato = false; if (!daIndietro && history.state && history.state.foglio) history.back(); }
    daIndietro = false;
  }).observe(wrap, {attributes: true, attributeFilter: ["hidden"]});
  addEventListener("popstate", () => { if (segnato && !wrap.hidden) { daIndietro = true; wrap.hidden = true; } });
})();
render();
collegaDb();
document.addEventListener("visibilitychange", () => { if (!document.hidden && db && db.ricarica) db.ricarica(); });
})();

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
    }, err => { db = null; });
  } catch(e){ db = null; }
}
async function salvaTrovate(chiave){
  const lista = trovate[chiave] || [];
  scriviLocale();
  if (cercate[chiave] && perChiave[chiave] && completa(perChiave[chiave])) { delete cercate[chiave]; salvaCercata(chiave); }
  if (db) {
    try {
      const doc = db.collection("trovate").doc(chiave);
      if (lista.length) await doc.set({nome: perChiave[chiave].nome, copie_volute: perChiave[chiave].copie, trovate: lista});
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
let ridisegnaCarrello = null;      // se il foglio del carrello e' aperto, si ridisegna quando arrivano dati nuovi
function collegaCarrello(){
  db.collection("carrello").onSnapshot(snap => {
    const nuovo = {};
    snap.docs.forEach(d => { const b = d.data(); if (b && Array.isArray(b.voci) && b.voci.length) nuovo[d.id] = b.voci; });
    carrello = nuovo; scriviCarrelloLocale(); render();
    if (ridisegnaCarrello) ridisegnaCarrello();
  }, err => {});
}
async function salvaCarrello(chiave){
  const voci = carrello[chiave] || [];
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
const F = {vista:"set", cerca:"", mazzo:"", maxprezzo:"", soloit:false, nascondi:true, categoria:"", estesi:true, solocerco:false};
try { Object.assign(F, JSON.parse(localStorage.getItem("lista-spesa-filtri") || "{}")); } catch(e){}
function salvaFiltri(){ try { localStorage.setItem("lista-spesa-filtri", JSON.stringify(F)); } catch(e){} }
// le stampe di una carta che i filtri lasciano vedere (lingua e scaffale)
function stampeDi(c){
  return c.stampe.filter(s => (F.soloit ? s.lingua === "it" : s.lingua === "en") && (!F.categoria || catDi(s) === F.categoria));
}
function prezzoMin(c){
  const p = stampeDi(c).filter(s => s.eur != null).map(s => s.eur);
  return p.length ? Math.min(...p) : (F.categoria || F.soloit ? null : c.prezzo_min);
}
function passa(c){
  if (F.cerca && !c.nome.toLowerCase().includes(F.cerca.toLowerCase())) return false;
  if (F.mazzo && !c.mazzi.includes(F.mazzo)) return false;
  if ((F.soloit || F.categoria) && !stampeDi(c).length) return false;
  const p = prezzoMin(c);
  if (F.maxprezzo !== "" && p != null && p > Number(F.maxprezzo)) return false;
  if (F.nascondi && completa(c)) return false;
  if (F.solocerco && !cercata(c)) return false;
  return true;
}

// ---------- rendering ----------
const nomeSet = s => F.estesi ? s.set_nome : s.set.toUpperCase();
// le stampe della stessa carta nello stesso set (e lingua): la normale per prima, poi le varianti
function varianti(c, s){
  return c.stampe.filter(x => x.set === s.set && x.lingua === s.lingua)
    .sort((a,b) => (varDi(a) ? 1 : 0) - (varDi(b) ? 1 : 0) || perNumero(a,b));
}
const etichetta = s => `#${s.numero} · ${varDi(s) || "normale"} · ${eur(s.eur)}`;
function immagine(s, c){
  const src = piccola(s);
  if (src) return `<button class="img-btn" data-stampe="${c.chiave}" aria-label="Tutte le stampe di ${c.nome.replace(/"/g,"&quot;")}"><img class="img" src="${src}" alt="" loading="lazy" onerror="this.style.visibility='hidden'"></button>`;
  return `<div class="segnap"><span class="mono">${(s && s.set || "?").toUpperCase()}</span><span class="mono">${s && s.numero || ""}</span><span>senza immagine</span></div>`;
}
function copieHtml(c){
  const n = trovateDi(c.chiave), k = nelCarrello(c.chiave);
  return `<span class="copie"><b>${n}</b>/${c.copie} ${c.copie === 1 ? "copia" : "copie"}${k ? ` · <span class="nelc">${k} nel carrello</span>` : ""}</span>`;
}
function bottone(c){
  const fatta = completa(c);
  const cerco = fatta ? "" : `<button class="btn piccolo ${cercata(c) ? "cerco-on" : "sec"}" data-cerco="${c.chiave}" aria-pressed="${cercata(c)}">${cercata(c) ? "✓ la cerco" : "La cerco"}</button>`;
  return `${cerco}<button class="btn ${fatta ? "ok" : ""}" data-trova="${c.chiave}">${fatta ? "✓ trovata" : "Trovata"}</button>`;
}
const badgeMazzi = c => c.mazzi.map(m => `<span class="badge mazzo">${m}</span>`).join("");
// una riga nella vista per set: la stampa normale, con un menu per le altre versioni dello stesso set
function rigaStampa(c, vs, id){
  const s = vs.find(x => x.id === id) || vs[0];
  const it = c.stampe.some(x => x.lingua === "it" && x.set === s.set);
  const menu = vs.length > 1 ? `<select class="var" aria-label="Altre versioni in questo set">${vs.map(x =>
    `<option value="${x.id}" ${x.id === s.id ? "selected" : ""}>${etichetta(x)}</option>`).join("")}</select>` : "";
  return `<div class="riga ${completa(c) ? "fatta" : ""} ${cercata(c) ? "cercata" : ""} ${nelCarrello(c.chiave) ? "in-carrello" : ""}" data-chiave="${c.chiave}" data-stampa="${s.id}">
    ${immagine(s, c)}
    <div class="testo">
      <div class="nome apri-stampe" data-stampe="${c.chiave}">${c.nome}</div>
      <div class="dett"><span class="mono num">#${s.numero}</span>
        ${varDi(s) ? `<span class="badge var">${varDi(s)}</span>` : ""}
        <span class="prezzo">${eur(s.eur)}${s.eur_foil ? ` <small>foil ${eur(s.eur_foil)}</small>` : ""}</span>
        ${s.lingua === "it" ? `<span class="badge it">IT</span>` : it ? `<span class="badge it">anche IT</span>` : ""}
        ${s.rarita ? `<span class="badge">${s.rarita[0].toUpperCase()}</span>` : ""}</div>
      ${menu ? `<div class="dett">${menu}<span class="set">${vs.length} versioni</span></div>` : ""}
      <div class="dett">${badgeMazzi(c)}</div>
    </div>
    <div class="azione">${bottone(c)}${copieHtml(c)}</div>
  </div>`;
}
// una riga nelle viste per colore e per mazzo: la carta, con i set in cui cercarla
function rigaCarta(c){
  const vis = stampeDi(c).length ? stampeDi(c) : c.stampe;
  const s = vis.filter(x => x.eur != null).sort((a,b) => a.eur - b.eur)[0] || vis[0];
  const perSet = new Map();       // per ogni set, la stampa meno cara (a parità, la normale)
  for (const x of vis) {
    const g = perSet.get(x.set);
    if (!g || (x.eur != null && (g.eur == null || x.eur < g.eur))) perSet.set(x.set, x);
  }
  const sets = [...perSet.values()].sort((a,b) => (a.eur ?? 1e9) - (b.eur ?? 1e9) || (b.uscita||"").localeCompare(a.uscita||""));
  const chip = x => `<span class="badge cat-${catDi(x)}" title="${CAT[catDi(x)]}">${nomeSet(x)} #${x.numero}${x.eur != null ? ` · ${eur(x.eur)}` : ""}</span>`;
  const max = F.estesi ? 6 : 10;
  return `<div class="riga ${completa(c) ? "fatta" : ""} ${cercata(c) ? "cercata" : ""} ${nelCarrello(c.chiave) ? "in-carrello" : ""}" data-chiave="${c.chiave}" data-stampa="${s ? s.id : ""}">
    ${immagine(s, c)}
    <div class="testo">
      <div class="nome apri-stampe" data-stampe="${c.chiave}">${c.nome}</div>
      <div class="dett"><span class="prezzo">da ${eur(prezzoMin(c))}</span>
        ${s ? `<span class="set">più economica: ${nomeSet(s)} #${s.numero}${varDi(s) ? ` (${varDi(s)})` : ""}</span>` : ""}
        ${c.problema ? `<span class="set">${c.problema}</span>` : ""}
        ${c.stampe.some(x => x.lingua === "it") ? `<span class="badge it">IT</span>` : ""}</div>
      <div class="setchips">${sets.slice(0, max).map(chip).join("")}${sets.length > max ? `<span class="badge">+${sets.length - max} set</span>` : ""}</div>
      <div class="dett">${badgeMazzi(c)}</div>
    </div>
    <div class="azione">${bottone(c)}${copieHtml(c)}</div>
  </div>`;
}
function gruppo(id, nome, sotto, quante, righe, swatch){
  const aperto = aperti.has(id);
  return `<details class="gruppo" data-gruppo="${id}" ${aperto ? "open" : ""}>
    <summary>${swatch ? `<span class="swatch" style="background:var(${swatch})"></span>` : ""}
      <div class="titolo"><div class="nome">${nome}</div>${sotto ? `<div class="sotto">${sotto}</div>` : ""}</div>
      <span class="conta">${quante}</span><span class="freccia">›</span></summary>
    ${righe}
  </details>`;
}
const aperti = new Set();
const nCarte = n => `${n} ${n === 1 ? "carta" : "carte"}`;
function render(){
  const visibili = carte.filter(passa);
  const lista = document.getElementById("lista");
  let html = "";
  if (F.vista === "set") {
    const perSet = new Map();
    for (const c of visibili) {
      const visti = new Set();
      for (const s of stampeDi(c)) {
        if (visti.has(s.set)) continue;
        visti.add(s.set);
        if (!perSet.has(s.set)) perSet.set(s.set, {set:s.set, nome:s.set_nome, uscita:s.uscita, categoria:catDi(s), righe:[], chiavi:new Set()});
        const g = perSet.get(s.set); g.righe.push([c, varianti(c, s)]); g.chiavi.add(c.chiave);
      }
    }
    for (const cat of ORDINE_CAT) {
      const gruppi = [...perSet.values()].filter(g => g.categoria === cat)
        .sort((a,b) => b.chiavi.size - a.chiavi.size || (b.uscita||"").localeCompare(a.uscita||""));
      if (!gruppi.length) continue;
      const carteCat = new Set(gruppi.flatMap(g => [...g.chiavi])).size;
      html += `<h2 class="sezione">${CAT[cat]} <small>${gruppi.length} set · ${nCarte(carteCat)}</small><div class="spiega">${CAT_SOTTO[cat]}</div></h2>`;
      for (const g of gruppi) {
        g.righe.sort((a,b) => perNumero(a[1][0], b[1][0]));
        html += gruppo("set-" + g.set, g.nome, `<span class="mono">${g.set.toUpperCase()}</span> · ${(g.uscita||"").slice(0,4)}`,
                       nCarte(g.chiavi.size), g.righe.map(([c,vs]) => rigaStampa(c, vs, vs[0].id)).join(""), null);
      }
    }
  } else if (F.vista === "colore") {
    for (const gnome of GRUPPI) {
      const cs = visibili.filter(c => c.gruppo === gnome).sort((a,b) => a.nome.localeCompare(b.nome));
      if (!cs.length) continue;
      html += gruppo("col-" + gnome, gnome, "", nCarte(cs.length), cs.map(rigaCarta).join(""), COL[gnome]);
    }
  } else {
    for (const m of mazziTutti) {
      const cs = visibili.filter(c => c.mazzi.includes(m)).sort((a,b) => a.nome.localeCompare(b.nome));
      if (!cs.length) continue;
      const tot = cs.reduce((t,c) => t + (prezzoMin(c) || 0), 0);
      html += gruppo("mazzo-" + m, m, `alla stampa più economica ${eur(tot)}`, nCarte(cs.length), cs.map(rigaCarta).join(""), null);
    }
  }
  if (!datiPronti) { lista.innerHTML = `<div class="vuoto">${statoCarico}</div>`; riassunto(); return; }
  lista.innerHTML = html || `<div class="vuoto">${!carte.length ? "La wishlist è vuota: apri il Menu e importa l'export di Archidekt, oppure aggiungi una carta a mano." : F.solocerco && !carte.some(cercata) ? "Non stai ancora cercando nessuna carta: togli «Solo quelle che cerco» e tocca «La cerco» sulle carte che vuoi." : "Niente da mostrare con questi filtri."}</div>`;
  lista.innerHTML += `<div class="nota">Prezzi e stampe da Scryfall${generato ? ` del ${generato}` : ""}${db && db.modo === "online" ? ` · dati sincronizzati (${esc(db.utente || "")})` : " · dati salvati in questo browser"}</div>`;
  riassunto();
}
function riassunto(){
  const daTrovare = carte.filter(c => !completa(c));
  const copieMancanti = carte.reduce((t,c) => t + Math.max(0, c.copie - trovateDi(c.chiave)), 0);
  const copieTrovate = carte.reduce((t,c) => t + trovateDi(c.chiave), 0);
  const stima = carte.reduce((t,c) => t + (c.prezzo_min || 0) * Math.max(0, c.copie - trovateDi(c.chiave)), 0);
  const speso = Object.values(trovate).flat().reduce((t,x) => t + (Number(x.prezzo) || 0), 0);
  document.getElementById("riass").innerHTML =
    `<span class="chip">da trovare <b>${copieMancanti}</b> ${copieMancanti === 1 ? "copia" : "copie"} · ${daTrovare.length} carte</span>` +
    `<span class="chip ok">trovate <b>${copieTrovate}</b>${speso ? ` · spesi ${eur(speso)}` : ""}</span>` +
    `<span class="chip">restano <b>${eur(stima)}</b> alla stampa più economica</span>`;
  const cs = carte.filter(cercata);
  const copieC = cs.reduce((t,c) => t + mancanti(c), 0);
  const totC = cs.reduce((t,c) => t + (c.prezzo_min || 0) * mancanti(c), 0);
  document.getElementById("barra-cerco").innerHTML =
    `<span class="chip cerco">sto cercando <b>${cs.length}</b> ${cs.length === 1 ? "carta" : "carte"}${copieC !== cs.length ? ` (${copieC} ${copieC === 1 ? "copia" : "copie"} ancora da trovare)` : ""} · <b>${eur(totC)}</b></span>` +
    `<button class="btn piccolo ${F.solocerco ? "cerco-on" : "sec"}" id="solo-cerco" aria-pressed="${F.solocerco}">${F.solocerco ? "✓ " : ""}Solo quelle che cerco</button>` +
    `<button class="btn piccolo sec" id="esporta" ${cs.some(c => mancanti(c) > 0) ? "" : "disabled"}>Copia per i siti</button>` +
    `<button class="btn piccolo ${nCarrello() ? "carrello" : "sec"}" id="apri-carrello">🛒 Carrello${nCarrello() ? ` · ${nCarrello()} · ${eur(totCarrello())}` : ""}</button>`;
}

// ---------- foglio "carrello" ----------
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
function apriCarrello(){
  const wrap = document.getElementById("foglio-wrap");
  let conferma = null;               // "compra" | "svuota": il secondo tocco conferma
  const disegna = () => {
    const vs = vociCarrello();
    if (!vs.length) {
      wrap.innerHTML = `<div class="velo" data-chiudi></div><div class="foglio" role="dialog" aria-label="Carrello">
        <div class="testa"><div><h2>Carrello</h2></div><button class="btn sec" data-chiudi aria-label="Chiudi">✕</button></div>
        <div class="sub">Il carrello è vuoto. Quando trovi una carta, tocca «Trovata», scrivi prezzo e negozio e scegli «Nel carrello»: la carta resta da parte finché non decidi di comprarla.</div></div>`;
      return;
    }
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
          <div class="vn">${esc(x.c.nome)}</div>
          <div class="vp"><input type="number" min="0" step="0.05" inputmode="decimal" value="${prezzoDi(x.v) ?? ""}" placeholder="€" data-prezzo="${x.ch}|${x.i}" aria-label="Prezzo di ${esc(x.c.nome)}">
            <button class="btn sec piccolo" data-toglic="${x.ch}|${x.i}" aria-label="Togli ${esc(x.c.nome)} dal carrello">Togli</button></div>
          <div class="vd">per ${esc(x.v.mazzo)}${negozi.length === 1 && x.v.negozio ? ` · ${esc(x.v.negozio)}` : ""}${x.v.set ? ` · ${descStampa(x.v)}` : ""}<br>
            riferimento ${eur(r.p)} <span class="sd">(${r.cosa})</span> ${deltaHtml(prezzoDi(x.v), r.p)}</div>
        </div>`;
      }).join("");
    }
    wrap.innerHTML = `<div class="velo" data-chiudi></div>
      <div class="foglio" role="dialog" aria-label="Carrello">
        <div class="testa"><div><h2>Carrello</h2>
          <div class="sub">${vs.length} ${vs.length === 1 ? "carta trovata" : "carte trovate"}, non ancora comprate${negozi.length > 1 ? ` · ${negozi.length} negozi` : negozi[0] ? ` · ${esc(negozi[0])}` : ""}. Puoi correggere il prezzo o togliere quelle che non vuoi tenere.</div></div>
          <button class="btn sec" data-chiudi aria-label="Chiudi">✕</button></div>
        ${righe}
        <div class="totali">
          <span class="t">Totale del carrello</span><b class="mono">${eur(tot)}</b>
          <span class="t">Le stesse carte al prezzo di riferimento</span><span class="mono">${eur(totRif)}</span>
          <span class="t">Differenza</span><span>${deltaHtml(totPagCmp, totRif) || "—"}</span>
          ${senzaPrezzo ? `<span class="t" style="grid-column:1 / -1">${senzaPrezzo} ${senzaPrezzo === 1 ? "carta senza prezzo, esclusa" : "carte senza prezzo, escluse"} dai conti</span>` : ""}
        </div>
        <div class="scelte">
          <button class="btn" data-compra>${conferma === "compra" ? `Conferma: segna comprate ${vs.length} ${vs.length === 1 ? "carta" : "carte"}` : "Comprate tutte: segnale come trovate"}</button>
          <button class="btn sec" data-svuota>${conferma === "svuota" ? "Conferma: svuota il carrello" : "Svuota il carrello"}</button>
          <button class="btn sec" data-chiudi>Chiudi</button>
        </div>
      </div>`;
  };
  const ridisegna = () => { if (wrap.hidden) { ridisegnaCarrello = null; return; }
    const f = wrap.querySelector(".foglio"); const y = f ? f.scrollTop : 0; disegna(); const g = wrap.querySelector(".foglio"); if (g) g.scrollTop = y; };
  disegna();
  wrap.hidden = false;
  ridisegnaCarrello = () => { if (!document.activeElement || !document.activeElement.matches("[data-prezzo]")) ridisegna(); };
  wrap.onchange = async ev => {
    const inp = ev.target.closest("[data-prezzo]"); if (!inp) return;
    const [ch, i] = inp.dataset.prezzo.split("|"); const v = (carrello[ch] || [])[Number(i)]; if (!v) return;
    v.prezzo = inp.value === "" ? null : Number(inp.value);
    render(); ridisegna(); await salvaCarrello(ch);
  };
  wrap.onclick = async ev => {
    const t = ev.target.closest("[data-chiudi],[data-toglic],[data-compra],[data-svuota]");
    if (!t) return;
    if (t.hasAttribute("data-chiudi")) { wrap.hidden = true; ridisegnaCarrello = null; return; }
    if (t.hasAttribute("data-toglic")) {
      const [ch, i] = t.dataset.toglic.split("|");
      const nome = perChiave[ch] ? perChiave[ch].nome : ch;
      carrello[ch] = (carrello[ch] || []).filter((_, k) => k !== Number(i));
      if (!carrello[ch].length) delete carrello[ch];
      conferma = null; render(); ridisegna(); await salvaCarrello(ch); toast(`${nome}: tolta dal carrello`); return;
    }
    if (t.hasAttribute("data-svuota")) {
      if (conferma !== "svuota") { conferma = "svuota"; ridisegna(); return; }
      const chiavi = Object.keys(carrello); carrello = {};
      conferma = null; render(); ridisegna(); for (const ch of chiavi) await salvaCarrello(ch); toast("Carrello svuotato"); return;
    }
    if (t.hasAttribute("data-compra")) {
      if (conferma !== "compra") { conferma = "compra"; ridisegna(); return; }
      const vs = vociCarrello(); const chiavi = [...new Set(vs.map(x => x.ch))];
      for (const ch of chiavi) { trovate[ch] = [...(trovate[ch] || []), ...carrello[ch].map(v => ({...v}))]; delete carrello[ch]; }
      conferma = null; render(); ridisegna();
      for (const ch of chiavi) { await salvaTrovate(ch); await salvaCarrello(ch); }
      toast(`Segnate comprate ${vs.length} ${vs.length === 1 ? "carta" : "carte"}`, 2400); return;
    }
  };
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
function tessera(c, s){
  const src = piccola(s);
  const img = src ? `<img src="${src}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">`
                  : `<div class="segnap"><span class="mono">${s.set.toUpperCase()}</span><span>senza immagine</span></div>`;
  return `<button class="stampa" data-scegli="${s.id}" title="Segna trovata questa stampa">
    ${img}
    <span class="sn">${s.set_nome || s.set.toUpperCase()}</span>
    <span class="sd"><span class="mono">${s.set.toUpperCase()} #${s.numero}</span>${s.lingua === "it" ? ` · <span class="badge it">IT</span>` : ""}</span>
    <span class="sd">${varDi(s) || "normale"}${s.uscita ? ` · ${s.uscita.slice(0,4)}` : ""}</span>
    <span class="sp">${eur(s.eur)}${s.eur_foil && s.eur == null ? ` <small class="sd">foil ${eur(s.eur_foil)}</small>` : ""}</span>
  </button>`;
}
function apriStampe(chiave){
  const c = perChiave[chiave];
  const wrap = document.getElementById("foglio-wrap");
  const tutte = c.stampe.slice();
  const nSet = new Set(tutte.map(s => s.set)).size;
  const nIt = tutte.filter(s => s.lingua === "it").length;
  const corpo = () => {
    if (ordineStampe === "prezzo") {
      const ord = tutte.slice().sort((a,b) => (a.eur ?? 1e9) - (b.eur ?? 1e9) || (b.uscita||"").localeCompare(a.uscita||""));
      return `<div class="griglia">${ord.map(s => tessera(c, s)).join("")}</div>`;
    }
    let html = "";
    for (const cat of ORDINE_CAT) {
      const qui = tutte.filter(s => catDi(s) === cat)
        .sort((a,b) => (b.uscita||"").localeCompare(a.uscita||"") || a.set.localeCompare(b.set)
          || (a.lingua === b.lingua ? 0 : a.lingua === "en" ? -1 : 1)
          || (varDi(a) ? 1 : 0) - (varDi(b) ? 1 : 0) || perNumero(a,b));
      if (!qui.length) continue;
      html += `<h3>${CAT[cat]} <small class="sd">${new Set(qui.map(s => s.set)).size} set</small></h3><div class="griglia">${qui.map(s => tessera(c, s)).join("")}</div>`;
    }
    return html;
  };
  let idGrande = null, zoom = false;
  const disegna = () => {
    wrap.innerHTML = `<div class="velo" data-chiudi></div>
      <div class="foglio" role="dialog" aria-label="Tutte le stampe">
        <div class="testa"><div><h2>${c.nome}</h2>
          <div class="sub">${tutte.length} stampe in ${nSet} set${nIt ? ` · ${nIt} in italiano` : ""} · da ${eur(c.prezzo_min)}</div></div>
          <button class="btn sec" data-chiudi aria-label="Chiudi">✕</button></div>
        ${schedaCarta(c, idGrande)}
        <div class="sub">Tocca una stampa per segnarla trovata.</div>
        <div class="ordina"><button data-ordina="set" aria-pressed="${ordineStampe === "set"}">Per scaffale e set</button><button data-ordina="prezzo" aria-pressed="${ordineStampe === "prezzo"}">Per prezzo</button></div>
        ${corpo()}
      </div>`;
  };
  disegna();
  wrap.hidden = false;
  wrap.onclick = ev => {
    const t = ev.target.closest("[data-chiudi],[data-ordina],[data-scegli],[data-zoom],[data-lingua]");
    if (!t) return;
    if (t.hasAttribute("data-chiudi")) { wrap.hidden = true; return; }
    if (t.hasAttribute("data-zoom")) { zoom = !zoom; t.classList.toggle("zoom", zoom); t.title = zoom ? "Tocca per rimpicciolire" : "Tocca per ingrandire"; return; }
    if (t.hasAttribute("data-lingua")) {
      linguaTesto = t.dataset.lingua;
      try { localStorage.setItem("lista-spesa-lingua-testo", linguaTesto); } catch(e){}
      const f = wrap.querySelector(".foglio"); const y = f ? f.scrollTop : 0;
      disegna(); const g = wrap.querySelector(".foglio"); if (g) { g.scrollTop = y; if (zoom) { const im = g.querySelector("[data-zoom]"); if (im) im.classList.add("zoom"); } } return;
    }
    if (t.hasAttribute("data-ordina")) {
      ordineStampe = t.dataset.ordina;
      try { localStorage.setItem("lista-spesa-ordine-stampe", ordineStampe); } catch(e){}
      const f = wrap.querySelector(".foglio"); const y = f ? f.scrollTop : 0;
      disegna(); const g = wrap.querySelector(".foglio"); if (g) g.scrollTop = y; return;
    }
    apriFoglio(chiave, t.dataset.scegli);
  };
}

// ---------- foglio "trovata" ----------
const descStampa = s => `${s.set_nome || String(s.set||"").toUpperCase()} <span class="mono">${String(s.set||"").toUpperCase()} #${s.numero}</span>${s.variante ? ` · ${s.variante}` : ""}${s.lingua === "it" ? " · IT" : ""}`;
function apriFoglio(chiave, idStampa){
  const c = perChiave[chiave];
  const s = c.stampe.find(x => x.id === idStampa) || null;
  const ultimoNegozio = (() => { try { return localStorage.getItem("lista-spesa-negozio") || ""; } catch(e){ return ""; } })();
  const mancano = c.mazzi.map(m => ({m, n: Math.max(0, 1 - trovatePer(chiave, m) - carrelloPer(chiave, m))})).filter(x => x.n > 0);
  const storico = trovate[chiave] || [];
  const nelC = carrello[chiave] || [];
  const wrap = document.getElementById("foglio-wrap");
  let modo = "carrello";
  try { modo = localStorage.getItem("lista-spesa-modo") || "carrello"; } catch(e){}
  if (modo !== "comprata") modo = "carrello";
  const verbo = () => modo === "carrello" ? "Nel carrello" : "Comprata";
  const scelte = () => mancano.length === 0 ? `<div class="sub">Tutte le copie sono già nel carrello o segnate come comprate.</div>` :
    mancano.length === 1 && c.copie === 1 ? `<button class="btn ${modo === "carrello" ? "carrello" : ""}" data-segna="${mancano[0].m}">${verbo()} <small>per ${mancano[0].m}</small></button>` :
    mancano.map(x => `<button class="btn ${modo === "carrello" ? "carrello" : ""}" data-segna="${x.m}">${verbo()}: una copia <small>per ${x.m}</small></button>`).join("") +
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
let toastT = null;
function toast(msg, ms){ const el = document.getElementById("toast"); el.textContent = msg; el.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => el.hidden = true, ms || 1800); }

// ---------- wishlist: mazzi importati da Archidekt + carte aggiunte a mano ----------
// "wishlist": un documento per mazzo, {carte: [{nome, copie}], importato, file}
// "aggiunte": un documento per carta e mazzo, {nome, mazzo, copie}; restano anche quando
// si reimporta Archidekt, e se la carta compare poi nella Wishlist di quel mazzo non si conta due volte.
let wl = null, aggiunte = null;          // null: non ancora arrivate
let ridisegnaMenu = null;                 // se il menu e' aperto, si ridisegna quando cambiano i dati
function collegaWishlist(){
  const errore = e => { statoCarico = "Non riesco a leggere la wishlist: " + esc(e && e.message || e); if (!datiPronti) render(); };
  db.collection("wishlist").onSnapshot(snap => { wl = {}; snap.docs.forEach(d => { wl[d.id] = d.data(); }); ricalcola(); if (ridisegnaMenu) ridisegnaMenu(); }, errore);
  db.collection("aggiunte").onSnapshot(snap => { aggiunte = {}; snap.docs.forEach(d => { aggiunte[d.id] = d.data(); }); ricalcola(); if (ridisegnaMenu) ridisegnaMenu(); }, errore);
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
    const v = voci.get(k) || {nome: x.nome, copie: 0, mazzi: []};
    v.copie += x.copie; if (!v.mazzi.includes(mazzo)) v.mazzi.push(mazzo);
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
    else if (n < t) toast(`Aggiorno da Scryfall: ${n} di ${t}`, 4000);
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
    toast(`Scryfall non ha risposto per ${r.mancanti.length} ${r.mancanti.length === 1 ? "carta" : "carte"}: riprovo fra un minuto`, 6000);
    clearTimeout(riprova); riprova = setTimeout(() => ricalcola(true), 60000);
  } else if (r.errori.length) toast(`Non trovate su Scryfall: ${r.errori.join(", ")}`, 6000);
  else if (!primo && carte.length) toast("Carte aggiornate", 1500);
  if (primo && db && db.ricarica) db.ricarica();       // ora si possono riconoscere le cercate uscite dalla wishlist
}

// ---------- accesso: email e password, oppure link via email (solo con Supabase configurato) ----------
function mostraAccesso(){
  statoCarico = `<form class="accesso" id="acc-form" autocomplete="on">
    <h2>Accedi</h2>
    <p>Wishlist, carte cercate, carrello e trovate restano legati al tuo account e li vedi uguali dal telefono e dal PC.</p>
    <input id="acc-email" name="email" type="email" autocomplete="username" inputmode="email" placeholder="Email" required>
    <input id="acc-pw" name="password" type="password" autocomplete="current-password" placeholder="Password" minlength="6">
    <button class="btn" type="submit">Entra</button>
    <div class="acc-altro">
      <button class="btn sec piccolo" type="button" data-acc="crea">Crea account</button>
      <button class="btn sec piccolo" type="button" data-acc="dimenticata">Password dimenticata?</button>
      <button class="btn sec piccolo" type="button" data-acc="link">Entra con un link via email</button>
    </div>
    <div class="sub" id="acc-msg" role="status"></div></form>`;
  render();
}
async function azioneAccesso(cosa){
  const email = document.getElementById("acc-email").value.trim();
  const pw = document.getElementById("acc-pw").value;
  const msg = document.getElementById("acc-msg");
  if (!email) { msg.textContent = "Scrivi prima l'email."; return; }
  if ((cosa === "entra" || cosa === "crea") && pw.length < 6) { msg.textContent = "Scrivi la password: almeno 6 caratteri."; return; }
  msg.textContent = "Un momento…";
  try {
    if (cosa === "entra") { await Store.entra(email, pw); msg.textContent = "Dentro!"; location.reload(); return; }
    if (cosa === "crea") {
      const r = await Store.creaAccount(email, pw);
      if (r === "dentro") { location.reload(); return; }
      msg.textContent = r === "esiste"
        ? "Esiste già un account con questa email. Se non hai mai scelto una password (entravi col link), premi «Password dimenticata?» per sceglierla."
        : `Ti ho mandato una mail a ${email}: apri il link per confermare l'account, poi torna qui ed entra con email e password.`;
      return;
    }
    if (cosa === "dimenticata") { await Store.passwordDimenticata(email); msg.textContent = `Ti ho mandato una mail a ${email}: apri il link e potrai scegliere la password nuova. Se non la vedi, guarda nello spam.`; return; }
    if (cosa === "link") { await Store.accedi(email); msg.textContent = `Fatto: apri il link che ti è arrivato a ${email}. Se non lo vedi, guarda nello spam.`; return; }
  } catch(err){ msg.textContent = (err && err.message) || String(err); }
}
document.getElementById("lista").addEventListener("submit", e => {
  if (e.target.id !== "acc-form") return;
  e.preventDefault(); azioneAccesso("entra");
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
const COLLEZIONI = ["wishlist", "aggiunte", "cercate", "carrello", "trovate"];
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

// ---------- menu ----------
function apriMenu(){
  const wrap = document.getElementById("foglio-wrap");
  let suggTimer = null;
  const disegna = () => {
    const online = db && db.modo === "online";
    const mazziWl = Object.entries(wl || {}).sort((a,b) => a[0].localeCompare(b[0]));
    const agg = Object.entries(aggiunte || {}).sort((a,b) => a[1].nome.localeCompare(b[1].nome));
    wrap.innerHTML = `<div class="velo" data-chiudi></div>
      <div class="foglio menu" role="dialog" aria-label="Menu">
        <div class="testa"><div><h2>Menu</h2></div><button class="btn sec" data-chiudi aria-label="Chiudi">✕</button></div>

        <h3>Dove sono i dati</h3>
        <div class="sub">${!db ? "Non sei ancora collegato." : online ? `Collegato come <b>${esc(db.utente)}</b>: telefono e PC vedono gli stessi dati.` : Store.configurato ? "" : "I dati sono salvati solo in questo browser. Per averli uguali su telefono e PC configura Supabase, come spiega la guida."}</div>
        ${online ? `<div class="due"><button class="btn sec piccolo" data-password>Scegli o cambia la password</button><button class="btn sec piccolo" data-esci>Esci</button></div>` : ""}

        <h3>Wishlist da Archidekt</h3>
        <div class="sub">Su Archidekt esporta i mazzi in CSV e carica qui il file. Uno <b>zip con tutti i mazzi</b> sostituisce tutta la wishlist importata; un <b>CSV</b> sostituisce solo il suo mazzo. Contano le carte nella categoria Wishlist. Le carte aggiunte a mano restano.</div>
        <label class="btn" style="display:inline-block">Importa export di Archidekt<input type="file" accept=".zip,.csv" data-importa hidden></label>
        ${mazziWl.length ? `<div class="storico">${mazziWl.map(([m, d]) => `<div><span>${esc(m)} · ${(d.carte || []).length} in wishlist${d.importato ? ` · ${d.importato}` : ""}</span><button class="btn sec" data-toglimazzo="${esc(m)}">Togli</button></div>`).join("")}</div>` : ""}

        <h3>Aggiungi una carta a mano</h3>
        <div class="campi tre">
          <input id="m-nome" list="m-sugg" placeholder="Nome della carta (in inglese)" autocomplete="off">
          <input id="m-mazzo" list="m-mazzi" placeholder="Mazzo" autocomplete="off">
          <input id="m-copie" type="number" min="1" step="1" value="1" inputmode="numeric" aria-label="Copie">
        </div>
        <datalist id="m-sugg"></datalist>
        <datalist id="m-mazzi">${mazziTutti.map(m => `<option value="${esc(m)}">`).join("")}</datalist>
        <button class="btn" data-aggiungi>Aggiungi alla wishlist</button>
        ${agg.length ? `<div class="storico"><div class="sub">Aggiunte a mano (non sono su Archidekt: aggiungile anche lì, o restano solo qui)</div>${agg.map(([id, a]) => `<div><span>${esc(a.nome)} · ${esc(a.mazzo)}${a.copie > 1 ? ` · ${a.copie} copie` : ""}</span><button class="btn sec" data-togliagg="${esc(id)}">Togli</button></div>`).join("")}</div>` : ""}

        <h3>Prezzi e stampe</h3>
        <div class="sub">Vengono da Scryfall e restano in memoria per 24 ore${generato ? `; gli ultimi sono del ${generato}` : ""}.</div>
        <button class="btn sec" data-aggiorna>Aggiorna adesso da Scryfall</button>

        <h3>Copia dei dati</h3>
        <div class="sub">Scarica un file con wishlist, carte cercate, carrello e trovate, oppure ricaricane uno: serve come copia di sicurezza e per portare qui i dati della vecchia pagina.</div>
        <div class="due"><button class="btn sec" data-esporta>Scarica una copia</button>
          <label class="btn sec" style="text-align:center">Carica una copia<input type="file" accept=".json,application/json" data-salvataggio hidden></label></div>
      </div>`;
  };
  disegna();
  wrap.hidden = false;
  const ridisegna = () => {
    if (wrap.hidden || !wrap.querySelector(".foglio.menu")) { ridisegnaMenu = null; return; }
    if (document.activeElement && wrap.contains(document.activeElement) && document.activeElement.tagName === "INPUT" && document.activeElement.type !== "file") return;
    const f = wrap.querySelector(".foglio"); const y = f ? f.scrollTop : 0; disegna(); const g = wrap.querySelector(".foglio"); if (g) g.scrollTop = y; };
  ridisegnaMenu = ridisegna;
  wrap.oninput = e => {
    if (e.target.id !== "m-nome") return;
    clearTimeout(suggTimer);
    const q = e.target.value.trim();
    suggTimer = setTimeout(async () => {
      try { const s = await Scry.suggerimenti(q); const dl = wrap.querySelector("#m-sugg"); if (dl) dl.innerHTML = s.map(n => `<option value="${esc(n)}">`).join(""); } catch(err){}
    }, 250);
  };
  wrap.onchange = async e => {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    try {
      if (e.target.hasAttribute("data-importa")) toast(await importaArchidekt(f), 4000);
      if (e.target.hasAttribute("data-salvataggio")) toast(await importaSalvataggio(f), 3000);
    } catch(err){ toast("Non riesco a leggere il file: " + (err && err.message || err), 5000); }
    e.target.value = ""; ridisegna();
  };
  wrap.onclick = async e => {
    const t = e.target.closest("[data-chiudi],[data-esci],[data-password],[data-toglimazzo],[data-aggiungi],[data-togliagg],[data-aggiorna],[data-esporta]");
    if (!t) return;
    if (t.hasAttribute("data-chiudi")) { wrap.hidden = true; ridisegnaMenu = null; return; }
    try {
      if (t.hasAttribute("data-esci")) return db.esci();
      if (t.hasAttribute("data-password")) { ridisegnaMenu = null; apriPassword(false); return; }
      if (t.hasAttribute("data-toglimazzo")) { await db.collection("wishlist").doc(t.dataset.toglimazzo).delete(); toast("Mazzo tolto"); }
      if (t.hasAttribute("data-togliagg")) { await db.collection("aggiunte").doc(t.dataset.togliagg).delete(); toast("Tolta"); }
      if (t.hasAttribute("data-aggiungi")) {
        const nome = wrap.querySelector("#m-nome").value.trim(), mazzo = wrap.querySelector("#m-mazzo").value.trim();
        const copie = Math.max(1, Number(wrap.querySelector("#m-copie").value) || 1);
        if (!nome || !mazzo) { toast("Scrivi il nome della carta e il mazzo"); return; }
        await db.collection("aggiunte").doc(`${Scry.chiave(nome)}@${Scry.chiave(mazzo)}`).set({nome, mazzo, copie});
        wrap.querySelector("#m-nome").value = ""; document.activeElement && document.activeElement.blur();
        toast(`${nome}: aggiunta per ${mazzo}`, 2500);
      }
      if (t.hasAttribute("data-aggiorna")) { Scry.svuotaCache(); wrap.hidden = true; ricalcola(true); return; }
      if (t.hasAttribute("data-esporta")) { await esportaTutto(); return; }
    } catch(err){ toast("Non è andata: " + (err && err.message || err), 5000); }
    setTimeout(ridisegna, 300);
  };
}
document.getElementById("apri-menu").addEventListener("click", apriMenu);

// ---------- eventi ----------
const lista = document.getElementById("lista");
lista.addEventListener("click", ev => {
  const cb = ev.target.closest("[data-cerco]");
  if (cb) {
    const ch = cb.dataset.cerco;
    if (cercate[ch]) delete cercate[ch]; else cercate[ch] = {quando: new Date().toISOString().slice(0,10)};
    render(); salvaCercata(ch);
    return;
  }
  const b = ev.target.closest("[data-trova]");
  if (b) { const riga = b.closest(".riga"); apriFoglio(b.dataset.trova, riga && riga.dataset.stampa); return; }
  const st = ev.target.closest("[data-stampe]");
  if (st) { apriStampe(st.dataset.stampe); return; }
});
// il menu delle versioni: cambia immagine, numero e prezzo della riga, e la stampa che "Trovata" ricorda
lista.addEventListener("change", ev => {
  const sel = ev.target.closest("select.var"); if (!sel) return;
  const riga = sel.closest(".riga"); const c = perChiave[riga.dataset.chiave];
  const s = c.stampe.find(x => x.id === sel.value); if (!s) return;
  riga.outerHTML = rigaStampa(c, varianti(c, s), s.id);
});
lista.addEventListener("toggle", ev => {
  const d = ev.target; if (d.tagName !== "DETAILS") return;
  if (d.open) aperti.add(d.dataset.gruppo); else aperti.delete(d.dataset.gruppo);
}, true);
for (const v of ["set","colore","mazzo"]) document.getElementById("v-" + v).addEventListener("click", () => {
  F.vista = v; for (const w of ["set","colore","mazzo"]) document.getElementById("v-" + w).setAttribute("aria-pressed", String(w === v));
  salvaFiltri(); render();
});
const sel = document.getElementById("mazzo");
function riempiMazzi(){
  const v = F.mazzo;
  sel.innerHTML = `<option value="">Tutti i mazzi</option>` + mazziTutti.map(m => `<option>${esc(m)}</option>`).join("");
  sel.value = mazziTutti.includes(v) ? v : "";
}
const selCat = document.getElementById("categoria");
document.getElementById("cerca").value = F.cerca; sel.value = F.mazzo; document.getElementById("maxprezzo").value = F.maxprezzo;
selCat.value = ORDINE_CAT.includes(F.categoria) ? F.categoria : "";
document.getElementById("soloit").checked = F.soloit; document.getElementById("nascondi").checked = F.nascondi;
document.getElementById("estesi").checked = F.estesi !== false;
document.getElementById("v-" + (["set","colore","mazzo"].includes(F.vista) ? F.vista : "set")).click();
document.getElementById("cerca").addEventListener("input", e => { F.cerca = e.target.value; salvaFiltri(); render(); });
sel.addEventListener("change", e => { F.mazzo = e.target.value; salvaFiltri(); render(); });
selCat.addEventListener("change", e => { F.categoria = e.target.value; salvaFiltri(); render(); });
document.getElementById("maxprezzo").addEventListener("input", e => { F.maxprezzo = e.target.value; salvaFiltri(); render(); });
document.getElementById("soloit").addEventListener("change", e => { F.soloit = e.target.checked; salvaFiltri(); render(); });
document.getElementById("nascondi").addEventListener("change", e => { F.nascondi = e.target.checked; salvaFiltri(); render(); });
document.getElementById("estesi").addEventListener("change", e => { F.estesi = e.target.checked; salvaFiltri(); render(); });
document.getElementById("apri-filtri").addEventListener("click", e => {
  const x = document.getElementById("filtri-extra"); x.hidden = !x.hidden; e.currentTarget.setAttribute("aria-expanded", String(!x.hidden));
});
document.getElementById("barra-cerco").addEventListener("click", e => {
  if (e.target.closest("#solo-cerco")) { F.solocerco = !F.solocerco; salvaFiltri(); render(); return; }
  if (e.target.closest("#esporta")) apriEsporta();
  if (e.target.closest("#apri-carrello")) apriCarrello();
});
document.addEventListener("keydown", e => { if (e.key === "Escape") document.getElementById("foglio-wrap").hidden = true; });
render();
collegaDb();
document.addEventListener("visibilitychange", () => { if (!document.hidden && db && db.ricarica) db.ricarica(); });
})();

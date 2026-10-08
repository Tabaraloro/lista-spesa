// Dove si salvano wishlist, carte cercate, carrello e carte trovate.
//
// Con Supabase configurato (config.js) e l'utente collegato, tutto sta in una tabella "stato"
// online, una riga per documento, visibile solo a chi l'ha scritta: telefono e PC vedono gli
// stessi dati. Senza, si salva nel browser. Le due versioni espongono la stessa piccola
// interfaccia, quella che la pagina usava gia' con il database dell'artefatto:
//   store.collection(nome).onSnapshot(cb)   -> cb({docs: [{id, data()}]})
//   store.collection(nome).doc(id).set(obj) / .delete()
(function(){
"use strict";
const CFG = window.CONFIG || {};
const configurato = !!(CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY && window.supabase);

// ---------- nel browser ----------
function storeLocale(){
  const chiaveLS = n => "app:" + n;
  const leggi = n => { try { return JSON.parse(localStorage.getItem(chiaveLS(n)) || "{}"); } catch(e){ return {}; } };
  const scrivi = (n, x) => { try { localStorage.setItem(chiaveLS(n), JSON.stringify(x)); } catch(e){} };
  const ascolti = {};
  const avvisa = n => (ascolti[n] || []).forEach(f => f());
  return {
    modo: "locale", utente: null,
    collection(n){
      return {
        onSnapshot(cb){
          const giro = () => { const x = leggi(n); cb({docs: Object.keys(x).map(id => ({id, data: () => x[id]}))}); };
          (ascolti[n] = ascolti[n] || []).push(giro); giro();
          return () => { ascolti[n] = (ascolti[n] || []).filter(f => f !== giro); };
        },
        doc(id){
          return {
            async set(obj){ const x = leggi(n); x[id] = obj; scrivi(n, x); avvisa(n); },
            async delete(){ const x = leggi(n); delete x[id]; scrivi(n, x); avvisa(n); },
          };
        },
      };
    },
    ricarica(){ Object.keys(ascolti).forEach(avvisa); },
  };
}

// ---------- online, su Supabase ----------
function storeSupabase(sb, user){
  const ascolti = {};          // collezione -> [funzione che rilegge e chiama cb]
  const rileggi = n => (ascolti[n] || []).forEach(f => f());
  // Dopo una scrittura si rilegge la collezione, anche senza aspettare il tempo reale; a raffica,
  // una volta sola. Mentre ci sono scritture in corso sulla collezione la rilettura aspetta: se no
  // riporterebbe in pagina lo stato di prima delle scritture non ancora finite.
  const attese = {}, inCorso = {};
  const rileggiPresto = n => {
    clearTimeout(attese[n]);
    attese[n] = setTimeout(() => { if (inCorso[n]) return; rileggi(n); }, 150);
  };
  const scrivendo = async (n, fai) => {
    inCorso[n] = (inCorso[n] || 0) + 1;
    try { return await fai(); }
    finally { inCorso[n]--; rileggiPresto(n); }
  };
  sb.channel("stato-" + user.id)
    .on("postgres_changes", {event: "*", schema: "public", table: "stato", filter: `user_id=eq.${user.id}`}, p => {
      const n = (p.new && p.new.collezione) || (p.old && p.old.collezione);
      if (n) rileggiPresto(n); else Object.keys(ascolti).forEach(rileggiPresto);
    }).subscribe();
  return {
    modo: "online", utente: user.email,
    collection(n){
      return {
        onSnapshot(cb, err){
          const giro = async () => {
            const {data, error} = await sb.from("stato").select("chiave,dati").eq("collezione", n);
            if (error) { if (err) err(error); return; }
            cb({docs: data.map(r => ({id: r.chiave, data: () => r.dati}))});
          };
          (ascolti[n] = ascolti[n] || []).push(giro); giro();
          return () => { ascolti[n] = (ascolti[n] || []).filter(f => f !== giro); };
        },
        doc(id){
          return {
            set(obj){
              return scrivendo(n, async () => {
                const {error} = await sb.from("stato").upsert({user_id: user.id, collezione: n, chiave: id, dati: obj,
                  aggiornato: new Date().toISOString()}, {onConflict: "user_id,collezione,chiave"});
                if (error) throw error;
              });
            },
            delete(){
              return scrivendo(n, async () => {
                const {error} = await sb.from("stato").delete().eq("collezione", n).eq("chiave", id);
                if (error) throw error;
              });
            },
          };
        },
      };
    },
    ricarica(){ Object.keys(ascolti).forEach(rileggi); },
    async esci(){ await sb.auth.signOut(); location.reload(); },
  };
}

let sb = null, recupero = false;
const QUI = () => location.origin + location.pathname;
async function collega(){
  if (!configurato) return storeLocale();
  // arrivando dal link "password dimenticata" si e' dentro, ma va scelta la password nuova
  recupero = /type=recovery/.test(location.hash);
  sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);
  sb.auth.onAuthStateChange(ev => { if (ev === "PASSWORD_RECOVERY") recupero = true; });
  const {data} = await sb.auth.getSession();
  const user = data && data.session && data.session.user;
  return user ? storeSupabase(sb, user) : null;        // null: configurato ma non collegato
}

// ---------- accesso: email e password, oppure link via email ----------
// I messaggi di Supabase sono in inglese: quelli che capitano davvero diventano frasi chiare.
function traduci(error){
  const m = (error && error.message) || String(error);
  if (/invalid login credentials/i.test(m)) return "Email o password sbagliate.";
  if (/email not confirmed/i.test(m)) return "Devi prima confermare l'email: apri il link che ti è arrivato per posta, poi entra.";
  if (/already registered|already been registered/i.test(m)) return "Esiste già un account con questa email: premi «Entra», oppure «Password dimenticata?» se non ne hai mai scelta una.";
  if (/at least (\d+) characters/i.test(m)) return `La password deve avere almeno ${m.match(/at least (\d+)/i)[1]} caratteri.`;
  if (/rate limit|too many/i.test(m)) return "Troppe richieste in poco tempo: riprova fra qualche minuto.";
  if (/same.*password|different from the old/i.test(m)) return "La password nuova deve essere diversa da quella di prima.";
  if (/weak|pwned|compromised/i.test(m)) return "Password troppo debole: scegline una più lunga o meno comune.";
  return m;
}
const fallisce = error => { const e = new Error(traduci(error)); e.originale = error; throw e; };
async function accedi(email){                                      // link via email
  const {error} = await sb.auth.signInWithOtp({email, options: {emailRedirectTo: QUI()}});
  if (error) fallisce(error);
}
async function entra(email, password){
  const {error} = await sb.auth.signInWithPassword({email, password});
  if (error) fallisce(error);
}
// torna "dentro" se l'account e' attivo subito, "conferma" se serve aprire la mail, "esiste" se l'email ha gia' un account
async function creaAccount(email, password){
  const {data, error} = await sb.auth.signUp({email, password, options: {emailRedirectTo: QUI()}});
  if (error) fallisce(error);
  if (data && data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) return "esiste";
  return data && data.session ? "dentro" : "conferma";
}
async function passwordDimenticata(email){
  const {error} = await sb.auth.resetPasswordForEmail(email, {redirectTo: QUI()});
  if (error) fallisce(error);
}
async function cambiaPassword(password){
  const {error} = await sb.auth.updateUser({password});
  if (error) fallisce(error);
  recupero = false;
  if (/type=recovery/.test(location.hash)) history.replaceState(null, "", QUI());
}
window.Store = {collega, accedi, entra, creaAccount, passwordDimenticata, cambiaPassword, configurato, storeLocale,
  get recupero(){ return recupero; }};
})();

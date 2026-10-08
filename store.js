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
  // dopo una scrittura si rilegge la collezione anche senza aspettare il tempo reale (a raffica: una volta sola)
  const attese = {};
  const rileggiPresto = n => { clearTimeout(attese[n]); attese[n] = setTimeout(() => rileggi(n), 150); };
  sb.channel("stato-" + user.id)
    .on("postgres_changes", {event: "*", schema: "public", table: "stato", filter: `user_id=eq.${user.id}`}, p => {
      const n = (p.new && p.new.collezione) || (p.old && p.old.collezione);
      if (n) rileggi(n); else Object.keys(ascolti).forEach(rileggi);
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
            async set(obj){
              const {error} = await sb.from("stato").upsert({user_id: user.id, collezione: n, chiave: id, dati: obj,
                aggiornato: new Date().toISOString()}, {onConflict: "user_id,collezione,chiave"});
              if (error) throw error;
              rileggiPresto(n);
            },
            async delete(){
              const {error} = await sb.from("stato").delete().eq("collezione", n).eq("chiave", id);
              if (error) throw error;
              rileggiPresto(n);
            },
          };
        },
      };
    },
    ricarica(){ Object.keys(ascolti).forEach(rileggi); },
    async esci(){ await sb.auth.signOut(); location.reload(); },
  };
}

let sb = null;
async function collega(){
  if (!configurato) return storeLocale();
  sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);
  const {data} = await sb.auth.getSession();
  const user = data && data.session && data.session.user;
  return user ? storeSupabase(sb, user) : null;        // null: configurato ma non collegato
}
async function accedi(email){
  const {error} = await sb.auth.signInWithOtp({email, options: {emailRedirectTo: location.origin + location.pathname}});
  if (error) throw error;
}
window.Store = {collega, accedi, configurato, storeLocale};
})();

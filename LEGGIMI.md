# Lista della spesa MTG — l'app

È la Lista della Spesa che usavi come pagina di Claude, trasformata in un sito tutto tuo. In più:

- **immagini, testo e prezzi arrivano dal vivo da Scryfall**: tutte le stampe, anche quelle uscite ieri, senza passare dal PC;
- **l'immagine grande** di ogni stampa si apre con un tocco;
- la wishlist la **importi tu** dall'export di Archidekt, oppure **aggiungi una carta a mano** col pulsante «+»;
- carte cercate, carrello e trovate sono **salvate online** e le vedi uguali su telefono e PC;
- sul telefono si installa come un'app (icona nella schermata Home).
- si entra con **email e password**, oppure con un link via email.

Le carte stanno in quattro sezioni, che seguono il giro di una carta: **Wishlist** (tutte quelle che vorresti), **La cerco** (quelle che stai cercando in negozio o online), **Carrello** (trovate, con il prezzo, ma non ancora comprate) e **Trovate**. In Wishlist e La cerco puoi raggruppare per set, per colore o per mazzo.

## Due aspetti, a scelta

Cambia solo come si vedono le carte: intestazione, barra delle sezioni in basso, carrello e menu sono uguali.

- **Elenco**: righe compatte, con una sola azione per riga (il segnalibro per «La cerco», «Trovata», …).
- **Raccoglitore**: le carte in griglia con le immagini grandi, come le pagine di un raccoglitore. Tocchi una carta e nella scheda trovi «La cerco», «Trovata» e «Togli dalla wishlist».

Si cambia con il pulsante accanto a **Menu**, oppure da **Menu → Aspetto**. La scelta resta su quel dispositivo: puoi usare il Raccoglitore sul telefono e l'Elenco sul PC.

Nella scheda di una carta, toccare una stampa la mostra grande; «Trovata» usa la stampa scelta. «Togli dalla wishlist» la toglie: se viene da Archidekt non torna al prossimo import (da **Menu → Wishlist → Carte tolte a mano** la rimetti). Dopo «La cerco», «Comprate tutte», «Togli» e «Svuota il carrello» compare per qualche secondo **Annulla**. Il tasto Indietro del telefono chiude la scheda aperta.

## Cosa serve

Due account gratuiti:

- **Supabase**, dove si salvano i dati;
- **GitHub**, che pubblica il sito.

Nessuno dei due chiede la carta di credito per l'uso che ne fai qui. La preparazione richiede una ventina di minuti e si fa una volta sola.

## 1. Supabase: il posto dove si salvano i dati

1. Vai su **supabase.com**, crea un account e poi **New project**. Il nome è a tua scelta (per esempio `lista-spesa`), poi scegli una password per il database (non ti servirà più, ma conservala) e come regione **Frankfurt** o un'altra in Europa.
2. Quando il progetto è pronto, apri **SQL Editor → New query**, incolla tutto il contenuto del file `supabase.sql` e premi **Run**. Così si crea la tabella dove l'app salva tutto: ogni utente vede solo le proprie righe.
3. Apri **Project Settings → API** (in alcune versioni si chiama *Data API* o *API Keys*) e copia due valori:
   - **Project URL**, che inizia con `https://` e finisce con `.supabase.co`;
   - la chiave **anon public**, una stringa lunga.
4. Apri il file `config.js` con il Blocco note e incolla i due valori fra le virgolette:
   ```js
   SUPABASE_URL: "https://xxxxxxxx.supabase.co",
   SUPABASE_ANON_KEY: "eyJhbGciOi...",
   ```
   La chiave anon può stare in un sito pubblico: i dati li protegge la regola «ognuno vede solo le sue righe» creata al punto 2.

## 2. GitHub: il sito

1. Vai su **github.com**, crea un account e poi **New repository**: chiamalo per esempio `lista-spesa`, lascialo **Public** e crealo.
2. Nella pagina del repository premi **Add file → Upload files** e trascina **tutti i file di questa cartella**, compresa la cartella `lib`. Poi premi **Commit changes**.
3. Vai in **Settings → Pages**. In *Source* scegli **Deploy from a branch**, poi il branch **main** e la cartella **/ (root)**, e premi **Save**.
4. Dopo un minuto circa l'indirizzo del sito compare in cima alla stessa pagina, per esempio `https://tuonome.github.io/lista-spesa/`.

## 3. Collegare i due

In Supabase apri **Authentication → URL Configuration** e incolla l'indirizzo del sito sia in **Site URL** sia in **Redirect URLs**. Senza questo passaggio il link che arriva per email non riporta all'app.

## 4. Primo accesso e i tuoi dati di oggi

1. Apri il sito ed entra in uno dei due modi:
   - **email e password**: la prima volta premi **Crea account**, apri la mail di conferma, poi torna sul sito ed entra con **Entra**. Se l'hai dimenticata, premi **Password dimenticata?**: ti arriva un link per sceglierne una nuova;
   - **link via email**: premi **Entra con un link via email** e apri il link dallo stesso dispositivo.

   Se entri col link, puoi scegliere una password anche dopo, da **Menu → Account → Cambia password**. Una volta dentro, la volta dopo non serve rientrare.
2. **Menu → Dati → Carica una copia** e scegli il file `migrazione-07-10.json` che ti ho mandato a parte. Contiene la wishlist del 7 ottobre, Ghostly Prison aggiunta a mano, le 23 carte che stai cercando e le 17 trovate. Al primo caricamento l'app scarica i dati da Scryfall: ci mette circa mezzo minuto, poi li tiene in memoria per 24 ore.
3. Sul telefono, dal menu del browser scegli **Aggiungi a schermata Home**.
4. Facoltativo: in Supabase, **Authentication → Sign In / Providers**, disattiva **Allow new users to sign up**. Così nessun altro può creare un account sul tuo sito. Tu resti dentro.

> Il file `migrazione-07-10.json` contiene i tuoi dati: **non caricarlo su GitHub**, perché lì il sito è pubblico.

## Uso di tutti i giorni

- **Wishlist aggiornata**: su Archidekt esporta i mazzi, poi apri **Menu → Wishlist → Importa l'export di Archidekt**. Uno zip con tutti i mazzi sostituisce tutta la wishlist importata; un singolo CSV sostituisce solo quel mazzo. Le carte aggiunte a mano restano.
- **Una carta in più senza passare da Archidekt**: il pulsante **«+»** accanto a Filtri. Mentre scrivi il nome, l'app ti suggerisce i nomi di Scryfall.
- **Prezzi**: si aggiornano da soli una volta al giorno. **Menu → Dati → Aggiorna adesso da Scryfall** li riscarica subito.
- **Copia di sicurezza**: **Menu → Dati → Scarica una copia** salva un file con tutti i tuoi dati.

## File

| File | Cos'è |
|---|---|
| `index.html` | la pagina |
| `app.js` | tutto quello che fa la pagina: viste, filtri, «La cerco», carrello, trovate, menu, import |
| `scryfall.js` | stampe, prezzi, immagini e testo da Scryfall, con la cache di 24 ore |
| `store.js` | il salvataggio: online su Supabase, oppure solo nel browser se `config.js` è vuoto |
| `config.js` | i due valori di Supabase |
| `supabase.sql` | la tabella da creare su Supabase (punto 1.2) |
| `lib/` | le due librerie usate: il client di Supabase e JSZip per leggere gli zip di Archidekt |
| `manifest.webmanifest`, `icona*` | nome e icona per installarla sul telefono |

## Limiti da sapere

- **Le mail di Supabase** (conferma dell'account, password dimenticata, link di accesso) partono dal servizio gratuito di Supabase, che ne manda poche all'ora: se ne chiedi tante di fila, aspetta qualche minuto.
- **Senza connessione**: l'app mostra le carte e i dati dell'ultima volta. Quello che segni mentre sei offline resta solo sul telefono e non si sincronizza da solo: se succede, la pagina te lo dice.
- **Scryfall** accetta al massimo 2 ricerche al secondo, per questo il primo caricamento richiede circa mezzo minuto. Se Scryfall non risponde, le carte restano in lista con la scritta «non ancora scaricata da Scryfall» e l'app riprova da sola dopo un minuto.
- Le immagini e i dati delle carte sono di **Scryfall**: l'app li mostra senza modificarli e non è affiliata a Scryfall né a Wizards of the Coast.

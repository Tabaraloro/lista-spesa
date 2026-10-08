# Lista della spesa MTG — l'app

È la Lista della Spesa che usavi come pagina di Claude, trasformata in un sito tutto tuo. In più:

- **immagini, testo e prezzi arrivano dal vivo da Scryfall**: tutte le stampe, anche quelle uscite ieri, senza passare dal PC;
- **l'immagine grande** di ogni stampa si apre con un tocco;
- la wishlist la **importi tu** dall'export di Archidekt, oppure **aggiungi una carta a mano** (Menu);
- carte cercate, carrello e trovate sono **salvate online** e le vedi uguali su telefono e PC;
- sul telefono si installa come un'app (icona nella schermata Home).

Tutto il resto funziona come prima: viste per set, per colore e per mazzo, filtri, «La cerco», «Copia per i siti», carrello, «Trovata».

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

1. Apri il sito, scrivi la tua email e premi **Mandami il link**. Apri il link che ti arriva dallo stesso dispositivo (telefono o PC): sei dentro, e la volta dopo non serve rifarlo.
2. **Menu → Carica una copia** e scegli il file `migrazione-07-10.json` che ti ho mandato a parte. Contiene la wishlist del 7 ottobre, Ghostly Prison aggiunta a mano, le 23 carte che stai cercando e le 17 trovate. Al primo caricamento l'app scarica i dati da Scryfall: ci mette circa mezzo minuto, poi li tiene in memoria per 24 ore.
3. Sul telefono, dal menu del browser scegli **Aggiungi a schermata Home**.
4. Facoltativo: in Supabase, **Authentication → Sign In / Providers**, disattiva **Allow new users to sign up**. Così nessun altro può creare un account sul tuo sito. Tu resti dentro.

> Il file `migrazione-07-10.json` contiene i tuoi dati: **non caricarlo su GitHub**, perché lì il sito è pubblico.

## Uso di tutti i giorni

- **Wishlist aggiornata**: su Archidekt esporta i mazzi, poi apri **Menu → Importa export di Archidekt**. Uno zip con tutti i mazzi sostituisce tutta la wishlist importata; un singolo CSV sostituisce solo quel mazzo. Le carte aggiunte a mano restano.
- **Una carta in più senza passare da Archidekt**: **Menu → Aggiungi una carta a mano**. Mentre scrivi il nome, l'app ti suggerisce i nomi di Scryfall.
- **Prezzi**: si aggiornano da soli una volta al giorno. **Menu → Aggiorna adesso da Scryfall** li riscarica subito.
- **Copia di sicurezza**: **Menu → Scarica una copia** salva un file con tutti i tuoi dati.

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

- **Senza connessione**: l'app mostra le carte e i dati dell'ultima volta. Quello che segni mentre sei offline resta solo sul telefono e non si sincronizza da solo: se succede, la pagina te lo dice.
- **Scryfall** accetta al massimo 2 ricerche al secondo, per questo il primo caricamento richiede circa mezzo minuto. Se Scryfall non risponde, le carte restano in lista con la scritta «non ancora scaricata da Scryfall» e l'app riprova da sola dopo un minuto.
- Le immagini e i dati delle carte sono di **Scryfall**: l'app li mostra senza modificarli e non è affiliata a Scryfall né a Wizards of the Coast.

# Roadmap

Idee di miglioramento, da fare a tempo perso. Ordine indicativo: in alto quello che serve prima di rendere pubblico il repository.

## Prima della pubblicazione

- [ ] **Interfaccia in inglese** (con l'italiano come opzione): testi della sidebar, toast, pulsanti, README.
- [ ] **Opzioni configurabili** (`userConfig` del plugin): colori, larghezza massima della prosa, sezioni visibili, regola che riconosce gli ambienti di produzione (oggi: nome che contiene `prod`).
- [ ] **Nome del plugin** `sidebar` -> `cockpit`, con migrazione dello stato salvato (sezioni compresse, modelli visti, `/newstyle`).
- [ ] **Copia tabella su macOS e Linux**: oggi solo Windows (`powershell.exe`); su macOS `osascript`/`pbcopy`, su Linux `xclip -t text/html` o `wl-copy`.
- [ ] **Screenshot e GIF** nel README: sidebar larga, barra a 2 righe, tabelle, codice.
- [ ] **Test** con `claude plugin test` per le funzioni pure: `splitCode`, `splitTables`, `splitLabels`, `splitLists`, `tableGrid`.

## Sidebar

- [ ] **Altri cloud e contesti**: profilo/regione AWS, progetto GCP, contesto Docker, workspace OpenTofu/Terraform.
- [ ] **Stato della PR del branch corrente**: numero, review, esito della CI (GitHub e Azure DevOps).
- [ ] **Avanzamento dei task**: la lista di Claude (todo/task) con quelli completati, in corso e da fare.
- [ ] **Subagent e comandi in background** in esecuzione, con durata.
- [ ] **Andamento del contesto**: piccolo grafico del riempimento nel tempo, per capire quando compattare.
- [ ] **File modificati cliccabili**: copia percorso o apertura nell'editor.
- [ ] **Comandi di scrittura cliccabili**: copia del comando completo.
- [ ] **Promemoria dalla sidebar**: segnare come fatto, rimandare di un giorno.
- [ ] **Stato dei server MCP** appena l'API delle mod lo espone (oggi non disponibile).

## Chat

- [ ] **Pulsante `⧉ Copia codice`** sotto ogni blocco di codice, come per le tabelle.
- [ ] **Titoli markdown** (`##`, `###`) con lo stesso stile delle righe-titolo.
- [ ] **Citazioni e avvisi** (`> Nota`, `> Attenzione`) in un riquadro colorato.
- [ ] **Diff** con righe `+`/`-` colorate anche fuori dai blocchi ```diff.
- [ ] **Tabelle**: esportazione CSV, ordinamento per colonna con un clic.
- [ ] **Output lunghi degli strumenti** compressi, con un clic per espanderli.
- [ ] **Ora di invio** accanto a ogni prompt.
- [ ] **Palette chiara** per chi usa un terminale con sfondo chiaro.

## Fatto

- [x] Sidebar operativa (dove operi, modello ed effort, modalita' attive, contesto, azioni rapide, comandi di scrittura, promemoria, file).
- [x] Barra minimal di 2 righe a finestra stretta.
- [x] Elenco dei modelli che si aggiorna da solo.
- [x] Stile della chat: prompt, output dei comandi, codice, tabelle con copia per Teams/Outlook/Excel, titoli ed elenchi leggibili, linea di fine turno.
- [x] `/newstyle on|off`.

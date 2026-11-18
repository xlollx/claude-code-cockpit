# claude-code-cockpit

Mod per Claude Code (terminale) che aggiunge un pannello laterale operativo e rende la chat piu' leggibile, con un look ispirato a OpenCode.

## Cosa fa

### Sidebar (`/sidebar`)

| Sezione | Contenuto |
|---|---|
| Dove operi | cartella, subscription e tenant az, contesto e namespace kubectl, branch git con modifiche ● e commit ↑ da pushare / ↓ da scaricare (rossi se prod) |
| Modello | un pulsante per famiglia (`Fable Mythos Opus Sonnet Haiku`...) e `low medium high xhigh max`: un clic applica subito. Le famiglie nuove si aggiungono da sole appena compaiono in uso o nel `model:` di un agent in `~/.claude/agents`; `…` apre il selettore completo di Claude Code |
| Modalità attive | `newstyle` e le skill "a modalita'" accese nella sessione (`i-have-adhd`, `caveman`, `ponytail` + livello); `✕` scrive nel prompt la frase che la spegne |
| Contesto | barra di riempimento, token, limiti 5h/7g, durata della sessione; avviso all'80% |
| Azioni rapide | `Compatta`, `Contesto`, `Copia cartella` |
| Comandi di scrittura | apply/destroy/import, az create/delete/set, kubectl apply/delete, helm, flux, git push, REST in scrittura |
| Promemoria / File | scadenze entro 7 giorni da `~/.claude/reminders.json`, file modificati nella sessione |

- Ogni sezione si comprime con un clic sul titolo (stato ricordato fra sessioni).
- A finestra larga il pannello sta a lato; a finestra stretta diventa una barra di 2 righe sopra il prompt.

### Stile della chat

| Elemento | Stile |
|---|---|
| Prompt dell'utente | riquadro con barra blu e fondo scuro |
| Output dei comandi `/` | barra arancione (rossa se in errore) |
| Testo delle risposte | titoli di sezione in grassetto arancione, elenchi con numeri colorati e spazio fra i punti con sottopunti, prosa larga al massimo 100 colonne |
| Blocchi di codice | riquadro con barra verde, nome del linguaggio, sintassi colorata |
| Tabelle | bordo esterno, intestazione colorata, righe alternate; colonne che si stringono e vanno a capo se la tabella e' piu' larga della chat |
| `⧉ Copia tabella` | sotto ogni tabella: copia negli appunti in HTML (Teams/Outlook incollano una tabella vera) e a tabulazioni (Excel). Solo Windows |
| Fine turno | `▣ Opus 5.5 · high · 40s` e una linea sottile che separa un turno dal successivo |

`/newstyle on|off` accende o spegne tutto lo stile (stato ricordato fra sessioni).

## Installazione

Al prompt di una sessione di Claude Code nel terminale:

```
/plugin install sidebar --marketplace xlollx/claude-code-cockpit
```

Da una shell:

```
claude plugin install sidebar --marketplace xlollx/claude-code-cockpit
```

Finche' il repository e' privato, l'installazione funziona solo per chi lo puo' leggere su GitHub e ha gia' una credenziale git per github.com sulla propria macchina.

### Sviluppo

Clonare il repository e caricare la cartella in ogni sessione con la variabile `CLAUDE_CODE_PLUGIN_DIRS` nel `settings.json` utente (`env`), oppure `claude --plugin-dir <cartella>`. Dopo una modifica: `claude plugin validate <cartella>`. `tsconfig.json` estende i tipi che Claude Code genera in `.claude-plugin/types/` al primo caricamento.

## Extra

`extras/windows-terminal-ember-dark.json`: schema colori "Ember Dark" per Windows Terminal (da incollare in `schemes` del `settings.json` di Windows Terminal). In Claude Code, `/theme` -> "Dark mode (ANSI colors only)" usa la palette del terminale.

## Limiti di Claude Code

- La barra di scrittura e l'altezza del pannello agganciato non sono modificabili da una mod.
- Le righe `!` della shell e la riga `❯ /comando` le disegna Claude Code: non si colorano.
- Lo stato dei server MCP non e' esposto alle mod.
- Un menu a tendina (`Select`) tiene la tastiera finche' non si preme Esc: per questo modello ed effort sono pulsanti.
- Il markdown di Claude Code ignora le righe vuote dentro un elenco: per questo gli elenchi li disegna la mod.
- Le modalita' accese prima del caricamento della mod non risultano finche' non si rilancia la skill.

## Licenza

AGPL-3.0, vedi [LICENSE](LICENSE).

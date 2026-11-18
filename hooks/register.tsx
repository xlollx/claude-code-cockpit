import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderNode, SessionRateLimit } from 'claude-code'

import type { FileEdit, Reminder, Usage, Where, WriteCmd } from '../types'

const PANE = 'sidebar'
const TITLE = 'Sessione'
const usage = atom({ plugin: 'sidebar', key: 'usage' } as const, null, { shape: 'usage-1' })
const files = atom({ plugin: 'sidebar', key: 'files' } as const, [], { shape: 'files-1' })
const where = atom({ plugin: 'sidebar', key: 'where' } as const, {}, { shape: 'where-1' })
const writes = atom({ plugin: 'sidebar', key: 'writes' } as const, [], { shape: 'writes-1' })
const reminders = atom({ plugin: 'sidebar', key: 'reminders' } as const, [], { shape: 'reminders-1' })
const warned = atom({ plugin: 'sidebar', key: 'warned' } as const, false, { shape: 'warned-1' })
const enabled = atom({ plugin: 'sidebar', key: 'enabled' } as const, true, { shape: 'enabled-1' })
const effort = atom({ plugin: 'sidebar', key: 'effort' } as const, null, { shape: 'effort-1' })
// stesso grigio della cornice che Claude Code disegna attorno al pannello (non modificabile)
const PANE_BG = '#262626'

// Effort prima della prima richiesta: quello salvato per il modello nei settings
async function effortFromSettings($: EngineInterface) {
  const model = await $.session.model()
  const per = (await $.settings.read({ key: 'modelSettings' })) as Record<string, { effortLevel?: string }> | undefined
  const global = (await $.settings.read({ key: 'effortLevel' })) as string | undefined

  return per?.[model]?.effortLevel ?? global ?? null
}

const collapsed = atom({ plugin: 'sidebar', key: 'collapsed' } as const, [], { shape: 'collapsed-1' })
const modes = atom({ plugin: 'sidebar', key: 'modes' } as const, [], { shape: 'modes-1' })

// Skill che restano accese per la sessione, con la frase che le spegne
const MODE_SKILLS: Record<string, { label: string; stop: string }> = {
  'i-have-adhd': { label: 'i-have-adhd', stop: 'stop adhd mode' },
  caveman: { label: 'caveman', stop: 'stop caveman' },
  ultracave: { label: 'caveman', stop: 'stop caveman' },
  megacave: { label: 'caveman', stop: 'stop caveman' },
  ponytail: { label: 'ponytail', stop: 'stop ponytail' },
}
const modeName = (m: string) => m.split(' ')[0] ?? m

// Accende/spegne una modalita' a partire dal nome della skill e dai suoi argomenti
async function applyMode($: EngineInterface, skill: string, args: string) {
  const arg = (args.trim().split(/\s+/)[0] ?? '').toLowerCase()
  if (skill === 'panic') {
    if (arg !== 'restore' && arg !== 'status') {
      await update($, modes, () => [])
    }
    return
  }
  const def = MODE_SKILLS[skill]
  if (def === undefined || arg === 'status') {
    return
  }
  const level = ['lite', 'full', 'ultra'].includes(arg) ? ` ${arg}` : skill !== def.label ? ` ${skill}` : ''
  await update($, modes, ms => {
    const rest = ms.filter(m => modeName(m) !== def.label)
    return arg === 'off' ? rest : [...rest, def.label + level]
  })
}

async function toggleSection($: EngineInterface, id: string) {
  const cur = await read($, collapsed)
  const next = cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id]
  await update($, collapsed, () => next)
  await $.store.set('collapsed', next)
}

// Menu a tendina: /model <alias> e /effort <livello> applicano subito, senza selettore
const MODELS = ['fable', 'opus', 'sonnet', 'haiku'] as const
const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const

async function runOrFill($: EngineInterface, command: string, args: string) {
  try {
    await $.command.run({ command, args })
  } catch {
    await $.prompt.fill({ text: `/${command} ${args}` })
  }
}

async function setModel($: EngineInterface, alias: string) {
  await runOrFill($, 'model', alias)
  await measure($)
  await update($, effort, () => null)
  const eff = await effortFromSettings($)
  await update($, effort, () => eff)
}

async function setEffort($: EngineInterface, level: string) {
  await runOrFill($, 'effort', level)
  await update($, effort, () => level)
}

const since = (ms: number) => {
  const m = Math.floor(ms / 60000)
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${m % 60}m`
}

// Clic su modello/effort: apre il selettore del comando integrato; se il motore
// non lo lascia lanciare a una mod, scrive il comando nel prompt (basta Invio)
async function openPicker($: EngineInterface, command: 'model' | 'effort') {
  try {
    await $.command.run({ command })
  } catch {
    await $.prompt.fill({ text: `/${command}` })
  }
}
// rows: altezza chiesta quando il pannello sta sopra il prompt (finestra stretta); il dock la ignora
const openPane = ($: EngineInterface) => $.ui.open({ id: PANE, title: TITLE, backgroundColor: PANE_BG, rows: 3 })

const ACCENT = '#f5a97f'
const BLUE = '#6ea8f7'
const VIOLET = '#a98bdc'
const PROD = '#ef5f6b'
const USER_BG = '#1a1a20'
const CODE_BG = '#16161c'
const CODE_BAR = '#98c379'
// colonne libere tra la chat e la sidebar
const GAP = 3
// linea fra un turno e l'altro: appena piu' chiara dello sfondo
const TURN_RULE = '#2c2c36'

type Part = {
  text: string
  code?: string
  lang?: string
  table?: Table
  label?: string
  marker?: string
  spaced?: boolean
}

// larghezza massima del testo in prosa: righe piu' corte si leggono meglio
const PROSE_MAX = 100
const LIST_ITEM = /^(\d+[.)]|[-*+])\s/

// Righe-titolo scritte come testo semplice ("Il problema", "Rischio ...") seguite da un
// elenco: diventano un pezzo a parte, disegnato in grassetto colorato. Il testo non cambia
function splitLabels(md: string): Part[] {
  const lines = md.split('\n')
  const out: Part[] = []
  let buf: string[] = []
  const flush = () => {
    const text = buf.join('\n').replace(/^\n+|\n+$/g, '')
    if (text.trim() !== '') {
      out.push({ text })
    }
    buf = []
  }
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i] ?? ''
    const prev = i === 0 ? '' : (lines[i - 1] ?? '')
    // la riga dopo il titolo, saltando al massimo una riga vuota
    const nextL = (lines[i + 1] ?? '').trim() === '' ? (lines[i + 2] ?? '') : (lines[i + 1] ?? '')
    const isLabel =
      prev.trim() === '' &&
      /^\S/.test(l) &&
      l.trim().length <= 70 &&
      !LIST_ITEM.test(l) &&
      !/^[#>|]/.test(l) &&
      !/[.,;!?]$/.test(l.trim()) &&
      LIST_ITEM.test(nextL)
    if (isLabel) {
      flush()
      out.push({ text: '', label: l.trim().replace(/\*\*|`/g, '') })
    } else {
      buf.push(l)
    }
  }
  flush()
  return out
}

// Elenchi di primo livello disegnati dalla mod: un pezzo per punto, con il numero (o il
// pallino) colorato e il resto rientrato. Se l'elenco ha sottopunti, una riga vuota fra
// un punto e l'altro (il markdown del motore ignora le righe vuote dentro un elenco)
function splitLists(md: string): Part[] {
  const lines = md.split('\n')
  const out: Part[] = []
  let buf: string[] = []
  const flush = () => {
    const text = buf.join('\n').replace(/^\n+|\n+$/g, '')
    if (text.trim() !== '') {
      out.push({ text })
    }
    buf = []
  }
  for (let i = 0; i < lines.length; ) {
    if (!LIST_ITEM.test(lines[i] ?? '')) {
      buf.push(lines[i] ?? '')
      i++
      continue
    }
    flush()
    // blocco: punti di primo livello e righe rientrate che li continuano
    let j = i + 1
    while (j < lines.length && (LIST_ITEM.test(lines[j] ?? '') || /^\s+\S/.test(lines[j] ?? ''))) {
      j++
    }
    const block = lines.slice(i, j)
    const spaced = block.some(l => !LIST_ITEM.test(l))
    let first = true
    for (let n = 0; n < block.length; ) {
      const m = /^(\d+[.)]|[-*+])\s+(.*)$/.exec(block[n] ?? '')
      const body = [m?.[2] ?? '']
      n++
      while (n < block.length && !LIST_ITEM.test(block[n] ?? '')) {
        // sottopunti e righe di continuazione: tolto il rientro del punto padre
        body.push((block[n] ?? '').replace(/^ {1,4}/, ''))
        n++
      }
      const mk = m?.[1] ?? '-'
      out.push({ text: body.join('\n'), marker: /\d/.test(mk) ? mk : '•', spaced: spaced && !first })
      first = false
    }
    i = j
  }
  flush()
  return out
}

type Table = { header: string[]; rows: string[][] }

// Divide un testo markdown in pezzi di testo e tabelle (riga che inizia con |
// seguita da una riga di trattini), nell'ordine in cui compaiono
function splitTables(md: string): Part[] {
  const lines = md.split('\n')
  const cells = (l: string) =>
    l.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map(c => c.trim().replace(/\\\|/g, '|'))
  const out: Part[] = []
  let buf: string[] = []
  const flush = () => {
    const text = buf.join('\n').replace(/^\n+|\n+$/g, '')
    if (text.trim() !== '') {
      out.push({ text })
    }
    buf = []
  }
  for (let i = 0; i < lines.length; i++) {
    const head = lines[i] ?? ''
    const sep = lines[i + 1] ?? ''
    if (!head.trim().startsWith('|') || !/^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(sep)) {
      buf.push(head)
      continue
    }
    flush()
    const rows: string[][] = []
    let j = i + 2
    while (j < lines.length && (lines[j] ?? '').trim().startsWith('|')) {
      rows.push(cells(lines[j] ?? ''))
      j++
    }
    out.push({ text: lines.slice(i, j).join('\n'), table: { header: cells(head), rows } })
    i = j - 1
  }
  flush()

  return out
}

const HEAD_BG = '#25253a'
const ZEBRA_BG = '#15151b'
const TABLE_BORDER = '#4a4a5c'

// Va a capo dentro una cella: per parole, spezzando solo le parole piu' lunghe della colonna
function wrapCell(s: string, w: number): string[] {
  const out: string[] = []
  let line = ''
  for (const word of s.split(/\s+/).filter(Boolean)) {
    let rest = word
    while (rest.length > w) {
      if (line !== '') {
        out.push(line)
        line = ''
      }
      out.push(rest.slice(0, w))
      rest = rest.slice(w)
    }
    if (line === '') {
      line = rest
    } else if (line.length + 1 + rest.length <= w) {
      line += ' ' + rest
    } else {
      out.push(line)
      line = rest
    }
  }
  out.push(line)

  return out
}

// Righe fisiche gia' allineate, ognuna con la riga logica di appartenenza (0 = intestazione).
// Se la tabella non entra in maxW le colonne si restringono (le piu' larghe per prime) e il
// testo va a capo nella cella; null solo se non c'e' spazio nemmeno per 6 caratteri a colonna
function tableGrid(t: Table, maxW: number): { row: number; cells: string[] }[] | null {
  const n = Math.max(t.header.length, ...t.rows.map(r => r.length))
  const all = [t.header, ...t.rows].map(r => Array.from({ length: n }, (_, i) => cellText(r[i] ?? '')))
  const natural = Array.from({ length: n }, (_, i) => Math.max(1, ...all.map(r => (r[i] ?? '').length)))
  const room = maxW - (n - 1) - 2 * n
  if (room < 6 * n) {
    return null
  }
  // water-filling: le colonne strette tengono la loro larghezza, le altre si dividono il resto
  const widths = [...natural]
  if (natural.reduce((a, b) => a + b, 0) > room) {
    let left = room
    let open = Array.from({ length: n }, (_, i) => i)
    for (;;) {
      const share = Math.floor(left / open.length)
      const fit = open.filter(i => (natural[i] ?? 0) <= share)
      if (fit.length === 0) {
        for (const i of open) widths[i] = Math.max(6, share)
        break
      }
      for (const i of fit) {
        widths[i] = natural[i] ?? 0
        left -= natural[i] ?? 0
      }
      open = open.filter(i => !fit.includes(i))
      if (open.length === 0) break
    }
  }
  const lines: { row: number; cells: string[] }[] = []
  all.forEach((r, ri) => {
    const wrapped = r.map((c, i) => wrapCell(c, widths[i] ?? 1))
    const height = Math.max(...wrapped.map(x => x.length))
    for (let k = 0; k < height; k++) {
      lines.push({ row: ri, cells: wrapped.map((x, i) => ` ${(x[k] ?? '').padEnd(widths[i] ?? 0)} `) })
    }
  })

  return lines
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
// markdown inline della cella -> HTML (grassetto, codice) o testo semplice (TSV)
const cellHtml = (s: string) =>
  esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/`([^`]+)`/g, '<code style=\'font-family:Consolas,monospace\'>$1</code>')
const cellText = (s: string) => s.replace(/\*\*(.+?)\*\*/g, '$1').replace(/`([^`]+)`/g, '$1')

// Script PowerShell 5.1 (STA): appunti con HTML (Teams/Outlook) + testo a tabulazioni (Excel).
// Niente doppi apici: passa intatto come argomento. Dati via stdin in JSON solo ASCII.
const CLIP_PS = [
  '$d = [Console]::In.ReadToEnd() | ConvertFrom-Json',
  'Add-Type -AssemblyName System.Windows.Forms',
  '$enc = [Text.Encoding]::UTF8',
  '$nl = [string][char]13 + [char]10',
  "$tpl = 'Version:0.9' + $nl + 'StartHTML:{0:D10}' + $nl + 'EndHTML:{1:D10}' + $nl + 'StartFragment:{2:D10}' + $nl + 'EndFragment:{3:D10}' + $nl",
  "$pre = '<html><body><!--StartFragment-->'",
  "$post = '<!--EndFragment--></body></html>'",
  '$hl = $enc.GetByteCount(($tpl -f 0, 0, 0, 0))',
  '$sf = $hl + $enc.GetByteCount($pre)',
  '$ef = $sf + $enc.GetByteCount($d.html)',
  '$eh = $ef + $enc.GetByteCount($post)',
  '$cf = ($tpl -f $hl, $eh, $sf, $ef) + $pre + $d.html + $post',
  '$o = New-Object System.Windows.Forms.DataObject',
  "$o.SetData('HTML Format', (New-Object IO.MemoryStream (, $enc.GetBytes($cf))))",
  '$o.SetData([Windows.Forms.DataFormats]::UnicodeText, [string]$d.tsv)',
  '[Windows.Forms.Clipboard]::SetDataObject($o, $true)',
  "'ok'",
].join('\n')

async function copyTable($: EngineInterface, t: Table) {
  const td = 'border:1px solid #999;padding:4px 8px;'
  const html =
    '<table style=\'border-collapse:collapse;font-family:Segoe UI,sans-serif;font-size:10pt\'>' +
    '<tr>' + t.header.map(h => `<th style='${td}background:#f2f2f2;text-align:left'>${cellHtml(h)}</th>`).join('') + '</tr>' +
    t.rows.map(r => '<tr>' + r.map(c => `<td style='${td}'>${cellHtml(c)}</td>`).join('') + '</tr>').join('') +
    '</table>'
  const tsv = [t.header, ...t.rows].map(r => r.map(cellText).join('\t')).join('\r\n')
  const json = JSON.stringify({ html, tsv }).replace(/[\u007f-￿]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'))
  try {
    const r = await $.process.run(
      ['powershell.exe', '-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass', '-Command', CLIP_PS],
      { stdin: json, timeoutMs: 20000 },
    )
    $.ui.toast(r.exitCode === 0 && r.stdout.includes('ok')
      ? `Tabella copiata (${t.rows.length} righe): incollala in Teams, Outlook o Excel`
      : `Copia non riuscita: ${(r.stderr || r.stdout).trim().slice(0, 200)}`)
  } catch (err) {
    $.ui.toast(`Copia non riuscita: ${String(err).slice(0, 200)}`)
  }
}

// Divide il markdown in testo e blocchi ``` chiusi; un blocco non chiuso
// (risposta ancora in arrivo) resta testo e lo disegna il markdown
function splitCode(md: string): Part[] {
  const out: Part[] = []
  const fence = /^```([\w+#.-]*)[^\n]*\n([\s\S]*?)^```[ \t]*$/gm
  let last = 0
  for (let m = fence.exec(md); m !== null; m = fence.exec(md)) {
    const before = md.slice(last, m.index)
    if (before.trim() !== '') {
      out.push({ text: before.replace(/^\n+|\n+$/g, '') })
    }
    out.push({ text: '', code: (m[2] ?? '').replace(/\n$/, ''), lang: m[1] ?? '' })
    last = m.index + m[0].length
  }
  const rest = md.slice(last)
  if (rest.trim() !== '') {
    out.push({ text: rest.replace(/^\n+/, '') })
  }

  return out
}
// righe utente che sono slash command: lasciate al motore (vedi UserMessage). Le righe
// `!` della shell Claude Code le disegna da se': non passano da UserMessage
const COMMAND_ROW = /<(command-name|local-command-stdout|local-command-stderr)>|^\s*\/\S/

// Comandi con effetti all'esterno: IaC, az/kubectl/helm che scrivono, push, REST in scrittura
const WRITE_CMD = new RegExp(
  [
    String.raw`\b(tofu|terraform)\s+(apply|destroy|import|taint|untaint|force-unlock|state\s+(rm|mv|push))\b`,
    String.raw`\baz\s+(?:[a-z0-9-]+\s+){1,5}(create|delete|update|set|assign|start|stop|restart|deallocate|purge|import|invoke|add|remove|upgrade|failover|swap)\b`,
    String.raw`\bkubectl\s+(apply|delete|patch|scale|rollout\s+restart|edit|create|replace|annotate|label|drain|cordon|uncordon)\b`,
    String.raw`\bhelm\s+(install|upgrade|uninstall|rollback)\b`,
    String.raw`\bflux\s+(reconcile|suspend|resume)\b`,
    String.raw`\bgit\s+push\b`,
    String.raw`\b(Set|New|Remove|Update|Start|Stop|Restart)-(Az|Mg)\w+`,
    String.raw`(-Method|--method)\s+['"]?(post|put|patch|delete)\b`,
  ].join('|'),
  'i',
)
const isProd = (s?: string) => !!s && /prod/i.test(s) && !/no-?prod|non-?prod/i.test(s)

const kTok = (n?: number) => (n === undefined ? '?' : n >= 1000 ? `${Math.round(n / 1000)}k` : `${n}`)
const short = (p: string) => p.replace(/\\/g, '/').split('/').slice(-2).join('/')
const cut = (s: string, n: number) => (s.length > n ? s.slice(0, Math.max(1, n - 1)) + '…' : s)
const bar = (pct: number, width: number) => {
  const full = Math.round((Math.min(100, Math.max(0, pct)) / 100) * width)
  return '█'.repeat(full) + '░'.repeat(Math.max(0, width - full))
}
const dur = (ms: number) => {
  const s = ms / 1000
  if (s < 10) return `${s.toFixed(1)}s`
  if (s < 60) return `${Math.round(s)}s`
  return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`
}
// claude-opus-5-5 -> Opus 5.5 ; claude-haiku-4-5-20251001 -> Haiku 4.5 ; altri nomi invariati
const prettyModel = (id?: string) => {
  const m = /^claude-([a-z]+)-(\d+)(?:-(\d{1,2}))?(?:-\d{8})?(\[1m\])?$/.exec(id ?? '')
  if (!m || !m[1]) return id ?? 'Claude'
  const name = m[1].charAt(0).toUpperCase() + m[1].slice(1)

  return `${name} ${m[2]}${m[3] ? '.' + m[3] : ''}${m[4] ? ' 1M' : ''}`
}
const hhmm = (ms: number) => {
  const d = new Date(ms)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

async function home($: EngineInterface) {
  return ((await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME')) ?? '').replace(/\\/g, '/')
}

async function readText($: EngineInterface, path: string) {
  try {
    return (await $.fs.read(path)).replace(/^﻿/, '')
  } catch {
    return undefined
  }
}

async function measure($: EngineInterface) {
  const u = await $.session.usage()
  const next: Usage = {
    model: await $.session.model(),
    tokens: u.context.tokens,
    window: u.context.window,
    percent: u.context.percent,
    usd: u.cost?.usd,
    limits: u.rateLimits.map((r: SessionRateLimit) => ({ kind: r.kind, percentUsed: r.percentUsed })),
    startedAt: u.startedAt,
  }
  await update($, usage, () => next)

  // Avviso una volta quando il contesto si riempie; si riarma dopo un /compact
  const pct = next.percent ?? 0
  const isWarned = await read($, warned)
  if (pct >= 80 && !isWarned) {
    $.ui.toast(`Contesto al ${Math.round(pct)}%: valuta /compact prima di un'attivita' lunga`)
    await update($, warned, () => true)
  } else if (pct < 50 && isWarned) {
    await update($, warned, () => false)
  }
}

async function refreshWhere($: EngineInterface) {
  const h = await home($)
  const w: Where = {}
  const cwd = (await $.session.cwd()).replace(/\\/g, '/')
  w.cwd = (h && cwd.toLowerCase().startsWith(h.toLowerCase()) ? '~' + cwd.slice(h.length) : cwd).replace(/\//g, '\\')

  const az = await readText($, `${h}/.azure/azureProfile.json`)
  if (az) {
    try {
      const sub = (JSON.parse(az).subscriptions ?? []).find((s: { isDefault?: boolean }) => s.isDefault)
      w.azSub = sub?.name
      w.azTenant = sub?.tenantDisplayName ?? sub?.tenantDefaultDomain
    } catch {
      /* file in scrittura da az: si riprova al prossimo giro */
    }
  }

  const kubePath = ((await $.env.get('KUBECONFIG')) ?? '').split(';')[0] || `${h}/.kube/config`
  const kube = await readText($, kubePath)
  if (kube) {
    w.kube = /^current-context:\s*["']?([^\s"']+)/m.exec(kube)?.[1]
    for (const block of kube.split(/\n- context:/).slice(1)) {
      const body = block.split(/\n[a-zA-Z]/)[0] ?? ''
      if (/^\s*name:\s*["']?([^\s"']+)/m.exec(body)?.[1] === w.kube) {
        w.kubeNs = /^\s*namespace:\s*["']?([^\s"']+)/m.exec(body)?.[1]
      }
    }
  }

  try {
    const b = await $.process.run(['git', 'rev-parse', '--abbrev-ref', 'HEAD'], { timeoutMs: 5000 })
    if (b.exitCode === 0) {
      w.branch = b.stdout.trim()
      const s = await $.process.run(['git', 'status', '--porcelain'], { timeoutMs: 10000 })
      w.dirty = s.stdout.split('\n').filter(l => l.trim()).length
      // "<dietro>\t<avanti>" rispetto all'upstream; nessun upstream = exit != 0
      const ab = await $.process.run(['git', 'rev-list', '--left-right', '--count', '@{u}...HEAD'], { timeoutMs: 5000 })
      if (ab.exitCode === 0) {
        const [behind, ahead] = ab.stdout.trim().split(/\s+/).map(Number)
        w.behind = behind
        w.ahead = ahead
      }
    }
  } catch {
    /* git assente o lento: niente riga git */
  }

  await update($, where, () => w)
}

async function refreshReminders($: EngineInterface) {
  const text = await readText($, `${await home($)}/.claude/reminders.json`)
  let list: Reminder[] = []
  if (text) {
    try {
      const limit = new Date((await $.clock.now()) + 7 * 864e5).toISOString().slice(0, 16)
      list = (JSON.parse(text) as { due: string; title: string; done?: boolean }[])
        .filter(r => !r.done && r.due <= limit)
        .sort((a, b) => a.due.localeCompare(b.due))
        .map(r => ({ due: r.due, title: r.title }))
    } catch {
      /* JSON non valido: lista vuota */
    }
  }
  await update($, reminders, () => list)
}

async function refreshAll($: EngineInterface) {
  await Promise.all([measure($), refreshWhere($), refreshReminders($)])
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'sidebar', description: 'Apre il pannello laterale della sessione' })
    await $.command.register({
      name: 'newstyle',
      description: 'Stile OpenCode (sidebar, riquadri prompt, fine risposta): on | off',
      argumentHint: 'on | off',
    })
    const isOn = (await $.store.get('enabled')) !== false
    await update($, enabled, () => isOn)
    const initial = await effortFromSettings($)
    await update($, effort, cur => cur ?? initial)
    const savedCollapsed = (await $.store.get('collapsed')) as string[] | undefined
    await update($, collapsed, () => (Array.isArray(savedCollapsed) ? savedCollapsed : []))
    const ran = await next(e)
    await refreshAll($)
    // az account set / kubectl config use-context fatti fuori da qui: ricontrollo ogni 30 s
    $.clock.every(30_000, () => {
      void refreshWhere($)
    })
    $.clock.every(300_000, () => {
      void refreshReminders($)
    })
    if (isOn) {
      void openPane($)
    }

    return ran
  })

  on('command.run', { command: 'newstyle' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg !== 'on' && arg !== 'off') {
      const isOn = await read($, enabled)

      return { text: `newstyle e' ${isOn ? 'ON' : 'OFF'}. Uso: /newstyle on | /newstyle off` }
    }
    const isOn = arg === 'on'
    await $.store.set('enabled', isOn)
    await update($, enabled, () => isOn)
    if (isOn) {
      await refreshAll($)
      await openPane($)
    } else {
      await $.ui.close({ id: PANE })
    }

    return { text: isOn ? 'Stile OpenCode attivo.' : 'Stile originale di Claude Code ripristinato.' }
  })

  // Modalita' attive: si accendono con /nome (prompt.submit) o col tool Skill (tool.call),
  // si spengono con "off", con le frasi di stop, con "normal mode" o con /panic.
  // Non da skill.prompt: un altro plugin lo intercetta prima e l'hook viene saltato
  on('prompt.submit', async ($, e, next) => {
    if (e.command !== undefined) {
      await applyMode($, e.command.name, e.command.args)
      return next(e)
    }
    const t = e.text.toLowerCase()
    if (/\bnormal mode\b/.test(t)) {
      await update($, modes, () => [])
    } else {
      const stopped = Object.values(MODE_SKILLS).filter(s => t.includes(s.stop)).map(s => s.label)
      if (stopped.length > 0) {
        await update($, modes, ms => ms.filter(m => !stopped.includes(modeName(m))))
      }
    }
    return next(e)
  })

  on('command.run', { command: 'sidebar' }, async $ => {
    await refreshAll($)
    const r = await openPane($)

    return { text: r.isPlaced ? 'Pannello aperto.' : `Pannello non visibile: ${r.reason ?? 'terminale troppo stretto'}` }
  })

  // effort reale di ogni richiesta del loop principale (i subagent hanno agentId)
  on('turn.step', async function* ($, e, next) {
    if (e.agentId === undefined && e.effort !== undefined) {
      const level = String(e.effort)
      await update($, effort, () => level)
    }

    return yield* next(e)
  })

  on('session.measure', async ($, e, next) => {
    await measure($)

    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const input = e as unknown as { file_path?: string; notebook_path?: string; command?: string; skill?: string; args?: string }

    if (e.tool === 'Skill') {
      await applyMode($, input.skill ?? '', input.args ?? '')
      return next(e)
    }

    if (e.tool === 'Bash' || e.tool === 'PowerShell') {
      const ran = await next(e)
      const cmd = input.command ?? ''
      const m = WRITE_CMD.exec(cmd)
      if (m && ran.deny === undefined) {
        const line = cmd.slice(Math.max(0, cmd.lastIndexOf('\n', m.index) + 1)).split('\n')[0]?.trim() ?? ''
        const one: WriteCmd = { at: await $.clock.now(), text: line, ok: ran.isError !== true }
        await update($, writes, list => [one, ...list].slice(0, 30))
      }
      // un comando puo' aver cambiato subscription, contesto k8s o branch
      await refreshWhere($)

      return ran
    }

    if (e.tool === 'Edit' || e.tool === 'Write' || e.tool === 'NotebookEdit') {
      const ran = await next(e)
      const path = input.file_path ?? input.notebook_path
      if (path && ran.deny === undefined && ran.isError !== true) {
        await update($, files, list => {
          const found = list.find(f => f.path === path)
          const one: FileEdit = { path, edits: (found?.edits ?? 0) + 1 }

          return [one, ...list.filter(f => f.path !== path)].slice(0, 50)
        })
      }

      return ran
    }

    return next(e)
  })

  // I tuoi prompt in un riquadro: barra blu a sinistra + fondo grigio scuro.
  // Comandi (/comando, !bash) e i loro output: stesso riquadro con barra viola,
  // attorno alla riga che disegna il motore, cosi' la sua formattazione resta.
  on('ui.render', { component: 'UserMessage' }, async ($, e, next) => {
    if (!(await read($, enabled)) || e.props.origin.kind !== 'composer' || e.props.text.trim() === '') {
      return next(e)
    }
    const { Box, Text } = $.ui.resolve(e)

    // la riga di un /comando passa di qui solo come copia provvisoria, poi Claude Code
    // la ridisegna da se': colorarla farebbe solo un lampeggio (verificato 2026-11-18)
    if (COMMAND_ROW.test(e.props.text)) {
      return next(e)
    }

    return (
      <Box flexDirection="row" marginTop={1} marginRight={GAP}>
        <Box width={1} backgroundColor={BLUE} />
        <Box flexGrow={1} backgroundColor={USER_BG} paddingX={2} paddingY={1}>
          <Text>{e.props.text}</Text>
        </Box>
      </Box>
    )
  })

  // Risposte con blocchi di codice: testo in markdown normale, ogni blocco ```
  // in un riquadro con barra verde e fondo scuro, evidenziato per linguaggio
  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    if (!(await read($, enabled))) {
      return next(e)
    }
    const { Box, Button, Code, Markdown, Text } = $.ui.resolve(e)
    if (e.props.isSummary === true) {
      return <Box paddingRight={GAP}>{await next(e)}</Box>
    }
    // pezzi in ordine: testo, blocchi ``` e tabelle (le tabelle solo fuori dal codice)
    const pieces = splitCode(e.props.text)
      .flatMap(p => (p.code === undefined ? splitTables(p.text) : [p]))
      .flatMap(p => (p.code === undefined && p.table === undefined ? splitLabels(p.text) : [p]))
      .flatMap(p => (p.code === undefined && p.table === undefined && p.label === undefined ? splitLists(p.text) : [p]))
    const nTables = pieces.filter(p => p.table !== undefined).length
    let k = 0
    // larghezza utile della chat: viewport meno pallino, margine verso la sidebar e un po' di aria
    const maxW = Math.max(30, (e.viewport?.columns ?? 100) - 2 - GAP - 2)
    const proseW = Math.min(maxW, PROSE_MAX)

    return (
      <Box flexDirection="row" paddingRight={GAP}>
        <Box width={2} flexShrink={0}>
          <Text>{e.props.isFirstOfReply ? '● ' : '  '}</Text>
        </Box>
        <Box flexDirection="column" flexGrow={1} flexShrink={1}>
          {pieces.map((p, idx) => {
            const prev = idx > 0 ? pieces[idx - 1] : undefined
            // riga vuota fra un pezzo e l'altro, ma non in cima ne' fra un titolo e il suo elenco
            const top = prev === undefined || prev.label !== undefined ? 0 : 1
            if (p.code !== undefined) {
              return (
                <Box flexDirection="row" marginY={1}>
                  <Box width={1} backgroundColor={CODE_BAR} />
                  <Box flexDirection="column" flexGrow={1} backgroundColor={CODE_BG} paddingX={1}>
                    {p.lang !== '' && <Text dimColor>{p.lang}</Text>}
                    <Code source={p.code} language={p.lang || undefined} />
                  </Box>
                </Box>
              )
            }
            if (p.table !== undefined) {
              const t = p.table
              const i = ++k
              const grid = tableGrid(t, maxW - 2) // 2 colonne per il bordo esterno

              return (
                <Box flexDirection="column" marginY={1}>
                  {grid === null ? (
                    <Markdown text={p.text} />
                  ) : (
                    <Box flexDirection="column" borderStyle="round" borderColor={TABLE_BORDER} alignSelf="flex-start">
                      {grid.map(({ row: r, cells }) => (
                        <Text>
                          {cells.map((cell, c) => (
                            <Text>
                              {c > 0 && <Text dimColor backgroundColor={r === 0 ? HEAD_BG : r % 2 === 0 ? ZEBRA_BG : undefined}>│</Text>}
                              <Text
                                backgroundColor={r === 0 ? HEAD_BG : r % 2 === 0 ? ZEBRA_BG : undefined}
                                color={r === 0 ? BLUE : undefined}
                                bold={r === 0}
                              >
                                {cell}
                              </Text>
                            </Text>
                          ))}
                        </Text>
                      ))}
                    </Box>
                  )}
                  <Button key={`tab-${i}`} onPress={() => void copyTable($, t)}>
                    <Text color={BLUE}>⧉ Copia tabella{nTables > 1 ? ` ${i}` : ''}</Text>
                  </Button>
                </Box>
              )
            }

            if (p.label !== undefined) {
              return (
                <Box marginTop={prev === undefined ? 0 : 1}>
                  <Text bold color={ACCENT}>
                    {p.label}
                  </Text>
                </Box>
              )
            }

            if (p.marker !== undefined) {
              const w = p.marker.length + 1
              return (
                <Box flexDirection="row" width={proseW} marginTop={prev?.marker !== undefined && p.spaced !== true ? 0 : top}>
                  <Box width={w} flexShrink={0}>
                    <Text color={ACCENT}>{p.marker}</Text>
                  </Box>
                  <Box flexGrow={1} flexShrink={1}>
                    <Markdown text={p.text} />
                  </Box>
                </Box>
              )
            }

            return (
              <Box width={proseW} marginTop={top}>
                <Markdown text={p.text} />
              </Box>
            )
          })}
        </Box>
      </Box>
    )
  })

  on('ui.render', { component: 'CommandOutput' }, async ($, e, next) => {
    if (!(await read($, enabled))) {
      return next(e)
    }
    const { Box } = $.ui.resolve(e)

    return (
      <Box flexDirection="row" marginRight={GAP}>
        <Box width={1} backgroundColor={e.props.isErrored ? PROD : ACCENT} />
        <Box flexGrow={1} backgroundColor={USER_BG} paddingX={1}>
          {await next(e)}
        </Box>
      </Box>
    )
  })

  // Riga di fine risposta: "▣ modello · durata" al posto di "Crunched for 2m 29s"
  on('ui.render', { component: 'TurnDuration' }, async ($, e, next) => {
    if (!(await read($, enabled)) || e.props.waitingFor !== undefined || e.props.isExpanded === true) {
      return next(e)
    }
    const { Box, Text } = $.ui.resolve(e)
    const u = await read($, usage)
    const eff = await read($, effort)

    return (
      <Box flexDirection="column" marginTop={1}>
        <Text>
          <Text color={BLUE}>▣ </Text>
          <Text bold>{prettyModel(u?.model)}</Text>
          {eff !== null && (
            <Text>
              <Text dimColor>  ·  </Text>
              <Text color={VIOLET}>{eff}</Text>
            </Text>
          )}
          <Text dimColor>  ·  {dur(e.props.durationMs)}</Text>
        </Text>
        {/* linea sottile che chiude il turno: separa una domanda/risposta dalla successiva */}
        <Box marginTop={1}>
          <Text color={TURN_RULE}>{'─'.repeat(Math.max(10, (e.viewport?.columns ?? 100) - GAP - 2))}</Text>
        </Box>
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const u = await read($, usage)
    const eff = await read($, effort)
    const w = await read($, where)
    const wr = await read($, writes)
    const rem = await read($, reminders)
    const list = await read($, files)
    const act = await read($, modes)
    const ns = await read($, enabled)
    const cols = Math.max(20, (e.viewport?.columns ?? 40) - 4)
    const barW = Math.max(8, Math.min(24, cols - 10))
    const pct = u?.percent ?? 0
    const pctColor = pct >= 80 ? 'error' : pct >= 60 ? 'warning' : ACCENT
    const today = new Date(await $.clock.now()).toISOString().slice(0, 16)
    const prodAz = isProd(w.azSub)
    const prodKube = isProd(w.kube)
    const prodGit = w.branch === 'main' || w.branch === 'master'

    // Finestra stretta: il pannello sta sopra il prompt -> versione minimal su 2 righe
    if (e.props.placement === 'inline') {
      const dirShort = (w.cwd ?? '').split('\\').slice(-2).join('\\')
      const sep = <Text dimColor>  ·  </Text>

      return (
        <Box flexDirection="column" paddingX={1}>
          <Box flexDirection="row" flexWrap="wrap">
            <Text color={ACCENT}>{cut(dirShort || '—', 40)}</Text>
            {sep}
            <Text dimColor>az </Text>
            <Text color={prodAz ? PROD : undefined} bold={prodAz}>{w.azSub ?? '—'}</Text>
            {sep}
            <Text dimColor>k8s </Text>
            <Text color={prodKube ? PROD : undefined} bold={prodKube}>{w.kube ?? '—'}</Text>
            {w.branch !== undefined && (
              <Text>
                {sep}
                <Text dimColor>git </Text>
                <Text color={prodGit ? 'warning' : undefined}>{w.branch}</Text>
                {(w.dirty ?? 0) > 0 && <Text color="warning"> ●{w.dirty}</Text>}
              </Text>
            )}
          </Box>
          <Box flexDirection="row" flexWrap="wrap">
            <Button key="model-i" onPress={() => void openPicker($, 'model')}>
              <Text bold>{prettyModel(u?.model)}</Text>
            </Button>
            <Text> </Text>
            <Button key="effort-i" onPress={() => void openPicker($, 'effort')}>
              <Text color={VIOLET}>{eff ?? 'effort'}</Text>
            </Button>
            {sep}
            <Text color={pctColor}>{bar(pct, 10)} {Math.round(pct)}%</Text>
            {wr.length > 0 && (
              <Text>
                {sep}
                <Text color={PROD}>✎ {wr.length} scritture</Text>
              </Text>
            )}
            {list.length > 0 && <Text>{sep}<Text dimColor>{list.length} file</Text></Text>}
            {rem.length > 0 && (
              <Text>
                {sep}
                <Text color={rem.some(r => r.due <= today) ? 'error' : 'warning'}>⏰ {rem.length}</Text>
              </Text>
            )}
          </Box>
        </Box>
      )
    }

    // Sezione comprimibile: clic sul titolo apre/chiude, lo stato resta fra sessioni
    const closed = await read($, collapsed)
    const now = await $.clock.now()
    const section = (id: string, title: string, color: string, count: number | undefined, body: RenderNode) => {
      const isClosed = closed.includes(id)

      return (
        <Box flexDirection="column" marginBottom={1}>
          <Button key={`sec-${id}`} plain onPress={() => void toggleSection($, id)}>
            <Text bold color={color}>
              {isClosed ? '▸' : '▾'} {title}
              {count !== undefined ? <Text dimColor> ({count})</Text> : ''}
            </Text>
          </Button>
          {!isClosed && body}
        </Box>
      )
    }
    const fam = /^claude-([a-z]+)/.exec(u?.model ?? '')?.[1]
    const modelOptions = MODELS.map(m => ({ value: m, label: m.charAt(0).toUpperCase() + m.slice(1) }))
    const modelValue = fam !== undefined && (MODELS as readonly string[]).includes(fam) ? fam : undefined
    const effortValue = eff !== null && (EFFORTS as readonly string[]).includes(eff) ? eff : undefined

    return (
      <Box flexDirection="column" paddingLeft={6} paddingRight={2} paddingTop={1}>
        {section('dove', 'Dove operi', ACCENT, undefined,
          <Box flexDirection="column">
            <Box flexDirection="row">
              <Text dimColor>dir  </Text>
              <Box flexShrink={1}>
                <Text>{w.cwd ?? '—'}</Text>
              </Box>
            </Box>
            <Text>
              <Text dimColor>az   </Text>
              <Text color={prodAz ? PROD : undefined} bold={prodAz}>{cut(w.azSub ?? '—', cols - 5)}</Text>
            </Text>
            {w.azTenant && <Text dimColor>     {cut(w.azTenant, cols - 5)}</Text>}
            <Text>
              <Text dimColor>k8s  </Text>
              <Text color={prodKube ? PROD : undefined} bold={prodKube}>{cut(w.kube ?? '—', cols - 5)}</Text>
            </Text>
            {w.kubeNs && <Text dimColor>     ns {cut(w.kubeNs, cols - 8)}</Text>}
            <Text>
              <Text dimColor>git  </Text>
              {w.branch === undefined ? (
                <Text dimColor>non e' un repo</Text>
              ) : (
                <Text>
                  <Text color={prodGit ? 'warning' : undefined}>{cut(w.branch, cols - 16)}</Text>
                  {(w.dirty ?? 0) > 0 && <Text color="warning"> ●{w.dirty}</Text>}
                  {(w.ahead ?? 0) > 0 && <Text color="success"> ↑{w.ahead}</Text>}
                  {(w.behind ?? 0) > 0 && <Text color="warning"> ↓{w.behind}</Text>}
                </Text>
              )}
            </Text>
          </Box>,
        )}

        {section('modello', 'Modello', BLUE, undefined,
          <Box flexDirection="column">
            {/* pulsanti affiancati invece di un Select: il Select prende la tastiera e si chiude solo con Esc */}
            <Box flexDirection="row" flexWrap="wrap">
              {modelOptions.map(o => (
                <Button key={`m-${o.value}`} plain onPress={() => void setModel($, o.value)}>
                  <Text color={o.value === modelValue ? BLUE : undefined} bold={o.value === modelValue} inverse={o.value === modelValue} dimColor={o.value !== modelValue}>
                    {` ${o.label} `}
                  </Text>
                </Button>
              ))}
            </Box>
            <Box flexDirection="row" flexWrap="wrap">
              {EFFORTS.map(x => (
                <Button key={`e-${x}`} plain onPress={() => void setEffort($, x)}>
                  <Text color={x === effortValue ? VIOLET : undefined} bold={x === effortValue} inverse={x === effortValue} dimColor={x !== effortValue}>
                    {` ${x} `}
                  </Text>
                </Button>
              ))}
            </Box>
            <Text dimColor>{cut(u?.model ?? '', cols)}</Text>
          </Box>,
        )}

        {section('modalita', 'Modalità attive', VIOLET, act.length + (ns ? 1 : 0),
          <Box flexDirection="column">
            <Text dimColor={!ns}>
              <Text color={ns ? 'success' : undefined}>{ns ? '●' : '○'}</Text> newstyle{ns ? '' : ' (off)'}
            </Text>
            {act.map(m => (
              <Box flexDirection="row">
                <Text>
                  <Text color="success">●</Text> {cut(m, cols - 6)}{' '}
                </Text>
                <Button
                  key={`stop-${m}`}
                  plain
                  onPress={() => void $.prompt.fill({ text: MODE_SKILLS[modeName(m)]?.stop ?? `stop ${m}` })}
                >
                  <Text dimColor>✕</Text>
                </Button>
              </Box>
            ))}
          </Box>,
        )}

        {section('contesto', 'Contesto', BLUE, undefined,
          <Box flexDirection="column">
            <Text color={pctColor}>{bar(pct, barW)} {Math.round(pct)}%</Text>
            <Text dimColor>
              {kTok(u?.tokens)}/{kTok(u?.window)} token
            </Text>
            {u?.limits.map(l => (
              <Text dimColor>
                {l.kind === 'five_hour' ? 'limite 5h' : l.kind === 'seven_day' ? 'limite 7g' : l.kind} {Math.round(l.percentUsed)}%
              </Text>
            ))}
            {u?.startedAt !== undefined && <Text dimColor>sessione da {since(now - u.startedAt)}</Text>}
          </Box>,
        )}

        {section('azioni', 'Azioni rapide', VIOLET, undefined,
          <Box flexDirection="row" flexWrap="wrap">
            <Box marginRight={1}>
              <Button key="act-compact" onPress={() => void runOrFill($, 'compact', '')}>
                <Text>Compatta</Text>
              </Button>
            </Box>
            <Box marginRight={1}>
              <Button key="act-context" onPress={() => void runOrFill($, 'context', '')}>
                <Text>Contesto</Text>
              </Button>
            </Box>
            <Box marginRight={1}>
              <Button
                key="act-copydir"
                onPress={async press => {
                  const r = await $.ui.copy({ text: (await $.session.cwd()), surface: press.surface })
                  $.ui.toast(r.isCopied ? 'Percorso della cartella copiato' : 'Copia non riuscita')
                }}
              >
                <Text>Copia cartella</Text>
              </Button>
            </Box>
          </Box>,
        )}

        {section('scritture', 'Comandi di scrittura', wr.length > 0 ? PROD : VIOLET, wr.length,
          <Box flexDirection="column">
            {wr.length === 0 && <Text dimColor>nessuno in questa sessione</Text>}
            {wr.slice(0, 6).map(c => (
              <Text>
                <Text dimColor>{hhmm(c.at)} </Text>
                <Text color={c.ok ? 'success' : 'error'}>{c.ok ? '✓' : '✗'}</Text> {cut(c.text, cols - 8)}
              </Text>
            ))}
          </Box>,
        )}

        {rem.length > 0 &&
          section('promemoria', 'Promemoria', VIOLET, rem.length,
            <Box flexDirection="column">
              {rem.slice(0, 3).map(r => (
                <Text>
                  <Text color={r.due <= today ? 'error' : 'warning'}>{r.due.slice(8, 10)}/{r.due.slice(5, 7)}</Text> {cut(r.title, cols - 7)}
                </Text>
              ))}
            </Box>,
          )}

        {section('file', 'File modificati', ACCENT, list.length,
          <Box flexDirection="column">
            {list.length === 0 && <Text dimColor>nessuno</Text>}
            {list.slice(0, 8).map(f => (
              <Text>
                <Text color="success">●</Text> {cut(short(f.path), cols - 7)} <Text dimColor>×{f.edits}</Text>
              </Text>
            ))}
          </Box>,
        )}
      </Box>
    )
  })
}

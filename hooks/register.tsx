import { atom, read, update } from 'claude-code'
import type { EngineInterface, ProcessRunInit, Register, RenderElement, RenderNode, SessionRateLimit } from 'claude-code'

import type { FileEdit, ModelChoice, Peer, PipelineRun, PullRequest, Reminder, SearchResult, TaskItem, Usage, Where, WriteCmd } from '../types'

const PANE = 'sidebar'
const TITLE = 'Session'
const usage = atom({ plugin: 'cockpit', key: 'usage' } as const, null, { shape: 'usage-1' })
const files = atom({ plugin: 'cockpit', key: 'files' } as const, [], { shape: 'files-1' })
const where = atom({ plugin: 'cockpit', key: 'where' } as const, {}, { shape: 'where-1' })
const writes = atom({ plugin: 'cockpit', key: 'writes' } as const, [], { shape: 'writes-1' })
const reminders = atom({ plugin: 'cockpit', key: 'reminders' } as const, [], { shape: 'reminders-2' })
const warned = atom({ plugin: 'cockpit', key: 'warned' } as const, false, { shape: 'warned-1' })
const enabled = atom({ plugin: 'cockpit', key: 'enabled' } as const, true, { shape: 'enabled-1' })
const effort = atom({ plugin: 'cockpit', key: 'effort' } as const, null, { shape: 'effort-1' })
// same gray as the frame Claude Code draws around the panel (not changeable)
let PANE_BG = '#262626'

// Effort before the first request: the one saved for the model in the settings
async function effortFromSettings($: EngineInterface) {
  const model = await $.session.model()
  const per = (await $.settings.read({ key: 'modelSettings' })) as Record<string, { effortLevel?: string }> | undefined
  const global = (await $.settings.read({ key: 'effortLevel' })) as string | undefined

  return per?.[model]?.effortLevel ?? global ?? null
}

const collapsed = atom({ plugin: 'cockpit', key: 'collapsed' } as const, [], { shape: 'collapsed-1' })
const modes = atom({ plugin: 'cockpit', key: 'modes' } as const, [], { shape: 'modes-1' })
const models = atom({ plugin: 'cockpit', key: 'models' } as const, [] as ModelChoice[], { shape: 'models-1' })
const pr = atom({ plugin: 'cockpit', key: 'pr' } as const, null as PullRequest | null, { shape: 'pr-1' })
const tasks = atom({ plugin: 'cockpit', key: 'tasks' } as const, [] as TaskItem[], { shape: 'tasks-1' })
const search = atom({ plugin: 'cockpit', key: 'search' } as const, null as SearchResult | null, { shape: 'search-1' })
const pipes = atom({ plugin: 'cockpit', key: 'pipes' } as const, [] as PipelineRun[], { shape: 'pipes-1' })
const peers = atom({ plugin: 'cockpit', key: 'peers' } as const, [] as Peer[], { shape: 'peers-1' })
const peerTo = atom({ plugin: 'cockpit', key: 'peerTo' } as const, null as string | null, { shape: 'peerTo-1' })
const compactA = atom({ plugin: 'cockpit', key: 'compact' } as const, false, { shape: 'compact-1' })
const termLook = atom({ plugin: 'cockpit', key: 'termLook' } as const, 'na' as 'na' | 'pending' | 'done', { shape: 'termLook-1' })

// Skills that stay on for the session, with the phrase that turns them off
const MODE_SKILLS: Record<string, { label: string; stop: string }> = {
  'i-have-adhd': { label: 'i-have-adhd', stop: 'stop adhd mode' },
  caveman: { label: 'caveman', stop: 'stop caveman' },
  ultracave: { label: 'caveman', stop: 'stop caveman' },
  megacave: { label: 'caveman', stop: 'stop caveman' },
  ponytail: { label: 'ponytail', stop: 'stop ponytail' },
}
const modeName = (m: string) => m.split(' ')[0] ?? m

// The same modes asked for in words in a prompt (English or Italian)
const MODE_ON: Record<string, RegExp> = {
  'i-have-adhd': /\b(?:i[- ]have[- ]adhd|adhd)(?:[- ]mode)?\s*[:=]?\s*(?:on|attiva|attivo|attivala)\b|\b(?:attiva|accendi)\s+(?:la\s+)?(?:modalit[aà]\s+)?adhd\b/,
  caveman: /\bcaveman(?:[- ]mode)?\s*[:=]?\s*(?:on|attiva|attivo)\b|\btalk like (?:a )?caveman\b/,
  ponytail: /\bponytail(?:[- ]mode)?\s*[:=]?\s*(?:on|attiva|attivo)\b/,
}
const MODE_OFF: Record<string, RegExp> = {
  'i-have-adhd': /\b(?:i[- ]have[- ]adhd|adhd)(?:[- ]mode)?\s*[:=]?\s*(?:off|disattiva|spenta|spento)\b|\b(?:disattiva|spegni)\s+(?:la\s+)?(?:modalit[aà]\s+)?adhd\b/,
  caveman: /\bcaveman(?:[- ]mode)?\s*[:=]?\s*(?:off|disattiva)\b/,
  ponytail: /\bponytail(?:[- ]mode)?\s*[:=]?\s*(?:off|disattiva)\b/,
}

// Turns a mode on/off from the skill name and its arguments
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

// Buttons: /model <alias or id> and /effort <level> apply immediately, without a picker.
// Families with an alias always point to the latest version; the others (e.g. mythos) are
// added automatically as soon as they show up in use (turn.step, subagents too) or in the
// `model:` field of an agent in ~/.claude/agents, and persist across sessions ($.store)
const ALIASES = ['fable', 'opus', 'sonnet', 'haiku']
const TIER_ORDER = ['fable', 'mythos', 'opus', 'sonnet', 'haiku']
const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const

const familyOf = (id: string) => /^claude-([a-z]+)/.exec(id)?.[1] ?? (ALIASES.includes(id) ? id : undefined)

function sortModels(list: ModelChoice[]) {
  const rank = (f: string) => {
    const i = TIER_ORDER.indexOf(f)
    return i === -1 ? TIER_ORDER.length : i
  }
  return [...list].sort((a, b) => rank(a.family) - rank(b.family) || a.family.localeCompare(b.family))
}

// Registers a seen model: new family = new button; for families without an alias
// keeps the most recent id (e.g. claude-mythos-5-1 -> claude-mythos-5-2)
async function learnModel($: EngineInterface, id: string) {
  const family = familyOf(id)
  if (family === undefined || ALIASES.includes(family)) {
    return
  }
  const cur = await read($, models)
  const old = cur.find(m => m.family === family)
  if (old !== undefined && old.id.localeCompare(id, undefined, { numeric: true }) >= 0) {
    return
  }
  const next = sortModels([...cur.filter(m => m.family !== family), { family, id }])
  await update($, models, () => next)
  await $.store.set('models', next)
}

async function loadModels($: EngineInterface) {
  const saved = (await $.store.get('models')) as ModelChoice[] | undefined
  const base = ALIASES.map(a => ({ family: a, id: a }))
  const extra = Array.isArray(saved) ? saved.filter(m => !ALIASES.includes(m.family)) : []
  await update($, models, () => sortModels([...base, ...extra]))
  // models pinned in personal agents (frontmatter `model: claude-...`)
  const dir = `${await home($)}/.claude/agents`
  try {
    for (const f of await $.fs.list(dir)) {
      if (!f.name.endsWith('.md')) {
        continue
      }
      const id = /^model:\s*(claude-[\w.-]+)/m.exec((await readText($, `${dir}/${f.name}`)) ?? '')?.[1]
      if (id !== undefined) {
        await learnModel($, id)
      }
    }
  } catch {
    // no agents folder
  }
}

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

// Click on model/effort: opens the built-in command's picker; if the engine
// does not let a mod launch it, writes the command into the prompt (just press Enter)
async function openPicker($: EngineInterface, command: 'model' | 'effort') {
  try {
    await $.command.run({ command })
  } catch {
    await $.prompt.fill({ text: `/${command}` })
  }
}
// rows: height requested when the panel sits above the prompt (narrow window); the dock ignores it
// panelWidth option: columns of the docked panel (Claude Code keeps it between 24 and 45% of
// the terminal; a width dragged by hand wins); 0 = Claude Code's own share
let PANEL_COLS = 0
// compact mode: the ⇥ button next to the panel's ✕ closes the side panel and shows the 2-line
// summary as a band above the prompt; ⇤ expand there brings the panel back. Remembered
let COMPACT = false
const openPane = ($: EngineInterface) =>
  $.ui.open({ id: PANE, title: TITLE, backgroundColor: PANE_BG, rows: 3, ...(PANEL_COLS > 0 ? { columns: PANEL_COLS } : {}) })

async function toggleCompact($: EngineInterface) {
  COMPACT = !COMPACT
  await $.store.set('compact', COMPACT)
  await update($, compactA, () => COMPACT)
  if (COMPACT) {
    await $.ui.close({ id: PANE })
  } else {
    await openPane($)
  }
}

let ACCENT = '#f5a97f'
// sub-list numbers and dashes: the accent, softer
let ACCENT_SOFT = '#b88468'
let BLUE = '#6ea8f7'
let VIOLET = '#a98bdc'
let PROD = '#ef5f6b'
let USER_BG = '#2b2b2f'
let CODE_BG = '#262629'
// background of tool results (Wrote/Read previews, command output)
let TOOL_BG = '#28282c'
let TOOL_BAR = '#5c5c66'
let CODE_BAR = '#98c379'
// free columns between the chat and the sidebar
const GAP = 3
// line between one turn and the next: slightly lighter than the background
let CODE_INLINE = '#56b6c2'
let HL_BG = '#6b5310'
let HL_FG = '#ffe28a'
let TURN_RULE = '#3a3a40'

type Part = {
  text: string
  code?: string
  lang?: string
  table?: Table
  label?: string
  marker?: string
  spaced?: boolean
}

// maximum width of prose text: shorter lines read better
let PROSE_MAX = 100
const LIST_ITEM = /^(\d+[.)]|[-*+])\s/

// Heading lines written as plain text ("Il problema", "Rischio ...") followed by a
// list, or closing a text piece that a table follows: they become a separate piece,
// drawn in colored bold. The text does not change
function splitLabels(md: string, beforeTable = false): Part[] {
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
    // the line after the heading, skipping at most one blank line
    const nextL = (lines[i + 1] ?? '').trim() === '' ? (lines[i + 2] ?? '') : (lines[i + 1] ?? '')
    const isLabel =
      prev.trim() === '' &&
      /^\S/.test(l) &&
      l.trim().length <= 70 &&
      !LIST_ITEM.test(l) &&
      !/^[#>|]/.test(l) &&
      !/[.,;!?]$/.test(l.trim()) &&
      (LIST_ITEM.test(nextL) || (beforeTable && lines.slice(i + 1).every(x => x.trim() === '')))
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

// Top-level lists drawn by the mod: one piece per item, with the number (or the
// bullet) colored and the rest indented. If the list has sub-items, a blank line between
// one item and the next (the engine's markdown ignores blank lines inside a list)
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
    // block: top-level items and indented lines that continue them
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
        // sub-items and continuation lines: parent item's indentation removed
        body.push((block[n] ?? '').replace(/^ {1,4}/, ''))
        n++
      }
      const mk = m?.[1] ?? '-'
      // a list right after another list (a blank line between them) starts on its own line
      const afterList = first && out.length > 0 && out[out.length - 1]?.marker !== undefined
      out.push({ text: body.join('\n'), marker: /\d/.test(mk) ? mk : '•', spaced: (spaced && !first) || afterList })
      first = false
    }
    i = j
  }
  flush()
  return out
}

type Table = { header: string[]; rows: string[][] }

// Quoted blocks ("> ...") as pieces of their own, apart from the text around them
function splitQuotes(md: string): Part[] {
  const out: Part[] = []
  let buf: string[] = []
  let inQuote = false
  const flush = () => {
    const text = buf.join('\n').replace(/^\n+|\n+$/g, '')
    if (text.trim() !== '') {
      out.push({ text })
    }
    buf = []
  }
  for (const line of md.split('\n')) {
    const q = /^>/.test(line)
    if (q !== inQuote && line.trim() !== '') {
      flush()
      inQuote = q
    }
    buf.push(line)
  }
  flush()
  return out
}

// Splits a markdown text into text pieces and tables (line starting with |
// followed by a line of dashes), in the order they appear
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

let HEAD_BG = '#33334a'
let ZEBRA_BG = '#252528'
let TABLE_BORDER = '#55556a'

// Wraps inside a cell: by words, splitting only the words longer than the column
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

// Physical lines already aligned, each with the logical line it belongs to (0 = header).
// If the table does not fit in maxW the columns shrink (widest first) and the
// text wraps inside the cell; null only if there is no room even for 6 characters per column
function tableGrid(t: Table, maxW: number): { row: number; cells: string[] }[] | null {
  const n = Math.max(t.header.length, ...t.rows.map(r => r.length))
  const all = [t.header, ...t.rows].map(r => Array.from({ length: n }, (_, i) => cellText(r[i] ?? '')))
  const natural = Array.from({ length: n }, (_, i) => Math.max(1, ...all.map(r => (r[i] ?? '').length)))
  const room = maxW - (n - 1) - 2 * n
  if (room < 6 * n) {
    return null
  }
  // water-filling: narrow columns keep their width, the others share the rest
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
// cell inline markdown -> HTML (bold, code) or plain text (TSV)
const cellHtml = (s: string) =>
  esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/`([^`]+)`/g, '<code style=\'font-family:Consolas,monospace\'>$1</code>')
const cellText = (s: string) => s.replace(/\*\*(.+?)\*\*/g, '$1').replace(/`([^`]+)`/g, '$1')

// PowerShell 5.1 script (STA): clipboard with HTML (Teams/Outlook) + tab-separated text (Excel).
// No double quotes: passes through intact as an argument. Data via stdin as ASCII-only JSON.
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

// Clipboard image -> PNG file -> its path in the prompt, so a screenshot can be pasted
// without saving or dragging a file. Windows: PowerShell (also takes a file copied in
// Explorer). macOS: osascript. Linux: wl-paste or xclip. The file goes to a temp folder
const PASTE_PS = [
  '$p = [Console]::In.ReadLine()',
  'Add-Type -AssemblyName System.Windows.Forms',
  'Add-Type -AssemblyName System.Drawing',
  '$files = [Windows.Forms.Clipboard]::GetFileDropList()',
  "if ($files.Count -gt 0) { 'file:' + $files[0]; exit 0 }",
  '$img = [Windows.Forms.Clipboard]::GetImage()',
  "if ($null -eq $img) { 'none'; exit 0 }",
  '$null = New-Item -ItemType Directory -Force -Path (Split-Path -LiteralPath $p)',
  '$img.Save($p, [Drawing.Imaging.ImageFormat]::Png)',
  "'ok:' + $p",
].join('\n')

async function pasteImage($: EngineInterface) {
  const d = new Date(await $.clock.now())
  const pad = (n: number) => String(n).padStart(2, '0')
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  try {
    const os = await platform($)
    let path: string | undefined
    if (os === 'windows') {
      const tmp = (await $.env.get('TEMP')) ?? `${await home($)}/AppData/Local/Temp`
      const target = `${tmp}\\claude-cockpit\\clip-${stamp}.png`
      const r = await run($, 
        ['powershell.exe', '-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass', '-Command', PASTE_PS],
        { stdin: target + '\n', timeoutMs: 20000 },
      )
      const out = r.stdout.trim()
      path = out.startsWith('ok:') ? out.slice(3) : out.startsWith('file:') ? out.slice(5) : undefined
    } else {
      // private folder from mktemp (mode 700, unpredictable name): never a shared /tmp path
      const mk = `d=$(mktemp -d "\${TMPDIR:-/tmp}/claude-cockpit.XXXXXX") && f="$d/clip-${stamp}.png"`
      const sh =
        os === 'mac'
          ? `${mk} && osascript -e 'on run argv' -e 'set f to open for access (POSIX file (item 1 of argv)) with write permission' -e 'write (the clipboard as «class PNGf») to f' -e 'close access f' -e 'end run' "$f" && echo "$f"`
          : `${mk} && (wl-paste --type image/png > "$f" 2>/dev/null || xclip -selection clipboard -t image/png -o > "$f") && [ -s "$f" ] && echo "$f"`
      const r = await run($, ['sh', '-c', sh], { timeoutMs: 20000 })
      path = r.exitCode === 0 && r.stdout.trim() !== '' ? r.stdout.trim() : undefined
    }
    if (path === undefined) {
      $.ui.toast('No image in the clipboard')
      return
    }
    await $.prompt.fill({ text: ` ${path} `, mode: 'insert' })
    $.ui.toast('Image saved, path added to the prompt')
  } catch (err) {
    $.ui.toast(`Paste failed: ${String(err).slice(0, 200)}`)
  }
}

async function copyTable($: EngineInterface, t: Table) {
  const td = 'border:1px solid #999;padding:4px 8px;'
  const html =
    '<table style=\'border-collapse:collapse;font-family:Segoe UI,sans-serif;font-size:10pt\'>' +
    '<tr>' + t.header.map(h => `<th style='${td}background:#f2f2f2;text-align:left'>${cellHtml(h)}</th>`).join('') + '</tr>' +
    t.rows.map(r => '<tr>' + r.map(c => `<td style='${td}'>${cellHtml(c)}</td>`).join('') + '</tr>').join('') +
    '</table>'
  const tsv = [t.header, ...t.rows].map(r => r.map(cellText).join('\t')).join('\r\n')
  await copyRich($, html, tsv, `Table copied (${t.rows.length} rows): paste it into Teams, Outlook or Excel`)
}

// A table as text with aligned columns and a dashed line under the header: compact where an
// app restyles pasted HTML tables (Teams), pasted into a code block
function tableText(t: Table) {
  const rows = [t.header, ...t.rows].map(r => r.map(cellText))
  const n = Math.max(...rows.map(r => r.length))
  const w = Array.from({ length: n }, (_, c) => Math.max(...rows.map(r => (r[c] ?? '').length)))
  const line = (r: string[]) => w.map((x, c) => (r[c] ?? '').padEnd(x)).join('  ').trimEnd()
  return [line(rows[0] ?? []), w.map(x => '-'.repeat(x)).join('  '), ...rows.slice(1).map(line)].join('\n')
}

// Inline markdown -> HTML: bold, italics, code, [links](url) and bare URLs
function inlineHtml(md: string) {
  const urls: string[] = []
  const keep = (h: string) => `\u0000${urls.push(h) - 1}\u0000`
  return esc(md)
    .replace(/`([^`]+)`/g, (_, c: string) => keep(`<code style='font-family:Consolas,monospace'>${c}</code>`))
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, (_, t: string, u: string) => keep(`<a href='${u}'>${t}</a>`))
    .replace(/https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"]/g, u => keep(`<a href='${u}'>${u}</a>`))
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?!\*)/g, '$1<i>$2</i>')
    .replace(/(^|\W)_([^_\s][^_]*?)_(?=\W|$)/g, '$1<i>$2</i>')
    .replace(/\u0000(\d+)\u0000/g, (_, n: string) => urls[Number(n)] ?? '')
}

// Markdown text (paragraphs, headings, bulleted and numbered lists, one level of nesting)
// -> HTML that Teams, Outlook, Word and web forms paste with its formatting
function mdHtml(md: string) {
  const out: string[] = []
  const stack: { tag: 'ul' | 'ol'; indent: number }[] = []
  const closeTo = (indent: number) => {
    while (stack.length > 0 && (stack[stack.length - 1]?.indent ?? 0) >= indent) {
      out.push(`</${stack.pop()?.tag}>`)
    }
  }
  let para: string[] = []
  const flush = () => {
    if (para.length > 0) {
      out.push(`<p>${para.map(inlineHtml).join('<br>')}</p>`)
      para = []
    }
  }
  for (const line of md.split('\n')) {
    const li = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(line)
    const hd = /^#{1,6}\s+(.*)$/.exec(line)
    if (li) {
      flush()
      const indent = (li[1] ?? '').length
      const tag = /\d/.test(li[2] ?? '') ? 'ol' : 'ul'
      const top = stack[stack.length - 1]
      if (top === undefined || indent > top.indent) {
        out.push(`<${tag}>`)
        stack.push({ tag, indent })
      } else {
        closeTo(indent + 1)
        if (stack.length === 0 || stack[stack.length - 1]?.tag !== tag) {
          closeTo(indent)
          out.push(`<${tag}>`)
          stack.push({ tag, indent })
        }
      }
      out.push(`<li>${inlineHtml(li[3] ?? '')}</li>`)
    } else if (line.trim() === '') {
      flush()
      closeTo(0)
    } else if (hd) {
      flush()
      closeTo(0)
      out.push(`<p><b>${inlineHtml(hd[1] ?? '')}</b></p>`)
    } else if (stack.length > 0 && /^\s+\S/.test(line)) {
      // continuation of a list item
      out[out.length - 1] = (out[out.length - 1] ?? '').replace(/<\/li>$/, `<br>${inlineHtml(line.trim())}</li>`)
    } else {
      closeTo(0)
      para.push(line)
    }
  }
  flush()
  closeTo(0)
  return `<div style='font-family:Segoe UI,sans-serif;font-size:10.5pt'>${out.join('')}</div>`
}

// Markdown text -> plain text for editors without HTML: markers removed, links as "text (url)"
const mdPlain = (md: string) =>
  md
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '$1 ($2)')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?!\*)/g, '$1$2')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\n/g, '\r\n')

// The text of the quoted blocks ("> ...") in a piece, quote markers removed
function quoteOf(md: string) {
  const lines = md.split('\n')
  if (!lines.some(l => /^>/.test(l))) {
    return ''
  }
  return lines
    .filter(l => /^>/.test(l))
    .map(l => l.replace(/^>\s?/, ''))
    .join('\n')
    .trim()
}

// Clipboard with HTML (formatting kept in Teams, Outlook, Word, web forms) and plain text
async function copyRich($: EngineInterface, html: string, tsv: string, ok: string) {
  try {
    const os = await platform($)
    if (os === 'windows') {
      // HTML + tab-separated text in one clipboard entry, via PowerShell (STA)
      const json = JSON.stringify({ html, tsv }).replace(/[\u007f-￿]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'))
      const r = await run($, 
        ['powershell.exe', '-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass', '-Command', CLIP_PS],
        { stdin: json, timeoutMs: 20000 },
      )
      $.ui.toast(r.exitCode === 0 && r.stdout.includes('ok') ? ok : `Copy failed: ${(r.stderr || r.stdout).trim().slice(0, 200)}`)
      return
    }
    if (os === 'mac') {
      // HTML + plain text in one clipboard entry, via AppleScript
      const str = tsv.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
      const script = `set the clipboard to {«class HTML»:«data HTML${utf8Hex(html)}», string:"${str}"}`
      const r = await run($, ['osascript', '-'], { stdin: script, timeoutMs: 20000 })
      $.ui.toast(r.exitCode === 0 ? ok : `Copy failed: ${(r.stderr || r.stdout).trim().slice(0, 200)}`)
      return
    }
    // Linux: HTML through wl-copy (Wayland) or xclip (X11)
    for (const argv of [['wl-copy', '--type', 'text/html'], ['xclip', '-selection', 'clipboard', '-t', 'text/html']]) {
      try {
        const r = await run($, argv, { stdin: html, timeoutMs: 20000 })
        if (r.exitCode === 0) {
          $.ui.toast(ok)
          return
        }
      } catch {
        // tool not installed: try the next one
      }
    }
    $.ui.toast('Copy failed: install wl-clipboard (Wayland) or xclip (X11)')
  } catch (err) {
    $.ui.toast(`Copy failed: ${String(err).slice(0, 200)}`)
  }
}

// Operating system the mod runs on, for the clipboard
async function platform($: EngineInterface): Promise<'windows' | 'mac' | 'linux'> {
  if ((await $.env.get('OS')) === 'Windows_NT') {
    return 'windows'
  }
  try {
    const r = await $.process.run(['uname', '-s'], { timeoutMs: 3000 })
    return r.stdout.trim() === 'Darwin' ? 'mac' : 'linux'
  } catch {
    return 'linux'
  }
}

// Absolute path of a command, looked up in PATH only. On Windows a bare name is searched in the
// current folder first, so a cloned repo holding its own git.exe or az.cmd would run instead
const BIN: Record<string, string> = {}

async function bin($: EngineInterface, name: string): Promise<string> {
  const known = BIN[name]
  if (known !== undefined) {
    return known
  }
  const path = (await $.env.get('PATH')) ?? (await $.env.get('Path')) ?? ''
  const exts = ((await $.env.get('PATHEXT')) ?? '.COM;.EXE;.BAT;.CMD').split(';').filter(x => x !== '')
  for (const raw of path.split(';')) {
    const dir = raw.trim().replace(/^"|"$/g, '').replace(/[\\/]+$/, '')
    if (!/^([a-z]:|\\\\)/i.test(dir)) {
      continue // relative entries ('.', '') would mean the current folder
    }
    for (const ext of /\.[a-z]+$/i.test(name) ? [''] : exts) {
      const full = `${dir}\\${name}${ext}`
      if (await $.fs.exists(full)) {
        BIN[name] = full
        return full
      }
    }
  }
  throw new Error(`${name} not found in PATH`)
}

// $.process.run with the command resolved to an absolute path on Windows; a .cmd/.bat (az) runs
// through cmd.exe from its own folder, so cmd cannot pick up a same-named file elsewhere
async function run($: EngineInterface, argv: readonly string[], init?: ProcessRunInit) {
  if ((await platform($)) !== 'windows') {
    return $.process.run(argv, init)
  }
  const [name = '', ...rest] = argv
  const exe = await bin($, name)
  if (/\.(cmd|bat)$/i.test(exe)) {
    const root = (await $.env.get('SystemRoot')) ?? (await $.env.get('SYSTEMROOT')) ?? 'C:\\Windows'
    const cut = exe.lastIndexOf('\\')
    return $.process.run([`${root}\\System32\\cmd.exe`, '/d', '/c', exe.slice(cut + 1), ...rest], { ...init, cwd: exe.slice(0, cut) })
  }
  return $.process.run([exe, ...rest], init)
}

// UTF-8 bytes of a string as uppercase hex (AppleScript «data HTML...»)
const utf8Hex = (s: string) =>
  encodeURIComponent(s)
    .replace(/%([0-9A-Fa-f]{2})|([^%])/g, (_m, h: string | undefined, c: string | undefined) =>
      h ?? (c ?? '').charCodeAt(0).toString(16).padStart(2, '0'),
    )
    .toUpperCase()

// Splits markdown into text and closed ``` blocks; an unclosed block
// (response still streaming in) stays text and is drawn by the markdown
function splitCode(md: string): Part[] {
  const out: Part[] = []
  // fences may be indented (a code block inside a list item): same indent to close it
  const fence = /^([ \t]*)```([\w+#.-]*)[^\n]*\n([\s\S]*?)^\1```[ \t]*$/gm
  let last = 0
  for (let m = fence.exec(md); m !== null; m = fence.exec(md)) {
    const before = md.slice(last, m.index)
    if (before.trim() !== '') {
      out.push({ text: before.replace(/^\n+|\n+$/g, '') })
    }
    const indent = (m[1] ?? '').length
    const code = (m[3] ?? '')
      .replace(/\n$/, '')
      .split('\n')
      .map(l => l.slice(Math.min(indent, l.length - l.trimStart().length)))
      .join('\n')
    out.push({ text: '', code, lang: m[2] ?? '' })
    last = m.index + m[0].length
  }
  const rest = md.slice(last)
  if (rest.trim() !== '') {
    out.push({ text: rest.replace(/^\n+/, '') })
  }

  return out
}
// user lines that are slash commands: left to the engine (see UserMessage). Claude Code
// draws the `!` shell lines itself: they never go through UserMessage
const COMMAND_ROW = /<(command-name|local-command-stdout|local-command-stderr)>|^\s*\/\S/

// Commands with outside effects: IaC, az/kubectl/helm writes, push, REST writes
// Commands with effects outside the machine: IaC, az/kubectl/helm writes, pushes, REST writes.
// Matched only at the START of each command segment (after `&&`, `;`, `|`, newlines),
// with quoted text and heredoc bodies removed: `grep "git push"` or a commit message
// that mentions `tofu apply` is not a write
const WRITE_HEADS = [
  String.raw`(tofu|terraform)\s+(apply|destroy|import|taint|untaint|force-unlock|state\s+(rm|mv|push))\b`,
  String.raw`az\s+(?:[a-z0-9-]+\s+){1,5}(create|delete|update|set|assign|start|stop|restart|deallocate|purge|import|invoke|add|remove|upgrade|failover|swap)\b`,
  String.raw`kubectl\s+(apply|delete|patch|scale|rollout\s+restart|edit|create|replace|annotate|label|drain|cordon|uncordon)\b`,
  String.raw`helm\s+(install|upgrade|uninstall|rollback)\b`,
  String.raw`flux\s+(reconcile|suspend|resume)\b`,
  String.raw`git\s+(?:-C\s+\S+\s+)?push\b`,
  String.raw`gh\s+(pr\s+(create|merge|close)|release\s+create|repo\s+(create|delete|edit))\b`,
  String.raw`(Set|New|Remove|Update|Start|Stop|Restart)-(Az|Mg)\w+`,
]
const WRITE_HEAD = new RegExp(`^(?:${WRITE_HEADS.join('|')})`, 'i')
const REST_HEAD = /^(curl|Invoke-RestMethod|Invoke-WebRequest|irm|iwr|az\s+rest)\b/i
const REST_WRITE = /(-Method|--method|-X|--request)\s+(post|put|patch|delete)\b/i

// The first write command in a shell command line, as written, or undefined
function findWrite(cmd: string): string | undefined {
  const lines: string[] = []
  let heredoc: string | undefined
  for (const l of cmd.split('\n')) {
    if (heredoc !== undefined) {
      if (l.trim() === heredoc) {
        heredoc = undefined
      }
      continue
    }
    lines.push(l)
    heredoc = /<<-?\s*['"]?(\w+)['"]?/.exec(l)?.[1]
  }
  for (const seg of lines.join('\n').split(/&&|\|\||;|\||\n/)) {
    const bare = seg
      .replace(/'[^']*'|"[^"]*"/g, '""')
      .trim()
      .replace(/^(?:\w+=\S*\s+|sudo\s+|time\s+|&\s*|\$\w+\s*=\s*)+/, '')
    if (WRITE_HEAD.test(bare) || (REST_HEAD.test(bare) && REST_WRITE.test(bare))) {
      return seg.trim()
    }
  }
  return undefined
}

// MCP tools that change something outside: by the tool's name (kubectl_apply, git_push,
// repo_create_branch, wit_work_item_write...) or by its `command` input (Azure MCP)
const MCP_WRITE = /(?:^|_)(apply|delete|patch|scale|create|install|upgrade|uninstall|push|write|upsert|rollout|run|merge|update|set|start|stop|restart|assign)(?:_|$)/i

function mcpWrite(tool: string, input: Record<string, unknown>): string | undefined {
  const m = /^mcp__([^_]+(?:-[^_]+)*)__(.+)$/.exec(tool)
  if (m === null) {
    return undefined
  }
  const command = typeof input.command === 'string' ? input.command : ''
  if (!MCP_WRITE.test(m[2] ?? '') && !MCP_WRITE.test(command)) {
    return undefined
  }
  return `${m[1]}: ${m[2]}${command !== '' ? ` ${command}` : ''}`
}
let PROD_RX = /prod/i
const isProd = (s?: string) => !!s && PROD_RX.test(s) && !/no-?prod|non-?prod/i.test(s)

// ---------- Options (plugin userConfig; /config or settings.json pluginConfigs.cockpit.options) ----------

const PALETTES = {
  dark: {
    PANE_BG: '#262626', ACCENT: '#f5a97f', ACCENT_SOFT: '#b88468', BLUE: '#6ea8f7', VIOLET: '#a98bdc', PROD: '#ef5f6b',
    USER_BG: '#2b2b2f', CODE_BG: '#262629', TOOL_BG: '#28282c', TOOL_BAR: '#5c5c66', CODE_BAR: '#98c379', TURN_RULE: '#3a3a40',
    HEAD_BG: '#33334a', ZEBRA_BG: '#252528', TABLE_BORDER: '#55556a', HL_BG: '#6b5310', HL_FG: '#ffe28a', CODE_INLINE: '#56b6c2',
  },
  light: {
    PANE_BG: '#ececec', ACCENT: '#c2410c', ACCENT_SOFT: '#e29470', BLUE: '#1d4ed8', VIOLET: '#6d28d9', PROD: '#b91c1c',
    USER_BG: '#eef2f7', CODE_BG: '#f4f4f5', TOOL_BG: '#f1f1f3', TOOL_BAR: '#a1a1aa', CODE_BAR: '#16a34a', TURN_RULE: '#d4d4d8',
    HEAD_BG: '#dbe4f3', ZEBRA_BG: '#f5f5f7', TABLE_BORDER: '#a1a1aa', HL_BG: '#fde68a', HL_FG: '#78350f', CODE_INLINE: '#0e7490',
  },
}

// option name of a section -> id used for its folded state
const SECTION_IDS: Record<string, string> = {
  search: 'search', pipelines: 'pipelines', where: 'dove', model: 'modello', modes: 'modalita', context: 'contesto', pr: 'pr', tasks: 'tasks',
  actions: 'azioni', writes: 'scritture', reminders: 'promemoria', files: 'file', sessions: 'sessioni',
}
let HIDDEN = new Set<string>()
let CC_VERSION = ''
let OPEN_ON_START = true
let ADO_PROJECTS: string[] = []
let PIPES_MAX = 4
let PIPES_ALL = false

function applyOptions(options: Readonly<Record<string, unknown>>) {
  const pal = options.palette === 'light' ? PALETTES.light : PALETTES.dark
  ;({ PANE_BG, ACCENT, ACCENT_SOFT, BLUE, VIOLET, PROD, USER_BG, CODE_BG, TOOL_BG, TOOL_BAR, CODE_BAR, TURN_RULE, HEAD_BG, ZEBRA_BG, TABLE_BORDER, HL_BG, HL_FG, CODE_INLINE } = pal)
  const width = Number(options.proseWidth)
  // 0 (default) = the whole chat width; 40 or more = wrap reply text at that column
  PROSE_MAX = Number.isFinite(width) && width >= 40 ? Math.round(width) : Number.POSITIVE_INFINITY
  try {
    PROD_RX = new RegExp(typeof options.prodPattern === 'string' && options.prodPattern !== '' ? options.prodPattern : 'prod', 'i')
  } catch {
    PROD_RX = /prod/i
  }
  HIDDEN = new Set(
    String(options.hiddenSections ?? '')
      .split(/[\s,]+/)
      .map(x => SECTION_IDS[x.trim().toLowerCase()])
      .filter((x): x is string => x !== undefined),
  )
  OPEN_ON_START = options.openOnStart !== false
  const pw = Number(options.panelWidth)
  PANEL_COLS = Number.isFinite(pw) && pw >= 24 ? Math.round(pw) : 0
  const pm = Number(options.pipelinesMax)
  PIPES_MAX = Number.isFinite(pm) && pm >= 1 ? Math.round(pm) : 4
  PIPES_ALL = options.pipelinesShow === 'all'
  ADO_PROJECTS = String(options.adoProjects ?? '').split(',').map(x => x.trim()).filter(x => /^[^/]+\/[^/]+$/.test(x))
  if (typeof options.inlineCodeColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(options.inlineCodeColor)) {
    CODE_INLINE = options.inlineCodeColor
  }
}

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
// claude-opus-5-5 -> Opus 5.5 ; claude-haiku-4-5-20251001 -> Haiku 4.5 ; other names unchanged
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

  // Warn once when the context fills up; re-arms after a /compact
  const pct = next.percent ?? 0
  const isWarned = await read($, warned)
  if (pct >= 80 && !isWarned) {
    $.ui.toast(`Context at ${Math.round(pct)}%: consider /compact before a long task`)
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

  const az = await readText($, `${(await $.env.get('AZURE_CONFIG_DIR')) ?? `${h}/.azure`}/azureProfile.json`)
  if (az) {
    try {
      const sub = (JSON.parse(az).subscriptions ?? []).find((s: { isDefault?: boolean }) => s.isDefault)
      w.azSub = sub?.name
      w.azTenant = sub?.tenantDisplayName ?? sub?.tenantDefaultDomain
    } catch {
      /* file being written by az: retry on the next round */
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
    const b = await run($, ['git', 'rev-parse', '--abbrev-ref', 'HEAD'], { timeoutMs: 5000 })
    if (b.exitCode === 0) {
      w.branch = b.stdout.trim()
      const s = await run($, ['git', 'status', '--porcelain'], { timeoutMs: 10000 })
      w.dirty = s.stdout.split('\n').filter(l => l.trim()).length
      // "<behind>\t<ahead>" relative to the upstream; no upstream = exit != 0
      const ab = await run($, ['git', 'rev-list', '--left-right', '--count', '@{u}...HEAD'], { timeoutMs: 5000 })
      if (ab.exitCode === 0) {
        const [behind, ahead] = ab.stdout.trim().split(/\s+/).map(Number)
        w.behind = behind
        w.ahead = ahead
      }
    }
  } catch {
    /* git missing or slow: no git line */
  }

  await update($, where, () => w)
}

async function refreshReminders($: EngineInterface) {
  const text = await readText($, await remindersPath($))
  let list: Reminder[] = []
  if (text) {
    try {
      const limit = localStamp((await $.clock.now()) + 7 * 864e5)
      list = (JSON.parse(text) as { id?: string; due: string; title: string; done?: boolean }[])
        .filter(r => !r.done && r.due <= limit)
        .sort((a, b) => a.due.localeCompare(b.due))
        .map(r => ({ id: r.id ?? `${r.due}|${r.title}`, due: r.due, title: r.title }))
    } catch {
      /* invalid JSON: empty list */
    }
  }
  await update($, reminders, () => list)
}

// ---------- Other Claude Code sessions on this machine ----------
// Claude Code keeps one file per running session in <config dir>/sessions/<pid>.json (name,
// folder, busy/idle). Listed only if its process is still alive; messages go through
// $.session.send, the same channel as the SendMessage tool
async function refreshPeers($: EngineInterface) {
  try {
    const os = await platform($)
    const sep = os === 'windows' ? '\\' : '/'
    const dir = `${(await $.env.get('CLAUDE_CONFIG_DIR')) ?? `${await home($)}${sep}.claude`}${sep}sessions`
    if (!(await $.fs.exists(dir))) {
      await update($, peers, () => [])
      return
    }
    const r =
      os === 'windows'
        ? await run($, ['tasklist', '/FO', 'CSV', '/NH'], { timeoutMs: 15000 })
        : await run($, ['ps', '-A', '-o', 'pid='], { timeoutMs: 15000 })
    const alive = new Set((r.stdout.match(os === 'windows' ? /^"[^"]*","(\d+)"/gm : /\d+/g) ?? []).map(x => (/(\d+)"?$/.exec(x)?.[1] ?? '')))
    const self = await $.session.id()
    const list: Peer[] = []
    const pidOf = new Map<string, number>()
    for (const f of await $.fs.list(dir)) {
      if (!/^\d+\.json$/.test(f.name)) {
        continue
      }
      try {
        const j = JSON.parse(await $.fs.read(`${dir}${sep}${f.name}`)) as { pid?: number; sessionId?: string; name?: string; cwd?: string; status?: string }
        if (j.sessionId === undefined || !alive.has(String(j.pid))) {
          continue
        }
        list.push({ sessionId: j.sessionId, name: j.name ?? String(j.pid), cwd: j.cwd ?? '', status: j.status ?? '', self: j.sessionId === self })
        pidOf.set(j.sessionId, Number(j.pid))
      } catch {
        // a file being rewritten: next round
      }
    }
    // the tab title reads better than the derived session name
    const titles = await consoleTitles($, list.filter(x => !x.self).map(x => pidOf.get(x.sessionId) ?? 0).filter(x => x > 0))
    for (const x of list) {
      const t = titles.get(pidOf.get(x.sessionId) ?? 0)
      if (t !== undefined) {
        x.name = t
      }
    }
    list.sort((a, b) => Number(b.self) - Number(a.self) || a.name.localeCompare(b.name))
    await update($, peers, () => list)
  } catch {
    // listing is best effort
  }
}

// Windows: the title of each session's console, i.e. what its terminal tab shows (Claude Code
// sets it to what the session is about). A helper attaches to each console in turn and reads
// it; the script goes as -EncodedCommand (UTF-16LE base64), so no quoting reaches the shell
const TITLES_PS = [
  '[Console]::OutputEncoding = [Text.Encoding]::UTF8',
  "Add-Type -TypeDefinition 'using System; using System.Text; using System.Runtime.InteropServices; public static class CT { [DllImport(\"kernel32.dll\")] public static extern bool FreeConsole(); [DllImport(\"kernel32.dll\")] public static extern bool AttachConsole(uint p); [DllImport(\"kernel32.dll\", CharSet=CharSet.Unicode)] public static extern uint GetConsoleTitle(StringBuilder b, uint n); public static string T(uint p) { FreeConsole(); if (!AttachConsole(p)) return string.Empty; var b = new StringBuilder(1024); GetConsoleTitle(b, 1024); FreeConsole(); return b.ToString(); } }'",
  'foreach ($p in @(PIDS)) { [Console]::Out.WriteLine([string]$p + [char]9 + [CT]::T([uint32]$p)) }',
].join('\n')

async function consoleTitles($: EngineInterface, pids: number[]) {
  const titles = new Map<number, string>()
  if (pids.length === 0 || (await platform($)) !== 'windows') {
    return titles
  }
  const script = TITLES_PS.replace('PIDS', pids.map(String).join(','))
  let bytes = ''
  for (let i = 0; i < script.length; i++) {
    const c = script.charCodeAt(i)
    bytes += String.fromCharCode(c & 255, c >> 8)
  }
  try {
    const r = await run($, ['powershell.exe', '-NoProfile', '-NonInteractive', '-EncodedCommand', base64Bytes(bytes)], { timeoutMs: 20000 })
    for (const line of r.stdout.split(/\r?\n/)) {
      const m = /^(\d+)\t(.*)$/.exec(line)
      // the leading status glyph (✳, a spinner) is not part of the name
      const t = (m?.[2] ?? '').replace(/^[^\p{L}\p{N}]+/u, '').trim()
      if (m && t !== '') {
        titles.set(Number(m[1]), t)
      }
    }
  } catch {
    // titles are a nicety: the session names stay
  }
  return titles
}

async function sendToPeer($: EngineInterface, sessionId: string, name: string, text: string) {
  if (text.trim() === '') {
    return
  }
  try {
    const r = await $.session.send({ to: { sessionId }, text })
    $.ui.toast(r.isDelivered ? `Sent to ${name}` : `Not sent to ${name}: ${r.reason.slice(0, 120)}`)
  } catch (err) {
    $.ui.toast(`Not sent: ${String(err).slice(0, 120)}`)
  }
}

async function refreshAll($: EngineInterface) {
  await Promise.all([measure($), refreshWhere($), refreshReminders($)])
  await refreshPr($)
}

// Local "YYYY-MM-DDTHH:MM", the format of the reminders file
function localStamp(ms: number) {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// Reminders file: COCKPIT_REMINDERS_FILE, or ~/.claude/reminders.json
async function remindersPath($: EngineInterface) {
  return (await $.env.get('COCKPIT_REMINDERS_FILE')) ?? `${await home($)}/.claude/reminders.json`
}

// Marks a reminder done or moves it one day later, in ~/.claude/reminders.json
async function changeReminder($: EngineInterface, id: string, action: 'done' | 'snooze') {
  const path = await remindersPath($)
  try {
    const list = JSON.parse((await readText($, path)) ?? '[]') as { id?: string; due: string; title: string; done?: boolean }[]
    const item = list.find(r => (r.id ?? `${r.due}|${r.title}`) === id)
    if (item === undefined) {
      $.ui.toast('Reminder not found')
      return
    }
    if (action === 'done') {
      item.done = true
    } else {
      const [date = '', time = '09:00'] = item.due.split('T')
      const [y, m, d] = date.split('-').map(Number)
      const [h, mi] = time.split(':').map(Number)
      item.due = localStamp(new Date(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + 1, h ?? 9, mi ?? 0).getTime())
    }
    await $.fs.write(path, JSON.stringify(list, null, 2) + '\n')
    $.ui.toast(action === 'done' ? `Done: ${cut(item.title, 60)}` : `Moved to ${item.due.replace('T', ' ')}`)
  } catch (err) {
    $.ui.toast(`Reminder not updated: ${String(err).slice(0, 150)}`)
  }
  await refreshReminders($)
}

// ---------- Pull request of the current branch (GitHub, Azure DevOps) ----------

type Remote =
  | { kind: 'github'; owner: string; repo: string }
  | { kind: 'ado'; org: string; project: string; repo: string; host: string }

function parseRemote(url: string): Remote | undefined {
  let m = /github\.com[:/]([^/]+)\/(.+?)(?:\.git)?\/?$/.exec(url)
  if (m) {
    return { kind: 'github', owner: m[1] ?? '', repo: m[2] ?? '' }
  }
  m = /dev\.azure\.com\/([^/]+)\/([^/]+)\/_git\/([^/]+?)\/?$/.exec(url)
  if (m) {
    return { kind: 'ado', org: m[1] ?? '', project: m[2] ?? '', repo: m[3] ?? '', host: 'dev.azure.com' }
  }
  m = /ssh\.dev\.azure\.com:v3\/([^/]+)\/([^/]+)\/([^/]+?)\/?$/.exec(url)
  if (m) {
    return { kind: 'ado', org: m[1] ?? '', project: m[2] ?? '', repo: m[3] ?? '', host: 'dev.azure.com' }
  }
  m = /([^/.@]+)\.visualstudio\.com\/(?:DefaultCollection\/)?([^/]+)\/_git\/([^/]+?)\/?$/.exec(url)
  if (m) {
    return { kind: 'ado', org: m[1] ?? '', project: m[2] ?? '', repo: m[3] ?? '', host: 'dev.azure.com' }
  }
  return undefined
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
function base64(s: string) {
  return base64Bytes(encodeURIComponent(s).replace(/%([0-9A-F]{2})/gi, (_m, h: string) => String.fromCharCode(parseInt(h, 16))))
}

// a string of byte values (0-255) as base64
function base64Bytes(bytes: string) {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes.charCodeAt(i) << 16) | ((bytes.charCodeAt(i + 1) || 0) << 8) | (bytes.charCodeAt(i + 2) || 0)
    const c = (k: number) => B64.charAt(k & 63)
    out += c(n >> 18) + c(n >> 12) + (i + 1 < bytes.length ? c(n >> 6) : "=") + (i + 2 < bytes.length ? c(n) : "=")
  }
  return out
}

// Token git already holds for the host (Git Credential Manager), never prompting
async function gitToken($: EngineInterface, host: string, path?: string) {
  try {
    const r = await run($, ['git', 'credential', 'fill'], {
      stdin: `protocol=https\nhost=${host}\n${path ? `path=${path}\n` : ''}\n`,
      env: { GCM_INTERACTIVE: 'never', GIT_TERMINAL_PROMPT: '0' },
      timeoutMs: 10000,
    })
    return /^password=(.*)$/m.exec(r.stdout)?.[1]?.trim()
  } catch {
    return undefined
  }
}

// Read-only: GET requests only, the pull request is shown, never changed
async function getJson($: EngineInterface, url: string, headers: Record<string, string>) {
  const r = await $.http.fetch(url, { method: 'GET', headers })
  if (!r.ok) {
    throw new Error(`HTTP ${r.status}`)
  }
  return JSON.parse(r.text) as unknown
}

async function refreshPr($: EngineInterface) {
  const w = await read($, where)
  const branch = w.branch
  if (branch === undefined || branch === 'HEAD') {
    await update($, pr, () => null)
    return
  }
  let remote: Remote | undefined
  try {
    const r = await run($, ['git', 'remote', 'get-url', 'origin'], { timeoutMs: 5000 })
    remote = r.exitCode === 0 ? parseRemote(r.stdout.trim()) : undefined
  } catch {
    remote = undefined
  }
  if (remote === undefined) {
    await update($, pr, () => null)
    return
  }
  const base: PullRequest = { branch, state: 'none', id: 0, title: '', url: '', draft: false, approved: 0, rejected: 0, waiting: 0, ci: 'none' }
  try {
    const next = remote.kind === 'github' ? await githubPr($, remote, base) : await adoPr($, remote, base)
    await update($, pr, () => next)
  } catch (err) {
    await update($, pr, () => ({ ...base, state: 'error' as const, title: String(err).slice(0, 80) }))
  }
}

async function githubPr($: EngineInterface, r: { owner: string; repo: string }, base: PullRequest): Promise<PullRequest> {
  const tok = await gitToken($, 'github.com')
  const h: Record<string, string> = { Accept: 'application/vnd.github+json', 'User-Agent': 'claude-code-cockpit' }
  if (tok) {
    h.Authorization = `Bearer ${tok}`
  }
  const api = `https://api.github.com/repos/${r.owner}/${r.repo}`
  const list = (await getJson($, `${api}/pulls?state=open&head=${encodeURIComponent(`${r.owner}:${base.branch}`)}`, h)) as {
    number: number; title: string; html_url: string; draft: boolean; head: { sha: string }
  }[]
  const p = list[0]
  if (p === undefined) {
    return base
  }
  const reviews = (await getJson($, `${api}/pulls/${p.number}/reviews`, h)) as { user: { login: string }; state: string }[]
  const last = new Map<string, string>()
  for (const rv of reviews) {
    if (rv.state !== 'COMMENTED') {
      last.set(rv.user.login, rv.state)
    }
  }
  const states = [...last.values()]
  const checks = (await getJson($, `${api}/commits/${p.head.sha}/check-runs`, h)) as { check_runs: { status: string; conclusion: string | null }[] }
  const runs = checks.check_runs
  const ci: PullRequest['ci'] =
    runs.length === 0 ? 'none'
      : runs.some(c => ['failure', 'timed_out', 'cancelled', 'action_required'].includes(c.conclusion ?? '')) ? 'failed'
        : runs.some(c => c.status !== 'completed') ? 'running' : 'passed'
  return {
    ...base, state: 'open', id: p.number, title: p.title, url: p.html_url, draft: p.draft,
    approved: states.filter(x => x === 'APPROVED').length,
    rejected: states.filter(x => x === 'CHANGES_REQUESTED').length,
    waiting: 0, ci,
  }
}

async function adoPr($: EngineInterface, r: { org: string; project: string; repo: string }, base: PullRequest): Promise<PullRequest> {
  const tok = await gitToken($, 'dev.azure.com', `${r.org}/${r.project}/_git/${r.repo}`)
  if (!tok) {
    throw new Error('no Azure DevOps credential in git')
  }
  const root = `https://dev.azure.com/${r.org}/${r.project}`
  const ask = async (url: string) => {
    try {
      return await getJson($, url, { Authorization: `Bearer ${tok}` })
    } catch {
      return await getJson($, url, { Authorization: `Basic ${base64(`:${tok}`)}` })
    }
  }
  const prs = (await ask(`${root}/_apis/git/repositories/${r.repo}/pullrequests?searchCriteria.sourceRefName=${encodeURIComponent(`refs/heads/${base.branch}`)}&searchCriteria.status=active&api-version=7.1`)) as {
    value: { pullRequestId: number; title: string; isDraft?: boolean; reviewers?: { vote: number }[]; repository: { project: { id: string } } }[]
  }
  const p = prs.value[0]
  if (p === undefined) {
    return base
  }
  const votes = (p.reviewers ?? []).map(x => x.vote)
  let ci: PullRequest['ci'] = 'none'
  try {
    const art = encodeURIComponent(`vstfs:///CodeReview/CodeReviewId/${p.repository.project.id}/${p.pullRequestId}`)
    const ev = (await ask(`${root}/_apis/policy/evaluations?artifactId=${art}&api-version=7.1-preview.1`)) as {
      value: { status: string; configuration: { type: { displayName: string } } }[]
    }
    const builds = ev.value.filter(x => x.configuration.type.displayName === 'Build')
    ci = builds.length === 0 ? 'none'
      : builds.some(x => x.status === 'rejected' || x.status === 'broken') ? 'failed'
        : builds.some(x => x.status === 'running' || x.status === 'queued') ? 'running' : 'passed'
  } catch {
    ci = 'none'
  }
  return {
    ...base, state: 'open', id: p.pullRequestId, title: p.title, draft: p.isDraft === true,
    url: `${root}/_git/${r.repo}/pullrequest/${p.pullRequestId}`,
    approved: votes.filter(v => v >= 5).length,
    rejected: votes.filter(v => v === -10).length,
    waiting: votes.filter(v => v === -5).length,
    ci,
  }
}

// Keeps the session's task list from the task tools' inputs and results
async function trackTasks($: EngineInterface, tool: string, input: Record<string, unknown>, result: unknown) {
  if (tool === 'TodoWrite') {
    const todos = (input.todos as { content: string; status: string }[] | undefined) ?? []
    await update($, tasks, () => todos.map((t, i) => ({ id: String(i), subject: t.content, status: t.status as TaskItem['status'] })))
    return
  }
  if (tool === 'TaskCreate') {
    const t = (result as { task?: { id: string; subject: string } } | undefined)?.task
    const subject = t?.subject ?? String(input.subject ?? '')
    const id = t?.id ?? subject
    await update($, tasks, list => [...list.filter(x => x.id !== id), { id, subject, status: 'pending' as const }])
    return
  }
  const id = String(input.taskId ?? '')
  const status = input.status as string | undefined
  await update($, tasks, list =>
    status === 'deleted'
      ? list.filter(x => x.id !== id)
      : list.map(x =>
          x.id === id
            ? { ...x, subject: typeof input.subject === 'string' ? input.subject : x.subject, status: (status as TaskItem['status']) ?? x.status }
            : x,
        ),
  )
}

// Lower case, markdown marks and runs of spaces dropped: the raw message and the
// drawn row then compare equal
const norm = (s: string) => s.toLowerCase().replace(/[*`_#>|\[\]]/g, '').replace(/\s+/g, ' ')

// Transcript rows drawn so far (requestId + text), to scroll to a search hit
const ROWS: { id: string; text: string }[] = []
function rememberRow(id: string, text: string) {
  if (text.trim() === '' || ROWS.some(r => r.id === id && r.text === text)) {
    return
  }
  const i = ROWS.findIndex(r => r.id === id)
  if (i !== -1) {
    ROWS.splice(i, 1)
  }
  ROWS.push({ id, text: norm(text) })
  if (ROWS.length > 3000) {
    ROWS.shift()
  }
}

// Text a person reads in a message: no system reminders or command wrappers
const readable = (t: string) =>
  t
    .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, ' ')
    .replace(/<(command-[a-z]+|local-command-[a-z]+)>[\s\S]*?<\/\1>/g, ' ')

// Searches the session's messages (your prompts and Claude's replies) for `q`
async function runSearch($: EngineInterface, q: string) {
  const query = q.trim()
  if (query === '') {
    await update($, search, () => null)
    return
  }
  const ql = query.toLowerCase()
  const msgs = await $.session.messages()
  const hits: SearchResult['hits'] = []
  let total = 0
  let inMessages = 0
  msgs.forEach((m, i) => {
    const text = readable(m.text)
    const low = text.toLowerCase()
    let pos = low.indexOf(ql)
    if (pos !== -1) {
      inMessages++
    }
    while (pos !== -1) {
      total++
      if (hits.length < 200) {
        const from = Math.max(0, pos - 30)
        hits.push({
          role: m.role,
          msg: i,
          before: (from > 0 ? '…' : '') + text.slice(from, pos).replace(/\s+/g, ' '),
          match: text.slice(pos, pos + query.length),
          after: text.slice(pos + query.length, pos + query.length + 60).replace(/\s+/g, ' '),
          probe: norm(text.slice(Math.max(0, pos - 20), pos + ql.length + 20)),
        })
      }
      pos = low.indexOf(ql, pos + ql.length)
    }
  })
  // newest first: the latest occurrence is usually the one you look for
  hits.reverse()
  await update($, search, () => ({ query, total, inMessages, hits, page: 0 }))
}

// Scrolls the transcript to the row that holds a hit, if it has been drawn
async function jumpTo($: EngineInterface, probe: string, match: string) {
  // widest context first, then narrower, then the word alone (newest row)
  const m = norm(match).trim()
  const at = probe.indexOf(m)
  const tries = [probe.trim(), at === -1 ? '' : probe.slice(Math.max(0, at - 8), at + m.length + 8).trim(), m].filter(x => x !== '')
  let row: { id: string; text: string } | undefined
  for (const t of tries) {
    row = [...ROWS].reverse().find(r => r.text.includes(t))
    if (row !== undefined) {
      break
    }
  }
  if (row === undefined) {
    $.ui.toast('That message is not drawn on screen (compacted, or older than this session view)')
    return
  }
  const r = await $.ui.scroll({ to: { requestId: row.id }, block: 'center' })
  $.ui.toast('deny' in r && r.deny ? `Cannot scroll there: ${String(r.deny).slice(0, 120)}` : `↳ "${cut(match, 30)}"`)
}

// Text split around every occurrence of q (case-insensitive): [text, isMatch][]
function splitHits(text: string, q: string): [string, boolean][] {
  if (q === '') {
    return [[text, false]]
  }
  const out: [string, boolean][] = []
  const low = text.toLowerCase()
  let last = 0
  for (let pos = low.indexOf(q); pos !== -1; pos = low.indexOf(q, pos + q.length)) {
    if (pos > last) {
      out.push([text.slice(last, pos), false])
    }
    out.push([text.slice(pos, pos + q.length), true])
    last = pos + q.length
  }
  if (last < text.length) {
    out.push([text.slice(last), false])
  }
  return out
}

// Markdown shown as plain text, for a paragraph drawn with highlights
const plainMd = (s: string) =>
  s
    .replace(/\*\*|__|`/g, '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')

// ---------- Azure DevOps pipelines started by you (read-only) ----------
// Every run requested by you in the last 24 hours in the watched projects, however it was
// started (portal, `az pipelines run`, REST, a PR), with pending approvals. GET only.

// "org/project" pairs to watch: option adoProjects, the current repo's, and any seen in commands
const WATCHED = new Set<string>()
// organization of the azure-devops MCP server, when known from a watched project
let ADO_DEFAULT_ORG = ''
const ADO_RX = /dev\.azure\.com\/([^/\s'"]+)\/([^/\s'"?]+)/g

// org and project names as Azure DevOps allows them; anything else is ignored
const ADO_ORG = /^[A-Za-z0-9][A-Za-z0-9-]{0,49}$/
const ADO_PROJECT = /^[^/\\:*?"<>|#%&;$@^{}[\]+=,`~']{1,64}$/

function decode(x: string) {
  try {
    return decodeURIComponent(x)
  } catch {
    return ''
  }
}

function watch(org: string, project: string) {
  if (ADO_ORG.test(org) && ADO_PROJECT.test(project) && !project.startsWith('_') && WATCHED.size < 12) {
    WATCHED.add(`${org}/${project}`)
  }
}

function watchFrom(text: string) {
  for (const m of text.matchAll(ADO_RX)) {
    watch(m[1] ?? '', decode(m[2] ?? ''))
  }
  const org = /--org(?:anization)?\s+['"]?https:\/\/dev\.azure\.com\/([^/\s'"]+)/.exec(text)?.[1]
  const project = /(?:--project|\s-p)\s+(?:'([^']+)'|"([^"]+)"|(\S+))/.exec(text)
  const name = project?.[1] ?? project?.[2] ?? project?.[3]
  if (org && name) {
    watch(org, name)
  }
}

const ADO_AUTH: Record<string, { token: string; until: number; me: string }> = {}

// Bearer token for an organization from the Azure CLI, for the org's own tenant
async function adoAuth($: EngineInterface, org: string) {
  const now = await $.clock.now()
  const cached = ADO_AUTH[org]
  if (cached && cached.until > now) {
    return cached
  }
  const anon = await $.http.fetch(`https://dev.azure.com/${org}/_apis/connectionData`, { method: 'GET' })
  const tenant = Object.entries(anon.headers).find(([k]) => k.toLowerCase() === 'x-vss-resourcetenant')?.[1]
  const args = ['account', 'get-access-token', '--resource', '499b84ac-1321-427f-aa17-267ca6975798', '--query', 'accessToken', '-o', 'tsv']
  if (typeof tenant === 'string' && /^[0-9a-f-]{36}$/i.test(tenant)) {
    args.push('--tenant', tenant)
  }
  const r = await run($, ['az', ...args], { timeoutMs: 30000 })
  const token = r.stdout.trim()
  if (r.exitCode !== 0 || token === '') {
    throw new Error('az login needed for Azure DevOps')
  }
  const cd = JSON.parse((await $.http.fetch(`https://dev.azure.com/${org}/_apis/connectionData`, { method: 'GET', headers: { Authorization: `Bearer ${token}` } })).text) as {
    authenticatedUser?: { id?: string }
  }
  const auth = { token, until: now + 40 * 60000, me: cd.authenticatedUser?.id ?? '' }
  ADO_AUTH[org] = auth
  return auth
}

let LAST_PIPES = 0

async function refreshPipes($: EngineInterface, force = false) {
  const now = await $.clock.now()
  const active = (await read($, pipes)).some(r => r.status !== 'completed')
  if (!force && !active && now - LAST_PIPES < 180000) {
    return
  }
  LAST_PIPES = now
  for (const x of ADO_PROJECTS) {
    WATCHED.add(x)
  }
  ADO_DEFAULT_ORG = ADO_DEFAULT_ORG || ([...WATCHED][0]?.split('/')[0] ?? '')
  try {
    const r = await run($, ['git', 'remote', 'get-url', 'origin'], { timeoutMs: 5000 })
    if (r.exitCode === 0) {
      watchFrom(r.stdout)
      const ssh = /ssh\.dev\.azure\.com:v3\/([^/]+)\/([^/]+)\//.exec(r.stdout)
      if (ssh) {
        watch(ssh[1] ?? '', decode(ssh[2] ?? ''))
      }
    }
  } catch {
    // not a git folder
  }
  if (WATCHED.size === 0) {
    return
  }
  const since = new Date(now - 24 * 3600000).toISOString()
  const runs: PipelineRun[] = []
  for (const key of WATCHED) {
    const [org = '', project = ''] = key.split('/')
    try {
      const auth = await adoAuth($, org)
      const base = `https://dev.azure.com/${org}/${encodeURIComponent(project)}`
      const h = { Authorization: `Bearer ${auth.token}` }
      const builds = (await getJson($, `${base}/_apis/build/builds?requestedFor=${auth.me}&minTime=${since}&$top=10&queryOrder=queueTimeDescending&api-version=7.1`, h)) as {
        value: { id: number; buildNumber: string; status: string; result?: string; sourceBranch?: string; queueTime?: string; finishTime?: string; definition: { name: string }; _links?: { web?: { href?: string } } }[]
      }
      let waiting = new Set<number>()
      if (builds.value.some(b => b.status !== 'completed')) {
        const ap = (await getJson($, `${base}/_apis/pipelines/approvals?state=pending&api-version=7.1`, h)) as { value: { pipeline?: { owner?: { id?: number } } }[] }
        waiting = new Set(ap.value.map(a => a.pipeline?.owner?.id ?? -1))
      }
      for (const b of builds.value) {
        runs.push({
          project: key,
          id: b.id,
          name: b.definition.name,
          status: b.status,
          result: b.result ?? '',
          branch: (b.sourceBranch ?? '').replace(/^refs\/heads\//, '').replace(/^refs\/pull\/(\d+)\/merge$/, 'PR $1'),
          queued: b.queueTime ? Date.parse(b.queueTime) : 0,
          finished: b.finishTime ? Date.parse(b.finishTime) : 0,
          approval: waiting.has(b.id),
          error: '',
        })
      }
    } catch (err) {
      runs.push({ project: key, id: 0, name: '', status: 'error', result: '', branch: '', queued: now, finished: 0, approval: false, error: String(err).slice(0, 80) })
    }
  }
  runs.sort((a, b) => b.queued - a.queued)
  await update($, pipes, () => runs.slice(0, 12))
}

// /cockpit and /sidebar: refresh and open the panel
async function openCommand($: EngineInterface) {
  await refreshAll($)
  // out of compact mode: the side panel replaces the band
  COMPACT = false
  await $.store.set('compact', false)
  await update($, compactA, () => false)
  const r = await openPane($)

  return { text: r.isPlaced ? 'Panel open.' : `Panel not shown: ${r.reason ?? 'terminal too narrow'}` }
}

// ---------- Terminal look: Windows Terminal colour scheme, real bold, padding ----------
// What the mod cannot draw itself lives in the terminal's settings: the background and the
// way bold is drawn (by default Windows Terminal shows bold only as a brighter colour, which
// does nothing on RGB colours). /cockpit-setup or the panel button apply it to the profile
// Claude Code runs in, after a backup; nothing is changed without that press.
const EMBER_DARK = {
  name: 'Ember Dark', background: '#1E1E1E', foreground: '#DADADA', cursorColor: '#F5A97F', selectionBackground: '#3A3A40',
  black: '#2A2A2E', red: '#E06C75', green: '#98C379', yellow: '#E5C07B', blue: '#6EA8F7', purple: '#A98BDC', cyan: '#56B6C2', white: '#C8C8CE',
  brightBlack: '#5C5C66', brightRed: '#EF8891', brightGreen: '#B0D68F', brightYellow: '#F0D398', brightBlue: '#8FBCFA', brightPurple: '#C0A6EA', brightCyan: '#7FCBD4', brightWhite: '#FFFFFF',
}
type WtProfile = { guid?: string; colorScheme?: unknown; intenseTextStyle?: string; padding?: string }
type WtSettings = { defaultProfile?: string; schemes?: { name?: string }[]; profiles?: { defaults?: WtProfile; list?: WtProfile[] } | WtProfile[] }

// Windows Terminal accepts comments and trailing commas in settings.json; JSON.parse does not
function parseJsonc(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    let out = ''
    let inStr = false
    for (let i = 0; i < text.length; i++) {
      const c = text[i] ?? ''
      const n = text[i + 1] ?? ''
      if (inStr) {
        out += c
        if (c === '\\') {
          out += n
          i++
        } else if (c === '"') {
          inStr = false
        }
      } else if (c === '"') {
        inStr = true
        out += c
      } else if (c === '/' && n === '/') {
        while (i < text.length && text[i] !== '\n') {
          i++
        }
        out += '\n'
      } else if (c === '/' && n === '*') {
        i += 2
        while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) {
          i++
        }
        i++
      } else {
        out += c
      }
    }
    return JSON.parse(out.replace(/,(\s*[}\]])/g, '$1'))
  }
}

// settings.json of the Windows Terminal this session runs in, or undefined elsewhere
async function wtSettingsPath($: EngineInterface) {
  if ((await platform($)) !== 'windows' || (await $.env.get('WT_SESSION')) === undefined) {
    return undefined
  }
  const local = (await $.env.get('LOCALAPPDATA')) ?? `${await home($)}\\AppData\\Local`
  for (const p of [
    `${local}\\Packages\\Microsoft.WindowsTerminal_8wekyb3d8bbwe\\LocalState\\settings.json`,
    `${local}\\Packages\\Microsoft.WindowsTerminalPreview_8wekyb3d8bbwe\\LocalState\\settings.json`,
    `${local}\\Microsoft\\Windows Terminal\\settings.json`,
  ]) {
    if (await $.fs.exists(p)) {
      return p
    }
  }
  return undefined
}

// the profile this session runs in (WT_PROFILE_ID, else Windows Terminal's default profile),
// else the defaults every profile inherits
async function wtTarget($: EngineInterface, d: WtSettings): Promise<WtProfile> {
  const id = ((await $.env.get('WT_PROFILE_ID')) ?? d.defaultProfile ?? '').toLowerCase()
  if (Array.isArray(d.profiles)) {
    return d.profiles.find(x => (x.guid ?? '').toLowerCase() === id) ?? {}
  }
  d.profiles ??= {}
  const found = (d.profiles.list ?? []).find(x => id !== '' && (x.guid ?? '').toLowerCase() === id)
  if (found) {
    return found
  }
  d.profiles.defaults ??= {}
  return d.profiles.defaults
}

async function terminalState($: EngineInterface): Promise<'na' | 'pending' | 'done'> {
  try {
    const path = await wtSettingsPath($)
    if (path === undefined) {
      return 'na'
    }
    const d = parseJsonc(await $.fs.read(path)) as WtSettings
    const t = await wtTarget($, d)
    // effective values: what the profile sets, else what it inherits from the defaults
    const base = Array.isArray(d.profiles) ? {} : (d.profiles?.defaults ?? {})
    const scheme = t.colorScheme ?? base.colorScheme
    const intense = t.intenseTextStyle ?? base.intenseTextStyle
    return scheme === EMBER_DARK.name && intense === 'all' ? 'done' : 'pending'
  } catch {
    return 'na'
  }
}

async function applyTerminalLook($: EngineInterface): Promise<string> {
  const path = await wtSettingsPath($)
  if (path === undefined) {
    return 'Terminal look: only for Windows Terminal. In other terminals pick a dark background close to #1E1E1E; the colours are in extras/ of the repository.'
  }
  const text = await $.fs.read(path)
  let d: WtSettings
  try {
    d = parseJsonc(text) as WtSettings
  } catch {
    return `Terminal look: could not read ${path}, nothing changed.`
  }
  const d0 = new Date(await $.clock.now())
  const pad = (n: number) => String(n).padStart(2, '0')
  const backup = `${path}.cockpit-${d0.getFullYear()}${pad(d0.getMonth() + 1)}${pad(d0.getDate())}-${pad(d0.getHours())}${pad(d0.getMinutes())}${pad(d0.getSeconds())}.bak`
  await $.fs.write(backup, text)
  d.schemes ??= []
  if (!d.schemes.some(x => x.name === EMBER_DARK.name)) {
    d.schemes.push(EMBER_DARK)
  }
  const t = await wtTarget($, d)
  t.colorScheme = EMBER_DARK.name
  t.intenseTextStyle = 'all'
  t.padding ??= '8, 6'
  await $.fs.write(path, JSON.stringify(d, null, 4) + '\n')
  await update($, termLook, () => 'done')
  return `Terminal look applied (Ember Dark, real bold, padding). Backup: ${backup}. To undo, copy the backup over settings.json.`
}

// ---------- Uninstall: put back everything the mod changed outside itself ----------
// /cockpit-uninstall lists what it would do; /cockpit-uninstall yes does it:
// Windows Terminal settings.json from the first backup the mod took (the state before its
// first change), the mod's options in Claude Code's settings.json, its stored values (panel
// state), the pasted images, then the plugin itself. The reminders file is yours: kept.
async function wtBackups($: EngineInterface) {
  const path = await wtSettingsPath($)
  if (path === undefined) {
    return { path, backups: [] as string[] }
  }
  const dir = path.slice(0, path.lastIndexOf('\\'))
  const backups = (await $.fs.list(dir))
    .map(x => x.name)
    .filter(n => /^settings\.json\.cockpit-\d{8}-\d{6}\.bak$/.test(n))
    .sort()
    .map(n => `${dir}\\${n}`)
  return { path, backups }
}

async function uninstallCockpit($: EngineInterface, really: boolean): Promise<string> {
  const os = await platform($)
  const settings = `${await home($)}${os === 'windows' ? '\\' : '/'}.claude${os === 'windows' ? '\\' : '/'}settings.json`
  const { path: wt, backups } = await wtBackups($)
  const first = backups[0]
  const plan = [
    first !== undefined && wt !== undefined
      ? `Windows Terminal: restore ${wt} from ${first} (the state before the mod's first change)`
      : 'Windows Terminal: never changed by the mod, nothing to restore',
    `Claude Code settings: remove the mod's options (pluginConfigs "cockpit...") from ${settings}`,
    'Stored panel state (folded sections, models, newstyle): delete',
    'Pasted images (claude-cockpit temp folder): delete',
    'Plugin: claude plugin uninstall cockpit@claude-code-cockpit',
    'Not touched: your reminders file',
  ]
  if (!really) {
    return ['/cockpit-uninstall yes would:', ...plan.map(x => `- ${x}`)].join('\n')
  }
  const done: string[] = []
  const stamp = async () => {
    const d = new Date(await $.clock.now())
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  }
  // 1. terminal: the current file is kept next to it before the restore
  if (first !== undefined && wt !== undefined) {
    try {
      await $.fs.write(`${wt}.before-uninstall-${await stamp()}.bak`, await $.fs.read(wt))
      await $.fs.write(wt, await $.fs.read(first))
      done.push(`Windows Terminal restored from ${first}`)
    } catch (err) {
      done.push(`Windows Terminal NOT restored: ${String(err).slice(0, 120)}`)
    }
  }
  // 2. options in Claude Code's settings.json
  try {
    if (await $.fs.exists(settings)) {
      const text = await $.fs.read(settings)
      const d = JSON.parse(text) as { pluginConfigs?: Record<string, unknown> }
      const keys = Object.keys(d.pluginConfigs ?? {}).filter(k => k === 'cockpit' || k.startsWith('cockpit@'))
      if (keys.length > 0) {
        await $.fs.write(`${settings}.before-cockpit-uninstall-${await stamp()}.bak`, text)
        for (const k of keys) {
          delete d.pluginConfigs?.[k]
        }
        if (d.pluginConfigs !== undefined && Object.keys(d.pluginConfigs).length === 0) {
          delete d.pluginConfigs
        }
        await $.fs.write(settings, JSON.stringify(d, null, 2) + '\n')
        done.push(`options removed from ${settings} (backup next to it)`)
      }
    }
  } catch (err) {
    done.push(`options NOT removed: ${String(err).slice(0, 120)}`)
  }
  // 3. stored values
  for (const k of await $.store.keys()) {
    await $.store.delete(k)
  }
  done.push('stored panel state deleted')
  // 4. pasted images
  try {
    if (os === 'windows') {
      const tmp = (await $.env.get('TEMP')) ?? `${await home($)}\\AppData\\Local\\Temp`
      await run($, ['powershell.exe', '-NoProfile', '-Command', '$p = [Console]::In.ReadLine(); if (Test-Path -LiteralPath $p) { Remove-Item -LiteralPath $p -Recurse -Force }'], {
        stdin: `${tmp}\\claude-cockpit\n`,
        timeoutMs: 20000,
      })
    } else {
      await run($, ['sh', '-c', 'rm -rf "${TMPDIR:-/tmp}"/claude-cockpit.*'], { timeoutMs: 20000 })
    }
    done.push('pasted images deleted')
  } catch {
    done.push('pasted images NOT deleted')
  }
  // 5. the plugin
  let removed = false
  try {
    const r = await run($, ['claude', 'plugin', 'uninstall', 'cockpit@claude-code-cockpit'], { timeoutMs: 60000 })
    removed = r.exitCode === 0
  } catch {
    // claude not in PATH: the manual command below
  }
  done.push(removed ? 'plugin uninstalled' : 'plugin NOT uninstalled by the mod: run /plugin uninstall cockpit (or remove the folder from CLAUDE_CODE_PLUGIN_DIRS if you load it from a clone)')
  await update($, enabled, () => false)
  await $.ui.close({ id: PANE })
  return ['Cockpit uninstalled:', ...done.map(x => `- ${x}`), 'Restart Claude Code (and Windows Terminal) to see everything as before.'].join('\n')
}

// The 2-line summary: in a narrow window (panel above the prompt) and in compact mode, where
// it is drawn as a band above the prompt with ⇤ expand to bring the side panel back
async function miniView($: EngineInterface, els: { Box: any; Button: any; Text: any }, expand: boolean): Promise<RenderElement> {
  const { Box, Button, Text } = els
  const u = await read($, usage)
  const eff = await read($, effort)
  const w = await read($, where)
  const wr = await read($, writes)
  const rem = await read($, reminders)
  const list = await read($, files)
  const pct = u?.percent ?? 0
  const pctColor = pct >= 80 ? 'error' : pct >= 60 ? 'warning' : ACCENT
  const today = localStamp(await $.clock.now())
  const pl = HIDDEN.has('pipelines') ? 0 : (await read($, pipes)).filter(r => r.status !== 'completed' && r.status !== 'error').length
  const others = HIDDEN.has('sessioni') ? 0 : (await read($, peers)).filter(x => !x.self).length
  const prodAz = isProd(w.azSub)
  const prodKube = isProd(w.kube)
  const prodGit = w.branch === 'main' || w.branch === 'master'
  const dirShort = (w.cwd ?? '').split('\\').slice(-2).join('\\')
  const sep = <Text dimColor>  ·  </Text>

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box flexDirection="row" flexWrap="wrap">
        {expand && (
          <Box marginRight={2}>
            <Button key="expand" plain onPress={() => void toggleCompact($)}>
              <Text color={BLUE}>⇤ expand</Text>
            </Button>
          </Box>
        )}
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
        {pl > 0 && (
          <Text>
            {sep}
            <Text color="warning">⏳ {pl} pipeline{pl === 1 ? '' : 's'}</Text>
          </Text>
        )}
        {wr.length > 0 && (
          <Text>
            {sep}
            <Text color={PROD}>✎ {wr.length} writes</Text>
          </Text>
        )}
        {list.length > 0 && <Text>{sep}<Text dimColor>{list.length} file</Text></Text>}
        {rem.length > 0 && (
          <Text>
            {sep}
            <Text color={rem.some(r => r.due <= today) ? 'error' : 'warning'}>⏰ {rem.length}</Text>
          </Text>
        )}
        {others > 0 && <Text>{sep}<Text dimColor>{others} other session{others === 1 ? '' : 's'}</Text></Text>}
      </Box>
    </Box>
  )
}

export const register: Register = (on, options) => {
  applyOptions(options)

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'cockpit', description: 'Open the cockpit side panel' })
    await $.command.register({ name: 'sidebar', description: 'Open the cockpit side panel (alias of /cockpit)' })
    await $.command.register({
      name: 'newstyle',
      description: 'Cockpit look (side panel, prompt boxes, readable replies): on | off',
      argumentHint: 'on | off',
    })
    await $.command.register({ name: 'cockpit-setup', description: 'Apply the recommended Windows Terminal look (colours, real bold), with a backup' })
    await $.command.register({
      name: 'cockpit-uninstall',
      description: 'Uninstall the mod and put back what it changed (terminal, options, stored state); without "yes" only lists it',
      argumentHint: 'yes',
    })
    const isOn = (await $.store.get('enabled')) !== false
    await update($, enabled, () => isOn)
    const initial = await effortFromSettings($)
    await update($, effort, cur => cur ?? initial)
    COMPACT = (await $.store.get('compact')) === true
    await update($, compactA, () => COMPACT)
    const savedCollapsed = (await $.store.get('collapsed')) as string[] | undefined
    await update($, collapsed, () => (Array.isArray(savedCollapsed) ? savedCollapsed : []))
    await loadModels($)
    CC_VERSION = (await $.session.version()).version
    const ran = await next(e)
    await refreshAll($)
    void refreshPipes($, true)
    void refreshPeers($)
    void (async () => {
      const st = await terminalState($)
      await update($, termLook, () => st)
      if (st === 'pending' && (await $.store.get('termOffered')) !== true) {
        await $.store.set('termOffered', true)
        $.ui.toast('Windows Terminal: press "Terminal look" in the panel (or /cockpit-setup) for the recommended colours and real bold')
      }
    })()
    // az account set / kubectl config use-context done outside here: recheck every 30 s
    $.clock.every(30_000, () => {
      void refreshPeers($)
      void (async () => {
        await refreshWhere($)
        const b = (await read($, where)).branch
        if (b !== (await read($, pr))?.branch) {
          await refreshPr($)
        }
      })()
    })
    $.clock.every(120_000, () => {
      void refreshPr($)
    })
    $.clock.every(60_000, () => {
      void refreshPipes($)
    })
    $.clock.every(300_000, () => {
      void refreshReminders($)
    })
    if (isOn && OPEN_ON_START && !COMPACT) {
      void openPane($)
    }

    return ran
  })

  on('command.run', { command: 'newstyle' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg !== 'on' && arg !== 'off') {
      const isOn = await read($, enabled)

      return { text: `newstyle is ${isOn ? 'ON' : 'OFF'}. Usage: /newstyle on | /newstyle off` }
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

    return { text: isOn ? 'Cockpit look on.' : 'Default Claude Code look restored.' }
  })

  // Active modes: turned on with /name (prompt.submit) or with the Skill tool (tool.call),
  // turned off with "off", with the stop phrases, with "normal mode" or with /panic.
  // Not from skill.prompt: another plugin intercepts it first and the hook is skipped
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
      for (const [label, rx] of Object.entries(MODE_OFF)) {
        if (rx.test(t)) {
          stopped.push(label)
        }
      }
      if (stopped.length > 0) {
        await update($, modes, ms => ms.filter(m => !stopped.includes(modeName(m))))
      }
      // a mode asked for in words ("adhd mode on"), not only with /skill
      const started = Object.entries(MODE_ON).filter(([label, rx]) => !stopped.includes(label) && rx.test(t)).map(([label]) => label)
      if (started.length > 0) {
        await update($, modes, ms => [...ms, ...started.filter(l => !ms.some(m => modeName(m) === l))])
      }
    }
    // "ultracode" in the prompt authorizes multi-agent workflows for that request:
    // stays in the list until a later prompt no longer contains it
    const ultra = /\bultracode\b/.test(t)
    await update($, modes, ms => [...ms.filter(m => m !== 'ultracode'), ...(ultra ? ['ultracode'] : [])])
    return next(e)
  })

  on('command.run', { command: 'cockpit-setup' }, async $ => ({ text: await applyTerminalLook($) }))
  on('command.run', { command: 'cockpit-uninstall' }, async ($, e) => ({ text: await uninstallCockpit($, e.args.trim().toLowerCase() === 'yes') }))
  on('command.run', { command: 'cockpit' }, openCommand)
  on('command.run', { command: 'sidebar' }, openCommand)

  // actual effort of each main-loop request (subagents have an agentId)
  on('turn.step', async function* ($, e, next) {
    void learnModel($, e.model)
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

    if (e.tool.startsWith('mcp__')) {
      const ran = await next(e)
      if (e.tool.startsWith('mcp__azure-devops__')) {
        const inp = e as unknown as { project?: string }
        const org = /mcp__azure-devops__/.test(e.tool) ? ADO_DEFAULT_ORG : ''
        if (org !== '' && typeof inp.project === 'string') {
          WATCHED.add(`${org}/${inp.project}`)
        }
        if (/pipelines_run|pipelines_build/.test(e.tool)) {
          void refreshPipes($, true)
        }
      }
      const line = mcpWrite(e.tool, e as unknown as Record<string, unknown>)
      if (line !== undefined && ran.deny === undefined) {
        const one: WriteCmd = { at: await $.clock.now(), text: line, ok: ran.isError !== true }
        await update($, writes, list => [one, ...list].slice(0, 30))
      }
      return ran
    }

    // Claude's task list (main loop only): TaskCreate/TaskUpdate or the older TodoWrite
    if ((e.tool === 'TaskCreate' || e.tool === 'TaskUpdate' || e.tool === 'TodoWrite') && e.agentId === undefined) {
      const ran = await next(e)
      if (ran.deny === undefined && ran.isError !== true) {
        await trackTasks($, e.tool, e as unknown as Record<string, unknown>, ran.result as unknown)
      }
      return ran
    }

    if (e.tool === 'Skill') {
      await applyMode($, input.skill ?? '', input.args ?? '')
      return next(e)
    }

    if (e.tool === 'Bash' || e.tool === 'PowerShell') {
      const ran = await next(e)
      const line = findWrite(input.command ?? '')
      if (line !== undefined && ran.deny === undefined) {
        const one: WriteCmd = { at: await $.clock.now(), text: line, ok: ran.isError !== true }
        await update($, writes, list => [one, ...list].slice(0, 30))
      }
      // a command may have changed subscription, k8s context or branch
      await refreshWhere($)
      if (line !== undefined && /\bgit\b.*\bpush\b|\bgh\s+pr\b|\baz\s+repos\s+pr\b/.test(line)) {
        void refreshPr($)
      }
      // an Azure DevOps project named in a command joins the watched ones; a run started
      // from the CLI or REST shows up at once
      const cmdText = input.command ?? ''
      if (/dev\.azure\.com|az\s+(pipelines|repos|devops)/.test(cmdText)) {
        watchFrom(cmdText)
        void refreshPipes($, /pipelines\s+(run|build\s+queue)|\/runs\b|\/builds\b/.test(cmdText))
      }

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

  // Your prompts in a box: blue bar on the left + dark gray background.
  // Commands (/command, !bash) and their outputs: same box with a purple bar,
  // around the line the engine draws, so its formatting is preserved.
  on('ui.render', { component: 'UserMessage' }, async ($, e, next) => {
    rememberRow(e.requestId, e.props.text)
    if (!(await read($, enabled)) || e.props.origin.kind !== 'composer' || e.props.text.trim() === '') {
      return next(e)
    }
    const { Box, Text } = $.ui.resolve(e)
    const hq = ((await read($, search))?.query ?? '').toLowerCase()

    // a /command line passes through here only as a provisional copy, then Claude Code
    // redraws it by itself: coloring it would only cause a flicker (verified 2026-11-18)
    if (COMMAND_ROW.test(e.props.text)) {
      return next(e)
    }

    return (
      <Box flexDirection="row" marginTop={1} marginRight={GAP}>
        <Box width={1} backgroundColor={BLUE} />
        <Box flexGrow={1} backgroundColor={USER_BG} paddingX={2} paddingY={1}>
          <Text>
            {splitHits(e.props.text, hq).map(([t, hit]) =>
              hit ? (
                <Text backgroundColor={HL_BG} color={HL_FG} bold>
                  {t}
                </Text>
              ) : (
                t
              ),
            )}
          </Text>
        </Box>
      </Box>
    )
  })

  // Responses with code blocks: text in normal markdown, each ``` block
  // in a box with a green bar and dark background, highlighted by language
  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    rememberRow(e.requestId, e.props.text)
    if (!(await read($, enabled))) {
      return next(e)
    }
    const { Box, Button, Code, Link, Markdown, Text } = $.ui.resolve(e)
    if (e.props.isSummary === true) {
      return <Box paddingRight={GAP}>{await next(e)}</Box>
    }
    // pieces in order: text, ``` blocks and tables (tables only outside code)
    const hq = ((await read($, search))?.query ?? '').toLowerCase()
    const mark = (text: string) =>
      splitHits(text, hq).map(([t, hit]) =>
        hit ? (
          <Text backgroundColor={HL_BG} color={HL_FG} bold>
            {t}
          </Text>
        ) : (
          t
        ),
      )
    // markdown as usual; while a search is on, paragraphs holding it are drawn as plain
    // text with the occurrences highlighted
    // One line of prose: `code` in the inline-code colour, **bold**, bare URLs as coloured
    // clickable links, search matches marked
    const inline = (line: string) =>
      line.split(/(`[^`\n]+`|\*\*[^*\n]+\*\*|https?:\/\/[^\s<>()`*]+[^\s<>()`*.,;:!?'"])/).map((tok, i) =>
        // a bold lead-in that opens the line ("**Next steps:** ...") reads as a heading: orange
        i === 1 && line.startsWith('**') && tok.startsWith('**') && tok.endsWith('**') && tok.length > 4 ? (
          <Text bold color={ACCENT}>
            {mark(tok.slice(2, -2))}
          </Text>
        ) : tok.startsWith('`') && tok.endsWith('`') && tok.length > 2 ? (
          <Text color={CODE_INLINE} bold>
            {mark(tok.slice(1, -1))}
          </Text>
        ) : tok.startsWith('**') && tok.endsWith('**') && tok.length > 4 ? (
          // bold inside a sentence: the inline-code colour, so it stands out from plain text
          <Text bold color={CODE_INLINE}>
            {mark(tok.slice(2, -2))}
          </Text>
        ) : /^https?:\/\//.test(tok) ? (
          <Text color={BLUE} underline italic>
            <Link href={tok}>{mark(tok)}</Link>
          </Text>
        ) : (
          mark(tok)
        ),
      )
    // A paragraph the mod draws itself: lines with bullets, headings and quotes kept.
    // Anything richer (links, italics, html, strikethrough) stays with the engine's markdown
    const simple = (para: string) => !/\]\(|<[a-z/]|~~|(^|[^*])\*[^*\s][^*]*\*(?!\*)|(^|\s)_[^_]+_(\s|$)/i.test(para)
    const ownPara = (para: string) => (
      <Box flexDirection="column">
        {para.split('\n').map(line => {
          const b = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(line)
          if (b) {
            const pad = (b[1] ?? '').length
            const bullet = /\d/.test(b[2] ?? '') ? `${b[2]} ` : '– '
            return (
              <Box flexDirection="row" marginLeft={pad}>
                <Box width={bullet.length} flexShrink={0}>
                  <Text color={ACCENT_SOFT}>{bullet}</Text>
                </Box>
                <Box flexGrow={1} flexShrink={1}>
                  <Text>{inline(b[3] ?? '')}</Text>
                </Box>
              </Box>
            )
          }
          const hd = /^#{1,6}\s+(.*)$/.exec(line)
          if (hd) {
            return (
              <Text bold color={ACCENT}>
                {inline(hd[1] ?? '')}
              </Text>
            )
          }
          const qt = /^>\s?(.*)$/.exec(line)
          if (qt) {
            return (
              <Text>
                <Text dimColor>│ </Text>
                <Text dimColor>{inline(qt[1] ?? '')}</Text>
              </Text>
            )
          }
          return <Text>{inline(line)}</Text>
        })}
      </Box>
    )
    const prose = (md: string) => (
      <Box flexDirection="column">
        {md.split(/\n{2,}/).map((para, n) => (
          <Box marginTop={n === 0 ? 0 : 1}>
            {simple(para) ? ownPara(para) : hq !== '' && para.toLowerCase().includes(hq) ? <Text>{mark(plainMd(para))}</Text> : <Markdown text={para} />}
          </Box>
        ))}
      </Box>
    )
    const pieces = splitCode(e.props.text)
      .flatMap(p => (p.code === undefined ? splitTables(p.text) : [p]))
      .flatMap(p => (p.code === undefined && p.table === undefined ? splitQuotes(p.text) : [p]))
      .flatMap((p, i, all) => (p.code === undefined && p.table === undefined ? splitLabels(p.text, all[i + 1]?.table !== undefined) : [p]))
      .flatMap(p => (p.code === undefined && p.table === undefined && p.label === undefined ? splitLists(p.text) : [p]))
    const nTables = pieces.filter(p => p.table !== undefined).length
    let k = 0
    let kc = 0
    let kq = 0
    // usable chat width: viewport minus bullet, margin toward the sidebar and some breathing room
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
            // blank line between one piece and the next, but not at the top nor between a heading and its list
            const top = prev === undefined || prev.label !== undefined ? 0 : 1
            if (p.code !== undefined) {
              const src = p.code
              const ci = ++kc
              return (
                <Box flexDirection="column" marginY={1}>
                  <Box flexDirection="row">
                    <Box width={1} backgroundColor={CODE_BAR} />
                    <Box flexDirection="column" flexGrow={1} backgroundColor={CODE_BG} paddingX={1}>
                      {p.lang !== '' && <Text dimColor>{p.lang}</Text>}
                      <Code source={src} language={p.lang || undefined} />
                    </Box>
                  </Box>
                  <Button
                    key={`code-${ci}`}
                    onPress={async press => {
                      const r = await $.ui.copy({ text: src, surface: press.surface })
                      $.ui.toast(r.isCopied ? `Code copied (${src.split('\n').length} lines)` : 'Copy failed')
                    }}
                  >
                    <Text color={BLUE}>⧉ Copy code</Text>
                  </Button>
                </Box>
              )
            }
            if (p.table !== undefined) {
              const t = p.table
              const i = ++k
              const grid = tableGrid(t, maxW - 2) // 2 columns for the outer border

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
                                {mark(cell)}
                              </Text>
                            </Text>
                          ))}
                        </Text>
                      ))}
                    </Box>
                  )}
                  <Box flexDirection="row">
                    <Button key={`tab-${i}`} onPress={() => void copyTable($, t)}>
                      <Text color={BLUE}>⧉ Copy table{nTables > 1 ? ` ${i}` : ''}</Text>
                    </Button>
                    <Box marginLeft={1}>
                      <Button
                        key={`tabtxt-${i}`}
                        onPress={() => {
                          // a <pre> block: Teams pastes it as a code block, compact and aligned
                          const txt = tableText(t)
                          void copyRich($, `<pre style='font-family:Consolas,monospace;font-size:10pt'>${esc(txt)}</pre>`, txt.replace(/\n/g, '\r\n'), 'Table copied as a code block: paste it into Teams, Outlook or Word')
                        }}
                      >
                        <Text color={BLUE}>⧉ Copy as code</Text>
                      </Button>
                    </Box>
                  </Box>
                </Box>
              )
            }

            if (p.label !== undefined) {
              return (
                <Box marginTop={prev === undefined ? 0 : 1}>
                  <Text bold color={ACCENT}>
                    {mark(p.label)}
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
                    {prose(p.text)}
                  </Box>
                </Box>
              )
            }

            const quote = quoteOf(p.text)
            if (quote !== '') {
              const qi = ++kq
              return (
                <Box flexDirection="column" width={proseW} marginTop={top}>
                  <Box flexDirection="row">
                    <Box width={1} flexShrink={0} backgroundColor={TOOL_BAR} />
                    <Box flexDirection="column" flexGrow={1} flexShrink={1} paddingLeft={2}>
                      {prose(quote)}
                    </Box>
                  </Box>
                  <Button key={`quote-${qi}`} onPress={() => void copyRich($, mdHtml(quote), mdPlain(quote), 'Text copied with its formatting: paste it into Teams, Outlook or a web form')}>
                    <Text color={BLUE}>⧉ Copy text</Text>
                  </Button>
                </Box>
              )
            }
            return (
              <Box width={proseW} marginTop={top}>
                {prose(p.text)}
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

  // End-of-response line: "▣ model · duration" in place of "Crunched for 2m 29s"
  // The dim line under the prompt: "▣ Opus 5.5 · high" first, then the engine's own hint
  // (esc to interrupt, permission mode...), as OpenCode shows agent and model under its input
  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    if (!(await read($, enabled))) {
      return next(e)
    }
    const { Box, Text } = $.ui.resolve(e)
    const u = await read($, usage)
    const eff = await read($, effort)

    return (
      <Box flexDirection="row">
        <Text>
          <Text color={BLUE}>▣ </Text>
          <Text bold>{prettyModel(u?.model)}</Text>
          {eff !== null && (
            <Text>
              <Text dimColor> · </Text>
              <Text color={VIOLET}>{eff}</Text>
            </Text>
          )}
          {e.props.hint.trim() !== '' && <Text dimColor>{'   '}{e.props.hint}</Text>}
        </Text>
      </Box>
    )
  })

  // Tool results ("Wrote 17 lines to ...", file previews, command output): the engine's
  // drawing on a slightly lighter background, so they stand apart from the reply
  on('ui.render', { component: 'ToolResult' }, async ($, e, next) => {
    // expanded (ctrl+o, --verbose): the engine adds blank rows around it, which the
    // background would paint as a grey frame; left as the engine draws it
    if (!(await read($, enabled)) || e.props.isExpanded === true) {
      return next(e)
    }
    const { Box } = $.ui.resolve(e)
    // OpenCode style: a grey bar on the left, as the blue one on your prompts
    return (
      <Box flexDirection="row" marginRight={GAP}>
        <Box width={1} flexShrink={0} backgroundColor={TOOL_BAR} />
        <Box flexDirection="column" flexGrow={1} backgroundColor={TOOL_BG}>
          {await next(e)}
        </Box>
      </Box>
    )
  })

  // Compact mode: the 2-line summary above the prompt instead of the side panel
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (!(await read($, compactA)) || !(await read($, enabled)) || e.props.hasSurvey) {
      return next(e)
    }
    return await miniView($, $.ui.resolve(e), true)
  })

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
        {/* thin line closing the turn: separates one question/answer from the next */}
        <Box marginTop={1}>
          <Text color={TURN_RULE}>{'─'.repeat(Math.max(10, (e.viewport?.columns ?? 100) - GAP - 2))}</Text>
        </Box>
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Input, Text } = $.ui.resolve(e)
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
    const today = localStamp(await $.clock.now())
    const pull = await read($, pr)
    const term = await read($, termLook)
    const tl = await read($, tasks)
    const found = await read($, search)
    const others = (await read($, peers)).filter(x => !x.self)
    const target = await read($, peerTo)
    const targetPeer = others.find(x => x.sessionId === target)
    // by default only what needs an eye: running, queued, waiting for approval, failed
    const pl = (await read($, pipes)).filter(r => PIPES_ALL || r.status !== 'completed' || r.result === 'failed').slice(0, PIPES_MAX)
    const prodAz = isProd(w.azSub)
    const prodKube = isProd(w.kube)
    const prodGit = w.branch === 'main' || w.branch === 'master'

    // Narrow window: the panel sits above the prompt -> the 2-line summary
    if (e.props.placement === 'inline') {
      return await miniView($, $.ui.resolve(e), false)
    }

    // Collapsible section: click on the title opens/closes it, the state persists across sessions
    const closed = await read($, collapsed)
    const now = await $.clock.now()
    const section = (id: string, title: string, color: string, count: number | undefined, body: RenderNode) => {
      if (HIDDEN.has(id)) {
        return null
      }
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
    const modelOptions = (await read($, models)).map(m => ({
      value: m.id,
      family: m.family,
      label: m.family.charAt(0).toUpperCase() + m.family.slice(1),
    }))
    const modelValue = fam
    const effortValue = eff !== null && (EFFORTS as readonly string[]).includes(eff) ? eff : undefined

    return (
      // at least as tall as the panel, so the footer sits on its bottom edge when the
      // sections are short (when they are longer it follows them)
      <Box flexDirection="column" paddingLeft={6} paddingRight={2} minHeight={Math.max(1, e.props.scroll.bodyRows)}>
        {/* next to the panel's ✕: shrink the panel to a narrow summary */}
        <Box flexDirection="row" justifyContent="flex-end">
          <Button key="compact" plain onPress={() => void toggleCompact($)}>
            <Text color={BLUE}>⇥ compact</Text>
          </Button>
        </Box>
        {section('dove', 'Where you are', ACCENT, undefined,
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
                <Text dimColor>not a repo</Text>
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

        {section('modello', 'Model', BLUE, undefined,
          <Box flexDirection="column">
            {/* side-by-side buttons instead of a Select: the Select grabs the keyboard and only closes with Esc */}
            <Box flexDirection="row" flexWrap="wrap">
              {modelOptions.map(o => {
                const sel = o.family === modelValue
                return (
                  <Button key={`m-${o.family}`} plain onPress={() => void setModel($, o.value)}>
                    <Text color={sel ? BLUE : undefined} bold={sel} inverse={sel} dimColor={!sel}>
                      {` ${o.label} `}
                    </Text>
                  </Button>
                )
              })}
              {/* Claude Code's picker: complete and always up to date */}
              <Button key="m-more" plain onPress={() => void openPicker($, 'model')}>
                <Text dimColor>{' … '}</Text>
              </Button>
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

        {section('search', 'Search', ACCENT, found?.total,
          <Box flexDirection="column">
            <Input
              key="search-input"
              placeholder="text to find, Enter (Esc to leave)"
              value={found?.query ?? ''}
              submitLabel="search"
              onSubmit={q => void runSearch($, q)}
            />
            {found !== null && found.total === 0 && <Text dimColor>no match for "{cut(found.query, cols - 16)}"</Text>}
            {found !== null && found.total > 0 && (
              <Box flexDirection="column">
                <Text dimColor>
                  {found.total} match{found.total === 1 ? '' : 'es'} in {found.inMessages} message{found.inMessages === 1 ? '' : 's'}, newest first
                </Text>
                {found.hits.slice(found.page * 6, found.page * 6 + 6).map((hit, n) => (
                  <Button key={`hit-${found.page}-${n}`} plain onPress={() => void jumpTo($, hit.probe, hit.match)}>
                    <Text>
                      <Text color={hit.role === 'user' ? BLUE : VIOLET}>{hit.role === 'user' ? 'you ' : 'claude '}</Text>
                      <Text dimColor>{cut(hit.before, 24)}</Text>
                      <Text bold color={ACCENT}>{hit.match}</Text>
                      <Text dimColor>{cut(hit.after, Math.max(10, cols - 34 - hit.match.length))}</Text>
                    </Text>
                  </Button>
                ))}
                <Box flexDirection="row">
                  {found.page > 0 && (
                    <Button key="hits-prev" plain onPress={() => void update($, search, r => (r === null ? r : { ...r, page: r.page - 1 }))}>
                      <Text dimColor>{' ‹ newer '}</Text>
                    </Button>
                  )}
                  {(found.page + 1) * 6 < found.hits.length && (
                    <Button key="hits-next" plain onPress={() => void update($, search, r => (r === null ? r : { ...r, page: r.page + 1 }))}>
                      <Text dimColor>{' older › '}</Text>
                    </Button>
                  )}
                  <Button key="hits-clear" plain onPress={() => void update($, search, () => null)}>
                    <Text dimColor>{' clear '}</Text>
                  </Button>
                </Box>
              </Box>
            )}
          </Box>,
        )}

        {others.length > 0 &&
          section('sessioni', 'Sessions', BLUE, others.length,
            <Box flexDirection="column">
              {others.map(x => (
                <Button
                  key={`peer-${x.sessionId}`}
                  plain
                  onPress={() => void update($, peerTo, cur => (cur === x.sessionId ? null : x.sessionId))}
                >
                  <Text>
                    <Text color={x.status === 'busy' ? 'warning' : 'success'}>{x.sessionId === target ? '▸ ' : '● '}</Text>
                    <Text bold={x.sessionId === target}>{cut(x.name, cols - 10)}</Text>
                    <Text dimColor> {x.status}</Text>
                  </Text>
                </Button>
              ))}
              {targetPeer !== undefined && (
                <Box flexDirection="column" marginTop={1}>
                  <Text dimColor>{cut(targetPeer.cwd.replace(/^.*[\\/]/, ''), cols - 2)}</Text>
                  <Input
                    key={`peer-msg-${targetPeer.sessionId}`}
                    placeholder={`message to ${cut(targetPeer.name, 20)}, Enter (Esc to leave)`}
                    value=""
                    submitLabel="send"
                    onSubmit={t => void sendToPeer($, targetPeer.sessionId, targetPeer.name, t)}
                  />
                </Box>
              )}
              {targetPeer === undefined && <Text dimColor>click a session to write to it</Text>}
            </Box>,
          )}
        {section('modalita', 'Active modes', VIOLET, act.length + (ns ? 1 : 0),
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
                  onPress={() => {
                    const def = MODE_SKILLS[modeName(m)]
                    // skill: stop phrase in the prompt; ultracode: just remove it from the list
                    void (def !== undefined
                      ? $.prompt.fill({ text: def.stop })
                      : update($, modes, ms => ms.filter(x => x !== m)))
                  }}
                >
                  <Text dimColor>✕</Text>
                </Button>
              </Box>
            ))}
          </Box>,
        )}

        {section('contesto', 'Context', BLUE, undefined,
          <Box flexDirection="column">
            <Text color={pctColor}>{bar(pct, barW)} {Math.round(pct)}%</Text>
            <Text dimColor>
              {kTok(u?.tokens)}/{kTok(u?.window)} token
            </Text>
            {u?.limits.map(l => (
              <Text dimColor>
                {l.kind === 'five_hour' ? '5h limit' : l.kind === 'seven_day' ? '7d limit' : l.kind} {Math.round(l.percentUsed)}%
              </Text>
            ))}
            {u?.startedAt !== undefined && <Text dimColor>session {since(now - u.startedAt)}</Text>}
          </Box>,
        )}

        {section('azioni', 'Quick actions', VIOLET, undefined,
          <Box flexDirection="row" flexWrap="wrap">
            <Box marginRight={1}>
              <Button key="act-compact" onPress={() => void runOrFill($, 'compact', '')}>
                <Text>Compact</Text>
              </Button>
            </Box>
            <Box marginRight={1}>
              <Button key="act-context" onPress={() => void runOrFill($, 'context', '')}>
                <Text>Context</Text>
              </Button>
            </Box>
            <Box marginRight={1}>
              <Button
                key="act-copydir"
                onPress={async press => {
                  const r = await $.ui.copy({ text: (await $.session.cwd()), surface: press.surface })
                  $.ui.toast(r.isCopied ? 'Folder path copied' : 'Copy failed')
                }}
              >
                <Text>Copy path</Text>
              </Button>
            </Box>
            <Box marginRight={1}>
              <Button key="act-paste" onPress={() => void pasteImage($)}>
                <Text>Paste image</Text>
              </Button>
            </Box>
            {term === 'pending' && (
              <Box marginRight={1}>
                <Button key="act-term" onPress={async () => $.ui.toast(await applyTerminalLook($))}>
                  <Text color={ACCENT}>Terminal look</Text>
                </Button>
              </Box>
            )}
          </Box>,
        )}

        {pull !== null &&
          section('pr', 'Pull request', BLUE, undefined,
            <Box flexDirection="column">
              {pull.state === 'none' && <Text dimColor>none open for {cut(pull.branch, cols - 20)}</Text>}
              {pull.state === 'error' && <Text dimColor>not available: {cut(pull.title, cols - 16)}</Text>}
              {pull.state === 'open' && (
                <Box flexDirection="column">
                  {/* display only: the mod never acts on the pull request */}
                  <Text>
                    <Text color={BLUE} bold>#{pull.id}</Text>
                    {pull.draft ? <Text dimColor> draft</Text> : ''} {cut(pull.title, cols - 10)}
                  </Text>
                  <Text>
                    <Text dimColor>reviews </Text>
                    <Text color="success">✓{pull.approved}</Text>
                    <Text color={pull.rejected > 0 ? 'error' : undefined} dimColor={pull.rejected === 0}> ✗{pull.rejected}</Text>
                    {pull.waiting > 0 && <Text color="warning"> ⏸{pull.waiting}</Text>}
                    <Text dimColor>   CI </Text>
                    <Text color={pull.ci === 'passed' ? 'success' : pull.ci === 'failed' ? 'error' : pull.ci === 'running' ? 'warning' : undefined} dimColor={pull.ci === 'none'}>
                      {pull.ci === 'passed' ? '✓ passed' : pull.ci === 'failed' ? '✗ failed' : pull.ci === 'running' ? '⏳ running' : '—'}
                    </Text>
                  </Text>
                </Box>
              )}
            </Box>,
          )}

        {tl.length > 0 &&
          section('tasks', 'Tasks', ACCENT, undefined,
            <Box flexDirection="column">
              <Text dimColor>
                {tl.filter(t => t.status === 'completed').length}/{tl.length} done
              </Text>
              {[...tl.filter(t => t.status === 'in_progress'), ...tl.filter(t => t.status === 'pending'), ...tl.filter(t => t.status === 'completed')]
                .slice(0, 8)
                .map(t => (
                  <Text dimColor={t.status === 'completed'} bold={t.status === 'in_progress'}>
                    <Text color={t.status === 'completed' ? 'success' : t.status === 'in_progress' ? ACCENT : undefined}>
                      {t.status === 'completed' ? '✓' : t.status === 'in_progress' ? '▶' : '○'}
                    </Text>{' '}
                    {cut(t.subject, cols - 4)}
                  </Text>
                ))}
            </Box>,
          )}

        {pl.length > 0 &&
          section('pipelines', 'Pipelines', BLUE, pl.filter(r => r.status !== 'completed' && r.status !== 'error').length || undefined,
            <Box flexDirection="column">
              {pl.map(r => {
                if (r.status === 'error') {
                  return <Text dimColor>{cut(`${r.project}: ${r.error}`, cols)}</Text>
                }
                const icon = r.approval ? '⏸' : r.status === 'inProgress' ? '⏳' : r.status === 'notStarted' ? '…' : r.result === 'succeeded' ? '✓' : r.result === 'failed' ? '✗' : r.result === 'partiallySucceeded' ? '⚠' : '⊘'
                const tone = r.approval || r.status === 'inProgress' ? 'warning' : r.result === 'succeeded' ? 'success' : r.result === 'failed' ? 'error' : r.result === 'partiallySucceeded' ? 'warning' : undefined
                const ago = since(now - (r.finished || r.queued))
                return (
                  <Box flexDirection="column">
                    <Text>
                      <Text color={tone}>{icon} </Text>
                      {cut(r.name, cols - 12)}
                      <Text dimColor> #{r.id}</Text>
                    </Text>
                    <Text dimColor>
                      {'  '}
                      {r.approval ? 'waiting for approval · ' : ''}
                      {cut(r.branch, Math.max(8, cols - 22))} · {ago}
                    </Text>
                  </Box>
                )
              })}
            </Box>,
          )}

        {section('scritture', 'Write commands', wr.length > 0 ? PROD : VIOLET, wr.length,
          <Box flexDirection="column">
            {wr.length === 0 && <Text dimColor>none in this session</Text>}
            {wr.slice(0, 6).map(c => (
              <Text>
                <Text dimColor>{hhmm(c.at)} </Text>
                <Text color={c.ok ? 'success' : 'error'}>{c.ok ? '✓' : '✗'}</Text> {cut(c.text, cols - 8)}
              </Text>
            ))}
          </Box>,
        )}

        {rem.length > 0 &&
          section('promemoria', 'Reminders', VIOLET, rem.length,
            <Box flexDirection="column">
              {rem.slice(0, 3).map(r => (
                <Box flexDirection="column">
                  <Text>
                    <Text color={r.due <= today ? 'error' : 'warning'}>{r.due.slice(8, 10)}/{r.due.slice(5, 7)} {r.due.slice(11, 16)}</Text> {cut(r.title, cols - 13)}
                  </Text>
                  <Box flexDirection="row" marginLeft={6}>
                    <Button key={`rem-done-${r.id}`} plain onPress={() => void changeReminder($, r.id, 'done')}>
                      <Text color="success">{' ✓ done '}</Text>
                    </Button>
                    <Button key={`rem-snooze-${r.id}`} plain onPress={() => void changeReminder($, r.id, 'snooze')}>
                      <Text dimColor>{' +1 day '}</Text>
                    </Button>
                  </Box>
                </Box>
              ))}
            </Box>,
          )}

        {section('file', 'Edited files', ACCENT, list.length,
          <Box flexDirection="column">
            {list.length === 0 && <Text dimColor>none</Text>}
            {list.slice(0, 8).map(f => (
              <Text>
                <Text color="success">●</Text> {cut(short(f.path), cols - 7)} <Text dimColor>×{f.edits}</Text>
              </Text>
            ))}
          </Box>,
        )}

        {/* footer, as OpenCode's: which Claude Code, pinned to the bottom by the spacer */}
        <Box flexGrow={1} />
        <Box flexDirection="column" marginTop={1}>
          {CC_VERSION !== '' && (
            <Text>
              <Text color="success">● </Text>
              <Text bold>Claude Code</Text>
              <Text dimColor> {CC_VERSION}</Text>
            </Text>
          )}
        </Box>
      </Box>
    )
  })
}

export type Usage = {
  model: string
  tokens?: number
  window?: number
  percent?: number
  usd?: number
  limits: { kind: string; percentUsed: number; resetsAt?: string }[]
  /** session start (ms), for the duration */
  startedAt?: number
}

export type FileEdit = { path: string; edits: number }

/** Where the session is operating: read from ~/.azure, ~/.kube/config and the git repo */
export type Where = {
  cwd?: string
  azSub?: string
  azTenant?: string
  kube?: string
  kubeNs?: string
  branch?: string
  dirty?: number
  /** local commits to push / remote commits to pull relative to the upstream */
  ahead?: number
  behind?: number
}

/** A command with effects outside the machine (apply, delete, push...) run in the session */
export type WriteCmd = { at: number; text: string; ok: boolean }

export type Reminder = { id: string; due: string; title: string }

/** Pull request of the current branch: `none` = no open PR, `error` = could not ask (title holds why) */
export type PullRequest = {
  branch: string
  state: 'open' | 'none' | 'error'
  id: number
  title: string
  url: string
  draft: boolean
  approved: number
  rejected: number
  waiting: number
  ci: 'passed' | 'failed' | 'running' | 'none'
}

/** Result of a search over the session's messages; hits newest first, `page` of 6 */
export type SearchResult = {
  query: string
  total: number
  inMessages: number
  page: number
  hits: { role: 'user' | 'assistant'; msg: number; before: string; match: string; after: string; probe: string }[]
}

/** An Azure DevOps pipeline run requested by you (status `error` = the project could not be read) */
export type Peer = { sessionId: string; name: string; cwd: string; status: string; self: boolean }

export type PipelineRun = {
  project: string
  id: number
  name: string
  status: string
  result: string
  branch: string
  queued: number
  finished: number
  approval: boolean
  error: string
}

/** Handover quick action: idle, ask (choosing where to continue), writing (Claude writes the note), clearing */
export type HandoverPhase = 'idle' | 'ask' | 'writing' | 'clearing'

/** Another coding agent installed on this machine that can take a handover or a delegated task */
export type AgentId = 'opencode' | 'antigravity' | 'codex' | 'gemini'

/** A task delegated to another agent: running in the background, then done or failed */
export type DelegateJob = { id: string; to: AgentId; title: string; out: string; at: number; state: 'run' | 'done' | 'error'; ms?: number; note?: string; base?: string; cwd?: string; wait?: boolean; model?: string; write?: boolean; repo?: string; head?: string }

/** A side question asked from the panel's Aside section (/btw): never added to the chat */
export type Aside = { id: string; q: string; a: string; state: 'wait' | 'done' | 'error' }

/** One item of Claude's task list */
/** Work running beside the turn: a subagent (from $.agent.list) or a background command / monitor */
export type RunningItem = { id: string; kind: string; label: string; start?: number; tokens?: number }

export type TaskItem = { id: string; subject: string; status: 'pending' | 'in_progress' | 'completed' }

/** A selectable model: family (fable, mythos...) and what to pass to /model (alias or id) */
export type ModelChoice = { family: string; id: string }

declare module 'claude-code' {
  interface PluginState {
    cockpit: {
      usage: Shaped<Usage | null>
      files: Shaped<FileEdit[]>
      where: Shaped<Where>
      writes: Shaped<WriteCmd[]>
      reminders: Shaped<Reminder[]>
      warned: Shaped<boolean>
      /** /newstyle on|off: session copy of the value kept in $.store */
      enabled: Shaped<boolean>
      /** effort of the last main-loop request (or from the settings before the first) */
      effort: Shaped<string | null>
      /** ids of the collapsed sections (session copy of the value in $.store) */
      collapsed: Shaped<string[]>
      /** order of the panel sections chosen in the layout editor (session copy of $.store) */
      order: Shaped<string[]>
      /** sections hidden from the layout editor (session copy of $.store) */
      hidden: Shaped<string[]>
      /** the layout editor is open */
      layout: Shaped<boolean>
      /** finished pipeline runs cleared from the panel, "<project>#<id>" (session copy of $.store) */
      pipesCleared: Shaped<string[]>
      /** room around the panel text: compact, normal or airy (session copy of $.store) */
      density: Shaped<'compact' | 'normal' | 'airy'>
      /** files whose paths are in a prompt: left alone, copied or moved into the attachments folder */
      attachMode: Shaped<'off' | 'copy' | 'move'>
      /** attachments folder set in ⚙ layout per working folder (lowercase path with /) */
      attachDirs: Shaped<Record<string, string>>
      /** "mode" skills turned on in this session (e.g. "i-have-adhd", "ponytail full") */
      modes: Shaped<string[]>
      /** models shown in "Modello": known aliases + families seen in use or in agents */
      models: Shaped<ModelChoice[]>
      /** pull request of the current branch, null outside a GitHub/Azure DevOps repo */
      pr: Shaped<PullRequest | null>
      /** Claude's task list in this session */
      tasks: Shaped<TaskItem[]>
      /** last search in the session's messages */
      search: Shaped<SearchResult | null>
      /** Azure DevOps runs requested by you in the last 24 hours */
      pipes: Shaped<PipelineRun[]>
      /** Windows Terminal look: na (not Windows Terminal), pending (not applied), done */
      termLook: Shaped<'na' | 'pending' | 'done'>
      /** Claude Code sessions running on this machine (this one marked self) */
      peers: Shaped<Peer[]>
      /** session id chosen in Sessions to write to */
      peerTo: Shaped<string | null>
      /** compact panel (session copy of the value in $.store) */
      compact: Shaped<boolean>
      /** the ↻ button is refreshing every section */
      busy: Shaped<boolean>
      /** id of the reminder shown in full (clicked in the panel) */
      remOpen: Shaped<string | null>
      /** the main conversation's prompt cache: when its last request went out and how long the cache holds */
      cache: Shaped<{ at: number; ttl: number } | null>
      /** a counter the panel reads so time-based lines (cache countdown) redraw every 30 s */
      tick: Shaped<number>
      /** subagents running now */
      agentsRun: Shaped<RunningItem[]>
      /** background commands, monitors and workflows still running */
      bgRun: Shaped<RunningItem[]>
      /** MCP servers whose tools the session has now, with how many tools and how many can write */
      /** OpenAI-compatible model servers found on this machine or the private network (Ollama, LM Studio, vLLM) */
      localLlm: Shaped<{ base: string; label: string; provider: string; models: string[] }[]>
      mcpServers: Shaped<{ name: string; plugin?: string; tools: number; writes: number; login: boolean }[]>
      /** side questions asked from the panel, newest first (at most 5) */
      asides: Shaped<Aside[]>
      /** id of the side question shown in full (null: the newest) */
      asideOpen: Shaped<string | null>
      asideStash: Shaped<string>
      /** Handover quick action: where it stands */
      handover: Shaped<HandoverPhase>
      /** other agents found in PATH (OpenCode, Antigravity) */
      agents: Shaped<AgentId[]>
      /** agents Claude may hand easy tasks to on its own (session copy of the value in $.store) */
      delegateAuto: Shaped<AgentId[]>
      /** tasks delegated in this session, newest first (at most 6) */
      delegations: Shaped<DelegateJob[]>
      /** "+" pressed in Reminders or Active modes */
      adding: Shaped<'rem' | 'mode' | 'skill' | null>
      /** a skill typed in Active modes that is not installed: waiting for "Install" */
      skillAsk: Shaped<string | null>
    }
  }
}

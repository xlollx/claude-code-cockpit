export type Usage = {
  model: string
  tokens?: number
  window?: number
  percent?: number
  usd?: number
  limits: { kind: string; percentUsed: number }[]
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

/** One item of Claude's task list */
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
    }
  }
}

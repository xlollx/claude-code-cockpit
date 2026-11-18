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

export type Reminder = { due: string; title: string }

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
    }
  }
}

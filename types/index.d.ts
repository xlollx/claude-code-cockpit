export type Usage = {
  model: string
  tokens?: number
  window?: number
  percent?: number
  usd?: number
  limits: { kind: string; percentUsed: number }[]
  /** inizio della sessione (ms), per la durata */
  startedAt?: number
}

export type FileEdit = { path: string; edits: number }

/** Dove sta operando la sessione: letto da ~/.azure, ~/.kube/config e dal repo git */
export type Where = {
  cwd?: string
  azSub?: string
  azTenant?: string
  kube?: string
  kubeNs?: string
  branch?: string
  dirty?: number
  /** commit locali da pushare / remoti da scaricare rispetto all'upstream */
  ahead?: number
  behind?: number
}

/** Un comando con effetti all'esterno (apply, delete, push...) eseguito in sessione */
export type WriteCmd = { at: number; text: string; ok: boolean }

export type Reminder = { due: string; title: string }

declare module 'claude-code' {
  interface PluginState {
    sidebar: {
      usage: Shaped<Usage | null>
      files: Shaped<FileEdit[]>
      where: Shaped<Where>
      writes: Shaped<WriteCmd[]>
      reminders: Shaped<Reminder[]>
      warned: Shaped<boolean>
      /** /newstyle on|off: copia di sessione del valore tenuto in $.store */
      enabled: Shaped<boolean>
      /** effort dell'ultima richiesta del loop principale (o dai settings prima della prima) */
      effort: Shaped<string | null>
      /** id delle sezioni compresse (copia di sessione del valore in $.store) */
      collapsed: Shaped<string[]>
      /** skill "a modalita'" accese in questa sessione (es. "i-have-adhd", "ponytail full") */
      modes: Shaped<string[]>
    }
  }
}

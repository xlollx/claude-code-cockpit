# claude-code-cockpit

A Claude Code mod for the terminal: an operational side panel that shows where you are and what you changed, and a chat that is easier to read. The look is inspired by OpenCode.

![The side panel next to a reply with a heading and a numbered list](docs/panel-and-plan.png)

## What it does

### Side panel (`/cockpit`, alias `/sidebar`)

| Section | Shows |
|---|---|
| Where you are | folder, Azure subscription and tenant, kubectl context and namespace, git branch with uncommitted changes ● and commits ↑ to push / ↓ to pull (red when it looks like production) |
| Model | one button per model family (`Fable`, `Mythos`, `Opus`, `Sonnet`, `Haiku`...) and `low medium high xhigh max`: one click applies it. New families appear by themselves as soon as they are used, or when an agent in `~/.claude/agents` names them in `model:`; `…` opens Claude Code's full model picker |
| Search | a text field: type, Enter, and see every occurrence in the session's messages (your prompts and Claude's replies), newest first, with the match highlighted; click a hit to scroll the chat to it. While a search is on, its occurrences are highlighted in the chat (prompts, replies, headings, tables; not inside code blocks), and `clear` turns that off. Esc gives the keyboard back to the prompt |
| Active modes | `newstyle` and the session's mode skills (`i-have-adhd`, `caveman`, `ponytail` + level), turned on with `/skill` or in words ("adhd mode on", "caveman mode off"), plus `ultracode` when the last prompt contains it; `✕` puts the phrase that turns a skill off into the prompt |
| Context | fill bar, tokens, 5-hour and 7-day limits, session duration; a warning at 80% |
| Pipelines | Azure DevOps runs requested by you in the last 24 hours, however they were started (portal, `az pipelines run`, REST, a PR); by default only running, queued, waiting for approval and failed ones, at most 4 (`pipelinesShow`, `pipelinesMax`): ⏳ running, ⏸ waiting for approval, ✓ / ✗ / ⚠ / ⊘ result, branch and age. Display only (GET). Watches the current repo's project, any project named in a command, and `adoProjects`; needs `az login` (token for the organization's tenant) |
| Pull request | the open PR of the current branch on GitHub or Azure DevOps: number, title, draft, reviews (✓ approved, ✗ changes requested / rejected, ⏸ waiting) and CI result. Display only: the mod sends GET requests and never changes the pull request. Uses the credential git already holds (Git Credential Manager), never prompts; refreshed every 2 minutes, on branch change and after a push |
| Tasks | Claude's task list for the session (`TaskCreate`/`TaskUpdate`, or `TodoWrite`): in progress ▶ first, then pending ○, then done ✓, with the done/total count |
| Quick actions | `Compact`, `Context`, `Copy path`, `Paste image` (saves the clipboard image, or a file copied in Explorer, and puts its path in the prompt: no need to save or drag a file) |
| Write commands | commands with effects outside your machine: `tofu`/`terraform apply`, `az ... create/delete/set`, `kubectl apply/delete`, `helm`, `flux`, `git push`, `gh pr create`, REST writes, and MCP tools that write (kubectl_apply, repo_create_branch...) |
| Reminders / Files | reminders due within 7 days (optional, see below) with `✓ done` and `+1 day` buttons that update the file, files edited in the session |

- Click a section title to fold or unfold it (remembered across sessions).
- At the bottom: the Claude Code version, pinned to the panel's bottom edge.
- In a wide terminal the panel sits on the side; in a narrow one it becomes a two-line bar above the prompt.

### Chat

![Table with coloured header and copy button, code block, end-of-turn line](docs/chat-and-panel.png)

| Element | Style |
|---|---|
| Your prompts | box with a blue bar and dark background |
| `/command` output | orange bar (red on error) |
| Replies | `inline code` in soft teal instead of Claude Code's periwinkle, short heading lines in bold orange, lists drawn with coloured numbers and a blank line between items that have sub-items, prose across the chat width (or wrapped at `proseWidth`) |
| Code blocks | box with a green bar, language name, syntax highlighting, and `⧉ Copy code` under it |
| Tables | outer border, coloured header, striped rows; columns shrink and wrap when the table is wider than the chat |
| `⧉ Copy table` | under every table: copies it as HTML, so Teams, Outlook, Word and Excel paste a real table. Windows: HTML + tab-separated text through PowerShell. macOS: HTML + text through `osascript`. Linux: HTML through `wl-copy` or `xclip` (macOS and Linux not tested yet) |
| Under the prompt | `▣ Opus 5.5 · high` before Claude Code's own hint line (esc to interrupt, permission mode), as OpenCode shows agent and model under its input |
| End of turn | `▣ Opus 5.5 · high · 40s` and a thin line between one turn and the next |

`/newstyle on|off` turns the whole look on or off (remembered across sessions).

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install cockpit --marketplace xlollx/claude-code-cockpit
```

From a shell:

```
claude plugin install cockpit --marketplace xlollx/claude-code-cockpit
```

The panel opens by itself in new sessions; `/cockpit` opens it again if you close it.

### Development

Clone the repository and load the folder in every session with `CLAUDE_CODE_PLUGIN_DIRS` in the `env` block of your user `settings.json`, or start Claude Code with `claude --plugin-dir <folder>`. After a change run `claude plugin validate <folder>`. `tsconfig.json` extends the types Claude Code writes into `.claude-plugin/types/` the first time it loads the mod.

## Options

Set them in `/config` (the plugin's rows) or in `settings.json` under `pluginConfigs.cockpit.options`:

| Option | Default | What it does |
|---|---|---|
| `palette` | `dark` | `light` for terminals with a light background |
| `proseWidth` | `0` | wrap reply text at this column (40 or more, e.g. `100` for easier reading); `0` uses the whole chat width |
| `hiddenSections` | empty | panel sections to hide, comma separated: `search`, `pipelines`, `where`, `model`, `modes`, `context`, `pr`, `tasks`, `actions`, `writes`, `reminders`, `files` |
| `prodPattern` | `prod` | regular expression that marks a subscription, kubectl context or branch as production (`noprod`/`nonprod` never match) |
| `openOnStart` | `true` | open the panel when a session starts |
| `adoProjects` | empty | Azure DevOps projects to watch for pipeline runs, comma separated as `org/project` |
| `pipelinesShow` | `active-failed` | `all` shows every run of the last 24 hours, not only running, waiting and failed ones |
| `pipelinesMax` | `4` | how many pipeline runs the panel shows at most |
| `inlineCodeColor` | empty | colour of `inline code` in replies, as `#rrggbb` (default: soft teal `#7fd6c2` on dark, `#0f766e` on light) |

## Optional integrations

None of these is required; each section stays hidden or empty when its source is missing.

- **Reminders**: put a JSON list in `~/.claude/reminders.json` (or the file named by `COCKPIT_REMINDERS_FILE`) and the panel shows the open ones due within 7 days (red when overdue):

  ```json
  [{ "id": "renew-cert", "due": "2026-12-01T09:00", "title": "Renew the TLS certificate", "done": false }]
  ```

- **Active modes** follows these skills when they are installed: `i-have-adhd`, `caveman` (with `ultracave` and `megacave`), `ponytail` (with its level). A skill named `panic`, run without arguments, clears the list. Other skills are not tracked.
- **Azure and Kubernetes** are read from `AZURE_CONFIG_DIR` (default `~/.azure`) and `KUBECONFIG` (default `~/.kube/config`): files only, no CLI call.
- **Production highlight**: subscription and kubectl context turn red when the name matches `prodPattern` (default `prod`, never `noprod` or `nonprod`), and `main`/`master` turn yellow.

## Extras

`extras/windows-terminal-ember-dark.json`: the "Ember Dark" colour scheme for Windows Terminal (Obsidian-like `#1E1E1E` background) (paste it into `schemes` in Windows Terminal's `settings.json`). In Claude Code, `/theme` -> "Dark mode (ANSI colors only)" uses the terminal palette.

## Known limits

These come from what Claude Code lets a mod change:

- The prompt box and the height of the docked panel cannot be restyled.
- `!` shell rows and the `❯ /command` row are drawn by Claude Code and keep their default look.
- MCP server status is not available to mods.
- A dropdown (`Select`) keeps the keyboard until Esc, so model and effort are buttons.
- Claude Code's markdown ignores blank lines inside lists, so the mod draws lists itself.
- Modes turned on before the mod loaded are not shown until you run the skill again.

## Roadmap

Planned ideas and improvements: [ROADMAP.md](ROADMAP.md).

## License

AGPL-3.0, see [LICENSE](LICENSE).

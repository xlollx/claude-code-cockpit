# claude-code-cockpit

A Claude Code mod for the terminal: an operational side panel that shows where you are and what you changed, and a chat that is easier to read. The look is inspired by OpenCode.

## What it does

### Side panel (`/sidebar`)

| Section | Shows |
|---|---|
| Where you are | folder, Azure subscription and tenant, kubectl context and namespace, git branch with uncommitted changes ● and commits ↑ to push / ↓ to pull (red when it looks like production) |
| Model | one button per model family (`Fable`, `Mythos`, `Opus`, `Sonnet`, `Haiku`...) and `low medium high xhigh max`: one click applies it. New families appear by themselves as soon as they are used, or when an agent in `~/.claude/agents` names them in `model:`; `…` opens Claude Code's full model picker |
| Active modes | `newstyle` and the session's mode skills (`i-have-adhd`, `caveman`, `ponytail` + level), plus `ultracode` when the last prompt contains it; `✕` puts the phrase that turns a skill off into the prompt |
| Context | fill bar, tokens, 5-hour and 7-day limits, session duration; a warning at 80% |
| Quick actions | `Compact`, `Context`, `Copy path` |
| Write commands | commands with effects outside your machine: `tofu`/`terraform apply`, `az ... create/delete/set`, `kubectl apply/delete`, `helm`, `flux`, `git push`, `gh pr create`, REST writes, and MCP tools that write (kubectl_apply, repo_create_branch...) |
| Reminders / Files | reminders due within 7 days from `~/.claude/reminders.json`, files edited in the session |

- Click a section title to fold or unfold it (remembered across sessions).
- In a wide terminal the panel sits on the side; in a narrow one it becomes a two-line bar above the prompt.

### Chat

| Element | Style |
|---|---|
| Your prompts | box with a blue bar and dark background |
| `/command` output | orange bar (red on error) |
| Replies | short heading lines in bold orange, lists drawn with coloured numbers and a blank line between items that have sub-items, prose wrapped at 100 columns |
| Code blocks | box with a green bar, language name, syntax highlighting |
| Tables | outer border, coloured header, striped rows; columns shrink and wrap when the table is wider than the chat |
| `⧉ Copy table` | under every table: copies it as HTML (Teams and Outlook paste a real table) and as tab-separated text (Excel). Windows only for now |
| End of turn | `▣ Opus 5.5 · high · 40s` and a thin line between one turn and the next |

`/newstyle on|off` turns the whole look on or off (remembered across sessions).

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install sidebar --marketplace xlollx/claude-code-cockpit
```

From a shell:

```
claude plugin install sidebar --marketplace xlollx/claude-code-cockpit
```

Then open the panel with `/sidebar`.

### Development

Clone the repository and load the folder in every session with `CLAUDE_CODE_PLUGIN_DIRS` in the `env` block of your user `settings.json`, or start Claude Code with `claude --plugin-dir <folder>`. After a change run `claude plugin validate <folder>`. `tsconfig.json` extends the types Claude Code writes into `.claude-plugin/types/` the first time it loads the mod.

## Extras

`extras/windows-terminal-ember-dark.json`: the "Ember Dark" colour scheme for Windows Terminal (paste it into `schemes` in Windows Terminal's `settings.json`). In Claude Code, `/theme` -> "Dark mode (ANSI colors only)" uses the terminal palette.

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

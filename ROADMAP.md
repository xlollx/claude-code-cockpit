# Roadmap

Ideas for improvements, worked on in spare time. Rough order: the top section is what helps most for a first public release.

## Before the first public release

- [x] **English interface**: panel, toasts, buttons, README.
- [x] **Optional integrations documented**: reminders file, mode skills, production highlight.
- [ ] **Screenshots and a GIF** in the README: wide panel, two-line bar, tables, code.
- [ ] **Configurable options** (plugin `userConfig`): colours, prose width, visible sections, the rule that spots production (today: a name containing `prod`).
- [x] **Rename the plugin** `sidebar` -> `cockpit` (`/sidebar` kept as an alias).
- [x] **Copy table on macOS and Linux**: `osascript` on macOS, `wl-copy`/`xclip` on Linux (to be tested on real machines).
- [ ] **Tests** with `claude plugin test` for the pure functions: `splitCode`, `splitTables`, `splitLabels`, `splitLists`, `tableGrid`, `findWrite`, `mcpWrite`.
- [ ] **Italian interface** as an option, next to English.

## Side panel

- [ ] **More clouds and contexts**: AWS profile/region, GCP project, Docker context, OpenTofu/Terraform workspace.
- [ ] **Pull request of the current branch**: number, reviews, CI result (GitHub and Azure DevOps).
- [ ] **Task progress**: Claude's todo/task list with done, in progress and pending items.
- [ ] **Running subagents and background commands**, with their duration.
- [ ] **Context over time**: a small sparkline of how full the context is, to know when to compact.
- [ ] **Clickable edited files**: copy the path or open it in the editor.
- [ ] **Clickable write commands**: copy the full command.
- [ ] **Reminders from the panel**: mark as done, snooze one day.
- [ ] **MCP server status** as soon as the mod API exposes it (not available today).

## Chat

- [ ] **`⧉ Copy code`** under every code block, like tables.
- [ ] **Markdown headings** (`##`, `###`) with the same style as heading lines.
- [ ] **Quotes and callouts** (`> Note`, `> Warning`) in a coloured box.
- [ ] **Diffs** with coloured `+`/`-` lines outside ```diff blocks too.
- [ ] **Tables**: CSV export, sort by column with a click.
- [ ] **Long tool output** folded, one click to expand.
- [ ] **Send time** next to each prompt.
- [ ] **Light palette** for terminals with a light background.

## Done

- [x] Operational side panel (where you are, model and effort, active modes, context, quick actions, write commands, reminders, files).
- [x] Two-line bar in a narrow terminal.
- [x] Model list that updates by itself.
- [x] Write commands matched only at the start of a command, and MCP tools that write.
- [x] Chat look: prompts, command output, code, tables with copy for Teams/Outlook/Excel, readable headings and lists, end-of-turn line.
- [x] `/newstyle on|off`.

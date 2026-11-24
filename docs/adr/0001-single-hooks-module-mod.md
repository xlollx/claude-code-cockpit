# ADR-0001: One hooks module, loaded from a clone or a marketplace

- Status: accepted
- Date: 2026-11-18

## Context

Claude Code mods can draw panes, restyle transcript rows, register commands and tools, and hook engine events. A mod loaded from `~/.claude/dev-mods/<session id>/` works only in that one session. The same folder loaded twice (a copy in `dev-mods` and the clone) is reported as `not loaded`.

## Decision

The whole mod is one hooks module, `hooks/register.tsx`, with its types in `types/index.d.ts` and options in `.claude-plugin/plugin.json` (`userConfig`). There is one source: the git clone. People load it either from the clone, listed in `CLAUDE_CODE_PLUGIN_DIRS`, or from the repository's marketplace (`.claude-plugin/marketplace.json`). `/cockpit-update` and `extras/cockpit-update.ps1` handle both cases: `git pull --ff-only` for a clone, `claude plugin update` for a marketplace install.

## Consequences

- A clone reloads by itself in every open session at the end of the next turn. A marketplace install needs a restart.
- One large file is easy to load and to review in one place, but its sections must stay grouped by feature with a comment header each.
- Reloads stop timers and loops of the old copy: anything long-running must live outside the module ([ADR-0006](0006-delegation-detached-processes.md)).

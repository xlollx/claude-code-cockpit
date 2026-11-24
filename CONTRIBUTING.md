# Contributing

Thanks for wanting to help. Cockpit is a Claude Code mod: a single hooks module (`hooks/register.tsx`) that draws the side panel, restyles the chat and adds a few tools. This page says how to work on it; the reasons behind the main choices are in [docs/adr](docs/adr/README.md).

## Set up

1. Clone the repository somewhere short (Windows paths over 260 characters break some tools):

   ```
   git clone https://github.com/xlollx/claude-code-cockpit.git ~/repos/claude-code-cockpit
   ```

2. Load the folder in every session: in your user `settings.json` add it to `CLAUDE_CODE_PLUGIN_DIRS` (paths separated by `;` on Windows, `:` elsewhere):

   ```json
   { "env": { "CLAUDE_CODE_PLUGIN_DIRS": "C:/Users/<you>/repos/claude-code-cockpit" } }
   ```

   Or start a single session with `claude --plugin-dir <folder>`. `claude plugin list` should show `cockpit@inline` as loaded.
3. Start Claude Code once: it writes the API types into `.claude-plugin/types/` (ignored by git), which `tsconfig.json` uses.

Changes reload by themselves at the end of each turn, in every session that loads the folder. A reload stops whatever the old copy was doing (timers, loops), so long work must survive it: see [ADR-0006](docs/adr/0006-delegation-detached-processes.md).

## Before every commit

```
claude plugin validate .
npx -y -p typescript tsc -p . --noEmit
```

Both must pass (`validate` may warn about the missing icon and author; nothing else). Then try the change in a real session: the panel, the chat, and a narrow terminal (the two-line band).

## Code rules

- **Plug-and-play.** Everything must work, or stay hidden, on a machine without the optional pieces (Azure CLI, kubectl, OpenCode, a reminders file). Never assume a path, a tenant or a tool of the author's workstation.
- **English interface**: panel, toasts, buttons, commands, README. No keyboard shortcuts for panel buttons.
- **Commands by absolute path.** Run programs through `run()` / `bin()`, which resolve them in `PATH` only, never in the current folder ([ADR-0002](docs/adr/0002-commands-by-absolute-path.md)). Validate any name that ends up in a URL or a command line.
- **Read by default.** The panel reads files and read-only APIs. Anything that changes something must come from a person's press, or be a documented tool Claude calls ([ADR-0008](docs/adr/0008-read-only-by-default.md)).
- **Hooks are budgeted.** An `onPress` has 10 seconds: start long work with `void` and return. A `tool.run` hook must be registered with a `{ tool }` filter, or it takes background and live output away from every tool. Waiting inside a hook goes through a child process, not `$.clock.sleep`, which spends the hook's own budget.
- **Rendering.** Every `Button` inside a `.map()` needs a `key`, or the panel goes blank. Never name a variable `h` where JSX is in scope: JSX compiles to `h(...)`.
- **Talking to the model.** Use `$.session.append`. `prompt.context` and the `classic.*` events can be skipped by another plugin's hook ([ADR-0005](docs/adr/0005-model-notes-through-session-append.md)).
- **State.** Per-session values in atoms (`$.state`), choices that must survive sessions in `$.store`. `/clear` resets the atoms and fires no `session.start`: restore them in `restoreSaved`.
- Comments say why, not what. Keep functions next to the feature they serve.

## Commits and pull requests

- [Conventional Commits](https://www.conventionalcommits.org/), in English: `feat: ...`, `fix: ...`, `docs: ...`, `style: ...`. The subject says what changes for the person using the mod.
- No AI signatures or co-author lines in commits, pull requests or docs.
- Bump `version` in `.claude-plugin/plugin.json` for any change people will see.
- Pull requests from forks are welcome: one topic per pull request, with what you tested and on which terminal and OS.

## Docs to keep in step

- `README.md`: every feature a person can see, and every program the mod runs ("What the mod runs and sends").
- `ROADMAP.md`: tick what is done, add what is planned.
- `docs/adr/`: a new ADR when a change rests on a non-obvious choice or a limit of the API. Copy [the template](docs/adr/template.md) and add it to the index.
- `docs/guides/`: a guide for anything people install or configure next to the mod.

## Reporting a problem

Open an issue with the Claude Code version (`claude --version`), the OS and terminal, what you pressed, and what you saw. For the Handover and Delegation features, add the matching lines of `%TEMP%\claude-cockpit\handover.log` (Windows).

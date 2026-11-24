# ADR-0002: Commands run by absolute path, names validated

- Status: accepted
- Date: 2026-11-19

## Context

The mod runs `git`, `az`, PowerShell, `wt` and, for delegation, `opencode` and `agy`, in whatever folder Claude Code was opened in. On Windows a bare command name is looked up in the current folder before `PATH`, so a cloned repository could ship its own `git.exe` or `az.cmd` and have the mod run it. Names read from commands and URLs (Azure DevOps organisations and projects) end up in URLs and command lines.

## Decision

- `bin()` resolves a command in `PATH` only, skipping relative entries, and `run()` always starts the absolute path. A `.cmd`/`.bat` runs through `cmd.exe` from its own folder. For agents installed through npm, the `.cmd` shim is read to find the real `.exe`, so the agent runs in the session's folder with untouched arguments.
- Temporary files go in a private folder under the user's temp directory.
- Azure DevOps organisation and project names are checked against strict patterns before use. Skill names typed in the panel are checked too.

## Consequences

- A command missing from `PATH` fails clearly instead of running something unexpected.
- New code that starts a program must go through `run()`/`bin()` (or `agentExe()` for agents), never a bare `$.process.run(['name', ...])` on Windows.

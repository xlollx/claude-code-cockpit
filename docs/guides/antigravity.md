# Antigravity CLI: install, models, use with cockpit

The Antigravity CLI (`agy`) is Google's terminal coding agent. With it in `PATH`, cockpit can:

- hand a long session over to it (`Handover` → `→ Antigravity`);
- let Claude delegate tasks to it (the **Delegation** section).

Checked with agy 1.5.12 on Windows 11. Install commands are from the [official getting-started page](https://antigravity.google/docs/getting-started).

## Install

- **Windows (PowerShell)**: `irm https://antigravity.google/cli/install.ps1 | iex`. It installs to `%LOCALAPPDATA%\agy\bin`, inside your user profile; on our machine it needed no admin rights.
- **macOS / Linux**: `curl -fsSL https://antigravity.google/cli/install.sh | bash` (to `~/.local/bin/agy`).

Check with `agy --version`. `agy install` sets up `PATH` and shell settings again if needed. Restart open terminals and Claude Code sessions afterwards.

## Sign in

Run `agy` once, interactively. It opens the browser to sign in with a Google account, and stores the token in the system keyring. Headless runs, which delegation uses, rely on that cached sign-in: without it they stop with `authentication required`.

Google Workspace accounts do not include Antigravity plans; personal accounts on the Free, Plus, Pro or Ultra plans do. API-key and Google Cloud options are in the [authentication docs](https://antigravity.google/docs/install).

## Models

`agy models` lists the models your account can use. The list depends on the plan: some models are Pro and Ultra only, and the docs mark a few for removal. Pick one with:

- `agy --model <id>` for a session;
- `/model` in the interface;
- the `model` parameter of cockpit's delegate tool. A name such as "gemini flash" is matched against `agy models`.

## Use it from cockpit

- **Handover**: `Handover` → `→ Antigravity`. A new Windows Terminal tab starts `agy -i "<read the note and continue>"`, with the notes folder added to its workspace (`--add-dir`).
- **Delegation**: see [delegation.md](delegation.md). Two things work differently from OpenCode:
  - in headless plan mode agy denies shell commands, so cockpit asks it to use its file tools only;
  - agy does not read the prompt from stdin, so cockpit writes the task to a file that agy reads.

  Answers usually take longer than OpenCode's: about 90 seconds against 30 for the same task in our tests.

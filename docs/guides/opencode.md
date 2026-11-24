# OpenCode: install, free models, use with cockpit

[OpenCode](https://opencode.ai) is an open-source coding agent for the terminal. With it in `PATH`, cockpit can:

- hand a long session over to it (`Handover` → `→ OpenCode`);
- let Claude delegate tasks to it (the **Delegation** section).

Checked with OpenCode 2.4.1 on Windows 11.

## Install

No admin rights needed.

- **Windows**: `npm install -g @opencode/cli` (Node.js required). The npm package installs the native `opencode.exe` for your platform. Windows package managers are not supported by OpenCode. A standalone zip is listed on the [download page](https://opencode.ai/docs).
- **macOS / Linux**: `curl -fsSL https://opencode.ai/v2/install | bash`, or `brew install anomalyco/tap/opencode-v2`.

Check with `opencode --version`. Restart open terminals (and Claude Code sessions) so they see the new `PATH`. Cockpit looks for `opencode` when a session starts.

## Models

A model is written as `provider/model`. List the ones your setup sees with `opencode models` (several hundred once providers are connected), and filter with your shell, e.g. `opencode models | findstr deepseek` (Windows) or `opencode models | grep deepseek`.

Choose one:

- for one run: `opencode run -m provider/model "..."`;
- as default: `"model": "provider/model"` in `~/.config/opencode/opencode.json`;
- in the interface: `/models`.

### Free models

- **OpenCode's own free models** (provider `opencode`, ids ending in `-free`, e.g. `opencode/deepseek-v4.1-flash-free`). In our test they answered without connecting any account. OpenCode says they are offered for a limited time; the current list is on the [OpenCode console page](https://opencode.ai/docs/zen). `OPENCODE_DISABLE_FREE_MODELS=1` hides them.
- **NVIDIA** (provider `nvidia`). Create a free API key on [build.nvidia.com](https://build.nvidia.com), then `opencode auth login nvidia` (or `/connect` in the interface) and paste it. Models such as `nvidia/moonshotai/kimi-k3` worked in our tests; some are slow on the free tier.
- **OpenRouter** (provider `openrouter`). Some models are free. Connect with `opencode auth login openrouter` or set `OPENROUTER_API_KEY`.

`opencode auth list` shows what is connected, `opencode auth logout` removes it. Groq's free tier was too small for an agent: requests were rejected as too large.

Try a model before relying on it, one call at a time (OpenCode's local database is shared, and parallel runs can report `database is locked`):

```
opencode run -m opencode/deepseek-v4.1-flash-free "Reply with OK"
```

## Use it from cockpit

- **Handover**: `Handover` → `→ OpenCode`. Claude writes a hand-off note without Claude-only references, and a new Windows Terminal tab starts `opencode --prompt "<read the note and continue>"` in the same folder.
- **Delegation**: see [delegation.md](delegation.md). Turn the `OpenCode` toggle on to let Claude send it easy read-only work on its own, or ask, e.g. "delegate this to OpenCode with deepseek v4.1".

## Keep OpenCode's context small

Every MCP server enabled in OpenCode adds tool definitions to each request. If its context fills up fast, turn heavy servers off globally with `"tools": { "<server>_*": false }` in `opencode.json`, and back on only for the agents that need them.

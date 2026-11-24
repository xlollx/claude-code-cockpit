# Windows Terminal: the recommended look

Cockpit's colours are made for a dark terminal with real bold text. On Windows Terminal it can set this up for you.

## One click

The first session on Windows Terminal shows `◆ Terminal look` in Quick actions (or run `/cockpit-setup`). It:

- adds the **Ember Dark** colour scheme, with an Obsidian-like `#1E1E1E` background;
- turns on real bold text (`"intenseTextStyle": "all"`);
- adds some padding;
- backs up `settings.json` first, as `settings.json.cockpit-<date-time>.bak`.

To undo, copy the backup over `settings.json`. Restart the terminal tab to see it. In Claude Code, `/theme` → "Dark mode (ANSI colors only)" makes Claude Code use the terminal palette.

## By hand

Paste [`extras/windows-terminal-ember-dark.json`](../../extras/windows-terminal-ember-dark.json) into `schemes` in Windows Terminal's `settings.json`, then pick "Ember Dark" in your profile. In the profile, set `"intenseTextStyle": "all"` (appearance, "Text intensity formatting": bold and bright), so that bold text is really bold and not just brighter.

## Light terminals

Set the mod option `palette` to `light`, in `/config` (cockpit's rows) or in `settings.json` under `pluginConfigs.cockpit.options`.

## Updating cockpit from PowerShell

[`extras/cockpit-update.ps1`](../../extras/cockpit-update.ps1) defines `cockpit-update`, which pulls the clone or updates the marketplace install. Dot-source it from your PowerShell profile:

```powershell
if (Test-Path "$HOME\repos\claude-code-cockpit\extras\cockpit-update.ps1") { . "$HOME\repos\claude-code-cockpit\extras\cockpit-update.ps1" }
```

Inside Claude Code, `/cockpit-update` does the same.

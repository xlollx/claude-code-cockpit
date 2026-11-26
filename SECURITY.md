# Security

Cockpit runs inside Claude Code on your machine. It reads local files (Azure CLI profile, kubeconfig, git), runs a few programs by absolute path, and sends GET requests only to `api.github.com` and `dev.azure.com`. The full list is in the README, under "What the mod runs and sends".

## Reporting a vulnerability

Please do not open a public issue. Use **[Report a vulnerability](https://github.com/xlollx/claude-code-cockpit/security/advisories/new)** (GitHub private vulnerability reporting) with what you found, how to reproduce it, and the Cockpit and Claude Code versions.

You will get an answer within a week. Fixes go out as a new version; `/cockpit-update` installs it.

## Supported versions

Only the latest version on `main` gets fixes.

# ADR-0008: Read by default; changes only from a press or a documented tool

- Status: accepted
- Date: 2026-11-18

## Context

The panel runs in every session, in every folder, often next to production subscriptions and clusters. A side panel that changes things by itself is a risk nobody asked for.

## Decision

- **Where you are** reads files only: `AZURE_CONFIG_DIR` (default `~/.azure`), `KUBECONFIG` (default `~/.kube/config`) and git. It runs no CLI.
- **Pipelines** and **Pull request** call read-only APIs, with credentials that `az` and Git Credential Manager already hold.
- **Write commands** only shows the commands Claude ran that change something; it does not block them.
- Something changes only after a press on the panel or in the chat. Examples: marking a reminder done or adding one, opening a tab, copying to the clipboard, installing a skill after "Install". The other case is a tool that Claude calls and that is described to it: delegation.
- Installing a missing skill is never done silently. The panel asks first, then Claude shows the source before installing.

## Consequences

- The panel can stay open on production contexts. A production subscription, cluster or branch is highlighted (`prodPattern`), never acted on.
- Any new feature that writes must say so in the README section "What the mod runs and sends".

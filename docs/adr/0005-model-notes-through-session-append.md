# ADR-0005: Notes to the model go through `$.session.append`

- Status: accepted
- Date: 2026-11-24

## Context

The delegation feature has to tell Claude which agents are installed and which ones it may use on its own, both at the start of every conversation and whenever a toggle changes. The obvious route is a `prompt.context` block. It is skipped on machines with a security plugin hooked on the same event, exactly like `classic.UserPromptSubmit` and `skill.prompt`. Nothing tells the mod; it only finds out from a task notification in the session.

## Decision

The mod tells Claude through `$.session.append` with a `user` row tagged `[cockpit delegate]`:

- after `session.start`;
- after `/clear` (from `session.end` with reason `clear`);
- whenever a toggle changes.

The row reaches the model with its next request and is never shown as the person's words.

## Consequences

- The note survives other plugins' hooks, because `session.append` is a call made by the mod, not an event it waits for.
- It costs a few hundred tokens at each start and each change, not at every request.
- After a compaction the note may be summarised away. It comes back at the next start, `/clear` or toggle change.

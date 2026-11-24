# ADR-0004: Handover: a note outside the repo, then /clear or a new tab

- Status: accepted
- Date: 2026-11-24

## Context

Long sessions get slow and expensive, and `/compact` keeps a summary that the person cannot read or edit. The person wants to continue the work with a clean context, here or in another terminal tab, possibly with another agent.

Limits found while building it (Claude Code 2.1.331):

- `prompt.submit` does not see prompts that the mod itself submits;
- `/clear` resets the mod's session state and fires `session.end` with reason `clear`, but no `session.start`;
- a `sessionTitle` returned from `classic.UserPromptSubmit` never arrives, because another plugin's hook takes the event first.

## Decision

1. The button submits a prompt tagged `[cockpit handover]`. Claude writes a self-contained note to `<config dir>/handovers/<date-time>-<folder>.md`, never inside the repository. The note's first line is a `# ` title of 3 to 6 words.
2. The writing turn is recognised from `turn.start` (the tag in its text). The job is kept in `$.store`, so a reload in the middle of the turn does not lose it. When the turn completes and the note exists, the mod continues.
3. Then one of three things happens:
   - **This session**: the mod runs `/clear`, restores the panel choices from `$.store`, runs `/rename <title>` and submits "read the note and continue, then wait for my go".
   - **New session**: a new Windows Terminal tab in the same folder runs `claude --name <title> "<resume prompt>"`.
   - **Another agent**: the same new tab runs OpenCode (`opencode --prompt`) or Antigravity (`agy -i`, with the notes folder added). In this case the note is written without Claude-only references.
4. Every step is logged to `%TEMP%\claude-cockpit\handover.log`.

## Consequences

- The note is a plain file that the person can read, edit or reuse.
- Outside Windows Terminal, the command is copied for the person to paste.
- Pressing the button costs one turn, the one that writes the note.

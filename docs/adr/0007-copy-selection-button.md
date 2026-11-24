# ADR-0007: Copy selection from a button, not from a selection watcher

- Status: accepted
- Date: 2026-11-24

## Context

People select text in the chat with the mouse and want it pasted formatted into a chat or a mail. `$.ui.selection()` returns the text as drawn, without bold or links, plus the transcript row when the selection lies in one message. It works only in the fullscreen view. There is no event when a selection changes.

## Decision

- A `⧉ Copy selection` button in Quick actions reads the selection when pressed.
- The mod keeps the Markdown of every drawn message, by row id. It finds the selection again in that Markdown by comparing letters and digits only, so bullets, wrapping and table borders do not matter.
- It rebuilds the Markdown of exactly that span: inline styles are reopened when the span starts inside them, and line prefixes (lists, headings) are kept. The result is copied as described in [ADR-0003](0003-rich-clipboard.md).
- A selection across several messages is copied as drawn, with bullets turned back into a list.
- A button under the selected text was considered: it would need the mod to poll the selection every second and redraw rows. It was dropped as not worth it.

## Consequences

- One extra click, no background polling.
- The Markdown kept is limited to the last 400 rows.

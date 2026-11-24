# ADR-0003: Copy buttons put HTML and plain text on the clipboard

- Status: accepted
- Date: 2026-11-23

## Context

Text that Claude prepares for a ticket, a mail or a chat is Markdown. Pasted as is, Teams and Outlook show the `**` and `-` markers. `$.ui.copy` puts plain text only on the clipboard.

## Decision

`Copy text`, `Copy table` and `Copy selection` build HTML from the Markdown (`mdHtml`) and a plain version without markers (`mdPlain`, links written as `text (url)`):

- Windows: both in one clipboard entry, through a PowerShell script in STA mode with the HTML clipboard format;
- macOS: both in one clipboard entry, through AppleScript with the `«class HTML»` type next to the string;
- Linux: the HTML only, through `wl-copy` or `xclip` with `text/html` (one type per call).

Tables also get a tab-separated version for Excel.

## Consequences

- Rich editors paste formatted text. On Windows and macOS, plain editors get clean text; on Linux, plain-text targets may get nothing until a plain type is added.
- macOS and Linux paths are written but less tested than Windows.
- Each copy starts a short process. That is acceptable for a button and too slow for anything automatic.

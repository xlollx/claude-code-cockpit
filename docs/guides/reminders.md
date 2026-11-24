# Reminders: a file, the panel, and a nudge at session start

Cockpit shows reminders due within 7 days, read from a JSON file. You add, complete and snooze them from the panel. An optional hook also tells Claude about overdue ones when a session starts.

## The file

`~/.claude/reminders.json`, or the file named by the `COCKPIT_REMINDERS_FILE` environment variable. It holds a list; `due` is local time:

```json
[
  {
    "id": "renew-cert",
    "due": "2026-12-01T09:00",
    "title": "Renew the TLS certificate",
    "action": "Check the expiry on the gateway, then renew in the key vault",
    "done": false
  }
]
```

| Field | Meaning |
|---|---|
| `id` | Any unique text. The panel creates `cockpit-<date>-<n>`. |
| `due` | `YYYY-MM-DDTHH:MM`, local time. |
| `title` | What the panel shows; a click shows it whole. |
| `action` | Optional: what to do, for Claude. |
| `done` | `true` hides it. |

## From the panel

- `+ add` opens a box. Write one of:
  - `24/12 09:00 title`;
  - `2026-12-24 09:00 title`;
  - `09:00 title`, meaning today, or tomorrow if that time has passed;
  - `+30m title`, `+2h title` or `+1d title`.
- `✓ done` sets `done: true`.
- `+1 day` moves it one day later.
- Overdue reminders are red.

You can also ask Claude: "remind me on Friday at 10 to check the backup report". It adds a line to the same file.

## Nudge at session start (optional)

The panel shows reminders but does not interrupt you. To have Claude mention overdue ones when a session starts, use the hook in [`extras/reminders-hook.py`](../../extras/reminders-hook.py) (Python 3). Add it to your user `settings.json`:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup|resume|clear",
        "hooks": [
          { "type": "command", "command": "python -X utf8 C:/Users/<you>/repos/claude-code-cockpit/extras/reminders-hook.py", "timeout": 10 }
        ]
      }
    ]
  }
}
```

On macOS and Linux use `python3` and your own path. The hook prints nothing when no reminder is due, and it never fails a session start: a missing or malformed file is ignored. It honours `COCKPIT_REMINDERS_FILE` too.

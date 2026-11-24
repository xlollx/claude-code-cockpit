"""SessionStart hook for Claude Code: overdue reminders, from the file cockpit's panel uses.

Reads ~/.claude/reminders.json (or $COCKPIT_REMINDERS_FILE): a list of objects with id,
due ("YYYY-MM-DDTHH:MM", local time), title, optional action, done. Prints the overdue ones
(due <= now, done false) as hook JSON: a systemMessage for the person and additionalContext
for the model. Prints nothing when none is due; never fails (a missing or bad file is ignored).
See docs/guides/reminders.md.
"""
import json
import os
from datetime import datetime

PATH = os.environ.get("COCKPIT_REMINDERS_FILE") or os.path.join(os.path.expanduser("~"), ".claude", "reminders.json")


def main():
    try:
        with open(PATH, encoding="utf-8") as f:
            items = json.load(f)
    except Exception:
        return
    now = datetime.now()
    due = []
    for it in items if isinstance(items, list) else []:
        try:
            if not it.get("done") and datetime.fromisoformat(it["due"]) <= now:
                due.append(it)
        except Exception:
            continue
    if not due:
        return
    lines = [
        f"OVERDUE REMINDER [{it.get('id', '?')}] (since {it['due']}): {it.get('title', '')}"
        + (f". To do: {it['action']}" if it.get("action") else "")
        for it in due
    ]
    msg = "\n".join(lines)
    ctx = (
        msg
        + "\nMention these to the person at the start of your first answer in this session, even if they talk about"
        + f' something else. When one is done (or they ask), set "done": true for its id in {PATH}.'
    )
    print(json.dumps({
        "systemMessage": msg,
        "hookSpecificOutput": {"hookEventName": "SessionStart", "additionalContext": ctx},
    }))


if __name__ == "__main__":
    try:
        main()
    except Exception:
        pass

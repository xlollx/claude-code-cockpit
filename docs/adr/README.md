# Architecture decision records

Why cockpit is built the way it is. Each record is short: the context, the decision, the consequences. A new one starts from [template.md](template.md).

| ADR | Decision | Status |
|---|---|---|
| [0001](0001-single-hooks-module-mod.md) | One hooks module, loaded from a clone or a marketplace | accepted |
| [0002](0002-commands-by-absolute-path.md) | Commands run by absolute path, names validated | accepted |
| [0003](0003-rich-clipboard.md) | Copy buttons put HTML and plain text on the clipboard | accepted |
| [0004](0004-handover-note-and-resume.md) | Handover: a note outside the repo, then /clear or a new tab | accepted |
| [0005](0005-model-notes-through-session-append.md) | Notes to the model go through `$.session.append` | accepted |
| [0006](0006-delegation-detached-processes.md) | Delegation: detached agents, results on files, write mode in a worktree | accepted |
| [0007](0007-copy-selection-button.md) | Copy selection from a button, not from a selection watcher | accepted |
| [0008](0008-read-only-by-default.md) | Read by default; changes only from a press or a documented tool | accepted |

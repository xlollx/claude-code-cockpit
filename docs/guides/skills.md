# Skills: suggested ones, how to add them, and Active modes

A skill is a folder with a `SKILL.md`: instructions Claude loads when a task matches, or when you run it as `/<name>`. Cockpit's **Active modes** section shows the skills that change how Claude answers, and lets you turn them on.

## Suggested

**Style modes.** Active modes tracks these: they stay on until you turn them off, and the panel shows them.

| Skill | What it does | Source |
|---|---|---|
| `i-have-adhd` | Answer first, short blocks, one next step | [ayghri/i-have-adhd](https://github.com/ayghri/i-have-adhd) |
| `caveman` | Terse answers, every technical fact kept (`ultracave`/`megacave` are stronger) | [JuliusBrussee/caveman](https://github.com/JuliusBrussee/caveman) |
| `ponytail` | Smallest change that solves the task; also `ponytail-review`, `-audit`, `-debt` | [dietrichgebert/ponytail](https://github.com/dietrichgebert/ponytail) |

When `caveman` and `i-have-adhd` are both on, decide which one wins on conflicts and write it in your `CLAUDE.md`.

**General skills from [anthropics/skills](https://github.com/anthropics/skills)**:

- `doc-coauthoring` for writing specs and proposals;
- `frontend-design` for UI work;
- `mcp-builder` for MCP servers;
- `internal-comms` for status updates;
- `webapp-testing` for Playwright checks;
- `skill-creator` for writing your own skills.

Third-party skills are code and instructions that run with your permissions. Read a skill's `SKILL.md` and any scripts before installing it, and note the commit you installed.

## Add a skill

**By hand** (works everywhere):

1. Copy the skill's folder to `~/.claude/skills/<name>/` (your user, all projects) or to `.claude/skills/<name>/` in a repository (that project only). The folder holds `SKILL.md` and its files.
2. Start a new session. `/<name>` should now autocomplete.

**From a marketplace**, if the repository publishes one:

```
claude plugin marketplace add <owner>/<repo>
claude plugin install <plugin>@<marketplace>
```

or the same through `/plugin` in Claude Code.

## From the panel

In **Active modes**, `+ add` lists the style modes that are off. A click turns one on, as typing `/<name>` would. `✕` next to an active mode puts its stop phrase in the prompt.

`other…` takes any skill name:

- **Installed**: it runs as `/<name>` and appears in the list.
- **Not installed**: the panel asks first. Only after you press `Install`, Claude:
  1. looks for it in a trustworthy source (anthropics/skills, a marketplace Claude Code knows, or a well-known public repository), and asks you if several fit;
  2. tells you the source and commit;
  3. installs it in `~/.claude/skills/<name>/` without running its scripts;
  4. turns it on, or tells you to run `/<name>` if the session has not picked it up yet. A new session always will.

  If Claude finds no trustworthy source, it stops.

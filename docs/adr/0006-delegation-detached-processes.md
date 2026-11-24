# ADR-0006: Delegation: detached agents, results on files, write mode in a worktree

- Status: accepted
- Date: 2026-11-24

## Context

Reading many files or logs fills Claude's context with material that a cheaper agent could summarise. OpenCode and Antigravity have headless modes. Building the feature showed three problems:

- a `$.process.spawn` loop left running after the hook ends does not see the child exit until the module unloads, and a hot reload kills it;
- `$.clock.sleep` inside a `tool.run` hook spends the hook's time budget, and the call then ends with "no hook answered this call";
- a `tool.run` hook registered without a `{ tool }` filter takes background and live output away from every tool.

## Decision

- The mod registers the tool `mcp__cockpit__delegate`. Its inputs are `to`, `task`, `title`, `cwd`, `wait`, `mode` and `model`. Its hook has a `{ tool }` filter.
- The agent starts **detached**. On Windows a hidden PowerShell runs `Start-Process` with stdin, stdout and stderr redirected to files, then writes the PID and the exit code. Elsewhere this is done with `nohup sh`. The files are in `<config dir>/delegations/work/`.
- A poller built on `$.clock.after` reads the exit files. The jobs live in the session state, which survives reloads, and any hook of a new copy restarts the poller. When a job ends, the poller writes `<config dir>/delegations/<stamp>-<agent>.md`, cleans the work files, and wakes Claude with a short prompt.
- With `wait: true` the hook waits on the exit file through a child process, which does not spend its budget.
- **Read mode** is the default: OpenCode's `plan` agent and `agy --mode plan`, with a preamble that forbids changes. **Write mode** is used only when the person asks:
  - OpenCode's `build` agent and `agy --mode accept-edits`;
  - in a detached `git worktree` at `HEAD`, or in a new, empty folder outside git;
  - permission requests stay denied headless.

  The result file lists the changes and the steps to review and apply them.
- `model` is matched against the agent's own model list. An ambiguous name returns the candidates.
- Panel toggles say which agents Claude may use **on its own**, for easy read-only work only. A request from the person works whatever the toggles say.

## Consequences

- A delegated task survives reloads and turns, and can be cancelled from the panel (the process is stopped by its PID).
- The answers come from a lower tier and Claude must verify them. Write mode never touches the working tree: Claude reviews the whole diff before applying it.
- The agents send what they read to their own model providers. Claude is told never to pass them secrets, tokens or personal data.
- It saves context when there is a lot to read and little to answer. When Claude has to explain everything in the task, delegating saves little or nothing.

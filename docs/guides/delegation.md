# Delegation: let Claude hand work to OpenCode or Antigravity

Claude's context is precious. Reading fifty files or a long log to answer a short question fills it with material it never needs again. With [OpenCode](opencode.md) or [Antigravity](antigravity.md) installed, Claude can give that work to another agent and read only the answer. Design notes: [ADR-0006](../adr/0006-delegation-detached-processes.md).

## Turn it on

The **Delegation** section appears in the panel when `opencode` or `agy` is in `PATH`. It has one toggle per agent:

- **on**: Claude may delegate **easy, bulky, read-only** work to that agent on its own, such as searching or reading many files, logs or docs, or a summary;
- **off**: Claude delegates to that agent only when you ask.

Toggles are kept across sessions. Claude is told the current choice when a session starts, after `/clear`, and whenever you change one.

## Ask for it

Say it in your own words. Examples:

- "delegate to OpenCode: find every place we call the payments API and list file:line";
- "ask Antigravity for a second opinion on this plan";
- "delegate this to OpenCode with deepseek v4.1". The name is matched against the agent's model list. If it fits several models, Claude shows the candidates and picks one or asks you.
- "have OpenCode write the boilerplate for the five new modules". This is **write mode**, see below.

## What happens

1. Claude calls the tool `mcp__cockpit__delegate` with a self-contained task. The other agent knows nothing of your conversation.
2. The agent starts in the background, detached from Claude Code. The panel lists it with `◌`; `✕` stops it.
3. Its answer is written to `~/.claude/delegations/<date-time>-<agent>.md`. Claude gets a short message and reads it. Click the task in the panel to copy the path.
4. Claude checks what matters before using it: the answers come from a cheaper model.

With `wait: true` Claude waits for the answer in the same call, up to 10 minutes, instead.

## Write mode

Only when you ask. The agent may then edit files, but never your working tree:

- inside a git repository it works in a separate **git worktree** at `HEAD`, so your uncommitted changes are not in it;
- outside git it works only in a new, empty folder.

The result file lists the changed files. Claude then:

1. reads the whole diff (`git -C <worktree> diff --cached`);
2. fixes or drops what is wrong, and applies only what passes (`git apply --3way`);
3. runs your project's checks;
4. removes the worktree.

Commits, pushes and deployments are never delegated.

## Data

The other agents send what they read to their own model providers (Google, NVIDIA, OpenRouter, OpenCode). Claude is told never to pass them secrets, tokens, or personal or customer data. The context needed for the task, such as file paths and resource names, does go to them.

## When it is worth it

- **Worth it**: reading a lot to answer a little (a large repository, logs, documentation), or generating a lot from a short spec in write mode.
- **Not worth it**: when a single `grep` is enough, or when Claude would have to write into the task everything the answer needs.

## Files

- `~/.claude/delegations/*.md`: the answers (task, answer, duration, tokens). Delete old ones whenever you like.
- `~/.claude/delegations/work/`: the running jobs' files, cleaned when a job ends.
- `~/.claude/delegations/wt/`: write-mode worktrees, removed by Claude after review. `git worktree prune` in the repository cleans one that was left behind.

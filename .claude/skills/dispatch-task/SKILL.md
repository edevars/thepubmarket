---
name: dispatch-task
description: Pick the next To Do task from Backlog.md, implement it via the right subagent, run checks, validate acceptance criteria, then commit, merge to main, deploy, and mark Done. Runs exactly ONE task — designed to be invoked headless by scripts/dispatch-loop.sh, which launches a fresh session per task.
---

# dispatch-task — one Backlog task, end to end

You run ONE full task cycle and then stop. The outer loop (`scripts/dispatch-loop.sh`)
launches a fresh session for the next task, so never pick a second task after
finishing the first — a clean context window per task is the whole point.

## Contract with the driver

Your FINAL message must end with exactly one of these lines (the driver greps for it):

- `DISPATCH_RESULT: DONE <task-id>`
- `DISPATCH_RESULT: BLOCKED <task-id> — <short reason>`
- `DISPATCH_RESULT: NO_TASKS`

If this line is missing the loop aborts, so always emit it — including on failure paths.

## 1. Select the task

- Use the Backlog MCP tools; if the MCP server is unavailable, fall back to the
  `backlog` CLI (`backlog task list --plain`, `backlog task view <id> --plain`,
  `backlog task edit <id> ...`).
- If a task is already **In Progress** and NOT labeled `blocked`, resume it — a
  previous session was interrupted mid-task. Read its notes and the current git
  state (branch `task/<id>`, uncommitted changes) before continuing.
- Otherwise pick the highest-priority **To Do** task whose dependencies are all
  Done, skipping anything labeled `blocked`. Respect the active milestone order.
- Nothing eligible → output `DISPATCH_RESULT: NO_TASKS` and stop.
- Set the chosen task to In Progress before touching code.

## 2. Implement

Read the task's description, acceptance criteria, and implementation plan in full.
Dispatch the work to the matching subagent, passing the acceptance criteria
verbatim in its prompt:

- `nextjs-frontend` — apps/web UI. Pass along the top-tier visual quality bar:
  use the `frontend-design` skill while building and audit with
  `web-design-guidelines` before finishing.
- `cloudflare-worker-dev` — apps/api, D1/KV/R2/Durable Objects/Workflows.
- `stripe-connect-specialist` — anything touching checkout, payments, or Connect.
- `d1-schema-guardian` — schema or migration changes.

Trivial tasks (docs, config one-liners) may be done inline without a subagent.

## 3. Verify — delegate, do not read

Run the `task-verifier` subagent, passing the task id, the acceptance criteria
verbatim, and the branch name. It runs typecheck/lint/tests, reviews the diff
against each criterion, and audits UI work against the design guidelines.

**Keep your own context thin — this is the point of the split.** Do NOT run the
checks yourself, do not read the diff, do not read check output. Read only the
verifier's verdict. You are a coordinator, not a reviewer: every token you spend
reading raw output is a task the usage window can no longer afford.

## 4. Iterate on FAIL

- On `VERDICT: PASS`, go to step 5.
- On `VERDICT: FAIL`, send the verifier's `TO FIX` list back to the same
  implementation subagent, then re-run `task-verifier`. **Max 3 fix attempts.**
- Still failing after 3: add the `blocked` label, keep the task In Progress,
  record what failed and what was tried in the task notes, leave the branch
  unmerged, and output `DISPATCH_RESULT: BLOCKED ...`. Do not burn the usage
  window retrying.
- If the verifier reports anything under `OUT OF SCOPE`, do not commit those
  files — stage only the paths belonging to this task.

## 5. Ship

- If the change touches money flow (payments, payouts, fees, checkout, seller
  balances): run the `compliance-auditor` subagent first. Any finding → BLOCKED.
- Work on branch `task/<task-id>`; commit with a conventional message that
  references the task id.
- Merge to `main` and push.
- Deploy only the affected apps: `pnpm turbo run deploy --filter=<package>`
  (use plain `pnpm deploy` only if shared code changed).
- Mark the task Done following the Backlog finalization flow, with brief
  implementation notes.
- Output `DISPATCH_RESULT: DONE <task-id>`.

## Hard rules

- Non-custodial invariant: if anything you build would make the platform touch,
  hold, or redirect funds even momentarily, stop and mark BLOCKED — never ship it.
- Never force-push, never merge with failing checks, never deploy a BLOCKED task.
- Keep Backlog.md status truthful at every step — it is the state the next
  session resumes from.

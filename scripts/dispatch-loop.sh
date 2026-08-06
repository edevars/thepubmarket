#!/usr/bin/env bash
# Dispatch loop — one fresh Claude Code session per Backlog task.
#
#   scripts/dispatch-loop.sh [max_iterations]        (default 15)
#   MODEL=sonnet scripts/dispatch-loop.sh 5          (cheaper orchestration)
#   USAGE_LIMIT=85 scripts/dispatch-loop.sh          (stop with more margin)
#
# Each iteration: check plan usage, then run `claude -p "/dispatch-task"` in a
# brand-new session (clean context window). State lives in Backlog.md + git.
# Stops when: backlog is empty, usage >= USAGE_LIMIT%, a session dies without
# reporting a result, or max_iterations is reached. On every stop it writes
# CHECKPOINT.md so the next run (or the next usage window) can pick up.
#
# MODEL sets the ORCHESTRATOR only. Implementation subagents pin their own model
# in .claude/agents/*.md (mostly sonnet), so lowering MODEL does not make the
# implementation cheaper — it only lowers the judgment behind merge and deploy.
#
# Output streams live (stream-json rendered via jq). The raw JSONL stays in
# logs/dispatch/*.jsonl. To watch a run started elsewhere: scripts/dispatch-watch.sh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

MAX_ITERATIONS="${1:-15}"
USAGE_LIMIT="${USAGE_LIMIT:-97}"
MODEL="${MODEL:-opus}"
LOG_DIR="$REPO_ROOT/logs/dispatch"
mkdir -p "$LOG_DIR"

command -v jq >/dev/null || {
  echo "!! jq is required (brew install jq)" >&2
  exit 1
}

# Human-readable aliases; anything else is passed through as a literal model id.
case "$MODEL" in
opus) MODEL_ID="claude-opus-5" ;;
sonnet) MODEL_ID="claude-sonnet-5" ;;
fable) MODEL_ID="claude-fable-5" ;;
haiku) MODEL_ID="claude-haiku-4-5-20251001" ;;
*) MODEL_ID="$MODEL" ;;
esac

SESSION_PCT=""
WEEK_PCT=""

read_usage() {
  local out
  out="$(claude -p /usage 2>/dev/null || true)"
  SESSION_PCT="$(awk -F'[:%]' '/Current session/ {gsub(/ /,"",$2); print $2; exit}' <<<"$out")"
  WEEK_PCT="$(awk -F'[:%]' '/Current week \(all models\)/ {gsub(/ /,"",$2); print $2; exit}' <<<"$out")"
}

write_checkpoint() {
  local reason="$1"
  {
    echo "# Dispatch checkpoint"
    echo
    echo "- Generated: $(date '+%Y-%m-%d %H:%M %Z')"
    echo "- Reason: ${reason}"
    echo "- Orchestrator model: ${MODEL} (${MODEL_ID})"
    echo "- Usage at stop: session ${SESSION_PCT:-?}% / week ${WEEK_PCT:-?}%"
    echo
    echo "## Git"
    echo '```'
    git log --oneline -10
    git status --short --branch
    echo '```'
    echo
    echo "## Backlog snapshot"
    echo '```'
    backlog task list --plain 2>/dev/null || echo "(backlog CLI unavailable)"
    echo '```'
    echo
    echo "## Resume"
    echo "Run \`scripts/dispatch-loop.sh\` again once the usage window resets."
    echo "An In Progress task without the \`blocked\` label means the last session"
    echo "was interrupted mid-task; /dispatch-task resumes it automatically."
  } >"$REPO_ROOT/CHECKPOINT.md"
  echo "==> Checkpoint written to CHECKPOINT.md (${reason})"
}

# Render stream-json events as readable progress lines.
RENDER_FILTER='
  if .type == "assistant" then
    ((.message.content // [])[] |
      if .type == "tool_use" then
        "· " + .name + "  " +
        ((.input.description // .input.command // .input.file_path // .input.prompt // "")
          | tostring | .[0:100] | gsub("\n"; " "))
      elif .type == "text" and (.text | length) > 0 then
        "\n" + .text + "\n"
      else empty end)
  elif .type == "result" then
    "\n==> " + ((.result // "") | tostring | .[0:2000])
  else empty end
'

echo "==> orchestrator model: ${MODEL} (${MODEL_ID}) · usage limit: ${USAGE_LIMIT}%"

for ((i = 1; i <= MAX_ITERATIONS; i++)); do
  read_usage
  if [[ -z "$SESSION_PCT" || -z "$WEEK_PCT" ]]; then
    echo "!! Could not parse 'claude -p /usage'; aborting to avoid ungated spend." >&2
    write_checkpoint "usage check failed"
    exit 1
  fi
  echo "==> [$i/$MAX_ITERATIONS] usage: session ${SESSION_PCT}% / week ${WEEK_PCT}% (limit ${USAGE_LIMIT}%)"
  if ((SESSION_PCT >= USAGE_LIMIT || WEEK_PCT >= USAGE_LIMIT)); then
    write_checkpoint "usage limit reached (>= ${USAGE_LIMIT}%)"
    exit 0
  fi

  STAMP="$(date '+%Y%m%d-%H%M%S')"
  LOG_FILE="$LOG_DIR/$STAMP.jsonl"
  echo "==> [$i/$MAX_ITERATIONS] dispatching next task — raw log: $LOG_FILE"

  claude -p "/dispatch-task" --model "$MODEL_ID" --dangerously-skip-permissions \
    --output-format stream-json --verbose 2>"$LOG_DIR/$STAMP.err" |
    tee "$LOG_FILE" |
    jq -r --unbuffered "$RENDER_FILTER" 2>/dev/null || true

  RESULT="$(jq -r 'select(.type=="result") | .result // empty' "$LOG_FILE" 2>/dev/null |
    grep -Eo 'DISPATCH_RESULT: [A-Z_]+[^"]*' | tail -1 || true)"
  # Fallback: the marker may land in an assistant message if the run was cut short.
  [[ -n "$RESULT" ]] || RESULT="$(grep -Eo 'DISPATCH_RESULT: [A-Z_]+[^"\\]*' "$LOG_FILE" | tail -1 || true)"

  echo "==> [$i/$MAX_ITERATIONS] ${RESULT:-<no result>}"
  case "$RESULT" in
  "DISPATCH_RESULT: NO_TASKS"*)
    write_checkpoint "backlog empty"
    exit 0
    ;;
  "DISPATCH_RESULT: DONE"*) ;;
  "DISPATCH_RESULT: BLOCKED"*) ;; # task got the `blocked` label; next iteration picks another
  *)
    echo "!! Session ended without DISPATCH_RESULT (killed or errored). See $LOG_DIR/$STAMP.err" >&2
    write_checkpoint "session ended without result"
    exit 1
    ;;
  esac
  sleep 5
done

write_checkpoint "max iterations reached (${MAX_ITERATIONS})"

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

# Colour is on only for an interactive terminal, so piping to a file or to
# `tee` keeps plain text. NO_COLOR=1 disables it. chalk-cli styles this script's
# own banner lines; the streaming render below uses raw ANSI instead, because
# chalk costs ~100ms per invocation and the render emits hundreds of lines.
if [[ -t 1 && -z "${NO_COLOR:-}" ]] && command -v chalk >/dev/null; then
  COLOR=1
else
  COLOR=0
fi

# c '{cyan.bold text}' → styled text, or the same text unstyled when colour is
# off. chalk strips styling when its stdout is not a tty, hence FORCE_COLOR.
c() {
  if ((COLOR)); then
    FORCE_COLOR=1 chalk -t "$1"
  else
    sed -E 's/\{[a-zA-Z.#]+ //g; s/\}//g' <<<"$1"
  fi
}

if ((COLOR)); then
  A_RESET=$'\033[0m' A_DIM=$'\033[2m' A_BOLD=$'\033[1m'
  A_CYAN=$'\033[36m' A_GREEN=$'\033[32m' A_YELLOW=$'\033[33m' A_MAGENTA=$'\033[35m'
  A_RED=$'\033[31m'
else
  A_RESET='' A_DIM='' A_BOLD='' A_CYAN='' A_GREEN='' A_YELLOW='' A_MAGENTA='' A_RED=''
fi

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
  c "{bold.magenta ==> Checkpoint written to CHECKPOINT.md} {dim (${reason})}"
}

# Render stream-json events as readable progress lines, tracking which
# subagents (and background bash tasks) are in flight. `foreach inputs` carries
# the open set across events, so it needs `jq -n`.
#   ▶ start / ■ done   open and close, with the running count and the types
#   [agent-type] ...   a tool call made by that subagent, not the orchestrator
RENDER_FILTER='
foreach inputs as $e (
  {active: {}, out: []};
  .out = []
  | if $e.type == "system" and $e.subtype == "task_started" then
      ($e.subagent_type // (($e.task_type // "agent") | sub("^local_"; ""))) as $kind
      | .active[$e.tool_use_id] = $kind
      | .out += [$green + $bold + "▶ start " + $kind + $reset + $dim + "  " + (($e.description // "") | tostring | .[0:60]) + $reset]
    elif $e.type == "user" and ($e.parent_tool_use_id == null) then
      reduce (($e.message.content // []) | if type == "array" then .[] | select(.type == "tool_result") | .tool_use_id else empty end) as $id (
        .;
        if (.active | has($id)) then
          .out += [$dim + "■ done  " + .active[$id] + $reset] | del(.active[$id])
        else . end
      )
    elif $e.type == "assistant" then
      (if $e.parent_tool_use_id == null then "" else (.active[$e.parent_tool_use_id] // "sub") end) as $who
      | .out += [
          ($e.message.content // [])[]
          | if .type == "tool_use" then
              (if $who == "" then $dim + "· " + $reset else "    " + $magenta + "[" + $who + "] " + $reset end)
              + $cyan + .name + $reset + "  "
              + $dim + ((.input.description // .input.command // .input.file_path // .input.prompt // "") | tostring | .[0:80] | gsub("\n"; " ")) + $reset
            elif .type == "text" and ((.text | length) > 0) then
              (if $who == "" then "\n" + .text + "\n" else empty end)
            else empty end
        ]
    elif $e.type == "result" then
      .out += ["\n" + $bold + "==> " + (($e.result // "") | tostring | .[0:2000]) + $reset]
    else . end
  | if ((.out | length) > 0)
       and (($e.type == "system" and $e.subtype == "task_started")
            or ($e.type == "user" and ($e.parent_tool_use_id == null))) then
      .out += [$yellow + "   activos: " + ((.active | length) | tostring)
               + (if (.active | length) > 0 then " → " + ([.active[]] | join(", ")) else "" end) + $reset]
    else . end;
  .out[]
)
'

c "{bold.cyan ==> orchestrator model:} {green ${MODEL}} {dim (${MODEL_ID})} {dim ·} {bold.cyan usage limit:} {green ${USAGE_LIMIT}%}"

for ((i = 1; i <= MAX_ITERATIONS; i++)); do
  read_usage
  if [[ -z "$SESSION_PCT" || -z "$WEEK_PCT" ]]; then
    c "{red.bold !! Could not parse 'claude -p /usage'; aborting to avoid ungated spend.}" >&2
    write_checkpoint "usage check failed"
    exit 1
  fi
  c "{bold.cyan ==> [$i/$MAX_ITERATIONS]} {bold usage:} session {yellow ${SESSION_PCT}%} / week {yellow ${WEEK_PCT}%} {dim (limit ${USAGE_LIMIT}%)}"
  if ((SESSION_PCT >= USAGE_LIMIT || WEEK_PCT >= USAGE_LIMIT)); then
    write_checkpoint "usage limit reached (>= ${USAGE_LIMIT}%)"
    exit 0
  fi

  STAMP="$(date '+%Y%m%d-%H%M%S')"
  LOG_FILE="$LOG_DIR/$STAMP.jsonl"
  c "{bold.cyan ==> [$i/$MAX_ITERATIONS]} {bold dispatching next task} {dim — raw log: $LOG_FILE}"

  claude -p "/dispatch-task" --model "$MODEL_ID" --dangerously-skip-permissions \
    --output-format stream-json --verbose 2>"$LOG_DIR/$STAMP.err" |
    tee "$LOG_FILE" |
    jq -n -r --unbuffered \
      --arg reset "$A_RESET" --arg dim "$A_DIM" --arg bold "$A_BOLD" \
      --arg cyan "$A_CYAN" --arg green "$A_GREEN" --arg yellow "$A_YELLOW" \
      --arg magenta "$A_MAGENTA" \
      "$RENDER_FILTER" 2>/dev/null || true

  RESULT="$(jq -r 'select(.type=="result") | .result // empty' "$LOG_FILE" 2>/dev/null |
    grep -Eo 'DISPATCH_RESULT: [A-Z_]+[^"]*' | tail -1 || true)"
  # Fallback: the marker may land in an assistant message if the run was cut short.
  [[ -n "$RESULT" ]] || RESULT="$(grep -Eo 'DISPATCH_RESULT: [A-Z_]+[^"\\]*' "$LOG_FILE" | tail -1 || true)"

  # RESULT is printed with raw ANSI, not a chalk template: a task id or reason
  # containing braces would be parsed as template markup and mangled.
  case "$RESULT" in
  "DISPATCH_RESULT: DONE"*) R_COLOR="$A_GREEN" ;;
  "DISPATCH_RESULT: BLOCKED"*) R_COLOR="$A_YELLOW" ;;
  "DISPATCH_RESULT: NO_TASKS"*) R_COLOR="$A_CYAN" ;;
  *) R_COLOR="$A_RED" ;;
  esac
  printf '%s %s%s%s\n' "$(c "{bold.cyan ==> [$i/$MAX_ITERATIONS]}")" \
    "$R_COLOR$A_BOLD" "${RESULT:-<no result>}" "$A_RESET"

  case "$RESULT" in
  "DISPATCH_RESULT: NO_TASKS"*)
    write_checkpoint "backlog empty"
    exit 0
    ;;
  "DISPATCH_RESULT: DONE"*) ;;
  "DISPATCH_RESULT: BLOCKED"*) ;; # task got the `blocked` label; next iteration picks another
  *)
    c "{red.bold !! Session ended without DISPATCH_RESULT (killed or errored).} {dim See $LOG_DIR/$STAMP.err}" >&2
    write_checkpoint "session ended without result"
    exit 1
    ;;
  esac
  sleep 5
done

write_checkpoint "max iterations reached (${MAX_ITERATIONS})"

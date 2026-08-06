#!/usr/bin/env bash
# Watch the currently running /dispatch-task session live.
#
#   scripts/dispatch-watch.sh
#
# `claude -p` buffers its output until the session ends, so a running dispatch
# looks frozen. This tails the session transcript instead and prints each tool
# call as it happens. Safe to run from a second terminal; read-only.
set -euo pipefail

PROJECT_DIR="$HOME/.claude/projects/-Users-codevars-thepubmarket"

# Same colour rules as dispatch-loop.sh: interactive terminal only, NO_COLOR
# opts out. chalk-cli styles the banner; the tail below uses raw ANSI because it
# renders continuously and a process spawn per line would throttle it.
if [[ -t 1 && -z "${NO_COLOR:-}" ]] && command -v chalk >/dev/null; then
  A_RESET=$'\033[0m' A_DIM=$'\033[2m' A_BOLD=$'\033[1m'
  A_CYAN=$'\033[36m' A_GREEN=$'\033[32m' A_MAGENTA=$'\033[35m'
  COLOR=1
else
  A_RESET='' A_DIM='' A_BOLD='' A_CYAN='' A_GREEN='' A_MAGENTA=''
  COLOR=0
fi

c() {
  if ((COLOR)); then
    FORCE_COLOR=1 chalk -t "$1"
  else
    sed -E 's/\{[a-zA-Z.#]+ //g; s/\}//g' <<<"$1"
  fi
}

# Pick the newest transcript whose FIRST user message is the /dispatch-task
# command — matching anywhere in the file would also hit sessions that merely
# mention the command name in conversation.
TRANSCRIPT=""
for f in $(ls -t "$PROJECT_DIR"/*.jsonl 2>/dev/null | head -20); do
  first="$(jq -rs '[.[] | select(.type=="user")][0]
    | (.message.content | if type=="string" then . else (map(select(.type=="text").text) | join(" ")) end) // ""' \
    "$f" 2>/dev/null || true)"
  case "$first" in
  *"command-name>/dispatch-task"*)
    TRANSCRIPT="$f"
    break
    ;;
  esac
done

if [[ -z "${TRANSCRIPT:-}" ]]; then
  c "{red.bold No /dispatch-task session transcript found in $PROJECT_DIR}" >&2
  exit 1
fi

c "{bold.cyan ==> watching} {green $(basename "$TRANSCRIPT")} {dim (ctrl-c to stop; does not affect the run)}"

# Session transcripts carry no task_started/task_result events, so unlike
# dispatch-loop.sh this can only show when a subagent is spawned, not when it
# finishes or how many are in flight. Run the loop itself for live agent counts.
tail -n +1 -f "$TRANSCRIPT" | jq -r --unbuffered \
  --arg reset "$A_RESET" --arg dim "$A_DIM" --arg bold "$A_BOLD" \
  --arg cyan "$A_CYAN" --arg green "$A_GREEN" --arg magenta "$A_MAGENTA" '
  if .type == "assistant" then
    ((.message.content // [])[] |
      if .type == "tool_use" and .name == "Agent" then
        $green + $bold + "▶ start " + (.input.subagent_type // "agent") + $reset + $dim + "  " +
        ((.input.description // "") | tostring | .[0:60] | gsub("\n"; " ")) + $reset
      elif .type == "tool_use" then
        $dim + "· " + $reset + $cyan + .name + $reset + "  " + $dim +
        ((.input.description // .input.command // .input.file_path // .input.prompt // "")
          | tostring | .[0:100] | gsub("\n"; " ")) + $reset
      elif .type == "text" and (.text | length) > 0 then
        "\n" + .text + "\n"
      else empty end)
  elif .type == "result" then
    "\n" + $bold + "==> RESULT: " + ((.result // "") | tostring) + $reset
  else empty end
' 2>/dev/null

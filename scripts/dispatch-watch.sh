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
  echo "No /dispatch-task session transcript found in $PROJECT_DIR" >&2
  exit 1
fi

echo "==> watching $(basename "$TRANSCRIPT") (ctrl-c to stop; does not affect the run)"

# Session transcripts carry no task_started/task_result events, so unlike
# dispatch-loop.sh this can only show when a subagent is spawned, not when it
# finishes or how many are in flight. Run the loop itself for live agent counts.
tail -n +1 -f "$TRANSCRIPT" | jq -r --unbuffered '
  if .type == "assistant" then
    ((.message.content // [])[] |
      if .type == "tool_use" and .name == "Agent" then
        "▶ start " + (.input.subagent_type // "agent") + "  " +
        ((.input.description // "") | tostring | .[0:60] | gsub("\n"; " "))
      elif .type == "tool_use" then
        "· " + .name + "  " +
        ((.input.description // .input.command // .input.file_path // .input.prompt // "")
          | tostring | .[0:100] | gsub("\n"; " "))
      elif .type == "text" and (.text | length) > 0 then
        "\n" + .text + "\n"
      else empty end)
  elif .type == "result" then
    "\n==> RESULT: " + ((.result // "") | tostring)
  else empty end
' 2>/dev/null

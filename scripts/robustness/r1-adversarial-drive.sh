#!/bin/bash
# Robustness R1 (T1): run each adversarial input in its own process, after the fix
# (the checked-out readability-convert.ts) and before it (the file at f494ad76^,
# the commit before #964). A case past LIMIT seconds is killed and recorded.
# Usage: bash scripts/robustness/r1-adversarial-drive.sh [case ...]  (prints JSON lines)
set -u
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
CASE="$ROOT/scripts/robustness/r1-adversarial-case.mts"
BEFORE="$ROOT/apps/api/src/capabilities/lib/__failbefore-readability.ts"
LIMIT=${LIMIT:-60}
CASES=${*:-nested-div-16KB nested-div-32KB nested-div-64KB nested-formatting-16KB nested-formatting-32KB nested-formatting-a-16KB nested-formatting-a-32KB attribute-flood-1MB flat-tags-16MB}
ERR=$(mktemp -d)
trap 'rm -f "$BEFORE"; rm -rf "$ERR"' EXIT
git -C "$ROOT" show f494ad76^:apps/api/src/capabilities/lib/readability-convert.ts > "$BEFORE"
cd "$ROOT/apps/api"
for mode in after before; do
  for c in $CASES; do
    s=$(date +%s%3N)
    o=$(timeout -s KILL "$LIMIT" npx tsx "$CASE" "$mode" "$c" 2>"$ERR/$mode-$c.err" | grep '"mode"')
    rc=${PIPESTATUS[0]}; e=$(( $(date +%s%3N) - s ))
    if [ -n "$o" ]; then echo "$o"; else
      why=$(grep -m1 -o -E 'heap out of memory|RangeError[^"]{0,60}|Maximum call stack[^"]{0,20}' "$ERR/$mode-$c.err")
      echo "{\"mode\":\"$mode\",\"case\":\"$c\",\"outcome\":\"process_died\",\"exit_code\":$rc,\"wall_ms\":$e,\"killed_at_limit_s\":$([ "$rc" -eq 137 ] && echo "$LIMIT" || echo null),\"stderr\":\"${why}\"}"
    fi
  done
done

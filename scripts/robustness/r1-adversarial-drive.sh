#!/bin/bash
# Robustness R1 (T1): run each adversarial input in its own process, after the fix
# (the checked-out readability-convert.ts) and before it (the file at f494ad76^,
# the commit before #964). A case past LIMIT seconds is killed and recorded.
# Usage: bash scripts/robustness/r1-adversarial-drive.sh [case ...]  (prints JSON lines)
# Linux only: needs bash, GNU date and timeout, and a full clone that has f494ad76^.
set -u
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
CASE="$ROOT/scripts/robustness/r1-adversarial-case.mts"
BEFORE="$ROOT/apps/api/src/capabilities/lib/__failbefore-readability.ts"
LIMIT=${LIMIT:-60}
CASES=${*:-nested-div-16KB nested-div-32KB nested-div-64KB nested-formatting-16KB nested-formatting-32KB nested-formatting-a-16KB nested-formatting-a-32KB attribute-flood-1MB flat-tags-16MB}
ERR=$(mktemp -d)
trap 'rm -f "$BEFORE"; rm -rf "$ERR"' EXIT
git -C "$ROOT" show f494ad76^:apps/api/src/capabilities/lib/readability-convert.ts > "$BEFORE" \
  && [ -s "$BEFORE" ] || { echo "cannot read readability-convert.ts at f494ad76^ (shallow clone?)" >&2; exit 1; }
cd "$ROOT/apps/api"
for mode in after before; do
  for c in $CASES; do
    s=$(date +%s%3N)
    timeout -s KILL "$LIMIT" npx tsx "$CASE" "$mode" "$c" >"$ERR/$mode-$c.out" 2>"$ERR/$mode-$c.err"
    rc=$?; e=$(( $(date +%s%3N) - s ))
    o=$(grep '"mode"' "$ERR/$mode-$c.out")
    if [ -n "$o" ]; then echo "$o"; else
      why=$(grep -m1 -o -E 'heap out of memory|RangeError[^"]{0,60}|Maximum call stack[^"]{0,20}' "$ERR/$mode-$c.err")
      echo "{\"mode\":\"$mode\",\"case\":\"$c\",\"outcome\":\"process_died\",\"exit_code\":$rc,\"wall_ms\":$e,\"killed_at_limit_s\":$([ "$rc" -eq 137 ] && echo "$LIMIT" || echo null),\"stderr\":\"${why}\"}"
    fi
  done
done

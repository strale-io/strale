Intent: record the us-company-data title_in_text change (#1100) and the fleet cost rule for the next Strale master.

# 2026-11-19 — us-company-data title_in_text (Strale master, account hotmail-ra)

## Work done

- #1100: free text like "Look up Oracle Corp for me" now resolves exactly through the SEC title map when the model-extracted name appears word for word in the caller's text (`resolution_method: "title_in_text"`). Built by Codex (brief and report in `docs/lanes/codex/`). Independent review (fresh Claude agent) found one MEDIUM issue: a name the model cut short ("Apple" from "Apple Hospitality REIT") could become a wrong exact match. The fix in 4fd7ffd6 keeps a span followed by a capitalised word, a digit or "&" on the search path. Re-review: GO.
- The Codex run left `docs/project/legacy-authority-inventory.json` stale, which failed CI `check` (test "the checked-in repository context is warning-clean"). Regenerated with `npm run context:generate`.

## Open

- Residual LOW risks, accepted in #1100: front truncation ("Stanley" from "Morgan Stanley") and all-lowercase truncation are not guarded.
- `manifests/us-company-data.yaml` input text does not yet mention the title-in-text step. This is a docs follow-up only; nothing reads `resolution_method` as an enum.
- After deploy: a paid production call to confirm `title_in_text` on a free-text input needs a keyed session. It has not been done.

## Standing rule this repo does not hold a copy of

The fleet cost rule, wow-core `core/MODEL_ROUTING.md` "Spend the subscription on work, not overhead" (moonlighter-ab/wow-core#409, b44f5d9). The founder said on 2026-11-19 "implement it in all my projects". Strale's comms profile does not ship MODEL_ROUTING.md, so read it in wow-core.
- Long background builds go to Codex, with strong-tier review and no frontier lanes.
- Short chores are done inline, never in a new session.
- Token-heavy reads go to a pinned in-session `fan-out` subagent.
- Suites follow PACE_CORE §2a "Check runners".
- Scheduled checks stay bound to the master, run scripts first, and end in one line when nothing is flagged.

Next authorised action: confirm #1100 deployed (`/health` version), then the manifest docs follow-up | Owner: Strale master | Blocker: none

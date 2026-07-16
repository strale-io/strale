# MODEL-OS fallback log — own evidence outranks marketing claims

When a session hits a limit or an unavailable model and falls down a role's ladder
(doctrine: MODEL-OS.md §6 — "wanted X, fell to Y — FLAG it"), the flag also gets a row
HERE, in the copy of this file next to whichever routing.json the session resolved
(per-repo `.claude/model-os/` copy, or the wow-core checkout). Append one line:

```
YYYY-MM-DD | wanted <model> | got <model> | <limit|unavailable|founder-call> | <one-line context>
```

The weekly refresh's phase-(b) own-evidence sweep greps this file. Recurring fallbacks
on the same model are THE re-rank signal — stronger than any benchmark or vendor claim,
because they're what actually happened to this studio's own work.

Per-repo copies are seeded once by sync-model-os.ps1 and never overwritten (a log is
per-repo history, not synced doctrine).

---
<!-- append entries below this line -->

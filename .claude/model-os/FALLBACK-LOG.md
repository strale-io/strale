# MODEL-OS fallback log — own evidence outranks marketing claims

This is the shipped format reference. Runtime transitions are written to the machine-local
`$MODEL_OS_STATE_DIR/fallback.log.md` (default `~/.model-os/fallback.log.md`) so neither the
wow-core source nor synced consumer copies are dirtied. When a selected route genuinely fails
and dispatch advances to the next globally ranked, floor-clearing candidate, the bounded writer emits:

```
YYYY-MM-DD | wanted <model> | got <model> | <limit|unavailable|founder-call> | <one-line context>
```

The weekly refresh's phase-(b) own-evidence sweep greps this file. Recurring fallbacks
on the same model are THE re-rank signal — stronger than any benchmark or vendor claim,
because they're what actually happened to this studio's own work.

Per-repo copies are seeded once by sync-model-os.ps1 and never overwritten (a log is
per-repo history, not synced doctrine).

---
Use `node <model-os>/fallback-log.mjs --wanted <id> --got <id> --role <role> --reason <limit|unavailable|founder-call> [--context "one line"]`.
The writer is lock-protected and retains the newest policy-bounded entries (currently 200),
recording the number rotated instead of allowing this operational log to grow forever.

<!-- append entries below this line -->

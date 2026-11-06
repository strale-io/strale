Intent: clear the one readiness issue left after the ESMA source fix (PR #943).

The onboarding backfill (run 42247689075) verified vasp-verify and vasp-non-compliant-check live against ESMA (known answers passed) but reported readiness "Missing avg_latency_ms". Both manifests now set 1000 ms: warm-cache calls measured 173 and 242 ms in that run, and a cold read of the ESMA CSVs (cached six hours) takes longer. After merge, rerun the backfill for both slugs and record readiness.

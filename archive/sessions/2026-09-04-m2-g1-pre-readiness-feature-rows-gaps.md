---
doc_type: decision-source-gap-report
authority_scope: none
status: evidence
complete: true
phase: M2
authority_active: false
created_at: 2026-09-04
---

# M2 G1 pre-readiness feature-scoped decision rows

> [!CAUTION]
> **M2 EVIDENCE — NOT ACTIVE PROJECT AUTHORITY.**
> This report explains why 76 preserved pre-readiness
> feature-scoped Decision rows are classified intentionally historical
> instead of migrated to formal records. It does not change those rows,
> resolve an identity, edit Notion, or authorize M4.

## The rule

DEC-20260904-A (`docs/decisions/records/DEC-20260904-A.md`) classifies
every preserved M2 closure-register Decision row matching this predicate as
evidence-only (register disposition `intentionally_historical`):

```
historical_status == active
AND historical_scope == feature
AND decided_at < 2026-08-12
AND disposition == not_yet_reconciled
AND NOT (page id or id in the collision registry, docs/decisions/id-collisions.yaml)
AND NOT (id is a Git-native protocol label, scripts/m2-closure-register-lib.mjs gitNativeClaims)
AND NOT (id is an existing formal record id, docs/decisions/records/*.md)
```

The rule targets feature-scoped decisions from before the readiness program
(DEC-20260812-A, adopted 2026-08-12): UI, website, and
capability-level choices whose product framing that program retired
(DEC-20260812-A supersedes DEC-20260502-A/DEC-20260503-A), and whose website
surface is being rebuilt (DEC-20260902-A). They are evidence of what was
decided, not live authority. A formal candidate record per row would be 76
records nobody would read, each needing the same five-section fidelity bar as
an active decision.

## Population at archive commit `995cece3fe4abfb8b0bef0cccbd58191a6dab83c`

76 rows matched. Each is listed below by its public identity
(page id and historical ID); titles remain hashed on the public register.

- 31367c87082c8103ab84c5fe6d140a4a — DEC-20260227-P-g7h8
- 31367c87082c81238fd2f08e7d176a9d — DEC-20260227-P-c3d4
- 31367c87082c819cac9bc1917def3951 — DEC-20260227-P-k1l2
- 31367c87082c81a795c2f2c75c279eff — DEC-20260227-P-e5f6
- 31767c87082c8122afbae0e095b76dbc — DEC-20260302-E
- 31867c87082c810294eedb4e5cadc4f1 — DEC-20260303-L
- 31867c87082c81068c5cd4cdd98d24e0 — DEC-20260303-J
- 31867c87082c814d9d5ccdf8d2ee37d5 — DEC-20260303-F
- 31867c87082c814fb72ff1aab1015227 — DEC-20260303-K
- 31867c87082c8195a9dffe7132c1cc89 — DEC-20260303-D
- 31867c87082c81aebe08f00f24bc1d10 — DEC-20260303-H
- 31867c87082c81c18937e77ae55b1e92 — DEC-20260303-M
- 31867c87082c81cabf16da662cd874f5 — DEC-20260303-B
- 31867c87082c81d389f5f59c89e00750 — DEC-20260303-I
- 31867c87082c81de8327f7ad1f1295ca — DEC-20260303-G
- 31867c87082c81e09d58deb1fe3cb086 — DEC-20260303-E
- 31a67c87082c813fa2eacb9f22748a82 — DEC-20260305-C
- 31a67c87082c81ab9947de831a3b7730 — DEC-20260305-B
- 31a67c87082c81b29d12de21bc02af76 — DEC-20260305-D
- 31b67c87082c814785a8ff40666fe83b — DEC-20260306-A
- 31b67c87082c815bae75db8f3dfbadab — DEC-20260306-C
- 31b67c87082c81d4b535cfbaaba8ef47 — DEC-20260306-B
- 31b67c87082c81d88b49d8b27e290768 — DEC-20260306-F
- 31b67c87082c81f0b41dedbe561e0c4f — DEC-20260306-E
- 32067c87082c8113a1adc2ecab0ce968 — DEC-20260311-B
- 32067c87082c815a90f3f59ca2f0b915 — DEC-20260311-A
- 32267c87082c819280c1df580fe8aeff — DEC-20260313-B
- 32267c87082c81c58995f598d70524e6 — DEC-20260313-A
- 32267c87082c81f297c2e2c8445ad228 — DEC-20260313-D
- 32367c87082c81349c24cdb7b0e36481 — DEC-20260315-C
- 32467c87082c81bb9547c1a2e5353534 — DEC-20260315-J
- 32567c87082c8194b76cf9bb2cadc61a — DEC-20260316-C
- 32667c87082c810aba91e8e32271aa08 — DEC-20260317-C
- 32667c87082c812398c6fc9b405da9c3 — DEC-20260317-D
- 32667c87082c81b08169d245763c8e73 — DEC-20260317-I
- 32667c87082c81f790c0fe18f4b09bdb — DEC-20260317-B
- 32667c87082c81fa8896d57ed40a1bbd — DEC-20260317-E
- 32967c87082c8138b5c5cef430075d6a — DEC-20260320-G
- 32967c87082c8180bf20d41f80b528e4 — DEC-20260320-I
- 32967c87082c81a39e9be7c319ecc60a — DEC-20260320-D
- 32967c87082c81b6962aef4f8bebcdbb — DEC-20260320-H
- 32d67c87082c8124b484d2fd0c17cdc0 — DEC-20260324-B
- 32d67c87082c81378f63ca3272b44c8d — DEC-20260324-D
- 32d67c87082c81499f64de8ff2c570f4 — DEC-20260324-E
- 32d67c87082c8173be2ded071699cf63 — DEC-20260324-F
- 33467c87082c812aa2e6d8116c99aa87 — DEC-20260331-A
- 33667c87082c8123beb1d6a8e807f05c — DEC-20260402-B
- 33667c87082c818ca676ff77d4c40588 — DEC-20260402-A
- 33967c87082c81648c55d06ba3877dd9 — DEC-20260405-C
- 33f67c87082c81d68803cf7a7248e814 — DEC-20260411-C
- 34867c87082c811bb01fd066850afb8a — DEC-20260420-N
- 34867c87082c81598f69c2a973447a0a — DEC-20260420-M
- 34867c87082c818299a1e08733019df0 — DEC-20260420-B
- 34867c87082c818f8ec0e942777e9558 — DEC-20260421-G
- 34867c87082c819b9605fbdcf2824df4 — DEC-20260420-C
- 34867c87082c81a995bfc8b6579d18d3 — DEC-20260420-L
- 34867c87082c81b5879be194466683a2 — DEC-20260421-E
- 34867c87082c81e4bbe4db1f713888ca — DEC-20260421-F
- 34867c87082c81ff8a28c9319c648aa3 — DEC-20260420-O
- 34967c87082c810dae0dda7a1ef125cd — DEC-20260421-HR
- 34967c87082c813db2b7ca2728aac3cd — DEC-20260424-B
- 34967c87082c814395bcc611e0066850 — DEC-20260421-I
- 34967c87082c8148bb8fd139dab5d3a3 — DEC-20260421-SE-B
- 34967c87082c815f961ce1911c52669a — DEC-20260421-H
- 34967c87082c8173a2adc905f762303c — DEC-20260421-K
- 34967c87082c81daa06ff98472610dcc — DEC-20260421-SE-C
- 34a67c87082c8117a3f2c71cae63b9bb — DEC-20260422-G
- 34a67c87082c811e8e43ee63427cfb5b — DEC-20260422-F
- 34a67c87082c81cda198d739d82cdb9c — DEC-20260422-E
- 35767c87082c8121ac43fc970dbe78ac — DEC-20260505-F
- 35867c87082c81098cf9fbf2ba5e96a2 — DEC-20260506-C
- 35867c87082c8127ad95d2531403f4f7 — DEC-20260506-E
- 35867c87082c81498a7cef963cd19c52 — DEC-20260506-F
- 35867c87082c817ab229ea191f9564fe — DEC-20260506-A
- 35867c87082c81d88be5cd076bc24f68 — DEC-20260506-B
- 35d67c87082c81d18ec2fd9c53a33007 — DEC-20260511-A

## No-change boundary

- Do not edit any source Decision row.
- Do not add any of these rows to the Notion-only collision registry.
- Do not delete any archived Notion content.
- Do not treat this report or DEC-20260904-A as authority to reopen these
  rows without a later batch that explicitly cites the rule and lifts a row
  out of evidence-only into a formal record.

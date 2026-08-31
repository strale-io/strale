# Public Notion-export containment summary

Date: 2026-08-31
Status: ordinary public refs cleaned; GitHub retained-object removal requested

## Decision

The founder approved three actions:

1. keep raw project-memory evidence in a private companion repository;
2. reconstruct the public migration branch without raw Notion files or their
   branch history;
3. retain only reconciled canonical documents and a non-sensitive archive status
   pointer in the public code repository.

The private boundary is `strale-io/strale-context-archive`. Its initial sanitized
archive commit is `c584249` and the repository was verified private before and
after the push.

The approved public migration branch was force-updated with an exact lease from
`a2beba08`. Its verified raw-export-removal checkpoint is `37f8e76a`; later
docs-only commits may follow it. GitHub's remote tree contains zero paths under
`archive/imports/notion/`, and the active isolated migration worktree was
realigned to the clean branch.

## Credential finding

Push protection rejected a local pagination commit containing three live-secret
occurrences representing two distinct credentials. GitHub's commit API did not
resolve the rejected commit, its exact blob returned 404, and none of 43 public
branches contained the affected page. Claude Opus therefore classified the keys
as not publicly exposed and rotation-before-rewrite as recommended, not required.
The founder deferred rotation.

Escalate to immediate rotation if either credential shows unrecognized use, a
provider alert occurs, the rejected object is pushed, or a repository containing
it becomes accessible outside the existing trusted processor boundary.

## Public reachability audit

The earlier 57-file raw export was reachable from:

- `codex/repo-native-operating-model`;
- `codex/repo-native-foundation-m1`;
- GitHub-retained `refs/pull/446/head`.

The public fork `epistemedeus/strale` did not contain the export path on its
default branch, but GitHub's shared object store could resolve the original raw
commit through the fork. Rewriting branch refs cannot guarantee deletion of PR,
fork, cache, mirror, or archival copies.

After independent Claude review and founder approval, the exact
`codex/repo-native-foundation-m1` ref was deleted with a force-with-lease. A
follow-up audit found zero affected paths across all 42 current branch refs and
all 5 tags. GitHub-retained `refs/pull/446/head`, cached objects, and fork-network
object access remain pending provider action and must not yet be described as
purged.

GitHub Support opened sensitive-data removal ticket
[#4715462](https://support.github.com/ticket/personal/0/4715462) on 2026-08-31.
The link is the exact href returned by the authenticated GitHub Support ticket
portal. The request identifies commit `61f303de`, PR #446, the affected path,
the known fork, the completed ref rewrite, and the retained-object cleanup
requested.

## Data classes

The 57 publicly committed files contain internal operating history, commercial
and product strategy, pricing/revenue discussion, vendor and contract material,
legal/compliance discussion, Notion metadata, and personal data in the form of
seven distinct non-generic business email addresses. The focused scan found no
phone-number matches in that public file set. No address values are repeated in
this public report.

## Public-repo invariant

Raw Notion pages, database rows, search responses, manifests, and secret-bearing
history must not be committed to this repository. Public automation reads only
`docs/project/private-archive-status.json`; detailed evidence remains private.

## Final verification of the approved branch

- Claude Opus: `PASS_WITH_FOLLOWUPS`, high 0, medium 2, low 3,
  `SAFE_TO_FORCE_UPDATE_MIGRATION_BRANCH: YES`.
- Context tests: 6/6 passed; the only context finding is the intentional M0
  incomplete warning sourced from the public status pointer.
- API TypeScript: passed.
- Production-write guard test: 11/11 passed; live guard reported zero offenders.
- Outgoing Notion objects and clean-tree Notion paths: zero.
- High-confidence scan of 74 changed text files: zero credential findings.
- Design/context preservation: 85/85 and 12/12 Git blob entries matched.

Claude's two medium findings were the sibling/PR refs and the fact that
force-updating refs does not purge GitHub-retained objects. The sibling branch is
now deleted; PR, cache, and fork-network cleanup is tracked by GitHub Support
ticket #4715462 rather than treated as complete.


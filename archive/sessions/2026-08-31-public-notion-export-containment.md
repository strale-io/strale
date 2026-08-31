# Public Notion-export containment summary

Date: 2026-08-31
Status: branch reconstruction in progress; retained-object decision pending

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
fork, cache, mirror, or archival copies. A separate founder decision is required
before contacting GitHub support or making any legal/privacy notification.

## Data classes

The export contains internal operating history, commercial and product strategy,
pricing/revenue discussion, vendor and contract material, legal/compliance
discussion, Notion metadata, and potential personal identifiers. A conservative
scan found potential email-address material; that is a discovery heuristic, not
a legal classification.

## Public-repo invariant

Raw Notion pages, database rows, search responses, manifests, and secret-bearing
history must not be committed to this repository. Public automation reads only
`docs/project/private-archive-status.json`; detailed evidence remains private.


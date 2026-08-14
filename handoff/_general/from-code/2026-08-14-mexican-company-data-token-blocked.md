Intent: Build mexican-company-data from INEGI DENUE, excluding sole-trader contact fields per Petter's product decision

## Outcome: build blocked before it started — DENUE API requires a registered token

Per the session's own instructions ("If it needs a token that must be registered, STOP
and write the spec instead — key registration is founder-gated, do not sign up for
anything"), this session verified the DENUE access model, confirmed a token is required,
confirmed nothing resembling a token exists anywhere in the repo/`.env`, and stopped
before writing an executor or touching the DB. **No capability was created. No DB rows
were inserted or modified.**

## What was verified

1. **Source access model.** Fetched
   https://www.inegi.org.mx/servicios/api_denue.html directly (2026-08-14). Confirmed:
   - Endpoint: `https://www.inegi.org.mx/app/api/denue/v1/consulta/Nombre/{name}/{entidad}/{start}/{end}/{token}`
     and `.../consulta/Ficha/{id}/{token}`.
   - A token is required for every call — the docs state it is "obtained by registering"
     (`Número único que permite hacer consultas, el cual se puede obtener al
     registrarse`), at https://inegi.org.mx/app/desarrolladores/generatoken/Usuarios/token_Verify,
     emailed to the address supplied at signup.
   - No rate limits and no terms of use / redistribution terms are published on the
     docs page. Recorded the absence rather than obtaining anything in writing (same
     class as the AT Firmenbuch item, 2026-08-12 catalogue strategy §5 V1).
   - Confirmed empirically: an unauthenticated call
     (`curl https://www.inegi.org.mx/app/api/denue/v1/consulta/Nombre/AUTOFLETES/0/1/10/`)
     returns HTTP 501 "Consulta incorrecta" — the token is enforced, not optional.
   - Checked `.env`, the whole repo, and grepped for `denue`/`inegi` — no token or prior
     integration exists anywhere.
2. **Persona física / persona moral classification.** DENUE's documented response
   fields (`Nombre`, `Razon_social`, `Clase_actividad`, `Estrato`, `Telefono`,
   `Correo_e`, `Sitio_internet`, address fields, `Latitud`/`Longitud`) contain no
   explicit legal-form flag. The only available signal is pattern-matching
   `Razon_social` for a corporate suffix (SA DE CV, S DE RL, SC, SAPI DE CV, AC, etc.),
   which the task instructions explicitly forbid using ("do not guess"). Per Petter's
   own conditional in the task ("If DENUE does not let you distinguish persona física
   from persona moral reliably, omit contact fields entirely"), this resolves to:
   **omit `phone`/`email`/`website` from the output for every record**, not a
   sole-trader-only exclusion. Documented in the manifest as a `legal`-category
   limitation.

## What was done

- Updated `manifests-drafts/mexican-company-data.yaml` (still in `manifests-drafts/`,
  not promoted to `manifests/` — it cannot be, no executor exists):
  - Closed verification-debt items 1 and 5 from the prior draft's header.
  - Recorded item 2 (contact-field population rates) and item 3 (redistribution
    terms) as blocked on the token — cannot be checked without registering.
  - Added the persona física finding (new item 6) and resolved it per Petter's
    conditional: contact fields removed from `output_schema.example`,
    `output_field_reliability`, and description; a new `limitations` entry
    ("Contact fields withheld for all records") replaces the two prior
    contact-related limitation entries.
  - Added an explicit action item for Petter: register at the INEGI URL above, add
    the token to the environment (suggested name `DENUE_API_TOKEN`), confirm no
    redistribution restriction in the post-signup terms, then re-verify contact-field
    population rates live before the executor is written.
- No executor file was created (`apps/api/src/capabilities/mexican-company-data.ts`
  does not exist).
- No manifest was moved into `manifests/`, no `onboard.ts` run (dry-run or otherwise —
  there is nothing to onboard without an executor), no DB writes of any kind.
- No account was created and no registration form was submitted anywhere.

## Capability Onboarding Protocol (DEC-20260320-B) — not triggered

No executor, no manifest promotion, no DB row: the protocol's "creates, modifies, or
onboards a capability" trigger did not fire. Nothing to report against readiness check,
structural validation, or smoke test — none were run because there is nothing to run
them against.

## Next step (for whoever picks this up once a token exists)

1. Petter registers at https://inegi.org.mx/app/desarrolladores/generatoken/Usuarios/token_Verify,
   sets `DENUE_API_TOKEN` (or similar) on Railway + local `.env`.
2. Re-run the population-rate check (item 2) with a real authenticated call against a
   known carrier (e.g. one of the 50 names in the demand doc) before trusting the
   €0.05 pricing / value framing.
3. Write the executor following the Capability Onboarding Protocol and the manifest at
   `manifests-drafts/mexican-company-data.yaml` (promote to `manifests/` once the
   executor exists), keeping the contact-field omission exactly as specified — do not
   reintroduce `phone`/`email`/`website` without a documented DENUE legal-form field.
4. Dark-launch per DEC-20260812-A (`visible=false`, `x402_enabled=false`) until a green
   week of real signal.

## PR

Branch `catalog/mexican-company-data` off `origin/main`. This PR contains only the
manifest-draft update and this handoff file — no code, no DB changes. Opened as a
findings/spec PR per the task's explicit stop condition, not a capability-ship PR.

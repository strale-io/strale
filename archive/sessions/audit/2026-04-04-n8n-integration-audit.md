# n8n Integration Audit — 2026-04-05

## Summary

A functional, production-ready n8n community node exists at `n8n-nodes-strale@0.1.2` on npm. It exposes 5 operations (Search, Execute, Trust Profile, Execute Solution, Balance) via a single meta-operations node that can dispatch to all 271 capabilities. The node passes the n8n security scan, has optional auth with free-tier fallback, and includes `usableAsTool: true` for AI agent workflows. Published with provenance via GitHub Actions.

## 1. Package and Distribution

- **Package:** `n8n-nodes-strale` v0.1.2
- **Location:** Separate repo at `github.com/strale-io/n8n-nodes-strale` (not in monorepo)
- **npm:** Published, compliant with `n8n-nodes-*` naming convention
- **Security scan:** Passes `@n8n/scan-community-package` (0 errors)
- **Verified status:** Not yet submitted to n8n Creator Portal

## 2. Node Structure

- **Style:** Programmatic with declarative input rendering
- **Nodes:** 1 (`Strale`)
- **Credentials:** `StraleApi` (Bearer token, optional)
- **Resources:** Capabilities, Solutions, Account
- **Operations:** Search, Execute, Trust Profile, Execute Solution, Balance
- **Capability selection:** Via `slug` string parameter + Search helper
- **Input handling:** JSON blob parameter (shape varies by capability)

## 3. Feature Completeness

| Feature | Status |
|---|---|
| Credentials with test endpoint | ✅ Present |
| Working operations | ✅ All 5 functional |
| Dynamic capability selection | ✅ Via slug + search |
| Error handling (NodeOperationError) | ✅ Present |
| Continue-on-fail | ✅ Present |
| Free-tier auth fallback | ✅ Present |
| Icon and branding | ✅ SVG icon |
| README with install instructions | ✅ Present |
| Published to npm | ✅ v0.1.2 |
| CI/CD with provenance | ✅ GitHub Actions |
| Security scan | ✅ Passes |
| Example workflows | ✅ 3 workflows added (v0.1.2) |
| Tests | ❌ Missing |
| n8n verified status | ❌ Not submitted |
| Dynamic property loading from API | ❌ Static categories (17 hardcoded) |

## 4. Example Workflows (added v0.1.2)

- `workflows/validate-iban-free.json` — IBAN validation, no API key needed
- `workflows/kyb-company-check.json` — Swedish company lookup via KYB
- `workflows/search-then-execute.json` — Search for capabilities → run sanctions check

## 5. Known Gaps

- No unit tests
- Categories are hardcoded (17 options) rather than fetched from API
- Credential test only validates paid API key, can't verify free-tier-only usage
- Single node design (all operations in one node vs separate nodes per resource)
- No dynamic input schema generation per capability

## 6. Recommended Next Steps

1. **Submit to n8n Creator Portal** (creator.n8n.io) for verified status — enables n8n Cloud access
2. **Post on n8n community forum** (community.n8n.io) announcing the node
3. **Post on r/n8n** with example workflow screenshots
4. Add unit tests for each operation handler
5. Consider dynamic category fetching from `/v1/capabilities` endpoint

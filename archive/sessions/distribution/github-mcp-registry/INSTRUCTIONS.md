# Submitting Strale to the GitHub MCP Registry

## Process

1. Go to https://github.com/modelcontextprotocol/registry
2. Check the current submission process — it may be:
   - **PR-based:** Fork, add entry.json content, submit PR
   - **Automated:** Ensure strale repo has MCP metadata (package.json, mcp.json)
   - **Web form:** Fill in details from entry.json

3. If PR-based:
   - Fork the registry repo
   - Add a new file at `servers/strale.json` (or wherever entries go)
   - Use the content from `entry.json` in this directory
   - Submit PR using `pr-description.md` as the body

4. If automated/discovery:
   - Ensure `https://api.strale.io/.well-known/mcp.json` is live (it is)
   - Ensure `strale-mcp` npm package has correct metadata (it does)
   - Submit the URL for crawling if there's a form

## Verification Checklist

Before submitting, verify these URLs work:

- [ ] https://api.strale.io/.well-known/mcp.json — MCP Server Card
- [ ] https://api.strale.io/.well-known/agent-card.json — A2A Agent Card
- [ ] https://api.strale.io/.well-known/ai-catalog.json — AI Catalog
- [ ] https://api.strale.io/mcp — MCP endpoint (returns error without auth, that's fine)
- [ ] https://www.npmjs.com/package/strale-mcp — npm package page

## After Submission

- [ ] Registry PR/submission: #___
- [ ] Status: pending / approved / live

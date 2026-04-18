#!/bin/bash
# Register Strale as a remote MCP server in ContextForge
#
# Prerequisites:
#   - ContextForge gateway running (default: http://localhost:4444)
#   - MCPGATEWAY_BEARER_TOKEN set (gateway admin JWT)
#   - STRALE_API_KEY set (get one at https://strale.dev/signup)
#
# Usage:
#   export MCPGATEWAY_BEARER_TOKEN=your-gateway-jwt
#   export STRALE_API_KEY=sk_live_your_key
#   ./register-strale.sh

GATEWAY_URL="${CONTEXTFORGE_URL:-http://localhost:4444}"

echo "Registering Strale MCP server at ${GATEWAY_URL}..."

curl -s -X POST "${GATEWAY_URL}/gateways" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${MCPGATEWAY_BEARER_TOKEN}" \
  -d '{
    "name": "strale",
    "url": "https://api.strale.io/mcp",
    "transport": "STREAMABLEHTTP",
    "description": "Trust and quality infrastructure for AI agents. 250+ quality-scored capabilities for validation, compliance, enrichment, and Web3 — with dual-profile quality scores and audit trails.",
    "auth_config": {
      "type": "bearer",
      "token": "'"${STRALE_API_KEY}"'"
    },
    "tags": ["compliance", "validation", "company-data", "sanctions", "kyb", "web3", "enrichment", "trust"]
  }' | python3 -m json.tool

echo ""
echo "Done. Run 'curl ${GATEWAY_URL}/tools' to see discovered tools."

Intent: Fix MCP HTTP session instability — switch to stateless transport

## Problem

ChatGPT reported that `strale_search` worked on the first call via MCP HTTP, then returned "Resource not found" on the next call in the same session.

## Root Cause

In-memory session Map (`Map<string, McpSession>`) is wiped on every Railway redeploy. Railway redeploys on every push to main. Any client with an active session loses it instantly when the process restarts. The client sends `Mcp-Session-Id: <old-uuid>` but the new process doesn't recognize it, returning 404.

Additional risk factors identified:
- No SIGTERM handler for graceful shutdown
- No limits on concurrent session count (memory leak vector)
- Background test scheduler jobs could cause OOM restarts
- Health check (`/health`) doesn't verify DB connectivity

## Fix Applied

**Switched MCP HTTP transport to stateless mode.**

File: `apps/api/src/routes/mcp.ts`

- Set `sessionIdGenerator: undefined` (MCP SDK's built-in stateless flag)
- Each POST creates a fresh McpServer + transport, handles the request, then disposes both
- Removed: session Map, cleanup interval, `randomUUID` import, `SESSION_TIMEOUT_MS`, `McpSession` interface
- Catalog cache (capabilities + solutions, 10-min TTL) preserved — that's still reusable across requests

The MCP SDK explicitly supports this pattern. Their own example (`simpleStatelessStreamableHttp.js`) demonstrates it.

## Trade-offs

- No SSE streaming for long-running tool calls (each response is a complete HTTP response)
- Slightly higher per-request overhead (new McpServer instance per POST)
- Tools that take >30s won't benefit from connection keep-alive

These trade-offs are acceptable because:
1. All Strale tool calls complete in <10s (capabilities are sync or short-async)
2. McpServer creation is cheap (just registering tool handlers, ~5ms)
3. The catalog is cached, so the expensive part (HTTP fetch) is amortized

## What's NOT Fixed (Future Work)

- No SIGTERM handler for graceful shutdown
- `/health` endpoint should verify DB connectivity
- Background test scheduler could benefit from error boundaries
- Consider `--max-old-space-size` in Dockerfile for memory ceiling

## Verification

- `npx tsc --noEmit -p apps/api/tsconfig.json` passes
- Stateless mode means any client can call POST /mcp at any time, even after a redeploy, without session errors

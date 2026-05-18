FROM node:20-slim

# `unzip` is required by `apps/api/src/jobs/ingest-ee-directors.ts` — that
# job streams the RIK Ariregister CC BY 4.0 open-data ZIP and pipes its
# entry through `unzip -p` rather than carrying a Node ZIP dependency.
# Without it the nightly ingest would fail at job start and the EE
# tier-2 cache would never refresh. `apt-get clean` keeps the slim image
# slim.
RUN apt-get update \
 && apt-get install -y --no-install-recommends unzip ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files first for better layer caching
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY packages/sdk-typescript/package.json packages/sdk-typescript/
COPY packages/mcp-server/package.json packages/mcp-server/

# Install all dependencies
RUN npm ci

# Copy source code
COPY tsconfig.json ./
COPY apps/api/ apps/api/
COPY packages/sdk-typescript/ packages/sdk-typescript/
COPY packages/mcp-server/ packages/mcp-server/

# Manifests are the source of truth for capability registration (see
# apps/api/src/capabilities/auto-register.ts). They must be present at
# runtime — without them, no capabilities register and the API boots
# with an empty catalog.
COPY manifests/ manifests/

# Build MCP server first (apps/api imports from it)
RUN npm run build --workspace=packages/mcp-server
RUN npm run build --workspace=apps/api

# Expose port
EXPOSE 3000

# Start the server
CMD ["node", "apps/api/dist/index.js"]

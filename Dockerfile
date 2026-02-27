FROM node:20-slim

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

# Build MCP server first (apps/api imports from it)
RUN npm run build --workspace=packages/mcp-server
RUN npm run build --workspace=apps/api

# Expose port
EXPOSE 3000

# Start the server
CMD ["node", "apps/api/dist/index.js"]

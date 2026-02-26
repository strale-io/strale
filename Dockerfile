FROM node:20-slim

WORKDIR /app

# Copy package files first for better layer caching
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY packages/sdk-typescript/package.json packages/sdk-typescript/

# Install all dependencies
RUN npm ci

# Copy source code
COPY tsconfig.json ./
COPY apps/api/ apps/api/
COPY packages/sdk-typescript/ packages/sdk-typescript/

# Build the API
RUN npm run build --workspace=apps/api

# Expose port
EXPOSE 3000

# Start the server
CMD ["node", "apps/api/dist/index.js"]

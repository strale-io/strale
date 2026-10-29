FROM node:20-slim

# `unzip` is required by `apps/api/src/jobs/ingest-ee-directors.ts` — that
# job streams the RIK Ariregister CC BY 4.0 open-data ZIP and pipes its
# entry through `unzip -p` rather than carrying a Node ZIP dependency.
# Without it the nightly ingest would fail at job start and the EE
# tier-2 cache would never refresh. `apt-get clean` keeps the slim image
# slim.
#
# `tesseract-ocr` with its language packs and `poppler-utils` (pdfinfo,
# pdftoppm, pdfunite) serve `document-ocr`
# (apps/api/src/capabilities/lib/ocr/engine.ts), which runs them as child
# processes. The language list must match SUPPORTED_LANGUAGES there;
# image-boot-smoke runs scripts/ci/ocr-probe.mjs against this image and fails
# if a binary or pack is missing, or if the children run as root. `prlimit`
# and `nice` (util-linux, coreutils) are already in the base image.
RUN apt-get update \
 && apt-get install -y --no-install-recommends unzip ca-certificates \
      poppler-utils tesseract-ocr tesseract-ocr-eng tesseract-ocr-swe \
      tesseract-ocr-dan tesseract-ocr-nor tesseract-ocr-fin tesseract-ocr-deu \
      tesseract-ocr-fra tesseract-ocr-spa tesseract-ocr-ita tesseract-ocr-nld \
 && rm -rf /var/lib/apt/lists/* \
 && tesseract --version && tesseract --list-langs && pdftoppm -v

# document-ocr runs poppler and tesseract as this unprivileged user (engine.ts
# CHILD_USER), so a parser bug reached through a caller's PDF cannot read the
# API process's environment, memory or files, which stay root-owned.
RUN useradd --system --no-create-home --shell /usr/sbin/nologin strale-ocr

WORKDIR /app

# Copy package files first for better layer caching
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY packages/sdk-typescript/package.json packages/sdk-typescript/
COPY packages/mcp-server/package.json packages/mcp-server/

# Install all dependencies
RUN npm ci

# places-search's DuckDB worker reads Overture's GeoParquet through the httpfs
# extension. Installing it here puts it under /root/.duckdb in the image, so a
# new container does not have to download it from extensions.duckdb.org on its
# first search. If the download fails the build carries on: the worker's own
# INSTALL httpfs fetches it at runtime instead.
RUN node -e "import('@duckdb/node-api').then(async ({ DuckDBInstance }) => { const db = await DuckDBInstance.create(':memory:'); await (await db.connect()).run('INSTALL httpfs'); console.log('duckdb httpfs installed'); })" \
 || echo "duckdb httpfs pre-install failed; the worker installs it at runtime"

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

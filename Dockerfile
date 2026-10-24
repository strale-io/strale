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

# Repo-native data the daily digest reads at runtime (M4 batch 5, settled
# in docs/programs/cto-readiness/tracks.yaml: "the digest reads repository
# data from files copied into the API image"). See
# apps/api/src/lib/daily-digest/fetch-decision-queue.ts,
# fetch-handoff-activity.ts and fetch-distribution-registry.ts for the
# readers.
COPY docs/company/DECISION-QUEUE.md docs/company/DECISION-QUEUE.md
COPY handoff/_general/from-code/ handoff/_general/from-code/
COPY docs/operations/distribution-registry.yaml docs/operations/distribution-registry.yaml
COPY config/vendors.yaml config/vendors.yaml

# Build-time verification that the four paths above actually landed in the
# image, not just that a COPY line for them exists (DEC-20260504-C: "confirm
# reach by file path, not by historical pattern" -- a COPY line is not
# evidence the files arrived; a script that greps the Dockerfile for COPY
# lines would not be either). This fails the image build itself, naming the
# missing path, rather than letting a broken image ship and fail silently
# in production the way apps/api/scripts/apply-migrations.ts did on
# 2026-05-04.
#
# Three of the four are read by the digest today. config/vendors.yaml is in
# the settled M4 list of paths the readers use, but no reader reachable from
# this image reads it yet, so it is copied and required here on the
# specification's authority rather than on a reader's. Do not remove it to
# tidy up: check whether a reader has since appeared, and change the
# specification first if one never does. The discrepancy is recorded in the
# batch 5 handoff under handoff/_general/from-code/.
RUN for f in \
      docs/company/DECISION-QUEUE.md \
      handoff/_general/from-code \
      docs/operations/distribution-registry.yaml \
      config/vendors.yaml; \
    do \
      if [ ! -e "$f" ]; then \
        echo "image verification failed: required path missing from image: $f" >&2; \
        exit 1; \
      fi; \
    done && echo "image verification: all four required repo-native paths present"

# Build MCP server first (apps/api imports from it)
RUN npm run build --workspace=packages/mcp-server
RUN npm run build --workspace=apps/api

# Expose port
EXPOSE 3000

# Start the server
CMD ["node", "apps/api/dist/index.js"]

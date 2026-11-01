# GPU Grid agent, ready to run with a single `docker run` (see README).
# It starts each job as a separate, locked-down container next to itself, through
# the host's Docker (the socket is mounted when running it).

# 1. Build: compile the TypeScript to JavaScript
FROM node:24-slim AS build
WORKDIR /agent
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npx tsc -p tsconfig.build.json

# 2. Run: only Node, the compiled code, its runtime dependencies and the Docker client
FROM node:24-slim
WORKDIR /agent
ENV NODE_ENV=production \
    # Where binaries are kept while they run. Mount the same path from the host:
    # the job containers are started by the host's Docker, which sees host paths
    AGENT_WORK_DIR=/var/lib/gpugrid-agent \
    # Lets nvidia-smi inside this container read the GPUs (with --gpus all)
    NVIDIA_DRIVER_CAPABILITIES=compute,utility
COPY --from=docker:28-cli /usr/local/bin/docker /usr/local/bin/docker
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /agent/dist ./dist
CMD ["node", "dist/agent.js"]

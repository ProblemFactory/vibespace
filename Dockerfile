# VibeSpace — containerized deployment
#
#   docker build -t vibespace .
#   docker run -d -p 3456:3456 \
#     -v vibespace-data:/app/data \
#     -v vibespace-claude:/home/vibe/.claude \
#     -v /path/to/projects:/workspace \
#     --name vibespace vibespace
#
# First boot generates a random workspace password and prints it to the logs:
#   docker logs vibespace | grep password
# Set VIBESPACE_PASSWORD to choose your own instead.
#
# Claude Code login (one-time, inside the container):
#   docker exec -it vibespace claude   # then /login, credentials persist in the volume

FROM node:22-bookworm-slim

# dtach: session persistence (core requirement)
# procps/psmisc: ps/pgrep/fuser used by session discovery + socket liveness
# zip/unzip/tar: file-explorer archive features
# git/curl/ca-certificates: tooling claude commonly needs
# python3/make/g++: node-pty native build fallback (prebuilds usually suffice)
# fontconfig: /api/fonts (fc-list) — optional but small
# tini: pid 1 that reaps orphans (node as pid 1 never does — every detached
# process that dies would stay a zombie and read alive to `kill -0`)
RUN apt-get update && apt-get install -y --no-install-recommends \
      dtach procps psmisc zip unzip tar git curl ca-certificates \
      python3 make g++ fontconfig openssh-client rclone fuse3 tini \
    && rm -rf /var/lib/apt/lists/*

# Claude Code CLI (root install so it lands in the global PATH).
# NOTE: bypassPermissions is blocked for root — run the app as a normal user.
# mc (MinIO client): lets users mint PERMANENT revocable share credentials
# (service accounts); without it shares fall back to 7-day STS credentials
# dl.min.io answered 410 Gone on 2026-09-30 (MinIO retired its download host);
# the last community release of mc lives on GitHub — pinned by tag AND sha256
# (amd64 / arm64), so a moved or replaced asset fails the build by name.
RUN set -e; arch="$(dpkg --print-architecture)"; \
    case "$arch" in \
      amd64) sha=01f866e9c5f9b87c2b09116fa5d7c06695b106242d829a8bb32990c00312e891 ;; \
      arm64) sha=14c8c9616cfce4636add161304353244e8de383b2e2752c0e9dad01d4c27c12c ;; \
      *) echo "mc: no pinned build for $arch" >&2; exit 1 ;; \
    esac; \
    curl -fsSL "https://github.com/minio/mc/releases/download/RELEASE.2025-08-13T08-35-41Z/mc.linux-${arch}.RELEASE.2025-08-13T08-35-41Z" -o /usr/local/bin/mc \
    && echo "${sha}  /usr/local/bin/mc" | sha256sum -c - \
    && chmod +x /usr/local/bin/mc

RUN npm install -g @anthropic-ai/claude-code

# Non-root user (uid 1000 matches the default first user on most hosts, so
# bind-mounted project dirs keep sane ownership)
RUN userdel -r node 2>/dev/null || true; \
    useradd -m -u 1000 -s /bin/bash vibe

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

COPY . .
# data/ is dockerignored — create it IN the image owned by vibe, or the VOLUME
# would materialize at runtime owned by root and auth.json writes fail (EACCES)
RUN npm run build && mkdir -p /app/data && chown -R vibe:vibe /app

USER vibe
ENV HOME=/home/vibe \
    NO_AUTO_UPDATE=1 \
    VIBESPACE_GENERATE_PASSWORD=1 \
    PORT=3456 \
    HOST=0.0.0.0

# Default working directory for new sessions; mount your projects here
RUN mkdir -p /home/vibe/.claude
VOLUME ["/app/data", "/home/vibe/.claude"]
EXPOSE 3456

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "server.js"]

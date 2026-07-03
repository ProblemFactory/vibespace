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
RUN apt-get update && apt-get install -y --no-install-recommends \
      dtach procps psmisc zip unzip tar git curl ca-certificates \
      python3 make g++ fontconfig openssh-client \
    && rm -rf /var/lib/apt/lists/*

# Claude Code CLI (root install so it lands in the global PATH).
# NOTE: bypassPermissions is blocked for root — run the app as a normal user.
RUN npm install -g @anthropic-ai/claude-code

# Non-root user (uid 1000 matches the default first user on most hosts, so
# bind-mounted project dirs keep sane ownership)
RUN userdel -r node 2>/dev/null || true; \
    useradd -m -u 1000 -s /bin/bash vibe

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

COPY . .
RUN npm run build && chown -R vibe:vibe /app

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

CMD ["node", "server.js"]

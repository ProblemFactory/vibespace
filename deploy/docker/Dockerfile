# VibeSpace — K8s deployment image (PETS model, thin runtime base).
# The built app is baked at /opt/vibespace-dist as a KNOWN-GOOD SEED; the
# entrypoint copies it into the per-user PVC (~/vibespace) on first boot and
# runs from there, so users can fork/modify VibeSpace and it survives pod
# rebuilds. See docs/design-k8s-deployment.md §4.
#
#   build:  docker build -f deploy/docker/Dockerfile -t <registry>/vibespace:<ver> .
#   (build context = repo root)
FROM node:22-bookworm-slim

# Runtime deps (same set as the single-container Dockerfile):
# dtach = session persistence; procps/psmisc = discovery; zip/unzip/tar = archives;
# git/curl = tooling + self-update; python3/make/g++ = node-pty native fallback;
# fontconfig = /api/fonts; openssh-client = remote hosts; rclone/fuse3 = S3 mounts.
RUN apt-get update && apt-get install -y --no-install-recommends \
      dtach procps psmisc zip unzip tar git curl ca-certificates \
      python3 make g++ fontconfig openssh-client rclone fuse3 \
    && rm -rf /var/lib/apt/lists/*

# In-container desktop (noVNC through VibeSpace's own auth — src/vnc.js):
# TigerVNC bound to localhost + XFCE + Chromium. Started LAZILY by the server
# on the first desktop window; nothing runs for users who never open one.
RUN apt-get update && apt-get install -y --no-install-recommends \
      tigervnc-standalone-server dbus-x11 xfce4-session xfwm4 xfce4-panel \
      xfdesktop4 xfce4-terminal thunar chromium \
      fonts-noto-cjk fonts-noto-color-emoji xdg-utils \
    && rm -rf /var/lib/apt/lists/*

# Agent CLIs + mc (share-credential minting). bypassPermissions is blocked for
# root → the app runs as the non-root `vibe` user below.
RUN curl -fsSL https://dl.min.io/client/mc/release/linux-$(dpkg --print-architecture | sed 's/armhf/arm/')/mc -o /usr/local/bin/mc && chmod +x /usr/local/bin/mc
RUN npm install -g @anthropic-ai/claude-code @openai/codex

# node:22 ships a `node` user at UID 1000 — remove it so `vibe` gets 1000
# (matches the default host user, keeps bind-mount ownership sane).
# Single-user container: hand the npm global tree to `vibe` so the in-app
# Update/Install buttons (`npm i -g …`, `claude update`) work without root —
# root-owned /usr/local is why plain `npm i -g` EACCESes for non-root users.
RUN userdel -r node 2>/dev/null || true; \
    useradd -m -u 1000 -s /bin/bash vibe; \
    chown -R vibe:vibe /usr/local/lib/node_modules /usr/local/bin

# Bake the app into the SEED location as a REAL git checkout (public repo), so
# the entrypoint's copy into the PVC is a working checkout — users can then
# ⚙ → Update (git pull) and fork/modify (the pets model). A plain `COPY . .`
# would drop .git (.dockerignore) and break self-update. npm ci + build here so
# first boot is a fast offline copy, not a network clone.
ARG VIBESPACE_REF=master
# reset --hard (not checkout): a SHA ref must NOT leave the seed on a detached
# HEAD — the PVC copy inherits it and `git pull` self-update breaks.
RUN git clone https://github.com/ProblemFactory/vibespace /opt/vibespace-dist \
    && cd /opt/vibespace-dist \
    && git reset --hard "$VIBESPACE_REF" \
    && npm ci \
    && npm run build \
    && chown -R vibe:vibe /opt/vibespace-dist
# NOTE: do NOT `rm -rf data` — data/bin/ holds TRACKED static tools the server
# references (pty-wrapper.js, chat-wrapper.js, vibespace-*). A fresh clone's
# data/ contains only those (runtime state is gitignored), so keep it.

COPY deploy/docker/entrypoint.sh /usr/local/bin/vibespace-entrypoint
RUN chmod +x /usr/local/bin/vibespace-entrypoint

USER vibe
# ~/.local/bin on PATH: claude's native installer (the onboarding Install
# button) lands there — on the PVC, so a user-installed CLI survives image
# rebuilds. The dir may not exist yet; PATH entries may dangle harmlessly.
ENV HOME=/home/vibe \
    PATH=/home/vibe/.local/bin:$PATH \
    NO_AUTO_UPDATE=1 \
    VIBESPACE_GENERATE_PASSWORD=1 \
    PORT=3456 \
    HOST=0.0.0.0
WORKDIR /home/vibe
EXPOSE 3456
ENTRYPOINT ["/usr/local/bin/vibespace-entrypoint"]

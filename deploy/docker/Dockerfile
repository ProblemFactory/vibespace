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
# tini = pid 1 (see ENTRYPOINT below): a real init that REAPS every orphan.
RUN apt-get update && apt-get install -y --no-install-recommends \
      dtach procps psmisc zip unzip tar git curl ca-certificates \
      python3 make g++ fontconfig openssh-client rclone fuse3 sudo ceph-common kmod \
      tini \
    && rm -rf /var/lib/apt/lists/*

# In-container desktop (noVNC through VibeSpace's own auth — src/vnc.js):
# TigerVNC bound to localhost + XFCE + Chromium. Started LAZILY by the server
# on the first desktop window; nothing runs for users who never open one.
# xpra is the FIRST rung of the desktop-app ladder (docs/design-desktop-apps §3): the package is present so the
# ladder picks it, nothing is enabled or started here — the keeper starts one per app session.
# D7 (docs/design-desktop-apps-seamless §5, owner 2026-09-25): xpra comes from xpra.org's bookworm repository,
# PINNED to 6.x — ONE protocol version fleet-wide, the one the rung was built and measured on (6.5.3); bookworm's own
# 3.1.3 (its html5 protocol never measured — the old §9-1 / §9-4) is no longer installed. The same source + pin the
# in-product install rung writes on a paired Linux box (src/desktop-apps.js xpraInstallPlan). xpra-x11 (the X11 server
# half) and xpra-html5 (the hosted client's worker) are RECOMMENDS of xpra-server there — named, since this image
# installs with --no-install-recommends. So is python3-setproctitle: with it xpra rewrites its own process title and
# environ (xpra/util/system.py) — the shape the rung was measured on; without it (3.6.0-rc1) the environ stays as spawned.
# xterm is the default registry's first row (presence-checked, never assumed).
# xdotool + wmctrl (P8-2 x4, design §7 / §9-8): the vnc-display rung's APP-FIT step
# moves/resizes the app's window to the framebuffer through xdotool (measured on
# the dev box's Xtigervnc 1.15 + xdotool 3.2016), and asks xfwm4 — present here —
# to maximise the app's CLIENT window (never the WM frame) through wmctrl; without
# them the keeper records the refusal by name and the app is shown where X put it.
# The WM path was MEASURED 2026-09-22 with this image's own xfwm4 4.18 against a
# scratch X (§9-8): the frame becomes exactly the framebuffer.
# xvfb (2026-09-30, a fleet user's Google sign-in refused as "this browser may
# not be secure"): the agent browser's hidden-window rung (src/browser-display.js)
# lets agent-browser start its OWN invisible Xvfb for a headed launch, so the
# browser reports a normal `Chrome/<major>` UA instead of `HeadlessChrome/…`;
# without the binary every fleet pod falls to the headless rung, which sign-in
# pages read as automation. at-spi2-core + gir1.2-atspi-2.0 + python3-gi: the
# window-target TREE (src/window-targets-helper.py reads libatspi through
# GObject introspection) — without them every shared window is pixels-only;
# xdotool above is the window-target INPUT rung (XTest) as well as the app-fit.
# x11vnc (3.6.0): the vnc-display rung's second recipe, Xvfb + x11vnc
# (src/desktop-apps.js `needs`), beside Xvnc. xclip: the X clipboard the
# server's image paste and the desktop apps' clipboard read and write
# (src/routes/files.js, the xpra clipboard leg). ffmpeg: the pixels of a
# shared window (x11grab, src/window-desktop.js captureVerdict refuses
# `capture_unavailable` without it).
RUN install -d -m 0755 /usr/share/keyrings \
    && curl -fsSL https://xpra.org/xpra.asc -o /usr/share/keyrings/xpra.asc \
    && printf '%s\n' 'Types: deb' 'URIs: https://xpra.org' 'Suites: bookworm' 'Components: main' 'Signed-By: /usr/share/keyrings/xpra.asc' > /etc/apt/sources.list.d/xpra.sources \
    && printf '%s\n' 'Package: xpra*' 'Pin: version 6.*' 'Pin-Priority: 1001' > /etc/apt/preferences.d/xpra-vibespace
RUN apt-get update && apt-get install -y --no-install-recommends \
      tigervnc-standalone-server dbus-x11 xfce4-session xfwm4 xfce4-panel \
      xfdesktop4 xfce4-terminal thunar chromium xterm xdotool wmctrl \
      xpra xpra-x11 xpra-html5 python3-setproctitle \
      xvfb at-spi2-core gir1.2-atspi-2.0 python3-gi \
      x11vnc xclip ffmpeg \
      fonts-noto-cjk fonts-noto-color-emoji xdg-utils \
      adwaita-icon-theme \
    && rm -rf /var/lib/apt/lists/*
# Chromium in an unprivileged container: the setuid/user-namespace sandbox is
# unavailable (couldn't launch at all) and /dev/shm is tiny. Acceptable for a
# single-user container. Debian chromium sources /etc/chromium.d/*.
RUN mkdir -p /etc/chromium.d && printf '%s\n' 'export CHROMIUM_FLAGS="$CHROMIUM_FLAGS --no-sandbox --disable-dev-shm-usage"' > /etc/chromium.d/99-container
# Curated XFCE defaults (system-wide, read from /etc/xdg when the user has no
# config yet — i.e. a fresh desktop). Fixes two stock-panel bugs on first boot:
# (1) the default panel ships an EMPTY 4th launcher — a "Settings" button with
# no command that does nothing when clicked (real report); we point it at
# xfce4-settings-manager. (2) the Terminal/File Manager launchers use
# `exo-open --launch <Category>` which silently no-ops with no preferred app
# registered — helpers.rc sets all three (Terminal/Files/Browser).
# The panel launchers bind DIRECTLY to their apps (xfce4-terminal / thunar /
# chromium / xfce4-settings-manager) instead of `exo-open --launch <Category>`
# — the exo indirection silently no-ops without a registered preferred app and
# was a recurring "the button does nothing" source (user directive: bind the
# browser straight to chromium).
COPY deploy/docker/xfce/xfconf/xfce-perchannel-xml/xfce4-panel.xml /etc/xdg/xfce4/xfconf/xfce-perchannel-xml/xfce4-panel.xml
COPY deploy/docker/xfce/panel/ /etc/xdg/xfce4/panel/
COPY deploy/docker/xfce/helpers.rc /etc/xdg/xfce4/helpers.rc
# fuse mounts as the non-root user: fusermount3 must be SETUID ROOT — the
# standard desktop-Linux mechanism. In-container capability grants don't
# survive a non-root execve (CapEff stays 0), so setuid is the only reliable
# path (pod still needs the /dev/fuse device + default allowPrivilegeEscalation).
# fusermount also wants /etc/mtab.
RUN chmod u+s /usr/bin/fusermount3 && ln -sf /proc/self/mounts /etc/mtab

# Agent CLIs + mc (share-credential minting). bypassPermissions is blocked for
# root → the app runs as the non-root `vibe` user below.
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
# Pinned rclone 1.65.2 at /usr/local/bin (shadows Debian's 1.60): old rclone
# signs the Accept-Encoding header into V4 signatures — Cloudflare-fronted S3
# (R2!) rewrites it and every object GET 403s; the counter-flag needs >=1.63.
RUN curl -fsSL https://downloads.rclone.org/v1.65.2/rclone-v1.65.2-linux-amd64.zip -o /tmp/rc.zip \
    && unzip -j /tmp/rc.zip -d /usr/local/bin '*/rclone' && chmod +x /usr/local/bin/rclone && rm /tmp/rc.zip
RUN npm install -g @anthropic-ai/claude-code @openai/codex
# agent-browser = the engine the agent's browser runs on (data/bin/vibespace-browser
# drives it). PINNED to the version src/browser-verbs.js measured its verb and
# flag tables on (TABLE_VERSION); the build fails by name if npm hands back
# anything else. Baked here so every pod has it — a copy a user installed into
# /usr/local is wiped by the next roll. Its postinstall points
# /usr/local/bin/agent-browser at the native binary; nothing is downloaded at
# runtime: with no ~/.agent-browser/browsers it launches the Debian chromium
# installed above (in the CDP census).
RUN npm install -g agent-browser@0.38.1 \
    && test "$(agent-browser --version)" = "agent-browser 0.38.1"

# node:22 ships a `node` user at UID 1000 — remove it so `vibe` gets 1000
# (matches the default host user, keeps bind-mount ownership sane).
# Single-user container: hand the npm global tree to `vibe` so the in-app
# Update/Install buttons (`npm i -g …`, `claude update`) work without root —
# root-owned /usr/local is why plain `npm i -g` EACCESes for non-root users.
RUN userdel -r node 2>/dev/null || true; \
    useradd -m -u 1000 -s /bin/bash vibe; \
    chown -R vibe:vibe /usr/local/lib/node_modules /usr/local/bin
# The instance user OWNS their container: passwordless sudo (user request —
# in-terminal apt installs etc.). The rootfs is EPHEMERAL — persistent setup
# belongs in ~/.vibespace-init.sh (re-run each boot), now with sudo available.
# Root stays confined to the pod's namespaces/securityContext; the app itself
# still runs as vibe (Claude blocks bypassPermissions as root).
RUN echo 'vibe ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/vibe && chmod 0440 /etc/sudoers.d/vibe

# Bake the app into the SEED location as a REAL git checkout (public repo), so
# the entrypoint's copy into the PVC is a working checkout — users can then
# ⚙ → Update (git pull) and fork/modify (the pets model). A plain `COPY . .`
# would drop .git (.dockerignore) and break self-update. npm ci + build here so
# first boot is a fast offline copy, not a network clone.
ARG VIBESPACE_REF=master
# reset --hard (not checkout): a SHA ref must NOT leave the seed on a detached
# HEAD — the PVC copy inherits it and `git pull` self-update breaks.
# THE SEED IS CLEAN BY ASSERTION (lane cluster-presets P6): the build's own
# tracked rewrites (package-lock.json under an npm that reformats it,
# src/agentd/version.js stamped by build:agentd — THE SAME LIST as
# src/server/auto-update.js BUILD_REWRITTEN_TRACKED and scripts/update.sh) go
# back to the commit's, then `git status --porcelain` must be EMPTY or the
# image build fails naming the file: a fresh pod's first bare
# `git pull --ff-only` must never meet a modified tree. A tracked file a build
# rewrites is a bug to name (add it to the three lists), never to tolerate.
RUN git clone https://github.com/ProblemFactory/vibespace /opt/vibespace-dist \
    && cd /opt/vibespace-dist \
    && git reset --hard "$VIBESPACE_REF" \
    && npm ci \
    && npm run build \
    && git checkout HEAD -- package-lock.json \
    && git checkout HEAD -- src/agentd/version.js \
    && dirty="$(git status --porcelain)" \
    && if [ -n "$dirty" ]; then echo "the seed checkout is DIRTY after the build (a tracked file a build rewrites, or an unignored build output):" >&2; echo "$dirty" >&2; exit 1; fi \
    && chown -R vibe:vibe /opt/vibespace-dist
# NOTE: do NOT `rm -rf data` — data/bin/ holds TRACKED static tools the server
# references (pty-wrapper.js, chat-wrapper.js, vibespace-*). A fresh clone's
# data/ contains only those (runtime state is gitignored), so keep it.

COPY deploy/docker/entrypoint.sh /usr/local/bin/vibespace-entrypoint
COPY deploy/docker/boot-root.sh /usr/local/bin/vibespace-boot
RUN chmod +x /usr/local/bin/vibespace-entrypoint /usr/local/bin/vibespace-boot

# Container starts as ROOT for one purpose: the boot wrapper renames `vibe`
# to the instance name (guarded — only when the PVC is mounted at the new
# home) then drops to that user via runuser. The app never runs as root.
USER root
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
# pid 1 = tini (3.6.0): every detached process the product starts (dtach
# masters, agent-browser daemons and their Chrome, xpra, Xvfb, install
# runners) is reparented to pid 1 when its parent dies. `runuser` as pid 1
# never reaped them — they stayed zombies until the pod restarted (thousands
# per pod), and a zombie reads ALIVE to `kill -0` and `tail --pid`, so a
# wait on one never ended. tini reaps every orphan and forwards SIGTERM to
# the boot wrapper (runuser passes it on to the supervised entrypoint).
ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/vibespace-boot"]

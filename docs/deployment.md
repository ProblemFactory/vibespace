# Deployment

How to run VibeSpace for a team: password auth + Docker.

## Password authentication

Auth is **off by default** (local single-user use). Enable it by giving the server a password — everything (pages, APIs, WebSockets, the embedded browser proxy) then requires login.

**Ways to set the password:**

| Method | How |
|--------|-----|
| Environment variable | `VIBESPACE_PASSWORD=yourpassword node server.js` |
| Auto-generate (containers) | `VIBESPACE_GENERATE_PASSWORD=1` — first boot generates a random password, prints it to the log, persists it |
| Persisted state | Once set, the scrypt hash lives in `data/auth.json` — the env var is only needed to *change* it |

**Behavior:**
- Login sessions are HttpOnly cookies backed by server-side tokens (`data/auth.json`), valid 180 days, surviving server restarts.
- Failed logins are rate-limited per IP (5 wrong → 60s lock).
- Unauthenticated WebSocket upgrades are rejected; browser tabs whose token expires bounce to `/login` automatically.
- Sign out from the toolbar ⚙ menu (revokes the token server-side).
- Changing `VIBESPACE_PASSWORD` re-hashes at boot; existing login tokens stay valid. Delete `data/auth.json` to reset everything (including disabling auth if no env var is set).

> This is a single shared-password model (one workspace = one team). Per-user accounts are part of the collaboration roadmap — see [design-collaboration.md](design-collaboration.md).

**Reverse proxy note:** run behind HTTPS (nginx/caddy) for anything non-localhost. The cookie sets `Secure` automatically when the request arrives as HTTPS (`X-Forwarded-Proto: https` respected).

## Docker

```bash
docker compose up -d
docker compose logs | grep password    # the generated workspace password
```

Or manually:

```bash
docker build -t vibespace .
docker run -d -p 3456:3456 \
  -v vibespace-data:/app/data \
  -v vibespace-claude:/home/vibe/.claude \
  -v /path/to/projects:/workspace \
  --name vibespace vibespace
```

**One-time Claude login inside the container** (credentials persist in the `vibespace-claude` volume):

```bash
docker exec -it vibespace claude    # then /login in the TUI, exit after
```

**Volumes:**

| Mount | Contents |
|-------|----------|
| `/app/data` | Layouts, settings, session metadata/buffers, auth state |
| `/home/vibe/.claude` | Claude credentials + conversation transcripts |
| `/workspace` (convention) | Your projects — bind-mount local dirs, NFS, or an rclone/JuiceFS mount |

**Notes:**
- The container runs as non-root user `vibe` (uid 1000) — required because Claude blocks `bypassPermissions` for root, and it keeps bind-mount ownership sane.
- Auto-update is disabled in the container (`NO_AUTO_UPDATE=1`); update by rebuilding the image.
- Codex CLI isn't bundled; add `RUN npm install -g @openai/codex` to the Dockerfile if you need Codex sessions.
- Clipboard image paste requires an X display and is unavailable in the container.

## Bare-metal team server

The non-Docker equivalent:

```bash
git clone https://github.com/ProblemFactory/vibespace && cd vibespace
npm install && npm run build
VIBESPACE_PASSWORD=yourpassword PORT=3456 node server.js
```

Put nginx/caddy with TLS in front, point teammates at the URL, share the password.

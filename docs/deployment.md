# Deployment

How to run VibeSpace for a team: password auth + Docker.

## Password authentication

Auth is **off by default** (local single-user use). Enable it by giving the server a password — everything (pages, APIs, WebSockets, the embedded browser proxy) then requires login.

**Ways to set the password:**

| Method | How |
|--------|-----|
| In the app | ⚙ menu → **Set password…** (or the onboarding wizard's "Protect this workspace" step, which can also generate a random one) |
| Environment variable | `VIBESPACE_PASSWORD=yourpassword node server.js` |
| Auto-generate (containers) | `VIBESPACE_GENERATE_PASSWORD=1` — first boot generates a random password, prints it to the log, persists it |
| Persisted state | Once set, the scrypt hash lives in `data/auth.json` |

**Behavior:**
- Login sessions are HttpOnly cookies backed by server-side tokens (`data/auth.json`), valid 180 days, surviving server restarts.
- Failed logins are rate-limited per IP (5 wrong → 60s lock). The set-password endpoint is rate-limited the same way.
- Unauthenticated WebSocket upgrades are rejected; browser tabs whose token expires bounce to `/login` automatically.
- Sign out from the toolbar ⚙ menu (revokes the token server-side).
- **Changing (or setting) the password in-app logs out every other device** — only the browser that made the change keeps a fresh token. Changing it requires the current password; removing it (⚙ → Change password… → Remove) disables auth entirely.
- **Precedence:** a password set (or removed) in-app is marked user-set and always wins — `VIBESPACE_PASSWORD` / `VIBESPACE_GENERATE_PASSWORD` only apply while the state was never touched from inside the app. Delete `data/auth.json` to reset everything.

## Config export / import

⚙ menu → **Backup & migrate…** (Export tab) produces a single JSON file for backup or migration to another instance (e.g. a freshly provisioned container — the onboarding wizard has an "Import a config file" entry). Pick what to include:

| Section | Contents |
|---------|----------|
| Settings | every customized option, incl. the Customize-UI arrangement/springs/alignment |
| Custom themes | theme editor creations |
| Layouts & desktops | window layouts, virtual desktops, custom grid presets |
| Session metadata | stars, renames, groups, per-session model/effort/permission configs |
| File bookmarks | file-explorer bookmarks |
| Browser preferences | theme choice, terminal font, taskbar height (this browser's localStorage) |

**Sensitive items are opt-in and always encrypted** (AES-256-GCM under a passphrase you type at export; the file only reveals *which* sensitive items it contains, not their contents):
- *VibeSpace password* — the scrypt hash; after import the same password logs in (and all other devices are logged out).
- *Claude / Codex CLI credentials* — `~/.claude/.credentials.json` / `~/.codex/auth.json`; the imported instance needs no re-login. Treat a file containing these like an SSH key.
- *Remote hosts* — ssh host records plus any private keys you uploaded in-app (re-keyed under the new instance).
- *Mounts & shares* — mount definitions with their credentials (any type — S3 / Google Drive / WebDAV / SFTP / VibeSpace↔VibeSpace; decrypted from the instance-local key and re-encrypted under your passphrase). S3 share minting is the S3-specific part.

**Import** (⚙ → Backup & migrate… → Import tab, or the wizard) shows what the file contains with per-section checkboxes — each selected section *replaces* the corresponding data; sensitive items ask for the passphrase. The page reloads after import. Login tokens are never exported.

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

**One-time Claude login** (credentials persist in the `vibespace-claude` volume) — either in-product: ⚙ menu → **Log in to Claude** (opens a terminal window with the CLI started; follow its login flow), or from the host:

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

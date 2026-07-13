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
| Task Groups | 岗位 definitions — objective, backlogs, activity logs, linked folders, context-dir config (dormant legacy checklists carried through) |
| Usage pricing table | per-model rates + per-account discounts from the Usage window's Pricing editor |
| Browser preferences | theme choice, terminal font, language, usage-view account choices (this browser's localStorage) |

**Sensitive items are opt-in and always encrypted** (AES-256-GCM under a passphrase you type at export; the file only reveals *which* sensitive items it contains, not their contents):
- *VibeSpace password* — the scrypt hash; after import the same password logs in (and all other devices are logged out).
- *Claude / Codex CLI credentials* — `~/.claude/.credentials.json` / `~/.codex/auth.json`; the imported instance needs no re-login. Treat a file containing these like an SSH key.
- *Remote hosts* — ssh host records plus any private keys you uploaded in-app (re-keyed under the new instance).
- *Mounts & shares* — mount definitions with their credentials (any type — S3 / Google Drive / WebDAV / SFTP / VibeSpace↔VibeSpace; decrypted from the instance-local key and re-encrypted under your passphrase). S3 share minting is the S3-specific part.
- *Billing accounts* — the multi-account roster: API keys plus each subscription's login credentials (Claude creds dirs / Codex account homes). On import the keys are re-encrypted under the new instance's own store key, the credential dirs are recreated with tight permissions, and the imported subscriptions are immediately logged in — no re-login per account.

**Import** (⚙ → Backup & migrate… → Import tab, or the wizard) shows what the file contains with per-section checkboxes — each selected section *replaces* the corresponding data (billing accounts merge: existing account ids are never overwritten); sensitive items ask for the passphrase. The page reloads after import. Login tokens are never exported.

**Not in the config file** (by design): the per-request usage **ledger** (`data/usage-history/` — can be tens of MB; copy that directory during migration if you want to keep usage analytics history), session status chips and the For-you inbox (runtime state that decays), and regenerable caches. Live sessions don't migrate either — transcripts live in `~/.claude` / `~/.codex`, so move those separately if the new deployment should see old conversations.

> This is a single shared-password model (one workspace = one team). Per-user accounts are part of the collaboration roadmap — see [design-collaboration.md](design-collaboration.md).

**Reverse proxy note:** run behind HTTPS (nginx/caddy) for anything non-localhost. The cookie sets `Secure` automatically when the request arrives as HTTPS (`X-Forwarded-Proto: https` respected).

## systemd user service (bare-metal Linux)

For a persistent bare-metal install, run VibeSpace as a systemd *user* service —
it runs as your user (the server spawns agent CLIs and reads `~/.claude`), needs
no root, restarts on crash/OOM, and logs to journald:

```bash
./scripts/install-service.sh        # install + enable + start (also enables lingering)
systemctl --user status vibespace
systemctl --user restart vibespace  # after every `npm run build`
journalctl --user -u vibespace -f
./scripts/install-service.sh --uninstall
```

The unit intentionally does not build; build at deploy time and restart. Running
agent sessions survive restarts (dtach owns them, not the server process).

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

# KB: Features reference

Moved VERBATIM out of CLAUDE.md (tier-2 pass).

## Features Summary

### Deployment & Onboarding
- Optional password auth: VIBESPACE_PASSWORD env or data/auth.json; guards pages/APIs/WS/proxy; login tokens survive restarts; Sign out in ⚙ menu; 401 → auto-bounce to /login. Docker: Dockerfile+compose, non-root `vibe` (Claude blocks bypassPermissions as root), random first-boot password printed to logs, rclone+fuse3 preinstalled. docs/deployment.md.
- **Kubernetes deployment (one instance per user)**: reusable, environment-agnostic — `deploy/README.md` + `deploy/docker/` (thin-base PETS image: VibeSpace lives in the per-user PVC `~/vibespace`, self-updating via git, NOT baked into the image, so users can fork/customize; `~/.vibespace-init.sh` boot hook for persistent env) + `deploy/helm/vibespace-user/` (one Helm release = one user, all-placeholder values). NO hostname env var (VibeSpace is origin-relative — only per-instance env is `VIBESPACE_PASSWORD`). Planned desktop = integrated noVNC through VibeSpace's OWN cookie auth (localhost-only VNC server + `/api/vnc` WS bridge + a `desktop` window type — single login). **Keep this repo environment-agnostic** — real cluster/domain/storage specifics (IPs, issuers, node selectors, runbooks) live in a PRIVATE deploy dir, never here.
- First-run onboarding wizard: 4 steps (intro + LANGUAGE CHIPS (2.102.0: auto/en/zh/ja, setLang reloads and the wizard re-enters in the picked language since vs-onboarded isn't set yet) → backend status via /api/backend-status + one-click in-product login + one-click INSTALL when a CLI is missing + **'Accounts & pool…' door (2.267.4, user request): Manage Agents opens as a MODAL above the wizard (_showAgentsDialog({forceModal,onClose}) — forceModal skips the rail-panel redirect that would open BEHIND the wizard; onClose refreshes the cards) so named accounts/pools are addable WITHOUT the machine-wide login, which named/pooled presence marks ✓ ready** (claude = native installer curl claude.ai/install.sh, user-local; codex = npm i -g; same buttons in Manage Agents via BACKENDS[].installCmd) → protect-with-password [set / generate random / skip, + import-config entry; when auth already enabled shows Change password… → _showPasswordDialog, the claim-your-managed-instance path] → first session). Re-run via ⚙ → Welcome tour. Deploy image note: npm global tree is chown'd to vibe + ~/.local/bin on PATH, else in-container npm i -g/claude update EACCES. CRITICAL: #welcome sits at z-index 1 — the `.onboarding` class elevates it to a fixed z-9600 overlay, otherwise windows cover it (looked like a no-op).
- **In-app password management** (`/api/auth/set-password`, gs-menu → Set/Change password…): set (auth off → on, no current needed), change (current required, rate-limited like login), remove (disables auth). Setting/changing REVOKES ALL other tokens — only the caller gets a fresh cookie. `userSet` flag in auth.json: a password set OR removed in-app always wins over `VIBESPACE_PASSWORD`/`VIBESPACE_GENERATE_PASSWORD` at boot (`ensurePassword` returns early). `app.locals.authEnabled` is a GETTER (auth can toggle at runtime).
- **Config export/import** (routes in persistence.js, needs `auth` in setup context): file format `{app:'vibespace-config', version, sections:{settings,customThemes,layouts,userState,bookmarks,tasks,pricing,clientPrefs}, sensitive?:{manifest,[aes-256-gcm fields]}}`. Non-sensitive = plaintext; sensitive (vsPassword record, ~/.claude/.credentials.json, ~/.codex/auth.json, hosts+ssh keys, mounts+secrets, **accounts** 2.100.0) opt-in + encrypted (scrypt KDF + AES-256-GCM); the MANIFEST sits outside the ciphertext so the import dialog can list contents without the passphrase. Login tokens never exported. **accounts bundle (2.100.0, verified e2e on an isolated instance):** AccountManager.exportBundle decrypts API keys out of the machine-local .accounts-key store (plaintext ONLY inside the passphrase blob; the key file never travels) + whitelisted sub-dir files (.credentials.json/.claude.json | auth.json); importBundle re-encrypts under the TARGET's own key, recreates dirs 0700/files 0600 + codex symlinks, never clobbers existing ids, defaults only-if-unset. GOTCHA CLASS: a new export section needs FOUR touch points — server take()/apply(), export-info, the export dialog row, AND the import dialog's SEC_LABELS/SENS_LABELS (unknown sections are SKIPPED on import — tasks was silently unexportable for months because only the server side existed). clientPrefs gather + import write-back share ONE key list (CLIENT_PREF_KEYS, app.js). The usage LEDGER (data/usage-history/, tens of MB) is deliberately NOT in the file — migrate it by copying the directory. Import: each section REPLACES its store (write* helpers broadcast); clientPrefs echoed back for the client to write localStorage; importing vsPassword revokes all tokens + sets a fresh cookie for the caller; creds files written mode 600. userState count fields are `starredSessions/customNames/sessionGroups/...` (NOT starred/named/groups). Client reloads the page after import. Verified e2e on an isolated instance (fake HOME) — incl. wrong-passphrase rejection, env-precedence, round-trip login with the imported password.
- Plain shell terminals (backend 'shell'): toolbar Terminal button, file-explorer "Open Terminal Here"; in-product CLI login = shell terminal with the command auto-typed (createSession({initialCommand})). Spawn env sets `PROMPT_EOL_MARK=''` — zsh's inverse-video `%` EOL mark is emitted at startup for an unknown-width PTY and strands as an artifact when the buffer replays at the client's different width.
- Manage Agents dialog (⚙ → Manage agents…): per-backend install/version/login status from /api/backend-status + Log in / Update (claude update, npm -g for codex) / Re-check — all actions run visibly in a shell terminal window. **PERSISTENT installs are the default (2.229.0, userW rollback incident: a container rebuild silently reverted an updated npm-global claude — and the `opus` alias from opus-5 back to 4.8, since aliases resolve against the registry EMBEDDED in the binary):** /api/backend-status classifies `install: {binPath, userLocal}` (realpath under $HOME = rebuild-proof + wins PATH); a system-location claude gets an amber warning row + one-click 'Install persistent copy' (native installer → ~/.local); deploy/docker/entrypoint.sh background-installs the native user-local copy at boot when the PVC lacks one (offline skips harmlessly; VIBESPACE_NO_CLI_MIGRATE=1 opts out). Install ≠ immediate effect: CLAUDE_CMD is resolveCmd'd at server BOOT, so the persistent copy takes over for new spawns at the next server restart. **Agent instructions (2.87.0; per-hook split 2.88.0)**: THREE fields writing `agents.injectPreamble` (session context — `<vibespace-user-instructions>` block at the TOP of hook deliveries, `withPreamble()` sha-gated per session `_preambleSeen`, once per session + re-delivery on edit, ≤4000) / `agents.perTurnExtra` (rides at the very top of EVERY prompt-context response — unshifted as its own `<vibespace-reminder>` block on big-delivery turns, inside the standard reminder otherwise, delivers even with perTurnToolReminder off, ≤500) / `agents.stopNudgeExtra` (prepended to the stop-check block reason, ≤500; `customExtra()` in server.js).
- **Manage Agents usage readout — every donut carries its OWN reset countdown (2026-09-14, owner: 把每个进度条的刷新时间都展示出来, 同时不能让画面太挤):** each account row's 5h / 7d / model-scoped donut is a column with ONE compact token under it — `65m` under 2 h, `15h` for 2–72 h, `3d` from 72 h (rounded inside the band; PURE src/lib/usage-eta.js, the clock an argument), ≈8px tabular, coloured by that bucket's pressure from 80 % up (yellow / red) and text-secondary below. A label appears ONLY for a bucket that may name a deadline: an `empty` window (0 % with a reset one full window out — its reset slides with the clock, B-8b12) or a missing/passed reset shows no label, and the column keeps its 33px min-height so rows stay aligned. The former row-level "tightest bucket" countdown under the data age is GONE (the age cell is one line again, its 6.5ch min-width kept so the right-anchored donut columns stay aligned across rows), the ≤340px pill shows the tightest bucket's percentage + its compact eta (`Fa 96% · 3d`), the Machines-tab host pill carries the same token, and every tooltip keeps the full "resets in …". Measured in headless chrome: usage rows 30 → 41px (exactly the label + its gap), the 2.245.2 cluster alignment spread 0px, the phone modal at 375×667 unchanged in layout. Gates: test-usage-eta (fast, the band table with an injected clock + the B-8b12 refusal) and test-roster-reset-eta (heavy, chrome).
- **Manage Agents roster — ONE full-precision "next reset" countdown per account + the two soonest rows highlighted (2026-09-15, owner: 写成 2d21h38m 的形式, 一眼扫过去就能知道哪个账号马上要可用了, 把即将刷新的两个账号 highlight 一下):** every account row gets one `2d21h38m` / `21h38m` / `38m` label (whole minutes, leading zero units dropped, inner zeros kept — the taskbar popup's own spelling) after the age cell, right-anchored at a fixed min-width so it reads as a column; PURE `accountResetEta` picks the instant — a BLOCKED account (a bucket at/over the pool's hard bar) counts to the LATEST reset among its spent buckets (that is when it becomes usable; the tooltip says "usable again in … — 7d is spent"), a free one to the EARLIEST upcoming reset — and only a bucket that may name a deadline counts (B-8b12). The two rows of each list with the smallest countdown carry `.usage-acct-soon` (green tint + inset bar, theme vars); the ≤340px pill keeps the label in its tooltip; a 30 s tick re-spells the labels from their stamped instants while the surface is open (no fetch, torn down when it leaves the document). The per-donut compact tokens are unchanged. Gates: test-usage-eta §5/§6 (fast) + test-roster-reset-eta §1b (heavy, chrome: five members, the blocked one counts to its spent bucket, the injected-clock tick).
- **Manage Agents roster — stored reset credits and a "Use…" button (2.369.157, docs/design-reset-credits.zh.md §5, p2).** A ChatGPT row (and the machine's codex login) whose stored reset-credit count is known and > 0 shows `· N reset credits` beside its name and a compact **Use…** button; the count follows the usage poll (it comes from the on-demand limits read, the Codex ⟳). Use… opens ONE confirm dialog — the account, what the credit does (a NEW window from now until t + one period; the reset it replaces), the wait it saves (only when the account is at its limit; otherwise the share of the current window it discards), and the credits left after — and Confirm spends exactly one through a running chat session on that account (the vendor call is that session's own CLI; the unattended-spend ceiling and the 10-minute one-try floor apply). A refusal is shown by name with Confirm disabled: no running chat session on the account, no credits, tried in the last 10 minutes (and when that lifts), the spend ceiling, or no interface. Claude rows never get a live button — Claude Code offers only the interactive `/limit-reset`, so a Claude row would show a DISABLED Use… with that reason (only once a passive grant sample exists; none is captured today). The same dialog opens from the chat wall card / auto-resume arm card ("Use a reset credit") and from the `ask` mode's For-you item (its decision resolves the item: Confirm ⇒ done, Not now ⇒ dismissed). The result arrives as a notice either way — a failed attempt says the vendor's answer and never switches accounts or arms a wait by itself.
- **Remote account availability has THREE forms, never just "local creds exist" (2.237.3, third repeat of this class)**: LOCAL (own creds dir) / **LINKED** (the account's email IS the host's own CLI login — needs no local dir and nothing shipped) / **HOST-HELD** (a shipped `~/.vibespace/subs/<id>` dir on the host). The billing switcher + New Session dialog model all three since 2.208.0; Manage-Agents' Test guard did not and refused a linked account as "not signed in". Any new code gating on account usability must handle all three — and NEVER map a linked account onto the CLI-login sentinel CLIENT-side (2.243.1, fifth surface: Manage-Agents Test did, and a machine login ROTATED since the client's cache made 'Test ClaudeLu' show the other account; always send the real id, the server resolves against live host facts). **SIXTH surface was SERVER-side (2.243.2): the email-linked mapping trusts the host's .claude.json config email, which is STALE right after a /login switch (2.114.1 class) — a stale match spawned on the machine's ACTUAL new token while _accountId showed the picked account (badge ClaudeLu, billing the new login). HOST-HELD dir therefore takes precedence over email-linked in BOTH server paths (the dir's creds are the named account deterministically); pure email-linked (no dir) keeps the documented residual until the config self-heals. STRUCTURAL CURE (2.244.0, B-f531): `accounts.evaluateOnHost(a, hostFacts, {allowShip})` is THE single verdict authority — ws-handler's spawn branches AND every display surface (billing switcher / New Session / Manage-Agents roster) consume it (accounts-status + /api/accounts return per-account `verdicts`; client caches `_hostVerdicts` via _warmHostAccountCache, legacy checks = in-flight fallback only); a held dir with a REPORTED mismatched identity (hostSubEmails) is refused loudly; the `created` reply carries `billing:{accountId,how,name}` = post-facto truth the switcher persists from (never the requested intent). Matrix test: scripts/test-account-verdicts.mjs (45 asserts). NEVER add a new surface that computes its own linked/held/blocked — read verdicts. **macOS Keychain-backed subscriptions (PR #23/2.269.0, Him188): a Darwin server marks its claude subscriptions `localOnly` — evaluateOnHost blocks the SHIP rung with reason `local-only-mac` (held/linked/oat rungs stay usable; !allowShip also reports local-only-mac, never the misleading ship-disabled), resolveForSpawn marks remoteCreds `shippable:false`, config-export ships only .claude.json for them, and mergeSubscription/host auto-merge refuse (the Keychain service hash includes the dir path — renaming a dir orphans its item). Add-subscription runs through data/bin/vibespace-claude-subscription-login.mjs (see the /api/accounts bullet); the on-host login watcher matches the helper's exact `.vibespace-login-status.json` attempt id.** A LINKED pick spawns with the `'subscription'` CLI-login sentinel (zero creds ship, §ban-safety unaffected). **EXCEPT the billing SWITCHER since 2.241.0: it sends the REAL account id** — the server's email-linked create-rescue (ws-handler) maps it onto the host's own login (still zero creds ship) while recording `session._accountId` via `linkedAccountId`, so the badge/✓ keep the picked account's name instead of degrading to "CLI login @ host" (a successful switch READ as failed — userN's sixth incident). Related 2.241.0 rootfix: `resumeSession`'s "already open in a live window" focus-shortcut now skips read-only views AND an `excludeWebuiId` the caller just killed — on a loop-blocked instance the stale `_allSessions` still carried the killed webuiId and the switch's auto-resume was silently swallowed (window stranded on terminated; incident ws ring: kill → exited → create never sent).
- **Anthropic account switching (2.43.0, subscription ↔ API per session)**: the CLI's `/login` is MUTUALLY EXCLUSIVE — a Console login wipes `.credentials.json` to `{}` and mints an API key into `~/.claude.json` `primaryApiKey` (auth = x-api-key; the key's tail-8 lands in `customApiKeyResponses.approved`, the CLI's trust list). VibeSpace keeps API keys in its OWN store (`src/accounts.js`) and injects `ANTHROPIC_API_KEY` into the session's spawn env — the key rides pty.spawn's env option → dtach → wrapper `env: process.env` → CLI (VERIFIED via /proc: env has key, argv zero leaks; both wrappers pass process.env through). No account → the var is explicitly stripped (CLI uses its global login). **REMOTE hosts supported (2.44.0)**: the key ships over **ssh STDIN** into `~/.vibespace/<acctId>.key` (0600) on the host and the spawn command references it via a **shell prefix assignment** `ANTHROPIC_API_KEY="$(cat …)" exec env …` — the VALUE never enters any argv on either machine (an `env KEY=$(cat …)` ARGUMENT would expand into env's argv — don't regress this; verified on the devbox via /proc both sides). Key-write failure aborts the create (never silently bill the wrong account); account delete best-effort rm's the file on all hosts. Codex n/a. UI: Manage Agents "Anthropic accounts" section (status/add/import/rename/delete/default/Test) + **"Set up both…" wizard** (state machine: Console login FIRST → auto-capture key via a 3s poll watcher → subscription re-login; login steps open a terminal, the watcher reopens the wizard at the next step; MENU ENTRY RETIRED 2.268.3 — pooling/named accounts obsoleted the dual-login dance; _showAccountsWizard survives for internal callers only); Account row in New Session dialog (`#input-account`; since 2.208.0 remote hosts list subscription accounts with the SWITCHER's semantics — email-LINKED to the host's own login / host-HELD login dir = usable with zero creds shipped (suffix says which), ship-opt-in otherwise, unusable ones render disabled with "not logged in on {host}"; hiding them was step 2 of userN's bootloop chain: it forced create-with-defaults-then-switch on an empty session) + gear popover (`sessionConfigs.account` → every resume path applies it — **resume with a different account = move a conversation's billing**); amber key badge on API sessions (card `badge-account`; name/tail ride /api/active + active-sessions). `/api/usage` gained `subscriptionSignedOut` + `subscriptionSignedOutCause` (2.266.2): a token-less-but-parseable creds file has TWO causes — 'console' (a Console /login wiped it; `primaryApiKey` in ~/.claude.json) vs 'expired' (the pooling-era case: named/pooled accounts handle every session so the idle machine login's refresh token ages out and the CLI's failed refresh clears the tokens, metadata kept); the popup wording splits on the cause (expiry = benign, named accounts unaffected), cause derived once per creds-file change, never per poll. GOTCHA fixed alongside: 5 `writeSessionMeta` callers rebuilt meta from hardcoded lists and dropped later-added keys (agentToken/taskId/accountId) on id-capture/rename/fork-adopt — all now spread `readSessionMeta()` first. PENDING VERIFICATION: OAuth-logged-in + env-key precedence (untestable until the user re-logins subscription). **Billing identity per session (2.48.0):** `sessionAuth(s)` (server.js) → `auth` on active-sessions/api-active — precedence: env-key spawn (definite) → the CLI's OWN init `apiKeySource` ('none'=subscription, '/login managed key'=console, 'ANTHROPIC_API_KEY'=env; captured live in the chat parse + persisted to meta) → spawn-time global-login guess (`_authAtSpawn`, marked guessed) → unknown. Card badge: amber key on EVERY API-billed session (key or console), dashed '?' on unknown LIVE sessions. **Title-bar badge (2.48.1; ALWAYS-ON identity chip + click-to-switch 2.71.0):** `wm.setAuthBadge(id, auth)` — a SIBLING span right after `titleSpan` (setTitle wipes titleSpan children via textContent, same reason the bell icon re-inserts) + on the `.tab-item` label for grouped windows; keyed no-op guard (`_authBadgeKey`) per broadcast — SELF-HEALING since 2.88.1 (guard verifies the badge element still exists: tab-bar rebuilds destroy it and a pure key guard never re-inserted; _renderTabBar/_detachFromChain also re-apply via the stored `win._authBadge`); wired in `app.syncSessionIdentity` (every active-sessions push). 2.71.0: the badge renders for EVERY billed session (subscription/CLI-login = neutral `.sub` chip with the account name; API = amber key+name; unknown = '?'; sessionAuth covers codex too: codex-subscription/codex-cli) and CLICK opens `app.showBillingSwitcher(winId, anchor)` — menu of the backend's accounts (✓ current from `live.accountId`, threaded through the sidebar merge 2.71.0) → confirm → persists `sessionConfigs.account` → ws kill → `resumeSession(..., {accountId})` 900ms later (same conversation via --resume; a TERMINATED window just resumes on the pick). **2.99.0: showBillingSwitcher also accepts (sessionObject, {x,y})** — the session-card context menu's "Switch billing…" item calls it window-less (phones have no title bars → no badge; works on desktop too); a stopped session's ✓ current = its saved on-resume `sessionConfigs.account`, and winBounds/mode fall back gracefully without a window. **2.99.1 mobile stand-ins for the badge:** a `.chat-status-billing` chip in the chat status bar (ChatStatusBar.setBilling, fed MOBILE-ONLY from syncSessionIdentity via `session.setBillingIdentity` — desktop keeps the title-bar badge) + a `.mobile-win-billing` chip per mobile window-switcher row (reads the auth object setAuthBadge stashes on `win._authBadge`; captures the chip rect BEFORE closing the pop, then menu at {x,y}). **2.240.2 (第四单 — the last link in the four-incident chain):** a LINKED pick in the switcher spawns via the `'subscription'` CLI-login sentinel like every other surface (it was the ONE surface still passing the raw account id, which the server refused as not-logged-in — the pick never reached the create path); server-side belt: the create's account-resolution catch gains an EMAIL-LINKED rescue (account email == the host's machine-login email ⇒ spawn on the host's own login, spawnAccount→null) so stale clients passing raw ids still succeed. Structural fix parked in backlog: ONE shared `evaluateSubOnHost()` for switcher/roster/NewSession/Test — the four-incident chain was this semantic scattered across four implementations. **2.240.0 (第二单实战 inc-msfx2fdt-3rbn — do not regress):** a subscription that NEVER finished signing in (`!loggedIn` and neither linked nor host-held) is disabled in the switcher with the honest reason, local AND remote — offering it fail-lated at spawn ('subscription not logged in') and the doomed pick was already persisted as the on-resume account (FIXED 2.243.0: the pick persists only after the server confirms the spawn — createSession's onCreateResult callback); switch-billing waits for the session's real `exited` event (+400ms flush grace, 15s fallback) before resuming — the old 900ms blind fire raced a ~9s REMOTE teardown into the duplicate-window guard's silent swallow (window died, nothing restarted). **2.239.2 (panic button首个实战产出, inc-msfwgfpd-tlhn):** the switcher's host-held/linked verdicts depended on per-page caches (`_hostSubsKnown`/`_hostOwnUsage`) that only a Manage-Agents visit or usage ⟳ populated — a FRESH page greyed every named subscription as "can't ship" regardless of what the host actually held. `_warmHostAccountCache(hostId)` (session-lifecycle) probes `/api/hosts/:id/accounts-status` once per host per page (kicked at switcher open), fills `_hostSubsKnown` + `_hostOwnEmailKnown` (hostLinked checks it alongside `_hostOwnUsage`), and REBUILDS the open menu in place when the answer lands. Any new consumer of held/linked semantics must either warm this cache or accept the cold-page lie. **2.240.1: the cache has a 2-min TTL (the host's MACHINE LOGIN can change out from under a page — userN /login'd a different account on the host and the stale 'uses the host's own login' label was a wrong-BILLING hazard), and the Manage-Agents roster write-through shares its fresh probe into the SAME store (_hostOwnEmailKnown/_hostSubsKnown/_hostAcctWarmAt) — one fact, one store, freshest write wins.** **2.188.0 remote identity:** sessionAuth attaches `hostName` for any session with `s.host` and maps `_authAtSpawn:'remote-global'` → host's-own-login (never 'unknown' — remote TERMINALS showed "KEY?" forever: apiKeySource is chat-stream-only and the /proc backfill probes the LOCAL ssh wrapper); badge/chip render "CLI login @ \<host\>" + machine-named tooltips; the billing switcher + Session Properties DISABLE (with reason) subscription accounts a remote session can't take (dial: never; ssh: needs the ship opt-in) — offering them was fail-late AND persisted the doomed pick as the on-resume account before the spawn error. NO true hot-swap exists — the account rides spawn env (ANTHROPIC_API_KEY/CLAUDE_SECURESTORAGE_CONFIG_DIR/CODEX_HOME), fixed per process (**2026-08-07 clarification, do not misread this as refuted**: which DIR/KEY a process points at is env and unchangeable from outside — that is this claim; but the CONTENTS of that .credentials.json ARE re-read per client construction, mtime-gated, so a content rewrite lands MID-TURN on the next HTTP request — empirically verified against 2.1.222 with a mock server, and it never touches the token endpoint. Per-session switching is therefore ACHIEVABLE, and 'no hot-swap' must not be read as 'impossible' — the blocker is OUR layout, not the CLI: subDir(id) is addressed BY ACCOUNT, so with today's layout a rewrite silently re-bills every running session of that account. **Why per-session dirs are not a free fix (2026-08-08): the SHARED file is load-bearing synchronization.** Anthropic ROTATES refresh tokens (§9); today every session of an account shares one file and the CLI's own `.storage-write` + `.oauth_refresh.lock` serialize the refresh, so all sessions stay consistent. Give each session its own COPY and each refresh rotates the token out from under the siblings → they fail at THEIR next refresh (random later logouts). And the obvious workaround is DEAD: symlinking a session's `.credentials.json` at the canonical account file does not survive, because the CLI writes credentials through `atomicWrite` = **tmp + rename** (verified in 2.1.222 `Jd`), which REPLACES the symlink with a regular file on the first refresh — the sharing silently degrades to copies exactly when it matters. So a real hot-swap needs per-session dirs PLUS rotation FAN-OUT (watch each live session dir; on a rotation propagate to the canonical account file and to sibling live dirs, under the CLI's locks) plus an attribution boundary in the usage ledger. Any writer of .credentials.json (incl. config-import and accounts.mergeSubscription) must hold the CLI's advisory locks: `<dir>/.oauth_refresh.lock` THEN `<realpath(dir)>.lock` — order is deadlock-critical — with {stale:60000 (never lower), update:5000}, the artifact being a DIRECTORY. Anthropic's own per-process channel CLAUDE_CODE_HOST_CREDS_FILE + CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST injects ONLY token-class env — never CLAUDE_SECURESTORAGE_CONFIG_DIR/CODEX_HOME — so it is not the subscription route; the symlink below is. Full detail + the third-party-copying traps: SharedContext/devices-and-access.md. **SOLVED (2026-08-08, the user's idea, 8/8 proven — scripts/test-creds-symlink-swap.mjs): the session's credential dir is a DIRECTORY SYMLINK to the canonical account dir; swapping = atomically re-pointing it.** A *file*-level symlink dies to atomicWrite (tmp+rename replaces it) — a *directory* one does not, because the rename happens INSIDE the resolved dir. That single distinction makes everything work: refresh writes land in the canonical dir (one credential copy ⇒ the single-refresh-token-holder invariant holds for free, no fan-out), and `join(configDir,'.oauth_refresh.lock')` resolves through the symlink to the SAME real lock a normal session of that account uses ⇒ a pooled session and a normal session of one account are mutually excluded exactly as two normal sessions are today (zero refresh conflict), with the 401-recovery path as the usual backstop. Re-pointing changes the stat'd mtime ⇒ the credential cache invalidates ⇒ the swap is live. Works because `QX()` returns the env STRING (no realpath, no caching), so the kernel re-resolves per syscall. CONSEQUENCE: v1 and v2 are ONE implementation (always spawn through a symlink dir; v1 never re-points, v2 does). LIMITS: Linux only — on macOS credentials go to a keychain whose service name is `sha256(NFC(env string))`, i.e. the STRING not the resolved path, so different symlink paths get different entries and the sharing breaks (remote macOS falls back to v1); Windows symlinks need privilege. Also `utimes` the new target after re-pointing (two accounts could share an mtimeMs) and write a mid-turn attribution boundary into the usage ledger.**); 'CLI login' pick sends the `'subscription'` sentinel (a bare '' falls through to the default account in resolveForSpawn). 2.87.0: the switch snapshots the old window's geometry (`_snapshotWinBounds` → createSession `winBounds`) so the resumed conversation lands exactly where it was — plain resume of a terminated window inherits geometry the same way (resumeSession snapshots the read-only window it closes). Restart backfill greps the buffer for the last apiKeySource + /proc env probe for terminal sessions — GOTCHA: the wrapper ROTATES/caps the buffer, so a busy pre-tracking session's init scrolls out → stays '?' until its next resume re-inits (captured immediately). **Remote host account status (2.48.0):** `hosts.accountsStatus(id)` + `cliPrimaryKey(id)` (read-only ssh probes) → `GET /api/hosts/:id/accounts-status` + `POST /api/accounts/import-cli-host`; Manage Agents with a host selected shows the host's subscription/console state + 'Log in on host…' + 'Import host key'.
- **Usage credits are visible BEFORE they are spent (B-ad05, 2026-09-17):** a member whose org has extra usage enabled (`overage` carrying a vendor status other than `rejected`, or a dated past `inUse:true` — a status-less `inUse:false` is unknown, never credits) shows a dim `· credits` tag on its roster row and a `credits` chip in the usage popup (tooltip: requests past 100 % are billed pay-per-use); the pool ranks it below every member with quota left, uses it only as the last resort when the current member is fully spent, and posts ONE notice per (pool, member) per 6 h while it runs on credits ("Pool … is running on X's usage credits — … exclude X from the pool in Manage Agents"); the member's ⋯ menu gains 'Exclude from pool “X”'. Spend-guard is unchanged: owner-typed turns are never blocked and unattended turns are refused only once overage is IN USE.
- **Login-session expiry — say it BEFORE the turn dies (2026-09-07, src/login-expiry.js + src/server/login-expiry-watch.js).** A Claude subscription's login has an ABSOLUTE lifetime of its own: `claudeAiOauth.refreshTokenExpiresAt` in the account's `.credentials.json`. It does NOT move when the access token refreshes (measured on this instance: a member refreshed 30 min earlier still showed 17 h left while siblings showed 5 and 16 days), and when it passes the CLI's refresh gets `invalid_grant`, prints "Failed to authenticate: OAuth session expired and could not be refreshed", and BLANKS accessToken/refreshToken/expiresAt while KEEPING the deadline + scopes — the on-disk "logged out" shape (three members were in it the day this shipped). **Before this, VibeSpace only reacted AFTER a dead turn:** the pool's auth-failure eviction logged `[pool] auth-failure evict …`, moved the conversation to another member, and the user saw a failure, then it "worked again", and nobody was ever told to re-login. Now: ① **every subscription row carries `loginState`** (`/api/accounts`, so the roster, the billing switcher and New Session all see it) and Manage Agents draws a CHIP — amber "login expires in 17 h", red "login expired 9/7/26, 8:08 AM — re-login" / "login signed out — re-login" (SVG clock, theme vars, zh+ja). The chip IS the re-login button: clicking it runs the SAME `_reloginSubscription` flow as ⋯ → "Re-login on this machine…" (Enter/Space too). A POOL's row summarises its MEMBERS' worst state and names the member ("Personal Max: login expires in 40 min"), and its chip re-logs THAT member in — **over the members it can actually route to**: for a pool with an explicit `members` list that is the declared list (a signed-out member of it IS the finding, the user named it), for the default implicit pool it is `poolMembers()` plus the current link target. Round 1 summarised an implicit pool over EVERY same-backend subscription, so a fully healthy pool wore a permanent red chip naming an account signed out 700 h ago that it never routes to, while the CURRENT target's login dying in 16 h was masked by the worst-of rule. A host section shows only the DEAD state — an expiry warning about this machine's creds dir would be noise while looking at a host. An 'ok' or 'unknown' login draws NOTHING (a deadline we cannot read is ignorance, never a warning). ② **The pool routes around it before it bites:** a member whose login is expired/logged-out is never a candidate (blocked outcome named `all-logins-expired`, which points at a re-login rather than at waiting for a quota window — but ONLY when the login gate is the sole thing that emptied the candidate list: a list emptied by QUOTA stays `no-members`, keeps its named buckets, and appends "Also needing a re-login: X (signed out)", and every blocked member states its own fact rather than one "expired or is about to" over the lot; and when the wall is the CURRENT member's OWN dead login — which `loginBlocked` can never describe, because that list skips the current member by construction — the notice leads with it and prescribes the re-login: `Pool "P": Fish Max's login session expired — no member can take over. Re-login Fish Max in Manage Agents.` Round 2 smuggled that login into `deadBuckets`, so it printed as a spent quota bucket followed by "Conversations on it will hit a limit until a window resets, you add a member, or you move them off the pool" — a quota remedy for a wall no window clears, repeating once an hour, with the one account the user had to act on the only one it could not name. The whole sentence is now the PURE `poolBlockedNotice`, so what the suite asserts is the STRING a user reads, not the decision object behind it), a member within 30 min of its deadline is never a VOLUNTARY switch target (it still serves its own conversation fine) yet remains the LAST-RESORT escape when the current member is already dead — 20 minutes of login beats zero, and the switch notice then says "but X's own login expires in 20 min; re-login it in Manage Agents now", an 'expiring' member ranks below an equal healthy one, and the auth-failure notice reads "account X: login session expired (refresh token expired at T) — re-login needed" instead of the generic authentication wording. ③ **Three inbox items per login, ever:** 24 h out (normal), 1 h out (high), expired (urgent) — each naming the account and the expiry time, landing in the "For you" panel under an `accounts` group that jumps to Manage Agents. The text says what HAPPENED, from the login's STATE, not from the rung: a credential file the CLI has WIPED reads "is signed out — the CLI cleared its tokens (its login session ended <t>)", because the wipe is produced by any unrecoverable refresh (a revoked or rotated session, an explicit logout) and the CLI keeps the deadline when it blanks the tokens, so that deadline can still be in the FUTURE — round 2 filed an urgent item saying the login "expired" at a date weeks out while the chip on the same row correctly said "signed out". The ledger is `data/login-expiry.json`, so a restart repeats nothing and a re-login (a fresh deadline) silences all three — **and RETRACTS the ones already filed (2026-09-07)**: going silent is only half of it, so the owner who re-logged two members found their items still sitting OPEN in the inbox while the chip beside them had already gone green. The ledger remembers the item IDs it filed per member (persisted, so a restart between the warning and the re-login does not lose them) and a real re-login resolves each one through the store's own path (saved + broadcast, so every open client updates live) with one journal line, `X: re-logged in — N warning(s) cleared`. It never reopens or re-resolves an item the USER handled, never touches an item filed by anything else (only ids from its own ledger, re-checked before writing), and does NOT count a credentials rewrite that keeps the SAME deadline (a token refresh, a creds file copied in) as a new session — the test is whether the deadline CHANGED, not whether it grew, because a short org policy hands back an EARLIER deadline than the one we warned about and the ladder re-arms on the new one in the same sweep; the resolved tail credits it as `automatically`, neither the user nor an agent. A successful login through Manage Agents — the re-login finalize, the add-subscription finalize (above its auto-merge early return, so both exits sweep) and the codex device-auth finalize — sweeps the watch IMMEDIATELY instead of waiting up to 5 min, and that sweep reads `accounts.loginStateOf`, the very same reader the chip is built from, so the two surfaces cannot disagree. **Three things about that sweep were wrong in round 1 and are pinned now.** The re-login route asked `r.loggedIn` of `accounts.reloginResolve`, which returns that property on none of its four answers (`pending` / `same` and `split` with a NESTED `account` / `moved` with no account at all, the login having been relocated into another record) — so the immediate sweep never fired on the exact route the inbox item and the chip send the user to, and the suite stayed green because its fixture invented the shape. It now gates on the real answer, and the suite's fixtures are captured from an actual `reloginResolve` call. Manage Agents POLLS that route every 3 s for up to five minutes and the answer repeats, so the sweep is hung on the TRANSITION — the answer's credential fingerprint changing — not on the answer: 100 polls are one sweep, and the login the user finishes mid-poll is still one more (a plain "already swept this account" latch would have skipped exactly that one, because re-logging a still-logged-in account answers 'same' from the very first poll). And the add-subscription flow sweeps a SECOND time right after `mergeSubscription`: the first sweep runs while the fresh credentials are still in the throwaway record's dir, so the survivor — the record whose warning is open — is still read from its dead file. The sweep is idempotent, which is what lets the pre-merge one stay for every non-merge exit. The 24 h / 1 h items also mention a SHORT org session policy — `(its last login session lasted only ~24 h — this org's session policy may be short)` — but only from a MEASURED span: deadline-minus-file-mtime would report a healthy 30-day login as a 20-hour one (every access-token refresh rewrites that file while the deadline stays put), so the span is only taken when the login was WITNESSED (an observation log confirmed the member ≤3 sweeps ago, the deadline changed since, and the file was written after that confirmation), and a span shorter than what is still left is stale and dropped. It says "may be" because one session of one member is evidence about a policy, not a reading of it; a skipped rung (server off across the 24 h mark) fires only the most urgent one, never a stale "expires in 24 h". A login that had ALREADY been dead for more than a day when the ledger was created is a pre-existing condition — recorded, never filed — so upgrading does not open the inbox on a red badge about accounts abandoned weeks ago (the permanent chip in Manage Agents is that condition's surface); a death within the last day, or one that happened after this ledger started watching, still speaks. ④ **Passive by construction:** the checker reads files on the existing boot+5 min sweep — no probe, no timer that calls a vendor, no token touched (§ban-safety). Gate: scripts/test-login-expiry.mjs (255, incl. a 375×667 headless-chrome measurement of the chip, and a §5c that drives the real account store, the real inbox and the real watch through the real routes so the assertion is the item disappearing rather than a call count).
- Chrome customization: taskbar.position top/bottom (flex order + inverted drag), sidebar.position left/right (mirrored CSS + Resizer invert option + side-aware margin), taskbar.visibility show/autohide/hidden (autohide = position:fixed overlay + 6px hotzone — keeps workspace full-height, no reflow churn; fixed elements DON'T follow the sidebar margin, so `_applySidebarLayoutWidth` publishes `--sidebar-inset-left/right` CSS vars that the autohide taskbar + hotzone use for left/right), show/hide toggles for desktops/usage/window-count/presets/toolbar buttons (incl. Terminal + Presets buttons). Right-click empty taskbar/toolbar space = in-place customize menu writing the same settings. Settings enum options MUST be {value,label} objects — plain strings render blank dropdowns.
- **Customize mode** (`src/lib/customize-mode.js`, ⚙ menu → Customize UI… / right-click toolbar/taskbar → Customize UI…): Firefox-style direct-manipulation chrome editor. `CHROME_ELEMENTS` registry: one entry per element `{id, label, hideKey (null = core: movable but not hideable, e.g. New Session), defaultZone}`. Entering adds a `.cz-overlay` (z 9400, dims+blocks workspace; chrome bars elevated to z 9500 via `body.customize-mode`), outlines every registered element (`.cz-item`, capture-phase click interception so the button's real action never fires), and shows segmented pills next to the taskbar (position + visibility) and sidebar (position) plus a bottom panel (hint/Reset/All settings/Done). Hidden elements stay ON canvas dimmed (`.cz-off`) — applyChromeSettings is customize-aware: `display = (on || cz) ? '' : 'none'`. Hover tooltip via `data-cz-tip` ::after (taskbar-top drops the pill past the toolbar: `calc(-48px - var(--toolbar-height))`). All writes go through the SAME settings keys → persistence + multi-client sync free; remote changes refresh live (settings.on per key, off on exit). Sidebar auto-opens on enter (restored on exit); Escape (capture) or Done exits; mobile excluded.
- **Chrome arrangement (drag-to-move)**: zones are flex containers tagged `data-zone` in index.html — `toolbar-center`, `toolbar-right`, `taskbar-tray` (the tray replaced `.taskbar-right-section`; desktop-previews + usage + window-count are its default row children). `chrome.arrangement` setting (json, default null) persists `{zoneId: [elementId,…]}`; `applyArrangement()` (exported from customize-mode.js, called at startup + on setting change) re-parents via appendChild (listeners survive). Fixed anchors (⚙ gear, ☰+title, #taskbar-items, [CMD]) are NOT in the model — movables always append after them, and the drop-marker only slots between MOVABLE siblings so you can't drop before an anchor. Drag = pointer-based (mousedown capture on each .cz-item, 5px threshold distinguishes click-toggle from drag, rAF-coalesced, ghost clone follows cursor, allowed zones outline, `.cz-drop-marker` shows the slot; `_justDragged` flag swallows the trailing click). On drop `_saveArrangement()` reads the live DOM back into the map → settings.set. `normalizeArrangement` fills unmentioned elements into their defaultZone (upgrade-safe). Cross-bar sizing: taskbar-height-derived CSS vars live on :root so elements work anywhere; `#toolbar`-scoped rules clamp previews to 26px/hide labels/fix pie size. IMPORTANT: element show/hide has NO taskbar-visibility coupling anymore (`show('desktop-previews', setting)` — not `vis !== 'hidden' && setting`) — an element hosted in the toolbar must survive hiding the taskbar (that's the flagship workflow: drag previews/usage to the toolbar, then hide the taskbar).
- **Chrome alignment (`chrome.zoneAlign`)**: per-area alignment, applied in applyChromeSettings — `taskbar-items` left/center (center uses `justify-content: safe center`: plain center makes the left overflow unreachable in a scroll container), `toolbar-center` left/center/right (inline justify-content), `taskbar-tray` left/right end (tray `order:-1` + cmd-indicator `order:-2` keeps [CMD] leftmost). Customize mode shows mini `.cz-align` icon chips next to each target — body-FIXED positioning (a chip inside #taskbar-items would be clipped by its overflow-x scroll context), repositioned by `_refresh` + window resize; the taskbar-items chip anchors at the strip's LEFT end (centering would collide with the centered taskbar pill). Default values are deleted from the object (sparse; whole setting null when empty).
- **Springs (flexible space)**: `spring-<n>` ids in chrome.arrangement create invisible `.chrome-spring` divs (macOS-toolbar "flexible space") — the general justify-between mechanism (e.g. [presets][spring][previews][spring][usage] centers previews, pushes usage right). Per-spring config in `chrome.springs` (json): `{mode:'flex', weight:1-9}` (strength = flex-grow share; 1×+3× springs split leftover 1:3) or `{mode:'fixed', px:N}` (rigid spacer — e.g. mirror the "☰ VibeSpace" section width at the start of an extra row so both rows' centers coincide); default flex/1× stored sparsely (no entry). `applySpringStyle` sets flex/width + a `data-w` label (↔ / "3×" / "160px") shown in the hatched bar while editing; fixed springs get vertical hatching (`.spring-fixed`). Lifecycle lives in `applyArrangement(raw, springCfgs)`: mentioned springs created on demand (`ensureSpringEl`), unmentioned removed; app.js listens on BOTH chrome.arrangement and chrome.springs. In customize mode click opens the **config popover** (`.cz-spring-pop`: Flexible/Fixed segment + strength-or-width number input, live-applied + Remove), drag moves; `+ Spring` panel button adds one to toolbar-center. `_wireSpring` is idempotent (`_czWired`) and re-runs in `_refresh` because a REMOTE arrangement change can re-create spring elements mid-session; `_saveArrangement` prunes chrome.springs entries whose spring is gone. `isMovableId` (registry OR spring) is the filter used by drag siblings + `_saveArrangement` — flexible springs only work usefully in flex:1 zones (toolbar-center, rows); fixed springs work anywhere.
- **Chrome elements own their context menu; the CONTAINER's exemption list is not a contract (2.250.1, real report)**: chrome elements are drag-movable BETWEEN bars, so an element that has its own menu must `stopPropagation()` on contextmenu — relying on each bar's `e.target.closest(...)` exemption means the menu breaks the moment the element is dragged into the other bar. The toolbar handler exempted only `button, select, input` while the taskbar exempted `.desktop-preview`, so a preview dragged into the toolbar got "Customize UI…" instead of Rename/Delete (showContextMenu removes any existing menu, so the second handler REPLACES the first). Both ends are fixed; keep the exemption lists identical AND keep the stopPropagation.
- **Toolbar sizing is a CONTENT SCALE, not a height (2.254.0, userW's dead-band report)**: `#toolbar` height AUTO-FITS its content rows (incl. a populated `#toolbar-row2`) — never a fixed `--toolbar-height` (that model stretched only row 1 of a 2-row arrangement, leaving a huge dead band; screenshot-diagnosed). The resize handle drives `--toolbar-scale` (a CSS `zoom` on `#toolbar` + `#toolbar-row2`, clamp 0.7..1.25 — larger scales overflow the center zone in narrow windows; the feature's value is COMPACT = more desktop). Chrome ≥128 zoom participates in layout (verified: workspace absorbs the delta) — but `offsetHeight` reports the PRE-zoom coordinate space, so any measurement must use `getBoundingClientRect()` (this exact mistake produced a false 'no change' verdict once). Persistence: localStorage `toolbarScale` + layout-state `toolbarScale` (null at ~1; an EXPLICIT null in a synced state = reset and MUST propagate — `!= null` guards silently dropped resets); legacy `toolbarHeight` values migrate via `h/40` at every intake (localStorage boot, synced state, _applyToolbarScale accepts >4 as px). The scale rides layout-sync PRE-desktop-gate (2.252.2 invariant) and `--toolbar-scale` is in themes.js LAYOUT_VARS (theme sweep exemption). The taskbar keeps its separate element-inline-height model. Smoke: scripts/test-toolbar-resize.mjs (15 CDP asserts); visual repro: scripts/dbg-toolbar-shot.mjs (screenshots w/ the user's real 2-row arrangement — UI verdicts need RENDERED screenshots, not numbers).
- **Per-window popup/menu direction**: `showWindowContextMenu(app, id, x, y, {closeLabel, onAction})` (taskbar.js, shared by taskbar items, group items, AND window-list rows) opens upward only when invoked in the lower half of the screen — a top-docked taskbar or a window-count chip moved into the toolbar must not push the menu off-screen (the old code unconditionally bottom-anchored). Same flip in `showWindowList` + `showTabGroupList` popovers: prefer above the anchor, fall below when `rect.top - height < 4`. Window-list rows are right-clickable (same menu as taskbar items).
- **Chained popovers don't dismiss their parent**: `attachPopoverClose` (utils.js) ignores mousedowns whose target sits inside ANY `[data-popover]` — a context menu opened from a list row is a child interaction, not a dismissal (closing the list on right-click was reported as jarring). Opening a popover from regular UI still closes others (that mousedown lands outside any popover). The window list refreshes IN PLACE after a menu action via `onAction(kind)` (`render()`/`place()` split; re-placed because the height changes) — except `move`, which takes over the screen, so the list closes.
- **Spring width sources**: fixed springs take px or `pct` (rendered as vw — % of screen width; unit toggle converts the value so the visual width is preserved). **Width-pick mode** (`_startWidthPick`, "Match…" in the spring popover): hover highlights any bar element (sections like `.toolbar-left`, buttons, previews — `PICK_SEL` = direct children of bars/zones), each click ADDS the element's width to a running sum (multi-select), Done/Escape ends. Pick handlers ride WINDOW capture so they preempt element drag/toggle handlers AND the customize-mode Escape (document capture fires after window capture); the spring popover is exempted (`inPopover`) so Done keeps working, and the popover's outside-close ignores clicks while `_picking`. While picking the popover PARKS mid-screen (`.cz-parked`, !important overrides the inline anchor; class removal restores) — anchored next to the spring it can cover exactly the bar element the user wants to pick (spring in the extra row → popover over "☰ VibeSpace"); all pickable elements live in the top/bottom bars so center is always safe.
- **Extra bar rows**: `#toolbar-row2` (below toolbar) + `#taskbar-row2` (adjacent to taskbar; `order:-1` under body.taskbar-top so it follows the bar) are zones that auto-hide via `:empty` CSS and force-show in customize mode (equal specificity — the customize rule must come AFTER the :empty rule) with a "drag elements here" ::after hint. Lets e.g. layout presets live on their own full-width row.
- **Toolbar-hosted preview labels**: `#toolbar .desktop-preview-label` is size-reduced (8px) NOT display:none — hiding it was reported as a bug ("挪到顶部之后下面的字不见了"). Previews clamp to 20px so preview+label fit the 40px toolbar.
- **Window-count chip**: `#taskbar-status` is a compact chip — window-stack SVG + bare count number, full label in the tooltip (`taskbar.js` writes count + title, click on the chip opens the window list). Don't regress to text "N windows": as a standalone tray element it wasted horizontal space.
- **Mounts / Storage (collaboration P1, 2.20.0 → flat-connections redesign 2.29.0)**: sidebar "Remote" tab (sidebar-mounts.js mixin) has MACHINES (ssh hosts) + STORAGE (a FLAT list of mount connections — no special "My storage" card; every place is an equal row). Server `src/mounts.js` MountManager + `/api/mounts*`. rclone mount runs DETACHED (survives restarts; boot `restore()` adopts live fuse.rclone from /proc/mounts, remounts desired-but-dead); all secrets AES-GCM at rest (data/.mounts-key) + passed via child ENV not argv.
  - **MULTI-SOURCE**: typed records (`m.type`: s3/drive/webdav/sftp/vibespace/rclone; legacy = s3). `_rcloneFor(m)` builds per-type `RCLONE_CONFIG_VS_*` env + remote string. rclone-obscured passwords obscured only at mount time (`rclone obscure`; AES-GCM is the real protection). `rclone` custom type = any backend + `key=value` params. "Extra options" merges into any type. `_rcloneSupportsAcceptEncodingFlag` + isS3 gate (`(m.type||'s3')==='s3' || m.rcloneType==='s3'`) adds `--s3-use-accept-encoding-gzip=false` + V2-auth probe to survive Cloudflare-fronted MinIO (proxies rewrite the signed Accept-Encoding header → SignatureDoesNotMatch; pin rclone 1.63–1.69 for STS shares through such proxies).
  - **No-terminal onboarding**: `rcloneBin()` prefers data/bin/rclone; `installRclone()` downloads pinned 1.65.2 (UI "Install rclone" when absent). Guided Google Drive OAuth: `startDriveAuth()` spawns `rclone authorize drive` server-side, resolves its 127.0.0.1 redirector to the real Google URL (works remote); same-machine completes hands-free, remote pastes the callback URL back → `forwardDriveCallback`. `parseRcloneConf(text)` imports an rclone.conf (wrapper remotes crypt/alias flagged unmountable).
  - **Switching the OAuth client IS a re-authorization (2.369.165, integrations 4a — D2 of docs/design-integrations-per-account.zh.md)**: in a Google Drive or Gmail connection's Edit dialog, a change to the client the record RESOLVES to (the `OAuth client` preset, or Drive's custom id — the secret is not the identity) no longer saves silently beside the old token (`invalid_client` at the next refresh). Save stores the other fields, then opens Re-authorize under the NEW client (the hint names it; abandoned, the record keeps its current client and sign-in); the minted token lands WITH the client (`drive-token {token, client}` / Gmail's PATCH `{clientPreset, token}`), children bounce. A token pasted by hand = a plain save; a custom id without its secret is refused inline. The Edit dialog draws exactly what it drew. **Held at the server too (integrations r1):** `MountManager.update` refuses a bare client switch beside a held token with `client-change-needs-reauth` (the PATCH answers 409 naming Re-authorize) — a script, an older bundle or a plugin cannot reach the silent path the dialog closed; and `drive-token`'s `client` must name itself (`{clientPreset:''}` is the explicit built-in; `{}` is refused, never read as built-in). Gates: test-mount-oauth-probe §4 (server) + test-mounts-dialog-extract §3 (chrome, with the pre-D2 patched copy as control).
  - **S3 share minting is per-connection** (`mintShareFromMount(id)` uses that mount's OWN creds — every S3 mount stores endpoint/bucket/accessKey/secretKey, so there's no separate owner-key config). `canShareFromMount` = s3 + full secret + no sessionToken + origin≠imported → per-row share button. mc `admin accesskey create`→`svcacct add`→STS AssumeRole (built-in SigV4, ≤7d). GOTCHA: MinIO rejects s3:prefix on GetBucketLocation (separate ListBucket-only statement); ROOT creds can't AssumeRole. Links `vibespace-share:v1:<b64url>` EMBED the credential (secret).
  - **VibeSpace↔VibeSpace bridge** (`src/webdav.js`): `type:'vibespace'` mount = WebDAV against the other instance's `/dav` with a scoped bearer `vsmt_` token. Tokens sha256-hashed at rest, carry a chroot root + ro/rw enforced per request (traversal + symlink escapes rejected via nearest-existing-ancestor realpath); `vibespace-mount:v1:<b64url>` links. "Share a local folder" (also from Files right-click) mints one. Any WebDAV client (rclone/Finder/phone) can mount `/dav` too.
  - **VIBESPACE_S3_* / legacy myStorage config auto-migrates ONCE** (`_maybeImportEnvStorage`, guarded by `_state._envImported`) → a normal S3 mount named "My storage" (desired='mounted').
  - Verified e2e vs real MinIO (minio.example.com / minioapi.example.com behind Cloudflare) + SFTP vs the devbox + bridge loopback: RW write→object, mint-from-row→import→RO read, restart adoption, revoke, RO write-block, traversal/symlink/token rejection.
- **会话命名退化成目录名 + 命名一致性(2026-07-13修, 2.117.0)**: 本地/远程发现均从首条`type:user`记录取名, 但注入的`<vibespace-task-context>`/`<system-reminder>`会作为首个user记录出现(尤其codex/远程/带任务组的会话), 本地(session-store.js `_sessionMeta`)旧代码不跳过→会显示tag名; 远程(hosts.js发现脚本)`grep -m1`只取一条+跳过`<`-tag后放弃→退化cwd basename(the devbox实测18b5b727首轮=task-context→名字'<user>'=home basename)。修: 两侧都跳过`<...>`和`/命令`回显取第一条真实消息, 远程改`grep -m6`扫前几条。注: VibeSpace只用首条消息命名, 不读claude自己的`type:summary`标题(旧CLI不写; 要读是另一功能)。相关: sidebar搜索(session-filter)旧只覆盖Recent/History switcher选中的那台远程主机, 2.117.0加跨主机'Remote matches'(_renderRemoteSearchAll, 查询时按需加载所有host+relevant()触发重渲染); Ctrl+K palette haystack加session id。
- **远程session重复卡片 + Ctrl+K搜不到remote(2026-07-13修, 2.116.0)**: (1) resume一个远程session后同一session出现两张卡——运行中(webui-managed live)+最近(远程ssh discovery独立路径, 因远程chat无remote dtach锁discovery报stopped)。根因: 最近/历史的远程zone(sidebar-workbench `_renderRemoteRecent`)是独立render路径, 不与`_allSessions`(webui)交叉去重。修: `_wbFilterRemote`按session id(UUID无碰撞)过滤掉已在live webui里的discovered session。(2) Ctrl+K palette只搜`_allSessions`(本地+live远程), 从不含远程STOPPED session。修: palette合并已discovered的远程session(`_wbRemoteHosts`), 打开时`_ensureHostsData`+对每个host一次性`_loadRemoteHost`(结果流式刷新), resume远程选项时传`hostId`让--resume跑在正确主机。
- **远程session稳定性(2026-07-13诊断, T0-T2已修 2.124.0; T3=C/S重构在backlog B-55e2)**: 旧病根: 远程chat的claude裸跑在`ssh -T`下无远程持久层(stream-json不能穿pty), SSH无keepalive, chat-wrapper对ssh退出零容错——网络抖动即session猝死(userL复现)。**现架构**: ①T0 keepalive进`SSH_BASE_OPTS`(15s×4, 全ssh路径生效) ②T2 远程chat经**vibespace-remote-keeper**(分发到远端~/.vibespace/bin, STATIC tracked): claude在远端setsid daemon下跑, stdout追加buffer文件+stdin走unix socket, ssh死只死管道; run/daemon/attach/stop四模式, `run <sid> <offset> --`幂等(已退出只drain哨兵绝不重启), `_remote_exit`哨兵=会话真正结束; 文件在~/.vibespace/run/(7d sweep), 测试env VIBESPACE_KEEPER_DIR可重定向 ③T1 chat-wrapper远程模式(env VIBESPACE_REMOTE_SID): 子进程退出且无哨兵→退避重连(1s→30s), `__VS_OFFSET__`占位符替换为已消费字节数(keeper精确续传; **行切分改Buffer基**——utf8 setEncoding会在断点吞多字节字符尾巴), 断线输入排队200条重连后flush, meta.remote={state,attempts} ④终端pty-wrapper(env VIBESPACE_REMOTE_RETRY): 非0退出退避重播ssh(远端dtach -A重挂), 干净exit 0才算真结束 ⑤kill路径远端`keeper stop`+发现缓存失效。测试: scripts/test-remote-keeper.mjs(本地e2e)+the devbox真机验证(ssh SIGKILL→远端存活→offset重连零重放→退出哨兵)。诊断档案: ~/workspace/AIWorkspace/SharedContext/devices-and-access.md
- **Remote hosts + sessions (collaboration P2/P3, 2.21.0+)**: ssh host registry (`src/hosts.js`, data/hosts.json; keys in data/ssh/<id>.key 0600, paste/upload or generate). MACHINES section auto-probes connectivity (`_autoTestHosts`, re-probe >2min, in-place row swap). Remote TERMINAL session: `local dtach → pty-wrapper → ssh -t → remote dtach -A → sh -lc 'cd; exec env … claude'` (2.124.0: pty-wrapper auto-respawns a non-zero-exit ssh with backoff — remote dtach -A reattaches). Remote CHAT: `ssh -T` CLEAN pipe (stream-json must NOT cross a remote pty — echo/CRLF corrupt JSON) into **vibespace-remote-keeper** on the host (2.124.0 — claude detached under a keeper daemon, offset-reattach across ssh drops; see the 远程session稳定性 bullet). Discovery results persist to data/remote-sessions-cache.json (last-known served stale-marked when a host is unreachable; cache invalidated after remote create/kill). **Per-op ssh rides a shared ControlMaster (2.125.0)**: `sshArgs(h,{multiplex:true})` (hosts._ssh, remote-fs, sshCmd/rsync) — ~1s → ~50ms per op; NEVER on session pipes (a session-master's death would kill every multiplexed connection with it); ControlPath lives in /tmp/vs-cm-<uid>/ (the data dir overflows the ~104-char unix-socket limit). **CONNECTIVITY PROBES MUST BE FRESH, never multiplexed (2.228.1, real userL incident)**: an ESTABLISHED master TCP flow survives firewall/route changes (conntrack + keepalives) — hosts.test rode the mux and showed READY for hours while every NEW connection (= every session pipe, which never multiplexes) timed out; the sidebar row lied while the session chip told the truth. test() probes with `fresh:true`; fresh-fail + mux-alive throws the named 'network path changed' diagnosis. Same class rule for any future health check: measure the connection KIND the consumer uses. Reconnecting remote chat shows an amber '⟳ host reconnecting' status-bar chip (`_remote_state` wrapper line → `remote-state` WS + attach payload `remoteState`). New Session + Terminal button + Manage Agents all take a host; `openShellTerminal(cwd, {hostId})`. Session cards carry host badge + host color strip; sidebar RECENT/HISTORY each have an independent host switcher (live ssh discovery, lock-first, `/api/hosts/:id/sessions?fresh=1`, 15s cache). Remote resume: `createSession({resumeId, hostId, cwd})`. Remote HISTORY over ssh: `hosts.fetchSessionJsonl` pulls the transcript into data/remote-jsonl/<host>/ (size+mtime invalidation); `findSessionJsonlPath` scans that cache so view-only/pagination/search/gap-seek all work remote-capable; pre-fetch hooks in ws viewOnly + live chat attach + `/api/session-messages?host=`. **EVERY client history consumer must pass `?host=` for remote sessions (2.108.1)** — resume load, pagination, turn map, search (`_getSessionIds` returns `host`); a host-less fetch on a COLD cache silently returns empty (externally-started server sessions opened blank in chat — VibeSpace-started ones only worked because attach/view had warmed the cache). `view-<uuid>` ids parse as `view-<backend>-…` ONLY for known backend prefixes (codex|claude|shell).
- **Files cross-host (2.23.x)**: file explorer host `<select>`; `src/remote-fs.js` RemoteFs (ssh-per-op, mirrors /api/file* shapes, files.js dispatches on `?host=`). Cross-host copy/move = server relay (files) or tar-stream (folders); drag between explorer windows on different hosts transfers; clipboard records source host; host-aware bookmarks (badge) + explorer-host persisted in layout/openSpec.
- **Orphan sweep is AGE-BASED (2.89.1)**: buffer/wrapper-meta files are deleted 30s post-boot ONLY when untouched for 7 days — the activeSessions-keyed sweep raced live-but-not-readopted sessions (wrapper kept writing the deleted inode; every restart then rebuilt history without the buffer — real incident). writeSessionMeta drops writes to TOMBSTONED sockNames (deleteSessionMeta records them; debounced stragglers used to resurrect partial metas).
- **Kill-path teardown lives in ws-handler's `kill` case** (2.83.0): onExit early-returns once the session leaves activeSessions (stale-PTY guard), so watcher/normalizer teardown must run BEFORE the delete — killed sessions used to leak every subagent fs.watch + retry chain + normalizer forever. Subagent buffers/normalizers are also GC'd 60s after each agent's task_notification (completed agents replay from disk). Codex stdout parser takes session NAMES only from session_meta/wrapper_meta records — function_call records carry payload.name = the TOOL name and used to rename the session + 2 sync meta writes + 2 broadcasts per tool call. Discovery: /api/sessions cache TTL 4500ms (2s missed every 5s poll), /proc codex-fd walk 10s TTL. **THE SWEEP STARTS AT MOST ONE CHILD PROCESS (2026-09-09, userW's pod: an 11-17 s event-loop block after EVERY create and EVERY kill, 27 of 27 in seven days)** — `tmux list-panes`, and only where a tmux binary is on PATH (statted, cached 4 s). The per-lock `ps -p -o ppid=` and the per-session `pgrep -P` (with its 15 s cache) are GONE: parents and children are read from /proc through src/cli-identity.js, because `execFile` moves the WAIT off the loop while the FORK still copies the parent's page tables on the calling thread — measured 1.8 ms/spawn at 45 MB RSS, 18.8 ms at 543 MB, 67-73 ms at 1.5 GB, and `Promise.all` serialises N of them into ONE tick. Same fixture at 1.5 GB RSS: 61 locks went 8,441 ms / 123 spawns → 3 ms / 0 spawns. **The sweep is ASYNC + PARALLEL since 2.242.0 (userN's instance-freeze root cause, caught by a resident V8 sampling watchdog: the execFileSync chain — pgrep×N + tmux + ps×2/lock, sequential — blocked the loop 5.1s per sweep, up to ~33s worst-case under load; with a connected client polling at 5s the whole server froze rhythmically — the 'slow while I work, fine later' pattern). Subprocess probes run via execFileP/getTmuxPaneMapAsync/isProcessClaudeAsync/findTmuxTargetAsync (session-store; sync variants remain for boot paths), concurrent polls coalesce on ONE in-flight sweep (_sweepInFlight), and lock-entry ORDER is preserved through the parallel probe (claimJsonls' mtime fallback + firstRunning depend on it). Profiling knowledge that cracked it: a BLOCKED loop shows in a V8 CPU profile as a long SAME-NODE consecutive sample run (SIGPROF keeps delivering in interruptible waits), NOT a giant timeDelta — stall detectors must check both shapes.**
- **HOST-CAPABILITY PLUGINS (⚙ → Plugins, `src/plugins.js` + `src/lib/plugins-ui.js`)** — three built-ins with one shape (def + install + start/stop + status + boot replay from `enabled`+`desiredUp` in data/plugins.json, every change broadcast as `plugins-updated`): **Tailscale** (join a tailnet), **Public URLs (frp)** (publish a forwarded port through the shared relay), and since 2026-09-07 the **OpenCode background service**. The third one is the pattern for "a harness needs a background daemon": it is **OFF by default** (the owner's rule after the 2.369.42 runaway — VibeSpace never starts a third-party daemon on your machine until you say so), there is nothing to install (it runs YOUR `opencode` CLI) and nothing to configure (a free loopback port); Start/Stop and one "run it whenever VibeSpace runs" switch. `VIBESPACE_OPENCODE_SERVE=0/1` remains an ops override and the card then says "forced by the environment" and disables the controls — and `=0` also STOPS a serve this instance inherited from a previous (SIGKILLed) server rather than adopting it, so the locked card never describes a daemon that is actually running. Disabling it STOPS the process — including one adopted from a previous server — and nothing respawns it. The keeper, its resource guard and every fact stay in the shared module (`src/opencode-serve.js`); the plugin is only the control surface.
- **PERMISSION RULES — the READ-ONLY "where does this rule come from" view (2026-09-07, owner ruling 10)**: Session Properties grows a "Permission rules" section (button "Show rules…", never auto-loaded — the codex rung asks the session's own agent, so a panel that re-fetched on every broadcast would re-ask on every broadcast; the tree you loaded then SURVIVES those broadcasts — the window keeps the record and repaints it, and the button says "Reload rules" — because Properties re-renders continuously while the session works and the answer you clicked for used to disappear within a second. Change the question underneath it — the session moves to another cwd — and the tree is dropped back to "Show rules…" rather than relabelled onto a different question), and Manage Agents grows a "Permission rules…" row (per named account, and a "Rules & checks" button on the machine's own CLI row). One tree per SOURCE: the layer's own name for itself, its FILE as a copy-path button (nothing else is clickable — there is no edit control anywhere in this feature and no write route behind it), a per-layer note, then its rules with `allow`/`deny`/`ask` badges in the harness's OWN words (untranslated: you must be able to grep your settings.json for what you saw). claude shows the documented hierarchy — managed (+ every `managed-settings.d/*.json` drop-in as its own source) / user / project / project-local — where a MISSING file, an UNPARSEABLE one ("the CLI ignores a settings file it cannot parse") and one with no `permissions` block are three different honest notes. codex shows `config/read`'s layers + origins, i.e. which layer WON each key, including the file-less `sessionFlags` layer (the `-c` overrides THIS session was spawned with — the reason the session-scoped read goes through the session's own agent), and only this session's own directory trust level (a real store had 378 origin keys, most of them other people's projects). A TABLE-valued key such as `sandbox_workspace_write` is attributed **per member**, because that is how codex keys it (measured on 0.153.4: the table itself is never in `origins`, its leaves are) — so `sandbox_workspace_write.network_access` set by this session's own `-c` flag shows up under "this session's own -c flags" while the rest of the table stays with the file that set it, instead of the whole table being reported as an unset packaged default. A key no layer set at all still says so; if the agent's answer had to be capped, the rules say "origin unknown — the answer was capped" rather than borrowing that sentence, and an answer too big even for that is refused out loud with its size. **codex answers only for a LIVE session**: an instance-wide codex read would need a fresh `codex app-server`, which was measured connecting to chatgpt.com even with no credentials, so Manage Agents shows a disabled row naming that measurement where the button would have been, and asking anyway returns a refusal that quotes it. OpenCode shows its resolved permission config with a note saying the serve reports NO per-key origin — the honest answer instead of a fabricated file attribution. Harnesses that cannot answer say why, with a typed reason: a shell session has no section at all, a REMOTE session says the rules live on that machine (every harness, including a live remote codex one — its agent runs over there and only that machine can vouch for what it can answer), a stopped codex session says a stopped session's rules are recorded nowhere, and a session whose agent predates the feature says "Terminate + Resume". ≤768px: one column, full-width copy-path tap target, no sideways scroll (measured at 375×667).
- **LOCAL ORACLES — human-triggered, zero-network CLI checks (2026-09-07, owner ruling 6)**: the same Manage Agents menu offers per-account read-only checks that run ONLY on your click (never on a timer, never at boot), under the sanitized spawn env with that account's own config dir, and show their output in a modal — typed JSON when the CLI offers a JSON flag, monospace text otherwise, always with both streams (`codex login status` answers on stderr). Shipping: **Login status**, **Configured MCP servers**, **Feature flags** (all codex). The three the design proposed — `claude auth status`, `claude agents --json`, `codex doctor --json` — were MEASURED and REJECTED (5 / 5 / 16 connections to vendor endpoints; the first still reaches api.anthropic.com with no credentials and with every traffic-suppressing env set), so claude's menu shows them as disabled rows carrying the reason rather than an empty menu. A fourth was caught the same way after it had already shipped: the codex instance-scope rule read spawned `codex app-server`, measured at 7 connections including chatgpt.com — that capability is now off, and codex's menu carries its disabled row too: "we measured these and they phone home" is a more useful fact than "there is nothing here". §ban-safety detail + the measurement method: kb-design-lessons §9.
- WS message dispatch is wrapped in try/catch (ws-handler handleMessage) — a malformed client message once crashed the whole server (array extraArgs hit .trim()); handler errors now log + reply an error instead of killing the process. extraArgs accepts string|array.

### Terminal Management
- Multiple simultaneous sessions via dtach (survive server restarts)
- Attach to external tmux sessions (read/write, closing doesn't kill)
- Multi-device sync (output broadcast to all connected clients)
- Global settings (toolbar ⚙ / the phone's ⚙): the ⚙ menu TREE (2.369.124, docs/design-gear-menu-hierarchy.md; 2.369.131: All Settings… is a DIRECT row after Manage agents…, System monitor… / Ports… under System) — Appearance ▸ (theme, font size, font family, UI scale, UI font size, All Settings, Customize UI, Language ▸ with ✓ on the current choice; the head's caption shows `Dark · 14px · 100%` and follows a change made inside the panel at once — r2) · Manage agents… · Tools ▸ (Usage, Background Work, Desktop apps, Plugins, plugin windows) · Communication ▸ (Channels, Outbox, Integrations) · System ▸ (Report a problem, Diagnostics, Restore a previous layout, Backup & migrate, Change password) · Update VibeSpace… (direct, its vX → vY label is the update indicator) · Help ▸ (Welcome tour, All Settings) · Sign out. Desktop = a cascading flyout opening to the LEFT on 120 ms hover intent / click / Enter / ArrowLeft, arrow-key navigation with a roving tabindex, Esc closes one layer at a time; phones and hover-less pointers = an inline accordion, one head open per level, rows ≥ 44 px. A plugin row with `parent:'tools'|'comm'|'system'|'help'|'appearance'` lands in that head; without one it stays at the top level as before.
- The Settings window (2.369.132): a TREE of five groups over the categories (Appearance & layout / Sessions & chat / Harnesses / Services / Spending; Plugins and Other trail by rule), foldable on desktop and flat on the phone; each harness section is three sub-blocks — Global (written into the CLI config file), Per session (passed to the CLI at spawn), VibeSpace (server-side) — from the rows' declared apply kind.
- Per-terminal overrides (window ⚙): theme, font size, font family — each with Default option
- Dynamic font list: Google Web Fonts + client local fonts (queryLocalFonts) + server fallback (fc-list)
- Bell notification: 🔔 icon on window title when terminal receives BEL while not focused, cleared on focus
- Pin-to-bottom: default on, scroll up freezes terminal (output queued), scroll back to bottom or click ↓ button flushes queued output
- Idle detection: OSC 0 title parsing — ✳ (U+2733) = idle, braille spinners = working. Window title bar + taskbar blink orange when Claude finishes and waits for input (cleared on focus)
- Clipboard image paste: Ctrl+V with image in clipboard → saves to temp file → sets server X clipboard via `cat | xclip` pipe → sends Ctrl+V (0x16) to PTY → Claude Code checks clipboard and reads image
- CJK support: Unicode 11 addon for correct fullwidth character width calculation + CJK monospace font fallback chain
- Multi-device sync: terminal size uses min(all clients), larger clients show padding. Editor open/close broadcasts to all clients with session targeting
- Ctrl+G external editor with split-pane CodeMirror (screen not cleared). Press Ctrl+G again to Save & Close. Auto-focuses editor on open.
- Minimum contrast ratio: auto-enabled at 4.5 (WCAG AA) for light terminal backgrounds, disabled for dark. Adjusts any RGB foreground color that doesn't meet threshold.
- **Phone key row (2.369.125, docs/design-mobile-gaps.md #10)**: a **Copy screen** key copies the visible terminal text (xterm has no touch selection) with a toast naming the line count; the row wraps to two lines so every key — incl. paste and ^C…^\ — sits inside a 390 px viewport at ≥ 36 px; icon keys are SVG (the 📋 emoji is gone).

### Chat Mode

- **The CLI's "Stop hook error" notice is hidden by default (2.369.127).** A Stop-hook BLOCK (VibeSpace's own bookkeeping nudge included) makes the CLI post `system/notification` key `stop-hook-error` on the live stream; `chat.showStopHookErrorNotice` (Settings → Chat, default off) hides that card — the "Stop hook feedback" and hook summary cards stay — and the server never toasts it when the nudge itself just fired. On: a red immediate notice. It is also a hook card, so "Show hook cards" off hides it too.
- **Unknown harness records, whole (docs/design-unknown-records.md, 2026-09-21 — owner rulings (a) the fall-back card 2.369.120 + (b) "known types with unknown parameters must be recorded and flagged").** ① THE SCHEMA ORACLE: `src/record-shape.js` declares every known record shape per harness AND carrier (claude stream rows verbatim from the installed binary's zod union, transcript camelCase twins, codex rollout payloads/events/items); both normalizers judge every record AFTER routing and draw ONE "New fields on a known record: system/init +{messaging_socket_path}" card per shape per session (red border, dim head, merged on repeat, the redacted sample behind "Full record", folds under the 'unknown' kind, telemetry `harness-shape-drift` once per process per shape, Diagnostics "Harness drift" table). The three fields the product already depends on (init.messaging_socket_path / task_started.owned_by_subagent / task_progress.workflow_progress) are declared with a note and never flagged. scripts/test-record-shape.mjs re-reads the INSTALLED claude's union every run — the day the CLI adds a subtype, a type or a field, the build goes red with the name printed. ② `system/notification` (the REPL's own queue: stop-hook-error, fast-mode-overage-rejected, model-deny) = a dim priority-coloured notice card, keyed dedupe per turn; `immediate`/`high` ALSO toast every client through server-notice (one implementation in session-brain for the parse and the device feed). ③ codex `item_completed` McpToolCall = the MCP tool card ("tool (server)", fold kind mcp, result as output, failed = error) — no more red card per MCP call; the wrapper's `_stdin_ack` is skipped. ④ History-only rows: `local_command` → the /command bubble; `away_summary` → the "Recap — while you were away" card (markdown through DOMPurify); `turn_duration` → the message-meta popup's "Turn: 3m18s · 66 messages [· budget n/limit]" row on the turn's last message; `api_error` → declared card-less (the transcript rows are NOT consumed — a days-old 401 must not evict today's pool member; the live-feed consumer for 401/403 is forward-compat for a stream record the census never observed, r3 2026-09-21); `microcompact_boundary` → declared card-less. ⑤ Chrome signals: `vcs_state_changed` → the session card's git chip ("push · fix/x"), a `session-vcs` push that re-lists every open File Explorer rooted in that cwd, and a "git push" row in the Session Properties timeline — card-less; `code_change_published` (+ the transcript's `pr-link` row, the same fact) → ONE small "PR #608 pushed" card with an escaped, never-auto-opened link + PR chips on the session card (session meta `prLinks[]`, restart-safe); `background_tasks_changed` (the full live set of BACKGROUND tasks) → the status bar's "N background tasks" chip and the reconcile that SOFT-closes a backgrounded task card the set no longer names (`finished`, outcome not reported — drawn neutral; a foreground Bash is never closed by it, and the real outcome record that follows overwrites it — r3 2026-09-21); `task_updated {patch:{status:failed}}` closes the task card at once (overriding a level-set soft close). Invariants: a routed name never renders the red card again (test-unknown-records pins the three lists exactly); a field is never deleted from known, only moved to ignored with a reason; an unknown TYPE is the fall-back card only, never doubled as drift; every harness string is escaped and no url is fetched or auto-opened.
- **Session-start card + a live command list (§2.6 of docs/design-harness-features.md, 2026-09-07)**: the claude `system`/`init` frame is kept WHOLE, and four things follow.
  - **A dead MCP server is no longer invisible.** The init card (previously rendered as nothing at all) is one collapsed line — "Session start · N skills · output style: X" — and, when the frame reports trouble, an always-visible health strip in warning colour: every MCP server whose status is not `connected` (statuses are shown verbatim: `failed`, `needs-auth`, …), every `--mcp-config` entry the CLI skipped, and every demoted plugin. Expanding lists skills, plugins (with versions), MCP servers, sub-agents, tool count, output style and the CLI version + betas. The card never claims the opposite ("all healthy"): upstream omits the error keys entirely on some lanes, so an absent key is not evidence of a clean load.
    **How often it appears, measured (round 2, a round-1 claim corrected).** A conversation carries one init record per spawn — every resume, every server restart, every wrapper respawn. Measured on this instance's own `data/session-buffers`, which are a ROTATING window (so these are snapshots, independently reproduced by the reviewer): at 2026-09-07 05:34, **62** init records in 13 conversations, **62 of them carrying a health issue**, and **33 byte-identical ones in a single conversation**; a re-measure at 05:40, after the ring buffers had rotated, gave 30 records / 14 distinct frames / 30 with issues / 6 max. Both agree on the shape — 2×–33× redundancy at a 100% warned rate — so round 1's "one quiet line" was in fact up to 33 warned lines in a single rebuilt history. The card therefore renders **once per DISTINCT frame**: an init whose frame equals the previous init's is marked a repeat and draws nothing, while its side effects (model, permission mode, command list, memory dirs) still apply. A frame that CHANGED always draws — a server that went `connected` → `failed`, a skill discovered mid-session, a CLI upgrade.
    **Who renders nothing.** Producers whose init record carries no frame at all: codex and OpenCode/ACP, whose normalizers build `{model, permissionMode, slashCommands}` only. NOT "old claude CLIs" — in the CLI's own zod schema `tools` / `mcp_servers` / `skills` / `plugins` / `output_style` / `claude_code_version` are REQUIRED (verified on 2.1.238, 2.1.239 and 2.1.257), so every claude session gets a card and the gate must never be described as a version test.
  - **Terminal-bound slash commands are gone from the chat composer.** The frame's `terminal_slash_commands` is upstream's own "subset whose UX is bound to the local terminal … Phone/remote UIs should hide these"; `/doctor` and `/color` used to sit in the completion and do nothing when picked.
  - **The command list follows the session.** A mid-session `commands_changed` push (e.g. skills discovered as the agent works in a subdirectory) REPLACES the completion list — a command that disappeared upstream disappears here — live and on the next attach alike. Same behaviour for OpenCode/ACP's `available_commands_update` and codex's wrapper-served list: one path, no local/remote twin. **The newest frame wins, and that is an ORDERING rule (round 3)**: a conversation re-inits on every resume / wrapper respawn, so a push followed by a later `init` is ordinary — the window that attaches after the restart shows the list the NEWEST init declared, not the pre-restart push, exactly like the window that watched it happen. (An init that names no list at all does not erase the push before it — an absent list is not an empty one.)
  - **Agent-memory cards follow the CLI's own directories.** Read/Write/Edit on the dirs the frame names (`memory_paths{auto,team}`) render as memory operations; the built-in path patterns remain the fallback for older CLIs and other backends. A custom memory directory used to render as an ordinary Write on a long dotfile path. The dirs are learned from the attach payload BEFORE the history slab is rendered (round 2): the attach tail almost never contains the init card, and a rendered card is not re-rendered on a later status change, so learning them after the render loop left every memory card in that window misclassified for its whole life.
- **Review / rename-writeback / fork-from-here are capability-gated (§2.13)**: the Review chip and its detached-review poll, the codex thread-name writeback **and the sidebar rename that triggers it**, and the per-message "fork from here" button **and its click handler** (BOTH HALVES of every one of them — a control drawn on caps whose action still gates on a backend id is a dead control, and an action ready on caps whose trigger still gates on an id never fires) all read `backend-caps` rows (`review`, `renameWriteback`, `forkAtMessage`) instead of a backend id; a click that cannot proceed because the session id is not known yet says so in a toast. `forkAtMessage` is deliberately separate from `fork`: claude can branch from ONE message (`--resume-session-at <uuid> --fork-session`), codex's `thread/fork` branches the whole thread — so the per-message button appears only where it can actually work.
- **Codex sub-agent chatter is ATTRIBUTED (B-7473, 2026-09-06 owner report "根本没区分出这是subagent消息")**: in codex 0.153 multi-agent v2 a root conversation is mostly ORCHESTRATION — spawns, encrypted inter-agent mail, lifecycle events, and the children's reports. VibeSpace renders it in two shapes, never as the root agent's own reply:
  - **Sub-agent report card** — an inbound PLAINTEXT payload (in practice the children's `FINAL_ANSWER`s): the markdown body rendered exactly like assistant text (DOMPurify), under a "water_research · FINAL_ANSWER" head with a tinted left strip and a "sub-agent report" tag.
  - **Compact collab rows** — encrypted inbound mail, outbound `send_message`/`followup_task`, `spawn_agent`, `wait`, and started/interacted/completed lifecycle, one line each with an SVG direction icon; CONSECUTIVE rows coalesce into one message ("3 messages · water_research (FINAL_ANSWER), energy_research (MESSAGE)"). The hover title carries the envelope and says *payload encrypted upstream* when the body was withheld — an encrypted blob never reaches a rendered string.
  **Fold kinds (B-7473 integration 2026-09-06): the ROWS are `collapseKind:'agent'` (orchestration noise, in the default `chat.collapseKinds`), a REPORT is `collapseKind:'report'` and is NOT in the default set** — a child's written answer is the content the owner opened the window to read, and folding it by default hid it behind a one-line summary. 'report' is offered in the settings list so a user who wants the quiet view can tick it (then the header adds "N sub-agent reports"). A fold header reads "N sub-agent messages · N agent ops" and lists "N sub-agents: water_research, interior_research" — **the agent NAME is clickable everywhere it appears** and opens that child's rollout read-only in the existing sub-agent viewer. 0.153.4 puts `agent_thread_id` on every SubAgentActivity item, so the click needs no server call; older rollouts fall back to `GET /api/subagents?backend=codex&threadId=<root>` (the local session tree's `source.subagent.thread_spawn`), and a remote conversation's children are honestly reported as "not on this machine" (toast) instead of a silent nothing. Live and rebuilt views agree: the wrapper's live twin and codex's rollout twin of one message dedupe by id, else by (author, payload) within the turn — **and that content leg only fires when there IS content (B-7473 integration 2026-09-06): an encrypted message has body '' and msgType MESSAGE for every message, so the (turn, author, type, body) key collapsed every message an agent sent in a turn into one (101 of 140 when the verifier measured, 120 of 168 on a re-measure of the same still-growing rollout — all with distinct ids and distinct blobs, so the id leg never fired). Encrypted mail dedupes by id, with the fernet blob's first 32 chars as the content discriminator.** **One agent = one identity (round-5):** codex names a child BARE in the outbound call arguments and absolutely everywhere else, so before the fix the same sub-agent appeared as two chips, the "N sub-agents" count over-reported, and an outbound row had no thread id and so no click-through (measured on the owner's real rollout: 36 identities for 20 children, 98 of 409 rows unclickable → 20 / 20 / 408 of 409 after). **And a child's errors are all shown:** a repeated `errored` used to collapse into the first one, so a later, differently worded failure vanished — errors now dedupe on their own message.
  **Sub-agent lifecycle is ONE row shape, never a card (B-7473 integration 2026-09-06):** started/interacted/completed/interrupted are collab ACTIVITY rows (the old standalone "Sub-agent" tool card is retired), and a lifecycle record whose own id IS the tool call that caused it (0.153.4: started → `spawn_agent` 18/18, interacted → `send_message`/`followup_task` 214/214) draws NO second row — the call's own row already said it — while still teaching the agentPath → thread-id map the click-through uses. A terminal record synthesises `subagent-completed-<uuid>`, twins nothing, and always draws its row.
  **A CHILD's failure is the child's (B-7473 integration 2026-09-06):** the app-server relays an `error` notification for every thread it hosts and `ErrorNotification` carries `threadId`, so a sub-agent's error used to surface as the ROOT conversation's failed turn + error card. It is now a collab activity row ("water_research errored", the message on hover). The wrapper's thread gate is INVERTED — any notification NAMING another thread is foreign unless allowlisted, instead of a method whitelist that goes stale.
  **LIVE PROGRESS ON A CONTINUOUS BURST (2026-09-07, owner: “这种互聊如果连续发生是不是应该界面里展示下连续数量，这样我好知道对话没卡住”):** dozens of encrypted one-line rows over minutes, with no assistant text between them, look exactly like a wedged turn. Three surfaces now say otherwise, all derived from the rows themselves (nothing stored, nothing counted server-side): the coalesced card's HEAD (“Sub-agent traffic · 47 messages · 3 agents · last 4s ago”), the RUN HEADER / floating run bar / run footer (“… · 3 sub-agents · 47 messages · last 4s ago” — the surface a reader with the run folded actually sees), and the SPINNER line (“Sub-agents working — 47 messages **this turn**, last 4s ago”, which yields back to the server's own activity label the moment any other record lands, and returns when collab traffic resumes). The three are three SCOPES of the same traffic — the card head counts that card, the run header that run, the spinner the whole turn — so they can show different numbers at the same instant; the spinner is the one that floats free of what it counts, so it is the one that says “this turn”. The age TICKS at 1s granularity under a minute then whole minutes, from ONE interval per chat window that no-ops while the window is hidden; a lifecycle event (started/interacted/completed) counts like a message, encrypted and plaintext count alike, and the normalizer's dedup twins (an id re-read, a repeated (thread,kind) lifecycle) are never counted twice. When the turn ends — or the card stops growing because something else arrived — every age FREEZES to the absolute span (“over 4 min 12 s”), and a reload / read-only view shows those frozen totals with nothing ticking. Each row's hover title now leads with its time and says whether that clock is the ROLLOUT RECORD's own timestamp or the moment VibeSpace saw the line. Two properties the readout must never cost you: the **Stop button is untouched by the ticking** (the label is a text node of its own, so the button never blinks out from under a click and keyboard focus on it survives — an interrupt swallowed by a rebuilt button would be a silent failure), and a burst that starts and ends **while the window is on another desktop** still shows its frozen span when you come back, never a “last 0s ago” on a turn that finished minutes ago.
- **Design canvas chip (2.366.0)**: status-bar chip (SVG, next to the goal chip; live windows only) → popover with design-kit status, a brief, a public-link toggle and Create → a VISIBLE `[VibeSpace design request]` message tells the agent to run `vibespace-page kit`, follow `<dir>/SKILL.md` (the bundled /design skill's instructions extracted from the installed CLI and adapted so the publish step is `vibespace-page publish`), and reply with the share link; the popover lists the session's published pages (Open / Copy link / Public↔Private) and updates live on `page-published`. Hosted canvases are view + PNG/PDF export (no online Save). Full essay: kb-file-structure `src/server/design-kit.js`.
- **Context-full guidance + guarded compaction (2.365.0)**: a `prompt_too_long` result error is normalized with `errorKind:'prompt-too-long'` (message-manager `classifyResultError`, live + history) and rendered as a guidance card (chat-renderers `appendContextFullCard`): explanation, **Compact now** (sends `/compact` via `ChatInput.sendText` — null-safe; view-only windows drop the button), and the "Conversation too long → rewind in terminal mode" escalation. A `/compact` send sets `session._streamingKind='compacting'` + a descriptive label (ws-handler), broadcast to all clients and carried in the attach meta; while the kind is active the chat-input Stop button is a two-step confirm (armed 4s as "Cancel compaction?"). Reason: the CLI's only "Compaction canceled." path is an abort, and large-conversation compactions run 1–2 minutes — a reflexive Stop threw the attempt away (userN incident). Do not regress: the kind resets with the label at turn end (session-stdout), and every streaming-label broadcast carries it (API-retry relabels must not drop the guard).
- **Search cards show their query in the title + codex web searches are complete cards (2.369.43, owner report: every codex web_search card read `{"query":"","action":null}` / "(empty)")**: every search-kind card — claude WebSearch (query) / WebFetch (url), codex `web_search` (query, or the action's queries/url), ACP search tools — carries the query as a muted `.chat-tool-query` chip in its header (escaped, ~90 chars, full text in the tooltip), so a fold of "3 web searches" expands to readable titles without opening Input. Codex: the v2 WebSearchItem is an empty stub at item/started and complete only at item/completed, and a 0.153 rollout persists the search ONLY as `event_msg web_search_end` (which the normalizer used to skip — rebuilt histories rendered no search at all). The wrapper now relays that completion in codex's own shape, the normalizer merges the final query/action into the pending card and renders the results as "title — url / snippet" blocks (`opened <url>` / `found '<pattern>' in <url>` for page actions; 20 results / 4 KB caps; error ⇒ error card) — one renderer for live and rebuilt cards (src/search-card.js), one card per call_id however many copies arrive (live twin, rollout twin, the 0.14x id-less `web_search_call` item). The fold summary line is unchanged. Gates: test-search-card-title (35), test-codex-history web-search block, test-codex-p2-wrapper.
- Chat view: structured message display with markdown rendering
- **Run folding (`chat.collapseRuns` default ON, `chat.collapseKinds` = the semantic kinds that fold TOGETHER as one interleaved group; per-kind counts + touched-file labels since 2.369.33/.34; honest lookups + expanded-run legibility 2.369.37)**: consecutive foldable cards collapse under ONE `.chat-run-header` summary line ("9 Bash · 1 tool lookups · 1 ✗ — ✎ a.js, b.js"); the header is a non-`.chat-msg` list child (invisible to the virtual-scroll window accounting, trims, minimap, search and the seek anchors — everything selects `:scope > .chat-msg`) and the members stay DIRECT list children that only get class-toggled (`.chat-run-collapsed` = display:none) — the list is a FLAT list, runs are never wrapped. Classification + label composition are PURE (`src/lib/chat-run-summary.js`: `messageKind` semantic `collapseKind` hint first, claude tool-name map fallback; `runSummaryParts`/`runSummaryLabel`; `countKinds` zero-fills every kind so a new kind can never vanish as NaN). **ToolSearch is a `lookup`, not MCP** (owner-caught "1 次 MCP" over a run with zero MCP calls): it folds under the MCP toggle (`foldToggleFor('lookup') === 'mcp'` — no new checkbox, customised kind lists keep folding exactly what they fold today) but is labelled "N tool lookups"; the MCP count and the "(server)" suffix cover only real `mcp__server__tool` calls. Pending-permission cards never fold and BREAK the run; a null kind also breaks it (every new tool name needs a kind). **Expanded runs read as ONE group at any scroll position (2.369.37; DOM shape):** (i) every member of an open run carries `.chat-run-member` (+ `.chat-run-first`/`.chat-run-last` on the ends) → continuous accent rail (`--chat-run-rail`, falls back to `--accent`) + 5% tint; border role-mode recolors the role bar, the other modes paint an inset box-shadow (no layout shift, contain:paint-safe); the open header (`.chat-run-header.open`) and (iii) the bottom line `.chat-run-footer` ("⌃ Collapse · <label>", same non-`.chat-msg` family, inserted after the last member ONLY while open, removed/re-inserted by every `_updateRuns` pass) bracket the members; (ii) `.chat-run-bar` — ONE floating element per ChatView appended to the `.chat-view` container (never a list child), pinned to the message list's top edge while an open run's header is scrolled above the viewport and its footer is still at/below it; shows the run label + `.chat-run-bar-top` (SVG arrow-up-to-line: scroll the header to the top, run stays open) + `.chat-run-bar-collapse` (SVG chevron); a click/tap ANYWHERE on the bar collapses (touch-friendly, no Esc — `data-popover` owns Esc). Bar/footer collapse = `_collapseRunTo` → fold + `_landOnHeader`: ABSOLUTE `scrollTop = header.offsetTop` under the `_programmaticScroll` mute (the header takes exactly the spot the bar occupied; pin state re-derived from the landing) — never delta math (2.229.1). The bar's state is computed in the existing rAF-coalesced scroll handler from `_runs` (`{header, members, footer, label, open}` rebuilt per pass) with the frame's single geometry read, cached current run re-checked first, hidden while suspended/searching, and it makes NO paging/pin decision. **A click on a run header always wins (2026-09-06):** while pinned to the live tail only the LAST run keeps an INHERITED open flag (a run expanded to watch output re-folds once the tail moves past it), but a run the user opened deliberately is never re-collapsed by the pass its own toggle causes — that pass used to close it ~180ms after the click, making every non-last header a no-op while pinned. While the bar is up, the position pill and the history-load pill drop below it (both are `.chat-view` overlays, both positioned by the stylesheet — never inline). Test: scripts/test-fold-ux.mjs (node unit over the pure module + a headless-chrome fixture with TWO runs: rail classes, bar label, collapse within ±8px of the header, footer only while open, pinned click-vs-auto-refold both ways, pill placement).
- Permission approval: interactive Allow/Deny cards for tool permission requests (`--permission-prompt-tool stdio`)
- Permission mode dropdown: click lock icon in status bar to change mode mid-session (modes from `claude --help`)
- Compact mode (default): document-style layout with role labels (You/Claude)
- Role indicator styles: `chat.roleIndicator` setting — border (default, continuous colored bars), background, icon, label
- All tool_use rendered as collapsible cards with first-line preview. Non-file tools show Input while running. Per-tool open-in-editor button. No output truncation. Unified error styling.
- **Image media cards (2.369.48, owner: "view image 能不能也多媒体化：可以展开直接看到图像内容，点开可以放大")**: every image a tool LOOKED AT — a claude `Read` **whose result carried image blocks**, codex `view_image {path}` / a 0.153.4 rollout's `ImageView` item, any tool whose input names an image file — renders as ONE media block: `<details class="chat-media">` OPEN by default with the file's basename + type/size chip in the summary and the thumbnail (≈360×260, `loading="lazy"`) in the body; click = the standard `.chat-img` zoom overlay. The thumbnail is the FILE from disk via `/api/file/raw?path=…` (+`&host=<hostId>` for remote sessions — the file viewer's own route, dispatched to the owning machine), never bytes in the message (2.369.35 law; codex `input_image` output blocks are lifted the same way). **THE LIFTED BLOCKS DECIDE WHAT AN IMAGE IS, NEVER THE EXTENSION** (a refuted first cut classified a `Read` by extension and silently dropped the source): claude returns numbered TEXT for a text-source image format — measured for .svg (real fleet shape, cli 2.1.85: all 10 local `Read *.svg` results are plain strings starting `"1\t<svg xmlns=…"`) — that keeps its normal code-block card with the whole source, and, only because the browser can draw those types, gets a thumbnail appended BELOW the code block. The extension answers exactly one question, *can the browser decode this as an `<img>`* — so a tiff/heic `Read` that DID return image blocks is an image card showing the type/size chip with **no `<img>`** (an unrenderable format must not become a broken thumbnail). An image with no path on disk (an MCP screenshot tool's inline result) stays a size chip; a thumbnail that fails to load (file gone / viewed from another machine) swaps to "Image not available on this machine". **THE IMAGE CARD ITSELF IS EXEMPT FROM THE FOLD, NOT ITS RUN (image-card review round 2, 2026-09-06)**: 'image' ships ON in `chat.collapseKinds` and a lone tool card folds, so every media card first shipped collapsed into "1 image read" — `display:none`, invisible without a click, and the lazy thumbnail never fetched. A first cut exempted only runs made ONLY of image views, but in real sessions the card sits BETWEEN foldable cards (Bash → Read(png) → Bash) and stayed hidden inside "2 Bash · 1 image reads". Now the fold closes AROUND the image: the media card stays visible and expanded while its neighbours collapse under one header that still counts it ("1 image reads"); an open run gives it the same grouping rail as the rest. A run with nothing left to fold (every member an image) shows no header at all. The same evidence rule governs the fold kind — a `.svg` Read that came back as text is an ordinary file read, not an image. Harness-supplied inline images (ACP/claude user attachments) keep their data: URL inside the same wrapper. Non-image cards are unchanged. Gates: scripts/test-image-cards.mjs + the test-fold-ux browser fixture (bash|image|bash: the media card really renders, the Bash cards fold).
- Relative-path linkify (2.75.0): a `code` span that IS a relative path or bare filename (`B2BTasks/x/final/`, `SCRIPTS.md`, `generate.py` — how agents actually reference files; absolute-only linkify missed all of them in real transcripts) becomes a `chat-link-rel`; Ctrl+click resolves it at CLICK time against the session cwd (probe order: cwd/rel → overlap-merge on a shared segment (`B2BTasks/...` from cwd `.../B2BTasks`) → cwd-parent/rel → **bounded locate fallback (2.75.1)**: `GET /api/file/locate` = `find <cwd> -maxdepth 5` basename search, deps/VCS pruned, 3s kill, ≤16 hits, local-only, user-click-initiated — one hit opens, several show a picker, tail-matches of the full rel preferred (real case: `SCRIPTS.md` living at cwd/default_voice_examples/); host-aware; first existing wins → viewer/explorer). Guards: no spaces, needs a slash or a ≤8-char extension, rejects digit/dot/slash-only tokens (versions, IPs, CIDR — `10.0.0.0/8` was a live false positive). Agents are also TAUGHT to prefer absolute paths (SESSION_TOOLS_INTRO + renderContext line). ```html code blocks get a Preview toolbar button (blob URL → embedded browser). **Local paths NEVER open as http (2.100.5, real report):** a markdown link to a local file `[doc](/home/x/y.md)` renders `<a href="/home/x/y.md">` → the click handler treated href as a URL → `window.open('/home/…')` → browser resolved it to `http://<host>/home/…`. `_linkTargets(link)` (shared by the click + contextmenu handlers) reclassifies any href matching `^(\/[^/]|~\/)` that isn't a real URL scheme (`https?|ftp|blob|data|about|mailto`) as a FILE PATH (fp), so it opens in the viewer and the Open/Copy labels are right. Bare (non-markdown) absolute paths already classified correctly via `linkifyPathsTagSafe` — this covers the markdown-link case.
- Message metadata popup (2.74.0): right-click a message's LEFT indicator strip (≤18px from the edge; long-press on touch) → `.msg-meta-pop` with role/time/model/token usage (input, cache read/write, output)/service tier/stop reason/requestId/message.id/uuid/transcript line, copyable ids + Copy-as-JSON. Data = `msg.meta` threaded by the normalizer per assistant record ({model, usage, requestId, msgId, stopReason}; streaming edits refresh it so the final usage wins); normal right-click elsewhere keeps the native menu. **2.266.1: + an async Billing-account row** — resolved from the usage ledger by requestId (`GET /api/usage-stats/rid-info` → usageHistory.eventForRid) showing account name + `· via pool "X"` when the request flowed through a pooled identity, or "not in the ledger yet" before the scan absorbs it (with auto-switching moving billing mid-conversation, per-message attribution is user-visible truth). **2026-09-06 CODEX PARITY (owner: "codex会话是不是依然看不到每条消息的详细信息、计费账号、使用模型")** — the codex normalizer threaded no meta at all. Now every codex assistant/tool message of a model response carries the same meta shape, attached at that response's `token_count` (codex reports usage per response, after its items — kb-file-structure codex-message-manager.js essay): Model (turn_context), Input tokens (FRESH = input − cached, matching the ledger), Cache read, Cache write (codex's single count), Output tokens, **Reasoning tokens** (new row, codex only), **Effort** (new row, the turn's reasoning effort), **Ledger request key** (`cx:<thread>:<cumulative total>` — the synthetic key the ledger already uses for every scanned rollout, labelled honestly instead of "Request ID"), **Response ID** (`resp_…` from the 0.153 `token_usage_record`, absent on older rollouts / the live stream — never invented), Time, uuid, Transcript line; live windows receive it through the same 'edit' op. **Fallback rows (verifier 2026-09-06):** when the record's own meta carries no model/effort (a pre-meta rollout, a slab with no turn_context), the async rid-info answer appends Model / Effort from the ledger event (the route's `model`/`effort` fields now have their consumer) — appended only when the sync rows lacked them, never duplicated. The ledger key is keyed by the rollout FILE's uuid (a sub-agent rollout also carries its PARENT's session_meta — "last wins" mis-billed 11 local rollouts to the parent's account) — and in a MERGED fork read by EACH record's own file (round 3: the reader tags every record with the rollout it came from; a reader-wide pin keyed the parent's half of the conversation under the child's id, keys the ledger never minted), a mid-life thread/fork re-points the live default with the wrapper's own wrapper_meta, and a re-emitted duplicate token_count never re-stamps the next response (kb-file-structure codex-message-manager.js). Billing row: rid-info joins on the ledger key first, the response id second (walker v3 bakes `mid`+`effort`; ssh scanner mirrored, parity-pinned); the session-level fallback now actually names the session's auth (it read fields the auth object never had — dead for every backend): pooled → "pool → target", codex account name, 'ChatGPT login', subscription name / 'CLI login', API key/Console; a global-bucket codex event says 'ChatGPT login', not 'CLI login'; the local "not in the ledger yet" state carries that identity too. Claude rows unchanged (no kind markers ⇒ old labels; no reasoning/effort/cache_write fields ⇒ no new rows). **THE EFFORT ROW IS THE TURN'S, AND 'ultra' NAMES ITS OWN LEVEL (2.369.62, owner "我刚才把那个van的对话调成了 ultra, 但我看它回复怎么都 metadata 显示的是 xhigh?"):** the row shows the effort of the turn THIS message belongs to, never the session's current pick — a mid-turn re-pick does not retro-label messages the running turn already produced, and the next turn's own `turn_context` is what moves it. Two facts now travel separately everywhere (`effort` = the running/last turn's, `effortNext` = the pending pick): the attach payload, the wrapper's status record, the normalizer's `_status`, and the `{op:'meta', subtype:'effort'}` push that moves the status-bar chip live. The chip shows what applies going forward (matching the optimistic click); its TOOLTIP names the running turn's value when they differ. And because codex's 'ultra' is a delegation MODE rather than a reasoning level — the model really reasons at the served model's catalog `multi_agent_reasoning_effort` — both the popup row and the chip tooltip render through `effortDisplay` and read "ultra (multi-agent · reasoning xhigh)" when the catalog names the level, plain "ultra" when it does not (gpt-5.6 sol/terra support ultra and name none). The level is READ from `/api/available-models` (server.js carries it out of codex's own `~/.codex/models_cache.json`), never hardcoded — it is per-model and moves with every codex release; the decoration gates on the harness META's `multiAgentEffort` row, never on a backend id or on the string 'ultra'. **"Auto (model default)" really clears it (r2 review):** picking the empty row makes the wrapper clear the thread's effort and publish `effortNext: null`, and that null is what the session remembers — it used to fall back to the LAST TURN's level, so the cleared pick came back in session-meta, in the attach payload, on the chip after a server restart and on the next resume spawn. **A refused setting says nothing:** if the app-server rejects `thread/settings/update` (older build, unknown method) the per-turn value on `turn/start` still applies and the pending pick still shows, but nothing records that the THREAD was reconfigured.
- System notifications: `<task-notification>`, `<system-reminder>` etc rendered as collapsible dim cards
- Background task tracking: Agent (`task_started`) and background commands (`run_in_background`) shown in status bar with click-to-view popup
- TODO display: above input area, shows current in-progress item from TodoWrite, click for full list popup
- Subagent viewer: unified virtual session architecture (server-buffered), standard read-only ChatView for both live and completed agents
- Ctrl+F search with highlight, match counter, prev/next navigation
- Auto-detect URLs and file paths with VS Code-style character exclusion regex, `:line`, `:line:col`, `:line-line` suffixes (click=copy with tooltip, Ctrl+click=open; touch devices: tap=Open/Copy menu; right-click/long-press=same menu everywhere). `_linkify` is HTML-aware (splits tags/text, skips `<a>` tags, linkifies inside `<code>` blocks). Markdown `<a href>` tags also intercepted (same behavior).
- Code block toolbar: Copy button (strips line-number gutters, keeps diff +/- prefixes), Wrap toggle, language picker — always visible on touch devices (hover-gated on desktop)
- Pre block wrap toggle (hover to show)
- Markdown tables wrapped in `.chat-table-wrap` (overflow-x:auto) at render time (`ChatRenderers._wrapTables`) — wide tables scroll horizontally instead of overflowing; cells are `white-space:nowrap` so the table keeps natural width and the wrapper scrolls (essential on mobile, which otherwise can't reach off-screen columns)
- Streaming/activity indicator above input bar (always visible): thinking/running ToolName/responding. Mid-stream detection on attach via `isStreaming`.
- Interrupt result labels: maps `subtype` to human-readable label (error_during_execution -> "Interrupted", error_max_turns -> "Max turns reached", etc.)
- Delayed-fallback interrupt: control_request protocol first, SIGINT scheduled 2s later and skipped if protocol worked — avoids killing the whole session on newer Claude Code versions where SIGINT exits the process (bugs #17466, #3455)
- Resume button on read-only chat views: `_showResumeBar()` renders "Resume this session" in place of the input area for view-history / terminated / exited ChatViews. Click calls `app.resumeSession()` + closes the read-only window. Subagent viewers (`sub-*`) skip. Unifies the three read-only scenarios so users don't have to go back to the sidebar to continue. **Sub-agent views are the exception (2.369.53, owner report): `viewSession` with agentKind/sourceKind `subagent` (codex collab child thread, claude Task viewer) passes `subagentView` into ChatView and `_showResumeBar` renders a one-line "ran inside its parent" note with NO button — a child thread is read-only by nature, and resuming it would spawn a standalone session on it. Pinned by test-attach-rescue legs D/E (E = the same transcript as a primary view keeps its button).**
- IME composing guard: `e.isComposing || e.keyCode === 229` check prevents Enter from sending during IME composition
- Collapsible long user messages (>500 chars: shows 120-char preview + total length, Collapse toggle)
- Expandable input (floating button inside textarea)
- Send: Enter (normal), Ctrl+Enter (expanded mode)
- Chat font size follows global A-/A+ via CSS zoom
- Draft persistence: chat input auto-saved every 300ms to server, synced across clients (Telegram-style), restored on refresh/resume
- Upload to chat: drag-drop files/folders onto the chat (desktop) or the paperclip button → Files/Folder menu (mobile) → saved into the session's working directory and the path(s) inserted into the input box
- File-explorer icons colored by category (`fic-<category>` class → CSS tint; folders amber, images purple, video red, audio cyan, code green, …) so types are distinguishable
- **Sidebar scroll preservation is DUAL-HOST + height-reserved (2.228.3, recurring "expand a card → list jumps to top")**: the actual scrolling element MOVED over time (.sidebar-section classically → #all-sessions-list in the rail-era layout), so any preserve anchored on ONE element rots silently into a no-op when CSS evolves — `_render()` and the poll-digest path capture/restore BOTH candidates (non-scroller restore = harmless). Equally load-bearing: lazy folders RESERVE their previous height while `pending` (`_lazyHeights` map captured per render → minHeight in `_observeFolder`, card-count estimate on first render) — without it the rebuilt list's scrollHeight collapses to a stack of headers and the restore CLAMPS to top before the async IntersectionObserver materializes anything. Observer card builds are per-card try/caught (one garbage record — e.g. bad timestamp → RangeError in date format — used to abort the whole batch and leave half-cleared empty folder husks). Smoke: scripts/test-sidebar-scroll.mjs (worktree+CDP, negative-controlled).
- Sidebar jump-to-focused-session auto-expands a collapsed/lazy folder before scrolling; the session list no longer re-renders on every poll — and `syncSessionIdentity` runs on EVERY merge OUTSIDE the digest gate (2.80.1: gated behind it, a freshly loaded page whose windows restored after the first merge never got title-bar billing badges, because the stable digest never re-fired; the sync is internally no-op-guarded so per-poll cost is nil) (startedAt dropped from the change-digest; 2.72.0: digest is also ORDER-insensitive — sorted before compare — because discovery orders by transcript mtime and busy sessions reshuffled the array every poll with zero content change, fully re-rendering every ~5-10s = Remote-tab/expanded-card flicker, measured 5058 entries 0 changed) and preserves scroll position across re-renders
- Syntax highlighting in Read/Write output: 30 languages via highlight.js, auto-detected from file extension, line numbers, searchable language picker dropdown, wrap toggle
- Edit diff view: flex layout with fixed +/- prefix column, suffix context matching, wrap toggle
- JSONL history loaded on resume (full past conversation)
- Window blink on `result` message when not focused
- WebSocket reconnect: auto re-attach all sessions, chat syncs missed messages via `_reattach()`, StateSync resync for drafts/settings
- Disconnected input stays interactive: `setDisconnected` does NOT disable the textarea (disabled blocks text selection) and the CSS has no pointer-events:none — user can select/copy/keep drafting offline; only `_send()` is guarded (toast, draft kept). Send button dimmed via `.chat-input-disconnected`
- Virtual scroll: sliding DOM window trimmed by HEIGHT on extend (keep zone = viewport ± 1 viewport; ~150 cards a soft target, FOLD_DOM_CEILING the bound), pinned ⇔ at the live tail, a wheel's overshoot carried into the landing (≤ 1 viewport per landing), deferred live messages when viewing history
- Scroll minimap: semantic turn-based navigation, user message markers, compact markers, drag-to-jump, two-line floating preview label (time + 60-char preview), hovered marker lights up, and an outline (TOC) button at the top of the track — filterable list of all user messages, click to jump, works in both index and time coordinate modes
- Pin-to-bottom: iterative scroll convergence (10 rAF frames) for content-visibility compatibility

#### Turn truth: whose word "a turn is running" is (B3, design-harness-features §2.5 / §3.5)
Everything that asks *is this session working right now* — the composer's Stop button, the session card's chip, auto-resume's "it is already working" skip, the attach payload — reads ONE flag, and until this batch that flag was always INFERRED from record shapes. Claude Code 2.1.257 publishes the fact instead (`system/session_state_changed`, states `idle | running | requires_action`), so VibeSpace now sets `CLAUDE_CODE_EMIT_SESSION_STATE_EVENTS=1` on every claude **chat** spawn (the one spawn default this batch changes; pure observability, no behaviour change inside the CLI) and drives the flag from the harness's own word.
- **The third state is new and visible.** `requires_action` means the turn is PAUSED on the user — not finished. It draws a "waiting for you" chip in the chat status bar (`.chat-status-needs-action`, the same 1.6s pulse as the remote-transport chip). Before this, "the agent is waiting for me" could only be guessed from *is a permission card on screen*, which is blind to an MCP elicitation, a `request_user_dialog`, or a tool waiting on the host. **`idle` and `running` draw nothing**: the composer's spinner already says that, and one fact must not have two voices.
- **…and the chip is the ONLY place that third state is said** (round 8, a reproduced defect). `requires_action` writes nothing to the composer's spinner line — the line keeps the derived label the assistant records gave it ("running Write") straight through the pause. The rule is not symmetry, it is retractability: the wire's resume record is a bare `{state:'running'}` that does not name the tool now executing, so a line whose truth ends when the pause ends can never be taken back. The shape that wrote "waiting for you" there left it on screen for the entire tool run — minutes, for a `Bash` — while the chip had already flipped back to `running`, i.e. two surfaces answering one question in opposite ways. The only spinner lines the turn state may write are the two that cannot go stale: `''` on `idle` (a retirement) and `thinking...` onto an empty line.
- **Every live claim dies with its producer.** A session that is terminated or crashes while parked keeps no chip: the client's `exited` branch calls ONE named retirement (`_retireLiveClaims`) that clears the compaction stage, the turn-state chip (`null`, which is *nobody reports a state any more* — never `idle`, which would be a claim about a dead process) and the executing-tool run set. The enumeration lives in that one method precisely because the first version of it retired only the compaction stage and left the chip pulsing forever; a new "right now" claim goes there and gets a row in `scripts/test-turn-truth-ui.mjs` ⓪b.
- **A `result` no longer ends a turn the harness says is still running.** The CLI's own `idle` fires *after* heldBackResult flushes and its background-agent loop exits — strictly later than the `result` record we used to end turns on. That gap is where "the agent looks done but is still working" lived.
- **Degradation is the default, not an error path.** An older CLI, or any session spawned before this shipped, never emits the record; `session._turnStateSeen` stays false and every derived write (result / compact_boundary / user) keeps working exactly as before. The attach payload's `turnState` is then `null`, which is **not** `idle` — the client draws nothing rather than asserting a state nobody reported.
- **One backstop, and it says when it fires.** The 2.339.2 wrapper-sidecar heal is still there for a lost `idle`, but the sidecar is a DERIVED observer: under authority its settle window is 30s instead of 3s, and a heal that fires anyway emits telemetry `turn-state-stale`. A session can never be wedged on "thinking" forever, and an override is never silent.
- **Which tool is actually RUNNING — NOT SHIPPED, and deliberately claimed as such.** claude's `set_in_progress_tool_use_ids` would be the tool-granular truth (a pending card is not a running one: between parse and execution a tool can sit on a permission prompt), and the whole lane is written — consumer, `tools-in-progress` broadcast, attach field, the `.chat-tool-inflight` dot. **But the record never reaches a stream-json consumer**: 2.1.257 hands it to a host callback (`onInProgressToolUseIDs`) and returns. Measured on the wire in the wrapper's exact spawn shape — 6 tool_use / 6 tool_result, 0 records, while `session_state_changed` arrived on the same stdout — and across 24 production buffers (212 tool_use blocks, 0 records). So **`caps.inProgressTools` is false on every harness and no user sees that dot today**. `scripts/test-stdout-registry.mjs` re-measures the live wire on every run and goes red (naming the two files to edit) the day a CLI forwards one.
- Caps rows: `turnState:'authoritative'|'derived'|null` + `inProgressTools:bool` per backend (claude authoritative — verified on the wire; codex authoritative via turn/started+completed; opencode/ACP authoritative via the prompt stop reason; shell null. `inProgressTools` false everywhere), mirrored on the client — the chrome gates on the ROW, never on a backend id.

#### Compaction says what it is doing (§2.11)
Compaction used to be a black box behind one hardcoded apology ("Compacting a large conversation takes 1–2 minutes — do not press Stop…"). The CLI's own channel for it is `system/status`:

    system/status {status:"compacting"}          ← the stage begins
    system/hook_started SessionStart:compact     ← the one intermediate stage
    system/status {status:null, compact_result:"success"}   ← the outcome
    system/compact_boundary {compact_metadata:{trigger:"auto", …}}

(verbatim from a production buffer: a real AUTO compaction, 997587 → 11159 tokens, **174751 ms** — the apology's "1–2 minutes" was optimistic). The spinner and the "Compact now" guidance card follow that lane, so the apology is now only the FALLBACK, shown while no stage record has arrived; at the end the card reports the real outcome instead of reverting to "this takes 1–2 minutes" for something that already finished. The kept end-state belongs to THAT compaction, not to the view: cards already on screen keep the outcome, but a card built AFTERWARDS opens on the actionable guidance again (`compactInFlight()`) — otherwise the first compaction of a view, including the AUTO one nobody typed `/compact` for, silently replaced the rewind-and-retry sentence for the rest of the view's life. Only the CLI's own `compact_result:"success"` is reported as *finished*; a `compact_end` with no outcome (a PreCompact hook BLOCKING the compaction emits a bare `status:null`, and the dormant `compact_progress` lane always sends `result:null`) says "Compaction ended." — nothing was compacted, and the card must not claim otherwise. Card-less by design, exactly like `api_retry` (2.284.2). The Stop two-step guard now arms from the wire too, which finally covers **AUTO compaction** — the case the user never typed `/compact` for, and the only one a long session ever hits (the send-site label structurally cannot see it). Same subtype, same shape, different meaning: a bare `{status:null, permissionMode}` is the CLI's permission-mode echo and is ignored — an outcome field is what makes the record ours.

The *declared* `compact_progress` record (`hooks_start{hook_type}` → `compact_start{hint_text}` → `compact_end`) is richer, and its reader is kept for shape parity — but **no VibeSpace-spawned CLI has ever emitted one**: the host's `onCompactEvent` consumes it (a TUI spinner store) and forwards only its `sdk_status` twin, the record above. 24 production buffers: 1 compact_boundary, 0 compact_progress.

#### Retracted history is visible (§2.10 / §3.2)
Two harnesses tell us on the live stream that part of the conversation has been taken back, and both used to be dropped:
- **claude `tombstone` — UNVERIFIED on our wire; in practice this lane is codex-only today.** The record supersedes a previously-yielded message (typically a streaming→non-streaming fallback's partial orphan) and instructs *"consumers that render or persist the stream should remove the referenced message"*; VibeSpace does both, so such an orphan would live in the transcript forever, and the handler HIDES it. But no VibeSpace-spawned CLI has been observed emitting one: 0 in 24 production buffers, 0 in the live wire probe, and 0 of 7450 files under `~/.claude/projects/` contain the type — so a transcript rebuild cannot produce it either. Unlike `set_in_progress_tool_use_ids`/`compact_progress` it is not *disproven* (it is yielded on the query stream, not handed to a callback); it just needs a server **refusal fallback**, which is both rare and not something a test may deliberately provoke. The code and its rendering stay, pinned by tests, for the day it happens.
- **codex `thread_rolled_back {num_turns}`** — a rollback made from the codex TUI. It was in the normalizer's skip set since the codex normalizer existed, so the dropped turns stayed on screen as history the agent no longer has. The rolled-back turns are now STRUCK IN PLACE, dimmed, wearing a "rewound" tag, with a system notice that names the number ("Rolled back 3 turns"). They are not hidden: hiding them would silently rewrite what the reader remembers reading.
Both land on ONE normalized `rewound` meta op, and both are applied **inside the normalizer**, so the retraction is visible on the live stream AND on a reload of the transcript. Messages are MARKED, never spliced — the virtual window's indices and `total` are load-bearing, and re-indexing them under a reader is where three separate paging incidents came from. Rewound turns drop out of the minimap's turn markers.

#### Auto-continue after a usage limit (2.368.0 claude; GENERIC over every harness 2026-09-08)

Owner ruling: *"auto resume 应该是通用的, 只要支持 hook/注入的 harness 都支持, 形式可以不一样 — 有些是发消息, 有些是 start turn 之类的固有指令."* Everything about the feature is VibeSpace's own and harness-neutral — the 30 s timer, the loop breaker, the notices, the tri-state gate, restart survival (`src/server/auto-resume.js`). Exactly **two** facts differ per harness and both live on the DESCRIPTOR, so `capsOf(backend).autoResume` is DERIVED (`deriveAutoResume`, written by the registry at load) and every surface that offers or acts on the feature reads that row, never a backend id:

| harness | limit SIGNAL (`quota.signalFromStream`) | resume VERB (`descriptor.resume.form`) | offered? | since |
|---|---|---|---|---|
| claude | `rate_limit_event` (status rejected) + the limit banner | `message` — a user message on the CLI's chat stdin, exactly as a typed one | yes | 2.368.0 |
| codex | `task_failed` carrying the typed `codexErrorInfo` + a `rate_limits_updated` whose `rate_limit_reached_type` names a tripped window | `turn-start` — the wrapper owns the app-server RPC connection, so an idle thread gets `turn/start` (the SAME lane the delivery ladder's `rpc-queue` rung uses; no second injector) | yes | 2026-09-08 |
| opencode / any ACP v1 agent | **none** — ACP's `usage_update` is context size, not a subscription window | `prompt` — the shared acp-wrapper dispatches `session/prompt` when nothing is running | **no** (the verb exists; nothing can ever arm it) | verb 2026-09-08 |
| shell | none | none — there is no agent to restart a turn on | no | — |

`supported = signal && resume`. The module itself refuses to ARM a harness with no verb (a promise nobody can keep is not made) and the chip is drawn only for `supported`, so a harness cannot inherit a control nothing serves. **Adding a harness is two descriptor fields, not a branch**; scripts/test-harness-contract.mjs re-derives every row from its descriptor, drives an arm→fire through each declared verb into a stub of that harness's own channel, and censuses the auto-resume sites for backend-id gates.

**ONE CARD PER CONTINUE (2.369.97, owner: "为啥每次续跑会同时发两个续跑通知").** A delivered continue used to leave TWO artefacts in the conversation: the prompt itself (a user-role record the CLI needs, rendered as the labelled "VibeSpace auto-resume" card) AND a separate "来自 VibeSpace 的消息" notice card saying why ("账号 X 已恢复可用，已自动继续这个任务。"). One event, two cards, read as two notifications. Now the CAUSE rides the prompt: `deliver()` hands `continueNoticeFor`'s sentence to `sendToSession` as `{note}`, server.js stamps it on the record (`originNote` for claude, `payload.webui_origin_note` for codex), both normalizers carry it as `msg.originNote`, and the card head reads "VibeSpace auto-resume — <cause>" (escaped). `announce()` then sends NO notice for a delivered continue (it still stamps the per-window budget so a later refusal notice about the same target paces itself); the refusal / far-reset sentences, which have no card of their own, still go out as notices. **AND A SYNTHETIC REJECTION IS NOT A USAGE READING** (same report: "等待续跑的时候状态栏很多东西会消失，比如 context 信息"): the CLI answers a limit/credit rejection with an assistant record whose `model` is `<synthetic>` and whose `usage` is all zeros — no API request happened — and the normalizer published those zeros as a `meta/usage` op, so the status bar's context% and cache chips (drawn only when the last input count is non-zero) vanished for the whole wait. `syntheticUsage(raw)` in message-manager drops the op, `chatStatus` (the attach payload) skips such records when picking `lastUsage`, and `updateUsage` keeps the last real reading when handed an all-zero one (belt). Gates: test-auto-resume (the cause on the prompt, no second notice), test-auto-resume-loop (§3b + the gate legs read the note off the delivered prompt), test-owner-batch-2369-32 (both normalizers, the renderer head, the synthetic-usage op, the belt + chatStatus pins).

**Two things the 2026-09-08 work added for every harness at once:**
- **The FRESH-WINDOW edge.** A quota reading used to DISARM a waiting session ("a bucket has room"). For claude that was merely useless — its readings only arrive while a turn is running, and that turn's own result disarms anyway — but codex's app-server pushes `rate_limits_updated` to an **idle** thread, so the same line silently broke the promise. A reading is now JUDGED (PURE `src/auto-resume-signal.js`): if it is about the same limit **lane**, states the **bucket** the session is waiting on, and reports nothing spent, the wait is KEPT — the continue goes out now, through the normal fire path (loop breaker, hourly cap, same-identity quarantine and the pre-fire gate all still apply). Anything else leaves the wait exactly where it is.
- **The edge is SINGLE-SHOT per wall (r2, and the number is the point).** A reading is a CLAIM; the CLI's answer outranks it. The producer that made the reading keeps making it — codex pushes `rate_limits_updated` to an idle thread every few seconds — so an un-guarded edge re-enters the fire path on every one of them and the only ceilings left are the breaker's, which are **per hour and reset every hour**: measured against the real modules, [3,3,3,3] = 12 billed continues over four simulated hours, ~72/day, for the LIFE of a watch (six days in the incident), against **1** with the rule. So a reading-driven continue is spent **at the delivery** (`edgeSpent`, keyed by the WALL = lane|bucket|scopedName, persisted beside the wait) and only PROOF OF WORK re-opens it — a turn that produced something is the only evidence our continue mattered. Deliberately NOT at the rejection report: that would make the money bound depend on the caller classifying the answer as a wall, and this feature's own incident is a classifier that matched nothing for eight months. A DIFFERENT wall is a different question and is armed fresh (the belt there is the hourly cap). The TIMED path is untouched — it is paced by real reset times and still delivers when the window genuinely rolls. A refused reading is reported by NAME (`already-refuted`, "the window reads open but a continue onto this wall was already refused"), never as "the wall is still up".
- **The journal says what HAPPENED — and the line is written by the code that DELIVERS a continue (r3).** Round 1 wrote "continuing now" once per READING, before attempting — 492 lines for 12 actual continues, in the exact channel this incident was diagnosed from ("ZERO [auto-resume] lines for that session"). Round 2 moved it after the attempt but read `attemptFire`'s return value, and that value is `true` for a gate merely IN FLIGHT — the production gate is `async`, so a VETO journalled a continue that never happened (measured: 100 lines for 0 continues over 100 readings). The edge now hands its own head to the fire and says nothing itself, so one continue = one line by construction.
- **A gate veto is a refusal with a voice and a bounded hold (r3).** The pre-fire gate was the one refusal nothing reported, and because the single-shot stamp is spent only at the DELIVERY a veto left nothing behind — every later push re-entered the gate (a quota probe + a pool re-evaluation each time) for the life of the watch, with nothing ever changing state. A veto is now journalled once per 5 min and HOLDS that wall's reading edge for 10 minutes: the authority said no, so it is asked again on our clock instead of on the producer's traffic (~225 asks/hour becomes 6 at the incident's own push rate). Held, never spent — the gate answers about NOW while this edge exists for a window that opens EARLY, so burning the wall would turn one transient disagreement into a permanent refusal. The conversation is unaffected: the wait stands and the verdict says so (`the window reads open but the pre-fire gate still says blocked — re-asking on a timer, the wait stands`), never "the wall is still up". A refusal is one line per verdict per 10 min, and a monthly SPEND CONTROL (`spend_control_reached`) opens nothing at all — it is a fact about the ACCOUNT with no window to reset, the codex twin of the 2.361.2 incident. `credits.hasCredits === false` is deliberately NOT read as spent: measured, the incident's own login reports it while serving turns normally off plan quota.
- **A far reset is a WATCH, not a refusal.** A reset beyond the 26 h ceiling still never schedules a timed continue ("refuse to sit forever" is intact and costs nothing), but the session is now watched, so the fresh-window edge can continue it the moment the quota is back. The chip and the in-chat line say exactly that and print no clock they cannot keep. This is the half the incident needed: its reset was **six days** out and the window reopened after 32 h.

Instance default: `claude.autoResumeOnLimit` (off). The KEY keeps its legacy prefix — renaming a persisted settings key is a migration, and every per-session override already recorded points at it — but the setting is read for every harness and its copy says so.

#### Stored reset credits at a usage limit (2.369.157, docs/design-reset-credits.zh.md — P1 chunk p1: the verdict, the ladder fork, the modes)

Owner rulings 2026-09-22: automatic consumption is **never** the default; a button wherever an interface exists (codex now — the roster, the wall/arm card and the For-you item, p2); an advanced `auto`. Setting **Settings → Codex → "Use stored reset credits on a usage limit"** = `off` (default) / `ask` / `auto`. WHEN a credit is worth spending is the PURE verdict `src/reset-credit.js`: only at a wall the vendor stated; OpenAI (a credit re-opens the window) ⇒ use it at the wall at once, except the LAST credit with under a tenth of a window left; Anthropic (a refill in place, the weekly reset unchanged) ⇒ only while the remaining time can burn a whole week again at the window's pace, or when the grant would lapse / is re-granted weekly (ready for when Claude Code offers a non-interactive interface — today only the interactive `/limit-reset`, so claude has no row and spends nothing). **The escape ladder forks by warmth:** a conversation in a turn or with a warm prompt cache tries the credit BEFORE a pool switch (a switch re-bills the whole context); a cold one switches first and uses a credit only when no pool member can take it (a pay-per-use usage-credits member does not count). Per mode at the wall: `off` — a chat card names the credits ("N stored reset credits available" + what one would do) once per limit; `ask` — the same card plus ONE For-you decision (with the dialog's sentences and a `reset-credit` action for p2's button), then the switch/wait rungs as usual; `auto` — consumed through the unattended-spend ceiling (fail closed) with a notice naming the account, the wait saved and the credits left. The auto-resume ARM card carries the same `{available, mode, accountKey}` offer. **p2 (the manual use):** both cards carry a "Use a reset credit" button, the `ask` item a button, and the Manage Agents roster a chip + Use… — all opening ONE confirm dialog (see the Manage Agents roster bullet at the top). **The pool default no longer holds a SOFT move for a mid-turn follower** (legacy followers get no compatibility; the proactive warm-cache hold stays; per-session conversations keep the first-stop rule).

**r2 (2.369.157, the verifier round):** one account wall seen by several conversations spends ONE credit — the others wait on it and follow its answer (a reset re-opens the account for all of them; a failure walks each one's switch/wait); a "this limit was already redeemed" answer, or a fresher reading showing the account open, is never treated as a wall (the account is re-read instead of demoted). A Codex pool conversation keeps the login it was started with until it restarts on the new member, so a credit it spends is counted against — and named as — THAT account, the automatic rung refuses to spend it once the pool has moved on (by name), and the For-you item's / wall card's button keeps working through that conversation (charged to the account the credit belongs to). The roster's `· N reset credits` chip no longer disappears after the next ordinary usage update. A cold conversation whose account switch could not happen (a switch moments earlier) gets the credit rung after all. The ws `codex-reset-credit` message is gone — the confirm dialog's route is the only manual path.

#### Response style (status-bar chip; 2.368.0 claude, generalized to every harness 2.369.58)
The chip left of the auto-continue icon sets **how the agent should talk**, and it is drawn for any harness whose `backend-caps` `responseStyle` row lists values — claude's four output styles (Concise / Explanatory / Learning / Proactive) or codex's `Personality` enum (none / friendly / pragmatic, read from the app-server's own JSON schema). The menu rows ARE those values; nothing is hardcoded per backend.
- **The empty row ("agent default") means the key is never sent**, so the agent keeps whatever its own config file says. Codex's `none` is a different thing — an explicit "no persona". Before 2.369.58 VibeSpace wrote `personality:'pragmatic'` into every codex turn and silently overrode `~/.codex/config.toml`.
- **WHEN a change lands depends on the harness AND on the session, and the UI says so.** codex applies it to the RUNNING session (`thread/settings/update`, effective from the next turn) — pick and it takes; claude only reads its style at startup, so the pick is saved for the next resume and the menu grows a "⟳ Restart now to apply" row. That row is gated on `styleAppliesLive(caps, wrapperAdvert)` — the harness caps row AND the RUNNING wrapper's own advert (`attached.responseStyleLive`), never a backend id. A codex session spawned before this release is refused by the server; gating the row on caps alone left exactly that session with no restart row, an invisible saved pick and a success toast the refusal then contradicted, so the `style-wrapper-old` refusal (its OWN code — `style-not-live` still covers a dead session, a spawn-only harness, an out-of-enum value or a sidecar not written yet, and changes no belief) flips the client's own flag and the row appears in the same menu, no reload. The attach advert is tri-state too: null = not reported yet ≠ cannot. The `created` payload deliberately omits the key: the sidecar is not written yet, and "not told yet" (try it, learn from the refusal) is the honest third state.
- **Nothing is announced before it happens.** The chip wears the pending pick (hourglass) until the server's `response-style-updated` echo, and the success toast fires on that echo — the pick is saved for the conversation either way.
- **Session Properties** names the EFFECTIVE value and its ORIGIN — *your choice for this session* (the saved pick IS what is running) / *instance default* (no pick here) / *what this session started with* (a DIFFERENT pick is saved — the live value dates from the spawn) / *saved — applies on the next resume* / *harness default — the agent's own config decides* — plus the saved-but-not-yet-live pick where one exists. The origin COMPARES the two values; keying on "does a pick exist" made the row contradict the note beside it. Instance defaults are `claude.outputStyle` and `codex.outputStyle` (both blank by default). **B-6b6d (2026-09-07) extends the same row family to MODEL and EFFORT, with one addition the response-style row does not need: a fifth origin, *this conversation's own value*.** For these two the origin cannot be derived at all — a conversation's own last value and the instance default are frequently the same string, and only the SERVER ever read the conversation's records — so the server states it at spawn (`resumeSpawnPick`, src/resume-continuity.js) and it rides the session record; `spawnValueOrigin` only picks the label, and a pick saved AFTER the spawn still flips the row to *what this session started with*. The rule the row reports: **a resume/fork/restart keeps the conversation's own model/effort (codex: its rollout's last `turn_context`; opencode: the model OpenCode's own session record names; claude: NEITHER — its transcript records no effort at all and names a served model that cannot express the `[1m]` context variant, so a claude resume commands nothing and the CLI's own session record decides), the instance default applies to NEW sessions only, and a per-session pick still wins.** A session that predates the stated origin shows the value with **no** parenthetical rather than borrowing the response-style ladder's guess (round 2). All three origin rows WRAP instead of ellipsizing: the origin is the last thing on the line and at 375×667 the ellipsis ate exactly the part the row exists for (Effort: 18px → 32px, measured).
- A refused live switch (spawn-only harness, unknown value, or a wrapper too old to serve the verb) answers a scoped in-chat error naming the reason; the chip only moves on the server's confirmation.

#### Codex generated images and sleeps are visible work (2.369.58)
A codex `image_gen` result renders as the same media card a `view_image` does — thumbnail drawn from disk through `/api/file/raw`, click to zoom, the revised prompt folded underneath — instead of a bare "status: completed" line naming a file nobody could see. A `clock.sleep` renders as a live countdown row ("Sleeping 12:40 remaining", ticked once a second by the view) that freezes into "slept 30s" when it completes. Both are deliberately unfoldable: a 20-minute deliberate wait folded into an "N tool calls" summary is exactly how a pause reads as a hang. The live stream, the rollout and the `thread/read` history fallback all produce the same card (three producers, one shape, pinned by scripts/test-harness-honesty.mjs).

#### Sending during a turn: QUEUED vs STEERED (2026-09-06, owner ask)
A message typed while the agent is mid-turn does not interrupt it. What happens
next is a **capability** — `backend-caps` `inputModes`, whose `queueVerbs`
TABLE (2026-09-07) is the source of truth and whose old `{steer, queueOps}`
booleans are a derived view of it — never a backend id; the ws layer, the strip
and the chip all gate on that row:

| harness | queue | queueVerbs | what the user sees |
|---|---|---|---|
| **codex** | ✓ | remove · steer · steer-all · reorder · edit · run-now · run-all | the strip, a drag handle + edit + Run-this-one + Steer per row, "Run all now" and "Steer all" in the header |
| **opencode** (ACP v1) | ✓ | remove · reorder · edit | the strip, a drag handle + edit + Remove per row |
| **claude** | ✓ | *(empty)* | nothing: the CLI queues stdin itself and publishes no queue |
| **shell** | — | *(empty)* | n/a (terminal) |

Adding a verb is one entry in that array plus its three implementations
(adapter frame, wrapper handler, client control) — a verb declared but not
constructible is a red test, so "a control we cannot honour" is structurally
impossible rather than a review promise.

- **Queued** — the message is held and runs when the current turn ends. Its own
  user bubble wears a `Queued` chip (there is no separate system card any more;
  the card survives only as the fallback for a queued entry with no bubble, e.g.
  an agent-to-agent message).
- **Steered** — "inject it into the RUNNING turn, so the agent reads it at its
  next reply". Codex: `turn/steer {threadId, input, expectedTurnId,
  clientUserMessageId}`. The item leaves the queue (the wrapper deletes it, see
  below) and its bubble's chip becomes `Steered`.
- **The strip** sits directly above the input box: one row per queued item
  (≤120-char preview; an agent-to-agent message is listed and labelled with its
  sender — hiding it would misstate what runs next) and exactly the controls the
  verb table allows — `Steer now`, `Remove`, a drag handle, an edit pencil and
  `Run this one now` per row, `Steer all` (>1 queued) and `Run all now` in the
  header. Focus a row and press Enter to steer it. The `Queued` chip on the
  bubble is a second entry point for the same action.
- **Reorder (2026-09-07)** — drag a row by its handle, or focus it and press
  **Alt+↑ / Alt+↓**. Both send the same RELATIVE intent ("put this one behind
  that one"; dropping above the first row means the front), and the WRAPPER
  translates it into the app-server's absolute full-order array against a
  freshly read queue — so a message another agent queued between your render
  and your drop keeps its place instead of being deleted or shuffled. If the row
  you dropped behind has meanwhile run, nothing moves and the notice says so.
- **Edit (2026-09-07)** — the pencil opens the queued message's FULL text in the
  input box (not the truncated preview); sending saves it, Esc restores what you
  were typing. Only the TEXT is replaced: images, audio, skills and @mentions
  attached to that queued message are preserved untouched, by exclusion — so a
  future attachment kind cannot be silently dropped by an edit. **An
  agent-to-agent message has no pencil**: rewriting another agent's words would
  misattribute them (the wrapper refuses it too, not just the UI). The bubble in
  the transcript deliberately keeps the words you originally typed — it is the
  record of what you sent; the strip row shows what will actually run.
  **Your rewrite is never spent on a refusal.** The typed text stays in the box
  until the save is answered — the borrowed draft comes back only on success.
  If the save is refused (the usual case is a race: the turn ended while you
  were typing and the app-server ran the ORIGINAL), the rewrite is handed back —
  still queued ⇒ you are put straight back into edit mode with the reason on the
  row; already gone ⇒ your text becomes the input's draft and a toast says so,
  ready to send as a new message. While an edit is open the box is NOT this
  session's draft: what you type is not persisted as the draft and another
  client's draft sync cannot overwrite it mid-edit. A single edit at a time; a
  very long rewrite (>20000 characters) is refused out loud rather than sent
  through a channel that would shred it. The SAME rescue covers the bigger
  window BEFORE you press Send: if the message you are rewriting runs (or is
  removed) while you are still typing, your words are kept in the input, saved
  as the draft and explained by a toast — they are never replaced by the draft
  the editor borrowed the box from. **Opening a DIFFERENT row's pencil while a
  rewrite is unsent does the same thing** (2026-09-07): the abandoned rewrite
  becomes this session's draft with a toast that says so, and cancelling the new
  edit hands it straight back — switching rows used to overwrite it with the
  pre-edit draft, silently. An editor you never typed into just closes,
  silently, and Esc still restores your draft exactly as before. Closing the
  window (or swapping the tab) keeps whatever the box holds beyond what was
  already sent — an unsent rewrite, and also anything typed DURING a save that
  has not been answered yet (the draft autosave is off for that whole window) —
  so the one thing that never happens is your words existing only in a box that
  is about to disappear. **And an in-chat action button cannot walk into your
  edit** (2026-09-07): "Compact now" and the design request type into the same
  input, so while an edit is open they are REFUSED with a toast ("finish or
  cancel the queued-message edit first — the action was not sent") instead of
  rewriting your queued message to `/compact`; the button stays clickable and
  the design dropdown keeps the brief you typed, so finishing the edit and
  clicking again is all it takes. With no edit open those actions also hand back
  whatever they wrote over: a half-typed prompt returns to the box and to the
  draft, and pending attachments stay pending instead of riding along with the
  action.
- **Run now / Run all now (2026-09-07)** — `thread/queue/start` with and without
  an id. While a turn is running BOTH are refused out loud ("a turn is already
  running — the queue runs as soon as it ends") rather than being queued behind
  it, because that is already what happens. They matter on a RESUMED thread that
  comes back idle with messages still queued. They are separate controls on
  purpose: an id-less start drains the WHOLE queue, so a lost id must never
  degrade into "run everything".
- **A row shows what it is doing — and can be doing two things at once.** An op
  in flight dims its row; a refusal marks it and keeps the reason on the row
  (the system card scrolls away, the row does not); a row being edited says so,
  and the strip says how to finish. The editing mark is INDEPENDENT of the op
  mark (2026-09-07): "Run all now" marks every row pending and a refusal marks
  the row red without either of them erasing the sign that your rewrite is in
  the box — a row that was refused and is open for editing again shows both.
  A row NEVER spins forever: if the window is disconnected/read-only the click
  sends nothing and the mark is undone with a toast, and a refusal from the
  server names the row it refused so the spinner ends there too.
- **The strip stays correct while you are dragging.** A queue that changes
  mid-drag (a peer message arrives, another client removes an item) re-renders
  the rows under your pointer; the drop still lands where you dropped it, and a
  row that left the queue during the drag simply does not move anything.
  **That includes the strip's own bound** (2026-09-07): past 8 items the strip
  normally starts collapsed to its header, but a queue that grows past 8 while
  you are dragging a row — or while a queued message is open for editing —
  does NOT collapse the rows away underneath you. The rows are where the drop
  target and the edit's ✕ live, and that collapse needs no action from you (the
  9th item can be a Background Work notification arriving on its own), so it
  waits until you are done. The chevron is still yours to click at any time: a
  strip you collapse yourself while editing keeps the cancel control on the
  "Editing a queued message" line, so the edit is always finishable without
  hunting for the row.
- **SYSTEM NOTIFICATIONS STEER, PEOPLE QUEUE (2026-09-07, owner decision).** The
  rule in one line: *a VibeSpace notification joins the running turn; a message
  from another agent waits for its own turn; a steer carries only itself.* It
  came from a real session that had collected **20** "[VibeSpace Background Work]
  … done" items as 20 separate queued submissions — 20 billed turns waiting
  behind the one it was running. So the delivery ladder now TYPES its frame
  (`kind:'notification'` for Background Work events and system notices,
  `kind:'peer'` for `vibespace-msg`), and a busy codex session **steers** a
  notification into the turn it is already doing instead of queueing a turn of
  its own. Nobody is waiting for a reply to a notification; a person's message,
  by contrast, is its own task, and folding it into someone else's running turn
  would change what the agent was asked to do mid-answer.
  *A steer carries ONLY itself* is upstream behaviour, not our invention
  (codex-rs v0.153.4): `turn/steer` maps its `params.input` into ONE
  `TurnInput::UserInput` (`app-server/src/request_processors/turn_processor.rs`
  :1023-1039), and core drains every pending steer wholesale before each model
  request (`core/src/session/turn.rs`:312-323 → `session/input_queue.rs`
  `get_pending_input`, `pending_input.items.split_off(0)`) — so consecutive
  notifications merge by themselves and **the input queue is never touched**:
  items already queued keep their place and their order. If the steer is refused
  (the turn ended between the check and the RPC; a review/compact turn), the
  notification falls back to the ordinary queue/turn lane and the result NAMES
  the refusal, so a queued notification is never a silent divergence from this
  rule. Which lane a harness takes is DERIVED from its capability row
  (`backend-caps` `notificationDelivery({peerDelivery, inputModes})` →
  `steer | queue | cli-inbox | stash`), never a backend id: **claude** stays on
  its CLI's own inbox (the CLI queues a mid-turn delivery itself — that lane is
  the CLI's, and we do not write its stdin), and **opencode/ACP v1** derives
  `stash` — NOT `queue`: its row says `peerDelivery:'stash-only'` (no live
  rung has been proven for ACP), so a notification waits and rides the next
  turn's injection. Its wrapper is honest about the OTHER half anyway: ACP v1
  has no steer METHOD either (`session/prompt` is one-at-a-time), so a
  notification that does reach a busy ACP wrapper queues and answers
  `steer:'unsupported'` instead of accepting and ignoring it. Any harness with
  no live lane stashes for the next turn the same way.
  A steered notification is a submission ENTERING THE TURN like any other, so it
  goes in under a NAME (`notifCid`): the wrapper registers that id as one whose
  bubble already exists before it writes the labelled card, and carries it on
  the record as `webui_queue_id`. Without the registration the app-server's own
  `item/completed {userMessage, clientId}` — which arrives at the next turn
  boundary — would write a second, anonymous bubble beside the card; without the
  id, two identical notifications inside one turn would collide on content. Session Properties → Background Work shows the effective
  answer for the session you are looking at.
- **MULTI-QUEUE SEMANTICS (the rule to remember):** steering item N injects
  **only N**. The others keep their relative order and still run after the turn.
  A steered item is removed from the queue, so it never runs twice. `Steer all`
  is sequential steers **in queue order** (each keeps its own input, so images
  and per-message ids survive) — verified against the app-server, which accepts
  several steers inside one turn; it stops at the first refusal, because a
  refusal is a property of the TURN and would just repeat N times.
- **Refusals are visible and say what happens now.** A review or compact turn
  answers `ActiveTurnNotSteerable` ("Cannot steer during a review turn — the
  message stays queued and runs when this turn ends"); if the turn ended between
  the click and the RPC, the precondition (`expectedTurnId`) fails and the
  notice says "it stays queued and will simply run next". In every failure the
  item **stays queued** — that is why the wrapper steers first and deletes only
  on success. A `Remove` of something already drained says "it already ran"
  rather than reporting a fake success.
- **A chip clears when its message RUNS.** An item that leaves the queue without
  an explicit steer/remove was drained by the turn ending, so the bubble drops
  its chip instead of claiming to be queued forever.
- **AN INHERITED QUEUE still gets its bubbles (2026-09-07).** The app-server's
  queue belongs to the THREAD, not to the wrapper: Terminate + Resume (or a
  server restart) hands the NEW wrapper a queue full of submissions it never
  typed — the owner's session came back with 25 of them. Steering those used to
  produce no bubbles at all ("我只能看到我最后插入的一条消息"), because the only
  live notice of an inherited message entering the turn is the app-server's own
  `item/completed {item:{type:'userMessage', clientId}}`, which nothing routed.
  Now the wrapper writes that bubble itself — the moment a `turn/steer` LANDS
  (its commit twin can be a minute later) and, for an item the app-server DRAINS
  by itself, when the twin arrives — stamped with the submission's own
  `clientUserMessageId`, which is also what the strip row advertises, so the
  chip still says `Steered`. A message the wrapper typed is never recorded
  twice, and an item entering the turn with NO clientId came through our own
  `turn/start`, whose bubble already exists.
- **One message, one bubble, after a reload too.** A user message is written by
  BOTH producers — us (as it is sent) and codex (when it is committed into a
  turn) — so the rebuild collapses the pair: an id-carrying copy of ours CLAIMS
  its content and codex's copy of it consumes the claim and is dropped. Two
  DIFFERENT sends of the same text stay two messages, and a codex-side record
  that has no copy of ours is never dropped.
- **A submission's identity is an ID, never its text (round 2, 2026-09-07).**
  Every user record is keyed by the id its producer minted — ours by the webui /
  queue id, codex's by its own `msg_…` — so two messages with the SAME text in
  one turn are two bubbles live AND after a reload. Keying them on content
  deleted real messages: 27 of the 95 user messages in the owner's own rollout
  vanished on reload, and 133 across the local corpus of 89 rollouts (every
  collision a different id AND a different `create_time` — distinct submissions,
  not duplicates). Pre-0.15x rollouts carry no ids and keep the old content key.
- **Which side of the commit our copy was written on decides how the pair is
  retired.** Ours normally comes first (a send, a steer that lands ~42s before
  the commit), so codex's later copy consumes our claim. The two producers that
  write AFTER the app-server has already persisted its own copy — the
  `item/completed` twin for an item the app-server drained, and the IDLE peer
  path (`turn/start` commits before the wrapper records) — mark the record
  `webui_after_commit`, and such a record yields to the copy already on screen
  instead of doubling the message. A new producer of a user record answers that
  one question before it ships (the census is a test).
- **Our copy has ONE spelling, and there are THREE producers of it** (round 3):
  the server-side preview (`CodexAdapter._buildUserPreview`, appended to
  `session.buffer` by ws-handler so the bubble exists before the wrapper's line
  lands), the wrapper's own chat-input record, and the inherited-queue bubble.
  All three now spell the content the way codex persists it — the TEXT first,
  attachments after (measured: 0 of 5489 user records in the local rollout
  corpus begin with an `input_image`), through `userInputToContent(encodeUserInput(…))`.
  Two of them used to hand-roll `[...attachments, text]`, so every message with
  an image rendered TWICE after a reload; and the preview WINS the fingerprint
  (same `webui_msg_id`, written first), so fixing only the wrapper would have
  changed nothing. Codex's own `detail` on an image block is normalised out of
  the twin key: a field only one producer writes may never split the pair.
- **A submission that never reaches the app-server claims NOTHING.** Our copy is
  written before the send is accepted, so a record can exist for text that never
  becomes a user message: a wrapper-served slash command (`/compact`, `/review`,
  `/model`, `/effort`), a send whose RPC threw, a queued item Stop or the user
  removed before it ran. Such a claim is never consumed and later DELETES an
  unrelated codex-only record of the same text. EVERY such case says so OUT OF
  LINE — the `webui_user_retracted` event, which names the submission by
  IDENTITY (a data URL can be megabytes, and a second copy of the reader's
  content-key algorithm would drift). There is no write-time declaration
  (round 4 removed `webui_no_commit`): a typed message has TWO copies of ours,
  the wrapper's and the SERVER's preview (`CodexAdapter._buildUserPreview` →
  `session.buffer`), the preview lands FIRST and is therefore the copy that
  claims, and only the wrapper knows which texts are its own slash commands —
  so a marker on the wrapper's record was unreachable in production. An id is
  a fact both copies carry. The slash command retracts BEFORE it runs
  (`/compact` takes 1–2 minutes; a wrapper killed inside that window must not
  leave the claim standing). Either way the BUBBLE stays — the user really sent that text,
  and `task_failed` is what reports the failure; only the claim goes. An item
  the app-server had already DRAINED (`{deleted:false}` = it ran) is never
  retracted. The queued PEER copy now carries its app-server cid as the same
  second-class `webui_queue_id`, so Stop can retract it by name and two peer
  messages with the same text in one turn stop colliding.
- **Live + attach parity.** The wrapper publishes the WHOLE queue on every
  change (and at boot, and at each turn start); that record replays through the
  buffer, so a reconnecting client's strip is rebuilt. `attached` and `created`
  both carry `queue`.
- **THE SECOND GATE — the RUNNING wrapper, not just the harness row.** The caps
  row describes a KIND of agent; a dtach session started before this release is
  a different question. Both wrappers advertise `caps.inputQueue` in the sidecar
  THEY write, `wrapperCaps()` reads it (or, for a REMOTE wrapper whose sidecar
  lives on its own machine, the normalizer's in-band `queuePublished()`), and
  the ws `queue-op` case refuses without it ("its agent predates the input-queue update … Terminate + Resume
  the session to get the controls"); `attached` carries `queueSupported` so the
  client's strip and chip are off too, and `created` says `false` because a
  freshly spawned wrapper has reported nothing yet (its own baseline
  `queue_changed`, seconds later, turns them on). On the normalizer side, a
  `queued_input` from a wrapper that has never published a queue falls back to
  the OLD system card — otherwise that bubble wears a `Queued` chip that can
  never clear and never be acted on. Same law as the frame-file bypass
  (2.361.1/2.364.1): capability = what the RUNNING PROCESS says it can do.
  Since the verb table (2026-09-07) that gate is per-VERB: the wrapper adverts the verb list it
  serves (sidecar + on every `queue_changed`, because a remote wrapper's sidecar
  is on the other machine), a build that names no list is taken to serve the
  three verbs that existed before the table, and a verb it does not serve is
  refused BY NAME while its other controls keep working.
- **AFTER A RESTART THE ROWS COME FROM THE WRAPPER, AND THE PAYLOAD SAYS SO (2026-09-09).**
  A queue publication is a `queue_changed` record on the wrapper's stdout, that
  stdout is an 800KB head-dropped RING, and that ring is what a restarted server
  rebuilds the session normalizer from — so after a restart `queueState()` is
  `[]` whether the wrapper's queue is empty or holds 25 items, and the two are
  the same bytes on the wire. `attached`/`created` therefore carry
  **`queueKnown`**: `false` = a placeholder, `true` = a fact (a payload from
  before the field reads as `true`). The client applies the rows either way — an
  unknown queue IS the empty list — so the strip shows NOTHING for one round
  trip rather than a row nobody can act on; what the flag gates is the
  INFERENCE, so only a KNOWN list retires the `Queued` chip of a bubble it does
  not list. The round trip is the new **`queue-resync`** stdin verb: the attach
  asks the running wrapper to publish its queue again — INCLUDING an empty one,
  FORCED past its own fingerprint dedup — and the ordinary `queue_changed` that
  comes back corrects every attached client at once. It is asked only while
  `queueKnown` is false (self-limiting) and only when the RUNNING wrapper
  adverts `caps.queueResync` (the per-process gate: an older ACP wrapper answers
  an unknown verb with a VISIBLE error card, so it must never be asked; an older
  codex wrapper drops it silently). Both directions are fixed by it: a message
  steered away before the restart no longer haunts the strip, and a message that
  really is still queued comes BACK instead of being invisible for the rest of
  the session. And a `queue_op_result` refusal of `'gone'` — the wrapper listed
  its queue and the item was not there — now REMOVES the row instead of painting
  it red: the wrapper is authoritative about absence, and its own follow-up
  refresh (fingerprint-deduped) can never retract a marker. Every other refusal
  keeps the row and wears the reason, because that message really is still
  queued.
  A window that STAYED OPEN across the restart is the case that needed one more
  rule: that path defers the whole payload behind a 0-500 ms render stagger,
  while the wrapper answers in ~10 ms, so the placeholder used to land last and
  wipe the row it had just asked for — and permanently, since the ask never
  repeats. The strip now shows the NEWEST statement rather than the last one
  executed, so a payload half a second old cannot overwrite the answer it
  provoked (and a steer that empties the queue mid-stagger is not undone by it
  either).
  The SAME rule governs the advert on the line above the rows — whether the
  session HAS a queue surface at all. A false advert collapses the capability
  and the composer then renders no rows and hides the strip, which is the same
  outcome as losing the rows, so both are judged by when the payload ARRIVED.
  It matters wherever the server has no readable local sidecar to read the
  advert from — a REMOTE session, whose wrapper wrote its sidecar on its own
  machine — because there the advert comes from the wrapper's own publication,
  which a restart resets.
- **The chip is re-applied when the capability flips.** `_queueSupported` starts
  false and both of its sources arrive AFTER the bubbles are on screen (the
  attach payload is applied at the END of `loadHistory`; a live wrapper's
  baseline `queue_changed` lands a few frames after the first messages). A chip
  built in that window would be `disabled` forever, so `_setQueueSupported` —
  the one writer — schedules a single rAF-coalesced pass over the rendered
  elements and re-runs the chip renderer for every message carrying a queue
  state. It runs in BOTH directions: losing the capability makes the chips inert
  again rather than leaving a control that cannot work.
- **The chip joins on `webuiMsgId`, stamped on the message.** The normalizer's
  `userMessageIds` map is server-side only; the bubble carries the id itself so
  the client can match it to a queue row (without it every chip click answered
  "That message is no longer queued").
- **A dead or disconnected window SPEAKS.** Every queue action goes through one
  liveness check that toasts ("This session is not live — reconnect…") instead
  of swallowing the click, and the strip is dimmed under
  `.chat-input-disconnected` so the state is visible before the click.
- **THE CHORD: `Alt+Enter` = steer (2026-09-07, owner "顺便加入一个 queue 的快捷键,
  不支持queue的就不显示").** `Enter` already sends as QUEUED while a turn runs —
  our default, and the one the web/desktop Codex apps use (the TUI's
  `Enter`=steer / `Tab`=queue is a terminal keymap we deliberately do not copy).
  What was missing was the OTHER mode by keyboard, so: **`Alt+Enter`, and
  `Alt+Enter` only** — `Tab` is the slash-command completion and `Ctrl/Cmd+Enter`
  keeps meaning send/queue; both would have been silent redefinitions of a key
  the user already relies on. It must be tested BEFORE the plain-Enter branch,
  which checks only `!e.shiftKey` and would otherwise swallow it as an ordinary
  send. **A steer NAMES A QUEUED ITEM** (`turn/steer` takes the app-server's
  queued-submission id — there is no "send this text as a steer" verb anywhere),
  so the chord SENDS on the one ordinary send path and converts the item the
  harness reports back, with the SAME `queue-op` frame the strip button and the
  chip send: no second wire shape. `_steerAfterSend(msgId)` parks the msgId in a
  MAP (two quick chords must both land) and `_setQueue` drains it; an 8s timeout
  that expires **while the turn we sent into is still running** says so in chat
  rather than letting the user believe an injection happened — and says nothing
  once that turn has ended, because the message then runs next, immediately,
  which is what "now" asked for.
  **WHICH turn, never "a turn" (round-2 verifier's MAJOR).** The silence guard
  first tested `_typingSince` for truthiness, and that flag is RE-ARMED by the
  NEXT turn. The only way the timer survives to fire is that the msgId never
  appeared in the published queue — which is exactly what a NOT-busy wrapper
  does: it runs the message as its own `turn/start` (it only
  `thread/queue/add`s while a turn is active). That new turn re-armed the flag,
  so the guard was false precisely in the case it existed for and the window
  apologised for a message the agent was visibly running. `_showTyping` now
  stamps `_turnEpoch` on the same null→armed transition that sets
  `_typingSince` (a TIME is not an IDENTITY — the turn that ends and the one
  that starts next can arm in the same millisecond), `_steerAfterSend` captures
  it, and the timer stays silent unless the SAME epoch is still running. The
  epoch advances only where the flag arms, so a relabelled turn ("running
  Bash") is still the same turn and still gets the honest apology.
- **It is a CONTRIBUTED command, `chat.steerNow`** (contributions.js Ph1), so a
  plugin can see it, rebind it and run it. The command is registered ONCE for
  the app (`registerCommand` rejects a duplicate id by design — a per-view
  registration would throw on the second chat window); the per-view part is the
  KEYBINDING, carrying the view's AbortSignal and a `when` that scopes the chord
  to the window the keystroke happened in (`steerTargetView` resolves the target
  from an explicit `ctx.view` — the composer route hands itself in — or from the
  mounted view whose container holds the event target). The composer's own
  `Alt+Enter` routes through the SAME id, so there is exactly one definition of
  what the chord does. It is the FIRST core `registerKeybinding` chord (the
  palette / command-mode chords stay where they are: their modifier-lenient
  capture-phase checks are load-bearing).
- **THE HINT, and what gates it.** While a turn runs the composer carries a
  one-line hint under the box — `Enter queues · Alt+Enter injects now` — each
  segment drawn only where the harness backs it. The PURE
  `composerSendModes(caps)` (agent-meta.js) is the ONE decision:
  `allowSteerChord` = `steer`, and the queue segment is gated on **`queueOps`,
  not `queue`** — claude's CLI really does hold a mid-turn message, but it
  publishes no queue and takes no operation on it, so there is no strip, no live
  chip and nothing to act on; a line announcing "it is queued" with nothing on
  screen to show it is a promise we cannot keep. Hence: codex = both segments +
  the chord, opencode = the queue segment only, **claude and shell = no hint and
  no chord at all** (the owner's rule, verbatim). The caps it reads are the live
  intersection (`_queueCaps()` = harness row ∧ the RUNNING wrapper's advert),
  the very object the strip's Steer buttons read, so the chord, the hint and the
  strip can never disagree — including the late-capability ordering that once
  shipped a permanently dead chip (`setQueue` repaints both faces).
- **≤768px: no chords, a BUTTON.** A phone has no Alt key, so the same verb gets
  a small bolt button beside **Send**, shown while a turn runs on a
  steer-capable session. The split is deliberate: **JS owns only the capability**
  (the `.hidden` class on both surfaces), **CSS owns the viewport** — the hint is
  `display:none` under the 768px media query and the button is `display:none`
  above it (the shape `.chat-attach-btn` has used for the mobile upload button
  since 2.234.0), so the two faces can never both appear and neither can
  contradict the capability. Measured at 375×667: the button sits beside Send,
  the textarea keeps ≥2 rows visible and nothing overflows the input area.
- **Session Properties carries the same sentence, gated the same way** ("Sending
  during a turn"), from the HARNESS row rather than the live intersection — a
  properties panel describes what this KIND of agent does and is opened on
  stopped sessions too. It shares the panel's **"Config overrides"** section
  with the response-style row, and that header is created **at most once, on
  first demand** (`cfgSection()`): the panel's old `cfgSec || section(...)`
  idiom appended a NEW header per lazy row, which was invisible while exactly
  one such row existed and printed the header TWICE the moment this one joined
  it — a codex session with no saved override, i.e. the common case (round-2
  verifier's minor). Pinned by the real-browser leg ⑨f of test-queue-steer,
  which counts headers for codex / opencode / claude / shell (2 lazy rows / 1 /
  1 / 0) and proves its own probe can see a duplicate.
- **Removing a queued agent-to-agent / job message gives it back.** It was
  already reported delivered, so `remove` re-reports `peer_message_result
  ok:false` with the text and sender and the delivery ladder re-stashes it for
  next-turn injection — the same rule the ACP wrapper's Stop already obeyed.
- **STOP CLEARS THE QUEUE ON EVERY HARNESS (owner decision 2026-09-07 — the
  2026-09-06 divergence is closed).** Stop means stop: whatever was queued
  behind the running turn is dropped, and each dropped entry's bubble reads
  `Removed`. On ACP the queue is ours, so the wrapper simply drops it (plus the
  loud "Stop also dropped N queued messages" notice). On codex the queue belongs
  to the app-server, which DRAINS it when the turn ends — including a turn
  ended by Stop — so the wrapper `thread/queue/delete`s every item **before**
  it sends `turn/interrupt`; clearing afterwards loses that race and the queued
  message runs the instant Stop lands (that was the old behaviour, and the codex
  suite's negative control reproduces it). **Both wrappers emit the SAME frame,
  a `queue_op_result {op:'remove', ok:true, reason:'stopped'}` per dropped entry,
  BEFORE they republish the emptied queue** — a bare empty republish would clear
  those chips, which the client reads as "it ran", the exact opposite of what
  Stop did. Nothing is silent on either side: a codex `thread/queue/delete` that
  fails reports `ok:false` (the item is still queued and WILL run) and lands in
  the wrapper journal, and a dropped agent-to-agent/job message goes back to the
  delivery ladder (`peer_message_result ok:false` / `peer_result ok:false`) so it
  is re-stashed for next-turn injection. A message queued and then *drained by a
  turn ending on its own* is a different thing and still clears its chip — it
  ran. (codex-side difference kept deliberately: no extra "send it again" notice
  — every dropped codex item has its own bubble whose chip flips to `Removed`,
  while ACP's notice also covers entries with no bubble.)
- **Stop only claims what Stop actually did (round-2 review, three fixes).**
  ① The app-server can DRAIN an item between the sweep's `thread/queue/list` and
  its `thread/queue/delete`; it answers `{deleted:false}` (a verdict, not an
  error) and that message is *running*. It is reported `ok:false, reason:'gone'`
  — "no longer queued — it already ran" — so the bubble never reads `Removed`,
  and an agent-to-agent message on that path is NOT re-stashed (it really was
  delivered; giving it back would deliver it twice). ② While the sweep runs the
  ONLY truthful publish is its own closing one: the latch sits on the wrapper's
  single publish choke point, not just on the queue re-read, because a
  `turn/started` (the drained item's own turn!) re-publishes the CACHED list
  with no RPC at all and used to resurrect the just-removed bubbles as
  `Queued`. ③ Stop is a safety control, so the sweep is BUDGETED — ~2.5s per
  RPC, ~6s overall — and when the budget expires `turn/interrupt` goes out
  immediately while everything still queued is reported `ok:false` ("it stays
  queued and will run"). A wedged app-server used to hold the Stop button for
  15s per RPC per queued item.
- **A SECOND Stop is normal, and it is the SAME Stop (round-3 review).** A
  double-click — or a second attached client's Stop, which nothing coordinates
  — used to start a second sweep on top of the running one: it listed the queue
  the first was still deleting and then reported those very items "no longer
  queued — it already ran", the exact falsehood the round above exists to
  remove (and on that verdict a queued agent-to-agent message is deliberately
  NOT handed back to the delivery ladder, so the duplicate also lost a promised
  message). Both halves of Stop are now single-flight: a second frame RIDES the
  running sweep, and `turn/interrupt` coalesces per TURN while its RPC is
  unanswered — keyed on the turn plus a live call, never on a time window, so
  an answered interrupt whose turn is somehow still running still accepts a
  genuine retry. What a riding Stop clears is what that sweep listed; anything
  queued after the list is not swallowed, the sweep's closing publish still
  lists it. **The button says so too:** clicking Stop disables it and it reads
  "Stopping…" until the turn ends or an 8s fallback (deliberately longer than
  the 6s sweep budget) re-arms it — a Stop that can stay dead would be worse
  than a duplicate frame. A label repaint no longer hands the live button back
  mid-flight (that was the actual DOM bug: the streaming status line re-renders
  on every label change).
- **A steer whose delete is REFUSED says so (round-3).** `turn/steer` never
  dequeues, so the wrapper deletes the queued copy — and if that delete answers
  `{deleted:false}` the app-server had already drained the item, i.e. the
  double run the delete exists to prevent has just happened. It is reported
  `ok:true, reason:'steered-not-dequeued'` (the same verdict the failed-delete
  path uses): the chip still reads `Steered` — it was — and a notice warns that
  it may run a second time. r2 read this verdict in the Stop sweep but not
  here, and answered a bare success.
- Measured facts behind the codex implementation (0.153.4, live app-server):
  the removal verb is `thread/queue/delete {threadId, queuedSubmissionId}` —
  **there is no `thread/queue/remove`**; `thread/queue/changed` carries only
  `{threadId}`, so every change drives a re-`list`; `turn/steer` does **not**
  dequeue the item even when it carries the same `clientUserMessageId`; and an
  `add` on an idle thread starts a turn by itself (the app-server drains its own
  queue, we never call `turn/start` for it).

- **OPENCODE: ROLL BACK, ASKS, A SERVE TERMINAL, LIVE UPDATES (S9 remainder, B-eac2, 2026-09-07)** — everything the serve exposes that the store-facts slice left on the table. All of it needs the opt-in **OpenCode background service** plugin (⚙ → Plugins, default OFF).
  - **Roll back to before a message.** Right-click a USER message's colour strip in an OpenCode conversation → *Roll back to before this message*. It asks first (it is a real filesystem change): OpenCode restores the working tree to the snapshot taken before that message and stages every later message for removal. The conversation then SAYS so — a line at the boundary — and the popup offers *Restore rolled-back messages* while it is staged. Sending a new prompt makes it permanent (OpenCode's own semantics; there is no v1 "commit" call). Both actions broadcast, so a second browser sees the new state without a refresh.
  - **The agent's questions are the same card every harness uses.** An OpenCode `question` tool renders as the AskUserQuestion card (options, custom answer, multi-select, one page per question) and is answered/dismissed on the serve's own route — so it works on a conversation with no live process here, and a pending one survives a page reload. An ask that is no longer waiting says exactly that instead of showing a Submit that could only fail. Honest limit: `opencode acp` — the mode VibeSpace's own live OpenCode sessions run in — does not offer the `question` tool at all, and question events are per-process, so this lane fires for turns the serve drives.
  - **"Open terminal in this session"** (session card menu, local OpenCode conversations). Opens a shell the OpenCode SERVE owns, in the conversation's own directory, as a normal VibeSpace terminal window — same xterm, input, resize and window actions. The serve's port never reaches the browser; VibeSpace bridges the stream server-side.
  - **Live, not polled.** The session list for OpenCode conversations no longer refreshes on a 10-second timer: it refreshes when something CHANGES. Two sources, because one of them is blind: the serve's own event stream (instant for anything it does) and a watch on the OpenCode store file (the only way to notice a `opencode` TUI or another serve writing the same database — measured: their events never reach our stream). If both go down the timer comes back, deliberately, so a broken lane can never freeze the sidebar. And the change is PUSHED: every open browser learns about it (a couple of seconds at most) instead of waiting for its own list poll, so a conversation someone started in a terminal shows up on its own.
  - **A conversation someone ELSE is driving shows as `external`** (the yellow state the sidebar already had) — but only on positive evidence: the serve reports it busy, or its row changed while we were not the ones changing it. It decays back to "stopped" by itself. VibeSpace never shows a running agent it cannot see — and **your own actions are not "someone else"**: rolling a conversation back, restoring it or answering its question moves the same row, so those writes are recognised as ours and the conversation stays "stopped" (a change made past them, by a real TUI or a second serve, still turns it yellow immediately).
  - **Any machine.** All of the above take a machine id: this one, a paired device (the daemon runs the same code where the store is), or an ssh host (a shipped single-file runner). The serve terminal is the exception and says so — its stream is loopback-only on the machine that owns it.
- **Harness settings — the dedicated per-harness configuration area (2.369.123, docs/design-harness-settings.zh.md; owner D1–D4).** The Settings window's Claude / Codex / OpenCode sections are DERIVED from each harness descriptor's declared table (src/harness-settings.js): every row says what it is for — an apply chip under it reads "Applies to new sessions · --brief", "Read by VibeSpace · pool engine", or "Written into the CLI config" with the target `~/file → key`, a FRESH receipt for this machine ("✓ this machine: ~/.claude/settings.json → cleanupPeriodDays = 36500 · written 3 min ago" / "⚠ … is 30 (wanted 36500) — written again at the next start or setting change" / "? … not found — start the CLI once" / "⚠ … not valid after a hand edit — not touched" / "Leaving the CLI's own value alone") and a human-triggered "Check machines…" that lists every registered host's state ("⚠ userW-mac: … is 30 (wanted 36500) — written at the next tool install or session start on that machine" / "? not checked — reinstall the agent tools" for a helper that predates the plan). The same chips sit on Manage Agents → Machines under the integration rows (that is where the user looks for WHICH machine; not a second editing surface). Values stay in data/settings.json under the same keys (zero migration). Receipts are never persisted (a hand-edited file would make a stored "applied at" lie); the last local write is kept in memory only. No fan-out on change: the next Install or the next session spawn on that machine applies it (the ssh prelude and the dial run-cmd carry the same `VIBESPACE_CLI_CONFIG` plan as Install, so a host only ever spawned into now gets the keys too); the card shows "differs" until then. **Managed CLI-config rows today:** `claude.transcriptRetentionDays` (default 36500 → `cleanupPeriodDays` in ~/.claude/settings.json; Claude Code's own 30-day sweep deletes the conversations this product keeps; 0 = leave alone) and NEW `codex.historyPersistence` (default 'save-all' → `[history] persistence` in ~/.codex/config.toml through a comment-and-format-preserving TOML setter — verified against codex-cli 0.154.0's embedded config template; 'none' means codex writes no rollouts and this instance shows no history for those sessions; '' = leave config.toml alone). A hand-broken file (invalid JSON, a TOML shape the setter does not understand — inline table, array of tables, multi-line string, a root scalar named like the section, dotted keys plus a header for the same table) is refused by name and never overwritten; a symlinked config (the dotfiles pattern) is written through and STAYS a symlink, its mode survives, a dangling link is refused (2026-09-21); a value outside a closed enum's options (an API/import write — the Settings window cannot produce one) never reaches a config file: the default rides and the boot log names the refused value; a missing settings.json is reported, not created; the temp-server guard (`hookRegistrationSafe`) now covers these writes too. `claude.autoResumeOnLimit` moved back to the Chat category (generic feature; key spelling unchanged). A plugin-contributed harness ships its own table and gets a derived section with zero new code. Gates: test-harness-settings, test-harness-contract, test-claude-retention (kept by name), test-architecture §46.
- **Replying to a For-you item (2.369.169, docs/design-user-inbox-reply.md — chunks 1–4: the server core, the panel, the title-bar mini inbox, the usage set).** A reply to an inbox item reaches its agent as the user's OWN message — the same server path the chat composer uses (src/server/user-input.js, shared with the ws chat-input case), never the delivery ladder and never the spend authorizer — prefixed with a quote of the item (`[For you reply #<id>]`, when it was filed, the text, up to 1500 chars of the detail, the options) so the agent knows which ask it answers. It is sent mid-turn too (the session queues it); a successful send resolves the item `by your reply` and keeps the reply on it. It is refused BY NAME, resolving nothing, when the agent is not running, the session is a terminal, its host is unreachable, the item came from a server producer (accounts/jobs) or a job; an agent token can never send one (owner-only route). Agents may file decisions with `vibespace-ask --options "A|B|C"` (≤ 6 one-click answers; an empty label such as `"A||B"` is refused by name, never dropped) — such items sort first within their urgency — and read one of their items in full with `vibespace-ask show <id>`. Every session in the live list now carries its `turn` (running / idle / waiting). **In the panel (chunk 2):** each open item has a Reply button (an arrow icon) that unfolds a one-line box under it — Enter sends, Shift+Enter adds a line, Esc folds it (the text is kept for the next unfold) — and an item filed with options shows one chip per option that replies with that label in one click. The button is disabled with its reason as the tooltip when the agent is not running / is a terminal session / its host is unreachable, and is absent on items from Manage Agents or Background Work. A reply toasts "Reply sent" and the row turns resolved in place with "You replied: …"; a failure toasts "Could not reply: <reason>" and keeps the text. Each agent's group title carries a running dot — filled green mid-turn, hollow green idle, amber waiting for you, dashed when its host is unreachable, grey not running — that follows the session live without reloading. A reply box being typed into survives every update of the list (another item arriving, another client's ✓): the rows are patched in place, never redrawn. The chat shows the reply as your message with a "For you · reply to #<id>" head and the quoted item folded. The phone's inbox sheet has the same box with ≥ 36 px targets. **In each window's title bar (chunk 3):** every chat or terminal window whose agent has open asks shows a small inbox pill after its title — the number of that session's open items (notices are not counted), coloured by the most urgent one; it disappears at zero and moves onto the window's tab when the window is grouped (and back when it leaves the group). A view-only window of a stopped conversation shows its own count too. Clicking it opens a small popover listing only that session's items, with the same Reply box, option chips, ✓ ✕ ↺ and viewer as the panel; clicking a row does not jump (you are already in that window). Items resolved from the popover stay in place, struck through, until it closes; the pill counts down as you go. Escape closes the popover first and the For-you panel on the next press — the same with the ⤢ item viewer (or any other dialog) open above the panel: one Escape closes the dialog only (r1). The session's name in the popover head, like every item string, is shown as plain text. On a phone window title bars are not drawn, so the phone's inbox is the nav sheet. **Against the flood (chunk 4):** a group with more than 5 open asks shows its 5 newest and a "{n} more…" row that opens the rest in place (the rows already shown do not move; the expansion holds until the panel closes); rows resolved while the panel is open keep their slots, a row once shown is never hidden again under the pointer, and a new ask arriving into a folded group joins the "{n} more…" count. A group with 2 or more open asks has a "Mark all seen" button beside its title: one click dismisses every open ask of that agent (the hidden ones too) in ONE request — each row is struck through in place, the badges count down, every other client sees one update, ↺ reopens any of them; a failure is a toast naming how many and why. Beside the agent's name a small chip shows what the agent itself reported with `vibespace-status` — needs input, blocked, review or working — and follows it live (a reply box being typed into is untouched); nothing is shown otherwise. The phone sheet has the same fold, button and chip (≥ 36 px). Not built (the design's LATER list): auto-resolving an item when you answer the agent in its chat, expiring a stopped session's asks, keyboard j/k/r/d, muting an agent.
- **Notices in the For-you inbox (2.369.118).** An item carries `kind: action | notice` (a producer's declaration: spend-guard's ceiling notices, `vibespace-ask --notice`; older items are actions). Notices sit in their own section under the asks (same append-only slots while open) and never colour the badge — the red/yellow/accent segments count actions only, a grey pill counts notices; the head's "{n} open" counts actions. Gate: test-user-todos-layout ⑤.
- **Notices grouped by who filed them, and counts on the inbox tabs (2.369.169, B-328d, docs/design-user-inbox-reply.md §8).** Every inbox item names its PRODUCER (`origin`: spend · login · pool · jobs · channels · browser · agent — a closed set of exactly the producers that file; a filing that names none is refused by the store and fails the census suite, a value outside it is refused by name). The Notices section is no longer one flat list: a strip of filter chips — `All` with the number of open notices, then one chip per producer present with its open count — sits over one group per producer (Spending, Login expiry, Account pool, Background Work, Channels, Agent browser, Agents), each head with its open count, in that fixed order (a producer that shows up while the popup is open joins at the end, nothing moves under the pointer). A chip shows only that producer's notices (the active chip again = all); the choice is kept per device and survives closing the popup — while that producer has a notice: a choice whose group is gone when the popup opens becomes All (kept that way on the device), and a notice arriving later never changes what the strip shows (only a chip click chooses); the asks above are never filtered, and a reply being typed anywhere keeps its text. The two tab labels carry counts: Inbox shows the open asks (coloured like the taskbar badge, with the badge's own words as its tooltip) and the grey notice count; Notifications shows how many toasts arrived since you last looked at that page on this device, cleared when you open it. Items filed before this release carry no producer and are placed by a read-time rule (the old spend notices under Spending, the old channel items under Channels, the rest under Agents) — no migration. The title-bar mini inbox is unchanged (asks only; its badge never counts a notice). Phone: the same sheet, chips ≥ 36 px. Gates: test-user-todos-layout ⑪ (incl. the census), test-inbox-reply-ui ⑰ ⑱ ⑱c ⑲.
- **The View Workflow window shows what the card shows (2.369.119).** While a run is live, /api/workflow lays the launching session's own progress tree over the disk skeleton (PURE src/workflow-live.js), so the window lists phases, labels, states, the running agent's last tool and live usage — the same data as the chat card; the journal's retry verdicts still win, an agent the tree named before its transcript exists has View Log disabled, and a window opened after the launching session is gone falls back to the disk skeleton with the old note. Gate: test-workflow-live-view.
- **Unknown harness records are the "Unknown event" fall-back card (2.369.119 → .120).** A stream record type or `system` subtype VibeSpace does not handle and has not declared ignored renders — history and live alike — as a red-bordered "Unknown event" card in the flow (harness + `system/<subtype>` or the type, a hint, the whole record behind a "Full record" expander); codex too. It has its own fold kind `unknown` in the run-collapse ("{n} unknown events"), offered in chat.collapseKinds UNCHECKED so it stays visible until the user decides it is noise. The declared-ignored lists live in message-manager.js and are a decision, not a default. Gate: test-unknown-records.
- **Live Workflow detail (2.369.118).** While a Workflow (ultracode) run is live, its tool card shows the phases with agent chips (label · state dot · last tool), a done/total tally and the run's usage (tokens · tool uses · minutes) from the CLI's own `task_progress.workflow_progress` tree, kept field-wise across heartbeats; the card re-renders on every progress edit. Live sessions only — the post-hoc View Workflow window remains the history surface. Gate: test-task-lifecycle.
- **The agent can talk to YOU (owner ruling 8(c), setting `claude.brief`, default OFF).** Claude Code has had a first-class agent→user channel since `--brief`: two real tools, `SendUserMessage` and `SendUserFile`. With the setting on, new claude sessions start with the flag and VibeSpace renders each call as a **highlighted "Message for you" card** instead of a generic tool card — which matters because with `--brief` the CLI hides plain text outside that tool from the message view, so the card IS the reply. A `proactive` status (the CLI's own word for "I am initiating, not replying") wears a chip. `SendUserFile` publishes each named file through the existing published-pages channel: session-owned, **private by default**, and the card carries the RELATIVE link the front end joins with its own origin (never a guessed absolute URL — the 2.366.1 law). Failures are ON the card, per file. Remote sessions render the card with no link (their files are on another machine — an honest absence). The row shows the file's basename with the full path on hover, so a 375px column still fits the size beside it. **Default OFF because it changes how the agent writes**, not because it is unfinished.
- **The agent can talk to YOU (owner ruling 8(c), setting `claude.brief`, default OFF).** Claude Code has had a first-class agent→user channel since `--brief`: two real tools, `SendUserMessage` and `SendUserFile`. With the setting on, new claude sessions start with the flag and VibeSpace renders each call as a **highlighted "Message for you" card** instead of a generic tool card — which matters because with `--brief` the CLI hides plain text outside that tool from the message view, so the card IS the reply. A `proactive` status (the CLI's own word for "I am initiating, not replying") wears a chip. `SendUserFile` publishes each named file through the existing published-pages channel: session-owned, **private by default**, and the card carries the RELATIVE link the front end joins with its own origin (never a guessed absolute URL — the 2.366.1 law). Failures are ON the card, per file. Remote sessions render the card with no link (their files are on another machine — an honest absence). The row shows the file's basename with the full path on hover, so a 375px column still fits the size beside it. **A published file never disturbs a page you published yourself**: the channel keeps its own key namespace scoped to the conversation, so it can neither overwrite the bytes of a page you shared from that path nor flip its visibility, and two conversations that hand you the same `report.md` get two links instead of silently sharing one. **A call the CLI rejected — or a turn that interrupted one — says so on the card in red**, with the CLI's own reason: these cards have no ✓/✗ column, so a failure that only lived in the tool result would have shown you "File for you" about a file that never arrived. **Default OFF because it changes how the agent writes**, not because it is unfinished.
- **Prompt-cache levers (owner ruling 8(c), all default OFF, each mapped to one dumped CLI flag).** `claude.systemPromptSnapshot` (`--system-prompt-snapshot on|off` — record the system prompt once per conversation and reuse it verbatim on every request and resume), `claude.excludeDynamicSystemPromptSections` (`--exclude-dynamic-system-prompt-sections` — move cwd/env/memory-paths/git-status out of the system prompt into the first user message, so the cached prefix is identical across machines and users), and `claude.autocompact` (`--autocompact auto|100k–1M` — compaction is what breaks the cached prefix). These are a first-order cost lever for "one subscription, dozens of concurrent sessions", so they exist as measurable switches; **none is on by default** and a value the CLI would reject is dropped rather than passed on.

### Window Manager
- Floating windows with drag/resize
- Edge snap zones (Magnet-like)
- Drag threshold (5px): prevents accidental snap when clicking title bar to focus
- Pre-snap size memory: snapping saves original window size, dragging out of snap restores it (persisted in layout)
- Freeform mode (no grid) + custom MxN grid with snap-to-cell (drag + resize snap, Alt to bypass)
- A zone SMALLER than a window's minimum (the .window floor 320×180, or a desktop app's own — Chrome ~512 CSS wide, GNOME Calculator 618 tall at 2×): the window keeps its minimum and overlaps its neighbour, and in the last column / bottom row it slides back INSIDE the workspace (4 px gutter kept) instead of hanging past the edge where #workspace clips it — every snap zone, grid cell / range, preset, layout restore / sync / desktop switch, the workspace reflow (the sidebar opening, a browser resize) for a visible AND a minimized window (r2: a minimized window is placed while hidden, so a restore after the sidebar opened lands inside), and the restore from maximize (r2: the stored box carried to a workspace that changed meanwhile as the same fractions); stored bounds land on whole layout px; a new window's default cascade is kept on the workspace too; a raise by a workspace-CAPPED minimum stays on the client that needed it (never synced); a window the person left hanging off the edge keeps its own edge (inc-muhmqvzf-jodk, 2026-09-26: `_placeWindow` → PURE `zoneBox`; gates test-window-minsize §4 + heavy test-desktop-app-snap)
- Shake-to-bypass-snap: shaking a window vigorously mid-drag latches "grid/edge snap off" for the rest of that drag (mouse-only alternative to holding Alt; cursor-following "Grid snap off" badge + dashed window outline; per-drag, re-enables next drag; `window.js` titlebar-drag path only — reversal-count detector, `layout.shakeBypassSnap` on/off default on + `layout.shakeBypassSeconds` sustained-shake duration default 1s, re-read per drag so it's live-adjustable)
- Built-in presets: maximize, 2-col, 2-row, quad, 3-col (all via grid mechanism)
- Custom grid presets: + button to add, right-click to remove, auto SVG icons, persisted
- Grid overflow: round-robin distribution when windows > cells (`i % totalCells`)
- Window menu: right-click title bar → full menu (Switch-window submenu w/ configurable scope + Rename + Task Groups + Move/Minimize/Close); □ button keeps the classic overlap popup; taskbar item right-click carries Rename/Task Groups too (2.212.0). **Side by side (split UX chunk 2, 2026-09-23):** in a tab group of ≥ 2 the menu has **Show side by side ▸ Beside {name} (on the right)** per other tab (this window left, the named one right, the focus staying on this window — split r1, every user entry keeps the focus on the window acted on — 5 s Undo toast); a split group shows **Unsplit** + **Swap left and right** instead; a chain-less / one-tab window shows neither; a phone is not offered the submenu (one pane shown). A tab's right-click opens that tab's own menu
- Overlap indicator: ⧉/□ icon on title bar shows whether other windows overlap, click opens switcher
- Command mode: `Ctrl+\` prefix key (tmux-style), [CMD] indicator in taskbar, 2s auto-exit. **`v`** = side by side on / off for the active window's tab group (active tab left, most recently used other tab right, undoable), **`V`** = swap left and right; without a group of ≥ 2 tabs a toast says "Group two windows first" (never silent); the armed hint lists `v split`
- Shift+drag: select rectangular cell range in grid mode, window spans entire range
- Presets (renamed from Layouts): save/restore full workspace state (windows, positions, z-order, grid, theme, fonts). Sessions matched by claudeSessionId. Non-preset windows minimized not killed.
- Active window highlight intensity: `window.activeHighlightIntensity` setting (subtle = shadow only, normal = accent border, strong = border + glow)
- Window close behavior: `window.closeBehavior` setting — **default DETACH for everything (2.108.8, user directive: no per-type exceptions)**; sessions stay alive in the sidebar for re-attach. Ephemeral helper terminals always terminate. (The 2.108.7 shell-only default was replaced by this.)
- Tab groups: drag window icon onto another window's icon to merge into Chrome-style tab group. Tab bar with rounded top tabs, active tab connects to content. Drag tab downward to pull out (follows cursor with snap). Close individual tabs. Tab chain data synced across clients via layout-sync. **Side by side (split UX, 2026-09-23, docs/design-split-ux.zh.md):** the tab merge is the ONE exception to ordinary drag-and-snap — no drag ever splits. After a merge the strip's two-column button pulses once and a 5 s toast offers "Show side by side"; the button (active tab left, the most recent other tab right) is the entry, and in a split the same button is the badge (Unsplit / Swap left and right; the divider's right-click has the same two). The strip is drawn in visual order with a bar between the pane tabs and an owner-colour underline on each; every user-initiated split shows "Side by side: A | B · Undo" for 5 s. Right-clicking a tab opens THAT tab's window menu. **Split r1:** the button's tooltip is re-written on every tab switch (it names the partner the click will use — on a ≥ 3-tab group the most recent other tab changes with each switch); a split taken any way withdraws the post-merge "Grouped as tabs" toast, and its button, if it still runs after the group changed, says "Already shown side by side" / "The tab group changed — nothing to show side by side" (never a silent no-op).
- Window type icons: each type has an inline SVG icon (chat bubble, terminal `>_`, folder, document, etc.) shown in title bar, tab bar, taskbar, overlap switcher. Chat/terminal windows with a backend show a composite icon (backend logo + mode badge). Taskbar icons scale uniformly via `transform:scale()`. All session card buttons (star, archive, rename, find, resume, history, terminate) use SVG icons instead of emoji.
- **The title wins over the billing chip (2.369.179, lane G, 2026-09-25; owner: "这个全部->UCI Max占据了绝大部分空间，都看不到窗口标题了")**: on a tab and on a standalone title bar the billing chip shows every word ("≋ 全部 → UCI Max") only when the whole title fits beside it; otherwise the pool glyph + the member's short name ("≋ UCI Max", cut at 8 characters) while ≥ 6 title characters still show; otherwise the glyph alone (its colour still marks pool / API / subscription — a subscription chip gets a crown in that form). The tooltip leads with the full words and the click opens the billing switcher as before. Re-decided per tab / bar on resize (one ResizeObserver per bar), a title or member change, and the owner dots / inbox chip appearing or going; the inbox chip keeps its number at its minimal width ("99+" cap). Phone layout (no title bars) and the sidebar card unchanged. Rule: PURE src/lib/title-chips.js; gates test-title-chips (fast) + test-title-chips-ui (heavy).
- Taskbar: two-row layout with large icon (18px) + title/subtitle. Items show window type icon, starred sessions prefixed with ★.
- Taskbar tab-group stacking (Windows-style): a tab-group host renders ONE stacked item (`_buildGroupItem`/`_buildStackIcon` in taskbar.js) — the unique tab icons offset like a card stack (active tab frontmost; a lone icon gets a faded ghost behind), a count badge, titled by the active tab + "N windows grouped". Click → `showTabGroupList` popover of all tabs (click one → restore+focus group + `switchTab`). Right-click acts on the whole group. active/minimized/waiting is group-aware (`_applyTaskbarItemState`, reads `dataset.groupTabs`). Previously only the host showed and every guest silently vanished from the taskbar.
- Taskbar right-click context menu: Move (full-screen overlay blocks all interaction, restores from maximized/snapped), Minimize/Restore, Close
- Move mode: window restores to original size, full-screen overlay prevents interaction with other UI elements
- Virtual desktops: multiple independent workspaces with per-desktop grid/layout. Ubuntu-style miniature previews in taskbar corner showing window positions. Click to switch, drag window to move between desktops, Ctrl+Alt+Left/Right shortcut. Waiting windows blink yellow in preview. Resizable taskbar (36-120px) with auto-scaling elements.
- Loading screen: inline splash with animated progress bar, waits for workspace restore to complete before fading out
- pointer-events:none on window content during drag (prevents iframe/terminal stealing mouse events)

### Session Management
- **Run a session in its own git worktree (owner ruling 9, claude only).** The New Session dialog and Session Properties each carry a "Run in a git worktree" checkbox — gated on the harness capability row, so a harness whose CLI has no such flag simply has no row (and any tick is cleared, so a stale checkbox can never ride a create). Ticked, the spawn passes **only** `--worktree` (never `--tmux`: dtach is our persistence layer, and a tmux inside it is a second multiplexer nobody attaches to). The CLI creates `<repo>/.claude/worktrees/<name>` on a `worktree-<name>` branch and works there, so the agent never touches the tree you are editing. **If the folder is not a git repository the create is REFUSED with a reason** — the CLI would otherwise exit before the session existed, leaving an instantly-dead window — and the refusal names the escape hatch the CLI itself recommends (`git init`, or a `WorktreeCreate` hook for another VCS). Remote (ssh/dial) sessions carry the choice through the same builder as every other flag, and the preflight asks the session's own machine. The session card wears a small worktree badge and Session Properties shows **the path the CLI itself announced** (both read the fact off the live session list, which is also the `live` half the fork asks — so a fork of a running isolated session asks for a worktree even when nothing was ever saved) (its own init-frame cwd — never a path we compose from a naming rule, which a `WorktreeCreate` hook could put anywhere). The choice survives resume/restart/fork: **a fork of an isolated conversation starts a fresh worktree** (the CLI strips the binding, so the fork asks again — with the standing pick if there is one, else with whatever the run being forked turned out to be), while a plain resume re-enters whatever the CLI recorded — so the flag is emitted on a new session and on a fork only, never on a resume. Because a resume never sends the flag, a resume is never refused for it either: the not-a-git-repo refusal applies to the spawns that actually pass `--worktree`, so a conversation whose folder stopped being a repo still resumes. **Unticking the box sticks**: the checkbox is a tri-state preference, so an explicit "no" outlives a run that happens to be isolated, and a live fact only ever fills in a choice you never made. If the recorded worktree is gone the CLI continues in the plain directory and says so; the badge follows that fact and disappears, while the saved preference stays yours to change. **Resuming an isolated conversation keeps the badge**: a resume starts in the conversation's own recorded directory — which for these sessions IS the worktree — so "the CLI reported the directory we launched it in" cannot by itself mean "not isolated"; the server asks git whether that directory really is a linked worktree, and only retires the badge when the answer is no. When it cannot get an answer at all (no git, an unreachable machine) it changes nothing rather than guessing.
- Unified session list grouped by working directory
- Status filter dropdown (Live / Tmux / External / Stopped / Archived — multi-select)
- Quick new session from folder header (+)
- Resume stopped sessions via `claude --resume`
- View History: open stopped sessions as read-only (load JSONL, no resume). "📋 View History" button in sidebar expand panel
- Session names from first user message in JSONL; default session card name from CWD folder name when no custom name set
- Star sessions (★/☆): starred sessions sort first in sidebar groups and taskbar
- Archive/unarchive sessions: 📦 button, hidden by default, toggle via status filter
- Focus window highlights corresponding session in sidebar (with flash animation)
- Find/GoTo: split button in expand panel — Find flashes window + taskbar + desktop preview; GoTo switches desktop + flashes. Mode persisted via settings. Handles tab groups (resolves to host, switches tab).
- Move from sidebar: expand panel Move button → `app.moveSessionWindow(serverId)` switches to the window's desktop, resolves tab-group host, then `wm.startMoveMode` (window follows cursor, click to place). Recovery path for windows dragged off-screen. Desktop only (`!app.isMobile`).
- Session card settings: clickBehavior (focus/expand/flash/goto), findMode (find/goto), clickToCopy (always on for ID/CWD), visibleFields, detailTruncation
- Session card display: full ID with CSS mid-truncation (text-overflow ellipsis in center), CWD left-truncated via unicode-bidi
- Session card layout is TWO ROWS (2.37.3, `.session-card-lines` wraps `.session-card-main` + `.session-card-sub`; left control icons center across both via `align-items:center`): row 1 = `.session-conn-dot` (INTRINSIC connection status — LIVE/TMUX green, EXTERNAL amber, STOPPED dim; a colored dot left of the name that REPLACED the old LIVE/STOPPED text badge — its label shows on hover + in the expanded card) + name + tag badges (role, config gear, host, `.sess-state-chip`); row 2 = `.session-card-sub` = the session's **cwd**, left-truncated (`direction:rtl` + `::before \200e`), rendered ONLY when built with `showCwd:true`. showCwd is threaded from the TASK BOARD (`_observeFolder(...,{showCwd:true})` → `sessionsDiv._lazyOpts` → `_buildSessionCard(s, opts)` → `renderSessionCard(...,{showCwd})`; mobile task detail too) so a task's sessions (spanning different dirs) are told apart; the Folders view (already grouped by cwd) does NOT. RESPONSIVE tags (2.37.4, PER-CARD content-driven — NOT a fixed width threshold): `.sess-state-chip` is `<span class=chip-icon>+<span class=chip-text>`; `renderSessionCard`'s `fitTags()` measures, in text mode (sync reflow, no paint), the summed width of the tag badges vs the name's `clientWidth` (its CURRENTLY DISPLAYED area — the flex name shrinks as tags grow, so clientWidth not scrollWidth) and adds `.tags-icon` to the card when `tagsWidth >= name.clientWidth` (tags reached the displayed title area) → CSS then shows the icon, hides the text. So a short name + wide "working" chip → icon; a long name → text. Re-measured on any width change via a PER-CARD `ResizeObserver` (`card._tagsRO`, GC'd with the card); icons live on `SESSION_STATE_META[x].icon`. The config badge (`.badge-config`) is icon-ONLY (gear). INSTANT TOOLTIPS: any `[data-tip]` element gets an immediate `.instant-tooltip` on hover (utils.js `setupInstantTooltip`, self-installed, no ~1s native-title delay) — icon-only badges (config, narrow chip, conn dot, host) use `data-tip` not `title`. Task board headers stay SINGLE-row (the 2.37.1 folder-paths-in-header attempt was reverted — paths belong on the session cards). Task detail re-render skips ONLY while a focused field has TEXT (an emptied add-field re-renders + re-focuses, so adding folders/steps in a row works — 2.37.3 fix).
- Session cards draggable: drag to group header to assign session to group
- Status quick tabs: ALL/LIVE/TMUX/EXT/STOP/ARCH filter tabs (enabled via settings)
- **★ Task Group (岗位) concept refactor — 2.39.0 (read this before the historical bullets below; it supersedes them where they conflict).** The code's "Task"/`TaskManager`/`tasks.json` was really the user's **Task Group (岗位 — a persistent ROLE)**; the user's "Task" is a **session (活儿)**; the user's "Task Status" is our **session status**. What changed across the P1–P6 refactor + P0 rename (design: docs/design-task-refactor.md; full log: memory `project-task-system`):
  - **★ CHECKLIST REMOVED — 2.121.0 (user decision; supersedes every checklist/plan mention below).** A group-level checklist of agent WORK ITEMS never made sense: agents don't care about other agents' backlogs — work items live at the SESSION level (the agent's own native todo list, already surfaced as the card's Steps per 2.46.0). Removed everywhere: task-detail Checklist section, task-log Checklist tab, `vibespace-task plan-*` subcommands (print a redirect; `/api/agent/task-plan` = 410 responder for old remote CLI copies), injected context Checklist section + teaching line, diff-update checklist deltas, TASK.md, repo export (import still recognizes legacy `## Checklist`/`## Plan` headings as section STOPS, content dropped). Stored `plan` arrays stay DORMANT in data/task-groups.json (update() ignores plan patches, list() strips it, config-bundle import passes it through — nothing destroyed). `_showTaskChecklistPopover` was renamed `_showTaskBindPopover` (it was always the group-BIND popover, unrelated to the checklist).
  - **★ BACKLOG ADDED — 2.122.0 (user decision; a DIFFERENT concept than the removed checklist).** The group's PARKING LOT for **non-immediate** items: decisions the user deferred, work they said comes later — the class that previously had no home (session todo = immediate steps; activity log = past; vibespace-ask inbox = act-now notifications). Field `backlog` on the group: {text ≤500, detail? ≤6000, status open|done|dropped, addedBy/addedAt, resolvedBy/resolvedAt, **priority high|normal|low** (2.369.154)}; NO cap since 2026-09-22 (a bound belongs to a read); contentUpdatedAt bumps on backlog edits. **PRIORITY + OWNERSHIP SELECT EVERY READ (2.369.154, owner 2026-09-22):** `src/backlog-select.js` orders every listing (open by priority, newest first within one) and picks each session's reminders — its ≤5 highest-priority newest CLAIMED items, one `- unclaimed HIGH:` line naming the open high items nobody owns (so they cannot rot), everything else a count; `backlog-add/-edit --priority`; the CLI numbers the sorted list and a number means the item printed under it in the list that session was LAST SHOWN (another session's add never moves it; `backlog-done` prints what it resolved); a high item whose claimants are no longer running counts as unowned; the repo task file escapes a text beginning `! `/`↓ ` and reads markers only in files that declare `backlog_priority: markers`. Agents: `vibespace-task backlog / backlog-add "item" [--detail] / backlog-done <n|text> / backlog-drop` (resolve indexes the OPEN-items list as displayed) — taught to park when the user defers something and to NEVER start parked items unasked. **Injection is SUMMARY-ONLY (user directive, load-bearing): the hook never dumps backlog content** — `renderContext`/`renderMultiContext` take `sessionKey` (threaded from agent-routes) and `_backlogNoteLines` emits a ≤5-line reminder block ONLY for open items THAT session parked, else a single count+pointer line; the FULL list lives in TASK.md (cap>0 renderings), `show`, and the UI; backlog CHANGES arrive as one-line diff events (PARKED/RESOLVED/DROPPED/REMOVED, occurrence-indexed like the retired checklist diff — same duplicate-text bug class, covered by tests). UI: task-detail Backlog section (open items, ✓/⊘, park input, resolved-count link) + task-log Backlog tab (2.369.154: rows in sortBacklog order, a High/Low chip per non-normal row, priority set from the row's right-click `Priority ▸` submenu or the ✎ editor — one whole-backlog write, the broadcast repaints); repo file round-trips `- [ ]/[x]/[-]`. One-time seed migration: the dormant plan's UNCHECKED items → open backlog items (guard `backlog === undefined`; dormant plan itself untouched).
  - **Status lives on the session, not the group.** Session STATES = `working/needs-input/blocked/review/done` (`done` added). A Task Group has NO status — only `archived` (a role never "completes"). The `vibespace-task status` subcommand and `/api/agent/task-status` are gone; `done` is reported via `vibespace-status done`.
  - **A session belongs to 0..N Task Groups, derived LIVE** (`TaskGroupManager.groupsForSession({sessionKey,cwd,initialGroupId})` = explicit `sessions[]` tag ∪ auto-include folder match ∪ spawned-into group; archived excluded). A UI bind/drag/folder change reaches the agent on its NEXT turn with no respawn — the old single `session._taskId` is GONE (replaced by `_initialGroupId`, which only covers the pre-bind window). `VIBESPACE_TASK_ID` spawn env + the hook `?taskId=` were removed — belonging is resolved server-side from the `vsst_` token alone.
  - **Injection covers every belonged group** (`renderMultiContext`), gated per-group by `session._groupSeenAt[groupId]` + a `contextDirSignature` (so a UI edit, another session's `vibespace-task`, OR user-written files in a group's contextDir all re-inject that group next turn). Per-group **`injectContext`** toggle (task-detail checkbox) opts a group out of injection while keeping belonging/board/vibespace-task working. Baseline `vibespace-status` intro still goes to sessions in NO group.
  - **`vibespace-task --group <id>` + enforced isolation** (`resolveAgentGroup`): one group → inferred; several → required; an explicit `--group` must be one the session belongs to (403 otherwise), 0 groups → 403. (P5's `plan-check` by-attribution retired with the checklist in 2.121.0.)
  - **Rename (P0):** `src/tasks.js`→`src/task-groups.js`, `TaskManager`→`TaskGroupManager`, `data/tasks.json`→`data/task-groups.json` (one-time forward migration in `_load`, legacy file left in place). User-visible UI strings say "Task Group". **KEPT for data/contract compatibility (do NOT assume renamed):** the internal `_state.tasks` map key, the JSON field `progress` (+ dormant `plan`), API paths `/api/tasks*` + `/api/agent/task*`, the `tasks-updated` WS event, and the CLI command name `progress`. So below, "task" often means Task Group and "progress" means Activity log.
  - **Review fixes (2.44.0 — do not regress):** (a) client membership has ONE folder-match implementation `_sessionFolderMatch(s, folderRecs)` (cwd|realCwd) used by the board's `_getTaskSessionKeys`, Task View's `_getSessionTaskGroups` and the expanded card — mirroring the server's `groupsForSession`; (b) **`contentUpdatedAt` gates agent re-injection** (bumped only by title/objective/contextDir edits + addProgress; `updatedAt` still bumps on everything for the UI) — bind/color/injectContext/archived changes must NOT re-inject; (c) the baseline `vibespace-status` intro fires whenever a session has NO injectable group (including belongs-but-all-inject-off); (d) **stale-state decay**: a non-live session's declared working/needs-input is dropped (`_synthSessionState` + the card chip; done/review/blocked persist, rendered dashed) and `_sessionSortRank` bumps blocked/needs-input only for LIVE sessions with `done → -1` (sinks); (e) `contextDirSignature` is TTL-cached (4s) and `groupsForSession` caches realpath — both run per prompt on the hook's 3s-timeout path. REMAINING BACKLOG (accepted): seen-state persistence across restarts, hook-timeout vs seen-bump loss window, host-scoped folders (remote cwd can string-match a local folder), `kind` retirement, explicit `?src=` consumer lock for codex.
  - **Sidebar per-tab chrome + defaults (2.47.0, corrected in 2.47.1):** `_updateTabs()` hides inapplicable header controls per tab. GOTCHA that bit here: `#backend-filter` is misleadingly named — it opens the UNIFIED filter menu (connection-Status + Backend + Location/hosts + Agent-kind sections; the display:none `#live-filter` button's status filter lives inside it), and its backend/host/kind dimensions APPLY on the Tasks tab (only the Status section is bypassed there). 2.47.0 wrongly hid it on Tasks (three dimensions kept silently filtering with no visible control); 2.47.1 shows it on both session tabs and the menu SELF-HIDES its Status section when `_activeTab==='tasks'`. Folders keeps everything; Tasks = search + unified filter + agent-kind quick tabs + manage (no `#sort-toggle`/status quick tabs — genuinely inapplicable); Remote hides all. Naming de-confusion: the text input placeholder is **"Search..."** (was "Filter..." — clashed with Task View's Filter button). **(2.48.0) ONE control row:** the flat Tasks view's embedded toolbar was REMOVED — `#sort-toggle` is context-aware (Folders: recent/folder cycle; Tasks view: opens the urgency/status/recent/name menu; hidden on the Groups sub-view — `_updateTabs` reads `_boardView`, and the sub-tab click calls `_updateTabs()`), and the session-STATE filter is the FIRST section of the unified filter menu when `_activeTab==='tasks' && _boardView==='tasks'`. The Search box narrows ALL sub-views (text filter runs before the tab branch). Settings `sidebar.defaultTab` (folders/tasks/mounts) + `sidebar.defaultBoardView` (groups/tasks) applied via the one-shot-listener pattern (like defaultStatusFilter); a manual tab/subtab click sets `_tabTouched`/`_boardViewTouched` so the async default never overrides the user; boardView localStorage persistence removed (the setting IS the persistence). Task View sort: ★ tiebreaker after the primary key (urgency/status/recent; name stays alphabetical) — same precedence as `_sortSessions` (urgency → ★ → recency).
  - **Session TODO surfaced (2.46.0 — 活儿的步骤 = the agent's NATIVE todo list, never a parallel store):** server captures TodoWrite (claude) / `plan_updated` (codex) / the **TaskCreate/TaskUpdate family** (CLI ≥2.1.2xx; CRUD by id — the created id ONLY appears in the tool RESULT text "Task #N created…", so creates are stashed by tool_use_id until the result lands; `applyTaskToolUpdate`/`emitTaskListTodos` in server.js) → `session._todos {done,total,current}` → active-sessions/api-active `todo` field (500ms coalesced broadcast) → card **progress pill** `.session-todo-pill` (shown while done<total, tooltip = current step) + expanded-card **Steps** list (lazy `GET /api/session-todos`, reads `taskState()` from the transcript — works for stopped sessions; `_scanTaskState` in session-store replays both tool families, and the wrapper-meta shortcut no longer short-circuits on an EMPTY todos array). (The 2.46.0 "Group Checklist as BACKLOG" repositioning is gone — the checklist itself was removed in 2.121.0; the session todo is the ONLY work-item surface.) **Task scan is FULL-FILE + TIMESTAMP-ordered since 2.180.1** (scanTaskEventsFull in session-store.js: streaming substring-prefiltered scan, incremental byte cursor, uuid dedup): COMPACTION re-appends retained records with their ORIGINAL ts/uuids after the whole history — a task's create/in_progress replayed without its summarized-away completion made file-order scans (and any tail window) show a long-completed task as in_progress forever (real report, #136 on a 589MB transcript). Events apply ts-sorted; family preference is by LATEST USE (an ancient TodoWrite snapshot must not shadow the newer TaskCreate/TaskUpdate list). The old tail-window stub-entry caveat is retired. Test: scripts/test-task-scan.mjs.
  - **Remote context-folder auto-sync (2.45.0, verified e2e on the devbox):** a REMOTE session's belonged groups with a contextDir get a live-synced copy at `<remoteHome>/.vibespace/ctx/<groupId>` — bidirectional rsync (`-az --update`, newer-wins, no deletes, `.vibespace/` excluded), triggers = spawn (`scheduleCtxSync` via ws ctx) + 60s timer + prompt-context delivery — all three gated by the Integration master switch since 2.190.0; in-flight guard `_ctxSyncBusy` per host:group. Injection is PATH-TRANSLATED for remote sessions: `remoteCtxBaseFor(s)` → `renderContext({ctxBase})` / `renderMultiContext({ctxBaseFor})` print the remote absolute paths (remote $HOME cached in `hosts.homeDir(h)`; first turn before the cache warms falls back to local paths — self-heals). Remote writes rsync back → local `contextDirSignature` changes → every member re-injects next turn. rsync required on both ends; `hosts.sshCmd(h)` = ssh option string for `rsync -e`.
- Task board (Tasks tab, 2.30.0 — tasks ⊃ groups, design docs/design-task-system.md): tasks tag sessions across directories; kind:'task' adds a status chip (active/paused/blocked/done) + ⚠ attention badge; kind:'group' = migrated legacy groups (Convert to task via context menu). Board order: attention → tasks → groups → done. Bind via the card Tasks-row bind popover / drag card onto header / folder auto-include; ▶ resume-all; detail button opens the task detail window
- Tasks-tab **Groups | Tasks sub-tabs** (2.40.0/2.41.0, `_buildBoardViewTabs` → `.sidebar-subtabs`/`.sidebar-subtab`, same visual language as the main tabs): *Groups* = the member-session board above; *Tasks* = `_renderTaskViewFlat` — a FLAT list of EVERY session (活儿). Tagged sessions (in ≥1 group) sort to the top by `_taskViewSortFn`; **untagged sink to a labeled `.task-view-untagged-header` section at the bottom** — only LIVE/tmux untagged are listed (the count of STOPPED untagged is shown as "N stopped · see Folders", NOT rendered — there can be thousands). Each card is built with `showCwd:true`; tagged cards get a `.task-view-group-badge` per group (click → openTaskDetail). **Sort** (`_taskViewSortMode`: urgency/status/recent/name; `_taskViewRank` = urgency×10+statusW for 'urgency', statusW×10+urgency for 'status'; statusW blocked/needs-input=5,review=3,working=2,done=1; state synthesized by `_synthSessionState` like the card chip) via a `.tv-tool-btn` showContextMenu; **status filter** (`_taskViewStatusFilter`, `.tv-filter-pop` checkboxes, null=all) via `_showTaskViewFilterPopover`. All three (`boardView`/`taskViewSort`/`taskViewFilter`) persist in localStorage. IMPORTANT (sidebar.js `_render`): the Tasks tab uses `_allSessions` WITHOUT the live/stopped status filter or quick-view narrowing (a group's members are often stopped — narrowing hid them) — only archived hiding applies; and the bare "+ New Session" card + the "No sessions" early-return are skipped on the Tasks tab (it has "+ New Task Group" and renders its board even with zero sessions). A tagged session whose JSONL is gone from discovery simply can't appear (data absent, not a filter bug). **Membership (2.41.1)** uses `_getSessionTaskGroups(s)` = explicit tag ∪ auto-include folder match — the SAME rule as the board's `_getTaskSessionKeys` and the server's `groupsForSession` (NOT `_getSessionTasks`, which is tag-only for the bind popover); excludes archived. Folder match tests `s.cwd` AND `s.realCwd` (a symlink-resolved cwd `withSessionKey` stamps in discovery — a session under `claude-code-webui` → `vibespace` matches a folder on the real path; `groupsForSession` realpaths cwd too, so injection agrees). **(2.42.0)** Group membership renders as LEFT **color bars** (`.task-view-colorbar`, one per group, `data-tip` = name/objective, click → openTaskDetail) — NOT a badge row (saved vertical space). Every session with a state gets urgency defaulted to `normal` (`SESSION_URGENCY_META` gained `color`s), set on `card.dataset.urgency` (in `renderSessionCard`) → a subtle **urgency-tinted card background** scoped to `.task-view-row .session-item-card[data-urgency=…]` (urgent red / high amber / normal faint-blue / low faint-grey); `_taskViewRank` also treats missing urgency as normal. The expanded card's **Task Groups** detail (`renderDetailGroups`) uses `_getSessionTaskGroups` too (folder-derived members shown, marked "(folder)"; the bind popover still toggles explicit `_getSessionTasks` tags only). **Mobile parity (2.50.0):** `_renderMobileTaskBoard` gives the mobile tasks tab the SAME Groups|Tasks sub-tabs — Groups = the drill-down list, Tasks = the shared `_renderTaskViewFlat` (touch-ready cards; sort menu button enabled on mobile; drill-down back button does a full `_render()` to restore the sub-tab bar)
- Task detail window (task-detail.js, window type 'task'): structured editor over tasks.json — title, status, objective, **Backlog** (2.122.0 parking lot: open items with ✓ done / ⊘ drop, † detail expander, park input, resolved-count link into the viewer; the 2.121.0-removed Checklist was a different concept), **Activity log** (was "Progress"), bound sessions (explicit + dim "via folder" rows, × unbind), auto-include folders with a per-folder **subfolders (recursive) toggle** (dir autocomplete), context folder designation (injected — the label used to wrongly say "coming in P2"), color row (2.230.0: leads with an 'A' AUTO swatch — unset color = deterministic distinct hue from the id via utils.taskGroupColor/autoTaskColor (fnv+avalanche), the scalability answer for many groups; **2.231.1 FINAL DESIGN (user's formalization): auto identity = a FIXED SEQUENCE S_k** in hue × lightness band (52/36/68%) × LINE-STYLE texture space (chart line styles solid/dash/dot/diag — variation runs along the bar LENGTH so it reads at 3px width where fine fills can't; textures open after 36 solid slots; 144 slots) — golden-angle hues give every prefix ≥~62% of ideal spacing and ASSIGNED POINTS NEVER MOVE; **the sequence is INFINITE (2.231.2)** — the 12 discrete planes cycle while the within-plane golden index grows unboundedly (no wrap: slot 144 ≠ slot 0; density degrades gracefully ~0.618×360/perPlaneCount, never exact collisions). **v5 dimension order (2.232.0, user caught 20 groups all-solid): ALL dimensions from the start** — planes cycle every 12 slots (solid trio b52/b36/b68, then dash/dot/diag trios; group 4 is already dashed; any two groups within 11 positions differ in band or texture outright; per-plane 97° hue offset). **Order is a SETTING (2.232.1, `tasks.autoStyleOrder`: interleaved default / solid-first = the 36-solid-slots layout)** — the order param threads through seqTaskColor/pickColorSeq and MUST reach the server allocator (TaskGroupManager gets `getSetting` → serverSetting): mask comparisons use slot renderings, so client and server must sequence identically or auto collides with manual picks; render-time reads have a settings listener (2.112.4 rule). The slot = `colorSeq`, allocated server-side at create (LOWEST FREE index — **deletion frees the slot for reuse**; manual color/texture picks MASK nearby slots so auto never collides), stored on the record, backfilled by createdAt at boot; generator+allocator live in src/task-color-seq.js (ONE module shared by server require + client esbuild import); renderer = pure seqTaskColor(colorSeq) via sidebar.getTaskColor/getTaskPattern (no set-aware map). `pattern` is also a MANUAL store field (null=auto/solid/dash/dot/diag, sanitized enum, visual-only — never bumps contentUpdatedAt; manual wins, composable with explicit colors; task-detail Texture chip row); getTaskPattern → data-pattern on .task-view-colorbar + board strip via border-image (color-only swap, 4px layout untouched); 18 preset swatches + native custom picker (any hex — the server sanitizer always accepted it) + explicit-neutral sentinel `'none'`; every consumer resolves through taskGroupColor, never reads t.color raw), **Export / Import** (was "Repo file"; both buttons now), delete. Live-syncs via tasks-updated (skips re-render while an input inside is focused); closes itself if the task is deleted elsewhere; openSpec `openTaskDetail` replays across clients/restores
- Task terminology (2.37.0; checklist half OBSOLETE since 2.121.0): "Progress"→**Activity log** in lockstep across UI label / generated `.vibespace/TASK.md` / injected `renderContext`; the CLI command keeps its name (`progress`). Repo import parses both `## Activity log` and legacy `## Progress` headings (and still recognizes `## Checklist`/`## Plan` as section stops, content dropped).
- Task folders are `{path, recursive}` records (2.37.0; migrated from bare strings — legacy strings + old callers still work via `_sanitizeFolders`/`_folderRec`). `recursive:true` (default) auto-includes sessions in any SUBFOLDER (`_getTaskSessionKeys`: `cwd===path || (recursive && cwd.startsWith(path+'/'))`); `false` = exact-cwd only. New-session dialog cwd autocomplete floats the selected task's folders to the top, highlighted (`setupDirAutocomplete` `priorityPaths` option). Board color made prominent: 4px bar + tinted bg + colored title (`[data-colored]`), was a 2px edge.
- Task header: right-click context menu (Details… / Rename / Status ▸ / Convert to task / Linked folders / Delete), drop target for folders and sessions
- Per-task attention: the existing OSC-idle/window-waiting signal aggregated per task (`app.getWaitingSessionKeys()` → `sidebar.refreshTaskAttention()` through the updateTaskbar funnel, signature-guarded) PLUS declared-blocked sessions from session status — board headers show ⚠ N and the Tasks tab blinks ⚠; observation only, never auto-acts. Attention signature covers waiting keys + statuses + `_sessionDigest` (blocked-key resolution and folder auto-include depend on the session list; the initial status fetch races the first poll)
- Session status (2.31.0; sidebar surfacing 2.37.0): session-level `state` (working/needs-input/blocked/review) + `urgency` (low/normal/high/urgent) + reason. The AGENT sets its own via `vibespace-status` (spawn env: `VIBESPACE_API`, per-session `VIBESPACE_SESSION_TOKEN`, data/bin prepended to PATH); the user overrides/clears via the card chip popover. **SYNTHESIZED chip on EVERY live/tmux card (2.37.0)**: agent-declared state wins; else OSC-idle (`getWaitingSessionKeys`) ⇒ needs-input, else live ⇒ working — synthesized chips render dashed+dim (`.sess-state-derived`) vs solid for declared. **Urgency drives sidebar sort (2.37.0)**: `_sortSessions` ranks by `_sessionSortRank` (urgent>high>normal>low; blocked/needs-input/OSC-waiting also bump) BEFORE starred/recency; waiting keys cached per render pass (`_waitingSet`, cleared via queueMicrotask). userW's task-centric fork (which inspired urgency-as-priority) isn't in this repo — this reuses our own state+urgency, which just wasn't wired to sort/always-shown before. Overriding an agent-set value records a pendingNotice → appended as `<system-reminder>` to the NEXT chat-input (ws-handler) so the agent calibrates (verified in a live transcript). Cards show a colored chip (+`!`/`!!` urgency, urgent pulses). KEY SPACES (do not regress): records key by `backend:backendSessionId`, or `webui:<serverId>` before the id exists — client reads try both, and `_sessionStatusKeyFor` WRITES to the key an existing record lives under (else user override lands on a second record and override detection silently misses); the agent route rekeys webui:→real on its next call
- Hook install management (2.33.0): Manage Agents dialog (local machine) shows a "VibeSpace integration" row — per-harness hook status in plain language + Install/Reinstall (regenerates the script too) + Remove. Auto-registration at startup follows the Integration master switch since 2.190.0 (syncHookRegistration at boot: ON → ensure, OFF → strip; the dialog is the non-engineer-visible surface; both Install routes refuse while the switch is off). **Remote parity (2.129.0, backlog B-34bb — the 2.126.0 argv-shock transparency follow-up): selecting a host renders "VibeSpace integration on <host>"** — per-tool ~/.vibespace/bin state vs the LOCAL copies (sha256 `current`/outdated/absent, per-tool tooltip), hook registration in the HOST's own CLI configs, node availability, keeper session files; Install/Reinstall (same tar-over-stdin channel as per-spawn) + danger-confirmed Remove (hook-register `--uninstall` then rm exactly our files). The row states that creating a remote session RE-INSTALLS everything (per-spawn zero-drift is the design — with the master switch OFF only the transport keeper ships and the row says so, keeping Remove as the residue-cleanup path while withholding Install). Routes: GET /api/hosts/:id/agent-tools (+ /install, /uninstall POSTs). Codex remote CHAT fails fast with an honest error since 2.129.1 (never wired — claude flags in codex argv died opaquely; full support parked B-0588).
- vibespace-task CLI (2.33.0 local, 2.34.0 remote): agents report task-level updates — `progress "note" [--detail]`, `show [--full]` (the `plan-*` subcommands left with the checklist in 2.121.0; `status` left in 2.39.0) — scoped server-side to the session's live Task-Group belonging; taught by the injected context rules. REMOTE (2.34.0): distributed to `~/.vibespace/bin` on the remote and reaches VIBESPACE_API through the ssh reverse tunnel — verified writing back from the devbox.
- Anti-misconfiguration for the agent tools (2.37.0): both `vibespace-task` and `vibespace-status` print usage AND the current state on NO args, list valid subcommands on an unknown one, and validate their enum locally. NOTE (superseded by 2.39.0): `vibespace-task status` no longer exists — a Task Group has no status; a session reports its own state via `vibespace-status <working|needs-input|blocked|review|done>`. `renderContext`'s "How to report back" was rewritten: `vibespace-task` commands are scoped to the session's live Task-Group belonging via the `vsst_` token (with >1 group the agent passes `--group`, validated to be one it belongs to — there is no `session._taskId` anymore), and "run bare to self-check" is the fallback. **Injection ORDER + SIZE are load-bearing (2.68.0, real incident; THRESHOLD corrected 2026-07-13 by empirical test):** hook additionalContext up to ~10KB reaches the model FULLY INLINE (verified: a 9.8KB block's end-marker was seen). The wrap threshold is EXACTLY 10240 bytes = 10 KiB (binary-searched: 10000 inline ✓, 10240 wrapped ✗). At/above 10 KiB Claude Code wraps it in `<persisted-output>` — a ~2KB inline preview PLUS the full content saved to a file the agent can Read (verified at 30KB/60KB). So there is NO 2KB hard cap (the old note misread this); the 2.68.0 failure was a 24KB Activity-log-FIRST payload crossing the wrap threshold → agents got a useless log preview + never Read the file for the tools. claude-mem uses the IDENTICAL additionalContext mechanism — no magic. prompt-context (agent-routes.js) HARD-CAPS the final additionalContext at 9600 bytes (margin under 10240) — tail-truncates the oldest activity-log lines at a UTF-8-safe newline boundary + appends a `show --full` pointer, keeping the tools-first HEAD always inline — the old layout (24KB Activity log first, tool rules last) meant agents saw a pure-log preview and NEVER learned the vibespace tools (observed fleet-wide non-usage). renderContext now orders identity/objective → HOW TO REPORT BACK → context folder → Activity log LAST, with the log BYTE-BUDGETED (total ≤ ~8KB, newest entries win, ≥3 ≤12, "last N of M" pointer; renderMultiContext splits the budget across groups). TASK.md keeps 50 entries.
- Repo task files (2.34.0, P4): a task ⇄ a committable markdown file. Task detail window "Repo file" → Export (frontmatter id/title/kind/status/color + objective + activity log); board "Import…" card reads such a file back into the store (frontmatter authoritative; existing sessions/folders/progress preserved). Server `TaskManager.exportToFile/importFromFile` + `/api/tasks/:id/export|import`. The store stays authoritative — the file is a projection/seed, never live-parsed.
- Task context injection (2.34.0, P2 — hook-ONLY, NEVER message injection): the user's message text is sent VERBATIM; task context + status-override notices ride the harness's OWN native hooks via `data/bin/vibespace-hook.mjs` (registered for BOTH `SessionStart` and `UserPromptSubmit`). Rewriting the user's input to smuggle context (the earlier codex/remote "first message" approach) was RIPPED OUT — it bypasses the CLI and is unstable (user directive 2026-07-05). Hook output MUST be ONLY the nested `{hookSpecificOutput:{hookEventName, additionalContext}}` shape — an extra top-level `additionalContext` key makes CODEX reject the whole object (its `*HookSpecificOutputWire` schema is `additionalProperties:false`); Claude is lenient but reads the same nested field (2.1.201 binary hints "Did you mean hookSpecificOutput"). **`/api/agent/task-context`** (SessionStart) delivers context, sets `_taskCtxDelivered` (gated `backend!=='codex'`); **`/api/agent/prompt-context`** (UserPromptSubmit) delivers context on the FIRST prompt when SessionStart didn't (codex path) + any pending status-override notice (consumed once). **Per-turn micro-reminder (2.78.0, user request):** when NOTHING bigger is delivered on a prompt, the route returns a ~330-byte `<vibespace-reminder>` one-liner (status/ask/task, `--group <id>` variant for multi-group) so tools stay in the agent's working context on long sessions — the start-of-session rules scroll out and usage decays. Gated by `agents.perTurnToolReminder` (default ON, liveApply); claude gets it via the UserPromptSubmit hook, codex via the wrapper's per-turn inject. BACKEND REALITY (verified live with a codeword-in-objective): **Claude fires + INJECTS both hooks** (terminal + chat, local + remote) — fully works via hooks. **Codex app-server RUNS hook commands but does NOT inject their `additionalContext`** in JSON-RPC mode (0.142.5) — so for CODEX the hook is NOT the delivery path. Instead (2.35.0, research-verified) the **codex-chat-wrapper injects context natively via `thread/inject_items`** (a first-class app-server method that appends a `role:'developer'` message to the thread's model-visible history out-of-band from the user turn): `injectTaskContextForTurn()` calls `/api/agent/prompt-context` before each `turn/start` and, if non-empty, injects it. Verified: codex answered a codeword only in the task objective, AND the NEW codeword after an edit. GOTCHA that cost a debug cycle: the VIBESPACE_* env reached the spawned CLI (argv `env VAR=val` prefix) but NOT the WRAPPER's own process.env, so the wrapper's inject silently no-op'd — the wrapper (always LOCAL, even for remote sessions) now gets VIBESPACE_API=127.0.0.1:<PORT> + token + task id in the dtach process env directly. The `vibespace-hook.mjs` UserPromptSubmit hook stays registered (works for Claude; harmless for codex). **Task-update injection (2.35.0; DIFF-BASED since 2.113.0):** both endpoints track per-session `_groupSeenAt` (the `contentUpdatedAt` last delivered) — so any group change (UI or another session's vibespace-task) reaches the agent on its NEXT turn, no per-turn noise otherwise. Since 2.113.0 an UPDATE delivers only the DELTA, not the full re-render: every delivery also snapshots the group (`s._groupSnap` via tasks.snapshotForDiff) and later changes inject a `<vibespace-task-update>` block from tasks.renderContextDiff (objective/title edits, changed contextDir files, new activity entries — see the agent-routes.js file-structure note for the full contract; toggle `agents.contextUpdateDiffs`). Claude gets it via the UserPromptSubmit hook; codex via the wrapper's per-turn inject. TASK.md: TaskManager writes `<contextDir>/.vibespace/TASK.md` on every change + boot (program-only writer, content-compare guard, atomic). Remote (P3): the ssh spawn opens a reverse tunnel `-R <rport>:127.0.0.1:<PORT>` (remote agent tools/hook reach VIBESPACE_API through it) and the tools + the per-session vsst_ token ship over ssh STDIN as ONE tar into `~/.vibespace/bin` (0700; token = 0600 `.tok-<id>`, referenced via a `VAR="$(cat …)"` shell prefix assignment — **2.126.0: NOTHING secret or bulky in argv anymore**; the old inline-base64 prelude put ~300KB of blobs AND the vsst_ token in /proc/cmdline on the remote, readable by any local user — real user shock report) + the prelude runs `vibespace-hook-register.mjs` to register the hook in the REMOTE's own settings (its local Claude/Codex fires the hook, not ours) — verified end-to-end on the devbox (remote claude answered the codeword; remote `vibespace-task progress` wrote back through the tunnel)
- New session from a task (2.31.0): the New Session dialog has a Task dropdown (None + all tasks; picking one prefills cwd from folders[0] if empty). Task board + button / context menu open the dialog PRE-FILLED (task selected, cwd = first auto-include folder) — user confirms params. Chosen task → `taskId` in the ws create → `session._initialGroupId` (covers the pre-bind window; there is NO `VIBESPACE_TASK_ID` env anymore — belonging is resolved live from the `vsst_` token per 2.39.0) + client binds the session via `_pendingTaskBinds` once the backend id appears in active-sessions (folder-less groups need the explicit tag; reload before id adoption loses the pending bind — acceptable). (2.54.0) With a group selected, the cwd quick-fill CHIPS pin the group's folders first (`_taskCwdSuggestions` → `.cwd-task-chip` with the group color dot; re-rendered on Task-dropdown change) — and recursive folders also suggest nested session cwds (strict `path+'/'` prefix on cwd|realCwd, local sessions only, sorted by session count); the autocomplete priorityPaths float is separate and unchanged
- GOTCHA (rename legacy): `~/workspace/AIWorkspace/claude-code-webui` is a SYMLINK → vibespace; the kernel resolves cwd through it, so sessions "in" that path record vibespace — looked like a spawn-cwd bug during verification, is not one
- Archive folders (2.30.0): "Archive project" records the FOLDER (`archivedFolders` in user-state, host-scoped exact-cwd keys) so sessions created there LATER start archived too; unarchiving one session dissolves the folder rule into individual archives; the project button toggles archive/unarchive
- **Invalidating a SERVER cache that a CLIENT also caches must NOTIFY (2.309.0, real report)**: the client's remote-discovery list has no TTL (an ssh scan is expensive), so dropping only the server's copy left a terminated remote session reading as live until a manual ⟳ — invisible AND permanent. `hosts.invalidateDiscovery` fires `onDiscoveryDirty`; the server then computes the list ONCE on the owning machine (the `discovery-claims` device op) and broadcasts the RESULT as `remote-sessions` — clients apply it, they never re-fetch (2.310.0: broadcasting a bare 'stale' put the trigger for a heavy scan on the orchestration side and multiplied it by the client count; one dirty signal must cost one computation). Nothing is computed when no client is connected; an unreachable machine pushes an error and clients keep their labelled last-known list. The hook lives on the ONE invalidation entry point, never per call site — the bug existed because `/api/kill-pid` had a hand-wired refresh and the ws terminate path did not. Test: scripts/test-remote-discovery-dirty.mjs (drift guard fails any new raw `_discoveryCache.delete`). **COLD START serves STALE-while-revalidate (2.320.0, inc-msp2srj2): a cold sweep blocks 10-60s (device bootstrap/daemon self-upgrade/ssh master rebuild — 12.3s measured healthy) and the zone rendered EMPTY the whole window while the persisted last-known list was only consulted on failure; cold `discoverSessions` now returns it instantly stale-marked + kicks ONE background refresh through this same dirty→push channel (no loop: the background pass runs ttlMs:0 which skips the SWR branch); explicit ⟳ still scans. Field rule: a '默认没有/empty by default' report on anything remote = measure FIRST-PAINT LATENCY before hunting for a data bug — slow-to-first-paint and broken are indistinguishable to the user.**
- Multi-client sync: star/archive/archivedFolders/rename/bookmarks broadcast via `user-state-updated`; tasks broadcast via `tasks-updated` — all clients update live. **RULE (2.231.3, real every-create bug): a UI action chained after a store WRITE must never wait on the broadcast echo** — the awaited API response beats the WS broadcast essentially always, so create→openTaskDetail looked the fresh id up in a stale client mirror and toasted 'Task Group not found' on every create; task create/update/import upsert the returned record into the mirror SYNCHRONOUSLY (`_upsertTaskLocal`), delete removes locally, the broadcast overwrites idempotently (same class as `_pendingTaskBinds`)
- Session rename: double-click name in sidebar → set custom name → used as `--name` on next resume (if CLI supports it — detected via `--help` at startup), syncs to open windows
- Terminate button: in session card expand panel for all running sessions (live/tmux/external). Live uses WebSocket kill, external/tmux uses `POST /api/kill-pid`
- Session right-click menu + Properties window (2.49.0): `renderSessionCard` installs a `contextmenu` handler (works on touch via the global long-press synthesizer) building a full quick-action menu (focus/resume-in-mode/history/fork/star/archive/rename/set-status/Task-Groups submenu with folder-derived disabled/copy/find-goto-move/properties/terminate) — same handlers as the expanded buttons. `src/lib/session-props.js` `openSessionProps(app, sessionRef)` (openSpec `openSessionProps`, window type 'task', keyed dedup `_sessionPropsKey`): Identity / State(+Change popover + history timeline via /api/session-status/history) / Billing (auth line + ON-RESUME account select writing sessionConfigs.account) / Config overrides summary / Task Groups toggles (explicit bind/unbind; folder-derived disabled) / Agent steps (/api/session-todos, empty-subject stubs filtered). Live re-render on tasks-updated/session-status-updated/active-sessions/accounts-updated/user-state-updated; ws listener removed in winInfo.onClose (task-detail pattern).
- Per-session config: gear button (⚙) in Resume split button group opens a popover with Model/Effort/Permission overrides. Each row has a checkbox — unchecked = greyed out, uses global default; checked = per-session override. Changing a select while unchecked auto-checks. Model supports combobox (Custom... for specific model IDs). Overrides are PERSISTED per session in user state (`sessionConfigs` map, key `backend:backendSessionId`, synced multi-client like star/archive) — saved on every popover change, NOT just passed at resume time (closure-only overrides were lost on sidebar re-render, which is why config "didn't take effect"). `app.resumeSession()` reads saved config via `sidebar.getSessionConfig()` for any param the caller didn't specify, so ALL resume paths apply it (card click, Resume button, resume-all, chat resume bar, layout restore). Cards with overrides show a purple gear badge (model/effort/permission summary in tooltip, `.badge-config`).
- **OpenCode history needs the background service (2026-09-07)**: OpenCode keeps conversations in its own database, not in files, so a STOPPED OpenCode conversation can only be listed / opened / resumed / forked while the **OpenCode background service** plugin is on (running sessions never need it). It is off by default, so the FIRST time you use OpenCode here — creating an OpenCode session, or opening/forking an OpenCode conversation — VibeSpace shows ONE dialog explaining what the service does (loopback only, your own CLI, stops when disabled) with **Enable & start** / **Not now**. The answer is remembered for the whole INSTANCE (a flag in data/plugins.json that broadcasts), so a second tab or another device is never asked again. Enabling continues the action you were in the middle of: the serve boots lazily and the pending open/fork re-runs once it answers (and if it does not answer, a toast says what state it is in — never an endless spinner). The way back is always visible: ⚙ → Plugins, and a row in the session list that says "Stopped OpenCode conversations are hidden — its background service is off" with an Enable action (shown only once you have actually met OpenCode here, so it never nags). On an instance where OPS forced the service off that row appears WITHOUT the Enable button — it explains the short list, but nothing you could click there would work. A service that is simply off is never reported as an error: only a service that BROKE (parked after crashes, or stopped by the runaway guard) raises the red toast.

### File Management
- File explorer with upload/download/drag-drop, title shows current path
- Multi-select (Ctrl/Cmd+click toggle, Shift+click range, Ctrl+A) with bulk Compress/Copy/Cut/Delete; Delete key works on selection
- Copy/Cut/Paste file clipboard (`app._fileClipboard`, works across explorer windows; cut items dimmed via `.cut-pending`; same-dir paste auto-renames "(copy)"; conflicts confirm-once overwrite); Duplicate. Big/cross-machine pastes show a live progress row (upload machinery: ring + % + bytes + cancel) via the transfer-op mechanism (2.215.0)
- Archives: Compress to Archive (zip/tar.gz/tar/tar.xz, multi-select), archive viewer (double-click .zip/.tar.* → entry list + filter + Extract All; entry click extracts to temp + opens via normal pipeline), Extract Here / Extract to Folder (skip-existing semantics), folder Download as Zip (streamed)
- Background right-click menu (Paste/New File/New Folder/Select All/Refresh/Copy Path/Properties); Properties dialog (du recursive size, permissions); icon view has the same context menu as list view
- View menu (single dropdown): view mode (list/icon), options (hidden files, mixed sort, bookmarks panel, preview panel), group by (none/type/modified/size), column visibility
- Resizable columns: drag column header borders, absolute widths (Windows Explorer behavior), persist in localStorage. Right-click header for column visibility + auto-fit.
- Preview panel: toggle via View menu, auto-detects layout (horizontal when wide, vertical when tall), supports all file types (text, images, PDF, video, audio, HTML as iframe)
- Path bar: autocomplete (Tab/Enter), submit file path to open it directly in viewer
- Drag file from explorer to terminal → auto-types shell-escaped absolute path
- View modes: list (with size/modified columns, sortable) and icon grid
- Large folder pagination: first 100 items + "Load more" button
- File type registry (`file-types.js`): single source of truth for extension→viewer mapping. `hasDedicatedViewer()` prevents binary files with viewers from falling to hex. Adding a file type = one line in registry.
- File viewers: PDF, images (zoom + drag-to-pan), video, audio, hex. `FileViewer.renderInto()` shared by viewer windows and preview panel.
- Reload from disk (2.341.0, owner report — html rewritten on disk was unreachable without reopening): CodeEditor gets a ⟳ toolbar button + a freshness watch (`_baselineMtime`/`_startFreshnessWatch`/`reloadFromDisk` in code-editor.js) — on-disk mtime baselined at load AND save (self-writes must re-baseline or the watch flags them as foreign), polled every 15s while visible for LOCAL files only (remote hosts are ssh-per-op: tab-refocus check + the explicit button, never a poll); clean editor auto-reloads (scroll/cursor preserved, `_renderPreviewNow()` refreshes a visible preview — that method is the extracted single preview renderer shared with the Preview toggle), dirty editor shows a "⚠ File changed on disk" chip and every reload over unsaved edits goes through showConfirmDialog — edits are NEVER silently discarded (`opts.auto` returns early when dirty). The CM dispatch is guarded by `this._reloading` in the updateListener so a reload doesn't mark the doc modified. Viewer windows get a floating `.viewer-reload-btn` (FileViewer.open) that re-runs renderInto with `container._bustTs` appended as `&_r=` to all five /api/file/raw URL constructions — /api/file/raw streams without cache headers, so a same-URL img/video/pdf can re-serve stale from the browser memory cache; the bust param is the load-bearing part, do not "clean it up".
- DOCX: client-side visual rendering via `docx-preview` (headers, footers, tables, images, styles). Text selectable.
- XLSX: sheet tabs at bottom (like Excel), click to switch. 5000 row limit. Text selectable.
- PPTX: slide thumbnail sidebar (high-res render scaled via CSS transform, resizable sidebar with drag handle) + main slide view (fit-to-container 16:9). Keyboard navigation (arrows). Responsive resize via ResizeObserver. Text selectable.
- CSV/TSV: virtual scroll viewer — only renders visible rows (~30-50), pages of 200 rows fetched on demand from streaming `GET /api/file/csv` endpoint. Handles arbitrarily large files.
- HTML files: open in CodeEditor with Preview toggle (sandboxed iframe), same as markdown
- Code editor: CodeMirror 6, follows global theme, auto-format via Prettier (Shift+Alt+F) for JS/TS/JSON/HTML/CSS/MD/YAML/GraphQL + server-side ruff/black/shfmt/gofmt/rustfmt for Python/Shell/Go/Rust. Language selector drives Preview button visibility.
- Upload: Chrome-style popover menu (Upload Files / Upload Folder / active uploads with spinner / upload history). Mac Finder-style inline progress bars in file list. Ring progress on upload button. Upload history persisted via SyncStore and broadcast across clients. Folder upload preserves directory structure. Chinese/Unicode filenames preserved via `fileNames` JSON field.
- Large file warnings (>1MB), binary auto-detection
- CWD autocomplete with `~` support
- Clipboard image paste (Ctrl+V → upload to server → xclip/osascript sets clipboard → Ctrl+V to PTY)
- Folder right-click: "Copy Path", "Sessions ▸" submenu with "+ New session" and all sessions at that path; "Add to group ▸" submenu to link folder to a session group
- File right-click: "Copy Path", Open, Edit, Open as Hex, Download, Rename, Delete
- Drag folder from file explorer to sidebar group header → links folder to group
- All windows (file explorer, viewers, editors, browser) persist and restore on page refresh

### Agent browser v2 — P0, "零干扰" only (2026-09-13, docs/design-agent-browser-v2.zh.md §3.2)

**What ships, honestly: the half of (1.b) that stops agents interfering with each
other, and nothing else.** There is no registry, no keeper, no live view, no pin
UI and no `vibespace-browser` CLI — those are P1 and later. An agent still runs
the `agent-browser` CLI out of its own shell exactly as before; what changed is
that its session was spawned with **four environment variables**, so that CLI
call lands in a browser nobody else can reach.

Before this, `git grep agent-browser` over the tracked tree returned exactly one
hit and it was a comment. Every agent's browsing went into the ONE profile named
by `~/.agent-browser/config.json`, in that profile's DEFAULT session: two agents
took turns stealing each other's active tab, and `close --all` — the command a
tidying agent reaches for first — closed everybody's browser.

**The four variables** (`src/browser-profiles.js` composes them, `src/server/browser-env.js`
resolves them, `src/ws-create.js` pushes them into the ONE spawn composition so
local and remote both get them):

| Variable | What it isolates |
|---|---|
| `AGENT_BROWSER_SESSION=vs-<browserKey>` | the browser CONTEXT: tabs, cookies, storage, history |
| `AGENT_BROWSER_NAMESPACE=vs-<browserKey>` | the DAEMON SOCKET — so a crash, an idle shutdown or a `close --all` cannot cross |
| `AGENT_BROWSER_IDLE_TIMEOUT_MS` (default 900000) | the only thing that reclaims a browser in P0 (there is no keeper yet) |
| `AGENT_BROWSER_CONFIG` (variant D) | a generated config with **no** `profile` key ⇒ a truly ephemeral user-data-dir |

**The fourth one is a decision, not an omission (§3.2.2 / D12).** The CLI's own
precedence is config file < env < flags, so the `profile` key in the user's
config applies to every call that does not override it. MEASURED on the installed
0.32.0: with SESSION + NAMESPACE set **and nothing else**, the chromium child's
resolved `--user-data-dir` is still the shared `default-profile`. That is variant
B, and it is broken twice over — not ephemeral, and N per-session daemons would
each try to launch chromium against ONE user-data-dir. The shipped ladder is
**(D) generated config → (C) per-session scratch dir under `data/` → (N) the
three names alone, ONLY when the machine's effective config names no profile →
`none`, nothing emitted**, each fallback journalled with its reason.

**A FENCED config never lands on (C) (r4).** Rung C is `AGENT_BROWSER_PROFILE`,
and the CLI refuses `--allowed-domains` beside a profile at the argument check,
so when the generated config could not be written AND the effective config
carried a fence, round 3 landed on C and handed the session a browser that
answered EVERY command `✗ --allowed-domains is not supported with --profile`
where the bare CLI works — while the journal called it a working `D → C`.
Measured with one injected variable (the config writer throwing) on 0.32.0;
reachable only when the config file write fails while a symlink and a mkdir
beside it succeed, which is narrow and said so. `fenced` is now an INPUT of the
PURE ladder (`variantLadder({…, fenced})`), the ORCH half never attempts the C
block under a fence (no symlink, no scratch dir left behind), and the journal
says `C → N` with the fence as its reason (`fencedRungReason`, one spelling) —
a fenced config cannot name a profile (the CLI refuses that combination whole),
so a fenced descent lands on N by construction and the fence stays intact.
And because the C rung replaces no config, a later pin there must ask the CLI's
two files as they stand THEN, project file included — so the rung now records
the session's own directory in `<key>.cwd` beside its link at spawn, and
`repointPin`'s C branch reads it back (round 3 asked the user file alone; a
missing record refuses the pin BY NAME rather than checking half the fence).
test-browser-profiles ⑰ (two patched-copy pre-fix controls) +
test-browser-resources §ⓖ (the binary: the product's N rung browses, round 3's
C rung is refused).

**THE DESIGN'S (A) AND (B) ARE BOTH NAMED REJECTS, MEASURED (r3).** §3.2.2's
table says (A) "SESSION only" has no directory conflict because one daemon owns
the directory. On 0.32.0 it does: with ONE namespace and two `--session` names
against a config naming a `profile`, the second session's chromium dies on
`Failed to create <profile>/SingletonLock: File exists` exactly like (B) —
every `--session` launches its own chromium, so what collides is two of them on
ONE user-data-dir, however many daemons there are. Round 2 shipped that shape
(three names, config profile in force) as its floor and called it "(A)"; the
verifier measured the second concurrent browser failing to launch where today
both start. The floor is now decided by the same fact the collision depends on:
**(N)** — the names alone — is reachable only when the effective config names
no profile (then each daemon gets the CLI's own ephemeral
`/tmp/agent-browser-chrome-<uuid>`, measured), and when it does name one the
floor is **`none`**: nothing is emitted, the session keeps today's shared
browser, and the journal names the profile that decided it. A stolen tab is the
smaller harm than a browser that cannot start. (`browser-profiles.REJECTED_VARIANTS`
carries both measurements; the design's table row is NOT edited here — it is the
owner's document — the contradiction is recorded in this manual.)

**THE GENERATED CONFIG KEEPS YOUR OWN RESTRICTIONS (r2).** That file REPLACES
`~/.agent-browser/config.json` rather than merging with it, so round 1 carried an
ENUMERATED list of seven keys across — and silently deleted the user's browsing
FENCE (`allowedDomains`) plus the whole confirmation/action-policy family from
every local session. Measured end to end on 0.32.0: through your own config a
navigation is refused (`✗ Domain '…' is not in the allowed domains list`);
through the config the product generated from that same file it succeeded. It is
now a **DENY**, and the deny set is the CLI's own: the binary refuses
`--allowed-domains` beside exactly the flags that mean "this is not a fresh,
isolated, controllable context" — `profile`, `restore`, `sessionName`, `state`,
`autoConnect`, `cdp` — which is precisely the property P0 sells, so those six are
dropped and **everything else in your config is carried across unchanged**,
including keys nobody enumerated. Each drop gets ONE journal line naming that
key's own reason, because a restriction removed by OMISSION is exactly how the
fence vanished with nothing in the journal.

**AND "YOUR CONFIG" IS TWO FILES (r3).** The CLI reads `~/.agent-browser/config.json`
and then `./agent-browser.json` in the directory a command runs from, at HIGHER
priority — and `AGENT_BROWSER_CONFIG` replaces BOTH. Round 2 layered only the
first, so a project-level fence (or `actionPolicy`, `confirmActions`,
`initScripts`…) was still deleted from every local session, and with
`dropped: []` there was nothing in the journal: finding ① unfixed for the second
file. MEASURED on 0.32.0 with a local http server: at the project cwd the bare
CLI answers `✗ Domain '127.0.0.1' is not in the allowed domains list`, round 2's
generated config answered `✓`; the CLI does NOT walk up (from a subdirectory the
fence is absent), and its merge rule is a shallow per-key override with
`extensions` concatenated user-first (`--load-extension=<user>,<project>`, and
its own `--help` says so). `effectiveConfig(cwd)` now layers the file from the
SESSION's own directory with exactly that rule (`layerProjectConfig`, PURE),
journals ONE line naming the file and its keys, and the drop line says what it
carried FROM (both files). The one boundary is stated rather than hidden, in the
journal and in the agent manual: the CLI reads that file per INVOCATION
directory, the generated config applies the session directory's file for the
whole session — an `agent-browser.json` in a directory the agent `cd`s into does
not apply. **And the pin edits the session's own FILE rather than rebuilding
from the user file**: round 2's `repointPin` regenerated from
`~/.agent-browser/config.json`, which would have re-derived the fence WITHOUT
the project file (a pin route has no reason to know the cwd) — silently
un-fencing on pin, the same defect through a second door. It now toggles exactly
`profile` on the file on disk and asks that file for the fence. An unparseable
project file is NAMED in the journal (the CLI would refuse it too), never
silently skipped.

**A FENCE AND A PIN ARE MUTUALLY EXCLUSIVE, and we refuse rather than drop one
(§1.5 / §6.3).** With the fence now carried, pinning a session would add
`profile` back and the CLI would refuse EVERY command (measured: `open` and
`get title` alike). So a pin asked for over a fenced config is REFUSED with the
reason and the way out — fence the persistent profile at its proxy instead —
rather than being accepted and then silently dropped. An empty `allowedDomains`
is measured not to be a fence and never blocks a pin.

**A REMOTE session is decided ON THE HOST, BY THE HOST — rung (H) (r3).** (D)
and (C) both name a LOCAL object — a config file we validated by reading back,
or a directory we own and sweep — so round 2 sent a remote session the three
names alone and claimed "nothing regressed". MEASURED on 0.32.0 with a host
config naming a `profile`: session 1 `✓`, session 2 `✗ Chrome exited early …
Failed to create <profile>/SingletonLock: File exists` — where today (no
VibeSpace env) both launch into one shared daemon. And the directory rung
cannot be sent unconditionally either: on a FENCED host an `AGENT_BROWSER_PROFILE`
makes every command answer `--allowed-domains is not supported with --profile`
(measured), and a fenced host is exactly one that names no profile (the CLI
forbids both in one config). The one fact the decision needs — does THAT
machine's effective config name a profile — lives on that machine, so the host
answers it: `remoteBrowserPrelude` (PURE) is a POSIX shell fragment riding the
ONE remote composition (`buildRemoteExec`'s named `browser` slot, after its `cd`
so `./agent-browser.json` is the session's directory, at all five spawn sites —
a wiring pin counts them). It asks whether the host's effective config names a
profile and exports `AGENT_BROWSER_PROFILE=$HOME/.vibespace/browser-profiles/vs-<browserKey>`
only then (rung C on that host: a directory the CLI creates lazily, measured,
and that the same prelude sweeps on every later spawn once older than 7 days
and holding no live browser); otherwise nothing (rung N there, ephemeral per
daemon already). **"Names a profile" is ONE question in two spellings, driven
over ONE table (r4).** Round 3 asked it with `grep -qs '"profile":'` over both
files — a LOOSER spelling than the PURE `configNamesProfile`: it counted
`"profile": null` and `""` as naming one (a host config `{…, allowedDomains,
profile: null}` works bare and answered `--allowed-domains is not supported
with --profile` under the exported variable, measured), counted a key nested
inside another value, and could not see a project file's `null` overriding the
user file's string. The fragment now carries a one-line POSIX awk
(`TOP_LEVEL_PROFILE_AWK`) that walks the JSON with a depth counter and answers
`yes`/`no`/`absent` for the TOP-LEVEL key, asks the project file first with a
final verdict there (the CLI's per-key precedence, the rule `layerProjectConfig`
spells on this side), and the gate drives the awk and the predicate over the
same twelve rows under every shell AND every awk on the box (mawk, busybox)
with round 3's grep spliced back in as the control. Liveness is `[ -L SingletonLock ]`, not `-e`: chromium's lock
is a DANGLING symlink to `<host>-<pid>` while the browser runs (measured), so
`-e` answers "absent" for a live profile and would sweep it out from under the
browser. The fragment is single-quoted throughout and expands no glob (the
B-3185 zsh lesson — the keeper path runs under the remote user's login shell),
driven under sh/bash/zsh/dash/busybox in the fast gate and against real
browsers in the heavy one, with round 2's line (no fragment) as the control
that reproduces the collision. Both of the host's config files stay in force
there (no generated config), so finding ①'s project-file drop does not exist on
a remote. The server records `H` because from here the rung is genuinely
unknown, and journals that once.

**The identity is the CONVERSATION, not the webui session id (§3.2.1).**
`ws-create` mints `sess-<seq>-<ms>` inside the same `create` case that handles
resume, so one conversation owns many webui keys. `browserKey` (`bk-<8 hex>`) is
minted ONCE, recorded in `session-meta`, restored by all three boot-restore
paths, and recovered on resume from **`data/browser-env/bindings.json`**
(`src/server/browser-bindings.js`, r5) first, then through the join this repo
already has (`reading-repair._sessionKeyMap`). **The binding store exists
because the join alone never served the product's own Terminate → Resume**:
the kill path and the pty-exit path UNLINK the session-meta file, so rounds 1–4
recovered the key only while the previous webui session was still alive —
every resume of a STOPPED conversation minted a new key, warned
`resume-unknown`, and orphaned the previous namespace's daemon + chromium until
the idle timeout (measured on a real worktree server: `bk-c4de4a0c` → ws kill
→ 0 meta files name the conversation → resume → `bk-fa78e54c`). The binding
is written at session-stdout's ONE meta choke point (so an id learned late
through an init frame or a lock file is bound the moment the record carries
both facts), never deleted by a kill, bounded at 4096 newest conversations,
and measured end to end: kill → resume keeps `vs-<key>` in the spawned
process's own `environ`, with exactly one `resume-unknown` line for the whole
life of the conversation (the first, never-seen resume — the positive control
that the line is observable). A **fork mints a NEW key** (D15: a fork is a
new conversation and must not inherit another one's cookies or pinned tab) —
**and never rewrites its parent's binding (r6)**: a claude/codex fork resumes
the PARENT's id and learns its own from the harness later, so its first meta
write names the parent beside the fork's key, and r5's choke-point hook bound
the parent to the fork's browser (measured: the parent's next resume spawned
with the fork's `AGENT_BROWSER_SESSION`, its own daemon orphaned). The record
now states `forkSourceId` and `browser-bindings.bindableIdOf` binds nothing
while the record names the very conversation it was forked from; the store
itself refuses to move a bound conversation (journalled, counted). **And a key
is bound to the conversation it was DECIDED for (r7)**: a resume whose harness
announces a DIFFERENT conversation id (claude's implicit fork on a locked
conversation; a codex/ACP resume that re-mints) is adopted by the consumer
with no fork flag, so the origin write states `browserKeyFor` (a resume's
resumeId; a fork never; a new session none), the choke point refuses any
other id and journals the implicit fork once per session (the running process
keeps the browser it spawned with), the store refuses to bind a new
conversation to a key another one holds, and the announced conversation mints
its own key on its next resume. A resume that cannot find its own previous
key says `resume-unknown` out loud rather than silently minting.

**The pin indirection exists now even though the pin UI does not (§3.2.5).** A
spawned shell's environment is immutable, so a mid-task pin can never change a
variable — it changes what the variable POINTS AT: the generated config is
rewritten atomically (variant D) or the symlink is re-pointed through the pool's
own `repointPoolSymlink` (variant C). **When it takes effect is MEASURED, and it
is the opposite of what rounds 1–3 inherited from the pool (r4).** Those rounds
said "it takes effect on the NEXT browser launch, never on a browser already
running" in three source comments, this manual and the route's own return
value; on 0.32.0, driven through the shipped resolver, the pin leaves the
running chromium untouched (same pid, same ephemeral dir) until the **next
command**, and that command **relaunches chromium onto the pinned directory and
discards the live page** — `open <probe>` ⇒ chromium 1611523; `repointPin` ⇒
unchanged; `get url` ⇒ `about:blank`, chromium 1611712 on the pinned dir,
`get title` empty; the no-pin control keeps page and pid. `repointPin` now
answers `appliesFrom: "next command (the CLI relaunches the browser on the new
directory; pages open in the running browser are lost)"` (`PIN_APPLIES_FROM`,
one spelling for both rungs), and P1's pin route owes the consequence: `close`
the session's browser first, or refuse while one is live — "is one live" is a
fact it can look up. Pinned by test-browser-resources §ⓗ against the binary
(pid, directory and page, with the no-pin control).

**The version floor is checked, never assumed (D1).** `0.37.1` is declared in
`package.json` under `agentTools` — deliberately NOT a dependency, because npm
puts `node_modules/.bin` on PATH for `npm run` and a local copy would be the
binary the GATE measures while every agent kept using the global one. The
installed version is probed once at boot (cached, including the negative answer —
a `spawn` costs the parent time proportional to its own RSS; the probe strips
every ambient `AGENT_BROWSER_*` first, because one of them makes the CLI exit 1
on `--version` and turns a perfectly readable version into an honest-sounding
"we could not tell") and a binary below
the floor gets ONE honest server notice: *"Your agent-browser is too old for
shared profiles … Per-session isolation is on and working"*. Absent ⇒ silent (do
not nag about a tool nobody uses); unreadable version ⇒ fails CLOSED on the
capability and says so in its own words. **ONE means once DELIVERED (r5)**: the
boot probe fires 3 s after the ws handler registers — into an EMPTY client set
on the systemd / `update.sh` restart shape — and `serverNotice` deliberately
burns its key only when a client received it, so round 4's "latch before
asking" told a headless restart's user nothing for the life of the process
(measured: a client at Ready+6.3 s received zero `server-notice` frames while
the journal carried the line). `serverNotice` now returns the delivery count,
the resolver latches on it, ws-handler re-asks on every client connection
(free once latched — no probe), and a 6 h re-probe follows the other health
probes; measured on the real server, the first client to connect after a
headless boot receives the sentence and the second does not. The channel is
the server notice (toast + notification history) — not the "For you" inbox;
nothing durable is filed, because the sentence is re-asked until somebody
hears it and re-said once per running server.

**The tools intro never lies about the rung (r5).** The one budgeted Browsing
line used to tell EVERY session "THIS session already has its own browser …
`close --all` closes only yours" unconditionally — including a session on the
shared browser (`browser.isolateSessions=false`, rung `none`, a resolver that
threw, a session predating the feature): the exact incident P0 exists to stop.
`sessionToolsIntro` now takes the session's recorded `_browserVariant` at both
delivery sites; `browser-profiles.isolatedVariant` (ONE table: D/C/N/H) picks
the isolated sentence, and everything else gets the manual's own words for the
shared browser ("Do NOT run `agent-browser close --all`: it closes everyone's
browser"). A caller that passes no facts gets the shared sentence — a forgotten
session cannot claim isolation.

**Settings → Browser**: `browser.isolateSessions` (default ON — OFF restores
exactly today's shared behaviour for sessions started after the change),
`browser.idleTimeoutMs`, and `browser.headed` — an ENUM, not a boolean, because
its honest default is "whatever your own config says" and a checkbox would
render that as "off" and make the first click a decision nobody made. An ambient `AGENT_BROWSER_*` in the
server's own environment is DROPPED by `agentEnv()`: a session's browser comes
from VibeSpace or from that machine's config file, never from the shell that
launched the server.

**Measured on this box (2026-09-13, agent-browser 0.32.0, AMD Ryzen AI MAX+ 395,
32 cores / 122.7 GB, kernel 6.17, headless, variant D, example.com loaded)** —
§12.10 makes this a P0 deliverable and D13's ceiling a proposal until it exists:

| k concurrent browsers | OS processes | RSS | PSS | open fds | inotify instances (watches) |
|---|---|---|---|---|---|
| 1 | 16 | 1.42 GB | 248–249 MB | 600–601 | 0 (0) |
| 4 | 78 | 7.12 GB | 1.20 GB | ~3,034 | 0 (0) |
| 12 | 214 | 19.0 GB | 3.09 GB | ~8,398 | 0 (0) |

≈18.0 processes and ≈1.6 GB RSS (≈258 MB PSS) per additional browser, stable
across runs (two consecutive runs agree to within 0.1 %). Re-measured in r3 on
2026-09-14 with the same environment (nothing in r3 changes the local D rung):
two runs read k=1 16 / 1.40 GB / 245 MB PSS, k=4 78 / 7.09 GB / 1.19 GB,
k=12 **214 / 19.1 GB / 3.10 GB** and **229 / 20.9 GB / 3.76 GB** — the k=12 row
wobbles by ~7 % run to run (chromium's utility-process count is not fixed), so
the per-browser cost is stated as 18–19.4 processes and 1.6–1.8 GB RSS, not as
one number. Re-measured again in r4 on 2026-09-14 (same box, same environment —
nothing in r4 changes the local D rung on a short home): k=1 **16 / 1.41 GB /
306 MB PSS / 602 fds**, k=4 **78 / 7.09 GB / 1.32 GB / 3,042**, k=12 **214 /
19.0 GB / 3.18 GB / 8,417**, all twelve opened in 6 s; the inotify column read
2 / 10 / 26 instances (7 / 36 / 100 watches) this time, the same
order-of-magnitude the paragraph below describes. Re-measured once more in
r5 (same box, same environment; r5 changes the notice latch, the key binding
and the intro line — nothing on the D rung), through the whole suite over the
r5 server code: k=1 **16 / 1.39 GB / 289 MB PSS / 601 fds**, k=4 **78 /
7.10 GB / 1.31 GB / 3,039**, k=12 **214 / 19.0 GB / 3.18 GB / 8,423**, inotify
2 / 10 / 26 instances (7 / 36 / 100 watches), all twelve opened in 7 s —
byte-for-byte the r4 process counts, memory within 0.5 %. **These rows moved in
r2 and the reason is the measurement, not the browsers**: ownership used to be
decided by a process CMDLINE, and an agent-browser DAEMON's cmdline is the bare
binary path with no arguments — so the per-session daemon and its crashpad
handlers were never counted at all (round 1 read 13 / 52 / 163 procs and
1.38 / 5.53 / 17.2 GB). Counting the whole browser is what the envelope is for;
the per-browser cost is real and was under-reported by ~25 %.

**The inotify column is sampling
noise, not a measurement of the browsers**: chromium arms those watches lazily,
so a sample taken right after the last `open` catches a different number each
time (2/8/12 and 2/3/3 on two round-1 runs; a flat 0 on both r2 runs, which
opened all twelve browsers in 7 s) — what is solid is the ORDER OF MAGNITUDE,
zero to low tens against a per-uid limit of 128. It is REPORTED, never asserted
as a bound.

Against the design's prediction (§1.2: 6 processes and 2 inotify instances each,
measured on four IDLE HEADLESS leftovers from another suite): the real shape
under P0's flags on a loaded page is **roughly 2.7x the processes** (6 predicted against
16 for the first browser and 18 for each one after it, daemon included), the same
per-browser memory, and inotify pressure far below what was feared — so on this
box **memory, not inotify, is what bites first**. D13's concurrency ceiling still
has no enforcer: P0 has no keeper, so the idle timeout is the only thing that
reclaims a browser, and that gap is stated rather than implied (design I4).

**THE FIFTH VARIABLE: the CLI's socket path, a regression round 3 measured and
r4 closes.** The daemon socket is `<root>/namespaces/<ns>/run/<session>.sock`
and the CLI refuses any path over 103 bytes (`✗ Session name '…' is too long.
Socket path would be N bytes (max 103). Use a shorter session name or set
AGENT_BROWSER_SOCKET_DIR to a shorter path.`). The root is — measured through
`session info --json`'s own `socketDir`, one variable per arm —
`AGENT_BROWSER_SOCKET_DIR` when set, else `$XDG_RUNTIME_DIR/agent-browser` when
THAT is set, else `$HOME/.agent-browser`. With our `vs-bk-<8 hex>` on both names
the tail is 50 bytes, so under `$HOME` the path is `|HOME| + 65`: **a 38-char
home fits (103) and a 39-char one does not (104)** — `tab list` is refused
before anything launches at 39, while the bare CLI's `default` name still works
there, i.e. every agent-browser command in a VibeSpace session failed on such a
host where it worked before P0. Round 3 recorded this as an owner decision and
left it to the manual; r4 sets the CLI's own remedy at the knob the CLI provides
for exactly this, **without touching the design's name shape** (`vs-<browserKey>`
stays; shortening the NAME is still the owner's call): `socketDirDecision`
(PURE) says whether the root the CLI would use — from the HOME and the
`XDG_RUNTIME_DIR` the session's environment carries (`agentEnv()` passes the
server's through) — is over the limit, and only then the ORCH half creates
`/tmp/vs-ab-<uid>` (the LITERAL `/tmp`, like the heavy gate's machine lock — a
short root is the point and `TMPDIR` may be the long path being escaped),
**verifies it is a real directory this uid owns and is 0700** (a fixed name in a
shared tmp root can be pre-created by anyone; a planted symlink or a file means
NO variable and a journal line, never a socket in somebody else's directory),
and emits `AGENT_BROWSER_SOCKET_DIR` as a fifth pair with ONE journal line per
root. A REMOTE session gets the same rule in shell inside the host-decided
fragment, from the host's own `$HOME`, bytes counted with `wc -c` like the
kernel, a pre-set variable left alone, `-O` for ownership — driven under
sh/bash/zsh/dash/busybox. Measured end to end on 0.32.0 (test-browser-resources
§ⓘ): HOME 38 ⇒ four pairs, `tab list` launches; HOME 39 ⇒ five pairs, `tab list`
launches and the live daemon's `socketDir` sits under our directory; the same
pairs minus the fifth ⇒ `Socket path would be 104 bytes (max 103)`; the bare
CLI ⇒ launches. The fast tier keeps a launch-free pair (`session info --json`
resolves the root to our directory; the refusal is an argument check) and makes
its directory under its OWN scratch base, never the production per-uid name.
(The heavy suite's short tag — `'r' + pid.toString(36)` — is still needed for
its TAGGED arms; the 38/39 arms run untagged names, because the tag would
change the very byte count under test.)

**The generated config is a SECRET-BEARING file (r3).** It is a verbatim copy of
the user's own config, which legitimately holds a credentialed `proxy` URL and
plugin credentials, and round 2 wrote it with the process umask — measured 0664
in a 0775 directory from a 0600 source — while the token-bearing files beside it
in ws-create use `{mode: 0o600}`. Every file `browser-env.js` writes is now 0600
and every directory it makes is 0700 (`FILE_MODE`/`DIR_MODE`; an already-existing
directory is chmod'ed, since `mkdirSync`'s mode applies only to what it creates;
the variant-C scratch dir is a chromium user-data-dir and gets 0700 too). The
gate's control is umask-independent: the retired bare `writeFileSync` yields
`0666 & ~umask`, ours yields 0600 whatever the umask.

**Gates**: `test-browser-profiles` (fast, 281 — the environment half, the
RESOLVED directory rather than the two env strings, the ladder's journalled
reasons incl. the r3 `none` floor with its no-profile control, the key ladder,
the floor's outcomes over a fake binary, the pin's no-restart property read back
off the FILE, §⑬ the project-file layering with TWO patched-copy pre-fix
controls (round 2's spawn and round 2's pin), §⑭ the host-decided remote
fragment driven under every shell on the box plus its sweep with the `-e`
control that deletes a live profile, and §⑯ the modes) and
`test-browser-resources` (heavy — two real browsers that stop seeing each other
WITH a pre-fix control that reproduces the takeover, the k=1/4/12 envelope, an
end-to-end leg that boots an isolated worktree server, creates two real sessions
and reads the four variables off `/proc/<pid>/environ`, §ⓔ the project fence
end to end — today's arm refused, the product's arm refused, round 2's resolver
`✓` — and §ⓕ the remote composition on a profile-naming host: two sessions both
launch on host-chosen per-key dirs, round 2's line reproduces the SingletonLock
collision, today's shape and a no-profile host are the bounds).

### Agent browser v2 — P1 first half: named profiles, the lease, the keeper (2026-09-16, docs/design-agent-browser-v2.md §3.3–§3.5, §5.1, §8)

A **profile** is a persistent browser identity (a record in `data/browser-profiles.json` + a 0700 user-data-dir under `~/.agent-browser/vs-bp-<id>`); at most ONE `agent-browser` daemon runs per profile; a **lease** is the tab a CONVERSATION (`browserKey`, never the webui id) holds in it. Shipped surfaces: `vibespace-browser` (`profiles` / `new` / `use` / `detach` / `status` / `pin` / `-- <agent-browser args>`), `/api/browser/*`, and migration step 2 (`~/.agent-browser/config.json`'s `profile` dir — else `default-profile` — becomes the "Shared (legacy)" record, `sharing: instance`, nothing moved or deleted). Invariants, one sentence each:

- One lease per (profile, conversation): a resume re-carries it in place, never a second one; `input` has exactly one holder (`agent` until P3's takeover).
- `use` execs a subshell with the env set and NEVER prints a CDP url; only the wrapper form (`--`) asks the server for it, and `-- close --all` is refused while another session is attached (the wrapper form also supplies `--pin-tab` at/above the 0.37.1 floor).
- The keeper owns the idle clock: a profile browser is launched with the CLI's timeout OFF and stopped once its LAST lease has been gone for `browser.idleTimeoutMs`.
- Boot order is drop → judge → tick: every persisted lease whose key no live session carries is dropped BEFORE any browser is kept alive, then each recorded daemon is adopted by pid+starttime (an unproven pid is recorded ended and never signalled), then the tick may start.
- The ceiling (`src/keeper-limits.js` `CONCURRENT_CAP`) refuses a start naming the holders and who leases them; the resource sample reads the daemon's tree (ΣPss) with per-provider thresholds and, since 2026-09-25 (the owner's ruling), only REPORTS: the live row, a notice when a crossing begins (r2 hysteresis: re-armed only by 3 clear samples under 90 % of the line, at most one per session per hour, re-sent under the same key when no client received it), telemetry — never a stop or a park (src/runaway-guard.js).
- The pin ladder is explicit > conversation (a fork COPIES its parent's) > Task-Group default > instance default (`browser.defaultProfile`) > none, and `task-group` is the fifth `SPAWN_ORIGINS` value mirrored in the client.
- Ownership is cooperative and by conversation: a session-owned profile admits its conversation (children included), a task-owned one the sessions bound to that Task Group, an instance/legacy one anyone; `sharing:'instance'` for NEW profiles stays refused until §6.5's proxy (D6).
- Removal drops the record and KEEPS the directory (a cookie jar is somebody's login — deletion is a human act).

Gate: test-browser-pin (fast, 168). Not in this half: the live view (P2) and §3.8 layer ③'s chip.

### Agent browser v2 — P1 second half: the attachment set, handles, anti-default-blindness ① + ②, the pin's four surfaces (2026-09-16, design §3.7 / §3.8 / §3.2.5)

A session holds an attachment SET (its leases, each with a short HANDLE = the alias or the label's slug) of which at most ONE is the default (the pin when among them, else the only member, else none). Shipped surfaces:

- `vibespace-browser [--profile <handle>] -- <args>` / `VIBESPACE_BROWSER=<handle>`: with one attachment a bare command lands on it; with two or more a bare command is REFUSED `profile_required` listing every handle and the default (the "you seem to be a sub-agent" clause rides only when the server sees a sidechain open, and is never the reason); a filesystem PATH is refused `profile_path_refused` with the `new <label> --adopt <dir>` remedy; a handle not attached is `not_attached` (never silently attached). A direct `agent-browser` call lands on the DEFAULT (its dir is the only one the session's env names) — layer ①'s honest boundary.
- Anti-default-blindness ①: when the set's fingerprint moved since the session was last told (a USER's pin/attach/detach from the UI), the NEXT CLI command is refused ONCE with typed `profile_changed` (was → now) and did not run; the agent's own `use`/`detach`/`pin` tells it, so its next command is never refused. ②: the same user act queues a typed zero-billed `browser-pin`/`browser-profile` notice that rides the user's next message (session-status's slot is now a QUEUE; the injection site drains — a status override and a profile change both reach the same prompt), and the session-start context lists the current set.
- `new-child` mints `bk-<parent>.<n>` (a sub-agent's OWN ephemeral browser, D23; rung C unsets the inherited profile symlink), reaped with the parent; `data/browser-audit.jsonl` records `{at, sessionId, browserKey, profileId, verb, ok}` per wrapped command — the verb only.
- The pin's four surfaces = ONE command `session.pinBrowser`: the session-card right-click row (beside Switch billing), Session Properties' Browser section (the pin, its origin, sessions attached, the picker), the New Session dialog row (the group's default > instance default > none, sent with `spawnOriginHint.browserProfile` so the server downgrades its `chosen`), and task-detail's "Default browser profile" (the group's `browserProfileId`, the ladder's third rung, wired at create). The live-view title (P2) will call the same picker. "New persistent profile from this session's browser…" ADOPTS on rung C (the scratch dir is moved, the login kept) and on every other rung says plainly it creates an EMPTY profile and reopens the browser.
- A mid-task pin needs NO restart: the per-session config is re-pointed (`repointPin`), the live session is stamped, the pin is persisted to its meta, the notice is queued and the next CLI command is refused once.

Gates: test-browser-handles (fast, 101) + test-profile-blindness (fast, 33). Built in P2 (below): §3.8 layer ③'s status-bar chip (test-profile-blindness-chip, heavy — the design's "heavy half" as its own suite so the §43 census keeps one tier per script) and the live view's switcher strip. Not built: the billed `announcePin` producer (needs the §4.3.1 ladder — `'browser-pin'` joins `SPEND_REASONS` with it) and the billed "wake it now" nudge (D26: `'browser-profile-notice'` behind an OFF-by-default setting) — the chip's nudge is the zero-spend queue only.

### Agent browser v2 — P2: the live view (2026-09-16, design §4.2 / §4.4 / §3.7)

A session's browser can be WATCHED from the workspace: the card menu's "Live
browser view", Session Properties' Live view button, the status-bar Browser
chip and `app.openBrowserLive({sessionId, profileId?})` all open ONE window
type `browser-live` (openSpec-replayed across refresh, desktops and clients,
always back in Watch mode). The window bridges `GET /api/browser/stream` —
cookie-authed, server-side to the loopback stream server agent-browser 0.32+
runs per session (`stream status --json` gives the port; measured shapes in
`scripts/fixtures/browser-stream/session-0.32.0.json`). Shipped behaviour and
its do-not-regress notes: N windows on one target are N VIEWERS on ONE upstream
connection (a late viewer is replayed the last status/tabs/url and frame; the
count is shown in the bar); frames are latest-wins and each viewer is served at
its own `maxFps` (the max goes upstream; a hidden tab asks for 2 fps); a slow
viewer has frames dropped past the 1 MiB low-water mark and the upstream is
paused past 8 MiB on any viewer, resumed under 1 MiB on every viewer — the VNC
bridge's numbers; the picture is an `<img>` fed through `.src` at net zoom 1
and `pointerAt` is the one viewport→device conversion (DPI-correct at every
`--ui-scale`, null outside the letterboxed picture); the URL line, the tabs pane
and the console pane come from the stream's own records, the recording
indicator (P5: the profile's live screencast, from the digest) — P2 is WATCH mode — the badge says
"Agent is driving", Take over is drawn disabled with its reason, and any input
is refused by the bridge with the typed `watch-mode` code (P3 flips the
holder); a session with two or more attachments gets the SWITCHER STRIP inside
the same window (one tab per attachment with an activity light from the
stream's command/result mirrors; clicking reconnects the window to that pane;
the title names the pane you are looking at and opens the profile picker); a
session with no attachment shows its own ephemeral browser (asked under the
pairs it was spawned with); a remote session, an unknown session, a session
with no browser key or no browser of its own, an unknown handle and a browser
that will not launch each answer a typed status the window renders with a
Reconnect button — never a socket that just dies. The session's death closes
its live views with a reason. Gate: test-browser-live (heavy, 104).

**The Browser chip (§3.8 layer ③, "I pinned it, now what?").** The chat status
bar shows the profile the agent LAST ACTUALLY USED beside the PINNED default:
every successful `vibespace-browser` command (`/api/agent/browser/resolve`, and
`use`) stamps `browserProfileActive` on the session ('' = the ephemeral browser;
null = the agent has issued no browser command yet), persisted to its meta so a
restart keeps it, and re-published in `active-sessions` where it and the pin
(`browserProfileId`) are two scalar `LIVE_SESSION_FACTS` rows with their own
digests (a digest over an object is a constant — the chip would never repaint).
Neutral while they agree (or before any use, naming the pin with "nothing yet"
in the tooltip); AMBER when they differ — a standing condition, no pulse. Click
= both facts + "Remind on next message" (only when they differ: `POST
/api/browser/nudge` queues the same typed `browser profile changed: <was> →
<now> (by user)` notice a pin does, riding the user's next message — zero billed
turns; 409 `nothing-to-remind` otherwise) / "Open live view" / "Change pin…".
Gate: test-profile-blindness-chip (heavy — a MUTATION on a real server: the
agent's own resolve flips the chip without a rebuild, the digest moves once and
not for the same fact again, the notice reaches the next prompt context once).

**The live view's bar, and where to open it (lane I, 2026-09-25 — the owner: "你这些UI都检查过吗？").** The bar never wraps or overlaps in any language or width: the mode badge in short words ("Agent is driving" / "You are driving" / "Another viewer is driving"; the "— agent asked to pause" sentence is its tooltip), ONE toggle (Take over ↔ Hand back), an icon-only bind button (Snap beside / Unbind — its words, which carry the session's name, are its tooltip), the URL (the one flexible item, ≥ 120 px, ellipsised) with its globe hand-off to a web view, the viewer count, the recording chip, the backend chip (profiles only) and Tabs / Console / Actions with their counts. What does not fit folds into a ⋯ menu by priority — Tabs / Console / Actions first, then the backend chip, then bind / viewers / recording, then the URL, the mode badge last (folded, its sentence is the ⋯'s first row and the ⋯ wears its colour); the toggle and Reconnect never fold — and the ⋯ rows carry the live counts and do the items' own acts. A live view bound beside its chat keeps its pane at least as wide as its own bar's minimum ([toggle][⋯], 87–115 px): dragging the divider further stops the divider there (verify r1 — at the clamp the ⋯ used to be clipped out of the bar). The desktop-app strip follows the same rule (the status flexes; the agent / origin / fact chips and Keep running / Stop fold into its ⋯; the window-live form has the same one toggle and short badge). THE WINDOW MENU: a chat (or terminal) window whose conversation has a browser — running now, or used since the session started — offers "Agent browser — live view" on its title-bar / tab / taskbar menu (between Locate in sidebar and Session properties…); it opens the live view BOUND beside that window, or binds / brings forward the one already open (never a second viewer). A bound live pane's menu says Unsplit once (its own Unbind is offered only while it is a free window). The sidebar card, the status-bar Browser chip, Session Properties and the phone nav keep their entries. Gates: test-live-bar-layout (fast), test-browser-live-ui (heavy: every state shot + measured at zh / ja / en × 600 / 900 / 1400 × dark / light).

### Agent browser v2 — P3: takeover and handback (2026-09-16, design §4.3 / §4.3.1)

The live view has §4.3's three modes, each one sentence. **Watch** ("Agent is
driving"): frames flow, input is refused typed `watch-mode`. **Take over**: the
viewer's click asks the bridge and the KEEPER decides (the one owner of the
input side, IN MEMORY — a server restart is a handback by construction and a
reload comes back in Watch); every viewer on that browser gets one `mode`
record (`mine` only for the holder); the holder's pointer/wheel/keys are
forwarded as the stream server's CDP-shaped records built by the PURE
src/browser-stream.js (`pointerAt` stays the one DPI conversion); a second
viewer is refused `held`; and the agent's next `vibespace-browser` command is
refused with the typed `browser_paused` (who, when, what to do — the CLI prints
it and exits 1; a child handle is never paused by its parent's takeover). The
session card grows "Hand back the browser" and the status-bar Browser chip says
"You are driving" while it lasts (`browserInput` = one scalar
LIVE_SESSION_FACTS row). **Hand back** (any viewer, the card, the chip, or
`POST /api/browser/handback`) flips the lease and DELIVERS the announcement —
carrying the current URL — through THE ladder (`deliverToConversation`,
`kind:'notification'`, `spendReason:'browser-handback'`, the sixth declared
SPEND_REASONS entry), so it takes the unattended-spend ceiling like every other
turn nobody typed; a refusal loses nothing (the ladder's stash + the zero-spend
`browser-handback` session-status notice riding the next message). **Idle
handback** (setting `browser.takeoverIdleMs`, default 10 min, 0 = never, floor
30 s) and the holder's window closing (`viewer-left`) flip the lease, update
the live view and the card, file ONE "For you" item (idle only) and deliver
NOTHING — `browser.announceIdleHandback` (default OFF) routes them through the
same reason and the same ceiling. Taking over delivers nothing (the typed
refusal tells the agent, free). The **agent cursor** (a labelled cursor at the
last CDP coordinates the `command` mirror carried, `deviceToViewport` = the
inverse of `pointerToDevice`) is drawn while the agent drives and hidden while
the user drives. A `--confirm-actions` confirmation is a typed `confirmation`
record to every viewer (replayed to a late one), a Confirm/Deny bar with the
daemon's 60 s countdown, one inbox item, and the answer is upstream's own
`confirm <id>` / `deny <id>` under the lease's session (the stream's `confirm`
verb or `POST /api/browser/confirm`) — never a second mechanism. Gate:
test-browser-takeover (fast, 109).

**While you drive (lane J r2, 2026-09-25 — the second naive-user study: text
typed into a takeover vanished or landed in the chat composer).** A takeover
OWNS the keyboard: every key, paste and IME composition goes to the page
whatever has focus in the app; the chat's attach/reconnect focus stands down and
a text box elsewhere that takes focus gives it straight back (a toast says
"Typing goes to the agent's browser while you drive it — press Hand back to type
here"); the bar shows "Typing goes to the browser" and the picture a focus ring.
Only Ctrl+\ (command mode) and Ctrl+Alt+←/→ (desktop switch) stay the app's; Esc
goes to the page; handing back is the button. A paste arrives as TEXT; an IME
composes inside the view and the committed text is sent. The keyboard is
released on the hand back, a dropped socket, or when the view is hidden. Every
click ripples at the page point it reached, the bar echoes "input sent · n"
("not sent — …" when disconnected), and a small marker shows where the page has
your pointer. The picture is TOP-aligned and fills the pane's width (spare room
below it, never bands above and below). When you take over, pending approval
cards for browser page commands aimed at that browser are answered with a deny
naming `browser_paused` and read "Not run — you took over the browser, so this
step went stale. The agent re-plans after you hand back." (one queued while you
drove: the same at the hand back; `status`, a mention, another profile's command
are untouched). Gate: test-browser-takeover ⑦ (fast) + test-browser-live ⑥
(heavy, the real rung).

### Agent browser v2 — P4 first half: provider rows, the egress precondition, the remote `cdp` provider, the `browser-serve` op (2026-09-16, design §7.1–§7.3, §7.2.1)

A provider is a ROW, not an `if` chain (§7.1's two tables in one:
`chromium` / `cloak` / `cdp` / `local-window` / the `cloud:<name>` family, each
with tier, wired, keyScope, canSwitchTo, ownsDir, leaseKind, remote, starts,
headed, binary), and every control that cannot work is DISABLED WITH ITS
REASON before anything is spawned: `provider_unknown`, `provider_unavailable`
(naming why — for `cloak` the §7.2.1 measurement's own refusal),
`provider_needs_local_key` (D34 (a): a key-bearing provider is refused on a
profile whose `host != null`, because that key has no channel to another
machine), `provider_local_only`, and `provider_lacks_capability` per cell.
**The CloakBrowser egress precondition was MEASURED FIRST and recorded** in
the local-oracles shape (`CLOAK_EGRESS_PROOF`: tool, date, version, per-run
INET counts): on this build the record is a REFUSAL by name — `binary_absent`
(no `cloakbrowser`/`cloakserve` on the measuring machine, nothing downloaded,
no vendor host contacted) — and it `blocks: 'cloak.wired'`, a claim
test-browser-providers enforces (a row re-enabled without re-measuring fails;
a measured record needs all four runs). `scripts/measure-cloak-egress.mjs`
takes the measurement (strace, four runs) and never installs anything; the
next step is the USER installing the PINNED package after reading it. The
**loopback cloakserve opt-in** ships as two settings, `browser.cloak.enabled`
(default OFF — turning it on changes nothing but the wording of the refusal
until the measurement is recorded) and `browser.cloak.egressAllowlist`
(default empty = deny), and `cloakservePlan` composes the deployment property
that outlives any one binary: a pinned image, an internal docker network, 9222
on the hub's loopback only, and the hub's allowlisting CONNECT proxy
(`src/server/egress-proxy.js`, started lazily, 403 with the verdict's sentence)
as the only way out. **The remote `cdp` provider** reaches somebody else's
browser: a profile with `host` + `cdpPort` names a loopback port on a paired
machine (or on this one), the hub forwards it over `device.tcpForward`
(reference-counted, PortForwardManager's shape) and probes `/json/version`
first — a dead port is `cdp_unreachable` with the Chrome ≥ 136 remedy
(a non-default `--user-data-dir`), never a local launch; the session's env
names the hub-side url as `AGENT_BROWSER_CDP` instead of a directory, the UI
never sees it, and `use --print` withholds that one pair. Stopping an external
browser closes only the forward; it is never signalled. **A chromium profile
on a paired machine** runs through the `browser-serve` device op (three-touch:
agentd handler + hello-ack capability + `DeviceManager.browserServe`, gated so
an old daemon is never asked), the daemon bundling the SHARED
`src/browser-serve.js` — the machine composes and owns its own directory,
answers its own loopback CDP url, and the keeper never pid-judges, samples or
signals a record whose process is not here (stop asks the device; boot re-asks
and re-forwards; an unreachable machine is said). `vibespace-browser
providers [--host]` tells an agent WHY before it asks. Not in this half: the
live view of a reached/remote browser (`stream_unavailable` by name), §7.4's
live backend switch and §7.5's key half. Gate: test-browser-providers (fast,
138).

### Agent browser v2 — P4 second half: the live backend switch and the key-consumer half (2026-09-17, design §7.4 / §7.5 / §7.6, D17 / D32–D34, round 8)

**The backend is a property of the PROFILE, and a switch makes the keeper do
it again against the SAME directory.** A user (the backend chip in the live
view's title bar or the profile picker → the switcher dialog) or an agent
(`vibespace-browser backend <name>`) asks for `chromium ⇄ cloak` in place; a
`cloud:*` provider keeps its state with the vendor, so there is no in-place
switch — the answer names the explicitly LOSSY path (`switch_export_only`: a
NEW profile on that provider + agent-browser's own `--state`/`--restore`,
which drops sessionStorage and non-extractable CryptoKeys — WhatsApp Web's
login is the known casualty). **Before a byte moves, the version ladder**:
Chromium's profile stamp is one-way, so a target whose major is LOWER than the
one that last wrote the directory is refused (`downgrade_refused`, naming both
versions, two ways out: upgrade that backend or clone through export/import),
"which major wrote it" is the HIGHER of the registry's `lastChromiumMajor` and
the directory's own `Last Version` (the fact a guard reads must not be the fact
a bad write produces), and an unrecorded major is refused automatically
(`downgrade_unknown`) until ONE explicit human confirmation. **The fingerprint
seed is minted once and carried**: a profile's `fingerprintSeed` is minted at
creation (or at its first switch to a seeded backend) and rides every later
switch as `--fingerprint=<seed>`; the dialog says, from the FACT, that
chromium → cloak GAINS a stable fingerprint and cloak → chromium leaves one
behind, so sites that bind a session to the fingerprint may ask for a login
again — cookies cross untouched. **The sequence**: record each lease's
`lastUrl` (the live view's url mirror and the CLI's navigation both stamp it)
→ STOP the browser (one user-data-dir, one process — there is no live
handover) → start the target on the same directory with the same seed → open
each lease's `lastUrl` under that lease's own session name, `--pin-tab`,
`targetId` rewritten on the SAME lease object (never destroyed, so no session
re-attaches) — and in the gap every attach/resolve answers the NAMED
`browser_restarting`, never a timeout. **A switch is a proposal whenever it
would stop somebody else**: under `sharing:'owner'` an agent's switch while
another session holds a lease, or on a profile its conversation does not own,
becomes ONE "For you" item naming who proposed it, for which profile and which
sessions it affects (zero billed turns — the inbox is the channel); a browser
somebody is DRIVING (`input:'user'`) is never interrupted, not even by the
user's own switch. **Seats are three states, not a number** (round 8 #2): the
*used* count is the keeper's own on THIS instance (no vendor interface answers
"how many seats is this key holding"), the *total* comes from the FIRST REAL
LAUNCH of that key (the keeper reads the tier `cloakbrowser` prints and records
`{tier, total, at}` — a by-product of a launch the user asked for, never a
poll; cloak's Test is shape-only and deliberately cannot answer it) and is
`known-fresh` (within `SEAT_TIER_STALE_MS` = 7 days, shown WITH the age of the
reading), `known-stale` (degrades to unknown while saying what the last tier
was) or `unknown` (the NORMAL state under a cluster default — "seat limit
unknown; it becomes known the first time this key launches a browser", never a
fabricated number); **an unknown or stale total never satisfies the ceiling
test**. At the ceiling the wording forks on where the key came from: the
user's own key ⇒ every seat is on this instance ⇒ the profiles holding seats
are NAMED and stopping one is offered; the cluster default ⇒ this instance
cannot list other users' browsers ⇒ "cluster default (seats shared with other
users; N used on this instance)" plus the one click out — a refusal may only
state what its own reason knows. **Three named refusals, none a timeout and
none a silent fallback** (D33): `backend_unavailable` (the binary is not
installed / the row is unwired — naming what is missing; nothing is ever
downloaded), `backend_no_key` (carrying the registry row and the ACTIONABLE
way out `action.openIntegration` → ⚙ → Integrations, that card focused), and
`backend_seat_taken` (round 8 #3: a `cloakbrowser` launch that fails
licence/concurrency validation — under a cluster default the sentence says the
seats are shared fleet-wide, so "stop one of yours" is the wrong advice, and
offers "use my own key"; the criterion keys on the family of words until
§12.40 is measured). **The key-consumer half (§7.5)**: this track contributes
six PURE registry rows (`cloak` + five `cloud:*`, each `consumers:
['src/server/browser-backend.js']`, none with a `setup` — they are pure keys),
`cloak`'s Test is `shape-only` (zero network: a real probe needs the 200 MB
binary and the §7.2.1 egress proof, neither of which a card opened to paste a
key may trigger) and each `cloud:*` Test is `credential-exchange` reaching
exactly the ONE host DERIVED from its own row (browserless/kernel: the host
inside the `apiUrl`/`endpoint` the user typed; agentcore: its region; the
other two: their constant API host; a host that cannot be derived is a named
refusal, never a default host); ONE module — `src/server/browser-backend.js` —
declares the rows' consumer, registers the six runners and resolves the keys,
the keeper asks it EXACTLY ONCE before a spawn, and the vendor's own env name
(`CLOAKBROWSER_LICENSE_KEY`, `BROWSERBASE_API_KEY`, …) exists in the
environment of the ONE child spawned for that provider and nowhere else —
never a file, never argv, never a log line, never `agentEnv` (which passes
vendor names THROUGH by rule; that is exactly why a cluster may inject only
under `VIBESPACE_INTEGRATION_<ID>_<FIELD>`); a key-bearing provider on a
profile whose `host != null` is refused `provider_needs_local_key` BEFORE any
key is resolved (D34). **The switcher's every row carries a SOURCE chip** from
the masked view (`Your own key` / `Cluster default · <label> (seats shared
with other users)` / `Not configured`), a not-configured row is disabled with
its reason written on it and its button opens that Integrations card — "no
key" is said BEFORE the click, the typed refusal is the last net. **`blocked`
is a claim the agent makes, never a detection the server manufactures**: the
server records who claimed it (always the agent of a conversation), for which
URL/host, why, with what evidence and which tier it suggests; the live view
shows "the agent says this page is blocked: <host>" with a one-click "Open
with CloakBrowser" that is the USER's act (it preselects the cloak row in the
switcher — seats and the fingerprint sentence are shown before anything
moves); a real HTTP 403/429 in a navigation's output prints `hint:
may-need-cloak`, worded so it cannot be mistaken for a detection. **Per-site
memory** ("this site needs cloak") is keyed by EXACT host — never a registrable
domain — stores WHO claimed it, when and why (`{host, tier, backend, by, at,
why}`), each row deletable from the switcher, and `tier` is legal ONLY while
`backend === null` (once a backend is named the tier is derived, never stored
twice); it is never auto-escalated — a failure produces only a suggestion. A
per-profile `defaultBackend` says "this profile is for that kind of work"
once. The backend CHIP (`chromium 146` / `cloak 146 (free)`) has two homes —
the live view's title bar and the profile picker's row — and the Chromium
major it shows is read back from the browser's own `/json/version` at launch
(the profile records the HIGHEST major that ever wrote its directory), never
guessed. Setting: `browser.cloak.executablePath` (the binary's path when it is
not on PATH; VibeSpace never downloads it). Not in this half: the remote arm of
the key half (D34 stays a refusal), §12.40's measurement (what `cloakserve`
prints when a free-tier seat is held on another machine — the classifier's
criterion waits on it). Gate: test-browser-backend (fast, 133 — §9's eight
key legs (i)–(viii), the PURE matrix with its controls, the six runners over a
real integration store, the real keeper's switch over a fake `agent-browser`
playing cloak, the routes and the shipped CLI).
r0 rebase onto 2.369.130 (2026-09-21): key leg (i)'s cluster NAMES come from the store itself — a Proxy env records every key the resolver asks the environment for while it resolves the six rows — because test-integration-registry §6(a′)'s builder census keeps `envFieldName(` inside src/server/integration-store.js; the suite spells no env name and calls no builder (161 asserts).

**The install action — "measure first, then install" (§7.4 failure form (1), 2026-09-17).**
`backend_unavailable` has a way out that is a USER act and never a download: the
switcher's cloak row and the Manage Agents "CloakBrowser (browser backend)" row
both carry an Install control that is disabled WITH the server's reason until
the §7.2.1 egress measurement exists (today the shipped record says
`binary_absent`, so both say so and nothing can be fetched). The verdict is PURE
(`installVerdict` in src/browser-switch.js: `install_local_only` on a paired
machine / `already_installed` naming the path when the executable rung answers /
`install_running` / `install_precondition_unmet` naming the record's own refusal
or the missing version / ok with the spec PINNED to the version the measurement
describes), the act is the keeper's `installCloak()` — ONE
`npm install --prefix data/browser-tools --no-audit --no-fund --no-save
cloakbrowser@<measured>` with its output in `data/browser-tools/install.log`, its
exit reported through `browser-profiles-updated` — and the result is found by
`cloakExecutable()`'s third rung, which reads the installed package's OWN
`package.json` `bin` (never a guessed file name). Routes: `GET /api/browser/install`
(the verdict, 200 either way) and `POST /api/browser/install` (the act; a refusal
is the typed 4xx); the switcher view carries `install` so the dialog needs no
second fetch. Invariants: a refused verdict spawns nothing; the pinned version
is the measured one; an installed binary is named by the package, not assumed.
Gate: test-browser-backend §⑤ (the PURE matrix incl. the "skips the measurement"
control, the real keeper over a fake `npm`, rung 3, the routes).

### Agent browser v2 — P5: the action trace, the per-profile screencast, the housekeeping (server 2026-09-18, client 2026-09-21; design §4.5 / §6.4 / §7.1 / §8 step 3, D7 / D8 / D35)

**Every action the agent SENDS to its browser is recorded with a before-JPEG,
an after-JPEG, its POSITION and the COMMAND** (D35, owner 2026-09-13: "记录前后画面
变化以及操作位置，方便用户后面 review"). The recorder (src/server/browser-trace.js)
taps the stream server's own `command` / `result` / `frame` records through the
bridge for every LIVE lease (a tap never starts a browser, never drives, never
counts as a viewer); an observation (`get`, `snapshot`, `screenshot`, `launch`,
the box probe itself) is never traced; a fill's value and a type's text are
kept as `«N chars»` (the §3.7 audit rule); the target element's box comes from
ONE bounded `get box <selector>`; the after-frame is the first ≥ 400 ms after
the result (else the latest by 1.5 s, marked "nothing repainted"). Entries are
0600 files under `data/browser-trace/<profile|ephemeral>/` and are NEVER
redacted (§12.9) — which is why they have a RETENTION (7 d or 200 MB per
profile, whichever bites first, the sweep naming every removal's rule) and why
every surface repeats §6.4's sentence. Setting `browser.actionTrace` (Browser,
default ON) gates the whole thing.

**Where you see it (the client half):** ① THE TOOL CARD — a shell tool call
whose command drives the agent browser (`agent-browser …` /
`vibespace-browser …`, claude's string or codex's argv array — the gate is the
command, never the tool name) grows a "Browser actions" row: the after-frame
THUMBNAILS of every action are always there (D7 (c)), the summary says
`N action(s) · M failed` — or honestly why not (trace off / waiting on a running
card / none recorded) — and the button expands the full list (time · command ·
result · where). One batched fetch per render (the union of the cards' windows,
each entry given to exactly the card that was RUNNING when it happened), live
cards refresh on `browser-trace-appended`, and a STOPPED conversation's cards
still find their actions (the ask carries the CLI's conversation id, the route
resolves the key through the bindings store) — a review happens after the
fact. ② THE ENTRY DIALOG — before / after side by side with the click point or
the element box DRAWN on the picture, the command, the position line, the
result and duration, ← / → through the list. ③ THE LIVE VIEW'S ACTIONS PANE —
the timeline of the pane you are looking at, seeded from GET and grown by the
stream's `trace` record. Frames are drawn through `img.src` only; a frame is a
secret of a logged-in page and the UI says so.

**The screencast (D7 (c) — thumbnails always, video opt-in per profile):** a
`record: true` profile gets `record start <file>` under the lease's own session
when its browser is live (≥ agent-browser 0.37.0 — refused BY NAME below the
floor, the refusal shown in the panel), `record stop` on detach / stop; files
under `data/browser-recordings/<profileId>/`, listed per profile, removed by the
same sweep. Default OFF: a 30 fps WebM of a logged-in profile is a secret with a
storage bill nobody budgeted.

**Housekeeping (§6.4 / §8 step 3 / D8 — a cookie jar is somebody's login):**
the sweep's scope is EXACTLY the provider rows that own a directory on this
machine (`cloud:*` / `local-window` / `cdp` / a paired-machine record are
refused `not_ours` by name); the panel lists every profile with a STATE and a
WHY (in-use / live / recent — with the in-flight grace and its age / stale /
kept / not-ours), its size (measured by `du -sb` in a child, cached), its trace
digest and its recordings, and NEVER proposes a deletion; `forget` ARCHIVES
BEFORE IT REMOVES (the directory is renamed beside itself, a ledger row is
filed first; refused while leased or running); the ONE permanent deletion is
the user's click on a set-aside row; the orphans under `~/.agent-browser` (a
Chromium-marker directory no record names — 53–56 of them, 98 GB, on the
design's machine) are listed with size and last use for the user to ADOPT with
a label or set aside. **The panel** is ⚙ → Tools → Browser profiles… (window
type `browser-profiles`, singleton; also the live view's recording indicator):
one row per profile with the state and its why, the size, the trace digest,
the recordings and the screencast checkbox; the ephemeral row; the
unregistered directories with Adopt… / Set aside; the set-aside ledger with
Delete permanently; the sweep line + Sweep now. Gate: test-browser-housekeeping
(fast, 174) + the window-types / contributions census rows.

### Agent browser v2 — P6: hard mediation — the CDP-mediating proxy, per-session CDP urls, `sharing: "instance"` (2026-09-21; design §6.2 / §6.5 / D6, the §10 P6 row)

**What it is.** A profile's CDP endpoint is unauthenticated and confers
authority over EVERY target in the browser (§3.4), so the cooperative lease was
never a boundary between different owners — which is why `sharing:
"instance"` was refused until this landed (D6). Now every (profile,
conversation) lease on an instance-shared profile is handed its OWN CDP url
(`ws://127.0.0.1:<port>/m/<token>/devtools/browser`, served by
src/server/cdp-mediator.js) and every message through it is judged by the PURE
rules in src/browser-mediation.js: `Target.*` is scoped to the tabs that lease
owns (the ones it created through its url, the ones a scoped page opened, a
child auto-attached under an owned session, a target born in a context it
made — and the tab the lease was minted with), `Target.getTargets` /
`/json/list` list only those, attach / activate / close / getTargetInfo of any
other tab are `target_out_of_scope`, a message on a CDP session the proxy never
handed out is `session_out_of_scope`, `Browser.close` / `crash*` /
`Target.exposeDevToolsProtocol` / `setRemoteLocations` / `sendMessageToTarget`
are `method_refused` always, and while the USER holds the input side (P3) every
`Input.*`, the navigation family, a file upload and the target acts that change
what the user sees are `browser_paused` — a CDP error by id on the same
session, the typed code as its prefix, which agent-browser prints inside its
own JSON (`"error":"CDP error (Page.navigate): browser_paused: …"`). What it
is NOT: `Runtime.evaluate` / `Page.captureScreenshot` are not refused while
paused (a read is the honest use; the CLI's typed refusal already stops the
cooperative path) — stated, never sold as a DOM-level fence.

**How a session gets there.** `vibespace-browser new <label> --sharing
instance` (or the panel's PATCH) — accepted only where the instance has the
proxy (a keeper built without one refuses with D6's sentence, `why:
mediation_unavailable`) and only on THIS machine (`why: host` on a
paired-machine profile; the proxy serves hub-side urls). A mediated attach
(`use` / the `--` form's `resolve`) answers `mediated:true`, the scoped url as
the wrapper's `cdpUrl` (never the raw one), an env of the session name + a
PER-SESSION namespace `vs-<profileId>-<browserKey>` (its own daemon over its
own url — two sessions in one namespace would share one daemon and one scope)
+ the scoped url + an explicit idle + NO profile directory, and a one-line
`note` the CLI prints ("you see and drive only your own tabs"). `use --print`
withholds the CDP pair as before (§5.1). The raw endpoint reaches no answer,
digest, broadcast, status or lease view; the digest carries `mediation:
{available, port, grants}` (counts only) and every profile / lease view
carries `mediated`.

**The lifecycle.** A grant is minted once per lease for the process's life;
`start` re-points every grant on the profile (live connections close 1012
`browser_restarting`, the SAME url reconnects), `stop` nulls it (503
`browser_stopped` until the next start); `detach` and a dropped lease revoke
the grant (connections close 1008 `lease_gone`) AND close the lease's own tabs
in the browser — measured on 0.32.0 + Chrome 153: a mediated `close --all`
closes the session's daemon side only because `Browser.close` is refused
through a session url, so the tabs would outlive the lease; a backend switch
admits each re-opened tab into its lease's scope; the live view of a mediated
lease asks the SESSION's own daemon for its stream port and a
`--confirm-actions` answer goes to that daemon too; the keeper's shutdown ends
the proxy. Tokens are not persisted — after a server restart a lease is
re-granted lazily on its next `resolve`, exactly as a forwarded port is.
`sharing` cannot flip while sessions hold leases (their env names the kind of
attachment), a profile that is somebody's PIN cannot become instance-shared
(`pinned`, the conversations named), and never on the legacy "Shared (legacy)"
record, which keeps `instance` for admission but is never mediated
(cooperative, labelled legacy). **A mediated profile is attached, never
pinned**: a pin hands the NEXT launch the profile's directory (P0's spawn env)
and a shared browser has one owner — the keeper — so `setPin` refuses
`pin_refused` by name, a Task-Group / instance default naming one is skipped
at spawn with its reason in the journal (`pinForCreate.refused` → ephemeral),
and the picker does not offer it as a pin target. The panel shows a `shared`
chip with the sentence.

**Measured (do not regress).** Chrome announces `Target.targetCreated`
BEFORE it answers `Target.createTarget`, so the tab a lease is creating is out
of scope for one message — the withheld announcement is remembered and
REPLAYED before the reply (without it agent-browser's target registry never
learns its own tab and `open` hangs forever). agent-browser connects a `ws://`
url directly but DROPS the path of an http one when it rebuilds
`/json/version` — the lease is handed the ws form; the http twins exist for
other CDP clients. Gates: test-browser-mediation (fast, 127) +
test-browser-mediation-chrome (heavy, 30 — the real chrome and the real
binary as two sessions).

### Agent browser v2 — P7: window binding — one group, two panes side by side (2026-09-21; design §4.6 / §3.7, D19 / D24, the §10 P7 row)

**What it is.** A browser window an agent is driving LOSES ITS OWNER the
moment somebody drags it away. Tab groups (src/lib/tab-group.js) now render a
chain in two layouts: `'tabs'` (unchanged) and `'split'` — two of the chain's
tabs shown side by side inside ONE window, the rest still tabs. The chain
gains `layout` and `split {pair, ratio, dir}`; `tabs` and `active` keep
their meanings, a missing `layout` reads as tabs (no migration). PURE
src/lib/chain-layout.js owns the model.

**How it behaves.** Bind = the strip's side-by-side button after a tab
merge (split UX, 2026-09-23 — the title-bar half drop zone this line used to
describe is DELETED: the owner dragged a window left to snap it and landed in
a split, on the side the target bar's half chose; no drag ever splits now, the
tab merge is the one drag exception), or the live view's own bind control (P7
client half). The strip reads in VISUAL order (the left pane's tab on the
left), the same button is the badge in a split (Unsplit / Swap left and
right), and an announced split can be undone for 5 s. The
divider drags (clamped 0.15–0.85, double-click = 0.5, ratio in one kind of
pixel so it lands under the pointer at any UI scale). Moves, minimise,
maximise and desktop switches happen together — it is one window. Clicking a
THIRD tab of a split chain replaces the non-anchor pane in place (D19 (a)):
the pane the browser is bound TO stays put. **Lifecycle, three paths, one
decision:** closing the browser pane, closing the chat window (host
promotion) and dragging either pane out all collapse the layout to tabs and
move nothing else; a terminated session's history stays readable in its
pane. **Persistence + sync:** layout + split ride layouts.json through
writeLayouts; the multi-client chain key now carries the layout and the pair
order (a remote tabs→split flip used to read as "unchanged"), a remote ratio
applies in place. **Mobile = tabs only:** ≤768px shows the focused pane and
hides the divider by stylesheet; the model keeps the split, so a phone never
writes its own flattening back over the desktop's layout. **Born in the
chain:** `createWindow({intoChain})` opens a window straight into a chain
without painting it standalone (no jump, no autosave churn) — the path the
auto-bound live view takes. **The ownership badge:** a per-SESSION colour
(the webui id's own counter through the task-colour sequence — never the
task-group colour: a session in no group has none, two in one group share
one) with the session's name, drawn on the standalone title bar and on the
tab; a profile shared by several sessions shows N dots, names one per line,
from the digest's `leases`.

**The live view's side (client half).** One `toggleBind()` behind three
surfaces — the live view's bar button ("Snap beside <session>" / "Unbind"),
a title-bar button on the standalone window, and the window menu's row (the
title bar's own menu, so the tab and the phone's long-press reach it); bind
finds the session's own chat/terminal window on this client and calls
`wm.bindSplit`, unbind calls `wm.unbindSplit`. The ownership badge and the
strip's per-pane owner dots are drawn from the digest's `leases` (never
fetched), the viewer first. **Auto-bind** (`browser.autoBindLiveView`,
default ON): when a session attaches a profile (a NEW lease in the digest)
and its window is open on the desktop you are looking at, the live view opens
BORN inside that window's chain as a split — under a deterministic syncId so
two clients never open two; never on a phone; never for an ephemeral browser
(no lease to see). Settings → Browser → "Open the live view beside the
session when its browser starts".

**Do not regress.** `_normalizeChain` at every chain mutation (never a
dangling pair id, never a guessed substitute); `chainSyncKey` at every
layout.js chain site (the pre-fix `tabs.join(',')` key is the silent fork);
the four §6b anti-ping-pong guards untouched; a pane hidden by the narrow
layout is a suspended view (syncHiddenViews derives it); the bind row's
`when` is false for a window without a type (the contributions parity
fixture). Gates: test-window-binding-model (fast, 65) + test-window-binding
(heavy chrome, 61 — a desktop page + a 390×844 phone page on a worktree server
with a fake claude, a fake agent-browser and a fake stream upstream: auto-bind
births the live view inside the chat's chain (one visible window, two measured
panes, the deterministic syncId, frames drawn, the badge in the session's own
colour), Unbind / Snap beside, the divider under body zoom 1.25 within 4 px of
the pointer, a real title-bar drag / minimise / a desktop switch keeping the
panes together, closing the browser pane collapsing to tabs with the chat rect
unchanged, D19 (a) on a third tab, closing the chat host with no dangling id,
layouts.json carrying layout + split, the phone displaying one pane while its
model and its own save keep the split, a remote same-tabs layout flip applied
where the pre-fix key would not, a ratio-only change in place, a shared
profile's two dots, the strip's per-pane dots) + test-contributions (the
window-menu parity).

### Agent browser v2 — P9 (first half): window targets — a native window as a target, through its accessibility tree (2026-09-21; design §4.9 / §5.1.1 / §6.6, D27 (a) / D28 / D29, the §10 P9 row)

**What it is.** `vibespace-window` puts a native application beside the browser
target: an agent starts an app on a private display VibeSpace owns (the
desktop-app keeper's Xvfb + x11vnc), takes a LEASE on it, reads its
accessibility tree as a `snapshot` with `@eN` refs (the agent-browser habit),
and acts on a NODE through the action that node itself declares. Pixels are
the fallback (`screenshot`), never the primary read (D28).

**The four measurements came first** (§10's P9 row; numbers in
kb-file-structure.md under src/window-targets.js): the RemoteDesktop portal
is reachable from a `systemd --user` background unit on this box (CreateSession /
SelectDevices answered 0, Start raised the consent dialog — D29 (a) viable,
the user's click unproven); Chromium/Electron exports an `Action` on every
node (357/357, buttons 43/43) while gnome-shell's 74 buttons export none and
Qt is unmeasured (not installed); `do_action` → tree-visible change median
0.34 ms on GTK; no maintained node AT-SPI binding exists and the per-node cost
is the same order with or without libatspi's cache (0.34–0.51 ms/node raw D-Bus vs
2,400–5,400 nodes/s through GI), so the helper is python3 + GI in a bounded
subprocess — the boundary the event-loop law demands anyway.

**Scope (D27 (a)).** `list` shows ONLY windows VibeSpace started (the keeper's
live records, every row `origin: vibespace`); the user's own desktop is never
enumerated or addressable. Windows are local-only in this version.

**The verbs and the law (§5.1.1, enforced per verb).** `click <h> @e7` runs the
node's own action (`click > press > activate > doDefault > …`; Chromium's
`showContextMenu` / `clickAncestor` never unnamed); **a node without `Action`
is refused `node_has_no_action` by the engine before any helper call and stays
refused with an injection backend present** — never silently degraded to a
coordinate click (the refusal names the bounds and the audited `--at` path as
the agent's own decision). `type` needs `EditableText` (`node_not_editable`;
the focused node when no ref is named). `key <chord>` has no road on the tree
and `click --at x,y` is coordinates by definition: both are INJECTION, gated by
a RUNTIME probe of the backends on THAT display (`xtest` = xdotool on our
display, the only wired rung; `portal` present-needs-consent, unwired; `uinput`
unwired) and refused `no_injection_backend` WITH the probe rows. The chord
vocabulary is closed (an argv-bound string never passes through).

**The traversal is bounded** (§4.9): a subprocess per call with a wall SIGKILL,
libatspi's per-call timeout inside, a node budget (600 default, 3000 max); an
application that stops answering shows up as an unreadable subtree, never a
stall on the server's event loop. Every snapshot prints its interface CENSUS
(§12.30: coverage is per toolkit and per desktop).

**Leases and audit.** One holder per window (`window_leased` names the holder);
in memory in this half (re-attach after a restart); the persisted lease, the
per-window live pane (`window-live`, needs the xpra transport) and §4.3's three
modes on windows are the second half — `window_paused` is already the word.
`data/window-audit.jsonl` records who / which window / the verb / `by` (node
with role + name + action, point with coordinates, inject with the chord) —
typed text never. `watch` answers the Desktop-app window of the whole private
display, honestly.

**Gate.** test-window-targets (fast, 125): the PURE verdicts with negative
controls, the bounded subprocess over fake helpers (a hung helper killed at the
wall and dead), the REAL leg on this box's own Xvfb + the GTK fixture through the
real helper (refs from the real tree, the census printed, click @ref changing
the app's state as read back from its own tree, the label-drawn button refused
with and without xdotool, EditableText, ctrl+s and a canvas point click landing
on the fixture's witness labels and both refused with the probe when xdotool is
taken away, a PNG of the frame), the engine + routes (one holder, the STATUS
census). SKIPs with evidence without python3-gi / Xvfb / a session bus.

### Agent browser v2 — P9 (second half): the window lease persists, and a window has the three modes (2026-09-21; design §4.3 / §4.9 / §6.6, the §9 `test-window-target` row)

**What it is.** A window target now has what a tab has: a LEASE that survives a
VibeSpace restart (data/window-leases.json — the keeper adopts the window, the
agent's next verb just works), ONE holder per window with a typed refusal for
the second agent (`window_leased` names the holder; a lease whose session is
gone is orphaned and the next `attach` takes it), and the live view's THREE
MODES on the window itself — Watch / Take over / Hand back — because a window's
takeover and handback ARE a tab's: they share `lease.input`, the PURE verdicts
in src/browser-takeover.js, the idle window `browser.takeoverIdleMs`, and the
ONE handback announcer under the ONE spend reason `browser-handback`.

**The `window-live` form.** The Desktop-app window (the P8-1 vnc-display bridge,
src/server/desktop-stream.js) grows the browser live view's bar when an agent
holds the app: the badge with its exact three phrases, Take over, Hand back,
"Agent: <session>", the title "<label> — agent window", and the §6.6 CLASS
MARKER "VibeSpace-started window" (the other class — the user's own desktop —
never appears; the marker is what keeps it distinguishable when it does). In
Watch and while somebody else drives, noVNC is view-only on the client AND the
bridge cuts the viewer's KeyEvent / PointerEvent / ClientCutText out of the
relayed bytes (the FramebufferUpdateRequest beside them still goes through, so
the picture never freezes on a refused click); a window nobody leases behaves
exactly as before (the user's own app, never gated). Each pane names itself with
one viewer id on its stream upgrade (`?viewer=`) and its takeover, so the lease
says which viewer holds it and the bridge hands back (`viewer-left`) when that
socket closes.

**§6.6's second enforcement point.** A takeover STOPS INJECTION of every kind:
while `input` is 'user' every agent verb — snapshot, click @ref, type, key,
--at, screenshot — is refused `window_paused` (the shared wording: when, "do not
retry in a loop", snapshot again when it comes back). What we guarantee is that
WE do not inject; the handback (explicit: announced into the conversation with
"snapshot it before continuing — refs from before the takeover are stale";
idle / viewer-left: zero-spend, the notice rides the next message, one inbox
item) resumes it explicitly. Every audit line carries `origin:'vibespace'`;
takeover / handback lines say `by:'user'` with the viewer and the cause.

**Gate.** test-window-target (heavy, 99): the sieve's strip, the window noun
(browser strings byte-identical), the PURE mode arithmetic, the engine over a
fake keeper with an injected clock, the announcer, the bridge over a fake RFB
server, then the REAL leg — the keeper's Xvfb + x11vnc + the GTK fixture,
`vibespace-window` as a child process for two sessions, a key sent in Watch that
never reaches the fixture's witness and the same key landing after the takeover,
the handback announced, a restart keeping the lease.

### Agent browser v2 — P10: tier 3 — windows on the user's REAL desktop, behind their own switch (2026-09-21; design §7.6 / §7.1's `local-window` row / §4.9 columns 1-2 / §6.6, D27 (b) / D31, the §9 `test-browser-tier3` row)

**Measured first (src/window-desktop.js `TIER3_MEASUREMENTS`, scripts/measure-tier3.mjs):** §12.36 — the installed agent-browser on a STOCK launch reads bot.sannysoft.com 3 passed / 1 failed, nowsecure.nl no challenge, browserscan.net "Robot" (tier 2 = binary absent, tier 3 = the user's own window, banks = the owner's act — each a refusal BY NAME, not a blank); §4.9 columns 1/2 on the user's own session — X11 enumerates only X11 clients (`_NET_CLIENT_LIST` empty here), the Xwayland root grabs black, an Xwayland client's OWN window is readable through `x11grab -window_id`, a native Wayland client has no X window at all yet is on the a11y bus, the ScreenCast portal answers CreateSession/SelectSources from the server's own systemd context and `Start` is the user's click, GNOME's Introspect / ScreenshotWindow are AccessDenied; §12.39 — one `do_action` → a visible pixel change median 3.3 ms (p95 one frame) on the user's Xwayland.

**The switch (D27 (b)).** `window.realDesktopTargets` (Settings → Browser, default OFF, `confirmOn` — the confirmation dialog IS the consent; agents cannot write settings). While it reads `true`, `vibespace-window list` also prints every application on the machine's accessibility bus that is not ours, each a `dw-<pid>` row marked **YOUR DESKTOP** (`origin:'desktop'`, `yourDesktop:true`); `attach` takes the same one-holder lease, persisted with its origin. Turning it OFF drops every such lease at once — at the next verb (`desktop_consent_off`), at the engine's tick and at boot; the user's decision wins before any takeover is even asked for.

**What the class is (tier 3).** No CDP, no automation flag, no process of ours, no directory of ours: the site sees the user's own browser. The channel is the accessibility tree: `snapshot` / `click @ref` (`Action.do_action`) / `type @ref` (`EditableText`) go through NO input injection. **`key` and `click --at` are refused by name (`desktop_injection_refused`) whatever backend the display has** — a chord or a point on the real desktop lands in whatever has focus, possibly the window the user is typing in (§6.6). `watch` is `no_live_view` (they are looking at it). `screenshot` reads an Xwayland client's own pixmap through `x11grab -window_id` on the server's display env and refuses a native Wayland window `capture_needs_portal` by name (the portal's consent click + a PipeWire consumer, not wired — the measurement record's `WIRED` claims say so and the suite goes red if a rung is wired without its ok cell).

**The user's side.** Desktop apps → "Agents on your real desktop": the switch's state, and per window an agent holds a Pause agent / Resume agent (`POST /api/window/desktop/:handle/pause|resume`, the same takeover verdicts as a tab: the agent answers `window_paused` meanwhile). The CLI spells `desktop_consent_off` as THEIR switch (ask, do not work around it).

**The row and the ladder (§7.6 rules 2-5).** `local-window` is wired behind `provider_needs_consent`; it lacks `cdp` / `allowed-domains` / `pin-tab` / `live-view` and each is a typed refusal that says what the class has instead; a tier-3 PROFILE is refused `tier3_is_a_window_target` (escalating to tier 3 creates no record and re-points none — it opens a WINDOW TARGET); switching a profile to it is `switch_refused` naming that act; a site hint's `tier` stays legal only while `backend === null` and a tier-3 `blocked` claim reads "suggests tier 3 (a window on your own desktop — your act …; nothing escalates by itself)" — never "detected"; `hintAction` never answers `auto`. Not in this chunk: the ScreenCast/PipeWire live pane for a native Wayland window (P8's transport), injection on the class (D29), any bank reading (the owner's act).

### Agent browser v2 — r-fix (2026-09-21): the verifier's round on the whole branch

Seven reproduced findings, each fixed where the file's owner suite pins it:

* **A sub-agent on rung D got its own browser only in name.** `childEnvFor` unset the parent's profile symlink on rung C and nothing on rung D — but a PINNED parent's generated config names its directory, so the child's namespace resolved the SAME user-data-dir (the measured SingletonLock shape, or a silent browse in the parent's cookie jar). Now browser-env writes the child its OWN config (`<key>.<n>.json` = the parent's minus `profile`, fence kept, read back and proved profile-less), the env carries `AGENT_BROWSER_CONFIG=<it>`, the sweep owns it by the parent key; without one a profile-naming parent config is unset. (test-browser-handles 120)
* **Any same-user client could drive a window during another human's takeover.** The pane chose its own viewer id, the bridge's `.set` REPLACED the holder's socket on a duplicate id, and the id was broadcast to every client in `window-leases-updated`. Now the id is a per-socket secret (128 bits, minted per connect, refused 409 on a live duplicate), the lease names a takeover by an OPAQUE tag, and only the taker's own answer carries its tag (`mine` compares tags). (test-window-target 71)
* **An agent could launch an arbitrary executable on a private display.** `POST /api/agent/window/open {exec}` rode the keeper's lease against design-desktop-apps §5 ("an exec is a human's"). Now `open` takes registry ids only — `exec`/`args`/`cwd` ⇒ 403 `exec_is_human` naming `list`'s registry ids as the remedy; the CLI drops the flags. (test-window-targets 80)
* **Installing xpra refused every desktop-app launch.** Inherited from master 2.369.131 by merge: a present-but-unwired rung is passed over with its reason.
* **The mediation sentence promised more than the fence does.** Runtime.evaluate passes while paused BY DESIGN (reads stay open; both mediation suites pin it), so a script could still navigate. The sentence, the CLI's `watch` and the manual now say "input and page-navigation commands are refused; script evaluation and reads are not — do not navigate by script while they drive". (test-browser-mediation 130)
* **`new --adopt <dir>` registered ANY directory** (the user's own Chrome profile, the legacy jar) as session-owned and idle-managed. Now `adoptDirVerdict`: strictly under `~/.agent-browser/` or `data/browser-profiles/`, never the legacy `default-profile`, never somebody else's record; no roots ⇒ refused. (test-browser-handles)
* **The action trace kept key presses and select values verbatim.** A single-character `press`/`keydown`/`keyup` is «1 key» (named keys stay), a `select`'s value/label its length. (test-browser-housekeeping 178)
* **Two heavy suites misbehaved on this box:** test-browser-live's real-chromium leg SKIPs with the vendor's launch error (exit 21 / DevToolsActivePort) instead of failing; test-browser-tier3-chrome's a11y wait is ONE 60 s wall (was 120 × 8 s) and two consecutive helper timeouts SKIP as "the bus is not answering".
* **The seven fast suites the branch broke** (a second counter-zoom literal, the Settings category order test-jobs-triage pins, four usage placeholders the frame census reads as tags, two server.js lines a pin reads by line end, a heavy row's `why` without a category word, the spawnOriginHint line test-codex-effort-meta pins verbatim) are green again; CLAUDE.md's added index lines are heads again with their essays in the kb files (the routing row's full text moved to kb-design-lessons §18).

### Desktop lane E — a window is SHARED with agents, never assumed; tree or pixel mode; "ask an agent to take control" (2026-09-25; docs/design-desktop-apps-seamless §3.6, the owner's D1–D7; model src/window-reach.js)

**What changed for the agent.** P9's rule "every window VibeSpace started is addressable" (D27 (a)) is replaced: a desktop-app window is HIDDEN from every agent until the user shares it (D1). `vibespace-window list` shows only what reaches the calling session — a share naming its conversation (or its webui id before it has one), a Task Group it belongs to at that moment (D2: "live now or later" — membership is asked at every verb), or its own `vibespace-window open` (the one exception: shared with the opener only). Every verb on anything else is refused `not_exposed`, and the CLI says "the user has not shared this window with you — ask them (they can share it from the window's ⋯ menu)". The user's REAL desktop (tier 3, P10) is unchanged — its own switch, never this share (D5).

**The user's side.** The Desktop apps dialog has a "Share with agents" row under the machine picker (a summary button + a popover picker: live agent sessions, Task Groups, the mode); what the user sets rides that launch and is remembered PER APP (user state `desktopAppReach`, the desktopAppFrame key) so the next launch of that app proposes it; untouched, the row reads "Hidden from agents (each app remembers its last choice)" and hides for a paired machine (its windows are no agent target). A launched window's ⋯ — now on EVERY rung — and its title-bar / taskbar menu carry "Share with agent…" (the same picker as a dialog: checking shares, unchecking revokes at once; an agent holding the window loses its lease and its next verb answers `not_exposed`; rows another origin wrote are named — "you asked it to take control", "it opened this window") and "Ask an agent to take control…" (D3). A "Shared with N · <mode>" chip appears on the window once anybody is shared (its tooltip names who; a click opens the dialog).

**Tree or pixels (D7, the owner: 像素模式是最接近用户本人操作的方案作为兜底).** Every share has a mode — Auto (default) / Accessibility tree / Pixels — switchable any time; a switch takes effect at the holder's next verb (audited `mode-changed`). Pixels = the agent reads `screenshot` and acts with `click --at` (a pixel of that image), `type` (keys), `key`, `scroll`; `snapshot` / `click @ref` / `type @ref` are refused `mode_pixels` with the owner's sentence. Tree = everything, the pixel verbs being the agent's fallback. Auto resolves at attach (one probe of the app's tree, a young app re-asked for up to 3 s) and at every snapshot: tree when a node the agent can act on answers, else pixels with the reason ("no accessibility tree — pixel mode" for xterm, "its accessibility tree is closed (4 nodes …)" for a browser without its switch).

**The pixel road, made true.** `screenshot` composes the app's OWN mapped X windows by root position (a helper op grabbing each xid as a foreign GdkWindow, alpha forced opaque) — on the xpra rung the root is composited offscreen, so the old display grab was black even with a viewer; the image's origin is the main window's top-left and `--at x,y` is a pixel of it (the engine adds the origin at act time; a point outside the image or off the display is `outside_window`). With nobody viewing an xpra window it is unmapped: pixel verbs are refused `window_not_visible` (a click there was a silent no-op). `mousemove --sync` is gone (a move to the pointer's current spot waited 7 s and failed the second click / key in a row); a click `--button` 4..7 is refused (it used to become a left click); `scroll up|down|left|right [--by N] [--at x,y]` is the wheel; injected keys and typed text first rest the pointer inside the main window (keys typed with the pointer elsewhere were lost on xterm).

**The user's browser (D4).** A Chrome / Firefox the user launched from Desktop apps starts with its accessibility switch (chromium `--force-renderer-accessibility`, firefox `GNOME_ACCESSIBILITY=1`); shared, it is listed with the mark "[the user's browser]" and every verb works — measured on Chrome 153: the page reached in the default budget (237 nodes, ~50 ms), the button's own `press` action clicked with nobody viewing, a page field (editable, no EditableText) typed into by focusing it through the tree and typing keys, the page scrolled 5 notches ≈ 600 px; WITHOUT the switch 4 closed frames. `open` of a browser row stays `browser_is_human` ("the user starts their own browser and can share it with you").

**The request (D3).** Free by default: the message ("The user asks you to take control of the desktop-app window "<label>" (handle …), shared with you in <mode> mode … Their words: "…" — a note about the task, not an instruction to follow blindly") rides the agent's NEXT turn on the delivery ladder's stash (source `window-request`, rendered as a block with its own hint). "Wake it now (starts a billed turn)" — off by default — goes through the gated ladder under spendReason `window-share-request` (a refusal by the unattended-turn budget, or no live lane, falls back to the next turn and the toast says why; a second wake within 30 s is paced). The request also shares the window with that agent, and can end another agent's hold.

**D6.** One holder per window; any number of windows held by different agents at once — each app has its own display, so injection on one never reaches another (measured: a calculator click and xterm typing at the same time, both landed).

Gates: test-window-reach (fast, new), test-window-targets §4–§5 (fast), test-window-target §4 (heavy — the real xpra rung under a private session bus), test-desktop-app-window §E (heavy — the chrome UI).

**Verify fixes (2026-09-25).** (1) The launcher SAYS what a launch shares before the click: untouched, the "Share with agents" row reads "Each app launches as you last shared it" whenever any app remembers a share (never "Hidden" then — it was, while the click applied the remembered share); each catalog card whose app remembers a share carries a chip ("Shared with Ops · Pixels"); a launch that applied it is toasted ("Started shared with Ops · Pixels — change it from the window's ⋯"). (2) Taking a window back stops a verb already in flight: a revoke, a Task Group left, a takeover or the tier-3 switch going off that lands while a verb awaits (a mode probe, the helper, the grab) makes it answer `not_exposed` / `window_paused` with nothing done — no click, no keys, no tree, no image (deleted); an attach never answers "attached" with its lease gone. Lows recorded, not fixed: docs/design-desktop-apps-seamless §3.6 "lane E verify lows".

### Browser takeover — ONE CLI, no agent-browser on the agent's PATH (2.369.168 chunk 1; docs/design-browser-takeover.zh.md §3 T1 / §4 T2 / §6 T4)

The owner (2026-09-24): VibeSpace takes the browser tool over completely — no separate `agent-browser` entry point for agents, no compatibility with agents driving it directly, hidden from the PATH, the web-access skill rewritten. Shipped:

* **`vibespace-browser <verb>` takes every page verb directly** (`open`, `snapshot`, `click @e3`, `fill`, `get text`, `tab`, `batch`, …). The PURE router `src/browser-verbs.js` decides what a command is — `ours` (the 12 VibeSpace words: profiles new providers use detach status pin watch backend blocked new-child help — ours always wins; the ONE collision with the browser CLI's own census is `profiles`, reachable as `-- profiles`), `page`, `refused` (LOCALLY, zero server calls, `<error> [<code>]` + `remedy:`), or `escape` (`-- <verb>` for a verb newer than the table; the same rules). Codes: `raw_cdp_refused` (`connect`, `get cdp-url`, `--cdp`, `--auto-connect`), `identity_flag_refused` (`--session --namespace --session-name --config --state --restore*`), `launch_flag_refused` (`--proxy --headed --args --user-agent --executable-path --extension -p/--provider --engine --enable --init-script …`; `--enable`/`--init-script` PASS beside `open`, D12), `confirmation_is_human` (`confirm`/`deny`), `verb_not_offered` (`session stream inspect auth plugin install upgrade doctor mcp dashboard chat skills`), `batch_line_refused` (every batch line judged before any runs, one refusal names the line), `unknown_verb` (exit 2). Debug/perf verbs (D4) and `cookies`/`state`/`storage` (D5, the manual's "output is a secret") pass through.
* **Every page verb makes ONE `/api/agent/browser/resolve` call** (lease, one-time `profile_changed`, `browser_paused`, `browser_restarting`), runs the REAL binary found by `resolveRealBinary` (PATH in order, skipping the shim's dirs and any file carrying the shim's marker; absent ⇒ `binary_absent` before any server call), and writes the audit line — the ephemeral browser's too (before, the bare path audited nothing). The first stderr line names the browser: `profile: (ephemeral) this conversation's browser`, `profile: (shared) this machine's browser …`, or a profile's label + handle.
* **`use` only attaches** (no subshell; `--print` ⇒ `not_offered`, nothing to export); **`new-child`** prints only `export VIBESPACE_BROWSER=<child>` on stdout (the child's browser identity is the server's business, resolved per command); **`status`** says which browser a bare verb lands on (and `shared` on the shared rung); exit codes 0 / 1 typed refusal or the command failed / 2 usage, not in a session, `unknown_verb` / 3 unreachable.
* **The SHIM `data/bin/agent-browser`** (STATIC, in AGENT_TOOLS): one stderr line `agent-browser is driven by VibeSpace here — run: vibespace-browser <the same args, shell-quoted>` (no args ⇒ `… vibespace-browser help`), exit 2, no env, no network, no forwarding. Locally `AGENT_BIN_DIR` is first on an integrated session's PATH, so it shadows the nvm/npm-global binary; remote hosts get it through AGENT_TOOLS and the fixed prelude order (`REMOTE_PRELUDE → nodeFinder → tools`). A user-configured MCP server spawning the hidden CLI inside a session fails VISIBLY on it (D6).
* **r1 (after the adversarial verify):** a verb's noun is the first NON-flag word after it (0.32.0 reads global flags anywhere) — `get --json cdp-url` / `get -c cdp-url` / `get cdp-url --json` / the same in a batch or after `--` are all `raw_cdp_refused`. The child env of every page verb is BUILT (`childEnv` in src/browser-verbs.js): every `AGENT_BROWSER_*` key of the shell dropped, the output-only keys + `SOCKET_DIR` kept, then the session's own spawn pairs from `/resolve`'s `spawnEnv` (rung H: the host-decided scratch dir named by `hostProfile`), then the answer's pairs + `unset` — so `AGENT_BROWSER_CDP/_PROXY/_ARGS/…` typed into the shell never reach the real binary; the dropped keys the agent added are said once by name (`[env_twin_dropped]`). Route error strings (switch_export_only's remedy, a launch failure, the chromium provider label) no longer name the hidden CLI.
* **r2 (the second adversarial verify):** only the NOUN of a `get` decides the raw-CDP refusal — `get attr @e cdp-url` (an attribute named cdp-url) and `get text cdp-url` run; a boolean global flag's optional `true`/`false` is skipped with it (`get --json true cdp-url` is refused — measured on the real binary, which reads it as the endpoint). The socket root is identity: `/resolve` names the root the keeper runs the browser under (`socketDir` / `runtimeDir`) and `vibespace-browser` sets it last, so an exported `AGENT_BROWSER_SOCKET_DIR` or `XDG_RUNTIME_DIR` can no longer point the sanctioned command at a daemon the keeper does not see (rung H keeps only its prelude's `<base>/vs-ab-<uid>`). A desktop-app window is the human's browser when its launch names one (Chrome, Edge, Brave, Opera, Vivaldi, Firefox, Epiphany, the Debian `x-www-browser` alternatives; flatpak / snap / env launchers; reverse-DNS app ids) or its running process's executable does — not only the registry's firefox / chromium rows.
* **r3 (the third adversarial verify):** the router's global-flag tables are MEASURED off the installed binary rather than read off its `--help` (`get --idle-timeout 5m cdp-url` printed the endpoint — that flag is documented only as an env var); `get` passes only a noun it reads (text / html / value / attr / title / url / count / box / styles) and a flag of unknown arity is judged under both readings; `--idle-timeout` is refused (the keeper owns the browser's lifetime). THE CONFIG FILE IS NAMED, NEVER SEARCHED: every browser the keeper runs, and every sanctioned command on it, uses one named config file (the browser's generated config, else `data/browser-env/machine.json` / `machine-ephemeral.json`), so an `agent-browser.json` in the agent's directory no longer rides a command (measured: it relaunched the running browser with its `args`). The machine's own `~/.agent-browser/config.json` still applies whole — minus `cdp` / `autoConnect` and any `--remote-debugging-*` / `--user-data-dir` switch — while a project `agent-browser.json` may only narrow (its fence, policy, confirmation list, output bounds — added where the machine's file sets none, never replacing the owner's); a remote session's CLI composes the same file on the host. A human's niche browser (surf, luakit, dillo, zen …) and `env -u NAME chrome` are refused `browser_is_human` too; a remote session keeps its prelude's socket dir only when it is a real directory it owns.
* **r4 (the fourth adversarial verify):** a navigation goes to the web only — `open` / `goto` / `navigate`, `tab new`, `window new`, `pushstate`, `diff url`, `read`, `vitals`, `record start`, any verb after `--` and every batch line refuse `file:`, `chrome:`/`chrome-*:`, `about:` other than `about:blank`, `view-source:`, `devtools:`, `javascript:`, `blob:`, `filesystem:`, a Chromium build's own pages and any other `x://` (`local_scheme_refused`), and so does `state load` of a file naming such an origin — measured, `open chrome://version` + `open file://…/DevToolsActivePort` printed the random debugging port every launch carries (`--remote-debugging-port=0`); against a same-uid agent the guarantee is that the sanctioned road never prints it (its own shell reading `ss` / that file is the design's stated trust level). The configuration is the ACCOUNT's (passwd home; a `$HOME` that disagrees ⇒ `config_unavailable`). A stdin `batch` works in both forms (lines, or the binary's JSON array of string arrays — handed to it as JSON). The flag table is trusted only on the version it was measured on (another build ⇒ `[flag_table_drift]` once and every flag read both ways, checked before any server call).
* **The shared rung (D7):** a session with no per-session browser drives the machine's one browser; `/resolve` answers `shared:true` and refuses `close --all` as `shared_browser`.
* **Teaching (T4):** both `browserIntroLine` variants, `browserSetLine` and the `vibespace-window` line teach `vibespace-browser <verb>` and never name the hidden CLI; `docs/agent/browser-manual.md` is rewritten around the one tool; `docs/agent/web-access-skill.md` is the owner's skill rewritten for it (the user installs it). test-architecture §52 counts the name (teaching output, docs/agent/*.md, the two CLIs' string literals; path shapes like `~/.agent-browser/` are not the tool).
* **Honest limits:** remote sessions are isolated but not managed (D8); an instance with Integration OFF has no data/bin on the session PATH, so no shim — VibeSpace manages nothing there by design; the session env still carries the four `AGENT_BROWSER_*` pairs (D1: the ephemeral browser's identity — an absolute-path escape lands in the same watched browser, never the user's own cookie jar). The keeper-managed ephemeral browser (T3), the `browser_is_human` attach refusal (T6) and the three renamed faces (T5) are the lane's later chunks (T5 = chunk 3, see the UI section's "three browser faces" entry).

### Browser takeover — THE MANAGED EPHEMERAL BROWSER + the attach gap (2.369.168 chunk 2; docs/design-browser-takeover.zh.md §5 T3 / §8 T6)

* **A conversation's own browser is watched now (I4).** Its first page verb with no attachment makes the keeper record a MANAGED ephemeral browser (`ephemeral:true`, owned by the conversation's browser key, labelled `(ephemeral) <session name>`, ns `vs-<browserKey>` — P0's identity unchanged), with ONE lease aliased `ephemeral` that is never an attachment (no handle; a bare verb still lands on it; `profile_required` counts only named attachments). The keeper starts it — or adopts a daemon an escaped command already started — under the session's EXACT spawn pairs (never a re-run of the browser-env ladder), and `/resolve` answers `kind:'ephemeral'` with those pairs. Every verb is audited against the record; the live view, the takeover key `<bk>|ephemeral` and the trace scope `ephemeral` are the same as before (stream-port parity pinned).
* **Lifecycle:** the CLI's own idle timeout (`browser.idleTimeoutMs`, default 15 min) still stops the daemon — the keeper records that `stopped` (idle), never an error, and the next verb starts it again; runaway sampling, park and notice are a named profile's; a server restart adopts it under its recorded pairs; when no live session carries its conversation (after the lease grace; at once at boot) the lease drops, the browser stops and the RECORD IS REMOVED BY ITSELF (a named profile never is); resume ⇒ the same record, fork ⇒ a new one, a sub-agent's child handle ⇒ its own, reaped with the parent.
* **The ceiling counts it (D2).** `CONCURRENT_CAP = 6` covers every live browser (named + ephemeral) AND the live desktop apps (the count seam `setOtherHolders`, wired in server.js). A conversation whose first verb would be the seventh is refused `browser_cap`, naming every holder and the two ways out (an idle-out, or the user's Stop); nothing is queued. A named profile's start keeps its `cap` sentence.
* **Surfaces:** `vibespace-browser profiles` never lists it (not attachable); `status` says "this session browses its own managed browser (ephemeral: <state>, started <ago>)"; the Browser profiles panel gains an **Ephemeral browsers** section (record, conversation, state, Stop — zh + ja); the digest carries `ephemerals` beside the named `profiles`.
* **Unmanaged, honestly:** a remote session (rung H, D8) and an instance with `browser.isolateSessions` off (the shared rung, D7 — `close --all` refused `shared_browser`) still answer `kind:'none'`. The managed ephemeral browser is `sharing:'owner'` and not CDP-mediated (it has one conversation); a takeover stops its verbs at `/resolve` (`browser_paused`).
* **The attach gap (T6):** a desktop-app BROWSER window (a record or registry row carrying `browser` OR `category: 'browser'` — the DEFAULT_REGISTRY's firefox / chromium rows carry only the category, r1 — or an ad-hoc launch of a browser row's executable) is the user's own window: `vibespace-window attach` / `snapshot` / `act` / `screenshot` / `watch` refuse it `browser_is_human` (403, the remedy names `vibespace-browser`), `list` omits it, and a browser registry row is never an id an agent may open.

### The agent's ephemeral browser shows itself (2.369.180 lane H, owner 2026-09-25: "我在前端完全没看到浏览器出现啊 … 也没记录任何浏览器操作")

* **The live view opens beside the chat.** When a conversation's own (managed ephemeral) browser starts and its chat window is open on the desktop you are looking at, the live view is born INSIDE that chat's window as a side-by-side split, silently, exactly as when a session attaches a profile (`browser.autoBindLiveView`, default on; never on a phone; one window per session, syncId `win-blive-<session>`). It streams THAT browser, even if the conversation also holds attachments. A sub-agent's own browser is never auto-opened.
* **It greys, and comes back.** When the ephemeral browser stops (it idled out, or somebody pressed Stop), the view says so ("this conversation's browser is not running … the agent's next browser command starts it again, and this view reconnects then"). Opening or reconnecting a view never starts that browser. The agent's next browser command restarts it and the same window reconnects.
* **Its actions are recorded with nobody watching.** Every action the agent sends to its ephemeral browser is in the action trace (scope `ephemeral`), from the very first `open`: the trace is armed when the browser starts, and the command waits (at most 3 s) until it is. The tool card of the call shows the Browser actions thumbnails; the Agent browser panel lists them. The same wait now covers a named profile's first command after an attach.
* **The chips.** The chat status bar's Agent browser chip names it `Agent browser · (ephemeral) <session>`, and its tooltip says whether it is running. The session card shows an `Agent browser · …` chip while the session's agent holds a running browser (its ephemeral one or a profile); click opens the live view.
* **The status route's `leases`** lists the running ephemeral browser too (marked `ephemeral`), beside the `ephemeral` record.
* **agent-browser 0.38.1** on this machine (was 0.32.0): shared profiles are available (floor 0.37.1). New refusals by name: `webmcp` (page-declared tools, experimental), `--ca-cert` / `--no-ca-cert` / `--no-webmcp` (launch), `--no-pin-tab` (the lease decides the tab). New verb: `a11y [url]` (an accessibility audit; a `file:` / `chrome:` url is refused like `open`'s).
* **Verify r1 (2026-09-25).** A dead ephemeral browser leaves at once: when its daemon dies, the live view's stream closing tells the keeper and the holder row goes (it used to linger up to 5 s, and a view reconnecting in that window started a daemon nobody held). Only the command that STARTED the browser waits for the trace to be armed; later commands never wait, and a failed arming is not retried by a command for 30 s. `vibespace-browser detach` in a conversation whose only browser is its own ephemeral one stops that browser now and says so ("… is stopped now … the next browser command starts it again"); the next command's browser is traced again. test-browser-resources re-ran green on 0.38.1 (the shared-profile floor stands).
* **Naive study 2 (2026-09-25).** A named profile works for more than one conversation again: VibeSpace alone starts a profile's browser, and every conversation reaches it through its debugging address with its own tab (before, each conversation's own browser process tried to start a second Chrome on the profile's folder and died on "SingletonLock", the study's "bank"). "Open live view" goes to the session's one live view instead of opening another window. A live view never starts a browser: a stopped one keeps the last picture, greyed, labelled "Browser stopped", and reconnects when the browser runs again. A helper's (sub-agent's) browser is recorded too, and never gets a live view of its own.
* Gates: test-browser-profiles ㉒, test-browser-ephemeral ④ ⑤, test-browser-verbs, test-browser-live ① ③b / ④ (heavy), test-browser-mediation-chrome ④ (heavy, the real 0.38.1).

### Browser takeover — THE THREE BROWSER FACES RENAMED (2.369.168 chunk 3; docs/design-browser-takeover.zh.md §7 T5 / D10 = docs/design-browser-faces.zh.md direction B)

* Web view / Agent browser / Browser app, labels and icons only, ids untouched — the full list is the UI section's "three browser faces" entry below; the per-file detail is kb-file-structure's ### THE THREE BROWSER FACES RENAMED.

### Background Work (2.342.0 — docs/design-background-work.md is the authoritative design)
- **TRIAGE (2026-09-14, design §13; owner-approved defaults 24 h / 7 d / notified-counts-as-acknowledged).** A terminal one-shot (`task`, incl. a cron's per-fire child; never a service or cron parent) is ACKNOWLEDGED when its owner conversation was notified on a lane that reaches somebody (message/channel/user-inbox — a `stash` is not, a stash DRAINED into a resume is), an owner-lineage agent polled/showed/logged it after the terminal instant (a jbt_ self-read never counts), or the user expanded its row (`POST /api/jobs/:id/seen`); a new run clears it. The rail badge and both panel summaries count ONE PURE number (`src/lib/jobs-layout.js` `badgeCounts`): red = awaiting-user + UNACKNOWLEDGED failures, acknowledged failures are a grey "N seen". The Tasks section folds by owner session (the sidebar's display name, else the short id, else "created by you") then by NAME FAMILY (`familyOf`: a trailing ` run`, `-r<n>`, `-v<n>`, `-<n>` and version tails stripped until stable); a group row is a keyboard-reachable button (aria-expanded) showing count · running · failed (red unacked / grey seen) · latest age, expanded by default when it holds a running, awaiting-user or unacknowledged row, and the user's folds persist in user state `jobsPanelFolds` (merge-only PATCH, pruned to live groups) applied AFTER the defaults. A failed/missed/interrupted row shows its exit code and the LAST NON-EMPTY log line (`run.lastLine`, computed once at finalize, secret-redacted, ≤200 cp). Terminal one-shots are ARCHIVED into `data/jobs-archive.json` (done after `jobs.archiveDoneAfterHours`, failures after `jobs.archiveFailedAfterDays` SINCE THE ACK and never unacknowledged; sweep at boot + every 5 min on the engine's tick; newest 2000; poll/show/logs of an archived id still answer with `archived:true`; the panel's "Archived · N" row fetches only on click, ✕ deletes for good). Held notifications are TYPED on the stash (`held.kind` spend-cap / rate-floor / not-reachable / off / wrapper-no-steer — B-d963: a busy pre-2.369.63 codex wrapper that would queue it as a billed turn; the sentence says restart the session) and the summary, the rail tooltip and the affected conversation's status-bar chip say in plain words why they are held. Acknowledging lanes = every lane the delivery ladder answers ok:true on (claude inbox `message`, `channel`, codex's `rpc-queue`, `remote-message`) + `user-inbox` — the codex lane was missing until 2026-09-16 and every codex-owned failure stayed red; the archive write precedes the store flush, so a failed write (disk full / read-only) keeps every record live and retries.
- **Session folds + "Mark all seen" (2.369.121).** The Background Work Tasks section folds per owner SESSION (header = a button with chevron, ×count, running/awaiting/failed chips, age; persisted in `jobsPanelFolds` by the session key beside the family folds) and every session header plus the window toolbar carry "✓ Mark all seen (N)" — one batch `POST /api/jobs/seen` acknowledging every finished one-shot you have not looked at (never a service, a running job, an archived record); nothing is deleted. Gate: test-job-model.
- Agent-registered services/long-tasks/cron that OUTLIVE conversations; `vibespace-job` CLI + ⚙→Background Work window + `job-interact` panels. Key invariants: process identity pid+starttime+bootId (wrapper writes its own stamp first act; every adopt/kill re-verifies); adopt-first boot then desiredUp replay (services survive pod rebuilds by REPLAY — owner-accepted semantic; tasks die with the pod, cause env-restart); single-engine lock (data/jobs.lock, #127-class second server goes read-only); rm refuses live jobs; GC never touches a verifying-alive record; NO automatic agent triggering (owner red line — cron actions are spawn-task/notify only, poll is the interface, injection is passive at turn boundaries with a 600B budget); no existence oracle (invisible id ≡ nonexistent id, names scope-namespaced); user access-locks refuse agent edits; job/probe env credential-stripped + vendor-pattern create-time refusal (§ban-safety); secrets user-UI-only, values literal-redacted from tails; panels are declarative widgets — agent markup never enters our DOM. Cron spawn-task keeps ONE persistent child record — every fire is a run in its ring (×N chip); routine scheduled success is SILENT (ring entry only, no event/notify — 2.343.3, the 18-card flood report); failures/awaiting-user still surface. The boot collapse of pre-2.343.3 per-fire piles leaves in-memory id→survivor tombstones: polling a collapsed id answers "consolidated into <survivor> — vibespace-job poll <survivor>" but ONLY when the caller could see the survivor anyway (2.343.4 — the redirect must not become an existence oracle; an invisible family stays a plain not-found). **Owner auto-notify (2.344.0, B-0bf4)**: job terminal states / service park / cron missed / panel posted+answered MESSAGE the owner conversation through Claude Code's own cross-session messaging inbox (registry ~/.claude/sessions/<pid>.json + published key file; wire = auth frame + user frame; the CLI queues mid-turn, opens a turn when idle, bills like a typed prompt, applies its own inbound controls — never bypassed). Toggles: per-job `--notify on|off` > group tri-state (`jobNotify` in the group window, explicit OFF wins) > global `agents.jobNotify` (default ON); spawns pre-accept via `--settings {"crossSessionInbound":"accept"}` (bypass-mode sessions would otherwise hold unattested senders). Quiet-success cron runs and agent-initiated interrupts never notify; engine rate floor 30s/conversation + 10min identical-text dedupe. Unreachable owner → durable stash `data/job-notifications.json` (conversation-lineage keyed, 30/convo) injected at the next SessionStart/resume AND prompt-context (≤900B, endpoints survive, then cleared). Agent knows at create (`notify: {enabled, source, mode}` in the response + CLI echo); user sees it in Session Properties (Background Work section: effective state + deciding layer) and the job detail (last notify lane + age). EXPERIMENTAL `agents.vibespaceChannel` (default OFF) additionally registers data/bin/vibespace-channel.js as a Claude Code channel on new local claude spawns (--mcp-config + dev flag; research preview) — the deliver ladder prefers its per-session socket, falling through to the inbox lane. 2.344.1 review hardening: local-only gate is data.hostId (data.host was a dead field — fixture-shape class); PRE-2.344.0 live chat sessions get accept pushed via apply_flag_settings at boot (+5s/+60s passes; terminal sessions stash-only until respawn); missed {at} crons park terminally (desiredUp=false — the re-notify-forever loop); rate-floored DISTINCT events stash instead of dropping; read-only engine never flushes its stale snapshot (_save guard); _notifyRate bounded; channel-socks 0700 + boot sweep. Residual (documented, accepted): postToPeer ok = 'posted to the inbox', not 'read' (no delivery ack exists in the protocol; repo/managed settings can still tighten inbound); accept is spawn/push-applied and persists in a session after the global toggle turns off (toggle-off stops SENDING, which is the control that matters). 2.345.0: context echo fixed for the production {payload} shape (was typeof-string dead — live-E2E catch); SUBSCRIPTIONS — vibespace-job subscribe/unsubscribe, canView-gated, per-conversation-deduped, cap 10, cron-parent subscription covers child runs, explicit switch independent of group/global defaults, lastNotify stays owner-lane-only. 2.346.0: quiet-success is a DEFAULT not a law — --notify-ok opts scheduled successes into events+notify; vibespace-job announce \"text\" (jbt_ self or control-holders) = the watch-job verb, custom text through the normal lanes + event ring (exit codes ≠ newsworthiness); drained stashes >2 entries spill untruncated to data/job-notifications-read/<cid>.md and every truncated injection form carries the path (14d GC, 256KB head-trim). 2.347.0: per-subscriber regex filters (--filter, panel-pattern rules, fail-closed, re-subscribe updates own filter); vibespace-job show <id> = full registration self-inspection, list --mine/--subscribed; teaching updated in ALL THREE renderers together (the twin-set law). 2.348.1 inbox UX (live-demo field report): For you rows for jobs show the JOB name (never the phantom 'Background Work' session) and carry jobId — clicking opens the Interaction Panel DIRECTLY (window is the no-jobId fallback). 2.352.0: port scans name docker containers (docker ps port table fills rows ss -p can't see — other-user/root sockets; one enrichment for local+remote); Active-forward rows render the service:<name> label chip. 2.351.1: job cards backfill externally-published URLs (Ports-panel publish on a declared port → same ↗ chip via read-only snapshot enrichment, publishedExternally flag). 2.351.0: vibespace-docs [topic] = full manuals for ALL agent tools + global index (docs/agent/*-manual.md via /api/agent/docs/:topic; new static CLI in AGENT_TOOLS; jbt_ may read too). 2.350.0: vibespace-job docs = full on-demand manual served from the server checkout (docs/agent/background-work-manual.md via /api/agent/jobs-docs; teaching carries one pointer line); inbox gives Background Work its OWN section (after session groups, never a phantom session) and panel answers/expiry/rm auto-resolve its items (userTodos.resolveByJob); scan-row forward match uses remotePort (f.port was the fixture-shape class, 4th instance). 2.351.2: peer deliveries have TWO shapes — idle wake = user record; MID-TURN queue = JSONL-only attachment/queued_command with STRING prompt + origin.kind='peer' (no live-stream record, upstream) — both now render the peer card; mid-turn ones appear on reopen/rebuild only. 2.349.0: peer deliveries render as a distinct chat card (origin.kind='peer' — the isMeta invisible path hid what woke the agent; JSONL-forensic pin, provenance law extended); scanned ports with an active forward show forwarded/published chips and lose the redundant arrow. 2.348.0 announce audience VERDICT (owner): viewers get announces PASSIVELY only (next injection, never a wake) with per-job coalescing in renderJobsUpdate (×N+latest = one line per noisy job, lifecycle events never crowded out); directed messages stay owner+filtered-subscribers. **2026-09-07 — a notification is TYPED, and on codex it STEERS**: every owner/subscriber delivery goes out as `kind:'notification'` (the ladder's frame field), so a busy codex session injects it into the RUNNING turn (`turn/steer`, carrying only itself — the input queue is untouched) instead of adding a turn behind it; the incident was a session holding 20 job notifications as 20 queued submissions = 20 billed turns. See *Sending during a turn: QUEUED vs STEERED* for the full rule and the upstream sources. Unchanged by it: the **30s per-conversation floor** and the stash. They are what turn a burst into a batch — only the first distinct event of a burst is posted and the rest are stashed, and the stash is drained by the injection routes as **ONE rendered block** riding the conversation's next turn (`renderNotifStash`), never handed back to the delivery ladder entry by entry. A steer that is refused (turn ended mid-flight, review/compact turn) falls back to the queue/turn lane and the wrapper's result NAMES the refusal (`steerFailed`), which the server logs — a queued notification is visible, never a silent divergence.

### Communication panel — Channels v2 (P0a, docs/design-communication-panel.zh.md is the authoritative design)

**What P0a ships, and nothing more.** The channels CORE: the store, the
capability model, the adapter interface with a fake adapter that really runs
all three receive modes, the ingest engine's skeleton, the routes, the sidebar
rail panel and an (almost) empty conversation window. **No Lark, no Gmail, no
assignment, no filter, no wake, no outbox** — those were later phases (P1a/P1b/P2/P3
below) and were deliberately ABSENT rather than stubbed, because a declared-but-inert slot is
the failure this design argues against.

- **The rail panel** (`channels`, six registrations in `src/lib/sidebar-rail.js`)
  — **since g3 (2.369.159) the first screen is the GROUP LIST and what follows
  here lives in its Accounts / Message watcher sections (see "THE IM MODEL"
  below)**: adapters as sections, their conversations as rows, an unread badge on the
  rail icon computed from the digest the engine ALREADY broadcasts (one probe
  at page load; unlike ports/hosts/jobs it never re-fetches).
- **EVERY ROW CARRIES A FRESHNESS CHIP** — "live" / "within 30s" / "scanned 4m
  ago". It is not decoration: it is the one number a user needs before handing
  something to a lane, and it is rendered from the lane ACTUALLY carrying the
  row (`laneState` / `scanState`), never from what the adapter declared. A
  demoted or dead push lane draws the poll cadence it is really on. **It is in
  the reader's own language**: the server sends the CLAIM (`{kind, state,
  seconds}`) and the client composes the sentence, because the digest is
  broadcast to every client at once while the language is per DEVICE — a
  sentence composed server-side is English for everybody by construction, which
  is how nine of these strings once shipped English-only to a zh/ja UI.
  **And a row nothing will ever fetch says so (r3)**: an untracked row — the
  default state of every discovered conversation, i.e. every row a fresh
  instance shows — and any row of a disabled adapter read "not polling" /
  "not scanning", never "within 5m" about a fetch that would never happen.
- **The scan lane's chip and its log agree, in both directions (r3).** A scan
  pass refreshes the machine facts (`scan.hostFacts`) unconditionally before
  it ingests — they had no producer at all, so the resolver could only ever
  answer "not scanning" while records were ingested anyway, the anchor
  advanced and the badge lit. Now nothing is ingested through a scan lane the
  resolver gives no source for (client absent, grant refused, facts stale,
  platform undeclared), the source it chose is the one the adapter reads, and
  a refused lane is a named answer on the chip, not a failed pass.
- **TRACKING IS OPT-IN** (design §5 invariant 6). Discovery only ANNOUNCES
  conversations; nothing is fetched for one until you track it. A privacy
  decision, a cost decision, and what keeps this a panel rather than a mail
  client — the row says "not tracked" rather than showing an empty list.
- **A conversation opens as a WINDOW** (`registerWindowType({type:'channel'})`),
  singleton per CONVERSATION, restored from its openSpec after a restart and
  synced to every client. It renders PLAIN TEXT only, through textContent — a
  vendor body is hostile input and syncs everywhere (rich rendering is a later
  phase and its home is the published-pages sandbox-iframe pattern).
- **THE SEND CONTROL EXISTS ONLY IF `offers()` SAYS SO**, and that answer
  needs BOTH the adapter's static `caps` and this conversation's own
  `convCaps`. On a read-only conversation there is NO composer element at all
  and the bar says why. On a sendable one the composer appears; since P3 it
  PROPOSES through the outbox and its note names the policy (review / direct)
  that governs the reply — a button that silently does nothing is worse than none.
- **Marking read is something the USER did.** The window marks a conversation
  read when it OPENS and when you touch it — never as a side effect of a
  repaint. (A repaint-driven POST and an unconditional broadcast form a loop:
  the engine notifies, the window re-renders, the render POSTs, the POST
  notifies. Measured at ~490 requests a second, for ever, with ONE window open
  and nobody touching anything — and it rewrote the read mark ~500 times a
  second, destroying the thing it was setting.) "Read" means "I have seen
  everything this conversation holds", so the instant is the newest record's:
  a vendor may stamp a record ahead of our clock, and with `now()` those stay
  unread for ever. **And it really is the newest record's, for records
  stamped in the past too (r3)** — every real adapter's — so a message
  stamped before the mark but fetched after it (the routine poll-interval
  shape) stays unread and badges instead of being silently marked read.
- **Tracking a conversation reaches every client at once (r3)** — including
  the one that clicked — even when the adapter's request budget cannot afford
  the pass it kicks; the flag used to land on disk with no broadcast until the
  next scheduled pass, up to five minutes later.
- **A conversation window is titled with the conversation (r3).** Every
  channel window used to read "Channel" in its title bar, taskbar entry and
  tab label, so two open conversations were indistinguishable.
- **Nothing is fetched for a CLOSED window.** Closing a conversation window
  removes its broadcast listener by name, so it stops fetching, stops POSTing
  and releases its DOM — the teardown used to be a silent no-op and a closed
  window kept overwriting the user's unread mark.
- **A conversation's whole history is reachable.** History pages on a
  `(at, vendorId)` total order rather than on the timestamp alone: message
  timestamps are NOT unique (a Lark burst shares a millisecond, Gmail's
  `internalDate` is second-derived) and paging on `at` with a strict `<` left
  one record per equal-timestamp group permanently unreachable — on disk, and
  no way to scroll back to it. **And the reader seeks as far back as the
  writer keeps (r3)**: it used to read only the newest 2 MiB, so once the
  window's paging walked past that every page came back empty while retention
  (5,000 records / 90 days) deliberately kept the rest — 375 of 3,000 ordinary
  chat lines unreachable at 2.28 MiB. **A log left ending in half a line by an
  interrupted append** (ENOSPC, a SIGKILL, a power loss) is sealed before the
  next append, so the re-offered batch never glues its first record onto the
  fragment; before r3 that record was unreadable on disk and then "already
  held" by the dedup set — one message lost for ever, silently. **And the
  mirror shape (r4)**: an interrupted append that stopped exactly on a record
  boundary left a complete record on disk that the live dedup set still
  called absent, so the same process re-offered the batch and the log served
  that message TWICE for ever (a phantom in `unread` and in paging; a restart
  was already correct). A failed append now drops the cached set and the
  retry re-derives it from the log — the log is the only witness to what a
  failed write landed. **And the rebuild refuses a log it cannot read (r5)**:
  that rebuild used to read EMFILE/EIO/EACCES as an EMPTY log and cache the
  empty set, so the post-restart first pass of a tracked conversation could
  write a replayed page twice for ever; now only ENOENT means "no log yet",
  any other read error fails the pass (the anchor stays, the retry re-reads)
  and caches nothing.
- **A failing adapter SAYS SO, and keeps saying it.** After three consecutive
  failed passes the adapter row goes amber and names the vendor's own code
  (`auth-expired`, `rate-limited`, …). That row is the honesty signal that
  compensates for a static freshness chip, and it survives a healthy adapter
  passing beside it — `adapters.json` has one in-memory owner and one
  serialized write door, exactly like the index. An adapter's connection state
  is likewise RESOLVED (`connected` / `expired` / `unknown` + a reason), never
  asserted: P0a's fakes authenticate against nothing and the panel says so.
- **A conversation nobody has discovered cannot be tracked or marked read** —
  those routes answer 404 rather than minting an invisible row in the index.
- **The fake adapter is registered always and instantiated never**, unless
  `VIBESPACE_CHANNELS_FAKE=1`. Registering it keeps the contract suite driving
  real code; creating records for it would put invented conversations in a
  user's panel. It talks to NOTHING: its traffic is generated deterministically
  from a fixed seed, so the same conversations come back after a restart and on
  a second client. Three kinds exercise both capability axes — `fake-poll`
  (sendable), `fake-push` (a real live lane, and READ-ONLY, which is how the
  no-send-control rule is observable at all) and `fake-scan` (both sources:
  `store` with the client's own ids, `ui` with DECLARED synthetic keys).
- **`contributes.channelAdapters`** is now a RESERVED plugin contribution key:
  a plugin declaring one gets the honest "reserved for a later phase — ignored"
  warning instead of silence (third-party adapters are the right eventual home;
  v1 keeps them in the tree because the receive path must run beside the store
  and the spend guard).

### Communication panel — P1a: Lark + Gmail READ adapters, the consent flow, failures spoken (2026-09-16)

- **Two real adapters** register beside the fakes and nothing downstream
  learns their names: `src/channels/lark.js` (Feishu/Lark, user token, a
  FIXED loopback callback registered in the app console) and
  `src/channels/gmail.js` (an EPHEMERAL loopback port; the OAuth client is
  the cluster's `VIBESPACE_GDRIVE_CLIENTS` preset `channels` or the user's
  own, decision 5). Both take their application credential from
  `resolveIntegration()` and never from env.
- **Connect** (`POST /api/channels/adapters/:kind/connect`) creates the
  record and starts the vendor consent flow through `src/oauth-loopback.js`;
  on a machine where the browser cannot reach the loopback (a remote
  browser, or Lark's fixed port held by another VibeSpace) the user pastes
  the redirect URL back (`/auth/finish`). A row whose credential resolves
  to `none` is refused `409 needs-credentials` BEFORE any consent page — the
  client opens the Integrations card for that row instead (§10.1).
- **Auth is four-valued and honest**: `connected` / `needs-reauth` (a dead or
  refused refresh token, with the expiry where the vendor states one — Lark
  does, Google does not) / `needs-credentials` (the application credential
  is gone, however fresh the token) / `unknown` (never authenticated).
- **Ingest**: Lark pages newest-first to the stored anchor (a burst day is
  several pages and the anchor advances only after a complete pass); Gmail
  runs one `history.list` per pass and walks only the threads it names,
  reseeding on a 404 and skipping a dead thread rather than freezing.
- **Failures reach the user**: after 3 consecutive failed passes the row goes
  amber AND one "For you" item is filed naming the adapter, the failure code,
  the vendor's own words and what to do; the same engine retracts it on the
  first passing pass (or on disconnect). A never-connected record files
  nothing — it has nothing to pass with.
- **Options** are per record and DECLARED by the adapter (Gmail's include
  query `label:INBOX`, Lark's brand); an undeclared key is refused by name.
- **The panel** (rail → Channels) carries the adapter's own controls on its
  section: a Connect row per not-yet-connected kind worded by the credential
  facts (none ⇒ the Integrations card opens first; cluster ⇒ "Provided by the
  cluster"), a consent-flow dialog with the consent link + paste-back + Cancel,
  the four-valued auth line with a `re-authorize in <eta>` countdown and a
  Re-authorize verb, a Track… picker (checkbox per discovered conversation),
  an Options editor over the declared schema, Disconnect (confirmed) and
  Enable/Disable; zh + ja shipped.
- **Egress is censused**: every vendor host a channel adapter constructs a
  request to is declared in its `EGRESS` list, and `test-channels-egress`
  fails any other file constructing an outbound request unless it is on the
  allowlist WITH a reason (seeded at birth with `src/gmail-sync.js` and
  `src/mounts.js`, §3.1); dead allowlist entries fail too.

### Communication panel — P1b: the push lane (2026-09-16; design §6.4, fence 11, decisions 18 + 20)

- **Both real adapters declare `receive:'push'`**: Lark over the official
  SDK's long connection (no public URL; the app credential from
  `resolveIntegration('lark')`; the SDK is required lazily — an instance
  without it shows "push unavailable: … not installed" and polls), Gmail over
  `users.watch` + a Cloud Pub/Sub PULL subscription of this instance — OFF by
  default (decision 20), turned on under Push… and configured through the
  `pushTopic` / `pushSubscription` options; enabling it adds the `pubsub`
  scope to the next Re-authorize, which the lane requires by name.
- **Which lane carries a conversation is `laneState()`'s answer alone**:
  DEMOTED > LIVE > CLAIM. Liveness is positive evidence (a handshake or a
  heard frame inside `PUSH_HEARTBEAT_MS`); a silent lane reads "push silent
  for <age> — polling at the fast cadence until it speaks".
- **The ack comes AFTER durability (fence 11)**: a pushed record is in the
  append-only log before the vendor is answered; the index and the ONE
  broadcast per batch follow; a replayed event id is acked and absorbed; a
  crash between the persist and the index step loses nothing (the
  reconciliation poll finds the record already there).
- **Exclusivity is DECLARED, MEASURED and WITHDRAWN**: the operator declares
  it in Push… (`unknown` = declare nothing = cursor kicks, the default;
  `shared` = kicks; `exclusive` = push carries messages and the poll
  reconciles every 15 min). While push carries content, every record the
  reconciliation poll sees first is a miss; past 2 % over 20 judged records
  in a rolling window (24 h or the last 200 records, whichever is larger) the
  lane demotes itself: the row says "push is not exclusive here — fell back
  to cursor kicks, polling returned to the fast cadence (12 of 42 records,
  28.6%, were first seen by the reconciliation poll)", the log says it once,
  the connection stays up as a kick lane, kick mode adds NO sample, and the
  lane never climbs back by itself — "Re-declare exclusive and retry" (or
  saving the claim in Push…) zeroes the counters and retries the lane once.
- **A stopped lane acks nothing**: switching push off, disabling or
  disconnecting the adapter, re-declaring, or changing a lane option stops
  the lane terminally and (when still wanted) arms a fresh one.
- **A permanent failure inside a connection PARKS the lane** (`unavailable`,
  named: a 403/404 Pub/Sub pull, a refused watch renewal, three transient
  renewal misses in a row) — no reconnect loop, the row says why; a transient
  pull failure backs off and retries (2026-09-16).

### Communication panel — P2: assign, filter, wake (2026-09-16; design §7, fences 2 + 12, decisions 9/10/16)

- **A tracked conversation can be ASSIGNED** (panel row menu / window bar →
  "Assign & filter…") to a live agent session or to a task group (round-robin
  over the group's live members; no live member ⇒ the hits wait for its next
  turn, never "wake them all"). Assignment implies reach: ONE explicit
  `origin:'assignment'` grant is written and unassign removes only that row.
- **What wakes them**: every message, or a FILTER of closed rule kinds
  (mention / keyword / sender is one of / from / subject / has attachment /
  does not contain / time window; match any or every). The editor shows a
  LIVE estimate from the server over the stored history — "~4/day would wake
  (of ~30/day)" — and prints its caveats (`only N days of history are stored`,
  `only the newest N records were read`); once assigned it shows the
  after-the-fact measurement beside it ("estimated ~4/day when set; actually
  6/day since"). The wake the agent receives NAMES the rule that fired
  (`matched: mention @on-call, keyword "GPU"`), and the panel shows the same
  string.
- **How**: a wake per batch, or one digest per window (5 min … 24 h). A poll
  or scan pass is already a batch (one wake for a day's burst); a push lane
  delivering one message at a time is COALESCED for
  `channels.pushCoalesceSeconds` (Settings → Channels, default 60, 0 = wake
  per message) before the wake decision, so "turn on real-time push" never
  multiplies a bill by a burst. Measured: one day of traffic through push,
  poll and scan ⇒ the same 40 records, ONE wake each with the same 12 hits,
  ONE charge each on the credential slot; with the window off the push lane
  wakes and charges 12×.
- **Who pays, and how much**: a wake is a turn nobody typed, so it goes
  through the ONE delivery ladder with the declared reason `channel-message`
  — the spend authorizer inside it is the money bound (per credential slot,
  across restarts), the per-assignment daily wake cap is PACING (a refused
  batch is HELD and rides the next wake, never dropped), the ladder's own
  floor is flood control. A wake the ladder refuses (budget, unreachable) is
  stashed into the agent's next injection — nothing is lost. Held or stashed
  wakes are said on the row (amber) and in the editor.
- **Authority** is `draft` by default; `send` is offered ONLY when the
  channel does not require review (decision 9: external = review, every v1
  adapter) AND the conversation offers a send lane — otherwise the option is
  not drawn and the reason is; a stored `send` the policy now forbids reads
  as draft with the reason (the user re-chooses).
- **The honest latency line**: "Wakes arrive within ~1m — push carries
  messages here; hits are coalesced for 60 s so a burst is one wake" /
  "…within ~30s — this conversation is polled" (the hot cadence an assigned
  row actually gets) / "…within ~15s — read by a scan of the local client" /
  "…within ~15m — the poll is on its reconciliation cadence while push is
  declared exclusive".
- Leftover hits survive a restart (persisted on the index) and are delivered
  as one digest shortly after boot — exactly once: wakes on one conversation
  are serialized and a wake clears only the hits it carried (2026-09-16).
- A wake the ladder refused reaches the agent WHOLE through the stash drain
  (every hit, never re-clipped to 400 chars); what does not fit one drain
  rides the next, never dropped (2026-09-16).

### Communication panel — P3: outbox, approval, receipts (2026-09-16; design §8, §9, §11, §12.3; decisions 7/8/9/11/16/17)

- **A reply is a PROPOSAL.** An agent (`vibespace-channels reply`) or the user
  (the conversation window's composer) proposes; `src/channel-policy.js`
  decides `direct` or `review`: the channel's policy (own > the adapter's
  default > review) is the base and the guards — a link, an attachment,
  off-hours (only when `channels.offHoursTz` is set), draft-only authority —
  can only tighten it; an unreadable policy or guard is review (fail closed).
- **Two surfaces, one store.** The approval card is rendered inline in the
  conversation window and in the singleton Outbox window (⚙ → Outbox…, the
  panel's Outbox button with the awaiting count) from the same store; approve
  (optionally edited — both texts kept, the receipt says `edited`), reject
  with a reason, or let it expire (24 h). The rail badge counts unread +
  awaiting.
- **The identity row is on every card**: "Will send as you/the bot", and when
  the adapter's `identityMarking` is `marked` or `unknown` a warning with the
  adapter's verbatim sentence (or that it is unverified). The message body
  carries NO honesty line by default (decision 17 overruled): the truth is
  owed to the one approving and the one drafting, never pushed into the
  recipient's message.
- **One "For you" pointer per conversation** (count-free text, count in
  detail, `pendingTodoId` persisted on the row, retracted by the engine when
  the last proposal leaves awaiting-approval; an inbox throw degrades to the
  badge + Outbox window).
- **Approval re-resolves `convCaps` unconditionally** before the send; a
  conversation that no longer accepts messages refuses with
  `send-not-available` + the adapter's reason, the proposal fails, the
  receipt carries the reason verbatim.
- **Exactly-once.** An audit ATTEMPT line before the request, an OUTCOME line
  after; a thrown send is `unknown`, never auto-retried — the user is asked
  to check the platform.
- **The receipt** (`sent`/`edited`/`rejected`/`expired`/`failed`, with
  `sentAs` / `identityMarking` / `identityMarkingText`) reaches the drafting
  agent through the delivery ladder with `noWake` — only into a turn already
  running, else stashed for its next turn — unless the assignment's
  "Wake the agent with each outbox receipt" opted in (decision 8). Every
  vendor-controlled field of the receipt block (title, label, vendor id,
  sentAs) is frame-inert and single-line — the wake block's rule (2026-09-16).
- **Audit** (`data/channels/audit.ndjson`): `draftedBy` / `approvedBy` /
  `sentAs` / `identityMarking` on every outbox line; it never leaves the
  instance.
- **AgentReach** (row menu / window bar → "Reach & policy…"): every grant
  with its origin (you granted / by assignment / you approved a request),
  user rows removable, grants to a live session or a Task Group, open access
  requests (`vibespace-channels request`, one For-you item with the reason)
  approved into exactly one visible grant; everything hidden by default,
  hidden ≡ nonexistent for an agent.
- **The built-in Agents adapter** lists live agent sessions as conversations
  (reach = the msg-acl answer), sends through the delivery ladder as the
  user's own message (policy default `direct`), and marks its identity
  `marked` / recipient-ui.
- **P4 — real external send (§9.4 / §9.5).** Lark and Gmail now send as the
  USER; until the held token carries the send scope(s) the composer's footer
  says what unlocks it (reconnect; on Lark also enable the two dotted scopes
  + publish a version) instead of a greyed control. Lark sends carry the
  vendor `uuid` = the proposal id; Gmail sends are two-phase (a draft in the
  thread, then its send, threading headers off the anchor). A send whose
  answer was LOST is `unknown` — never "failed", never re-sent — and the
  card offers **Check outcome** (only where the adapter declares an
  idempotency mechanism): landed ⇒ sent with the receipt, the For-you item
  retracted; not landed ⇒ failed; else still unknown with the count of
  checks. A proposal the server died on mid-send is `unknown` at boot. **The
  sender honesty line is OFF by default** (Settings → Channels, per-channel
  override on the panel row): when on, an agent-drafted message ends with
  one line naming the agent — the card says so BEFORE approval, the receipt
  after; your own drafts never get one. The panel row shows the platform's
  own attribution of the last real send (the §21-item-3 proof; Lark's
  declaration stays `unknown` in code until an owner-run real send is read).

### Communication panel — a3 i18n: the codes cross the wire, the client says the words (2026-09-18; owner "似乎没太做好 i18n"; docs/design-communication-panel-polish-audit.md §1)

- **No English leaves the server as chrome.** The a1 audit found the eight
  surfaces' `t()` coverage at 368/369 and the leaked English elsewhere: codes
  printed raw (`token-expired`, `NO-STORE-ON-PLATFORM`, `rpc-queue`), engine
  sentences shown verbatim (`outcome unknown: …`, `forbidden: …`, the
  store's `the cluster provides no default…`), the built-in row's seeded
  `user: 'you'`, and the adapters' / the registry's DECLARED labels and help.
  Each is now STRUCTURE the client words: `outcome` on a proposal, `whyCode`
  + `whyParams` on a credential, `auth.self`, `authorityWhyCap`,
  `reconcileWhyCode`, `adapterLabel`; the code composers live in the PURE
  modules (channel-caps / channel-policy / channel-filter /
  integration-registry) and every route failure toasts by `code`
  (`src/lib/channel-words.js`). An agent's contract strings (`p.reason`, the
  receipt, the CLI's output) stay English on purpose.
- **A declared string is a key.** `i18nKey(…)` marks a human-visible string
  in a PURE data module (registry rows, adapter OPTIONS); the extractor
  collects it beside `t()` so the dictionaries' census sees it; zh + ja carry
  every one (144 new keys; 45 zh / 24 ja entries re-worded — 发件箱 / 送信箱
  for Outbox, 提案 for proposal, 频道 for channel, 适配器 for adapter, 审批
  for review-as-a-verb; `tc('policy', …)` for the policy mode).
- **Two wording fixes that were product bugs:** an UNTRACKED conversation's
  footer says "Not tracked — messages are fetched once you track it." with
  the Track verb (it said "the send capability is not known yet"); a Task
  Group is named by its `title` (the store has no `name`, so every group
  showed as its id in the Assign / Reach editors — pinned by
  test-channels-e2e ⑮ since r4).
- **r4 (2026-09-21, the verifier's i18n leaks):** the filter validator's
  refusal carries a `code` (+ the rule kind) beside its English contract
  sentence and the editor words it (`filterProblemText`) — "Add rule" no
  longer prints `keyword: value is required` under zh/ja; every "For you"
  item the channels engine files (the pointer, an access request, an
  unknown outcome, the failure headline) rides as `i18n` STRUCTURE the
  inbox words with the device's t() (the English text stays the dedupe key
  and the CLI's contract); the needs-credentials line words a code on every
  path (a self-resolving adapter's `auth.whyCode`), never the store's raw
  sentence; the state-dot tooltip's instant uses `deviceLocale()`.
- **Gate:** scripts/test-channels-i18n.mjs (heavy) drives the a1 driver at
  zh AND ja over all eight surfaces and asserts ZERO Latin-only visible text
  nodes outside a PRINTED allowlist (proper nouns, URLs, ids, the fixture's
  own data by DOM path); a planted English literal turns it red.

### Communication panel — a4 UI design: hierarchy, rhythm, icons, empty states, the stepper, the card, the Outbox views, the phone (2026-09-21; owner "界面很乱，没有层次，你需要用前端技能+实际渲染截图好好设计优化一下"; docs/design-communication-panel-ui.md §4 = the spec, direction A)

- **The panel is a list, not a control panel.** Bar (`{n} conversations ·
  {k} tracked` + the Outbox button: outbox glyph · label · accent count — the
  label hides under a 200px container because the 260px default sidebar
  leaves 172px for the bar, measured) → one collapsible `folder-header`
  section per adapter (chevron · kind glyph · name · 6px state dot with the
  lane in its tooltip · `tracked/total` · ⋯) → rows as bordered
  `session-item-card`s on ONE grid: line 1 = title + the ONE freshness pill,
  line 2 = participants + the needs-you badges right-aligned (awaiting =
  accent-outline pill with a check glyph, unread = accent count, `not
  tracked` as 9px text), line 3 only when assigned. Every adapter verb is in
  the section's ⋯ menu (`channel-adapter`, state-driven; the Sender line is a
  checkable row); a status line exists ONLY when the adapter has something
  to say beyond "connected", wraps at 10px and carries its one verb, amber
  when it needs the user. Under a 180px container the two badges collapse to
  one accent pill carrying their sum (tooltip = the breakdown). A fresh
  instance is `.empty-hint` + the Connect section of full-width `mounts-btn`
  rows with the credential path as the note under each. The panel is a
  NAMED container (`chan-panel`) — the rows are inline-size containers
  themselves, so an unnamed query collapsed the badge pair at the default
  width (round 3); the day separator's date follows the device's language
  (`deviceLocale()`), never the browser's.
- **One colour per meaning (§4.3).** Accent = needs you (unread fill,
  awaiting outline, the card's awaiting pill), green = live evidence / sent,
  neutral tint = an age / rejected, amber = a warning / `unknown` (the one
  outcome that is NOT a failure), red = failed. Text on a tint uses the
  meaning tokens `--ok-text` / `--warn-text` / `--bad-text` / `--attn-text`
  (the raw hue mixed toward `--text`) so both themes clear AA at 9–11px; blue
  left the feature. Every glyph is an SVG from src/lib/icons.js through
  `channel-chrome.js icon()` (chat / mail / robot / more / chevron / check /
  alert / outbox / filter / reach / connect / plus / copy / external / info).
- **The connect wizard is a stepper** (Credential ✓ → Consent → Track): the
  consent page as the ONE primary button beside Copy link, the port-busy
  refusal as a NAMED amber line with the alert glyph, paste-back as a
  collapsed step that opens itself when nothing listens, and a finished flow
  turns into step 3 — the Track picker — in the same dialog.
- **The card is five lines**: state pill · drafter · age → text → ONE meta
  line (why · needs approval · will send as · expires · the sender line) →
  the identity warning ONCE, only when it warns → outcome → a quiet footer
  (reconcile facts, receipt) → reject · edit · approve right-aligned with one
  primary. The inline section shows the cards that need the user plus the
  newest two decided ones and links the rest to the Outbox; the Outbox
  window is a toolbar (summary + Awaiting | All) over cards, All grouped by
  STATE with a dot per head.
- **The editors on the house form rhythm**: short fields paired on a
  two-column grid, rule rows with their own kind selector + ×, Add rule
  under the list, the estimate as ONE bold stat with its honesty as the hint
  under it, the receipt-wake row a `dialog-check-row`; the reach dialog is
  one bordered list (who · neutral level pill · origin · ×) with grants named
  from the roster; one 520px width token for the whole family.
- **Integrations**: an undecryptable row is a state chip + one sentence; the
  Test verdict is one line; the copy button has the copy glyph; field help is
  an info affordance (tooltip + tap-to-show) instead of a paragraph per field.
- **The phone (≤480px)**: rows pad `8px 10px`, every card / composer /
  footer / dialog button is ≥36px tall, the editors' grids become one column,
  the card's three actions stay on one row; nothing scrolls sideways at
  375px (test-channels-e2e ⑫ b).
- **No behaviour change**: the freshness-chip honesty contract, the
  read-mark rule (a user action, never a repaint), frame neutering and
  `escHtml` / textContent on every wire string are byte-for-byte in meaning.
- **r4 (2026-09-21, the verifier's findings on the build, each reproduced
  on the rendered chrome):** the panel REPAINTS IN PLACE — the rail no
  longer tears it down on every broadcast, `draw()` swaps one fragment and
  keeps the scroller where the user left it, zero refetches (a1 D12 was
  still open: 7 teardowns / 7 fetches / scroll 0 for 7 broadcasts); an
  UNTRACKED row carries NO freshness pill (§4.3 — its `not tracked` text is
  the claim; the pill there was the one that truncated ja's negation) and a
  tracked row's pill never shrinks (the title yields first, the pill
  ellipsizes only past the title's floor; ja off words shortened); the
  warning line's alert glyph is a fixed slot beside its sentence (the
  `> span` rule had made it a 124px box); the 200px rail hides the pill and
  the section name (tooltips carry both) and keeps the count; the
  assignment line's `→` became the filter glyph. Gates: test-channels-e2e
  ⑬ (repaint in place) · ⑭ (glyph ≤ 8px from its sentence at 260/340/500) ·
  ⑮ (group title) · ⑯ (every tracked pill whole at 260 in zh/ja/en, none on
  an untracked row).
- **Gates**: test-channels-e2e ⑫ (row grid ±1px, 375px overflow, SVG-only
  glyphs, five distinct state colours + unknown ≠ failed, age pills neutral /
  live green) + the moved legs (the Sender line through the ⋯ menu, reject
  by `data-reject`); test-channels-i18n (zh + ja census over the new chrome);
  test-integrations-ui; scripts/dbg-comm-surfaces.mjs for the BEFORE/AFTER.

### Communication panel — agent GROUPS, g1: the model + the engine (2.369.159; design-communication-panel.zh.md §22, owner rulings D1/D2 + §22.5)

- **A group exists only because somebody made it (D1).** `vibespace-msg group create <name> <member…> [--context "…"] [--quiet]` (an agent), `POST /api/channel-groups` (the owner), or `vibespace-msg send <agent> "…"`, which finds-or-creates the TWO-MEMBER group of that pair (the same pair is always the same group, from either side). No group per Task Group (the owner's spam ruling). Members are keyed by conversation id (a resume keeps them); the owner is the implicit member of every group and is never stored. Reach to invite = msg-acl (`messageable`), judged from the inviter; a miss is the uniform "not found or not reachable" and refuses the whole call.
- **Who is woken is each member's own choice (D2).** `notify` per (group, member): **next-turn** (default) — new messages become ONE report in that member's next USER-initiated turn, as context, zero billed turns · **mention** — an @name wakes it now · **always** — every message wakes it · **mute** — nothing (`read` on purpose). An @mention wakes every mode but mute; an invite wakes the invitee unless `--quiet`; `send --wake` = an @ of every other member. A member sets its own (`group notify`); the owner sets anyone's. **A wake is a billed turn**: it goes down THE delivery ladder (`peer-message`), the spend authorizer decides, and a refusal is journaled (`audit.ndjson` kind `group-wake`) while the message stays in the log and rides the member's next report.
- **What a member is handed.** The report holds only messages after its JOIN (the invite context first), newest kept under 2 KiB per group / 4 KiB per turn, with `vibespace-msg read <group> --before <ts>` named when older ones were clipped — never the whole history. It rides `prompt-context` only on a turn a PERSON started (the session's `_userInputAt` vs `_machineInputAt`); a machine-started turn (a wake, a job notification, auto-resume) leaves it for the next user turn, so N agents cannot talk each other into an echo chamber on the owner's money.
- **Membership.** invite (members only, duplicate = a no-op with a word, N invitees = N wakes echoed as a count) · leave · kick (the creator or the owner) · rename · archive (keeps the log) · a direct group that loses a side is archived and the next `send` starts a new one; a direct group takes no third member (make a group).
- **Storage.** `data/channels/groups.json` through channel-store's serialized door; each group's log is an ordinary append-only conversation log `data/channels/msgs/groups/<groupId>.ndjson` (the ChannelRecord shape; system records for create / invite / leave / kick / rename / archive). Every change broadcasts `channel-groups-updated`.
- **The agent CLI (g2).** `vibespace-msg group list` (= `groups`) · `group create|invite|leave|kick|rename|archive|notify` · `read <group> [--before <ts>] [--limit n]` · `send <group|agent> "…" [--wake]`. Every answer ECHOES the wake count — `woke 2 agents = 2 billed turns` (0 said too, refused wakes "not billed"); members/groups named by id OR name, resolved server-side, an ambiguous name refused WITH the candidate ids; every refusal = its typed code + the remedy, exit 1 (2 outside a session, 3 server gone). A Background Work job (`VIBESPACE_JOB_TOKEN`) speaks as its owner conversation and may list / read / send (into an existing group or direct group) — never create or change membership (`job-token`). The manual (`vibespace-docs msg`) opens with a `## Groups` section in the owner's words; the Reporting-back teaching every Task-Group session gets carries ONE pointer line. Gate: `test-msg-cli-groups` (fast).
- **r1 (the verifier's round).** A wake is paced whatever caused it: an @mention, `--wake`, an invite or an `always` member — one wake per (sender, receiving conversation) per 30 s, keyed by the conversation, never by how the target was typed; a floored wake is said like an authorizer refusal (not billed, the message still lands and rides the next report). A group named like a session never shadows `send <that session>` — the bare name is refused `ambiguous` with both ids. kick / notify by a name two members share is refused `ambiguous`. A next-turn report is never cut after its marker moves: each report's whole text fits its budget (long group names are clipped, the foot shortened), the section fits whole or waits. A focus-in / cursor answer from a terminal is not a person typing. A CJK name followed by CJK text (`@测试请看`) is a mention. A session that has no conversation id yet cannot send (409, try after its first turn) instead of waking the receiver through the pre-groups lane.
- **Not in g1/g2/g3:** sub-threads, avatars/announcements, cross-instance groups (a remote agent is not a member yet). Gate: `test-channel-groups` (fast).

### Communication panel — THE IM MODEL, g3: the group list first, the owner's own words direct (2.369.159; design-communication-panel.zh.md §22, the owner's clarification "the first screen is the group list — a simple IM")

**The panel is an IM, not a feed of sources.** Every group has at least two members — an agent group is ≥ 2 agents plus the owner as the observer; a Lark chat / Gmail thread is the owner and the other side, with agents as the owner's delegates — and the first screen shows the conversation history of each.

- **The first screen is the GROUP LIST.** ONE list of every agent group and every TRACKED conversation of a connected account (Lark chats, Gmail threads), sorted by last activity; a row = the source glyph · the name · the time, then a source chip (`Agents`, `Direct` for a two-member group, or the account's label) · the last line · the unread count. Archived groups fold apart ("Archived groups (n)"). An UNTRACKED conversation is not in it (nothing has been fetched, so there is no history to show — Track it in its account). The list repaints in place from the two broadcasts; nothing is fetched per event.
- **The secondary sections.** **Accounts** (connect / re-authorize / add another account, each account's discovered conversations with Track, Assign & filter, Reach & policy — everything P0a–P4 shipped) and the **Message watcher** (the built-in agents-as-SOURCES section: follow a live session's messages, assign or filter them for another agent — the "subscribe" shape the owner called a by-the-way feature) sit BELOW the list. Each folds; the fold is the user's, stored in user state (`channelsPanelFolds`) and followed on every open client.
- **New group** (the bar's button): a name, members picked from the LIVE agent sessions grouped by Task Group (each session once; nothing is pre-selected and a Task Group is never added whole — D1), an optional opening context (the first thing each new member reads), and **Wake now** (on by default) with its cost said BEFORE the click: *will wake N agents (N billed turns)*. After the click the toast says what the server actually did (woke N = N billed turns; wakes the spend guard refused are not billed and ride the member's next report). The new group's window opens at once.
- **A group's window.** The log (system records — created / added / left / removed / renamed / archived — in the reader's language, an invite's context under its line), the members chip and ⋯ open the **group detail**: the owner first as **You (observer)** (sees everything, never woken), then each member with its **notify mode** as a dropdown the OWNER may change for anyone (next turn — a report, never woken · when @mentioned — wakes, billed · every message — wakes, billed · mute), Remove (a direct group that loses a side is archived), **Invite…** (the New group dialog minus the name; not on a direct group), Rename…, Archive (the log is kept). The window marks the group read when the owner opens or touches it.
- **The composer sends DIRECTLY, as You.** No proposal, no outbox: `@` opens an autocomplete over the member names, a line under the box says who THIS text would wake ("Will wake beta — 1 billed turn" — the same rule the server applies, parity-tested), and the send's answer is drawn at once with the wake count in the toast. An archived group has no composer.
- **External conversations: the owner's own message goes out directly too.** Where the conversation offers sending AS THE USER, the composer is **Send** — out at once as the owner, no policy and no guard (links / attachments / off-hours still govern AGENT drafts), with the same outbox record, audit and never-re-sent `unknown` underneath. Where only the app/bot identity is offered, the composer PROPOSES (a bot message is not the owner speaking) and says why sending as you is not offered; where nothing is offered there is no composer and the reason is said. The outbox and its approval cards are for replies an AGENT drafts.
- **Unread.** A group's unread count is the OWNER's (messages after the owner last opened it that the owner did not write); opening or touching its window reads it; the rail's Channels badge counts it beside the channels' unread + awaiting proposals.
- **XSS.** A group name, a member name, an invite context and every message are agent-controlled and sync to every client: all of them render as text (a hostile `<img onerror>` group name is asserted as text in the row, the bar and the window title).
- Gates: `test-channels-groups-ui` (fast) · `test-channels-groups-e2e` (heavy: two stub-CLI sessions, every wake through the real ladder into a recording stub — the `always` member woken, the `next-turn` member not) · `test-channels-e2e` ⑩b (the direct send: no approval card, no approve line) · `test-channels-i18n` (zh + ja).

### Communication panel — the OAuth client belongs to the ACCOUNT, account cards work like mount rows (2.369.165; docs/design-integrations-per-account.zh.md r4 SHIPPED whole — chunk 1: the shared dialog component, chunk 2: the server, chunk 3: the card and the dialogs, chunk 4: D2 on the storage side + the parity census)

- **The choice is stored on the account, like a storage mount.** A channel account (a record in `data/channels/adapters.json`) names its own OAuth client: an env preset by key (`credentialKey: 'cluster:<k>'`, unchanged) or its OWN client (`credentialKey: 'custom'` + `credential {appId, appSecretEnc}`, the secret sealed under `data/.channels-key` — the mounts' `clientId` + `clientSecretEnc` shape). Presets come from the ONE env reader both features share (Google: `VIBESPACE_GDRIVE_CLIENTS` through `drivePresets()`, the storage dialog's own; Lark: `VIBESPACE_INTEGRATIONS`) as `{key,label}` — no value ever on the wire. The account's consent, refresh and status all resolve THAT client; a preset the env stopped offering is named (`preset-gone`), never replaced by another.
- **Sign in before the account exists.** The account dialog's sign-in block runs the storage dialog's consent shape against `/api/channels/oauth/{start,status,callback}` (the loopback redirect or the paste-back); the account is created only by Connect (`connect {flowId}`), with the client that sign-in ran under and the token it minted — a dialog closed half-way leaves nothing behind.
- **Re-authorize = switching the client is allowed and IS a re-authorization** (the mount semantics): the account keeps its old client and token until the consent under the new one lands, then both are replaced together; a failed consent changes nothing. The old "bound to its credential" refusal is gone.
- **Duplicate** makes a sibling account with the same type, client (a custom secret re-sealed), filters (the declared options), push claim and sender line — never the token, the tracked conversations, assignments, reach grants or the message log; the copy is unauthorized and signs in on its own.
- **Remove is refused by name while the account is referenced** (assignments of its conversations, reach grants to the whole account, outbox proposals not yet settled — agent groups do not count): `409 account-referenced` with each reference. **Disconnect** only drops the token and keeps every account's record (the pre-r4 "a further account's disconnect removes it" is gone).
- **Edit's in-place saves:** rename; replace a custom client's secret (same id); another client ⇒ Re-authorize. The Edit dialog prefills the custom secret from an owner-only config route (the storage `GET /api/mounts/:id/config` rule, D3) — the only answer that carries it.
- **The Integrations window keeps only the six browser key rows.** Lark, Gmail and the test channel are not cards any more: `GET /api/integrations` leaves them out and every card verb on them answers `404 binds-per-account` naming where the client is chosen. Their values an older instance saved stay in `data/integrations.json` and are copied once onto the account that used them (`own` → `custom`, reader-side and by the migration `2026-09-channel-custom-client-inline`; this instance had none). No Test verb on an account's client (D7).
- **Chunk 3 — the card and the dialogs (the client, on the storage dialog component `src/lib/mounts-dialog.js`; the dialogs themselves in `src/lib/channel-account-dialogs.js`).** ONE entry at the bottom of the Accounts part, `Connect an account (Lark / 飞书, Gmail)` (the storage footer's "Connect storage"; the per-kind buttons and the ⋯ "Add account…" are retired). The dialog is TYPE-FIRST (`Type` → `Name` → `OAuth client` → `{provider} authorization` → the type's own first option: Gmail's include query, Lark's brand), every later field on a `when:`: `Preset: {label}` per preset + `Custom (own client id/secret)` (no Built-in; presets[0] preselected, Custom when there is none), the registry's `clientHint` as the hint line, Custom unfolding `Custom App ID` / `Custom App Secret` (Gmail: `Custom OAuth client ID` / `… secret`) inline with the registry's help, and for a type whose console needs a registered redirect (Lark) the callback URL as a read-only row + Copy with the console note and the three prerequisites as hint lines; the sign-in runs IN the dialog (the storage block: the cross-browser link row, the paste-back), and `Connect` creates the record. The sign-in page's brand comes from the registry row's `signinName` (Gmail signs in with **Google**).
- **The account card (credential-first, the storage row's grammar).** Head: chevron · type glyph · name (the label, with the login the token names) · the client chip (`Preset: …` / `Custom client`) · the state dot (connected ok · sign-in dead bad · no usable client warn · never signed in / disabled / connected but tracking nothing idle · a consent running attn) · tracked/total · ✎ · ⋯. Under it the HEALTH line in the storage detail-line grammar (`[Gmail] Connected · label:INBOX · last poll 2 min ago · push: exclusive`), or — when the sign-in died or the client is gone — the storage `.mounts-errline` "Couldn’t connect: connected but the sign-in has expired or been revoked — conversations come from cache while every fetch fails; re-authorize to fix (<why code>)" (the mounts' sentence verbatim, D8) with the primary `Re-authorize {product}…` button. Its children are the TRACKED conversations as ↳ rows (the storage child-row arrow); an account tracking nothing says "Login only — no conversation tracked yet; nothing is fetched until you track one. Use Track… to pick conversations under this account." with Track… (today's checklist picker). The ⋯ is the storage row's order (D6): Open conversation window · Track… · Options · Push… ‖ Re-authorize / Connect · Duplicate… · Disconnect · Remove… ‖ Disable; a SOURCE (the built-in message watcher, a scan-only fixture) keeps its old section and its sender-line rows.
- **Edit** (✎): name, the OAuth client (a custom id AND secret prefilled with their real values, D3 — from the owner-only config route), the sign-in facts, the type's options, the push claim, the sender line; buttons Re-authorize {product}… · Duplicate… · Remove… · Save; only what changed is sent; switching the client makes Save open **Re-authorize** with the new client (the account is not re-pointed until that sign-in lands). **Re-authorize** is the storage re-authorize dialog verbatim (who reported the death, Sign in with {provider}, the status line, the link row, the paste-back) with the OAuth client select on top; the fixed-port Lark flow runs in the same dialog (a busy port is said in its status line). **Duplicate**: `{name} (copy)`, the type read-only, client / filter / push claim copied (changeable), the copied / not-copied paragraph, its OWN consent block, `Create & connect` (the copy exists unauthorized from its first sign-in attempt; a dialog closed before that sign-in lands removes it again). **Remove…** (⋯ or Edit) confirms, and a referenced account opens `Cannot remove "{name}"` naming each assignment (conversation → principal), reach grant and pending-proposal count, with the Disconnect sentence and an Open Outbox button. The section repaints in place on every broadcast; the phone draws the same `.mounts-*` classes the storage rows use. The channels' own flow dialog, the wizard's stepper and its credential step are gone.
- **Chunk 4 — the two features agree, and a census keeps them agreeing.** The storage side adopted the account rule (D2, its own commit — see Mounts / Storage above): switching a Drive / Gmail connection's OAuth client opens Re-authorize under the new client, the token lands with it. `scripts/test-oauth-field-parity.mjs` (fast) pins what the two share: ONE component (the module's exports, no second renderer on either side), every shared spelling asserted on BOTH sides (the renderer's own classes through the channel side's import), every re-authorize on both sides = the one `reauthDialog`, switching the client = re-authorize on both sides with the token landing WITH the client, each side's Edit button order (the channel's read off the r4 mockup: Re-authorize · Duplicate… · Remove… · Save; storage: Remove… · Re-authorize · Save), Remove… in Edit on both sides (never a storage row icon), D8's borrowed auth-death sentence, and the design's §4 i18n key list parsed OUT OF THE DESIGN DOC — every key drawn where it belongs as built and carried by zh + ja, a key built under another spelling (`Duplicate…`, the health line in parts, `Include query`) or not drawn (Lark's include-groups option — Lark declares none) says why; the deleted `Add account…` is drawn by no channel file. Each rule has a patched in-memory control.

### Integrations & keys — the shared credential layer (P0b, docs/design-communication-panel.zh.md §14; consumed by docs/design-agent-browser-v2.md §7.5 too)

**What P0b ships, and nothing more.** ONE window (⚙ → Integrations & keys /
集成与密钥), ONE PURE table of integration rows, ONE server store that is the
only thing that ever sees a value, four routes, one broadcast, one at-rest
cipher primitive shared with mounts, and the helm `integrations:` block. The
precedence is one sentence, enforced as a pure function: **the user's own >
the cluster default > none.** No Lark, no Gmail, no CloakBrowser consumer
lands here — their rows carry their setup blocks and callback URL NOW (that is
the point of shipping the cards) and say BY NAME which phase wires them
(`wiredIn`); their Test is a named `not-wired` refusal, never a green tick.
Config export/import of these keys (design §14.10) is NOT in P0b.

- **The rows** (`src/integration-registry.js`): `fake` (the test adapter's own
  row, with a real consumer — `src/channels/fake.js` asks
  `resolveIntegration('fake')` in `auth.state()` — and a real setup block so
  the callback line, its copy button and the checklist are exercised on a card
  that ships), `lark` (App ID / App Secret; setup block = the fixed loopback
  callback `http://127.0.0.1:17865/lark/cb` + three console prerequisites;
  `credential-exchange` test WITH a caveat), `gmail` (a DELEGATING row: it
  REUSES the existing Drive/Gmail OAuth-client presets `VIBESPACE_GDRIVE_CLIENTS`
  through `MountManager.drivePresets()` with `prefer:'channels'`, `multi:true`,
  and declares NO env of its own — decision 5), `cloak` (a per-seat license key;
  empty = free tier). The Lark callback URL is defined in exactly ONE place and
  the suite fails a second spelling anywhere in code.
- **The card** (one per row, the Plugins card language, single column at every
  width): a SOURCE CHIP (`Your own` / `Cluster default · <label>` / `Not
  configured` + WHY), the SETUP BLOCK drawn ABOVE the fields (a user who has
  filled two inputs and seen a green tick does not scroll back up) with the
  callback URL as copyable monospace text + a Copy button that copies EXACTLY
  that string, the callback note (which console page it goes to) and the
  prerequisites checklist; then who serves the row — a radio pair (`Use cluster
  default`, greyed WITH the reason when there is none / `Use my own key`) or,
  on a delegating row, a dropdown of the cluster's presets + "my own key"; then
  the fields — **a set secret shows `••••` + its last 4 (only when the value is
  ≥ 12 chars) and a REPLACE button that opens an EMPTY password input. There
  is no Reveal, anywhere, on any route**; a required field that is missing is
  marked by name; then Test (its wording follows `test.kind`: "Test connection"
  / "Check format (no network)" / "Test reachability"), whose verdict is
  ALWAYS drawn beside the row's `caveat` — a bare green tick on a check that
  proves less than the reader assumes is the mirror-image lie of a "Test
  connection" that never went online; a failed Test draws the vendor's own
  words (textContent, never innerHTML); `Clear my keys` (confirm dialog); and
  "where this key is used" from `consumers`, or the phase it is wired in.
  **Save retires the open editor BEFORE it asks for the re-render** — the
  editor is exactly what the per-card refresh defers on (a broadcast must not
  tear a field out from under a user mid-typing), and with it still in the
  DOM neither the save's refresh nor the broadcast's ever repainted the row
  (measured in headless chrome: mask + chip stale after every Save).
- **The store** (`src/server/integration-store.js`): `data/integrations.json`
  holds `values` (secrets through `src/secret-box.js`) and `clusterKey` and
  NOTHING else — `source` is DERIVED at read time, never stored; a cluster
  default's VALUES are read from the env at the moment of the question and
  never copied to disk, so rotating the Secret rotates every consumer, and
  **injecting a default then withdrawing it leaves the row answering `none`
  WITH THE REASON** ("the cluster default this row used (X) is no longer
  provided by this instance's environment"), never quietly serving the old
  value. Omitted field = untouched, `''` = cleared, everything else trimmed
  then validated with a NAMED complaint. Two intents, two functions:
  `clearUserValues` (DELETE, "drop my keys", ALWAYS allowed, lands on cluster
  or none) and `useClusterDefault` (PUT `{use:'cluster'}`, a NAMED refusal
  when there is no cluster default — the same fact that greys the radio).
  A user's own value SURVIVES a later env injection. The store is THE ONLY
  reader of `VIBESPACE_INTEGRATIONS` (JSON, the helm Secret) and
  `VIBESPACE_INTEGRATION_<ID>_<FIELD>` (the single-field form for
  docker-compose; the JSON form wins, said once at boot; an unparseable block
  is logged and treated as "no cluster default", never a crash).
- **A withdrawn credential flips the ADAPTERS row, not only the card**: the
  channels engine hands every adapter the store's `resolveIntegration` (never
  `process.env`) and re-asks `auth.state()` on the store's change edge, so an
  adapter whose application credential vanished answers `needs-credentials`
  on the panel digest however fresh its token record looks.
- **Test is a human's click, bounded (15 s), one in flight per id, and the
  store constructs NO vendor request** — it dispatches to the runner the row's
  CONSUMER registered (the fake's succeeds or fails on a fixture switch: a key
  containing "fail" fails); a standing census fails any scheduler/timer/ingest
  loop that calls `integrations.test(`.
- **Every write broadcasts `integrations-updated`** carrying `publicView(id)`
  — THE one masked view every route returns (`set:{field:bool}`, `masked`,
  `missing`, `source`, `why`, `clusterKey`, `clusterOptions` with key + label
  only, `testedAt`/`lastOk`/`lastError`, `testCaveat`, `consumers`); a second
  client repaints that one card from the frame, no reload. A 40-char secret
  written through PUT appears in no GET body, no broadcast frame and no log
  line (measured, test-integration-registry + test-integrations-ui).
- **Failures reach the user**: a refused PUT/DELETE is a toast naming the
  field and the rule; a failed Test is a line on the card; an unreadable
  secret-key file is SAID on the card ("the key file could not be read" — the
  opposite sentence from "nothing configured").
- **Deep link**: `app.openIntegration(id)` scrolls to and highlights that
  card; an id that no longer exists opens the window with nothing highlighted
  and never throws (a removed row must not fail a layout restore). The window
  is a registered SINGLETON type (`integrations`, openSpec
  `{openIntegrations, focus}`) and the ⚙ row `Integrations…` is a contribution
  registered by the window module (gear-menu.js untouched).
- **The cluster side** (`deploy/helm/vibespace-user/values.yaml` →
  `integrations: [{id,label,values}]` → the Secret's `integrations` key → env
  `VIBESPACE_INTEGRATIONS`, `secretKeyRef` never `value:`): suitable for
  register-once, everyone-may-use credentials (a Lark app — same tenant only;
  a Google OAuth client), NOT for per-seat keys. Gmail has no entry: it reuses
  `gdrive.clients`. deploy/README.md carries the four rules with placeholders
  only.
- **What the encryption buys, said plainly**: `data/integrations.json` and
  `data/.integrations-key` sit side by side under one uid — it protects a
  copied FILE (backup, snapshot, a mis-mounted volume), not against code
  running as the same user on the same machine (an agent session is exactly
  that). The same property mounts has always had; not introduced here.
- **`src/secret-box.js`** (design §14.7, decision 24): the ONE at-rest cipher
  primitive, N key files — mounts keeps `data/.mounts-key` byte-for-byte
  (parity-pinned both directions against the pre-fix `_enc`/`_dec`), the
  integrations store gets `data/.integrations-key`. **The key is minted on
  ENOENT only; every other errno is a TYPED failure and the existing key file
  is never overwritten** — mounts' former inline `_key()` minted a fresh key
  over ANY read failure (EACCES, EMFILE, a truncated file) and silently
  orphaned every stored ciphertext for ever; mounts now goes through the box,
  so the fix applies to it too.
- **r2 (2026-09-14, the round-1 verifier — four defects, each reproduced on
  the real module before the fix):**
  - **The cluster secrets reached agent children on the daemon path, and a
    withdrawn default kept flowing across server restarts.** §14.11.1's "by
    construction cannot reach any agent child" was true of the dtach path
    only: the local daemon was spawned with the server's RAW env and merged
    every child over its own environ, so a real pipe-session `claude`'s
    /proc/<pid>/environ carried the full 40-char cluster secret a PREVIOUS
    server life had handed the daemon. Now the daemon is BORN sanitized
    (PURE `src/agent-env.js`, the same rule as `agentEnv()`, plus the two
    names the daemon tier itself reads) at all three birth sites and every
    daemon child spawn merges over that sanitized base regardless of what the
    daemon holds — so children are protected from the moment this bundle
    runs, while a daemon born under an older build keeps its own environ
    until the re-exec run by THIS code (the second upgrade, or a restart;
    the re-exec that installs this bundle is the older code's, raw env).
    Measured on a real daemon: the daemon's environ, a pty
    child and a pipe-session child all carry neither the name nor the value,
    with the pre-fix bundle handing it straight down as the control.
  - **An unreadable `data/integrations.json` is a TYPED `store-unreadable`
    error, never an empty state.** The former bare catch read EACCES/EMFILE/
    EIO as "fresh", cached it, and the next unrelated write replaced the file —
    every stored credential silently destroyed (measured: store lark, chmod
    000, restart, store fake ⇒ the file holds only fake). Now the card says
    "The integrations store could not be read: …", every write (PUT /
    DELETE / Test) is refused with 500 `store-unreadable` until the file is
    readable again (and the SAME instance recovers the moment it is — nothing
    is cached over it); a file that reads but is not a store is ARCHIVED as
    `integrations.json.corrupt-<ts>` before a fresh one starts.
  - **A non-delegating row's "Use cluster default" survives the admin naming
    that single default.** The radio stored the implicit selector `default`;
    when the JSON block later carried `key: 'tenantA'` for the same single
    default the row answered `none`, the radio greyed and nothing could reach
    a default that exists. A vanished saved key now re-binds to the env's
    ONLY preset and the card says so ("…was re-keyed to tenantA — the only
    default this instance offers"); with two or more presets the row still
    answers `none` naming the vanished key (a picker's question), and the
    delegating dropdown keeps §14.2's refusal untouched.
  - **The log line about a mistyped `VIBESPACE_INTEGRATIONS` carries no
    bytes of it** (V8 quotes the source around a JSON error — a trailing
    comma printed the last 6 characters of the secret); the same redaction
    applies to mounts' `VIBESPACE_GDRIVE_CLIENTS` reader.
  - **The no-timer-calls-`test(` census derives its receiver** (traced
    handles + store accessors + row-id literals, printed) — a scheduler
    reaching the store through the route's own `store()` accessor idiom was
    invisible to the four typed spellings.
  - Ratified as an OPEN question for the integrator, not changed: the
    `wiredIn` escape lets lark / gmail / cloak ship with `consumers: []`, so a
    user can store a Lark secret nothing reads yet (Test answers `not-wired`
    by name); the brief asked for those cards and decision 25 says a row
    lands with its adapter — one of the two must be amended.
- **r3 (2026-09-15, the round-2 verifier — two findings, each reproduced on
  the real module before the fix):**
  - **A user secret the current key file cannot open never hands the row to
    the cluster.** A rotated or restored `data/.integrations-key` used to
    make the card say `Cluster default · <label>` with no reason, hide "Clear
    my keys", and let Test pass on the CLUSTER's credential — the user's own
    Lark tenant app silently replaced by the cluster's. Now the chip says
    `Not configured` with the reason naming the fields ("stored values could
    not be decrypted (appSecret): the current key file (.integrations-key) is
    not the one they were written with"), the card carries the remedy line
    ("The keys stored for this row cannot be decrypted with the current key
    file — restore the .integrations-key this instance had when the keys were
    entered, or clear the keys and enter them again"), "Clear my keys" is
    shown (the row HOLDS values), Test refuses, the Adapters row says
    `needs-credentials`, and the server logs it once per row per transition.
    Clearing lands on the cluster default — because the user decided.
  - **The env name can be spelled or built in exactly one file.** The PURE
    registry no longer exports `envFieldName`; the store builds the
    single-field name, and a standing census fails a builder call or a
    `clusterEnv.prefix` read anywhere else.

Gates: test-secret-box (fast, 40 — ⑦ `describeJsonError` with the retired
`e.message` as its control), test-integration-registry (fast, 194 — incl.
the rotated key WITH a cluster default present through the real route and
the env-name BUILDER census (r3);
the env-NAME census over the tracked-file list through the sanitized
environment of scripts/git-env.mjs, PRINTED, with the bracket/destructuring/
aliased-env forms as its controls; §4b the unreadable / corrupt / redacted /
re-bound store legs each with a control that fails alone; the DERIVED
`.test(` receiver census; §6(h) the daemon-holder census),
test-agentd-session (fast — a real daemon born under the secret, a
previous-life daemon holding it, the pre-fix bundle as the control),
test-integrations-ui (heavy, worktree server + chrome 375×667 + a second
client + two restarts for the inject-then-remove walk), test-window-types,
test-restore-smoke (the route battery carries `/api/integrations`).

### UI
- 6 built-in color themes: Dark, Light, Dracula, Nord, Solarized, Monokai — all contrast-audited (terminal ANSI colors + UI chrome `--text-dim`/`--text-secondary`)
- Theme editor: floating panel to create custom themes — ~50 CSS variables + 16 ANSI colors, live preview, hover-to-highlight CSS var usage, save/load/delete, multi-client sync via WebSocket. ThemeManager: `registerCustomTheme`, `unregisterCustomTheme`, `setLivePreview`, `extractThemeValues`, `applyPendingTheme`. CSS value sanitization (strips `{}`). Constructor defers custom theme fallback until async load.
- Global settings popover (⚙ in toolbar): theme, font size, font family
- Resizable sidebar (drag right edge)
- Usage pies in taskbar (two circular pie charts: 5h session + 7d weekly rate limits from Anthropic API, hover for %, click for details)
- **Usage window: who spent it (⚙ → Usage, 2026-09-10).** Every ledger row now says which KIND of transcript produced it — the conversation itself (`main`), one of its subagents, or a workflow agent — so the dashboard answers a question it could not before: on this instance **58.9 % of the last 7 days' cost was workflow agents**, and the top conversation is 72 % agents. Three surfaces: a **By origin** group at the top of the classic cost section (a stacked share bar + one row per origin), a **By session** table with a main / subagents / workflows column each (cost in the selected metric, cost + tokens + requests on hover) and a per-row stacked bar, and **By project** rows whose hover names the same split. `origin` is also an ordinary panel dimension (and a `splitBy`), and the default "Cost overview" preset ships a cost-by-origin donut plus a session × origin bar panel. A fourth origin, **Unattributed**, appears only when the ledger holds rows nobody can name (a transcript that has been rotated away, or a remote machine whose scanner predates the field) — it is never hidden, because it is spend and the other rows are read as shares of the same total.
- **"By project" is the repo an agent worked FOR.** An agent transcript records the agent's OWN directory, so an agent that ran in a git worktree used to be its own project row (272 of this instance's 3,155 agent transcripts). The event is attributed to the parent project and keeps its own directory as `wcwd`; a directory RENAME is handled too (the project directory name is the forward encoding of the cwd, so the right candidate can be verified rather than guessed — without that, $7,828 of one conversation's agent spend sat in a second row under a path that no longer exists).
- **THE THREE BROWSER FACES, NAMED FOR WHO DRIVES THEM (2.369.168, browser takeover C4 = docs/design-browser-faces.zh.md direction B, owner "那就选B吧"):** **Web view** / 网页视图 / ウェブビュー = the toolbar globe's iframe (the globe means nothing else any more; command `Open a web view`; Toolbar setting `Show Web view button`) · **Agent browser** / Agent 浏览器 / エージェントブラウザ = the agent's browser on the window-with-a-dot glyph (rail item, ⚙ Tools ▸ `Agent browser…` 35, the window, `Agent browser (live)` views, the chip `Agent browser · <profile>`, the card commands `Agent browser profile…` / `Agent browser — live view` / `Hand the agent browser back`, the Session Properties section, the Settings category `Agent browser` under Services) · **Browser app** / 浏览器应用 / ブラウザアプリ = a browser in the Apps catalog (sub-label, gated on the registry row's `browser`). The Apps dialog's intro says you drive an app and the agent cannot reach it. Phone '+' sheet: Web view / Desktop app… (when the desktop-apps probe has a backend) / Agent browser (when the profile digest is held: the active session's live view, else a picker over the live sessions holding a browser, else the Agent browser window). Labels and icons only — ids, openSpec actions, settings keys and the rail id unchanged, saved layouts replay as before. Gate: test-browser-faces (+ the label pins in test-window-types / -contributions / -ax-paint / -browser-housekeeping / -profile-blindness, test-architecture §53).
- Embedded browser window (🌐 in toolbar, labelled **Web view** since 2.369.168): iframe with URL bar, proxy mode toggle, layout persistence. `navigate()` accepts `blob:`/`data:`/`about:` URLs verbatim (2.84.0 — the http:// auto-prefix blanked every blob page, incl. the chat html Preview button and the Diagnostics report)
- Browser proxy mode: node-unblocker full URL rewriting (HTML/CSS/JS), strips X-Frame-Options/CSP. Works for noVNC, docs, internal services. Google/Cloudflare sites may trigger reCAPTCHA due to anti-bot detection. **`navigate()` normalizes a bare origin to a trailing slash (2.186.5, real report):** node-unblocker leaves in-page links RELATIVE and relies on the document base, so a pathless origin (`http://host:port`) gave the iframe a base with no `/` and a relative dir-listing link resolved UP A LEVEL, escaped the proxy, and fell to the X-Frame-Options overlay. Running http(s) URLs through `new URL().toString()` adds the `/` (no-op otherwise) so relative links stay inside `/proxy/`.
- Frontend optimization: esbuild minification (2.5MB → 1.4MB) + gzip compression middleware (~420KB over wire, 83% reduction)
- Static file caching: `maxAge=0` with etag validation for cache revalidation
- "N windows" click in taskbar → window list popup (scoped to active desktop)
- **Mobile gaps batch (2.369.125, docs/design-mobile-gaps.md — the top-10 of a 59-feature desktop-vs-phone review at 390×844).** The nav bar carries the **For-you inbox** (badge pills, the popup as a full-width sheet); a **long-press on "+"** opens the create sheet (Agent session / Terminal / Files / Browser / Desktop when available) — the four toolbar entry points that vanish with `#toolbar`; the **window switcher** always shows the desktop tabs with a **"+" tab**, a tab long-press renames/deletes, a window-row long-press opens the registered 'window' menu (incl. **Move to Desktop**), and a Minimized section is the restore path (a synced minimize is truth on the phone: hidden locally, the next window shown, carried in its saves — r2); the **chat status bar** carries a **search magnifier** (Ctrl+F's touch face, live windows only) and a **long-press on a message** opens Copy text / Open in editor / Fork from here / Message details while the 21×16 hover buttons are hidden; the **file explorer** shows one Name column, a folding bookmark strip, 36 px toolbar buttons and a long-press **Select…** mode with a batch bar; **⚙ System… / Ports… / Channels…** open the rail panels in windows where no rail exists; the **settings nav wraps**; and ONE `@media (max-width:768px)` block lifts every nav / sidebar-header / search / tab / status-chip / dropdown-row / terminal-key target to ≥ 36 px. Gate: scripts/test-mobile-gaps.mjs (heavy chrome, real touch sequences).

### Desktop apps (docs/design-desktop-apps.zh.md, P8-1 — 2026-09-13; HONEST SCOPE)

**Desktop apps on paired devices — lane C1 shipped (2026-09-25, docs/design-desktop-apps-seamless.zh.md §3.5; D5–D8 decided as recommended):** the machine half of the keeper is ONE shared module (src/desktop-serve.js) that runs where the app runs — in-process for this machine, inside the VibeSpace agent (`desktop-serve` op) on a PAIRED device (D5: always through a daemon — an ssh host gets the agent installed over ssh and is served by it; an agent that predates the op is refused `host_needs_daemon` by name, a failed install is `host_unavailable` naming the reason). The device holds its own record (D8: `~/.vibespace/desktop-apps.json` — the app outlives the hub AND its own daemon: a restarted daemon re-adopts it), the hub reaches it through src/server/desktop-access.js and forwards its loopback picture port over the agent's data plane (nothing listens on a LAN; xpra's protocol is end to end, so clipboard / input / geometry ride it untouched). Measured on a loopback fake device (test-desktop-remote): hello through the forward ~530 ms incl. the ws upgrade, keystrokes → the app's file ~10 ms. **What a person can do today is unchanged**: the launch dialog and the routes still offer this machine only — the machine choice, the bridge's forward and "Install xpra on <machine>…" are lane C2. Records carry `hostId` (`'local'`).

**Desktop apps on paired devices — lane C2 shipped (2026-09-25):** a person can now run a desktop app ON ANOTHER MACHINE. The launch dialog has a "Run on" row (this machine + every paired machine; a machine that cannot run apps is greyed with its reason — offline, needs the agent upgraded, no X11 on macOS / Windows — never hidden; an ssh machine not connected yet "connects when chosen"). Choosing one shows THAT machine's catalog (greyed by its own binaries), ladder and slots; the launch runs there and the window says so ("{app} — on {machine}", an "on {machine}" chip). The picture reaches the browser through the hub: the device's xpra port is forwarded over the agent's data plane (no LAN port, xpra's protocol end to end — typing, clipboard and resize work as on this machine). Stop, Keep running, Scale ▸, windows, the idle stop and the resource report all work for a remote app (the hub decides policy from the input it relays; the device acts). If the machine stops answering, its apps stay listed as "machine not answering" and the window waits for it (they are NOT marked exited); a hub restart re-asks every known and every dialed-in machine and adopts what it runs. **"Install xpra on {machine}…"** (offered when the chosen machine has no xpra): shows the PLAN first — every command, and where xpra comes from (the machine's own apt when it offers xpra ≥ 5, else xpra.org's repository for its codename, pinned to 6.x, with xpra-x11 + xpra-html5 named) — then runs it as root through `sudo -n` with the log streaming into the dialog; no passwordless sudo ⇒ the commands to copy, said by name; macOS / Windows ⇒ no X11, by name. An install that takes longer than 15 minutes is said as such ("still running on this machine — VibeSpace never stops apt halfway"), never as a failure, and no second install starts on that machine until it ends; a link that drops mid-install says so. Since verify r2 (2026-09-25) the install runs DETACHED on the machine (its own session, its log + a pidfile beside the machine's desktop-app record): a hub restart, an Update, a lost link or the agent's own restart no longer kills apt halfway, and opening the dialog again while it runs offers "Follow the install" — "Still installing on <machine> — re-attached", its log from the start — never a second apt; a lost link keeps the machine's slot until the machine, reached again, says the install is gone. A Stop / Keep running / Scale click on a remote app whose machine drops at that moment answers "not answering" at once, not after a minute. The FLEET image gets xpra only through deploy/docker/Dockerfile — now xpra.org's bookworm 6.x, pinned (D7: one protocol version fleet-wide; bookworm's 3.1.3 is no longer installed). Measured on the paired test box (dial pairing to a scratch hub through an ssh reverse tunnel): paired + dialed in 0.8 s, launch → ready 1.8 s, xpra ping round trip through the whole path 7–8 ms on a 6–9 ms link, a key to the app's echo drawn 11–18 ms — with a pty-backed tunnel; a `ssh -N -R` tunnel measured 53–56 ms (+~47 ms per round trip: a session without a pty never sets TCP_NODELAY — the harness's tunnel, not the product; the design note has both). NOT for remote apps: agent window targets (an agent acts on this machine's windows only).

- **What ships in P8-1:** any local desktop application (a registry row or `exec` + args + cwd typed by a HUMAN in ⚙ → Desktop apps… / the toolbar Apps button — never an agent, §5) opens as a `desktop-app` window: the server starts a PRIVATE X display + a picture server + the app for it (DA2: one display per app — isolated, its own idle, its own stop), the browser renders it through the shared picture component (noVNC) over the ONE cookie-authed ws bridge `/api/desktop/<id>/stream`; the raw port is loopback-only and never reaches a browser. N browsers watch ONE display (`-shared`); the window is part of the layout (openSpec replayed on every client and on reload), tab-group capable.
- **The backend ladder (§3, DA1):** `xpra` > `vnc-display` > `desktop-singleton`, each ONE row of the capability table `DISPLAY_BACKENDS` — never an if-chain. **P8-1 brings up `vnc-display` end to end in BOTH spellings** (Xvnc when present — the fleet image, driven in the gate through a shim that honours the keeper's exact argv because the real binary is not on this box; else Xvfb + x11vnc — this box) plus a light WM (xfwm4/openbox) when present; **`xpra` is PROBED and RECORDED only** (the ladder can choose it and says so, the keeper refuses to bring it up by name, the bridge answers 501 by name) — P8-2 wires `xpra start --html=on` and the HTML5 client (D21 (c)); `desktop-singleton` = the app starts on the shared Desktop (D10 fallback). Every fallback carries its reason in §3's exact words: the log prints `[desktop] backend fallback: xpra→vnc-display (xpra not on PATH)`, the record stores `fallbackWhy`, and the window's status chip shows **`vnc-display (xpra not on PATH)`** — the user always knows whether they see one window or a whole display. **(P8-1 state — SUPERSEDED by the P8-2 x1–x3 bullets below since 2026-09-21: the xpra rung is WIRED, brought up, relayed and drawn by us, and is the DEFAULT wherever xpra is installed; the 501 and the by-name refusal are gone.)**
- **The keeper's discipline (opencode-serve's, inherited):** records = FACTS with pid AND starttime (data/desktop-apps.json, atomic); boot ADOPTS a surviving session by pid+starttime+banner and reaps a dead one with its `lastError` kept; a COUNT CAP (6/instance, refused loudly naming the holders) + the RUNAWAY GUARD (>150 % CPU for 5 min or RSS > 2 GB ⇒ stop, park the registry row 1 h, telemetry) — the numbers are `src/keeper-limits.js`, the ONE home opencode-serve now reads too; per-app IDLE from the last INPUT the bridge saw (DA3: `desktop.idleTimeoutMin` 30, 0 = never; the window shows the countdown; "Keep running" is one explicit action); Stop = app → picture server → X, each verified gone. A VibeSpace restart never kills an app (detached, adopted).
- **P8-2 chunk x1 (2026-09-21) — THE XPRA RUNG, SERVER HALF + THE VALIDATION SLICE:** with xpra installed (v6.5.3 on this box) every NEW desktop app comes up on `xpra` (DA1) — ONE `xpra start` per session owning its own Xvfb and the picture socket on one loopback port, the app the keeper's own child on that display, seamless (the app window IS the picture: no root, no black), `--resize-display=yes` (the virtual screen follows the viewport), clipboard both ways at the server; the record says `backend:'xpra', stream:'xpra', probe:'http'`; stop/idle/keep-alive/adoption are the same code (an xpra session survives a VibeSpace restart; a vnc-display session started before the install is NEVER migrated); the ONE bridge relays the xpra WebSocket (ws↔ws, named closes, the same keepalive); the UPSTREAM html5 client is hosted behind our auth at `/api/desktop/<id>/xpra-ui/` (the D21 (c) (a) validation slice — measured at 200 ms / 1 Mbps through the dev-only `VIBESPACE_DESKTOP_NETEM=1` knob: keystroke echo ≈ RTT + 65 ms, first window in < 1 s) and is what the `desktop-app` window shows in an iframe UNTIL chunk x2 draws the picture itself (title/icon on the title bar, DPI-correct canvas, the pane-fit resize, the plain-http clipboard chip); `desktop.backendPrefs` (Settings → Window) reorders the ladder for an instance that wants the whole-display rung first. The fleet image's xpra 3.1.3 (bookworm) is NOT measured from here — its html5 protocol differences are an open item (§9).
- **P8-2 chunk x2 (2026-09-22) — THE XPRA WINDOW, DRAWN BY US (D21 (c) (b), §4.4: the window is ours):** a `desktop-app` window whose record streams `xpra` renders through `src/lib/xpra-view.js` on the SAME picture shell as the RFB view (picture-shell.js — one bar, one ladder): the app window IS the picture — mapped at 0,0 with the pane's size under its own size hints, RE-FITTED when the VibeSpace window resizes (`display-configure` then `configure-window`; measured on this box with xterm: 898×550 of an 898×553 pane and 634×407 of 638×413, ZERO black pixels outside the window at both sizes, first window drawn 0.76 s after open), the pane a theme colour (no root, no black), dialogs nudged inside the pane, override-redirect popups drawn where X put them (clipped by the pane exactly as X clips them at the root — Xt positions a menu against the screen size it cached at connect, so xterm's 446 px menu hangs below a 553 px root; no client can move an override-redirect window and XTest cannot reach beyond the root); the VibeSpace title bar shows the app window's OWN title (escaped) and icon; typing goes through a hidden textarea so an IME composes — and because xpra 6.5.3 only TRANSLATES a keycodes-only client onto its `us` keymap, the client publishes a NATIVE keymap (`x11_keycodes` + `query_struct`) and a keycode row per character outside it before pressing it (é and 中文 typed into xterm, read back from `cat`'s file); the clipboard both ways: Ctrl+V / the Paste chip send the browser's text as a token followed by the app's own Ctrl+V (the paste EVENT works on plain http; the chip reads the async API on a secure context and otherwise opens the shell's PASTE BOX — a textarea whose native paste works on plain http and on a touch screen, then Send), a copy inside the app lands in navigator.clipboard on a secure context and on plain http (the owner's real address — by hostname, not loopback) becomes the "Copied in the app — click to copy" chip whose click copies through the user gesture (both branches measured through headless chrome at the X level with xclip). MEASURED xpra rule: the server hands clipboard tokens to ONE client — the first with clipboard enabled, then whoever last sent input — so a viewer that never touched the app gets no copies. The npm `xpra-html5-client` was vetted and refused (its README says MPL-2.0 derived from upstream while package.json says Apache-2.0; frozen 2022-05, xpra 4.x era; 10.7 MB unpacked; a whole client with its own window model); the transport is the upstream html5 v21 Protocol.js WORKER served unmodified from the installed package behind our auth (docs/third-party-notices.md), everything above the packets is ours. Not done: images on the clipboard (text only); the fleet image's xpra 3.1.3 stays unmeasured (§9).
- **P8-2 chunk x2 follow-through (2026-09-22) — THE CLIPBOARD ON EVERY RUNG + THE UI SCALE MEASURED:** the clipboard chrome is the SHARED picture shell's, so the RFB rungs (vnc-display — the fleet image's rung — and the singleton Desktop) get it too: Paste on plain http / a refused / an empty clipboard opens the paste box (master 2.369.136's, moved into the shell), and a desktop-side copy on plain http (or refused by the API) becomes the "Copied in the app — click to copy" chip instead of nothing (a secure page still writes it silently). Measured through headless chrome on the real xpra rung: on the plain-http hostname page REAL pastes (CDP's native paste command, no async API) reach the app both through Ctrl+V on the pane and through the Paste chip's box + Send (read back with `xclip -o`); under `vibespace.uiScale` 125 at a third size (560×460 layout px ⇒ a 698×500 on-screen pane) the canvas is 694×498 px drawn on 694×498 screen px (net zoom 1), the session's screen is the pane's on-screen size, 0 black px outside the window, X's window 694×498, and pointer moves at pane (137, 91) / (558, 350) land on exactly those X coordinates (`xdotool getmouselocation`).
- **2.369.158 — HiDPI + THE APP'S MINIMUM (docs/design-desktop-apps.zh.md §7.6; the owner on a devicePixelRatio-2 screen: the calculator's keypad cut off, "the DPI is way too low — nowhere to adjust?", "this still looks like VNC"):** on the xpra rung the app is rendered at the screen's resolution and shown 1:1 — the launch carries the client's `devicePixelRatio`, **Settings → Window → Desktop app scale (xpra)** (`desktop.appScale`: Auto = 2× from a screen scaled 150 % or more, else 1×; or a fixed 1× / 2× / 1.5× — 1.5× enlarges only GTK apps' TEXT, their widgets stay 1× (X11 GTK has no fractional scale, measured), so Auto never picks it) fixes the app's scale AT LAUNCH (a change takes effect at the next launch; the window's status strip shows `2×`), the app gets GDK_SCALE (GTK3 + GTK4 exact 2×) with the display's font dpi 96 × scale / GDK_SCALE (Xft.dpi multiplies with GDK_SCALE — measured), xterm an Xft face at a scale > 1, Qt QT_SCALE_FACTOR (unmeasured); the client sends device pixels (X geometry = pane × DPR) and draws each window canvas at device pixels in a CSS box of device ÷ DPR; the pointer maps CSS → device; the UI-scale counter-zoom holds. The app's MINIMUM clamps the VibeSpace window (the client now asks xpra for `size-constraints` — 6.x's name; it never received a minimum before, which is why the keypad was cropped): the resize drag stops at the app's minimum + the window's chrome, snap/grid/presets/restore keep the window at it (the terminal's CSS-min rule, per window), and on a phone the picture is scaled to fit — never cropped — with "Scaled to fit — the app needs at least {w}×{h}". The backend chip's tooltip says xpra streams each app window as pixels. Limits: a pixel stream, not vector rendering (lossy encodings can still touch text); the vnc-display rung stays CSS px; GTK Broadway is a possible GTK-only future rung, not built. **r2 (the verifier's findings, fixed):** fractional screens (125 / 150 / 175 %) are 1:1 too — the device pane rounds down, each canvas box is a size the browser stores exactly and the picture sits on the device-pixel grid (a screenshot equals the canvas; before: a 0.9995 zoom, the badge on a pane that held the app, blurred text); a pane smaller than the app's minimum (a phone) keeps EVERY part of the scaled picture clickable — the X display grows to contain the app (before: the lower keypad rows and the right column were outside X's screen); the window's minimum never exceeds the workspace — a 1× screen taking over a 2× app, or 2× on a small screen, gets a window that fits with the picture scaled to fit and the badge (before: a window taller than the screen, the keypad off-screen); the app starts only after xpra has written the display's font dpi (before: a race — a 1.5× xterm at Xvfb's 100 dpi); an active pane scales only when the app's minimum does not fit (a big dialog no longer zooms the whole picture); the window's minimum is re-measured when its chrome, its visibility or the UI scale changes.
- **P8-2 chunk x3 (2026-09-22) — THE RUNG CLOSED (the suites + the docs that make x1/x2 a shipped rung; the owner's two acceptance points are shipped behaviour): `xpra` is the DEFAULT rung wherever xpra is installed** — every NEW desktop app comes up on it (DA1), an existing vnc-display session is adopted as it was born and never migrated. Gated on a REAL worktree server with password auth by `test-desktop-xpra` (heavy, ~50 s, no chrome — the chrome half is test-desktop-xpra-window): bring-up 1.5 s after `POST /api/desktop/apps` (xpra's session files under the app's OWN dir `data/desktop-apps/<id>/xpra/`, no unix socket anywhere — `--bind=none` — `~/.xpra` and `~/.Xauthority` untouched); THE BINDING CHECK — the xpra listener is bound to 127.0.0.1 only (`/proc/net/tcp`, no tcp6 row) and a raw TCP connect to this box's non-loopback address on that port is ECONNREFUSED while the product's own 0.0.0.0 port answers, so the picture reaches a browser ONLY through the cookie-authed relay; relay auth on the real server (no cookie ⇒ 401, a foreign id ⇒ 404, the id ⇒ a real rencodeplus hello answered in 0.5 s with xpra's version + 98 packet-types); resize-follows at the protocol level (`display-configure` + `configure-window`: 640×480 ⇒ X's own geometry 640×472 in 0.4 s, 900×620 ⇒ 898×615 in 1.0 s) with the MEASURED xpra rule read from its `x11/server/seamless.py`: the requesting client is never told about its own configure and a `window-move-resize` comes only when X's final geometry differs from the server's clamp (xterm's cell snap corrected 480→472; the second size silent) — which is why the x2 client applies its fit optimistically and takes corrections; the clipboard both branches through the relay (a `clipboard-token` is what `xclip -o` reads on the display; `xclip -i` arrives as a greedy token carrying the text; the token counts as INPUT for the idle clock); keep-alive vs idle stop with `desktop.idleTimeoutMin` patched live through `PATCH /api/settings` (a 3 s timeout stops the silent session 5–6 s after ready on the 5 s tick, xpra + Xvfb + app gone; the kept-alive one beside it survives; the first session keeps the timeout STAMPED at launch); adoption across a SIGKILL + reboot (three live sessions — two xpra and one vnc-display pinned through `desktop.backendPrefs` — adopted 1.8–2.0 s after the reboot with their own backend, pids, starttimes and ports; the ladder still picks xpra; a new launch takes xpra; the relay to an ADOPTED session answers a hello); `cap.cap` IS keeper-limits.CONCURRENT_CAP; stop through the product leaves no recorded pid alive and an EMPTY marker census. test-desktop-apps §1: the guard numbers are IMPORTED, never copied (a comment-stripped grep census over every consumer). **What the fleet image lacks:** deploy/docker/Dockerfile installs bookworm's xpra 3.1.3 (nothing enabled) while the rung was built and measured on 6.5.3 — the 3.1 html5 protocol differences (packet names such as `display-configure` / `keyboard-config`, the native `x11_keycodes` keymap path, the clipboard forms, the four 6.5.3 traps) are an OPEN issue recorded in design §9-1 and the Dockerfile comment, never tested from the dev box. Still open (§9): clipboard images (text only), popups beyond the pane, HiDPI at device resolution.
- **P8-2 chunk x4 (2026-09-22) — THE vnc-display RUNG FITS THE WINDOW TOO (owner, from a screenshot of a Calculator small in the top-left of a 1280x800 black root: "就算是vnc也不能这样啊，完全无法做自动贴合，尺寸匹配吗？"):** on a whole-display rung the keeper is the window manager's one job — the APP-FIT step moves the app's top-level to 0,0 and resizes it to the framebuffer (xdotool, one chained act, 2–5 ms, no WM needed — measured on a bare-X xterm and a GTK3 calculator) the moment the app maps a window after ready, on every SetDesktopSize a viewer sends (the bridge reports it, the keeper debounces 250 ms and reads the size the server ACTUALLY took), and every tick as a belt (a hand-moved window is back within a tick; a settled one is never touched); a second top-level of the app (a dialog) keeps its size and is nudged inside the framebuffer. Whether the DISPLAY follows the VibeSpace window is the rung's `fit` column: **Xvnc (TigerVNC; the fleet image, and this box since tigervnc-standalone-server) FOLLOWS** — noVNC's `resizeSession` asks, the keeper's argv spells `-AcceptSetDesktopSize` (measured: 1280x800 → 900x600 answered in 43 ms, the framebuffer changed at 50 ms; `=0` is the one lever that refuses), so pane = framebuffer = canvas = the app's window at net zoom 1 with zero black pixels (measured through chrome: 898×553 after connect, 898×573 and 1178×693 after two resizes, each settled within 25–340 ms); **Xvfb+x11vnc is FIXED** (no SetDesktopSize in x11vnc 0.9.17) — the app is fitted to the fixed 1280x800 once, the browser scales, and the window's chip names the limit: `fixed 1280x800 (Xvfb) — install tigervnc for a window that follows` (zh+ja); xpra fits from the client (x2), the shared desktop is never touched. `fb`/`fit` are facts on the record (a refusal — no xdotool — is named once and re-asked in a minute; the app is shown where X put it). The fleet image gains `xdotool wmctrl` (the WM path — xfwm4 there — asks for a maximise through wmctrl: STATED, NOT MEASURED, design §9-8). **Close-out:** the window's title bar names the APP WINDOW on this rung too (the record's `appTitle` — the title the fit's own enumeration read, as text; the label until one is readable; no icon yet — design §9-10), and under the UI scale the display follows the ON-SCREEN pane at net zoom 1 (measured at 125 %: 640x500 layout px ⇒ an 798x550 framebuffer, the pointer lands on the same X pixel); an app whose title xwininfo cannot print (xterm's COMPOUND_TEXT) is still fitted — the old parser dropped it. Gates: test-desktop-apps §9 (PURE plan + wiring pin), test-desktop-display §6 (the measurement as a gate, with the `=0` control), test-desktop-app-keeper §13 (the real keeper on the real Xvnc), test-desktop-vnc-fit (heavy chrome: both spellings).
- **P8-2 r5 (2026-09-22) — the verifier's five, each reproduced and closed with a control:** (1) on the xpra rung the APP resizing or moving its own window (GNOME Calculator's mode switch: 898x616 ⇒ 700 ⇒ 370 px, 40 % of the pane; `xdotool windowsize/windowmove`) is fitted back by the client's bounded BELT — one corrective configure-window per window per 500 ms, three rapid undos ⇒ the app wins until the pane changes — and a SECOND top-level or a dialog the app puts off the screen is placed wholly inside the pane (measured through chrome: the calculator stays at 100 % through Ctrl+Alt+A/B; the pre-fix client measured 78.0 % then 41.2 %); (2) a viewer the window-live policy REFUSES (Watch mode on an agent-held window) now gets a picture: the bridge cuts its INPUT packets out one by one and relays the hello / pings / acks / window packets (all-or-nothing per chunk dropped the hello: 15 s, "no hello from the xpra server"); (3) a crashed xpra no longer leaks its Xvfb (~100-190 MB): the keeper proves a dead leader's members by the per-app XAUTHORITY every process on the display carries, in the teardown, the leftover census and the boot belt; (4) the vnc-display fit belt no longer forks 3 processes per session every 5 s: settled + unwatched = 0 forks per tick, a watched or recently-used session 1 (xwininfo), the rest on a 60 s slow belt; (5) UNDER A WINDOW MANAGER (the fleet image starts xfwm4 on this rung) the fit acts on the app's CLIENT inside the WM's frame and maximises it through the WM — measured with the fleet image's own xfwm4 4.18: the old rule picked xfwm4's 5x5 helper window as the app; now the frame is exactly the framebuffer, the title is the app's own, and the WM keeps it so through the app's own resizes and a root resize.
- **P8-2 x5 (2026-09-22) — SEVERAL CLIENTS = ONE ACTIVE VIEWER (owner: "直接block掉非active客户端的app界面…" + "仿照terminal…可以手动take over"; design §7.5):** an app window open on several clients has exactly ONE active viewer — the first to attach; its pane sizes the app and only its keys / pointer / clipboard reach it. Every other client shows the overlay (the app's name, "Active on another client", **Resume here**) and NO picture — its resize and its keys reach nothing (the bridge opens no upstream for it). Resume here takes the window over at once (the pane flips before the server answers; the app re-fits to the new pane — measured 648 ms on xpra) and the previous client is blocked; when the active client closes, the most recently active remaining client takes over by itself. Both rungs (xpra and vnc-display). While an agent DRIVES the window every client is Watch: the picture scaled to fit the pane (never cropped), no input, nothing sent that could change the app's geometry; Take over from Watch makes that client the active one. The terminal's size-override made the default for desktop apps; the singleton Desktop window is not governed. **2.369.156 defaults (the round-3 verifier's INFO items — the owner can object):** when the ACTIVE client's connection drops or its page reloads, its seat is held for **5 s** (the others stay blocked) and the same window — or the reloaded page's new window in the same tab — takes it back; only then does the most recently active remaining client take over. On the xpra rung the Watch picture is never scaled UP: a pane larger than the app shows it crisp at 1:1, centred (smaller panes still scale down to fit). Also closed: a blocked pane names the app by its own window title on the xpra rung too (not the launch label); a reconnecting active window takes its seat back at once instead of waiting up to 30 s for the server to notice its dead connection; the hosted upstream xpra page (`/api/desktop/:id/xpra-ui/`) can only watch — it can no longer take the active seat.
- **The singleton Desktop window is the SAME code**: its window renders through `src/lib/vnc-view.js` and its `/api/vnc` upgrade is the singleton's fixed id on the same bridge — no twin (test-vnc-view pins it byte-for-byte against the retired window).
- **The launcher is CATALOG-FIRST (2026-09-14, owner item A):** ⚙ → Desktop apps… / the toolbar Apps button opens a dialog a user who has never seen X11 can use — an intro line in plain words (what this does, what to click; zh+ja), the backend chip in the ladder's words, RUNNING (Open / Stop + the slot count, derived from the LIVE list) above the catalog whenever non-empty, the APPLICATIONS catalog as a grid of cards (label + one-line exec/reason + an SVG icon by registry category — icons.js, never emoji), ONE click launches and the card shows a launching state (spinner, disabled, aria-busy, "Launching…") until the record answers, an absent binary or a parked row is dimmed with its reason (never hidden), an empty catalog says so in plain words and opens the command form by itself, and "Advanced: run any command" (exec/args/cwd + Launch + Recent) sits under a disclosure collapsed by default whose open state persists in user state (`desktopAppAdvancedOpen`, merge-only PATCH); cards and the disclosure are buttons (keyboard-reachable), ≤768px is one column. **The geometry defect it replaced (reproduced 2026-09-14 at 1000×800@2x — the owner's picture):** the dialog WIDTH lived on the BODY (`min-width: min(760px, 92vw)`) inside `.dialog`'s fixed 440px + overflow:hidden, and focusing the Command input scrolled `.dialog` itself by inputRight − clientWidth = 308px (an overflow:hidden box is still a scroll container) — title off-left, ✕ mid-header, the Applications column a 64px sliver of its own buttons (263px at 777px; nothing at ≤768px, where `.dialog{width:95vw!important}` + one column hold). Width now lives on `.dialog.desktop-launch` (the .guided-cli-dialog precedent — the THIRD instance of the anti-pattern style.css documents), the Advanced columns are `minmax(0,1fr)` (three nowrap Recent entries turned 1fr/1fr into 126/692px, the latent squeeze), every programmatic focus is `{preventScroll:true}`, and test-desktop-app-window MEASURES a fresh open at 1000×800 / 777×800 / 480×640. Its persistence exposed an older defect: `normalizeUserState` dropped every non-session key, so `desktopAppRecents` had never survived a reload since 2.369.96 (fixed in routes/persistence.js — see its entry).
- **RESOURCES ARE REPORTED, NEVER A STOP (2026-09-25, the owner's ruling after a Google Chrome desktop app was stopped 3 s after ready at a summed-RSS "2.0 GB", its profile deleted, Chrome parked 60 min):** the keeper samples each session's processes once a minute and measures memory as a FOOTPRINT (ΣPss; RssAnon+RssShmem only for a single process; never a sum of VmRSS). Over the threshold (2 GiB; a browser row 3 GiB / 250 % CPU) the window's chip shows the reading ("CPU 12% · 6.2 GB (PSS)", the sentence in its tooltip), ONE notice says "Google Chrome is using 6.2 GB (PSS) — Stop it from the Desktop panel if that is not what you expect" (r2: again only after three samples in a row under 90 % of the line, at most once an hour per session, and re-sent if no browser tab was connected to receive it), telemetry records it — and the app keeps running: no stop, no park, no refused launch. A browser row's profile is removed only by YOUR ending (Stop, a Scale ▸ relaunch, the browser's own exit); an idle-out keeps it. Only the headless OpenCode serve is still stopped for resources.
- **B-bfe6 (2.369.166) — A BROWSER AS AN APP (owner: "应用里面也可以加入一下浏览器"; design §7.7):** the launcher lists Chromium (chromium → chromium-browser → google-chrome, the first on PATH — "Google Chrome" when that is the one) and Firefox (firefox → firefox-esr) under a "Browsers" heading with one sentence, in the section and in each card's tooltip: *This is your own browser window (an app); the Agent browser is separate.* It is a HUMAN'S window on the xpra rung like every app — never an agent's (no automation flag ever reaches its argv) — with its OWN profile: `data/desktop-apps/<id>/profile`, created 0700, removed when the session ends (stop, the browser exiting, a failed start; boot finishes a removal a crash interrupted) unless "Keep the profile after it closes" was ticked; never the user's real ~/.config/chromium or ~/.mozilla and never an agent-browser profile (refused by name). An optional "Open URL" (http/https only — a bad one is refused by name in the dialog and again by the server) opens that page; the window's title bar shows the page title xpra reports. Downloads go to the user's real Downloads folder (HOME is not redirected); Chrome still creates its crashpad directory `~/.config/google-chrome/Crash Reports` and opens the user's shared NSS store `~/.local/share/pki/nssdb` whatever `--user-data-dir` says (measured) — neither holds a cookie, history or login. A SNAP browser (Ubuntu's firefox / chromium-browser) is offered only when this instance's data dir is inside $HOME outside a hidden folder (a snap cannot see /tmp or ~/.hidden) — otherwise it is dimmed with that reason. The idle timeout, the runaway guard and the single active viewer are unchanged. **r1:** a dimmed browser card says a SHORT translated reason ("Snap: cannot reach the data folder"; the full sentence is its tooltip) and the keep-profile checkbox sits left of its text. An AGENT cannot open a browser row: `vibespace-window open chromium` (or any `url` / `keepProfile`) is refused `browser_is_human` (403), and `list` does not offer browser rows — the agent's web road is `vibespace-browser`.
- **Round 3, Lane A1 (2.369.166) — A COPY YOU MAKE IN THE APP LANDS WITH NO CLICK, EVEN ON PLAIN HTTP (docs/design-desktop-apps-seamless.md §3.1; the owner: "why does a copy inside the app need a click?"):** on an `http://<hostname>` page (not a secure context — no clipboard API) the xpra pane stamps the user's own trusted copy chord (Ctrl/⌘+C or +X forwarded to the app); the app's clipboard token that arrives within Chrome's 5 s transient-activation window (measured: an async `execCommand('copy')` works 0…4800 ms after the key, fails from 5200 ms) is written by `execCommand('copy')` from a hidden textarea — no click, a "Copied to your clipboard" toast. One chord allows at most one write; a copy nobody made on this page (an agent, a timer, another client), a late one, one after a non-copy key or on a view-only pane keeps the "Copied in the app — click to copy" chip; the browser refusing falls to the chip. The FIRST chip a device needs on plain http also shows a one-time hint "Enable HTTPS for seamless copy" + "How to enable HTTPS" (docs/getting-started.md: Chrome flag / `tailscale serve` / Caddy — no TLS in the product), remembered in localStorage `vibespace.desktopCopyHintShown`, dismissable. Secure pages unchanged (the API). Measured on the real rung with GNOME Calculator: the token ~30 ms after Ctrl+C, the clipboard reads the value with zero clicks. A mouse copy (Edit ▸ Copy) and the RFB rung keep the chip. **A r1:** the keyboard stays in the app after such a copy (the hidden textarea used to take the focus and drop it to the page, so every key after a copy vanished) — measured: the next digit reached the calculator with no click.
- **Round 3, Lane A2 (2.369.166) — THE APP'S EXIT CLOSES ITS WINDOW; THE OUTER ✕ IS THE APP'S OWN CLOSE (docs/design-desktop-apps-seamless.md §3.2; the owner: "after I close the inner window I have to close the outer one again"):** when the app ends — its own ✕, a quit, the Stop button, the idle stop — every client closes that desktop-app window itself with a short toast ("Calculator exited" / "… stopped"); nothing lingers as a dead picture. What keeps the window: a `failed` record (its red sentence), an agent holding a window lease on the app (the agent marker stays), and an exit that left a window on the display (a launcher script that exited while the app it started still shows a window — the keeper counts the windows at the exit, before the teardown). A dialog or a popup closing is not the app exiting. A window replayed from the layout whose app already ended opens nothing (a toast says so). The title bar's ✕ (and the tab ✕, the taskbar menu's Close, Ctrl+\\ x, the phone's ✕) on the ACTIVE xpra pane asks the APP to close its main window — the app may show its own "save?" dialog, and then nothing closes; a second ✕ within 5 s stops the app (the Stop). A blocked or Watch pane, a window an agent holds, the whole-display (RFB) rung and a window with no app window left close the pane as before (the app keeps running). Measured on the real rung with two clients: the calculator's own ✕ ⇒ both windows gone in ~1.03 s; the outer ✕ ⇒ the calculator process gone in 0.26–0.78 s and both windows with it; Stop ⇒ the window gone in ~0.3 s. **A r1:** what the app does with the ask is its own — xterm hangs up its shell: with bash the first ✕ closes it (both windows gone in ~0.4 s); a shell that survives the hangup (zsh's first-run menu in a HOME with no .zshrc) keeps it, and the second ✕ within 5 s — the toast says so — stops it.
- **Round 3, Lane A3 (2.369.166) — THE APP'S SCALE FOLLOWS VIBESPACE'S OWN SCALE, AND EACH WINDOW CAN CHANGE IT (docs/design-desktop-apps-seamless.md §3.4; the owner: "the app's DPI should be adjustable, ideally derived from VibeSpace's own DPI"):** `desktop.appScale: auto` now derives from the launching client's devicePixelRatio × its UI scale (a 2× screen at UI scale 125 % = 2.5×: GTK widgets 2× via GDK_SCALE, text 2.5× via the display's font dpi 120; 1.25 ⇒ widgets 1×, text at 120 dpi; 1.5 or more on the screen ⇒ at least 2×; up to 3×). The window's status bar says the scale AND where it came from ("2.5× · auto", "1.5× · chosen", "2× · Settings"; the tooltip names the numbers). A ⋯ button on the bar (and the window's right-click / taskbar menu) offers Scale ▸ Auto (n×) / 1× / 1.5× (text only in GTK apps) / 2×: a pick asks first — the app restarts, unsaved work in it is lost — then the same app starts at that scale and the old one stops; the SAME VibeSpace window shows the new session on every client (no second window, no closed one). Disabled with the reason while an agent holds the app, while another client is the active viewer, for a browser app (its profile belongs to its session) and on a whole-display rung (no scale there). The global setting stays the default for new launches.  Measured (xpra 6.5.3, GNOME Calculator 50, xterm, headless Chrome at DPR 2 + UI 125 %): the launcher's own card ⇒ `2.5×, 120 dpi, auto`, GDK_SCALE=2 and Xft.dpi 120 inside the app's display; the same 40×10 xterm 1.23× larger than at 2× / 96 dpi (644×324 vs 524×264 device px) (the calculator's minimum stays 720×1232 — button-bound); Scale ▸ 1.5× ⇒ the same window on both clients follows the successor in 102–103 ms, ready in ~1.5 s at GDK_SCALE 1 / 144 dpi, the old session stopped. **A r1:** the client that picked the scale keeps the active seat on the new session (the keeper carries it across the relaunch; before, the other client — blocked until then — always won it and the chooser saw "Active on another client"). Not done: explicit 2.5× / 3× rows; the agent-lease gate is client-side only.
- **Round 3, Lane B (2.369.177) — SEAMLESS WINDOWS: AN APP THAT DRAWS ITS OWN TITLE BAR GETS NONE OF OURS (docs/design-desktop-apps-seamless.md §3.3, D3 as recommended; the owner: "if the inner window has full window controls (a close button …), the outer window should show nothing"):** a desktop app whose main window carries `decorations: 0` (client-side decorations — a GTK header bar; GNOME Calculator; xterm has no such key) is shown with NO VibeSpace title bar and NO status strip — both fold to 0 height (the 1 px frame, in the active colour when focused, and the eight resize handles stay). **Moving it is the app's own header bar:** xpra hands the app's _NET_WM_MOVERESIZE to us (`initiate-moveresize`), and the VibeSpace window enters its title bar's OWN drag from that press — grid snap, shake bypass, merging into a tab group, dropping onto a desktop preview all work exactly as from our title bar; the X window stays at 0,0 (measured: a 120×64 drag moves the window 120/64; X and the client both say 0,0). The app's own ─ □ buttons (GTK 4.22 paints all three under xpra 6.5.3 — measured) minimize / maximize / restore OUR window, and restoring ours re-maps the app. **The bars come back** on a 250 ms hover of the window's top edge (a pointer merely crossing it reveals nothing) or while Alt is held — both at once, OVER the app (the app is never re-fitted by a hover); they linger 1.5 s after the pointer goes back into the app or Alt is released, and fold at once when the pointer leaves the window. **Paused (the bars show) while:** an agent holds the app (the user must see an agent is driving — the mode badge is in the strip), the window is in a tab group (its tab bar is the title bar), the viewport is a phone (≤ 768 px — the title bar is the way back), the picture is not connected (the status and Reconnect must show; a blocked second client shows its bars above the "Resume here" overlay). **Escape hatches:** the hot zone, Alt, the taskbar item's right-click menu (Show window frame ▸ Auto / On / Off — per APP, remembered in user state and synced to every client; Scale ▸; Keep running; Stop app), the same rows under the revealed ⋯, and Settings → Window → Seamless desktop app windows = Off (today's frame for every app, live). With the strip folded the plain-http copy chip floats at the pane's BOTTOM-right (never over the header bar's own ─ □ ✕ at the top-right) and hides itself after 10 s, and the idle stop's last minute is a toast naming Keep running. While the bars are revealed the window's top edge is still a RESIZE (the bars sit under the resize handles), and dragging a maximized seamless window off by its header bar or our title bar tells the app it is no longer maximized (its button is maximize again; one click maximizes). A click into an app's picture now activates its VibeSpace window (it never did: the pane cancels its pointerdown). Gate: test-desktop-seamless (fast), test-xpra-client §2d/§2e, test-desktop-xpra-window §12 (heavy, with a forced-false control copy and live controls for the three verifier fixes).
- **Lane D (a) (2026-09-25) — A SCALE IS A SCALE; THE WINDOW FOLLOWS IT; CHROME GOES SEAMLESS (docs/design-desktop-apps-seamless.md §3.3 / §3.4 "Lane D (a)"; the owner, two screenshots: "从2x切换到1.5x之后出现大量白边，你窗口尺寸计算不对" + "Chrome的顶部标题栏似乎不会自动隐藏？"):** a fractional scale (1.25 / 1.5 / 2.5 — chosen, from Settings or derived) scales the app's widgets AND text: drawn at the next whole GDK_SCALE and shown smaller (a resampled picture — a little softer than a whole scale; integers stay 1:1); the record carries what it was drawn at (`gdkScale`, `pictureScale`) and the chip's tooltip says "widgets 1.5×, text at 96 dpi. Drawn at 2× and shown at 75% — a fractional scale is resampled." The Scale ▸ rows are plain "1.5×" (no "text only"). A Scale ▸ relaunch RESIZES the window so the app keeps its logical size (2× → 1.5× shrinks it to 0.75, back again exactly; capped at the workspace; not when maximized / in a tab group / on the phone) — the app's own background stays the same share of the window. Every connect maps the app at its final size (no band while a CSD app's bars fold); an app whose minimum is larger than the pane is scaled to fit AND fills the pane (no side bands). The Google Chrome / Chromium row draws its OWN frame (the keeper sets the profile's `browser.custom_chrome_frame` once, when absent — Chrome otherwise asks xpra's WM for a frame and shows no ─ □ ✕): both VibeSpace bars fold, the top-edge hover / Alt bring them back, Chrome's tab strip drags our window by exactly the gesture and its ─ □ ✕ minimize / maximize / close OUR window. Honest residual: not maximized, Chrome's own 5 px resize band and rounded top corners show inside our 1 px frame (xpra does not forward the extents). Also fixed: scrolling ghost rows in every scrolling app, an alpha window cleared under each draw. Gates: test-desktop-apps §14, test-xpra-client §7, test-desktop-seamless §6, heavy test-desktop-xpra-window §15 / §16 (each with a CONTROL copy), test-desktop-app-keeper §20 re-pinned.
- **Lane D (b) (2026-09-25) — THE SCALE CHIP IS A BUTTON, AND EVERY APP HAS ITS OWN DEFAULT SCALE (the owner: "那个1.5x 已选的提示直接可以点快速切换" + "最好加入可以在app启动前那个app选择界面调整每个app默认dpi的能力"; docs/design-desktop-apps-seamless §3.4 note):** the scale chip in a desktop-app window's status strip ("1.5× · chosen") opens the Scale ▸ rows right where it is — a click, or Enter / Space (it is a keyboard control); the rows and the confirm-then-relaunch are the same as ⋯ → Scale ▸. While the window cannot relaunch (still starting; a whole-display rung) the chip is plain text and its tooltip says why. In the launch dialog, every catalog card on a machine whose rung scales apps (xpra) has a small control beside it — "Auto" or "1.5×" — choosing Auto (Settings → Desktop app scale) / 1× / 1.5× / 2× / 2.5× / 3× there sets that APP's default scale without launching it (remembered in user state per app, synced to every client — another client's open dialog updates in place). From then on every launch of that app (its card, a Recent row, a typed command of the same program) starts at that scale and the chip says "1.5× · App default". The order: a window's own Scale ▸ pick > the app's default > an explicit Settings → Desktop app scale > Auto (derived from the screen). A window's Scale ▸ marks the app's default, says "1.5× is this app's default" when it runs at it, offers "Make 2× the default for this app" when it runs at another scale (no relaunch) and "Forget this app's default". 2.5× and 3× are offered too (each a real scale by lane D (a)'s rule: 2.5× = drawn at 3×, shown at 83 %; Chrome scales whole from its font dpi). On a paired machine the default rides the launch; an agent older than this ignores it and the chip shows what it ran at. **Verify fix (2026-09-25):** a client whose connection dropped for a moment re-reads every per-app choice (default scale AND Show window frame ▸) when it comes back, and a save changes only that app's entry of what the server holds at that moment — a stale page can no longer wipe another client's choice for another app; a save the server refuses is taken back off the screen and the toast says why. Gate: test-desktop-app-scale (fast, §8 the loader), test-desktop-xpra-window §14, test-desktop-remote §7.
- **r2 (2026-09-14) — what the round-1 verifier found on this section's own claims, each reproduced on the real keeper and closed with a control:** a picture server whose binary vanished after the probe CRASHED THE SERVER (an unhandled spawn `error`) and left its X alive and unrecorded — every spawn is awaited, every binary re-statted at spawn, every part committed the moment its pid exists; the recorded picture PORT was an assumption (x11vnc keeps the number on `[::1]` when the IPv4 bind loses a race, so a stranger speaking RFB on 127.0.0.1 became the window's picture) — the record turns `ready` only when the 127.0.0.1 LISTEN socket is held by our picture server's session; Stop signalled three pids and left the application's children (a wrapper's `sleep`, a `yes` at 100 % CPU) — every leader is a detached SESSION stamped `VIBESPACE_DESKTOP_APP=<id>`, stop empties the session (group + every member, the env marker identifies a straggler once its leader is gone), verified; the runaway guard sampled one pid and was blind to a launcher whose work is in a child — it samples the whole session set (`live.pids` says how many); a desktop-singleton session was reaped at every boot because vnc.js's `running` is its LAST status() answer (false at boot) — the keeper asks `refresh()` before every verdict; the bring-up was a string switch on the rung — it is a TABLE LOOKUP (`recipes[via]` → `desktop-display.RECIPES[name]`), proven with a fourth rung driven end to end with the keeper untouched; and the bridge counted every browser→server frame as INPUT while noVNC sends a FramebufferUpdateRequest on every repaint, so the DA3 idle stop never fired for a session any tab showed — only KeyEvent / PointerEvent / ClientCutText / the QEMU key event count now (a protocol the sieve cannot follow falls back to today's rule, the direction that never reaps a live user). The suite's own exit sweep used to SIGKILL by bare pid — including its own process — printing ALL PASS then exiting 137; it now sweeps by pid+starttime and the fixture is a throwaway `sleep`. test-desktop-app-keeper 115 / test-desktop-display 63 / test-desktop-apps 98.
- **r3 (2026-09-14) — the round-2 verifier's four, each reproduced on the real keeper and closed with a control:** a Stop that lands while the window still says `launching` (or `POST …/stop` in that window) used to answer `exited` and leave a live Xvfb + a passwordless x11vnc under that record for ever — now `stop()` marks the record stopping, tears down, WAITS for the bring-up it cancelled (bounded by the launch's own deadline), tears down again and only then writes the verdict, a part spawned after the record DIED is killed the moment it is known, the bring-up's `finally` reaps on every exit, and the next boot runs ONE marker census (`VIBESPACE_DESKTOP_APP=<id>` over this store's ids) so even a SIGKILL of the server mid-stop leaves nothing; the runaway guard now counts the work of children the app has already REAPED (`cutime+cstime`), so `yes | head` churn at 110 % trips in ~4 s where round 2 read 0 % — with the honest boundary that a child killed with its whole process GROUP (coreutils `timeout`) is reaped by init and is invisible to any /proc reader over the session (a per-session cgroup odometer is the follow-up); the bridge's RFB table is DERIVED from the shipped noVNC (EnableContinuousUpdates is 10 bytes, not 4 — on a TigerVNC server the idle stop could have reaped a session being typed in; PointerEvent is 6 or 7 by its marker bit; ClientFence is variable); and an identity nobody recorded is NOT proven — a record with null starttimes never makes boot adoption signal a recycled pid (three strangers used to be SIGKILLed by group), the safe direction being 'left alone', while our own stragglers are still found by the marker. BOUNDARY: on a machine with no readable /proc a session cannot be proven ours after a restart and is recorded as ended and LEFT RUNNING.
- **r4 (2026-09-14) — the round-3 verifier's two, each reproduced on the real keeper and closed with a control that fails alone:** a Stop that lands BETWEEN two parts of the bring-up (X and the picture server already recorded, the app's spawn in flight) answered `exited` with the app recorded under it and left `/bin/sleep 3600` alive under that record — r3 settled on the in-flight bring-up only if it was still in the map AFTER the first teardown, and that teardown's own SIGTERM waits (≥ 100 ms per part) were long enough for the bring-up to finish and be forgotten; `stop()` now captures the bring-up BEFORE it signals anything and always settles on that. And the session model counted a session by its session id, so a member that `setsid()`s itself — a daemonising launcher, `nohup … & disown` typed into the app's own terminal — survived Stop AND the app-exit path under `exited`/`failed`, and the runaway guard could not see it either (a setsid'd `yes` read 0 % for 12 s); every teardown now ends with the marker census (`VIBESPACE_DESKTOP_APP=<id>`, the identity those processes INHERITED — the reader boot already used), so `exited`/`failed` mean "nothing of this session's runs" on every terminal path, and the guard's sample unions the same census (ONE /proc environ walk ≈ 50 ms per teardown and per sample, measured over ~3,850 pids). Honest boundary: on a machine with no readable /proc the census is empty and r3's "recorded as ended, left running" stands — the header now says so instead of "no orphans, ever". test-desktop-app-keeper 155.
- **Measured on the dev box (Ubuntu 25.10, Wayland session, x11vnc 0.9.17):** a session = 3 processes / 87 MB RSS with xmessage (Xvfb 1024x768 67 + x11vnc 15 + app 5), 279 MB with gnome-calculator (app 195); ready in ~400 ms; Xvfb answers `-displayfd` in ~40 ms; x11vnc answers a silent RFB client after ~320 ms; x11vnc EXITS under `WAYLAND_DISPLAY` (stripped for every process on a private display); a SIGKILLed server is a CLEAN close to noVNC (the reconnect ladder keys on "still wanted"); the layout autosave fires only after a real pointerdown and not inside the 5 s post-load window (pre-existing, every window type).
- **Not in P8-1 / not verifiable here:** xpra end to end (P8-2); remote machines (every route + fact refuses a non-local `host` by name — the daemon op is P8-2+); `xterm` and the real `xpra` could not be installed on this box (apt locked by a running release-upgrader), so the exit measurements used xmessage / gnome-calculator, a fake `xpra` on PATH for the probe leg and a fake `Xvnc` shim for the fleet spelling of `vnc-display` (the real TigerVNC binary is absent here too) — the fleet image gets `xterm` + `xpra` (package only, nothing enabled); Wayland-only apps cannot run on a private X display (a registry row may say `needsWayland`, refused honestly); the 200 ms / 1 Mbps usability of `vnc-display` is inferred from §4.7's ranking, not measured.

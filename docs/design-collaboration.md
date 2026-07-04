# Design: Team Collaboration & Remote Sessions

Status: **v2 design** (supersedes the gateway/agent model). Shipped so far: password auth, Docker, first-run onboarding, shell terminals, in-product CLI login.

## The deployment model (decided)

**One cloud container per user.** VibeSpace stays strictly single-user — no in-app accounts, no multi-tenancy. The company provisions a container per person (compose/k8s), injects that person's credentials as env vars, and hands them a URL + password. Everything below builds on this.

Consequences:
- Auth stays the simple per-instance password (already shipped).
- "Presence / shared sessions inside one instance" is out of scope — collaboration happens through **shared storage** and **shared remote hosts**, not shared UIs.
- Admin provisioning is the natural place for org-wide config (S3 keys, default hosts, SSH keys).

## Remote sessions: SSH out, not agents in

VibeSpace never gets installed on target machines. Your VibeSpace container is the **SSH client**; remote machines (GPU cluster, build boxes) just need sshd.

### How sessions run remotely

The local dtach + wrapper architecture doesn't care what the child process is:

| Mode | Local child process | Notes |
|------|--------------------|-------|
| Remote terminal | `ssh -t user@host -- dtach -A /tmp/vs-<id> claude …` | dtach **on the remote** too — a network drop doesn't kill the agent; reattach = re-ssh + dtach attach |
| Remote chat | `ssh user@host -- dtach … claude --output-format stream-json …` piped through the local chat-wrapper | stream-json flows over ssh stdio; the existing wrapper/normalizer stack works unmodified |
| Remote shell | `ssh -t user@host` under the shell adapter | works today by typing ssh in a Terminal window; the host manager makes it one click |

Key property: the **remote transcript lives on the remote host** (`~/.claude` there), so resume/fork must target the same host — the session record carries `host`, and the sidebar groups by host. This is consistent by construction (no cross-host file sharing of transcripts, which we already ruled out — corruption + PID-lock false positives).

### Host manager + bootstrap (new UI)

"Hosts" panel (sidebar section or settings page):
1. **Add host** — `user@hostname`, key selection (container's `~/.ssh`, admin-provisioned or generated in-app + "copy public key" for authorized_keys), connectivity test.
2. **Bootstrap** — one click runs a versioned script over ssh: checks/installs `dtach`, `node` (if absent, via nvm), `claude` (native installer), `codex` (optional). Idempotent; streams output into a terminal window so nothing is hidden.
3. **Log in remotely** — opens a terminal running `ssh -t host claude` for the CLI's own login flow (same UX as local in-product login).
4. **New session on host** — the New Session dialog gains a Host dropdown (local + configured hosts).

Session discovery on remotes (which sessions exist there) runs over ssh on demand (`ls ~/.claude/projects` + lock files) — no daemon needed; cached with a short TTL.

## Unified mounts: one company bucket, per-user prefixes

### Provisioning convention (admin side)

Each user's container is started with:

```
VIBESPACE_S3_ENDPOINT=https://s3.company.internal
VIBESPACE_S3_BUCKET=company-workspace
VIBESPACE_S3_PREFIX=users/alice
VIBESPACE_S3_ACCESS_KEY=…
VIBESPACE_S3_SECRET_KEY=…
```

Recommended IAM scoping per user key:
- **RW** on `users/<me>/**`
- **RO** on `users/*/shared/**` — only content each user places under their own `shared/` sub-prefix is visible to others (share-by-location, no ACL churn)
- optional **RW** on `team/**` for a common area

The container needs FUSE for mounting: `devices: [/dev/fuse]` + `cap_add: [SYS_ADMIN]` in compose (template provided). rclone ships in the image.

### Mounts manager (new UI)

A "Mounts" panel managing `data/mounts.json`; each entry spawns a supervised `rclone mount` and shows health:

1. **My storage** — one click mounts `s3:$BUCKET/$PREFIX` at `/workspace/s3` (auto-offered on first run when the env vars are present).
2. **Share a folder** — pick any folder under your prefix that lives in `shared/` (or the UI moves/copies it there), then copy the **share link**:
   `vibes://s3/company-workspace/users/alice/shared/whisper-finetune`
   A share is just a *location* — revoke by moving the folder out of `shared/`.
3. **Import a share** — paste a link → mounted read-only at `/workspace/shares/<name>`. The link carries no secrets; access comes from the importer's own key (RO on `users/*/shared/**`).

### Honest limits (documented in the UI, not buried)

- **rclone mount is not POSIX**: no locking, weak rename semantics, eventual visibility. Perfect for datasets, artifacts, docs, checkpoints. **Wrong for live git working trees and for `~/.claude` transcript dirs** — code collaboration stays on git; agent transcripts stay on local/host volumes.
- Two writers on the same prefix = last-writer-wins at file granularity. The `shared/` convention is RO for importers precisely to keep this safe; use `team/` knowingly.
- If the org later wants real POSIX shared volumes, JuiceFS (metadata DB + same S3) slots into the same Mounts manager as a second backend type.

## First-run experience (shipped)

Fresh container → onboarding wizard: what VibeSpace is → live Claude/Codex install+login status with one-click in-product login → pick a folder, first session. Re-runnable from ⚙ → "Show welcome tour". Next iteration: when `VIBESPACE_S3_*` is present, the wizard offers "Mount my company storage" as a step.

## Roadmap

| Phase | Scope | Size |
|-------|-------|------|
| **P0 — done** | Auth, Docker (verified E2E), onboarding wizard, shell terminals, in-product CLI login, chrome customization | shipped |
| **P1** | Mounts manager MVP: env-driven "my storage" mount, share links, RO import; rclone + FUSE in the image/compose | M |
| **P2** | Host manager: add/test hosts, key handling, one-click bootstrap (dtach/node/claude), remote **terminal** sessions via ssh+remote-dtach | M |
| **P3** | Remote **chat** sessions (stream-json over ssh through the existing wrapper), host-tagged session records, remote discovery over ssh | M |
| **P4** | Wizard S3 step, share management polish (list my shares, revoke = move), JuiceFS backend option | S–M |

## Open questions for the admin side

1. IAM per-user keys with the `shared/` RO pattern — confirm the object store supports prefix-scoped policies (MinIO/AWS both do).
2. Container FUSE privileges — acceptable in the target runtime? (k8s needs a device plugin or privileged; plain docker compose is trivial.)
3. SSH key distribution: admin-injected (`~/.ssh` volume) vs in-app generated + user self-serves `authorized_keys`. Both supported; pick the default.
4. Claude/Codex seats: remote hosts each need their own CLI login (transcripts + creds live per host). Fine for personal workstations; for shared cluster nodes decide between per-user unix accounts (clean) or a service account (shared history — probably not wanted).

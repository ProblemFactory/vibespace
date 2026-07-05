# Mounts (shared storage — S3, Drive, WebDAV, SFTP, VibeSpace)

The sidebar's **Remote** tab (Storage section) manages rclone-backed mounts of several source types — the shared-storage half of the [collaboration design](design-collaboration.md). **Add mount** picks a type and shows only that type's fields:

| Type | What you provide |
|------|------------------|
| **S3 / MinIO** | endpoint, bucket, prefix, access + secret key |
| **Google Drive** | the OAuth token JSON from `rclone authorize "drive"` (run it on any machine with a browser, paste the result), optional folder |
| **WebDAV / Nextcloud** | URL, username, password/app-token |
| **SFTP** | ssh host/user/port, remote path, private-key path *or* password |
| **Another VibeSpace** | the other instance's URL + a bridge token (`vsmt_…`) it minted for you |

All secrets are AES-256-GCM encrypted at rest in `data/mounts.json`; passwords rclone needs obscured are obscured only at mount time (argv is never used).

## My storage

**My storage** is an S3 bucket you designate as your personal store — it's also the owner key used to mint S3 shares. Configure it **in-app**: Storage → *Configure S3…* (or **Edit** on the card). No environment variables required.

> Legacy `VIBESPACE_S3_*` env vars are still honored: on first boot with no in-app config, they're imported once into the encrypted config and the card is marked "imported from env". After that the in-app config is canonical (edit/remove it in the UI; it rides in config export/import). You can drop the env vars once imported.

## Mount mechanics

- Mounts live under `VIBESPACE_MOUNT_BASE` (default `~/vibespace-mounts`, the Docker compose sets `/workspace`); each mount can override with a custom absolute path.
- `rclone mount` runs **detached** — mounts survive server restarts (adopted from `/proc/mounts` on boot; anything desired-but-dead is auto-remounted).
- Credentials are AES-256-GCM encrypted at rest in `data/mounts.json` and passed to rclone via child env (never argv).
- Status dots: green = mounted, red = error (hover for the rclone log tail), grey = unmounted. **Open** browses the mount in the file explorer.
- rclone mounts are right for **datasets, artifacts, docs, checkpoints** — not live git working trees or `~/.claude` (no POSIX locking).

## Sharing a folder

**Share a folder** mints a **down-scoped credential** for any folder under your prefix using your own key:

- With `mc` installed (bundled in the Docker image): a permanent MinIO **service account** restricted to that folder — revoke = delete, from the "Shares I created" list.
- Without `mc`: **STS AssumeRole** temporary credentials (≤7 days; the link records the expiry).

The share link (`vibespace-share:v1:…`) **embeds the credential** — treat it like a key: send over company chat, never public channels. Read-only or read-write is your choice at mint time.

## Importing a share

**Import share link** → paste → the folder mounts under the granted mode. Revoked service-account shares stop working immediately; expired STS shares show EXPIRED.

# Remote hosts (same sidebar tab)

The Remote tab's **Hosts** section manages ssh machines that run agent sessions (see [design-collaboration.md](design-collaboration.md)).

- **Add host** — name, user, host, port; auth via your `~/.ssh` keys (default) or a VibeSpace-generated ed25519 key (the public key is shown for `authorized_keys`). The row shows live status after a connectivity test: latency + which tools are already installed (READY / NEEDS SETUP badge).
- **Bootstrap** — a step-progress dialog (Connect → dtach → Node.js → Claude CLI) with an expandable live log; idempotent, installs only what's missing (package manager with passwordless sudo, dtach source build, nvm, Claude native installer).
- **New session on a host** — the New Session dialog has a Host dropdown (terminal mode only until P3). The spawn chain is `local dtach → pty-wrapper → ssh -t → remote dtach → login shell → claude`: a network drop or local server restart doesn't kill the remote agent; the local side re-attaches through both dtach layers.
- Remote sessions appear in the main session list **grouped under a `host:` prefix** with a host badge, and the backend-filter popover gains a **Location** section (Local / each host, multi-select).
- **Remote chat sessions**: pick a host + Chat mode — stream-json flows over a clean `ssh -T` pipe (no remote dtach: a pty layer would corrupt the JSON). Trade-off: an ssh drop ends the remote process (transcript survives remotely, resume-able); terminal mode survives drops via remote dtach.
- Limitations (later): resuming remotely-discovered stopped sessions, merging remote discovery into the main session list, remote transcript search. Closing a remote *terminal* window locally detaches it — the agent keeps running under the remote dtach.

## Proxied endpoints (Cloudflare) — signing gotcha

If the S3 endpoint sits behind a CDN/proxy that rewrites the `Accept-Encoding` header (Cloudflare does), rclone's SigV4 signature breaks with `SignatureDoesNotMatch` — rclone signs that header, most other clients don't. Symptoms: listing works but reads fail (old rclone), or everything fails (rclone ≥1.70). VibeSpace handles this automatically:

- rclone **1.63–1.69**: the mount adds `--s3-use-accept-encoding-gzip=false` — everything works, including temporary-credential (STS) shares. This is the recommended rclone range for proxied endpoints.
- rclone ≥1.70 (aws-sdk-go-v2 always signs the header): a one-time probe detects the mismatch and falls back to **V2 signatures** for permanent-credential mounts. STS shares can't use V2 (session tokens require V4) — the mount fails with an explanatory error; use rclone 1.63–1.69, a service-account share (`mc` installed on the owner side), or un-proxy the endpoint (grey-cloud the DNS record).

The probe result is persisted per mount (`v2Auth`), so it runs once.


## Mounting another VibeSpace (the bridge)

Two VibeSpace instances can mount each other's folders over a built-in **WebDAV bridge**, without exposing an S3 bucket or ssh account.

**On the sharing side** — Storage → **Share via bridge**: pick a folder (absolute path on that machine) and RO/RW, and it mints a **scoped mount token** and a `vibespace-mount:v1:…` link. The token:

- is a random 256-bit value, stored **hashed** (a leaked `data/mount-tokens.json` can't be replayed);
- carries its own **root directory** (chroot — path traversal and symlink escapes are rejected server-side) and **ro/rw** flag (ro tokens 403 on every write);
- is listed under **Bridge tokens** and revocable any time (revoke = the mounter loses access immediately).

**On the mounting side** — paste the link into **Import share link** (or **Add mount → Another VibeSpace**). It mounts the shared folder read/write per the token. Under the hood this is a WebDAV mount against the sharing instance's `/dav` endpoint with the token as a Bearer credential, so **any** WebDAV client (rclone, macOS Finder, Windows Explorer, phone file managers) can mount it too — the token is the only credential; `/dav` bypasses the normal cookie login.

The bridge implements the WebDAV subset clients need (OPTIONS, PROPFIND, HEAD, GET with Range, PUT, MKCOL, DELETE, MOVE, COPY); locks aren't implemented (rclone doesn't use them).

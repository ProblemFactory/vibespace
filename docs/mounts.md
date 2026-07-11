# Mounts (shared storage — S3, Drive, WebDAV, SFTP, VibeSpace)

The sidebar's **Remote** tab (Storage section) manages rclone-backed mounts of several source types — the shared-storage half of the [collaboration design](design-collaboration.md). **Add mount** picks a type and shows only that type's fields:

| Type | What you provide |
|------|------------------|
| **S3 / MinIO** | endpoint, bucket, prefix, access + secret key |
| **Google Drive** | click **Connect Google Drive** — a guided sign-in, no terminal or token wrangling (advanced users can still paste an `rclone authorize` token) |
| **WebDAV / Nextcloud** | URL, username, password/app-token |
| **SFTP** | ssh host/user/port, remote path, private-key path *or* password |
| **Another VibeSpace** | the other instance's URL + a bridge token (`vsmt_…`) it minted for you |
| **Custom (any rclone backend)** | an rclone backend name (dropbox, b2, azureblob, mega, …) + its config params as `key = value` lines |

All secrets are AES-256-GCM encrypted at rest in `data/mounts.json`; passwords rclone needs obscured are obscured only at mount time (argv is never used).

> **rclone not installed?** Mounts are powered by [rclone](https://rclone.org). If it isn't on the machine, the Storage section shows a one-click **Install rclone** button that downloads the official static binary into `data/bin` (a version we've verified end-to-end) — no terminal, no package manager.

### Connecting Google Drive (no terminal)

Click **Connect Google Drive** in the Add-mount dialog. VibeSpace runs the OAuth handshake for you:
- **Same machine** (VibeSpace and your browser on one computer): a Google sign-in page opens, you approve, and the connection completes on its own.
- **Remote deployment** (VibeSpace on a server): after you approve, the browser tries to reach `127.0.0.1` and shows a "can't connect" page — that's expected. Copy that page's address from the address bar and paste it into the box that appears; VibeSpace finishes the exchange. The Drive token is filled in automatically either way.

## One flat list of connections

Storage is a single list of connected places — S3, Google Drive, Nextcloud/WebDAV, SFTP, a folder someone shared, or another VibeSpace. They're all equal; there is no special "my storage" slot. **Connect storage** adds any type (add = connect, one step). Each row is one connection: a green dot when connected, a folder button to browse it in the file explorer, and a disconnect/remove button.

> Team deployments can still set `VIBESPACE_S3_*` — on first boot it's imported once as a normal S3 connection named "My storage" (auto-connected). After that it's just another row you can rename or re-point (its connection settings stay deployment-managed and can't be edited or deleted in-app).

## Submounts (`remote:path`)

Think of it as rclone syntax: the part before the colon is the connection, the part after is a path. **Every storage row can hold submounts** (↳ rows nested under it) — one R2/S3 token, one Google Drive sign-in or one SFTP host backing any number of mounted paths (＋ on the row). Refreshing the parent's token/keys heals every submount under it at once.

- **Bucket-scoped tokens are auto-detected**: some S3/R2 tokens can only access specific buckets and can't open the account root. Mounting such a token at the root would "succeed" and then error on every file. VibeSpace probes first and marks the record **credential-only** — a key icon in place of the status dot, no Connect action — and asks you to add a submount with a specific bucket.
- Bucket names are strict: lowercase letters, digits and hyphens only (`example-prod-data`, not `Example_Prod_Data`). If the token can't access the path you typed, the mount fails immediately with a pointer instead of connecting a dead folder.
- **Google Drive re-authorization**: if Google reports the saved sign-in as expired/revoked (`invalid_grant`), the row's error line and the edit dialog offer **Re-authorize Google Drive…** — the same guided sign-in used when adding a Drive connection, writing the fresh token back into the existing record.

**Edit** (✎) exposes every connection field for your own mounts — S3 endpoint/bucket/keys, custom-rclone parameters, WebDAV/SFTP hosts and secrets, Drive token. Every field is **prefilled with its real current value, secrets included** (access/secret keys, OAuth tokens, passwords, bearer tokens, rclone params), so you read and edit them directly; on save only the fields you changed are written (an unchanged secret isn't re-encrypted). For custom-rclone mounts, clearing a parameter's value removes it. **Duplicate** (⧉) derives a new standalone mount from an existing connection.

## Sharing a folder from your S3 storage

Any S3 connection that holds your own full credentials shows a **share** button on its row: it mints a down-scoped link for a subfolder (see below). Imported shares and non-S3 connections can't mint (only full-credential S3 can), so they don't show it.

## Mount mechanics

- Mounts live under `VIBESPACE_MOUNT_BASE` (default `~/vibespace-mounts`, the Docker compose sets `/workspace`); each mount can override with a custom absolute path.
- `rclone mount` runs **detached** — mounts survive server restarts (adopted from `/proc/mounts` on boot; anything desired-but-dead is auto-remounted).
- Credentials are AES-256-GCM encrypted at rest in `data/mounts.json` and passed to rclone via child env (never argv).
- Status dots: green = mounted, red = error (hover for the rclone log tail), grey = unmounted. **Open** browses the mount in the file explorer.
- rclone mounts are right for **datasets, artifacts, docs, checkpoints** — not live git working trees or `~/.claude` (no POSIX locking).

### Read/write caching (since 2.110.0)

Every rclone mount runs with `--vfs-cache-mode full`: reads are cached chunk-wise on local disk, writes land locally first and upload in the background (~5s after close). The cache is **persistent per mount** (`data/vfs-cache/<id>`, override the root with `VIBESPACE_VFS_CACHE_DIR`) — a write that hadn't finished uploading when the daemon crashed **resumes uploading after reconnect**. Per-mount disk budget: Settings → *Storage mount cache size (GB)* (default 10 GB, applied on the next connect). Caveat: a "saved" file may still be uploading for a few seconds — the object store lags the local view briefly.

### Auto-recovery (since 2.110.0)

A connected mount is **supervised**: if the rclone daemon dies (crash, OOM kill) or the mount starts hanging IO (unreachable backend — it's torn down to protect the server), the health watchdog reconnects it automatically with backoff (1 → 2 → 5 → 10 min cap). The row shows "auto-reconnecting (attempt N)" while it retries. Auth-class failures (revoked share, expired credential) are **not** retried — those need you, and the row keeps the actionable error instead. Only an explicit **Unmount** stops the supervision.

## Sharing a folder

The **share** button on an S3 connection row mints a **down-scoped credential** for a subfolder, using that connection's own key:

- With `mc` installed (bundled in the Docker image): a permanent MinIO **service account** restricted to that folder — revoke = delete, from the "Shares I created" list.
- Without `mc`: **STS AssumeRole** temporary credentials (≤7 days; the link records the expiry).

The share link (`vibespace-share:v1:…`) **embeds the credential** — treat it like a key: send over company chat, never public channels. Read-only or read-write is your choice at mint time.

## Importing a share

**Import share link** → paste → the folder mounts under the granted mode. Revoked service-account shares stop working immediately; expired STS shares show EXPIRED.

# Remote hosts (same sidebar tab)

The Remote tab's **Hosts** section manages ssh machines that run agent sessions (see [design-collaboration.md](design-collaboration.md)).

- **Add host** — name, user, host, port; auth via your `~/.ssh` keys (default) or a VibeSpace-generated ed25519 key (the public key is shown for `authorized_keys`). The row shows live status after a connectivity test: latency + which tools are already installed (READY / NEEDS SETUP badge).
- **Bootstrap** — a step-progress dialog (Connect → dtach → Node.js → Claude CLI) with an expandable live log; idempotent, installs only what's missing (package manager with passwordless sudo, dtach source build, nvm, Claude native installer).
- **New session on a host** — the New Session dialog has a Host dropdown (both terminal and chat modes are supported — see Remote chat sessions below). The terminal spawn chain is `local dtach → pty-wrapper → ssh -t → remote dtach → login shell → claude`: a network drop or local server restart doesn't kill the remote agent; the local side re-attaches through both dtach layers.
- Remote sessions appear in the main session list **grouped under a `host:` prefix** with a host badge, and the backend-filter popover gains a **Location** section (Local / each host, multi-select).
- **Remote chat sessions**: pick a host + Chat mode — stream-json flows over a clean `ssh -T` pipe (no remote dtach: a pty layer would corrupt the JSON). Trade-off: an ssh drop ends the remote process (transcript survives remotely, resume-able); terminal mode survives drops via remote dtach.
- Shipped since: resuming remotely-discovered stopped sessions (`createSession({resumeId, hostId, cwd})`), live remote discovery in the sidebar's Recent/History host switchers, and remote transcript search/history (the JSONL is pulled into a local cache — see [Session Management](sessions.md#recent--history-on-a-remote-host)). Closing a remote *terminal* window locally detaches it — the agent keeps running under the remote dtach.

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


## Importing an existing rclone config

If you already have remotes configured with `rclone config` on another machine, **Import rclone config** (Storage footer) takes the whole `rclone.conf` (find it with `rclone config file`): paste it, tick which remotes to bring in, and each becomes a mount. Remotes that wrap another remote (`crypt`, `alias`, `combine`, `union`, `chunker`) are shown greyed — they reference a second remote the simple importer can't resolve; recreate those with the Custom type if needed. All values are encrypted at rest.

## Advanced: custom backends and options

Every mount type accepts an **Extra rclone options** field (`key = value` per line) that's merged into the rclone config — for custom API keys, tuning flags (`chunk_size`, `upload_concurrency`), or provider quirks.

For a backend not in the type list, pick **Custom (any rclone backend)**: give the rclone backend name and its params as `key = value` lines (see [rclone.org/docs](https://rclone.org/docs/) for each backend's keys — e.g. Backblaze `b2` wants `account` + `key`, Dropbox wants `token`). All values are encrypted at rest.

Google Drive can use **your own OAuth client** (Google Cloud project) instead of rclone's shared one — fill the optional client ID/secret fields; the guided Connect flow uses them too.
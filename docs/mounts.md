# Mounts (shared S3 storage)

The sidebar's **Mounts** tab manages rclone-backed S3 mounts — the shared-storage half of the [collaboration design](design-collaboration.md).

## My storage

When the instance is provisioned with company storage env vars (see [deployment.md](deployment.md)):

```
VIBESPACE_S3_ENDPOINT / VIBESPACE_S3_BUCKET / VIBESPACE_S3_PREFIX
VIBESPACE_S3_ACCESS_KEY / VIBESPACE_S3_SECRET_KEY
```

the Mounts tab shows a **My storage** card — one click adds and mounts your bucket prefix.

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

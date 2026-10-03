# VibeSpace — Kubernetes deployment (one instance per user)

Deploy VibeSpace on any Kubernetes cluster with an RWO StorageClass, an ingress
controller, and (optionally) cert-manager. Each user gets an isolated pod + PVC.

## Layout

- `docker/Dockerfile` + `docker/entrypoint.sh` — the container image. **Pets model**:
  the app is baked as a known-good git checkout at `/opt/vibespace-dist`; the
  entrypoint seeds it into the per-user PVC (`~/vibespace`) on first boot and runs
  from there, so a user can `git pull` to self-update and fork/modify VibeSpace,
  and it all survives pod rebuilds. Persistent per-user customization (apt packages,
  env) goes in `~/.vibespace-init.sh`, replayed each boot.
- `helm/vibespace-user/` — one Helm release = one user (Deployment + PVC + Service
  + Ingress + Secret + optional NetworkPolicy). All values are placeholders.

## Build & push the image

```
docker build -f deploy/docker/Dockerfile -t <your-registry>/vibespace:<tag> .
docker push <your-registry>/vibespace:<tag>
```

## Add a user

```
helm install u-<user> deploy/helm/vibespace-user -n vibespace \
  --set user=<user> --set password=<pw> \
  --set domain=<your-domain> \
  --set storage.className=<your-rwo-sc> \
  --set image.repository=<your-registry>/vibespace --set image.tag=<tag>
```

The user reaches `https://<user>.<domain>`. TLS: set `ingress.wildcardCertSecret`
to a pre-issued `*.<domain>` wildcard secret (recommended — a wildcard needs a
DNS-01 issuer), or `ingress.clusterIssuer` for a cert-manager per-host cert.

## Clerk SSO (optional)

Set `clerk.publishableKey` + `clerk.allowedEmails` to put an instance behind
Clerk sign-in (password auth still works alongside; with no password set, Clerk
alone enables auth). `allowedEmails` is a comma list — `@example.com` entries
allow a whole domain; an EMPTY list rejects everyone, so each per-user instance
must name its owner. One-time Clerk dashboard step: the session token must
carry an email claim — add `{"email": "{{user.primary_email_address}}"}` under
**Sessions → Customize session token** (or create a JWT template named
`vibespace` with that claim; the login page tries the template first). The
server verifies tokens against Clerk's JWKS (derived from the publishable key)
— no Clerk secret key is needed anywhere.

## Fleet telemetry (optional)

Point every instance's `telemetry.forwardUrl` at
`https://<collector-host>/api/telemetry/ingest` with a shared
`telemetry.forwardToken`; give ONE instance the same token as
`telemetry.ingestToken` — that instance becomes the collector and its
⚙ → Diagnostics report gains a per-instance **Fleet** section. Batches carry
anonymous instance ids and error names/stacks/metrics only, never content.

## Notes

- **Home volume ownership**: the pod sets `fsGroup: 1000` so the non-root `vibe`
  user (uid 1000) can write the freshly-provisioned RWO volume.
- **No cluster credentials in the pod** (`automountServiceAccountToken: false`).
- **No hostname env**: VibeSpace is origin-relative; the only per-instance env is
  `VIBESPACE_PASSWORD`. Hostname lives only in the Ingress.
- **Updates**: app updates = `git pull` in the PVC (no pod rebuild, sessions
  survive); base-image updates = a rolling image bump (rebuilds the pod).
- **NetworkPolicy**: `networkPolicy.enabled` + `allowedInternalCidrs` lock down an
  agent container's egress (needs a NetworkPolicy-enforcing CNI). Off by default.

Deployment-specific values (your domain, registry, storage class, issuer,
allow-listed CIDRs) belong in a private values file, not in this repo.

## Company presets — OAuth clients and integration keys (optional)

Some integrations need a credential a user would otherwise have to obtain
themselves: the Google OAuth client Drive and Gmail sign in with, a Lark app's
id/secret, a browser key. The cluster supplies these as COMPANY PRESETS; each
instance shows where its presets come from in ⚙ → Integrations & keys, and
**a user's own key always wins** over a preset.

### Add or rotate a company OAuth client: edit ONE Secret

Every user's pod mounts the namespace-wide Secret `vibespace-cluster-presets`
(read-only, at `/etc/vibespace/presets`). Create it once, and use the SAME
command to add, rotate or remove a client later — **every instance picks the
change up within ~2 min, with no helm upgrade and no restart**:

```
kubectl -n vibespace create secret generic vibespace-cluster-presets \
  --from-file=gdriveClients=gdrive-clients.json \
  --from-file=integrations=integrations.json \
  --dry-run=client -o yaml | kubectl apply -f -
```

Both keys are optional (omit a `--from-file` you do not use). The files hold
the same JSON the chart always took:

| Secret key | File shape | Read by |
|---|---|---|
| `gdriveClients` | `[{key, label, clientId, clientSecret}, …]` — Google OAuth clients (Drive mounts, Gmail mounts and Gmail channel accounts). Name the one channels should default to `channels` when you provide more than one | `src/mounts.js` (`drivePresets`) |
| `integrations` | `[{id, key?, label?, values: {…}}, …]` — one entry per registry row id (`src/integration-registry.js`); `values` keys are that row's field keys | `src/server/integration-store.js` |

How it works: Kubernetes updates a mounted Secret in place by atomically
swapping the volume's `..data` link (within the kubelet's sync period — 1 min
by default — plus its watch delay); the server watches the directory
(`src/server/cluster-presets.js`), re-reads it once, re-applies the presets
live (the Integrations window, the storage and channel sign-in dialogs, every
consumer's next request) and logs ONE line naming which keys were added,
removed or rotated — never a value. A file that cannot be parsed keeps the
previous presets in effect and is reported (log + the Integrations window);
it never takes the instance down. A mount stores only a preset's KEY, so a
rotated secret reaches every mount (a running rclone mount at its next
remount) and a withdrawn key is reported by name, never silently replaced by
another client.

### A new user inherits them; per-user blocks are overrides

A new user's release needs no preset block at all — the pod mounts the
cluster Secret. A release MAY carry its own `presets.override`
(`{gdriveClients: [...], integrations: [...]}`) — or, as before, the legacy
`gdrive.clients` / `integrations:` blocks, which now mean the same thing. The
override is layered over the cluster Secret **per key**: an entry whose key
the cluster also names replaces it for that user; the cluster's other entries
stay. The override lives in the release's own Secret and is projected next to
the cluster's; changing it is a helm upgrade that touches only that Secret,
so the pod does not roll and the instance picks it up live.

Chart values: `presets.volume` (default `true`), `presets.clusterSecret`
(default `vibespace-cluster-presets`), `presets.mountPath` (default
`/etc/vibespace/presets`), `presets.override`. Both projected sources are
`optional`: a missing Secret or key projects nothing (the instance then says
"Company presets: none — ask your admin"), never a pod that cannot start.

### Migrating an existing release (one roll, the last)

A release installed before this chart keeps its env (`VIBESPACE_GDRIVE_CLIENTS`
/ `VIBESPACE_INTEGRATIONS`, read at boot) until its next `helm upgrade`, which
switches it to the volume: the env goes, the volume comes — that roll is the
last one a preset change ever needs. Before it, check the VibeSpace version
INSIDE the pod (a helm upgrade does not update the app in the PVC): an app
older than 2.369.200 reads no presets directory, so either let the user
update first or keep `presets.volume=false` (the env form, rendered exactly as
before) until it does. The pod's entrypoint says it on every start (a
`WARNING: company presets are mounted at … but this VibeSpace (…) predates the
presets reader` line in the pod log) until the checkout carries the reader —
the boot auto-update normally brings it with the first pull. Create `vibespace-cluster-presets` first so the
switched instances have the company's clients from their first boot.

### Rules

- **Never `value:`, always a Secret** — the chart keeps every credential in a
  Secret (the projected volume, or `secretKeyRef` in the env form). A
  `value:` prints the credential in `kubectl get deploy -o yaml`.
- **Self-hosting without Kubernetes**: point `VIBESPACE_PRESETS_DIR` at a
  local directory holding `integrations.json` / `gdrive-clients.json` (and
  `override/…`), or keep the env: `VIBESPACE_GDRIVE_CLIENTS`,
  `VIBESPACE_INTEGRATIONS`, and the single-field form
  `VIBESPACE_INTEGRATION_<ID>_<FIELD>` (id and field upper-cased, `-` → `_`,
  e.g. `VIBESPACE_INTEGRATION_LARK_APPSECRET`) for docker-compose. The
  directory wins for a kind it holds a file for; the env is the fallback.
  When the JSON form and the single-field form both name the same row, **the
  JSON form wins** and the server says so once.
- **A mistyped block never takes the instance down**: it is logged
  (`[presets] … could not be read` / `[integrations] … unparseable`) and the
  previous presets (or none) stay in effect.
- **Which rows suit a company preset**: register-once, everyone-may-use
  credentials (a Lark app — same tenant only; a Google OAuth client). **Not**
  per-seat keys (a CloakBrowser license): one cluster key there means the
  cluster pays for every user, and users share the vendor's concurrent-session
  cap.
- **Who can read them**: the files are readable by the instance's own user —
  the same exposure the env had. Agent sessions get a sanitized environment
  (no `VIBESPACE_*` but their own), but run as that user.

Values are never copied into the instance's `data/`, so rotating the Secret
rotates every consumer on every instance; a withdrawn default leaves the row
answering "not configured" with the reason, never serving a stale value.

## Public URLs / NAT relay (optional)

To expose a machine's port as a shareable public link — or pair two machines
that are both behind NAT — run a small [frp](https://github.com/fatedier/frp)
relay (third-party, Apache-2.0). Setup guide + config template:
[`deploy/frp/`](frp/README.md). Point instances at it via the `frp.*` Helm
values (or `VIBESPACE_FRPS_*` env for a self-run instance). Entirely optional —
without it, device-to-device port forwarding still works over the data plane.

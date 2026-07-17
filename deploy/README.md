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

## Public URLs / NAT relay (optional)

To expose a machine's port as a shareable public link — or pair two machines
that are both behind NAT — run a small [frp](https://github.com/fatedier/frp)
relay (third-party, Apache-2.0). Setup guide + config template:
[`deploy/frp/`](frp/README.md). Point instances at it via the `frp.*` Helm
values (or `VIBESPACE_FRPS_*` env for a self-run instance). Entirely optional —
without it, device-to-device port forwarding still works over the data plane.

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

# frps login plugin — one relay token per VibeSpace instance

The frp relay (`deploy/frp/`) used to let in anyone holding its ONE shared `auth.token`. This plugin makes every
VibeSpace instance log in with **its own token, bound to its own public names, revocable** (design q-051, the owner's
decision 2026-10-20). A stolen token reaches that one instance's public names — never another instance's, never a hub.

- **The instance side** (VibeSpace ≥ 2.369.326, nothing to configure): the frp plugin mints a token the first time the
  relay starts (or on **Plugins › Public URLs › Mint**), keeps it in `data/relay-token.json` (0600 — not in the vault, so a
  restart re-publishes without the second password) and logs in as `user = <instance id>` with
  `metadatas.token = {{ .Envs.VIBESPACE_RELAY_TOKEN }}` (the value rides frpc's environment only). Its Relay card shows
  the line to run here: `relay-admin add vi-<id> <sha256 of the token> <label>`.
- **The relay side** (this directory, Node ≥ 20, no dependencies): `plugin.js` answers frps's `Login` / `NewProxy` /
  `CloseProxy` calls from a table only `relay-admin.js` and the plugin's own first-claims write.

## Install on the relay host

    sudo apt install nodejs            # any Node ≥ 20 at /usr/bin/node
    sudo useradd --system --no-create-home --shell /usr/sbin/nologin frps-plugin
    sudo mkdir -p /opt/frps-login-plugin
    sudo cp plugin.js relay-admin.js table.js /opt/frps-login-plugin/
    printf '#!/bin/sh\nexec sudo -u frps-plugin /usr/bin/node /opt/frps-login-plugin/relay-admin.js --table /var/lib/frps-plugin/relay-instances.json "$@"\n' | sudo tee /usr/local/bin/relay-admin >/dev/null
    sudo chmod 755 /usr/local/bin/relay-admin
    sudo cp frps-plugin.service /etc/systemd/system/ && sudo systemctl daemon-reload
    sudo systemctl enable --now frps-plugin      # creates /var/lib/frps-plugin + /var/log/frps-plugin (0700)
    relay-admin init --grace 7d                  # the shared token keeps working for 7 days
    curl -s 127.0.0.1:7001/healthz               # {"ok":true,…}

Then add to `/etc/frp/frps.toml` (keep `auth.token` as it is during the grace) and `sudo systemctl restart frps` — every
frpc reconnects (each public URL is unreachable for ≈ 5–30 s):

    [[httpPlugins]]
    name = "vibespace-relay"
    addr = "127.0.0.1:7001"
    path = "/handler"
    ops = ["Login", "NewProxy", "CloseProxy"]

Subscribe exactly these three ops: any other op is refused `unknown_op` (fail closed).

## What it answers

| frps op | accepted | refused (`reject_reason` — the instance's card reads it) |
|---|---|---|
| Login | the token's sha256 is the instance's row; a cluster row's + the pod name matches its `userRe`; during the grace an older build's shared-token login (one `legacy` audit line per use, also for an id not registered yet) | `bad_token` · `revoked` · `unknown_instance` (after the grace) · `legacy_token_retired` (after the grace) · `table_unreadable` |
| NewProxy | the same identity, the proxy name (without frps's `<user>.` prefix) starts with one of the row's prefixes (`pf-`, `vibespace-instance`), every subdomain / custom domain is free or already this owner's (a free one becomes this owner's — the first claim, kept across restarts) | `name_not_yours` · `name_in_use:<owner label>` (+ a `conflict` audit line) · the Login reasons |
| CloseProxy | always (the live list forgets the proxy; the name stays its owner's) | — |

The audit (`/var/log/frps-plugin/audit.jsonl`, one JSON line per call: `at, op, user, label, proxy, subdomain, verdict,
reason, addr`) never holds a token or a hash. `GET /healthz` → `{ ok, instances, clusters, names, live, legacyLive,
grace: { open, until }, lastLegacyAt, since }`.

## relay-admin

    relay-admin add vi-0123456789ab <sha256> my-hub     # the line from the instance's Relay card
    relay-admin rotate vi-0123456789ab <sha256>         # after "Rotate" on the card (also brings a revoked id back)
    relay-admin revoke vi-0123456789ab                  # a stolen token: every NEW login / proxy refused at once
    relay-admin new-token                               # a cluster token + its sha256 (the token goes into the chart's secret)
    relay-admin add-cluster fleet <sha256> '^[a-z0-9][a-z0-9-]{0,39}$'
    relay-admin release vs3f9a1c2b4d                    # free a name (an instance retired, a name handed over)
    relay-admin grace off                               # end the shared token (after `legacy` shows none for 24 h)
    relay-admin list · owners · legacy

A revoke cannot cut a login that is already live (frps has no per-client kick): it ends at that client's next reconnect,
or now with `sudo systemctl restart frps` (a 5–30 s blip for every public URL).

## Vouching (`--knock-file`): REFUTED against frps 0.70.0 — do not use it

**REFUTED (2026-10-30, a production incident).** frps 0.70.0 keys the control connection AFTER the login with its own
`auth.token`, and frpc keys it with ITS `auth.token` (frp v0.70.0: `server/service.go` `newControlReadWriter(conn,
svr.auth.EncryptionKey())`, `client/control_session.go` `newControlReadWriter(…, d.auth.EncryptionKey())`, `pkg/auth`
`key: []byte(token)`). The vouch only rewrites the login's `privilege_key` — it cannot change that key. So while frps
holds a non-empty `auth.token`, a frpc started without it (a hub restarted with its vault locked) is TAKEN — the audit
says `"vouched":true` — and frps drops the connection about 16 ms later, unable to read its first frame: no `NewProxy`
ever reaches this plugin, frps logs `client exit success`, frpc logs `login to server success` again every 1–20 s and
nothing else. Once frps runs on `auth.token = ""`, a frpc without the shared token logs in by itself. The vouch works
only when frps's `auth.token` is empty — and then it is not needed.

Without the flag the same frpc is REFUSED at the login (`token in login doesn't match token from configuration`) — a
refusal the hub reads by name; with it the frpc is taken and dropped in silence. Run the plugin WITHOUT `--knock-file`:
if it was added to the unit's `ExecStart`, remove it, `sudo systemctl daemon-reload && sudo systemctl restart frps-plugin`.
The flag still works as before (test-frps-plugin ⑦b) so that removing it is the relay admin's own step.

**The check (the canary for any change to how an instance logs in):** register an instance, restart its hub with the
vault LOCKED, publish — then look for a `NewProxy` `accept` line for that instance in the audit AFTER the restart. A
`Login` `accept`, `"vouched":true` or `login to server success` proves nothing. The hub reads it the same way since
2.369.365 (lane frp-token-proof): only a proxy that ran on a frpc started without the shared token — the same frpc run —
tells it the relay no longer asks for it; a frpc the lock started without the token is restarted with it at the unlock;
a frpc whose logins the relay keeps dropping is ONE For-you item («the relay accepts this instance's login but closes
the connection right after»). test-frps-plugin ⑦c models frps 0.70.0's keyed control on a stub frps (no frps binary).

## Ending the grace

1. `relay-admin legacy` shows no use for 24 h and `curl 127.0.0.1:7001/healthz` shows `"legacyLive":0`.
2. Was the plugin started with `--knock-file`? Remove the flag first (see «Vouching» — REFUTED); if it must stay until
   step 3, empty the knock file FIRST: `sudo sh -c ': > /etc/frp/knock'` — the plugin re-reads it at the next login and
   vouches with the empty token frps takes from step 3 on.
3. `relay-admin grace off`, then set `auth.token = ""` in `/etc/frp/frps.toml` and `sudo systemctl restart frps`.
4. Each instance stops sending the shared token by itself within about a minute: its frp plugin reads the relay
   refusing it in frpc's log and restarts frpc without it (the card's 「The relay no longer asks the shared token」
   does the same by hand) — WITHOUT `--knock-file` only: a vouching plugin takes that login and frps (on `auth.token =
   ""`) drops the frpc still keying with the shared token, so nothing is refused for the hub to read. Once a proxy RAN on
   a frpc started without the shared token (a login is no proof), the instance drops its vault entry `frp:token` (at the
   next unlock when the vault is locked) and says so in For you. Nothing shared is left.

## Rollback

Remove the `[[httpPlugins]]` block from `frps.toml` and restart frps: the relay is the shared-token relay again (the
instances still send it during the grace; a minted instance token is harmless without the plugin).

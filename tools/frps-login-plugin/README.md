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

## Vouching (optional): no shared token even during the grace

frps checks its own `auth.token` AFTER this plugin, on the login the plugin hands back. Started with
`--knock-file /etc/frp/knock` (a 0600 file holding frps's `auth.token`, readable by the `frps-plugin` user), the
plugin hands a login it accepted by the instance's OWN token back with frp's privilege key for frps's token
(`md5(token + timestamp)`, frp's token auth) — so a registered instance never needs the shared token, and a restart
re-publishes with its vault locked from the day it is registered. Legacy logins are handed back unchanged (frps
judges their knock). The plugin re-reads the knock file whenever it changes (no restart): emptied, it vouches with the
empty token frps takes once `auth.token = ""`; removed, it vouches no more. Keep `auth.additionalScopes` empty while vouching (frps would check work connections against the
shared token too). **UNCONFIRMED against a real frps 0.70.0** — check it on the canary: register it, restart its hub
with the vault locked; its card must turn green and the audit show `"vouched":true`. Without the flag nothing
changes (the plugin answers `unchange`).

## Ending the grace

1. `relay-admin legacy` shows no use for 24 h and `curl 127.0.0.1:7001/healthz` shows `"legacyLive":0`.
2. Vouching (`--knock-file`)? Empty the knock file FIRST: `sudo sh -c ': > /etc/frp/knock'` — the plugin re-reads it at the
   next login and vouches with the empty token frps takes from step 3 on (skipped, every registered instance would be
   refused until the plugin restarts).
3. `relay-admin grace off`, then set `auth.token = ""` in `/etc/frp/frps.toml` and `sudo systemctl restart frps`.
4. Each instance stops sending the shared token by itself within about a minute: its frp plugin reads the relay
   refusing it in frpc's log and restarts frpc without it (the card's 「The relay no longer asks the shared token」
   does the same by hand). Once a proxy ran and a login succeeded without it, the instance drops its vault entry
   `frp:token` (at the next unlock when the vault is locked). Nothing shared is left.

## Rollback

Remove the `[[httpPlugins]]` block from `frps.toml` and restart frps: the relay is the shared-token relay again (the
instances still send it during the grace; a minted instance token is harmless without the plugin).

# frp relay for VibeSpace public URLs (self-host)

VibeSpace can expose a port on a machine behind NAT as a shareable link — and
pair two machines that are *both* behind NAT — by relaying through a small
always-on server. This directory is the setup guide + config template for that
server. It is **optional**: without it, port forwarding still works over the
device data plane between machines you've paired; the relay only adds *public*
URLs and NAT↔NAT device pairing.

## Attribution

The relay is [**frp**](https://github.com/fatedier/frp) by fatedier — a
third-party reverse proxy (Apache-2.0). VibeSpace does **not** bundle or modify
frp; you download and run the official `frps` binary. The files here are just a
config template (`frps.example.toml`) and a systemd unit (`frps.service`).
VibeSpace's own side is the **frp plugin** (`⚙ → Plugins → Public URLs`), which
runs the official `frpc` client on the instance.

## Set up the relay (once)

1. Get a cheap VPS with a public IP (any provider; ~1 vCPU is plenty).
2. Install the official `frps` for your arch from
   <https://github.com/fatedier/frp/releases> to `/usr/local/bin/frps`.
3. `sudo mkdir -p /etc/frp && sudo cp frps.example.toml /etc/frp/frps.toml`,
   then edit it — replace every `<PLACEHOLDER>` (at minimum a random
   `auth.token`). `sudo chmod 600 /etc/frp/frps.toml` (it holds the token).
4. `sudo cp frps.service /etc/systemd/system/ && sudo systemctl enable --now frps`.
5. Open the ports on any firewall in front of the box: `7000` (client control)
   and `20000-25000` (TCP proxy range). Add `80` + `443` if you enable the
   subdomain broker.

### Optional: trusted `https://<random>.<domain>/` URLs

For browser-trusted public links, terminate TLS **on the relay** (standard SNI
reverse proxy — no cert on any VibeSpace instance):
1. Point wildcard DNS `*.<DOMAIN>` at the server; set `subDomainHost = "<DOMAIN>"`
   and `vhostHTTPPort = 8080` in `frps.toml` (leave 443 for the terminator).
2. Get a wildcard `*.<DOMAIN>` cert (e.g. `acme.sh --dns <your-provider>` — no
   inbound port needed for DNS-01).
3. Run a TLS terminator on :443 that reverse-proxies to `127.0.0.1:8080`
   (frps's vhost HTTP), passing WebSocket upgrades. A minimal Caddyfile:

       *.<DOMAIN> {
           tls /path/fullchain.pem /path/key.pem
           reverse_proxy 127.0.0.1:8080
       }

VibeSpace's frp plugin auto-detects the backend protocol: a plaintext HTTP
service gets the trusted subdomain; an HTTPS-native or raw-TCP service is
exposed as `https://<ip>:<port>` / `tcp://<ip>:<port>` instead.

## Point VibeSpace at your relay

Set these in each instance's environment (Helm `frp.*` values map to them, or
set them directly for a self-run instance):

    VIBESPACE_FRPS_ADDR=<relay public IP or hostname>
    VIBESPACE_FRPS_PORT=7000
    VIBESPACE_FRPS_TOKEN=<the same auth.token from frps.toml>
    # optional:
    # VIBESPACE_FRPS_SUBDOMAIN_HOST=<DOMAIN>   # enables https://<random>.<DOMAIN>/
    # VIBESPACE_FRP_PORT_MIN=20000
    # VIBESPACE_FRP_PORT_MAX=25000

Absent these, the frp plugin reports "relay not configured" and does nothing —
everything else in VibeSpace keeps working. With them set, enable the plugin
(`⚙ → Plugins → Public URLs → Install/Start`), then publish a forwarded port
from the Remote tab's 🔌 ports dialog, or check "this instance is behind NAT" in
the Pair-a-device dialog to relay a device that's also behind NAT.

The Helm chart wires `frp.addr` / `frp.port` / `frp.token` / `frp.subdomainHost`
values into these env vars — see `deploy/helm/vibespace-user/values.yaml`.

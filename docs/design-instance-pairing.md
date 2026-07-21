# Instance Pairing (B-9069) — design to decision gate

Status: **awaiting direction pick** (parked 2026-07-17; this doc = the "最小可用版设计" the parking note asked for). Two candidate directions, both riding transport we already have.

## What already exists (the 80% we don't build)

- **Mux tunnel + pairing UX**: the device-dial path (`/api/device-dial`, vsht_ hello, reverse forwards, frps subdomain relay for double-NAT) is instance↔daemon today; instance↔instance is the same wire with a VibeSpace server on both ends.
- **Scoped cross-instance auth**: the VibeSpace↔VibeSpace WebDAV bridge (`vsmt_` tokens, chroot + ro/rw) already proves the token model — but only at the FILE layer.
- **Egress borrowing**: exit-proxy (2.186.0) borrows a paired machine's network per command.
- **Session plumbing is backend-neutral**: attach/discovery/normalized `msg` ops all flow over WebSocket with session ids — proxying them to a peer is mechanical.

## Option 2 — resource borrowing (recommended MVP; low risk, immediately useful)

Peer B can use, with per-item grants from A:
1. **A's machines** as session hosts (B's New Session dialog lists "peer:A/h200-cpu-02"): B's create is forwarded over the pair link; the session runs under **A's** keeper/agentd exactly as if A created it; B gets attach/history via proxied ws ops.
2. **A's exits** (`vibespace-exit use peer:A/<machine>`) and **A's mounts** (already possible via WebDAV links — pairing just makes minting one-click).

Trust boundary: B never holds A's ssh keys/tokens — every op executes ON A's server under A's grant table (`data/peers.json`: peer id, granted machines/exits/mounts, ro/rw). §ban-safety holds: **billing identities never cross the link** — sessions B starts on A's machines bill A's configured account for that host (A is granting compute+login, same as today when A shares a machine row).

Build size: ~1 release. Pair handshake (reuse dial-pair mint + frps relay), peer registry + grant UI (Remote tab "Peers" section), create/attach proxying in ws-handler (`peer:` host prefix), discovery merge.

## Option 1 — collaborative sessions ("Google Docs for agent sessions"; ambitious)

Both sides SEE and DRIVE the same session: A's session list gains a "shared with B" flag; B's sidebar shows A's shared sessions; attach proxies normalized `msg` ops + input over the pair link (multi-client sync already handles N viewers — the peer is client N+1 with a network hop).

Extra over option 2: live op fan-out across the link (backpressure), presence/attribution (who typed what), and the big one — **context exposure**: attaching a session shows the ENTIRE transcript (secrets included). Needs per-session sharing (explicit share action, never blanket), read-only vs co-drive, and a revoke that actually detaches.

Build size: option 2 + ~1-2 more releases. Sensible path: ship option 2 first; option 1's sharing rides the same peer registry as a per-session grant type.

## Non-goals (both options)

- No account/subscription token crossing the link, ever (§ban-safety).
- No multi-user identity inside one instance (Clerk SSO stays per-instance).
- Pure file sharing stays on the existing WebDAV bridge.

## Decision needed

Pick: **(2) resource borrowing MVP** / (1) collab sessions / both-sequenced / park further.

# CS unification — local must run the SAME code as remote

**Owner's framing (2026-08-10):** *"CS 分离的意义就是 local 和远端尽可能完全共用除了前端之外的代码"* — and the honest assessment of the campaign up to 2.275.0: parity tests and shared string modules are **scaffolding, not the cure**. They keep two implementations from drifting; they do not remove the second implementation.

This document is the anchor for actually removing it.

## The rule

> `hostId` is a **parameter**, never a branch.
> Server-side logic is written ONCE against a machine handle. The only thing that differs between this machine, an ssh host and a dialed-in device is the **transport underneath that handle**.

Corollary — the reason the asymmetry keeps producing bugs:

> When the same feature has a local twin and a remote twin, **whoever fixes one never exercises the other.** Every incident in the audit followed this shape: the remote fix that took 6 weeks to reach the local scanner; the writer sweep that protected ssh and dial but not local; the `&host=` the gap endpoint never accepted; the prelude copies that drifted between spawn builders.

## What made unification possible (2.276.0)

The local daemon has been a full `DeviceManager` since 2.158.0 — **same binary, same mux protocol, same op surface** (`fs-op`, `run-cmd`, `run-stream`, `open-session`, `open-pipe-session`, `discovery-snapshot`, `tcp-connect`, …). The transport is the only difference. But it lived in a `server.js` variable that `hosts.device(id)` could not return, because that method began with `this.get(id)` (a host-record lookup). So no consumer *could* be written once, even when the author wanted to.

`hosts.setLocalDevice(dm)` + `hosts.device(falsy) → device #0` removes that wall. `deviceBounded` inherits it. A consumer now writes:

```js
const dm = await hosts.deviceBounded(hostId, 8000);  // hostId null ⇒ this machine
await dm.runCmd(…); await dm.fsWrite(…); await dm.openPipeSession(…);
```

## Migration status

Each row is either **UNIFIED** (one implementation, `hostId` is a parameter), **TRANSPORT-ONLY** (the difference is genuinely the transport and cannot be otherwise), or **DIVERGENT** (two implementations = a bug generator, must be migrated).

| Area | Status | Notes |
|---|---|---|
| Pre-resume writer sweep | **UNIFIED** (2.276.0) | `src/writer-sweep.js`; local gained the sweep it never had; ssh keeps its per-op channel as fallback, dial correctly has none |
| Remote shell prelude / node finder | **UNIFIED** (2.274.0) | `src/remote-shell.js` + drift-guard test |
| Session text filter | **UNIFIED** (2.275.0) | `sessionMatchesFilter` in utils.js |
| Usage ledger walk | **PARITY-GUARDED** (2.275.0) | the remote scanner must ship as ONE self-contained file (a host has no checkout) ⇒ code sharing is impossible; behavioural parity test instead. This is the one legitimate exception to the rule. |
| File operations (`/api/file*`) | **DOCUMENTED EXCEPTION** (2.279.1) | local = SafeFs worker pool; remote = `RemoteFs` over `dm.fs*`. Deliberately NOT unified: SafeFs's worker isolation is load-bearing (a hung FUSE mount fills a libuv pool — §2.108.3), and the daemon also carries live session pipes; routing local file ops through it would hand FUSE hangs to the process keeping sessions alive. Revisit ONLY if the daemon gains its own worker/deadline isolation. Until then this is a justified branch, reviewed and recorded — not drift. |
| Session discovery facts | **PARTLY** (2.278.0) | Collectors still 3 (local rich sweep / daemon snapshot / ssh script fallback) — but ALL INTERPRETATION is single-sourced in `src/discovery-facts.js` (bundled into the daemon by esbuild — code sharing IS possible there, unlike the ssh one-file scanner): naming rule (was DRIFTED — local first-line vs remote whole-message-collapsed = one session, two names), tail-id extraction (was 3 implementations feeding claimJsonls with different mention windows), and the PID-reuse guard (the daemon snapshot verified only liveness — a recycled pid = phantom running session; the hole local closed years ago). Remaining: collapse the local collector onto device #0's snapshot (needs snapshot to gain tmux facts + webui-pid enrichment without regressing the 5s-poll hot path). |
| Spawn ladder | **PARTLY** (2.279.0) | The five remote COMMAND-LINE builders collapsed into `buildRemoteExec` (remote-shell.js): one composition (`cd → prelude → resolve → ambient-oat strip → token/acct assigns → exec env parts/tail`), every difference a named parameter; AMBIENT_OAT_UNSET is structural now (it took five hand-edits in 2.267.0), and the redundant double-REMOTE_PRELUDE two builders carried is gone. Drift guard: test-remote-shell fails if ws-handler ever hand-assembles an `exec env` line again. Remaining: the LADDER around the line (tool shipping, account placement, adopt-vs-spawn decisions) is still per-transport control flow. |
| Ctx sync | **UNIFIED** (2.277.0) | `src/ctx-sync.js` — hashed newer-wins sync over the device link for ALL transports; ssh keeps rsync only as the down-link fallback; caps raised to 1000 files/16MB and every skip is REPORTED (serverNotice) — the old dial cap ate a 3MB file invisibly. Local = no sync is TRANSPORT-ONLY (direct dir). |
| Transcript fetch/cache | **PARTLY** | `_fetchRemoteByFind` handles ssh+dial uniformly; local reads the file directly (legitimate — no transport needed). |

## The metric — refined after the first migration round

Branch count (ws-handler 33 · hosts 26 · server 28 · files 18 · sessions 7 · remote-fs 7 as of 2.279.1) stays roughly FLAT by design: a branch that *selects a transport* for one shared implementation is fine. What the campaign kills is **parallel implementations** — the same semantics written twice. That count:

- **Start of campaign**: 9 identified twin-sets (prelude ×11 copies, node finder ×4, writer sweep ×3-with-local-missing, ctx sync ×2 different semantics, spawn line ×5, naming rule ×2 drifted, tail-ids ×3, session filter ×2, usage walk ×2).
- **Now**: 0 unjustified twins. 7 unified (`remote-shell.js`, `writer-sweep.js`, `ctx-sync.js`, `discovery-facts.js` ×2 rules, `buildRemoteExec`, `sessionMatchesFilter`); 2 documented exceptions (usage scanner — must ship as one file to a checkout-less host; file ops — SafeFs isolation is load-bearing), each with a drift/parity guard test.

A NEW parallel implementation needs a table row with its justification, or it's a regression.

## Completed migration round (2.276.0–2.279.1, one night)

1. ✅ Keystone: `hosts.device(falsy)` → device #0 (+ live proof scripts/test-local-device.mjs — real daemon, real socket, real runCmd/fs/snapshot; absence throws honestly).
2. ✅ Writer sweep → `writer-sweep.js` (local gained it; kills self-report).
3. ✅ Ctx sync → `ctx-sync.js` (one semantics; honest caps 1000/16MB).
4. ✅ Discovery interpretation → `discovery-facts.js` (naming un-drifted; one tail-id rule; daemon gains the PID-reuse guard).
5. ✅ Spawn lines → `buildRemoteExec` (five builders, one composition; ambient-oat strip structural).
6. ✅ File ops → documented exception (above).

## Remaining (next rounds, in order)

1. **Discovery collectors** — collapse the local sweep onto device #0's snapshot (snapshot must first gain tmux facts + webui-pid enrichment without regressing the 5s-poll hot path).
2. **Spawn ladder control flow** — the decisions AROUND the line (tool shipping, account placement, adopt-vs-spawn) are still per-transport.
3. **Daemon-side fs isolation** — the unlock condition for the file-ops exception.

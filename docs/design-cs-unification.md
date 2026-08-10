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
| File operations (`/api/file*`) | **DIVERGENT** | local = SafeFs worker pool; remote = `RemoteFs` over `dm.fs*`. Both implement list/read/write/stat/rm/rename/copy. NOT trivially unifiable: SafeFs exists because a hung FUSE mount must not block the event loop — routing local through the daemon would move the hang into the daemon, which also serves local *sessions*. Unify only with a daemon-side worker/deadline story. |
| Session discovery facts | **DIVERGENT** (3 implementations) | local sweep (`routes/sessions.js`) / ssh shell script (`hosts.js`) / `discovery-snapshot`. Target: snapshot is the ONE fact collector; local consumes device #0's snapshot through the same parser; snapshot gains keeper+pipe metas and tmux facts. |
| Spawn ladder | **DIVERGENT** (4 builders) | tool shipping, account placement, env assembly. Some of it is genuinely transport-only (local needs no tool shipping — the tools are already there), but the *ladder structure* should be one parameterized flow. |
| Ctx sync | **UNIFIED** (2.277.0) | `src/ctx-sync.js` — hashed newer-wins sync over the device link for ALL transports; ssh keeps rsync only as the down-link fallback; caps raised to 1000 files/16MB and every skip is REPORTED (serverNotice) — the old dial cap ate a 3MB file invisibly. Local = no sync is TRANSPORT-ONLY (direct dir). |
| Transcript fetch/cache | **PARTLY** | `_fetchRemoteByFind` handles ssh+dial uniformly; local reads the file directly (legitimate — no transport needed). |

**Counted divergence surface** (transport branches per file, `2026-08-10`): ws-handler 33 · hosts 26 · server 29 · routes/files 18 · routes/sessions 7 · remote-fs 7. This number is the metric: it should fall with each migration, and a new branch should need justification against the table above.

## Order of work

1. **Discovery facts** — highest incident density (naming, running-state truth, keeper adoption). Snapshot becomes the single collector.
2. **Ctx sync** — smallest, and its divergence silently loses data today.
3. **Spawn ladder** — biggest; do it after discovery proves the pattern on a hot path.
4. **File ops** — only with a daemon-side isolation story; otherwise keep the documented exception.

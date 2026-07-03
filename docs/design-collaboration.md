# Design: Team Collaboration & Remote Sessions

Status: **design** (phase 0 shipped: password auth + Docker). This document is the concrete plan for turning VibeSpace from a personal workspace into a company-internal collaboration tool.

## Scenarios to serve

1. **Shared workspace** — a team deploys one VibeSpace on a beefy shared box; members log in, see each other's sessions, and can watch/continue them.
2. **Shared storage** — project folders (and agent memory) live on a common bucket/NFS so anyone can open, share, and continue work on the same code.
3. **Multi-device / multi-host** — one person has Claude running on their workstation *and* wants sessions on a GPU cluster node, managed from a single UI. Start a session at the office, continue it from home on a different host.

## Core insight

A VibeSpace server already *is* a "session host agent": dtach-backed session persistence, lock-first discovery, a WS protocol for attach/input/output, and multi-client sync. Collaboration is therefore not a rewrite — it's:

- **auth + identity** in front of one host (done / next),
- **an aggregation layer** across many hosts,
- **storage conventions** underneath,
- **session portability** (a Claude session is a single JSONL file — this makes "move my session to the cluster" genuinely easy).

## Architecture

```
                 ┌──────────────────────────── Gateway (VibeSpace) ───────────────┐
 Browser ──auth──►  UI + own sessions          host registry: data/hosts.json     │
                 │  /remote/<host>/api/…  ────────────────┐                       │
                 │  /remote/<host>/ws     ──────────────┐ │ (service token)       │
                 └───────────────────────────────────────┼─┼───────────────────────┘
                                                         ▼ ▼
                                   ┌──────────────┐   ┌──────────────┐
                                   │ Agent: ws-01 │   │ Agent: gpu-07 │   … each is a plain
                                   │ (VibeSpace)  │   │ (VibeSpace)   │     VibeSpace server
                                   └──────────────┘   └──────────────┘
                                          │                  │
                                   local FS + shared mounts (NFS / JuiceFS-on-S3 / rclone)
```

### Why a gateway (reverse-proxy aggregation), not N direct connections

The browser could open WebSockets to every host directly, but that means per-host cookies/CORS/TLS and N login flows. Instead the **gateway proxies** `/remote/<host>/...` to each agent using a per-host service token (stored server-side in `data/hosts.json`). Users authenticate **once** at the gateway; the client code keeps talking to a single origin. Any VibeSpace install can act as gateway, agent, or both — no new binary.

### Client changes (moderate, well-localized)

- `WsManager` → one instance per host (`hosts.js` registry; default host = ''). All REST helpers take an optional host prefix.
- Every `openSpec` gains a `host` field (default local). `replayOpenSpec` routes create/attach/resume through the right host's WS + REST prefix. Windows show a small host badge; the sidebar groups sessions **Host ▸ Folder ▸ Session** (reuses the existing folder-group machinery).
- Layout sync stays per-gateway (layouts live where you log in), so your workspace arrangement follows *you*, while sessions live on their hosts.

### Server changes (small)

- `GET/POST /api/hosts` — registry CRUD (name, base URL, service token); connectivity probe.
- `/remote/<host>/*` — HTTP + WS proxy with the service token injected; gateway-side auth already guards it.
- Agent side needs nothing new: service token = a long-lived login token (already implemented).

## Shared storage

### Project folders

| Backend | How | Notes |
|---------|-----|-------|
| **NFS** (recommended for LAN) | mount to the same path on every host, e.g. `/workspace/shared` | Real POSIX; Claude/git/watchers all just work |
| **S3-compatible** | **JuiceFS** (metadata on Redis/SQLite, data on S3) mounted at `/workspace/shared` | POSIX on top of a bucket; good for cross-site |
| | rclone mount as fallback | Weaker consistency; fine for read-mostly sharing, avoid for active git repos |
| **Google Drive** | rclone mount | Personal/small-team convenience only — latency + no real locking |

Convention: same mount path on every host (`/workspace/shared/<project>`), so a session's `cwd` is valid anywhere and **cross-host resume needs no path translation**. Personal areas at `/workspace/<user>`.

### Agent memory & transcripts — what to share and what not to

- **Share via the repo/mount (already works today):** `CLAUDE.md`, `.claude/` project settings, and any in-repo memory directories. Whatever lives in the project folder is shared by the storage layer for free.
- **Auto-memory** (`~/.claude/projects/<enc>/memory/`): shareable and valuable (team-wide "lessons learned"), but writes must not race. Plan: per-project symlink of that directory into the shared project folder (`<project>/.claude/team-memory`), advisory "last writer wins" (memory files are append-mostly Markdown; conflicts are rare and human-mergeable).
- **Transcripts (`~/.claude/projects/**/*.jsonl`): do NOT naively share the directory across hosts.** Two hosts appending the same JSONL corrupts it, and lock files contain host-local PIDs (a foreign lock whose PID happens to exist locally would read as "running"). Sharing conversations happens at the **VibeSpace layer** instead — view/attach through the gateway — plus explicit migration (below).

### Session migration = the multi-device answer

A Claude session is **one JSONL file**. "Continue on another machine" becomes a first-class VibeSpace feature instead of a storage hack:

> **Move to host…** (sidebar action): gateway streams the transcript file from host A → host B's project dir (same `cwd` by the mount convention), then issues `claude --resume <id>` on B and marks A's copy archived (`.moved-to-<host>`). Live sessions are terminated first (with confirmation).

This dodges every locking/corruption problem: exactly one host owns a session's file at a time, and the move is a copy + resume that reuses existing endpoints (`/api/download` + upload + resume) plus one new orchestration route.

## Identity & sharing model

Phased, staying compatible with the current single-password mode:

1. **Named users** — `data/auth.json` grows `users: { alice: {hash,salt}, … }`; login form gains a name field; tokens carry the username. Single-password mode keeps working (user = "team").
2. **Presence** — the server already tracks per-session clients; broadcast `{sessionId: [users]}` and show avatars on session cards/window title bars ("alice is watching"). Cheap and high-value for collaboration.
3. **Session visibility** — default all-visible (trusted team). Later: `owner` on sessions, "private" flag hiding them from others' sidebars; shared-folder sessions always visible.
4. **Share links** — `#session=<backend>:<id>@<host>` URL fragment that opens/attaches that session on load (openSpec replay already knows how to build such windows).
5. **Guest/read-only attach** — attach with `readOnly:true` (ChatView already supports read-only; terminal gets input suppressed server-side).

## Roadmap

| Phase | Scope | Size |
|-------|-------|------|
| **P0 — done** | Password auth (scrypt + tokens + rate limit + WS guard), Docker + compose, random first-boot password, UI chrome customization | shipped |
| **P1** | Named users, presence indicators, share-session URLs, read-only attach | S |
| **P2** | Host registry + gateway proxy (`/remote/<host>` HTTP+WS), sidebar host grouping, host badge on windows, openSpec `host` field | M |
| **P3** | Session migration between hosts (transcript copy + cross-host resume + archive marker) | M |
| **P4** | Storage recipes as compose profiles + docs (NFS / JuiceFS / rclone), team-memory symlink convention | S (mostly docs) |
| **P5** | Org-wide transcript archive → bucket + search UI (builds on the existing full-file streaming search) | L, later |

## Risks / open questions

- **Claude credentials are per-host** (each agent logs in once via `docker exec`). Org-managed API keys would centralize this; OAuth tokens must NOT be shared across hosts (refresh-token rotation — see the usage-monitoring lessons in CLAUDE.md).
- **Gateway WS fan-in**: N hosts × M clients through one proxy — fine at company scale (tens), revisit for hundreds.
- **Clock skew** between hosts affects timestamp-ordered merges (minimap time coordinates) — require NTP on agents.
- **Same-session concurrent resume on two hosts** is prevented socially (migration flow) not mechanically in P3; a gateway-held session→host ownership map can harden this later.

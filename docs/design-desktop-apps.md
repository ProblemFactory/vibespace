# Design: generic desktop-app windows (X11 rendered in the browser)

> Owner 2026-09-13: "while at it, support generic desktop apps (browser-based X11 rendering and the like); keep the code structure maintainable, split components sensibly."
> This is the IMPLEMENTATION SPEC for docs/design-agent-browser-v2.md §4.7 (native client windows) and §4.9 (window targets), generalised from "one native window" to "any local desktop application". It replaces the original P8 scope; P9/P10 (agents operating windows) build on it. Chinese twin: docs/design-desktop-apps.zh.md.

## 0. In one paragraph

Any local desktop application (`exec` + args + cwd) can be opened in VibeSpace as a **window type `desktop-app`**: the server gives it its **own** X display and picture server, the browser renders it through one shared **picture-view component** and forwards input. The picture server is chosen by a **capability ladder**: `xpra` (per-window seamless, adaptive encoding, used when installed) → `vnc-display` (one Xvnc per app, or Xvfb + x11vnc, whole display) → the existing singleton whole desktop (D10's fallback, never re-invented). Each rung is **one capability row**, not an if-chain; an app's record stores only which rung it chose and why. Everything goes through **one keeper** (count cap + runaway guard + boot adoption, the browser keeper's discipline) and **one ws bridge** (`/api/desktop/:id/stream`, cookie-authed, server-side, raw ports never exposed).

## 1. What exists today (read-only measurement, 2026-09-13)

- This box: Ubuntu 25.10, Wayland session (`DISPLAY=:1` is Xwayland); `Xvfb`, `x11vnc`, `websockify`, `xdotool`, `wmctrl`, `xdpyinfo` present; `xpra` NOT installed but apt offers 6.5.3; `Xtigervnc`/`Xvnc` absent. Two Xvfb instances already running (agent-browser's and a 1600x1000 one).
- Fleet image (deploy/docker/Dockerfile, Debian bookworm): `tigervnc-standalone-server` + XFCE present; bookworm's repo has `xpra 3.1.3`.
- Already in the product: `src/vnc.js` (the singleton whole desktop: Xvnc `:7` + XFCE, `POST /api/vnc/start`, detached + adopted on boot), `src/lib/desktop-window.js` (noVNC view, singleton window, DPI counter-zoom `zoom: calc(1 / var(--ui-scale))`, resizeSession/scaleViewport), the `/api/vnc` upgrade bridge in `server.js`. These three are the **precedents** this design REUSES rather than copies.

## 2. Module split (every maintainability requirement lives here)

| Tier | Module | Owns | Never does |
|---|---|---|---|
| PURE | `src/desktop-apps.js` | App registry rows `{id, label, exec, args, cwd, env, category, backendPrefs}`; the **display-backend capability table** `DISPLAY_BACKENDS` (`xpra` / `vnc-display` / `desktop-singleton`, each row: `perWindow`, `adaptive`, `needs:[bins]`, `stream:'rfb'|'xpra'`); the `resolveBackend(hostFacts, prefs)` ladder (every fallback with its reason); the app-session state machine `launching → ready → exited|failed`; the cap + runaway numbers (the SAME constants as browser §3.5) | imports nothing; touches no filesystem |
| SHARED | `src/desktop-display.js` | **Machine facts**: which binaries exist, X display allocation (`-displayfd`), X auth cookies, window enumeration on a display (`xdotool`/`wmctrl`, reused by P9), `xpra` version probe; `hostId` is a parameter (v1 local only; the daemon bundles it later) | makes no decision; writes no record |
| ORCH | `src/server/desktop-app-keeper.js` | Lifecycle: spawn (setsid, detached) X display → app → picture server; `data/desktop-apps.json` atomic write + `desktop-apps-updated` broadcast; boot **adoption** (pid + starttime + port); count cap, runaway guard (>150 % CPU for 5 min or an RSS cap ⇒ stop + park + notice, the opencode-serve guard's shape); per-app idle timeout; stop/kill; exit ⇒ broadcast | knows no specific app; touches no ws |
| ORCH | `src/server/desktop-stream.js` | **One** ws bridge: `GET /api/desktop/:id/stream` (cookie auth, backpressure, closes on disconnect; `rfb` proxied to the 127.0.0.1 port, `xpra` proxied to xpra's ws); the `/api/vnc` bridge now CALLS it (the singleton desktop = one fixed id), retiring the twin | starts no process |
| ORCH | `src/routes/desktop-apps.js` | `GET /api/desktop/apps` (registry + live sessions + per-rung availability with reasons), `POST /api/desktop/apps` (`{appId}` or `{exec,args,cwd}`), `POST /api/desktop/apps/:id/stop`, `GET /api/desktop/apps/:id`; signatures carry `host` | no business decisions |
| CLIENT | `src/lib/vnc-view.js` | The **shared picture-view component**: the noVNC loader (`loadRFB`) extracted from `desktop-window.js`, DPI counter-zoom, resize/scale policy, focus + input forwarding, reconnect + status chip; used by `desktop-window.js` AND the new window | knows no window type |
| CLIENT | `src/lib/desktop-app-window.js` | Window type `desktop-app` (`registerWindowType`, `openSpec {openDesktopApp:{id}}`, one window per app session, tab-group capable, layout-restorable, several clients may watch one display); title = the escaped app label; status bar: backend rung + reason, CPU/RSS, Stop | never fetches process facts directly (reads the broadcast) |
| CLIENT | `src/lib/desktop-app-launcher.js` | ⚙ menu "Desktop apps…" + a toolbar item (registered through contributions.js); the launch dialog is **catalog-first** (2026-09-14, owner item A): an intro line in plain words (what this does, what to click; zh+ja) → the backend chip in the ladder's words → Running (Open/Stop + the slot count, shown above the catalog only when non-empty) → the **Applications catalog** = a grid of cards (label + one-line exec/reason + an icons.js SVG picked by the registry `category`), one click launches, a launching card spins and stays disabled until the record answers, an app not on PATH is **dimmed with its reason, never hidden**, an empty catalog says so in plain words and opens the command form by itself → "Advanced: run any command" under a disclosure (exec, args, cwd with autocomplete + Launch + Recent; collapsed by default, its open state persisted in user state `desktopAppAdvancedOpen`, merge-only PATCH); cards and the disclosure are buttons (aria-expanded); ≤768 px single column; a failure always reaches a toast. **The width lives on `.dialog.desktop-launch`, never on the body** (measured 2026-09-14: a body min-width overflowed the fixed 440 px `.dialog`, and an overflow:hidden box is still a scroll container, so focusing the Command input scrolled the dialog itself by 308 px — title off-left, ✕ mid-header, the Applications column a 64 px sliver); every programmatic focus is `{preventScroll:true}`, the columns are `minmax(0,1fr)` | holds no session state |

Rule: **a new display backend = one row in `DISPLAY_BACKENDS` + its probe in `desktop-display.js` + its proxy in `desktop-stream.js`** and no other file. `server.js` gets wiring only (size ratchet 2100 lines — measure first, extract an existing stanza if over).

## 3. The backend ladder (each rung is one capability row)

| Rung | Composition | Per-window | Adaptive on bad links | Needs | Verdict |
|---|---|---|---|---|---|
| `xpra` | `xpra start :N --start=<exec> --html=on --bind-tcp=127.0.0.1:<port>` (seamless), the HTML5 client library or the hosted upstream client (D21 (c)) | yes | yes | `xpra` | first choice when installed; `apt install xpra` here, one line in the fleet image |
| `vnc-display` | one `Xvnc :N -localhost -rfbport <port>` per app (the image has it) or `Xvfb :N` + `x11vnc -display :N -localhost -rfbport <port>` (this box today) + a light WM (`xfwm4`/`openbox` if present, bare otherwise) | no (whole display, but the display holds only this app) | no | `Xvnc`, or `Xvfb`+`x11vnc` | the rung both machines can run today; P8-1 lands here first |
| `desktop-singleton` | the existing `src/vnc.js` `:7` whole desktop | no | no | as above | D10's fallback: the app starts inside the shared desktop and the window is just Desktop |

`resolveBackend` takes the first rung whose `needs` are all present; every fallback logs `[desktop] backend fallback: xpra→vnc-display (xpra not on PATH)` and writes `backend` + `fallbackWhy` into the record, which the window's status bar shows — the user must know whether they are looking at a window or a whole display.

## 4. Data model (`data/desktop-apps.json`, atomic writes)

```
{ "apps": { "<id>": { "id", "label", "exec", "args", "cwd", "env"?, "source": "registry"|"adhoc",
            "backend": "xpra"|"vnc-display"|"desktop-singleton", "fallbackWhy": null|string,
            "display": ":N", "port": <127.0.0.1 port>, "pids": { "x": n, "app": n, "server": n },
            "startedAt", "state": "launching"|"ready"|"exited"|"failed", "exitCode"?, "lastError"?,
            "idleTimeoutMs", "lastInputAt" } } }
```
The record stores **facts** only (pids / port / display / chosen rung), never derived values. Boot adoption: alive only when pid AND starttime match; otherwise marked `exited` with `lastError` kept.

## 5. Security

- Picture ports bind 127.0.0.1 only; the browser only ever reaches the cookie-authed ws bridge (the `/api/vnc` discipline).
- `exec` comes from the registry or from the user's dialog — **never from an agent**; the agent side (P9) receives window-target handles, not exec.
- Apps inherit the sanitized `agentEnv()`-style env (not `process.env`); DISPLAY/XAUTHORITY are injected by the keeper; secrets never in argv.
- Per-app idle timeout (default 30 min without input ⇒ stop, countdown visible in the status bar; "keep running" is an explicit action).

## 6. Test gates

| Suite | Tier | Content |
|---|---|---|
| `test-desktop-apps` | fast | PURE: registry-row validation, the full `resolveBackend` matrix (one row per missing-binary combination + the fallback text), the state machine, cap/runaway decisions |
| `test-desktop-display` | fast (SKIP with evidence when the binaries are absent) | display numbers never collide, auth cookies, window enumeration (a real Xvfb + one of `xterm`/`xlogo`/`xmessage`) |
| `test-desktop-app-keeper` | heavy | real Xvfb + x11vnc (or Xvnc): launch → port listening → RFB handshake (`net`) → record on disk → **SIGKILL the keeper process and rebuild ⇒ adoption** → clean stop (no orphan X / server; `/proc` counts equal before and after); the runaway guard with a CPU-burning fake app |
| `test-desktop-app-window` | heavy | headless chrome: launch dialog → window appears → canvas not all-black → a second client watches the same display → SIGKILL the server + reboot ⇒ the window restores and reconnects → Stop ⇒ the window shows exited; **geometry pins since 2026-09-14** (rects the page computes): a fresh open at 1000×800 / 777×800 / 480×640 — `.dialog` never scrolls sideways (scrollLeft 0, scrollWidth ≤ clientWidth), the title is hit-testable at its centre, ✕ sits inside the dialog's right 48 px, the first card label lies inside its card, both Advanced columns keep ≥ 38 % when two are shown, three nowrap Recent entries squeeze nothing; the intro rendered in zh; a real card click launches with its launching state; the disclosure closed by default and persisted open across a reload |
| `test-vnc-view` | fast | the shared view component's DPI counter-zoom and coordinates (the inc-mtdrm922 measurement); `desktop-window.js` passes the byte-identical assert set after switching to the component |

## 7. Slices

| Slice | Content | Rounds |
|---|---|---|
| **P8-1** | every module in §2 (the `xpra` rung probe + record only, proxy seam left), the `vnc-display` rung end to end, `vnc-view.js` extracted and `desktop-window.js` moved onto it, the `/api/vnc` bridge folded into `desktop-stream.js`, the launcher, the window, the five suites, kb/CLAUDE.md, the Dockerfile gains `xpra` (package only, not enabled) | 6–9 |
| **P8-2** | the `xpra` rung end to end: D21 (c) — host the upstream HTML5 client first as the verification slice (the 200 ms / 1 Mbps measurement written into the kb), then draw with `xpra-html5-client` inside `desktop-app-window`; per-window titles/icons | 4–7 |
| **P9** | see browser design §4.9: `src/window-targets.js` reuses `desktop-display.js`'s enumeration, the `vibespace-window` CLI | as scheduled |

## 8. Decisions (owner-approved: as recommended)

| # | Decision | Recommendation |
|---|---|---|
| DA1 | Backend order | `xpra` > `vnc-display` > `desktop-singleton`; installing xpra upgrades NEW sessions, running ones are not migrated |
| DA2 | One display per app or a shared one | **One per app** (isolation, independent idle, independent stop); the shared desktop is only the fallback |
| DA3 | Idle default | stop after 30 min without input; setting `desktop.idleTimeoutMin`, 0 = never |
| DA4 | Who may launch | humans only (the dialog); agents operate already-open windows through P9 |
| DA5 | xpra client | D21 (c) as written |

## 9. Unverified

1. HTML5-protocol differences between xpra 6.5 (this box) and 3.1 (the bookworm image) — P8-2 must measure both.
2. Wayland-only apps (no Xwayland fallback) will not start under Xvfb — registry rows carry a `needsWayland` flag and refuse honestly.
3. The `vnc-display` rung at 200 ms / 1 Mbps is inferred from §4.7's ranking, not measured.

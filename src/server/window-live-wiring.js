'use strict';
/**
 * WINDOW-LIVE WIRING — the desktop scene's composition, ONE place (P9b,
 * docs/design-agent-browser-v2 §4.9 "it plugs into the live view" / §6.6;
 * moved out of server.js so the bootstrap stays under its 2100-line
 * ratchet). It creates nothing new by itself — it CONNECTS four owners
 * that already exist:
 *
 *   · the desktop-app keeper (src/server/desktop-app-keeper.js) — the windows
 *   · the RFB bridge (src/server/desktop-stream.js) — the picture + input
 *   · the window-targets engine (src/server/window-targets-engine.js) — the
 *     leases + the input side (the ONE owner of `lease.input` for windows)
 *   · the handback announcer (src/server/browser-handback.js) — the ONE
 *     billed moment, shared with tabs
 *
 * so that the bridge's `inputPolicy` IS the engine's verdict, the bridge's
 * `onViewerLeft` IS the engine's viewer-left handback, the engine's
 * `holderAlive` IS the bridge's socket fact, the engine's `broadcast` IS the
 * server's, and the engine's handback rides the announcer. The routes are
 * mounted here too (the user's takeover/handback beside the agent's verbs).
 *
 * P8-2 x5 (docs/design-desktop-apps §7 P8-2 "x5 多客户端 = 单活跃 viewer"): the
 * bridge's `viewerSeats` IS the keeper's one-active-viewer election composed
 * with the engine's lease through the PURE rule (src/desktop-viewers.js
 * `viewerState`): an agent driving ⇒ every human Watch; a human takeover ⇒
 * the taker active; no lease ⇒ the election. Every change re-applies at once:
 * the keeper's viewer listener and every `window-leases-updated` the engine
 * publishes call the bridge's `refresh`.
 * LANE E (2026-09-25, docs/design-desktop-apps-seamless §3.6): the engine is handed `groupsOf` (the Task Group
 * membership the reach gate asks at VERB time — D2's "live now or later") and the ONE window-control request
 * producer (src/server/window-request.js — D3; its wake rides `deliver`, the gated ladder) is created here and
 * handed to the user routes beside the engine.
 * LANE desktop-handover: the machine-desktop HAND-OVER engine (src/server/desktop-handover-engine.js) is created here and handed
 * to both route families — the owner's give / pause / resume / revoke (desktop-apps) and the agent's verbs on `md-<hostId>`
 * (window-targets); the stream module that carries it is created by the desktop-apps routes (they hand it to the engine).
 * `boot()` runs after restoreSessions (the live-session set is final);
 * `shutdown()` stops the tick. A missing python3/AT-SPI is a per-verb typed
 * refusal at call time, never a boot failure — this wiring throws only on a
 * missing dependency of its OWN (a programming error).
 */

function install({ app, auth, vnc, keeper, DESKTOP_SINGLETON_ID, dataDir, env, activeSessions, serverSetting, broadcast, browserHandback = null, netemEnabled = false, access = null, deliver = null, groupsOf = null, browserStream = null, log = console } = {}) {
  if (!app || !auth || !keeper || !vnc) throw new Error('window-live wiring: app, auth, vnc and keeper are required');
  const DV = require('../desktop-viewers.js');
  let streamRef = null;
  // a lease change re-applies every viewer's state (x5): the engine publishes through this broadcast
  const leaseBroadcast = (m) => { broadcast?.(m); if (m && m.type === 'window-leases-updated') { try { streamRef?.refreshAll(); } catch (e) { log.warn?.(`[window] viewer refresh failed — ${e && e.message}`); } } };
  // lane C2: the engine's world is THIS machine's windows (xdotool / AT-SPI act here) — a paired machine's app is not an agent window target
  const engine = require('./window-targets-engine.js').create({ keeper: keeper.local || keeper, dataDir, env, activeSessions, serverSetting, broadcast: leaseBroadcast, groupsOf, log });
  // lane E (D3): the ONE producer of "Ask <agent> to take control" — free next turn by default, a wake through the gated ladder
  const windowRequest = require('./window-request.js').create({ engine, deliver, activeSessions, log });
  // THE PICTURE SOURCES (src/server/stream-sources.js): the singleton Desktop, a Windows / macOS machine's whole desktop
  // (design 014 D1 — the access layer resolves it), the keeper's sessions. Each owns its ids, its target, its input
  // rule and its upstream words; a PERSONAL source (the person's own desktop) is never governed, never an agent target
  const SS = require('./stream-sources.js');
  // lane browser-x-in-window (B2): an agent browser's display session is SEATED by the live view's relay (its ticket: the viewer
  // holding the browser's takeover drives, everyone else watches) — never the desktop keeper's one-active-viewer election
  // lane desktop-x-seat-browser (ONE PERSON, ONE SEAT): the sockets of a browser display a PERSON opened (the bridge's `person`: no
  // agent token) — with the display's browser (the record's `forBrowser`) the relay seats the desktop window's own view of it.
  // r2 (acceptance FAIL 1 — measured: two panes + another client, three 'active' sockets at once): his panes are ELECTED — the
  // NEWEST pane wins (a pane reconnecting through a new socket keeps its place; within a pane its newest socket), «Use it here»
  // (`takeSeat`) makes a pane the newest; the others watch and are TOLD 'other-window'. A move re-seats the display at once.
  const PIC = require('../browser-picture.js');
  const xPersons = new Map(); // display session id → { seq, panes: Map(pane → order), sockets: Map(viewerId → { pane, seq }) }
  const personsOf = (id) => { let e = xPersons.get(id); if (!e) { e = { seq: 0, panes: new Map(), sockets: new Map() }; xPersons.set(id, e); } return e; };
  /** The elected socket of a display: the newest pane's newest socket (null when no person's socket is open). */
  const electedOf = (id) => {
    const e = xPersons.get(id);
    if (!e || !e.sockets.size) return null;
    let pane = null, order = -1; for (const s of e.sockets.values()) { const o = e.panes.get(s.pane) ?? -1; if (o > order) { order = o; pane = s.pane; } }
    let best = null, seq = -1; for (const [v, s] of e.sockets) if (s.pane === pane && s.seq > seq) { seq = s.seq; best = v; }
    return best;
  };
  const isPerson = (id, viewerId) => !!viewerId && !!xPersons.get(id)?.sockets.has(String(viewerId));
  const forBrowserOf = (id) => { try { const r = keeper.get(id); return (r && r.forBrowser) || null; } catch { return null; } };
  const seatArgs = (id, viewerId) => ({ profileId: forBrowserOf(id), person: isPerson(id, viewerId), elected: !!viewerId && electedOf(id) === String(viewerId) });
  const browserSeat = browserStream && typeof browserStream.xSeat === 'function' ? (id, viewerId) => browserStream.xSeat(id, viewerId, seatArgs(id, viewerId)) : null;
  const browserSeatWhy = (id, viewerId) => (browserStream && typeof browserStream.xSeatWhy === 'function' ? browserStream.xSeatWhy(id, viewerId, seatArgs(id, viewerId)) : null);
  /** «Use it here»: this person's pane becomes the newest — its socket takes the seat, his other panes watch. */
  const takeBrowserSeat = (id, viewerId) => {
    const e = xPersons.get(id), s = e && e.sockets.get(String(viewerId || ''));
    if (!s) return { ok: false, code: 'no_viewer', error: 'this pane is not connected to the display yet — wait for it to reconnect, then Use it here' };
    e.panes.set(s.pane, ++e.seq); s.seq = ++e.seq;
    log.log?.(`[window] ${id}: pane ${s.pane} took his seat on the browser display («Use it here») — his other panes watch`);
    try { streamRef?.refresh(id); } catch (err) { log.warn?.(`[window] ${id}: re-seat failed — ${err && err.message}`); }
    return { ok: true, seat: browserSeat ? browserSeat(id, viewerId) : null, why: browserSeatWhy(id, viewerId) };
  };
  const sources = SS.create({ vnc, keeper, engine, access, singletonId: DESKTOP_SINGLETON_ID, browserSeat });
  const src = (id) => SS.sourceOf(sources, id);
  const own = (id) => src(id).personal;
  const governed = (id) => !own(id) && !src(id).seat && typeof keeper.viewerJoined === 'function'; // lane browser-x-in-window: a seated source is never the election's
  const stream = require('./desktop-stream.js').create({
    auth, onInput: (id) => { src(id).onInput?.(id); },
    onDesktopSize: (id, w, h) => keeper.noteDesktopSize?.(id, w, h), // P8-2 x4 (a machine desktop never asks — its view runs resizeSession off): the client asked the display to follow its pane ⇒ the keeper fits the app to it
    resolveTarget: (id) => src(id).target(id),
    upstreamWhy: sources.some((s) => s.upstreamWhy) ? (id) => src(id).upstreamWhy?.(id) ?? null : null, // design 014 D1: "<machine> went offline"
    forwardPort: access ? (hostId, port) => access.forwardPort(hostId, port) : null, // lane C2: a paired machine's picture port, forwarded (src/server/desktop-access.js)
    inputPolicy: (id, viewerId) => (own(id) ? { relay: true } : src(id).seat ? (src(id).seat(id, viewerId) === 'active' ? { relay: true } : { relay: false, code: 'watch-mode', why: 'only this browser\'s holder types into it — the viewer driving it, or the person browsing it himself (his own window)' }) : engine.inputPolicy(id, viewerId)), // the singleton desktop is the user's own — never gated; lane browser-x-in-window: a SEATED source (an agent browser's display) relays input for its holder only — never the window engine's no-lease relay
    pinned: (id) => (!own(id) && keeper.get(id) && keeper.get(id).pin) || null, // lane e2b: the record's pin {w,h} — the keeper owns that window's geometry; r3: the xpra bridge asks xpra for it
    onViewerLeft: (id, viewerId) => { if (!own(id) && !src(id).seat) engine.viewerLeft(id, viewerId); }, // lane browser-x-in-window: an X picture's socket leaving hands nothing back (the takeover is the live view's)
    viewerSeats: { // x5: the singleton desktop is the user's own and never governed ('free')
      join: (id, { viewerId, pane, prev, ua, person = false }) => { // lane desktop-x-seat-browser: a seated source ELECTS its person sockets (r2: the newest pane)
        if (src(id).seat) {
          if (!person || !viewerId || PIC.X_TICKET_RE.test(String(viewerId))) return; // a live view's ticket is the relay's seat, never his pane
          const e = personsOf(id), p = String(pane || viewerId);
          if (!e.panes.has(p)) e.panes.set(p, ++e.seq); // a NEW pane is the newest; a pane reconnecting keeps its place
          e.sockets.set(String(viewerId), { pane: p, seq: ++e.seq });
          try { streamRef?.refresh(id); } catch (err) { log.warn?.(`[window] ${id}: re-seat failed — ${err && err.message}`); } // his other panes are told at once
          return;
        }
        if (governed(id)) keeper.viewerJoined(id, { viewerId, pane, prev, label: DV.viewerLabel(ua) });
      },
      leave: (id, viewerId) => {
        const e = xPersons.get(id);
        if (e && e.sockets.has(String(viewerId))) {
          const { pane } = e.sockets.get(String(viewerId)); e.sockets.delete(String(viewerId));
          if (![...e.sockets.values()].some((s) => s.pane === pane)) e.panes.delete(pane);
          if (!e.sockets.size) xPersons.delete(id);
          try { streamRef?.refresh(id); } catch (err) { log.warn?.(`[window] ${id}: re-seat failed — ${err && err.message}`); } // the next newest pane takes the seat
        }
        if (governed(id)) keeper.viewerLeft(id, viewerId);
      },
      state: (id, viewerId) => (src(id).seat ? src(id).seat(id, viewerId) : governed(id) ? DV.viewerState({ active: keeper.activeViewer(id) }, viewerId, engine.leaseInput(id)) : 'free'), // lane browser-x-in-window: the browser's seat first
      // lane desktop-x-seat-browser r2: a seated source's WHY (the code its socket is TOLD — never silent) and its INPUT seat's reach
      why: (id, viewerId) => (src(id).seat ? browserSeatWhy(id, viewerId) : undefined),
      scope: (id) => { const pid = src(id).seat ? forBrowserOf(id) : null; return pid && browserStream && typeof browserStream.xScope === 'function' ? browserStream.xScope(pid) : null; },
      askScope: (id, why) => { const pid = src(id).seat ? forBrowserOf(id) : null; if (pid && browserStream && typeof browserStream.askXScope === 'function') browserStream.askXScope(pid, why); },
    },
    netemEnabled, // P8-2 validation slice: VIBESPACE_DESKTOP_NETEM=1 on a dev server only, never on by default
    log,
  });
  streamRef = stream;
  browserStream?.onXSeats?.((id) => stream.refresh(id)); // lane browser-x-in-window: a takeover / handback / view gone re-seats that display's sockets at once
  keeper.onViewers?.((id) => stream.refresh(id)); // x5: join / leave / Resume here / the session ended ⇒ every socket of that window re-applied
  engine.setViewerProbe((id, viewerId) => stream.viewerAlive(id, viewerId));
  engine.setViewerCount?.((id) => stream.connections(id)); // lane e2a r3: an agent browser's end waits while a viewer has it open
  keeper.setWatchProbe?.((id) => stream.connections(id) > 0); // the fit belt checks a WATCHED session every tick (a window that appears without input), an unwatched one on the slow belt
  const handover = require('./desktop-handover-engine.js').create({ dataDir, activeSessions, log }); // lane desktop-handover
  { const { router, setup } = require('../routes/desktop-apps'); setup({ keeper, vnc, windowEngine: engine, stream, access, windowRequest, handover, browserSeat: (id, viewerId) => (src(id).seat ? { seat: src(id).seat(id, viewerId), why: browserSeatWhy(id, viewerId) } : null), takeBrowserSeat: (id, viewerId) => (src(id).seat ? takeBrowserSeat(id, viewerId) : { ok: false, code: 'not-a-browser-display', error: 'only a browser display has a person\'s seat' }) }); app.use(router); } // lane desktop-x-seat-browser: a browser display's seat (r2: + why), asked by its window; «Use it here»
  { const wt = require('../routes/window-targets'); wt.setup({ engine, handover }); app.use(wt.router); }
  require('../routes/browser').setWindowEngine(engine); // lane e2a (§E2): `vibespace-browser new --backend desktop-app` launches through the engine
  let announced = false;
  if (browserHandback && typeof browserHandback.installWindow === 'function') { try { announced = browserHandback.installWindow(engine); } catch (e) { log.warn?.(`[window] handback announcer not attached — ${e && e.message}`); } }
  return {
    desktopStream: stream, windowEngine: engine, windowRequest, handover, announced,
    boot: () => { try { const r = engine.boot(); if (r.leases || r.dropped) log.log?.(`[window] boot: ${r.leases} lease(s) kept, ${r.dropped} dropped`); return r; } catch (e) { log.warn?.(`[window] boot reconcile failed — ${e && e.message}`); return null; } },
    shutdown: () => { try { require('../routes/desktop-apps').shutdownStreams(); } catch { /* no stream ever started */ } try { engine.shutdown(); } catch { /* timers only */ } try { handover.shutdown(); } catch { /* its tick only */ } }, // fix r2: the streams FIRST — each live hand-over's lease-end line is audited (sync) before the exit
  };
}

module.exports = { install, LEASE_FILE: require('./window-targets-engine.js').LEASE_FILE };

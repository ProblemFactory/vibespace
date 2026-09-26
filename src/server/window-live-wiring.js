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
 * `boot()` runs after restoreSessions (the live-session set is final);
 * `shutdown()` stops the tick. A missing python3/AT-SPI is a per-verb typed
 * refusal at call time, never a boot failure — this wiring throws only on a
 * missing dependency of its OWN (a programming error).
 */
const path = require('path');

function install({ app, auth, vnc, keeper, DESKTOP_SINGLETON_ID, dataDir, env, activeSessions, serverSetting, broadcast, browserHandback = null, netemEnabled = false, access = null, deliver = null, groupsOf = null, log = console } = {}) {
  if (!app || !auth || !keeper || !vnc) throw new Error('window-live wiring: app, auth, vnc and keeper are required');
  const DV = require('../desktop-viewers.js');
  let streamRef = null;
  // a lease change re-applies every viewer's state (x5): the engine publishes through this broadcast
  const leaseBroadcast = (m) => { broadcast?.(m); if (m && m.type === 'window-leases-updated') { try { streamRef?.refreshAll(); } catch (e) { log.warn?.(`[window] viewer refresh failed — ${e && e.message}`); } } };
  // lane C2: the engine's world is THIS machine's windows (xdotool / AT-SPI act here) — a paired machine's app is not an agent window target
  const engine = require('./window-targets-engine.js').create({ keeper: keeper.local || keeper, dataDir, env, activeSessions, serverSetting, broadcast: leaseBroadcast, groupsOf, log });
  // lane E (D3): the ONE producer of "Ask <agent> to take control" — free next turn by default, a wake through the gated ladder
  const windowRequest = require('./window-request.js').create({ engine, deliver, activeSessions, log });
  const governed = (id) => id !== DESKTOP_SINGLETON_ID && typeof keeper.viewerJoined === 'function';
  const stream = require('./desktop-stream.js').create({
    auth, onInput: (id) => { keeper.noteInput(id); engine.noteUserInput(id); },
    onDesktopSize: (id, w, h) => keeper.noteDesktopSize?.(id, w, h), // P8-2 x4: the client asked the display to follow its pane ⇒ the keeper fits the app to it
    resolveTarget: (id) => (id === DESKTOP_SINGLETON_ID ? { kind: 'rfb', port: vnc.port } : keeper.streamTarget(id)),
    forwardPort: access ? (hostId, port) => access.forwardPort(hostId, port) : null, // lane C2: a paired machine's picture port, forwarded (src/server/desktop-access.js)
    inputPolicy: (id, viewerId) => (id === DESKTOP_SINGLETON_ID ? { relay: true } : engine.inputPolicy(id, viewerId)), // the singleton desktop is the user's own — never gated
    onViewerLeft: (id, viewerId) => { if (id !== DESKTOP_SINGLETON_ID) engine.viewerLeft(id, viewerId); },
    viewerSeats: { // x5: the singleton desktop is the user's own and never governed ('free')
      join: (id, { viewerId, pane, prev, ua }) => { if (governed(id)) keeper.viewerJoined(id, { viewerId, pane, prev, label: DV.viewerLabel(ua) }); },
      leave: (id, viewerId) => { if (governed(id)) keeper.viewerLeft(id, viewerId); },
      state: (id, viewerId) => (governed(id) ? DV.viewerState({ active: keeper.activeViewer(id) }, viewerId, engine.leaseInput(id)) : 'free'),
    },
    netemEnabled, // P8-2 validation slice: VIBESPACE_DESKTOP_NETEM=1 on a dev server only, never on by default
    log,
  });
  streamRef = stream;
  keeper.onViewers?.((id) => stream.refresh(id)); // x5: join / leave / Resume here / the session ended ⇒ every socket of that window re-applied
  engine.setViewerProbe((id, viewerId) => stream.viewerAlive(id, viewerId));
  keeper.setWatchProbe?.((id) => stream.connections(id) > 0); // the fit belt checks a WATCHED session every tick (a window that appears without input), an unwatched one on the slow belt
  { const { router, setup } = require('../routes/desktop-apps'); setup({ keeper, vnc, windowEngine: engine, stream, access, windowRequest }); app.use(router); }
  { const wt = require('../routes/window-targets'); wt.setup({ engine }); app.use(wt.router); }
  let announced = false;
  if (browserHandback && typeof browserHandback.installWindow === 'function') { try { announced = browserHandback.installWindow(engine); } catch (e) { log.warn?.(`[window] handback announcer not attached — ${e && e.message}`); } }
  return {
    desktopStream: stream, windowEngine: engine, windowRequest, announced,
    boot: () => { try { const r = engine.boot(); if (r.leases || r.dropped) log.log?.(`[window] boot: ${r.leases} lease(s) kept, ${r.dropped} dropped`); return r; } catch (e) { log.warn?.(`[window] boot reconcile failed — ${e && e.message}`); return null; } },
    shutdown: () => { try { engine.shutdown(); } catch { /* timers only */ } },
  };
}

module.exports = { install, LEASE_FILE: require('./window-targets-engine.js').LEASE_FILE, auditPath: (dataDir) => path.join(dataDir, require('./window-targets-engine.js').AUDIT_FILE) };

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
 * `boot()` runs after restoreSessions (the live-session set is final);
 * `shutdown()` stops the tick. A missing python3/AT-SPI is a per-verb typed
 * refusal at call time, never a boot failure — this wiring throws only on a
 * missing dependency of its OWN (a programming error).
 */
const path = require('path');

function install({ app, auth, vnc, keeper, DESKTOP_SINGLETON_ID, dataDir, env, activeSessions, serverSetting, broadcast, browserHandback = null, log = console } = {}) {
  if (!app || !auth || !keeper || !vnc) throw new Error('window-live wiring: app, auth, vnc and keeper are required');
  const engine = require('./window-targets-engine.js').create({ keeper, dataDir, env, activeSessions, serverSetting, broadcast, log });
  const stream = require('./desktop-stream.js').create({
    auth, onInput: (id) => { keeper.noteInput(id); engine.noteUserInput(id); },
    resolveTarget: (id) => (id === DESKTOP_SINGLETON_ID ? { kind: 'rfb', port: vnc.port } : keeper.streamTarget(id)),
    inputPolicy: (id, viewerId) => (id === DESKTOP_SINGLETON_ID ? { relay: true } : engine.inputPolicy(id, viewerId)), // the singleton desktop is the user's own — never gated
    onViewerLeft: (id, viewerId) => { if (id !== DESKTOP_SINGLETON_ID) engine.viewerLeft(id, viewerId); },
    log,
  });
  engine.setViewerProbe((id, viewerId) => stream.viewerAlive(id, viewerId));
  { const { router, setup } = require('../routes/desktop-apps'); setup({ keeper, vnc, windowEngine: engine }); app.use(router); }
  { const wt = require('../routes/window-targets'); wt.setup({ engine }); app.use(wt.router); }
  let announced = false;
  if (browserHandback && typeof browserHandback.installWindow === 'function') { try { announced = browserHandback.installWindow(engine); } catch (e) { log.warn?.(`[window] handback announcer not attached — ${e && e.message}`); } }
  return {
    desktopStream: stream, windowEngine: engine, announced,
    boot: () => { try { const r = engine.boot(); if (r.leases || r.dropped) log.log?.(`[window] boot: ${r.leases} lease(s) kept, ${r.dropped} dropped`); return r; } catch (e) { log.warn?.(`[window] boot reconcile failed — ${e && e.message}`); return null; } },
    shutdown: () => { try { engine.shutdown(); } catch { /* timers only */ } },
  };
}

module.exports = { install, LEASE_FILE: require('./window-targets-engine.js').LEASE_FILE, auditPath: (dataDir) => path.join(dataDir, require('./window-targets-engine.js').AUDIT_FILE) };

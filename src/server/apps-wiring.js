'use strict';
/**
 * THE APPS WIRING (Layer 0 of docs/design-app-persistence.zh.md §3.1) — server.js's ONE line: the hub's apps engine
 * (src/server/apps-engine.js) over the desktop access layer (the machine's ONE package slot), its routes
 * (src/routes/apps.js — the user's door + the agent's proposals), the desktop catalog route's "restoring…" words, and
 * `afterListen()` — the operator door (src/server/apps-ops-door.js) and the rebuilt machine's replay, both AFTER the server
 * listens (never on the boot path).
 *
 * THE STUB SEAM (a chrome gate drives the dialog without a real apt): `VIBESPACE_APPS_STUB=<module path>` replaces the
 * engine's access layer by the module's `create({access, log})` — honoured ONLY by a throwaway server (its checkout
 * under the system temp dir, the same `throwawayRoot` fact server.js computes), refused by name anywhere else.
 */
function install({ app, access, userTodos = null, deliver = null, activeSessions = () => new Map(), sessionStatusKey = null, broadcast = () => { }, dataDir, log = console, throwawayRoot = false, env = process.env }) {
  let acc = access;
  // Layer 1 (design §3.2): the app system's launchers sit at the END of PATH (an image binary of the same name wins; a
  // catalog row names its shim by absolute path) — only where the chart enables the app system
  if (env.VIBESPACE_APP_SYSTEM && env === process.env) {
    const shims = require('path').join(require('os').homedir(), '.vibespace', 'sysroot', 'bin');
    if (!String(env.PATH || '').split(':').includes(shims)) env.PATH = `${env.PATH || '/usr/bin:/bin'}:${shims}`;
  }
  const stub = env.VIBESPACE_APPS_STUB;
  if (stub) {
    if (!throwawayRoot) log.warn?.(`[apps] VIBESPACE_APPS_STUB is ignored — only a throwaway server (a checkout under the system temp dir) may run the apps stub`);
    else { acc = require(stub).create({ access, log }); log.warn?.(`[apps] THE APPS STUB RUNS (${stub}) — no apt, no root: this is a test server`); }
  }
  const engine = require('./apps-engine.js').create({ access: acc, userTodos, deliver, activeSessions, sessionStatusKey, broadcast, dataDir, log });
  const routes = require('../routes/apps.js');
  routes.setup({ engine, access: acc, activeSessions, sessionStatusKey });
  app.use(routes.router);
  try { require('../routes/desktop-apps.js').setApps(engine); } catch (e) { log.warn?.(`[apps] the desktop catalog route cannot word restoring rows: ${e.message}`); }
  // the operator's door (vibespace-app refresh --all from a fleet script — no session token): a unix socket of this
  // account under ~/.vibespace/apps/operator, opened after listen like the replay (src/server/apps-ops-door.js)
  const door = require('./apps-ops-door.js').create({ engine, access: acc, log });
  return {
    engine,
    door,
    /** after listen: the operator door, then the rebuilt machine's replay (marker hit = nothing; a miss = the slot,
     *  detached) — neither throws, neither is on the boot path */
    afterListen: () => { door.open(); return engine.afterListen().catch((e) => log.warn?.(`[apps] boot replay failed: ${e && e.message}`)); },
  };
}

module.exports = { install };

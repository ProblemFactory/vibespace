'use strict';
/**
 * THE APPS WIRING (Layer 0 of docs/design-app-persistence.zh.md §3.1) — server.js's ONE line: the hub's apps engine
 * (src/server/apps-engine.js) over the desktop access layer (the machine's ONE package slot), its routes
 * (src/routes/apps.js — the user's door + the agent's proposals), the desktop catalog route's "restoring…" words, and
 * `afterListen()` — the rebuilt machine's replay, run AFTER the server listens (never on the boot path).
 *
 * THE STUB SEAM (a chrome gate drives the dialog without a real apt): `VIBESPACE_APPS_STUB=<module path>` replaces the
 * engine's access layer by the module's `create({access, log})` — honoured ONLY by a throwaway server (its checkout
 * under the system temp dir, the same `throwawayRoot` fact server.js computes), refused by name anywhere else.
 */
function install({ app, access, userTodos = null, deliver = null, activeSessions = () => new Map(), sessionStatusKey = null, broadcast = () => { }, dataDir, log = console, throwawayRoot = false, env = process.env }) {
  let acc = access;
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
  return {
    engine,
    /** after listen: the rebuilt machine's replay (marker hit = nothing; a miss = the slot, detached) — never throws */
    afterListen: () => engine.afterListen().catch((e) => log.warn?.(`[apps] boot replay failed: ${e && e.message}`)),
  };
}

module.exports = { install };

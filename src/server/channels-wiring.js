'use strict';
/**
 * CHANNELS WIRING (docs/design-communication-panel.zh.md §2's placement table).
 * ONE `create(deps)` factory called ONCE from server.js, so server.js gains a
 * wiring stanza and nothing else — the 2.325.0 decomposition's rule, and the
 * reason the size ratchet is survivable at all.
 *
 * It builds the engine, mounts the router, starts the scheduler, and hands
 * back the handle the shutdown path flushes. Everything it knows about the
 * feature is in `src/server/channels-engine.js` and `src/routes/channels.js`.
 */
const { create: createEngine } = require('./channels-engine.js');
const channelsRoutes = require('../routes/channels.js');

function create({ app, dataDir, bcastAll = () => {}, now = () => Date.now(), env = process.env, integrations = null, userTodos = null, deliver = null, serverSetting = () => undefined, liveSessions = () => [] } = {}) {
  if (!app) throw new Error('channels-wiring: app is required');
  if (!dataDir) throw new Error('channels-wiring: dataDir is required');

  // `integrations` is the §14 store handle: adapters ask its
  // `resolveIntegration(id)` — never `process.env` — and every real row's
  // Test runner is registered on it by the engine (the consumer owns the
  // runner). `userTodos` is the "For you" inbox a failing adapter SPEAKS in
  // and the same producer retracts from (fence 8, P1). `deliver` is THE
  // delivery ladder (P2, fence 2: the only door to an unattended turn, the
  // spend authorizer inside it), `serverSetting` reads the coalescing window
  // and `liveSessions` names the agent sessions an assignment can address.
  const channels = createEngine({ dataDir, broadcast: (msg) => bcastAll(msg), now, env, integrations, userTodos, deliver, serverSetting, liveSessions });
  channelsRoutes.setup({ getEngine: () => channels });
  app.use(channelsRoutes.router);
  channels.start();
  return { channels, shutdown: () => { try { channels.stop(); } catch (e) { console.warn('[channels] shutdown:', e && e.message); } } };
}

module.exports = { create };

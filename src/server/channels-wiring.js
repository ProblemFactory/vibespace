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

function create({ app, dataDir, bcastAll = () => {}, now = () => Date.now(), env = process.env } = {}) {
  if (!app) throw new Error('channels-wiring: app is required');
  if (!dataDir) throw new Error('channels-wiring: dataDir is required');

  const channels = createEngine({ dataDir, broadcast: (msg) => bcastAll(msg), now, env });
  channelsRoutes.setup({ getEngine: () => channels });
  app.use(channelsRoutes.router);
  channels.start();
  return { channels, shutdown: () => { try { channels.stop(); } catch (e) { console.warn('[channels] shutdown:', e && e.message); } } };
}

module.exports = { create };

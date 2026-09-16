'use strict';
/**
 * INTEGRATIONS WIRING (docs/design-communication-panel.zh.md §14 — the
 * shared "Integrations & keys" layer). ONE `create(deps)` factory called ONCE
 * from server.js, so server.js gains a wiring stanza and nothing else (the
 * 2.325.0 decomposition's rule; the size ratchet).
 *
 * It builds the store, mounts the router, and hands back the store handle the
 * channels wiring passes to its engine (whose adapters ask
 * `resolveIntegration(id)` — the ONE answer, never `process.env`). The
 * delegating gmail row is handed `MountManager.drivePresets` here: the
 * EXISTING reader of `VIBESPACE_GDRIVE_CLIENTS`, so that env name keeps its
 * one resolver.
 */
const integrationStore = require('./integration-store.js');
const integrationsRoutes = require('../routes/integrations.js');

function create({ app, dataDir, bcastAll = () => {}, drivePresets = () => [], env = process.env, now = () => Date.now() } = {}) {
  if (!app) throw new Error('integrations-wiring: app is required');
  if (!dataDir) throw new Error('integrations-wiring: dataDir is required');

  const store = integrationStore.create({ dataDir, env, now, broadcast: (msg) => bcastAll(msg), drivePresets });
  integrationsRoutes.setup({ getStore: () => store });
  app.use(integrationsRoutes.router);
  return { store };
}

module.exports = { create };

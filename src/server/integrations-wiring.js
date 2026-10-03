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
 *
 * THE COMPANY PRESETS (lane cluster-presets, B-53fe): this is also where the
 * server's presets-DIRECTORY reader is installed (src/server/cluster-presets.js
 * `installForServer` — /etc/vibespace/presets or VIBESPACE_PRESETS_DIR,
 * watched) and handed to the store as its file rung; `MountManager.drivePresets`
 * reads the same process-wide instance. On a change: the store re-derives
 * every row (`presetsChanged` — the card views broadcast, the channels engine
 * re-asks its adapters), and EVERY client gets the recomputed summary
 * (`cluster-presets-updated`, the 2.309.0 rule: the invalidation entry point
 * pushes the result). The same summary rides `GET /api/integrations`.
 */
const integrationStore = require('./integration-store.js');
const integrationsRoutes = require('../routes/integrations.js');
const clusterPresets = require('./cluster-presets.js');
const PL = require('../preset-layers.js');

function create({ app, dataDir, bcastAll = () => {}, drivePresets = () => [], env = process.env, now = () => Date.now(), presets = null, log = console } = {}) {
  if (!app) throw new Error('integrations-wiring: app is required');
  if (!dataDir) throw new Error('integrations-wiring: dataDir is required');

  const reader = presets || clusterPresets.installForServer({ env, log });
  const store = integrationStore.create({ dataDir, env, now, broadcast: (msg) => bcastAll(msg), drivePresets, presets: reader, log });
  /** THE SUMMARY (value-free): what the instance's company presets are and where they come from. */
  function presetsSummary() {
    const st = reader.status();
    const g = reader.entries('gdrive') ? st.items.filter((i) => i.kind === 'gdrive') : (() => { const n = (drivePresets() || []).length; return n ? [{ kind: 'gdrive', source: 'env', n }] : []; })();
    return PL.summarize({ dir: st.dir, items: [...g, ...store.presetItems()], updatedAt: st.updatedAt, loadedAt: st.loadedAt, errors: st.errors });
  }
  reader.onChange((change) => {
    if (change && change.kinds && change.kinds.length) store.presetsChanged();
    try { bcastAll({ type: 'cluster-presets-updated', presets: presetsSummary() }); } catch (e) { log.warn('[presets] broadcast failed:', e && e.message); }
  });
  integrationsRoutes.setup({ getStore: () => store, getPresets: presetsSummary });
  app.use(integrationsRoutes.router);
  return { store, presets: reader, presetsSummary };
}

module.exports = { create };

// Built from the HARNESS REGISTRY (S1, src/harnesses/index.js): one adapter
// instance per registered harness, configured by the descriptor's own
// adapterConfig mapping. Adding a backend = adding a descriptor file.
const { HARNESSES } = require('../harnesses');

function createAdapterRegistry(config = {}) {
  const adapters = new Map();
  for (const h of Object.values(HARNESSES)) adapters.set(h.id, new h.Adapter(h.adapterConfig(config)));

  return {
    get(name) {
      return adapters.get(name) || null;
    },
  };
}

module.exports = { createAdapterRegistry };

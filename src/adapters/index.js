// Built from the HARNESS REGISTRY (S1, src/harnesses/index.js): one adapter
// instance per registered harness, configured by the descriptor's own
// adapterConfig mapping. Adding a backend = adding a descriptor file.
// A harness register()ed AFTER the registry was built (plugin tier-5; the
// proof suite's fake) gets its adapter on first ask, from its own descriptor —
// the registration line is the whole wiring (lane dc-ws-create).
const harnesses = require('../harnesses');
const { HARNESSES } = harnesses;

function createAdapterRegistry(config = {}) {
  const adapters = new Map();
  for (const h of Object.values(HARNESSES)) adapters.set(h.id, new h.Adapter(h.adapterConfig(config)));

  return {
    get(name) {
      if (adapters.has(name)) return adapters.get(name);
      if (!harnesses.has(name)) return null;
      const h = harnesses.get(name);
      if (typeof h.Adapter !== 'function' || typeof h.adapterConfig !== 'function') return null;
      const a = new h.Adapter(h.adapterConfig(config));
      adapters.set(name, a);
      return a;
    },
  };
}

module.exports = { createAdapterRegistry };

'use strict';
// HARNESS REGISTRY (S1 of docs/design-harness-plugins.md §2, 2.369.18).
// ONE object per agent harness = everything "a backend" means, declared in one
// place: identity, capabilities, the adapter class + its config mapping, the
// normalizer class, the chat wrapper file, and the store/locator functions.
// Consumers (adapter registry, normalizer registry, conformance suite) read
// THIS; a new harness adds a descriptor file, never an if-chain. Unknown ids
// fail LOUDLY — the gemini-as-claude fallthrough class is a bug we already
// paid for once. S1 wraps the three existing harnesses with zero behaviour
// change; later slices move the remaining if-chains (accounts, discovery,
// usage, stdout pipelines, injection, client META) into these descriptors.
const claude = require('./claude');
const codex = require('./codex');
const shell = require('./shell');

const HARNESSES = Object.freeze({ claude, codex, shell });
const REQUIRED = ['id', 'label', 'kind', 'caps', 'Adapter', 'adapterConfig', 'wrapper'];

function validate(h) {
  // Every key must be DECLARED (null is a valid declaration for a terminal-only
  // harness: wrapper/Normalizer/store); chat-capable harnesses must fill them.
  const missing = REQUIRED.filter((k) => !(k in h));
  if (missing.length) throw new Error(`harness "${h.id || '?'}" descriptor is missing: ${missing.join(', ')}`);
  if (h.kind === 'chat') {
    for (const k of ['wrapper', 'Normalizer', 'store']) if (!h[k]) throw new Error(`harness "${h.id}" is chat-capable but declares no ${k}`);
  }
  return h;
}
for (const h of Object.values(HARNESSES)) validate(h);

/** The descriptor for a harness id — throws on an unknown id (never a claude fallback). */
function harnessOf(id) {
  const h = HARNESSES[id];
  if (!h) throw new Error(`no harness registered for backend "${id}" — add src/harnesses/<id>.js and register it in src/harnesses/index.js`);
  return h;
}
function harnessIds() { return Object.keys(HARNESSES); }
/** Chat-capable harnesses only (shell is terminal-only). */
function chatHarnessIds() { return harnessIds().filter((id) => HARNESSES[id].kind === 'chat'); }

module.exports = { HARNESSES, harnessOf, harnessIds, chatHarnessIds, REQUIRED_DESCRIPTOR_KEYS: REQUIRED };

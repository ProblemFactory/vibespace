'use strict';
// THE FAKE VENDOR's adapter (lane dc-channels-manifest proof): ONE module = the registered thing — caps spread from its
// manifest's table, its integration row's id + Test, its consent row, its raw-API row beside its bearer, its blocks rung,
// its glyph. Registered by ONE line in a copy of src/channels/registry-list.js, nothing else.
const path = require('path');
const REPO = path.join(__dirname, '..', '..', '..', '..');
const { makeFakeAdapter } = require(path.join(REPO, 'src/channels/fake.js'));
const { budgetOf, paceOf } = require(path.join(REPO, 'src/channel-settings.js'));
const MANIFEST = require('./manifest.js');
const Blocks = require('./blocks.js');
const base = makeFakeAdapter({ kind: 'acme', receive: 'poll', sendAs: [] });
const caps = Object.freeze({ ...base.caps, render: 'blocks', glyph: 'mail', budget: { unit: 'request', metered: true, ...budgetOf(MANIFEST.settings) }, pace: { ...paceOf(MANIFEST.settings), cost: { fetch: 1, discover: 1 } } });
const API_ROW = Object.freeze({ label: 'Acme', hosts: ['api.acme.test'], docs: ['https://docs.acme.test/api'], readByPost: [], sensitive: [] });
module.exports = {
  ...base, kind: 'acme', caps, manifest: MANIFEST, label: 'Acme', integration: 'acme', integrationTest: async () => ({ ok: true }),
  OPTIONS: Object.freeze([{ key: 'tone', label: 'Tone', default: 'plain', choices: Object.freeze(['plain', 'loud']) }]),
  consent: Object.freeze({ mode: 'ephemeral', landing: null }), api: API_ROW,
  create: (rec, deps) => ({ ...base.create(rec, deps), apiBearer: async () => 'acme-TOKEN' }),
  blocksOf: Blocks.acmeStoredBlocks,
};

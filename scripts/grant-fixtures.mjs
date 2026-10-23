// THE SUITES' GRANT FIXTURES (lane grants-unify, 2026-10-23). Every "who may use it" now lives in the ONE grants store
// (src/server/grants-store.js) — a suite that writes a PRE-UNIFY store file (browser-profiles.json with `owner` lists, a
// hosts.json with `exit.use` / `exit.run` …) seeds the rows the way the migration `2026-10-grants-unify` carries them
// over (the same PURE mappers, src/grant-model.js), so the door reads what the suite meant. NOT a test-*.mjs on purpose
// (the tier census would demand a tier) — like scratch.mjs / mutant-copy.mjs.
import { createRequire } from 'node:module';
import path from 'node:path';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const GM = require(path.join(REPO, 'src/grant-model.js'));
const GS = require(path.join(REPO, 'src/server/grants-store.js'));
const B = () => require(path.join(REPO, 'src/browser-profiles.js'));

/** The store of a data dir (the one a door built over that dir reads — GS.forDir). */
export const storeOf = (dataDir) => GS.forDir(dataDir);
/** browser-profiles.json's records → rows in the store of `dataDir`, spelled as THE migration spells them (verify F6 — ONE
 *  spelling, GM.browserKeyResolver: a key no binding names stands for its own conversation; `resolveBrowserKey` = a suite's
 *  binding map). → the mapper's report. */
export function seedBrowserProfiles(dataDir, profiles, { resolveBrowserKey = null } = {}) {
  const m = GM.rowsOfBrowserProfiles(profiles, { resolveBrowserKey });
  storeOf(dataDir).seed(m.rows, 'fixture');
  return m;
}
/** A hand-built profile record (a PURE suite) with its `grantUse` mirrored as the keeper mirrors it — from its pre-unify
 *  `owner`, the way the migration carries it (the ONE spelling: a browser key stands for its conversation). */
export function withUse(p, { resolveBrowserKey = null } = {}) {
  if (!p || typeof p !== 'object') return p;
  const m = GM.fromBrowserOwner(p, { resolveBrowserKey });
  if (m.ephemeral) return p;
  const rows = m.unknown ? [{ door: 'browser-profile', resource: p.id || 'x', to: 'unreadable' }] : [{ door: 'browser-profile', resource: p.id || 'x', to: m.to, except: [] }];
  return { ...p, grantUse: B().useOfRows(rows, { browserKeyOf: (k) => (B().isBrowserKey(k) ? k : null) }) };
}
/** automation-keys.json's grants → their use / reach rows in the store of `dataDir`. */
export function seedAutomationGrants(dataDir, grants) {
  const m = GM.rowsOfAutomationGrants(grants);
  storeOf(dataDir).seed(m.rows, 'fixture');
  return m;
}
/** hosts.json's records → the exit rows in the store of `dataDir` (and the record's `ask` the migration carries). */
export function seedHosts(dataDir, hosts) {
  const m = GM.rowsOfHosts(hosts);
  storeOf(dataDir).seed(m.rows, 'fixture');
  return m;
}
/** A channel index document (data/channels/index.json's shape — a suite that wrote grains / reach rows straight into it)
 *  → the channel rows in the store of `dataDir`, by the migration's own mapper (src/server/channels-grants.js). */
export function seedChannelIndex(dataDir, doc) {
  const m = require(path.join(REPO, 'src/server/channels-grants.js')).rowsOfChannelIndex(doc, { F: require(path.join(REPO, 'src/channel-filter.js')) });
  storeOf(dataDir).seed(m.rows, 'fixture');
  return m;
}

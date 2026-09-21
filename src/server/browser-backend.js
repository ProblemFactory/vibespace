'use strict';
/**
 * THE KEY CONSUMER OF THE AGENT-BROWSER TRACK (P4 second half, design
 * §7.5 / §7.4's source chip / round 8's runner registration; ORCH).
 *
 * ONE MODULE declares this track's registry rows' consumer, registers their
 * Test runners AND resolves their keys — the shared layer's census only ever
 * finds three names that know about each other when they are one module
 * (§7.5: "whoever declares the row, whoever registers its runner and whoever
 * calls resolveIntegration(id) must be one module"). The keeper asks THROUGH
 * `keyFor(integrationId)` exactly once before it spawns; that is the only
 * place a plaintext value leaves the store on this track, and it goes
 * straight into the ONE child's environment under the vendor's own name
 * (src/browser-switch.js `vendorEnvFor`) — never a file, never argv, never a
 * log line, never `agentEnv`.
 *
 *   keyFor(id)     → resolveIntegration('<id>') — the literal per-row table
 *                    below IS the census's evidence; `{source, values, …}`
 *   sourceOf(id)   → the MASKED view's `{source, clusterKey, clusterLabel,
 *                    why}` for the switcher's SOURCE chip — never a value
 *   registerTests  → `store.registerTest(id, runner)` for all six rows (a row
 *                    that declares a `test` and registers nothing is a dead
 *                    control ⇒ the shared census goes red)
 *
 * THE RUNNERS' EGRESS DECLARATION (§7.5, three clauses): `cloak` is
 * shape-only — ZERO network, no process, no bytes (the tier comes from the
 * first real launch); each `cloud:*` runner makes exactly ONE bounded
 * read-only request to the ONE host `browser-switch.testHostFor` derives
 * from that row's own fields (browserless / kernel: the host inside the URL
 * the user typed; agentcore: its region; the two others: their constant API
 * host), with the key in a HEADER, creating no session and running no page;
 * a host it cannot derive is a named refusal, never a default. Outside these
 * Tests this track's server sends no third-party request at all.
 *
 * `fetchImpl` is injectable (the gate drives a recorder and asserts the host
 * each runner reached equals the derived one); a runner never spawns.
 */
const SW = require('../browser-switch.js');

/** THE LITERAL TABLE — one `resolveIntegration('<id>')` per row, so the
 *  shared layer's consumer census (scripts/test-integration-registry.mjs (c))
 *  finds a real call site for every id this file claims to consume. */
const RESOLVE = Object.freeze({
  cloak: (st) => st.resolveIntegration('cloak'),
  'cloud:browserbase': (st) => st.resolveIntegration('cloud:browserbase'),
  'cloud:browserless': (st) => st.resolveIntegration('cloud:browserless'),
  'cloud:kernel': (st) => st.resolveIntegration('cloud:kernel'),
  'cloud:browseruse': (st) => st.resolveIntegration('cloud:browseruse'),
  'cloud:agentcore': (st) => st.resolveIntegration('cloud:agentcore'),
});
const KEY_IDS = SW.KEY_IDS;

function create({ integrations = null, fetchImpl = null, now = Date.now, log = console } = {}) {
  const store = () => { try { return (typeof integrations === 'function' ? integrations() : integrations) || null; } catch { return null; } };
  const doFetch = (...a) => (fetchImpl || globalThis.fetch)(...a);
  let resolves = 0;

  /** THE ONE RESOLVE (plaintext): `{integrationId, source, values, clusterKey,
   *  clusterLabel, fromEnv, missing, why}` — `source:'none'` with the reason
   *  when the store is absent, the row unknown or nothing configured. */
  function keyFor(integrationId) {
    const id = String(integrationId || '');
    const fn = RESOLVE[id];
    if (!fn) return { integrationId: id, source: 'none', values: {}, clusterKey: null, clusterLabel: null, fromEnv: false, missing: [], why: `${id} is not a key row of this track` };
    const st = store();
    if (!st) return { integrationId: id, source: 'none', values: {}, clusterKey: null, clusterLabel: null, fromEnv: false, missing: [], why: 'the integration store is not available on this instance' };
    resolves++;
    let r;
    try { r = fn(st); } catch (e) { return { integrationId: id, source: 'none', values: {}, clusterKey: null, clusterLabel: null, fromEnv: false, missing: [], why: `the integration store refused: ${e && e.message}` }; }
    return { integrationId: id, source: r.source, values: r.values || {}, clusterKey: r.clusterKey || null, clusterLabel: r.clusterLabel || null, fromEnv: !!r.fromEnv, missing: r.missing || [], why: r.why || null };
  }
  /** The SOURCE chip's facts, from the MASKED view — no value ever rides. */
  function sourceOf(integrationId) {
    const id = String(integrationId || '');
    const st = store();
    if (!st || !RESOLVE[id]) return { integrationId: id, source: 'none', clusterKey: null, clusterLabel: null, why: st ? `${id} is not a key row` : 'the integration store is not available on this instance', testedAt: null, lastOk: null };
    let v;
    try { v = st.publicView(id); } catch (e) { return { integrationId: id, source: 'none', clusterKey: null, clusterLabel: null, why: String(e && e.message), testedAt: null, lastOk: null }; }
    return { integrationId: id, source: v.source, clusterKey: v.clusterKey || null, clusterLabel: v.clusterLabel || null, why: v.why || null, testedAt: v.testedAt || null, lastOk: v.lastOk == null ? null : v.lastOk, missing: v.missing || [] };
  }

  // ── the runners ──
  /** `cloak` — shape-only. Zero network, starts no process, downloads no
   *  byte: it validates the `cb_…` shape through the row's own validator (an
   *  empty key is the free tier, which the row says is legal). The seat tier
   *  is NOT read here (that needs the 200 MB binary and §7.2.1's egress
   *  proof, neither of which a card opened to paste a key may trigger). */
  async function cloakTest({ resolved, row }) {
    const f = (row && row.fields || []).find((x) => x.key === 'licenseKey');
    const v = resolved && resolved.values ? String(resolved.values.licenseKey || '') : '';
    const r = f && typeof f.validate === 'function' ? f.validate(v) : { ok: true };
    if (!r || r.ok !== true) return { ok: false, error: `validate: licenseKey ${(r && r.why) || 'invalid'}` };
    return { ok: true, detail: { network: 'none', shape: v ? 'cb_ key present' : 'empty = free tier (one concurrent session)', tier: 'read back from the first real launch, not from this check', source: resolved ? resolved.source : 'none' } };
  }
  /** `cloud:*` — credential-exchange: ONE bounded read-only request to the
   *  ONE derived host; the key rides a header. */
  function cloudTest(id) {
    return async ({ resolved, signal }) => {
      if (!resolved || resolved.source === 'none') return { ok: false, error: `no key resolved for ${id}${resolved && resolved.why ? ' (' + resolved.why + ')' : ''}` };
      const req = SW.testRequestFor(id, resolved.values || {});
      if (!req || !req.ok) return { ok: false, error: (req && req.error) || `${id}: no Test request` };
      if (req.unsigned) return { ok: false, error: `${id}: reached only ${req.host} unsigned — this build cannot sign AWS requests, so the key was not exchanged (the row's fields are unverified against upstream)` };
      let res;
      try { res = await doFetch(req.url, { method: 'GET', headers: req.headers, signal, redirect: 'manual' }); }
      catch (e) { return { ok: false, error: `${id}: ${req.host} unreachable (${String((e && e.message) || e).slice(0, 160)})` }; }
      const status = Number(res && res.status) || 0;
      if (status >= 200 && status < 300) return { ok: true, detail: { host: req.host, status } };
      if (status === 401 || status === 403) return { ok: false, error: `${id}: ${req.host} refused this key (HTTP ${status})`, detail: { host: req.host, status } };
      return { ok: false, error: `${id}: ${req.host} answered HTTP ${status || '?'}`, detail: { host: req.host, status } };
    };
  }
  const runners = Object.freeze({
    cloak: cloakTest,
    'cloud:browserbase': cloudTest('cloud:browserbase'),
    'cloud:browserless': cloudTest('cloud:browserless'),
    'cloud:kernel': cloudTest('cloud:kernel'),
    'cloud:browseruse': cloudTest('cloud:browseruse'),
    'cloud:agentcore': cloudTest('cloud:agentcore'),
  });
  /** Register every row's runner with the store — called ONCE at wiring
   *  time. Returns the ids registered (empty when there is no store, said). */
  function registerTests() {
    const st = store();
    if (!st || typeof st.registerTest !== 'function') { log.warn?.('[browser-backend] no integration store — the six key rows keep no Test runner'); return []; }
    const done = [];
    for (const id of KEY_IDS) { try { st.registerTest(id, runners[id]); done.push(id); } catch (e) { log.warn?.(`[browser-backend] ${id}: runner not registered — ${e && e.message}`); } }
    return done;
  }
  return { keyFor, sourceOf, runners, registerTests, KEY_IDS, testHostFor: SW.testHostFor, resolveCount: () => resolves, now };
}

module.exports = { create, KEY_IDS, RESOLVE };

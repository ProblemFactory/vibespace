// THE SWITCH DIALOG'S FIXTURE VIEWS — ONE producer shared by the fast suite
// (scripts/test-browser-switcher-model.mjs) and the heavy chrome suite
// (scripts/test-browser-switcher-ui.mjs). Every view is built by driving the
// REAL src/browser-switch.js (`switcherRows` → `rowState`, `installVerdict` +
// `installFacts`) over the REAL provider table of src/browser-profiles.js —
// never a hand-written row — in the shape the keeper's `switcherView` answers
// (`{profile, chip, rows, seats, siteHints, blocked, leases, switching, live,
// versions, install}`). Since lane-cloak (2026-09-28) the SHIPPED table wires
// cloak (its §7.2.1 record is a measurement), so `wiredCloak` and `shipped`
// agree; the world where it is NOT wired is `unwired` — a build whose record is
// the refusal (`REFUSED_PROOF`, the pre-measurement record, kept verbatim) —
// and the `w1*` / `binary-absent-unmeasured` views live there.
// test-browser-backend imports the worlds from here. No I/O, no clock.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const B = require('../../src/browser-profiles.js');
const SW = require('../../src/browser-switch.js');

export const NOW = 1_800_000_000_000;
export const PROFILE_ID = 'bp-0000a0a1';
/** The cloak row WIRED (and its control ok on this machine) — every other row as shipped. */
export const wiredCloak = {
  row: (id) => (id === 'cloak' ? { ...B.providerRow('cloak'), wired: true } : B.providerRow(id)),
  control: (id, o) => (id === 'cloak' && !(o && o.host) ? { ok: true, row: { ...B.providerRow('cloak'), wired: true } } : B.providerControl(id, o)),
};
export const shipped = { row: (id) => B.providerRow(id), control: (id, o) => B.providerControl(id, o) };
/** THE PRE-MEASUREMENT RECORD (shipped until 2026-09-28), verbatim: a refusal by name that blocks cloak.wired. */
export const REFUSED_PROOF = Object.freeze({
  provider: 'cloak', tool: 'strace -f -qq -e trace=network', date: '2026-09-16', version: null, status: 'refused', refusal: 'binary_absent',
  detail: 'neither `cloakbrowser` nor `cloakserve` is installed on the measuring machine and the package is not in node_modules (npm `cloakbrowser` 0.5.10 downloads a ~200 MB proprietary binary on first launch — installing it is a USER action that comes AFTER this measurement, never a side effect of it). Nothing was downloaded; no vendor host was contacted.',
  blocks: 'cloak.wired', runs: Object.freeze([]), expectedRuns: B.CLOAK_EGRESS_RUNS,
});
/** A build whose cloak record is REFUSED: the row unwired, its control refusing the way providerControl words a refused record. */
const UNWIRED_ROW = Object.freeze({ ...B.providerRow('cloak'), wired: false });
export const unwired = {
  row: (id) => (id === 'cloak' ? UNWIRED_ROW : B.providerRow(id)),
  control: (id, o) => {
    if (id !== 'cloak' || (o && o.host)) return B.providerControl(id, o);
    return { ok: false, code: 'provider_unavailable', error: `provider "cloak" (${UNWIRED_ROW.label}) cannot be used on this build — its §7.2.1 egress measurement is recorded as ${REFUSED_PROOF.refusal} (${REFUSED_PROOF.date}): ${REFUSED_PROOF.detail}` };
  },
  proof: REFUSED_PROOF,
};
/** The §7.2.1 record as a MEASUREMENT would write it (test-browser-backend's fixture). */
export const MEASURED_PROOF = Object.freeze({ ...B.CLOAK_EGRESS_PROOF, status: 'measured', refusal: undefined, blocks: undefined, detail: 'fixture', version: '0.5.10', runs: B.CLOAK_EGRESS_RUNS.map((what) => ({ what, inetConnects: 0 })) });
const BASE_STATE = { running: false, startedAt: null, finishedAt: null, exitCode: null, spec: null, pid: null, log: '/fixture/browser-tools/install.log', error: null };
/** The install facts the keeper would answer: the REAL verdict + the REAL facts. */
export function installFor({ proof = B.CLOAK_EGRESS_PROOF, npm = true, state = {}, exe = { ok: false } } = {}) {
  const st = { ...BASE_STATE, ...state };
  const v = SW.installVerdict({ proof, proofOk: B.proofVerdict(proof), exe, host: null, running: !!st.running });
  return { ...SW.installFacts({ verdict: v, npm, state: st }), prefix: '/fixture/browser-tools' };
}
const lease = (n, profileId = PROFILE_ID) => ({ browserKey: `bk-0000a00${n}`, profileId, sessionId: `sess-${n}`, lastUrl: `https://shop.example/page-${n}` });
export const CLAIM = Object.freeze({ id: 'bl-1a2b', url: 'https://shop.example/checkout', host: 'shop.example', why: 'captcha', evidence: 'HTTP 403 twice, then a press-and-hold challenge on the checkout page', by: 'agent', browserKey: 'bk-0000a001', sessionId: 'sess-1', profileId: PROFILE_ID, tier: 2, at: NOW - 60_000 });

/**
 * One view. `world` = wiredCloak | shipped; `key` = the cloak row's masked
 * source (`{source, whyCode?, whyParams?}`); `binary` = the cloak executable
 * re-shaped (`{present, configured}`) or null; the rest as the keeper holds it.
 */
export function viewOf(o) { return viewOfBase(o); }
function viewOfBase({
  SWmod = SW, world = wiredCloak, profile = {}, key = { source: 'user' }, binary = { present: true, configured: false }, install = installFor(),
  seats = {}, majors = {}, dirMajor = null, running = [], leases = [lease(1)], inputs = {}, live = true, switching = false, blocked = [],
  // lane-cloak: cloak's key is OPTIONAL since its measurement (the free build needs none); `keyRequired: true` = a world
  // whose in-place row needs a key — the needs-key state the dialog still words — and `sites` = the named-site count
  keyRequired = null, sites = null,
} = {}) {
  const p = { id: PROFILE_ID, label: 'shopping', provider: 'chromium', host: null, dir: '/fixture/profiles/shopping', lastChromiumMajor: 146, fingerprintSeed: null, owner: { kind: 'instance', id: null }, scope: 'all', createdAt: NOW - 86_400_000, ...profile };
  const rows = SWmod.switcherRows({
    profile: p, providerIds: B.providerIds(), rowOf: world.row, controlOf: world.control, capabilityRefusalOf: B.capabilityRefusal,
    sources: (id) => (id === 'cloak' ? { integrationId: 'cloak', clusterKey: null, clusterLabel: null, whyCode: null, whyParams: null, ...key } : { source: 'none', whyCode: 'no-values', whyParams: null }),
    seats, majors, dirMajor, now: NOW, runningOf: (prov) => (prov === 'cloak' ? running : []), leases, inputs,
    binaryOf: (id) => (id === 'cloak' && !p.host && binary ? { needed: 'cloakbrowser', ...binary } : null), install,
    ...(keyRequired === null ? {} : { keyRequiredOf: () => keyRequired }),
    ...(sites === null ? {} : { sitesOf: (id) => (id === 'cloak' ? Array.from({ length: sites }, (_, i) => `site-${i}.example`) : null) }),
  });
  const f = SW.backendFact(p, { seats, majors });
  return {
    profile: { ...p }, chip: SW.backendChip({ provider: f.id, major: f.major, tier: f.plan }), rows, seats: {}, siteHints: [],
    blocked: blocked.map((b) => ({ ...b, text: SW.blockedText(b) })), leases: leases.map((l) => ({ ...l })), switching, live,
    versions: { recorded: p.lastChromiumMajor, dir: dirMajor, majors: { ...majors } }, install,
  };
}

/** Every named view (fresh objects each call). One per target state + the worlds and the edge cases. `SWmod` = the
 *  switch module to drive (a negative control hands a patched copy; default the real one). */
export function views(SWmod = SW) {
  const measured = (o = {}) => installFor({ proof: MEASURED_PROOF, ...o });
  const viewOf = (o) => viewOfBase({ SWmod, ...o });
  const absent = { present: false, configured: false };
  const v = {
    // W1: a build whose cloak record is REFUSED (the table before lane-cloak) — nothing to switch to
    w1: viewOf({ world: unwired, binary: absent, install: installFor({ proof: REFUSED_PROOF }), key: { source: 'none', whyCode: 'no-values' } }),
    'w1-claim': viewOf({ world: unwired, binary: absent, install: installFor({ proof: REFUSED_PROOF }), key: { source: 'none', whyCode: 'no-values' }, blocked: [CLAIM] }),
    // W2: cloak wired
    ready: viewOf({ leases: [lease(1), lease(2)] }),
    'two-leases-gains': viewOf({ leases: [lease(1), lease(2)] }),
    'not-live': viewOf({ leases: [lease(1), lease(2)], live: false }),
    // lane-cloak: a cloak browser behind the egress allowlist with NO site named yet (it would open nothing) — and one with two
    'ready-no-sites': viewOf({ leases: [lease(1)], key: { source: 'none', whyCode: 'no-values' }, sites: 0 }),
    'ready-two-sites': viewOf({ leases: [lease(1)], key: { source: 'none', whyCode: 'no-values' }, sites: 2 }),
    'ready-confirm': viewOf({ profile: { lastChromiumMajor: null }, dirMajor: null }),
    'ready-confirm-two': viewOf({ profile: { lastChromiumMajor: null }, dirMajor: null, leases: [lease(1), lease(2)] }),
    'needs-key': viewOf({ keyRequired: true, key: { source: 'none', whyCode: 'no-values' } }),
    'needs-key-undecryptable': viewOf({ keyRequired: true, key: { source: 'none', whyCode: 'undecryptable', whyParams: { fields: ['licenseKey'] } } }),
    'needs-key-unknown-code': viewOf({ keyRequired: true, key: { source: 'none', whyCode: 'zz-not-a-code' } }),
    // what the REAL store answers with nothing configured anywhere (no key of the user's, no cluster preset) — the naive-
    // user verifier (2026-09-28) read "the saved key can't be used: the cluster provides no default" on this one
    'needs-key-no-preset': viewOf({ keyRequired: true, key: { source: 'none', whyCode: 'no-preset' } }),
    'needs-key-own-missing': viewOf({ keyRequired: true, key: { source: 'none', whyCode: 'own-missing' } }),
    'needs-key-preset-gone': viewOf({ keyRequired: true, key: { source: 'none', whyCode: 'preset-gone', whyParams: { key: 'team' } } }),
    'not-installed': viewOf({ binary: absent, install: measured({ npm: true }) }),
    'not-installed-here': viewOf({ binary: absent, install: measured({ npm: false }) }),
    installing: viewOf({ binary: absent, install: measured({ state: { running: true, startedAt: NOW - 30_000, spec: 'cloakbrowser@0.5.10', pid: 4242 } }) }),
    'install-failed': viewOf({ binary: absent, install: measured({ state: { finishedAt: NOW - 5_000, exitCode: 1, spec: 'cloakbrowser@0.5.10', error: 'npm exited 1 — see /fixture/browser-tools/install.log' } }) }),
    'path-not-runnable': viewOf({ binary: { present: false, configured: true }, install: measured() }),
    'binary-absent-unmeasured': viewOf({ binary: absent, install: installFor({ proof: REFUSED_PROOF }) }),
    'not-installed-and-no-key': viewOf({ keyRequired: true, binary: absent, install: measured({ npm: true }), key: { source: 'none', whyCode: 'no-values' } }),
    'older-browser': viewOf({ profile: { lastChromiumMajor: 151 } }),
    'all-in-use-own': viewOf({ seats: { cloak: { tier: 'free', total: 1, at: NOW - 1_000 } }, running: [{ profileId: 'bp-0000b0b1', label: 'Vendor portal' }] }),
    'all-in-use-shared': viewOf({ key: { source: 'cluster', clusterKey: 'default' }, seats: { cloak: { tier: 'free', total: 1, at: NOW - 1_000 } }, running: [{ profileId: 'bp-0000b0b1', label: 'Vendor portal' }] }),
    driven: viewOf({ leases: [lease(1)], inputs: { [`bk-0000a001|${PROFILE_ID}`]: { input: 'user' } } }),
    switching: viewOf({ profile: { provider: 'cloak' }, leases: [lease(1), lease(2)], switching: true }), // the keeper commits the new provider BEFORE its start(): mid-switch the profile already names it
    'current-cdp': viewOf({ profile: { provider: 'cdp', dir: null, lastChromiumMajor: null } }),
    'current-cloud': viewOf({ profile: { provider: 'cloud:browserbase', dir: null, lastChromiumMajor: null }, key: { source: 'none', whyCode: 'no-values' } }),
    'current-local-window': viewOf({ profile: { provider: 'local-window', dir: null, lastChromiumMajor: null } }),
    'current-cloak': viewOf({ profile: { provider: 'cloak', fingerprintSeed: 42 } }),
    'host-profile': viewOf({ profile: { host: 'dev-1', dir: null } }),
  };
  return v;
}
/** The row the fixtures are about: cloak's (chromium's when cloak is the current one). */
export function targetRowOf(view) {
  const cur = view.profile.provider || 'chromium';
  return view.rows.find((r) => r.id === (cur === 'cloak' ? 'chromium' : 'cloak'));
}

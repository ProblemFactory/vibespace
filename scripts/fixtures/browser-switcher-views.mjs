// THE SWITCH DIALOG'S FIXTURE VIEWS — ONE producer shared by the fast suite
// (scripts/test-browser-switcher-model.mjs) and the heavy chrome suite
// (scripts/test-browser-switcher-ui.mjs). Every view is built by driving the
// REAL src/browser-switch.js (`switcherRows` → `rowState`) over the REAL
// provider table of src/browser-profiles.js plus ONE synthetic row — never a
// hand-written view row — in the shape the keeper's `switcherView` answers
// (`{profile, chip, rows, seats, siteHints, blocked, leases, switching, live,
// versions}`). lane engine-spi-egress L3: the anti-bot backend that was the
// shipped table's in-place switch TARGET left the core, so no shipped row is one;
// the dialog's worlds are driven over `fixture-browser` — a synthetic in-place
// row (a Chromium of another build on the same directory, its key in a cloud
// row's integration) injected the way the keeper takes a `providers` override.
// `wired` = that row usable here; `unwired` = the same row not in this build.
// test-browser-backend imports the worlds from here. No I/O, no clock.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const B = require('../../src/browser-profiles.js');
const SW = require('../../src/browser-switch.js');

export const NOW = 1_800_000_000_000;
export const PROFILE_ID = 'bp-0000a0a1';
export const FIXTURE_ID = 'fixture-browser';
export const FIXTURE_INTEGRATION = 'cloud:browserbase'; // a real key row (KEY_ROWS): the needs-key / seat states read it
const FIXTURE_ROW = Object.freeze({ ...B.providerRow('chromium'), buildChoice: false, automationFlag: false, tier: 2, keyScope: 'local-only', remote: null,
  label: 'Fixture Browser (a test fixture: an in-place browser of another build)', integrationId: FIXTURE_INTEGRATION,
  words: Object.freeze({ brand: true, name: 'Fixture Browser', chip: 'Fixture Browser' }) });
const hostRefusal = (o) => ({ ok: false, code: 'provider_needs_local_key', error: `provider "${FIXTURE_ID}" needs a key that lives in this instance's registry and has no channel to another machine (D34) — a profile on ${o.host} may use chromium or cdp` });
/** The fixture row WIRED (its control ok on this machine) — every other row as shipped. */
export const wired = {
  row: (id) => (id === FIXTURE_ID ? FIXTURE_ROW : B.providerRow(id)),
  control: (id, o) => (id === FIXTURE_ID ? (o && o.host ? hostRefusal(o) : { ok: true, row: FIXTURE_ROW }) : B.providerControl(id, o)),
  ids: () => [...B.providerIds(), FIXTURE_ID],
};
export const shipped = { row: (id) => B.providerRow(id), control: (id, o) => B.providerControl(id, o), ids: () => B.providerIds() };
/** A world where the fixture row's control refuses with a code the dialog has no state of its own for (a consent the
 *  user has not given) — the row reads `unavailable`. */
export const refused = {
  row: wired.row,
  control: (id, o) => (id === FIXTURE_ID && !(o && o.host) ? { ok: false, code: 'provider_needs_consent', error: `provider "${FIXTURE_ID}" is off until the user allows it` } : wired.control(id, o)),
  ids: wired.ids,
};
/** A build where the fixture row is NOT wired: the row unwired, its control refusing by name. */
const UNWIRED_ROW = Object.freeze({ ...FIXTURE_ROW, wired: false });
export const unwired = {
  row: (id) => (id === FIXTURE_ID ? UNWIRED_ROW : B.providerRow(id)),
  control: (id, o) => {
    if (id !== FIXTURE_ID) return B.providerControl(id, o);
    if (o && o.host) return hostRefusal(o);
    return { ok: false, code: 'provider_unavailable', error: `provider "${FIXTURE_ID}" (${UNWIRED_ROW.label}) cannot be used on this build — not wired in this release` };
  },
  ids: () => [...B.providerIds(), FIXTURE_ID],
};
const lease = (n, profileId = PROFILE_ID) => ({ browserKey: `bk-0000a00${n}`, profileId, sessionId: `sess-${n}`, lastUrl: `https://shop.example/page-${n}` });
export const CLAIM = Object.freeze({ id: 'bl-1a2b', url: 'https://shop.example/checkout', host: 'shop.example', why: 'captcha', evidence: 'HTTP 403 twice, then a press-and-hold challenge on the checkout page', by: 'agent', browserKey: 'bk-0000a001', sessionId: 'sess-1', profileId: PROFILE_ID, tier: 2, at: NOW - 60_000 });

/**
 * One view. `world` = wired | unwired | shipped; `key` = the fixture row's masked source (`{source, whyCode?, whyParams?}`);
 * the rest as the keeper holds it.
 */
export function viewOf(o) { return viewOfBase(o); }
function viewOfBase({
  SWmod = SW, world = wired, profile = {}, key = { source: 'user' },
  // the fixture row's Chromium major = the one its last launch was seen writing (the profile's own is 146 too)
  seats = {}, majors = { [FIXTURE_ID]: { major: 146, at: NOW - 60_000 } }, dirMajor = null, running = [], leases = [lease(1)], inputs = {}, live = true, switching = false, blocked = [],
  keyRequired = null,
} = {}) {
  const p = { id: PROFILE_ID, label: 'shopping', provider: 'chromium', host: null, dir: '/fixture/profiles/shopping', lastChromiumMajor: 146, fingerprintSeed: null, owner: { kind: 'instance', id: null }, scope: 'all', createdAt: NOW - 86_400_000, ...profile };
  const rows = SWmod.switcherRows({
    profile: p, providerIds: world.ids(), rowOf: world.row, controlOf: world.control, capabilityRefusalOf: B.capabilityRefusal,
    sources: (id) => (id === FIXTURE_INTEGRATION ? { integrationId: FIXTURE_INTEGRATION, clusterKey: null, clusterLabel: null, whyCode: null, whyParams: null, ...key } : { source: 'none', whyCode: 'no-values', whyParams: null }),
    seats, majors, dirMajor, now: NOW, runningOf: (prov) => (prov === FIXTURE_ID ? running : []), leases, inputs,
    ...(keyRequired === null ? {} : { keyRequiredOf: () => keyRequired }),
  });
  const f = SW.backendFact(p, { seats, majors });
  return {
    profile: { ...p }, chip: SW.backendChip({ provider: f.id, major: f.major }), rows, seats: {}, siteHints: [],
    blocked: blocked.map((b) => ({ ...b, text: SW.blockedText(b) })), leases: leases.map((l) => ({ ...l })), switching, live,
    versions: { recorded: p.lastChromiumMajor, dir: dirMajor, majors: { ...majors } },
  };
}

/** Every named view (fresh objects each call). One per target state + the worlds and the edge cases. `SWmod` = the
 *  switch module to drive (a negative control hands a patched copy; default the real one). */
export function views(SWmod = SW) {
  const viewOf = (o) => viewOfBase({ SWmod, ...o });
  const seat = { [FIXTURE_INTEGRATION]: { tier: 'free', total: 1, at: NOW - 1_000 } };
  const v = {
    // W1: a build where the fixture row is not wired — nothing to switch to
    w1: viewOf({ world: unwired, key: { source: 'none', whyCode: 'no-values' } }),
    'w1-claim': viewOf({ world: unwired, key: { source: 'none', whyCode: 'no-values' }, blocked: [CLAIM] }),
    // W2: the fixture row wired
    ready: viewOf({ leases: [lease(1), lease(2)] }),
    'two-leases': viewOf({ leases: [lease(1), lease(2)] }),
    'not-live': viewOf({ leases: [lease(1), lease(2)], live: false }),
    'ready-confirm': viewOf({ profile: { lastChromiumMajor: null }, dirMajor: null }),
    'ready-confirm-two': viewOf({ profile: { lastChromiumMajor: null }, dirMajor: null, leases: [lease(1), lease(2)] }),
    'needs-key': viewOf({ keyRequired: true, key: { source: 'none', whyCode: 'no-values' } }),
    'needs-key-undecryptable': viewOf({ keyRequired: true, key: { source: 'none', whyCode: 'undecryptable', whyParams: { fields: ['apiKey'] } } }),
    'needs-key-unknown-code': viewOf({ keyRequired: true, key: { source: 'none', whyCode: 'zz-not-a-code' } }),
    // what the REAL store answers with nothing configured anywhere (no key of the user's, no cluster preset) — the naive-
    // user verifier (2026-09-28) read "the saved key can't be used: the cluster provides no default" on this one
    'needs-key-no-preset': viewOf({ keyRequired: true, key: { source: 'none', whyCode: 'no-preset' } }),
    'needs-key-own-missing': viewOf({ keyRequired: true, key: { source: 'none', whyCode: 'own-missing' } }),
    'needs-key-preset-gone': viewOf({ keyRequired: true, key: { source: 'none', whyCode: 'preset-gone', whyParams: { key: 'team' } } }),
    unavailable: viewOf({ world: refused }),
    'older-browser': viewOf({ profile: { lastChromiumMajor: 151 }, majors: { [FIXTURE_ID]: { major: 146, at: NOW - 1_000 } } }),
    'all-in-use-own': viewOf({ seats: seat, running: [{ profileId: 'bp-0000b0b1', label: 'Vendor portal' }] }),
    'all-in-use-shared': viewOf({ key: { source: 'cluster', clusterKey: 'default' }, seats: seat, running: [{ profileId: 'bp-0000b0b1', label: 'Vendor portal' }] }),
    driven: viewOf({ leases: [lease(1)], inputs: { [`bk-0000a001|${PROFILE_ID}`]: { input: 'user' } } }),
    switching: viewOf({ profile: { provider: FIXTURE_ID }, leases: [lease(1), lease(2)], switching: true }), // the keeper commits the new provider BEFORE its start(): mid-switch the profile already names it
    'current-cdp': viewOf({ profile: { provider: 'cdp', dir: null, lastChromiumMajor: null } }),
    'current-cloud': viewOf({ profile: { provider: 'cloud:browserbase', dir: null, lastChromiumMajor: null }, key: { source: 'none', whyCode: 'no-values' } }),
    'current-local-window': viewOf({ profile: { provider: 'local-window', dir: null, lastChromiumMajor: null } }),
    'current-fixture': viewOf({ profile: { provider: FIXTURE_ID } }),
    'host-profile': viewOf({ profile: { host: 'dev-1', dir: null } }),
  };
  return v;
}
/** The row the fixtures are about: the fixture row's (chromium's when the fixture row is the current one). */
export function targetRowOf(view) {
  const cur = view.profile.provider || 'chromium';
  return view.rows.find((r) => r.id === (cur === FIXTURE_ID ? 'chromium' : FIXTURE_ID));
}

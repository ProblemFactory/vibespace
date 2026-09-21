'use strict';
/**
 * THE LIVE BACKEND SWITCH AND THE KEY-CONSUMER HALF, AS DECISIONS
 * (agent browser P4 second half — docs/design-agent-browser-v2.md §7.4 /
 * §7.5 / §7.6, D17 / D32 / D33 / D34, the round-8 clauses).
 *
 * PURE: imports nothing; CJS so the keeper, the routes, the ORCH key consumer
 * (src/server/browser-backend.js) AND the bundle (the switcher dialog, the
 * chip) share ONE spelling of every refusal. Nothing here touches a file, a
 * process or the network — every function answers a typed verdict over its
 * inputs, and the ORCH half acts on the verdict.
 *
 * What is decided here, and why it is a decision rather than an `if` in the
 * keeper:
 *
 *   · the VERSION LADDER (§7.4): Chromium's profile stamp is one-way, so
 *     "may this backend open this directory" must be answered BEFORE a byte
 *     moves — and the fact the guard reads (the registry's `lastChromiumMajor`)
 *     is never the fact a bad write produces (the directory's own `Last
 *     Version`); when they disagree the HIGHER wins (refusing one legitimate
 *     downgrade is cheaper than allowing one that destroys a profile);
 *   · the SEED (§7.4): a profile's `fingerprintSeed` is minted ONCE and
 *     carried through every switch — a changed fingerprint is a new machine
 *     to the site, and the dialog says so from the fact, not from a guess;
 *   · SEATS ARE THREE STATES, NOT A NUMBER (round 8 #2): the total comes from
 *     the FIRST REAL LAUNCH, never from Test (cloak's Test is shape-only) and
 *     never from a poll; a reading older than SEAT_TIER_STALE_MS degrades to
 *     unknown, and AN UNKNOWN TOTAL NEVER SATISFIES THE CEILING TEST —
 *     `unknown` is neither 0 nor ∞ and takes no part in the comparison;
 *   · THE CEILING WORDING FORKS ON WHERE THE KEY CAME FROM (round 8 #3): the
 *     user's own key ⇒ every seat is on this instance ⇒ name the holders and
 *     offer to stop one; the cluster default ⇒ this instance cannot list the
 *     other pods' profiles ⇒ it may not pretend to ("seats shared with other
 *     users; N used on this instance") plus the one-click way out;
 *   · THREE NAMED REFUSALS, none a timeout and none a silent fallback (D33):
 *     backend_unavailable / backend_no_key / backend_seat_taken;
 *   · `keyScope: 'local-only'` IS A REFUSAL (D34): a key-bearing provider on
 *     `host != null` is refused BEFORE anything is resolved — the plaintext
 *     key has no channel to another machine, so the gate must not even ask;
 *   · `blocked` IS A CLAIM THE AGENT MAKES, never a detection the server
 *     manufactures; a 403/429 produces a HINT that names its source;
 *   · per-site memory stores WHO claimed it, and `tier` is legal ONLY while
 *     `backend === null` (§7.6 rule 2 — once a backend is named the tier is
 *     derived from it, never stored twice).
 */

// ── §7.4 seats: the staleness horizon and the vendor's published tiers ────
/** A claim that REFUSES something must carry a date: the shape this repo
 *  already runs for overage (`OVERAGE_STALE_MS`, src/spend-authorizer.js). */
const SEAT_TIER_STALE_MS = 7 * 24 * 3600 * 1000;
/** Repository docs, verbatim in the design (§7.2/§7.4): the free tier ships
 *  Chromium 146 with ONE concurrent session; Pro ships 151 with 5/20/200/2000. */
const CLOAK_TIERS = Object.freeze({
  free: Object.freeze({ total: 1, chromiumMajor: 146 }),
  pro: Object.freeze({ total: null, chromiumMajor: 151 }),
});
const CLOAK_PRO_TOTALS = Object.freeze([5, 20, 200, 2000]);

// ── §7.5 the six rows this track consumes: the vendor's own env names ────
/**
 * Field → the VENDOR'S OWN env name. That name appears ONLY in the
 * environment of the one child the keeper spawns for that provider (never a
 * file, never argv, never a log line, never `agentEnv`) — the same rule as
 * §6.4's "provider auth keys live in the registry server-side". The names
 * are the installed 0.32.0 binary's own (design §7.5, measured with
 * `strings`), except `cloud:agentcore`, whose set is UNVERIFIED (the row says
 * so in its help text and stays unwired until it is).
 *
 * `host` is §7.5's per-row EGRESS RULE: a Test runner may reach exactly the
 * ONE host derived from its own row's fields — a constant for the vendors
 * with one API host, the host INSIDE the field the user typed for
 * browserless / kernel, the region-derived host for agentcore, and NONE for
 * cloak (shape-only, zero network). A host that cannot be derived is a named
 * refusal, never "let us try the default".
 */
const KEY_ROWS = Object.freeze({
  cloak: Object.freeze({ env: Object.freeze({ licenseKey: 'CLOAKBROWSER_LICENSE_KEY' }), host: null, provider: 'cloak' }),
  'cloud:browserbase': Object.freeze({ env: Object.freeze({ apiKey: 'BROWSERBASE_API_KEY' }), host: Object.freeze({ constant: 'api.browserbase.com' }), provider: 'cloud:browserbase' }),
  'cloud:browserless': Object.freeze({ env: Object.freeze({ apiKey: 'BROWSERLESS_API_KEY', apiUrl: 'BROWSERLESS_API_URL', stealth: 'BROWSERLESS_STEALTH' }), host: Object.freeze({ field: 'apiUrl' }), provider: 'cloud:browserless' }),
  'cloud:kernel': Object.freeze({ env: Object.freeze({ apiKey: 'KERNEL_API_KEY', endpoint: 'KERNEL_ENDPOINT', stealth: 'KERNEL_STEALTH' }), host: Object.freeze({ field: 'endpoint' }), provider: 'cloud:kernel' }),
  'cloud:browseruse': Object.freeze({ env: Object.freeze({ apiKey: 'BROWSER_USE_API_KEY' }), host: Object.freeze({ constant: 'api.browser-use.com' }), provider: 'cloud:browseruse' }),
  'cloud:agentcore': Object.freeze({ env: Object.freeze({ accessKeyId: 'AWS_ACCESS_KEY_ID', secretAccessKey: 'AWS_SECRET_ACCESS_KEY', region: 'AWS_REGION' }), host: Object.freeze({ region: 'bedrock-agentcore.{region}.amazonaws.com' }), provider: 'cloud:agentcore' }),
});
const KEY_IDS = Object.freeze(Object.keys(KEY_ROWS));
/** Every vendor env NAME this track may ever put into a child — the census
 *  `agentEnv` must drop none of these by rule (they are not VIBESPACE_*), which
 *  is exactly why the cluster may inject ONLY under the integration store's own prefixed names. */
const VENDOR_ENV_NAMES = Object.freeze([...new Set(KEY_IDS.flatMap((id) => Object.values(KEY_ROWS[id].env)))]);

/** The integration-registry row a provider's key lives in; null = needs none. */
function integrationIdFor(provider) {
  const p = String(provider == null ? '' : provider);
  if (p === 'cloak') return 'cloak';
  if (/^cloud:[a-z0-9-]+$/.test(p) && KEY_ROWS[p]) return p;
  return null;
}
/** The child's env pairs for a provider, from RESOLVED values — only the
 *  fields that carry a value, under the vendor's own names. `{}` for a
 *  provider that needs no key. Never logged by any caller. */
function vendorEnvFor(provider, values) {
  const id = integrationIdFor(provider);
  const out = {};
  if (!id) return out;
  for (const [field, name] of Object.entries(KEY_ROWS[id].env)) {
    const v = values && values[field];
    if (v !== undefined && v !== null && String(v).length) out[name] = String(v);
  }
  return out;
}
/** The argv PREFIX the keeper puts before `open` for a provider: cloak = the
 *  same directory opened by the OTHER binary with its seed (§7.4 — the two
 *  supported shapes: a custom executable path since agent-browser 0.8.7, and
 *  `--fingerprint=seed`, the launch parameter the durable half of the
 *  fingerprint lives in); cloud = upstream's own `-p <provider>`. The seed is
 *  not a secret and the path is not a secret; the KEY never rides argv. */
function launchArgsFor(provider, { seed = null, executablePath = '' } = {}) {
  const p = String(provider == null ? '' : provider);
  if (p === 'cloak') {
    const a = [];
    if (executablePath) a.push('--executable-path', String(executablePath));
    if (Number.isInteger(seed)) a.push('--args', `--fingerprint=${seed}`);
    return a;
  }
  const m = /^cloud:([a-z0-9-]+)$/.exec(p);
  if (m) return ['-p', m[1]];
  return [];
}
/** Does this provider carry a fingerprint seed at all (§7.4)? */
function providerNeedsSeed(provider) { return String(provider || '') === 'cloak'; }
/** A seed minted from 8 hex characters (the keeper hands it crypto bytes):
 *  a positive 31-bit integer, the shape `--fingerprint=<seed>` takes. */
function mintSeed(hex8) {
  const n = parseInt(String(hex8 || '').slice(0, 8), 16);
  return Number.isFinite(n) ? (n % 0x7fffffff) || 1 : 1;
}
/** The seed a switch carries: the profile's own (minted ONCE at creation or
 *  at its first switch to a seeded backend), never a fresh one per switch. */
function seedForSwitch({ profile, target, hex = '00000001' } = {}) {
  const had = profile && Number.isInteger(profile.fingerprintSeed) ? profile.fingerprintSeed : null;
  if (!providerNeedsSeed(target)) return { seed: had, minted: false };
  if (had !== null) return { seed: had, minted: false };
  return { seed: mintSeed(hex), minted: true };
}

// ── §7.4 the version ladder ──────────────────────────────────────────────
/** The MAJOR of a version string ("146.0.7000.1" → 146); null when unreadable. */
function majorOf(v) {
  const m = /(\d{2,4})(?:\.\d+)*/.exec(String(v == null ? '' : v));
  return m ? Number(m[1]) : null;
}
/** The directory's own `Last Version` file, read-only, is "146.0.7000.1\n". */
function parseLastVersion(text) { return majorOf(String(text == null ? '' : text).trim()); }
/** The major of a Chrome/Chromium `Browser` string from /json/version
 *  ("Chrome/146.0.7000.1", "HeadlessChrome/146.0…"). */
function majorOfBrowserString(s) {
  const m = /(?:Chrome|Chromium)\/(\d{2,4})/i.exec(String(s || ''));
  return m ? Number(m[1]) : null;
}
/** The name the ladder calls a cloak target whose tier is not yet known. */
function cloakTargetName(provider, tier) { return String(provider) === 'cloak' && !(tier && CLOAK_TIERS[tier]) ? 'cloak (free tier assumed until its first launch)' : String(provider); }
/** Which major the TARGET backend would write: cloak's is its tier's (the
 *  vendor's published pair) or the last one it was seen writing; chromium's
 *  is the last one its launch reported. null = unknown, and unknown is never
 *  "old enough" (the floor rule this repo already runs). */
function chromiumMajorFor(provider, { tier = null, majors = {} } = {}) {
  const p = String(provider || '');
  const seen = majors && majors[p] && Number.isInteger(majors[p].major) ? majors[p].major : null;
  if (p === 'cloak') {
    // the tier is read back from the FIRST REAL LAUNCH (§7.4); until then the
    // FREE tier's major is the FLOOR of what any cloak build writes — the
    // conservative assumption (it refuses one more legitimate pro downgrade
    // rather than allowing one that destroys a profile), and the refusal's
    // wording says the tier was assumed (`cloakTargetName`)
    const t = tier && CLOAK_TIERS[tier] ? CLOAK_TIERS[tier].chromiumMajor : CLOAK_TIERS.free.chromiumMajor;
    return seen != null ? Math.max(t, seen) : t;
  }
  return seen;
}
/**
 * THE LADDER (§7.4's table), run BEFORE a single byte moves:
 *   target ≥ the major that last wrote the directory  ⇒ switch, record the new major
 *   target <  that major                              ⇒ REFUSE naming both, two ways out
 *   nothing recorded and the directory unreadable    ⇒ refuse the AUTOMATIC downgrade,
 *                                                      require one explicit human confirmation
 * "What last wrote it" = the HIGHER of the registry's copy and the directory's
 * own stamp; a disagreement is reported so the properties row can say it.
 */
function versionLadder({ target = null, targetMajor = null, recordedMajor = null, dirMajor = null, confirmed = false } = {}) {
  const rec = Number.isInteger(recordedMajor) ? recordedMajor : null;
  const dir = Number.isInteger(dirMajor) ? dirMajor : null;
  const wrote = rec != null && dir != null ? Math.max(rec, dir) : (rec != null ? rec : dir);
  const disagreement = rec != null && dir != null && rec !== dir ? { recorded: rec, dir, taken: wrote } : null;
  const tgt = Number.isInteger(targetMajor) ? targetMajor : null;
  const name = target || 'the target backend';
  if (wrote == null) {
    if (confirmed) return { ok: true, why: 'no recorded major for this directory — human-confirmed', recordMajor: tgt, disagreement, confirmed: true };
    return { ok: false, code: 'downgrade_unknown', needsConfirm: true, error: `nothing has recorded which Chromium major wrote this profile directory and its own "Last Version" stamp could not be read — an automatic switch could be a downgrade, which Chromium refuses one-way ("profile from a newer version"); confirm once to switch to ${name} anyway`, disagreement };
  }
  if (tgt == null) {
    if (confirmed) return { ok: true, why: `${name}'s Chromium major is not known yet (it is read back from its first launch) — human-confirmed`, recordMajor: null, disagreement, confirmed: true };
    return { ok: false, code: 'downgrade_unknown', needsConfirm: true, error: `this directory was last written by Chromium ${wrote} and ${name}'s Chromium major is not known yet (it is read back from its first launch) — a lower major would be refused by Chromium one-way; confirm once to switch anyway`, wrote, disagreement };
  }
  if (tgt < wrote) {
    return {
      ok: false, code: 'downgrade_refused', wrote, targetMajor: tgt, disagreement,
      error: `${name} runs Chromium ${tgt} but this profile directory was last written by Chromium ${wrote} — the profile stamp is one-way ("Your profile can not be used because it is from a newer version"), so opening it would destroy it`,
      waysOut: [
        `upgrade ${name} to a build with Chromium ${wrote} or newer`,
        'clone the profile through export / import (agent-browser --state / --restore): cookies, localStorage and an opt-in IndexedDB snapshot cross; sessionStorage and non-extractable CryptoKeys do NOT — an app that keeps its local decryption keys as non-extractable CryptoKeys (WhatsApp Web is the known case) does not bring its login across',
      ],
    };
  }
  return { ok: true, why: tgt === wrote ? `same Chromium major (${tgt})` : `Chromium ${tgt} ≥ ${wrote}, the major that last wrote this directory`, recordMajor: tgt, wrote, disagreement };
}
/** The fingerprint FACT a switch carries — 'gains' (chromium → a seeded backend), 'loses' (the reverse) or null; the client says the words. */
function fingerprintChange({ from, to } = {}) {
  const f = providerNeedsSeed(from), t = providerNeedsSeed(to);
  if (String(from || '') === String(to || '')) return null;
  return t && !f ? 'gains' : (f && !t ? 'loses' : null);
}
/** The dialog's one honest sentence about the fingerprint (§7.4): a changed
 *  fingerprint is a new machine as far as the site is concerned. null when
 *  nothing about the fingerprint changes. */
function fingerprintNote({ from, to, hadSeed = false, seed = null } = {}) {
  const f = String(from || ''), t = String(to || '');
  if (f === t) return null;
  if (providerNeedsSeed(t) && !providerNeedsSeed(f)) {
    return `this profile had no stable fingerprint before; after the switch, sites may ask you to log in again (its fingerprint seed${Number.isInteger(seed) ? ' ' + seed : ''} is ${hadSeed ? 'the one minted earlier' : 'minted now'} and carried through every later switch). The cookie jar crosses untouched — a site that binds its session to the fingerprint sees a new device.`;
  }
  if (providerNeedsSeed(f) && !providerNeedsSeed(t)) {
    return 'this profile leaves its stable fingerprint behind: sites that bound your login to it will see a new device and may ask you to log in again. The cookie jar crosses untouched.';
  }
  return null;
}

// ── §7.4 seats: three states, and a ceiling only the fresh one can refuse ──
/**
 * `{state, tier, total, at, age, text}` — known-fresh / known-stale / unknown.
 * The reading is `{tier, total, at}` recorded by the keeper from the FIRST
 * REAL LAUNCH of that key (a by-product of a launch the user asked for, not a
 * poll). Under a cluster default `unknown` is the NORMAL state (D32): such a
 * user never opens the card, and the launch is what makes it known.
 */
function seatState({ tier = null, total = null, at = 0, now = 0, staleMs = SEAT_TIER_STALE_MS } = {}) {
  const t = Number.isInteger(total) && total > 0 ? total : (tier && CLOAK_TIERS[tier] && Number.isInteger(CLOAK_TIERS[tier].total) ? CLOAK_TIERS[tier].total : null);
  const when = Number(at) || 0;
  if (!when || t == null) return { state: 'unknown', tier: tier || null, total: null, at: when || 0, age: null, text: 'seat limit unknown — it becomes known the first time this key actually launches a browser' };
  const age = Math.max(0, (Number(now) || 0) - when);
  if (age > staleMs) return { state: 'known-stale', tier: tier || null, total: null, lastTotal: t, at: when, age, text: `seat limit unknown — the last reading (${tier ? tier + ', ' : ''}${t} seat${t === 1 ? '' : 's'}) is from ${ageText(age)} ago and no longer constrains; it is re-read at the next launch` };
  return { state: 'known-fresh', tier: tier || null, total: t, at: when, age, text: `${t} seat${t === 1 ? '' : 's'} total (tier read from a launch ${ageText(age)} ago)` };
}
function ageText(ms) {
  const s = Math.max(0, Math.round((Number(ms) || 0) / 1000));
  if (s < 90) return `${s} s`;
  if (s < 5400) return `${Math.round(s / 60)} min`;
  if (s < 172800) return `${Math.round(s / 3600)} h`;
  return `${Math.round(s / 86400)} d`;
}
/**
 * THE CEILING TEST, and the wording of its refusal. `used` is the keeper's
 * own count on THIS instance (no vendor interface answers "how many seats is
 * this key holding right now", §12.35). A refusal is possible ONLY while the
 * total is known and fresh — an unknown total is neither 0 nor ∞. The
 * wording forks on `source`: the user's own key ⇒ name the holders, offer to
 * stop one; the cluster default ⇒ never list a profile, say the seats are
 * shared fleet-wide and offer the one click out. A refusal may only state
 * what its own reason knows.
 */
function seatVerdict({ state, used = 0, provider = 'cloak', source = 'none', holders = [], integrationId = null } = {}) {
  const st = state && state.state ? state : seatState({});
  const u = Math.max(0, Number(used) || 0);
  const after = u + 1;
  const base = { state: st, used: u, after, text: st.state === 'known-fresh' ? `${u} used / ${st.total} total · ${after} after this switch (${st.text})` : `${u} used on this instance / ${st.text}` };
  if (st.state !== 'known-fresh') return { ok: true, ...base, ceiling: null };
  if (after <= st.total) return { ok: true, ...base, ceiling: null };
  if (source === 'cluster') {
    return {
      ok: false, code: 'backend_seat_ceiling', ...base, source,
      error: `${provider}: cluster default (seats shared with other users; ${u} used on this instance of ${st.total}) — this instance cannot see the other users' browsers, so the way out is your own key`,
      action: integrationId ? { openIntegration: integrationId, label: 'use my own key' } : null,
      holders: [],
    };
  }
  const names = (holders || []).map((h) => (h && (h.label || h.profileId)) || String(h)).filter(Boolean);
  return {
    ok: false, code: 'backend_seat_ceiling', ...base, source,
    error: `${provider}: every seat of your key is in use on this instance (${u} of ${st.total})${names.length ? ' — held by ' + names.join(', ') : ''}; stop one of them to switch`,
    holders: (holders || []).map((h) => ({ profileId: h.profileId || null, label: h.label || null })),
    action: null,
  };
}
/**
 * A FAILED LAUNCH of a key-bearing provider, classified (round 8 #3). The
 * criterion for `backend_seat_taken` is, until §12.40 is measured, "the
 * launch failed and the error names licensing / concurrency" — the vendor's
 * exact words for a free-tier seat held ON ANOTHER MACHINE are not recorded
 * yet, so this classifier keys on the family of words, and that sentence is
 * here waiting to be narrowed. Under a cluster default the refusal says the
 * seats are shared fleet-wide ("stop one of yours" is the wrong advice — this
 * instance may hold none) and offers the one click out.
 */
const SEAT_TAKEN_RE = /licen[cs]e|concurren|\bseats?\b|session limit|max(?:imum)? sessions|too many sessions/i;
function classifyLaunchFailure({ provider, text = '', source = 'none', integrationId = null } = {}) {
  const t = String(text || '').trim().slice(0, 400);
  if (integrationId && SEAT_TAKEN_RE.test(t)) {
    const cluster = source === 'cluster';
    return {
      code: 'backend_seat_taken', provider, source,
      error: `${provider}: the launch failed on licence/concurrency validation (${t.slice(0, 160)}) — ${cluster ? 'this key is the cluster default, so its seats are shared fleet-wide: another user\'s browser may hold the seat and stopping one of yours may not help' : 'another browser under this key holds the seat (on this instance or elsewhere)'}`,
      action: { openIntegration: integrationId, label: cluster ? 'use my own key' : 'check the key' },
    };
  }
  return { code: 'launch_failed', provider, source, error: `${provider}: launch failed: ${t || 'no output'}`, action: null };
}
/** The tier a `cloakserve` / `cloakbrowser` launch prints, read back once
 *  (the first real launch is the ONE source of the total). null = nothing
 *  recognisable — the reading stays unknown rather than a fabricated number. */
function tierFromLaunch(text) {
  const t = String(text || '');
  const tm = /\b(free|pro)\b(?:\s*(?:tier|plan))?/i.exec(t);
  const nm = /(\d{1,4})\s*(?:concurrent\s+)?(?:sessions?|seats?)/i.exec(t);
  const tier = tm ? tm[1].toLowerCase() : null;
  let total = nm ? Number(nm[1]) : null;
  if (tier === 'free' && total == null) total = CLOAK_TIERS.free.total;
  if (!tier && total == null) return null;
  return { tier, total: Number.isInteger(total) && total > 0 ? total : null };
}

// ── §7.5 the derived test host + the one request a runner may make ────────
/** The ONE host a Test runner may reach — derived per row (§7.5's rule), a
 *  named refusal when it cannot be derived. `{ok:true, host:null}` = zero
 *  network (cloak). */
function testHostFor(rowId, values = {}) {
  const row = KEY_ROWS[String(rowId)];
  if (!row) return { ok: false, code: 'unknown-integration', error: `no key row ${rowId}` };
  if (!row.host) return { ok: true, host: null, rule: 'none (shape-only, zero network)' };
  if (row.host.constant) return { ok: true, host: row.host.constant, rule: 'constant' };
  if (row.host.field) {
    const raw = String((values && values[row.host.field]) || '').trim();
    if (!raw) return { ok: false, code: 'host_underivable', error: `${rowId}: its Test may reach only the host inside the ${row.host.field} you typed, and that field is empty — set ${row.host.field} first (never a default host)` };
    const h = hostOfUrl(raw);
    if (!h) return { ok: false, code: 'host_underivable', error: `${rowId}: ${row.host.field} (${raw.slice(0, 80)}) is not a URL with a host` };
    return { ok: true, host: h, rule: `field ${row.host.field}` };
  }
  if (row.host.region) {
    const region = String((values && values.region) || '').trim().toLowerCase();
    if (!/^[a-z]{2}-[a-z]+-\d$/.test(region)) return { ok: false, code: 'host_underivable', error: `${rowId}: its host is derived from the region field (e.g. us-east-1), which is ${region ? 'not a region id: ' + region.slice(0, 40) : 'empty'}` };
    return { ok: true, host: row.host.region.replace('{region}', region), rule: 'region' };
  }
  return { ok: false, code: 'host_underivable', error: `${rowId}: no host rule` };
}
function hostOfUrl(s) {
  const m = /^(?:https?:\/\/)?([a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*)(?::\d{1,5})?(?:\/|$)/i.exec(String(s || '').trim());
  return m ? m[1].toLowerCase() : null;
}
/** The ONE bounded read-only request a credential-exchange runner makes, as
 *  data: `{url, headers}` on the derived host — the key rides a HEADER, never
 *  the URL (a URL is logged by every error path). Creates no session, runs no
 *  page. `null` for a row with no network Test. */
function testRequestFor(rowId, values = {}) {
  const h = testHostFor(rowId, values);
  if (!h.ok || !h.host) return h.ok ? null : h;
  const v = values || {};
  switch (String(rowId)) {
    case 'cloud:browserbase': return { ok: true, host: h.host, url: `https://${h.host}/v1/sessions?status=RUNNING`, headers: { 'x-bb-api-key': String(v.apiKey || '') } };
    case 'cloud:browserless': return { ok: true, host: h.host, url: `${baseOf(v.apiUrl, h.host)}/pressure`, headers: { Authorization: `Bearer ${String(v.apiKey || '')}` } };
    case 'cloud:kernel': return { ok: true, host: h.host, url: `${baseOf(v.endpoint, h.host)}/browsers`, headers: { Authorization: `Bearer ${String(v.apiKey || '')}` } };
    case 'cloud:browseruse': return { ok: true, host: h.host, url: `https://${h.host}/api/v2/browsers`, headers: { 'X-Browser-Use-API-Key': String(v.apiKey || '') } };
    case 'cloud:agentcore': return { ok: true, host: h.host, url: `https://${h.host}/`, headers: {}, unsigned: true };
    default: return { ok: false, code: 'no-test', error: `${rowId} has no network Test` };
  }
}
function baseOf(raw, host) {
  const s = String(raw || '').trim().replace(/\/+$/, '');
  return /^https?:\/\//i.test(s) ? s : `https://${host}`;
}

// ── §7.4 / §7.6 per-site memory and the agent's `blocked` claim ─────────
const HINT_BY = Object.freeze(['agent', 'user']);
const TIERS = Object.freeze([1, 2, 3]);
/** An exact HOST (never a registrable domain — that needs a public-suffix
 *  list, a second source of truth that expires): from a URL or a bare host. */
function normalizeHost(v) {
  const s = String(v == null ? '' : v).trim();
  if (!s) return null;
  return hostOfUrl(s);
}
/**
 * A per-site CLAIM: `{host, tier, backend, by, at, why}` — who claimed it,
 * when, why. `tier` is legal ONLY while `backend === null` (§7.6 rule 2): a
 * suggestion made before any provider is chosen can only say "change tier";
 * once `backend` names a provider the tier is derived from it and storing it
 * again would be the twin §3.3 forbids.
 */
function siteHintVerdict({ host, tier = null, backend = null, by = 'agent', at = 0, why = '', providerIds = null } = {}) {
  const h = normalizeHost(host);
  if (!h) return { ok: false, code: 'bad-request', error: 'a site hint names an exact host (or a URL to take it from)' };
  const b = backend == null || backend === '' ? null : String(backend);
  const t = tier == null || tier === '' ? null : Number(tier);
  if (t != null && !TIERS.includes(t)) return { ok: false, code: 'bad-request', error: `tier must be one of ${TIERS.join(', ')}` };
  if (b && t != null) return { ok: false, code: 'hint_tier_with_backend', error: 'a site hint carries EITHER a backend OR a tier: once a backend is named the tier is derived from it and never stored twice (§7.6 rule 2)' };
  if (!b && t == null) return { ok: false, code: 'bad-request', error: 'a site hint says what the site needs — a backend, or (before one is chosen) a tier' };
  if (b && Array.isArray(providerIds) && !providerIds.includes(b)) return { ok: false, code: 'provider_unknown', error: `unknown backend "${b}" — one of ${providerIds.join(', ')}` };
  if (!HINT_BY.includes(String(by))) return { ok: false, code: 'bad-request', error: `by must be one of ${HINT_BY.join(', ')}` };
  return { ok: true, value: { host: h, tier: t, backend: b, by: String(by), at: Number(at) || 0, why: String(why || '').slice(0, 200) } };
}
/** The hint for a host, from the list (exact host). */
function siteHintFor(hints, hostOrUrl) {
  const h = normalizeHost(hostOrUrl);
  if (!h) return null;
  return (hints || []).find((x) => x && x.host === h) || null;
}
/**
 * `vibespace-browser blocked` — A CLAIM, NOT A DETECTION. The server records
 * who said it (always the agent of a conversation), for which URL, why, with
 * what evidence and which tier it suggests; it never claims to have detected
 * a block itself, and the record has no field for one.
 */
function blockedClaim({ url, why = '', evidence = '', by = 'agent', browserKey = null, sessionId = null, profileId = null, tier = null, at = 0, id = null } = {}) {
  const u = String(url || '').trim();
  const host = normalizeHost(u);
  if (!u || !host) return { ok: false, code: 'bad-request', error: 'blocked needs --url <the page you were blocked on>' };
  if (String(by) !== 'agent') return { ok: false, code: 'bad-request', error: 'a blocked claim is made by the agent of a conversation — the server never manufactures one' };
  const t = tier == null || tier === '' ? null : Number(tier);
  if (t != null && !TIERS.includes(t)) return { ok: false, code: 'bad-request', error: `tier must be one of ${TIERS.join(', ')}` };
  return {
    ok: true,
    value: {
      id: id || null, url: u.slice(0, 2000), host, why: String(why || '').slice(0, 64), evidence: String(evidence || '').slice(0, 400),
      by: 'agent', browserKey: browserKey == null ? null : String(browserKey), sessionId: sessionId == null ? null : String(sessionId), profileId: profileId == null ? null : String(profileId),
      tier: t == null ? 2 : t, at: Number(at) || 0,
    },
  };
}
/** The sentence the UI shows: it says WHO claimed it, never "we detected". */
function blockedText(claim) {
  if (!claim) return '';
  const tierWord = claim.tier === 3 ? ' (a window on your own desktop — your act: the real-desktop switch, then the agent uses vibespace-window; nothing escalates by itself)' : claim.tier === 2 ? ' (a fingerprint backend — your act in the switcher)' : '';
  return `the agent says this page is blocked (${claim.host}${claim.why ? ': ' + claim.why : ''}) and suggests tier ${claim.tier}${tierWord}${claim.evidence ? ' — ' + claim.evidence : ''}`;
}
/** The HINT a real 403/429 carries on the CLI's error (§7.6 rule 5): typed
 *  `{tier, why}`, worded so it cannot be mistaken for a detection. */
function navHint(status) {
  const s = Number(status);
  if (s !== 403 && s !== 429) return null;
  return { tier: 2, why: `HTTP ${s}`, hint: 'may-need-cloak', source: 'http-status', text: `HTTP ${s} — a hint from the status code, not a detection: the page may need a tier-2 backend (vibespace-browser blocked --url <u> --why http-${s} records your claim)` };
}

// ── the chip and the switch gate ─────────────────────────────────────────
/** `chromium 146` / `cloak 146 (free)` / `cdp` — the one thing a user wants
 *  to know at the moment they are blocked. */
function backendChip({ provider = 'chromium', major = null, tier = null } = {}) {
  const p = String(provider || 'chromium');
  const m = Number.isInteger(major) ? ' ' + major : '';
  const t = p === 'cloak' && tier ? ` (${tier})` : '';
  return `${p}${m}${t}`;
}
/** The one-time typed refusal while a switch is in flight (§7.4: the gap in
 *  the middle is a NAMED refusal, the same family as tab_gone / browser_paused). */
function restartingRefusal(profile) {
  return { ok: false, code: 'browser_restarting', error: `"${(profile && profile.label) || 'this profile'}" is switching backend — its browser is being restarted; retry in a moment (your lease survives, your tab is re-opened at its last URL)` };
}
const SWITCH_CODES = Object.freeze(['provider_unknown', 'switch_noop', 'backend_unavailable', 'provider_needs_local_key', 'provider_local_only', 'switch_refused', 'switch_export_only', 'backend_no_key', 'downgrade_refused', 'downgrade_unknown', 'backend_seat_ceiling', 'backend_seat_taken', 'browser_restarting', 'not_owner']);
/** §7.4 failure form (1)'s INSTALL action: its typed refusals, a closed set the routes' STATUS table mirrors. */
const INSTALL_CODES = Object.freeze(['install_local_only', 'already_installed', 'install_running', 'install_precondition_unmet', 'install_unavailable']);
/**
 * THE GATE, in this order and no other (each rung closes a place that would
 * otherwise fail silently, and the ORDER is what leg (viii) asserts — a
 * key-bearing target on `host != null` is refused before `resolveKey` is
 * ever called):
 *   1 the row exists · 2 not a no-op · 3 the capability control for THIS
 *   machine (unwired ⇒ backend_unavailable naming what is missing; keyScope
 *   local-only on a host ⇒ provider_needs_local_key, D34) · 4 canSwitchTo of
 *   the target AND of the current backend (cdp / local-window: "a second
 *   profile", cloud: export-only) · 5 the key (resolved ONCE, here) ⇒
 *   backend_no_key with the actionable way out (D33) · 6 the version ladder
 *   · 7 seats · 8 direct vs PROPOSAL (a profile somebody is DRIVING is never
 *   interrupted by an agent's proposal; another session's lease turns an
 *   agent's switch into a "For you" item for the owner).
 */
function switchVerdict({ profile, target, rowOf, controlOf, capabilityRefusalOf = null, resolveKey = null, seats = {}, majors = {}, dirMajor = null, confirmed = false, leases = [], inputs = {}, by = { kind: 'user' }, byKey = null, now = 0, hex = '00000001', runningOf = () => [] } = {}) {
  if (!profile) return { ok: false, code: 'not-found', error: 'no such profile' };
  const to = String(target == null ? '' : target);
  const row = rowOf(to);
  if (!row) return { ok: false, code: 'provider_unknown', error: `unknown backend "${to}"` };
  const from = String(profile.provider || 'chromium');
  if (from === to) return { ok: false, code: 'switch_noop', error: `"${profile.label}" already runs on ${to}` };
  const control = controlOf(to, { host: profile.host || null });
  if (!control.ok) {
    if (control.code === 'provider_unavailable') return { ok: false, code: 'backend_unavailable', provider: to, error: control.error, missing: row.binary || null };
    return { ok: false, code: control.code, provider: to, error: control.error };
  }
  const fromRow = rowOf(from) || {};
  if (row.canSwitchTo === 'no') {
    const r = capabilityRefusalOf ? capabilityRefusalOf(to, 'switch') : null;
    return { ok: false, code: 'switch_refused', provider: to, error: (r && r.error) || `${to} cannot be switched to in place` };
  }
  if (fromRow.canSwitchTo === 'no') {
    const r = capabilityRefusalOf ? capabilityRefusalOf(from, 'switch') : null;
    return { ok: false, code: 'switch_refused', provider: to, error: `"${profile.label}" runs on ${from}, which cannot be switched away from in place: ${(r && r.error) || 'its state is not a directory we own'}` };
  }
  if (row.canSwitchTo === 'export-only' || fromRow.canSwitchTo === 'export-only') {
    const which = row.canSwitchTo === 'export-only' ? to : from;
    return { ok: false, code: 'switch_export_only', provider: to, error: `${which} keeps its browser state with the vendor — its directory is not ours to open, so there is no in-place switch. The explicitly LOSSY path is export / import into a NEW profile on ${to} (vibespace-browser new <label> --provider ${to}, then agent-browser --state / --restore): cookies, localStorage and an opt-in IndexedDB snapshot cross; sessionStorage and non-extractable CryptoKeys do not (WhatsApp Web's login is the known casualty)` };
  }
  const integrationId = integrationIdFor(to);
  let key = null;
  if (integrationId) {
    key = typeof resolveKey === 'function' ? resolveKey(integrationId) : null;
    if (!key || key.source === 'none') {
      return { ok: false, code: 'backend_no_key', provider: to, integrationId, error: `${to} needs a key and none is configured for ${integrationId}${key && key.why ? ' (' + key.why + ')' : ''} — open ⚙ → Integrations → ${integrationId} and paste yours, or use the cluster default there`, action: { openIntegration: integrationId, label: 'open Integrations' } };
    }
  }
  let ladder = null;
  if (row.ownsDir && fromRow.ownsDir && profile.dir) {
    const seatRec = integrationId && seats && seats[integrationId] ? seats[integrationId] : null;
    ladder = versionLadder({ target: cloakTargetName(to, seatRec ? seatRec.tier : null), targetMajor: chromiumMajorFor(to, { tier: seatRec ? seatRec.tier : null, majors }), recordedMajor: profile.lastChromiumMajor, dirMajor, confirmed });
    if (!ladder.ok) return { ok: false, code: ladder.code, provider: to, error: ladder.error, needsConfirm: !!ladder.needsConfirm, waysOut: ladder.waysOut || [], ladder };
  }
  let seatsV = null;
  if (integrationId) {
    const rec = seats && seats[integrationId] ? seats[integrationId] : {};
    const st = seatState({ tier: rec.tier, total: rec.total, at: rec.at, now });
    const running = runningOf(to) || [];
    seatsV = seatVerdict({ state: st, used: running.length, provider: to, source: key ? key.source : 'none', holders: running, integrationId });
    if (!seatsV.ok) return { ok: false, code: seatsV.code, provider: to, error: seatsV.error, action: seatsV.action, holders: seatsV.holders, seats: seatsV };
  }
  const sd = seedForSwitch({ profile, target: to, hex });
  const note = fingerprintNote({ from, to, hadSeed: Number.isInteger(profile.fingerprintSeed), seed: sd.seed });
  const mine = leases.filter((l) => byKey && l.browserKey === byKey);
  const others = leases.filter((l) => !(byKey && l.browserKey === byKey));
  const driving = leases.filter((l) => { const k = `${l.browserKey}|${l.profileId}`; const s = inputs && inputs[k]; return s && s.input === 'user'; });
  let mode = 'switch';
  let reason = null;
  if (driving.length) { mode = 'proposal'; reason = `somebody is driving this browser (${driving.map((l) => l.browserKey).join(', ')}) — a profile being driven is never interrupted by a proposal`; }
  else if (by && by.kind === 'agent') {
    if (others.length) { mode = 'proposal'; reason = `${others.length} other session(s) hold a lease on this profile (${others.map((l) => l.browserKey).join(', ')}) — a switch stops everybody's browser, so it goes to the owner as a proposal`; }
    else if (profile.owner && profile.owner.kind === 'session' && byKey && profile.owner.id !== byKey) { mode = 'proposal'; reason = 'this conversation does not own the profile'; }
  }
  return {
    ok: true, mode, reason, from, to, provider: to, integrationId, source: key ? key.source : null, clusterKey: key ? key.clusterKey || null : null,
    seed: sd.seed, seedMinted: sd.minted, fingerprint: note, fingerprintChange: fingerprintChange({ from, to }), ladder, seats: seatsV,
    affected: leases.map((l) => l.browserKey), mine: mine.map((l) => l.browserKey), others: others.map((l) => l.browserKey),
    reopen: leases.map((l) => ({ browserKey: l.browserKey, lastUrl: l.lastUrl || null })),
  };
}
/** The switcher's rows (§7.4 UX): every backend with its enabled/disabled
 *  verdict WRITTEN ON IT and, for a key-bearing row, the SOURCE chip from the
 *  MASKED view (`sources(id)` → {source, clusterKey, clusterLabel}) plus the
 *  one-click action. A disabled row names its reason; no row is hidden. */
function switcherRows({ profile, providerIds, rowOf, controlOf, capabilityRefusalOf = null, sources = () => null, seats = {}, majors = {}, dirMajor = null, now = 0, runningOf = () => [] } = {}) {
  return (providerIds || []).map((id) => {
    const row = rowOf(id) || {};
    const integrationId = integrationIdFor(id);
    const src = integrationId ? (sources(integrationId) || { source: 'none' }) : null;
    const v = switchVerdict({ profile, target: id, rowOf, controlOf, capabilityRefusalOf, resolveKey: () => src, seats, majors, dirMajor, now, runningOf, by: { kind: 'user' } });
    const current = String(profile.provider || 'chromium') === id;
    const sourceLabel = !integrationId ? null : (src && src.source === 'user' ? 'your own key' : src && src.source === 'cluster' ? `cluster default${src.clusterLabel ? ' · ' + src.clusterLabel : ''} (seats shared with other users)` : 'not configured');
    const seatRec = integrationId && seats && seats[integrationId] ? seats[integrationId] : null;
    return {
      id, label: row.label || id, tier: row.tier || null, current,
      enabled: v.ok, code: v.ok ? null : v.code, reason: v.ok ? null : v.error, needsConfirm: !!v.needsConfirm,
      integrationId, source: src ? src.source : null, sourceLabel, action: v.ok ? null : (v.action || (integrationId && src && src.source === 'none' ? { openIntegration: integrationId, label: 'open Integrations' } : null)),
      seats: integrationId ? seatState({ tier: seatRec ? seatRec.tier : null, total: seatRec ? seatRec.total : null, at: seatRec ? seatRec.at : 0, now }) : null,
      fingerprint: v.ok ? v.fingerprint : null, fingerprintChange: v.ok ? v.fingerprintChange : null, chip: backendChip({ provider: id, major: chromiumMajorFor(id, { tier: seatRec ? seatRec.tier : null, majors }), tier: seatRec ? seatRec.tier : null }),
    };
  });
}

// ─── §7.4 failure form (1): INSTALLING cloakbrowser is a USER act that comes AFTER the measurement ───
/** The npm package the §7.2.1 proof record describes. The install PINS the
 *  version that record names ("version pinning is part of this control": an
 *  unpinned download silently invalidates the measurement). */
const CLOAK_PACKAGE = 'cloakbrowser';
/**
 * THE INSTALL VERDICT — "measure first, then install", as a decision:
 *   · `install_local_only`          a paired machine's provider binary is its own to install (the key rule's twin, D34);
 *   · `already_installed`           the executable rung answered — nothing to do, the path is named;
 *   · `install_running`             one install at a time (the ORCH half's single flight);
 *   · `install_precondition_unmet`  the §7.2.1 record is NOT a measurement (it names its own refusal — today
 *                                   `binary_absent`), or fails the local-oracles discipline, or names no version;
 *   · ok                            `{spec: 'cloakbrowser@<the measured version>', version, package}`.
 * Nothing here downloads, spawns or reads a file: `proof` is the record, `proofOk` the discipline's verdict over
 * it (browser-profiles' proofVerdict, passed in so this module stays import-free), `exe` the executable rung's
 * answer. The CONTROL the design names — an install that skips the measurement — is a verdict answering ok for a
 * refused record; test-browser-backend drives that shape and it must be red.
 */
function installVerdict({ proof = null, proofOk = null, exe = null, host = null, running = false } = {}) {
  if (host) return { ok: false, code: 'install_local_only', error: `cloakbrowser is installed on this machine only — host ${JSON.stringify(String(host))} refused (a paired machine's provider binary is its own to install)` };
  if (exe && exe.ok) return { ok: false, code: 'already_installed', error: `cloakbrowser is already installed at ${exe.path}`, path: exe.path };
  if (running) return { ok: false, code: 'install_running', error: 'a cloakbrowser install is already running — wait for it to finish' };
  const rec = proof && typeof proof === 'object' ? { status: proof.status || null, refusal: proof.refusal || null, date: proof.date || null, version: proof.version || null } : null;
  if (!rec) return { ok: false, code: 'install_precondition_unmet', error: 'no §7.2.1 egress proof record — nothing may be installed before the measurement (scripts/measure-cloak-egress.mjs)', proof: null };
  if (rec.status !== 'measured') return { ok: false, code: 'install_precondition_unmet', error: `the §7.2.1 egress measurement has not been taken (the record says ${rec.refusal || rec.status || 'unknown'}${rec.date ? ', dated ' + rec.date : ''}) — measure first with scripts/measure-cloak-egress.mjs and paste its record into src/browser-profiles.js, then install; nothing is downloaded before then`, proof: rec };
  if (proofOk && proofOk.ok === false) return { ok: false, code: 'install_precondition_unmet', error: `the §7.2.1 proof record fails its own discipline: ${proofOk.error || 'invalid'} — a record that cannot be trusted permits nothing`, proof: rec };
  if (!rec.version) return { ok: false, code: 'install_precondition_unmet', error: 'a measured record names the version it describes — the install pins that version, and this record names none', proof: rec };
  return { ok: true, spec: `${CLOAK_PACKAGE}@${String(rec.version)}`, version: String(rec.version), package: CLOAK_PACKAGE, proof: rec };
}
/** The one npm argv the install runs: into a prefix of OUR choosing (never
 *  `-g`, never the checkout), pinned, no audit/fund chatter, no package.json
 *  edits. The package's own scripts run as they would for anyone. */
function installArgv({ spec, prefix }) {
  if (!spec || !/^[a-z0-9@._/-]+$/i.test(String(spec))) throw new Error(`installArgv: bad spec ${JSON.stringify(spec)}`);
  if (!prefix) throw new Error('installArgv: prefix required');
  return ['install', '--prefix', String(prefix), '--no-audit', '--no-fund', '--no-save', String(spec)];
}
/** The executable an installed package exposes, read from ITS OWN
 *  package.json `bin` (a string, or an object whose `cloakbrowser` entry
 *  wins, else its first entry) — never a guessed file name (§12.35: the bin
 *  name is unverified until the package is on a machine). Returns a path
 *  RELATIVE to the package dir, or null. */
function binFromPackageJson(pkg, prefer = CLOAK_PACKAGE) {
  if (!pkg || typeof pkg !== 'object') return null;
  const b = pkg.bin;
  if (typeof b === 'string' && b.trim()) return b.trim();
  if (b && typeof b === 'object') {
    if (typeof b[prefer] === 'string' && b[prefer].trim()) return b[prefer].trim();
    for (const v of Object.values(b)) if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

module.exports = {
  CLOAK_PACKAGE, INSTALL_CODES, installVerdict, installArgv, binFromPackageJson,
  SEAT_TIER_STALE_MS, CLOAK_TIERS, CLOAK_PRO_TOTALS,
  KEY_ROWS, KEY_IDS, VENDOR_ENV_NAMES, integrationIdFor, vendorEnvFor, launchArgsFor, providerNeedsSeed, mintSeed, seedForSwitch,
  majorOf, parseLastVersion, majorOfBrowserString, chromiumMajorFor, cloakTargetName, versionLadder, fingerprintNote, fingerprintChange,
  seatState, ageText, seatVerdict, SEAT_TAKEN_RE, classifyLaunchFailure, tierFromLaunch,
  testHostFor, hostOfUrl, testRequestFor,
  HINT_BY, TIERS, normalizeHost, siteHintVerdict, siteHintFor, blockedClaim, blockedText, navHint,
  backendChip, restartingRefusal, SWITCH_CODES, switchVerdict, switcherRows,
};

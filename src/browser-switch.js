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
 *   · SEATS ARE THREE STATES, NOT A NUMBER (round 8 #2): the total comes from
 *     the FIRST REAL LAUNCH, never from Test and never from a poll; a reading older than SEAT_TIER_STALE_MS degrades to
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

// ── §7.4 seats: the staleness horizon ────
/** A claim that REFUSES something must carry a date: the shape this repo
 *  already runs for overage (`OVERAGE_STALE_MS`, src/spend-authorizer.js). */
const SEAT_TIER_STALE_MS = 7 * 24 * 3600 * 1000;
// lane dc-browser-backends (F4): the backends are rows declared in their own files (src/browser-backends/<id>.js, one
// line each in its index.js) — a backend's key row lives there
const { BROWSER_BACKENDS } = require('./browser-backends/index.js');

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
 * browserless / kernel, the region-derived host for agentcore, and NONE for a
 * shape-only row (zero network). A host that cannot be derived is a named
 * refusal, never "let us try the default".
 */
const KEY_ROWS = Object.freeze({
  // lane dc-browser-backends (F4): a backend's key row is DECLARED in its file (`keyRow`) — derived here, in list order
  ...Object.fromEntries(BROWSER_BACKENDS.filter((b) => b.keyRow).map((b) => [b.id, Object.freeze({ env: b.keyRow.env, host: b.keyRow.host, provider: b.id, ...(b.keyRow.keyRequired === false ? { keyRequired: false } : {}) })])),
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

/** Does this key row REFUSE to run without a key? (a row declaring `keyRequired: false` — measured: no; everything else: yes) */
function keyRequiredFor(integrationId) { const r = KEY_ROWS[String(integrationId || '')]; return !!r && r.keyRequired !== false; }
/** lane dc-browser-providers: THE PROVIDERS row of a NAMED provider (src/browser-profiles.js — the launch shape lives
 *  there, never an id here); null for an absent or unknown one (no launch shape, no key, no seed). */
function rowOf(provider) {
  const p = String(provider == null ? '' : provider);
  return p ? require('./browser-profiles.js').providerRow(p) : null;
}
/** The integration-registry row a provider's key lives in (the row's `integrationId`, when that registry row exists);
 *  null = needs none. `rowOfFn` = the row table the caller judges by (the gate's injectable `rowOf` — one gate ignoring the
 *  override would be an inconsistent seam; lane engine-spi-egress L3: the switch dialog's worlds are driven over it). */
function integrationIdFor(provider, rowOfFn = rowOf) {
  const id = ((typeof rowOfFn === 'function' ? rowOfFn(provider) : null) || {}).integrationId;
  return id && KEY_ROWS[id] ? id : null;
}
/** The child's env pairs for a provider, from RESOLVED values — only the
 *  fields that carry a value, under the vendor's own names. `{}` for a
 *  provider that needs no key. Never logged by any caller. */
function vendorEnvFor(provider, values, rowOfFn = rowOf) {
  const id = integrationIdFor(provider, rowOfFn);
  const out = {};
  if (!id) return out;
  for (const [field, name] of Object.entries(KEY_ROWS[id].env)) {
    const v = values && values[field];
    if (v !== undefined && v !== null && String(v).length) out[name] = String(v);
  }
  return out;
}
/** The argv PREFIX the keeper puts before `open` for a provider: cloud = upstream's own `-p <provider>`. The KEY never
 *  rides argv. */
function launchArgsFor(provider) {
  const p = String(provider == null ? '' : provider);
  const m = /^cloud:([a-z0-9-]+)$/.exec(p);
  if (m) return ['-p', m[1]];
  return [];
}
/** THE LAUNCH ENVIRONMENT of a profile pinned to one Chrome build (a `buildChoice` row — lane browser-admin 2a): the
 *  build's executable rides agent-browser's own env name (`AGENT_BROWSER_EXECUTABLE_PATH`), alone — the CLI's own default
 *  arguments (a Chrome for Testing build carries its own sandbox helper), the path only. No secret here. (lane
 *  engine-spi-egress L3: the other-binary road with its seed and proxy left with the anti-bot backend — an engine's
 *  launch is src/browser-engines.js engineLaunchEnv.) */
function launchEnvFor(provider, { executablePath = '' } = {}) {
  const row = rowOf(provider);
  if (row && !row.launchArgs && row.buildChoice) return executablePath ? { AGENT_BROWSER_EXECUTABLE_PATH: String(executablePath) } : {};
  return {};
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
/** Which major the TARGET backend would write: the last one its launch was seen writing. null = unknown, and unknown is
 *  never "old enough" (the floor rule this repo already runs). */
function chromiumMajorFor(provider, { majors = {} } = {}) {
  const p = String(provider || '');
  return majors && majors[p] && Number.isInteger(majors[p].major) ? majors[p].major : null;
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
        'clone the profile through export / import — the user\'s act, not an agent verb (`vibespace-browser` refuses `--state` / `--restore`): cookies, localStorage and an opt-in IndexedDB snapshot cross; sessionStorage and non-extractable CryptoKeys do NOT — an app that keeps its local decryption keys as non-extractable CryptoKeys (WhatsApp Web is the known case) does not bring its login across',
      ],
    };
  }
  return { ok: true, why: tgt === wrote ? `same Chromium major (${tgt})` : `Chromium ${tgt} ≥ ${wrote}, the major that last wrote this directory`, recordMajor: tgt, wrote, disagreement };
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
  const t = Number.isInteger(total) && total > 0 ? total : null;
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
function seatVerdict({ state, used = 0, provider = 'the backend', source = 'none', holders = [], integrationId = null } = {}) {
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
// ── §7.5 the derived test host + the one request a runner may make ────────
/** The ONE host a Test runner may reach — derived per row (§7.5's rule), a
 *  named refusal when it cannot be derived. `{ok:true, host:null}` = zero
 *  network (a shape-only row). */
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
    if (!/^[a-z]{2}-[a-z]+-\d$/.test(region)) return { ok: false, code: 'host_underivable', error: `${rowId}: its host is derived from the region field, e.g. us-east-1, which is ${region ? 'not a region id: ' + region.slice(0, 40) : 'empty'}` };
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
/**
 * THE SIGN-IN REFUSAL PAGES (lane browser-propose step 2, userW's fleet pod 2026-09-30): a vendor's own page saying it
 * refuses to sign in THIS browser. A row matches a navigate result's FINAL url + title: the exact host, then the path
 * marker OR one of the page's own titles (in the languages it was seen in). A HINT, never a detection (§7.6 rule 5): the
 * agent reads it and files its claim (`blocked`); nothing escalates by itself. Keep the table SMALL, every row dated and
 * named by its source; a page that merely failed a sign-in ("We couldn't sign you in" on Microsoft's login host) is not a
 * refusal of the browser and is deliberately absent.
 */
const SIGNIN_REFUSAL_ROWS = Object.freeze([
  Object.freeze({
    id: 'google-rejected', vendor: 'Google', host: 'accounts.google.com', date: '2026-09-30',
    source: 'userW\'s fleet pod (a fresh sign-in in a headless agent browser); the refusal page\'s URL shapes and its title as users report it',
    paths: Object.freeze([/\/signin\/rejected\b/i, /deniedsigninrejected/i]),
    titles: Object.freeze(['This browser or app may not be secure', '此浏览器或应用可能不安全', 'このブラウザまたはアプリは安全でない可能性があります']),
  }),
]);
const normTitle = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().toLowerCase();
/** The row a navigate result's final url + title match, or null. PURE, bounded (a url / title past 4 KiB is cut first). */
function signinRefusalOf({ url = '', title = '' } = {}) {
  const u = String(url || '').slice(0, 4096);
  const host = normalizeHost(u);
  if (!host) return null;
  let pathPart = '';
  try { const x = new URL(/^[a-z][a-z0-9+.-]*:/i.test(u) ? u : 'https://' + u); pathPart = x.pathname + x.search; } catch { pathPart = ''; }
  const t = normTitle(String(title || '').slice(0, 4096));
  for (const row of SIGNIN_REFUSAL_ROWS) {
    if (host !== row.host) continue;
    if (row.paths.some((re) => re.test(pathPart)) || (t && row.titles.some((x) => t.includes(normTitle(x))))) return row;
  }
  return null;
}
/**
 * The HINT a navigation carries on the CLI's output (§7.6 rule 5): typed `{tier, why, hint, source, text}`, worded so it
 * cannot be mistaken for a detection. Two rungs: a real 403/429 (`navHint(403)` — the status the CLI read), and a known
 * vendor's SIGN-IN REFUSAL page (`navHint({url, title})` — the navigate result's final url + title, SIGNIN_REFUSAL_ROWS).
 */
function navHint(status) {
  if (status && typeof status === 'object') {
    const s0 = Number(status.status);
    if (s0 === 403 || s0 === 429) return navHint(s0);
    const row = signinRefusalOf(status);
    if (!row) return null;
    return { tier: 2, why: 'sign-in-refused', hint: 'may-need-anti-bot', source: 'sign-in-page', vendor: row.vendor, row: row.id, host: row.host,
      text: `${row.vendor}'s sign-in page says this browser may not be secure — a hint from the page, not a detection: do not work around it; record it (vibespace-browser blocked --url <the sign-in page> --why sign-in-refused --tier 2) — the user is told (this version offers no one-click switch)` };
  }
  const s = Number(status);
  if (s !== 403 && s !== 429) return null;
  return { tier: 2, why: `HTTP ${s}`, hint: 'may-need-anti-bot', source: 'http-status', text: `HTTP ${s} — a hint from the status code, not a detection: the page may need a tier-2 backend (vibespace-browser blocked --url <u> --why http-${s} records your claim)` };
}

// ── lane browser-propose step 3: A REFUSAL THE AGENT MEETS BECOMES ONE PROPOSAL WITH ONE APPROVE ────────────
// The owner's ruling (2026-09-30): "the agent PROPOSES the switch, the user APPROVES with one click" — D31 stands:
// nothing switches by itself; the claim (`blocked --tier 2`) files ONE proposal whose FROZEN fields are exactly what its
// card shows and exactly what Approve runs (by id + the digest of those fields — never re-derived from text). Every
// decision is here; the ORCH half (src/server/browser-propose.js) only acts on it.
const i18nKey = (s) => s; // extraction marker (scripts/i18n-extract.mjs) — the client words it through t()
const PROPOSAL_STATES = Object.freeze(['open', 'approved', 'rejected', 'done', 'failed', 'unavailable']);
// lane engine-spi-egress L3 (主开发's D1): the plan kinds that switched a conversation's browser to the anti-bot BACKEND —
// install it, add the site to its list, switch in place, open a new profile on it — left the core with that backend. A
// tier-2 claim still files ONE proposal (its card, its For-you row, the agent's `blocked` verb, the 409 on an Approve):
// its plan is `none`, saying why. L4 brings plan kinds over an ENGINE (design-desk q-056 §3).
const PROPOSAL_PLANS = Object.freeze(['none']);
/**
 * THE PLAN a proposal freezes, FIRST MATCH WINS (every answer is `none` in this version — the why is on the card):
 *   1 the conversation runs on another machine     ⇒ remote
 *   2 its browser is a profile on a paired machine   ⇒ other-machine
 *   3 anything else                                  ⇒ unavailable (this version cannot switch a browser for the agent)
 * `target` = `{kind:'ephemeral'}` | `{kind:'profile', id, label, host, …}`.
 */
function proposalPlan({ remote = false, target = null } = {}) {
  const t = target || { kind: 'ephemeral' };
  if (remote) return { kind: 'none', why: 'remote' };
  if (t.kind === 'profile' && t.host) return { kind: 'none', why: 'other-machine', profileLabel: String(t.label || '').slice(0, 120) };
  return { kind: 'none', why: 'unavailable' };
}
/** FNV-1a 32 over the FROZEN fields — the one digest the card shows and the Approve route checks (PURE, no crypto). */
function proposalDigest(p) {
  if (p && p.kind === 'site-reset') return siteResetDigest(p); // lane site-reset: its own frozen fields
  const x = p || {};
  const pl = x.plan || {};
  const s = JSON.stringify([x.id, x.backend, x.site, x.url, x.install, pl.kind, pl.why || null, pl.profileId || null, pl.label || null, !!pl.confirm, Array.isArray(x.alsoSites) ? x.alsoSites.join(',') : '']);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return 'pd-' + h.toString(16).padStart(8, '0');
}
/** THE PROPOSAL RECORD a claim files — every field frozen at the claim; `state` is `unavailable` from birth when the
 *  plan offers nothing (a sentence, no Approve). */
/** The page a proposal SHOWS and REOPENS — the agent's URL parsed, so what the card prints is ASCII (a character that is
 *  not drawn or reorders a line is percent-encoded, never drawn) and is exactly what opens; '' when it does not parse
 *  (the proposal then reopens the site's root). */
function proposalUrlOf(u) {
  const s = String(u == null ? '' : u).trim();
  try { return new URL(/^[a-z][a-z0-9+.-]*:/i.test(s) ? s : 'https://' + s).href.slice(0, 2000); } catch { return ''; }
}
function proposalFor({ claim, plan, at = 0 } = {}) {
  const c = claim || {};
  const p = {
    id: String(c.id || ''), backend: null, site: String(c.host || ''), url: proposalUrlOf(c.url) || proposalUrlOf(c.host),
    plan: { ...(plan || { kind: 'none', why: 'unavailable' }) },
    state: plan && PROPOSAL_PLANS.includes(plan.kind) && plan.kind !== 'none' ? 'open' : 'unavailable', by: 'agent', at: Number(at) || 0,
    decided: null, outcome: null, progress: null, told: false,
  };
  p.digest = proposalDigest(p);
  return p;
}
/** A second claim on the same (conversation, host): `same` card while one is open / running / failed / unavailable;
 *  `rejected` = the user rejected it and the agent has not been told yet (it is told now); `new` otherwise (open again
 *  after a told rejection or a finished switch). Only a tier-2 claim files a proposal (`claim-only`). */
function claimVerdict({ existing = null, tier = 2 } = {}) {
  if (Number(tier) !== 2) return 'claim-only';
  const p = existing && existing.proposal;
  if (!p) return 'new';
  // verify r1 V2: a run refused because the world no longer matches the card (`proposal_stale`) is not the card to keep —
  // the next claim makes a new one that says how things stand
  if (p.state === 'failed' && p.outcome && p.outcome.code === 'proposal_stale') return 'new';
  if (['open', 'approved', 'failed', 'unavailable'].includes(p.state)) return 'same';
  if (p.state === 'rejected' && !p.told) return 'rejected';
  return 'new';
}
/**
 * THE TRANSITIONS — every move names its actor; anything else is a typed refusal:
 *   approve   open | failed  → approved   by the USER only (agent_forbidden), `shown` === the digest (proposal_changed)
 *   reject    open | failed  → rejected   by the USER only
 *   progress  approved       → approved   (the runner's step / percent)
 *   done      approved       → done       (the runner's outcome)
 *   fail      approved       → failed     (the step + the error, by name; Approve again runs the same frozen fields)
 *   told      rejected       → rejected   (`told: true` — the agent heard the rejection once)
 */
function proposalStep(p, { event, by = null, at = 0, shown = null, outcome = null, progress = null } = {}) {
  if (!p) return { ok: false, code: 'not-found', error: 'no such proposal' };
  const refuse = (code, error) => ({ ok: false, code, error });
  const human = event === 'approve' || event === 'reject';
  if (human && by !== 'user') return refuse('agent_forbidden', 'approving or rejecting a proposal is the user\'s act — an agent cannot decide its own proposal');
  if (event === 'approve') {
    if (p.state === 'unavailable') return refuse('proposal_unavailable', 'this proposal offers nothing to approve on this machine');
    if (!['open', 'failed'].includes(p.state)) return refuse('proposal_state', `this proposal is ${p.state} — there is nothing to approve`);
    if (shown !== p.digest) return refuse('proposal_changed', 'the card you pressed is not this proposal as it stands — nothing ran; read it again');
    return { ok: true, next: { ...p, state: 'approved', decided: { action: 'approve', by: 'user', at: Number(at) || 0 }, outcome: null, progress: { step: 'starting', percent: null } } };
  }
  if (event === 'reject') {
    if (!['open', 'failed'].includes(p.state)) return refuse('proposal_state', `this proposal is ${p.state} — there is nothing to reject`);
    return { ok: true, next: { ...p, state: 'rejected', decided: { action: 'reject', by: 'user', at: Number(at) || 0 }, progress: null, told: false } };
  }
  if (event === 'progress') {
    if (p.state !== 'approved') return refuse('proposal_state', `progress on a ${p.state} proposal`);
    const pr = progress || {};
    // verify r1 V3: `stalledSec` = how long the download has shown no progress at all (the card says so — a frozen percent
    // for 15 minutes looked like progress); absent while it moves
    const stalled = Number.isFinite(pr.stalledSec) && pr.stalledSec >= 0 ? Math.min(24 * 3600, Math.round(pr.stalledSec)) : null;
    return { ok: true, next: { ...p, progress: { step: String(pr.step || 'starting').slice(0, 40), percent: Number.isFinite(pr.percent) ? Math.max(0, Math.min(100, Math.round(pr.percent))) : null, ...(stalled !== null ? { stalledSec: stalled } : {}) } } };
  }
  if (event === 'done' || event === 'fail') {
    if (p.state !== 'approved') return refuse('proposal_state', `${event} on a ${p.state} proposal`);
    return { ok: true, next: { ...p, state: event === 'done' ? 'done' : 'failed', progress: null, outcome: { ...(outcome || {}), at: Number(at) || 0 } } };
  }
  if (event === 'told') {
    if (p.state !== 'rejected') return refuse('proposal_state', `told on a ${p.state} proposal`);
    return { ok: true, next: { ...p, told: true } };
  }
  return refuse('bad-request', `unknown proposal event ${JSON.stringify(event)}`);
}
/**
 * THE CLAIM STORE'S BOUND (verify r1): the keeper keeps the newest 50 claim entries — and a proposal RIDES its claim
 * entry, so a plain `slice(-50)` let any conversation's 50 cheap claims evict another conversation's OPEN proposal
 * (its For-you Approve then answered 404, its card vanished at the next rebuild — silently). A full store drops the
 * entries nobody waits on FIRST: a claim with no proposal (rank 0), a decided proposal (done / unavailable / a
 * rejection already told — 1), a failed one (2); an undecided one (open / a rejection not yet told — 3) and a running
 * one (approved — 4) only when nothing else is left — oldest first within a rank. `{keep, dropped}`, `list`'s order kept.
 */
const BLOCKED_KEEP_MAX = 50;
function blockedRank(e) {
  const p = e && e.proposal;
  if (!p) return 0;
  if (p.state === 'done' || p.state === 'unavailable' || (p.state === 'rejected' && p.told)) return 1;
  if (p.state === 'failed') return 2;
  return p.state === 'approved' ? 4 : 3;
}
function blockedKeep(list, max = BLOCKED_KEEP_MAX) {
  const arr = Array.isArray(list) ? list : [];
  if (arr.length <= max) return { keep: arr.slice(), dropped: [] };
  const order = arr.map((e, i) => ({ i, r: blockedRank(e) })).sort((a, b) => a.r - b.r || a.i - b.i);
  const drop = new Set(order.slice(0, arr.length - max).map((x) => x.i));
  return { keep: arr.filter((_, i) => !drop.has(i)), dropped: arr.filter((_, i) => drop.has(i)) };
}
/** The one sentence the agent's CLI prints once, at its next navigation to a host whose proposal the user REJECTED. */
function rejectionText(p) {
  if (p && p.kind === 'site-reset') return `the user rejected clearing ${p.site}'s stored login in the profile "${p.profileLabel || p.profileId}" — do not clear it another way (no other browser, no copied session); tell the user which site's login looks stale and carry on with what you can`;
  return `the user rejected your proposal for ${p && p.site} — do not work around the refusal (no other browser, no copied session); tell the user which page needs them and carry on with what you can`;
}
/** verify r1 V1: the sites a wrapped browser's site list REFUSED while the agent's verb ran (its own browser's proxy, by
 *  name) — the one sentence its CLI prints, so it can tell the user exactly which site the page needs. `engine` ({id,
 *  label}) = the ENGINE the keeper wraps — its own site list (the plugin's settings row) is named. */
function egressRefusedText(hosts, engine = null) {
  const hs = [...new Set((Array.isArray(hosts) ? hosts : []).map((h) => normalizeHost(h)).filter(Boolean))].slice(0, 8);
  if (!hs.length) return '';
  if (engine && engine.id) { const name = String(engine.label || engine.id).replace(/[\0-\x1f\x7f]/g, ' ').slice(0, 80); return `${name}'s site list refused ${hs.join(', ')} while this page loaded — parts of it may be missing. Do not work around it (no other browser, no copied session): tell the user which site the page needs; they add it to that list in ⚙ → Plugins → ${name} → its settings`; }
  return `this browser's site list refused ${hs.join(', ')} while this page loaded — parts of it may be missing. Do not work around it (no other browser, no copied session): tell the user which site the page needs`;
}
/** The words the agent is told when an approved proposal is DONE — through the handback's ladder site (a free next-turn
 *  stash, or the running turn where joining it is free). */
function approvedText(p) {
  if (p && p.kind === 'site-reset') { const o = p.outcome || {}; return `Approved: ${p.site}'s stored login was cleared in the profile "${p.profileLabel || p.profileId}" (${Number(o.cookies) || 0} cookie${Number(o.cookies) === 1 ? '' : 's'}, and the stored data of its pages). Open ${p.url || p.site} again — re-read the page first; signing in is the user's.`; }
  return `Approved: ${p && p.site} — re-open ${(p && p.url) || (p && p.site)} and re-read the page first.`;
}
/** THE CARD's block — the proposal as the chat card and the For-you row draw it: structure only (ids, codes, counts,
 *  bounded strings), never markup. `claim` = the entry the proposal rides (why / evidence / tier / host). */
function proposalCardBlock(entry) {
  if (entry && entry.proposal && entry.proposal.kind === 'site-reset') return siteResetCardBlock(entry); // lane site-reset
  const e = entry || {};
  const p = e.proposal;
  if (!p || !/^bl-[0-9a-f]{8}$/.test(String(e.id || '')) || !PROPOSAL_STATES.includes(p.state)) return null;
  const s = (v, n) => (v == null ? '' : String(v).slice(0, n));
  const pl = p.plan || {};
  return {
    type: 'browser_proposal', id: e.id, at: Number(e.at) || 0, browserKey: e.browserKey || null,
    host: s(e.host, 253), url: s(p.url || e.url, 2000), why: s(e.why, 64), evidence: s(e.evidence, 400), tier: Number(e.tier) || 2,
    site: s(p.site, 253),
    plan: { kind: PROPOSAL_PLANS.includes(pl.kind) ? pl.kind : 'none', why: s(pl.why, 40) || null, profileLabel: s(pl.profileLabel, 120) || null },
    state: p.state, decided: p.decided ? { action: p.decided.action, at: Number(p.decided.at) || 0 } : null,
    progress: p.progress ? { step: s(p.progress.step, 40), percent: Number.isFinite(p.progress.percent) ? p.progress.percent : null, stalledSec: Number.isFinite(p.progress.stalledSec) ? p.progress.stalledSec : null } : null,
    outcome: p.outcome ? { code: s(p.outcome.code, 40) || null, step: s(p.outcome.step, 40) || null, error: s(p.outcome.error, 400) || null, label: s(p.outcome.label, 120) || null, told: s(p.outcome.told, 20) || null, at: Number(p.outcome.at) || 0 } : null,
    told: !!p.told, digest: String(p.digest || ''),
  };
}
/** A `{key, params}` line in English (the For-you item's `detail` beside its structure; the agent never reads it). */
function lineText(l) { return String(l.key).replace(/\{(\w+)\}/g, (m, k) => (l.params && l.params[k] != null ? String(l.params[k]) : m)); }
/** lane engine-spi-egress L3 (主开发's D5): why no switch is offered — a sentence TRUE with or without a browser plugin installed
 *  (this version targets no engine yet; the user's own door is Change build…). */
const NO_SWITCH_WORDS = Object.freeze({
  unavailable: i18nKey('No switch can be offered: this version of VibeSpace cannot switch a browser for the agent yet. If a site refuses this browser, install a browser plugin (⚙ → Plugins → Install plugin…) and choose it for this profile with Change build….'),
});
/**
 * THE WORDS of a proposal, as STRUCTURE (`{key, params}` lines the client says through its own t() — the chat card and
 * the For-you row alike): `claim` (who says what), `plan` (what Approve runs, in order — none in this version), `none`
 * (why nothing is offered). From the CARD BLOCK only — the frozen fields.
 */
function proposalLines(b) {
  if (b && b.kind === 'site-reset') return siteResetLines(b); // lane site-reset
  const x = b || {};
  const pl = x.plan || {};
  const host = x.host || x.site;
  const status = /^http-(\d{3})$/i.exec(String(x.why || ''));
  const claim = x.why === 'sign-in-refused' ? { key: i18nKey('The agent says {host} refused to sign in this browser (the page says it may not be secure).'), params: { host } }
    : x.why === 'egress-refused' ? { key: i18nKey('The agent says its page needs {host}, which its browser\'s site list refused.'), params: { host } }
    : status ? { key: i18nKey('The agent says {host} answered HTTP {status}.'), params: { host, status: status[1] } }
      : x.why ? { key: i18nKey('The agent says {host} blocked it ({why}).'), params: { host, why: x.why } }
        : { key: i18nKey('The agent says {host} blocked it.'), params: { host } };
  const why = pl.why === 'remote' ? { key: i18nKey('No switch can be offered: this conversation runs on another machine, and its browser is that machine\'s.') }
    : pl.why === 'other-machine' ? { key: i18nKey('No switch can be offered: this conversation\'s browser "{profile}" runs on a paired machine.'), params: { profile: pl.profileLabel || '' } }
      : { key: NO_SWITCH_WORDS.unavailable };
  return { claim, plan: [], none: why };
}
/** The For-you item a proposal files: English words (the dedupe key and the agent CLI's contract) + the same as
 *  STRUCTURE the client words with its own t() — the claim and why nothing is offered. A NOTICE (nothing to decide). */
function proposalInboxItem(entry) {
  if (entry && entry.proposal && entry.proposal.kind === 'site-reset') return siteResetInboxItem(entry); // lane site-reset
  const p = entry && entry.proposal;
  const b = proposalCardBlock(entry);
  if (!p || !b) return null;
  const L = proposalLines(b);
  const lines = [L.claim, L.none].filter(Boolean).slice(0, 12);
  const strip = (l) => ({ key: l.key, ...(l.params ? { params: Object.fromEntries(Object.entries(l.params).map(([k, v]) => [k, typeof v === 'number' ? v : String(v)])) } : {}) });
  return {
    text: `The agent says ${p.site} refused its browser — no switch can be offered here`, kind: 'notice', urgency: 'normal', origin: 'browser',
    detail: lines.map(lineText).join('\n'),
    i18n: {
      text: { key: i18nKey('The agent says {site} refused its browser — no switch can be offered here'), params: { site: p.site } },
      detail: lines.map(strip),
      source: { key: i18nKey('Agent browser') },
    },
  };
}

// ── lane site-reset step 3 (2026-09-30): CLEARING ONE SITE'S STORED LOGIN ON A SHARED PROFILE IS A PROPOSAL ──────────
// The agent's `site-reset <host>` on a named profile other conversations (or the user's own browsing) use is never run by
// the agent: it files ONE proposal of this SAME shape — `kind: 'site-reset'`, id `sr-…` — shown by the same card, the same
// For-you item and answered by the same routes (`/api/browser/proposals/:id/approve|reject`); every transition is
// `proposalStep`'s. What Approve runs is EXACTLY the frozen (profile, host): the cookies that reach the host and the
// stored data of its origins, in that profile's browser — nothing else. The digest covers every word the card prints.
const PROPOSAL_ID_RE = /^(?:bl|sr)-[0-9a-f]{8}$/;
const SITE_RESET_ID_RE = /^sr-[0-9a-f]{8}$/;
function siteResetDigest(p) {
  const x = p || {};
  const s = JSON.stringify(['site-reset', x.id, x.site, x.url, x.profileId, x.profileLabel, Number(x.holders) || 0, !!x.human]);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return 'pd-' + h.toString(16).padStart(8, '0');
}
/** THE RECORD a site-reset proposal files: every field frozen at the ask (`holders` = the conversations using the profile
 *  now, the asker included; `human` = the user browses in it now). */
function siteResetProposalFor({ id, host, url = '', profileId, profileLabel = '', holders = 1, human = false, at = 0 } = {}) {
  const h = normalizeHost(host) || '';
  const p = {
    kind: 'site-reset', id: String(id || ''), site: h, url: proposalUrlOf(url) || (h ? `https://${h}/` : ''),
    profileId: String(profileId || ''), profileLabel: String(profileLabel || '').replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 120),
    holders: Math.max(1, Number(holders) || 1), human: !!human,
    state: 'open', by: 'agent', at: Number(at) || 0, decided: null, outcome: null, progress: null, told: false,
  };
  p.digest = siteResetDigest(p);
  return p;
}
/** A second ask on the same (conversation, profile, host): the SAME card while one stands; a rejection the agent was not
 *  told yet is told now; a told rejection, a finished run or a stale one opens a new card. */
function siteResetClaimVerdict({ existing = null } = {}) {
  const p = existing && existing.proposal;
  if (!p) return 'new';
  if (p.state === 'failed' && p.outcome && p.outcome.code === 'proposal_stale') return 'new';
  if (['open', 'approved', 'failed'].includes(p.state)) return 'same';
  if (p.state === 'rejected' && !p.told) return 'rejected';
  return 'new';
}
function siteResetCardBlock(entry) {
  const e = entry || {};
  const p = e.proposal;
  if (!p || !SITE_RESET_ID_RE.test(String(e.id || '')) || !PROPOSAL_STATES.includes(p.state)) return null;
  const s = (v, n) => (v == null ? '' : String(v).slice(0, n));
  return {
    type: 'browser_proposal', kind: 'site-reset', id: e.id, at: Number(e.at) || 0, browserKey: e.browserKey || null,
    host: s(p.site, 253), site: s(p.site, 253), url: s(p.url, 2000), profileId: s(p.profileId, 40), profileLabel: s(p.profileLabel, 120),
    holders: Math.max(1, Number(p.holders) || 1), human: !!p.human, plan: { kind: 'site-reset' },
    state: p.state, decided: p.decided ? { action: p.decided.action, at: Number(p.decided.at) || 0 } : null,
    progress: p.progress ? { step: s(p.progress.step, 40), percent: null, stalledSec: null } : null,
    outcome: p.outcome ? { code: s(p.outcome.code, 40) || null, step: s(p.outcome.step, 40) || null, error: s(p.outcome.error, 400) || null, cookies: Math.max(0, Number(p.outcome.cookies) || 0), told: s(p.outcome.told, 20) || null, at: Number(p.outcome.at) || 0 } : null,
    told: !!p.told, digest: String(p.digest || ''),
  };
}
/** THE WORDS (the owner's sentence, line for line): what the agent proposes, who is signed out, that nothing else is
 *  touched, what exactly is cleared, when the agent hears. Structure (`{key, params}`), said through the client's t(). */
function siteResetLines(b) {
  const x = b || {};
  const n = Math.max(1, Number(x.holders) || 1);
  const claim = { key: i18nKey('The agent proposes clearing {host}\'s login and stored data in the profile "{profile}".'), params: { host: x.site, profile: x.profileLabel || '' } };
  const plan = [
    x.human ? { key: i18nKey('Every conversation using this profile ({n}) and your own browsing tab will be signed out of {host}.'), params: { n, host: x.site } }
      : { key: i18nKey('Every conversation using this profile ({n}) will be signed out of {host} — and so will you when you browse in it.'), params: { n, host: x.site } },
    { key: i18nKey('Cleared: the cookies {host} receives and the data its pages stored (local storage, IndexedDB, caches, service workers). Nothing else is touched — every other site stays signed in.'), params: { host: x.site } },
    { key: i18nKey('The agent is told when it is done — with your next message if its turn has ended.') },
  ];
  return { claim, plan, none: null };
}
function siteResetInboxItem(entry) {
  const p = entry && entry.proposal;
  const b = siteResetCardBlock(entry);
  if (!p || !b) return null;
  const L = siteResetLines(b);
  const lines = [L.claim, ...L.plan];
  const strip = (l) => ({ key: l.key, ...(l.params ? { params: Object.fromEntries(Object.entries(l.params).map(([k, v]) => [k, typeof v === 'number' ? v : String(v)])) } : {}) });
  return {
    text: `The agent proposes clearing ${p.site}'s stored login in "${p.profileLabel || p.profileId}"`, kind: 'action', urgency: 'high', origin: 'browser',
    detail: lines.map(lineText).join('\n'),
    action: { type: 'browser-proposal', id: String(entry.id), shown: p.digest },
    i18n: { text: { key: i18nKey('The agent proposes clearing {site}\'s stored login in "{profile}"'), params: { site: p.site, profile: p.profileLabel || p.profileId } }, detail: lines.map(strip), source: { key: i18nKey('Agent browser') } },
  };
}
/** What the agent's `site-reset` is answered with when it filed (or found) the proposal. */
function siteResetProposalNext({ entry, duplicate = false, rejected = false } = {}) {
  const p = (entry && entry.proposal) || {};
  const id = entry && entry.id;
  if (rejected) return `the user REJECTED clearing ${p.site}'s stored login in "${p.profileLabel || p.profileId}" — do not clear it another way (no other browser, no copied session); tell the user which site's login looks stale and carry on with what you can`;
  if (duplicate) return `the same card still waits for the user (proposal ${id}, ${p.state}) — no second card was made. Do not ask again and do not clear it another way; when they approve you are told (with their next message if your turn has ended); if they reject it, your next navigation to ${p.site} says so`;
  return `the profile "${p.profileLabel || p.profileId}" is shared (${p.holders} conversation${p.holders === 1 ? '' : 's'} use it${p.human ? ', and the user browses in it' : ''}), so clearing ${p.site}'s login signs every one of them out — a card in the user's chat now waits for their Approve (proposal ${id}). Tell the user in ONE sentence that the card waits — then stop: do NOT clear it another way, do not open another browser. When they approve you are told (with their next message if your turn has ended); if they reject it, your next navigation to ${p.site} says so`;
}

// ── the chip and the switch gate ─────────────────────────────────────────
/** `chromium 146` / `cdp` — the one thing a user wants to know at the moment they are blocked. */
function backendChip({ provider = 'chromium', major = null } = {}) {
  const p = String(provider || 'chromium');
  const m = Number.isInteger(major) ? ' ' + major : '';
  return `${p}${m}`;
}
/** The one-time typed refusal while a switch is in flight (§7.4: the gap in
 *  the middle is a NAMED refusal, the same family as tab_gone / browser_paused). */
function restartingRefusal(profile) {
  return { ok: false, code: 'browser_restarting', error: `"${(profile && profile.label) || 'this profile'}" is switching backend — its browser is being restarted; retry in a moment (your lease survives, your tab is re-opened at its last URL)` };
}
const SWITCH_CODES = Object.freeze(['provider_unknown', 'switch_noop', 'backend_unavailable', 'provider_needs_local_key', 'provider_local_only', 'switch_refused', 'switch_export_only', 'backend_no_key', 'downgrade_refused', 'downgrade_unknown', 'backend_seat_ceiling', 'backend_seat_taken', 'browser_restarting', 'not_owner']);
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
function switchVerdict({ profile, target, rowOf, controlOf, capabilityRefusalOf = null, resolveKey = null, seats = {}, majors = {}, dirMajor = null, confirmed = false, leases = [], inputs = {}, by = { kind: 'user' }, byKey = null, admitted = null, now = 0, hex = '00000001', runningOf = () => [], keyRequiredOf = keyRequiredFor, humans = [] } = {}) {
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
    return { ok: false, code: 'switch_export_only', provider: to, error: `${which} keeps its browser state with the vendor — its directory is not ours to open, so there is no in-place switch. The explicitly LOSSY path is export / import into a NEW profile on ${to} (vibespace-browser new <label> --provider ${to}; carrying the old state across is the user's act, not an agent verb — --state / --restore are refused): cookies, localStorage and an opt-in IndexedDB snapshot cross; sessionStorage and non-extractable CryptoKeys do not (WhatsApp Web's login is the known casualty)` };
  }
  const integrationId = integrationIdFor(to, rowOf);
  let key = null;
  if (integrationId) {
    key = typeof resolveKey === 'function' ? resolveKey(integrationId) : null;
    if ((!key || key.source === 'none') && keyRequiredOf(integrationId)) {
      return { ok: false, code: 'backend_no_key', provider: to, integrationId, error: `${to} needs a key and none is configured for ${integrationId}${key && key.why ? ' (' + key.why + ')' : ''} — open ⚙ → Integrations → ${integrationId} and paste yours, or use the cluster default there`, action: { openIntegration: integrationId, label: 'open Integrations' } };
    }
  }
  let ladder = null;
  if (row.ownsDir && fromRow.ownsDir && profile.dir) {
    ladder = versionLadder({ target: to, targetMajor: chromiumMajorFor(to, { majors }), recordedMajor: profile.lastChromiumMajor, dirMajor, confirmed });
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
  const mine = leases.filter((l) => byKey && l.browserKey === byKey);
  const others = leases.filter((l) => !(byKey && l.browserKey === byKey));
  // BROWSE YOURSELF (B-6ae8): the user's OWN browsing (a human holder row) drives the browser too — a switch while the
  // user browses it is a proposal, never a stop of the Chrome under them (`humans` never reopen: they are not leases)
  const driving = [...leases, ...(Array.isArray(humans) ? humans : [])].filter((l) => { const k = `${l.browserKey}|${l.profileId}`; const s = inputs && inputs[k]; return s && s.input === 'user'; });
  let mode = 'switch';
  let reason = null;
  if (driving.length) { mode = 'proposal'; reason = `somebody is driving this browser (${driving.map((l) => l.browserKey).join(', ')}) — a profile being driven is never interrupted by a proposal`; }
  else if (by && by.kind === 'agent') {
    if (others.length) { mode = 'proposal'; reason = `${others.length} other session(s) hold a lease on this profile (${others.map((l) => l.browserKey).join(', ')}) — a switch stops everybody's browser, so it goes to the owner as a proposal`; }
    // identity verify r3 (2026-09-28): WHO MAY USE IT is the ONE admission's answer (`admitted` = browser-profiles.mayAttach
    // over the conversation's live Task Groups, asked by the keeper) — the pre-list rule below read `owner.kind === 'session'`,
    // a shape the who-list migration retired, so an agent the list KEPT OUT switched a profile's backend directly (its
    // browser stopped and relaunched under another backend, a fingerprint seed minted) while a pre-list record still made
    // it a proposal. Not admitted, or not judged (null) ⇒ a proposal — never a direct switch of a profile one may not use
    else if (admitted !== true) { mode = 'proposal'; reason = admitted === false ? 'this conversation may not use the profile ("Who can use it" keeps it to other conversations)' : 'whether this conversation may use the profile was not judged'; }
  }
  return {
    ok: true, mode, reason, from, to, provider: to, integrationId, source: key ? key.source : null, clusterKey: key ? key.clusterKey || null : null,
    ladder, seats: seatsV,
    affected: leases.map((l) => l.browserKey), mine: mine.map((l) => l.browserKey), others: others.map((l) => l.browserKey),
    reopen: leases.map((l) => ({ browserKey: l.browserKey, lastUrl: l.lastUrl || null })),
  };
}
/**
 * THE ROW STATES the switch dialog draws (the rebuilt dialog, 2026-09-27): a
 * CLOSED set, computed HERE and worded on the client (the server sends
 * structure; the device's own `t()` says the words). `switching` is a VIEW
 * fact (`view.switching`), never a row state: the keeper commits the new
 * provider before its `start()`, so a per-row "restarting" would sit on the
 * wrong row mid-switch. src/lib/browser-switcher-model.js mirrors this list
 * and test-browser-switcher-model asserts the two are equal.
 */
const ROW_STATES = Object.freeze(['current', 'not-a-switch', 'other-machine', 'not-in-this-version', 'needs-key', 'older-browser', 'all-in-use-own', 'all-in-use-shared', 'in-use-by-hand', 'ready-confirm', 'ready', 'unavailable']);
/**
 * ONE row's state, FIRST MATCH WINS (the order is the decision; the client
 * never re-derives it):
 *   1 the current backend · 2 not an in-place pair (cdp / local-window /
 *   cloud:* — another profile, never a switch of this one) · 3 a key-bearing
 *   or local-only row on a paired machine's profile · 4 not wired on this
 *   build · 5 no key · 6 a downgrade · 7 the seat ceiling (whose key it is
 *   decides the words) · 8 somebody drives it by hand · 9 a downgrade nobody
 *   can judge (one confirmation) · 10 ready · 11 anything else.
 * (lane engine-spi-egress L3: the install / own-binary states left with the one row that had a program to install.)
 */
function rowState({ verdict = {}, row = null, current = false, currentRow = null, hold = null } = {}) {
  const v = verdict || {};
  if (current) return 'current';
  if (!row || row.canSwitchTo !== 'in-place' || !currentRow || currentRow.canSwitchTo !== 'in-place') return 'not-a-switch';
  if (v.code === 'provider_needs_local_key' || v.code === 'provider_local_only') return 'other-machine';
  if (v.code === 'backend_unavailable') return 'not-in-this-version';
  if (v.code === 'backend_no_key') return 'needs-key';
  if (v.code === 'downgrade_refused') return 'older-browser';
  if (v.code === 'backend_seat_ceiling') return v.seats && v.seats.source === 'cluster' ? 'all-in-use-shared' : 'all-in-use-own';
  if (hold === 'driven') return 'in-use-by-hand';
  if (v.code === 'downgrade_unknown') return 'ready-confirm';
  if (v.ok) return 'ready';
  return 'unavailable';
}
/** Is any lease on this profile being DRIVEN by hand right now? `{hold, driver}` —
 *  the same key the gate's proposal rule reads (`<browserKey>|<profileId>`). */
function holdOf(leases = [], inputs = {}, humans = []) {
  // BROWSE YOURSELF (B-6ae8): the user's own browsing holder is read too — `driver` is then its `hu-` key
  for (const l of [...(leases || []), ...(Array.isArray(humans) ? humans : [])]) {
    const s = inputs && inputs[`${l.browserKey}|${l.profileId}`];
    if (s && s.input === 'user') return { hold: 'driven', driver: String(l.browserKey) };
  }
  return { hold: null, driver: null };
}
/** The switcher's rows (§7.4 UX): every backend with its enabled/disabled
 *  verdict WRITTEN ON IT and, for a key-bearing row, the SOURCE chip from the
 *  MASKED view (`sources(id)` → {source, clusterKey, clusterLabel, whyCode,
 *  whyParams}) plus the one-click action. A disabled row names its reason; no
 *  row is hidden (the agent's `vibespace-browser backend` lists them all).
 *  2026-09-27 (the rebuilt dialog): every row also carries `switchKind`, its
 *  `state` (ROW_STATES, by `rowState`) and `facts` (structure the dialog words:
 *  the key, the ladder's numbers, the seats, who drives it). The inputs are defaulted:
 *  `leases`/`inputs` (the same two the switch passes, so a driven profile's
 *  state is real). */
function switcherRows({ profile, providerIds, rowOf, controlOf, capabilityRefusalOf = null, sources = () => null, seats = {}, majors = {}, dirMajor = null, now = 0, runningOf = () => [], leases = [], inputs = {}, keyRequiredOf = keyRequiredFor, humans = [] } = {}) {
  const from = String(profile.provider || 'chromium');
  const currentRow = rowOf(from) || null;
  const held = holdOf(leases, inputs, humans);
  return (providerIds || []).map((id) => {
    const row = rowOf(id) || {};
    const integrationId = integrationIdFor(id, rowOf);
    const src = integrationId ? (sources(integrationId) || { source: 'none' }) : null;
    const v = switchVerdict({ profile, target: id, rowOf, controlOf, capabilityRefusalOf, resolveKey: () => src, seats, majors, dirMajor, now, runningOf, leases, inputs, by: { kind: 'user' }, keyRequiredOf, humans });
    const current = from === id;
    const needsKey = integrationId ? keyRequiredOf(integrationId) : false;
    const sourceLabel = !integrationId ? null : (src && src.source === 'user' ? 'your own key' : src && src.source === 'cluster' ? `cluster default${src.clusterLabel ? ' · ' + src.clusterLabel : ''} (seats shared with other users)` : needsKey ? 'not configured' : 'no key needed');
    const seatRec = integrationId && seats && seats[integrationId] ? seats[integrationId] : null;
    const sv = v.seats && v.seats.state ? v.seats : null;
    const facts = {
      host: profile.host || null,
      key: integrationId ? { needed: needsKey, source: src ? src.source || 'none' : 'none', whyCode: src && src.whyCode ? src.whyCode : null, whyParams: src && src.whyParams ? src.whyParams : null } : null,
      wrote: v.ladder && Number.isInteger(v.ladder.wrote) ? v.ladder.wrote : null,
      targetMajor: chromiumMajorFor(id, { majors }),
      seatsTotal: sv && Number.isInteger(sv.state.total) ? sv.state.total : null,
      seatsUsed: sv ? sv.used : null,
      holders: v.code === 'backend_seat_ceiling' && Array.isArray(v.holders) ? v.holders.map((h) => (h && h.label) || null).filter(Boolean) : [],
      hold: held.hold, driver: held.driver,
    };
    return {
      id, label: row.label || id, words: row.words || null, tier: row.tier || null, current,
      enabled: v.ok, code: v.ok ? null : v.code, reason: v.ok ? null : v.error, needsConfirm: !!v.needsConfirm,
      integrationId, source: src ? src.source : null, sourceLabel, action: v.ok ? null : (v.action || (integrationId && needsKey && src && src.source === 'none' ? { openIntegration: integrationId, label: 'open Integrations' } : null)),
      seats: integrationId ? seatState({ tier: seatRec ? seatRec.tier : null, total: seatRec ? seatRec.total : null, at: seatRec ? seatRec.at : 0, now }) : null,
      chip: backendChip({ provider: id, major: chromiumMajorFor(id, { majors }) }),
      switchKind: row.canSwitchTo || null,
      state: rowState({ verdict: v, row: rowOf(id) || null, current, currentRow, hold: held.hold }),
      facts,
    };
  });
}
/** THE CHOICES a profile's switch dialog would draw a card for (the digest's
 *  `backends[id].choices`): every other backend where BOTH ends are an in-place
 *  pair and the capability control says ok for this profile's machine. The key,
 *  the binary, the version and the seats are NOT considered — a missing key or
 *  program is a step the dialog offers, so it is worth opening. No fs read, no
 *  key resolve: it rides every notify. [] on the shipped table (no in-place pair is wired). */
function switchChoices({ profile, providerIds, rowOf, controlOf } = {}) {
  if (!profile) return [];
  const cur = String(profile.provider || 'chromium');
  const curRow = rowOf(cur);
  if (!curRow || curRow.canSwitchTo !== 'in-place') return [];
  return (providerIds || []).filter((id) => {
    if (id === cur) return false;
    const r = rowOf(id);
    if (!r || r.canSwitchTo !== 'in-place') return false;
    const c = controlOf(id, { host: profile.host || null });
    return !!(c && c.ok === true);
  });
}
/** The backend FACT behind the chip, unstringified: `{id, major, plan}` — the
 *  profile's own recorded major first, else the backend's last launch; the plan
 *  is a key row's seat tier when one was read. The client words it
 *  (`chipWords`); `backendChip` spells the agent's `chromium 146` from it. */
function backendFact(profile, { seats = {}, majors = {} } = {}) {
  const provider = String((profile && profile.provider) || 'chromium');
  const intId = integrationIdFor(provider);
  const seat = intId && seats && seats[intId] ? seats[intId] : null;
  const major = profile && Number.isInteger(profile.lastChromiumMajor) ? profile.lastChromiumMajor : chromiumMajorFor(provider, { majors });
  const plan = seat && typeof seat.tier === 'string' && /^[a-z][a-z0-9-]{0,15}$/.test(seat.tier) ? seat.tier : null;
  return { id: provider, major: Number.isInteger(major) ? major : null, plan };
}
/** The vendor's own platform tag for this machine (a downloaded build names one). */
function platformTag(platform, arch) {
  const k = `${platform}-${arch}`;
  return { 'linux-x64': 'linux-x64', 'linux-arm64': 'linux-arm64', 'darwin-arm64': 'darwin-arm64', 'darwin-x64': 'darwin-x64', 'win32-x64': 'windows-x64' }[k] || k;
}
/** The one npm argv an install runs (the browser CLI's): into a prefix of OUR choosing (never `-g`, never the checkout),
 *  pinned, no audit/fund chatter, no package.json edits. The package's own scripts run as they would for anyone. */
function installArgv({ spec, prefix }) {
  if (!spec || !/^[a-z0-9@._/-]+$/i.test(String(spec))) throw new Error(`installArgv: bad spec ${JSON.stringify(spec)}`);
  if (!prefix) throw new Error('installArgv: prefix required');
  return ['install', '--prefix', String(prefix), '--no-audit', '--no-fund', '--no-save', String(spec)];
}
/** The executable an installed package exposes, read from ITS OWN package.json `bin` (a string, or an object whose
 *  `prefer` entry wins, else its first entry) — never a guessed file name. A path RELATIVE to the package dir, or null. */
function binFromPackageJson(pkg, prefer = null) {
  if (!pkg || typeof pkg !== 'object') return null;
  const b = pkg.bin;
  if (typeof b === 'string' && b.trim()) return b.trim();
  if (b && typeof b === 'object') {
    if (prefer && typeof b[prefer] === 'string' && b[prefer].trim()) return b[prefer].trim();
    for (const v of Object.values(b)) if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

module.exports = {
  installArgv, binFromPackageJson, platformTag, keyRequiredFor,
  SEAT_TIER_STALE_MS,
  KEY_ROWS, KEY_IDS, VENDOR_ENV_NAMES, integrationIdFor, vendorEnvFor, launchArgsFor, launchEnvFor,
  majorOf, parseLastVersion, majorOfBrowserString, chromiumMajorFor, versionLadder,
  seatState, ageText, seatVerdict, SEAT_TAKEN_RE, classifyLaunchFailure,
  testHostFor, hostOfUrl, testRequestFor,
  HINT_BY, TIERS, normalizeHost, siteHintVerdict, siteHintFor, blockedClaim, blockedText, navHint, SIGNIN_REFUSAL_ROWS, signinRefusalOf,
  egressRefusedText, // verify r1 V1: a refused site told to the agent
  PROPOSAL_STATES, PROPOSAL_PLANS, proposalPlan, proposalDigest, proposalUrlOf, proposalFor, claimVerdict, proposalStep,
  PROPOSAL_ID_RE, SITE_RESET_ID_RE, siteResetDigest, siteResetProposalFor, siteResetClaimVerdict, siteResetCardBlock, siteResetLines, siteResetInboxItem, siteResetProposalNext, // lane site-reset step 3
  BLOCKED_KEEP_MAX, blockedRank, blockedKeep, // verify r1: the claim store's bound drops the entries nobody waits on first
  rejectionText, approvedText, proposalCardBlock, proposalLines, lineText, NO_SWITCH_WORDS, proposalInboxItem,
  backendChip, restartingRefusal, SWITCH_CODES, switchVerdict, switcherRows,
  ROW_STATES, rowState, holdOf, switchChoices, backendFact,
};

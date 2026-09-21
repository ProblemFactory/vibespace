'use strict';
/**
 * THE INTEGRATION REGISTRY — the PURE table of every integration a user (or
 * a cluster) may hold a credential for (docs/design-communication-panel.zh.md
 * §14.2; consumed by that design AND by docs/design-agent-browser-v2.md §7.5,
 * which contributes its own rows — the NAMES are defined here, once).
 *
 * PURE: imports nothing. Bundled into the browser (the client renders the
 * declarations: labels, help, setup blocks, the test button's wording) AND
 * required by the server store (which is the ONLY thing that ever sees a
 * value). A ROW carries no value, ever.
 *
 * A ROW = { id, label, fields[], clusterEnv | delegate, setup?, test, consumers,
 *           wiredIn?, docs }
 *
 *  · `fields[].validate` is a PURE function returning `{ok:true}` or
 *    `{ok:false, why}` — a NAMED complaint, never a silent refusal, and never a
 *    rewrite of the value (the ONLY rewrite is trimming, which the store does
 *    and every field's help says so).
 *  · `setup` is what the user must do IN THE VENDOR'S CONSOLE before a consent
 *    page can succeed. The card draws it ABOVE the fields. `callbackUrl` is
 *    defined HERE AND ONLY HERE: `src/oauth-loopback.js` (P1) imports it, and
 *    the registry suite asserts the literal appears in no other file — a URL
 *    that must match a vendor console byte for byte may not have two spellings.
 *  · `clusterEnv` is a UNION: `{json, prefix}` (this layer parses the env
 *    itself) OR `delegate: {to:'drive-presets', prefer, multi}` (this layer asks
 *    the ALREADY-EXISTING reader, `MountManager.drivePresets()`). ONE env name
 *    has ONE resolver — the suite's census. This table DECLARES a row's
 *    prefix and never BUILDS a name from it (r3: the builder
 *    `envFieldName` lives in the store, the one resolver — an exported
 *    builder was a second resolver the env-name census could not see).
 *  · `test.kind` is a CLOSED set, and it decides the BUTTON'S OWN WORDING: a
 *    button claiming "Test connection" that never went to the network is a
 *    lie, and so is a bare green tick on a check that proves less than the
 *    reader assumes — hence `caveat`, which the card ALWAYS renders beside the
 *    verdict. A row declaring `setup.prerequisites` MUST declare `test.caveat`.
 *  · `consumers` are the files that actually call `resolveIntegration('<id>')`.
 *    Decision 25: a row lands WITH its adapter. Where the orchestrator placed a
 *    row ahead of its consumer (lark / gmail / cloak — their consoles' setup
 *    blocks and callback URL are the point of shipping them now), the row says
 *    so BY NAME in `wiredIn`, `consumers` is EMPTY, and its Test is a NAMED
 *    `not-wired` refusal. A row with neither live consumers nor a `wiredIn`
 *    phase is a card that does nothing, and the census fails it.
 *
 * NOTHING HERE IS A SETTING. The Test timeout and the one-in-flight-per-id
 * bound are constants of the store; a secret's neighbours must not be knobs
 * that broadcast.
 */

const TEST_KINDS = Object.freeze(['credential-exchange', 'shape-only', 'reachability']);

/** What the Test button SAYS, per kind — the English key the client hands
 *  to `t()`. A button's words are decided by what it does, never by a row. */
const TEST_BUTTON_LABEL = Object.freeze({
  'credential-exchange': 'Test connection',
  'shape-only': 'Check format (no network)',
  'reachability': 'Test reachability',
});

/** THE ONE DEFINITION of Lark's registered redirect URL (decision 4, owner
 *  2026-09-13): a VibeSpace-owned FIXED loopback, never a per-instance public
 *  address — every user's instance URL differs, so the callback can only land
 *  on the machine the user's browser is on and be pasted back (decision 21).
 *  The port is chosen HERE, once. src/oauth-loopback.js imports this. */
const LARK_CALLBACK_URL = 'http://127.0.0.1:17865/lark/cb';

/** Masking: secrets never leave the store in the clear. The last 4 characters
 *  ride along ONLY when the value is long enough that they are not most of it. */
const MASK = '••••';
const MASK_TAIL_MIN = 12;
function maskValue(v) {
  const s = v == null ? '' : String(v);
  if (!s) return null;
  return s.length >= MASK_TAIL_MIN ? MASK + s.slice(-4) : MASK;
}

const okV = Object.freeze({ ok: true });
const bad = (why) => ({ ok: false, why });
const V = {
  nonEmpty: (v) => (String(v).length ? okV : bad('must not be empty')),
  noSpaces: (v) => (/\s/.test(String(v)) ? bad('must not contain whitespace') : okV),
  minLen: (n) => (v) => (String(v).length >= n ? okV : bad(`at least ${n} characters`)),
  larkAppId: (v) => {
    const s = String(v);
    if (!s) return bad('must not be empty');
    if (/\s/.test(s)) return bad('must not contain whitespace');
    if (!/^cli_[A-Za-z0-9]+$/.test(s)) return bad('a Lark App ID starts with cli_ (Developer Console → Credentials & Basic Info)');
    return okV;
  },
  googleClientId: (v) => {
    const s = String(v);
    if (!s) return bad('must not be empty');
    if (/\s/.test(s)) return bad('must not contain whitespace');
    if (!/\.apps\.googleusercontent\.com$/.test(s)) return bad('a Google OAuth client id ends with .apps.googleusercontent.com');
    return okV;
  },
  cloakLicense: (v) => {
    const s = String(v);
    if (!s) return okV;                       // empty = free tier (the browser design says so)
    if (/\s/.test(s)) return bad('must not contain whitespace');
    if (!/^cb_[A-Za-z0-9_-]{8,}$/.test(s)) return bad('a CloakBrowser license key starts with cb_');
    return okV;
  },
};

/**
 * A DECLARED HUMAN-VISIBLE STRING IS A KEY (a3 i18n, 2026-09-18). Every
 * label / help / note / prerequisite / caveat below is DATA the client
 * renders — so the client renders `t(key)`, the dictionaries carry zh + ja
 * for each, and `scripts/i18n-extract.mjs` collects i18nKey(…) literals
 * beside t(…) so the census sees them. The marker is the identity: this
 * module stays PURE and the server store keeps reading the English.
 */
const i18nKey = (s) => s;

/** Said ONCE per card (never appended to every field's help). */
const TRIM_NOTE = i18nKey('Leading and trailing whitespace is trimmed before saving.');

const ROWS = Object.freeze([
  // ── THE FAKE ADAPTER'S OWN ROW (design §19 r7/r8 exit conditions) ─────────
  // It exists so that "the user's own > the cluster default > none" is walked
  // end to end in P0, with a real consumer (src/channels/fake.js asks
  // `resolveIntegration('fake')` in `auth.state()`), a real setup block (so the
  // callback URL + copy button have a functional leg on a card that ships),
  // and a Test that succeeds or fails on a FIXTURE SWITCH: a key that contains
  // the word `fail` fails. It talks to nothing.
  {
    id: 'fake',
    label: i18nKey('Fake channel (test adapter)'),
    fields: [
      { key: 'apiKey', label: i18nKey('API key'), secret: true, required: true, placeholder: 'fake_…',
        help: i18nKey('Any value of at least 4 characters; the fake adapter talks to nothing. A key containing "fail" makes Test fail (the fixture switch).'),
        validate: V.minLen(4) },
      { key: 'region', label: i18nKey('Region'), secret: false, required: false, placeholder: 'local',
        help: i18nKey('Optional; echoed back unchanged.'), validate: V.noSpaces },
    ],
    clusterEnv: { json: 'VIBESPACE_INTEGRATIONS', prefix: 'VIBESPACE_INTEGRATION_FAKE_' },
    setup: {
      // The fake adapter has no console. The URL shares the VibeSpace-owned
      // loopback origin (decision 4) under its own path so the setup block —
      // callback line, copy button, checklist — is exercised on a card that
      // ships in P0, not first on a card that ships with P1.
      callbackUrl: 'http://127.0.0.1:17865/fake/cb',
      callbackNote: i18nKey('The test channel has no console; nothing needs to be registered anywhere.'),
      prerequisites: [
        i18nKey('A key of at least 4 characters is saved below, or the cluster provides one'),
        i18nKey('The key does not contain the word "fail" (that is the Test fixture switch)'),
      ],
    },
    test: {
      kind: 'shape-only',
      describe: i18nKey('Checks the resolved key\'s shape and the fixture switch. Zero network: the fake adapter has no vendor.'),
      caveat: i18nKey('This proves nothing about any vendor — the fake adapter has none. It shows that the value you saved is the value the adapter resolves.'),
    },
    consumers: ['src/channels/fake.js'],
    usedBy: i18nKey('Used by the test channel'),
    docs: 'docs/design-communication-panel.zh.md',
  },

  // ── LARK / 飞书 (design §14.2 row 1; consumer lands in P1) ──────────────
  {
    id: 'lark',
    label: 'Lark / 飞书',
    fields: [
      { key: 'appId', label: i18nKey('App ID'), secret: false, required: true, placeholder: 'cli_…',
        help: i18nKey('Developer Console → Credentials & Basic Info.'), validate: V.larkAppId },
      { key: 'appSecret', label: i18nKey('App Secret'), secret: true, required: true,
        help: i18nKey('Same page. It is only ever written here, never read back.'), validate: V.minLen(8) },
    ],
    clusterEnv: { json: 'VIBESPACE_INTEGRATIONS', prefix: 'VIBESPACE_INTEGRATION_LARK_' },
    setup: {
      callbackUrl: LARK_CALLBACK_URL,
      callbackNote: i18nKey('Developer Console → Security Settings → Redirect URLs. It must match byte for byte.'),
      prerequisites: [
        i18nKey('The redirect URL above is registered in that list'),
        i18nKey('The scopes im:message and im:message.send_as_user are granted'),
        i18nKey('The app has a PUBLISHED version'),
      ],
    },
    test: {
      kind: 'credential-exchange',
      describe: i18nKey('Exchanges this app id / secret pair for a tenant token once. Reads no conversation, sends no message.'),
      caveat: i18nKey('This only proves the app id / secret pair is right. The consent page also needs the three items above — missing any of them fails on the consent page, not on this call.'),
    },
    consumers: ['src/channels/lark.js'],
    usedBy: i18nKey('Used by the Lark / 飞书 channel'),
    docs: 'https://open.feishu.cn/document/',
  },

  // ── GMAIL — a DELEGATING row (decision 5, owner 2026-09-13) ─────────────
  // It REUSES the existing VibeSpace Google OAuth client preset mechanism
  // (`VIBESPACE_GDRIVE_CLIENTS`, read by MountManager.drivePresets()) and has
  // NO env of its own. Resolution order (§14.2): the user's SAVED choice >
  // `prefer` > the only preset. There is no fourth rung — `_driveClient()`'s
  // `'default'` fallback answers null on a two-preset list and is exactly the
  // shape this row refuses to inherit.
  {
    id: 'gmail',
    label: 'Gmail',
    fields: [
      { key: 'clientId', label: i18nKey('OAuth client ID'), secret: false, required: true, placeholder: '…apps.googleusercontent.com',
        help: i18nKey('Only when using your own client.'), validate: V.googleClientId },
      { key: 'clientSecret', label: i18nKey('OAuth client secret'), secret: true, required: true,
        help: i18nKey('Only when using your own client.'), validate: V.minLen(8) },
    ],
    delegate: { to: 'drive-presets', prefer: 'channels', multi: true },
    setup: null,
    test: {
      kind: 'shape-only',
      describe: i18nKey('Checks the client id / secret shape and builds the authorization URL. A Google OAuth client cannot be exchanged for anything on its own (no client-credentials grant), so the real verdict is the OAuth round trip.'),
      caveat: i18nKey('Shape only. Whether the consent succeeds, and how long the refresh token lives, depends on the client\'s verification status.'),
    },
    consumers: ['src/channels/gmail.js'],
    usedBy: i18nKey('Used by the Gmail channel'),
    docs: 'docs/design-communication-panel.zh.md',
  },

  // ── CLOAKBROWSER (docs/design-agent-browser-v2.md §7.5; consumer lands with that track) ──
  {
    id: 'cloak',
    label: 'CloakBrowser',
    fields: [
      { key: 'licenseKey', label: i18nKey('License key'), secret: true, required: false, placeholder: 'cb_…',
        help: i18nKey('Empty means the free tier (one concurrent session).'), validate: V.cloakLicense },
    ],
    clusterEnv: { json: 'VIBESPACE_INTEGRATIONS', prefix: 'VIBESPACE_INTEGRATION_CLOAK_' },
    setup: null,
    test: {
      kind: 'shape-only',
      describe: i18nKey('Checks the key\'s shape. A real launch probe would download the browser and needs the egress precondition; neither belongs on a card opened to paste a key.'),
      caveat: i18nKey('Shape only. The seat tier is read back from the first real launch, not from this check.'),
    },
    consumers: [],
    // `wiredIn` is the PHASE in words (a key the client translates); the
    // files that will consume the row stay beside it for tooling, off the card.
    wiredIn: i18nKey('the agent-browser v2 track'),
    wiredInFiles: ['src/server/browser-backend.js', 'src/server/browser-keeper.js'],
    docs: 'docs/design-agent-browser-v2.md',
  },
]);

const byId = new Map(ROWS.map((r) => [r.id, r]));
const rowById = (id) => byId.get(String(id)) || null;
const rowIds = () => ROWS.map((r) => r.id);

/**
 * Validate a patch of values against a row. `undefined` = untouched (not
 * validated); `''` = cleared (not validated — clearing is always allowed);
 * anything else is trimmed and validated. Returns `{ok, errors:{field:why},
 * values:{field: trimmed}}`. Unknown fields are a named error.
 */
function validateValues(row, patch) {
  const r = typeof row === 'string' ? rowById(row) : row;
  if (!r) return { ok: false, errors: { _row: 'unknown integration' }, values: {} };
  const errors = {};
  const values = {};
  const fields = new Map(r.fields.map((f) => [f.key, f]));
  for (const [k, raw] of Object.entries(patch || {})) {
    if (raw === undefined) continue;
    const f = fields.get(k);
    if (!f) { errors[k] = 'not a field of this integration'; continue; }
    if (raw === null || raw === '') { values[k] = ''; continue; }
    if (typeof raw !== 'string') { errors[k] = 'must be a string'; continue; }
    const v = raw.trim();
    if (!v) { values[k] = ''; continue; }
    const res = typeof f.validate === 'function' ? f.validate(v) : okV;
    if (!res || res.ok !== true) errors[k] = (res && res.why) || 'invalid';
    else values[k] = v;
  }
  return { ok: Object.keys(errors).length === 0, errors, values };
}

/** Which REQUIRED fields a value set lacks. Names them — never lets the user guess. */
function missingFields(row, values) {
  const r = typeof row === 'string' ? rowById(row) : row;
  if (!r) return [];
  return r.fields.filter((f) => f.required && !(values && String(values[f.key] || '').length)).map((f) => f.key);
}

/**
 * THE PRECEDENCE, as a pure function: the user's own > the cluster default >
 * none. A credential set is ONE PAIR — there is no per-field mixing (a user's
 * appId with the cluster's appSecret is a pair that exists nowhere).
 *
 * @param userValues  {field: value} the user typed (empty strings count as absent), or null
 * @param clusterDefault {key, label, values} | null — what the environment offers RIGHT NOW
 * @param opts.clusterWhy  the reason there is no cluster default (when a record still points at one)
 * @returns {source:'user'|'cluster'|'none', values, clusterKey, label, why}
 */
function resolvePrecedence(userValues, clusterDefault, opts = {}) {
  const user = {};
  for (const [k, v] of Object.entries(userValues || {})) if (v !== undefined && v !== null && String(v).length) user[k] = String(v);
  if (Object.keys(user).length) return { source: 'user', values: user, clusterKey: null, label: null, why: null, whyCode: null, whyParams: null };
  if (clusterDefault && clusterDefault.values) {
    return { source: 'cluster', values: { ...clusterDefault.values }, clusterKey: clusterDefault.key || 'default', label: clusterDefault.label || null, why: null, whyCode: null, whyParams: null };
  }
  // `why` is the English contract sentence (logs, the CLI); `whyCode` +
  // `whyParams` are the same fact as STRUCTURE for the client to word.
  return {
    source: 'none', values: {}, clusterKey: null, label: null,
    why: opts.clusterWhy || 'no user values and no cluster default',
    whyCode: opts.clusterWhy ? (opts.clusterWhyCode || 'cluster') : 'no-values',
    whyParams: opts.clusterWhy ? (opts.clusterWhyParams || null) : null,
  };
}

/**
 * THE CREDENTIAL `why`, IN WORDS (a3 i18n). Every reason the store can give
 * for a `none` (or a re-keyed `cluster`) answer is a CODE here with its
 * params; the client renders it with its own `t`. An unknown code falls back
 * to the English sentence beside it, never to silence.
 */
function credentialWhyText({ whyCode = null, whyParams = null, why = null } = {}, { t = (s, p) => (p ? String(s).replace(/\{(\w+)\}/g, (m, k) => (k in p ? String(p[k]) : m)) : String(s)) } = {}) {
  const p = whyParams || {};
  switch (String(whyCode || '')) {
    case 'no-values': return t('no key of your own and no cluster default');
    case 'no-preset': return t('the cluster provides no default for this integration');
    case 'preset-gone': return t('the preset you chose ({key}) is no longer provided by the cluster', { key: p.key || '?' });
    case 'ambiguous': return t('the cluster provides {n} presets and none is the preferred one — choose one', { n: p.n || 0 });
    case 'undecryptable': return t('the stored keys ({fields}) cannot be decrypted with the current key file', { fields: Array.isArray(p.fields) ? p.fields.join(', ') : '' });
    case 'store-unreadable': return t('the integrations store could not be read');
    case 'rebound': return t('the cluster default this row used ({from}) was re-keyed to {to} — the only default this instance offers', { from: p.from || '?', to: p.to || '?' });
    case 'no-store': return t('no integration store on this instance');
    case 'lookup-failed': return t('the integration lookup failed');
    case '': return why ? String(why) : '';
    default: return why ? String(why) : String(whyCode);
  }
}

/**
 * The delegating row's choice among the cluster's presets (§14.2): the user's
 * SAVED choice > `prefer` > the ONLY preset. No fourth rung. Returns the
 * chosen preset or `null` with `why`.
 *
 * `rebindSingle` (2026-09-14) is the ONE named exception, for the rows whose
 * saved key was never a CHOICE: a non-delegating row's radio "Use cluster
 * default" stores the implicit `'default'` as a boolean intent, so when the
 * admin later names that single default (`key: 'tenantA'`) the intent still
 * holds and the row re-binds to the env's ONLY preset, reporting `rebound:
 * {from, to}`. With two or more presets a vanished key still answers null —
 * that is a picker's question, and the delegating dropdown (a refresh token
 * is bound to the OAuth client it was issued under) never passes the flag.
 */
function pickPreset(presets, { savedKey = null, prefer = null, rebindSingle = false } = {}) {
  const list = Array.isArray(presets) ? presets.filter((p) => p && p.key) : [];
  if (!list.length) return { preset: null, why: 'the cluster provides no preset', whyCode: 'no-preset', whyParams: null };
  if (savedKey) {
    const hit = list.find((p) => p.key === savedKey);
    if (hit) return { preset: hit, why: null, whyCode: null, whyParams: null };
    if (rebindSingle && list.length === 1) return { preset: list[0], why: null, whyCode: null, whyParams: null, rebound: { from: savedKey, to: list[0].key } };
    return { preset: null, why: `the preset you chose (${savedKey}) is no longer provided by the cluster`, whyCode: 'preset-gone', whyParams: { key: savedKey } };
  }
  if (prefer) {
    const hit = list.find((p) => p.key === prefer);
    if (hit) return { preset: hit, why: null, whyCode: null, whyParams: null };
  }
  if (list.length === 1) return { preset: list[0], why: null, whyCode: null, whyParams: null };
  return { preset: null, why: `the cluster provides ${list.length} presets and none is named ${prefer || 'as preferred'} — choose one`, whyCode: 'ambiguous', whyParams: { n: list.length, prefer: prefer || null } };
}

/** The declaration-only view of a row's fields (no validate functions): what
 *  the wire carries. */
function fieldDecls(row) {
  return row.fields.map(({ key, label, secret, required, placeholder, help }) => ({ key, label, secret: !!secret, required: !!required, placeholder: placeholder || '', help: help || '' }));
}

/** Registry-level self-checks the suite runs; kept here so the rules are one place. */
function checkRow(row) {
  const errs = [];
  if (!row.id || !/^[a-z][a-z0-9:-]*$/.test(row.id)) errs.push('id must be lowercase [a-z0-9:-]');
  if (!row.label) errs.push('label required');
  if (!Array.isArray(row.fields) || !row.fields.length) errs.push('fields required');
  for (const f of row.fields || []) if (typeof f.validate !== 'function') errs.push(`field ${f.key}: validate must be a function`);
  if (!row.clusterEnv && !row.delegate) errs.push('clusterEnv or delegate required');
  if (row.clusterEnv && row.delegate) errs.push('clusterEnv and delegate are a UNION — declare one');
  if (row.delegate && row.delegate.to !== 'drive-presets') errs.push('delegate.to must be drive-presets');
  if (!row.test || !TEST_KINDS.includes(row.test.kind)) errs.push(`test.kind must be one of ${TEST_KINDS.join('|')}`);
  if (row.setup && Array.isArray(row.setup.prerequisites) && row.setup.prerequisites.length && !(row.test && row.test.caveat)) errs.push('a row with setup.prerequisites must declare test.caveat');
  if (row.setup && row.setup.callbackUrl && !/^http:\/\/127\.0\.0\.1:\d+\//.test(row.setup.callbackUrl)) errs.push('setup.callbackUrl must be a loopback URL (decision 4/21)');
  if (!Array.isArray(row.consumers)) errs.push('consumers must be an array');
  if (Array.isArray(row.consumers) && !row.consumers.length && !row.wiredIn) errs.push('a row with no live consumer must name the phase it is wired in (decision 25)');
  return errs;
}

module.exports = {
  ROWS, TEST_KINDS, TEST_BUTTON_LABEL, LARK_CALLBACK_URL, MASK, MASK_TAIL_MIN,
  rowById, rowIds, maskValue, validateValues, missingFields, resolvePrecedence, pickPreset,
  fieldDecls, checkRow, TRIM_NOTE, credentialWhyText,
};

'use strict';
/**
 * THE ADAPTER REGISTRY AND ITS CONTRACT
 * (docs/design-communication-panel.zh.md §4, §2's first placement rule).
 *
 * ORCH tier. An adapter owns exactly three things — vendor auth, vendor
 * paging, and the vendor's message shape. IT NEVER TOUCHES the store, the
 * ACL, the policy or the spend guard, and **a capability it did not declare is
 * a capability the product does not offer for it**. That is the same
 * discipline `src/backend-caps.js` enforces for harnesses: GATE ON THE
 * CAPABILITY ROW, NEVER ON AN ADAPTER ID — with a grep census (in
 * scripts/test-channel-adapter-contract.mjs) asserting no call site outside
 * this directory branches on `kind`.
 *
 * THE CONTRACT THIS MODULE ENFORCES AT REGISTRATION AND AT CALL TIME:
 *
 *  · A DECLARED capability must be implemented, and an UNDECLARED one must
 *    THROW rather than half-work. "Degrading gracefully" is how this
 *    repository has hidden its own bugs over and over.
 *  · Every failure is a TYPED `{ code, retryable }` from a CLOSED set. A bare
 *    `throw` out of an adapter is a contract violation, so `wrap()` converts
 *    one into a typed `vendor-error` AND records it, rather than letting a
 *    stack trace become the product's error handling.
 *  · `history()` never returns records the caller did not ask for, reports
 *    `reachedAnchor` honestly, and ADVANCES NOTHING — the cursor belongs to
 *    the store (design §5 invariant 4).
 *  · `convCaps()` IS NEVER WIDER THAN `caps`. The direction is load-bearing:
 *    the static declaration is an UPPER BOUND and the per-conversation
 *    resolution may only narrow, so "we have never verified sending on this
 *    platform" can never be undone by one optimistic per-conversation answer.
 *  · ON A `sendAs: []` ADAPTER, `send()` IS NOT A FAILURE — IT DOES NOT EXIST.
 *    It answers the typed `send-not-available` with the reason `caps` itself
 *    gives, and the outbox creates NO proposal, because a proposal that can
 *    never be sent asks a user to approve something guaranteed to fail.
 */

/** The CLOSED failure set. A code outside it is itself a contract violation. */
const CHANNEL_ERROR_CODES = Object.freeze([
  'auth-expired',
  'rate-limited',
  'not-found',
  'forbidden',
  'transport',
  'vendor-error',
  'too-large',
  'send-not-available',   // §4: not a failure — a capability that does not exist here
  'not-supported',        // an UNDECLARED capability was called
]);

class ChannelError extends Error {
  constructor(code, message, { retryable = false, detail = null } = {}) {
    super(message || code);
    this.name = 'ChannelError';
    this.code = CHANNEL_ERROR_CODES.includes(code) ? code : 'vendor-error';
    this.retryable = !!retryable;
    this.detail = detail;
    if (this.code !== code) this.detail = { ...(detail || {}), undeclaredCode: code };
  }
  toJSON() { return { ok: false, code: this.code, retryable: this.retryable, detail: this.detail }; }
}

/**
 * WHAT WE SENT NEVER COMES BACK IN OUR WORDS (client-from-mount verify r4,
 * credential class). An adapter words a vendor refusal from the vendor's own
 * body (`typedFailure`), and that sentence travels far: the account's
 * `lastAuthError` / `lastPass` (written to adapters.json in the clear and
 * BROADCAST to every client in the digest), the For-you item's "Vendor said:",
 * the log. A vendor — or a gateway in front of it — that echoes the request
 * in its error ("the secret … was rejected") therefore published the client
 * secret the request carried; for an account that borrowed a storage mount's
 * client, the mount's. Google and Lark do not echo today; nothing here may
 * depend on that. So the adapters' ONE round-trip function scrubs the
 * vendor's body (and a transport error's text) of the EXACT VALUES the
 * request carried in its secret-bearing fields, BEFORE the typed error is
 * built (its message, its detail and its stack are born clean). By value,
 * never by pattern: the vendor's own words are left as they are.
 *   sentSecrets({fields, headers}) → [{name, value}] — `fields` = the form /
 *     JSON body the request sends; the Bearer of `headers.Authorization`.
 *   withoutSent(value, sent) → a scrubbed COPY of a string / JSON value.
 * verify r5: a value is withheld in EVERY spelling it left in — plain, as
 * `encodeURIComponent` spells it AND as the form body actually carried it
 * (`URLSearchParams` percent-encodes `!'()~` and writes a space as `+`, where
 * encodeURIComponent leaves them; a gateway echoing the raw body echoes that
 * form) — and the Bearer is read WITHOUT a regex: V8 keeps the subject of the
 * last regex match in the legacy `RegExp.input` / `lastMatch` statics (the
 * heap's regexp_last_match_info) until the next match anywhere, so a regex
 * over the Authorization header parked the live bearer there after every call.
 */
const SENT_SECRET_FIELDS = Object.freeze(['client_secret', 'app_secret', 'refresh_token']);
const SENT_SECRET_MIN = 6;   // a shorter value would rewrite ordinary words
function sentSecrets({ fields = null, headers = null } = {}) {
  const out = [];
  const f = fields && typeof fields === 'object' ? fields : {};
  for (const k of SENT_SECRET_FIELDS) { const v = f[k]; if (typeof v === 'string' && v.length >= SENT_SECRET_MIN) out.push({ name: k, value: v }); }
  const a = headers && typeof headers === 'object' ? (headers.Authorization || headers.authorization) : null;
  const bearer = bearerOf(a);   // verify r5: no regex — a regex would park the header in RegExp.input until the next match
  if (bearer && bearer.length >= SENT_SECRET_MIN) out.push({ name: 'access_token', value: bearer });
  return out;
}
/** The token of a `Bearer <token>` header (the scheme case-insensitive, the token a single run of non-blank
 *  characters), read by slicing: never a regex over a string that holds a live credential. null = not a Bearer. */
function bearerOf(a) {
  if (typeof a !== 'string' || a.length < 8 || a.slice(0, 7).toLowerCase() !== 'bearer ') return null;
  const v = a.slice(7).trim();
  if (!v) return null;
  for (let i = 0; i < v.length; i++) { const c = v.charCodeAt(i); if (c === 32 || c === 9 || c === 10 || c === 13 || c === 11 || c === 12) return null; }
  return v;
}
/** Every spelling a sent value can come back in: plain, encodeURIComponent's, and the form body's own (URLSearchParams). */
const spellingsOf = (value) => new Set([value, encodeURIComponent(value), new URLSearchParams([['v', value]]).toString().slice(2)]);
function withoutSent(value, sent) {
  if (!Array.isArray(sent) || !sent.length) return value;
  const scrub = (str) => {
    let o = str;
    for (const x of sent) {
      for (const v of spellingsOf(x.value)) if (o.includes(v)) o = o.split(v).join(`[${x.name} withheld]`);
    }
    return o;
  };
  const walk = (v, depth) => {
    if (typeof v === 'string') return scrub(v);
    if (!v || typeof v !== 'object' || depth > 6) return v;
    if (Array.isArray(v)) return v.map((x) => walk(x, depth + 1));
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x, depth + 1)]));
  };
  return walk(value, 0);
}

const RECEIVE_MODES = Object.freeze(['push', 'poll', 'scan']);
const SCAN_SOURCES = Object.freeze(['store', 'ui']);
const HISTORY_MODES = Object.freeze(['page', 'since', 'none']);
const SEND_IDENTITIES = Object.freeze(['user', 'bot']);
const IDENTITY_MARKING = Object.freeze(['none', 'marked', 'unknown']);
const TOS_RISK = Object.freeze(['none', 'stated', 'prohibited']);
/** 2026-09-26: how an adapter pages BACK past the local log (`older()`), and
 *  the unit its per-account budget is counted in (`caps.budget.unit`). */
const OLDER_HISTORY = Object.freeze(['page', 'none']);
const BUDGET_UNITS = Object.freeze(['request', 'quota-unit']);
/** Lane R5: the drain actions a `caps.pace.cost` may price (drain rule 18). */
const PACE_COSTS = Object.freeze(['fetch', 'discover', 'scanHost']);
/** §25 (2026-09-27): how a record is DRAWN — `text` (the default: the window's
 *  generic rung over `text`) or `blocks` (the adapter writes the typed render
 *  tree at ingest AND the module exports `blocksOf(record)`, the rung for a
 *  record stored before that); and what a conversation's TITLE is — a `name`
 *  (a chat) or a mail `subject` (shown through `cleanSubject`). */
const RENDER_MODES = Object.freeze(['text', 'blocks']);
const TITLE_FORMS = Object.freeze(['name', 'subject']);

/**
 * THE VENDOR'S OWN RETRY HINT (lane R5): seconds from a response's
 * `Retry-After` (delta-seconds or an HTTP-date) or Lark's
 * `x-ogw-ratelimit-reset` (seconds), else null. Read by an adapter's
 * `callJson` when a call is refused, carried as `detail.retryAfterSec` —
 * the engine's short rate back-off honours it. `headers` = a fetch Headers
 * (or anything with `get`); a fixture without headers answers null.
 */
function retryAfterSeconds(headers, nowMs = Date.now()) {
  if (!headers || typeof headers.get !== 'function') return null;
  const read = (k) => { try { const v = headers.get(k); return v == null ? null : String(v).trim(); } catch { return null; } };
  const ra = read('retry-after');
  if (ra) {
    if (/^\d+(\.\d+)?$/.test(ra)) return Math.max(0, Number(ra));
    const at = Date.parse(ra);
    if (Number.isFinite(at)) return Math.max(0, Math.ceil((at - nowMs) / 1000));
  }
  const reset = read('x-ogw-ratelimit-reset');
  if (reset && /^\d+(\.\d+)?$/.test(reset)) return Math.max(0, Number(reset));
  return null;
}

/** Which capability each optional method is DECLARED by. A method present
 *  without its declaration is refused at registration; a method CALLED without
 *  its declaration throws `not-supported`. */
const METHOD_GATES = Object.freeze({
  live: (c) => c.receive === 'push',
  scanHost: (c) => c.receive === 'scan',
  fetchAttachment: (c) => c.attachments === 'fetch',
  // 2026-09-26: history ON DEMAND past the local log's start (the window's
  // scroll-up) — declared by `caps.olderHistory: 'page'`
  older: (c) => c.olderHistory === 'page',
  reconcile: (c) => (c.sendAs || []).length > 0,
  send: (c) => (c.sendAs || []).length > 0,
  // R4 (B-6acc): a NEW conversation — `caps.compose === true` declares both
  // the send (`compose`) and the ACCOUNT-level identity check (`composeCaps`)
  compose: (c) => c.compose === true && (c.sendAs || []).length > 0,
  composeCaps: (c) => c.compose === true && (c.sendAs || []).length > 0,
  listConversations: (c) => c.listConversations !== false,
});

/**
 * Validate a static `caps` declaration. THROWS with the exact rule broken —
 * a registration bug must fail at module load, where every gate sees it.
 */
function validateCaps(kind, caps) {
  const c = caps || {};
  const bad = (m) => { throw new Error(`channel adapter '${kind}': ${m}`); };

  if (!RECEIVE_MODES.includes(c.receive)) bad(`caps.receive must be one of ${RECEIVE_MODES.join('|')} (got ${JSON.stringify(c.receive)})`);
  if (!Array.isArray(c.sendAs)) bad('caps.sendAs must be an array (an empty one declares a READ-ONLY adapter)');
  for (const s of c.sendAs) if (!SEND_IDENTITIES.includes(s)) bad(`caps.sendAs holds ${JSON.stringify(s)} — only ${SEND_IDENTITIES.join('|')}`);
  if (!IDENTITY_MARKING.includes(c.identityMarking)) bad(`caps.identityMarking must be one of ${IDENTITY_MARKING.join('|')}`);
  if (!TOS_RISK.includes(c.tosRisk || 'none')) bad(`caps.tosRisk must be one of ${TOS_RISK.join('|')}`);

  if (c.olderHistory !== undefined && !OLDER_HISTORY.includes(c.olderHistory)) bad(`caps.olderHistory must be one of ${OLDER_HISTORY.join('|')}`);
  if (c.compose !== undefined && typeof c.compose !== 'boolean') bad('caps.compose must be a boolean (true = the adapter can start a NEW conversation)');
  if (c.budget !== undefined) {
    const b = c.budget;
    if (!b || typeof b !== 'object') bad('caps.budget must be an object {unit, default, settingKey?, metered?}');
    if (!BUDGET_UNITS.includes(b.unit)) bad(`caps.budget.unit must be one of ${BUDGET_UNITS.join('|')}`);
    if (!(Number(b.default) > 0)) bad('caps.budget.default must be a positive number (per minute)');
    if (b.settingKey !== undefined && b.settingKey !== null && !/^channels\.[A-Za-z0-9]+$/.test(String(b.settingKey))) bad('caps.budget.settingKey must be a channels.* setting key');
  }
  // lane R5: the PER-SECOND pace (drain rule 18) — in the budget's unit, so a
  // pace without a budget has no unit and is refused
  if (c.pace !== undefined) {
    const p = c.pace;
    if (!p || typeof p !== 'object') bad('caps.pace must be an object {unitsPerSec, settingKey?, cost?}');
    if (c.budget === undefined) bad('caps.pace needs caps.budget (the pace is counted in the budget\'s unit)');
    if (!(Number(p.unitsPerSec) > 0)) bad('caps.pace.unitsPerSec must be a positive number (per second)');
    if (p.settingKey !== undefined && p.settingKey !== null && !/^channels\.[A-Za-z0-9]+$/.test(String(p.settingKey))) bad('caps.pace.settingKey must be a channels.* setting key');
    if (p.cost !== undefined) {
      if (!p.cost || typeof p.cost !== 'object') bad('caps.pace.cost must be an object {fetch?, discover?, scanHost?}');
      for (const [k, v] of Object.entries(p.cost)) {
        if (!PACE_COSTS.includes(k)) bad(`caps.pace.cost.${k} is not an action the drain paces (${PACE_COSTS.join('|')})`);
        if (!(Number(v) >= 0)) bad(`caps.pace.cost.${k} must be a number ≥ 0`);
      }
    }
  }
  if (c.render !== undefined && !RENDER_MODES.includes(c.render)) bad(`caps.render must be one of ${RENDER_MODES.join('|')}`);
  if (c.titleForm !== undefined && !TITLE_FORMS.includes(c.titleForm)) bad(`caps.titleForm must be one of ${TITLE_FORMS.join('|')}`);
  if (c.vendorName !== undefined && !(typeof c.vendorName === 'string' && c.vendorName.trim() && c.vendorName.length <= 40)) bad('caps.vendorName must be a non-empty string of at most 40 characters (the vendor as the card names it)');
  if (c.receive === 'push') {
    if (!c.pushTransport) bad("caps.receive 'push' must declare pushTransport");
    if (!Number.isFinite(Number(c.pushAckBudgetMs))) bad("caps.receive 'push' must declare pushAckBudgetMs (the vendor's own deadline — fence 11 acks AFTER durability)");
  }

  if (c.receive === 'scan') {
    // r4: a scan adapter reports neither "a complete pass" nor `reachedAnchor`
    // if it cannot page at all, and design §5 invariant 4 requires both before
    // an anchor may advance.
    if (c.history === 'none') bad("caps.receive 'scan' may not declare history:'none' — an adapter that cannot page can never report a COMPLETE pass, so its anchor could never advance");
    // r5: `scanSources` is a PER-PLATFORM upper bound, because ONE adapter
    // reads a store on one OS and scrapes a screen on another.
    if (!c.scanSources || typeof c.scanSources !== 'object') bad("caps.receive 'scan' must declare scanSources (a per-platform table)");
    const platforms = Object.keys(c.scanSources);
    if (!platforms.length) bad('caps.scanSources is empty — declare the platforms this adapter can read');
    for (const p of platforms) if (!SCAN_SOURCES.includes(c.scanSources[p])) bad(`caps.scanSources.${p} must be one of ${SCAN_SOURCES.join('|')}`);
    if (!c.scanLatency || typeof c.scanLatency !== 'object') bad("caps.receive 'scan' must declare scanLatency per SOURCE (it is the declared cadence AND the fs.watch debounce ceiling)");
    // r6: `history` is a per-SOURCE fact for exactly the reason `scanSources`
    // is one — a DOM scrape cannot honour since-anchor semantics, while
    // declaring 'page' would delete the real anchor that is WHY 'store' is
    // preferred. Every named source needs its row and none may be 'none'.
    if (!c.historyBySource || typeof c.historyBySource !== 'object') bad("caps.receive 'scan' must declare historyBySource (per SOURCE), not the `history` scalar");
    for (const p of platforms) {
      const src = c.scanSources[p];
      const h = c.historyBySource[src];
      if (!h) bad(`caps.historyBySource is missing '${src}', which caps.scanSources.${p} names`);
      if (h === 'none') bad(`caps.historyBySource.${src} may not be 'none' (see the receive:'scan' rule above)`);
      if (!HISTORY_MODES.includes(h)) bad(`caps.historyBySource.${src} must be one of ${HISTORY_MODES.join('|')}`);
      if (!Number.isFinite(Number(c.scanLatency[src]))) bad(`caps.scanLatency is missing a number for '${src}'`);
    }
  } else if (!HISTORY_MODES.includes(c.history)) {
    bad(`caps.history must be one of ${HISTORY_MODES.join('|')}`);
  }
  return true;
}

/** Which optional methods a module must and must not implement. */
function validateMethods(kind, caps, mod) {
  for (const [name, declared] of Object.entries(METHOD_GATES)) {
    const has = typeof mod[name] === 'function' || (name === 'live' && mod.live && typeof mod.live.start === 'function');
    if (declared(caps) && !has) throw new Error(`channel adapter '${kind}': caps declare ${name} but the module does not implement it`);
  }
  for (const req of ['auth', 'history', 'convCaps']) {
    if (typeof mod[req] !== 'function' && !(req === 'auth' && mod.auth && typeof mod.auth.state === 'function')) {
      throw new Error(`channel adapter '${kind}': ${req} is required by every adapter`);
    }
  }
  return true;
}

/**
 * ONE registry. `register()` is LOUD on a duplicate or a malformed record;
 * `get()` is LOUD on an unknown kind — the core never falls through to a
 * default adapter, exactly as `src/harnesses/index.js` never falls through to
 * claude.
 */
function createChannelRegistry() {
  const mods = new Map();

  function register(mod) {
    if (!mod || typeof mod !== 'object') throw new Error('registerChannelAdapter: a module object is required');
    const kind = mod.kind;
    if (typeof kind !== 'string' || !kind) throw new Error('registerChannelAdapter: `kind` (non-empty string) is required');
    if (mods.has(kind)) throw new Error(`registerChannelAdapter: duplicate kind '${kind}'`);
    validateCaps(kind, mod.caps);
    if (typeof mod.create !== 'function') throw new Error(`channel adapter '${kind}': create(record, deps) is required`);
    // §25: `render: 'blocks'` is DECLARED ⇒ the stored-record rung must exist;
    // a rung nobody declared is refused (it would half-work on read only)
    const blocksDeclared = mod.caps.render === 'blocks';
    if (blocksDeclared && typeof mod.blocksOf !== 'function') throw new Error(`channel adapter '${kind}': caps.render 'blocks' needs blocksOf(record) — the rung for a record stored before its tree existed`);
    if (!blocksDeclared && mod.blocksOf !== undefined) throw new Error(`channel adapter '${kind}': blocksOf is exported but caps.render is not 'blocks'`);
    // inc-muk9jj0j-rel3: the PURE send verdict from held scopes (the engine re-judges every conversation on a credential change)
    if (mod.sendCapsOf !== undefined && (typeof mod.sendCapsOf !== 'function' || !(mod.caps.sendAs || []).length)) throw new Error(`channel adapter '${kind}': sendCapsOf must be a function of the held scopes, on a sendable adapter`);
    // what unlocks SENDING (the window's read-only line): {scopes: [...], console: boolean}
    if (mod.sendGrant !== undefined) {
      const g = mod.sendGrant;
      if (!g || !Array.isArray(g.scopes) || !g.scopes.length || !g.scopes.every((x) => typeof x === 'string' && x) || typeof g.console !== 'boolean') throw new Error(`channel adapter '${kind}': sendGrant must be {scopes: [non-empty strings], console: boolean}`);
      if (!(mod.caps.sendAs || []).length) throw new Error(`channel adapter '${kind}': sendGrant on a read-only adapter (caps.sendAs is empty)`);
    }
    mods.set(kind, mod);
    return mod;
  }

  function get(kind) {
    const m = mods.get(kind);
    if (!m) throw new Error(`channel adapter '${kind}' is not registered (registered: ${[...mods.keys()].join(', ') || 'none'})`);
    return m;
  }
  const has = (kind) => mods.has(kind);
  const list = () => [...mods.values()].map((m) => ({ kind: m.kind, caps: m.caps }));
  const capsOf = (kind) => get(kind).caps;

  /**
   * Instantiate ONE adapter for ONE record and wrap it in the contract:
   * undeclared methods throw `not-supported`, bare throws become typed,
   * `convCaps` is narrowed to `caps`, and `history()` is checked for the two
   * promises it makes (no unasked-for records; `reachedAnchor` present).
   */
  function create(kind, record, deps = {}) {
    const mod = get(kind);
    const caps = mod.caps;
    const impl = mod.create(record, deps) || {};

    const wrap = (name, fn) => async (...args) => {
      try { return await fn(...args); } catch (e) {
        if (e instanceof ChannelError) throw e;
        throw new ChannelError('vendor-error', `${kind}.${name}: ${e && e.message ? e.message : String(e)}`, { retryable: false, detail: { threw: true } });
      }
    };
    const gated = (name, fn) => {
      const gate = METHOD_GATES[name];
      if (gate && !gate(caps)) {
        return async () => {
          // `send` is the ONE carved-out case (§4): on a read-only adapter it
          // is not a failure, it does not exist — and it says so with the
          // reason `caps` gives, so the outbox never builds a proposal.
          if (name === 'send') throw new ChannelError('send-not-available', `${kind}: this adapter is read-only (caps.sendAs is empty)`, { retryable: false, detail: { sendAs: caps.sendAs } });
          throw new ChannelError('not-supported', `${kind}.${name} is not declared by this adapter's caps`, { retryable: false });
        };
      }
      if (typeof fn !== 'function') return async () => { throw new ChannelError('not-supported', `${kind}.${name} is declared but not implemented`, { retryable: false }); };
      return wrap(name, fn);
    };

    const auth = {
      state: wrap('auth.state', (impl.auth && impl.auth.state ? impl.auth.state.bind(impl.auth) : async () => ({ state: 'unknown', why: 'adapter declares no auth state' }))),
      begin: impl.auth && impl.auth.begin ? wrap('auth.begin', impl.auth.begin.bind(impl.auth)) : async () => { throw new ChannelError('not-supported', `${kind}.auth.begin is not implemented`); },
      finish: impl.auth && impl.auth.finish ? wrap('auth.finish', impl.auth.finish.bind(impl.auth)) : async () => { throw new ChannelError('not-supported', `${kind}.auth.finish is not implemented`); },
    };

    const rawConvCaps = gated('convCaps', impl.convCaps && impl.convCaps.bind(impl));
    const rawHistory = gated('history', impl.history && impl.history.bind(impl));
    const rawOlder = gated('older', impl.older && impl.older.bind(impl));

    return {
      kind, caps, record,
      auth,
      listConversations: gated('listConversations', impl.listConversations && impl.listConversations.bind(impl)),
      /** NARROWED to `caps` — the resolution may only shrink the declaration. */
      async convCaps(convId) {
        const r = (await rawConvCaps(convId)) || {};
        const declared = Array.isArray(caps.sendAs) ? caps.sendAs : [];
        const asked = Array.isArray(r.sendAs) ? r.sendAs : [];
        const wider = asked.filter((s) => !declared.includes(s));
        if (wider.length) {
          throw new ChannelError('vendor-error', `${kind}.convCaps returned sendAs wider than caps.sendAs (${wider.join(',')}) — a per-conversation resolution may only NARROW`, { retryable: false, detail: { declared, asked } });
        }
        return { read: r.read || 'unknown', sendAs: asked, why: r.why || null, at: Number.isFinite(r.at) ? r.at : Date.now() };
      },
      /** Checks history's own two promises before the caller ever sees it. */
      async history(convId, opts = {}) {
        // ON A SCAN ADAPTER THE SOURCE IS HANDED DOWN, NEVER RE-DERIVED (r3).
        // `scanState()` in src/channel-caps.js is the ONE resolver of which
        // source is carrying a conversation, and an adapter that reads
        // `caps.scanSources[process.platform]` for itself is a SECOND one —
        // the shipped fake did exactly that, two lines under its own comment
        // saying it never would, which is how records were ingested through a
        // lane the resolver had just declared unavailable. So the contract
        // REQUIRES the resolved source as an argument (`opts.source`, one the
        // adapter's own `historyBySource` names) and refuses to page without
        // it, rather than letting an adapter guess and the chip disagree.
        if (caps.receive === 'scan') {
          const src = opts.source;
          if (!SCAN_SOURCES.includes(src) || !(caps.historyBySource && caps.historyBySource[src])) {
            throw new ChannelError('not-supported', `${kind}.history on a scan adapter needs the RESOLVED source handed down (scanState().source — one of ${Object.keys(caps.historyBySource || {}).join('|')}); got ${JSON.stringify(src === undefined ? null : src)}`, { retryable: false, detail: { needs: 'source' } });
          }
        }
        const r = (await rawHistory(convId, opts)) || {};
        const records = Array.isArray(r.records) ? r.records : [];
        const limit = Number(opts.limit);
        if (Number.isFinite(limit) && records.length > limit) {
          throw new ChannelError('vendor-error', `${kind}.history returned ${records.length} records for limit ${limit} — an adapter never returns records the caller did not ask for`, { retryable: false });
        }
        if (typeof r.reachedAnchor !== 'boolean') {
          throw new ChannelError('vendor-error', `${kind}.history must report reachedAnchor as a boolean (the store decides whether the cursor may advance)`, { retryable: false });
        }
        // `changed` (2026-09-26): OTHER conversations the vendor says gained
        // messages (Gmail's history.list names threads) — a HINT the engine
        // turns into "due now", bounded, never records
        const changed = Array.isArray(r.changed) ? r.changed.filter((x) => typeof x === 'string' && x).slice(0, 2000) : undefined;
        return { records, anchor: r.anchor === undefined ? null : r.anchor, reachedAnchor: r.reachedAnchor, complete: r.complete !== false, ...(changed ? { changed } : {}) };
      },
      /** HISTORY ON DEMAND (2026-09-26): at most `limit` records strictly
       *  OLDER than `before` ({at, vendorId}; null = the newest page), plus
       *  whether the vendor holds nothing older (`exhausted`). Advances
       *  nothing — the caller prepends them to the log. */
      async older(convId, opts = {}) {
        const r = (await rawOlder(convId, opts)) || {};
        const records = Array.isArray(r.records) ? r.records : [];
        const limit = Number(opts.limit);
        if (Number.isFinite(limit) && records.length > limit) {
          throw new ChannelError('vendor-error', `${kind}.older returned ${records.length} records for limit ${limit} — an adapter never returns records the caller did not ask for`, { retryable: false });
        }
        return { records, exhausted: r.exhausted === true };
      },
      send: gated('send', impl.send && impl.send.bind(impl)),
      compose: gated('compose', impl.compose && impl.compose.bind(impl)),
      /** THE ACCOUNT's send identity for a NEW conversation, NARROWED to
       *  `caps.sendAs` exactly like `convCaps` (a resolution may only shrink
       *  the declaration). */
      async composeCaps() {
        const r = (await gated('composeCaps', impl.composeCaps && impl.composeCaps.bind(impl))()) || {};
        const declared = Array.isArray(caps.sendAs) ? caps.sendAs : [];
        const asked = Array.isArray(r.sendAs) ? r.sendAs : [];
        const wider = asked.filter((x) => !declared.includes(x));
        if (wider.length) throw new ChannelError('vendor-error', `${kind}.composeCaps returned sendAs wider than caps.sendAs (${wider.join(',')})`, { retryable: false, detail: { declared, asked } });
        return { sendAs: asked, why: r.why || null, at: Number.isFinite(r.at) ? r.at : Date.now() };
      },
      reconcile: gated('reconcile', impl.reconcile && impl.reconcile.bind(impl)),
      fetchAttachment: gated('fetchAttachment', impl.fetchAttachment && impl.fetchAttachment.bind(impl)),
      scanHost: gated('scanHost', impl.scanHost && impl.scanHost.bind(impl)),
      live: caps.receive === 'push' && impl.live ? impl.live : null,
    };
  }

  return { register, get, has, list, capsOf, create, validateCaps, validateMethods };
}

module.exports = {
  createChannelRegistry, ChannelError, validateCaps, validateMethods,
  CHANNEL_ERROR_CODES, RECEIVE_MODES, SCAN_SOURCES, HISTORY_MODES, SEND_IDENTITIES, IDENTITY_MARKING, TOS_RISK, METHOD_GATES, OLDER_HISTORY, BUDGET_UNITS, PACE_COSTS, RENDER_MODES, TITLE_FORMS,
  retryAfterSeconds, sentSecrets, withoutSent, bearerOf, SENT_SECRET_FIELDS,
};

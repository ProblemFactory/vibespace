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

const RECEIVE_MODES = Object.freeze(['push', 'poll', 'scan']);
const SCAN_SOURCES = Object.freeze(['store', 'ui']);
const HISTORY_MODES = Object.freeze(['page', 'since', 'none']);
const SEND_IDENTITIES = Object.freeze(['user', 'bot']);
const IDENTITY_MARKING = Object.freeze(['none', 'marked', 'unknown']);
const TOS_RISK = Object.freeze(['none', 'stated', 'prohibited']);

/** Which capability each optional method is DECLARED by. A method present
 *  without its declaration is refused at registration; a method CALLED without
 *  its declaration throws `not-supported`. */
const METHOD_GATES = Object.freeze({
  live: (c) => c.receive === 'push',
  scanHost: (c) => c.receive === 'scan',
  fetchAttachment: (c) => c.attachments === 'fetch',
  reconcile: (c) => (c.sendAs || []).length > 0,
  send: (c) => (c.sendAs || []).length > 0,
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
        return { records, anchor: r.anchor === undefined ? null : r.anchor, reachedAnchor: r.reachedAnchor, complete: r.complete !== false };
      },
      send: gated('send', impl.send && impl.send.bind(impl)),
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
  CHANNEL_ERROR_CODES, RECEIVE_MODES, SCAN_SOURCES, HISTORY_MODES, SEND_IDENTITIES, IDENTITY_MARKING, TOS_RISK, METHOD_GATES,
};

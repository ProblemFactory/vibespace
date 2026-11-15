'use strict';
/**
 * WEBSITE LOGINS IN THE VAULT — PURE (lane browser-login, r22 pivot: «agent locates, hub fills»; CJS so the server, the
 * suites and the browser bundle share ONE spelling; imports ONLY `./grant-model.js`).
 *
 *   · THE PRIMITIVE — `vibespace-browser fill <@ref|selector> --vault <entry>/<field>` (`field` = `user | password | previous
 *     | pending | otp`) and `--vault new:<site>[#<user>]/password --generate`. Both standard Chrome and the custom kernel run
 *     the SAME hub-side isolated-world CDP primitive; `vibespace-browser login` and hub-side form/landed-page heuristics are
 *     retired (`login_retired`).
 *   · THREE SLOTS & HUMAN-ONLY PROMOTION («时钟不是人» — a clock never changes which password is current):
 *       - `current`:  `{ password, source, strength, setAt } | null` (`null` only on an unconfirmed `new:` registration)
 *       - `previous`: `{ password, source, strength, replacedAt } | null` (never deleted by time; replaced only on Confirm)
 *       - `pending`:  `{ password, kind: 'register' | 'change', createdAt, remindedAt?, itemId? } | null`
 *     `pending` stays `pending` until the owner clicks Confirm (promotes `pending -> current`, rotates old `current -> previous`,
 *     discards any older `previous`, `rev++`) or Discard (drops an unconfirmed `register` entry, or clears `pending` on a
 *     `change` while keeping `current` and `previous`, `rev++`). Creating `pending` files ONE deduplicated For-you card
 *     (Confirm / Discard); if untouched after 7 days (`PENDING_REMIND_MS`), the hub reminds ONCE (recorded outside the login
 *     entry so reads/lists/fills/unlocks perform 0 vault writes) and never again.
 *     `password` resolves to `current` when `current` exists, and to `pending` when `current` is `null` (unconfirmed `register`).
 *   · SECURITY GATES — browser-truth origin match (`tabOrigin === entry.origin`, HTTPS or localhost HTTP only), top-frame only
 *     (`inFrame` => `login_in_frame`), grant door `browser-login` (`<origin>#<user>`, `<origin>#*`, `*`, or caller-owned entry),
 *     `vault_locked` immediate refusal, live-fill read fence (`409 login_fill_live`), zero digests or login identity on disk
 *     (`RULE 5′`, Shape S: any tab fenced or guarded at Hub restart stays fenced until top-frame navigation).
 */
const GM = require('./grant-model.js');

const PREFIX = 'web-login:';
const DOOR = 'browser-login';
const USER_MAX = 160;
const GENERATED_LEN = 24;     // default-only policy: 24 chars across all 4 character classes
const TEXT_MAX = 900;
const NOTES_MAX = 400;
const PENDING_REMIND_MS = 7 * 86_400_000;   // remind ONCE after 7 days if still unconfirmed, then never again

const VAULT_FIELDS = Object.freeze(['user', 'password', 'previous', 'pending', 'otp']);
const TYPED_SLOTS = Object.freeze(['current', 'password', 'previous', 'pending', 'otp']);
const BY = Object.freeze(['owner', 'agent']);
const SOURCES = Object.freeze(['owner', 'vault-minted', 'agent-typed']);
const STRENGTHS = Object.freeze(['generated', 'unknown']);
const PENDING_KINDS = Object.freeze(['register', 'change']);

/** Every refusal of the primitive road, by name (the routes' STATUS table carries each). */
const REFUSALS = Object.freeze([
  'login_retired',
  'login_in_frame',
  'login_phishing',
  'login_ambiguous',
  'login_not_granted',
  'vault_locked',
  'login_no_entry',
  'login_exists',
  'login_bad_origin',
  'login_bad_user',
  'login_bad_field',
  'login_form_changed',
  'login_fill_live',
  'login_not_pending',
  'login_no_previous',
  'login_no_otp',
  'login_pending_exists',
  'login_fence_unavailable',
  'login_channel_unmediated',
  'login_check_failed',
  'code_paced',
  'target_not_found',
]);

/** Verbs an agent may run while a live vault fill is still unsubmitted on the tab (read verbs stay blocked -> 409 login_fill_live). */
const LIVE_FILL_ALLOW_VERBS = Object.freeze([
  'click', 'dblclick', 'press', 'key', 'keydown', 'keyup', 'focus', 'hover',
  'scroll', 'scrollintoview', 'check', 'uncheck', 'select', 'fill', 'type',
  'open', 'goto', 'navigate', 'back', 'forward', 'reload', 'tab', 'wait',   // lane chrome-157 (round 32, Q3): `tab` = its two ACTS only (liveFillAllowsVerb); `window` is not admitted
  'close', 'stop',
]);

const HOST = '(?:[a-z0-9-]{1,63}(?:\\.[a-z0-9-]{1,63}){0,20}|\\[[0-9a-f:.]{2,45}\\])';
const ORIGIN_SRC = `https?:\\/\\/${HOST}(?::\\d{1,5})?`;
const USER_SRC = '[^\\s#\\u0000-\\u001f\\u007f]{1,160}';
const ORIGIN_RE = new RegExp(`^${ORIGIN_SRC}$`);
/** THE ENTRY NAME (src/server/vault-engine.js SECRET_RE spells the same shape — test-browser-login pins they agree). */
const NAME_RE = new RegExp(`^web-login:(${ORIGIN_SRC})#(${USER_SRC})$`);
const ENTRY_GEN_RE = /^lg-[0-9a-f]{12}$/;
const TOTP_NAME_RE = /^[\w.-]{1,120}$/;
const ITEM_ID_RE = /^[-:\w]{1,80}$/;
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

const CLASSES = Object.freeze([
  'abcdefghijkmnopqrstuvwxyz',
  'ABCDEFGHJKLMNPQRSTUVWXYZ',
  '23456789',
  '!@#$%^&*_-+=?',
]);
const ALL_CHARS = CLASSES.join('');

const LOCKED = 'the vault is locked — the owner has already been told; a person unlocks it on this instance\'s page, and nothing is filled until then (do not ask them to)';
// lane chrome-157 (round 32's persisted hold): THE HOLD REASONS AND WORDS live in the dependency-free src/login-hold-words.js (the
// device agent's bundle carries the record's reader and must not pull this module in); re-exported here beside their sentences
const { HOLD_TOO_MUCH_TEXT, HOLD_UNKNOWN_TYPED, HOLD_VALUE_SHOWN, HOLD_AWAIT_VAULT, HOLD_ENTRY_GONE, HOLD_WORD_OF_REASON, HOLD_WORDS, HOLD_PHASES, isHoldWord } = require('./login-hold-words.js');

const str = (v) => (v === undefined || v === null ? '' : String(v));
const num = (v) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : null);
const no = (code, error, extra = {}) => ({ ok: false, code, error, ...extra });

// ── origins, names, resources ───────────────────────────────────────────────
const BARE_HOST_PORT_HEAD_RE = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*|\[[0-9a-f:.]{2,45}\]):\d{1,5}(?:[#/?]|$)/i;
/** True when `raw` starts with an explicit URL scheme (`https:`, `http:`, `javascript:`, …), NOT a bare `host:<port>` like `localhost:8080`. */
function hasExplicitScheme(raw) {
  const s = str(raw).trim();
  return /^[a-z][a-z0-9+.-]*:/i.test(s) && !BARE_HOST_PORT_HEAD_RE.test(s);
}
/** A page's origin: scheme + host (+ a port that is not the default) — https / http only, never user-info, a path or a query;
 *  a bare host is read as https. → the origin | null. */
function originOf(raw) {
  let s = str(raw).trim();
  if (!s || s.length > 2048 || s === 'null') return null;
  if (!hasExplicitScheme(s)) s = 'https://' + s;
  let u; try { u = new URL(s); } catch { return null; }
  if ((u.protocol !== 'https:' && u.protocol !== 'http:') || u.username || u.password) return null;
  return ORIGIN_RE.test(u.origin) ? u.origin : null;
}
const hostOf = (origin) => { const m = /^https?:\/\/([^/]+?)(?::\d+)?$/.exec(str(origin)); return m ? m[1] : ''; };
const hostPortOf = (origin) => { const m = /^https?:\/\/([^/]+)$/.exec(str(origin)); return m ? m[1] : ''; };
/** https, or http on this machine only (localhost / 127.0.0.1 / [::1] / *.localhost). */
function secureOrigin(origin) {
  const o = originOf(origin);
  if (!o || o !== origin) return false;
  if (o.startsWith('https://')) return true;
  const h = hostOf(o);
  return LOCAL_HOSTS.has(h) || h.endsWith('.localhost');
}
/** Resolve a site token against an optional local HTTP `tabOrigin` when the caller gave a bare `localhost:<port>` host. */
function siteOriginOf(rawSite, tabOrigin = null) {
  const s = str(rawSite).trim();
  if (!s) return null;
  if (!hasExplicitScheme(s) && tabOrigin) {
    const to = originOf(tabOrigin);
    if (to && to.startsWith('http://') && secureOrigin(to)) {
      const lower = s.toLowerCase();
      if (lower === hostPortOf(to).toLowerCase() || lower === hostOf(to).toLowerCase()) return to;
    }
  }
  return originOf(s);
}
/** The name's user: trimmed, lower-cased, ≤ 160, no white space / `#` / control character — and never `*`. */
function userOf(raw) {
  const u = str(raw).trim().toLowerCase();
  return u && u !== '*' && u.length <= USER_MAX && !/[\s#\u0000-\u001f\u007f]/.test(u) ? u : null;
}
/** `web-login:<origin>#<user>` | null. */
function entryName(origin, user) { const o = originOf(origin), u = userOf(user); return o && u ? PREFIX + o + '#' + u : null; }
/** An entry name → {origin, user} | null (the origin must already be canonical). */
function parseName(name) {
  const m = NAME_RE.exec(str(name));
  if (!m) return null;
  return originOf(m[1]) === m[1] && userOf(m[2]) === m[2] ? { origin: m[1], user: m[2] } : null;
}
const isEntryName = (name) => !!parseName(name);
/** The grant resources that may admit a login of `user` on `origin` — its own row, «any account on this site», «any site». */
function grantResources(origin, user) { const o = originOf(origin), u = userOf(user); return o && u ? [`${o}#${u}`, `${o}#*`, '*'] : o ? [`${o}#*`, '*'] : ['*']; }
/** A resource of the browser-login door (the model's own shape — GM.RESOURCE_SHAPES). */
const resourceOk = (r) => GM.resourceShapeOk(DOOR, r);
/** The words a grant scope is said in (the Vault window's 「用于…」 choices). */
function scopeOf(resource) { const r = str(resource); if (r === '*') return 'any-site'; if (/#\*$/.test(r)) return 'any-account'; return resourceOk(r) ? 'this-account' : null; }

// ── 3-slot record (`current` · `previous` · `pending`) & human-only transitions ──
function currentSlotOf(c) {
  if (!c || typeof c !== 'object' || typeof c.password !== 'string' || !c.password || c.password.length > 4096) return null;
  return {
    password: c.password,
    source: SOURCES.includes(c.source) ? c.source : 'owner',
    strength: STRENGTHS.includes(c.strength) ? c.strength : 'unknown',
    setAt: num(c.setAt),
  };
}
function prevSlotOf(p) {
  if (!p || typeof p !== 'object' || typeof p.password !== 'string' || !p.password || p.password.length > 4096) return null;
  return {
    password: p.password,
    source: SOURCES.includes(p.source) ? p.source : 'owner',
    strength: STRENGTHS.includes(p.strength) ? p.strength : 'unknown',
    replacedAt: num(p.replacedAt),
  };
}
function pendingSlotOf(p) {
  if (!p || typeof p !== 'object' || typeof p.password !== 'string' || !p.password || p.password.length > 4096) return null;
  const kind = PENDING_KINDS.includes(p.kind) ? p.kind : null;
  if (!kind) return null;
  const remindedAt = num(p.remindedAt);
  const itemId = typeof p.itemId === 'string' && ITEM_ID_RE.test(p.itemId) ? p.itemId : null;
  return {
    password: p.password,
    kind,
    createdAt: num(p.createdAt),
    ...(remindedAt !== null ? { remindedAt } : {}),
    ...(itemId ? { itemId } : {}),
  };
}

/** The sealed JSON → the 3-slot record (every field checked; `schema: 1` = legacy `.388` shape upgraded in memory only; `schema: 2` = 3-slot shape) | null. */
function recordOf(text) {
  let r; try { r = typeof text === 'string' ? JSON.parse(text) : text; } catch { return null; }
  if (!r || typeof r !== 'object' || r.v !== 1) return null;
  if (r.schema !== undefined && r.schema !== 1 && r.schema !== 2) return null;
  const origin = originOf(r.origin);
  if (!origin || origin !== r.origin || typeof r.username !== 'string' || !r.username || r.username.length > 256) return null;
  const revNum = Number(r.rev);
  const rev = Number.isInteger(revNum) && revNum >= 1 ? revNum : 1;

  const schema = 2;
  let current = null;
  let previous = prevSlotOf(r.previous);
  let pending = null;

  const hasThreeSlotShape = r.schema === 2 || r.current !== undefined || (r.pending && typeof r.pending === 'object');
  if (hasThreeSlotShape) {
    if (r.schema === 1) return null;
    current = currentSlotOf(r.current);
    pending = pendingSlotOf(r.pending);
  } else if (typeof r.password === 'string' && r.password && r.password.length <= 4096) {
    // Legacy `.356`–`.390` flat `v: 1` record compatibility (`{ password, pending?: 'register'|'change', previous? }`).
    // Normalizes in-memory to canonical `schema: 2` so `recordOf(recordOf(x))` is strictly idempotent across all owner doors,
    // while `.390` `pending: 'change'` (`password = new`, `previous = old`) keeps `current = new` + `previous = old` to match `.390`.
    const src = SOURCES.includes(r.source) ? r.source : 'owner';
    const strg = STRENGTHS.includes(r.strength) ? r.strength : 'unknown';
    if (r.pending === 'register') {
      current = null;
      pending = { password: r.password, kind: 'register', createdAt: num(r.createdAt) };
    } else if (r.pending === 'change') {
      current = {
        password: r.password,
        source: src,
        strength: strg,
        setAt: (previous && previous.replacedAt) ?? num(r.submittedAt) ?? num(r.createdAt),
      };
      pending = null;
    } else {
      current = { password: r.password, source: src, strength: strg, setAt: num(r.submittedAt) ?? num(r.createdAt) };
      pending = null;
    }
  } else {
    return null;
  }

  if (!current && !pending) return null;
  if (!current && pending.kind !== 'register') pending = { ...pending, kind: 'register' };
  if (current && pending && pending.kind === 'register') pending = { ...pending, kind: 'change' };

  const primary = current || pending;
  const out = {
    v: 1,
    schema,
    rev,
    origin,
    username: r.username,
    createdAt: num(r.createdAt),
    by: BY.includes(r.by) ? r.by : 'owner',
    source: SOURCES.includes(r.source) ? r.source : (primary.source || 'vault-minted'),
    strength: STRENGTHS.includes(r.strength) ? r.strength : (primary.strength || 'generated'),
    lastUsedAt: num(r.lastUsedAt),
    current,
    previous,
    pending,
  };
  if (typeof r.entryGen === 'string' && ENTRY_GEN_RE.test(r.entryGen)) out.entryGen = r.entryGen;
  const origins = Array.isArray(r.origins) ? r.origins.map(originOf).filter((o) => o && o !== origin).slice(0, 8) : [];
  if (origins.length) out.origins = [...new Set(origins)];
  const totp = TOTP_NAME_RE.test(str(r.totpName)) ? str(r.totpName) : (TOTP_NAME_RE.test(str(r.totp)) ? str(r.totp) : '');
  if (totp) out.totpName = totp;
  if (typeof r.notes === 'string' && r.notes) out.notes = r.notes.slice(0, NOTES_MAX);
  if (r.createdIn && typeof r.createdIn === 'object' && str(r.createdIn.conversation)) {
    out.createdIn = { conversation: str(r.createdIn.conversation).slice(0, 200), at: num(r.createdIn.at) };
  }
  return out;
}

/** The record → the text the vault seals (`v: 1, schema: 2` + top-level `password` mirror so `.388` rollback reads password & totpName). */
function textOf(rec) {
  const r = recordOf(rec);
  if (!r) throw new TypeError('browser-login: not a web-login record');
  const compatPw = r.current ? r.current.password : (r.pending ? r.pending.password : '');
  return JSON.stringify({ ...r, schema: 2, password: compatPw });
}

/** The record as a person's window may list it — every fact (including `rev`), never a password from any of the 3 slots. */
function publicOf(rec) {
  const r = recordOf(rec);
  if (!r) return null;
  const { schema, current, previous, pending, entryGen, ...rest } = r;
  void schema;
  void entryGen;
  return {
    ...rest,
    hasCurrent: !!current,
    hasPrevious: !!previous,
    ...(previous ? { previousReplacedAt: previous.replacedAt } : {}),
    pending: pending ? pending.kind : null,
    ...(pending ? {
      pendingCreatedAt: pending.createdAt,
      ...(pending.remindedAt !== undefined ? { pendingRemindedAt: pending.remindedAt } : {}),
    } : {}),
  };
}

/** Resolve which value a named vault `<field>` (`user | password | previous | pending`) yields on `rec`. */
function resolveSlotValue(rec, field) {
  const r = rec && rec.v === 1 ? rec : recordOf(rec);
  if (!r) return no('login_no_entry', 'that login could not be read from the vault');
  if (field === 'user') return { ok: true, slot: 'user', value: r.username, secret: false };
  if (field === 'password') {
    if (r.current) return { ok: true, slot: 'current', value: r.current.password, secret: true };
    if (r.pending) return { ok: true, slot: 'pending', value: r.pending.password, secret: true };
    return no('login_no_entry', 'that login holds no password');
  }
  if (field === 'pending') {
    if (r.pending) return { ok: true, slot: 'pending', value: r.pending.password, secret: true };
    return no('login_not_pending', 'that login has no pending password waiting for confirmation');
  }
  if (field === 'previous') {
    if (r.previous) return { ok: true, slot: 'previous', value: r.previous.password, secret: true };
    return no('login_no_previous', 'that login has no previous password');
  }
  return no('bad_request', 'vault field must be one of: user, password, previous, pending, otp');
}

/** Extract secret values (`>= minBytes` UTF-8 bytes) from a record across active slots (`current`, `pending`, and optionally `previous`). */
function scrubSecretsOf(rec, { minBytes = 8, includePrevious = true } = {}) {
  const r = rec && rec.v === 1 ? rec : recordOf(rec);
  if (!r) return [];
  const floor = Number.isFinite(Number(minBytes)) && Number(minBytes) > 0 ? Number(minBytes) : 8;
  const raw = [
    r.current && r.current.password,
    r.pending && r.pending.password,
    ...(includePrevious === false ? [] : [r.previous && r.previous.password]),
  ];
  return [...new Set(raw.filter((x) => typeof x === 'string' && Buffer.byteLength(x, 'utf8') >= floor))];
}

/** Mint one random entry generation token (`lg-<12 hex>`) from an injected `rng(n)` byte source. */
function mintEntryGen(rng) {
  if (typeof rng !== 'function') throw new TypeError('browser-login: rng(n) is required');
  const bytes = rng(6);
  if (!bytes || bytes.length < 6) throw new RangeError('browser-login: rng(6) returned fewer than 6 bytes');
  let hex = '';
  for (let i = 0; i < 6; i++) hex += (bytes[i] & 0xff).toString(16).padStart(2, '0');
  return `lg-${hex}`;
}

/** Create a brand-new 3-slot record (`pending === 'register'` seals into `pending` with `current: null`; else seals into `current`). */
function newRecord({ origin, username, password, totpName = null, notes = '', source = 'owner', now = 0, conversation = null, pending = null, itemId = null, rev = 1, entryGen = null } = {}) {
  const revNum = Number(rev);
  const initRev = Number.isInteger(revNum) && revNum >= 1 ? revNum : 1;
  const pw = str(password);
  const src = SOURCES.includes(source) ? source : 'owner';
  const strg = src === 'vault-minted' ? 'generated' : 'unknown';
  const isReg = pending === 'register';
  const r = {
    v: 1,
    schema: 2,
    rev: initRev,
    ...(typeof entryGen === 'string' && ENTRY_GEN_RE.test(entryGen) ? { entryGen } : {}),
    origin: originOf(origin),
    username: str(username).trim(),
    createdAt: now,
    by: src === 'owner' ? 'owner' : 'agent',
    source: src,
    strength: strg,
    lastUsedAt: null,
    ...(totpName ? { totpName } : {}),
    ...(notes ? { notes: str(notes).slice(0, NOTES_MAX) } : {}),
    ...(conversation ? { createdIn: { conversation: str(conversation).slice(0, 200), at: now } } : {}),
    current: isReg ? null : { password: pw, source: src, strength: strg, setAt: now },
    previous: null,
    pending: isReg ? { password: pw, kind: 'register', createdAt: now, ...(itemId ? { itemId } : {}) } : null,
  };
  return recordOf(r);
}

/** Mint a password change into `pending` while keeping `current` and `previous` intact (`409 login_pending_exists` if already pending). */
function mintChangeRecord(rec, password, { now = 0, conversation = null, itemId = null } = {}) {
  const r = recordOf(rec);
  if (!r) return no('login_no_entry', 'that login could not be read from the vault');
  if (r.pending) {
    return no('login_pending_exists', 'this login already has an unconfirmed pending password — ask the owner to confirm or discard it in the Vault window or For you first, or fill it with --vault <entry>/pending');
  }
  const next = recordOf({
    ...r,
    schema: 2,
    rev: r.rev + 1,
    ...(conversation && !r.createdIn ? { createdIn: { conversation: str(conversation).slice(0, 200), at: now } } : {}),
    pending: { password: str(password), kind: 'change', createdAt: now, ...(itemId ? { itemId } : {}) },
  });
  return next ? { ok: true, record: next } : no('invalid_value', 'generated password could not be sealed');
}

/** Owner Confirm («只有人能转正»): promote `pending -> current`, rotate old `current -> previous` (discarding any older `previous`), `rev++`. */
function confirmPendingRecord(rec, { now = 0 } = {}) {
  const r = recordOf(rec);
  if (!r || !r.pending) return no('login_not_pending', 'that login has no pending password to confirm');
  const nextPrevious = r.current
    ? { password: r.current.password, source: r.current.source, strength: r.current.strength, replacedAt: now }
    : null;
  const nextCurrent = {
    password: r.pending.password,
    source: 'vault-minted',
    strength: 'generated',
    setAt: now,
  };
  const next = recordOf({
    ...r,
    schema: 2,
    rev: r.rev + 1,
    source: 'vault-minted',
    strength: 'generated',
    current: nextCurrent,
    previous: nextPrevious,
    pending: null,
  });
  return next
    ? { ok: true, record: next, kind: r.pending.kind, itemId: r.pending.itemId || null }
    : no('key-malformed', 'pending login could not be confirmed');
}

/** Owner Discard: if `current === null` (unconfirmed `register`), drop the entry; if `current !== null` (`change`), clear `pending` and `rev++`. */
function discardPendingRecord(rec) {
  const r = recordOf(rec);
  if (!r || !r.pending) return no('login_not_pending', 'that login has no pending password to discard');
  const itemId = r.pending.itemId || null;
  if (!r.current) {
    return { ok: true, dropEntry: true, record: null, kind: 'register', itemId };
  }
  const next = recordOf({
    ...r,
    schema: 2,
    rev: r.rev + 1,
    pending: null,
  });
  return next
    ? { ok: true, dropEntry: false, record: next, kind: 'change', itemId }
    : no('key-malformed', 'pending password could not be discarded');
}

/** Owner manual update (`addOwn` on an existing login): rotates `current -> previous`, sets new `current`, clears `pending`, `rev++`. */
function ownerUpdatedRecord(rec, password, { totpName = undefined, now = 0 } = {}) {
  const r = recordOf(rec);
  if (!r) return null;
  const prevBase = r.current || (r.pending ? { password: r.pending.password, source: 'vault-minted', strength: 'generated' } : null);
  const sameAsCurrent = Boolean(r.current && r.current.password === password && !r.pending);
  return recordOf({
    ...r,
    schema: 2,
    rev: r.rev + 1,
    by: 'owner',
    source: 'owner',
    strength: 'unknown',
    ...(totpName !== undefined ? { totpName: totpName || undefined } : {}),
    current: { password: str(password), source: 'owner', strength: 'unknown', setAt: now },
    previous: sameAsCurrent ? r.previous : (prevBase ? { password: prevBase.password, source: prevBase.source, strength: prevBase.strength, replacedAt: now } : r.previous),
    pending: null,
  });
}

/** True iff `rec` has an unconfirmed `pending` slot that has been untouched for >= 7 days and has NEVER been reminded yet. */
function shouldRemindPending(rec, now, { alreadyReminded = false } = {}) {
  if (alreadyReminded) return false;
  const r = rec && rec.v === 1 ? rec : recordOf(rec);
  if (!r || !r.pending || r.pending.remindedAt !== undefined) return false;
  if (!Number.isFinite(r.pending.createdAt) || !Number.isFinite(now)) return false;
  return now - r.pending.createdAt >= PENDING_REMIND_MS;
}

/** Canonical identity of one pending episode (`<name>\0<rev>\0<kind>\0<createdAt>`) for external one-shot 7-day reminder tracking. */
function pendingRemindKey(name, rec) {
  const r = rec && rec.v === 1 ? rec : recordOf(rec);
  if (!r || !r.pending || !Number.isFinite(r.pending.createdAt)) return null;
  return `${str(name)}\u0000${r.rev}\u0000${r.pending.kind}\u0000${r.pending.createdAt}`;
}

// ── password generation (default-only: 24 chars, all 4 classes) ─────────────
function pickIndex(rng, max) {
  const limit = 256 - (256 % max);
  for (let tries = 0; tries < 128; tries++) {
    const b = rng(1);
    if (!b || !b.length) break;
    const v = b[0] & 0xff;
    if (v < limit) return v % max;
  }
  throw new Error('browser-login: rng exhausted');
}

/** Generate a 24-character password containing every class in `CLASSES`, using an injected `rng(n)` byte source. */
function generatePassword(rng) {
  if (typeof rng !== 'function') throw new TypeError('browser-login: rng(n) is required');
  const chars = [];
  for (const cls of CLASSES) chars.push(cls[pickIndex(rng, cls.length)]);
  while (chars.length < GENERATED_LEN) chars.push(ALL_CHARS[pickIndex(rng, ALL_CHARS.length)]);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = pickIndex(rng, i + 1);
    const tmp = chars[i];
    chars[i] = chars[j];
    chars[j] = tmp;
  }
  return { ok: true, password: chars.join(''), length: GENERATED_LEN };
}

// ── `--vault <entry>/<field>` spec parser & fill verdict ────────────────────
/** Parse `<entry>/<field>` or `new:<site>[#<user>]/password` into `{ ok: true, isNew, origin, user, name, field, generate }`. */
function parseVaultFillSpec(rawSpec, { user = null, generate = false, tabOrigin = null } = {}) {
  const s = str(rawSpec).trim();
  const slash = s.lastIndexOf('/');
  if (!s || slash <= 0 || slash === s.length - 1) {
    return no('bad_request', 'expected --vault <entry>/<field> (field: user, password, previous, pending, or otp)');
  }
  const head = s.slice(0, slash).trim();
  const field = s.slice(slash + 1).trim().toLowerCase();
  if (!VAULT_FIELDS.includes(field)) {
    return no('bad_request', `unknown vault field "${field}" — expected one of: ${VAULT_FIELDS.join(', ')}`);
  }
  if (generate && field !== 'password') {
    return no('bad_request', '--generate can only be used with the /password field');
  }
  const explicitUser = user !== null && user !== undefined && str(user).trim() !== '' ? userOf(user) : null;
  if (user !== null && user !== undefined && str(user).trim() !== '' && !explicitUser) {
    return no('login_bad_user', 'invalid user name (non-empty, ≤ 160 chars, no spaces or #)');
  }

  if (head.startsWith('new:')) {
    if (!generate) {
      return no('bad_request', 'new:<site>/password requires --generate (or ask the owner to set a password via vibespace-vault request)');
    }
    const rest = head.slice(4).trim();
    const hash = rest.lastIndexOf('#');
    const rawSite = hash >= 0 ? rest.slice(0, hash) : rest;
    const inlineUserRaw = hash >= 0 ? rest.slice(hash + 1) : '';
    const origin = siteOriginOf(rawSite, tabOrigin);
    if (!origin || !secureOrigin(origin)) {
      return no('login_bad_origin', 'give an https origin (http only on localhost)');
    }
    const u = hash >= 0 ? userOf(inlineUserRaw) : explicitUser;
    if (!u || (explicitUser && hash >= 0 && explicitUser !== u)) {
      return no('login_bad_user', 'new:<site>#<user>/password --generate requires a valid user name (in #<user> or --user <name>)');
    }
    return { ok: true, isNew: true, origin, user: u, name: entryName(origin, u), field: 'password', generate: true };
  }

  if (head.startsWith(PREFIX)) {
    const parsed = parseName(head);
    if (!parsed) return no('bad_request', 'malformed web-login:<origin>#<user> entry name');
    if (!secureOrigin(parsed.origin)) return no('login_bad_origin', 'give an https origin (http only on localhost)');
    if (explicitUser && explicitUser !== parsed.user) return no('login_bad_user', '--user disagrees with the #<user> in --vault');
    return { ok: true, isNew: false, origin: parsed.origin, user: parsed.user, name: entryName(parsed.origin, parsed.user), field, generate: !!generate };
  }

  const hash = head.lastIndexOf('#');
  const rawSite = hash >= 0 ? head.slice(0, hash) : head;
  const inlineUserRaw = hash >= 0 ? head.slice(hash + 1) : '';
  const origin = siteOriginOf(rawSite, tabOrigin);
  if (!origin || !secureOrigin(origin)) {
    return no('login_bad_origin', 'give a valid https origin or entry name in --vault <entry>/<field>');
  }
  if (hash >= 0) {
    const u = userOf(inlineUserRaw);
    if (!u || (explicitUser && explicitUser !== u)) return no('login_bad_user', 'invalid #<user> in --vault <entry>/<field>');
    return { ok: true, isNew: false, origin, user: u, name: entryName(origin, u), field, generate: !!generate };
  }
  return {
    ok: true,
    isNew: false,
    origin,
    user: explicitUser,
    name: explicitUser ? entryName(origin, explicitUser) : null,
    field,
    generate: !!generate,
  };
}

function grantWords(code, origin, isNew = false, targetUser = '') {
  if (code === 'excepted') return `the owner left this conversation out of the logins it may use on ${origin} — only they lift that, in the Vault window (Web logins → Use for…)`;
  if (code === 'groups_unreadable') return 'the Task Group list could not be read just now, so no login is filled (never «not in any group») — try again in a moment';
  if (code === 'unknown_shape') return 'a permission row for web logins could not be read, so none is filled — the owner sees it in the Vault window';
  return isNew
    ? `this conversation is not granted «Any account on ${origin}» (or «Any site») to register ${targetUser} — ask the owner under Vault → Web logins → Use for…`
    : `this conversation may not use a saved login on ${origin} — the owner grants it in the Vault window (Web logins → Use for…: this account, any account on this site, or any site)`;
}

/** Pure security verdict for `fill --vault` (gate order M1: vault lock -> entry & grant -> browser origin -> frame/element). */
function fillVerdict({ tabOrigin, inFrame = false, spec, entries = [], grantRows = [], facts = {}, owners = null, vaultState = 'unlocked', skipOrigin = false } = {}) {
  if (!spec || !spec.ok) return spec || no('bad_request', 'invalid --vault specification');
  if (vaultState !== 'unlocked') return no('vault_locked', LOCKED);

  const ownSet = owners instanceof Set ? owners : new Set(Array.isArray(owners) ? owners.filter(Boolean) : []);
  const isOwn = (e) => !!(e && e.owner && ownSet.has(e.owner));
  const checkGrantFor = (targetU) => {
    const resources = grantResources(spec.origin, targetU);
    const rows = typeof grantRows === 'function'
      ? resources.flatMap((r) => { try { return grantRows(r) || []; } catch { return [{ door: DOOR, resource: r, to: null }]; } })
      : (Array.isArray(grantRows) ? grantRows.filter((r) => r && resources.includes(r.resource)) : []);
    return GM.admits(rows, facts);
  };

  let chosen = null;
  let targetUser = spec.user;

  if (spec.isNew) {
    const gNew = checkGrantFor(targetUser);
    if (!gNew.ok) {
      return no('login_not_granted', grantWords(gNew.code, spec.origin, true, targetUser), {
        grant: gNew.code,
        origin: spec.origin,
      });
    }
    const dup = (entries || []).find((e) => e && e.origin === spec.origin && e.user === spec.user);
    if (dup) {
      const unconfirmed = dup.pending === 'register' || (dup.hasPending && !dup.hasCurrent);
      return no(
        'login_exists',
        unconfirmed
          ? `${spec.user} on ${spec.origin} already has an unconfirmed registration in the vault — fill that generated password with --vault ${spec.origin}#${spec.user}/password, or ask the owner to confirm or discard it in the Vault window or For you first`
          : `${spec.user} on ${spec.origin} is already in the vault — fill it with --vault ${spec.origin}#${spec.user}/password`
      );
    }
  } else {
    const onSite = (entries || []).filter((e) => e && (e.origin === spec.origin || (Array.isArray(e.origins) && e.origins.includes(spec.origin))));
    if (spec.user) {
      const exact = onSite.find((e) => e.user === spec.user) || null;
      const gm = exact && isOwn(exact) ? { ok: true } : checkGrantFor(spec.user);
      if (!gm.ok) {
        return no('login_not_granted', grantWords(gm.code || 'no_grant', spec.origin, false, spec.user), {
          grant: gm.code || 'no_grant',
          origin: spec.origin,
        });
      }
      if (!exact) {
        return no(
          'login_no_entry',
          `the vault holds no login for ${spec.user} on ${spec.origin} — ask the owner to set one via a secret card (vibespace-vault request) or register a new account with --vault new:${hostOf(spec.origin)}#<user>/password --generate`
        );
      }
      chosen = exact;
      targetUser = exact.user;
    } else {
      if (!onSite.length) {
        const gmSite = checkGrantFor('');
        if (!gmSite.ok) {
          return no('login_not_granted', grantWords(gmSite.code || 'no_grant', spec.origin, false, ''), {
            grant: gmSite.code || 'no_grant',
            origin: spec.origin,
          });
        }
        return no(
          'login_no_entry',
          `the vault holds no login on ${spec.origin} — ask the owner to set one via a secret card (vibespace-vault request) or register a new account with --vault new:${hostOf(spec.origin)}#<user>/password --generate`
        );
      }
      const admitted = [];
      let firstDeny = null;
      for (const m of onSite) {
        if (isOwn(m)) {
          admitted.push(m);
          continue;
        }
        const gm = checkGrantFor(m.user);
        if (gm.ok) admitted.push(m);
        else if (!firstDeny) firstDeny = gm;
      }
      if (!admitted.length) {
        const denyCode = (firstDeny && firstDeny.code) || 'no_grant';
        return no('login_not_granted', grantWords(denyCode, spec.origin, false, ''), {
          grant: denyCode,
          origin: spec.origin,
        });
      }
      if (admitted.length > 1) {
        const shownUsers = admitted.map((e) => e.user).slice(0, 5).join(', ');
        return no(
          'login_ambiguous',
          `${admitted.length} logins match ${spec.origin} (${shownUsers}) — name the account with #user or --user <name>`
        );
      }
      chosen = admitted[0];
      targetUser = chosen.user;
    }
  }

  if (!skipOrigin) {
    const actualOrigin = originOf(tabOrigin);
    if (!actualOrigin || !secureOrigin(actualOrigin) || actualOrigin !== spec.origin) {
      return no('login_phishing', `the tab is on ${actualOrigin || 'an unverified page'}, not ${spec.origin} — nothing was filled`);
    }
  }

  if (inFrame) {
    return no('login_in_frame', `the target element is inside a frame — open the frame's own address in a top-level tab or ask the owner in live view`);
  }

  return {
    ok: true,
    isNew: !!spec.isNew,
    entry: chosen,
    name: (chosen && chosen.name) || entryName(spec.origin, targetUser),
    origin: spec.origin,
    user: targetUser,
    field: spec.field,
    generate: !!spec.generate,
  };
}

// ── THE CREDENTIAL'S DESTINATION (lane chrome-157, 主开发's L1, 2026-11-15 09:16Z) ─────────────────────────────────────────────
// While a live fill stands, a request carrying the value may go to the filled page's own SITE, not only its exact origin: a form on
// www.<site> posting to auth.<site> is an ordinary login, and blocking it stopped the login with no way out for an agent. «Site» is
// Chrome's OWN registrable domain of the filled document (Page.Frame.domainAndRegistry, computed from Chrome's public-suffix list —
// the tree keeps no list of its own): the same scheme AND a host equal to that domain or under it («.» + it). With no registrable
// domain (an address, localhost, a name under no known suffix) it is the exact origin, as before. The FILL keeps its exact-origin
// rule (the entry's own origin; the phishing refusal and the abort of a fill whose page starts to leave are untouched). PURE.
function credDestinationOk(fillOrigin, site, reqUrl) {
  const reqOrigin = originOf(reqUrl);
  if (!reqOrigin || !fillOrigin) return false;
  if (reqOrigin === fillOrigin) return true;
  const reg = typeof site === 'string' ? site.trim().toLowerCase().replace(/\.$/, '') : '';
  if (!reg || !reg.includes('.')) return false;
  let u, f;
  try { u = new URL(String(reqUrl)); f = new URL(String(fillOrigin)); } catch { return false; }
  if (u.protocol !== f.protocol) return false;
  const under = (h) => { const x = String(h || '').toLowerCase().replace(/\.$/, ''); return x === reg || x.endsWith('.' + reg); };
  return under(f.hostname) && under(u.hostname);   // (the filled page's own host is under it too — Chrome named it for that page)
}

// ── live-fill read fence verdicts ───────────────────────────────────────────
function liveFillAllowsVerb(verb, argv = []) {
  const v = str(verb).trim().toLowerCase();
  if (!LIVE_FILL_ALLOW_VERBS.includes(v)) return false;
  if (v === 'wait') {
    const a = Array.isArray(argv) ? argv.map(String) : [];
    if (a.some((x) => x === '--fn' || x.startsWith('--fn=') || x === '--text' || x.startsWith('--text='))) return false;
  }
  // lane chrome-157 (vault-login round 32): every `tab` form is admitted on a fenced tab — `tab new …`, `tab <id|label>`, `tab close`
  // (主开发 2026-11-15 item 3: closing the tab is the door every hold names; its answer is «Tab closed», nothing of the page) and the
  // LISTING `tab` / `tab list` (L3, 主开发 09:16Z: the agent finds its other tabs; the listing reaches the driver through the mediated
  // CDP door, which names a fenced tab by its id and its address at the fill, never its title — browser-dialogs
  // maskFencedTargetInfos). `window` is not admitted at all: the driver's sub-verbs cannot all be proven free of a read path (its
  // README names only `window new`; a closed binary may carry more).
  return true;
}

function liveFillVerdict({ verb = '', argv = [], batchVerbs = null, origin = '', holdReason = '' } = {}) {
  const v = str(verb).trim().toLowerCase();
  if (v === 'batch') {
    if (Array.isArray(batchVerbs) && batchVerbs.length > 0 && batchVerbs.every((line) => {
      const parts = str(line).trim().split(/\s+/).filter(Boolean);
      return parts.length > 0 && liveFillAllowsVerb(parts[0], parts);
    })) {
      return { ok: true };
    }
  } else if (liveFillAllowsVerb(v, argv)) {
    return { ok: true };
  }
  const site = str(origin || 'this site');
  const cmd = str(verb || 'command');
  if (holdReason === HOLD_UNKNOWN_TYPED) {
    return no(
      'login_fill_live',
      `refused "${cmd}" on ${site} because VibeSpace can no longer verify whether a filled login secret is still on this tab — reload or navigate this tab (a reload of an address too long to check keeps it held: go to another page), or open or switch to another tab (until this tab reloads or navigates, cross-origin requests from this page are blocked)`
    );
  }
  if (holdReason === HOLD_AWAIT_VAULT) {
    return no(
      'login_fill_live',
      `refused "${cmd}" on ${site} — open or switch to another tab: VibeSpace restarted while a filled login secret was on this tab, and it checks this tab again once the vault is unlocked`
    );
  }
  if (holdReason === HOLD_ENTRY_GONE) {
    return no(
      'login_fill_live',
      `refused "${cmd}" on ${site} because what was filled on this tab is no longer in the vault, so VibeSpace cannot check this tab again — open or switch to another tab (closing this tab ends it)`
    );
  }
  if (holdReason === HOLD_VALUE_SHOWN) {
    return no(
      'login_fill_live',
      `refused "${cmd}" on ${site} because the page put the filled login secret into its own address or title — navigate this tab to another page (a reload of this address keeps it refused), or open or switch to another tab (until this tab leaves this page, cross-origin credential requests from it are blocked)`
    );
  }
  if (holdReason === HOLD_TOO_MUCH_TEXT) {
    return no(
      'login_fill_live',
      `refused "${cmd}" while a vault login fill is held on ${site} (the page holds too much text to verify wipe) — reload or navigate this tab, or open or switch to another tab (until this tab reloads or navigates, cross-origin requests from this page are blocked)`
    );
  }
  return no(
    'login_fill_live',
    `refused "${cmd}" while a vault login fill is in progress or unsubmitted on ${site} — wait for the fill to finish and submit the login form (click / press Enter), reload or navigate this tab, or open or switch to another tab (until this tab submits, reloads, or navigates, cross-origin credential requests from this page are blocked)`
  );
}

// ── THE ONE CHECK (lane chrome-157, round 32 — the owner's B; 主开发's look at d8492de27: M3, S2, S3, amendment 4) ─────────────────
// An ordinary site can carry what was typed into its next address or title by itself. PURE: the values the hub holds × the texts
// the agent would read next ⇒ 'shown' | 'clean' | 'unknown' («cannot tell», which holds). Each component is decoded ON ITS OWN and
// leniently (a stray or non-UTF-8 percent sequence spoils nothing else); a value UNDER the mask floor counts only as a WHOLE
// component — a path segment, a query name or value, a fragment field, a decoded base64 piece or one of its JSON string fields —
// or the whole title (主开发's ruling S2: «admin» in an address, a year in a path are not alarms); at or above the floor, anywhere,
// in any of the value's spellings (as typed, encodeURIComponent, the form spelling, encodeURI, JSON-escaped). The caps bound the
// work on the hub's loop (measured, amendment 4); past one the answer is 'unknown'.
const CHECK_TEXT_CAP = 65536;    // characters per text
const CHECK_PIECE_CAP = 256;     // base64-looking pieces per verdict
const CHECK_NODE_CAP = 4096;     // JSON string fields walked per verdict
const TD = typeof TextDecoder === 'function' ? new TextDecoder('utf-8', { fatal: false }) : null;
const TE = typeof TextEncoder === 'function' ? new TextEncoder() : null;
const lenientDecode = (x) => String(x).replace(/(?:%[0-9A-Fa-f]{2})+/g, (run) => {
  if (!TD) return run;
  const bytes = Uint8Array.from(run.match(/%[0-9A-Fa-f]{2}/g).map((h) => parseInt(h.slice(1), 16)));
  return TD.decode(bytes);
});
const b64Decode = (tok) => {
  try {
    let t = String(tok).replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
    while (t.length % 4) t += '=';
    const bin = atob(t);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return TD ? TD.decode(bytes) : bin;
  } catch { return null; }
};
const spellingsOf = (v) => {
  const out = new Set([v]);
  try { const c = encodeURIComponent(v); out.add(c); out.add(c.replace(/%20/g, '+')); } catch { /* */ }
  try { out.add(encodeURI(v)); } catch { /* */ }
  try { out.add(new URLSearchParams([['a', v]]).toString().slice(2)); } catch { /* */ }
  try { out.add(JSON.stringify(v).slice(1, -1)); } catch { /* */ }
  return [...out].filter(Boolean);
};
function valueShownVerdict(values, texts, { floor = 8, textCap = CHECK_TEXT_CAP, pieceCap = CHECK_PIECE_CAP, nodeCap = CHECK_NODE_CAP } = {}) {
  const vals = [...new Set((Array.isArray(values) ? values : []).filter((v) => typeof v === 'string' && v))];
  if (!vals.length) return 'clean';
  const byteLen = (v) => (TE ? TE.encode(v).length : v.length);
  const long = vals.filter((v) => byteLen(v) >= floor), short = vals.filter((v) => byteLen(v) < floor);
  const hay = [], comps = new Set();
  let capped = false, pieces = 0, nodes = 0;
  const addComp = (c) => { const x = String(c); if (x) { comps.add(x); const t = x.trim(); if (t) comps.add(t); } };
  const walk = (o, depth) => {
    if (capped || depth > 6) return;
    if (typeof o === 'string') { if (++nodes > nodeCap) { capped = true; return; } addComp(o); hay.push(o); return; }
    if (typeof o === 'number') { addComp(String(o)); return; }
    if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) { addComp(k); walk(v, depth + 1); if (capped) return; }
  };
  const piecesOf = (x) => {
    for (const tok of (String(x).match(/[A-Za-z0-9+/_-]{8,}={0,2}/g) || [])) {
      if (++pieces > pieceCap) { capped = true; return; }
      const d = b64Decode(tok);
      if (d == null || !d) continue;
      hay.push(d); addComp(d);
      try { walk(JSON.parse(d), 0); } catch { /* not JSON */ }
    }
  };
  for (const raw of (Array.isArray(texts) ? texts : [])) {
    if (raw == null || raw === '') continue;
    const t = String(raw);
    if (t.length > textCap) { capped = true; continue; }
    const isAddress = /^[a-z][a-z0-9+.-]*:/i.test(t);
    const dec = lenientDecode(t), decPlus = lenientDecode(t.replace(/\+/g, ' '));
    hay.push(t, dec, decPlus);
    if (isAddress) {
      for (const part of t.split(/[/?#&=;]/)) { if (!part) continue; addComp(part); addComp(lenientDecode(part)); addComp(lenientDecode(part.replace(/\+/g, ' '))); }
    } else {
      addComp(t);   // (a title: whole)
    }
    piecesOf(t); if (dec !== t) piecesOf(dec);
    if (capped) break;
  }
  for (const v of long) { const sp = spellingsOf(v); if (hay.some((h) => sp.some((f) => h.includes(f)))) return 'shown'; }
  for (const v of short) if (comps.has(v)) return 'shown';
  return capped ? 'unknown' : 'clean';
}

/** Pure Law 1 verdict after checking active post-lift guards on a tab: a `postLiftHeld` fence lifts ONLY when every guard that armed
 *  it was genuinely checked on this pass and verified clean; otherwise it converts to `HOLD_UNKNOWN_TYPED` until navigation. (A guard
 *  belongs to its document — an address move inside it retires none — so nothing but a check counts.) */
function postLiftOutcomeVerdict({ postLiftHeld = false, heldGuardIds = [], checkedGuardIds = [], refilledGuardIds = [], anyTooMuch = false } = {}) {
  const checked = new Set(Array.isArray(checkedGuardIds) ? checkedGuardIds : []);
  const held = Array.isArray(heldGuardIds) ? heldGuardIds.filter((x) => x != null) : [];
  const refilled = Array.isArray(refilledGuardIds) ? refilledGuardIds.filter((x) => x != null) : [];
  const unverifiedHeld = Boolean(postLiftHeld) && (
    held.length > 0 ? held.some((id) => !checked.has(id)) : checked.size === 0
  );
  if (unverifiedHeld) {
    return { action: 'hold_unknown', holdReason: HOLD_UNKNOWN_TYPED, heldGuardIds: [] };
  }
  if (refilled.length > 0) {
    return {
      action: 'rearm_held',
      holdReason: anyTooMuch ? HOLD_TOO_MUCH_TEXT : '',
      heldGuardIds: [...new Set(refilled)],
    };
  }
  if (postLiftHeld) {
    return { action: 'lift_verified_empty', holdReason: '', heldGuardIds: [] };
  }
  return { action: 'allow', holdReason: '', heldGuardIds: [] };
}

// ── closed-set agent & owner words ──────────────────────────────────────────
/** Agent-facing line for `fill --vault` (and refusals). Pinned by `test-peer-text-census.mjs`. */
function loginText(r) {
  if (!r || typeof r !== 'object') return '';
  if (!r.ok) return str(r.error) || 'the vault field was not filled';
  const site = `${str(r.origin)}${r.user ? ` (${r.user})` : ''}`;
  const target = r.target ? ` into ${str(r.target).slice(0, 80)}` : '';
  const receipt = r.receipt ? ` Receipt ${r.receipt}.` : '';
  if (r.generated) {
    const kindWord = r.pending === 'register'
      ? `created a pending login with a ${GENERATED_LEN}-character password`
      : `generated a ${GENERATED_LEN}-character pending password (current password kept until the owner confirms)`;
    return `Filled ${str(r.field || 'password')}${target} on ${site}: the vault ${kindWord} — VibeSpace never hands you the value.${receipt} Submit the form next; if the site rejects the generated password's format, ask the owner to set a password by hand via a secret card (vibespace-vault request) and discard the pending one.`;
  }
  return `Filled ${str(r.field || 'password')}${target} on ${site} from the vault — VibeSpace never hands you the value.${receipt}`;
}

const fillTpl = (s, p) => String(s).replace(/\{(\w+)\}/g, (m, k) => (p && p[k] !== undefined ? String(p[k]) : m));

const NOTICE = Object.freeze({
  'agent-typed': {
    text: 'An agent signed up {user} on {site} with a password it typed itself — saved to the vault, marked «typed by the agent»',
    detail: 'The vault did not make this password, so its strength is unknown and the agent knows it. It is in the Vault under Web logins — change it on the site if you want one only the vault knows.',
  },
  'pending-register': {
    text: 'Confirm new account {user} on {site}?',
    detail: 'An agent generated a password in the vault for {user} on {site} (VibeSpace never handed it to the agent). Confirm promotes it to current; Discard removes this unconfirmed entry.',
  },
  'pending-change': {
    text: 'Confirm new password for {user} on {site}?',
    detail: 'An agent generated a replacement password in the vault for {user} on {site}. Confirm promotes it to current and keeps the old password in previous; Discard drops the candidate and keeps current unchanged.',
  },
  'pending-remind': {
    text: 'Reminder: {user} on {site} still has an unconfirmed password in the vault',
    detail: 'Only a person promotes a pending password — confirm or discard it here or in Vault → Web logins.',
  },
  'cross-origin-blocked': {
    text: 'Blocked a cross-origin request carrying a vault credential for {user} on {site}',
    detail: 'A page on {site} attempted to send a vault-filled credential to {dest}; VibeSpace blocked the request before it left the browser.',
  },
  'takeover-save-dropped': {
    text: 'Sign-in on {site} was not offered to the vault ({why})',
    detail: 'You submitted a password during takeover, but no save-login card could be created. Add or update the login manually in Vault → Web logins if you want VibeSpace to keep it.',
  },
});

const TAKEOVER_DROP_WHY_KEYS = Object.freeze({
  'missing credential': 'missing credential',
  'not an https site': 'not an https site',
  'missing username or password': 'missing username or password',
  'missing username': 'missing username',
});

function noticeWords(state, { origin = '', username = '', conversation = '', targetOrigin = '', why = '' } = {}) {
  const w = NOTICE[state];
  if (!w) return null;
  const site = hostOf(origin) || str(origin).slice(0, 120) || 'this page';
  const dest = hostOf(targetOrigin) || str(targetOrigin).slice(0, 120) || 'another site';
  const whyStr = str(why).slice(0, 120) || 'missing username';
  const whyKey = Object.prototype.hasOwnProperty.call(TAKEOVER_DROP_WHY_KEYS, whyStr) ? TAKEOVER_DROP_WHY_KEYS[whyStr] : null;
  const params = { user: str(username).slice(0, 120), site, dest, why: whyStr };
  const i18nParams = whyKey ? { ...params, why: { key: whyKey } } : params;
  const conv = str(conversation).slice(0, 80);
  return {
    text: fillTpl(w.text, params) + (conv ? ` — ${conv}` : ''),
    detail: fillTpl(w.detail, params),
    i18n: { text: { key: w.text, params: i18nParams }, detail: [{ key: w.detail, params: i18nParams }] },
  };
}

module.exports = {
  PREFIX, DOOR, USER_MAX, GENERATED_LEN, TEXT_MAX, NOTES_MAX, PENDING_REMIND_MS,
  VAULT_FIELDS, TYPED_SLOTS, BY, SOURCES, STRENGTHS, PENDING_KINDS, REFUSALS, LIVE_FILL_ALLOW_VERBS,
  NAME_RE, ORIGIN_RE, ENTRY_GEN_RE, CLASSES, NOTICE,
  valueShownVerdict, CHECK_TEXT_CAP, CHECK_PIECE_CAP, CHECK_NODE_CAP, credDestinationOk,
  LOCKED, HOLD_TOO_MUCH_TEXT, HOLD_UNKNOWN_TYPED, HOLD_VALUE_SHOWN, HOLD_AWAIT_VAULT, HOLD_ENTRY_GONE, HOLD_WORD_OF_REASON, HOLD_WORDS, HOLD_PHASES, isHoldWord,
  hasExplicitScheme, originOf, hostOf, siteOriginOf, secureOrigin, userOf, entryName, parseName, isEntryName, grantResources, resourceOk, scopeOf,
  recordOf, textOf, publicOf, resolveSlotValue, scrubSecretsOf, mintEntryGen,
  newRecord, mintChangeRecord, confirmPendingRecord, discardPendingRecord, ownerUpdatedRecord,
  shouldRemindPending, pendingRemindKey,
  generatePassword, parseVaultFillSpec, fillVerdict,
  liveFillAllowsVerb, liveFillVerdict, postLiftOutcomeVerdict,
  loginText, noticeWords,
};

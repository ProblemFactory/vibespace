'use strict';
/**
 * TWO-STEP CODES (TOTP) — PURE (imports nothing; the HMAC is INJECTED: `hmac(algorithm, keyBytes, msgBytes) → bytes`,
 * node:crypto's createHmac on the hub — src/server/vault-totp.js). Design q-047 §2 (lane vault-totp, 2026-10-20 — the
 * owner: 「哦还有个 TOTP 也可以支持一下」).
 *
 *   · THE ENTRY is the vault's own secret `totp:<name>` (src/server/vault-engine.js SECRET_RE) — its value ONE line of JSON
 *     `{ v: 1, seed, digits, period, algorithm, issuer, account, addedAt, source }` (`seed` = the base32 text: upper case,
 *     no spaces, no padding), sealed whole like every entry.
 *   · THE CODE (RFC 6238 over RFC 4226): `totp(key, { now, period, digits, algorithm, hmac })` → { code, step, secondsLeft,
 *     period }. A person reads the code with no 「验证是你」 and an authorized agent uses it; THE SEED and the entry's settings
 *     leave the hub only through the reveal door (the second password again — owner decision ① as amended 2026-10-20: as
 *     the otpauth link `uriOf`), never to an agent.
 *   · `parseOtpauth(uri)` reads an `otpauth://totp/…` link (an authenticator's export, a QR code's text); `hotp` is refused by
 *     name (a counter the hub would have to keep in step with the site).
 *   · THE GRANTS (`grantOf`, `useVerdict`): a person grants an entry's CODE to a running conversation (`session:<id>`, held
 *     for THAT RUN — `run` = its session token's digest) or a Task Group (`group:<id>`); nothing else opens the agent door.
 *   · `verify(key, code, { now, window })` is ±window steps — kept for a later sign-in door, wired to none (design §1.3).
 *   · THE ADD DIALOG'S MODEL (`addPlanOf`, lane vault-totp-add — the Vault window's 添加… ▸ 两步验证…): what the dialog holds →
 *     the body POST /api/vault/totp takes, the link's facts shown read-only, the name it would take — or a refusal by name
 *     with the field it is about. It computes no code: the PREVIEW is the hub's (the route's `preview`, nothing stored).
 * Refused by name, never trimmed. The gate: scripts/test-totp.mjs (RFC 6238 appendix B, RFC 4226 appendix D, the base32
 * edges, the otpauth forms, the clock rows).
 */
const ALGORITHMS = Object.freeze(['SHA1', 'SHA256', 'SHA512']);
const DIGITS_MIN = 6, DIGITS_MAX = 8;
const PERIOD_MIN = 15, PERIOD_MAX = 120;
const SEED_MIN_BYTES = 10;    // 80 bits — the shortest seed in common use (RFC 4226 asks 128; older sites hand out 80)
const SEED_MAX_BYTES = 128;
const TEXT_MAX = 120;         // an issuer's / an account's words
const NAME_RE = /^[\w.-]{1,120}$/;
const ENTRY_PREFIX = 'totp:';
const SOURCES = Object.freeze(['paste', 'manual', 'qr', 'agent-put']);
const SUBJECT_RE = /^(?:session:[\w.:-]{1,200}|group:[\w.:-]{1,120})$/;   // src/automation-keys.js SUBJECT_RE less `everyone:*` and `external`
const GRANT_ID_RE = /^tg-[0-9a-f]{12}$/;
const RUN_RE = /^[0-9a-f]{24}$/;
const VIEW_PACE_MAX = 20;     // a person's code views a minute, per sign-in (src/vault-inventory.js paceVerdict) …
const VIEW_PACE_CEILING = 60; // … and for the whole vault
const USE_PACE_MAX = 20;      // an agent's code answers a minute, per conversation
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' + '234567';   // the RFC 4648 alphabet
const named = (code, why = null) => ({ ok: false, code, ...(why ? { why } : {}) });
const clip = (v, n = 80) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, n);

// ── base32 (RFC 4648) ──
/** A seed as people paste it (spaces, dashes, lower case, padding) → { ok, bytes: Uint8Array, text } (text = the canonical
 *  form the entry keeps) | { ok: false, code: 'bad_seed', why }. A length no encoder makes (1, 3 or 6 past a multiple of 8)
 *  is a character missing or extra — refused, never guessed. */
function base32Decode(input) {
  const s = String(input == null ? '' : input).replace(/[\s-]+/g, '').toUpperCase().replace(/=+$/, '');
  if (!s) return named('bad_seed', 'the seed is empty');
  if (!/^[A-Z2-7]+$/.test(s)) return named('bad_seed', 'a seed is base32: the letters A–Z and the digits 2–7');
  if ([1, 3, 6].includes(s.length % 8)) return named('bad_seed', 'the seed is cut short — a character is missing or extra');
  const out = new Uint8Array(Math.floor((s.length * 5) / 8));
  let acc = 0, bits = 0, n = 0;
  for (let i = 0; i < s.length; i++) {
    acc = ((acc << 5) | B32.indexOf(s[i])) & 0xfff;   // never more than 12 live bits
    bits += 5;
    if (bits >= 8) { bits -= 8; out[n++] = (acc >> bits) & 0xff; }
  }
  return { ok: true, bytes: out, text: s };
}
/** bytes → base32 text (no padding). */
function base32Encode(bytes) {
  let out = '', acc = 0, bits = 0;
  for (const b of bytes || []) { acc = ((acc << 8) | (b & 0xff)) & 0xffff; bits += 8; while (bits >= 5) { bits -= 5; out += B32[(acc >> bits) & 31]; } }
  if (bits > 0) out += B32[(acc << (5 - bits)) & 31];
  return out;
}

// ── the codes ──
/** RFC 4226: the counter's 8 bytes big-endian through the HMAC, dynamic truncation, `digits` decimal digits. */
function hotp(key, counter, { digits = 6, algorithm = 'SHA1', hmac } = {}) {
  let c = Number(counter);
  if (!Number.isSafeInteger(c) || c < 0) throw new RangeError('hotp: the counter is a whole number ≥ 0');
  if (typeof hmac !== 'function') throw new TypeError('hotp: the hmac is injected');
  const msg = new Uint8Array(8);
  for (let i = 7; i >= 0; i--) { msg[i] = c % 256; c = Math.floor(c / 256); }
  const h = hmac(algorithm, key, msg);
  const o = h[h.length - 1] & 0x0f;
  const bin = (h[o] & 0x7f) * 2 ** 24 + h[o + 1] * 2 ** 16 + h[o + 2] * 2 ** 8 + h[o + 3];
  return String(bin % 10 ** digits).padStart(digits, '0');
}
/** RFC 6238: the step = ⌊(now/1000 − t0) / period⌋. → { code, step, secondsLeft (1…period), period }. */
function totp(key, { now = 0, period = 30, digits = 6, algorithm = 'SHA1', hmac, t0 = 0 } = {}) {
  const secs = Math.floor(Number(now) / 1000) - t0;
  const step = Math.floor(secs / period);
  return { code: hotp(key, step, { digits, algorithm, hmac }), step, secondsLeft: period - (secs - step * period), period };
}
/** ±`window` steps (≤ 10) around now, every step compared whole (no early exit). → { ok, delta } | { ok: false, code }. */
function verify(key, code, { now = 0, window = 1, period = 30, digits = 6, algorithm = 'SHA1', hmac } = {}) {
  const want = String(code == null ? '' : code).replace(/\s+/g, '');
  if (want.length !== digits || !/^\d+$/.test(want)) return named('bad_code');
  const w = Math.max(0, Math.min(10, Math.floor(Number(window) || 0)));
  const { step } = totp(key, { now, period, digits, algorithm, hmac });
  let hit = null;
  for (let d = -w; d <= w; d++) {
    if (step + d < 0) continue;
    const c = hotp(key, step + d, { digits, algorithm, hmac });
    let diff = 0;
    for (let i = 0; i < digits; i++) diff |= c.charCodeAt(i) ^ want.charCodeAt(i);
    if (diff === 0 && hit === null) hit = d;
  }
  return hit === null ? named('wrong_code') : { ok: true, delta: hit };
}

// ── the entry's value ──
/** digits / period / algorithm as typed or linked → the entry's settings | a named refusal. */
function configOf({ digits = 6, period = 30, algorithm = 'SHA1' } = {}) {
  const d = typeof digits === 'string' && !/^\d+$/.test(digits) ? NaN : Number(digits);
  const p = typeof period === 'string' && !/^\d+$/.test(period) ? NaN : Number(period);
  const a = String(algorithm == null ? '' : algorithm).toUpperCase().replace(/-/g, '');
  if (!Number.isInteger(d) || d < DIGITS_MIN || d > DIGITS_MAX) return named('bad_digits', `a code is ${DIGITS_MIN} to ${DIGITS_MAX} digits`);
  if (!Number.isInteger(p) || p < PERIOD_MIN || p > PERIOD_MAX) return named('bad_period', `the period is ${PERIOD_MIN} to ${PERIOD_MAX} seconds`);
  if (!ALGORITHMS.includes(a)) return named('bad_algorithm', `the algorithm is ${ALGORITHMS.join(', ')}`);
  return { ok: true, digits: d, period: p, algorithm: a };
}
function textOf(v, what) {
  const s = String(v == null ? '' : v).trim();
  if (s.length > TEXT_MAX) return named('bad_text', `the ${what} is longer than ${TEXT_MAX} characters`);
  if (/[\u0000-\u001f\u007f]/.test(s)) return named('bad_text', `the ${what} holds a control character`);
  return { ok: true, text: s };
}
/** A seed + its settings (typed, or read off a link) → { ok, value } — the record the entry seals | a named refusal. */
function valueOf(input = {}, { now = 0, source = 'manual' } = {}) {
  const b = input && typeof input === 'object' ? input : {};
  const seed = base32Decode(b.seed);
  if (!seed.ok) return seed;
  const n = seed.bytes.length;
  seed.bytes.fill(0);
  if (n < SEED_MIN_BYTES) return named('seed_too_short', `a seed is at least ${SEED_MIN_BYTES} bytes (${Math.ceil((SEED_MIN_BYTES * 8) / 5)} base32 characters)`);
  if (n > SEED_MAX_BYTES) return named('bad_seed', `a seed is at most ${SEED_MAX_BYTES} bytes`);
  const cfg = configOf({ digits: b.digits == null ? 6 : b.digits, period: b.period == null ? 30 : b.period, algorithm: b.algorithm == null ? 'SHA1' : b.algorithm });
  if (!cfg.ok) return cfg;
  const issuer = textOf(b.issuer, 'issuer');
  if (!issuer.ok) return issuer;
  const account = textOf(b.account, 'account');
  if (!account.ok) return account;
  const at = Math.floor(Number(now));
  return { ok: true, value: { v: 1, seed: seed.text, digits: cfg.digits, period: cfg.period, algorithm: cfg.algorithm, issuer: issuer.text, account: account.text, addedAt: at > 0 ? at : null, source: SOURCES.includes(source) ? source : 'manual' } };
}
/** The entry's sealed text → the record | null (anything else is not a two-step entry). */
function recordOf(text) {
  let r = null;
  try { r = JSON.parse(String(text)); } catch { return null; }
  if (!r || typeof r !== 'object' || r.v !== 1) return null;
  const v = valueOf(r, { now: r.addedAt || 0, source: r.source });
  return v.ok && v.value.seed === r.seed ? { ...v.value, addedAt: Number.isFinite(r.addedAt) && r.addedAt > 0 ? r.addedAt : null } : null;
}

// ── the otpauth link ──
const OTPAUTH_RE = /^otpauth:\/\/([^/?#]*)\/([^?#]*)(?:\?([^#]*))?(?:#.*)?$/i;
/** `otpauth://totp/<issuer>:<account>?secret=…&issuer=…&digits=…&period=…&algorithm=…` → valueOf's answer (the issuer
 *  parameter wins over the label's). A hotp link ⇒ hotp_unsupported; no secret ⇒ bad_seed. */
function parseOtpauth(uri, { now = 0, source = 'paste' } = {}) {
  const s = String(uri == null ? '' : uri).trim();
  if (s.length > 2048) return named('bad_uri', 'that is too long to be an otpauth link');
  const m = OTPAUTH_RE.exec(s);
  if (!m) return named('bad_uri', 'not an otpauth:// link');
  const type = m[1].toLowerCase();
  if (type === 'hotp') return named('hotp_unsupported', 'a counter-based (HOTP) code is not supported — only time-based (TOTP)');
  if (type !== 'totp') return named('bad_uri', `an otpauth link of type "${clip(type, 20)}" — only totp`);
  const dec = (x, plus) => { try { return decodeURIComponent(plus ? x.replace(/\+/g, ' ') : x); } catch { return null; } };
  const label = dec(m[2], false);
  if (label === null) return named('bad_uri', 'the link\'s label is not valid percent-encoding');
  const q = Object.create(null);
  for (const part of (m[3] || '').split('&')) {
    if (!part) continue;
    const i = part.indexOf('=');
    const k = dec(i < 0 ? part : part.slice(0, i), true), v = dec(i < 0 ? '' : part.slice(i + 1), true);
    if (k === null || v === null) return named('bad_uri', 'the link\'s parameters are not valid percent-encoding');
    const key = k.toLowerCase();
    if (!(key in q)) q[key] = v;
  }
  if (!q.secret) return named('bad_seed', 'the link carries no secret');
  const c = label.indexOf(':');
  const fromLabel = c >= 0 ? label.slice(0, c).trim() : '';
  const account = (c >= 0 ? label.slice(c + 1) : label).trim();
  const issuer = q.issuer != null && q.issuer.trim() !== '' ? q.issuer.trim() : fromLabel;
  return valueOf({ seed: q.secret, digits: q.digits == null ? 6 : q.digits, period: q.period == null ? 30 : q.period, algorithm: q.algorithm == null ? 'SHA1' : q.algorithm, issuer, account }, { now, source });
}
/** The record → its otpauth link (the reveal door's ONE value: the seed and every setting, importable by any authenticator). */
function uriOf(value, name = '') {
  const v = value || {};
  const enc = encodeURIComponent;
  const who = v.account || name || 'code';
  const label = v.issuer ? `${enc(v.issuer)}:${enc(who)}` : enc(who);
  return `otpauth://totp/${label}?secret=${v.seed}${v.issuer ? `&issuer=${enc(v.issuer)}` : ''}&algorithm=${v.algorithm}&digits=${v.digits}&period=${v.period}`;
}

// ── names ──
/** The default name from the issuer + the account's local part (`GitHub` + `owner@example.com` → `github-owner`). */
function nameOf(issuer, account) {
  const slug = (x) => String(x == null ? '' : x).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^[-.]+|[-.]+$/g, '');
  const local = String(account == null ? '' : account).split('@')[0];
  const n = [slug(issuer), slug(local)].filter(Boolean).join('-').slice(0, 120).replace(/[-.]+$/, '');
  return n || 'code';
}
const entryOf = (name) => (NAME_RE.test(String(name == null ? '' : name)) ? ENTRY_PREFIX + name : null);
const nameOfEntry = (entry) => { const s = String(entry == null ? '' : entry); return s.startsWith(ENTRY_PREFIX) && NAME_RE.test(s.slice(ENTRY_PREFIX.length)) ? s.slice(ENTRY_PREFIX.length) : null; };

// ── the grants ──
/** A stored grant row → the row (named fields only) | null. A conversation's grant names its run; a Task Group's none. */
function grantOf(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const subject = String(raw.subject || ''), session = subject.startsWith('session:');
  if (!GRANT_ID_RE.test(String(raw.id || '')) || !nameOfEntry(raw.entry) || !SUBJECT_RE.test(subject)) return null;
  if (session ? !RUN_RE.test(String(raw.run || '')) : raw.run != null) return null;
  const at = Number(raw.at);
  return { id: raw.id, entry: raw.entry, subject, at: Number.isFinite(at) && at > 0 ? Math.floor(at) : null, by: clip(raw.by, 60) || 'user', run: session ? raw.run : null };
}
/** May THIS caller have THIS entry's code now? `caller` = { conversationId, groups, run } (the vsst_'s conversation, its
 *  Task Groups, its token's digest, `live` false = a view, not a running conversation). Locked first (a locked vault answers
 *  nothing), then the grant: its conversation in THIS run, or one of its Task Groups. → { ok, grant } | { ok: false, code }. */
function useVerdict({ grants = [], entry = '', caller = null, vaultState = 'locked', owner = null } = {}) {
  if (vaultState === 'not_set_up') return named('vault_not_set_up');
  if (vaultState !== 'unlocked') return named('vault_locked');
  if (!caller || !caller.conversationId) return named('unauthorized', 'the calling conversation has no id yet — send it one message first');
  if (caller.live === false) return named('not_running');
  // lane vault-agent-own: an entry the CALLER added itself (`vibespace-vault totp add` — its `owner` is one of the caller's ids:
  // the durable conversation id a resume keeps, or its registered one) is its own — no grant, in this run or a later one
  if (typeof owner === 'string' && owner !== '' && [caller.scope, ...(caller.conv !== undefined ? [caller.conv] : [caller.conversationId])].includes(owner)) return { ok: true, grant: { subject: 'own' }, own: true };   // `conv` = the fork-safe durable id: a pending fork borrows its parent's conversationId
  const subject = `session:${caller.conversationId}`;
  const groups = (Array.isArray(caller.groups) ? caller.groups : []).map((g) => `group:${g}`);
  const g = (grants || []).find((x) => x && x.entry === entry && ((x.subject === subject && !!x.run && x.run === caller.run) || (x.subject.startsWith('group:') && groups.includes(x.subject))));
  return g ? { ok: true, grant: g } : named('not_granted');
}

// ── the add dialog's model (lane vault-totp-add — design q-047 §3's mock: ONE dialog, TWO ways in) ──
/** The standard (RFC 6238 and every authenticator's default) — the 输入密钥 way's 高级 starts here. */
const ADD_DEFAULTS = Object.freeze({ digits: 6, period: 30, algorithm: 'SHA1' });
/** 高级's choices (a link may carry any setting configOf takes; the typed way offers the ones sites hand out). */
const ADD_CHOICES = Object.freeze({ digits: Object.freeze([6, 8]), period: Object.freeze([30, 60]), algorithm: ALGORITHMS });
const ADD_WAYS = Object.freeze(['link', 'seed']);
/** What the dialog holds → { ok, way, facts: { issuer, account, digits, period, algorithm }, name, body } (`body` = POST
 *  /api/vault/totp's — the caller adds `preview`) | { ok: false, code, why?, field: 'uri' | 'seed' | 'settings' | 'name', facts? }.
 *  `way` 'link' = 粘贴 otpauth 链接: the link's own issuer / account / settings are the FACTS, the name defaults to them
 *  (nameOf); 'seed' = 输入密钥: the seed (base32 — spaces, dashes, lower case and padding tolerated), its settings (the
 *  standard's when left empty) and a NAME — required, never guessed. A name a person typed always wins. */
function addPlanOf({ way = 'link', uri = '', seed = '', name = '', digits = null, period = null, algorithm = null } = {}, { now = 0 } = {}) {
  const typed = String(name == null ? '' : name).trim();
  const nameVerdict = (n) => (!n ? { ...named('name_required', 'give it a name'), field: 'name' } : !NAME_RE.test(n) ? { ...named('bad_name', 'a name is 1–120 letters, digits, ".", "_" or "-"'), field: 'name' } : null);
  if (!ADD_WAYS.includes(way)) return { ...named('bad_way'), field: 'uri' };
  if (way === 'link') {
    const link = String(uri == null ? '' : uri).trim();
    if (!link) return { ...named('bad_uri', 'paste the otpauth:// link'), field: 'uri' };
    const v = parseOtpauth(link, { now, source: 'paste' });
    if (!v.ok) return { ...v, field: 'uri' };
    const facts = { issuer: v.value.issuer, account: v.value.account, digits: v.value.digits, period: v.value.period, algorithm: v.value.algorithm };
    v.value.seed = null;
    const n = typed || nameOf(facts.issuer, facts.account);
    const bad = nameVerdict(n);
    return bad ? { ...bad, facts } : { ok: true, way, facts, name: n, body: { uri: link, name: n } };
  }
  const pick = (v, d) => (v == null || String(v).trim() === '' ? d : v);
  const cfg = { digits: pick(digits, ADD_DEFAULTS.digits), period: pick(period, ADD_DEFAULTS.period), algorithm: pick(algorithm, ADD_DEFAULTS.algorithm) };
  const v = valueOf({ seed, ...cfg }, { now, source: 'manual' });
  if (!v.ok) return { ...v, field: v.code === 'bad_seed' || v.code === 'seed_too_short' ? 'seed' : 'settings' };
  const facts = { issuer: '', account: '', digits: v.value.digits, period: v.value.period, algorithm: v.value.algorithm };
  const text = v.value.seed;
  v.value.seed = null;
  const bad = nameVerdict(typed);
  return bad ? { ...bad, facts } : { ok: true, way, facts, name: typed, body: { seed: text, name: typed, digits: facts.digits, period: facts.period, algorithm: facts.algorithm } };
}

module.exports = {
  ALGORITHMS, DIGITS_MIN, DIGITS_MAX, PERIOD_MIN, PERIOD_MAX, SEED_MIN_BYTES, SEED_MAX_BYTES, NAME_RE, ENTRY_PREFIX, SOURCES, SUBJECT_RE, VIEW_PACE_MAX, VIEW_PACE_CEILING, USE_PACE_MAX,
  base32Decode, base32Encode, hotp, totp, verify, configOf, valueOf, recordOf, parseOtpauth, uriOf, nameOf, entryOf, nameOfEntry, grantOf, useVerdict,
  ADD_DEFAULTS, ADD_CHOICES, ADD_WAYS, addPlanOf,   // lane vault-totp-add: the add dialog's model
};

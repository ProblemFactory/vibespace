'use strict';
/**
 * THE VAULT'S CONTENTS — PURE (imports nothing; CJS so the hub's collector, the routes, the page and the suites share ONE
 * set of rules). Lane vault-contents-window, 2026-10-19 (the owner: "vault 能不能加一个查看现在所有存储内容的功能，类似 google
 * password manager，需要输入密码才能查看一段时间").
 *
 * THE INVENTORY is every secret-bearing FIELD the sealed stores hold — not the vault's entries (those are the six store
 * keys, src/server/vault-engine.js STORE_KEYS: infrastructure, never shown): an account's API key, a mount's secret key,
 * an integration's client secret, a channel account's OAuth token, a passkey's private key, an app's stored login. Each
 * store lists its own (`vaultRows()` beside its own ciphertext — the store stays the one reader of its bytes); this module
 * turns what they list into rows:
 *
 *   { id, store, entry, field, kind, label, detail, createdAt, rotatedAt, lastUsed: { at, by } | null, size, doors }
 *
 *   · `id` = `<store>:<entry>#<field>` — the ONE reference a reveal names (parseRef);
 *   · `size` = a LENGTH CLASS ('short' ≤ 16 bytes · 'medium' ≤ 64 · 'long' ≤ 512 · 'very long'), estimated from the
 *     ciphertext's length — never a character of the value, not even its last two, not even its exact length;
 *   · `lastUsed` = the store KEY's last use in the vault engine (store-level: a key opens every row of its store), `by` =
 *     'human' for a reveal from the Vault window, 'system' for every other read;
 *   · `doors` = the store's OWN delete route + its card's confirm, and the re-authorize door where the store has one
 *     (integrations, channels) — this window never re-implements a door.
 *
 * `rowOf` copies NAMED fields only (never a spread): a store row that carried its value, its ciphertext or anything else
 * leaves nothing of it in the row (scripts/test-vault-inventory.mjs plants a unique value in every store and greps the
 * whole inventory for it).
 *
 * THE REVEAL WINDOW (`revealVerdict`): the second password typed again opens a FIXED 5-minute window for ONE PAGE of
 * one sign-in (server-side, in memory, never extended by activity; verify r1: the PAGE's secret — answered by the
 * reveal-session, kept in that page's memory only — is part of the window's key, so a second tab asks again and a hub with
 * no sign-in no longer shares one window with every local process); inside it `POST /api/vault/reveal` answers ONE value.
 * A lock ends it (the engine's epoch moves at every lock and unlock — a window opened under another epoch is dead); a
 * clock stepped back cannot stretch it (the monotonic clock bounds it too).
 */

/** The sealed stores, in the window's order — the ids of src/server/vault-engine.js STORE_KEYS `store` (each one key). */
const STORES = Object.freeze([
  Object.freeze({ store: 'accounts', label: 'Accounts' }),
  Object.freeze({ store: 'integrations', label: 'Integrations' }),
  Object.freeze({ store: 'channels', label: 'Channels' }),
  Object.freeze({ store: 'mounts', label: 'Storage' }),
  Object.freeze({ store: 'app-secrets', label: 'App logins' }),
  Object.freeze({ store: 'passkeys', label: 'Passkeys' }),
]);
const STORE_IDS = Object.freeze(STORES.map((s) => s.store));
/** The window's groups: the six stores + «Hub secrets» (int317) — the engine's OWN secret entries (`host:<id>` a machine's
 *  link token, `frp:token` the relay token, `file:<name>` a sealed file's key; lane vault-e2e-password-fix-r2), no store key. */
// design q-046 (lane automation-keys-core): «Automation keys» — VibeSpace's own keys (`apikey:<id>` entries, listed by
// src/server/automation-engine.js): revealable, one per reveal, ONLY to hand to an outside party (the row says so)
const GROUPS = Object.freeze([...STORES, Object.freeze({ store: 'automation', label: 'Automation keys' }), Object.freeze({ store: 'secrets', label: 'Hub secrets' })]);
const GROUP_IDS = Object.freeze(GROUPS.map((s) => s.store));
const storeOf = (id) => GROUPS.find((s) => s.store === id) || null;
/** NEVER SHOWN (int317): a machine's link token runs commands on that machine (an RCE credential) and a sealed file's key is
 *  infrastructure — both refused by name (`not_revealable`, audited); the relay token is the owner's own, shown like a key. */
const NEVER_SHOWN_RE = /^(?:host|file):/;
const revealableOf = (store, entry) => !(store === 'secrets' && NEVER_SHOWN_RE.test(String(entry || '')));
const NEVER_SHOWN = 'Never shown — VibeSpace uses it itself';
/** One engine secret entry `{ name, at }` → its raw row (NAMES and dates only: no cipher, so no length class either);
 *  `machineName(hostKey)` words a link token's machine (the hub's hosts; the key itself when it knows none). */
const SECRET_ROWS = Object.freeze([   // the entry name's shape → its row's field, kind and words (the engine's SECRET_RE names)
  { re: /^host:(.+)$/, field: 'token', kind: 'token', label: (rest, nameOf) => `Machine link token · ${nameOf(rest)}`, detail: NEVER_SHOWN },
  { re: /^frp:(token)$/, field: 'token', kind: 'token', label: () => 'Relay token', detail: '' },
  { re: /^file:(.+)$/, field: 'key', kind: 'secret-key', label: (rest) => `Sealed file key · ${rest}`, detail: NEVER_SHOWN },
]);
function secretRowOf(s, { machineName = (k) => k } = {}) {
  const name = String((s && s.name) || ''), at = s && s.at;
  const nameOf = (k) => { try { return String(machineName(k) || k); } catch { return k; } };
  for (const r of SECRET_ROWS) { const m = r.re.exec(name); if (m) return { entry: name, field: r.field, kind: r.kind, label: r.label(m[1], nameOf), detail: r.detail, createdAt: at }; }
  return null;
}

/** The kinds a row says (English keys — the page words them). `long-lived-oauth-token` = an account's `claude setup-token`
 *  (sk-ant-oat01-…, a year, no refresh) — its OWN words so nobody reads it as the CLI's browser login (the owner 2026-10-19,
 *  lane vault-one-door); `oauth-token` stays for a mount's or a channel's OAuth sign-in. */
const KINDS = Object.freeze(['api-key', 'long-lived-oauth-token', 'oauth-token', 'client-secret', 'password', 'token', 'secret-key', 'session-token', 'private-key', 'parameter', 'login', 'secret']);
const KIND_WORDS = Object.freeze({
  'api-key': 'API key', 'long-lived-oauth-token': 'Long-lived OAuth token', 'oauth-token': 'OAuth token', 'client-secret': 'Client secret', password: 'Password', token: 'Token',
  'secret-key': 'Secret key', 'session-token': 'Session token', 'private-key': 'Private key', parameter: 'Parameter', login: 'Login', secret: 'Secret',
});
/** A field NAME → its kind (a store may say the kind itself; this is the fallback for declared-field stores). */
function kindOfField(name) {
  const n = String(name || '');
  if (/private.?key/i.test(n)) return 'private-key';
  if (/^pass$|passw(or)?d|passphrase/i.test(n)) return 'password';
  if (/client.?secret|app.?secret/i.test(n)) return 'client-secret';
  if (/api.?key|^key$/i.test(n)) return 'api-key';
  if (/session.?token/i.test(n)) return 'session-token';
  if (/oauth|refresh/i.test(n)) return 'oauth-token';
  if (/secret.?key|access.?secret/i.test(n)) return 'secret-key';
  if (/token|bearer/i.test(n)) return 'token';
  return 'secret';
}

const SIZE_CLASSES = Object.freeze(['short', 'medium', 'long', 'very long', 'unknown']);
/** Bytes → the length class (the only fact of a value a row carries). */
function sizeClassOf(n) {
  const b = Number(n);
  if (!Number.isFinite(b) || b < 0) return 'unknown';
  return b <= 16 ? 'short' : b <= 64 ? 'medium' : b <= 512 ? 'long' : 'very long';
}
const b64Bytes = (s) => { const t = String(s).replace(/=+$/, ''); return Math.floor((t.length * 3) / 4); };
/** A ciphertext as the stores keep it → the plaintext's byte length (AES-GCM adds none), or null for a shape we do not know.
 *  secret-box `iv.tag.data` (base64) · accounts `iv:tag:data` (hex) · passkeys `v1.iv.tag.ct` (base64url). */
function plainBytesOf(blob) {
  const s = typeof blob === 'string' ? blob : '';
  let m = /^[A-Za-z0-9+/]{16}\.[A-Za-z0-9+/]{22}==\.([A-Za-z0-9+/]*={0,2})$/.exec(s);
  if (m) return b64Bytes(m[1]);
  m = /^[0-9a-f]{24}:[0-9a-f]{32}:([0-9a-f]*)$/i.exec(s);
  if (m) return Math.floor(m[1].length / 2);
  m = /^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{22}\.([A-Za-z0-9_-]+)$/.exec(s);
  if (m) return b64Bytes(m[1]);
  return null;
}

// ── THE REFERENCE: `<store>:<entry>#<field>` ──
const ENTRY_RE = /^[^#\s\u0000-\u001f]{1,240}$/;
const FIELD_RE = /^[\w.:-]{1,160}$/;
function refOf(store, entry, field) {
  const e = String(entry == null ? '' : entry), f = String(field == null ? '' : field);
  return GROUP_IDS.includes(store) && ENTRY_RE.test(e) && FIELD_RE.test(f) ? `${store}:${e}#${f}` : null;
}
/** → { store, entry, field } | null (anything else is refused before a store is asked). */
function parseRef(id) {
  const s = typeof id === 'string' ? id : '';
  if (s.length > 420) return null;
  const c = s.indexOf(':'), h = s.lastIndexOf('#');
  if (c < 1 || h <= c + 1) return null;
  const store = s.slice(0, c), entry = s.slice(c + 1, h), field = s.slice(h + 1);
  return refOf(store, entry, field) === s ? { store, entry, field } : null;
}

// ── THE DOORS: the store's own; this window opens them, it never re-implements one ──
const enc = (v) => encodeURIComponent(String(v));
/** → { delete: { method, path, confirm } | { open, id } | null, rotate: { open, id } | null }. `confirm` names the card's
 *  own confirm words (the page words each from the same keys the card uses). */
function doorsOf({ store, entry, field }) {
  const e = String(entry || ''), f = String(field || '');
  if (store === 'accounts') return { delete: f === 'oat' ? { method: 'DELETE', path: `/api/accounts/${enc(e)}/oat`, confirm: 'oat' } : { method: 'DELETE', path: `/api/accounts/${enc(e)}`, confirm: 'account' }, rotate: null };
  if (store === 'mounts') return { delete: e === 'my-storage' ? null : { method: 'DELETE', path: `/api/mounts/${enc(e)}`, confirm: 'mount' }, rotate: null };
  if (store === 'integrations') return e.includes('/') ? { delete: null, rotate: null } : { delete: { method: 'DELETE', path: `/api/integrations/${enc(e)}`, confirm: 'integration' }, rotate: { open: 'integration', id: e } };
  if (store === 'channels') return f.startsWith('caller.') ? { delete: null, rotate: null } : { delete: { open: 'channel-remove', id: e }, rotate: { open: 'channel-reauth', id: e } };
  if (store === 'passkeys') { const i = e.indexOf('/'); return i > 0 ? { delete: { method: 'DELETE', path: `/api/browser/passkeys/${enc(e.slice(0, i))}/${enc(e.slice(i + 1))}`, confirm: 'passkey' }, rotate: null } : { delete: null, rotate: null }; }
  if (store === 'app-secrets') return { delete: { method: 'POST', path: `/api/desktop/apps/${enc(e)}/secrets/forget`, confirm: 'app-logins' }, rotate: null };
  return { delete: null, rotate: null };
}

const clip = (v, n) => (v == null ? '' : String(v)).replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, n);
const when = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.floor(n) : null; };
const BY = Object.freeze(['human', 'agent', 'job', 'system']);
const useOf = (u) => (u && when(u.at) ? { at: when(u.at), by: BY.includes(u.by) ? u.by : 'system' } : null);

/** ONE row from what a store listed — NAMED fields only. `raw` = { entry, field, kind?, label, detail?, createdAt?,
 *  rotatedAt?, cipher? (the ciphertext: its length class only), bytes? (a length the store knows) }. → the row | null. */
function rowOf(store, raw, { lastUsed = null } = {}) {
  if (!raw || typeof raw !== 'object') return null;
  const id = refOf(store, raw.entry, raw.field);
  if (!id) return null;
  const bytes = Number.isFinite(Number(raw.bytes)) && raw.bytes !== null && raw.bytes !== undefined ? Number(raw.bytes) : plainBytesOf(raw.cipher);
  const kind = KINDS.includes(raw.kind) ? raw.kind : kindOfField(raw.field);
  return {
    id, store, entry: String(raw.entry), field: String(raw.field), kind,
    label: clip(raw.label, 120) || String(raw.entry).slice(0, 120), detail: clip(raw.detail, 120),
    createdAt: when(raw.createdAt), rotatedAt: when(raw.rotatedAt), lastUsed: useOf(lastUsed),
    size: bytes == null ? 'unknown' : sizeClassOf(bytes), doors: doorsOf({ store, entry: raw.entry, field: raw.field }),
    revealable: revealableOf(store, raw.entry),
  };
}

/** Every store's listing → { stores: [{ store, label, count, error }], rows } — sorted by store, then label, then field.
 *  `listed` = [{ store, rows, error?, missing? }]; `uses` = { <store>: { at, by } } (the engine's last use of its key). */
function inventoryOf(listed, { uses = {} } = {}) {
  const stores = [], rows = [];
  for (const s of GROUPS) {
    const got = (listed || []).find((x) => x && x.store === s.store) || { rows: [], missing: true };
    const mine = [];
    for (const raw of Array.isArray(got.rows) ? got.rows : []) { const r = rowOf(s.store, raw, { lastUsed: uses && uses[s.store] }); if (r && !mine.some((x) => x.id === r.id)) mine.push(r); }
    mine.sort((a, b) => a.label.localeCompare(b.label) || a.field.localeCompare(b.field));
    stores.push({ store: s.store, label: s.label, count: mine.length, error: got.error ? clip(got.error, 80) : null, missing: !!got.missing });
    rows.push(...mine);
  }
  return { stores, rows };
}

/** The page's search: label, detail, entry, field, the kind's words, the store's label — every word must match. */
function searchRows(rows, q) {
  const words = String(q || '').toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return (rows || []).slice();
  return (rows || []).filter((r) => { const hay = [r.label, r.detail, r.entry, r.field, KIND_WORDS[r.kind], (storeOf(r.store) || {}).label].join(' ').toLowerCase(); return words.every((w) => hay.includes(w)); });
}
const SORTS = Object.freeze(['name', 'kind', 'created', 'used']);
/** Rows in a sort (inside their store group — the page groups by store). */
function sortRows(rows, by = 'name') {
  const out = (rows || []).slice();
  const cmp = {
    name: (a, b) => a.label.localeCompare(b.label) || a.field.localeCompare(b.field),
    kind: (a, b) => a.kind.localeCompare(b.kind) || a.label.localeCompare(b.label),
    created: (a, b) => (b.createdAt || 0) - (a.createdAt || 0) || a.label.localeCompare(b.label),
    used: (a, b) => ((b.lastUsed && b.lastUsed.at) || 0) - ((a.lastUsed && a.lastUsed.at) || 0) || a.label.localeCompare(b.label),
  }[SORTS.includes(by) ? by : 'name'];
  return out.sort((a, b) => GROUP_IDS.indexOf(a.store) - GROUP_IDS.indexOf(b.store) || cmp(a, b));
}

// ── THE REVEAL WINDOW ──
const REVEAL_MS = 5 * 60e3;           // FIXED — never extended by activity
const REVEAL_PACE_MAX = 20;           // reveals a minute for ONE sign-in (verify r1: one sign-in no longer starves another's)
const REVEAL_PACE_CEILING = 60;       // … and a minute for the whole vault, every caller together
/** A page's reveal secret as the hub hands it out (32 hex) — anything else is no secret at all. */
const PAGE_RE = /^[0-9a-f]{32}$/;
const REVEAL_PACE_MS = 60e3;
const CLIPBOARD_CLEAR_MS = 30e3;      // the page clears a copied value after this long (when it still can)
/** May a reveal be answered now? `revealWindow` = { startedAt, until, epoch, startedMono? } | null (this page's); `epoch` =
 *  the engine's now; `mono` = a monotonic clock (verify r1: a wall clock stepped back must not stretch the window — the
 *  time left is the least of the wall's and the monotonic clock's). → { ok: true, leftMs } | { ok: false, code:
 *  'vault_not_set_up' | 'vault_locked' | 'reveal_needs_password', expired? }. */
function revealVerdict({ state, revealWindow = null, epoch = null, now = 0, mono = null } = {}) {
  if (state === 'not_set_up') return { ok: false, code: 'vault_not_set_up' };
  if (state !== 'unlocked') return { ok: false, code: 'vault_locked' };
  const w = revealWindow;
  if (!w || typeof w !== 'object' || !Number.isFinite(w.until) || !Number.isFinite(w.startedAt) || w.epoch !== epoch) return { ok: false, code: 'reveal_needs_password' };
  let left = w.until - now;
  if (Number.isFinite(mono) && Number.isFinite(w.startedMono)) left = Math.min(left, REVEAL_MS - (mono - w.startedMono));
  if (!(left > 0)) return { ok: false, code: 'reveal_needs_password', expired: true };
  if (w.until - w.startedAt > REVEAL_MS || left > REVEAL_MS) return { ok: false, code: 'reveal_needs_password' };   // never longer than 5 min (a clock that went back)
  return { ok: true, leftMs: left };
}
/** The pace: `stamps` = the reveal instants of the last minute (one sign-in's, or the whole vault's with `max` =
 *  REVEAL_PACE_CEILING). → { ok } | { ok: false, code: 'paced', retryInMs }. */
function paceVerdict(stamps, now, max = REVEAL_PACE_MAX) {
  const recent = (stamps || []).filter((t) => now - t < REVEAL_PACE_MS && now - t >= 0);
  if (recent.length < max) return { ok: true };
  return { ok: false, code: 'paced', retryInMs: Math.max(1, REVEAL_PACE_MS - (now - Math.min(...recent))) };
}
/** mm:ss of a window's time left (the countdown chip). */
function countdownText(ms) {
  const s = Math.max(0, Math.ceil((Number(ms) || 0) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

module.exports = {
  STORES, STORE_IDS, GROUPS, GROUP_IDS, revealableOf, secretRowOf, storeOf, KINDS, KIND_WORDS, kindOfField, SIZE_CLASSES, sizeClassOf, plainBytesOf, refOf, parseRef, doorsOf, rowOf,
  inventoryOf, searchRows, SORTS, sortRows, REVEAL_MS, REVEAL_PACE_MAX, REVEAL_PACE_CEILING, REVEAL_PACE_MS, CLIPBOARD_CLEAR_MS, PAGE_RE, revealVerdict, paceVerdict, countdownText,
};

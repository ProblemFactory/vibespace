'use strict';
/**
 * THE VAULT'S CONTENTS — PURE (imports only the kind registry, src/vault-kinds.js — PURE → PURE; CJS so the hub's collector,
 * the routes, the page and the suites share ONE set of rules). Lane vault-contents-window, 2026-10-19 (the owner: "vault 能不能加一个查看现在所有存储内容的功能，类似 google
 * password manager，需要输入密码才能查看一段时间").
 *
 * THE INVENTORY is every secret-bearing FIELD the sealed stores hold — not the vault's entries (those are the six store
 * keys, src/server/vault-engine.js STORE_KEYS: infrastructure, never shown): an account's API key, a mount's secret key,
 * an integration's client secret, a channel account's OAuth token, a passkey's private key, an app's stored login. Each
 * store lists its own (`vaultRows()` beside its own ciphertext — the store stays the one reader of its bytes); this module
 * turns what they list into rows:
 *
 *   { id, store, entry, field, kind, label, detail, createdAt, rotatedAt, lastUsed: { at, by } | null, size, doors, revealable,
 *     origin, expiresAt }
 *
 *   · `id` = `<store>:<entry>#<field>` — the ONE reference a reveal names (parseRef);
 *   · `size` = a LENGTH CLASS ('short' ≤ 16 bytes · 'medium' ≤ 64 · 'long' ≤ 512 · 'very long'), estimated from the
 *     ciphertext's length — never a character of the value, not even its last two, not even its exact length;
 *   · `lastUsed` = the store KEY's last use in the vault engine (store-level: a key opens every row of its store), `by` =
 *     'human' for a reveal from the Vault window, 'system' for every other read;
 *   · `doors` = the store's OWN delete route + its card's confirm, and the re-authorize door where the store has one
 *     (integrations, channels) — this window never re-implements a door;
 *   · `origin` (lane vault-window-v2, design q-047 §3.2) = how the value CAME — a closed word a store may list ('mint' /
 *     'put' / 'qr' / 'paste' / 'manual'), else null; `expiresAt` = the instant a store knows the value stops working (an
 *     account's long-lived token), else null. Both are facts about the value, never a piece of it.
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

/** An extraction marker (scripts/i18n-extract.mjs): a string the PAGE words with t() — lane vault-window-v2's provenance chips
 *  and For-you card sentences are DECLARED here and worded by the client (the purposes' words: the kind registry's). */
const i18nKey = (s) => s;
/** THE KIND REGISTRY (lane vault-totp-add): one row per kind family — the rail's categories and the row → category mapping
 *  below READ it (no second list); scripts/test-vault-kinds-census.mjs checks every surface a family declares. */
const VK = require('./vault-kinds.js');
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
  // design q-047 L1 (lane vault-totp): a two-step code — its row names the entry only (the issuer, the account and the
  // settings are the entry's VALUE: shown with the seed, behind 显示 — owner decision ① as amended); the code is its own door
  { re: /^totp:([\w.-]{1,120})$/, field: 'seed', kind: 'totp', label: (rest) => rest, detail: '' },
]);
/** lane vault-mint-put (design q-043 §9): an `agent:<scope>/<name>` entry's provenance — the Vault window v2's provenance
 *  chip renders `row.provenance` (SEAM: the integrator wires the chip onto the v2 window, lane vault-window-v2; this base
 *  carries the data and shows `detail` as a meta line). `minted` = the hub made the value, the agent never saw it;
 *  `stored` = the agent handed a value it had already seen (the transcript's copy is unprotected — the window says so). */
const AGENT_PROV = Object.freeze({
  minted: { label: 'Agent minted · never shown to the agent', sawPlaintext: false },
  stored: { label: 'Agent stored · the agent saw the plaintext', sawPlaintext: true },
});
const AGENT_ENTRY_RE = /^agent:(.+)\/([^/]+)$/;
/** lane browser-login (P3 of the custom browser kernel): a website's login `web-login:<origin>#<user>` (src/browser-login.js
 *  NAME_RE is the strict shape; this reads its two halves) — its row names the user and the site; its provenance word rides the
 *  engine's `kind` (the source: the owner's own, registered by an agent through the vault, typed by an agent itself). */
const WEB_LOGIN_RE = /^web-login:(https?:\/\/[^#\s]{1,270})#([^\s#\u0000-\u001f\u007f]{1,160})$/;
const LOGIN_SOURCES = Object.freeze({
  owner: { origin: null, label: '' },
  'vault-minted': { origin: 'mint', label: i18nKey('Registered by an agent · its password made by the vault, never shown'), sawPlaintext: false },
  'agent-typed': { origin: 'put', label: i18nKey('Typed by an agent itself · strength unknown — the agent knows it'), sawPlaintext: true },
});
const FREE_ENTRY_RE = /^secret:[\w.-]{1,160}$/;   // lane vault-paste-request (src/vault-paste.js — the hub's ids are 10 hex characters)
const FREE_KINDS = Object.freeze(['api-key', 'password', 'secret']);
function secretRowOf(s, { machineName = (k) => k } = {}) {
  const name = String((s && s.name) || ''), at = s && s.at;
  const nameOf = (k) => { try { return String(machineName(k) || k); } catch { return k; } };
  for (const r of SECRET_ROWS) { const m = r.re.exec(name); if (m) return { entry: name, field: r.field, kind: r.kind, label: r.label(m[1], nameOf), detail: r.detail, createdAt: at }; }
  // lane vault-paste-request: a FREE entry (`secret:<id>` — pasted by the owner in For you at an agent's request, or added
  // in the Vault window's 「其他密钥或密码…」): its row says the label, the kind and the note a person wrote (never a value)
  const wl = WEB_LOGIN_RE.exec(name);
  if (wl) { const src = Object.prototype.hasOwnProperty.call(LOGIN_SOURCES, s && s.kind) ? s.kind : 'owner'; const p = LOGIN_SOURCES[src]; return { entry: name, field: 'password', kind: 'login', label: `${wl[2]} · ${wl[1].replace(/^https:\/\//, '')}`, detail: p.label, createdAt: at, ...(p.origin ? { origin: p.origin } : {}), ...(src !== 'owner' ? { provenance: { by: 'agent', prov: src, sawPlaintext: p.sawPlaintext, actor: (s && s.actor) || null } } : {}) }; }   // lane browser-login
  if (FREE_ENTRY_RE.test(name)) {
    // lane vault-use-grants: an entry the owner filled at an agent's REQUEST says so — its origin «filled by you · asked for by
    // <the conversation>» and the hosts the request named (the search finds it by either; a vault-use grant's `@entry`)
    const asked = s && s.askedBy && typeof s.askedBy === 'object' && s.askedBy.conv ? { conv: clip(s.askedBy.conv, 160), name: clip(s.askedBy.name, 80) } : null;
    const hosts = Array.isArray(s && s.hosts) ? s.hosts.map((h) => clip(h, 253)).filter(Boolean).slice(0, 16) : [];
    return { entry: name, field: 'secret', kind: FREE_KINDS.includes(s && s.kind) ? s.kind : 'secret', label: String((s && s.label) || name.slice(7)), detail: String((s && s.note) || ''), createdAt: at, ...(asked ? { origin: 'request', askedBy: asked } : {}), ...(hosts.length ? { hosts } : {}) };
  }
  const am = AGENT_ENTRY_RE.exec(name);
  if (am) {
    const prov = AGENT_PROV[s && s.prov] ? s.prov : 'stored';   // default-safe: an unknown provenance is treated as 'the agent saw it'
    const p = AGENT_PROV[prov];
    return { entry: name, field: 'secret', kind: prov === 'minted' ? 'password' : 'secret', label: `Agent secret · ${am[2]}`, detail: p.label, createdAt: at, provenance: { by: 'agent', prov, sawPlaintext: p.sawPlaintext, actor: (s && s.actor) || null } };
  }
  return null;
}

/** The kinds a row says (English keys — the page words them). `long-lived-oauth-token` = an account's `claude setup-token`
 *  (sk-ant-oat01-…, a year, no refresh) — its OWN words so nobody reads it as the CLI's browser login (the owner 2026-10-19,
 *  lane vault-one-door); `oauth-token` stays for a mount's or a channel's OAuth sign-in. */
const KINDS = Object.freeze(['api-key', 'long-lived-oauth-token', 'oauth-token', 'client-secret', 'password', 'token', 'secret-key', 'session-token', 'private-key', 'parameter', 'login', 'secret', 'totp']);
const KIND_WORDS = Object.freeze({
  'api-key': 'API key', 'long-lived-oauth-token': 'Long-lived OAuth token', 'oauth-token': 'OAuth token', 'client-secret': 'Client secret', password: 'Password', token: 'Token',
  'secret-key': 'Secret key', 'session-token': 'Session token', 'private-key': 'Private key', parameter: 'Parameter', login: 'Login', secret: 'Secret',
  totp: 'Two-step code',
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
const ENTRY_RE = /^(?:web-login:[^\s\u0000-\u001f]{1,440}|[^#\s\u0000-\u001f]{1,240})$/;   // lane browser-login: a web login's name holds its own `#` (parseRef splits at the LAST one)
const FIELD_RE = /^[\w.:-]{1,160}$/;
function refOf(store, entry, field) {
  const e = String(entry == null ? '' : entry), f = String(field == null ? '' : field);
  return GROUP_IDS.includes(store) && ENTRY_RE.test(e) && FIELD_RE.test(f) ? `${store}:${e}#${f}` : null;
}
/** → { store, entry, field } | null (anything else is refused before a store is asked). */
function parseRef(id) {
  const s = typeof id === 'string' ? id : '';
  if (s.length > 480) return null;
  const c = s.indexOf(':'), h = s.lastIndexOf('#');
  if (c < 1 || h <= c + 1) return null;
  const store = s.slice(0, c), entry = s.slice(c + 1, h), field = s.slice(h + 1);
  return refOf(store, entry, field) === s ? { store, entry, field } : null;
}

// ── THE DOORS: the store's own; this window opens them, it never re-implements one ──
const enc = (v) => encodeURIComponent(String(v));
/** → { delete: { method, path, confirm } | { open, id } | null, rotate: { open, id } | null }. `confirm` = the row's family's
 *  `confirmKey` (src/vault-kinds.js — the page words it from its CONFIRM_WORDS, keyed by the registry; acceptance r2). */
function doorsOf({ store, entry, field }) {
  const e = String(entry || ''), f = String(field || '');
  const cf = VK.confirmKeyOf(store, e);
  if (store === 'accounts') return { delete: f === 'oat' ? { method: 'DELETE', path: `/api/accounts/${enc(e)}/oat`, confirm: cf } : { method: 'DELETE', path: `/api/accounts/${enc(e)}`, confirm: cf }, rotate: null };
  if (store === 'mounts') return { delete: e === 'my-storage' ? null : { method: 'DELETE', path: `/api/mounts/${enc(e)}`, confirm: cf }, rotate: null };
  if (store === 'integrations') return e.includes('/') ? { delete: null, rotate: null } : { delete: { method: 'DELETE', path: `/api/integrations/${enc(e)}`, confirm: cf }, rotate: { open: 'integration', id: e } };
  if (store === 'channels') return f.startsWith('caller.') ? { delete: null, rotate: null } : { delete: { open: 'channel-remove', id: e }, rotate: { open: 'channel-reauth', id: e } };
  if (store === 'passkeys') { const i = e.indexOf('/'); return i > 0 ? { delete: { method: 'DELETE', path: `/api/browser/passkeys/${enc(e.slice(0, i))}/${enc(e.slice(i + 1))}`, confirm: cf }, rotate: null } : { delete: null, rotate: null }; }
  if (store === 'app-secrets') return { delete: { method: 'POST', path: `/api/desktop/apps/${enc(e)}/secrets/forget`, confirm: cf }, rotate: null };
  // design q-047 L1 (lane vault-totp): a two-step code — its own delete door (its grants go with it) and THE CODE door (a
  // person's GET, no 「验证是你」, audited); no 换新 (a site that changed the seed = delete + add — design §4 #9)
  // lane vault-paste-request: a free entry — its own delete door (the run door's switch and grants on it go with it)
  if (store === 'secrets' && FREE_ENTRY_RE.test(e)) return { delete: { method: 'DELETE', path: `/api/vault/secrets/${enc(e.slice(7))}`, confirm: cf }, rotate: null };
  if (store === 'secrets' && WEB_LOGIN_RE.test(e)) return { delete: { method: 'DELETE', path: `/api/vault/web-logins/${enc(e)}`, confirm: cf }, rotate: null, login: { name: e } };   // lane browser-login: its own delete door (its grant row goes with it) + 用于…
  if (store === 'secrets' && /^totp:[\w.-]{1,120}$/.test(e)) { const p = `/api/vault/totp/${enc(e.slice(5))}`; return { delete: { method: 'DELETE', path: p, confirm: cf }, rotate: null, code: { path: p } }; }
  return { delete: null, rotate: null };
}

const clip = (v, n) => (v == null ? '' : String(v)).replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, n);
const when = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.floor(n) : null; };
const BY = Object.freeze(['human', 'agent', 'job', 'system']);
/** How a value CAME (lane vault-window-v2, design q-047 §3.2) — a closed set a store may list on a row: 'mint' (made by the
 *  hub or an agent, nobody typed it), 'put' (an agent stored a value it had seen — q-043 §9), 'qr' / 'paste' / 'manual'
 *  (a two-step seed the owner scanned, pasted or typed — design §2.1 `source`). Anything else is no origin. */
const ORIGINS = Object.freeze(['mint', 'put', 'qr', 'paste', 'manual', 'request']);   // lane vault-use-grants: 'request' = the owner filled it at an agent's request
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
    origin: ORIGINS.includes(raw.origin) ? raw.origin : null, expiresAt: when(raw.expiresAt),   // lane vault-window-v2
    provenance: raw.provenance || null,   // lane vault-mint-put: agent entries carry it; the v2 window's chip reads it
    // lane vault-use-grants: the hosts a request named and the conversation that asked (names — never a value)
    hosts: Array.isArray(raw.hosts) ? raw.hosts.map((h) => clip(h, 253)).filter(Boolean).slice(0, 16) : [],
    askedBy: raw.askedBy && typeof raw.askedBy === 'object' && raw.askedBy.conv ? { conv: clip(raw.askedBy.conv, 160), name: clip(raw.askedBy.name, 80) } : null,
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

/** The page's search: label, detail, entry, field, the kind's words, the store's label, the purpose's and the provenance's
 *  words — every word must match, case-insensitively. `wordsOf(row)` = the page's OWN words for the row (its language: the
 *  kind, the purpose, the provenance as it draws them — lane vault-window-v2), added to the English ones. lane
 *  vault-use-grants: + the hosts (a request's named hosts), the requesting conversation's name, the row's id (a
 *  `secret:1a2b…` prefix finds it) — SEARCHED_FIELDS is what the «no match» line names. */
const SEARCHED_FIELDS = Object.freeze([i18nKey('names'), i18nKey('kinds'), i18nKey('purposes'), i18nKey('hosts'), i18nKey('where they came from'), i18nKey('ids')]);
function searchRows(rows, q, { wordsOf = null } = {}) {
  const words = String(q || '').toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return (rows || []).slice();
  return (rows || []).filter((r) => {
    const own = typeof wordsOf === 'function' ? (() => { try { return [].concat(wordsOf(r) || []); } catch { return []; } })() : [];
    const pu = PURPOSES.find((p) => p.id === purposeOf(r)), pv = PROVENANCES.find((p) => p.id === provenanceOf(r));
    const hay = [r.label, r.detail, r.entry, r.field, r.id, KIND_WORDS[r.kind], (storeOf(r.store) || {}).label, pu && pu.label, pv && pv.label, ...(Array.isArray(r.hosts) ? r.hosts : []), r.askedBy && r.askedBy.name, ...own].filter((x) => x != null).join(' ').toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}
const SORTS = Object.freeze(['name', 'kind', 'created', 'used']);
/** Rows in a sort — inside their store group (`byStore`, the v1 order), or alone (lane vault-window-v2: the page groups by
 *  PURPOSE, and sorts inside each purpose with `byStore: false`). */
function sortRows(rows, by = 'name', { byStore = true } = {}) {
  const out = (rows || []).slice();
  const cmp = {
    name: (a, b) => a.label.localeCompare(b.label) || a.field.localeCompare(b.field),
    kind: (a, b) => a.kind.localeCompare(b.kind) || a.label.localeCompare(b.label),
    created: (a, b) => (b.createdAt || 0) - (a.createdAt || 0) || a.label.localeCompare(b.label),
    used: (a, b) => ((b.lastUsed && b.lastUsed.at) || 0) - ((a.lastUsed && a.lastUsed.at) || 0) || a.label.localeCompare(b.label),
  }[SORTS.includes(by) ? by : 'name'];
  return out.sort((a, b) => (byStore ? GROUP_IDS.indexOf(a.store) - GROUP_IDS.indexOf(b.store) : 0) || cmp(a, b));
}

// ── THE PURPOSES (lane vault-window-v2, design q-047 §3.1 — the owner's decision ④: the window groups by what a secret is
// FOR, the store is named under 技术细节). ONE row ⇒ ONE purpose (purposeOf answers exactly one id for every row a store
// lists — scripts/test-vault-inventory.mjs ⑧ walks the real stores; a row of no purpose, or a row in two, is RED).
// lane vault-totp-add: the purposes ARE the kind registry's categories (src/vault-kinds.js CATEGORIES, the rail's order — the
// mock's: designs/vault-window-v2; `Other` shows only when something lands in it), and a row's purpose is its FAMILY's (the
// first family whose stores and entry shape hold it: an `agent:` entry first, an integration's per-machine row `<row>/<host>`
// and the hub's `host:` / `frp:` entries → machines, a hub secret no family holds → other).
const PURPOSES = VK.CATEGORIES;
const PURPOSE_IDS = VK.CATEGORY_IDS;
/** A row → its ONE purpose id — its kind family's category (src/vault-kinds.js); a store the window has not is none. */
function purposeOf(row) {
  if (!row || typeof row !== 'object') return null;
  const store = row.store, entry = String(row.entry == null ? '' : row.entry);
  if (!GROUP_IDS.includes(store)) return null;
  return VK.categoryOf(store, entry);
}
/** Rows → the purpose groups in the rail's order: [{ id, label, rows }] — every purpose (an empty one too: the rail counts
 *  0), `Other` only when it holds a row. Each row lands in exactly one group. */
function groupByPurpose(rows) {
  const by = new Map(PURPOSE_IDS.map((id) => [id, []]));
  for (const r of rows || []) { const p = purposeOf(r); if (by.has(p)) by.get(p).push(r); }
  return PURPOSES.filter((p) => !p.onlyWhenAny || by.get(p.id).length).map((p) => ({ id: p.id, label: p.label, rows: by.get(p.id) }));
}

// ── THE PROVENANCE (design q-047 §3.2): where a value came from — who has seen it in the clear. ONE chip per row, the first
// rule that holds. «never shown» is said of how the value was MADE (nobody typed it, no agent read it), not of a later reveal.
const PROVENANCES = Object.freeze([
  Object.freeze({ id: 'me', label: i18nKey('By you'), filter: 'me' }),                                        // 我自己 — a person stored it (the default)
  Object.freeze({ id: 'scan', label: i18nKey('Scanned · by you'), filter: 'me' }),                            // 扫码 · 我自己 — a two-step seed scanned / pasted
  Object.freeze({ id: 'hub-mint', label: i18nKey('Minted by the hub · never shown'), filter: 'system' }), // hub 铸造 · 从未显示
  Object.freeze({ id: 'agent-mint', label: i18nKey('Minted by an agent · never shown'), filter: 'agent-mint' }),   // agent 铸造 · 从未显示 (q-043 §9 mint)
  Object.freeze({ id: 'agent-put', label: i18nKey('Stored by an agent · it saw the value'), filter: 'agent-put' }),   // agent 存入 · agent 见过明文 (§9 put)
  Object.freeze({ id: 'system', label: i18nKey('System · never shown'), filter: 'system' }),               // 系统 · 永不显示 (revealable: false)
  Object.freeze({ id: 'request', label: i18nKey('Filled by you · asked for by {who}'), filter: 'me' }),       // 你填写的 · 应 <对话> 的请求 (lane vault-use-grants)
]);
const PROVENANCE_IDS = Object.freeze(PROVENANCES.map((p) => p.id));
/** The bar's provenance filter (multi-select; none picked = every row): four choices over the six chips. */
const PROVENANCE_FILTERS = Object.freeze([
  Object.freeze({ id: 'me', label: i18nKey('By you') }),
  Object.freeze({ id: 'agent-mint', label: i18nKey('Minted by an agent') }),
  Object.freeze({ id: 'agent-put', label: i18nKey('An agent saw it') }),
  Object.freeze({ id: 'system', label: i18nKey('System') }),
]);
function provenanceOf(row) {
  if (!row || typeof row !== 'object') return null;
  const entry = String(row.entry == null ? '' : row.entry);
  if (row.origin === 'put') return 'agent-put';
  if (row.origin === 'request') return 'request';   // lane vault-use-grants: the owner filled it, an agent asked for it
  if (/^agent:/.test(entry)) return 'agent-mint';
  if (row.provenance && row.provenance.prov === 'vault-minted') return 'agent-mint';   // lane browser-login: an agent's registration — the vault made the password, nobody saw it
  if (row.origin === 'qr' || row.origin === 'paste') return 'scan';
  if (row.store === 'secrets' && /^totp:/.test(entry)) return 'me';
  if (row.revealable === false) return 'system';
  if (row.store === 'automation' || row.origin === 'mint' || (row.store === 'secrets' && /^(?:apikey|frp|host|file):/.test(entry))) return 'hub-mint';
  return 'me';
}
const provenanceFilterOf = (row) => { const p = PROVENANCES.find((x) => x.id === provenanceOf(row)); return p ? p.filter : null; };

/** A row's STATE chips (§3.3 — a fact the row holds, never a hint): its value expires within 3 days / has expired; an agent
 *  saw it (rotate). → [{ id: 'expires', days } | { id: 'expired' } | { id: 'rotate' }] */
const EXPIRY_WARN_MS = 3 * 86400e3;
function stateChipsOf(row, now = 0) {
  const out = [];
  if (!row) return out;
  const exp = Number(row.expiresAt);
  if (Number.isFinite(exp) && exp > 0) {
    if (exp <= now) out.push({ id: 'expired' });
    else if (exp - now <= EXPIRY_WARN_MS) out.push({ id: 'expires', days: Math.max(1, Math.ceil((exp - now) / 86400e3)) });
  }
  if (provenanceOf(row) === 'agent-put') out.push({ id: 'rotate' });
  return out;
}

/** THE WINDOW'S VIEW over the rows: the search, the provenance filter (none = all), 只看可显示, then the purpose picked in
 *  the rail ('all' = every one). → { rows (sorted inside each purpose), groups (as groupByPurpose, over the filtered rows),
 *  counts: { all, <purpose>: n } (the rail's — after every filter but the purpose) }. */
function viewOf(rows, { q = '', prov = [], revealOnly = false, purpose = 'all', sort = 'used', wordsOf = null } = {}) {
  const pick = new Set((prov || []).filter((x) => PROVENANCE_FILTERS.some((f) => f.id === x)));
  let shown = searchRows(rows || [], q, { wordsOf });
  if (pick.size) shown = shown.filter((r) => pick.has(provenanceFilterOf(r)));
  if (revealOnly) shown = shown.filter((r) => r.revealable !== false);
  const groups = groupByPurpose(shown);
  const counts = { all: shown.length };
  for (const g of groups) counts[g.id] = g.rows.length;
  const inView = groups.filter((g) => purpose === 'all' || g.id === purpose).map((g) => ({ ...g, rows: sortRows(g.rows, sort, { byStore: false }) }));
  return { groups: inView, counts, rows: inView.flatMap((g) => g.rows) };
}

// ── 「需要你」 (design q-047 §3.4): the For-you list's OWN items filed by the vault (origin 'vault') — the same data, the
// same answers; the window draws the open ones at its top, never a second queue.
const BAND_MAX = 5;
const URGENCY_RANK = { urgent: 0, high: 1, normal: 2, low: 3 };
/** The open For-you items → the band's: { items (≤ 5, urgent first, newest first inside), total }. */
function bandItemsOf(open) {
  const mine = (open || []).filter((i) => i && i.origin === 'vault' && i.status !== 'done' && i.status !== 'dismissed' && !i.clearedAt);
  mine.sort((a, b) => (URGENCY_RANK[a.urgency] ?? 2) - (URGENCY_RANK[b.urgency] ?? 2) || (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0));
  return { items: mine.slice(0, BAND_MAX), total: mine.length };
}
/** An item's doors in the band (closed per action type): a held automation call = its three answers; the restart's notice =
 *  unlock; a rotate suggestion = renew + got it; an agent's request for a secret = paste + refuse; a failed use = open the
 *  row + got it; anything else = open + got it. */
function bandDoorsOf(item) {
  const type = item && item.action && item.action.type;
  if (type === 'automation-ask') return ['once', 'always', 'deny'];
  if (type === 'vault-unlock') return ['unlock'];
  if (type === 'vault-rotate') return ['renew', 'ack'];
  if (type === 'secret-request') return ['paste', 'deny'];   // lane vault-paste-request: an agent's request for a secret — THE paste box (a dialog here) / refuse
  return ['open', 'ack'];
}

// ── THE TWO PRODUCERS' RULES (design q-047 §3.4 — src/server/vault-hooks.js files them, origin 'vault') ──
/** A use door's refusal → its cause in the card's words (locked / not granted / expired / asks open); anything else is no
 *  failure the owner is told about (a refusal the owner gave — ask_denied, ask_quiet — or a caller's own mistake / retry:
 *  subject_busy, already_archived, bad_args). */
const USE_FAIL_CAUSES = Object.freeze({
  vault_locked: 'locked', not_granted: 'not-granted', verb_not_in_scope: 'not-granted', once_spent: 'not-granted', key_revoked: 'not-granted',
  subject_ended: 'expired', ask_expired: 'expired',
  asks_open: 'asks-open',   // lane conversations-archive-verb: an archive refused by the target's open For-you asks — the owner answers them
});
// lane conversations-archive-verb (the owner 2026-10-20: the notice «Using “…” failed» named neither the verb nor the reason nor
// the door) → lane vault-key-row-compact (the owner 2026-10-21: the 需要你 band's head still read a raw sentence; the card
// grammar: actor + verb + NAMED object in the head, the cause as the second line, the details under ONE fold): the card's
// TEXT is the HEAD — who used which key for which verb, refused (the verb in the closed table's own words: a param that IS
// words, `{key}` — the client says it in its language); its FIRST detail line is the CAUSE in the owner's words with the
// door (ONE i18n sentence per cause — a param is never translated); the rest (the hour's count, the last target, the last
// caller) sit under the fold. The English sentence the store dedupes by = the head + the cause, so one hour's failures of
// one (key, verb, reason) stay ONE item, as before. The locked line says WHERE in a person's words: Unlock… (test-vault-words).
const USE_FAIL_HEADS = Object.freeze({
  named: i18nKey('{who} used “{name}” for “{verb}” — refused'),
  key: i18nKey('“{name}” was refused for “{verb}”'),
  who: i18nKey('{who} used an automation key for “{verb}” — refused'),
  none: i18nKey('An automation key was refused for “{verb}”'),
});
const USE_FAIL_LINES = Object.freeze({
  vault_locked: i18nKey('The vault is locked — Unlock… at the top of the page'),
  not_granted: i18nKey('The key is not granted to {target} (nor to one of its Task Groups) and did not open it — grant it there in the Vault window (授权给…), or answer the card next time'),
  verb_not_in_scope: i18nKey('The key does not hold that verb — add it with Edit… on the key\'s row in the Vault window'),
  once_spent: i18nKey('The one use you allowed was spent — answer the next card with 一直, or grant the key in the Vault window'),
  key_revoked: i18nKey('The key was revoked — mint a new one in the Vault window and grant it'),
  subject_ended: i18nKey('The calling conversation is not running any more — nothing to do'),
  ask_expired: i18nKey('Nobody answered its card in 60 s — answer the card next time, or grant the key in the Vault window'),
  asks_open: i18nKey('{target} still has open For-you asks — answer its cards, or let the caller pass --resolve-asks'),
});
// lane key-instance-scope: a reach refusal names the REACH the grant has (opened / its Task Groups) and the door that widens it
const USE_FAIL_REACH_LINES = Object.freeze({
  opened: i18nKey('The key did not open {target} and its grant reaches only what it opened — widen the reach on the key\'s row in the Vault window (这些岗位的会话 / 整个 VibeSpace), or grant the key to that conversation'),
  groups: i18nKey('{target} is not in the Task Groups the grant reaches — widen the reach on the key\'s row in the Vault window (整个 VibeSpace), or grant the key to that conversation'),
});
/** The refusals a use can meet BEFORE a key is picked (no name to say): the vault locked (the same line), no key granted at
 *  all, no granted key holding the verb (pickKey names the held keys to the caller). Any other code says the named line. */
const USE_FAIL_NAMELESS = Object.freeze({
  vault_locked: USE_FAIL_LINES.vault_locked,
  not_granted: i18nKey('No key is granted to {target} — grant one in the Vault window (授权给…), or answer the card next time'),
  verb_not_in_scope: i18nKey('No key granted to {target} holds that verb — add it with Edit… on a key\'s row in the Vault window'),
});
const USE_FAIL_MERGE_MS = 60 * 60e3;   // one card per key × verb × reason per hour: the failures inside it are counted on that card
/** prev = this (key, verb, reason)'s running hour (or null) → { counted, fresh (a new hour: file the card), next }. The hour
 *  keeps the FIRST target and the FIRST caller (the card's words — the store's dedupe key) and the last ones (detail lines). */
function useFailVerdict(prev, { code, at, who = null, target = null } = {}) {
  const cause = USE_FAIL_CAUSES[code];
  if (!cause || !Number.isFinite(at)) return { counted: false, fresh: false, next: prev || null };
  const fresh = !prev || !Number.isFinite(prev.since) || at < prev.since || at - prev.since >= USE_FAIL_MERGE_MS;
  const cut = (x) => (x ? String(x).slice(0, 80) : null);
  const base = fresh ? { since: at, n: 0, causes: {}, target: cut(target), who: cut(who) } : prev;
  return { counted: true, fresh, next: { since: base.since, n: base.n + 1, causes: { ...base.causes, [cause]: (base.causes[cause] || 0) + 1 }, lastAt: at, lastWho: cut(who),
    target: base.target || cut(target), lastTarget: cut(target) || base.lastTarget || null, who: base.who || cut(who) } };
}
/** A sentence filled in English (the store's dedupe text): a param that is words (`{key}`) gives its own key. */
const fillWords = (l) => String(l.key).replace(/\{(\w+)\}/g, (m, k) => { const v = l.params && l.params[k]; return v == null ? m : typeof v === 'object' ? String(v.key || '') : String(v); });
/** The use-failure card's words as STRUCTURE (the client words them with t()): `text` = the HEAD (who · the key · the verb ·
 *  refused), `detail[0]` = the CAUSE with its door, then the hour's count / last target / last caller; `english` = the head
 *  + the cause filled in English (the store's dedupe key: the hour's FIRST caller and target, so it stays ONE item).
 *  `verb` = the verb id (language-neutral); `verbLabel` = the closed table's words for it (the producer reads them —
 *  this module imports nothing), else the id is said; `target` = the conversation's name or id; `who` = the caller. */
function useFailCard({ name = null, verb = null, verbLabel = null, target = null, code = null, reach = null, who = null, next }) {
  const v = String(verb || 'use').slice(0, 40);
  const tg = String((next && next.target) || target || '—').slice(0, 80);
  const caller = String((next && next.who) || who || '').slice(0, 80);
  const verbWords = verbLabel ? { key: String(verbLabel).slice(0, 120) } : v;
  const head = { key: name ? (caller ? USE_FAIL_HEADS.named : USE_FAIL_HEADS.key) : caller ? USE_FAIL_HEADS.who : USE_FAIL_HEADS.none,
    params: { ...(caller ? { who: caller } : {}), ...(name ? { name: String(name).slice(0, 80) } : {}), verb: verbWords } };
  const line = name && code === 'not_granted' && USE_FAIL_REACH_LINES[reach] ? USE_FAIL_REACH_LINES[reach] : !name && USE_FAIL_NAMELESS[code] ? USE_FAIL_NAMELESS[code] : USE_FAIL_LINES[code] || null;
  const cause = line ? { key: line, params: { target: tg } } : null;
  const detail = [...(cause ? [cause] : []), { key: i18nKey('{n} refused within the hour'), params: { n: (next && next.n) || 0 } }];
  if (next && next.lastTarget && next.lastTarget !== tg) detail.push({ key: i18nKey('Last: {target}'), params: { target: next.lastTarget } });
  if (next && next.lastWho && next.lastWho !== caller) detail.push({ key: i18nKey('Last asked by {who}'), params: { who: next.lastWho } });
  return { text: head, detail, english: cause ? `${fillWords(head)}. ${fillWords(cause)}` : fillWords(head) };
}
/** The rotate suggestion's words: an agent stored a value it had seen (q-043 §9 put) — ONE card per entry, filed when it
 *  is stored; once answered it never comes back by itself. */
function rotateCard({ name, who = null }) {
  return {
    text: { key: i18nKey('“{name}” was stored by an agent that saw its value — rotate it'), params: { name: String(name || '').slice(0, 80) } },
    detail: [...(who ? [{ key: i18nKey('Stored by {who}'), params: { who: String(who).slice(0, 80) } }] : []), { key: i18nKey('Renew it where it was issued, then store the new value; until then the agent\'s transcript holds the old one.') }],
  };
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
  STORES, STORE_IDS, GROUPS, GROUP_IDS, revealableOf, secretRowOf, AGENT_PROV, storeOf, KINDS, KIND_WORDS, kindOfField, SIZE_CLASSES, sizeClassOf, plainBytesOf, refOf, parseRef, doorsOf, rowOf,
  inventoryOf, searchRows, SEARCHED_FIELDS, SORTS, sortRows, REVEAL_MS, REVEAL_PACE_MAX, REVEAL_PACE_CEILING, REVEAL_PACE_MS, CLIPBOARD_CLEAR_MS, PAGE_RE, revealVerdict, paceVerdict, countdownText,
  // lane vault-window-v2 (design q-047 §3): the purposes, the provenance, the state chips, the window's view, the band, the two producers' rules
  ORIGINS, PURPOSES, PURPOSE_IDS, purposeOf, groupByPurpose, PROVENANCES, PROVENANCE_IDS, PROVENANCE_FILTERS, provenanceOf, provenanceFilterOf, EXPIRY_WARN_MS, stateChipsOf, viewOf,
  BAND_MAX, bandItemsOf, bandDoorsOf, USE_FAIL_CAUSES, USE_FAIL_MERGE_MS, USE_FAIL_HEADS, USE_FAIL_LINES, USE_FAIL_REACH_LINES, USE_FAIL_NAMELESS, useFailVerdict, useFailCard, rotateCard,
};

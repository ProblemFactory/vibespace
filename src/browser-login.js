'use strict';
/**
 * WEB LOGINS ON THE CUSTOM KERNEL — PURE (lane browser-login, P3 of docs/design-custom-browser-plugin.zh.md §4; CJS so the
 * server, the suites and the browser bundle share ONE spelling; imports only the PURE grant model). The owner (2026-10-24):
 * the password manager lives in VibeSpace's vault; the kernel detects the forms and fills values the agent never sees. The
 * owner (2026-10-25, D3 yes · D5 reversed): the login grant covers its paired two-step code; an account an agent registers
 * goes THROUGH the vault (the vault mints the password) and is saved automatically, with its provenance — and a password the
 * agent typed itself is saved too, marked `agent-typed` («避免以后丢失，标记一下特殊状态即可»).
 *
 *   · THE ENTRY — a vault entry `web-login:<origin>#<user>` (NAME_RE — the engine's SECRET_RE carries the same shape): origin =
 *     scheme + host (+ port), `user` lower-cased (entryName / parseName). Its value is the sealed JSON record (recordOf /
 *     textOf): {v:1, origin, origins?, username, password, totpName?, createdAt, by, source, strength, createdIn?, submittedAt,
 *     pending?, previous?, lastUsedAt}. `publicOf` = the record without a password (the Vault window's facts).
 *   · THE FORM — `VibeSpace.credentialFormDetected` → formOf (fieldId kernel-private, passed back verbatim — Q5; each password
 *     field's `constraints` — Q5b); a held http-auth surface's credential fields → formOfSurface (the same road answers it).
 *   · THE FILL VERDICT (fillVerdict) — in order: a form on the tab · THE PHISHING RULE (pageOrigin === frameOrigin === the
 *     entry's origin, exact to the port, never the registrable domain; https, or http on localhost only) · ONE entry (several ⇒
 *     login_ambiguous) · THE GRANT (door `browser-login`: the rows of `<origin>#<user>`, `<origin>#*` and `*` ADD — GM.admits,
 *     the model's own refusal named; lane vault-agent-own: a login the CALLER stored itself — its entry's `owner` is one of the
 *     caller's ids, `owners` — is its own to fill, no grant) · the vault open. Then `valuesOf` maps the opened values onto the form's field ids.
 *   · THE PASSWORD the vault mints (generatePassword) — ≥ 20 characters from an INJECTED rng (a site that caps the length
 *     lower gets its cap, never under GENERATED_MIN), every class of the charset present, the site's constraints honoured
 *     (min / max length, the pattern read as the browser reads it); a pattern no candidate satisfies ⇒
 *     password_rules_unsupported by name — never a weak fallback.
 *   · THE SAVE VERDICT (saveVerdict) after `VibeSpace.credentialSubmitted`: new (a vault-minted entry confirmed by the page)
 *     · same (nothing written, no notice) · update (the old value kept in `previous` for one revision) · agent-typed (a password
 *     the vault never minted — saved, strength unknown) · owner-card (a person typed it in a live-view takeover: the owner's
 *     card decides) · none (nothing to save). `nextRecord` builds what the ONE writer seals.
 *   · THE WORDS — the agent's (loginText: origins, user names and closed words — never a value, never a page's own text) and
 *     the owner's notice (noticeWords: i18n keys + params).
 *
 * Gate: scripts/test-browser-login.mjs (fast — every row here + the fake kernel's credentialFormDetected → fillCredential →
 * credentialSubmitted leg).
 */
const GM = require('./grant-model.js');

const PREFIX = 'web-login:';
const DOOR = 'browser-login';
const USER_MAX = 160;
const FORMS_MAX = 8;          // a tab keeps its last 8 forms (the watch's e.forms), cleared on navigation
const FIELDS_MAX = 16;
const PATTERN_MAX = 256;      // a site's pattern longer than this is not tried (password_rules_unsupported)
const GENERATED_LEN = 20;     // the vault's own length when the site says nothing
const GENERATED_MIN = 12;     // a site that caps the length under this is refused — never a weak password
const GENERATED_MAX = 128;
const TEXT_MAX = 900;
const FORM_KINDS = Object.freeze(['login', 'signup', 'change-password', 'otp']);
const FIELD_TYPES = Object.freeze(['username', 'password', 'new-password', 'otp']);
const BY = Object.freeze(['owner', 'agent']);
const SOURCES = Object.freeze(['owner', 'vault-minted', 'agent-typed']);
const STRENGTHS = Object.freeze(['generated', 'unknown']);
const SAVE_STATES = Object.freeze(['new', 'same', 'update', 'agent-typed', 'owner-card', 'none']);
/** Every refusal of the road, by name (the routes' STATUS table carries each). */
const REFUSALS = Object.freeze(['login_no_form', 'login_phishing', 'login_ambiguous', 'login_not_granted', 'vault_locked', 'password_rules_unsupported', 'login_no_entry', 'login_exists', 'login_bad_origin', 'login_bad_user']);
const HOST = '(?:[a-z0-9-]{1,63}(?:\\.[a-z0-9-]{1,63}){0,20}|\\[[0-9a-f:.]{2,45}\\])';
const ORIGIN_SRC = `https?:\\/\\/${HOST}(?::\\d{1,5})?`;
const USER_SRC = '[^\\s#\\u0000-\\u001f\\u007f]{1,160}';
const ORIGIN_RE = new RegExp(`^${ORIGIN_SRC}$`);
/** THE ENTRY NAME (src/server/vault-engine.js SECRET_RE spells the same shape — test-browser-login pins they agree). */
const NAME_RE = new RegExp(`^web-login:(${ORIGIN_SRC})#(${USER_SRC})$`);
const FIELD_ID_RE = /^[\x21-\x7e]{1,64}$/;
const TOTP_NAME_RE = /^[\w.-]{1,120}$/;
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

const str = (v) => (v === undefined || v === null ? '' : String(v));
const num = (v) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : null);
const no = (code, error, extra = {}) => ({ ok: false, code, error, ...extra });

// ── origins, names, resources ───────────────────────────────────────────────
/** A page's origin: scheme + host (+ a port that is not the default) — https / http only, never user-info, a path or a query;
 *  a bare host is read as https. → the origin | null. */
function originOf(raw) {
  let s = str(raw).trim();
  if (!s || s.length > 2048 || s === 'null') return null;   // an opaque origin is no site
  if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) s = 'https://' + s;
  let u; try { u = new URL(s); } catch { return null; }
  if ((u.protocol !== 'https:' && u.protocol !== 'http:') || u.username || u.password) return null;
  return ORIGIN_RE.test(u.origin) ? u.origin : null;
}
const hostOf = (origin) => { const m = /^https?:\/\/([^/]+?)(?::\d+)?$/.exec(str(origin)); return m ? m[1] : ''; };
/** https, or http on this machine only (localhost / 127.0.0.1 / [::1] / *.localhost). */
function secureOrigin(origin) {
  const o = originOf(origin);
  if (!o || o !== origin) return false;
  if (o.startsWith('https://')) return true;
  const h = hostOf(o);
  return LOCAL_HOSTS.has(h) || h.endsWith('.localhost');
}
/** The name's user: trimmed, lower-cased, ≤ 160, no white space / `#` / control character — and never `*` (the grant's «any
 *  account on this site»: a user of that name would BE the wildcard). */
function userOf(raw) { const u = str(raw).trim().toLowerCase(); return u && u !== '*' && u.length <= USER_MAX && !/[\s#\u0000-\u001f\u007f]/.test(u) ? u : null; }
/** `web-login:<origin>#<user>` | null. */
function entryName(origin, user) { const o = originOf(origin), u = userOf(user); return o && u ? PREFIX + o + '#' + u : null; }
/** An entry name → {origin, user} | null (the origin must already be canonical). */
function parseName(name) { const m = NAME_RE.exec(str(name)); if (!m) return null; return originOf(m[1]) === m[1] && userOf(m[2]) === m[2] ? { origin: m[1], user: m[2] } : null; }
const isEntryName = (name) => !!parseName(name);
/** The grant resources that may admit a login of `user` on `origin` — its own row, «any account on this site», «any site». */
function grantResources(origin, user) { const o = originOf(origin), u = userOf(user); return o && u ? [`${o}#${u}`, `${o}#*`, '*'] : ['*']; }
/** A resource of the browser-login door (the model's own shape — GM.RESOURCE_SHAPES). */
const resourceOk = (r) => GM.resourceShapeOk(DOOR, r);
/** The words a grant scope is said in (the Vault window's 「用于…」 choices). */
function scopeOf(resource) { const r = str(resource); if (r === '*') return 'any-site'; if (/#\*$/.test(r)) return 'any-account'; return resourceOk(r) ? 'this-account' : null; }

// ── the record ─────────────────────────────────────────────────────────────
function prevOf(p) {
  if (!p || typeof p !== 'object' || typeof p.password !== 'string' || !p.password) return null;
  return { password: p.password.slice(0, 4096), source: SOURCES.includes(p.source) ? p.source : 'owner', strength: STRENGTHS.includes(p.strength) ? p.strength : 'unknown', replacedAt: num(p.replacedAt) };
}
/** The sealed JSON → the record (every field checked; anything else dropped) | null. */
function recordOf(text) {
  let r; try { r = typeof text === 'string' ? JSON.parse(text) : text; } catch { return null; }
  if (!r || typeof r !== 'object' || r.v !== 1) return null;
  const origin = originOf(r.origin);
  if (!origin || origin !== r.origin || typeof r.username !== 'string' || !r.username || r.username.length > 256 || typeof r.password !== 'string' || !r.password || r.password.length > 4096) return null;
  const out = { v: 1, origin, username: r.username, password: r.password, createdAt: num(r.createdAt), by: BY.includes(r.by) ? r.by : 'owner', source: SOURCES.includes(r.source) ? r.source : 'owner', strength: STRENGTHS.includes(r.strength) ? r.strength : 'unknown', submittedAt: num(r.submittedAt), lastUsedAt: num(r.lastUsedAt) };
  const origins = Array.isArray(r.origins) ? r.origins.map(originOf).filter((o) => o && o !== origin).slice(0, 8) : [];
  if (origins.length) out.origins = [...new Set(origins)];
  if (TOTP_NAME_RE.test(str(r.totpName))) out.totpName = r.totpName;
  if (r.createdIn && typeof r.createdIn === 'object' && str(r.createdIn.conversation)) out.createdIn = { conversation: str(r.createdIn.conversation).slice(0, 200), at: num(r.createdIn.at) };
  if (r.pending === 'register' || r.pending === 'change') out.pending = r.pending;
  const prev = prevOf(r.previous);
  if (prev) out.previous = prev;
  return out;
}
/** The record → the text the vault seals (the fields recordOf reads, nothing else). */
function textOf(rec) { const r = recordOf(rec); if (!r) throw new TypeError('browser-login: not a web-login record'); return JSON.stringify(r); }
/** The record as a person's window may list it — every fact, never a password (the previous one neither). */
function publicOf(rec) {
  const r = recordOf(rec);
  if (!r) return null;
  const { password, previous, ...rest } = r;
  void password;
  return { ...rest, hasPrevious: !!previous, ...(previous ? { previousReplacedAt: previous.replacedAt } : {}) };
}
/** A NEW record: `source` 'owner' (the owner's own, in the Vault window) · 'vault-minted' (pending until the page takes it) ·
 *  'agent-typed' (a submission the vault did not mint). */
function newRecord({ origin, username, password, totpName = null, source = 'owner', now = 0, conversation = null, pending = null } = {}) {
  const r = { v: 1, origin: originOf(origin), username: str(username).trim(), password: str(password), createdAt: now, by: source === 'owner' ? 'owner' : 'agent', source, strength: source === 'vault-minted' ? 'generated' : 'unknown',
    submittedAt: source === 'vault-minted' ? null : now, lastUsedAt: null, ...(totpName ? { totpName } : {}), ...(conversation ? { createdIn: { conversation: str(conversation).slice(0, 200), at: now } } : {}), ...(pending ? { pending } : {}) };
  return recordOf(r);
}
/** A change the vault minted on an existing entry (a change-password form): the new value in, the old kept one revision. */
function changedRecord(rec, password, { now = 0, conversation = null } = {}) {
  const r = recordOf(rec);
  if (!r) return null;
  return recordOf({ ...r, password, source: 'vault-minted', strength: 'generated', submittedAt: null, pending: 'change', previous: { password: r.password, source: r.source, strength: r.strength, replacedAt: now }, ...(conversation ? { createdIn: r.createdIn || { conversation, at: now } } : {}) });
}

// ── the form ───────────────────────────────────────────────────────────────
function constraintsOf(c) {
  if (!c || typeof c !== 'object') return null;
  const n = (v) => { const x = num(v); return x !== null && Number.isInteger(x) && x >= 0 && x <= 4096 ? x : null; };
  return { minLength: n(c.minLength), maxLength: n(c.maxLength), pattern: typeof c.pattern === 'string' && c.pattern ? c.pattern.slice(0, PATTERN_MAX + 1) : null, required: c.required === true };
}
function kindOfFields(fields) {
  const t = new Set(fields.map((f) => f.type));
  if (t.has('new-password') && t.has('password')) return 'change-password';
  if (t.has('new-password')) return 'signup';
  if (fields.every((f) => f.type === 'otp')) return 'otp';
  return 'login';
}
/** `VibeSpace.credentialFormDetected` → the form the tab keeps | null. The field ids are the kernel's own tokens (passed back
 *  verbatim — Q5); the types a closed set (an unknown one dropped); a password field's `constraints` kept (Q5b); `hasSubmit`,
 *  labels, names and rects are never kept (the page's words never reach anyone from here). */
function formOf(p, { now = 0 } = {}) {
  if (!p || typeof p !== 'object') return null;
  const id = str(p.surfaceId || p.formId);
  if (!FIELD_ID_RE.test(id)) return null;
  const fields = [];
  for (const f of Array.isArray(p.fields) ? p.fields.slice(0, FIELDS_MAX * 2) : []) {
    if (!f || typeof f !== 'object') continue;
    const fieldId = str(f.fieldId), type = str(f.type);
    if (!FIELD_ID_RE.test(fieldId) || !FIELD_TYPES.includes(type) || fields.some((x) => x.fieldId === fieldId)) continue;
    const c = type === 'password' || type === 'new-password' ? constraintsOf(f.constraints) : null;
    fields.push({ fieldId, type, ...(c ? { constraints: c } : {}) });
    if (fields.length >= FIELDS_MAX) break;
  }
  if (!fields.length) return null;
  const pageOrigin = originOf(p.pageOrigin || p.origin);
  const frameOrigin = p.frameOrigin === undefined || p.frameOrigin === null || p.frameOrigin === '' ? pageOrigin : originOf(p.frameOrigin);
  return { id, targetId: str(p.targetId).slice(0, 80) || null, pageOrigin, frameOrigin, actionOrigin: originOf(p.actionOrigin), kind: FORM_KINDS.includes(p.kind) ? p.kind : kindOfFields(fields), fields, at: num(now) || 0 };
}
/** A held http-auth SURFACE (P1's block) → a form the same road fills: its text field = the username, its password /
 *  credential field = the password, answered with its credential answer (else its accept) — a proxy's sign-in is no site's. */
function formOfSurface(b, { now = 0 } = {}) {
  if (!b || b.kind !== 'http-auth' || !FIELD_ID_RE.test(str(b.id))) return null;
  const fields = [];
  for (const f of Array.isArray(b.fields) ? b.fields : []) {
    const fieldId = str(f && f.fieldId);
    if (!FIELD_ID_RE.test(fieldId) || fields.some((x) => x.fieldId === fieldId)) continue;
    const type = f.type === 'password' || f.type === 'credential' ? 'password' : f.type === 'text' ? 'username' : null;
    if (type && !(type === 'username' && fields.some((x) => x.type === 'username'))) fields.push({ fieldId, type });
  }
  const answer = (b.answers || []).find((a) => a && a.kind === 'credential') || (b.answers || []).find((a) => a && a.kind === 'accept') || null;
  if (!fields.some((f) => f.type === 'password') || !answer) return null;
  const o = originOf(b.url);
  return { id: str(b.id), targetId: str(b.targetId).slice(0, 80) || null, pageOrigin: o, frameOrigin: b.frameOrigin ? originOf(b.frameOrigin) : o, actionOrigin: null, kind: 'http-auth', fields, at: num(now) || num(b.openedAt) || 0, surface: true, answerId: str(answer.id), proxy: !!(b.detail && b.detail.isProxy) };
}
/** Keep a tab's forms: the newest last, one per id, ≤ FORMS_MAX. */
function keepForm(forms, f) { const out = (Array.isArray(forms) ? forms : []).filter((x) => x && x.id !== f.id); out.push(f); return out.slice(-FORMS_MAX); }
const typesOf = (f) => new Set((f && f.fields || []).map((x) => x.type));
const STEPS = Object.freeze(['email', 'password', 'totp']);
/** Which step a login form is on (`'email' | 'password' | 'totp'`): a password / new-password box ⇒ `'password'`; an otp box
 *  alone ⇒ `'totp'`; a username / email box alone (step 1 of a two-step sign-in) ⇒ `'email'`. */
function stepOfForm(form) {
  const list = Array.isArray(form) ? form : (form && Array.isArray(form.fields) ? form.fields : []);
  const t = new Set(list.map((x) => x && x.type));
  if (t.has('password') || t.has('new-password')) return 'password';
  if (t.has('otp')) return 'totp';
  if (t.has('username')) return 'email';
  return null;
}
/** Classify ONE visible input / accessibility-tree textbox (read-only metadata — never `.value`) into a `FIELD_TYPES` row
 *  (`{fieldId, type, constraints?}`) or `null` when it is not a login input (a search box, a button, a hidden / disabled field). */
function classifyLoginField(raw, { hasPassword = false } = {}) {
  if (!raw || typeof raw !== 'object' || raw.visible === false || raw.disabled === true || raw.readOnly === true || raw.hidden === true) return null;
  const role = str(raw.role).toLowerCase().trim();
  if (role && !['textbox', 'combobox', 'spinbutton'].includes(role)) return null;
  const it = str(raw.type || raw.inputType).toLowerCase().trim();
  if (['hidden', 'submit', 'button', 'reset', 'checkbox', 'radio', 'file', 'image', 'range', 'color', 'search', 'date', 'time', 'month', 'week', 'datetime-local'].includes(it)) return null;
  const fieldId = str(raw.fieldId || raw.ref || raw.id);
  if (!FIELD_ID_RE.test(fieldId)) return null;
  const acParts = str(raw.autocomplete).toLowerCase().trim().split(/\s+/).filter(Boolean);
  const ac = acParts.length ? acParts[acParts.length - 1] : '';
  const hint = [raw.name, raw.id, raw.label, raw.ariaLabel, raw.placeholder].map(str).filter(Boolean).join(' ');
  if (!ac && it !== 'password' && /\b(search|query|filter|find)\b/i.test(hint)) return null;
  let type = null;
  if (ac === 'one-time-code' || /\b(totp|otp|one[-_ ]?time|2fa|mfa|verification[-_ ]?code|security[-_ ]?code|enter[-_ ]?code|auth[-_ ]?code|two[-_ ]?step|passcode)\b/i.test(hint) || ((it === 'tel' || str(raw.inputMode).toLowerCase().trim() === 'numeric') && /\b(code|pin|totp|otp|token)\b/i.test(hint))) type = 'otp';
  else if (ac === 'new-password' || (it === 'password' && /\b(new[-_ ]?pass|create[-_ ]?pass|confirm[-_ ]?pass)\b/i.test(hint))) type = 'new-password';
  else if (it === 'password' || ac === 'current-password' || /\b(password|passwd|enter your password)\b/i.test(hint)) type = 'password';
  else if (ac === 'username' || ac === 'email' || it === 'email' || /\b(user(?:name)?|e-?mail|identifier|login|account|phone)\b/i.test(hint) || (hasPassword && (it === 'text' || it === 'tel' || it === ''))) type = 'username';
  if (!type) return null;
  const c = type === 'password' || type === 'new-password' ? constraintsOf(raw.constraints || raw) : null;
  return { fieldId, type, ...(c ? { constraints: c } : {}) };
}
/** A standard Chrome tab's read-only input / accessibility-tree descriptors → a `formOf` record with `.step` (`'email' |
 *  'password' | 'totp'`), or `null` when the page holds no sign-in field. */
function classifyChromeForm(raw, { now = 0 } = {}) {
  if (!raw || typeof raw !== 'object') return null;
  const list = Array.isArray(raw.fields) ? raw.fields : Array.isArray(raw.inputs) ? raw.inputs : Array.isArray(raw.nodes) ? raw.nodes : [];
  const hasPassword = list.some((x) => x && x.visible !== false && !x.disabled && !x.readOnly && !x.hidden && (str(x.type || x.inputType).toLowerCase().trim() === 'password' || /\b(password|passwd|enter your password|new-password|current-password)\b/i.test([x.autocomplete, x.name, x.id, x.label, x.ariaLabel, x.placeholder].map(str).join(' '))));
  const fields = list.slice(0, FIELDS_MAX * 2).map((x, i) => classifyLoginField(x && typeof x === 'object' && !x.fieldId && !x.ref ? { ...x, fieldId: `vs-f-${i}` } : x, { hasPassword })).filter(Boolean);
  if (!fields.length) return null;
  const f = formOf({ surfaceId: str(raw.surfaceId || raw.formId) || `chrome-login-${str(raw.targetId || 'tab').slice(0, 32)}`, targetId: raw.targetId, pageOrigin: raw.pageOrigin || raw.origin, frameOrigin: raw.frameOrigin, actionOrigin: raw.actionOrigin, kind: raw.kind, fields }, { now });
  return f ? { ...f, step: stepOfForm(f) } : null;
}
/** A form the mode can use: a sign-in needs a username, password or two-step field; a new password (signup / change)
 *  needs a new-password field — or a signup's plain password field. */
function usable(f, want) {
  const t = typesOf(f);
  if (want === 'new') return t.has('new-password') || (f.kind === 'signup' && t.has('password'));
  return t.has('password') || t.has('otp') || t.has('username');
}
/** The field ids by what they take. In a signup a plain password field takes the new password (a kernel that names no
 *  new-password field there); in a change-password form the current password field takes the old one. */
function planOf(form, mode) {
  const by = (type) => form.fields.filter((f) => f.type === type).map((f) => f.fieldId);
  const newIds = by('new-password');
  const pwIds = by('password');
  if (mode === 'signup' && !newIds.length) return { username: by('username'), password: [], newPassword: pwIds, otp: [] };
  return { username: by('username'), password: mode === 'signup' ? [] : pwIds, newPassword: mode === 'login' ? [] : newIds, otp: mode === 'login' ? by('otp') : [] };
}
/** The new-password fields' constraints, merged (the strictest of each; every pattern must hold). */
function constraintsFor(form, plan) {
  const ids = new Set(plan.newPassword);
  const cs = form.fields.filter((f) => ids.has(f.fieldId) && f.constraints).map((f) => f.constraints);
  const mins = cs.map((c) => c.minLength).filter((x) => x !== null), maxs = cs.map((c) => c.maxLength).filter((x) => x !== null && x > 0);
  const patterns = [...new Set(cs.map((c) => c.pattern).filter(Boolean))];
  return { minLength: mins.length ? Math.max(...mins) : null, maxLength: maxs.length ? Math.min(...maxs) : null, patterns };
}

// ── the fill verdict ───────────────────────────────────────────────────────
const LOCKED = 'the vault is locked — the owner has already been told; a person unlocks it on this instance\'s page, and nothing is filled until then (do not ask them to)';
function grantWords(code, origin) {
  if (code === 'excepted') return `the owner left this conversation out of the logins it may use on ${origin} — only they lift that, in the Vault window (Web logins → Used by…)`;
  if (code === 'groups_unreadable') return 'the Task Group list could not be read just now, so no login is filled (never «not in any group») — try again in a moment';
  if (code === 'unknown_shape') return 'a permission row for web logins could not be read, so none is filled — the owner sees it in the Vault window';
  return `this conversation may not use a saved login on ${origin} — the owner grants it in the Vault window (Web logins → Used by…: this account, any account on this site, or any site)`;
}
/**
 * May THIS fill happen, and how? → `{ok:true, mode:'login'|'signup'|'change', form, origin, user, name, plan, constraints?}` |
 * `{ok:false, code, error}`. `forms` = the tab's (oldest first); `origin` = the one the agent named (or null: the newest form's);
 * `entries` = `[{origin, user}]` (the vault's names); `grantRows(resource)` = the grants store's rows of that resource;
 * `facts` = the caller's (GM.admits'); `vaultState` = the engine's.
 */
function fillVerdict({ forms = [], origin = null, user = null, newUser = null, generate = false, entries = [], grantRows = () => [], facts = {}, vaultState = 'locked', owners = [] } = {}) {
  const mode = newUser !== null && newUser !== undefined && newUser !== '' ? 'signup' : generate ? 'change' : 'login';
  const want = mode === 'login' ? 'login' : 'new';
  const asked = origin !== null && origin !== undefined && origin !== '' ? originOf(origin) : null;
  if (origin && !asked) return no('login_bad_origin', `"${str(origin).slice(0, 80)}" is not a website address — give its origin (https://host[:port]) or nothing (the form on your tab)`);
  const list = (Array.isArray(forms) ? forms : []).filter(Boolean);
  const mine = list.filter((f) => usable(f, want) && !f.proxy);
  if (!mine.length) return no('login_no_form', list.some((f) => f.proxy) ? 'the sign-in on your tab is a proxy\'s, not a website\'s — no saved login answers it' : want === 'new' ? 'no form with a new-password field is on your tab — open the site\'s sign-up (or change-password) page first; only the custom browser kernel reports forms' : 'no login form is on your tab — open the site\'s sign-in page first; only the custom browser kernel reports forms (standard Chrome never does)');
  const form = asked ? mine.filter((f) => f.pageOrigin === asked).pop() || null : mine[mine.length - 1];
  if (!form) return no('login_phishing', `the login form on your tab belongs to ${mine[mine.length - 1].pageOrigin || 'a page with no origin'}, not to ${asked} — a login is filled only on its own site`);
  if (!form.pageOrigin || form.frameOrigin !== form.pageOrigin) return no('login_phishing', `the form sits in a frame of ${form.frameOrigin || 'a page with no origin'} inside ${form.pageOrigin || 'a page with no origin'} — a login is filled only where the page and its frame are the site itself`);
  if (!secureOrigin(form.pageOrigin)) return no('login_phishing', `${form.pageOrigin} is not https — a login is filled over https only (plain http on this machine's localhost alone)`);
  const o = form.pageOrigin;
  const here = (Array.isArray(entries) ? entries : []).filter((e) => e && e.origin === o);
  let u;
  if (mode === 'signup') {
    u = userOf(newUser);
    if (!u) return no('login_bad_user', `"${str(newUser).slice(0, 60)}" is not a user name a login can be saved under (no spaces, no #, ≤ ${USER_MAX} characters)`);
    if (here.some((e) => e.user === u)) return no('login_exists', `a login for ${u} on ${o} is already in the vault — sign in with: vibespace-browser login ${o} --user ${u}`);
  } else {
    if (user !== null && user !== undefined && user !== '' && !userOf(user)) return no('login_bad_user', `"${str(user).slice(0, 60)}" is not a user name a login is saved under`);
    const want1 = user ? userOf(user) : null;
    const cands = want1 ? here.filter((e) => e.user === want1) : here;
    if (!cands.length) return no('login_no_entry', `no saved login for ${want1 || 'any account'} on ${o} is in the vault — the owner adds one in the Vault window (Web logins), or register an account through the vault: vibespace-browser login ${o} --new-user <name> --generate`);
    if (cands.length > 1) return no('login_ambiguous', `the vault holds ${cands.length} logins on ${o} (${cands.map((e) => e.user).slice(0, 8).join(', ')}) — say which: --user <name>`);
    u = cands[0].user;
  }
  const rows = grantResources(o, u).flatMap((r) => { try { return grantRows(r) || []; } catch { return [{ door: DOOR, resource: r, to: null }]; } });
  const kept = mode === 'signup' ? null : here.find((e) => e.user === u) || null;   // lane vault-agent-own: a login the caller stored itself is its own to fill
  const own = !!(kept && typeof kept.owner === 'string' && kept.owner !== '' && (Array.isArray(owners) ? owners : []).includes(kept.owner));
  const g = own ? { ok: true, via: 'own', row: null } : GM.admits(rows, facts);
  if (!g.ok) return no('login_not_granted', grantWords(g.code, o), { grant: g.code, mode, origin: o, name: PREFIX + o + '#' + u });
  if (vaultState !== 'unlocked') return no('vault_locked', LOCKED, { vault: str(vaultState) || 'locked' });
  const plan = planOf(form, mode);
  return { ok: true, mode, form, origin: o, user: u, name: PREFIX + o + '#' + u, plan, ...(mode === 'login' ? {} : { constraints: constraintsFor(form, plan) }), grant: { via: g.via, resource: g.row && g.row.resource } };
}
/** The opened values → `{<fieldId>: value}` for VibeSpace.fillCredential, plus WHAT was filled (the agent's words: kinds
 *  only). A two-step field is filled only with a code; a field the plan has no value for is left alone. */
function valuesOf(v, { username = null, password = null, newPassword = null, otp = null } = {}) {
  const values = {}; const filled = [];
  const put = (ids, val, what) => { if (!ids || !ids.length || typeof val !== 'string' || !val) return; for (const id of ids) values[id] = val; if (!filled.includes(what)) filled.push(what); };
  put(v.plan.username, username, 'username');
  put(v.plan.password, password, 'password');
  put(v.plan.newPassword, newPassword, 'new-password');
  put(v.plan.otp, otp, 'otp');
  return { values, filled };
}

// ── the password the vault mints ───────────────────────────────────────────
const CLASSES = Object.freeze({ lower: 'abcdefghijklmnopqrstuvwxyz', upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', digit: '0123456789', symbol: '!#%*+-.:=?@^_~' });
/** The charsets tried in order — the strongest first; a pattern no ladder rung satisfies is refused by name. */
const LADDER = Object.freeze([['lower', 'upper', 'digit', 'symbol'], ['lower', 'upper', 'digit'], ['lower', 'digit', 'symbol'], ['upper', 'digit', 'symbol'], ['lower', 'digit'], ['upper', 'digit'], ['lower', 'upper'], ['digit'], ['lower'], ['upper']]);
const TRIES_PER_RUNG = 4;
/** One uniform index in [0, n) from the injected rng (rejection sampling — never a modulo bias). */
function randIndex(rng, n) {
  const lim = 256 - (256 % n);
  for (let i = 0; i < 4096; i++) { const b = rng(1)[0]; if (b < lim) return b % n; }
  throw new Error('browser-login: the random source gave no usable byte');
}
function candidate(rng, classes, length) {
  const all = classes.map((c) => CLASSES[c]).join('');
  const out = classes.map((c) => CLASSES[c][randIndex(rng, CLASSES[c].length)]);   // every class present
  while (out.length < length) out.push(all[randIndex(rng, all.length)]);
  for (let i = out.length - 1; i > 0; i--) { const j = randIndex(rng, i + 1); [out[i], out[j]] = [out[j], out[i]]; }
  return out.join('');
}
/** The site's pattern as the browser reads it (the whole value must match; the `v` flag, else `u`) — null = unreadable. */
function patternOf(p) {
  if (typeof p !== 'string' || !p || p.length > PATTERN_MAX) return null;
  for (const flags of ['v', 'u']) { try { return new RegExp(`^(?:${p})$`, flags); } catch { /* the next flag */ } }
  return null;
}
/**
 * THE VAULT'S PASSWORD for a new-password field: `constraints` = {minLength, maxLength, patterns: [] | pattern} (the site's —
 * Q5b), `rng(n)` = n random bytes (injected: node crypto on the server, a seeded one in the suites). → `{ok:true, password,
 * length, classes}` | `{ok:false, code:'password_rules_unsupported', error}` — never a weak fallback.
 */
function generatePassword(constraints = {}, rng) {
  if (typeof rng !== 'function') throw new TypeError('browser-login: generatePassword needs an rng');
  const c = constraints || {};
  const min = num(c.minLength) || 0, max = num(c.maxLength) && num(c.maxLength) > 0 ? num(c.maxLength) : null;
  const pats = [...(Array.isArray(c.patterns) ? c.patterns : []), ...(c.pattern ? [c.pattern] : [])].filter(Boolean);
  const refuse = (why) => no('password_rules_unsupported', `the site's password rules cannot be met by a strong password (${why}) — register this account by hand in the live view, or not at all`);
  if (max !== null && max < min) return refuse(`at least ${min} and at most ${max} characters`);
  const length = Math.min(Math.max(GENERATED_LEN, min), max === null ? GENERATED_MAX : max, GENERATED_MAX);
  if (length < GENERATED_MIN) return refuse(`at most ${max} characters — under ${GENERATED_MIN}`);
  if (length < min) return refuse(`at least ${min} characters`);
  const res = pats.map(patternOf);
  if (res.some((r) => !r)) return refuse('a pattern the browser cannot read');
  for (const classes of LADDER) {
    if (length < classes.length) continue;
    for (let i = 0; i < (res.length ? TRIES_PER_RUNG : 1); i++) {
      const pw = candidate(rng, classes, length);
      if (res.every((r) => r.test(pw))) return { ok: true, password: pw, length, classes: [...classes] };
    }
  }
  return refuse(`the pattern ${JSON.stringify(pats[0]).slice(0, 80)}`);
}

// ── the save verdict ───────────────────────────────────────────────────────
/**
 * `VibeSpace.credentialSubmitted` against what the vault holds → `{state, confirm?, why?}`. `existing` = the opened record of
 * the submission's entry (or null); `password` = the submitted one when the kernel hands it (the loopback socket only);
 * `by` = 'agent' (the agent's page) | 'human' (a person typing in a live-view takeover).
 */
function saveVerdict({ existing = null, password = null, outcome = 'navigated', by = 'agent' } = {}) {
  const rec = existing ? recordOf(existing) : null;
  const pw = typeof password === 'string' && password ? password : null;
  if (str(outcome) === 'error') return { state: 'none', why: 'the page did not take the submission' };
  const pendingOk = rec && rec.pending && (!pw || pw === rec.password);
  if (pendingOk) return { state: rec.pending === 'change' ? 'update' : 'new', confirm: true };
  if (by === 'human') return rec && pw && rec.password === pw ? { state: 'same' } : pw ? { state: 'owner-card' } : { state: 'none', why: 'the kernel did not hand the password' };
  if (!pw) return { state: 'none', why: 'the kernel did not hand the password' };
  if (!rec) return { state: 'agent-typed' };
  return rec.password === pw ? { state: 'same' } : { state: 'update' };
}
/** What the ONE writer seals for a save verdict → the next record | null (nothing to write). */
function nextRecord(v, { existing = null, origin, username, password = null, now = 0, conversation = null } = {}) {
  const rec = existing ? recordOf(existing) : null;
  if (!v || v.state === 'same' || v.state === 'none' || v.state === 'owner-card') return null;
  if (v.confirm && rec) { const { pending, ...rest } = rec; void pending; return recordOf({ ...rest, submittedAt: now }); }
  if (v.state === 'agent-typed') return newRecord({ origin, username, password, source: 'agent-typed', now, conversation });
  if (v.state === 'update' && rec && password) return recordOf({ ...rec, password, source: 'agent-typed', strength: 'unknown', submittedAt: now, previous: { password: rec.password, source: rec.source, strength: rec.strength, replacedAt: now } });
  return null;
}

// ── the words ──────────────────────────────────────────────────────────────
const WHAT = Object.freeze({ username: 'the user name', password: 'the password', 'new-password': 'a new password', otp: 'the two-step code' });
const listWords = (xs) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
/**
 * THE AGENT'S SENTENCE for one `vibespace-browser login` — a refusal (`{ok:false, code, error}`) or the fill's answer
 * (`{ok, mode, origin, user, filled, submitted, receipt, otpMissing, length}`). Origins, the user name and closed words only —
 * never a value (there is none here), never the page's own text. The route hands it through the belt (PT.toAgentText).
 */
function loginText(r) {
  if (!r || typeof r !== 'object') return '';
  if (!r.ok) return str(r.error) || 'the login was not filled';   // the CLI adds the code by name
  const what = listWords((r.filled || []).map((k) => WHAT[k] || k));
  const site = `${str(r.origin)}${r.user ? ` (${r.user})` : ''}`;
  const tail = r.submitted ? ' and submitted the form' : ' — the form is NOT submitted: press its button (or run the same login with --submit)';
  const receipt = r.receipt ? ` Receipt ${r.receipt}.` : '';
  const stepWord = r.step && STEPS.includes(r.step) ? ` Step: ${r.step}.` : '';
  const otp = r.otpMissing ? ' The page also asks for a two-step code the vault holds none for — the owner can pair one with this login in the Vault window.' : '';
  if (r.mode === 'signup') return `Filled ${what} on ${site}: the vault made a ${r.length || GENERATED_LEN}-character password for the new account and keeps it — you never see it${tail}. When the page takes the form the vault saves this login automatically and tells the owner.${stepWord}${receipt}`;
  if (r.mode === 'change') return `Filled ${what} on ${site}: the vault made a new ${r.length || GENERATED_LEN}-character password and keeps the old one for one revision — you never see either${tail}.${stepWord}${receipt}`;
  return `Filled ${what} on ${site} from the vault — you never see the values${tail}.${otp}${stepWord}${receipt}`;
}
/** THE OWNER'S NOTICE after a save (For you, informational — never an approval): i18n keys + params, the English words. */
const NOTICE = Object.freeze({
  new: { text: 'An agent registered {user} on {site} — the vault made its password and saved the login', detail: 'The agent never saw the password. It is in the Vault under Web logins, marked as registered by an agent.' },
  'agent-typed': { text: 'An agent signed up {user} on {site} with a password it typed itself — saved to the vault, marked «typed by the agent»', detail: 'The vault did not make this password, so its strength is unknown and the agent knows it. It is in the Vault under Web logins — change it on the site if you want one only the vault knows.' },
  update: { text: 'The login {user} on {site} was updated — its password changed', detail: 'The previous password is kept in the entry for one revision (Vault → Web logins).' },
});
const fill = (s, p) => String(s).replace(/\{(\w+)\}/g, (m, k) => (p && p[k] !== undefined ? String(p[k]) : m));
function noticeWords(state, { origin = '', username = '', conversation = '' } = {}) {
  const w = NOTICE[state];
  if (!w) return null;
  const params = { user: str(username).slice(0, 120), site: hostOf(origin) || str(origin).slice(0, 120) };
  const conv = str(conversation).slice(0, 80);
  return { text: fill(w.text, params) + (conv ? ` — ${conv}` : ''), detail: w.detail, i18n: { text: { key: w.text, params }, detail: [{ key: w.detail }] } };
}

module.exports = {
  PREFIX, DOOR, USER_MAX, FORMS_MAX, FIELDS_MAX, PATTERN_MAX, GENERATED_LEN, GENERATED_MIN, GENERATED_MAX, TEXT_MAX, FORM_KINDS, FIELD_TYPES, STEPS, BY, SOURCES, STRENGTHS, SAVE_STATES, REFUSALS,
  NAME_RE, ORIGIN_RE, CLASSES, LADDER, NOTICE, LOCKED,
  originOf, hostOf, secureOrigin, userOf, entryName, parseName, isEntryName, grantResources, resourceOk, scopeOf,
  recordOf, textOf, publicOf, newRecord, changedRecord,
  formOf, formOfSurface, keepForm, stepOfForm, classifyLoginField, classifyChromeForm, planOf, constraintsFor, fillVerdict, valuesOf,
  generatePassword, patternOf, saveVerdict, nextRecord, loginText, noticeWords,
};

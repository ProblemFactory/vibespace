'use strict';
/**
 * THE KERNEL'S SURFACES — PURE (imports nothing; CJS so the dialog watch, the routes, the suites and the client bundle share
 * ONE table). Lane browser-surfaces, 2026-10-25 — P1 of the custom browser kernel (docs/design-custom-browser-plugin.zh.md
 * §2, as built). On a kernel whose `VibeSpace.getVersion` lists the feature `surfaces`, every non-DOM thing the browser would
 * draw itself (a page dialog, a file picker, an HTTP sign-in, a permission ask, a print, a download, a popup, a select's
 * drop-down…) arrives as ONE event shape — `VibeSpace.surfaceOpened / surfaceUpdated / surfaceClosed` — and is answered with
 * `VibeSpace.answerSurface`. ONE BROWSER = ONE SOURCE: on such a kernel the watch reads js-dialog / file-chooser / http-auth /
 * permission / print FROM SURFACES (never `Page.javascriptDialogOpening` & co.); on standard Chrome today's road stays.
 *
 * What lives here (every verdict the watch, the routes and the bar ask):
 *   · SURFACE_KINDS — the kernel's closed set, letter for letter its bridge's VIBESPACE_SURFACE_KINDS (pinned by the census);
 *   · KIND_TABLE — per kind: the CLASS (held: the verb in flight ends `dialog_open` and every later verb repeats it · noted:
 *     never holds, one line in the next result · silent: a trace line), WHO answers (agent = A, the owner only = O, policy =
 *     P), the policy's default, the modality, and the DETAIL KEY WHITELIST (everything else the kernel sends is dropped);
 *   · surfaceBlock — the event → a block the SAME SHAPE as browser-stuck's dialogBlock (type / message / url / openedAt /
 *     openForMs / id) plus the surface's own fields, every page string through the INJECTED page-text rule (the watch hands
 *     src/browser-stuck.js pageText — this module imports nothing), origins as scheme+host+port only;
 *   · applySurfacePatch (surfaceUpdated may change only message / fields / answers / detail / expiresAt), closedBlock;
 *   · answerVerdict — who may answer what, the values against the fields, a file inside the profile's downloads dir;
 *   · policyVerdict — the P answers (permission deny-ahead unless pre-granted, download allow, external-protocol deny,
 *     pointer-lock deny unless pre-granted, a popup the browser's policy blocked denied, payment-request cancelled);
 *   · kernelErrorToCode — the kernel's six error codes mapped BY NAME onto the routes' codes;
 *   · the words: surfaceText (THE sentence a held surface's verb prints — agent-facing, English, never t(); the watch passes
 *     it through src/peer-text.js toAgentText), surfaceNote (the one line of the next result), surfaceListText (`surfaces`),
 *     surfaceWords (the live view's bar and the For-you card — every key a literal t('…') with zh + ja entries).
 */

/** The kernel's 20 kinds — a copy of its bridge's VIBESPACE_SURFACE_KINDS (src/vibespace-spi.mjs), letter for letter. */
const SURFACE_KINDS = Object.freeze(['js-dialog', 'http-auth', 'client-cert', 'permission', 'file-chooser', 'download', 'print', 'popup', 'select-popup', 'webauthn', 'credential', 'payment-request', 'external-protocol', 'interstitial', 'fullscreen', 'pointer-lock', 'media-picker', 'device-chooser', 'native-picker', 'suppressed']);
/** The bridge's six error codes (VIBESPACE_ERROR_CODES) → the routes' codes. */
const KERNEL_ERRORS = Object.freeze({ no_such_surface: 'no_dialog', invalid_action: 'bad_answer', stale_origin: 'surface_stale', invalid_values: 'bad_values', eval_failed: 'answer_failed', no_such_request: 'answer_failed' });
/** The routes' refusal codes this module answers (each in routes/browser.js STATUS). */
const SURFACE_CODES = Object.freeze(['no_dialog', 'bad_answer', 'surface_stale', 'bad_values', 'answer_failed', 'surface_owner_only', 'surface_path_refused', 'surface_changed']);
const FIELD_TYPES = Object.freeze(['text', 'password', 'file', 'choice', 'credential']);
const ANSWER_KINDS = Object.freeze(['accept', 'dismiss', 'choose', 'text', 'file', 'credential']);
const MODALITIES = Object.freeze(['tab-modal', 'non-modal', 'anchor', 'page']);
const CLASSES = Object.freeze(['held', 'noted', 'silent']);
/** How a surface closed / who closed it (the kernel's words kept only inside these sets). */
const CLOSE_HOWS = Object.freeze(['answered', 'dismissed', 'navigated', 'expired', 'tab-closed', 'superseded', 'down']);
const CLOSE_BYS = Object.freeze(['agent', 'user', 'policy', 'auto', 'kernel', 'page', 'tab-closed', 'unknown']);

const ID_MAX = 64;
const KIND_SAID_MAX = 32;
const TITLE_MAX = 200;
const MESSAGE_MAX = 500;
const URL_MAX = 300;
const FIELDS_MAX = 16;
const ANSWERS_MAX = 8;
const LABEL_MAX = 120;
const DETAIL_TEXT_MAX = 200;
const DETAIL_LIST_MAX = 16;
const OPTIONS_MAX = 64;
const VALUE_MAX = 2000;
const FILES_MAX = 16;
/** The agent-facing sentence's own bound (the watch's belt call uses it). */
const TEXT_MAX = 4000;

/**
 * THE KIND TABLE (design §2.3 — the census: one row per kind, a missing row is red). `cls`: held | noted | silent;
 * `agent`: what the agent may pick — 'all', 'dismiss' (only a dismiss-kind answer: the rest is the owner's), a list of answer
 * ids beside the dismiss kind, 'none'; `policy`: the P answer's rule name (policyVerdict) or null; `modality`: the default
 * when the kernel names none; `fixed`: no non-dismiss answer for ANYONE (VibeSpace never does it); `lane`: the phase that
 * owns the rest of this kind (P2 passkeys, P3 logins); `detail`: the key whitelist — `text` (page text, clipped) · `word`
 * (a lower-case token) · `id` · `num` · `bool` · `host` · `origin` · `url` (page text, URL_MAX) · `rect` · `words` (a list
 * of tokens) · ['list', {key: type}] (≤ DETAIL_LIST_MAX objects of those keys); `ids` = the kernel's SPECIALISED answer ids for
 * that kind (its v0.1.1, e92cc2c) — `cls` the class VibeSpace reads (accept · allow · choose: the policy's allow, the card's
 * Approve, the bar's primary), `kind` the answer kind a bare id is given; the id itself is always passed back as sent.
 * `sink` (lane passkey-sink, P2): the kernel FEATURE whose own road answers this kind — on a kernel whose `features` list it
 * (`sinkOf`), the surface is that road's held card only (webauthn: the passkey record — `VibeSpace.webauthnRequest` carries the
 * ceremony, `VibeSpace.webauthnAnswer` / `cancelSurface` answer it; never a dialog_open, never a browser-surface card).
 * lane browser-login (P3): the credential row's answerer is `credentials` — on a kernel that lists it the login form is the web
 * login road's (`VibeSpace.credentialFormDetected` carries the form, `vibespace-browser login` fills it from the vault through
 * `VibeSpace.fillCredential`); the surface stays NOTED (the agent may only dismiss it) and its line names the `login` verb.
 */
const KIND_TABLE = Object.freeze({
  'js-dialog': { cls: 'held', agent: 'all', policy: null, modality: 'tab-modal', detail: { dialogType: 'word', defaultPrompt: 'text' } }, // alert: P accept — the watch's autoAnswerVerdict (today's rule, its storm budget)
  'http-auth': { cls: 'held', agent: 'dismiss', policy: null, modality: 'tab-modal', detail: { isProxy: 'bool', host: 'host', realm: 'text', scheme: 'word' } }, // the fill is the owner's (P3: a web-login entry)
  'client-cert': { cls: 'held', agent: 'dismiss', policy: null, modality: 'tab-modal', detail: { host: 'host', candidates: ['list', { id: 'id', subject: 'text', issuer: 'text', notAfter: 'num' }] } },
  permission: { cls: 'noted', agent: 'all', policy: 'permission', modality: 'anchor', detail: { permissions: 'words', requestingOrigin: 'origin' }, ids: { 'grant-once': { cls: 'allow', kind: 'accept', once: true } } }, // grant-once: allow for THIS time only — answered as sent
  'file-chooser': { cls: 'held', agent: 'all', policy: null, modality: 'tab-modal', detail: { mode: 'word', acceptTypes: 'words', defaultFileName: 'text' }, ids: { 'select-files': { cls: 'accept', kind: 'file' } } }, // mode 'save' ⇒ the owner's
  download: { cls: 'noted', agent: 'all', policy: 'download', modality: 'non-modal', detail: { suggestedFilename: 'text', mimeType: 'word', totalBytes: 'num', receivedBytes: 'num', state: 'word', dangerous: 'bool' } }, // dangerous ⇒ HELD, the owner's
  print: { cls: 'held', agent: 'all', policy: null, modality: 'tab-modal', detail: { initiatorOrigin: 'origin', title: 'text' }, ids: { 'save-pdf': { cls: 'accept', kind: 'accept' } } },
  popup: { cls: 'noted', agent: 'all', policy: 'popup', modality: 'non-modal', detail: { targetUrl: 'url', openerOrigin: 'origin', blockedByPolicy: 'bool', newTargetId: 'id' }, ids: { 'open-in-tab': { cls: 'allow', kind: 'accept' } } },
  'select-popup': { cls: 'held', agent: 'all', policy: null, modality: 'anchor', detail: { fieldId: 'id', multiple: 'bool', options: ['list', { index: 'num', label: 'text', disabled: 'bool' }], anchor: 'rect' }, ids: { select: { cls: 'choose', kind: 'choose' } } },
  webauthn: { cls: 'held', agent: 'dismiss', policy: null, modality: 'tab-modal', lane: 'P2', sink: 'webauthn', detail: { requestId: 'id', op: 'word', rpId: 'host', userVerification: 'word' } },
  credential: { cls: 'noted', agent: 'dismiss', policy: null, modality: 'anchor', lane: 'P3', sink: 'credentials', detail: { formId: 'id', kind: 'word', pageOrigin: 'origin', frameOrigin: 'origin' } },
  'payment-request': { cls: 'held', agent: 'dismiss', policy: 'cancel', modality: 'tab-modal', fixed: true, detail: {} },
  'external-protocol': { cls: 'noted', agent: 'dismiss', policy: 'deny', modality: 'tab-modal', fixed: true, detail: { scheme: 'word', initiatingOrigin: 'origin' } },
  interstitial: { cls: 'held', agent: ['go-back', 'back'], policy: null, modality: 'page', detail: { interstitialType: 'word', certError: 'word', overridable: 'bool' } }, // proceed is the owner's
  fullscreen: { cls: 'noted', agent: 'all', policy: null, modality: 'non-modal', detail: { origin: 'origin' } },
  'pointer-lock': { cls: 'noted', agent: 'all', policy: 'pointer-lock', modality: 'non-modal', detail: { origin: 'origin', userGesture: 'bool' } },
  'media-picker': { cls: 'held', agent: 'dismiss', policy: null, modality: 'tab-modal', detail: { audioRequested: 'bool', sources: ['list', { id: 'id', kind: 'word', title: 'text' }] }, ids: { select: { cls: 'choose', kind: 'choose' } } },
  'device-chooser': { cls: 'held', agent: 'dismiss', policy: null, modality: 'tab-modal', detail: { deviceKind: 'word', devices: ['list', { id: 'id', name: 'text' }] }, ids: { select: { cls: 'choose', kind: 'choose' } } },
  'native-picker': { cls: 'held', agent: 'all', policy: null, modality: 'anchor', detail: { pickerType: 'word', fieldId: 'id', currentValue: 'text', min: 'text', max: 'text', step: 'text', anchor: 'rect' } },
  suppressed: { cls: 'silent', agent: 'none', policy: null, modality: 'non-modal', detail: { suppressedKind: 'word', reason: 'text' } },
});
/** The (unknown) row: `blocking` ? held : noted; a generic card, never dropped; nothing kept but the title / message. */
const UNKNOWN_ROW = Object.freeze({ cls: null, agent: 'all', policy: null, modality: null, detail: {} });
const rowOf = (kind) => (Object.prototype.hasOwnProperty.call(KIND_TABLE, kind) ? KIND_TABLE[kind] : UNKNOWN_ROW);
/** lane passkey-sink: the road that answers `kind` on THIS kernel — the row's `sink` when the kernel's `features` list it, else
 *  null (the surface pipeline answers it). `kernel` = the watch's `{protocol, kinds, features}`. */
function sinkOf(kind, kernel) { const s = rowOf(kind).sink; return s && kernel && Array.isArray(kernel.features) && kernel.features.includes(s) ? s : null; }

const str = (v) => (v === null || v === undefined ? '' : String(v));
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const own = (o, k) => isObj(o) && Object.prototype.hasOwnProperty.call(o, k);
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const quoted = (s) => JSON.stringify(str(s));
/** A kernel token (an id the kernel passes back verbatim — Q5: `fieldId` is kernel-private): printable ASCII, no space, ≤ 64. */
const idOf = (v) => { const s = str(v); return /^[\x21-\x7e]{1,64}$/.test(s) && s.length <= ID_MAX ? s : ''; };
const wordOf = (v) => { const s = str(v).toLowerCase(); return /^[a-z][a-z0-9_.+-]{0,31}$/.test(s) ? s : ''; };
const hostOf = (v) => { const s = str(v).toLowerCase().slice(0, 253); return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*(:\d{1,5})?$/.test(s) ? s : ''; };
/** An ORIGIN only — scheme + host + port; a path, a query, a user-info never ride (an http(s) url, else nothing). */
function originOf(v) {
  let u = null; try { u = new URL(str(v).slice(0, 2048)); } catch { return ''; }
  return /^https?:$/.test(u.protocol) && u.host ? `${u.protocol}//${u.host}`.toLowerCase() : '';
}
const textOf = (pt, v, max) => (v === null || v === undefined ? '' : pt(typeof v === 'string' ? v : str(v), max));

/** One detail value by its whitelist type (null = dropped). */
function detailValue(pt, type, v) {
  if (Array.isArray(type)) {
    if (!Array.isArray(v)) return null;
    const spec = type[1];
    return v.slice(0, DETAIL_LIST_MAX).filter(isObj).map((o) => { const out = {}; for (const k of Object.keys(spec)) { if (!own(o, k)) continue; const x = detailValue(pt, spec[k], o[k]); if (x !== null && x !== '') out[k] = x; } return out; });
  }
  switch (type) {
    case 'text': return typeof v === 'string' || typeof v === 'number' ? textOf(pt, v, DETAIL_TEXT_MAX) : null;
    case 'url': return typeof v === 'string' ? textOf(pt, v, URL_MAX) : null;
    case 'word': return wordOf(v) || null;
    case 'id': return idOf(v) || null;
    case 'num': return num(v);
    case 'bool': return typeof v === 'boolean' ? v : null;
    case 'host': return hostOf(v) || null;
    case 'origin': return originOf(v) || null;
    case 'words': return Array.isArray(v) ? v.slice(0, DETAIL_LIST_MAX).map(wordOf).filter(Boolean) : null;
    case 'rect': { if (!isObj(v)) return null; const r = { x: num(v.x), y: num(v.y), width: num(v.width), height: num(v.height) }; return Object.values(r).every((x) => x !== null) ? r : null; }
    default: return null;
  }
}
/** THE DETAIL WHITELIST: per kind, the listed keys only, each value by its type — never a whole object forwarded. */
function detailOf(pt, kind, raw) {
  const spec = rowOf(kind).detail || {};
  const out = {};
  if (!isObj(raw)) return out;
  for (const k of Object.keys(spec)) { if (!own(raw, k)) continue; const v = detailValue(pt, spec[k], raw[k]); if (v !== null && v !== '') out[k] = v; }
  return out;
}
function optionOf(pt, o, i) {
  if (typeof o === 'string' || typeof o === 'number') return { value: str(o).slice(0, VALUE_MAX), label: textOf(pt, o, LABEL_MAX) };
  if (!isObj(o)) return null;
  const value = o.value !== undefined ? str(o.value) : o.index !== undefined ? str(o.index) : o.id !== undefined ? str(o.id) : str(i);
  return { value: value.slice(0, VALUE_MAX), label: textOf(pt, o.label !== undefined ? o.label : value, LABEL_MAX), ...(o.disabled === true ? { disabled: true } : {}) };
}
/** fields[] ≤ 16, the closed type set; a secret field never carries a default value. */
function fieldsOf(pt, raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const f of raw) {
    if (out.length >= FIELDS_MAX) break;
    if (!isObj(f)) continue;
    const fieldId = idOf(f.fieldId); const type = FIELD_TYPES.includes(f.type) ? f.type : '';
    if (!fieldId || !type || out.some((x) => x.fieldId === fieldId)) continue;
    const x = { fieldId, type, label: textOf(pt, f.label, LABEL_MAX), required: f.required === true };
    if (type === 'choice' && Array.isArray(f.options)) x.options = f.options.slice(0, OPTIONS_MAX).map((o, i) => optionOf(pt, o, i)).filter(Boolean);
    if (type === 'file' && f.multiple === true) x.multiple = true;
    if (type !== 'password' && type !== 'credential' && f.defaultValue !== undefined && f.defaultValue !== null) x.defaultValue = textOf(pt, f.defaultValue, MESSAGE_MAX);
    out.push(x);
  }
  return out;
}
/** The kernel's specialised answer id on THIS kind (own keys only — never an id another kind owns, never a prototype name), or null. */
function specialIdOf(kind, id) { const ids = rowOf(kind).ids; return ids && Object.prototype.hasOwnProperty.call(ids, id) ? ids[id] : null; }
/** What one answer MEANS: its kind's specialised id's class (accept · allow · choose), `dismiss` for a dismiss, else null (the
 *  id conventions and the answer kind decide — policyVerdict / approveOf). */
function answerClassOf(b, a) { const sp = b && a ? specialIdOf(b.kind, a.id) : null; return sp ? sp.cls : a && a.kind === 'dismiss' ? 'dismiss' : null; }
/** answers[] ≤ 8, the closed kind set; the bridge's `actions[]` (string aliases) only CHECK them (an answer it does not list is dropped).
 *  A bare SPECIALISED id of this kind (no kind, or one outside the set) takes the table's kind and carries its class (`cls`); any
 *  other id without a kind of the set is dropped. */
function answersOf(pt, raw, actions, surfaceKind) {
  if (!Array.isArray(raw)) return [];
  const listed = Array.isArray(actions) && actions.length ? new Set(actions.map(str)) : null;
  const out = [];
  for (const a of raw) {
    if (out.length >= ANSWERS_MAX) break;
    if (!isObj(a)) continue;
    const id = idOf(a.id); const sp = id ? specialIdOf(surfaceKind, id) : null; const kind = ANSWER_KINDS.includes(a.kind) ? a.kind : sp ? sp.kind : '';
    if (!id || !kind || out.some((x) => x.id === id) || (listed && !listed.has(id))) continue;
    out.push({ id, label: textOf(pt, a.label, 80) || id, kind, ...(sp ? { cls: sp.cls } : {}) });
  }
  return out;
}
const needPt = (pageText) => { if (typeof pageText !== 'function') throw new TypeError('browser-surfaces: the page-text rule must be handed in (src/browser-stuck.js pageText) — this module imports nothing'); return pageText; };

/**
 * `VibeSpace.surfaceOpened` params → THE BLOCK (design §2.2). The same shape as browser-stuck's dialogBlock — `type`
 * (js-dialog: its dialogType; else the kind), `message`, `url` (the ORIGIN), `openedAt` (THIS server's clock), `openForMs`,
 * `id` (+ `defaultValue` for a prompt) — so no reader changes its read, plus the surface's own fields. A surface the kernel
 * gives no usable id is no block (null: it cannot be answered or matched to its close).
 */
function surfaceBlock(s, { now = 0, pageText } = {}) {
  const pt = needPt(pageText);
  if (!isObj(s)) return null;
  const id = idOf(s.surfaceId);
  if (!id) return null;
  const known = SURFACE_KINDS.includes(s.kind);
  const kind = known ? s.kind : 'unknown';
  const row = rowOf(kind);
  const detail = known ? detailOf(pt, kind, s.detail) : {};
  const t = Number(now) || 0;
  const b = { id, kind, type: kind, title: textOf(pt, s.title, TITLE_MAX), message: textOf(pt, s.message, MESSAGE_MAX), url: originOf(s.origin), frameOrigin: originOf(s.frameOrigin || s.origin) };
  if (!known) b.kindSaid = textOf(pt, s.kind, KIND_SAID_MAX);
  if (kind === 'js-dialog') { const dt = wordOf(detail.dialogType); b.type = /^[a-z]{1,24}$/.test(dt) ? dt : 'dialog'; if (b.type === 'prompt') b.defaultValue = detail.defaultPrompt || ''; }
  b.fields = fieldsOf(pt, s.fields);
  b.answers = kind === 'suppressed' ? [] : answersOf(pt, s.answers, s.actions, kind);
  // blocking: the kernel's word (the bridge also sends `blocksInput`); a kind's class decides when it says nothing
  b.blocking = typeof s.blocking === 'boolean' ? s.blocking : typeof s.blocksInput === 'boolean' ? s.blocksInput : row.cls === 'held';
  b.modality = MODALITIES.includes(s.modality) ? s.modality : (row.modality || (b.blocking ? 'tab-modal' : 'non-modal'));
  b.openedAt = t;
  b.openForMs = 0;
  // the kernel's own clock is never compared with ours: its expiry is RELATIVE to its own open instant
  const opened = num(s.openedAt) !== null ? s.openedAt : num(s.createdAt);
  const rel = num(s.expiresAt) !== null && opened !== null ? s.expiresAt - opened : null;
  b.expiresAt = rel !== null && rel > 0 ? t + rel : null;
  if (opened !== null) b.kOpened = opened; // the kernel's own open instant — a later patch's expiry is relative to it (never shown: blockAt drops it)
  b.detail = detail;
  b.cls = classOf(b);
  return b;
}
/** The CLASS of one block (§2.3): the kind's row, a dangerous download HELD for the owner, the unknown row by `blocking`. */
function classOf(b) {
  if (!b) return 'silent';
  if (b.kind === 'download' && b.detail && b.detail.dangerous === true) return 'held';
  const row = rowOf(b.kind);
  return row.cls || (b.blocking ? 'held' : 'noted');
}
/** `VibeSpace.surfaceUpdated {surfaceId, patch}` — only message / fields / answers / detail / expiresAt move; the rest of the
 *  block (its id, kind, origin, open instant) is the one the open made. → a NEW block (null when nothing applies). */
function applySurfacePatch(b, patch, { now = 0, pageText } = {}) {
  const pt = needPt(pageText);
  if (!b || !isObj(patch)) return b || null;
  const n = { ...b };
  if (own(patch, 'message')) n.message = textOf(pt, patch.message, MESSAGE_MAX);
  if (own(patch, 'fields')) n.fields = fieldsOf(pt, patch.fields);
  if (own(patch, 'answers') && b.kind !== 'suppressed') n.answers = answersOf(pt, patch.answers, patch.actions, b.kind);
  if (own(patch, 'detail') && b.kind !== 'unknown') { n.detail = detailOf(pt, b.kind, patch.detail); if (b.kind === 'js-dialog' && n.type === 'prompt') n.defaultValue = n.detail.defaultPrompt || ''; }
  if (own(patch, 'expiresAt')) { const k0 = num(b.kOpened); const rel = num(patch.expiresAt) !== null && k0 !== null ? patch.expiresAt - k0 : null; n.expiresAt = rel !== null && rel > 0 ? (Number(b.openedAt) || Number(now) || 0) + rel : null; }
  n.cls = classOf(n);
  return n;
}
/** The block as a reader sees it at `now` (openForMs refreshed; the watch's own keys never leave). */
function blockAt(b, { now = 0 } = {}) {
  if (!b) return null;
  const { targetId: _t, surface: _s, pendingBy: _p, kOpened: _k, ...out } = b;
  out.openForMs = Number(now) > 0 && b.openedAt ? Math.max(0, Number(now) - Number(b.openedAt)) : 0;
  return out;
}
/** `VibeSpace.surfaceClosed {surfaceId, how, by}` (the bridge's `reason` / `outcome` are not read) → THE ANSWERED RECORD the
 *  watch emits as `closed` (`answered: {id, dialog, how, by, at, targetId}` — the dialog road's shape). `by` = who VibeSpace
 *  recorded answering (the agent, the user, policy, auto) — the kernel's own `by` (its bridge says `vibespace` for any answer
 *  over the socket) is kept only inside CLOSE_BYS, else `kernel`. */
function closedBlock(b, { how = '', by = '', answeredBy = null, answerId = null, at = 0 } = {}) {
  if (!b) return null;
  const h = CLOSE_HOWS.includes(how) ? how : 'answered';
  const who = answeredBy && CLOSE_BYS.includes(answeredBy) ? answeredBy : CLOSE_BYS.includes(by) ? by : 'kernel';
  const a = answerId ? (b.answers || []).find((x) => x.id === answerId) : null;
  return { id: b.id, dialog: b, how: h, by: who, at: Number(at) || 0, targetId: b.targetId || null, surface: true, ...(a ? { answer: { id: a.id, label: a.label, kind: a.kind } } : {}) };
}

// ── who may answer what ──
/** May the AGENT pick this answer of this block? (A rows; O = the owner's; the fixed kinds' "never" is answerVerdict's.) */
function agentMay(b, a) {
  if (!b || !a) return false;
  const row = rowOf(b.kind);
  if (a.kind === 'credential') return false; // a credential is never the agent's to type (P3: the `login` verb fills through the vault)
  if (a.kind === 'dismiss') return row.agent !== 'none';
  if (b.kind === 'file-chooser' && b.detail && b.detail.mode === 'save') return false; // where the browser SAVES is the owner's
  if (b.kind === 'download' && b.detail && b.detail.dangerous === true) return false;
  if (row.agent === 'all') return true;
  if (Array.isArray(row.agent)) return row.agent.includes(a.id);
  return false;
}
const under = (p, d) => p === d || p.startsWith(d.endsWith('/') ? d : d + '/');
/**
 * THE ANSWER VERDICT — `{block, by, answerId, values, files, sandbox}` → `{ok, answer, values, files}` or a refusal by name.
 * `by` = agent | user | policy. `files` = `[{asked, real}]` — the caller resolved each REAL path (realpath; null = none);
 * `sandbox` = the profile's downloads dir, real too. A secret field's value is never the agent's; a file outside the sandbox
 * is `surface_path_refused`; values are checked against the block's own fields (a choice among its options).
 */
function answerVerdict({ block, by = 'agent', answerId, values = null, files = null, sandbox = null } = {}) {
  if (!block) return { ok: false, code: 'no_dialog', error: 'no such browser prompt is open on your browser' };
  const answers = Array.isArray(block.answers) ? block.answers : [];
  const a = answers.find((x) => x.id === str(answerId));
  if (!a) return { ok: false, code: 'bad_answer', error: answers.length ? `that prompt has no answer ${quoted(str(answerId).slice(0, 64))} — its answers: ${answers.map((x) => x.id).join(', ')}` : 'that prompt takes no answer' };
  const row = rowOf(block.kind);
  if (row.fixed && a.kind !== 'dismiss') return { ok: false, code: 'bad_answer', error: block.kind === 'external-protocol' ? 'VibeSpace never opens a program on this computer for a page — the only answer is to refuse it' : 'that prompt can only be cancelled' };
  if (by === 'agent' && !agentMay(block, a)) return { ok: false, code: 'surface_owner_only', error: `only the user can answer ${quoted(a.label)} on this prompt (in the live view or their For-you card)${answers.some((x) => x.kind === 'dismiss') ? ` — you may refuse it: vibespace-browser answer ${block.id} ${answers.find((x) => x.kind === 'dismiss').id}` : ''}` };
  const fields = Array.isArray(block.fields) ? block.fields : [];
  const clean = {};
  if (values !== null && values !== undefined && a.kind !== 'dismiss') {
    if (!isObj(values)) return { ok: false, code: 'bad_values', error: 'values are field=text pairs' };
    const keys = Object.keys(values);
    if (keys.length > FIELDS_MAX) return { ok: false, code: 'bad_values', error: `at most ${FIELDS_MAX} values` };
    for (const k of keys) {
      const f = fields.find((x) => x.fieldId === k);
      if (!f) return { ok: false, code: 'bad_values', error: `that prompt has no field ${quoted(k.slice(0, 64))}${fields.length ? ` — its fields: ${fields.map((x) => x.fieldId).join(', ')}` : ''}` };
      if ((f.type === 'password' || f.type === 'credential') && by === 'agent') return { ok: false, code: 'surface_owner_only', error: `the field ${quoted(f.label || f.fieldId)} takes a secret — only the user types it, in the live view` };
      if (f.type === 'file') return { ok: false, code: 'bad_values', error: 'a file field takes --file <path>, never a value' };
      const v = values[k];
      if (typeof v !== 'string' || v.length > VALUE_MAX) return { ok: false, code: 'bad_values', error: `the value of ${quoted(k.slice(0, 64))} is text of at most ${VALUE_MAX} characters` };
      if (f.type === 'choice' && Array.isArray(f.options) && f.options.length && !f.options.some((o) => o.value === v && !o.disabled)) return { ok: false, code: 'bad_values', error: `${quoted(v.slice(0, 64))} is not one of the choices of ${quoted(f.label || f.fieldId)}: ${f.options.filter((o) => !o.disabled).map((o) => o.value).slice(0, 16).join(', ')}` };
      clean[k] = v;
    }
  }
  if (a.kind !== 'dismiss') {
    const missing = fields.filter((f) => f.required && f.type !== 'file' && !own(clean, f.fieldId) && !((f.type === 'password' || f.type === 'credential') && by === 'agent'));
    if (missing.length && (a.kind === 'text' || a.kind === 'choose' || a.kind === 'credential')) return { ok: false, code: 'bad_values', error: `that answer needs ${missing.map((f) => `--value ${f.fieldId}=<${f.label || 'text'}>`).join(' ')}` };
  }
  let real = [];
  if (files !== null && files !== undefined && (!Array.isArray(files) || files.length)) {
    if (a.kind !== 'file') return { ok: false, code: 'bad_values', error: 'files go only with a file answer' };
    if (!Array.isArray(files) || files.length > FILES_MAX) return { ok: false, code: 'bad_values', error: `at most ${FILES_MAX} files` };
    const box = typeof sandbox === 'string' && sandbox[0] === '/' ? sandbox.replace(/\/+$/, '') || '/' : null;
    if (!box) return { ok: false, code: 'surface_path_refused', error: 'this browser has no downloads directory to hand files from — nothing was picked' };
    for (const f of files) {
      const asked = str(f && f.asked).slice(0, 300);
      if (!f || typeof f.real !== 'string' || f.real[0] !== '/') return { ok: false, code: 'surface_path_refused', error: `${quoted(asked)} is not a file this computer has — nothing was picked` };
      if (!under(f.real, box) || f.real === box) return { ok: false, code: 'surface_path_refused', error: `${quoted(asked)} is outside this browser's downloads directory (${box}) — a page is handed files from there only; copy the file there first. Nothing was picked` };
      real.push(f.real);
    }
    const multi = fields.some((x) => x.type === 'file' && x.multiple);
    if (real.length > 1 && !multi) return { ok: false, code: 'bad_values', error: 'that file picker takes one file' };
  }
  if (a.kind === 'file' && !real.length) return { ok: false, code: 'bad_values', error: `that answer picks files: vibespace-browser answer ${block.id} ${a.id} --file <path>` };
  return { ok: true, answer: { id: a.id, label: a.label, kind: a.kind }, values: clean, files: real };
}
/** The kernel's error (a CDP error's code, or `{ok:false, code}` in a result) → the routes' code, BY NAME; else answer_failed. */
function kernelErrorToCode(code) { return Object.prototype.hasOwnProperty.call(KERNEL_ERRORS, str(code)) ? KERNEL_ERRORS[str(code)] : 'answer_failed'; }
/** `dialog accept [text] | dismiss` on a js-dialog surface: which of its answers, with which values. */
function dialogAnswerOf(b, { accept, text = null } = {}) {
  const answers = (b && b.answers) || [];
  if (!accept) { const d = answers.find((a) => a.kind === 'dismiss'); return d ? { answerId: d.id, values: null } : null; }
  const tx = answers.find((a) => a.kind === 'text');
  const field = ((b && b.fields) || []).find((f) => f.type === 'text');
  if (tx && text !== null && text !== undefined && field) return { answerId: tx.id, values: { [field.fieldId]: str(text).slice(0, VALUE_MAX) } };
  const ok = answers.find((a) => a.kind === 'accept') || tx;
  return ok ? { answerId: ok.id, values: tx && ok === tx && field && field.defaultValue !== undefined ? { [field.fieldId]: field.defaultValue } : null } : null;
}

// ── policy (P) ──
const allowOf = (b) => (b.answers || []).find((a) => ['allow', 'accept'].includes(answerClassOf(b, a))) || (b.answers || []).find((a) => a.kind !== 'dismiss' && /allow|grant|accept|open|save|keep|continue|ok/i.test(a.id)) || (b.answers || []).find((a) => a.kind === 'accept');
const denyOf = (b) => (b.answers || []).find((a) => a.kind === 'dismiss' && /deny|block|cancel|dismiss|refuse|no/i.test(a.id)) || (b.answers || []).find((a) => a.kind === 'dismiss');
/** The agent's / the user's per-origin decisions (`vibespace-browser permission <kind> allow [origin]`) a surface is judged
 *  against: `[{kind, setting:'granted'|'denied', origin}]`. A permission name is granted for an origin only if a row says so. */
function grantedFor(grants, name, origin) {
  const n = wordOf(name);
  return (Array.isArray(grants) ? grants : []).some((g) => g && g.setting === 'granted' && g.origin === origin && (wordOf(g.kind) === n || (g.permission && wordOf(g.permission.name) === n)));
}
/**
 * THE POLICY ANSWER (P) for a block at its open, or null (it stands for the agent / the owner). Each row has a RED control in
 * the suite: permission — deny, unless EVERY permission it asks was pre-granted for its origin (then allow); download — allow
 * (into the browser's downloads directory), a dangerous one is never decided (HELD for the owner); external-protocol — deny,
 * always; pointer-lock — deny unless pre-granted; popup — a popup the browser's policy blocked is denied (the rest stand for
 * the agent: the opener rule names whose the new tab is); payment-request — cancelled (the page sees NotSupportedError).
 */
function policyVerdict(b, { grants = [] } = {}) {
  if (!b) return null;
  const rule = rowOf(b.kind).policy;
  const pick = (a, setting, why) => (a ? { answerId: a.id, label: a.label, setting, why } : null);
  switch (rule) {
    case 'permission': {
      const asked = Array.isArray(b.detail && b.detail.permissions) ? b.detail.permissions : [];
      const origin = (b.detail && b.detail.requestingOrigin) || b.url;
      const all = asked.length > 0 && asked.every((p) => grantedFor(grants, p, origin));
      return all ? pick(allowOf(b), 'granted', `${asked.join(', ')} was allowed ahead for ${origin}`) : pick(denyOf(b), 'denied', 'every page permission is denied unless allowed ahead (vibespace-browser permission <kind> allow)');
    }
    case 'download': return b.detail && b.detail.dangerous === true ? null : pick(allowOf(b), 'granted', 'a download is saved into this browser\'s downloads directory');
    case 'deny': return pick(denyOf(b), 'denied', 'VibeSpace never opens a program on this computer for a page');
    case 'pointer-lock': return grantedFor(grants, 'pointer-lock', b.url || (b.detail && b.detail.origin)) ? pick(allowOf(b), 'granted', 'pointer-lock was allowed ahead for this site') : pick(denyOf(b), 'denied', 'a page never locks the pointer unless allowed ahead (vibespace-browser permission pointer-lock allow)');
    case 'popup': return b.detail && b.detail.blockedByPolicy === true ? pick(denyOf(b), 'denied', 'the browser\'s own policy blocked it') : null;
    case 'cancel': return pick(denyOf(b), 'denied', 'VibeSpace answers no payment request — the page is told it is not supported');
    default: return null;
  }
}

// ── the words (agent-facing: English, never t(); the watch passes each through src/peer-text.js toAgentText) ──
const KIND_WORDS = Object.freeze({ 'js-dialog': 'a page dialog', 'http-auth': 'an HTTP sign-in', 'client-cert': 'a client certificate choice', permission: 'a permission request', 'file-chooser': 'a file picker', download: 'a download', print: 'a print request', popup: 'a popup window', 'select-popup': 'a drop-down list', webauthn: 'a passkey request', credential: 'a login form', 'payment-request': 'a payment request', 'external-protocol': 'a request to open another program', interstitial: 'a warning page', fullscreen: 'a full-screen request', 'pointer-lock': 'a pointer-lock request', 'media-picker': 'a screen / camera source picker', 'device-chooser': 'a device picker', 'native-picker': 'a date / colour picker', suppressed: 'a suppressed prompt', unknown: 'a browser prompt' });
const kindWord = (b) => (b && b.kind === 'unknown' ? `a browser prompt the kernel calls ${quoted(b.kindSaid || 'unknown')}` : KIND_WORDS[b && b.kind] || 'a browser prompt');
function openForText(ms) { const s = Math.max(0, Math.round(Number(ms) / 1000) || 0); if (s < 60) return `${s}s`; const m = Math.floor(s / 60); return m < 60 ? `${m}m ${s % 60}s` : `${Math.floor(m / 60)}h ${m % 60}m`; }
const saysOf = (b) => [b.title ? quoted(b.title) : '', b.message ? `${quoted(b.message)} (the page's own words)` : ''].filter(Boolean).join(' — ');
const fieldWord = (f) => `${f.fieldId} (${f.type}${f.label ? `, ${quoted(f.label)}` : ''}${f.required ? ', required' : ''}${f.options && f.options.length ? `, one of ${f.options.slice(0, 8).map((o) => quoted(o.value)).join(' ')}` : ''})`;
/** How the agent answers it — its own answers spelled as commands, the owner's named as theirs. */
function answersLine(b) {
  const answers = b.answers || [];
  if (!answers.length) return 'It takes no answer from you.';
  const mine = answers.filter((a) => agentMay(b, a) && !(rowOf(b.kind).fixed && a.kind !== 'dismiss'));
  const theirs = answers.filter((a) => !mine.includes(a));
  const textFields = (b.fields || []).filter((f) => f.type !== 'file' && f.type !== 'password' && f.type !== 'credential');
  const cmd = (a) => `vibespace-browser answer ${b.id} ${a.id}${a.kind === 'file' ? ' --file <path in the downloads directory>' : (a.kind === 'text' || a.kind === 'choose') && textFields.length ? ` ${textFields.map((f) => `--value ${f.fieldId}=<${f.type === 'choice' ? 'choice' : 'text'}>`).join(' ')}` : ''}`;
  let s = mine.length ? `Answer it: ${mine.map((a) => `${cmd(a)} (${quoted(a.label)})`).join('  |  ')}.` : 'You cannot answer it.';
  if (theirs.length) s += ` Only the user can pick ${theirs.map((a) => quoted(a.label)).join(' or ')} — in the live view, or on their For-you card.`;
  if (textFields.length && mine.some((a) => a.kind === 'text' || a.kind === 'choose')) s += ` Its fields: ${textFields.map(fieldWord).join('; ')}.`;
  if (b.sink === 'credentials' || b.logins) s += ' A login the vault keeps fills it: vibespace-browser login (you never see the password).'; // lane browser-login
  return s;
}
/**
 * THE SENTENCE a HELD surface's verb prints FIRST (and every later verb while it stands — `repeat` adds how long). A js-dialog
 * surface is said by browser-stuck's dialogText (its `dialog accept|dismiss` words) — the watch picks; this is every other kind.
 */
function surfaceText(b, { now = 0, repeat = false } = {}) {
  if (!b) return '';
  const says = saysOf(b);
  let s = `A browser prompt is open and the page will not move until it is answered — ${kindWord(b)}${b.url ? ` from ${b.url}` : ''}${says ? `: ${says}` : ''}. ${answersLine(b)}`;
  const row = rowOf(b.kind);
  if (row.lane) s += ` (${row.lane === 'P2' ? 'Passkeys are answered by the owner' : 'Logins are filled from the vault, never typed by you'}.)`;
  if (repeat && Number(now) > 0 && Number(b.openedAt) > 0) s += ` It has been open for ${openForText(Number(now) - Number(b.openedAt))}.`;
  return s;
}
const hhmm = (at) => { const d = new Date(Number(at) || 0); return Number.isFinite(d.getTime()) ? d.toISOString().slice(11, 16) + ' UTC' : ''; };
/**
 * THE ONE LINE the conversation's next result carries, once: a NOTED surface that opened (it does not hold the page), a POLICY
 * answer, a held one answered by someone else (the user in the live view, the kernel when the page moved on). The agent's own
 * answer ⇒ nothing (its own `answer` said it). `n` = `{kind:'surface', state:'open'|'closed', block, how, by, at, answer?, why?}`.
 */
function surfaceNote(n) {
  const b = n && n.block;
  if (!b || b.kind === 'suppressed') return '';
  const says = saysOf(b);
  const what = `${kindWord(b)}${b.url ? ` from ${b.url}` : ''}${says ? `: ${says}` : ''}`;
  if (n.state === 'open') return `(${what} — it does not hold the page. ${answersLine(b)})`;
  if (n.by === 'policy') return `(${what} — VibeSpace answered ${n.answer ? quoted(n.answer.label) : 'it'} by policy: ${str(n.why).slice(0, 200)})`;
  if (n.by === 'agent') return '';
  if (n.by === 'user') return `the browser prompt was answered by the user${n.answer ? ` (${quoted(n.answer.label)})` : ''} at ${hhmm(n.at)} — ${what}`;
  if (n.how === 'navigated' || n.how === 'tab-closed') return `the browser prompt closed when its page moved on at ${hhmm(n.at)} — ${what}`;
  if (n.how === 'expired') return `the browser prompt expired unanswered at ${hhmm(n.at)} — ${what}`;
  return `the browser prompt closed without an answer from you at ${hhmm(n.at)} — ${what}`;
}
/** `vibespace-browser surfaces` — every prompt open on the conversation's browser, one line each. */
function surfaceListText(blocks) {
  const list = Array.isArray(blocks) ? blocks.filter(Boolean) : [];
  if (!list.length) return 'No browser prompt is open on your browser.';
  return list.map((b) => `${b.id}  ${b.kind === 'unknown' ? `unknown(${b.kindSaid || '?'})` : b.kind}  ${b.cls}${b.blocking ? ' blocking' : ''}  ${saysOf(b) || '(no words)'}  answers: ${(b.answers || []).map((a) => `${a.id}${agentMay(b, a) && !(rowOf(b.kind).fixed && a.kind !== 'dismiss') ? '' : '(user)'}`).join(', ') || '—'}`).join('\n');
}
/** What the For-you card and the live view's buttons show was drawn from — a different block is `surface_changed`. */
function digestOf(b) {
  if (!b) return '';
  const s = JSON.stringify([b.id, b.kind, b.title, b.message, b.url, (b.answers || []).map((a) => [a.id, a.label, a.kind]), (b.fields || []).map((f) => [f.fieldId, f.type, f.label])]);
  let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}
/** The answer a For-you card's Approve presses: the first non-dismiss answer that needs no typing; null = the live view only. */
function approveOf(b) {
  const needs = (b && b.fields || []).some((f) => f.required);
  const a = (b && b.answers || []).find((x) => ['allow', 'accept'].includes(answerClassOf(b, x)) && x.kind === 'accept') || (b && b.answers || []).find((x) => x.kind === 'accept' || (x.kind === 'choose' && !needs));
  return a && !(rowOf(b.kind).fixed) ? a : null;
}

// ── the user's words (the live view's bar, the For-you card): every key a literal t('…') with zh + ja entries ──
function fill(s, p) { return String(s).replace(/\{(\w+)\}/g, (m, k) => (p && p[k] !== undefined ? String(p[k]) : m)); }
function kindTitle(kind, t) {
  switch (kind) {
    case 'js-dialog': return t('The page shows a dialog');
    case 'http-auth': return t('The page asks you to sign in');
    case 'client-cert': return t('The site asks for a client certificate');
    case 'permission': return t('The page asks for a permission');
    case 'file-chooser': return t('The page asks for a file');
    case 'download': return t('The page wants to download a file');
    case 'print': return t('The page wants to print');
    case 'popup': return t('The page wants to open a window');
    case 'select-popup': return t('The page shows a list to choose from');
    case 'webauthn': return t('The page asks for a passkey');
    case 'credential': return t('The page has a login form');
    case 'payment-request': return t('The page asks for a payment');
    case 'external-protocol': return t('The page wants to open another program');
    case 'interstitial': return t('The browser shows a warning page');
    case 'fullscreen': return t('The page wants to go full screen');
    case 'pointer-lock': return t('The page wants to lock the pointer');
    case 'media-picker': return t('The page asks to capture a screen or camera');
    case 'device-chooser': return t('The page asks to use a device');
    case 'native-picker': return t('The page shows a picker');
    case 'suppressed': return t('A browser prompt was suppressed');
    default: return t('The browser shows a prompt');
  }
}
/** The bar / card in words: the actor (the page, its origin) + the verb + the object as ONE title, the page's words as the body,
 *  the details under ONE fold (`details`), a button per answer (`text` / `credential` / `file` kinds open a sheet), and who
 *  may press what. */
function surfaceWords(b, tIn) {
  if (!b) return null;
  const t = typeof tIn === 'function' ? (s, q) => tIn(s, q) : fill;
  const details = [];
  if (b.url) details.push(t('Site: {origin}', { origin: b.url }));
  if (b.frameOrigin && b.frameOrigin !== b.url) details.push(t('Frame: {origin}', { origin: b.frameOrigin }));
  if (b.kind === 'unknown' && b.kindSaid) details.push(t('Kind: {kind}', { kind: b.kindSaid }));
  for (const [k, v] of Object.entries(b.detail || {})) if (typeof v !== 'object' || v === null) details.push(`${k}: ${String(v)}`); else if (Array.isArray(v)) details.push(`${k}: ${v.map((x) => (x && typeof x === 'object' ? Object.values(x).join(' ') : String(x))).join(', ')}`);
  const buttons = (b.answers || []).map((a) => ({ id: a.id, label: a.label, kind: a.kind, sheet: a.kind === 'text' || a.kind === 'credential' || a.kind === 'file' || (a.kind === 'choose' && (b.fields || []).length > 0), primary: false, blocked: !!(rowOf(b.kind).fixed && a.kind !== 'dismiss') }));
  const first = buttons.find((x) => answerClassOf(b, x) && answerClassOf(b, x) !== 'dismiss' && !x.blocked) || buttons.find((x) => x.kind !== 'dismiss' && !x.blocked); if (first) first.primary = true;
  return { title: kindTitle(b.kind, t), body: [b.title, b.message].filter(Boolean).join(' — '), details, fold: t('Details'), buttons, fields: (b.fields || []).map((f) => ({ ...f })), blocking: !!b.blocking,
    hint: b.blocking ? t('The page waits for this answer — the agent is told it is open') : t('The page runs on — the agent is told') };
}

module.exports = {
  sinkOf, // lane passkey-sink
  SURFACE_KINDS, KERNEL_ERRORS, SURFACE_CODES, FIELD_TYPES, ANSWER_KINDS, MODALITIES, CLASSES, CLOSE_HOWS, CLOSE_BYS,
  ID_MAX, KIND_SAID_MAX, TITLE_MAX, MESSAGE_MAX, URL_MAX, FIELDS_MAX, ANSWERS_MAX, LABEL_MAX, DETAIL_TEXT_MAX, DETAIL_LIST_MAX, OPTIONS_MAX, VALUE_MAX, FILES_MAX, TEXT_MAX,
  KIND_TABLE, UNKNOWN_ROW, rowOf, originOf,
  surfaceBlock, classOf, applySurfacePatch, blockAt, closedBlock,
  specialIdOf, answerClassOf, agentMay, answerVerdict, kernelErrorToCode, dialogAnswerOf, grantedFor, policyVerdict,
  kindWord, surfaceText, surfaceNote, surfaceListText, digestOf, approveOf, kindTitle, surfaceWords,
};

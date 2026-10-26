'use strict';
/**
 * A PAGE WAITING FOR A PASSKEY MUST SAY SO — PURE (imports nothing; CJS so the dialog watch, the routes, the CLI and the
 * bundle share ONE set of rules and words; shipped beside the CLI as `vibespace-browser-passkey.js`, like browser-stuck).
 * Lane browser-passkey, 2026-10-05 (owner incident inc-muuvthv9-g69w, "刚才浏览器passkey界面我没办法操作/关闭"): an agent's
 * headed browser sat on a sign-in page that had called `navigator.credentials.get()`; Chrome's own WebAuthn window (a
 * browser window, NOT page pixels — invisible in the live view) was up on the box's desktop and, while it is up, the page
 * takes no input. The agent pressed Escape 4×, the owner clicked the picture twice; nobody could answer or close it.
 *
 * The agent's browser never holds the user's passkey. So a ceremony is a NAMED FACT with a way out: the dialog watch
 * wraps the page's own `navigator.credentials.get / .create` (`installHook`, injected in the MAIN world before any page
 * script), every publicKey ceremony is a record, `passkeyVerdict` says `passkey_open` after PENDING_SAID_MS, and the
 * product-held AbortController of each ceremony (composed with the caller's own signal) is how `passkey cancel` ends it:
 * the page's promise rejects with AbortError, Chrome closes its window, the page's own other way in becomes clickable.
 *
 * Every agent-facing sentence here is English and never t() (§16); the UI words (`passkeyWords`, the For-you item) take
 * the client's `t` — every key a literal with zh + ja entries.
 */

const PASSKEY_OPEN_CODE = 'passkey_open';
/** lane passkey-store-core: the page waits for the OWNER's answer on a card (a stored key whose policy is `ask`). */
const PASSKEY_ASK_CODE = 'passkey_ask';
const KINDS = Object.freeze(['get', 'create']);
const OUTCOMES = Object.freeze(['pending', 'ok', 'error', 'cancelled', 'aborted-by-page', 'refused']);
/** lane passkey-store-core: a refusal is said to the agent's verbs this long after it (the page already showed its words). */
const REFUSED_SAID_MS = 60 * 1000;
/** A ceremony pending this long is SAID. 3 s: a ceremony a present authenticator answers ends well inside it (the CDP
 *  virtual authenticator of the heavy control: < 0.2 s; a platform authenticator's own prompt is answered or refused by a
 *  person at the screen in a second or two), while the incident's never ended — and 3 s is still far below the browser
 *  CLI's 25 s action timeout, so the verb in flight is told the reason instead of timing out blind. */
const PENDING_SAID_MS = 3000;
/** ONE For-you item per (profile, rpId) once a ceremony has been pending this long (the agent had its chance to cancel). */
const FOR_YOU_AFTER_MS = 20 * 1000;
const RECORDS_KEEP = 16;
/** What may run while a ceremony is open: the ways out (cancel it, leave the page, close the tab, stop) and the reads. */
const PASSKEY_PASS_VERBS = Object.freeze(['passkey', 'tab', 'close', 'stop', 'site-reset', 'dialog', 'open', 'goto', 'navigate', 'nav', 'back', 'forward', 'reload']);
const PASSKEY_READ_VERBS = Object.freeze(['snapshot', 'screenshot', 'get', 'is', 'console', 'errors']);

const str = (v) => (v == null ? '' : String(v));
/** The relying party as a word: a host name or nothing (page content — never a frame, never a quote). */
function rpWord(v) {
  const s = str(v).toLowerCase();
  return s.length <= 253 && /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/.test(s) ? s : '';
}

/** A hook event (`{ev:'start', id, kind, rpId}` / `{ev:'end', id, outcome, name}`, JSON from the binding) → a plain object or null. */
function parseEvent(payload) {
  let o = null; try { o = JSON.parse(str(payload).slice(0, 4096)); } catch { return null; }
  if (!o || typeof o !== 'object' || !Number.isSafeInteger(o.id) || o.id <= 0) return null;
  if (o.ev === 'start') {
    const user = o.user && typeof o.user === 'object' ? { name: str(o.user.name).slice(0, 64), displayName: str(o.user.displayName).slice(0, 64) } : null;
    const allow = (Array.isArray(o.allow) ? o.allow : []).map(str).filter((x) => /^[A-Za-z0-9_-]{1,1400}$/.test(x)).slice(0, 20);
    const origin = /^https?:\/\/[^\s/?#]{1,300}$/i.test(str(o.origin)) ? str(o.origin) : '';
    return { ev: 'start', id: o.id, kind: KINDS.includes(o.kind) ? o.kind : 'get', rpId: rpWord(o.rpId), ...(o.uv ? { uv: str(o.uv).slice(0, 20) } : {}), allow, ...(user ? { user } : {}), origin, conditional: o.mediation === 'conditional' };
  }
  if (o.ev === 'end') return { ev: 'end', id: o.id, outcome: OUTCOMES.includes(o.outcome) && o.outcome !== 'pending' ? o.outcome : 'error', name: /^[A-Za-z]{1,40}$/.test(str(o.name)) ? str(o.name) : null };
  return null;
}
/** The ceremony record: `{id, kind, rpId, startedAt, tab, outcome, endedAt}` (`id` = `<tab>:<ctx>:<n>` — unique per document). */
function recordOf(ev, { tab = null, ctx = 0, now = 0 } = {}) {
  return { id: `${str(tab)}:${Number(ctx) || 0}:${ev.id}`, n: ev.id, ctx: Number(ctx) || 0, kind: ev.kind, rpId: ev.rpId, startedAt: Number(now) || 0, tab: tab == null ? null : str(tab), outcome: 'pending', endedAt: 0,
    ...(ev.conditional ? { conditional: true } : {}), ...(ev.allow && ev.allow.length ? { allow: ev.allow } : {}), ...(ev.user ? { user: ev.user } : {}), ...(ev.origin ? { origin: ev.origin } : {}),
    ...(ev.req ? { kernel: ev.req } : {}) }; // lane passkey-sink: a kernel's ceremony carries its request (what VibeSpace signs and answers)
}
/** lane passkey-sink (design-custom-browser-plugin §3): THE KERNEL'S CEREMONY — on a kernel whose `features` list `webauthn` there
 *  is no hook: `VibeSpace.webauthnRequest` IS the start. → the `start` event applyEvent takes (the SAME record — the verdict, the
 *  chip, the card, `passkey status|cancel` reused) with the ceremony's data in `req`: the kernel's ids, `op` (it wins over the
 *  bridge's `kind`), the hash VibeSpace signs, what the signer re-checks (origin, challenge, the clientDataJSON when handed), the
 *  key types offered, UV asked, the new user's handle. Binary fields are kept as base64url (a kernel's standard base64 is
 *  normalised); every field bounded. `n` = the watch's own number for the ceremony (the record's id). null = no usable
 *  surfaceId / requestId (nothing could ever answer it). */
const KERNEL_ID = /^[\x21-\x7e]{1,64}$/;
const UV_WORDS = Object.freeze(['required', 'preferred', 'discouraged']);
function kernelEvent(p, { n = 0 } = {}) {
  if (!p || typeof p !== 'object' || !Number.isSafeInteger(n) || n <= 0) return null;
  const surfaceId = str(p.surfaceId), requestId = str(p.requestId);
  if (!KERNEL_ID.test(surfaceId) || !KERNEL_ID.test(requestId)) return null;
  const op = KINDS.includes(p.op) ? p.op : KINDS.includes(p.kind) ? p.kind : 'get';
  const b64 = (v, max) => { const s = str(v).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); return /^[A-Za-z0-9_-]+$/.test(s) && s.length <= max ? s : ''; };
  const ids = (list) => (Array.isArray(list) ? list : []).slice(0, 40).map((c) => b64(c && typeof c === 'object' ? c.id : c, 1400)).filter(Boolean).slice(0, 20);
  const origin = /^https?:\/\/[^\s/?#]{1,300}$/i.test(str(p.origin)) ? str(p.origin) : '';
  const u = op === 'create' && p.user && typeof p.user === 'object' ? p.user : null;
  const req = {
    surfaceId, requestId, op, rpId: rpWord(p.rpId), origin,
    clientDataHash: b64(p.clientDataHash, 43), challenge: b64(p.challenge, 1400), clientDataJSON: b64(p.clientDataJSON, 11000) || null,
    pubKeyCredParams: (Array.isArray(p.pubKeyCredParams) ? p.pubKeyCredParams : []).slice(0, 16).map((x) => ({ type: str(x && x.type).slice(0, 20), alg: x && Number.isSafeInteger(x.alg) ? x.alg : 0 })),
    userVerification: UV_WORDS.includes(p.userVerification) ? p.userVerification : 'preferred',
    residentKey: UV_WORDS.includes(p.residentKey) ? p.residentKey : 'preferred',
    exclude: ids(p.excludeCredentials), userId: u ? b64(u.id, 86) : '',
  };
  const user = u ? { name: str(u.name).slice(0, 64), displayName: str(u.displayName).slice(0, 64) } : null;
  return { ev: 'start', id: n, kind: op, rpId: req.rpId, allow: ids(p.allowCredentials), ...(user ? { user } : {}), origin, conditional: p.mediation === 'conditional', req };
}
/** Apply an event to a tab's records (in place; bounded) → the record it touched, or null. */
function applyEvent(records, ev, { tab = null, ctx = 0, now = 0 } = {}) {
  if (!ev || !Array.isArray(records)) return null;
  if (ev.ev === 'start') {
    const r = recordOf(ev, { tab, ctx, now });
    records.push(r);
    while (records.length > RECORDS_KEEP) { const i = records.findIndex((x) => x.outcome !== 'pending'); records.splice(i < 0 ? 0 : i, 1); }
    return r;
  }
  const r = records.find((x) => x.n === ev.id && x.ctx === (Number(ctx) || 0) && x.outcome === 'pending');
  if (!r) return null;
  if (r.refused) { r.endedAt = Number(now) || 0; r.outcome = 'refused'; return r; } // lane passkey-store-core: the watch refused it (its reason kept)
  r.outcome = ev.outcome; r.endedAt = Number(now) || 0; if (ev.name) r.error = ev.name;
  return r;
}
/** Every pending ceremony of a document that went (a navigation, the tab closed) — the page is no longer waiting. */
function endPending(records, { now = 0, ctx = null } = {}) {
  const out = [];
  for (const r of records || []) if (r.outcome === 'pending' && (ctx == null || r.ctx === ctx)) { r.outcome = 'aborted-by-page'; r.endedAt = now; out.push(r); }
  return out;
}

/** THE VERDICT over one scope's records: `unknown` (no hook on the page — a browser that predates it), `none`, `pending`
 *  (younger than PENDING_SAID_MS — `sayAt` is when it will be said), or `passkey_open` with THE SENTENCE. */
function passkeyVerdict(records, now, { armed = true, saidMs = PENDING_SAID_MS } = {}) {
  if (!armed) return { state: 'unknown' };
  // lane passkey-store-core: an autofill (conditional) get waits for a pick by nature — never `passkey_open`, only an ask
  const pend = (records || []).filter((r) => r && r.outcome === 'pending' && (!r.conditional || r.ask)).sort((a, b) => a.startedAt - b.startedAt);
  const asking = pend.find((r) => r.ask);
  if (asking) return { state: PASSKEY_ASK_CODE, record: asking, since: asking.startedAt, rpId: asking.rpId, text: askText(asking) };
  if (!pend.length) {
    const ref = (records || []).filter((r) => r && r.outcome === 'refused' && r.why && r.why !== 'none' && (Number(now) || 0) - r.endedAt < REFUSED_SAID_MS).sort((a, b) => b.endedAt - a.endedAt)[0];
    return ref ? { state: 'refused', record: ref, why: ref.why, rpId: ref.rpId, text: refusedText(ref.why, ref.rpId) } : { state: 'none' };
  }
  const r = pend[0];
  const age = (Number(now) || 0) - r.startedAt;
  if (age < saidMs) return { state: 'pending', record: r, sayAt: r.startedAt + saidMs };
  return { state: PASSKEY_OPEN_CODE, record: r, since: r.startedAt, rpId: r.rpId, text: passkeyText(r), forYou: age >= FOR_YOU_AFTER_MS };
}
/** THE SENTENCE — the first words of every agent-facing surface while a ceremony is open. */
function passkeyText(r) {
  const rp = rpWord(r && r.rpId) || 'this site';
  const locked = r && r.keyWords ? ` VibeSpace's saved passkeys are locked: ${str(r.keyWords)}.` : ''; // key-file-law-fix: the gate's key refusal
  return `This page is waiting for a passkey (${rp}) and nothing in VibeSpace answers it — cancel it (\`vibespace-browser passkey cancel\`) and use the page's other way in (a recovery code, a password), or ask the user to sign in on their own device.${locked}`;
}
/** lane passkey-store-core (§2.4): the page waits for the owner's card. */
function askText(r) {
  const rp = rpWord(r && r.rpId) || 'this site';
  return `This page is waiting for the owner to allow the passkey for ${rp} (a card is in their For-you tray). Do not retry the click — \`vibespace-browser passkey status\` says when it is answered; \`passkey cancel\` withdraws the request.`;
}
/** lane passkey-store-core: the refused ceremony's sentence by reason (the page itself was told NotAllowedError). */
function refusedText(why, rpId) {
  const rp = rpWord(rpId) || 'this site';
  switch (why) {
    case 'no-grant': return `Registering a passkey on ${rp} needs the owner's permission first: run \`vibespace-browser passkey register ${rp}\`, then press the page's button again.`;
    case 'policy-no': return `The owner does not let agents sign in to ${rp} with this passkey — the page was told it was not allowed; use its other way in, or ask the owner.`;
    case 'declined': return `The owner said no to this passkey sign-in on ${rp} — the page was told it was not allowed; ask the owner before you try again.`;
    case 'expired': return `The owner's permission for the passkey on ${rp} was not there in time (no answer within 5 minutes, or a registration permission older than 10 minutes) — the page was told it was not allowed; ask again (\`vibespace-browser passkey register ${rp}\` to register; press the page's button again to sign in).`;
    case 'profile-switch': return `The owner turned passkeys off for agents on this browser profile — ${rp}'s request was refused; use the page's other way in.`;
    case 'rp-mismatch': return `The page asked for a passkey of ${rp}, which its own address may not use — refused.`;
    case 'withdrawn': return `The user took over the browser — your passkey request on ${rp} was withdrawn.`;
    // lane passkey-sink: a kernel with `webauthn` — VibeSpace answers the ceremony itself
    case 'webauthn_alg_unsupported': return `${rp} asked for a kind of passkey VibeSpace does not make (it offered no ES256 key type) — the page was told it was not allowed; use its other way in.`;
    case 'webauthn_rp_mismatch': return `The passkey request named ${rp}, which is not the page's own (its address may not use it, or the data to sign names another page) — VibeSpace signed nothing and the page was told it was not allowed.`;
    case 'webauthn_key_locked': return `VibeSpace's saved passkeys cannot be opened right now, so nothing was signed for ${rp} — when the vault is locked a person unlocks it on this instance's page, and the user has already been told (their tray names what is waiting on it): do not ask them to unlock it or for its password. The page was told it was not allowed; press its button again later, or use its other way in.`;
    default: return `The passkey request on ${rp} was refused.`;
  }
}
/** lane passkey-store-core: `passkey register`'s answers. */
function registerText(state, rpId) {
  const rp = rpWord(rpId) || 'this site';
  if (state === 'approved') return `Allowed: register the passkey on ${rp} now — press the page's "create a passkey" button (the permission is good for one passkey for 10 minutes).`;
  if (state === 'rejected') return `The owner said no — do not register a passkey on ${rp}.`;
  if (state === 'expired') return `Nobody answered the card for ${rp} in 5 minutes — ask the owner, then run \`vibespace-browser passkey register ${rp}\` again.`;
  return `A card asking the owner to let you register a passkey on ${rp} is in their For-you tray — \`vibespace-browser passkey status\` says when it is answered.`;
}
/** A verdict as the routes and the CLI carry it (no clock inside; `record` trimmed to what a reader needs). */
function passkeyBlock(v) {
  if (v && v.state === 'refused') return { state: 'refused', why: v.why, rpId: v.rpId, text: v.text }; // lane passkey-store-core
  if (!v || (v.state !== PASSKEY_OPEN_CODE && v.state !== PASSKEY_ASK_CODE)) return v ? { state: v.state } : null;
  const r = v.record;
  return { state: v.state, id: r.id, kind: r.kind, rpId: r.rpId, tab: r.tab, startedAt: r.startedAt, text: v.text, ...(r.ask ? { proposal: r.ask } : {}) };
}
const passkeyPasses = (verb) => PASSKEY_PASS_VERBS.includes(str(verb));
const passkeyReads = (verb) => PASSKEY_READ_VERBS.includes(str(verb));
/** THE LOOP VERDICT (the incident's 4× Escape): while a ceremony is open, a verb that would ACT on the page (a key, a click,
 *  typing — the page takes no input under Chrome's window) answers THE SENTENCE instead of acting, every time — `answer`;
 *  a reading verb runs with the sentence first (`note`); the ways out run (`run`). */
function loopVerdict(verb, v) {
  if (!v || (v.state !== PASSKEY_OPEN_CODE && v.state !== PASSKEY_ASK_CODE)) return { act: 'run' };
  if (passkeyPasses(verb)) return { act: 'run' };
  if (passkeyReads(verb)) return { act: 'note', code: v.state, text: v.text };
  return { act: 'answer', code: v.state, text: v.text };
}
function cancelText({ n = 0, rpId = '', kernel = false } = {}) {
  if (!n) return 'No passkey request is waiting on your browser.';
  const rp = rpWord(rpId) || 'this site';
  // lane passkey-sink: on a kernel with `webauthn` the kernel ends the ceremony — the page sees NotAllowedError (Q4), not AbortError
  const told = kernel ? 'the page was told it was not allowed (NotAllowedError)' : 'the page was told the request was aborted';
  return `Cancelled the page's passkey request (${rp}) — ${told} and takes input again. Use its other way in (a recovery code, a password), or ask the user to sign in on their own device.`;
}
const NONE_TEXT = 'No passkey request is waiting on your browser.';
const UNKNOWN_TEXT = 'VibeSpace cannot see passkey requests on this browser (it started before VibeSpace could watch them) — a page that will not move may be waiting for one: navigate elsewhere or close the tab.';

function fill(s, p) { return String(s).replace(/\{(\w+)\}/g, (m, k) => (p && p[k] !== undefined ? String(p[k]) : m)); }
/** The live view's banner (ONE button: Cancel) and the chip — `headed`: Chrome's own window is on this computer's desktop.
 *  lane passkey-ui (§2.4 / §2.5): `passkey_ask` = the page waits for the OWNER's card — the banner carries that card's
 *  words and choices (`card`, the same buttons as the tray and the chat; the same approve route). */
function passkeyWords(b, tIn, { headed = false, card = null } = {}) {
  if (!b || (b.state !== PASSKEY_OPEN_CODE && b.state !== PASSKEY_ASK_CODE)) return null;
  const t = typeof tIn === 'function' ? (s, p) => tIn(s, p) : fill;
  const rp = rpWord(b.rpId) || t('this site');
  if (b.state === PASSKEY_ASK_CODE) {
    const cw = passkeyCardWords(card, tIn);
    return { ask: true, title: t('This page is waiting for you to allow the passkey for {rp}', { rp }), line: cw ? `${cw.title}. ${cw.after}` : '', desktop: '', buttons: cw ? cw.buttons : [], cardId: cw ? String(card.id) : '', shown: cw ? String(card.shown || '') : '', cancel: t('Cancel passkey request'), chip: t('page waits for your passkey answer') };
  }
  return {
    title: t('This page is waiting for a passkey ({rp})', { rp }),
    line: t('A site this profile keeps no passkey for offers its own other ways in; a kept passkey signs in by the policy you set in the Agent browser panel; a new one is registered only after you allow it. Cancel this request, then use the page\'s other way in, or sign in on your own device.'),
    desktop: headed ? t('Chrome\'s own passkey window is open on this computer\'s desktop — it does not show in this view.') : '',
    cancel: t('Cancel passkey request'),
    chip: t('page waits for a passkey'),
  };
}
/** The For-you item (origin browser; ONE per (profile, rpId); resolved by itself when the request ends). Literal keys. */
const FOR_YOU_WORDS = Object.freeze({
  text: 'A page in the agent\'s browser is waiting for a passkey ({rp})',
  detail: 'A site this profile keeps no passkey for offers its own other ways in; a kept passkey signs in by the policy you set in the Agent browser panel; a new one is registered only after you allow it. Cancel the request in the live view (or the agent runs `vibespace-browser passkey cancel`), then use the page\'s other way in.',
});
/** lane passkey-ui (§2.5): THE PASSKEY CARD's words — the SAME card in the For-you tray, the chat and the live banner. Who
 *  asks for what, what the agent may do AFTER the answer, the card's choices in order (the first = the primary), and a
 *  decided card's outcome + the policy now in force. `card` = browser-passkey-store's proposalCard (peer-controlled
 *  rpId / user names: every surface puts these words through textContent or escHtml). */
const CHOICE_WORDS = Object.freeze({ once: 'Allow once', always: 'Always allow', no: 'Not now', never: 'Never' });
function passkeyCardWords(card, tIn) {
  if (!card || card.type !== 'passkey') return null;
  const t = typeof tIn === 'function' ? (s, p) => tIn(s, p) : fill;
  const rp = rpWord(card.rpId) || t('this site');
  const k0 = Array.isArray(card.keys) && card.keys[0] ? card.keys[0] : null;
  const user = str((card.user && (card.user.name || card.user.displayName)) || (k0 && (k0.userName || k0.displayName)) || '').slice(0, 64);
  const profile = str(card.profile || card.profileId || '').slice(0, 80);
  const reg = card.kind === 'register';
  const title = reg
    ? (user ? t('{profile} wants to register a passkey on {rp} for {user}', { profile, rp, user }) : t('{profile} wants to register a passkey on {rp}', { profile, rp }))
    : (user ? t('{profile} wants to sign in to {rp} with {user}\'s passkey', { profile, rp, user }) : t('{profile} wants to sign in to {rp} with a passkey', { profile, rp }));
  const after = reg
    ? t('After this the agent can create ONE passkey on {rp} in the next 10 minutes; it stays sealed in this VibeSpace and each sign-in with it asks you first.', { rp })
    : (user ? t('After this the agent can sign in to {rp} as {user} until you change the policy.', { rp, user }) : t('After this the agent can sign in to {rp} with this passkey until you change the policy.', { rp }));
  const open = card.state === 'open';
  const buttons = open ? (Array.isArray(card.choices) ? card.choices : []).filter((c) => CHOICE_WORDS[c]).map((c, i) => ({ choice: c, label: t(CHOICE_WORDS[c]), primary: i === 0 })) : [];
  let outcome = '';
  if (card.state === 'answered') {
    const a = card.answer;
    outcome = a === 'always' ? t('Always allowed — the policy for this passkey is now: allow.')
      : a === 'never' ? t('Never — the policy for this passkey is now: never.')
      : a === 'once' ? (reg ? t('Allowed once — the agent may register the passkey now (for 10 minutes).') : t('Allowed once — this sign-in went through; the policy stays: ask each time.'))
      : (reg ? t('Not now — nothing was registered.') : t('Not now — this sign-in was refused; the policy stays: ask each time.'));
  } else if (card.state === 'expired') outcome = t('Expired — nobody answered in time; nothing was allowed.');
  else if (card.state === 'withdrawn') outcome = t('Withdrawn — the request ended before an answer; nothing was allowed.');
  return { title, after, buttons, outcome, open, rp, user, profile, kind: reg ? 'register' : 'sign-in' };
}
/** key-file-law-fix (verify r1 F1): the passkey KEY FILE refused (src/key-file.js codes) — ONE For-you line naming the file and
 *  the refusal (the key-file law's own words, src/lib/key-file-words.js), the detail = what it means for passkeys. */
const KEY_WORDS = Object.freeze({
  'key-missing': 'Key file {file} is missing — restore it from a backup',
  'key-malformed': 'Key file {file} is damaged — restore it from a backup; nothing was replaced',
  'key-unreadable': 'Key file {file} could not be read ({code}) — no new key was made',
  detail: 'The agent browser\'s saved passkeys are sealed under this key: until it is back, a sign-in goes on without them and a new passkey is not kept.',
});
function keyForYouItem(r) {
  const m = /^(key-missing|key-malformed|key-unreadable)(?::([A-Za-z0-9_]+))?$/.exec(str(r && r.code));
  if (!m) return null;
  const file = str(r.file) || 'the key file', key = KEY_WORDS[m[1]], params = m[1] === 'key-unreadable' ? { file, code: m[2] || '?' } : { file };
  return { text: fill(key, params), detail: KEY_WORDS.detail, urgency: 'high', i18n: { text: { key, params }, detail: [{ key: KEY_WORDS.detail }] } };
}
function forYouItem(b, { label = '' } = {}) {
  const rp = rpWord(b && b.rpId) || 'this site';
  return {
    text: fill(FOR_YOU_WORDS.text, { rp }) + (label ? ` — ${str(label).slice(0, 80)}` : ''),
    detail: FOR_YOU_WORDS.detail,
    i18n: { text: { key: FOR_YOU_WORDS.text, params: { rp } }, detail: [{ key: FOR_YOU_WORDS.detail }] }, // lane passkey-ui: detail = an array of lines (user-todos normalizeI18n refused the object)
  };
}

/** THE HOOK — runs in the page's MAIN world: before any page script of a new document (`Page.addScriptToEvaluateOnNewDocument`),
 *  in a document already there only when the watch finds no hook of ours in it (`Runtime.evaluate`); stringified, so it
 *  references nothing outside itself. `G` = the global, `cfg` = {binding, key} (both minted per ARM, never per profile).
 *  · the binding (`Runtime.addBinding`) is captured into the closure and DELETED from the global — the page finds nothing;
 *  · `get` / `create` on CredentialsContainer.prototype are replaced keeping the native descriptor's flags (a WebIDL
 *    operation is enumerable/writable/configurable — new flags would be the fingerprint), `this` and every argument
 *    passed through; only a publicKey ceremony is touched (password / federated / conditional-mediation autofill —
 *    which never blocks the page — go straight to the native function);
 *  · a ceremony's options reach the native call as `Object.create(options, {signal})` — every member the caller set is
 *    read through the prototype chain (WebIDL dictionaries read with [[Get]]), the signal = the caller's own composed
 *    with a product-held AbortController (AbortSignal.any, else a relay);
 *  · the registry lives in this closure. THE CANCEL: the watch calls `ctl` (below) with (key, 'cancel'); the closure aborts
 *    every pending controller, the native promise rejects with AbortError.
 *  · lane passkey-prewrap-fix (passkey-verify lens ②): THE WATCH REACHES THIS CLOSURE BY OBJECT IDENTITY, NEVER THROUGH THE
 *    SLOT, AND NEVER BY TEXT. The slot stays `configurable` (a locked slot would be the fingerprint), so whatever sits at
 *    `CredentialsContainer.prototype.get` may be the page's — the wrappers take NO control verbs at all. `ctl` lives in a
 *    PRIVATE FIELD stamped on the prototype under the profile's random slot name (hookSource writes it in): page script can
 *    neither read nor enumerate a private field, nor make one without its name; the watch reads it with
 *    `Runtime.getProperties` (privateProperties) and calls it with `Runtime.callFunctionOn` (CTL_FN / REARM_FN). A RE-ARM
 *    (the watch's new socket) hands THAT `ctl` the new binding + the new key and `retake`s the slot when the page put its
 *    own function there (ours back; `hook-displaced`). The key is minted per arm — an old one is refused after a re-arm. */
function installHook(G, cfg) {
  'use strict';
  // lane passkey-binding-isolated (B-7c9a): the hook NEVER holds a privileged global binding — on a live-document re-arm a
  // page polling global names grabbed the arm binding and could forge trace / card events (§2.8 residual). It reports by
  // dispatching a per-profile SECRET-named CustomEvent on `document` (natives captured here, before any page script); the
  // real `Runtime.addBinding` binding lives only in an ISOLATED WORLD (installReporter), off the page's main-world global
  // for good, and that reporter forwards the event's detail to it.
  if (!G.CredentialsContainer || !G.AbortController || !G.CustomEvent || !G.document || !G.EventTarget) return false;
  const proto = G.CredentialsContainer.prototype;
  const CE = G.CustomEvent, doc = G.document, dispatch = G.EventTarget.prototype.dispatchEvent, chan = String(cfg.chan || '');
  if (typeof dispatch !== 'function' || !chan) return false;
  const send = (payload) => { try { dispatch.call(doc, new CE(chan, { detail: payload, bubbles: false })); } catch (e) { /* the reporter's world went */ } };
  // taken here — in a new document before any page script — so `retake` and the reports never use what a page replaced later
  const gopd = G.Object.getOwnPropertyDescriptor, defp = G.Object.defineProperty, enc = G.JSON.stringify;
  const AC = G.AbortController, AS = G.AbortSignal;
  const reg = new Map();
  let seq = 0, tell = send, key = String(cfg.key || '');
  let busy = null;      // hold mode: a released ceremony in flight (+ the watch's drain) — a later one of this document queues behind it
  let drainedFn = null;
  const say = (o) => { try { tell(enc(o)); } catch (e) { /* the watch went */ } };
  const err = (name, msg) => { try { return new G.DOMException(msg, name); } catch (e) { const x = new Error(msg); x.name = name; return x; } };
  const both = (a, b) => {
    if (AS && typeof AS.any === 'function') return AS.any([a, b]);
    const c = new AC();
    const relay = (s) => () => { if (!c.signal.aborted) c.abort(s.reason); };
    for (const s of [a, b]) { if (s.aborted) { relay(s)(); break; } s.addEventListener('abort', relay(s), { once: true }); }
    return c.signal;
  };
  const rpOf = (kind, pk) => { try { const v = kind === 'create' ? (pk.rp && pk.rp.id) : pk.rpId; return typeof v === 'string' && v ? v : String((G.location && G.location.hostname) || ''); } catch (e) { return ''; } };
  const b64u = (v) => { try { const u = v instanceof ArrayBuffer ? new Uint8Array(v) : new Uint8Array(v.buffer, v.byteOffset, v.byteLength); let b = ''; for (let i = 0; i < u.length && i < 1024; i++) b += String.fromCharCode(u[i]); return G.btoa(b).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); } catch (e) { return ''; } };
  const fields = (kind, pk, mediation) => {
    const o = {};
    try { o.uv = String((kind === 'create' ? pk.authenticatorSelection && pk.authenticatorSelection.userVerification : pk.userVerification) || 'preferred'); } catch (e) { /* */ }
    try { if (kind === 'get' && Array.isArray(pk.allowCredentials)) o.allow = pk.allowCredentials.slice(0, 20).map((c) => b64u(c && c.id)).filter(Boolean); } catch (e) { /* */ }
    try { if (kind === 'create' && pk.user) o.user = { name: String(pk.user.name || '').slice(0, 64), displayName: String(pk.user.displayName || '').slice(0, 64) }; } catch (e) { /* */ }
    try { o.origin = String(G.location.origin || ''); } catch (e) { /* */ }
    if (mediation === 'conditional') o.mediation = 'conditional';
    return o;
  };
  /** The watch's verbs on a held ceremony (through `ctl` only). */
  const control = (verb, id) => {
    if (verb === 'cancel') { let n = 0; for (const r of reg.values()) if (!r.ctl.signal.aborted) { r.cancelled = true; r.ctl.abort(); n++; } return n; }
    if (verb === 'drained') { const f = drainedFn; drainedFn = null; if (f) f(); return 1; }
    const r = reg.get(Number(id));
    if (!r || !r.held) return 0;
    if (verb === 'wait') { r.arm(); return 1; }
    if (verb === 'refuse') { r.fail(err('NotAllowedError', 'The operation either timed out or was not allowed.'), 'refused'); return 1; }
    if (verb === 'release') { r.release(); return 1; }
    return 0;
  };
  const mine = {}; // kind → our wrapper + the native slot's flags (what `retake` puts back)
  /** The page's own function in our slot ⇒ ours back; a slot the page made non-configurable stays the page's (said, not fought). */
  const retake = () => {
    const out = { displaced: [], kept: [] };
    for (const kind of ['get', 'create']) {
      const m = mine[kind];
      let d = null; try { d = m ? gopd(proto, kind) : null; } catch (e) { d = null; }
      if (!m || (d && d.value === m.fn)) continue;
      out.displaced.push(kind);
      try { if (d && !d.configurable) throw new Error('fixed'); defp(proto, kind, { value: m.fn, writable: m.writable, enumerable: m.enumerable, configurable: m.configurable }); } catch (e) { out.kept.push(kind); }
    }
    return out;
  };
  /** THE CONTROL — reachable only through the private field (the watch's CDP call; `this` there = this function). `rebind`
   *  = a re-arm: the new binding + the new key (reaching `ctl` IS the proof — the old key is not needed and dies here). */
  const ctl = function (k, verb, a, b) {
    if (verb === 'rebind') { if (typeof b === 'string' && b) key = b; return retake(); } // lane passkey-binding-isolated: send is a stable CustomEvent dispatch; a re-arm only re-keys + retakes
    if (typeof k !== 'string' || !k || k !== key) return -2;
    return control(String(verb), a);
  };
  const wrap = (kind) => {
    const desc = gopd(proto, kind);
    if (!desc || typeof desc.value !== 'function') return;
    const native = desc.value;
    const hooked = { [kind](...args) {
      const opts = args[0];
      let pk = null, mediation = null, callerSignal = null;
      try { pk = opts && typeof opts === 'object' ? opts.publicKey : null; mediation = opts && opts.mediation; callerSignal = opts && opts.signal ? opts.signal : null; } catch (e) { pk = null; }
      if (!pk || typeof pk !== 'object' || (mediation === 'conditional' && !cfg.hold)) return Reflect.apply(native, this, args);
      const id = ++seq;
      const ctl = new AC();
      const rec = { ctl, cancelled: false, held: false };
      const signal = callerSignal ? both(callerSignal, ctl.signal) : ctl.signal;
      const pass = [Object.create(opts, { signal: { value: signal, enumerable: true } }), ...args.slice(1)];
      const ended = (e) => (rec.cancelled ? 'cancelled' : (callerSignal && callerSignal.aborted ? 'aborted-by-page' : (e ? 'error' : 'ok')));
      if (!cfg.hold) {
        reg.set(id, rec);
        say({ ev: 'start', id, kind, rpId: rpOf(kind, pk) });
        const done = (outcome, name) => { reg.delete(id); say({ ev: 'end', id, outcome, name }); };
        let p;
        try { p = Reflect.apply(native, this, pass); } catch (e) { done('error', e && e.name); throw e; }
        Promise.resolve(p).then(() => done('ok'), (e) => done(ended(e), String((e && e.name) || 'Error')));
        return p;
      }
      // lane passkey-store-core: HOLD — the native call waits for the watch's verdict (the store's key is loaded into the
      // tab's empty authenticator only on `release`); no verdict in cfg.holdMs ⇒ rejected in-page (P0 ④: never the native call)
      const self = this;
      return new Promise((resolve, reject) => {
        let timer = null;
        const done = (outcome, name) => { if (!reg.has(id)) return; reg.delete(id); if (timer) clearTimeout(timer); say({ ev: 'end', id, outcome, name }); };
        rec.fail = (e, outcome) => { if (!rec.held) return; rec.held = false; done(outcome, e && e.name); reject(e); };
        rec.arm = () => { if (timer) clearTimeout(timer); timer = setTimeout(() => rec.fail(err('NotAllowedError', 'The operation either timed out or was not allowed.'), 'error'), Number(cfg.holdMs) || 1500); };
        rec.release = () => {
          rec.held = false; if (timer) clearTimeout(timer);
          let settle = null; const mine = new Promise((r) => { settle = r; }); busy = mine;
          const after = () => { new Promise((r) => { drainedFn = r; setTimeout(r, 300); }) /* the watch serializes a tab's ceremonies itself; this only spares a dead watch's page */.then(() => { if (busy === mine) busy = null; settle(); }); };
          let p;
          try { p = Reflect.apply(native, self, pass); } catch (e) { done('error', e && e.name); reject(e); after(); return; }
          Promise.resolve(p).then((v) => { done('ok'); resolve(v); after(); }, (e) => { done(ended(e), String((e && e.name) || 'Error')); reject(e); after(); });
        };
        signal.addEventListener('abort', () => rec.fail(signal.reason && typeof signal.reason === 'object' ? signal.reason : err('AbortError', 'The operation was aborted.'), rec.cancelled ? 'cancelled' : 'aborted-by-page'), { once: true });
        const start = () => {
          if (signal.aborted) { reject(signal.reason && typeof signal.reason === 'object' ? signal.reason : err('AbortError', 'The operation was aborted.')); return; }
          rec.held = true; reg.set(id, rec);
          say({ ev: 'start', id, kind, rpId: rpOf(kind, pk), ...fields(kind, pk, mediation) });
          rec.arm();
        };
        if (busy) busy.then(start, start); else start();
      });
    } }[kind];
    mine[kind] = { fn: hooked, writable: desc.writable, enumerable: desc.enumerable, configurable: desc.configurable };
    defp(proto, kind, { value: hooked, writable: desc.writable, enumerable: desc.enumerable, configurable: desc.configurable });
  };
  // THE STAMP first (no stamp ⇒ no wrapper: a held ceremony nobody can release would hang the page): `ctl` in a private
  // field of the prototype — the base constructor returns the prototype itself, so the field lands on it
  try { class Base { constructor(o) { return o; } } class Stamp extends Base { #vsPasskeyCtl; constructor(o) { super(o); this.#vsPasskeyCtl = ctl; } } new Stamp(proto); } catch (e) { return false; }
  wrap('get'); wrap('create');
  if (typeof cfg.expose === 'function') cfg.expose(ctl); // PURE tests only — the injected cfg is JSON (never a function)
  return true;
}
/** lane passkey-prewrap-fix: the private field's name in installHook's text — hookSource writes the profile's slot name over it. */
const SLOT_MARK = '#vsPasskeyCtl';
const slotName = (slot) => (/^[A-Za-z][A-Za-z0-9_]{7,63}$/.test(str(slot)) ? '#' + str(slot) : SLOT_MARK);
/** The script the watch injects (one per arm; the same text evaluated into a document that has no hook of ours yet). */
function hookSource({ chan, key, slot = '', hold = false, holdMs = HOOK_HOLD_MS }) { return `;(${installHook.toString().split(SLOT_MARK).join(slotName(slot))})(globalThis, ${JSON.stringify({ chan: str(chan), key: str(key), ...(hold ? { hold: true, holdMs: Number(holdMs) || HOOK_HOLD_MS } : {}) })});`; }
/** lane passkey-binding-isolated: the ISOLATED-WORLD reporter — it, not the page's main world, holds the real
 *  `Runtime.addBinding` binding (armed with `executionContextName`, so the name never lands on the page's global). It
 *  grabs the binding from its own world's global, drops the name, and forwards the hook's secret-named CustomEvent detail
 *  to it. Runs in the named world — new documents via addScriptToEvaluateOnNewDocument({worldName}), a live document on a
 *  re-arm via createIsolatedWorld + evaluate. A page can neither enter this world nor guess the channel, so it can no
 *  longer see the binding name nor forge trace / card events. */
function installReporter(G, cfg) {
  'use strict';
  const send = G[cfg.binding];
  try { delete G[cfg.binding]; } catch (e) { /* this world is page-unreachable; a name left here is harmless */ }
  if (typeof send !== 'function' || !G.document || !G.EventTarget) return false;
  const add = G.EventTarget.prototype.addEventListener, chan = String(cfg.chan || '');
  if (typeof add !== 'function' || !chan) return false;
  try { add.call(G.document, chan, function (e) { try { send(e && e.detail); } catch (x) { /* */ } }); } catch (e) { return false; }
  return true;
}
function reporterSource({ binding, chan }) { return `;(${installReporter.toString()})(globalThis, ${JSON.stringify({ binding: str(binding), chan: str(chan) })});`; }
/** lane passkey-prewrap-fix: the watch's calls on the `ctl` it found by identity (`Runtime.callFunctionOn`, `this` = ctl) — a
 *  direct call (never `Function.prototype.call`, the page's to replace). CTL = a verb with this arm's key: `cancel`, the
 *  verdict on a held ceremony (`release` | `refuse` | `wait` — the ask's heartbeat), `drained` (the authenticator is empty
 *  again). REARM = this arm's binding taken off the global in the same step + the new key; answers `retake`'s {displaced, kept}. */
const CTL_FN = 'function (k, v, a) { return this(k, v, a); }';
const REARM_FN = 'function (k) { return this("", "rebind", null, k); }'; // lane passkey-binding-isolated: the binding is isolated-world; a re-arm hands the main-world ctl only the fresh key
/** The hook's in-page deadline (P0 ④: after the watch's socket goes the native get hangs past the page's own timeout). */
const HOOK_HOLD_MS = 1500;

module.exports = {
  passkeyCardWords, CHOICE_WORDS, // lane passkey-ui
  PASSKEY_OPEN_CODE, PASSKEY_ASK_CODE, REFUSED_SAID_MS, HOOK_HOLD_MS, KINDS, OUTCOMES, PENDING_SAID_MS, FOR_YOU_AFTER_MS, RECORDS_KEEP, PASSKEY_PASS_VERBS, PASSKEY_READ_VERBS,
  NONE_TEXT, UNKNOWN_TEXT, FOR_YOU_WORDS,
  rpWord, parseEvent, kernelEvent /* lane passkey-sink */, recordOf, applyEvent, endPending, passkeyVerdict, passkeyText, passkeyBlock, passkeyPasses, passkeyReads,
  loopVerdict, cancelText, passkeyWords, forYouItem, keyForYouItem, installHook, hookSource, installReporter, reporterSource, SLOT_MARK, CTL_FN, REARM_FN, askText, refusedText, registerText, // lane passkey-binding-isolated: + the isolated-world reporter; − dropExpression (no main-world binding to drop)
};

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
const KINDS = Object.freeze(['get', 'create']);
const OUTCOMES = Object.freeze(['pending', 'ok', 'error', 'cancelled', 'aborted-by-page']);
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
  if (o.ev === 'start') return { ev: 'start', id: o.id, kind: KINDS.includes(o.kind) ? o.kind : 'get', rpId: rpWord(o.rpId) };
  if (o.ev === 'end') return { ev: 'end', id: o.id, outcome: OUTCOMES.includes(o.outcome) && o.outcome !== 'pending' ? o.outcome : 'error', name: /^[A-Za-z]{1,40}$/.test(str(o.name)) ? str(o.name) : null };
  return null;
}
/** The ceremony record: `{id, kind, rpId, startedAt, tab, outcome, endedAt}` (`id` = `<tab>:<ctx>:<n>` — unique per document). */
function recordOf(ev, { tab = null, ctx = 0, now = 0 } = {}) {
  return { id: `${str(tab)}:${Number(ctx) || 0}:${ev.id}`, n: ev.id, ctx: Number(ctx) || 0, kind: ev.kind, rpId: ev.rpId, startedAt: Number(now) || 0, tab: tab == null ? null : str(tab), outcome: 'pending', endedAt: 0 };
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
  const pend = (records || []).filter((r) => r && r.outcome === 'pending').sort((a, b) => a.startedAt - b.startedAt);
  if (!pend.length) return { state: 'none' };
  const r = pend[0];
  const age = (Number(now) || 0) - r.startedAt;
  if (age < saidMs) return { state: 'pending', record: r, sayAt: r.startedAt + saidMs };
  return { state: PASSKEY_OPEN_CODE, record: r, since: r.startedAt, rpId: r.rpId, text: passkeyText(r), forYou: age >= FOR_YOU_AFTER_MS };
}
/** THE SENTENCE — the first words of every agent-facing surface while a ceremony is open. */
function passkeyText(r) {
  const rp = rpWord(r && r.rpId) || 'this site';
  return `This page is waiting for a passkey (${rp}). The agent's browser holds no passkey of yours — cancel it (\`vibespace-browser passkey cancel\`) and use the page's other way in (a recovery code, a password), or ask the user to sign in on their own device.`;
}
/** A verdict as the routes and the CLI carry it (no clock inside; `record` trimmed to what a reader needs). */
function passkeyBlock(v) {
  if (!v || v.state !== PASSKEY_OPEN_CODE) return v ? { state: v.state } : null;
  const r = v.record;
  return { state: v.state, id: r.id, kind: r.kind, rpId: r.rpId, tab: r.tab, startedAt: r.startedAt, text: v.text };
}
const passkeyPasses = (verb) => PASSKEY_PASS_VERBS.includes(str(verb));
const passkeyReads = (verb) => PASSKEY_READ_VERBS.includes(str(verb));
/** THE LOOP VERDICT (the incident's 4× Escape): while a ceremony is open, a verb that would ACT on the page (a key, a click,
 *  typing — the page takes no input under Chrome's window) answers THE SENTENCE instead of acting, every time — `answer`;
 *  a reading verb runs with the sentence first (`note`); the ways out run (`run`). */
function loopVerdict(verb, v) {
  if (!v || v.state !== PASSKEY_OPEN_CODE) return { act: 'run' };
  if (passkeyPasses(verb)) return { act: 'run' };
  if (passkeyReads(verb)) return { act: 'note', code: PASSKEY_OPEN_CODE, text: v.text };
  return { act: 'answer', code: PASSKEY_OPEN_CODE, text: v.text };
}
function cancelText({ n = 0, rpId = '' } = {}) {
  if (!n) return 'No passkey request is waiting on your browser.';
  const rp = rpWord(rpId) || 'this site';
  return `Cancelled the page's passkey request (${rp}) — the page was told the request was aborted and takes input again. Use its other way in (a recovery code, a password), or ask the user to sign in on their own device.`;
}
const NONE_TEXT = 'No passkey request is waiting on your browser.';
const UNKNOWN_TEXT = 'VibeSpace cannot see passkey requests on this browser (it started before VibeSpace could watch them) — a page that will not move may be waiting for one: navigate elsewhere or close the tab.';

function fill(s, p) { return String(s).replace(/\{(\w+)\}/g, (m, k) => (p && p[k] !== undefined ? String(p[k]) : m)); }
/** The live view's banner (ONE button: Cancel) and the chip — `headed`: Chrome's own window is on this computer's desktop. */
function passkeyWords(b, tIn, { headed = false } = {}) {
  if (!b || b.state !== PASSKEY_OPEN_CODE) return null;
  const t = typeof tIn === 'function' ? (s, p) => tIn(s, p) : fill;
  const rp = rpWord(b.rpId) || t('this site');
  return {
    title: t('This page is waiting for a passkey ({rp})', { rp }),
    line: t('The agent\'s browser holds no passkey of yours — cancel the request, then use the page\'s other way in (a recovery code, a password), or sign in on your own device.'),
    desktop: headed ? t('Chrome\'s own passkey window is open on this computer\'s desktop — it does not show in this view.') : '',
    cancel: t('Cancel passkey request'),
    chip: t('page waits for a passkey'),
  };
}
/** The For-you item (origin browser; ONE per (profile, rpId); resolved by itself when the request ends). Literal keys. */
const FOR_YOU_WORDS = Object.freeze({
  text: 'A page in the agent\'s browser is waiting for a passkey ({rp})',
  detail: 'The agent\'s browser holds no passkey of yours. Cancel the request in the live view (or the agent runs `vibespace-browser passkey cancel`), then use the page\'s other way in, or sign in on your own device.',
});
function forYouItem(b, { label = '' } = {}) {
  const rp = rpWord(b && b.rpId) || 'this site';
  return {
    text: fill(FOR_YOU_WORDS.text, { rp }) + (label ? ` — ${str(label).slice(0, 80)}` : ''),
    detail: FOR_YOU_WORDS.detail,
    i18n: { text: { key: FOR_YOU_WORDS.text, params: { rp } }, detail: { key: FOR_YOU_WORDS.detail } },
  };
}

/** THE HOOK — runs in the page's MAIN world before any page script (`Page.addScriptToEvaluateOnNewDocument`); stringified,
 *  so it references nothing outside itself. `G` = the global, `cfg` = {binding, key} (both random per arm).
 *  · the binding (`Runtime.addBinding`) is captured into the closure and DELETED from the global — the page finds nothing;
 *  · `get` / `create` on CredentialsContainer.prototype are replaced keeping the native descriptor's flags (a WebIDL
 *    operation is enumerable/writable/configurable — new flags would be the fingerprint), `this` and every argument
 *    passed through; only a publicKey ceremony is touched (password / federated / conditional-mediation autofill —
 *    which never blocks the page — go straight to the native function);
 *  · a ceremony's options reach the native call as `Object.create(options, {signal})` — every member the caller set is
 *    read through the prototype chain (WebIDL dictionaries read with [[Get]]), the signal = the caller's own composed
 *    with a product-held AbortController (AbortSignal.any, else a relay);
 *  · the registry lives in this closure. THE CANCEL: the watch runs `Runtime.evaluate` in the tab's main world calling
 *    the hooked `get` with ('cancel', key) — a 128-bit key only this closure and the watch know; the closure aborts
 *    every pending controller, the native promise rejects with AbortError. */
function installHook(G, cfg) {
  const send = G[cfg.binding];
  try { delete G[cfg.binding]; } catch (e) { /* a binding that cannot go stays named by a random word */ }
  if (typeof send !== 'function' || !G.CredentialsContainer || !G.AbortController) return false;
  const proto = G.CredentialsContainer.prototype;
  const AC = G.AbortController, AS = G.AbortSignal;
  const reg = new Map();
  let seq = 0;
  const say = (o) => { try { send(JSON.stringify(o)); } catch (e) { /* the watch went */ } };
  const both = (a, b) => {
    if (AS && typeof AS.any === 'function') return AS.any([a, b]);
    const c = new AC();
    const relay = (s) => () => { if (!c.signal.aborted) c.abort(s.reason); };
    for (const s of [a, b]) { if (s.aborted) { relay(s)(); break; } s.addEventListener('abort', relay(s), { once: true }); }
    return c.signal;
  };
  const rpOf = (kind, pk) => { try { const v = kind === 'create' ? (pk.rp && pk.rp.id) : pk.rpId; return typeof v === 'string' && v ? v : String((G.location && G.location.hostname) || ''); } catch (e) { return ''; } };
  const wrap = (kind) => {
    const desc = Object.getOwnPropertyDescriptor(proto, kind);
    if (!desc || typeof desc.value !== 'function') return;
    const native = desc.value;
    const hooked = { [kind](...args) {
      if (args.length === 2 && args[1] === cfg.key && args[0] === 'cancel') {
        let n = 0;
        for (const r of reg.values()) if (!r.ctl.signal.aborted) { r.cancelled = true; r.ctl.abort(); n++; }
        return n;
      }
      const opts = args[0];
      let pk = null, mediation = null, callerSignal = null;
      try { pk = opts && typeof opts === 'object' ? opts.publicKey : null; mediation = opts && opts.mediation; callerSignal = opts && opts.signal ? opts.signal : null; } catch (e) { pk = null; }
      if (!pk || typeof pk !== 'object' || mediation === 'conditional') return Reflect.apply(native, this, args);
      const id = ++seq;
      const ctl = new AC();
      const rec = { ctl, cancelled: false };
      const signal = callerSignal ? both(callerSignal, ctl.signal) : ctl.signal;
      const pass = [Object.create(opts, { signal: { value: signal, enumerable: true } }), ...args.slice(1)];
      reg.set(id, rec);
      say({ ev: 'start', id, kind, rpId: rpOf(kind, pk) });
      const done = (outcome, name) => { reg.delete(id); say({ ev: 'end', id, outcome, name }); };
      let p;
      try { p = Reflect.apply(native, this, pass); } catch (e) { done('error', e && e.name); throw e; }
      Promise.resolve(p).then(() => done('ok'), (e) => done(rec.cancelled ? 'cancelled' : (callerSignal && callerSignal.aborted ? 'aborted-by-page' : 'error'), String((e && e.name) || 'Error')));
      return p;
    } }[kind];
    Object.defineProperty(proto, kind, { value: hooked, writable: desc.writable, enumerable: desc.enumerable, configurable: desc.configurable });
  };
  wrap('get'); wrap('create');
  return true;
}
/** The script the watch injects (one per arm). */
function hookSource({ binding, key }) { return `;(${installHook.toString()})(globalThis, ${JSON.stringify({ binding: str(binding), key: str(key) })});`; }
/** The watch's cancel expression (evaluated in the tab's main world). */
function cancelExpression(key) { return `(function(){try{return CredentialsContainer.prototype.get.call(null,'cancel',${JSON.stringify(str(key))})}catch(e){return -1}})()`; }

module.exports = {
  PASSKEY_OPEN_CODE, KINDS, OUTCOMES, PENDING_SAID_MS, FOR_YOU_AFTER_MS, RECORDS_KEEP, PASSKEY_PASS_VERBS, PASSKEY_READ_VERBS,
  NONE_TEXT, UNKNOWN_TEXT, FOR_YOU_WORDS,
  rpWord, parseEvent, recordOf, applyEvent, endPending, passkeyVerdict, passkeyText, passkeyBlock, passkeyPasses, passkeyReads,
  loopVerdict, cancelText, passkeyWords, forYouItem, installHook, hookSource, cancelExpression,
};

'use strict';
/**
 * r3136 / r3200 (主开发: «a way out for the person from a hold that never ends, not only one notice») — an account's USAGE READING
 * FILE that cannot be read (or does not parse), said in For you WITH ITS DOOR. src/usage-cache-write.js never writes over it while
 * its read fails (r3136): automatic turns, wakes and pool moves on that account WAIT (unknown, never «no reading» as for a new
 * account) and its readings wait in memory. The file may stay so for good (a file left owned by another user, a bad inode) while
 * its folder stays writable — the person's way out is HERE: ONE item an account (origin `server`, «Usage»), action
 * `usage-reading-unread`, whose door is the For-you window's «Set it aside» (POST /api/usage-reading/{account}/set-aside, declared
 * by its src/foryou-actions.js row; a person's press on the owner's page only): the file read once more, then RENAMED beside itself
 * (nothing deleted) and a file that STARTS AGAIN put in its place — every fact unknown until a reading states it, the readings
 * waiting in memory written over it at once (usageWrite.setAsideReading). The item resolves itself when the file reads again or is
 * set aside; an earlier run's item is judged once at the first tick (its file read once).
 */
const i18nKey = (s) => s;   // a DECLARED human-visible string (scripts/i18n-extract.mjs): zh + ja in src/lib/i18n-zh.js / i18n-ja.js
const ITEM_KEY = 'usage-readings';
const TYPE = 'usage-reading-unread';
const ROUTE = '/api/usage-reading/:account/set-aside';
const TEXT = i18nKey("VibeSpace could not read the usage file of {account}: automatic turns on it wait until it reads again, and your own messages are not held");
const DETAIL = i18nKey('VibeSpace reads it again by itself. If this stays (a file left owned by another user, a damaged disk), repair the file, or press Set it aside: the file is renamed beside it (nothing is deleted) and starts again, and the account counts as unknown until its next usage reading');
// r3285 (2): the SAME item (one an account) for a file that STARTED AGAIN after damaged bytes — its way out in a person's words
const TEXT_RESTART = i18nKey("The usage file of {account} was damaged and started again: automatic turns on it wait until its usage is read whole, and your own messages are not held");
const DETAIL_RESTART = i18nKey("Refresh this account's usage (its refresh in Accounts): the first whole reading ends the wait. The damaged bytes are kept beside the file; nothing else is needed");

/** The item's words (PURE): {text, detail, i18n} — `kind` 'unread' (the file cannot be read) or 'restart' (it started again). */
function itemOf(name, kind = 'unread') {
  const params = { account: String(name || 'an account') };
  const T = kind === 'restart' ? TEXT_RESTART : TEXT, D = kind === 'restart' ? DETAIL_RESTART : DETAIL;
  return { text: T.replace('{account}', params.account), detail: D, i18n: { text: { key: T, params }, detail: [{ key: D }] } };
}

function create({ app = null, todos: getTodos = () => null, usageWrite = require('../usage-cache-write.js'), cacheDir, nameOf = () => null, isKnown = () => false, backendOf = () => null, readNow = null, every = 60000, log = () => { } }) {
  const todos = () => { try { return getTodos(); } catch { return null; } };
  // the REAL store's own names, called as they are (r3285 (1): a renamed method throws and is said, never a silent «no item»)
  const openItems = (t, key = null) => (t.forSession([ITEM_KEY]) || []).filter((i) => i && i.status === 'open' && i.action && i.action.type === TYPE && (key == null || i.action.account === key));
  const heldFy = (t) => !!(t && typeof t.isHeldUnread === 'function' && t.isHeldUnread() && typeof t.whenRead === 'function');
  const atRead = new Set();   // ONE waiter an account while For you is held
  const filed = new Map();    // key → the kind its open item says (the store is the truth: asked again whenever a hold is seen)
  // the account's label (the engine's label helper: it never prints a name holding an address) — never its id while the engine
  // is still being built (the helper not yet there): the opaque word then, and the next tick files the label
  const labelFor = (k) => { try { const n = nameOf(k); return typeof n === 'string' && n ? n : null; } catch { return null; } };
  const kindNow = (k) => {
    if (usageWrite.readingUnread(k)) return 'unread';
    let r = null; try { r = typeof readNow === 'function' ? readNow(k) : null; } catch { r = null; }
    if (r === usageWrite.UNREAD_READING) return 'unread';
    let unk = []; try { unk = usageWrite.restartUnknowns(r); } catch { unk = []; }
    return unk.length ? 'restart' : null;
  };
  /** File (or update) the account's ONE item for its hold `kind`. → its id, or null (not filed now: the tick and the next mark ask again) */
  function said(key, kind = 'unread') {
    const k = String(key || ''), t = todos();
    if (!k || !t || !isKnown(k)) return null;
    if (heldFy(t)) { if (!atRead.has('s|' + k)) { atRead.add('s|' + k); t.whenRead(() => { atRead.delete('s|' + k); const kn = kindNow(k); if (kn) said(k, kn); }, "an unread usage file's item"); } return null; }
    const name = labelFor(k);
    const it = itemOf(name || 'an account', kind);
    let r = null;
    try { r = t.add(ITEM_KEY, { origin: 'server', kind: 'action', urgency: 'high', by: 'agent', sessionName: 'Usage', text: it.text, detail: it.detail, i18n: it.i18n, action: { type: TYPE, account: k }, itemKey: TYPE + ':' + k }); }
    catch (e) { log(`[usage-reading] the unread-file item was not filed: ${e && e.message}`); return null; }
    const id = (r && (r.id || (r.item && r.item.id))) || null;
    if (id && name) filed.set(k, kind); else filed.delete(k);   // filed under the opaque word: filed again at the tick with its label
    return id;
  }
  /** That account's file reads whole again, or was set aside into a state with no hold: its item resolves. → how many */
  function settled(key, how) {
    const k = String(key || ''), t = todos();
    filed.delete(k);
    if (!k || !t) return 0;
    if (heldFy(t)) { if (!atRead.has('d|' + k)) { atRead.add('d|' + k); t.whenRead(() => { atRead.delete('d|' + k); if (!kindNow(k)) settled(k, how); }, "an unread usage file's item"); } return 0; }
    let n = 0;
    let open = []; try { open = openItems(t, k); } catch (e) { log(`[usage-reading] the For-you list could not be read (${how}): ${e && e.message}`); return 0; }
    for (const i of open) { try { t.setStatus(i.id, 'done', 'usage-reading'); n++; } catch (e) { log(`[usage-reading] the unread-file item ${i.id} was not resolved (${how}): ${e.message}`); } }
    return n;
  }
  /** r3285 (1): a hold SEEN (the guard's refusal, the verdict's hold) → is the account's item OPEN now? It is filed when it is not. The
   *  guard keeps its own notice back ONLY while this answers true. */
  function noteHeld(key, kind = null) {
    const k = String(key || '');
    if (!k) return false;
    const kn = kind || kindNow(k);
    if (!kn) return false;
    const t = todos();
    let open = false;
    if (t && !heldFy(t)) { try { open = openItems(t, k).length > 0; } catch { open = false; } }
    if (!open || filed.get(k) !== kn) { said(k, kn); if (t && !heldFy(t)) { try { open = openItems(t, k).length > 0; } catch { open = false; } } }
    return open;
  }
  /** a hold seen on a HOT path (the pre-fire verdict, the pool's pass): files the item only when this run has not filed it for this
   *  kind — no read of the For-you list (the guard's refusal asks noteHeld, which reads it) */
  function seen(key, kind) { const k = String(key || ''); if (k && kind && filed.get(k) !== kind) said(k, kind); }
  usageWrite.onUnreadMarked((k) => { if (!filed.has(k)) said(k, 'unread'); });
  usageWrite.onUnreadLifted((k) => { const kn = kindNow(k); if (kn) said(k, kn); else settled(k, 'reads'); });
  if (typeof usageWrite.onStartedAgain === 'function') usageWrite.onStartedAgain((k, how) => { if (how === 'started') said(k, 'restart'); else if (!usageWrite.readingUnread(k)) settled(k, 'whole'); });
  // THE TICK (every `every` ms, unref'd): an EARLIER RUN's open item is judged once (its file read once by the reading door: one that
  // still holds keeps it, else it closes); and every account marked now whose item is not open is filed again (r3285 (1))
  let swept = false;
  function tick() {
    const t = todos();
    if (!t || heldFy(t)) return;
    if (!swept) {
      swept = true;
      let open = []; try { open = openItems(t); } catch (e) { log(`[usage-reading] the For-you list could not be read (boot): ${e && e.message}`); open = []; }
      for (const i of open) { const k = i.action.account; const kn = kindNow(k); if (kn) said(k, kn); else settled(k, 'boot'); }
    }
    for (const k of (typeof usageWrite.unreadKeys === 'function' ? usageWrite.unreadKeys() : [])) { if (!filed.has(k)) said(k, 'unread'); }
  }
  if (every > 0) { const iv = setInterval(() => { try { tick(); } catch { } }, every); if (iv && iv.unref) iv.unref(); }
  /** THE DOOR: a person's «Set it aside» → {ok, state: 'pass' (set aside) | 'none' (it reads, or is gone), why?, error?} — a name that
   *  is not a known account answers NOT FOUND by name (r3285 (3): never the folder's models file, never a made-up name) */
  function setAside(key) {
    const k = String(key || '');
    const kn = /^[\w.-]{1,200}$/.test(k) ? isKnown(k) : false;
    // r3349: a file named for a paired machine while the machines' list cannot be read — never set aside, refused BY THAT NAME
    if (kn === 'unconfirmed') { const why = `the paired machines' list cannot be read right now, so «${k.slice(0, 80)}» cannot be confirmed — nothing is set aside until it reads again`; return { ok: false, code: 'machines_unread', why, error: why }; }
    if (!kn) return { ok: false, code: 'not_found', why: `no account «${k.slice(0, 80)}» has a usage file here`, error: `no account «${k.slice(0, 80)}» has a usage file here` };
    let backend = null; try { backend = backendOf(k) || null; } catch { backend = null; }
    const r = usageWrite.setAsideReading({ cacheDir, key: k, backend });
    if (r && r.ok) { const kn = kindNow(k); if (kn) said(k, kn); else settled(k, r.state); }
    return r && !r.ok && r.why && !r.error ? { ...r, error: r.why } : r;   // the page's toast reads `error` (src/lib/user-todos-actions.js)
  }
  if (app && typeof app.post === 'function') {
    app.post('/api/usage-reading/:account/set-aside', (req, res) => {   // (ROUTE, spelled where the routes' census reads it)
      const w = require('../write-origin.js').ownerPageWhy(req);   // a person's press: the owner's own page, never a bearer
      if (w) { const why = `an account's usage file is set aside only by the owner's press on the owner's own page; ${w === 'bearer' ? 'a request carrying a bearer token' : 'a request with no mark of the owner\'s page'} cannot`; return res.status(403).json({ ok: false, why, error: why }); }
      try { const r = setAside(req.params && req.params.account); res.status(r.ok ? 200 : (r.code === 'not_found' ? 404 : r.code === 'machines_unread' ? 503 : 500)).json(r); }
      catch (e) { res.status(500).json({ ok: false, why: e.message, error: e.message }); }
    });
  }
  return { said, settled, tick, setAside, noteHeld, seen };
}

module.exports = { create, itemOf, ITEM_KEY, TYPE, TEXT, DETAIL, TEXT_RESTART, DETAIL_RESTART, ROUTE };

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

/** The item's words (PURE): {text, detail, i18n}. */
function itemOf(name) {
  const params = { account: String(name || 'an account') };
  return { text: TEXT.replace('{account}', params.account), detail: DETAIL, i18n: { text: { key: TEXT, params }, detail: [{ key: DETAIL }] } };
}

function create({ app = null, todos: getTodos = () => null, usageWrite = require('../usage-cache-write.js'), cacheDir, nameOf = (k) => k, backendOf = () => null, readNow = null, log = () => { } }) {
  const todos = () => { try { return getTodos(); } catch { return null; } };
  const openItems = (t, key = null) => (typeof t.forSession === 'function' ? (t.forSession([ITEM_KEY]) || []) : []).filter((i) => i && i.status === 'open' && i.action && i.action.type === TYPE && (key == null || i.action.account === key));
  const heldFy = (t) => !!(t && typeof t.isHeldUnread === 'function' && t.isHeldUnread() && typeof t.whenRead === 'function');
  const atRead = new Set();   // ONE waiter an account while For you is held
  /** File the item (ONE an account: its itemKey) while that account's reading file cannot be read. → its id, or null */
  function said(key) {
    const k = String(key || ''), t = todos();
    if (!k || !t || !usageWrite.readingUnread(k)) return null;
    if (heldFy(t)) { if (!atRead.has('s|' + k)) { atRead.add('s|' + k); t.whenRead(() => { atRead.delete('s|' + k); said(k); }, "an unread usage file's item"); } return null; }
    let name = k; try { name = nameOf(k) || k; } catch { name = k; }
    const it = itemOf(name);
    let r = null;
    try { r = t.add(ITEM_KEY, { origin: 'server', kind: 'action', urgency: 'high', by: 'agent', sessionName: 'Usage', text: it.text, detail: it.detail, i18n: it.i18n, action: { type: TYPE, account: k }, itemKey: TYPE + ':' + k }); }
    catch (e) { log(`[usage-reading] the unread-file item was not filed: ${e && e.message}`); return null; }
    return (r && (r.id || (r.item && r.item.id))) || null;
  }
  /** That account's file reads again, or was set aside: its item resolves. → how many */
  function settled(key, how) {
    const k = String(key || ''), t = todos();
    if (!k || !t) return 0;
    if (heldFy(t)) { if (!atRead.has('d|' + k)) { atRead.add('d|' + k); t.whenRead(() => { atRead.delete('d|' + k); if (!usageWrite.readingUnread(k)) settled(k, how); }, "an unread usage file's item"); } return 0; }
    let n = 0;
    for (const i of openItems(t, k)) { try { t.setStatus(i.id, 'done', 'usage-reading'); n++; } catch (e) { log(`[usage-reading] the unread-file item ${i.id} was not resolved (${how}): ${e.message}`); } }
    return n;
  }
  usageWrite.onUnreadMarked((k) => { tick(); said(k); });
  usageWrite.onUnreadLifted((k) => { tick(); settled(k, 'reads'); });
  // an EARLIER RUN's open item (the marks live in memory): judged ONCE, at the engine's boot tick or the first mark / lift after it,
  // once For you answers and is not held — its file read once by the reading door (a read that fails marks it again and the item
  // stands; one that reads, or a file gone, closes it)
  let swept = false;
  function tick() {
    if (swept) return;
    const t = todos();
    if (!t || heldFy(t)) return;
    swept = true;
    for (const i of openItems(t)) {
      const k = i.action.account;
      let r = null; try { r = typeof readNow === 'function' ? readNow(k) : null; } catch { r = null; }
      if (r !== usageWrite.UNREAD_READING) settled(k, 'boot');
    }
  }
  /** THE DOOR: a person's «Set it aside» → {ok, state: 'pass' (set aside) | 'none' (it reads again or is gone), why?} (the row's checkSaid words it) */
  function setAside(key) {
    const k = String(key || '');
    if (!/^[\w.-]{1,200}$/.test(k)) return { ok: false, why: 'not an account' };
    let backend = null; try { backend = backendOf(k) || null; } catch { backend = null; }
    const r = usageWrite.setAsideReading({ cacheDir, key: k, backend });
    if (r && r.ok) settled(k, r.state);
    return r;
  }
  if (app && typeof app.post === 'function') {
    app.post('/api/usage-reading/:account/set-aside', (req, res) => {   // (ROUTE, spelled where the routes' census reads it)
      const w = require('../write-origin.js').ownerPageWhy(req);   // a person's press: the owner's own page, never a bearer
      if (w) return res.status(403).json({ ok: false, error: `an account's usage file is set aside only by the owner's press on the owner's own page; ${w === 'bearer' ? 'a request carrying a bearer token' : 'a request with no mark of the owner\'s page'} cannot` });
      try { const r = setAside(req.params && req.params.account); res.status(r.ok ? 200 : (r.why === 'not an account' ? 400 : 500)).json(r); }
      catch (e) { res.status(500).json({ ok: false, error: e.message }); }
    });
  }
  return { said, settled, tick, setAside };
}

module.exports = { create, itemOf, ITEM_KEY, TYPE, TEXT, DETAIL, ROUTE };

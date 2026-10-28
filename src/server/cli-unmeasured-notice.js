'use strict';
/**
 * THE UNMEASURED CLAUDE CLI'S ONE FOR-YOU ITEM (lane pool-silent-members R1, the owner's hub inc-mvsjhna7, 2026-10-28).
 * The box's claude auto-updated to a version scripts/fixtures/oat-in-file.json never measured, and the pool lost every
 * member it reaches only through our long-lived-token file — on 10-27 that was one journal line and six silent members
 * for 17 h. The store now KEEPS those files (login-expiry materializeVerdict holds them) and the pool's verdict names
 * the members; this module says it in the tray: ONE item per unmeasured version (accounts.cliUnmeasuredNotice — the
 * words PURE in src/cli-caps.js cliUnmeasuredItem: the version, how many accounts and which, the two ways out), filed
 * once — an item the owner already resolved is not re-opened, after a restart either — and resolved by itself once the
 * version is measured (or nobody is left out for it). Created by the pool engine (its 60 s tick), like oat-identity;
 * it reads the store and files through the For-you store it is handed — no fs, no spawn, no vendor call.
 */
const ITEM_KEY = 'pool:cli-unmeasured';
const RECHECK_MS = 15 * 60e3; // a version already told is re-read (the roster) only this often

function create({ accounts = () => null, todos: getTodos = () => null, log = (...a) => console.log(...a), now = () => Date.now() } = {}) {
  let toldFor = null, toldAt = 0; // the version this process filed / found told, and when — no roster read in between
  const mine = (x) => !!x && x.sessionKey === ITEM_KEY && typeof x.text === 'string';
  function tick() {
    let acc = null, todos = null;
    try { acc = accounts(); todos = getTodos(); } catch { return null; }
    if (!acc || typeof acc.oatFileCaps !== 'function' || typeof acc.cliUnmeasuredNotice !== 'function' || !todos || typeof todos.add !== 'function') return null;
    const caps = acc.oatFileCaps();
    const v = caps && caps.known && !caps.ok && caps.cli && caps.cli !== 'unparsed' ? caps.cli : null;
    if (v && toldFor === v && now() - toldAt < RECHECK_MS) return null;
    let n = null;
    try { n = v ? acc.cliUnmeasuredNotice() : null; } catch { n = null; }
    let open = [];
    try { open = (todos.forSession([ITEM_KEY]) || []).filter(mine); } catch { open = []; }
    // a version measured since (or nobody left out for it): its item resolves itself
    for (const x of open) if (!n || !x.text.startsWith(n.prefix)) { try { todos.setStatus(x.id, 'done', 'agent'); } catch { } }
    if (!n) { toldFor = null; return null; }
    toldFor = n.cli; toldAt = now();
    let seen = open.some((x) => x.text.startsWith(n.prefix));
    if (!seen) { try { const snap = todos.snapshot(); seen = [...(snap.open || []), ...(snap.resolved || [])].some((x) => mine(x) && x.text.startsWith(n.prefix)); } catch { } }
    if (seen) return null; // once per version: an item the owner already resolved stays resolved
    const it = n.item;
    let id = null;
    try { const r = todos.add(ITEM_KEY, { origin: 'pool', kind: 'notice', urgency: 'high', by: 'agent', sessionName: 'Manage Agents', text: it.text, detail: it.detail, i18n: it.i18n }); id = (r && (r.id || (r.item && r.item.id))) || null; }
    catch (e) { log(`[oat-file] the unmeasured-CLI For-you item was not filed — ${e && e.message}`); }
    log(`[oat-file] claude CLI ${n.cli} is not measured: ${n.members.length} pool member(s) cannot be placed until it is (their token files are kept) — For-you item ${id ? 'filed' : 'NOT filed'}`); // never the item's words (record-clear census)
    return id;
  }
  return { tick };
}

module.exports = { create, ITEM_KEY, RECHECK_MS };

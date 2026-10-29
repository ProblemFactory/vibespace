'use strict';
/**
 * THE UNMEASURED CLAUDE CLI'S ONE FOR-YOU ITEM (lane pool-silent-members R1, the owner's hub inc-mvsjhna7, 2026-10-28).
 * The box's claude auto-updated to a version scripts/fixtures/oat-in-file.json never measured, and the pool lost every
 * member it reaches only through our long-lived-token file — on 10-27 that was one journal line and six silent members
 * for 17 h. The store now KEEPS those files (login-expiry materializeVerdict holds them) and the pool's verdict names
 * the members; this module says it in the tray: ONE item per unmeasured version (accounts.cliUnmeasuredNotice — the
 * words PURE in src/cli-caps.js cliUnmeasuredItem: the version, how many accounts and which, the two ways out).
 * Created by the pool engine (its 60 s tick), like oat-identity; no spawn, no vendor call.
 *
 * ITS LIFECYCLE (acceptance r2 — 9d53db09 closed the item on an unreadable version and re-opened an item the owner had
 * dismissed once it left the For-you snapshot's display tail; its count never moved):
 *   · AN UNREADABLE VERSION IS NOT A VERDICT. `claude --version` timing out (a loaded boot, the binary mid-upgrade) or
 *     answering no number leaves every item exactly as it is — said once in the journal per unreadable spell.
 *   · the item resolves itself ONLY when the version is MEASURED (the fixture names it), when nobody is left out for its
 *     version any more, or when the CLI moved on to another version (that one is a new key).
 *   · THE OWNER'S DISMISSAL IS FINAL for that version: filed once EVER per version — never re-opened, never re-filed,
 *     after any number of other resolutions and any restart. The module keeps its OWN memory for it (`file`, written
 *     atomically: {versions: {v: {filedAt, itemId, count, resolvedBy, resolvedAt}}}), never the snapshot's tail; with no
 *     file (a harness) the store's full ledger (idsWhere) is the restart belt.
 *   · an OPEN item is PATCHED IN PLACE with the current count and names (the store's reshaping door: one save, one
 *     broadcast, the id kept — the live-card rule), never a new filing; one the AGENT resolved (nobody left out) is
 *     re-opened, the same id, when somebody is left out again on the same version.
 *   · the roster (every pool's members' credential files) is read at most once per RECHECK_MS per version, whatever it
 *     found the last time (9d53db09 re-read it every 60 s while nobody was held out); a measured CLI reads nothing.
 */
const fs = require('fs');
const { writeJsonAtomic } = require('../channel-store.js'); // the ONE atomic data/*.json writer
const { cliUnmeasuredPrefix, cliVersionOf } = require('../cli-caps.js'); // PURE: the item's words / the version's one spelling
const ITEM_KEY = 'pool:cli-unmeasured';
const RECHECK_MS = 15 * 60e3; // a version's roster is re-read only this often
const VERSIONS_MAX = 20;      // the memory keeps the newest versions it told

function create({ accounts = () => null, todos: getTodos = () => null, file = null, log = (...a) => console.log(...a), now = () => Date.now() } = {}) {
  let memory = null;            // {versions: {v: {filedAt, itemId, count, resolvedBy, resolvedAt}}} — read once, lazily
  let readFor = null, readAt = 0; // the version whose roster was read last, and when
  let unreadableSaid = false;
  const mine = (x) => !!x && x.sessionKey === ITEM_KEY && typeof x.text === 'string';
  const load = () => {
    if (memory) return memory;
    memory = { versions: {} };
    if (file) {
      try {
        const j = JSON.parse(fs.readFileSync(file, 'utf8'));
        const vs = j && j.versions && typeof j.versions === 'object' && !Array.isArray(j.versions) ? j.versions : {};
        for (const [v, r] of Object.entries(vs)) if (r && typeof r === 'object' && !Array.isArray(r)) memory.versions[v] = r;
      } catch { }
    }
    return memory;
  };
  const save = () => {
    if (!file) return;
    memory.versions = Object.fromEntries(Object.entries(memory.versions).sort((a, b) => (Number(b[1].filedAt) || 0) - (Number(a[1].filedAt) || 0)).slice(0, VERSIONS_MAX));
    try { writeJsonAtomic(file, { versions: memory.versions }); } catch (e) { log(`[oat-file] the unmeasured-CLI item's memory was not written — ${e && e.message}`); }
  };
  const setRec = (v, patch) => { const m = load(); m.versions[v] = { ...(m.versions[v] || {}), ...patch }; save(); return m.versions[v]; };
  const versionOfItem = (id) => { for (const [v, r] of Object.entries(load().versions)) if (r.itemId === id) return v; return null; };
  /** the owner's word on every item this module remembers: a resolution by anyone but the agent (or a cleared item) is FINAL */
  const learnOwner = (todos) => {
    for (const [v, r] of Object.entries(load().versions)) {
      if (!r.itemId || (r.resolvedBy && r.resolvedBy !== 'agent')) continue;
      let it = null;
      try { it = todos.get(r.itemId); } catch { it = null; }
      if (!it) continue;
      if (it.clearedAt || (it.status !== 'open' && it.resolvedBy && it.resolvedBy !== 'agent')) setRec(v, { resolvedBy: it.clearedAt ? 'user' : String(it.resolvedBy), resolvedAt: Number(it.resolvedAt) || now() });
    }
  };
  /** no memory of version v (no file, or the first boot after 9d53db09): the store's FULL ledger — never its display tail */
  const recFromLedger = (todos, v, prefix) => {
    if (typeof todos.idsWhere !== 'function') return null;
    let items = [];
    try { items = todos.idsWhere((i) => mine(i) && i.text.startsWith(prefix)).map((id) => todos.get(id)).filter(Boolean); } catch { items = []; }
    const it = items.sort((a, b) => (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0))[0];
    if (!it) return null;
    const by = it.clearedAt ? 'user' : it.status === 'open' ? null : String(it.resolvedBy || 'user');
    return setRec(v, { filedAt: Number(it.createdAt) || now(), itemId: it.id, resolvedBy: by, resolvedAt: by ? Number(it.resolvedAt) || now() : null });
  };
  const resolveAgent = (todos, x, t) => {
    try { todos.setStatus(x.id, 'done', 'agent'); } catch { return; }
    const v = versionOfItem(x.id);
    if (v) setRec(v, { resolvedBy: 'agent', resolvedAt: t });
  };
  /** the open item's words follow the roster IN PLACE (one save + one broadcast, the id kept) */
  const patch = (todos, id, it) => {
    if (typeof todos.reshapeItems !== 'function') return false;
    try {
      return todos.reshapeItems((x) => {
        if (x.id !== id || x.status !== 'open') return false;
        if (x.text === it.text && x.detail === it.detail && JSON.stringify(x.i18n || null) === JSON.stringify(it.i18n || null)) return false;
        x.text = it.text; x.detail = it.detail; x.i18n = it.i18n;
        delete x.judged; // new words, no old verdict (the store's F2 rule)
        return true;
      }) > 0;
    } catch { return false; }
  };
  function tick() {
    let acc = null, todos = null;
    try { acc = accounts(); todos = getTodos(); } catch { return null; }
    if (!acc || typeof acc.oatFileCaps !== 'function' || typeof acc.cliUnmeasuredNotice !== 'function' || !todos || typeof todos.add !== 'function') return null;
    const caps = acc.oatFileCaps() || {};
    const t = now();
    // AN UNREADABLE VERSION IS NOT A VERDICT (acceptance r2 item 1): nothing resolves, nothing is filed, nothing is read
    if (!caps.ok && (!caps.known || !caps.cli || caps.cli === 'unparsed')) {
      if (!unreadableSaid) { unreadableSaid = true; log('[oat-file] claude CLI version unreadable — the unmeasured-CLI For-you item is left as it is until the version reads again'); }
      return null;
    }
    unreadableSaid = false;
    learnOwner(todos);
    let open = [];
    try { open = (todos.forSession([ITEM_KEY]) || []).filter(mine); } catch { open = []; }
    // MEASURED: every open item resolves itself (and no roster is read)
    if (caps.ok) { for (const x of open) resolveAgent(todos, x, t); readFor = null; return null; }
    const v = cliVersionOf(caps.cli) || String(caps.cli);
    const prefix = cliUnmeasuredPrefix(v);
    for (const x of open) if (!x.text.startsWith(prefix)) resolveAgent(todos, x, t); // the CLI moved on: that version's item is over
    if (readFor === v && t - readAt < RECHECK_MS) return null;
    readFor = v; readAt = t;
    let n = null;
    try { n = acc.cliUnmeasuredNotice(); } catch { n = null; }
    if (n && cliVersionOf(n.cli) !== v) n = null;
    const rec = load().versions[v] || recFromLedger(todos, v, prefix);
    const mineOpen = open.filter((x) => x.text.startsWith(prefix));
    if (!n || !Array.isArray(n.members) || !n.members.length) { for (const x of mineOpen) resolveAgent(todos, x, t); return null; } // nobody left out for it
    if (rec && rec.resolvedBy && rec.resolvedBy !== 'agent') return null; // the owner's word is FINAL for this version
    const count = n.members.length;
    let item = null;
    try { item = rec && rec.itemId ? todos.get(rec.itemId) : null; } catch { item = null; }
    if (!item && mineOpen.length) item = mineOpen[0];
    if (item && item.clearedAt) { setRec(v, { itemId: item.id, resolvedBy: 'user', resolvedAt: t }); return null; }
    if (item) {
      if (item.status !== 'open') {
        if (item.resolvedBy !== 'agent') { setRec(v, { itemId: item.id, resolvedBy: String(item.resolvedBy || 'user'), resolvedAt: Number(item.resolvedAt) || t }); return null; }
        try { todos.setStatus(item.id, 'open', 'agent'); } catch { return null; } // the agent closed it (nobody was left out): the same item again
        log(`[oat-file] claude CLI ${v} is not measured: ${count} pool member(s) cannot be placed again — the For-you item is re-opened`);
      }
      const was = rec && Number.isFinite(rec.count) ? rec.count : null;
      if (patch(todos, item.id, n.item) && was !== count) log(`[oat-file] claude CLI ${v} is not measured: the For-you item now counts ${count} pool member(s) (was ${was == null ? '?' : was})`); // never the item's words (record-clear census)
      setRec(v, { filedAt: (rec && rec.filedAt) || Number(item.createdAt) || t, itemId: item.id, count, resolvedBy: null, resolvedAt: null });
      return null;
    }
    const it = n.item;
    let id = null;
    try { const r = todos.add(ITEM_KEY, { origin: 'pool', kind: 'notice', urgency: 'high', by: 'agent', sessionName: 'Manage Agents', text: it.text, detail: it.detail, i18n: it.i18n }); id = (r && (r.id || (r.item && r.item.id))) || null; }
    catch (e) { log(`[oat-file] the unmeasured-CLI For-you item was not filed — ${e && e.message}`); }
    if (id) setRec(v, { filedAt: t, itemId: id, count, resolvedBy: null, resolvedAt: null });
    log(`[oat-file] claude CLI ${n.cli} is not measured: ${count} pool member(s) cannot be placed until it is (their token files are kept) — For-you item ${id ? 'filed' : 'NOT filed'}`); // never the item's words (record-clear census)
    return id;
  }
  return { tick };
}

module.exports = { create, ITEM_KEY, RECHECK_MS };

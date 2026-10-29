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
 * ITS LIFECYCLE (acceptance r2 + r3 — 9d53db09 closed the item on an unreadable version and re-opened an item the owner
 * had dismissed once it left the For-you snapshot's display tail; b552c972 lost the owner's word in five places):
 *   · AN UNREADABLE VERSION IS NOT A VERDICT. `claude --version` timing out (a loaded boot, the binary mid-upgrade) or
 *     answering no number leaves every item exactly as it is — said once in the journal per unreadable spell.
 *   · the item resolves itself ONLY when the version is MEASURED (the fixture names it), when nobody is left out for its
 *     version any more, or when the CLI moved on to another version (that one is a new key).
 *   · THE ITEM CARRIES ITS FACT (r3): the version it is about is stored ON the item (`cliUnmeasured: '2.1.312'`) — a
 *     cleared item keeps it (Clear content… drops words, never facts) — and the module finds its item by that fact,
 *     never by its text. add() is called only when no item of that version exists and none shares the new words, so
 *     the store's text merge can never re-open an item the owner resolved.
 *   · THE OWNER'S WORD IS LEARNED ON EVERY TICK, whatever the version read (an unreadable spell, a measured CLI): the
 *     memory's `resolvedBy` is the item's LAST transition, in both directions — a dismissal, a Mark-all-read or a
 *     Clear content… (the owner's: FINAL for that version, filed once EVER — never re-opened, never re-filed, after any
 *     number of other resolutions, a restart, the store's 1000-item prune); a hand reopen or the Mark-all-read Undo
 *     (open again by the owner: patched like any open item). The agent's own close never overwrites the owner's word.
 *   · THE MODULE KEEPS ITS OWN MEMORY (`file`, written atomically: {versions: {v: {filedAt, itemId, count, resolvedBy,
 *     resolvedAt, usedAt}}}) for the day the store pruned the item; a missing file is rebuilt from the ledger, a DAMAGED
 *     one (not JSON, empty, truncated, no versions map, a record that is not a record) is said ONCE in the journal and
 *     rebuilt from the ledger BEFORE anything is filed. Bounded to VERSIONS_MAX: the version in use and the key just
 *     written are never evicted, an owner's word outlives an agent's, otherwise the least recently used goes first.
 *   · an OPEN item is PATCHED IN PLACE with the current count and names (the store's reshaping door: one save, one
 *     broadcast, the id kept — the live-card rule), never a new filing; one the AGENT resolved (nobody left out) is
 *     re-opened, the same id, when somebody is left out again on the same version.
 *   · the roster (every pool's members' credential files) is read at most once per RECHECK_MS per version, whatever it
 *     found the last time (9d53db09 re-read it every 60 s while nobody was held out); a measured CLI reads nothing.
 */
const fs = require('fs');
const path = require('path');
const { writeJsonAtomic } = require('../channel-store.js'); // the ONE atomic data/*.json writer
const { cliVersionOf } = require('../cli-caps.js'); // PURE: the version's one spelling
const ITEM_KEY = 'pool:cli-unmeasured';
const FACT = 'cliUnmeasured';  // the version an item is ABOUT, stored on the item itself (r3)
const RECHECK_MS = 15 * 60e3; // a version's roster is re-read only this often
const VERSIONS_MAX = 20;      // the memory keeps this many versions (the one in use always)
const ownerWord = (by) => typeof by === 'string' && by !== '' && by !== 'agent';
/** an item's LAST transition, as the memory keeps it: null = open (nobody resolved it), 'user'… = the owner's word */
const lastWord = (it) => (it.clearedAt ? 'user' : it.status === 'open' ? null : String(it.resolvedBy || 'user'));
const isRec = (r) => !!r && typeof r === 'object' && !Array.isArray(r)
  && (r.itemId == null || typeof r.itemId === 'string') && (r.resolvedBy == null || typeof r.resolvedBy === 'string');

function create({ accounts = () => null, todos: getTodos = () => null, file = null, log = (...a) => console.log(...a), now = () => Date.now() } = {}) {
  let memory = null;            // {versions: {v: rec}} — read once, lazily
  let rebuild = false;          // the file was absent or damaged: rebuilt from the whole ledger on the next learn
  let damaged = false;          // …damaged: the rebuild is written over it at once
  let readFor = null, readAt = 0; // the version whose roster was read last, and when
  let inUse = null;             // the version the CLI is on (never evicted)
  let unreadableSaid = false;
  const ours = (x) => !!x && x.sessionKey === ITEM_KEY && typeof x.text === 'string';
  const load = () => {
    if (memory) return memory;
    memory = { versions: {} };
    rebuild = true;
    if (!file) return memory;
    let raw = null, damage = null;
    try { raw = fs.readFileSync(file, 'utf8'); } catch (e) { if (!e || e.code !== 'ENOENT') damage = `unreadable (${(e && e.code) || 'error'})`; }
    if (raw != null && !damage) {
      let j = null;
      try { j = JSON.parse(raw); } catch { damage = raw.trim() ? 'not JSON (truncated or overwritten)' : 'empty'; }
      if (!damage) {
        const vs = j && typeof j === 'object' && !Array.isArray(j) ? j.versions : undefined;
        if (!vs || typeof vs !== 'object' || Array.isArray(vs)) damage = 'no versions map';
        else {
          for (const [v, r] of Object.entries(vs)) { if (isRec(r)) memory.versions[v] = { ...r }; else damage = 'a record that is not a record'; }
          if (!damage) rebuild = false;
        }
      }
    }
    // A DAMAGED MEMORY IS SAID, ONCE, AND REBUILT FROM THE LEDGER BEFORE ANYTHING IS FILED (r3 (a)): b552c972 read
    // garbage as «no memory», said nothing and overwrote it — and an owner-dismissed item the ledger still held came back
    if (damage) { damaged = true; log(`[oat-file] the unmeasured-CLI item's memory ${path.basename(file)} is damaged — ${damage}; rebuilt from the For-you ledger before anything is filed`); }
    return memory;
  };
  const used = (k) => Number(memory.versions[k].usedAt) || Number(memory.versions[k].filedAt) || 0;
  /** → true when written. The bound never evicts the version in use nor `keep` (the key just written) */
  const save = (keep = null) => {
    const keys = Object.keys(memory.versions);
    if (keys.length > VERSIONS_MAX) {
      const pinned = [inUse, keep].filter((k, i, a) => k && memory.versions[k] && a.indexOf(k) === i);
      const rest = keys.filter((k) => !pinned.includes(k))
        .sort((a, b) => (ownerWord(memory.versions[b].resolvedBy) - ownerWord(memory.versions[a].resolvedBy)) || (used(b) - used(a)));
      const kept = new Set([...pinned, ...rest].slice(0, VERSIONS_MAX));
      for (const k of keys) if (!kept.has(k)) delete memory.versions[k];
    }
    if (!file) return true;
    try { writeJsonAtomic(file, { versions: memory.versions }); return true; } catch (e) { log(`[oat-file] the unmeasured-CLI item's memory was not written — ${e && e.message}`); return false; }
  };
  /** → the stored record (the key just written is never the one evicted) */
  const setRec = (v, patch) => { const m = load(); m.versions[v] = { ...(m.versions[v] || {}), ...patch }; save(v); return m.versions[v]; };
  /** every item of ours in the ledger, by the version it is ABOUT (its fact) — one pass, every tick */
  const byFact = (todos) => {
    const out = new Map();
    let ids = [];
    try { ids = typeof todos.idsWhere === 'function' ? todos.idsWhere((i) => ours(i) && typeof i[FACT] === 'string') : []; } catch { ids = []; }
    for (const id of ids) {
      let it = null; try { it = todos.get(id); } catch { it = null; }
      if (!it) continue;
      const v = it[FACT];
      if (!out.has(v)) out.set(v, []);
      out.get(v).push(it);
    }
    return out;
  };
  /** THE item of version v: the one the memory names when the store still has it, else the ledger's newest by fact */
  const itemOf = (todos, ledger, v) => {
    const r = memory.versions[v];
    let it = null;
    if (r && r.itemId) { try { it = todos.get(r.itemId); } catch { it = null; } }
    if (it && ours(it) && (it[FACT] == null || it[FACT] === v)) return it; // (a fact-less one: filed before r3)
    const all = ledger.get(v) || [];
    return all.slice().sort((a, b) => (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0))[0] || null;
  };
  /** THE OWNER'S WORD, LEARNED EVERY TICK (r3): each remembered version (and the one in use) reads its item's LAST
   *  transition; after a missing / damaged memory every version the ledger holds is learned (the rebuild) */
  const learn = (todos, ledger, v) => {
    const m = load();
    const keys = new Set(Object.keys(m.versions));
    if (v) keys.add(v);
    if (rebuild) for (const k of ledger.keys()) keys.add(k);
    let changed = damaged;
    for (const k of keys) {
      const it = itemOf(todos, ledger, k);
      if (!it) continue; // pruned: the memory keeps the last word it learned
      const r = m.versions[k] || null;
      const by = lastWord(it);
      const at = by ? (Number(it.resolvedAt) || Number(it.clearedAt) || (r && r.resolvedBy === by && r.resolvedAt) || now()) : null;
      if (r && r.itemId === it.id && r.resolvedBy === by && (r.resolvedAt || null) === at) continue;
      m.versions[k] = { filedAt: (r && r.filedAt) || Number(it.createdAt) || now(), count: r && Number.isFinite(r.count) ? r.count : null, ...(r || {}), itemId: it.id, resolvedBy: by, resolvedAt: at };
      changed = true;
    }
    rebuild = false; damaged = false;
    if (changed) save(v);
  };
  const resolveAgent = (todos, x, t) => {
    try { todos.setStatus(x.id, 'done', 'agent'); } catch { return; }
    const v = typeof x[FACT] === 'string' ? x[FACT] : null;
    if (v && memory.versions[v]) setRec(v, { itemId: x.id, resolvedBy: lastWord(x), resolvedAt: t }); // a cleared item stays the owner's word
  };
  /** the open item's words follow the roster IN PLACE (one save + one broadcast, the id kept); its fact rides along */
  const patch = (todos, id, v, it) => {
    if (typeof todos.reshapeItems !== 'function') return false;
    try {
      return todos.reshapeItems((x) => {
        if (x.id !== id) return false;
        let changed = false;
        if (x[FACT] !== v) { x[FACT] = v; changed = true; }
        if (it && x.status === 'open' && !x.clearedAt && (x.text !== it.text || x.detail !== it.detail || JSON.stringify(x.i18n || null) !== JSON.stringify(it.i18n || null))) {
          x.text = it.text; x.detail = it.detail; x.i18n = it.i18n;
          delete x.judged; // new words, no old verdict (the store's F2 rule)
          changed = true;
        }
        return changed;
      }) > 0;
    } catch { return false; }
  };
  function tick() {
    let acc = null, todos = null;
    try { acc = accounts(); todos = getTodos(); } catch { return null; }
    if (!acc || typeof acc.oatFileCaps !== 'function' || typeof acc.cliUnmeasuredNotice !== 'function' || !todos || typeof todos.add !== 'function') return null;
    const caps = acc.oatFileCaps() || {};
    const t = now();
    const unreadable = !caps.ok && (!caps.known || !caps.cli || caps.cli === 'unparsed');
    const v = unreadable || caps.ok ? null : (cliVersionOf(caps.cli) || String(caps.cli));
    const ledger = byFact(todos);
    learn(todos, ledger, v); // whatever the version read — learning is free, only the filing waits (r3 U4)
    // AN UNREADABLE VERSION IS NOT A VERDICT (acceptance r2 item 1): nothing resolves, nothing is filed, nothing is read
    if (unreadable) {
      if (!unreadableSaid) { unreadableSaid = true; log('[oat-file] claude CLI version unreadable — the unmeasured-CLI For-you item is left as it is until the version reads again'); }
      return null;
    }
    unreadableSaid = false;
    const open = [];
    for (const items of ledger.values()) for (const x of items) if (x.status === 'open') open.push(x);
    // MEASURED: every open item resolves itself (and no roster is read)
    if (caps.ok) { for (const x of open) resolveAgent(todos, x, t); readFor = null; return null; }
    for (const x of open) if (x[FACT] !== v) resolveAgent(todos, x, t); // the CLI moved on: that version's item is over
    if (inUse !== v) { inUse = v; if (memory.versions[v]) setRec(v, { usedAt: t }); }
    if (readFor === v && t - readAt < RECHECK_MS) return null;
    readFor = v; readAt = t;
    let n = null;
    try { n = acc.cliUnmeasuredNotice(); } catch { n = null; }
    if (n && cliVersionOf(n.cli) !== v) n = null;
    let item = itemOf(todos, ledger, v);
    if (!n || !Array.isArray(n.members) || !n.members.length) { for (const x of [item, ...(ledger.get(v) || [])]) if (x && x.status === 'open') resolveAgent(todos, x, t); return null; } // nobody left out for it
    const rec = memory.versions[v] || null;
    if (rec && ownerWord(rec.resolvedBy)) return null; // the owner's word is FINAL for this version (learned this tick)
    const count = n.members.length;
    const it = n.item;
    // NEVER A TEXT MERGE ONTO A RESOLVED ITEM (r3 (a)): add() re-opens a same-text item whatever its status — an item
    // with these exact words but no fact (filed before r3) IS this version's item: it is adopted, never merged into
    if (!item) {
      let same = null;
      try { same = todos.idsWhere((i) => ours(i) && i.text === it.text && !i.clearedAt && (i[FACT] == null || i[FACT] === v)).map((id) => todos.get(id)).filter(Boolean)[0] || null; } catch { same = null; }
      if (same) {
        patch(todos, same.id, v, null);
        if (ownerWord(lastWord(same))) { setRec(v, { filedAt: Number(same.createdAt) || t, itemId: same.id, count, resolvedBy: lastWord(same), resolvedAt: Number(same.resolvedAt) || t }); return null; }
        item = same;
      }
    }
    if (item) {
      if (item.status !== 'open') {
        try { todos.setStatus(item.id, 'open', 'agent'); } catch { return null; } // the agent closed it (nobody was left out): the same item again
        log(`[oat-file] claude CLI ${v} is not measured: ${count} pool member(s) cannot be placed again — the For-you item is re-opened`);
      }
      const was = rec && Number.isFinite(rec.count) ? rec.count : null;
      if (patch(todos, item.id, v, it) && was != null && was !== count) log(`[oat-file] claude CLI ${v} is not measured: the For-you item now counts ${count} pool member(s) (was ${was})`); // never the item's words (record-clear census)
      let live = null; try { live = todos.get(item.id); } catch { live = null; }
      const by = live ? lastWord(live) : null; // a word the owner gave INSIDE the patch's own broadcast is kept (r3 (c))
      setRec(v, { filedAt: (rec && rec.filedAt) || Number(item.createdAt) || t, itemId: item.id, count, resolvedBy: by, resolvedAt: by ? (Number(live.resolvedAt) || t) : null });
      return null;
    }
    let id = null;
    try { const r = todos.add(ITEM_KEY, { origin: 'pool', kind: 'notice', urgency: 'high', by: 'agent', sessionName: 'Manage Agents', text: it.text, detail: it.detail, i18n: it.i18n }); id = (r && (r.id || (r.item && r.item.id))) || null; }
    catch (e) { log(`[oat-file] the unmeasured-CLI For-you item was not filed — ${e && e.message}`); }
    if (id) { patch(todos, id, v, null); setRec(v, { filedAt: t, itemId: id, count, resolvedBy: null, resolvedAt: null, usedAt: t }); }
    log(`[oat-file] claude CLI ${n.cli} is not measured: ${count} pool member(s) cannot be placed until it is (their token files are kept) — For-you item ${id ? 'filed' : 'NOT filed'}`); // never the item's words (record-clear census)
    return id;
  }
  return { tick };
}

module.exports = { create, ITEM_KEY, FACT, RECHECK_MS, VERSIONS_MAX };

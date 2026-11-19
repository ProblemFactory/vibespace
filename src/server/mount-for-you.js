'use strict';
/**
 * B-5ce7 — THE MOUNTS' FOR-YOU ITEMS (ORCH): a parked mount with its door, a killed hung daemon, stranded files moved aside.
 * A PARKED MOUNT IS SAID, WITH ITS DOOR. The verdict that parks is src/mount-liveness.js's (`park` — a wedge:
 * the listing hung sweeps in a row while the provider answered each time); the state is src/mounts.js's persisted
 * `m.parked`. The owner's OneDrive (10-23/24) was torn down, reconnected two minutes later and wedged again within 10–30
 * minutes, three times a night, 20+ hub stalls between — a reconnect cannot cure a wedge, so nothing automatic reconnects a
 * parked mount. The person learns it HERE: ONE For-you item per parked mount (origin `server` — «This machine», beside the
 * mount-health notices), naming the mount, the cause and the count, with its door — action `mount-reconnect` (the For-you
 * window's Reconnect: POST /api/mounts/:id/reconnect, declared by its src/foryou-actions.js row). The item resolves itself
 * when the park ends — a Reconnect, any connect by the person, an Unmount, the record removed (src/mounts.js _unpark).
 */
const i18nKey = (s) => s;   // a DECLARED human-visible string (scripts/i18n-extract.mjs): zh + ja beside the mount-health entries
const ITEM_KEY = 'mounts';
const TYPE = 'mount-reconnect';
const TEXT = i18nKey('Storage {name} is kept disconnected: its listing hung {n} times in a row while {provider} answered');
// no provider label known: a WHOLE sentence of its own (translated as one) — never a protocol value or an English filler in a zh / ja one
const TEXT_NOPROV = i18nKey('Storage {name} is kept disconnected: its listing hung {n} times in a row while its provider answered');
const DETAIL = i18nKey('A reconnect usually hangs it again, so VibeSpace does not reconnect it by itself. Anything written into its folder meanwhile stays on this machine and is moved aside at the next connect. Press Reconnect when it should be tried again.');
// the merged B-f230 (the mount's STARTING state too): what the person must KNOW, said once and kept until it is over —
//   KILLED: the mount's own process stopped answering and was stopped to keep VibeSpace responsive (it reconnects by itself;
//           the notice resolves itself at the mount's next answer, a park, an Unmount, the record removed);
//   STRANDED: files written into the bare mount point while the storage was down were moved aside (never deleted) — the
//           person's to look at; dismissed by the person.
const KILLED = i18nKey('Storage {name} stopped answering and was disconnected to keep VibeSpace responsive — it reconnects by itself');
const STRANDED = i18nKey('Files written into {path} while storage {name} was disconnected were moved to {dest} — nothing was deleted');
// B-e40d's remainder — A REPLACED CLIENT IS SAID (B-166e part 2's shape, the rule shared: src/client-swap-step.js). A Drive /
// Gmail mount keeps the OAuth client its token was minted under when another client is put under its preset's key (B-e40d);
// the admin must re-authorize each before deleting the old client. ONE item per preset key, naming every mount still on the
// old client, its door the Re-authorize of the first (action `mount-reauth` — its src/foryou-actions.js row declares the door);
// it follows who is left and resolves itself when none is.
const SWAP_TYPE = 'mount-reauth';
const SWAP = i18nKey('Storage: the preset «{preset}» signs in with another OAuth client now — {n} mount(s) still on the old one; re-authorize each');
const SWAP_L1 = i18nKey('These mounts keep refreshing with the client they signed in with until it is deleted: {names}.');
const SWAP_L2 = i18nKey('Re-authorize opens the first; this item resolves when none is left.');
const { clientSwapStep } = require('../client-swap-step.js');

/** The item's words (PURE): {text, detail, i18n} — the record's own name, the provider's label, the strikes. */
function itemOf(m, info = {}) {
  const provider = String(info.provider || '');
  const key = provider ? TEXT : TEXT_NOPROV;
  const params = { name: String((m && (m.name || m.id)) || ''), n: String(Number(info.strikes) || 2), ...(provider ? { provider } : {}) };
  const fill = (s) => s.replace(/\{(\w+)\}/g, (_, k) => params[k]);
  return { text: fill(key), detail: DETAIL, i18n: { text: { key, params }, detail: [{ key: DETAIL }] } };
}

function create({ getUserTodos, mountCount = () => 0, log = () => { }, onReopen = null }) {
  const todos = () => { try { return getUserTodos(); } catch { return null; } };
  // the key's open cap SIZED BY ITS DOMAIN (the cure): up to three open items per mount (a park, a stopped process, stranded
  // files) — the store's default 20 refused a park item as 'full' past about seven mounts
  const cap = () => { let n = 0; try { n = Number(mountCount()) || 0; } catch { } return Math.max(20, 3 * n); };
  const openOf = (t, id) => (t.forSession([ITEM_KEY]) || []).filter((i) => i && i.action && i.action.type === TYPE && i.action.mountId === id);
  /** File (or re-file: the registry's identity `mountId` merges a repeat) the parked item. */
  function park(m, info) {
    const t = todos();
    if (!t || !m) return null;
    const it = itemOf(m, info);
    // ONE item per mount: the store merges by text unless an itemKey is given (adversarial r1 #18) — a re-park with another
    // strike count or a renamed mount updates the same item
    const r = t.add(ITEM_KEY, { origin: 'server', kind: 'action', urgency: 'high', by: 'agent', sessionName: 'Storage', text: it.text, detail: it.detail, i18n: it.i18n, action: { type: TYPE, mountId: m.id }, itemKey: `park:${m.id}`, openCap: cap() });
    return (r && (r.id || (r.item && r.item.id))) || null;
  }
  /** Resolve every open parked item of the record (its park ended). → how many. */
  function unpark(m, why) {
    const t = todos();
    if (!t || !m) return 0;
    let n = 0;
    for (const i of openOf(t, m.id)) { try { t.setStatus(i.id, 'done', 'mounts'); n++; } catch (e) { log(`[mounts] ${m.id}: the parked item ${i.id} was not resolved: ${e.message}`); } }
    return n;
  }
  const fill = (key, params) => key.replace(/\{(\w+)\}/g, (_, k) => String(params[k]));
  const isSwap = (i) => !!(i && i.i18n && i.i18n.text && i.i18n.text.key === SWAP);
  let reopenHooked = false;
  const fullSaid = new Set();   // keys whose item a FULL tray refused: said once an episode   // a client-swap item, known by its words' key (never by its action's type)
  const memoOf = (x) => (x && typeof x === 'object' && typeof x.to === 'string' && x.to
    ? { to: x.to, named: Array.isArray(x.named) ? x.named.filter((id) => typeof id === 'string') : [], itemId: typeof x.itemId === 'string' && x.itemId ? x.itemId : null, sig: typeof x.sig === 'string' ? x.sig : '' } : null);
  /** The mount's own process was stopped because it stopped answering (the 'dead' teardown) — merged by its text. */
  function killed(m, info = {}) {
    const t = todos();
    if (!t || !m) return null;
    const params = { name: String(m.name || m.id) };
    const r = t.add(ITEM_KEY, { origin: 'server', kind: 'notice', urgency: 'normal', by: 'agent', sessionName: 'Storage', text: fill(KILLED, params), i18n: { text: { key: KILLED, params } }, facts: { mountId: m.id, why: 'killed' }, itemKey: `killed:${m.id}`, openCap: cap() });
    return (r && (r.id || (r.item && r.item.id))) || null;
  }
  /** The mount answers again (or its supervision ended): its killed notice resolves itself. → how many. */
  function answered(m) {
    const t = todos();
    if (!t || !m) return 0;
    let n = 0;
    for (const i of (t.forSession([ITEM_KEY]) || []).filter((x) => x && x.facts && x.facts.mountId === m.id && x.facts.why === 'killed')) { try { t.setStatus(i.id, 'done', 'mounts'); n++; } catch { } }
    return n;
  }
  /** Stranded files moved aside before a mount (src/mounts.js _ensureMountpointDir's quarantine) — the person's to look at. */
  function stranded(m, info = {}) {
    const t = todos();
    if (!t || !m || !info.dest) return null;
    // ONE stranded notice per mount (adversarial r1 #15: each names a new folder, and the key's open items are capped): its
    // itemKey keeps one item, naming the latest folder; the earlier folders stay named in the journal lines of their quarantine
    const params = { path: String(info.path || ''), name: String(m.name || m.id), dest: String(info.dest) };
    const r = t.add(ITEM_KEY, { origin: 'server', kind: 'notice', urgency: 'normal', by: 'agent', sessionName: 'Storage', text: fill(STRANDED, params), i18n: { text: { key: STRANDED, params } }, facts: { mountId: m.id, why: 'stranded' }, itemKey: `stranded:${m.id}`, openCap: cap() });
    return (r && (r.id || (r.item && r.item.id))) || null;
  }
  /** The record is REMOVED: every open item of it resolves (its park, a stopped process, stranded files). → how many. */
  function removed(m) {
    const t = todos();
    if (!t || !m) return 0;
    let n = 0;
    // (a client-swap item names a mount only as its FIRST door: it follows who is left at the check after the removal, never closed here)
    for (const i of (t.forSession([ITEM_KEY]) || []).filter((x) => x && !isSwap(x) && ((x.facts && x.facts.mountId === m.id) || (x.action && x.action.mountId === m.id)))) { try { t.setStatus(i.id, 'done', 'mounts'); n++; } catch { } }
    return n;
  }
  /** THE CLIENT-SWAP NOTICE (src/mounts.js clientSwapCheck hands the facts and the memos — WHAT WAS SAID per preset key — and
   *  keeps the memos this returns). Per key: the rule (clientSwapStep) says file / redraw / close / none (+ supersede an item
   *  of an older client); the item names every mount still on the old client, its door the first (by name). A withdrawn
   *  preset (no client in force) is left as it stands; a key whose last mount left closes its item and drops its memo; an
   *  open swap item no memo holds (re-opened after its memo left) closes again — known by its words' key. → the memos after. */
  function clientSwaps(groups, memos = {}) {
    const t = todos();
    const next = { ...(memos && typeof memos === 'object' ? memos : {}) };
    if (!t) return next;
    // a REOPENED swap item is judged at once (B-166e's verify-r6 W2): the store says a reopen, the check runs — never stale words
    if (!reopenHooked && typeof onReopen === 'function' && typeof t.onStatus === 'function') { reopenHooked = true; t.onStatus((it, { status } = {}) => { if (status === 'open' && isSwap(it)) { try { onReopen(); } catch { } } }); }
    const own = (it) => !!(it && it.sessionKey === ITEM_KEY && isSwap(it));   // only this producer's swap items (a memo naming another item never closes it)
    const isOpen = (id) => { try { const it = id ? t.get(id) : null; return !!(own(it) && it.status === 'open'); } catch { return false; } };
    const close = (id) => { try { const it = id ? t.get(id) : null; if (own(it) && it.status === 'open') t.setStatus(id, 'done', 'mounts'); } catch { } };
    const keys = new Map((groups || []).map((g) => [g.key, g]));
    for (const k of Object.keys(next)) if (!keys.has(k)) { const m0 = memoOf(next[k]); keys.set(k, { key: k, preset: k, to: m0 ? m0.to : '', need: [], only: true }); }
    for (const [k, g] of keys) {
      // the preset WITHDRAWN: no client to re-authorize under — an open item's door could not do what it says, so it closes and
      // its memo goes (each mount keeps its minted client; the hub's log names it «is gone»); a later client is a new episode
      if (!g.to) { const m0 = memoOf(next[k]); if (m0 && m0.itemId) close(m0.itemId); if (k in next) delete next[k]; fullSaid.delete(k); continue; }
      try {
        const m = memoOf(next[k]);
        const need = [...(g.need || [])].sort((a, b) => String(a.name).localeCompare(String(b.name)) || (a.id < b.id ? -1 : 1));
        const step = clientSwapStep(m ? { to: m.to, named: m.named, open: isOpen(m.itemId) } : null, g.to, need.map((r) => r.id));
        let itemId = step.supersede || !m || m.to !== g.to ? null : m.itemId, sig = m && m.to === g.to ? m.sig : '';
        if (step.act === 'file' || step.act === 'redraw') {
          const params = { preset: String(g.preset || k || 'default'), n: need.length }, names = need.map((r) => r.name).join(', ');
          const text = fill(SWAP, params), detail = `${fill(SWAP_L1, { names })}\n${SWAP_L2}`;
          const i18n = { text: { key: SWAP, params }, detail: [{ key: SWAP_L1, params: { names } }, { key: SWAP_L2, params: {} }] };
          const action = { type: SWAP_TYPE, mountId: need[0].id };
          const want = JSON.stringify([text, detail, action.mountId]);
          if (step.act === 'file') {
            const r = t.add(ITEM_KEY, { origin: 'server', kind: 'action', urgency: 'normal', by: 'agent', sessionName: 'Storage', text, detail, i18n, action, itemKey: `client-swap:${k}`, openCap: cap() });
            itemId = (r && (r.id || (r.item && r.item.id))) || null; sig = want; fullSaid.delete(k);
            log(`[mounts] the preset «${params.preset}» names another OAuth client — ${params.n} mount(s) to re-authorize, said`);
          } else if (want !== sig && itemId && typeof t.redrawItem === 'function') {
            const r = t.redrawItem((x) => x.id === itemId, { text, detail, i18n, action });
            if (r && r.ok) sig = want;
          }
        }
        if (step.act !== 'file') fullSaid.delete(k);   // nothing to file now: a later full tray is a new episode
        if (step.act === 'file' && !itemId) continue;   // nothing filed: nobody named, the memo stands — the next check says it
        if (!m && step.act === 'none' && !step.memo.named.length) continue;   // nothing said, nothing to remember (no memo per quiet key)
        if (step.supersede && m && m.itemId && m.itemId !== itemId) close(m.itemId);
        if (step.act === 'close') close(itemId);
        if (g.only && !step.memo.open) { delete next[k]; continue; }
        next[k] = { to: step.memo.to, named: step.memo.named, itemId, sig };
      } catch (e) {
        if (e && e.code === 'full') { if (!fullSaid.has(k)) { fullSaid.add(k); log(`[mounts] the For-you tray is full — the client-swap item of the preset «${k || 'default'}» waits (said once, until it is filed or nothing is owed)`); } }
        else log(`[mounts] the client-swap notice of the preset «${k || 'default'}» could not be kept: ${(e && (e.code || e.message)) || e}`);
      }
    }
    try {
      const held = new Set(Object.values(next).map((x) => x && x.itemId).filter(Boolean));
      for (const id of (typeof t.idsWhere === 'function' ? t.idsWhere((i) => i && i.status === 'open' && i.sessionKey === ITEM_KEY && !held.has(i.id) && isSwap(i)) : [])) close(id);
    } catch { }
    return next;
  }
  return { park, unpark, killed, answered, stranded, removed, clientSwaps };
}

module.exports = { create, itemOf, ITEM_KEY, TYPE, TEXT, TEXT_NOPROV, DETAIL, KILLED, STRANDED, SWAP_TYPE, SWAP, SWAP_L1, SWAP_L2 };

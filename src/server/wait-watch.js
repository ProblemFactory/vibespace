'use strict';
// THE WAIT WATCH (lane queued-is-not-woke laws 2 + 3, SHAPE C — 主开发's rulings 2026-11-13 13:35Z / 13:42Z; row B-580f).
//
// THE HUB JUDGES A WAIT ONLY FOR A CONVERSATION IN A RUNNING TURN, and asks «not yet handed» of its own record at that moment
// (groups-engine readWaiting: each group's log, off the loop, and the member's marks through the next report's reach, plus
// the frames held behind its turn — read only where a mark or a held frame's start is older than an hour with records after
// it). An idle conversation's unread quiet mail waits by design and is nobody's alarm. NOTHING IS KEPT for it; what is
// remembered is only what a person or a sender was SHOWN:
//  · THE SENDER (its own oldest message not handed for SENDER_MS, 1 h): ONE entry per sender in the ladder's keyed slot
//    ('waiting'), naming every such member — replaced in place, never counted against the stash's cap (so it never evicts),
//    rendered whole, and filed again ONLY when the set of members changes (the slot remembers the set it last handed, in
//    the stash file) — never the same set twice. A sender whose set empties: its standing entry leaves.
//  · THE OWNER (the conversation's oldest not handed for OWNER_MS, 4 h): ONE For-you item for that conversation and that
//    turn — itemKey `messages-waiting:<cid>:<the turn's opening, or the instant this process first saw the turn run>`. At a
//    conversation's first sight in this process, the newest item a restart left (open, or a person's ✕) is adopted as this
//    turn's: two turns across a restart read as one. Its only door opens the conversation. A person's ✕ stands for that key
//    (that turn). It ends in two words: «the turn ended» (the turn is no longer running — or the conversation left) and
//    «they were handed to it» (a reading finds nothing waiting four hours). An Undo of a ✕ is drawn again at the next sweep
//    (the item's own words are compared, never a memory of them).
// A sweep every TICK_MS (5 min). A reading not taken (a throw) says nothing and ends nothing. No billed turn.
const WW = require('../wait-words.js');
const OF = require('./owner-facts.js');   // THE one formatter for a time an agent reads (B-7960): the owner's zone, named
const G = require('../channel-groups.js');
const { chipAsksOf } = require('../helper-ask.js');
const { turnOf } = require('./turn-facts.js');
const { toAgentText: agentText } = require('../peer-text.js');   // a conversation's name on its way to an agent (the peer-text census)

const ITEM_KEY = 'messages-waiting:';   // the producer's identity (user-todos' ONE identity — the registry row is the type's home)
const OWN_ENDS = ['handed', 'turn-ended'];   // the ends THIS producer writes (anything else that closed an item was a person)
const SLOT = 'waiting';                 // the ladder's keyed slot for the sender's one entry

function create({ activeSessions, getDeliver = () => null, getGroups = () => null, getUserTodos = () => null, sessionKeyOf = null,
  now = () => Date.now(), log = console, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  const turnKeyOf = new Map();   // cid → this turn's item key (cleared when the turn is seen not running)
  const seen = new Set();        // the conversations this process has seen run (a first sight adopts what a restart left)
  let timer = null, sweeping = false;
  const say = (line) => { try { (log.log || log.info || (() => { })).call(log, line); } catch { } };
  const cidOf = (s) => (s && (s.claudeSessionId || s.backendSessionId)) || null;
  const inTurn = (s) => { const t = turnOf(s); return t === 'running' || t === 'waiting'; };
  const openedSaid = (s) => (Number(s && s._turnOpenSaidAt) > 0 ? Number(s._turnOpenSaidAt) : null);   // the record's own opening (law D); claude has none
  // a conversation's NAME is a peer's text: ONE clipped line, the same for the owner's item and the sender's entry (15:30Z item 6)
  const nameOf = (s, id) => agentText(String((s && s.name) || id), { max: 80, kind: 'line' });
  const keyOfItem = (i) => String((i && i.itemKey) || '');
  /** this turn's key: at a conversation's FIRST sight in this process, the newest OPEN item a restart left for it is this turn's
   *  (主开发 15:30Z item 4: a closed one — a ✕ — belongs to an earlier wait, never this one); else the turn's opening as its
   *  record states it, or this instant */
  function turnKey(cid, s, t, items) {
    if (turnKeyOf.has(cid)) return turnKeyOf.get(cid);
    let k = null;
    if (!seen.has(cid)) {
      const left = items.filter((i) => keyOfItem(i).startsWith(ITEM_KEY + cid + ':') && i.status === 'open')
        .sort((a, b) => (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0))[0];
      if (left) k = left.itemKey;
    }
    seen.add(cid);
    if (!k) k = ITEM_KEY + cid + ':' + (openedSaid(s) || t);
    turnKeyOf.set(cid, k);
    return k;
  }
  function end(it, why) { try { getUserTodos().setStatus(it.id, 'done', why); } catch (e) { say(`[wait-watch] ${it.id}: not ended — ${e && e.message}`); } }
  function show(cid, s, id, key, it, words) {
    const ut = getUserTodos();
    if (it && it.status === 'open') {   // drawn again only when its own words differ (an Undo of a ✕ reopens old words: drawn)
      if (JSON.stringify(it.i18n || null) === JSON.stringify(words.i18n)) return;
      try { ut.redrawItem((x) => x.id === it.id, { text: words.text, detail: words.detail, i18n: words.i18n }); } catch { }
      return;
    }
    if (it && !OWN_ENDS.includes(String(it.resolvedBy || ''))) return;   // a person's ✕ stands for this turn
    const sk = sessionKeyOf ? sessionKeyOf(s, id) : id;
    if (!ut || !sk) return;
    try {
      ut.add(sk, {
        origin: 'agent', by: 'agent', urgency: 'high', kind: 'action', sessionName: s.name || null,
        text: words.text, detail: words.detail, i18n: words.i18n, itemKey: key,   // ONE item per conversation and turn (a re-file of an item this producer ended reopens it)
        action: { type: 'messages-waiting', sessionId: String(id), cid: String(cid) },
      });
      say(`[wait-watch] ${s.name || id}: a group message has not been handed for ${Math.round(WW.OWNER_MS / 3600e3)} h — one For-you item`);
    } catch (e) { say(`[wait-watch] ${s.name || id}: the For-you item was not filed — ${e && e.message}`); }
  }
  /** ONE sweep. → {looked, reads, senders} (for the suites) */
  async function sweep() {
    if (sweeping) return null;
    sweeping = true;
    try {
      const groups = getGroups();
      if (!groups || typeof groups.readWaiting !== 'function') return { looked: 0, reads: 0, senders: 0 };
      const t = now();
      const ut = getUserTodos();
      let items = [];
      try { const sn = ut && ut.snapshot ? ut.snapshot() : null; items = sn ? [...(sn.open || []), ...(sn.resolved || [])].filter((i) => keyOfItem(i).startsWith(ITEM_KEY)) : []; } catch { items = []; }
      const byKey = new Map(items.map((i) => [i.itemKey, i]));
      const running = new Map();
      for (const [id, s] of activeSessions || []) { const cid = cidOf(s); if (cid && inTurn(s)) running.set(cid, [id, s]); }
      const bySender = new Map();   // sender → [{cid, name, n, oldest, openedAt, card}]
      let looked = 0, reads = 0, failed = false;
      for (const [cid, [id, s]] of running) {
        let r;
        try { r = await groups.readWaiting(cid, { now: t, olderThan: WW.SENDER_MS }); } catch (e) { failed = true; say(`[wait-watch] ${s.name || id}: the reading failed — ${e && e.message} (nothing said or ended)`); continue; }
        looked++; reads += r.reads;
        const card = chipAsksOf(s).length > 0;
        const key = turnKey(cid, s, t, items);
        const it = byKey.get(key) || null;
        const oldest = r.groups.length ? Math.min(...r.groups.map((g) => g.oldest)) : null;
        if (oldest != null && oldest <= t - WW.OWNER_MS) {
          const n = r.groups.some((g) => g.n == null) ? null : r.groups.reduce((a, g) => a + g.n, 0);
          show(cid, s, id, key, it, WW.ownerWords({ name: nameOf(s, id), n, since: oldest, openedAt: openedSaid(s), card }));
        } else if (it && it.status === 'open') end(it, 'handed');   // nothing has waited four hours now
        for (const g of r.groups) for (const [sender, x] of Object.entries(g.senders || {})) {
          if (!G.isCid(sender) || !(x.oldest <= t - WW.SENDER_MS)) continue;   // an agent sender, its own message an hour old
          const list = bySender.get(sender) || (bySender.set(sender, []), bySender.get(sender));
          let e = list.find((y) => y.cid === cid);
          if (!e) { e = { cid, name: nameOf(s, id), n: 0, oldest: x.oldest, openedAt: openedSaid(s), card }; list.push(e); }
          e.n = e.n == null || x.n == null ? null : e.n + x.n;
          e.oldest = Math.min(e.oldest, x.oldest);
        }
      }
      // THE TURN ENDED (or the conversation left): its open item ends in those words — this turn's, or one a restart left
      for (const it of items) {
        if (it.status !== 'open') continue;
        const cid = String((it.action && it.action.cid) || '');
        if (cid && !running.has(cid)) end(it, 'turn-ended');
      }
      for (const cid of [...turnKeyOf.keys()]) if (!running.has(cid)) turnKeyOf.delete(cid);
      // THE SENDERS: one keyed slot each, filed again only when its set of members changes. A set that EMPTIED: its entry leaves
      // and the set it handed is forgotten ({X} → {} → {X} is a leave and a join — 15:30Z item 2). A sweep in which any
      // reading failed touches no slot at all: a reading not taken says nothing and ends nothing (item 3)
      const d = getDeliver();
      let senders = 0;
      if (d && typeof d.stashSlot === 'function' && !failed) {
        for (const [sender, list] of bySender) {
          if (typeof groups.endedOf === 'function' && groups.endedOf(sender)) continue;
          list.sort((a, b) => a.oldest - b.oldest);
          const text = WW.senderEntry(list.map((e) => ({ name: e.name, n: e.n, oldestText: OF.when(e.oldest), openedText: e.openedAt ? OF.when(e.openedAt) : null, card: e.card })));
          try { if (d.stashSlot(sender, SLOT, { source: 'agent', fromName: 'VibeSpace', text }, { set: list.map((e) => e.cid) }).filed) senders++; } catch (e) { say(`[wait-watch] the waiting entry for ${sender} was not stored — ${e && e.message}`); }
          await new Promise((r) => setImmediate(r));   // one sender at a time: its times through owner-facts.when are a slice each (the 20 ms law)
        }
        for (const sender of typeof d.slotHolders === 'function' ? d.slotHolders(SLOT) : []) if (!bySender.has(sender)) { try { d.stashSlot(sender, SLOT, null, { forget: true }); } catch { } }
      }
      return { looked, reads, senders, failed };
    } finally { sweeping = false; }
  }
  function start() { if (timer) return; const tick = () => { sweep().catch((e) => say('[wait-watch] sweep failed: ' + (e && e.message))).finally(() => { timer = setTimer(tick, WW.TICK_MS); if (timer && timer.unref) timer.unref(); }); }; timer = setTimer(tick, WW.TICK_MS); if (timer && timer.unref) timer.unref(); }
  function stop() { if (timer) { clearTimer(timer); timer = null; } }
  return { sweep, start, stop };
}

function install(deps) { const w = create(deps); w.start(); return w; }

module.exports = { create, install, ITEM_KEY, OWN_ENDS, SLOT };

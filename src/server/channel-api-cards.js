'use strict';
/**
 * A RAW-API PROPOSAL REACHES THE USER WHERE THEY LOOK (B-2198 part 2, docs/design-channel-raw-api.md §7).
 *
 * ORCH beside src/server/channel-api.js (whose exports it builds on, never its state): ONE record per proposal
 * (`records()` = the orchestrator's owner view + the frozen headers / body sha256 / tier / shape) drawn as ONE card
 * in the agent's chat (at its call row), in the Outbox (one row per proposal) and as ONE For-you item (origin
 * `channels`, Approve / Reject). `sync()` — on every `channel-api-updated` and once a minute — keeps the three
 * together: a pending proposal files its item; a decided one answers it with the outcome (PURE src/channel-api-card.js
 * words) and hands the drafting conversation its receipt on its next turn (the outbox receipts' ladder: delivered
 * without a wake, else stashed); a pending one past 24 h is EXPIRED, one whose account was removed or whose tier was
 * withdrawn is WITHDRAWN by name — both through the orchestrator's own reject (nothing ran, the audit line says who).
 * lane inline-receipts-compose-api: a decided proposal whose CLI is WAITING on it (`api … --wait` / `api wait <id>`, each
 * poll a `collect`) is read INLINE — the outbox's receiptRoad says so, and the receipt message is never filed; a CLI that
 * stops polling before the decision leaves it to the message road (the one-shot fallback after the window).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const C = require('../channel-api-card.js');
const F = require('../channel-api.js');
const W = require('../api-call-words.js');
const P = require('../channel-policy.js');   // receiptRoad + COLLECT_WINDOW_MS — the outbox's one verdict on a receipt's road

const INBOX_KEY = 'channels';          // the channels engine's For-you key (src/server/channels-engine.js INBOX_KEY)
const SWEEP_EVERY_MS = 60 * 1000;

function create({ dataDir, api, userTodos = null, deliver = null, names = null, now = () => Date.now(), log = console, timer = true, collectWindowMs = P.COLLECT_WINDOW_MS, grantsUnread = () => false, writer = null } = {}) {
  if (!dataDir) throw new Error('channel-api-cards: dataDir is required');
  const A = () => (typeof api === 'function' ? api() : api);
  const dir = path.join(dataDir, 'channels');
  const stateFile = path.join(dir, 'api-cards.json');
  const frozenFile = path.join(dir, 'api-proposals.json');   // the orchestrator's own file — READ only, for the frozen headers + body
  const state = (() => { try { const j = JSON.parse(fs.readFileSync(stateFile, 'utf8')); return { items: j.items || {} }; } catch { return { items: {} }; } })();
  // B-574d slice «channels-small-stores» (lane nl-journals, 主开发 r4939): THE STORE WRITER (src/store-writer.js — its own thread does
  // the temp, the write, the SYNC and the rename, off the hub's loop). Every save here is a SWEEP's (the minute timer, an API change), the
  // receipts' clearer or an agent CLI's inline read — never a person's press: the bytes made AT the write (the newest state, a burst one
  // write); a write that fails is the writer's (said by it, kept owed, written again). Nothing is handed when nothing changed (the
  // callers' own `dirty` / `n`). A suite may hand its own writer (`writer`).
  const SW = () => writer || require('../store-writer.js').storeWriter();
  function save() { try { SW().dirty(stateFile, { name: 'channel-api-cards.write', makeDir: true, produce: () => JSON.stringify(state) }); } catch (e) { log.warn('[channel-api-cards] the state write was not handed to the store writer:', e && e.message); } }
  // B-574d (r4939): the orchestrator's file through THE STORE WRITER — its newest bytes may still be owed: the writer's owed bytes first, then the file
  const frozenOf = () => { try { const w = SW(), owed = w && typeof w.owed === 'function' ? w.owed(frozenFile) : null; return JSON.parse(owed != null ? owed : fs.readFileSync(frozenFile, 'utf8')).proposals || {}; } catch { return {}; } };
  const ctxOf = (p) => ({ kind: p.principal.kind, id: p.principal.id, name: p.principal.name, groups: p.principal.groups || [], inheritedGroups: p.principal.inheritedGroups === null ? null : (p.principal.inheritedGroups || []), ...(p.principal.groupsUnreadable === true ? { groupsUnreadable: true } : {}), ...require('./groups-hold.js').fact() });   // a RECORDED principal carries the hold too (主开发 05:42Z (3)); today's one reader (liveness) returns before it while held, so the spread is inert there — kept so every principal built here hands the fact (the census reads it per site)
  /** The call's chat NAMED from what the channel store knows (card grammar ②) — and the conversation it opens; else nothing (the card shows the id chip). */
  const objectOf = (p) => {
    const o = W.wordsOf(p).object;
    if (!o || o.kind !== 'chat' || !o.id || typeof names !== 'function') return {};
    let n = null;
    try { n = names(p.cred, o.id); } catch {}
    return n ? { objectName: String(n), objectConv: { adapterId: p.cred, convId: o.id } } : {};
  };

  /** THE RECORDS — one per proposal the owner view holds (newest first); every surface draws from these. */
  function records() {
    const a = A();
    if (!a || typeof a.ownerView !== 'function') return [];
    const v = a.ownerView(), fz = frozenOf();
    return (v.proposals || []).map((p) => {
      const f = fz[p.id] && fz[p.id].frozen;
      const cred = (v.creds || []).find((c) => c.id === p.cred);
      const g = cred && p.principal ? (cred.grants || []).find((x) => x.principal && x.principal.id === p.principal.id) : null;
      return {
        ...p, headers: f ? f.headers || {} : {}, bodySha: f && f.body ? crypto.createHash('sha256').update(Buffer.from(f.body, 'base64')).digest('hex') : null,
        tier: g ? g.tier : null, shape: p.offersAlways ? F.shapeOf({ method: p.method, host: p.host, path: p.path }) : null,
        todoId: (state.items[p.id] || {}).todoId || null, receipt: (state.items[p.id] || {}).receipt || null, ...objectOf(p),
      };
    });
  }
  /** null while the proposal's principal still holds API access to a live credential; else the reason it ended. */
  function liveness(a, credIds, mountsHeld = false) {
    return (p) => {
      // B-f276 family unit 2 (the census's MS1): a mount's lent client is UNKNOWN while mounts.json is held — never «removed»
      if (!credIds.has(p.cred)) return mountsHeld && String(p.cred || '').startsWith('mount:') ? null : 'the account was removed';
      let mine = null;
      if (require('./groups-hold.js').held() || (p.principal && p.principal.groupsUnreadable === true)) return null;   // Task Groups held unread, or the card filed while they were: its tier is unknown — a card never ENDS on it («withdrawn» would be false)
      { let gu = true; try { gu = grantsUnread() === true; } catch { gu = true; } if (gu) return null; }   // r3059 wall: the grants unread — the tier is unknown, a card never ENDS on it («withdrawn» would be false)
      try { mine = a.creds(ctxOf(p)); } catch { return null; }   // an unreadable tier decides nothing
      return mine && mine.ok && !(mine.creds || []).some((c) => c.id === p.cred) ? 'API access to this account was withdrawn' : null;
    };
  }
  async function receiptFor(p, st) {
    const text = C.receiptText(p);
    if (!text || !p.conv || !deliver) return;
    let r = null;
    if (typeof deliver.deliverToConversation === 'function') {
      try { r = await deliver.deliverToConversation(p.conv, text, { kind: 'notification', noWake: true, spendReason: 'channel-receipt', fromName: 'Channels · API' }); } catch (e) { r = { ok: false, reason: (e && e.message) || String(e) }; }
    }
    if (!(r && r.ok) && typeof deliver.stashFor === 'function') {
      try { const st0 = deliver.stashFor(p.conv, { source: 'channel-receipt', kind: 'notification', fromName: 'Channels · API', text, ref: p.id }); r = { ok: true, stashed: true, ...(st0 && st0.stored === false && st0.taken ? { notOnDisk: true } : {}) }; if (r.notOnDisk) log.warn(`[channel-api-cards] ${p.id}: the receipt ${st0.why}`); }   // r3919 (the class): TAKEN while the list is unread — the record carries the mark, as the Outbox's receipt does
      catch (e) { r = { ok: false, reason: (e && e.message) || String(e) }; }
    }
    st.receipt = { at: now(), how: r && r.ok ? (r.stashed ? 'stashed' : 'delivered') : 'undelivered', fate: C.fateOf(p), ...(r && r.notOnDisk ? { notOnDisk: true } : {}) };
  }
  // r4023 (small): AN API receipt's mark has NO END after a restart that lost its entry (no «lost» like the Outbox's): nothing draws this
  // record's receipt today (no page, no CLI) — named here, not built; the day a drawer reads it, it gets the Outbox's end
  // r3919 / r3988 (A) ONE CLEARER: a receipt's mark leaves only on the stash's own word that its entry is IN THE FILE (stashOnDisk: a write
  // that LANDED holding it) — asked when the list reads again and when a write lands after none did; a lift whose write failed clears nothing
  const clearMarks = () => { try {
    if (!deliver || typeof deliver.stashOnDisk !== 'function') return;
    const marked = Object.entries(state.items).filter(([, st]) => st && st.receipt && st.receipt.notOnDisk);
    if (!marked.length) return;
    const byId = new Map(records().map((r) => [r.id, r]));   // ONE read of the records (never one a receipt)
    let n = 0;
    for (const [id, st] of marked) { const p = byId.get(id); if (p && p.conv && deliver.stashOnDisk(p.conv, id)) { delete st.receipt.notOnDisk; n++; } }
    if (n) save();
  } catch (e) { log.warn(`[channel-api-cards] the receipts' marks: ${(e && e.message) || e}`); } };
  try { if (deliver && typeof deliver.onStashLift === 'function') deliver.onStashLift(clearMarks); } catch { }
  try { if (deliver && typeof deliver.onStashLanded === 'function') deliver.onStashLanded(clearMarks); } catch { }

  // ── lane inline-receipts-compose-api: THE CLI READS IT INLINE (the owner: a command that performs an action answers
  // with its outcome; a message carries only what the actor could not learn from its own command) ──────────────────
  const waiting = new Map();   // proposal id → until when a CLI waits on it (each `collect` poll renews it)
  const fallbacks = new Map();   // proposal id → the one-shot sync that hands a held receipt to the message road
  /** A decided proposal's receipt is HELD while its CLI waits (receiptRoad `collecting` ⇒ inline); the fallback re-asks
   *  once the window would end — a CLI that stopped polling leaves it to the message road. */
  function heldInline(p) {
    const until = waiting.get(p.id) || 0;
    if (P.receiptRoad({ draftedBy: p.principal, kind: 'api' }, { collecting: until > now() }).road !== 'inline') return false;
    if (!fallbacks.has(p.id)) {
      const t = setTimeout(() => { fallbacks.delete(p.id); sync(); }, Math.max(0, until - now()) + 50);
      if (t.unref) t.unref();
      fallbacks.set(p.id, t);
    }
    return true;
  }
  /** THE COLLECT DOOR (GET /api/agent/channels/api/proposals/:id?collect=1 — the route asked the orchestrator first that
   *  the proposal is the caller's own): pending ⇒ the CLI waits (the hold renews); decided ⇒ read inline now, the card's
   *  words with it (`messaged` = the message road took it already). Serialized behind the sync. */
  function collect(id) {
    const r = chain.then(() => {
      const k = String(id || '');
      const p = records().find((x) => x.id === k);
      if (!p) return {};
      if (p.status === 'pending' || p.status === 'running') { waiting.set(k, now() + collectWindowMs); return { collecting: true }; }
      const st = state.items[k] || (state.items[k] = { at: p.at });
      const how = st.receipt ? st.receipt.how : null;
      if (!how) { st.receipt = { at: now(), how: 'inline', fate: C.fateOf(p) }; save(); }
      waiting.delete(k);
      const t = fallbacks.get(k); if (t) { clearTimeout(t); fallbacks.delete(k); }
      return { collected: !how || how === 'inline', messaged: how === 'delivered' || how === 'stashed', receiptText: C.receiptText(p, { inline: true }) };
    });
    chain = r.catch(() => {});
    return r;
  }

  let stopped = false, chain = Promise.resolve();
  async function doSync() {
    const a = A();
    if (stopped || !a || typeof a.ownerView !== 'function') return;
    if (typeof a.isHeldUnread === 'function' && a.isHeldUnread()) return;   // r3005: the proposals are UNREAD — the cards file, close and drop nothing until they read
    let recs = records();
    const view = a.ownerView() || {}, credIds = new Set((view.creds || []).map((c) => c.id));
    const ends = C.sweepVerdicts(recs, { now: now(), live: liveness(a, credIds, !!view.mountsHeld) });
    for (const v of ends) { try { a.reject(v.id, { by: v.by, reason: v.reason }); } catch (e) { log.warn(`[channel-api-cards] ${v.id} was not ${v.by}: ${(e && e.message) || e}`); } }
    if (ends.length) recs = records();
    let dirty = ends.length > 0;
    for (const p of recs) {
      const st = state.items[p.id] || (state.items[p.id] = { at: p.at });
      if (p.status === 'pending') {
        if (st.todoId || !userTodos || typeof userTodos.add !== 'function') continue;
        try { const it = userTodos.add(INBOX_KEY, { ...C.forYouOf(p), origin: 'channels' }); st.todoId = (it && it.id) || null; dirty = true; }
        catch (e) { log.warn(`[channel-api-cards] ${p.id}: the For-you item was not filed (${(e && e.message) || e}) — the chat and the Outbox still show it`); }
        continue;
      }
      if (p.status === 'running') continue;
      if (st.todoId && !st.answered && userTodos && typeof userTodos.resolveAnswered === 'function') {
        try { userTodos.resolveAnswered([st.todoId], 'channel-api', C.resolvedFactOf(p)); } catch {}
        st.answered = true; dirty = true;
      }
      if (!st.receipt && now() - (p.decidedAt || p.at || 0) < C.TTL_MS && heldInline(p)) continue;   // its CLI is reading it inline
      if (!st.receipt && now() - (p.decidedAt || p.at || 0) < C.TTL_MS) { await receiptFor(p, st); dirty = true; }
      else if (!st.receipt) { st.receipt = { at: now(), how: 'too-old', fate: C.fateOf(p) }; dirty = true; }
    }
    const held = new Set(recs.map((p) => p.id));
    for (const id of Object.keys(state.items)) if (!held.has(id)) { delete state.items[id]; dirty = true; }
    if (dirty) save();
  }
  /** Serialized: a sweep's own reject broadcasts again, which queues one more pass behind this one. */
  function sync() { chain = chain.then(doSync).catch((e) => log.warn(`[channel-api-cards] sync failed: ${(e && e.message) || e}`)); return chain; }
  const onUpdate = (msg) => { if (msg && msg.type === 'channel-api-updated') sync(); };
  const tick = timer ? setInterval(sync, SWEEP_EVERY_MS) : null;
  if (tick && tick.unref) tick.unref();
  if (timer) setTimeout(sync, 0);
  return { records, sync, onUpdate, collect, stop: () => { stopped = true; if (tick) clearInterval(tick); for (const t of fallbacks.values()) clearTimeout(t); fallbacks.clear(); } };
}

module.exports = { create, INBOX_KEY };

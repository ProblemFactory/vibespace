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
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const C = require('../channel-api-card.js');
const F = require('../channel-api.js');

const INBOX_KEY = 'channels';          // the channels engine's For-you key (src/server/channels-engine.js INBOX_KEY)
const SWEEP_EVERY_MS = 60 * 1000;

function create({ dataDir, api, userTodos = null, deliver = null, now = () => Date.now(), log = console, timer = true } = {}) {
  if (!dataDir) throw new Error('channel-api-cards: dataDir is required');
  const A = () => (typeof api === 'function' ? api() : api);
  const dir = path.join(dataDir, 'channels');
  const stateFile = path.join(dir, 'api-cards.json');
  const frozenFile = path.join(dir, 'api-proposals.json');   // the orchestrator's own file — READ only, for the frozen headers + body
  const state = (() => { try { const j = JSON.parse(fs.readFileSync(stateFile, 'utf8')); return { items: j.items || {} }; } catch { return { items: {} }; } })();
  const save = () => { try { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(stateFile + '.tmp', JSON.stringify(state)); fs.renameSync(stateFile + '.tmp', stateFile); } catch (e) { log.warn('[channel-api-cards] state write failed:', e && e.message); } };
  const frozenOf = () => { try { return JSON.parse(fs.readFileSync(frozenFile, 'utf8')).proposals || {}; } catch { return {}; } };
  const ctxOf = (p) => ({ kind: p.principal.kind, id: p.principal.id, name: p.principal.name, groups: p.principal.groups || [] });

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
        todoId: (state.items[p.id] || {}).todoId || null, receipt: (state.items[p.id] || {}).receipt || null,
      };
    });
  }
  /** null while the proposal's principal still holds API access to a live credential; else the reason it ended. */
  function liveness(a, credIds) {
    return (p) => {
      if (!credIds.has(p.cred)) return 'the account was removed';
      let mine = null;
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
      try { deliver.stashFor(p.conv, { source: 'channel-receipt', kind: 'notification', fromName: 'Channels · API', text, ref: p.id }); r = { ok: true, stashed: true }; }
      catch (e) { r = { ok: false, reason: (e && e.message) || String(e) }; }
    }
    st.receipt = { at: now(), how: r && r.ok ? (r.stashed ? 'stashed' : 'delivered') : 'undelivered', fate: C.fateOf(p) };
  }

  let stopped = false, chain = Promise.resolve();
  async function doSync() {
    const a = A();
    if (stopped || !a || typeof a.ownerView !== 'function') return;
    let recs = records();
    const credIds = new Set(((a.ownerView().creds) || []).map((c) => c.id));
    const ends = C.sweepVerdicts(recs, { now: now(), live: liveness(a, credIds) });
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
  return { records, sync, onUpdate, stop: () => { stopped = true; if (tick) clearInterval(tick); } };
}

module.exports = { create, INBOX_KEY };

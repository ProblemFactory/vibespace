'use strict';
// THE TURN WATCH (lane turn-never-silent, laws L1 + L2 — the owner: «对了你能解决一下 agy 动不动就卡住再也不动的问题吗？»).
// Six silences in two weeks had ONE shape: the CLI's command tool opened a step, its result never came, the CLI stayed alive
// and wrote nothing, and the turn stayed open for hours until a person pressed Stop — and nothing anywhere said so.
//
// NO TURN OF ANY HARNESS IS SILENT WITHOUT A BOUND. A reading every READ_EVERY_MS over the local chat sessions in a turn:
//  · «written» = the CLI's OWN last line, its wrapper's stamp in the sidecar (`cliWroteAt`; `turnOpenedAt` where the
//    wrapper stamps its opening) — read with fs.promises, never on the loop's own time;
//  · «working» = the processes BELOW the CLI (src/server/proc-tree.js: their counters moving between two readings);
//  · the open tool step = the conversation's own running tool card (its message manager's pending tool call);
//  · a turn waiting on the PERSON (the chip's own fact) is never stuck.
// ONE PURE verdict (src/turn-liveness.js) says busy / stuck-on-command / silent / unknown. A speaking state is said ONCE per
// stuck turn as ONE For-you item (type 'turn-stuck', itemKey `turn-stuck:<id>:<the turn's token>`) that is also its card in
// the conversation (the registry row's `chat`) — drawn again in place only when its words change, and ended by the hub when
// the turn MOVES (a line, or work below the CLI: «it moved on»), ENDS («the turn ended») or is gone. Its doors are its own
// buttons (the registry row): «Keep waiting» (the item ends «kept waiting»; the turn is judged again only after another FULL
// bound with nothing — then the SAME key again, never a second beside it) and «Stop the turn» (the composer's own Stop).
// A person's ✕ stands for that turn. It speaks whether or not a window is open; after a hub restart the first reading is
// taken at once and the verdict comes at the second (a turn whose last line is older than the bound is judged then).
// No turn is started by any of it.

const fs = require('fs');
const path = require('path');
const TL = require('../turn-liveness.js');
const TW = require('../turn-stuck-words.js');
const { capsOf } = require('../backend-caps.js');
const { waitingOnUser } = require('../turn-state.js');
const { turnOf } = require('./turn-facts.js');
const { chipAsksOf } = require('../helper-ask.js');
const { createProcTree } = require('./proc-tree.js');

const ITEM_KEY = 'turn-stuck:';                 // the producer's identity (the registry row is the type's home)
const OWN_ENDS = Object.freeze(['moved', 'turn-ended', 'kept-waiting', 'gone', 'command-ended', 'ended-by-itself', 'restarted']);   // the ends THIS producer writes
const BOUND_SETTING = 'turns.stuckAfterMin';     // the told bound (minutes; default ten)
const END_SETTING = 'turns.endStuckCommandMin';  // the by-itself ending (minutes; default thirty; 0 = never) — the owner's word «可以», 2026-11-15

function create({ activeSessions, buffersDir, getUserTodos = () => null, sessionKeyOf = null, serverSetting = () => undefined,
  adapterOf = () => null, labelOf = (b) => { try { return require('../harnesses').harnessOf(b).label || b; } catch { return b; } }, asksOf = chipAsksOf, procTree = createProcTree(), readFile = (f) => fs.promises.readFile(f, 'utf8'),
  readEveryMs = TL.READ_EVERY_MS, now = () => Date.now(), log = console, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  const st = new Map();      // session id → this turn's watch {token, key, readings, prev, workSeenAt, keptAt}
  const seen = new Set();    // the sessions this process has seen in a turn (a first sight adopts the item a restart left)
  let timer = null, sweeping = false;
  const say = (line) => { try { (log.log || log.info || (() => { })).call(log, line); } catch { } };
  const keyOfItem = (i) => String((i && i.itemKey) || '');
  const items = () => { try { const ut = getUserTodos(); const sn = ut && ut.snapshot ? ut.snapshot() : null; return sn ? [...(sn.open || []), ...(sn.resolved || [])].filter((i) => keyOfItem(i).startsWith(ITEM_KEY)) : []; } catch { return []; } };
  const boundMs = () => TL.boundMsOf(serverSetting(BOUND_SETTING));
  const endBoundMs = () => TL.endBoundMsOf(serverSetting(END_SETTING), boundMs());
  const writeVerb = (s, o) => { try { s.pty.write(JSON.stringify(o) + '\n'); return true; } catch { return false; } };
  // the open tool step = the conversation's own running tool card: its message manager answers (openTool — every harness's)
  const openToolOf = (s) => { try { const t = s && s._normalizer && typeof s._normalizer.openTool === 'function' ? s._normalizer.openTool() : null; return t && t.name ? { name: t.name, since: null } : null; } catch { return null; } };
  async function sidecarOf(id) {
    try { const j = JSON.parse(await readFile(path.join(buffersDir, `${id}.json`))); return j && typeof j === 'object' ? j : null; } catch { return null; }
  }
  function end(it, why) { try { getUserTodos().setStatus(it.id, 'done', why); } catch (e) { say(`[turn-watch] ${it.id}: not ended — ${e && e.message}`); } }
  function show(id, s, w, words, facts = {}) {
    const ut = getUserTodos(); if (!ut) return;
    const it = items().find((i) => keyOfItem(i) === w.key);
    if (it && it.status === 'open') {   // patched in place, only when its own words differ
      if (JSON.stringify(it.i18n || null) === JSON.stringify(words.i18n)) return;
      try { ut.redrawItem((x) => x.id === it.id, { text: words.text, detail: words.detail, i18n: words.i18n }); } catch { }
      return;
    }
    if (it && it.resolvedBy === 'ended-by-itself' && facts.stuck) return;   // the act was taken for this stillness; a new one files after it moves
    // P6 (主开发 04:44Z): the person kept waiting and the next act is the by-itself ending — the kept card says so; not asked again
    if (it && it.resolvedBy === 'kept-waiting' && it.facts && it.facts.kept && it.facts.kept.act === 'end' && facts.stuck) return;
    if (it && !OWN_ENDS.includes(String(it.resolvedBy || ''))) return;   // a person's ✕ stands for this turn
    const sk = sessionKeyOf ? sessionKeyOf(s, id) : id;
    if (!sk) return;
    try {
      ut.add(sk, {
        origin: 'agent', by: 'agent', urgency: 'high', kind: 'action', sessionName: s.name || null,
        text: words.text, detail: words.detail, i18n: words.i18n, itemKey: w.key,   // ONE item per stuck turn (a re-file of an item this producer ended reopens it)
        action: { type: 'turn-stuck', sessionId: String(id), ...facts },   // facts: which of its buttons apply (the row's `when`)
      });
      say(`[turn-watch] ${id}: a turn said as stuck — one For-you item`);
    } catch (e) { say(`[turn-watch] ${id}: the For-you item was not filed — ${e && e.message}`); }
  }
  /** P6: a KEPT card of this conversation (resolved «kept-waiting», its `kept` fact) ends — the turn moved / ended / is gone, or
   *  its command was ended: its resolvedBy says which, so the card goes quiet */
  function endKept(id, why) {
    if (!why) return;
    for (const it of items()) if (it.status !== 'open' && it.resolvedBy === 'kept-waiting' && keyOfItem(it).startsWith(ITEM_KEY + id + ':')) end(it, why);
  }
  function endOpen(id, why) {
    endKept(id, why === 'kept-waiting' ? null : why);
    const w = st.get(id);
    const open = items().filter((i) => i.status === 'open' && (w ? keyOfItem(i) === w.key : keyOfItem(i).startsWith(ITEM_KEY + id + ':')));
    for (const it of open) end(it, why);
  }
  /** this turn's watch: at the session's FIRST sight in this process, the newest OPEN item a restart left is this turn's */
  function watchOf(id, s, sc) {
    let w = st.get(id);
    if (w) return w;
    let key = null;
    if (!seen.has(id)) {
      const left = items().filter((i) => keyOfItem(i).startsWith(ITEM_KEY + id + ':') && i.status === 'open').sort((a, b) => (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0))[0];
      if (left) key = left.itemKey;
    }
    seen.add(id);
    const token = Number(sc && sc.turnOpenedAt) || Number(s._turnOpenSaidAt) || Number(s._turnOpenedAt) || now();
    w = { token, key: key || `${ITEM_KEY}${id}:${token}`, readings: 0, prev: null, workSeenAt: 0, keptAt: 0, cut: false };
    st.set(id, w);
    return w;
  }

  /** ONE reading. → {looked, said} (for the suites) */
  async function sweep() {
    if (sweeping) return { looked: 0, said: 0 };
    sweeping = true;
    let looked = 0, said = 0;
    try {
      const live = new Set();
      for (const [id, s] of activeSessions) {
        if (!s || s.mode !== 'chat') continue;
        const row = capsOf(s.backend).liveness;
        // L3: a restart of a 'restart' harness (Stop, steer) whose old process has not exited within its bound — said with its door
        if (row && row.stop === 'restart') {
          const rc = await sidecarOf(id);
          const rs = rc && rc.restartStuck;
          const rkey = rs ? `${ITEM_KEY}${id}:restart:${Number(rs.since) || 0}` : null;
          for (const it of items()) if (it.status === 'open' && keyOfItem(it).startsWith(`${ITEM_KEY}${id}:restart:`) && keyOfItem(it) !== rkey) end(it, 'restarted');
          if (rs) { show(id, s, { key: rkey }, TW.restartWords(rs, { cli: labelOf(s.backend) }), { restartStuck: true }); said++; }
        }
        const t = turnOf(s);
        if (t !== 'running' && t !== 'waiting') { delete s._turnStuckSince; if (st.has(id)) { endOpen(id, 'turn-ended'); st.delete(id); } continue; }
        live.add(id); looked++;
        const sc = await sidecarOf(id);
        const w = watchOf(id, s, sc);
        let treeReadable = true, cliAlive = null;
        if (!sc || sc.remote || !sc.childPid) treeReadable = false;   // a paired machine's session (its processes live there), or no sidecar
        else {
          const r = await procTree.readBelow(Number(sc.childPid), { parent: Number(sc.pid) || null, now });
          cliAlive = r.alive;
          if (!r.readable) treeReadable = false;
          else {
            const cur = TL.readingOf(r.at, r.list, r.cut);
            if (TL.treeWorked(w.prev, cur)) w.workSeenAt = r.at;
            w.prev = cur; w.readings++;
          }
        }
        const v = TL.livenessVerdict({
          row, streaming: true, waitingOnUser: t === 'waiting' || waitingOnUser({ turnState: s._turnState || null, pendingAsks: asksOf(s) }),
          openedAt: Number(sc && sc.turnOpenedAt) || Number(s._turnOpenSaidAt) || Number(s._turnOpenedAt) || 0,
          lastWroteAt: Number(sc && sc.cliWroteAt) || 0, keptAt: w.keptAt, treeReadable, readings: w.readings, workSeenAt: w.workSeenAt,
          openTool: openToolOf(s), cliAlive, boundMs: boundMs(), endBoundMs: endBoundMs(), now: now(),
        });
        // L4: the fact a sender is told (a message queued behind this turn): since when the hub has said it is stuck
        if (v.state === 'stuck-on-command' || v.state === 'silent') s._turnStuckSince = Number(v.since) || null; else delete s._turnStuckSince;
        if (TL.SPEAKING.includes(v.state)) {
          // «End the command» applies to a command that is stuck, on a wrapper that serves it (its sidecar's advert)
          const endable = v.state === 'stuck-on-command' && !!(sc && sc.caps && sc.caps.endCommand === true);
          w.endable = endable;
          const eb = endBoundMs();
          const endAt = endable && eb !== null ? Number(v.stillSince) + eb : 0;
          const words = TW.stuckWords(v, { cli: labelOf(s.backend), endAt });
          if (words) { show(id, s, w, words, { stuck: true, ...(endable ? { endable: true } : {}) }); said++; }
          // THE BY-ITSELF ENDING (the owner's «可以»): ONLY a command stuck — open, nothing written, nothing below the CLI working —
          // for the second bound; the same act as the door; once per stillness; the turn goes on (no turn is started)
          if (endable && v.endDue && w.endedFor !== v.stillSince) { w.endedFor = v.stillSince; endCommand(id, 'by-itself'); }
        } else if (v.state === 'busy' || v.why === 'not-yet') {
          // something was written, or worked below the CLI — but after a «Keep waiting» the clock restarts on the PRESS: the kept
          // card ends only when the CLI wrote or its tree worked AFTER it (P6)
          const moved = !w.keptAt || Number(sc && sc.cliWroteAt) > w.keptAt || Number(w.workSeenAt) > w.keptAt;
          if (moved) endOpen(id, 'moved');
        }
      }
      for (const id of [...st.keys()]) if (!live.has(id)) { endOpen(id, activeSessions.has(id) ? 'turn-ended' : 'gone'); st.delete(id); }
    } finally { sweeping = false; }
    return { looked, said };
  }

  /** «Keep waiting» (a person's press on the item): the item ends «kept waiting»; the turn is judged again only after another
   *  FULL bound with nothing written and nothing working. → {ok, code} */
  function keepWaiting(id) {
    const w = st.get(id);
    if (!w) return { ok: false, code: 'not-stuck' };
    w.keptAt = now();
    try { delete activeSessions.get(id)._turnStuckSince; } catch { }   // the person chose to wait: not said as stuck until another full bound
    // P6 (主开发 04:44Z): the card stays where the person pressed, in its KEPT state — when they chose, when the next bound
    // falls and what happens then (the by-itself ending where «End the command» applies and the ending is on; else: asked
    // again) — and it keeps its door. The tray's item goes (a press is attended).
    const eb = endBoundMs();
    const act = w.endable && eb !== null ? 'end' : 'ask';
    const kept = { at: w.keptAt, nextAt: w.keptAt + (act === 'end' ? eb : boundMs()), act };
    const ut = getUserTodos();
    for (const it of items()) {
      if (it.status !== 'open' || keyOfItem(it) !== w.key) continue;
      try { ut.redrawItem((x) => x.id === it.id, { text: it.text, detail: it.detail || '', i18n: it.i18n, facts: { ...(it.facts || {}), kept } }); } catch { }
      end(it, 'kept-waiting');
    }
    return { ok: true, kept };
  }
  /** «End the command» (a person's press, or the by-itself ending): the wrapper ends the processes below the CLI and leaves the
   *  CLI — its tool step ends with the command's failure and the turn goes on. → {ok, code} */
  function endCommand(id, by = 'person') {
    const s = activeSessions.get(id);
    if (!s || !s.pty || s.mode !== 'chat') return { ok: false, code: 'not-live' };
    const w = st.get(id);
    if (!w) return { ok: false, code: 'not-stuck' };
    const eb = endBoundMs();
    if (!writeVerb(s, { type: 'end-command', by, ...(by === 'by-itself' && eb ? { afterMin: Math.round(eb / 60e3) } : {}) })) return { ok: false, code: 'not-live' };
    endOpen(id, by === 'by-itself' ? 'ended-by-itself' : 'command-ended');   // (a kept card ends with it: endOpen → endKept)
    say(`[turn-watch] ${id}: the command ended (${by})`);
    return { ok: true };
  }
  /** «Start it again anyway» (L3): the old CLI process never exited — the wrapper starts a new one without it */
  function restartAnyway(id) {
    const s = activeSessions.get(id);
    if (!s || !s.pty || s.mode !== 'chat') return { ok: false, code: 'not-live' };
    if (!writeVerb(s, { type: 'restart-anyway' })) return { ok: false, code: 'not-live' };
    for (const it of items()) if (it.status === 'open' && keyOfItem(it).startsWith(`${ITEM_KEY}${id}:restart:`)) end(it, 'restarted');
    return { ok: true };
  }
  /** «Stop the turn»: the composer's own Stop (the ws 'interrupt' recipe), for the session the item names → {ok, code} */
  function stopTurn(id) {
    const s = activeSessions.get(id);
    if (!s || !s.pty || s.mode !== 'chat') return { ok: false, code: 'not-live' };
    const ad = adapterOf(s.backend);
    if (!ad) return { ok: false, code: 'no-adapter' };
    try { s.pty.write(ad.formatInterrupt() + '\n'); ad.postInterrupt(s, id); } catch (e) { return { ok: false, code: 'stop-failed', message: e && e.message }; }
    return { ok: true };
  }

  function start() {
    if (timer) return;
    const tick = () => { sweep().catch((e) => say('[turn-watch] reading failed: ' + (e && e.message))).finally(() => { timer = setTimer(tick, readEveryMs); if (timer && timer.unref) timer.unref(); }); };
    tick();   // the first reading at once (a restart's turns are judged at the second)
  }
  function stop() { if (timer) { clearTimer(timer); timer = null; } }
  return { sweep, keepWaiting, stopTurn, endCommand, restartAnyway, start, stop, _state: st };
}

function install(deps) { const w = create(deps); w.start(); return w; }

module.exports = { create, install, ITEM_KEY, OWN_ENDS, BOUND_SETTING, END_SETTING };

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
// A person's ✕ stands for that stretch. It speaks whether or not a window is open. No turn is started by any of it.
//
// THE LOOK AT 99f65d547 (主开发 07:49Z; the GO with three amendments, 07:53Z):
//  LAW 1 — THE WATCH COUNTS ONLY STILLNESS IT OBSERVED: from reading to reading on a STEADY clock, inside one life of the
//    hub (src/turn-liveness.js stillnessStep). A gap between readings — a restart, a suspend, a clock step — is not
//    stillness: the count starts again at the first reading after it. The CLI's own stamp is a witness of MOVEMENT only.
//  LAW 2 — A STRETCH is one unbroken run with nothing written and nothing working: its own key
//    (`turn-stuck:<id>:<turn token>:<the instant of its first reading>`), its own item, and an ending only after its own
//    item stood (filed at an EARLIER reading). ONE STUCK COMMAND IS ONE ITEM across a gap: the open or kept item is CARRIED
//    (the count starts again, the card is patched), and a new life ADOPTS it the same way — what the person chose is a
//    fact of the card. A second item only after the turn MOVED or something was ended.
//  A TIME THE CARD SHOWS IS THE TIME IT WILL HAPPEN: «ended by itself at HH:MM» and the kept card's next time are the
//    count's own projection — the reading that will act — patched whenever the count starts again.
//  S4: what a restart left for a turn that ended, or for a conversation gone, while the hub was down is ended.

const fs = require('fs');
const path = require('path');
const TL = require('../turn-liveness.js');
const TW = require('../turn-stuck-words.js');
const { capsOf } = require('../backend-caps.js');
const { waitingOnUser } = require('../turn-state.js');
const { turnOf } = require('./turn-facts.js');
const { chipAsksOf } = require('../helper-ask.js');
const { createProcTree } = require('./proc-tree.js');
const G = require('../channel-groups.js');
const OF = require('./owner-facts.js');   // THE one formatter for a time an agent reads (the owner's zone, named)
const { toAgentText: agentText } = require('../peer-text.js');   // a conversation's name on its way to an agent (the peer-text census)

const ITEM_KEY = 'turn-stuck:';                 // the producer's identity (the registry row is the type's home)
const OWN_ENDS = Object.freeze(['moved', 'turn-ended', 'kept-waiting', 'gone', 'command-ended', 'ended-by-itself', 'restarted']);   // the ends THIS producer writes
const BOUND_SETTING = 'turns.stuckAfterMin';     // the told bound (minutes; default ten)
const SLOT = 'stuck-turn:';   // P7: the keyed stash slot that tells a waiting sender, one per stuck conversation
const END_SETTING = 'turns.endStuckCommandMin';  // the by-itself ending (minutes; default thirty; 0 = never) — the owner's word «可以», 2026-11-15
const GONE_AFTER_MS = 5 * 60 * 1000;             // S4: an item whose conversation is not here ends «gone» only after this long in THIS life (a boot restores the live set after the watch's first reading)
const minuteOf = (t) => Math.floor(Number(t) / 60000) * 60000;   // a time a card SHOWS (HH:MM): stored to the minute, so a reading's own jitter never redraws it
const ENDING_WAIT_MS = 2 * 60 * 1000;            // law 3: an ending asked of the wrapper whose record never came is let go after this (the item stays)
const LIVE = new Set();                          // the watches of this process (a wrapper's record reaches the one holding its session)

/** LAW 3 OF THE LOOK AT 99f65d547: the wrapper's OWN record of an ending (`command_ended`, data/bin/agy-wrapper.js) — the
 *  ONE door the hub learns what was ended through (src/server/stdout/acp-events.js calls it). The session keeps the
 *  answer's facts (`_commandEnded`, counted); the watch holding the session settles its asked ending AT ONCE. */
function noteCommandEnded(session, rec) {
  if (!session || !rec || typeof rec !== 'object') return;
  const prev = session._commandEnded;
  session._commandEnded = { n: ((prev && Number(prev.n)) || 0) + 1, ok: rec.ok === true, by: rec.by === 'by-itself' ? 'by-itself' : 'person', code: typeof rec.code === 'string' ? rec.code.slice(0, 40) : null,
    ended: Array.isArray(rec.ended) ? rec.ended.length : 0, survivors: Array.isArray(rec.survivors) ? rec.survivors.length : 0 };
  for (const w of LIVE) { try { w._settleSession(session); } catch { } }
}

function create({ activeSessions, buffersDir, getUserTodos = () => null, getGroups = () => null, getDeliver = () => null, sessionKeyOf = null, serverSetting = () => undefined,
  adapterOf = () => null, labelOf = (b) => { try { return require('../harnesses').harnessOf(b).label || b; } catch { return b; } }, asksOf = chipAsksOf, procTree = createProcTree(), readFile = (f) => fs.promises.readFile(f, 'utf8'),
  readEveryMs = TL.READ_EVERY_MS, now = () => Date.now(), mono = () => Number(process.hrtime.bigint()) / 1e6, log = console, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  const st = new Map();      // session id → this turn's watch {token, prev (the last reading), tree, readings, stretch}
  const seen = new Set();    // the sessions this life has seen (a first sight adopts — or ends — what a restart left)
  const absent = new Map();  // S4: item id → the steady instant its conversation was first read absent
  let timer = null, sweeping = false;
  const say = (line) => { try { (log.log || log.info || (() => { })).call(log, line); } catch { } };
  const keyOfItem = (i) => String((i && i.itemKey) || '');
  const items = () => { try { const ut = getUserTodos(); const sn = ut && ut.snapshot ? ut.snapshot() : null; return sn ? [...(sn.open || []), ...(sn.resolved || [])].filter((i) => keyOfItem(i).startsWith(ITEM_KEY)) : []; } catch { return []; } };
  const restartPrefix = (id) => `${ITEM_KEY}${id}:restart:`;
  const isTurnItem = (i, id) => keyOfItem(i).startsWith(`${ITEM_KEY}${id}:`) && !keyOfItem(i).startsWith(restartPrefix(id));
  const keptFactOf = (i) => (i && i.status !== 'open' && !i.clearedAt && i.resolvedBy === 'kept-waiting' && i.facts && i.facts.kept && typeof i.facts.kept === 'object' ? i.facts.kept : null);
  const boundMs = () => TL.boundMsOf(serverSetting(BOUND_SETTING));
  const endBoundMs = () => TL.endBoundMsOf(serverSetting(END_SETTING), boundMs());
  /** the instant of the READING that acts once `remainingMs` more stillness is counted (readings every readEveryMs) */
  const actAt = (fromWall, remainingMs) => fromWall + readEveryMs * Math.ceil(Math.max(0, remainingMs) / readEveryMs);
  const writeVerb = (s, o) => { try { s.pty.write(JSON.stringify(o) + '\n'); return true; } catch { return false; } };
  // movement witnesses: the CLI's own last line and the turn's opening (a new turn between two readings is movement too)
  const wroteOf = (s, sc) => Math.max(Number(sc && sc.cliWroteAt) || 0, Number(sc && sc.turnOpenedAt) || 0, Number(s && s._turnOpenSaidAt) || 0);
  // the turn's token: FIRM when a record states it (the wrapper's turnOpenedAt, the opening as the record says it) — the
  // same across a restart; else the hub's own instant
  const tokenOf = (s, sc) => { const firm = Number(sc && sc.turnOpenedAt) || Number(s && s._turnOpenSaidAt) || 0; return { token: firm || Number(s && s._turnOpenedAt) || 0, firm: !!firm }; };
  const tokenOfKey = (k, id) => String(k).slice(`${ITEM_KEY}${id}:`.length).split(':')[0];
  // the open tool step = the conversation's own running tool card: its message manager answers (openTool — every harness's)
  const openToolOf = (s) => { try { const t = s && s._normalizer && typeof s._normalizer.openTool === 'function' ? s._normalizer.openTool() : null; return t && t.name ? { name: t.name, cmd: typeof t.cmd === 'string' ? t.cmd : null, since: null } : null; } catch { return null; } };
  async function sidecarOf(id) {
    try { const j = JSON.parse(await readFile(path.join(buffersDir, `${id}.json`))); return j && typeof j === 'object' ? j : null; } catch { return null; }
  }
  function end(it, why) { try { getUserTodos().setStatus(it.id, 'done', why); } catch (e) { say(`[turn-watch] ${it.id}: not ended — ${e && e.message}`); } }
  /** the stretch's ONE item: filed at the bound, then drawn again IN PLACE only when its words or its doors change.
   *  → 'filed' | 'open' | undefined (not drawn: a person's ✕, a kept card whose next act is the ending, patchOnly) */
  function show(id, s, key, words, facts = {}, { patchOnly = false, reopen = false } = {}) {
    const ut = getUserTodos(); if (!ut) return;
    const doors = { type: 'turn-stuck', sessionId: String(id), ...facts };   // facts: which of its buttons apply (the row's `when`)
    const it = items().find((i) => keyOfItem(i) === key);
    if (it && it.status === 'open') {
      if (JSON.stringify(it.i18n || null) === JSON.stringify(words.i18n) && JSON.stringify(it.action || null) === JSON.stringify(doors)) return 'open';
      try { ut.redrawItem((x) => x.id === it.id, { text: words.text, detail: words.detail, i18n: words.i18n, facts: it.facts || null, action: doors }); } catch { }
      return 'open';
    }
    if (patchOnly) return;
    // P6 (主开发 04:44Z): the person kept waiting and the next act is the by-itself ending — the kept card says so; not asked again
    if (it && keptFactOf(it) && keptFactOf(it).act === 'end' && !reopen) return;
    if (it && !OWN_ENDS.includes(String(it.resolvedBy || ''))) return;   // a person's ✕ stands for this stretch
    const sk = sessionKeyOf ? sessionKeyOf(s, id) : id;
    if (!sk) return;
    try {
      ut.add(sk, {
        origin: 'agent', by: 'agent', urgency: 'high', kind: 'action', sessionName: s.name || null,
        text: words.text, detail: words.detail, i18n: words.i18n, itemKey: key,   // ONE item per stuck stretch (a re-file of an item this producer ended reopens it)
        action: { type: 'turn-stuck', sessionId: String(id), ...facts },
      });
      say(`[turn-watch] ${id}: a turn said as stuck — one For-you item`);
      return 'filed';
    } catch (e) { say(`[turn-watch] ${id}: the For-you item was not filed — ${e && e.message}`); }
  }
  /** this conversation's turn items — the open one and a kept card — end with `why` (the restart item has its own branch) */
  function endOpen(id, why) {
    for (const it of items()) if (isTurnItem(it, id) && (it.status === 'open' || keptFactOf(it))) end(it, why);
  }
  /** a kept card's own facts drawn again (its next time moved, or its act) — the card stays resolved: law 1's «a time the
   *  card shows is the time it will happen» */
  function patchKept(S, k) {
    S.kept = k;
    const it = items().find((i) => keyOfItem(i) === S.key && keptFactOf(i));
    if (!it) return;
    try { getUserTodos().redrawItem((x) => x.id === it.id, { text: it.text, detail: it.detail || '', i18n: it.i18n, facts: { ...(it.facts || {}), kept: k }, action: it.action }, { resolved: true }); } catch { }
  }
  const newStretch = (id, w, s, sc, wall) => ({ key: `${ITEM_KEY}${id}:${w.token}:${wall}`, wrote: wroteOf(s, sc), saidMono: null, kept: null, nothing: false, byItself: false });
  /** this turn's watch. At the conversation's FIRST sight in this life, what a restart left for it is ADOPTED — the open
   *  item or the kept card, as the stretch it is (law 1: what the person chose is a fact of the card a new life adopts) —
   *  unless the turn it spoke of ended, or the CLI wrote, while the hub was down (S4) */
  function watchOf(id, s, sc) {
    let w = st.get(id);
    if (w) return w;
    const { token, firm } = tokenOf(s, sc);
    w = { token: token || now(), prev: null, tree: null, readings: 0, stretch: null };
    st.set(id, w);
    if (seen.has(id)) return w;
    seen.add(id);
    const left = items().filter((i) => isTurnItem(i, id) && (i.status === 'open' || keptFactOf(i))).sort((a, b) => (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0));
    const [it, ...older] = left;
    for (const o of older) end(o, 'moved');   // a newer stretch stood after it
    if (!it) return w;
    const was = Number(it.action && it.action.wrote) || 0;
    if (firm && tokenOfKey(it.itemKey, id) !== String(token)) { end(it, 'turn-ended'); say(`[turn-watch] ${id}: the turn a restart left an item for ended while the hub was down`); }
    else if (was && wroteOf(s, sc) > was) end(it, 'moved');
    else {
      if (!firm) w.token = Number(tokenOfKey(it.itemKey, id)) || w.token;
      w.stretch = { key: it.itemKey, wrote: was || wroteOf(s, sc), saidMono: -Infinity, kept: keptFactOf(it), nothing: !!(it.action && it.action.nothingToEnd), byItself: false };
      say(`[turn-watch] ${id}: the item a restart left is adopted — the count starts again at this reading`);
    }
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
          const rkey = rs ? `${restartPrefix(id)}${Number(rs.since) || 0}` : null;
          for (const it of items()) if (it.status === 'open' && keyOfItem(it).startsWith(restartPrefix(id)) && keyOfItem(it) !== rkey) end(it, 'restarted');
          if (rs) { show(id, s, rkey, TW.restartWords(rs, { cli: labelOf(s.backend) }), { restartStuck: true }); said++; }
        }
        const t = turnOf(s);
        if (t !== 'running' && t !== 'waiting') {
          delete s._turnStuckSince;
          if (st.has(id) || !seen.has(id)) endOpen(id, 'turn-ended');   // a watched turn ended — or (a first sight) one a restart left an item for
          seen.add(id); st.delete(id);
          continue;
        }
        live.add(id); looked++;
        const sc = await sidecarOf(id);
        const w = watchOf(id, s, sc);
        if (w.ending && !settle(id) && w.ending && mono() - w.ending.mono > ENDING_WAIT_MS) { say(`[turn-watch] ${id}: the wrapper never answered the ending asked ${Math.round((mono() - w.ending.mono) / 1000)} s ago — the item stays`); w.ending = null; }
        // THE READING: the tree below the CLI, then the two clocks
        let treeReadable = true, cliAlive = null, worked = null, below = null;
        if (!sc || sc.remote || !sc.childPid) treeReadable = false;   // a paired machine's session (its processes live there), or no sidecar
        else {
          const r = await procTree.readBelow(Number(sc.childPid), { parent: Number(sc.pid) || null, now });
          cliAlive = r.alive;
          if (!r.readable) treeReadable = false;
          else { const cur = TL.readingOf(r.at, r.list, r.cut); worked = TL.treeWorked(w.tree, cur); w.tree = cur; below = r.cut ? null : (r.list || []).length; }
        }
        const wall = now(), m = mono(), wrote = wroteOf(s, sc);
        const step = TL.stillnessStep(w.prev, { mono: m, wall, wrote, worked }, { periodMs: readEveryMs });
        const asks = t === 'waiting' || waitingOnUser({ turnState: s._turnState || null, pendingAsks: asksOf(s) });
        w.readings++;
        w.prev = { mono: m, wall, wrote, stillMs: asks ? 0 : step.stillMs };   // a turn waiting on the PERSON is never stuck: its count starts when it is answered
        if (step.moved && w.ending) say(`[turn-watch] ${id}: it moved while its ending is asked — the wrapper's record says what was ended`);   // law 3: our own ending moves the tree; its record speaks, never «it moved on»
        else if (step.moved) {
          // the stretch is over: its item goes (a new turn opened between two readings: «the turn ended»)
          const tk = tokenOf(s, sc).token;
          endOpen(id, tk && tk !== w.token ? 'turn-ended' : 'moved');
          delete s._turnStuckSince;
          w.stretch = null; if (tk) w.token = tk;
        } else if (step.gap && w.readings > 1) say(`[turn-watch] ${id}: a gap between two readings (a suspend, a clock step, a held loop) — the count starts again`);
        if (asks) continue;
        if (!w.stretch) w.stretch = newStretch(id, w, s, sc, wall);
        const S = w.stretch, stillMs = w.prev.stillMs, bound = boundMs(), eb = endBoundMs();
        const tool = openToolOf(s);
        // the verdict on the OBSERVED count: nothing written since `wall − stillMs`, nothing below the CLI worked since
        const v = TL.livenessVerdict({
          row, streaming: true, waitingOnUser: false, lastWroteAt: wall - stillMs, openedAt: 0, keptAt: 0, treeReadable, readings: w.readings, workSeenAt: 0,
          openTool: tool, cliAlive, boundMs: bound, endBoundMs: eb, now: wall,
        });
        const it = items().find((i) => keyOfItem(i) === S.key);
        const open = !!(it && it.status === 'open');
        const speaking = TL.SPEAKING.includes(v.state);
        const state = speaking ? v.state : (open || S.kept) ? TL.speakingStateOf({ row, treeReadable, openTool: tool }) : null;
        if (!state) continue;   // not yet (nothing said in this stretch)
        // since when the CLI wrote nothing — the stamp it wrote (a fact, true across a restart), else the count's own start
        const stamp = Math.max(Number(sc && sc.cliWroteAt) || 0, Number(sc && sc.turnOpenedAt) || Number(s._turnOpenSaidAt) || Number(s._turnOpenedAt) || 0);
        const since = stamp && stamp <= wall ? stamp : wall - stillMs;
        if (state === 'stuck-on-command' && below === 0) S.nothing = true;   // law 3: a step open with NOTHING running below the CLI
        const endDoor = state === 'stuck-on-command' && !S.nothing && !!(sc && sc.caps && sc.caps.endCommand === true);   // «End the command»: the wrapper serves it
        S.byItself = endDoor && !!row && row.commandBound === 'none' && eb !== null;   // S1: the by-itself ending only where the ROW says «no bound of its own»
        const stood = S.saidMono !== null && S.saidMono < m;   // law 2: its own item stood at an EARLIER reading
        if (S.kept) {
          // P6 + the look's amendment 3: the KEPT card stays the kept card; its next time is the count's own, patched when it moves
          const act = S.byItself ? 'end' : 'ask';
          const nextAt = minuteOf(actAt(wall, (act === 'end' ? eb : bound) - stillMs));
          if (act !== S.kept.act || nextAt !== minuteOf(S.kept.nextAt)) patchKept(S, { ...S.kept, act, nextAt });
          if (act === 'end') { if (stillMs >= eb && !w.ending) endCommand(id, 'by-itself'); continue; }
          if (!speaking) continue;
          S.kept = null;   // its next act: the person is asked again — the SAME item reopened
        }
        const endAt = S.byItself ? minuteOf(actAt(wall, Math.max(eb - stillMs, stood ? 0 : 1))) : 0;
        S.said = { state, tool: tool && tool.name, cmd: tool && tool.cmd, since, cliAlive };   // what the item says (law 3 redraws it at the wrapper's answer)
        const words = TW.stuckWords({ state, tool: tool && tool.name, cmd: tool && tool.cmd, since, cliAlive }, { cli: labelOf(s.backend), endAt, nothingToEnd: S.nothing });
        const facts = { stuck: true, ...(endDoor ? { endable: true } : {}), ...(S.nothing ? { nothingToEnd: true } : {}), wrote: S.wrote };
        const r = show(id, s, S.key, words, facts, { patchOnly: !speaking });
        if (r === 'filed') { S.saidMono = m; said++; if (state !== 'unknown') await tellWaiting(id, s, S, since); }
        else if (r === 'open') said++;
        // L4: the fact a sender is told (a message queued behind this turn): since when, while its item stands
        if ((r === 'filed' || r === 'open') && (state === 'stuck-on-command' || state === 'silent')) s._turnStuckSince = since; else delete s._turnStuckSince;
        // THE BY-ITSELF ENDING (the owner's «可以»): ONLY a command stuck — open, nothing written, nothing below the CLI working —
        // for the second bound OBSERVED; only after its own item stood; the same act as the door; the turn goes on
        if (S.byItself && stood && stillMs >= eb && !w.ending) endCommand(id, 'by-itself');
      }
      for (const id of [...st.keys()]) if (!live.has(id)) { endOpen(id, activeSessions.has(id) ? 'turn-ended' : 'gone'); st.delete(id); }
      // S4: an item whose conversation is not here (gone while the hub was down) — after GONE_AFTER_MS of this life
      const m = mono();
      for (const it of items()) {
        if (!(it.status === 'open' || keptFactOf(it))) { absent.delete(it.id); continue; }
        const sid = String((it.action && it.action.sessionId) || '');
        if (!sid || activeSessions.has(sid)) { absent.delete(it.id); continue; }
        if (!absent.has(it.id)) { absent.set(it.id, m); continue; }
        if (m - absent.get(it.id) >= GONE_AFTER_MS) { absent.delete(it.id); end(it, 'gone'); say(`[turn-watch] ${sid}: its item ended — the conversation is gone`); }
      }
    } finally { sweeping = false; }
    return { looked, said };
  }

  /** P7 (主开发 04:44Z, «YES — ONCE, AT THAT MOMENT, FREE»): each AGENT whose group message waits on this turn when it becomes
   *  stuck is told once — the same sentence a new sender gets — at its NEXT turn (a keyed stash line: never a wake, never a
   *  billed turn); once per stuck stretch per sender (the slot's set is the stretch's key); nothing when the turn moves (its
   *  ordinary delivery says that). The senders are shape C's reading of what waits (groups-engine readWaiting). → told */
  async function tellWaiting(id, s, S, since) {
    const groups = getGroups(), d = getDeliver();
    const cid = (s && (s.backendSessionId || s.claudeSessionId)) || null;
    if (!cid || !groups || typeof groups.readWaiting !== 'function' || !d || typeof d.stashSlot !== 'function') return 0;
    let r; try { r = await groups.readWaiting(cid, { now: now(), olderThan: 0 }); } catch (e) { say(`[turn-watch] ${id}: who waits was not read — ${e && e.message} (nobody told)`); return 0; }
    const senders = new Set();
    for (const g of (r && r.groups) || []) for (const snd of Object.keys(g.senders || {})) if (G.isCid(snd) && snd !== cid) senders.add(snd);
    const name = agentText(String(s.name || id), { max: 80, kind: 'line' });
    const text = `(VibeSpace) Your group message to «${name}» waits behind its current turn — a turn stuck since ${OF.when(Number(since))}; the owner has been asked. It is handed over when that turn is released.`;
    let told = 0;
    for (const snd of senders) { try { if (d.stashSlot(snd, SLOT + cid, { source: 'agent', fromName: 'VibeSpace', text }, { set: [S.key] }).filed) told++; } catch (e) { say(`[turn-watch] a waiting sender was not told — ${e && e.message}`); } }
    if (told) say(`[turn-watch] ${id}: ${told} waiting sender(s) told the turn is stuck`);
    return told;
  }
  /** «Keep waiting» (a person's press on the item): the item ends «kept waiting» and its card stays KEPT; the count starts
   *  again at the press — the turn is judged again only after another FULL bound with nothing written and nothing working.
   *  → {ok, code, kept} */
  function keepWaiting(id) {
    const w = st.get(id), S = w && w.stretch;
    const it = S ? items().find((i) => keyOfItem(i) === S.key && i.status === 'open') : null;
    if (!it) return { ok: false, code: 'not-stuck' };
    const wall = now(), last = w.prev ? w.prev.wall : wall;
    if (w.prev) w.prev = { ...w.prev, mono: mono(), wall, stillMs: 0 };   // the count starts again at the press
    try { delete activeSessions.get(id)._turnStuckSince; } catch { }   // the person chose to wait: not said as stuck until another full bound
    // P6 (主开发 04:44Z): the card stays where the person pressed, in its KEPT state — when they chose, when the next act
    // falls (the reading that will act) and what it is (the by-itself ending where it applies; else: asked again) — and
    // it keeps its door. The tray's item goes (a press is attended).
    const act = S.byItself ? 'end' : 'ask';
    const kept = { at: wall, nextAt: minuteOf(actAt(last, (act === 'end' ? endBoundMs() : boundMs()) + wall - last)), act };
    S.kept = kept;
    // one time per card, the true one: the headline drops its «ended by itself at …» (the kept line says the next time)
    const s = activeSessions.get(id), words = S.said && s ? TW.stuckWords(S.said, { cli: labelOf(s.backend), nothingToEnd: S.nothing, kept: true }) : null;
    try { getUserTodos().redrawItem((x) => x.id === it.id, { text: words ? words.text : it.text, detail: it.detail || '', i18n: words ? words.i18n : it.i18n, facts: { ...(it.facts || {}), kept }, action: it.action }); } catch { }
    end(it, 'kept-waiting');
    return { ok: true, kept };
  }
  /** «End the command» (a person's press, or the by-itself ending): the wrapper is ASKED to end the processes below the CLI
   *  and leave the CLI — its tool step ends with the command's failure and the turn goes on. LAW 3: the item says «ended»
   *  only on the wrapper's own record that something was ended (settle); one ending at a time — a second press while one is
   *  asked is answered «already ending» (M5). → {ok, code} */
  function endCommand(id, by = 'person') {
    const s = activeSessions.get(id);
    if (!s || !s.pty || s.mode !== 'chat') return { ok: false, code: 'not-live' };
    const w = st.get(id);
    if (!w || !w.stretch) return { ok: false, code: 'not-stuck' };
    if (w.ending) return { ok: false, code: 'already-ending' };
    if (w.stretch.nothing) return { ok: false, code: 'nothing-to-end' };
    const eb = endBoundMs();
    w.ending = { by, mono: mono(), n0: (s._commandEnded && Number(s._commandEnded.n)) || 0 };   // asked BEFORE the verb is written (its answer may come at once)
    if (!writeVerb(s, { type: 'end-command', by, ...(by === 'by-itself' && eb ? { afterMin: Math.round(eb / 60e3) } : {}) })) { w.ending = null; return { ok: false, code: 'not-live' }; }
    say(`[turn-watch] ${id}: the command's ending asked (${by})`);
    return { ok: true, code: 'ending' };
  }
  /** the wrapper's answer to the asked ending (noteCommandEnded's fact on the session) → whether it settled. Something ended ⇒
   *  the item ends «the command was ended» / «ended by itself» and the next stuck stretch is its own (law 2); nothing runs below
   *  the CLI ⇒ the item STAYS, says «there is nothing to end» and keeps Stop as its door, never ended by itself; another
   *  verb's ending under way ⇒ its answer is still to come; anything else ⇒ said in the log, the item stays. */
  function settle(id) {
    const w = st.get(id), s = activeSessions.get(id);
    const f = s && s._commandEnded;
    if (!w || !w.ending || !f || !(Number(f.n) > w.ending.n0)) return false;
    if (f.code === 'already-ending') { w.ending.n0 = Number(f.n); return false; }
    const by = w.ending.by, S = w.stretch;
    w.ending = null;
    if (f.ok && f.ended > 0) {
      endOpen(id, by === 'by-itself' ? 'ended-by-itself' : 'command-ended');   // (a kept card ends with it)
      w.stretch = null; if (w.prev) w.prev = { ...w.prev, stillMs: 0 };   // law 2: after an ending, the next stuck stretch is its own
      say(`[turn-watch] ${id}: the command was ended (${by}; ${f.ended} process(es)${f.survivors ? `, ${f.survivors} still running` : ''})`);
      return true;
    }
    if (!f.ok && f.code === 'no-command' && S) {
      S.nothing = true; S.byItself = false; S.kept = null;
      if (S.said) show(id, s, S.key, TW.stuckWords(S.said, { cli: labelOf(s.backend), nothingToEnd: true }), { stuck: true, nothingToEnd: true, wrote: S.wrote }, { reopen: true });
      say(`[turn-watch] ${id}: there is nothing to end — the CLI waits on a step with no command running; the item stays`);
      return true;
    }
    say(`[turn-watch] ${id}: the command was not ended (${f.code || (f.survivors ? `${f.survivors} process(es) still running` : 'nothing was running')}) — the item stays`);
    return true;
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

  function settleSession(session) { for (const [id, s] of activeSessions) if (s === session) { settle(id); return; } }

  function start() {
    if (timer) return;
    const tick = () => { sweep().catch((e) => say('[turn-watch] reading failed: ' + (e && e.message))).finally(() => { timer = setTimer(tick, readEveryMs); if (timer && timer.unref) timer.unref(); }); };
    tick();   // the first reading at once (a restart's turns are judged at the second)
  }
  function stop() { if (timer) { clearTimer(timer); timer = null; } LIVE.delete(api); }
  const api = { sweep, keepWaiting, stopTurn, endCommand, restartAnyway, start, stop, _settleSession: settleSession, _state: st };
  LIVE.add(api);
  return api;
}

function install(deps) { const w = create(deps); w.start(); return w; }

module.exports = { create, install, noteCommandEnded, ITEM_KEY, OWN_ENDS, BOUND_SETTING, END_SETTING, SLOT, ENDING_WAIT_MS };

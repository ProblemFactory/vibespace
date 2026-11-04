#!/usr/bin/env node
// A REFUSAL NEVER RE-SENDS THE RECORD IT REFUSED · A DUPLICATE IS EXPLAINED WHEREVER IT IS SHOWN · ONE CONVERSATION, ONE WINDOW
// ENTRY — the fast gate of userW inc-mw1ogdno-5jny (2.369.374, «报错在顶部疯狂闪»): the warn toast «1 windows on “…” were kept — this
// page had not opened them yet» every ~500 ms. THE MEASURED SHAPE: 222 layout-sync sends and 222 layout-sync-refused answers in
// 130 s (median gap 515 ms); layouts.json listed ONE live conversation (server session S) under THREE desktops' records, three
// window ids. The page showed S on desktop X; replaying desktop V it found S live under X's window and settled V's copy as a
// duplicate, dropped as 'unbuilt'; the server's belt explained a duplicate only inside ONE record (`nextSessions`) — «1 LIVE (the
// sender could not build them)», refused; the reconcile replayed nothing, `rearmSave` ⇒ the next capture dropped the copy again.
// The records below keep that SHAPE (three desktops, the session on each, V holding five windows) with invented ids and words.
// THE FAST HALF (the real page's clock — the storm windows and the door census — is test-layout-dup-storm-loop; the shared harness
// is scripts/layout-dup-world.mjs, the shape scripts/fixtures/layout-dup-triple.json). No DOM, no ports — the real modules:
//   §1 PURE (src/lib/desktop-record.js): shrinkVerdict's cross-record duplicate (`elsewhere`, the evidence's `by`) and its control
//      (a `by` that shows nothing of the session is refused, named in `dup`); duplicatesOf (one conversation, one entry);
//      refusalKey / refusalStorm / stormEnd / stormSweep (a refusal is said once; the server never answers a storm)
//   §2 THE REAL ws-handler (registerWsHandler on a fake wss, layouts in memory): A — V's write dropping its copy as {why:'dup',
//      by: X's window} is ACCEPTED (the journal names it); the same with today's 'unbuilt' or a `by` that is no window of S is
//      refused; C — 50 identical refused sends ⇒ ONE refusal, no journal line per repeat, ONE storm line (client, desktop,
//      count) when a changed record is judged afresh (telemetry layout-sync-storm); an accepted write ends a storm
//   §4 D — ONE TOAST PER CAUSE (the real DesktopManager.onSyncRefused): refusals of one desktop and reason within 30 s ⇒ one
//      toast naming the windows by name; the count on the next one after 30 s
//   §6 MUTANTS (scripts/mutant-copy.mjs): A's by-check dropped, C's storm guard removed, D's dedup removed — each RED
//   ROUND 3 (the r2 acceptance of ab1226ff2): §1 noteDupsLeft (the hub's dedup trace) and chainsAgree (a write never makes a
//      record's rows disagree about a group — 'chain-disagrees'); §2 on the real handler: an accepted dedup is TRACED beside the
//      record (on disk) and relayed, and forgotten when a write lists the window again; a write introducing a chain disagreement
//      is refused; §6 the trace, the chain gate, the PURE verdict removed — each RED
import { REPO, LIB, read, J, tick, made, toasts, toastText, S, T, CID, GB, chat, files, DESKS, TRIPLE, SINGLE, DOC, ids, sessionEntries, MODEL, loadHandler, hub, refusals, acks, RealDM, RealLM, world, switchTo, loadLifecycle, pageOn } from './layout-dup-world.mjs';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
const require = createRequire(import.meta.url);
const member = (w, tabs) => ({ ...w, tabChain: { tabs: [...tabs], active: 0, layout: 'tabs', order: [...tabs] }, isTabGuest: tabs[0] !== w.winId });
let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? '\n    ' + String(typeof extra === 'string' ? extra : J(extra)).slice(0, 900) : '')); } return !!c; };
const section = async (title, fn) => { console.log('— ' + title); try { await fn(); } catch (e) { ok(false, title + ' — threw', e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : String(e)); } };
// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
function pureLegs(DR, { quiet = false } = {}) {
  const failed = [];
  const leg = (c, n, extra) => { if (!quiet) ok(c, n, extra); if (!c) failed.push(n); return !!c; };
  const R = TRIPLE();
  const vNext = R['desk-v'].filter((w) => w.winId !== 'win-v-s');
  const alive = (sid) => sid === S || sid === T;
  const sv = (evidence, elsewhere = [R['desk-x'], R['desk-y']]) => (typeof DR.shrinkVerdict === 'function' ? DR.shrinkVerdict({ prev: R['desk-v'], next: vNext, evidence, alive, elsewhere }) : { ok: false });
  const a = sv([{ id: 'win-v-s', why: 'dup', by: 'win-x-s' }]);
  leg(a.ok === true && J(a.dropped) === J(['win-v-s']), '§1 A DUPLICATE IS EXPLAINED WHEREVER IT IS SHOWN: V (5 → 4) drops its copy of S as {why:\'dup\', by: X\'s window} — X\'s stored record shows S there ⇒ ACCEPTED', a);
  const u = sv([{ id: 'win-v-s', why: 'unbuilt' }]);
  leg(!u.ok && J(u.live) === J(['win-v-s']), '§1 …the incident\'s evidence (\'unbuilt\', no `by`) is still the «1 LIVE» refusal — the page must say WHERE the session is shown', u);
  const c = sv([{ id: 'win-v-s', why: 'dup', by: 'x-1' }]);
  leg(!c.ok && J(c.unexplained) === J(['win-v-s']) && J(c.dup) === J(['win-v-s']), '§1 CONTROL: a \'dup\' whose `by` shows nothing of S (a file window of X) is REFUSED at any count, named in `dup`', c);
  const self = sv([{ id: 'win-v-s', why: 'dup', by: 'win-v-s' }]);
  const none = sv([{ id: 'win-v-s', why: 'dup', by: 'win-x-s' }], []);
  const gone = sv([{ id: 'win-v-s', why: 'dup', by: 'win-gone' }]);
  leg(!self.ok && !none.ok && !gone.ok, '§1 …nor a `by` naming the copy itself, a `by` no stored record holds, or no other record handed in (`elsewhere` empty)', { self: self.ok, none: none.ok, gone: gone.ok });
  // r2 (the r1 acceptance's major): DEDUP NEVER REMOVES A WINDOW SOMEONE IS LOOKING AT — the verdict is the hub's (`showing`)
  const seen = typeof DR.shrinkVerdict === 'function' ? DR.shrinkVerdict({ prev: R['desk-v'], next: vNext, evidence: [{ id: 'win-v-s', why: 'dup', by: 'win-x-s' }], alive, elsewhere: [R['desk-x'], R['desk-y']], showing: (sid) => sid === S }) : { ok: true };
  leg(!seen.ok && J(seen.dup) === J(['win-v-s']) && J(seen.shown) === J(['win-v-s']), '§1 r2 DEDUP NEVER REMOVES A WINDOW SOMEONE IS LOOKING AT: the same valid duplicate while ANOTHER client shows its session (`showing`) ⇒ REFUSED, named in `dup` and `shown`', seen);
  const same = typeof DR.shrinkVerdict === 'function' ? DR.shrinkVerdict({ prev: [chat('a', S, 0), chat('b', S, 1)], next: [chat('a', S, 0)], evidence: [{ id: 'b', why: 'dup', by: 'a' }], alive }) : { ok: false };
  leg(same.ok === true, '§1 …and a `by` in the record written itself (two windows of S on one desktop) explains it too', same);
  const fileDup = typeof DR.shrinkVerdict === 'function' ? DR.shrinkVerdict({ prev: [files('f', 0), chat('a', S, 0)], next: [chat('a', S, 0)], evidence: [{ id: 'f', why: 'dup', by: 'a' }], alive }) : { ok: true };
  leg(!fileDup.ok, '§1 …a window that is no session is never a duplicate', fileDup);
  // E — one conversation, one window entry
  const dups = typeof DR.duplicatesOf === 'function' ? DR.duplicatesOf({ records: R, shown: new Map([[S, 'win-x-s']]) }) : null;
  leg(J(dups) === J([{ desk: 'desk-y', id: 'win-y-s', by: 'win-x-s', sid: S }, { desk: 'desk-v', id: 'win-v-s', by: 'win-x-s', sid: S }]), '§1 duplicatesOf: the page shows S in X\'s window ⇒ Y\'s and V\'s entries of S are the copies (each with `by`); X\'s own and T\'s are not', dups);
  let threw = null;
  try { DR.duplicatesOf({ records: new Map([['d', { windows: [null, 3, { winId: 'q' }] }]]), shown: new Map([[S, 'z']]) }); DR.duplicatesOf({}); DR.duplicatesOf(); } catch (e) { threw = String(e); }
  leg(typeof DR.duplicatesOf === 'function' && J(DR.duplicatesOf({ records: R, shown: new Map() })) === '[]' && !threw, '§1 …nothing shown ⇒ no copy; a Map of records and garbage never throw', threw);
  // C — a refusal's identity, the storm
  const K = DR.refusalKey || (() => Math.random());
  leg(K({ desktopId: 'd', reason: 'shrink-without-close', unexplained: ['b', 'a'] }) === K({ desktopId: 'd', reason: 'shrink-without-close', unexplained: ['a', 'b', 'a'] })
    && K({ desktopId: 'd', reason: 'shrink-without-close', unexplained: ['a'] }) !== K({ desktopId: 'd', reason: 'shrink-without-close', unexplained: ['b'] })
    && K({ desktopId: 'd', reason: 'stale', base: 5 }) !== K({ desktopId: 'd', reason: 'stale', base: 6 })
    && K({ desktopId: 'd', reason: 'x' }) !== K({ desktopId: 'e', reason: 'x' }), '§1 refusalKey: the desktop, the reason and what it refused (the drop set as a set, the base) — nothing else');
  const mem = new Map(), k1 = K({ desktopId: 'desk-v', reason: 'shrink-without-close', unexplained: ['win-v-s'] });
  const RS = DR.refusalStorm || (() => ({ answer: true, ended: null }));
  const answers = []; for (let i = 0; i < 50; i++) answers.push(RS(mem, { who: 1, desktopId: 'desk-v', key: k1, now: 1000 + i * 515 }).answer);
  leg(answers.filter(Boolean).length === 1 && answers[0] === true, '§1 refusalStorm: 50 identical refusals 515 ms apart (the measured cadence) ⇒ ONE answered, 49 repeats', answers.filter(Boolean).length);
  const fresh = RS(mem, { who: 1, desktopId: 'desk-v', key: K({ desktopId: 'desk-v', reason: 'shrink-without-close', unexplained: ['v-1'] }), now: 1000 + 50 * 515 });
  leg(fresh.answer === true && fresh.ended && fresh.ended.count === 49 && fresh.ended.who === 1 && fresh.ended.desktopId === 'desk-v', '§1 …a CHANGED refusal is answered afresh and ends the storm ONCE: {who, desktop, count: 49}', fresh);
  const other = RS(mem, { who: 2, desktopId: 'desk-v', key: k1, now: 1000 + 51 * 515 });
  leg(other.answer === true, '§1 …another client has its own memory (its first refusal is answered)');
  const m2 = new Map(); RS(m2, { who: 1, desktopId: 'd', key: 'k', now: 0 }); RS(m2, { who: 1, desktopId: 'd', key: 'k', now: 100 });
  const calm = RS(m2, { who: 1, desktopId: 'd', key: 'k', now: 100 + 10001 });
  leg(calm.answer === true && calm.ended && calm.ended.count === 1, '§1 …the same refusal after 10 s of quiet is answered again (the storm before it said once)', calm);
  const m3 = new Map(); RS(m3, { who: 1, desktopId: 'd', key: 'k', now: 0 }); RS(m3, { who: 1, desktopId: 'd', key: 'k', now: 10 });
  const ended = DR.stormEnd ? DR.stormEnd(m3, { who: 1, desktopId: 'd' }) : null;
  const m4 = new Map(); RS(m4, { who: 1, desktopId: 'd', key: 'k', now: 0 }); RS(m4, { who: 1, desktopId: 'd', key: 'k', now: 10 }); RS(m4, { who: 3, desktopId: 'd', key: 'k', now: 10 });
  const swept = DR.stormSweep ? DR.stormSweep(m4, { now: 10 + 10001 }) : [];
  leg(ended && ended.count === 1 && !m3.size && swept.length === 1 && swept[0].count === 1 && !m4.size, '§1 stormEnd (an accepted write) and stormSweep (10 s of quiet) end a storm once; a refusal never repeated ends silently', { ended, swept });
  const m5 = new Map(); let n5 = 0; for (let t = 0; t <= 125000; t += 500) if (RS(m5, { who: 1, desktopId: 'd', key: 'k', now: t }).answer) n5++;
  leg(n5 === 3, '§1 …a client that never stops gets one answer a MINUTE (STORM_MAX_MS), never one per send (125 s of 2 Hz ⇒ 3)', n5);
  // r3 F — THE DEDUP TRACE (noteDupsLeft): the copies a write let go, noted; an id a write lists again, forgotten; bounded
  const ND = DR.noteDupsLeft || (() => null);
  const tr1 = ND([{ id: 'a', by: 'b', at: 1 }, { id: 'c', by: 'd', at: 2 }], { left: [{ id: 'e', why: 'dup', by: 'f' }], listed: [{ winId: 'a' }, 'x'], at: 9 });
  leg(J(tr1) === J([{ id: 'c', by: 'd', at: 2 }, { id: 'e', by: 'f', at: 9 }]), '§1 r3 F noteDupsLeft: a copy the write let go is traced {id, by, at}; an id the write LISTS again leaves the trace (the hub learned it is shown)', tr1);
  const tr2 = ND(Array.from({ length: 60 }, (_, i) => ({ id: 'w' + i, by: 'b', at: i })), { left: [], listed: [] });
  leg(Array.isArray(tr2) && tr2.length === (DR.DUP_TRACE_CAP || 50) && tr2[0].id === 'w10', '§1 r3 F …bounded: the newest DUP_TRACE_CAP (50) entries', tr2 && tr2.length);
  // r3 G — A WRITE NEVER MAKES A RECORD'S CHAINS DISAGREE (chainsAgree)
  const CA = DR.chainsAgree || (() => ({ ok: true, rows: [] }));
  const G = ['h', 's', 'g'], ch = (tabs) => ({ tabs, active: 0, layout: 'tabs', order: tabs });
  const rowsOf = (host, guest) => [{ winId: 'h', tabChain: ch(host) }, { winId: 's', tabChain: ch(guest), isTabGuest: true }, { winId: 'g', tabChain: ch(host), isTabGuest: true }];
  const bad = CA(rowsOf(['h', 'g'], G), rowsOf(G, G));
  leg(!bad.ok && bad.reason === 'chain-disagrees' && J(bad.rows) === J(['s']), '§1 r3 G chainsAgree: the r2 re-send — host [h, g] beside the copy\'s guest row [h, s, g] — DISAGREES (reason \'chain-disagrees\', the row named)', bad);
  const lone = CA([{ winId: 'h', tabChain: ch(G) }, { winId: 'g' }], []);
  leg(!lone.ok && J(lone.rows) === J(['h']), '§1 r3 G …a row naming a member whose own row carries NO chain disagrees too', lone);
  leg(CA(rowsOf(G, G), []).ok && CA([{ winId: 'h', tabChain: ch(G) }, { winId: 'g', tabChain: ch(G), isTabGuest: true }], []).ok, '§1 r3 G …rows that agree pass, and so does a member the record does not hold (a chain still waiting for it — never a disagreement)');
  leg(CA(rowsOf(['h', 'g'], G), rowsOf(['h', 'g'], G)).ok, '§1 r3 G …a disagreement ALREADY STORED is the record\'s — carried (a write never fixes what its page did not build): only a disagreement the write introduces is one');
  return failed;
}
await section('§1 PURE (src/lib/desktop-record.js)', async () => { pureLegs(require(MODEL)); });

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
async function hubLegs(WSH, { quiet = false } = {}) {
  const failed = [];
  const leg = (c, n, extra) => { if (!quiet) ok(c, n, extra); if (!c) failed.push(n); return !!c; };
  const vWrite = (evidence, sentAt, o = {}) => ({ type: 'layout-sync', desktopId: 'desk-v', state: { windows: TRIPLE()['desk-v'].filter((w) => w.winId !== 'win-v-s'), grid: null, ...(o.state || {}) }, evidence, base: 1000, sentAt, viewport: 'desktop' });
  {
    const H = hub(WSH, DOC(TRIPLE())), P = H.connect();
    await P.send(vWrite([{ id: 'win-v-s', why: 'dup', by: 'win-x-s' }], 1));
    leg(acks(P).length === 1 && !refusals(P).length && J(ids(H.layouts().desktops['desk-v'].autoSave.windows)) === J(['v-1', 'v-2', 'v-3', 'win-v-t']), '§2 THE REAL HANDLER: V\'s write dropping its copy of S as {why:\'dup\', by: X\'s window} is ACCEPTED — V 5 → 4, the record converges', { frames: P.frames.map((f) => f.type), v: ids(H.layouts().desktops['desk-v'].autoSave.windows) });
    leg(H.logs.some((l) => /\[layout-sync\] desktop desk-v: 1 duplicate window\(s\) left — each conversation stays in the window that shows it \(win-v-s → win-x-s\)/.test(l)), '§2 …the journal names the copy and the window that shows its conversation', H.logs.filter((l) => /layout-sync/.test(l)));
  }
  for (const [label, ev] of [['today\'s \'unbuilt\'', [{ id: 'win-v-s', why: 'unbuilt' }]], ['a `by` that shows nothing of S', [{ id: 'win-v-s', why: 'dup', by: 'x-1' }]]]) {
    const H = hub(WSH, DOC(TRIPLE())), P = H.connect();
    await P.send(vWrite(ev, 2));
    leg(refusals(P).length === 1 && J(refusals(P)[0].unexplained) === J(['win-v-s']) && H.writes() === 0, `§2 CONTROL: the same drop with ${label} is REFUSED (nothing written)`, P.frames.map((f) => f.type));
  }
  // r2 — DEDUP NEVER REMOVES A WINDOW SOMEONE IS LOOKING AT, on the real handler: another socket has S attached (`session.clients`)
  {
    const H = hub(WSH, DOC(TRIPLE())), P = H.connect(), Q = H.connect();
    H.attach(P, S); H.attach(Q, S); // P shows S on X, Q shows S somewhere (its attach)
    await P.send(vWrite([{ id: 'win-v-s', why: 'dup', by: 'win-x-s' }], 700));
    leg(refusals(P).length === 1 && J(refusals(P)[0].unexplained) === J(['win-v-s']) && H.writes() === 0 && H.logs.some((l) => /1 offered as a duplicate while another page shows its conversation — kept/.test(l)), '§2 r2: V\'s valid duplicate is REFUSED while ANOTHER client has its session attached — nothing written (that page may be showing win-v-s), the journal says why', { frames: P.frames.map((f) => f.type), log: H.logs.filter((l) => /REFUSED/.test(l)) });
    const H2 = hub(WSH, DOC(TRIPLE())), P2 = H2.connect(), Q2 = H2.connect();
    H2.attach(P2, S); H2.attach(Q2, S); H2.hangUp(Q2); // the other page's socket closed (its close handler ran) — the hub hears no page there
    await P2.send(vWrite([{ id: 'win-v-s', why: 'dup', by: 'win-x-s' }], 701));
    leg(acks(P2).length === 1 && !ids(H2.layouts().desktops['desk-v'].autoSave.windows).includes('win-v-s'), '§2 r2: …the proposer\'s OWN attach never counts, and once no other page shows S the copy leaves (accepted — r3: TRACED, below; the page that comes back keeps what it shows)', P2.frames.map((f) => f.type));
  }
  // r3 F — THE DEDUP TRACE: an accepted copy is traced beside its record (layouts.json — persisted), relayed, forgotten when listed again
  {
    const H = hub(WSH, DOC(TRIPLE())), P = H.connect(), R = H.connect();
    await P.send(vWrite([{ id: 'win-v-s', why: 'dup', by: 'win-x-s' }], 801));
    const tr = H.layouts().desktops['desk-v'].dupsLeft || [];
    const relay = R.frames.find((f) => f.type === 'layout-sync' && f.desktopId === 'desk-v');
    leg(acks(P).length === 1 && tr.length === 1 && tr[0].id === 'win-v-s' && tr[0].by === 'win-x-s' && relay && J(relay.dupsLeft) === J(tr), '§2 r3 F THE DEDUP TRACE: the accepted copy is traced beside V\'s record ({id, by, at} in layouts.json — on disk) and the relay to every other page carries it', { tr, relay: relay && relay.dupsLeft });
    await P.send({ ...vWrite([], 802), state: { windows: TRIPLE()['desk-v'], grid: null } }); // a page that shows win-v-s lists it again
    leg(acks(P).length === 2 && !('dupsLeft' in H.layouts().desktops['desk-v']), '§2 r3 F …a write that lists the id again takes it out of the trace (the hub learned it is shown)', Object.keys(H.layouts().desktops['desk-v']));
  }
  // r3 G — A WRITE NEVER MAKES A RECORD'S CHAINS DISAGREE, on the real handler
  {
    const G = ['v-h', 'win-v-s', 'v-g'];
    const rows = (host, guest) => [member(files('v-h', 0), host), member(chat('win-v-s', S, 1), guest), member(files('v-g', 2), host)];
    const w = (sentAt, r) => ({ type: 'layout-sync', desktopId: 'desk-v', state: { windows: r, grid: null }, evidence: [], base: 1000, sentAt, viewport: 'desktop' });
    const H = hub(WSH, DOC({ ...TRIPLE(), 'desk-v': rows(G, G) })), P = H.connect();
    await P.send(w(901, rows(['v-h', 'v-g'], G)));
    const f = refusals(P)[0];
    leg(f && f.reason === 'chain-disagrees' && J(f.windows) === J(['win-v-s']) && H.writes() === 0 && J(Object.keys(f).sort()) === J(['desktopId', 'reason', 'sentAt', 'state', 'type', 'windows']), '§2 r3 G: the r2 re-send (host [v-h, v-g] beside the copy\'s guest row [v-h, win-v-s, v-g]) is REFUSED \'chain-disagrees\' — nothing written, the rows named, the record kept (ab1226ff2: accepted; every page ungrouped the copy)', P.frames);
    leg(H.logs.some((l) => /REFUSED a record of desktop "Desk V" \(desk-v\): its rows disagree about a tab group \(win-v-s/.test(l)), '§2 r3 G …the journal names the rows', H.logs.filter((l) => /REFUSED/.test(l)));
    await P.send(w(902, rows(['v-h', 'v-g'], G)));
    leg(refusals(P).length === 1, '§2 r3 G …a repeat within 10 s is never answered (law C)', refusals(P).length);
    const H2 = hub(WSH, DOC({ ...TRIPLE(), 'desk-v': rows(['v-h', 'v-g'], G) })), P2 = H2.connect();
    await P2.send(w(903, rows(['v-h', 'v-g'], G)));
    leg(acks(P2).length === 1, '§2 r3 G …a disagreement already STORED is carried by a write that does not add one (a page never fixes what it did not build)', P2.frames.map((x) => x.type));
  }
  // C — THE SERVER NEVER ANSWERS A STORM
  {
    const H = hub(WSH, DOC(TRIPLE())), P = H.connect(), Q = H.connect();
    for (let i = 0; i < 50; i++) await P.send(vWrite([{ id: 'win-v-s', why: 'unbuilt' }], 100 + i));
    const refusedLines = H.logs.filter((l) => /\[layout-sync\] REFUSED a record of desktop "Desk V"/.test(l));
    leg(refusals(P).length === 1 && refusedLines.length === 1 && H.tele.filter((e) => e.name === 'layout-sync-refused').length === 1 && H.writes() === 0, '§2 C: 50 identical refused records from one client ⇒ ONE refusal frame, ONE refusal line, ONE telemetry count (2.369.374: 50 of each)', { refusals: refusals(P).length, lines: refusedLines.length });
    leg(!H.logs.some((l) => /STORM/.test(l)), '§2 C: …no line per repeat while the storm runs', H.logs.filter((l) => /STORM/.test(l)));
    await Q.send(vWrite([{ id: 'win-v-s', why: 'unbuilt' }], 400));
    leg(refusals(Q).length === 1, '§2 C: …another client sending the same record has its own memory (answered)');
    await P.send(vWrite([{ id: 'win-v-s', why: 'dup', by: 'win-x-s' }], 300));
    const storm = H.logs.filter((l) => /\[layout-sync\] STORM: client #\d+ re-sent a record of desktop "Desk V" \(desk-v\) that was refused for the same reason 49 more time\(s\) in [\d.]+ s — not answered/.test(l));
    leg(acks(P).length === 1 && storm.length === 1 && H.tele.some((e) => e.name === 'layout-sync-storm' && e.detail === '49'), '§2 C: a CHANGED record is judged afresh (here accepted) and the storm is said ONCE — client, desktop, count 49; telemetry layout-sync-storm', { storm, tele: H.tele.filter((e) => /storm/.test(e.name)) });
    leg(H.logs.filter((l) => /STORM/.test(l)).length === 1, '§2 C: …exactly one storm line');
  }
  {
    const H = hub(WSH, DOC(TRIPLE())), P = H.connect();
    for (let i = 0; i < 3; i++) await P.send(vWrite([{ id: 'win-v-s', why: 'unbuilt' }], 500 + i));
    await P.send({ ...vWrite([{ id: 'win-v-s', why: 'unbuilt' }], 510), state: { windows: TRIPLE()['desk-v'], grid: null } });
    leg(acks(P).length === 1 && H.logs.filter((l) => /STORM: .* 2 more time\(s\)/.test(l)).length === 1, '§2 C: an ACCEPTED write of the desktop ends the client\'s storm (said once, count 2)', H.logs.filter((l) => /STORM|REFUSED/.test(l)));
  }
  return failed;
}
await section('§2 THE REAL ws-handler — A (the duplicate explained across desktops) and C (the storm never answered)', async () => { await hubLegs(loadHandler()); });

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
async function toastLegs({ DM = RealDM, LM = RealLM, quiet = false } = {}) {
  const failed = [];
  const leg = (c, n, extra) => { if (!quiet) ok(c, n, extra); if (!c) failed.push(n); return !!c; };
  const W = world({ records: TRIPLE(), active: 'desk-x', DM, LM });
  const t0 = made.length;
  const kept = { windows: TRIPLE()['desk-v'], updatedAt: 1000 };
  const refuse = (k) => { for (const h of W.handlers) h({ type: 'layout-sync-refused', desktopId: 'desk-v', reason: 'shrink-without-close', unexplained: ['win-v-s', 'v-' + k], arrived: [], state: kept, sentAt: null }); };
  for (let k = 1; k <= 3; k++) { refuse(k); await tick(5); }
  const warn = toasts(t0);
  leg(warn.length === 1, `§4 D ONE TOAST PER CAUSE: three refusals of one desktop and reason inside 30 s ⇒ ONE toast (2.369.374: one per refusal) — here ${warn.length}`, warn.map(toastText));
  leg(warn.length && /“Atlas notes”/.test(toastText(warn[0])) && /“Desk V”/.test(toastText(warn[0])) && !/\d+ windows/.test(toastText(warn[0])), '§4 D …it NAMES the windows the server kept (their names, not a count) and the desktop', warn.map(toastText));
  W.dm._refusalToasts.get('desk-v|shrink-without-close').at -= 31000; // 31 s later
  refuse(4);
  const after = toasts(t0);
  leg(after.length === 2 && /refused 3 times/.test(toastText(after[1])), '§4 D …the next one after 30 s carries the count of the ones not shown («refused 3 times»)', after.map(toastText));
  return failed;
}
await section('§4 D — ONE TOAST PER CAUSE (the real DesktopManager.onSyncRefused)', async () => { await toastLegs(); });

await section('§6 MUTANTS — each fix removed turns its own legs RED', async () => {
  const M = mutantCopies('ldup', REPO);
  const PSRC = read('src/lib/desktop-record.js'), DSRC = read('src/lib/desktop-manager.js');
  // A's by-check dropped: any 'dup' is explained
  {
    const find = "    if (ev.has(id) && why.get(id) === 'dup') { const seen = !!(sid && showing(sid, id)); if (!seen && shownBy(sid, id, byOf.get(id), nextList, elsewhere)) continue; unexplained.push(id); dup.push(id); if (seen) shown.push(id); continue; }";
    ok(PSRC.includes(find), 'mutant A-no-by-check: the patched line exists in desktop-record.js');
    const Mx = M.load('src/lib/desktop-record.js', PSRC.replace(find, "    if (ev.has(id) && why.get(id) === 'dup') continue;"), 'a-no-by-check');
    const f = pureLegs(Mx, { quiet: true }), h = await hubLegs(loadHandler({ shrinkVerdict: Mx.shrinkVerdict }), { quiet: true });
    ok(f.some((n) => /CONTROL: a 'dup' whose `by` shows nothing/.test(n)) && h.some((n) => /CONTROL: the same drop with a `by` that shows nothing of S/.test(n)), `mutant A-no-by-check: a duplicate taken on the page's word drops a window nothing shows — RED (${f.length}/${h.length})`);
  }
  // r2 A: the hub's `showing` dropped (the r1 verdict: a copy leaves on any page's word)
  {
    const h = await hubLegs(loadHandler({ shrinkVerdict: (a) => require(MODEL).shrinkVerdict({ ...a, showing: () => false }) }), { quiet: true });
    ok(h.some((n) => /r2: V's valid duplicate is REFUSED while ANOTHER client/.test(n)), `mutant A-no-showing (b3a058eb2's verdict): the copy another page shows is written away — RED (${h.length})`);
  }
  // C's storm guard removed (every refusal answered)
  {
    const h = await hubLegs(loadHandler({ refusalStorm: () => ({ answer: true, ended: null }) }), { quiet: true });
    ok(h.some((n) => /50 identical refused records from one client ⇒ ONE refusal frame/.test(n)), `mutant C-no-storm-guard: 50 refusals answered, 50 journal lines — RED (${h.length})`);
  }
  // D's dedup removed (a toast per refusal)
  {
    const find = '    if (s && now - s.at < REFUSAL_TOAST_MS) { s.count++; return false; }';
    ok(DSRC.includes(find), 'mutant D-no-dedup: the patched line exists in desktop-manager.js');
    const DMx = (await import(pathToFileURL(M.write('src/lib/desktop-manager.js', DSRC.replace(find, ''), 'd-no-dedup', { esm: true })).href)).DesktopManager;
    const f = await toastLegs({ DM: DMx, quiet: true });
    ok(f.some((n) => /ONE TOAST PER CAUSE: three refusals/.test(n)), `mutant D-no-dedup: a warn per refusal — RED (${f.length})`);
  }
  // r3: F's trace never written, G's chain gate removed (the handler), G's verdict blind (PURE)
  {
    const tr = await hubLegs(loadHandler({ noteDupsLeft: () => [] }), { quiet: true });
    ok(tr.some((n) => /THE DEDUP TRACE/.test(n)), `mutant r3-F-no-trace: no trace on disk, none on the relay — RED (${tr.length})`);
    const cg = await hubLegs(loadHandler({ chainsAgree: () => ({ ok: true, rows: [] }) }), { quiet: true });
    ok(cg.some((n) => /is REFUSED 'chain-disagrees'/.test(n)), `mutant r3-G-no-chain-gate (ab1226ff2's handler): the inconsistent re-send is written — RED (${cg.length})`);
    const find = "    if (w.tabChain.tabs.some((m) => String(m) !== id && rows.has(String(m)) && members(rows.get(String(m))) !== mine)) out.push(id);";
    ok(PSRC.includes(find), 'mutant r3-G-blind-verdict: the patched line exists in desktop-record.js');
    const Mx = M.load('src/lib/desktop-record.js', PSRC.replace(find, ''), 'r3-g-blind');
    const p = pureLegs(Mx, { quiet: true });
    ok(p.some((n) => /chainsAgree: the r2 re-send/.test(n)) && p.some((n) => /NO chain disagrees too/.test(n)), `mutant r3-G-blind-verdict: chainsAgree sees no disagreement — RED (${p.length})`);
  }
  for (const r of copiesCensus(M.files, M.dir, REPO, { minCopies: 2, label: '§6 ' })) ok(r.pass, r.name, r.detail);
});


console.log(`\n${fail ? 'FAIL' : 'ALL PASS'} (${pass} passed, ${fail} failed)`);
process.exit(fail ? 1 : 0);

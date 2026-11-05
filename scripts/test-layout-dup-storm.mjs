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
//   §PR (lane phone-resume-keeps-layout, userW 2026-11-05 — after a hub restart his PHONE's «Resume all» minted a new window per
//      stopped conversation, the desktops' rows were retired for them and eleven desktops were written with no box): (a) a phone's
//      resume-all re-opens each held row AS ITSELF (the same ids, boxes, z; nothing closed, nothing minted; said once), (a2) a card's
//      resume of a row on another desktop goes there, (b) the survivor of a dedup / a replaced row keeps the position, (c) a phone's
//      capture writes the rows it was given, (d) the hub refuses positions dropped without a move (`unplaced`) and the page says it
//      once, LAW 2: a row with no position is drawn (placeholders + the count); §6 PR: four mutants, each RED
import { REPO, LIB, read, J, tick, made, mkEl, toasts, toastText, S, T, CID, GB, chat, files, DESKS, TRIPLE, SINGLE, DOC, ids, sessionEntries, MODEL, loadHandler, hub, refusals, acks, RealDM, RealLM, world, switchTo, loadLifecycle, loadWs, pageOn, press } from './layout-dup-world.mjs';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
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
  // r4 M — NEVER CUT BY COUNT: an entry leaves when its id is listed again, by a person's act, or when its conversation ends
  const tr2 = ND(Array.from({ length: 60 }, (_, i) => ({ id: 'w' + i, by: 'b', sid: 's' + i, at: i })), { left: [{ id: 'w60', by: 'b', sid: 's60' }], listed: [], alive: () => true, at: 99 });
  leg(Array.isArray(tr2) && tr2.length === 61 && tr2[0].id === 'w0' && tr2[60].id === 'w60', '§1 r4 M noteDupsLeft: the trace is NEVER cut by count — 60 entries and one more ⇒ 61, the oldest kept (36bd0c866: the newest 50)', tr2 && tr2.length);
  const tr3 = ND([{ id: 'a', by: 'b', sid: 'dead', at: 1 }, { id: 'c', by: 'd', sid: 'live', at: 2 }, { id: 'e', by: 'f', at: 3 }], { left: [{ id: 'g', by: 'h', sid: 'dead' }], listed: [], alive: (sid) => sid === 'live', at: 9 });
  leg(J(tr3) === J([{ id: 'c', by: 'd', sid: 'live', at: 2 }, { id: 'e', by: 'f', at: 3 }]), '§1 r4 M …an entry whose conversation ENDED leaves it (the hub\'s live-session set) — and never enters; one with no conversation named (an r3 trace) is judged by the other rules alone', tr3);
  // r4 K — A PERSON'S ACT LEAVES THE TRACE in that same write; only a 'dup' drop enters it
  const tr4 = ND([{ id: 'a', by: 'b', sid: 's', at: 1 }, { id: 'c', by: 'd', sid: 's', at: 2 }], { left: [{ id: 'e', by: 'f', sid: 's' }], gone: ['a', 'e'], listed: [], at: 9 });
  leg(J(tr4) === J([{ id: 'c', by: 'd', sid: 's', at: 2 }]), '§1 r4 K noteDupsLeft: a window `gone` names (the write says a person closed / moved / replaced it) leaves the trace, and never enters it — a person\'s close is never undone by another page\'s keep', tr4);
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
// r4 J / I — THE INVERSE OF withoutMembers (chain-layout withMembersBack): a kept window given back its place in its group
await section('§1 r4 PURE (src/lib/chain-layout.js withMembersBack)', async () => {
  const CL = await import(pathToFileURL(path.join(LIB, 'chain-layout.js')).href);
  const B = CL.withMembersBack || (() => null), W = CL.withoutMembers, K = CL.chainSyncKey; // 36bd0c866 has none: each leg RED by its name
  const was = { tabs: ['v-h', 'win-v-s', 'v-g'], active: 1, layout: 'tabs', order: ['v-h', 'win-v-s', 'v-g'] };
  ok(J(B(W(was, ['win-v-s']), was, ['win-v-s'])) === J(was), '§1 r4 J withMembersBack: a group read without a member and given it back is the group it WAS — its tabs, its strip order, its active tab (the kept window in front stays in front)', B(W(was, ['win-v-s']), was, ['win-v-s']));
  const shown = B({ tabs: ['v-h', 'v-g'], active: 1, layout: 'tabs', order: ['v-h', 'v-g'] }, { ...was, active: 0 }, ['win-v-s']);
  ok(shown && K(shown) === K(was) && shown.tabs[shown.active] === 'v-g', '§1 r4 I …the page shows another tab of the group meanwhile: the group as it was, that tab in front', shown);
  const merged = B({ tabs: ['v-h', 'v-g', 't'], active: 0, layout: 'tabs', order: ['v-h', 'v-g', 't'] }, was, ['win-v-s']);
  ok(merged && J(merged.tabs) === J(['v-h', 'win-v-s', 'v-g', 't']) && J(merged.order) === J(['v-h', 'win-v-s', 'v-g', 't']) && merged.tabs[merged.active] === 'v-h', '§1 r4 I …the person changed the group (merged t in): the kept member goes back after its nearest earlier member — in the membership and the strip — and the shown tab stays', merged);
  const two = { tabs: ['v-h', 'k'], active: 0, layout: 'tabs', order: ['v-h', 'k'] };
  ok(J(B(null, two, ['k'])) === J(two) && B(null, was, ['win-v-s']) === null, '§1 r4 I …a two-tab group read without one has no group left: given back, it is the group again; a bigger group someone took apart meanwhile is not re-made (null — the kept window stands alone)', [B(null, two, ['k']), B(null, was, ['win-v-s'])]);
  const sp = { tabs: ['a', 'k', 'b', 'c'], active: 0, layout: 'split', order: ['a', 'k', 'b', 'c'], split: { pair: ['a', 'b'], ratio: 0.4, dir: 'row', left: ['a', 'k'], right: ['b', 'c'] } };
  const spb = B({ ...W(sp, ['k']), split: { ...W(sp, ['k']).split, ratio: 0.6 } }, sp, ['k']);
  ok(spb && K(spb) === K(sp) && spb.split.ratio === 0.6 && J(spb.split.left) === J(['a', 'k']), '§1 r4 J …a SPLIT given its member back: the same sides and pair (the same key), the ratio the record holds now', spb);
  ok(J(B(was, was, ['win-v-s'])) === J(CL.normalizeChain(CL.cloneChain(was))) && J(B(W(was, ['win-v-s']), was, ['zz'])) === J(W(was, ['win-v-s'])), '§1 r4 …an id the chain already holds, or one `was` never named, changes nothing');
});

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
/** r5 N on the real handler (its own function: the r5-N-live-set mutant runs these alone). → failed names. */
async function hubNLegs(WSH, { quiet = false } = {}) {
  const failed = [];
  const leg = (c, n, extra) => { if (!quiet) ok(c, n, extra); if (!c) failed.push(n); return !!c; };
  const vWrite = (evidence, sentAt, o = {}) => ({ type: 'layout-sync', desktopId: 'desk-v', state: { windows: TRIPLE()['desk-v'].filter((w) => w.winId !== 'win-v-s'), grid: null, ...(o.state || {}) }, evidence, base: 1000, sentAt, viewport: 'desktop' });
  // r5 N — ALIVE FOR THE TRACE MEANS «A WINDOW CAN STILL SHOW IT» (the r4 acceptance's q4: the trace forgot every conversation
  // missing from the live-session set): a conversation that STOPPED (its CLI exited — every page keeps its window as read-only
  // history) stays traced through every write; only its END (the real kill case — the hub's end seam) takes it out, at once; a
  // hub that has not adopted it yet (a restart) sheds nothing
  const traced = (Hx) => ((Hx.layouts().desktops['desk-v'] || {}).dupsLeft || []).some((e) => e.id === 'win-v-s' && e.sid === S);
  const later = (Hx, sentAt) => ({ ...vWrite([], sentAt), base: Hx.layouts().desktops['desk-v'].autoSave.updatedAt, state: { windows: TRIPLE()['desk-v'].filter((w) => w.winId !== 'win-v-s'), grid: null, theme: 'light' } });
  const H2 = hub(WSH, DOC(TRIPLE())), P2 = H2.connect();
  await P2.send(vWrite([{ id: 'win-v-s', why: 'dup', by: 'win-x-s' }], 1201));
  H2.stop(S); // its CLI exited: the live-session set lost it (session-stdout's exit path)
  await P2.send(later(H2, 1202));
  leg(acks(P2).length === 2 && traced(H2), '§2 r5 N: a STOPPED conversation stays traced through the next write of its desktop — its window is read-only history a page still shows (4ad07d751: dropped at that write, and the page that showed it closed it)', H2.layouts().desktops['desk-v'].dupsLeft);
  const H3 = hub(WSH, DOC(TRIPLE())), P3 = H3.connect();
  await P3.send(vWrite([{ id: 'win-v-s', why: 'dup', by: 'win-x-s' }], 1301));
  const w3 = H3.writes(), k = await H3.kill(S);
  leg(k && k.ok === true && traced(H3) === false && !('dupsLeft' in H3.layouts().desktops['desk-v']) && H3.writes() === w3 + 1, '§2 r5 N: …its END — the real kill case, the hub\'s end seam — takes it out of every desktop\'s trace at once (one write; no write of the desktop needed)', { k, writes: H3.writes() - w3, tr: H3.layouts().desktops['desk-v'].dupsLeft });
  await P3.send({ ...vWrite([{ id: 'win-v-s', why: 'dup', by: 'win-x-s' }], 1302), base: H3.layouts().desktops['desk-v'].autoSave.updatedAt, state: { windows: TRIPLE()['desk-v'].filter((w) => w.winId !== 'win-v-s'), grid: null, theme: 'dark' } });
  leg(!traced(H3), '§2 r5 N: …and a later write that lets a copy of the ENDED conversation go never traces it (nothing can show it any more)', H3.layouts().desktops['desk-v'].dupsLeft);
  const dd = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-ldup-n-')), file = path.join(dd, 'layouts.json');
  const H4 = hub(WSH, DOC(TRIPLE()), { file }), P4 = H4.connect();
  await P4.send(vWrite([{ id: 'win-v-s', why: 'dup', by: 'win-x-s' }], 1401));
  const H5 = hub(WSH, null, { file, alive: [] }), P5 = H5.connect(); // a NEW process over the same data/: nothing adopted yet (R6 pipe sessions, readopted keepers)
  await P5.send(later(H5, 1402));
  const before = traced(H5);
  H5.adopt(S);
  leg(acks(P5).length === 1 && before && traced(H5), '§2 r5 N: …and a hub that has not ADOPTED the conversation yet (after a restart) sheds nothing at a write — an absence the hub has not confirmed never shrinks the trace', H5.layouts().desktops['desk-v'].dupsLeft);
  fs.rmSync(dd, { recursive: true, force: true });
  return failed;
}
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
  // r4 K / M on the real handler: the entry names its conversation; a write that says a PERSON closed (moved, replaced) the traced
  // window takes it out of the trace in that same write; an entry whose conversation ENDED leaves at the next write
  {
    const H = hub(WSH, DOC(TRIPLE())), P = H.connect();
    const base = () => H.layouts().desktops['desk-v'].autoSave.updatedAt;
    await P.send(vWrite([{ id: 'win-v-s', why: 'dup', by: 'win-x-s' }], 1101));
    const tr = H.layouts().desktops['desk-v'].dupsLeft || [];
    leg(acks(P).length === 1 && tr.length === 1 && tr[0].id === 'win-v-s' && tr[0].sid === S, '§2 r4 M: the traced copy names its conversation ({id, by, sid, at} — the hub judges an entry by its conversation, never by count)', tr);
    await P.send({ ...vWrite([{ id: 'win-v-s', why: 'closed' }], 1102), base: base() });
    leg(acks(P).length === 2 && !('dupsLeft' in H.layouts().desktops['desk-v']), '§2 r4 K: a write whose evidence says a PERSON CLOSED the traced window (a page that kept it) takes it out of the trace in that same write — no other page\'s keep undoes the close (36bd0c866: the trace kept it)', H.layouts().desktops['desk-v'].dupsLeft);
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
await section('§2 THE REAL ws-handler — A (the duplicate explained across desktops) and C (the storm never answered)', async () => { await hubLegs(loadHandler()); await hubNLegs(loadHandler()); });

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
/** r4 K — THE TRACE IS A FACT ABOUT THE RECORD, on the real src/routes/persistence.js (a temp data dir): writeLayouts is THE CHOKE
 *  POINT every road to layouts.json goes through; the one-desktop restore (the acceptance's probe 5: it spread the current
 *  desktops[id], trace included) and the whole restore leave no trace naming a window the record lists. `P` = the module (a mutant's). */
async function persistLegs(P, { quiet = false } = {}) {
  const failed = [];
  const leg = (c, n, extra) => { if (!quiet) ok(c, n, extra); if (!c) failed.push(n); return !!c; };
  const dd = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-ldup-k-'));
  try {
    P.setup({ dataDir: dd, wss: { clients: new Set() }, WS_OPEN: 1, getSyncStore: () => null, activeSessions: new Map(), auth: null });
    const R = P.router, Wl = R.writeLayouts;
    const route = R.stack.find((l) => l.route && l.route.path === '/api/layout-history/:id/restore').route.stack[0];
    const sink = { json: () => {}, status: () => ({ json: () => {} }) };
    const traceV = () => R.readLayouts().desktops['desk-v'].dupsLeft || [];
    const listsV = () => ids(R.readLayouts().desktops['desk-v'].autoSave.windows);
    Wl(DOC(SINGLE())); await tick(5);
    // the layout-sync handler's accepted dedup: V without its copy, the trace beside it
    const d2 = JSON.parse(J(R.readLayouts())); d2.desktops['desk-v'].autoSave.windows = d2.desktops['desk-v'].autoSave.windows.filter((w) => w.winId !== 'win-v-s'); d2.desktops['desk-v'].dupsLeft = [{ id: 'win-v-s', by: 'win-x-s', sid: S, at: 1 }];
    Wl(d2); await tick(5);
    const point = R.listLayoutHistory().find((h) => { try { return JSON.parse(fs.readFileSync(path.join(dd, 'layout-history', h.id), 'utf8')).layouts.desktops['desk-v'].autoSave.windows.some((w) => w.winId === 'win-v-s'); } catch { return false; } });
    leg(traceV().length === 1 && !listsV().includes('win-v-s') && !!point, '§2b r4 K: the trace rides a write that does not list its id (the dedup stands), and a rollback point before the dedup exists', { trace: traceV(), v: listsV(), point: point && point.id });
    await route.handle({ params: { id: point.id }, body: { desktopId: 'desk-v' } }, sink); await tick(5);
    leg(listsV().includes('win-v-s') && !traceV().some((e) => e.id === 'win-v-s'), '§2b r4 K: THE ONE-DESKTOP RESTORE to the point before the dedup lists the copy again — and the trace no longer names it (36bd0c866: `{ ...desktops[only], autoSave }` carried the trace over; another page\'s keep then undid a person\'s close)', { v: listsV(), trace: traceV() });
    Wl(d2); await tick(5);
    await route.handle({ params: { id: point.id } }, sink); await tick(5);
    leg(listsV().includes('win-v-s') && !traceV().some((e) => e.id === 'win-v-s'), '§2b r4 K: …the WHOLE restore too (the point\'s own document)', { v: listsV(), trace: traceV() });
    const d3 = JSON.parse(J(R.readLayouts())); d3.desktops['desk-v'].dupsLeft = [{ id: 'win-v-s', by: 'win-x-s', at: 1 }, { id: 'gone-1', by: 'win-x-s', at: 2 }];
    Wl(d3); await tick(5);
    leg(J(traceV().map((e) => e.id)) === J(['gone-1']), '§2b r4 K: …and ANY write through writeLayouts (an import, a preset, a migration\'s) — the trace keeps only ids the record does not list', traceV());
  } finally { fs.rmSync(dd, { recursive: true, force: true }); }
  return failed;
}
const PERSIST = path.join(REPO, 'src/routes/persistence.js');
await section('§2b r4 K — THE TRACE IS A FACT ABOUT THE RECORD (the real persistence.js: THE CHOKE POINT, the restores) + the writers census', async () => {
  delete require.cache[require.resolve(PERSIST)];
  await persistLegs(require(PERSIST));
  // THE WRITERS CENSUS: every road that writes a desktop record — each a row, or the reason it cannot list a traced id
  const src = (f) => read(f);
  const PS = src('src/routes/persistence.js'), WS = src('src/ws-handler.js'), SV = src('server.js');
  const body = (t, name) => { const i = t.indexOf('function ' + name + '('); return i < 0 ? '' : t.slice(i, t.indexOf('\n  }\n', i)); };
  ok(/tracesTrue\(data\);/.test(body(PS, 'writeLayouts')) && /tracesTrue\(_layoutsCache\)/.test(body(PS, 'readLayouts')), '§2b census: writeLayouts (THE CHOKE POINT) and the first read of the file keep every trace true to its record (tracesTrue)');
  ok((PS.match(/writeJsonAtomic\(LAYOUTS_FILE/g) || []).length === 1 && /writeJsonAtomic\(LAYOUTS_FILE, _layoutsCache\)/.test(body(PS, 'flushLayouts')) && (PS.match(/_layoutsCache = /g) || []).length === 4 && /_layoutsCache = data;/.test(body(PS, 'writeLayouts')), '§2b census: layouts.json is written ONLY by flushLayouts, from the cache — and the cache is set only by its declaration, readLayouts (the disk, ×2) and writeLayouts', (PS.match(/.*_layoutsCache = .*/g) || []).map((l) => l.trim().slice(0, 80)));
  const ROWS = { 'src/routes/persistence.js': [9, 'the presets, the active preset, the custom grids, the autosave slot, the two restores, the import — each through writeLayouts'], 'src/ws-handler.js': [7, 'layout-sync (noteDupsLeft: listed / gone / ended) + the refused newcomers a desktop\'s record remembers (r4 N4 — written at a refusal that adds one; never the record itself) + desktop-create (an empty record) / -delete (the trace goes with it) / -rename / -reorder (no record changes) + the end seam (endTraces — r5 N: a killed conversation leaves every trace) — each through writeLayouts (ctx)'] };
  const counts = Object.fromEntries(Object.keys(ROWS).map((f) => [f, (src(f).match(/\bwriteLayouts\(/g) || []).length - (f === 'src/routes/persistence.js' ? 1 : 0)]));
  ok(Object.entries(ROWS).every(([f, [n]]) => counts[f] === n), `§2b census: every writeLayouts( call is a row (a new writer is RED until it is one) — ${J(counts)}`, ROWS);
  const strays = ['src/server/incident-wiring.js', 'src/server/migrations.js', 'src/server/boot-restore.js'].filter((f) => fs.existsSync(path.join(REPO, f)) && /layouts\.json/.test(src(f)) && /writeFileSync|writeJsonAtomic|renameSync/.test(src(f).split('\n').filter((l) => /layouts/.test(l)).join('\n')));
  ok(!strays.length && /\/home\/\$\{old\}/.test(SV) && /path\.join\(__dirname, 'data', 'layouts\.json'\)/.test(SV), '§2b census: the one other writer of layouts.json is server.js\'s HOME RENAME (/home/<old>/ → /home/<user>/ inside string values) — it rewrites paths only, never a window id or the windows a record lists, so it cannot make a record list a traced id', strays);
});

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

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ROUND 8 (the r7 acceptance's four roads) — the attached-only harness, no wait on the page's own clocks (the 1 s gate's drain, a
// 10 s attach, «bysession» on the real timing: the loop's §13)
const TB0 = await import(pathToFileURL(path.join(LIB, 'taskbar.js')).href), WC = await import(pathToFileURL(path.join(LIB, 'warmth-chrome.js')).href);
/** R1 the reveal's switch is one switch, to one desktop, once; R2 a restore never raises, a copy is never restored; R3 the ⧉ list
 *  never offers a copy, a look that gives up says so; R4 an open on the desktop on show consumes the switch queued before it.
 *  `TB` = the taskbar module (a mutant's). → failed names. */
async function r8Legs({ DM = RealDM, LM = RealLM, install = null, TB = TB0, quiet = false, legs = null } = {}) {
  const failed = [];
  const leg = (c, n, extra) => { if (!quiet) ok(c, n, extra); if (!c) failed.push(n); return !!c; };
  const want = (k) => !legs || legs.includes(k);
  if (!install) return failed;
  const G = ['x-h', 'win-x-s', 'x-slow'];
  const recG = () => ({ 'desk-x': [member(files('x-h', 0), G), member(chat('win-x-s', S, 1), G), member(files('x-slow', 2), G)], 'desk-y': [files('y-1', 0)], 'desk-v': [files('v-1', 0)] });
  const page = (recs, active, { attachMs = 500, never = [] } = {}) => {
    const P = pageOn(hub(loadHandler(), DOC(recs)), install, active, { DM, LM, attachMs });
    const orig = P.app.replayOpenSpec;
    P.app.replayOpenSpec = (spec, winId) => (never.includes(winId) ? null : orig(spec, winId)); // a window whose build never comes
    return P;
  };
  // X on show, S's window standing there in a group still forming (x-slow not built yet: the record's chain waits for it)
  const onShow = () => { const P = page(recG(), 'desk-x'); P.wins.delete('x-slow'); P.lm.queueRecordChains('desk-x', P.dm._savedStates.get('desk-x'), { naming: ['x-slow'] }); return P; };
  const open = (P) => { press('pointerdown'); P.app.attachSession(S, 'Atlas notes', '/srv/u/atlas', { mode: 'chat', backend: 'claude', backendSessionId: CID }); press('pointerup'); };
  const personSwitch = (P, d) => { press('pointerdown'); const p = P.dm.switchTo(d); press('pointerup'); return p; };
  const fronts = (P) => J([...(P.lm._fronts || new Map())]), MARK = J([['desk-x', 'win-x-s']]);
  const sWins = (P) => [...P.wins.values()].filter((w) => w._openSpec && w._openSpec.serverId === S).map((w) => w.id + '@' + w._desktopId);
  const counting = (P) => { const n = { switches: 0 }, own = P.dm.switchTo; P.dm.switchTo = function (d) { n.switches++; return own.call(this, d); }; return n; };
  if (want('R1b')) {
    const P = onShow(), t0 = made.length;
    open(P);
    const marked = fronts(P) === MARK;
    await tick(20);
    P.dm.switchTo('desk-y'); // NO press: a forwarded shortcut's switch, made later
    const f = fronts(P), at = P.dm.activeDesktopId;
    await tick(5); // the hub's quiet wrapper (the switch's save) gives the console back
    leg(marked && f === '[]' && at === 'desk-y' && toasts(t0).length === 0, `§R8 R1b: THE REVEAL'S SWITCH IS ONE SWITCH, TO ONE DESKTOP — the person opens S, whose window stands on X (on show) in a group still forming; later a switch to Y that came from no press (a forwarded shortcut's) is not the reveal's: the mark goes (8bde36a5c: \`_revealing\` held the generation alone — kept, «late-nopress») — marked ${marked}, after the switch fronts ${f}, active ${at}`);
  }
  if (want('R1c')) {
    const P = onShow(), t0 = made.length;
    open(P);
    const marked = fronts(P) === MARK;
    P.dm._onRemoteDesktopUpdated({ desktops: DESKS.filter((d) => d.id !== 'desk-x').map((d) => ({ ...d })) }); // another page deleted X
    const f = fronts(P), at = P.dm.activeDesktopId;
    await tick(5);
    leg(marked && f === '[]' && at === 'desk-y' && toasts(t0).length === 0, `§R8 R1c: …a REMOTE DELETION of the desktop on show after the reveal: its switch (to where X's windows went) is not the reveal's — the mark goes (8bde36a5c: kept) — marked ${marked}, after the deletion fronts ${f}, active ${at}`);
  }
  if (want('R4')) {
    // the page on Y; the person switches to X (S's window built there by the visit, still attaching, in a group still forming), then
    // inside that switch's 1 s gate presses Y's tile (queued), then opens S
    const P = page(recG(), 'desk-y', { never: ['x-slow'] }), t0 = made.length;
    await personSwitch(P, 'desk-x');
    personSwitch(P, 'desk-y');
    const queued = P.dm._pendingSwitch === 'desk-y';
    open(P);
    const pend = P.dm._pendingSwitch, at = P.dm.activeDesktopId, f = fronts(P), foc = P.app.wm.activeWindowId;
    await tick(5);
    leg(queued && pend == null && at === 'desk-x' && f === MARK && foc === 'win-x-s' && toasts(t0).length === 0, `§R8 R4: THE LATEST ACT WINS — the person presses Y inside the 1 s gate (queued), then opens S, whose window stands on X, the desktop on show: the open consumes the queued switch — nothing left for the drain, S marked in front and focused, nothing said (8bde36a5c: Y stayed armed — the drain took the person away from what they had just opened) — queued ${queued}, after the open pending ${pend}, active ${at}, fronts ${f}, focus ${foc}`);
  }
  if (want('R2door')) {
    // S's window attaching on X (the person's open; a slow host: 60 s); the person switches to V; then a MACHINE door reaches S — a
    // restore's attach (layout.js restoreState: `machine`), as a visit, a preset or a boot restore makes it
    const P = page({ 'desk-x': [files('x-1', 0)], 'desk-y': [files('y-1', 0)], 'desk-v': [files('v-1', 0)] }, 'desk-x', { attachMs: 60000 }), t0 = made.length;
    open(P);
    await personSwitch(P, 'desk-v');
    const n = counting(P), gen = P.dm._revealGen, o0 = P.ops.length;
    const r = P.app.attachSession(S, 'Atlas notes', '/srv/u/atlas', { mode: 'chat', backend: 'claude', backendSessionId: CID, machine: true });
    await tick(0);
    const rv = P.ops.slice(o0).filter((o) => o[0] === 'reveal');
    leg(r === null && n.switches === 0 && P.dm._pendingSwitch == null && P.dm.activeDesktopId === 'desk-v' && P.dm._revealGen === gen && rv.length === 1 && rv[0][2] === true && sWins(P).length === 1 && toasts(t0).length === 0, `§R8 R2 (door): A RESTORE NEVER RAISES BEYOND THE WINDOW — S's window still attaching on X, the person on V; a machine door (a restore's attach) reaches S: it only raises that window — no switch asked, no act noted, nothing built, nothing said (8bde36a5c: keepInFront — an act nobody made — and revealWindow's switch back to X) — switches ${n.switches}, pending ${P.dm._pendingSwitch}, generation ${gen}→${P.dm._revealGen}, reveals ${J(rv)}, S windows ${J(sWins(P))}`);
  }
  if (want('R2visit')) {
    const bare = { winId: 'win-v-s', title: 'Atlas notes — /srv/u/atlas', type: 'chat', isMinimized: false, isMaximized: false, gridBounds: GB(1), zIndex: 101, serverSessionId: S, backend: 'claude', backendSessionId: CID, cwd: '/srv/u/atlas' }; // NO openSpec: built by its identity (lane layout-stopped-window)
    const P = page({ 'desk-x': [files('x-1', 0)], 'desk-y': [files('y-1', 0)], 'desk-v': [files('v-1', 0), bare] }, 'desk-x', { attachMs: 60000 }), t0 = made.length;
    P.lm._bootJson = async (u) => (u === '/api/active' ? { sessions: [{ id: S, name: 'Atlas notes', cwd: '/srv/u/atlas', backend: 'claude', backendSessionId: CID, mode: 'chat' }] } : { sessions: [] });
    const restores = [], rs = P.lm.restoreState.bind(P.lm); P.lm.restoreState = (st) => { restores.push(...ids(st && st.windows)); return rs(st); };
    open(P);
    await personSwitch(P, 'desk-v');
    const n = counting(P), gen = P.dm._revealGen;
    await tick(40);
    const ghost = P.dm.copiesOf('desk-v').includes('win-v-s');
    leg(J(restores) === '[]' && n.switches === 0 && P.dm._pendingSwitch == null && P.dm.activeDesktopId === 'desk-v' && P.dm._revealGen === gen && ghost && sWins(P).length === 1 && toasts(t0).length === 0, `§R8 R2 (visit): A COPY IS NEVER RESTORED — S's window still attaching on X; V lists S with no openSpec; the person switches to V: that row is S's copy — a ghost at once, never restored, the person stays on V (8bde36a5c: restored — its attach found the window attaching on X and switched back, «bysession») — restored ${J(restores)}, switches after ${n.switches}, pending ${P.dm._pendingSwitch}, ghost ${ghost}, S windows ${J(sWins(P))}`);
  }
  // the real ⧉ window list (taskbar showWindowList) over the harness page; its «Other desktops» group opened
  const list = (P) => {
    const at = made.length;
    TB.showWindowList(P.app, mkEl('span'));
    const pop = made.slice(at).find((e) => e.className === 'overlap-switcher');
    if (!pop) return null;
    const head = pop.children.find((c) => /overlap-switcher-group/.test(c.className));
    if (head && !/ open/.test(head.className)) head.onclick({ stopPropagation() {} });
    return pop.children.filter((c) => /overlap-switcher-other/.test(c.className));
  };
  if (want('R3list')) {
    const recs = { 'desk-x': [files('x-1', 0), chat('win-x-s', S, 1)], 'desk-y': [files('y-1', 0)], 'desk-v': [files('v-1', 0), chat('win-v-s', S, 1)] };
    const P = page(recs, 'desk-y'), t0 = made.length;
    P.mkWin('x-1', 'desk-x', { _hiddenByDesktop: true }); // X built by an earlier visit: S shown there; V's record still lists a copy
    P.mkWin('win-x-s', 'desk-x', { type: 'chat', title: 'Atlas notes — /srv/u/atlas', _openSpec: recs['desk-x'][1].openSpec, _hiddenByDesktop: true });
    const rows = list(P) || [], got = rows.map((r) => r.dataset.desktopId + ':' + r.dataset.winId), sr = rows.filter((r) => /Atlas notes/.test(r.textContent));
    const n = counting(P);
    press('pointerdown'); if (sr[0]) sr[0].onclick(); press('pointerup');
    await tick(0);
    // the warmth summary's «Every desktop» list (warmthRows): S once, as the built window — safe already, kept so
    P.app._warmth = { drawn: true, byId: new Map([[S, { tier: 'fresh', frac: 0.5, leftMs: 60000 }]]), held: new Map([['win-v-s', { id: S, deskId: 'desk-v', title: 'Atlas notes — /srv/u/atlas', type: 'chat' }]]), heldChains: new Map(), last: null, passMs: 0 };
    const wr = WC.warmthRows(P.app).filter((r) => r.key === S).map((r) => r.deskId + ':' + r.id);
    P.app._warmth = null;
    leg(sr.length === 1 && sr[0].dataset.winId === 'win-x-s' && !got.includes('desk-v:win-v-s') && P.dm.activeDesktopId === 'desk-x' && n.switches === 1 && J(wr) === J(['desk-x:win-x-s']) && toasts(t0).length === 0, `§R8 R3 (list): A ROW IS A WINDOW THIS PAGE CAN SHOW — S shown on X, a copy of it listed on V, the person on Y: the ⧉ list's «Other desktops» names S ONCE, as X's window, and its press goes to X; the warmth «Every desktop» list names S once too (8bde36a5c: V's copy listed «… · Desk V» — its press switched to V, where a copy is never built, nothing said) — rows ${J(got)}, S rows ${sr.length}, after the press active ${P.dm.activeDesktopId} (${n.switches} switch), warmth rows ${J(wr)}`);
  }
  if (want('R3look')) {
    const P = page({ 'desk-x': [files('x-1', 0)], 'desk-y': [files('y-1', 0)], 'desk-v': [files('v-1', 0), files('v-gone', 1)] }, 'desk-y', { never: ['v-gone'] }), t0 = made.length;
    const row = (list(P) || []).find((r) => r.dataset.winId === 'v-gone');
    press('pointerdown'); if (row) row.onclick(); press('pointerup');
    const a = P.dm._buildAttempts.get('v-gone'); if (a) a.at -= 25000; // its build gave no sign of life within the page's grace (BUILD_GRACE_MS)
    await tick(120);
    const said = toasts(t0).map(toastText);
    await tick(150);
    leg(!!row && P.dm.activeDesktopId === 'desk-v' && said.length === 1 && /v-gone\.md/.test(said[0]) && /did not appear/.test(said[0]) && toasts(t0).length === 1 && P.dm._revealAsk === null, `§R8 R3 (look): A LOOK THAT GIVES UP SAYS SO — the ⧉ list's row of a window V's record holds and this page has not built; pressed, the visit builds nothing of it: said ONCE «Could not open “v-gone.md”: its window did not appear» (the deferred reveal's words, r6 R), never on a clock of its own (8bde36a5c: look() polled 20 × 250 ms and stopped in silence) — row ${!!row}, active ${P.dm.activeDesktopId}, toasts ${J(said)} then ${toasts(t0).length}`);
  }
  return failed;
}
const install8 = await loadLifecycle();
await section('§R8 ROUND 8 — the reveal\'s switch is one switch, to one desktop, once (R1); a restore never raises, a copy is never restored (R2); the ⧉ list never offers a copy, a look that gives up says so (R3); the latest act wins (R4)', async () => {
  await r8Legs({ install: install8 });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ROUND 9 (the r8 acceptance's finding) — THE COPY VERDICT NAMES THE CONVERSATION THE RESTORE NAMES: V's row of S named by its
// conversation id alone (S built on X, or still attaching), or by a stale server id beside it; the controls; the two names
// disagreeing either way (the attaching shape on the real timing: the loop's §13 BS′)
const D9 = 'sess-5-41000', DID9 = 'd71a5000-0000-4000-8000-000000000005', STALE9 = 'sess-3-11111';
/** the real ⧉ window list (taskbar showWindowList) over a harness page, its «Other desktops» group opened → {main, other}
 *  (main = the desktop on show's rows, other = the other desktops'), or null when no list opens */
const windowList = (P, TB = TB0) => {
  const at = made.length;
  TB.showWindowList(P.app, mkEl('span'));
  const pop = made.slice(at).find((e) => e.className === 'overlap-switcher');
  if (!pop) return null;
  const head = pop.children.find((c) => /overlap-switcher-group/.test(c.className));
  if (head && !/ open/.test(head.className)) head.onclick({ stopPropagation() {} });
  return { main: pop.children.filter((c) => /overlap-switcher-item/.test(c.className) && !/overlap-switcher-(other|group)/.test(c.className)), other: pop.children.filter((c) => /overlap-switcher-other/.test(c.className)) };
};
/** R9 (a)–(g): each shape of V's row, S's window on X (built — the record's — or (b) the person's open, still attaching) — the ⧉
 *  list opened on X, then the person's visit to V. → failed names. */
async function r9Legs({ DM = RealDM, LM = RealLM, install = null, quiet = false, legs = null } = {}) {
  const failed = [];
  const leg = (c, n, extra) => { if (!quiet) ok(c, n, extra); if (!c) failed.push(n); return !!c; };
  const want = (k) => !legs || legs.includes(k);
  if (!install) return failed;
  // the server's live sessions: S and D (D shown on no desktop of this page) — the page knows them (the sidebar's active-sessions),
  // the restore reads them (/api/active)
  const live = () => [{ id: S, name: 'Atlas notes', cwd: '/srv/u/atlas', backend: 'claude', backendSessionId: CID, mode: 'chat' }, { id: D9, name: 'Dune log', cwd: '/srv/u/dune', backend: 'claude', backendSessionId: DID9, mode: 'chat' }];
  const row = (o) => ({ winId: 'win-v-s', title: 'Atlas notes — /srv/u/atlas', type: 'chat', isMinimized: false, isMaximized: false, gridBounds: GB(1), zIndex: 101, backend: 'claude', cwd: '/srv/u/atlas', ...o }); // NO recipe: built by its identity (lane layout-stopped-window)
  const dune = { title: 'Dune log — /srv/u/dune', cwd: '/srv/u/dune' };
  const SHAPES = {
    a: { row: { backendSessionId: CID }, copy: true, says: 'V lists S by its conversation id ALONE (captureState\'s row while a resume\'s create is in flight — no serverSessionId, no recipe), S BUILT on X' },
    b: { row: { backendSessionId: CID }, copy: true, attaching: true, says: '…the same while S\'s window is still ATTACHING on X (the person\'s open)' },
    c: { row: { backendSessionId: CID, serverSessionId: STALE9 }, copy: true, says: 'V\'s row names S\'s conversation beside a STALE server id' },
    d: { row: { backendSessionId: DID9, ...dune }, copy: false, says: 'CONTROL: V\'s row names D, live and shown on no desktop of this page — a real held window, restored and offered as before' },
    e: { row: { serverSessionId: S }, copy: true, says: 'CONTROL: V\'s row names S by its server id alone (r8\'s shape) — R2/R3 unchanged' },
    f: { row: { backendSessionId: CID, serverSessionId: D9 }, copy: true, says: 'THE TWO NAMES DISAGREE: S\'s conversation id beside D\'s server id — the restore attaches by the conversation id first: S\'s copy' },
    g: { row: { backendSessionId: DID9, serverSessionId: S, ...dune }, copy: false, says: '…the other way: D\'s conversation id beside S\'s server id — the restore attaches D: a real held window of D' },
  };
  const winsOf = (P, sid) => [...P.wins.values()].filter((w) => w._openSpec && w._openSpec.serverId === sid).map((w) => w.id + '@' + w._desktopId);
  for (const [k, sh] of Object.entries(SHAPES)) {
    if (!want(k)) continue;
    const recs = { 'desk-x': sh.attaching ? [files('x-1', 0)] : [files('x-1', 0), chat('win-x-s', S, 1)], 'desk-y': [files('y-1', 0)], 'desk-v': [files('v-1', 0), row(sh.row)] };
    const P = pageOn(hub(loadHandler(), DOC(recs)), install, 'desk-x', { DM, LM, attachMs: 60000 }), t0 = made.length;
    P.app.sidebar._webuiSessions = live();
    P.lm._bootJson = async (u) => (u === '/api/active' ? { sessions: live() } : { sessions: [] });
    if (sh.attaching) { press('pointerdown'); P.app.attachSession(S, 'Atlas notes', '/srv/u/atlas', { mode: 'chat', backend: 'claude', backendSessionId: CID }); press('pointerup'); }
    const L = windowList(P) || { main: [], other: [] }, sRows = [...L.main, ...L.other].filter((r) => /Atlas notes/.test(r.textContent)).length;
    const offered = L.other.some((r) => r.dataset.desktopId === 'desk-v' && r.dataset.winId === 'win-v-s');
    const restores = [], rs = P.lm.restoreState.bind(P.lm); P.lm.restoreState = (st) => { restores.push(...ids(st && st.windows)); return rs(st); };
    press('pointerdown'); const sw = P.dm.switchTo('desk-v'); press('pointerup'); await sw;
    const n = { switches: 0 }, own = P.dm.switchTo; P.dm.switchTo = function (d) { n.switches++; return own.call(this, d); };
    await tick(3);
    const copy = P.dm.copiesOf('desk-v').includes('win-v-s'), sW = winsOf(P, S), dW = winsOf(P, D9), at = P.dm.activeDesktopId, said = toasts(t0).length;
    await tick(3); // the hub's quiet wrapper (the switch's save) gives the console back
    const verdict = sh.copy ? J(restores) === '[]' && copy && !offered && sW.length === 1 && /@desk-x$/.test(sW[0]) && !dW.length
      : J(restores) === J(['win-v-s']) && !copy && offered && J(dW) === J(['win-v-s@desk-v']) && sW.length === 1;
    leg(verdict && sRows === 1 && n.switches === 0 && at === 'desk-v' && said === 0, `§R9 (${k}): ${sh.says} — ${sh.copy ? 'a COPY: the ⧉ list on X names S once (X\'s window) and never offers V\'s row; the visit to V restores nothing of it, the person stays on V, nothing said' : 'NOT a copy: the ⧉ list offers V\'s row; the visit restores it — D\'s window built on V'} — S rows ${sRows}, V's row offered ${offered}, restored ${J(restores)}, copiesOf(V) ${copy}, S windows ${J(sW)}, D windows ${J(dW)}, switches after ${n.switches}, active ${at}, toasts ${said}`);
  }
  return failed;
}
const install9 = await loadLifecycle();
await section('§R9 ROUND 9 — the copy verdict names the conversation the restore names (one resolution: desktop-record liveSessionOf / doorSessionOf)', async () => {
  await r9Legs({ install: install9 });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ROUND 10 (the r9 acceptance's finding) — ONE VERDICT, EVERYWHERE A COPY IS DECIDED: the autosave's first step (normalizeDups →
// duplicatesOf) proposed as S's 'dup' the (g) row the ⧉ list and the visit call D's — the hub took it, D's window was never built.
// Each §R9 shape with an AUTOSAVE BEFORE THE VISIT (the real timing — a person's act, the debounce: the loop's §13 r10 GS);
// loadPreset reads the restore's ladder too
/** R10: V's row in a §R9 shape, S's window built on X; before the visit `norm` (normalizeDups alone) or `save` (the real
 *  _doAutoSave the debounce fires — normalizeDups, then every dirty record sent to the real hub); then the person's visit to V.
 *  `p`: a named preset loaded (the real loadPreset over /api/active). → failed names. */
async function r10Legs({ DM = RealDM, LM = RealLM, install = null, quiet = false, legs = null } = {}) {
  const failed = [];
  const leg = (c, n, extra) => { if (!quiet) ok(c, n, extra); if (!c) failed.push(n); return !!c; };
  const want = (k) => !legs || legs.includes(k);
  if (!install) return failed;
  const live = () => [{ id: S, name: 'Atlas notes', cwd: '/srv/u/atlas', backend: 'claude', backendSessionId: CID, mode: 'chat' }, { id: D9, name: 'Dune log', cwd: '/srv/u/dune', backend: 'claude', backendSessionId: DID9, mode: 'chat' }];
  const row = (o) => ({ winId: 'win-v-s', title: 'Atlas notes — /srv/u/atlas', type: 'chat', isMinimized: false, isMaximized: false, gridBounds: GB(1), zIndex: 101, backend: 'claude', cwd: '/srv/u/atlas', ...o });
  const g = { backendSessionId: DID9, serverSessionId: S, title: 'Dune log — /srv/u/dune', cwd: '/srv/u/dune' };
  const SHAPES = {
    gn: { row: g, save: false, says: '(g) D\'s conversation id beside S\'s server id — normalizeDups() before the visit' },
    gs: { row: g, save: true, says: '(g) …the real autosave before the visit' },
    es: { row: { serverSessionId: S }, save: true, copy: true, leaves: true, says: 'CONTROL (e): S by its server id alone — a TRUE copy, the real autosave' },
    as: { row: { backendSessionId: CID }, save: true, copy: true, says: '(a) S by its conversation id alone — the real autosave' },
    cs: { row: { backendSessionId: CID, serverSessionId: STALE9 }, save: true, copy: true, says: '(c) S\'s conversation id beside a stale server id — the real autosave' },
  };
  const winsOf = (P, sid) => [...P.wins.values()].filter((w) => w._openSpec && w._openSpec.serverId === sid).map((w) => w.id + '@' + w._desktopId);
  for (const [k, sh] of Object.entries(SHAPES)) {
    if (!want(k)) continue;
    const recs = { 'desk-x': [files('x-1', 0), chat('win-x-s', S, 1)], 'desk-y': [files('y-1', 0)], 'desk-v': [files('v-1', 0), row(sh.row)] };
    const H = hub(loadHandler(), DOC(recs), { alive: [S, T, D9] }), P = pageOn(H, install, 'desk-x', { DM, LM, attachMs: 60000 }), t0 = made.length;
    P.app.sidebar._webuiSessions = live();
    P.lm._bootJson = async (u) => (u === '/api/active' ? { sessions: live() } : { sessions: [] });
    const copyBefore = P.dm.copiesOf('desk-v').includes('win-v-s'), departed = [], nd = P.dm._noteDeparted.bind(P.dm);
    P.dm._noteDeparted = (id, why, by) => { departed.push([id, why, by]); return nd(id, why, by); };
    let n = null;
    if (!sh.save) n = P.dm.normalizeDups();
    else { const nm = P.dm.normalizeDups.bind(P.dm); P.dm.normalizeDups = () => (n = nm()); P.lm._userDirty = true; P.lm._lastUserInputAt = Date.now(); await P.lm._doAutoSave(); }
    await tick(5);
    const held = ids(P.dm._savedStates.get('desk-v')?.windows), onHub = ids(H.layouts().desktops['desk-v'].autoSave.windows);
    const restores = [], rs = P.lm.restoreState.bind(P.lm); P.lm.restoreState = (st) => { restores.push(...ids(st && st.windows)); return rs(st); };
    press('pointerdown'); const sw = P.dm.switchTo('desk-v'); press('pointerup'); await sw;
    await tick(3);
    const sW = winsOf(P, S), dW = winsOf(P, D9), at = P.dm.activeDesktopId, said = toasts(t0).length;
    await tick(3); // the hub's quiet wrapper (the switch's save) gives the console back
    const kept = J(held) === J(['v-1', 'win-v-s']) && J(onHub) === J(['v-1', 'win-v-s']);
    const verdict = !sh.copy ? n === 0 && !departed.length && kept && !copyBefore && J(restores) === J(['win-v-s']) && J(dW) === J(['win-v-s@desk-v'])
      : sh.leaves ? n === 1 && J(departed) === J([['win-v-s', 'dup', 'win-x-s']]) && J(onHub) === J(['v-1']) && J(restores) === '[]' && !dW.length
        : n === 0 && !departed.length && kept && copyBefore && J(restores) === '[]' && !dW.length;
    leg(verdict && sW.length === 1 && /@desk-x$/.test(sW[0]) && at === 'desk-v' && said === 0, `§R10 (${k}): ${sh.says} — ${!sh.copy ? 'NOT a copy by the one verdict: never proposed — V\'s row survives the save (held and on the hub), the visit builds D\'s window' : sh.leaves ? 'a copy the hub checks by its server id: proposed as before — {why:\'dup\', by: X\'s window}, the hub\'s V record drops it' : 'a copy the hub keys by no shown server id: never proposed (the hub would refuse it) — carried, as before, never restored'} — copiesOf(V) before ${copyBefore}, normalizeDups ${n}, departed ${J(departed)}, V held ${J(held)}, on the hub ${J(onHub)}, restored ${J(restores)}, S windows ${J(sW)}, D windows ${J(dW)}, active ${at}, toasts ${said}`);
  }
  if (want('law')) {
    // THE WIRE'S LAW, UNCHANGED: the hub checks a 'dup' by the row's server id (shrinkVerdict's `by` shows sessionOf) — why (a)(c)(f)
    // are never proposed: the page's word would be refused, the storm this lane ended
    const x = [chat('win-x-s', S, 1)], v = (o) => require(MODEL).shrinkVerdict({ prev: [files('v-1', 0), row(o)], next: [files('v-1', 0)], evidence: [{ id: 'win-v-s', why: 'dup', by: 'win-x-s' }], alive: () => true, elsewhere: [x] });
    const r = { a: v({ backendSessionId: CID }), c: v({ backendSessionId: CID, serverSessionId: STALE9 }), f: v({ backendSessionId: CID, serverSessionId: D9 }), e: v({ serverSessionId: S }) };
    leg(['a', 'c', 'f'].every((k) => !r[k].ok && r[k].reason === 'shrink-without-close' && J(r[k].dup) === J(['win-v-s'])) && r.e.ok === true, `§R10 (law): THE HUB'S 'dup' LAW IS UNCHANGED — V's row proposed as {why:'dup', by: X's window}: (a) no server id, (c) a stale one, (f) D's ⇒ REFUSED, named in \`dup\` (so the page never proposes them: carried, r5 O); (e) S's ⇒ accepted — ${J(Object.fromEntries(Object.entries(r).map(([k, y]) => [k, y.ok])))}`);
  }
  if (want('p')) {
    // ONE RESOLUTION FOR A PRESET TOO: loadPreset kept the old two-rung ladder (no recipe rung) — a preset row named by its recipe
    // alone attached nothing while the restore attaches its session
    const Tlive = { id: T, name: 'Tide log', cwd: '/srv/u/tide', backend: 'claude', backendSessionId: 'b' + CID.slice(1), mode: 'terminal' };
    const P = pageOn(hub(loadHandler(), DOC({ 'desk-x': [files('x-1', 0), chat('win-x-s', S, 1)], 'desk-y': [files('y-1', 0)], 'desk-v': [files('v-1', 0)] }), { alive: [S, T, D9] }), install, 'desk-x', { DM, LM, attachMs: 60000 }), t0 = made.length;
    P.app.sidebar._webuiSessions = live().concat([Tlive]);
    const att = [], a0 = P.app.attachSession, f0 = globalThis.fetch;
    P.app.attachSession = function (sid, ...rest) { att.push(sid); return a0.call(this, sid, ...rest); };
    globalThis.fetch = async (u) => ({ ok: true, json: async () => (u === '/api/active' ? { sessions: live().concat([Tlive]) } : { sessions: [] }) });
    const recipe = (id, type, sid, name, cwd, mode) => ({ winId: id, type, title: name + ' — ' + cwd, openSpec: { action: 'attachSession', serverId: sid, name, cwd, mode, backend: 'claude' } });
    P.lm._savedPresets = { focus: { windows: [recipe('p-1', 'chat', D9, 'Dune log', '/srv/u/dune', 'chat'), recipe('p-2', 'terminal', T, 'Tide log', '/srv/u/tide', 'terminal'), { winId: 'p-3', type: 'chat', title: 'Atlas notes — /srv/u/atlas', backend: 'claude', backendSessionId: CID, serverSessionId: STALE9 }] } };
    try { await P.lm.loadPreset('focus'); } finally { globalThis.fetch = f0; }
    const dW = winsOf(P, D9), tW = winsOf(P, T), sW = winsOf(P, S);
    leg(J(att) === J([D9, T, S]) && dW.length === 1 && tW.length === 1 && sW.length === 1 && toasts(t0).length === 0, `§R10 (p): A PRESET READS THE RESTORE'S LADDER (desktop-record liveSessionOf) — a chat row and a terminal row named by their recipe alone attach D and T (9d11dd973's two-rung copy: nothing); a row naming S's conversation beside a stale server id attaches S, its open window (as before) — attaches ${J(att)}, D windows ${J(dW)}, T windows ${J(tW)}, S windows ${J(sW)}, toasts ${toasts(t0).length}`);
  }
  return failed;
}
const install10 = await loadLifecycle();
await section('§R10 ROUND 10 — one verdict, everywhere a copy is decided (the autosave\'s dup proposal reads doorSessionOf); a preset reads the restore\'s ladder', async () => {
  await r10Legs({ install: install10 });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// §PR — A PHONE NEVER REPLACES A DESKTOP'S ROWS (lane phone-resume-keeps-layout, userW 2026-11-05 11:30Z: after a hub restart his
// PHONE page reconnected first and accepted «Resume all»; each stopped conversation reopened in a NEW window, the desktops' rows
// were retired for them — evidence 'closed' / 'moved' — and the phone, which owns no desktop geometry, wrote eleven desktops'
// records with no box; three desktops never visited since then previewed EMPTY). Invented ids, the SHAPE kept.
const PRC = (i) => `c0ffee0${i}-0000-4000-8000-00000000000${i}`;
const PRGB = (i) => ({ left: 0.1 * i, top: 0.05 * i, width: 0.3, height: 0.4 });
const prRow = (id, i, o = {}) => ({ winId: id, title: `Conv ${i} — /srv/p${i}`, type: 'chat', isMinimized: false, isMaximized: false, gridBounds: PRGB(i), zIndex: 200 + i,
  backend: 'claude', backendSessionId: PRC(i), claudeSessionId: PRC(i), cwd: '/srv/p' + i, serverSessionId: 'dead-' + i, ...o });
const PR_RECS = () => ({ 'desk-v': [prRow('v-r1', 1), files('v-f', 0)], 'desk-x': [prRow('x-r2', 2), files('x-f', 3)], 'desk-y': [prRow('y-r3', 3)] });
const PR_STOPPED = () => [
  { sessionId: PRC(1), cwd: '/srv/p1', name: 'Conv 1', opts: { backend: 'claude', backendSessionId: PRC(1) } }, // the restore's collector: built read-only on the desktop on show
  { sessionId: PRC(2), cwd: '/srv/p2', name: 'Conv 2', opts: { backend: 'claude', backendSessionId: PRC(2), winBounds: { gridBounds: PRGB(2), desktopId: 'desk-x', winId: 'x-r2' } } }, // scanStoppedInDesktopStates: a desktop never visited
  { sessionId: PRC(3), cwd: '/srv/p3', name: 'Conv 3', opts: { backend: 'claude', backendSessionId: PRC(3), winBounds: { gridBounds: PRGB(3), desktopId: 'desk-y', winId: 'y-r3' } } },
];
/** a page on the real hub, booted on desk-v, with the real resume door (resumeSession → createSession) — a phone unless `desk` */
function prPage(H, install, { DM = RealDM, LM = RealLM, phone = true, on = 'desk-v' } = {}) {
  const P = pageOn(H, install, on, { DM, LM, attachMs: 60000 });
  class Life {} install(Life);
  for (const k of ['resumeSession', 'createSession', '_windowPending', '_snapshotWinBounds', '_placeCarried', '_reopenWin', '_reopenedAs', '_attachInRow', '_closeSecondView', '_markResume', '_closeFenced', '_fenceSays', '_winIs', '_pendingResumeWin', '_respawnAfterExit']) if (Life.prototype[k]) P.app[k] = Life.prototype[k].bind(P.app);
  Object.assign(P.app, { isMobile: phone, _getBackendSessionDefaults: () => ({}) });
  P.creates = []; P.answers = []; P.reqOpts = []; P.app.ws.request = (m, cb, o = {}) => { if (m && m.type === 'create') { P.creates.push(m); P.reqOpts.push(o); P.answers.push((msg) => (o.isAlive && !o.isAlive() ? false : cb(msg))); } return () => {}; }; // ws.js's rule: isAlive false ⇒ the answer is dropped; `reqOpts` — its watchdog (r4)
  P.app.sidebar.getSessionConfig = () => ({}); P.app.sidebar._getSessionTasks = () => [];
  // the restore built v-r1 READ-ONLY under its row's id (viewSession + applyPosition's re-key); a phone draws it full screen
  const ro = P.wins.get('v-r1'); if (ro) Object.assign(ro, { type: 'chat', gridBounds: phone ? { left: 0, top: 0, width: 1, height: 1 } : PRGB(1), _attached: true, _readOnly: true, _openSpec: { action: 'attachSession', serverId: 'dead-1', backend: 'claude', backendSessionId: PRC(1), cwd: '/srv/p1', mode: 'chat', name: 'Conv 1' } });
  return P;
}
// the resume-all's 400 ms stagger runs at 0 here (the fast tier's clock); the loop suite's §14 runs it on the page's real timing
const prResumeAll = async (P, stopped) => {
  const st = globalThis.setTimeout; globalThis.setTimeout = (f, ms, ...a) => st(f, ms === 400 ? 0 : ms, ...a);
  try { return await (P.lm._resumeAll ? P.lm._resumeAll(stopped) : (async () => { for (const d of stopped) { P.app.resumeSession(d.sessionId, d.cwd, d.name, d.opts); await tick(0); } return null; })()); } finally { globalThis.setTimeout = st; }
};
const rowsOf = (doc, d) => ((doc.desktops[d] && doc.desktops[d].autoSave.windows) || []).map((w) => [w.winId, w.gridBounds ? J(w.gridBounds) : null]);
async function prLegs({ DM = RealDM, LM = RealLM, install = null, PURE = require(MODEL), WSH = null, quiet = false, legs = null } = {}) {
  const failed = [];
  const leg = (c, n, extra) => { if (!quiet) ok(c, n, extra); if (!c) failed.push(n); return !!c; };
  const want = (k) => !legs || legs.includes(k);
  if (want('a') && install) {
    // (a) THE INCIDENT'S DOOR: a PHONE page resumes three stopped conversations held on desktops V (on show, built read-only), X and Y
    // (never visited) — the records keep the SAME window ids and boxes, no row closed / replaced, no window minted for a held one
    const H = hub(WSH || loadHandler(), DOC(PR_RECS()), { alive: [S, T] }), P = prPage(H, install, { DM, LM }), t0 = made.length, before = H.layouts();
    const kept = await prResumeAll(P, PR_STOPPED());
    await tick(20);
    P.lm._userDirty = true; P.lm._lastUserInputAt = Date.now(); P.lm._lastSentJson = null;
    await P.lm._doAutoSave(); await tick(20);
    const after = H.layouts(), sent = P.syncs(), ev = sent.flatMap((m) => m.evidence || []);
    const same = ['desk-v', 'desk-x', 'desk-y'].every((d) => J(rowsOf(after, d)) === J(rowsOf(before, d)));
    const minted = [...P.wins.keys()].filter((id) => !['v-r1', 'v-f', 'x-r2', 'y-r3'].includes(id));
    const retired = ev.filter((e) => ['v-r1', 'x-r2', 'y-r3'].includes(e.id) && (e.why === 'closed' || e.why === 'replaced' || e.why === 'dup'));
    const said = toasts(t0).map(toastText);
    leg(P.creates.length === 3 && same && !minted.length && !retired.length && !refusals(P.sock()).length && sent.length >= 3,
      '§PR (a) a PHONE page resumes 3 stopped conversations held on desktops V (built read-only) / X / Y (never visited) ⇒ every record keeps the SAME window ids and boxes (z too), 0 rows closed or replaced, 0 windows minted for a held conversation, 0 refusals',
      { creates: P.creates.length, minted, retired, before: ['desk-v', 'desk-x', 'desk-y'].map((d) => rowsOf(before, d)), after: ['desk-v', 'desk-x', 'desk-y'].map((d) => rowsOf(after, d)), refused: refusals(P.sock()).length });
    const zs = ['desk-x', 'desk-y'].map((d) => after.desktops[d].autoSave.windows[0].zIndex);
    leg(J(zs) === J([202, 203]), '§PR (a) …each re-opened row keeps its z (the desktop\'s stacking)', zs);
    leg(kept === 3 && J(said) === J(['Resumed 3 conversations where they were']), '§PR (a) NOTHING SILENT: the resume-all says once «Resumed 3 conversations where they were» — no other toast', { kept, said });
  }
  if (want('a2') && install) {
    // (a2) ANY OTHER PHONE OPEN of a held conversation (a card, a sidebar row — no place named): the row is re-opened as ITSELF on its
    // own desktop and the page goes there; never a second window on the desktop on show
    const H = hub(WSH || loadHandler(), DOC(PR_RECS()), { alive: [S, T] }), P = prPage(H, install, { DM, LM });
    P.app.resumeSession(PRC(2), '/srv/p2', 'Conv 2', { backend: 'claude', backendSessionId: PRC(2) });
    await tick(30); // the reveal's switch lands at once (switchTo's step 3); its 1 s gate runs on behind this leg
    const w = P.wins.get('x-r2'), minted = [...P.wins.keys()].filter((id) => !['v-r1', 'v-f', 'x-r2', 'x-f', 'y-r3'].includes(id));
    leg(!!w && w._desktopId === 'desk-x' && !minted.length && P.dm.activeDesktopId === 'desk-x' && J(P.dm._savedStates.get('desk-x').windows.find((r) => r.winId === 'x-r2')?.gridBounds) === J(PRGB(2)),
      '§PR (a2) a card\'s resume of a conversation held on X (never visited): the window IS row x-r2 (its box kept), on X, and the page goes to X — no window minted on the desktop on show', { w: w && [w.id, w._desktopId], minted, at: P.dm.activeDesktopId });
  }
  if (want('b')) {
    // (b) THE SURVIVOR KEEPS THE POSITION: a dedup between a row WITH a box and a window WITHOUT (a phone's capture) of one conversation
    const copy = chat('win-v-s', S, 4), surv = { ...chat('win-x-s', S, 1) }; delete surv.gridBounds;
    const out = PURE.duplicatesOf({ records: { 'desk-x': [surv], 'desk-v': [files('v-1', 0), copy] }, shown: new Map([[S, 'win-x-s']]), live: [] });
    leg(out.length === 1 && out[0].id === 'win-v-s' && out[0].by === 'win-x-s' && J(out[0].carry && out[0].carry.gridBounds) === J(GB(4)) && out[0].carry.zIndex === 104,
      '§PR (b) PURE duplicatesOf: the copy with a box retired for a survivor whose row has none ⇒ `carry` = the copy\'s arrangement (box, z, max / min)', out);
    const two = PURE.duplicatesOf({ records: { 'desk-x': [chat('win-x-s', S, 1)], 'desk-v': [copy] }, shown: new Map([[S, 'win-x-s']]), live: [] });
    leg(two.length === 1 && !('carry' in two[0]), '§PR (b) CONTROL: a survivor that holds a box keeps its own (no carry)', two);
    const W = world({ records: { 'desk-x': [surv, files('x-1', 2)], 'desk-y': [files('y-1', 0)], 'desk-v': [files('v-1', 0), copy] }, active: 'desk-x', DM, LM });
    W.app.isMobile = true;
    W.wins.get('win-x-s')._openSpec = surv.openSpec; W.wins.get('win-x-s').gridBounds = { left: 0, top: 0, width: 1, height: 1 }; // the phone's own full-screen box
    W.dm.noteWire('desk-x', { windows: [surv, files('x-1', 2)] });
    const n = W.dm.normalizeDups();
    await W.lm._doAutoSave();
    const sx = W.syncs('desk-x').at(-1), row = sx && sx.state.windows.find((w) => w.winId === 'win-x-s');
    leg(n === 1 && row && J(row.gridBounds) === J(GB(4)) && row.zIndex === 104, '§PR (b) THE REAL normalizeDups on a PHONE page: the survivor\'s row takes the copy\'s box and z — the autosave writes win-x-s at the copy\'s place (never boxless)', { n, row });
    const m = PURE.mergeDesktopRecord({ record: { windows: [member(prRow('o-1', 1), ['o-1', 'g-2']), member(files('g-2', 2), ['o-1', 'g-2'])] }, add: [{ winId: 'n-1', type: 'chat', title: 'Conv 1' }], remove: ['o-1'], replaced: [['n-1', 'o-1']] });
    const nr = m.windows.find((w) => w.winId === 'n-1'), gr = m.windows.find((w) => w.winId === 'g-2');
    leg(nr && J(nr.gridBounds) === J(PRGB(1)) && nr.zIndex === 201 && J(nr.tabChain.tabs) === J(['n-1', 'g-2']) && J(gr.tabChain.tabs) === J(['n-1', 'g-2']) && nr.backendSessionId === PRC(1),
      '§PR (b) PURE mergeDesktopRecord `replaced`: a newcomer with no box takes the replaced row\'s box, z and SEAT in its group (every chain of the record names the newcomer)', m.windows);
  }
  if (want('c')) {
    // (c) A PHONE'S CAPTURE OF A DESKTOP IT DID NOT CHANGE writes the rows it was given, byte for byte
    const W = world({ records: { 'desk-x': [], 'desk-y': [], 'desk-v': [] }, active: 'desk-v', DM, LM });
    W.app.isMobile = true;
    const a = W.mkWin('p-1', 'desk-v', { type: 'viewer', title: 'a.md', _openSpec: { action: 'openFile', path: '/a.md' }, gridBounds: { left: 0, top: 0, width: 1, height: 1 } });
    const b = W.mkWin('p-2', 'desk-v', { type: 'viewer', title: 'b.md', _openSpec: { action: 'openFile', path: '/b.md' }, gridBounds: { left: 0, top: 0, width: 1, height: 1 } });
    const held = [a, b].map((w, i) => ({ ...W.lm.captureWin(w, w.id), gridBounds: GB(i + 2), zIndex: 300 + i, isMaximized: i === 1 }));
    W.dm._setRecord('desk-v', { windows: held, grid: null }); W.dm.noteWire('desk-v', { windows: held });
    const rec = W.dm.recordFor('desk-v');
    leg(J(rec.windows) === J(held), '§PR (c) a PHONE\'s capture of a desktop it did not change ⇒ the rows byte-identical to the record (its full-screen boxes and own z never written)', { held, wrote: rec.windows });
  }
  if (want('d')) {
    // (d) POSITIONS ARE NEVER DROPPED WITHOUT A MOVE: the hub refuses, names `unplaced`, keeps its record; the page says it once
    const base = [prRow('v-r1', 1), prRow('v-r2', 2), files('v-f', 0)];
    const nb = (w) => { const o = { ...w }; delete o.gridBounds; return o; };
    const shapes = {
      strip: { next: [nb(base[0]), base[1], base[2]], evidence: [], says: 'a kept row (same id) written with no box' },
      remint: { next: [{ ...nb(base[0]), winId: 'win-new-1', serverSessionId: undefined }, { ...nb(base[1]), winId: 'win-new-2', serverSessionId: undefined }, base[2]], evidence: [{ id: 'v-r1', why: 'closed' }, { id: 'v-r2', why: 'closed' }, { id: 'win-new-1', why: 'moved' }, { id: 'win-new-2', why: 'moved' }], says: 'THE 11:30:40 SHAPE: the rows dropped \'closed\', NEW rows of the same conversations with no box' },
      replaced: { next: [{ ...nb(base[0]), winId: 'win-new-1' }, base[1], base[2]], evidence: [{ id: 'v-r1', why: 'replaced', by: 'win-new-1' }], says: 'a row dropped \'replaced\' by a window with no box' },
    };
    for (const [k, sh] of Object.entries(shapes)) {
      const v = PURE.shrinkVerdict({ prev: base, next: sh.next, evidence: sh.evidence, alive: () => false });
      const want2 = k === 'strip' ? ['v-r1'] : k === 'remint' ? ['v-r1', 'v-r2'] : ['v-r1'];
      leg(!v.ok && v.reason === 'shrink-without-close' && J(v.unplaced) === J(want2), `§PR (d) PURE shrinkVerdict: ${sh.says} ⇒ REFUSED at any count, named in \`unplaced\``, v);
    }
    const moved = PURE.shrinkVerdict({ prev: base, next: [base[1], base[2]], evidence: [{ id: 'v-r1', why: 'moved' }], alive: () => false });
    const closed = PURE.shrinkVerdict({ prev: base, next: [base[1], base[2]], evidence: [{ id: 'v-r1', why: 'closed' }], alive: () => false });
    const phoneBorn = PURE.shrinkVerdict({ prev: base, next: [...base, { winId: 'win-p', type: 'chat', title: 'New', backendSessionId: PRC(7) }], evidence: [], alive: () => false });
    leg(moved.ok && closed.ok && phoneBorn.ok && !(moved.unplaced || []).length, '§PR (d) CONTROLS: a MOVE takes a row away whole, a person\'s close of one window, a window born on the phone with no box of its own — all accepted', { moved, closed, phoneBorn });
    const H = hub(WSH || loadHandler(), DOC({ 'desk-x': [], 'desk-y': [], 'desk-v': base }), { alive: [S, T] }), S0 = H.connect();
    await S0.send({ type: 'layout-sync', desktopId: 'desk-v', state: { windows: shapes.remint.next, grid: null }, evidence: shapes.remint.evidence, base: 1000, sentAt: 7, viewport: 'phone' });
    const rf = refusals(S0)[0], kept = H.layouts().desktops['desk-v'].autoSave.windows, line = H.logs.find((l) => /REFUSED a record of desktop/.test(l)) || '';
    leg(rf && J(rf.unplaced) === J(['v-r1', 'v-r2']) && J(kept.map((w) => [w.winId, J(w.gridBounds)])) === J(base.map((w) => [w.winId, J(w.gridBounds)])) && /2 would lose their position with no move \(v-r1, v-r2\)/.test(line),
      '§PR (d) THE REAL ws-handler: the 11:30:40 write is REFUSED — the frame names `unplaced`, the journal names the rows, the record keeps every box', { rf, line, kept: kept.map((w) => w.winId) });
    // the page: says it ONCE (the same refusal again inside the window is counted, not said), and its reconciled write carries the boxes
    const W = world({ records: { 'desk-x': [], 'desk-y': [], 'desk-v': base }, active: 'desk-v', DM, LM }), t0 = made.length;
    W.app.isMobile = true;
    const msg = { type: 'layout-sync-refused', desktopId: 'desk-v', reason: 'shrink-without-close', unexplained: ['v-r1', 'v-r2'], unplaced: ['v-r1', 'v-r2'], arrived: [], state: { windows: base, grid: null, updatedAt: 2000 }, sentAt: 1 };
    W.dm.onSyncRefused(JSON.parse(J(msg)));
    const said = toasts(t0).map(toastText);
    leg(said.length === 1 && /kept their places/.test(said[0]) && /Conv 1/.test(said[0]), '§PR (d) THE REAL onSyncRefused: the page says it ONCE, in its own words («… kept their places — this page had no position to give them»)', said);
    const rec = W.dm.recordFor('desk-v'), again = PURE.shrinkVerdict({ prev: base, next: rec.windows, evidence: W.dm.evidence(), alive: () => false });
    leg(again.ok && ['v-r1', 'v-r2'].every((id) => J(rec.windows.find((w) => w.winId === id)?.gridBounds) === J(base.find((w) => w.winId === id).gridBounds)), '§PR (d) …and its next record carries the kept boxes — the belt accepts it (a refusal never loops)', { again, rows: rec.windows.map((w) => [w.winId, w.gridBounds]) });
  }
  if (want('p')) {
    // LAW 2 — A DESKTOP WHOSE ROWS HAVE NO POSITION SAYS SO IN ITS PREVIEW: N dashed placeholders in a cascade + the count badge
    const W = world({ records: { 'desk-x': [files('x-1', 0)], 'desk-y': [1, 2, 3, 4, 5].map((i) => { const r = prRow('y-u' + i, i); delete r.gridBounds; return r; }).concat([files('y-p', 2)]), 'desk-v': [files('v-1', 0)] }, active: 'desk-x', DM, LM });
    const box = mkEl('div'), gi = document.getElementById;
    document.getElementById = (id) => (id === 'desktop-previews' ? box : null);
    try { W.dm._switcherDigest = null; W.dm._renderSwitcher(); } finally { document.getElementById = gi; }
    const prev = box.children.flatMap((wr) => wr.children).find((c) => c.dataset && c.dataset.desktopId === 'desk-y');
    const ph = prev ? prev.children.filter((c) => /desktop-preview-win-unplaced/.test(c.className)) : [], badge = prev ? prev.children.find((c) => /desktop-preview-unplaced/.test(c.className)) : null, placed = prev ? prev.children.filter((c) => /desktop-preview-win/.test(c.className) && !/unplaced/.test(c.className)) : [];
    leg(ph.length === 5 && badge && badge.textContent === '5' && /5 windows · not placed/.test(badge.title) && placed.length === 1 && new Set(ph.map((c) => c.style.left)).size === 5,
      '§PR LAW 2 the preview of a desktop holding 5 rows with no position draws 5 dashed placeholders in a cascade + the count badge «5» («5 windows · not placed — …»), beside its placed row', { ph: ph.length, badge: badge && [badge.textContent, badge.title], placed: placed.length });
  }
  return failed;
}
const installPR = await loadLifecycle();
await section('§PR A PHONE NEVER REPLACES A DESKTOP\'S ROWS (lane phone-resume-keeps-layout): a resume re-opens its row (a), any other open too (a2), the survivor keeps the position (b), a phone\'s capture writes what it was given (c), the hub refuses positions dropped and the page says it once (d), a row with no position is drawn (LAW 2)', async () => {
  await prLegs({ install: installPR });
});

// ── §PR2 ROUND 2 (the r1 acceptance of the lane: the Resume bar closed the window it had just resumed — N1; other pages kept a dead
// view under the reused id and wrote it back, and a conversation live elsewhere was re-created — N2; the belt read the evidence, and
// the refused page re-sent the very drop — N3; the tile's press minted a new id — N4; one refusal, one toast, both groups — N5) ──
const { showToast: realToast } = await import(pathToFileURL(path.join(LIB, 'utils.js')).href);
/** THE RESUME BAR's own door — chat-view.js `_resumeAndClose`, its text as shipped (the «Resume this session» bar, the retry bar and
 *  the account bar all press it), run on a stand-in ChatView of window `win` */
const resumeBarDoor = (src) => {
  const i = src.indexOf('\n  _resumeAndClose({'), j = src.indexOf('\n  }\n', i), o = src.match(/\n {2}(_ownsWindow\(\) \{[^\n]*\})\n/);
  const M = new Function('showToast', 't', `return ({\n${o ? o[1] + ',\n' : ''}${src.slice(i + 1, j + 4)}\n});`)(realToast, (s) => s);
  // the stand-in view is given the methods the door calls on itself (its re-entry after the account check, r3: `_ownsWindow`)
  return function door(...a) { if (M._ownsWindow && !this._ownsWindow) this._ownsWindow = M._ownsWindow; if (!this._resumeAndClose) this._resumeAndClose = door; return M._resumeAndClose.apply(this, a); };
};
const pressResumeBar = (door, P, win, i = 1) => door.call({ winInfo: win, app: P.app, _resumeBar: null, _getSessionIds: () => ({ backend: 'claude', backendSessionId: PRC(i), cwd: '/srv/p' + i }) }, {});
/** the create answered: the window shows live session `sid` (ChatView's 'created' — the rig's ChatView is a stand-in) */
/** the window a resume of conversation i made on page P (its row's id here; another id on a tree that mints one) */
const convWin = (P, id, i = 1) => P.wins.get(id) && !P.wins.get(id)._readOnly ? P.wins.get(id) : [...P.wins.values()].find((w) => !w._readOnly && (w._conversation?.backendSessionId === PRC(i) || w._openSpec?.backendSessionId === PRC(i))) || P.wins.get(id) || null;
const answered = (w, sid, i = 1) => w && Object.assign(w, { _attached: true, _readOnly: false, _openSpec: { action: 'attachSession', serverId: sid, backend: 'claude', backendSessionId: PRC(i), cwd: '/srv/p' + i, mode: 'chat', name: 'Conv ' + i } });
const saveNow = async (P) => { P.lm._userDirty = true; P.lm._lastUserInputAt = Date.now(); P.lm._lastSentJson = null; await P.lm._doAutoSave(); await tick(5); };
const closedOf = (P, id) => P.syncs().flatMap((m) => m.evidence || []).filter((e) => e.id === id && (e.why === 'closed' || e.why === 'replaced' || e.why === 'dup'));
/** THE FENCE IS A CENSUS (r3 N1 — the r2 acceptance: the r2 census matched resume calls BY NAME beside a close, and the retry bar's
 *  `try { onRetry?.(); } finally { closeWindow }` reached the resume through a callback — invisible to it): every closeWindow /
 *  _retireWindow CALL of src/lib (acorn — comments and strings never count) is a row of this table, keyed by its file and the named
 *  function it sits in, with its count and its reason. A close no row names, a count that moved, a row with no close left — each RED
 *  by name (the table's diff is reviewed row by row); and no close shares its own function with a resume / create / attach / view /
 *  re-open / retry call but the two helpers (a door never closes around a resume). */
const CLOSE_FENCE = {
  // ── a resume's closes: these two, nowhere else ──
  'session-lifecycle.js::_reopenWin': [1, 'THE ONE CLOSE IN A RESUME: the row re-opened — its window closed as its re-opening (the record keeps the row), the new window takes its id'],
  'session-lifecycle.js::_closeSecondView': [1, 'a SECOND view of a conversation beside the one a resume shows (its row re-opened, or this page\'s live window of it) — a real close: one conversation, one window'],
  // ── the window manager's own doors ──
  'window.js::requestClose': [1, 'THE PERSON\'S CLOSE: the one user-close door (a window may answer first)'],
  'window.js::closeWindow': [2, 'the close itself: THE ONE RETIREMENT (the free branch; a record-only id)'],
  'tab-group.js::removeFromTabChain': [1, 'the close itself, chained: THE ONE RETIREMENT of a tab leaving its group'],
  // ── the person's close doors — each through requestClose (r4 N5: the census counts it too; a window in a resume's turn is refused there) ──
  'tab-group.js::makeTab': [1, 'a tab\'s ✕ (requestClose)'],
  'tab-group.js::requestCloseGroup': [2, 'a group\'s Close, asked first: each member through requestClose'],
  'taskbar.js::run': [1, 'the window menu\'s Close (requestClose)'],
  'command-mode.js::run': [1, 'the command «Close window» on the active window (requestClose)'],
  'mobile-nav.js::constructor': [1, 'the phone\'s close of the window on show (requestClose)'],
  'mobile-nav.js::_buildWindowItem': [1, 'the phone\'s window list: an item\'s ✕ (requestClose)'],
  'trailing-bar.js::installTrailingBar': [1, 'the trailing bar\'s close of the active window — never a conversation\'s (requestClose)'],
  'layout.js::_askRemovePlaceholder': [1, 'a placeholder tile the person removes, answered (requestClose)'],
  // ── the record names what stands (the apply, the Stage) ──
  'layout.js::_applyRemoteState': [2, 'THE RECORD\'S CLOSE: a window the remote record no longer lists (the keep-shown law first); a dead view rebuilt as the live one its record names, as its row\'s re-opening (r2 N2)'],
  'layout.js::_dropPlaceholder': [1, 'a placeholder tile replaced by the window its record names (the apply\'s own close)'],
  'desktop-manager.js::cacheRemoteState': [2, 'a hidden desktop\'s record: the windows it no longer lists; a dead view rebuilt as its row\'s re-opening (r2 N2)'],
  'stage-manager.js::_reconcileWorkspace': [1, 'the Stage hands back an aux window it bound (never one with unsaved edits)'],
  'stage-manager.js::_enforceLru': [1, 'the Stage\'s LRU: a bound aux window leaves (its record serialized)'],
  'stage-manager.js::_sweepTransient': [1, 'the Stage\'s transient windows swept'],
  // ── a window closing ITSELF (its content gone or handed on — none is a conversation\'s) ──
  'browser-live-window.js::createLiveView': [2, 'a live browsing window whose browsing ended (its own «stop browsing»)'],
  'browser-live-window.js::foldBackLive': [1, 'a live browsing window folded into the window its control passed to'],
  'desktop-app-window.js::showQuickExit': [2, 'a desktop app\'s quick-exit card: «Open the running one» / «Close this window»'],
  'desktop-app-window.js::decideExit': [1, 'a desktop app that exited: its window goes, said'],
  'desktop-app-window.js::forgotten': [1, 'a desktop app the keeper forgot: its window goes, said'],
  'desktop-app-window.js::openDesktopApp': [1, 'a desktop app\'s close the socket refused: the pane-only close'],
  'desktop-app-window.js::retarget': [1, 'a desktop app\'s successor already shown by another window'],
  'desktop-app-window.js::onGone': [1, 'a desktop app\'s satellite window whose X window went'],
  'desktop-app-window.js::openSatelliteWindow': [1, 'a satellite window whose app never showed its main window'],
  'file-viewer.js::open': [1, 'a file with no dedicated viewer re-opened in the editor'],
  'form-window.js::toSheet': [1, 'a form window turned into a sheet'],
  'form-window.js::close': [1, 'a form window\'s own close'],
  'machine-app.js::showSay': [2, 'a machine app / stream window giving way to the next one («Run again», «Pick a window…»)'],
  'machine-desktop.js::setMode': [1, 'a machine\'s ONE desktop window: its other windows close'],
  'plugin-client.js::onMessage': [1, 'a plugin window closing itself (vsp close)'],
  'search-window.js::openSearchWindow': [1, 'Escape on the search window'],
  'session-props.js::openSessionProps': [2, 'the properties window\'s Escape (requestClose; closeWindow for a wm without it)'],
  'task-detail.js::render': [1, 'a task deleted elsewhere: its detail window'],
  'task-log.js::onGone': [1, 'a task log whose task is gone'],
  // ── not a VibeSpace window: xpra\'s protocol (an X window of a desktop app) ──
  'xpra-client.js::closeMain': [1, 'xpra\'s close packet for an X window'],
  'xpra-client.js::closeFront': [1, 'xpra\'s close packet for an X window'],
  'xpra-client.js::closeWindow': [1, 'xpra\'s close packet for an X window'],
  'xpra-view.js::close': [1, 'xpra\'s close of a satellite X window'],
};
const acorn = require('acorn');
const DOOR_CALL = /^(?:resumeSession|createSession|attachSession|viewSession|_attachInRow|_reopenedAs|_reopenWin|onRetry|retry)$/;
/** every close CALL of one source: { key: 'file::named function', line, beside: the resume-ish calls of its own innermost function } */
const SITES = new Map(); // a source's text → its sites (the census runs once per tree and again per mutant)
function closeSites(rel, src) {
  const out = [], file = rel.split('/').pop();
  if (!/closeWindow|_retireWindow|requestClose/.test(src)) return out; // no such call can sit in a source that never names it
  const k = rel + '\0' + src; if (SITES.has(k)) return SITES.get(k);
  let ast; try { ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module', locations: true }); } catch (e) { return [{ key: file + '::(unparsed)', line: 0, beside: [String(e.message)] }]; }
  const nameOf = (n) => (n.type === 'MethodDefinition' || (n.type === 'Property' && n.value && /Function/.test(n.value.type)) ? n.key && (n.key.name || n.key.value)
    : n.type === 'FunctionDeclaration' ? n.id && n.id.name : n.type === 'VariableDeclarator' && n.init && /Function/.test(n.init.type) ? n.id && n.id.name : null);
  const calleeName = (c) => { const x = c && c.type === 'ChainExpression' ? c.expression : c; return x && x.type === 'MemberExpression' && !x.computed ? x.property.name : x && x.type === 'Identifier' ? x.name : null; };
  const fns = new Map(); // a function node → the resume-ish calls made directly in it (not in a nested function)
  const walk = (n, names, fn) => {
    if (!n || typeof n.type !== 'string') return;
    const nm = nameOf(n), here = /Function/.test(n.type) ? n : fn;
    if (here !== fn && !fns.has(here)) fns.set(here, []);
    if (n.type === 'CallExpression') {
      const p = calleeName(n.callee);
      if (p && DOOR_CALL.test(p) && fns.has(here)) fns.get(here).push(p);
      if (p === 'closeWindow' || p === '_retireWindow' || p === 'requestClose') { const o = n.callee.type === 'ChainExpression' ? n.callee.expression : n.callee; if (o.type === 'MemberExpression') out.push({ key: file + '::' + (names[names.length - 1] || '(top)'), line: n.loc.start.line, fn: here }); }
    }
    for (const k of Object.keys(n)) { if (k === 'loc') continue; const v = n[k]; const nn = nm ? [...names, nm] : names; if (Array.isArray(v)) v.forEach((x) => walk(x, nn, here)); else if (v && typeof v.type === 'string') walk(v, nn, here); }
  };
  walk(ast, [], null);
  const res = out.map((x) => ({ key: x.key, line: x.line, beside: (fns.get(x.fn) || []).filter((c) => !(x.key.endsWith('::_reopenWin') || x.key.endsWith('::_closeSecondView'))) }));
  SITES.set(k, res);
  return res;
}
function closeFence(files) {
  const counts = {}, at = {}, bad = [];
  for (const [rel, src] of Object.entries(files)) for (const s of closeSites(rel, src)) {
    counts[s.key] = (counts[s.key] || 0) + 1; (at[s.key] = at[s.key] || []).push(s.line);
    if (s.beside.length) bad.push(`${s.key} (line ${s.line}): a close beside ${[...new Set(s.beside)].join(' / ')} in one function — a door never closes around a resume`);
  }
  for (const [k, n] of Object.entries(counts)) { const row = CLOSE_FENCE[k]; if (!row) bad.push(`${k} (line ${at[k].join(', ')}): a close NO ROW of the fence names`); else if (row[0] !== n) bad.push(`${k}: ${n} close(s) — the fence names ${row[0]} (line ${at[k].join(', ')})`); }
  for (const k of Object.keys(CLOSE_FENCE)) if (!counts[k]) bad.push(`${k}: a row of the fence with no close left`);
  return { bad, counts };
}
/** THE DYNAMIC FENCE (r3 N1): the closes made while `fn` runs, each with the function that made it (its stack's caller) */
const closesDuring = async (P, fn) => {
  const wm = P.app.wm, orig = wm.closeWindow, out = [];
  wm.closeWindow = function (id, ...a) { const line = String(new Error().stack).split('\n')[2] || '', had = wm.windows.get(id), r = orig.call(this, id, ...a); if (had && wm.windows.get(id) !== had) out.push({ id, by: (line.match(/at (?:[\w$.]+\.)?([\w$]+) \(/) || line.match(/at (?:[\w$.]+\.)?([\w$]+)/) || [])[1] || '?' }); return r; }; // a close the fence REFUSED closed nothing (r4)
  try { await fn(); } finally { wm.closeWindow = orig; }
  return out;
};
const fenced = (cl) => cl.every((c) => c.by === '_reopenWin' || c.by === '_closeSecondView');
/** THE FENCE'S DYNAMIC HALF IN THE PRODUCT (r4 N5): a door that tried to close a window in a resume's turn is refused AND journaled —
 *  a door leg also asserts the journal is empty (a door that closes nothing tries nothing) */
const noFence = (P) => !(P.app._fenceRefused || []).length;
async function pr2Legs({ DM = RealDM, LM = RealLM, install = null, PURE = require(MODEL), WSH = null, CV = read('src/lib/chat-view.js'), SRCS = null, quiet = false, legs = null } = {}) {
  const failed = [];
  const leg = (c, n, extra) => { if (!quiet) ok(c, n, extra); if (!c) failed.push(n); return !!c; };
  const want = (k) => !legs || legs.includes(k);
  const door = resumeBarDoor(CV);
  if (want('e') && install) {
    // (e) N1 THE RESUME BAR — «Resume this session» on the read-only window, on a desktop page and on a phone: the resumed window IS row
    // v-r1 (same id), the record keeps the row and its box, nothing says 'closed', the resumed session keeps its window
    for (const phone of [false, true]) {
      const H = hub(WSH || loadHandler(), DOC(PR_RECS()), { alive: [S, T] }), P = prPage(H, install, { DM, LM, phone }), before = H.layouts(), ro = P.wins.get('v-r1');
      pressResumeBar(door, P, ro);
      await tick(5);
      const w = P.wins.get('v-r1');
      await saveNow(P);
      const after = H.layouts();
      leg(P.creates.length === 1 && !!w && w !== ro && P.wins.get('v-r1') === w && J(rowsOf(after, 'desk-v')) === J(rowsOf(before, 'desk-v')) && !closedOf(P, 'v-r1').length && !refusals(P.sock()).length && noFence(P),
        `§PR2 (e) N1 THE RESUME BAR on a ${phone ? 'PHONE' : 'DESKTOP'} page: the resumed window IS row v-r1 (same id) and stays — the record keeps the row and its box, 0 'closed', 0 refusals, the door tried no close (r4: the fence's journal empty)`,
        { creates: P.creates.length, win: w && w.id, same: w === ro, stays: P.wins.get('v-r1') === w, before: rowsOf(before, 'desk-v'), after: rowsOf(after, 'desk-v'), closed: closedOf(P, 'v-r1'), fence: P.app._fenceRefused || [] });
    }
  }
  if (want('census')) {
    const files = { ...Object.fromEntries(fs.readdirSync(LIB).filter((f) => f.endsWith('.js')).map((f) => ['src/lib/' + f, read('src/lib/' + f)])), ...(SRCS || {}) };
    const { bad, counts } = closeFence(files);
    leg(!bad.length, `§PR2 (census) N1 THE FENCE IS A CENSUS (r3; requestClose too — r4 N5): every closeWindow / _retireWindow / requestClose call of src/lib is a row of the allowlist — file::function, its count, its reason (${Object.keys(CLOSE_FENCE).length} rows, ${Object.values(counts).reduce((a, b) => a + b, 0)} closes); a close no row names, a count moved, a row with no close left, a close beside a resume / create / attach / view / re-open / retry call — RED by name`, bad);
  }
  if (want('n2') && install) {
    // (n2) N2 EVERY OPEN PAGE FOLLOWS A ROW'S RE-KEY: pages P (phone) and D (desktop) both show v-r1 as a dead view; P resumes it from a
    // card ⇒ D's window becomes the live one (same id), and D's next save carries the live recipe — never the dead one back
    const H = hub(WSH || loadHandler(), DOC(PR_RECS()), { alive: [S, T] }), P = prPage(H, install, { DM, LM, phone: true }), D = prPage(H, install, { DM, LM, phone: false });
    D.lm._lastUserInputAt = 0;
    P.app.resumeSession(PRC(1), '/srv/p1', 'Conv 1', { backend: 'claude', backendSessionId: PRC(1) });
    await tick(5);
    answered(convWin(P, 'v-r1'), 'new-1');
    await saveNow(P); await tick(10);
    const dw = D.wins.get('v-r1');
    await saveNow(D);
    const row = H.layouts().desktops['desk-v'].autoSave.windows.find((w) => w.winId === 'v-r1'), dRow = (D.syncs('desk-v').at(-1)?.state.windows || []).find((w) => w.winId === 'v-r1');
    const deadBack = D.syncs('desk-v').filter((m) => (m.state.windows || []).some((w) => w.winId === 'v-r1' && (w.openSpec?.serverId === 'dead-1' || w.serverSessionId === 'dead-1')));
    leg(!!dw && dw._openSpec?.serverId === 'new-1' && (!dRow || dRow.openSpec?.serverId === 'new-1') && !deadBack.length && row?.openSpec?.serverId === 'new-1' && J(row.gridBounds) === J(PRGB(1)) && !closedOf(D, 'v-r1').length,
      '§PR2 (n2) N2 TWO PAGES: P resumes v-r1 ⇒ D\'s dead view of it is rebuilt as the live one under the SAME id (at its box), D never writes the dead recipe back, the hub keeps the row (new-1) and its box, 0 \'closed\'',
      { d: dw && [dw.id, dw._openSpec?.serverId, dw.gridBounds], dWrote: dRow && dRow.openSpec?.serverId, deadBack: deadBack.length, hub: row && [row.openSpec?.serverId, row.gridBounds], closed: closedOf(D, 'v-r1') });
  }
  if (want('live') && install) {
    // (live) N2 «LIVE» IS THE HUB'S TRUTH: a phone resumes a conversation another page shows LIVE (row x-r2 on X, its recipe live-2, the
    // session list names it running) ⇒ no create; a card goes to X and shows the row as itself; a resume-all leaves it where it is
    const recs = () => ({ ...PR_RECS(), 'desk-x': [prRow('x-r2', 2, { serverSessionId: 'live-2', openSpec: { action: 'attachSession', serverId: 'live-2', backend: 'claude', backendSessionId: PRC(2), cwd: '/srv/p2', mode: 'chat', name: 'Conv 2' } }), files('x-f', 3)] });
    const runs = [{ sessionId: PRC(2), backendSessionId: PRC(2), backend: 'claude', webuiId: 'live-2', status: 'running', webuiMode: 'chat' }];
    const H = hub(WSH || loadHandler(), DOC(recs()), { alive: [S, T, 'live-2'] }), P = prPage(H, install, { DM, LM }), t0 = made.length;
    P.app.sidebar._allSessions = runs;
    P.app.resumeSession(PRC(2), '/srv/p2', 'Conv 2', { backend: 'claude', backendSessionId: PRC(2) });
    await tick(10);
    const w = P.wins.get('x-r2');
    await saveNow(P);
    const row = H.layouts().desktops['desk-x'].autoSave.windows.find((r) => r.winId === 'x-r2');
    leg(P.creates.length === 0 && P.dm.activeDesktopId === 'desk-x' && w?._openSpec?.serverId === 'live-2' && !closedOf(P, 'x-r2').length && row && J(row.gridBounds) === J(PRGB(2)) && row.openSpec?.serverId === 'live-2',
      '§PR2 (live) N2 a phone\'s card resume of a conversation LIVE in another page\'s window: no create — the page goes to X and shows row x-r2 as itself (live-2), 0 \'closed\', the hub\'s row and box intact',
      { creates: P.creates.length, at: P.dm.activeDesktopId, w: w && [w.id, w._openSpec?.serverId], closed: closedOf(P, 'x-r2'), row: row && [row.winId, row.gridBounds, row.openSpec?.serverId] });
    const H2 = hub(WSH || loadHandler(), DOC(recs()), { alive: [S, T, 'live-2'] }), P2 = prPage(H2, install, { DM, LM }), t2 = made.length;
    P2.app.sidebar._allSessions = runs;
    const kept = await prResumeAll(P2, [PR_STOPPED()[1]]);
    leg(P2.creates.length === 0 && kept === 1 && P2.dm.activeDesktopId === 'desk-v' && J(toasts(t2).map(toastText)) === J(['Resumed 1 conversation where it was']),
      '§PR2 (live) …a resume-all naming it creates nothing and switches nothing — it is where it was, and is counted so', { creates: P2.creates.length, kept, at: P2.dm.activeDesktopId, said: toasts(t2).map(toastText) });
    void t0;
  }
  if (want('c4') && install) {
    // (c4) THE TWO-PAGE RESTART (userW's case — his desktop tab was open while the phone resumed): both pages show v-r1 dead; the DESKTOP
    // resumes first (live-1, same id); the phone's Resume bar, pressed before that record reached it, is answered 'resume-already-live'
    // ⇒ the phone attaches live-1 IN the row's window: one window, one id, the box kept, 0 'closed', 0 refusals
    const H = hub(WSH || loadHandler(), DOC(PR_RECS()), { alive: [S, T, 'live-1'] }), D = prPage(H, install, { DM, LM, phone: false }), P = prPage(H, install, { DM, LM, phone: true }), before = H.layouts(), t0 = made.length;
    pressResumeBar(door, D, D.wins.get('v-r1'));
    await tick(5);
    answered(convWin(D, 'v-r1'), 'live-1');
    pressResumeBar(door, P, P.wins.get('v-r1'));
    await tick(5);
    const req = P.creates[0];
    P.answers[0]?.({ type: 'error', code: 'resume-already-live', existingId: 'live-1', existingName: 'Conv 1', reqId: req && req.reqId });
    await tick(5);
    const pw = P.wins.get('v-r1');
    await saveNow(D); await saveNow(P); await tick(10); await saveNow(D);
    const after = H.layouts(), said = toasts(t0).map(toastText);
    const ids = (X) => [...X.wins.keys()].sort();
    leg(!!pw && pw._openSpec?.serverId === 'live-1' && J(rowsOf(after, 'desk-v')) === J(rowsOf(before, 'desk-v')) && J(ids(P)) === J(['v-f', 'v-r1']) && J(ids(D)) === J(['v-f', 'v-r1']) && !closedOf(P, 'v-r1').length && !closedOf(D, 'v-r1').length && !refusals(P.sock()).length && !refusals(D.sock()).length,
      '§PR2 (c4) N2 THE TWO-PAGE RESTART: the desktop resumes v-r1 first, the phone\'s stale press is answered \'resume-already-live\' ⇒ it attaches live-1 in the row\'s own window — one window, one id on both pages, the box kept, 0 \'closed\', 0 refusals',
      { p: pw && [pw.id, pw._openSpec?.serverId], pIds: ids(P), dIds: ids(D), before: rowsOf(before, 'desk-v'), after: rowsOf(after, 'desk-v'), closed: [closedOf(P, 'v-r1'), closedOf(D, 'v-r1')], refused: [refusals(P.sock()).length, refusals(D.sock()).length], said });
  }
  if (want('n3') && install) {
    // (n3) N3 THE BELT JUDGES THE SHAPE, A REFUSED PAGE RE-SENDS THE KEPT ROW: on a phone the person closes v-r1 and opens its conversation
    // again from a card (no row left to re-open ⇒ a NEW window, no box) ⇒ write 1 refused (`unplaced`) and said once; the page's window
    // takes the kept row's id ⇒ write 2 carries the kept row (id + box), accepted — 0 further refusals, 0 further toasts
    const H = hub(WSH || loadHandler(), DOC(PR_RECS()), { alive: [S, T] }), P = prPage(H, install, { DM, LM }), before = H.layouts(), t0 = made.length;
    P.lm._lastUserInputAt = Date.now();
    P.app.wm.closeWindow('v-r1');
    P.app.resumeSession(PRC(1), '/srv/p1', 'Conv 1', { backend: 'claude', backendSessionId: PRC(1) });
    await tick(5);
    const fresh = [...P.wins.keys()].find((id) => !['v-r1', 'v-f'].includes(id));
    await saveNow(P);
    const r1 = refusals(P.sock()).length, s1 = toasts(t0).map(toastText);
    await saveNow(P); await tick(10); await saveNow(P);
    const after = H.layouts(), said = toasts(t0).map(toastText);
    leg(!!fresh && r1 === 1 && refusals(P.sock()).length === 1 && J(refusals(P.sock())[0].unplaced) === J(['v-r1']) && s1.length === 1 && J(said) === J(s1) && /kept their places/.test(said[0])
      && J(rowsOf(after, 'desk-v')) === J(rowsOf(before, 'desk-v')) && P.wins.has('v-r1') && !P.wins.has(fresh),
      '§PR2 (n3) N3 write 1 (the row dropped beside a NEW boxless row of its conversation) REFUSED and said once ⇒ the page\'s window takes the kept row\'s id, write 2 carries v-r1 with its box — accepted, 0 further refusals or toasts',
      { fresh, refusals: refusals(P.sock()).map((f) => f.unplaced), said, before: rowsOf(before, 'desk-v'), after: rowsOf(after, 'desk-v'), wins: [...P.wins.keys()] });
  }
  if (want('n3p')) {
    // N3 PURE: the shape with NO evidence, its session dead or alive — refused; the controls stay accepted
    const base = [prRow('v-r1', 1), prRow('v-r2', 2), files('v-f', 0)];
    const nb = (w) => { const o = { ...w }; delete o.gridBounds; return o; };
    const next = [{ ...nb(base[0]), winId: 'win-new-1', serverSessionId: undefined }, base[1], base[2]];
    const dead = PURE.shrinkVerdict({ prev: base, next, evidence: [], alive: () => false }), live = PURE.shrinkVerdict({ prev: base, next, evidence: [], alive: () => true });
    leg(!dead.ok && !live.ok && J(dead.unplaced) === J(['v-r1']) && J(live.unplaced) === J(['v-r1']), '§PR2 (n3) PURE shrinkVerdict: a boxed row dropped beside a NEW boxless row of its conversation with NO evidence ⇒ REFUSED (`unplaced`), its session dead or alive', { dead, live });
    const grouped = PURE.shrinkVerdict({ prev: base, next: [member(nb(base[0]), ['v-r2', 'v-r1']), member(base[1], ['v-r2', 'v-r1']), base[2]], evidence: [], alive: () => false });
    leg(grouped.ok && !(grouped.unplaced || []).length, '§PR2 (n3) PURE CONTROL: a row merged into a tab group whose frame has no box yet (it carries the frame\'s) is no strip — accepted', grouped);
  }
  if (want('n4') && install) {
    // (n4) N4 THE TILE'S PRESS on a phone (a stopped conversation's placeholder): the row re-opened as itself — same id, box kept, no refusal
    const recs = { ...PR_RECS(), 'desk-v': [prRow('v-t5', 5, { serverSessionId: undefined }), files('v-f', 0)] };
    const H = hub(WSH || loadHandler(), DOC(recs), { alive: [S, T] }), P = prPage(H, install, { DM, LM }), before = H.layouts();
    const tile = P.wins.get('v-t5'); tile._placeholderOf = JSON.parse(J(recs['desk-v'][0]));
    P.lm._resumePlaceholder(tile);
    await tick(5);
    const w = P.wins.get('v-t5');
    await saveNow(P);
    leg(P.creates.length === 1 && !!w && w !== tile && !w._placeholderOf && J(rowsOf(H.layouts(), 'desk-v')) === J(rowsOf(before, 'desk-v')) && !refusals(P.sock()).length && !closedOf(P, 'v-t5').length,
      '§PR2 (n4) N4 a phone\'s press on a stopped tile: the conversation resumes in the row\'s own window — same id v-t5, the box kept on the hub, 0 refusals, 0 \'closed\'',
      { creates: P.creates.length, w: w && w.id, tile: w === tile, after: rowsOf(H.layouts(), 'desk-v'), refused: refusals(P.sock()).map((f) => f.unplaced) });
  }
  if (want('n5')) {
    // (n5) N5 ONE REFUSAL, ONE TOAST, BOTH GROUPS: the rows kept for their box AND the other windows the same refusal kept
    const base = [prRow('v-r1', 1), prRow('v-r2', 2), files('v-f', 0)];
    const W = world({ records: { 'desk-x': [], 'desk-y': [], 'desk-v': base }, active: 'desk-v', DM, LM }), t0 = made.length;
    W.app.isMobile = true;
    W.dm.onSyncRefused(JSON.parse(J({ type: 'layout-sync-refused', desktopId: 'desk-v', reason: 'shrink-without-close', unexplained: ['v-r1', 'v-r2'], unplaced: ['v-r1'], arrived: [], state: { windows: base, grid: null, updatedAt: 2000 }, sentAt: 1 })));
    const said = toasts(t0).map(toastText);
    leg(said.length === 1 && /Conv 1/.test(said[0]) && /Conv 2/.test(said[0]) && /kept their places/.test(said[0]) && /were kept too/.test(said[0]),
      '§PR2 (n5) N5 a refusal that keeps a row for its box AND another window ⇒ ONE toast naming both («“Conv 1” … kept their places …; “Conv 2” were kept too …»)', said);
  }
  return failed;
}
await section('§PR2 ROUND 2 (lane phone-resume-keeps-layout r2): the Resume bar re-opens its row (e) and nothing closes around a resume (census) — N1; every page follows a re-key (n2), a conversation live elsewhere is attached (live), the two-page restart (c4) — N2; the belt judges the shape and the refused page re-sends the kept row (n3) — N3; the tile\'s press (n4) — N4; one toast, both groups (n5) — N5', async () => {
  await pr2Legs({ install: installPR });
});

// ── §PR3 ROUND 3 (the r2 acceptance of the lane: «Try resuming anyway» closed the window its own retry had re-opened — N1, and the census
// did not see the callback; a double press closed the first resume's window in flight and its answer built a phantom view — N2; a
// pressed resume landed at the record's old z, under the window raised since — N3; a stale view acted after its window was rebuilt
// — N4; C1–C3 of its notes) ──
/** the retry bar — chat-view.js `_showRetryResumeBar`, its text as shipped, on a stand-in ChatView of window `w` (rescueViewOnly's
 *  read-only view: `_viewIntoWindow` gives the window this view) */
const retryBarOf = (src) => { const i = src.indexOf('\n  _showRetryResumeBar('), j = src.indexOf('\n  }\n', i); return new Function('t', 'UI_ICONS', `return ({\n${src.slice(i + 1, j + 4)}\n})._showRetryResumeBar;`)((x) => x, {}); };
const barView = (src, P, w) => ({ winInfo: w, app: P.app, _container: mkEl(), _resumeBar: null, _statusBar: null, sessionId: null, _readOnly: true, focus() {}, _showRetryResumeBar: retryBarOf(src) });
const PR3_Z = () => ({ ...PR_RECS(), 'desk-v': [prRow('v-r1', 1), { ...files('v-f', 0), zIndex: 300, gridBounds: { left: 0.2, top: 0.1, width: 0.4, height: 0.5 } }] });
/** window.js's z rules on the rig's wm: createWindow's own z, then its focus — each `zIndex++`; a close of the ACTIVE window raises the
 *  most recent one left (_focusMostRecent) */
const zRules = (P) => {
  const wm = P.app.wm, cw = wm.createWindow, cl = wm.closeWindow, zOf = (w) => Number(w && w.element && w.element.style.zIndex) || 0;
  wm.focusWindow = (id) => { const w = wm.windows.get(id); if (w) { w.element.style.zIndex = String(wm.zIndex++); wm.activeWindowId = id; } };
  wm.createWindow = (o) => { const prev = wm.activeWindowId, w = cw(o); if (w) { w.element.style.zIndex = String(wm.zIndex++); if (o && o.quiet) wm.activeWindowId = prev; else wm.focusWindow(w.id); } return w; }; // `quiet`: drawn, the focus stays (r4)
  wm.closeWindow = (id) => { const was = wm.activeWindowId === id; cl(id); if (was && !wm.windows.has(id)) { const top = [...wm.windows.values()].filter((x) => x._desktopId === P.dm.activeDesktopId).sort((x, y) => zOf(y) - zOf(x))[0]; wm.activeWindowId = null; if (top) wm.focusWindow(top.id); } };
  return zOf;
};
async function pr3Legs({ DM = RealDM, LM = RealLM, install = null, PURE = require(MODEL), WSH = null, CV = read('src/lib/chat-view.js'), quiet = false, legs = null } = {}) {
  const failed = [];
  const leg = (c, n, extra) => { if (!quiet) ok(c, n, extra); if (!c) failed.push(n); return !!c; };
  const want = (k) => !legs || legs.includes(k);
  const door = resumeBarDoor(CV);
  if (want('rb') && install) {
    // (rb) N1 «TRY RESUMING ANYWAY» — the Resume bar's create is answered by the no-transcript breaker, the window is rescued read-only
    // with the retry bar, the person presses it: the retry re-opens the row ITSELF; the bar closes nothing
    for (const phone of [false, true]) {
      const H = hub(WSH || loadHandler(), DOC(PR_RECS()), { alive: [S, T] }), P = prPage(H, install, { DM, LM, phone }), before = H.layouts();
      P.app._viewIntoWindow = (w) => { w._readOnly = true; w._view = barView(CV, P, w); };
      pressResumeBar(door, P, P.wins.get('v-r1'));
      await tick(5);
      const a = P.wins.get('v-r1');
      P.answers[0]?.({ type: 'error', code: 'no-convo-breaker', transcriptKnown: false, message: 'No conversation found', reqId: P.creates[0] && P.creates[0].reqId });
      const btn = a && a._view && a._view._resumeBar && a._view._resumeBar.children.find((c) => c.tagName === 'BUTTON');
      const cl = await closesDuring(P, async () => { btn?.onclick?.(); await tick(5); });
      const w = P.wins.get('v-r1');
      await saveNow(P);
      const after = H.layouts();
      leg(!!btn && P.creates.length === 2 && P.creates[1].ignoreNoConvo === true && !!w && w !== a && !w._readOnly && J(rowsOf(after, 'desk-v')) === J(rowsOf(before, 'desk-v')) && !closedOf(P, 'v-r1').length && cl.length === 1 && fenced(cl) && noFence(P),
        `§PR3 (rb) N1 «TRY RESUMING ANYWAY» on a ${phone ? 'PHONE' : 'DESKTOP'} page (the no-transcript breaker's retry bar): 1 create after the retry, the conversation keeps its window — row v-r1 itself — the record keeps the row and its box, 0 'closed', the ONE close is the row's re-opening (_reopenWin)`,
        { bar: !!btn, creates: P.creates.length, retried: P.creates[1] && P.creates[1].ignoreNoConvo, win: w && w.id, fresh: w !== a, closes: cl, before: rowsOf(before, 'desk-v'), after: rowsOf(after, 'desk-v'), closed: closedOf(P, 'v-r1'), fence: P.app._fenceRefused || [] });
    }
  }
  if (want('dp') && install) {
    // (dp) N2 TWO PRESSES (a stopped card clicked twice — common on a phone): the second resume arrives before the first create is
    // answered ⇒ it JOINS the first: one create, one window (the row's own), nothing closed; the answer lands in the window it was made for
    for (const [phone, i, id, desk] of [[false, 1, 'v-r1', 'desk-v'], [true, 1, 'v-r1', 'desk-v'], [true, 2, 'x-r2', 'desk-x']]) {
      const H = hub(WSH || loadHandler(), DOC(PR_RECS()), { alive: [S, T] }), P = prPage(H, install, { DM, LM, phone });
      const press = () => P.app.resumeSession(PRC(i), '/srv/p' + i, 'Conv ' + i, { backend: 'claude', backendSessionId: PRC(i) });
      const cl = await closesDuring(P, async () => { press(); await tick(10); press(); await tick(5); }); // the second press 10 ms later — nothing answered between
      const w = P.wins.get(id), mine = [...P.wins.values()].filter((x) => x._conversation?.backendSessionId === PRC(i) || x._openSpec?.backendSessionId === PRC(i));
      P.answers[0]?.({ type: 'created', sessionId: 'new-' + i, cwd: '/srv/p' + i, mode: 'chat', reqId: P.creates[0] && P.creates[0].reqId });
      await tick(5);
      await saveNow(P);
      const row = H.layouts().desktops[desk].autoSave.windows.find((r) => r.winId === id);
      leg(P.creates.length === 1 && mine.length === 1 && !!w && P.wins.get(id) === w && w._openSpec?.serverId === 'new-' + i && fenced(cl) && cl.length === (i === 1 ? 1 : 0) && !closedOf(P, id).length && !!row && J(row.gridBounds) === J(PRGB(i)),
        `§PR3 (dp) N2 TWO PRESSES within 200 ms on a ${phone ? 'PHONE' : 'DESKTOP'} page (row ${id}${desk === 'desk-v' ? '' : ', on a desktop not visited'}): 1 create, 1 window — the row itself — the second press joins the first (no close of its window, no second create), its answer lands in that window (no phantom view), the record keeps the row and its box`,
        { creates: P.creates.length, windows: mine.map((x) => x.id), w: w && [w.id, w._openSpec?.serverId], closes: cl, closed: closedOf(P, id), row: row && [row.winId, row.gridBounds] });
    }
  }
  if (want('inst') && install) {
    // (inst) N2 A REQUEST IS ITS WINDOW INSTANCE'S: the row's window is re-made under the same id while its create is in flight (closed as
    // its re-opening and built as the live session another page started — _attachInRow's road) ⇒ the create's answer acts on no window
    const H = hub(WSH || loadHandler(), DOC(PR_RECS()), { alive: [S, T, 'live-1'] }), P = prPage(H, install, { DM, LM, phone: false });
    P.app.resumeSession(PRC(1), '/srv/p1', 'Conv 1', { backend: 'claude', backendSessionId: PRC(1) });
    await tick(5);
    const a = P.wins.get('v-r1');
    const re = P.app._reopenWin ? P.app._reopenWin('v-r1') : (P.app.wm.closeWindow('v-r1'), { id: 'v-r1' }), how = { mode: 'chat', backend: 'claude', backendSessionId: PRC(1) };
    if (re) { if (P.app._attachInRow) P.app._attachInRow(re, 'live-1', 'Conv 1', '/srv/p1', how); else P.app.attachSession('live-1', 'Conv 1', '/srv/p1', { ...how, syncId: re.id }); }
    const b = P.wins.get('v-r1');
    P.answers[0]?.({ type: 'created', sessionId: 'new-1', cwd: '/srv/p1', mode: 'chat', reqId: P.creates[0] && P.creates[0].reqId });
    await tick(5);
    leg(!!a && !!b && a !== b && P.wins.get('v-r1') === b && !a._openSpec && !b.onClose,
      '§PR3 (inst) N2 A REQUEST IS ITS WINDOW INSTANCE\'S: the window re-made under the same id while its create was in flight ⇒ the create\'s answer is dropped — nothing bound into the closed window (no phantom view), the window under the id untouched',
      { a: !!a, b: !!b, same: a === b, aSpec: a && a._openSpec, bClose: !!(b && b.onClose) });
  }
  if (want('z') && install) {
    // (z) N3 ITS Z FOLLOWS THE ACT: v-f (z 300) overlaps read-only v-r1 (record z 201); the person's mousedown raises v-r1, then the
    // Resume bar ⇒ the resumed window — row v-r1 — ends on TOP and active; a resume-all (nobody pressed) keeps the record's order
    {
      const H = hub(WSH || loadHandler(), DOC(PR3_Z()), { alive: [S, T] }), P = prPage(H, install, { DM, LM, phone: false }), zOf = zRules(P);
      P.wins.get('v-f').element.style.zIndex = '300'; P.wins.get('v-r1').element.style.zIndex = '201'; P.app.wm.zIndex = 301;
      P.app.wm.focusWindow('v-r1');
      pressResumeBar(door, P, P.wins.get('v-r1'));
      await tick(5);
      const w = P.wins.get('v-r1'), top = Math.max(...[...P.wins.values()].filter((x) => x !== w && x._desktopId === 'desk-v').map(zOf));
      leg(!!w && w._readOnly !== true && zOf(w) > top && P.app.wm.activeWindowId === 'v-r1',
        '§PR3 (z) N3 A PRESSED RESUME ENDS ON TOP: the person raises read-only v-r1 (record z 201, under v-f at 300) and presses Resume ⇒ the resumed window — row v-r1 itself — is above every window of its desktop and active (never back at the record\'s old z, under the window raised since)',
        { z: w && zOf(w), top, active: P.app.wm.activeWindowId, win: w && w.id });
    }
    {
      const H = hub(WSH || loadHandler(), DOC(PR3_Z()), { alive: [S, T] }), P = prPage(H, install, { DM, LM, phone: false }), zOf = zRules(P);
      P.wins.get('v-f').element.style.zIndex = '300'; P.wins.get('v-r1').element.style.zIndex = '201'; P.app.wm.zIndex = 301;
      await prResumeAll(P, [PR_STOPPED()[0]]);
      await tick(5);
      const w = P.wins.get('v-r1');
      leg(!!w && zOf(w) === 201 && zOf(P.wins.get('v-f')) > zOf(w),
        '§PR3 (z) N3 CONTROL: a resume-all (nobody pressed) keeps the record\'s order — row v-r1 at its record z 201, under v-f as the record has it',
        { z: w && zOf(w), vf: zOf(P.wins.get('v-f')) });
    }
  }
  if (want('n4') && install) {
    // (n4) N4 A DISPOSED VIEW NEVER ACTS: the phone's person presses Resume on dead v-r1 — its account check waits; meanwhile the desktop
    // resumes v-r1 (live-1) and its record rebuilds the phone's dead view as the live one under the same id; the check returns ⇒ the
    // stale view does nothing: the live window untouched, no create, no close
    const H = hub(WSH || loadHandler(), DOC(PR_RECS()), { alive: [S, T, 'live-1'] }), D = prPage(H, install, { DM, LM, phone: false }), P = prPage(H, install, { DM, LM, phone: true });
    let release = null;
    P.app.resumeAccountCheck = () => new Promise((r) => { release = r; });
    const ro = P.wins.get('v-r1');
    pressResumeBar(door, P, ro);
    await tick(5);
    pressResumeBar(door, D, D.wins.get('v-r1'));
    await tick(5);
    answered(convWin(D, 'v-r1'), 'live-1');
    await saveNow(D); await tick(20);
    const b = P.wins.get('v-r1');
    const cl = await closesDuring(P, async () => { release?.({ ok: true }); await tick(10); });
    leg(typeof release === 'function' && !!b && b !== ro && b._openSpec?.serverId === 'live-1' && P.wins.get('v-r1') === b && P.creates.length === 0 && !cl.length && !closedOf(P, 'v-r1').length,
      '§PR3 (n4) N4 A DISPOSED VIEW NEVER ACTS: the phone\'s Resume press waits on its account check while the desktop\'s resume rebuilds the phone\'s dead view as live-1 under the same id ⇒ when the check returns the stale view acts on nothing — the live window untouched, 0 creates, 0 closes',
      { held: typeof release === 'function', b: b && [b.id, b._openSpec?.serverId], rebuilt: b !== ro, creates: P.creates.length, closes: cl, closed: closedOf(P, 'v-r1') });
  }
  if (want('c1')) {
    // (c1) C1 A REFUSED NEWCOMER STAYS REFUSED (an old bundle's page — it cannot give the kept row's id to its window): write 1 drops x-r2
    // for a boxless newcomer — refused; its re-send keeps x-r2 AND adds the newcomer with no box — the same refusal, nothing lands
    const base = [prRow('x-r2', 2), files('x-f', 3)];
    const nc = (id) => { const o = prRow(id, 2, { serverSessionId: 'new-2', openSpec: { action: 'attachSession', serverId: 'new-2', backend: 'claude', backendSessionId: PRC(2), cwd: '/srv/p2', mode: 'chat', name: 'Conv 2' } }); delete o.gridBounds; return o; };
    const H = hub(WSH || loadHandler(), DOC({ 'desk-v': [], 'desk-y': [], 'desk-x': base }), { alive: [S, T, 'new-2'] }), old = H.connect();
    const sync = (S0, windows, evidence, at) => S0.send({ type: 'layout-sync', desktopId: 'desk-x', state: { windows, grid: null }, evidence, base: 1000, sentAt: at, viewport: 'phone' });
    await sync(old, [nc('win-n2'), base[1]], [{ id: 'x-r2', why: 'replaced', by: 'win-n2' }], 1);
    const r1 = refusals(old).length;
    await sync(old, [...base, nc('win-n2')], [], 2);
    const rows1 = rowsOf(H.layouts(), 'desk-x');
    leg(r1 === 1 && J(rows1) === J(rowsOf(DOC({ 'desk-x': base }), 'desk-x')),
      '§PR3 (c1) C1 A REFUSED NEWCOMER STAYS REFUSED: an old page\'s write 1 (x-r2 replaced by a boxless newcomer) is refused; its re-send — the kept record AND that newcomer with no box — is the same refusal: the hub keeps [x-r2 at its box, x-f], no second row of the conversation lands',
      { refusals: refusals(old).map((f) => f.unplaced), rows: rows1 });
    const H2 = hub(WSH || loadHandler(), DOC({ 'desk-v': [], 'desk-y': [], 'desk-x': base }), { alive: [S, T, 'new-2'] }), other = H2.connect();
    await sync(other, [...base, nc('win-f9')], [], 3);
    const rows2 = rowsOf(H2.layouts(), 'desk-x');
    leg(rows2.length === 3 && rows2.some((r) => r[0] === 'win-f9') && !refusals(other).length,
      '§PR3 (c1) C1 CONTROL: another page\'s new boxless row of the same conversation it was never refused for (a young fork) beside the placed row — taken', { rows: rows2, refused: refusals(other).length });
  }
  if (want('c2')) {
    // (c2) C2 A GUEST CARRIES ITS FRAME'S BOX — THE FRAME IS JUDGED: a placed group whose head strips its box while staying grouped, or
    // the whole group, is refused; a guest with no box under a head that keeps its box, a merge into a frame never placed — taken
    const nb = (w) => { const o = { ...w }; delete o.gridBounds; return o; }, g = (w) => member(w, ['v-r2', 'v-r1']);
    const base = [g(prRow('v-r1', 1)), g(prRow('v-r2', 2)), files('v-f', 0)];
    const head = PURE.shrinkVerdict({ prev: base, next: [base[0], g(nb(prRow('v-r2', 2))), base[2]], evidence: [], alive: () => false });
    const whole = PURE.shrinkVerdict({ prev: base, next: [g(nb(prRow('v-r1', 1))), g(nb(prRow('v-r2', 2))), base[2]], evidence: [], alive: () => false });
    leg(!head.ok && J(head.unplaced) === J(['v-r2']) && !whole.ok && J([...(whole.unplaced || [])].sort()) === J(['v-r1', 'v-r2']),
      '§PR3 (c2) C2 PURE shrinkVerdict: a PLACED group whose head strips its box while staying grouped — or the whole group — is REFUSED (`unplaced` names the frame, and every guest that lost the frame\'s box)', { head, whole });
    const guest = PURE.shrinkVerdict({ prev: base, next: [g(nb(prRow('v-r1', 1))), base[1], base[2]], evidence: [], alive: () => false });
    const fresh = PURE.shrinkVerdict({ prev: [prRow('a-1', 1), nb(prRow('b-2', 2))], next: [member(nb(prRow('a-1', 1)), ['b-2', 'a-1']), member(nb(prRow('b-2', 2)), ['b-2', 'a-1'])], evidence: [], alive: () => false });
    leg(guest.ok && fresh.ok, '§PR3 (c2) C2 CONTROLS: a guest with no box under a head that keeps its box; a row merged as a guest into a frame never placed — both taken', { guest, fresh });
  }
  if (want('c3') && install) {
    // (c3) C3 A GROUPED WINDOW TAKES ITS KEPT ROW TOO: on a phone the person closes v-r1, opens its conversation again (a NEW window, no
    // box) and groups it with v-f before the save ⇒ write 1 refused; the grouped window takes v-r1's id IN its group (rekeyWindow
    // `inChain`) ⇒ one window and one row of the conversation, the box kept
    const H = hub(WSH || loadHandler(), DOC(PR_RECS()), { alive: [S, T] }), P = prPage(H, install, { DM, LM }), before = H.layouts();
    P.lm._lastUserInputAt = Date.now();
    P.app.wm.closeWindow('v-r1');
    P.app.resumeSession(PRC(1), '/srv/p1', 'Conv 1', { backend: 'claude', backendSessionId: PRC(1) });
    await tick(5);
    const fresh = [...P.wins.keys()].find((id) => !['v-r1', 'v-f'].includes(id)), fw = P.wins.get(fresh);
    if (fw) { const c = { tabs: ['v-f', fresh], active: 1, layout: 'tabs', order: ['v-f', fresh] }; fw._tabChain = c; P.wins.get('v-f')._tabChain = c; }
    await saveNow(P); await saveNow(P); await tick(10); await saveNow(P);
    const after = H.layouts(), conv = after.desktops['desk-v'].autoSave.windows.filter((r) => r.backendSessionId === PRC(1) || r.openSpec?.backendSessionId === PRC(1));
    const w = P.wins.get('v-r1');
    leg(!!fresh && refusals(P.sock()).length === 1 && !!w && w === fw && !P.wins.has(fresh) && J(w._tabChain?.tabs) === J(['v-f', 'v-r1']) && conv.length === 1 && conv[0].winId === 'v-r1' && J(conv[0].gridBounds) === J(PRGB(1)),
      '§PR3 (c3) C3 a phone\'s new window of v-r1\'s conversation GROUPED with v-f before the save: write 1 refused, the grouped window takes v-r1\'s id in its group ⇒ one window and one row of the conversation (v-r1, its box kept) — no duplicate rebuilt beside it',
      { fresh, refusals: refusals(P.sock()).map((f) => f.unplaced), w: w && [w.id, w === fw, w._tabChain?.tabs], conv: conv.map((r) => [r.winId, r.gridBounds]), wins: [...P.wins.keys()], before: rowsOf(before, 'desk-v'), after: rowsOf(after, 'desk-v') });
  }
  if (want('ph') && install) {
    // (ph) A TILE REPLACED BY THE LIVE WINDOW KEEPS ITS PLACE: a desktop page shows x-r2 as a stopped TILE on desk-x (on show); the
    // phone resumes Conv 2 from a card (the row re-opened; its record names the live session — and, for a desktop, no box) ⇒ the
    // desktop's tile becomes the live window AT THE TILE'S BOX — the record it holds (its next save) has the row at its box
    const H = hub(WSH || loadHandler(), DOC(PR_RECS()), { alive: [S, T, 'new-2'] }), D = prPage(H, install, { DM, LM, phone: false, on: 'desk-x' }), P = prPage(H, install, { DM, LM, phone: true, on: 'desk-x' });
    for (const X of [D, P]) for (const [d, v] of Object.entries(H.layouts().desktops)) X.dm.noteStamp(d, v.autoSave.updatedAt);
    const tile = D.wins.get('x-r2'); if (tile) Object.assign(tile, { type: 'chat', gridBounds: PRGB(2), _placeholderOf: JSON.parse(J(PR_RECS()['desk-x'][0])) }); // the restore's tile of a row it could not build
    P.app.resumeSession(PRC(2), '/srv/p2', 'Conv 2', { backend: 'claude', backendSessionId: PRC(2) });
    await tick(5);
    P.answers[0]?.({ type: 'created', sessionId: 'new-2', cwd: '/srv/p2', mode: 'chat', reqId: P.creates[0] && P.creates[0].reqId });
    await saveNow(P); await tick(10);
    const w = D.wins.get('x-r2'), held = (D.dm.recordFor('desk-x').windows || []).find((r) => r.winId === 'x-r2');
    leg(!!tile && !!w && w !== tile && !w._placeholderOf && w._openSpec?.serverId === 'new-2' && J(w.gridBounds) === J(PRGB(2)) && !!held && J(held.gridBounds) === J(PRGB(2)),
      '§PR3 (ph) A TILE REPLACED BY THE LIVE WINDOW KEEPS ITS PLACE: the phone resumes x-r2 while a desktop page shows it as a stopped tile ⇒ the desktop\'s tile becomes the live window (new-2) at the tile\'s box — the record the desktop holds (its next save) has the row at its box, never the desktop\'s default',
      { tile: !!tile, w: w && [w.id, w._openSpec?.serverId, w.gridBounds], held: held && held.gridBounds, psent: P.syncs().map((m) => m.desktopId) });
  }
  if (want('owe') && install) {
    // (owe) A RESUMED ROW'S LIVE RECIPE REACHES THE HUB THOUGH ANOTHER PAGE'S RECORD LANDED FIRST: the phone's person presses Resume on
    // v-r1; before its create is answered the desktop's record of V lands on the phone (the anti-echo gate clears its dirty bit); the
    // answer comes ⇒ the phone still writes v-r1's live recipe — owed until a save carries it — and the hub's row names new-1
    const H = hub(WSH || loadHandler(), DOC(PR_RECS()), { alive: [S, T, 'new-1'] }), D = prPage(H, install, { DM, LM, phone: false }), P = prPage(H, install, { DM, LM, phone: true });
    for (const X of [D, P]) for (const [d, v] of Object.entries(H.layouts().desktops)) X.dm.noteStamp(d, v.autoSave.updatedAt);
    const st = globalThis.setTimeout; globalThis.setTimeout = (f, ms, ...a) => st(f, ms === 1000 || ms === 500 || ms === 200 ? 5 : ms, ...a); // the apply's gate, the debounce, the retry — at the fast tier's clock
    try {
      P.lm._userDirty = true; P.lm._lastUserInputAt = Date.now(); // the person's press on the phone
      pressResumeBar(door, P, P.wins.get('v-r1'));
      await tick(5);
      await saveNow(D); await tick(20);
      const cleared = P.lm._userDirty === false;
      P.answers[0]?.({ type: 'created', sessionId: 'new-1', cwd: '/srv/p1', mode: 'chat', reqId: P.creates[0] && P.creates[0].reqId });
      await tick(60);
      const row = H.layouts().desktops['desk-v'].autoSave.windows.find((r) => r.winId === 'v-r1');
      leg(cleared && P.wins.get('v-r1')?._openSpec?.serverId === 'new-1' && row?.openSpec?.serverId === 'new-1' && J(row.gridBounds) === J(PRGB(1)),
        '§PR3 (owe) A RESUMED ROW\'S LIVE RECIPE REACHES THE HUB: the desktop\'s record landed on the phone between its Resume press and the create\'s answer (its dirty bit cleared) ⇒ the phone still writes row v-r1 naming the live session new-1, at its box — never left naming the dead one',
        { cleared, p: P.wins.get('v-r1')?._openSpec?.serverId, row: row && [row.openSpec?.serverId, row.gridBounds], psent: P.syncs('desk-v').length });
    } finally { globalThis.setTimeout = st; }
  }
  return failed;
}
await section('§PR3 ROUND 3 (lane phone-resume-keeps-layout r3): «Try resuming anyway» re-opens its row, the bar closes nothing (rb) — N1, the fence is a census (§PR2 census); two presses join (dp), a request is its window instance\'s (inst) — N2; a pressed resume is on top, a resume-all keeps the record\'s order (z) — N3; a disposed view never acts (n4) — N4; C1 (c1), C2 (c2), C3 (c3); a tile rebuilt live keeps its place (ph); a resumed row\'s live recipe reaches the hub (owe)', async () => {
  await pr3Legs({ install: installPR });
});

// ── ROUND 4 (lane phone-resume-keeps-layout r4 — the r3 acceptance of 5033f0a06: N1 an owed recipe carried once, N2 a pending resume
// released at every end of its create, N3 only a press lands on top, N4 the refusal memory survives a reconnect, N5 the fence's dynamic
// half; the three residuals: a resume-all window takes no focus, the reconnect memory (= N4), a desktop's own box for a row a phone names) ──
/** manage-agents.js's OWN _poolColdRestart text (the pool's cold restart — a resume nobody pressed), bound to the rig's app */
const PCR = (src = read('src/lib/manage-agents.js')) => { const i = src.indexOf('\n  _poolColdRestart('), j = src.indexOf('\n  },\n', i); return new Function('window', `return ({\n${src.slice(i + 1, j + 4)}\n})._poolColdRestart;`)(globalThis.window || {}); };
/** the product's gates at the fast tier's clock (the apply's 1 s, the debounce, the switch, the deferral, the stagger, the cold restart's waits) */
const fastClock = async (fn, map = { 1000: 5, 500: 5, 200: 5, 1100: 5, 400: 0, 15000: 40 }) => { const st = globalThis.setTimeout; globalThis.setTimeout = (f, ms, ...a) => st(f, ms in map ? map[ms] : ms, ...a); try { return await fn(); } finally { globalThis.setTimeout = st; } };
const savesSince = (P, from) => [...new Set(P.syncs().slice(from).map((m) => m.sentAt))];
const hubName = (H, d, id) => { const r = (H.layouts().desktops[d]?.autoSave?.windows || []).find((w) => w.winId === id); return r ? (r.openSpec?.serverId || r.serverSessionId || null) : null; };
async function pr4Legs({ DM = RealDM, LM = RealLM, install = null, WSH = null, CV = read('src/lib/chat-view.js'), MA = read('src/lib/manage-agents.js'), WSRC = read('src/lib/window.js'), quiet = false, legs = null, ends = null } = {}) {
  const failed = [];
  const leg = (c, n, extra) => { if (!quiet) ok(c, n, extra); if (!c) failed.push(n); return !!c; };
  const want = (k) => !legs || legs.includes(k);
  const door = resumeBarDoor(CV);
  if (want('owe') && install) {
    // (owe) N1 AN OWED RECIPE IS CARRIED ONCE — the phone's «Resume all» (V on show, X and Y never visited); the person switches to Y
    // before the creates are answered; the answers come ⇒ ONE save carries the three live recipes (the owed windows' desktops, nothing
    // else); the person's input time and dirty bit untouched (no input fabricated); the phone idles and a desktop page writes Y ten
    // times ⇒ the phone writes NOTHING (the storm law: one act, one write)
    await fastClock(async () => {
      const H = hub(WSH || loadHandler(), DOC({ ...PR_RECS(), 'desk-y': [prRow('y-r3', 3), files('y-f', 4)] }), { alive: [S, T, 'new-1', 'new-2', 'new-3'] });
      const P = prPage(H, install, { DM, LM }), D = prPage(H, install, { DM, LM, phone: false, on: 'desk-y' });
      for (const X of [D, P]) for (const [d, v] of Object.entries(H.layouts().desktops)) X.dm.noteStamp(d, v.autoSave.updatedAt);
      await prResumeAll(P, PR_STOPPED()); await tick(20);
      await P.dm.switchTo('desk-y'); await tick(30);
      const idleAt = Date.now() - 120000; P.lm._userDirty = false; P.lm._lastUserInputAt = idleAt; // the person's last input: two minutes ago
      const from = P.syncs().length;
      P.creates.forEach((c, k) => P.answers[k]?.({ type: 'created', sessionId: 'new-' + (k + 1), cwd: c.cwd, mode: 'chat', reqId: c.reqId }));
      await tick(60);
      const saves = savesSince(P, from), desks = P.syncs().slice(from).map((m) => m.desktopId).sort();
      const names = [['desk-v', 'v-r1'], ['desk-x', 'x-r2'], ['desk-y', 'y-r3']].map(([d, id]) => hubName(H, d, id));
      leg(P.creates.length === 3 && saves.length === 1 && J(desks) === J(['desk-v', 'desk-x', 'desk-y']) && J(names) === J(['new-1', 'new-2', 'new-3']) && P.lm._lastUserInputAt === idleAt && P.lm._userDirty === false && !P.lm._owedRecipes?.size,
        '§PR4 (owe) N1 AN OWED RECIPE IS CARRIED ONCE: the phone\'s resume-all answered after the person switched to Y ⇒ ONE save carries the three live recipes (V, X — desktops not on show — and Y), the hub\'s rows name new-1/2/3; no input fabricated (the person\'s input time and dirty bit untouched), nothing owed after',
        { creates: P.creates.length, saves: saves.length, desks, names, inputAge: Date.now() - P.lm._lastUserInputAt, dirty: P.lm._userDirty, owed: [...(P.lm._owedRecipes || [])] });
      const before = P.syncs().length;
      for (let k = 0; k < 10; k++) { const f = D.wins.get('y-f'); if (f) f.gridBounds = { ...GB(4), left: 0.01 * (k + 1) }; await saveNow(D); await tick(15); } // an echo leaves ~10 ms after its record at this clock
      const echoes = P.syncs().length - before;
      leg(echoes === 0 && P.lm._lastUserInputAt === idleAt && P.lm._userDirty === false,
        '§PR4 (owe) N1 …THE IDLE PHONE NEVER ECHOES: a desktop page then writes Y ten times ⇒ the phone sends 0 records (no recipe re-armed by a remote record, no input fabricated, the 60 s expiry keeps its meaning)',
        { echoes, inputAge: Date.now() - P.lm._lastUserInputAt, dirty: P.lm._userDirty, owed: [...(P.lm._owedRecipes || [])] });
    });
    // …a plain NEW session: answered after the person switched desktops — carried by one save of ITS desktop; the idle page then echoes nothing
    await fastClock(async () => {
      const H = hub(WSH || loadHandler(), DOC(PR_RECS()), { alive: [S, T, 'new-9'] }), D = prPage(H, install, { DM, LM, phone: false }), E = prPage(H, install, { DM, LM, phone: false, on: 'desk-x' });
      for (const X of [D, E]) for (const [d, v] of Object.entries(H.layouts().desktops)) X.dm.noteStamp(d, v.autoSave.updatedAt);
      D.lm._userDirty = true; D.lm._lastUserInputAt = Date.now();
      const had = new Set(D.wins.keys());
      D.app.createSession({ cwd: '/srv/n9', name: 'New 9', mode: 'chat', backend: 'claude' });
      const nw = [...D.wins.values()].find((w) => !had.has(w.id)) || null; // the new window (createSession answers with no window)
      await tick(10);
      await D.dm.switchTo('desk-x'); await tick(30);
      const idleAt = Date.now() - 120000; D.lm._userDirty = false; D.lm._lastUserInputAt = idleAt;
      const from = D.syncs().length;
      D.answers[0]?.({ type: 'created', sessionId: 'new-9', cwd: '/srv/n9', mode: 'chat', reqId: D.creates[0] && D.creates[0].reqId });
      await tick(60);
      const saves = savesSince(D, from), desks = D.syncs().slice(from).map((m) => m.desktopId), name = nw ? hubName(H, 'desk-v', nw.id) : null;
      const before = D.syncs().length;
      for (let k = 0; k < 5; k++) { const f = E.wins.get('x-f'); if (f) f.gridBounds = { ...GB(3), left: 0.01 * (k + 1) }; await saveNow(E); await tick(15); }
      const echoes = D.syncs().length - before;
      leg(!!nw && saves.length === 1 && J(desks) === J(['desk-v']) && name === 'new-9' && echoes === 0 && D.lm._lastUserInputAt === idleAt && !D.lm._owedRecipes?.size,
        '§PR4 (owe) N1 A NEW SESSION answered after the person switched desktops: ONE save of its own desktop (V, not on show) carries its recipe — the hub names new-9 — and five remote records of X later the idle page has echoed 0',
        { win: nw && nw.id, saves: saves.length, desks, name, echoes, inputAge: Date.now() - D.lm._lastUserInputAt, owed: [...(D.lm._owedRecipes || [])] });
    });
  }
  if (want('owe-r') && install) {
    // (owe-r) N1 …A RECIPE SAVE THE HUB REFUSES IS OWED AGAIN: a desktop page's resume of x-r2 (a desktop not visited) answered; the hub refuses
    // that one save of X as STALE (injected: its newer record — another page moved x-f meanwhile) ⇒ the recipe is owed again and the
    // save after the reconcile carries it: the hub names new-2 (a record refused and unchanged stays the breaker's — never re-sent)
    await fastClock(async () => {
      const H = hub(WSH || loadHandler(), DOC(PR_RECS()), { alive: [S, T, 'new-2'] }), P = prPage(H, install, { DM, LM, phone: false }); // a desktop page (a phone writes no box: the newer record's move is a desktop's)
      for (const [d, v] of Object.entries(H.layouts().desktops)) P.dm.noteStamp(d, v.autoSave.updatedAt);
      P.app.resumeSession(PRC(2), '/srv/p2', 'Conv 2', { backend: 'claude', backendSessionId: PRC(2), winBounds: { gridBounds: PRGB(2), desktopId: 'desk-x', winId: 'x-r2' }, stay: true });
      await tick(20);
      P.lm._userDirty = false; P.lm._lastUserInputAt = Date.now() - 120000;
      const send = P.app.ws.send; let refusedOne = 0;
      const newer = () => { const r = JSON.parse(J(H.layouts().desktops['desk-x'].autoSave)); r.windows = r.windows.map((w) => (w.winId === 'x-f' ? { ...w, gridBounds: { ...w.gridBounds, left: 0.05 } } : w)); r.updatedAt = Date.now(); return r; };
      P.app.ws.send = (m) => { if (m && m.type === 'layout-sync' && m.desktopId === 'desk-x' && !refusedOne) { refusedOne = 1; setTimeout(() => { for (const h of [...P.handlers]) h({ type: 'layout-sync-refused', desktopId: 'desk-x', reason: 'stale', state: newer(), sentAt: m.sentAt ?? null }); }, 2); return; } return send(m); };
      const from = P.syncs().length;
      P.answers[0]?.({ type: 'created', sessionId: 'new-2', cwd: '/srv/p2', mode: 'chat', reqId: P.creates[0] && P.creates[0].reqId });
      await tick(80);
      const xs = P.syncs().slice(from).filter((m) => m.desktopId === 'desk-x').length;
      leg(refusedOne === 1 && hubName(H, 'desk-x', 'x-r2') === 'new-2' && xs === 1 && !P.lm._owedRecipes?.size,
        '§PR4 (owe-r) N1 A RECIPE SAVE THE HUB REFUSES IS OWED AGAIN: the one save of X that carried x-r2\'s live recipe refused ⇒ the save after the reconcile carries it (2 saves of X in all) — the hub names new-2',
        { refused: refusedOne, xSaves: xs, name: hubName(H, 'desk-x', 'x-r2'), owed: [...(P.lm._owedRecipes || [])] });
    });
  }
  if (want('rel') && install) {
    // (rel) N2 A PENDING RESUME IS RELEASED AT EVERY END OF ITS CREATE: the watchdog, an error naming no request (ws-create's «Failed to
    // spawn session»), a reconnect that will not re-send the create, the person's close of the waiting window ⇒ the next press CREATES
    // again (the row re-opened — one window of the conversation); a press while the create is LIVE joins it, focused and said
    const press = (P) => P.app.resumeSession(PRC(1), '/srv/p1', 'Conv 1', { backend: 'claude', backendSessionId: PRC(1) });
    const end4 = (e) => !ends || ends.includes(e); // a mutant runs its own ending only (the fast tier's clock)
    for (const end of ['timeout', 'reqless', 'reconnect', 'closed'].filter(end4)) {
      const H = hub(WSH || loadHandler(), DOC(PR_RECS()), { alive: [S, T] }), P = prPage(H, install, { DM, LM, phone: false });
      press(P); await tick(5);
      const a = P.wins.get('v-r1');
      if (end === 'timeout') P.reqOpts[0]?.onTimeout?.();
      if (end === 'reqless') P.answers[0]?.({ type: 'error', message: 'Failed to spawn session: spawn ENOENT' });
      if (end === 'reconnect') { P.hangUp(); P.reconnect(); }
      if (end === 'closed') P.app.wm.requestClose('v-r1'); // the person's ✕ — another turn: the fence never holds the person
      await tick(5);
      const gone = end === 'closed' ? !P.wins.has('v-r1') : true;
      press(P); await tick(5);
      const mine = [...P.wins.values()].filter((x) => x._conversation?.backendSessionId === PRC(1) || x._openSpec?.backendSessionId === PRC(1));
      leg(!!a && gone && P.creates.length === 2 && mine.length === 1 && mine[0] !== a && noFence(P),
        `§PR4 (rel) N2 RELEASED AT ${{ timeout: 'THE WATCHDOG (15 s)', reqless: 'AN ERROR NAMING NO REQUEST (an older hub\'s «Failed to spawn session» — this hub names it)', reconnect: 'A RECONNECT THAT WILL NOT RE-SEND THE CREATE', closed: 'THE PERSON\'S CLOSE of the waiting window' }[end]}: the next press sends a create — one window of the conversation, a new one (never a join with the dead wait)`,
        { creates: P.creates.length, windows: mine.map((x) => x.id), fresh: mine[0] !== a, gone, fence: P.app._fenceRefused || [] });
    }
    if (end4('join')) {
      const H = hub(WSH || loadHandler(), DOC(PR_RECS()), { alive: [S, T] }), P = prPage(H, install, { DM, LM, phone: false }), t0 = (globalThis.__lifeToasts ||= []).length;
      press(P); await tick(5); P.app.wm.activeWindowId = 'v-f'; press(P); await tick(5);
      const said = globalThis.__lifeToasts.slice(t0).filter((s) => /^Still resuming this conversation/.test(s)); // the lifecycle's toast (its stub records it)
      leg(P.creates.length === 1 && said.length === 1 && P.app.wm.activeWindowId === 'v-r1',
        '§PR4 (rel) N2 A PRESS WHILE THE CREATE IS LIVE JOINS IT — focused and SAID («Still resuming this conversation — its window is waiting for the session to start»), no second create', { creates: P.creates.length, said, active: P.app.wm.activeWindowId });
    }
    if (!ends) {
      // …and the hub names the request on EVERY create error (ws-create: «Unknown backend», «Unknown host» ×2 and «Failed to spawn session» were bare) — the
      // page's matched branch ends the wait and the window says why
      const WC = read('src/ws-create.js'), bare = [...WC.matchAll(/ws\.send\(JSON\.stringify\(\{ type: 'error',[^\n]*/g)].map((m) => m[0]).filter((l) => !/reqId: data\.reqId/.test(l));
      leg(!bare.length, '§PR4 (rel) N2 THE HUB NAMES THE REQUEST on every create error frame (ws-create — «Unknown backend», «Unknown host», «Failed to spawn session» included): the page\'s matched branch ends the wait and the window says why', bare);
    }
    if (!ends) {
      globalThis.__uiRows = { claude: { resumeResend: true } }; // a harness whose resume IS re-sent at the reconnect (claude, codex)
      try {
        const H = hub(WSH || loadHandler(), DOC(PR_RECS()), { alive: [S, T] }), P = prPage(H, install, { DM, LM, phone: false });
        press(P); await tick(5); P.hangUp(); P.reconnect(); await tick(5); press(P); await tick(5);
        leg(P.creates.length === 1, '§PR4 (rel) N2 CONTROL: a harness that re-sends its resume at the reconnect — the create is still in flight there: the press joins it (1 create)', { creates: P.creates.length });
      } finally { delete globalThis.__uiRows; }
    }
  }
  if (want('z2') && install) {
    // (z2) N3 ONLY A PRESS LANDS ON TOP: the person works in v-f (z 300, focused); a resume nobody pressed re-opens read-only v-r1 (record
    // z 201) — the exit respawn, the pool's cold restart, the resume-all ⇒ the record's z, UNDER v-f, and v-f keeps the focus
    const roads = [
      ['THE EXIT RESPAWN (_respawnAfterExit)', async (P) => { P.app._respawnAfterExit({ backendSessionId: PRC(1), cwd: '/srv/p1', name: 'Conv 1', mode: 'chat', backend: 'claude', serverId: 'dead-1' }); }],
      ['THE POOL\'S COLD RESTART (_poolColdRestart)', async (P) => { P.app.killSession = () => {}; await fastClock(async () => { PCR(MA).call(P.app, { backendSessionId: PRC(1), cwd: '/srv/p1', backend: 'claude', serverId: 'dead-1' }, 'pool-1'); for (const h of [...P.handlers]) h({ type: 'exited', sessionId: 'dead-1' }); await tick(20); }); }],
      ['THE RESUME-ALL', async (P) => { await prResumeAll(P, [PR_STOPPED()[0]]); }],
    ];
    for (const [road, run] of roads) {
      const H = hub(WSH || loadHandler(), DOC(PR3_Z()), { alive: [S, T] }), P = prPage(H, install, { DM, LM, phone: false }), zOf = zRules(P);
      P.wins.get('v-f').element.style.zIndex = '300'; P.wins.get('v-r1').element.style.zIndex = '201'; P.app.wm.zIndex = 301;
      P.app.wm.focusWindow('v-f'); // the person works in v-f
      await run(P); await tick(5);
      const w = P.wins.get('v-r1'), vf = P.wins.get('v-f');
      leg(P.creates.length === 1 && !!w && !w._readOnly && zOf(w) === 201 && zOf(vf) > zOf(w) && P.app.wm.activeWindowId === 'v-f',
        `§PR4 (z2) N3 ONLY A PRESS LANDS ON TOP — ${road}: the re-opened row v-r1 keeps its record z (201, under v-f) and the person's window v-f keeps the focus`,
        { creates: P.creates.length, z: w && zOf(w), vf: zOf(vf), active: P.app.wm.activeWindowId });
    }
    {
      const H = hub(WSH || loadHandler(), DOC(PR3_Z()), { alive: [S, T] }), P = prPage(H, install, { DM, LM, phone: false }), zOf = zRules(P);
      P.wins.get('v-f').element.style.zIndex = '300'; P.wins.get('v-r1').element.style.zIndex = '201'; P.app.wm.zIndex = 301;
      P.app.wm.focusWindow('v-r1'); // the person reads the dead window
      P.app._respawnAfterExit({ backendSessionId: PRC(1), cwd: '/srv/p1', name: 'Conv 1', mode: 'chat', backend: 'claude', serverId: 'dead-1' }); await tick(5);
      const w = P.wins.get('v-r1'), top = Math.max(...[...P.wins.values()].filter((x) => x !== w && x._desktopId === 'desk-v').map(zOf));
      leg(!!w && zOf(w) > top && P.app.wm.activeWindowId === 'v-r1', '§PR4 (z2) N3 CONTROL: the window the person is IN is theirs — the respawn of the dead window they read lands on top, focused', { z: w && zOf(w), top, active: P.app.wm.activeWindowId });
    }
  }
  if (want('n4r')) {
    // (n4r) N4 THE REFUSAL MEMORY SURVIVES A RECONNECT: an old page's write 1 (x-r2 replaced by a boxless newcomer) is refused; the page
    // comes back on a NEW socket (a phone woken) and on a RESTARTED hub (a new process over the same data/) — its re-send (the kept
    // record AND the boxless newcomer) is the same refusal both times; the person's close of the placed row ends it
    const base = [prRow('x-r2', 2), files('x-f', 3)];
    const nc = (id) => { const o = prRow(id, 2, { serverSessionId: 'new-2', openSpec: { action: 'attachSession', serverId: 'new-2', backend: 'claude', backendSessionId: PRC(2), cwd: '/srv/p2', mode: 'chat', name: 'Conv 2' } }); delete o.gridBounds; return o; };
    const sync = (S0, H0, windows, evidence, at) => S0.send({ type: 'layout-sync', desktopId: 'desk-x', state: { windows, grid: null }, evidence, base: H0.layouts().desktops['desk-x'].autoSave.updatedAt, sentAt: at, viewport: 'phone' });
    const H = hub(WSH || loadHandler(), DOC({ 'desk-v': [], 'desk-y': [], 'desk-x': base }), { alive: [S, T, 'new-2'] }), old = H.connect();
    await sync(old, H, [nc('win-n2'), base[1]], [{ id: 'x-r2', why: 'replaced', by: 'win-n2' }], 1);
    const snap = JSON.parse(J(H.layouts())); // the record as the refusal left it (the CONTROL's own hub)
    H.hangUp(old); const woken = H.connect();
    await sync(woken, H, [...base, nc('win-n2')], [], 2);
    const rowsW = rowsOf(H.layouts(), 'desk-x');
    const H2 = hub(WSH || loadHandler(), H.layouts(), { alive: [S, T, 'new-2'] }), fresh = H2.connect();
    await sync(fresh, H2, [...base, nc('win-n2')], [], 3);
    const rowsR = rowsOf(H2.layouts(), 'desk-x'), kept = J(rowsOf(DOC({ 'desk-x': base }), 'desk-x'));
    leg(refusals(old).length === 1 && refusals(woken).length === 1 && refusals(fresh).length === 1 && J(rowsW) === kept && J(rowsR) === kept,
      '§PR4 (n4r) N4 THE REFUSAL MEMORY SURVIVES A RECONNECT: the refused newcomer re-sent beside its kept row from a NEW socket (a phone woken) and to a RESTARTED hub over the same data/ — refused both times; the hub keeps [x-r2 at its box, x-f]',
      { refusals: [refusals(old).length, refusals(woken).length, refusals(fresh).length], woken: rowsW, restarted: rowsR, memory: H2.layouts().desktops['desk-x'].refusedNewcomers || null });
    const H3 = hub(WSH || loadHandler(), snap, { alive: [S, T, 'new-2'] }), page = H3.connect();
    await sync(page, H3, [base[1]], [{ id: 'x-r2', why: 'closed' }], 4);
    await sync(page, H3, [base[1], nc('win-n2')], [], 5);
    const rowsC = rowsOf(H3.layouts(), 'desk-x');
    leg(!refusals(page).length && rowsC.some((r) => r[0] === 'win-n2') && !rowsC.some((r) => r[0] === 'x-r2') && !H3.layouts().desktops['desk-x'].refusedNewcomers,
      '§PR4 (n4r) N4 CONTROL: the person closes the placed row (its close as evidence) — the refusal ends (the record forgets it); a boxless window of the conversation then lands', { rows: rowsC, refusals: refusals(page).length, memory: H3.layouts().desktops['desk-x'].refusedNewcomers || null });
  }
  if (want('f5') && install) {
    // (f5) N5 THE FENCE'S DYNAMIC HALF: the d159c081b retry bar planted back — its close now through wm.requestClose, an ALLOWED census row
    // — ⇒ the product REFUSES it (the window is in the resume's turn) and journals it by name: the conversation keeps its window
    const planted = CV.replace('    btn.onclick = () => { btn.disabled = true; onRetry?.(); };', '    btn.onclick = () => { btn.disabled = true; try { onRetry?.(); } finally { this.app.wm?.requestClose?.(this.winInfo?.id); } };');
    for (const phone of [false, true]) {
      const H = hub(WSH || loadHandler(), DOC(PR_RECS()), { alive: [S, T] }), P = prPage(H, install, { DM, LM, phone }), before = H.layouts();
      P.app._viewIntoWindow = (w) => { w._readOnly = true; w._view = barView(planted, P, w); };
      pressResumeBar(door, P, P.wins.get('v-r1'));
      await tick(5);
      const a = P.wins.get('v-r1');
      P.answers[0]?.({ type: 'error', code: 'no-convo-breaker', transcriptKnown: false, message: 'No conversation found', reqId: P.creates[0] && P.creates[0].reqId });
      const btn = a && a._view && a._view._resumeBar && a._view._resumeBar.children.find((c) => c.tagName === 'BUTTON');
      btn?.onclick?.(); await tick(5);
      const w = P.wins.get('v-r1'), refused = (P.app._fenceRefused || []).filter((r) => r.win === 'v-r1');
      await saveNow(P);
      leg(planted !== CV && !!btn && P.creates.length === 2 && !!w && w !== a && !w._readOnly && !closedOf(P, 'v-r1').length && J(rowsOf(H.layouts(), 'desk-v')) === J(rowsOf(before, 'desk-v')) && refused.length === 1 && refused[0].how === 'requestClose',
        `§PR4 (f5) N5 THE FENCE'S DYNAMIC HALF on a ${phone ? 'PHONE' : 'DESKTOP'} page: the retry bar planted with a close through wm.requestClose (an ALLOWED census row) ⇒ REFUSED and journaled by name (requestClose of v-r1) — the conversation keeps row v-r1, 0 'closed', the record keeps the row and its box`,
        { bar: !!btn, creates: P.creates.length, win: w && w.id, fresh: w !== a, closed: closedOf(P, 'v-r1'), refused: P.app._fenceRefused || [] });
    }
    {
      const H = hub(WSH || loadHandler(), DOC(PR_RECS()), { alive: [S, T] }), P = prPage(H, install, { DM, LM, phone: false });
      P.app.resumeSession(PRC(1), '/srv/p1', 'Conv 1', { backend: 'claude', backendSessionId: PRC(1) });
      P.app._closeSecondView?.('v-f', { backend: 'claude', cid: PRC(1) });
      await tick(5);
      leg(P.wins.has('v-f') && (P.app._fenceRefused || []).some((r) => r.win === 'v-f' && r.how === '_closeSecondView'),
        '§PR4 (f5) N5 A SECOND VIEW IS OF THE CONVERSATION: _closeSecondView handed an unrelated window (v-f, a file) inside a resume ⇒ refused and journaled — v-f stays', { vf: P.wins.has('v-f'), refused: P.app._fenceRefused || [] });
    }
    {
      // window.js: every close door asks the fence FIRST (the rig's wm mirrors these lines)
      const lines = ['closeWindow', 'requestClose', '_retireWindow'].map((f) => { const i = WSRC.indexOf(`\n  ${f}(`), j = WSRC.indexOf('\n  }\n', i); return [f, i > 0 ? WSRC.slice(i, j) : ''];});
      const bad = lines.filter(([f, body]) => !new RegExp(`if \\(this\\._app\\?\\._closeFenced\\?\\.\\(id, '${f}'\\)\\) return`).test(body.split('\n').slice(0, 4).join('\n'))).map(([f]) => f);
      leg(!bad.length, '§PR4 (f5) N5 window.js: closeWindow / requestClose / _retireWindow each ask the fence first (`this._app?._closeFenced?.(id, …)`) — a window in a resume\'s turn closes only as its re-opening or a second view', bad);
    }
  }
  if (want('hb') && install) {
    // (hb) A DESKTOP DRAWS A PHONE-NAMED ROW AT ITS OWN BOX (the r3 acceptance's tile twin): the desktop is on desk-y but has not drawn
    // y-r3 yet (its session read still out); the phone's resume record lands naming y-r3 live (no box for a desktop) ⇒ the desktop
    // builds y-r3 at the box the record it held gives the row — and its next save keeps that box, never its default
    await fastClock(async () => {
      const H = hub(WSH || loadHandler(), DOC(PR_RECS()), { alive: [S, T, 'new-3'] }), D = prPage(H, install, { DM, LM, phone: false, on: 'desk-y' }), P = prPage(H, install, { DM, LM, phone: true, on: 'desk-y' });
      for (const X of [D, P]) for (const [d, v] of Object.entries(H.layouts().desktops)) X.dm.noteStamp(d, v.autoSave.updatedAt);
      D.wins.delete('y-r3'); // the switch's restore has not drawn the row yet — the record D holds has it at its box
      P.app.resumeSession(PRC(3), '/srv/p3', 'Conv 3', { backend: 'claude', backendSessionId: PRC(3) });
      await tick(5);
      P.answers[0]?.({ type: 'created', sessionId: 'new-3', cwd: '/srv/p3', mode: 'chat', reqId: P.creates[0] && P.creates[0].reqId });
      await tick(60);
      const w = D.wins.get('y-r3'), drawn = w && w.gridBounds ? J(w.gridBounds) : null;
      await saveNow(D); await tick(10);
      const row = (H.layouts().desktops['desk-y'].autoSave.windows || []).find((r) => r.winId === 'y-r3');
      leg(!!w && drawn === J(PRGB(3)) && !!row && J(row.gridBounds) === J(PRGB(3)) && hubName(H, 'desk-y', 'y-r3') === 'new-3',
        '§PR4 (hb) A DESKTOP DRAWS A PHONE-NAMED ROW AT ITS OWN BOX: the phone\'s live record of y-r3 lands before the desktop drew the row ⇒ the desktop builds it at the box its held record gives (never its default) and its next save keeps it',
        { win: !!w, drawn, row: row && [row.gridBounds, row.openSpec?.serverId] });
    });
  }
  return failed;
}
await section('§PR4 ROUND 4 (lane phone-resume-keeps-layout r4): an owed recipe is carried once and an idle page never echoes (owe) — N1; a pending resume is released at every end of its create (rel) — N2; only a press lands on top (z2) — N3; the refusal memory survives a reconnect (n4r) — N4; the fence\'s dynamic half (f5) — N5; a desktop draws a phone-named row at its own box (hb)', async () => {
  await pr4Legs({ install: installPR });
});

// ── §PR5 ROUND 5 (lane phone-resume-keeps-layout r5) ── the r4 acceptance: N1 the create's reconnect watch (lostWatch) outlived a window
// closed before its answer — it held the window until the next reconnect and removed itself there INSIDE ws.js's notify, which walked the
// live array: the listener after it was skipped (a ChatView stayed «Disconnected», a resend attach never went); N2 the hub's refusal
// memory froze at 64 pairs. Driven against the REAL src/lib/ws.js over a fake socket (layout-dup-world loadWs).
const realWs = await loadWs();
async function pr5Legs({ LM = RealLM, install = null, WS = realWs, WSH = null, quiet = false, legs = null } = {}) {
  const failed = [];
  const leg = (c, n, extra) => { if (!quiet) ok(c, n, extra); if (!c) failed.push(n); return !!c; };
  const want = (k) => !legs || legs.includes(k);
  const rows = (globalThis.__uiRows ||= {}), had = { ...rows };
  Object.assign(rows, { opencode: { resumeResend: false }, claude: { resumeResend: true } }); // the harness rows (opencode / antigravity: no resend)
  const page = () => { const H = hub(WSH || loadHandler(), DOC(PR_RECS()), { alive: [S, T] }), P = prPage(H, install, { phone: false }), R = WS(); P.app.ws = R.ws; return { P, R }; };
  const resume = (P, backend, k) => { const was = new Set(P.wins.keys()); P.app.createSession({ cwd: '/srv/o' + k, name: 'Open ' + k, mode: 'chat', backend, resumeId: 'cid-o' + k, backendSessionId: 'cid-o' + k }); return [...P.wins.values()].find((w) => !was.has(w.id)) || null; };
  const held = (R) => R.ws._stateListeners.length + R.ws.globalHandlers.length; // every watch a request keeps on the socket
  try {
    if (want('close') && install) {
      // (close) THE WATCHES DIE WITH THEIR WINDOW: an opencode resume (a create a reconnect will not re-send) — the person closes the
      // waiting window before the hub answers ⇒ at the close the socket holds 0 of its watches (the reconnect watch AND the request's
      // own), the pending resume is released; a frame later still 0. The reconnect after it tells every later listener
      const { P, R } = page(), n0 = held(R);
      const w = resume(P, 'opencode', 1), armed = held(R) - n0;
      await tick(0); // the resume's turn ends (the fence's mark is a microtask) — the person's ✕ is another turn
      if (w) P.app.wm.closeWindow(w.id);
      const atClose = held(R) - n0;
      R.frame({ type: 'sessions-updated', sessions: [] });
      const afterFrame = held(R) - n0, waiting = !!P.app._resumeWins?.has('opencode:cid-o1');
      leg(!!w && armed === 3 && atClose === 0 && afterFrame === 0 && !waiting,
        '§PR5 (close) N1 THE WATCHES DIE WITH THEIR WINDOW: an opencode resume\'s waiting window closed before the hub answers ⇒ the socket keeps 0 of its watches AT the close (the reconnect watch, the request\'s handler and state watch) and after a frame; the pending resume released',
        { win: w && w.id, armed, atClose, afterFrame, waiting });
      const seen = [], k = R.sockets();
      R.ws.onStateChange((c) => seen.push(c)); // a ChatView's _stateHandler, opened after
      R.ws.request({ type: 'attach', sessionId: 'live-2' }, (m) => m.type === 'attached' && m.sessionId === 'live-2', { resend: true }); // a window still attaching
      R.drop();
      const resent = R.sent(k).filter((m) => m.type === 'attach' && m.sessionId === 'live-2').length;
      leg(J(seen) === J([false, true]) && resent === 1,
        '§PR5 (close) N1 …THE RECONNECT AFTER IT TELLS EVERY LATER LISTENER: a ChatView-shaped state listener opened after sees [false, true] (never left «Disconnected»), a resend attach is re-sent once on the new socket',
        { seen, resent });
    }
    if (want('remake') && install) {
      // (remake) …A WINDOW RE-MADE under the same id (another instance, no close of this one): the next frame finds the create's window
      // gone (isAlive) — the request's cleanup releases the wait's watches too ⇒ 0 left, the pending resume released
      const { P, R } = page(), n0 = held(R);
      const w = resume(P, 'opencode', 2);
      await tick(0);
      if (w) P.wins.set(w.id, { ...w, _listenerCtl: new AbortController() });
      R.frame({ type: 'sessions-updated', sessions: [] });
      const left = held(R) - n0, waiting = !!P.app._resumeWins?.has('opencode:cid-o2');
      leg(!!w && left === 0 && !waiting,
        '§PR5 (remake) N1 …A WINDOW RE-MADE UNDER THE SAME ID before the answer: the next frame finds the create\'s window gone — its cleanup releases the reconnect watch too (0 watches left), the pending resume released',
        { win: w && w.id, left, waiting });
    }
    if (want('kept') && install) {
      // (kept) CONTROL — the window kept: a frame releases nothing (the create is unanswered: 3 watches); the reconnect ends the wait (r4
      // N2) — the watch removes itself mid-notify and the listener after it is told; a claude resume (re-sent) keeps no reconnect watch
      const { P, R } = page(), n0 = held(R);
      const w = resume(P, 'opencode', 3);
      R.frame({ type: 'sessions-updated', sessions: [] });
      const kept = held(R) - n0;
      R.drop();
      const after = held(R) - n0, waiting = !!P.app._resumeWins?.has('opencode:cid-o3');
      const c = resume(P, 'claude', 4), cl = held(R) - n0 - after;
      leg(!!w && !!c && kept === 3 && after === 2 && !waiting && cl === 2,
        '§PR5 (kept) N1 CONTROL: the waiting window kept — a frame releases nothing (3 watches); the reconnect ends the wait (the reconnect watch gone, the request still armed for a late answer); a claude resume (re-sent at a reconnect) arms no reconnect watch',
        { kept, after, waiting, claude: cl });
    }
    if (want('law')) {
      // (law) THE WS CLIENT TELLS A STATE OVER A COPY (a law of src/lib/ws.js): two listeners, the first removes itself when told ⇒ the
      // second still gets every state; a listener removed by a neighbour before its turn is not told
      const R = WS(), seen = [], told = [];
      const h1 = (c) => { R.ws.offStateChange(h1); told.push('h1:' + c); }, h2 = (c) => seen.push(c);
      R.ws.onStateChange(h1); R.ws.onStateChange(h2); R.drop();
      const h4 = (c) => told.push('h4:' + c), h3 = () => R.ws.offStateChange(h4);
      R.ws.onStateChange(h3); R.ws.onStateChange(h4); R.drop();
      leg(J(seen) === J([false, true, false, true]) && J(told) === J(['h1:false']),
        '§PR5 (law) N1 THE WS CLIENT TELLS A STATE OVER A COPY (src/lib/ws.js _notifyState): the first of two listeners removes itself when told — the second still gets every state; a listener a neighbour removed before its turn is not told',
        { seen, told });
    }
    if (want('catch')) {
      // (catch) …the hub's message loop's catch-all («Internal error handling create» — a create that throws) names the request it answers
      // too (the r4 acceptance: kb-api's «every error names its reqId» skipped it; a bare frame released EVERY pending resume on the page)
      const line = (read('src/ws-handler.js').match(/ws\.send\(JSON\.stringify\(\{ type: 'error', message: 'Internal error handling '[^\n]*/) || [''])[0];
      leg(/reqId: data\?\.reqId/.test(line), '§PR5 (catch) THE HUB\'S CATCH-ALL NAMES THE REQUEST it answers (ws-handler\'s «Internal error handling <type>»): a create that throws ends its own wait — never every pending resume on the page', line.slice(0, 160));
    }
    if (want('owe-b') && install) {
      // (owe-b) THE RETRY BUDGET IS PER RECIPE (the r4 acceptance's refuted-but-true shape): row x-r2's earlier recipes spent its two
      // tries; the row is resumed again (same id) and that NEW recipe's save is refused once ⇒ owed again and carried — the hub names new-2
      await fastClock(async () => {
        const H = hub(WSH || loadHandler(), DOC(PR_RECS()), { alive: [S, T, 'new-2'] }), P = prPage(H, install, { LM, phone: false });
        for (const [d, v] of Object.entries(H.layouts().desktops)) P.dm.noteStamp(d, v.autoSave.updatedAt);
        P.lm._recipeTries = new Map([['x-r2', 2]]); // two refusals earlier in the page's life
        P.app.resumeSession(PRC(2), '/srv/p2', 'Conv 2', { backend: 'claude', backendSessionId: PRC(2), winBounds: { gridBounds: PRGB(2), desktopId: 'desk-x', winId: 'x-r2' }, stay: true });
        await tick(20);
        P.lm._userDirty = false; P.lm._lastUserInputAt = Date.now() - 120000;
        const send = P.app.ws.send; let refusedOne = 0;
        const newer = () => { const r = JSON.parse(J(H.layouts().desktops['desk-x'].autoSave)); r.windows = r.windows.map((w) => (w.winId === 'x-f' ? { ...w, gridBounds: { ...w.gridBounds, left: 0.05 } } : w)); r.updatedAt = Date.now(); return r; };
        P.app.ws.send = (m) => { if (m && m.type === 'layout-sync' && m.desktopId === 'desk-x' && !refusedOne) { refusedOne = 1; setTimeout(() => { for (const h of [...P.handlers]) h({ type: 'layout-sync-refused', desktopId: 'desk-x', reason: 'stale', state: newer(), sentAt: m.sentAt ?? null }); }, 2); return; } return send(m); };
        P.answers[0]?.({ type: 'created', sessionId: 'new-2', cwd: '/srv/p2', mode: 'chat', reqId: P.creates[0] && P.creates[0].reqId });
        await tick(80);
        leg(refusedOne === 1 && hubName(H, 'desk-x', 'x-r2') === 'new-2' && !P.lm._owedRecipes?.size,
          '§PR5 (owe-b) THE RETRY BUDGET IS PER RECIPE: row x-r2\'s earlier recipes spent two tries; resumed again under the same id, its NEW recipe\'s save refused once ⇒ owed again and carried — the hub names new-2',
          { refused: refusedOne, name: hubName(H, 'desk-x', 'x-r2'), tries: [...(P.lm._recipeTries || [])], owed: [...(P.lm._owedRecipes || [])] });
      });
    }
    if (want('n2')) {
      // (n2) N2 THE NEWEST PAIR ALWAYS LANDS: a desktop whose refusal memory already holds 64 pairs refuses a new boxless newcomer ⇒ the
      // memory keeps 64 — the new pair last, the oldest gone — written once; its re-send from a new socket is refused and writes nothing
      const base = [prRow('x-r2', 2), files('x-f', 3)];
      const nc = (id) => { const o = prRow(id, 2, { serverSessionId: 'new-2', openSpec: { action: 'attachSession', serverId: 'new-2', backend: 'claude', backendSessionId: PRC(2), cwd: '/srv/p2', mode: 'chat', name: 'Conv 2' } }); delete o.gridBounds; return o; };
      const sync = (S0, H0, windows, evidence, at) => S0.send({ type: 'layout-sync', desktopId: 'desk-x', state: { windows, grid: null }, evidence, base: H0.layouts().desktops['desk-x'].autoSave.updatedAt, sentAt: at, viewport: 'phone' });
      const doc = DOC({ 'desk-v': [], 'desk-y': [], 'desk-x': base }); doc.desktops['desk-x'].refusedNewcomers = Array.from({ length: 64 }, (_, i) => ['win-m' + i, 'x-r2']);
      const H = hub(WSH || loadHandler(), doc, { alive: [S, T, 'new-2'] }), old = H.connect(), w0 = H.writes();
      await sync(old, H, [nc('win-n2'), base[1]], [{ id: 'x-r2', why: 'replaced', by: 'win-n2' }], 1);
      const mem = H.layouts().desktops['desk-x'].refusedNewcomers || [], wrote = H.writes() - w0;
      H.hangUp(old); const woken = H.connect();
      await sync(woken, H, [...base, nc('win-n2')], [], 2);
      const rowsW = rowsOf(H.layouts(), 'desk-x'), kept = J(rowsOf(DOC({ 'desk-x': base }), 'desk-x'));
      leg(refusals(old).length === 1 && mem.length === 64 && J(mem[63]) === J(['win-n2', 'x-r2']) && J(mem[0]) === J(['win-m1', 'x-r2']) && wrote === 1 && refusals(woken).length === 1 && H.writes() - w0 === 1 && J(rowsW) === kept,
        '§PR5 (n2) N2 THE NEWEST PAIR ALWAYS LANDS: a desktop whose refusal memory holds 64 pairs refuses a new boxless newcomer ⇒ the memory keeps 64 — the new pair last, the oldest gone — written once; the re-send from a new socket is refused (the hub keeps [x-r2 at its box, x-f]) and writes nothing',
        { refusals: [refusals(old).length, refusals(woken).length], size: mem.length, first: mem[0], last: mem[63], writes: [wrote, H.writes() - w0], rows: rowsW });
    }
  } finally { for (const k of Object.keys(rows)) if (!(k in had)) delete rows[k]; Object.assign(rows, had); }
  return failed;
}
await section('§PR5 ROUND 5 (lane phone-resume-keeps-layout r5): the watches die with their window (close / remake, CONTROL kept) and the ws client tells a state over a copy (law) — N1; the newest refused pair always lands (n2) — N2; the owed recipe\'s retry budget is per recipe (owe-b)', async () => {
  await pr5Legs({ install: installPR });
});

/** §PR6 (lane phone-resume-keeps-layout r6 — the r5 acceptance): the hub's refusal memory, over persistence.js's cache */
async function pr6Legs({ WSH = null, quiet = false, legs = null } = {}) {
  const failed = [];
  const leg = (c, n, extra) => { if (!quiet) ok(c, n, extra); if (!c) failed.push(n); return !!c; };
  const want = (k) => !legs || legs.includes(k);
  if (want('n2b')) {
    // (n2b) THE MEMORY IS WRITTEN WHEN ITS MEMBERSHIP CHANGES, NEVER WHEN ONLY ITS ORDER DOES: 64 pairs stored (win-m0 … win-m63); two
    // remembered pairs — the oldest (win-m0) and one inside (win-m10) — re-sent in turn ×10 each, each from a NEW socket (a phone woken)
    // ⇒ 20 refusals, 0 writes, both still remembered, the cache's order the LRU's (… win-m0, win-m10 last). Then a NEW pair ⇒ ONE write,
    // and the pair that leaves is win-m1 — the least recently REFUSED (win-m0, the oldest stored, was refused since): the order lived in
    // memory and rode the write. The hub reads persistence.js's cache (readLayouts hands the live object, `cache`)
    const base = [prRow('x-r2', 2), files('x-f', 3)];
    const nc = (id) => { const o = prRow(id, 2, { serverSessionId: 'new-2', openSpec: { action: 'attachSession', serverId: 'new-2', backend: 'claude', backendSessionId: PRC(2), cwd: '/srv/p2', mode: 'chat', name: 'Conv 2' } }); delete o.gridBounds; return o; };
    const sync = (S0, H0, windows, evidence, at) => S0.send({ type: 'layout-sync', desktopId: 'desk-x', state: { windows, grid: null }, evidence, base: H0.layouts().desktops['desk-x'].autoSave.updatedAt, sentAt: at, viewport: 'phone' });
    const doc = DOC({ 'desk-v': [], 'desk-y': [], 'desk-x': base }); doc.desktops['desk-x'].refusedNewcomers = Array.from({ length: 64 }, (_, i) => ['win-m' + i, 'x-r2']);
    const H = hub(WSH || loadHandler(), doc, { alive: [S, T, 'new-2'], cache: true }), w0 = H.writes(), kept = J(rowsOf(DOC({ 'desk-x': base }), 'desk-x'));
    let refused = 0, at = 1;
    for (let i = 0; i < 10; i++) for (const id of ['win-m0', 'win-m10']) { const s = H.connect(); await sync(s, H, [...base, nc(id)], [], at++); refused += refusals(s).length; H.hangUp(s); }
    const mem = (H.layouts().desktops['desk-x'].refusedNewcomers || []).map(([a]) => a), hot = H.writes() - w0, rowsH = rowsOf(H.layouts(), 'desk-x');
    const s = H.connect(); await sync(s, H, [nc('win-n2'), base[1]], [{ id: 'x-r2', why: 'replaced', by: 'win-n2' }], at++);
    const disk = (H.disk().desktops['desk-x'].refusedNewcomers || []).map(([a]) => a), wrote = H.writes() - w0 - hot;
    leg(refused === 20 && hot === 0 && mem.length === 64 && J(mem.slice(-2)) === J(['win-m0', 'win-m10']) && J(rowsH) === kept
      && refusals(s).length === 1 && wrote === 1 && disk.length === 64 && !disk.includes('win-m1') && disk[0] === 'win-m2' && J(disk.slice(-3)) === J(['win-m0', 'win-m10', 'win-n2']),
      '§PR6 (n2b) THE MEMORY IS WRITTEN WHEN ITS MEMBERSHIP CHANGES, NEVER WHEN ONLY ITS ORDER DOES: 64 stored; two remembered pairs (win-m0, the oldest, and win-m10) re-sent in turn ×10 from new sockets ⇒ 20 refusals, 0 writes, both remembered, the cache\'s order the LRU\'s; then a NEW pair ⇒ one write, and win-m1 (the least recently refused) leaves — never win-m0',
      { refused, writesHot: hot, tail: mem.slice(-2), rows: J(rowsH) === kept, newRefused: refusals(s).length, writesNew: wrote, size: disk.length, first: disk[0], hasM0: disk.includes('win-m0'), hasM1: disk.includes('win-m1'), last3: disk.slice(-3) });
  }
  return failed;
}
await section('§PR6 ROUND 6 (lane phone-resume-keeps-layout r6): a refusal of a remembered pair writes nothing — the memory is written when its membership changes, never when only its order does (n2b)', async () => {
  await pr6Legs();
});

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
  // r4: K the choke point's trace rule removed (36bd0c866: the restore spread the trace), K the person's act ignored, M the newest 50
  {
    const PSRC = read('src/routes/persistence.js'), find = '    tracesTrue(data);\n';
    ok(PSRC.includes(find), 'mutant r4-K-restore-spreads: the patched line exists in persistence.js');
    const Px = M.load('src/routes/persistence.js', PSRC.replace(find, ''), 'r4-k-spread');
    const k = await persistLegs(Px, { quiet: true });
    ok(k.some((n) => /THE ONE-DESKTOP RESTORE/.test(n)) && k.some((n) => /…and ANY write through writeLayouts/.test(n)), `mutant r4-K-restore-spreads (36bd0c866's writeLayouts): the restored record lists the copy the trace still names — RED (${k.length})`);
    const ND = require(MODEL).noteDupsLeft;
    const g = await hubLegs(loadHandler({ noteDupsLeft: (t, o = {}) => ND(t, { ...o, gone: [] }) }), { quiet: true });
    const gp = pureLegs({ ...require(MODEL), noteDupsLeft: (t, o = {}) => ND(t, { ...o, gone: [] }) }, { quiet: true });
    ok(g.some((n) => /a write whose evidence says a PERSON CLOSED/.test(n)) && gp.some((n) => /r4 K noteDupsLeft/.test(n)), `mutant r4-K-keep-on-close (the trace blind to a person's act): the closed window stays traced — RED (${g.length}/${gp.length})`);
    const f = pureLegs({ ...require(MODEL), noteDupsLeft: (t, o = {}) => ND(t, o).slice(-50) }, { quiet: true });
    ok(f.some((n) => /NEVER cut by count/.test(n)), `mutant r4-M-fifo-50 (36bd0c866's DUP_TRACE_CAP): the oldest copies leave the trace by count — RED (${f.length})`);
  }
  // r5: N the live-session set alone (4ad07d751's `alive`: a stopped conversation, or one not adopted yet, leaves the trace)
  {
    const WSRC = read('src/ws-handler.js'), find = 'gone, alive: (sid) => !endedConvs.has(sid) });';
    ok(WSRC.includes(find), 'mutant r5-N-live-set: the patched line exists in ws-handler.js');
    const Wx = M.load('src/ws-handler.js', WSRC.replace(find, 'gone, alive: (sid) => activeSessions.has(sid) });'), 'r5-n-live');
    const n = await hubNLegs(Wx, { quiet: true });
    ok(n.some((x) => /a STOPPED conversation stays traced/.test(x)) && n.some((x) => /not ADOPTED the conversation yet/.test(x)), `mutant r5-N-live-set (4ad07d751's \`activeSessions.has\` alone): a stopped conversation and one not adopted yet leave the trace — RED (${n.length}: ${n.filter((x) => /r5 N/.test(x)).map((x) => x.slice(0, 60)).join(' | ')})`);
  }
  // ROUND 8 — each road's fix removed (the shapes that need the page's own clocks — the gate's drain, «bysession» — are the loop's)
  {
    const D8 = read('src/lib/desktop-manager.js'), L8 = read('src/lib/session-lifecycle.js'), T8 = read('src/lib/taskbar.js');
    const dm8 = async (find, repl, tag) => { ok(D8.includes(find), `mutant ${tag}: the patched line exists in desktop-manager.js`); return (await import(pathToFileURL(M.write('src/lib/desktop-manager.js', D8.replace(find, repl), tag, { esm: true })).href)).DesktopManager; };
    // a second taskbar module in one process: its top-level registerWindowMenu() would register the window menu's commands again
    // (contributions' registry is the process's, and refuses a duplicate) — the copy leaves that one call out
    const tb8 = async (find, repl, tag) => { ok(T8.includes(find) && T8.includes('\nregisterWindowMenu();\n'), `mutant ${tag}: the patched lines exist in taskbar.js`); return import(pathToFileURL(M.write('src/lib/taskbar.js', T8.replace(find, repl).replace('\nregisterWindowMenu();\n', '\n\n'), tag, { esm: true })).href); };
    const heads = (f) => f.map((n) => n.slice(0, 16)).join(' | ');
    const blind = await dm8('    return !!(ask && ask.desk === desktopId) || !!(r && r.desk === desktopId && r.gen === (this._revealGen || 0));', '    return !!(ask && ask.desk === desktopId) || !!(r && r.gen === (this._revealGen || 0));', 'r8-R1-deskblind');
    const fb = await r8Legs({ DM: blind, install: install8, quiet: true, legs: ['R1b', 'R1c'] });
    ok(fb.some((n) => n.startsWith('§R8 R1b:')) && fb.some((n) => n.startsWith('§R8 R1c:')), `mutant r8-R1-deskblind (a switch to ANY desktop of the reveal's generation is its own): the forwarded shortcut's switch and the remote deletion's keep the mark — RED (${fb.length}: ${heads(fb)})`);
    const never = await dm8('    this._revealing = null; // a switch lands: a reveal\'s own switch is spent — once (r8); queued, it stays the reveal\'s until its drain lands\n', '', 'r8-R1-neverclear');
    const fn = await r8Legs({ DM: never, install: install8, quiet: true, legs: ['R1b', 'R1c', 'R4'] });
    ok(fn.length === 0, `mutant r8-R1-neverclear ALONE (the landed switch never spends \`_revealing\`) is EQUIVALENT — the desktop check answers first: a desktop is left only by a switch that is not the reveal's, which starts a generation, so a spent \`_revealing\` never matches again; should a desktop ever be left without one, this turns RED (${fn.length}: ${heads(fn)}) — the clear's other half, never early, is the loop's r8-R1-clear-early (Q7)`);
    const armed = await dm8('    if (desk === this._activeId) this._pendingSwitch = null;\n', '', 'r8-R4-armed');
    const fa = await r8Legs({ DM: armed, install: install8, quiet: true, legs: ['R4'] });
    ok(fa.some((n) => n.startsWith('§R8 R4:')), `mutant r8-R4-armed (8bde36a5c's keepInFront: no cancel): the switch queued before the open stays armed — RED (${fa.length})`);
    const copyR = await dm8('        if (this._isCopy(ws, census)) { noSpec.push(winId); continue; }\n', '', 'r8-R2-restore-copy');
    const fr = await r8Legs({ DM: copyR, install: install8, quiet: true, legs: ['R2visit'] });
    ok(fr.some((n) => n.startsWith('§R8 R2 (visit):')), `mutant r8-R2-restore-copy (8bde36a5c's no-openSpec door: no copies verdict): the copy is restored — RED (${fr.length})`);
    const door = "    if (!replay) this.desktopManager?.keepInFront?.(w.id); // a person's open: it stands — revealed now, in front of a group still forming around it (r5 O)\n    this.wm.revealWindow(w.id, { replay });\n";
    ok(L8.includes(door), 'mutant r8-R2-machine-raises: the patched lines exist in session-lifecycle.js');
    const fm = await r8Legs({ install: await loadLifecycle(L8.replace(door, '    this.desktopManager?.keepInFront?.(w.id);\n    this.wm.revealWindow(w.id);\n')), quiet: true, legs: ['R2door'] });
    ok(fm.some((n) => n.startsWith('§R8 R2 (door):')), `mutant r8-R2-machine-raises (8bde36a5c's _focusPendingAttach: keepInFront + a person's reveal on every path): the machine door asks a switch back to X and notes an act — RED by the switch count (${fm.length})`);
    const tbc = await tb8(' && !copies.has(String(id))', '', 'r8-R3-copy-row');
    const fc = await r8Legs({ install: install8, TB: tbc, quiet: true, legs: ['R3list'] });
    ok(fc.some((n) => n.startsWith('§R8 R3 (list):')), `mutant r8-R3-copy-row (8bde36a5c's otherDeskRows: no copies filter): V's copy offered, S listed twice — RED (${fc.length})`);
    const look = "  const dm = app.desktopManager, row = (dm._savedStates?.get(r.deskId)?.windows || []).find((w) => w && String(w.winId || w.id) === String(r.id));\n  dm.revealHeld(r.id, r.deskId, (row && ((row.openSpec && row.openSpec.name) || row.title)) || null);\n";
    const tbs = await tb8(look, "  const dm = app.desktopManager;\n  const go = app.stage?.isActive ? app.stage.leave(r.deskId) : dm.switchTo(r.deskId);\n  let tries = 0;\n  const look = () => {\n    if (dm.activeDesktopId !== r.deskId) return;\n    if (app.wm.windows.has(r.id)) { app.wm.revealWindow(r.id); return; }\n    if (++tries < 20) setTimeout(look, 250);\n  };\n  Promise.resolve(go).then(look, look);\n", 'r8-R3-silent-look');
    const fs8 = await r8Legs({ install: install8, TB: tbs, quiet: true, legs: ['R3look'] });
    ok(fs8.some((n) => n.startsWith('§R8 R3 (look):')), `mutant r8-R3-silent-look (8bde36a5c's goOtherDesk: 20 × 250 ms, then silence): nothing said — RED by the toast count (${fs8.length})`);
  }
  // ROUND 9 — the copy verdict keyed on the server id alone (65a28cd29), and the verdict and the restore resolving a row two ways
  {
    const D9s = read('src/lib/desktop-manager.js'), L9s = read('src/lib/layout.js');
    const heads = (f) => f.map((n) => n.slice(0, 9)).join(' | ');
    const key = '    const sid = doorSessionOf(w, census.live);\n', imp = "import { duplicatesOf, refusalKey, namesOf, doorSessionOf } from './desktop-record.js';";
    ok(D9s.includes(key) && D9s.includes(imp), 'mutant r9: the patched lines exist in desktop-manager.js');
    const dm9 = async (src, tag) => (await import(pathToFileURL(M.write('src/lib/desktop-manager.js', src, tag, { esm: true })).href)).DesktopManager;
    const sOnly = await dm9(D9s.replace(imp, "import { duplicatesOf, refusalKey, namesOf, doorSessionOf, sessionOf } from './desktop-record.js';").replace(key, '    const sid = sessionOf(w);\n'), 'r9-serverid-only');
    const fs9 = await r9Legs({ DM: sOnly, install: install9, quiet: true, legs: ['a', 'b', 'c'] });
    ok(['a', 'b', 'c'].every((k) => fs9.some((n) => n.startsWith(`§R9 (${k}):`))), `mutant r9-serverid-only (65a28cd29's copy verdict: sessionOf — the server id alone): the row named by its conversation id, alone or beside a stale server id, is offered and restored — (a)(b)(c) RED (the server-id shape (e) is the base's own: green on 65a28cd29) (${fs9.length}: ${heads(fs9)})`);
    const other = await dm9(D9s.replace(key, '    const sid = !w.openSpec && w.serverSessionId && census.live.some((s) => s.id === w.serverSessionId) ? String(w.serverSessionId) : doorSessionOf(w, census.live);\n'), 'r9-two-resolvers-verdict');
    const fv = await r9Legs({ DM: other, install: install9, quiet: true, legs: ['f', 'g'] });
    ok(fv.some((n) => n.startsWith('§R9 (f):')) && fv.some((n) => n.startsWith('§R9 (g):')), `mutant r9-two-resolvers (the verdict reads the server id first, the restore keeps its own ladder): where the two names disagree the verdict and the restore part — S's copy restored (its attach raised X's window), D's real window never built — (f)(g) RED (${fv.length}: ${heads(fv)})`);
    const alive = "        // (desktop-record liveSessionOf — r9: a row whose session, so resolved, this page shows is a copy: never restored here)\n        const alive = liveSessionOf(ws, activeSessions);\n";
    ok(L9s.includes(alive), 'mutant r9-two-resolvers (restore side): the patched lines exist in layout.js');
    const LMr = (await import(pathToFileURL(M.write('src/lib/layout.js', L9s.replace(alive, "        const alive = (ws.serverSessionId && activeSessions.find((s) => s.id === ws.serverSessionId)) || liveSessionOf(ws, activeSessions);\n"), 'r9-two-resolvers-restore', { esm: true })).href)).LayoutManager;
    const fr9 = await r9Legs({ LM: LMr, install: install9, quiet: true, legs: ['f', 'g'] });
    ok(fr9.length === 1 && fr9[0].startsWith('§R9 (g):'), `mutant r9-two-resolvers (restore side: restoreState keeps its own order — the server id first): D's row passes the verdict, its restore attaches S and raises X's window — (g) RED, (f) green (the verdict settles it first) (${fr9.length}: ${heads(fr9)})`);
    const list = "    const listed = (this.app.sidebar?._webuiSessions || []).filter((s) => s && s.id != null), named = new Set(listed.map((s) => String(s.id)));\n";
    ok(D9s.includes(list), 'mutant r9-page-only: the patched line exists in desktop-manager.js');
    const fp = await r9Legs({ DM: await dm9(D9s.replace(list, '    const listed = [], named = new Set();\n'), 'r9-page-only'), install: install9, quiet: true, legs: ['f', 'g'] });
    ok(fp.length === 1 && fp[0].startsWith('§R9 (g):'), `mutant r9-page-only (the census without the server's live list — only the sessions this page shows): D's conversation id matches nothing, the row falls to S's server id — D's real window never built — (g) RED, (f) green (${fp.length}: ${heads(fp)})`);
  }
  // ROUND 10 — the autosave's dup proposal on the server id alone (9d11dd973's duplicatesOf), the census not handed in, the preset's
  // own two-rung ladder
  {
    const P10 = read('src/lib/desktop-record.js'), D10 = read('src/lib/desktop-manager.js'), L10 = read('src/lib/layout.js');
    const heads = (f) => f.map((n) => n.slice(0, 11)).join(' | ');
    const dupKey = '      const id = idOf(w), sid = sessionOf(w), door = doorSessionOf(w, live), by = sid && door && shows.has(door) ? shows.get(sid) : null;\n';
    const imp = "from './desktop-record.js';", hand = '    for (const x of duplicatesOf({ records: this._savedStates, shown, live: this._shownCensus().live })) {\n';
    if (ok(P10.includes(dupKey) && D10.includes(imp) && D10.includes(hand), 'mutant r10: the patched lines exist in desktop-record.js / desktop-manager.js')) {
      const drOld = M.write('src/lib/desktop-record.js', P10.replace(dupKey, '      const id = idOf(w), sid = sessionOf(w), by = sid ? shows.get(sid) : null;\n'), 'r10-dups-on-sessionof');
      const DMo = (await import(pathToFileURL(M.write('src/lib/desktop-manager.js', D10.split(imp).join(`from ${J(drOld)};`), 'r10-dups-on-sessionof-dm', { esm: true })).href)).DesktopManager;
      const fo = await r10Legs({ DM: DMo, install: install10, quiet: true, legs: ['gn', 'gs', 'es'] });
      ok(fo.length === 2 && fo.some((n) => n.startsWith('§R10 (gn):')) && fo.some((n) => n.startsWith('§R10 (gs):')), `mutant r10-dups-on-sessionof (9d11dd973's duplicatesOf: the server id alone): the autosave proposes D's row as S's 'dup', the hub takes it, D's window is never built — (gn)(gs) RED, the true copy (es) green (${fo.length}: ${heads(fo)})`);
      const DMn = (await import(pathToFileURL(M.write('src/lib/desktop-manager.js', D10.replace(hand, '    for (const x of duplicatesOf({ records: this._savedStates, shown })) {\n'), 'r10-dups-no-census', { esm: true })).href)).DesktopManager;
      const fn = await r10Legs({ DM: DMn, install: install10, quiet: true, legs: ['gn', 'es'] });
      ok(fn.length === 1 && fn[0].startsWith('§R10 (es):'), `mutant r10-dups-no-census (normalizeDups hands duplicatesOf no live list): a row with no recipe resolves to nothing — the true copy (es) is never proposed, carried for ever — RED; (gn) green (${fn.length}: ${heads(fn)})`);
    }
    const lp = 'liveSessionOf(ws, activeSessions); // the restore\'s ladder (see the terminal branch — r10)\n', lt = '          const activeMatch = liveSessionOf(ws, activeSessions);\n\n';
    if (ok(L10.includes(lp) && L10.includes(lt), 'mutant r10-preset-two-rungs: the patched lines exist in layout.js')) {
      const two = (pad) => `let activeMatch = null;\n${pad}if (backendSessionId) activeMatch = activeSessions.find(s => (s.backend || 'claude') === backend && (s.backendSessionId || s.claudeSessionId) === backendSessionId);\n${pad}if (!activeMatch && ws.serverSessionId) activeMatch = activeSessions.find(s => s.id === ws.serverSessionId);\n`;
      const LMp = (await import(pathToFileURL(M.write('src/lib/layout.js', L10.replace('const activeMatch = ' + lp, two('          ')).replace(lt, '          ' + two('          ') + '\n'), 'r10-preset-two-rungs', { esm: true })).href)).LayoutManager;
      const fl = await r10Legs({ LM: LMp, install: install10, quiet: true, legs: ['p'] });
      ok(fl.length === 1 && fl[0].startsWith('§R10 (p):'), `mutant r10-preset-two-rungs (9d11dd973's loadPreset: its own ladder, no recipe rung): the rows named by their recipe attach nothing — (p) RED (${fl.length})`);
    }
  }
  for (const r of copiesCensus(M.files, M.dir, REPO, { minCopies: 4, label: '§6 ' })) ok(r.pass, r.name, r.detail);
});


await section('§6 PR MUTANTS (lane phone-resume-keeps-layout) — each fix removed turns its own leg RED', async () => {
  const M = mutantCopies('ldup-pr', REPO);
  const LSRC = read('src/lib/session-lifecycle.js'), PSRC = read('src/lib/desktop-record.js'), DSRC = read('src/lib/desktop-manager.js');
  {
    const a = '      syncId: syncId || row?.id, // LAW 1: the row\'s own id — the record keeps the row, its box and its group\n', b = '    this.desktopManager?.reopenRow?.(out.id);\n';
    if (ok(LSRC.includes(a) && LSRC.includes(b), 'mutant pr-remint: the patched lines exist in session-lifecycle.js')) {
      const inst = await loadLifecycle(LSRC.replace(a, '      syncId,\n').replace(b, ''));
      const f = await prLegs({ install: inst, quiet: true, legs: ['a'] });
      ok(f.some((n) => n.startsWith('§PR (a) a PHONE page resumes')), `mutant pr-remint (a5dedfed1's resume: a NEW window per conversation, the row closed for it): (a) RED (${f.length})`);
    }
  }
  {
    const a = '      out.push(carry ? { desk, id, by: String(by), sid, carry } : { desk, id, by: String(by), sid });';
    if (ok(PSRC.includes(a), 'mutant pr-dup-drops-place: the patched line exists in desktop-record.js')) {
      const Mx = M.load('src/lib/desktop-record.js', PSRC.replace(a, '      out.push({ desk, id, by: String(by), sid });'), 'pr-dup-drops-place');
      const f = await prLegs({ PURE: Mx, quiet: true, legs: ['b'] });
      ok(f.some((n) => n.startsWith('§PR (b) PURE duplicatesOf')), `mutant pr-dup-drops-place (a5dedfed1's duplicatesOf: the copy's box leaves with it): (b) RED (${f.length})`);
    }
  }
  {
    const a = '  for (const id of unplaced) if (!unexplained.includes(id)) unexplained.push(id);\n', b = ' || dup.length || unplaced.length) return';
    if (ok(PSRC.includes(a) && PSRC.includes(b), 'mutant pr-belt-blind: the patched lines exist in desktop-record.js')) {
      const Mx = M.load('src/lib/desktop-record.js', PSRC.replace(a, '').replace(b, ' || dup.length) return'), 'pr-belt-blind');
      const f = await prLegs({ PURE: Mx, WSH: loadHandler({ shrinkVerdict: Mx.shrinkVerdict }), quiet: true, legs: ['d'] });
      ok(f.some((n) => n.startsWith('§PR (d) PURE shrinkVerdict: THE 11:30:40 SHAPE')) && f.some((n) => n.startsWith('§PR (d) THE REAL ws-handler')), `mutant pr-belt-blind (a5dedfed1's shrinkVerdict: a write that drops positions is accepted): (d) RED (${f.length})`);
    }
  }
  {
    const a = '            } else if (!ws.isMinimized) unplaced.push(wid); // A DESKTOP WHOSE ROWS HAVE NO POSITION SAYS SO (LAW 2) — never nothing\n';
    if (ok(DSRC.includes(a), 'mutant pr-preview-blank: the patched line exists in desktop-manager.js')) {
      const DMp = (await import(pathToFileURL(M.write('src/lib/desktop-manager.js', DSRC.replace(a, '            }\n'), 'pr-preview-blank', { esm: true })).href)).DesktopManager;
      const f = await prLegs({ DM: DMp, quiet: true, legs: ['p'] });
      ok(f.some((n) => n.startsWith('§PR LAW 2')), `mutant pr-preview-blank (a5dedfed1's preview: a row with no box draws nothing): LAW 2 RED (${f.length})`);
    }
  }
  // ── r2 (the r1 acceptance's N1–N4): each fix put back as 461b41f78 shipped it turns its own §PR2 leg RED ──
  const CVSRC = read('src/lib/chat-view.js'), LYSRC = read('src/lib/layout.js');
  {
    const a = "    this.app.resumeSession(backendSessionId, cwd, name, {\n      mode: 'chat',\n      backend,\n      // THE WINDOW PRESSED IN IS THE ROW (lane phone-resume-keeps-layout r2, N1): resumeSession closes it as its re-opening and the\n      // resumed session takes its id — never closed here (a close after the resume closed the RESUMED window: the row went as 'closed')\n      fromWin: this.winInfo?.id,\n";
    const b = "      ...(accountId ? { accountId, onCreateResult: this.app._persistAccountOnCreate?.(`${backend}:${backendSessionId}`, accountId) } : {}),\n    });\n  }";
    if (ok(CVSRC.includes(a) && CVSRC.includes(b), 'mutant pr2-resume-bar-closes: the patched lines exist in chat-view.js')) {
      const cv = CVSRC.replace(a, "    const winId = this.winInfo?.id;\n    this.app.resumeSession(backendSessionId, cwd, name, {\n      mode: 'chat',\n      backend,\n").replace(b, "      ...(accountId ? { accountId, onCreateResult: this.app._persistAccountOnCreate?.(`${backend}:${backendSessionId}`, accountId) } : {}),\n    });\n    // Close the read-only window — the resumed session opens in a new window\n    if (winId) this.app.wm?.closeWindow?.(winId);\n  }");
      const f = await pr2Legs({ install: installPR, CV: cv, SRCS: { 'src/lib/chat-view.js': cv }, quiet: true, legs: ['e', 'census'] });
      ok(f.filter((n) => n.startsWith('§PR2 (e) N1 THE RESUME BAR')).length === 2 && f.some((n) => n.startsWith('§PR2 (census)')), `mutant pr2-resume-bar-closes (461b41f78's Resume bar: resume, then close the window it named): (e) RED on both pages + the census RED (${f.length})`);
    }
  }
  {
    const a = "    if (nextBy.has(id) || !hasBox(w)) continue;\n", b = " || (conversationOf(w) && freshBoxless.has(conversationOf(w)))) unplaced.push(id);";
    if (ok(PSRC.includes(a) && PSRC.includes(b), 'mutant pr2-belt-reads-evidence: the patched lines exist in desktop-record.js')) {
      const Mx = M.load('src/lib/desktop-record.js', PSRC.replace(a, "    if (nextBy.has(id) || !hasBox(w) || !ev.has(id)) continue;\n").replace(b, " || (r === 'closed' && conversationOf(w) && freshBoxless.has(conversationOf(w)))) unplaced.push(id);"), 'pr2-belt-reads-evidence');
      const f = await pr2Legs({ PURE: Mx, quiet: true, legs: ['n3p'] });
      ok(f.length === 1 && f[0].startsWith('§PR2 (n3) PURE shrinkVerdict'), `mutant pr2-belt-reads-evidence (461b41f78's belt: the shape counted only with 'closed' evidence): (n3) PURE RED (${f.length})`);
    }
  }
  {
    const a = '    for (const id of unplaced) this._takeKeptRow(d, id, rec);\n';
    if (ok(DSRC.includes(a), 'mutant pr2-reconcile-resends-drop: the patched line exists in desktop-manager.js')) {
      const DMp = (await import(pathToFileURL(M.write('src/lib/desktop-manager.js', DSRC.replace(a, ''), 'pr2-reconcile-resends-drop', { esm: true })).href)).DesktopManager;
      const f = await pr2Legs({ DM: DMp, install: installPR, quiet: true, legs: ['n3'] });
      ok(f.length === 1 && f[0].startsWith('§PR2 (n3) N3 write 1'), `mutant pr2-reconcile-resends-drop (461b41f78's reconcile: the kept row's window never taken back — the next write is the drop again): (n3) RED (${f.length})`);
    }
  }
  {
    const a = '          } else if (this._deadFor(win, rw.openSpec)) {\n';
    if (ok(LYSRC.includes(a), 'mutant pr2-dead-view-kept: the patched line exists in layout.js')) {
      const LMp = (await import(pathToFileURL(M.write('src/lib/layout.js', LYSRC.replace(a, '          } else if (false) {\n'), 'pr2-dead-view-kept', { esm: true })).href)).LayoutManager;
      const f = await pr2Legs({ LM: LMp, install: installPR, quiet: true, legs: ['n2'] });
      ok(f.length === 1 && f[0].startsWith('§PR2 (n2) N2 TWO PAGES'), `mutant pr2-dead-view-kept (461b41f78's apply: a changed recipe rebuilt for a placeholder only): (n2) RED (${f.length})`);
    }
  }
  {
    const a = "    const liveRow = rec ? (runs(rec.openSpec?.serverId) || runs(rec.serverSessionId)) : null;\n";
    const b = "          const re = this._reopenWin(winInfo.id);\n          if (re) { re.place = winBounds ? { ...re.place, ...winBounds } : re.place; this._attachInRow(re, msg.existingId,";
    if (ok(LSRC.includes(a) && LSRC.includes(b), 'mutant pr2-live-page-local: the patched lines exist in session-lifecycle.js')) {
      const inst = await loadLifecycle(LSRC.replace(a, '    const liveRow = null;\n').replace(b, "          try { this.wm.closeWindow(winInfo.id); } catch { }\n          const re = { id: null };\n          if (re) { this.attachSession(msg.existingId,"));
      const f = await pr2Legs({ install: inst, quiet: true, legs: ['live', 'c4'] });
      ok(f.some((n) => n.startsWith('§PR2 (live) N2 a phone')) && f.some((n) => n.startsWith('§PR2 (c4)')), `mutant pr2-live-page-local (461b41f78's resume: «live» read off this page alone, 'resume-already-live' closes the row): (live) + (c4) RED (${f.length})`);
    }
  }
  {
    const a = "    this.app.resumeSession?.(cid, e.cwd || e.openSpec?.cwd || '', titleNameOf(e) || 'Session', { backend, backendSessionId: cid, hostId: hostOf(e) || undefined, fromWin: win.id });\n";
    if (ok(LYSRC.includes(a), 'mutant pr2-tile-closes-first: the patched line exists in layout.js')) {
      const LMp = (await import(pathToFileURL(M.write('src/lib/layout.js', LYSRC.replace(a, "    const bounds = this.app._snapshotWinBounds?.(win);\n    this.app.wm.closeWindow(win.id);\n    this.app.resumeSession?.(cid, e.cwd || e.openSpec?.cwd || '', titleNameOf(e) || 'Session', { backend, backendSessionId: cid, hostId: hostOf(e) || undefined, winBounds: bounds ? { ...bounds, winId: win.id } : undefined });\n"), 'pr2-tile-closes-first', { esm: true })).href)).LayoutManager;
      const f = await pr2Legs({ LM: LMp, install: installPR, quiet: true, legs: ['n4'] });
      ok(f.length === 1 && f[0].startsWith('§PR2 (n4)'), `mutant pr2-tile-closes-first (461b41f78's tile press: closed first, a new id minted): (n4) RED (${f.length})`);
    }
  }
  // ── r3 (the r2 acceptance's N1–N4 + C1–C3): each fix put back as d159c081b shipped it turns its own §PR3 leg RED ──
  {
    const a = '    btn.onclick = () => { btn.disabled = true; onRetry?.(); };';
    if (ok(CVSRC.includes(a), 'mutant pr3-retry-bar-closes: the patched line exists in chat-view.js')) {
      const cv = CVSRC.replace(a, '    btn.onclick = () => { btn.disabled = true; try { onRetry?.(); } finally { this.app.wm?.closeWindow?.(this.winInfo?.id); } };');
      const f = await pr3Legs({ install: installPR, CV: cv, quiet: true, legs: ['rb'] }), g = await pr2Legs({ CV: cv, SRCS: { 'src/lib/chat-view.js': cv }, quiet: true, legs: ['census'] });
      ok(f.filter((n) => n.startsWith('§PR3 (rb)')).length === 2 && g.length === 1, `mutant pr3-retry-bar-closes (d159c081b's retry bar: the retry, then a close of the window it named): (rb) RED on both pages + the fence RED by name (${f.length + g.length})`);
    }
  }
  {
    const a = "    const pend = this._pendingResumeWin(backend, targetBackendId);\n";
    if (ok(LSRC.includes(a), 'mutant pr3-no-join: the patched line exists in session-lifecycle.js')) {
      const f = await pr3Legs({ install: await loadLifecycle(LSRC.replace(a, '    const pend = null;\n')), quiet: true, legs: ['dp'] });
      ok(f.length === 3 && f.every((n) => n.startsWith('§PR3 (dp)')), `mutant pr3-no-join (d159c081b's resume: a second press re-opens the held row — the first resume's window in flight closed as its «tile»): (dp) RED ×3 (${f.length})`);
    }
  }
  {
    const a = '      isAlive: () => this._winIs(winInfo) || (settled(), false), // the window INSTANCE (r3 N2): one re-made under the same id is another window — its end releases the wait\'s watches (r5 N1)\n';
    if (ok(LSRC.includes(a), 'mutant pr3-id-alive: the patched line exists in session-lifecycle.js')) {
      const f = await pr3Legs({ install: await loadLifecycle(LSRC.replace(a, '      isAlive: () => this.wm.windows.has(winInfo.id),\n')), quiet: true, legs: ['inst'] });
      ok(f.length === 1 && f[0].startsWith('§PR3 (inst)'), `mutant pr3-id-alive (d159c081b's create: alive while ANY window holds its id): (inst) RED (${f.length})`);
    }
  }
  {
    const a = '    if (rec && unpressed) {\n';
    if (ok(LSRC.includes(a), 'mutant pr3-record-z / pr3-z-never: the patched line exists in session-lifecycle.js')) {
      const f = await pr3Legs({ install: await loadLifecycle(LSRC.replace(a, '    if (rec) {\n')), quiet: true, legs: ['z'] });
      ok(f.length === 1 && f[0].startsWith('§PR3 (z) N3 A PRESSED RESUME'), `mutant pr3-record-z (d159c081b's resume: the record's z for every re-opened row — a press lands under the window raised since): (z) RED (${f.length})`);
      const g = await pr3Legs({ install: await loadLifecycle(LSRC.replace(a, '    if (false) {\n')), quiet: true, legs: ['z'] });
      ok(g.length === 1 && g[0].startsWith('§PR3 (z) N3 CONTROL'), `mutant pr3-z-never (no row keeps the record's z): the resume-all's (z) CONTROL RED (${g.length})`);
    }
  }
  {
    const i = CVSRC.indexOf('    // A DISPOSED VIEW NEVER ACTS (r3 N4)'), j = CVSRC.indexOf('    const ids = this._getSessionIds();', i);
    if (ok(i > 0 && j > i && j - i < 900, 'mutant pr3-stale-view-acts: the patched lines exist in chat-view.js')) {
      const f = await pr3Legs({ install: installPR, CV: CVSRC.slice(0, i) + CVSRC.slice(j), quiet: true, legs: ['n4'] });
      ok(f.length === 1 && f[0].startsWith('§PR3 (n4)'), `mutant pr3-stale-view-acts (d159c081b's Resume bar: after the account check the stale view resumes by its window's id): (n4) RED (${f.length})`);
    }
  }
  {
    const a = '  for (const [nid, kid] of pairsOf(refused)) if (nextBy.has(nid) && !hasBox(nextBy.get(nid)) && hasBox(prevBy.get(kid)) && !unplaced.includes(kid)) unplaced.push(kid);\n';
    if (ok(PSRC.includes(a), 'mutant pr3-c1-forgets: the patched line exists in desktop-record.js')) {
      const Mx = M.load('src/lib/desktop-record.js', PSRC.replace(a, ''), 'pr3-c1-forgets');
      const f = await pr3Legs({ PURE: Mx, WSH: loadHandler({ shrinkVerdict: Mx.shrinkVerdict }), quiet: true, legs: ['c1'] });
      ok(f.length === 1 && f[0].startsWith('§PR3 (c1) C1 A REFUSED'), `mutant pr3-c1-forgets (d159c081b's belt: the re-send of a refused newcomer beside its kept row is taken): (c1) RED (${f.length})`);
    }
  }
  {
    const a = '  for (const [id, w] of nextBy) if (prevBy.has(id) && hasBox(prevBy.get(id)) && !hasBox(w) && !carriesFrame(id, w)) unplaced.push(id);\n';
    if (ok(PSRC.includes(a), 'mutant pr3-c2-grouped-exempt: the patched line exists in desktop-record.js')) {
      const Mx = M.load('src/lib/desktop-record.js', PSRC.replace(a, '  const grouped = (w) => !!(w && (w.isTabGuest || (w.tabChain && Array.isArray(w.tabChain.tabs) && w.tabChain.tabs.length > 1)));\n  for (const [id, w] of nextBy) if (prevBy.has(id) && hasBox(prevBy.get(id)) && !hasBox(w) && !grouped(w)) unplaced.push(id);\n'), 'pr3-c2-grouped-exempt');
      const f = await pr3Legs({ PURE: Mx, quiet: true, legs: ['c2'] });
      ok(f.length === 1 && f[0].startsWith('§PR3 (c2) C2 PURE'), `mutant pr3-c2-grouped-exempt (d159c081b's belt: every grouped row exempt — a placed frame stripped is taken): (c2) RED (${f.length})`);
    }
  }
  {
    const a = '    if (!w || !wm.rekeyWindow(w.id, id, { inChain: true })) return false;\n';
    if (ok(DSRC.includes(a), 'mutant pr3-c3-chain-declined: the patched line exists in desktop-manager.js')) {
      const DMp = (await import(pathToFileURL(M.write('src/lib/desktop-manager.js', DSRC.replace(a, '    if (!w || !wm.rekeyWindow(w.id, id)) return false;\n'), 'pr3-c3-chain-declined', { esm: true })).href)).DesktopManager;
      const f = await pr3Legs({ DM: DMp, install: installPR, quiet: true, legs: ['c3'] });
      ok(f.length === 1 && f[0].startsWith('§PR3 (c3)'), `mutant pr3-c3-chain-declined (d159c081b's re-key: a grouped window declined — the kept row rebuilt beside it): (c3) RED (${f.length})`);
    }
  }
  {
    const a = "              const nw = this.app.wm.windows.get(String(rw.winId || rw.id)), box = (a && a.gridBounds) || own;\n              if (nw && box && !nw._onStage) { nw.gridBounds = { ...box }; this.app.wm._applyGridBounds(nw); }\n              continue;\n";
    if (ok(LYSRC.includes(a), 'mutant pr3-tile-default-box: the patched lines exist in layout.js')) {
      const LMa = (await import(pathToFileURL(M.write('src/lib/layout.js', LYSRC.replace(a, '              continue;\n'), 'pr3-tile-default-box', { esm: true })).href)).LayoutManager;
      const f = await pr3Legs({ LM: LMa, install: installPR, quiet: true, legs: ['ph'] });
      ok(f.length === 1 && f[0].startsWith('§PR3 (ph)'), `mutant pr3-tile-default-box (d159c081b's apply: a tile replaced by a phone's live record placed at the desktop's default): (ph) RED (${f.length})`);
    }
  }
  {
    const a = "        if (this.layoutManager.noteOwnRecipe) this.layoutManager.noteOwnRecipe(winInfo.id); else this.layoutManager.scheduleAutoSave(); // re-broadcast with openSpec — owed until a save carries it (r3)\n";
    if (ok(LSRC.includes(a), 'mutant pr3-recipe-dropped: the patched line exists in session-lifecycle.js')) {
      const f = await pr3Legs({ install: await loadLifecycle(LSRC.replace(a, '        this.layoutManager.scheduleAutoSave(); // re-broadcast with openSpec\n')), quiet: true, legs: ['owe'] });
      ok(f.length === 1 && f[0].startsWith('§PR3 (owe)'), `mutant pr3-recipe-dropped (d159c081b's created: the re-broadcast dropped by the anti-echo gate — the row keeps its dead recipe): (owe) RED (${f.length})`);
    }
  }
  // ── r4 (the r3 acceptance's N1–N5 + the residuals): each fix put back as 5033f0a06 shipped it — or removed — turns its own §PR4 leg RED ──
  {
    const LY = read('src/lib/layout.js');
    const cut = [
      ["  noteOwnRecipe(winId) {\n    if (winId == null) return;\n    const id = String(winId), w = this.app.wm.windows.get(id);\n    this._recipeTries?.delete(id); // a NEW recipe (a resume re-opens its row under the same id) has its own two tries — per recipe, never per row for the page's life (r5)\n    (this._owedRecipes || (this._owedRecipes = new Set())).add(id);\n    this.app.desktopManager?.markDirty?.(w?._desktopId); // its desktop goes with the next save (the one on show always does)\n    this.scheduleAutoSave();\n  }\n",
        "  noteOwnRecipe(winId) {\n    if (winId == null) return;\n    (this._owedRecipes || (this._owedRecipes = new Set())).add(String(winId));\n    this._resendOwedRecipes();\n  }\n  _resendOwedRecipes(tries = 0) {\n    if (!this._owedRecipes?.size) return;\n    if (this._restoring) { if (tries < 25) setTimeout(() => this._resendOwedRecipes(tries + 1), 200); return; }\n    this._userDirty = true;\n    this._lastUserInputAt = Math.max(this._lastUserInputAt || 0, Date.now());\n    this.scheduleAutoSave();\n  }\n"],
      ["    // (an owed RECIPE is not re-armed here — r4 N1: it is no act of the person's; it rides the next save of its desktop, once — noteOwnRecipe)\n", "    if (this._owedRecipes?.size) setTimeout(() => this._resendOwedRecipes(), 1000); // …and a live recipe this page owes the hub (noteOwnRecipe)\n"],
      ["    if (!this._userDirty && this._owedDesks().size) { this._saveOwedRecipes(); return; } // a RECIPE this page owes the hub goes as its OWN save (r4 N1 — noteOwnRecipe)\n", ''],
      ["{ this._userDirty = false; if (this._owedDesks().size) this._saveOwedRecipes(); return; } // (a recipe owed goes as its own — r4 N1)", '{ this._userDirty = false; return; }'],
      ["    for (const d of this._owedDesks()) dm?.markDirty?.(d); // an owed recipe's desktop not on show (the person switched since its answer) goes too (r4 N1)\n", ''],
      ["    if (!this._userDirty && !this._applying && !this._deferT && this._owedDesks().size) { this._deferT = setTimeout(() => { this._deferT = null; this.scheduleAutoSave(); }, 200); return; } // an owed recipe (r4 N1) waits for the gate too — asked again every 200 ms until it opens; no dirty bit, no input time\n", ''],
    ];
    if (ok(cut.every(([a]) => LY.includes(a)), 'mutant pr4-owed-rearm: the patched lines exist in layout.js')) {
      const LMx = (await import(pathToFileURL(M.write('src/lib/layout.js', cut.reduce((s, [a, b]) => s.replace(a, b), LY), 'pr4-owed-rearm', { esm: true })).href)).LayoutManager;
      const f = await pr4Legs({ LM: LMx, install: installPR, quiet: true, legs: ['owe'] });
      ok(f.length === 3 && f.every((n) => n.startsWith('§PR4 (owe)')), `mutant pr4-owed-rearm (5033f0a06's owed recipe: cleared only by a save of its own desktop, re-armed after every remote record with a fabricated input time): (owe) RED ×3 — the recipes not carried, the idle phone echoing, the new session's page echoing (${f.length})`);
    }
  }
  for (const [tag, a, b, road, want, why] of [
    ['pr4-timeout-holds', '        settled(); // the watchdog ends the WAIT (r4 N2): a press after it creates again — a late answer still binds in this window\n', '', 'rel', /^§PR4 \(rel\) N2 RELEASED AT THE WATCHDOG/, "5033f0a06's watchdog: a toast only — the press joins the dead wait"],
    ['pr4-reqless-holds', "      if (msg.type === 'error' && !msg.reqId && !msg.sessionId) settled();\n", '', 'rel', /^§PR4 \(rel\) N2 RELEASED AT AN ERROR NAMING NO REQUEST/, "5033f0a06's request: an error naming no request ends nothing"],
    ['pr4-reconnect-holds', '      lostWatch = (up) => { if (!up) { if (out) lost = true; } else if (lost) settled(); else out = true; };\n', '      lostWatch = () => {};\n', 'rel', /^§PR4 \(rel\) N2 RELEASED AT A RECONNECT/, "5033f0a06's create: a frame lost with its socket waits for ever"],
    ['pr4-close-holds', '    if (!this._winIs(w)) { this._resumeWins.delete(k); return null; }\n', '', 'rel', /^§PR4 \(rel\) N2 RELEASED AT THE PERSON'S CLOSE/, 'the wait outlives its window — neither the join\'s instance check nor (r5) the close\'s own release'],
    ['pr4-join-silent', " showToast(t('Still resuming this conversation — its window is waiting for the session to start'));", '', 'rel', /^§PR4 \(rel\) N2 A PRESS WHILE THE CREATE IS LIVE/, "5033f0a06's join: focused, said nothing"],
    ['pr4-respawn-pressed', "excludeWebuiId: sess.serverId || undefined, unattended: true });", 'excludeWebuiId: sess.serverId || undefined });', 'z2', /^§PR4 \(z2\) N3 ONLY A PRESS LANDS ON TOP — THE EXIT RESPAWN/, "5033f0a06's respawn: a resume as a press — on top, focused"],
    ['pr4-loud-bulk', "      ...(unpressed ? { quiet: true } : {}), // nobody pressed it: drawn, the person's window keeps the focus (r4 N3)\n", '', 'z2', /^§PR4 \(z2\) N3 ONLY A PRESS LANDS ON TOP/, "5033f0a06's create: every unattended window focused at its record z, under the window it took the keys from"],
    ['pr4-fence-unmarked', '    m.set(id, (m.get(id) || 0) + 1);\n', '', 'f5', /^§PR4 \(f5\) N5 THE FENCE'S DYNAMIC HALF/, 'no window is marked in a resume\'s turn'],
    ['pr4-second-view-any', '    if (other) { this._fenceSays(', '    if (false) { this._fenceSays(', 'f5', /^§PR4 \(f5\) N5 A SECOND VIEW IS OF THE CONVERSATION/, "5033f0a06's _closeSecondView: any id it is handed"],
  ]) {
    if (ok(LSRC.includes(a), `mutant ${tag}: the patched line exists in session-lifecycle.js`)) {
      const src = tag === 'pr4-close-holds' ? LSRC.replace("    winInfo?._listenerCtl?.signal?.addEventListener?.('abort', () => { settled(); cancelReq?.(); }, { once: true });\n", '') : LSRC; // r5 N1: the close releases the wait itself too
      const f = await pr4Legs({ install: await loadLifecycle(src.replace(a, b)), quiet: true, legs: [road], ends: road === 'rel' ? [{ 'pr4-timeout-holds': 'timeout', 'pr4-reqless-holds': 'reqless', 'pr4-reconnect-holds': 'reconnect', 'pr4-close-holds': 'closed', 'pr4-join-silent': 'join' }[tag]] : null });
      const n = tag === 'pr4-loud-bulk' ? 3 : tag === 'pr4-fence-unmarked' ? 2 : 1;
      ok(f.length === n && f.every((x) => want.test(x)), `mutant ${tag} (${why}): (${road}) RED${n > 1 ? ' ×' + n : ''} (${f.length})`, f);
    }
  }
  {
    const MAS = read('src/lib/manage-agents.js'), a = 'excludeWebuiId: sess.serverId, unattended: true, ';
    if (ok(MAS.includes(a), 'mutant pr4-pool-pressed: the patched line exists in manage-agents.js')) {
      const f = await pr4Legs({ install: installPR, MA: MAS.replace(a, 'excludeWebuiId: sess.serverId, '), quiet: true, legs: ['z2'] });
      ok(f.length === 1 && /THE POOL'S COLD RESTART/.test(f[0]), `mutant pr4-pool-pressed (5033f0a06's cold restart: a resume as a press — on top, focused): (z2) RED (${f.length})`);
    }
  }
  {
    const WS = read('src/ws-handler.js');
    const a = "            const refusedHere = Array.isArray(layoutData.desktops[desktopId].refusedNewcomers) ? layoutData.desktops[desktopId].refusedNewcomers : [];\n";
    const i = WS.indexOf('            if (!v.ok && v.newcomers?.length) { const pk = '), j = WS.indexOf('\n', i);
    if (ok(WS.includes(a) && i > 0, 'mutant pr4-memory-on-socket: the patched lines exist in ws-handler.js')) {
      const src = WS.slice(0, i) + "            if (v.ok) ws._refusedNewcomers?.delete(desktopId);\n            else if (v.newcomers?.length) { const m = ws._refusedNewcomers || (ws._refusedNewcomers = new Map()); const k = new Set(); m.set(desktopId, [...refusedHere, ...v.newcomers].filter(([a, b]) => !k.has(a + '|' + b) && k.add(a + '|' + b)).slice(-64)); }" + WS.slice(j);
      const f = await pr4Legs({ WSH: M.load('src/ws-handler.js', src.replace(a, '            const refusedHere = ws._refusedNewcomers?.get(desktopId) || [];\n'), 'pr4-memory-on-socket'), quiet: true, legs: ['n4r'] });
      ok(f.length === 1 && f[0].startsWith('§PR4 (n4r) N4 THE REFUSAL MEMORY'), `mutant pr4-memory-on-socket (5033f0a06's hub: the refused newcomers remembered on the socket): (n4r) RED (${f.length})`);
    }
  }
  {
    const LY = read('src/lib/layout.js'), a = '    if (refused) this._recipesRefused(s, key); // a recipe that save carried is owed again (r4 N1)\n';
    if (ok(LY.includes(a), 'mutant pr4-refusal-forgets: the patched line exists in layout.js')) {
      const LMx = (await import(pathToFileURL(M.write('src/lib/layout.js', LY.replace(a, ''), 'pr4-refusal-forgets', { esm: true })).href)).LayoutManager;
      const f = await pr4Legs({ LM: LMx, install: installPR, quiet: true, legs: ['owe-r'] });
      ok(f.length === 1 && f[0].startsWith('§PR4 (owe-r)'), `mutant pr4-refusal-forgets (a recipe counted as carried at its SEND — the refused save carried nothing): (owe-r) RED (${f.length})`);
    }
  }
  {
    const LY = read('src/lib/layout.js'), a = '          const a = arrangementFor(layers, rw) || (!win && held ? arrangementFor(held, rw) : null);';
    if (ok(LY.includes(a), 'mutant pr4-held-box-dropped: the patched line exists in layout.js')) {
      const LMx = (await import(pathToFileURL(M.write('src/lib/layout.js', LY.replace(a, '          const a = arrangementFor(layers, rw);'), 'pr4-held-box-dropped', { esm: true })).href)).LayoutManager;
      const f = await pr4Legs({ LM: LMx, install: installPR, quiet: true, legs: ['hb'] });
      ok(f.length === 1 && f[0].startsWith('§PR4 (hb)'), `mutant pr4-held-box-dropped (5033f0a06's apply: a phone-named row a desktop had not drawn built at its default box): (hb) RED (${f.length})`);
    }
  }
  {
    // r5 N1: the window's close no longer releases the watches (the abort line) / the re-make no longer does (isAlive) / the r4 tip (both,
    // and ws.js walking the live array) / the ws client's notify over the live array
    const L5 = read('src/lib/session-lifecycle.js'), WJ = read('src/lib/ws.js');
    const ab = "    winInfo?._listenerCtl?.signal?.addEventListener?.('abort', () => { settled(); cancelReq?.(); }, { once: true });\n";
    const al = "      isAlive: () => this._winIs(winInfo) || (settled(), false), // the window INSTANCE (r3 N2): one re-made under the same id is another window — its end releases the wait's watches (r5 N1)\n";
    const tipAl = '      isAlive: () => this._winIs(winInfo), // the window INSTANCE (r3 N2): one re-made under the same id is another window\n';
    const nl = '  _notifyState(connected) { const live = this._stateListeners; for (const h of [...live]) if (live.includes(h)) h(connected); }\n';
    const tipNl = '  _notifyState(connected) { for (const h of this._stateListeners) h(connected); }\n';
    if (ok(L5.includes(ab) && L5.includes(al) && WJ.includes(nl), 'mutant pr5-*: the patched lines exist in session-lifecycle.js / ws.js')) {
      let f = await pr5Legs({ install: await loadLifecycle(L5.replace(ab, '')), quiet: true, legs: ['close'] });
      ok(f.length === 1 && f[0].startsWith('§PR5 (close) N1 THE WATCHES DIE'), `mutant pr5-close-keeps-watch (the window's close releases nothing — the next frame does): (close) RED at the close (${f.length})`);
      f = await pr5Legs({ install: await loadLifecycle(L5.replace(al, tipAl)), quiet: true, legs: ['remake'] });
      ok(f.length === 1 && f[0].startsWith('§PR5 (remake)'), `mutant pr5-remake-keeps-watch (the isAlive cleanup without settled()): (remake) RED (${f.length})`);
      const tipWs = await loadWs(WJ.replace(nl, tipNl));
      f = await pr5Legs({ install: await loadLifecycle(L5.replace(ab, '').replace(al, tipAl)), WS: tipWs, quiet: true, legs: ['close', 'remake'] });
      ok(f.length === 3 && f[1].startsWith('§PR5 (close) N1 …THE RECONNECT AFTER IT'), `mutant pr5-r4-tip (0691bb591: the cleanup without settled + the live-array notify — the acceptance's repro): (close) ×2 incl. the skipped listener + (remake) RED (${f.length})`);
      f = await pr5Legs({ WS: tipWs, quiet: true, legs: ['law'] });
      ok(f.length === 1 && f[0].startsWith('§PR5 (law)'), `mutant pr5-notify-live (ws.js walks the live listener array): (law) RED (${f.length})`);
    }
  }
  {
    const WS = read('src/ws-handler.js'), i = WS.indexOf('            if (!v.ok && v.newcomers?.length) { const pk = '), j = WS.indexOf('\n', i);
    if (ok(i > 0, 'mutant pr5-memory-freezes: the patched line exists in ws-handler.js')) {
      const old = "            if (!v.ok && v.newcomers?.length) { const k = new Set(), next = [...refusedHere, ...v.newcomers].filter(([a, b]) => !k.has(a + '|' + b) && k.add(a + '|' + b)).slice(-64); if (next.length !== refusedHere.length) { layoutData.desktops[desktopId].refusedNewcomers = next; writeLayouts(layoutData); } }";
      const f = await pr5Legs({ WSH: M.load('src/ws-handler.js', WS.slice(0, i) + old + WS.slice(j), 'pr5-memory-freezes'), quiet: true, legs: ['n2'] });
      ok(f.length === 1 && f[0].startsWith('§PR5 (n2)'), `mutant pr5-memory-freezes (0691bb591's hub: a length test after the cut — a full memory never takes a new pair): (n2) RED (${f.length})`);
      const r5 = "            if (!v.ok && v.newcomers?.length) { const pk = ([a, b]) => a + '|' + b, now = new Map(v.newcomers.map((p) => [pk(p), p])), next = [...refusedHere.filter((p) => !now.has(pk(p))), ...now.values()].slice(-64); if (JSON.stringify(next) !== JSON.stringify(refusedHere)) { layoutData.desktops[desktopId].refusedNewcomers = next; writeLayouts(layoutData); } }";
      let g = await pr6Legs({ WSH: M.load('src/ws-handler.js', WS.slice(0, i) + r5 + WS.slice(j), 'pr6-order-writes'), quiet: true });
      ok(g.length === 1 && g[0].startsWith('§PR6 (n2b)'), `mutant pr6-order-writes (5f3959656's hub: written whenever the JSON changed — a remembered pair's move-to-end was a write): (n2b) RED (${g.length})`);
      const a = "layoutData.desktops[desktopId].refusedNewcomers = next; if (next.length !== refusedHere.length || next.some((p) => !had.has(pk(p)))) writeLayouts(layoutData); }";
      if (ok(WS.slice(i, j).includes(a), 'mutant pr6-order-on-disk-only: the patched clause exists in ws-handler.js')) {
        g = await pr6Legs({ WSH: M.load('src/ws-handler.js', WS.slice(0, i) + WS.slice(i, j).replace(a, "if (next.length !== refusedHere.length || next.some((p) => !had.has(pk(p)))) { layoutData.desktops[desktopId].refusedNewcomers = next; writeLayouts(layoutData); } }") + WS.slice(j), 'pr6-order-on-disk-only'), quiet: true });
        ok(g.length === 1 && g[0].startsWith('§PR6 (n2b)'), `mutant pr6-order-on-disk-only (the move-to-end kept only with a write — the order is not the LRU's: the oldest stored leaves, not the least recently refused): (n2b) RED (${g.length})`);
      }
    }
  }
  {
    const LY = read('src/lib/layout.js'), a = "    this._recipeTries?.delete(id); // a NEW recipe (a resume re-opens its row under the same id) has its own two tries — per recipe, never per row for the page's life (r5)\n";
    if (ok(LY.includes(a), 'mutant pr5-budget-per-row: the patched line exists in layout.js')) {
      const LMx = (await import(pathToFileURL(M.write('src/lib/layout.js', LY.replace(a, ''), 'pr5-budget-per-row', { esm: true })).href)).LayoutManager;
      const f = await pr5Legs({ LM: LMx, install: installPR, quiet: true, legs: ['owe-b'] });
      ok(f.length === 1 && f[0].startsWith('§PR5 (owe-b)'), `mutant pr5-budget-per-row (0691bb591: the two tries per row id for the page's life — a re-made row's new recipe dropped at its first refusal): (owe-b) RED (${f.length})`);
    }
  }
  for (const r of copiesCensus(M.files, M.dir, REPO, { minCopies: 14, label: '§6 PR ' })) ok(r.pass, r.name, r.detail);
});

console.log(`\n${fail ? 'FAIL' : 'ALL PASS'} (${pass} passed, ${fail} failed)`);
process.exit(fail ? 1 : 0);

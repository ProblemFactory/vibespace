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
import { REPO, LIB, read, J, tick, made, mkEl, toasts, toastText, S, T, CID, GB, chat, files, DESKS, TRIPLE, SINGLE, DOC, ids, sessionEntries, MODEL, loadHandler, hub, refusals, acks, RealDM, RealLM, world, switchTo, loadLifecycle, pageOn, press } from './layout-dup-world.mjs';
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
  const ROWS = { 'src/routes/persistence.js': [9, 'the presets, the active preset, the custom grids, the autosave slot, the two restores, the import — each through writeLayouts'], 'src/ws-handler.js': [6, 'layout-sync (noteDupsLeft: listed / gone / ended) + desktop-create (an empty record) / -delete (the trace goes with it) / -rename / -reorder (no record changes) + the end seam (endTraces — r5 N: a killed conversation leaves every trace) — each through writeLayouts (ctx)'] };
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
    const copyR = await dm8('        if (liveServerIds.has(sessionOf(ws))) { noSpec.push(winId); continue; }\n', '', 'r8-R2-restore-copy');
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
  for (const r of copiesCensus(M.files, M.dir, REPO, { minCopies: 4, label: '§6 ' })) ok(r.pass, r.name, r.detail);
});


console.log(`\n${fail ? 'FAIL' : 'ALL PASS'} (${pass} passed, ${fail} failed)`);
process.exit(fail ? 1 : 0);

#!/usr/bin/env node
// A REFUSAL NEVER RE-SENDS THE RECORD IT REFUSED · ONE CONVERSATION, ONE WINDOW ENTRY — the real page's clock of userW
// inc-mw1ogdno-5jny (the fast half — PURE, the real handler's A and C, the toast — is test-layout-dup-storm; the harness
// scripts/layout-dup-world.mjs, the shape scripts/fixtures/layout-dup-triple.json). In-process, no ports, real timers (the
// autosave's 500 ms debounce, a switch's 1 s gate — why this suite is heavy):
//   §3 THE LOOP on the real DesktopManager + LayoutManager wired to the real handler: the page boots on X, switches to V and runs
//      5 s of autosaves — 0 refusals (2.369.374: one per ~515 ms), V and Y lose their copies (evidence 'dup', by X's window), S
//      is listed ONCE, 0 toasts. B — A removed (the handler's verdict without its duplicate rule): at most ONE refusal per
//      desktop, the re-send CARRIES the kept row, then quiet; THE BREAKER: a server that refuses what the page cannot fix ⇒ the
//      refused record is never re-sent unchanged; ≥ 2 refusals of one key ⇒ «…disagree…» said ONCE
//   §5 E — THE WRITER, a census of the doors over the shape (a conversation listed on ONE desktop, the page on another; the peak
//      of entries any write left on disk): the REAL session-lifecycle attachSession (a person's open) made the second entry and,
//      on a second page, the THIRD — every other door keeps one; now it goes to the desktop that lists it; a page that shows S
//      normalizes the triple at its next save
//   §6 MUTANTS: B's rearm restored (no breaker), B's kept rows removed (2.369.374's reconcile), E's door removed — each RED
//   §7 ROUND 2: two pages over one hub (the hub's dedup verdict; the kept close), the breaker off-screen, a deduped tab member, the reveal
//   §8 ROUND 3: F — a page whose socket is down (F1 on show, F2 hidden) and a NEW hub process over the same data/ (F3, F4) never
//      loses the window it shows: closed [] on both pages, both entries on the hub (the hub's trace + the page's keep); G — a refused dedup
//      beside a tab group leaves the hub's record JSON-equal and every page's group as it was; H — a late reveal retires on any act
//      (H1 a switch, H4 a key), waits while its window is still coming (H2, r6 R), fires once and silently when nothing happened (H3);
//      mutants (the page's keep, the trace, the partial restore ± the hub's chain gate, the token) each RED
//   §9 ROUND 4 (I J K L M) · §10 ROUND 5 (O N P) · §11 ROUND 6: Q — the person's front tab belongs to the desktop (a relay of V while a
//      member is still opening never moves it: a theme change, a box move, the deferred reveal, a double-click; an act elsewhere drops
//      it); R — a reveal is never given up in silence (the open's error said once, a build with no sign of life said once, the ask clear)
//   §12 ROUND 7: Q′ — only the person's act drops the mark (the switch a reveal performs — keepInFront's revealWindow, also held
//      behind the 1 s gate — keeps it); S — an open resolves to the window this page has first (shown, then still attaching — `sessions`
//      counts only ATTACHED windows now), never to a copy on another desktop; an opener still out past the grace is said once
//   §13 ROUND 8: the latest act wins after the gate (L4: an open on the desktop on show consumes the switch queued before it; its
//      control — a press after the open still drains); «bysession» on the real timing (BS: a copy is never restored, a restore never
//      raises — one switch, V on show to +12 s; BSR: a deferred reveal in flight completes, nothing said)
import { REPO, LIB, read, J, tick, made, toasts, toastText, S, T, CID, GB, chat, files, DESKS, TRIPLE, SINGLE, DOC, ids, sessionEntries, MODEL, loadHandler, hub, refusals, acks, RealDM, RealLM, world, switchTo, loadLifecycle, pageOn, press, sessionIds } from './layout-dup-world.mjs';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
import { scratchDir } from './scratch.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
const require = createRequire(import.meta.url);
let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? '\n    ' + String(typeof extra === 'string' ? extra : J(extra)).slice(0, 900) : '')); } return !!c; };
const section = async (title, fn) => { console.log('— ' + title); try { await fn(); } catch (e) { ok(false, title + ' — threw', e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : String(e)); } };
// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
/** §3: the page boots on X (X built), switches to V (the person's act) and is left alone for `ms` — what saves now is the page's
 *  own (2.369.374: each refusal re-armed the save; a person's input inside the debounce would only have delayed it) */
async function loopRun({ WSH, DM = RealDM, LM = RealLM, ms = 5000, records = TRIPLE() } = {}) {
  const H = hub(WSH, DOC(records));
  const W = world({ records, active: 'desk-x', DM, LM, H });
  const t0 = made.length;
  await switchTo(W, 'desk-v');
  const start = Date.now();
  W.act();
  while (Date.now() - start < ms) await tick(250);
  await tick(700);
  const sockFrames = W.sent.filter((m) => m.type === 'layout-sync');
  return { H, W, toasts: toasts(t0), sockFrames };
}
async function loopLegs({ WSH, DM = RealDM, LM = RealLM, quiet = false, legs = null } = {}) {
  const failed = [];
  const leg = (c, n, extra) => { if (!quiet) ok(c, n, extra); if (!c) failed.push(n); return !!c; };
  const want = (k) => !legs || legs.includes(k);
  if (want('A')) {
    const r = await loopRun({ WSH, DM, LM });
    const nRef = r.H.tele.filter((e) => e.name === 'layout-sync-refused').length + r.H.tele.filter((e) => e.name === 'layout-sync-storm').length;
    const doc = r.H.layouts();
    leg(nRef === 0, `§3 THE LOOP (the real page on the real handler, 5 s on V): 0 refusals (2.369.374: one per ~515 ms) — here ${nRef}`, r.H.logs.filter((l) => /REFUSED|STORM/.test(l)).slice(0, 3));
    leg(J(sessionEntries(doc)) === J(['desk-x:win-x-s']), '§3 …ONE conversation, ONE window entry: S is listed once across the three desktops (X\'s, the window the page shows); V and Y lost their copies', sessionEntries(doc));
    const ev = r.W.syncs().flatMap((m) => m.evidence || []).filter((e) => e.why === 'dup');
    leg(ev.some((e) => e.id === 'win-v-s' && e.by === 'win-x-s') && ev.some((e) => e.id === 'win-y-s' && e.by === 'win-x-s') && !r.W.syncs().some((m) => (m.evidence || []).some((e) => e.why === 'unbuilt' && /-s$/.test(e.id))), '§3 …each copy left WITH evidence {why:\'dup\', by:\'win-x-s\'} (the dedup is its own evidence, never a silent delete; never \'unbuilt\')', ev);
    leg(r.toasts.length === 0, `§3 …and the screen says nothing: 0 toasts (2.369.374: a warn every ~500 ms) — here ${r.toasts.length}`, r.toasts.map(toastText));
    leg(J(ids(doc.desktops['desk-v'].autoSave.windows).sort()) === J(['v-1', 'v-2', 'v-3', 'win-v-t']) && J(ids(doc.desktops['desk-y'].autoSave.windows).sort()) === J(['y-1', 'y-2']) && J(ids(doc.desktops['desk-x'].autoSave.windows).sort()) === J(['win-x-s', 'x-1', 'x-2']), '§3 …every other window of the three records stays', { v: ids(doc.desktops['desk-v'].autoSave.windows), y: ids(doc.desktops['desk-y'].autoSave.windows) });
  }
  return failed;
}
/** B: A removed on the server (the planted copy is a refused drop) — the kept row is carried, ONE refusal, then quiet */
async function breakerLegs({ WSH, DM = RealDM, LM = RealLM, quiet = false, legs = null } = {}) {
  const failed = [];
  const leg = (c, n, extra) => { if (!quiet) ok(c, n, extra); if (!c) failed.push(n); return !!c; };
  const want = (k) => !legs || legs.includes(k);
  if (want('B1')) {
    const r = await loopRun({ WSH, DM, LM });
    const per = (d) => r.H.logs.filter((l) => l.includes(`[layout-sync] REFUSED a record of desktop "${d}"`)).length;
    const vSends = r.W.syncs('desk-v').length;
    leg(per('Desk V') <= 1 && per('Desk Y') <= 1 && per('Desk X') === 0 && vSends <= 4, `§3 B: A removed (the server will not explain the copy): at most ONE refusal per record change, no 2 Hz storm — V ${per('Desk V')}, Y ${per('Desk Y')} refusal(s), ${vSends} write(s) of V in 5 s (2.369.374: ~10 of each)`, r.H.logs.filter((l) => /REFUSED|STORM/.test(l)).slice(0, 4));
    const v = r.H.layouts().desktops['desk-v'].autoSave.windows;
    leg(ids(v).includes('win-v-s') && J(v.find((w) => w.winId === 'win-v-s').openSpec) === J(TRIPLE()['desk-v'][2].openSpec), '§3 B: …the reconciled re-send CARRIED the server\'s row for the copy (verbatim — its id and its recipe), so nothing was dropped twice', ids(v));
    leg(r.toasts.length === 0, `§3 B: …and no toast: a refused cleanup of the page's own (its 'dup') is nothing the person asked for (here ${r.toasts.length})`, r.toasts.map(toastText));
  }
  if (want('B2')) {
    // THE BREAKER: a server that refuses every write and keeps the record as the page sent it (a disagreement the page cannot fix)
    const recs = TRIPLE(); delete recs['desk-y']; delete recs['desk-v'];
    const W = world({ records: { 'desk-x': [files('x-1', 1), files('x-2', 2)] }, active: 'desk-x', DM, LM, refuseAll: (c) => c.state });
    const t0 = made.length;
    W.act();
    for (let i = 0; i < 12; i++) await tick(400); // 4.8 s of the page left alone after its act
    const quietSends = W.syncs('desk-x').length;
    leg(quietSends === 1, `§3 B THE BREAKER: a refused record the page cannot change is NEVER re-sent unchanged — 1 write in 5 s, never a cadence (the rearm after the refusal cancelled: the capture equals the refused one) — here ${quietSends}`, W.syncs('desk-x').map((m) => m.sentAt));
    W.act(); await tick(1200);
    leg(W.syncs('desk-x').length === 1, '§3 B …a person\'s act that changes nothing is still held (the same record)', W.syncs('desk-x').length);
    W.wins.get('x-1').gridBounds = { left: 0.5, top: 0.5, width: 0.25, height: 0.25 }; W.act(); await tick(1200);
    W.wins.get('x-1').gridBounds = { left: 0.6, top: 0.5, width: 0.25, height: 0.25 }; W.act(); await tick(1200);
    const said = toasts(t0).filter((e) => /disagree/.test(toastText(e)));
    leg(W.syncs('desk-x').length === 3 && said.length === 1, '§3 B …each act that changes the record is sent (and refused); the 2nd refusal of one key is said ONCE — «This page and the server disagree about desktop “Desk X” — reload…»', { writes: W.syncs('desk-x').length, said: said.map(toastText) });
    W.wins.get('x-1').gridBounds = { left: 0.7, top: 0.5, width: 0.25, height: 0.25 }; W.act(); await tick(1200);
    leg(toasts(t0).filter((e) => /disagree/.test(toastText(e))).length === 1, '§3 B …a third refusal says nothing more (said once, never a cadence)');
  }
  return failed;
}
const realDR = require(MODEL);
const noDupRule = (args = {}) => realDR.shrinkVerdict({ ...args, evidence: (args.evidence || []).map((e) => (e && e.why === 'dup' ? { id: e.id, why: 'unbuilt' } : e)) }); // A removed: a duplicate is the page's 'unbuilt' again
await section('§3 THE LOOP on the real classes + the real handler — A converges, B holds with A removed', async () => {
  await loopLegs({ WSH: loadHandler() });
  await breakerLegs({ WSH: loadHandler({ shrinkVerdict: noDupRule }) });
});

async function censusLegs(install, { quiet = false } = {}) {
  const failed = [];
  const leg = (c, n, extra) => { if (!quiet) ok(c, n, extra); if (!c) failed.push(n); return !!c; };
  const rows = [];
  const settle = async (W) => { W.act(); await tick(1300); };
  // THE PERSON'S OPEN (a sidebar row, the palette, a For-you link — attachSession, not a replay) — page 1 on X, then page 2 on Y
  {
    const H = hub(loadHandler(), DOC(SINGLE()));
    const P1 = pageOn(H, install, 'desk-x');
    P1.app.attachSession(S, 'Atlas notes', '/srv/u/atlas', { mode: 'chat', backend: 'claude', backendSessionId: CID });
    await tick(1200); await settle(P1);
    const one = H.peak();
    const P2 = pageOn(H, install, 'desk-y');
    P2.app.attachSession(S, 'Atlas notes', '/srv/u/atlas', { mode: 'chat', backend: 'claude', backendSessionId: CID });
    await tick(1200); await settle(P2);
    const two = H.peak();
    rows.push(['attachSession — a person opens the conversation on a page that has not built its desktop', one, two]);
    leg(one === 1 && two === 1 && P1.dm.activeDesktopId === 'desk-v' && P2.dm.activeDesktopId === 'desk-v', `§5 E THE WRITER: a person opening S (the REAL attachSession) on a page that has not built V goes TO V — its switch builds V's window; on two pages no write ever lists S twice (2.369.374: 2, then 3 — the triple) — peak here ${one}, then ${two}`, { one, two, now: sessionEntries(H.layouts()), p1: P1.dm.activeDesktopId, p2: P2.dm.activeDesktopId });
    leg(P1.wins.has('win-v-s') && ![...P1.wins.values()].some((w) => w.id !== 'win-v-s' && w._openSpec && w._openSpec.serverId === S), '§5 E …the window built is V\'s own entry (its id) — no second window of S', [...P1.wins.keys()]);
  }
  // the other doors keep one entry (the census's rows)
  {
    const H = hub(loadHandler(), DOC(SINGLE()));
    const P = pageOn(H, install, 'desk-x');
    await switchTo(P, 'desk-v'); await settle(P);
    const a = H.peak();
    P.dm.moveWindowToDesktop('win-v-s', 'desk-y'); await settle(P);
    const b = H.peak(), bNow = sessionEntries(H.layouts());
    P.app.attachSession(S, 'Atlas notes', '/srv/u/atlas', { mode: 'chat', backend: 'claude', backendSessionId: CID }); await tick(1200); await settle(P);
    const c = H.peak();
    rows.push(['the switch (V\'s replay builds it)', a, a], ['a move to another desktop (the menu)', b, b], ['attachSession of a window this page BUILT (the shortcut)', c, c]);
    leg(a === 1 && b === 1 && J(bNow) === J(['desk-y:win-v-s']) && c === 1, '§5 E census: the switch, a move between desktops and an open of a BUILT window each keep ONE entry at every write', { a, b, bNow, c });
  }
  // the normalization: a page that SHOWS S cleans an existing triple at its next save
  {
    const H = hub(loadHandler(), DOC(TRIPLE()));
    const P = pageOn(H, install, 'desk-x');
    await settle(P);
    leg(J(sessionEntries(H.layouts())) === J(['desk-x:win-x-s']) && !H.tele.some((e) => e.name === 'layout-sync-refused'), '§5 E NORMALIZATION: a page that shows S on X writes V\'s and Y\'s copies away at its next save (evidence \'dup\'), accepted — the triple is ONE entry', sessionEntries(H.layouts()));
  }
  if (!quiet) { console.log('    THE DOOR CENSUS (entries of S across the records after the door, then on a second page):'); for (const r of rows) console.log('      ' + r.slice(0, 3).join(' · ')); }
  return failed;
}
const install0 = await loadLifecycle();
await section('§5 E — THE WRITER: the door census over the shape (the REAL session-lifecycle attachSession)', async () => { await censusLegs(install0); });

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// §7 ROUND 2 (the r1 acceptance on b3a058eb2 — each leg RED there by name): A DEDUP NEVER REMOVES A WINDOW SOMEONE IS LOOKING AT
// (the verifier's world ×2 over one hub); a refused dedup is KEPT, so the person's close beside it lands; THE BREAKER holds for a
// desktop NOT on show too; B a deduped copy leaves its tab group; C a person's open reveals the conversation (its own tab)
const chainOf = (tabs, active = 0) => ({ tabs: [...tabs], active, layout: 'tabs', order: [...tabs] });
const member = (w, tabs, active = 0) => ({ ...w, tabChain: chainOf(tabs, active), isTabGuest: tabs[0] !== w.winId });
const TWO = () => ({ 'desk-x': [chat('win-x-s', S, 0), files('x-1', 1), files('x-2', 2)], 'desk-y': [files('y-1', 0)], 'desk-v': [files('v-1', 0), chat('win-v-s', S, 2)] });
async function r2Legs({ WSH = loadHandler(), DM = RealDM, LM = RealLM, install = null, quiet = false, legs = null } = {}) {
  const failed = [];
  const leg = (c, n, extra) => { if (!quiet) ok(c, n, extra); if (!c) failed.push(n); return !!c; };
  const want = (k) => !legs || legs.includes(k);
  if (want('A')) {
    const H = hub(WSH, DOC(TWO()));
    const A = world({ records: TWO(), active: 'desk-x', DM, LM, H }), B = world({ records: TWO(), active: 'desk-v', DM, LM, H });
    const t0 = made.length, v0 = J(H.layouts().desktops['desk-v'].autoSave.windows);
    A.act(); await tick(2500);
    const vAfter = J(H.layouts().desktops['desk-v'].autoSave.windows); // after A's refusal and its reconciled re-send — before B's own act writes V
    B.act(); await tick(2500);
    const aSock = A.sock(), vRefused = refusals(aSock).filter((f) => f.desktopId === 'desk-v');
    leg(vRefused.some((f) => (f.unexplained || []).includes('win-v-s')) && !H.logs.some((l) => /duplicate window\(s\) left/.test(l)), `§7 r2 A: the HUB refuses A's dedup of V's copy — another client has S attached (no write lets the copy go) — refusals of V ${J(vRefused.map((f) => f.unexplained))}`, H.logs.filter((l) => /layout-sync/.test(l)).slice(0, 4));
    leg(vAfter === v0, '§7 r2 A + r3 G: …and after the refusal the hub\'s record of V is JSON-equal to the record before the proposal (every row, every field)', JSON.parse(vAfter));
    leg(!B.closed.length && !A.closed.length && B.wins.has('win-v-s') && A.wins.has('win-x-s'), `§7 r2 A: two pages each SHOWING S on another desktop (A on X, B on V) — an act on either removes NOTHING on the other; no relay closes a shown window (b3a058eb2: B closed win-v-s with no act of its own) — closed A ${J(A.closed)} B ${J(B.closed)}`);
    leg(J(sessionEntries(H.layouts()).sort()) === J(['desk-v:win-v-s', 'desk-x:win-x-s']), '§7 r2 A: …both entries stay on the hub while both are shown (the verdict is the hub\'s: another client has S attached)', sessionEntries(H.layouts()));
    leg(toasts(t0).length === 0, `§7 r2 A: …and nothing is said on either page (here ${toasts(t0).length})`, toasts(t0).map(toastText));
    // the refused dedup is KEPT: A visits V and the person closes v-1 — the close lands beside the kept copy (claim 1's probe d)
    await switchTo(A, 'desk-v'); A.app.wm.closeWindow('v-1'); A.act(); await tick(1500);
    const v = ids(H.layouts().desktops['desk-v'].autoSave.windows);
    leg(J(v) === J(['win-v-s']), `§7 r2 A: …the refused copy is KEPT on A, so A's person's close of v-1 lands (V = [win-v-s]); nothing re-proposes it (with the kept row gone the copy is dropped again, the hub swallows the repeat and the close is lost) — V ${J(v)}`, H.logs.filter((l) => /REFUSED|STORM/.test(l)).slice(0, 3));
  }
  if (want('H')) {
    // THE BREAKER for a desktop NOT on show (claim 1's probe h): V refused, then four acts on X re-send nothing of V
    const W = world({ records: { 'desk-x': [files('x-1', 1), files('x-2', 2)], 'desk-v': [files('v-1', 0)] }, active: 'desk-x', DM, LM, refuseAll: (c) => (c.desktopId === 'desk-v' ? c.state : null) });
    W.dm.moveWindowToDesktop('x-2', 'desk-v'); W.act(); await tick(1200);
    for (let i = 0; i < 4; i++) { W.act(); await tick(800); }
    leg(W.syncs('desk-v').length === 1, `§7 r2 THE BREAKER on a desktop NOT on show: its refused record is never re-sent by four acts elsewhere — V written ${W.syncs('desk-v').length}× (holdsBack off: once per act)`, W.syncs('desk-v').map((m) => ids(m.state.windows)));
  }
  if (want('B')) {
    const recs = { 'desk-x': [files('x-1', 1), chat('win-x-s', S, 0)], 'desk-y': [files('y-1', 0)], 'desk-v': [member(files('v-h', 0), ['v-h', 'win-v-s', 'v-g']), member(chat('win-v-s', S, 1), ['v-h', 'win-v-s', 'v-g']), member(files('v-g', 2), ['v-h', 'win-v-s', 'v-g'])] };
    const H = hub(WSH, DOC(recs));
    const W = world({ records: recs, active: 'desk-x', DM, LM, H });
    W.act(); await tick(1500);
    const v = H.layouts().desktops['desk-v'].autoSave.windows;
    const host = v.find((w) => w.winId === 'v-h') || {}, guest = v.find((w) => w.winId === 'v-g') || {};
    leg(J(ids(v)) === J(['v-h', 'v-g']) && J(host.tabChain && host.tabChain.tabs) === J(['v-h', 'v-g']) && !host.isTabGuest && J(guest.tabChain && guest.tabChain.tabs) === J(['v-h', 'v-g']) && guest.isTabGuest === true, '§7 r2 B: A DEDUPED COPY LEAVES ITS TAB GROUP TOO — V = [v-h, v-g] and the members\' recorded chain no longer names win-v-s (b3a058eb2: the host kept [v-h, win-v-s, v-g] — a member no record lists)', v.map((w) => [w.winId, w.tabChain && w.tabChain.tabs, !!w.isTabGuest]));
    await switchTo(W, 'desk-v');
    leg(W.ops.some((o) => o[0] === 'chain' && o[1] === 'v-h,v-g'), '§7 r2 B: …and the group RE-FORMS without it on the next replay (b3a058eb2: the chain waits for ever)', W.ops);
  }
  if (want('C') && install) {
    const recs = { 'desk-x': [files('x-1', 1)], 'desk-y': [files('y-1', 0)], 'desk-v': [member(files('v-h', 0), ['v-h', 'win-v-s']), member(chat('win-v-s', S, 1), ['v-h', 'win-v-s'])] };
    const H = hub(WSH, DOC(recs));
    const P = pageOn(H, install, 'desk-x', { DM, LM });
    P.app.attachSession(S, 'Atlas notes', '/srv/u/atlas', { mode: 'chat', backend: 'claude', backendSessionId: CID });
    await tick(2200);
    const w = P.wins.get('win-v-s'), c = w && w._tabChain;
    leg(P.dm.activeDesktopId === 'desk-v' && P.app.wm.activeWindowId === 'win-v-s' && !!c && c.tabs[c.active] === 'win-v-s' && P.ops.some((o) => o[0] === 'reveal' && o[1] === 'win-v-s' && o[2] === false), `§7 r2 C: A PERSON'S OPEN REVEALS THE CONVERSATION — its entry a tab GUEST on V: the open switches to V and shows ITS tab, in front (inc-muiq348r-jwb5's rule; b3a058eb2: the host's tab v-h) — active ${P.app.wm.activeWindowId}, chain ${J(c && { tabs: c.tabs, active: c.active })}`, P.ops);
  }
  return failed;
}
await section('§7 ROUND 2 — dedup never removes a shown window; the kept close; the breaker off-screen; the tab group; the reveal', async () => { await r2Legs({ install: install0 }); });

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ROUND 3 (the r2 acceptance of ab1226ff2): F — WHO IS LOOKING IS A FACT ABOUT THE PAGE, NOT A STATE OF ITS SOCKET; G — A REFUSAL
// LEAVES THE RECORD EXACTLY AS IT WAS; H — A LATE REVEAL NEVER TAKES THE PERSON BACK. `over` = the desktop-record overrides every
// handler of a leg is loaded with (a mutant's).
const DATA3 = scratchDir('ldup-r3'); // the data/ dir the restart legs' two hub processes share (layouts.json on disk)
const BOTH = J(['desk-v:win-v-s', 'desk-x:win-x-s']);
const entries = (H) => J(sessionEntries(H.layouts()).sort());
const traceOf = (H, d = 'desk-v') => (H.layouts().desktops[d] || {}).dupsLeft || [];
const G3 = ['v-h', 'win-v-s', 'v-g'];
const chainRecs = () => ({ 'desk-x': [chat('win-x-s', S, 0), files('x-1', 1)], 'desk-y': [files('y-1', 0)], 'desk-v': [member(files('v-h', 0), G3), member(chat('win-v-s', S, 1), G3), member(files('v-g', 2), G3)] });
const stubChains = (P) => Object.assign(P.app.wm, { _ungroupLast(ch) { for (const id of ch.tabs) { const w = P.wins.get(id); if (w) w._tabChain = null; } P.ops.push(['ungroup', ch.tabs.join(',')]); }, applyChainRecord() { return false; }, setSplitRatio() {} });
async function r3Legs({ over = {}, DM = RealDM, LM = RealLM, install = null, quiet = false, legs = null, logs = null } = {}) {
  const failed = [];
  const leg = (c, n, extra) => { if (!quiet) ok(c, n, extra); if (!c) failed.push(n); return !!c; };
  const want = (k) => !legs || legs.includes(k);
  const handler = (o = {}) => loadHandler({ ...over, ...o });
  const pair = (H) => ({ A: world({ records: TWO(), active: 'desk-x', DM, LM, H }), B: world({ records: TWO(), active: 'desk-v', DM, LM, H }) });
  if (want('F1')) {
    // (i) THE SOCKET DOWN: B shows S on V and has saved; its socket closes (a backgrounded phone, a network flap, a laptop asleep); A dedups
    const H = hub(handler(), DOC(TWO()));
    const { A, B } = pair(H);
    const t0 = made.length;
    B.act(); await tick(1800);
    B.hangUp();
    A.act(); await tick(2500);
    const tr = traceOf(H);
    leg(entries(H) === J(['desk-x:win-x-s']) && tr.some((e) => e.id === 'win-v-s' && e.by === 'win-x-s'), `§8 r3 F1: B's socket closed — the hub hears no page there and accepts A's dedup, TRACING it beside V's record (desktops[V].dupsLeft names win-v-s by win-x-s) — trace ${J(tr)}`, H.logs.filter((l) => /layout-sync/.test(l)).slice(0, 4));
    B.reconnect(); await tick(2800);
    leg(!A.closed.length && !B.closed.length && B.wins.has('win-v-s'), `§8 r3 F1: WHO IS LOOKING OUTLIVES THE SOCKET — B comes back (a new socket, its re-read of the layouts): the window it SHOWS is kept, the trace names it (ab1226ff2: B closed win-v-s) — closed A ${J(A.closed)} B ${J(B.closed)}`);
    leg(entries(H) === BOTH && !traceOf(H).some((e) => e.id === 'win-v-s'), `§8 r3 F1: …and B's next save lists it again — both entries on the hub, the trace forgets it (the hub learned it) — entries ${entries(H)}, trace ${J(traceOf(H))}`, B.syncs('desk-v').slice(-2).map((m) => ids(m.state.windows)));
    leg(toasts(t0).length === 0, `§8 r3 F1: …and nothing is said on either page (here ${toasts(t0).length})`, toasts(t0).map(toastText));
  }
  if (want('F2')) {
    // …the same with V HIDDEN on B (B moved on to Y — the re-read's road for a desktop not on show: cacheRemoteState)
    for (const hidden of [true]) {
      const H = hub(handler(), DOC(TWO()));
      const { A, B } = pair(H);
      const t0 = made.length, how = hidden ? 'V hidden on B (B moved on to Y)' : 'V on show on B';
      if (hidden) await switchTo(B, 'desk-y');
      B.act(); await tick(1800);
      B.hangUp(); await tick(120);
      A.act(); await tick(2500);
      const tr = traceOf(H);
      leg(entries(H) === J(['desk-x:win-x-s']) && tr.some((e) => e.id === 'win-v-s' && e.by === 'win-x-s'), `§8 r3 F2 (${how}): B's socket down — A's dedup is accepted and TRACED beside V's record — trace ${J(tr)}`, H.logs.filter((l) => /layout-sync/.test(l)).slice(0, 4));
      B.reconnect(); await tick(2800);
      leg(!B.closed.length && B.wins.has('win-v-s') && !A.closed.length, `§8 r3 F2 (${how}): …B wakes and re-reads: the window it SHOWS is kept — the trace names it (ab1226ff2: closed) — closed A ${J(A.closed)} B ${J(B.closed)}`);
      leg(entries(H) === BOTH && !traceOf(H).some((e) => e.id === 'win-v-s'), `§8 r3 F2 (${how}): …and B's next save lists it again — both entries on the hub, the trace forgets it (the hub learned it) — entries ${entries(H)}, trace ${J(traceOf(H))}`, B.syncs('desk-v').slice(-2).map((m) => ids(m.state.windows)));
      leg(toasts(t0).length === 0, `§8 r3 F2 (${how}): …nothing said (here ${toasts(t0).length})`, toasts(t0).map(toastText));
    }
  }
  if (want('F3')) {
    // (ii) A HUB RESTART BETWEEN: every socket closes and the process ends (its memory with it); a NEW process over the same data/
    const file = path.join(DATA3, 'f3-layouts.json');
    const H1 = hub(handler(), DOC(TWO()), { file });
    const { A, B } = pair(H1);
    const t0 = made.length;
    B.act(); await tick(1800);
    B.hangUp(); A.hangUp();
    const H2 = hub(handler(), null, { file });
    A.reconnect(H2); await tick(1200);
    A.act(); await tick(2500);
    leg(entries(H2) === J(['desk-x:win-x-s']) && traceOf(H2).some((e) => e.id === 'win-v-s'), `§8 r3 F3 (a NEW hub process over the same data/): A is back first and dedups — the new process knows no page: accepted, and traced on disk — entries ${entries(H2)}`, H2.logs.filter((l) => /layout-sync/.test(l)).slice(0, 4));
    B.reconnect(H2); await tick(2800);
    leg(!A.closed.length && !B.closed.length && B.wins.has('win-v-s') && entries(H2) === BOTH, `§8 r3 F3: …B is back on the new process: its re-read keeps the window it shows and its next save lists it again — closed [] on both, both entries on the hub (ab1226ff2: B closed win-v-s) — closed A ${J(A.closed)} B ${J(B.closed)}, entries ${entries(H2)}`);
    leg(toasts(t0).length === 0, `§8 r3 F3: …nothing said (here ${toasts(t0).length})`, toasts(t0).map(toastText));
    logs?.push(['F3 old process', H1.logs], ['F3 new process', H2.logs]);
  }
  if (want('F4')) {
    // the OLD process accepted the dedup while B was away; the hub restarts; B comes back to the NEW process — the trace it
    // reads is the one on disk
    const file = path.join(DATA3, 'f4-layouts.json');
    const H1 = hub(handler(), DOC(TWO()), { file });
    const { A, B } = pair(H1);
    const t0 = made.length;
    B.act(); await tick(1800);
    B.hangUp(); await tick(120);
    A.act(); await tick(2500);
    A.hangUp();
    const H2 = hub(handler(), null, { file });
    leg(entries(H2) === J(['desk-x:win-x-s']) && traceOf(H2).some((e) => e.id === 'win-v-s' && e.by === 'win-x-s'), `§8 r3 F4: the old process accepted A's dedup while B was away — the NEW process reads the trace from data/ (${J(traceOf(H2))})`);
    A.reconnect(H2); B.reconnect(H2); await tick(2800);
    leg(!A.closed.length && !B.closed.length && B.wins.has('win-v-s') && entries(H2) === BOTH, `§8 r3 F4: …B is back on the new process: closed [] on both, both entries on the hub — closed A ${J(A.closed)} B ${J(B.closed)}, entries ${entries(H2)}`);
    leg(toasts(t0).length === 0, `§8 r3 F4: …nothing said (here ${toasts(t0).length})`, toasts(t0).map(toastText));
    logs?.push(['F4 old process', H1.logs], ['F4 new process', H2.logs]);
  }
  if (want('G')) {
    // A REFUSAL LEAVES THE RECORD EXACTLY AS IT WAS (the acceptance's probe 3): V = the group [v-h, win-v-s(S), v-g]; B shows it
    // (idle from here on); A shows S on X, visits V and acts — its dedup of win-v-s is refused (B has S attached)
    const H = hub(handler(), DOC(chainRecs()));
    const A = world({ records: chainRecs(), active: 'desk-x', DM, LM, H }), B = world({ records: chainRecs(), active: 'desk-y', DM, LM, H });
    for (const P of [A, B]) stubChains(P);
    await switchTo(B, 'desk-v'); await tick(1500);
    B.lm._userDirty = false; B.lm._lastUserInputAt = 0;
    const before = J(H.layouts().desktops['desk-v'].autoSave.windows), bOps = B.ops.length, t0 = made.length;
    const bChain = () => { const w = B.wins.get('win-v-s'); return w && w._tabChain ? w._tabChain.tabs.join(',') : null; };
    await switchTo(A, 'desk-v'); A.act(); await tick(3000);
    const fr = refusals(A.sock()).filter((f) => f.desktopId === 'desk-v');
    leg(fr.length >= 1 && fr[0].reason === 'shrink-without-close' && J(fr[0].unexplained) === J(['win-v-s']) && !fr.some((f) => f.reason === 'chain-disagrees'), `§8 r3 G: A's dedup of the copy in V's group is refused (B shows S) — and nothing A sends after it is a record whose rows disagree (ab1226ff2: the shrunk host chain beside the restored guest row) — refusals ${J(fr.map((f) => [f.reason, f.unexplained || f.windows]))}`);
    leg(J(H.layouts().desktops['desk-v'].autoSave.windows) === before, '§8 r3 G: …the hub\'s record of V after the refusal is JSON-equal to the record before the proposal (every row, its chain, its active tab)', H.layouts().desktops['desk-v'].autoSave.windows.map((w) => [w.winId, w.tabChain && w.tabChain.tabs, w.tabChain && w.tabChain.active, !!w.isTabGuest]));
    const held = A.dm._savedStates.get('desk-v');
    leg(J((held.windows || []).map((w) => [w.winId, w.tabChain && w.tabChain.tabs, w.tabChain && w.tabChain.active, !!w.isTabGuest])) === J(JSON.parse(before).map((w) => [w.winId, w.tabChain && w.tabChain.tabs, w.tabChain && w.tabChain.active, !!w.isTabGuest])), '§8 r3 G: …and A\'s own record of V reads every group as the hub\'s (whatever A proposed ahead of the verdict waited for it — its group was never shrunk)', (held.windows || []).map((w) => [w.winId, w.tabChain && w.tabChain.tabs]));
    leg(bChain() === G3.join(',') && !B.ops.slice(bOps).some((o) => o[0] === 'ungroup' || o[0] === 'chain'), `§8 r3 G: …B's group, on show, is untouched — no ungroup, no rebuild (ab1226ff2: B ungrouped win-v-s) — B's chain ${bChain()}, ops ${J(B.ops.slice(bOps))}`);
    leg(toasts(t0).length === 0, `§8 r3 G: …nothing said (here ${toasts(t0).length})`, toasts(t0).map(toastText));
  }
  if (install && ['H1', 'H2', 'H3', 'H4'].some(want)) {
    // A LATE REVEAL NEVER TAKES THE PERSON BACK (the acceptance's probe 2): V = the group [v-h, win-v-s(S), v-slow]; the page is on X
    // and the person opens S. r5 O: a reveal waits only for what is not yet standing (its switch, its build) — never for a group —
    // so the slow one here is the conversation's OWN window (`slow` = 'win-v-s': its build answers after `slowMs`, or never); H3
    // keeps the slow group member (v-slow) and the window stands at once
    const HG = ['v-h', 'win-v-s', 'v-slow'];
    const recs = () => ({ 'desk-x': [files('x-1', 1)], 'desk-y': [files('y-1', 0)], 'desk-v': [member(files('v-h', 0), HG), member(chat('win-v-s', S, 1), HG), member(files('v-slow', 2), HG)] });
    const page = (slowMs, slow = 'win-v-s') => {
      const H = hub(handler(), DOC(recs()));
      const P = pageOn(H, install, 'desk-x', { DM, LM });
      const orig = P.app.replayOpenSpec;
      P.app.replayOpenSpec = (spec, winId) => {
        if (winId !== slow) return orig(spec, winId);
        if (slowMs != null) setTimeout(() => { const w = P.mkWin(slow, 'desk-v', slow === 'win-v-s' ? { type: 'chat', _openSpec: spec } : { type: 'viewer', _openSpec: spec }); P.lm.onWindowCreated(w); }, slowMs);
        return null;
      };
      return P;
    };
    const open = (P) => P.app.attachSession(S, 'Atlas notes', '/srv/u/atlas', { mode: 'chat', backend: 'claude', backendSessionId: CID });
    const reveals = (P) => P.ops.filter((o) => o[0] === 'reveal');
    if (want('H1')) {
      const P = page(3000), t0 = made.length, at = [];
      open(P); await tick(1000);
      await P.dm.switchTo('desk-y'); // the person moves on (the switcher, a key)
      await tick(3000); at.push(P.dm.activeDesktopId);
      await tick(3000); at.push(P.dm.activeDesktopId);
      leg(J(at) === J(['desk-y', 'desk-y']) && reveals(P).length === 0 && toasts(t0).length === 0, `§8 r3 H1: A LATE REVEAL NEVER TAKES THE PERSON BACK — open, switch away at 1 s, the conversation's window stands at 3 s: nothing moves at 4 s or 7 s (ab1226ff2: back on desk-v at 4.0 s) — active ${J(at)}, reveals ${J(reveals(P))}`);
    }
    if (want('H2')) {
      const P = page(6500), t0 = made.length;
      open(P); await tick(400);
      const first = P.dm.activeDesktopId;
      await tick(6800);
      const c = P.wins.get('win-v-s')?._tabChain;
      leg(first === 'desk-v' && P.dm.activeDesktopId === 'desk-v' && J(reveals(P)) === J([['reveal', 'win-v-s', false]]) && P.app.wm.activeWindowId === 'win-v-s' && !!c && c.tabs[c.active] === 'win-v-s' && P.dm._revealAsk === null && toasts(t0).length === 0, `§8 r3 H2 (r6 R): …A REVEAL IS NEVER GIVEN UP WHILE THE WINDOW IS STILL COMING — nothing done since the open, the window stands only at 6.5 s: revealed then, its own tab in front, nothing said (a3fb7b40e: gave up at 5 s in silence — reveals [], _revealAsk left set) — reveals ${J(reveals(P))}, window ${P.app.wm.activeWindowId}, chain ${J(c && { tabs: c.tabs, active: c.active })}, ask ${J(P.dm._revealAsk)}`);
    }
    if (want('H3')) {
      const P = page(2000, 'v-slow'), t0 = made.length;
      open(P); await tick(3500);
      const w = P.wins.get('win-v-s'), c = w && w._tabChain;
      leg(J(reveals(P)) === J([['reveal', 'win-v-s', false]]) && P.app.wm.activeWindowId === 'win-v-s' && !!c && c.tabs[c.active] === 'win-v-s' && P.dm.activeDesktopId === 'desk-v' && toasts(t0).length === 0, `§8 r3 H3: …nothing done since the open, the window stands at once and a member of its group at 2 s: revealed ONCE — its own tab, in front once the group forms (r5 O: never waiting for it), silent (law C) — reveals ${J(reveals(P))}, chain ${J(c && { tabs: c.tabs, active: c.active })}`);
    }
    if (want('H4')) {
      const P = page(2000);
      open(P); await tick(1000);
      press('keydown'); // the person types (in the window in front, a shortcut) — an act since the open
      await tick(2500);
      leg(reveals(P).length === 0 && P.dm.activeDesktopId === 'desk-v', `§8 r3 H4: …a key the person pressed after the open retires it too — the window stands at 2 s and nothing is revealed — reveals ${J(reveals(P))}`);
    }
  }
  return failed;
}
const r3Logs = [];
await section('§8 ROUND 3 — who is looking outlives the socket (F); a refusal leaves the record as it was (G); a late reveal never takes the person back (H)', async () => {
  await r3Legs({ install: install0, logs: r3Logs });
  for (const [name, l] of r3Logs) console.log(`    [${name}] ` + l.filter((x) => /layout-sync/.test(x)).map((x) => x.replace(/\s+/g, ' ').slice(0, 260)).join('\n    [' + name + '] '));
});

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ROUND 4 (the r3 acceptance of 36bd0c866 — its probes 4–7 and p1, as legs): I — a page's view of a desktop is the record (a kept
// copy's group forms around the members the page builds; its acts land; a 'chain-disagrees' refusal is repaired); J — a kept
// window keeps its group on both roads; K — a person's close is never undone by a keep (the restore that spread the trace);
// L — a reveal waits for the switch it asked for; M — the trace is never cut by count
const grpOf = (P, id) => { const w = P.wins.get(id); return w && w._tabChain ? w._tabChain.tabs.join(',') + '@' + w._tabChain.active : null; };
const hubRows = (H, d = 'desk-v') => (H.layouts().desktops[d].autoSave.windows || []).map((w) => [w.winId, w.tabChain ? w.tabChain.tabs.join(',') : null]);
async function r4Legs({ over = {}, DM = RealDM, LM = RealLM, install = null, quiet = false, legs = null } = {}) {
  const failed = [];
  const leg = (c, n, extra) => { if (!quiet) ok(c, n, extra); if (!c) failed.push(n); return !!c; };
  const want = (k) => !legs || legs.includes(k);
  const handler = (o = {}) => loadHandler({ ...over, ...o });
  if (want('I')) {
    // probe 4's shape: B shows V = [v-h, win-v-s(S), v-g] + v-z and stays connected; A shows S on X and visits V
    const recs = () => ({ ...chainRecs(), 'desk-v': [...chainRecs()['desk-v'], files('v-z', 3)] });
    const H = hub(handler(), DOC(recs()));
    const A = world({ records: recs(), active: 'desk-x', DM, LM, H }), B = world({ records: recs(), active: 'desk-y', DM, LM, H });
    for (const P of [A, B]) stubChains(P);
    const t0 = made.length;
    await switchTo(B, 'desk-v'); await tick(1500);
    B.lm._userDirty = false; B.lm._lastUserInputAt = 0;
    const before = J(H.layouts().desktops['desk-v'].autoSave.windows), bOps = B.ops.length;
    await switchTo(A, 'desk-v'); A.act(); await tick(3000);
    const rA = () => refusals(A.sock()).filter((f) => f.desktopId === 'desk-v'), kA = () => acks(A.sock()).filter((f) => f.desktopId === 'desk-v');
    leg(rA().length === 1 && rA()[0].reason === 'shrink-without-close' && grpOf(A, 'v-h') === 'v-h,v-g@0' && grpOf(A, 'v-g') === 'v-h,v-g@0' && !A.lm.pendingChainOf('v-h'), `§9 r4 I: A's dedup of the grouped copy is refused (B shows S) — and A SHOWS the record's group around the members it builds: v-h + v-g grouped within the apply, nothing pending (36bd0c866: both loose for the page's life, the group pending on the copy) — v-h ${grpOf(A, 'v-h')}, v-g ${grpOf(A, 'v-g')}, pending ${J(A.lm.pendingChainOf('v-h')?.tabs || null)}, refusals ${J(rA().map((f) => f.reason))}`);
    leg(J(H.layouts().desktops['desk-v'].autoSave.windows) === before, '§9 r4 I: …and what A writes beside its kept copy agrees with it — the hub\'s V is still JSON-equal to the record before the proposal (G holds)', hubRows(H));
    // A's person regroups v-h + v-g (tab-group's merge: one new chain on both, `_chainAt` now) — probe 4's act
    const n0 = rA().length, a0 = kA().length;
    const ch = { tabs: ['v-h', 'v-g'], active: 1, layout: 'tabs', order: ['v-h', 'v-g'] };
    for (const id of ch.tabs) { const w = A.wins.get(id); w._tabChain = ch; w._chainAt = Date.now(); }
    A.act(); await tick(2500);
    const vh = H.layouts().desktops['desk-v'].autoSave.windows.find((w) => w.winId === 'v-h');
    leg(rA().length === n0 && kA().length > a0 && J(hubRows(H).filter(([id]) => id !== 'v-z').map(([, c]) => c)) === J(['v-h,win-v-s,v-g', 'v-h,win-v-s,v-g', 'v-h,win-v-s,v-g']) && vh.tabChain.tabs[vh.tabChain.active] === 'v-g', `§9 r4 I: …A's regroup LANDS — acked, and the hub's group names the kept member (it rides every chain A sends for that group: [v-h, win-v-s, v-g] on all three rows, the person's shown tab v-g) (36bd0c866: 'chain-disagrees', 0 acks) — new refusals ${rA().length - n0}, new acks ${kA().length - a0}, hub ${J(hubRows(H))}`);
    // a later act on V: the person moves v-z (an unrelated window)
    const a1 = kA().length;
    A.wins.get('v-z').gridBounds = { left: 0.5, top: 0.5, width: 0.2, height: 0.2 }; A.act(); await tick(2500);
    const vz = H.layouts().desktops['desk-v'].autoSave.windows.find((w) => w.winId === 'v-z');
    leg(rA().length === n0 && kA().length > a1 && J(vz.gridBounds) === J({ left: 0.5, top: 0.5, width: 0.2, height: 0.2 }), `§9 r4 I: …and A's later move of v-z lands (36bd0c866: refused 'chain-disagrees', the hub's box unchanged) — hub v-z ${J(vz.gridBounds)}`);
    leg(!B.ops.slice(bOps).some((o) => o[0] === 'ungroup') && toasts(t0).length === 0, `§9 r4 I: …B's group was never taken apart, and nothing was said — B ops ${J(B.ops.slice(bOps))}, toasts ${toasts(t0).length}`, toasts(t0).map(toastText));
    // A DISAGREEMENT INJECTED BY HAND (p2b's act: v-h re-chained with v-z alone, v-g left on the group object it had — a page
    // state the real tab-group never makes): the hub refuses 'chain-disagrees' — the page REPAIRS it (takes the hub's groups,
    // says so once) and its next write is acked; the desktop is never unwritable from the page
    const n2 = rA().length, t2 = made.length;
    const bad = { tabs: ['v-h', 'v-z'], active: 0, layout: 'tabs', order: ['v-h', 'v-z'] };
    for (const id of bad.tabs) { const w = A.wins.get(id); w._tabChain = bad; w._chainAt = Date.now(); }
    A.act(); await tick(2500);
    const told = toasts(t2).map(toastText);
    leg(rA().slice(n2).some((f) => f.reason === 'chain-disagrees') && grpOf(A, 'v-h') && grpOf(A, 'v-h').startsWith('v-h,v-g') && !A.wins.get('v-z')._tabChain && told.length === 1 && /did not match the server's — this page now shows the server's/.test(told[0]), `§9 r4 I: an injected disagreement is REPAIRED on the page — refused 'chain-disagrees', the page takes the hub's groups (v-h + v-g again, v-z alone) and says so ONCE — v-h ${grpOf(A, 'v-h')}, v-z ${grpOf(A, 'v-z')}, toasts ${J(told)}`);
    const a3 = kA().length, n3 = rA().length;
    A.wins.get('v-z').gridBounds = { left: 0.1, top: 0.6, width: 0.2, height: 0.2 }; A.act(); await tick(2500);
    const vz2 = H.layouts().desktops['desk-v'].autoSave.windows.find((w) => w.winId === 'v-z');
    leg(kA().length > a3 && rA().length === n3 && J(vz2.gridBounds) === J({ left: 0.1, top: 0.6, width: 0.2, height: 0.2 }) && toasts(t2).length === 1, `§9 r4 I: …and the page's next write is ACKED — the desktop stays writable (v-z's move lands) — new acks ${kA().length - a3}, new refusals ${rA().length - n3}, hub v-z ${J(vz2.gridBounds)}`);
  }
  for (const [k, hidden] of [['J1', false], ['J2', true]]) {
    if (!want(k)) continue;
    // probe 7's shape: B shows V's group [v-h, win-v-s(S), v-g] with win-v-s the tab in front, saves, and its socket drops; A
    // dedups win-v-s (accepted, traced); B comes back and re-reads — V on show (J1) or hidden on B (J2: B moved on to Y before
    // its socket dropped — the cacheRemoteState road)
    const recs = () => ({ ...chainRecs(), 'desk-v': [member(files('v-h', 0), G3, 1), member(chat('win-v-s', S, 1), G3, 1), member(files('v-g', 2), G3, 1)] });
    const H = hub(handler(), DOC(recs()));
    const A = world({ records: recs(), active: 'desk-x', DM, LM, H }), B = world({ records: recs(), active: 'desk-v', DM, LM, H });
    for (const P of [A, B]) stubChains(P);
    B.app.wm.restoreTabChain(G3, 1);
    B.act(); await tick(2600);
    if (hidden) { await switchTo(B, 'desk-y'); await tick(600); }
    B.lm._userDirty = false; B.lm._lastUserInputAt = 0;
    const pre = J(H.layouts().desktops['desk-v'].autoSave.windows), bOps = B.ops.length, aOps = A.ops.length, t0 = made.length;
    const how = hidden ? 'V hidden on B' : 'V on show on B';
    B.hangUp();
    A.act(); await tick(3000);
    leg(!hubRows(H).some(([id]) => id === 'win-v-s') && traceOf(H).some((e) => e.id === 'win-v-s'), `§9 r4 ${k} (${how}): B's socket down — A's dedup of the copy in V's group is accepted and traced — hub ${J(hubRows(H))}`);
    B.reconnect(); await tick(4500);
    leg(!B.closed.length && grpOf(B, 'win-v-s') === 'v-h,win-v-s,v-g@1' && !B.ops.slice(bOps).length, `§9 r4 ${k} (${how}): A KEPT WINDOW KEEPS ITS GROUP — B back: win-v-s still in [v-h, win-v-s, v-g], its tab in front, no ungroup / rebuild (36bd0c866 on show: win-v-s torn out, «ungroup v-h, chain v-h,v-g») — win-v-s ${grpOf(B, 'win-v-s')}, B ops ${J(B.ops.slice(bOps))}, closed ${J(B.closed)}`);
    leg(J(H.layouts().desktops['desk-v'].autoSave.windows) === pre, `§9 r4 ${k} (${how}): …and the re-send writes the record BEFORE the dedup — the hub's V JSON-equal to it (every row in its place, its chain, its active tab; 36bd0c866: win-v-s standalone on show, appended last hidden)`, J(hubRows(H)));
    leg(!A.ops.slice(aOps).some((o) => o[0] === 'ungroup' || o[0] === 'chain') && toasts(t0).length === 0, `§9 r4 ${k} (${how}): …nothing the kept window belonged to changed on the other page, and nothing was said — A ops ${J(A.ops.slice(aOps))}, toasts ${toasts(t0).length}`, toasts(t0).map(toastText));
  }
  if (want('K')) {
    // probe 5's shape: A dedups win-v-s (traced); A closes its own copy and leaves; V is restored to the point before the dedup by a
    // road that spread the old desktops[V] (persistence.js before r4: `{ ...desktops[only], autoSave }`) — the record lists
    // win-v-s and the trace still names it; B and C boot on V; C's person CLOSES win-v-s
    const recs = () => ({ 'desk-x': [chat('win-x-s', S, 0), files('x-1', 1)], 'desk-y': [files('y-1', 0)], 'desk-v': [files('v-1', 0), chat('win-v-s', S, 1)] });
    const H = hub(handler(), DOC(recs()));
    const t0 = made.length;
    const A = world({ records: recs(), active: 'desk-x', DM, LM, H });
    A.act(); await tick(3000);
    A.app.wm.closeWindow('win-x-s'); A.act(); await tick(3000);
    A.hangUp();
    const L0 = H.layouts(); L0.desktops['desk-v'] = { ...L0.desktops['desk-v'], autoSave: { windows: [files('v-1', 0), chat('win-v-s', S, 1)], grid: null, updatedAt: Date.now() + 5 } };
    const spread = (L0.desktops['desk-v'].dupsLeft || []).some((e) => e.id === 'win-v-s');
    const now = () => Object.fromEntries(Object.entries(H.layouts().desktops).map(([d, v]) => [d, JSON.parse(J(v.autoSave.windows))]));
    const B = world({ records: now(), active: 'desk-v', DM, LM, H }), C = world({ records: now(), active: 'desk-v', DM, LM, H });
    for (const P of [B, C]) { const st = H.layouts().desktops; for (const d of Object.keys(st)) P.dm.noteStamp(d, st[d].autoSave.updatedAt); P.lm._userDirty = false; P.lm._lastUserInputAt = 0; }
    await tick(500);
    C.app.wm.closeWindow('win-v-s'); C.act(); await tick(4000);
    leg(spread && J(ids(H.layouts().desktops['desk-v'].autoSave.windows)) === J(['v-1']) && B.closed.includes('win-v-s') && !B.wins.has('win-v-s') && !C.wins.has('win-v-s'), `§9 r4 K: A PERSON'S CLOSE IS NEVER UNDONE BY A KEEP — the restored V lists win-v-s while the trace (spread) still names it; C's person closes it: it leaves the hub's record and every page (36bd0c866: B kept it and re-listed it — the close undone on the hub and on C's own screen) — hub V ${J(ids(H.layouts().desktops['desk-v'].autoSave.windows))}, B closed ${J(B.closed)}, C windows ${J([...C.wins.keys()])}`);
    leg(!traceOf(H).some((e) => e.id === 'win-v-s') && toasts(t0).length === 0, `§9 r4 K: …the close's own write took win-v-s out of the trace (only a 'dup' drop enters it; a person's act leaves it) — trace ${J(traceOf(H))}, toasts ${toasts(t0).length}`);
  }
  if (install && want('L')) {
    // probe 6's shape: V = [v-h, win-v-s(S) as a tab guest]; the page on X switches to Y, and the person opens S `gap` ms later
    const recs = () => ({ 'desk-x': [files('x-1', 1)], 'desk-y': [files('y-1', 0)], 'desk-v': [member(files('v-h', 0), ['v-h', 'win-v-s']), member(chat('win-v-s', S, 1), ['v-h', 'win-v-s'])] });
    for (const gap of [300, 1300]) {
      const P = pageOn(hub(handler(), DOC(recs())), install, 'desk-x', { DM, LM });
      await P.dm.switchTo('desk-y');
      await tick(gap);
      P.app.attachSession(S, 'Atlas notes', '/srv/u/atlas', { mode: 'chat', backend: 'claude', backendSessionId: CID });
      await tick(3500);
      const c = P.wins.get('win-v-s')?._tabChain;
      leg(P.dm.activeDesktopId === 'desk-v' && P.app.wm.activeWindowId === 'win-v-s' && c && c.tabs[c.active] === 'win-v-s' && J(P.ops.filter((o) => o[0] === 'reveal')) === J([['reveal', 'win-v-s', false]]), `§9 r4 L (gap ${gap} ms): A REVEAL WAITS FOR THE SWITCH IT ASKED FOR — the open lands while the switch to Y still holds its gate: its own switch is queued, and the reveal waits for it and fires once — its own tab in front (36bd0c866 at 300 ms: the host's tab, reveals []) — active ${P.dm.activeDesktopId}, window ${P.app.wm.activeWindowId}, chain ${J(c && { tabs: c.tabs, active: c.active })}`);
    }
    // a DOUBLE-CLICK on the sidebar row (p5's): press + open, 200 ms later press + open again; a member of the group opens at 2 s
    const HG = ['v-h', 'win-v-s', 'v-slow'];
    const recs2 = () => ({ 'desk-x': [files('x-1', 1)], 'desk-y': [files('y-1', 0)], 'desk-v': [member(files('v-h', 0), HG), member(chat('win-v-s', S, 1), HG), member(files('v-slow', 2), HG)] });
    const P = pageOn(hub(handler(), DOC(recs2())), install, 'desk-x', { DM, LM });
    const orig = P.app.replayOpenSpec;
    P.app.replayOpenSpec = (spec, winId) => { if (winId !== 'v-slow') return orig(spec, winId); setTimeout(() => { const w = P.mkWin('v-slow', 'desk-v', { type: 'viewer', _openSpec: spec }); P.lm.onWindowCreated(w); }, 2000); return null; };
    const open = () => { press('pointerdown'); P.app.attachSession(S, 'Atlas notes', '/srv/u/atlas', { mode: 'chat', backend: 'claude', backendSessionId: CID }); };
    open(); await tick(200); open(); await tick(4000);
    const c = P.wins.get('win-v-s')?._tabChain;
    const rv = P.ops.filter((o) => o[0] === 'reveal');
    leg(rv.length >= 1 && rv.length <= 2 && rv.every((o) => o[1] === 'win-v-s') && c && c.tabs[c.active] === 'win-v-s' && P.app.wm.activeWindowId === 'win-v-s', `§9 r4 L: …a DOUBLE-CLICK lands on the tab it asked for — each open reveals win-v-s once it stands (r5 O: never waiting for the group), and the group forming at 2 s keeps its own tab in front (36bd0c866: the host's tab) — reveals ${J(rv)}, chain ${J(c && { tabs: c.tabs, active: c.active })}`);
  }
  if (want('M')) {
    // p1's shape: B shows 60 copies on V (60 conversations, each shown by A on X) and saves; its socket drops; A's write of V lets
    // all 60 go as duplicates; B comes back
    const N = 60, sids = Array.from({ length: N }, (_, i) => `sess-${i + 1}-41000`);
    const recs = () => ({ 'desk-x': sids.map((s, i) => chat(`win-x-${i + 1}`, s, i % 6)), 'desk-y': [files('y-1', 0)], 'desk-v': [files('v-0', 0), ...sids.map((s, i) => chat(`win-v-${i + 1}`, s, (i + 1) % 6))] });
    const H = hub(handler(), DOC(recs()), { alive: sids });
    const B = world({ records: recs(), active: 'desk-v', DM, LM, H });
    const A = H.connect(); for (const s of sids) H.attach(A, s);
    B.act(); await tick(1800);
    B.hangUp();
    const vNow = () => H.layouts().desktops['desk-v'].autoSave;
    await A.send({ type: 'layout-sync', desktopId: 'desk-v', state: { ...vNow(), windows: [files('v-0', 0)] }, evidence: sids.map((s, i) => ({ id: `win-v-${i + 1}`, why: 'dup', by: `win-x-${i + 1}` })), sentAt: Date.now(), viewport: 'desktop', base: vNow().updatedAt });
    await tick(20);
    const tr = traceOf(H);
    B.reconnect(); await tick(3500);
    const kept = [...B.wins.keys()].filter((id) => /^win-v-/.test(id));
    leg(tr.length === N && !B.closed.length && kept.length === N, `§9 r4 M: THE TRACE IS NEVER CUT BY COUNT — 60 distinct dedups accepted while B was away: the trace holds all 60, and B keeps every copy it shows (36bd0c866: the newest 50 — B closed win-v-1…10) — trace ${tr.length}, B closed ${J(B.closed.slice(0, 4))}, kept ${kept.length}`);
  }
  return failed;
}
await section('§9 ROUND 4 — a page\'s view of a desktop is the record (I); a kept window keeps its group (J); a close is never undone by a keep (K); a reveal waits for its switch (L); the trace is never cut by count (M)', async () => {
  await r4Legs({ install: install0 });
});

/** ROUND 5 (the r4 acceptance of 4ad07d751): O — a copy this page cannot build is a ghost from the moment the record names it (the
 *  acceptance's q1 / q1c / q3 / qR / qR2: the proposer's group taken apart by a keep re-send, a person's merge refused and undone,
 *  an open that revealed nothing); N — alive for the trace means «a window can still show it» (q4 / q4b: a STOPPED conversation's
 *  window closed); P — the page never undoes a person's act (q3's repair; an act made after the refused write left). → failed names. */
async function r5Legs({ over = {}, WSH = null, DM = RealDM, LM = RealLM, install = null, quiet = false, legs = null } = {}) {
  const failed = [];
  const leg = (c, n, extra) => { if (!quiet) ok(c, n, extra); if (!c) failed.push(n); return !!c; };
  const want = (k) => !legs || legs.includes(k);
  const handler = (o = {}) => WSH || loadHandler({ ...over, ...o });
  // the real applyChainRecord's in-place apply (`active` stays this client's) — a membership change still rebuilds
  const inPlace = (P) => Object.assign(P.app.wm, { _ungroupLast(ch) { for (const id of ch.tabs) { const w = P.wins.get(id); if (w) w._tabChain = null; } P.ops.push(['ungroup', ch.tabs.join(',')]); }, applyChainRecord(ch, rc) { ch.tabs.splice(0, ch.tabs.length, ...rc.tabs.map(String)); ch.order = [...(rc.order || rc.tabs)].map(String); ch.layout = rc.layout || 'tabs'; P.ops.push(['apply', ch.tabs.join(',')]); return false; }, setSplitRatio() {} });
  const chainOps = (P, from) => P.ops.slice(from).filter((o) => o[0] === 'ungroup' || o[0] === 'chain');
  // tab-group _mergeDrop's own branch: the target in a group ⇒ addToTabChain (end of the strip, shown; witnessChain stamps every
  // member), else createTabChain — the acceptance's skeptic wrote the same (its "faithful merge")
  const merge = (P, target, guest) => {
    const host = P.wins.get(target), g = P.wins.get(guest), at = Date.now();
    let ch = host._tabChain;
    if (ch) { ch.tabs.push(guest); if (Array.isArray(ch.order)) ch.order.push(guest); ch.active = ch.tabs.length - 1; g._tabChain = ch; } else { ch = { tabs: [target, guest], active: 1, layout: 'tabs' }; host._tabChain = ch; g._tabChain = ch; }
    for (const id of ch.tabs) { const w = P.wins.get(id); if (w) w._chainAt = at; }
    P.act();
  };
  const stamps = (P, H) => { const st = H.layouts().desktops; for (const d of Object.keys(st)) P.dm.noteStamp(d, st[d].autoSave.updatedAt); };
  for (const [k, change] of [['O1', false], ['O2', true]]) {
    if (!want(k)) continue;
    // q1c / q1 (J's own shape): B shows V's group [v-h, win-v-s(S), v-g], saves, drops; A dedups (accepted, traced) and shows V —
    // [v-h, v-g] grouped; O2: A's person reorders the group and a third member joins it first; B comes back: its keep re-send
    // lists the copy in its group again
    const recs = () => ({ ...chainRecs(), 'desk-v': [member(files('v-h', 0), G3, 1), member(chat('win-v-s', S, 1), G3, 1), member(files('v-g', 2), G3, 1), files('v-n', 3)] });
    const H = hub(handler(), DOC(recs()));
    const A = world({ records: recs(), active: 'desk-x', DM, LM, H }), B = world({ records: recs(), active: 'desk-v', DM, LM, H });
    for (const P of [A, B]) inPlace(P);
    B.app.wm.restoreTabChain(G3, 1);
    B.act(); await tick(2600);
    B.lm._userDirty = false; B.lm._lastUserInputAt = 0;
    B.hangUp();
    A.act(); await tick(3000);
    await switchTo(A, 'desk-v'); await tick(1500);
    if (change) { merge(A, 'v-h', 'v-n'); await tick(2500); }
    const want0 = change ? 'v-h,v-g,v-n' : 'v-h,v-g', grp = (id) => (A.wins.get(id)?._tabChain?.tabs || []).join(',');
    const aOps = A.ops.length, aS = A.syncs('desk-v').length, rA = () => refusals(A.sock()).filter((f) => f.desktopId === 'desk-v'), r0 = rA().length, t0 = made.length;
    const stood = grp('v-h') === want0;
    B.reconnect();
    const seen = [];
    for (let i = 0; i < 5; i++) { await tick(1000); seen.push(grp('v-h')); }
    const hubV = J(hubRows(H).filter(([id]) => id !== 'v-n' || change).map(([, c]) => c));
    const riding = change ? J(['v-h,win-v-s,v-g,v-n', 'v-h,win-v-s,v-g,v-n', 'v-h,win-v-s,v-g,v-n', 'v-h,win-v-s,v-g,v-n']) : J(['v-h,win-v-s,v-g', 'v-h,win-v-s,v-g', 'v-h,win-v-s,v-g']);
    leg(stood && seen.every((x) => x === want0) && !chainOps(A, aOps).length && !A.lm.pendingChainOf('v-h') && hubV === riding && toasts(t0).length === 0, `§10 r5 ${k}: A COPY THIS PAGE CANNOT BUILD IS A GHOST — B's keep re-send lists win-v-s in its group again; A (it shows S on X) keeps its own group [${want0}] standing for 5 s, no ungroup / rebuild, nothing pending; the hub holds it with the copy riding${change ? ' (A\'s change kept)' : ''} (4ad07d751: A ungrouped v-h, both loose until its next act) — A v-h ${J(seen)}, A ops ${J(chainOps(A, aOps))}, hub ${hubV}`);
    const kn = acks(A.sock()).filter((f) => f.desktopId === 'desk-v').length;
    A.wins.get('v-g').gridBounds = { left: 0.6, top: 0.1, width: 0.3, height: 0.3 }; A.wins.get('v-g')._boundsAt = Date.now(); A.act(); await tick(2500);
    leg(rA().length === r0 && acks(A.sock()).filter((f) => f.desktopId === 'desk-v').length > kn && grp('v-h') === want0 && A.syncs('desk-v').length > aS, `§10 r5 ${k}: …A's next act lands at once — acked, NO refusal (a copy the hub let go is asked for once: the re-list is B's keep, carried — 4ad07d751: one silent 'shrink-without-close' first) — new refusals ${J(rA().slice(r0).map((f) => f.reason))}`);
  }
  if (want('O3') || want('O3a')) {
    // q3 (the incident shape, nobody else shows S) with tab-group's own merge: A on X shows S; V = [v-h, win-v-s(S), v-g] + v-z; A
    // visits V and the person drags v-z onto v-h at once / 1150 ms later (the skeptic's timings)
    for (const gap of want('O3') ? [0, 1150] : [0]) {
      const recs = () => ({ ...chainRecs(), 'desk-v': [...chainRecs()['desk-v'], files('v-z', 3)] });
      const H = hub(handler(), DOC(recs()));
      const A = world({ records: recs(), active: 'desk-x', DM, LM, H }); inPlace(A);
      const t0 = made.length;
      await switchTo(A, 'desk-v'); if (gap) await tick(gap);
      const formed = (A.wins.get('v-h')?._tabChain?.tabs || []).join(',');
      merge(A, 'v-h', 'v-z'); await tick(4000);
      const rows = J(hubRows(H).map(([, c]) => c));
      leg(formed === 'v-h,v-g' && refusals(A.sock()).length === 0 && toasts(t0).length === 0 && rows === J(['v-h,v-g,v-z', 'v-h,v-g,v-z', 'v-h,v-g,v-z']) && (A.wins.get('v-z')?._tabChain?.tabs || []).join(',') === 'v-h,v-g,v-z', `§10 r5 O3 (merge at ${gap} ms): …the group stands the moment the page arrives (v-h + v-g, the copy a ghost) and the person's merge onto it LANDS — 0 refusals, 0 toasts, the hub's V = the merge (A's dedup of the copy accepted with it: nobody else shows S) (4ad07d751: 'chain-disagrees', then the repair undid the merge and said so) — formed ${formed}, refusals ${J(refusals(A.sock()).map((f) => f.reason))}, hub ${rows}, toasts ${J(toasts(t0).map(toastText))}`);
    }
  }
  if (want('O4')) {
    // q3 with B showing S on V (connected — its attach): A's dedup is refused (r2), the copy KEPT — the person's merge must ride it
    const recs = () => ({ ...chainRecs(), 'desk-v': [...chainRecs()['desk-v'], files('v-z', 3)] });
    const H = hub(handler(), DOC(recs()));
    const B = world({ records: recs(), active: 'desk-y', DM, LM, H }); inPlace(B);
    await switchTo(B, 'desk-v'); await tick(1500); B.lm._userDirty = false; B.lm._lastUserInputAt = 0;
    const A = world({ records: recs(), active: 'desk-x', DM, LM, H }); inPlace(A); stamps(A, H);
    const t0 = made.length;
    await switchTo(A, 'desk-v'); await tick(2500);
    merge(A, 'v-h', 'v-z'); await tick(4000);
    const rows = J(hubRows(H).map(([id, c]) => id + ':' + c)), r = refusals(A.sock()).map((f) => f.reason + ':' + J(f.unexplained || f.windows || []));
    leg(J(r) === J(['shrink-without-close:["win-v-s"]']) && rows === J(['v-h:v-h,win-v-s,v-g,v-z', 'win-v-s:v-h,win-v-s,v-g,v-z', 'v-g:v-h,win-v-s,v-g,v-z', 'v-z:v-h,win-v-s,v-g,v-z']) && (B.wins.get('win-v-s')?._tabChain?.tabs || []).join(',') === 'v-h,win-v-s,v-g,v-z' && !B.closed.length && toasts(t0).length === 0, `§10 r5 O4: …and with the copy KEPT (B shows S — the dedup's one refusal is the hub's r2 verdict, silent) the merge lands WITH THE GHOST RIDING it: every row of the hub's group names win-v-s, B keeps its window inside the merged group — refusals ${J(r)}, hub ${rows}, B ${(B.wins.get('win-v-s')?._tabChain?.tabs || []).join(',')}, toasts ${toasts(t0).length}`);
  }
  if (install && want('O5')) {
    // qR2 (the incident shape): V's group [v-h, win-v-s(S copy), v-t(T)]; the page shows S on X, arrives on V; the person opens T
    const G = ['v-h', 'win-v-s', 'v-t'];
    const recs = () => ({ 'desk-x': [chat('win-x-s', S, 0), files('x-1', 1)], 'desk-y': [files('y-1', 0)], 'desk-v': [member(files('v-h', 0), G), member(chat('win-v-s', S, 1), G), member(chat('v-t', T, 2), G)] });
    const P = pageOn(hub(handler(), DOC(recs())), install, 'desk-x', { DM, LM });
    await P.dm.switchTo('desk-v'); await tick(1500);
    const t0 = made.length;
    press('pointerdown'); P.app.attachSession(T, 'Atlas notes', '/srv/u/atlas', { mode: 'chat', backend: 'claude', backendSessionId: 'b' + CID.slice(1) });
    await tick(300);
    const rv = P.ops.filter((o) => o[0] === 'reveal'), c = P.wins.get('v-t')?._tabChain;
    leg(J(rv) === J([['reveal', 'v-t', false]]) && P.app.wm.activeWindowId === 'v-t' && c && c.tabs[c.active] === 'v-t' && toasts(t0).length === 0, `§10 r5 O5: AN OPEN OF A WINDOW THAT STANDS REVEALS IT NOW — the group beside a copy stands at once ([v-h, v-t], the copy a ghost) and the person's open of T reveals v-t within 300 ms, its own tab in front (4ad07d751: 7 s later reveals [], active window null) — reveals ${J(rv)}, active ${P.app.wm.activeWindowId}, chain ${J(c && { tabs: c.tabs, active: c.active })}`);
  }
  if (install && want('O6')) {
    // qR (its member at 4.5 s here — the acceptance's 8 s reads the same): a member of the group opens late; the conversation's window
    // stands — the open focuses it now, and the group forms around it when the member stands, its tab in front
    const HG = ['v-h', 'win-v-s', 'v-slow'];
    const recs = () => ({ 'desk-x': [files('x-1', 1)], 'desk-y': [files('y-1', 0)], 'desk-v': [member(files('v-h', 0), HG), member(chat('win-v-s', S, 1), HG), member(files('v-slow', 2), HG)] });
    const P = pageOn(hub(handler(), DOC(recs())), install, 'desk-x', { DM, LM });
    const orig = P.app.replayOpenSpec;
    P.app.replayOpenSpec = (spec, winId) => { if (winId !== 'v-slow') return orig(spec, winId); setTimeout(() => { const w = P.mkWin('v-slow', 'desk-v', { type: 'viewer', _openSpec: spec }); P.lm.onWindowCreated(w); }, 4500); return null; };
    await P.dm.switchTo('desk-v'); await tick(1500);
    press('pointerdown'); P.app.attachSession(S, 'Atlas notes', '/srv/u/atlas', { mode: 'chat', backend: 'claude', backendSessionId: CID });
    await tick(300);
    const now = J(P.ops.filter((o) => o[0] === 'reveal')), win0 = P.app.wm.activeWindowId;
    await tick(3500);
    const c = P.wins.get('win-v-s')?._tabChain;
    leg(now === J([['reveal', 'win-v-s', false]]) && win0 === 'win-v-s' && c && J(c.tabs) === J(HG) && c.tabs[c.active] === 'win-v-s' && P.app.wm.activeWindowId === 'win-v-s', `§10 r5 O6: …a reveal never waits for a group — its member opening only at 4.5 s: the open focuses win-v-s within 300 ms, and the group forms around it then with its tab in front (4ad07d751: reveals [] — qR) — reveals at 300 ms ${now}, group at 5.3 s ${J(c && { tabs: c.tabs, active: c.active })}, active ${P.app.wm.activeWindowId}`);
  }
  for (const k of ['N1', 'N2', 'N3']) {
    if (!want(k)) continue;
    // q4 (N1) / q4b (N2): B shows win-v-s(S) on V; S STOPS (its CLI exited — not killed: it leaves the live-session set, B keeps its
    // window as read-only history). N1: B's socket drops, A's dedup is traced, S stops, C makes an unrelated move on V, B comes back;
    // N2: S stops first, B stays connected, A dedups. N3: N1 with S KILLED (the real kill case) instead of stopped
    const TWO = () => ({ 'desk-x': [chat('win-x-s', S, 0), files('x-1', 1), files('x-2', 2)], 'desk-y': [files('y-1', 0)], 'desk-v': [files('v-1', 0), chat('win-v-s', S, 2)] });
    const H = hub(handler(), DOC(TWO()));
    const A = world({ records: TWO(), active: 'desk-x', DM, LM, H }), B = world({ records: TWO(), active: 'desk-v', DM, LM, H });
    const t0 = made.length;
    B.act(); await tick(1800);
    if (k === 'N2') H.stop(S); else B.hangUp();
    A.act(); await tick(2500);
    const traced = traceOf(H).some((e) => e.id === 'win-v-s' && e.sid === S);
    if (k === 'N2') {
      await tick(1500);
      leg(traced && !B.closed.length && B.wins.has('win-v-s') && toasts(t0).length === 0, `§10 r5 N2: ALIVE FOR THE TRACE MEANS «A WINDOW CAN STILL SHOW IT» — S STOPPED first (B, connected, keeps its window as read-only history), then A's dedup is accepted: it is TRACED with its conversation and B closes nothing (4ad07d751: trace [], B closed win-v-s live) — traced ${traced}, B closed ${J(B.closed)}`);
      continue;
    }
    let killed = null;
    if (k === 'N3') killed = await H.kill(S); else H.stop(S);
    const now = () => Object.fromEntries(Object.entries(H.layouts().desktops).map(([d, v]) => [d, JSON.parse(J(v.autoSave.windows))]));
    const C = world({ records: now(), active: 'desk-v', DM, LM, H });
    { const st = H.layouts().desktops; for (const d of Object.keys(st)) C.dm.noteStamp(d, st[d].autoSave.updatedAt); }
    await tick(300);
    const w1 = C.wins.get('v-1'); w1.gridBounds = { left: 0.5, top: 0.5, width: 0.2, height: 0.2 }; w1._movedAt = Date.now();
    C.act(); await tick(3000);
    const afterC = traceOf(H).some((e) => e.id === 'win-v-s');
    B.reconnect(); await tick(3000);
    const hubV = ids(H.layouts().desktops['desk-v'].autoSave.windows);
    if (k === 'N1') leg(traced && afterC && !B.closed.length && B.wins.has('win-v-s') && hubV.includes('win-v-s') && toasts(t0).length === 0, `§10 r5 N1: ALIVE FOR THE TRACE MEANS «A WINDOW CAN STILL SHOW IT» — A's dedup traced while B was away, S STOPPED, C wrote V: the trace still names the copy, and B's return closes nothing and lists it again (4ad07d751: trace [] after C's write, B closed win-v-s) — trace after C ${afterC}, B closed ${J(B.closed)}, hub V ${J(hubV)}`);
    else leg(traced && killed && killed.ok && !afterC && B.closed.includes('win-v-s') && !hubV.includes('win-v-s') && ids(H.layouts().desktops['desk-x'].autoSave.windows).includes('win-x-s'), `§10 r5 N3: …only the conversation's END (the real kill — the hub's end seam) takes it out of the trace, at once: B's return closes the copy, its other window stays on X — killed ${J(killed && killed.ok)}, trace after C ${afterC}, B closed ${J(B.closed)}, hub V ${J(hubV)}`);
  }
  if (want('P1')) {
    // THE PAGE NEVER UNDOES A PERSON'S ACT, the belt: an injected disagreement (p2b's hand-made state — v-h and v-z on a new group
    // object, v-g left on the old one); right after that write leaves, the person drags v-q onto v-z (a real merge, `_chainAt` after
    // the write) — the refusal's repair takes the hub's groups for what the person did not touch since, and keeps the act
    const recs = () => ({ ...chainRecs(), 'desk-v': [...chainRecs()['desk-v'], files('v-z', 3), files('v-q', 4)] });
    const H = hub(handler(), DOC(recs()));
    const A = world({ records: recs(), active: 'desk-x', DM, LM, H }); stubChains(A);
    await switchTo(A, 'desk-v'); await tick(2500);
    const t0 = made.length, rA = () => refusals(A.sock()).filter((f) => f.desktopId === 'desk-v'), kA = () => acks(A.sock()).filter((f) => f.desktopId === 'desk-v'), r0 = rA().length;
    const bad = { tabs: ['v-h', 'v-z'], active: 0, layout: 'tabs', order: ['v-h', 'v-z'] };
    for (const id of bad.tabs) { const w = A.wins.get(id); w._tabChain = bad; w._chainAt = Date.now(); }
    const send = A.app.ws.send; let armed = true;
    A.app.ws.send = (m) => { send(m); if (armed && m && m.type === 'layout-sync' && m.desktopId === 'desk-v') { armed = false; setTimeout(() => {}, 0); merge(A, 'v-z', 'v-q'); } };
    A.act(); await tick(3500);
    A.app.ws.send = send;
    const told = toasts(t0).map(toastText), vh = (A.wins.get('v-h')?._tabChain?.tabs || []).join(','), a1 = kA().length;
    A.wins.get('v-q').gridBounds = { left: 0.1, top: 0.6, width: 0.2, height: 0.2 }; A.wins.get('v-q')._boundsAt = Date.now(); A.act(); await tick(2500);
    const hv = (H.layouts().desktops['desk-v'].autoSave.windows.find((w) => w.winId === 'v-q') || {}).tabChain;
    leg(rA().slice(r0).some((f) => f.reason === 'chain-disagrees') && vh === 'v-h,v-z,v-q' && !A.wins.get('v-g')._tabChain && told.length === 1 && kA().length > a1 && hv && hv.tabs.includes('v-q') && hv.tabs.includes('v-z') && hv.tabs.includes('v-h'), `§10 r5 P1: AN ACT MADE AFTER THE REFUSED WRITE LEFT SURVIVES THE REPAIR — the injected write is refused 'chain-disagrees' and repaired ONCE (v-g off the stale group), while the person's merge of v-q made since stands on the page and lands on the hub at the next write (4ad07d751's repair: every touched group taken — v-h + v-g again, v-z and v-q loose) — v-h ${vh}, v-g ${(A.wins.get('v-g')?._tabChain?.tabs || []).join(',') || 'alone'}, toasts ${J(told)}, hub v-q ${J(hv && hv.tabs)}`);
  }
  if (want('P2')) {
    // …and a 'chain-disagrees' that crossed the person's act (an older hub's verdict; the page's groups hold together — each member
    // holds its group): never the hub's groups — the act stays, nothing is said, the write goes again and is acked
    const recs = () => ({ ...chainRecs(), 'desk-v': [...chainRecs()['desk-v'], files('v-z', 3)] });
    const H = hub(handler(), DOC(recs()));
    const A = world({ records: recs(), active: 'desk-x', DM, LM, H }); stubChains(A);
    await switchTo(A, 'desk-v'); await tick(2500);
    const t0 = made.length, kA = () => acks(A.sock()).filter((f) => f.desktopId === 'desk-v'), a0 = kA().length;
    merge(A, 'v-h', 'v-z');
    const rec = JSON.parse(J(H.layouts().desktops['desk-v'].autoSave));
    A.dm.onSyncRefused({ type: 'layout-sync-refused', desktopId: 'desk-v', reason: 'chain-disagrees', windows: ['v-g'], state: rec, sentAt: Date.now() - 1 });
    await tick(3000);
    const g = (A.wins.get('v-h')?._tabChain?.tabs || []).join(','), hv = (H.layouts().desktops['desk-v'].autoSave.windows.find((w) => w.winId === 'v-z') || {}).tabChain;
    leg(g === 'v-h,v-g,v-z' && toasts(t0).length === 0 && kA().length > a0 && hv && J(hv.tabs) === J(['v-h', 'v-g', 'v-z']), `§10 r5 P2: …a 'chain-disagrees' refusal of a write whose groups the page shows hold together (an older hub's, one crossing the act) never takes the hub's groups — the merge stays, nothing said, the write goes again and lands (4ad07d751: the merge undone, the warn said) — A ${g}, toasts ${J(toasts(t0).map(toastText))}, hub v-z ${J(hv && hv.tabs)}`);
  }
  return failed;
}
await section('§10 ROUND 5 — a copy this page cannot build is a ghost from the moment the record names it (O); alive for the trace means a window can still show it (N); the page never undoes a person\'s act (P)', async () => {
  await r5Legs({ install: install0 });
});

/** ROUND 6 (the r5 acceptance of a3fb7b40e): Q — the person's «this tab in front» belongs to the desktop, never to a pending entry (a
 *  relay of the desktop on show while a member was still opening — a theme change, a box move — re-queued the group without the mark:
 *  the conversation just opened formed as a hidden tab, the host in front, nothing said); R — a reveal is never given up in silence
 *  (the open's failure is said with its error word; a build with no sign of life within its grace is said once; `_revealAsk` clear).
 *  → failed names. */
async function r6Legs({ DM = RealDM, LM = RealLM, install = null, quiet = false, legs = null } = {}) {
  const failed = [];
  const leg = (c, n, extra) => { if (!quiet) ok(c, n, extra); if (!c) failed.push(n); return !!c; };
  const want = (k) => !legs || legs.includes(k);
  if (!install) return failed;
  // O6's shape: V = the group [v-h, win-v-s(S), v-slow]; v-slow opens `slowAt` ms after its replay (the slow member); `build(spec)`
  // replaces the replay of win-v-s (R: an opener that fails, or never answers)
  const HG = ['v-h', 'win-v-s', 'v-slow'];
  const recs = () => ({ 'desk-x': [files('x-1', 1)], 'desk-y': [files('y-1', 0)], 'desk-v': [member(files('v-h', 0), HG), member(chat('win-v-s', S, 1), HG), member(files('v-slow', 2), HG)] });
  const page = (H, active, { slowAt = 4500, build = null } = {}) => {
    const P = pageOn(H, install, active, { DM, LM });
    const orig = P.app.replayOpenSpec;
    P.app.replayOpenSpec = (spec, winId) => {
      if (winId === 'win-v-s' && build) return build(spec);
      if (winId !== 'v-slow') return orig(spec, winId);
      setTimeout(() => { const w = P.mkWin('v-slow', 'desk-v', { type: 'viewer', _openSpec: spec }); P.lm.onWindowCreated(w); }, slowAt); return null;
    };
    return P;
  };
  const open = (P) => { press('pointerdown'); P.app.attachSession(S, 'Atlas notes', '/srv/u/atlas', { mode: 'chat', backend: 'claude', backendSessionId: CID }); press('pointerup'); }; // a click (its release: no page's save waits on a held pointer)
  const front = (P) => { const c = P.wins.get('win-v-s')?._tabChain; return J(c ? { tabs: c.tabs.join(','), front: c.tabs[c.active], focus: P.app.wm.activeWindowId } : { focus: P.app.wm.activeWindowId }); };
  const IN_FRONT = J({ tabs: HG.join(','), front: 'win-v-s', focus: 'win-v-s' });
  // another page's write of V carrying only a change of its own (the theme) — the hub acks and relays it to A
  const relay = async (H) => { const R = H.connect(); const rec = JSON.parse(J(H.layouts().desktops['desk-v'].autoSave)); await R.send({ type: 'layout-sync', desktopId: 'desk-v', state: { ...rec, theme: 'light' }, sentAt: Date.now(), viewport: 'desktop' }); await tick(30); return R.frames.map((f) => f.type).filter((t) => /layout-sync/.test(t)); };
  const waiting = (P) => (P.lm._pendingChains || []).some((e) => e.tc.tabs.includes('win-v-s')); // the group still forming (the relay landed before the member)
  if (want('Q1')) {
    // A on V opens S (its window stands; v-slow opens at 4.5 s); the person types in S's window at +0.5 s (an act INSIDE it keeps the
    // mark); another page writes V (a theme change) at +1 s — before the member stands
    const H = hub(loadHandler(), DOC(recs())), P = page(H, 'desk-x');
    await P.dm.switchTo('desk-v'); await tick(1500);
    const t0 = made.length;
    open(P); await tick(500);
    press('keydown', P.wins.get('win-v-s').element.content || P.wins.get('win-v-s').element); await tick(500);
    const rf = await relay(H), mid = waiting(P);
    await tick(4000);
    leg(front(P) === IN_FRONT && J(rf) === J(['layout-sync-ack']) && mid && toasts(t0).length === 0, `§11 r6 Q1: THE PERSON'S FRONT TAB BELONGS TO THE DESKTOP — A opens S while a member of its group is still opening, types in it, and another page writes V (a theme change) before the member stands: the group forms with S's tab in front and focused (a3fb7b40e: the relay re-queued the group without the mark — v-h in front, S a hidden tab, nothing said) — A ${front(P)}, the writer got ${J(rf)}`);
  }
  if (want('Q2')) {
    // …B, a real page on V, MOVES a window of V 1 s after A's open (B's write relayed to A before the member stands); B unchanged
    const H = hub(loadHandler(), DOC(recs())), P = page(H, 'desk-x', { slowAt: 6500 });
    const B = world({ records: recs(), active: 'desk-y', DM, LM, H });
    await switchTo(B, 'desk-v'); await P.dm.switchTo('desk-v'); await tick(1500);
    const bGroup = () => { const w = B.wins.get('win-v-s'); return w && w._tabChain ? w._tabChain.tabs.join(',') + '@' + w._tabChain.active : null; };
    const b0 = bGroup(), bc = B.closed.length, t0 = made.length;
    open(P); await tick(300);
    const w = B.wins.get('v-h'); w.gridBounds = { left: 0.5, top: 0.5, width: 0.2, height: 0.2 }; w._movedAt = Date.now(); B.act();
    await tick(3700);
    const mid = waiting(P) && P.wins.get('v-h').gridBounds?.left === 0.5; // B's move applied on A while the group still waits (at +4 s; the member at +5 s)
    await tick(2000);
    const hv = (H.layouts().desktops['desk-v'].autoSave.windows.find((x) => x.winId === 'v-h') || {}).gridBounds;
    leg(front(P) === IN_FRONT && mid && bGroup() === b0 && B.closed.length === bc && hv && hv.left === 0.5 && toasts(t0).length === 0, `§11 r6 Q2: …the same when another page MOVES a window of V meanwhile (B's box move lands on the hub and is relayed to A before the member stands): S's tab in front and focused on A, B's group as it was (a3fb7b40e: v-h in front on A) — A ${front(P)}, relayed while waiting ${mid}, B ${bGroup()} (was ${b0}), hub v-h ${J(hv)}`);
  }
  if (want('Q3')) {
    // the DEFERRED reveal: A on X opens S — the switch to V builds it (_revealWhenBuilt) — and another page writes V at +1.8 s
    const H = hub(loadHandler(), DOC(recs())), P = page(H, 'desk-x');
    const t0 = made.length;
    open(P); await tick(1800);
    const rf = await relay(H), mid = waiting(P);
    await tick(3700);
    leg(P.dm.activeDesktopId === 'desk-v' && front(P) === IN_FRONT && J(rf) === J(['layout-sync-ack']) && mid && toasts(t0).length === 0, `§11 r6 Q3: …and through the DEFERRED reveal after a switch (A on X opens S, its desktop's switch builds it, a relay of V at +1.8 s): S's tab in front and focused once the group forms (a3fb7b40e: v-h) — active ${P.dm.activeDesktopId}, A ${front(P)}`);
  }
  if (want('Q4')) {
    // a DOUBLE-CLICK (the r4 L shape: A on X, two opens 200 ms apart) and a relay of V at +1.8 s
    const H = hub(loadHandler(), DOC(recs())), P = page(H, 'desk-x');
    const t0 = made.length;
    open(P); await tick(200); open(P); await tick(1600);
    const rf = await relay(H), mid = waiting(P);
    await tick(3700);
    const rv = P.ops.filter((o) => o[0] === 'reveal');
    leg(front(P) === IN_FRONT && rv.length >= 1 && rv.every((o) => o[1] === 'win-v-s') && J(rf) === J(['layout-sync-ack']) && mid && toasts(t0).length === 0, `§11 r6 Q4: …and through a DOUBLE-CLICK (the CHANGELOG's «lands on its own tab»): two opens 200 ms apart, a relay of V at +1.8 s — S's tab in front and focused when the group forms (a3fb7b40e: v-h) — A ${front(P)}, reveals ${J(rv)}`);
  }
  if (want('Q5')) {
    // …until the person's own next act ELSEWHERE: A opens S, then presses in v-h's window (the host) before the member stands — the
    // mark is dropped, the group forms as its record has it
    const H = hub(loadHandler(), DOC(recs())), P = page(H, 'desk-x');
    await P.dm.switchTo('desk-v'); await tick(1500);
    open(P); await tick(800);
    press('pointerdown', P.wins.get('v-h').element);
    await tick(4200);
    const c = P.wins.get('win-v-s')?._tabChain;
    leg(!!c && c.tabs[c.active] === 'v-h' && !(P.lm._fronts && P.lm._fronts.size), `§11 r6 Q5: …the mark lasts until the person's own next act elsewhere — a press in another window of V (v-h) before the member stands drops it: the group forms as its record has it (v-h in front) — group ${J(c && { tabs: c.tabs, active: c.active })}`);
  }
  if (want('R2')) {
    // A on X opens S; the switch to V replays its window and the opener FAILS at +1 s (its error word)
    const H = hub(loadHandler(), DOC(recs()));
    const P = page(H, 'desk-x', { slowAt: 0, build: () => { const p = new Promise((_, no) => setTimeout(() => no(new Error('the conversation could not be attached')), 1000)); p.catch(() => {}); return p; } });
    const t0 = made.length;
    open(P); await tick(1500);
    const ask = P.dm._revealAsk, said = toasts(t0).map(toastText);
    await tick(800);
    leg(said.length === 1 && /Atlas notes/.test(said[0]) && /could not be attached/.test(said[0]) && ask === null && toasts(t0).length === 1 && !P.ops.some((o) => o[0] === 'reveal'), `§11 r6 R2: A REVEAL IS NEVER GIVEN UP IN SILENCE — the open's own failure (its opener answers an error at +1 s) reaches the person as that failure, ONCE, naming the conversation, and _revealAsk is clear (a3fb7b40e: nothing said, _revealAsk left set) — toasts ${J(said)}, ask ${J(ask)}`);
  }
  if (want('R3')) {
    // …and a build with no sign of life (its opener answered nothing and the window never comes): said once when the page's own grace
    // for that build runs out (BUILD_GRACE_MS — moved here by shifting the attempt's start back), _revealAsk clear
    const H = hub(loadHandler(), DOC(recs()));
    const P = page(H, 'desk-x', { slowAt: 0, build: () => null });
    const t0 = made.length;
    open(P); await tick(1500);
    const before = toasts(t0).length, a = P.dm._buildAttempts.get('win-v-s');
    if (a) a.at -= 20000;
    await tick(400);
    const said = toasts(t0).map(toastText), ask = P.dm._revealAsk;
    await tick(800);
    leg(before === 0 && !!a && said.length === 1 && /Atlas notes/.test(said[0]) && /did not appear/.test(said[0]) && ask === null && toasts(t0).length === 1, `§11 r6 R3: …a build with no sign of life is said ONCE when its grace runs out — «Could not open “Atlas notes”: its window did not appear» — and _revealAsk is clear; nothing said while it was still within its grace (a3fb7b40e: silent) — before ${before}, toasts ${J(said)}, ask ${J(ask)}`);
  }
  return failed;
}
await section('§11 ROUND 6 — the person\'s front tab belongs to the desktop (Q); a reveal is never given up in silence (R)', async () => {
  await r6Legs({ install: install0 });
});

/** ROUND 7 (the r6 acceptance of d5f74914f): Q′ — only the PERSON's act drops the front mark: the switch a reveal performs (keepInFront,
 *  then the caller's revealWindow — at once or held behind the 1 s gate) is the act that SET it (d5f74914f: switchTo took it for the
 *  person's act, dropFront(null) — the group forming on V came together with v-h in front, S hidden, nothing said); S — an open
 *  resolves to the window this page has first (the one shown, then the one still attaching), only then to a held window elsewhere, and
 *  never to a copy (d5f74914f: with S's window still attaching here the open went to another desktop's copy, where nothing is built,
 *  and said «its window did not appear»); the minor — an opener still out past the grace is said once. → failed names. */
async function r7Legs({ DM = RealDM, LM = RealLM, install = null, quiet = false, legs = null } = {}) {
  const failed = [];
  const leg = (c, n, extra) => { if (!quiet) ok(c, n, extra); if (!c) failed.push(n); return !!c; };
  const want = (k) => !legs || legs.includes(k);
  if (!install) return failed;
  const HG = ['v-h', 'win-v-s', 'v-slow'];
  const recs = () => ({ 'desk-x': [files('x-1', 1)], 'desk-y': [files('y-1', 0)], 'desk-v': [member(files('v-h', 0), HG), member(chat('win-v-s', S, 1), HG), member(files('v-slow', 2), HG)] });
  const page = (H, active, { slowAt = 6000, build = null, attachMs = 500 } = {}) => {
    const P = pageOn(H, install, active, { DM, LM, attachMs });
    const orig = P.app.replayOpenSpec;
    P.app.replayOpenSpec = (spec, winId) => {
      if (winId === 'win-v-s' && build) return build(spec);
      if (winId !== 'v-slow') return orig(spec, winId);
      setTimeout(() => { const w = P.mkWin('v-slow', 'desk-v', { type: 'viewer', _openSpec: spec }); P.lm.onWindowCreated(w); }, slowAt); return null;
    };
    return P;
  };
  const open = (P) => { press('pointerdown'); P.app.attachSession(S, 'Atlas notes', '/srv/u/atlas', { mode: 'chat', backend: 'claude', backendSessionId: CID }); press('pointerup'); };
  const front = (P) => { const c = P.wins.get('win-v-s')?._tabChain; return J(c ? { tabs: c.tabs.join(','), front: c.tabs[c.active], focus: P.app.wm.activeWindowId } : { focus: P.app.wm.activeWindowId }); };
  const IN_FRONT = J({ tabs: HG.join(','), front: 'win-v-s', focus: 'win-v-s' });
  const waiting = (P) => (P.lm._pendingChains || []).some((e) => e.tc.tabs.includes('win-v-s'));
  const marked = (P) => !!(P.lm._fronts && P.lm._fronts.get('desk-v') === 'win-v-s');
  const sWins = (P) => [...P.wins.values()].filter((w) => w._openSpec && w._openSpec.serverId === S).map((w) => w.id + '@' + w._desktopId + (w._attached ? '' : '(attaching)'));
  const reveals = (P) => P.ops.filter((o) => o[0] === 'reveal');
  // the person's own switch: a press on the desktop strip, then the switch
  const personSwitch = (P, d) => { press('pointerdown'); const p = P.dm.switchTo(d); press('pointerup'); return p; };
  if (want('Q6')) {
    // V's group waits on a slow member (v-slow stands 6 s after the first visit's replay); the page visited V (it built S's window
    // there) and went back to X; at +2.7 s the person clicks S — its window stands on V: the page switches there and shows it
    const H = hub(loadHandler(), DOC(recs())), P = page(H, 'desk-x');
    await P.dm.switchTo('desk-v'); await tick(1200);
    await personSwitch(P, 'desk-x'); await tick(1500);
    const t0 = made.length;
    open(P); await tick(300);
    const mid = P.dm.activeDesktopId === 'desk-v' && marked(P) && waiting(P);
    await tick(4500);
    leg(front(P) === IN_FRONT && mid && P.dm.activeDesktopId === 'desk-v' && toasts(t0).length === 0, `§12 r7 Q6: ONLY THE PERSON'S ACT DROPS THE MARK — the person on X opens S, whose window stands on V where its group still waits for a member: the page switches to V for the reveal, and THAT switch keeps the mark — the group forms with S's tab in front and focused, nothing said (d5f74914f: the reveal's own switch dropped every mark — v-h in front, S a hidden tab) — after the switch: active ${P.dm.activeDesktopId}, marked+waiting ${mid}; at the end ${front(P)}`);
  }
  if (want('Q7')) {
    // …and when that switch is HELD behind the 1 s gate (r4 L: the person's own switch to X 0.3 s before still holds it) — queued, then
    // drained: still the reveal's own (the generation of the open)
    const H = hub(loadHandler(), DOC(recs())), P = page(H, 'desk-x');
    await P.dm.switchTo('desk-v'); await tick(1200);
    personSwitch(P, 'desk-x'); await tick(300);
    const t0 = made.length;
    open(P);
    const queued = P.dm._pendingSwitch === 'desk-v' && P.dm.activeDesktopId === 'desk-x' && marked(P);
    await tick(1000);
    const mid = P.dm.activeDesktopId === 'desk-v' && marked(P) && waiting(P);
    await tick(4800);
    leg(front(P) === IN_FRONT && queued && mid && toasts(t0).length === 0, `§12 r7 Q7: …the reveal's switch held behind the 1 s gate (queued, drained 0.7 s later) is the reveal's own too — the mark is kept through both, the group forms with S's tab in front and focused (d5f74914f: dropped at the queued call) — queued+marked ${queued}, after the drain marked+waiting ${mid}; at the end ${front(P)}`);
  }
  // S: X lists S (its window built by the reload — layout.js restoreState's machine attach — STILL ATTACHING: answered at +3 s), V a copy
  const recsS = () => ({ 'desk-x': [files('x-1', 0), chat('win-x-s', S, 1)], 'desk-y': [files('y-1', 0)], 'desk-v': [files('v-1', 0), chat('win-v-s', S, 1)] });
  const reload = (H, { attachMs = 3000 } = {}) => {
    const P = page(H, 'desk-x', { attachMs });
    P.wins.delete('win-x-s'); // the boot builds it through attachSession (a machine open): attaching until its answer
    P.app.attachSession(S, 'Atlas notes', '/srv/u/atlas', { mode: 'chat', backend: 'claude', backendSessionId: CID, syncId: 'win-x-s', machine: true });
    return P;
  };
  if (want('S1')) {
    const H = hub(loadHandler(), DOC(recsS())), P = reload(H);
    await tick(300);
    const t0 = made.length, attaching = !P.wins.get('win-x-s')._attached;
    open(P); await tick(1500);
    const at = [P.dm.activeDesktopId], ask = P.dm._revealAsk;
    await tick(2000);
    at.push(P.dm.activeDesktopId);
    leg(attaching && J(at) === J(['desk-x', 'desk-x']) && J(reveals(P)) === J([['reveal', 'win-x-s', false]]) && P.app.wm.activeWindowId === 'win-x-s' && J(sWins(P)) === J(['win-x-s@desk-x']) && ask === null && toasts(t0).length === 0, `§12 r7 S1: AN OPEN RESOLVES TO THE WINDOW THIS PAGE HAS FIRST — S's window on X still attaching (answered at +3 s) and a copy listed on V: the person's open raises S's window on X, no switch, nothing said; it attaches there (d5f74914f: taken to V, where nothing is built, and told «Could not open “Atlas notes”: its window did not appear») — active ${J(at)}, reveals ${J(reveals(P))}, S windows ${J(sWins(P))}, toasts ${J(toasts(t0).map(toastText))}`);
  }
  if (want('S2')) {
    // X lists no S; Y and V both do (the triple's copies): a DOUBLE-CLICK from X — the first open goes to Y and builds its window there
    // (attaching, answered at +3 s); the second, 200 ms later, finds it still attaching
    const H = hub(loadHandler(), DOC({ 'desk-x': [files('x-1', 0)], 'desk-y': [files('y-1', 0), chat('win-y-s', S, 1)], 'desk-v': [files('v-1', 0), chat('win-v-s', S, 1)] }));
    const P = page(H, 'desk-x', { attachMs: 3000 });
    const t0 = made.length;
    open(P); await tick(200);
    const attaching = !!P.wins.get('win-y-s') && !P.wins.get('win-y-s')._attached;
    open(P); await tick(1500);
    const at = [P.dm.activeDesktopId];
    await tick(2000);
    at.push(P.dm.activeDesktopId);
    const rv = reveals(P);
    leg(attaching && J(at) === J(['desk-y', 'desk-y']) && rv.length >= 1 && rv.every((o) => o[1] === 'win-y-s') && P.app.wm.activeWindowId === 'win-y-s' && J(sWins(P)) === J(['win-y-s@desk-y']) && P.dm._revealAsk === null && toasts(t0).length === 0, `§12 r7 S2: …a DOUBLE-CLICK on a conversation listed on two other desktops: the second open finds the window the first is still attaching on Y and raises it — no switch to V's copy, nothing said (d5f74914f: the second open went to V and said its window did not appear) — active ${J(at)}, reveals ${J(rv)}, S windows ${J(sWins(P))}, toasts ${J(toasts(t0).map(toastText))}`);
  }
  if (want('S3')) {
    // the HELD case (r2 C stays): no window of S on this page, V lists it — the open goes to V, builds it, reveals it
    const H = hub(loadHandler(), DOC({ 'desk-x': [files('x-1', 0)], 'desk-y': [files('y-1', 0)], 'desk-v': [files('v-1', 0), chat('win-v-s', S, 1)] }));
    const P = page(H, 'desk-x');
    const t0 = made.length;
    open(P); await tick(1500);
    leg(P.dm.activeDesktopId === 'desk-v' && J(reveals(P)) === J([['reveal', 'win-v-s', false]]) && P.app.wm.activeWindowId === 'win-v-s' && J(sWins(P)) === J(['win-v-s@desk-v']) && toasts(t0).length === 0, `§12 r7 S3: …and with NO window of S on this page the held entry is still the open's answer — the switch to V builds it and reveals it, silently (r2 C) — active ${P.dm.activeDesktopId}, reveals ${J(reveals(P))}, S windows ${J(sWins(P))}`);
  }
  if (want('S4')) {
    // A COPY IS NEVER A REVEAL TARGET — S's window on X still loading from a slow host past B-0cc8's 15 s in-flight window (a remote
    // attach: 15–120 s), so the attach check no longer answers; V's entry of S is a copy of it
    const H = hub(loadHandler(), DOC(recsS())), P = reload(H, { attachMs: 60000 });
    P.app.ws._attachInFlight.set(S, Date.now() - 16000); // sent 16 s ago
    const t0 = made.length;
    open(P); await tick(1500);
    leg(P.dm.activeDesktopId === 'desk-x' && P.dm._pendingSwitch == null && P.dm._revealAsk === null && !reveals(P).some((o) => o[1] === 'win-v-s') && toasts(t0).length === 0, `§12 r7 S4: …A COPY IS NEVER A REVEAL TARGET — S's window on X still loading past B-0cc8's 15 s (a slow host): the open never goes to V's copy and says nothing (d5f74914f: taken to V, «…its window did not appear»; past the 15 s the open attaches on X as master does) — active ${P.dm.activeDesktopId}, reveals ${J(reveals(P))}, S windows ${J(sWins(P))}, toasts ${J(toasts(t0).map(toastText))}`);
  }
  if (want('R4')) {
    // the minor: an opener that NEVER settles (its promise out for ever) — a sign of life only within the page's grace for that build
    const H = hub(loadHandler(), DOC(recs()));
    const P = page(H, 'desk-x', { slowAt: 0, build: () => new Promise(() => {}) });
    const t0 = made.length;
    open(P); await tick(1500);
    const before = toasts(t0).length, o = P.dm._openers?.get('win-v-s');
    if (o) o.at -= 20000; // its start moved back past BUILD_GRACE_MS
    await tick(400);
    const said = toasts(t0).map(toastText), ask = P.dm._revealAsk;
    let polls = 0; const own = P.dm._revealWhenBuilt; P.dm._revealWhenBuilt = function (...a) { polls++; return own.apply(this, a); };
    await tick(600);
    P.dm._revealGen = (P.dm._revealGen || 0) + 1; // whatever still polls retires (no timer outlives the leg)
    leg(before === 0 && !!o && said.length === 1 && /Atlas notes/.test(said[0]) && /did not appear/.test(said[0]) && ask === null && polls === 0 && toasts(t0).length === 1, `§12 r7 R4: AN OPENER STILL OUT IS A SIGN OF LIFE ONLY WITHIN THE GRACE — an opener whose promise never settles: nothing said while within BUILD_GRACE_MS, then said ONCE «…its window did not appear», _revealAsk clear, the poll stopped (d5f74914f: 'coming' for ever, 10 Hz, silent) — before ${before}, toasts ${J(said)}, ask ${J(ask)}, polls after ${polls}`);
  }
  return failed;
}
await section('§12 ROUND 7 — only the person\'s act drops the mark (Q′); an open resolves to the window this page has first, never a copy (S); an opener past the grace is said (R)', async () => {
  await r7Legs({ install: install0 });
});

/** §13 ROUND 8 (the r7 acceptance's roads) — the shapes that need the page's own clocks (the fast half is test-layout-dup-storm §R8):
 *  L4 the latest act wins AFTER the gate (and its control: a press made after the open drains — the brief's R1 (a)); BS «bysession»
 *  on the real timing (a copy is never restored, a restore never raises); BSR the same with a deferred reveal in flight. */
async function r8Legs({ DM = RealDM, LM = RealLM, install = null, quiet = false, legs = null } = {}) {
  const failed = [];
  const leg = (c, n, extra) => { if (!quiet) ok(c, n, extra); if (!c) failed.push(n); return !!c; };
  const want = (k) => !legs || legs.includes(k);
  if (!install) return failed;
  const G = ['x-h', 'win-x-s', 'x-slow'];
  const recG = () => ({ 'desk-x': [member(files('x-h', 0), G), member(chat('win-x-s', S, 1), G), member(files('x-slow', 2), G)], 'desk-y': [files('y-1', 0)], 'desk-v': [files('v-1', 0)] });
  // a page over its own hub; `never` = windows whose build never comes, `slow` = windows that stand `ms` after their visit asked
  const page = (recs, active, { attachMs = 500, never = [], slow = {} } = {}) => {
    const H = hub(loadHandler(), DOC(recs)), P = pageOn(H, install, active, { DM, LM, attachMs });
    const orig = P.app.replayOpenSpec;
    P.app.replayOpenSpec = (spec, winId) => {
      if (never.includes(winId)) return null;
      const s = slow[winId];
      if (s) { setTimeout(() => { const w = P.mkWin(winId, s.desk, s.o(spec)); P.lm.onWindowCreated(w); }, s.ms); return null; }
      return orig(spec, winId);
    };
    P.H = H;
    return P;
  };
  const open = (P, sid = S) => { press('pointerdown'); if (sid === S) P.app.attachSession(S, 'Atlas notes', '/srv/u/atlas', { mode: 'chat', backend: 'claude', backendSessionId: CID }); else P.app.attachSession(sid, 'Tide log', '/srv/u/tide', { mode: 'chat', backend: 'claude', backendSessionId: 'b' + CID.slice(1) }); press('pointerup'); };
  const personSwitch = (P, d) => { press('pointerdown'); const p = P.dm.switchTo(d); press('pointerup'); return p; };
  const fronts = (P) => J([...(P.lm._fronts || new Map())]), MARK = J([['desk-x', 'win-x-s']]);
  const sWins = (P) => [...P.wins.values()].filter((w) => w._openSpec && w._openSpec.serverId === S).map((w) => w.id + '@' + w._desktopId + (w._attached ? '' : '(attaching)'));
  if (want('L4')) {
    // the person switches to X (S's window built there by the visit, in a group still forming), presses Y's tile 0.3 s later (queued
    // behind the 1 s gate), opens S 0.3 s after that — S's window stands on X, the desktop on show
    const P = page(recG(), 'desk-y', { never: ['x-slow'] }), t0 = made.length;
    await personSwitch(P, 'desk-x'); await tick(300);
    personSwitch(P, 'desk-y'); await tick(300);
    const queued = P.dm._pendingSwitch === 'desk-y';
    open(P);
    await tick(800); // the gate has ended: its drain found nothing
    const at = P.dm.activeDesktopId, pend = P.dm._pendingSwitch, f = fronts(P), foc = P.app.wm.activeWindowId;
    await tick(5);
    leg(queued && at === 'desk-x' && pend == null && f === MARK && foc === 'win-x-s' && toasts(t0).length === 0, `§13 r8 L4: THE LATEST ACT WINS, after the gate — the person presses Y inside the gate (queued), then opens S, whose window stands on X, on show: when the gate ends the person is still on X with S marked in front and focused, nothing said (8bde36a5c: the drain moved the person to Y, away from what they had just opened) — queued ${queued}, after the gate active ${at}, pending ${pend}, fronts ${f}, focus ${foc}`);
  }
  if (want('L4c')) {
    // control — the brief's R1 (a), in Road 4's order: the open FIRST, then the person presses Y inside the gate (that press is the later act)
    const P = page(recG(), 'desk-y', { never: ['x-slow'] }), t0 = made.length;
    await personSwitch(P, 'desk-x'); await tick(300);
    open(P); await tick(300);
    const marked = fronts(P) === MARK;
    personSwitch(P, 'desk-y');
    const queued = P.dm._pendingSwitch === 'desk-y';
    await tick(800);
    const at = P.dm.activeDesktopId, f = fronts(P);
    await tick(5);
    leg(marked && queued && at === 'desk-y' && f === '[]' && toasts(t0).length === 0, `§13 r8 L4 control (R1 a): …a press made AFTER the open is the later act — queued behind the gate, drained to Y, the mark dropped by that press (r7 u2 «latest wins»; 8bde36a5c the same) — marked ${marked}, queued ${queued}, after the drain active ${at}, fronts ${f}`);
  }
  // «bysession» (the r7 acceptance): V lists S with NO openSpec — built by its identity (lane layout-stopped-window's row)
  const bare = (id) => ({ winId: id, title: 'Atlas notes — /srv/u/atlas', type: 'chat', isMinimized: false, isMaximized: false, gridBounds: GB(1), zIndex: 101, serverSessionId: S, backend: 'claude', backendSessionId: CID, cwd: '/srv/u/atlas' });
  const watch = (P) => {
    P.lm._bootJson = async (u) => (u === '/api/active' ? { sessions: [{ id: S, name: 'Atlas notes', cwd: '/srv/u/atlas', backend: 'claude', backendSessionId: CID, mode: 'chat' }, { id: T, name: 'Tide log', cwd: '/srv/u/tide', backend: 'claude', backendSessionId: 'b' + CID.slice(1), mode: 'chat' }] } : { sessions: [] });
    const w = { switches: [], restores: [] }, t00 = Date.now(), sw = P.dm.switchTo, rs = P.lm.restoreState.bind(P.lm);
    P.dm.switchTo = function (d) { if (d !== this._activeId) w.switches.push([Date.now() - t00, this._activeId + '→' + d]); return sw.call(this, d); };
    P.lm.restoreState = (st) => { w.restores.push(...ids(st && st.windows)); return rs(st); };
    return w;
  };
  if (want('BS')) {
    // the person opens S on X — a slow host: its window attaches at +10 s; at +1 s the person presses V
    const P = page({ 'desk-x': [files('x-1', 0)], 'desk-y': [files('y-1', 0)], 'desk-v': [files('v-1', 0), bare('win-v-s')] }, 'desk-x', { attachMs: 10000 }), t0 = made.length;
    const w = watch(P);
    open(P); await tick(1000);
    personSwitch(P, 'desk-v');
    const samples = [];
    for (let i = 0; i < 11; i++) { await tick(1000); samples.push(P.dm.activeDesktopId); }
    const sw = sWins(P), onHub = sessionIds(P.H.layouts());
    await tick(5);
    leg(J(w.switches.map((s) => s[1])) === J(['desk-x→desk-v']) && samples.every((d) => d === 'desk-v') && J(w.restores) === '[]' && sw.length === 1 && /@desk-x$/.test(sw[0]) && onHub.length === 1 && toasts(t0).length === 0, `§13 r8 BS: A COPY IS NEVER RESTORED, A RESTORE NEVER RAISES («bysession») — S's window attaching on X for 10 s, V listing S with no openSpec, the person presses V at +1 s: ONE switch, V on show across 11 samples to +12 s, the copy never restored, S's window stands on X once attached — ONE window of S on the hub, nothing said (8bde36a5c: the copy restored, its attach sent the person back to X ~1 s later — [[1001,x→v],[1006,v→x],[2006,v→x]]) — switches ${J(w.switches)}, samples ${J(samples)}, restored ${J(w.restores)}, S windows ${J(sw)}, on the hub ${J(onHub)}, toasts ${J(toasts(t0).map(toastText))}`);
  }
  if (want('BSR')) {
    // …with a DEFERRED REVEAL in flight when the visit's restore would run: the person opens T, whose window waits in V's held record
    // (its group [v-h, win-v-t, v-slow]: win-v-t stands 2 s after the visit, v-slow 4 s); V lists S's copy too
    const HG = ['v-h', 'win-v-t', 'v-slow'];
    const P = page({ 'desk-x': [files('x-1', 0)], 'desk-y': [files('y-1', 0)], 'desk-v': [member(files('v-h', 0), HG), member(chat('win-v-t', T, 1), HG), member(files('v-slow', 2), HG), bare('win-v-s')] }, 'desk-x',
      { attachMs: 10000, slow: { 'win-v-t': { ms: 2000, desk: 'desk-v', o: (spec) => ({ type: 'chat', title: 'Tide log — /srv/u/tide', _openSpec: spec }) }, 'v-slow': { ms: 4000, desk: 'desk-v', o: (spec) => ({ type: 'viewer', _openSpec: spec }) } } }), t0 = made.length;
    const w = watch(P);
    open(P); await tick(1000);
    open(P, T); await tick(300);
    const inFlight = !!(P.dm._revealAsk && P.dm._revealAsk.id === 'win-v-t' && !P.wins.has('win-v-t'));
    const samples = [];
    for (let i = 0; i < 6; i++) { await tick(1000); samples.push(P.dm.activeDesktopId); }
    const c = P.wins.get('win-v-t')?._tabChain, front = c ? c.tabs[c.active] : null, foc = P.app.wm.activeWindowId, ask = P.dm._revealAsk;
    await tick(5);
    leg(inFlight && J(w.switches.map((s) => s[1])) === J(['desk-x→desk-v']) && samples.every((d) => d === 'desk-v') && J(w.restores) === '[]' && front === 'win-v-t' && foc === 'win-v-t' && ask === null && toasts(t0).length === 0, `§13 r8 BSR: …A REVEAL IN FLIGHT IS NEVER RETIRED IN SILENCE — the person opens T, whose window waits in V's record (it stands 2 s after the visit, its group 4 s): the visit restores nothing of S's copy, the reveal completes — T's tab in front of its group and focused, the person on V throughout, nothing said (8bde36a5c: the copy's restore noted an act nobody made — the reveal retired unsaid — and switched back to X) — in flight ${inFlight}, switches ${J(w.switches)}, samples ${J(samples)}, restored ${J(w.restores)}, front ${front}, focus ${foc}, toasts ${J(toasts(t0).map(toastText))}`);
  }
  return failed;
}
await section('§13 ROUND 8 — the latest act wins after the gate; «bysession»: a copy is never restored, a restore never raises, a reveal in flight completes', async () => {
  await r8Legs({ install: install0 });
});

await section('§6 MUTANTS — each fix removed turns its own legs RED', async () => {
  const M = mutantCopies('ldupl', REPO);
  const DSRC = read('src/lib/desktop-manager.js'), LSRC = read('src/lib/session-lifecycle.js');
  // B's rearm restored (the unconditional rearm after a refusal)
  {
    const find = '    if (!same) lm.rearmSave?.();';
    ok(DSRC.includes(find), 'mutant B-rearm-restored: the patched line exists in desktop-manager.js');
    const DMx = (await import(pathToFileURL(M.write('src/lib/desktop-manager.js', DSRC.replace(find, '    lm.rearmSave?.();').replace('    if (this.holdsBack(desktopId, state)) return;', ''), 'b-rearm-restored', { esm: true })).href)).DesktopManager;
    const LSRC0 = read('src/lib/layout.js');
    const brk1 = "    if (desktopId && dm?.holdsBack?.(desktopId, state)) { this.noteLayoutSent(sentDesks, sentAt); return; }", brk2 = '      if (dm.holdsBack?.(d, st)) continue;';
    ok(LSRC0.includes(brk1) && LSRC0.includes(brk2), 'mutant B-rearm-restored: the breaker\'s two lines exist in layout.js');
    const LMx = (await import(pathToFileURL(M.write('src/lib/layout.js', LSRC0.replace(brk1, '').replace(brk2, '      if (false) continue;'), 'b-no-breaker', { esm: true })).href)).LayoutManager;
    const f = await breakerLegs({ WSH: loadHandler({ shrinkVerdict: noDupRule }), DM: DMx, LM: LMx, quiet: true, legs: ['B2'] });
    ok(f.some((n) => /THE BREAKER: a refused record the page cannot change is NEVER re-sent unchanged/.test(n)), `mutant B-rearm-restored (the rearm after a refusal, no breaker): the refused record goes out again every ~500 ms — RED (${f.length})`);
    const findK = "    if (msg.reason === 'shrink-without-close') for (const id of msg.unexplained || []) this._keep(d, id);";
    ok(DSRC.includes(findK) && DSRC.includes('    if (this.holdsBack(desktopId, state)) return;'), 'mutant B-nothing-kept: the patched lines exist in desktop-manager.js');
    const DMk = (await import(pathToFileURL(M.write('src/lib/desktop-manager.js', DSRC.replace(findK, '').replace(find, '    lm.rearmSave?.();').replace('    if (this.holdsBack(desktopId, state)) return;', ''), 'b-nothing-kept', { esm: true })).href)).DesktopManager;
    const g = await breakerLegs({ WSH: loadHandler({ shrinkVerdict: noDupRule, refusalStorm: () => ({ answer: true, ended: null }) }), DM: DMk, LM: LMx, quiet: true, legs: ['B1'] });
    ok(g.some((n) => /at most ONE refusal per record change/.test(n)), `mutant B-nothing-kept (2.369.374's reconcile — nothing kept, the rearm restored, no breaker; the server's guard off): the 2 Hz storm — RED (${g.length})`);
  }
  // E's door removed (attachSession builds a second window)
  {
    const find = "    if (!(syncId || machine) && this.desktopManager?.revealHeldSession?.(serverId)) return null;\n";
    ok(LSRC.includes(find), 'mutant E-no-door: the patched line exists in session-lifecycle.js');
    const f = await censusLegs(await loadLifecycle(LSRC.replace(find, '')), { quiet: true });
    ok(f.some((n) => /THE WRITER: a person opening S/.test(n)), `mutant E-no-door (2.369.374's attachSession): two pages make the TRIPLE — RED (${f.length})`);
  }

  // r2: A the hub's `showing` dropped; the kept row removed (probe d); holdsBack off (probe h); B the chain shrink removed; C the reveal removed
  {
    const fA = await r2Legs({ WSH: loadHandler({ shrinkVerdict: (a) => realDR.shrinkVerdict({ ...a, showing: () => false }) }), quiet: true, legs: ['A'] });
    ok(fA.some((n) => /the HUB refuses A's dedup of V's copy/.test(n)), `mutant r2-A-no-showing (b3a058eb2's verdict): the hub lets page A's dedup of the window page B shows go — RED (${fA.length})`);
    const findK = "    if (msg.reason === 'shrink-without-close') for (const id of msg.unexplained || []) this._keep(d, id);";
    ok(DSRC.includes(findK), 'mutant r2-nothing-kept: the patched line exists in desktop-manager.js');
    const DMk = (await import(pathToFileURL(M.write('src/lib/desktop-manager.js', DSRC.replace(findK, ''), 'r2-nothing-kept', { esm: true })).href)).DesktopManager;
    const fK = await r2Legs({ DM: DMk, quiet: true, legs: ['A'] });
    ok(fK.some((n) => /the refused copy is KEPT on A/.test(n)), `mutant r2-nothing-kept (_keep gone — claim 1's M3): the person's close of v-1 is lost — RED (${fK.length})`);
    const findH = '    return !!(r && r.json != null && r.json === this._writeJson(desktopId, state));';
    ok(DSRC.includes(findH), 'mutant r2-no-holdsBack: the patched line exists in desktop-manager.js');
    const DMh = (await import(pathToFileURL(M.write('src/lib/desktop-manager.js', DSRC.replace(findH, '    return false;'), 'r2-no-holdsBack', { esm: true })).href)).DesktopManager;
    const fH = await r2Legs({ DM: DMh, quiet: true, legs: ['H'] });
    ok(fH.some((n) => /THE BREAKER on a desktop NOT on show/.test(n)), `mutant r2-no-holdsBack (claim 1's M4): the refused record of V is re-sent on every act on X — RED (${fH.length})`);
    const findB = "      this._setRecord(x.desk, mergeDesktopRecord({ record: this._savedStates.get(x.desk), remove: [x.id], add: chainWithout(this._savedStates.get(x.desk), x.id) }));\n      this._ask(x.desk, x.id); // …and the page's own group waits for the hub's verdict (r3 G: a refusal leaves every group as it was)\n";
    ok(DSRC.includes(findB), 'mutant r2-chain-kept: the patched lines exist in desktop-manager.js');
    const DMb = (await import(pathToFileURL(M.write('src/lib/desktop-manager.js', DSRC.replace(findB, "      this._setRecord(x.desk, mergeDesktopRecord({ record: this._savedStates.get(x.desk), remove: [x.id] }));\n"), 'r2-chain-kept', { esm: true })).href)).DesktopManager;
    const fB = await r2Legs({ DM: DMb, quiet: true, legs: ['B'] });
    ok(fB.some((n) => /LEAVES ITS TAB GROUP TOO/.test(n)) && fB.some((n) => /RE-FORMS without it/.test(n)), `mutant r2-chain-kept (b3a058eb2's normalizeDups): the host keeps naming the copy, the group never re-forms — RED (${fB.length})`);
    const findC = '    Promise.resolve(this.switchTo(desk)).then(() => this._revealWhenBuilt(id, desk, gen))';
    ok(DSRC.includes(findC), 'mutant r2-no-reveal: the patched line exists in desktop-manager.js');
    const DMc = (await import(pathToFileURL(M.write('src/lib/desktop-manager.js', DSRC.replace(findC, '    Promise.resolve(this.switchTo(desk)).then(() => null)'), 'r2-no-reveal', { esm: true })).href)).DesktopManager;
    const installC = await loadLifecycle();
    const fC = await r2Legs({ DM: DMc, install: installC, quiet: true, legs: ['C'] }).catch((e) => [String(e)]);
    ok(fC.length >= 1, `mutant r2-no-reveal (b3a058eb2's door): the open lands on the host's tab — RED (${fC.length})`);
  }
  // r3: F the page's keep removed; F the trace never written (the hub's memory); G the partial restore (ab1226ff2's
  // normalizeDups: the group shrunk ahead of the verdict) — with the hub's chain gate, and without it; H the token removed; H the
  // give-up reveals
  {
    const findF = "    if (!dupsLeft.some((e) => e && String(e.id) === String(win.id))) return false;";
    ok(DSRC.includes(findF), 'mutant r3-F-no-keep: the patched line exists in desktop-manager.js');
    const DMf = (await import(pathToFileURL(M.write('src/lib/desktop-manager.js', DSRC.replace(findF, '    return false;'), 'r3-f-no-keep', { esm: true })).href)).DesktopManager;
    const fK = await r3Legs({ DM: DMf, quiet: true, legs: ['F1', 'F2', 'F3'] });
    ok(fK.some((n) => /WHO IS LOOKING OUTLIVES THE SOCKET/.test(n)) && fK.some((n) => /F2 \(V hidden on B \(B moved on to Y\)\): …B wakes/.test(n)) && fK.some((n) => /F3: …B is back on the new process/.test(n)), `mutant r3-F-no-keep (ab1226ff2's page: it closes what the record dropped): B closes the window it shows — on show, hidden, after a restart — RED (${fK.length})`);
    const fT = await r3Legs({ over: { noteDupsLeft: () => [] }, quiet: true, legs: ['F1', 'F4'] });
    ok(fT.some((n) => /TRACING it beside V's record/.test(n)) && fT.some((n) => /WHO IS LOOKING OUTLIVES THE SOCKET/.test(n)) && fT.some((n) => /the NEW process reads the trace from data/.test(n)), `mutant r3-F-no-trace (the hub keeps no memory of the dedup): B's re-read closes the window — after a restart too — RED (${fT.length})`);
    const findG = "      this._ask(x.desk, x.id); // …and the page's own group waits for the hub's verdict (r3 G: a refusal leaves every group as it was)\n";
    ok(DSRC.includes(findG), 'mutant r3-G-partial-restore: the patched line exists in desktop-manager.js');
    // r4: the kept copy RIDES its group in what the page writes (rideKept) — the partial restore's re-send agrees with the kept row by
    // construction, so the mutant takes the ride out too (alone it is harmless now: the page's group forms without the copy either way)
    const findRide = '    const rode = ghosts.length ? rideKept(held, built, ghosts) : null;';
    ok(DSRC.includes(findRide), 'mutant r3-G-partial-restore: the ride\'s line exists in desktop-manager.js');
    const DMg = (await import(pathToFileURL(M.write('src/lib/desktop-manager.js', DSRC.replace(findG, '      this.app.layoutManager?.dropUnbuiltMembers?.([x.id]);\n').replace(findRide, '    const rode = null;'), 'r3-g-partial', { esm: true })).href)).DesktopManager;
    const fG = await r3Legs({ DM: DMg, quiet: true, legs: ['G'] });
    ok(fG.some((n) => /nothing A sends after it is a record whose rows disagree/.test(n)) && fG.some((n) => /A's own record of V reads every group as the hub's/.test(n)), `mutant r3-G-partial-restore (ab1226ff2: the group shrunk ahead of the verdict, only the copy's row restored — and since r4 without the ride): A re-sends rows that disagree — the hub's gate refuses them — RED (${fG.length})`);
    const fG2 = await r3Legs({ DM: DMg, over: { chainsAgree: () => ({ ok: true, rows: [] }) }, quiet: true, legs: ['G'] });
    ok(fG2.some((n) => /JSON-equal to the record before the proposal/.test(n)) && fG2.some((n) => /B's group, on show, is untouched/.test(n)), `mutant r3-G-partial-restore + no chain gate (ab1226ff2 whole): the inconsistent re-send is written and B ungroups — RED (${fG2.length})`);
    const findH = "    if ((this._revealGen || 0) !== gen) return; // the person moved on: the reveal retires";
    ok(DSRC.includes(findH), 'mutant r3-H-no-token: the patched line exists in desktop-manager.js');
    const DMh = (await import(pathToFileURL(M.write('src/lib/desktop-manager.js', DSRC.replace(findH, ''), 'r3-h-no-token', { esm: true })).href)).DesktopManager;
    const fH = await r3Legs({ DM: DMh, install: install0, quiet: true, legs: ['H1', 'H4'] });
    ok(fH.some((n) => /a key the person pressed after the open retires it/.test(n)), `mutant r3-H-no-token: a key press retires nothing — RED (${fH.length}; H1's switch away is held twice since r4: the reveal also waits for ITS desktop on show)`);
    // (r3-H-never-gives-up retired in r6: a reveal that waits while its window is still coming is LAW R — §6's r6 R mutants)
  }
  // r4: I the group waits for the kept copy (36bd0c866's forget-without-rebuild) / no repair of a 'chain-disagrees'; J the chain sync
  // rebuilds from the shrunk chain (on show) / the hidden road appends the kept row; K a keep on a close (the trace ignores the
  // person's act); L retire on the first call; M the newest 50
  {
    const LSRC4 = read('src/lib/layout.js');
    const findI = "    const v = restoreVerdict(entry.tc, (id) => wm.windows.has(id), ghosts.length ? [...entry.gone, ...ghosts] : entry.gone);";
    ok(LSRC4.includes(findI), 'mutant r4-I-wait-for-kept: the patched line exists in layout.js');
    const LMi = (await import(pathToFileURL(M.write('src/lib/layout.js', LSRC4.replace(findI, "    const v = restoreVerdict(entry.tc, (id) => wm.windows.has(id), entry.gone);"), 'r4-i-wait', { esm: true })).href)).LayoutManager;
    const fI = await r4Legs({ LM: LMi, quiet: true, legs: ['I'] }), fI5 = await r5Legs({ LM: LMi, quiet: true, legs: ['O3a'] });
    ok(fI.some((n) => /an injected disagreement is REPAIRED on the page/.test(n)) && fI5.some((n) => /r5 O3 \(merge at 0 ms\)/.test(n)), `mutant r4-I-wait-for-kept (36bd0c866: the group waits for a copy the page never builds — since r5 the relayed record's groups are read without the ghost too, so the first visit and the repair carry it): the group pending on the copy at the first visit (q3) and after the repair — RED (${fI.length + fI5.length}: ${[...fI, ...fI5].map((n) => n.slice(0, 30)).join(' | ')})`);
    const findR = "    if (!lm?.takeChains) return false;";
    ok(DSRC.includes(findR), 'mutant r4-I-no-repair: the patched line exists in desktop-manager.js');
    const DMr = (await import(pathToFileURL(M.write('src/lib/desktop-manager.js', DSRC.replace(findR, '    return false;'), 'r4-i-no-repair', { esm: true })).href)).DesktopManager;
    const fR = await r4Legs({ DM: DMr, quiet: true, legs: ['I'] });
    ok(fR.some((n) => /an injected disagreement is REPAIRED on the page/.test(n)) && fR.some((n) => /the page's next write is ACKED/.test(n)), `mutant r4-I-no-repair (36bd0c866: onSyncRefused has no repair for 'chain-disagrees'): the desktop stays unwritable from A — RED (${fR.length})`);
    const findJ = "        if (keptIds.length) state = this.app.desktopManager?.keptRecord?.(activeDesk, state, keptIds) || state;";
    ok(LSRC4.includes(findJ), 'mutant r4-J-shrunk-chain: the patched line exists in layout.js');
    const LMj = (await import(pathToFileURL(M.write('src/lib/layout.js', LSRC4.replace(findJ, ''), 'r4-j-shrunk', { esm: true })).href)).LayoutManager;
    const fJ = await r4Legs({ LM: LMj, quiet: true, legs: ['J1'] });
    ok(fJ.some((n) => /J1 \(V on show on B\): A KEPT WINDOW KEEPS ITS GROUP/.test(n)) && fJ.some((n) => /J1 \(V on show on B\): …and the re-send writes the record BEFORE the dedup/.test(n)), `mutant r4-J-shrunk-chain (36bd0c866's apply: the chain sync rebuilds from the record's shrunk chain): the kept window is torn out of its group and re-sent alone — RED (${fJ.length})`);
    const findJ2 = "    state = this.keptRecord(desktopId, state, this._takeKept(desktopId));\n    if (gone.length) {";
    ok(DSRC.includes(findJ2), 'mutant r4-J-hidden-appends: the patched line exists in desktop-manager.js');
    const DMj = (await import(pathToFileURL(M.write('src/lib/desktop-manager.js', DSRC.replace(findJ2, '    this._takeKept(desktopId);\n    if (gone.length) {'), 'r4-j-hidden', { esm: true })).href)).DesktopManager;
    const fJ2 = await r4Legs({ DM: DMj, quiet: true, legs: ['J2'] });
    ok(fJ2.some((n) => /J2 \(V hidden on B\): …and the re-send writes the record BEFORE the dedup/.test(n)), `mutant r4-J-hidden-appends (36bd0c866's hidden road: the kept row appended last): the re-send is not the record before the dedup — RED (${fJ2.length})`);
    const ND = require(MODEL).noteDupsLeft;
    const fK = await r4Legs({ over: { noteDupsLeft: (t, o = {}) => ND(t, { ...o, gone: [] }) }, quiet: true, legs: ['K'] });
    ok(fK.some((n) => /A PERSON'S CLOSE IS NEVER UNDONE BY A KEEP/.test(n)), `mutant r4-K-keep-on-close (the trace blind to a person's act — 36bd0c866's): B keeps the window C's person closed and re-lists it — RED (${fK.length})`);
    const findL = "    if (this._activeId !== desk && !coming) return this._revealFailed(id, null);"; // (r6 R: that end is said)
    ok(DSRC.includes(findL), 'mutant r4-L-retire-first-call: the patched line exists in desktop-manager.js');
    const DMl = (await import(pathToFileURL(M.write('src/lib/desktop-manager.js', DSRC.replace(findL, '    if (this._activeId !== desk) return;'), 'r4-l-first-call', { esm: true })).href)).DesktopManager;
    const fL = await r4Legs({ DM: DMl, install: install0, quiet: true, legs: ['L'] });
    ok(fL.some((n) => /L \(gap 300 ms\): A REVEAL WAITS FOR THE SWITCH IT ASKED FOR/.test(n)), `mutant r4-L-retire-first-call (36bd0c866: the reveal retires while its own switch is queued): the host's tab at gap 300 — RED (${fL.length})`);
    const fM = await r4Legs({ over: { noteDupsLeft: (t, o = {}) => ND(t, o).slice(-50) }, quiet: true, legs: ['M'] });
    ok(fM.some((n) => /THE TRACE IS NEVER CUT BY COUNT/.test(n)), `mutant r4-M-fifo-50 (36bd0c866's DUP_TRACE_CAP): B closes the ten oldest copies it shows — RED (${fM.length})`);
  }
  // r5: O the copy a build attempt until a save (4ad07d751's ghostsOf), O the reveal waiting for a group (4ad07d751's revealWhenFormed),
  // O a re-listed copy asked for again, P the repair discarding the act made since, P the hub's groups taken over a group the page
  // shows whole, N the live-session set alone (4ad07d751's `alive`)
  {
    const DSRC5 = read('src/lib/desktop-manager.js'), LSRC5 = read('src/lib/session-lifecycle.js'), WSRC5 = read('src/ws-handler.js');
    const dm5 = (find, repl, tag) => { ok(DSRC5.includes(find), `mutant ${tag}: the patched line exists in desktop-manager.js`); return import(pathToFileURL(M.write('src/lib/desktop-manager.js', DSRC5.split(find).join(repl), tag, { esm: true })).href).then((m) => m.DesktopManager); };
    const DMo = await dm5('    if (!shows.size) return out;', '    return out;', 'r5-o-attempt');
    const fO = await r5Legs({ DM: DMo, install: install0, quiet: true, legs: ['O1', 'O3a', 'O5'] });
    ok(fO.some((n) => /r5 O1: A COPY THIS PAGE CANNOT BUILD IS A GHOST/.test(n)) && fO.some((n) => /r5 O3 \(merge at 0 ms\)/.test(n)) && fO.some((n) => /r5 O5: AN OPEN OF A WINDOW THAT STANDS/.test(n)), `mutant r5-O-build-attempt-until-save (4ad07d751's ghostsOf: only _kept / _carried): A's group taken apart by B's re-send (q1), the merge refused (q3), v-t's group still pending at the open (qR2) — RED (${fO.length}: ${fO.map((n) => n.slice(0, 22)).join(' | ')})`);
    const kif = "  keepInFront(id) {\n    const w = this.app.wm.windows.get(String(id));\n    if (!w || w._onStage) return;\n    this._noteAct();\n    const desk = w._desktopId || this._activeId;\n    this.app.layoutManager?.showWhenFormed?.(String(id), desk);\n    // THE LATEST ACT WINS (r8 — the r7 acceptance: the person pressed another desktop's tile inside the 1 s gate, then opened a\n    // conversation whose window stands on the desktop on show; the open made no switch, the queued one stayed armed and its drain\n    // took the person away from what they had just opened): an open that lands on the desktop on show consumes a switch queued\n    // before it, as switchTo(active) does; a press made after the open queues its own and wins (r7 u2)\n    if (desk === this._activeId) this._pendingSwitch = null;\n    this._revealing = { gen: this._revealGen || 0, desk }; // the caller's revealWindow switches to THIS desktop next: the reveal's own switch (r7 Q′, r8)\n  }";
    const r4k = "  keepInFront(id) {\n    const w = this.app.wm.windows.get(String(id));\n    if (!w || w._onStage || !this.app.layoutManager?.pendingChainOf?.(String(id))) return false;\n    const desk = w._desktopId || this._activeId;\n    if (desk !== this._activeId) return false;\n    this._noteAct();\n    const gen = this._revealGen || 0;\n    this._revealAsk = { id: String(id), desk, gen };\n    this._revealWhenBuilt(String(id), desk, gen);\n    return true;\n  }";
    const wl = '    if (this._activeId !== desk || !wm.windows.has(id)) {', wb = "      const b = this._activeId !== desk ? { s: 'coming' } : this._buildState(id, desk);";
    ok(DSRC5.includes(kif) && DSRC5.includes(wl) && DSRC5.includes(wb), 'mutant r5-O-reveal-waits-for-group: the patched lines exist in desktop-manager.js');
    const DMw = (await import(pathToFileURL(M.write('src/lib/desktop-manager.js', DSRC5.replace(kif, r4k).replace(wl, '    if (this._activeId !== desk || !wm.windows.has(id) || !!this.app.layoutManager?.pendingChainOf?.(id)) {').replace(wb, "      const b = this._activeId !== desk || wm.windows.has(id) ? { s: 'coming' } : this._buildState(id, desk);"), 'r5-o-waits', { esm: true })).href)).DesktopManager;
    const lf = '        if (!replay) this.desktopManager?.keepInFront?.(winId);';
    ok(LSRC5.includes(lf), 'mutant r5-O-reveal-waits-for-group: the patched line exists in session-lifecycle.js');
    const installW = await loadLifecycle(LSRC5.replace(lf, '        if (!replay && this.desktopManager?.keepInFront?.(winId)) return true;'));
    const fW5 = await r5Legs({ DM: DMw, install: installW, quiet: true, legs: ['O6'] });
    ok(fW5.some((n) => /r5 O6: …a reveal never waits for a group/.test(n)), `mutant r5-O-reveal-waits-for-group (4ad07d751's revealWhenFormed for a window that stands): the open of win-v-s reveals nothing while its group waits 8 s for a member (qR) — RED (${fW5.length})`);
    const DMa = await dm5('    this._relisted(desktopId, state);\n', '', 'r5-o-ask-again');
    const fA5 = await r5Legs({ DM: DMa, quiet: true, legs: ['O1'] });
    ok(fA5.some((n) => /r5 O1: …A's next act lands at once — acked, NO refusal/.test(n)), `mutant r5-O-ask-again (a copy the hub let go asked for again at the next save): A's next act is refused 'shrink-without-close' first — RED (${fA5.length})`);
    const DMp = await dm5('    lm.takeChains(d, rec, take, { keep });', '    lm.takeChains(d, rec, [...touch]);', 'r5-p-discard');
    const fP = await r5Legs({ DM: DMp, quiet: true, legs: ['P1'] });
    ok(fP.some((n) => /r5 P1: AN ACT MADE AFTER THE REFUSED WRITE LEFT SURVIVES THE REPAIR/.test(n)), `mutant r5-P-repair-discards-the-act (4ad07d751's repair: every touched group taken): the person's merge made after the refused write is undone — RED (${fP.length})`);
    const DMt = await dm5('    if ([...touch].every(holds)) {', '    if (false) {', 'r5-p-take');
    const fT5 = await r5Legs({ DM: DMt, quiet: true, legs: ['P2'] });
    ok(fT5.some((n) => /r5 P2: …a 'chain-disagrees' refusal of a write whose groups the page shows hold together/.test(n)), `mutant r5-P-take-over-the-act (4ad07d751's: any disagreement with no member building takes the hub's groups): the person's merge undone and said — RED (${fT5.length})`);
    const fn = 'gone, alive: (sid) => !endedConvs.has(sid) });';
    ok(WSRC5.includes(fn), 'mutant r5-N-live-set: the patched line exists in ws-handler.js');
    const Wn = M.load('src/ws-handler.js', WSRC5.replace(fn, 'gone, alive: (sid) => activeSessions.has(sid) });'), 'r5-n-live');
    const fN = await r5Legs({ WSH: Wn, quiet: true, legs: ['N1', 'N2'] });
    ok(fN.some((n) => /r5 N1: ALIVE FOR THE TRACE/.test(n)) && fN.some((n) => /r5 N2: ALIVE FOR THE TRACE/.test(n)), `mutant r5-N-live-set (4ad07d751's \`activeSessions.has\` alone): a STOPPED conversation's copy leaves the trace and B closes the window it shows — RED (${fN.length})`);
  }
  // r6: Q the front mark on the pending entry only (a3fb7b40e's `e.shown`); R the reveal that gives up while its window is still
  // coming (a bound that says so), R the silent 50 × 100 ms cap (a3fb7b40e's)
  {
    const DSRC6 = read('src/lib/desktop-manager.js'), LSRC6 = read('src/lib/layout.js');
    const sw = "    const hit = (this._pendingChains || []).some((e) => e.tc.tabs.includes(sid));\n    if (hit) (this._fronts || (this._fronts = new Map())).set(d, sid);\n    return hit;";
    const rf = '    const fd = entry.desk || dm?.activeDesktopId || null, front = this._fronts?.get(fd);', rc = '    if (front && tc.tabs.includes(front)) this._fronts.delete(fd); // consumed: the group that names it formed with it in front\n';
    ok(LSRC6.includes(sw) && LSRC6.includes(rf) && LSRC6.includes(rc), 'mutant r6-Q-mark-on-the-entry: the patched lines exist in layout.js');
    const LMq = (await import(pathToFileURL(M.write('src/lib/layout.js', LSRC6.replace(sw, "    let hit = false;\n    for (const e of this._pendingChains || []) if (e.tc.tabs.includes(sid)) { e.shown = sid; hit = true; }\n    return hit;").replace(rf, '    const front = entry.shown;').replace(rc, ''), 'r6-q-entry', { esm: true })).href)).LayoutManager;
    const fQ = await r6Legs({ LM: LMq, install: install0, quiet: true, legs: ['Q1', 'Q2', 'Q3', 'Q4'] });
    ok(['Q1', 'Q2', 'Q3', 'Q4'].every((k) => fQ.some((n) => n.startsWith(`§11 r6 ${k}:`))), `mutant r6-Q-mark-on-the-entry (a3fb7b40e: the person's front tab kept as \`shown\` on the pending entry — a relay of V re-queues the group without it): v-h in front on all four roads — RED (${fQ.length}: ${fQ.map((n) => n.slice(0, 13)).join(' | ')})`);
    const sig = '  _revealWhenBuilt(id, desk, gen) {', cw = "      if (b.s === 'coming') { setTimeout(() => this._revealWhenBuilt(id, desk, gen), 100); return; }";
    const rr = '      return this._revealFailed(id, b.why || null);', rn = '    if (this._activeId !== desk && !coming) return this._revealFailed(id, null);';
    ok(DSRC6.includes(sig) && DSRC6.includes(cw) && DSRC6.includes(rr) && DSRC6.includes(rn), 'mutant r6-R: the patched lines exist in desktop-manager.js');
    // the bound is 5 s of wall clock from the reveal's first call (a3fb7b40e counted 50 × 100 ms tries — under load the timers stretch
    // past the 6.5 s the H2 window takes, and a tries-count mutant reveals it after all: no verdict)
    const capped = DSRC6.replace(sig, '  _revealWhenBuilt(id, desk, gen, t0 = Date.now()) {').replace(cw, "      if (b.s === 'coming' && Date.now() - t0 < 5000) { setTimeout(() => this._revealWhenBuilt(id, desk, gen, t0), 100); return; }");
    const DMg = (await import(pathToFileURL(M.write('src/lib/desktop-manager.js', capped, 'r6-r-gives-up', { esm: true })).href)).DesktopManager;
    const fG6 = await r3Legs({ DM: DMg, install: install0, quiet: true, legs: ['H2'] });
    ok(fG6.some((n) => /r3 H2 \(r6 R\): …A REVEAL IS NEVER GIVEN UP WHILE THE WINDOW IS STILL COMING/.test(n)), `mutant r6-R-gives-up-while-coming (a 5 s bound that even says so): the window standing at 6.5 s is not revealed — RED (${fG6.length})`);
    const DMs = (await import(pathToFileURL(M.write('src/lib/desktop-manager.js', capped.replace(rr, '      return;').replace(rn, '    if (this._activeId !== desk && !coming) return;').replace("      const b = this._activeId !== desk ? { s: 'coming' } : this._buildState(id, desk);", "      const b = { s: 'coming' };"), 'r6-r-silent', { esm: true })).href)).DesktopManager;
    const fS6 = [...await r3Legs({ DM: DMs, install: install0, quiet: true, legs: ['H2'] }), ...await r6Legs({ DM: DMs, install: install0, quiet: true, legs: ['R2', 'R3'] })];
    ok(fS6.some((n) => /r3 H2 \(r6 R\)/.test(n)) && fS6.some((n) => n.startsWith('§11 r6 R2:')) && fS6.some((n) => n.startsWith('§11 r6 R3:')), `mutant r6-R-silent-cap (a3fb7b40e's ~5 s cap, nothing said): H2 unrevealed, the open's failure unsaid, the build with no sign of life unsaid, _revealAsk left set — RED (${fS6.length})`);
  }
  // r7: Q′ the reveal's own switch taken for the person's act (d5f74914f's switchTo: every switch but a deferred reveal's drops the
  // mark); S the open's order (revealHeldSession before the attaching check) and the copies rule; R an opener 'coming' with no grace
  {
    const DSRC7 = read('src/lib/desktop-manager.js'), LSRC7 = read('src/lib/session-lifecycle.js');
    const sq = '    if (!this._revealsSwitch(desktopId)) this._noteAct();';
    ok(DSRC7.includes(sq), 'mutant r7-Q-switch-drops: the patched line exists in desktop-manager.js');
    const DMq = (await import(pathToFileURL(M.write('src/lib/desktop-manager.js', DSRC7.replace(sq, '    if (!(this._revealAsk && this._revealAsk.desk === desktopId)) this._noteAct();'), 'r7-q-drops', { esm: true })).href)).DesktopManager;
    const fQ7 = await r7Legs({ DM: DMq, install: install0, quiet: true, legs: ['Q6', 'Q7'] });
    ok(fQ7.some((n) => n.startsWith('§12 r7 Q6:')) && fQ7.some((n) => n.startsWith('§12 r7 Q7:')), `mutant r7-Q-switch-drops (d5f74914f's switchTo — r6's _noteAct, dropFront(null), on every switch but a deferred reveal's): the reveal's own switch drops the mark, at once and behind the gate — RED (${fQ7.length}: ${fQ7.map((n) => n.slice(0, 13)).join(' | ')})`);
    const fa = "    if (this._focusPendingAttach(serverId, { replay: !!(syncId || machine) })) return null; // B-0cc8: the attach in flight IS the answer — no second frame\n";
    const rh = "    if (!(syncId || machine) && this.desktopManager?.revealHeldSession?.(serverId)) return null;\n";
    const cp = '      if (!e || this.copiesOf(desk).includes(String(e.winId || e.id))) continue;';
    ok(LSRC7.includes(fa + '    // ONE CONVERSATION') && LSRC7.includes(rh) && DSRC7.includes(cp), 'mutant r7-S: the patched lines exist in session-lifecycle.js and desktop-manager.js');
    const heldFirst = LSRC7.replace(fa, '').replace(rh, rh + fa);
    const DMc = (await import(pathToFileURL(M.write('src/lib/desktop-manager.js', DSRC7.replace(cp, '      if (!e) continue;'), 'r7-s-copies', { esm: true })).href)).DesktopManager;
    const fB7 = await r7Legs({ DM: DMc, install: await loadLifecycle(heldFirst), quiet: true, legs: ['S1', 'S2', 'S3', 'S4'] });
    ok(['S1', 'S2', 'S4'].every((k) => fB7.some((n) => n.startsWith(`§12 r7 ${k}:`))) && !fB7.some((n) => n.startsWith('§12 r7 S3:')), `mutant r7-S-held-first (d5f74914f's open: revealHeldSession before the attaching check, no copies rule): taken to a copy's desktop and told its window did not appear — RED (${fB7.length}: ${fB7.map((n) => n.slice(0, 13)).join(' | ')}); S3, the held case, green`);
    const fC7 = await r7Legs({ DM: DMc, install: install0, quiet: true, legs: ['S1', 'S2', 'S4'] });
    ok(fC7.some((n) => n.startsWith('§12 r7 S4:')), `mutant r7-S-copies-ignored (the order kept, copiesOf not consulted): past B-0cc8's 15 s the open goes to V's copy — RED (${fC7.length}: ${fC7.map((n) => n.slice(0, 13)).join(' | ')})`);
    const fH7 = await r7Legs({ install: await loadLifecycle(heldFirst), quiet: true, legs: ['S1', 'S2', 'S4'] });
    ok(fH7.length === 0, `mutant r7-S-held-first ALONE (the copies rule kept) is EQUIVALENT — every entry of a conversation with a window on this page, attaching included, is a copy, so revealHeldSession passes it over and the attaching check answers next; should copiesOf ever stop counting a window still attaching, this turns RED (${fH7.length}: ${fH7.map((n) => n.slice(0, 13)).join(' | ')})`);
    const og = "      if (o.why == null && Date.now() - o.at <= BUILD_GRACE_MS) return { s: 'coming' };";
    ok(DSRC7.includes(og), 'mutant r7-R-opener-no-grace: the patched line exists in desktop-manager.js');
    const DMr = (await import(pathToFileURL(M.write('src/lib/desktop-manager.js', DSRC7.replace(og, "      if (o.why == null) return { s: 'coming' };"), 'r7-r-no-grace', { esm: true })).href)).DesktopManager;
    const fR7 = await r7Legs({ DM: DMr, install: install0, quiet: true, legs: ['R4'] });
    ok(fR7.some((n) => n.startsWith('§12 r7 R4:')), `mutant r7-R-opener-no-grace (d5f74914f's _buildState: an opener entry with no error is 'coming' whatever its age): the never-settling opener polls for ever, nothing said — RED (${fR7.length})`);
  }
  // r8: the reveal's switch spent at its call, before the queued drain lands (Q7); the open on the desktop on show leaving the queue
  // armed (L4); 8bde36a5c's restore road — the copy restored AND the machine door's act + switch — and the copy restored alone
  {
    const DSRC8 = read('src/lib/desktop-manager.js'), LSRC8 = read('src/lib/session-lifecycle.js');
    const dm8 = async (find, repl, tag) => { ok(DSRC8.includes(find), `mutant ${tag}: the patched line exists in desktop-manager.js`); return (await import(pathToFileURL(M.write('src/lib/desktop-manager.js', DSRC8.replace(find, repl), tag, { esm: true })).href)).DesktopManager; };
    const heads = (f) => f.map((n) => n.slice(0, 16)).join(' | ');
    const land = "    if (this._restoring) { this._pendingSwitch = desktopId; return; }\n    this._revealing = null; // a switch lands: a reveal's own switch is spent — once (r8); queued, it stays the reveal's until its drain lands\n";
    const DMe = await dm8(land, "    this._revealing = null;\n    if (this._restoring) { this._pendingSwitch = desktopId; return; }\n", 'r8-r1-clear-early');
    const fE = await r7Legs({ DM: DMe, install: install0, quiet: true, legs: ['Q6', 'Q7'] });
    ok(fE.some((n) => n.startsWith('§12 r7 Q7:')) && !fE.some((n) => n.startsWith('§12 r7 Q6:')), `mutant r8-R1-clear-early (the reveal's switch spent at its call, queued or not): the drain behind the gate is taken for an act — Q7 RED, Q6 (at once) green (${fE.length}: ${heads(fE)})`);
    const DMa = await dm8('    if (desk === this._activeId) this._pendingSwitch = null;\n', '', 'r8-r4-armed');
    const fA = await r8Legs({ DM: DMa, install: install0, quiet: true, legs: ['L4', 'L4c'] });
    ok(fA.some((n) => n.startsWith('§13 r8 L4:')) && !fA.some((n) => n.startsWith('§13 r8 L4 control')), `mutant r8-R4-armed (8bde36a5c's keepInFront): the drain takes the person to Y, away from what they opened — L4 RED, its control green (${fA.length}: ${heads(fA)})`);
    const DMc = await dm8('        if (liveServerIds.has(sessionOf(ws))) { noSpec.push(winId); continue; }\n', '', 'r8-r2-restore-copy');
    const fC = await r8Legs({ DM: DMc, install: install0, quiet: true, legs: ['BS'] });
    ok(fC.some((n) => n.startsWith('§13 r8 BS:')), `mutant r8-R2-restore-copy ALONE (the visit restores S's copy; its door now only raises): BS RED by the restore (${fC.length})`);
    const door = "    if (!replay) this.desktopManager?.keepInFront?.(w.id); // a person's open: it stands — revealed now, in front of a group still forming around it (r5 O)\n    this.wm.revealWindow(w.id, { replay });\n";
    ok(LSRC8.includes(door), 'mutant r8-R2: the patched lines exist in session-lifecycle.js');
    const fB = await r8Legs({ DM: DMc, install: await loadLifecycle(LSRC8.replace(door, '    this.desktopManager?.keepInFront?.(w.id);\n    this.wm.revealWindow(w.id);\n')), quiet: true, legs: ['BS', 'BSR'] });
    ok(fB.some((n) => n.startsWith('§13 r8 BS:')) && fB.some((n) => n.startsWith('§13 r8 BSR:')), `mutant r8-R2 (8bde36a5c's road whole: the copy restored, and the machine door's act and switch): sent back to X, the reveal in flight retired unsaid — BS and BSR RED (${fB.length}: ${heads(fB)})`);
  }
  for (const r of copiesCensus(M.files, M.dir, REPO, { minCopies: 27, label: '§6 ' })) ok(r.pass, r.name, r.detail);
});


console.log(`\n${fail ? 'FAIL' : 'ALL PASS'} (${pass} passed, ${fail} failed)`);
process.exit(fail ? 1 : 0);

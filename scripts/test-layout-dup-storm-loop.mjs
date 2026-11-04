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
//      (H1 a switch, H4 a key), reveals nothing when its wait runs out (H2), fires once and silently when nothing happened (H3); mutants
//      (the page's keep, the trace, the partial restore ± the hub's chain gate, the token, the give-up) each RED
import { REPO, LIB, read, J, tick, made, toasts, toastText, S, T, CID, GB, chat, files, DESKS, TRIPLE, SINGLE, DOC, ids, sessionEntries, MODEL, loadHandler, hub, refusals, acks, RealDM, RealLM, world, switchTo, loadLifecycle, pageOn, press } from './layout-dup-world.mjs';
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
    // A LATE REVEAL NEVER TAKES THE PERSON BACK (the acceptance's probe 2): V = the group [v-h, win-v-s(S), v-slow], v-slow's
    // opener answers after `slowMs` (a file on a slow machine) or never; the page is on X and the person opens S
    const HG = ['v-h', 'win-v-s', 'v-slow'];
    const recs = () => ({ 'desk-x': [files('x-1', 1)], 'desk-y': [files('y-1', 0)], 'desk-v': [member(files('v-h', 0), HG), member(chat('win-v-s', S, 1), HG), member(files('v-slow', 2), HG)] });
    const page = (slowMs) => {
      const H = hub(handler(), DOC(recs()));
      const P = pageOn(H, install, 'desk-x', { DM, LM });
      const orig = P.app.replayOpenSpec;
      P.app.replayOpenSpec = (spec, winId) => {
        if (winId !== 'v-slow') return orig(spec, winId);
        if (slowMs != null) setTimeout(() => { const w = P.mkWin('v-slow', 'desk-v', { type: 'viewer', _openSpec: spec }); P.lm.onWindowCreated(w); }, slowMs);
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
      leg(J(at) === J(['desk-y', 'desk-y']) && reveals(P).length === 0 && toasts(t0).length === 0, `§8 r3 H1: A LATE REVEAL NEVER TAKES THE PERSON BACK — open, switch away at 1 s, the group re-forms at 3 s: nothing moves at 4 s or 7 s (ab1226ff2: back on desk-v at 4.0 s) — active ${J(at)}, reveals ${J(reveals(P))}`);
    }
    if (want('H2')) {
      const P = page(null), t0 = made.length;
      open(P); await tick(400);
      const first = P.dm.activeDesktopId;
      await tick(6200);
      leg(first === 'desk-v' && P.dm.activeDesktopId === 'desk-v' && reveals(P).length === 0 && toasts(t0).length === 0, `§8 r3 H2: …a group that never re-forms: the wait runs out and reveals NOTHING (no switch, no focus — ab1226ff2 revealed at 5 s) — active ${P.dm.activeDesktopId}, reveals ${J(reveals(P))}`);
    }
    if (want('H3')) {
      const P = page(2000), t0 = made.length;
      open(P); await tick(3500);
      const w = P.wins.get('win-v-s'), c = w && w._tabChain;
      leg(J(reveals(P)) === J([['reveal', 'win-v-s', false]]) && P.app.wm.activeWindowId === 'win-v-s' && !!c && c.tabs[c.active] === 'win-v-s' && P.dm.activeDesktopId === 'desk-v' && toasts(t0).length === 0, `§8 r3 H3: …nothing done since the open and the group re-forms at 2 s: revealed ONCE — its own tab, in front, silent (law C) — reveals ${J(reveals(P))}, chain ${J(c && { tabs: c.tabs, active: c.active })}`);
    }
    if (want('H4')) {
      const P = page(2000);
      open(P); await tick(1000);
      press('keydown'); // the person types (in the window in front, a shortcut) — an act since the open
      await tick(2500);
      leg(reveals(P).length === 0 && P.dm.activeDesktopId === 'desk-v', `§8 r3 H4: …a key the person pressed after the open retires it too — the group re-forms at 2 s and nothing is revealed — reveals ${J(reveals(P))}`);
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
    leg(J(P.ops.filter((o) => o[0] === 'reveal')) === J([['reveal', 'win-v-s', false]]) && c && c.tabs[c.active] === 'win-v-s' && P.app.wm.activeWindowId === 'win-v-s', `§9 r4 L: …a DOUBLE-CLICK renews the ask rather than retiring it — revealed ONCE when the group stands, its own tab in front (36bd0c866: the host's tab) — reveals ${J(P.ops.filter((o) => o[0] === 'reveal'))}, chain ${J(c && { tabs: c.tabs, active: c.active })}`);
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
    const findC = '      Promise.resolve(this.switchTo(desk)).then(() => this._revealWhenBuilt(id, desk, gen))';
    ok(DSRC.includes(findC), 'mutant r2-no-reveal: the patched line exists in desktop-manager.js');
    const DMc = (await import(pathToFileURL(M.write('src/lib/desktop-manager.js', DSRC.replace(findC, '      Promise.resolve(this.switchTo(desk)).then(() => null)'), 'r2-no-reveal', { esm: true })).href)).DesktopManager;
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
    const findW = "    if (waiting) { if (tries > 0) setTimeout(() => this._revealWhenBuilt(id, desk, gen, tries - 1), 100); return; }";
    ok(DSRC.includes(findW), 'mutant r3-H-giveup-reveals: the patched line exists in desktop-manager.js');
    const DMw = (await import(pathToFileURL(M.write('src/lib/desktop-manager.js', DSRC.replace(findW, "    if (waiting && tries > 0) { setTimeout(() => this._revealWhenBuilt(id, desk, gen, tries - 1), 100); return; }\n    if (!wm.windows.has(id)) return;"), 'r3-h-giveup', { esm: true })).href)).DesktopManager;
    const fW = await r3Legs({ DM: DMw, install: install0, quiet: true, legs: ['H2'] });
    ok(fW.some((n) => /the wait runs out and reveals NOTHING/.test(n)), `mutant r3-H-giveup-reveals (ab1226ff2's give-up): a group that never re-forms is revealed anyway at 5 s — RED (${fW.length})`);
  }
  // r4: I the group waits for the kept copy (36bd0c866's forget-without-rebuild) / no repair of a 'chain-disagrees'; J the chain sync
  // rebuilds from the shrunk chain (on show) / the hidden road appends the kept row; K a keep on a close (the trace ignores the
  // person's act); L retire on the first call; M the newest 50
  {
    const LSRC4 = read('src/lib/layout.js');
    const findI = "    const v = restoreVerdict(entry.tc, (id) => wm.windows.has(id), ghosts.length ? [...entry.gone, ...ghosts] : entry.gone);";
    ok(LSRC4.includes(findI), 'mutant r4-I-wait-for-kept: the patched line exists in layout.js');
    const LMi = (await import(pathToFileURL(M.write('src/lib/layout.js', LSRC4.replace(findI, "    const v = restoreVerdict(entry.tc, (id) => wm.windows.has(id), entry.gone);"), 'r4-i-wait', { esm: true })).href)).LayoutManager;
    const fI = await r4Legs({ LM: LMi, quiet: true, legs: ['I'] });
    ok(fI.some((n) => /A SHOWS the record's group around the members it builds/.test(n)), `mutant r4-I-wait-for-kept (36bd0c866: the group waits for a copy the page never builds): A shows v-h and v-g loose — RED (${fI.length})`);
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
    const findL = "    if (this._activeId !== desk && !coming) return;";
    ok(DSRC.includes(findL), 'mutant r4-L-retire-first-call: the patched line exists in desktop-manager.js');
    const DMl = (await import(pathToFileURL(M.write('src/lib/desktop-manager.js', DSRC.replace(findL, '    if (this._activeId !== desk) return;'), 'r4-l-first-call', { esm: true })).href)).DesktopManager;
    const fL = await r4Legs({ DM: DMl, install: install0, quiet: true, legs: ['L'] });
    ok(fL.some((n) => /L \(gap 300 ms\): A REVEAL WAITS FOR THE SWITCH IT ASKED FOR/.test(n)), `mutant r4-L-retire-first-call (36bd0c866: the reveal retires while its own switch is queued): the host's tab at gap 300 — RED (${fL.length})`);
    const fM = await r4Legs({ over: { noteDupsLeft: (t, o = {}) => ND(t, o).slice(-50) }, quiet: true, legs: ['M'] });
    ok(fM.some((n) => /THE TRACE IS NEVER CUT BY COUNT/.test(n)), `mutant r4-M-fifo-50 (36bd0c866's DUP_TRACE_CAP): B closes the ten oldest copies it shows — RED (${fM.length})`);
  }
  for (const r of copiesCensus(M.files, M.dir, REPO, { minCopies: 12, label: '§6 ' })) ok(r.pass, r.name, r.detail);
});


console.log(`\n${fail ? 'FAIL' : 'ALL PASS'} (${pass} passed, ${fail} failed)`);
process.exit(fail ? 1 : 0);

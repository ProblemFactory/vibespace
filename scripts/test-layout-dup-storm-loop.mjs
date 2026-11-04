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
import { REPO, LIB, read, J, tick, made, toasts, toastText, S, T, CID, GB, chat, files, DESKS, TRIPLE, SINGLE, DOC, ids, sessionEntries, MODEL, loadHandler, hub, refusals, acks, RealDM, RealLM, world, switchTo, loadLifecycle, pageOn } from './layout-dup-world.mjs';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
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
  for (const r of copiesCensus(M.files, M.dir, REPO, { minCopies: 3, label: '§6 ' })) ok(r.pass, r.name, r.detail);
});


console.log(`\n${fail ? 'FAIL' : 'ALL PASS'} (${pass} passed, ${fail} failed)`);
process.exit(fail ? 1 : 0);

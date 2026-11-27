#!/usr/bin/env node
// test-resume-pages-follow.mjs — the manager design's piece 4 (主开发 2026-11-17): THE PAGES FOLLOW. A conversation resumed by
// something no person pressed on this page (an agent's conversations.resume) shows up RUNNING in the live list every page already
// receives (sidebar.js `active-sessions` — no new frame); a page whose window shows that conversation ENDED turns it live IN ITS ROW
// — the same window id, box and desktop — QUIETLY (drawn, never focused, no desktop switch). The real session-lifecycle (bundled
// with its imports stubbed — layout-dup-world's loadLifecycle) on the real LayoutManager / DesktopManager over a fake app wired to
// the real ws-handler (layouts.json in memory). No hub process, no browser.
//   ① page B holds the ENDED window: the list shows the conversation running ⇒ that window is live in its row (same id, box,
//      desktop), drawn quiet, no switch, one window of the conversation; at most ONE layout-sync for it and none after it settled.
//      RED CONTROL: the follow off (a patched lifecycle) ⇒ the window stays read-only
//   ② page A on another desktop with no row of it: no window is made, no switch, no sync (the hub never picks a desktop)
//   ③ the first list a page hears is its BASELINE (a load's replay attaches what runs); a resume this page has in flight is its own
//   ④ a view of the conversation somebody opened on purpose (live, not read-only) is not touched — CONTROL: the same window
//      read-only is re-opened (the probe sees a touch)
//   ⑥ THE FOLLOW IS QUIET (the cure round's must 3): the active window stays the active one, the stacking is CARRIED (never raised),
//      a phone's open sidebar stays, a slow attach is a log line; when the ended row WAS the active window the follow puts the focus
//      back on it (as the person's own resume does); attachSession's late focus is guarded like createSession's
//   ⑤ the wiring: sidebar.js's live-list handler asks the follow; the For-you reply's reopen and the follow share ONE row loop
import fs from 'node:fs';
import path from 'node:path';
import { REPO, J, tick, S, CID, DOC, hub, loadHandler, pageOn, loadLifecycle, files, chat } from './layout-dup-world.mjs';
import { checker } from './lib/check.mjs';

const { ok, counts } = checker();   // B-119d: THE ONE checker (scripts/lib/check.mjs) — a condition is a boolean, a name a string, else it throws
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
const NEW = 'sess-77-52000';   // the session the resume made (its conversation is CID — the ended window's)
const OTHER = { id: 'sess-1-1', backend: 'claude', backendSessionId: 'c0de0000-0000-4000-8000-000000000001', name: 'other', cwd: '/srv/o', mode: 'chat' };
const RUNNING = { id: NEW, backend: 'claude', backendSessionId: CID, name: 'Atlas notes', cwd: '/srv/u/atlas', mode: 'chat' };

/** a page on desktop `on` over the records; the session window of S is ENDED (read-only) unless `live` */
function page(install, { on = 'desk-v', recs = { 'desk-x': [files('x-1', 1)], 'desk-v': [files('v-1', 0), chat('win-v-s', S, 2)] }, live = false, H = null } = {}) {
  const hb = H || hub(loadHandler(), DOC(recs), { alive: [] });
  const P = pageOn(hb, install, on, { attachMs: 60000 });
  class Life {} install(Life);
  for (const k of ['_snapshotWinBounds', '_reopenRowOf', '_followResumed', '_attachInRow', '_reopenWin', '_closeSecondView', '_markResume', '_pendingResumeWin', 'attachSession', '_winIs', '_closeFenced', '_fenceSays']) if (Life.prototype[k]) P.app[k] = Life.prototype[k].bind(P.app);   // stale-pins: kept — _closeSecondView lives in src/lib/session-lifecycle.js (this copies SessionLifecycle's methods); only src/lib/user-todos-actions.js lost the token (the manager design's piece 4)
  Object.assign(P.app, { isMobile: false });
  const w = P.wins.get('win-v-s');
  if (w && !live) w._readOnly = true;   // a STOPPED conversation's window: its read-only history (the boot restore's view)
  P.made = [];
  const cw = P.app.wm.createWindow;
  P.app.wm.createWindow = (o) => { P.made.push({ id: o.syncId || null, quiet: !!o.quiet, serverId: o.openSpec && o.openSpec.serverId }); return cw(o); };
  P.focus = []; P.app.wm.focusWindow = (id) => P.focus.push(id);
  P.sidebarClosed = 0; P.app._closeSidebarOnMobile = () => { P.sidebarClosed++; };
  P.H = hb;
  return P;
}
const ofConv = (P) => [...P.wins.values()].filter((w) => w._openSpec && w._openSpec.backendSessionId === CID);

const install = await loadLifecycle();

console.log('— ① page B holds the ENDED window: it turns live in its row, quietly');
{
  const B = page(install);
  const before = B.wins.get('win-v-s');
  const box = J(before.gridBounds), desk = B.dm.activeDesktopId;
  const s0 = B.syncs('desk-v').length;
  const n0 = B.app._followResumed([OTHER]);   // the page's first list: its baseline
  const n1 = B.app._followResumed([OTHER, RUNNING]);   // the conversation now runs (resumed by a key, not on this page)
  const after = B.wins.get('win-v-s'), view = B.app.sessions.get('win-v-s');
  ok(n0 === 0 && n1 === 1 && !!after && after._openSpec.serverId === NEW && after._openSpec.backendSessionId === CID, `① the list shows it running ⇒ ITS window turned live in its row (win-v-s now shows ${after && after._openSpec.serverId})`, { n0, n1, spec: after && after._openSpec });
  ok(!!after && after._desktopId === 'desk-v' && J(after.gridBounds) === box && B.dm.activeDesktopId === desk, '① …the same id, box and desktop; the page did not switch desktops', { desk: after && after._desktopId, box: after && after.gridBounds, was: box });
  ok(B.made.length === 1 && B.made[0].id === 'win-v-s' && B.made[0].quiet === true && B.focus.length === 0, '① …drawn QUIET (createWindow asked quiet), never focused', { made: B.made, focus: B.focus });
  ok(ofConv(B).length === 1 && !(view && view._readOnly), `① one window of the conversation (${ofConv(B).length}), no longer read-only`);
  await tick(900);
  const s1 = B.syncs('desk-v').length;
  B.app._followResumed([OTHER, RUNNING]);   // the next lists say the same: nothing more happens
  B.app._followResumed([RUNNING, OTHER]);
  await tick(900);
  const s2 = B.syncs('desk-v').length;
  ok(s1 - s0 <= 1 && s2 === s1 && B.made.length === 1, `① no ping-pong: ${s1 - s0} layout-sync for the re-key, ${s2 - s1} after it settled; no second window`, { s0, s1, s2 });
  // RED CONTROL: the follow off (a patched lifecycle whose follow does nothing) — the window stays on its history
  const src = read('src/lib/session-lifecycle.js');
  const off = src.replace('  _followResumed(sessions) {\n', '  _followResumed(sessions) { return 0;\n');
  ok(off !== src, '① (the follow-off patch applied)');
  const C = page(await loadLifecycle(off));
  C.app._followResumed([OTHER]); C.app._followResumed([OTHER, RUNNING]);
  const cw = C.wins.get('win-v-s');
  ok(!!cw && cw._readOnly === true && cw._openSpec.serverId === S && C.made.length === 0, '① RED CONTROL: the follow off — the window stays read-only on the ended session', cw && { ro: cw._readOnly, sid: cw._openSpec.serverId });
}

console.log('— ② page A on another desktop with no row of it');
{
  const A = page(install, { on: 'desk-x' });
  const s0 = A.syncs().length;
  A.app._followResumed([OTHER]);
  const n = A.app._followResumed([OTHER, RUNNING]);
  await tick(700);
  ok(n === 0 && A.made.length === 0 && ofConv(A).length === 0 && A.dm.activeDesktopId === 'desk-x' && A.syncs().length === s0, '② no window of it on this page ⇒ nothing is made, no desktop switch, no layout-sync', { n, made: A.made, desk: A.dm.activeDesktopId, syncs: A.syncs().length - s0 });
}

console.log('— ③ the baseline, and this page\'s own resume');
{
  const B = page(install);
  const first = B.app._followResumed([OTHER, RUNNING]);   // a page that LOADS while it runs: its replay attaches what runs
  ok(first === 0 && B.made.length === 0 && B.wins.get('win-v-s')._openSpec.serverId === S, '③ the first list a page hears is its baseline — nothing re-opened by the follow', { first });
  const P = page(install);
  P.app._followResumed([OTHER]);
  P.app._resumeWins = new Map([[`claude:${CID}`, P.wins.get('win-v-s')]]);   // a person pressed Resume on THIS page: its create is in flight
  P.app._winIs = () => true;
  const n = P.app._followResumed([OTHER, RUNNING]);
  ok(n === 0 && P.made.length === 0, '③ a resume this page has in flight is its own (its create\'s answer opens it) — the follow leaves it', { n });
}

console.log('— ④ a view somebody opened on purpose is not touched');
{
  const V = page(install, { live: true });
  const w = V.wins.get('win-v-s');
  V.app._followResumed([OTHER]);
  const n = V.app._followResumed([OTHER, RUNNING]);
  ok(n === 0 && V.made.length === 0 && V.wins.get('win-v-s') === w && V.closed.length === 0, '④ a LIVE window of the conversation (not read-only) is not re-opened, not closed', { n, closed: V.closed });
  const R = page(install);
  R.app._followResumed([OTHER]);
  ok(R.app._followResumed([OTHER, RUNNING]) === 1 && R.closed.includes('win-v-s'), '④ CONTROL: the same window READ-ONLY is re-opened (its row closed and drawn again)', { closed: R.closed });
}

console.log('— ⑥ THE FOLLOW IS QUIET');
{
  // the person works in another window on the follow's desktop (v-1, active, on top); the ended row sits UNDER it
  const B = page(install);
  B.app.wm.activeWindowId = 'v-1';
  B.wins.get('v-1').element.style.zIndex = '120'; B.wins.get('win-v-s').element.style.zIndex = '105';
  B.app._followResumed([OTHER]); B.app._followResumed([OTHER, RUNNING]);
  const w = B.wins.get('win-v-s');
  ok(B.app.wm.activeWindowId === 'v-1' && B.focus.length === 0, '⑥ the active window STAYS the active one (v-1), nothing focused', { active: B.app.wm.activeWindowId, focus: B.focus });
  ok(!!w && Number(w.element.style.zIndex) === 105 && Number(B.wins.get('v-1').element.style.zIndex) > Number(w.element.style.zIndex), '⑥ the stacking is CARRIED: the followed row keeps its place under the window the person works in (never raised)', { row: w && w.element.style.zIndex, top: B.wins.get('v-1').element.style.zIndex });
  ok(B.sidebarClosed === 0, '⑥ a phone\'s open sidebar stays (a quiet attach closes nothing)', B.sidebarClosed);
  const src = read('src/lib/session-lifecycle.js'), noZ = src.replace("{ endedOnly: true, carryZ: true }", "{ endedOnly: true, carryZ: false }");
  ok(noZ !== src, '⑥ (the carry-off patch applied)');
  const Z = page(await loadLifecycle(noZ));
  Z.app.wm.activeWindowId = 'v-1'; Z.wins.get('v-1').element.style.zIndex = '120'; Z.wins.get('win-v-s').element.style.zIndex = '105';
  Z.app._followResumed([OTHER]); Z.app._followResumed([OTHER, RUNNING]);
  ok(Number(Z.wins.get('win-v-s').element.style.zIndex) !== 105, '⑥ RED CONTROL: the follow without the carry — the row comes back with the new window\'s stacking, not its own', Z.wins.get('win-v-s').element.style.zIndex);
  // the ended row WAS the person's active window: STILL quiet in everything, and ONE separate step gives it the focus back
  const A = page(install);
  A.app.wm.activeWindowId = 'win-v-s';
  A.app._followResumed([OTHER]); A.app._followResumed([OTHER, RUNNING]);
  ok(A.made.length === 1 && A.made[0].id === 'win-v-s' && A.made[0].quiet === true && A.sidebarClosed === 0 && A.ops.filter((o) => o[0] === 'reveal').map((o) => o[1]).join() === 'win-v-s' && A.app.wm.activeWindowId === 'win-v-s' && A.dm.activeDesktopId === 'desk-v',
    '⑥ the ended row WAS the active window ⇒ re-opened QUIET (no sidebar closed, no toast) and only the focus given back to it — revealed as itself (wm.revealWindow), on its own desktop, as the person\'s own resume does', { made: A.made, ops: A.ops, sidebar: A.sidebarClosed });
  const src0 = read('src/lib/session-lifecycle.js');
  const loud = src0.replace("hostId: s.host || undefined, quiet: true });\n        if (wasShown && win) this.wm.revealWindow(win.id);", "hostId: s.host || undefined, quiet: !wasShown });\n        if (false && win) this.wm.revealWindow(win.id);");
  ok(loud !== src0, '⑥ (the quiet-off patch applied)');
  const L = page(await loadLifecycle(loud));
  L.app.wm.activeWindowId = 'win-v-s';
  L.app._followResumed([OTHER]); L.app._followResumed([OTHER, RUNNING]);
  ok(!!(L.made[0]) && L.made[0].quiet === false && L.sidebarClosed === 1, '⑥ RED CONTROL: the old shape (quiet turned off for the active row) — a phone\'s open sidebar closes under the finger', { made: L.made, sidebar: L.sidebarClosed });
  const sl = read('src/lib/session-lifecycle.js');
  const att = sl.slice(sl.indexOf('  attachSession(serverId, name, cwd, {'), sl.indexOf('  attachTmuxSession('));
  // B-c87d: the late focus goes through THE door with its window and the open's start (renewed when a pending attach is raised — round
  // wpjhw23eh) — still guarded by `quiet` as createSession's is
  ok((att.match(/if \(!quiet \|\| this\.wm\.activeWindowId === winInfo\.id\) lateFocus\((chatView|term), \{ win: winInfo, since: winInfo\._lateFocusSince \?\? openAt \}\);/g) || []).length === 2 && !/\n\s*lateFocus\((chatView|term)[,)]/.test(att) && /if \(!quiet\) this\._closeSidebarOnMobile\(\);/.test(att)
    && (att.match(/if \(quiet\) \{ console\.log\(`\[attach\]/g) || []).length === 2, '⑥ attachSession: both late focus calls guarded as createSession\'s are (a quiet attach never takes the caret), the phone sidebar left open, the slow-attach words logged — never a toast');
}

console.log('— ⑤ the wiring');
{
  const sb = read('src/lib/sidebar.js'), uta = read('src/lib/user-todos-actions.js'), sl = read('src/lib/session-lifecycle.js');
  ok(/if \(msg\.type === 'active-sessions'\) \{ this\._webuiSessions = msg\.sessions; this\._mergeAndRender\(\); patchStashHints\(this\.listEl, msg\.sessions\); try \{ this\._followPins\(msg\.sessions\); \} catch \{ \} try \{ this\.app\?\._followResumed\?\.\(msg\.sessions\); \} catch \{ \} \}/.test(sb), 'sidebar.js: the live list every page receives asks the follow (no new frame; B-2083\'s carrier follow rides the same list)');
  ok(/row = app\._reopenRowOf\(c, r\.sessionId\)/.test(uta) && !/for \(const \[winId, term\] of \[\.\.\.app\.sessions\]\)/.test(uta) && (sl.match(/\} else this\._closeSecondView\(winId, \{ backend: c\.backend \|\| 'claude', cid: c\.backendSessionId \}\);/g) || []).length === 1,   // stale-pins: kept — a deliberate «gone» check: piece 4 took the walk over app.sessions out of user-todos-actions.js
    'the For-you reply\'s reopen and the follow share ONE row loop (_reopenRowOf) — not a copy');
}

console.log(`\n${counts.pass} passed, ${counts.fail} failed`);
process.exit(counts.fail ? 1 : 0);

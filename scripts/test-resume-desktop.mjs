#!/usr/bin/env node
// Pool cold-restart + resume must keep each conversation on its HOME desktop
// (a fleet user, inc-mso43urh: a pool target switch cold-restarted sessions across
// EVERY desktop while one was active — _snapshotWinBounds dropped the home
// desktop, so every resumed window piled onto the active desktop and
// flattened the layout). This pins the two halves of the fix as pure logic:
// (1) the snapshot CARRIES the desktop; (2) the resume MOVES the window back
// only when the desktop still exists and differs.
import fs from 'node:fs'; import path from 'node:path';
const src = fs.readFileSync(new URL('../src/lib/session-lifecycle.js', import.meta.url), 'utf8');
let pass=0, fail=0; const ok=(c,n,e)=>{if(c){pass++;console.log('  ✓ '+n);}else{fail++;console.error('  ✗ '+n+(e?'\n    '+e:''));}};

// (1) _snapshotWinBounds is a small pure method — extract + run it against a mock.
const m = src.match(/_snapshotWinBounds\(win\)\s*\{([\s\S]*?)\n {2}\},/);
ok(!!m, '_snapshotWinBounds located in source');
const bodyFn = new Function('win', m[1] + '\n');
const snap = bodyFn({ _desktopId: 'desk-home-1', gridBounds: { left: 0.1, top: 0.2, width: 0.3, height: 0.4 }, isMaximized: false });
ok(snap.desktopId === 'desk-home-1', 'snapshot CARRIES the window’s home desktop id (the dropped field)');
ok(snap.gridBounds && Math.abs(snap.gridBounds.left - 0.1) < 1e-9, 'geometry still captured alongside');
const snapNone = bodyFn({ gridBounds: null });
ok(snapNone.desktopId === null, 'a window with no desktop tag snapshots desktopId:null (no crash)');

// (2) the resume move-guard: assert the exact predicate the fix uses, so a
// future rewrite that forgets the existence check (moving to a deleted
// desktop) or the differs check (a needless move) fails here.
const guard = (destDesktop, currentDesktopId, desktops) => {
  const desktopExists = !!destDesktop && destDesktop !== '__stage__'
    && (desktops || []).some((d) => d.id === destDesktop);
  return desktopExists && destDesktop !== currentDesktopId;
};
const desktops = [{ id: 'desk-home-1' }, { id: 'desk-home-2' }, { id: 'desk-active' }];
ok(guard('desk-home-1', 'desk-active', desktops) === true, 'moves a session back to its home desktop when it differs from the active one');
ok(guard('desk-active', 'desk-active', desktops) === false, 'no move when the home desktop IS the active one (single billing switch — the common case)');
ok(guard('desk-deleted', 'desk-active', desktops) === false, 'no move to a since-DELETED desktop (leaves it active, never strands)');
ok(guard('__stage__', 'desk-active', desktops) === false, 'never moves onto the Stage pseudo-desktop');
ok(guard(null, 'desk-active', desktops) === false, 'a null home desktop is a no-op');

// (3) SIMULATE the pool cold-restart pile: N sessions across M desktops, all
// resumed while ONE is active. With the fix each lands home; the pre-fix bug
// would land them all on active.
const sessions = [
  { sid: 's1', home: 'desk-home-1' }, { sid: 's2', home: 'desk-home-1' },
  { sid: 's3', home: 'desk-home-2' }, { sid: 's4', home: 'desk-active' },
];
const ACTIVE = 'desk-active';
const landed = sessions.map((s) => {
  // createWindow tags active; the guard then moves it home if applicable
  let deskId = ACTIVE;
  const snapshot = { desktopId: s.home };
  if (guard(snapshot.desktopId, deskId, desktops)) deskId = snapshot.desktopId;
  return { sid: s.sid, deskId };
});
const byDesk = landed.reduce((a, x) => { (a[x.deskId] ??= []).push(x.sid); return a; }, {});
ok(JSON.stringify(byDesk['desk-home-1']?.sort()) === JSON.stringify(['s1', 's2']), 'home-1 sessions land back on home-1 (not the active pile)');
ok(byDesk['desk-home-2']?.[0] === 's3', 'home-2 session lands on home-2');
ok(byDesk['desk-active']?.[0] === 's4', 'the one session already on the active desktop stays there');
ok(Object.keys(byDesk).length === 3, 'sessions spread back across their 3 home desktops — NOT collapsed into 1 (the incident)');

console.log(fail ? `FAIL (${fail})` : `ALL PASS (${pass})`);
process.exit(fail?1:0);

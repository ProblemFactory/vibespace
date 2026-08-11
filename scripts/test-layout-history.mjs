#!/usr/bin/env node
// Layout rollback points (2.296.0). A layout-destroying bug was previously
// unrecoverable: sessions survive, but WHERE they lived is gone, and when the
// damage EMPTIES a desktop even the mapping needed to rebuild it is gone
// (the real incident: two desktops emptied, their windows unidentifiable).
// Every layout write now leaves the previous SHAPE on disk. This drives the
// real persistence module over a temp data dir.
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass=0, fail=0; const ok=(c,n,e)=>{if(c){pass++;console.log('  ✓ '+n);}else{fail++;console.error('  ✗ '+n+(e?'\n    '+e:''));}};

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-lh-'));
const { router, setup } = require(REPO + '/src/routes/persistence.js');
setup({ dataDir, wss: { clients: new Set() }, WS_OPEN: 1, getSyncStore: () => null, activeSessions: new Map(), auth: null });
const { readLayouts, writeLayouts, flushLayouts, listLayoutHistory } = router;

const lay = (map) => ({
  desktopMeta: Object.keys(map).map((id) => ({ id, name: id.toUpperCase() })),
  desktops: Object.fromEntries(Object.entries(map).map(([d, ids]) => [d, { autoSave: { windows: ids.map((i) => ({ winId: i, type: 'chat', title: 'w' + i, openSpec: { backendSessionId: 'sid-' + i } })) } }])),
});

// THE PRODUCTION PATTERN (this test originally passed for the WRONG reason):
// every real caller does readLayouts() -> mutate the LIVE object -> write it
// back (ws layout-sync, desktop create/delete/rename, /api/layouts-autosave).
// Handing writeLayouts a FRESH object — as the first version of this test did
// — hides the aliasing bug entirely, so mutate() is used everywhere below.
// Snapshots are written on a setImmediate (they must NOT sit on the
// layout-sync hot path), so a synchronous read right after a write races them.
// Yielding two macrotask turns is the contract every caller gets.
const tick = () => new Promise((r) => setImmediate(() => setImmediate(r)));
const mutate = async (fn) => { const d = readLayouts(); fn(d); writeLayouts(d); await tick(); };
const seed = lay({ a: ['w1', 'w2'], b: ['w3'], c: ['w4'] });
writeLayouts(seed);
await tick();
ok(listLayoutHistory().length === 0, 'the first write creates no rollback point (nothing existed to preserve)');

// pure GEOMETRY churn must NOT evict rollback points (a drag would otherwise
// burn the whole ring in seconds)
await mutate((d) => { d.desktops.a.autoSave.windows[0].gridBounds = { left: 0.5, top: 0.5, width: 0.2, height: 0.2 }; });
ok(listLayoutHistory().length === 0, 'geometry-only change writes NO rollback point (shape unchanged)');

// THE INCIDENT SHAPE, produced the way production produces it: mutate the
// live object (move every window onto `a`, empty b and c) and write it back.
await mutate((d) => {
  const moved = [...d.desktops.b.autoSave.windows, ...d.desktops.c.autoSave.windows];
  d.desktops.a.autoSave.windows.push(...moved);
  d.desktops.b.autoSave.windows = [];
  d.desktops.c.autoSave.windows = [];
});
const hist = listLayoutHistory();
ok(hist.length === 1, 'a shape change (the collapse) writes exactly one rollback point');
ok(hist[0].totalWindows === 4, 'the rollback point records the window count it holds');
ok(JSON.stringify(hist[0].summary) === JSON.stringify({ A: 2, B: 1, C: 1 }), 'summary names desktops and their window counts — readable without opening the file');

// and it holds the PRE-damage mapping — the exact thing the real incident lacked
const raw = JSON.parse(fs.readFileSync(path.join(dataDir, 'layout-history', hist[0].id), 'utf8'));
const homeOf = {};
for (const [d, v] of Object.entries(raw.layouts.desktops)) for (const w of v.autoSave.windows) homeOf[w.winId] = d;
ok(homeOf.w3 === 'b' && homeOf.w4 === 'c', 'the rollback point knows which EMPTIED desktop each window came from (the unrecoverable bit)');

// restore path (the route's logic, exercised through the module)
writeLayouts(raw.layouts); flushLayouts();
await tick();
const back = readLayouts();
ok((back.desktops.b.autoSave.windows || []).length === 1 && (back.desktops.c.autoSave.windows || []).length === 1, 'restoring puts the windows back on their home desktops');
ok(listLayoutHistory().length === 2, 'restoring is ITSELF undoable (the damaged state became a rollback point)');

// bound
for (let i = 0; i < 45; i++) await mutate((d) => { d.desktops.a.autoSave.windows = Array.from({ length: (i % 7) + 1 }, (_, k) => ({ winId: 'x' + i + '-' + k })); });
ok(listLayoutHistory().length <= 40, `history is bounded (${listLayoutHistory().length} ≤ 40)`);
// TIERED retention: a 45-write storm must NOT evict the pre-storm points —
// they are the only ones worth having when the storm IS the damage.
{
  const all = listLayoutHistory();
  const oldest = all[all.length - 1];
  const raw0 = JSON.parse(fs.readFileSync(path.join(dataDir, 'layout-history', oldest.id), 'utf8'));
  const ids0 = Object.values(raw0.layouts.desktops || {}).flatMap((v) => (v.autoSave.windows || []).map((w) => w.winId));
  ok(ids0.some((i) => /^w\d/.test(i)), 'the PRE-storm rollback point survived a 45-change burst (tiered retention, not flat newest-N)');
}
ok(listLayoutHistory()[0].at >= listLayoutHistory()[listLayoutHistory().length - 1].at, 'newest first');

// LEGACY instances (no virtual desktops): windows live in the top-level
// autoSave — a rollback point must still count them, or every entry reads
// "0 windows" for exactly the users who have no desktops to reason about.
writeLayouts({ autoSave: { windows: [{ winId: 'L1' }, { winId: 'L2' }] } });
await tick();
await mutate((d) => { d.autoSave.windows = [{ winId: 'L1' }]; });
const legacy = listLayoutHistory()[0];
ok(legacy.totalWindows === 2, `legacy top-level layout counted in the rollback point (${legacy.totalWindows})`);

// THE ALIASING REGRESSION (adversarial review, critical): the rollback point
// must hold the PRE-change mapping. With the live cache snapshotted it held
// the already-damaged one, i.e. restoring re-applied the collapse.
{
  const collapse = listLayoutHistory().slice(-1)[0]; // oldest = the incident-shape snapshot
  const rawC = JSON.parse(fs.readFileSync(path.join(dataDir, 'layout-history', collapse.id), 'utf8'));
  const map = {};
  for (const [d2, v] of Object.entries(rawC.layouts.desktops || {})) for (const w of (v.autoSave.windows || [])) map[w.winId] = d2;
  ok(map.w3 === 'b' && map.w4 === 'c', 'the rollback point holds the PRE-change mapping even when the caller mutated the live object (the critical aliasing bug)');
}

// COLD-CACHE RESTORE (adversarial review, major): a restore issued before
// anything read layouts (server restarted, tab still open) must still leave a
// rollback point — the dialog promises the restore is undoable.
{
  const dd = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-lh2-'));
  fs.writeFileSync(path.join(dd, 'layouts.json'), JSON.stringify(lay({ a: ['k1', 'k2'], b: ['k3'] })));
  delete require.cache[require.resolve(REPO + '/src/routes/persistence.js')];
  const p2 = require(REPO + '/src/routes/persistence.js');
  p2.setup({ dataDir: dd, wss: { clients: new Set() }, WS_OPEN: 1, getSyncStore: () => null, activeSessions: new Map(), auth: null });
  // simulate the restore handler's own first action on a COLD cache
  p2.router.readLayouts();
  p2.router.writeLayouts(lay({ a: ['k1'], b: [] }));
  p2.router.flushLayouts();
  await tick();
  const h = p2.router.listLayoutHistory();
  ok(h.length === 1 && h[0].totalWindows === 3, `a write on a COLD cache still writes a rollback point of the on-disk state (${h[0]?.totalWindows} windows)`);
  fs.rmSync(dd, { recursive: true, force: true });
}

fs.rmSync(dataDir, { recursive: true, force: true });
console.log(fail ? `FAIL (${fail})` : `ALL PASS (${pass})`);
process.exit(fail?1:0);

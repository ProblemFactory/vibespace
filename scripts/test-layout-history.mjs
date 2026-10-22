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
// userW inc-mun7qjmw-iksh (lane desktop-move): the point also names WHAT CHANGED right after it — the row a loss follows
// is the one to restore, and every row used to read the same "N windows — A 2 · B 1 · …"
ok(JSON.stringify(hist[0].change) === JSON.stringify([['A', 2, 4], ['B', 1, 0], ['C', 1, 0]]), 'the point names the change that FOLLOWED it — per desktop whose window set changed, [name, before, after] ("B 1 → 0")', JSON.stringify(hist[0].change));
ok(/const change = Array\.isArray\(e\.change\) && e\.change\.length[\s\S]{0,200}`\$\{n \|\| t\('Desktop'\)\} \$\{a\} → \$\{b\}`[\s\S]{0,700}escHtml\(t\('Then: \{changes\}', \{ changes: change \}\)\)/.test(fs.readFileSync(path.join(REPO, 'src/lib/setup-flows.js'), 'utf8')), 'the Restore dialog draws it under the row ("Then: HR 3 → 1"), escaped');

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

// THE RING NAMES WHAT IT SAW (lane layout-stale-record-sync — the owner's 2026-10-22 loss read «工作 5 → 0» on a point that
// named neither the writer nor anything refused): the ws layout-sync handler notes each write (`wrote`: the desktop, the
// writer's viewport, its evidence by reason, its base) and each refusal through writeLayouts.note; the next point's meta
// carries `writer` and `refused`. And A RESTORE OUTRANKS EVERY LIVE CLIENT: the restore door stamps each restored record NOW
// (above the one it replaces — a page that slept through it is refused by the staleness gate) and its points name it.
{
  const dd = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-lh3-'));
  delete require.cache[require.resolve(REPO + '/src/routes/persistence.js')];
  const p3 = require(REPO + '/src/routes/persistence.js');
  const heard = [];
  p3.setup({ dataDir: dd, wss: { clients: new Set([{ readyState: 1, send: (s) => heard.push(JSON.parse(s)) }]) }, WS_OPEN: 1, getSyncStore: () => null, activeSessions: new Map(), auth: null });
  const R3 = p3.router, W3 = R3.writeLayouts;
  const stamped = (map, at) => { const d = lay(map); for (const v of Object.values(d.desktops)) v.autoSave.updatedAt = at; return d; };
  W3(stamped({ work: ['k1', 'k2', 'k3', 'k4', 'k5'], res: ['r1'] }, 1000)); await tick();
  ok(typeof W3.note === 'function', 'writeLayouts.note exists — the ws handler\'s door to the ring (a property: the ws ctx contract hands writeLayouts alone)');
  W3.note({ refused: 'stale', desktopId: 'work', viewport: 'phone', base: 900, held: 1000, windows: [5, 4] });
  W3.note({ refused: 'shrink-without-close', desktopId: 'work', viewport: 'desktop', n: 5, live: 5 });
  const m1 = R3.readLayouts(); m1.desktops.work.autoSave.windows = []; m1.desktops.work.autoSave.updatedAt = 2000;
  W3.note({ wrote: 'work', viewport: 'desktop', windows: 0, evidence: { unbuilt: 5 }, base: 1000 });
  W3(m1); await tick();
  const h1 = R3.listLayoutHistory()[0];
  const meta1 = JSON.parse(fs.readFileSync(path.join(dd, 'layout-history', h1.id.replace(/\.json$/, '.meta.json')), 'utf8'));
  ok(h1.writer && h1.writer.wrote === 'work' && h1.writer.viewport === 'desktop' && h1.writer.evidence.unbuilt === 5 && h1.writer.base === 1000 && typeof h1.writer.at === 'number' && JSON.stringify(meta1.writer) === JSON.stringify(h1.writer), 'a point\'s meta names the WRITE that made it — the desktop, the writer\'s viewport, its evidence by reason (unbuilt 5), its base — in the sidecar and the listing', JSON.stringify(h1.writer));
  ok(Array.isArray(h1.refused) && h1.refused.length === 2 && h1.refused[0].refused === 'stale' && h1.refused[0].viewport === 'phone' && h1.refused[1].refused === 'shrink-without-close' && h1.refused[1].live === 5, '…and the REFUSALS since the last point (the stale phone write, the belt\'s live-unbuilt refusal) with their viewport', JSON.stringify(h1.refused));
  const m2 = R3.readLayouts(); m2.desktops.work.autoSave.windows = [{ winId: 'k9' }]; W3(m2); await tick();
  const h2 = R3.listLayoutHistory()[0];
  ok(h2.id !== h1.id && !h2.writer && !h2.refused, '…a write that noted nothing (a preset, an import) names nobody, and the refusals are told once', JSON.stringify(h2));
  // the restore door (the real route handler)
  const route = R3.stack.find((l) => l.route && l.route.path === '/api/layout-history/:id/restore');
  const target = R3.listLayoutHistory().find((h) => h.id === h1.id);
  const before = R3.readLayouts().desktops.work.autoSave.updatedAt || 0;
  const t0 = Date.now(); let answer = null;
  await route.route.stack[0].handle({ params: { id: target.id } }, { json: (j) => { answer = j; }, status: () => ({ json: (j) => { answer = j; } }) });
  await tick();
  const back = R3.readLayouts();
  ok(answer && answer.success && (back.desktops.work.autoSave.windows || []).length === 5, 'the restore door puts 工作\'s five back', JSON.stringify(answer));
  ok(back.desktops.work.autoSave.updatedAt >= t0 && back.desktops.work.autoSave.updatedAt > before && back.desktops.res.autoSave.updatedAt >= t0, `A RESTORE OUTRANKS EVERY LIVE CLIENT: each restored record is stamped NOW (${back.desktops.work.autoSave.updatedAt} ≥ ${t0}, above the replaced ${before}) — the point's own stamp (1000) never comes back`, JSON.stringify({ work: back.desktops.work.autoSave.updatedAt, res: back.desktops.res.autoSave.updatedAt }));
  const points = R3.listLayoutHistory().slice(0, 2);
  ok(points.length === 2 && points.every((p) => p.writer && p.writer.via === 'restore' && p.writer.from === target.id), 'the restore\'s points (the forced one and its write\'s) name the restore and the point it came from', JSON.stringify(points.map((p) => p.writer)));
  ok(heard.some((m) => m.type === 'layout-restored'), 'every client is told (layout-restored)');
  fs.rmSync(dd, { recursive: true, force: true });
}

fs.rmSync(dataDir, { recursive: true, force: true });
console.log(fail ? `FAIL (${fail})` : `ALL PASS (${pass})`);
process.exit(fail?1:0);

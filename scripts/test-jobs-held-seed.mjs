#!/usr/bin/env node
// THE HELD CHIP SEEDS FROM THE DIGEST THE PAGE KEEPS (B-360d unit 3, lane bl-keys-misc — the coordinator's r707 «rank 9's seed,
// the shape as you state it: GO»). The hub profile's rank 9: opening the page, every chat view seeded its held-notifications
// chip with a GET /api/jobs (17 at one load) — and that handler snapshots and enriches EVERY job on the hub's loop, for a digest
// the view only counts. THE SHAPE: every 'jobs-updated' broadcast already carries the digest; the app keeps the newest
// (src/lib/jobs-held.js) and a view seeds from it; while none is kept, ONE GET /api/jobs/held (the digest alone, no snapshot)
// answers every view that asks meanwhile. Never the whole list for a chip.
//   ① THE ROUTE (the real jobs wiring, its routes taken from a stand-in app, a real store of N jobs, each job's snapshot
//      stalled by a placed STALL_MS): /api/jobs/held answers the very digest the list and every broadcast carry, with NO
//      snapshot; registered before /api/jobs/:id. CONTROL: the list snapshots all N and holds the loop for them
//   ② THE KEEPER over that route: VIEWS views opening at once ask ONCE, the list never; after a frame none asks; a frame that
//      comes while the ask is out wins; a socket that went away asks again; a failed ask answers nothing and the next asks again
//   ③ RED CONTROLS: the release's seed (every view GETs the list) — VIEWS × N snapshots, the loop held for each; a copy of
//      the keeper without the shared ask — VIEWS asks
//   ④ CENSUS: the chat view seeds from the app's keeper (no list GET left); the app keeps it from every frame and drops it on a
//      lost socket; the keeper is PURE (no DOM, no socket, nothing required)
//   ⑤ (r972) EVERY CHANGE OF THE HELD NOTICES SENDS ITS FRAME, at the ONE entry point (src/jobs.js _notifsChanged): a hand-over that
//      comes back undelivered (restoreNotifs) and a notice put aside inside the notify step after that step's frame went (the rate
//      floor) — a page that keeps the newest frame then holds the engine's own count; RED each: a copy whose road sends no frame (the
//      release's). A turn's stashes send ONE frame. A census: every writer of pendingNotifs reaches the one entry point
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { scratch, anchored } from './scratch.mjs';
import { armWatchdog } from './suite-watchdog.mjs';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
let passed = 0, failed = 0;
const say = console.log.bind(console);
function ok(c, name, detail) { if (typeof c !== 'boolean') throw new TypeError(`ok(): the condition must be a boolean (${typeof c}) — «${name}»`); if (c) { passed++; say(`  ✓ ${name}`); } else { failed++; say(`  ✗ ${name}${detail === undefined ? '' : ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 700)}`); } return c; }
// THE SHARED WATCHDOG (scripts/suite-watchdog.mjs): names the leg it was in, then ends the suite; an engine arms timers, so the
// suite ends by process.exit
const WD = armWatchdog({ capMs: 30e3 });
const dirs = [];
process.on('exit', () => { for (const d of dirs) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { } } });
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
// THE BOUNDS ARE THE MECHANISM'S OWN (scripts/wall-clock-census.mjs): the stall is PLACED in each job's snapshot (a thread wait,
// no work) and the list's hold is measured in the same run — never a literal number of ms
const N = 12, STALL_MS = 5, VIEWS = 17;
const stall = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

say('① THE ROUTE — the real jobs wiring');
WD.section('①');
const JW = require(path.join(ROOT, 'src/server/jobs-wiring.js'));
const { UserTodoManager } = require(path.join(ROOT, 'src/user-todos.js'));
const dir = scratch('jobs-held-seed'); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(path.join(dir, 'bin'), { recursive: true }); dirs.push(dir);
const T0 = Date.now(), acc = { view: 'session', control: 'session' };
fs.writeFileSync(path.join(dir, 'jobs.json'), JSON.stringify(Array.from({ length: N }, (_, i) => ({ id: `jb-held${String(i).padStart(4, '0')}`, kind: 'task', name: `t${i}`, state: 'done', owner: {}, access: acc, runs: [{ startedAt: T0 - 5000, endedAt: T0 - 4000, exit: 0 }], createdAt: T0 - 5000 }))));
const routes = [], frames = [];
const fakeApp = { get(p, ...h) { routes.push({ verb: 'GET', p, h: h[h.length - 1] }); }, post(p, ...h) { routes.push({ verb: 'POST', p, h: h[h.length - 1] }); }, put() { }, delete() { }, patch() { }, use() { } };
const todos = new UserTodoManager({ dataDir: dir, onChange: () => { } });
const w = JW.create({ app: fakeApp, dataDir: dir, broadcastAll: (m) => frames.push(m), userTodos: todos, log() { }, serverSetting: () => undefined, taskGroups: null, activeSessions: new Map(),
  deliver: { peerReachable: () => true, deliverToConversation: async () => ({ ok: true, lane: 'message' }), onRetry() { }, registerStashJudge() { } } });
const jm = w.jm;
jm.init(); for (const t of jm._timers || []) clearInterval(t);
jm.pendingNotifs.set('conv-held-a', [{ ts: 1, held: { kind: 'not-running' } }, { ts: 2, held: { kind: 'rate-floor' } }]);
jm.pendingNotifs.set('conv-held-b', [{ ts: 3 }]);
let snaps = 0;
const snapshot0 = jm.snapshot.bind(jm);
jm.snapshot = (j) => { snaps++; stall(STALL_MS); return snapshot0(j); };   // THE PLACED STALL: a slow snapshot, as 878 jobs and their redaction are
const routeOf = (p) => (routes.find((r) => r.verb === 'GET' && r.p === p) || {}).h;
const call = (p, query = {}) => { const res = { code: 200, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } }; const t0 = Date.now(); routeOf(p)({ query, headers: {}, params: {} }, res); return { ...res, ms: Date.now() - t0 }; };
const iHeld = routes.findIndex((r) => r.verb === 'GET' && r.p === '/api/jobs/held'), iId = routes.findIndex((r) => r.verb === 'GET' && r.p === '/api/jobs/:id');
ok(iHeld >= 0 && iId > iHeld, `the route is there, BEFORE /api/jobs/:id (which would take «held» for an id): at ${iHeld}, :id at ${iId}`);
const want = jm.heldDigest();
const h1 = call('/api/jobs/held'), s1 = snaps;
const l1 = call('/api/jobs'), s2 = snaps - s1;
ok(h1.code === 200 && JSON.stringify(h1.body) === JSON.stringify({ held: want }) && want.total === 3, 'it answers the digest alone — the very one the engine keeps (two conversations, three notices)', h1.body);
ok(s1 === 0, `with NO job's snapshot (${s1})`);
ok(l1.code === 200 && JSON.stringify(l1.body.held) === JSON.stringify(want) && s2 === N && l1.ms >= N * STALL_MS * 0.8, `CONTROL: the list carries the same digest after snapshotting all ${N} jobs (${s2}) — ${l1.ms} ms on the loop`);
ok(h1.ms < l1.ms / 4, `the digest's route: ${h1.ms} ms, under a quarter of the list's ${l1.ms} ms measured in this run`);
jm.d.broadcast('jobs-updated', { id: 'jb-held0000' });
const frame = frames.find((m) => m.type === 'jobs-updated');
ok(!!frame && JSON.stringify(frame.held) === JSON.stringify(want), 'every jobs-updated frame carries that same digest (the wiring\'s broadcast)');

say('② THE KEEPER (src/lib/jobs-held.js) over that route');
WD.section('②');
const KSRC = read('src/lib/jobs-held.js');
const K = require(path.join(ROOT, 'src/lib/jobs-held.js'));
function page(mod, { fail = false } = {}) {
  const asked = [];
  const fetchJson = async (url) => { asked.push(url); await new Promise((r) => setTimeout(r, 5)); if (fail) throw new Error('offline'); const p = url.split('?')[0]; return routeOf(p) ? call(p).body : null; };
  return { asked, keeper: mod.createHeldKeeper({ fetchJson }) };
}
{
  const P = page(K); const s0 = snaps;
  const got = await Promise.all(Array.from({ length: VIEWS }, () => P.keeper.seed()));
  ok(P.asked.length === 1 && P.asked[0] === '/api/jobs/held' && snaps === s0, `${VIEWS} views opening at once: ONE ask, of the digest's route (${P.asked.join(', ')}); no snapshot (${snaps - s0})`);
  ok(got.every((g) => JSON.stringify(g) === JSON.stringify(want)) && JSON.stringify(P.keeper.kept) === JSON.stringify(want), 'every view gets the digest; the page keeps it');
  const next = { total: 9, byConversation: { 'conv-held-c': { count: 9, kinds: { 'not-reachable': 9 }, reason: { kind: 'not-reachable' } } } };
  P.keeper.note({ type: 'jobs-updated', id: 'x', held: next });
  const later = await Promise.all(Array.from({ length: VIEWS }, () => P.keeper.seed()));
  ok(P.asked.length === 1 && later.every((g) => g === next), `after a frame, ${VIEWS} more views ask nothing: they read the frame's digest`);
  P.keeper.note({ type: 'pages-updated', held: { total: 0 } });
  ok(P.keeper.kept === next, 'a frame of another kind leaves it');
  P.keeper.drop();
  await P.keeper.seed();
  ok(P.asked.length === 2 && JSON.stringify(P.keeper.kept) === JSON.stringify(want), 'the socket went away (a frame may be missed): the next view asks again');
}
{
  const P = page(K);
  const q = P.keeper.seed();
  const newer = { total: 1, byConversation: {} };
  P.keeper.note({ type: 'jobs-updated', held: newer });   // a frame while the ask is out
  const g = await q;
  ok(g === newer && P.keeper.kept === newer, 'a frame that arrives while the ask is out is newer: it wins (the answer does not overwrite it)');
}
{
  const P = page(K, { fail: true });
  const g = await P.keeper.seed();
  await P.keeper.seed();
  ok(g === null && P.keeper.kept === null && P.asked.length === 2, 'a failed ask answers nothing and keeps nothing; the next view asks again');
}

say('③ RED CONTROLS');
WD.section('③');
{
  // the release's seed, chat-view.js before this unit: «fetchJson('/api/jobs').then((r) => { if (r && r.held) this._applyJobsHeld(r.held); })» — once per view
  const s0 = snaps; let held = 0; const t0 = Date.now(), seen = [];
  for (let v = 0; v < VIEWS; v++) { const r = call('/api/jobs'); held = Math.max(held, r.ms); if (r.body && r.body.held) seen.push(r.body.held); }
  ok(snaps - s0 === VIEWS * N && seen.length === VIEWS && held >= N * STALL_MS * 0.8, `CONTROL (the release's seed): ${VIEWS} views ⇒ ${snaps - s0} snapshots, each GET holding the loop ${held} ms at most, ${Date.now() - t0} ms in all — for the same digest`);
}
const MK = mutantCopies('jobs-held-seed', ROOT);
const SHARED = '      if (asking) return asking;\n';
ok(KSRC.split(SHARED).length === 2, 'control setup: the shared ask is one line');
const NOSHARE = MK.load('src/lib/jobs-held.js', anchored(KSRC, SHARED, '      /* MUTANT: every seed asks */\n', 'held-no-share'), 'held-no-share');
{
  const P = page(NOSHARE);
  await Promise.all(Array.from({ length: VIEWS }, () => P.keeper.seed()));
  ok(P.asked.length === VIEWS, `CONTROL (a copy of the keeper without the shared ask): ${VIEWS} views ⇒ ${P.asked.length} asks`);
}
for (const r of copiesCensus(MK.files, MK.dir, ROOT, { minCopies: 1, label: 'B-360d ' })) ok(r.pass, r.name + (r.pass ? '' : ' — ' + r.detail));

say('④ CENSUS');
WD.section('④');
{
  const CV = read('src/lib/chat-view.js'), APP = read('src/lib/app.js');
  ok(!CV.includes("fetchJson('/api/jobs')") && CV.includes('this.app && this.app.jobsHeld ? this.app.jobsHeld.seed() :'), 'the chat view seeds its chip from the app\'s keeper — no GET of the jobs list is left in it');
  ok(/import \{ createHeldKeeper \} from '\.\/jobs-held\.js';/.test(APP) && APP.includes('this.jobsHeld = createHeldKeeper({ fetchJson });') && APP.includes('this.ws.onGlobal((msg) => this.jobsHeld.note(msg));') && APP.includes('this.ws.onStateChange((connected) => { if (!connected) this.jobsHeld.drop(); });'),
    'the app keeps it from every frame and drops it when the socket goes away');
  ok(!/\brequire\(|\bdocument\b|\bwindow\b|WebSocket|localStorage/.test(KSRC.replace(/^\s*\/\/.*$/gm, '')), 'the keeper is PURE: no DOM, no socket, nothing required (fetchJson is handed in)');
}
say('⑤ EVERY CHANGE OF THE HELD NOTICES SENDS ITS FRAME (r972: the ONE entry point)');
WD.section('⑤');
{
  const JSRC = read('src/jobs.js');
  const MJ = mutantCopies('jobs-held-roads', ROOT);
  const copy = (anchor, edit, tag) => { ok(JSRC.split(anchor).length === 2, `control setup (${tag}): its line is in src/jobs.js once`); return MJ.load('src/jobs.js', anchored(JSRC, anchor, edit, tag), tag); };
  const NO_RESTORE = copy("    this._notifsChanged(cid);   // r972: a hand-over that came back undelivered — the page's count follows (it sent no frame before)\n",
    "    try { this.d.onStash?.(cid); } catch { }   // MUTANT: the release's put-back — the stash fact only, no frame\n", 'held-restore-no-frame');
  const NO_STASH = copy("    this._notifsChanged(cid);   // the conversation's `stash` session fact (the strip above its composer) follows — and the page's frame (r972)\n",
    "    try { this.d.onStash?.(cid); } catch { }   // MUTANT: the release's stash — the stash fact only, no frame\n", 'held-stash-no-frame');
  const JOBS = require(path.join(ROOT, 'src/jobs.js'));
  const turn = () => new Promise((r) => setImmediate(r));
  // a world: the engine with the wiring's own frame (every jobs-updated carries jm.heldDigest() at its send) and a page's keeper fed by
  // every frame, in order
  function world(Mod, tag) {
    const d = scratch('jobs-held-roads-' + tag); fs.rmSync(d, { recursive: true, force: true }); fs.mkdirSync(path.join(d, 'bin'), { recursive: true }); dirs.push(d);
    fs.writeFileSync(path.join(d, 'jobs.json'), JSON.stringify([{ id: 'jb-road0001', kind: 'task', name: 'road', state: 'done', owner: {}, access: acc, runs: [{ startedAt: T0 - 5000, endedAt: T0 - 4000, exit: 0 }], createdAt: T0 - 5000 }]));
    const frames = [];
    const page = K.createHeldKeeper({ fetchJson: async () => ({ held: { total: -1, byConversation: {} } }) });   // never asked here: every count comes by frame
    let e = null;
    e = new Mod.JobManager({ dataDir: d, broadcast: (type, payload) => { const m = { type, ...payload, held: e.heldDigest() }; frames.push(m); page.note(m); }, notifyUser: () => ({ ok: true }), log() { }, archivePolicy: () => ({ doneAfterHours: 0, failedAfterDays: 7 }) });
    e.init(); for (const t of e._timers || []) clearInterval(t);
    return { e, frames, page, job: e.jobs.get('jb-road0001') };
  }
  const countOf = (dg, cid) => (dg && dg.byConversation && dg.byConversation[cid] ? dg.byConversation[cid].count : 0);
  async function handBack(Mod, tag) {
    const w = world(Mod, tag), cid = 'conv-road-a';
    const f0 = w.frames.length;
    for (let i = 0; i < 3; i++) w.e._stashNotif(cid, w.job, { what: `run ${i}` }, 'not running', { stampLast: false, held: { kind: 'not-running' } });
    await turn();
    const stashFrames = w.frames.length - f0;
    const items = w.e.drainNotifs(cid);   // a hand-over takes them (its own frame: 0 held)
    const afterDrain = countOf(w.page.kept, cid);
    w.e.restoreNotifs(cid, items);   // …and its frame comes back undelivered: they are put back
    await turn();
    const kept = await w.page.seed(), engine = countOf(w.e.heldDigest(), cid);
    w.e.shutdown();
    return { stashFrames, afterDrain, items: items.length, kept: countOf(kept, cid), engine };
  }
  const a = await handBack(JOBS, 'a'), aR = await handBack(NO_RESTORE, 'a-m');
  ok(a.stashFrames === 1, `three notices put aside in one turn send ONE frame, after them (${a.stashFrames})`);
  ok(a.items === 3 && a.afterDrain === 0 && a.engine === 3 && a.kept === 3, `(1) A HAND-OVER THAT COMES BACK UNDELIVERED: the drain's frame said 0, the put-back's own frame says ${a.kept} — a view opened now seeds the engine's count (${a.engine})`, a);
  ok(aR.engine === 3 && aR.kept === 0, `RED CONTROL (the release's put-back, in a copy — the stash fact only, no frame): the page still keeps 0 while the engine holds ${aR.engine}`, aR);
  async function floored(Mod, tag) {
    const w = world(Mod, tag), cid = 'conv-road-b';
    try { w.e.d.broadcast('jobs-updated', { id: w.job.id }); } catch { }   // THE STEP'S OWN FRAME goes first (as _touch's, before the notify step)
    const before = countOf(w.page.kept, cid);
    w.e._notifyRate.set(cid, { ts: Date.now() - 1000 });   // a post 1 s ago: the floor holds the next one
    w.e._deliverTo(cid, w.job, { what: 'it ended' }, {});   // put aside at the rate floor, inside the notify step
    await turn();
    const kept = await w.page.seed(), engine = countOf(w.e.heldDigest(), cid);
    w.e.shutdown();
    return { before, kept: countOf(kept, cid), engine };
  }
  const b = await floored(JOBS, 'b'), bR = await floored(NO_STASH, 'b-m');
  ok(b.before === 0 && b.engine === 1 && b.kept === 1, `(2) A NOTICE PUT ASIDE INSIDE THE NOTIFY STEP after that step's frame went (the rate floor): its own frame follows the step — the page keeps ${b.kept}, the engine holds ${b.engine}`, b);
  ok(bR.engine === 1 && bR.kept === 0, `RED CONTROL (the release's stash, in a copy — no frame of its own): the page keeps the step's earlier frame, 0, while the engine holds ${bR.engine}`, bR);
  for (const r of copiesCensus(MJ.files, MJ.dir, ROOT, { minCopies: 2, label: 'B-360d held roads ' })) ok(r.pass, r.name + (r.pass ? '' : ' — ' + r.detail));
  // THE CENSUS: every method that writes pendingNotifs (set / delete) reaches the ONE entry point — but the load (_notifsFrom: at the
  // boot no page is open; its read again is framed by its caller, pinned here)
  const writers = (src) => {
    const lines = src.split('\n'), out = new Map();
    let cur = null;
    for (const l of lines) {
      const m = /^  (?:async )?([_a-zA-Z][\w]*)\([^)]*\) \{/.exec(l);
      if (m) cur = m[1];
      if (cur && /this\.pendingNotifs\.(set|delete|clear)\(/.test(l)) out.set(cur, true);
    }
    return [...out.keys()];
  };
  const bodyOf = (src, name) => { const i = src.search(new RegExp(`\\n  (?:async )?${name}\\([^)]*\\) \\{`)); if (i < 0) return ''; const j = src.slice(i + 1).search(/\n  (?:async )?[_a-zA-Z][\w]*\([^)]*\) \{/); return j < 0 ? src.slice(i) : src.slice(i, i + 1 + j); };
  const LOAD = new Set(['_notifsFrom']);
  const unframed = (src) => writers(src).filter((n) => !LOAD.has(n) && !bodyOf(src, n).includes('this._notifsChanged('));
  const ws = writers(JSRC);
  ok(ws.length >= 5 && unframed(JSRC).length === 0 && /for \(const cid of this\.pendingNotifs\.keys\(\)\) \{ try \{ this\.d\.onStash\?\.\(cid\); \} catch \{ \} \}[^\n]*\n\s*try \{ this\.d\.broadcast\('jobs-updated', \{ notifs: true \}\); \} catch \{ \}/.test(JSRC),
    `every writer of the held notices (${ws.join(', ')}) reaches the ONE entry point; the load is framed by its read again ({ notifs: true })`, unframed(JSRC));
  const planted = JSRC.replace('\n  _notifsChanged(cid, payload = null) {', '\n  _plantedWriter(cid) { this.pendingNotifs.delete(cid); }\n  _notifsChanged(cid, payload = null) {');
  ok(unframed(planted).join() === '_plantedWriter', `CONTROL: a planted writer that sends no frame is RED by name (${unframed(planted).join()})`);
}
jm.shutdown();
say(`\n${failed ? `${failed} FAILED (${passed} passed)` : `ALL PASS (${passed})`}`);
process.exit(failed ? 1 : 0);

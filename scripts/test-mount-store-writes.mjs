#!/usr/bin/env node
// test-mount-store-writes — B-574d «mounts-and-forwards» (主开发 r4751 / r4758 / r4796, lane nl-mounts). FIVE HUB STORES NO LONGER
// WRITE BY THEIR OWN UNSYNCED TEMP + RENAME: after a power loss such a file could come back empty or torn, the next start held it,
// kept its bytes aside and started EMPTY — the person's storage list, the paired machines' mounts, the plugins' on-switches, the port
// forwards with their public names, «Publish this VibeSpace». THE RATE RULE (r4758 / r4796): a save no person pressed (a dial-in, a
// sweep, a landing, a restart, the start) never waits on the data folder on the hub's loop and never writes what is already there; a
// person's own act lands before it answers.
// FAST, in-process: each store's REAL code over a scratch data folder; the faults are PLACED (a refused sync of the store's own temp;
// a stand-in writer thread that refuses a write) — never a mount, never a child, nothing fetched.
//   W  three stores on THE STORE WRITER (mounts.json, machine-mounts.json, port-forwards.json), a real writer on a stand-in thread:
//      W1 a person's act (a storage added, a pull mount removed, a forward removed, a MACHINE REMOVED — r5036) is ON DISK when its call
//         returns (flushSync).
//         RED: the act's save without `now` — not on disk at its return (owed to the writer's next turn)
//      W2 mounts.json: a person's act whose landing FAILS throws not-durable with law F's one sentence, the old file stands, the writer
//         said it, and the change lands once the storage answers; a save no person pressed under the same refusal throws NOTHING (a
//         sweep, a timer, a promise never meet a throw). REDS: the throw taken out; the `now` gate taken out
//      W3 mounts.json and machine-mounts.json keep 0600 through the writer. RED: the writer asked without the mode
//      W4 a landing that FAILED, then an UNCHANGED state (its save asks nothing): the owed write is still written once the storage
//         answers. RED: a producer that answers «nothing to write» for bytes it already handed (the failed ones)
//      W5 a person's DISCONNECT is done first (detached) and its record lands after; a landing that fails answers what is true —
//         detached, notOnDisk (the route's answer, the page says it) — and the record lands once the storage answers. RED: the
//         cure's own first shape (the landing asked before the detach, thrown)
//      W6 r5036, a machine's REMOVAL: ONE synchronous landing a removal (one flush, one write of the file), NONE for a machine with
//         no forward while nothing is owed (an owed write is landed by a person's act, as every Ports press); EVERY call of the store's
//         unpair in src/ and server.js: the two person roads pass now, the lift's passes none
//      W7 r5156, the same for machine-mounts.json: a machine removed (all its mount records) is ON DISK when the call returns, ONE
//         landing a removal; none for a machine with no record while nothing is owed, ONE when a write is owed; every call of the mounts
//         store's unpair names its side. RED: the writer's road
//      W8 r5156 (S1): a machine's removal hands BOTH stores ONE bound (the writer's flushDeadline): a bound already spent lands neither at
//         the return (each left owed, landed later on the writer) — never one bound a store. RED: the bound not handed down
//      W9 r5225: the bound STARTS at the removal's first landing: a teardown that outlasts the bound (on the writer's own clock, a push's
//         remote unmount on an offline machine: off the loop) still leaves BOTH files on disk at the return; the bound was taken after it
//         (witnessed); the caller hands an EMPTY bound. RED: the bound taken before the awaited teardown — neither file at the return
//   R  THE RATE LEGS — each event repeated N times over a recording writer writes zero or one time. RED each: its gate taken out
//      R1 port-forwards.json: N dial-ins of a machine with no forward and of one whose forward is live
//      R2 port-forwards.json: N heal sweeps of a forward that starts while its republish fails (each sweep one 5-min retry)
//      R3 port-forwards.json: N restarts of a published service (the jobs engine's forward, same label, then its publish, same address)
//      R4 machine-mounts.json: N landings of a pull alone on its folder write none; on a folder it shares with an older-stamped pull, one
//      R5 mounts.json: N connects of a mount already mounted (the watchdog's adopt) write none
//      R6 port-forwards.json, THE CALLER NAMES THE SIDE (r4827): a writer whose store is OWED (pending) while N restarts of a service
//         forward and publish the same address (the jobs engine's calls: no `now`) — the synchronous landing is NEVER asked, nothing
//         written. RED: the cure's tip shape (publish landing «now» whoever calls, the gate stepping aside while a write is owed)
//   D  two stores on the SYNCED REPLACE (src/fd-close.js renameSynced: plugins.json, instance-url.json), each through its real act:
//      D1 a sync that FAILS (EIO placed at the fsync of its temp) reaches its caller, the old file stands; RED: the release's body
//      D2 a file system with no sync at all: writes of TWO instances land, «does not do a sync» said ONCE a run (not once an
//         instance); the release says nothing (its body asks no sync — D1's red shows it asks none)
//      D3 plugins.json keeps 0600; RED: the door asked without the mode
//   THE READERS (r4758: the three that need «written = on disk now»):
//      M  machine-mounts.json's one-time ingest keeps its synced replace and its read-back: a failed sync keeps the legacy store and
//         marks the ingest OWED (the next start runs it again). REDS: the release's ingest; the mark taken out
//      L  plugins.json's loud migration write THROWS a failed sync (run again at the next start); RED: the release's body
//      K  the relay's sealing: a plugin's quiet save is on disk when it returns (the clear value gone from the file); RED: deferred
// Run: node scripts/test-mount-store-writes.mjs
import './scratch.mjs';
import fs from 'node:fs';
import path from 'node:path';
import Module, { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { scratchDir, anchored } from './scratch.mjs';
import { checker } from './lib/check.mjs';

const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { ok, report } = checker();
process.umask(0o022);   // a mode's red reads 0644: the mode asked, never the runner's own mask
for (const k of Object.keys(process.env)) if (/^VIBESPACE_(S3|CEPHFS)_/.test(k)) delete process.env[k];   // the boot's env import of storage reads none
const DIRS = [];
let dirN = 0;
process.on('exit', () => { for (const d of DIRS) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* gone */ } } });
/** a fresh scratch folder per world (the same name answers the same folder for the whole run: numbered) */
const dirOf = (name) => { const d = scratchDir(`msw-${name}-${++dirN}`); DIRS.push(d); return d; };
const MADE = [];   // the managers with a timer of their own (cleared at the end)
process.env.VIBESPACE_MOUNT_BASE = dirOf('mount-base');   // a storage's folder (a Disconnect's empty-folder sweep) under the scratch root, never the home
const asModule = (rel, code) => { const abs = path.join(REPO, rel); const m = new Module(abs, null); m.filename = abs; m.paths = Module._nodeModulePaths(path.dirname(abs)); m._compile(code, abs); return m.exports; };
const srcOf = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
/** a copy of a product module with its anchored edits (each anchor must stand in the source exactly once — else it throws by name) */
const copyOf = (rel, edits, name) => { let code = srcOf(rel); for (const [a, b] of edits) code = anchored(code, a, b, name); return asModule(rel, code); };
const bytes = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return null; } };
const temps = (dir, base) => fs.readdirSync(dir).filter((n) => n.startsWith(base + '.') && n.includes('tmp'));
const modeOf = (f) => { try { return fs.statSync(f).mode & 0o777; } catch { return null; } };
const tick = (ms = 2) => new Promise((r) => setTimeout(r, ms));
const N = 5;

/** THE PLACED SYNC: the fsync of a descriptor opened on the store's OWN temp (`<file>.tmp`) answers `code` (null: lets it through);
 *  every such sync asked is counted */
function placeSync(file, code) {
  const o = fs.openSync, s = fs.fsyncSync, fds = new Set(), asked = [];
  fs.openSync = function (p, ...a) { const fd = o.call(this, p, ...a); if (typeof p === 'string' && p.startsWith(file + '.') && p.includes('tmp')) fds.add(fd); return fd; };
  fs.fsyncSync = function (fd, ...a) { if (fds.has(fd)) { asked.push(fd); if (code) throw Object.assign(new Error(`a placed ${code} at the sync`), { code }); } return s.call(this, fd, ...a); };
  return { asked, restore: () => { fs.openSync = o; fs.fsyncSync = s; } };
}
/** console.warn (the modules' «no sync» and «not written» sink) captured around an act that may wait */
async function warnsOf(fn) { const w0 = console.warn, out = []; console.warn = (...a) => out.push(a.join(' ')); try { return { r: await fn(), out }; } finally { console.warn = w0; } }

// made-up values built at runtime (no secret-shaped literal in the tree)
const KEY_ID = ['made', 'up', 'key', 'id'].join('-'), KEY_SECRET = ['made', 'up', 'key', 'value', 'for', 'the', 'suite'].join('-');
const NOT_DURABLE = "Saved, but not on disk yet — the storage has not written it (it is slow or failing). It stays in memory and is written when the storage can; a restart before then loses it.";
const s3 = (n) => ({ type: 's3', name: `made-up-${n}`, endpoint: 'https://storage.example.test', bucket: `made-up-bucket-${n}`, accessKey: KEY_ID, secretKey: KEY_SECRET });
const pull = (n, d, extra = {}) => ({ id: `mm-made${n}`, dir: 'pull', hostId: 'host-made', remotePath: `/srv/made${n}`, mountpoint: path.join(d, `mnt${n}`), createdAt: n, ...extra });
const fwd = (n, extra = {}) => ({ id: `pf-made${n}`, hostId: `host-made${n}`, remotePort: 8000 + n, label: `made-up ${n}`, error: null, ...extra });
const HOSTS = () => ({ held: () => false, get: () => { throw new Error('no such machine'); }, findByDeviceId: () => null, list: () => [] });
const PLUGIN = (id, create) => ({ id, label: `Made-up ${id}`, description: 'a made-up plugin of this suite', provides: [], create: create || (() => ({ install: async () => ({}), start: () => ({}), stop: () => ({}), status: () => ({}) })) });

const MO = 'src/mounts.js', MM = 'src/machine-mounts.js', PF = 'src/port-forward.js', PL = 'src/plugins.js', IU = 'src/server/instance-url.js';
const mountsWorld = (M, W) => { const d = dirOf('mounts'); const m = new M.MountManager({ dataDir: d, broadcast: () => { }, storeWriter: W }); return { d, file: path.join(d, 'mounts.json'), m }; };
const machineWorld = (M, W, recs) => {
  const d = dirOf('machine'), file = path.join(d, 'machine-mounts.json'), lines = [];
  fs.writeFileSync(file, JSON.stringify({ mounts: recs(d) }, null, 2));
  const m = new M.MachineMounts({ dataDir: d, hosts: HOSTS(), mountTokens: { mint: () => null }, log: (l) => lines.push(String(l)), storeWriter: W });
  m._recheckPairs = async () => m._held;   // the pair check after a removal reads real folders (a child's realpath): not this suite's
  MADE.push(m);
  return { d, file, m, lines };
};
const portsWorld = (M, W, rows) => {
  const d = dirOf('ports'), file = path.join(d, 'port-forwards.json'), lines = [];
  fs.writeFileSync(file, JSON.stringify({ forwards: rows }, null, 2));
  const pf = new M.PortForwardManager({ hosts: { list: () => [] }, dataDir: d, plugins: null, broadcast: () => { }, log: (l) => lines.push(String(l)), getJobs: () => null, storeWriter: W });
  MADE.push(pf);
  return { d, file, pf, lines };
};
/** a RECORDING writer: every write ASKED (dirty) by its file's base name; a flush lands the bytes in this turn */
function recorder({ owed = false } = {}) {
  const r = { asked: [], stores: new Map(), flushes: 0 };
  Object.assign(r, {
    dirty: (file, o) => { r.asked.push(path.basename(file)); r.stores.set(file, o); if (o && typeof o.produce === 'function') o.produce({ sync: true }); },   // the writer takes the bytes (its landing modelled: the store learns the bytes it handed)
    pending: () => owed, durable: async () => true, whyNotDurable: () => null,   // owed: the store has a write owed (a slow or failing data folder)
    flushSync: (names) => { r.flushes++; for (const f of names || [...r.stores.keys()]) { const o = r.stores.get(f); if (o) fs.writeFileSync(f, o.produce({ sync: true })); } return { written: [], left: [] }; },
  });
  return r;
}

// THE REAL WRITER on a stand-in thread (scripts/fixtures/store-stand-writer.cjs: the real writeJob; `failOn` refuses a file's writes)
const SW = require(path.join(REPO, 'src/store-writer.js'));
const STAND = require(path.join(REPO, 'scripts/fixtures/store-stand-writer.cjs')).make(dirOf('stand'));
const SAID = [];
const sink = (...a) => SAID.push(a.map(String).join(' '));
const RW = SW.create({ log: { log: sink, info: sink, warn: sink, error: sink }, workerPath: STAND.path });
/** wait for a file's owed write to land on the real writer (a refused one is retried after its backoff): a few asks, one bound */
async function landed(file) { let ok1 = false; for (let i = 0; i < 4 && !ok1; i++) ok1 = await RW.durable(file, { timeoutMs: 15000 }) === true; return ok1; }

try {
  console.log('W1 a PERSON\'s act on a writer store is on disk when its call returns (the writer\'s own flushSync)');
  const W_ACTS = [
    { base: 'mounts.json', rel: MO, world: (M) => mountsWorld(M, RW), act: (w) => w.m.add(s3(1)), landed: (doc) => !!doc && doc.includes('made-up-bucket-1'),
      edits: [["    this._save({ now: true, why: 'a storage added' });", "    this._save();"]] },   // stale-pins: kept — the release-shaped text, compiled back in as the red control
    { base: 'machine-mounts.json', rel: MM, world: (M) => machineWorld(M, RW, (d) => [pull(1, d), pull(2, d)]), act: (w) => w.m.unmount('mm-made1', { now: true }), landed: (doc) => !!doc && !doc.includes('"mm-made1"'),   // the route's call (server.js passes now)
      edits: [["    this._save({ now, why: 'a mount removed' }); this._notify();", "    this._save({ why: 'a mount removed' }); this._notify();"]] },
    { base: 'port-forwards.json', rel: PF, world: (M) => portsWorld(M, RW, [fwd(1), fwd(2)]), act: (w) => w.pf.unforward('pf-made1', { now: true }), landed: (doc) => !!doc && !doc.includes('"pf-made1"'),   // the Ports route's call (server.js passes now)
      edits: [["    this._state.forwards = this._state.forwards.filter((r) => r.id !== id);\n    this._persist({ now });", "    this._state.forwards = this._state.forwards.filter((r) => r.id !== id);\n    this._persist();"]] },   // stale-pins: kept — the release-shaped text, compiled back in as the red control
    { base: 'port-forwards.json (a machine removed)', rel: PF, world: (M) => portsWorld(M, RW, [fwd(1), fwd(2)]), act: (w) => w.pf.onMachineUnpaired('host-made1', { now: true }), landed: (doc) => !!doc && !doc.includes('"pf-made1"') && doc.includes('"pf-made2"'),   // r5036: removeHost / unpairDialDevice pass now
      edits: [["    this._persist({ now });   // r5036: a machine's REMOVAL by a person lands at once (its callers pass now); the unpair at a lift rides the writer", "    this._persist();"]] },   // the RED: the writer's road (the slice's first shape)
  ];
  for (const R of W_ACTS) {
    const scene = async (M) => { const w = R.world(M); let threw = null; try { await R.act(w); } catch (e) { threw = (e && e.message) || String(e); } const atReturn = R.landed(bytes(w.file)); const lands = await landed(w.file); return { atReturn, threw, later: lands && R.landed(bytes(w.file)), mode: (modeOf(w.file) || 0).toString(8) }; };
    const t = await scene(require(path.join(REPO, R.rel)));
    ok(t.atReturn === true && !t.threw && t.later === true, `W1 ${R.base} (${R.rel}): the person's act is on disk when its call returns`, t);
    let red = null, why = null;
    try { red = await scene(copyOf(R.rel, R.edits, `w1-${R.base}-no-now`)); } catch (e) { why = e.message; }
    ok(!!red && red.atReturn === false && red.later === true, `W1 RED CONTROL ${R.base}: the act's save without \`now\` is NOT on disk at its return (owed to the writer's next turn), it lands later`, red || why);
  }

  console.log('W2 mounts.json: a person\'s act whose landing FAILS throws not-durable; a save no person pressed never throws');
  {
    const scene = async (M) => {
      const w = mountsWorld(M, RW);
      w.m.add(s3(1));
      const old = bytes(w.file), s0 = SAID.length;
      STAND.failOn('mounts.json', true);
      let threw = null, sweepThrew = null;
      try {
        try { w.m.add(s3(2)); } catch (e) { threw = e; }
        try { w.m._state.mounts[0].desired = 'mounted'; w.m._save(); } catch (e) { sweepThrew = e; }   // the watchdog's road: a save no person pressed
      } finally { STAND.failOn('mounts.json', false); }
      const kept = bytes(w.file) === old, said = SAID.slice(s0).some((l) => l.includes('mounts.write not written'));
      const lands = await landed(w.file), doc = bytes(w.file) || '';
      return { threw: threw ? { code: threw.code, sentence: threw.message === NOT_DURABLE } : null, sweepThrew: sweepThrew ? sweepThrew.code || sweepThrew.message : null, kept, said, later: lands && doc.includes('made-up-bucket-2') && doc.includes('"desired": "mounted"') };
    };
    const t = await scene(require(path.join(REPO, MO)));
    ok(!!t.threw && t.threw.code === 'not-durable' && t.threw.sentence && !t.sweepThrew && t.kept && t.said && t.later === true,
      'W2 mounts.json: the refused landing of a person\'s act throws not-durable with law F\'s one sentence, the old file stands, the writer said it, a save no person pressed under the same refusal throws nothing, and both land once the storage answers', t);
    let r1 = null, y1 = null;
    try { r1 = await scene(copyOf(MO, [["    if (miss) throw Object.assign(new Error('Saved, but not on disk yet — the storage has not written it (it is slow or failing). It stays in memory and is written when the storage can; a restart before then loses it.'), { code: 'not-durable', status: 503, why: `${why}: ${miss.why || 'the write failed'}` });", "    if (miss) { }"]], 'w2-no-throw')); } catch (e) { y1 = e.message; }
    ok(!!r1 && r1.threw === null, 'W2 RED CONTROL (the throw taken out): the person\'s act answers as if saved while nothing is on disk', r1 || y1);
    let r2 = null, y2 = null;
    try { r2 = await scene(copyOf(MO, [["    if (!now) return true;\n", ""]], 'w2-every-save-waits')); } catch (e) { y2 = e.message; }
    ok(!!r2 && !!r2.sweepThrew, 'W2 RED CONTROL (the `now` gate taken out): the sweep\'s save waits on the storage and throws into its road', r2 || y2);
  }

  console.log('W3 mounts.json and machine-mounts.json keep 0600 through the writer');
  for (const [rel, base, mk, act, edit] of [[MO, 'mounts.json', (M) => mountsWorld(M, RW), (w) => w.m.add(s3(1)), ["    W.dirty(this._file, { name: 'mounts.write', mode: 0o600, produce: () => {", "    W.dirty(this._file, { name: 'mounts.write', produce: () => {"]],
    [MM, 'machine-mounts.json', (M) => machineWorld(M, RW, (d) => [pull(1, d), pull(2, d)]), (w) => w.m.unmount('mm-made1', { now: true }), ["      W.dirty(this._file, { name: 'machine-mounts.write', mode: 0o600, produce: () => {", "      W.dirty(this._file, { name: 'machine-mounts.write', produce: () => {"]]]) {
    const scene = async (M) => { const w = mk(M); await act(w); await landed(w.file); return modeOf(w.file); };
    const mode = await scene(require(path.join(REPO, rel)));
    ok(mode === 0o600, `W3 ${base}: written by the store writer with its mode — 0600 (credentials, tokens)`, { mode: mode && mode.toString(8) });
    let red = null, why = null;
    try { red = await scene(copyOf(rel, [edit], `w3-${base}-no-mode`)); } catch (e) { why = e.message; }
    ok(red !== null && (red & 0o077) !== 0, `W3 RED CONTROL ${base}: the writer asked without the mode leaves the file readable by others`, { mode: red !== null ? red.toString(8) : why });
  }

  console.log('W4 a FAILED landing, then an UNCHANGED state: the owed write is still written once the storage answers');
  {
    const scene = async (M) => {
      const w = mountsWorld(M, RW);
      w.m.add(s3(1));
      STAND.failOn('mounts.json', true);
      let threw = null; try { w.m.add(s3(2)); } catch (e) { threw = e && e.code; } finally { STAND.failOn('mounts.json', false); }
      w.m._save();   // nothing changed since the failed landing: asks nothing
      const lands = await landed(w.file), doc = bytes(w.file) || '';
      return { threw, lands, written: doc.includes('made-up-bucket-2') };
    };
    const t = await scene(require(path.join(REPO, MO)));
    ok(t.threw === 'not-durable' && t.lands === true && t.written === true, 'W4 mounts.json: the person\'s act whose landing failed, followed by an unchanged state (its save asks nothing), is still WRITTEN once the storage answers (the writer keeps it owed)', t);
    let red = null, why = null;
    try { red = await scene(copyOf(MO, [["      const j = JSON.stringify(this._state, null, 2); this._asked = j; return j;\n", "      const j = JSON.stringify(this._state, null, 2); if (j === this._asked) return null; this._asked = j; return j;\n"]], 'w4-null-when-handed')); } catch (e) { why = e.message; }
    ok(!!red && red.written === false, 'W4 RED CONTROL (a producer that answers «nothing to write» for bytes it already handed): the failed change is never written', red || why);
  }

  console.log('W5 a person\'s DISCONNECT is done first; its record lands after; a failed landing answers detached + notOnDisk');
  {
    const GM = { id: 'mnt-gm1', name: 'made-up mail', type: 'gmail', origin: 'manual', mode: 'rw', customPath: null, expiresAt: null, desired: 'mounted', createdAt: 1, email: 'made-up@example.test' };
    const scene = async (M) => {
      const d = dirOf('disconnect'), file = path.join(d, 'mounts.json');
      fs.writeFileSync(file, JSON.stringify({ mounts: [GM], shares: [] }, null, 2));
      const m = new M.MountManager({ dataDir: d, broadcast: () => { }, storeWriter: RW });
      const stops = []; m.gmail.stop = (id) => { stops.push(id); };   // its row's own unmount: the sync worker stopped (in-process)
      STAND.failOn('mounts.json', true);
      let ok1 = null, threw = null;
      try { ok1 = await m.unmount(GM.id, { press: true }); } catch (e) { threw = (e && e.code) || String(e); } finally { STAND.failOn('mounts.json', false); }
      const disk0 = JSON.parse(bytes(file) || '{}'), nd = !!(m.unmountNotOnDisk && m.unmountNotOnDisk(GM.id));
      const lands = await landed(file), disk1 = JSON.parse(bytes(file) || '{}');
      const desiredOf = (j) => ((j.mounts || []).find((x) => x.id === GM.id) || {}).desired || null;
      return { ok: ok1, threw, detached: stops.includes(GM.id), memory: m._state.mounts.find((x) => x.id === GM.id).desired, notOnDisk: nd, diskAtAnswer: desiredOf(disk0), lands, diskLater: desiredOf(disk1) };
    };
    const t = await scene(require(path.join(REPO, MO)));
    const route = srcOf('src/server/mounts-plugins-wiring.js').includes("res.json({ success: ok, ...(mounts.unmountNotOnDisk?.(req.params.id) ? { notOnDisk: true } : {}) });");
    ok(t.ok === true && !t.threw && t.detached && t.memory === 'unmounted' && t.notOnDisk && t.diskAtAnswer === 'mounted' && t.lands === true && t.diskLater === 'unmounted' && route,
      'W5 a Disconnect whose landing fails: DETACHED first, answered with notOnDisk (the route says it — the page\'s sayNotOnDisk), the old record still on disk at the answer, the new one landed once the storage answers', { ...t, route });
    let red = null, why = null;
    try { red = await scene(copyOf(MO, [["      this._save();   // B-574d (r4827): the Disconnect's record rides the writer — the act is DONE first; a person's press lands it after its detach (unmount)", "      this._save({ now: true, why: 'a Disconnect' });"], ["    road = road.then((ok) => { if (this._save({ now: true, why: 'a Disconnect', quiet: true }) === false) (this._unmountNotOnDisk = this._unmountNotOnDisk || new Set()).add(id); return ok; });\n", ""]], 'w5-landing-first')); } catch (e) { why = e.message; }   // stale-pins: kept — the release-shaped text, compiled back in as the red control
    ok(!!red && (red.threw === 'not-durable' || !red.detached), 'W5 RED CONTROL (the landing asked before the detach, as at dd2e53e79): the press throws «not on disk» while the mount was never detached', red || why);
  }
  console.log('W6 r5036: a machine\'s REMOVAL by a person — one synchronous landing a removal, none for a machine with no forward (nothing owed)');
  {
    const w = portsWorld(require(path.join(REPO, PF)), RW, [fwd(1), fwd(2), fwd(3, { hostId: 'host-made1' })]);
    const writesOf = () => ((RW.stats().find((r) => r.file === w.file) || {}).writes || 0);
    let flushes = 0; const f0 = RW.flushSync; RW.flushSync = function (...a) { flushes++; return f0.apply(this, a); };
    let one = null, none = null;
    try {
      w.pf.onMachineUnpaired('host-made1', { now: true });
      const doc = bytes(w.file) || '';
      one = { flushes, writes: writesOf(), gone: !doc.includes('"pf-made1"') && !doc.includes('"pf-made3"'), kept: doc.includes('"pf-made2"') };
      flushes = 0; const w0 = writesOf();
      w.pf.onMachineUnpaired('host-made9', { now: true });   // a machine with no forward: nothing changed, nothing owed
      none = { flushes, writes: writesOf() - w0 };
    } finally { RW.flushSync = f0; }
    ok(one.flushes === 1 && one.writes === 1 && one.gone && one.kept, 'W6 a machine removed by a person: ONE synchronous landing (one flush, one write of the file) and its two forwards gone from the file when the call returns', one);
    ok(none.flushes === 0 && none.writes === 0, 'W6 a machine removed that has no forward, nothing owed: no landing asked, nothing written', none);
    // EVERY call of the store's unpair: the port-forward manager is handed around as `portForwards` (server.js, its routes); its own
    // lift calls `this.onMachineUnpaired` — a new road of either shape is counted here and must name its side
    const calls = [], walk = (d) => { for (const e of fs.readdirSync(path.join(REPO, d), { withFileTypes: true })) { const r = d + '/' + e.name; if (e.isDirectory()) walk(r); else if (r.endsWith('.js')) srcOf(r).split('\n').forEach((l, i) => { if (/\bportForwards\??\.onMachineUnpaired\(/.test(l)) calls.push([r, l.trim()]); }); } };
    walk('src'); srcOf('server.js').split('\n').forEach((l) => { if (/\bportForwards\??\.onMachineUnpaired\(/.test(l)) calls.push(['server.js', l.trim()]); });
    const own = srcOf(PF).split('\n').filter((l) => /\bthis\.onMachineUnpaired\(/.test(l)).map((l) => l.trim());
    ok(calls.length === 2 && calls.every(([, l]) => /, \{ now: true(, bound: removalBound)? \}\)/.test(l)) && calls.some(([f]) => f === 'src/server/exit-routes.js') && calls.some(([f]) => f === 'src/server/dial-pairing.js')
      && own.length === 1 && own[0].includes('try { this.onMachineUnpaired(h); }'),
      `W6 every call of the store's unpair names its side: the two person roads (removeHost, unpairDialDevice) pass now, the lift's passes none (${calls.length} calls, ${own.length} of its own)`, { calls, own });
  }
  console.log('W7 r5156: a machine\'s REMOVAL lands machine-mounts.json too — on disk at the return, one landing, its caller passes now');
  {
    const recs = (d) => [pull(1, d), pull(2, d), pull(3, d, { hostId: 'host-other' })];
    // S5: every shape of a call of the MOUNTS store's unpair — by its usual names (machineMounts, getMachineMounts(), mm), optional or not,
    // and the store calling its own; a call split over lines is read by its first line (its receiver and its opening parenthesis)
    // (a destructured or renamed handle would not be counted: this census catches mistakes, never a deliberate hiding)
    const MM_CALL = /(\bmachineMounts|getMachineMounts\(\)|\bmm|\bthis)\??\.onMachineUnpaired\??\.?\(/;
    const scene = async (M) => {
      const w = machineWorld(M, RW, recs);
      const writesOf = () => ((RW.stats().find((r) => r.file === w.file) || {}).writes || 0);
      let flushes = 0; const f0 = RW.flushSync; RW.flushSync = function (...a) { flushes++; return f0.apply(this, a); };
      let one = null, none = null, owedNone = null;
      try {
        const p = w.m.onMachineUnpaired('host-made', { now: true }); await p;
        const doc = bytes(w.file) || '';
        one = { flushes, writes: writesOf(), gone: !doc.includes('"mm-made1"') && !doc.includes('"mm-made2"'), kept: doc.includes('"mm-made3"') };
        flushes = 0; const w0 = writesOf();
        await w.m.onMachineUnpaired('host-none', { now: true });   // a machine with no record: nothing changed, nothing owed
        none = { flushes, writes: writesOf() - w0 };
        // S9: a write OWED (a change riding the writer, not landed yet), then a machine with no record removed: its landing lands the owed write
        w.m._state.mounts[0].label = 'made-up owed change'; w.m._save(); flushes = 0; const w1 = writesOf();
        await w.m.onMachineUnpaired('host-none', { now: true });
        owedNone = { flushes, writes: writesOf() - w1, onDisk: (bytes(w.file) || '').includes('made-up owed change') };
      } finally { RW.flushSync = f0; }
      const later = await landed(w.file), docLater = bytes(w.file) || '';
      return { one, none, owedNone, later, goneLater: !docLater.includes('"mm-made1"') && !docLater.includes('"mm-made2"') };
    };
    const t = await scene(require(path.join(REPO, MM)));
    ok(t.one.flushes === 1 && t.one.writes === 1 && t.one.gone && t.one.kept, 'W7 machine-mounts.json: a machine removed by a person — its two mount records gone from the file when the call returns (the other machine\'s kept), ONE synchronous landing (one flush, one write)', t.one);
    ok(t.none.flushes === 0 && t.none.writes === 0, 'W7 a machine removed that has no mount record, nothing owed: no landing asked, nothing written', t.none);
    ok(!!t.owedNone && t.owedNone.flushes === 1 && t.owedNone.writes === 1 && t.owedNone.onDisk, 'W7 a machine removed that has no mount record while a write IS owed: its one landing lands the owed write (a person\'s act lands what is owed)', t.owedNone);
    let red = null, why = null;
    try { red = await scene(copyOf(MM, [["    if (now) this._save({ now: true, why: 'a machine removed', bound });   // r5156: ONE landing for all its records (a person's removal), its bound shared", ""]], 'w7-writer-road')); } catch (e) { why = e.message; }
    ok(!!red && red.one.gone === false && red.one.flushes === 0 && red.later === true && red.goneLater === true, 'W7 RED CONTROL (the writer\'s road: the removal\'s landing cut): its records are NOT on disk when the call returns (owed), they land later', red || why);
    const calls = [], walk = (d) => { for (const e of fs.readdirSync(path.join(REPO, d), { withFileTypes: true })) { const r = d + '/' + e.name; if (e.isDirectory()) walk(r); else if (r.endsWith('.js')) srcOf(r).split('\n').forEach((l) => { if (MM_CALL.test(l)) calls.push([r, l.trim()]); }); } };
    walk('src'); srcOf('server.js').split('\n').forEach((l) => { if (MM_CALL.test(l)) calls.push(['server.js', l.trim()]); });
    const own = calls.filter(([f]) => f === 'src/port-forward.js');   // the forwards store's own lift (its law is W6's)
    const mine = calls.filter(([f]) => f !== 'src/port-forward.js');
    ok(mine.length === 1 && mine[0][0] === 'src/server/dial-pairing.js' && /, \{ now: true, bound: removalBound \}\)/.test(mine[0][1]) && own.length === 1, `W7 every call of the mounts store's unpair names its side: its one caller (unpairDialDevice, a person's removal) passes now (${calls.length} call(s))`, calls);
  }
  console.log('W8 r5156 (S1): a machine\'s removal hands both stores ONE bound — a bound already spent lands neither at the return');
  {
    const scene = async (MMm, PFm) => {
      const mw = machineWorld(MMm, RW, (d) => [pull(1, d), pull(2, d)]), pw = portsWorld(PFm, RW, [fwd(1, { hostId: 'host-made' }), fwd(2)]);
      const spent = RW.flushDeadline(-1);   // the removal's one bound, already spent (a stalled storage that took it all)
      const bound = { deadline: spent };
      await mw.m.onMachineUnpaired('host-made', { now: true, bound });
      pw.pf.onMachineUnpaired('host-made', { now: true, bound });
      const atReturn = { mounts: !(bytes(mw.file) || '').includes('"mm-made1"'), forwards: !(bytes(pw.file) || '').includes('"pf-made1"') };
      const later = { mounts: await landed(mw.file), forwards: await landed(pw.file) };
      return { atReturn, later, landedLater: !(bytes(mw.file) || '').includes('"mm-made1"') && !(bytes(pw.file) || '').includes('"pf-made1"') };
    };
    const t = await scene(require(path.join(REPO, MM)), require(path.join(REPO, PF)));
    ok(t.atReturn.mounts === false && t.atReturn.forwards === false && t.later.mounts === true && t.later.forwards === true && t.landedLater,
      'W8 a removal whose ONE bound is already spent: neither store is waited for at the return (each left owed), both land later on the writer — the bound is shared, never one a store', t);
    let red = null, why = null;
    try { red = await scene(copyOf(MM, [["      if (now) W.flushSync([this._file], { waitedBy: `machine-mounts.json: ${why}`, ...(dl != null ? { deadline: dl } : {}) });", "      if (now) W.flushSync([this._file], { waitedBy: `machine-mounts.json: ${why}` });"]], 'w8-own-bound'), require(path.join(REPO, PF))); } catch (e) { why = e.message; }   // stale-pins: kept — the release-shaped text, compiled back in as the red control
    ok(!!red && red.atReturn.mounts === true && red.atReturn.forwards === false, 'W8 RED CONTROL (the bound not handed down to machine-mounts.json): it takes a bound of its own — landed at the return while the shared one was spent', red || why);
  }
  console.log('W9 r5225: the removal\'s one bound starts at its FIRST landing — a slow awaited teardown never spends it');
  {
    const G = 3000, B = Math.round(G / 3), SLOW = B + 200;   // a writer with a small bound (a third of its grace): a teardown of SLOW ms outlasts it
    const scene = async (MMm, tag) => {
      const W9w = SW.create({ log: { log: sink, info: sink, warn: sink, error: sink }, workerPath: STAND.path, graceMs: G });
      try {
        const mw = machineWorld(MMm, W9w, (d) => [pull(1, d), pull(2, d)]), pw = portsWorld(require(path.join(REPO, PF)), W9w, [fwd(1, { hostId: 'host-made' }), fwd(2)]);
        let endAt = null;   // the writer's own clock when the slow teardown ended (the witness that it ran, and when)
        mw.m._live.set('mm-made1', { teardown: () => new Promise((res) => setTimeout(() => { endAt = W9w._now(); res(); }, SLOW)) });   // a teardown waiting OFF the loop
        const bound = {};
        await mw.m.onMachineUnpaired('host-made', { now: true, bound });
        pw.pf.onMachineUnpaired('host-made', { now: true, bound });
        const atReturn = { mounts: !(bytes(mw.file) || '').includes('"mm-made1"'), forwards: !(bytes(pw.file) || '').includes('"pf-made1"') };
        const later = { mounts: await W9w.durable(mw.file, { timeoutMs: 15000 }), forwards: await W9w.durable(pw.file, { timeoutMs: 15000 }) };
        return { tag, endAt, deadline: bound.deadline, takenAfter: endAt != null && bound.deadline != null && bound.deadline >= endAt + B, atReturn, later };
      } finally { try { W9w.stop(); } catch { } }
    };
    const EAGER = ["    if (!hostId) return;\n    for (const rec of [...this._state.mounts.filter((m) => m.hostId === hostId)]) {", "    if (!hostId) return;\n    if (now && bound && bound.deadline == null) bound.deadline = this._writer().flushDeadline();   // RED: the bound taken BEFORE the awaited teardown\n    for (const rec of [...this._state.mounts.filter((m) => m.hostId === hostId)]) {"];
    let red = null, why = null;
    const [g, rr] = await Promise.all([scene(require(path.join(REPO, MM)), 'lazy'), (async () => { try { red = await scene(copyOf(MM, [EAGER], 'w9-eager-bound'), 'eager'); } catch (e) { why = e.message; } return red; })()]);
    ok(g.endAt != null && g.takenAfter && g.atReturn.mounts === true && g.atReturn.forwards === true && g.later.mounts === true && g.later.forwards === true,
      `W9 a teardown of ${SLOW} ms (the bound ${B} ms, off the loop): the bound was taken AFTER it (witnessed on the writer's own clock), and BOTH files are on disk when the removal returns`, g);
    ok(!!rr && rr.endAt != null && rr.atReturn.mounts === false && rr.atReturn.forwards === false && rr.later.mounts === true && rr.later.forwards === true,
      'W9 RED CONTROL (the bound taken before the awaited teardown): the slow teardown spends it — neither file is on disk at the return (both left owed, landed later)', rr || why);
    ok(srcOf('src/server/dial-pairing.js').includes('  const removalBound = {};\n'), 'W9 the caller (unpairDialDevice) hands an EMPTY bound: the first landing starts it');
  }
} finally { /* the real writer stops at the end */ }

console.log('R THE RATE LEGS — each event repeated N times writes zero or one time (a recording writer counts every write asked)');
{
  // R1 port-forwards.json: N dial-ins
  const r1 = async (M) => {
    const rec = recorder(), w = portsWorld(M, rec, [fwd(1, { hostId: 'host-live' })]);
    w.pf._live.set('pf-made1', { rec: { localPort: 47991 }, sockets: new Set(), server: { close() { } } });   // its forward is live
    for (let i = 0; i < N; i++) { await w.pf.onMachineLinked('host-none'); await w.pf.onMachineLinked('host-live'); }
    return rec.asked.length;
  };
  const a1 = await r1(require(path.join(REPO, PF)));
  ok(a1 === 0, `R1 port-forwards.json: ${N} dial-ins of a machine with no forward and ${N} of one whose forward is live write NOTHING (the bytes on disk are the bytes)`, { asked: a1 });
  let x1 = null, y1 = null; try { x1 = await r1(copyOf(PF, [["      if (json === this._asked && !(now && W.pending(this.file))) return;   // r4827: unchanged — nothing asked (a person's act still lands what is owed)\n", ""]], 'r1-no-gate')); } catch (e) { y1 = e.message; }
  ok(x1 === 2 * N, 'R1 RED CONTROL (the gate taken out): every dial-in writes the list again', { asked: x1, why: y1 });

  // R2 port-forwards.json: N heal sweeps of a forward that starts while its republish fails
  const r2 = async (M) => {
    const rec = recorder(), w = portsWorld(M, rec, [fwd(1)]);
    w.pf._start = async () => { }; w.pf._probeForward = () => { }; w.pf._republish = async () => false;   // it starts; the relay does not take it
    for (let i = 0; i < N; i++) { w.pf._healRetryAt.clear(); await w.pf._healSweep(); }   // each sweep: one 5-min retry come due
    return rec.asked.length;
  };
  const a2 = await r2(require(path.join(REPO, PF)));
  ok(a2 <= 1, `R2 port-forwards.json: ${N} heal sweeps of a forward whose republish keeps failing write at most once`, { asked: a2 });
  let x2 = null, y2 = null; try { x2 = await r2(copyOf(PF, [["      if (json === this._asked && !(now && W.pending(this.file))) return;   // r4827: unchanged — nothing asked (a person's act still lands what is owed)\n", ""]], 'r2-no-gate')); } catch (e) { y2 = e.message; }
  ok(x2 === N, 'R2 RED CONTROL (the gate taken out): every sweep writes the list again', { asked: x2, why: y2 });

  // R3 port-forwards.json: N restarts of a published service
  const r3 = async (M) => {
    const rec = recorder(), owner = 'job-made1', id = 'pf-__local__-47001';
    const w = portsWorld(M, rec, [{ id, hostId: '__local__', remotePort: 47001, label: 'service: made-up', ownerJob: owner, error: null }]);
    w.pf._start = async () => { }; w.pf._probeForward = () => { }; w.pf._decideProto = async () => ({ proto: 'http', why: 'override' });
    w.pf._live.set(id, { rec: { localPort: 47999 }, sockets: new Set(), server: { close() { } } });
    w.pf.plugins = { frpPublish: async () => ({ url: 'https://made-up.example.test', name: 'made-up', proto: 'http', subdomain: 'made-up' }), frpUnpublish: async () => { } };
    for (let i = 0; i < N; i++) { await w.pf.forward('__local__', 47001, { label: 'service: made-up', owner }); await w.pf.publish(id); }
    return rec.asked.length;
  };
  const a3 = await r3(require(path.join(REPO, PF)));
  ok(a3 <= 1, `R3 port-forwards.json: ${N} restarts of a published service (its forward with the same label, its publish of the same address) write at most once`, { asked: a3 });
  let x3 = null, y3 = null; try { x3 = await r3(copyOf(PF, [["      if (json === this._asked && !(now && W.pending(this.file))) return;   // r4827: unchanged — nothing asked (a person's act still lands what is owed)\n", ""], ["    else if (label && rec.label !== label) { rec.label = label; this._persist({ now }); }   // B-574d (r4796 (b)): a service's restart names the same label — nothing to write", "    else if (label) { rec.label = label; this._persist({ now: true }); }"]], 'r3-no-gates')); } catch (e) { y3 = e.message; }
  ok(x3 === 2 * N, 'R3 RED CONTROL (the gates taken out): every restart writes the list twice', { asked: x3, why: y3 });

  // R4 machine-mounts.json: N landings of a pull
  const r4 = async (M) => {
    const ra = recorder(), wa = machineWorld(M, ra, (d) => [pull(1, d)]);
    for (let i = 0; i < N; i++) { wa.m._stampLanding(wa.m._state.mounts[0]); await tick(); }
    const rb = recorder(), wb = machineWorld(M, rb, (d) => [pull(1, d, { mountpoint: path.join(d, 'shared') }), pull(2, d, { mountpoint: path.join(d, 'shared'), lastLiveAt: 1 })]);
    for (let i = 0; i < N; i++) { wb.m._stampLanding(wb.m._state.mounts[0]); await tick(); }
    return { alone: ra.asked.length, shared: rb.asked.length, stamped: Number(wa.m._state.mounts[0].lastLiveAt) > 1 };
  };
  const a4 = await r4(require(path.join(REPO, MM)));
  ok(a4.alone === 0 && a4.shared === 1 && a4.stamped, `R4 machine-mounts.json: ${N} landings of a pull alone on its folder write NOTHING (its stamp kept in memory); on a folder it shares with an older-stamped pull, ONE (the rank it moves)`, a4);
  let x4 = null, y4 = null; try { x4 = await r4(copyOf(MM, [["  _stampLanding(rec) { const prev = Number(rec.lastLiveAt) || 0; rec.lastLiveAt = Date.now(); if (this._stampRanks(rec, prev)) this._save(); }", "  _stampLanding(rec) { rec.lastLiveAt = Date.now(); this._save(); }"]], 'r4-every-landing')); } catch (e) { y4 = e.message; }
  ok(!!x4 && x4.alone === N && x4.shared === N, 'R4 RED CONTROL (the release\'s stamp: saved at every landing): every landing writes the list', x4 || y4);

  // R5 mounts.json: N connects of a mount already mounted
  const r5 = async (M) => {
    const rec = recorder(), w = mountsWorld(M, rec);
    const id = w.m.add(s3(1)); w.m._state.mounts.find((x) => x.id === id).desired = 'mounted'; w.m._save({ now: true, why: 'the suite' });
    const n0 = rec.asked.length;
    w.m.isMounted = () => true;   // its daemon answers: the watchdog's connect adopts it
    for (let i = 0; i < N; i++) await w.m.mount(id);
    return rec.asked.length - n0;
  };
  const a5 = await r5(require(path.join(REPO, MO)));
  ok(a5 === 0, `R5 mounts.json: ${N} connects of a mount already mounted (the watchdog's adopt) write NOTHING`, { asked: a5 });
  let x5 = null, y5 = null; try { x5 = await r5(copyOf(MO, [["    if (json === this._asked && !(now && W.pending(this._file))) return true;   // r4827: unchanged — nothing asked (a person's act still lands what is owed)\n", ""]], 'r5-no-gate')); } catch (e) { y5 = e.message; }
  ok(x5 === N, 'R5 RED CONTROL (the gate taken out): every connect writes the list again', { asked: x5, why: y5 });

  // R6 port-forwards.json: the caller names the side — a store with a write OWED while N restarts publish the same address
  const r6 = async (M) => {
    const rec = recorder({ owed: true }), owner = 'job-made6', id = 'pf-__local__-47006';
    const w = portsWorld(M, rec, [{ id, hostId: '__local__', remotePort: 47006, label: 'service: made-up', ownerJob: owner, error: null, publicUrl: 'https://made-up.example.test', publicName: 'made-up', publicProto: 'http', publicSub: 'made-up', publicPort: null }]);
    w.pf._start = async () => { }; w.pf._probeForward = () => { }; w.pf._decideProto = async () => ({ proto: 'http', why: 'override' });
    w.pf._live.set(id, { rec: { localPort: 47998 }, sockets: new Set(), server: { close() { } } });
    w.pf.plugins = { frpPublish: async () => ({ url: 'https://made-up.example.test', name: 'made-up', proto: 'http', subdomain: 'made-up' }), frpUnpublish: async () => { } };
    const f0 = rec.flushes;   // the list made on the folder: its own «made again» landing is not a restart's
    for (let i = 0; i < N; i++) { await w.pf.forward('__local__', 47006, { label: 'service: made-up', owner }); await w.pf.publish(id); }   // the jobs engine's calls: no `now`
    return { flushes: rec.flushes - f0, asked: rec.asked.length };
  };
  const a6 = await r6(require(path.join(REPO, PF)));
  ok(a6.flushes === 0 && a6.asked === 0, `R6 port-forwards.json: a store whose write is OWED while ${N} restarts of a service forward and publish the same address — no synchronous landing is ever asked, nothing written`, a6);
  let x6 = null, y6 = null; try { x6 = await r6(copyOf(PF, [["      if (json === this._asked && !(now && W.pending(this.file))) return;   // r4827: unchanged — nothing asked (a person's act still lands what is owed)\n", "      if (json === this._asked && !W.pending(this.file)) return;\n"], ["    this._persist({ now }); this._emit();\n    return { publicUrl: r.url, proto: r.proto || d.proto, pending: !!d.pending, previousUrl };", "    this._persist({ now: true }); this._emit();\n    return { publicUrl: r.url, proto: r.proto || d.proto, pending: !!d.pending, previousUrl };"]], 'r6-tip-shape')); } catch (e) { y6 = e.message; }   // stale-pins: kept — the release-shaped text, compiled back in as the red control
  ok(!!x6 && x6.flushes === N, 'R6 RED CONTROL (the cure\'s tip shape: publish lands «now» whoever calls, the gate steps aside while a write is owed): every restart waits on a landing', x6 || y6);
}

// ── D: the two stores on the synced replace, each through its real act ──────────────────────────────────────────────────────
const LETTER = ['', 'a', 'b', 'c', 'd'];
const RELAY = { relayStatus: () => ({ configured: true }), frpPublish: async (name, port, o) => ({ url: `https://${o.preferSub}.example.test`, proto: 'http', subdomain: o.preferSub }), frpUnpublish: async () => { }, setSelfDialSub: () => { } };
const DOOR = [
  { rel: PL, base: 'plugins.json',
    world: (M) => { const d = dirOf('plugins'), lines = []; const pm = new M.PluginManager({ dataDir: d, plugins: [1, 2, 3, 4].map((n) => PLUGIN(`made-up-${LETTER[n]}`)) }); return { d, file: path.join(d, 'plugins.json'), pm, lines }; },
    act: (w, n) => w.pm.setEnabled(`made-up-${LETTER[n]}`, true),
    landed: (doc, n) => !!doc && doc.includes(`"made-up-${LETTER[n]}"`),
    failed: (t) => t.said.some((l) => /^\[plugins\] plugins\.json not written \(EIO\)/.test(l)),
    tip: "      require('./fd-close.js').renameSynced(this._file + '.tmp', this._file, JSON.stringify(this._state, null, 2), { mode: 0o600, where: 'plugins.json', say: (w) => { if (!noSyncSaid) { noSyncSaid = true; console.warn(`[plugins] ${w}`); } } });\n    } catch (e) { if (loud) throw e; console.warn(`[plugins] plugins.json not written (${(e && e.code) || 'error'}) — the old file stands on disk`); }",
    rel0: "      const tmp = this._file + '.tmp';\n      fs.writeFileSync(tmp, JSON.stringify(this._state, null, 2), { mode: 0o600 });\n      fs.renameSync(tmp, this._file);\n    } catch (e) { if (loud) throw e; }" },   // stale-pins: kept — the release's body, compiled back in as the red control
  { rel: IU, base: 'instance-url.json',
    world: (M) => { const d = dirOf('publish'), lines = []; const iu = M.create({ dataDir: d, plugins: RELAY, port: 1, log: (l) => lines.push(String(l)) }); return { d, file: path.join(d, 'instance-url.json'), iu, lines }; },
    act: (w, n) => w.iu.publish({ sub: `made-up-sub${n}` }),
    landed: (doc, n) => !!doc && doc.includes(`made-up-sub${n}`),
    failed: (t) => t.w.lines.some((l) => /^\[instance-url\] persist failed: .*EIO/.test(l)),
    tip: "  require('../fd-close.js').renameSynced(file + '.tmp', file, JSON.stringify(obj, null, 2), { where: 'instance-url.json', say: (w) => { if (!noSyncSaid) { noSyncSaid = true; console.warn(`[instance-url] ${w}`); } } });",
    rel0: "  fs.writeFileSync(file + '.tmp', JSON.stringify(obj, null, 2));\n  fs.renameSync(file + '.tmp', file);" },   // stale-pins: kept — the release's body, compiled back in as the red control
];
async function doorScene(R, M, code) {
  const w = R.world(M);
  await R.act(w, 1);
  const old = bytes(w.file), p = placeSync(w.file, code);
  let threw = null, said = [];
  try { const x = await warnsOf(async () => { try { return await R.act(w, 2); } catch (e) { threw = e; return null; } }); said = x.out; } finally { p.restore(); }
  return { w, threw, old, now: bytes(w.file), asked: p.asked.length, temps: temps(w.d, R.base), said };
}
console.log('D1 the synced replace: a sync that FAILS reaches its caller; the old file stands');
for (const R of DOOR) {
  const t = await doorScene(R, require(path.join(REPO, R.rel)), 'EIO');
  const facts = { asked: t.asked, threw: t.threw && t.threw.code, oldKept: t.now === t.old, temps: t.temps, failedSaid: R.failed(t) };
  ok(!!t.old && !R.landed(t.old, 2) && t.asked >= 1 && t.now === t.old && t.temps.length === 0 && R.failed(t),
    `D1 ${R.base} (${R.rel}): a sync of its own temp asked; the placed EIO fails the write to its caller (its own words), the OLD file stands byte for byte, no temp left`, facts);
  let red = null, why = null;
  try { red = await doorScene(R, copyOf(R.rel, [[R.tip, R.rel0]], `d1-${R.base}-release`), 'EIO'); } catch (e) { why = e.message; }
  const rf = red && { asked: red.asked, newTookName: R.landed(red.now, 2), failedSaid: R.failed(red) };
  ok(!!red && red.asked === 0 && rf.newTookName && !rf.failedSaid, `D1 RED CONTROL ${R.base}: the release's body asks no sync — under the same placed EIO the NEW bytes take the name and the caller hears nothing`, rf || why);
}
console.log('D2 a file system with no sync at all: the writes land, said ONCE a run (two instances)');
for (const R of DOOR) {
  const M = require(path.join(REPO, R.rel));
  const wa = R.world(M), wb = R.world(M);
  await R.act(wa, 1); await R.act(wb, 1);
  const pa = placeSync(wa.file, 'EINVAL'), pb = placeSync(wb.file, 'EINVAL');
  let a, b;
  try { a = await warnsOf(() => R.act(wa, 2)); b = await warnsOf(() => R.act(wb, 3)); } finally { pb.restore(); pa.restore(); }
  const lines = [...a.out, ...b.out, ...wa.lines, ...wb.lines].filter((l) => l.includes(`${R.base}: its file system does not do a sync (EINVAL)`));
  const facts = { asked: pa.asked.length + pb.asked.length, lines, landed: [R.landed(bytes(wa.file), 2), R.landed(bytes(wb.file), 3)], temps: [...temps(wa.d, R.base), ...temps(wb.d, R.base)] };
  ok(facts.asked >= 2 && lines.length === 1 && !lines[0].includes(wa.d) && !lines[0].includes(wb.d) && facts.landed.every(Boolean) && facts.temps.length === 0,
    `D2 ${R.base}: writes of TWO instances on a file system that does no sync (EINVAL) land; «does not do a sync» is said ONCE a run, with the store's name and the code (no path)`, facts);
}
console.log('D3 plugins.json keeps 0600');
{
  const R = DOOR[0];
  const mode = await (async () => { const w = R.world(require(path.join(REPO, PL))); await R.act(w, 1); return modeOf(w.file); })();
  ok(mode === 0o600, 'D3 plugins.json: written through the door with its mode — 0600', { mode: mode && mode.toString(8) });
  let red = null, why = null;
  try { const w = R.world(copyOf(PL, [[R.tip, "      require('./fd-close.js').renameSynced(this._file + '.tmp', this._file, JSON.stringify(this._state, null, 2), { where: 'plugins.json', say: (w) => { if (!noSyncSaid) { noSyncSaid = true; console.warn(`[plugins] ${w}`); } } });\n    } catch (e) { if (loud) throw e; console.warn(`[plugins] plugins.json not written (${(e && e.code) || 'error'}) — the old file stands on disk`); }"]], 'd3-no-mode')); await R.act(w, 1); red = modeOf(w.file); } catch (e) { why = e.message; }
  ok(red !== null && (red & 0o077) !== 0, 'D3 RED CONTROL: the door asked without the mode leaves the file readable by others', { mode: red !== null ? red.toString(8) : why });
}

console.log('M machine-mounts.json\'s one-time ingest: a failed sync keeps the legacy store and marks the ingest owed');
{
  const boot = (M) => {
    const d = dirOf('migrate'), lines = [], file = path.join(d, 'machine-mounts.json'), legacy = path.join(d, 'host-mounts.json');
    fs.writeFileSync(legacy, JSON.stringify({ mounts: [{ id: 'hm-made1', hostId: 'host-made', folder: '/srv/made', mountpoint: path.join(d, 'mnt'), mode: 'ro', os: 'linux', method: 'rclone-webdav', tokenId: 'tk-made', tunnelPort: 40001, mountedAt: 1 }] }));
    const p = placeSync(file, 'EIO'), rec = recorder();
    let m = null, threw = null;
    try { m = new M.MachineMounts({ dataDir: d, hosts: HOSTS(), mountTokens: { mint: () => null }, log: (l) => lines.push(String(l)), storeWriter: rec }); } catch (e) { threw = e.message; } finally { p.restore(); }
    if (m) MADE.push(m);
    return { asked: p.asked.length, threw, store: bytes(file), legacyKept: fs.existsSync(legacy), migrated: fs.existsSync(legacy + '.migrated'), temps: temps(d, 'machine-mounts.json'), owed: !!(m && m._state.legacyOwed), failedSaid: lines.some((l) => l.startsWith('migration save FAILED') && l.includes('EIO')) };
  };
  const t = boot(require(path.join(REPO, MM)));
  ok(t.asked === 1 && !t.threw && t.store === null && t.legacyKept && !t.migrated && t.temps.length === 0 && t.failedSaid && t.owed,
    'M the ingest\'s save under a placed EIO: a sync asked, the save FAILED and said, no machine-mounts.json and no temp, the legacy store NOT renamed .migrated, the ingest marked OWED (the next start runs it again)', t);
  let r1 = null, y1 = null; try { r1 = boot(copyOf(MM, [["      require('./fd-close.js').renameSynced(this._file + '.tmp', this._file, json, { mode: 0o600, where: 'machine-mounts.json', say: (w) => { if (!noSyncSaid) { noSyncSaid = true; this.log(w); } } });", "      const t = this._file + '.tmp';\n      fs.writeFileSync(t, json, { mode: 0o600 });\n      fs.renameSync(t, this._file);"]], 'm-release-ingest')); } catch (e) { y1 = e.message; }
  ok(!!r1 && r1.asked === 0 && !!r1.store && r1.store.includes('hm-made1') && r1.migrated && !r1.legacyKept,
    'M RED CONTROL: the release\'s ingest asks no sync — the store takes its name unsynced and the legacy store is renamed away beside it', r1 || y1);
  let r2 = null, y2 = null; try { r2 = boot(copyOf(MM, [["this._state.legacyOwed = true; this.log(", "this.log("]], 'm-no-owed-mark')); } catch (e) { y2 = e.message; }
  ok(!!r2 && r2.owed === false, 'M RED CONTROL (the mark taken out): a failed ingest is not owed — a later save of the merged list leaves the legacy store behind for good', r2 || y2);
}

console.log('L plugins.json\'s loud road (the one-time rename migration): a failed sync is THROWN, the old record stands');
{
  const R = DOOR[0];
  const loud = async (M) => {
    const d = dirOf('plugins-loud'), file = path.join(d, 'plugins.json');
    fs.writeFileSync(file, JSON.stringify({ plugins: { 'made-up-old': { enabled: true } } }, null, 2));
    const pm = new M.PluginManager({ dataDir: d, plugins: [PLUGIN('made-up-a')] });
    const old = bytes(file), p = placeSync(file, 'EIO');
    let threw = null; try { pm.renamePlugin('made-up-old', 'made-up-a'); } catch (e) { threw = e; } finally { p.restore(); }
    return { old, now: bytes(file), threw: threw && threw.code, asked: p.asked.length, temps: temps(d, 'plugins.json') };
  };
  const t = await loud(require(path.join(REPO, PL)));
  ok(t.asked === 1 && t.threw === 'EIO' && t.now === t.old && t.now.includes('"made-up-old"') && t.temps.length === 0,
    'L plugins.json (renamePlugin, the migration\'s write): the placed EIO is THROWN to the migration (run again at the next start), the old record stands byte for byte, no temp left', t);
  let red = null, why = null;
  try { red = await loud(copyOf(PL, [[R.tip, R.rel0]], 'l-release')); } catch (e) { why = e.message; }
  ok(!!red && red.asked === 0 && !red.threw && !!red.now && red.now.includes('"made-up-a"'), 'L RED CONTROL: the release\'s body asks no sync — the migration «succeeds» and the moved record takes the name unsynced', red || why);
}

console.log('K the relay\'s sealing: a plugin\'s quiet save is on disk when it returns');
{
  const R = DOOR[0];
  const seal = (M) => {
    const d = dirOf('plugins-seal'), file = path.join(d, 'plugins.json');
    let H = null;
    const pm = new M.PluginManager({ dataDir: d, plugins: [PLUGIN('made-up-k', (h) => { H = h; return { install: async () => ({}), start: () => ({}), stop: () => ({}), status: () => ({}) }; })] });
    H.rec().clearValue = 'made-up-clear'; H.save();   // the clear value written
    delete H.rec().clearValue; H.rec().sealedMark = true; H.save();   // sealed: the clear value dropped — the sealing then says «sealed»
    const atReturn = bytes(file);
    return { pm, atReturn: atReturn === null ? null : { clear: atReturn.includes('made-up-clear'), sealed: atReturn.includes('sealedMark') } };
  };
  const t = seal(require(path.join(REPO, PL)));
  ok(!!t.atReturn && !t.atReturn.clear && t.atReturn.sealed, 'K plugins.json: the sealing\'s quiet save is ON DISK when h.save() returns — the clear value is gone from the file before the sealing says sealed', t.atReturn);
  let red = null, why = null;
  try { red = seal(copyOf(PL, [[R.tip, "      { const bytes = JSON.stringify(this._state, null, 2); setImmediate(() => require('./fd-close.js').renameSynced(this._file + '.tmp', this._file, bytes, { mode: 0o600, where: 'plugins.json' })); }\n    } catch (e) { if (loud) throw e; console.warn(`[plugins] plugins.json not written (${(e && e.code) || 'error'}) — the old file stands on disk`); }"]], 'k-deferred')); } catch (e) { why = e.message; }
  ok(!!red && !(red.atReturn && !red.atReturn.clear && red.atReturn.sealed), 'K RED CONTROL (the save deferred a turn): at the return the file does not hold the sealed record yet', red ? red.atReturn : why);
  await tick(20);   // the red's deferred writes land in their own folder before the run ends
}

for (const x of MADE) { try { clearInterval(x._sweep); clearInterval(x._watch); } catch { /* none */ } }
try { RW.stop(); } catch { /* stopped */ }
report();

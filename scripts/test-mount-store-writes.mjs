#!/usr/bin/env node
// test-mount-store-writes — B-574d «mounts-and-forwards» (主开发 r4751, lane nl-mounts). FIVE HUB STORES NO LONGER WRITE BY THEIR
// OWN UNSYNCED TEMP + RENAME: after a power loss such a file could come back empty or torn, the next start then held it as damaged,
// kept its bytes aside and started EMPTY — the person's storage list, the paired machines' mounts, the plugins' on-switches, the
// port forwards with their public names, or «Publish this VibeSpace» gone from the page. Each of the six sites is a SYNCED replace
// through the tree's one door (src/fd-close.js renameSynced: write, ONE fsync, close, rename), synchronous by ruling: each store is
// written on a person's act, an agent's act or a rare event of its own, never at a cadence.
// FAST, in-process: each store's REAL act over a scratch data folder; the faults are PLACED (a refused sync of the store's own temp)
// — never a mount, never a clock, nothing spawned, nothing fetched.
//   S1 a sync that FAILS (EIO placed at the fsync of the store's own temp) is a failed write that reaches its caller — mounts.json
//      thrown to the act (setMyStorageConfig), machine-mounts.json said in its log (unmount; it was swallowed in silence),
//      plugins.json said (setEnabled; it was swallowed in silence), port-forwards.json said (onMachineUnpaired), instance-url.json
//      said (publish) — the OLD file stands byte for byte and no temp is left. RED per site: the release's body (an anchored copy)
//      asks no sync, and the NEW bytes take the name.
//   S2 a file system with no sync at all (EINVAL placed): two acts land, «does not do a sync» said ONCE a run, the store's name and
//      the code (no path); the bytes on disk are the store's state as the release wrote them (JSON, two spaces).
//   S3 the credential stores keep 0600 (mounts.json, machine-mounts.json, plugins.json). RED: the door asked without the mode.
//   L  plugins.json's LOUD road (the one-time rename migration, renamePlugin): the placed EIO is THROWN (the runner tries it again
//      at the next start) and the old record stands on disk. RED: the release's body.
//   M  machine-mounts.json's one-time migration of the legacy stores: a failed sync is a failed save — the legacy store is NOT
//      renamed .migrated beside a store not on disk, no machine-mounts.json, no temp; it runs again at the next start. RED: the
//      release's migration renames the legacy store away with no sync asked.
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
process.umask(0o022);   // S3's red reads a 0644 file: the mode asked, never the runner's own mask
const DIRS = [];
process.on('exit', () => { for (const d of DIRS) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* gone */ } } });
const dirOf = (name) => { const d = scratchDir(name); DIRS.push(d); return d; };
const MADE = [];   // the managers with a timer of their own (cleared at the end)
/** a copy of a product module compiled AS that module's file (its relative requires resolve as the real one's) */
const asModule = (rel, code) => { const abs = path.join(REPO, rel); const m = new Module(abs, null); m.filename = abs; m.paths = Module._nodeModulePaths(path.dirname(abs)); m._compile(code, abs); return m.exports; };
const srcOf = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
const bytes = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return null; } };
const temps = (dir, base) => fs.readdirSync(dir).filter((n) => n.startsWith(base + '.') && n.includes('tmp'));
const modeOf = (f) => { try { return fs.statSync(f).mode & 0o777; } catch { return null; } };

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
const LETTER = ['', 'a', 'b', 'c'];
const PLUGIN = (id) => ({ id, label: `Made-up ${id}`, description: 'a made-up plugin of this suite', provides: [], create: () => ({ install: async () => ({}), start: () => ({}), stop: () => ({}), status: () => ({}) }) });
const RELAY = { relayStatus: () => ({ configured: true }), frpPublish: async (name, port, o) => ({ url: `https://${o.preferSub}.example.test`, proto: 'http', subdomain: o.preferSub }), frpUnpublish: async () => { }, setSelfDialSub: () => { } };
const pull = (n, d) => ({ id: `mm-made${n}`, dir: 'pull', hostId: 'host-made', remotePath: `/srv/made${n}`, mountpoint: path.join(d, `mnt${n}`), createdAt: n });

// ── the five stores, each through its REAL act ────────────────────────────────────────────────────────────────────────────────
const STORES = [
  { rel: 'src/mounts.js', base: 'mounts.json', mode600: true,
    world: (M) => { const d = dirOf('msw-mounts'), lines = []; const m = new M.MountManager({ dataDir: d, broadcast: () => { } }); return { d, file: path.join(d, 'mounts.json'), m, lines, state: () => m._state }; },
    act: (w, n) => w.m.setMyStorageConfig({ endpoint: 'https://storage.example.test', bucket: `made-up-bucket-${n}`, accessKey: KEY_ID, secretKey: KEY_SECRET }),
    landed: (doc, n) => !!doc && doc.includes(`made-up-bucket-${n}`),
    failed: (t) => !!t.threw && t.threw.code === 'EIO',
    tip: "    require('./fd-close.js').renameSynced(this._file + '.tmp', this._file, JSON.stringify(this._state, null, 2), { mode: 0o600, where: 'mounts.json', say: (w) => { if (!noSyncSaid) { noSyncSaid = true; console.warn(`[mounts] ${w}`); } } });",
    noMode: "    require('./fd-close.js').renameSynced(this._file + '.tmp', this._file, JSON.stringify(this._state, null, 2), { where: 'mounts.json', say: (w) => { if (!noSyncSaid) { noSyncSaid = true; console.warn(`[mounts] ${w}`); } } });",
    rel0: "    const tmp = this._file + '.tmp';\n    fs.writeFileSync(tmp, JSON.stringify(this._state, null, 2), { mode: 0o600 });\n    fs.renameSync(tmp, this._file);" },   // stale-pins: kept — the release's body, compiled back in as the red control
  { rel: 'src/machine-mounts.js', base: 'machine-mounts.json', mode600: true,
    world: (M) => {
      const d = dirOf('msw-machine'), lines = [];
      fs.writeFileSync(path.join(d, 'machine-mounts.json'), JSON.stringify({ mounts: [1, 2, 3, 4].map((n) => pull(n, d)) }, null, 2));
      const m = new M.MachineMounts({ dataDir: d, hosts: { held: () => false, get: () => { throw new Error('no such machine'); }, findByDeviceId: () => null, list: () => [] }, mountTokens: { mint: () => null }, log: (l) => lines.push(String(l)) });
      m._recheckPairs = async () => m._held;   // the pair check after a removal reads real folders (a child's realpath): not this suite's
      MADE.push(m);
      return { d, file: path.join(d, 'machine-mounts.json'), m, lines, state: () => m._state };
    },
    act: (w, n) => w.m.unmount(`mm-made${n}`),
    landed: (doc, n) => !!doc && !doc.includes(`"mm-made${n}"`),
    failed: (t) => t.w.lines.some((l) => /machine-mounts\.json not written \(EIO\)/.test(l)),
    tip: "    try { require('./fd-close.js').renameSynced(this._file + '.tmp', this._file, JSON.stringify(this._state, null, 2), { mode: 0o600, where: 'machine-mounts.json', say: (w) => { if (!noSyncSaid) { noSyncSaid = true; this.log(w); } } }); } catch (e) { this.log(`machine-mounts.json not written (${(e && e.code) || 'error'}) — the old list stands on disk`); }",
    noMode: "    try { require('./fd-close.js').renameSynced(this._file + '.tmp', this._file, JSON.stringify(this._state, null, 2), { where: 'machine-mounts.json', say: (w) => { if (!noSyncSaid) { noSyncSaid = true; this.log(w); } } }); } catch (e) { this.log(`machine-mounts.json not written (${(e && e.code) || 'error'}) — the old list stands on disk`); }",
    rel0: "    try { const t = this._file + '.tmp'; fs.writeFileSync(t, JSON.stringify(this._state, null, 2), { mode: 0o600 }); fs.renameSync(t, this._file); } catch { }" },   // stale-pins: kept — the release's body, compiled back in as the red control
  { rel: 'src/plugins.js', base: 'plugins.json', mode600: true,
    world: (M) => { const d = dirOf('msw-plugins'), lines = []; const pm = new M.PluginManager({ dataDir: d, plugins: [1, 2, 3].map((n) => PLUGIN(`made-up-${LETTER[n]}`)) }); return { d, file: path.join(d, 'plugins.json'), pm, lines, state: () => pm._state }; },
    act: (w, n) => w.pm.setEnabled(`made-up-${LETTER[n]}`, true),
    landed: (doc, n) => !!doc && doc.includes(`"made-up-${LETTER[n]}"`),
    failed: (t) => t.said.some((l) => /^\[plugins\] plugins\.json not written \(EIO\)/.test(l)),
    tip: "      require('./fd-close.js').renameSynced(this._file + '.tmp', this._file, JSON.stringify(this._state, null, 2), { mode: 0o600, where: 'plugins.json', say: (w) => { if (!noSyncSaid) { noSyncSaid = true; console.warn(`[plugins] ${w}`); } } });\n    } catch (e) { if (loud) throw e; console.warn(`[plugins] plugins.json not written (${(e && e.code) || 'error'}) — the old file stands on disk`); }",
    noMode: "      require('./fd-close.js').renameSynced(this._file + '.tmp', this._file, JSON.stringify(this._state, null, 2), { where: 'plugins.json', say: (w) => { if (!noSyncSaid) { noSyncSaid = true; console.warn(`[plugins] ${w}`); } } });\n    } catch (e) { if (loud) throw e; console.warn(`[plugins] plugins.json not written (${(e && e.code) || 'error'}) — the old file stands on disk`); }",
    rel0: "      const tmp = this._file + '.tmp';\n      fs.writeFileSync(tmp, JSON.stringify(this._state, null, 2), { mode: 0o600 });\n      fs.renameSync(tmp, this._file);\n    } catch (e) { if (loud) throw e; }" },   // stale-pins: kept — the release's body, compiled back in as the red control
  { rel: 'src/port-forward.js', base: 'port-forwards.json',
    world: (M) => {
      const d = dirOf('msw-ports'), lines = [];
      fs.writeFileSync(path.join(d, 'port-forwards.json'), JSON.stringify({ forwards: [1, 2, 3, 4].map((n) => ({ id: `pf-made${n}`, hostId: `host-made${n}`, remotePort: 8000 + n, label: `made-up ${n}` })) }, null, 2));
      const pf = new M.PortForwardManager({ hosts: { list: () => [] }, dataDir: d, plugins: null, broadcast: () => { }, log: (l) => lines.push(String(l)), getJobs: () => null });
      MADE.push(pf);
      return { d, file: path.join(d, 'port-forwards.json'), pf, lines, state: () => pf._state };
    },
    act: (w, n) => w.pf.onMachineUnpaired(`host-made${n}`),
    landed: (doc, n) => !!doc && !doc.includes(`"host-made${n}"`),
    failed: (t) => t.w.lines.some((l) => /^port-forward persist: .*EIO/.test(l)),
    tip: "  require('./fd-close.js').renameSynced(file + '.tmp', file, JSON.stringify(obj, null, 2), { where: 'port-forwards.json', say: (w) => { if (!noSyncSaid) { noSyncSaid = true; console.warn(`[ports] ${w}`); } } });",
    rel0: "  const tmp = file + '.tmp';\n  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));\n  fs.renameSync(tmp, file);" },   // stale-pins: kept — the release's body, compiled back in as the red control
  { rel: 'src/server/instance-url.js', base: 'instance-url.json',
    world: (M) => { const d = dirOf('msw-publish'), lines = []; const iu = M.create({ dataDir: d, plugins: RELAY, port: 1, log: (l) => lines.push(String(l)) }); return { d, file: path.join(d, 'instance-url.json'), iu, lines, state: null }; },
    act: (w, n) => w.iu.publish({ sub: `made-up-sub${n}` }),
    landed: (doc, n) => !!doc && doc.includes(`made-up-sub${n}`),
    failed: (t) => t.w.lines.some((l) => /^\[instance-url\] persist failed: .*EIO/.test(l)),
    tip: "  require('../fd-close.js').renameSynced(file + '.tmp', file, JSON.stringify(obj, null, 2), { where: 'instance-url.json', say: (w) => { if (!noSyncSaid) { noSyncSaid = true; console.warn(`[instance-url] ${w}`); } } });",
    rel0: "  fs.writeFileSync(file + '.tmp', JSON.stringify(obj, null, 2));\n  fs.renameSync(file + '.tmp', file);" },   // stale-pins: kept — the release's body, compiled back in as the red control
];

/** one store's scene under a placed sync code: a first act lands (the old file), the second meets the placed sync */
async function scene(R, M, code) {
  const w = R.world(M);
  await R.act(w, 1);
  const old = bytes(w.file);
  const p = placeSync(w.file, code);
  let r = null, threw = null, said = [];
  try { const x = await warnsOf(async () => { try { return await R.act(w, 2); } catch (e) { threw = e; return null; } }); r = x.r; said = x.out; } finally { p.restore(); }
  return { w, r, threw, old, now: bytes(w.file), asked: p.asked.length, temps: temps(w.d, R.base), said };
}

console.log('S1 a sync that FAILS is a failed write that reaches its caller; the old file stands (five stores, each through its real act)');
for (const R of STORES) {
  const M = require(path.join(REPO, R.rel));
  const t = await scene(R, M, 'EIO');
  const facts = { asked: t.asked, threw: t.threw && t.threw.code, oldKept: t.now === t.old, temps: t.temps, failedSaid: R.failed(t), said: t.said.slice(-2), lines: t.w.lines.slice(-2) };
  console.log(`    ${R.base}: ${JSON.stringify(facts)}`);
  ok(!!t.old && !R.landed(t.old, 2) && t.asked >= 1 && t.now === t.old && t.temps.length === 0 && R.failed(t),
    `S1 ${R.base} (${R.rel}): a sync of its own temp asked; the placed EIO fails the write to its caller (thrown, or its own words), the OLD file stands byte for byte, no temp left`, facts);
  // RED: the release's body — its own unsynced temp + rename
  let red = null, why = null;
  try { red = await scene(R, asModule(R.rel, anchored(srcOf(R.rel), R.tip, R.rel0, `s1-${R.base}-release`)), 'EIO'); } catch (e) { why = e.message; }
  const rf = red && { asked: red.asked, newTookName: R.landed(red.now, 2), failedSaid: R.failed(red) };
  console.log(`    RED copy ${R.base}: ${JSON.stringify(rf || why)}`);
  ok(!!red && red.asked === 0 && rf.newTookName && !rf.failedSaid,
    `S1 RED CONTROL ${R.base}: the release's body asks no sync — under the same placed EIO the NEW bytes take the name and the caller hears nothing`, rf || why);
}

console.log('S2 a file system with no sync at all: the write lands, said ONCE a run; the bytes are the store\'s state as the release wrote them');
for (const R of STORES) {
  const M = require(path.join(REPO, R.rel));
  const w = R.world(M);
  await R.act(w, 1);
  const p = placeSync(w.file, 'EINVAL');
  let a, b, d2 = null;
  try { a = await warnsOf(() => R.act(w, 2)); d2 = bytes(w.file); b = await warnsOf(() => R.act(w, 3)); } finally { p.restore(); }
  const lines = [...a.out, ...b.out, ...w.lines].filter((l) => l.includes(`${R.base}: its file system does not do a sync (EINVAL)`));
  const doc = bytes(w.file);
  const facts = { asked: p.asked.length, lines, landed: [R.landed(d2, 2), R.landed(doc, 3)], temps: temps(w.d, R.base), asState: w.state ? doc === JSON.stringify(w.state(), null, 2) : 'n/a' };
  ok(p.asked.length >= 2 && lines.length === 1 && !lines[0].includes(w.d) && facts.landed.every(Boolean) && facts.temps.length === 0 && facts.asState !== false,
    `S2 ${R.base}: two writes on a file system that does no sync (EINVAL) both land; «does not do a sync» is said ONCE a run, with the store's name and the code (no path); the bytes are its state, two-space JSON`, facts);
}

console.log('S3 the credential stores keep 0600');
for (const R of STORES.filter((x) => x.mode600)) {
  const M = require(path.join(REPO, R.rel));
  const w = R.world(M);
  await R.act(w, 1);
  const mode = modeOf(w.file);
  ok(mode === 0o600, `S3 ${R.base}: written through the door with its mode — 0600 (the person's credentials and tokens)`, { mode: mode && mode.toString(8) });
  let red = null, why = null;
  try { const C = asModule(R.rel, anchored(srcOf(R.rel), R.tip, R.noMode, `s3-${R.base}-no-mode`)); const wr = R.world(C); await R.act(wr, 1); red = modeOf(wr.file); } catch (e) { why = e.message; }
  ok(red !== null && (red & 0o077) !== 0, `S3 RED CONTROL ${R.base}: the door asked without the mode leaves the file readable by others`, { mode: red !== null ? red.toString(8) : why });
}

console.log('L plugins.json\'s loud road (the one-time rename migration): a failed sync is THROWN, the old record stands');
{
  const R = STORES.find((x) => x.base === 'plugins.json');
  const loud = async (M) => {
    const d = dirOf('msw-plugins-loud'), file = path.join(d, 'plugins.json');
    fs.writeFileSync(file, JSON.stringify({ plugins: { 'made-up-old': { enabled: true } } }, null, 2));
    const pm = new M.PluginManager({ dataDir: d, plugins: [PLUGIN('made-up-a')] });
    const old = bytes(file), p = placeSync(file, 'EIO');
    let threw = null; try { pm.renamePlugin('made-up-old', 'made-up-a'); } catch (e) { threw = e; } finally { p.restore(); }
    return { old, now: bytes(file), threw: threw && threw.code, asked: p.asked.length, temps: temps(d, 'plugins.json') };
  };
  const t = await loud(require(path.join(REPO, R.rel)));
  ok(t.asked === 1 && t.threw === 'EIO' && t.now === t.old && t.now.includes('"made-up-old"') && t.temps.length === 0,
    'L plugins.json (renamePlugin, the migration\'s write): the placed EIO is THROWN to the migration (run again at the next start), the old record stands byte for byte, no temp left', t);
  let red = null, why = null;
  try { red = await loud(asModule(R.rel, anchored(srcOf(R.rel), R.tip, R.rel0, 'l-plugins-release'))); } catch (e) { why = e.message; }
  ok(!!red && red.asked === 0 && !red.threw && !!red.now && red.now.includes('"made-up-a"'),
    'L RED CONTROL: the release\'s body asks no sync — the migration «succeeds» and the moved record takes the name unsynced', red || why);
}

console.log('M machine-mounts.json\'s one-time migration: a failed sync is a failed save — the legacy store kept, nothing renamed away');
{
  const REL = 'src/machine-mounts.js';
  const MIG_TIP = "      require('./fd-close.js').renameSynced(this._file + '.tmp', this._file, JSON.stringify(this._state, null, 2), { mode: 0o600, where: 'machine-mounts.json', say: (w) => { if (!noSyncSaid) { noSyncSaid = true; this.log(w); } } });";
  const MIG_REL0 = "      const t = this._file + '.tmp';\n      fs.writeFileSync(t, JSON.stringify(this._state, null, 2), { mode: 0o600 });\n      fs.renameSync(t, this._file);";   // stale-pins: kept — the release's body, compiled back in as the red control
  const boot = (M) => {
    const d = dirOf('msw-migrate'), lines = [], file = path.join(d, 'machine-mounts.json'), legacy = path.join(d, 'host-mounts.json');
    fs.writeFileSync(legacy, JSON.stringify({ mounts: [{ id: 'hm-made1', hostId: 'host-made', folder: '/srv/made', mountpoint: path.join(d, 'mnt'), mode: 'ro', os: 'linux', method: 'rclone-webdav', tokenId: 'tk-made', tunnelPort: 40001, mountedAt: 1 }] }));
    const p = placeSync(file, 'EIO');
    let m = null, threw = null;
    try { m = new M.MachineMounts({ dataDir: d, hosts: { held: () => false, get: () => { throw new Error('no such machine'); }, findByDeviceId: () => null, list: () => [] }, mountTokens: { mint: () => null }, log: (l) => lines.push(String(l)) }); } catch (e) { threw = e.message; } finally { p.restore(); }
    if (m) MADE.push(m);
    return { asked: p.asked.length, threw, store: bytes(file), legacyKept: fs.existsSync(legacy), migrated: fs.existsSync(legacy + '.migrated'), temps: temps(d, 'machine-mounts.json'), failedSaid: lines.some((l) => l.startsWith('migration save FAILED') && l.includes('EIO')) };
  };
  const t = boot(require(path.join(REPO, REL)));
  ok(t.asked === 1 && !t.threw && t.store === null && t.legacyKept && !t.migrated && t.temps.length === 0 && t.failedSaid,
    'M the migration\'s save under a placed EIO: a sync asked, the save FAILED and said, no machine-mounts.json and no temp, the legacy store NOT renamed .migrated (the ingest runs again at the next start)', t);
  let red = null, why = null;
  try { red = boot(asModule(REL, anchored(srcOf(REL), MIG_TIP, MIG_REL0, 'm-migrate-release'))); } catch (e) { why = e.message; }
  ok(!!red && red.asked === 0 && !!red.store && red.store.includes('hm-made1') && red.migrated && !red.legacyKept,
    'M RED CONTROL: the release\'s migration asks no sync — the store takes its name unsynced and the legacy store is renamed away beside it', red || why);
}

for (const x of MADE) { try { clearInterval(x._sweep); clearInterval(x._watch); } catch { /* none */ } }
report();

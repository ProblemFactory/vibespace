#!/usr/bin/env node
// B-e783 — THE CLOUD MOUNTS' /proc WALK LEAVES THE LOOP, IS BOUNDED, AND NEVER READS A SLEEPER'S COMMAND LINE. src/mounts.js
// _daemonPids (every liveness probe asks it), _killMountDaemon, _killOrphanAuthorize and _cpuTicks read /proc SYNCHRONOUSLY on
// the hub's loop — readdirSync + every process's command line. Four reads refuted four rounds; their rules, all pinned here
// over a PLANTED /proc (the manager's `_procOpts`; pids above the kernel's maximum):
//   ① OUR daemons are named by what they hold (stdout = the mount's own log, readlink of fd/1): this mount's, in any state —
//      ② asleep in the kernel: named, adopted, alive, killed as itself; ③ the log's rotation, a rotated file since deleted, a
//      data dir through a symlink; ④ every record on one mount point counts (a credential and its child, two names → one folder);
//      another record's daemon never counts, never «can't tell».
//   ⑤ any OTHER process by the release's rule (argv), an rclone by its comm only, and only while no thread of it sleeps: a
//      hand-started rclone on the mount point is found; one asleep, or with a sleeping thread, is «can't tell» (its command line
//      never read); a non-rclone process's command line is never read; another user's process (EACCES) is not ours.
//   ⑥ «can't tell ⇒ alive»: /proc not listed; no /proc; a process it could not read; a read that never answers ends the walk
//      (bounded per read) and that process is never asked again.   ⑦ a daemon this manager killed is never adopted while it lingers.
//   ⑧ the authorize sweep: an rclone authorize only.   ⑨ _cpuTicks; a liveness probe makes 0 sync /proc calls.
//   ⑩ the sweep and the probe's teardown look again (starting, connecting, unmounted, connected again).
//   ⑪ startDriveAuth: a Cancel or a newer press while the orphan sweep runs ⇒ that press spawns nothing.
//   ⑫ (r6) «can't tell» is never «dead» by itself and never «alive» for every mount: the sweep asks the mount point (a dead FUSE
//      entry fails `ls -d`), the teardown roads do not wait on it; the RECORDED daemon is judged by its stat line (no walk) and
//      killed without one (a parked pool); our own daemon whose fd/1 is refused (non-dumpable) is judged by its argv; a process
//      that merely holds the log (a sleep child) is no daemon.
//   ⑬ (r7) a connect neither adopts nor spawns while the walk cannot tell; the spawned daemon is recorded at once (one stat
//      line, never the pool); the log dir's real path is asked under the walk's bound.
//   ⑮ (the cure, cure 2) the wait's hung kill by identity, remembered (never adopted while it lingers; gone / recycled ⇒ «died»);
//      a partial walk's named daemon alive; a recycled pid on the record roads; the killed set pruned by a later listing; a
//      daemon killed while a walk ran never handed out (normal end or a stall).
//   ⑭ (r8, r9) «can't tell» at a connect names its process (in the journal) and waits at most CANT_TELL_MS from the first refusal
//      of its episode; a refused connect keeps the ask unless the person unmounted meanwhile; a press
//      on a mounted record moves no generation; a removed record's verdict is dropped; the witness's child that never started
//      answers nothing; the sweep's witness waits the row's attr patience.
//   RED CONTROLS from ONE patched copy, a flag per cut.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { scratch } from './scratch.mjs';
import { checker } from './lib/check.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const SRC = path.join(REPO, 'src');
const { ok, report } = checker();
const MSRC = fs.readFileSync(path.join(SRC, 'mounts.js'), 'utf8');
if (!/this\._procOpts/.test(MSRC)) { console.log('  SKIP test-mounts-proc-walk: this tree\'s src/mounts.js has no planted-/proc seam (an older tree) — its kills would walk the REAL /proc'); report(); }
for (const k of Object.keys(process.env)) if (/^VIBESPACE_(S3_|CEPHFS_)/.test(k)) delete process.env[k];   // the cure's readers: the constructor imports deployment storage (and saves) before make() can stub _save
const tmp0 = scratch('mprocwalk'); fs.mkdirSync(tmp0, { recursive: true });
const tmp = fs.realpathSync(tmp0);   // the planted links state REAL paths (as readlink does)
const P = path.join(tmp, 'proc'), E = path.join(tmp, 'no-proc'), D = path.join(tmp, 'data'), DL = path.join(tmp, 'data-link');
for (const d of [path.join(P, 'self'), E, path.join(D, 'mount-logs')]) fs.mkdirSync(d, { recursive: true });
fs.symlinkSync(D, DL);
fs.writeFileSync(path.join(P, 'self', 'stat'), '1 (node) S');
const B = 7100400;   // planted pids: above the kernel's maximum pid — never a real process
const statLine = (pid, comm, state, start, ut = 0, st = 0) => `${pid} (${comm}) ${state} 1 ${pid} ${pid} 0 -1 0 0 0 0 0 ${ut} ${st} 0 0 20 0 1 0 ${start} 0 0`;
const fake = (n, comm, start, state = 'S', { out = null, argv = null, utime = 0, stime = 0, threads = [] } = {}) => {
  const pid = B + n, dir = path.join(P, String(pid));
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, 'fd'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'cmdline'), argv ? argv.join('\0') + '\0' : '');
  fs.writeFileSync(path.join(dir, 'stat'), statLine(pid, comm, state, start, utime, stime));
  for (const [i, ts] of [[pid, state], ...threads.map((t, k) => [pid * 10 + k, t])]) { fs.mkdirSync(path.join(dir, 'task', String(i)), { recursive: true }); fs.writeFileSync(path.join(dir, 'task', String(i), 'stat'), statLine(i, comm, ts, start)); }
  if (out) fs.symlinkSync(out, path.join(dir, 'fd', '1'));
  return pid;
};
const unplant = (pid) => fs.rmSync(path.join(P, String(pid)), { recursive: true, force: true });
const MP = path.join(tmp, 'mnt', 'OneDrive'), MP3 = path.join(tmp, 'mnt', 'Drive');
const LOG = path.join(D, 'mount-logs', 'od.log'), LOG3 = path.join(D, 'mount-logs', 'dr.log'), LOGW = path.join(D, 'mount-logs', 'wk.log');
const daemon = (n, start, state = 'S', out = LOG) => fake(n, 'rclone', start, state, { out, argv: ['/opt/bin/rclone', 'mount', 'od:', MP], utime: 70, stime: 30 });
const P1 = daemon(1, 1000);
fake(2, 'rclone', 1100, 'S', { out: LOG3, argv: ['/opt/bin/rclone', 'mount', 'dr:', MP3] });   // another record's daemon
fake(3, 'rclone', 1200, 'D', { out: LOG3 });                                                   // another record's daemon, asleep
fake(4, 'bash', 1300, 'S', { out: '/dev/null', argv: ['/bin/bash', '-c', 'mount ' + MP] });     // a non-rclone process naming the path
const P5 = fake(5, 'rclone', 1400, 'S', { out: '/dev/null', argv: ['/opt/bin/rclone', 'authorize', 'drive', '--auth-no-open-browser'] });
const P6 = fake(6, 'rclone', 1500, 'Z', { out: LOG });                                          // a zombie
const RECS = [{ id: 'od', name: 'OneDrive', type: 'onedrive', customPath: MP }, { id: 'dr', name: 'Drive', type: 'drive', customPath: MP3 }];
const SYNC_WALK = "{ const root = (this._procOpts && this._procOpts.procRoot) || '/proc', out = []; for (const pid of fs.readdirSync(root).filter((d) => /^\\d+$/.test(d))) { let argv; try { argv = fs.readFileSync(`${root}/${pid}/cmdline`, 'utf-8').split('\\0'); } catch { continue; } if (argv.includes('mount') && argv.includes(mp) && /rclone/.test(argv[0] || '')) out.push(+pid); } return out; }";   // stale-pins: kept — the CONTROL re-creates the release's sync walk on purpose
const cuts = [
  ['logcomm', "if (st.err || !/rclone/.test(st.comm) || st.state === 'Z' || st.state === 'X' ||", "if (st.err || (!globalThis.__mpCut.logcomm && !/rclone/.test(st.comm)) || st.state === 'Z' || st.state === 'X' ||"],
  ['fd1', "          if (to && owners.has(to)) {", "          if (!globalThis.__mpCut.fd1 && to && owners.has(to)) {"],
  ['here', "return this.pathOf(x) === mp; } catch { return false; } }).map((x) => x.id));", "return this.pathOf(x) === mp; } catch { return false; } }).map((x) => x.id).slice(0, globalThis.__mpCut.here ? 1 : undefined));"],
  ['deleted', ".replace(/ \\(deleted\\)$/, '');", "; if (!globalThis.__mpCut.deleted) to = to.replace(/ \\(deleted\\)$/, '');"],
  ['real', "[this._logDir, this._logDirReal]", "[this._logDir, globalThis.__mpCut.real ? null : this._logDirReal]"],
  ['owner', "              if (!o || myUid == null || o.uid !== myUid) continue;", "              if (globalThis.__mpCut.uidcheck || (!globalThis.__mpCut.eacces && (!o || myUid == null || o.uid !== myUid))) continue;"],
  ['comm', "        if (!/rclone/.test(st.comm) || st.state === 'Z' || st.state === 'X') continue;", "        if ((!globalThis.__mpCut.comm && !/rclone/.test(st.comm)) || st.state === 'Z' || st.state === 'X') continue;"],
  ['sleep', "        if (skip.has(key) || st.state === 'D' || await this._threadAsleep(root, pid, read)) { cant(pid); continue; }",
    "        if ((!globalThis.__mpCut.skip && skip.has(key)) || (!globalThis.__mpCut.dleader && st.state === 'D') || (!globalThis.__mpCut.dthread && await this._threadAsleep(root, pid, read))) { cant(pid); continue; }"],
  ['killed1', "|| killed.has(pid + ':' + st.start)) continue;", "|| (!globalThis.__mpCut.killed && killed.has(pid + ':' + st.start))) continue;"],
  ['killed2', "        if (killed.has(key)) continue;", "        if (!globalThis.__mpCut.killed && killed.has(key)) continue;"],
  ['unread', "    return w.unread > 0 ? 'unknown' : 'dead';", "    return (!globalThis.__mpCut.unread && w.unread > 0) ? 'unknown' : 'dead';"],
  ['record', "    if (this._recordedAlive(mp)) return 'alive';", "    if (!globalThis.__mpCut.record && this._recordedAlive(mp)) return 'alive';"],
  ['witness', "    return witness ? !(await this._zombieAt(mp, attrMs)) : false;", "    return globalThis.__mpCut.witness ? true : (witness ? !(await this._zombieAt(mp, attrMs)) : false);"],
  ['recordKill', "    sig(this._daemonIds && this._daemonIds.get(mp));", "    if (!globalThis.__mpCut.recordKill) sig(this._daemonIds && this._daemonIds.get(mp));"],
  ['strict', "      const pids = (await read(null, fs.promises.readdir(root))).filter(", "      const pids = (await read(null, globalThis.__mpCut.strict ? fs.promises.readdir(root).catch(() => []) : fs.promises.readdir(root))).filter("],
  ['noproc', "    if (!hasProc(this._procOpts)) return 'noproc';", "    if (!globalThis.__mpCut.noproc && !hasProc(this._procOpts)) return 'noproc';"],
  ['stallskip', "if (e && e.code === 'walk_stalled' && inFlight) skip.set(inFlight, Date.now());", "if (!globalThis.__mpCut.stallskip && e && e.code === 'walk_stalled' && inFlight) skip.set(inFlight, Date.now());"],
  ['look', "          if (this._starting?.has(m.id) || this._connecting?.has(m.id) || !this.isMounted(m) || this._mountGen?.get(m.id) !== gen0) continue;",
    "          if ((!globalThis.__mpCut.lookStart && this._starting?.has(m.id)) || (!globalThis.__mpCut.lookConn && this._connecting?.has(m.id)) || (!globalThis.__mpCut.lookMounted && !this.isMounted(m)) || (!globalThis.__mpCut.lookGen && this._mountGen?.get(m.id) !== gen0)) continue;"],
  ['gone', "!this._state.mounts.some((x) => x.id === m.id) || (w &&", "(!globalThis.__mpCut.gone && !this._state.mounts.some((x) => x.id === m.id)) || (w &&"],
  ['probeGen', "(w && 'gen0' in w && this._mountGen?.get(m.id) !== w.gen0)) return {", "(!globalThis.__mpCut.probeGen && w && 'gen0' in w && this._mountGen?.get(m.id) !== w.gen0)) return {"],
  ['bound', "    if (now - since < (this._cantTellMs ?? CANT_TELL_MS)) return null;", "    if (globalThis.__mpCut.bound || now - since < (this._cantTellMs ?? CANT_TELL_MS)) return null;"],
  ['episode', "was && now - was.at < CANT_TELL_GAP_MS ? was.since : now", "was && (globalThis.__mpCut.episode || now - was.at < CANT_TELL_GAP_MS) ? was.since : now"],
  ['turn', "      if (this._mountGen?.get(id) !== myGen || !this._state.mounts.some((x) => x.id === id)) {", "      if (!globalThis.__mpCut.turn && (this._mountGen?.get(id) !== myGen || !this._state.mounts.some((x) => x.id === id))) {"],
  ['turnWait', "{ this._cantTell?.delete(this.pathOf(m)); return false; }", "{ if (!globalThis.__mpCut.turnWait) this._cantTell?.delete(this.pathOf(m)); return false; }"],
  ['desired', "      m.desired = 'mounted'; this._save();   // re-authorize's bounce", "      if (!globalThis.__mpCut.desired) { m.desired = 'mounted'; this._save(); }   // re-authorize's bounce"],
  ['spawnErr', " && !r.spawnErr; }", " && (globalThis.__mpCut.spawnErr || !r.spawnErr); }"],
  ['bumpEarly', "  async mount(id) {\n", "  async mount(id) {\n    if (globalThis.__mpCut.bumpEarly) this._bumpGen(id);\n"],
  ['adoptStrict', "await this._daemonPids(mp, { strict: true })", "await this._daemonPids(mp, { strict: !globalThis.__mpCut.adoptStrict })"],
  ['realBound', "      await read(null, p);   // bounded like every read of the walk", "      await (globalThis.__mpCut.realBound ? p : read(null, p));"],
  ['realOne', "const p = this._logDirRealP || (this._logDirRealP = ", "const p = (globalThis.__mpCut.realOne ? null : this._logDirRealP) || (this._logDirRealP = "],
  ['waitKill', "          const r = ident ? PI.signalIdentity(ident, 'SIGKILL', popts) : { ok: false, why: 'unknown-identity' };", "          const r = globalThis.__mpCut.waitKill ? (popts.kill(pid, 'SIGKILL'), { ok: true }) : ident ? PI.signalIdentity(ident, 'SIGKILL', popts) : { ok: false, why: 'unknown-identity' };"],
  ['waitKilled', "          if (r.ok) { (this._killed || (this._killed = new Map())).set(", "          if (r.ok && !globalThis.__mpCut.waitKilled) { (this._killed || (this._killed = new Map())).set("],
  ['goneDied', "          else if (r.why === 'gone' || r.why === 'pid-recycled') return resolve('died');", "          else if ((r.why === 'gone' || r.why === 'pid-recycled') && !globalThis.__mpCut.goneDied) return resolve('died');"],
  ['killedTtl', "    for (const [k, at] of [...killed]) if (at < listedAt && !seen.has(k.split(':')[0])) killed.delete(k);", "    for (const [k, at] of [...killed]) if (globalThis.__mpCut.killedTtl ? Date.now() - at > 60000 : (at < listedAt || globalThis.__mpCut.listedAt) && !seen.has(k.split(':')[0])) killed.delete(k);"],
  ['handOut', "  _unkilled(list) { if (!list.length) return list;", "  _unkilled(list) { if (globalThis.__mpCut.handOut || !list.length) return list;"],
  ['recDrop', "if (this._daemonIds && this._daemonIds.get(mp)?.pid === ident.pid) this._daemonIds.delete(mp); }", "if (!globalThis.__mpCut.recDrop && this._daemonIds && this._daemonIds.get(mp)?.pid === ident.pid) this._daemonIds.delete(mp); }"],
  ['recKilled', "  _record(mp, id) { if (this._killed && this._killed.has(id.pid + ':' + id.starttime)) return;", "  _record(mp, id) { if (!globalThis.__mpCut.recKilled && this._killed && this._killed.has(id.pid + ':' + id.starttime)) return;"],
  ['partialAlive', "if (named.length) { this._record(mp, named[0]); return 'alive'; }", "if (named.length && !globalThis.__mpCut.partialAlive) { this._record(mp, named[0]); return 'alive'; }"],
  ['recAliveId', "    const a = PI.aliveIdentity(rec, o);", "    const a = globalThis.__mpCut.recAliveId ? true : PI.aliveIdentity(rec, o);"],
  ['recKillId', "      const r = PI.signalIdentity(id, 'SIGKILL', opts);", "      const r = globalThis.__mpCut.recKillId ? (opts.kill(id.pid, 'SIGKILL'), { ok: true }) : PI.signalIdentity(id, 'SIGKILL', opts);"],
  ['sync', "  async _daemonPids(mp, { strict = false } = {}) {\n", "  async _daemonPids(mp, { strict = false } = {}) {\n    if (globalThis.__mpCut.sync) " + SYNC_WALK + "\n"],
  ['gen', "    if (gen !== this._driveAuthGen) return { error:", "    if (!globalThis.__mpCut.gen && gen !== this._driveAuthGen) return { error:"],
];
const miss = cuts.filter(([, a]) => MSRC.split(a).length !== 2).map(([k]) => k);
let MG = null;
if (miss.length) ok(false, 'CONTROL: the src/mounts.js anchors were found once each', miss.join());
else {
  globalThis.__mpCut = {};
  const cp = path.join(tmp, 'mounts-cuts.js');
  fs.writeFileSync(cp, cuts.reduce((x, [, a, b]) => x.replace(a, () => b), MSRC).replace(/require\('\.\//g, `require('${SRC}/`));
  MG = require(cp).MountManager;
}
const cut = async (k, f) => { globalThis.__mpCut = Object.fromEntries([].concat(k).map((x) => [x, true])); try { return await f(); } finally { globalThis.__mpCut = {}; } };
const { MountManager } = require(path.join(SRC, 'mounts.js'));
const make = (MM, { root = P, kill = () => { }, dataDir = D, recs = RECS } = {}) => {
  const mm = new MM({ dataDir, broadcast: () => { } }); mm._procOpts = { procRoot: root, kill };
  mm._save = () => { };   // r9: a leg never writes mounts.json — the next manager would load its records twice (and slower)
  mm._probeMountpoint = async () => ({ health: mm.__zombie ? 'error' : 'ok', ms: 1 });   // the witness: a dead FUSE entry fails `ls -d`
  mm._state.mounts.push(...recs.map((r) => ({ ...r })));
  return mm;
};
const withP1 = async (state, f) => { unplant(P1); const z = daemon(1, 1000, state.state || 'S', state.out === undefined ? LOG : state.out); try { return await f(z); } finally { daemon(1, 1000); } };
// ① ② ③ ④ — our daemons by their log
const ours = (MM, { state = 'S', out = LOG, dataDir = D } = {}) => withP1({ state, out }, async (z) => {
  const sig = [], mm = make(MM, { kill: (pid, s) => sig.push([pid, s]), dataDir });
  return { z, pids: await mm._daemonPids(MP), alive: await mm._daemonAlive(MP), hit: await mm._killMountDaemon(MP), sig };
});
const shared = async (MM) => {   // ④: «谷歌» (a credential, listed first, never mounted) and its mounted child «工作» on ONE mount point
  unplant(P1); const z = fake(11, 'rclone', 1110, 'S', { out: LOGW, argv: ['/opt/bin/rclone', 'mount', 'wk:', MP] });
  try { return { z, pids: await make(MM, { recs: [{ id: 'gg', name: '谷歌', type: 'drive', customPath: MP, kind: 'credential' }, { id: 'wk', name: '工作', type: 'drive', customPath: MP }] })._daemonPids(MP) }; }
  finally { unplant(z); daemon(1, 1000); }
};
const others = async (MM) => { unplant(P1); try { return await make(MM)._daemonAlive(MP); } finally { daemon(1, 1000); } };   // ④ another record's daemons only
// ⑤ any other process: the release's rule, read only when safe
const handStarted = async (MM, { state = 'S', threads = [] } = {}) => {
  unplant(P1); const z = fake(12, 'rclone', 1210, state, { out: '/dev/null', argv: ['/usr/bin/rclone', 'mount', 'mine:', MP], threads });
  const rf = fs.promises.readFile; let read = 0;
  fs.promises.readFile = async function (q, ...a) { if (String(q) === path.join(P, String(z), 'cmdline')) read++; return rf.call(this, q, ...a); };
  try { const mm = make(MM); return { z, pids: await mm._daemonPids(MP), alive: await mm._daemonAlive(MP), read }; }
  finally { fs.promises.readFile = rf; unplant(z); daemon(1, 1000); }
};
const commOnly = async (MM) => {   // ⑤: the non-rclone process's command line is never read
  const rf = fs.promises.readFile; let read = 0;
  fs.promises.readFile = async function (q, ...a) { if (String(q) === path.join(P, String(B + 4), 'cmdline')) read++; return rf.call(this, q, ...a); };
  try { await make(MM)._daemonPids(MP); return read; } finally { fs.promises.readFile = rf; }
};
const foreign = async (MM) => {   // ⑤: another user's rclone on the mount point (its fd/1 refused)
  unplant(P1); const z = fake(13, 'rclone', 1310, 'S', { out: '/dev/null', argv: ['/usr/bin/rclone', 'mount', 'theirs:', MP] });
  const rl = fs.promises.readlink, rs = fs.promises.stat;
  fs.promises.readlink = async function (q, ...a) { if (String(q) === path.join(P, String(z), 'fd', '1')) throw Object.assign(new Error('EACCES'), { code: 'EACCES' }); return rl.call(this, q, ...a); };
  fs.promises.stat = async function (q, ...a) { const r = await rs.call(this, q, ...a); if (String(q) === path.join(P, String(z))) return Object.assign(Object.create(Object.getPrototypeOf(r)), r, { uid: (process.getuid ? process.getuid() : 0) + 1 }); return r; };
  try { return { pids: await make(MM)._daemonPids(MP), alive: await make(MM)._daemonAlive(MP) }; } finally { fs.promises.readlink = rl; fs.promises.stat = rs; unplant(z); daemon(1, 1000); }
};
// ⑥ can't tell
const cantTell = async (MM, kind) => {
  if (kind === 'noproc') { const mm = make(MM, { root: E }); let threw = false; try { await mm._daemonPids(MP); } catch { threw = true; } return { alive: await mm._daemonAlive(MP), threw }; }
  unplant(P1);
  const z = fake(14, 'rclone', 1410, 'S', { out: '/dev/null', argv: ['/usr/bin/rclone', 'version'] });
  const rf = fs.promises.readFile, rd = fs.promises.readdir; let reads = 0;
  const keep = setInterval(() => { }, 1000);   // a read that never answers holds nothing of the loop: keep it alive meanwhile
  if (kind === 'unlisted') fs.promises.readdir = async function (q, ...a) { if (String(q) === P) throw Object.assign(new Error('EMFILE'), { code: 'EMFILE' }); return rd.call(this, q, ...a); };
  if (kind === 'unread') fs.promises.readFile = async function (q, ...a) { if (String(q) === path.join(P, String(z), 'stat')) throw Object.assign(new Error('EMFILE'), { code: 'EMFILE' }); return rf.call(this, q, ...a); };
  if (kind === 'stall') fs.promises.readFile = async function (q, ...a) { if (String(q) === path.join(P, String(z), 'cmdline')) { reads++; return new Promise(() => { }); } return rf.call(this, q, ...a); };
  try { const mm = make(MM); mm._readMs = 300; const a1 = await mm._daemonAlive(MP); const a2 = await mm._daemonAlive(MP); return { alive: a1 && a2, reads }; }
  finally { clearInterval(keep); fs.promises.readFile = rf; fs.promises.readdir = rd; unplant(z); daemon(1, 1000); }
};
const killedLingers = async (MM) => { const mm = make(MM); const hit = await mm._killMountDaemon(MP); return { hit, after: await mm._daemonPids(MP) }; };   // ⑦
const authorize = async (MM) => { const sig = [], mm = make(MM, { kill: (pid, s) => sig.push([pid, s]) }); return { hit: await mm._killOrphanAuthorize(), sig }; };   // ⑧
const probeSync = async (MM) => {   // ⑨
  const g = make(MM);
  g._probeMountpoint = async (mp, ms, verb) => verb === 'attr' ? { health: 'ok', ms: 4 } : { health: 'ok', ms: 30 };
  g._probeBackendAccess = async () => 'ok'; g._accessErrorFor = async () => null;
  await g._daemonPids(MP);   // the walk's one-time questions (is there a /proc; the log dir's real path) asked before the count
  g._daemonIds?.clear();   // r7 (its sixth read): the counted probe WALKS (no record to judge by)
  const names = ['readdirSync', 'readFileSync', 'readlinkSync', 'realpathSync'];
  const orig = Object.fromEntries(names.map((k) => [k, fs[k]])); let n = 0;
  for (const k of names) fs[k] = function (q, ...a) { const t = String(q); if ((t.startsWith(P) || t.startsWith('/proc')) && !(k === 'readFileSync' && (/\/stat$/.test(t) || /\/boot_id$/.test(t)))) n++; return orig[k].call(this, q, ...a); };   // a walk's sync reads; ONE stat line per CPU read (and the identity judge's stat / boot id) is the release's own
  let err = null;
  try { await g._probeLiveness(g._state.mounts[0], MP); } catch (e) { err = String(e && e.message || e); } finally { for (const k of names) fs[k] = orig[k]; }
  return { n, err };
};
const secondLook = async (MM, why) => {   // ⑩ the sweep
  const g = make(MM), calls = [];
  g._state.mounts.splice(1);
  let mounted = true;
  g.isMounted = () => mounted; g._kindOf = () => 'mount';
  g._daemonAlive = async () => {
    if (why === 'starting') g._starting = new Map([['od', { phase: 'scan' }]]);
    if (why === 'connecting') g._connecting = new Set(['od']);
    if (why === 'unmounted') mounted = false;
    if (why === 'again') g._bumpGen('od');
    return false;
  };
  g.unmount = async (id) => { calls.push(id); };
  g._probeLiveness = async () => null; g._livenessApply = async () => { };
  await g._healthSweep();
  return calls;
};
const probeTeardown = async (MM) => {   // ⑩ the probe's teardown: the person connected again while the witnesses were gathered
  const L = require(path.join(SRC, 'mount-liveness.js')), step0 = L.livenessStep;
  L.livenessStep = () => ({ teardown: true, verdict: 'wedged', state: {}, strikes: { n: 2 }, words: { key: 'slow', vars: { s: 1 } } });
  const g = make(MM), calls = [];
  g.unmount = async (id) => { calls.push(id); }; g._killMountDaemon = async () => []; g._noteReconnectBackoff = () => { };
  g._bumpGen('od'); const gen0 = g._mountGen.get('od'); g._bumpGen('od');
  try { await g._livenessApply(g._state.mounts[0], MP, { daemonAlive: true, list: { state: 'hung', ms: 1 }, attr: { state: 'ok', ms: 1 }, gen0 }); return { calls, words: g._errors.get('od') || null, kept: !!(g._liveness && g._liveness.get('od')) }; }
  finally { L.livenessStep = step0; }
};
const r6legs = async (MM) => {   // ⑫
  const out = {};
  { const mm = make(MM); await mm._daemonPids(MP);   // the walk names P1 and records it
    const rd = fs.promises.readdir; let n = 0; fs.promises.readdir = async function (q, ...a) { if (String(q) === P) n++; return rd.call(this, q, ...a); };
    try { out.recAlive = await mm._daemonAlive(MP); } finally { fs.promises.readdir = rd; } out.recNoWalk = n; }
  { unplant(P1); const z = fake(15, 'rclone', 1510, 'D', { out: '/dev/null' });   // another sleeper: the walk cannot tell
    try { const mm = make(MM); mm.__zombie = true; out.zombie = await mm._daemonAlive(MP); mm.__zombie = false; out.notZombie = await mm._daemonAlive(MP); out.teardown = await mm._daemonAlive(MP, { witness: false }); }
    finally { unplant(z); daemon(1, 1000); } }
  { const sig = [], mm = make(MM, { kill: (pid, s) => sig.push([pid, s]) }); await mm._daemonPids(MP); mm._readMs = 60;
    const rd = fs.promises.readdir, keep = setInterval(() => { }, 1000);
    fs.promises.readdir = async function (q, ...a) { if (String(q) === P) return new Promise(() => { }); return rd.call(this, q, ...a); };   // the pool is parked
    try { await mm._killMountDaemon(MP); } finally { fs.promises.readdir = rd; clearInterval(keep); } out.parkedSig = sig; }
  { const rl = fs.promises.readlink;
    fs.promises.readlink = async function (q, ...a) { if (String(q) === path.join(P, String(P1), 'fd', '1')) throw Object.assign(new Error('EACCES'), { code: 'EACCES' }); return rl.call(this, q, ...a); };
    try { out.nonDumpable = await make(MM)._daemonPids(MP); } finally { fs.promises.readlink = rl; } }
  { unplant(P1); const z = fake(16, 'sleep', 1610, 'S', { out: LOG, argv: ['sleep', '1'] });   // a child of the daemon holding its log
    try { out.holder = await make(MM)._daemonAlive(MP, { witness: false }); } finally { unplant(z); daemon(1, 1000); } }
  return out;
};
const r7legs = async (MM) => {   // ⑬
  const out = {};
  { unplant(P1); const z = fake(17, 'rclone', 1710, 'D', { out: '/dev/null' });   // a sleeper the walk cannot read: neither adopt nor spawn
    try { const mm = make(MM); out.cantTell = await mm._adoptable(MP); } finally { unplant(z); daemon(1, 1000); } }
  out.found = await make(MM)._adoptable(MP); out.none = await make(MM)._adoptable(MP3 + '-none'); out.noproc = await make(MM, { root: E })._adoptable(MP);
  { const mm = make(MM); mm._seedDaemonId(MP, P1); out.seeded = !!(mm._daemonIds && mm._daemonIds.get(MP)); }   // at once: no await, no pool
  { const mm = make(MM); mm._readMs = 60; const rp = fs.promises.realpath, keep = setInterval(() => { }, 1000);
    let rpN = 0; fs.promises.realpath = async function (q, ...a) { if (String(q) === path.join(D, 'mount-logs')) { rpN++; return new Promise(() => { }); } return rp.call(this, q, ...a); };   // a parked pool at the first walk
    const race = () => Promise.race([mm._daemonState(MP), new Promise((r) => { const t = setTimeout(() => r('hung'), 500); t.unref?.(); })]);
    try { out.realStall = await race(); if (out.realStall === 'unknown') { out.realStall2 = await race(); out.realCalls = rpN; } }   // the cure: a second walk JOINS the stalled realpath
    finally { fs.promises.realpath = rp; clearInterval(keep); } }
  return out;
};
const r8legs = async (MM) => {   // ⑭
  const out = {}, s0 = said.length;
  { unplant(P1); const z = fake(18, 'rclone', 1810, 'D', { out: '/dev/null' });   // a sleeper the walk cannot read (any rclone: a pull mount's, another instance's)
    try {
      const mm = make(MM); out.first = await mm._adoptable(MP, 'od'); out.named = (mm._cantTell.get(MP) || {}).pids;
      const at = (since, last) => { mm._cantTell.set(MP, { since: Date.now() - since, at: Date.now() - last, pids: [] }); return mm._adoptable(MP, 'od'); };   // planted, no sleep (r9's read)
      out.second = await at(30e3, 1e3); out.bounded = await at(61e3, 1e3);   // inside the bound from the FIRST refusal ⇒ wait; past it ⇒ connect (a count from the LAST refusal would wait)
      out.said = said.slice(s0).filter((l) => /mount od: «can't tell» for /.test(l) && l.includes(String(z)));
      const m2 = make(MM); m2._cantTell = new Map([[MP, { since: Date.now() - 7200e3, at: Date.now() - 7200e3, pids: [] }]]); out.stale = await m2._adoptable(MP, 'od');   // an episode long over: wait again
      const g = make(MM); g.isMounted = () => false; const rec = g._state.mounts.find((x) => x.id === 'od'); rec.desired = 'unmounted';   // an edit's bounce: unmounted first
      const s1 = said.length; out.refused = await g._mountInner('od'); out.desired = rec.desired; out.words = g._errors.get('od') || '';
      out.journal = said.slice(s1).filter((l) => /mount od: «can't tell» — process /.test(l) && l.includes(String(z))).length;
      const g2 = make(MM); g2.isMounted = () => false; const rec2 = g2._state.mounts.find((x) => x.id === 'od');
      g2._daemonPids = async () => { await g2.unmount('od'); throw Object.assign(new Error('a process could not be read'), { code: 'walk_unknown', partial: [], unreadPids: [B + 18] }); };   // the person's Unmount lands DURING the walk (before the wait is written)
      g2.unmount = async (id) => { g2._bumpGen(id); g2._cantTell?.delete(g2.pathOf(rec2)); rec2.desired = 'unmounted'; };   // the real unmount's two lines that matter here
      out.turn = { refused: await g2._mountInner('od'), desired: rec2.desired, words: g2._errors.get('od') || null, waitLeft: !!(g2._cantTell && g2._cantTell.has(MP)) };
    } finally { unplant(z); daemon(1, 1000); } }
  { const g = make(MM); g.isMounted = () => true; const gen0 = g._mountGen?.get('od'); await g.mount('od'); out.pressMoves = g._mountGen?.get('od') !== gen0; }   // a press on a mounted record
  { const L = require(path.join(SRC, 'mount-liveness.js')), step0 = L.livenessStep;   // removed while its probe ran (adopted at boot: no generation yet)
    const g = make(MM), calls = []; g.unmount = async (id, o) => { calls.push([id, !!(o && o.internal)]); if (!(o && o.internal)) g._bumpGen(id); };
    g._killMountDaemon = async () => []; g._noteReconnectBackoff = () => { };
    const m = g._state.mounts.find((x) => x.id === 'od'), gen0 = g._mountGen?.get('od');
    await g.unmount('od'); g._mountGen?.delete('od'); g._state.mounts = g._state.mounts.filter((x) => x.id !== 'od');   // remove()'s order
    try { L.livenessStep = () => ({ teardown: true, verdict: 'wedged', state: {}, strikes: { n: 2 }, words: { key: 'slow', vars: { s: 1 } } });
      const v = await g._livenessApply(m, MP, { daemonAlive: true, list: { state: 'hung', ms: 1 }, attr: { state: 'ok', ms: 1 }, gen0 }); out.gone = { calls, words: g._errors.get('od') || null, verdict: v && v.verdict, teardown: !!(v && v.teardown) }; }
    catch (e) { out.gone = { calls, err: String(e && e.message || e) }; }
    finally { L.livenessStep = step0; } }
  { const g = make(MM); delete g._probeMountpoint; const nb = path.join(tmp, 'no-bin'); fs.mkdirSync(nb, { recursive: true }); const p0 = process.env.PATH; process.env.PATH = nb;   // `ls` cannot start
    try { out.spawnErr = await g._zombieAt(MP, 500); } finally { process.env.PATH = p0; } }
  { const g = make(MM), seen = []; g._state.mounts.splice(1); g.isMounted = () => true; g._kindOf = () => 'mount';
    g._daemonState = async () => 'unknown'; g._zombieAt = async (mp, ms) => { seen.push(ms); return false; };
    g.unmount = async () => { }; g._probeLiveness = async () => ({ verdict: 'moved' });
    await g._healthSweep(); out.attrMs = seen[0]; }
  return out;
};
const midKill = async (MM, call, { stall = false, exit = false } = {}) => {   // ⑮ P1 named, then killed (or, `exit`, ended) at B+2's read; `stall`: P5's command line never answers
  const g = make(MM), rd = fs.promises.readdir, rl = fs.promises.readlink, rf = fs.promises.readFile, keep = setInterval(() => { }, 1000); g._readMs = 60;
  fs.promises.readdir = async function (q, ...a) { const r = await rd.call(this, q, ...a); return String(q) === P ? r.slice().sort() : r; };   // P1 first (the walk's order made sure)
  fs.promises.readlink = async function (q, ...a) { if (String(q) === path.join(P, String(B + 2), 'fd', '1')) { if (exit) unplant(P1); else (g._killed || (g._killed = new Map())).set(P1 + ':1000', Date.now()); } return rl.call(this, q, ...a); };
  if (stall) fs.promises.readFile = async function (q, ...a) { if (String(q) === path.join(P, String(P5), 'cmdline')) return new Promise(() => { }); return rf.call(this, q, ...a); };
  try { const r = await call(g); return { r, killedMid: !!(g._killed && g._killed.has(P1 + ':1000')), stalledOnP5: !!(g._unreadable && g._unreadable.has(P5 + ':1400')) }; }
  finally { fs.promises.readdir = rd; fs.promises.readlink = rl; fs.promises.readFile = rf; clearInterval(keep); if (exit) daemon(1, 1000); }
};
const killedArgv = async (MM) => {   // ⑮ the walk's own skip: a killed rclone found by its argv (no log), lingering asleep in the kernel, is not «can't tell»
  unplant(P1); const z = fake(20, 'rclone', 2010, 'D', { out: '/dev/null', argv: ['/usr/bin/rclone', 'mount', 'mine:', MP] });
  try { const g = make(MM); g._killed = new Map([[z + ':2010', Date.now()]]); return await g._daemonState(MP); } finally { unplant(z); daemon(1, 1000); }
};
const cureLegs = async (MM, { mid = true } = {}) => {   // ⑮ the cure (主开发 12:38Z)
  const out = {};
  { const sig = [], g = make(MM, { kill: (pid, s) => sig.push([pid, s]) }); g.isMounted = () => false;   // the wait's hung kill, by identity
    g._startingT = { progressTicks: 1e9, hungMs: 0, ceilingMs: 1e9, pollMs: 5 };
    out.hung = { verdict: await g._waitMounted(g._state.mounts[0], P1, MP), sig: sig.slice() };   // NO record (the seed missed): the identity is the stat line's — the road where a Connect's walk could race _startSettled's
    out.hung.adopt = await g._adoptable(MP, 'od');   // cure 2: the dying daemon is never adopted while it lingers
    g._killed.set(P1 + ':1000', Date.now() - 120e3); await g._adoptable(MP, 'od'); out.hung.adoptLate = await g._adoptable(MP, 'od'); out.hung.keyKept = g._killed.has(P1 + ':1000'); }   // r2: past any clock and still listed — the first walk's prune keeps it, the next walk still skips it
  { const g = make(MM); g.isMounted = () => false; g._record(MP, { pid: P1, starttime: 1000 });   // it ended before the kill: «died», never «hung … killed»
    g._startingT = { progressTicks: 1e9, hungMs: 0, ceilingMs: 1e9, pollMs: 5 };
    const ct = g._cpuTicks.bind(g); g._cpuTicks = (p) => { const r = ct(p); unplant(P1); return r; };
    try { out.goneAt = await g._waitMounted(g._state.mounts[0], P1, MP); } finally { daemon(1, 1000); } }
  { const sig = [], g = make(MM, { kill: (pid, s) => sig.push([pid, s]) }); g.isMounted = () => false; const MPX = MP + '-edited';   // the record road, under the wait's OWN mount point (not a recomputed path)
    g._record(MPX, { pid: P1, starttime: 1000 }); g._startingT = { progressTicks: 1e9, hungMs: 0, ceilingMs: 1e9, pollMs: 5 };
    out.recRoad = { verdict: await g._waitMounted(g._state.mounts[0], P1, MPX), sig: sig.slice(), recLeft: !!(g._daemonIds && g._daemonIds.has(MPX)) }; }
  { const g = make(MM); const now = Date.now(); g._killed = new Map([[(B + 98) + ':5', now - 1000], [(B + 99) + ':5', now + 60e3]]);   // gone before this walk's listing ⇒ forgotten; killed after it ⇒ kept
    await g._daemonPids(MP); out.prune = { before: g._killed.has((B + 98) + ':5'), after: g._killed.has((B + 99) + ':5') }; }
  if (mid) {   // a daemon killed WHILE a walk ran, after it named it — never handed out, never «alive» (both roads; a stall's rethrow too)
    out.handed = (await midKill(MM, (g) => g._daemonPids(MP))).r;
    const hs = await midKill(MM, (g) => g._adoptable(MP, 'od'), { stall: true }); out.handedStall = hs.r; out.stallProof = hs.killedMid && hs.stalledOnP5;
    out.stateMid = (await midKill(MM, (g) => g._daemonState(MP))).r; out.stateMidStall = (await midKill(MM, (g) => g._daemonState(MP), { stall: true })).r;
    out.handedGone = (await midKill(MM, (g) => g._daemonPids(MP), { exit: true })).r;   // r5: it ENDED after being named (its key pruned elsewhere): its stat line says so
  }
  { const sig = [], g = make(MM, { kill: (pid, s) => sig.push([pid, s]) }); g.isMounted = () => false;   // its pid recycled between the first tick and the kill
    g._startingT = { progressTicks: 1e9, hungMs: 25, ceilingMs: 1e9, pollMs: 5 };
    const ct = g._cpuTicks.bind(g); let n = 0; g._cpuTicks = (p) => { const r = ct(p); if (++n === 2) daemon(1, 2000); return r; };   // after the first tick took its identity
    try { out.recycled = { verdict: await g._waitMounted(g._state.mounts[0], P1), sig: sig.slice() }; } finally { daemon(1, 1000); } }
  { unplant(P1); daemon(1, 1000); const z = fake(19, 'rclone', 1910, 'S', { out: '/dev/null', argv: ['/usr/bin/rclone', 'version'] });   // named P1, then stalled on a later process
    const rd = fs.promises.readdir, rf = fs.promises.readFile, keep = setInterval(() => { }, 1000);
    fs.promises.readdir = async function (q, ...a) { const r = await rd.call(this, q, ...a); return String(q) === P ? r.slice().sort() : r; };   // P1 first (the walk's order made sure)
    fs.promises.readFile = async function (q, ...a) { if (String(q) === path.join(P, String(z), 'cmdline')) return new Promise(() => { }); return rf.call(this, q, ...a); };
    try { const mm = make(MM); mm._readMs = 60; out.partial = { state: await mm._daemonState(MP), rec: (mm._daemonIds && mm._daemonIds.get(MP) || {}).pid || null };
      const m2 = make(MM); m2._readMs = 60; out.partial.pids = await m2._daemonPids(MP).catch((e) => 'threw ' + (e && e.code)); }   // the probe's road keeps it too (its CPU witness)
    finally { fs.promises.readdir = rd; fs.promises.readFile = rf; clearInterval(keep); unplant(z); } }
  { const sig = [], g = make(MM, { kill: (pid, s) => sig.push([pid, s]) }); const NB = B + 4;   // a recorded identity whose pid is now ANOTHER process (bash, start 1300)
    g._record(MP, { pid: NB, starttime: 999 }); out.recAlive = !!g._recordedAlive(MP); out.recCleared = !(g._daemonIds && g._daemonIds.has(MP));
    g._record(MP, { pid: NB, starttime: 999 }); await g._killMountDaemon(MP); out.recSig = sig.filter(([p]) => p === NB).length; }
  { const g = make(MM); g._killed = new Map([[P1 + ':1000', Date.now()]]); g._record(MP, { pid: P1, starttime: 1000 }); out.killedRec = !!(g._daemonIds && g._daemonIds.has(MP)); }   // a daemon this manager killed (lingering) is never recorded
  { const sig = [], g = make(MM, { root: E, kill: (pid, s) => sig.push([pid, s]) }); g.isMounted = () => false; let psN = 0;   // no /proc (a hub on macOS): the identity by ps, ONCE, at the first tick
    g._procOpts.ps = () => { psN++; return { ran: true, state: 'S', lstart: psN === 1 ? 'Wed Nov 18 00:00:00 2026' : 'Wed Nov 18 00:00:09 2026' }; };   // its lstart changes before the kill: recycled
    g._startingT = { progressTicks: 1e9, hungMs: 0, ceilingMs: 1e9, pollMs: 5 };
    out.mac = { verdict: await g._waitMounted(g._state.mounts[0], process.pid), sig: sig.slice(), ps: psN }; }   // its CPU read is the release's kill(pid, 0) fallback on this process — a signal 0, nothing sent
  return out;
};
const drive = async (MM) => {   // ⑪
  const g = make(MM);
  const sh = path.join(tmp, 'fake-authorize'); fs.writeFileSync(sh, '#!/bin/sh\nexit 0\n'); fs.chmodSync(sh, 0o755);
  g.rcloneBin = () => sh;   // never a real rclone: a control that spawns runs a script that exits at once
  const env0 = { ...process.env }; for (const k of Object.keys(process.env)) if (/^VIBESPACE_GDRIVE_/.test(k)) delete process.env[k];   // no client secret on an argv
  const settle = (pr) => Promise.race([pr, new Promise((r) => { const t = setTimeout(() => r({ pending: true }), 100); t.unref?.(); })]);
  try {
    let open; const held = new Promise((r) => { open = r; });
    g._killOrphanAuthorize = () => held;
    const a = g.startDriveAuth({}); g.cancelDriveAuth(); open([]);
    const ra = await settle(a); const spawnedA = !!g._driveAuth;
    g.cancelDriveAuth();
    let open2; const held2 = new Promise((r) => { open2 = r; }); let calls = 0;
    g._killOrphanAuthorize = () => (++calls === 1 ? held2 : new Promise(() => { }));
    const b1 = g.startDriveAuth({}); const b2 = g.startDriveAuth({}); open2([]);
    const rb1 = await settle(b1); const spawnedB1 = !!g._driveAuth;
    void b2; g.cancelDriveAuth();
    return { ra, spawnedA, rb1, spawnedB1 };
  } finally { Object.assign(process.env, env0); }
};
const said = [], warn0 = console.warn; console.warn = (l) => said.push(String(l));
const J = (x) => JSON.stringify(x);
try {
  console.log('① ② ③ ④ our daemons, named by their log');
  const s0 = said.length;
  const o1 = await ours(MountManager), o2 = await ours(MountManager, { state: 'D' });
  ok(J(o1.pids) === J([o1.z]) && o1.alive === true && J(o1.sig) === J([[o1.z, 'SIGKILL']]) && said.length === s0, '① this mount\'s daemon (named by its log; not another record\'s awake or asleep, not bash naming the path, not the authorize, not a zombie): adopted, alive, killed as itself — silently', o1);
  ok(J(o2.pids) === J([o2.z]) && o2.alive === true && J(o2.sig) === J([[o2.z, 'SIGKILL']]), '② ASLEEP in the kernel: named like an awake one — adopted, alive (never «died»), killed as itself (a FUSE wait is killable)', o2);
  const r1 = await ours(MountManager, { state: 'D', out: LOG + '.1' }), r2 = await ours(MountManager, { state: 'D', out: LOG + '.1 (deleted)' }), r3 = await ours(MountManager, { state: 'D', dataDir: DL });
  ok(J(r1.pids) === J([r1.z]) && J(r2.pids) === J([r2.z]) && J(r3.pids) === J([r3.z]), '③ a daemon asleep (only its log can name it) is named through the log\'s rotation, a rotated file since deleted, and a data dir reached through a symlink', { r1: r1.pids, r2: r2.pids, r3: r3.pids });
  const sh4 = await shared(MountManager), ot4 = await others(MountManager);
  ok(J(sh4.pids) === J([sh4.z]) && ot4 === false, '④ every record on one mount point counts (a credential listed first and its mounted child); another record\'s daemons never count, never «can\'t tell»', { sh4, ot4 });
  console.log('⑤ any other process: the release\'s rule, read only when safe');
  const h1 = await handStarted(MountManager), h2 = await handStarted(MountManager, { state: 'D' }), h3 = await handStarted(MountManager, { threads: ['S', 'D'] });
  const c5 = await commOnly(MountManager), f5 = await foreign(MountManager);
  ok(J(h1.pids) === J([h1.z]) && h1.read >= 1, '⑤ a hand-started rclone on the mount point (no VibeSpace log) is found by its argv, as the release did', h1);
  ok(J(h2.pids) === '[]' && h2.alive === true && h2.read === 0 && J(h3.pids) === '[]' && h3.alive === true && h3.read === 0, '⑤ one asleep — or with a thread asleep — is «can\'t tell ⇒ alive», its command line never read', { h2, h3 });
  ok(c5 === 0 && J(f5.pids) === '[]' && f5.alive === false, '⑤ a non-rclone process\'s command line is never read; another user\'s process (EACCES) is not ours (this mount\'s death is seen)', { c5, f5 });
  console.log('⑥ can\'t tell ⇒ alive');
  const t1 = await cantTell(MountManager, 'unlisted'), t2 = await cantTell(MountManager, 'noproc'), t3 = await cantTell(MountManager, 'unread'), t4 = await cantTell(MountManager, 'stall');
  const t2T = await make(MountManager, { root: E })._daemonAlive(MP, { witness: false });   // r7: the green twin of the noprocT control
  ok(t1.alive === true && t2.alive === true && t2.threw === true && t2T === true && t3.alive === true && t4.alive === true && t4.reads === 1,
    '⑥ /proc not listed ⇒ alive; no /proc ⇒ alive (its pids a throw; on a teardown road too); a process it could not read ⇒ alive; a read that never answers ends the walk ⇒ alive, and that process is never asked again', { t1, t2, t2T, t3, t4 });
  console.log('⑦ ⑧ ⑨');
  const k7 = await killedLingers(MountManager), a8 = await authorize(MountManager);
  ok(J(k7.hit) === J([P1]) && J(k7.after) === '[]', '⑦ the daemon this manager SIGKILLed, not gone yet, is never named again (never adopted)', k7);
  ok(J(a8.sig) === J([[P5, 'SIGKILL']]) && J(a8.hit) === J([P5]), '⑧ the authorize sweep signals only the rclone authorize, never a mount daemon', a8);
  const mm9 = make(MountManager); const cp1 = await mm9._cpuTicks(P1), cpz = await mm9._cpuTicks(P6), pr = await probeSync(MountManager);
  ok(cp1 === 100 && cpz === null && pr.n === 0 && !pr.err, '⑨ _cpuTicks = utime + stime (a zombie ⇒ null); a liveness probe makes no sync WALK of /proc (no listing, no command line, no link read)', { cp1, cpz, pr });
  console.log('⑩ the sweep and the probe look again');
  const looks = {}; for (const w of ['starting', 'connecting', 'unmounted', 'again']) looks[w] = await secondLook(MountManager, w);
  const pt = await probeTeardown(MountManager);
  ok(Object.values(looks).every((c) => c.length === 0) && pt.calls.length === 0 && pt.words === null && pt.kept === false, '⑩ a mount that began starting or connecting, was unmounted, or connected again while its walk or its probe ran is not torn down — and the probe\'s verdict leaves nothing (no strikes, no words)', { looks, pt });
  console.log('⑫ r6: «can\'t tell», the recorded daemon, the refused fd/1, the log holder');
  const r12 = await r6legs(MountManager);
  ok(r12.recNoWalk === 0 && r12.recAlive === true, '⑫ the recorded daemon is judged by its stat line — alive with NO walk (no listing of /proc)', r12);
  ok(r12.zombie === false && r12.notZombie === true && r12.teardown === false, '⑫ «can\'t tell» (another sleeper, this daemon gone): the sweep asks the mount point — a dead FUSE entry ⇒ dead, an answering one ⇒ alive; the teardown roads never wait on it', r12);
  ok(J(r12.parkedSig) === J([[P1, 'SIGKILL']]), '⑫ a pool parked (the listing never answers): the recorded daemon is still killed — by its stat line, no walk', r12.parkedSig);
  ok(J(r12.nonDumpable) === J([P1]) && r12.holder === false, '⑫ our own daemon whose fd/1 is refused (non-dumpable) is judged by its argv; a process that merely holds the log (a sleep child) is no daemon', r12);
  console.log('⑬ r7: a connect while the walk cannot tell, the seed, the log dir\'s real path');
  const r13 = await r7legs(MountManager);
  ok(r13.cantTell === null && r13.found === P1 && r13.none === 0 && r13.noproc === 0, '⑬ a connect neither adopts nor spawns while the walk cannot tell (a sleeper it could not read); it adopts the daemon it names, spawns when there is none or no /proc (the release)', r13);
  ok(/const pid0 = await this\._adoptable\(this\.pathOf\(m\), id\);\n    if \(pid0 === null\) \{[\s\S]{0,1600}?this\._errors\.set\(id, [\s\S]{0,300}?return false;\n    \}\n    if \(pid0\) \{/.test(MSRC), 'the wiring: _mountInner asks _adoptable and stops on «can\'t tell» before any spawn');
  ok(r13.seeded === true && r13.realStall === 'unknown' && r13.realStall2 === 'unknown' && r13.realCalls === 1, '⑬ the spawned daemon is recorded at once (one stat line, never through the pool); the log dir\'s real path is asked under the walk\'s bound — a parked pool at the first walk is «can\'t tell», never a walk that never ends', r13);
  console.log('⑭ r8: «can\'t tell» bounded and named, the ask kept, a removed record\'s verdict, the witness\'s child, its patience');
  const r14 = await r8legs(MountManager);
  ok(r14.first === null && J(r14.named) === J([B + 18]) && r14.second === null && r14.bounded === 0 && r14.said.length === 1 && r14.stale === null, '⑭ «can\'t tell» at a connect names the process it could not read and waits at most CANT_TELL_MS from the FIRST refusal (the second within it waits too) — then it connects, said in the journal by the record id; an entry from an episode long over waits again', r14);
  ok(r14.refused === false && r14.desired === 'mounted' && /a process did not answer/.test(r14.words) && !/\d/.test(r14.words) && r14.journal === 1, '⑭ a refused connect keeps the ask (an edit\'s bounce had unmounted: the sweep\'s backoff asks again); the row says a process did not answer (no digits: the backoff\'s auth test reads 401/403), the journal names it', { refused: r14.refused, desired: r14.desired, words: r14.words, journal: r14.journal });
  ok(r14.turn.refused === false && r14.turn.desired === 'unmounted' && r14.turn.words === null && r14.turn.waitLeft === false, '⑭ the person\'s Unmount during the refused connect\'s walk stands: nothing written back, no words, and the wait the walk wrote back ends', r14.turn);
  ok(MSRC.includes("if (!(opts && opts.internal)) { this._bumpGen(id); this._cantTell?.delete(this.pathOf(m)); }") && MSRC.includes('this._mountGen?.delete(id); this._cantTell?.delete(mpRemoved);'), 'the wiring: the person\'s Unmount and remove() end a «can\'t tell» wait');
  ok(r14.pressMoves === false && r14.gone && !r14.gone.err && J(r14.gone.calls) === J([['od', false]]) && r14.gone.words === null && r14.gone.verdict === 'moved' && r14.gone.teardown === false,
    '⑭ a press on a mounted record moves no generation; a record removed while its probe ran (no generation: adopted at boot) has its verdict dropped — no words, no teardown, no «moved» callers act on', { press: r14.pressMoves, gone: r14.gone });
  ok(r14.spawnErr === false && r14.attrMs === require(path.join(SRC, 'mount-liveness.js')).probeCell(null).attrMs, '⑭ the witness\'s `ls -d` that never started answers nothing (never «dead»); the sweep hands the row\'s attr patience to the witness (6 s for a OneDrive row — the probe\'s own; no row with a daemon declares another today)', { spawnErr: r14.spawnErr, attrMs: r14.attrMs });
  console.log('⑮ the cure: the wait\'s kill by identity, a partial walk\'s daemon alive, a recycled pid on the record roads');
  const c15 = await cureLegs(MountManager); c15.argvKilled = await killedArgv(MountManager);
  ok(c15.hung.verdict === 'hung' && J(c15.hung.sig) === J([[P1, 'SIGKILL']]) && c15.hung.adopt === 0 && c15.hung.adoptLate === 0 && c15.hung.keyKept === true && c15.goneAt === 'died' && c15.recycled.verdict === 'died' && c15.recycled.sig.length === 0 && c15.recRoad.verdict === 'hung' && J(c15.recRoad.sig) === J([[P1, 'SIGKILL']]) && c15.recRoad.recLeft === false && c15.prune.before === false && c15.prune.after === true && J(c15.handed) === '[]' && c15.handedStall === null && c15.stallProof === true && c15.stateMid === 'dead' && c15.stateMidStall === 'unknown' && J(c15.handedGone) === '[]' && c15.argvKilled === 'dead', '⑮ the wait for a mount kills a hung daemon by its identity (taken at its first tick) and a Connect never adopts it while it lingers, past any clock (cure 2); one that ended before the kill — gone, a zombie, or its pid now another process — is «died» and never signalled; the record road drops the record under the wait\'s own mount point; a killed key is forgotten only by a listing taken after its kill; a killed daemon is never handed out', { hung: c15.hung, recycled: c15.recycled, goneAt: c15.goneAt, recRoad: c15.recRoad, prune: c15.prune, handed: c15.handed, handedStall: c15.handedStall });
  ok(c15.partial.state === 'alive' && c15.partial.rec === P1 && J(c15.partial.pids) === J([P1]), '⑮ a walk that NAMED this mount point\'s daemon and then stalled on a later process answers «alive» for it (and records it) — never «unknown»; the probe\'s road keeps its pid', c15.partial);
  ok(c15.killedRec === false && c15.mac.verdict === 'died' && c15.mac.sig.length === 0 && c15.mac.ps === 2, '⑮ a daemon this manager killed is never recorded; no /proc: the identity is asked ONCE by ps at the first tick, and a pid whose start changed before the kill is not signalled («died»)', { killedRec: c15.killedRec, mac: c15.mac });
  ok(c15.recAlive === false && c15.recCleared === true && c15.recSig === 0, '⑮ a recorded identity whose pid is now another process (its start time differs) is not alive, is cleared, and is never signalled', { a: c15.recAlive, c: c15.recCleared, s: c15.recSig });
  ok(MSRC.includes('    this._seedDaemonId(mp, child.pid);') && /const gen0 = this\._mountGen\?\.get\(m\.id\);[\s\S]{0,1600}?, gen0 \};/.test(MSRC), 'the wiring: the spawn seeds its daemon\'s record; the probe carries the generation it began with');
  console.log('⑪ startDriveAuth');
  const d = await drive(MountManager);
  ok(/cancelled or started again/.test((d.ra && d.ra.error) || '') && d.spawnedA === false && /cancelled or started again/.test((d.rb1 && d.rb1.error) || '') && d.spawnedB1 === false, '⑪ a Cancel, or a newer press, while the orphan sweep runs: that press spawns nothing and says why', d);
  ok(/async startDriveAuth\(\{[^\n]*\n    this\.cancelDriveAuth\(\);\n    const gen = this\._driveAuthGen;\n    await this\._killOrphanAuthorize\(\);/.test(MSRC)
    && MSRC.indexOf('if (gen !== this._driveAuthGen) return') < MSRC.indexOf('const child = spawn(this.rcloneBin(), authArgs')
    && !/readdirSync\('\/proc'\)/.test(MSRC) && !/readFileSync\(`\/proc\//.test(MSRC),   // stale-pins: kept — absence checks (the release's sync walks are gone)
    'the wiring: the orphan sweep awaited BEFORE the authorize spawn; no sync /proc walk is left in src/mounts.js');
  if (MG) {
    console.log('RED CONTROLS (one patched copy, a flag per cut)');
    const x = {};
    x.fd1 = await cut('fd1', () => ours(MG, { state: 'D' }));
    x.here = await cut('here', () => shared(MG));
    x.deleted = await cut('deleted', () => ours(MG, { state: 'D', out: LOG + '.1 (deleted)' }));
    x.real = await cut('real', () => ours(MG, { state: 'D', dataDir: DL }));
    x.dleader = await cut(['dleader', 'dthread'], () => handStarted(MG, { state: 'D' }));   // a sleeping leader is caught twice (its own task too): both cut
    x.dthread = await cut('dthread', () => handStarted(MG, { threads: ['S', 'D'] }));
    x.comm = await cut('comm', () => commOnly(MG));
    x.eacces = await cut('eacces', () => foreign(MG));
    x.uidcheck = await cut('uidcheck', () => r6legs(MG));
    x.record = await cut('record', () => r6legs(MG)); x.witness = await cut('witness', () => r6legs(MG)); x.recordKill = await cut('recordKill', () => r6legs(MG)); x.logcomm = await cut('logcomm', () => r6legs(MG));
    x.strict = await cut('strict', () => cantTell(MG, 'unlisted'));
    x.noproc = await cut('noproc', () => cantTell(MG, 'noproc'));
    x.noprocT = await cut('noproc', async () => make(MG, { root: E })._daemonAlive(MP, { witness: false }));
    x.unread = await cut('unread', () => cantTell(MG, 'unread'));
    x.stallskip = await cut('stallskip', () => cantTell(MG, 'stall'));
    x.killed = await cut(['killed', 'handOut'], () => killedLingers(MG)); x.argvSkip = await cut('killed', () => killedArgv(MG));   // the walk's own skip alone   // both layers (the walk's skip and _daemonPids' hand-out filter) — each alone hides the other's cut
    x.sync = await cut('sync', () => probeSync(MG));
    for (const [k, w] of [['lookStart', 'starting'], ['lookConn', 'connecting'], ['lookMounted', 'unmounted'], ['lookGen', 'again']]) x[k] = await cut(k, () => secondLook(MG, w));
    x.probeGen = await cut('probeGen', () => probeTeardown(MG));
    x.gen = await cut('gen', () => drive(MG));
    x.adoptStrict = await cut('adoptStrict', () => r7legs(MG)); x.realBound = await cut('realBound', () => r7legs(MG)); x.realOne = await cut('realOne', () => r7legs(MG));
    { const cc = await cut(['waitKill', 'partialAlive', 'recAliveId', 'recKillId', 'recKilled', 'listedAt', 'recDrop'], () => cureLegs(MG, { mid: false }));   // cuts on independent sub-legs / outputs: one run (the fast row); recDrop here — waitKill's raw kill still reaches the drop
      for (const k of ['waitKill', 'partialAlive', 'recAliveId', 'recKillId', 'recKilled', 'listedAt', 'recDrop']) x[k] = cc; }
    { const cw = await cut(['waitKilled', 'killedTtl', 'goneDied', 'handOut'], () => cureLegs(MG)); for (const k of ['waitKilled', 'killedTtl', 'goneDied', 'handOut']) x[k] = cw; }   // no waitKill here: these read the identity road's own answers
    for (const k of ['bound', 'episode', 'turn', 'turnWait', 'desired', 'bumpEarly', 'gone', 'spawnErr']) x[k] = await cut(k, () => r8legs(MG));
    ok(J(x.fd1.pids) === '[]' && x.fd1.sig.length === 0, 'CONTROL (no naming by the log): this mount\'s sleeping daemon is never adopted or killed (red)', x.fd1);
    ok(J(x.here.pids) === '[]', 'CONTROL (only the first record on a mount point): the child\'s daemon is not found — the sweep would call it dead every sweep (red)', x.here);
    ok(J(x.deleted.pids) === '[]' && J(x.real.pids) === '[]', 'CONTROL (the «(deleted)» mark kept / no real path): the daemon is not named (red)', { d: x.deleted.pids, r: x.real.pids });
    ok(x.dleader.read >= 1 && x.dthread.read >= 1, 'CONTROL (no sleep check at all / the threads not checked): its command line is read — the read that parks a pool thread (red)', { l: x.dleader.read, t: x.dthread.read });
    ok(x.comm >= 1, 'CONTROL (no comm filter): a non-rclone process\'s command line is read (red)', x.comm);
    ok(J(x.eacces.pids) !== '[]', 'CONTROL (another user\'s process judged by its argv): it is taken for this mount\'s daemon (red)', x.eacces);
    ok(x.strict.alive === false && x.unread.alive === false && x.noprocT === false, 'CONTROL (not strict / an unread process not counted / no «no /proc» answer on a teardown road): «dead» (red)', { s: x.strict, u: x.unread, n: x.noprocT });
    ok(x.record.recNoWalk > 0 && x.witness.zombie === true && x.recordKill.parkedSig.length === 0 && J(x.uidcheck.nonDumpable) === '[]' && x.logcomm.holder === true,
      'CONTROL (no recorded judgement / «can\'t tell ⇒ alive» / no recorded kill / a refused fd/1 never ours / any log holder a daemon): a walk per probe, a dead mount kept, the daemon survives a parked pool, our non-dumpable daemon lost, a sleep child kept as the daemon (red)', { r: x.record.recNoWalk, w: x.witness.zombie, k: x.recordKill.parkedSig, u: x.uidcheck.nonDumpable, l: x.logcomm.holder });
    ok(x.stallskip.reads === 2, 'CONTROL (the stuck process not remembered): its read is asked again — a second pool thread (red)', x.stallskip);
    ok(J(x.killed.after) === J([P1]), 'CONTROL (no killed set): the dying daemon is named again — the next mount would adopt it (red)', x.killed);
    ok(x.sync.n > 0, 'CONTROL (the release\'s sync walk): the same probe makes sync /proc calls (red)', x.sync);
    ok(['lookStart', 'lookConn', 'lookMounted', 'lookGen'].every((k) => x[k].length === 1) && x.probeGen.calls.length === 1, 'CONTROL (each term of the second look, the probe\'s generation cut): torn down (red)', { a: x.lookStart, b: x.lookConn, c: x.lookMounted, g: x.lookGen, p: x.probeGen });
    ok(x.adoptStrict.cantTell === 0 && x.realBound.realStall === 'hung', 'CONTROL (the adopt not strict / the real path asked unbounded): «can\'t tell» spawns a second daemon on the folder; the first walk never ends (red)', { a: x.adoptStrict.cantTell, r: x.realBound.realStall });
    ok(x.bound.bounded === null && x.episode.stale === 0 && x.turn.turn.desired === 'mounted' && x.turnWait.turn.waitLeft === true && x.desired.desired === 'unmounted' && x.bumpEarly.pressMoves === true && x.gone.gone.calls.length === 2 && x.spawnErr.spawnErr === true,
      'CONTROL (no bound / no episode gap / no turn check / the wait kept after it / the ask dropped / the press bumps / no removed check / a spawn error counted): «can\'t tell» forever, a stale wait connects at once, the person\'s Unmount overruled, a later connect skips its wait, the edit\'s mount left down, a press drops the probe\'s verdict, a teardown of a removed record, «dead» without an answer (red)',
      { b: x.bound.bounded, e: x.episode.stale, t: x.turn.turn, tw: x.turnWait.turn.waitLeft, d: x.desired.desired, p: x.bumpEarly.pressMoves, g: x.gone.gone, s: x.spawnErr.spawnErr });
    ok(x.recDrop.recRoad.recLeft === true && x.goneDied.recycled.verdict === 'hung' && x.listedAt.prune.after === false && J(x.handOut.handed) === J([P1]) && x.handOut.handedStall === P1 && x.handOut.stateMid === 'alive' && x.handOut.stateMidStall === 'alive' && J(x.handOut.handedGone) === J([P1]) && x.argvSkip === 'unknown', 'CONTROL (the record not dropped / recycled not «died» / no listing time / no hand-out filter): the dying daemon\'s record stays; «hung … killed» for a recycled pid; a key killed during the walk forgotten; a daemon killed during the walk handed out (red)', { r: x.recDrop.recRoad, g: x.goneDied.recycled.verdict, l: x.listedAt.prune, h: x.handOut.handed, hs: x.handOut.handedStall, sm: x.handOut.stateMid, sms: x.handOut.stateMidStall, hg: x.handOut.handedGone, as: x.argvSkip });
    ok(x.waitKilled.hung.adopt === P1 && x.killedTtl.hung.adoptLate === P1 && x.goneDied.goneAt === 'hung', 'CONTROL (cure 2: the wait\'s kill not remembered / the 60 s clock / gone at the kill not «died»): a Connect adopts the dying daemon; past a minute it is adopted again; «hung … killed» for a daemon nobody signalled (red)', { w: x.waitKilled.hung, t: x.killedTtl.hung, g: x.goneDied.goneAt });
    ok(x.recKilled.killedRec === true && x.waitKill.mac.sig.length === 1, 'CONTROL (a killed daemon recorded / the wait\'s bare-pid kill with no /proc): the lingering daemon is adopted again; the recycled pid is signalled (red)', { k: x.recKilled.killedRec, m: x.waitKill.mac.sig });
    ok(x.realOne.realCalls === 2 && J(x.waitKill.recycled.sig) === J([[P1, 'SIGKILL']]) && x.partialAlive.partial.state === 'unknown' && x.recAliveId.recAlive === true && x.recKillId.recSig === 1,
      'CONTROL (a realpath per walk / the wait\'s bare-pid kill / a partial walk «unknown» / no start-time judgement / a raw kill of the record): a second pool thread, the recycled pid signalled, the named daemon not killed at a teardown, a stranger taken for the daemon and signalled (red)',
      { r: x.realOne.realCalls, w: x.waitKill.recycled.sig, p: x.partialAlive.partial, a: x.recAliveId.recAlive, k: x.recKillId.recSig });
    ok(x.gen.spawnedA === true && x.gen.spawnedB1 === true, 'CONTROL (no turn): the cancelled press and the superseded one spawn anyway (red)', x.gen);
  }
} finally {
  console.warn = warn0;
}
report();

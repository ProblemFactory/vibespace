#!/usr/bin/env node
// THE SERVER'S FILE HANDLES (lane-dead-bridge, the 2026-09-30 12:03:17 crash) — FAST.
//
// What crashed: `EMFILE: too many open files, open '…/data/session-status.json.tmp'`
// thrown from session-status's 500 ms debounce timer (a bare writeFileSync) →
// uncaughtException → exit(1). What ran out: NOT the server (node raises its
// own soft limit to the hard one — measured, §B; it held ~75 handles) but the
// workspace's FUSE daemon (bindfs, soft 1024, 947 open), whose EMFILE the file
// system relays to the caller. So:
//   §A the unit template states the limit the process really runs at (soft =
//      hard, never below what node raises itself to) and says why;
//   §B the premise, measured: node raises its soft limit to the hard one;
//   §C the boot line names the real limit + the estimate (fdBudget);
//   §D THE GAUGE (PURE): high at ≥ 80 %, one report an hour, FALLS with the
//      count — and a latched copy is caught;
//   §E the ORCH gauge over a fake /proc: one notice (with its i18n key), not
//      twice in the hour, ok again when the count drops;
//   §F WHO RAN OUT: emfileBlame + mountOf (the FUSE mount is named);
//   §G the debounced writes never throw: session-status + user-todos keep the
//      state dirty, retry, report — and the PRE-FIX copy dies of the same error;
//   §H the wiring in server.js.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { scratch } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';

const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const FB = require(path.join(REPO, 'src/fd-budget.js'));
let pass = 0, fail = 0, skipped = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra ? `\n      ${extra}` : '')); } return !!c; };
const skip = (n) => { skipped++; console.log('  ⊘ SKIP ' + n); };
const ROOT = scratch('fd-limit');
fs.rmSync(ROOT, { recursive: true, force: true }); fs.mkdirSync(ROOT, { recursive: true });
process.on('exit', () => { try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { } });
const M = mutantCopies('fd-limit', REPO);

// ── §A the unit template ──
console.log('\n§A the unit template states the limit the server really runs at');
const unitOf = (src) => { const m = /cat > "\$UNIT" <<EOF\n([\s\S]*?)\nEOF/.exec(src); return m ? m[1] : ''; };
/** THE RULE the template must satisfy: inside [Service], ONE LimitNOFILE value (soft = hard), ≥ systemd's default hard. */
function templateVerdict(src) {
  const unit = unitOf(src);
  const service = (unit.split(/^\[Service\]$/m)[1] || '').split(/^\[/m)[0];
  const lines = service.split('\n').filter((l) => /^LimitNOFILE=/.test(l));
  if (lines.length !== 1) return { ok: false, why: `${lines.length} LimitNOFILE line(s) in [Service]` };
  const v = lines[0].slice('LimitNOFILE='.length).trim();
  if (!/^\d+$/.test(v)) return { ok: false, why: `"${v}" is not ONE number (soft:hard would let them differ; infinity is not a number the journal can say)` };
  if (Number(v) < 524288) return { ok: false, why: `${v} is below systemd's default hard limit — node would run LOWER than it raises itself to` };
  return { ok: true, value: Number(v) };
}
const TEMPLATE = fs.readFileSync(path.join(REPO, 'scripts/install-service.sh'), 'utf8');
const tv = templateVerdict(TEMPLATE);
ok(tv.ok, `install-service.sh's unit sets LimitNOFILE=${tv.value} — soft AND hard, at systemd's default hard limit`, tv.why);
ok(/node raises its OWN soft\s*\n?#?\s*limit to the hard one/.test(TEMPLATE) && /FUSE daemon/.test(TEMPLATE), 'the template says why (node raises its own soft limit; the 12:03 EMFILE was the FUSE daemon\'s)');
ok(/KillMode=process/.test(unitOf(TEMPLATE)) && /OOMScoreAdjust=-500/.test(unitOf(TEMPLATE)), 'the load-bearing neighbours are still there (KillMode=process, OOMScoreAdjust)');
// B-442c (2026-10-02 16:23, the owner's ruling): one OOM-killed process in the unit (a leaked scratch daemon) must not stop the service
const oomOf = (t) => (unitOf(t).match(/^OOMPolicy=(\S+)$/gm) || []).map((l) => l.split('=')[1]);
ok(JSON.stringify(oomOf(TEMPLATE)) === '["continue"]', `install-service.sh's unit sets OOMPolicy=continue exactly once (${JSON.stringify(oomOf(TEMPLATE))}) — the kernel still kills the runaway, systemd no longer stops the server for it`);
ok(oomOf(TEMPLATE.replace(/^OOMPolicy=continue\n/m, '')).length === 0, 'CONTROL: the template without the line names no OOMPolicy (systemd\'s default stop — the 16:23 outage)');
ok(!templateVerdict(TEMPLATE.replace(/^LimitNOFILE=.*$/m, '')).ok, 'CONTROL: a template without the line fails the rule');
ok(!templateVerdict(TEMPLATE.replace(/^LimitNOFILE=.*$/m, 'LimitNOFILE=65536')).ok, 'CONTROL: LimitNOFILE=65536 fails it too — it would LOWER the server\'s limit from 524288');
ok(!templateVerdict(TEMPLATE.replace(/^LimitNOFILE=.*$/m, 'LimitNOFILE=1024:524288')).ok, 'CONTROL: a soft:hard pair fails it (the soft value is not what node runs at)');

// ── §B the premise ──
console.log('\n§B the premise, measured: node raises its own soft limit to the hard one');
let prlimit = null; try { prlimit = execFileSync('/usr/bin/which', ['prlimit'], { encoding: 'utf8' }).trim(); } catch { }
if (!prlimit || !fs.existsSync('/proc/self/limits')) skip('no prlimit / no /proc — the premise cannot be measured here');
else {
  const r = spawnSync(prlimit, ['--nofile=1024:4096', process.execPath, '-e', "process.stdout.write(require('fs').readFileSync('/proc/self/limits','utf8'))"], { encoding: 'utf8', timeout: 10000 });
  const lim = FB.readLimits(r.stdout);
  ok(lim.soft === 4096 && lim.hard === 4096, `under 1024:4096 node runs at soft ${lim.soft} / hard ${lim.hard} — the unit's soft value is not what it runs at`, r.stderr);
  const sh = spawnSync(prlimit, ['--nofile=1024:4096', 'sh', '-c', 'cat /proc/self/limits'], { encoding: 'utf8', timeout: 10000 });
  ok(FB.readLimits(sh.stdout).soft === 1024, 'CONTROL: a non-node process under the same limits keeps soft 1024 (the raise is node\'s own)');
}

// ── §C the boot line ──
console.log('\n§C the boot line names the real limit and the estimate');
const fakeProc = (dir, { soft, hard, fds }) => {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, 'fd'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'limits'), `Limit                     Soft Limit           Hard Limit           Units     \nMax open files            ${soft}                 ${hard}                 files     \n`);
  fs.writeFileSync(path.join(dir, 'mountinfo'), '22 1 0:20 / / rw - ext4 /dev/root rw\n88 22 0:55 / /work rw,relatime - fuse.bindfs /mnt/nfs rw\n');
  fds.forEach((t, i) => fs.symlinkSync(t, path.join(dir, 'fd', String(i))));
};
const G = require(path.join(REPO, 'src/server/fd-gauge.js'));
{
  const dir = path.join(ROOT, 'proc1');
  fakeProc(dir, { soft: 524288, hard: 524288, fds: ['socket:[1]', 'pipe:[2]', '/dev/ptmx', 'anon_inode:[eventpoll]', '/tmp/x'] });
  const lines = [];
  const g = G.create({ procSelf: dir, log: { log: (l) => lines.push(l), warn: (l) => lines.push(l) } });
  const b = g.bootLine({ sessions: 13 });
  ok(b.soft === 524288 && b.count === 5 && /soft 524288 \/ hard 524288/.test(b.line) && /node raises its soft limit/.test(b.line), `the boot line: ${JSON.stringify(b.line.slice(0, 160))}…`);
  ok(b.estimate === FB.fdBudget({ sessions: 13 }).total && /estimate for 13 session\(s\): \d+ \(session pty masters 13/.test(b.line), `…and the estimate beside it (${b.estimate} for 13 sessions)`);
  const est = FB.fdBudget({ sessions: 13 });
  ok(est.total >= 60 && est.total <= 90, `fdBudget(13 sessions) = ${est.total} — the production server held 75 with 13 (measured 2026-09-30)`);
  ok(FB.fdBudget({ sessions: 80, clients: 4 }).total - FB.fdBudget({ sessions: 0, clients: 4 }).total === 80, 'one pty master per session — 80 sessions are 80 handles, nowhere near any limit node runs at');
}

// ── §D THE GAUGE (PURE) ──
console.log('\n§D the gauge: high at ≥ 80 %, one report an hour, and it FALLS');
const H = 3600e3;
const gaugeWalk = (fn) => {
  const out = [];
  out.push(fn({ count: 100, soft: 1000, now: 0, lastReportAt: null }));       // ok
  out.push(fn({ count: 800, soft: 1000, now: 1000, lastReportAt: null }));    // high + report
  out.push(fn({ count: 900, soft: 1000, now: 2000, lastReportAt: 1000 }));    // high, no second report in the hour
  out.push(fn({ count: 900, soft: 1000, now: 1000 + H, lastReportAt: 1000 })); // an hour later: report again
  out.push(fn({ count: 120, soft: 1000, now: 1000 + H + 60e3, lastReportAt: 1000 + H })); // the leak receded: ok AT ONCE
  return out;
};
const gw = gaugeWalk(FB.gaugeVerdict);
const gaugeOk = (w) => w[0].level === 'ok' && !w[0].report && w[1].level === 'high' && w[1].report && w[2].level === 'high' && !w[2].report && w[3].report && w[4].level === 'ok' && !w[4].report;
ok(gaugeOk(gw), `the walk: ${gw.map((v) => v.level + (v.report ? '+report' : '')).join(' → ')}`);
ok(FB.gaugeVerdict({ count: 799, soft: 1000, now: 0 }).level === 'ok' && FB.gaugeVerdict({ count: 800, soft: 1000, now: 0 }).level === 'high', 'the line is exactly 80 %');
ok(FB.gaugeVerdict({ count: 5, soft: null, now: 0 }).level === 'unknown' && FB.gaugeVerdict({ count: 5, soft: Infinity, now: 0 }).level === 'unknown', 'no limit known ⇒ unknown (never a guess)');
{
  const src = fs.readFileSync(path.join(REPO, 'src/fd-budget.js'), 'utf8');
  const latched = src.replace('if (ratio < GAUGE_RATIO) return { level: \'ok\', ratio, report: false };', 'if (ratio < GAUGE_RATIO && !(lastReportAt > 0)) return { level: \'ok\', ratio, report: false };');
  ok(latched !== src, 'control setup: the latched copy took its patch');
  const L = M.load('src/fd-budget.js', latched, 'latched');
  ok(!gaugeOk(gaugeWalk(L.gaugeVerdict)), 'CONTROL: a gauge that stays high once it reported (a gauge that cannot fall) FAILS the walk');
}
ok(FB.fdKind('socket:[12]') === 'socket' && FB.fdKind('pipe:[3]') === 'pipe' && FB.fdKind('/dev/ptmx') === 'pty' && FB.fdKind('/dev/pts/4') === 'pty'
  && FB.fdKind('anon_inode:[io_uring]') === 'anon' && FB.fdKind('/dev/null') === 'device' && FB.fdKind('/home/x/a.json') === 'file' && FB.fdKind('') === 'other', 'fdKind: every readlink shape has its kind');
{
  const t = FB.tallyKinds(['/a/b/1', '/a/b/2', '/c/3', 'socket:[1]', 'pipe:[2]', 'pipe:[3]']);
  ok(t.total === 6 && t.kinds.file === 3 && t.kinds.pipe === 2 && t.topDirs[0].dir === '/a/b' && t.topDirs[0].n === 2, 'tallyKinds counts by kind and names the busiest folder');
}
ok(FB.readLimits('Max open files            unlimited            unlimited            files').soft === Infinity && FB.readLimits('nothing').soft === null, 'readLimits: unlimited / absent');

// ── §E the ORCH gauge over a fake /proc ──
console.log('\n§E the ORCH gauge: one notice, not twice in the hour, and ok again when the count drops');
{
  const dir = path.join(ROOT, 'proc2');
  const fds = [...Array(850)].map((_, i) => (i % 2 ? `socket:[${i}]` : `pipe:[${i}]`));
  fakeProc(dir, { soft: 1000, hard: 1000, fds });
  const notices = [];
  let t = 10 * H;
  const g = G.create({ procSelf: dir, now: () => t, serverNotice: (k, text, o) => { notices.push({ k, text, o }); return 1; }, log: { log() { }, warn() { } } });
  const s1 = await g.tick();
  ok(s1.level === 'high' && notices.length === 1 && notices[0].o.i18n && notices[0].o.i18n.key === FB.GAUGE_KEY && notices[0].o.i18n.params.count === 850,
    `850 of 1000 ⇒ ONE server notice with its i18n key: ${JSON.stringify(notices[0] && notices[0].text.slice(0, 110))}…`);
  ok(/socket 425, pipe 425|pipe 425, socket 425/.test(notices[0].text), '…naming the holders by kind');
  t += 60e3; await g.tick();
  ok(notices.length === 1, 'a minute later, still high: no second notice in the hour');
  for (let i = 100; i < 850; i++) fs.unlinkSync(path.join(dir, 'fd', String(i)));
  t += 60e3; const s3 = await g.tick();
  ok(s3.level === 'ok' && s3.total === 100, `the count dropped to ${s3.total}: the gauge reads ok AT ONCE (it can fall)`);
  // verify r1: a report NOBODY was there to see does not spend the hour (serverNotice answers how many clients got it — its own rule is not to burn the key then)
  const dir3 = path.join(ROOT, 'proc3');
  fakeProc(dir3, { soft: 1000, hard: 1000, fds: [...Array(850)].map((_, i) => `socket:[${i}]`) });
  let present = 0; const tries = []; const jl = [];
  let t3 = 20 * H;
  const g3 = G.create({ procSelf: dir3, now: () => t3, serverNotice: (k) => { tries.push(k); return present; }, log: { log() { }, warn: (l) => jl.push(l) } });
  await g3.tick(); t3 += 60e3; await g3.tick();
  ok(tries.length === 2 && jl.length === 1, `no client connected ⇒ the notice is tried again at the next sample (${tries.length} tries), the journal says it once an hour (${jl.length} line)`);
  present = 2; t3 += 60e3; await g3.tick(); t3 += 60e3; await g3.tick();
  ok(tries.length === 3, 'once a client received it, not again within the hour');
  t3 += H; await g3.tick();
  ok(tries.length === 4 && jl.length === 2, 'an hour later: said again, journalled again');
  // verify r2: the BLAME's hour follows the same rule (its re-arm was pinned by nothing — reverting it stayed green)
  present = 0; const bl = () => tries.filter((k) => k.startsWith('fd-blame:')).length;
  const emfile = Object.assign(new Error('EMFILE: too many open files'), { code: 'EMFILE', path: '/x/data/a.json.tmp' });
  g3.reportWriteError(emfile, '/x/data/a.json.tmp', { failures: 1 }); t3 += 2000; g3.reportWriteError(emfile, '/x/data/a.json.tmp', { failures: 2 });
  ok(bl() === 2, `a write-error notice nobody received is tried again at the next failed write (${bl()} tries)`);
  present = 2; t3 += 2000; g3.reportWriteError(emfile, '/x/data/a.json.tmp', { failures: 3 }); t3 += 60e3; g3.reportWriteError(emfile, '/x/data/a.json.tmp', { failures: 4 });
  ok(bl() === 3, 'once a client received it, the next failed write within the hour says nothing');
  t3 += H; g3.reportWriteError(emfile, '/x/data/a.json.tmp', { failures: 5 });
  ok(bl() === 4, 'an hour later: said again');
}

// ── §F WHO RAN OUT ──
console.log('\n§F who ran out — the next EMFILE has a name');
{
  const mi = '22 1 0:20 / / rw - ext4 /dev/root rw\n88 22 0:55 / /home/u/workspace rw,relatime shared:1 - fuse.bindfs /mnt/nfs_workspace rw,user_id=0\n89 88 0:56 / /home/u/workspace/x\\040y rw - tmpfs tmpfs rw\n';
  const m = FB.mountOf('/home/u/workspace/AIWorkspace/vibespace/data/session-status.json.tmp', mi);
  ok(m && m.target === '/home/u/workspace' && m.fstype === 'fuse.bindfs' && m.source === '/mnt/nfs_workspace', `mountOf: the path is on ${JSON.stringify(m)}`);
  ok(FB.mountOf('/home/u/workspace/x y/f', mi).fstype === 'tmpfs' && FB.mountOf('/etc/hosts', mi).fstype === 'ext4' && FB.mountOf('relative', mi) === null, 'mountOf: the longest prefix wins; an escaped space is a space; a relative path has none');
  const fsb = FB.emfileBlame({ code: 'EMFILE', path: '/home/u/workspace/data/session-status.json.tmp', ownCount: 75, soft: 524288, mount: m });
  ok(fsb.who === 'file-system' && /fuse\.bindfs/.test(fsb.words) && /75 of 524288/.test(fsb.words) && fsb.i18n && fsb.i18n.key === FB.FS_BLAME_KEY, `THE 12:03 SHAPE: ${JSON.stringify(fsb.words.slice(0, 150))}…`);
  ok(FB.emfileBlame({ code: 'EMFILE', ownCount: 1000, soft: 1024, mount: m }).who === 'this-server', 'own count at the limit ⇒ this server (whatever the mount)');
  ok(FB.emfileBlame({ code: 'ENFILE', ownCount: 10, soft: 1024 }).who === 'system', 'ENFILE ⇒ the machine');
  ok(FB.emfileBlame({ code: 'EMFILE', ownCount: 10, soft: 1024, mount: { target: '/', fstype: 'ext4' } }).who === 'unknown', 'EMFILE on a local fs while far below our limit ⇒ unknown, both numbers said');
  const lines = [];
  const notices = [];
  const dir = path.join(ROOT, 'proc3');
  fakeProc(dir, { soft: 524288, hard: 524288, fds: ['socket:[1]', 'pipe:[2]'] });
  fs.writeFileSync(path.join(dir, 'mountinfo'), mi);
  let t = 0;
  const g = G.create({ procSelf: dir, now: () => t, serverNotice: (k, text, o) => { notices.push({ k, text, o }); return 1; }, log: { log: (l) => lines.push(l), warn: (l) => lines.push(l) } });
  const err = Object.assign(new Error('EMFILE: too many open files'), { code: 'EMFILE' });
  g.reportWriteError(err, '/home/u/workspace/data/session-status.json.tmp', { failures: 1, retryMs: 1000 });
  g.reportWriteError(err, '/home/u/workspace/data/session-status.json.tmp', { failures: 2, retryMs: 2000 });
  ok(lines.length === 1 && /a background write failed \(EMFILE; attempt 1, retrying in 1 s\)/.test(lines[0]) && /file system under \/home\/u\/workspace \(fuse\.bindfs\)/.test(lines[0]),
    `a failed background write: ONE journal line naming the mount — ${JSON.stringify((lines[0] || '').slice(0, 140))}…`);
  ok(notices.length === 1 && notices[0].o.i18n && notices[0].o.i18n.key === FB.FS_BLAME_KEY, '…and ONE notice an hour (with the client\'s i18n key)');
  t += H; g.reportWriteError(err, '/home/u/workspace/data/x.tmp', { failures: 9 });
  ok(notices.length === 2, 'an hour later the same failure is said again');
}

// ── §G the debounced writes never throw ──
console.log('\n§G the debounced writes keep their state, retry, and report — never a crash (session-status, user-todos, the channels index)');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (const [rel, cls, file, poke] of [
  ['src/session-status.js', 'SessionStatusManager', 'session-status.json', (m) => { m._state.statuses.k = { at: 1 }; m._save(); }],
  ['src/user-todos.js', 'UserTodoManager', 'user-todos.json', (m) => { m._state.items.push({ id: 'x', status: 'open', text: 't', createdAt: 1 }); m._save(); }],   // through the store's OWN timer (verify r1: a poke that armed the guarded timer by hand let a reverted guard go green)
]) {
  const dir = path.join(ROOT, 'st-' + cls);
  fs.mkdirSync(path.join(dir, file + '.tmp'), { recursive: true });   // the tmp path is a DIRECTORY: every write fails (EISDIR) — the error class that killed the server
  const Cls = require(path.join(REPO, rel))[cls];
  const errs = [];
  const m = new Cls({ dataDir: dir, onChange() { }, onWriteError: (e, f, o) => errs.push({ code: e.code, f, ...o }) });
  poke(m);
  await sleep(800);
  ok(errs.length === 1 && errs[0].code === 'EISDIR' && errs[0].failures === 1 && errs[0].retryMs === 1000 && m._dirty === true, `${cls}: the failed write did NOT throw — dirty kept, reported (${JSON.stringify(errs[0])})`);
  fs.rmdirSync(path.join(dir, file + '.tmp'));
  await sleep(1400);
  ok(fs.existsSync(path.join(dir, file)) && m._dirty === false && m._writeFailures === 0, `${cls}: the retry landed once the file system recovered`);
  try { clearTimeout(m._expiryTimer); clearInterval(m._expiryTimer); } catch { }
}
{
  // THE THIRD WRITER a full table met (test-restore-liveness ⑤, measured: a server whose table was full died in the
  // channels index's debounce timer once session-status was fixed) — the same rule, the same proof
  const { createChannelStore } = require(path.join(REPO, 'src/channel-store.js'));
  const dir = path.join(ROOT, 'channels');
  const warns = [];
  const st = createChannelStore({ dir, log: { warn: (...a) => warns.push(a.join(' ')), log() { } } });
  const tmp = path.join(dir, `index.json.tmp-${process.pid}`);
  fs.mkdirSync(tmp, { recursive: true });   // the index's tmp path is a directory: its write fails (EISDIR)
  await st.index.update((ix) => { ix.conversations['fake/c1'] = { probe: 1 }; });
  await sleep(800);
  ok(warns.some((w) => /\[channels\] index\.json not written \(EISDIR; attempt 1\) — kept in memory, retrying in 1 s/.test(w)), `channel-store: the failed index write did NOT throw — said and owed (${JSON.stringify(warns[0] || '')})`);
  fs.rmdirSync(tmp);
  await sleep(1500);
  let onDisk = null; try { onDisk = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8')); } catch { }
  ok(onDisk && onDisk.conversations && onDisk.conversations['fake/c1'], 'channel-store: the retry wrote the owed index (dirty is cleared only once it is on disk)');
  try { st.close(); } catch { }
}
{
  // CONTROL — the PRE-FIX session-status: its timer called _flush() bare; the same failure is a process death
  const src = fs.readFileSync(path.join(REPO, 'src/session-status.js'), 'utf8');
  const pre = src.replace('this._writeTimer = setTimeout(() => { this._writeTimer = null; this._flushFromTimer(); }, 500);', 'this._writeTimer = setTimeout(() => { this._writeTimer = null; this._flush(); }, 500);');
  ok(pre !== src, 'control setup: the pre-fix copy took its patch');
  const copy = M.write('src/session-status.js', pre, 'prefix');
  const dir = path.join(ROOT, 'st-pre');
  fs.mkdirSync(path.join(dir, 'session-status.json.tmp'), { recursive: true });
  const r = spawnSync(process.execPath, ['-e', `const { SessionStatusManager } = require(${JSON.stringify(copy)}); const m = new SessionStatusManager({ dataDir: ${JSON.stringify(dir)}, onChange() {} }); m._state.statuses.k = { at: 1 }; m._save(); setTimeout(() => process.exit(0), 1500);`], { encoding: 'utf8', timeout: 10000 });
  ok(r.status !== 0 && /EISDIR/.test(r.stderr), `CONTROL: the pre-fix timer's write error kills the process (exit ${r.status}, ${JSON.stringify((/Error: [^\n]*/.exec(r.stderr) || [''])[0])}) — the 12:03 crash`);
}

// ── §H the wiring ──
console.log('\n§H the wiring in server.js');
{
  const S = fs.readFileSync(path.join(REPO, 'server.js'), 'utf8');
  ok(/const fdGauge = require\('\.\/src\/server\/fd-gauge\.js'\)\.create\(/.test(S), 'the gauge is created');
  ok((S.match(/onWriteError: \(e, file, o\) => fdGauge\.reportWriteError\(e, file, o\)/g) || []).length === 2, 'BOTH debounced stores report their failed writes to it (session-status + user-todos)');
  const crash = (/process\.on\('uncaughtException', \(e\) => \{([\s\S]*?)\n\}\);/.exec(S) || [])[1] || '';
  ok(/e\.code === 'EMFILE' \|\| e\.code === 'ENFILE'[^\n]*fdGauge\.blame\(e, e\.path\)\.words/.test(crash), 'the crash handler names an EMFILE/ENFILE before exiting');
  ok(/fdGauge\.bootLine\(\{ sessions: /.test(S) && /fdGauge\.start\(\)/.test(S) && S.indexOf('fdGauge.bootLine(') > S.indexOf('restoreSessions(); bootBrowserKeeper()'), 'the boot line + the gauge run after the restore (the session count is known)');
}

console.log(`\n${fail ? fail + ' FAILED (' + pass + ' passed' + (skipped ? ', ' + skipped + ' skipped' : '') + ')' : 'ALL PASS (' + pass + (skipped ? ', ' + skipped + ' skipped' : '') + ')'}`);
process.exit(fail ? 1 : 0);

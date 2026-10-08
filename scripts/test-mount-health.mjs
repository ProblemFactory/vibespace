#!/usr/bin/env node
// lane fuse-canary-notice (B-b327): a wedged mount reaches the owner by name and the server stops pressing it. PURE tables
// (the canary episode, who presses the mount, the words, the pause verdict per kind, mountOf) + patched-copy CONTROLS (a
// step filing per strike, a verdict pausing a person's read — each must read RED by the same judge) + ONE fixture-driven
// engine leg: a fake SafeFs whose stat hangs on one mountpoint drives the REAL canary → the episode → ONE item → the
// usage walk / discovery gates skip (counters) while a person's read runs → the mount answers → resumed. No real FUSE.
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MH = require(path.join(ROOT, 'src/mount-health.js'));
const { createFsCanary } = require(path.join(ROOT, 'src/server/fs-canary.js'));
const MHW = require(path.join(ROOT, 'src/server/mount-health-watch.js'));
const { UsageHistory } = require(path.join(ROOT, 'src/usage-history.js'));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.log('  ✗ ' + m); } };
const S = 1000;
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-mounthealth-'));
const mutant = (rel, from, to, tag) => {
  const src = fs.readFileSync(path.join(ROOT, rel), 'utf8').replace("require('./memory-pressure.js')", JSON.stringify(path.join(ROOT, 'src/memory-pressure.js')).replace(/^/, 'require(') + ')');
  const out = src.replace(from, to);
  ok(out !== src, `control ${tag}: the patch applied`);
  const p = path.join(scratch, `${tag}.js`); fs.writeFileSync(p, out); return require(p);
};

try {
  console.log('① the episode (on at the 2nd strike within 2 min, off after 3 clean probes, ONE open per episode)');
  const drive = (step, seq) => { let st = null, opens = 0, closes = 0, wedged = []; for (const [strike, at] of seq) { const r = step(st, { strike, at, ms: 5000 }); st = r.state; opens += r.open ? 1 : 0; closes += r.close ? 1 : 0; if (r.close) wedged.push(r.wedgedMs); } return { st, opens, closes, wedged }; };
  const SEQ = [[false, 0], [true, 10 * S], [true, 20 * S], [true, 30 * S], [true, 40 * S], [false, 50 * S], [false, 60 * S], [true, 70 * S], [false, 80 * S], [false, 90 * S], [false, 100 * S]];
  const real = drive(MH.canaryStep, SEQ);
  ok(real.opens === 1 && real.closes === 1, `one episode over 5 strikes + 2 clean + a strike + 3 clean → 1 open / 1 close (got ${real.opens}/${real.closes})`);
  ok(real.wedged[0] === 90 * S, `it ends "N s wedged" from the first strike (10 s → 100 s = 90 s; got ${real.wedged[0]})`);
  ok(drive(MH.canaryStep, [[true, 0]]).opens === 0, 'ONE strike opens nothing');
  ok(drive(MH.canaryStep, [[true, 0], [true, MH.WINDOW_MS + 1]]).opens === 0, 'two strikes MORE than 2 min apart open nothing (the window)');
  ok(drive(MH.canaryStep, [[true, 0], [false, 10 * S], [true, MH.WINDOW_MS - 1]]).opens === 1, 'two strikes within 2 min open one, a clean probe between does not reset the window');
  ok(drive(MH.canaryStep, [[true, 0], [true, S], [false, 2 * S], [false, 3 * S]]).closes === 0, 'two clean probes do not end it');
  ok(drive(MH.canaryStep, [[true, 0], [true, S], [false, 2 * S], [false, 3 * S], [true, 4 * S], [false, 5 * S], [false, 6 * S]]).closes === 0, 'a strike resets the clean count');
  ok(drive(MH.canaryStep, [[true, 0], [true, S], [false, 2 * S], [false, 3 * S], [false, 4 * S], [true, 5 * S], [true, 6 * S]]).st.episode === 2, 'episodes are counted');
  ok(MH.canaryStep(null, null).open === false && MH.canaryStep(null, { strike: true }).open === false, 'a probe without an instant changes nothing');
  const M1 = mutant('src/mount-health.js', 'if (s.on) { s.count++; return { state: s, open: false,', 'if (s.on) { s.count++; return { state: s, open: true,', 'per-strike');
  const m = drive(M1.canaryStep, SEQ);
  ok(m.opens > 1, `CONTROL red: a step filing per strike opens ${m.opens} items on the same sequence (the judge above wants 1)`);

  console.log('② who presses the mount (cwd / open files / argv under it; attributed by memory-pressure\'s attribute)');
  const MP = '/mnt/data';
  const procs = [
    { pid: 1, ppid: 0, comm: 'systemd', argv: ['/sbin/init'] },
    { pid: 100, ppid: 1, comm: 'node', argv: ['node', 'claude-wrapper.js'] },
    { pid: 101, ppid: 100, comm: 'bash', argv: ['bash'], cwd: '/mnt/data/work', fds: ['/mnt/data/work/a.log', '/mnt/data/b', '/home/u/x'] },
    { pid: 200, ppid: 1, comm: 'node', argv: ['node', 'job.js'] },
    { pid: 201, ppid: 200, comm: 'tar', argv: ['tar', 'czf', 'out.tgz', '/mnt/data/big'] },
    { pid: 300, ppid: 1, comm: 'chrome', argv: ['/opt/google/chrome/chrome', '--vibespace-keeper=k1', '--user-data-dir=/home/u/p'], fdHits: 3 },
    { pid: 400, ppid: 1, comm: 'rsync', argv: ['rsync', '-a', 'src', 'dst'], fds: ['/mnt/data/1', '/mnt/data/2', '/mnt/data/3', '/mnt/data/4', '/mnt/data/5'] },
    { pid: 500, ppid: 1, comm: 'sleep', argv: ['sleep', '9'], cwd: '/home/u', fds: ['/mnt/data2/x', '/mnt/database'] },
  ];
  const ids = { sessions: [{ pid: 100, name: 'Fix the build' }], jobs: [{ pid: 200, name: 'nightly-backup' }], keepers: { k1: { label: 'work', holders: ['Fix the build'] } } };
  const sus = MH.suspectsOf(procs, MP, ids);
  const row = (k) => sus.find((g) => g.kind === k) || {};
  ok(sus.length === 4, `4 groups press it (got ${sus.length}: ${sus.map((g) => g.key).join(', ')})`);
  ok(sus[0].kind === 'unknown' && sus[0].hits === 5 && /rsync \(400\)/.test(sus[0].who.text), `heaviest first: rsync's 5 open files, "a process VibeSpace did not start" (got ${sus[0].key} ${sus[0].hits})`);
  ok(row('session').hits === 3 && row('session').via.join() === 'files,cwd' && row('session').who.text === 'the conversation Fix the build', 'a conversation\'s child: 2 files + its cwd, named by the conversation (the 3rd fd is elsewhere)');
  ok(row('keeper').hits === 3 && /agent browser "work" \(used by Fix the build\)/.test(row('keeper').who.text), 'a keeper browser: its profile + who holds it');
  ok(row('job').hits === 1 && row('job').via.join() === 'argv' && row('job').who.text === 'the Background Work job nightly-backup', 'a job\'s child by its command line');
  ok(!sus.some((g) => g.pids.includes(500)), '/mnt/data2/x and /mnt/database are NOT under /mnt/data (prefix trap)');
  ok(MH.suspectsOf(procs, MP, ids, { top: 2 }).length === 2 && MH.suspectsOf([], MP).length === 0, 'top N bounds it; an empty table → none');

  console.log('③ the words (text ≤ 500, detail ≤ 8000; every key in zh + ja)');
  const it = MH.canaryItem({ mountpoint: MP, strikes: 3, latencyMs: 5000, suspects: sus });
  ok(it.text === 'The folder /mnt/data stopped answering (3 checks over 5 s) — the most is open by a process VibeSpace did not start: rsync (400)', `the head names the mount, the strikes and who (got ${it.text})`);
  ok(/VibeSpace paused its own scans of it until it answers:\n- the session discovery sweep\n- the usage walk/.test(it.detail) && /A file you open yourself is never paused/.test(it.detail), 'the detail says what was paused and that a person\'s read is not');
  ok(/- 3 · the conversation Fix the build · 2 processes|- 3 · the conversation Fix the build · 1 process/.test(it.detail), 'each suspect row: hits · who · processes');
  const long = MH.canaryItem({ mountpoint: '/m/' + 'x'.repeat(900), strikes: 2, latencyMs: 5000, suspects: Array.from({ length: 50 }, (_, i) => ({ kind: 'unknown', key: 'u' + i, name: 'p'.repeat(400), rootPid: i, hits: 1, n: 1 })) });
  ok(long.text.length <= 500 && long.detail.length <= 8000, `bounds hold (${long.text.length} / ${long.detail.length})`);
  const none = MH.canaryItem({ mountpoint: MP, strikes: 2, latencyMs: 5000, suspects: [] });
  ok(none.text === 'The folder /mnt/data stopped answering (2 checks over 5 s)' && /No process has a file open there\./.test(none.detail), 'no suspect: said so');
  const zh = (await import(pathToFileURL(path.join(ROOT, 'src/lib/i18n-zh.js')).href)).default;
  const ja = (await import(pathToFileURL(path.join(ROOT, 'src/lib/i18n-ja.js')).href)).default;
  const keys = [it, none].flatMap((x) => [x.i18n.text.key, ...x.i18n.detail.map((r) => r.key)]);
  const missing = keys.filter((k) => !zh[k] || !ja[k]);
  ok(keys.length >= 10 && !missing.length, `every key has zh + ja (${keys.length} keys; missing: ${missing.join(' | ')})`);
  ok(MH.canaryEndLine({ mountpoint: MP, wedgedMs: 207400 }) === 'the mount /mnt/data answers again — 207 s wedged', 'the end line');

  console.log('④ the pause verdict per kind (a person\'s read is NEVER paused)');
  const on = { on: true, mountpoint: MP }, off = { on: false, mountpoint: MP };
  for (const k of MH.PAUSE_KINDS) ok(MH.shouldPause(k, on) === true && MH.shouldPause(k, off) === false, `${k}: paused while on, runs while off`);
  ok(MH.shouldPause('user-read', on) === false && MH.shouldPause('user-read', on, [MP + '/f']) === false, 'user-read: never paused, even under the wedged mount');
  ok(MH.shouldPause('something-new', on) === false, 'an undeclared kind is never paused');
  ok(MH.shouldPause('usage-walk', on, ['/home/u/.claude/projects', MP + '/vs/data/usage-history']) === true && MH.shouldPause('usage-walk', on, ['/home/u/.claude/projects']) === false, 'paths: paused only when a root is under the mount');
  const M2 = mutant('src/mount-health.js', "const PAUSE_KINDS = Object.freeze(['discovery',", "const NEVER_PAUSED_ = 0; const PAUSE_KINDS = Object.freeze(['user-read', 'discovery',", 'pause-user').shouldPause;
  const M2b = mutant('src/mount-health.js', "if (NEVER_PAUSED.includes(kind) || !PAUSE_KINDS.includes(kind)) return false;", 'if (!PAUSE_KINDS.includes(kind) && kind !== \'user-read\') return false;', 'pause-user-b').shouldPause;
  ok(M2('user-read', on) === false && M2b('user-read', on) === true, 'CONTROL red: a verdict that pauses user-read answers true (the judge above wants false); listing it alone is still refused by NEVER_PAUSED');

  console.log('⑤ mountOf (the longest mount point holding the canary\'s file; mountinfo octal escapes)');
  const MI = ['22 1 0:21 / / rw - ext4 /dev/a rw', '40 22 0:40 / /home rw - ext4 /dev/b rw', '41 40 0:41 / /home/u/work\\040space rw - fuse.bindfs x rw', '42 41 0:42 / /home/u/work\\040space/vs/data rw - fuse.rclone y rw'].join('\n');
  ok(MH.mountOf(MI, '/home/u/work space/vs/package.json') === '/home/u/work space', 'the checkout\'s file → the bindfs mount (escaped space)');
  ok(MH.mountOf(MI, '/home/u/work space/vs/data/x') === '/home/u/work space/vs/data' && MH.mountOf(MI, '/etc/x') === '/', 'nested mount wins; else /');

  console.log('⑥ fixture: a fake SafeFs stat hangs on ONE mountpoint → the REAL canary → episode → ONE item → pauses → resumed');
  const mp = path.join(scratch, 'mnt');
  fs.mkdirSync(mp, { recursive: true });
  fs.writeFileSync(path.join(mp, 'package.json'), '{}');
  let hung = false, userReads = 0;
  const fakePool = { call: async (op, { path: p, deadlineMs }) => {
    const startAt = Date.now();
    if (hung && MH.underMount(p, mp)) { await new Promise((r) => setTimeout(r, deadlineMs)); return { timedOut: true, fsMs: deadlineMs, startAt, doneAt: Date.now(), where: 'worker' }; }
    return { timedOut: false, fsMs: 1, startAt, doneAt: Date.now(), where: 'worker' };
  }, close() {} };
  const adds = [], statuses = [], journal = [];
  const items = new Map();
  const todos = { add: (key, o) => { const id = 'i' + (adds.length + 1); adds.push([key, o]); items.set(id, { id, status: 'open' }); return { id }; }, get: (id) => items.get(id), setStatus: (id, st, by) => { statuses.push([id, st, by]); items.get(id).status = st; } };
  const fixtureProcs = [{ pid: 7, ppid: 1, comm: 'rsync', argv: ['rsync'], fds: [path.join(mp, 'a'), path.join(mp, 'b')] }, { pid: 8, ppid: 1, comm: 'bash', argv: ['bash'], cwd: '/home/u' }];
  const log = { warn: (s) => journal.push(String(s)), log: (s) => journal.push(String(s)) };
  const watch = MHW.create({ file: path.join(mp, 'package.json'), mountpoint: mp, getUserTodos: () => todos, procTable: async () => fixtureProcs, ownerIds: async () => ({}), log });
  const canary = createFsCanary({ file: path.join(mp, 'package.json'), probe: fakePool, deadlineMs: 20, slowMs: 1000, log: () => {}, onProbe: (p) => watch.onProbe(p) });
  const uh = new UsageHistory({ dataDir: path.join(mp, 'data'), homeDir: path.join(mp, 'home'), paused: (roots) => watch.paused('usage-walk', roots) });
  const discovery = () => watch.paused('discovery'); // the /api/sessions sweep asks exactly this (pinned below)
  const userRead = (p) => { if (watch.paused('user-read', [p])) return null; userReads++; return fs.readFileSync(p, 'utf8'); }; // production never asks; the verdict refuses anyway

  await canary.tick();
  hung = true;
  await canary.tick(); await canary.tick();
  await watch.settled();
  ok(watch.state().on === true && adds.length === 1, `two strikes → the episode is on, ONE item filed (got on=${watch.state().on}, ${adds.length})`);
  const [key, o] = adds[0] || [];
  ok(key === MHW.INBOX_KEY && o.origin === 'server' && o.kind === 'notice' && o.text.includes(mp) && /rsync \(7\)/.test(o.text) && /2 checks over 0 s|2 checks over/.test(o.text), `the item: origin server, names the mount + who presses it (${o && o.text})`);
  await canary.tick(); await canary.tick(); await canary.tick();
  ok(adds.length === 1, `three more strikes: still ONE item (got ${adds.length})`);
  const scanned = await uh.scan();
  ok(scanned && scanned.paused === true && scanned.skipped === true, `the usage walk's timed scan does not start (${JSON.stringify(scanned)})`);
  const d1 = discovery(), d2 = discovery();
  ok(d1 === true && d2 === true, 'the discovery sweep\'s schedule is told to wait (twice)');
  const body = userRead(path.join(mp, 'package.json'));
  ok(body === '{}' && userReads === 1, 'a person\'s read under the wedged mount RUNS');
  ok(journal.filter((l) => /^\[mount-health\] paused (usage-walk|discovery) on /.test(l)).length === 2, `one journal line per paused kind (got ${journal.filter((l) => /paused/.test(l)).length})`);
  const counts = { usage: watch.counts.paused['usage-walk'] || 0, discovery: watch.counts.paused.discovery || 0, userReads, filed: watch.counts.filed };
  hung = false;
  await canary.tick(); await canary.tick();
  ok(watch.state().on === true && statuses.length === 0, 'two clean probes: still on');
  await canary.tick();
  ok(watch.state().on === false && statuses.length === 1 && statuses[0][0] === 'i1' && statuses[0][1] === 'done', 'the third clean probe: the episode ends, the item resolves itself');
  ok(journal.some((l) => new RegExp(`the mount ${mp.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} answers again — \\d+ s wedged — resumed the server's own scans \\(skipped: (usage-walk 1, discovery 2|discovery 2, usage-walk 1)\\)`).test(l)), 'the resume journal line names the skips');
  uh._lastScanAt = 0;
  const again = await uh.scan();
  ok(again && !again.paused && !again.skipped, `resumed: the next timed scan runs (${JSON.stringify(again)})`);
  ok(discovery() === false, 'resumed: discovery runs');

  // a walk IN FLIGHT stops at its next yield when the episode starts (cursors untouched), then runs whole after
  const home2 = path.join(mp, 'home2'), proj = path.join(home2, '.claude', 'projects', '-w');
  fs.mkdirSync(proj, { recursive: true });
  let n = 0;
  const rec = () => JSON.stringify({ type: 'assistant', requestId: 'req_' + (++n), timestamp: new Date().toISOString(), message: { id: 'msg_' + n, model: 'claude-fable-5', usage: { input_tokens: 100, output_tokens: 20 } } }) + '\n';
  fs.writeFileSync(path.join(proj, 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.jsonl'), Array.from({ length: 40 }, rec).join(''));
  let yields = 0;
  const t0 = Date.now() + 10 * 60 * S;
  const uh2 = new UsageHistory({ dataDir: path.join(mp, 'data2'), homeDir: home2, scanBudgetBytes: 256, scanYield: async () => { if (++yields === 1) { watch.onProbe({ strike: true, at: t0, ms: 20 }); watch.onProbe({ strike: true, at: t0 + S, ms: 20 }); } }, paused: (roots) => watch.paused('usage-walk', roots) });
  const mid = await uh2.scan();
  await watch.settled();
  ok(mid && mid.paused === true && yields === 1 && Object.keys(uh2._cursors || {}).length === 0, `a walk in flight stops at its next yield, cursors untouched (${JSON.stringify(mid)}, yields ${yields})`);
  ok(adds.length === 2, 'that second episode filed its own ONE item');
  for (let i = 2; i < 5; i++) watch.onProbe({ strike: false, at: t0 + i * S, ms: 1 });
  uh2._lastScanAt = 0;
  const whole = await uh2.scan();
  ok(whole && !whole.paused && whole.added === 40, `resumed: the walk runs whole (${JSON.stringify(whole)})`);
  counts.usage = watch.counts.paused['usage-walk'];
  console.log(`  COUNTS: paused scans usage-walk ${counts.usage} (1 timed + 1 in flight) · discovery ${counts.discovery} · user reads run ${counts.userReads} · items filed ${counts.filed} in episode 1, ${watch.counts.filed} over 2 episodes · resolved ${statuses.length}`);

  console.log('⑦ wiring pins (the gates ask the verdict at their existing schedule)');
  const sessions = fs.readFileSync(path.join(ROOT, 'src/routes/sessions.js'), 'utf8');
  ok(sessions.includes("if (_sessionsCache && (Date.now() - _sessionsCacheAt < 4500 || discoveryPaused())) return res.json(_sessionsCache);") && sessions.includes("ctx.paused('discovery')"), '/api/sessions: the sweep\'s TTL gate asks the discovery verdict (the last answer stands; none yet ⇒ it runs)');
  const server = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  ok(server.includes('onProbe: (p) => mountHealth.onProbe(p)') && server.includes("paused: (roots) => mountHealth.paused('usage-walk', roots)") && server.includes('paused: (kind) => mountHealth.paused(kind)'), 'server.js: the canary drives the watch; the usage walk and the sessions route ask it');
  const table = MHW.scanProc('/proc', { perProc: 4, total: 64 });
  ok(Array.isArray(table) && table.some((p) => p.pid === process.pid && p.ppid > 0 && p.comm), `scanProc reads this machine's table bounded (${table.length} processes)`);
} finally {
  fs.rmSync(scratch, { recursive: true, force: true });
}
console.log(`\n${fail ? '✗' : '✓'} test-mount-health: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

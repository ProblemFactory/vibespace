#!/usr/bin/env node
// lane browser-resource-care (B-afeb): memory pressure reaches the owner (ONE For-you item per episode naming who started
// each top process group, self-resolving), a conversation's own Chrome is told, a browser VibeSpace launches keeps its
// daemon scratch off the RAM-backed /tmp, and a profile's disk budget is a reported verdict. PURE tables + one stubbed
// watch run + a patched-copy control (a step that files per sample must read RED here).
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MP = require(path.join(ROOT, 'src/memory-pressure.js'));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.log('  ✗ ' + m); } };
const G = 2 ** 30;

console.log('① the episode (on ≥ 90 %, off < 80 %, ONE open per episode, self-resolve)');
const drive = (step, pcts) => { let st = null, opens = 0, closes = 0; for (const p of pcts) { const r = step(st, { used: p * G, limit: 100 * G, at: 1 }); st = r.state; opens += r.open ? 1 : 0; closes += r.close ? 1 : 0; } return { opens, closes, st }; };
const SEQ = [50, 91, 95, 99, 92, 85, 81, 90, 79, 70, 93, 60];
const real = drive(MP.pressureStep, SEQ);
ok(real.opens === 2 && real.closes === 2, `two episodes in ${SEQ.join(',')} → 2 opens / 2 closes (got ${real.opens}/${real.closes})`);
ok(drive(MP.pressureStep, [95, 95, 95, 95]).opens === 1, 'a held 95 % files ONE item');
ok(drive(MP.pressureStep, [95, 85, 95]).opens === 1, '85 % (between off and on) does not end the episode');
ok(drive(MP.pressureStep, [89.9, 80, 89]).opens === 0, 'below 90 % never opens');
ok(MP.pressureStep(null, { used: 5, limit: 0 }).open === false, 'a sample without a limit changes nothing');
ok(drive(MP.pressureStep, [95]).st.episode === 1 && drive(MP.pressureStep, [95, 70, 95]).st.episode === 2, 'episodes are counted');
// CONTROL: a patched copy that files per sample over the line must read RED by the same judge
const src = fs.readFileSync(path.join(ROOT, 'src/memory-pressure.js'), 'utf8');
const mutSrc = src.replace('if (!s.on && pct >= ON_PCT)', 'if (pct >= ON_PCT)');
ok(mutSrc !== src, 'control: the patch applied');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-mp-'));
try {
  fs.writeFileSync(path.join(dir, 'mp.js'), mutSrc);
  const MUT = require(path.join(dir, 'mp.js'));
  const m = drive(MUT.pressureStep, SEQ);
  ok(m.opens > 2, `CONTROL red: a per-sample filer opens ${m.opens} items on the same sequence (the judge above wants 2)`);
} finally { fs.rmSync(dir, { recursive: true, force: true }); }

console.log('② attribution (keeper mark / wrapper chain / job pid / app / own Chrome / unknown)');
const MB = 2 ** 20;
const P = (pid, ppid, mb, comm, args) => ({ pid, ppid, pss: mb * MB, comm, args });
const procs = [
  P(1, 0, 10, 'systemd', '/sbin/init'),
  P(100, 1, 50, 'node', 'node pty-wrapper.js'), P(101, 100, 300, 'claude', 'claude'), P(102, 101, 5, 'bash', 'bash -c x'),
  P(103, 102, 900, 'chrome', '/opt/google/chrome/chrome --headless=new --remote-debugging-port=9333 --user-data-dir=/tmp/cdp-prof-1'),
  P(104, 103, 1500, 'chrome', '/opt/google/chrome/chrome --type=renderer'),
  P(200, 1, 20, 'agent-browser', 'agent-browser daemon'), P(201, 200, 700, 'chrome', '/opt/google/chrome/chrome --vibespace-keeper=p-work --remote-debugging-port=0'),
  P(202, 201, 1200, 'chrome', '/opt/google/chrome/chrome --type=renderer'),
  P(300, 1, 400, 'python3', 'python3 batch.py'), P(301, 300, 100, 'python3', 'python3 worker'),
  P(400, 1, 250, 'libreoffice', 'soffice'),
  P(500, 1, 3000, 'wechat', '/opt/wechat/wechat'), P(501, 500, 10, 'wechat', 'helper'),
  P(600, 100, 40, 'chrome', '/opt/google/chrome/chrome --remote-debugging-port=9222 --vibespace-keeper=eph-key'),
];
const groups = MP.attribute(procs, { sessions: [{ pid: 100, name: 'refactor-lane' }], jobs: [{ pid: 300, name: 'nightly-batch' }], apps: [{ pid: 400, name: 'LibreOffice' }], keepers: { 'p-work': { label: 'Work', holders: ['research-chat'] } } });
const by = Object.fromEntries(groups.map((g) => [g.key, g]));
ok(by['unknown:500'] && by['unknown:500'].pss === 3010 * MB && groups[0].key === 'unknown:500', 'an unknown tree is one group by its root, largest first');
ok(by['own:refactor-lane'] && by['own:refactor-lane'].pss === 2400 * MB && by['own:refactor-lane'].chromes.join() === '103' && by['own:refactor-lane'].dirs[0] === '/tmp/cdp-prof-1', "a debugging-port Chrome without the mark under a wrapper = that conversation's own Chrome (renderers included)");
ok(by['session:refactor-lane'] && by['session:refactor-lane'].pss === 355 * MB, "the conversation's own tree (wrapper + CLI + shell) is its session group");
ok(by['keeper:p-work'] && by['keeper:p-work'].pss === 1900 * MB && by['keeper:p-work'].holders[0] === 'research-chat', 'a keeper-marked Chrome + its renderers = the profile with its holders');
ok(by['keeper:eph-key'] && !by['own:refactor-lane'].chromes.includes(600), 'a keeper-marked Chrome under a wrapper is the keeper\'s, never "own"');
ok(by['job:nightly-batch'] && by['job:nightly-batch'].pss === 500 * MB, 'a Background Work job = its pid tree');
ok(by['app:LibreOffice'] && by['app:LibreOffice'].n === 1, 'a desktop app = its row');
ok(groups.reduce((a, g) => a + g.n, 0) === procs.length, 'every process lands in exactly one group');
ok(MP.isOwnChromeRoot(procs[4]) && !MP.isOwnChromeRoot(procs[5]) && !MP.isOwnChromeRoot(procs[7]), 'own-Chrome root: browser process only, never a renderer or a keeper mark');

console.log('③ the words (bounds, every key worded in zh/ja)');
const item = MP.pressureItem({ pct: 95.4, used: 58 * G, limit: 61 * G, groups, tmpfs: { mount: '/tmp', used: 38.8 * G, size: 61.3 * G }, roots: [{ path: '/tmp/agent-browser-chrome-*', bytes: 8.9 * G }] });
ok(item.text.startsWith('Memory is 95% full (58.0 of 61.0 GB) — the most is held by a process VibeSpace did not start: wechat (500)'), 'text: percent, GB, the largest holder: ' + item.text);
ok(item.text.length <= MP.TEXT_MAX && item.detail.length <= MP.DETAIL_MAX, 'user-todos bounds');
ok(/Chrome started by refactor-lane outside vibespace-browser/.test(item.detail) && /the agent browser "Work" \(used by research-chat\)/.test(item.detail) && /the Background Work job nightly-batch/.test(item.detail), 'detail names who started each group');
ok(/\/tmp is in RAM: 38\.8 of 61\.3 GB used/.test(item.detail) && /8\.9 GB · \/tmp\/agent-browser-chrome-\*/.test(item.detail), 'detail: the RAM-backed /tmp and its largest roots');
ok(item.detail.split('\n').filter((l) => / · .* · \d+ process/.test(l)).length === MP.TOP_GROUPS, 'top 5 groups only');
const long = MP.pressureItem({ pct: 99, used: G, limit: G, groups: [{ kind: 'session', name: 'x'.repeat(900), pss: G, n: 1 }] });
ok(long.text.length === MP.TEXT_MAX, 'an over-long name is cut at the text bound');
const ZH = require(path.join(ROOT, 'src/lib/i18n-zh.js')), JA = require(path.join(ROOT, 'src/lib/i18n-ja.js'));
const dict = (m) => (m && m.default) || m;
const keys = [item.i18n.text.key, ...item.i18n.detail.map((r) => r.key).filter((k) => !k.startsWith('- {size} GB')), ...groups.map((g) => MP.whoOf(g).key), require(path.join(ROOT, 'src/inbox-origin.js')).ORIGIN_LABELS.server];
const zh = dict(ZH), ja = dict(JA);
const flat = (d) => (d && typeof d === 'object' && !Array.isArray(d) ? (d.strings || d) : {});
const miss = keys.filter((k) => !(k in flat(zh)) || !(k in flat(ja)));
ok(miss.length === 0, 'every key has zh + ja: missing ' + miss.join(' | '));
const told = MP.ownChromeNotice({ count: 3, dirs: ['/tmp/cdp-prof-1'], tmpfsDirs: ['/tmp/cdp-prof-1'], bytes: 2.5 * G });
ok(told === 'You started 3 Chrome processes outside vibespace-browser (profile dirs on tmpfs: /tmp/cdp-prof-1, 2.5 GB). Use vibespace-browser (it keeps profiles off RAM and reports their size); if you must run your own, give it --user-data-dir under your cwd.', 'the told line: ' + told);
ok(MP.renderOwnChromeNotice({ text: told }).startsWith('<system-reminder>\nYou started 3'), 'rendered as a system reminder');
const SS = require(path.join(ROOT, 'src/session-status.js'));
ok(SS.NOTICE_KINDS.includes(MP.NOTICE_KIND), 'session-status renders the browser-own-chrome kind');
ok(require(path.join(ROOT, 'src/inbox-origin.js')).normalizeOrigin('server') === 'server', "inbox origin 'server' is in the closed set");

console.log('④ the disk budget (reported, never a stop)');
const RG = require(path.join(ROOT, 'src/runaway-guard.js'));
const L = require(path.join(ROOT, 'src/keeper-limits.js'));
ok(L.BROWSER_DISK_BYTES === 2 * G, 'BROWSER_DISK_BYTES = 2 GiB');
const over = RG.diskVerdict(2.4 * G), under = RG.diskVerdict(0.3 * G);
ok(over.over && over.overKind === 'disk' && RG.diskLine(over) === 'profile 2.4 GB of 2 GiB — the cache can be cleared', 'over: ' + RG.diskLine(over));
ok(!under.over && under.clear && RG.diskLine(under) === 'profile 0.3 GB of 2 GiB', 'under: ' + RG.diskLine(under));
ok(RG.diskVerdict(NaN).over === null && RG.diskLine(RG.diskVerdict(NaN)) === '', 'unmeasured: no verdict, no line');
const t1 = RG.reportTransition(null, over, { now: 1 }), t2 = RG.reportTransition(t1.state, over, { now: 2 });
ok(t1.fire && !t2.fire, 'the report floor applies: one report per crossing');

console.log('⑤ the daemon TMPDIR (every launching path under data/, never /tmp)');
const V = require(path.join(ROOT, 'src/browser-verbs.js'));
const built = V.childEnv({ TMPDIR: '/tmp', PATH: '/bin' }, { spawnEnv: [], tmpDir: '/srv/data/browser-env/tmp' });
ok(built.env.TMPDIR === '/srv/data/browser-env/tmp', 'vibespace-browser: the answer\'s tmpDir becomes the child\'s TMPDIR');
ok(V.childEnv({ TMPDIR: '/tmp' }, { spawnEnv: [] }).env.TMPDIR === '/tmp' && V.childEnv({ TMPDIR: '/tmp' }, { spawnEnv: [], tmpDir: 'rel/x' }).env.TMPDIR === '/tmp', 'no / a relative tmpDir: the shell\'s stands');
const F = require(path.join(ROOT, 'src/browser-facts.js'));
const seen = [];
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-mp-rt-'));
try {
  const rt = F.createBrowserRuntime({ cmd: 'ab-stub', env: { PATH: '/bin', TMPDIR: '/tmp' }, daemonCwd: scratch, tmpDir: () => path.join(scratch, 'data/browser-env/tmp'), execFileImpl: (bin, args, opts, cb) => { seen.push(opts.env.TMPDIR); cb(null, '{"success":true,"data":{}}', ''); } });
  await rt.info('vs-x');
  ok(seen[0] === path.join(scratch, 'data/browser-env/tmp'), 'keeper runtime: every CLI call carries the data/ TMPDIR (got ' + seen[0] + ')');
  const BE = require(path.join(ROOT, 'src/server/browser-env.js'));
  const be = BE.create({ dataDir: path.join(scratch, 'data'), log: { log() {}, warn() {} } });
  const td = be.tmpDir();
  ok(td === path.join(scratch, 'data/browser-env/tmp') && be.TMP_DIR === td && (fs.statSync(td).mode & 0o777) === 0o700, 'browser-env: TMP_DIR under data/browser-env, made 0700');
  const RS = fs.readFileSync(path.join(ROOT, 'src/routes/browser.js'), 'utf8');
  ok(/out\.tmpDir = t;/.test(RS), '/resolve names tmpDir for a local session (envBasis)');
  const KS = fs.readFileSync(path.join(ROOT, 'src/server/browser-keeper.js'), 'utf8');
  ok(/createBrowserRuntime\(\{ env: rtEnv, log, pinned: pinnedCli, tmpDir: daemonTmp \}\)/.test(KS) && KS.includes("path.join(dataDir, 'browser-env', 'tmp')"), 'the keeper hands its runtime data/browser-env/tmp');
} finally { fs.rmSync(scratch, { recursive: true, force: true }); }

console.log('⑥ the watch (one item per episode, self-resolve; the own-Chrome tell)');
const W = require(path.join(ROOT, 'src/server/memory-pressure-watch.js'));
const items = [], statuses = [], notices = [];
const todos = { add: (k, it) => { items.push({ k, ...it }); return { id: 'i' + items.length }; }, get: () => ({ status: 'open' }), setStatus: (id, s) => statuses.push([id, s]) };
const w = W.create({ activeSessions: new Map(), BUFFERS_DIR: '/nonexistent', getUserTodos: () => todos, getSessionStatus: () => ({ pushNotice: (...a) => notices.push(a) }), sessionStatusKey: (s, id) => id, log: { warn() {} } });
try {
  for (const p of [95, 96, 97]) w.onSample({ used: p * G, limit: 100 * G });
  for (let i = 0; i < 200 && !items.length; i++) await new Promise((r) => setTimeout(r, 50));
  ok(items.length === 1 && items[0].origin === 'server' && items[0].k === W.INBOX_KEY && /^Memory is 9\d% full/.test(items[0].text), 'three samples over the line → ONE item, origin server');
  w.onSample({ used: 85 * G, limit: 100 * G });
  ok(statuses.length === 0, '85 %: still the same episode');
  w.onSample({ used: 70 * G, limit: 100 * G });
  ok(statuses.length === 1 && statuses[0][0] === 'i1' && statuses[0][1] === 'done', 'below 80 %: the item resolves itself');
} finally { w.stop(); }
console.log(`\n${fail ? '✗' : '✓'} test-memory-pressure: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

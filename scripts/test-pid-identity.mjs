#!/usr/bin/env node
// test-pid-identity — A PID IS NEVER AN IDENTITY (B-1cc6, lane pid-identity-census). src/proc-identity.js's table over a
// fixture /proc tree (same / recycled / gone / zombie / rebooted / no starttime / no /proc), the report-once rule, a
// MUTANT that signals on a bare pid (must turn this table red), and one REAL leg: a live scratch `sleep` whose stored
// record carries a wrong starttime is never signalled (pid-recycled + the journal line), the right one is.
// The census itself is test-architecture §85 (scripts/pid-identity-census.mjs). Fast, in-process, ~1 s.
// B-5ee1 (lane pid-identity-close): + the sh twin vs_same_proc on a REAL scratch sleep (true / wrong / gone), the keeper's
// SHIPPED TWIN parity pin, the REAL keeper's stop over a stub child (true birth / wrong birth / legacy meta + rerecord),
// the serve record's birth through stop({killRecorded}), and mutant copies (compare nothing / signal an unprovable record).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n); } };

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-pid-identity-'));
const root = path.join(tmp, 'proc');
const stat = (pid, comm, state, start) => {
  fs.mkdirSync(path.join(root, String(pid)), { recursive: true });
  const rest = [state, '1', pid, pid, '0', '-1', '4194560', '0', '0', '0', '0', '0', '0', '0', '0', '20', '0', '1', '0', String(start), '1000', '10'];
  fs.writeFileSync(path.join(root, String(pid), 'stat'), `${pid} (${comm}) ${rest.join(' ')}\n`);
};
fs.mkdirSync(path.join(root, 'sys/kernel/random'), { recursive: true });
fs.writeFileSync(path.join(root, 'sys/kernel/random/boot_id'), 'boot-A\n');
stat(4242, 'sl) eep', 'S', 1000); // a comm holding ") " — field 22 is counted from the LAST ')'
stat(4343, 'zomb', 'Z', 2000);
const noproc = path.join(tmp, 'noproc'); fs.mkdirSync(noproc);

function table(PI, label) {
  const o = { procRoot: root };
  const v = (rec, opts = o) => PI.judge(rec, opts).verdict;
  const rows = [
    ['identityOf a live pid', JSON.stringify(PI.identityOf(4242, o)), JSON.stringify({ pid: 4242, starttime: 1000, bootId: 'boot-A' })],
    ['identityOf a gone pid', PI.identityOf(9999, o), null],
    ['same', v({ pid: 4242, starttime: 1000, bootId: 'boot-A' }), 'same'],
    ['same, a record with no bootId', v({ pid: 4242, starttime: 1000 }), 'same'],
    ['recycled (another starttime)', v({ pid: 4242, starttime: 999, bootId: 'boot-A' }), 'pid-recycled'],
    ['gone', v({ pid: 9999, starttime: 1000, bootId: 'boot-A' }), 'gone'],
    ['rebooted (another bootId)', v({ pid: 4242, starttime: 1000, bootId: 'boot-B' }), 'gone'],
    ['zombie', v({ pid: 4343, starttime: 2000 }), 'zombie'],
    ['no starttime (an older build)', v({ pid: 4242 }), 'unknown-identity'],
    ['no /proc, no ps', v({ pid: 4242, lstart: 'Tue Oct 7 01:00:00 2026' }, { procRoot: noproc, ps: () => ({ ran: false }) }), 'unknown'],
    ['no /proc, ps says same', v({ pid: 4242, lstart: 'Tue Oct  7 01:00:00 2026' }, { procRoot: noproc, ps: () => ({ ran: true, state: 'S', lstart: 'Tue Oct 7 01:00:00 2026' }) }), 'same'],
    ['no /proc, ps says another start', v({ pid: 4242, lstart: 'Tue Oct 7 01:00:00 2026' }, { procRoot: noproc, ps: () => ({ ran: true, state: 'S', lstart: 'Wed Oct 8 02:00:00 2026' }) }), 'pid-recycled'],
    ['no /proc, ps finds none', v({ pid: 4242, lstart: 'Tue Oct 7 01:00:00 2026' }, { procRoot: noproc, ps: () => ({ ran: true, lstart: null }) }), 'gone'],
    ['no /proc, a starttime-only record', v({ pid: 4242, starttime: 1000 }, { procRoot: noproc, ps: () => ({ ran: true, lstart: 'x' }) }), 'unknown'],
    ['aliveIdentity same / zombie / unknown', [PI.aliveIdentity({ pid: 4242, starttime: 1000 }, o), PI.aliveIdentity({ pid: 4343, starttime: 2000 }, o), PI.aliveIdentity({ pid: 4242 }, o)].join(), 'true,false,'],
    ['sameProcess(pid, identity)', [PI.sameProcess(4242, { starttime: 1000 }, o), PI.sameProcess(4242, { starttime: 1 }, o)].join(), 'true,false'],
  ];
  const sent = [], said = [];
  const sig = (rec, extra = {}) => PI.signalIdentity(rec, 'SIGTERM', { ...o, kill: (p, s) => sent.push(`${p}:${s}`), say: (l) => said.push(l), what: 'fixture', ...extra });
  PI._resetReported();
  rows.push(['signal same (group first)', JSON.stringify(sig({ pid: 4242, starttime: 1000 }, { group: true })), JSON.stringify({ ok: true, target: -4242 })]);
  rows.push(['signal recycled', JSON.stringify(sig({ pid: 4242, starttime: 999 })), JSON.stringify({ ok: false, why: 'pid-recycled' })]);
  sig({ pid: 4242, starttime: 999 });
  rows.push(['signal no-starttime record', JSON.stringify(sig({ pid: 4242 })), JSON.stringify({ ok: false, why: 'unknown-identity' })]);
  rows.push(['signal zombie', JSON.stringify(sig({ pid: 4343, starttime: 2000 })), JSON.stringify({ ok: false, why: 'gone' })]);
  rows.push(['signals sent', sent.join(), '-4242:SIGTERM']);
  rows.push(['refusals said ONCE each (recycled ×2 → 1 line)', said.length, 2]);
  rows.push(['the unknown-identity line', /cannot prove is ours — restart it to re-record — not signalled$/.test(said[1] || ''), true]);
  const bad = rows.filter(([, got, want]) => got !== want);
  return { rows, bad, label };
}

const PI = require(path.join(REPO, 'src/proc-identity.js'));
const t = table(PI, 'proc-identity');
for (const [n, got, want] of t.rows) ok(got === want, `${n} → ${got}${got === want ? '' : ' (want ' + want + ')'}`);

// MUTANT: a copy that signals whatever the verdict (a bare pid) must turn the table red
const src = fs.readFileSync(path.join(REPO, 'src/proc-identity.js'), 'utf8');
const mut = src.replace("if (verdict !== 'same') {", "if (false) {");
fs.writeFileSync(path.join(tmp, 'proc-identity-mutant.js'), mut);
const m = table(require(path.join(tmp, 'proc-identity-mutant.js')), 'mutant');
ok(mut !== src && m.bad.some(([n]) => n === 'signal recycled') && m.bad.some(([n]) => n === 'signals sent'), `CONTROL: a copy that kills on a bare pid is RED (${m.bad.map(([n]) => n).join(', ')})`);

// REAL: a live scratch sleep, its record stored with a WRONG starttime ⇒ no signal, one line; the right one ⇒ signalled
const child = spawn('sleep', ['30'], { stdio: 'ignore' });
const exited = new Promise((r) => child.on('exit', (code, s) => r(s)));
await new Promise((r) => setTimeout(r, 50));
const real = PI.identityOf(child.pid);
ok(real && real.starttime > 0 && real.bootId.length > 8, `identityOf a real sleep (pid ${child.pid}) → starttime ${real && real.starttime}, bootId ${real && real.bootId.slice(0, 8)}…`);
const said = [];
const wrong = PI.signalIdentity({ ...real, starttime: real.starttime - 1 }, 'SIGTERM', { say: (l) => said.push(l), what: 'scratch sleep' });
const older = PI.signalIdentity({ pid: real.pid }, 'SIGTERM', { say: (l) => said.push(l), what: 'scratch sleep' });
let alive = true; try { process.kill(child.pid, 0); } catch { alive = false; }
ok(wrong.why === 'pid-recycled' && older.why === 'unknown-identity' && alive, `a recycled-pid record and an older (no starttime) record: NOT signalled, the sleep lives (${wrong.why}, ${older.why}, alive=${alive})`);
console.log('    ' + said.join('\n    '));
ok(said.length === 2 && /pid-recycled, not signalled/.test(said[0]), 'the journal hears both refusals once');
const right = PI.signalIdentity(real, 'SIGTERM');
ok(right.ok && (await exited) === 'SIGTERM', `the true record is signalled and the sleep ends by SIGTERM (${JSON.stringify(right)})`);
ok(PI.signalIdentity(real, 'SIGTERM').ok === false, 'the same record after the exit: gone, nothing sent');

// ── B-5ee1: THE SH TWIN on a REAL scratch sleep (true token ⇒ 0, wrong ⇒ 1 pid-recycled, gone ⇒ 1 gone, none ⇒ unknown-identity)
const sleeper = () => { const c = spawn('sleep', ['30'], { stdio: 'ignore' }); return { c, gone: new Promise((r) => c.on('exit', (code, sg) => r(sg))) }; };
const S1 = sleeper();
await new Promise((r) => setTimeout(r, 50));
const tok = PI.startToken(S1.c.pid);
const shSame = (sh, pid, t, b) => { const r = spawnSync(sh, ['-c', PI.procIdentityShellFns() + '\nvs_same_proc "$1" "$2" "$3"; echo "$? $VS_SAME_WHY"', 'x', String(pid), t, b || ''], { encoding: 'utf8' }); return String(r.stdout || '').trim(); };
const shells = ['sh', 'dash', 'bash'].filter((sh) => spawnSync(sh, ['-c', 'true']).status === 0);
for (const sh of shells) {
  const got = [shSame(sh, S1.c.pid, tok), shSame(sh, S1.c.pid, tok, PI.bootToken()), shSame(sh, S1.c.pid, 'l1'), shSame(sh, 4194000, tok), shSame(sh, S1.c.pid, ''), shSame(sh, S1.c.pid, tok, 'another-boot')];
  ok(got.join('|') === '0 same|0 same|1 pid-recycled|1 gone|1 unknown-identity|1 gone', `sh twin under ${sh}: true token 0 · +bootId 0 · wrong token pid-recycled · gone pid · no token unknown-identity · another boot gone (${got.join(' | ')})`);
}
ok(PI.tokenVerdict(S1.c.pid, tok) === 'same' && PI.tokenVerdict(S1.c.pid, 'l1') === 'pid-recycled' && PI.tokenVerdict(4194000, tok) === 'gone' && PI.tokenVerdict(S1.c.pid, '') === 'unknown-identity', 'the JS twin tokenVerdict gives the same four answers on the same sleep');
ok(PI.judge(PI.identityFromToken(S1.c.pid, tok, PI.bootToken())).verdict === 'same' && PI.judge(PI.identityFromToken(S1.c.pid, 'l1')).verdict === 'pid-recycled' && PI.judge(PI.identityFromToken(S1.c.pid, '')).verdict === 'unknown-identity', 'identityFromToken: a recorded token reads through judge() (same / pid-recycled / birth-less = unknown-identity)');

// ── THE KEEPER'S SHIPPED TWIN: byte-identical to the marked section of src/proc-identity.js (a drifted copy ⇒ red)
const KEEPER = path.join(REPO, 'data/bin/vibespace-remote-keeper');
const twinOf = (t) => { const b = t.indexOf('// ── SHIPPED TWIN BEGIN'), e = t.indexOf('// ── SHIPPED TWIN END ──'); return b >= 0 && e > b ? t.slice(b, e) : null; };
const twinSame = (a, b) => twinOf(a) != null && twinOf(a) === twinOf(b);
const keeperSrc = fs.readFileSync(KEEPER, 'utf8');
ok(twinSame(src, keeperSrc) && /function tokenVerdict\(pid, token, bootId\)/.test(twinOf(keeperSrc)), `the keeper carries the SHIPPED TWIN byte-for-byte (${(twinOf(src) || '').length} chars: startToken, bootToken, tokenVerdict)`);
ok(!twinSame(src, keeperSrc.replace("if (cur !== String(token)) return 'pid-recycled';", "if (cur != String(token)) return 'pid-recycled';")), 'CONTROL: a keeper copy whose twin drifted by one character is RED');

// ── THE REAL KEEPER's stop over a stub child (a scratch sleep standing in for claude): a meta per case, `stop <sid>`
const keeperRun = (file, dir, args, opt = {}) => new Promise((res) => {
  const k = spawn(process.execPath, [file, ...args], { env: { ...process.env, VIBESPACE_KEEPER_DIR: dir }, stdio: ['ignore', 'pipe', 'pipe'], ...opt });
  let out = '', err = ''; k.stdout.on('data', (d) => { out += d; }); k.stderr.on('data', (d) => { err += d; });
  k.on('exit', (code) => res({ code, out, err }));
});
const isAlive = (pid) => { try { process.kill(pid, 0); } catch { return false; } const st = (() => { try { return fs.readFileSync(`/proc/${pid}/stat`, 'utf8'); } catch { return ''; } })(); return st ? st[st.lastIndexOf(')') + 2] !== 'Z' : true; };
const stopCase = async (file, meta, tag) => {
  const dir = fs.mkdtempSync(path.join(tmp, 'run-')); const sid = 'pid-close-' + tag;
  const S = sleeper(); await new Promise((r) => setTimeout(r, 50));
  const m = meta(S.c.pid);
  fs.writeFileSync(path.join(dir, sid + '.json'), JSON.stringify(m)); fs.writeFileSync(path.join(dir, sid + '.out'), '');
  const r = await keeperRun(file, dir, ['stop', sid]);
  await new Promise((rr) => setTimeout(rr, 100));
  const lived = isAlive(S.c.pid);
  try { S.c.kill('SIGKILL'); } catch { }
  return { ...r, lived, pid: S.c.pid };
};
const CASES = {
  trueBirth: (pid) => ({ childPid: pid, childStart: PI.startToken(pid), bootId: PI.bootToken(), cmd: ['sleep', '30'], mode: 'fifo', startedAt: Date.now() }),
  wrongBirth: (pid) => ({ childPid: pid, childStart: 'l1', bootId: PI.bootToken(), cmd: ['sleep', '30'], mode: 'fifo', startedAt: Date.now() }),
  legacyOurs: (pid) => ({ childPid: pid, cmd: ['sleep', '30'], mode: 'fifo', startedAt: Date.now() }),       // an older keeper's meta: no birth, argv0 matches
  legacyStranger: (pid) => ({ childPid: pid, cmd: ['claude', '-p'], mode: 'fifo', startedAt: Date.now() }), // no birth, argv0 does NOT match
};
const keeperTable = async (file) => Object.fromEntries(await Promise.all(Object.entries(CASES).map(async ([k, f]) => [k, await stopCase(file, f, k + '-' + path.basename(file))])));
// mutants on the same table: a copy that compares nothing, and a copy that signals an unprovable (birth-less) record
const mutKeeper = (name, from, to) => { const t = keeperSrc.replace(from, to); const f = path.join(tmp, name); fs.writeFileSync(f, t); return t !== keeperSrc ? f : null; };
const mNoCompare = mutKeeper('keeper-no-compare', "    if (v === 'same') return true;", '    return true;');
const mUnprovable = mutKeeper('keeper-unprovable', "  const ok = role === 'child' ? isOurChildPid(pid, m) : isKeeperPid(pid);", '  const ok = true;');
const [KT, MT1, MT2] = await Promise.all([keeperTable(KEEPER), mNoCompare && keeperTable(mNoCompare), mUnprovable && keeperTable(mUnprovable)]); // stop waits 2.5 s — the 12 stops run at once
ok(!KT.trueBirth.lived && /stopped/.test(KT.trueBirth.out), `keeper stop, the TRUE birth: the child is signalled (${JSON.stringify(KT.trueBirth.out.trim())})`);
ok(KT.wrongBirth.lived && new RegExp(`^REFUSED:${KT.wrongBirth.pid}:pid-recycled$`, 'm').test(KT.wrongBirth.out) && /now belongs to another process — pid-recycled, not signalled/.test(KT.wrongBirth.err), `keeper stop, a WRONG birth: never signalled, refused BY NAME on stdout (REFUSED:<pid>:pid-recycled) + its journal line (${JSON.stringify(KT.wrongBirth.out.trim())})`);
ok(!KT.legacyOurs.lived && /legacy pid record, cmdline-only — re-recorded at its next start/.test(KT.legacyOurs.err) && (KT.legacyOurs.err.match(/legacy pid record/g) || []).length === 1, 'keeper stop, a LEGACY (birth-less) meta whose argv0 matches: today\'s cmdline rung signals it, said ONCE');
ok(KT.legacyStranger.lived && !/legacy pid record/.test(KT.legacyStranger.err), 'keeper stop, a legacy meta whose argv0 does not match: not signalled (today\'s rung refuses as before)');
ok(!!MT1 && !MT1.wrongBirth.lived, 'CONTROL: a keeper copy that compares nothing SIGTERMs the wrong-birth child — the wrong-birth leg above is RED on it');
ok(!!MT2 && !MT2.legacyStranger.lived, 'CONTROL: a keeper copy that signals an unprovable (birth-less, cmdline-mismatched) record kills the stranger — the legacy-stranger leg is RED on it');

// ── THE LEGACY WINDOW CLOSES BY ITSELF: a real keeper daemon, its meta stripped of the births (an older keeper's shape),
//    then one `run` (the first wake after the update) writes them back; `stop` then signals both by birth
{
  const dir = fs.mkdtempSync(path.join(tmp, 'run-')); const sid = 'pid-close-rerecord';
  const d = spawn(process.execPath, [KEEPER, 'daemon', sid, '--', 'sleep', '30'], { env: { ...process.env, VIBESPACE_KEEPER_DIR: dir }, stdio: 'ignore', detached: true });
  const metaP = path.join(dir, sid + '.json');
  const until = Date.now() + 5000;
  while (Date.now() < until && !(fs.existsSync(path.join(dir, sid + '.sock')) && fs.existsSync(metaP))) await new Promise((r) => setTimeout(r, 50));
  const born = JSON.parse(fs.readFileSync(metaP, 'utf8'));
  ok(born.childStart === PI.startToken(born.childPid) && born.keeperStart === PI.startToken(d.pid) && born.bootId === PI.bootToken(), `a new keeper daemon records each pid WITH its birth in the same write (childStart ${born.childStart}, keeperStart ${born.keeperStart})`);
  const { childStart, keeperStart, bootId, ...legacy } = born;
  fs.writeFileSync(metaP, JSON.stringify(legacy));
  const att = spawn(process.execPath, [KEEPER, 'run', sid, '0'], { env: { ...process.env, VIBESPACE_KEEPER_DIR: dir }, stdio: ['pipe', 'ignore', 'pipe'] });
  let attErr = ''; att.stderr.on('data', (x) => { attErr += x; });
  await new Promise((r) => setTimeout(r, 700));
  try { att.kill('SIGKILL'); } catch { }
  const re = JSON.parse(fs.readFileSync(metaP, 'utf8'));
  ok(re.childStart === born.childStart && re.keeperStart === born.keeperStart && /legacy pid record, cmdline-only/.test(attErr), `the first run on a birth-less meta re-records both births (the legacy rung said once: ${JSON.stringify((attErr.match(/legacy pid record[^\n]*/) || [''])[0])})`);
  const st = await keeperRun(KEEPER, dir, ['stop', sid]);
  await new Promise((r) => setTimeout(r, 400));
  ok(/stopped/.test(st.out) && !isAlive(born.childPid) && !isAlive(d.pid) && !/legacy pid record/.test(st.err), 'stop then signals the child and the daemon BY BIRTH (no legacy line any more)');
  for (const pid of [born.childPid, d.pid]) { try { process.kill(pid, 'SIGKILL'); } catch { } }
}

// ── THE SERVE RECORD's birth through stop({killRecorded}) — the cmdline+uid verdict faked to 'ours', the birth decides
{
  const { createServeLocator } = require(path.join(REPO, 'src/opencode-serve.js'));
  const serveCase = async (startOf) => {
    const dataDir = fs.mkdtempSync(path.join(tmp, 'oc-')); const S = sleeper(); await new Promise((r) => setTimeout(r, 50));
    const sent = [], warned = [];
    fs.writeFileSync(path.join(dataDir, 'opencode-serve.json'), JSON.stringify({ port: 47123, pid: S.c.pid, ...startOf(S.c.pid), command: 'opencode' }));
    const loc = createServeLocator({ dataDir, command: 'opencode', autostart: false, log: { warn: (l) => warned.push(String(l)), error: () => { }, info: () => { } },
      readCmdline: () => ['opencode', 'serve', '--port', '47123'], readUid: () => (process.getuid ? process.getuid() : null), killPid: (p, sg) => sent.push([p, sg]) });
    loc.stop({ killRecorded: true });
    try { S.c.kill('SIGKILL'); } catch { }
    return { sent, warned, pid: S.c.pid };
  };
  const a = await serveCase((pid) => ({ start: PI.startToken(pid), bootId: PI.bootToken() }));
  const b = await serveCase(() => ({ start: 'l1', bootId: PI.bootToken() }));
  const c = await serveCase(() => ({}));
  ok(a.sent.length === 1 && a.sent[0][0] === a.pid && a.sent[0][1] === 'SIGTERM', 'serve record, the TRUE birth: stop({killRecorded}) signals it (through signalIdentity)');
  ok(b.sent.length === 0, `serve record, a WRONG birth: never signalled, whatever its cmdline says (${JSON.stringify(b.warned.slice(-1))})`);
  ok(c.sent.length === 1 && c.warned.some((l) => /opencode serve serve stop: pid \d+ — legacy pid record, cmdline-only/.test(l)), 'serve record from before the birth (legacy): the cmdline+uid verdict decides, said once');
}
// ── THE TWO SH KILLS, executed over a local `sh` with a fake HOME (no ssh): an agentd session meta naming a REAL sleep with
//    its true startTime / a wrong one / none. The writer sweep's shared legs print SWEPT / REFUSED / LEGACY; the ssh kill
//    line (src/ws-handler.js, its template evaluated as written) kills / refuses by name / keeps today's rung
{
  const WS = require(path.join(REPO, 'src/writer-sweep.js'));
  const wsSrc = fs.readFileSync(path.join(REPO, 'src/ws-handler.js'), 'utf8');
  const tm = /execFile\('ssh', \[\.\.\.hosts\.sshArgs\(h\), '--',\n([\s\S]*?)\],\n\s*\{ timeout: 15000 \}/.exec(wsSrc);
  const sshKill = tm ? new Function('PI', 'sshSidSafe', 'data', 'return ' + tm[1].trim())(PI, 'sid-x', { sessionId: 'sid-x' }) : '';
  const shCase = async (kind, startOf) => {
    const home = fs.mkdtempSync(path.join(tmp, 'home-')); const S = sleeper(); await new Promise((r) => setTimeout(r, 50));
    const dir = path.join(home, '.vibespace/agentd/state/sessions'); fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'sid-x.json'), JSON.stringify({ sid: 'sid-x', rid: 'rid-777', childPid: S.c.pid, ...startOf(S.c.pid) }));
    const script = kind === 'sweep' ? `RID=rid-777\n${WS.sweepSharedLegs()}` : sshKill;
    const r = await new Promise((res) => { const k = spawn('sh', ['-c', script], { env: { ...process.env, HOME: home }, stdio: ['ignore', 'pipe', 'pipe'] }); let o = ''; k.stdout.on('data', (d) => { o += d; }); k.on('exit', () => res(o)); });
    await new Promise((rr) => setTimeout(rr, 100));
    const lived = isAlive(S.c.pid); try { S.c.kill('SIGKILL'); } catch { }
    return { out: r.trim(), lived, pid: S.c.pid };
  };
  const births = { true: (pid) => ({ startTime: PI.startToken(pid) }), wrong: () => ({ startTime: 'l1' }), none: () => ({}) };
  const runs = await Promise.all(['sweep', 'ssh'].flatMap((k) => Object.entries(births).map(async ([b, f]) => [k + ':' + b, await shCase(k, f)])));
  const R = Object.fromEntries(runs);
  ok(!!tm && /vs_same_proc "\$P" "\$T"/.test(sshKill) && sshKill.startsWith('vs_same_proc() {'), 'the ssh kill embeds the sh twin and compares before both of its signals (template read off src/ws-handler.js)');
  ok(!R['sweep:true'].lived && R['sweep:true'].out === `SWEPT:${R['sweep:true'].pid}`, `writer sweep, the TRUE startTime: SWEPT (${R['sweep:true'].out})`);
  ok(R['sweep:wrong'].lived && R['sweep:wrong'].out === `REFUSED:${R['sweep:wrong'].pid}:pid-recycled`, `writer sweep, a WRONG startTime: REFUSED by name, the sleep lives (${R['sweep:wrong'].out})`);
  ok(!R['sweep:none'].lived && R['sweep:none'].out === `LEGACY:${R['sweep:none'].pid}\nSWEPT:${R['sweep:none'].pid}`, `writer sweep, a birth-less (legacy) meta: today's rung, said (${JSON.stringify(R['sweep:none'].out)})`);
  ok(!R['ssh:true'].lived && R['ssh:true'].out === '', 'ssh kill, the TRUE startTime: the CLI is signalled');
  ok(R['ssh:wrong'].lived && R['ssh:wrong'].out === `REFUSED:${R['ssh:wrong'].pid}:pid-recycled`, `ssh kill, a WRONG startTime: REFUSED by name, nothing signalled (${R['ssh:wrong'].out})`);
  ok(!R['ssh:none'].lived && R['ssh:none'].out === `LEGACY:${R['ssh:none'].pid}`, `ssh kill, a birth-less meta: LEGACY, today's rung (${R['ssh:none'].out})`);
  ok(WS.parseRefused(`SWEPT:1\nREFUSED:22:pid-recycled\nLEGACY:33\n`).refused[0].pid === '22' && WS.parseRefused('LEGACY:33').legacy[0] === '33', 'parseRefused reads REFUSED:<pid>:<why> and LEGACY:<pid>');
}
ok(PI.legacyOnce('door-x', 77, () => { }) && PI.legacyOnce('door-x', 77, () => { }) === null, 'legacyOnce: ONE line per (door, pid)');
const ww = PI.withheldWords('Alpha', 4321, '2026-10-08 19:00 UTC');
ok(ww.text === "Alpha's process was not stopped: pid 4321 now belongs to another process (recorded 2026-10-08 19:00 UTC) — nothing of VibeSpace's is running" && ww.i18n.key === PI.WITHHELD_KEY, 'the withheld-signal words (en; zh/ja keyed by the English)');
try { S1.c.kill('SIGKILL'); } catch { }

fs.rmSync(tmp, { recursive: true, force: true });
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);

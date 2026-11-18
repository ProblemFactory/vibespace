#!/usr/bin/env node
// THE AGENT'S ONE-INSTANCE LOCK (主开发 2026-11-17, found by the pod design's skeptic): the lock file lives in the agent's
// state folder — in a fleet pod the home volume, which outlives the container. A killed container's agent dies without
// its exit handler and the lock keeps its pid; the next container's FRESH process table can hand the new agent THE SAME
// pid, and the agent read its own lock as «a genuine second instance» and refused to start, for good. A lock that names
// THIS process is stale by definition. Each leg starts the REAL agent (src/agentd/agentd.js) in its own scratch root.
// RED control: the release's agent (a mutant without the own-pid test) refuses its own pid.
// §3 B-8475 — A LIVE PID BLOCKS ONLY WHEN IT IS AN AGENT OF THIS ROOT: the next container's fresh pid numbers can give the dead
// agent's pid to another agent there (the hub's own local agent, the default root): the agent of THIS root starts. RED
// control: the checkpoint's agent (no root test) refuses.
// The root is read from /proc as UTF-8: a genuine agent of a non-ASCII root still blocks (RED control: the latin1 read); roots
// compare canonically: a symlinked spelling of this root still blocks (RED control: path.resolve); a lock naming one of the
// agent's own threads is stale (isOwnThread + the agent's line).
// §4 B-8475 — THE IMAGE'S USER BOOT HOOK (scripts/vibespace-agentd-install.sh, its functions run in a real bash): registered
// only where the image's entrypoint runs the hook; once per root right under the hook's `#!` line (at the top of a hook
// without one; a hand-written `exit 0` stays last); a re-install keeps one block; the hook is written THROUGH a symlink with
// its mode kept (a new hook is 0600); only a whole begin…end pair is dropped (a begin without its end is left, and said); a
// hook with nothing to drop is never rewritten; the hook run as the entrypoint runs it starts the agent from its own files
// (a stand-in node) in a clean environment and skips a root without them; a person's hook ending in `wait` returns while the
// agent runs on (the block is a subshell — RED control: the block without it hangs the hook); same_root compares canonically;
// root_of_pid reads a live pid's root by the
// agent's rule, and the take-over and the retire stop only an agent of THAT root; the hub's ssh unpair ships the same
// functions on `bash -s`. RED controls: a registration that writes no block — the container start starts nothing; the
// first tip's drop (to the end of the file) — the owner's lines after a lone begin vanish.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mutantCopies } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (n, c, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? ' — ' + JSON.stringify(e) : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const AGENT = 'src/agentd/agentd.js';
const MUT = mutantCopies('agent-lock', REPO);
const ANCHOR = (src, a, name) => { if (!src.includes(a)) { console.error(`  ✗ the anchor of the control «${name}» is not in the source`); process.exitCode = 1; return null; } return a; };
const rootlessAgent = (() => {   // B-8475's RED control: the checkpoint's agent — no root test on a live pid
  const src = fs.readFileSync(path.join(REPO, AGENT), 'utf8');
  const A = ANCHOR(src, " && LH.holdsRoot(pid, ROOT) !== false) { blockingPid = pid; return false; }", 'rootless agent');
  return A ? MUT.write(AGENT, src.split(A).join(') { blockingPid = pid; return false; }'), 'rootless') : null;
})();
const releaseAgent = (() => {
  const src = fs.readFileSync(path.join(REPO, AGENT), 'utf8');
  const A = "        if (pid === process.pid) { fs.unlinkSync(LOCK); continue; }\n";
  return src.includes(A) ? MUT.write(AGENT, src.split(A).join(''), 'release') : null;
})();
const roots = [];
const mkRoot = () => { const r = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-agentlock-')); roots.push(r); fs.mkdirSync(path.join(r, 'agentd', 'state'), { recursive: true }); return r; };
const envOf = (root) => ({ PATH: process.env.PATH, HOME: root, VIBESPACE_AGENTD_ROOT: path.join(root, 'agentd'), VIBESPACE_SKIP_AGENT_HOOKS: '1', VS_NO_REAL_CLI: '1' });
const lockOf = (root) => path.join(root, 'agentd', 'state', 'agentd.lock');
// start the agent; «started» = it holds the lock under its own pid and still runs; «refused» = it exited (code 3)
const run = async (root, child) => {
  let exit = null, err = '', own = false; child.stderr.on('data', (d) => { err += d; }); child.on('exit', (c) => { exit = c; });
  for (let t = 0; t < 100 && exit === null; t++) {
    let held = ''; try { held = fs.readFileSync(lockOf(root), 'utf8').trim(); } catch { }
    if (held === String(child.pid)) { own = true; if (t >= 4) break; }
    await sleep(50);
  }
  const started = exit === null && own;   // still running AND holding the lock under its own pid (a slow agent proves nothing)
  if (exit === null) { try { process.kill(child.pid, 'SIGTERM'); } catch { } for (let t = 0; t < 60 && exit === null; t++) await sleep(50); }   // ours: we started it and hold its pid
  return { started, exit, refusedSaid: /already running/.test(err) };
};
// THE AGENT'S OWN PID IN THE LOCK: a shell writes its pid into the lock and EXECS the agent, which keeps that pid
const ownPid = (agentFile) => { const root = mkRoot(); return run(root, spawn('/bin/sh', ['-c', 'echo $$ > "$1"; exec "$2" "$3"', 'sh', lockOf(root), process.execPath, agentFile], { env: envOf(root), stdio: ['ignore', 'ignore', 'pipe'] })); };
const agentIn = (root, agentFile) => spawn(process.execPath, [agentFile], { env: envOf(root), stdio: ['ignore', 'ignore', 'pipe'] });

console.log('§1 a lock that names THIS process is stale — the agent takes it and starts');
const own = await ownPid(path.join(REPO, AGENT));
ok(`the agent handed the pid its lock already names STARTS (it removes the lock and takes it) — ${JSON.stringify(own)}`, own.started && !own.refusedSaid, own);
const red = releaseAgent ? await ownPid(releaseAgent) : null;
ok(`RED CONTROL (the release's agent, without the own-pid test): the same start REFUSES — «already running», exit 3 — ${JSON.stringify(red)}`, !!red && !red.started && red.exit === 3 && red.refusedSaid, red);

console.log('§2 the other two answers stand');
{
  const root = mkRoot();
  const gone = spawn('/bin/true'); const deadPid = gone.pid; await new Promise((r) => gone.on('exit', r));
  fs.writeFileSync(lockOf(root), String(deadPid));
  const r = await run(root, agentIn(root, path.join(REPO, AGENT)));
  ok(`a lock holding a DEAD pid (${deadPid}) — the agent takes it and starts`, r.started && !r.refusedSaid, r);
}
{
  const root = mkRoot();
  // a live sibling agent: a process whose command line names an agent (as the lock check reads it)
  const sib = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)', 'vibespace-agentd-sibling'], { stdio: 'ignore', env: envOf(root) });   // an agent of THIS root (B-8475)
  await sleep(100);
  fs.writeFileSync(lockOf(root), String(sib.pid));
  const r = await run(root, agentIn(root, path.join(REPO, AGENT)));
  try { process.kill(sib.pid, 'SIGTERM'); } catch { }   // ours: we started it and hold its pid
  ok(`a lock holding a LIVE sibling agent (pid ${sib.pid}) — the agent still refuses, «already running», exit 3`, !r.started && r.exit === 3 && r.refusedSaid, r);
}
console.log('§3 B-8475 a live pid blocks only when it is an agent of THIS root');
const otherHolds = async (agentFile, envFor) => {
  const root = mkRoot(), other = mkRoot();
  const holder = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)', 'vibespace-agentd-other'], { stdio: 'ignore', env: envFor(other) });
  await sleep(100);
  fs.writeFileSync(lockOf(root), String(holder.pid));
  const r = await run(root, agentIn(root, agentFile));
  try { process.kill(holder.pid, 'SIGTERM'); } catch { }   // ours: we started it and hold its pid
  return r;
};
const otherRootEnv = (other) => ({ PATH: process.env.PATH, HOME: other, VIBESPACE_AGENTD_ROOT: path.join(other, 'agentd') });
const hubShapeEnv = (other) => ({ PATH: process.env.PATH, HOME: other });   // the hub's local agent: no root variable, ~/.vibespace/agentd
{
  const a = await otherHolds(path.join(REPO, AGENT), otherRootEnv);
  ok(`the lock holds a LIVE agent of ANOTHER root — the agent of this root takes the lock and STARTS — ${JSON.stringify(a)}`, a.started && !a.refusedSaid, a);
  const b = await otherHolds(path.join(REPO, AGENT), hubShapeEnv);
  ok(`…the hub's own local agent's shape (no root variable: its default ~/.vibespace/agentd under its HOME) — STARTS — ${JSON.stringify(b)}`, b.started && !b.refusedSaid, b);
  const LH = require(path.join(REPO, 'src/agentd/lock-holder.js'));
  const env = (o) => Object.entries(o).map(([k, v]) => `${k}=${v}`).join('\0') + '\0';
  ok('rootOfEnviron reads the agent\'s own rule: DEVICE_ROOT, then AGENTD_ROOT, then <HOME>/.vibespace/agentd; none ⇒ null; a name given twice ⇒ its FIRST value (getenv\'s)',
    LH.rootOfEnviron(env({ VIBESPACE_DEVICE_ROOT: '/d', VIBESPACE_AGENTD_ROOT: '/a', HOME: '/h' })) === '/d' && LH.rootOfEnviron(env({ VIBESPACE_AGENTD_ROOT: '/a', HOME: '/h' })) === '/a'
    && LH.rootOfEnviron(env({ HOME: '/h' })) === path.join('/h', '.vibespace', 'agentd') && LH.rootOfEnviron(env({ PATH: '/bin' })) === null
    && LH.rootOfEnviron('VIBESPACE_DEVICE_ROOT=/first\0VIBESPACE_DEVICE_ROOT=/second\0') === '/first');
  const deny = Object.assign(new Error('denied'), { code: 'EACCES' }), none = Object.assign(new Error('none'), { code: 'ENOENT' });
  ok('holdsRoot: this root ⇒ true, another ⇒ false; a block that cannot be read (EACCES: a non-dumpable process of this user) or no /proc (ENOENT) ⇒ null — the caller keeps today\'s answer, unknown stays a block',
    LH.holdsRoot(1, '/r', { read: () => env({ VIBESPACE_DEVICE_ROOT: '/r' }) }) === true && LH.holdsRoot(1, '/r', { read: () => env({ VIBESPACE_DEVICE_ROOT: '/x' }) }) === false
    && LH.holdsRoot(1, '/r', { read: () => { throw deny; } }) === null && LH.holdsRoot(1, '/r', { read: () => { throw none; } }) === null);
  {   // a root whose folder name is not ASCII: node decodes its env as UTF-8, so the block is read as UTF-8 too
    const uni = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-agentlock-\u00e9-')); roots.push(uni); fs.mkdirSync(path.join(uni, 'agentd', 'state'), { recursive: true });
    const holder = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)', 'vibespace-agentd-same'], { stdio: 'ignore', env: envOf(uni) });
    await sleep(100);
    fs.writeFileSync(lockOf(uni), String(holder.pid));
    const viaUtf8 = LH.holdsRoot(holder.pid, path.join(uni, 'agentd')), viaLatin1 = LH.holdsRoot(holder.pid, path.join(uni, 'agentd'), { read: (f) => fs.readFileSync(f, 'latin1') });
    const u = await run(uni, agentIn(uni, path.join(REPO, AGENT)));
    try { process.kill(holder.pid, 'SIGTERM'); } catch { }   // ours: we started it and hold its pid
    ok(`a live agent of THIS root whose folder name is not ASCII (${path.basename(uni)}) BLOCKS — the second start refuses, «already running», exit 3 — ${JSON.stringify(u)}`, viaUtf8 === true && !u.started && u.exit === 3 && u.refusedSaid, { viaUtf8, u });
    ok('RED CONTROL: the same block read as latin1 (the first tip) answers «another root» for that genuine agent — two agents of one root would run', viaLatin1 === false, viaLatin1);
    fs.rmSync(uni, { recursive: true, force: true });
  }
  {   // a root reached through a SYMLINKED spelling (the image's /home/vibe → /home/<name>) is THAT root: compared canonically
    const real = mkRoot(), alias = real + '-alias'; fs.symlinkSync(real, alias); roots.push(alias);
    const holder = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)', 'vibespace-agentd-alias'], { stdio: 'ignore', env: { PATH: process.env.PATH, HOME: alias, VIBESPACE_AGENTD_ROOT: path.join(alias, 'agentd') } });
    await sleep(100);
    fs.writeFileSync(lockOf(real), String(holder.pid));
    const viaCanon = LH.holdsRoot(holder.pid, path.join(real, 'agentd')), viaResolve = LH.holdsRoot(holder.pid, path.join(real, 'agentd'), { canon: path.resolve });
    const a2 = await run(real, agentIn(real, path.join(REPO, AGENT)));
    try { process.kill(holder.pid, 'SIGTERM'); } catch { }   // ours: we started it and hold its pid
    ok(`a live agent of THIS root spelled through a symlink BLOCKS — the second start refuses, «already running» — ${JSON.stringify(a2)}`, viaCanon === true && !a2.started && a2.exit === 3 && a2.refusedSaid, { viaCanon, a2 });
    ok('RED CONTROL: the same roots compared as written (path.resolve, the first tips) answer «another root» — two agents of one root would run', viaResolve === false, viaResolve);
  }
  {   // a lock naming one of THIS agent's own threads (the pid space is shared) is stale
    let tids = []; try { tids = fs.readdirSync('/proc/self/task').map(Number).filter((t) => t !== process.pid); } catch { }
    const other = spawn('sleep', ['30'], { stdio: 'ignore' }); await sleep(50);
    const okT = typeof LH.isOwnThread === 'function' && tids.length > 0 && LH.isOwnThread(tids[0]) === true && LH.isOwnThread(process.pid) === false && LH.isOwnThread(other.pid) === false && LH.isOwnThread(0) === false;
    try { process.kill(other.pid, 'SIGTERM'); } catch { }   // ours: we started it and hold its pid
    const AD = fs.readFileSync(path.join(REPO, AGENT), 'utf8');
    ok(`isOwnThread: a thread of this process (${tids[0]}) ⇒ true; this process's own pid, another process, 0 ⇒ false — and the agent treats a lock naming one of its own threads as stale, right after its own pid`,
      okT && AD.includes("        if (pid === process.pid) { fs.unlinkSync(LOCK); continue; }\n        if (LH.isOwnThread(pid)) { fs.unlinkSync(LOCK); continue; }"), { tids: tids.slice(0, 4) });
  }
  const red = rootlessAgent ? await otherHolds(rootlessAgent, otherRootEnv) : null;
  ok(`RED CONTROL (the checkpoint's agent, no root test): the same start REFUSES — «already running», exit 3 — ${JSON.stringify(red)}`, !!red && !red.started && red.exit === 3 && red.refusedSaid, red);
}

console.log('§4 B-8475 the image\'s user boot hook: the installer registers the agent\'s start there');
{
  const { spawnSync } = require('node:child_process');
  const SH = fs.readFileSync(path.join(REPO, 'scripts/vibespace-agentd-install.sh'), 'utf8');
  const B0 = "# >>> B-8475 THE IMAGE'S USER BOOT HOOK", B1 = '# <<< B-8475 <<<';
  const i0 = SH.indexOf(B0), i1 = SH.indexOf(B1);
  ok('the installer carries the hook\'s functions between their markers, before its TAKE OVER and PERSISTENCE parts (both use root_of_pid)',
    i0 > 0 && i1 > i0 && SH.indexOf('# TAKE OVER from a daemon already running') > i1 && SH.indexOf('# PERSISTENCE (the dead-Mac lesson') > i1);
  const FNS = i0 > 0 && i1 > i0 ? SH.slice(i0, i1 + B1.length) : '';
  ok('the fallback registers a DIAL pairing\'s start only where the image runs the hook (hook_runs_here), once the agent is up; a supervised start and a retired install drop their block',
    SH.includes('  HOOK_WANTED=; if hook_runs_here && [ -s "$ROOT/state/dial.json" ]; then HOOK_WANTED=1; fi\n')
    && SH.includes('if daemon_up; then\n  if [ -n "${HOOK_WANTED:-}" ] && register_boot_hook; then started=')
    && /\nelse\n  drop_hook_block "\$KEY" \|\| true/.test(SH) && /drop_hook_block "\$K" \|\| true/.test(SH));
  ok('the take-over and the retire stop a lock\'s pid only when it is an agent of THAT root (root_of_pid before each kill)',
    SH.includes('OLDROOT=$(root_of_pid "$OLDPID"); if [ -n "$OLDROOT" ] && ! same_root "$OLDROOT" "$ROOT"; then OLDCMD="(an agent of another root)"; fi\n    case "$OLDCMD" in')
    && /SR=\$\(root_of_pid "\$SP"\)\n\s+if \[ -n "\$SR" \] && ! same_root "\$SR" "\$HOME\/\.vibespace\/\$N"; then\n[^\n]*not stopped"\n\s+else\n\s+kill "\$SP"/.test(SH));
  const T = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-boothook-')); roots.push(T);
  const H = path.join(T, 'home'); fs.mkdirSync(H, { recursive: true });
  const HOOK = path.join(H, '.vibespace-init.sh');
  const mkDev = (name, withFiles = true) => { const R = path.join(H, '.vibespace', name); fs.mkdirSync(path.join(R, 'state'), { recursive: true }); fs.mkdirSync(path.join(R, 'current'), { recursive: true }); if (withFiles) { fs.writeFileSync(path.join(R, 'state', 'dial.json'), '{"url":"wss://hub.invalid/api/device-dial"}'); fs.writeFileSync(path.join(R, 'current', 'vibespace-device.js'), '// stand-in'); } return R; };
  const node = path.join(T, 'node'); fs.writeFileSync(node, `#!/bin/sh\necho "STARTED $VIBESPACE_DEVICE_ROOT env=\${VIBESPACE_HUB_ONLY:-clean}" >> ${JSON.stringify(path.join(T, 'started'))}\nenv > "$VIBESPACE_DEVICE_ROOT/state/agent.env"\n`, { mode: 0o755 });
  const R1 = mkDev('device@a'), R2 = mkDev('device@b'), R3 = mkDev('device@c', false);
  for (const R of [R1, R2, R3]) fs.writeFileSync(path.join(R, 'state', 'node-path'), node);
  const fns = (fnsText) => { const f = path.join(T, 'fns-' + (fns.n = (fns.n || 0) + 1) + '.sh'); fs.writeFileSync(f, fnsText); return f; };
  const bashIn = (fnsFile, body) => spawnSync('bash', ['-c', `set -euo pipefail; HOME=${JSON.stringify(H)}; . ${JSON.stringify(fnsFile)}; ${body}`], { encoding: 'utf8' });
  const reg = (f, R, K) => bashIn(f, `ROOT=${JSON.stringify(R)}; KEY=${K}; register_boot_hook`);
  const F = fns(FNS);
  // where the hook is run: the image's entrypoint is there AND names the hook
  const runner = (text) => { const f = path.join(T, 'runner-' + (runner.n = (runner.n || 0) + 1)); if (text != null) fs.writeFileSync(f, text, { mode: 0o755 }); return f; };
  const runs = (f) => bashIn(F, `HOOK_RUNNER=${JSON.stringify(f)}; hook_runs_here`).status;
  const rYes = runs(runner('#!/bin/sh\nif [ -f "$HOME/.vibespace-init.sh" ]; then bash "$HOME/.vibespace-init.sh"; fi\n')), rNo = runs(runner('#!/bin/sh\nexec node server.js\n')), rNone = runs(runner(null));
  ok(`hook_runs_here: an entrypoint that runs ~/.vibespace-init.sh ⇒ yes; one that does not, or none ⇒ no (the honest «NO persistence» stays) — ${rYes},${rNo},${rNone}`, rYes === 0 && rNo !== 0 && rNone !== 0);
  const handWritten = '#!/bin/bash\n# the owner\'s own hook\necho own-line\nexit 0\n';
  fs.writeFileSync(HOOK, handWritten);
  const r1 = reg(F, R1, 'device-a'), r1b = reg(F, R1, 'device-a'), r2 = reg(F, R2, 'device-b'), r3 = reg(F, R3, 'device-c');
  const text = fs.readFileSync(HOOK, 'utf8');
  const blocks = (k, t = text) => t.split(`# >>> vibespace-device ${k} >>>`).length - 1;
  ok(`registered once per root, right under the hook's #! line; the owner's lines and its final «exit 0» stay, last — ${[r1, r1b, r2, r3].map((r) => r.status).join(',')}`,
    [r1, r1b, r2, r3].every((r) => r.status === 0) && blocks('device-a') === 1 && blocks('device-b') === 1 && text.startsWith('#!/bin/bash\n# >>> vibespace-device ') && text.trimEnd().endsWith('echo own-line\nexit 0'), text.slice(0, 400));
  fs.rmSync(path.join(T, 'started'), { force: true });
  const tok = ['CLAUDE', 'CODE', 'OAUTH', 'TOKEN'].join('_');   // a credential NAME, built at runtime (no secret-shaped fixture)
  const BOOT_ENV = { PATH: process.env.PATH, HOME: H, LANG: 'C.UTF-8', VIBESPACE_HUB_ONLY: 'leaked', VIBESPACE_INSTANCE_NAME: 'pod-1', HTTPS_PROXY: 'http://proxy.invalid:3128', NODE_EXTRA_CA_CERTS: '/etc/ssl/company-ca.pem', npm_config_cache: '/tmp/npm', PORT: '3456', NODE_OPTIONS: '--max-old-space-size=64', [tok]: 'x', AGENT_BROWSER_PROFILE: 'p' };
  const boot = spawnSync('bash', [HOOK], { encoding: 'utf8', env: BOOT_ENV });
  let started = ''; for (let t = 0; t < 40 && started.split('\n').filter(Boolean).length < 2; t++) { await sleep(50); try { started = fs.readFileSync(path.join(T, 'started'), 'utf8'); } catch { } }
  ok(`the hook run as the entrypoint runs it STARTS each registered agent from its own files (the stand-in node), and skips a root without them — ${JSON.stringify(started)} · own-line ${/own-line/.test(boot.stdout)}`,
    boot.status === 0 && /own-line/.test(boot.stdout) && started.includes(`STARTED ${R1}`) && started.includes(`STARTED ${R2}`) && !started.includes(R3), { started, status: boot.status });
  ok('…and a VIBESPACE_* name of the entrypoint\'s own (the hub\'s) never reaches the agent',
    started.split('\n').filter(Boolean).length === 2 && !started.includes('env=leaked') && (started.match(/env=clean/g) || []).length === 2, started);
  // ONE ENVIRONMENT RULE FOR THE AGENT'S START (主开发's B-8475 verdict, as if a must): the boot start carries what the product's
  // own rule for the device agent keeps (src/agent-env.js daemonEnv — a DENY list: the proxy, the CA store, the locale stay;
  // the hub's VIBESPACE_*, npm_*, AGENT_BROWSER_* and the operational / credential names go) — name for name
  const AGE = require(path.join(REPO, 'src/agent-env.js'));
  const envOfAgent = (R) => { const o = {}; try { for (const l of fs.readFileSync(path.join(R, 'state', 'agent.env'), 'utf8').split('\n')) { const i = l.indexOf('='); if (i > 0) o[l.slice(0, i)] = l.slice(i + 1); } } catch { } return o; };
  const parity = (got) => { const want = AGE.daemonEnv(BOOT_ENV), off = []; for (const k of Object.keys(BOOT_ENV)) if ((k in got) !== (k in want)) off.push(`${k}: agent ${k in got ? 'has' : 'lacks'}, rule ${k in want ? 'keeps' : 'drops'}`); if (got.VIBESPACE_DEVICE_ROOT !== R1) off.push('root'); return off; };
  const g1 = envOfAgent(R1), off1 = parity(g1);
  ok(`the boot start carries what the device agent's own env rule keeps (daemonEnv), name for name: the proxy, the CA store, the locale kept; the hub's VIBESPACE_*, npm_*, AGENT_BROWSER_*, PORT, NODE_OPTIONS and the credential name dropped — ${off1.length ? off1.join(' · ') : 'all ' + Object.keys(BOOT_ENV).length + ' names agree'}`, Object.keys(g1).length > 0 && off1.length === 0 && g1.HTTPS_PROXY === BOOT_ENV.HTTPS_PROXY && g1.NODE_EXTRA_CA_CERTS === BOOT_ENV.NODE_EXTRA_CA_CERTS, off1);
  const caseLine = (re) => { const m = re.exec(FNS); return m ? m[1].split('|') : null; };
  const shKeep = caseLine(/\n\s+(VIBESPACE_API\|[A-Z_|]+)\) ;;\n/), shDrop = caseLine(/\n\s+VIBESPACE_\*\|npm_\*\|AGENT_BROWSER_\*\|([A-Z_|]+)\) unset /);
  const sameSet = (a, b) => !!a && a.length === b.length && b.every((x) => a.includes(x));
  ok(`census: the boot block's kept names ARE DAEMON_ENV_KEEP (${shKeep ? shKeep.length : 0}) and its dropped names AGENT_ENV_DROP (${shDrop ? shDrop.length : 0}) — one rule, spelled from src/agent-env.js`, sameSet(shKeep, [...AGE.DAEMON_ENV_KEEP]) && sameSet(shDrop, [...AGE.AGENT_ENV_DROP]), { shKeep, shDrop });
  ok('CONTROL: a census that lost one kept name goes red', !sameSet(shKeep && shKeep.slice(1), [...AGE.DAEMON_ENV_KEEP]));
  // …and the PREFIX rules: every `k.startsWith('…')` drop in agentEnv's own source is a `<prefix>*` of the block's drop line
  const AES = fs.readFileSync(path.join(REPO, 'src/agent-env.js'), 'utf8'), a0 = AES.indexOf('function agentEnv('), a1 = AES.indexOf('\nfunction ', a0 + 10);
  const jsPre = a0 >= 0 ? [...AES.slice(a0, a1 > a0 ? a1 : undefined).matchAll(/k\.startsWith\('([A-Za-z_]+)'\)/g)].map((m) => m[1]) : [];
  const shPre = ((/\n\s+((?:[A-Za-z_]+\*\|)+)[A-Z_|]+\) unset /.exec(FNS) || [])[1] || '').split('|').filter(Boolean).map((x) => x.replace(/\*$/, ''));
  ok(`census: the block's prefix drops ARE agentEnv's own prefix rules (${shPre.join(', ')} ≡ ${jsPre.join(', ')})`, jsPre.length >= 3 && sameSet(shPre, jsPre), { shPre, jsPre });
  ok('CONTROL: a prefix rule agentEnv gained (and the block did not) goes red', !sameSet(shPre, [...jsPre, 'NEWPREFIX_']));
  const before = fs.readFileSync(HOOK, 'utf8');
  const d1 = bashIn(F, 'drop_hook_block device-a'), dNone = bashIn(F, 'drop_hook_block device-zz');
  const after = fs.readFileSync(HOOK, 'utf8');
  ok('a retired root\'s block is dropped (the others and the owner\'s lines stay); dropping a key the hook does not hold changes nothing',
    d1.status === 0 && dNone.status === 0 && !after.includes('vibespace-device device-a >>>') && after.includes('vibespace-device device-b >>>') && after.includes('echo own-line\nexit 0') && before !== after);
  const ino2 = fs.statSync(HOOK).ino; bashIn(F, 'drop_hook_block device-zz');
  ok('…a hook with nothing to drop keeps its very file (same inode)', fs.statSync(HOOK).ino === ino2);
  // THE HUB'S SSH UNPAIR: the installer's own functions up to their end marker on `bash -s` stdin, then drop_hook_block KEY
  const MPW = fs.readFileSync(path.join(REPO, 'src/server/mounts-plugins-wiring.js'), 'utf8');
  ok('the ssh unpair ships the installer\'s functions (its own markers) on `bash -s` stdin and calls drop_hook_block with the key; its sshRun writes that stdin; no sed range on the hook',
    MPW.includes(`inst.indexOf(${JSON.stringify(B0)}), h1 = inst.indexOf('${B1}')`) && MPW.includes("hookDrop = `${inst.slice(h0, h1)}\\ndrop_hook_block ${key} || true\\n`;")
    && MPW.includes("const ran = hookDrop ? await sshRun('bash -s', 30000, hookDrop + teardown + '\\n') : null;\n        if (!ran || !String(ran.out || '').includes('VS_REMOVED')) await sshRun(teardown, 30000);")
    && MPW.includes("const inst = await fs.promises.readFile(path.join(rootDir, 'scripts', 'vibespace-agentd-install.sh'), 'utf-8');")
    && MPW.includes('if (input != null) { child.stdin.on(\'error\', () => { }); child.stdin.end(input); }') && !/sed -i[^\n]*vibespace-device/.test(MPW));
  const un = spawnSync('bash', ['-s'], { input: `${SH.slice(i0, i1)}\ndrop_hook_block device-b || true\necho TEARDOWN-RAN\n`, encoding: 'utf8', env: { PATH: process.env.PATH, HOME: H } });
  const afterUn = fs.readFileSync(HOOK, 'utf8');
  ok(`…that very script, run by \`bash -s\`, removes the key's block, keeps the owner's lines and goes on to the teardown — ${un.status}`, un.status === 0 && blocks('device-b', afterUn) === 0 && afterUn.includes('echo own-line\nexit 0') && /TEARDOWN-RAN/.test(un.stdout), afterUn);
  // only a whole begin…end pair leaves: a begin whose end was deleted by hand is LEFT, and said
  const lone = '#!/bin/bash\n# >>> vibespace-device device-q >>> (written by its installer)\nR=/gone\necho mine-after\nexit 0\n';
  fs.writeFileSync(HOOK, lone);
  const dq = bashIn(F, 'drop_hook_block device-q');
  ok(`a begin without its end: the hook is left byte for byte, the drop says so and answers non-zero — ${dq.status} ${JSON.stringify(dq.stderr.trim().slice(0, 120))}`,
    dq.status !== 0 && fs.readFileSync(HOOK, 'utf8') === lone && /but not its end/.test(dq.stderr));
  const AE = ANCHOR(FNS, 'skip && index($0, e) == 1 { skip = 0; next } !skip { print } END { if (skip) exit 3 }', 'drop to the end');
  const FE = AE ? fns(FNS.split(AE).join('index($0, e) == 1 { skip = 0; next } !skip { print }')) : null;
  fs.writeFileSync(HOOK, lone); if (FE) bashIn(FE, 'drop_hook_block device-q');
  const eaten = fs.readFileSync(HOOK, 'utf8');
  ok('RED CONTROL: the first tip\'s drop (to the end of the file) — the owner\'s lines after the lone begin VANISH', !!FE && !eaten.includes('echo mine-after'), eaten);
  // written THROUGH the hook: a symlinked hook keeps its link, the file its mode; a new hook is 0600; a hook without #! gets the block at its top
  const real = path.join(T, 'dotfiles-init.sh'); fs.writeFileSync(real, '#!/bin/bash\necho dotfile\n', { mode: 0o700 }); fs.chmodSync(real, 0o700);
  fs.rmSync(HOOK, { force: true }); fs.symlinkSync(real, HOOK);
  const rs = reg(F, R1, 'device-a');
  ok(`a symlinked hook (a dotfiles repo) stays a link; its real file gets the block and keeps its mode 0700 — ${rs.status} ${(fs.statSync(real).mode & 0o777).toString(8)}`,
    rs.status === 0 && fs.lstatSync(HOOK).isSymbolicLink() && blocks('device-a', fs.readFileSync(real, 'utf8')) === 1 && (fs.statSync(real).mode & 0o777) === 0o700);
  fs.rmSync(HOOK, { force: true });
  const rn = reg(F, R1, 'device-a');
  ok(`a hook that was not there is made 0600, a #! line first — ${rn.status} ${(fs.statSync(HOOK).mode & 0o777).toString(8)}`, rn.status === 0 && (fs.statSync(HOOK).mode & 0o777) === 0o600 && fs.readFileSync(HOOK, 'utf8').startsWith('#!/bin/bash\n# >>> vibespace-device device-a >>>') && fs.readFileSync(HOOK, 'utf8').includes('\n# ~/.vibespace-init.sh: run by'));
  fs.writeFileSync(HOOK, 'if true; then\n  echo first\nfi\n'); const rx = reg(F, R1, 'device-a'); const tx = fs.readFileSync(HOOK, 'utf8');
  fs.writeFileSync(HOOK, '#!/bin/bash'); const ry = reg(F, R1, 'device-a'); const ty = fs.readFileSync(HOOK, 'utf8');
  ok('a hook whose first line is not #! gets the block at its very top (never inside its first construct); a one-line #! hook with no newline keeps that line whole',
    rx.status === 0 && tx.startsWith('# >>> vibespace-device device-a >>>') && tx.endsWith('if true; then\n  echo first\nfi\n') && ry.status === 0 && ty.startsWith('#!/bin/bash\n# >>> vibespace-device device-a >>>'), { tx: tx.slice(0, 120), ty: ty.slice(0, 120) });
  // THE AGENT IS NEVER THE HOOK'S CHILD (its second reader's must): a person's hook that ends in `wait` returns while the
  // agent runs on — the block is a subshell that starts it and ends at once (setsid does not fork inside a non-interactive
  // shell's job). RED control: the block without its subshell — `wait` waits for the agent, the container never boots on.
  const stay = path.join(T, 'node-stay'), stayPid = path.join(T, 'stay.pid');
  fs.writeFileSync(stay, `#!/bin/sh\necho $$ > ${JSON.stringify(stayPid)}\nexec sleep 30\n`, { mode: 0o755 });
  const R4 = mkDev('device@d'); fs.writeFileSync(path.join(R4, 'state', 'node-path'), stay);
  const waitHook = '#!/bin/bash\nsleep 0.2 &\nwait\necho own-after-wait\n';
  const stopStay = () => { let pid = 0; try { pid = Number(fs.readFileSync(stayPid, 'utf8').trim()); } catch { } let comm = ''; try { comm = fs.readFileSync(`/proc/${pid}/comm`, 'utf8').trim(); } catch { } if (pid > 1 && comm === 'sleep') { try { process.kill(pid, 'SIGTERM'); } catch { } } fs.rmSync(stayPid, { force: true }); return { pid, comm }; };   // ours: the stand-in this hook started, by its own pid file and its name
  const bootWait = async (f) => { fs.writeFileSync(HOOK, waitHook); fs.rmSync(stayPid, { force: true }); reg(f, R4, 'device-d'); const t0 = Date.now(); const b = spawnSync('bash', [HOOK], { encoding: 'utf8', env: { PATH: process.env.PATH, HOME: H }, timeout: 4000 }); const ms = Date.now() - t0; for (let t = 0; t < 20 && !fs.existsSync(stayPid); t++) await sleep(50); const started = fs.existsSync(stayPid); return { status: b.status, signal: b.signal, timedOut: !!(b.error && b.error.code === 'ETIMEDOUT'), ms, said: /own-after-wait/.test(b.stdout || ''), started, stopped: stopStay() }; };
  const w1 = await bootWait(F);
  ok(`a person's hook ending in \`wait\` RETURNS while the registered agent runs on (the block's subshell) — ${JSON.stringify(w1)}`, w1.status === 0 && !w1.timedOut && w1.said && w1.started && w1.stopped.comm === 'sleep', w1);   // returned by its status and no spawn timeout (an agent left holding the hook's stdout keeps the pipe open: status 0 with ETIMEDOUT) — no wall-clock bound (the ratchet is at 0)
  const AS1 = ANCHOR(FNS, '( R=$R\n', 'agent as the hook\'s child'), AS2 = ANCHOR(FNS, '  fi )\n# <<< vibespace-device $KEY <<<', 'agent as the hook\'s child');
  const FW = AS1 && AS2 ? fns(FNS.split(AS1).join('R=$R\n').split(AS2).join('  fi\n# <<< vibespace-device $KEY <<<')) : null;
  const w2 = FW ? await bootWait(FW) : null;
  ok(`RED CONTROL: the block without its subshell (the first two tips) — \`wait\` waits for the agent: the hook does not return — ${JSON.stringify(w2)}`, !!w2 && w2.timedOut && w2.signal === 'SIGTERM' && w2.started && !w2.said, w2);
  fs.writeFileSync(HOOK, handWritten);
  // same_root: one folder whatever its spelling (a symlinked root is that root), else as written
  const sr = (a, b) => bashIn(F, `same_root ${JSON.stringify(a)} ${JSON.stringify(b)}`).status;
  const srReal = path.join(H, '.vibespace', 'device@a'), srAlias = path.join(T, 'alias-home'); fs.symlinkSync(H, srAlias);
  const srs = [sr(path.join(srAlias, '.vibespace', 'device@a'), srReal), sr(srReal + '/', srReal), sr(srReal, path.join(H, '.vibespace', 'device@b')), sr('/no/such/a', '/no/such/a/')];
  ok(`same_root: a symlinked spelling of a root ⇒ the same; a trailing / ⇒ the same; another root ⇒ not; a folder that is not there ⇒ as written — ${srs.join(',')}`, srs[0] === 0 && srs[1] === 0 && srs[2] !== 0 && srs[3] === 0);
  // root_of_pid: a live pid's root by the agent's own rule (the shell twin of lock-holder.js)
  const pidOf = (env) => spawn('sleep', ['30'], { stdio: 'ignore', env: { PATH: process.env.PATH, ...env } });
  const pD = pidOf({ HOME: '/h', VIBESPACE_AGENTD_ROOT: '/a', VIBESPACE_DEVICE_ROOT: '/d' }), pH = pidOf({ HOME: '/h' });
  await sleep(100);
  const rootOf = (pid) => bashIn(F, `root_of_pid ${pid}`).stdout.trim();
  const got = [rootOf(pD.pid), rootOf(pH.pid), rootOf(2 ** 22 + 7)];
  for (const c of [pD, pH]) { try { process.kill(c.pid, 'SIGTERM'); } catch { } }   // ours: we started them and hold their pids
  ok(`root_of_pid: DEVICE_ROOT first, else <HOME>/.vibespace/agentd; a pid with no readable block ⇒ nothing — ${JSON.stringify(got)}`, got[0] === '/d' && got[1] === '/h/.vibespace/agentd' && got[2] === '');
  {   // RED CONTROL: the boot start with the short ALLOW list (2310a79ac) — the proxy and the CA store are lost after a restart
    const AL = ANCHOR(FNS, '    if [ -n "\\$N" ]; then\n      VIBESPACE_DEVICE_ROOT=', 'allow-list start');
    const FA = AL ? fns(FNS.split(AL).join('    if [ -n "\\$N" ]; then\n      exec env -i HOME="\\$HOME" PATH="\\$PATH" LANG="\\${LANG:-C.UTF-8}" VIBESPACE_DEVICE_ROOT=')) : null;
    fs.writeFileSync(HOOK, handWritten); fs.rmSync(path.join(R1, 'state', 'agent.env'), { force: true });
    if (FA) { reg(FA, R1, 'device-a'); spawnSync('bash', [HOOK], { env: BOOT_ENV }); for (let t = 0; t < 40 && !fs.existsSync(path.join(R1, 'state', 'agent.env')); t++) await sleep(50); }
    const gA = envOfAgent(R1);
    ok(`RED CONTROL: the start with the short allow list (the tip before this) — the agent comes back WITHOUT the proxy and the CA store (${gA.HTTPS_PROXY ? 'has' : 'lacks'} HTTPS_PROXY)`, !!FA && Object.keys(gA).length > 0 && !gA.HTTPS_PROXY && parity(gA).length > 0, parity(gA));
  }
  // RED CONTROL: a registration that writes no block — the container start starts nothing
  const A = ANCHOR(FNS, 'hook_block > "$T.vs-blk.$$"', 'no block written');
  const FR = A ? fns(FNS.split(A).join(': > "$T.vs-blk.$$"')) : null;
  fs.writeFileSync(HOOK, handWritten); fs.rmSync(path.join(T, 'started'), { force: true });
  if (FR) { reg(FR, R1, 'device-a'); spawnSync('bash', [HOOK], { env: { PATH: process.env.PATH, HOME: H } }); await sleep(300); }
  let redStarted = ''; try { redStarted = fs.readFileSync(path.join(T, 'started'), 'utf8'); } catch { }
  ok('RED CONTROL: a registration that writes no block — the container start starts NO agent', !!FR && redStarted === '', redStarted);
  fs.rmSync(T, { recursive: true, force: true });
}
for (const r of roots) { try { fs.rmSync(r, { recursive: true, force: true }); } catch { } }
console.log(`\n${fail ? fail + ' FAILED' : 'ALL PASS'} (${pass} passed${fail ? `, ${fail} failed` : ''})`);
process.exit(fail ? 1 : 0);

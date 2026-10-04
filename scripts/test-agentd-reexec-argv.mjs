#!/usr/bin/env node
// Self-upgrade re-exec must PRESERVE the original argv (2.185.2, real
// owner↔Mac dial outage). The dial transport reads `--dial <url>
// --dial-token <t>` from process.argv; the upgrade re-exec used to spawn the
// new bundle with NO args → a DIAL device came back in default LISTEN mode: it
// stopped dialing the instance AND held the singleton so launchd couldn't
// relaunch the real --dial daemon (userW-class wedge, usually masked by the
// launchd relaunch winning the race — lost under rapid upgrade churn).
//
// A live /proc-cmdline check is unreliable here: the daemon sets
// process.title = 'vibespace-device', which clobbers argv memory on Linux. So
// this proves (a) the pure helper preserves every flag, and (b) beginUpgrade
// actually WIRES reExecArgv into the spawn (guards against reverting to the
// bare `[newPath]` array), verified in the ESBUILD BUNDLE too so a broken
// require can't slip through.
// Run: node scripts/test-agentd-reexec-argv.mjs
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mutantCopies } from './mutant-copy.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.join(dir, '..');
let failed = 0;
const check = (n, c, e) => { if (c) console.log(`  ✓ ${n}`); else { failed++; console.error(`  ✗ ${n}${e ? '\n    ' + e : ''}`); } };

// ── (a) the pure helper preserves flags ──
const { reExecArgv } = require('../src/agentd/reexec.js');
{
  const argv = ['/usr/bin/node', '/old/2.0.0/agentd.js', '--dial', 'wss://x/agentd-dial', '--dial-token', 'TK', '--host-token', 'HT'];
  const out = reExecArgv('/new/2.1.0/agentd.js', argv);
  check('NEW script path is first', out[0] === '/new/2.1.0/agentd.js');
  check('--dial + url preserved', out[1] === '--dial' && out[2] === 'wss://x/agentd-dial');
  check('--dial-token + value preserved', out.includes('--dial-token') && out.includes('TK'));
  check('--host-token preserved', out.includes('--host-token') && out.includes('HT'));
  check('OLD script path dropped', !out.includes('/old/2.0.0/agentd.js'));
  check('a no-flags daemon re-execs cleanly (listen mode unchanged)',
    JSON.stringify(reExecArgv('/new/a.js', ['/usr/bin/node', '/old/a.js'])) === JSON.stringify(['/new/a.js']));
}

// ── (b) beginUpgrade WIRES reExecArgv into the re-exec spawn ──
{
  const src = fs.readFileSync(path.join(repo, 'src/agentd/agentd.js'), 'utf-8');
  // the spawn must go through reExecArgv, NOT a bare `[path.join(dir, ...)]`
  const reExecLine = src.split('\n').find((l) => l.includes('spawn(process.execPath') && l.includes('reExecArgv'));
  check('agentd.js re-exec spawns via reExecArgv', !!reExecLine, 'the upgrade spawn no longer preserves argv');
  check('agentd.js imports reExecArgv from the side-effect-free module', /require\(['"]\.\/reexec['"]\)/.test(src));
  // the old bare-array form must be GONE from the upgrade spawn
  check('no bare-array spawn in the upgrade path', !/spawn\(process\.execPath,\s*\[path\.join\(dir,/.test(src));
}

// ── (c) the ESBUILD bundle inlines reexec.js (a broken require would fail) ──
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-reexec-bundle-'));
  const out = path.join(tmp, 'agentd.js');
  const version = require('../package.json').version;
  fs.writeFileSync(path.join(repo, 'src/agentd/version.js'), `module.exports = { VERSION: ${JSON.stringify(version)} };\n`);
  execFileSync('npx', ['esbuild', 'src/agentd/agentd.js', '--bundle', '--platform=node', `--outfile=${out}`], { cwd: repo });
  const bundle = fs.readFileSync(out, 'utf-8');
  check('bundle builds and contains the reExecArgv helper', bundle.includes('reExecArgv') && bundle.includes('argv.slice(2)'));
  check('bundle inlines the hand-over + the busy-address retry (lane win-upgrade-pipe)', /function handOver\d*\(/.test(bundle) && /function listenWithRetry\d*\(/.test(bundle));
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
}

// ── (d) lane device-upgrade-stuck: the `current` repoint on WINDOWS' rules. No Windows box ran this lane: the rules are
// MODELLED from the platform's documented behaviour (a directory symlink needs SeCreateSymbolicLinkPrivilege; a junction
// needs none — the installer's own "no admin needed, unlike symlinks"; MoveFileEx cannot replace a directory; unlink
// removes a junction or symlink, never its target) — stated here and in src/agentd/reexec.js ──
{
  const { repointCurrent } = require('../src/agentd/reexec.js');
  const winFs = ({ devMode = false } = {}) => {
    const ents = new Map(); // path → { kind: 'dir'|'junction'|'symlink'|'file', target }
    const err = (code, msg) => Object.assign(new Error(`${code}: ${msg}`), { code });
    return { ents,
      symlinkSync(target, p, type) { if (ents.has(p)) throw err('EEXIST', 'symlink'); if (type !== 'junction' && !devMode) throw err('EPERM', 'operation not permitted, symlink'); ents.set(p, { kind: type === 'junction' ? 'junction' : 'symlink', target }); },
      renameSync(a, b) { if (!ents.has(a)) throw err('ENOENT', 'rename'); const t = ents.get(b); if (t && t.kind !== 'file') throw err('EPERM', 'operation not permitted, rename'); ents.set(b, ents.get(a)); ents.delete(a); },
      unlinkSync(p) { const e = ents.get(p); if (!e) throw err('ENOENT', 'unlink'); if (e.kind === 'dir') throw err('EPERM', 'unlink'); ents.delete(p); },
      rmdirSync(p) { const e = ents.get(p); if (!e) throw err('ENOENT', 'rmdir'); ents.delete(p); },
    };
  };
  const pw = path.win32, root = 'C:\\Users\\o\\.vibespace\\device@h', dir = pw.join(root, '2.369.203');
  const installed = (o) => { const f = winFs(o); f.ents.set(pw.join(root, 'standalone'), { kind: 'dir' }); f.ents.set(pw.join(root, 'current'), { kind: 'junction', target: pw.join(root, 'standalone') }); f.ents.set(dir, { kind: 'dir' }); return f; };
  // the PRE-FIX repoint (the POSIX swap, run on Windows) — the cause, both ways
  const preFix = (f) => { const curTmp = pw.join(root, '.current.tmp'); try { f.unlinkSync(curTmp); } catch { } f.symlinkSync(dir, curTmp); f.renameSync(curTmp, pw.join(root, 'current')); };
  const codeOf = (fn) => { try { fn(); return null; } catch (e) { return e.code; } };
  check('CAUSE (modelled): the pre-fix repoint throws EPERM on Windows for a normal user (a directory symlink needs a privilege)', codeOf(() => preFix(installed())) === 'EPERM');
  check('CAUSE (modelled): …and with Developer Mode on — rename cannot replace the installer\'s `current` junction', codeOf(() => preFix(installed({ devMode: true }))) === 'EPERM');
  for (const devMode of [false, true]) {
    const f = installed({ devMode });
    const c = codeOf(() => repointCurrent(f, { root, dir, platform: 'win32' }, pw));
    const cur = f.ents.get(pw.join(root, 'current'));
    check(`FIX (devMode ${devMode}): current is a JUNCTION to the new version, no .current.tmp left, the old version dir untouched`, c === null && cur && cur.kind === 'junction' && cur.target === dir && !f.ents.has(pw.join(root, '.current.tmp')) && f.ents.get(pw.join(root, 'standalone')).kind === 'dir', c);
  }
  { const f = winFs(); f.ents.set(dir, { kind: 'dir' }); const c = codeOf(() => repointCurrent(f, { root, dir, platform: 'win32' }, pw)); check('FIX: no `current` at all ⇒ one is made', c === null && f.ents.get(pw.join(root, 'current')).target === dir, c); }
  { const f = installed(); f.ents.set(pw.join(root, '.current.tmp'), { kind: 'junction', target: 'x' }); const c = codeOf(() => repointCurrent(f, { root, dir, platform: 'win32' }, pw)); check('FIX: a .current.tmp left by an earlier failed attempt is cleared first', c === null && f.ents.get(pw.join(root, 'current')).target === dir, c); }
  // POSIX on the REAL fs: the atomic symlink swap, unchanged
  const tmpR = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-repoint-'));
  try {
    fs.mkdirSync(path.join(tmpR, '1.0.0')); fs.mkdirSync(path.join(tmpR, '2.0.0')); fs.symlinkSync(path.join(tmpR, '1.0.0'), path.join(tmpR, 'current'));
    repointCurrent(fs, { root: tmpR, dir: path.join(tmpR, '2.0.0'), platform: 'linux' });
    check('POSIX (real fs): current → the new version by the symlink swap', fs.readlinkSync(path.join(tmpR, 'current')) === path.join(tmpR, '2.0.0') && !fs.existsSync(path.join(tmpR, '.current.tmp')));
  } finally { try { fs.rmSync(tmpR, { recursive: true, force: true }); } catch { } }
  // the daemon WIRES it and SAYS a failure; the re-exec's console is hidden
  const src = fs.readFileSync(path.join(repo, 'src/agentd/agentd.js'), 'utf-8');
  check('agentd.js lands the repoint through repointCurrent (no inline symlink swap left)', src.includes('repointCurrent(fs, { root: ROOT, dir });') && !src.includes('fs.symlinkSync(dir, curTmp)'));
  check('agentd.js says a failed landing: its log + `upgrade-failed` to the hub', /log\(`upgrade to \$\{version\} FAILED/.test(src) && src.includes("mux.control({ op: 'upgrade-failed', version, error: why })"));
  check('the re-exec spawn hides its console on Windows (windowsHide)', src.includes("detached: true, stdio: 'ignore', windowsHide: true,"));
  // CONTROL (scripts/mutant-copy.mjs): the Windows branch removed (the pre-fix repoint everywhere) — the FIX legs go red
  const rsrc = fs.readFileSync(path.join(repo, 'src/agentd/reexec.js'), 'utf-8');
  const mut = rsrc.replace("if (platform === 'win32') {", 'if (false) {');
  check('(control) the patch applies', mut !== rsrc);
  const M = mutantCopies('reexec', repo).load('src/agentd/reexec.js', mut, 'nowin');
  check('CONTROL: without the Windows branch the repoint throws EPERM on Windows\' rules — the FIX legs go red', codeOf(() => M.repointCurrent(installed(), { root, dir, platform: 'win32' }, pw)) === 'EPERM');
}

// ── (e) lane win-upgrade-pipe (2026-10-04, the owner's Windows box at 2.369.205): the self-upgrade HAND-OVER on Windows'
// rules. A NAMED PIPE cannot be unlinked; its name stays bound while the old process's listener is open OR any of its
// connected pipe instances is (a process exit closes them all — the incident's old daemon still held it ~170 ms after
// it called exit). MODELLED here (no Windows box ran this lane): a pipe namespace + servers on a fake clock, driving
// THE functions agentd.js runs (src/agentd/reexec.js handOver / listenWithRetry). The incident log, verbatim shape:
// "vibespace-device 2.369.205 starting" → "server error: listen EADDRINUSE … \\.\pipe\vibespace-agentd-ecce10a7eeb5". ──
{
  const { EventEmitter } = await import('node:events');
  const PIPE = '\\\\.\\pipe\\vibespace-agentd-ecce10a7eeb5';
  const world = () => {
    const bound = new Map(); let clock = 0; const q = []; const lines = [];
    const timers = { setTimeout: (fn, ms) => { const t = { at: clock + (ms || 0), fn }; q.push(t); return t; }, clearTimeout: (t) => { const i = q.indexOf(t); if (i >= 0) q.splice(i, 1); } };
    const run = (until) => { for (;;) { q.sort((a, b) => a.at - b.at); const t = q[0]; if (!t || t.at > until) break; q.shift(); clock = t.at; t.fn(); } clock = Math.max(clock, until); };
    class PipeServer extends EventEmitter {
      constructor() { super(); this.up = false; this.conns = 0; this.fin = null; }
      listen(name) { timers.setTimeout(() => { const o = bound.get(name); if (o && o !== this) { this.emit('error', Object.assign(new Error('listen EADDRINUSE: address already in use ' + name), { code: 'EADDRINUSE' })); return; } bound.set(name, this); this.name = name; this.up = true; this.emit('listening'); }, 1); return this; }
      close(cb) { const was = this.up; this.up = false; const fin = () => { if (bound.get(this.name) === this) bound.delete(this.name); this.emit('close'); if (cb) cb(was ? undefined : new Error('not running')); }; if (this.conns === 0) timers.setTimeout(fin, 1); else this.fin = fin; return this; }
      exitProcess() { if (bound.get(this.name) === this) bound.delete(this.name); this.up = false; } // the OS closes every handle
    }
    return { bound, timers, run, PipeServer, lines, now: () => clock, log: (l) => lines.push(l) };
  };
  // one self-upgrade: the old daemon (pre-fix code or THE hand-over) spawns the successor, which boots in 300 ms and
  // listens (pre-fix: die at the first error, or listenWithRetry); the old process lets go of its handles `exitLag` after exit
  const hop = (R, { oldCode, newCode, conns = 0, exitLag = 500, lockIsOurs = () => true }) => {
    const w = world(); const old = new w.PipeServer(); old.conns = conns; old.listen(PIPE); w.run(10);
    const st = { boundAtSpawn: null, listening: false, died: null, spawnAt: null };
    const exit = () => { w.timers.setTimeout(() => old.exitProcess(), exitLag); };
    const startNew = () => {
      const nu = new w.PipeServer(); st.nu = nu;
      if (newCode === 'pre-fix') { nu.on('error', (e) => { st.died = e.code; }); nu.once('listening', () => { st.listening = true; }); nu.listen(PIPE); }
      else R.listenWithRetry(nu, PIPE, { log: w.log, lockIsOurs, now: w.now, timers: w.timers, onListening: () => { st.listening = true; }, onFatal: (e) => { st.died = e.code; } });
    };
    const spawnNext = () => { st.boundAtSpawn = w.bound.has(PIPE); st.spawnAt = w.now(); w.timers.setTimeout(startNew, 300); };
    if (oldCode === 'pre-fix') { spawnNext(); exit(); } else R.handOver({ server: old, spawnNext, exit, log: w.log, timers: w.timers });
    w.run(30000);
    return { ...st, lines: w.lines, w };
  };
  const R = require('../src/agentd/reexec.js');
  const c0 = hop(R, { oldCode: 'pre-fix', newCode: 'pre-fix' });
  check('CAUSE (modelled): the pre-fix re-exec — successor spawned while the old process holds the pipe, its listen dies EADDRINUSE (the machine is left with no agent)', c0.boundAtSpawn === true && c0.died === 'EADDRINUSE' && !c0.listening);
  const f1 = hop(R, { oldCode: 'fix', newCode: 'pre-fix' });
  check('FIX ①: the old daemon CLOSES its listener before it starts the successor — the pipe is free at the spawn, even a pre-retry successor listens', f1.boundAtSpawn === false && f1.listening && !f1.died && f1.lines.includes('upgrade hand-over: listener closed — starting the successor'), JSON.stringify(f1.lines));
  const f2 = hop(R, { oldCode: 'pre-fix', newCode: 'fix' });
  const busy = f2.lines.filter((l) => /is still held \(EADDRINUSE\)/.test(l)).length;
  check('FIX ② (the .205 → .206 hop: the OLD code spawns first): the new daemon retries the busy pipe and LISTENS once the old process let go', f2.boundAtSpawn === true && f2.listening && !f2.died && busy === 1 && f2.lines.some((l) => /free after \d+ retr/.test(l)), JSON.stringify(f2.lines));
  const f3 = hop(R, { oldCode: 'fix', newCode: 'fix', conns: 1 });
  check('FIX ①+②: a lingering local connection keeps the pipe bound — the hand-over waits ≤ 1.5 s, starts the successor anyway, and its retry covers the tail', f3.listening && !f3.died && f3.spawnAt === 1510 && f3.lines.some((l) => /did not close within 1500 ms/.test(l)), JSON.stringify([f3.spawnAt, f3.lines]));
  // a GENUINE second instance: the lock names another live pid ⇒ no retry (agentd.js refuses it at the lock before it listens)
  const g = world(); const holder = new g.PipeServer(); holder.listen(PIPE); g.run(10);
  const s2 = new g.PipeServer(); const g2 = { died: null, listening: false };
  R.listenWithRetry(s2, PIPE, { log: g.log, lockIsOurs: () => false, now: g.now, timers: g.timers, onListening: () => { g2.listening = true; }, onFatal: (e) => { g2.died = { code: e.code, at: g.now() }; } });
  g.run(30000);
  check('a genuine second instance (the lock is not ours) is refused at once — no retry', g2.died && g2.died.code === 'EADDRINUSE' && g2.died.at < 50 && !g2.listening && g.lines.some((l) => /singleton lock is not ours — not retrying/.test(l)), JSON.stringify([g2, g.lines]));
  const h = world(); const keeper = new h.PipeServer(); keeper.listen(PIPE); h.run(10);
  const s3 = new h.PipeServer(); const h3 = { died: null };
  R.listenWithRetry(s3, PIPE, { log: h.log, now: h.now, timers: h.timers, onListening: () => { }, onFatal: (e) => { h3.died = { code: e.code, at: h.now() }; } });
  h.run(60000);
  check('the retry is BOUNDED: a pipe held for good ⇒ one "giving up" line after 15 s, then the fatal path (never a spin)', h3.died && h3.died.at >= 15000 && h3.died.at < 15600 && h.lines.filter((l) => /giving up/.test(l)).length === 1, JSON.stringify([h3, h.lines.slice(-1)]));
  // the retry over a REAL net.Server (a POSIX unix socket stands in for the busy address: listen → EADDRINUSE → re-listen)
  {
    const net = await import('node:net');
    const tmpS = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-handover-')), sp = path.join(tmpS, 's.sock');
    const a = net.createServer(); await new Promise((r) => a.listen(sp, r));
    const b = net.createServer(); const lines = [];
    const res = await new Promise((resolve) => {
      R.listenWithRetry(b, sp, { log: (l) => lines.push(l), onListening: () => resolve('listening'), onFatal: (e) => resolve('fatal ' + e.code) });
      setTimeout(() => a.close(), 600);
    });
    check('REAL net.Server: EADDRINUSE → the same server re-listens once the holder closed (the close-then-listen re-arm works)', res === 'listening' && lines.length === 2, JSON.stringify([res, lines]));
    b.close(); try { fs.rmSync(tmpS, { recursive: true, force: true }); } catch { }
  }
  // agentd.js WIRES both halves (and nothing else listens/exits around them)
  const src = fs.readFileSync(path.join(repo, 'src/agentd/agentd.js'), 'utf-8');
  const ho = src.indexOf('handOver({ server, log, exit: exitDaemon, spawnNext: () => {'), sp = src.indexOf('spawn(process.execPath, reExecArgv('), ho2 = src.indexOf('          } });', ho);
  check('agentd.js: the re-exec spawn runs INSIDE handOver (close first), no bare exitDaemon(0) after it', ho > 0 && sp > ho && sp < ho2 && !/child\.unref\(\);\n\s*exitDaemon\(0\);/.test(src));
  check('agentd.js: the listen goes through listenWithRetry gated by the singleton lock; the exit-on-any-error handler is gone', src.includes('listenWithRetry(server, SOCK, { log, lockIsOurs,') && /const lockIsOurs = \(\) => \{ try \{ return fs\.readFileSync\(LOCK/.test(src) && !src.includes("server.on('error', (e) => { log('server error: ' + e.message); process.exit(1); });") && !src.includes('server.listen(SOCK'));
  // CONTROLS (scripts/mutant-copy.mjs): each half removed — its leg goes red
  const rsrc = fs.readFileSync(path.join(repo, 'src/agentd/reexec.js'), 'utf-8');
  const mut1 = rsrc.replace("try { server.close(() => { timers.clearTimeout(t); go('upgrade hand-over: listener closed — starting the successor'); }); }", "try { timers.clearTimeout(t); go('pre-fix: no close'); }");
  const mut2 = rsrc.replace('if (ours && now() - t0 < forMs) {', 'if (false) {');
  const mut3 = rsrc.replace('const ours = lockIsOurs();', 'const ours = true;');
  check('(controls) the patches apply', mut1 !== rsrc && mut2 !== rsrc && mut3 !== rsrc);
  const MC = mutantCopies('handover', repo);
  const k1 = hop(MC.load('src/agentd/reexec.js', mut1, 'spawnfirst'), { oldCode: 'fix', newCode: 'pre-fix' });
  check('CONTROL ①: a hand-over that never closes the listener — the pipe is still bound at the spawn and a pre-retry successor dies (FIX ① red)', k1.boundAtSpawn === true && k1.died === 'EADDRINUSE');
  const k2 = hop(MC.load('src/agentd/reexec.js', mut2, 'noretry'), { oldCode: 'pre-fix', newCode: 'fix' });
  check('CONTROL ②: without the retry the .205 → .206 hop dies EADDRINUSE again (FIX ② red)', k2.died === 'EADDRINUSE' && !k2.listening);
  const M3 = MC.load('src/agentd/reexec.js', mut3, 'nolockgate');
  const q3 = world(); const hold3 = new q3.PipeServer(); hold3.listen(PIPE); q3.run(10);
  const s4 = new q3.PipeServer(); let d4 = null;
  M3.listenWithRetry(s4, PIPE, { log: q3.log, lockIsOurs: () => false, now: q3.now, timers: q3.timers, onListening: () => { }, onFatal: (e) => { d4 = q3.now(); } });
  q3.run(30000);
  check('CONTROL (lock gate): without it a second instance waits out the whole retry window (the refusal leg red)', d4 !== null && d4 >= 15000);
}

console.log(failed ? `\n${failed} FAILED` : '\nre-exec argv test passed');
process.exit(failed ? 1 : 0);

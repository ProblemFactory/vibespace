// NO TIMER, SWEEP OR BELT STARTS A PROGRAM FROM THE HUB'S MAIN PROCESS (B-91aa, lane bl-loop-a): every child the hub
// starts is a fork of a 4.5–5 GB process whose main thread waits until the child execs. The three timer sites — the mount
// liveness probe (src/mounts.js), the local port scan (src/port-forward.js), the belt's X tools (src/desktop-display.js
// run, the hub's starter injected) — hand their program to ONE small starter process (src/server/child-starter.js +
// child-starter-proc.js).
//  ① THE CENSUS: over a tick of the three sites (an attr + a list probe, a port scan, an X tool) the main process starts
//     0 programs and the starter answers every request; RED CONTROL the train tip's three call lines planted back ⇒ one
//     main-process start per call
//  ② THE STARTER NEVER OUTLIVES THE HUB: the hub's end of its pipe closed ⇒ the starter ends by itself (code 0, no
//     signal) and its held child with it, nothing signalled; RED a starter without its end-of-pipe rule stays
//  ③ THE KILL LAW: the two files signal only what they hold (no process.kill, no pattern, no bare pid); a kill request
//     for an id the starter does not hold changes nothing
//  ④ A DEAD OR SLOW STARTER IS «unknown», never «the mount is down»: a starter that answers nothing ⇒ the probe answers
//     unknown; replaced ONCE; a second fault puts the old road back (a direct start), said ONCE in the journal; RED the
//     probe that reads no answer as an exit ⇒ «error»
//  ⑤ HYGIENE: the starter is born with the service env (a secret of the hub's env is not in it, nor in what it starts,
//     nor on any request line); a request's secret-shaped name is dropped; the X tool gets its site's DISPLAY and PATH
//  ⓪ THE HUB INJECTS IT: loading src/server/desktop-app-keeper.js hands desktop-display the hub's starter (a belt call then starts
//     nothing from the main process); RED a keeper copy without the injection ⇒ one start
//  ④b/④c the held mark (set at the timeout; a lost end asked of /proc; a live child keeps it) · a connect with no answer blocks
//     its path until the next sweep (65 s), never the connect block's length
//  ⑥ THE SHARED MODULE'S PARITY: desktop-display's belt runner answers the same through the hub's starter as on its own (the
//     daemon's road); a call that is not the belt's (an unmount) starts as before
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mutantCopies } from './mutant-copy.mjs';

const require = createRequire(import.meta.url);
const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (c, name, extra) => { if (typeof name !== 'string') throw new TypeError(`ok(cond, name): the name is a ${typeof name} — the arguments are swapped?`); if (c) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.error(`  ✗ ${name}${extra !== undefined ? '\n    ' + JSON.stringify(extra).slice(0, 700) : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 5000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (fn()) return true; await sleep(20); } return !!fn(); };

const T = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-program-starts-'));
// a secret-shaped name in the hub's env, built at runtime (never a literal in the tree)
const SEC_NAME = ['VS', 'B91AA', 'TO' + 'KEN'].join('_'), SEC_VAL = ['s', 'ek', 'ret'].join('') + '-' + process.pid;
process.env[SEC_NAME] = SEC_VAL;
const CP = require('child_process');
// THE COUNTER: every async child start of THIS process goes through ChildProcess.prototype.spawn (spawn / execFile / fork)
let starts = 0, kills = 0;
const realSpawn = CP.ChildProcess.prototype.spawn, realKill = CP.ChildProcess.prototype.kill;
CP.ChildProcess.prototype.spawn = function (...a) { starts++; return realSpawn.apply(this, a); };
CP.ChildProcess.prototype.kill = function (...a) { kills++; return realKill.apply(this, a); };
const counting = async (fn) => { const s0 = starts; await fn(); return starts - s0; };

const CS = require(path.join(REPO, 'src/server/child-starter.js'));
const D = require(path.join(REPO, 'src/desktop-display.js'));
const { MountManager } = require(path.join(REPO, 'src/mounts.js'));
const { PortForwardManager } = require(path.join(REPO, 'src/port-forward.js'));
const xdpy = path.join(T, 'xdpyinfo');   // a stand-in belt tool: its «dimensions» say what env it got — w = 1000 + the secret's length, h = 500 + the display number
fs.writeFileSync(xdpy, '#!/bin/sh\nn=$(printf %s "$' + SEC_NAME + '" | wc -c)\nd=${DISPLAY#:}\necho "  dimensions:    $((1000 + n))x$((500 + d)) pixels"\n', { mode: 0o755 });
const xfail = path.join(T, 'xfail');
fs.writeFileSync(xfail, '#!/bin/sh\necho "  dimensions:    9x9 pixels"\nexit 3\n', { mode: 0o755 });
const beltSize = (X, env, bin = xdpy, display = ':42') => X.displaySize({ display, env, bins: { xdpyinfo: bin } });
const pfOf = (PF) => new PF.PortForwardManager({ hosts: {}, dataDir: T, broadcast: () => { }, log: () => { } });
const mounts = [];

try {
  console.log('⓪ the hub injects its starter: loading the desktop-app keeper hands desktop-display the starter');
  {
    const S0 = CS.createChildStarter(); CS.setChildStarter(S0); D.useStarter(null);
    await S0.run(process.execPath, ['-e', '0'], { timeoutMs: 10000 });   // the starter's own start (made once), outside the window
    const ksrc = fs.readFileSync(path.join(REPO, 'src/server/desktop-app-keeper.js'), 'utf8'), INJ = "displayFacts.useStarter(require('./child-starter').childStarter());";
    mutantCopies('hub-program-starts-k', REPO).load('src/server/desktop-app-keeper.js', ksrc.replace(INJ, () => '/* no injection */'), 'no-inject');
    const red0 = await counting(() => beltSize(D, { ...process.env }));
    require(path.join(REPO, 'src/server/desktop-app-keeper.js'));
    const r0 = S0.stats().requests, now0 = await counting(() => beltSize(D, { ...process.env }));
    ok(ksrc.split(INJ).length === 2 && red0 === 1 && now0 === 0 && S0.stats().requests === r0 + 1,
      `the hub's keeper hands desktop-display its starter: a belt call then starts ${now0} programs from the main process (the starter ran it); RED (a keeper without the injection): ${red0}`);
    S0.closePipe();
  }
  console.log('① the census: the three timer sites start no program from the main process');
  const S = CS.createChildStarter(); CS.setChildStarter(S); D.useStarter(S);
  await S.run(process.execPath, ['-e', '0'], { timeoutMs: 10000 });   // the starter's own start (one, made once)
  const tick = async (M, P, X) => {
    X.useStarter(S);   // the hub's injection, on whichever copy this tick drives
    const mm = Object.create(M.MountManager.prototype), pf = pfOf(P); mounts.push(pf);   // built before the window
    const r0 = S.stats().requests;
    const n = await counting(async () => {
      await mm._probeMountpoint(T, 5000, 'attr'); await mm._probeMountpoint(T, 5000);
      await pf.detectLocal();
      await beltSize(X, { ...process.env });
    });
    return { mainStarts: n, viaStarter: S.stats().requests - r0 };
  };
  const now = await tick({ MountManager }, { PortForwardManager }, D);
  const MC = mutantCopies('hub-program-starts', REPO);
  const msrc = fs.readFileSync(path.join(REPO, 'src/mounts.js'), 'utf8'), psrc = fs.readFileSync(path.join(REPO, 'src/port-forward.js'), 'utf8'), dsrc = fs.readFileSync(path.join(REPO, 'src/desktop-display.js'), 'utf8');
  const M_NEW = "    return require('./server/child-starter').childStarter().run('ls', verb === 'attr' ? ['-d', mp] : [mp], { timeoutMs, onTimeout: (pid) => heldMap.set(key, { t0, pid }), onLateExit: () => heldMap.delete(key) })";
  const M_OLD = "    return new Promise((resolve) => { const c = require('child_process').spawn('ls', verb === 'attr' ? ['-d', mp] : [mp], { stdio: 'ignore' }); c.on('exit', (code) => resolve({ code })); c.on('error', () => resolve({ code: 1 })); })";
  const P_NEW = "    const out = await require('./server/child-starter').childStarter().run('sh', ['-c', PORT_SCAN], { timeoutMs: 8000, maxBuffer: 4 * 1024 * 1024, capture: true })";
  const P_OLD = "    const out = await new Promise((resolve) => require('child_process').execFile('sh', ['-c', PORT_SCAN], { timeout: 8000, maxBuffer: 4 * 1024 * 1024 }, (err, stdout) => resolve({ stdout })))";
  const D_NEW = '  if (_starter && belt) {\n    const envAdd = {};';
  const red = await tick(
    { MountManager: MC.load('src/mounts.js', msrc.replace(M_NEW, () => M_OLD), 'red-mounts').MountManager },
    { PortForwardManager: MC.load('src/port-forward.js', psrc.replace(P_NEW, () => P_OLD), 'red-pf').PortForwardManager },
    MC.load('src/desktop-display.js', dsrc.replace(D_NEW, () => '  if (false) {\n    const envAdd = {};'), 'red-dd'));
  ok(msrc.split(M_NEW).length === 2 && psrc.split(P_NEW).length === 2 && dsrc.split(D_NEW).length === 2 && now.mainStarts === 0 && now.viaStarter === 4 && red.mainStarts === 4,
    `a tick of the three sites (an attr + a list probe, a port scan, a belt X tool): ${now.mainStarts} programs started by the main process, ${now.viaStarter} by the starter; RED (the train tip's call lines planted back): ${red.mainStarts} from the main process`, { now, red });

  console.log('② the starter never outlives the hub: its pipe closed ⇒ it ends by itself, its child with it, nothing signalled');
  const kidsOf = (pid) => { try { return fs.readFileSync(`/proc/${pid}/task/${pid}/children`, 'utf8').trim().split(/\s+/).filter(Boolean).map(Number); } catch { return null; } };
  const lifeOf = async (script) => {
    const S2 = CS.createChildStarter(script ? { script } : {});
    S2.run('sleep', ['5'], { timeoutMs: 60000 });
    const sp = await (async () => { await until(() => S2._proc()); return S2._proc(); })();
    await until(() => (kidsOf(sp.pid) || []).length > 0, 3000);
    const kid = (kidsOf(sp.pid) || [])[0] || 0;
    const ended = new Promise((r) => sp.once('exit', (code, signal) => r({ code, signal })));
    const k0 = kills;
    S2.closePipe();
    const how = await Promise.race([ended, sleep(3000).then(() => null)]);
    const goneOrZombie = (pid) => { try { const s = fs.readFileSync(`/proc/${pid}/stat`, 'utf8'); return / Z /.test(s.slice(s.lastIndexOf(')'), s.lastIndexOf(')') + 4)); } catch { return true; } };
    const out = { ended: how, signalled: kills - k0, kidGone: kid ? await until(() => goneOrZombie(kid), 3000) : null, kid };
    if (!how) { try { sp.kill('SIGKILL'); } catch { } }   // the RED copy's starter: ended by this suite (the one it holds)
    return out;
  };
  const life = await lifeOf(null);
  const psSrc = fs.readFileSync(path.join(REPO, 'src/server/child-starter-proc.js'), 'utf8'), ENDS = "process.stdin.on('end', bye);\nprocess.stdin.on('close', bye);\n";
  const noEnd = await lifeOf(MC.write('src/server/child-starter-proc.js', psSrc.replace(ENDS, () => ''), 'no-end'));
  ok(psSrc.split(ENDS).length === 2 && life.ended && life.ended.code === 0 && life.ended.signal === null && life.signalled === 0 && life.kid > 0 && life.kidGone === true && noEnd.ended === null,
    `the hub's end of the pipe closed: the starter ended by itself (code ${life.ended && life.ended.code}, signal ${life.ended && life.ended.signal}), its held child gone (${life.kidGone}), ${life.signalled} signals sent; RED (no end-of-pipe rule): the starter stayed`, { life, noEnd });

  console.log('③ the kill law: each side signals only what it spawned and holds');
  const hubSrc = fs.readFileSync(path.join(REPO, 'src/server/child-starter.js'), 'utf8');
  const law = (src) => ({ bare: /process\.kill\(/.test(src), pattern: /\b(pkill|killall)\b|kill\s+-/.test(src), held: (src.match(/\.kill\(/g) || []).length, ofHeld: (src.match(/\b(p|c)\.kill\(/g) || []).length });
  const lh = law(hubSrc), lp = law(psSrc);
  const S3 = CS.createChildStarter();
  await S3.run(process.execPath, ['-e', '0'], { timeoutMs: 10000 });
  S3._proc().stdin.write(JSON.stringify({ op: 'kill', id: 999999 }) + '\n');   // an id it never held
  const after = await S3.run(process.execPath, ['-e', 'process.stdout.write("still")'], { timeoutMs: 10000, capture: true });
  S3.closePipe();
  ok(!lh.bare && !lh.pattern && lh.held > 0 && lh.held === lh.ofHeld && !lp.bare && !lp.pattern && lp.held > 0 && lp.held === lp.ofHeld && after.stdout === 'still',
    `no process.kill, no pattern, no bare pid in either file — every kill is of a held ChildProcess (hub ${lh.ofHeld}/${lh.held}, starter ${lp.ofHeld}/${lp.held}); a kill for an id it never held changed nothing (it answered «${after.stdout}» after it)`, { lh, lp });

  console.log('④ a dead or slow starter is «unknown», never «the mount is down»; replaced once; then the old road, said once');
  const SILENT = path.join(T, 'silent-starter.js');
  fs.writeFileSync(SILENT, 'process.stdin.resume();\n');   // reads its pipe, answers nothing
  const said = [];
  const S4 = CS.createChildStarter({ script: SILENT, guardMs: 200, log: { warn: (s) => said.push(String(s)) } }); CS.setChildStarter(S4);
  const mm4 = Object.create(MountManager.prototype);
  const p1 = await mm4._probeMountpoint(T, 300, 'attr');
  const st1 = S4.stats();
  const p2 = await mm4._probeMountpoint(T, 300, 'attr');
  const st2 = S4.stats();
  const d3 = await counting(async () => { mm4.p3 = await mm4._probeMountpoint(T, 3000, 'attr'); });
  const p4 = await mm4._probeMountpoint(T, 3000, 'attr');
  const UNK = "        if (r.unknown) return { health: 'unknown', ms: Date.now() - t0 };\n";
  const RU = MC.load('src/mounts.js', msrc.replace(UNK, () => ''), 'red-unknown');
  const S4r = CS.createChildStarter({ script: SILENT, guardMs: 200, log: { warn: () => { } } }); CS.setChildStarter(S4r);
  const pr = await Object.create(RU.MountManager.prototype)._probeMountpoint(T, 300, 'attr');
  ok(msrc.split(UNK).length === 2 && p1.health === 'unknown' && st1.faults === 1 && st1.restarted && !st1.direct && p2.health === 'unknown' && st2.faults === 2 && st2.direct && mm4.p3.health === 'ok' && d3 === 1 && p4.health === 'ok' && said.length === 1 && /the old road/.test(said[0]) && pr.health === 'error',
    `a starter that answers nothing: the probe answers «${p1.health}» (no strike, no heal); replaced once, a second fault ⇒ the old road (the next probe «${mm4.p3.health}», ${d3} start from the main process), said ${said.length} time(s); RED (no answer read as an exit): «${pr.health}»`, { p1, st1, p2, st2, p3: mm4.p3, d3, p4, said, pr });
  // the liveness table is not asked on an unknown witness (the verdict stands): its source says so where it returns
  const lsrc = msrc.slice(msrc.indexOf('  async _probeLiveness(m, mp) {'), msrc.indexOf('  async _livenessApply('));
  ok(/if \(attr\.state === 'unknown' \|\| list\.state === 'unknown'\) return \{ verdict: 'unknown'/.test(lsrc) && lsrc.indexOf("=== 'unknown') return") < lsrc.indexOf('this._livenessApply('),
    '_probeLiveness returns before the liveness table on an unknown witness (the sweep `continue`s on a verdict that is not alive; a connect keeps the mount)');

  console.log('④b the held mark (its read, M1): set at the timeout itself; a held child whose end is lost is asked of /proc');
  const BURST = path.join(T, 'burst-starter.js');   // started, timeout and exit in ONE write (a killable child that ended at its kill)
  fs.writeFileSync(BURST, "let b='';process.stdin.on('data',(d)=>{b+=d;let i;while((i=b.indexOf('\\n'))>=0){const l=b.slice(0,i);b=b.slice(i+1);let m;try{m=JSON.parse(l)}catch{continue}if(m.op!=='run')continue;process.stdout.write([{id:m.id,ev:'started',pid:1},{id:m.id,ev:'timeout'},{id:m.id,ev:'exit',code:null,signal:'SIGKILL',timedOut:true}].map((x)=>JSON.stringify(x)).join('\\n')+'\\n')}});process.stdin.on('end',()=>process.exit(0));\n");
  const SB = CS.createChildStarter({ script: BURST }); CS.setChildStarter(SB);
  const burst = async (M) => { const mm = Object.create(M.MountManager.prototype); const r = await mm._probeMountpoint(T, 2000, 'attr'); await sleep(50); return { health: r.health, held: mm._heldProbes.size }; };
  const ON_T = "{ timeoutMs, onTimeout: (pid) => heldMap.set(key, { t0, pid }), onLateExit: () => heldMap.delete(key) })";
  const HUNG_NOW = "        if (r.timedOut) return { health: 'hung', ms: Date.now() - t0 };";
  const RB = MC.load('src/mounts.js', msrc.replace(ON_T, () => "{ timeoutMs, onLateExit: () => heldMap.delete(key) })").replace(HUNG_NOW, () => "        if (r.timedOut) { heldMap.set(key, { t0 }); return { health: 'hung', ms: Date.now() - t0 }; }"), 'red-late-mark');
  const b1 = await burst({ MountManager }), b1r = await burst(RB);
  SB.closePipe();
  ok(msrc.split(ON_T).length === 2 && msrc.split(HUNG_NOW).length === 2 && b1.health === 'hung' && b1.held === 0 && b1r.health === 'hung' && b1r.held === 1,
    `a timeout and its exit in one chunk: the probe says hung and the mark is CLEARED by the exit (${b1.held} held); RED (the mark made after the answer — 63ca24c36): ${b1r.held} held for good`, { b1, b1r });
  const gone = await new Promise((r) => { const c = CP.spawn('true', [], { stdio: 'ignore' }); c.on('exit', () => r(c.pid)); });
  const S6 = CS.createChildStarter(); CS.setChildStarter(S6);
  const lost = async (M) => { const mm = Object.create(M.MountManager.prototype); mm._heldProbes = new Map([['attr:' + T, { t0: Date.now() - 1000, pid: gone }]]); return (await mm._probeMountpoint(T, 5000, 'attr')).health; };
  const PIDCHK = "    if (held && held.pid) {";
  const RP = MC.load('src/mounts.js', msrc.replace(PIDCHK, () => '    if (false) {'), 'red-no-pid');
  const g1 = await lost({ MountManager }), g1r = await lost(RP);
  S6.closePipe();
  const live = async (M) => { const mm = Object.create(M.MountManager.prototype); mm._heldProbes = new Map([['attr:' + T, { t0: Date.now() - 1000, pid: process.pid }]]); const r = await mm._probeMountpoint(T, 5000, 'attr'); return `${r.health}${r.held ? '/held' : ''}`; };
  const KEEP = "      if (!gone) return Promise.resolve({ health: 'hung', ms: Date.now() - held.t0, held: true });";
  const l1 = await live({ MountManager }), l1r = await live(MC.load('src/mounts.js', msrc.replace(KEEP, () => '      if (false) return null;'), 'red-drop-all'));
  ok(msrc.split(KEEP).length === 2 && l1 === 'hung/held' && l1r === 'ok',
    `a held mark whose child is ALIVE keeps the mount «hung» (${l1}) — no second probe stacks behind it; RED (every mark dropped): «${l1r}»`);
  ok(msrc.split(PIDCHK).length === 2 && g1 === 'ok' && g1r === 'hung',
    `a held mark whose child is gone (its exit never heard — a replaced starter): asked of /proc, dropped, the mount asked again («${g1}»); RED (no /proc check): «${g1r}» for good`);
  console.log('④c the connect block (its read, M2): no answer at connect blocks the path for one sweep, never the connect block\'s length');
  const conn = async (M) => {
    const f = Object.create(M.MountManager.prototype);
    Object.assign(f, { _probeLiveness: async () => ({ verdict: 'unknown', unknown: true, health: 'unknown', teardown: false }), _notify() { }, isMounted: () => true });
    f.blockPath(T, 16 * 60000);   // the connect's own block
    await f._afterMounted({ id: 'm1' }, T);
    return Math.round(((f._blockedPaths.get(T) || 0) - Date.now()) / 1000);
  };
  const UNKB = "    if (lv.unknown) { this.blockPath(mp, UNKNOWN_BLOCK_MS); this._notify(); return this.isMounted(m); }\n";
  const c1 = await conn({ MountManager }), c1r = await conn(MC.load('src/mounts.js', msrc.replace(UNKB, () => ''), 'red-conn'));
  ok(msrc.split(UNKB).length === 2 && c1 > 0 && c1 <= 65 && c1r > 900,
    `a connect probe with no answer: the path is blocked ${c1} s more (the next sweep decides — the table's own 65 s); RED (the connect block kept): ${c1r} s`);

  console.log('⑤ hygiene: the service env, no secret on a request line, the site\'s own names');
  const S5 = CS.createChildStarter(); CS.setChildStarter(S5); D.useStarter(S5);
  await S5.run(process.execPath, ['-e', '0'], { timeoutMs: 10000 });
  const lines = [], sp5 = S5._proc(), w5 = sp5.stdin.write.bind(sp5.stdin);
  sp5.stdin.write = (s, ...a) => { lines.push(String(s)); return w5(s, ...a); };
  const envOut = await S5.run('env', [], { timeoutMs: 10000, capture: true, envAdd: { DISPLAY: ':42', [SEC_NAME]: SEC_VAL } });
  const xv = await beltSize(D, { ...process.env });
  const starterEnv = (() => { try { return fs.readFileSync(`/proc/${sp5.pid}/environ`, 'utf8'); } catch { return null; } })();
  ok(envOut.code === 0 && /^PATH=/m.test(envOut.stdout) && /^DISPLAY=:42$/m.test(envOut.stdout) && !envOut.stdout.includes(SEC_NAME) && !envOut.stdout.includes(SEC_VAL) && lines.length >= 2 && !lines.some((l) => l.includes(SEC_NAME) || l.includes(SEC_VAL)) && starterEnv !== null && !starterEnv.includes(SEC_VAL) && xv.ok && xv.w === 1000 && xv.h === 542,
    `the starter's env holds no secret of the hub's (${starterEnv === null ? 'unread' : 'read'}), nor does what it starts (env: PATH + the request's DISPLAY, the secret-shaped name dropped); ${lines.length} request lines carry neither its name nor its value; the belt's X tool got its site's display and no secret (${xv.w}x${xv.h}: 1000 + 0, 500 + 42)`, { envHead: envOut.stdout.slice(0, 200), xv });

  console.log('⑥ the shared module: desktop-display answers the same through the hub\'s starter as on its own (the daemon\'s road)');
  const cleanEnv = { PATH: process.env.PATH, HOME: process.env.HOME || '/' };
  const viaS = { ok: await beltSize(D, cleanEnv, xdpy, ':7'), bad: await beltSize(D, cleanEnv, xfail, ':7') };
  D.useStarter(null);
  const own = { ok: await beltSize(D, cleanEnv, xdpy, ':7'), bad: await beltSize(D, cleanEnv, xfail, ':7') };
  ok(viaS.ok.ok && viaS.ok.w === 1000 && viaS.ok.h === 507 && JSON.stringify(viaS.ok) === JSON.stringify(own.ok) && viaS.bad.ok === false && own.bad.ok === false && /xdpyinfo failed/.test(viaS.bad.why) && /xdpyinfo failed/.test(own.bad.why),
    `the belt's size read is the same object both ways (${viaS.ok.w}x${viaS.ok.h}); a tool that exits 3 fails both ways («${viaS.bad.why}» · «${own.bad.why}»)`, { viaS, own });
  // a call that is NOT the belt's (an unmount — a person's or an agent's act) starts as before even with the starter injected
  D.useStarter(S5);
  const fbin = path.join(T, 'fbin'); fs.mkdirSync(fbin, { recursive: true });
  fs.writeFileSync(path.join(fbin, 'fusermount3'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  const mi = path.join(T, 'mountinfo'); fs.writeFileSync(mi, `1 1 0:1 / ${path.join(T, 'mnt')} rw - fuse x rw\n`);
  let hits = null; const nb = await counting(async () => { hits = await D.unmountUnder(T, { env: { PATH: `${fbin}:${process.env.PATH}` }, mountinfo: mi }); });
  ok(nb === 1 && Array.isArray(hits) && hits.length === 1, `a call that is not the belt's (an unmount) is started as before: ${nb} start from this process — only the three timer sites ride the starter`);
} finally {
  for (const pf of mounts) { try { clearInterval(pf._watch); } catch { } }
  delete process.env[SEC_NAME];
  CP.ChildProcess.prototype.spawn = realSpawn; CP.ChildProcess.prototype.kill = realKill;
  try { fs.rmSync(T, { recursive: true, force: true }); } catch { }
}
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);

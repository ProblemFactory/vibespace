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
//  ③ THE KILL LAW: the two files signal only what they hold (no process.kill, no pattern, no bare pid); a request of an op
//     the starter does not know changes nothing
//  ④ A DEAD OR SLOW STARTER IS «unknown», never «the mount is down»: a starter that answers nothing ⇒ the probe answers
//     unknown; replaced ONCE; a second fault puts the old road back (a direct start), said ONCE in the journal; RED the
//     probe that reads no answer as an exit ⇒ «error»
//  ④d–④h THE CURE: no answer / a hang keeps an access or auth banner; a reused pid is not the held child, a live one is;
//     one more guard while the starter lives; the old road re-armed (said once across it); a stray pipe line ignored
//  ④i A START THAT FAILS AT ONCE NEVER ENDS THE HUB (ckpt61's hosted red): a REAL full file table in a child node ⇒ the
//     starter's start answered «unknown» (the fault counted), the old road's «not started», the process alive; RED the tip's
//     order (a pipe touched before the error listener) ⇒ the uncaught «spawn … EMFILE», exit 1 — at the starter, at the old road
//  ④k THE SELF-UPDATE'S FAILED START IS SAID: the dialog's log carries the failure and its end mark, a second press tries
//     again; RED (not written, not kept): no mark, the press refused as in flight
//  ④j THE CLASS, over every module the HUB loads (the require graph from server.js) and every form of a start (bare, an alias
//     of one, namespaced, inline, fork, an execFile with a pipe touched): the error listener before the first unguarded pipe
//     touch; the named debt (scripts/fixtures/spawn-listener-debt.json) only falls; RED each form planted broken + five real
//     sites put back; three shapes never flagged
//  ⑤ HYGIENE: the starter is born with the service env (a secret of the hub's env is not in it, nor in what it starts,
//     nor on any request line); a request's secret-shaped name is dropped; the X tool gets its site's DISPLAY and PATH
//  ⓪ THE HUB INJECTS IT: loading src/server/desktop-app-keeper.js hands desktop-display the hub's starter (a belt call then starts
//     nothing from the main process); RED a keeper copy without the injection ⇒ one start
//  ④b/④c the held mark (set at the timeout; a lost end asked of /proc; a live child keeps it) · a connect with no answer blocks
//     its path until the next sweep (65 s), never the connect block's length
//  ⑥ THE SHARED MODULE'S PARITY: desktop-display's belt runner answers the same through the hub's starter as on its own (the
//     daemon's road); a call that is not the belt's (an unmount) starts as before
import fs from 'node:fs';
import { anchored } from './scratch.mjs';
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
for (const k of ['spawnSync', 'execFileSync', 'execSync']) { const real = CP[k]; CP[k] = function (...a) { starts++; return real.apply(this, a); }; }   // the synchronous starts too (they wait on the loop the whole child)
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
    const KREQ = "const displayFacts = require('../desktop-display');", MK = mutantCopies('hub-program-starts-k', REPO), dsrc0 = fs.readFileSync(path.join(REPO, 'src/desktop-display.js'), 'utf8');
    const keeperOver = (tag, withInj) => { const dp = MK.write('src/desktop-display.js', dsrc0, 'dd-' + tag, { same: true })   /* a per-keeper copy, deliberate (B-0d3e's guard) */; MK.load('src/server/desktop-app-keeper.js', ksrc.replace(KREQ, () => `const displayFacts = require(${JSON.stringify(dp)});`).replace(INJ, () => (withInj ? INJ : '/* no injection */')), 'k-' + tag); return require(dp); };
    const DR = keeperOver('red', false), DG = keeperOver('green', true);   // each its OWN desktop-display instance, loaded by its keeper
    const red0 = await counting(() => beltSize(DR, { ...process.env }));
    const r0 = S0.stats().requests, now0 = await counting(() => beltSize(DG, { ...process.env }));
    ok(ksrc.split(INJ).length === 2 && ksrc.split(KREQ).length === 2 && red0 === 1 && now0 === 0 && S0.stats().requests === r0 + 1,
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
  const M_NEW = "    return require('./server/child-starter').childStarter().run('ls', verb === 'attr' ? ['-d', mp] : [mp], { timeoutMs, envAdd: { PATH: process.env.PATH || '' }, onTimeout: (pid) => heldMap.set(key, { t0, pid, start: pid ? ((PI.statOf(pid) || [])[1] || null) : null }), onLateExit: () => heldMap.delete(key) })";   // met at 2.369.412's second checkpoint: the hub's PATH handed; the stat through proc-identity
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
    const how = await Promise.race([ended, sleep(800).then(() => null)]);   // the starter ends in ms; one that has not by 800 ms stays
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
  S3._proc().stdin.write(JSON.stringify({ op: 'kill', id: 999999 }) + '\n');   // an op it does not know (the starter has no kill verb: it kills only at a bound or at its end)
  const after = await S3.run(process.execPath, ['-e', 'process.stdout.write("still")'], { timeoutMs: 10000, capture: true });
  S3.closePipe();
  ok(!lh.bare && !lh.pattern && lh.held > 0 && lh.held === lh.ofHeld && !lp.bare && !lp.pattern && lp.held > 0 && lp.held === lp.ofHeld && after.stdout === 'still',
    `no process.kill, no pattern, no bare pid in either file — every kill is of a held ChildProcess (hub ${lh.ofHeld}/${lh.held}, starter ${lp.ofHeld}/${lp.held}); an op it does not know changed nothing (it answered «${after.stdout}» after it)`, { lh, lp });

  console.log('④ a dead or slow starter is «unknown», never «the mount is down»; replaced once; then the old road, said once');
  const SILENT = path.join(T, 'silent-starter.js');
  fs.writeFileSync(SILENT, 'process.stdin.resume();\n');   // reads its pipe, answers nothing
  const said = [];
  const S4 = CS.createChildStarter({ script: SILENT, guardMs: 100, log: { warn: (s) => said.push(String(s)) } }); CS.setChildStarter(S4);
  const mm4 = Object.create(MountManager.prototype);
  const p1 = await mm4._probeMountpoint(T, 150, 'attr');
  const st1 = S4.stats();
  const p2 = await mm4._probeMountpoint(T, 150, 'attr');
  const st2 = S4.stats();
  const d3 = await counting(async () => { mm4.p3 = await mm4._probeMountpoint(T, 3000, 'attr'); });
  const p4 = await mm4._probeMountpoint(T, 3000, 'attr');
  const UNK = "        if (r.unknown) return { health: 'unknown', ms: Date.now() - t0 };\n";
  const RU = MC.load('src/mounts.js', msrc.replace(UNK, () => ''), 'red-unknown');
  const S4r = CS.createChildStarter({ script: SILENT, guardMs: 100, log: { warn: () => { } } }); CS.setChildStarter(S4r);
  const pr = await Object.create(RU.MountManager.prototype)._probeMountpoint(T, 150, 'attr');
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
  const ON_T = "{ timeoutMs, envAdd: { PATH: process.env.PATH || '' }, onTimeout: (pid) => heldMap.set(key, { t0, pid, start: pid ? ((PI.statOf(pid) || [])[1] || null) : null }), onLateExit: () => heldMap.delete(key) })";
  const HUNG_NOW = "        if (r.timedOut) return { health: 'hung', ms: Date.now() - t0 };";
  const RB = MC.load('src/mounts.js', msrc.replace(ON_T, () => "{ timeoutMs, onLateExit: () => heldMap.delete(key) })").replace(HUNG_NOW, () => "        if (r.timedOut) { heldMap.set(key, { t0 }); return { health: 'hung', ms: Date.now() - t0 }; }"), 'red-late-mark');
  const b1 = await burst({ MountManager }), b1r = await burst(RB);
  SB.closePipe();
  ok(msrc.split(ON_T).length === 2 && msrc.split(HUNG_NOW).length === 2 && b1.health === 'hung' && b1.held === 0 && b1r.health === 'hung' && b1r.held === 1,
    `a timeout and its exit in one chunk: the probe says hung and the mark is CLEARED by the exit (${b1.held} held); RED (the mark made after the answer — 63ca24c36): ${b1r.held} held for good`, { b1, b1r });
  const TALIVE = path.join(T, 'talive-starter.js');   // a child that timed out and LIVES (its pid: the stand-in's own, alive)
  fs.writeFileSync(TALIVE, "let b='';process.stdin.on('data',(d)=>{b+=d;let i;while((i=b.indexOf('\\n'))>=0){const l=b.slice(0,i);b=b.slice(i+1);let m;try{m=JSON.parse(l)}catch{continue}if(m.op!=='run')continue;process.stdout.write(JSON.stringify({id:m.id,ev:'started',pid:process.pid})+'\\n'+JSON.stringify({id:m.id,ev:'timeout'})+'\\n')}});process.stdin.on('end',()=>process.exit(0));\n");
  const alive2 = async (M) => { const st = CS.createChildStarter({ script: TALIVE }); CS.setChildStarter(st); const mm = Object.create(M.MountManager.prototype); const r1 = await mm._probeMountpoint(T, 2000, 'attr'); const r2 = await mm._probeMountpoint(T, 2000, 'attr'); st.closePipe(); return `${r1.health}${r1.held ? '/held' : ''} → ${r2.health}${r2.held ? '/held' : ''}`; };
  const REC = "start: pid ? ((PI.statOf(pid) || [])[1] || null) : null";
  const t2 = await alive2({ MountManager }), t2r = await alive2(MC.load('src/mounts.js', msrc.replace(REC, () => "start: pid ? 'not-the-field' : null"), 'red-rec'));
  ok(msrc.split(REC).length === 2 && t2 === 'hung → hung/held' && t2r === 'hung → hung', `a child that timed out and lives: the next probe says held («${t2}») — its recorded start time is the live child's; RED (the wrong field recorded): «${t2r}» — a second probe stacked`);
  // the moved chain's cure (主开发 23:58Z, a must): THE RECORDED START IS THE CHILD'S OWN, and a RECYCLED pid is gone. The silent
  // break the move cured — the onTimeout asking B-e783's async procStat(root, pid): a Promise read as a list ⇒ the start null, so
  // a pid the kernel gave to another process was never compared — was found by an anchor; this leg finds it by behaviour
  const recycle = async (M) => {
    const st = CS.createChildStarter({ script: TALIVE }); CS.setChildStarter(st);
    const mm = Object.create(M.MountManager.prototype);
    const r1 = await mm._probeMountpoint(T, 2000, 'attr');
    const h = mm._heldProbes.get('attr:' + T) || {}, pid0 = h.pid;
    let own = null; try { const s = fs.readFileSync(`/proc/${h.pid}/stat`, 'utf8'); own = s.slice(s.lastIndexOf(')') + 2).split(' ')[19]; } catch { }   // the child's own start, read here
    const start = h.start;
    st.closePipe();
    h.pid = process.pid;   // the kernel's reuse, planted: the mark's pid now names ANOTHER live process (this one — another start)
    const real = CS.createChildStarter(); CS.setChildStarter(real);
    const r2 = await mm._probeMountpoint(T, 5000, 'attr');
    real.closePipe();
    return { first: r1.health, pid0, start, own, again: `${r2.health}${r2.held ? '/held' : ''}` };
  };
  const NULL_START = "start: pid ? ((procStat(pid) || [])[1] || null) : null";   // the move's own break, verbatim (B-e783's async procStat)
  const nullSrc = anchored(msrc, REC, NULL_START, 'red-null-start');   // B-0d3e's one door: the recorded-start line spelled once, else a red by name
  ok(nullSrc !== msrc && /const procStat = async \(root, pid\)/.test(msrc), 'CONTROL (the null start): its plant built through anchored() — the recorded-start line spelled once — and the async procStat it would call is the module\'s');
  const v1 = await recycle({ MountManager }), v1r = await recycle(MC.load('src/mounts.js', nullSrc, 'red-null-start'));
  ok(v1.first === 'hung' && v1.pid0 > 1 && v1.own != null && v1.start === v1.own && v1.again === 'ok',
    `the held mark records its child's OWN start (${v1.start} = /proc's ${v1.own}, pid ${v1.pid0}); its pid then naming another process (another start): asked again — gone, the mount probed again («${v1.again}»)`, v1);
  ok(v1r.first === 'hung' && v1r.start === null && v1r.again === 'hung/held',
    `CONTROL (the start recorded null — the move's own break planted): the recycled pid is never compared — «${v1r.again}» for good ⇒ RED`, v1r);
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

  console.log('④d–④h the cure (its readers\' shoulds)');
  { // ④d an access error's re-probe that got no answer keeps the banner (undefined: «leave it as it is»), never «accessible»
    const acc = async (M, again) => { const f = Object.create(M.MountManager.prototype); Object.assign(f, { _revocable: () => false, _oauthBacked: () => false, _probeMountpoint: async () => ({ health: again, ms: 1 }), _probeBackendAccess: async () => 'ok', _accessErrorMsg: () => 'denied' }); return f._accessErrorFor({ id: 'm1' }, T, 'error'); };
    const AU = "      if (again === 'unknown' || again === 'hung') return undefined;";
    const RA = MC.load('src/mounts.js', msrc.replace(AU, () => ''), 'red-acc');
    const a1 = [await acc({ MountManager }, 'unknown'), await acc({ MountManager }, 'hung'), await acc({ MountManager }, 'ok')], a1r = [await acc(RA, 'unknown'), await acc(RA, 'hung')];
    ok(msrc.split(AU).length === 2 && a1[0] === undefined && a1[1] === undefined && a1[2] === null && a1r[0] === null && a1r[1] === null, `an access error whose re-probe got no answer or hung: the banner stands (${a1[0]}, ${a1[1]}); a listing clears it (${a1[2]}); RED (anything but «error» read as «lists now»): ${a1r.join(', ')} — the error cleared`);
    const auth = async (M, said) => { const f = Object.create(M.MountManager.prototype); Object.assign(f, { _revocable: () => false, _oauthBacked: () => true, _errors: new Map([['m1', 'the sign-in expired — re-authorize the mount']]), _probeBackendAccess: async () => said, _probeBackendRead: async () => 'ok', _accessErrorMsg: () => 'denied' }); return f._accessErrorFor({ id: 'm1' }, T, 'ok'); };
    const AUTH = "        if (showingAuthErr && acc !== 'ok') return undefined;";
    const RO = MC.load('src/mounts.js', msrc.replace(AUTH, () => ''), 'red-auth');
    const o1 = [await auth({ MountManager }, 'unknown'), await auth({ MountManager }, 'hung'), await auth({ MountManager }, 'ok')], o1r = await auth(RO, 'unknown');
    ok(msrc.split(AUTH).length === 2 && o1[0] === undefined && o1[1] === undefined && o1[2] === null && o1r === null, `an auth error showing, a backend probe with no answer or hung: it stays (${o1[0]}, ${o1[1]}); a probe that reads fine clears it (${o1[2]}); RED: ${o1r} — cleared for up to 10 min`);
  }
  { // ④e a pid the kernel gave to another process (another start time) is not the held child
    const reused = async (M) => { const mm = Object.create(M.MountManager.prototype); mm._heldProbes = new Map([['attr:' + T, { t0: Date.now() - 1000, pid: process.pid, start: 'not-its-start' }]]); return (await mm._probeMountpoint(T, 5000, 'attr')).health; };
    const SC = CS.createChildStarter(); CS.setChildStarter(SC);
    const START = "(!!held.start && st[1] !== held.start)";
    const e1 = await reused({ MountManager }), e1r = await reused(MC.load('src/mounts.js', msrc.replace(START, () => 'false'), 'red-reuse'));
    SC.closePipe();
    ok(msrc.split(START).length === 2 && e1 === 'ok' && e1r === 'hung', `a held mark whose pid now runs another process (its start time differs): asked again («${e1}»); RED (the pid alone): «${e1r}» for good`);
  }
  { // ④f a starter that answers AFTER its first guard (a whole-box stall) is given one more guard — no fault, its answer used.
    // A LOAD-CLOCK LEG (主开发 16:28Z): the hub sends nothing between its two guards, so no event can stand in for the clock — the
    // stand-in answers 800 ms after the request, the guards end at 600 and 1 100 ms (200 / 300 ms of slack); the RED is a real control
    const LATE = path.join(T, 'late-starter.js');
    fs.writeFileSync(LATE, "let b='',n=0;process.stdin.on('data',(d)=>{b+=d;let i;while((i=b.indexOf('\\n'))>=0){const l=b.slice(0,i);b=b.slice(i+1);let m;try{m=JSON.parse(l)}catch{continue}if(m.op!=='run')continue;const late=n++?800:0;process.stdout.write(JSON.stringify({id:m.id,ev:'started',pid:1})+'\\n');setTimeout(()=>process.stdout.write(JSON.stringify({id:m.id,ev:'exit',code:0,signal:null,stdout:'late'})+'\\n'),late)}});process.stdin.on('end',()=>process.exit(0));\n");
    // the first request warms the stand-in (its boot is never inside the window); the second is answered 800 ms after it: past its bound + one guard (600), inside the second guard (1 100)
    const lateRun = async (M) => { const s = M.createChildStarter({ script: LATE, guardMs: 500, log: { warn: () => { } } }); await s.run('true', [], { timeoutMs: 5000, capture: true }); const r = await s.run('true', [], { timeoutMs: 100, capture: true }); const st = s.stats(); s.closePipe(); return { out: r.stdout || null, unknown: !!r.unknown, faults: st.faults }; };
    const csrc = fs.readFileSync(path.join(REPO, 'src/server/child-starter.js'), 'utf8'), GRACE = 'if (!q.grace && proc) {';
    const f1 = await lateRun(CS), f1r = await lateRun(MC.load('src/server/child-starter.js', csrc.replace(GRACE, () => 'if (false) {'), 'red-grace'));
    ok(csrc.split(GRACE).length === 2 && f1.out === 'late' && f1.faults === 0 && f1r.unknown && f1r.faults === 1, `an answer after the first guard (100 ms + 500, answered at 800): one more guard, the answer used («${f1.out}», ${f1.faults} faults); RED (no grace): unknown, ${f1r.faults} fault`, { f1, f1r });
  }
  { // ④g the old road is not for good: a fresh starter is tried again after its re-arm time
    const rearm = async (M) => {
      const said2 = [];
      const SR = M.createChildStarter({ script: SILENT, guardMs: 40, rearmMs: 200, log: { warn: (s) => said2.push(s) } });
      await SR.run('true', [], { timeoutMs: 20 }); await SR.run('true', [], { timeoutMs: 20 });
      const st0 = SR.stats(); await SR.run('true', [], { timeoutMs: 20 }); const stD = SR.stats();
      await sleep(230); await SR.run('true', [], { timeoutMs: 20 }); const stA = SR.stats();   // re-armed: a fresh starter, which faults…
      await SR.run('true', [], { timeoutMs: 20 }); const stB = SR.stats();                     // …twice: the old road again, for the hour
      SR.closePipe();
      return { st0, stD, stA, stB, said: said2.length };
    };
    const csrc2 = fs.readFileSync(path.join(REPO, 'src/server/child-starter.js'), 'utf8'), REARM = "    if (direct && mono() - directAt >= rearmMs) {", ONE = 'direct = false; restarted = true; stats.rearmed++;';
    const g = await rearm(CS), gr = await rearm(MC.load('src/server/child-starter.js', csrc2.replace(REARM, () => '    if (false) {'), 'red-rearm')), g2 = await rearm(MC.load('src/server/child-starter.js', csrc2.replace(ONE, () => 'direct = false; restarted = false; stats.rearmed++;'), 'red-two'));   // stale-pins: kept (the cure's re-arm, planted back as RED 2)
    ok(csrc2.split(REARM).length === 2 && csrc2.split(ONE).length === 2 && g.st0.direct && g.stD.starts === g.st0.starts && g.stA.starts === g.st0.starts + 1 && g.stA.rearmed === 1 && g.stA.direct && g.stB.starts === g.stA.starts && g.said === 1 && gr.stA.starts === gr.st0.starts && gr.stA.direct && g2.stB.starts === g2.stA.starts + 1,
      `after two faults the old road (${g.stD.starts} starts while it lasts); past its re-arm time ONE fresh starter is tried (${g.stA.starts}) and its one fault puts the old road back for the hour (no second start: ${g.stB.starts}), said ${g.said} time in all; RED (no re-arm): the old road for good; RED 2 (a replacement after the re-arm): ${g2.stB.starts - g2.stA.starts} more start`, { g, gr, g2 });
  }
  { // ④h a stray line on the pipe (`null`, a number) is no answer and never throws in the hub's handler
    const STRAY = path.join(T, 'stray-starter.js');
    fs.writeFileSync(STRAY, "let b='';process.stdin.on('data',(d)=>{b+=d;let i;while((i=b.indexOf('\\n'))>=0){const l=b.slice(0,i);b=b.slice(i+1);let m;try{m=JSON.parse(l)}catch{continue}if(m.op!=='run')continue;process.stdout.write('null\\n7\\n\"x\"\\n'+JSON.stringify({id:m.id,ev:'started',pid:1})+'\\n'+JSON.stringify({id:m.id,ev:'exit',code:0,signal:null,stdout:'ok'})+'\\n')}});process.stdin.on('end',()=>process.exit(0));\n");
    const SS = CS.createChildStarter({ script: STRAY }); const r = await SS.run('true', [], { timeoutMs: 2000, capture: true }); SS.closePipe();
    ok(r.stdout === 'ok' && r.code === 0, `stray lines (null, 7, "x") before the answer: ignored, the answer used («${r.stdout}»)`);
  }

  { // ④i A START THAT FAILS AT ONCE NEVER ENDS THE HUB (ckpt61's hosted red, test-restore-liveness: its minute at a FULL file
    // table ended the hub, exit 1 — the port watch's 30 s request started the starter). Node's ChildProcess.spawn answers EMFILE /
    // ENFILE by RETURNING with no pipes and its 'error' queued for the next tick (Node 22.23.4 and 24.22.1 read); the tip touched a
    // pipe before its error listener: a TypeError run() caught as a fault, then the queued error found no listener — an uncaught
    // exception. A REAL full table: a child node under `ulimit -n 128` fills its own table (/dev/null) and asks the starter twice
    // — ⇒ unknown, the fault counted, the starter to be replaced; ⇒ the old road, whose start fails the same way ⇒ «not started»
    // (EMFILE) — then frees its table and says it is alive. RED CONTROLS, the tip's order: the starter's pipe touched before its
    // listener ⇒ the child dies before its first answer (exit 1, the uncaught «spawn … EMFILE»); the old road's capture pipes
    // touched before its listener ⇒ it dies before its answer line (its rejected ask is caught in the same microtask drain, the
    // queued error's tick comes after it)
    const FULL = path.join(T, 'full-table.cjs');
    fs.writeFileSync(FULL, [
      "const fs = require('fs'); const CS = require(process.argv[2]); const S = CS.createChildStarter({ log: { warn: () => { } } });",
      "const held = []; let full = null; try { for (let i = 0; i < 100000; i++) held.push(fs.openSync('/dev/null', 'r')); } catch (e) { full = e.code; }",
      "(async () => {",
      "  const r1 = await S.run('true', [], { timeoutMs: 2000 }); const st1 = S.stats(); process.stderr.write('ASKED-1\\n');",
      "  let r2; try { r2 = await S.run('true', [], { timeoutMs: 2000, capture: true }); } catch (e) { r2 = { threw: String(e && e.message) }; } const st2 = S.stats(); process.stderr.write('ASKED-2\\n');",
      "  await new Promise((r) => setTimeout(r, 300));   // every queued error has had its turn",
      "  for (const fd of held) fs.closeSync(fd);",
      "  process.stdout.write(JSON.stringify({ full, held: held.length, r1, st1, r2, st2 }) + '\\n'); S.closePipe(); process.exit(0);",
      "})();",
    ].join('\n'));
    const fullRun = (csPath) => new Promise((resolve) => {
      let out = '', err = '', c;
      try { c = CP.spawn('sh', ['-c', 'ulimit -n 128 && exec "$0" "$@"', process.execPath, FULL, csPath], { stdio: ['ignore', 'pipe', 'pipe'] }); } catch (e) { resolve({ code: null, err: String(e) }); return; }
      c.on('error', (e) => { err += String(e); });
      if (c.stdout) c.stdout.on('data', (d) => { out += d; });
      if (c.stderr) c.stderr.on('data', (d) => { err += d; });
      const t = setTimeout(() => { try { c.kill('SIGKILL'); } catch { } }, 20000);
      c.on('close', (code, signal) => { clearTimeout(t); let j = null; try { j = JSON.parse(out.trim().split('\n').pop()); } catch { } resolve({ code, signal, j, unheard: /Unhandled 'error' event|Emitted 'error' event on ChildProcess/.test(err), died: (/Error: spawn (\S+) EMFILE/.exec(err) || [])[1] || null, err: err.slice(-500) }); });
    });
    const csE = fs.readFileSync(path.join(REPO, 'src/server/child-starter.js'), 'utf8');
    const LIS = "    p.on('error', () => { if (p === proc) fault('the starter could not be started'); });\n", PIPE_IN = "    p.stdin.on('error', () => { });\n";
    const DLIS = "      c.on('error', (e) => { if (t) clearTimeout(t); if (!done) { done = true; resolve({ started: false, code: null, error: String((e && e.code) || e), stdout: out, stderr: err }); } });\n";
    const CAPG = '      if (o.capture && c.stdout && c.stderr) {', CLOSE = "      c.on('close', (code, signal) => {";
    const redStartSrc = anchored(anchored(csE, LIS, '', 'emfile-start-off'), PIPE_IN, PIPE_IN + LIS, 'emfile-start-late');
    const redDirectSrc = anchored(anchored(anchored(csE, DLIS, '', 'emfile-direct-off'), CAPG, '      if (o.capture) {', 'emfile-direct-unguarded'), CLOSE, DLIS + CLOSE, 'emfile-direct-late');
    const g = await fullRun(path.join(REPO, 'src/server/child-starter.js'));
    const rU = await fullRun(MC.write('src/server/child-starter.js', anchored(csE, 'stats.unknown++; return Promise.resolve', 'return Promise.resolve', 'emfile-unknown-uncounted'), 'red-emfile-unknown'));
    const rA = await fullRun(MC.write('src/server/child-starter.js', redStartSrc, 'red-emfile-start'));
    const rB = await fullRun(MC.write('src/server/child-starter.js', redDirectSrc, 'red-emfile-direct'));
    const j = g.j || {};
    ok(g.code === 0 && j.full === 'EMFILE' && j.r1 && j.r1.unknown === true && j.st1.faults === 1 && j.st1.restarted && !j.st1.direct && j.st1.unknown === 1
      && j.r2 && j.r2.started === false && /EMFILE|ENFILE/.test(String(j.r2.error)) && j.st2.faults === 2 && j.st2.direct && j.st2.starts === 2
      // the reds are judged by THE DEATH ITSELF — exit 1, no answer line, and the uncaught start error by its name — never by how many
      // asks ran before it (the order of a tick and a rejection is the runtime's: the hosted Node 22 and the hub's Node 24)
      && rA.code === 1 && rA.unheard && path.basename(String(rA.died)) === path.basename(process.execPath) && !rA.j
      && rB.code === 1 && rB.unheard && rB.died === 'true' && !rB.j
      && rU.code === 0 && rU.j && rU.j.r1 && rU.j.r1.unknown === true && rU.j.st1.unknown === 0,
      `a FULL file table (${j.held} handles held, the next open «${j.full}»): the starter's start fails at once ⇒ answered «unknown», ${j.st1 && j.st1.faults} fault counted, ${j.st1 && j.st1.unknown} unknown; the second ⇒ the old road, its start failing the same way ⇒ «not started» (${j.r2 && j.r2.error}), ${j.st2 && j.st2.faults} faults — the process ALIVE after (exit ${g.code}); RED the tip's order: the starter's pipe first ⇒ exit ${rA.code}, the unheard «spawn ${rA.died} EMFILE», no answer line; the old road's pipes first ⇒ exit ${rB.code}, the unheard «spawn ${rB.died} EMFILE», no answer line; RED the unknown not counted ⇒ ${rU.j && rU.j.st1 ? rU.j.st1.unknown : '?'} counted for the same answer`,
      { g: { code: g.code, j: g.j, err: g.err }, rA: { code: rA.code, died: rA.died, unheard: rA.unheard, err: rA.err }, rB: { code: rB.code, died: rB.died, unheard: rB.unheard, err: rB.err }, rU: { code: rU.code, st1: rU.j && rU.j.st1 } });

    // ④k THE SELF-UPDATE'S FAILED START IS SAID (cure 2; cure 3: each half with its own red): the route answers «started» before the
    // queued 'error' arrives; the dialog reads the update's log for its end mark (src/lib/app.js: «Update failed (exit N) — see the log
    // below») — without it, it spun to its ten-minute timeout, and a second press was refused as a run «already» in flight. A REAL
    // full table, refilled before EACH call with exactly ONE handle free (the route opens its log, the start's pipes cannot be made —
    // whatever else of the process took a handle meanwhile): the status's log says it and carries the mark, the process alive, a
    // second press tries again — with the log write allowed, and with it REFUSED (the status answers the mark from memory).
    // RED, each half alone: the status's fallback out (the write refused ⇒ no mark), the in-flight check's «failed at once» out (the
    // write refused ⇒ the press refused), the failure neither written nor kept (no mark, the press refused)
    // EACH RUN ITS OWN ROOT (cure 4: one shared data/update.log carried a run's state into the next — «a recent log with no mark»
    // answered the next run's FIRST press «already», so its start never failed and the reds after it judged nothing)
    const OPSF = path.join(T, 'ops-full.cjs');
    let rootN = 0;
    const freshRoot = () => { const R = path.join(T, `ops-root-${++rootN}`); fs.mkdirSync(path.join(R, 'scripts'), { recursive: true }); fs.mkdirSync(path.join(R, 'data'), { recursive: true }); fs.writeFileSync(path.join(R, 'scripts', 'update.sh'), '#!/bin/sh\nexit 0\n', { mode: 0o755 }); return R; };
    fs.writeFileSync(OPSF, [
      "const fs = require('fs'); const [opsPath, root, refuse] = process.argv.slice(2); const routes = {};",
      "if (refuse === '1') { const ra = fs.promises.appendFile; fs.promises.appendFile = async function (p, ...a) { if (String(p).endsWith('update.log')) { const e = new Error('EMFILE: the leg refuses the write'); e.code = 'EMFILE'; throw e; } return ra.call(this, p, ...a); }; }",
      "const app = new Proxy({}, { get: (t, k) => (p, ...h) => { if (typeof p === 'string' && h.length) routes[String(k).toUpperCase() + ' ' + p] = h[h.length - 1]; } });",
      "require(opsPath).create({ app, rootDir: root, wss: { clients: new Set() }, WS_OPEN: 1 });",
      "const call = (k) => new Promise((r) => { const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, json(o) { r({ code: this.statusCode, body: o }); return this; }, end() { r({ code: this.statusCode }); }, set() { return this; }, setHeader() { } }; routes[k]({ body: {}, query: {}, headers: {} }, res); });",
      "const held = []; let full = null;",
      "const oneFree = () => { try { for (let i = 0; i < 100000; i++) held.push(fs.openSync('/dev/null', 'r')); } catch (e) { full = e.code; } fs.closeSync(held.pop()); };   // full, ONE handle free",
      "const sleep = (ms) => new Promise((r) => setTimeout(r, ms));",
      "(async () => {",
      "  oneFree(); const post = await call('POST /api/self-update'); await sleep(300);",
      "  oneFree(); const st = await call('GET /api/self-update/status');",
      "  oneFree(); const again = await call('POST /api/self-update'); await sleep(300);",
      "  for (const fd of held) fs.closeSync(fd);",
      "  process.stdout.write(JSON.stringify({ full, post, st, again }) + '\\n'); process.exit(0);",
      "})();",
    ].join('\n'));
    const opsRun = (opsPath, refuse) => new Promise((resolve) => {
      let out = '', err = '', c;
      try { c = CP.spawn('sh', ['-c', 'ulimit -n 128 && exec "$0" "$@"', process.execPath, OPSF, opsPath, freshRoot(), refuse ? '1' : '0'], { stdio: ['ignore', 'pipe', 'pipe'] }); } catch (e) { resolve({ code: null, err: String(e) }); return; }
      c.on('error', (e) => { err += String(e); });
      if (c.stdout) c.stdout.on('data', (d) => { out += d; });
      if (c.stderr) c.stderr.on('data', (d) => { err += d; });
      const t = setTimeout(() => { try { c.kill('SIGKILL'); } catch { } }, 20000);
      c.on('close', (code) => { clearTimeout(t); let j = null; try { j = JSON.parse(out.trim().split('\n').pop()); } catch { } resolve({ code, j, err: err.slice(-400) }); });
    });
    const opsSrc = fs.readFileSync(path.join(REPO, 'src/server/ops-routes.js'), 'utf8'), OPS = path.join(REPO, 'src/server/ops-routes.js');
    const KEPT = "      _selfUpdateFailed = { why };\n", WRITTEN = /\n {6}fs\.promises\.appendFile\(_updateLogPath, failedStart\(why\)\)\.catch\(\(\) => \{ \}\);[^\n]*/;
    const FALLBACK = /\n {2}if \(_selfUpdateFailed && !log\.includes\('__UPDATE_EXIT:'\)\) log \+= failedStart\(_selfUpdateFailed\.why\);[^\n]*/, INFLIGHT = " && !_selfUpdateFailed) return res.json({ success: true, already: true });";
    const view = (r) => { const j = r.j || {}; return { code: r.code, full: j.full, posted: !!(j.post && j.post.body && j.post.body.success), log: String((j.st && j.st.body && j.st.body.log) || ''), running: j.st && j.st.body ? j.st.body.running : null, already: j.again && j.again.body ? j.again.body.already === true : null, err: r.err }; };
    const kOk = view(await opsRun(OPS, false)), kRef = view(await opsRun(OPS, true));
    const kSilent = view(await opsRun(MC.write('src/server/ops-routes.js', anchored(anchored(opsSrc, KEPT, '', 'update-failed-kept'), WRITTEN, '', 'update-failed-written'), 'red-update-silent'), false));
    const kNoFallback = view(await opsRun(MC.write('src/server/ops-routes.js', anchored(opsSrc, FALLBACK, '', 'update-status-fallback'), 'red-update-no-fallback'), true));
    const kInflight = view(await opsRun(MC.write('src/server/ops-routes.js', anchored(opsSrc, INFLIGHT, ') return res.json({ success: true, already: true });', 'update-inflight'), 'red-update-inflight'), true));
    const said = (v) => /could not be started \(EMFILE\)/.test(v.log) && /__UPDATE_EXIT:127\s*$/.test(v.log);
    ok([kOk, kRef].every((v) => v.code === 0 && v.full === 'EMFILE' && v.posted && said(v) && v.running === false && v.already === false)
      && [kSilent, kNoFallback, kInflight].every((v) => v.code === 0 && v.full === 'EMFILE' && /\[update\] the update could not be started: EMFILE/.test(v.err))   // each red's first start REALLY failed
      && kSilent.code === 0 && !/__UPDATE_EXIT:/.test(kSilent.log) && kSilent.already === true
      && kNoFallback.code === 0 && !/__UPDATE_EXIT:/.test(kNoFallback.log)
      && kInflight.code === 0 && said(kInflight) && kInflight.already === true,
      `the self-update's start failing at once (a full table, one handle free before each call): the dialog's log says «${(kOk.log.match(/could not be started \([^)]*\)/) || ['—'])[0]}» and ends with its mark (${(kOk.log.match(/__UPDATE_EXIT:\d+/) || ['none'])[0]} ⇒ «Update failed»), nothing running, a second press tries again — the log write allowed and REFUSED alike (refused: ${(kRef.log.match(/__UPDATE_EXIT:\d+/) || ['no mark'])[0]} from memory, already ${kRef.already}); the process alive; RED each half: the failure neither written nor kept ⇒ no mark + the press refused (${kSilent.already}); the status's fallback out ⇒ ${/__UPDATE_EXIT:/.test(kNoFallback.log) ? 'a mark' : 'no mark'}; the in-flight check's «failed at once» out ⇒ the press refused (${kInflight.already})`,
      { kOk, kRef, kSilent, kNoFallback, kInflight });

    // ④l THE STREAM LAW (cure 3; pinned with its reds in cure 4 — a closed must has a leg): any stream the hub opens on the copy and
    // archive roads has its error listener before anything that can throw (a full table fails its open on a later tick: unheard, the
    // hub ended). The order is read in the route's own source: a reader that never started is refused BEFORE any stream is made, the
    // local reader is heard before it is counted or piped, the write stream before the pipe, the archive entry's out stream at its
    // creation (before its reader starts), and a reader that never started is refused before its pipe. RED: the guard removed, the
    // write stream's order reverted, the out stream's listener removed — each flips its own claim
    const streamClaims = (src) => {
      const at = (needle, from = 0) => src.indexOf(needle, from);
      const r0 = at('else reader = fs.createReadStream(safePath(src));'), g = at('if (!reader) return res.status(503)', r0), rl = at("reader.on('error', () => { });", r0), rc = at('count(reader);', r0);
      const w0 = at('const w = fs.createWriteStream(part);'), we = at("w.on('error', reject);", w0), wp = at('reader.pipe(w);', w0);
      const o0 = at('const outStream = fs.createWriteStream(outPath);'), oe = at("outStream.on('error'", o0), sp = at('const child = spawn(cmd, args', o0), cg = at('if (!child.stdout)', o0), cp = at('child.stdout.pipe(outStream);', o0);
      return {
        'a reader that never started is refused before any stream is made': r0 >= 0 && g > r0 && g < rc && at('createWriteStream(part)', r0) > g && at("spawn('ssh'", r0) > g,
        'the local reader heard before it is counted or piped': rl > r0 && rl < rc,
        'the write stream heard before the pipe': w0 >= 0 && we > w0 && wp > we,
        'the archive entry out stream heard at its creation': o0 >= 0 && oe > o0 && oe < sp,
        'an archive reader that never started refused before its pipe': sp > 0 && cg > sp && cg < cp,
      };
    };
    const filesSrc = fs.readFileSync(path.join(REPO, 'src/routes/files.js'), 'utf8'), sGreen = streamClaims(filesSrc);
    const sReds = [
      ['the reader guard removed', 'a reader that never started is refused before any stream is made', streamClaims(anchored(filesSrc, /\n {2}if \(!reader\) return res\.status\(503\)[^\n]*/, '', 'stream-guard'))],
      ['the write stream order reverted', 'the write stream heard before the pipe', streamClaims(anchored(filesSrc, "const w = fs.createWriteStream(part); w.on('error', reject); w.on('finish', resolve); reader.on('error', reject); reader.pipe(w);", "const w = fs.createWriteStream(part); reader.pipe(w); w.on('error', reject); w.on('finish', resolve); reader.on('error', reject);", 'stream-order'))],
      ['the out stream listener removed', 'the archive entry out stream heard at its creation', streamClaims(anchored(filesSrc, "  outStream.on('error', (e) => { outErr = outErr || e; });\n", '', 'stream-out'))],
    ].map(([what, claim, r]) => [what, claim, r[claim] === false && Object.entries(r).filter(([k, v]) => k !== claim && !v).length === 0]);
    ok(Object.values(sGreen).every(Boolean) && sReds.every(([, , flipped]) => flipped),
      `the stream law on the copy and archive roads: ${Object.entries(sGreen).map(([k, v]) => `${k} ${v ? '✓' : '✗'}`).join(' · ')}; RED each flips only its own claim: ${sReds.map(([w, , f]) => `${w} ${f}`).join(' · ')}`, { sGreen, sReds });

    // ④j THE CLASS (cure 2: every module the HUB loads, every form of a start): the hub's module set is DERIVED — the require graph
    // from server.js, never a typed list — and in each, every start is read: a bare spawn / fork / execFile destructured from
    // child_process, a namespaced one (cp.spawn), an inline require('child_process').spawn. A spawn / fork attaches its 'error'
    // listener BEFORE its first unguarded pipe touch, and has one (a start that fails at once queues its error; unheard, the hub
    // ends: process.on('uncaughtException') exits 1); an execFile holds its own listener — its child's pipe is never touched
    // unguarded (a rejection instead of the road's own refusal). A start handed straight on (an argument, a return) is judged
    // where it lands, counted here. Comments are blanked first. node-pty's spawn (claude-signin, oat-mint: a local `spawn`) throws
    // instead: not this class. RED: each form planted broken, the five sites cured here put back, and three shapes it must NOT flag
    // the engine (cure 3, the fresh read's MUST: a `/*` inside a line comment or a string opened a FAKE comment — server.js's
    // «/api/file/serve/*» hid its lines 143–579 and with them 37 hub modules): comments are blanked in ONE left-to-right pass
    // that knows strings, template literals (and their ${…}) and regex literals; a start's listener is judged in its own scope (up
    // to its name's next declaration: a second `const w` is another child); a pipe is touched by a member read, a stdio slot or
    // being handed as a call's first argument
    function blank(src) {
      const out = src.split(''), n = src.length, stack = [];   // stack: brace depth of each ${…} we are inside
      let i = 0, last = '';                                     // last: the last significant code token's tail (regex vs division)
      const wipe = (a, b) => { for (let k = a; k < b; k++) if (out[k] !== '\n') out[k] = ' '; };
      const regexStart = () => /^$|[(,=:[!&|?{};+\-*%<>~^]$/.test(last) || /(?:^|[^\w$.])(?:return|typeof|case|do|else|in|of|void|yield|await|delete|throw|new)$/.test(last);
      const tpl = () => {   // i at the char after the opening backtick: scan to its closing backtick, recursing into ${…}
        while (i < n) {
          const c = src[i];
          if (c === '\\') { i += 2; continue; }
          if (c === '`') { i++; return; }
          if (c === '$' && src[i + 1] === '{') { i += 2; stack.push(0); code(true); continue; }
          i++;
        }
      };
      const code = (inTpl) => {
        while (i < n) {
          const c = src[i], d = src[i + 1];
          if (c === '/' && d === '/') { const e = src.indexOf('\n', i); const end = e < 0 ? n : e; wipe(i, end); i = end; continue; }
          if (c === '/' && d === '*') { const e = src.indexOf('*/', i + 2); const end = e < 0 ? n : e + 2; wipe(i, end); i = end; continue; }
          if (c === '/' && regexStart()) { let k = i + 1, cls = false; while (k < n && src[k] !== '\n') { const x = src[k]; if (x === '\\') { k += 2; continue; } if (x === '[') cls = true; else if (x === ']') cls = false; else if (x === '/' && !cls) break; k++; } i = k + 1; while (i < n && /[a-z]/.test(src[i])) i++; last = 'r'; continue; }
          if (c === '"' || c === "'") { let k = i + 1; while (k < n && src[k] !== c && src[k] !== '\n') { if (src[k] === '\\') k++; k++; } i = k + 1; last = 's'; continue; }
          if (c === '`') { i++; tpl(); last = 's'; continue; }
          if (inTpl && c === '{') { stack[stack.length - 1]++; i++; last = '{'; continue; }
          if (inTpl && c === '}') { if (stack[stack.length - 1] === 0) { stack.pop(); i++; return; } stack[stack.length - 1]--; i++; last = '}'; continue; }
          if (!/\s/.test(c)) { last = /[\w$]/.test(c) ? (/[\w$]$/.test(last) ? last + c : c).slice(-12) : c; }
          i++;
        }
      };
      code(false);
      return out.join('');
    }
    // deferred(text): is a function body (an arrow's or a `function`'s) still open at the end of `text`? (its code runs later)
    function deferred(text) {
      const stack = [];
      for (let k = 0; k < text.length; k++) {
        const ch = text[k];
        if (ch === '{') { const pre = text.slice(Math.max(0, k - 160), k); stack.push(/=>\s*$/.test(pre) || /\bfunction\b[^{};]*$/.test(pre) ? 'fn' : 'block'); }
        else if (ch === '}') stack.pop();
      }
      return stack.includes('fn');
    }
    // blockAt(text, k): the text of the block whose `{` is at k (to its matching `}`)
    function blockAt(text, k) { let depth = 0, e = k; for (; e < text.length; e++) { if (text[e] === '{') depth++; else if (text[e] === '}') { depth--; if (!depth) break; } } return text.slice(k, e + 1); }
    const CPQ = `require\\(\\s*['"](?:node:)?child_process['"]\\s*\\)`;
    // sitesOf(rel, raw) → [{ site, form, v, handed, bad }]: every start in a file, judged
    function sitesOf(rel, raw) {
      const src = blank(raw), out = [];
      const ns = [...src.matchAll(new RegExp(`(?:const|let|var)\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*${CPQ}`, 'g'))].map((m) => m[1]);
      const bare = new Map();
      for (const m of src.matchAll(new RegExp(`(?:const|let|var)\\s*\\{([^}]*)\\}\\s*=\\s*${CPQ}`, 'g'))) for (const part of m[1].split(',')) { const [k, v] = part.split(':').map((x) => x.trim()); if (['spawn', 'fork', 'execFile'].includes(k)) bare.set(v || k, k); }
      // an alias is the form it names: a default `spawnImpl = spawn`, `x = opts.spawn || spawn`, `x = cp.spawn` (the injected doors)
      const forms = new Map(bare); for (const n of ns) for (const f of ['spawn', 'fork', 'execFile']) forms.set(n + '.' + f, f);
      for (const [name, form] of [...forms]) for (const m of src.matchAll(new RegExp(`([A-Za-z_$][\\w$]*)\\s*=\\s*(?:[^;,()\\n]*?(?:\\|\\||\\?\\?)\\s*)?${name.replace(/[$.]/g, (ch) => '\\' + ch)}\\b(?!\\s*\\()`, 'g'))) if (!forms.has(m[1]) && m[1] !== name) { bare.set(m[1], form); forms.set(m[1], form); }
      const calls = [];
      for (const m of src.matchAll(new RegExp(`${CPQ}\\.(spawn|fork|execFile)\\(`, 'g'))) calls.push({ at: m.index, form: m[1] });
      for (const n of ns) for (const m of src.matchAll(new RegExp(`\\b${n.replace(/\$/g, '\\$')}\\.(spawn|fork|execFile)\\(`, 'g'))) calls.push({ at: m.index, form: m[1] });
      for (const [name, form] of bare) for (const m of src.matchAll(new RegExp(`(?<![.\\w$])${name.replace(/\$/g, '\\$')}\\(`, 'g'))) if (!/\bfunction\s*$/.test(src.slice(Math.max(0, m.index - 12), m.index))) calls.push({ at: m.index, form });
      for (const c of calls) {
        const back = src.slice(Math.max(0, c.at - 300), c.at).split(';').pop(), line = src.slice(0, c.at).split('\n').length, site = `${rel}:${line}`;
        if (/(?:\breturn|=>)\s*$/.test(back) || /[(,]\s*$/.test(back)) { out.push({ site, form: c.form, handed: true, bad: false }); continue; }
        const a = /([A-Za-z_$][\w$]*)\s*=\s*(?:[^;=]*?[?:]\s*)?$/.exec(back), v = a ? a[1] : null;
        let win = src.slice(c.at, c.at + 4000);
        if (v) { const re = new RegExp(`\\b(?:const|let|var)\\s+${v.replace(/\$/g, '\\$')}\\b`); const k = win.slice(1).search(re); if (k >= 0) win = win.slice(0, k + 1); }   // the start's own scope: up to the name's next declaration
        let lis = -1, first = -1;
        if (v) {
          const V = v.replace(/\$/g, '\\$');
          lis = win.search(new RegExp(`\\b${V}\\.(?:on|once|addListener)\\('error'`));
          // a TOUCH: a member read on a pipe (x.stdout.on — `?.` is guarded), a stdio slot (x.stdio[3]), or a pipe handed as a call's
          // first argument (count(x.stdout), r.pipe(w.stdin)) — never a pipe listed in an array (each then checked by the reader)
          const touch = new RegExp(`\\b${V}\\.(?:stdout|stdin|stderr)\\s*\\.(?!\\?)|\\b${V}\\.stdio\\s*\\[|\\(\\s*${V}\\.(?:stdout|stdin|stderr)\\s*[),]`, 'g');
          const guard = new RegExp(`if \\((?:[^)\\n]*(?:&&|\\|\\|)\\s*)?!?${V}\\.std|${V}\\.std\\w* &&`);
          let t;
          while ((t = touch.exec(win))) {
            const lineStart = win.lastIndexOf('\n', t.index) + 1, upto = win.slice(lineStart, t.index + t[0].length), post = win.slice(t.index, t.index + 240).split('\n')[0];
            if (guard.test(upto) || (/\btry \{/.test(upto) && /\}\s*catch\b/.test(post))) continue;
            first = t.index; break;
          }
        }
        // THE KILL LAW (cure 4): a catch in the start's OWN flow (no function opened between the start and it — a callback runs later,
        // when a failed start's handle is gone) that signals a child names a real pid on that line: a start that failed in the same
        // tick has no pid, and its kill went to whatever that slot held (0: the hub's own process group)
        const killNoPid = [];
        for (const m of win.matchAll(/\bcatch\s*(?:\([^)]*\))?\s*\{/g)) {
          if (deferred(win.slice(0, m.index))) continue;
          const body = blockAt(win, m.index + m[0].length - 1);
          for (const t of body.matchAll(/\b([A-Za-z_$][\w$]*)\.kill\(/g)) { if (t[1] === 'process') continue; const ls = body.lastIndexOf('\n', t.index) + 1, le = body.indexOf('\n', t.index); if (!new RegExp(`\\b${t[1].replace(/\$/g, '\\$')}\\.pid\\b`).test(body.slice(ls, le < 0 ? undefined : le))) killNoPid.push(t[1]); }
        }
        out.push({ site, form: c.form, v, killNoPid, bad: killNoPid.length > 0 || (c.form === 'execFile' ? first >= 0 : (!v || lis < 0 || (first >= 0 && first < lis))) });
      }
      return out;
    }
    const hubModules = () => {
      const seen = new Set(), todo = ['server.js'];
      while (todo.length) {
        const rel = todo.pop(); if (seen.has(rel)) continue; let src; try { src = fs.readFileSync(path.join(REPO, rel), 'utf8'); } catch { continue; } seen.add(rel);
        for (const m of blank(src).matchAll(/require\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g)) {
          const base = path.posix.normalize(path.posix.join(path.posix.dirname(rel), m[1]));
          const hit = [base, base + '.js', base + '/index.js'].find((c) => /\.c?js$/.test(c) && fs.existsSync(path.join(REPO, c)) && fs.statSync(path.join(REPO, c)).isFile());
          if (hit) todo.push(hit);
        }
      }
      return [...seen].sort();
    };
    const mods = hubModules(), sites = mods.flatMap((r) => sitesOf(r, fs.readFileSync(path.join(REPO, r), 'utf8')));
    const rd = (r) => fs.readFileSync(path.join(REPO, r), 'utf8');
    // THE NAMED DEBT (主开发 20:53Z, road (b)): scripts/fixtures/spawn-listener-debt.json — the sites whose listener comes after a pipe
    // touch, a count a file that only FALLS (the founding sums below are this commit's: raising one is an edit here too), and the
    // starts that only SURVIVE (one listener, the journal line: «the hub survives; the road's own failure words owed») — each
    // file's survival lines counted and each still holding its listener on its line
    const FIX = JSON.parse(fs.readFileSync(path.join(REPO, 'scripts/fixtures/spawn-listener-debt.json'), 'utf8')), DEBT = FIX.pipeFirst, SURV = FIX.survives;
    // FOUNDING, a count a FILE (cure 3, the read's SHOULD: a sum let one file grow while another fell): raising one is an edit here
    const FOUNDING = {
      pipeFirst: { 'src/routes/files.js': 3, 'src/machine-mounts.js': 2, 'src/remote-fs.js': 1, 'src/desktop-display.js': 2, 'src/node-runtime.js': 1 },
      survives: { 'src/mounts.js': 2, 'src/plugins/frp.js': 1, 'src/plugins/tailscale.js': 2, 'src/vnc.js': 1, 'src/routes/files.js': 4, 'src/remote-fs.js': 1, 'src/claude-oat-probe.js': 1, 'src/device-mount.js': 1 },
    };
    const SURV_MARK = 'ckpt61 cure 2: the hub survives a start that fails';
    const bad = sites.filter((x) => x.bad).map((x) => x.site);
    const newBad = bad.filter((x) => !DEBT.some((d) => x.startsWith(d.file + ':') && d.n > 0)), debtNow = Object.fromEntries(DEBT.map((d) => [d.file, bad.filter((x) => x.startsWith(d.file + ':')).length]));
    // the survival lines are counted in EVERY hub module (a new survive-only start in a file the fixture does not name is red)
    const marked = mods.map((r) => { const lines = rd(r).split('\n').filter((l) => l.includes(SURV_MARK)); return { file: r, now: lines.length, held: lines.filter((l) => /\.on\('error', \(e\) => console\.warn\(/.test(l)).length }; }).filter((x) => x.now > 0);
    const survNow = SURV.map((r) => ({ file: r.file, n: r.n, ...(marked.find((x) => x.file === r.file) || { now: 0, held: 0 }) }));
    const unnamedSurv = marked.filter((x) => !SURV.some((r) => r.file === x.file)).map((x) => x.file);
    const survOk = survNow.every((r) => r.now === r.n && r.held === r.n) && !unnamedSurv.length
      && DEBT.every((d) => FOUNDING.pipeFirst[d.file] != null && d.n <= FOUNDING.pipeFirst[d.file]) && SURV.every((r) => FOUNDING.survives[r.file] != null && r.n <= FOUNDING.survives[r.file]);
    const planted = {
      'a namespaced spawn, its pipe first': "const cp = require('child_process');\nfunction f() { const c = cp.spawn('x', [], { stdio: 'pipe' }); c.stdout.on('data', () => {}); c.on('error', () => {}); }",
      'an inline spawn, no listener': "function f() { const c = require('child_process').spawn('x', [], { stdio: 'ignore' }); c.unref(); }",
      'a fork, its pipe first': "const { fork } = require('child_process');\nfunction f() { const w = fork('w.js', [], { stdio: ['ignore', 'pipe', 'pipe', 'ipc'] }); w.stdout.on('data', () => {}); w.on('error', () => {}); }",
      'an execFile, its stdin unguarded': "const { execFile } = require('child_process');\nfunction f() { const c = execFile('x', [], () => {}); c.stdin.end('y'); }",
      'a stdio slot read first': "const { spawn } = require('child_process');\nfunction f() { const x = spawn('x', [], { stdio: ['ignore', 'ignore', 'ignore', 'pipe'] }); x.stdio[3].on('data', () => {}); x.on('error', () => {}); }",
      'a pipe handed on before the listener': "const { spawn } = require('child_process');\nfunction f(r) { const w = spawn('x', [], { stdio: 'pipe' }); r.pipe(w.stdin); w.on('error', () => {}); }",
      'a catch that signals a child with no pid check': "const { spawn } = require('child_process');\nfunction f() { let c; try { c = spawn('x', []); c.on('error', () => {}); more(); } catch (e) { c.kill('SIGTERM'); } }",
      'a listener of ANOTHER child of the same name': "const { spawn } = require('child_process'); const fs = require('fs');\nfunction f(r) { const w = spawn('x', [], { stdio: 'pipe' }); r.pipe(w.stdin); }\nfunction g() { const w = fs.createWriteStream('p'); w.on('error', () => {}); }",
      'a start behind a «/*» in a string and a comment': "const { spawn } = require('child_process');\nconst ROUTE = '/files/*'; // a route /api/x/* serves it\nfunction f() { const c = spawn('x', [], { stdio: 'pipe' }); c.stdout.on('data', () => {}); }\n// */",
    };
    const keep = {
      'a start in a comment': "const { spawn } = require('child_process');\n// spawn(cmd) — its child.stdout.on(...) before c.on('error') would be the fault\nfunction f() { const c = spawn('x', [], { stdio: 'pipe' }); c.on('error', () => {}); if (c.stdout) c.stdout.on('data', () => {}); }",
      'a child handed on': "const { spawn } = require('child_process');\nfunction f(ran) { return new Promise((r) => { ran(spawn('x', [], { stdio: 'ignore' }), r); }); }",
      'a try-guarded pipe': "const cp = require('child_process');\nfunction f() { const c = cp.execFile('x', [], () => {}); if (c.stdin) c.stdin.on('error', () => {}); try { c.stdin.end('y'); } catch { } }",
      'a kill in a later callback (the failed start\'s handle is gone by then)': "const { spawn } = require('child_process');\nfunction f() { const c = spawn('x', []); c.on('error', () => {}); setTimeout(() => { try { c.kill(); } catch { c.kill('SIGKILL'); } }, 10); }",
      'pipes listed in an array': "const cp = require('child_process');\nfunction f() { const c = cp.spawn('x', []); for (const p of [c.stdin, c.stdout]) if (p) p.destroy(); c.on('error', () => {}); }",
    };
    const reds = [
      ...Object.entries(planted).map(([w, src]) => [w, sitesOf('planted.js', src).filter((x) => x.bad).length]),
      ['the starter (its pipe first)', sitesOf('src/server/child-starter.js', redStartSrc).filter((x) => x.bad).length], ['the old road (its pipes first)', sitesOf('src/server/child-starter.js', redDirectSrc).filter((x) => x.bad).length],
      ['the self-update (no listener)', sitesOf('src/server/ops-routes.js', anchored(rd('src/server/ops-routes.js'), /\n {4}child\.on\('error', \(e\) => \{\n/, '\n    child.on(\'exit\', (e) => {\n', 'class-ops')).filter((x) => x.bad).length],
      ['the local daemon start (no listener)', sitesOf('src/agentd/client.js', anchored(rd('src/agentd/client.js'), /\n {4}child\.on\('error', \(e\) => \{ this\._log\([^\n]*/, '', 'class-daemon')).filter((x) => x.bad).length],
      ['the desktop session X server (no listener: its display slot read first)', sitesOf('src/vnc.js', anchored(rd('src/vnc.js'), /\n {6}x\.on\('error', \(e\) => \{ console\.warn\(`\[vnc\][^\n]*/, '', 'class-vnc')).filter((x) => x.bad).length],
      ['the single-file copy writer (no listener; the later `const w` is another child)', sitesOf('src/routes/files.js', anchored(rd('src/routes/files.js'), "      w.on('error', (e) => { wErr = e; });\n", '', 'class-copy-writer')).filter((x) => x.bad && x.v === 'w').length],
      ['the folder copy catch (a child signalled with no pid check)', sitesOf('src/routes/files.js', anchored(rd('src/routes/files.js'), 'Number.isInteger(c.pid) && c.pid > 0 && ', '', 'class-copy-kill')).some((x) => x.killNoPid && x.killNoPid.length) ? 1 : 0],
      ['the cache count (its pipe first)', sitesOf('src/mounts.js', anchored(rd('src/mounts.js'), "      c.on('error', end); c.on('close', end);\n      if (c.stdout) c.stdout.on(", "      c.stdout.on(", 'class-cache-count')).filter((x) => x.bad).length],
    ];
    const kept = Object.entries(keep).map(([w, src]) => [w, sitesOf('kept.js', src).filter((x) => x.bad).length]);
    ok(mods.length > 100 && mods.includes('src/agentd/client.js') && mods.includes('src/mounts.js') && sites.length > 100 && !newBad.length && DEBT.every((d) => debtNow[d.file] <= d.n) && survOk && reds.every(([, n]) => n === 1) && kept.every(([, n]) => n === 0),
      `the hub's ${mods.length} modules (the require graph from server.js) hold ${sites.length} starts (${sites.filter((x) => x.handed).length} handed on): every spawn / fork has its error listener before its first unguarded pipe touch, every execFile's pipes guarded${newBad.length ? '; NOT: ' + newBad.join(', ') : ''}; the named debt (a count a file only falls): ${DEBT.map((d) => `${d.file} ${debtNow[d.file]}/${d.n}`).join(', ')}; the starts that only survive (words owed): ${survNow.map((r) => `${r.file} ${r.held}/${r.n}`).join(', ')}; RED each planted break named once: ${reds.map(([w, n]) => `${w} ${n}`).join(' · ')}; never flagged: ${kept.map(([w, n]) => `${w} ${n}`).join(' · ')}`, { newBad, debtNow, survNow, unnamedSurv, reds, kept });
  }

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
  // ⑥b the belt's OTHER sites (the window tree, the visible windows, the xrandr resize, the wmctrl / xdotool fit) and the port scan's
  // docker rung, one call each through a stand-in program: 0 starts from the main process; RED the tip's call lines planted back
  const STUBX = path.join(T, 'stub-x'); fs.writeFileSync(STUBX, '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  const beltAll = async (X) => {
    X.useStarter(S5);
    return counting(async () => {
      const o = { display: ':42', env: cleanEnv };
      await X.windowTree({ ...o, bins: { xwininfo: STUBX } });
      await X.viewableWindows({ ...o, bins: { xdotool: STUBX } });
      await X.setDisplaySize({ ...o, bins: { xrandr: STUBX }, w: 800, h: 600 });
      await X.applyWindowPlan({ ...o, bins: { xdotool: STUBX, wmctrl: STUBX }, plan: { main: 1, resize: { id: 1, framed: true, w: 800, h: 600 } } });
      await X.applyWindowPlan({ ...o, bins: { xdotool: STUBX, wmctrl: null }, plan: { main: 1, resize: { id: 1, w: 800, h: 600 } } });
    });
  };
  const rb0 = S5.stats().requests, b5 = await beltAll(D), rb = S5.stats().requests - rb0;
  const b5r = await beltAll(MC.load('src/desktop-display.js', dsrc.replace(D_NEW, () => '  if (false) {\n    const envAdd = {};'), 'red-belt-all'));
  ok(b5 === 0 && rb === 5 && b5r === 5, `the belt's other sites (a window tree, the visible windows, an xrandr resize, a wmctrl and an xdotool fit): ${b5} starts from the main process, ${rb} by the starter; RED (the tip's call line planted back): ${b5r}`);
  const P2_NEW = "      await this._enrichDocker(ports, (cmd) => starter.run('sh', ['-c', cmd], { timeoutMs: 6000, maxBuffer: 1024 * 1024, capture: true, envAdd: dockerEnv() }).then((r) => String(r.stdout || '')));";
  const P2_OLD = "      await this._enrichDocker(ports, (cmd) => new Promise((resolve) => require('child_process').execFile('sh', ['-c', cmd], { timeout: 6000, maxBuffer: 1024 * 1024 }, (e, so) => resolve(String(so || '')))));";
  const dockerRung = async (P) => { const pf = pfOf(P); mounts.push(pf); pf.detectLocal = async () => [{ port: 40001, proc: '' }]; CS.setChildStarter(S5); const r0 = S5.stats().requests; const n = await counting(() => pf.detect('__local__')); return { main: n, via: S5.stats().requests - r0 }; };
  const dk = await dockerRung({ PortForwardManager }), dkr = await dockerRung(MC.load('src/port-forward.js', psrc.replace(P2_NEW, () => P2_OLD), 'red-docker'));
  ok(psrc.split(P2_NEW).length === 2 && dk.main === 0 && dk.via >= 1 && dkr.main >= 1, `an anonymous listener: the docker / uid rungs' sh (${dk.via}) by the starter, ${dk.main} from the main process; RED (the tip's docker line planted back): ${dkr.main} from the main process`, { dk, dkr });
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

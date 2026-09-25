#!/usr/bin/env node
// THE desktop-serve OP TABLE (lane C1, docs/design-desktop-apps-seamless.zh.md
// §3.5) — fast, no display, no process started. The machine half of the
// desktop-app keeper is SHARED (src/desktop-serve.js, bundled by the agentd);
// this suite pins the table and its three touches:
//   §1 the census: every op the hub can name is in DESKTOP_SERVE_OPS; the
//      runner answers each BY NAME (a table op the runner does not handle is
//      caught — patched-copy control); every literal op a src/ caller hands
//      `desktopServe(` / an access `.call(` is in the table
//   §2 every failure is `{ok:false, code, error}` — an unknown op, a missing
//      id, a record this machine does not hold, a bad body, a bad fit size, a
//      refused launch, a method that THROWS; nothing throws across the wire
//      (CONTROL: the runner without its catch rejects)
//   §3 the daemon wiring (three-touch rule): the hello-ack capability, the
//      handler replying `desktop-serve-result` on both arms through the
//      bundled runner, ONE machine keeper per daemon PROCESS, the client's
//      id-keyed routing set, the client's capability gate naming
//      host_needs_daemon; the SHARED tier (no src/server require)
//   §4 the local rung = the hub keeper's OWN machine object (one store, every
//      record hostId 'local'); desktop-access over fakes: local in-process, a
//      paired device through desktopServe, a handle that cannot run the op
//      (no desktopServe — the stand-in for an agent predating it) and an
//      unknown host refused BY NAME, an op's failure thrown as ONE shape, the
//      picture forward piping bytes both ways and reference-counted
//   §5 the ssh rung over the REAL HostManager class (no stand-in): an ssh
//      host's daemon bootstrap that fails is host_unavailable naming the
//      reason, one that never answers is host_unavailable at the connect
//      deadline — the local keeper never touched; the real DeviceManager
//      always HAS desktopServe, so host_needs_daemon there comes only from its
//      capability gate (browser-access, the precedent, pinned the same)
//   §6 lane C2: the install rung's PURE plan (apt ≥ 5 vs xpra.org pinned 6.x, the
//      explicit recommends, no_x11 / no_apt / no_repo / no_sudo, a codename that
//      does not match its shape never reaches a root shell), the picker verdict,
//      the facts op's `install` block
//   §7 lane C2: the hub REGISTRY of a paired machine's apps over a stub device —
//      launch/get/list/broadcast re-labelled, the stream target naming the host,
//      the remote file (never this machine's store), windows / fit / keep-alive /
//      relaunch / stop through the op, the IDLE verdict the hub's (input the bridge
//      reported counts), the resource REPORT judging the device's sample once,
//      offline ⇒ unknown-host-offline kept across a hub restart, re-adopted when
//      it answers, a removed machine's records dropped, keeper.local, an id
//      collision refused, byte-identical local list
//   §8 lane C2: the bridge's ONE change — streamEndpointFor (local sync, remote
//      through forwardPort, released once, no forward ⇒ refused; a viewer that
//      half-closes / goes away while the forward resolves still releases, once)
//   §9 lane C2: the routes (host through, bad host 400, the picker, the plan, the
//      install streamed as NDJSON, no_sudo by name with the plan)
//   §10 lane C2: desktop-access machines() never connects to draw a row; the
//      install run on a paired machine (run-stream, same argv) and this machine
//      (a child), refusals before anything runs; past its deadline: named
//      install_timeout, the child waited out (never killed), the machine's slot
//      held ⇒ busy until it ends; a belt / lost link / real exit each by name
//   (C2 verify) §6 also probes the sudo probe over a fake sudo on a scratch PATH
//   (verify r2) §8 a viewer that RESETS during the forward is no uncaught error
//      (F1 — a process-level trap; CONTROL: the copy without the parked listener);
//      §10 the install runs DETACHED (src/desktop-apps.js INSTALL_LAUNCHER): it
//      outlives a SIGKILLed starter (F4), its slot is the machine's pidfile — a
//      re-created access layer RE-ATTACHES, one install (F4), a lost link / a
//      timed-out-then-lost install holds the slot until the machine says gone,
//      the freeing line naming the evidence (F3) — each with a mutant control
//   (verify r3) §10 the slot's claim: a stale pidfile naming a live unrelated pid
//      is never followed (M1); no setsid ⇒ 125 in < 1 s by name (L5); no
//      readable starttime ⇒ the runner refuses, nothing run (L8)
//   (verify r4) §10 the slot is a LOCK THE RUNNING INSTALL HOLDS (flock, fd 9
//      inherited by the runner and its children, on local storage): five
//      concurrent starts ⇒ ONE runner in each of 40 trials at natural speed and
//      20 with the windows widened (setsid +0.3 s, flock +0–60 ms); a previous
//      install SIGKILLed ⇒ its lock released by the kernel, the next start runs
//      at once (10 trials); the LAUNCHER SIGKILLed ⇒ its runner still holds the
//      lock (/proc/<runner>/fd/9) and a concurrent start follows it; a lock held
//      by a non-install is waited on, then taken the moment it frees; the lock
//      path on local storage, never the state dir; a runner handed a
//      descriptor that does not hold the lock refuses, the slot's files
//      untouched; no flock ⇒ 125 naming util-linux — each with a mutant control
//      (the CONTROL for the lock: `flock -n 9` → `true` ⇒ 5 runners per five)
//   (verify r5) §10 L1 a start in the SAME second as an earlier install's exit,
//      while a child that install left behind still holds the lock, RUNS
//      (CONTROL: the whole-second `-ge` launcher answers the stale exit 100);
//      L3 the lock's directory is named by the UID: $XDG_RUNTIME_DIR set to a
//      scratch dir, unset, or naming a gone dir ⇒ ONE lock path (CONTROL: the
//      r4 env-derived line names two); a fake uid's /tmp/vibespace-<uid> is
//      created 0700; a regular file there ⇒ refused by name (CONTROL: without
//      the check the refusal is the generic open failure); a directory owned by
//      another uid ⇒ refused by name (root only — SKIP with evidence otherwise);
//      `id -u` that is no number ⇒ refused by name; L4 a runner exec'd WITHOUT
//      fd 9 ⇒ 125 in < 1 s naming the lock (CONTROL: the unbounded wait still
//      waiting at 3 s, killed — unbounded it answers at 10 s)
// ~16 s (the install legs run a real detached launcher; the viewer-race legs wait on real timers). Scratch dirs from scripts/scratch.mjs; the install locks are named by the uid (/run/user/<uid>, else /tmp/vibespace-<uid> — verify r5 L3) after the SCRATCH state dirs' realpaths, so no name is ever production's, and every one this suite named is removed at exit; zero vendor calls.
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { createRequire } from 'node:module';
import { scratch } from './scratch.mjs';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
const DS = require(path.join(REPO, 'src/desktop-serve.js'));
const ACC = require(path.join(REPO, 'src/server/desktop-access.js'));
const K = require(path.join(REPO, 'src/server/desktop-app-keeper.js'));
const D = require(path.join(REPO, 'src/desktop-display.js'));
const M = require(path.join(REPO, 'src/desktop-apps.js'));
const until = async (fn, ms = 3000, step = 50) => { const t = Date.now() + ms; while (Date.now() < t) { const v = await fn(); if (v) return v; await new Promise((r) => setTimeout(r, step)); } return null; };

let pass = 0, fail = 0;
const ok = (c, n, d) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (d !== undefined ? ' — ' + JSON.stringify(d).slice(0, 300) : '')); } };
const root = scratch('dserve'); fs.mkdirSync(root, { recursive: true });
// (verify r5 L3) the install lock's directory is named by the UID, never the environment: /run/user/<uid> when it is a
// writable directory this user owns, else /tmp/vibespace-<uid>. $XDG_RUNTIME_DIR is set to a SCRATCH dir for the whole
// suite — every lock assertion below expects LOCKROOT, so every leg also proves the variable is ignored.
const XDG = path.join(root, 'xdg'); fs.mkdirSync(XDG, { recursive: true, mode: 0o700 }); process.env.XDG_RUNTIME_DIR = XDG;
const UID = typeof process.getuid === 'function' ? process.getuid() : -1;
const ownDirW = (d) => { try { const st = fs.statSync(d); fs.accessSync(d, fs.constants.W_OK); return st.isDirectory() && st.uid === UID; } catch { return false; } };
const LOCKROOT = ownDirW(`/run/user/${UID}`) ? `/run/user/${UID}` : `/tmp/vibespace-${UID}`;
/** The lock file a launcher names for a state dir: <root>/<prefix><sha1(realpath)[0,12]>.lock */
const lockPathOf = (st, dir = LOCKROOT) => path.join(dir, `${M.INSTALL_LOCK_PREFIX}${require('crypto').createHash('sha1').update(fs.realpathSync(st)).digest('hex').slice(0, 12)}.lock`);
const extraCleanup = []; // paths outside root a leg created (the fake-uid /tmp/vibespace-<n> dirs) — removed at exit too
/** Every lock this suite's launchers named: one per state dir under root (their names are the scratch realpaths' hashes,
 *  never production's) — removed at exit, the scratch tree with them. */
const reapLocks = () => {
  const walk = (d, depth) => {
    let ents; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of ents) { if (!e.isDirectory()) continue; const p = path.join(d, e.name); try { fs.rmSync(lockPathOf(p), { force: true }); } catch { } if (depth < 2) walk(p, depth + 1); }
  };
  walk(root, 0);
};
process.on('exit', () => { reapLocks(); for (const p of extraCleanup) { try { fs.rmSync(p, { recursive: true, force: true }); } catch { } } try { fs.rmSync(root, { recursive: true, force: true }); } catch { } });
const MUT = mutantCopies('dserve', REPO);
const quiet = { log() { }, warn() { }, error() { } };
/** A machine keeper on a FAKE display: every fact answers, nothing is spawned (the facts carry no picture server,
 *  so a launch is refused by name before anything starts). */
const fakeDisplay = { ...D, hostFacts: async () => ({ hostId: 'local', bins: {}, xpra: null }), binOnPath: () => null };
let seq = 0;
const machine = (extra = {}) => DS.install({ dataDir: path.join(root, `m${++seq}`), env: () => ({ PATH: '/usr/bin:/bin', HOME: root }), display: fakeDisplay, log: quiet, ...extra });

console.log('§1 the census');
const OPS = DS.DESKTOP_SERVE_OPS;
ok(Array.isArray(OPS) && Object.isFrozen(OPS) && JSON.stringify(OPS) === JSON.stringify(['facts', 'launch', 'stop', 'status', 'list', 'windows', 'fit', 'keep-alive', 'relaunch']), `the closed op set is the design's nine (${OPS.join(' ')})`);
const serveSrc = read('src/desktop-serve.js');
const runnerSrc = serveSrc.slice(serveSrc.indexOf('async function runDesktopServeOp('));
const handled = OPS.filter((op) => runnerSrc.includes(`op === '${op}'`) || (op === 'relaunch' && /\/\/ relaunch\n\s*return \{ ok: true, \.\.\.\(await ds\.relaunch\(/.test(runnerSrc)));
ok(handled.length === OPS.length, `the runner answers every table op BY NAME (${handled.length}/${OPS.length}: ${OPS.filter((o) => !handled.includes(o)).join(' ') || 'none missing'})`);
// every op answers something other than "unknown op" on a real machine keeper
{
  const m = machine();
  const answers = {};
  for (const op of OPS) { const r = await DS.runDesktopServeOp(m, op, {}); answers[op] = r.ok ? 'ok' : r.code; }
  ok(Object.values(answers).every((a) => a === 'ok' || a === 'bad-request') && answers.facts === 'ok' && answers.list === 'ok' && answers.status === 'ok' && !Object.entries(answers).some(([op, a]) => a === 'bad-request' && ['facts', 'list', 'status'].includes(op)), `each op is DISPATCHED (facts/list/status answer ok, the id-bound ones ask for their id): ${JSON.stringify(answers)}`);
  const unk = await DS.runDesktopServeOp(m, 'shell', {});
  ok(unk.ok === false && unk.code === 'bad-request' && /unknown desktop-serve op "shell"/.test(unk.error), 'an op outside the table is refused BY NAME', unk);
  m.shutdown();
}
// CONTROL: a runner copy that lost the `fit` branch answers `fit` with the relaunch fall-through — the by-name census above catches that copy
{
  const from = "    if (op === 'fit') {";
  ok(serveSrc.split(from).length === 2, 'CONTROL setup: the fit branch is spelled once');
  const cut = serveSrc.replace(from, "    if (false) {");
  const cutRunner = cut.slice(cut.indexOf('async function runDesktopServeOp('));
  ok(!cutRunner.includes("op === 'fit'"), 'CONTROL: the census\'s by-name rule reddens a runner that stopped naming an op of its table');
}
// every literal op a src/ caller passes is in the table (callers join in lane C2 — the rule is in force now)
{
  const files = [];
  (function walk(d) { for (const e of fs.readdirSync(path.join(REPO, d))) { const p = d + '/' + e; if (fs.statSync(path.join(REPO, p)).isDirectory()) walk(p); else if (/\.(js|mjs|cjs)$/.test(e)) files.push(p); } })('src');
  const RE = /(?:\bdesktopServe|\bdesktopAccess\.call)\(\s*(?:[\w.]+,\s*)?'([\w-]+)'/g;
  const RE_ACC = /\.call\(\s*[\w.]+,\s*'([\w-]+)'/g; // a file that requires the desktop access layer: every `.call(host, '<op>'`
  const sites = [];
  for (const f of files) {
    const t = read(f);
    for (const m of t.matchAll(RE)) sites.push([f, m[1]]);
    if (/require\([^)]*desktop-access[^)]*\)/.test(t) && f !== 'src/server/desktop-access.js') for (const m of t.matchAll(RE_ACC)) sites.push([f, m[1]]);
  }
  const outside = sites.filter(([, op]) => !OPS.includes(op));
  ok(outside.length === 0, `every literal op a src/ caller names is in the table (${sites.length} site(s)${outside.length ? '; outside: ' + JSON.stringify(outside) : ''})`);
  const planted = "desktopAccess.call(h, 'shell-exec', {})";
  ok([...planted.matchAll(RE)].map((m) => m[1]).join() === 'shell-exec', 'CONTROL: the census pattern reads a planted caller\'s op (it would be refused)');
}

console.log('§2 every failure is {ok:false, code, error} — nothing throws across the wire');
{
  const m = machine();
  const cases = [
    ['stop without an id', 'stop', {}, 'bad-request'],
    ['status of a record this machine does not hold', 'status', { id: 'da-nope' }, 'not-found'],
    ['windows of an unknown id', 'windows', { id: 'da-nope' }, 'not-found'],
    ['keep-alive of an unknown id', 'keep-alive', { id: 'da-nope' }, 'not-found'],
    ['relaunch of an unknown id', 'relaunch', { id: 'da-nope', body: { scale: 2 } }, 'not-found'],
    ['an id that is not a desktop-app id', 'stop', { id: '../../etc' }, 'bad-request'],
    ['launch without a body', 'launch', {}, 'bad-request'],
    ['launch of a request the model refuses', 'launch', { body: { exec: '' } }, null],
    ['launch of an exec not on this machine', 'launch', { body: { exec: 'surely-not-a-binary-xyz', label: 'x' } }, null],
  ];
  for (const [what, op, params, code] of cases) {
    let r, threw = null;
    try { r = await DS.runDesktopServeOp(m, op, params); } catch (e) { threw = e; }
    ok(!threw && r && r.ok === false && typeof r.code === 'string' && r.code && typeof r.error === 'string' && r.error && (!code || r.code === code), `${what} ⇒ {ok:false, code: ${r && r.code}}${code ? '' : ' (the model\'s own code)'}`, threw ? String(threw) : r);
  }
  // a record this machine DOES hold — fit's size is validated, a real status answers
  m._store().apps['da-held'] = { id: 'da-held', label: 'held', state: 'exited', backend: 'xpra', pids: {}, starts: {}, startedAt: 1, hostId: 'local' };
  const f1 = await DS.runDesktopServeOp(m, 'fit', { id: 'da-held', w: -3, h: 'x' });
  ok(f1.ok === false && f1.code === 'bad-request', 'fit with a bad w×h ⇒ bad-request', f1);
  const s1 = await DS.runDesktopServeOp(m, 'status', { id: 'da-held' });
  ok(s1.ok === true && s1.app && s1.app.id === 'da-held' && s1.sample === null, 'status of a held record answers its machine view (+ no sample yet)', s1);
  const w1 = await DS.runDesktopServeOp(m, 'windows', { id: 'da-held' });
  ok(w1.ok === false && w1.code === 'no_windows' && Array.isArray(w1.windows), 'windows of an ended record ⇒ {ok:false, code: no_windows}', w1);
  m.shutdown();
  // a method that THROWS (a future bug) is still an object on the wire
  const boom = { launch: () => { throw new Error('kaboom'); }, get: () => null };
  const b1 = await DS.runDesktopServeOp(boom, 'launch', { body: {} });
  ok(b1.ok === false && b1.code === 'op_failed' && b1.error === 'kaboom', 'a method that throws without a code ⇒ {ok:false, code: op_failed} (the throw never crosses the wire)', b1);
  const n1 = await DS.runDesktopServeOp(null, 'facts', {});
  ok(n1.ok === false && n1.code === 'host_unavailable', 'no machine keeper installed ⇒ host_unavailable by name', n1);
  // CONTROL: the runner without its catch REJECTS on the same throw (the daemon would relay an error string, not the op's shape)
  const from = "  } catch (e) {\n    return { ok: false, code: (e && e.code) || 'op_failed', error: String((e && e.message) || e) };\n  }";
  ok(serveSrc.split(from).length === 2, 'CONTROL setup: the runner\'s catch is spelled once');
  const Mc = MUT.load('src/desktop-serve.js', serveSrc.replace(from, "  } finally { /* pre-fix CONTROL: no catch */ }"), 'nocatch');
  const rej = await Mc.runDesktopServeOp(boom, 'launch', { body: {} }).then(() => null, (e) => e.message);
  ok(rej === 'kaboom', 'CONTROL: without the catch the same throw REJECTS the runner (a throw across the wire)', rej);
}

console.log('§3 the daemon wiring (three-touch rule) and the SHARED tier');
{
  const ag = read('src/agentd/agentd.js'), cl = read('src/agentd/client.js');
  const caps = /capabilities: \[([^\]]*)\]/.exec(ag);
  ok(caps && /'desktop-serve'/.test(caps[1]), 'the hello-ack names the `desktop-serve` capability');
  const h = ag.slice(ag.indexOf("if (msg.op === 'desktop-serve') {"), ag.indexOf("if (msg.op === 'desktop-serve') {") + 1600);
  ok(h.length > 100 && /require\('\.\/\.\.\/desktop-serve\.js'\)/.test(h) && /runDesktopServeOp\(await desktopServe\(\)/.test(h), 'the handler requires the SHARED module (bundled) and runs its runner against the process\'s ONE machine keeper');
  ok((h.match(/mux\.control\(\{ op: 'desktop-serve-result', id: msg\.id, (result: r|error: String\(e\.message \|\| e\)) \}\)/g) || []).length === 2, 'both arms reply `desktop-serve-result` with the request id (touch 1: the op rides the reply)');
  ok(/^let dsKeeper = null;$/m.test(ag) && /if \(dsKeeper\) return dsReady;/.test(ag) && !/this\._?dsKeeper|this\.dsKeeper/.test(ag), 'ONE machine keeper per daemon PROCESS (module-level, never on `this` = the connection)');
  ok(/dsKeeper\.adoptAll\(\)[\s\S]{0,160}dsKeeper\.start\(\)/.test(ag) && /isLiveState\(r\.state\)\)\) desktopServe\(\);/.test(ag), 'the daemon adopts before its tick, and re-adopts at BOOT when its record holds a live session');
  const route = /if \(m\.op === 'fs-result'[^\n]*\) \{/.exec(cl);
  ok(route && route[0].includes("m.op === 'desktop-serve-result'"), 'the client\'s id-keyed routing set carries desktop-serve-result (a reply outside it would never resolve)');
  const meth = cl.slice(cl.indexOf('async desktopServe('), cl.indexOf('async desktopServe(') + 600);
  ok(/capabilities\?\.includes\?\.\('desktop-serve'\)/.test(meth) && /e\.code = 'host_needs_daemon'; throw e;/.test(meth) && meth.indexOf("includes?.('desktop-serve')") < meth.indexOf('_request('), 'client.desktopServe asks ONLY a daemon that advertises it — otherwise host_needs_daemon, before any request (an unknown op HANGS)');
  const reqs = [...serveSrc.matchAll(/require\('([^']+)'\)/g)].map((m) => m[1]);
  ok(reqs.every((r) => ['fs', 'os', 'path', './desktop-apps', './keeper-limits', './desktop-display'].includes(r)), `the SHARED module requires only builtins + the PURE model + the machine facts (${reqs.join(' ')}) — never src/server`);
  const bundle = path.join(REPO, 'data/bin/vibespace-agentd.js');
  if (fs.existsSync(bundle)) { const b = read('data/bin/vibespace-agentd.js'); ok(/capabilities: \[[^\]]*["']desktop-serve["'][^\]]*\]/.test(b) && /function runDesktopServeOp/.test(b), 'the BUILT daemon bundle carries the capability and the runner (npm run build:agentd)'); }
}

console.log('§4 the local rung is the hub keeper\'s own machine; desktop-access over fakes');
{
  const dataDir = path.join(root, 'hub'); fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'desktop-apps.json'), JSON.stringify({ apps: { 'da-old': { id: 'da-old', label: 'old', state: 'exited', backend: 'xpra', pids: {}, starts: {}, startedAt: 1 } } }));
  const k = K.create({ dataDir, env: () => ({ PATH: '/usr/bin:/bin', HOME: root }), broadcast: () => { }, display: fakeDisplay, log: quiet });
  ok(k.machine && typeof k.machine.launch === 'function' && k._store() === k.machine._store(), 'the hub keeper holds device #0\'s machine keeper and ONE store with it');
  const acc = ACC.create({ hosts: null, local: () => k.machine, install: false, log: quiet });
  const st = await acc.call(null, 'status', { id: 'da-old' });
  ok(st.ok && st.app.id === 'da-old', 'access.call(null, …) runs the SAME object in-process (the record the keeper loaded)');
  ok((await acc.call('local', 'list', {})).apps.length === 1, '\'local\' is the local rung too');
  const e0 = await acc.call(null, 'stop', { id: 'da-nope' }).then(() => null, (e) => e);
  ok(e0 && e0.code === 'not-found' && /no desktop app da-nope/.test(e0.message), 'an op\'s own {ok:false} is THROWN hub-side with its code (one shape for every caller)', e0 && e0.code);
  const eOp = await acc.call(null, 'exec', {}).then(() => null, (e) => e);
  ok(eOp && eOp.code === 'bad-request', 'an op outside the table is refused before any transport is chosen');
  const eUnwired = await ACC.create({ install: false, log: quiet }).call(null, 'facts', {}).then(() => null, (e) => e);
  ok(eUnwired && eUnwired.code === 'host_unavailable', 'no local machine wired ⇒ host_unavailable (never a second keeper minted on the side)');
  k.shutdown();
  // a paired device (a fake DeviceManager) + a handle with no desktopServe (stand-in) + an unknown host
  const asked = [];
  const echo = net.createServer((s) => s.on('data', (b) => s.write(Buffer.concat([Buffer.from('dev:'), b]))));
  await new Promise((r) => echo.listen(0, '127.0.0.1', r));
  const devPort = echo.address().port;
  const fakeDm = {
    desktopServe: async (op, params) => { asked.push([op, params]); return op === 'stop' ? { ok: false, code: 'not-found', error: 'no desktop app da-x on this machine' } : { ok: true, op }; },
    tcpForward: async (port) => { const s = net.connect(port, '127.0.0.1'); const h = { onData: null, onClose: null, write: (b) => s.write(b), close: () => s.destroy() }; s.on('data', (b) => h.onData && h.onData(b)); s.on('close', () => h.onClose && h.onClose()); await new Promise((r) => s.once('connect', r)); return h; },
  };
  const hosts = { get: (h) => (['dev', 'ssh'].includes(h) ? { id: h } : null), isLocal: () => false, deviceBounded: async (h) => (h === 'dev' ? fakeDm : {}) };
  const acc2 = ACC.create({ hosts, local: () => null, install: false, log: quiet });
  const r1 = await acc2.call('dev', 'facts', { fresh: true });
  ok(r1.ok && asked.length === 1 && asked[0][0] === 'facts' && asked[0][1].fresh === true, 'a paired device is reached through dm.desktopServe(op, params) — the op and its params verbatim');
  const r2 = await acc2.call('dev', 'stop', { id: 'da-x' }).then(() => null, (e) => e);
  ok(r2 && r2.code === 'not-found', 'the device\'s {ok:false, code} is thrown with ITS code', r2 && r2.code);
  const t0 = Date.now();
  const r3 = await acc2.call('ssh', 'launch', { body: {} }).then(() => null, (e) => e);
  ok(r3 && r3.code === 'host_needs_daemon' && Date.now() - t0 < 1000 && asked.length === 2, 'a machine handle that cannot run desktop-serve (stand-in: no desktopServe method) ⇒ host_needs_daemon BY NAME within 1 s — nothing asked, nothing run locally', r3 && r3.message);
  const r4 = await acc2.call('elsewhere', 'facts', {}).then(() => null, (e) => e);
  ok(r4 && r4.code === 'unsupported-host', 'an unknown host ⇒ unsupported-host');
  const dmOld = { desktopServe: async () => { const e = new Error('daemon lacks desktop-serve (capabilities gate)'); e.code = 'host_needs_daemon'; throw e; } };
  const r5 = await ACC.create({ hosts: { ...hosts, deviceBounded: async () => dmOld }, install: false, log: quiet }).call('dev', 'facts', {}).then(() => null, (e) => e);
  ok(r5 && r5.code === 'host_needs_daemon', 'the client\'s capability refusal keeps its name through the access layer (never re-labelled host_unavailable)');
  // the picture forward: bytes both ways over the fake data plane, ref-counted
  const f1 = await acc2.forwardPort('dev', devPort);
  const f2 = await acc2.forwardPort('dev', devPort);
  ok(f1.localPort === f2.localPort && acc2.forwards().length === 1 && acc2.forwards()[0].refs === 2, 'ONE listener per (host, port), reference-counted (two viewers of one record)');
  const got = await new Promise((res) => { const s = net.connect(f1.localPort, '127.0.0.1', () => s.write('hello')); s.on('data', (b) => { res(b.toString()); s.destroy(); }); setTimeout(() => res(null), 2000); });
  ok(got === 'dev:hello', `bytes cross the forward both ways (${JSON.stringify(got)})`);
  ok(f1.close() === false && acc2.forwards().length === 1, 'releasing one reference keeps the listener for the other');
  ok(f2.close() === true && acc2.forwards().length === 0, 'the last reference closes it');
  const lf = await acc2.forwardPort(null, 4242);
  ok(lf.local === true && lf.localPort === 4242 && acc2.forwards().length === 0, 'THIS machine\'s port is not forwarded (it is already ours)');
  const fb = await acc2.forwardPort('dev', 70000).then(() => null, (e) => e);
  ok(fb && fb.code === 'bad-request', 'a bad port is refused by name');
  acc2.shutdown(); echo.close();
}

console.log('\n§5 the ssh rung over the REAL HostManager (no stand-in)');
{
  const { HostManager } = require(path.join(REPO, 'src/hosts.js'));
  const { DeviceManager } = require(path.join(REPO, 'src/agentd/client.js'));
  const BA = require(path.join(REPO, 'src/server/browser-access.js'));
  const hd = path.join(root, 'hosts'); fs.mkdirSync(hd, { recursive: true });
  fs.writeFileSync(path.join(hd, 'hosts.json'), JSON.stringify({ hosts: [{ id: 'ssh-box', name: 'ssh-box', transport: 'ssh', host: '127.0.0.1', user: 'nobody' }] }));
  let localTouched = 0;
  const localSpy = () => { localTouched++; return null; };
  const hmFor = (ensure) => { const hm = new HostManager({ dataDir: hd }); hm.agentdDeps = { ensureAgentdOnHost: ensure }; return hm; };
  // (a) the bootstrap fails (no node on the host) ⇒ host_unavailable naming the reason, fast
  const hmA = hmFor(async () => { throw new Error('remote node not found (install node on the host)'); });
  const t0 = Date.now();
  const ea = await ACC.create({ hosts: hmA, local: localSpy, install: false, log: quiet }).call('ssh-box', 'facts', {}).then(() => null, (e) => e);
  ok(ea && ea.code === 'host_unavailable' && /remote node not found/.test(ea.message) && Date.now() - t0 < 1000 && localTouched === 0, `an ssh host whose daemon bootstrap FAILS ⇒ host_unavailable naming the reason (${ea && ea.message}), the local keeper never touched`, ea && { code: ea.code, message: ea.message });
  // (b) the bootstrap never answers ⇒ host_unavailable at the connect deadline, never a hang
  const hmB = hmFor(() => new Promise(() => { }));
  const t1 = Date.now();
  const eb = await ACC.create({ hosts: hmB, local: localSpy, install: false, log: quiet, connectMs: 300 }).call('ssh-box', 'facts', {}).then(() => null, (e) => e);
  const msB = Date.now() - t1;
  ok(eb && eb.code === 'host_unavailable' && /not responding/.test(eb.message) && msB >= 250 && msB < 1500 && localTouched === 0, `an ssh host whose bootstrap never answers ⇒ host_unavailable at the connect deadline (${msB} ms for connectMs 300), never a hang, never local`, eb && { code: eb.code, message: eb.message });
  const fb = await ACC.create({ hosts: hmA, local: localSpy, install: false, log: quiet }).forwardPort('ssh-box', 1234).then(() => null, (e) => e);
  ok(fb && fb.code === 'host_unavailable', 'forwardPort to that host fails the same way, loud, before any listener', fb && fb.code);
  // (c) the real DeviceManager always HAS desktopServe (so desktop-access's "no desktopServe" arm is a belt for
  // stand-ins); host_needs_daemon on a real handle is the client's own capability gate, asserted in §3 and on a
  // real old daemon in test-desktop-remote §6
  ok(typeof DeviceManager.prototype.desktopServe === 'function' && typeof DeviceManager.prototype.browserServe === 'function', 'the real DeviceManager defines desktopServe (and browserServe) — host_needs_daemon on a real handle comes only from the capability gate');
  // (d) the precedent (browser-access) behaves identically on the real HostManager — documented, pinned
  const ec = await BA.create({ hosts: hmA, install: false, log: quiet }).call('ssh-box', 'version', {}).then(() => null, (e) => e);
  ok(ec && ec.code === 'host_unavailable' && /remote node not found/.test(ec.message), `browser-access (the precedent) on the same failing ssh bootstrap ⇒ host_unavailable too (${ec && ec.code})`, ec && { code: ec.code, message: ec.message });
}

console.log('§6 lane C2 — the install rung\'s PURE plan, the picker verdict, the facts op');
{
  const base = { platform: 'linux', apt: '/usr/bin/apt-get', distro: 'ubuntu', like: ['debian'], codename: 'noble', sudo: true, root: false };
  const pOld = M.xpraInstallPlan({ ...base, aptXpra: '3.1.5+dfsg-1ubuntu1' });
  ok(pOld.ok && pOld.source === 'xpra.org' && pOld.canRun && /Suites: noble/.test(pOld.script) && /Pin: version 6\.\*/.test(pOld.script) && /xpra\.org\/xpra\.asc/.test(pOld.script), 'apt offers xpra 3.1 (< 5) ⇒ the plan adds xpra.org\'s repository for the codename + its key, pinned 6.x (D6)', pOld);
  ok(JSON.stringify(pOld.packages) === JSON.stringify(['xpra', 'xterm', 'xdotool', 'xauth', 'xvfb', 'xpra-x11', 'xpra-html5']), 'xpra.org\'s split recommends (xpra-x11 = the X11 server half, xpra-html5 = the hosted client) are named explicitly', pOld.packages);
  ok(pOld.commands.length === 7 && pOld.commands.every((c) => c === 'xpra --version' || c.startsWith('sudo ')), 'the commands to copy are the same steps, each through sudo (the check stays unprivileged)', pOld.commands);
  const pNew = M.xpraInstallPlan({ ...base, aptXpra: '6.2.5+dfsg-1' });
  ok(pNew.ok && pNew.source === 'apt' && !/xpra\.org/.test(pNew.script) && JSON.stringify(pNew.packages) === JSON.stringify(['xpra', 'xterm', 'xdotool', 'xauth', 'xvfb']), 'apt offers xpra ≥ 5 ⇒ the machine\'s own sources, no repository added', pNew);
  const pHave = M.xpraInstallPlan({ ...base, aptXpra: '3.1.5', xpra: '6.5.3' });
  ok(pHave.ok && pHave.already && pHave.source === 'apt' && !pHave.packages.includes('xpra'), 'xpra ≥ 5 already installed ⇒ only the helpers (never a second xpra)', pHave.packages);
  ok(M.xpraInstallPlan({ platform: 'darwin' }).code === 'no_x11' && M.xpraInstallPlan({ platform: 'win32' }).code === 'no_x11', 'macOS / Windows ⇒ no_x11 BY NAME (no X11 server; nothing to install)');
  ok(M.xpraInstallPlan({ ...base, apt: null }).code === 'no_apt', 'Linux without apt-get ⇒ no_apt');
  ok(M.xpraInstallPlan({ ...base, aptXpra: '3.1', codename: 'no;ble' }).code === 'no_repo' && M.xpraInstallPlan({ ...base, aptXpra: null, distro: 'fedora', like: [] }).code === 'no_repo', 'a codename that does not match the codename shape (it is interpolated into a root shell line) or a non-Debian family ⇒ no_repo, never a script');
  ok(M.xpraInstallPlan(null).code === 'no_facts', 'no facts (an agent that predates them) ⇒ no_facts');
  const pNo = M.xpraInstallPlan({ ...base, aptXpra: '3.1', sudo: false });
  ok(pNo.ok && !pNo.canRun && pNo.code === 'no_sudo' && pNo.commands.length > 0, 'no passwordless sudo ⇒ the plan is still SHOWN (the commands to copy) and refused to run by name (no_sudo)', pNo.code);
  ok(JSON.stringify(M.installArgv(pOld).slice(0, 3)) === JSON.stringify(['sudo', '-n', 'sh']) && M.installArgv({ ...pOld, root: true })[0] === 'sh', 'the run argv: sudo -n sh -c <script> (never a password prompt), sh -c when already root');
  const R = (h) => M.machinePickRow(h);
  ok(R({ hostId: 'local' }).code === 'ready' && R({ hostId: 'a', connected: true, capabilities: ['desktop-serve'], platform: 'linux' }).code === 'ready'
    && R({ hostId: 'a', connected: true, capabilities: ['sysinfo'], platform: 'linux' }).code === 'host_needs_daemon' && !R({ hostId: 'a', connected: true, capabilities: [], platform: 'linux' }).selectable
    && R({ hostId: 'a', connected: true, capabilities: ['desktop-serve'], platform: 'darwin' }).code === 'no_x11'
    && R({ hostId: 'a', transport: 'dial', link: 'offline' }).code === 'offline' && R({ hostId: 'a', transport: 'ssh', link: 'unknown' }).code === 'connect',
  'the picker verdict: this machine / a capable Linux agent ready; an agent without the capability host_needs_daemon; macOS no_x11; a dial device not dialed in offline; an unconnected ssh machine connect');
  // the facts op answers the install facts only when asked
  const fd = { ...fakeDisplay, installFacts: async () => ({ platform: 'linux', apt: '/usr/bin/apt-get', aptXpra: '3.1', distro: 'debian', codename: 'bookworm', sudo: false }) };
  const m6 = machine({ display: fd });
  const f0 = await DS.runDesktopServeOp(m6, 'facts', {});
  const f1 = await DS.runDesktopServeOp(m6, 'facts', { install: true });
  ok(f0.ok && !('install' in f0) && f1.ok && f1.install && f1.install.codename === 'bookworm', 'facts {install:true} carries the install facts; a plain facts does not (the probe spawns — asked only by the install step)', f1);
  const realF = await D.installFacts({ osRelease: path.join(root, 'no-such-os-release') });
  ok(realF && realF.platform === process.platform && realF.distro === null && typeof realF.sudo === 'boolean', 'installFacts on this machine answers every field (an unreadable os-release is null, never a guess)', realF);
  // THE sudo PROBE ITSELF (C2 verify finding 5): installFacts asks `sudo -n true` — a fake sudo on a scratch PATH
  // answers it (exit 0 ⇒ true, exit 1 ⇒ false, none on PATH ⇒ false); each fake stamps its argv, so the answer is
  // PROVEN to come from the probe and not from a constant. CONTROL: a copy that sets sudo:true without probing.
  const probeSudo = async (Dm, mode) => {
    const bin = path.join(root, `fakesudo-${mode}-${++seq}`); fs.mkdirSync(bin, { recursive: true });
    const stamp = path.join(bin, 'argv');
    if (mode !== 'absent') fs.writeFileSync(path.join(bin, 'sudo'), `#!/bin/sh\nprintf '%s' "$*" > '${stamp}'\nexit ${mode === 'yes' ? 0 : 1}\n`, { mode: 0o755 });
    Dm.resetBinMemo();
    const f = await Dm.installFacts({ env: { PATH: bin, HOME: root }, osRelease: path.join(root, 'no-such-os-release') });
    Dm.resetBinMemo();
    let argv = null; try { argv = fs.readFileSync(stamp, 'utf8').trim(); } catch { /* never probed */ }
    return { sudo: f.sudo, root: f.root, argv };
  };
  if (process.platform !== 'linux' || (typeof process.getuid === 'function' && process.getuid() === 0)) console.log(`  - SKIP the sudo probe legs: ${process.platform !== 'linux' ? 'not Linux (installFacts stops before the probe)' : 'running as root (root never asks sudo)'}`);
  else {
    const yes = await probeSudo(D, 'yes'), no = await probeSudo(D, 'no'), absent = await probeSudo(D, 'absent');
    ok(yes.sudo === true && yes.argv === '-n true', 'installFacts PROBES sudo: a sudo that answers `sudo -n true` with 0 ⇒ sudo:true (the fake saw exactly `-n true` — never a password prompt)', yes);
    ok(no.sudo === false && no.argv === '-n true', 'a sudo that wants a password (`sudo -n true` exits 1) ⇒ sudo:false — the plan is then refused no_sudo', no);
    ok(absent.sudo === false && absent.argv === null, 'no sudo on PATH ⇒ sudo:false, nothing spawned', absent);
    const dSrc = read('src/desktop-display.js');
    const probeLine = "  if (!out.root && binOnPath('sudo', { env })) { const r = await run('sudo', ['-n', 'true'], { env, timeout: 4000 }); out.sudo = !r.err; }";
    ok(dSrc.split(probeLine).length === 2, 'CONTROL setup: the probe line is spelled once');
    const Dmut = MUT.load('src/desktop-display.js', dSrc.replace(probeLine, '  out.sudo = true; /* CONTROL: no probe */'), 'nosudoprobe');
    const mNo = await probeSudo(Dmut, 'no');
    ok(mNo.sudo === true && mNo.argv === null, 'CONTROL: a copy that claims sudo without probing answers sudo:true for the sudo that wants a password — the leg above reddens it', mNo);
  }
}

console.log('§7 lane C2 — the hub REGISTRY of a paired machine\'s apps (a stub device behind the access layer)');
{
  // an in-memory DEVICE: records by id, the op shapes of runDesktopServeOp
  const mkDevice = () => {
    const apps = {}; const calls = [];
    let n = 0; let online = true; let samples = {};
    const dev = {
      calls, apps, set online(v) { online = v; }, get online() { return online; }, setSample(id, s) { samples[id] = s; },
      async call(hostId, op, p = {}) {
        calls.push({ hostId, op, p });
        if (hostId === 'gone') { const e = new Error('"gone" is not a paired machine'); e.code = 'unsupported-host'; throw e; }
        if (!online) { const e = new Error('device link not responding within 8s'); e.code = 'host_unavailable'; throw e; }
        if (op === 'list') return { ok: true, apps: Object.values(apps), registry: [{ id: 'xterm', label: 'XTerm', available: true }], availability: { backend: 'xpra', stream: 'xpra', xpra: { version: '6.5.3', www: '/usr/share/xpra/www' } }, cap: { used: 0, cap: 6 }, idleTimeoutMin: 0 };
        if (op === 'status') return { ok: true, apps: Object.values(apps), samples };
        if (op === 'launch') { const id = `da-dev${++n}`; apps[id] = { id, label: p.body.exec || p.body.appId, state: 'launching', startedAt: Date.now() + n, backend: 'xpra', stream: 'xpra', port: null, pids: {}, starts: {}, idleTimeoutMs: Number(p.settings && p.settings['desktop.idleTimeoutMin']) * 60000 || 0, lastInputAt: Date.now(), hostId: 'local' }; return { ok: true, app: { ...apps[id] } }; }
        if (op === 'stop') { const a = apps[p.id]; if (!a) { const e = new Error('no'); e.code = 'not-found'; throw e; } a.state = 'exited'; a.stoppedBy = p.why; return { ok: true, app: { ...a } }; }
        if (op === 'keep-alive') { apps[p.id].idleTimeoutMs = 0; return { ok: true, app: { ...apps[p.id] } }; }
        if (op === 'windows') return { ok: true, windows: [{ id: 1, title: 'remote term', cls: 'XTerm', w: 400, h: 300 }] };
        if (op === 'fit') return { ok: true, fit: { scheduled: true } };
        if (op === 'relaunch') { const old = apps[p.id]; const id = `da-dev${++n}`; apps[id] = { ...old, id, state: 'launching', startedAt: Date.now() + n }; old.state = 'exited'; old.stoppedBy = 'relaunch'; old.replacedBy = id; return { ok: true, app: { ...apps[id] }, replaced: { ...old } }; }
        return { ok: true };
      },
    };
    return dev;
  };
  const dev = mkDevice();
  const bc = [];
  const notices = [];
  const settings = { 'desktop.idleTimeoutMin': 0 };
  const kdir = path.join(root, 'hubk'); fs.mkdirSync(kdir, { recursive: true });
  const mkKeeper = (over = {}) => K.create({ dataDir: kdir, env: () => ({ PATH: '/usr/bin:/bin', HOME: root }), broadcast: (m) => bc.push(m), serverSetting: (k) => settings[k], display: fakeDisplay, log: quiet, serverNotice: (...a) => { notices.push(a); return 1; },
    access: () => ({ call: (...a) => dev.call(...a) }), hostLabel: (h) => (h === 'dev-a' ? 'Lab box' : h), remoteHosts: () => ['dev-a'], ...over });
  const k = mkKeeper();
  const before = k.listApps();
  ok(Array.isArray(before) && before.length === 0 && !fs.existsSync(path.join(kdir, K.REMOTE_FILE)), 'no paired machine asked yet ⇒ the registry is this machine\'s alone (no remote file written)');
  const L = await k.launch({ exec: 'xterm' }, { host: 'dev-a' });
  const lc = dev.calls.find((c) => c.op === 'launch');
  ok(L && L.hostId === 'dev-a' && L.hostLabel === 'Lab box' && L.state === 'launching' && lc && lc.hostId === 'dev-a' && lc.p.settings && 'desktop.idleTimeoutMin' in lc.p.settings && !('host' in lc.p.body), 'a launch with host runs THERE (the op, the hub\'s settings carried, `host` never in the app\'s body) and answers the record re-labelled with the hub\'s host id + label', L);
  ok(k.get(L.id) && k.get(L.id).hostId === 'dev-a' && k.listApps().some((a) => a.id === L.id) && bc.some((m) => m.type === 'desktop-apps-updated' && m.apps.some((a) => a.id === L.id && a.hostLabel === 'Lab box')), 'get / listApps / the broadcast carry the paired machine\'s record');
  ok(k.streamTarget(L.id) === null, 'no stream target while it is launching');
  dev.apps[L.id].state = 'ready'; dev.apps[L.id].port = 14500;
  await k.syncHost('dev-a');
  const st = k.streamTarget(L.id);
  ok(st && st.kind === 'xpra' && st.port === 14500 && st.hostId === 'dev-a', 'ready on the device ⇒ the stream target names the DEVICE\'s port and its host (the bridge forwards it)', st);
  const onDisk = JSON.parse(fs.readFileSync(path.join(kdir, K.REMOTE_FILE), 'utf8'));
  ok(onDisk.hosts['dev-a'] && onDisk.hosts['dev-a'].apps[L.id] && onDisk.hosts['dev-a'].apps[L.id].hostId === 'local' && !(fs.existsSync(path.join(kdir, DS.STORE_FILE)) && fs.readFileSync(path.join(kdir, DS.STORE_FILE), 'utf8').includes(L.id)), `the hub keeps what it saw in ${K.REMOTE_FILE} (the device's own view, hostId 'local' = D8) — never in this machine's store (it would be judged by this machine's pids)`);
  // windows / fit / keep-alive / noteInput through the op
  const w = await k.windows(L.id);
  ok(w.ok && w.windows[0].title === 'remote term', 'windows(id) of a paired machine\'s app answers through the op');
  k.noteDesktopSize(L.id, 800, 600); await new Promise((r) => setTimeout(r, 10));
  ok(dev.calls.some((c) => c.op === 'fit' && c.p.id === L.id && c.p.w === 800 && c.p.h === 600), 'a client\'s desktop size reaches the device as the fit op');
  const ka = await k.keepAlive(L.id);
  ok(ka && ka.idleTimeoutMs === 0 && ka.hostId === 'dev-a', 'keep-alive through the op');
  // the IDLE verdict is the hub's: a device never sees the input
  settings['desktop.idleTimeoutMin'] = 1;
  const L2 = await k.launch({ exec: 'xclock' }, { host: 'dev-a' });
  dev.apps[L2.id].state = 'ready'; dev.apps[L2.id].port = 14501; dev.apps[L2.id].idleTimeoutMs = 60000; dev.apps[L2.id].lastInputAt = Date.now() - 120000;
  k.noteInput(L2.id);
  await k.syncHost('dev-a');
  ok(!dev.calls.some((c) => c.op === 'stop' && c.p.id === L2.id), 'input the BRIDGE reported (hub-side) keeps a remote app from the idle stop the device\'s stale lastInputAt would call');
  ok(JSON.parse(fs.readFileSync(path.join(kdir, K.REMOTE_FILE), 'utf8')).hosts['dev-a'].hub[L2.id].lastInputAt > Date.now() - 5000, 'the hub-side input row is persisted with the registry (a hub restart does not forget it)');
  const k2 = mkKeeper(); // a fresh hub over the same registry file — the hub-side input row IS persisted, so clear it: no input since
  delete k2._remote().hosts['dev-a'].hub[L2.id];
  dev.apps[L2.id].lastInputAt = Date.now() - 120000;
  await k2.syncHost('dev-a');
  await new Promise((r) => setTimeout(r, 20));
  ok(dev.calls.some((c) => c.op === 'stop' && c.p.id === L2.id && c.p.why === 'idle'), 'no input past the timeout ⇒ the hub stops it THROUGH the op, why idle (the verdict is the hub\'s, the act the device\'s)');
  settings['desktop.idleTimeoutMin'] = 0;
  // the resource REPORT judges the device's own sample (report only)
  const big = { memBytes: 64 * 1024 ** 3, memMetric: 'pss', cpuTicks: 0, pids: 3 };
  dev.setSample(L.id, { at: Date.now(), pids: 3, sample: big });
  await k.syncHost('dev-a');
  const lv = k.get(L.id).live;
  ok(lv && lv.over && notices.length === 1 && !dev.calls.some((c) => c.op === 'stop' && c.p.id === L.id), `the device's sample is judged by the hub's ONE verdict (${lv && lv.over}) — reported (one notice), never stopped`, { lv, notices: notices.length });
  await k.syncHost('dev-a');
  ok(notices.length === 1, 'the same sample is judged once (its instant), never re-reported per tick');
  // the machine stops answering ⇒ the records are KEPT, shown as unknown-host-offline
  dev.online = false;
  await k.syncHost('dev-a');
  const off = k.get(L.id);
  ok(off && off.state === 'unknown-host-offline' && off.lastKnownState === 'ready' && /not responding/.test(off.hostError || '') && k.streamTarget(L.id) === null, 'the machine stops answering ⇒ its live record is KEPT and shown as unknown-host-offline (never exited — the app may run on), no stream target', off && { state: off.state, lastKnownState: off.lastKnownState });
  const restarted = mkKeeper();
  ok(restarted.get(L.id) && restarted.get(L.id).hostId === 'dev-a', 'a hub restart keeps the registry (the remote file) — the record is there before the machine is asked');
  await restarted.adoptRemote();
  ok(restarted.get(L.id).state === 'unknown-host-offline', 'boot adoption: a machine that does not answer keeps its records, offline');
  dev.online = true;
  await restarted.adoptRemote();
  ok(restarted.get(L.id).state === 'ready' && restarted.streamTarget(L.id).port === 14500, 'the machine answers again ⇒ `list` adopts its records by host + id: ready, the stream target back');
  // relaunch through the op carries the successor
  const rl = await k.relaunch(L.id, { scale: 2 });
  ok(rl.app && rl.app.hostId === 'dev-a' && rl.replaced && rl.replaced.state === 'exited' && rl.replaced.replacedBy === rl.app.id, 'relaunch of a paired machine\'s app = the device\'s ONE relaunch (the op); the successor and the replaced record both re-labelled', rl && { app: rl.app && rl.app.id, replaced: rl.replaced && rl.replaced.state });
  // stop through the op
  const sp = await k.stop(rl.app.id, { why: 'user' });
  ok(sp && sp.state === 'exited' && sp.hostId === 'dev-a', 'stop through the op answers the device\'s verdict');
  // the machine was removed from the instance ⇒ its records go
  const kg = mkKeeper();
  await kg.launch({ exec: 'xterm' }, { host: 'dev-a' }).then(() => { });
  kg._remote().hosts.gone = { apps: { 'da-ghost': { id: 'da-ghost', state: 'ready', startedAt: 1, hostId: 'local', pids: {}, starts: {} } }, hub: {}, online: true };
  await kg.syncHost('gone');
  ok(!kg.get('da-ghost') && !kg._remote().hosts.gone, 'a machine no longer on this instance (unsupported-host) ⇒ its records are dropped (nothing to re-ask)');
  // the window-targets engine's world is this machine's
  ok(k.local && k.local.get(L.id) === null && !k.local.listApps().some((a) => a.id === L.id) && typeof k.local.launch === 'function', 'keeper.local (the window-targets engine\'s view) never answers a paired machine\'s record');
  // host id collision is refused by name
  const clash = mkKeeper({ access: () => ({ call: async (h, op) => (op === 'list' ? { ok: true, apps: [{ id: L.id, state: 'ready', startedAt: 2, pids: {}, starts: {} }], availability: null } : { ok: true, apps: [] }) }), remoteHosts: () => ['dev-b'] });
  await clash.adoptRemote();
  ok(clash.get(L.id).hostId === 'dev-a', 'a second machine answering an id the first holds is ignored by name (adoption is by host AND id)');
  // this machine's list is byte-identical when no paired machine holds a record
  const lonely = K.create({ dataDir: path.join(root, 'lonely'), env: () => ({ PATH: '/usr/bin:/bin', HOME: root }), broadcast: () => { }, display: fakeDisplay, log: quiet });
  const lm = await lonely.machine.list(); const lk = await lonely.list();
  ok(JSON.stringify(lm) === JSON.stringify(lk) && lonely.listApps === lonely.listApps && JSON.stringify(lonely.listApps()) === JSON.stringify(lonely.machine.listApps()), 'with no paired machine\'s record the hub\'s list IS the machine\'s own answer (local behaviour byte-identical)');
  const el = await K.create({ dataDir: path.join(root, 'noacc'), env: () => ({}), broadcast: () => { }, display: fakeDisplay, log: quiet }).launch({ exec: 'xterm' }, { host: 'dev-a' }).then(() => null, (e) => e);
  ok(el && el.code === 'host_unavailable', 'a keeper with no access layer refuses a remote launch by name (host_unavailable), never a local run');
  for (const x of [k, k2, restarted, kg, clash, lonely]) x.shutdown();
}

console.log('§8 lane C2 — the bridge\'s ONE change: streamEndpointFor');
{
  const S = require(path.join(REPO, 'src/server/desktop-stream.js'));
  const asked = [];
  const bridge = S.create({ auth: { requestAuthed: () => true }, resolveTarget: () => null, forwardPort: async (h, p) => { asked.push([h, p]); return { localPort: 40001, close: () => asked.push(['closed', h, p]) }; }, log: quiet });
  const loc = bridge.streamEndpointFor({ kind: 'xpra', port: 5000 });
  ok(loc && loc.local === true && loc.port === 5000 && typeof loc.then !== 'function' && asked.length === 0, 'this machine\'s target ⇒ 127.0.0.1:<its port>, synchronously, no forward (the pre-C2 path)');
  const rem = await bridge.streamEndpointFor({ kind: 'xpra', port: 5000, hostId: 'dev-a' });
  ok(rem && rem.port === 40001 && !rem.local && JSON.stringify(asked[0]) === JSON.stringify(['dev-a', 5000]), 'a paired machine\'s target ⇒ the hub forward\'s port (forwardPort(hostId, port))');
  rem.release(); rem.release();
  ok(asked.filter((a) => a[0] === 'closed').length === 1, 'the socket\'s reference is released exactly once');
  const none = S.create({ auth: { requestAuthed: () => true }, resolveTarget: () => null, log: quiet });
  const e = await none.streamEndpointFor({ kind: 'rfb', port: 1, hostId: 'dev-a' }).then(() => null, (x) => x);
  ok(e && e.code === 'host_unavailable', 'no forward wired ⇒ a remote target is refused by name (the upgrade answers 502), never a local connect to its port');
  // A VIEWER THAT GOES AWAY WHILE THE FORWARD RESOLVES (C2 verify finding 2): a half-close leaves the socket not yet
  // destroyed, and ws then drops the handshake WITHOUT its callback — the reference must still be released, once.
  // A real http server's upgrade + a raw TCP client (the tab closed during the 4–600 ms forward setup).
  const http = require('http');
  const racing = async (Sm, how) => {
    let refs = 0, rel = 0;
    const b = Sm.create({ auth: { requestAuthed: () => true }, resolveTarget: () => ({ kind: 'xpra', port: 1, hostId: 'host-x' }), forwardPort: () => new Promise((r) => { refs++; setTimeout(() => r({ localPort: 1, close: () => { rel++; } }), 250); }), log: quiet });
    const hs = http.createServer((q, r) => r.end());
    hs.on('upgrade', (req, sock, head) => b.handleUpgrade(req, sock, head, Sm.upgradeId(new URL(req.url, 'http://x').pathname)));
    await new Promise((r) => hs.listen(0, '127.0.0.1', r));
    const c = net.connect(hs.address().port, '127.0.0.1');
    c.on('error', () => { });
    await new Promise((r) => c.once('connect', r));
    c.write('GET /api/desktop/da-abc/stream?viewer=v1 HTTP/1.1\r\nHost: x\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Protocol: binary\r\n\r\n');
    await new Promise((r) => setTimeout(r, 40));
    // 'rst' (verify r2 F1): a RESET, not a FIN — the phone that switched networks, the killed browser. The process-level
    // trap is the witness: in the hub an unhandled socket 'error' is server.js's uncaughtException ⇒ process.exit(1)
    const uncaught = [];
    const trap = (e) => uncaught.push(String((e && (e.code || e.message)) || e));
    process.on('uncaughtException', trap);
    if (how === 'half') c.end(); else if (how === 'rst') c.resetAndDestroy(); else c.destroy();
    await new Promise((r) => setTimeout(r, 450));
    process.removeListener('uncaughtException', trap);
    c.destroy(); hs.close();
    return { refs, rel, uncaught };
  };
  const half = await racing(S, 'half'), gone = await racing(S, 'destroy'), rst = await racing(S, 'rst');
  ok(half.refs === 1 && half.rel === 1 && !half.uncaught.length, `a viewer that HALF-CLOSES while the forward resolves ⇒ its reference is released exactly once (refs ${half.refs}, releases ${half.rel})`, half);
  ok(gone.refs === 1 && gone.rel === 1 && !gone.uncaught.length, `a viewer that is GONE (destroyed) while the forward resolves ⇒ released exactly once (refs ${gone.refs}, releases ${gone.rel})`, gone);
  ok(rst.refs === 1 && rst.rel === 1 && rst.uncaught.length === 0, `a viewer whose connection RESETS while the forward resolves ⇒ no uncaught error (the hub lives: ${JSON.stringify(rst.uncaught)}), released exactly once (refs ${rst.refs}, releases ${rst.rel}) — verify r2 F1`, rst);
  const sSrc = read('src/server/desktop-stream.js');
  const fixA = "      socket.once('close', e.release);\n", fixB = '      if (socket.destroyed || !socket.readable || !socket.writable) { e.release(); try { socket.destroy(); } catch { /* gone */ } return; }';
  ok(sSrc.split(fixA).length === 2 && sSrc.split(fixB).length === 2, 'CONTROL setup: the two release guards are spelled once');
  const Smut = MUT.load('src/server/desktop-stream.js', sSrc.replace(fixA, '\n').replace(fixB, '      if (socket.destroyed) { e.release(); return; }'), 'halfclose');
  const mHalf = await racing(Smut, 'half');
  ok(mHalf.refs === 1 && mHalf.rel === 0, `CONTROL: the pre-fix bridge (release only on the ws close, a destroyed-only guard) LEAKS that reference (refs ${mHalf.refs}, releases ${mHalf.rel})`, mHalf);
  const fixP = "    socket.on('error', parkedError);\n", fixQ = "      socket.removeListener('error', parkedError); // ws attaches its own, synchronously, at the top of handleUpgrade\n";
  ok(sSrc.split(fixP).length === 2 && sSrc.split(fixQ).length === 2, 'CONTROL setup (F1): the parked socket\'s error listener is attached once and handed to ws once');
  const Srst = MUT.load('src/server/desktop-stream.js', sSrc.replace(fixP, '\n').replace(fixQ, '\n'), 'parkedrst');
  const mRst = await racing(Srst, 'rst');
  ok(mRst.uncaught.some((x) => /ECONNRESET/.test(x)), `CONTROL: the pre-fix bridge (no listener while parked) lets the reset escape as an uncaught ${JSON.stringify(mRst.uncaught)} — the hub's exit`, mRst);
  const src = read('src/server/desktop-stream.js');
  ok((src.match(/net\.connect\(port, '127\.0\.0\.1'\)/g) || []).length === 1 && (src.match(/new WebSocketClient\(`ws:\/\/127\.0\.0\.1:\$\{port\}\/`/g) || []).length === 1, 'the two upstream connects are unchanged — they take the endpoint\'s port (the protocol is end to end: seats, backpressure, pings, closes untouched)');
}

console.log('§9 lane C2 — the routes: host, the machine picker, the install rung (plan → NDJSON run)');
{
  const express = require('express');
  const R = require(path.join(REPO, 'src/routes/desktop-apps.js'));
  const seen = [];
  const plan = { ok: true, source: 'xpra.org', packages: ['xpra'], script: 'true', commands: ['sudo apt-get update'], canRun: true, code: null };
  const accStub = {
    machines: async () => [{ hostId: 'local', selectable: true, code: 'ready' }, { hostId: 'dev-a', label: 'Lab box', selectable: true, code: 'ready' }],
    installPlan: async (h) => { seen.push(['plan', h]); return { hostId: h, facts: {}, plan }; },
    installXpra: async (h, { onData }) => { seen.push(['install', h]); if (h === 'nosudo') { const e = new Error('no passwordless sudo'); e.code = 'no_sudo'; e.plan = { ...plan, canRun: false }; throw e; } onData(Buffer.from('+ apt-get update\nHit:1 x\n')); onData(Buffer.from('partial')); return { ok: true, hostId: h, plan, after: { xpra: '6.5.3' } }; },
  };
  const kStub = { list: async (o) => { seen.push(['list', o]); return { apps: [], availability: null }; }, launch: async (b, o) => { seen.push(['launch', b, o]); return { id: 'da-x', ...b }; }, facts: () => Promise.resolve() };
  R.setup({ keeper: kStub, access: accStub, vnc: {} });
  const appx = express(); appx.use(express.json()); appx.use(R.router);
  const srv = await new Promise((r) => { const s = appx.listen(0, '127.0.0.1', () => r(s)); });
  const base = `http://127.0.0.1:${srv.address().port}`;
  const j = async (u, o) => { const r = await fetch(base + u, o); return { status: r.status, body: await r.text() }; };
  await j('/api/desktop/apps');
  await j('/api/desktop/apps?host=dev-a');
  ok(JSON.stringify(seen[0]) === JSON.stringify(['list', undefined]) && JSON.stringify(seen[1]) === JSON.stringify(['list', { host: 'dev-a' }]), 'GET /api/desktop/apps: no host = this machine exactly as before (list() with no argument); host=dev-a ⇒ list({host})', seen.slice(0, 2));
  const bad = await j('/api/desktop/apps?host=' + encodeURIComponent('a b/../c'));
  ok(bad.status === 400 && JSON.parse(bad.body).code === 'bad-request', 'a host that does not look like a host id ⇒ 400 bad-request');
  await j('/api/desktop/apps', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ exec: 'xterm', host: 'dev-a' }) });
  const ln = seen.find((x) => x[0] === 'launch');
  ok(ln && !('host' in ln[1]) && ln[2] && ln[2].host === 'dev-a', 'POST with host ⇒ launch(body without host, {host})', ln);
  const mc = await j('/api/desktop/machines');
  ok(mc.status === 200 && JSON.parse(mc.body).machines.length === 2, 'GET /api/desktop/machines answers the picker rows');
  const pl = await j('/api/desktop/install-plan?host=dev-a');
  ok(pl.status === 200 && JSON.parse(pl.body).plan.source === 'xpra.org', 'GET /api/desktop/install-plan answers the plan (shown before anything runs)');
  const ins = await j('/api/desktop/install-xpra', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ host: 'dev-a' }) });
  const lines = ins.body.trim().split('\n').map((l) => JSON.parse(l));
  ok(ins.status === 200 && lines[0].log === '+ apt-get update' && lines[1].log === 'Hit:1 x' && lines[2].log === 'partial' && lines[3].done === true && lines[3].installed === '6.5.3', 'POST /api/desktop/install-xpra streams the log line by line (NDJSON), a partial tail flushed, then ONE done', lines);
  const ns = await j('/api/desktop/install-xpra', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ host: 'nosudo' }) });
  const nl = ns.body.trim().split('\n').map((l) => JSON.parse(l));
  ok(nl.length === 1 && nl[0].code === 'no_sudo' && nl[0].plan && nl[0].plan.commands.length === 1, 'no passwordless sudo ⇒ ONE error line by name, carrying the plan (the commands to copy)', nl);
  // (verify r2 F3/F4) a live install on the machine is RE-ATTACHED: the dialog is told first, then its log
  const realInstall = accStub.installXpra;
  accStub.installXpra = async (h, o) => { if (h !== 'dev-re') return realInstall(h, o); o.onReattach({ pid: 4242, since: 7 }); o.onData(Buffer.from('+ apt-get install -y xpra\nSetting up xpra\n')); return { ok: true, hostId: h, plan, after: { xpra: '6.5.3' }, reattached: true }; };
  const ra = await j('/api/desktop/install-xpra', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ host: 'dev-re' }) });
  const rl9 = ra.body.trim().split('\n').map((l) => JSON.parse(l));
  ok(ra.status === 200 && rl9[0].reattached === true && rl9[0].pid === 4242 && rl9[0].since === 7 && rl9[1].log === '+ apt-get install -y xpra' && rl9[rl9.length - 1].done === true && rl9[rl9.length - 1].reattached === true, 'a re-attached install: the FIRST line says so ({reattached, pid, since}), then its log, then done (reattached)', rl9);
  accStub.installXpra = realInstall;
  accStub.installBusy = (h) => (h === 'dev-busy' ? { since: 1, running: true } : null);
  const bz = await j('/api/desktop/install-xpra', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ host: 'dev-busy' }) });
  ok(bz.status === 409 && JSON.parse(bz.body).code === 'busy' && !seen.some((x) => x[0] === 'install' && x[1] === 'dev-busy'), 'a machine whose install slot is held (the access layer\'s, kept past a timed-out run) ⇒ 409 busy BEFORE the stream starts, nothing run', bz);
  srv.close();
}

console.log('§10 lane C2 — desktop-access: the picker rows (no connect ladder), the install run on both transports');
{
  const connects = [];
  const mkDm = (caps, platform = 'linux') => ({ status: () => ({ connected: true, info: { capabilities: caps, platform } }), desktopServe: async () => ({ ok: true }), runStream: async (cmd, args, { onData }) => { connects.push(['run', cmd, args]); onData(Buffer.from('ran\n')); return { code: 0 }; } });
  const hostsStub = {
    list: () => [{ id: 'dial-on', name: 'Dial on', transport: 'dial', online: true }, { id: 'dial-off', name: 'Dial off', transport: 'dial', online: false }, { id: 'ssh-cold', name: 'ssh cold', transport: 'ssh' }, { id: 'old', name: 'Old', transport: 'dial', online: true }, { id: 'mac', name: 'Mac', transport: 'dial', online: true }],
    linkState: (id) => (id === 'dial-off' ? 'offline' : id === 'ssh-cold' ? 'unknown' : 'online'),
    connectedDevice: () => null,
    get: (id) => ({ id }),
    deviceBounded: async (id) => { connects.push(['connect', id]); if (id === 'dial-on') return mkDm(['desktop-serve']); if (id === 'old') return mkDm(['sysinfo']); if (id === 'mac') return mkDm(['desktop-serve'], 'darwin'); throw new Error('should not connect ' + id); },
  };
  const a = ACC.create({ hosts: hostsStub, local: () => null, install: false, log: quiet });
  const rows = await a.machines();
  const by = Object.fromEntries(rows.map((r) => [r.hostId, r]));
  ok(rows[0].hostId === 'local' && by['dial-on'].code === 'ready' && by['dial-off'].code === 'offline' && by['ssh-cold'].code === 'connect' && by.old.code === 'host_needs_daemon' && by.mac.code === 'no_x11' && by['dial-on'].label === 'Dial on', 'machines(): this machine first; a dialed-in capable agent ready; offline / connect / host_needs_daemon / no_x11 by code', rows.map((r) => [r.hostId, r.code]));
  ok(!connects.some((c) => c[0] === 'connect' && (c[1] === 'ssh-cold' || c[1] === 'dial-off')), 'drawing the picker never starts a connect ladder to an ssh machine or an offline device', connects);
  // the install rung over a paired machine: the plan decides, run-stream carries the SAME argv
  let factsCalls = 0;
  const devHosts = { ...hostsStub, deviceBounded: async () => ({ ...mkDm(['desktop-serve']), desktopServe: async (op, p) => { factsCalls++; return { ok: true, facts: {}, install: { platform: 'linux', apt: '/usr/bin/apt-get', aptXpra: factsCalls > 1 ? '6.5.3' : '3.1.5', distro: 'ubuntu', like: ['debian'], codename: 'noble', sudo: true, xpra: factsCalls > 1 ? '6.5.3' : null } }; } }) };
  const a2 = ACC.create({ hosts: devHosts, local: () => null, install: false, log: quiet });
  const got = [];
  const r = await a2.installXpra('dial-on', { onData: (d) => got.push(String(d)) });
  const run = connects.find((c) => c[0] === 'run');
  ok(r.ok && r.after.xpra === '6.5.3' && run && run[1] === 'sh' && run[2][0] === '-c' && run[2].includes('sudo') && run[2].includes('-n') && run[2].some((x) => /Suites: noble/.test(x)) && got.join('').includes('ran'), 'installXpra on a paired machine: facts → plan → `sudo -n sh -c <plan>` through run-stream (stderr folded in), the log streamed, the facts re-read', { run: run && run.slice(0, 2), after: r.after });
  const noSudoHosts = { ...hostsStub, deviceBounded: async () => ({ ...mkDm(['desktop-serve']), desktopServe: async () => ({ ok: true, facts: {}, install: { platform: 'linux', apt: '/usr/bin/apt-get', aptXpra: '3.1', distro: 'ubuntu', codename: 'noble', sudo: false } }) }) };
  connects.length = 0;
  const e1 = await ACC.create({ hosts: noSudoHosts, local: () => null, install: false, log: quiet }).installXpra('dial-on').then(() => null, (e) => e);
  ok(e1 && e1.code === 'no_sudo' && e1.plan && e1.plan.commands.length > 0 && !connects.some((c) => c[0] === 'run'), 'no passwordless sudo ⇒ refused BY NAME before anything runs, the plan (commands to copy) on the error', e1 && e1.code);
  const macHosts = { ...hostsStub, deviceBounded: async () => ({ ...mkDm(['desktop-serve'], 'darwin'), desktopServe: async () => ({ ok: true, facts: {}, install: { platform: 'darwin' } }) }) };
  const e2 = await ACC.create({ hosts: macHosts, local: () => null, install: false, log: quiet }).installXpra('mac').then(() => null, (e) => e);
  ok(e2 && e2.code === 'no_x11', 'a macOS machine ⇒ no_x11 by name');
  ok(run && run[2][1] === M.INSTALL_LAUNCHER && run[2][2] === 'vs-install' && run[2][3] === M.INSTALL_RUNNER && run[2][5] === 'start', 'the argv that runs is the DETACHED launcher (its runner, the machine\'s state dir, mode start) wrapping the plan — the same on both transports (verify r2 F3/F4)', run && run[2].slice(2, 6).map((x) => String(x).slice(0, 20)));
  // this machine: the same launcher, an in-process child (the follower); the install's own output lands in the log
  const stLoc = path.join(root, 'st-loc');
  const loc = await ACC.create({ hosts: null, local: () => null, install: false, log: quiet }).runArgv('local', ['sh', '-c', 'echo out; echo err 1>&2; exit 3'], { onData: (d) => got.push('L:' + d), stateDir: stLoc });
  const gotL = got.filter((x) => x.startsWith('L:')).map((x) => x.slice(2)).join('');
  ok(loc.code === 3 && /^out\nerr\n$/.test(gotL), 'runArgv on this machine = the launcher as an in-process child: stdout AND stderr streamed (followed from the log), the install\'s RECORDED exit code answered', loc);
  const stL = await D.installState(stLoc);
  ok(fs.readFileSync(path.join(stLoc, M.INSTALL_FILES.log), 'utf8') === 'out\nerr\n' && stL.installing === null && stL.lastInstall && stL.lastInstall.code === 3 && !fs.existsSync(path.join(stLoc, M.INSTALL_FILES.pid)) && stL.lastInstall.lock && !stL.lastInstall.lock.startsWith(stLoc), 'the machine keeps the install\'s log and its recorded exit in its state dir; the pidfile is gone once it ended (installState: installing null, lastInstall exit 3, the lock it held named — outside the state dir)', stL);

  // the facts op's probe-free variant (what a held slot polls): the slot alone, from the machine keeper's own data dir
  const mS = machine();
  const isA = await DS.runDesktopServeOp(mS, 'facts', { installState: true });
  fs.mkdirSync(path.dirname(mS.storeFile), { recursive: true });
  fs.writeFileSync(path.join(path.dirname(mS.storeFile), M.INSTALL_FILES.exit), '5 1700000000123456789\n'); // the exit file's instant is nanoseconds (verify r5 L1)
  const isB = await DS.runDesktopServeOp(mS, 'facts', { installState: true });
  ok(isA.ok && isA.installState && isA.installState.stateDir === path.dirname(mS.storeFile) && isA.installState.installing === null && !('facts' in isA) && isB.installState.lastInstall && isB.installState.lastInstall.code === 5 && isB.installState.lastInstall.at === 1700000000123, 'facts {installState:true} answers the machine\'s install SLOT alone (its data dir, installing, lastInstall) — nothing probed, no host facts', { isA, isB: isB.installState });
  mS.shutdown?.();
  // PAST THE DEADLINE: named install_timeout — never "exited 1" — and the install (apt as root: never killed) runs ON,
  // detached; the machine's state dir says so (installing) until it ends, then records its exit
  const pidf = path.join(root, 'timeout-child.pid');
  const stT = path.join(root, 'st-timeout');
  const aT = ACC.create({ hosts: null, local: () => null, install: false, log: quiet, installMs: 300, holdMs: 20000 });
  const t0 = Date.now();
  const eT = await aT.runArgv('local', ['sh', '-c', `echo $$ > '${pidf}'; exec sleep 1`], { stateDir: stT }).then(() => null, (e) => e);
  const msT = Date.now() - t0;
  const cpid = Number(fs.readFileSync(pidf, 'utf8'));
  ok(eT && eT.code === 'install_timeout' && msT < 1500 && !/exited/.test(eT.message) && eT.message.includes(path.join(stT, M.INSTALL_FILES.log)), `a local run past installMs ⇒ install_timeout in ${msT} ms (never an exit code), naming where its log is`, eT && { code: eT.code, message: eT.message });
  const stT1 = await D.installState(stT);
  ok(D.pidAlive(cpid) && stT1.installing && stT1.installing.pid > 0 && stT1.installing.pid !== cpid && D.procStart(stT1.installing.pid) > 0, `the child is NOT killed; the machine's slot is its pidfile — installing {pid ${stT1.installing && stT1.installing.pid}} (the detached runner, pid + starttime), the install ${cpid} under it`, stT1);
  const endT = await until(async () => { const x = await D.installState(stT); return !D.pidAlive(cpid) && x.installing === null && x.lastInstall ? x : null; }, 4000);
  ok(endT && endT.lastInstall.code === 0, 'it ends on its own: the pidfile gone, its exit recorded (0)', endT);

  // (verify r2 F4) THE INSTALL OUTLIVES THE PROCESS THAT STARTED IT: a helper "hub" process starts it, the helper is
  // SIGKILLed at 0.7 s (a hub restart / OOM / the daemon's re-exec) — the install's end marker still lands
  const f4 = async (accPath, tag) => {
    const st = path.join(root, `st-f4-${tag}`), marker = path.join(root, `f4-${tag}.marker`);
    const helper = `const A = require(${JSON.stringify(accPath)}); A.create({ hosts: null, local: () => null, install: false, log: { log() {}, warn() {} } }).runArgv('local', ['sh', '-c', 'echo step1; sleep 1.2; echo step2; echo end > ${marker}'], { stateDir: ${JSON.stringify(st)}, onData: (d) => process.stdout.write(d) }).then(() => {}, () => {});`;
    const { spawn } = require('child_process');
    const h = spawn(process.execPath, ['-e', helper], { stdio: ['ignore', 'pipe', 'ignore'] });
    let out = ''; h.stdout.on('data', (d) => { out += d; });
    await new Promise((r) => setTimeout(r, 700));
    h.kill('SIGKILL');
    await new Promise((r) => h.once('exit', r));
    const landed = await until(() => fs.existsSync(marker), tag === 'fix' ? 4000 : 1800); // the install ends ~0.5 s after the kill; the control's never
    return { landed: !!landed, sawStep1: /step1/.test(out), log: (() => { try { return fs.readFileSync(path.join(st, M.INSTALL_FILES.log), 'utf8'); } catch { return null; } })() };
  };
  const accPath = path.join(REPO, 'src/server/desktop-access.js');
  const f4a = await f4(accPath, 'fix');
  ok(f4a.sawStep1 && f4a.landed && /step1\nstep2\n/.test(f4a.log || ''), 'the process that started the install is SIGKILLed mid-run ⇒ the install runs to its end (its marker lands, its log whole) — it never lived on that process\'s pipe', f4a);
  const accSrc = read('src/server/desktop-access.js');
  const launchLine = '    const launch = M.installLauncherArgv(argv, { stateDir, mode });\n';
  ok(accSrc.split(launchLine).length === 2, 'CONTROL setup: the launcher wrap is spelled once');
  const accPre = MUT.write('src/server/desktop-access.js', accSrc.replace(launchLine, '    const launch = argv;\n'), 'nolauncher');
  const f4b = await f4(accPre, 'pre');
  ok(f4b.sawStep1 && !f4b.landed, 'CONTROL: the pre-fix rung (the install a direct child on the starter\'s pipe) dies with its starter — SIGPIPE at its next line, the marker never lands', f4b);

  // (verify r2 F4) THE SLOT SURVIVES AN ACCESS-LAYER RE-CREATE (a hub restart): the machine's pidfile says an install
  // runs, so a second Install RE-ATTACHES (follows its log) instead of starting a second apt beside it. The real local
  // rung, a machine keeper whose install facts come from the real installState, a fake `sudo` on a scratch PATH.
  const fakeBin = path.join(root, 'fakebin-install'); fs.mkdirSync(fakeBin, { recursive: true });
  const starts = path.join(root, 'install-starts');
  fs.writeFileSync(path.join(fakeBin, 'sudo'), `#!/bin/sh\necho started >> '${starts}'\necho "+ fake apt-get"\nsleep 1\necho "fake apt done"\nexit 0\n`, { mode: 0o755 });
  const instDisplay = { ...fakeDisplay, installFacts: async ({ stateDir }) => ({ platform: 'linux', arch: 'x64', distro: 'ubuntu', like: ['debian'], codename: 'noble', prettyName: 'Ubuntu', apt: '/usr/bin/apt-get', aptXpra: '6.5.3', sudo: true, root: false, xpra: null, stateDir, ...(await D.installState(stateDir)) }) };
  const reLayer = async (Acc, tag) => {
    fs.rmSync(starts, { force: true });
    const mk = DS.install({ dataDir: path.join(root, `m-re-${tag}`), env: () => ({ PATH: '/usr/bin:/bin', HOME: root }), display: instDisplay, log: quiet });
    const lines = [];
    const mkLayer = (installMs) => Acc.create({ hosts: null, local: () => mk, install: false, env: () => ({ PATH: `${fakeBin}:/usr/bin:/bin`, HOME: root, XDG_RUNTIME_DIR: XDG }), log: { log: (l) => lines.push(String(l)), warn() { } }, installMs, holdMs: 20000, pollMs: 100 });
    const A = mkLayer(300);
    const eA = await A.installXpra('local').then(() => null, (e) => e);
    const busyA = A.installBusy('local');
    const B = mkLayer(5000); // the hub restarted: a fresh layer, nothing in memory
    const re = [], logB = [];
    const rB = await B.installXpra('local', { onReattach: (o) => re.push(o), onData: (d) => logB.push(String(d)) }).then((x) => x, (e) => e);
    await until(() => A.installBusy('local') === null, 2000);
    const n = (() => { try { return fs.readFileSync(starts, 'utf8').trim().split('\n').length; } catch { return 0; } })();
    mk.shutdown?.();
    return { eA: eA && eA.code, busyA, rB, re, logB: logB.join(''), n, busyAfter: A.installBusy('local'), lines };
  };
  const rl = await reLayer(ACC, 'fix');
  ok(rl.eA === 'install_timeout' && rl.busyA && rl.busyA.running, 'layer A: the install passes its deadline (install_timeout), A holds the slot', { eA: rl.eA, busyA: rl.busyA });
  ok(rl.rB && rl.rB.ok && rl.rB.reattached === true && rl.re.length === 1 && rl.re[0].pid > 0 && rl.n === 1 && /fake apt done/.test(rl.logB), `a RE-CREATED layer (the hub restarted) asked to install RE-ATTACHES: onReattach({pid ${rl.re[0] && rl.re[0].pid}}), the running install's log followed to its end — ONE install started, never a second (${rl.n})`, { rB: rl.rB && (rl.rB.code || rl.rB.reattached), n: rl.n, re: rl.re });
  ok(rl.busyAfter === null && rl.lines.some((l) => /the install slot on this machine is free again — the timed-out install ended — this machine reports the install process gone, exit 0/.test(l)), 'layer A\'s held slot frees when the MACHINE reports the install gone — the line names that evidence', rl.lines.filter((l) => /slot/.test(l)));
  const runningLine = "      const running = facts && facts.installing && facts.installing.pid ? facts.installing : null;\n";
  ok(accSrc.split(runningLine).length === 2, 'CONTROL setup: the re-attach verdict is spelled once');
  const AccPre = MUT.load('src/server/desktop-access.js', accSrc.replace(runningLine, '      const running = null;\n').replace(launchLine, '    const launch = argv;\n'), 'noslot');
  const rlPre = await reLayer(AccPre, 'pre');
  ok(rlPre.n === 2, `CONTROL: the pre-fix layer (the slot in memory only, the install a direct child) starts a SECOND install beside the running one after a re-create (${rlPre.n} started)`, { n: rlPre.n, rB: rlPre.rB && (rlPre.rB.code || rlPre.rB.ok) });

  // ── verify r3 + r4: THE SLOT IS A LOCK THE RUNNING INSTALL HOLDS (flock, on local storage), NEVER FOLLOWED ON AN
  //    UNVERIFIED PID, AND EVERY REFUSAL NAMES ITS CAUSE ──
  const { spawn: spawnR3, execFileSync: execR4 } = require('child_process');
  const appsSrc = read('src/desktop-apps.js');
  const lineOf = (needle) => { const l = appsSrc.split('\n').find((x) => x.includes(needle)); return l === undefined ? null : l + '\n'; };
  /** A launcher run directly (the local rung's argv); `killAfter` bounds a CONTROL that would hang (our own launcher —
   *  never an install: the control's install is `echo`). → {code, out, ms, killed}; the promise carries `.child`. */
  const launch = (Mod, argv, stateDir, mode = 'start', { env = process.env, killAfter = 0 } = {}) => {
    const l = Mod.installLauncherArgv(argv, { stateDir, mode }); let out = ''; const t = Date.now(); let killed = false;
    const c = spawnR3(l[0], l.slice(1), { env: { ...env, LC_ALL: 'C' }, stdio: ['ignore', 'pipe', 'pipe'] });
    const p = new Promise((resolve) => {
      c.stdout.on('data', (d) => { out += d; }); c.stderr.on('data', (d) => { out += d; });
      const k = killAfter ? setTimeout(() => { killed = true; try { c.kill('SIGKILL'); } catch { } }, killAfter) : null;
      c.on('close', (code) => { clearTimeout(k); resolve({ code, out, ms: Date.now() - t, killed }); });
    });
    p.child = c; p.outNow = () => out; return p;
  };
  /** An install that runs until the test RELEASES it (a file appears; capped at 6 s) — no leg depends on how long a
   *  fixed sleep outlasts this process's own event loop on a loaded box. */
  const heldInstall = (runs, go, code) => ['sh', '-c', `echo "run-$$ $(date +%s.%N)" >> '${runs}'; i=0; while [ ! -e '${go}' ] && [ $i -lt 300 ]; do sleep 0.02; i=$((i+1)); done; exit ${code}`];
  const linesIn = (f) => { try { return fs.readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).length; } catch { return 0; } };
  const realBin = (b) => ['/usr/bin/' + b, '/bin/' + b].find((x) => fs.existsSync(x));
  /** The lock file a launcher names for a state dir (verify r4; the root by the uid since r5 L3) */
  const lockOf = (st, dir = LOCKROOT) => lockPathOf(st, dir);
  const lockFree = (K) => { try { execR4(realBin('flock'), ['-n', K, 'true'], { stdio: 'ignore' }); return true; } catch { return false; } };
  const slotLock = (st, which) => { try { return fs.readFileSync(path.join(st, M.INSTALL_FILES[which]), 'utf8').trim().split(/\s+/).slice(2).join(' ') || null; } catch { return null; } };
  const runnerOf = (st) => { try { const [pid, s] = fs.readFileSync(path.join(st, M.INSTALL_FILES.pid), 'utf8').trim().split(/\s+/); return D.procStart(Number(pid)) === Number(s) ? Number(pid) : null; } catch { return null; } };
  const fd9Of = (pid) => { try { return fs.readlinkSync(`/proc/${pid}/fd/9`); } catch { return null; } };
  // (M1) a pidfile left by an OLD install whose pid now names a LIVE, unrelated process (a pid wrap: this test process,
  // a wrong starttime) + an install that ends before the launcher's first poll ⇒ answered at once, never that pid followed
  const m1 = async (Acc, tag, installMs) => {
    const st = path.join(root, `st-m1-${tag}`); fs.mkdirSync(st, { recursive: true });
    fs.writeFileSync(path.join(st, M.INSTALL_FILES.pid), `${process.pid} 1\n`);
    const t = Date.now();
    const r = await Acc.create({ hosts: null, local: () => null, install: false, log: quiet, installMs }).runArgv('local', ['sh', '-c', 'echo fresh'], { stateDir: st }).then((x) => x, (e) => ({ err: e.code }));
    return { ...r, ms: Date.now() - t };
  };
  // the fast legs first (their timings are the claims), then every slow leg and control AT ONCE (each on its own state
  // dir — the suite is fast-tier; serially these add ~15 s)
  const m1a = await m1(ACC, 'fix', 20000);
  ok(m1a.code === 0 && m1a.ms < 1000, `(r3 M1) a stale pidfile naming a LIVE unrelated pid + an install that ends at once ⇒ answered {code 0} in ${m1a.ms} ms (the old pid never followed)`, m1a);
  // (L5 / r4) no setsid — no flock — on PATH ⇒ refused at once BY NAME, before anything is created (a PATH of symlinks
  // to everything the launcher runs, minus the one tool)
  const binWithout = (tag, missing) => {
    const dir = path.join(root, `bin-${tag}`); fs.mkdirSync(dir, { recursive: true });
    for (const b of ['sh', 'sed', 'cut', 'tail', 'sleep', 'mkdir', 'rm', 'cat', 'mv', 'date', 'touch', 'sha1sum', 'setsid', 'flock', 'id']) { const src = realBin(b); if (b !== missing && src && !fs.existsSync(path.join(dir, b))) fs.symlinkSync(src, path.join(dir, b)); }
    return { PATH: dir, HOME: root, XDG_RUNTIME_DIR: XDG };
  };
  const envNoSetsid = binWithout('nosetsid', 'setsid'), envNoFlock = binWithout('noflock', 'flock');
  const t5 = Date.now();
  const l5 = await ACC.create({ hosts: null, local: () => null, install: false, log: quiet, env: () => envNoSetsid }).runArgv('local', ['sh', '-c', 'echo never'], { stateDir: path.join(root, 'st-l5'), onData: (d) => got.push('L5:' + d) });
  const l5ms = Date.now() - t5, l5out = got.filter((x) => x.startsWith('L5:')).join('');
  ok(l5.code === 125 && l5ms < 1000 && /setsid \(util-linux\) is missing/.test(l5out) && !fs.existsSync(path.join(root, 'st-l5')), `(r3 L5) a machine without setsid ⇒ exit 125 in ${l5ms} ms naming setsid, nothing created`, { l5, l5ms, l5out });
  const lf = await launch(M, ['sh', '-c', 'echo never'], path.join(root, 'st-noflock'), 'start', { env: envNoFlock, killAfter: 3000 });
  ok(lf.code === 125 && lf.ms < 1000 && /flock \(util-linux\) is missing on this machine/.test(lf.out) && !/never/.test(lf.out) && !fs.existsSync(path.join(root, 'st-noflock')), `(r4) a machine without flock ⇒ exit 125 in ${lf.ms} ms naming util-linux, nothing run, nothing created`, lf);
  // (L8) a starttime that cannot be read (no /proc): nothing is ever recorded as "<pid> " — the RUNNER refuses before it
  // runs (the pidfile's identity needs it; the launcher needs no identity of its own since r4 — the lock is the
  // kernel's). A `cut` that prints nothing stands in for an unreadable /proc/<pid>/stat.
  const noProc = path.join(root, 'bin-noproc'); fs.mkdirSync(noProc, { recursive: true });
  fs.writeFileSync(path.join(noProc, 'cut'), `#!/bin/sh\ncase "$*" in *-f20*) cat > /dev/null ;; *) exec ${realBin('cut')} "$@" ;; esac\n`, { mode: 0o755 }); // only the starttime field (-f20) reads nothing
  const envNoProc = { PATH: `${noProc}:/usr/bin:/bin`, HOME: root, XDG_RUNTIME_DIR: XDG };
  const stL8 = path.join(root, 'st-l8-launch');
  const l8l = await launch(M, ['sh', '-c', 'echo never'], stL8, 'start', { env: envNoProc, killAfter: 3000 });
  ok(l8l.code === 125 && l8l.ms < 1000 && /cannot read \/proc\/\d+\/stat/.test(l8l.out) && !/never/.test(l8l.out) && lockFree(lockOf(stL8)), `(r3 L8) no readable starttime ⇒ the install is refused before it runs: exit 125 in ${l8l.ms} ms naming /proc, nothing run, the lock released`, l8l);
  /** The RUNNER run directly, fd 9 = `fd9` (an open descriptor on the lock file; the launcher hands its own). */
  const runner = (Mod, tag, { env = envNoProc, holdOther = false, seed = false } = {}) => new Promise((resolve) => {
    const st = path.join(root, `st-r-${tag}`); fs.mkdirSync(st, { recursive: true });
    const [P8, L8, X8] = ['pid', 'log', 'exit'].map((k) => path.join(st, M.INSTALL_FILES[k]));
    const K8 = lockOf(st);
    if (seed) { fs.writeFileSync(P8, 'another install\n'); fs.writeFileSync(X8, 'another exit\n'); }
    const marker = path.join(root, `r-${tag}.ran`);
    const holder = holdOther ? spawnR3(realBin('flock'), ['-n', K8, 'sleep', '5'], { stdio: 'ignore' }) : null;
    const go = () => {
      const fd9 = fs.openSync(K8, 'a');
      let seen = null;
      const c = spawnR3('sh', ['-c', Mod.INSTALL_RUNNER, 'vs-install-run', P8, L8, X8, K8, 'sh', '-c', `echo ran > '${marker}'; sleep 0.6`], { env: { ...env, LC_ALL: 'C' }, stdio: ['ignore', 'ignore', 'ignore', 'ignore', 'ignore', 'ignore', 'ignore', 'ignore', 'ignore', fd9] });
      fs.closeSync(fd9);
      const peek = setInterval(() => { if (seen === null && !seed && fs.existsSync(P8)) { seen = fs.readFileSync(P8, 'utf8'); D.installState(st).then((x) => { seen = { pidfile: seen, installing: x.installing }; }); } }, 20);
      c.on('close', (code) => { clearInterval(peek); try { holder?.kill('SIGKILL'); } catch { } const rd = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return null; } }; resolve({ code, ran: fs.existsSync(marker), seen, exit: (rd(X8) || '').trim().split(' ')[0] || null, pidfile: rd(P8), exitfile: rd(X8), log: rd(L8) || '', pidLeft: fs.existsSync(P8) }); });
    };
    if (holder) { const t = Date.now(); const w = setInterval(() => { if (!lockFree(K8) || Date.now() - t > 3000) { clearInterval(w); go(); } }, 20); } else go();
  });
  const l8r = await runner(M, 'l8');
  ok(l8r.code === 125 && !l8r.ran && l8r.seen === null && l8r.exit === '125' && /cannot read \/proc\/\d+\/stat/.test(l8r.log) && !l8r.pidLeft, '(r3 L8) the RUNNER cannot read its starttime ⇒ it refuses: the install never runs, no pidfile ever written, its exit recorded 125 with the cause in the log', l8r);
  // (r4) the runner RE-ASSERTS the lock on the descriptor it was handed: one that does not hold it (another process
  // holds the lock) refuses — never runs, and never touches the slot's files (they are the other install's)
  const guard = await runner(M, 'guard', { env: { ...process.env }, holdOther: true, seed: true });
  ok(guard.code === 125 && !guard.ran && guard.pidfile === 'another install\n' && guard.exitfile === 'another exit\n' && /does not hold the install lock/.test(guard.log), '(r4) a runner whose descriptor does not hold the install lock (another holds it) refuses: never runs, the pidfile and exit file untouched, the cause in the log', guard);
  // the controls' patched copies (scripts/mutant-copy.mjs), each edit spelled once
  const m1Reset = lineOf("'  pid=; s=', // M1"), m1Verify = lineOf('! gone "$pid" "$s" || pid=');
  ok(m1Reset && m1Verify && appsSrc.split(m1Reset).length === 2 && appsSrc.split(m1Verify).length === 2, 'CONTROL setup: the winner\'s pid reset and the pre-tail verification are spelled once each');
  const appsPreM1 = MUT.write('src/desktop-apps.js', appsSrc.replace(m1Reset, '\n').replace(m1Verify, "  '  r=$pid;',\n"), 'm1pre');
  ok(accSrc.split("const M = require('../desktop-apps.js');").length === 2, 'CONTROL setup: the access layer requires the model once (the closed world re-binds it)');
  const AccPreM1 = MUT.load('src/server/desktop-access.js', accSrc.replace("const M = require('../desktop-apps.js');", `const M = require(${JSON.stringify(appsPreM1)});`), 'accm1pre');
  const flockTake = lineOf("'    if flock -n 9; then'"), flockGuard = lineOf("'flock -n 9 2>/dev/null ||");
  ok(flockTake && flockGuard && appsSrc.split(flockTake).length === 2 && appsSrc.split(flockGuard).length === 2, 'CONTROL setup: the launcher\'s lock and the runner\'s re-assertion are spelled once each');
  const AppsNoFlock = MUT.load('src/desktop-apps.js', appsSrc.replace(flockTake, flockTake.replace('if flock -n 9; then', 'if true; then')).replace(flockGuard, flockGuard.replace('flock -n 9 2>/dev/null ||', 'true ||')), 'noflock');
  const AppsNoGuard = MUT.load('src/desktop-apps.js', appsSrc.replace(flockGuard, flockGuard.replace('flock -n 9 2>/dev/null ||', 'true ||')), 'noguard');
  const setsidLine = lineOf('command -v setsid'), flockCheck = lineOf('command -v flock');
  ok(setsidLine && flockCheck && appsSrc.split(setsidLine).length === 2 && appsSrc.split(flockCheck).length === 2, 'CONTROL setup: the setsid and flock checks are spelled once each');
  const AppsNoSetsidCheck = MUT.load('src/desktop-apps.js', appsSrc.replace(setsidLine, '\n'), 'nosetsidcheck');
  const AppsNoFlockCheck = MUT.load('src/desktop-apps.js', appsSrc.replace(flockCheck, '\n'), 'noflockcheck');
  // a state dir that exists but cannot be written: refused by name at once
  const stRo = path.join(root, 'st-ro'); fs.mkdirSync(stRo, { recursive: true }); fs.chmodSync(stRo, 0o555);
  const asRoot = typeof process.getuid === 'function' && process.getuid() === 0;
  if (!asRoot) {
    const ro = await launch(M, ['sh', '-c', 'echo never'], stRo, 'start', { killAfter: 3000 });
    ok(ro.code === 125 && ro.ms < 1000 && /is not writable on this machine/.test(ro.out) && !/never/.test(ro.out), `a state dir that cannot be written ⇒ exit 125 in ${ro.ms} ms naming it`, ro);
  } else console.log('  - SKIP the read-only state dir row: running as root (a mode bit does not stop root)');
  const roLine = lineOf('[ -w "$D" ] ||');
  ok(roLine && appsSrc.split(roLine).length === 2, 'CONTROL setup: the writable check is spelled once');
  const AppsNoRoCheck = MUT.load('src/desktop-apps.js', appsSrc.replace(roLine, '\n'), 'norocheck');
  const refuseLine = lineOf('[ -n "$s" ] || { echo "+ [vibespace] cannot read /proc/$$/stat');
  ok(refuseLine && appsSrc.split(refuseLine).length === 2, 'CONTROL setup: the runner\'s refusal is spelled once');
  const AppsNoRefuse = MUT.load('src/desktop-apps.js', appsSrc.replace(refuseLine, '\n'), 'norefuse');
  // (M4) FIVE hubs START at the same moment on one machine: exactly ONE runner; the other four follow it and answer ITS
  // code. A ~2 % race is never gated by one trial: 40 trials at their natural speed (batches of 8 at once), then 20 with
  // the windows WIDENED — `setsid` waits 0.3 s before exec'ing the real one (the lock → pidfile window) and `flock` a
  // random 0–60 ms (which start takes it, and when a loser probes) — so the pin cannot pass on a quiet box's luck.
  const shimDir = path.join(root, 'bin-wide'); fs.mkdirSync(shimDir, { recursive: true });
  fs.writeFileSync(path.join(shimDir, 'setsid'), `#!/bin/sh\nsleep 0.3\nexec ${realBin('setsid')} "$@"\n`, { mode: 0o755 });
  fs.writeFileSync(path.join(shimDir, 'flock'), `#!/bin/sh\nr=$(od -An -N2 -tu2 /dev/urandom | tr -d ' '); sleep $(printf '0.%03d' $((r % 60)))\nexec ${realBin('flock')} "$@"\n`, { mode: 0o755 });
  const envWide = { ...process.env, PATH: `${shimDir}:${process.env.PATH}` };
  const five = async (Mod, tag, { env = process.env, prep = null } = {}) => {
    const st = path.join(root, `st-m4-${tag}`); fs.mkdirSync(st, { recursive: true });
    const runs = path.join(root, `m4-${tag}.runs`);
    const pre = prep ? await prep(st) : {};
    const go = path.join(root, `m4-${tag}.go`);
    const t0 = Date.now();
    const ps = Array.from({ length: 5 }, () => launch(Mod, heldInstall(runs, go, 3), st, 'start', { env, killAfter: 15000 }));
    // the install ends once the four others FOLLOW it (1.5 s at most — a control with no followers is released then)
    await until(() => ps.filter((p) => /already running/.test(p.outNow())).length >= 4, 1500, 10);
    fs.writeFileSync(go, '');
    const rs = await Promise.all(ps);
    let firstRunMs = null; try { firstRunMs = Math.round(Number(fs.readFileSync(runs, 'utf8').split('\n')[0].split(' ')[1]) * 1000) - t0; } catch { } // %s.%N: uutils `date` ignores a %3N width
    return { ...pre, runners: linesIn(runs), codes: rs.map((r) => r.code), followed: rs.filter((r) => /already running/.test(r.out)).length, lockFree: lockFree(lockOf(st)), inState: fs.readdirSync(st).filter((n) => /lock/.test(n)), ms: Math.max(...rs.map((r) => r.ms)), firstRunMs, killed: rs.filter((r) => r.killed).length };
  };
  const batches = async (n, size, mk) => { const out = []; for (let b = 0; b < n; b += size) out.push(...await Promise.all(Array.from({ length: Math.min(size, n - b) }, (_, i) => mk(b + i)))); return out; };
  const oneEach = (rs) => rs.every((r) => r.runners === 1 && r.codes.every((c) => c === 3) && r.lockFree && r.inState.length === 0 && !r.killed);
  const hist = (rs) => rs.reduce((h, r) => { h[r.runners] = (h[r.runners] || 0) + 1; return h; }, {});
  // (r4) a PREVIOUS install SIGKILLed mid-run — the runner and its children (its session, as the OOM killer or a
  // reboot ends it): the kernel released its lock ⇒ the next start RUNS at once, never waits on a dead holder
  const killedPrev = async (st) => {
    const p0 = launch(M, ['sh', '-c', 'exec sleep 30'], st);
    const pid = await until(() => runnerOf(st), 5000, 10);
    const K = lockOf(st); const held = !lockFree(K) && fd9Of(pid) === K;
    process.kill(-pid, 'SIGKILL');
    const freed = !!(await until(() => lockFree(K), 1000, 5));
    await p0;
    return { held, freed };
  };
  // (r4) the LAUNCHER SIGKILLed while its runner runs (a hub restart): the runner still holds the lock — its fd 9 names
  // the lock file — and a concurrent start FOLLOWS it (answers its exit), never runs a second
  const stKl = path.join(root, 'st-killed-launcher'); fs.mkdirSync(stKl, { recursive: true });
  const runsKl = path.join(root, 'killed-launcher.runs');
  const goKl = path.join(root, 'killed-launcher.go');
  const killedLauncher = (async () => {
    const pA = launch(M, heldInstall(runsKl, goKl, 4), stKl);
    const runnerPid = await until(() => runnerOf(stKl), 5000, 10);
    const K = lockOf(stKl);
    // the launcher closes its copy on the line after the fork and only then starts `tail`: read its fd 9 once tail runs
    const kidsOf = (pid) => { try { return fs.readFileSync(`/proc/${pid}/task/${pid}/children`, 'utf8').trim().split(/\s+/).filter(Boolean).map(Number); } catch { return []; } };
    const commOf = (pid) => { try { return fs.readFileSync(`/proc/${pid}/comm`, 'utf8').trim(); } catch { return ''; } };
    const tailed = !!(await until(() => kidsOf(pA.child.pid).some((k) => commOf(k) === 'tail'), 5000, 10));
    const launcherFd9 = tailed ? fd9Of(pA.child.pid) : 'no tail yet';
    const gone = new Promise((r) => pA.child.once('exit', r)); pA.child.kill('SIGKILL'); await gone; // its orphaned `tail` keeps the pipe open until the runner ends: wait for the EXIT, not the close
    await new Promise((r) => setTimeout(r, 50));
    const after = { runnerAlive: D.pidAlive(runnerPid), runnerFd9: fd9Of(runnerPid), held: !lockFree(K) };
    const pB = launch(M, ['sh', '-c', `echo "second-$$" >> '${runsKl}'; exit 9`], stKl, 'start', { killAfter: 8000 });
    await until(() => /already running/.test(pB.outNow()), 3000, 10);
    fs.writeFileSync(goKl, ''); // the first install ends only now — after the second start chose to follow it
    const b = await pB;
    return { K, runnerPid, launcherFd9, ...after, b: { code: b.code, followsIt: new RegExp(`already running on this machine \\(pid ${runnerPid}\\)`).test(b.out), ms: b.ms }, runs: (() => { try { return fs.readFileSync(runsKl, 'utf8').trim().split('\n'); } catch { return []; } })(), freeAfter: lockFree(K) };
  })();
  // (r4) a lock held by a process that is NOT a recorded install (no pidfile): a start waits on it — never runs beside
  // it — and runs the moment the holder exits
  const stHold = path.join(root, 'st-held'); fs.mkdirSync(stHold, { recursive: true });
  const runsHold = path.join(root, 'held.runs');
  const heldLeg = (async () => {
    const K = lockOf(stHold);
    const endStamp = path.join(root, 'held.end');
    // the holder writes its end time, THEN exits — the lock frees only after the stamp (flock waits for its child)
    const holder = spawnR3(realBin('flock'), [K, 'sh', '-c', `sleep 0.8; date +%s.%N > '${endStamp}'`], { stdio: 'ignore' });
    await until(() => !lockFree(K), 2000, 10);
    const r = await launch(M, ['sh', '-c', `echo "run-$$ $(date +%s.%N)" >> '${runsHold}'; exit 3`], stHold, 'start', { killAfter: 8000 });
    let at = null, holderEnd = null; try { at = Math.round(Number(fs.readFileSync(runsHold, 'utf8').split('\n')[0].split(' ')[1]) * 1000); holderEnd = Math.round(Number(fs.readFileSync(endStamp, 'utf8')) * 1000); } catch { }
    await new Promise((r) => (holder.exitCode !== null ? r() : holder.once('exit', r)));
    return { code: r.code, runners: linesIn(runsHold), ranAfterHolder: holderEnd !== null && at !== null && at >= holderEnd, waitedMs: r.ms, gap: at && holderEnd ? at - holderEnd : null };
  })();
  // (r5 L3) THE LOCK LIVES ON LOCAL STORAGE, named for the state dir and never inside it, its directory NAMED BY THE UID:
  // three starts on ONE state dir — $XDG_RUNTIME_DIR a scratch dir, unset, naming a gone dir — record ONE lock path
  // (LOCKROOT); the r4 env-derived line (the CONTROL) names two
  const noXdg = { ...process.env }; delete noXdg.XDG_RUNTIME_DIR;
  const xdgEnvs = [process.env, noXdg, { ...process.env, XDG_RUNTIME_DIR: path.join(root, 'no-such-runtime-dir') }];
  const threeStarts = async (Mod, tag) => {
    const st = path.join(root, `st-l3-${tag}`); fs.mkdirSync(st, { recursive: true });
    const out = [];
    for (const env of xdgEnvs) { const r = await launch(Mod, ['sh', '-c', 'exit 0'], st, 'start', { env, killAfter: 8000 }); out.push({ code: r.code, lock: slotLock(st, 'exit') }); }
    return { st, out, locks: [...new Set(out.map((x) => x.lock))], stateLock: (await D.installState(st)).lastInstall };
  };
  const t3Line = lineOf("'  T=/run/user/$u;"), t3Check = lineOf('is not a directory this user owns');
  ok(t3Line && t3Check && appsSrc.split(t3Line).length === 2 && appsSrc.split(t3Check).length === 2, 'CONTROL setup: the uid-named directory and its ownership check are spelled once each');
  const AppsEnvRoot = MUT.load('src/desktop-apps.js', appsSrc.replace(t3Line, "  '  T=${XDG_RUNTIME_DIR:-/tmp}; [ -d \"$T\" ] && [ -w \"$T\" ] || T=/tmp',\n").replace(t3Check, '\n'), 'envroot');
  const AppsNoOwnCheck = MUT.load('src/desktop-apps.js', appsSrc.replace(t3Check, '\n'), 'noowncheck');
  // a fake uid (an `id` that answers -u with it): /run/user/<n> does not exist ⇒ the per-uid /tmp dir, created 0700
  const fakeUid = 4000000000 + (process.pid % 1000000) * 4;
  const idShim = (n, answer) => { const d = path.join(root, `bin-id-${n}`); fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, 'id'), `#!/bin/sh\ncase "$1" in -u) echo '${answer}' ;; *) exec ${realBin('id')} "$@" ;; esac\n`, { mode: 0o755 }); return { ...process.env, PATH: `${d}:${process.env.PATH}` }; };
  const tmpRootOf = (n) => { const d = `/tmp/vibespace-${n}`; extraCleanup.push(d); return d; };
  const l3Leg = (async () => {
    const same = await threeStarts(M, 'fix');
    const ctl = await threeStarts(AppsEnvRoot, 'envroot');
    for (const k of ctl.locks) { if (k && k.startsWith('/tmp/') && path.dirname(k) === '/tmp') { try { fs.rmSync(k); } catch { } } } // the control's /tmp lock: ours, free
    // the fallback, created for a uid with no /run/user dir
    const fA = fakeUid, dA = tmpRootOf(fA); fs.rmSync(dA, { recursive: true, force: true });
    const stA = path.join(root, 'st-l3-fake'); fs.mkdirSync(stA, { recursive: true });
    const rA = await launch(M, ['sh', '-c', 'exit 0'], stA, 'start', { env: idShim(fA, fA), killAfter: 8000 });
    let modeA = null, ownA = null; try { const x = fs.lstatSync(dA); modeA = (x.mode & 0o777).toString(8); ownA = x.uid === UID && x.isDirectory(); } catch { }
    const fallback = { code: rA.code, lock: slotLock(stA, 'exit'), want: lockOf(stA, dA), modeA, ownA, runUserGone: !fs.existsSync(`/run/user/${fA}`) };
    fs.rmSync(dA, { recursive: true, force: true });
    // a REGULAR FILE where the per-uid dir goes (what a squatter can make without root) ⇒ refused by name, nothing run
    const fB = fakeUid + 1, dB = tmpRootOf(fB); fs.rmSync(dB, { recursive: true, force: true }); fs.writeFileSync(dB, 'squatter\n');
    const stB = path.join(root, 'st-l3-file'); fs.mkdirSync(stB, { recursive: true });
    const rB = await launch(M, ['sh', '-c', 'echo never'], stB, 'start', { env: idShim(fB, fB), killAfter: 8000 });
    const rBc = await launch(AppsNoOwnCheck, ['sh', '-c', 'echo never'], stB, 'start', { env: idShim(fB, fB), killAfter: 8000 });
    fs.rmSync(dB, { force: true });
    // a DIRECTORY owned by another uid ⇒ refused by name (only root can make one)
    let foreign = null;
    if (UID === 0) {
      const fC = fakeUid + 2, dC = tmpRootOf(fC); fs.rmSync(dC, { recursive: true, force: true }); fs.mkdirSync(dC, { mode: 0o777 }); fs.chownSync(dC, 65534, 65534);
      const stC = path.join(root, 'st-l3-foreign'); fs.mkdirSync(stC, { recursive: true });
      foreign = await launch(M, ['sh', '-c', 'echo never'], stC, 'start', { env: idShim(fC, fC), killAfter: 8000 });
      foreign.dir = dC; fs.rmSync(dC, { recursive: true, force: true });
    }
    // an `id -u` that answers no number ⇒ refused by name
    const stD = path.join(root, 'st-l3-noid'); fs.mkdirSync(stD, { recursive: true });
    const rD = await launch(M, ['sh', '-c', 'echo never'], stD, 'start', { env: idShim('nan', 'x1'), killAfter: 8000 });
    return { same, ctl, fallback, file: { code: rB.code, out: rB.out, ms: rB.ms, dir: dB }, fileCtl: { code: rBc.code, out: rBc.out }, foreign, noid: { code: rD.code, out: rD.out } };
  })();
  // (r5 L1) A START IN THE SAME SECOND AS AN EARLIER INSTALL'S EXIT, while a child that install left behind still holds
  // the lock (fd 9 inherited), RUNS its own install — it never answers that stale exit. The first install exits 100 in
  // the first tenth of a second and leaves `sleep 1.5` on fd 9; the second start is spawned the moment the first
  // runner's pidfile is gone. Aligned to one second by construction, re-tried (≤ 3) only when the box was too slow to
  // keep it there — the alignment is evidence in the result either way.
  const exitLine1 = lineOf('fin() { echo "$1 $(date +%s%N) $K"'), t0Line1 = lineOf("'  t0=$(date +%s%N);"), cmpLine1 = lineOf('-gt "$t0" ]');
  ok(exitLine1 && t0Line1 && cmpLine1 && [exitLine1, t0Line1, cmpLine1].every((l) => appsSrc.split(l).length === 2), 'CONTROL setup: the exit instant, the start instant and their comparison are spelled once each');
  const AppsWholeSec = MUT.load('src/desktop-apps.js', appsSrc.replace(exitLine1, exitLine1.replace('$(date +%s%N)', '$(date +%s)')).replace(t0Line1, t0Line1.replace('$(date +%s%N)', '$(date +%s)')).replace(cmpLine1, cmpLine1.replace('-gt "$t0" ]', '-ge "$t0" ]')), 'wholesec');
  const sameSecond = async (Mod, tag, unit) => {
    let last = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      const st = path.join(root, `st-l1-${tag}-${attempt}`); fs.mkdirSync(st, { recursive: true });
      const runs = path.join(root, `l1-${tag}-${attempt}.runs`);
      const [Pf, Xf] = [path.join(st, M.INSTALL_FILES.pid), path.join(st, M.INSTALL_FILES.exit)];
      const pA = launch(Mod, ['sh', '-c', 'while [ "$(date +%N | cut -c1)" != 0 ]; do sleep 0.01; done; sleep 1.5 > /dev/null 2>&1 & exit 100'], st, 'start', { killAfter: 10000 });
      const ended = await until(() => fs.existsSync(Xf) && !fs.existsSync(Pf), 4000, 2);
      const tB = Date.now();
      const pB = launch(Mod, ['sh', '-c', `echo "run-$$" >> '${runs}'; exit 7`], st, 'start', { killAfter: 10000 });
      let aAt = null; try { aAt = fs.readFileSync(Xf, 'utf8').trim().split(/\s+/)[1]; } catch { }
      const heldByChild = !lockFree(lockOf(st));
      const [a, b] = await Promise.all([pA, pB]);
      const aSec = aAt === null ? null : unit === 'ns' ? Number(BigInt(aAt) / 1000000000n) : Number(aAt);
      last = { attempt, ended: !!ended, a: a.code, b: b.code, runs: linesIn(runs), aSec, bSec: Math.floor(tB / 1000), bMsIn: tB % 1000, heldByChild, bMs: b.ms, bTail: b.out.slice(-200) };
      last.aligned = last.aSec === last.bSec && last.bMsIn < 800; // the second start's own instant is taken a few ms after the spawn
      if (last.aligned && last.heldByChild) return last;
    }
    return last;
  };
  const l1Leg = Promise.all([sameSecond(M, 'fix', 'ns'), sameSecond(AppsWholeSec, 'ctl', 's')]).then(([fix, ctl]) => ({ fix, ctl }));
  // (r5 L4) a runner exec'd WITHOUT fd 9 (a `setsid` that closes it before it execs the real one) refuses — and the
  // launcher says so at once, with the runner's own line naming the lock: the pidfile wait ends with the runner's life
  const noFd9 = path.join(root, 'bin-nofd9'); fs.mkdirSync(noFd9, { recursive: true });
  fs.writeFileSync(path.join(noFd9, 'setsid'), `#!/bin/sh\nexec 9>&-\nexec ${realBin('setsid')} "$@"\n`, { mode: 0o755 });
  const envNoFd9 = { ...process.env, PATH: `${noFd9}:${process.env.PATH}` };
  const waitLine4 = lineOf('[ -e "/proc/$b" ]; do sleep 0.05');
  ok(waitLine4 && appsSrc.split(waitLine4).length === 2, 'CONTROL setup: the pidfile wait bounded by the runner\'s life is spelled once');
  const AppsUnbounded = MUT.load('src/desktop-apps.js', appsSrc.replace(waitLine4, waitLine4.replace(' && [ -e "/proc/$b" ]', '')), 'unbounded');
  const l4Leg = (async () => {
    const stF = path.join(root, 'st-l4'), stC = path.join(root, 'st-l4-pre'); fs.mkdirSync(stF, { recursive: true }); fs.mkdirSync(stC, { recursive: true });
    const [fx, pre] = await Promise.all([launch(M, ['sh', '-c', 'echo never'], stF, 'start', { env: envNoFd9, killAfter: 15000 }), launch(AppsUnbounded, ['sh', '-c', 'echo never'], stC, 'start', { env: envNoFd9, killAfter: 3000 })]);
    return { fx: { ...fx, lock: lockOf(stF), free: lockFree(lockOf(stF)) }, pre };
  })();
  const tNat = Date.now();
  const [nat, m1b, wide, killed5, kl, hw, l3, l1, l4, f5ctl, l5pre, lfpre, l8pre, grd, ropre] = await Promise.all([
    batches(40, 8, (i) => five(M, `nat-${i}`)).then((r) => { r.ms = Date.now() - tNat; return r; }),
    m1(AccPreM1, 'pre', 3000),
    batches(20, 10, (i) => five(M, `wide-${i}`, { env: envWide })),
    batches(10, 5, (i) => five(M, `killed-${i}`, { prep: killedPrev })),
    killedLauncher, heldLeg, l3Leg, l1Leg, l4Leg,
    batches(3, 3, (i) => five(AppsNoFlock, `ctl-${i}`, { env: envWide })),
    launch(AppsNoSetsidCheck, ['sh', '-c', 'echo never'], path.join(root, 'st-l5-pre'), 'start', { env: envNoSetsid, killAfter: 1500 }),
    launch(AppsNoFlockCheck, ['sh', '-c', 'echo never'], path.join(root, 'st-noflock-pre'), 'start', { env: envNoFlock, killAfter: 3000 }),
    runner(AppsNoRefuse, 'l8pre'),
    runner(AppsNoGuard, 'guardpre', { env: { ...process.env }, holdOther: true, seed: true }),
    asRoot ? Promise.resolve(null) : launch(AppsNoRoCheck, ['sh', '-c', 'echo never'], stRo, 'start', { killAfter: 3000 }),
  ]);
  ok(nat.length === 40 && oneEach(nat), `(r3 M4 / r4) five concurrent starts on an empty state dir, 40 trials (8 at a time, beside every other leg) ⇒ ONE runner in every trial (runners ${JSON.stringify(hist(nat))}); the other four follow it (${nat.reduce((a, r) => a + r.followed, 0)} follows of 160 — each install runs until all four follow) and all answer its exit 3; the lock free after each (${nat.ms} ms)`, nat.filter((r) => !oneEach([r])).slice(0, 3));
  ok(m1b.err === 'install_timeout' && m1b.ms >= 2900, `CONTROL: the pre-fix launcher follows the stale pid — install_timeout after ${m1b.ms} ms for an install that ended at once`, m1b);
  ok(wide.length === 20 && oneEach(wide), `(r4) the same over 20 trials with the windows WIDENED (setsid +0.3 s, flock +0–60 ms) ⇒ ONE runner in every trial (runners ${JSON.stringify(hist(wide))}), all answer exit 3`, wide.filter((r) => !oneEach([r])).slice(0, 3));
  ok(killed5.length === 10 && oneEach(killed5) && killed5.every((r) => r.held && r.freed && r.firstRunMs !== null && r.firstRunMs < 1500), `(r4) a previous install SIGKILLed mid-run, 10 trials (its runner held the lock — fd 9 → the lock file — until the kill: ${killed5.filter((r) => r.held).length}/10; released by the kernel at the kill: ${killed5.filter((r) => r.freed).length}/10) ⇒ five starts ⇒ ONE runner, started at once (first run ${Math.min(...killed5.map((r) => r.firstRunMs))}–${Math.max(...killed5.map((r) => r.firstRunMs))} ms after the starts — the kernel released the dead holder's lock; nothing waited)`, killed5.filter((r) => !oneEach([r]) || !(r.firstRunMs < 1500)).slice(0, 3));
  ok(kl.launcherFd9 === null && kl.runnerAlive && kl.runnerFd9 === kl.K && kl.held && kl.b.followsIt && kl.b.code === 4 && kl.runs.length === 1 && /^run-/.test(kl.runs[0]) && kl.freeAfter, `(r4) the LAUNCHER SIGKILLed mid-install: its runner lives on HOLDING the lock (/proc/${kl.runnerPid}/fd/9 → the lock file; the launcher had closed its own copy) and a concurrent start follows it (answered its exit 4 in ${kl.b.ms} ms) — never a second runner; the lock free once it ended`, kl);
  ok(hw.code === 3 && hw.runners === 1 && hw.ranAfterHolder, `(r4) a lock held by a process that is no recorded install ⇒ a start WAITS (never runs beside it) and runs only once the holder has exited (${hw.gap} ms after the holder's own end stamp, written before it released; answered in ${hw.waitedMs} ms)`, hw);
  ok(l3.same.out.every((x) => x.code === 0) && l3.same.locks.length === 1 && l3.same.locks[0] === lockOf(l3.same.st) && path.dirname(l3.same.locks[0]) === LOCKROOT && l3.same.stateLock && l3.same.stateLock.lock === l3.same.locks[0] && !l3.same.locks[0].startsWith(root + '/'), `(r5 L3) the lock is named by the UID, never the environment: $XDG_RUNTIME_DIR a scratch dir, unset, or naming a gone dir ⇒ ONE lock path on one state dir (${l3.same.locks[0]}; the exit file and installState record it) — local storage, never inside a state dir`, l3.same);
  ok(l3.ctl.locks.length > 1, `CONTROL: the r4 line (T=\${XDG_RUNTIME_DIR:-/tmp}) names ${l3.ctl.locks.length} different locks for ONE state dir across the three environments (${l3.ctl.locks.join(' | ')})`, l3.ctl);
  ok(l3.fallback.runUserGone && l3.fallback.code === 0 && l3.fallback.lock === l3.fallback.want && l3.fallback.modeA === '700' && l3.fallback.ownA, `(r5 L3) a uid with no /run/user dir ⇒ the lock in /tmp/vibespace-<uid>, created 0700 and owned by this user (mode ${l3.fallback.modeA})`, l3.fallback);
  ok(l3.file.code === 125 && l3.file.ms < 1000 && l3.file.out.includes(`${l3.file.dir} is not a directory this user owns`) && !/never/.test(l3.file.out), `(r5 L3) something that is not a directory this user owns where /tmp/vibespace-<uid> goes (a regular file — what a squatter can make without root) ⇒ exit 125 in ${l3.file.ms} ms naming it, nothing run`, l3.file);
  ok(l3.fileCtl.code === 125 && !/is not a directory this user owns/.test(l3.fileCtl.out) && /cannot be opened/.test(l3.fileCtl.out), 'CONTROL: without the ownership check the same squat is refused only by the generic open failure — the directory never named', l3.fileCtl);
  if (l3.foreign) ok(l3.foreign.code === 125 && l3.foreign.out.includes(`${l3.foreign.dir} is not a directory this user owns`) && !/never/.test(l3.foreign.out), '(r5 L3) a /tmp/vibespace-<uid> DIRECTORY owned by another uid ⇒ refused by name, nothing run', l3.foreign);
  else console.log(`  - SKIP (r5 L3) a /tmp/vibespace-<uid> directory owned by ANOTHER uid: this suite runs as uid ${UID}, and only root can make a directory another uid owns — the regular-file row above goes through the same check (\`[ -d ] && [ -O ]\`)`);
  ok(l3.noid.code === 125 && /this user id cannot be read \(id -u\)/.test(l3.noid.out) && !/never/.test(l3.noid.out), '(r5 L3) an `id -u` that answers no number ⇒ refused by name, nothing run', l3.noid);
  ok(l1.fix.aligned && l1.fix.heldByChild && l1.fix.a === 100 && l1.fix.b === 7 && l1.fix.runs === 1, `(r5 L1) an install exits 100 at second ${l1.fix.aSec} leaving a child on the lock; a start in the SAME second (${l1.fix.bMsIn} ms into it, the lock held by that child) waits for the lock and RUNS its own install (exit 7 in ${l1.fix.bMs} ms, 1 run) — never the stale 100 (attempt ${l1.fix.attempt})`, l1.fix);
  ok(l1.ctl.aligned && l1.ctl.heldByChild && l1.ctl.a === 100 && l1.ctl.b === 100 && l1.ctl.runs === 0, `CONTROL: the whole-second launcher (\`date +%s\`, \`-ge\`) answers the earlier install's stale exit ${l1.ctl.b} in the same second and never runs its own (${l1.ctl.runs} runs)`, l1.ctl);
  ok(l4.fx.code === 125 && l4.fx.ms < 1000 && l4.fx.out.includes(`does not hold the install lock (${l4.fx.lock})`) && /the install did not start/.test(l4.fx.out) && !/never/.test(l4.fx.out) && l4.fx.free, `(r5 L4) a runner exec'd without fd 9 refuses and the launcher answers 125 in ${l4.fx.ms} ms with the runner's line naming the lock, nothing run, the lock free`, { code: l4.fx.code, ms: l4.fx.ms, out: l4.fx.out.slice(-300) });
  ok(l4.pre.killed && l4.pre.ms >= 2900 && !/the install did not start/.test(l4.pre.out), `CONTROL: the pidfile wait without the runner's life as its bound is still waiting ${l4.pre.ms} ms later for a runner that already refused (killed at 3 s — our launcher, never an install; unbounded it answers at 10 s)`, { killed: l4.pre.killed, ms: l4.pre.ms, out: l4.pre.out.slice(-200) });
  ok(f5ctl.length === 3 && f5ctl.every((r) => r.runners > 1), `CONTROL: the launcher (and the runner's re-assertion) with \`flock -n 9\` replaced by \`true\` ⇒ ${f5ctl.map((r) => r.runners).join(', ')} runners per five starts — apt-gets beside each other`, f5ctl);
  ok(grd.ran, 'CONTROL: a runner without the re-assertion runs while another process holds the lock', { ran: grd.ran, code: grd.code });
  ok(l5pre.code === 125 && !/setsid \(util-linux\)/.test(l5pre.out) && /setsid: (command )?not found/.test(l5pre.out), `CONTROL: without the setsid check the refusal is the shell's bare "setsid: not found" (${l5pre.ms} ms — since r5 L4 the pidfile wait ends with the runner's life; before, 10 s), never the package to install`, l5pre);
  ok(!/util-linux/.test(lfpre.out) && /flock exit 127/.test(lfpre.out), 'CONTROL: without the flock check the refusal is a bare exit code (flock exit 127), never the package to install', lfpre);
  if (ropre) ok(!/is not writable/.test(ropre.out), 'CONTROL: without the check the state dir is never named — the refusal comes later, from the log it cannot write', ropre);
  ok(l8pre.ran && l8pre.seen && /^\d+ {2}\S/.test(l8pre.seen.pidfile) && l8pre.seen.installing === null, `CONTROL: without the refusal the install RUNS under a pidfile nothing can verify (${JSON.stringify(l8pre.seen && l8pre.seen.pidfile)}) — the machine reports no install while it runs`, l8pre);

  // the SLOT on a paired machine: a run-stream that never ends until we say so, facts that report the pidfile
  const loopHold = setInterval(() => { }, 1000); // the access layer's timers are unref'd (a server holds the loop; this stub world does not)
  let endRun = null; const runOpts = [];
  const phase = { v: 'plan' }; // plan: no install running · running: the pidfile lives · down: the link is gone · gone: it ended
  const instFacts = () => ({ platform: 'linux', apt: '/usr/bin/apt-get', aptXpra: '6.2', distro: 'ubuntu', like: ['debian'], codename: 'noble', sudo: true, xpra: null, stateDir: '/home/u/.vibespace', installing: phase.v === 'running' ? { pid: 4242, since: 1 } : null, lastInstall: phase.v === 'gone' ? { code: 0, at: 2 } : null });
  const factsAsked = [];
  const factsOp = async (op, p) => { factsAsked.push(p || {}); if (phase.v === 'down') throw Object.assign(new Error('device link lost'), { code: 'link_lost' }); return { ok: true, facts: {}, install: instFacts() }; };
  const slowHosts = { ...hostsStub, deviceBounded: async () => ({ ...mkDm(['desktop-serve']), desktopServe: factsOp, runStream: (cmd, args, o) => { runOpts.push(o); phase.v = 'running'; return new Promise((r) => { endRun = r; }); } }) };
  const slotLines = [];
  const aS = ACC.create({ hosts: slowHosts, local: () => null, install: false, log: { log: (l) => slotLines.push(String(l)), warn() { } }, installMs: 300, holdMs: 20000, pollMs: 50 });
  const eS = await aS.installXpra('dial-on').then(() => null, (e) => e);
  ok(eS && eS.code === 'install_timeout' && eS.plan && runOpts[0] && runOpts[0].timeoutMs >= 300 + 20000, `installXpra past its deadline on a paired machine ⇒ install_timeout by name, the plan kept; the run-stream's own belt is installMs + holdMs (${runOpts[0] && runOpts[0].timeoutMs} ms), never the 120 s default`, eS && eS.code);
  const busy1 = aS.installBusy('dial-on');
  const eB = await aS.installXpra('dial-on').then(() => null, (e) => e);
  ok(busy1 && busy1.running && eB && eB.code === 'busy' && runOpts.length === 1, 'the machine\'s install slot is HELD while the machine reports its install running: a second install on THIS hub ⇒ busy, nothing started', { busy1, code: eB && eB.code });
  ok(aS.installBusy('local') === null, 'the slot is per machine (this machine is free)');
  // (verify r2 F3) the timed-out install then LOSES ITS LINK: the stream settles on the link's death — the slot is still
  // held (the old one freed it here saying "ended"), through the outage, until the machine, reached again, says gone
  phase.v = 'down'; endRun({ error: 'device link lost' });
  await new Promise((r) => setTimeout(r, 250));
  ok(aS.installBusy('dial-on') !== null, 'the stream ends on a LOST LINK after the deadline ⇒ the slot stays held (nothing saw the install end)');
  phase.v = 'running'; await new Promise((r) => setTimeout(r, 200));
  ok(aS.installBusy('dial-on') !== null, '…the machine answers again and still reports the install running ⇒ still held');
  phase.v = 'gone';
  await until(() => aS.installBusy('dial-on') === null, 1000, 20);
  const freed = slotLines.filter((l) => /slot on dial-on is free again/.test(l));
  ok(aS.installBusy('dial-on') === null && freed.length === 1 && /the timed-out install ended — dial-on reports the install process gone, exit 0 \(the link dropped meanwhile; seen after it came back\)/.test(freed[0]), 'the machine reports it gone ⇒ the slot frees, and the line names the EVIDENCE (never "ended" on a lost link alone)', freed);
  // (verify r2 F3) install_link_lost itself: held until the reconnected machine says gone, never freed at the drop
  const lostRun = async (Acc) => {
    const lines = [];
    phase.v = 'plan';
    const h = { ...slowHosts, deviceBounded: async () => ({ ...mkDm(['desktop-serve']), desktopServe: factsOp, runStream: async () => { phase.v = 'down'; await new Promise((r) => setTimeout(r, 30)); return { error: 'device link lost' }; } }) };
    const a = Acc.create({ hosts: h, local: () => null, install: false, log: { log: (l) => lines.push(String(l)), warn() { } }, installMs: 5000, holdMs: 20000, pollMs: 50 });
    const e = await a.installXpra('dial-on').then(() => null, (x) => x);
    const busyAtDrop = a.installBusy('dial-on');
    await new Promise((r) => setTimeout(r, 200));
    const busyDown = a.installBusy('dial-on');
    phase.v = 'running'; await new Promise((r) => setTimeout(r, 200));
    const busyRunning = a.installBusy('dial-on');
    phase.v = 'gone'; await until(() => a.installBusy('dial-on') === null, 1000, 20);
    return { code: e && e.code, message: e && e.message, busyAtDrop, busyDown, busyRunning, busyEnd: a.installBusy('dial-on'), freed: lines.filter((l) => /slot on dial-on is free again/.test(l)) };
  };
  factsAsked.length = 0;
  const ll = await lostRun(ACC);
  const polls = factsAsked.slice(1);
  ok(factsAsked[0] && factsAsked[0].install === true && polls.length >= 3 && polls.every((q) => q.installState === true && !q.install), `the held slot polls the probe-free installState (${polls.length} polls, never the full install facts — no \`sudo -n\` every poll)`, factsAsked.slice(0, 4));
  ok(ll.code === 'install_link_lost' && /runs on there, detached/.test(ll.message), 'a link that drops mid-install ⇒ install_link_lost, saying the install runs on there', ll.message);
  ok(ll.busyAtDrop && ll.busyDown && ll.busyRunning, 'the slot is HELD at the drop, through the outage (facts unreachable) and while the reconnected machine reports it running — a second click is busy, never a second apt', { at: !!ll.busyAtDrop, down: !!ll.busyDown, running: !!ll.busyRunning });
  ok(ll.busyEnd === null && ll.freed.length === 1 && /the link was lost during the install; dial-on, reached again, reports the install process gone, exit 0/.test(ll.freed[0]), 'the reconnected machine reports it gone ⇒ freed, the line naming the cause', ll.freed);
  const holdLine = "      catch (e) { if (e && (e.code === 'install_timeout' || e.code === 'install_link_lost')) held = e.code; if (e && !e.plan) e.plan = plan; throw e; }\n";
  ok(accSrc.split(holdLine).length === 2, 'CONTROL setup: the hold verdict is spelled once');
  const AccNoHold = MUT.load('src/server/desktop-access.js', accSrc.replace(holdLine, "      catch (e) { if (e && e.code === 'install_timeout') held = e.code; if (e && !e.plan) e.plan = plan; throw e; }\n"), 'nolinkhold');
  const llPre = await lostRun(AccNoHold);
  ok(llPre.code === 'install_link_lost' && llPre.busyAtDrop === null, 'CONTROL: a layer that does not hold on a lost link frees the slot AT the drop — a second click would start a second apt beside the running one', { busyAtDrop: llPre.busyAtDrop });
  // unobserved to the end: held for holdMs, then freed naming that nothing saw it end
  const hl = []; phase.v = 'plan';
  const hH = { ...slowHosts, deviceBounded: async () => ({ ...mkDm(['desktop-serve']), desktopServe: factsOp, runStream: async () => { phase.v = 'down'; return { error: 'device link lost' }; } }) };
  const aH = ACC.create({ hosts: hH, local: () => null, install: false, log: { log: (l) => hl.push(String(l)), warn() { } }, installMs: 5000, holdMs: 400, pollMs: 50 });
  await aH.installXpra('dial-on').then(() => null, () => null);
  await until(() => aH.installBusy('dial-on') === null, 2000, 20);
  ok(aH.installBusy('dial-on') === null && hl.some((l) => /the link was lost during the install and it was not seen to end within 400 ms \(dial-on did not answer\)/.test(l)), 'a machine that never answers again ⇒ held for holdMs, then freed saying the install was NOT seen to end', hl.filter((l) => /slot/.test(l)));
  // the stream's own endings are named, never a made-up exit 1
  phase.v = 'plan';
  const endAs = async (ret) => { const h = { ...slowHosts, deviceBounded: async () => ({ ...(await slowHosts.deviceBounded()), runStream: async () => ret }) }; phase.v = 'plan'; return ACC.create({ hosts: h, local: () => null, install: false, log: quiet, pollMs: 60000 }).installXpra('dial-on').then(() => null, (e) => e); };
  const eBelt = await endAs({ error: 'run-stream timed out', timedOut: true });
  ok(eBelt && eBelt.code === 'install_timeout' && !/exited/.test(eBelt.message), 'a run-stream that settles on its belt ⇒ install_timeout (the pre-fix answer was `the install exited 1`)', eBelt && eBelt.message);
  const eReal = await endAs({ code: 100, sent: 0 });
  ok(eReal && eReal.code === 'install_failed' && /exited 100/.test(eReal.message), 'a REAL non-zero exit is still install_failed with its code');
  const eUnrec = await endAs({ code: M.INSTALL_UNRECORDED_EXIT, sent: 0 });
  ok(eUnrec && eUnrec.code === 'install_unrecorded', 'an install that ended without recording its exit (killed / a reboot) ⇒ install_unrecorded by name, never a made-up code');
  clearInterval(loopHold);
}

console.log('\n§tree the patched copies never touch the tree');
for (const r of copiesCensus(MUT.files, MUT.dir, REPO, { minCopies: 3 })) ok(r.pass, '§tree ' + r.name + (r.pass ? '' : ' — ' + r.detail));
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);

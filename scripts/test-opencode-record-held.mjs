#!/usr/bin/env node
// test-opencode-record-held — THE OpenCode SERVE's RECORD UNDER THE STORE-READ LAW (主开发 r3334 unit 1, the GO r3341; lane bl-chat-b).
// data/opencode-serve.json names the serve a hub started (its port, its pid and start time): the release read ANY failure of it as «no
// record», started a SECOND serve and wrote its record over the file, so a serve still running from the earlier life became an orphan
// nobody adopts or stops (and a Disable read «nothing to stop» and removed the file). These legs, each with a stand-in serve (no real
// `opencode`, no vendor call), the unreadable file made by a PLACED refusal of the read call (EIO — never a mount, never a mode change):
//   ① HELD (a read that failed): no serve is started by the record's silence on any road (a page's discovery, the boot replay, the
//      person's Start: refused BY NAME before any change, 503 serve_record_unread); a Disable is refused by name before any change;
//      nothing is written over, removed or signalled; the hold is listed for the family's notice; at the LIFT (the read answers again)
//      the running serve is ADOPTED with no restart and no second serve.
//   ② TORN bytes: kept aside once (0600, the same bytes), NEVER lifted as empty by themselves (a later ladder, the boot replay start
//      nothing); the person's own Start begins a new serve and writes a fresh record; a new serve that ends before it answers (a
//      stand-in program that finds its port held by the serve from before) is said BY NAME and parked — no respawn in a row; a Disable
//      saves the switch off and says nothing could be stopped; the card's line stays until the person dismisses it.
//   ③ THE SSH RUNG's single-file twin (data/bin/vibespace-opencode-op): an unreadable record and torn bytes fail the op by name and
//      start nothing (torn bytes kept aside once, 0600).
//   ④ THE ROUTE answers a plugin's own held code (503 + its code) — the page words it from the family's ONE table.
//   ⑤ THE RECORD's ROADS: one read, one write, one removal in the module (a second road would read it without the hold).
//   RED CONTROLS: copies with the release's read (① ② red), the release's plugin verbs (① red), the release's twin (③ red), the
//   torn-start park cut (② red), a planted second read (⑤ red).
// FAST: stand-in serves over a fake fetch, a few node children (a holder pid, a port holder, the twin).
import './scratch.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { anchored, scratch } from './scratch.mjs';
import { checker } from './lib/check.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const { ok: check0, report } = checker();
const ok = (name, cond, detail) => { if (typeof name !== 'string') throw new TypeError('ok(name, cond): this suite\'s legs are NAME-FIRST'); return check0(!!cond, name, detail); };
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const J = JSON.stringify;
const serve = require(path.join(REPO, 'src/opencode-serve.js'));
const plugin = require(path.join(REPO, 'src/plugins/opencode-serve.js'));
const HOLD = require(path.join(REPO, 'src/store-read-hold.js'));
const PI = require(path.join(REPO, 'src/proc-identity.js'));
const { mutantCopies } = await import(path.join(REPO, 'scripts/mutant-copy.mjs'));
const MO = mutantCopies('oc-record-held', REPO);
const ROOT = scratch('oc-record-held'); fs.mkdirSync(ROOT, { recursive: true });
let dirs = 0;
const mkdir = () => { const d = path.join(ROOT, `d${++dirs}`); fs.mkdirSync(d, { recursive: true }); return d; };
const kids = new Set();
process.on('exit', () => { for (const c of kids) { try { c.kill('SIGKILL'); } catch { } } });
const own = (c) => { kids.add(c); c.on('exit', () => kids.delete(c)); return c; };

// ── THE PLACED REFUSAL: the record's read call answers EIO while its path is in `refused` (sync and promise reads alike) ──
const realRead = fs.readFileSync, realPRead = fs.promises.readFile;
const refused = new Set();
const eio = (p) => Object.assign(new Error('EIO: i/o error, read'), { code: 'EIO', errno: -5, syscall: 'read' });
fs.readFileSync = function (p, ...a) { if (typeof p === 'string' && refused.has(path.resolve(p))) throw eio(p); return realRead.call(this, p, ...a); };
fs.promises.readFile = async function (p, ...a) { if (typeof p === 'string' && refused.has(path.resolve(p))) throw eio(p); return realPRead.call(this, p, ...a); };

// ── STAND-IN SERVES: a fake fetch answers the ports in `answering`; a holder process gives a live pid with a real start time ──
const answering = new Set();
const resp = (o, status = 200) => new Response(J(o), { status, headers: { 'content-type': 'application/json' } });
const fetchImpl = async (url) => {
  const u = new URL(String(url));
  if (!answering.has(Number(u.port))) throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } });
  if (u.pathname === '/global/health') return resp({ healthy: true, version: '1.18.29' });
  if (u.pathname === '/doc') return resp({ paths: {} });
  if (u.pathname === '/project/current') return resp({ worktree: '/work/alpha', vcs: 'git' });
  return resp({}, 404);
};
const execImpl = (cmd, args, opts, cb) => { try { fs.mkdirSync(path.join(opts.cwd, '.git'), { recursive: true }); fs.writeFileSync(path.join(opts.cwd, '.git', 'HEAD'), 'ref: refs/heads/main\n'); cb(null, '', ''); } catch (e) { cb(e); } };
const holder = async () => {
  const c = own(spawn(process.execPath, ['-e', 'setInterval(() => {}, 1e9)'], { stdio: 'ignore' }));
  for (let k = 0; k < 100 && !PI.startToken(c.pid); k++) await sleep(10);
  return c;
};
const recordOf = (dir, port, pid) => ({ port, pid, start: PI.startToken(pid), bootId: PI.bootToken() || null, startedAt: Date.now(), command: '/usr/bin/opencode', cwd: path.join(dir, 'opencode-serve', 'cwd') });
/** a locator over a stand-in serve: every spawn and signal counted (a spawn starts a stand-in that answers on its port) */
function locatorOf(dir, { mod = serve, autostart = () => true, spawnImpl = null, extra = {} } = {}) {
  const spawns = [], signals = [], logs = [];
  const loc = mod.createServeLocator({
    dataDir: dir, command: '/usr/bin/opencode', fetchImpl, execImpl, autostart, guardSampleMs: 0, backoffBaseMs: 20, maxCrashes: 2, bootTimeoutMs: 4000,
    log: { log: () => { }, warn: (l) => logs.push(String(l)), error: (l) => logs.push(String(l)) },
    killPid: (pid, sig) => { signals.push([pid, sig]); },
    spawnImpl: spawnImpl ? (cmd, args, o) => { spawns.push(args); return spawnImpl(cmd, args, o); } : (cmd, args) => {
      spawns.push(args);
      const port = Number(args[args.indexOf('--port') + 1]);
      const c = own(spawn(process.execPath, ['-e', 'setInterval(() => {}, 1e9)'], { stdio: 'ignore' }));
      answering.add(port);
      return c;
    },
    ...extra,
  });
  return { loc, spawns, signals, logs };
}
/** the plugin's verbs over a real locator (the plugin is the control surface: its record is a stand-in) */
function plugOf(loc, rec = { enabled: true, desiredUp: true }, pmod = plugin) {
  const st = { rec: { ...rec }, saves: 0 };
  const facts = { locator: loc, state: () => loc.state(), invalidate() { }, reasonUnavailable: () => null };
  const h = { opts: { opencodeServe: { facts: () => facts, serveEnvOverride: () => null } }, peek: () => st.rec, rec: () => st.rec, save: () => { st.saves++; }, notify: () => { } };
  return { verbs: pmod.create(h), st };
}
const throwsOf = (fn) => { try { fn(); return null; } catch (e) { return e; } };
const rowOf = (file) => HOLD.holds().find((r) => r.file === path.basename(file) && r.held) || null;
const until = async (fn, ms = 3000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return true; await sleep(15); } return !!(await fn()); };

// THE RELEASE's READ, for the red controls (0a031b541: any failure is «no record»)
const OSRC = read('src/opencode-serve.js');
const RELEASE_READ = "  function readRecord() { try { const r = JSON.parse(fs.readFileSync(recordPath, 'utf8')); return r && Number.isInteger(r.port) && r.port > 0 ? r : null; } catch { return null; } }\n";   // stale-pins: kept (the release's read, the red control's replacement — never an anchor)
const READ_RE = /  \/\*\* THE RECORD's ONE READ \(r3334\)[^\n]*\n  function readRecord\(\) \{\n[\s\S]*?\n  \}\n/;   // stale-pins: kept
const RELEASE = MO.load('src/opencode-serve.js', anchored(OSRC, READ_RE, RELEASE_READ, 'the release read'), 'release-read');

console.log('① HELD — a read that failed: nothing started, written, removed or signalled; refused by name; adopted at the lift');
async function heldScene(mod) {
  const dir = mkdir(), file = path.join(dir, 'opencode-serve.json');
  const h = await holder(), port = 41001 + dirs;
  answering.add(port);
  fs.writeFileSync(file, J(recordOf(dir, port, h.pid)));
  const bytes = realRead(file);
  refused.add(file);
  const L = locatorOf(dir, { mod });
  const c1 = await L.loc.client({ budgetMs: 1500 });
  return { dir, file, h, port, bytes, L, c1 };
}
{
  const S = await heldScene(serve);
  const st = S.L.loc.state();
  ok('a page\'s discovery while the record is HELD starts NO serve: no client, no spawn, the file\'s bytes as they were, nothing signalled', S.c1 === null && S.L.spawns.length === 0 && realRead(S.file).equals(S.bytes) && S.L.signals.length === 0, { spawns: S.L.spawns.length, signals: S.L.signals });
  ok('…the ladder parks «held» with the record\'s own sentence (it could not be read, nothing was started, a serve from before may still run)', st.parked === true && st.parkedKind === 'held' && /could not be read \(EIO\)/.test(st.lastError || '') && /nothing was started or stopped/.test(st.lastError || '') && /may still be running/.test(st.lastError || ''), st);
  ok('…and the hold is LISTED for the family\'s one notice (its base name, its code)', !!rowOf(S.file) && rowOf(S.file).code === 'EIO', HOLD.holds());
  const P = plugOf(S.L.loc);
  const eStart = throwsOf(() => P.verbs.start());
  ok('THE PERSON\'s START while held is REFUSED BY NAME (503 serve_record_unread) BEFORE any change: the plugin record not saved, no spawn', !!eStart && eStart.status === 503 && eStart.code === 'serve_record_unread' && /starting the OpenCode background service/.test(eStart.message) && P.st.saves === 0 && S.L.spawns.length === 0, eStart && eStart.message);
  const eEnable = throwsOf(() => P.verbs.enable(true));
  ok('…the switch turned on is the same press: refused by the same name', !!eEnable && eEnable.code === 'serve_record_unread' && P.st.saves === 0);
  P.verbs.bootReplay();
  await sleep(50);
  ok('THE BOOT REPLAY while held starts nothing and saves nothing (its refusal is said in the journal, the lift replays it)', S.L.spawns.length === 0 && P.st.saves === 0);
  const P2 = plugOf(S.L.loc);
  const eStop = throwsOf(() => P2.verbs.stop());
  ok('A DISABLE while held is refused BY NAME before any change (never «nothing to stop»): the switch not saved, the record not removed, nothing signalled', !!eStop && eStop.code === 'serve_record_unread' && /turning the OpenCode background service off/.test(eStop.message) && P2.st.saves === 0 && P2.st.rec.enabled === true && fs.existsSync(S.file) && S.L.signals.length === 0, eStop && eStop.message);
  // THE LIFT: the read answers again — the family's read-again press (readAgainOf) reads it now, the ladder adopts the RUNNING serve
  refused.delete(S.file);
  const lifted = await HOLD.readAgainOf(rowOf(S.file));
  const adopted = await until(() => S.L.loc.state().ready === true);
  const st2 = S.L.loc.state();
  ok('AT THE LIFT the record is read and the running serve ADOPTED — no restart, no second serve, its pid and port, the park gone', lifted === true && adopted && st2.source === 'reused' && st2.pid === S.h.pid && st2.port === S.port && st2.parked === false && S.L.spawns.length === 0 && realRead(S.file).equals(S.bytes), st2);
  // RED CONTROL: the release's read — the same scene starts a SECOND serve and writes its record over the file
  const R = await heldScene(RELEASE);
  await until(() => R.L.loc.state().ready === true, 2000);
  let over = false; try { const now = JSON.parse(realRead(R.file, 'utf8')); over = now.pid !== R.h.pid; } catch { over = false; }
  ok('RED CONTROL (the release\'s read, in a copy): the held scene STARTS a second serve and writes its record over the running one\'s', R.L.spawns.length === 1 && over, { spawns: R.L.spawns.length, over });
  refused.delete(R.file);
  // RED CONTROL: the release's plugin (no refusal) saves the switch before anything is known
  const PSRC = read('src/plugins/opencode-serve.js');
  const RP = MO.load('src/plugins/opencode-serve.js', anchored(PSRC, "        { const no = ocLocator()?.startRefusal?.(); if (no) throw no; }\n", '', 'the start refusal cut'), 'plugin-no-refusal');   // stale-pins: kept
  const S3 = await heldScene(serve);
  const P3 = plugOf(S3.L.loc, { enabled: false, desiredUp: false }, RP);
  const e3 = throwsOf(() => P3.verbs.start());
  ok('RED CONTROL (the start\'s refusal cut, in a copy): the person\'s Start while held is NOT refused — the switch is saved on over a record nobody read', !e3 && P3.st.saves === 1 && P3.st.rec.enabled === true, { e3: e3 && e3.message, saves: P3.st.saves });
  refused.delete(S3.file);
  for (const x of [S, R, S3]) { x.L.loc.stop(); x.L.loc.dispose?.(); x.h.kill('SIGKILL'); }
}

console.log('①b THE PRODUCTION NAMES — the plugin over the REAL module as the hub wires it (install(), its facts().locator)');
{
  const dir = mkdir(), file = path.join(dir, 'opencode-serve.json');
  const h = await holder(), port = 41500 + dirs;
  answering.add(port);
  fs.writeFileSync(file, J(recordOf(dir, port, h.pid)));
  refused.add(file);
  const spawns = [], rec = { enabled: true, desiredUp: true }; let saves = 0;
  // the options src/server/cli-env.js hands install(), with stand-ins for the program, the network and the clock's guard
  serve.install({ dataDir: dir, command: () => '/usr/bin/opencode', fetchImpl, execImpl, autostart: () => true, guardSampleMs: 0, live: false, stopOnExit: false,
    log: { log: () => { }, warn: () => { }, error: () => { } }, killPid: () => { throw new Error('no signal in this leg'); }, spawnImpl: (c, a) => { spawns.push(a); throw new Error('no spawn in this leg'); } });
  const P = { verbs: plugin.create({ opts: {}, peek: () => rec, rec: () => rec, save: () => { saves++; }, notify: () => { } }) };   // no stand-in module: require('../opencode-serve') — the production one
  const c1 = await serve.facts().locator.client({ budgetMs: 1000 });
  const e = throwsOf(() => P.verbs.start());
  const st = P.verbs.status(), why = serve.facts().reasonUnavailable();
  ok('THROUGH THE PRODUCTION WIRING (install() + the plugin\'s own require): held ⇒ no serve, the Start refused by name before the save, the card\'s status names the park', c1 === null && spawns.length === 0 && !!e && e.code === 'serve_record_unread' && saves === 0 && st.parked === true && st.parkedKind === 'held' && st.running === false && /could not be read \(EIO\)/.test(why || ''), { e: e && e.message, st, why });
  refused.delete(file);
  await HOLD.readAgainOf(rowOf(file));
  const up = await until(() => serve.facts().locator.state().ready === true);
  ok('…and at the lift the running serve is adopted through the same wiring (the card reads it running, no spawn)', up && P.verbs.status().running === true && P.verbs.status().pid === h.pid && spawns.length === 0, P.verbs.status());
  serve.uninstall();
  // a hold alive at uninstall() is ended with it (the family's list keeps no hold nobody runs)
  const dir2 = mkdir(), file2 = path.join(dir2, 'opencode-serve.json');
  fs.writeFileSync(file2, J(recordOf(dir2, port, h.pid))); refused.add(file2);
  serve.install({ dataDir: dir2, command: () => '/usr/bin/opencode', fetchImpl, execImpl, autostart: () => true, guardSampleMs: 0, live: false, stopOnExit: false, log: { log: () => { }, warn: () => { }, error: () => { } }, spawnImpl: () => { throw new Error('no spawn in this leg'); } });
  await serve.facts().locator.client({ budgetMs: 500 });
  const before = !!rowOf(file2);
  serve.uninstall();
  ok('…uninstall() ends a live hold of the record with it (listed before, gone after)', before && !rowOf(file2), { before });
  refused.delete(file2);
  h.kill('SIGKILL');
}

console.log('② TORN bytes — kept aside once, never lifted as empty by themselves; the person decides');
const TORN = Buffer.from('{"port": 41,"pid": 12');
async function tornScene(mod, opts = {}) {
  const dir = mkdir(), file = path.join(dir, 'opencode-serve.json');
  fs.writeFileSync(file, TORN);
  const L = locatorOf(dir, { mod, ...opts });
  const c1 = await L.loc.client({ budgetMs: 1500 });
  await until(() => L.loc.state().parkedKind === 'torn' && L.loc.state().recordNotice && L.loc.state().recordNotice.copy);
  return { dir, file, L, c1 };
}
const copiesIn = (dir) => fs.readdirSync(dir).filter((n) => n.startsWith('opencode-serve.json.corrupt-'));
{
  const T = await tornScene(serve);
  const st = T.L.loc.state(), cp = copiesIn(T.dir);
  const mode = cp.length ? fs.statSync(path.join(T.dir, cp[0])).mode & 0o777 : null;
  ok('torn bytes start NO serve; their copy is kept aside ONCE (the same bytes, 0600); the live file is left as it was', T.c1 === null && T.L.spawns.length === 0 && cp.length === 1 && realRead(path.join(T.dir, cp[0])).equals(TORN) && mode === 0o600 && realRead(T.file).equals(TORN), { spawns: T.L.spawns.length, cp, mode });
  ok('…the ladder parks «torn» and SAYS so: damaged, where the bytes are kept, a serve from before may still run, the person\'s Start begins a new one', st.parkedKind === 'torn' && st.recordNotice && st.recordNotice.copy === cp[0] && /was damaged/.test(st.lastError || '') && st.lastError.includes(cp[0]) && /your own Start \(the switch, off and on again if it is on\) begins a new one/.test(st.lastError), st);
  // never lifted as empty BY THEMSELVES: a later ladder, a boot replay, a page's discovery
  await T.L.loc.ensure();
  const P = plugOf(T.L.loc);
  P.verbs.bootReplay();
  await T.L.loc.client({ budgetMs: 300 });
  await sleep(80);
  ok('…NOT lifted as empty by themselves: a later ladder, the boot replay and a page\'s discovery start nothing (one copy still)', T.L.spawns.length === 0 && copiesIn(T.dir).length === 1 && realRead(T.file).equals(TORN), { spawns: T.L.spawns.length });
  // the person's own Start: a new serve, a fresh record over the torn bytes (their copy stays)
  P.verbs.start();
  const up = await until(() => T.L.loc.state().ready === true);
  let rec = null; try { rec = JSON.parse(realRead(T.file, 'utf8')); } catch { rec = null; }
  ok('THE PERSON\'s START after torn bytes is their decision: ONE new serve, a fresh record written over the torn bytes, their copy kept', up && T.L.spawns.length === 1 && !!rec && rec.pid === T.L.loc.state().pid && copiesIn(T.dir).length === 1, { spawns: T.L.spawns.length, rec });
  ok('…and the card keeps its line (a serve from before may still run) until the person dismisses it', !!T.L.loc.state().recordNotice);
  const d = P.verbs.config({ dismiss: 'record-notice' });
  ok('…the dismissal (the plugin\'s one setting) takes the line away and nothing else', d && d.dismissed === true && T.L.loc.state().recordNotice === null && T.L.loc.state().ready === true);
  const eCfg = throwsOf(() => P.verbs.config({ port: 1 }));
  ok('…and any other setting is still refused (nothing to configure)', !!eCfg && /nothing to configure/.test(eCfg.message));
  T.L.loc.stop(); T.L.loc.dispose?.();
  // a Disable after torn bytes: the switch saved off, nothing could be stopped — said by name; the line stays
  const D = await tornScene(serve);
  const PD = plugOf(D.L.loc);
  const eD = throwsOf(() => PD.verbs.stop());
  const sd = D.L.loc.state();
  ok('A DISABLE after torn bytes saves the switch OFF and says BY NAME that nothing could be stopped: nothing signalled, the record not removed, the line stays', !eD && PD.st.saves === 1 && PD.st.rec.enabled === false && D.L.signals.length === 0 && fs.existsSync(D.file) && /nothing could be stopped/.test(sd.lastError || '') && !!sd.recordNotice, { eD: eD && eD.message, sd });
  D.L.loc.dispose?.();
  // RED CONTROL: the release's read — torn bytes are «no record»: a serve starts and its record is written over the bytes
  const R = await (async () => { const dir = mkdir(), file = path.join(dir, 'opencode-serve.json'); fs.writeFileSync(file, TORN); const L = locatorOf(dir, { mod: RELEASE }); await L.loc.client({ budgetMs: 1500 }); await until(() => L.loc.state().ready === true, 2000); return { dir, file, L }; })();
  ok('RED CONTROL (the release\'s read, in a copy): torn bytes START a serve and its record is written over them, no copy kept', R.L.spawns.length === 1 && !realRead(R.file).equals(TORN) && copiesIn(R.dir).length === 0, { spawns: R.L.spawns.length });
  R.L.loc.stop();
}
{
  // the person's Start whose new serve ENDS before it answers: a stand-in program that finds its port held by the serve from before
  const hold = own(spawn(process.execPath, ['-e', "const s = require('net').createServer().listen(0, '127.0.0.1', () => { process.stdout.write(String(s.address().port) + '\\n'); }); setInterval(() => {}, 1e9);"], { stdio: ['ignore', 'pipe', 'ignore'] }));
  const heldPort = await new Promise((r) => hold.stdout.once('data', (b) => r(Number(String(b).trim()))));
  const standIn = () => own(spawn(process.execPath, ['-e', `require('net').createServer().listen(${heldPort}, '127.0.0.1').on('error', () => process.exit(1)); setTimeout(() => process.exit(0), 5000);`], { stdio: 'ignore' }));
  const scene = async (mod) => {
    const T = await tornScene(mod, { spawnImpl: () => standIn() });
    plugOf(T.L.loc).verbs.start();
    await until(() => T.L.spawns.length > 0 && T.L.loc.state().parked === true && T.L.loc.state().parkedKind !== 'torn', 4000);
    await sleep(250);   // the crash respawn's floor is 20 ms here: a respawn in a row would have come
    return T;
  };
  const T = await scene(serve);
  const st = T.L.loc.state();
  ok('a new serve that ENDS before it answers (its port held by the serve from before) is said BY NAME and parked — no respawn in a row', T.L.spawns.length === 1 && st.parkedKind === 'torn-start' && /ended before it answered \(code 1\)/.test(st.lastError || '') && /may still be running/.test(st.lastError || ''), { spawns: T.L.spawns.length, st });
  const CUT = "    if (afterTornKids.has(child)) {\n";
  const NP = MO.load('src/opencode-serve.js', anchored(OSRC, CUT, '    if (false) {\n', 'the torn-start park cut'), 'torn-start-cut');   // stale-pins: kept
  const R = await scene(NP);
  ok('RED CONTROL (the torn-start park cut, in a copy): the same failure RESPAWNS in a row (a silent retry loop)', R.L.spawns.length >= 2, { spawns: R.L.spawns.length });
  T.L.loc.stop(); R.L.loc.stop(); hold.kill('SIGKILL');
}

console.log('③ THE SSH RUNG\'s twin — an unreadable record and torn bytes fail the op by name and start nothing');
{
  const TWIN = path.join(REPO, 'data/bin/vibespace-opencode-op');
  const pre = path.join(ROOT, 'refuse-read.cjs');
  fs.writeFileSync(pre, "const fs = require('fs'); const real = fs.readFileSync; const T = process.env.VS_REFUSE_READ;\nfs.readFileSync = function (p, ...a) { if (T && String(p) === T) { const e = new Error('EIO: i/o error, read'); e.code = 'EIO'; throw e; } return real.call(this, p, ...a); };\n");
  const standIn = path.join(ROOT, 'stand-in-opencode');
  fs.writeFileSync(standIn, `#!${process.execPath}\nrequire('fs').writeFileSync(process.env.VS_STARTED_MARK, 'started');\n`); fs.chmodSync(standIn, 0o755);   // this node by its path: the twin's PATH holds none
  const runTwin = async (script, { torn = false } = {}) => {
    const home = mkdir(), base = path.join(home, '.vibespace'), rec = path.join(base, 'opencode-serve.json'), mark = path.join(home, 'started');
    fs.mkdirSync(base, { recursive: true });
    fs.writeFileSync(rec, torn ? TORN : J({ port: 41999, pid: 999999001, startedAt: 1, cwd: path.join(base, 'opencode-serve-cwd') }));
    const env = { PATH: '/usr/bin:/bin', HOME: home, OPENCODE_CMD: standIn, VS_STARTED_MARK: mark, VS_REFUSE_READ: torn ? '' : rec, VS_NO_REAL_CLI: '1' };
    const c = own(spawn(process.execPath, ['-r', pre, script], { env, stdio: ['pipe', 'pipe', 'ignore'] }));
    let out = ''; c.stdout.on('data', (b) => { out += b; });
    c.stdin.end('{"op":"state","params":{}}');
    const ended = new Promise((r) => c.on('exit', r));
    await Promise.race([ended, until(() => fs.existsSync(mark), 4000)]);
    if (fs.existsSync(mark)) { try { c.kill('SIGKILL'); } catch { } }
    await Promise.race([ended, sleep(500)]);
    let ans = null; try { ans = JSON.parse(out.trim().split('\n').pop()); } catch { ans = null; }
    const copies = fs.readdirSync(base).filter((n) => n.startsWith('opencode-serve.json.corrupt-'));
    return { ans, started: fs.existsSync(mark), copies, base, rec, kept: copies.map((n) => ({ mode: fs.statSync(path.join(base, n)).mode & 0o777, same: realRead(path.join(base, n)).equals(TORN) })) };
  };
  const U = await runTwin(TWIN);
  ok('the twin: a record whose read FAILS fails the op BY NAME (could not be read, a serve from before may still run) and starts nothing — its words name the record as ~/.vibespace/opencode-serve.json, never the home folder', !!U.ans && U.ans.ok === false && /could not be read \(EIO\)/.test(U.ans.error) && /may still be running/.test(U.ans.error) && U.ans.error.includes('~/.vibespace/opencode-serve.json') && !U.ans.error.includes(path.dirname(U.base)) && !U.started, U);
  const TT = await runTwin(TWIN, { torn: true });
  ok('the twin: torn bytes are kept aside ONCE (0600, the same bytes), the op fails by name, nothing starts, the record left as it was — the words say the damaged record as a FACT (read again at the next op; a person may remove it), never «stop any serve» and never an order (an agent may read them; a person\'s own serve could be hit)', !!TT.ans && TT.ans.ok === false && /was damaged/.test(TT.ans.error) && /It is read again at the next op; a person may remove it to start fresh/.test(TT.ans.error) && !/stop any|by hand|\. Remove/i.test(TT.ans.error) && !TT.ans.error.includes(path.dirname(TT.base)) && TT.copies.length === 1 && TT.ans.error.includes(TT.copies[0]) && TT.kept[0].mode === 0o600 && TT.kept[0].same && !TT.started && realRead(TT.rec).equals(TORN), TT);
  // RED CONTROL: the release's twin (any failure is «no record») starts the stand-in
  const TSRC = read('data/bin/vibespace-opencode-op');
  const TWIN_RE = /\/\/ THE RECORD's ONE READ \(r3334[\s\S]*?\nfunction readRecord\(\) \{\n[\s\S]*?\n\}\n/;   // stale-pins: kept
  const mut = path.join(ROOT, 'twin-release.cjs');
  fs.writeFileSync(mut, anchored(TSRC, TWIN_RE, "function readRecord() { try { const r = JSON.parse(fs.readFileSync(RECORD, 'utf8')); return r && r.port > 0 ? r : null; } catch { return null; } }\n", 'the twin\'s release read'));   // stale-pins: kept (the release's twin read, the replacement)
  const RU = await runTwin(mut), RT = await runTwin(mut, { torn: true });
  ok('RED CONTROL (the release\'s twin read, in a copy): an unreadable record and torn bytes each START a serve over the record', RU.started && RT.started, { RU: RU.started, RT: RT.started });
}

console.log('⑥ r3675 (line 812\'s round, its must): a record mended or REMOVED by hand is seen with no restart; a machine with no person\'s Start says what works there');
{
  // (a) THE DEVICE's FORM (the device agent installs this module with personStart false): torn bytes park 'torn' with the words of what
  //     works there; the record REMOVED by hand ⇒ the next ladder starts ONE serve, no person's Start, no restart
  const devScene = async (mod) => {
    const dir = mkdir(), file = path.join(dir, 'opencode-serve.json');
    fs.writeFileSync(file, TORN);
    const L = locatorOf(dir, { mod, extra: { personStart: false } });
    await L.loc.client({ budgetMs: 1500 });
    await until(() => L.loc.state().parkedKind === 'torn' && L.loc.state().recordNotice && L.loc.state().recordNotice.copy);
    const words = L.loc.state().lastError || '';
    fs.unlinkSync(file);   // the person removes the damaged record by hand (its copy stays)
    await L.loc.ensure(); await until(() => L.loc.state().ready === true, 4000);
    return { dir, L, words, st: L.loc.state() };
  };
  const D = await devScene(serve);
  ok('THE DEVICE: torn bytes park «torn» with the words of what works on that machine, as a FACT (read again at the next use; a person may remove it) — never an order a tool could give an agent, never a Start, For you or «stop … by hand» it does not have', /was damaged/.test(D.words) && /It is read again at the next use; a person may remove it to start fresh/.test(D.words) && !/Start|For you|by hand|^Remove|\. Remove/.test(D.words), D.words);
  ok('…the record REMOVED by hand ⇒ the next ladder starts exactly ONE serve, with no person\'s Start and no restart; the park gone', D.L.spawns.length === 1 && D.st.ready === true && D.st.parked === false, { spawns: D.L.spawns.length, st: D.st });
  // RED CONTROL: 57bf2ed76's read (torn bytes no person decided on short-circuit the read; the 'torn' park returns at the ladder's top)
  const OLD812 = anchored(anchored(OSRC, "    if (recHold.held()) return null;   // r3675:", "    if (recordHeld()) return null;   // (57bf2ed76) r3675-cut:", 'the read short-circuits on torn bytes'),
    "    if (state.parked && state.parkedKind !== 'torn') {", '    if (state.parked) {', 'the torn park returns at the top');   // stale-pins: kept (57bf2ed76's text — the leg's RED)
  const DR = await devScene(MO.load('src/opencode-serve.js', OLD812, 'torn-short-circuit'));
  ok('RED CONTROL (57bf2ed76\'s read, in a copy): the removed record is never seen — the device stays dark (no serve) until a restart', DR.L.spawns.length === 0 && DR.st.parkedKind === 'torn', { spawns: DR.L.spawns.length, st: DR.st });
  for (const x of [D, DR]) { x.L.loc.stop(); x.L.loc.dispose?.(); }
  // (b) the device's HELD words: no «For you» there (the hold lives in the daemon)
  const dirH = mkdir(), fileH = path.join(dirH, 'opencode-serve.json');
  fs.writeFileSync(fileH, J({ port: 41777, pid: 999999123, startedAt: 1 })); refused.add(fileH);
  const LH = locatorOf(dirH, { extra: { personStart: false } }); await LH.loc.client({ budgetMs: 800 });
  const wH = LH.loc.state().lastError || '';
  ok('THE DEVICE, held: the words say it is read again by itself — never «For you» (the hold lives in that machine\'s daemon)', /could not be read \(EIO\)/.test(wH) && /read again by itself/.test(wH) && !/For you/.test(wH) && LH.spawns.length === 0, wH);
  refused.delete(fileH); LH.loc.stop(); LH.loc.dispose?.();
  {
    const NOOPT = MO.load('src/opencode-serve.js', anchored(OSRC, '  const recWords = (h) => (personStart\n', '  const recWords = (h) => (true\n', 'the device words cut'), 'device-words-cut');   // stale-pins: kept (the option's words cut — the leg's RED)
    const dirR = mkdir(), fileR = path.join(dirR, 'opencode-serve.json');
    fs.writeFileSync(fileR, J({ port: 41778, pid: 999999125, startedAt: 1 })); refused.add(fileR);
    const LR = locatorOf(dirR, { mod: NOOPT, extra: { personStart: false } }); await LR.loc.client({ budgetMs: 800 });
    const wR = LR.loc.state().lastError || '';
    ok('RED CONTROL (the option\'s words cut, in a copy): the device is told of For you, which it does not have', /For you/.test(wR), wR);
    refused.delete(fileR); LR.loc.stop(); LR.loc.dispose?.();
  }
  // (c) THE HUB: a record MENDED by hand (naming the running serve) while parked 'torn' ⇒ the next discovery adopts it — no Start
  const h = await holder(), dirM = mkdir(), fileM = path.join(dirM, 'opencode-serve.json'), portM = 41600 + dirs;
  answering.add(portM); fs.writeFileSync(fileM, TORN);
  const LM = locatorOf(dirM); await LM.loc.client({ budgetMs: 1500 });
  await until(() => LM.loc.state().parkedKind === 'torn' && LM.loc.state().recordNotice && LM.loc.state().recordNotice.copy);
  fs.writeFileSync(fileM, J(recordOf(dirM, portM, h.pid)));   // the person mends it by hand
  await LM.loc.client({ budgetMs: 3000 }); await until(() => LM.loc.state().ready === true);
  const sM = LM.loc.state();
  ok('THE HUB: a record MENDED by hand while «torn» is seen at the next discovery — the running serve ADOPTED (its pid), no spawn, no Start, the park gone', sM.ready === true && sM.source === 'reused' && sM.pid === h.pid && LM.spawns.length === 0 && sM.parked === false, sM);
  LM.loc.stop(); LM.loc.dispose?.();
  {
    const dirMR = mkdir(), fileMR = path.join(dirMR, 'opencode-serve.json'), portMR = 41700 + dirs;
    answering.add(portMR); fs.writeFileSync(fileMR, TORN);
    const LMR = locatorOf(dirMR, { mod: MO.load('src/opencode-serve.js', OLD812, 'torn-short-circuit-hub') }); await LMR.loc.client({ budgetMs: 1500 });
    await until(() => LMR.loc.state().parkedKind === 'torn' && LMR.loc.state().recordNotice && LMR.loc.state().recordNotice.copy);
    fs.writeFileSync(fileMR, J(recordOf(dirMR, portMR, h.pid)));
    await LMR.loc.client({ budgetMs: 1500 }); await sleep(300);
    const sMR = LMR.loc.state();
    ok('RED CONTROL (57bf2ed76\'s read, in a copy): the record mended by hand is never seen — still «torn», no serve adopted', sMR.ready === false && sMR.parkedKind === 'torn' && LMR.spawns.length === 0, sMR);
    LMR.loc.stop(); LMR.loc.dispose?.();
  }
  h.kill('SIGKILL');
  // (d) HELD, THEN TORN AT THE LIFT, THEN THE PERSON's START (the helper's read meets the bytes, not ours: the decision reads their kept copy off the loop)
  const dirT = mkdir(), fileT = path.join(dirT, 'opencode-serve.json');
  fs.writeFileSync(fileT, J({ port: 41888, pid: 999999124, startedAt: 1 })); refused.add(fileT);
  const LT = locatorOf(dirT); await LT.loc.client({ budgetMs: 800 });
  const heldFirst = LT.loc.state().parkedKind === 'held';
  fs.writeFileSync(fileT, TORN); refused.delete(fileT);
  await HOLD.readAgainOf(rowOf(fileT));
  await until(() => LT.loc.state().parkedKind === 'torn' && LT.loc.state().recordNotice && LT.loc.state().recordNotice.copy);
  const PT = plugOf(LT.loc); PT.verbs.start();
  const upT = await until(() => LT.loc.state().ready === true);
  let recT = null; try { recT = JSON.parse(realRead(fileT, 'utf8')); } catch { recT = null; }
  ok('HELD → TORN at the lift → the person\'s Start: the decision is tied to the bytes through their KEPT copy (read off the loop) — ONE new serve, a fresh record, the copy kept', heldFirst && upT && LT.spawns.length === 1 && !!recT && recT.pid === LT.loc.state().pid && copiesIn(dirT).length === 1, { heldFirst, spawns: LT.spawns.length, recT });
  LT.loc.stop(); LT.loc.dispose?.();
  {
    const NOCOPY = MO.load('src/opencode-serve.js', anchored(OSRC, "    if (torn && torn.decided && !torn.bytes && !Number.isInteger(torn.size) && torn.copy) { await tornBytesOfCopy(); if (cancelled(epoch)) return null; }", '', 'the kept copy\'s read cut'), 'kept-copy-read-cut');   // stale-pins: kept (the kept copy's read cut — the leg's RED)
    const dirTR = mkdir(), fileTR = path.join(dirTR, 'opencode-serve.json');
    fs.writeFileSync(fileTR, J({ port: 41889, pid: 999999126, startedAt: 1 })); refused.add(fileTR);
    const LTR = locatorOf(dirTR, { mod: NOCOPY }); await LTR.loc.client({ budgetMs: 800 });
    fs.writeFileSync(fileTR, TORN); refused.delete(fileTR);
    await HOLD.readAgainOf(rowOf(fileTR));
    await until(() => LTR.loc.state().parkedKind === 'torn' && LTR.loc.state().recordNotice && LTR.loc.state().recordNotice.copy);
    plugOf(LTR.loc).verbs.start(); await sleep(600);
    ok('RED CONTROL (the kept copy\'s read cut, in a copy): the person\'s Start after a helper-met tear cannot be tied to the bytes — no serve starts, the park «torn» again', LTR.spawns.length === 0 && LTR.loc.state().parkedKind === 'torn', { spawns: LTR.spawns.length, st: LTR.loc.state() });
    LTR.loc.stop(); LTR.loc.dispose?.();
  }
}

console.log('⑦ r3675: the card says what works — «off and on» when the switch is on, the true way out when the bytes cannot be compared');
{
  const PUI = read('src/lib/plugins-ui.js');
  const fnSrc = (/\nfunction serveRecordWords\(p\) \{\n[\s\S]*?\n\}\n/.exec(PUI) || [''])[0];
  const srw = fnSrc ? new Function('t', `${fnSrc}\nreturn serveRecordWords;`)((x) => x) : null;
  const w = (p) => (srw ? srw(p) : null);
  ok('THE CARD\'s WORD STEP, DRIVEN (its function out of the real file): held · torn with the switch off (on starts a new one) · torn with the switch ON (off and on again) · torn that cannot be compared (remove by hand) · torn-start · nothing for no park', !!srw
    && /cannot read the record/.test(w({ parkedKind: 'held' })) && /turning the switch on starts a new one/.test(w({ parkedKind: 'torn', enabled: false })) && /turning the switch off and on again starts a new one/.test(w({ parkedKind: 'torn', enabled: true }))
    && /could not be compared/.test(w({ parkedKind: 'torn', enabled: true, recordNotice: { undecidable: true } })) && /ended before it answered/.test(w({ parkedKind: 'torn-start' })) && w({ parkedKind: null }) === '' && w(null) === '',
    [w({ parkedKind: 'held' }), w({ parkedKind: 'torn', enabled: true })].map((x) => String(x).slice(0, 60)));
  ok('the card\'s words by the park: «held» · «torn» (off and on again when the switch is on; remove by hand when the bytes cannot be compared) · «torn-start»; the record\'s line dismissed through the plugin\'s one setting', /p\.parkedKind === 'torn' && p\.recordNotice && p\.recordNotice\.undecidable\) return t\('The record of the OpenCode background service was damaged, and its bytes could not be compared/.test(PUI)
    && /p\.parkedKind === 'torn' && p\.enabled\) return t\('[^']*turning the switch off and on again starts a new one/.test(PUI) && /p\.parkedKind === 'held' \? t\(/.test(PUI) && /p\.parkedKind === 'torn-start' \? t\(/.test(PUI)
    && PUI.includes("api('config', { body: JSON.stringify({ dismiss: 'record-notice' }) })"));
}

console.log('④ THE ROUTE answers a plugin\'s own held code (503 + its code)');
{
  const W = read('src/server/mounts-plugins-wiring.js');
  const lines = W.split('\n').filter((l) => /^const (heldOf|pluginRefusal) = /.test(l));
  const fn = new Function(`${lines.join('\n')}\nreturn pluginRefusal;`)();
  const resOf = () => { const r = { code: 0, body: null, status(c) { r.code = c; return r; }, json(b) { r.body = b; return r; } }; return r; };
  const held = Object.assign(new Error('starting the OpenCode background service: …'), { code: 'serve_record_unread', status: 503 });
  const a = fn(resOf(), held), b = fn(resOf(), new Error('the opencode CLI is not on PATH')), c = fn(resOf(), Object.assign(new Error('x'), { code: 'plugins_unread' }));
  ok('a plugin door\'s refusal: a held store\'s 503 carries its code (the page words it from the family\'s table); any other refusal stays 400 with no code', lines.length === 2 && a.code === 503 && a.body.code === 'serve_record_unread' && b.code === 400 && !('code' in b.body) && c.code === 503 && c.body.code === 'plugins_unread', { a: a.body, b: b.body });
  const U = read('src/lib/utils.js');
  ok('…the family\'s ONE table has the code\'s row (the page\'s refusal step words it)', /\n  serve_record_unread: \(\) => t\('VibeSpace cannot read the record of its OpenCode background service right now/.test(U));
}

console.log('⑤ THE RECORD\'s ROADS — one read, one write, one removal, each behind the hold');
{
  const roads = (src) => ({ reads: src.split('fs.readFileSync(recordPath').length - 1, writes: src.split('writeJsonAtomic(recordPath').length - 1, removes: src.split('fs.unlinkSync(recordPath)').length - 1 });
  const r = roads(OSRC);
  const guard = /function clearRecord\(owns = null\) \{\n    if \(recordHeld\(\)\) return false;/.test(OSRC) && /function readRecord\(\) \{\n    if \(recHold\.held\(\)\) return null;/.test(OSRC);
  ok('the module reads, writes and removes data/opencode-serve.json at ONE site each, and the read and the removal ask the hold first', r.reads === 1 && r.writes === 1 && r.removes === 1 && guard, r);
  const planted = OSRC.replace('  function snapshot() {', '  function peekRecord() { try { return JSON.parse(fs.readFileSync(recordPath, \'utf8\')); } catch { return null; } }\n  function snapshot() {');   // stale-pins: kept
  ok('CONTROL: a planted second read of the record (a road that does not ask the hold) is RED by count', roads(planted).reads === 2);
}

fs.readFileSync = realRead; fs.promises.readFile = realPRead;
report();

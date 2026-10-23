#!/usr/bin/env node
// LANE BROWSER-DAEMON-SURVIVES-UPDATE (B-1574 — userW, profile jarvis-work, FOUR freezes 10-05..10-18, each a working day's
// browser, after server auto-updates) — THE REAL DAEMON, THE REAL CHROME, THE REAL KEEPER (heavy, run ALONE). The installed
// agent-browser drives this box's Chrome headless, every browser in a PRIVATE HOME / XDG_RUNTIME_DIR under this run's /tmp
// root (never the owner's browsers, never his session bus); the process census only ever sees this run's processes.
//   Ⓐ A RESTART JUDGES THE PAGE'S ANSWERS: every renderer of the browser SIGSTOPped (the measured hung page) ⇒ its endpoint
//      (/json/version, /json/list) still answers and no page does; the keeper's tick never judges it; the agent's restart is
//      ADMITTED and the new browser's page answers. RED CONTROL: the pre-fix keeper (the endpoint's verdict alone) refuses
//      it browser_answering — the incident's refusal.
//   Ⓑ A DAEMON WHOSE CHROME IS GONE ENDS: its record stopped (what a boot that could not adopt it leaves), its Chrome
//      SIGKILLed ⇒ the daemon lives on, `session info` still active (measured) — kept inside the bound, ENDED past it though
//      a lease holds it, said in the journal, the row and `status`; the next start brings a fresh browser. RED CONTROL: the
//      pre-fix verdict keeps it ("a lease holds it").
//   Ⓒ A SERVER RESTART RE-OWNS OR ENDS: three browsers left running by a stopped server — one healthy, one whose whole
//      Chrome is SIGSTOPped (`session info` answers, nothing else), one whose record a pre-fix boot left stopped ⇒ the boot
//      RE-OWNS the first and the third (same daemon, ready) and ENDS the second with its Chrome; that profile's next start is
//      fresh and answers. RED CONTROL: the pre-fix boot adopts the wedged one ready and leaves the third unowned.
//   Ⓓ (lane browser-shared-profile-freeze, fleet fb-8727ee62fb) A SERVER RESTART ON THE SCOPE ROAD: a lease's url is served by
//      the server (the proxy) — the Update takes it; the daemon and Chrome outlive it, the boot re-owns them, the next command's
//      new url reaches the same daemon, browser and tab. RED CONTROL: the old url reaches nothing after the restart.
// SKIPs with evidence without the real binary / a Chrome it can launch. Zero vendor calls; ends every process this run's root started.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { scratch, freePort, endRootedProcesses } from './scratch.mjs';
const require = createRequire(import.meta.url);
const REPO = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const { WebSocket } = require('ws');
const K = require('../src/server/browser-keeper.js'), Ff = require('../src/browser-facts.js'), V = require('../src/browser-verbs.js');
const VP = require('../src/server/browser-viewport.js'), BS = require('../src/browser-stuck.js'), O = require('../src/browser-orphans.js');

let pass = 0, fail = 0, skipped = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? '\n    ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 1600) : '')); } return !!c; };
const skip = (n) => { skipped++; console.log('  ⊘ SKIP ' + n); };
const done = () => { console.log(fail ? `\nFAILED (${pass} passed, ${fail} failed, ${skipped} skipped)` : `\nALL PASS (${pass}${skipped ? `, ${skipped} skipped` : ''})`); process.exit(fail ? 1 : 0); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 5000, step = 50) { const t0 = Date.now(); for (;;) { let v; try { v = await fn(); } catch { v = false; } if (v) return v; if (Date.now() - t0 > ms) return null; await sleep(step); } }
const alive = (pid) => Number.isInteger(pid) && Ff.pidAlive(pid);
// the session bus is never handed on (the owner's), nor any VibeSpace / agent-browser setting of the shell this runs in
const BASE_ENV = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('AGENT_BROWSER_') && !k.startsWith('VIBESPACE_') && !['DISPLAY', 'WAYLAND_DISPLAY', 'XDG_SESSION_TYPE', 'DBUS_SESSION_BUS_ADDRESS'].includes(k)));
const REAL_AB = (() => { try { return Ff.binaryResolver('agent-browser', BASE_ENV)(); } catch { return null; } })();
let ver = null; try { ver = REAL_AB ? execFileSync(REAL_AB, ['--version'], { encoding: 'utf8', timeout: 8000, env: BASE_ENV }).trim() : null; } catch { /* none */ }
if (!ver) { skip(`no real agent-browser resolves on PATH past the shim (PATH=${BASE_ENV.PATH || ''})`); done(); }
console.log(`agent-browser: ${REAL_AB} (${ver})`);

const ROOT = scratch('bdaemon');
fs.rmSync(ROOT, { recursive: true, force: true }); fs.mkdirSync(ROOT, { recursive: true });
let cleaned = false;
const cleanup = () => { if (cleaned) return; cleaned = true; try { endRootedProcesses(ROOT); } catch { /* none */ } try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { /* next run */ } };
process.on('exit', cleanup);
for (const sg of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sg, () => { cleanup(); process.exit(130); });

// ── a loopback page (no vendor) ──
const PORT = await freePort();
const pages = http.createServer((req, res) => { res.setHeader('content-type', 'text/html; charset=utf-8'); res.end(`<!doctype html><title>BD ${req.url}</title><p>the page at ${req.url}</p>`); }).listen(PORT, '127.0.0.1');
const U = (p) => `http://127.0.0.1:${PORT}${p}`;

/** A raw browser-level CDP client (the renderers' pids — Chrome's processes are not dumpable, measured — and a new tab). */
async function cdp(url) {
  const ws = new WebSocket(url); await new Promise((res, rej) => { ws.once('open', res); ws.once('error', rej); });
  let id = 0; const wait = new Map();
  ws.on('message', (m) => { let j; try { j = JSON.parse(String(m)); } catch { return; } if (j.id && wait.has(j.id)) { wait.get(j.id)(j); wait.delete(j.id); } });
  const send = (method, params = {}) => new Promise((res) => { const n = ++id; wait.set(n, res); ws.send(JSON.stringify({ id: n, method, params })); setTimeout(() => { if (wait.has(n)) { wait.delete(n); res({ error: { message: 'timeout' } }); } }, 8000); });
  return { send, close: () => { try { ws.terminate(); } catch { /* gone */ } } };
}
const renderersOf = async (c) => { const r = await c.send('SystemInfo.getProcessInfo'); return ((r.result && r.result.processInfo) || []).filter((x) => x.type === 'renderer').map((x) => x.id); };
const getVersion = (cdpUrl, ms = 3000) => new Promise((resolve) => { const u = new URL(String(cdpUrl).replace(/^ws/, 'http')); const t0 = Date.now(); const q = http.get({ host: u.hostname, port: u.port, path: '/json/version', timeout: ms }, (res) => { res.resume(); res.on('end', () => resolve({ ok: res.statusCode === 200, ms: Date.now() - t0 })); }); q.on('timeout', () => q.destroy(new Error('timeout'))); q.on('error', (e) => resolve({ ok: false, error: e.message, ms: Date.now() - t0 })); });

// ── a world: a private home, runtime dir and data dir; the keeper's own processes only (the census sees nothing else) ──
const SET = { 'browser.headed': 'no' };
const KA = 'bk-0000da1a', KB = 'bk-0000db1b', KC = 'bk-0000dc1c';
const live = new Set([KA, KB, KC]);
function world(tag) {
  const D = path.join(ROOT, tag), KH = path.join(D, 'h'), KXD = path.join(D, 'x');
  for (const d of [path.join(KH, '.agent-browser'), KXD, path.join(D, 'data')]) fs.mkdirSync(d, { recursive: true, mode: 0o700 });
  const env = { ...BASE_ENV, HOME: KH, XDG_RUNTIME_DIR: KXD };
  const journal = []; const jl = (m) => journal.push(String(m));
  const mine = (r) => (r.argv || []).some((x) => String(x).includes(D)) || Object.values(r.env || {}).some((x) => String(x).includes(D));
  const daemonTable = async () => { const rows = await Ff.daemonRows(); const keep = new Set(rows.filter(mine).map((r) => r.pid)); for (let n = 0; n < 3; n++) for (const r of rows) if (keep.has(r.ppid)) keep.add(r.pid); return rows.filter((r) => keep.has(r.pid)); };
  const make = (Km = K, x = {}) => Km.create({ dataDir: path.join(D, 'data'), homeDir: KH, env: () => env, serverSetting: (k) => SET[k], liveKeys: () => live, runtime: Ff.createBrowserRuntime({ env }), facts: Ff.createBrowserFacts({ env }), log: { log: jl, warn: jl, error: jl, info: jl }, install: false, tickMs: 3600e3, daemonTable, ...x });
  const store = path.join(D, 'data', 'browser-profiles.json');
  const edit = (fn) => { const doc = JSON.parse(fs.readFileSync(store, 'utf8')); fn(doc); fs.writeFileSync(store, JSON.stringify(doc)); };
  return { D, env, journal, make, edit, daemonTable };
}
const SRC = path.join(REPO, 'src');
const absReq = (src, dir, map = {}) => src.replace(/require\((['"])(\.\.?\/[^'"]+)\1\)/g, (m, q, rel) => 'require(' + JSON.stringify(map[rel] || path.resolve(dir, rel)) + ')');
/** A patched keeper copy (the PRE-FIX shapes) — every require absolute; `orphans` swaps browser-orphans.js for a patched copy. */
function keeperCopy(name, patches = [], orphans = null) {
  let ks = fs.readFileSync(path.join(SRC, 'server/browser-keeper.js'), 'utf8');
  for (const [a, b] of patches) { if (!ks.includes(a)) { ok(false, `CONTROL setup: the needle of ${name} is in src/server/browser-keeper.js`, a); return null; } ks = ks.replace(a, b); }
  const f = path.join(ROOT, `keeper-${name}.js`); fs.writeFileSync(f, absReq(ks, path.join(SRC, 'server'), orphans ? { '../browser-orphans.js': orphans } : {}));
  return require(f);
}

// ═══ Ⓐ A RESTART JUDGES THE PAGE'S ANSWERS ═══
console.log('— Ⓐ every renderer SIGSTOPped: the endpoint answers, no page does — the agent\'s restart');
async function hungPageLeg(Kmod, tag) {
  const w = world(tag); const kk = w.make(Kmod); const r = { tag }; let stopped = [], c = null, p = null;
  try {
    p = kk.createProfile({ label: 'jarvis-work' }, { owner: { kind: 'instance', id: null } });
    await kk.attach({ profileId: p.id, browserKey: KA, sessionId: 'sess-a', by: 'agent' });
    const url0 = kk._reg().browsers[p.id].cdpUrl;
    r.ready = kk.browserOf(p.id).state === 'ready' && /^ws:/.test(String(url0));
    c = await cdp(url0);
    await c.send('Target.createTarget', { url: U('/mail') });
    await until(async () => { const a = await VP.pageAnswers(url0, { timeoutMs: 2000 }); return a.list && a.pages.length >= 1 && a.pages.every((x) => x.answered); }, 10000, 200);
    r.before = (await VP.pageAnswers(url0, { timeoutMs: 3000 })).pages.map((x) => ({ answered: x.answered, ms: x.ms }));
    stopped = await renderersOf(c);
    for (const pid of stopped) process.kill(pid, 'SIGSTOP');
    r.renderers = stopped.length;
    r.version = await getVersion(url0);
    const a = await VP.pageAnswers(url0, { timeoutMs: 3000 });
    r.during = { list: a.list, pages: a.pages.length, answered: a.pages.filter((x) => x.answered).length, reached: a.pages.filter((x) => x.reached).length };
    await kk.tick(); await kk.tick();
    r.judged = !!kk.browserOf(p.id).unresponsive;
    r.chrome0 = (kk.browserOf(p.id).browser || {}).pid;
    const t0 = Date.now();
    try { await kk.restartProfile(p.id, { by: 'agent', browserKey: KA, sessionName: 'Research' }); r.restarted = true; } catch (e) { r.refused = { code: e.code, message: e.message }; }
    r.restartMs = Date.now() - t0;
    if (r.restarted) {
      const url1 = kk._reg().browsers[p.id].cdpUrl;
      r.chrome1 = (kk.browserOf(p.id).browser || {}).pid;
      r.after = await VP.pageAnswers(url1, { timeoutMs: 3000 });
      r.after = { list: r.after.list, pages: r.after.pages.length, answered: r.after.pages.filter((x) => x.answered).length };
    }
    r.lines = w.journal.filter((l) => /restart/.test(l));
  } catch (e) { r.threw = String(e && e.stack); }
  for (const pid of stopped) { try { process.kill(pid, 'SIGCONT'); } catch { /* gone with its browser */ } }
  if (c) c.close();
  if (p) await kk.stop(p.id).catch(() => { });
  kk.shutdown();
  return r;
}
{
  const a = await hungPageLeg(K, 'a-fixed');
  ok(!a.threw && a.ready && a.renderers >= 1 && a.version.ok && a.during.list && a.during.pages >= 1 && a.during.answered === 0, `Ⓐ the incident's shape on the real browser: ${a.renderers} renderer(s) SIGSTOPped ⇒ /json/version answers (${a.version.ms} ms) and the page list too, ${a.during.answered} of ${a.during.pages} page(s) answer Runtime.evaluate (${a.during.reached} reached by Page.getNavigationHistory)`, a);
  ok(!a.threw && a.judged === false, 'Ⓐ the keeper\'s own tick never judges it (its endpoint answers) — no browser_unresponsive verdict to admit a restart', a.judged);
  ok(!a.threw && a.restarted && a.chrome1 && a.chrome1 !== a.chrome0 && a.after && a.after.list && a.after.answered >= 1 && a.lines.some((l) => /restarted by the conversation "Research" — none of its \d+ page\(s\) answered within 5 s/.test(l)),
    `Ⓐ the agent's restart is ADMITTED on the pages' answers (${a.restartMs} ms with the 5 s ask): a new Chrome (${a.chrome0} → ${a.chrome1}) whose page answers; the journal says why`, a);
  const Kpre = keeperCopy('endpoint-only', [['        pages = BS.pageAnswerVerdict(await askPages(rec));\n', '']]);
  const ctl = Kpre ? await hungPageLeg(Kpre, 'a-pre') : null;
  ok(ctl && !ctl.threw && ctl.renderers >= 1 && ctl.during.answered === 0 && ctl.refused && ctl.refused.code === 'browser_answering' && !ctl.restarted, `Ⓐ RED CONTROL: the pre-fix keeper (the endpoint's verdict alone) refuses the same hung page: "${ctl && ctl.refused && ctl.refused.message}" — userW's refusal; the leg above can go red`, ctl);
}

// ═══ Ⓑ A DAEMON WHOSE CHROME IS GONE ENDS ═══
console.log('— Ⓑ a daemon no live record keeps, its Chrome SIGKILLed: kept inside the bound, ended past it — though leased');
async function outlivesLeg(Kmod, tag, BOUND = 3000) {
  const w = world(tag); const r = { tag };
  const k1 = w.make(K); let k2 = null; let p = null, daemon = null, chrome = null;
  try {
    p = k1.createProfile({ label: 'Mail' }, { owner: { kind: 'instance', id: null } });
    await k1.attach({ profileId: p.id, browserKey: KB, sessionId: 'sess-b', by: 'agent' });
    const rec1 = { ...k1._reg().browsers[p.id] }; daemon = rec1.pid; chrome = rec1.browser && rec1.browser.pid;
    r.launched = alive(daemon) && alive(chrome);
    k1.shutdown(); // the server goes; the daemon and its Chrome stay
    // what a boot that could not adopt it leaves on disk: the record stopped, the daemon still running, the lease kept
    w.edit((doc) => { Object.assign(doc.browsers[p.id], { state: 'stopped', endedAt: Date.now(), lastError: 'the recorded daemon is alive but its namespace no longer answers' }); });
    process.kill(chrome, 'SIGKILL');
    r.chromeGone = !!(await until(() => !alive(chrome), 5000));
    const info = await Ff.createBrowserRuntime({ env: w.env }).info(rec1.ns, { dir: p.dir });
    r.infoActive = info.active === true && info.pid === daemon; // the measured lie: active, with no Chrome
    k2 = w.make(Kmod, { browserEndedMs: BOUND, orphanScanMs: 200 });
    await k2.tick(); r.inside = alive(daemon); // the census sees its Chrome gone from now
    await sleep(BOUND + 600); await k2.tick();
    r.past = alive(daemon); r.leased = k2.leasesOn ? k2.leasesOn(p.id).length : null;
    r.note = k2.browserOf(p.id).note || null; r.cell = V.browserCell(k2.browserOf(p.id));
    r.lines = w.journal.filter((l) => l.includes(`ended the browser daemon pid ${daemon} `));
    if (!r.past) { await k2.start(p.id, { why: 'the next command' }); const u = k2._reg().browsers[p.id].cdpUrl; const a = await VP.pageAnswers(u, { timeoutMs: 3000 }); r.fresh = { daemon: k2.browserOf(p.id).pid, list: a.list }; }
  } catch (e) { r.threw = String(e && e.stack); }
  if (k2 && p) await k2.stop(p.id).catch(() => { });
  if (k2) k2.shutdown();
  return r;
}
{
  const b = await outlivesLeg(K, 'b-fixed');
  ok(!b.threw && b.launched && b.chromeGone && b.infoActive, 'Ⓑ the measured shape: its Chrome SIGKILLed, the daemon reaps it and lives on — its own `session info` still says active, with no browser', b);
  ok(!b.threw && b.inside === true && b.past === false && b.leased >= 1, `Ⓑ KEPT inside the bound, ENDED past it — a lease holding it (${b.leased}) and no live record keeping it`, b);
  ok(!b.threw && b.lines.length === 1 && /its browser ended \d+ s ago and no live record keeps it/.test(b.lines[0]) && /^stopped — its browser daemon was ended at \d\d:\d\d UTC: its browser ended \d+ s ago/.test(b.note || '') && b.cell === b.note, 'Ⓑ never a silent exit: one journal line, the row\'s words, and `status` (its browser cell) all say it', { lines: b.lines, note: b.note, cell: b.cell });
  ok(!b.threw && b.fresh && b.fresh.list && b.fresh.daemon !== undefined, 'Ⓑ the next start brings a FRESH daemon and browser that answer', b.fresh);
  ok(O.BROWSER_ENDED_MS === 60000, 'Ⓑ production\'s bound is 60 s (this leg runs it at 3 s, injected)');
  const pre = path.join(ROOT, 'orphans-pre-fix.js');
  fs.writeFileSync(pre, fs.readFileSync(path.join(SRC, 'browser-orphans.js'), 'utf8').replace('  if (d.stoppedIdleAt != null && d.starttime != null && !d.cdp) {\n', '  if (false) {\n'));
  const Kpre = keeperCopy('pre-other-half', [], pre);
  const ctl = Kpre ? await outlivesLeg(Kpre, 'b-pre') : null;
  ok(ctl && !ctl.threw && ctl.chromeGone && ctl.past === true && ctl.lines.length === 0, 'Ⓑ RED CONTROL: the pre-fix verdict keeps the daemon whose Chrome is gone ("a lease holds it") past the bound — the leg above can go red', ctl && { past: ctl.past, lines: ctl.lines, note: ctl.note });
}

// ═══ Ⓒ A SERVER RESTART RE-OWNS OR ENDS ═══
console.log('— Ⓒ a server restart over three running browsers: healthy, wedged (its whole Chrome SIGSTOPped), and one a pre-fix boot left unowned');
async function bootLeg(Kmod, tag) {
  const w = world(tag); const r = { tag }; const k1 = w.make(K); let k2 = null; const ids = {}, d = {}, c = {}; let wedged = null;
  try {
    for (const [n, key] of [['healthy', KA], ['wedged', KB], ['unowned', KC]]) {
      const p = k1.createProfile({ label: n }, { owner: { kind: 'instance', id: null } }); ids[n] = p.id;
      await k1.attach({ profileId: p.id, browserKey: key, sessionId: 'sess-' + n, by: 'agent' });
      const rec = k1._reg().browsers[p.id]; d[n] = rec.pid; c[n] = rec.browser && rec.browser.pid;
    }
    r.launched = Object.values(d).every(alive) && Object.values(c).every(alive);
    k1.shutdown(); // the server stops (an Update: scripts/update.sh → a systemd restart) — every browser keeps running
    w.edit((doc) => { Object.assign(doc.browsers[ids.unowned], { state: 'stopped', endedAt: Date.now(), lastError: 'the recorded daemon is alive but its namespace no longer answers' }); });
    wedged = c.wedged; process.kill(wedged, 'SIGSTOP'); // the whole Chrome: its endpoint silent, its daemon still answering
    k2 = w.make(Kmod);
    const t0 = Date.now(); await k2.boot(); r.bootMs = Date.now() - t0;
    const v = (n) => k2.browserOf(ids[n]) || {};
    r.healthy = { state: v('healthy').state, same: v('healthy').pid === d.healthy, alive: alive(d.healthy) };
    r.unowned = { state: v('unowned').state, same: v('unowned').pid === d.unowned, alive: alive(d.unowned) };
    r.wedged = { state: v('wedged').state, daemonAlive: alive(d.wedged), chromeAlive: alive(c.wedged), lastError: v('wedged').lastError || null, note: v('wedged').note || null };
    r.lines = w.journal.filter((l) => /boot: the browser daemon/.test(l));
    if (!r.wedged.daemonAlive) { await k2.start(ids.wedged, { why: 'the next command' }); const a = await VP.pageAnswers(k2._reg().browsers[ids.wedged].cdpUrl, { timeoutMs: 3000 }); r.fresh = { state: k2.browserOf(ids.wedged).state, list: a.list, newDaemon: k2.browserOf(ids.wedged).pid !== d.wedged }; }
  } catch (e) { r.threw = String(e && e.stack); }
  try { if (wedged) process.kill(wedged, 'SIGCONT'); } catch { /* ended */ }
  if (k2) { for (const id of Object.values(ids)) await k2.stop(id).catch(() => { }); k2.shutdown(); }
  return r;
}
{
  const c = await bootLeg(K, 'c-fixed');
  ok(!c.threw && c.launched, 'Ⓒ three real browsers running when the server stops', c);
  ok(!c.threw && c.healthy.state === 'ready' && c.healthy.same && c.healthy.alive, 'Ⓒ the healthy one: RE-OWNED (the same daemon, ready — its page answered)', c.healthy);
  ok(!c.threw && c.unowned.state === 'ready' && c.unowned.same && c.unowned.alive, 'Ⓒ the one a pre-fix boot left stopped while it ran: RE-OWNED by the boot\'s census (its record ready again on that daemon)', c.unowned);
  ok(!c.threw && c.wedged.state === 'stopped' && !c.wedged.daemonAlive && !c.wedged.chromeAlive && /its browser does not answer CDP/.test(c.wedged.lastError || '') && /^stopped — its browser daemon was ended at/.test(c.wedged.note || ''), 'Ⓒ the wedged one (its `session info` answering, its endpoint silent): ENDED at the boot WITH its Chrome — the row says why', c.wedged);
  ok(!c.threw && c.fresh && c.fresh.state === 'ready' && c.fresh.list && c.fresh.newDaemon, 'Ⓒ …and its profile\'s next start is a fresh daemon whose browser answers', c.fresh);
  ok(!c.threw && c.lines.filter((l) => /RE-OWNED/.test(l)).length === 2 && c.lines.filter((l) => /ENDED/.test(l)).length === 1, `Ⓒ the journal: one line per daemon the boot judged (${c.bootMs} ms boot)`, c.lines);
  const Kpre = keeperCopy('pre-boot', [['        if (cliAsked(i)) {\n', '        if (false) {\n'], ["        if (seenBy === 'boot' && unkept && browserAlive && p) {\n", '        if (false) {\n']]);
  const ctl = Kpre ? await bootLeg(Kpre, 'c-pre') : null;
  ok(ctl && !ctl.threw && ctl.wedged.state === 'ready' && ctl.wedged.daemonAlive && ctl.unowned.state === 'stopped' && ctl.unowned.alive, 'Ⓒ RED CONTROL: the pre-fix boot ADOPTS the wedged browser ready on `session info` alone and leaves the running one under its stopped record unowned — the legs above can go red', ctl && { wedged: ctl.wedged, unowned: ctl.unowned });
}

// ═══ Ⓓ lane browser-shared-profile-freeze (fleet fb-8727ee62fb): A SERVER RESTART ON THE SCOPE ROAD ═══
// An agent lease of a shared profile now reaches its browser through a url the SERVER serves (cdp-mediator mode 'scope' — the
// fix for «every session at once»: its driver discovers only its own tabs), so an Update (the server stops and starts again)
// takes that url with it. THE RULE: the daemon and its Chrome outlive the server (the .332 fix); the next server's boot
// re-owns them; the agent's next command — its /resolve answer (the keeper's attach) names the NEW url — reaches the SAME
// daemon, the SAME browser, the SAME tab. RED CONTROL: the old url after the restart reaches nothing.
console.log('— Ⓓ a server restart on the scope road: the daemon outlives the old url, the boot re-owns it, the next command answers through the new one');
{
  const MED = require('../src/server/cdp-mediator.js'), S = require('../src/browser-stream.js');
  const w = world('d-scope'); let k1 = null, k2 = null, m1 = null, m2 = null; const r = {};
  const ab = (args, pairs, timeout = 45000) => new Promise((resolve) => require('node:child_process').execFile(REAL_AB, args, { env: { ...w.env, ...S.pairsToEnv(pairs) }, encoding: 'utf8', timeout }, (err, so, se) => resolve({ ok: !err, out: String(so || ''), err: String(se || '') + (err ? ' ' + String(err.message).slice(0, 200) : '') })));
  const cdpOf = (pairs) => ((pairs || []).find((kv) => kv.startsWith('AGENT_BROWSER_CDP=')) || '').slice('AGENT_BROWSER_CDP='.length);
  try {
    m1 = MED.create({ log: { log() { }, warn() { } } }); k1 = w.make(K, { mediator: m1 });
    const p = k1.createProfile({ label: 'shared' }, { owner: { kind: 'instance', id: null } });
    const a1 = await k1.attach({ profileId: p.id, browserKey: KA, sessionId: 'sess-d', by: 'agent' });
    r.u1 = cdpOf(a1.env);
    r.open = await ab(['open', U('/scoped')], a1.env);
    const rec1 = k1._reg().browsers[p.id]; r.daemon = rec1.pid; r.chrome = rec1.browser && rec1.browser.pid;
    r.t1 = await ab(['get', 'title'], a1.env);
    k1.shutdown(); m1.shutdown(); // the Update: the server process (and the proxy it serves) goes away — the browsers keep running
    r.stale = await ab(['get', 'title'], a1.env, 15000); // RED CONTROL: the old url reaches nothing now
    m2 = MED.create({ log: { log() { }, warn() { } } }); k2 = w.make(K, { mediator: m2 });
    await k2.boot();
    const b = k2.browserOf(p.id) || {};
    r.reowned = { state: b.state, same: b.pid === r.daemon, alive: alive(r.daemon), chromeAlive: alive(r.chrome) };
    const a2 = await k2.attach({ profileId: p.id, browserKey: KA, sessionId: 'sess-d', by: 'agent' }); // what the next command's /resolve does
    r.u2 = cdpOf(a2.env);
    r.t2 = await ab(['get', 'title'], a2.env);
    r.after = { daemon: (k2._reg().browsers[p.id] || {}).pid, chrome: ((k2._reg().browsers[p.id] || {}).browser || {}).pid };
  } catch (e) { r.threw = String(e && e.stack); }
  ok(!r.threw && r.open && r.open.ok && /\/m\//.test(r.u1 || '') && /BD \/scoped/.test((r.t1 || {}).out || ''), 'Ⓓ an agent lease of a shared profile browses through a url the server serves (the scope road)', r);
  ok(!r.threw && r.stale && !/BD \/scoped/.test(r.stale.out), 'Ⓓ RED CONTROL: after the server stopped, the old url reaches nothing (a driver kept on it would fail)', r.stale);
  ok(!r.threw && r.reowned && r.reowned.state === 'ready' && r.reowned.same && r.reowned.alive && r.reowned.chromeAlive, 'Ⓓ the next server\'s boot RE-OWNS the same daemon and its Chrome (never an orphan)', r.reowned);
  ok(!r.threw && r.u2 && /\/m\//.test(r.u2) && r.u2 !== r.u1 && r.t2 && r.t2.ok && /BD \/scoped/.test(r.t2.out) && r.after && r.after.daemon === r.daemon && r.after.chrome === r.chrome, 'Ⓓ the agent\'s next command (its new url from the keeper) answers on the SAME daemon, browser and tab — the page it had before the Update', { u1: r.u1 && r.u1.replace(/\/m\/[^/]+/, '/m/…'), u2: r.u2 && r.u2.replace(/\/m\/[^/]+/, '/m/…'), t2: r.t2, after: r.after, daemon: r.daemon, chrome: r.chrome });
  if (k2) { for (const id of Object.keys(k2._reg().browsers || {})) await k2.stop(id).catch(() => { }); k2.shutdown(); }
  try { m2 && m2.shutdown(); } catch { /* */ }
}

pages.close();
done();

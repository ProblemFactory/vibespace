#!/usr/bin/env node
// LANE BROWSER-UNSTABLE-REJUDGE (the owner's instance, 2026-10-06): A PARKED browser_unstable OUTLIVED THE DEAD COMPOSITOR THAT
// CAUSED IT — systemd-oomd killed the GNOME session at 01:44, both profiles' Chromes (Wayland clients) died, ten relaunch asks
// went to 42-h-old daemons whose frozen env named the dead compositor, both parked `failing`; the compositor was back at
// 03:36, the 16:32 restart adopted both with the verdict, `status` said "browser: ready pid <the DAEMON's pid>" — 15 h.
// FAST tier: PURE + the REAL keeper over the heal suite's fake agent-browser (test-browser-ephemeral ⑥, extended by
// FAKE_DISPLAY_CHECK: a launch whose env names a missing Wayland socket fails; a daemon relaunches with ITS frozen env),
// real unix sockets as the compositors in a private runtime dir, scratch dirs, an isolated $HOME — no real browser.
//   ① PURE: displayKey; the re-judge table (fact changed / boot adoption / neither ⇒ one ask / one ask / none); the
//      fresh-daemon rung's table; the status cell for a parked / ready / closed browser.
//   ② the fresh-daemon rung: the first compositor dies with the Chrome, a second comes up — the 3rd ask is a NEW daemon
//      (the old one stopped by its mark) launched with the display probed now (WAYLAND_DISPLAY=wayland-1 in its environ).
//   ③ re-judge on a changed fact: parked `failing` under one display (the r6 ladder, unchanged while the display is the
//      same), no ask while nothing changes, ONE fresh ask when the display changes, the notice filed once and resolved.
//   ④ re-judge at boot: a new keeper adopting the parked daemon asks once; the ticks after ask nothing.
//   ⑤ 3 patched-copy controls: no re-judge ⇒ parked for ever; relaunch through the stale daemon only; status says ready.
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { execFile, spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { scratch } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';
// the fake Chrome's cdp-url: a loopback /json/version on a kernel-chosen port (§81) — the keeper's answer ask (browser-unresponsive)
// reads it, so a browser the re-judge brought back answers like a real one (a dead port is rightly judged "has not answered")
const cdpSrv = http.createServer((req, res) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ Browser: 'Chrome/149.0.0.0', 'Protocol-Version': '1.3' })); });
const CDP_PORT = await new Promise((r) => cdpSrv.listen(0, '127.0.0.1', () => r(cdpSrv.address().port)));
cdpSrv.unref();
const require = createRequire(import.meta.url);
const B = require('../src/browser-profiles.js');
const F = require('../src/browser-facts.js');
const K = require('../src/server/browser-keeper.js');
const D = require('../src/browser-display.js');
const V = require('../src/browser-verbs.js');
let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? '\n    ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 900) : '')); } };
const REPO = new URL('..', import.meta.url).pathname;
const ROOT = scratch('browser-rejudge');
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const settings = { 'browser.idleTimeoutMs': 600000, 'browser.noDisplayMode': 'headless', 'browser.headed': 'yes' };

console.log('— ① PURE: the display key, the re-judge table, the fresh-daemon rung, the status cell');
{
  const w0 = { kind: 'wayland', socket: '/r/wayland-0', available: ['wayland'], xvfb: false }, w1 = { ...w0, socket: '/r/wayland-1' }, none = { kind: 'none', socket: null, available: [], xvfb: false };
  ok(D.displayKey(w0) === D.displayKey({ ...w0, at: 5, why: ['x'], env: { WAYLAND_DISPLAY: 'wayland-0' } }) && D.displayKey(w0) !== D.displayKey(w1) && D.displayKey(w0) !== D.displayKey(none) && D.displayKey(none) !== D.displayKey({ ...none, xvfb: true }) && D.displayKey(null) === null,
    'displayKey: the chosen kind + socket, every kind here and the Xvfb rung — the probe time / why lines / env never change it', [D.displayKey(w0), D.displayKey(none)]);
  const k0 = D.displayKey(w0), k1 = D.displayKey(w1);
  const t = (o) => { const v = B.rejudgeVerdict(o); return `${v.ask ? 'ask' : 'none'}:${v.why || '-'}${v.seed ? ':seed' : ''}`; };
  const table = [t({ unstable: 'failing', parked: k0, now: k1 }), t({ unstable: 'failing', parked: k0, now: k0, boot: true }), t({ unstable: 'failing', parked: k0, now: k0 }),
    t({ unstable: 'failing', parked: null, now: k0 }), t({ unstable: null, parked: k0, now: k1, boot: true }), t({ unstable: 'failing', parked: k0, now: null })];
  ok(JSON.stringify(table) === JSON.stringify(['ask:display', 'ask:boot', 'none:-', 'none:-:seed', 'none:-', 'none:-']),
    'the re-judge table: fact changed ⇒ one ask, boot adoption ⇒ one ask, neither ⇒ none; a pre-lane record (no key) is seeded, never asked; a `closing` verdict is never re-judged (B-47f9 unchanged)', table);
  const fd = (n, a, b) => B.freshDaemonDue({ failed: n ? { count: n, since: 1 } : null, launched: a, now: b });
  ok(B.HEAL_FRESH_AT === 3 && !fd(0, k0, k1) && !fd(1, k0, k1) && fd(2, k0, k1) && fd(5, k0, k1) && !fd(2, k0, k0) && !fd(2, null, k1) && !fd(2, k0, null),
    'the fresh-daemon rung: the 3rd failed ask (2 before it) and later, only when the display the daemon was launched under is not the display now', [fd(2, k0, k1), fd(2, k0, k0)]);
  const ut = B.unstableText({ label: 'Bank', count: 10, kind: 'failing', spanMs: 280000 });
  const parked = { state: 'ready', pid: 3928207, browser: null, closed: { code: 'browser_unstable', error: ut, unstable: 'failing' } };
  const cell = V.browserCell(parked);
  ok(/^parked \(browser_unstable, failing\) — /.test(cell) && cell.includes(ut) && !/ready/.test(cell) && !cell.includes('3928207'),
    'status: a parked profile says parked + the keeper\'s own words (B.unstableText: the state + the way out) — never "ready", never the daemon\'s pid', cell);
  ok(V.browserCell({ state: 'ready', pid: 3928207, browser: { pid: 4100 } }) === 'ready pid 4100' && V.browserCell({ state: 'ready', pid: 3928207, browser: null }) === 'ready' && V.browserCell(null) === 'not running' && /^closed \(browser_closed\) — /.test(V.browserCell({ state: 'ready', pid: 1, closed: { code: 'browser_closed', error: 'x' } })),
    'status: a ready browser shows ITS pid (Chrome\'s) or none; a closed one is said closed with its code', V.browserCell({ state: 'ready', pid: 3928207, browser: { pid: 4100 } }));
}

console.log('— ②–④ the REAL keeper over the fake agent-browser, real unix sockets as the compositors');
const legs = {};
{
  const os = require('os');
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const R6 = path.join(ROOT, 'orphan'); const BIN6 = path.join(R6, 'bin'), ST6 = path.join(R6, 'ab'), HOME6 = path.join(R6, 'home'), HOME6S = path.join(R6, 'home with space');
  for (const d of [BIN6, ST6, path.join(HOME6, '.agent-browser'), path.join(HOME6S, '.agent-browser')]) fs.mkdirSync(d, { recursive: true });
  const UDD = "'--user-'+'data-dir='";   // never spelled whole inside the child's own code (its /proc cmdline carries the code)
  const CHROME_SRC = `const fs=require('fs'),path=require('path'),os=require('os');const k=${UDD};const udd=(process.argv.find((a)=>a.startsWith(k))||'').slice(k.length);const L=path.join(udd,'SingletonLock');try{fs.unlinkSync(L)}catch{}fs.symlinkSync(os.hostname()+'-'+process.pid,L);fs.writeFileSync(path.join(udd,'DevToolsActivePort'),String(30000+process.pid%20000)+'\\n/devtools/browser/'+process.pid+'-'+Date.now()+'\\n');const ttl=process.env.FAKE_CHROME_TTL;if(ttl!==undefined&&ttl!==''){setTimeout(()=>process.exit(0),Number(ttl));}setInterval(()=>{},1e9);`;
  // r5: FAKE_CHROME_TTL = the chrome dies N ms after writing its lock (a crash-on-load profile, a window the user keeps
  // closing, an OOM) — the only variable the daemon passes on besides PATH (never an AGENT_BROWSER_* key)
  // the daemon: its chrome runs with a SCRUBBED env (`{PATH}` — the real binary's child carries no AGENT_BROWSER_*); SIGUSR2
  // relaunches a dead chrome IN THIS daemon (FAKE_TEMP: a NEW temp dir, the old one removed when its chrome exits — 0.38.1's)
  // r4: the chrome is launched the way the real 0.38.1 launches it — `--remote-debugging-port=0` plus the `args` of the
  // config the launching call named (so a keeper launch carries its MARK, measured on the real binary); FAKE_SHAPE=helper
  // puts a NON-EXEC wrapper between the daemon and the chrome (its argv carries the chrome's flags — verify r4 LOW 4)
  const DAEMON_SRC = `const {spawn}=require('child_process'),fs=require('fs'),path=require('path');const temp=process.env.FAKE_TEMP==='1';let cur=null,dir=process.env.FAKE_UDD;let cfgArgs=[];try{const cf=JSON.parse(fs.readFileSync(process.env.AGENT_BROWSER_CONFIG,'utf8'));const a=cf&&cf.args;cfgArgs=Array.isArray(a)?a.map(String):(typeof a==='string'?a.split(/[,\\n]/).map((x)=>x.trim()).filter(Boolean):[]);}catch{}const go=()=>{if(temp&&cur)dir=fs.mkdtempSync(path.join(process.env.FAKE_AB_STATE,'agent-browser-chrome-'));const d0=dir;const args=['--',${UDD}+d0,'--headless=new','--remote-debugging-port=0',...cfgArgs];let c;if(process.env.FAKE_SHAPE==='helper'){c=spawn(process.execPath,['-e',process.env.FAKE_HELPER_SRC,...args],{stdio:'ignore',env:{PATH:process.env.PATH,FAKE_CHROME_SRC:process.env.FAKE_CHROME_SRC,FAKE_CHROME_PIDFILE:process.env.FAKE_CHROME_PIDFILE}});fs.writeFileSync(process.env.FAKE_CHROME_PIDFILE+'.helper',String(c.pid));}else{c=spawn(process.execPath,['-e',process.env.FAKE_CHROME_SRC,...args],{stdio:'ignore',env:{PATH:process.env.PATH,...(process.env.FAKE_CHROME_TTL?{FAKE_CHROME_TTL:process.env.FAKE_CHROME_TTL}:{})}});fs.writeFileSync(process.env.FAKE_CHROME_PIDFILE,String(c.pid));}cur=c;c.on('exit',()=>{if(temp){try{fs.rmSync(d0,{recursive:true,force:true})}catch{}}});};process.on('SIGUSR2',()=>{if(!cur||cur.exitCode!==null||cur.signalCode!==null)go();});go();setInterval(()=>{},1e9);`;
  // the NON-EXEC wrapper (r4 LOW 4, the verifier's p4-H shape): its own argv names the dir; the chrome is its child
  const HELPER_SRC = `const {spawn}=require('child_process');const c=spawn(process.execPath,['-e',process.env.FAKE_CHROME_SRC,'--',...process.argv.slice(1)],{stdio:'ignore',env:{PATH:process.env.PATH}});require('fs').writeFileSync(process.env.FAKE_CHROME_PIDFILE,String(c.pid));setInterval(()=>{},1e9);`;
  fs.writeFileSync(path.join(BIN6, 'agent-browser'), `#!${process.execPath}
const fs = require('fs'), path = require('path'), os = require('os'), { spawn } = require('child_process');
const st = process.env.FAKE_AB_STATE; const ns = process.env.AGENT_BROWSER_NAMESPACE || 'default'; const sess = process.env.AGENT_BROWSER_SESSION || ns;
const prof = process.env.AGENT_BROWSER_PROFILE || null;
const f = path.join(st, ns + '__' + sess + '.json');
const read = () => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const out = (o) => { process.stdout.write(JSON.stringify(o) + '\\n'); };
// lane browser-unstable-rejudge: FAKE_DISPLAY_CHECK — a launch whose env names a Wayland socket that is not there fails the
// way the real one does, and a daemon whose Chrome died relaunches it with ITS OWN frozen env (read from /proc)
const dispOk = (e) => !e.WAYLAND_DISPLAY || fs.existsSync(path.join(e.XDG_RUNTIME_DIR || '/nonexistent', e.WAYLAND_DISPLAY));
const envOf = (pid) => { try { return Object.fromEntries(fs.readFileSync('/proc/' + pid + '/environ', 'utf8').split('\\0').filter(Boolean).map((kv) => [kv.slice(0, kv.indexOf('=')), kv.slice(kv.indexOf('=') + 1)])); } catch { return {}; } };
const log = (n, o) => fs.appendFileSync(path.join(st, n), JSON.stringify(o) + '\\n');
const pause = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const argv = process.argv.slice(2).filter((x) => x !== '--pin-tab' && x !== '--json');
const [a, b] = argv;
const lockOf = (d) => { try { const t = fs.readlinkSync(path.join(d, 'SingletonLock')); const m = /^(.*)-(\\d+)$/.exec(t); return m ? { host: m[1], pid: Number(m[2]) } : null; } catch { return null; } };
const chromeNow = () => { try { return Number(fs.readFileSync(f + '.chrome', 'utf8')) || null; } catch { return null; } };
const uddOf = (pid) => { const k = '--user-' + 'data-dir='; try { const e = fs.readFileSync('/proc/' + pid + '/cmdline', 'utf8').split('\\0').find((x) => x.startsWith(k)); return e ? e.slice(k.length) : null; } catch { return null; } };
const respawn = (s, by) => {
  const c0 = chromeNow();
  if (c0 && alive(c0)) return;
  process.kill(s.pid, 'SIGUSR2');
  let c1 = null;
  for (let i = 0; i < 300; i++) { pause(10); const n = chromeNow(); const d = n && n !== c0 && alive(n) ? uddOf(n) : null; const l = d ? lockOf(d) : null; if (l && l.pid === n) { c1 = n; break; } }
  log('relaunches.log', { ns, sess, by, daemon: s.pid, from: c0, chrome: c1, dir: c1 ? uddOf(c1) : null });
};
const daemon = (by) => {
  let s = read();
  if (s && alive(s.pid)) {
    // FAKE_RESPAWN (0.38.1): a verb on a live daemon whose Chrome died relaunches one IN THAT DAEMON (same daemon pid)
    if (process.env.FAKE_RESPAWN === '1') respawn(s, by);
    return s;
  }
  if (process.env.FAKE_DISPLAY_CHECK === '1' && !dispOk(process.env)) { log('displayfail.log', { ns, sess, by, wd: process.env.WAYLAND_DISPLAY || null }); return { refused: 'Failed to connect to Wayland display' }; }
  const dir = prof || fs.mkdtempSync(path.join(st, 'agent-browser-chrome-'));
  if (prof) { const l = lockOf(prof); if (l && alive(l.pid)) { log('refused.log', { ns, sess, by, dir: prof, holder: l.pid }); return { refused: 'Chrome exited early (exit code: 21) without writing DevToolsActivePort\\nFailed to create ' + prof + '/SingletonLock: File exists (17)' }; } if (l) { try { fs.unlinkSync(path.join(prof, 'SingletonLock')); } catch { } } }
  const pidfile = f + '.chrome';
  try { fs.unlinkSync(pidfile); } catch { }
  const c = spawn(process.execPath, ['-e', ${JSON.stringify(DAEMON_SRC)}], { detached: true, stdio: 'ignore', env: { ...process.env, AGENT_BROWSER_DAEMON: '1', FAKE_UDD: dir, FAKE_TEMP: prof ? '0' : '1', FAKE_CHROME_SRC: ${JSON.stringify(CHROME_SRC)}, FAKE_HELPER_SRC: ${JSON.stringify(HELPER_SRC)}, FAKE_CHROME_PIDFILE: pidfile } });
  c.unref();
  for (let i = 0; i < 200 && !lockOf(dir); i++) pause(15);   // the real binary returns once its Chrome is up
  let chrome = chromeNow();
  s = { pid: c.pid, dir, chrome }; fs.writeFileSync(f, JSON.stringify(s));
  log('launches.log', { ns, sess, by, dir, pid: c.pid, chrome, idle: process.env.AGENT_BROWSER_IDLE_TIMEOUT_MS || null, config: process.env.AGENT_BROWSER_CONFIG || null });
  return s;
};
if (a === '--version') { console.log('agent-browser 0.38.1'); process.exit(0); }
if (a === 'session' && b === 'info') { if (process.env.FAKE_KILL_ON_INFO === '1' && fs.existsSync(path.join(st, 'info-kill-armed'))) { const k0 = chromeNow(); if (k0 && alive(k0)) { try { process.kill(k0, 'SIGKILL'); } catch { } for (let i = 0; i < 200 && alive(k0); i++) pause(5); log('killed.log', { ns, by: 'session info', chrome: k0 }); } } const s = read(); const act = !!(s && alive(s.pid)); out({ success: true, data: { active: act, namespace: ns, pid: act ? s.pid : null, session: sess, socketDir: path.join(st, ns, 'run') } }); process.exit(0); }
// r4 (measured on 0.38.1): \`get cdp-url\` on a live daemon whose Chrome is dead RELAUNCHES it in that daemon (161 ms) — the heal
// r5: every ask is logged (cdp.log — a heal's relaunch ATTEMPT is one); FAKE_CDP_FAIL (armed by <state>/cdp-fail-armed) =
// the binary's own failure ("Chrome exited early") with no relaunch; FAKE_DIE_AFTER_ANSWER (armed by <state>/die-armed) =
// the relaunched chrome dies right AFTER the url is answered (the heal's recapture then finds no process — the wipe)
if (a === 'get' && b === 'cdp-url') { const s = read(); log('cdp.log', { ns, sess }); if (!(s && alive(s.pid))) { out({ success: false, error: 'fake: no browser' }); process.exit(1); } if (process.env.FAKE_DISPLAY_CHECK === '1' && !(chromeNow() && alive(chromeNow())) && !dispOk(envOf(s.pid))) { log('cdpfail.log', { ns, sess, display: envOf(s.pid).WAYLAND_DISPLAY || null }); out({ success: false, error: 'fake: Failed to connect to Wayland display (the daemon env)' }); process.exit(1); } if (process.env.FAKE_CDP_FAIL === '1' && fs.existsSync(path.join(st, 'cdp-fail-armed'))) { log('cdpfail.log', { ns, sess }); out({ success: false, error: 'fake: Chrome exited early (exit code: 1) without writing DevToolsActivePort' }); process.exit(1); } if (process.env.FAKE_NO_RESPAWN !== '1') respawn(s, 'get cdp-url'); const cn = chromeNow(); if (!(cn && alive(cn))) { out({ success: false, error: 'fake: the browser did not start' }); process.exit(1); } out({ success: true, data: { cdpUrl: 'ws://127.0.0.1:${CDP_PORT}/devtools/browser/fake-' + ns + '-' + cn } }); if (process.env.FAKE_DIE_AFTER_ANSWER === '1' && fs.existsSync(path.join(st, 'die-armed'))) { try { process.kill(cn, 'SIGKILL'); } catch { } for (let i = 0; i < 200 && alive(cn); i++) pause(5); log('killed.log', { ns, by: 'get cdp-url', chrome: cn }); } process.exit(0); }
if (a === 'close' && b === '--all') { const s = read(); if (s && alive(s.pid)) { try { process.kill(s.pid, 'SIGKILL'); } catch { } } const cn = chromeNow() || (s && s.chrome); if (cn) { try { process.kill(cn, 'SIGTERM'); } catch { } } try { fs.unlinkSync(f); } catch { } out({ success: true, data: { closed: 1 } }); process.exit(0); }
if (a === 'stream' && b === 'status') { log('stream.log', { ns, sess }); const s = daemon('stream status'); if (s.refused) { out({ success: false, error: s.refused }); process.exit(1); } out({ success: true, data: { enabled: true, connected: false, port: 22000 + (sess.length * 7) % 900, screencasting: false } }); process.exit(0); }
if (['open', 'snapshot', 'click'].includes(a)) { const s = daemon(a); if (s.refused) { out({ success: false, error: s.refused }); process.exit(1); } log('cmds.log', { verb: a, ns, sess }); out({ success: true, data: { ok: true } }); process.exit(0); }
out({ success: false, error: 'fake: unknown verb ' + process.argv.slice(2).join(' ') }); process.exit(1);
`, { mode: 0o755 });
  const PATH6 = `${BIN6}:${path.dirname(process.execPath)}:${process.env.PATH || '/usr/bin:/bin'}`;
  const env6 = { PATH: PATH6, HOME: HOME6, FAKE_AB_STATE: ST6 };
  const log6 = (n) => { try { return fs.readFileSync(path.join(ST6, n), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };
  const clear6 = () => { for (const n of ['launches.log', 'refused.log', 'stream.log', 'cmds.log', 'relaunches.log', 'cdp.log', 'cdpfail.log', 'killed.log', 'die-armed', 'cdp-fail-armed', 'info-kill-armed']) { try { fs.unlinkSync(path.join(ST6, n)); } catch { } } };
  const arm6 = (n, on = true) => { const f = path.join(ST6, n); if (on) fs.writeFileSync(f, '1'); else { try { fs.unlinkSync(f); } catch { } } };
  // every process this section starts carries ST6 in its environ (the fake's env) or R6 in its cmdline (a scrubbed chrome
  // names its --user-data-dir under R6) — ended by that evidence on exit
  const mine6 = () => fs.readdirSync('/proc').filter((x) => /^\d+$/.test(x)).map(Number).filter((pid) => pid !== process.pid && (() => { try { return fs.readFileSync(`/proc/${pid}/environ`, 'latin1').includes(ST6) || fs.readFileSync(`/proc/${pid}/cmdline`, 'latin1').includes(R6); } catch { return false; } })());
  const killAll6 = () => { for (const pid of mine6()) { try { process.kill(pid, 'SIGKILL'); } catch { } } };
  process.on('exit', killAll6);
  const waitGone = async (pid, ms = 4000) => { const t0 = Date.now(); while (Date.now() - t0 < ms && alive(pid)) await sleep(25); return !alive(pid); };
  const logs6 = [];
  const mk6 = (Kmod, tag, live6, home = HOME6, extra = {}, opts = {}) => { const e = { ...env6, HOME: home, ...extra }; return Kmod.create({ dataDir: path.join(R6, 'data-' + tag), homeDir: home, env: () => e, serverSetting: (x) => settings[x], liveKeys: () => live6, runtime: F.createBrowserRuntime({ env: e }), facts: F.createBrowserFacts({ env: e }), log: { log: (m) => logs6.push(String(m)), warn: (m) => logs6.push(String(m)), error() { } }, install: false, ...opts }); };
  const readLock = (d) => { try { const t = fs.readlinkSync(path.join(d, 'SingletonLock')); return Number((/-(\d+)$/.exec(t) || [])[1]) || null; } catch { return null; } };
  const devtools = (d) => { try { return fs.readFileSync(path.join(d, 'DevToolsActivePort'), 'utf8'); } catch { return null; } };
  const envKeysOf = (pid) => { try { return fs.readFileSync(`/proc/${pid}/environ`, 'utf8').split('\0').filter((kv) => kv.startsWith('AGENT_BROWSER_')).map((kv) => kv.split('=')[0]); } catch { return null; } };
  /** A verb run by hand under a session's pairs (the agent's next command) — FAKE_RESPAWN: the daemon relaunches its dead chrome. */
  const verb6 = (pairEnv, home = HOME6) => new Promise((resolve) => execFile(path.join(BIN6, 'agent-browser'), ['open', 'about:blank'], { env: { ...env6, HOME: home, ...pairEnv, FAKE_RESPAWN: '1' }, encoding: 'utf8', timeout: 20000 }, (err, so, se) => resolve({ ok: !err, out: String(so || '') + String(se || '') })));
  // r4: the browsers on a directory (a /proc scan: a --user-data-dir naming it, never a renderer), their parents, their argv
  const chromesOn6 = (dir) => fs.readdirSync('/proc').filter((x) => /^\d+$/.test(x)).map(Number).filter((pid) => { try { const c = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8'); return c.split('\0').includes('--user-data-dir=' + dir) && !/(?:^|\0)--type=/.test(c); } catch { return false; } });
  const RT = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-rj-')); // a private runtime dir (a socket path must stay short)
  process.on('exit', () => { try { fs.rmSync(RT, { recursive: true, force: true }); } catch { } });
  const wl = new Map();
  const up = (n) => new Promise((res) => { const s = net.createServer((c) => c.destroy()); s.listen(path.join(RT, n), () => { wl.set(n, s); res(); }); });
  const down = (n) => new Promise((res) => { const s = wl.get(n); wl.delete(n); if (!s) return res(); s.close(() => { try { fs.unlinkSync(path.join(RT, n)); } catch { } res(); }); });
  const inbox = () => { const items = []; return { items, store: { add: (key, item) => { const it = { id: 'ut-' + (items.length + 1), key, status: 'open', ...item }; items.push(it); return it; }, get: (id) => items.find((x) => x.id === id) || null, setStatus: (id, st) => { const it = items.find((x) => x.id === id); if (it) it.status = st; return it; } } }; };
  const DX = { XDG_RUNTIME_DIR: RT, FAKE_DISPLAY_CHECK: '1' };
  const envWd = (pid) => { try { return (fs.readFileSync(`/proc/${pid}/environ`, 'utf8').split('\0').find((kv) => kv.startsWith('WAYLAND_DISPLAY=')) || '').slice(16) || null; } catch { return null; } };
  const view = (kk, id) => { const x = kk.browserOf(id) || {}; return { state: x.state, pid: x.pid, chrome: x.browser ? x.browser.pid : null, closed: x.closed ? x.closed.code : null, unstable: x.closed ? x.closed.unstable || null : null, socket: x.display ? x.display.socket : null, heals: x.heals || null, raw: x }; };
  const ticks = async (kk, n, skew) => { for (let i = 0; i < n; i++) { skew.v += B.HEAL_RETRY_MS + 1000; await kk.tick(); } };
  const reset = async () => { killAll6(); clear6(); for (const n of [...wl.keys()]) await down(n); for (const f of fs.readdirSync(ST6)) if (/__.*\.json$|displayfail\.log$/.test(f)) { try { fs.unlinkSync(path.join(ST6, f)); } catch { } } };

  /** ② the fresh-daemon rung: launched under wayland-0; it dies with the Chrome, wayland-1 comes up; 3 tick-paced asks. */
  legs.fresh = async (Kmod, tag) => {
    await reset(); await up('wayland-0');
    const skew = { v: 0 }, ib = inbox(), KEY = 'bk-0000f' + tag.length + '01';
    const kk = mk6(Kmod, tag, new Set([KEY]), HOME6, DX, { now: () => Date.now() + skew.v, userTodos: ib.store });
    const r = { tag };
    try {
      const pr = kk.createProfile({ label: 'Fresh ' + tag }, { owner: { kind: 'instance', id: null } });
      await kk.attach({ profileId: pr.id, browserKey: KEY, sessionId: 'sess-a' });
      const v0 = view(kk, pr.id); r.d1 = v0.pid; r.c1 = v0.chrome; r.wd1 = envWd(v0.pid); r.sock1 = v0.socket;
      await down('wayland-0'); await up('wayland-1');
      process.kill(r.c1, 'SIGTERM'); await waitGone(r.c1);
      await kk.tick(); r.after1 = log6('cdpfail.log').length;
      await ticks(kk, 2, skew);
      const v = view(kk, pr.id); r.v = { ...v, raw: undefined };
      r.fails = log6('cdpfail.log').length; r.launches = log6('launches.log').length;
      r.d1Alive = alive(r.d1); r.wd2 = v.pid ? envWd(v.pid) : null; r.chromeAlive = !!(v.chrome && alive(v.chrome));
      await ticks(kk, 2, skew); r.launchesAfter = log6('launches.log').length; r.failsAfter = log6('cdpfail.log').length;
      r.notices = ib.items.length;
      await kk.stop(pr.id).catch(() => { });
    } catch (e) { r.threw = String((e && (e.code || '')) + ' ' + (e && e.stack)); }
    kk.shutdown(); killAll6();
    return r;
  };
  /** park `failing` under ONE display (the binary refuses — FAKE_CDP_FAIL; the r6 ladder unchanged while the display is the same) */
  const parkLeg = async (kk, pr, KEY, skew) => {
    await kk.attach({ profileId: pr.id, browserKey: KEY, sessionId: 'sess-b' });
    const v0 = view(kk, pr.id);
    arm6('cdp-fail-armed');
    process.kill(v0.chrome, 'SIGTERM'); await waitGone(v0.chrome);
    await kk.tick();
    for (let i = 0; i < 12 && view(kk, pr.id).closed !== 'browser_unstable'; i++) await ticks(kk, 1, skew);
    return v0;
  };
  /** ③ re-judge on a changed fact (no restart) */
  legs.changed = async (Kmod, tag) => {
    await reset(); await up('wayland-0');
    const skew = { v: 0 }, ib = inbox(), KEY = 'bk-0000c' + tag.length + '02';
    const kk = mk6(Kmod, tag, new Set([KEY]), HOME6, { ...DX, FAKE_CDP_FAIL: '1' }, { now: () => Date.now() + skew.v, userTodos: ib.store });
    const r = { tag };
    try {
      const pr = kk.createProfile({ label: 'Changed ' + tag }, { owner: { kind: 'instance', id: null } });
      const v0 = await parkLeg(kk, pr, KEY, skew); r.d1 = v0.pid;
      const p1 = view(kk, pr.id); r.parked = { closed: p1.closed, unstable: p1.unstable, key: p1.heals && p1.heals.unstableDisplay, noticeId: p1.heals && p1.heals.noticeId, fails: log6('cdpfail.log').length, launches: log6('launches.log').length };
      r.cellParked = V.browserCell(p1.raw);
      await ticks(kk, 3, skew); // NEITHER: nothing changed ⇒ no ask
      r.neither = { fails: log6('cdpfail.log').length, launches: log6('launches.log').length, cdp: log6('cdp.log').length, closed: view(kk, pr.id).closed, notices: ib.items.length };
      arm6('cdp-fail-armed', false);
      await down('wayland-0'); await up('wayland-1'); // the FACT changes
      await ticks(kk, 1, skew);
      const v = view(kk, pr.id); r.v = { ...v, raw: undefined }; r.wd2 = v.pid ? envWd(v.pid) : null; r.launches1 = log6('launches.log').length; r.d1Alive = alive(r.d1);
      r.cellAfter = V.browserCell(v.raw);
      await ticks(kk, 3, skew); r.launchesAfter = log6('launches.log').length;
      r.notices = ib.items.map((x) => ({ id: x.id, status: x.status, text: x.text }));
      await kk.stop(pr.id).catch(() => { });
    } catch (e) { r.threw = String((e && (e.code || '')) + ' ' + (e && e.stack)); }
    kk.shutdown(); killAll6();
    return r;
  };
  /** ④ re-judge at boot: a new keeper over the same data adopts the parked daemon */
  legs.boot = async (Kmod, tag) => {
    await reset(); await up('wayland-0');
    const skew = { v: 0 }, ib = inbox(), KEY = 'bk-0000b' + tag.length + '03';
    const k1 = mk6(K, tag, new Set([KEY]), HOME6, { ...DX, FAKE_CDP_FAIL: '1' }, { now: () => Date.now() + skew.v, userTodos: ib.store });
    const r = { tag };
    let k2 = null;
    try {
      const pr = k1.createProfile({ label: 'Boot ' + tag }, { owner: { kind: 'instance', id: null } });
      const v0 = await parkLeg(k1, pr, KEY, skew); r.d1 = v0.pid;
      r.parked = view(k1, pr.id).closed + ':' + view(k1, pr.id).unstable;
      k1.shutdown();
      arm6('cdp-fail-armed', false);
      const L0 = log6('launches.log').length;
      k2 = mk6(Kmod, tag, new Set([KEY]), HOME6, DX, { now: () => Date.now() + skew.v, userTodos: ib.store });
      r.boot = await k2.boot();
      r.adopted = view(k2, pr.id).closed;
      await ticks(k2, 1, skew);
      const v = view(k2, pr.id); r.v = { ...v, raw: undefined }; r.launches1 = log6('launches.log').length - L0; r.d1Alive = alive(r.d1);
      await ticks(k2, 3, skew); r.launchesAfter = log6('launches.log').length - L0;
      r.notices = ib.items.map((x) => ({ status: x.status }));
      await k2.stop(pr.id).catch(() => { });
    } catch (e) { r.threw = String((e && (e.code || '')) + ' ' + (e && e.stack)); }
    try { k1.shutdown(); } catch { } if (k2) k2.shutdown(); killAll6();
    return r;
  };
}

{
  const a = await legs.fresh(K, 'fresh');
  ok(!a.threw && a.wd1 === 'wayland-0' && a.after1 === 1 && a.fails === 2 && a.launches === 2 && !a.d1Alive && a.v.pid !== a.d1 && a.wd2 === 'wayland-1' && a.v.state === 'ready' && !a.v.closed && a.chromeAlive && /wayland-1$/.test(a.v.socket || ''),
    '② the fresh-daemon rung: 2 asks to the daemon frozen on the dead wayland-0 failed, the 3rd was a NEW daemon (the old one stopped) launched with the display probed now — WAYLAND_DISPLAY=wayland-1 in its environ, its browser up', a);
  ok(!a.threw && a.v.heals && a.v.heals.lastOutcome === 'fresh-daemon' && a.v.heals.attempts.length === 1 && !a.v.heals.failed && a.launchesAfter === a.launches && a.failsAfter === a.fails && a.notices === 0,
    '② …the day of attempts rides the new record (the B-47f9 tiers keep counting), the streak ended, nothing asked after, no notice', a.v.heals);
  const c = await legs.changed(K, 'changed');
  ok(!c.threw && c.parked.closed === 'browser_unstable' && c.parked.unstable === 'failing' && c.parked.fails === B.HEAL_FAIL_BUDGET && c.parked.launches === 1 && /^wayland:.*wayland-0\|/.test(c.parked.key || '') && c.parked.noticeId,
    '③ parked `failing` under one display: the r6 ladder unchanged while the display is the same (10 failed asks, never a fresh daemon) — the key it was parked under recorded, its notice id kept', c.parked);
  ok(!c.threw && /^parked \(browser_unstable, failing\) — /.test(c.cellParked) && /could not be started/.test(c.cellParked) && /Browser panel/.test(c.cellParked) && !c.cellParked.includes(String(c.d1)),
    '③ status for the parked profile: "parked (browser_unstable, failing)" + the way out, never ready, never the daemon pid', c.cellParked);
  ok(!c.threw && c.neither.fails === c.parked.fails && c.neither.launches === 1 && c.neither.closed === 'browser_unstable' && c.neither.notices === 1,
    '③ NEITHER (nothing changed, no restart): no ask in 3 ticks, still parked, the notice filed once', c.neither);
  ok(!c.threw && c.launches1 === 2 && c.v.state === 'ready' && !c.v.closed && c.wd2 === 'wayland-1' && !c.d1Alive && c.launchesAfter === 2 && /^ready pid \d+$/.test(c.cellAfter) && c.cellAfter !== 'ready pid ' + c.v.pid,
    '③ FACT CHANGED (wayland-0 gone, wayland-1 up): ONE fresh ask — a new daemon on wayland-1, the verdict cleared; 3 ticks after ask nothing; status shows Chrome\'s pid', { launches1: c.launches1, after: c.launchesAfter, wd2: c.wd2, cell: c.cellAfter, v: c.v });
  ok(!c.threw && c.notices.length === 1 && c.notices[0].status === 'done' && /could not be started/.test(c.notices[0].text),
    '③ the ONE "could not be started" notice (filed once) is resolved when the re-judge brings the browser back', c.notices);
  const b = await legs.boot(K, 'boot');
  ok(!b.threw && b.parked === 'browser_unstable:failing' && b.boot && b.boot.browsers === 1 && b.adopted === 'browser_unstable' && b.launches1 === 1 && b.v.state === 'ready' && !b.v.closed && !b.d1Alive && b.launchesAfter === 1,
    '④ BOOT ADOPTION: the restart adopts the parked daemon with its verdict, asks ONCE (a fresh daemon) and the browser is back; 3 ticks after ask nothing', b);

  console.log('— ⑤ patched-copy controls');
  const M = mutantCopies('browser-rejudge', REPO);
  const ksrc = fs.readFileSync(path.join(REPO, 'src/server/browser-keeper.js'), 'utf8');
  const NO_REJ = "      if (rec.closed.unstable !== 'failing') return Promise.resolve(null);\n";
  const NO_FRESH = 'if (B.freshDaemonDue({ failed: L.failed,';
  ok(ksrc.split(NO_REJ).length === 2 && ksrc.split(NO_FRESH).length === 2, 'CONTROL setup: the re-judge branch and the fresh rung are found once each in the keeper');
  const KR = M.load('src/server/browser-keeper.js', ksrc.replace(NO_REJ, '      return Promise.resolve(null);\n'), 'no-rejudge');
  const cb = await legs.boot(KR, 'ctl-boot');
  ok(!cb.threw && cb.parked === 'browser_unstable:failing' && cb.launches1 === 0 && cb.v.closed === 'browser_unstable' && cb.launchesAfter === 0,
    'CONTROL 1: a keeper copy that never re-judges keeps the adopted profile parked for ever (no ask at boot, none after) — the boot leg catches it', { launches1: cb.launches1, closed: cb.v && cb.v.closed });
  const KF = M.load('src/server/browser-keeper.js', ksrc.replace(NO_FRESH, 'if (false && B.freshDaemonDue({ failed: L.failed,'), 'stale-daemon-only');
  const cf = await legs.fresh(KF, 'ctl-fresh');
  ok(!cf.threw && cf.fails === 3 && cf.launches === 1 && cf.d1Alive && cf.v.closed === 'browser_closed',
    'CONTROL 2: a keeper copy that relaunches only through the stale daemon fails its 3rd ask too (the daemon is still the one frozen on wayland-0) — the fresh leg catches it', { fails: cf.fails, launches: cf.launches, closed: cf.v && cf.v.closed });
  const vsrc = fs.readFileSync(path.join(REPO, 'src/browser-verbs.js'), 'utf8');
  const CELL = "  if (c) return `${c.code === 'browser_unstable' ? 'parked' : 'closed'}";
  ok(vsrc.split(CELL).length === 2, 'CONTROL setup: the closed-browser line of browserCell is found once');
  const VR = M.load('src/browser-verbs.js', vsrc.replace(CELL, "  return `${b.state}${b.pid ? ' pid ' + b.pid : ''}`;\n" + CELL), 'status-ready');
  const pc = VR.browserCell({ state: 'ready', pid: 3928207, browser: null, closed: { code: 'browser_unstable', error: B.unstableText({ label: 'Bank', count: 10, kind: 'failing', spanMs: 280000 }), unstable: 'failing' } });
  ok(pc === 'ready pid 3928207' && !/^parked/.test(pc), 'CONTROL 3: a status copy that says "ready pid <daemon>" for a parked profile (the incident\'s words) is caught by the ① status check', pc);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

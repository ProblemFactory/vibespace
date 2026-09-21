#!/usr/bin/env node
// BROWSER TIER 3 — THE REAL-BROWSER EXIT PROOF (agent browser P10,
// docs/design-agent-browser-v2 §7.6 / §4.9 / §6.6, the §9 `test-browser-tier3`
// row's heavy half; 2026-09-21). A REAL Google Chrome / Chromium window on a
// REAL X server (our own Xvfb, standing in for the user's display: the suite
// launches it OUTSIDE the desktop-app keeper, so to the engine it is an
// application on "the user's desktop"), with NO --remote-debugging-port, NO
// --remote-debugging-pipe, NO --enable-automation, NO --headless and NO
// disguise flag either: `snapshot` comes from the real AT-SPI tree, one
// `click @ref` lands on a node that self-reports an action, one chord and one
// point click REFUSE BY NAME (the class has no injection road), `screenshot`
// reads the window's own pixmap through x11grab (§4.9 column 1, the rung the
// measurement record wires), `watch` is no_live_view — and throughout, the
// browser process's argv carries no automation flag at all. That last
// assertion IS the definition of tier 3. Registered heavy (boots a Chrome).
// SKIPs with evidence without a chrome / Xvfb / python3-gi Atspi / a session
// bus / xdotool / ffmpeg. Per-pid scratch (scripts/scratch.mjs).
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { scratch } from './scratch.mjs';
const require = createRequire(import.meta.url);

let pass = 0, fail = 0, skipped = 0;
const ok = (c, name, extra) => { if (c) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.error(`  ✗ ${name}${extra !== undefined ? '\n    ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 900) : ''}`); } };
const skip = (why) => { skipped++; console.log(`  ⚠ SKIP: ${why}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const run = (bin, args, env = process.env, timeout = 10000) => new Promise((res) => execFile(bin, args, { env, timeout, encoding: 'utf8' }, (err, stdout, stderr) => res({ err, stdout: String(stdout || ''), stderr: String(stderr || '') })));

const DESK = require('../src/window-desktop.js');
const WT = require('../src/window-targets.js');
const D = require('../src/desktop-display.js');
const ENGINE = require('../src/server/window-targets-engine.js');
const dir = scratch('browser-tier3-chrome');
fs.mkdirSync(dir, { recursive: true });
const children = new Set();
const groups = new Set();
const cleanup = () => {
  for (const pg of groups) { try { process.kill(-pg, 'SIGTERM'); } catch { } }
  for (const c of children) { try { c.kill('SIGTERM'); } catch { } }
  setTimeout(() => { for (const pg of groups) { try { process.kill(-pg, 'SIGKILL'); } catch { } } for (const c of children) { try { c.kill('SIGKILL'); } catch { } } try { fs.rmSync(dir, { recursive: true, force: true }); } catch { } }, 500).unref?.();
};
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(1); });

const AUTOMATION_FLAGS = ['--remote-debugging-port', '--remote-debugging-pipe', '--enable-automation', '--headless', '--disable-blink-features=AutomationControlled', '--remote-allow-origins'];

async function main() {
  const chrome = ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'].map((b) => D.binOnPath(b, { env: process.env })).find(Boolean);
  const xvfb = D.binOnPath('Xvfb', { env: process.env });
  const xdotool = D.binOnPath('xdotool', { env: process.env });
  const ffmpeg = D.binOnPath('ffmpeg', { env: process.env });
  if (!chrome) return skip('no google-chrome / chromium on PATH');
  if (!xvfb) return skip('Xvfb not on PATH');
  if (!process.env.DBUS_SESSION_BUS_ADDRESS) return skip('no session bus (DBUS_SESSION_BUS_ADDRESS unset) — the AT-SPI registry lives on it');
  const a11y = await WT.probeA11y({ wallMs: 10000 });
  if (!a11y.ok) return skip(`the AT-SPI helper cannot run here: ${a11y.why}`);
  // our own X server — a REAL X server the browser draws on
  const authFile = path.join(dir, 'Xauthority'); const cookie = D.newCookie();
  D.writeXauthority(authFile, [{ display: '0', cookieHex: cookie }]);
  const xv = spawn(xvfb, ['-displayfd', '3', '-screen', '0', '1024x768x24', '-nolisten', 'tcp', '-auth', authFile], { stdio: ['ignore', 'ignore', 'ignore', 'pipe'] });
  children.add(xv);
  const display = await new Promise((res) => { let s = ''; xv.stdio[3].on('data', (d) => { s += d; if (/\n/.test(s)) res(':' + s.trim()); }); setTimeout(() => res(null), 10000); });
  if (!display) return skip('Xvfb did not answer -displayfd');
  D.writeXauthority(authFile, [{ display: '0', cookieHex: cookie }, { display, cookieHex: cookie }]);
  const xenv = D.x11Env(process.env, { display, authFile });
  // the browser: a USER'S browser — no CDP, no automation, no disguise; its
  // accessibility bridge on (what a screen reader would cause), a scratch
  // profile so nothing of the user's is touched
  const udd = path.join(dir, 'chrome-profile'); fs.mkdirSync(udd, { recursive: true });
  const cenv = { ...xenv, ACCESSIBILITY_ENABLED: '1', GTK_MODULES: 'gail:atk-bridge', HOME: path.join(dir, 'home') };
  fs.mkdirSync(cenv.HOME, { recursive: true });
  const argv = [`--user-data-dir=${udd}`, '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--disable-dev-shm-usage', '--no-sandbox', '--window-size=900,700', '--force-renderer-accessibility', 'about:blank'];
  const ch = spawn(chrome, argv, { env: cenv, stdio: ['ignore', 'ignore', 'pipe'], detached: true });
  groups.add(ch.pid);
  let cerr = ''; ch.stderr.on('data', (d) => { cerr = (cerr + d).slice(-3000); });
  // the browser pid on the a11y bus: google-chrome execs into chrome (same pid); a
  // wrapper that forks is matched through the X window's _NET_WM_PID instead
  let busPid = null;
  // ONE WALL over the whole wait (2026-09-21): the old loop was 120 × (a helper wall of 8 s)
  // — a hung a11y bus spent 16 min in silence and ate the heavy budget (measured: 420 s,
  // zero lines). 60 s total, the helper's own wall shrinks to what is left, and two
  // consecutive helper_timeouts are the evidence "the bus is not answering" — a SKIP.
  const busDeadline = Date.now() + 60000;
  let busTimeouts = 0;
  console.log(`  browser launched: pid ${ch.pid} on ${display} — waiting for it on the a11y bus (60 s wall)`);
  while (!busPid && Date.now() < busDeadline) {
    const r = await WT.runHelper({ op: 'apps' }, { wallMs: Math.max(1500, Math.min(8000, busDeadline - Date.now())) });
    if (!r.ok && r.code === 'helper_timeout' && ++busTimeouts >= 2) return skip(`the accessibility bus is not answering (helper_timeout twice in a row: ${String(r.error || r.why || '').slice(0, 120)}) — a hung bus on this box, not a missing browser`);
    if (r.ok) { busTimeouts = 0; const mine = (r.apps || []).find((a) => a.pid === ch.pid); if (mine) busPid = mine.pid; else if (xdotool) { const w = await run(xdotool, ['search', '--onlyvisible', '--class', 'chrom'], xenv, 5000); for (const id of w.stdout.trim().split('\n').filter(Boolean)) { const p = await run(xdotool, ['getwindowpid', id], xenv, 5000); const pid = Number(p.stdout.trim()); if (pid && (r.apps || []).some((a) => a.pid === pid)) { busPid = pid; break; } } } }
    if (!busPid) await sleep(500);
  }
  if (!busPid) return skip(`the browser never appeared on the a11y bus within 60 s (pid ${ch.pid}; stderr tail: ${cerr.trim().split('\n').slice(-2).join(' | ') || 'none'})`);
  console.log(`  browser: ${chrome} pid ${ch.pid} on ${display}, on the a11y bus as pid ${busPid}`);

  // THE DEFINITION OF TIER 3, AS AN ASSERTION: no automation flag in the browser's argv.
  // Chrome rewrites its argv area as ONE space-joined string (measured: /proc/<pid>/cmdline
  // is a single NUL-terminated token holding the whole command line), so tokenize on both.
  const readArgv = (pid) => fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').split(/\0|\s+/).filter(Boolean);
  const cmdline = readArgv(busPid);
  const bad = cmdline.filter((a) => AUTOMATION_FLAGS.some((f) => a.startsWith(f)));
  ok(bad.length === 0 && cmdline.length > 1 && cmdline.some((a) => a.startsWith('--user-data-dir=')), `the browser's argv carries NO automation flag (${cmdline.length} tokens; checked ${AUTOMATION_FLAGS.join(', ')})`, bad);
  ok(!fs.existsSync(path.join(udd, 'DevToolsActivePort')), 'no DevToolsActivePort in the profile (no CDP endpoint was ever opened)');

  // the engine: a fake keeper with NO records (nothing is ours), the switch ON,
  // the real helper, our Xvfb as "the user's display" for the pixmap rung
  const keeper = { listApps: () => [], get: () => null, sessionPids: () => [], x11EnvFor: () => null, launch: async () => { throw new Error('not here'); } };
  const sessions = new Map([['sess-a', { agentToken: 'vsst_a', name: 'Alpha', _browserKey: 'bk-a' }]]);
  const settings = { [DESK.SETTING_KEY]: true };
  const dataDir = path.join(dir, 'data'); fs.mkdirSync(dataDir, { recursive: true });
  const engine = ENGINE.create({ keeper, dataDir, env: () => ({ ...process.env }), activeSessions: sessions, serverSetting: (k) => settings[k], userEnv: () => ({ ...xenv, XDG_SESSION_TYPE: 'x11' }), bins: { xdotool, ffmpeg, gdbus: D.binOnPath('gdbus', { env: process.env }) }, log: { log() { }, warn() { } } });
  const A = { sessionId: 'sess-a', browserKey: 'bk-a', name: 'Alpha' };
  const H = DESK.desktopHandle(busPid);
  const caught = async (fn) => { try { return { ok: true, value: await fn() }; } catch (e) { return { ok: false, code: e.code, message: e.message, e }; } };

  const l = await engine.list(A);
  const row = l.targets.find((t) => t.handle === H);
  ok(row && row.origin === 'desktop' && row.yourDesktop === true && l.desktop.enabled, `the real browser is listed as a desktop-class row (${row ? row.label : 'MISSING'}) — marked yourDesktop`);
  let r = await caught(() => engine.attach(H, A));
  ok(r.ok && r.value.origin === 'desktop' && /USER'S OWN DESKTOP/.test(r.value.note), 'attach: the lease is desktop-class, the note is §6.6\'s');
  let snap = null;
  for (let i = 0; i < 10 && !(snap && snap.ok && snap.value.nodes.length > 5); i++) { snap = await caught(() => engine.snapshot(H, A, { budget: 1500, text: false })); if (!(snap.ok && snap.value.nodes.length > 5)) await sleep(1000); }
  ok(snap.ok && snap.value.nodes.length > 5 && snap.value.yourDesktop === true, `snapshot from the REAL AT-SPI tree: ${snap.ok ? snap.value.nodes.length : 0} nodes in ${snap.ok ? snap.value.ms : '?'} ms`, snap.ok ? null : snap.message);
  if (snap.ok) { const c = snap.value.census; console.log(`  census: Action ${c.action}/${c.nodes}, EditableText ${c.editableText}/${c.nodes}, Text ${c.text}/${c.nodes}, buttons with Action ${c.buttonsWithAction}/${c.buttons}, actions ${JSON.stringify(c.actionNames).slice(0, 200)}`); }
  ok(snap.ok && !JSON.stringify(snap.value).includes('devtools/browser') && !JSON.stringify(snap.value).includes('ws://'), 'nothing in the answer is a CDP url');
  // one click @ref on a node that self-reports an action (a button first, else any node with an action other than the never-by-default ones)
  const nodes = snap.ok ? snap.value.nodes : [];
  const pick = nodes.find((n) => /button/.test(n.role) && (n.actions || []).some((a) => !WT.NEVER_BY_DEFAULT.has(a))) || nodes.find((n) => (n.actions || []).some((a) => !WT.NEVER_BY_DEFAULT.has(a)));
  if (!pick) skip('no node in the tree self-reports a clickable action (coverage is per toolkit — the census above is the reading)');
  else {
    r = await caught(() => engine.act(H, A, { verb: 'click', ref: pick.ref }));
    ok(r.ok && r.value.did.by === 'node' && r.value.did.ref === pick.ref, `click ${pick.ref} (${pick.role} ${JSON.stringify(pick.name).slice(0, 40)}) = do_action "${r.ok ? r.value.did.action : '?'}" on the node, through NO injection`, r.ok ? null : r.message);
  }
  const noAct = nodes.find((n) => !n.actions || !n.actions.length);
  if (noAct) { r = await caught(() => engine.act(H, A, { verb: 'click', ref: noAct.ref })); ok(!r.ok && r.code === 'node_has_no_action', `a node without Action (${noAct.ref} ${noAct.role}) is refused, never degraded`); }
  // the two injection verbs: refused by name — with xdotool PRESENT on this box
  r = await caught(() => engine.act(H, A, { verb: 'key', chord: 'ctrl+l' }));
  ok(!r.ok && r.code === 'desktop_injection_refused' && r.e.verb === 'key', `a chord REFUSES by name on the class${xdotool ? ' although xdotool is on PATH' : ''}`);
  r = await caught(() => engine.act(H, A, { verb: 'click', at: '50,50' }));
  ok(!r.ok && r.code === 'desktop_injection_refused' && r.e.verb === 'click-at', 'a point click refuses by name');
  r = await caught(() => engine.watch(H, A));
  ok(!r.ok && r.code === 'no_live_view', 'watch: no_live_view');
  // §4.9 column 1: the window's own pixmap through x11grab
  if (!xdotool || !ffmpeg) skip(`screenshot rung needs xdotool + ffmpeg (${xdotool ? '' : 'xdotool missing '}${ffmpeg ? '' : 'ffmpeg missing'})`);
  else {
    r = await caught(() => engine.screenshot(H, A));
    ok(r.ok && r.value.via === 'x11grab' && r.value.bytes > 1000 && fs.existsSync(r.value.file), `screenshot = x11grab -window_id of the browser's own window (${r.ok ? r.value.bytes + ' bytes, ' + r.value.w + 'x' + r.value.h : r.code + ': ' + r.message})`);
    if (r.ok) try { fs.unlinkSync(r.value.file); } catch { }
  }
  // the argv is STILL clean after everything (nothing we did re-launched or re-flagged the browser)
  const after = readArgv(busPid);
  ok(after.join(' ') === cmdline.join(' ') && !after.some((a) => AUTOMATION_FLAGS.some((f) => a.startsWith(f))), 'the same process, the same argv, still no automation flag — the site saw an ordinary browser throughout');
  const audit = fs.readFileSync(engine.auditFile, 'utf8').trim().split('\n').map((x) => JSON.parse(x));
  ok(audit.length >= 4 && audit.every((x) => x.origin === 'desktop'), `every audit line carries origin:desktop (${audit.length})`);
  engine.shutdown();
}

try { await main(); } catch (e) { fail++; console.error(`  ✗ suite threw: ${e && e.stack || e}`); }
console.log(`\n${pass} passed, ${fail} failed, ${skipped} skipped`);
cleanup();
setTimeout(() => process.exit(fail ? 1 : 0), 700);

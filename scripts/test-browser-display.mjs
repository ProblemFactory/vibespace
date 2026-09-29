#!/usr/bin/env node
// HEADED IS A PREFERENCE, THE DISPLAY IS A FACT (lane headless-fallback, 2026-09-28 — the dev box at the GDM login
// screen after a reboot: every agent browser launch failed "Failed to connect to Wayland display … The platform failed
// to initialize", because ~/.agent-browser/config.json asks headed + --ozone-platform=wayland). FAST tier: the PURE rule
// (src/browser-display.js), the SHARED probe over real unix sockets in a scratch runtime dir (src/browser-facts.js
// probeDisplay), and the REAL keeper + routes + the shipped vibespace-browser over a FAKE agent-browser that behaves as
// measured on 0.38.1 + Chrome 154: a headed launch pinned to Wayland with no Wayland socket fails with the measured
// words, a headless one launches whatever the ozone arg says, and a later call whose view (headed, args, idle) differs
// from its daemon's launch RESTARTS it. Scratch dirs and an isolated $HOME only — no real browser, no display touched.
//
//   ① PURE tables: runtimeDirOf / parseX11Display / displayCandidates / displayVerdict (env × sockets: named, scanned,
//      stale, a regular file, abstract X, TCP DISPLAY, alive:null), launchPlan (wanted × display, both args shapes),
//      applyPlan, displayFact (+ recovered), the words; patched-copy controls (a verdict that counts a stale socket, a
//      plan that keeps the Wayland pin) caught by the same tables.
//   ② the probe: a listening socket counts, a killed server's socket file does not, a regular file does not, the lowest
//      live wayland-N wins, DISPLAY's X socket in an injected dir.
//   ③ the keeper: no display ⇒ a rung-N ephemeral, a rung-D ephemeral (its pairs' own config) and a named profile each
//      LAUNCH headless with the Wayland pin dropped (the user file byte-identical), the fact on the record / the digest /
//      the ephemerals row, the agent told ONCE (the launch's verb), later verbs name the same planned file (no restart);
//      the display comes back ⇒ the next launch is headed again (+ WAYLAND_DISPLAY named) and says so; Settings' route;
//      CONTROLS (patched keeper copies): the launch without the fact reproduces the incident (launch_failed, the
//      measured words); /resolve naming the base file makes the agent's verb restart the daemon into the same failure.
//   ④ the owner's surfaces: the words (src/lib/browser-display-words.js — headless / another display / the window is
//      back / Settings' line), zh + ja for every sentence (zh = the brief's words), and the wiring pins: the Agent browser
//      panel's rows, the switch dialog, the live view's note, Settings' read-only line, the CLI's note.
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import crypto from 'node:crypto';
import { execFile, spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { scratch, scratchHome, endRootedProcesses } from './scratch.mjs';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const D = require('../src/browser-display.js');
const F = require('../src/browser-facts.js');
const B = require('../src/browser-profiles.js');
const S = require('../src/browser-stream.js');

let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? '\n    ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 700) : '')); } return !!c; };
const REPO = new URL('..', import.meta.url).pathname;
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const ROOT = scratch('browser-display');
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(ROOT, { recursive: true });
const fakeHome = scratchHome('browser-display-home', fs, ['.agent-browser', '.vibespace']);
const kids = [];
const servers = [];
let srv = null;
function cleanup() {
  for (const c of kids) { try { process.kill(c, 'SIGKILL'); } catch { /* gone */ } }
  // the fake's daemons (real `sleep`s) — BEFORE the scratch dir holding their pid log goes (the fast-tier reaper found two)
  try { for (const l of fs.readFileSync(path.join(ROOT, 'ab-state', 'pids.log'), 'utf8').trim().split('\n').filter(Boolean)) { try { process.kill(JSON.parse(l).pid, 'SIGKILL'); } catch { /* gone */ } } } catch { /* none */ }
  for (const d of [ROOT, fakeHome]) { try { endRootedProcesses(d); } catch { /* */ } }
  for (const s of servers) { try { s.close(); } catch { /* */ } }
  try { srv?.close(); } catch { /* */ }
  for (const d of [ROOT, fakeHome]) fs.rmSync(d, { recursive: true, force: true });
}
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(130); });

const listenAt = (p) => new Promise((resolve, reject) => { const s = net.createServer((c) => c.destroy()); s.once('error', reject); s.listen(p, () => { servers.push(s); resolve(s); }); });
/** A socket FILE whose server is gone (a compositor that died): a child listens, then is SIGKILLed — the file stays. */
const staleSocketAt = (p) => new Promise((resolve) => {
  const c = spawn(process.execPath, ['-e', `require('net').createServer().listen(${JSON.stringify(p)}, () => console.log('L'))`], { stdio: ['ignore', 'pipe', 'ignore'] });
  kids.push(c.pid);
  c.stdout.once('data', () => { c.kill('SIGKILL'); c.once('exit', () => resolve()); });
});

// ═══ ① PURE ══════════════════════════════════════════════════════════════
console.log('— ① the rule (PURE src/browser-display.js)');
const OWNER_ARGS = '--no-sandbox,--disable-blink-features=AutomationControlled,--ozone-platform=wayland';
{
  ok(D.runtimeDirOf({ XDG_RUNTIME_DIR: '/run/user/7' }) === '/run/user/7' && D.runtimeDirOf({ XDG_RUNTIME_DIR: 'rel' }) === null && D.runtimeDirOf({}) === null, 'runtimeDirOf: an absolute XDG_RUNTIME_DIR, else none (never a guessed /run/user/<uid>)');
  const x = (v) => D.parseX11Display(v, '/x');
  ok(eq(x(':0'), { n: 0, name: ':0', path: '/x/X0', abstract: '@/x/X0' }) && x(':1.0').path === '/x/X1' && x('unix:3').path === '/x/X3' && x('host:10.0').tcp === true && x('localhost:0').tcp === true && x('') === null && x(undefined) === null, 'parseX11Display: :N / :N.S / unix:N are local sockets; a host form is TCP; unset is null');
  ok(eq(D.displayCandidates({ env: { XDG_RUNTIME_DIR: '/r', WAYLAND_DISPLAY: 'wayland-3', DISPLAY: ':2' }, listing: ['wayland-1', 'wayland-0', 'wayland-0.lock', 'pulse', 'wayland-x'], x11Dir: '/x' }), ['/r/wayland-3', '/r/wayland-0', '/r/wayland-1', '/x/X2', '@/x/X2']), 'displayCandidates: the named socket, the runtime dir\'s wayland-N in order (never a .lock), DISPLAY\'s X socket + its abstract twin — nothing else');
  const V = (env, entries) => D.displayVerdict({ env, entries, x11Dir: '/x' });
  const sock = (p, alive = true) => ({ path: p, type: 'socket', alive });
  const cases = [
    ['nothing at all', {}, [], 'none', null],
    ['no XDG, no DISPLAY', { HOME: '/h' }, [], 'none', null],
    ['a live wayland-0 in the runtime dir (the owner logs in after the server started)', { XDG_RUNTIME_DIR: '/r' }, [sock('/r/wayland-0')], 'wayland', '/r/wayland-0'],
    ['WAYLAND_DISPLAY names a live socket', { XDG_RUNTIME_DIR: '/r', WAYLAND_DISPLAY: 'wayland-1' }, [sock('/r/wayland-1'), sock('/r/wayland-0')], 'wayland', '/r/wayland-1'],
    ['WAYLAND_DISPLAY names a dead one, wayland-0 lives', { XDG_RUNTIME_DIR: '/r', WAYLAND_DISPLAY: 'wayland-1' }, [sock('/r/wayland-1', false), sock('/r/wayland-0')], 'wayland', '/r/wayland-0'],
    ['a STALE wayland-0 (its compositor died)', { XDG_RUNTIME_DIR: '/r' }, [sock('/r/wayland-0', false)], 'none', null],
    ['wayland-0 is a regular file', { XDG_RUNTIME_DIR: '/r' }, [{ path: '/r/wayland-0', type: 'other', alive: false }], 'none', null],
    ['an absolute WAYLAND_DISPLAY', { WAYLAND_DISPLAY: '/s/w' }, [sock('/s/w')], 'wayland', '/s/w'],
    ['DISPLAY=:0 and a live X0', { DISPLAY: ':0' }, [sock('/x/X0')], 'x11', '/x/X0'],
    ['DISPLAY=:0, the file swept by a tmp cleaner, the abstract socket alive', { DISPLAY: ':0' }, [{ path: '/x/X0', type: 'missing', alive: false }, sock('@/x/X0')], 'x11', '@/x/X0'],
    ['DISPLAY=:0, no socket at all', { DISPLAY: ':0' }, [{ path: '/x/X0', type: 'missing', alive: false }, sock('@/x/X0', false)], 'none', null],
    ['a TCP DISPLAY (cannot be proven by a socket here)', { DISPLAY: 'host:10.0' }, [], 'none', null],
    ['both: Wayland first', { XDG_RUNTIME_DIR: '/r', DISPLAY: ':1' }, [sock('/r/wayland-0'), sock('/x/X1')], 'wayland', '/r/wayland-0'],
    ['alive:null (not connect-tested) counts on existence', { XDG_RUNTIME_DIR: '/r' }, [sock('/r/wayland-2', null)], 'wayland', '/r/wayland-2'],
    ['the lowest LIVE wayland-N wins', { XDG_RUNTIME_DIR: '/r' }, [sock('/r/wayland-0', false), sock('/r/wayland-2'), sock('/r/wayland-1')], 'wayland', '/r/wayland-1'],
  ];
  let bad = [];
  for (const [name, env, entries, kind, socket] of cases) { const v = V(env, entries); if (v.kind !== kind || v.socket !== socket) bad.push({ name, got: [v.kind, v.socket] }); }
  ok(!bad.length, `displayVerdict: ${cases.length} env × socket rows`, bad);
  const vr = V({ XDG_RUNTIME_DIR: '/r' }, [sock('/r/wayland-0')]);
  ok(eq(vr.env, { WAYLAND_DISPLAY: 'wayland-0' }) && eq(V({ XDG_RUNTIME_DIR: '/r', WAYLAND_DISPLAY: 'wayland-0' }, [sock('/r/wayland-0')]).env, {}), 'a socket FOUND in the runtime dir is named for the launch (WAYLAND_DISPLAY); one the env already names adds nothing');
  const vb = V({ XDG_RUNTIME_DIR: '/r', DISPLAY: ':1' }, [sock('/r/wayland-0'), sock('/x/X1')]);
  ok(eq(vb.available, ['wayland', 'x11']) && vb.why.length === 0, 'available lists every kind here; nothing unexplained');
  const vn = V({ XDG_RUNTIME_DIR: '/r', DISPLAY: 'h:1' }, []);
  ok(vn.why.some((w) => /no wayland-\* socket in \/r/.test(w)) && vn.why.some((w) => /not a local display/.test(w)), 'why: one short line per thing looked at and not counted (Settings\' detail)', vn.why);

  // launchPlan
  const none = V({}, []);
  const wl = V({ XDG_RUNTIME_DIR: '/r' }, [sock('/r/wayland-0')]);
  const x11 = V({ DISPLAY: ':0' }, [sock('/x/X0')]);
  const p1 = D.launchPlan({ wanted: { headed: true, args: OWNER_ARGS }, display: none });
  ok(p1.headed === false && p1.args === '--no-sandbox,--disable-blink-features=AutomationControlled' && p1.changed && eq(p1.fallback, { why: 'no-display', wanted: 'headed', rung: 'headless', dropped: ['--ozone-platform=wayland'] }) && eq(p1.env, {}), 'THE OWNER\'S CASE: headed + the Wayland pin + no display ⇒ headless, the pin dropped, the fallback named', p1);
  const p2 = D.launchPlan({ wanted: { headed: true, args: ['--no-sandbox', '--ozone-platform=x11'] }, display: none });
  ok(eq(p2.args, ['--no-sandbox']) && p2.headed === false, 'a LIST of args stays a list');
  const p3 = D.launchPlan({ wanted: { headed: true, args: '--a\n--ozone-platform=wayland\n--b' }, display: none });
  ok(p3.args === '--a\n--b', 'newline-separated args stay newline-separated');
  const p4 = D.launchPlan({ wanted: { headed: true, args: '--no-sandbox' }, display: none });
  ok(p4.headed === false && p4.args === '--no-sandbox' && p4.changed && eq(p4.fallback.dropped, []), 'no ozone arg: headless all the same (agent-browser\'s own Xvfb is not assumed)');
  const p5 = D.launchPlan({ wanted: { headed: true, args: '--ozone-platform=headless' }, display: none });
  ok(p5.args === '--ozone-platform=headless' && p5.headed === false, 'an explicit --ozone-platform=headless pins no display — kept');
  ok(!D.launchPlan({ wanted: { headed: false, args: OWNER_ARGS }, display: none }).changed && !D.launchPlan({ wanted: { headed: null, args: OWNER_ARGS }, display: none }).changed, 'a launch that wants no window is untouched (measured: headless launches with the Wayland pin)');
  const p6 = D.launchPlan({ wanted: { headed: true, args: OWNER_ARGS }, display: wl });
  ok(!p6.changed && p6.headed === true && p6.args === OWNER_ARGS && eq(p6.env, { WAYLAND_DISPLAY: 'wayland-0' }), 'a display here ⇒ untouched (+ the socket it found named for a Wayland launch)', p6);
  const p7 = D.launchPlan({ wanted: { headed: true, args: OWNER_ARGS }, display: x11 });
  ok(p7.changed && p7.headed === true && p7.args === '--no-sandbox,--disable-blink-features=AutomationControlled,--ozone-platform=x11' && eq(p7.fallback, { why: 'ozone-unavailable', wanted: 'wayland', used: 'x11' }) && eq(p7.env, {}), 'the config pins Wayland, only X11 is here ⇒ the pin becomes x11, still headed', p7);
  const p8 = D.launchPlan({ wanted: { headed: true, args: '--ozone-platform=x11,--z,--ozone-platform=x11' }, display: wl });
  ok(p8.args === '--ozone-platform=wayland,--z' && p8.fallback.used === 'wayland' && eq(p8.env, { WAYLAND_DISPLAY: 'wayland-0' }), 'the X11 pin with only Wayland here ⇒ ONE wayland pin in the first one\'s place (every pin replaced) + the socket named', p8);
  // THE HIDDEN-WINDOW RUNG (addendum): Xvfb here + mode auto ⇒ a normal window on the CLI's own Xvfb
  const noneX = V({}, []); noneX.xvfb = true;
  const staleX = D.displayVerdict({ env: { DISPLAY: ':97', XDG_SESSION_TYPE: 'wayland' }, entries: [], x11Dir: '/x', xvfb: true });
  const h1 = D.launchPlan({ wanted: { headed: true, args: OWNER_ARGS }, display: noneX });
  ok(h1.headed === true && h1.args === '--no-sandbox,--disable-blink-features=AutomationControlled,--ozone-platform=x11' && h1.fallback.rung === 'hidden-window' && eq(h1.fallback.dropped, ['--ozone-platform=wayland']) && eq(h1.env, {}), 'no display + Xvfb here (auto) ⇒ HEADED on the CLI\'s own Xvfb: the Wayland pin becomes x11 (XDG_SESSION_TYPE=wayland would pick Wayland — measured), rung hidden-window', h1);
  const h2 = D.launchPlan({ wanted: { headed: true, args: OWNER_ARGS }, display: staleX });
  ok(staleX.kind === 'none' && staleX.envNamesDisplay === true && eq(h2.env, { DISPLAY: '', WAYLAND_DISPLAY: '' }), 'a STALE DISPLAY in the process env ⇒ the launch clears BOTH (measured: a named display keeps the CLI from starting its Xvfb; DISPLAY=\'\' beside a set WAYLAND_DISPLAY does too)', { staleX, h2 });
  ok(D.launchPlan({ wanted: { headed: true, args: OWNER_ARGS }, display: noneX, mode: 'headless' }).fallback.rung === 'headless' && D.launchPlan({ wanted: { headed: true, args: OWNER_ARGS }, display: { ...noneX, xvfb: false } }).fallback.rung === 'headless' && D.launchPlan({ wanted: { headed: true, args: OWNER_ARGS }, display: none }).headed === false, 'browser.noDisplayMode = headless, no Xvfb, or Xvfb unknown ⇒ the headless rung');
  ok(!D.launchPlan({ wanted: { headed: false, args: OWNER_ARGS }, display: noneX }).changed && D.launchPlan({ wanted: { headed: true, args: null }, display: noneX }).args === '--ozone-platform=x11', 'no window wanted ⇒ untouched even with Xvfb; no args ⇒ just the x11 pin');
  const fh = D.displayFact({ display: noneX, plan: h1, wanted: { headed: true, args: OWNER_ARGS }, mode: 'auto' });
  ok(D.factCode(fh) === 'hidden-window' && fh.xvfb === true && fh.mode === 'auto' && eq(D.planForFact({ args: OWNER_ARGS, headed: true }, fh), h1) && eq(D.planForFact({ args: OWNER_ARGS, headed: true }, D.displayFact({ display: noneX, wanted: { headed: true, args: OWNER_ARGS }, mode: 'headless' })).fallback.rung, 'headless'), 'the fact carries Xvfb + the mode, so every later call re-derives the SAME rung');
  ok(/runs in a hidden window/.test(D.agentNote(fh)) && /\[browser_hidden_window\]$/.test(D.agentNote(fh)) && /HIDDEN WINDOW/.test(D.journalLine(fh, 'x')), 'the agent\'s note and the journal name the rung');
  ok(!D.launchPlan({ wanted: { headed: true, args: '--ozone-platform=x11' }, display: vb }).changed && !D.launchPlan({ wanted: { headed: true, args: '--no-sandbox' }, display: x11 }).changed, 'a pin the machine has, or no pin with a display ⇒ untouched');
  ok(D.ozoneOf('--ozone-platform=x11,--ozone-platform=Wayland') === 'wayland' && D.ozoneOf(null) === null, 'the pin Chrome takes is the LAST one (case-folded)');
  const cfg = { args: OWNER_ARGS, headed: true, allowedDomains: ['a.example'] };
  const ap = D.applyPlan(cfg, p1);
  ok(ap !== cfg && ap.headed === false && ap.args === p1.args && eq(ap.allowedDomains, ['a.example']) && cfg.headed === true && cfg.args === OWNER_ARGS, 'applyPlan: a copy — every other key kept (the fence), the input never mutated');
  ok(D.applyPlan(cfg, p6) === cfg && !('args' in D.applyPlan({ args: '--ozone-platform=wayland', headed: true }, D.launchPlan({ wanted: { headed: true, args: '--ozone-platform=wayland' }, display: none }))), 'unchanged ⇒ the same object; an args list emptied ⇒ the key dropped');
  ok(eq(D.wantedOf({ headed: true, args: 'x' }), { headed: true, args: 'x' }) && D.wantedOf({ headed: true }, { headedEnv: false }).headed === false && D.wantedOf({}, { headedEnv: true }).headed === true, 'wantedOf: the config\'s headed, an AGENT_BROWSER_HEADED value winning over it');
  const f1 = D.displayFact({ display: none, plan: p1, wanted: { headed: true, args: OWNER_ARGS }, at: 5 });
  ok(f1.kind === 'none' && f1.headed === false && f1.fallback.why === 'no-display' && f1.wanted.ozone === 'wayland' && f1.recovered === null && D.planApplies(f1) && D.factCode(f1) === 'headless', 'displayFact: what was wanted, what the plan did', f1);
  const f2 = D.displayFact({ display: wl, plan: p6, wanted: { headed: true, args: OWNER_ARGS }, prev: f1, at: 6 });
  ok(f2.recovered === 'no-display' && !D.planApplies(f2) && D.factCode(f2) === 'recovered' && eq(f2.env, { WAYLAND_DISPLAY: 'wayland-0' }), 'the display is back after a fallback ⇒ `recovered` (the row says the window is back)');
  ok(D.displayFact({ display: none, plan: p1, wanted: { headed: true }, prev: f1 }).recovered === null && D.factCode(D.displayFact({ display: wl, plan: p6, wanted: { headed: true } })) === null, 'still no display ⇒ not recovered; a plain headed launch ⇒ nothing to say');
  ok(eq(D.planForFact(cfg, f1), p1) && !D.planForFact(cfg, f2).changed, 'planForFact: a recorded fact re-derives the SAME plan for the same base config (every later call names the same file)');
  ok(/no desktop session, so this browser runs headless/.test(D.agentNote(f1)) && /\[browser_headless\]$/.test(D.agentNote(f1)) && /back/.test(D.agentNote(f2)) && D.agentNote(null) === '' && !/agent-browser/.test(D.agentNote(f1)), 'the agent\'s sentence (English, a code tag, never the hidden CLI\'s name)');
  ok(/launched headless instead of the window/.test(D.journalLine(f1, 'x')) && /dropped --ozone-platform=wayland/.test(D.journalLine(f1, 'x')) && D.journalLine({ kind: 'wayland' }, 'x') === '', 'the journal line names what was dropped');

  // CONTROLS: patched copies of the PURE module, judged by the SAME rows
  const MP = mutantCopies('browser-display-pure', REPO);
  const src = fs.readFileSync(path.join(REPO, 'src/browser-display.js'), 'utf8');
  const liveLine = "const live = (p) => { const e = p ? byPath.get(p) : null; return !!e && e.type === 'socket' && e.alive !== false; };";
  const keepLine = "    const cut = withoutDisplayOzone(args);";
  ok(src.includes(liveLine) && src.includes(keepLine), 'CONTROL setup: the liveness line and the drop line are found');
  const DS = MP.load('src/browser-display.js', src.replace(liveLine, "const live = (p) => { const e = p ? byPath.get(p) : null; return !!e && e.type === 'socket'; };"), 'stale-counts');
  ok(DS.displayVerdict({ env: { XDG_RUNTIME_DIR: '/r' }, entries: [sock('/r/wayland-0', false)] }).kind === 'wayland', 'CONTROL: a verdict that ignores the connect test counts the STALE socket (the table row above would be red)');
  const DK = MP.load('src/browser-display.js', src.replace(keepLine, '    const cut = { args, dropped: [] };'), 'keeps-pin');
  ok(DK.launchPlan({ wanted: { headed: true, args: OWNER_ARGS }, display: none }).args === OWNER_ARGS, 'CONTROL: a plan that keeps the Wayland pin is caught by the owner\'s-case row');
  const modeLine = "    if (noDisplayModeOf(mode) === 'auto' && d.xvfb === true) {";
  const clearLine = "env: d.envNamesDisplay ? { DISPLAY: '', WAYLAND_DISPLAY: '' } : {} };";
  ok(src.includes(modeLine) && src.includes(clearLine), 'CONTROL setup: the rung\'s mode gate and its display clearing are found');
  const DM = MP.load('src/browser-display.js', src.replace(modeLine, '    if (d.xvfb === true) {'), 'ignores-mode');
  ok(DM.launchPlan({ wanted: { headed: true, args: OWNER_ARGS }, display: noneX, mode: 'headless' }).fallback.rung === 'hidden-window', 'CONTROL: a plan that ignores browser.noDisplayMode is caught by the "headless" row');
  const DC = MP.load('src/browser-display.js', src.replace(clearLine, 'env: {} };'), 'keeps-stale-display');
  ok(eq(DC.launchPlan({ wanted: { headed: true, args: OWNER_ARGS }, display: staleX }).env, {}), 'CONTROL: a plan that keeps a stale DISPLAY is caught by the stale-display row (the fake below fails that launch)');
  for (const r of copiesCensus(MP.files, MP.dir, REPO, { label: 'PURE controls: ' })) ok(r.pass, r.name, r.detail);
}

// ═══ ② the SHARED probe ═════════════════════════════════════════════════
console.log('— ② the probe (SHARED src/browser-facts.js probeDisplay) over real sockets');
{
  const R2 = path.join(ROOT, 'probe'); fs.mkdirSync(path.join(R2, 'run'), { recursive: true }); fs.mkdirSync(path.join(R2, 'x'), { recursive: true });
  const run = path.join(R2, 'run');
  let v = await F.probeDisplay({ env: { XDG_RUNTIME_DIR: run }, x11Dir: path.join(R2, 'x') });
  ok(v.kind === 'none' && v.socket === null, 'an empty runtime dir ⇒ no display', v);
  await staleSocketAt(path.join(run, 'wayland-0'));
  fs.writeFileSync(path.join(run, 'wayland-1'), 'not a socket');
  v = await F.probeDisplay({ env: { XDG_RUNTIME_DIR: run } });
  ok(v.kind === 'none' && fs.statSync(path.join(run, 'wayland-0')).isSocket(), 'a socket file whose server was killed and a regular file ⇒ still no display (connected to, refused)', v);
  await listenAt(path.join(run, 'wayland-2'));
  v = await F.probeDisplay({ env: { XDG_RUNTIME_DIR: run } });
  ok(v.kind === 'wayland' && v.name === 'wayland-2' && eq(v.env, { WAYLAND_DISPLAY: 'wayland-2' }), 'a LISTENING wayland-2 beside them ⇒ Wayland, named for the launch', v);
  await listenAt(path.join(R2, 'x', 'X9'));
  v = await F.probeDisplay({ env: { DISPLAY: ':9' }, x11Dir: path.join(R2, 'x') });
  ok(v.kind === 'x11' && v.socket === path.join(R2, 'x', 'X9'), 'DISPLAY=:9 + a listening X9 in the (injected) X dir ⇒ X11', v);
  const xb = path.join(R2, 'xbin'); fs.mkdirSync(xb, { recursive: true }); fs.writeFileSync(path.join(xb, 'Xvfb'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  fs.writeFileSync(path.join(R2, 'x', 'Xvfb'), 'not executable', { mode: 0o644 });
  const vx = await F.probeDisplay({ env: { PATH: `${path.join(R2, 'x')}:${xb}` } }), vn = await F.probeDisplay({ env: { PATH: path.join(R2, 'x') } });
  ok(vx.xvfb === true && vn.xvfb === false, 'the probe answers Xvfb: an EXECUTABLE Xvfb on the env\'s PATH (the one the browser launches with), a non-executable file is not one', { vx: vx.xvfb, vn: vn.xvfb });
  const t0 = Date.now();
  v = await F.probeDisplay({ env: { DISPLAY: ':8' }, x11Dir: path.join(R2, 'x') });
  ok(v.kind === 'none' && Date.now() - t0 < 2000, 'DISPLAY names a display with no socket ⇒ none, bounded', { v, ms: Date.now() - t0 });
}

// ═══ ③ the keeper + routes + the shipped CLI over a fake 0.38.1 ══════════════
console.log('— ③ the real keeper, the routes and the shipped CLI (a fake agent-browser that behaves as measured)');
const DATA = path.join(ROOT, 'data'); fs.mkdirSync(DATA, { recursive: true });
const BIN = path.join(ROOT, 'bin'); fs.mkdirSync(BIN, { recursive: true });
const AB_STATE = path.join(ROOT, 'ab-state'); fs.mkdirSync(AB_STATE, { recursive: true });
const SOCK = path.join(ROOT, 'sock'); fs.mkdirSync(SOCK, { recursive: true });
const XDG = path.join(ROOT, 'xdg'); fs.mkdirSync(XDG, { recursive: true, mode: 0o700 });
// the PATH the keeper, the fake and the CLI run with holds NO system Xvfb (the hidden-window rung is chosen by what the
// suite puts there — XBIN — never by what this box has installed): the fake binary + `sleep` (its daemons)
const SYSBIN = path.join(ROOT, 'sysbin'); fs.mkdirSync(SYSBIN, { recursive: true });
for (const d of String(process.env.PATH || '/usr/bin:/bin').split(':')) { try { if (fs.statSync(path.join(d, 'sleep')).isFile()) { fs.symlinkSync(path.join(d, 'sleep'), path.join(SYSBIN, 'sleep')); break; } } catch { /* next */ } }
const XBIN = path.join(ROOT, 'xbin'); fs.mkdirSync(XBIN, { recursive: true });
fs.writeFileSync(path.join(XBIN, 'Xvfb'), '#!/bin/sh\nexit 0\n', { mode: 0o755 }); // presence is the fact; the fake never runs it
const PATH_ENV = `${BIN}:${SYSBIN}`;
// THE FAKE: state per (namespace, session); a daemon = a real `sleep`; the launch VIEW = {headed (HEADED env over the
// config), args, idle}; a headed launch pinned to a platform whose display is absent fails with the MEASURED words; a
// page command / cdp-url / stream status whose view differs from its daemon's RESTARTS it (logged), like 0.38.1
fs.writeFileSync(path.join(BIN, 'agent-browser'), `#!${process.execPath}
const fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const st = process.env.FAKE_AB_STATE; const ns = process.env.AGENT_BROWSER_NAMESPACE || 'default'; const sess = process.env.AGENT_BROWSER_SESSION || ns;
const f = path.join(st, (ns + '__' + sess).replace(/[^\\w.-]/g, '_') + '.json');
const read = () => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const out = (o) => { process.stdout.write(JSON.stringify(o) + '\\n'); };
const logTo = (n, o) => fs.appendFileSync(path.join(st, n), JSON.stringify(o) + '\\n');
const argv = process.argv.slice(2).filter((x) => x !== '--json' && x !== '--pin-tab');
const [a, b] = argv;
const cfgFile = process.env.AGENT_BROWSER_CONFIG || null;
let cfg = {}; try { cfg = JSON.parse(fs.readFileSync(cfgFile || path.join(process.env.HOME || '/nonexistent', '.agent-browser', 'config.json'), 'utf8')) || {}; } catch { cfg = {}; } // no config named ⇒ the user file, like the real CLI's search
const H = process.env.AGENT_BROWSER_HEADED;
const headed = H === '1' ? true : H === '0' ? false : cfg.headed === true;
const args = Array.isArray(cfg.args) ? cfg.args.join(',') : String(cfg.args || '');
const view = JSON.stringify({ headed, args, idle: process.env.AGENT_BROWSER_IDLE_TIMEOUT_MS || null });
const cdp = !!process.env.AGENT_BROWSER_CDP;
function launch(by) {
  const oz = ((args.match(/--ozone-platform=([a-z]+)/gi) || []).pop() || '').split('=')[1] || null;
  const wd = process.env.WAYLAND_DISPLAY || 'wayland-0';
  let wok = false; try { wok = fs.statSync(wd.startsWith('/') ? wd : path.join(process.env.XDG_RUNTIME_DIR || '/nonexistent', wd)).isSocket(); } catch { wok = false; }
  // MEASURED on 0.38.1: a headed launch starts its OWN Xvfb when one is on PATH and DISPLAY is unset (or DISPLAY and
  // WAYLAND_DISPLAY are both empty); a named DISPLAY (dead here) or DISPLAY='' beside a set WAYLAND_DISPLAY starts none
  const hasXvfb = String(process.env.PATH || '').split(':').some((d) => { try { fs.accessSync(path.join(d, 'Xvfb'), fs.constants.X_OK); return true; } catch { return false; } });
  const D0 = process.env.DISPLAY, W0 = process.env.WAYLAND_DISPLAY;
  const ownXvfb = headed && hasXvfb && (D0 === undefined || (D0 === '' && !W0));
  // Chrome's platform: the pin; none ⇒ XDG_SESSION_TYPE=wayland picks Wayland (measured), else X11
  const plat = oz || (process.env.XDG_SESSION_TYPE === 'wayland' ? 'wayland' : 'x11');
  logTo('launches.log', { ns, sess, by, headed, args, config: cfgFile, wayland: process.env.WAYLAND_DISPLAY || null, idle: process.env.AGENT_BROWSER_IDLE_TIMEOUT_MS || null, display: D0 === undefined ? null : D0, xvfb: ownXvfb });
  if (headed && plat === 'wayland' && !wok) { out({ success: false, error: 'Chrome exited early (exit code: 1) without writing DevToolsActivePort\\nChrome stderr:\\n  ERROR:ui/ozone/platform/wayland/host/wayland_connection.cc:206] Failed to connect to Wayland display: No such file or directory (2)\\n  ERROR:ui/aura/env.cc:246] The platform failed to initialize.  Exiting.' }); process.exit(1); }
  if (headed && plat === 'x11' && !ownXvfb) { out({ success: false, error: 'Chrome exited early (exit code: 1)\\n  ERROR:ui/ozone/platform/x11/ozone_platform_x11.cc:257] Missing X server or $DISPLAY' }); process.exit(1); }
  const c = spawn('sleep', ['600'], { detached: true, stdio: 'ignore' }); c.unref();
  const s = { pid: c.pid, view }; fs.writeFileSync(f, JSON.stringify(s)); logTo('pids.log', { pid: c.pid });
  return s;
}
function ensure(by) {
  if (cdp) return { pid: null };
  let s = read();
  if (s && alive(s.pid) && s.view !== view) { logTo('restarts.log', { ns, sess, by, from: s.view, to: view }); try { process.kill(s.pid, 'SIGKILL'); } catch { } try { fs.unlinkSync(f); } catch { } s = null; }
  if (!(s && alive(s.pid))) s = launch(by);
  return s;
}
if (a === '--version') { console.log('agent-browser 0.38.1'); process.exit(0); }
if (a === 'session' && b === 'info') { const s = read(); const act = !!(s && alive(s.pid)); out({ success: true, data: { active: act, namespace: ns, pid: act ? s.pid : null, session: sess, socketDir: path.join(st, 'run') } }); process.exit(0); }
if (a === 'close' && b === '--all') { const s = read(); if (s && alive(s.pid)) { try { process.kill(s.pid, 'SIGKILL'); } catch { } } try { fs.unlinkSync(f); } catch { } out({ success: true, data: { closed: 1 } }); process.exit(0); }
if (a === 'get' && b === 'cdp-url') { const s = ensure('cdp-url'); out({ success: true, data: { cdpUrl: 'ws://127.0.0.1:9/devtools/browser/fake-' + ns } }); process.exit(0); }
if (a === 'stream' && b === 'status') { ensure('stream'); out({ success: true, data: { enabled: true, connected: false, port: 20001, screencasting: false } }); process.exit(0); }
if (a === 'eval') { const s = ensure('eval'); const v = JSON.parse((read() || {}).view || '{}'); out({ success: true, data: { result: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) ' + (v.headed ? 'Chrome' : 'HeadlessChrome') + '/154.0.0.0 Safari/537.36' } }); process.exit(0); }
if (['open', 'snapshot', 'click', 'fill'].includes(a)) { ensure(a); logTo('cmds.log', { verb: a, ns, sess, config: cfgFile, cdp }); out({ success: true, data: { ok: true } }); process.exit(0); }
out({ success: false, error: 'fake: unknown verb ' + process.argv.slice(2).join(' ') }); process.exit(1);
`, { mode: 0o755 });
const logOf = (name) => { try { return fs.readFileSync(path.join(AB_STATE, name), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };
const launches = () => logOf('launches.log');
const restarts = () => logOf('restarts.log');
const cmds = () => logOf('cmds.log');

// the owner's config SHAPE (no profile — this suite never touches a real one); the user file must stay byte-identical
const UCFG = path.join(fakeHome, '.agent-browser', 'config.json');
fs.writeFileSync(UCFG, JSON.stringify({ args: OWNER_ARGS, headed: true }, null, 2));
const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const USER_SHA = sha(UCFG);

const K = require('../src/server/browser-keeper.js');
const express = require('express');
const Rt = require('../src/routes/browser.js');
const rtEnv = { PATH: PATH_ENV, HOME: fakeHome, FAKE_AB_STATE: AB_STATE, XDG_RUNTIME_DIR: XDG };
const settings = { 'browser.idleTimeoutMs': 600000 };
const live = new Set();
const quiet = { log() { }, warn() { }, error() { } };
const journal = [];
const jlog = { log() { }, warn(m) { journal.push(String(m)); }, error() { } };
const mkKeeper = (KM, extra = {}) => KM.create({ dataDir: DATA, homeDir: fakeHome, env: () => rtEnv, broadcast: null, serverSetting: (x) => settings[x], serverNotice: () => 1, getTelemetry: () => null,
  liveKeys: () => live, runtime: F.createBrowserRuntime({ env: rtEnv }), facts: F.createBrowserFacts({ env: rtEnv }), log: jlog, install: false, ...extra });
const sessions = new Map();
const TOKEN = (n) => 'vsst_' + String(n).repeat(24).slice(0, 24);
const pairsN = (key) => [...B.browserEnvFor({ browserKey: key, variant: B.VARIANTS.N, idleMs: 600000 }), `AGENT_BROWSER_SOCKET_DIR=${SOCK}`];
const mkSession = (id, key, n, pairs, variant) => { live.add(key); const s = { agentToken: TOKEN(n), _browserKey: key, _browserVariant: variant, _browserEnv: pairs, name: `session ${id}` }; sessions.set(id, s); return s; };
const app = express(); app.use(express.json());
let k = mkKeeper(K);
Rt.setup({ keeper: k, activeSessions: sessions, browserEnv: () => null, adoptRoots: { homeDir: fakeHome, dataDir: DATA }, tasksForSession: () => [] });
app.use(Rt.router);
srv = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
const API = `http://127.0.0.1:${srv.address().port}`;
const CLI = path.join(REPO, 'data/bin/vibespace-browser');
const cliEnvFor = (s) => ({ PATH: PATH_ENV, HOME: fakeHome, FAKE_AB_STATE: AB_STATE, XDG_RUNTIME_DIR: XDG, VIBESPACE_API: API, VIBESPACE_SESSION_TOKEN: s.agentToken, VIBESPACE_SKIP_AGENT_HOOKS: '1', ...S.pairsToEnv(s._browserEnv) });
const cli = (args, env) => new Promise((resolve) => execFile(process.execPath, [CLI, ...args], { env, encoding: 'utf8', timeout: 30000 }, (err, stdout, stderr) => resolve({ status: err ? (typeof err.code === 'number' ? err.code : null) : 0, stdout: String(stdout || ''), stderr: String(stderr || '') })));
const ephOf = (kk, key) => kk._reg().profiles.find((p) => B.isEphemeralProfile(p) && p.owner.id === key) || null;
const NOTE_HEADLESS = /^note: this machine has no desktop session, so this browser runs headless .*\[browser_headless\]$/m;
const cfgOfLaunch = (l) => { try { return JSON.parse(fs.readFileSync(l.config, 'utf8')); } catch { return null; } };

const KEY_N = 'bk-0000d001', KEY_D = 'bk-0000d002', KEY_W = 'bk-0000d003', KEY_C1 = 'bk-0000d0c1', KEY_C2 = 'bk-0000d0c2';
{
  // ─ rung N: the keeper's own machine-ephemeral file is the base
  const sN = mkSession('sess-n', KEY_N, 'n', pairsN(KEY_N), 'N');
  let c = await cli(['snapshot'], cliEnvFor(sN));
  const pN = ephOf(k, KEY_N);
  const recN = pN ? k.browserOf(pN.id) : null;
  let L = launches().filter((l) => l.sess === 'vs-' + KEY_N);
  ok(c.status === 0 && recN && recN.state === 'ready', 'rung N, NO DISPLAY: the first verb SUCCEEDS (it failed "The platform failed to initialize" before)', c.stderr);
  ok(L.length === 1 && L[0].headed === false && L[0].args === '--no-sandbox,--disable-blink-features=AutomationControlled,--vibespace-keeper=' + KEY_N && !/ozone/.test(L[0].args), 'the launch ran HEADLESS with the Wayland pin dropped (the launch mark kept)', L);
  ok(L[0].config && L[0].config.startsWith(path.join(DATA, 'browser-env', 'display') + '/') && cfgOfLaunch(L[0]).headed === false, 'under the PLANNED file (data/browser-env/display/…), never the base', L[0]);
  ok(recN && recN.display && recN.display.kind === 'none' && recN.display.fallback.why === 'no-display' && recN.display.wanted.headed === true && recN.display.wanted.ozone === 'wayland', 'the fact rides the record (no display, a window was wanted, Wayland pinned)', recN && recN.display);
  ok(NOTE_HEADLESS.test(c.stderr) && (c.stderr.match(/\[browser_headless\]/g) || []).length === 1, 'the AGENT is told once, on the verb that launched it', c.stderr);
  c = await cli(['click', '@e1'], cliEnvFor(sN));
  const cm = cmds().filter((x) => x.sess === 'vs-' + KEY_N);
  ok(c.status === 0 && !/\[browser_headless\]/.test(c.stderr) && restarts().length === 0 && launches().filter((l) => l.sess === 'vs-' + KEY_N).length === 1, 'a later verb: no note, NO restart (its view equals the launch\'s), still one launch', { stderr: c.stderr, restarts: restarts() });
  ok(cm.length === 3 && cm[0].verb === 'open' && cm.every((x) => x.config === L[0].config), 'the launch and every agent command named the SAME planned file (/resolve handed it to the CLI)', cm);
  const eRow = k.ephemerals().find((e) => e.browserKey === KEY_N);
  ok(eRow && eRow.display && eRow.display.fallback.why === 'no-display' && k.list().browsers[pN.id].display.fallback.why === 'no-display', 'the Agent browser panel\'s ephemeral row and the digest\'s browsers carry the fact');
  ok(journal.some((j) => /no desktop session on this machine .* launched headless instead of the window its config asks for; dropped --ozone-platform=wayland/.test(j)), 'ONE journal line names the fallback and what was dropped', journal);
  ok(sha(UCFG) === USER_SHA, 'the user\'s ~/.agent-browser/config.json is byte-identical');
  const disp = await (await fetch(API + '/api/browser/display')).json();
  ok(disp.display && disp.display.kind === 'none' && Array.isArray(disp.display.why), 'GET /api/browser/display (Settings\' line): this machine, now — no display', disp);

  // ─ rung D: the session's OWN generated config (browser-env's) is the base — it is never rewritten either
  const genD = path.join(DATA, 'browser-env', KEY_D + '.json');
  fs.mkdirSync(path.dirname(genD), { recursive: true });
  fs.writeFileSync(genD, JSON.stringify(B.generatedConfigParts({ userConfig: { args: OWNER_ARGS, headed: true }, projectConfig: null, pinnedDir: null, headed: null, mark: KEY_D }).config, null, 2));
  const genSha = sha(genD);
  const sD = mkSession('sess-d', KEY_D, 'd', [...B.browserEnvFor({ browserKey: KEY_D, variant: B.VARIANTS.D, configPath: genD, idleMs: 600000 }), `AGENT_BROWSER_SOCKET_DIR=${SOCK}`], 'D');
  c = await cli(['open', 'https://example.test/'], cliEnvFor(sD));
  L = launches().filter((l) => l.sess === 'vs-' + KEY_D);
  ok(c.status === 0 && L.length === 1 && L[0].headed === false && !/ozone/.test(L[0].args) && L[0].config !== genD && sha(genD) === genSha, 'rung D: the launch ran headless under a planned copy of the session\'s generated config — that file untouched', { L, stderr: c.stderr });
  ok(NOTE_HEADLESS.test(c.stderr), '…and the agent is told', c.stderr);
  c = await cli(['snapshot'], cliEnvFor(sD));
  const cmD = cmds().filter((x) => x.sess === 'vs-' + KEY_D);
  ok(c.status === 0 && restarts().length === 0 && cmD.length === 3 && cmD.every((x) => x.config === L[0].config), 'its later verb names the same planned file (the answer\'s `config` wins over the pairs\' own) — no restart', { cmD, restarts: restarts() });

  // ─ a NAMED profile, the setting asking for a window: the launch view carries HEADED=0 and the planned file
  settings['browser.headed'] = 'yes';
  const prof = k.createProfile({ label: 'Work' }, { owner: { kind: 'instance', id: null } });
  const sW = mkSession('sess-w', KEY_W, 'w', pairsN(KEY_W), 'N');
  c = await cli(['use', 'Work'], cliEnvFor(sW));
  const Lw = launches().filter((l) => l.ns === 'vs-' + prof.id);
  const recW = k.browserOf(prof.id);
  ok(c.status === 0 && recW.state === 'ready' && Lw.length === 1 && Lw[0].headed === false && !/ozone/.test(Lw[0].args) && recW.launchEnv.AGENT_BROWSER_HEADED === '0', 'a NAMED profile (browser.headed = "Show the window"): launched headless — HEADED=0 in its launch view, the pin dropped', { Lw, env: recW.launchEnv, stderr: c.stderr });
  ok(/\[browser_headless\]/.test(c.stderr) && recW.display.fallback.why === 'no-display', '`use` told the agent (the launch was this use\'s)', c.stderr);
  ok(restarts().length === 0, 'the keeper\'s own cdp-url after the launch did not restart it (same view)', restarts());
  c = await cli(['snapshot'], cliEnvFor(sW));
  ok(c.status === 0 && restarts().length === 0 && !/\[browser_headless\]/.test(c.stderr) && cmds().some((x) => x.verb === 'snapshot' && x.cdp), 'its commands reach the one browser over CDP (no launch, no note)', { status: c.status, stderr: c.stderr, stdout: c.stdout, cmds: cmds().slice(-3) });
  settings['browser.headed'] = '';

  // ─ THE DISPLAY COMES BACK: the owner logs in — the NEXT launch is headed again, and says so (no restart of anything)
  await k.stop(pN.id, { why: 'user' });
  await listenAt(path.join(XDG, 'wayland-0'));
  const before = launches().length;
  c = await cli(['snapshot'], cliEnvFor(sN));
  const L2 = launches().slice(before).filter((l) => l.sess === 'vs-' + KEY_N);
  const recN2 = k.browserOf(pN.id);
  ok(c.status === 0 && L2.length === 1 && L2[0].headed === true && /--ozone-platform=wayland/.test(L2[0].args) && L2[0].wayland === 'wayland-0', 'a Wayland socket appeared: the next launch is HEADED on it (the pin kept, WAYLAND_DISPLAY named — the server env never had it)', { L2, stderr: c.stderr });
  ok(recN2.display.kind === 'wayland' && recN2.display.fallback === null && recN2.display.recovered === 'no-display' && /the desktop session is back/.test(c.stderr), 'the record says the window is back (`recovered`) and the agent is told', { d: recN2.display, stderr: c.stderr });
  ok(L2[0].config && !L2[0].config.includes(path.join('browser-env', 'display')), 'no plan ⇒ the base file itself');
  const disp2 = await (await fetch(API + '/api/browser/display')).json();
  ok(disp2.display.kind === 'wayland' && disp2.display.name === 'wayland-0', 'Settings\' line follows: Wayland now', disp2);
  ok(sha(UCFG) === USER_SHA, 'the user file is still byte-identical');
  try { await k.stop(pN.id, { why: 'user' }); } catch { /* */ }
  for (const s of servers.splice(0)) { await new Promise((r) => s.close(() => r())); }
  try { fs.unlinkSync(path.join(XDG, 'wayland-0')); } catch { /* gone */ }
}

// ─ THE HIDDEN-WINDOW RUNG (addendum): an Xvfb on the launch PATH, a STALE DISPLAY and XDG_SESSION_TYPE=wayland in the
//   server's env (the two measured ways the CLI's own Xvfb is missed) — a normal window, UA Chrome/154, said by name
{
  const rtEnvX = { ...rtEnv, PATH: `${BIN}:${XBIN}:${SYSBIN}`, DISPLAY: ':97', XDG_SESSION_TYPE: 'wayland' };
  const DATAX = path.join(ROOT, 'data-x'); fs.mkdirSync(DATAX, { recursive: true });
  const kx = K.create({ dataDir: DATAX, homeDir: fakeHome, env: () => rtEnvX, broadcast: null, serverSetting: (x) => settings[x], serverNotice: () => 1, getTelemetry: () => null,
    liveKeys: () => live, runtime: F.createBrowserRuntime({ env: rtEnvX }), facts: F.createBrowserFacts({ env: rtEnvX }), log: jlog, install: false });
  Rt.setup({ keeper: kx, activeSessions: sessions, browserEnv: () => null, adoptRoots: { homeDir: fakeHome, dataDir: DATAX }, tasksForSession: () => [] });
  const cliX = (s) => ({ ...cliEnvFor(s), PATH: rtEnvX.PATH });
  const sH = mkSession('sess-h', 'bk-0000d0a1', 'h', pairsN('bk-0000d0a1'), 'N');
  const b0 = launches().length, r0 = restarts().length;
  let c = await cli(['snapshot'], cliX(sH));
  const pH = ephOf(kx, 'bk-0000d0a1');
  const recH = pH ? kx.browserOf(pH.id) : null;
  const LH = launches().slice(b0).filter((l) => l.sess === 'vs-bk-0000d0a1');
  ok(c.status === 0 && LH.length === 1 && LH[0].headed === true && LH[0].xvfb === true && /--ozone-platform=x11/.test(LH[0].args) && !/wayland/.test(LH[0].args) && LH[0].display === '', 'Xvfb on the PATH, no desktop: launched HEADED on the CLI\'s own Xvfb — the Wayland pin became x11, the stale DISPLAY cleared', { LH, stderr: c.stderr });
  ok(recH && recH.display && recH.display.fallback.rung === 'hidden-window' && recH.display.xvfb === true && /\[browser_hidden_window\]/.test(c.stderr) && !/\[browser_headless\]/.test(c.stderr), 'the record says hidden-window; the agent is told which rung', { d: recH && recH.display, stderr: c.stderr });
  c = await cli(['eval', 'navigator.userAgent'], cliX(sH));
  ok(c.status === 0 && /Chrome\/154/.test(c.stdout) && !/HeadlessChrome/.test(c.stdout) && restarts().length === r0, 'navigator.userAgent through the keeper: Chrome/154 (not HeadlessChrome) — and no restart (the same planned file)', { stdout: c.stdout, restarts: restarts().slice(r0) });
  const eRow = kx.ephemerals().find((e) => e.browserKey === 'bk-0000d0a1');
  ok(eRow && D.factCode(eRow.display) === 'hidden-window', 'the Agent browser panel\'s row carries the rung');
  const dispX = await (await fetch(API + '/api/browser/display')).json();
  ok(dispX.display && dispX.display.kind === 'none' && dispX.display.xvfb === true && dispX.mode === 'auto', 'Settings\' route: no display, Xvfb installed, mode auto', dispX);
  // browser.noDisplayMode = headless: Xvfb present, headless all the same
  settings['browser.noDisplayMode'] = 'headless';
  const sH2 = mkSession('sess-h2', 'bk-0000d0a2', 'k', pairsN('bk-0000d0a2'), 'N');
  const b1 = launches().length;
  c = await cli(['snapshot'], cliX(sH2));
  const LH2 = launches().slice(b1).filter((l) => l.sess === 'vs-bk-0000d0a2');
  const recH2 = ephOf(kx, 'bk-0000d0a2') ? kx.browserOf(ephOf(kx, 'bk-0000d0a2').id) : null;
  ok(c.status === 0 && LH2.length === 1 && LH2[0].headed === false && LH2[0].xvfb === false && recH2.display.fallback.rung === 'headless' && /\[browser_headless\]/.test(c.stderr), 'browser.noDisplayMode = "Always headless": Xvfb present, the launch is headless', { LH2, stderr: c.stderr });
  const dispH = await (await fetch(API + '/api/browser/display')).json();
  ok(dispH.mode === 'headless', 'the route says the mode', dispH);
  settings['browser.noDisplayMode'] = '';
  for (const e of kx.ephemerals()) { try { await kx.stop(e.profileId, { why: 'user' }); } catch { /* */ } }
  Rt.setup({ keeper: k, activeSessions: sessions, browserEnv: () => null, adoptRoots: { homeDir: fakeHome, dataDir: DATA }, tasksForSession: () => [] });
}

// ─ A PAIRED MACHINE: the `browser-serve` op (what its daemon runs) probes ITS display and plans against ITS config
{
  const BS = require('../src/browser-serve.js');
  const sHome = path.join(ROOT, 'serve-home'); fs.mkdirSync(path.join(sHome, '.agent-browser'), { recursive: true });
  const sCfg = path.join(sHome, '.agent-browser', 'config.json');
  fs.writeFileSync(sCfg, JSON.stringify({ args: OWNER_ARGS, headed: true }, null, 2));
  const sSha = sha(sCfg);
  let dsp = D.displayVerdict({});
  const bs = BS.install({ env: { PATH: PATH_ENV, HOME: sHome, FAKE_AB_STATE: AB_STATE, XDG_RUNTIME_DIR: XDG }, homeDir: sHome, displayProbe: async () => dsp });
  const pid = 'bp-0000d5e1', ns = 'vs-' + pid;
  const before = launches().length, r0 = restarts().length;
  let r = await BS.runBrowserServeOp(bs, 'start', { profileId: pid, idleMs: 0, headed: true });
  const Ls = launches().slice(before).filter((l) => l.ns === ns);
  const plan = BS.planFileOf(bs, ns);
  ok(r.ok && r.display && r.display.fallback && r.display.fallback.why === 'no-display' && Ls.length === 1 && Ls[0].headed === false && !/ozone/.test(Ls[0].args) && Ls[0].config === plan, 'browser-serve `start` (the hub asks headed): THAT machine\'s probe says no display ⇒ launched headless under ITS planned copy (~/.vibespace/browser-serve/<ns>.json), the fact answered', { r, Ls });
  ok(restarts().length === r0 && sha(sCfg) === sSha, '…its own cdp-url asked under the launch\'s view (no restart); the machine\'s user file untouched', restarts().slice(r0));
  const c1 = await BS.runBrowserServeOp(bs, 'cdp-url', { profileId: pid });
  const rv = restarts().slice(r0).map((x) => JSON.parse(x.to));
  ok(c1.ok && rv.every((v) => v.headed === false && !/ozone/.test(v.args)), 'a later `cdp-url` op names the planned file (its existence IS the view): headless, no pin — never the user file (it carries no idle; the hub never asks it after a start)', restarts().slice(r0));
  await BS.runBrowserServeOp(bs, 'stop', { profileId: pid });
  dsp = D.displayVerdict({ env: { XDG_RUNTIME_DIR: XDG }, entries: [{ path: path.join(XDG, 'wayland-0'), type: 'socket', alive: true }] });
  const b2 = launches().length;
  await listenAt(path.join(XDG, 'wayland-0'));
  r = await BS.runBrowserServeOp(bs, 'start', { profileId: pid, idleMs: 0, headed: true });
  const L2 = launches().slice(b2).filter((l) => l.ns === ns);
  ok(r.ok && !r.display.fallback && L2.length === 1 && L2[0].headed === true && /--ozone-platform=wayland/.test(L2[0].args) && L2[0].config === null && !fs.existsSync(plan), 'its desktop is back ⇒ the next start is headed under the CLI\'s own config search (the planned copy removed)', { r: r.display, L2 });
  await BS.runBrowserServeOp(bs, 'stop', { profileId: pid });
  for (const s0 of servers.splice(0)) { await new Promise((res) => s0.close(() => res())); }
  try { fs.unlinkSync(path.join(XDG, 'wayland-0')); } catch { /* gone */ }
}

// ─ CONTROLS: patched keeper copies (scripts/mutant-copy.mjs), the SAME fake, the SAME routes
{
  const MK = mutantCopies('browser-display-keeper', REPO);
  const src = fs.readFileSync(path.join(REPO, 'src/server/browser-keeper.js'), 'utf8');
  const factLine = '        rec.display = await displays.factFor({ baseFile: env0[VERBS.CONFIG_KEY] || ephemeralConfigFor(env0), prev: prev && prev.display, mode: noDisplayMode() });';
  const envLine = '        const r = await rt.launch(null, { idleMs: launchIdle, headed: null, extraEnv: { ...env0, ...rec.display.env } });';
  const plannedLine = '    const planned = (file) => (rec && rec.display && file ? displays.fileFor(file, rec.display) : file);';
  ok(src.includes(factLine) && src.includes(envLine) && src.includes(plannedLine), 'CONTROL setup: the launch\'s fact line and /resolve\'s planned-file line are found in the keeper');
  // (i) THE PRE-FIX LAUNCH: no fact ⇒ the preference decides ⇒ the incident, reproduced
  const pre = MK.load('src/server/browser-keeper.js', src.replace(factLine, '        rec.display = null;').replace(envLine, '        const r = await rt.launch(null, { idleMs: launchIdle, headed: null, extraEnv: env0 });'), 'no-fact');
  const kPre = mkKeeper(pre);
  Rt.setup({ keeper: kPre, activeSessions: sessions, browserEnv: () => null, adoptRoots: { homeDir: fakeHome, dataDir: DATA }, tasksForSession: () => [] });
  const s1 = mkSession('sess-c1', KEY_C1, 'c', pairsN(KEY_C1), 'N');
  let c = await cli(['snapshot'], cliEnvFor(s1));
  const p1 = ephOf(kPre, KEY_C1);
  const Lc = launches().filter((l) => l.sess === 'vs-' + KEY_C1);
  ok(c.status !== 0 && /launch_failed/.test(c.stderr) && p1 && kPre.browserOf(p1.id).state === 'failed' && Lc.length === 1 && Lc[0].headed === true && /--ozone-platform=wayland/.test(Lc[0].args), 'CONTROL (the pre-fix launch): the headed + Wayland-pinned launch is attempted and the verb answers launch_failed — the incident, reproduced', { stderr: c.stderr, Lc });
  // (ii) /resolve naming the BASE file: the launch is headless, the agent's own verb then differs from it ⇒ a restart
  // into the same failure (why the planned file must reach every call)
  const pre2 = MK.load('src/server/browser-keeper.js', src.replace(plannedLine, '    const planned = (file) => file;'), 'base-to-agent');
  const kPre2 = mkKeeper(pre2);
  Rt.setup({ keeper: kPre2, activeSessions: sessions, browserEnv: () => null, adoptRoots: { homeDir: fakeHome, dataDir: DATA }, tasksForSession: () => [] });
  const s2 = mkSession('sess-c2', KEY_C2, 'e', pairsN(KEY_C2), 'N');
  const r0 = restarts().length;
  c = await cli(['snapshot'], cliEnvFor(s2));
  const rs = restarts().slice(r0);
  ok(c.status !== 0 && rs.length === 1 && rs[0].sess === 'vs-' + KEY_C2 && /Failed to connect to Wayland display/.test(c.stdout + c.stderr), 'CONTROL (the agent handed the base file): its verb RESTARTS the headless daemon into a headed Wayland launch and fails', { rs, status: c.status, stderr: c.stderr, stdout: c.stdout });
  for (const r of copiesCensus(MK.files, MK.dir, REPO, { label: 'keeper controls: ' })) ok(r.pass, r.name, r.detail);
  Rt.setup({ keeper: k, activeSessions: sessions, browserEnv: () => null, adoptRoots: { homeDir: fakeHome, dataDir: DATA }, tasksForSession: () => [] });
}

// ═══ ④ the owner's surfaces: the words + the wiring ═════════════════════
console.log('— ④ the words every surface says it with, and where they are drawn');
{
  const W = await import('../src/lib/browser-display-words.js');
  const noD = D.displayFact({ display: D.displayVerdict({}), wanted: { headed: true, args: OWNER_ARGS } });
  const x11Only = D.displayVerdict({ env: { DISPLAY: ':0' }, entries: [{ path: '/tmp/.X11-unix/X0', type: 'socket', alive: true }] });
  const sub = D.displayFact({ display: x11Only, wanted: { headed: true, args: OWNER_ARGS } });
  const wl = D.displayVerdict({ env: { XDG_RUNTIME_DIR: '/r' }, entries: [{ path: '/r/wayland-0', type: 'socket', alive: true }] });
  const back = D.displayFact({ display: wl, wanted: { headed: true, args: OWNER_ARGS }, prev: noD });
  ok(W.displayFactText(noD) === 'This machine has no desktop session — the browser runs headless (the live view can still take over)', 'the headless sentence (the row, the dialog, the live view)', W.displayFactText(noD));
  const noDX = { ...D.displayVerdict({}), xvfb: true };
  const hid = D.displayFact({ display: noDX, wanted: { headed: true, args: OWNER_ARGS } });
  ok(W.displayFactText(hid) === 'This machine has no desktop session — the browser runs in a hidden window (the live view can still take over)', 'the hidden-window sentence names the rung', W.displayFactText(hid));
  ok(/runs in a hidden window .* · Xvfb: installed$/.test(W.machineDisplayText({ display: noDX, mode: 'auto' })) && /runs headless .* · Xvfb: installed$/.test(W.machineDisplayText({ display: noDX, mode: 'headless' })) && /runs headless .* · Xvfb: not installed$/.test(W.machineDisplayText({ display: { ...D.displayVerdict({}), xvfb: false }, mode: 'auto' })), 'Settings\' line: the rung the setting and Xvfb pick + "Xvfb: installed / not installed"');
  ok(W.displayFactText(sub) === 'The browser settings ask for Wayland, which this machine does not have right now — it runs on X11 instead', 'the substituted sentence names both displays', W.displayFactText(sub));
  ok(W.displayFactText(back) === 'The desktop session is back — the browser runs in a window again' && W.displayFactText(D.displayFact({ display: wl, wanted: { headed: true } })) === '' && W.displayFactText(null) === '', 'the window-is-back sentence; a plain launch / no fact says nothing');
  ok(W.displayFactOf({ browsers: { 'bp-1': { display: noD } } }, 'bp-1') === noD && W.displayFactOf({ browsers: {} }, 'bp-1') === null && W.displayFactOf(null, 'bp-1') === null, 'displayFactOf reads the digest\'s record');
  ok(/Wayland desktop session \(wayland-0\)/.test(W.machineDisplayText({ display: wl })) && /X11 display \(:0\)/.test(W.machineDisplayText({ display: x11Only })) && /no desktop session now .* runs headless/.test(W.machineDisplayText({ display: D.displayVerdict({}) })) && /Could not check this machine's display: boom/.test(W.machineDisplayText({ error: 'boom' })), 'Settings\' line: Wayland / X11 / none / an error said by name');
  const wsrc = fs.readFileSync(path.join(REPO, 'src/lib/browser-display-words.js'), 'utf8');
  const keys = [...wsrc.matchAll(/\bt\((['"])((?:(?!\1).)+)\1/g)].map((m) => m[2].replace(/\\'/g, "'"));
  const zh = fs.readFileSync(path.join(REPO, 'src/lib/i18n-zh.js'), 'utf8'), ja = fs.readFileSync(path.join(REPO, 'src/lib/i18n-ja.js'), 'utf8');
  const missing = keys.filter((k) => !zh.includes(JSON.stringify(k) + ':') || !ja.includes(JSON.stringify(k) + ':'));
  ok(keys.length >= 7 && !missing.length, `every sentence has a zh AND a ja entry (${keys.length} keys)`, missing);
  ok(zh.includes('"This machine has no desktop session — the browser runs headless (the live view can still take over)": "这台机器没有桌面会话 — 浏览器以 headless 运行（实时视图可正常接管）"'), 'zh says the brief\'s words exactly');
  const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
  const tv = read('src/lib/browser-trace-view.js'), sv = read('src/server/browser-trace.js'), sw = read('src/lib/browser-switcher.js'), lv = read('src/lib/browser-live-window.js'), ss = read('src/lib/settings-schema.js'), su = read('src/lib/settings-ui.js'), css = read('public/style.css');
  ok(/r\.display = keeper && typeof keeper\.browserOf === 'function'/.test(sv) && /displayLine\(state, r\.display\);/.test(tv) && /displayLine\(st, e\.display\);/.test(tv), 'WIRING: the Agent browser panel\'s profile rows (the housekeeping row carries the record\'s fact) and ephemeral rows draw it');
  ok(/key: 'display', kind: 'display', text: dt/.test(sw) && /displayFactText\(displayFactOf\(app\._browserProfiles, profileId\)\)/.test(sw), 'WIRING: the switch dialog says it under the now line');
  // the .197 integration: the merged line (browse-yourself's address / share / end lines, browser-stuck's dialog bar) keeps the note right after the blocked bar
  ok(/root\.append\(strip, bar, addrRow, shareLine, endLine, blockedBar, displayNote, confirms, dialogBar, body\)/.test(lv) && /const renderBackend = \(\) => \{\n    renderDisplay\(\);/.test(lv) && /st\.rows = computeRows\(\);\n    renderDisplay\(\);/.test(lv), 'WIRING: the live view\'s note under the bar, re-drawn with the digest and the strip');
  ok(/'browser\.noDisplayMode': \{\s*type: 'enum', default: 'auto', options: \[\s*\{ value: 'auto'[\s\S]{0,120}\{ value: 'headless'/.test(ss) && /noDisplayMode: noDisplayMode\(\)/.test(fs.readFileSync(path.join(REPO, 'src/server/browser-keeper.js'), 'utf8')), 'WIRING: the setting browser.noDisplayMode (auto default | headless) — the keeper reads it at every launch and hands it to a paired machine');
  ok(/'browser\.headed': \{[\s\S]{0,1600}fact: 'browser-display',/.test(ss) && /if \(schema\.fact === 'browser-display'\) this\._renderDisplayFact\(info\);/.test(su) && /fetchJson\('\/api\/browser\/display'\)/.test(su), 'WIRING: Settings → Agent browser: the read-only line under "Show the agent browser window"');
  ok(['.settings-row-fact', '.browser-live-display-note', '.brsw-display', '.bprof-display'].every((c) => css.includes(c + ' {')), 'each line has its own rule (theme tokens only)');
  const cliSrc = read('data/bin/vibespace-browser');
  ok((cliSrc.match(/if \(r\.displayNote\) console\.error\(`note: \$\{r\.displayNote\}`\)/g) || []).length === 2, 'WIRING: the CLI prints the note on a page verb and on `use`');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

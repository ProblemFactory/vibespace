#!/usr/bin/env node
// GHOST-HOST SELF-HEAL (2.334.1, real fleet report): a persisted Recent/History
// host selection whose host record was REMOVED left the switcher <select>
// rendering BLANK (a value with no matching option) and the whole zone bricked
// on "发现失败: host not found" + 无法连接 chips forever — with no visible
// affordance hinting that flipping the (blank) dropdown back to Local was the
// fix. This drives the REAL sidebar render in a worktree server + headless
// chrome: plant a ghost id in localStorage, render, assert the zone healed to
// Local and the persisted keys cleared. Negative control: a transient roster
// failure (hosts data absent) must NOT wipe the selection.
// Run: node scripts/test-ghost-host-heal.mjs
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePorts, scratch, ONBOARDED_SOURCE, vncEnv, CHROME_STORE, CHROME_QUIET } from './scratch.mjs';
import { mintRoot, startHub, strippedEnv } from './hub-boot.mjs';
import { waitPageTarget } from './cdp-page-target.mjs';
const VNC_ENV = await vncEnv(); // per-run singleton-Desktop display + port for every server this suite boots (never the machine-global :7/5901 — test-architecture §57)
const require = createRequire(import.meta.url);

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome/chromium'); process.exit(0); }

const [PORT, CDP_PORT] = await freePorts(2); // per-process (scripts/scratch.mjs) — fixed ports collided across concurrent gates
const root = mintRoot('ghost-host-smoke'), wt = path.join(root, 't');
const chromeHome = path.join(root, 'chrome-home'); fs.mkdirSync(chromeHome, { recursive: true });   // rule nine (hub-boot.mjs): the suite's own browser carries a HOME in the root, so the helper ends it before the root goes
let failed = 0;
const check = (n, c, e) => { if (typeof c !== 'boolean') throw new TypeError(`check: its condition is a ${typeof c}, not a boolean — the arguments are swapped, or a value stands where a comparison belongs`); if (c) console.log(`  ✓ ${n}`); else { failed++; console.error(`  ✗ ${n}${e ? '\n    ' + e : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'server.js']) {
  execSync(`rm -rf ${wt}/${f} && cp -r ${repo}/${f} ${wt}/${f}`);
}
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
execSync('npm run build:bundles', { cwd: wt, stdio: 'ignore' });

// An EMPTY home (no ~/.claude sessions): the Actions runner's condition. On a
// developer box the real ~/.claude has sessions, the workbench renders its
// zones and the heal at the RECENT zone ran — the runner's empty machine took
// the early "no sessions" return first and the ghost keys were never healed
// (red on every mirror run since 2.369.75; 2.369.125 r8 boots the suite the
// way the runner sees it and heals the keys ahead of every early return).
const fakeHome = path.join(root, 'home'); for (const d of ['.claude/projects', '.claude/sessions', '.config', '.vibespace']) fs.mkdirSync(path.join(fakeHome, d), { recursive: true });
const hub = startHub({ root, tree: wt, port: PORT, env: { ...strippedEnv(), ...VNC_ENV, HOME: fakeHome, VIBESPACE_SKIP_AGENT_HOOKS: '1' } });
const chrome = spawn(CHROME, [...CHROME_QUIET, ...CHROME_STORE, '--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu',
  '--disable-background-timer-throttling', `--user-data-dir=${scratch('ghost-host-chrome')}`, 'about:blank'], { stdio: 'ignore', env: { ...process.env, HOME: chromeHome } });

const cleanup = () => {
  try { chrome.kill('SIGKILL'); } catch {}
  try { fs.rmSync(scratch('ghost-host-chrome'), { recursive: true, force: true }); } catch {}
};
process.on('exit', cleanup);

await hub.ready();

const WebSocket = require('ws');
let target = null;
target = await waitPageTarget(CDP_PORT, { polls: 40, everyMs: 250, child: chrome }); // B-fcae: the one waiter (a miss always waits)
const ws = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
await new Promise((r) => ws.on('open', r));
let seq = 0; const pend = new Map();
ws.on('message', (d) => {
  const m = JSON.parse(d);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
});
const cdp = (method, params = {}) => new Promise((res) => { const id = ++seq; pend.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
const evaljs = async (expr) => {
  const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 400));
  return r.result?.result?.value;
};
await cdp('Runtime.enable');
await cdp('Page.enable');

// plant the ghost BEFORE the app boots (the incident shape: stale localStorage)
await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE }); await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
await sleep(800);
await evaljs(`(() => { localStorage.setItem('wbRecentHost', 'ghost-host-id'); localStorage.setItem('wbHistoryHost', 'ghost-host-id'); return 1; })()`);
await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE }); await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
for (let i = 0; i < 60; i++) { if (await evaljs('!!(window.app && window.app.sidebar && window.app.sidebar.listEl)').catch(() => false)) break; await sleep(400); }
await evaljs(`(() => { window.app.sidebar.toggle(true); return 1; })()`);
// roster fetch + heal render pass. A FIXED sleep here was a claim about the
// machine's load: under the heavy tier's parallel lanes (2026-09-15, four
// headless chromes at once) 1.5 s was not enough for the boot to reach the
// workbench render, and the suite went red on a heal that had simply not run
// yet. Poll for the healed state instead, bounded — the assertions below still
// decide, this loop only decides WHEN to look.
for (let i = 0; i < 100; i++) {
  const healed = await evaljs(`(() => { const sb = window.app.sidebar; sb._render(); return Array.isArray(sb._hostsData?.hosts) && sb._wbRecentHost === '' && sb._wbHistoryHost === ''; })()`).catch(() => false);
  if (healed) break;
  await sleep(300);
}

const st = await evaljs(`(() => {
  const sb = window.app.sidebar;
  sb._render();
  const sel = document.querySelector('.wb-recent-host');
  return {
    recentMem: sb._wbRecentHost, histMem: sb._wbHistoryHost,
    recentLs: localStorage.getItem('wbRecentHost'), histLs: localStorage.getItem('wbHistoryHost'),
    rosterLoaded: Array.isArray(sb._hostsData?.hosts),
    selValue: sel ? sel.value : null,
    bodyHasGhostError: document.body.textContent.includes('host not found'),
  };
})()`);
check('roster loaded (precondition)', verdictOf(st.rosterLoaded), JSON.stringify(st));
check('ghost Recent selection healed to Local (memory)', st.recentMem === '', JSON.stringify(st));
check('ghost History selection healed to Local (memory)', st.histMem === '', JSON.stringify(st));
check('localStorage keys cleared', st.recentLs === '' && st.histLs === '', JSON.stringify(st));
check('no "host not found" error rendered after heal', !st.bodyHasGhostError, '');
check('switcher (if rendered) shows Local, never blank', st.selValue === null || st.selValue === '', JSON.stringify(st.selValue));

// NEGATIVE CONTROL: with the roster NOT loaded, the heal must keep the pick
const neg = await evaljs(`(() => {
  const sb = window.app.sidebar;
  sb._hostsData = null; // simulate a transient /api/hosts failure window
  sb._wbRecentHost = 'still-mine';
  const v = sb._wbValidHost('still-mine', 'wbRecentHost', '_wbRecentHost');
  return { v, mem: sb._wbRecentHost };
})()`);
check('NEGATIVE CONTROL: unloaded roster keeps the selection', neg.v === 'still-mine' && neg.mem === 'still-mine', JSON.stringify(neg));

console.log(failed ? `\n${failed} FAILED` : '\nALL PASS (7)');
process.exit(failed ? 1 : 0); import { verdictOf } from './lib/check.mjs';

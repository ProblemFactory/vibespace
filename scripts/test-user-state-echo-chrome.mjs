#!/usr/bin/env node
// EVERY ACT IS ON THE WIRE AT THE ACT, IN A REAL BROWSER (lane sidebar-echo-order rounds 4–5 — the owner's incident
// inc-mwbn2xp8-ks0b): a page hands each user-state act to the network AT THE ACT, in a request that carries every batch of the
// page not yet confirmed, oldest first (src/user-state-ops.js createSync), so a page closed right after its acts loses none of
// them — as on master. This suite drives the REAL page in headless Chrome against a throwaway server: five acts (three
// archives, a star, a rename) and the tab CLOSED at once — the hub receives every one, each once.
// Throwaway server in a git worktree (own data dir + EMPTY fake HOME) + headless chrome over raw CDP.
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePorts, scratch, ONBOARDED_SOURCE, vncEnv, endRootedProcesses } from './scratch.mjs';
const VNC_ENV = await vncEnv(); // per-run singleton-Desktop display + port for every server this suite boots (test-architecture §57)
const require = createRequire(import.meta.url);

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const UO = require(path.join(repo, 'src/user-state-ops.js'));
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome/chromium'); process.exit(0); }

const [PORT, CDP_PORT] = await freePorts(2);
const wt = scratch('ueo-chrome');
const fakeHome = scratch('ueo-chrome-home');
let failed = 0;
const check = (n, c, e) => { if (c) console.log(`  ✓ ${n}`); else { failed++; console.error(`  ✗ ${n}${e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 800) : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'server.js']) execSync(`rm -rf ${wt}/${f} && cp -r ${repo}/${f} ${wt}/${f}`);
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
execSync('npm run build', { cwd: wt, stdio: 'ignore' });
fs.rmSync(fakeHome, { recursive: true, force: true });
fs.mkdirSync(path.join(fakeHome, '.claude'), { recursive: true });
fs.mkdirSync(path.join(wt, 'data'), { recursive: true });

const srv = spawn(process.execPath, ['server.js'], { cwd: wt, env: { ...process.env, ...VNC_ENV, PORT: String(PORT), HOME: fakeHome }, stdio: 'ignore' });
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--disable-background-timer-throttling', `--user-data-dir=${wt}-chrome`, 'about:blank'], { stdio: 'ignore' });
const cleanup = () => {
  try { chrome.kill('SIGKILL'); } catch {}
  try { srv.kill('SIGKILL'); } catch {}
  // what the server started (its sessions run detached under dtach — killing the server ends none of them): every process rooted
  // in this suite's scratch dirs (scratch.mjs; test-architecture §57b)
  try { endRootedProcesses(wt); } catch { }
  try { endRootedProcesses(fakeHome); } catch { }
  try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
  try { fs.rmSync(`${wt}-chrome`, { recursive: true, force: true }); } catch {}
  try { fs.rmSync(fakeHome, { recursive: true, force: true }); } catch {}
};
process.on('exit', cleanup);
const BASE = `http://127.0.0.1:${PORT}`;
for (let i = 0; i < 60; i++) { try { await fetch(`${BASE}/api/home`); break; } catch { await sleep(250); } }
const userState = async () => (await (await fetch(`${BASE}/api/user-state`)).json());

// ── raw CDP, one socket per page target ─────────────────────────────────────
const WebSocket = require('ws');
async function attach(target) {
  const ws = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
  await new Promise((r) => ws.on('open', r));
  let seq = 0; const pend = new Map(); const handlers = [];
  ws.on('message', (m) => { const d = JSON.parse(m); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } else if (d.method) for (const h of handlers) h(d); });
  const cdp = (method, params = {}) => new Promise((res) => { const id = ++seq; pend.set(id, res); try { ws.send(JSON.stringify({ id, method, params })); } catch { res({}); } });
  const evl = async (expr) => { const r = await cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.text + ' ' + (r.result.exceptionDetails.exception?.description || '')); return r.result?.result?.value; };
  return { ws, cdp, evl, on: (h) => handlers.push(h) };
}
async function newPage() {
  const t = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  const p = await attach(t);
  p.id = t.id;
  await p.cdp('Page.enable');
  await p.cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
  await p.cdp('Page.navigate', { url: `${BASE}/` });
  for (let i = 0; i < 60; i++) { if (await p.evl(`!!(window.app && app.sidebar && app.sidebar._userStateFetched && app.sidebar.__userSync && app.sidebar.__userSync.hasBase())`).catch(() => false)) break; await sleep(250); }
  return p;
}
try {
  const p = await newPage();
  const before = await userState();
  const keys = [1, 2, 3, 4, 5].map((i) => `claude:e000000${i}-0000-4000-8000-00000000000${i}`);
  // five acts in one go, then the tab closed AT ONCE — no wait for any answer
  await p.evl(`(() => { const sb = app.sidebar; sb.toggleArchive(${JSON.stringify(keys[0])}); sb.toggleArchive(${JSON.stringify(keys[1])}); sb.toggleArchive(${JSON.stringify(keys[2])}); sb.toggleStar(${JSON.stringify(keys[3])}); sb.setCustomName(${JSON.stringify(keys[4])}, 'closed at once'); return sb.__userSync.inFlight(); })()`).then((n) => console.log(`  · requests in flight as the tab closes: ${n}`));
  await fetch(`http://127.0.0.1:${CDP_PORT}/json/close/${p.id}`);
  let after = null;
  for (let i = 0; i < 40; i++) { after = await userState(); if (keys.slice(0, 3).every((k) => after.archivedSessions.includes(k)) && after.starredSessions.includes(keys[3]) && after.customNames[keys[4]] === 'closed at once') break; await sleep(250); }
  await sleep(1000);
  after = await userState();
  check('acts made and the tab closed AT ONCE: the hub received every one (three archives, a star, a rename)', keys.slice(0, 3).every((k) => after.archivedSessions.includes(k)) && after.starredSessions.includes(keys[3]) && after.customNames[keys[4]] === 'closed at once', { archived: after.archivedSessions, starred: after.starredSessions, names: after.customNames });
  check(`…each once: five writes (stateRev ${UO.revOf(before)} → ${UO.revOf(after)})`, UO.revOf(after) - UO.revOf(before) === 5, { revs: [UO.revOf(before), UO.revOf(after)] });
  try { p.ws.close(); } catch {}
} catch (e) {
  failed++; console.error('  ✗ threw:', e.stack || e.message);
}
console.log(failed ? `\n${failed} FAILED` : 'ALL PASS');
process.exit(failed ? 1 : 0);

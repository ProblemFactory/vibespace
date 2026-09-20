#!/usr/bin/env node
// test-jobs-panel — the Background Work TRIAGE panel end to end (docs/design-
// background-work.md §13, owner-approved 2026-09-14): a worktree server seeded
// with the NEUTRAL fixture (scripts/jobs-triage-fixture.mjs — 200 done, 36
// failed with mixed acknowledgement, a running + an awaiting-user row, three
// pre-archived records, six held notifications) opened in headless chrome at
// 1200×800 (the rail panel) AND 375×667 (the window fallback): the rail badge
// counts ONLY awaiting-user + unacknowledged failures, the Tasks section is a
// handful of fold groups instead of hundreds of rows, a group holding an
// unacknowledged failure is expanded by default while a done-only group is
// collapsed, collapsing a group persists across a reload (user state), a failed
// row shows its last log line, the summary names the held notifications, and
// the "Archived · N" row fetches the archive ONLY when clicked.
// SKIPs without chrome. Worktree-isolated (own data/, a scratch HOME,
// VIBESPACE_SKIP_AGENT_HOOKS=1), free ports, per-pid names.
// Run: node scripts/test-jobs-panel.mjs
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePorts, scratch, scratchHome } from './scratch.mjs';
import { makeFixture, writeAliveStamp } from './jobs-triage-fixture.mjs';
const require = createRequire(import.meta.url);

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome/chromium'); process.exit(0); }
const L = await import(path.join(repo, 'src/lib/jobs-layout.js'));

const [PORT, CDP_PORT] = await freePorts(2);
const wt = scratch('jobs-panel-smoke');
const home = scratchHome('jobs-panel-home', fs);
let failed = 0;
const check = (n, c, e) => { if (c) console.log(`  ✓ ${n}`); else { failed++; console.error(`  ✗ ${n}${e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)) : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000, step = 200) => { const t = Date.now() + ms; while (Date.now() < t) { let v = null; try { v = await fn(); } catch { } if (v) return v; await sleep(step); } return null; };

try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch { }
execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'server.js', 'scripts']) { execSync(`rm -rf ${wt}/${f} && cp -r ${repo}/${f} ${wt}/${f}`); }
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
execSync('npm run build', { cwd: wt, stdio: 'ignore' });

// ── the fixture, seeded BEFORE the first boot ──
const T0 = Date.now();
const fx = makeFixture(T0);
const strip = (o) => JSON.parse(JSON.stringify(o, (k, v) => (k.startsWith('_') ? undefined : v)));
const dataDir = path.join(wt, 'data');
fs.mkdirSync(dataDir, { recursive: true });
fs.writeFileSync(path.join(dataDir, 'jobs.json'), JSON.stringify(fx.jobs.map(strip)));
fs.writeFileSync(path.join(dataDir, 'job-notifications.json'), JSON.stringify(fx.notifs));
// three pre-archived done records (the sweep's own shape) so the Archived row exists at boot
const archived = fx.jobs.filter((j) => j.kind === 'task' && j.state === 'done' && !j.cronParent).slice(0, 3).map((j) => ({ ...strip(j), id: j.id + 'a', name: j.name + '-old', archivedAt: T0 - 3600e3, archivedWhy: 'done' }));
fs.writeFileSync(path.join(dataDir, 'jobs-archive.json'), JSON.stringify(archived));
// the running / awaiting rows must be ADOPTED by the server (a live pid stamp)
const sleeper = spawn('sleep', ['3600'], { stdio: 'ignore' });
for (const id of [fx.ids.running, fx.ids.awaiting]) writeAliveStamp(fs, path, dataDir, fx.jobs.find((j) => j.id === id), sleeper.pid);
const unacked = fx.failedRows.filter((r) => ['stash', 'stranger', 'self'].includes(r.kind)).length;
const heldTotal = Object.values(fx.notifs).flat().length;
const expectBadge = `${unacked + 1}!`; // + the one awaiting-user row

const srvEnv = { ...process.env, PORT: String(PORT), HOME: home, VIBESPACE_SKIP_AGENT_HOOKS: '1' };
let srv = null;
const bootServer = () => { srv = spawn(process.execPath, ['server.js'], { cwd: wt, env: srvEnv, stdio: 'ignore' }); return srv; };
bootServer();
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--disable-background-timer-throttling', '--window-size=1400,900', `--user-data-dir=${scratch('jobs-panel-chrome')}`, 'about:blank'], { stdio: 'ignore' });
const cleanup = () => {
  try { chrome.kill('SIGKILL'); } catch { }
  try { srv?.kill('SIGKILL'); } catch { }
  try { sleeper.kill('SIGKILL'); } catch { }
  try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch { }
  try { fs.rmSync(scratch('jobs-panel-chrome'), { recursive: true, force: true }); } catch { }
  try { fs.rmSync(home, { recursive: true, force: true }); } catch { }
};
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(1); });

const waitServer = async () => { for (let i = 0; i < 80; i++) { try { await fetch(`http://127.0.0.1:${PORT}/api/home`); return true; } catch { await sleep(250); } } return false; };
check('worktree server boots over the seeded fixture', await waitServer());
// the engine boots ASYNCHRONOUSLY after /api/home answers (adopt-first boot + the single-engine lock):
// GET /api/jobs is 503 {error:'jobs engine starting'} until then — wait for the engine, not the http server
const api = await (async () => { let last = null; for (let i = 0; i < 120; i++) { const r = await fetch(`http://127.0.0.1:${PORT}/api/jobs`); last = await r.json(); if (r.status === 200 && last.jobs) return last; await sleep(250); } return last; })();
check('the jobs engine reports ready (GET /api/jobs answers 200 with jobs)', !!(api && api.jobs), api);
check(`the server serves every fixture record live (${api.jobs && api.jobs.length} = ${fx.jobs.length}; the boot sweep archived nothing)`, api.jobs && api.jobs.length === fx.jobs.length, api.jobs && api.jobs.length);
check(`…with ${archived.length} archived + ${heldTotal} held in the same answer`, api.archivedCount === archived.length && api.held && api.held.total === heldTotal, { archivedCount: api.archivedCount, held: api.held && api.held.total });
const layout = L.foldTasks(api.jobs.filter((j) => j.kind === 'task'), {});
const counts = L.badgeCounts(api.jobs);
check(`the PURE counter over the served list reads ${expectBadge} (attention = ${unacked} unacked + 1 awaiting)`, L.badgeText(counts).text === expectBadge, L.badgeText(counts));

const WebSocket = require('ws');
const cdpTargets = async () => (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json());
const target = await until(async () => (await cdpTargets()).find((t) => t.type === 'page'), 20000, 250);
async function page(t) {
  const ws = new WebSocket(t.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
  await new Promise((r) => ws.on('open', r));
  let seq = 0; const pend = new Map();
  ws.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
  const cdp = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, (m) => (m.error ? rej(new Error(m.error.message)) : res(m.result))); ws.send(JSON.stringify({ id, method, params })); });
  const evalJs = async (expr) => { const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error('page threw: ' + (r.exceptionDetails.exception?.description || JSON.stringify(r.exceptionDetails))); return r.result.value; };
  await cdp('Page.enable');
  return { ws, cdp, evalJs, close: () => { try { ws.close(); } catch { } } };
}
const p = await page(target);
const openPage = async () => { await p.cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/` }); await sleep(1500); await p.evalJs('new Promise((res, rej) => { const t0 = Date.now(); (function w() { if (window.app) return res(app.ready); if (Date.now() - t0 > 20000) return rej(new Error("no app after 20s")); setTimeout(w, 200); })(); })' /* in-page poll (2.369.118): the heavy tier went red with "no app" in two chrome lanes at once — one probe 1.5 s after navigate is a bet on load speed */); };
// count the archive fetches from inside the page (the row must fetch ONLY on click)
const INSTRUMENT = `(() => { if (!window.__vsFetches) { window.__vsFetches = []; const f = window.fetch; window.fetch = function (u, ...a) { try { window.__vsFetches.push(String(u)); } catch {} return f.call(this, u, ...a); }; } return true; })()`;
const archiveFetches = () => p.evalJs(`(window.__vsFetches || []).filter((u) => u.includes('archived=1')).length`);
// the DOM facts of the rendered panel (rail or window), read in one shot
// the panel root mounts BEFORE the client's own /api/jobs fetch fills it — "rendered" = fold groups on screen
const panelReady = (sel) => until(async () => { const r = await p.evalJs(PANEL(sel)); return r && r.groups && r.groups.length ? r : null; }, 15000, 250);
const PANEL = (rootSel) => `(() => {
  const root = document.querySelector(${JSON.stringify(rootSel)}); if (!root) return null;
  const groups = [...root.querySelectorAll('.jobs-group:not(.jobs-archived-toggle)')].map((b) => {
    let cards = 0; let n = b.nextElementSibling; while (n && !n.classList.contains('jobs-group') && !n.classList.contains('jobs-sec-head') && !n.classList.contains('jobs-sess-head')) { if (n.classList.contains('jobs-card')) cards++; n = n.nextElementSibling; }
    return { key: b.dataset.group, expanded: b.getAttribute('aria-expanded'), attn: b.classList.contains('jobs-group-attn'), cards, text: b.textContent, tag: b.tagName };
  });
  const arc = root.querySelector('.jobs-archived-toggle');
  return { groups, cards: root.querySelectorAll('.jobs-card').length, lastLines: [...root.querySelectorAll('.jobs-lastline')].map((e) => e.textContent), summary: (root.closest('.rail-panel-jobs, .jobs-win') || root).querySelector('.jobs-summary')?.textContent || '',
    archived: arc ? { text: arc.textContent, expanded: arc.getAttribute('aria-expanded'), rows: root.querySelectorAll('.jobs-archived-list .jobs-card').length } : null, sessHeads: root.querySelectorAll('.jobs-sess-head').length };
})()`;

try {
  // ── 1200×800: the rail panel ──
  await p.cdp('Emulation.setDeviceMetricsOverride', { width: 1200, height: 800, deviceScaleFactor: 1, mobile: false });
  await openPage();
  await p.evalJs(INSTRUMENT);
  const badge = await until(() => p.evalJs(`(() => { const b = document.querySelector('.rail-item[data-rail="jobs"]'); const t = b && b.querySelector('.rail-badge'); return t ? { text: t.textContent, danger: b.classList.contains('rail-danger'), title: b.title } : null; })()`), 15000, 250);
  check(`the rail badge reads ${expectBadge} — awaiting-user + UNACKNOWLEDGED failures only, never the 36 the incident showed`, badge && badge.text === expectBadge && badge.danger === true, badge);
  check('…and its tooltip names the held notifications and why they are held', badge && /notifications held/.test(badge.title) && /hourly ceiling \(12\)/.test(badge.title), badge && badge.title);
  await p.evalJs('app.openJobs(); true');
  const rail = await panelReady('.rail-panel-jobs .jobs-rail-list');
  check('the Background Work rail panel renders fold groups', !!rail && rail.groups.length > 0, rail && rail.groups.length);
  const oneShots = api.jobs.filter((j) => j.kind === 'task').length;
  check(`EXIT: the Tasks section shows ${rail && rail.groups.length} group rows for ${oneShots} one-shots (= foldTasks over the served list: ${layout.groups.length})`, rail && rail.groups.length === layout.groups.length && rail.groups.length < oneShots / 5, { groups: rail && rail.groups.length, oneShots });
  check('every group row is a BUTTON with aria-expanded (keyboard-reachable)', rail && rail.groups.every((g) => g.tag === 'BUTTON' && (g.expanded === 'true' || g.expanded === 'false')));
  const attn = rail && rail.groups.filter((g) => g.attn);
  check('a group holding an UNACKNOWLEDGED failure is expanded by default, with its cards under it', attn && attn.length > 0 && attn.every((g) => g.expanded === 'true' && g.cards > 0), attn && attn.map((g) => ({ key: g.key, expanded: g.expanded, cards: g.cards })));
  const doneOnly = rail && rail.groups.filter((g) => !g.attn && !/running|awaiting you/.test(g.text));
  check('a done-only group is COLLAPSED by default (no cards under it)', doneOnly && doneOnly.length > 0 && doneOnly.every((g) => g.expanded === 'false' && g.cards === 0), doneOnly && doneOnly.map((g) => ({ key: g.key, expanded: g.expanded, cards: g.cards })));
  check('the failed rows show their LAST LOG LINE', rail && rail.lastLines.length > 0 && rail.lastLines.every((l) => /failed to render/.test(l)), rail && rail.lastLines.slice(0, 3));
  check(`the summary names the failed/seen split and the ${heldTotal} held notifications`, rail && new RegExp(`${counts.failed} failed · ${counts.ackedFailed} seen`).test(rail.summary) && new RegExp(`${heldTotal} held`).test(rail.summary), rail && rail.summary);
  check(`the "Archived · ${archived.length}" row is there, collapsed, and NOTHING has fetched the archive yet`, rail && rail.archived && rail.archived.text.includes(`· ${archived.length}`) && rail.archived.expanded === 'false' && (await archiveFetches()) === 0, rail && rail.archived);
  // click the Archived row ⇒ exactly one fetch, rows appear
  await p.evalJs(`document.querySelector('.rail-panel-jobs .jobs-archived-toggle').click(); true`);
  const arcRows = await until(() => p.evalJs(`document.querySelectorAll('.rail-panel-jobs .jobs-archived-list .jobs-card').length || null`), 10000, 200);
  check(`clicking it fetches the archive ONCE and renders its ${archived.length} rows`, arcRows === archived.length && (await archiveFetches()) === 1, { rows: arcRows, fetches: await archiveFetches() });
  check('an archived row carries only ✕ (no Start/Stop) and says "archived"', await p.evalJs(`(() => { const c = document.querySelector('.rail-panel-jobs .jobs-archived-list .jobs-card'); const btns = [...c.querySelectorAll('button.jobs-btn')].map((b) => b.textContent); return btns.length === 1 && btns[0] === '✕' && /archived/.test(c.querySelector('.jobs-state').textContent); })()`));
  // collapse a default-expanded group ⇒ persisted ⇒ survives a reload
  const victim = attn[0].key;
  await p.evalJs(`document.querySelector('.rail-panel-jobs .jobs-group[data-group=' + ${JSON.stringify(JSON.stringify(victim))} + ']').click(); true`);
  const collapsedNow = await until(() => p.evalJs(`document.querySelector('.rail-panel-jobs .jobs-group[data-group=' + ${JSON.stringify(JSON.stringify(victim))} + ']')?.getAttribute('aria-expanded') === 'false' ? 'yes' : null`), 8000, 200);
  check('collapsing the expanded group folds it at once', collapsedNow === 'yes');
  const persisted = await until(async () => { const st = await (await fetch(`http://127.0.0.1:${PORT}/api/user-state`)).json(); return st.jobsPanelFolds && st.jobsPanelFolds[victim] === false ? st.jobsPanelFolds : null; }, 8000, 200);
  check('…and the fold is persisted in user state (jobsPanelFolds, merge-only)', !!persisted, persisted);
  await openPage();
  await p.evalJs(INSTRUMENT);
  await p.evalJs('app.openJobs(); true');
  const rail2 = await panelReady('.rail-panel-jobs .jobs-rail-list');
  const again = rail2 && rail2.groups.find((g) => g.key === victim);
  check('after a RELOAD the collapsed group stays collapsed (the persisted fold outranks the default)', again && again.expanded === 'false' && again.cards === 0, again);
  check('…while its siblings keep their defaults', rail2 && rail2.groups.filter((g) => g.attn && g.key !== victim).every((g) => g.expanded === 'true'));
  check('a reload fetches the archive ZERO times until the row is clicked again', (await archiveFetches()) === 0);

  // ── 375×667: the window fallback (no rail on mobile) ──
  await p.cdp('Emulation.setDeviceMetricsOverride', { width: 375, height: 667, deviceScaleFactor: 2, mobile: true });
  await openPage();
  await p.evalJs(INSTRUMENT);
  await p.evalJs('app.openJobs({ forceWindow: true }); true');
  const win = await panelReady('.jobs-win .jobs-body');
  check('375×667: the Background Work window renders the same fold groups', !!win && win.groups.length === layout.groups.length, win && win.groups.length);
  check('375×667: the persisted fold still holds; the attention groups are expanded', win && win.groups.find((g) => g.key === victim)?.expanded === 'false' && win.groups.filter((g) => g.attn && g.key !== victim).every((g) => g.expanded === 'true'));
  check('375×667: the failed rows show their last line; the archive is unfetched until clicked', win && win.lastLines.some((l) => /failed to render/.test(l)) && win.archived && win.archived.expanded === 'false' && (await archiveFetches()) === 0, win && { lastLines: win.lastLines.length, archived: win.archived });
  check('375×667: no group row overflows the viewport width', await p.evalJs(`[...document.querySelectorAll('.jobs-win .jobs-group')].every((b) => b.getBoundingClientRect().right <= innerWidth + 1)`));
} catch (e) {
  failed++; console.error('  ✗ threw:', e.stack || e.message);
} finally {
  p.close();
}
console.log(failed ? `\n${failed} FAILED` : '\njobs panel test passed');
process.exit(failed ? 1 : 0);

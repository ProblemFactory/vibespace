#!/usr/bin/env node
// THE PER-DONUT RESET COUNTDOWN ON THE ACCOUNT ROSTER — headless chrome against
// a worktree server (2026-09-14, owner: "想办法把每个进度条的刷新时间都展示出来,
// 同时不能让画面太挤: 在每个 pie 下面加一个 15h / 3d / 65m"). The roster used to
// print ONE countdown per row (the tightest bucket's, in the age cell); now
// every donut is a column with its own compact token under it, coloured by
// that bucket's pressure from 80 % up, and the row-level line is gone.
//
// The fixture is DERIVED FROM THE CLOCK at seed time (now + 65 min / 15 h /
// 3.2 d) — never a calendar date — and carries the shapes the rule must
// refuse: an EMPTY window (`state:'empty'`, its reset slides — B-8b12; the
// boot seed hands a legacy cache file to the client verbatim, so the fixture
// states the field the write path stamps), a PASSED reset and a MISSING one.
// Verdicts are RENDERED geometry (computed style, getBoundingClientRect) at
// the owner's 1200×800 and at 375×667 in the mobile modal; the 2.245.2
// alignment invariant (every cluster's right edge equal ±1px) and the ≤340px
// pill swap are re-asserted so the new column cannot break them.
// 2026-09-15 (owner: 写成 2d21h38m 的形式, 一眼扫过去就能知道哪个账号马上要可用了, 把即将
// 刷新的两个账号 highlight 一下): §1b adds two members — D, the SOONEST reset
// (5h in 40 min) and E, BLOCKED (7d spent at 100 %, resets in 20 h; its 5h
// resets in 30 min and must NOT be the answer) — and asserts the one
// full-precision label per row, that the two soonest rows (D, A) carry
// .usage-acct-soon, the column alignment of the labels, and the 30 s tick
// driven with an injected clock (a passed countdown goes blank and drops
// out of the highlight).
// VS_UI_SHOTS_DIR=<dir> saves PNGs of both viewports there.
// NETWORK SAFETY: every fabricated credential is EXPIRED — nothing here can
// contact a vendor. Worktree-isolated (own data/, a scratch HOME,
// VIBESPACE_SKIP_AGENT_HOOKS=1), free ports, per-pid names.
// Run: node scripts/test-roster-reset-eta.mjs
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePorts, scratch, scratchHome, ONBOARDED_SOURCE, vncEnv } from './scratch.mjs';
import { compactEta } from '../src/lib/usage-eta.js';
const VNC_ENV = await vncEnv(); // per-run singleton-Desktop display + port for every server this suite boots (never the machine-global :7/5901 — test-architecture §57)
const require = createRequire(import.meta.url);

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome/chromium'); process.exit(0); }
const SHOTS = process.env.VS_UI_SHOTS_DIR ? path.resolve(process.env.VS_UI_SHOTS_DIR) : null;
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

const [PORT, CDP_PORT] = await freePorts(2);
const wt = scratch('roster-eta');
const home = scratchHome('roster-eta-home', fs);
let failed = 0;
const check = (n, c, e) => { if (c) console.log(`  ✓ ${n}`); else { failed++; console.error(`  ✗ ${n}${e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)) : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000, step = 200) => { const t = Date.now() + ms; while (Date.now() < t) { let v = null; try { v = await fn(); } catch {} if (v) return v; await sleep(step); } return null; };

try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'server.js']) { execSync(`rm -rf ${wt}/${f} && cp -r ${repo}/${f} ${wt}/${f}`); }
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
execSync('npm run build', { cwd: wt, stdio: 'ignore' });
// a machine login that is present but EXPIRED: rows render, no token can be used
const expiredCreds = JSON.stringify({ claudeAiOauth: { accessToken: 'expired-test-token', expiresAt: Date.now() - 1000 } });
fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
fs.writeFileSync(path.join(home, '.claude', '.credentials.json'), expiredCreds);
fs.writeFileSync(path.join(home, '.claude.json'), JSON.stringify({ oauthAccount: { emailAddress: 'userA@example.com' } }));

const srvEnv = { ...process.env, ...VNC_ENV, PORT: String(PORT), HOME: home, VIBESPACE_SKIP_AGENT_HOOKS: '1' };
let srv = null;
const bootServer = () => { srv = spawn(process.execPath, ['server.js'], { cwd: wt, env: srvEnv, stdio: 'ignore' }); return srv; };
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--disable-background-timer-throttling', '--window-size=1200,800', `--user-data-dir=${scratch('roster-eta-chrome')}`, 'about:blank'], { stdio: 'ignore' });
const cleanup = () => {
  try { chrome.kill('SIGKILL'); } catch {}
  try { srv?.kill('SIGKILL'); } catch {}
  try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
  try { fs.rmSync(scratch('roster-eta-chrome'), { recursive: true, force: true }); } catch {}
  try { fs.rmSync(home, { recursive: true, force: true }); } catch {}
};
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(1); });
const waitServer = async () => { for (let i = 0; i < 80; i++) { try { await fetch(`http://127.0.0.1:${PORT}/api/home`); return true; } catch { await sleep(250); } } return false; };
const api = async (p, init) => (await fetch(`http://127.0.0.1:${PORT}${p}`, init)).json();
const post = (p, body) => api(p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

bootServer();
check('worktree server boots', await waitServer());

// ── the fixture: three subscriptions, resets DERIVED from the clock ──
const S = 1000, M = 60 * S, H = 60 * M, D = 24 * H;
const seedAt = Date.now();
const sec = (ms) => Math.floor(ms / 1000);
const A = await post('/api/accounts/subscription', { name: 'Member A' });
const B = await post('/api/accounts/subscription', { name: 'Member B' });
const C = await post('/api/accounts/subscription', { name: 'Member C' });
const AD = await post('/api/accounts/subscription', { name: 'Member D' });
const AE = await post('/api/accounts/subscription', { name: 'Member E' });
const AF = await post('/api/accounts/subscription', { name: 'Member F' });
check('six subscriptions minted', !!(A?.id && B?.id && C?.id && AD?.id && AE?.id && AF?.id), { A, B, C, AD, AE, AF });
for (const s of [A, B, C, AD, AE, AF]) fs.writeFileSync(path.join(wt, 'data', 'subs', s.id, '.credentials.json'), expiredCreds);
const cacheDir = path.join(wt, 'data', 'usage-cache');
fs.mkdirSync(cacheDir, { recursive: true });
const snap = (o) => ({ overallStatus: 'allowed', fetchedAt: seedAt, source: 'cli-usage', ...o });
// A: every bucket running — 65 min / 15 h / 3.2 d out; Fable at 96 % (pressure red), 7d at 87 % (yellow), 5h at 42 % (below 80 ⇒ text colour)
fs.writeFileSync(path.join(cacheDir, A.id + '.json'), JSON.stringify(snap({
  fiveHour: { utilization: 0.42, status: 'allowed', resetsAt: sec(seedAt + 65 * M), state: 'running' },
  sevenDay: { utilization: 0.87, status: 'allowed', resetsAt: sec(seedAt + 15 * H), state: 'running' },
  scopedWeekly: [{ name: 'Fable', utilization: 0.96, resetsAt: sec(seedAt + 3.2 * D), state: 'running' }], scopedFetchedAt: seedAt,
})));
// B: a brand-new account — both windows EMPTY (0 %, reset exactly one window out: it slides with the clock, B-8b12) ⇒ NO label
fs.writeFileSync(path.join(cacheDir, B.id + '.json'), JSON.stringify(snap({
  fiveHour: { utilization: 0, status: 'allowed', resetsAt: sec(seedAt + 5 * H), state: 'empty' },
  sevenDay: { utilization: 0, status: 'allowed', resetsAt: sec(seedAt + 7 * D), state: 'empty' },
  scopedWeekly: [],
})));
// C: a PASSED reset and a MISSING one ⇒ no label either (running, but nothing to count down to)
// …and an org whose extra usage is DISABLED (the shape every non-credits member carries) ⇒ no credits tag (B-ad05)
fs.writeFileSync(path.join(cacheDir, C.id + '.json'), JSON.stringify(snap({
  fiveHour: { utilization: 0.3, status: 'allowed', resetsAt: sec(seedAt - 60), state: 'running' },
  sevenDay: { utilization: 0.5, status: 'allowed', state: 'running' },
  scopedWeekly: [],
  overage: { inUse: false, status: 'rejected', disabledReason: 'org_level_disabled_until', asOf: seedAt },
})));
// D: the SOONEST reset on the roster — 5h in 40 min (20 %), 7d in 30 h (55 %) ⇒ the row label reads ≈ 40m and D is one of the two highlighted rows
// …and D's org has USAGE CREDITS enabled — overage present, not in use, with a vendor status that is
// not a rejection (B-ad05: the dim "credits" tag). POSITIVE EVIDENCE is required since the final
// verifier (2.369.110): a status-less `{inUse:false}` is also the shape of a DISABLED org whose record
// was rewritten by a status-less event, so it is 'unknown' and carries no tag (Member B below).
fs.writeFileSync(path.join(cacheDir, AD.id + '.json'), JSON.stringify(snap({
  fiveHour: { utilization: 0.2, status: 'allowed', resetsAt: sec(seedAt + 40 * M), state: 'running' },
  sevenDay: { utilization: 0.55, status: 'allowed', resetsAt: sec(seedAt + 30 * H), state: 'running' },
  scopedWeekly: [],
  overage: { inUse: false, status: 'allowed', asOf: seedAt },
})));
// E: BLOCKED — 7d SPENT (100 %, resets in 20 h) while its 5h (10 %) resets in 30 min: the row label must count to the 7d reset (that is when E is usable), so E is NOT among the two soonest
fs.writeFileSync(path.join(cacheDir, AE.id + '.json'), JSON.stringify(snap({
  fiveHour: { utilization: 0.1, status: 'allowed', resetsAt: sec(seedAt + 30 * M), state: 'running' },
  sevenDay: { utilization: 1, status: 'allowed', resetsAt: sec(seedAt + 20 * H), state: 'running' },
  scopedWeekly: [],
})));
// F: BLOCKED for DAYS — 7d spent (100 %, resets in 6 d 14 h) with a 5h that is fresh (0 %, EMPTY): the row label is the WIDEST shape
// the roster prints (`6d14h0m` — 2026-09-16, owner: 排版非常歪: a long token used to widen its own cell and shove that row's donuts left)
fs.writeFileSync(path.join(cacheDir, AF.id + '.json'), JSON.stringify(snap({
  fiveHour: { utilization: 0, status: 'allowed', resetsAt: sec(seedAt + 5 * H), state: 'empty' },
  sevenDay: { utilization: 1, status: 'allowed', resetsAt: sec(seedAt + 6 * D + 14 * H), state: 'running' },
  scopedWeekly: [],
})));
// the boot seed reads the directory ONCE; reboot so the files are the server's truth
srv.kill('SIGKILL'); await sleep(400); bootServer();
check('the server reboots over the seeded caches', await waitServer());
const u = await api('/api/usage');
check('/api/usage carries the three seeded accounts with their states verbatim', u?.accounts?.[A.id]?.fiveHour?.state === 'running' && u?.accounts?.[B.id]?.fiveHour?.state === 'empty' && u?.accounts?.[C.id]?.sevenDay?.resetsAt === undefined, Object.keys(u?.accounts || {}));
// what the PURE rule says these labels must read, derived from the SAME fixture
const expectA = [compactEta(sec(seedAt + 65 * M) * 1000, seedAt), compactEta(sec(seedAt + 15 * H) * 1000, seedAt), compactEta(sec(seedAt + 3.2 * D) * 1000, seedAt)];
check('control: the pure rule reads 65m / 15h / 3d off the fixture', expectA.join(' ') === '65m 15h 3d', expectA);

// ── chrome ──
const WebSocket = require('ws');
const cdpTargets = async () => (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json());
const target = await until(async () => (await cdpTargets()).find((t) => t.type === 'page'), 20000, 250);
const ws = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
await new Promise((r) => ws.on('open', r));
let seq = 0; const pend = new Map(); const jsErrors = [];
ws.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); return; } if (m.method === 'Runtime.exceptionThrown') jsErrors.push(m.params?.exceptionDetails?.exception?.description || 'exception'); });
const cdp = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, (m) => (m.error ? rej(new Error(m.error.message)) : res(m.result))); ws.send(JSON.stringify({ id, method, params })); });
const evalJs = async (expr) => { const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error('page threw: ' + (r.exceptionDetails.exception?.description || JSON.stringify(r.exceptionDetails))); return r.result.value; };
await cdp('Page.enable'); await cdp('Runtime.enable');
// VS_ROSTER_FONT='DejaVu Sans' node scripts/test-roster-reset-eta.mjs — run EVERY section under a
// named font (the mirror's resolved font differs from a developer box's).
const FONT_ENV = process.env.VS_ROSTER_FONT || '';
if (FONT_ENV) await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `document.addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = "*, html, body, .dialog, button, select, input { font-family: '${FONT_ENV}', sans-serif !important; }"; document.head.appendChild(st); });` });
const openPage = async () => { await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE }); await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/` }); await sleep(1200); await evalJs('new Promise((res, rej) => { const t0 = Date.now(); (function w() { if (window.app) return res(app.ready); if (Date.now() - t0 > 20000) return rej(new Error("no app after 20s")); setTimeout(w, 200); })(); })' /* in-page poll (2.369.118): the heavy tier went red with "no app" in two chrome lanes at once — one probe 1.5 s after navigate is a bet on load speed */); await evalJs(`localStorage.setItem('vibespace.quotaRefreshAck', '1'); 1`); };
const shot = async (name) => { if (!SHOTS) return; const r = await cdp('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(SHOTS, name), Buffer.from(r.data, 'base64')); };
// the measured facts of every roster row under `root`
const ROWS = (root) => `(() => {
  const root = ${root}; if (!root) return null;
  const R = (el) => el.getBoundingClientRect();
  const vis = (el) => !!el && getComputedStyle(el).display !== 'none' && R(el).width > 0;
  return [...root.querySelectorAll('.acct-key-row')].map((row) => {
    const age = row.querySelector('.acct-usage-age'), cluster = row.querySelector('.acct-usage'), mini = row.querySelector('.acct-usage-mini');
    return {
      id: row.dataset.id, name: row.querySelector('.acct-key-name')?.textContent || '',
      rowH: R(row).height, clusterVisible: vis(cluster), clusterRight: vis(cluster) ? R(cluster).right : null,
      miniVisible: vis(mini), miniText: mini ? mini.textContent : null, miniTitle: mini ? mini.title : null,
      next: (() => { const n = row.querySelector('.acct-usage-next'); return n ? { present: true, text: n.textContent.trim(), ms: n.dataset.nextMs ? Number(n.dataset.nextMs) : null, blocked: n.dataset.blocked === '1', title: n.title || '', visible: vis(n), minW: getComputedStyle(n).minWidth, right: R(n).right, hasIcon: !!n.querySelector('svg'), font: getComputedStyle(n).fontSize } : null; })(),
      soon: row.classList.contains('usage-acct-soon'), rowBg: getComputedStyle(row).backgroundColor,
      credits: (() => { const c = row.querySelector('.acct-key-line > .acct-usage-credits'); return c ? { text: c.textContent.trim(), title: c.title, visible: vis(c), color: getComputedStyle(c).color, tailLine: Math.abs(R(c).top - R(row.querySelector('.acct-key-name')).top) < 4 } : null; })(),
      inUseChip: !!row.querySelector('.acct-usage-overage'), extraLine: !!row.querySelector('.acct-key-extra'), nameColor: getComputedStyle(row.querySelector('.acct-key-name')).color,
      resetLine: !!row.querySelector('.acct-reset-eta'), ageText: age ? age.textContent : null, ageMinW: age ? getComputedStyle(age).minWidth : null, ageLines: age ? age.children.length : null,
      donutTops: [...row.querySelectorAll('.acct-donut-col .acct-usage-donut')].map((d) => R(d).top - R(row).top), ageRight: age ? R(age).right : null, iconLeft: (() => { const i = row.querySelector('.acct-usage-next svg'); return i ? R(i).left : null; })(), nextW: (() => { const n = row.querySelector('.acct-usage-next'); return n ? R(n).width : null; })(),
      cols: [...row.querySelectorAll('.acct-donut-col')].map((col) => { const d = col.querySelector('.acct-usage-donut'), e = col.querySelector('.acct-donut-eta'), slot = col.querySelector('.acct-donut-eta-slot'); return { label: d?.querySelector('span')?.textContent, eta: e ? e.textContent : null, slotH: slot ? R(slot).height : null, etaColor: e ? e.style.color : null, etaFont: e ? getComputedStyle(e).fontSize : null, etaBelow: e ? R(e).top >= R(d).bottom - 0.5 : null, etaCentred: e ? Math.abs((R(e).left + R(e).right) / 2 - (R(d).left + R(d).right) / 2) <= 1.5 : null, colH: R(col).height, colW: R(col).width, tip: d?.title || '' }; }),
    };
  });
})()`;
const LOCAL = `document.querySelector('.agents-machine-sec[data-host=""]')`;
const byId = (rows, id) => rows.find((r) => r.id === id);

try {
  // ── 1200×800: the Agents rail panel ──
  console.log('§1 the roster at 1200×800 — one compact countdown under every donut that may name a deadline');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1200, height: 800, deviceScaleFactor: 2, mobile: false });
  await openPage();
  await evalJs(`(() => { app.sidebar.toggle(true); const it = document.querySelector('.rail-item[data-rail="agents"]'); if (!it) throw new Error('no agents rail item'); it.click(); return 1; })()`);
  // widen the panel so the donut cluster (≥340px container) is the mode under test
  await evalJs(`(() => { app.sidebar.el.style.width = '504px'; app.sidebar._applySidebarLayoutWidth?.(); return 1; })()`);
  const rows = await until(async () => { const r = await evalJs(ROWS(LOCAL)); return r && byId(r, A.id)?.cols?.length === 3 && byId(r, C.id)?.cols?.length && byId(r, AE.id)?.cols?.length ? r : null; }, 20000, 300);
  check('the local roster renders the five members with their donut columns', !!rows, rows && rows.map((r) => [r.name, r.cols.length]));
  if (!rows) throw new Error('roster did not render');
  const a = byId(rows, A.id), b = byId(rows, B.id), c = byId(rows, C.id);
  // the roster also carries usage-LESS rows (the machine login with no cache, the pool) — the geometry claims are about rows that render a usage cell
  const usageRows = rows.filter((r) => r.cols.length > 0);
  check('control: exactly the six seeded members render a usage cell', usageRows.length === 6 && [A.id, B.id, C.id, AD.id, AE.id, AF.id].every((id) => byId(usageRows, id)), rows.map((r) => [r.name, r.cols.length]));
  check(`Member A: the labels under the donuts read ${expectA.join(' / ')} in bucket order (5h, 7d, Fa)`, a.cols.map((x) => x.eta).join(' ') === expectA.join(' ') && a.cols.map((x) => x.label).join(' ') === '5h 7d Fa', a.cols.map((x) => [x.label, x.eta]));
  check('Member A: each label sits BELOW its donut, centred on it', a.cols.every((x) => x.etaBelow === true && x.etaCentred === true), a.cols);
  check('Member A: the label is ≈ 8 px', a.cols.every((x) => /^(8|9)px$/.test(x.etaFont || '')), a.cols.map((x) => x.etaFont));
  check('Member A: colour = the donut\'s pressure colour at ≥ 80 % (7d 87 % yellow, Fable 96 % red), text-secondary below (5h 42 %)', a.cols[0].etaColor === 'var(--text-secondary)' && /var\(--yellow/.test(a.cols[1].etaColor) && /var\(--red/.test(a.cols[2].etaColor), a.cols.map((x) => x.etaColor));
  check('Member A: the donut tooltip keeps the full "resets in …" text', /resets in 1h\dm/.test(a.cols[0].tip) && /resets in 14h\d+m/.test(a.cols[1].tip) && /resets in 3d\d+h/.test(a.cols[2].tip), a.cols.map((x) => x.tip));
  check('Member B (two EMPTY windows — the reset slides, B-8b12): two donuts, NO label under either', b.cols.length === 2 && b.cols.every((x) => x.eta === null), b.cols);
  check('Member B: the empty window\'s tooltip does not claim a reset either', b.cols.every((x) => !/resets in/.test(x.tip)), b.cols.map((x) => x.tip));
  check('Member C (a passed reset + a missing one): no label under either donut', c.cols.length === 2 && c.cols.every((x) => x.eta === null), c.cols);
  check('the row-level tightest-bucket countdown line (.acct-reset-eta) is GONE from every row', rows.every((r) => !r.resetLine));
  check('the data-age cell is one line again and keeps its fixed min-width (6.5ch ≈ 32px; the donut columns stay right-anchored)', usageRows.every((r) => r.ageLines === 1 && parseFloat(r.ageMinW) >= 20), usageRows.map((r) => [r.ageLines, r.ageMinW]));
  check('a label-less column is exactly as tall as a labelled one (the min-height belt keeps rows aligned)', Math.abs(a.cols[0].colH - b.cols[0].colH) < 0.5 && Math.abs(a.cols[0].colH - c.cols[0].colH) < 0.5, [a.cols[0].colH, b.cols[0].colH, c.cols[0].colH]);
  check(`row heights are equal across labelled and label-less rows (${usageRows.map((r) => r.rowH.toFixed(1)).join(' / ')})`, Math.max(...usageRows.map((r) => r.rowH)) - Math.min(...usageRows.map((r) => r.rowH)) < 0.5);
  check(`the row grew by at most the label's height: ≤ 45 px (donut 22 + gap 1 + label 10 + padding 8; got ${a.rowH.toFixed(1)})`, a.rowH <= 45);
  const edges = rows.filter((r) => r.clusterRight != null).map((r) => r.clusterRight);
  check(`2.245.2 invariant kept: every visible cluster's right edge is aligned ±1px (spread ${(Math.max(...edges) - Math.min(...edges)).toFixed(1)}px over ${edges.length} rows)`, edges.length >= 3 && Math.max(...edges) - Math.min(...edges) <= 1);
  check('donut mode: the narrow-width pill is hidden', rows.every((r) => !r.miniVisible));
  // ── 2026-09-16 (owner: 排版非常歪) — three geometry pins over rows WITH and WITHOUT labels, short and 6-day tokens ──
  const tops = usageRows.flatMap((r) => r.donutTops);
  check(`every donut sits at the same y inside its row, labelled or not (spread ${(Math.max(...tops) - Math.min(...tops)).toFixed(1)}px over ${tops.length} donuts) — a label-less column carries a 10px slot`, Math.max(...tops) - Math.min(...tops) <= 1 && usageRows.every((r) => r.cols.every((x) => x.eta != null || x.slotH === 10)), usageRows.map((r) => [r.name, r.donutTops, r.cols.map((x) => x.slotH)]));
  const f = byId(rows, AF.id);
  check(`Member F (7d spent, resets in 6 d 14 h): the widest token the roster prints ("${f.next.text}")`, /^6d1[34]h\d+m$/.test(f.next.text) && f.next.blocked === true, f.next);
  const ageRights = usageRows.map((r) => r.ageRight);
  check(`the label cell is a FIXED column: the age cell's right edge is aligned ±1px across all six rows, 6-day token included (spread ${(Math.max(...ageRights) - Math.min(...ageRights)).toFixed(1)}px)`, Math.max(...ageRights) - Math.min(...ageRights) <= 1, usageRows.map((r) => [r.name, r.next.text, r.ageRight, r.nextW]));
  const iconLefts = usageRows.filter((r) => r.iconLeft != null).map((r) => r.iconLeft);
  check(`the hourglass icons form a straight column (left edges aligned ±1px over ${iconLefts.length} labelled rows)`, iconLefts.length >= 4 && Math.max(...iconLefts) - Math.min(...iconLefts) <= 1, usageRows.map((r) => [r.name, r.iconLeft]));
  await shot('roster-1200x800@2x.png');

  // ── the per-account countdown + the two-soonest highlight (2026-09-15) ──
  console.log('§1b one full-precision "next reset" label per account, the two soonest rows highlighted');
  const d = byId(rows, AD.id), e = byId(rows, AE.id);
  check('every usage row renders the label cell (empty when nothing counts) so the columns stay aligned', usageRows.every((r) => r.next?.present), usageRows.map((r) => [r.name, r.next]));
  check(`Member A (free, 5h 42 % / 7d 87 % / Fable 96 %): the label = the EARLIEST reset in full form ("${a.next.text}" ≈ 1h5m), with the hourglass icon`, /^1h[45]m$/.test(a.next.text) && a.next.blocked === false && a.next.hasIcon === true && /next reset in 1h[45]m/.test(a.next.title), a.next);
  check(`Member D (free): "${d.next.text}" ≈ 40m — minutes only below an hour`, /^(39|40)m$/.test(d.next.text) && d.next.blocked === false, d.next);
  check(`Member E (7d SPENT at 100 %): the label counts to the 7d reset ("${e.next.text}" ≈ 20h0m), NOT to the sooner 5h — that is when E is usable again`, /^(20h0m|19h5\dm)$/.test(e.next.text) && e.next.blocked === true && /usable again in/.test(e.next.title) && /7d/.test(e.next.title), e.next);
  check('Members B (empty windows) and C (passed / missing resets) carry NO countdown', b.next.text === '' && b.next.ms == null && c.next.text === '' && c.next.ms == null, [b.next, c.next]);
  check('the two SOONEST rows (D ≈ 40m, A ≈ 65m) carry .usage-acct-soon; E (20 h), F (6 d), B and C do not', d.soon && a.soon && !e.soon && !byId(rows, AF.id).soon && !b.soon && !c.soon && rows.filter((r) => r.soon).length === 2, rows.map((r) => [r.name, r.soon]));
  check('a highlighted row\'s tooltip says why; an unhighlighted one\'s does not', /closest to a reset/.test(a.next.title) && /closest to a reset/.test(d.next.title) && !/closest to a reset/.test(e.next.title), [a.next.title, d.next.title, e.next.title]);
  check('the highlight is a RENDERED background (a highlighted row differs from a plain one)', d.rowBg !== c.rowBg, [d.rowBg, c.rowBg]);
  // ── B-ad05 (2026-09-17): USAGE CREDITS ARE VISIBLE BEFORE THEY ARE SPENT ──
  console.log('§1c the dim "credits" tag on the member whose org bills pay-per-use past 100 %');
  check('Member D (overage present, not in use, vendor status not a rejection): the identity tail carries the dim "· credits" tag with the pay-per-use tooltip', !!d.credits && d.credits.visible && d.credits.text === '· credits' && /Extra usage is enabled on this org: requests past 100 % are billed pay-per-use/.test(d.credits.title), d.credits);
  check(`…it is INLINE on the identity line (same top as the name), adds no extra row line, and is not the in-use chip (rowH ${d.rowH && d.rowH.toFixed(1)}, clusterRight ${d.clusterRight}, tailLine ${d.credits && d.credits.tailLine}, font ${await evalJs('getComputedStyle(document.body).fontFamily')})`, !!d.credits && d.credits.tailLine === true && d.extraLine === false && d.inUseChip === false, d);
  check('Member C (overage rejected / org_level_disabled) and every other row carry no credits tag', !c.credits && rows.filter((r) => r.credits).length === 1, rows.map((r) => [r.name, !!r.credits]));
  check('the tag is dim: its colour differs from the name colour (text-secondary, not the name text)', !!d.credits && d.credits.color !== d.nameColor, [d.credits && d.credits.color, d.nameColor]);
  const nextRights = usageRows.map((r) => r.next.right);
  check(`the labels form a straight column: right edges aligned ±1px (spread ${(Math.max(...nextRights) - Math.min(...nextRights)).toFixed(1)}px over ${nextRights.length} rows)`, Math.max(...nextRights) - Math.min(...nextRights) <= 1);
  check('the label cell keeps a fixed min-width (≥ 30px) and the 9px roster font', usageRows.every((r) => parseFloat(r.next.minW) >= 30 && /^(8|9|10)px$/.test(r.next.font)), usageRows.map((r) => [r.next.minW, r.next.font]));
  check('the existing per-donut compact tokens are untouched by the new label (A still reads 65m / 15h / 3d under its donuts)', a.cols.map((x) => x.eta).join(' ') === expectA.join(' '), a.cols.map((x) => x.eta));
  check(`row heights stay equal and ≤ 45 px with the label in (${usageRows.map((r) => r.rowH.toFixed(1)).join(' / ')})`, Math.max(...usageRows.map((r) => r.rowH)) - Math.min(...usageRows.map((r) => r.rowH)) < 0.5 && a.rowH <= 45);
  check('the 30 s tick is armed on the open surface', await evalJs('!!app._agentsNextTick'));
  // the tick re-spells from the STAMPED instant — drive it with an injected clock instead of waiting
  const t35 = await evalJs(`(() => { app._retickNextLabels(document, Date.now() + 35 * 60 * 1000); return ${ROWS(LOCAL)}; })()`);
  const d35 = byId(t35, AD.id), a35 = byId(t35, A.id), e35 = byId(t35, AE.id);
  check(`tick +35 min: D ≈ 5m, A ≈ 30m, E ≈ 19h25m; D and A still the two soonest`, /^[4-6]m$/.test(d35.next.text) && /^(29|30)m$/.test(a35.next.text) && /^19h2\dm$/.test(e35.next.text) && d35.soon && a35.soon && !e35.soon, [d35.next.text, a35.next.text, e35.next.text, t35.map((r) => [r.name, r.soon])]);
  const t50 = await evalJs(`(() => { app._retickNextLabels(document, Date.now() + 50 * 60 * 1000); return ${ROWS(LOCAL)}; })()`);
  const d50 = byId(t50, AD.id), a50 = byId(t50, A.id), e50 = byId(t50, AE.id);
  check('tick +50 min: D\'s reset has PASSED — its label goes blank and it leaves the highlight; A (≈ 15m) and E (≈ 19h10m) are now the two soonest', d50.next.text === '' && d50.next.ms == null && !d50.soon && /^1[4-5]m$/.test(a50.next.text) && a50.soon && /^19h(09|1\d)m$|^19h\dm$/.test(e50.next.text) && e50.soon && t50.filter((r) => r.soon).length === 2, [d50.next, a50.next.text, e50.next.text, t50.map((r) => [r.name, r.soon])]);
  // a passed countdown stays blank until the next REPAINT (the tick only re-spells stamped instants, it never
  // re-derives one) — so the roster is repainted from its data before the later legs read it
  await evalJs(`(() => { app._agentsRefreshHook(); return 1; })()`);
  const back = await until(async () => { const r = await evalJs(ROWS(LOCAL)); const dd = r && byId(r, AD.id); return dd && /^(39|40)m$/.test(dd.next?.text || '') && dd.soon && byId(r, A.id)?.soon && !byId(r, AE.id)?.soon ? r : null; }, 20000, 300);
  check('a repaint restores D\'s label and the D/A highlight from the data (a passed countdown is blank only until the next render)', !!back, back && back.map((r) => [r.name, r.next?.text, r.soon]));

  // ── §1d LIVE UPDATE (2026-09-18, owner: "agents 侧边栏的内容不会实时更新，得重新打开一次才能看到最新的"):
  // the roster used to paint its usage cells once at render; the usage meter's 8 s poll now repaints
  // them in place (manage-agents.js _repaintRosterUsage). Proof on the RENDERED roster: A's 5h moves
  // on disk (the shape of a statusline / rate-limit write; /api/usage re-reads the directory per call)
  // and the open panel shows it without a reopen or a ⟳.
  console.log('§1d the open roster repaints from the usage poll — no reopen, no ⟳');
  {
    const before = byId(await evalJs(ROWS(LOCAL)), A.id);
    const aFile = path.join(cacheDir, A.id + '.json');
    const cur = JSON.parse(fs.readFileSync(aFile, 'utf8'));
    cur.fiveHour = { ...cur.fiveHour, utilization: 0.77 }; cur.fetchedAt = Date.now();
    fs.writeFileSync(aFile, JSON.stringify(cur));
    const live = await until(async () => { const r = await evalJs(ROWS(LOCAL)); const aa = r && byId(r, A.id); return aa && /: 77%/.test(aa.cols?.[0]?.tip || '') ? r : null; }, 25000, 500);
    check(`A's 5h donut moved 42 → 77 % on the OPEN roster within the poll interval (before: "${String(before?.cols?.[0]?.tip || '').slice(0, 24)}")`, !!live, live ? byId(live, A.id).cols.map((x) => x.tip) : 'no repaint within 25 s');
    if (live) {
      const aa = byId(live, A.id);
      check('…the repaint kept the row\'s shape: three donut columns, the cluster\'s right edge (±1px) and the label cell', aa.cols.length === 3 && Math.abs(aa.clusterRight - before.clusterRight) <= 1 && !!aa.next?.present, [aa.cols.length, aa.clusterRight, before.clusterRight]);
    }
    // restore A for the later legs and wait for the roster to show it again
    cur.fiveHour.utilization = 0.42; cur.fetchedAt = Date.now(); fs.writeFileSync(aFile, JSON.stringify(cur));
    const restored = await until(async () => { const r = await evalJs(ROWS(LOCAL)); const aa = r && byId(r, A.id); return aa && /: 42%/.test(aa.cols?.[0]?.tip || '') ? r : null; }, 25000, 500);
    check('…and moves back when the disk does (the poll is the source, not a one-shot)', !!restored);
  }

  // ── the ≤340px pill: the tightest bucket's percentage + ITS compact eta ──
  console.log('§2 below 340px the pill shows the tightest bucket and its countdown');
  await evalJs(`(() => { app.sidebar.el.style.width = '384px'; app.sidebar._applySidebarLayoutWidth?.(); return 1; })()`);
  await sleep(500);
  const narrow = await evalJs(ROWS(LOCAL));
  const na = byId(narrow, A.id), nb = byId(narrow, B.id);
  check('pill mode: the donut cluster is hidden and the pill shown (the swap is intact)', narrow.every((r) => !r.clusterVisible) && na.miniVisible && nb.miniVisible);
  check(`Member A's pill = the tightest bucket (Fa 96%) + its compact eta ("${na.miniText}")`, /^Fa 96% · 3d$/.test((na.miniText || '').trim()), na.miniText);
  check(`Member B's pill carries no countdown (empty windows): "${nb.miniText}"`, /^(5h|7d) 0%$/.test((nb.miniText || '').trim()), nb.miniText);
  const nd = byId(narrow, AD.id), ne = byId(narrow, AE.id);
  check('pill mode: the per-account label is inside the hidden cluster, but the pill\'s tooltip carries it (D: next reset ≈ 40m; E: usable again ≈ 20h)', !nd.next.visible && /next reset in (39|40)m/.test(nd.miniTitle || '') && /usable again in (20h0m|19h5\dm)/.test(ne.miniTitle || ''), [nd.miniTitle, ne.miniTitle]);
  check('pill mode: the row highlight survives the swap (D and A still marked)', nd.soon && byId(narrow, A.id).soon && !ne.soon, narrow.map((r) => [r.name, r.soon]));
  await evalJs(`(() => { app.sidebar.el.style.width = ''; app.sidebar._applySidebarLayoutWidth?.(); return 1; })()`);

  // ── 375×667: the mobile modal — under the DEFAULT font and under a WIDE one ──
  // The Actions runner has no Noto/Cantarell: `system-ui, sans-serif` there
  // resolves to DejaVu Sans, ~10 % wider, and the identity line + the 12.5ch
  // label cell overflowed a 375 px phone (red on every mirror run since
  // 2.369.75 while every developer box was green). The phone leg now runs
  // twice; the wide pass SKIPs with a reason when DejaVu Sans is not installed.
  const hasDejaVu = (() => { try { return /DejaVu Sans/.test(execSync('fc-list : family', { encoding: 'utf8' })); } catch { return false; } })();
  for (const font of [null, 'DejaVu Sans']) {
  if (font && !hasDejaVu) { console.log('  SKIP: the wide-font control needs DejaVu Sans on this machine (fc-list)'); continue; }
  console.log(`§3 at 375×667 the roster (the Agents modal on a phone) keeps its layout and the same rule${font ? ' — WIDE FONT CONTROL: ' + font : ''}`);
  const fontScript = font ? await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `document.addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = "*, html, body, .dialog, button, select, input { font-family: '${font}', sans-serif !important; }"; document.head.appendChild(st); });` }) : null;
  await cdp('Emulation.setDeviceMetricsOverride', { width: 375, height: 667, deviceScaleFactor: 2, mobile: true });
  await openPage();
  if (font) check(`the wide-font control is in force (body font-family starts with "${font}")`, await evalJs(`getComputedStyle(document.body).fontFamily.startsWith('"${font}"') || getComputedStyle(document.body).fontFamily.startsWith("${font}")`), await evalJs('getComputedStyle(document.body).fontFamily'));
  check('the page came up in mobile mode', await evalJs('app.isMobile === true'));
  await evalJs(`(() => { app._showAgentsDialog(); return 1; })()`);
  const MODAL = `document.querySelector('#agents-dialog-overlay .agents-dialog-body .agents-machine-sec[data-host=""]')`;
  const mrows = await until(async () => { const r = await evalJs(ROWS(MODAL)); return r && byId(r, A.id)?.cols?.length === 3 ? r : null; }, 20000, 300);
  check('the Agents modal renders the roster on the phone', !!mrows, mrows && mrows.map((r) => [r.name, r.cols.length]));
  if (mrows) {
    const ma = byId(mrows, A.id), mb = byId(mrows, B.id);
    const geom = await evalJs(`(() => { const dlg = document.querySelector('#agents-dialog-overlay .dialog'); const body = dlg.querySelector('.dialog-body'); const rowsEl = [...document.querySelectorAll('#agents-dialog-overlay .agents-machine-sec[data-host=""] .acct-key-row')]; const secEl = document.querySelector('#agents-dialog-overlay .agents-machine-sec[data-host=""]'); const secL = secEl ? secEl.getBoundingClientRect().left : 0; const widest = secEl ? [...secEl.querySelectorAll('*')].map((el) => { const r = el.getBoundingClientRect(); return { el, right: r.right - secL, w: r.width }; }).filter((x) => x.w > 0).sort((a, b) => b.right - a.right).slice(0, 3).map((x) => x.el.tagName.toLowerCase() + '.' + (x.el.className && x.el.className.toString().split(' ')[0] || '') + '@' + Math.round(x.right) + 'w' + Math.round(x.w) + (x.el.textContent ? ':' + x.el.textContent.trim().slice(0, 18) : '')).join(' | ') : null; const rowW = rowsEl.length ? Math.max(...rowsEl.map((r) => r.scrollWidth)) + ' (' + rowsEl.map((r) => [...r.children].map((c) => c.className.split(' ')[0] + ':' + Math.round(c.getBoundingClientRect().width)).join('+')).sort((x, y) => y.length - x.length)[0] + ')' : null; return { rowW, widest, secOverflowX: secEl && getComputedStyle(secEl).overflowX, dlgW: dlg.getBoundingClientRect().width, vw: innerWidth, dlgScrollW: dlg.scrollWidth, dlgClientW: dlg.clientWidth, bodyScrollW: body.scrollWidth, bodyClientW: body.clientWidth, sec: (() => { const s = ${MODAL}; return s ? { scrollW: s.scrollWidth, clientW: s.clientWidth } : null; })() }; })()`);
    check(`the modal fits the phone (dialog ${geom.dlgW.toFixed(0)} of ${geom.vw}) and the roster section has no sideways overflow of its own (${geom.sec && geom.sec.scrollW}/${geom.sec && geom.sec.clientW}; body ${geom.bodyScrollW}/${geom.bodyClientW}; widest row ${geom.rowW}; rightmost ${geom.widest})`, geom.dlgW <= geom.vw && !!geom.sec && geom.sec.scrollW <= geom.sec.clientW + 1, geom);
    // HONEST BOUNDARY (not this branch's): `.dialog.agents-dialog .agents-dialog-body { min-width: 380px }` predates this work (byte-identical on master), so on a 375px phone the modal's BODY is wider than the 345px dialog and .dialog's overflow:hidden clips it — measured here as dialog scrollWidth > clientWidth. Recorded as an open issue; the roster cell itself is what this suite pins.
    if (geom.dlgScrollW > geom.dlgClientW) console.log(`  NOTE (pre-existing, master too): the Agents modal body min-width 380px exceeds the ${geom.dlgW.toFixed(0)}px dialog on a ${geom.vw}px phone (dialog scroll ${geom.dlgScrollW}/${geom.dlgClientW}) — outside this change`);
    const musage = mrows.filter((r) => r.cols.length > 0);
    const mode = ma.clusterVisible ? 'donut' : ma.miniVisible ? 'pill' : 'none';
    check(`the ≤768px roster shows exactly one of the two usage forms per usage row (here: ${mode})`, mode !== 'none' && musage.length === 6 && musage.every((r) => (r.clusterVisible ? 1 : 0) + (r.miniVisible ? 1 : 0) === 1), mrows.map((r) => [r.name, r.clusterVisible, r.miniVisible]));
    check('phone: the two soonest rows (D, A) are highlighted here too', byId(mrows, AD.id)?.soon && byId(mrows, A.id)?.soon && mrows.filter((r) => r.soon).length === 2, mrows.map((r) => [r.name, r.soon]));
    if (mode === 'donut') {
      check('phone/donut: Member A carries the same three labels', ma.cols.map((x) => x.eta).join(' ') === expectA.join(' '), ma.cols.map((x) => x.eta));
      check('phone/donut: Member B carries none', mb.cols.every((x) => x.eta === null));
      check(`phone/donut: row heights equal and ≤ 45 px (${musage.map((r) => r.rowH.toFixed(1)).join(' / ')})`, Math.max(...musage.map((r) => r.rowH)) - Math.min(...musage.map((r) => r.rowH)) < 0.5 && ma.rowH <= 45);
    } else {
      check(`phone/pill: Member A's pill = "Fa 96% · 3d" ("${ma.miniText}")`, /^Fa 96% · 3d$/.test((ma.miniText || '').trim()), ma.miniText);
      check('phone/pill: Member B\'s pill has no countdown', /^(5h|7d) 0%$/.test((mb.miniText || '').trim()), mb.miniText);
      check(`phone/pill: row heights ≤ 45 px (${musage.map((r) => r.rowH.toFixed(1)).join(' / ')})`, musage.every((r) => r.rowH <= 45));
    }
    check('phone: the row-level countdown line is gone here too', mrows.every((r) => !r.resetLine));
    // SHRINK PRIORITY (2.369.129, owner "完全看不到账号名称了"): under pressure the ident
    // (email) ellipsizes first and the NAME keeps its full text — .128 had it the other
    // way round and every name in the modal collapsed to one letter.
    const prio = await evalJs(`(() => { const sec = ${MODAL}; const row = sec && sec.querySelector('.acct-key-row[data-id="${AD.id}"]'); if (!row) return null; const name = row.querySelector('.acct-key-name'), tail = row.querySelector('.acct-key-tail'); if (!name || !tail) return null; const savedTail = tail.textContent; tail.textContent = 'a.very.long.identity.address.for.pressure@subdomain.example-organization.com'; const m = () => ({ nameFull: name.scrollWidth <= name.clientWidth + 1, nameW: Math.round(name.getBoundingClientRect().width), tailCut: tail.scrollWidth > tail.clientWidth + 1, tailW: Math.round(tail.getBoundingClientRect().width), lineW: Math.round(row.querySelector('.acct-key-line').getBoundingClientRect().width) }); const line = row.querySelector('.acct-key-line'); const fixed = m(); /* 2.369.131: usage rows put the ident on its OWN line (grid), so the .128 weights alone no longer crush the name — the control re-creates the .128 shape: one flex line + the .128 weights */ line.style.display = 'flex'; name.style.flexShrink = '4'; tail.style.flexShrink = '1'; const swapped = m(); line.style.display = ''; name.style.flexShrink = ''; tail.style.flexShrink = ''; tail.textContent = savedTail; return { fixed, swapped, name: name.textContent, twoLines: Math.abs(tail.getBoundingClientRect().top - name.getBoundingClientRect().top) > 6 }; })()`);
    check(`phone: under a 70-char ident the NAME "${prio && prio.name}" keeps its full text and the ident is the one that ellipsizes (${JSON.stringify(prio && prio.fixed)})`, !!prio && prio.fixed.nameFull && prio.fixed.tailCut, prio);
    check(`NEGATIVE CONTROL: the .128 shape (one flex line, name 4 / tail 1) crushes the same name (${JSON.stringify(prio && prio.swapped)})`, !!prio && !prio.swapped.nameFull, prio);
    check('a usage row shows the ident on its OWN line under the name (2.369.131, owner: "把 email 放到第二行") — the name never competes with it', !!prio && prio.twoLines === true, prio);
    // THE RUNNER'S SHAPE (2.369.128): an npm-installed claude puts the ephemeral-install warning row in this section,
    // quoting an 80+ char install PATH — one unbreakable token that made the row 357 px in a 352 px section (the last
    // mirror red since 2.369.75). Inject the product's own row shape here so every machine exercises it.
    const eph = await evalJs(`(() => { const sec = ${MODAL}; const left = sec && sec.querySelector('.ob-backend .ob-backend-id'); if (!left) return null; /* the product appends the warning row to the status row's LEFT column (manage-agents.js: left.className = 'ob-backend-id') */ const row = document.createElement('div'); row.className = 'ob-cli-ephemeral'; row.innerHTML = '<span class="usage-warn">⚠ Installed in a system location (/opt/hostedtoolcache/node/22.19.0/x64/lib/node_modules/@anthropic-ai/claude-code/cli.js) — in containerized deployments, updates to it are lost when the container is rebuilt.</span>'; const b = document.createElement('button'); b.className = 'agent-btn'; b.textContent = 'Install persistent copy'; row.appendChild(b); left.appendChild(row); const r = row.getBoundingClientRect(); const span = row.querySelector('.usage-warn'); const cs = getComputedStyle(span); const secL = sec.getBoundingClientRect().left; const rightmost = [...sec.querySelectorAll('*')].map((el) => ({ el, right: el.getBoundingClientRect().right - secL, w: el.getBoundingClientRect().width })).filter((x) => x.w > 0).sort((x, y) => y.right - x.right).slice(0, 3).map((x) => x.el.tagName.toLowerCase() + '.' + (x.el.className && x.el.className.toString().split(' ')[0] || '') + '@' + Math.round(x.right) + 'w' + Math.round(x.w)).join(' | '); return { rowW: Math.round(r.width), rowRight: Math.round(r.right - secL), leftW: Math.round(left.getBoundingClientRect().width), leftClass: left.className, spanW: Math.round(span.getBoundingClientRect().width), spanScrollW: span.scrollWidth, wrap: cs.overflowWrap + '/' + cs.wordBreak + '/' + cs.whiteSpace, secScrollW: sec.scrollWidth, secClientW: sec.clientWidth, rightmost }; })()`);
    check(`phone: the ephemeral-install warning row (an unbreakable 80+ char path) wraps inside the section — no sideways overflow (${JSON.stringify(eph)})`, !!eph && eph.secScrollW <= eph.secClientW + 1 && eph.rowRight <= eph.secClientW + 1, eph);
    const ephNeg = await evalJs(`(() => { const sec = ${MODAL}; const span = sec && sec.querySelector('.ob-cli-ephemeral .usage-warn'); if (!span) return null; const saved = span.textContent; span.textContent = '⚠ Installed in a system location (' + '/opt/hostedtoolcache/node/22.19.0/x64/lib/node_modules/@anthropic-ai/claude-code/'.repeat(3) + 'cli.js) — lost on rebuild.'; const withRule = { secScrollW: sec.scrollWidth, secClientW: sec.clientWidth }; span.style.overflowWrap = 'normal'; span.style.wordBreak = 'normal'; const out = { withRule, secScrollW: sec.scrollWidth, secClientW: sec.clientWidth }; span.style.overflowWrap = ''; span.style.wordBreak = ''; span.textContent = saved; return out; })()`);
    check(`NEGATIVE CONTROL: a 240-char unbreakable path fits WITH the wrap rule (${ephNeg && ephNeg.withRule && ephNeg.withRule.secScrollW}/${ephNeg && ephNeg.withRule && ephNeg.withRule.secClientW}) and overflows the section with it removed (${ephNeg && ephNeg.secScrollW}/${ephNeg && ephNeg.secClientW}) — the CSS is load-bearing under any font`, !!ephNeg && ephNeg.withRule.secScrollW <= ephNeg.withRule.secClientW + 1 && ephNeg.secScrollW > ephNeg.secClientW + 1, ephNeg);
    await shot(font ? 'roster-375x667@2x-wide-font.png' : 'roster-375x667@2x.png');
  }
  if (fontScript) await cdp('Page.removeScriptToEvaluateOnNewDocument', { identifier: fontScript.identifier });
  }

  // ── §4 the DESKTOP roster under the wide font (the mirror's condition) ──
  // §1c is the leg the Actions mirror failed on every run: at 1200×800 under
  // DejaVu Sans the tail dropped under the name and the "· credits" tag left
  // the identity line (reproduced locally 2026-09-21 with VS_ROSTER_FONT). The
  // identity line no longer wraps (style.css .acct-key-line); this control
  // proves it under the wide font and SKIPs with a reason where DejaVu is absent.
  if (hasDejaVu) {
    console.log('§4 the 1200×800 rail roster under DejaVu Sans — the identity line holds the credits tag inline under a wide font');
    const wide = await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `document.addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = "*, html, body, .dialog, button, select, input { font-family: 'DejaVu Sans', sans-serif !important; }"; document.head.appendChild(st); });` });
    await cdp('Emulation.setDeviceMetricsOverride', { width: 1200, height: 800, deviceScaleFactor: 2, mobile: false });
    await openPage();
    check('wide font in force on the desktop pass', await evalJs(`/DejaVu Sans/.test(getComputedStyle(document.body).fontFamily)`), await evalJs('getComputedStyle(document.body).fontFamily'));
    // the rail item TOGGLES its panel and §1's choice persisted across the reload — open only when the section has no geometry yet
    await evalJs(`(() => { app.sidebar.toggle(true); return 1; })()`);
    for (let i = 0; i < 4; i++) { const w = await evalJs(`(() => { const sec = ${LOCAL}; return sec ? sec.clientWidth : 0; })()`); if (w > 0) break; await evalJs(`(() => { const it = document.querySelector('.rail-item[data-rail="agents"]'); if (!it) throw new Error('no agents rail item'); it.click(); return 1; })()`); await sleep(400); }
    await evalJs(`(() => { app.sidebar.el.style.width = '504px'; app.sidebar._applySidebarLayoutWidth?.(); return 1; })()`);
    const wrows = await until(async () => { const r = await evalJs(ROWS(LOCAL)); return r && byId(r, A.id)?.cols?.length === 3 && byId(r, AD.id)?.clusterVisible ? r : null; }, 20000, 300); // the same readiness §1 waits for (A has three donuts, D two): donut mode + laid out (a credits tag exists before the panel has any geometry)
    if (!wrows) { const dbg = await evalJs(`(() => { const sec = ${LOCAL}; const r = (${ROWS(LOCAL)}); return { sec: !!sec, secW: sec && sec.clientWidth, isMobile: app.isMobile, sidebarW: app.sidebar.el.getBoundingClientRect().width, rows: r && r.map((x) => [x.name, x.cols.length, x.clusterVisible, x.miniVisible]) }; })()`); console.log('  §4 DEBUG: ' + JSON.stringify(dbg)); }
    const wd = wrows && byId(wrows, AD.id);
    check(`wide font: Member D's credits tag is still INLINE with the name (rowH ${wd && wd.rowH && wd.rowH.toFixed(1)}, clusterRight ${wd && wd.clusterRight}, tailLine ${wd && wd.credits && wd.credits.tailLine})`, !!wd && !!wd.credits && wd.credits.visible && wd.credits.tailLine === true && wd.extraLine === false, wd);
    const wsec = await evalJs(`(() => { const sec = ${LOCAL}; return sec ? { scrollW: sec.scrollWidth, clientW: sec.clientWidth } : null; })()`);
    check(`wide font: the roster section has no sideways overflow (${wsec && wsec.scrollW}/${wsec && wsec.clientW})`, !!wsec && wsec.clientW > 100 && wsec.scrollW <= wsec.clientW + 1, wsec);
    await shot('roster-1200x800-wide-font.png');
    await cdp('Page.removeScriptToEvaluateOnNewDocument', { identifier: wide.identifier });
  } else console.log('  SKIP: §4 needs DejaVu Sans on this machine (fc-list)');
  const realErrors = jsErrors.filter((e) => !/favicon|net::|Failed to load resource/.test(e));
  check('no JS errors', realErrors.length === 0, realErrors.slice(0, 5));
} catch (e) {
  failed++; console.error('  ✗ threw:', e.stack || e.message);
} finally {
  try { ws.close(); } catch {}
}
console.log(failed ? `\n${failed} FAILED` : '\nroster reset-eta test passed');
process.exit(failed ? 1 : 0);

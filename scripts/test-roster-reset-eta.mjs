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
import { freePorts, scratch, scratchHome } from './scratch.mjs';
import { compactEta } from '../src/lib/usage-eta.js';
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

const srvEnv = { ...process.env, PORT: String(PORT), HOME: home, VIBESPACE_SKIP_AGENT_HOOKS: '1' };
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
check('three subscriptions minted', !!(A?.id && B?.id && C?.id), { A, B, C });
for (const s of [A, B, C]) fs.writeFileSync(path.join(wt, 'data', 'subs', s.id, '.credentials.json'), expiredCreds);
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
fs.writeFileSync(path.join(cacheDir, C.id + '.json'), JSON.stringify(snap({
  fiveHour: { utilization: 0.3, status: 'allowed', resetsAt: sec(seedAt - 60), state: 'running' },
  sevenDay: { utilization: 0.5, status: 'allowed', state: 'running' },
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
const openPage = async () => { await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/` }); await sleep(1200); await evalJs('window.app ? app.ready : Promise.reject(new Error("no app"))'); await evalJs(`localStorage.setItem('vibespace.quotaRefreshAck', '1'); 1`); };
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
      miniVisible: vis(mini), miniText: mini ? mini.textContent : null,
      resetLine: !!row.querySelector('.acct-reset-eta'), ageText: age ? age.textContent : null, ageMinW: age ? getComputedStyle(age).minWidth : null, ageLines: age ? age.children.length : null,
      cols: [...row.querySelectorAll('.acct-donut-col')].map((col) => { const d = col.querySelector('.acct-usage-donut'), e = col.querySelector('.acct-donut-eta'); return { label: d?.querySelector('span')?.textContent, eta: e ? e.textContent : null, etaColor: e ? e.style.color : null, etaFont: e ? getComputedStyle(e).fontSize : null, etaBelow: e ? R(e).top >= R(d).bottom - 0.5 : null, etaCentred: e ? Math.abs((R(e).left + R(e).right) / 2 - (R(d).left + R(d).right) / 2) <= 1.5 : null, colH: R(col).height, colW: R(col).width, tip: d?.title || '' }; }),
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
  const rows = await until(async () => { const r = await evalJs(ROWS(LOCAL)); return r && byId(r, A.id)?.cols?.length === 3 && byId(r, C.id)?.cols?.length ? r : null; }, 20000, 300);
  check('the local roster renders the three members with their donut columns', !!rows, rows && rows.map((r) => [r.name, r.cols.length]));
  if (!rows) throw new Error('roster did not render');
  const a = byId(rows, A.id), b = byId(rows, B.id), c = byId(rows, C.id);
  // the roster also carries usage-LESS rows (the machine login with no cache, the pool) — the geometry claims are about rows that render a usage cell
  const usageRows = rows.filter((r) => r.cols.length > 0);
  check('control: exactly the three seeded members render a usage cell', usageRows.length === 3 && [A.id, B.id, C.id].every((id) => byId(usageRows, id)), rows.map((r) => [r.name, r.cols.length]));
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
  await shot('roster-1200x800@2x.png');

  // ── the ≤340px pill: the tightest bucket's percentage + ITS compact eta ──
  console.log('§2 below 340px the pill shows the tightest bucket and its countdown');
  await evalJs(`(() => { app.sidebar.el.style.width = '384px'; app.sidebar._applySidebarLayoutWidth?.(); return 1; })()`);
  await sleep(500);
  const narrow = await evalJs(ROWS(LOCAL));
  const na = byId(narrow, A.id), nb = byId(narrow, B.id);
  check('pill mode: the donut cluster is hidden and the pill shown (the swap is intact)', narrow.every((r) => !r.clusterVisible) && na.miniVisible && nb.miniVisible);
  check(`Member A's pill = the tightest bucket (Fa 96%) + its compact eta ("${na.miniText}")`, /^Fa 96% · 3d$/.test((na.miniText || '').trim()), na.miniText);
  check(`Member B's pill carries no countdown (empty windows): "${nb.miniText}"`, /^(5h|7d) 0%$/.test((nb.miniText || '').trim()), nb.miniText);
  await evalJs(`(() => { app.sidebar.el.style.width = ''; app.sidebar._applySidebarLayoutWidth?.(); return 1; })()`);

  // ── 375×667: the mobile modal ──
  console.log('§3 at 375×667 the roster (the Agents modal on a phone) keeps its layout and the same rule');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 375, height: 667, deviceScaleFactor: 2, mobile: true });
  await openPage();
  check('the page came up in mobile mode', await evalJs('app.isMobile === true'));
  await evalJs(`(() => { app._showAgentsDialog(); return 1; })()`);
  const MODAL = `document.querySelector('#agents-dialog-overlay .agents-dialog-body .agents-machine-sec[data-host=""]')`;
  const mrows = await until(async () => { const r = await evalJs(ROWS(MODAL)); return r && byId(r, A.id)?.cols?.length === 3 ? r : null; }, 20000, 300);
  check('the Agents modal renders the roster on the phone', !!mrows, mrows && mrows.map((r) => [r.name, r.cols.length]));
  if (mrows) {
    const ma = byId(mrows, A.id), mb = byId(mrows, B.id);
    const geom = await evalJs(`(() => { const dlg = document.querySelector('#agents-dialog-overlay .dialog'); const body = dlg.querySelector('.dialog-body'); return { dlgW: dlg.getBoundingClientRect().width, vw: innerWidth, dlgScrollW: dlg.scrollWidth, dlgClientW: dlg.clientWidth, bodyScrollW: body.scrollWidth, bodyClientW: body.clientWidth, sec: (() => { const s = ${MODAL}; return s ? { scrollW: s.scrollWidth, clientW: s.clientWidth } : null; })() }; })()`);
    check(`the modal fits the phone (dialog ${geom.dlgW.toFixed(0)} of ${geom.vw}) and the roster section has no sideways overflow of its own (${geom.sec && geom.sec.scrollW}/${geom.sec && geom.sec.clientW})`, geom.dlgW <= geom.vw && !!geom.sec && geom.sec.scrollW <= geom.sec.clientW + 1, geom);
    // HONEST BOUNDARY (not this branch's): `.dialog.agents-dialog .agents-dialog-body { min-width: 380px }` predates this work (byte-identical on master), so on a 375px phone the modal's BODY is wider than the 345px dialog and .dialog's overflow:hidden clips it — measured here as dialog scrollWidth > clientWidth. Recorded as an open issue; the roster cell itself is what this suite pins.
    if (geom.dlgScrollW > geom.dlgClientW) console.log(`  NOTE (pre-existing, master too): the Agents modal body min-width 380px exceeds the ${geom.dlgW.toFixed(0)}px dialog on a ${geom.vw}px phone (dialog scroll ${geom.dlgScrollW}/${geom.dlgClientW}) — outside this change`);
    const musage = mrows.filter((r) => r.cols.length > 0);
    const mode = ma.clusterVisible ? 'donut' : ma.miniVisible ? 'pill' : 'none';
    check(`the ≤768px roster shows exactly one of the two usage forms per usage row (here: ${mode})`, mode !== 'none' && musage.length === 3 && musage.every((r) => (r.clusterVisible ? 1 : 0) + (r.miniVisible ? 1 : 0) === 1), mrows.map((r) => [r.name, r.clusterVisible, r.miniVisible]));
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
    await shot('roster-375x667@2x.png');
  }
  const realErrors = jsErrors.filter((e) => !/favicon|net::|Failed to load resource/.test(e));
  check('no JS errors', realErrors.length === 0, realErrors.slice(0, 5));
} catch (e) {
  failed++; console.error('  ✗ threw:', e.stack || e.message);
} finally {
  try { ws.close(); } catch {}
}
console.log(failed ? `\n${failed} FAILED` : '\nroster reset-eta test passed');
process.exit(failed ? 1 : 0);

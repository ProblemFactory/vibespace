#!/usr/bin/env node
// LANE BROWSER-ADMIN — NEW PROFILE… AND CHANGE BUILD…, SEEN (the owner, 2026-09-30: "不能手动创建profile" / "不能pin指定版本").
// Heavy: a scratch COPY of the working tree (its own data/, HOME and bundle), a stub `claude` behind the REAL chat-wrapper
// for one live conversation, a fake agent-browser 0.38.1 on the server's PATH (every call's launch view logged; its
// /json/version answers the build the last launch ran), a fake builds folder in the server's HOME, headless chrome:
//
//   ① en 1280×800: the Agent browser panel's New profile… opens THE dialog — every provider a row (CloakBrowser, not
//      installed, offers Install… and is not pickable), the machine section, the build section (its first answer HELD by
//      the leg: "Reading the list of Chrome builds…" + aria-busy while asked, then the builds), "All my conversations";
//      a name + "Chrome 151.0.7922.34" + Create ⇒ ONE POST carrying the build; the panel gains the row IN PLACE (the row
//      that was there is the same node) and says "Chrome 151.0.7922.34 (pinned)";
//   ② Change build… under a HOLDER: the live conversation leases the profile (its browser runs build 151); the dialog
//      says the restart and who is told; Change and restart ⇒ the conversation's chat shows the relaunch card (from/to,
//      read the page), the browser relaunched on 152 (every launching call carried it), the row says it runs 152;
//   ③ zh and ja: both dialogs in the device's language (the dictionary's words);
//   ④ 390 px (a phone): both dialogs inside the viewport, nothing sideways, no clipped button;
//   ⑤ the REAL binary (when this box has agent-browser and a measured Chrome build — SKIP with evidence otherwise): a
//      keeper over a scratch HOME whose browsers/ is a symlink to the account's (nothing else copied) launches a profile
//      pinned to chrome-146.0.7680.153 while the CLI's default is newer — the running browser's own /json/version and its
//      process both name 146: the env reached the real CLI on every call (a call without it would relaunch the default).
//   ③b lane chrome-builds-download: Change build… → "Download another build…" → the picker over a loopback Chrome for Testing
//      (the scratch copy's record names reserved `.test` hosts, VIBESPACE_TEST_EGRESS_MAP points them at it): the Stable row's
//      chips and THE confirm in zh / ja / en; in en the download runs through the UI (the progress line) and Change build…
//      comes back with the new build picked.
//   ⑧ design 015 (lane browser-panel-tidy): THE PANEL — the RECT CENSUS at 860 and 1280 px in zh / ja / en over hostile
//      fixtures (a 40-character name listing twelve Task Groups, a paired machine's unmeasured row, a running and a stopped
//      one): every row's five cell left edges = the column titles', every cell's right edge inside the list, each l1 one
//      line, the who line never wraps (twelve chips fold by width into "+N more"), nothing clipped or sideways; CONTROLS:
//      the mockup's minimums (200 · 150 · 190 · 140 · 150) and per-row grids with an `auto` acts column both go red; the
//      walk: a fold open survives a load (the same row node), a who-change patches the cell in place, the ⋯ menu's record
//      check row PATCHes and re-reads, its Delete… runs the two-step dialog on a row whose fold was open, a paired
//      machine's row has no primary and no Stop / record, the ⓘ popover; 390 px: titles hidden, the row's five lines in
//      order, the acts on the name's line, nothing sideways.
// Artifacts: PNG per leg under <tmpdir>/vibespace-badm-shots/run-<pid>-<time>/ (the newest three kept). SKIPs without
// chrome or dtach. Run: node scripts/test-browser-profiles-ui.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { scratch, freePort, ONBOARDED_SOURCE, vncEnv, endRootedProcesses } from './scratch.mjs';
const VNC_ENV = await vncEnv(); // per-run singleton-Desktop names for the server this suite boots (test-architecture §57)
const require = createRequire(import.meta.url);
const { WebSocket } = require('ws');

let pass = 0, fail = 0, skipped = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? '\n    ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 1600) : '')); } return !!c; };
const skip = (n) => { skipped++; console.log('  ⊘ SKIP ' + n); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (pred, ms, every = 80) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = await pred(); if (v) return v; } catch { } await sleep(every); } try { return await pred(); } catch { return null; } };
const J = (x) => JSON.stringify(x);
const repo = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const zhDict = (await import('../src/lib/i18n-zh.js')).default;
const jaDict = (await import('../src/lib/i18n-ja.js')).default;
const tr = (lang, k, p) => { let s = (lang === 'zh' ? zhDict[k] : lang === 'ja' ? jaDict[k] : null) || k; if (p) s = s.replace(/\{(\w+)\}/g, (m, x) => (p[x] !== undefined ? String(p[x]) : m)); return s; };

const ROOT = scratch('badm');
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(ROOT, { recursive: true });
const SHOTS_ROOT = process.env.VIBESPACE_BADM_SHOTS ? path.resolve(process.env.VIBESPACE_BADM_SHOTS) : path.join(os.tmpdir(), 'vibespace-badm-shots');
const SHOTS = path.join(SHOTS_ROOT, `run-${process.pid}-${Date.now()}`);
fs.mkdirSync(SHOTS, { recursive: true });
try { const runs = fs.readdirSync(SHOTS_ROOT).filter((d) => /^run-\d+-\d+$/.test(d)).sort((a, b) => Number(b.split('-')[2]) - Number(a.split('-')[2])); for (const d of runs.slice(3)) fs.rmSync(path.join(SHOTS_ROOT, d), { recursive: true, force: true }); } catch { /* none */ }
console.log(`artifacts: ${SHOTS}`);

const procs = new Set();
const servers = new Set();
function cleanup() {
  for (const p of procs) { try { p.kill('SIGKILL'); } catch { } }
  for (const s of servers) { try { s.close(); } catch { } }
  try { endRootedProcesses(ROOT); } catch { }
  try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { }
}
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(1); });

// in the page: every fetch recorded (method, url, body)
function PAGE_WRAPPERS() {
  const S = (window.__badm = { calls: [] });
  const realFetch = window.fetch.bind(window);
  window.fetch = async function (input, init) {
    const url = String((input && input.url) || input);
    const method = String((init && init.method) || 'GET').toUpperCase();
    let body = null; try { body = init && typeof init.body === 'string' ? JSON.parse(init.body) : null; } catch { body = null; }
    S.calls.push({ url, method, body, at: Date.now() });
    const res = await realFetch(input, init);
    // design 015 census fixture: `__badm.doctor(view)` rewrites the housekeeping answer the panel draws (display data only)
    if (S.doctor && /\/api\/browser\/housekeeping$/.test(url.split('?')[0])) { try { const j = await res.clone().json(); S.doctor(j); return new Response(JSON.stringify(j), { status: res.status, headers: { 'Content-Type': 'application/json' } }); } catch { /* the real answer */ } }
    return res;
  };
}
// the RECT census (in the page): a dialog inside the viewport, its parts inside it, no sideways scroll, no clipped button
function RECTS(sel) {
  const out = { problems: [], n: 0 };
  const d = document.querySelector(sel);
  if (!d) return { problems: ['no ' + sel], n: 0 };
  const db = d.getBoundingClientRect();
  if (db.left < -1 || db.right > innerWidth + 1) out.problems.push(`${sel} past the viewport (${Math.round(db.left)}–${Math.round(db.right)} of ${innerWidth})`);
  for (const el of d.querySelectorAll('button, label.bwho-answer, input, .bwho-answer-sub, .bbuild-hint, .bbuild-change')) {
    const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const b = el.getBoundingClientRect(); if (!(b.width > 0 && b.height > 0)) continue;
    out.n++;
    if (b.left < db.left - 1 || b.right > db.right + 1) out.problems.push(`"${(el.textContent || el.value || el.className).trim().slice(0, 30)}" past the dialog (${Math.round(b.left)}–${Math.round(b.right)} ⊄ ${Math.round(db.left)}–${Math.round(db.right)})`);
    if (el.tagName === 'BUTTON' && el.scrollWidth > el.clientWidth + 1) out.problems.push(`button clipped: "${el.textContent.trim()}"`);
  }
  if (document.documentElement.scrollWidth > innerWidth + 1) out.problems.push(`the page scrolls sideways (${document.documentElement.scrollWidth} > ${innerWidth})`);
  return out;
}

// design 015 §2b — THE PANEL'S RECT CENSUS (in the page): the grid's columns, the cells inside the list, one-line l1s
function PANEL_CENSUS() {
  const out = { problems: [], rows: 0 };
  const table = document.querySelector('.bprof-table');
  if (!table) return { problems: ['no .bprof-table'], rows: 0 };
  const tb = table.getBoundingClientRect();
  const vis = (e) => !!e && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0;
  out.stacked = !!document.querySelector('.bprof.bprof-stacked');
  const head = table.querySelector('.bprof-head');
  const hs = vis(head) ? [...head.children].map((c) => Math.round(c.getBoundingClientRect().left)) : null;
  out.head = hs;
  for (const row of table.querySelectorAll('.bprof-profile')) {
    out.rows++;
    const id = row.dataset.profileId;
    const cells = [...row.children].filter((c) => c.classList.contains('bprof-cell'));
    if (cells.length !== 5) out.problems.push(`${id}: ${cells.length} cells`);
    const lefts = cells.map((c) => Math.round(c.getBoundingClientRect().left));
    if (!out.stacked && hs) for (let i = 0; i < Math.min(5, cells.length); i++) if (Math.abs(lefts[i] - hs[i]) > 1) out.problems.push(`${id}: cell ${i} left ${lefts[i]} ≠ the title's ${hs[i]}`);
    for (const c of cells) { const b = c.getBoundingClientRect(); if (b.right > tb.right + 1) out.problems.push(`${id}: a cell's right edge ${Math.round(b.right)} > the list's ${Math.round(tb.right)}`); }
    for (const l of row.querySelectorAll('.bprof-cell > .bprof-l1')) { const b = l.getBoundingClientRect(); if (b.height > 26) out.problems.push(`${id}: an l1 is ${Math.round(b.height)} px tall`); }
    const wl = row.querySelector('.bprof-who-line');
    if (wl) {
      const parts = [...wl.querySelectorAll('.bprof-who-chip, .bprof-who-more, .bprof-who-change')].filter(vis);
      const mids = parts.map((e) => { const b = e.getBoundingClientRect(); return Math.round(b.top + b.height / 2); });
      if (mids.length && Math.max(...mids) - Math.min(...mids) > 3) out.problems.push(`${id}: the who line wraps`);
      const lb = wl.getBoundingClientRect();
      for (const e of parts) { const b = e.getBoundingClientRect(); if (b.right > lb.right + 1) out.problems.push(`${id}: "${e.textContent.trim().slice(0, 20)}" cut at the who cell's end`); }
    }
    for (const b of row.querySelectorAll('button')) { if (!vis(b)) continue; if (b.scrollWidth > b.clientWidth + 1) out.problems.push(`${id}: button clipped "${b.textContent.trim()}"`); }
    const fold = row.querySelector('.bprof-fold');
    if (!out.stacked && fold && fold.hidden && row.getBoundingClientRect().height > 60) out.problems.push(`${id}: a closed row is ${Math.round(row.getBoundingClientRect().height)} px tall`);
  }
  const body = document.querySelector('.bprof-body');
  if (body && body.scrollWidth > body.clientWidth + 1) out.problems.push(`the list scrolls sideways (${body.scrollWidth} > ${body.clientWidth})`);
  if (document.documentElement.scrollWidth > innerWidth + 1) out.problems.push('the page scrolls sideways');
  return out;
}
// design 015 §2b — the phone: no titles, a row's five lines in order, the acts on the name's line
function PHONE_ROWS() {
  const out = { problems: [], rows: 0 };
  const head = document.querySelector('.bprof-head');
  if (head && getComputedStyle(head).display !== 'none') out.problems.push('the column titles show on a phone');
  for (const row of document.querySelectorAll('.bprof-profile')) {
    out.rows++;
    const id = row.dataset.profileId, q = (s) => row.querySelector(s);
    const top = (e) => (e ? Math.round(e.getBoundingClientRect().top) : null);
    const n1 = q('.bprof-ident > .bprof-l1'), act = q('.bprof-act');
    const tops = [top(n1), top(q('.bprof-chips')), top(q('.bprof-state')), top(q('.bprof-who')), top(q('.bprof-use'))];
    if (!(tops[0] < tops[1] && tops[1] < tops[2] && tops[2] < tops[3] && tops[3] < tops[4])) out.problems.push(`${id}: the five lines out of order ${tops}`);
    const nb = n1.getBoundingClientRect(), ab = act.getBoundingClientRect(), rb = row.getBoundingClientRect();
    if (Math.abs(ab.top + ab.height / 2 - (nb.top + nb.height / 2)) > 4) out.problems.push(`${id}: the acts are not on the name's line`);
    if (ab.right > rb.right + 1) out.problems.push(`${id}: the acts past the row`);
    for (const c of row.querySelectorAll('.bprof-cell')) if (c.getBoundingClientRect().right > innerWidth + 1) out.problems.push(`${id}: a cell past the screen`);
  }
  const body = document.querySelector('.bprof-body');
  if (body && body.scrollWidth > body.clientWidth + 1) out.problems.push('the list scrolls sideways');
  if (document.documentElement.scrollWidth > innerWidth + 1) out.problems.push('the page scrolls sideways');
  return out;
}

const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => fs.existsSync(p));
const hasDtach = (() => { try { execFileSync('which', ['dtach'], { stdio: 'ignore' }); return true; } catch { return false; } })();
if (!CHROME) skip('no chrome/chromium on this box — legs ①–④ need one');
else if (!hasDtach) skip('no dtach on this box — the live conversation runs under it');
else await (async () => {
  // ── the scratch app ──
  const WT = path.join(ROOT, 'app');
  fs.mkdirSync(WT, { recursive: true });
  for (const f of ['src', 'public']) fs.cpSync(path.join(repo, f), path.join(WT, f), { recursive: true });
  for (const f of ['server.js', 'package.json']) fs.copyFileSync(path.join(repo, f), path.join(WT, f));
  for (const f of execFileSync('git', ['-C', repo, 'ls-files', 'data/bin'], { encoding: 'utf8' }).split('\n').filter(Boolean)) {
    const to = path.join(WT, f); fs.mkdirSync(path.dirname(to), { recursive: true }); fs.copyFileSync(path.join(repo, f), to); fs.chmodSync(to, fs.statSync(path.join(repo, f)).mode);
  }
  fs.symlinkSync(path.join(repo, 'node_modules'), path.join(WT, 'node_modules'));
  const version = JSON.parse(fs.readFileSync(path.join(WT, 'package.json'), 'utf8')).version;
  fs.writeFileSync(path.join(WT, 'src/lib/build-version.js'), `export const BUILD_VERSION = ${J(version)};\n`);
  await require('esbuild').build({ entryPoints: [path.join(WT, 'src/client.js')], bundle: true, outfile: path.join(WT, 'public/bundle.js'), format: 'iife', platform: 'browser', target: 'es2020', loader: { '.css': 'css' }, minify: true, logLevel: 'error' });
  ok(fs.statSync(path.join(WT, 'public/bundle.js')).size > 500000, 'the scratch copy built its own bundle');
  const HOME_DIR = path.join(ROOT, 'home');
  for (const d of ['.claude/projects', '.claude/sessions', '.config', '.vibespace']) fs.mkdirSync(path.join(HOME_DIR, d), { recursive: true });
  // the server's Chrome builds (the measured layout): two runnable
  const BUILDS = path.join(HOME_DIR, '.agent-browser', 'browsers');
  const mkBuild = (v) => { const d = path.join(BUILDS, 'chrome-' + v); fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, 'chrome'), '#!/bin/sh\nexit 0\n', { mode: 0o755 }); return path.join(d, 'chrome'); };
  const B151 = mkBuild('151.0.7922.34'), B152 = mkBuild('152.0.1.2');
  const WORK = path.join(ROOT, 'w'); fs.mkdirSync(WORK, { recursive: true });
  // ── a stub claude ──
  const STUB = path.join(ROOT, 'claude');
  fs.writeFileSync(STUB, `#!${process.execPath}
const a = process.argv.slice(2);
if (a.includes('--version')) { console.log('2.1.281 (Claude Code) stub'); process.exit(0); }
if (a.includes('--help')) { console.log('Usage: claude [options]'); process.exit(0); }
const at = (f) => { const i = a.indexOf(f); return i >= 0 ? a[i + 1] : null; };
const SID = at('--session-id') || at('--resume') || ('0e1a0000-0000-4000-8000-' + String(process.pid).padStart(12, '0'));
process.stdout.write(JSON.stringify({ type: 'system', subtype: 'init', session_id: SID, model: 'claude-fable-5', cwd: process.cwd(), tools: [], permissionMode: 'default', claude_code_version: '2.1.281' }) + '\\n');
process.stdin.on('data', () => {}); process.stdin.on('end', () => process.exit(0));
`, { mode: 0o755 });
  // ── the /json/version every browser of the fake answers: the build its LAST launch ran ──
  const FAKE_BIN = path.join(ROOT, 'fakebin'), FAKE_ST = path.join(ROOT, 'fakeab');
  fs.mkdirSync(FAKE_BIN, { recursive: true }); fs.mkdirSync(FAKE_ST, { recursive: true });
  const callsLog = path.join(FAKE_ST, 'calls.log'), launchesLog = path.join(FAKE_ST, 'launches.log');
  const readLog = (f) => { try { return fs.readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };
  const verSrv = http.createServer((req, res) => { const l = readLog(launchesLog).at(-1); const m = l && l.exe && /chrome-(\d+\.\d+\.\d+\.\d+)/.exec(l.exe); res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(J({ Browser: 'Chrome/' + (m ? m[1] : '149.0.1.1') })); });
  servers.add(verSrv);
  const VPORT = await new Promise((r) => verSrv.listen(0, '127.0.0.1', () => r(verSrv.address().port)));
  fs.writeFileSync(path.join(FAKE_BIN, 'agent-browser'), `#!${process.execPath}
const fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const st = ${J(FAKE_ST)}; const ns = process.env.AGENT_BROWSER_NAMESPACE || 'default'; const sess = process.env.AGENT_BROWSER_SESSION || ns;
const f = path.join(st, ns + '__' + sess + '.json');
const read = () => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const out = (o) => { process.stdout.write(JSON.stringify(o) + '\\n'); };
const argv = process.argv.slice(2).filter((x) => x !== '--pin-tab' && x !== '--json');
const [a, b] = argv;
const exe = process.env.AGENT_BROWSER_EXECUTABLE_PATH || null;
fs.appendFileSync(${J(callsLog)}, JSON.stringify({ ns, sess, argv, exe }) + '\\n');
const daemon = () => { let s = read(); if (s && alive(s.pid)) return s; const c = spawn('sleep', ['900'], { detached: true, stdio: 'ignore' }); c.unref(); s = { pid: c.pid }; fs.writeFileSync(f, JSON.stringify(s)); fs.appendFileSync(${J(launchesLog)}, JSON.stringify({ ns, sess, exe, pid: c.pid }) + '\\n'); return s; };
if (a === '--version') { console.log('agent-browser 0.38.1'); process.exit(0); }
if (a === 'session' && b === 'info') { const s = read(); const act = !!(s && alive(s.pid)); out({ success: true, data: { active: act, namespace: ns, pid: act ? s.pid : null, session: sess } }); process.exit(0); }
if (a === 'get' && b === 'cdp-url') { const s = read(); if (!(s && alive(s.pid))) { out({ success: false, error: 'fake: no browser' }); process.exit(1); } out({ success: true, data: { cdpUrl: 'ws://127.0.0.1:${VPORT}/devtools/browser/fake-' + ns } }); process.exit(0); }
if (a === 'close') { const s = read(); if (s && alive(s.pid)) { try { process.kill(s.pid, 'SIGKILL'); } catch { } } try { fs.unlinkSync(f); } catch { } out({ success: true, data: { closed: 1 } }); process.exit(0); }
if (a === 'stream' && b === 'status') { out({ success: true, data: { enabled: true, connected: true, port: 21999, screencasting: false } }); process.exit(0); }
if (a === 'tab' && b === 'new') { out({ success: true, data: { targetId: 't-' + Date.now(), url: argv[2] } }); process.exit(0); }
if (a === 'tab' && b === 'list') { out({ success: true, data: { tabs: [] } }); process.exit(0); }
if (['open', 'snapshot', 'get', 'click'].includes(a)) { daemon(); out({ success: true, data: { ok: true, url: argv[1] || '' } }); process.exit(0); }
out({ success: false, error: 'fake: unknown verb ' + argv.join(' ') }); process.exit(1);
`, { mode: 0o755 });

  // ── lane chrome-builds-download: the loopback "Chrome for Testing" behind reserved `.test` names (never a real host) ──
  const CFT_PORT = await freePort();
  const { chromeZip } = await import('./fixtures/chrome-for-testing/fake-zip.mjs');
  const crypto = await import('node:crypto');
  const LKG = JSON.parse(fs.readFileSync(path.join(repo, 'scripts/fixtures/chrome-for-testing/last-known-good-versions-with-downloads.json'), 'utf8').replaceAll('https://storage.googleapis.com/', `https://storage.test:${CFT_PORT}/`));
  const STABLE = LKG.channels.Stable.version, CFT_ZIP = chromeZip(STABLE), CFT_MD5 = crypto.createHash('md5').update(CFT_ZIP).digest();
  const cftHits = [];
  const cft = http.createServer((req, res) => {
    cftHits.push(req.method + ' ' + req.url);
    if (req.url === '/chrome-for-testing/last-known-good-versions-with-downloads.json') { const b = Buffer.from(JSON.stringify(LKG)); res.writeHead(200, { 'content-type': 'application/json', 'content-length': b.length }); return res.end(b); }
    if (req.url === `/chrome-for-testing-public/${STABLE}/linux64/chrome-linux64.zip`) { res.writeHead(200, { 'content-length': CFT_ZIP.length, etag: `"${CFT_MD5.toString('hex')}"` }); if (req.method === 'HEAD') return res.end(); let i = 0; const step = () => { if (i >= CFT_ZIP.length) return res.end(); res.write(CFT_ZIP.subarray(i, i + 1024)); i += 1024; setTimeout(step, 60); }; return step(); }
    res.writeHead(404); res.end();
  });
  await new Promise((r) => cft.listen(CFT_PORT, '127.0.0.1', r));
  procs.add({ kill: () => cft.close() });
  { const vf = path.join(WT, 'src/browser-verbs.js'); const v0 = fs.readFileSync(vf, 'utf8'); const v1 = v0.replace("listHost: 'googlechromelabs.github.io', fileHost: 'storage.googleapis.com'", `listHost: 'cft.test:${CFT_PORT}', fileHost: 'storage.test'`); ok(v1 !== v0, 'the scratch copy\'s CHROME_BUILDS_RECORD names the reserved `.test` hosts of the loopback Chrome for Testing'); fs.writeFileSync(vf, v1); }
  // ── the server ──
  const PORT = await freePort(), CDP = await freePort();
  const baseEnv = { ...process.env };
  for (const k of Object.keys(baseEnv)) if (k.startsWith('AGENT_BROWSER_')) delete baseEnv[k];
  let journal = '';
  const srv = spawn(process.execPath, ['server.js'], { cwd: WT, env: { ...baseEnv, ...VNC_ENV, PATH: `${FAKE_BIN}:${baseEnv.PATH || '/usr/bin:/bin'}`, PORT: String(PORT), HOME: HOME_DIR, CLAUDE_CMD: STUB, VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '', VIBESPACE_TEST_EGRESS_MAP: 'cft.test=127.0.0.1,storage.test=127.0.0.1' }, stdio: ['ignore', 'pipe', 'pipe'] });
  procs.add(srv);
  srv.stdout.on('data', (d) => { journal = (journal + d).slice(-60000); }); srv.stderr.on('data', (d) => { journal = (journal + d).slice(-60000); });
  if (!ok(await until(() => journal.includes('Ready.'), 60000, 200), 'the scratch server booted', journal.slice(-800))) return;
  const api = async (method, p, body) => { const res = await fetch(`http://127.0.0.1:${PORT}${p}`, { method, headers: body !== undefined ? { 'Content-Type': 'application/json' } : {}, body: body !== undefined ? J(body) : undefined }); let json = null; try { json = await res.json(); } catch { } return { status: res.status, json }; };
  // ── one LIVE conversation through the real create path ──
  const ctl = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
  const frames = []; ctl.on('message', (d) => { if (d.length > 262144) return; try { frames.push(JSON.parse(String(d))); } catch { } });
  await new Promise((r, e) => { ctl.on('open', r); ctl.on('error', e); });
  ctl.send(J({ type: 'create', backend: 'claude', mode: 'chat', cwd: WORK, reqId: 'c-1', sessionName: 'Vendor work', cols: 80, rows: 24 }));
  await until(() => frames.some((m) => (m.type === 'created' || m.type === 'error') && m.reqId === 'c-1'), 25000, 100);
  const created = frames.find((m) => m.type === 'created' && m.reqId === 'c-1');
  const SID = created ? created.sessionId : null;
  if (!ok(!!SID, 'a live chat session created through the real path (stub claude behind the real wrapper)', frames.filter((m) => m.type === 'error').slice(-2))) return;
  // an existing profile (the row whose node must survive the create)
  const ex = await api('POST', '/api/browser/profiles', { label: 'Existing' });
  if (!ok(ex.status === 200 && ex.json.profile, 'an existing profile "Existing" (through the route)', ex.json)) return;
  // its directory written two days ago — the row's words ("last used 48 h ago") stay the same through the legs (a fresh
  // one says "written N min ago", which moves every 30 s and rebuilds the row by its own right)
  { const t2 = (Date.now() - 2 * 86400000) / 1000; fs.utimesSync(ex.json.profile.dir, t2, t2); }

  // ── chrome ──
  const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP}`, '--no-first-run', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--force-device-scale-factor=1', '--disable-background-timer-throttling', `--user-data-dir=${path.join(ROOT, 'chrome')}`, 'about:blank'], { stdio: 'ignore' });
  procs.add(chrome);
  let first = null;
  for (let i = 0; i < 120 && !first; i++) { try { first = (await (await fetch(`http://127.0.0.1:${CDP}/json`)).json()).find((x) => x.type === 'page'); } catch { } if (!first) await sleep(250); }
  if (!ok(!!first, 'chrome exposed a CDP page target')) return;
  const cdp = new WebSocket(first.webSocketDebuggerUrl, { maxPayload: 256 * 1024 * 1024 });
  await new Promise((r) => cdp.on('open', r));
  procs.add({ kill: () => { try { cdp.close(); } catch { } } });
  let seq = 0; const pend = new Map(); const errors = [];
  cdp.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } if (m.method === 'Runtime.exceptionThrown') errors.push(m.params?.exceptionDetails?.exception?.description || 'exception'); });
  const send = (method, params = {}) => new Promise((r) => { const id = ++seq; pend.set(id, r); cdp.send(J({ id, method, params })); });
  const ev = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails) throw new Error((r.result.exceptionDetails.exception?.description || 'eval failed').slice(0, 400)); return r.result?.result?.value; };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `(${PAGE_WRAPPERS.toString()})();` });
  let langScript = null;
  async function load(lang, w, h, mobile = false) {
    if (langScript) await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: langScript });
    langScript = (await send('Page.addScriptToEvaluateOnNewDocument', { source: lang === 'en' ? "try { localStorage.removeItem('vibespace.lang'); } catch {}" : `try { localStorage.setItem('vibespace.lang', ${J(lang)}); } catch {}` })).result.identifier;
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile });
    await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/?cb=${Date.now()}` });
    const up = await until(() => ev('(async () => { if (!window.app || !window.app.ready) return false; return await Promise.race([window.app.ready.then(() => true), new Promise((r) => setTimeout(() => r(false), 150))]); })()'), 40000, 200);
    if (!up) throw new Error('the app did not boot');
    await until(() => ev(`(() => { const s = document.getElementById('loading-screen'); return !s || getComputedStyle(s).display === 'none' || getComputedStyle(s).opacity === '0'; })()`), 10000);
    await until(() => ev('!!(window.app._browserProfiles && (window.app._browserProfiles.profiles || []).length)'), 20000, 150);
  }
  const frame = () => ev('new Promise((r) => { const t = setTimeout(r, 400); requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(() => { clearTimeout(t); r(); }, 40))); })');
  async function click(sel) {
    const r = await ev(`(() => { const e = document.querySelector(${J(sel)}); if (!e) return null; e.scrollIntoView({ block: 'nearest' }); const q = e.getBoundingClientRect(); const x = q.left + q.width / 2, y = q.top + q.height / 2; const h = document.elementFromPoint(x, y); return { x, y, hits: !!h && (h === e || e.contains(h) || h.contains(e)) }; })()`);
    if (!r || !r.hits) return false;
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: r.x, y: r.y });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: r.x, y: r.y, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r.x, y: r.y, button: 'left', clickCount: 1 });
    return true;
  }
  const shot = async (name) => { try { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(SHOTS, name + '.png'), Buffer.from(r.result.data, 'base64')); } catch { /* best effort */ } };
  const text = (sel) => ev(`(() => { const el = document.querySelector(${J(sel)}); return el ? el.textContent.replace(/\\s+/g, ' ').trim() : null; })()`);
  // design 015: a row's acts other than the primary live in its ⋯ menu (showContextMenu); each item carries its act's class
  const menuAct = async (pid, cls) => {
    if (!(await click(`.bprof-profile[data-profile-id=${J(pid)}] .bprof-more`))) return false;
    if (!(await until(() => ev(`!!document.querySelector('.context-menu .${cls}')`), 5000, 50))) return false;
    return click(`.context-menu .${cls}`);
  };
  const shotEl = async (name, sel) => { try { const q = await ev(`(() => { const r = document.querySelector(${J(sel)}).getBoundingClientRect(); return { x: r.left, y: r.top, width: r.width, height: r.height }; })()`); const r = await send('Page.captureScreenshot', { format: 'png', clip: { ...q, scale: 1 } }); fs.writeFileSync(path.join(SHOTS, name + '.png'), Buffer.from(r.result.data, 'base64')); } catch { /* best effort */ } };
  const openPanel = async () => { await ev('window.app.openBrowserProfiles()'); return until(() => ev("!!document.querySelector('.bprof-new') && !!document.querySelector('.bprof-profile')"), 15000, 100); };

  // ═══ ① New profile… → the row ═══
  console.log('— ① en 1280×800: New profile… → THE dialog → ONE POST → the row in place');
  await load('en', 1280, 800);
  ok(await openPanel(), 'the Agent browser panel opens with its New profile… button');
  await ev(`(() => { const r = document.querySelector('.bprof-profile[data-profile-id=${J(ex.json.profile.id)}]'); if (r) r.__badmKept = 1; })()`);
  // THE BUILD LIST IS ASKED AFTER THE PROVIDER ROWS DRAW (lane mirror-green-ui, 2.369.205): this leg used to judge the
  // builds the moment the rows existed — on the Actions runner (and once in a while here) the answer had not landed and
  // the section held only default + path, while the dialog SAID "The list of Chrome builds could not be read." about a
  // list it had not asked for yet. The race is made deterministic: the page's first builds answer is HELD until the
  // suite releases it — the waiting section is judged, then the answered one.
  await ev(`(() => { const f = window.fetch; window.__bprofFetch = f; let held = false; window.fetch = function (u, o) { if (!held && /\\/api\\/browser\\/builds(\\?|$)/.test(String(u))) { held = true; return new Promise((r) => { window.__bprofRelease = r; }).then(() => f.call(this, u, o)); } return f.call(this, u, o); }; })()`);
  ok(await click('.bprof-new'), 'New profile… is clicked (a real mouse)');
  const nProv = (await api('GET', '/api/browser/providers')).json.providers.length;
  const dlg = await until(() => ev(`(() => { const d = document.querySelector('#browser-new-profile-dialog'); if (!d) return null; const rows = [...d.querySelectorAll('.bnew-provider')]; return rows.length ? { rows: rows.map((r) => ({ id: r.dataset.provider, state: r.dataset.state, off: r.classList.contains('is-off'), install: !!(r.querySelector('.bnew-install') && getComputedStyle(r.querySelector('.bnew-install')).display !== 'none') })), builds: [...d.querySelectorAll('.bnew-build')].map((x) => x.dataset.key), who: !!d.querySelector('.pp-chip[data-key="everyone:*"]') && !d.querySelector('input[name=bnew-who]'), title: d.querySelector('.dialog-header h3').textContent, busy: d.querySelector('.bnew-builds-wrap')?.getAttribute('aria-busy') || null, notes: [...d.querySelectorAll('.bnew-builds .bbuild-note')].map((x) => x.textContent) } : null; })()`), 15000, 100);
  ok(dlg && dlg.title === 'New profile' && dlg.rows.length === nProv && dlg.rows.find((r) => r.id === 'chromium').state === 'ready', `the dialog draws EVERY provider as a row (${dlg && dlg.rows.length} of ${nProv}) — never hidden`, dlg);
  const ck = dlg && dlg.rows.find((r) => r.id === 'cloak');
  ok(ck && ck.state === 'needs-install' && ck.off && ck.install, 'CloakBrowser (not installed here): shown, not pickable, its ONE step offered (Install…)', ck);
  const asked = await ev(`typeof window.__bprofRelease === 'function'`);
  ok(dlg && asked && dlg.busy === 'true' && dlg.notes.length === 1 && dlg.notes[0] === 'Reading the list of Chrome builds…' && !dlg.builds.some((k) => k.startsWith('v:')), 'while the build list is ASKED and not answered (held): the section is aria-busy and says "Reading the list of Chrome builds…" — never "could not be read"', dlg && { asked, busy: dlg.busy, notes: dlg.notes, builds: dlg.builds });
  await ev(`(() => { if (window.__bprofRelease) window.__bprofRelease(); window.fetch = window.__bprofFetch; return true; })()`);
  const dlgB = await until(() => ev(`(() => { const d = document.querySelector('#browser-new-profile-dialog'); const w = d && d.querySelector('.bnew-builds-wrap'); if (!w || w.getAttribute('aria-busy') !== 'false') return null; return { builds: [...d.querySelectorAll('.bnew-build')].map((x) => x.dataset.key), notes: [...d.querySelectorAll('.bnew-builds .bbuild-note')].map((x) => x.textContent), who: !!d.querySelector('.pp-chip[data-key="everyone:*"]') && !d.querySelector('input[name=bnew-who]') }; })()`), 15000, 100);
  ok(dlgB && dlgB.builds[0] === 'default' && dlgB.builds.includes('v:151.0.7922.34') && dlgB.builds.includes('v:152.0.1.2') && !dlgB.notes.length && dlgB.who === true, 'the build section lists this computer\'s builds (default first) once the list answered; ALL AGENTS (the picker\'s All chip — no radios since the 2.369.202 integration) is the default', dlgB || dlg);
  await ev(`(() => { const i = document.querySelector('#browser-new-profile-dialog .bnew-label'); i.focus(); i.value = ''; })()`);
  await send('Input.insertText', { text: 'Vendor portal' });
  ok(await click('#browser-new-profile-dialog .bnew-build[data-key="v:151.0.7922.34"] input'), 'the build "Chrome 151.0.7922.34" is picked');
  await shot('1-new-profile-en');
  const exRow = () => ev(`fetch('/api/browser/housekeeping').then((r) => r.json()).then((h) => { const r = (h.profiles || []).find((x) => x.id === ${J(ex.json.profile.id)}); if (!r) return null; const { use, ...rest } = r; return JSON.stringify([rest, window.app.browserChipFor ? window.app.browserChipFor(r.id) : null]); })`);
  const exBefore = await exRow();
  const before = await ev('window.__badm.calls.length');
  ok(await click('#browser-new-profile-dialog .bnew-create'), 'Create');
  const row = await until(() => ev(`(() => { const r = [...document.querySelectorAll('.bprof-profile')].find((x) => /Vendor portal/.test(x.textContent)); return r ? { id: r.dataset.profileId, build: (r.querySelector('.bprof-build') || {}).textContent || null } : null; })()`), 15000, 100);
  const posts = await ev(`window.__badm.calls.slice(${before}).filter((c) => c.method === 'POST' && /\\/api\\/browser\\/(profiles|adopt)$/.test(c.url))`);
  ok(posts.length === 1 && posts[0].body.label === 'Vendor portal' && posts[0].body.provider === 'chromium' && posts[0].body.browser && posts[0].body.browser.version === '151.0.7922.34' && !('use' in posts[0].body), 'ONE POST to the profiles route with the build (no list for "All my conversations")', posts);
  ok(row && row.build === 'Chrome 151.0.7922.34 (pinned)', 'the panel gains the row and it says "Chrome 151.0.7922.34 (pinned)"', row);
  const exAfter = await exRow();
  ok(await ev(`(() => { const r = document.querySelector('.bprof-profile[data-profile-id=${J(ex.json.profile.id)}]'); return !!(r && r.__badmKept === 1); })()`), 'the row that was there is the SAME node after the create (keyed, in place)', exBefore === exAfter ? 'its facts did not change' : { exBefore, exAfter });
  ok(!(await ev('!!document.querySelector("#browser-new-profile-dialog")')), 'the dialog closed');
  const VP = row && row.id;

  // ═══ ② Change build… under a holder ═══
  console.log('— ② Change build… under a holder: the restart is said, the conversation told, the browser on the new build');
  if (VP) {
    const at = await api('POST', '/api/browser/attach', { sessionId: SID, profile: VP });
    ok(at.status === 200 && at.json.lease, 'the live conversation leases "Vendor portal" (its browser starts on build 151)', at.json);
    ok(await until(() => readLog(launchesLog).some((l) => l.ns === 'vs-' + VP && l.exe === B151), 8000), 'the launch ran the pinned build\'s executable');
    // its chat window open (where the card lands)
    await ev(`window.app.attachSession(${J(SID)}, 'Vendor work', ${J(WORK)}, { mode: 'chat', backend: 'claude' })`);
    await until(() => ev(`[...window.app.wm.windows.values()].some((x) => x.type === 'chat' && window.app.sessions.get(x.id) && window.app.sessions.get(x.id).sessionId === ${J(SID)})`), 15000, 150);
    await ev('window.app.openBrowserProfiles()');
    await until(() => ev(`!!document.querySelector('.bprof-profile[data-profile-id=${J(VP)}] .bprof-more')`), 15000, 100);
    ok(await menuAct(VP, 'bprof-build-btn'), 'Change build… from the row\'s ⋯ menu');
    const bd = await until(() => ev(`(() => { const d = document.querySelector('#browser-build-dialog'); if (!d) return null; return { title: d.querySelector('.dialog-header h3').textContent, rows: [...d.querySelectorAll('.bbuild-row')].map((r) => [r.dataset.key, !r.classList.contains('is-off')]), change: [...d.querySelectorAll('.bbuild-change')].map((x) => x.textContent), btn: d.querySelector('.bbuild-change-btn').textContent, now: (d.querySelector('.bbuild-now') || {}).textContent || null }; })()`), 15000, 100);
    ok(bd && bd.title === 'Chrome build for Vendor portal' && bd.btn === 'Change and restart' && /1 conversation\(s\) using it are told/.test(bd.change.join(' ')) && /running Chrome 151\.0\.7922\.34/.test(bd.now || ''), 'the dialog says the build it runs now, that the browser restarts and that 1 conversation is told — before the button', bd);
    ok(await click('#browser-build-dialog .bbuild-row[data-key="v:152.0.1.2"] input'), 'Chrome 152.0.1.2 picked');
    await shot('2-change-build-en');
    const b2 = await ev('window.__badm.calls.length');
    ok(await click('#browser-build-dialog .bbuild-change-btn'), 'Change and restart');
    const posted = await until(() => ev(`window.__badm.calls.slice(${b2}).filter((c) => c.method === 'POST' && /\\/build$/.test(c.url))`).then((x) => (x && x.length ? x : null)), 10000);
    ok(posted && posted.length === 1 && posted[0].body.choice.version === '152.0.1.2', 'ONE POST of the choice', posted);
    const chatCards = () => ev(`(() => { const cw = [...window.app.wm.windows.values()].find((x) => x.type === 'chat' && window.app.sessions.get(x.id) && window.app.sessions.get(x.id).sessionId === ${J(SID)}); return cw ? [...cw.element.querySelectorAll('.chat-peer-message, .chat-vs-notice')].map((e) => e.textContent.replace(/\\s+/g, ' ')) : null; })()`);
    const card = await until(async () => { const c = await chatCards(); return c && c.find((t) => /changed the Chrome build/.test(t)); }, 15000, 200);
    ok(card && /from Chrome 151\.0\.7922\.34 to Chrome 152\.0\.1\.2/.test(card) && /Vendor portal/.test(card), 'the conversation\'s chat shows the relaunch card — which browser, from / to, what to do (never a silent restart under a holder)', card || await chatCards());
    ok(await until(() => readLog(launchesLog).filter((l) => l.ns === 'vs-' + VP).at(-1)?.exe === B152, 8000), 'the browser relaunched on build 152');
    const callsVP = readLog(callsLog).filter((c) => c.ns === 'vs-' + VP && c.sess === 'vs-' + VP && !(c.argv[0] === 'session' && c.argv[1] === 'info'));
    const after = callsVP.slice(callsVP.findIndex((c) => c.exe === B152));
    ok(after.length >= 2 && after.every((c) => c.exe === B152), `after the change, EVERY launching call of the browser's own session carried build 152 (${after.map((c) => c.argv.slice(0, 2).join(' ')).join(' · ')})`, after);
    const rowNow = await until(() => ev(`(() => { const r = document.querySelector('.bprof-profile[data-profile-id=${J(VP)}] .bprof-build'); return r && /152\\.0\\.1\\.2/.test(r.textContent) ? r.textContent : null; })()`), 10000, 150);
    ok(rowNow && /Chrome 152\.0\.1\.2 \(pinned\) · running Chrome 152\.0\.1\.2/.test(rowNow), 'the row says the new build AND that the browser runs it (its own /json/version)', rowNow);
    await shot('2-after-en');
  }

  // ═══ ③ zh + ja ═══
  console.log('— ③ zh / ja: both dialogs in the device\'s language');
  for (const lang of ['zh', 'ja']) {
    await load(lang, 1280, 800);
    await openPanel();
    await click('.bprof-new');
    const d = await until(() => ev(`(() => { const d = document.querySelector('#browser-new-profile-dialog'); if (!d || !d.querySelector('.bnew-provider')) return null; return { title: d.querySelector('.dialog-header h3').textContent, heads: [...d.querySelectorAll('.bnew-section-head')].map((x) => x.textContent), create: d.querySelector('.bnew-create').textContent, cloak: (d.querySelector('.bnew-provider[data-provider=cloak] .bnew-note') || {}).textContent || '' }; })()`), 15000, 100);
    ok(d && d.title === tr(lang, 'New profile') && d.heads.includes(tr(lang, 'Browser')) && d.heads.includes(tr(lang, 'Chrome build')) && d.heads.includes(tr(lang, 'Who can use it')) && d.create === tr(lang, 'Create') && d.cloak === tr(lang, 'Not installed yet — install it first, then choose it.'),
      `${lang}: the New profile… dialog speaks the dictionary's words`, d);
    await shot(`3-new-profile-${lang}`);
    await ev("document.querySelector('#browser-new-profile-dialog .bnew-cancel').click()");
    if (VP) {
      await until(() => ev(`!!document.querySelector('.bprof-profile[data-profile-id=${J(VP)}] .bprof-more')`), 10000, 100);
      await menuAct(VP, 'bprof-build-btn');
      const b = await until(() => ev(`(() => { const d = document.querySelector('#browser-build-dialog'); return d ? { title: d.querySelector('.dialog-header h3').textContent, def: (d.querySelector('.bbuild-row[data-key=default] .bwho-answer-head') || {}).textContent || '' } : null; })()`), 15000, 100);
      ok(b && b.title === tr(lang, 'Chrome build for {label}', { label: 'Vendor portal' }) && b.def === tr(lang, "The browser CLI's default build"), `${lang}: Change build… speaks it too`, b);
      await shot(`3-change-build-${lang}`);
      await ev("document.querySelector('#browser-build-dialog .bbuild-cancel').click()");
    }
  }

  // ═══ ③b lane chrome-builds-download: Download another build… ═══
  console.log('— ③b Download another build…: the picker from Change build…, the chips and THE confirm in zh / ja / en, a download through the UI');
  if (VP) for (const lang of ['zh', 'ja', 'en']) {
    await load(lang, 1280, 800);
    await openPanel();
    await until(() => ev(`!!document.querySelector('.bprof-profile[data-profile-id=${J(VP)}] .bprof-more')`), 10000, 100);
    await menuAct(VP, 'bprof-build-btn');
    const row = await until(() => ev(`(() => { const r = document.querySelector('#browser-build-dialog .bbuild-download'); return r ? { head: r.querySelector('.bwho-answer-head').textContent, last: r === [...r.parentElement.children].at(-1) } : null; })()`), 15000, 100);
    ok(row && row.head === tr(lang, 'Download another build…') && row.last, `${lang}: Change build… ends with the row "Download another build…"`, row);
    const lists0 = cftHits.filter((h) => h.includes('last-known-good')).length;
    await click('#browser-build-dialog .bbuild-download');
    const pk = await until(() => ev(`(() => { const d = document.querySelector('#browser-build-dialog'); const rows = [...d.querySelectorAll('.bdl-row')]; if (!rows.length) return null; const st = rows.find((x) => x.dataset.version === ${J(STABLE)}); return { intro: d.querySelector('.bdl-intro').textContent, n: rows.length, head: st && st.querySelector('.bwho-answer-head').textContent, chips: st ? [...st.querySelectorAll('.bdl-chip')].map((x) => x.textContent) : [], rowsHidden: getComputedStyle(d.querySelector('.bbuild-rows')).display === 'none', free: (d.querySelector('.bdl-free') || {}).textContent || '' }; })()`), 20000, 150);
    ok(pk && pk.n === 4 && pk.rowsHidden && pk.intro === tr(lang, "Chrome for Testing builds, from Google. Once a profile is opened by a Chrome version, every older major is refused for it. Canary and Dev change weekly; Stable is what the browser CLI's own install picks.") && pk.head === `Stable · ${STABLE}` && cftHits.filter((h) => h.includes('last-known-good')).length === lists0 + 1
      && pk.chips.includes(tr(lang, 'Newer than the census ({census}): what it adds is refused by name while you drive the browser; everything else works', { census: '154.0.8037.57' })) && pk.chips.includes(tr(lang, "A profile opened with it can't switch to CloakBrowser later (Free {free} / Pro {pro}): switching down is refused", { free: 146, pro: 151 })),
      `${lang}: the picker opens IN the dialog (the rows step aside), reads the channel list once, four rows; Stable's chips say the census and CloakBrowser in the device's words`, pk);
    await shot(`3b-picker-${lang}`);
    await click(`#browser-build-dialog .bdl-row[data-version="${STABLE}"]`);
    const cf = await until(() => ev(`(() => { const p = [...document.querySelectorAll('p.dialog-hint')].find((x) => x.textContent.includes('storage.test')); if (!p) return null; let ov = p; while (ov.parentElement && ov.parentElement !== document.body) ov = ov.parentElement; const bs = [...ov.querySelectorAll('button')]; return { title: (ov.querySelector('h3') || {}).textContent || '', msg: p.textContent, buttons: bs.map((b) => b.textContent) }; })()`), 15000, 100);
    ok(cf && cf.title === tr(lang, 'Download Chrome {version}?', { version: STABLE }) && cf.msg.includes(tr(lang, "It is checked against the server's own length and checksum — Google publishes no separate one. Nothing restarts; it becomes a build you can pick. Chrome for Testing never auto-updates.")) && cf.buttons.includes(tr(lang, 'Download')),
      `${lang}: THE confirm — the version, the host, how it is checked, one Download button`, cf);
    await shot(`3b-confirm-${lang}`);
    if (lang !== 'en') {
      await ev(`(() => { const p = [...document.querySelectorAll('p.dialog-hint')].find((x) => x.textContent.includes('storage.test')); let ov = p; while (ov.parentElement && ov.parentElement !== document.body) ov = ov.parentElement; [...ov.querySelectorAll('button')].find((b) => b.textContent !== ${J(tr(lang, 'Download'))} && b.textContent.trim()).click(); })()`);
      await ev("document.querySelector('#browser-build-dialog .bdl-back').click()");
      const back = await until(() => ev("(() => { const d = document.querySelector('#browser-build-dialog'); return d && getComputedStyle(d.querySelector('.bbuild-rows')).display !== 'none' && !d.querySelector('.bdl-row'); })()"), 5000, 100);
      ok(back, `${lang}: Back puts the build rows back`);
      await ev("document.querySelector('#browser-build-dialog .bbuild-cancel').click()");
      continue;
    }
    await ev(`(() => { const p = [...document.querySelectorAll('p.dialog-hint')].find((x) => x.textContent.includes('storage.test')); let ov = p; while (ov.parentElement && ov.parentElement !== document.body) ov = ov.parentElement; [...ov.querySelectorAll('button')].find((b) => b.textContent === 'Download').click(); })()`);
    const prog = await until(() => ev("(() => { const p = document.querySelector('#browser-build-dialog .bdl-progress'); return p && p.style.display !== 'none' && /Downloading Chrome .* MB of .* MB|Unpacking|Checking|Verifying/.test(p.textContent) ? p.textContent : null; })()"), 15000, 50);
    ok(!!prog, 'en: the progress line while it downloads ("Downloading Chrome … N MB of M MB" → checking → unpacking → verifying)', prog);
    const picked = await until(() => ev(`(() => { const d = document.querySelector('#browser-build-dialog'); const r = d && d.querySelector('.bbuild-row[data-key="v:${STABLE}"] input'); return r && r.checked && !d.querySelector('.bdl-row') ? true : null; })()`), 30000, 150);
    ok(picked && fs.existsSync(path.join(HOME_DIR, '.agent-browser', 'browsers', `chrome-${STABLE}`, 'vibespace-download.json')), `en: it landed in the CLI's builds folder (witnessed) and Change build… came back with Chrome ${STABLE} picked`, journal.slice(-1500));
    await shot('3b-picked-en');
    await ev("document.querySelector('#browser-build-dialog .bbuild-cancel').click()");
  }

  // ═══ ⑧ design 015 (lane browser-panel-tidy): the panel — rect census, controls, walk, phone ═══
  console.log('— ⑧ design 015: the panel\'s grid (the rect census + its controls), the fold, the ⋯ menu, the phone');
  {
    const TGS = [];
    const titles = ['运维管理', '采购自动化', 'Design studio', 'Compliance', 'Research desk', 'Q4 launch', 'Finance ops', 'Vendor audit', 'Field sales', 'Support rota', 'Hiring loop', 'Legal review'];
    for (let i = 0; i < titles.length; i++) { const d = path.join(ROOT, 'tg-' + i); fs.mkdirSync(d, { recursive: true }); const r = await api('POST', '/api/tasks', { title: titles[i], folders: [{ path: d, recursive: true }] }); TGS.push(r.json && r.json.task ? r.json.task.id : null); }
    const LONG = '市场部共享账号（仅限周报与采购平台，勿登录个人微信或支付宝）Vendor-EU-01';
    const mk = async (label) => { const r = await api('POST', '/api/browser/profiles', { label }); return r.json && r.json.profile ? r.json.profile.id : null; };
    const HP = await mk(LONG), OD = await mk('office-devices'), DOOM = await mk('Doomed');
    const u0 = HP ? (await api('GET', `/api/browser/profiles/${HP}/use`)).json : null;
    const w12 = HP && u0 ? await api('PATCH', `/api/browser/profiles/${HP}`, { use: { mode: 'only', who: TGS.filter(Boolean).map((id) => ({ kind: 'task', id })) }, base: u0.base }) : null;
    ok(TGS.every(Boolean) && HP && OD && DOOM && w12 && w12.status === 200 && LONG.length >= 40, 'fixtures: twelve Task Groups; a 41-character name listing all twelve; "office-devices" (a paired machine\'s row, unmeasured — the page-side doctor); "Doomed"', w12 && w12.json);
    const EXID = ex.json.profile.id;
    const DOC = `window.__badm.doctor = (j) => { for (const p of j.profiles || []) if (p.id === ${J(OD)}) { p.host = 'Mac-one'; p.canBrowse = false; p.bytes = null; } }; true`;
    const panelAt = async (lang, w) => {
      await load(lang, w === 860 ? 1280 : 1720, w === 860 ? 800 : 1000);
      await ev(DOC);
      await openPanel();
      await ev(`[...window.app.wm.windows.values()].find((w) => w.type === 'browser-profiles')._browserProfiles.load().then(() => true)`); // a panel the layout replay reopened fetched before the doctor
      if (w !== 860) await ev(`(() => { const win = document.querySelector('.bprof').closest('.window'); win.style.left = '10px'; win.style.width = '${w}px'; return true; })()`);
      ok(await until(() => ev(`document.querySelectorAll('.bprof-profile').length >= 5 && !!document.querySelector('.bprof-profile[data-profile-id=${J(OD)}]:not(:has(.bprof-browse))')`), 10000, 100), `${lang} ${w}: the panel drew the fixtures (the paired machine's row without a primary)`);
      await frame(); await frame();
    };
    const census = () => ev(`(${PANEL_CENSUS.toString()})()`);
    for (const lang of ['zh', 'ja', 'en']) for (const w of [860, 1280]) {
      await panelAt(lang, w);
      const winW = await ev(`Math.round(document.querySelector('.bprof').closest('.window').getBoundingClientRect().width)`);
      const c = await census();
      ok(Math.abs(winW - w) <= 12 && c.rows >= 5 && !c.stacked && !c.problems.length, `${lang} ${w} px (the window ${winW} px): ${c.rows} rows — every cell's left edge = its column title's, every right edge inside the list, each l1 one line, the who line never wraps, nothing clipped or sideways`, c);
      const nm = await ev(`(() => { const e = document.querySelector('.bprof-profile[data-profile-id=${J(HP)}] .bprof-label'); return e ? { cut: e.scrollWidth > e.clientWidth + 1, title: e.title } : null; })()`);
      const wf = await ev(`(() => { const r = document.querySelector('.bprof-profile[data-profile-id=${J(HP)}]'); const shown = [...r.querySelectorAll('.bprof-who-chip')].filter((e) => getComputedStyle(e).display !== 'none').length; const m = r.querySelector('.bprof-who-more'); const n = m && getComputedStyle(m).display !== 'none' ? Number((m.textContent.match(/\\d+/) || [0])[0]) : 0; return { shown, n, tip: m ? m.title.split('\\n').length : 0, pill: m ? m.textContent : '' }; })()`);
      ok(nm && nm.cut && nm.title === LONG && wf.shown >= 1 && wf.shown + wf.n === 12 && wf.tip === wf.n && wf.pill === '+' + wf.n, `${lang} ${w}: the 41-character name is cut with its whole in the title; twelve chips = ${wf.shown} shown + "+${wf.n}" (its title names the ${wf.n})`, { nm, wf });
      if (w === 860) {
        // the WIDEST primary the panel can draw ("Open your browsing window" while you browse it) + the ⋯, measured in this
        // language, still fits the 860 px window's list with the grid's minimums (GRID + gaps — src/lib/browser-panel-model.js)
        const M = await import('../src/lib/browser-panel-model.js');
        const wide = await ev(`(() => { const a = document.querySelector('.bprof-profile .bprof-act'); const b = document.createElement('button'); b.className = 'file-tool-btn bprof-btn bprof-browse open'; b.textContent = ${J(tr(lang, 'Open your browsing window'))}; a.prepend(b); const px = b.getBoundingClientRect().width + 6 + a.querySelector('.bprof-more').getBoundingClientRect().width; b.remove(); return { px: Math.ceil(px), list: document.querySelector('.bprof-table').clientWidth }; })()`);
        ok(M.gridNeed(wide.px) <= wide.list, `${lang} 860: the widest acts (${wide.px} px: "${tr(lang, 'Open your browsing window')}" + ⋯) need ${M.gridNeed(wide.px)} px ≤ the list's ${wide.list} px — the grid never stacks at the width the panel opens at`, wide);
      }
      if (lang === 'zh') {
        await click(`.bprof-profile[data-profile-id=${J(VP)}] .bprof-chev`); await frame();
        await shotEl(`after-${w}-zh`, '.bprof');
        await click(`.bprof-profile[data-profile-id=${J(VP)}] .bprof-chev`);
      }
    }
    // CONTROLS (zh 860): the mockup's minimums; per-row grids with an `auto` acts column (the first mockup's fault)
    await panelAt('zh', 860);
    const ctl = async (css) => { await ev(`(() => { let s = document.getElementById('bp-control'); if (!s) { s = document.createElement('style'); s.id = 'bp-control'; document.head.appendChild(s); } s.textContent = ${J(css)}; return true; })()`); await frame(); await frame(); return census(); };
    const c1 = await ctl('.bprof-table { grid-template-columns: minmax(200px, 1.5fr) minmax(150px, 1fr) minmax(190px, 1.3fr) 140px 150px !important; }');
    ok(c1.problems.some((p) => /right edge/.test(p)), 'CONTROL: the mockup\'s minimums (200 · 150 · 190 · 140 · 150 + gaps) at 860 px put a cell past the list — the census goes red', c1.problems.slice(0, 3));
    const c2 = await ctl('.bprof-head, .bprof-table > .bprof-row.bprof-profile { grid-template-columns: minmax(150px, 1.5fr) minmax(110px, 1fr) minmax(150px, 1.3fr) 120px auto !important; }');
    ok(c2.problems.some((p) => /≠ the title/.test(p)), 'CONTROL: per-row grids with an `auto` acts column shift the columns row by row — the census goes red', c2.problems.slice(0, 3));
    await ev(`document.getElementById('bp-control').remove()`); await frame();
    ok(!(await census()).problems.length, 'the control style removed, the census is green again');
    // the walk ── a fold open survives a load (the same row node, still open)
    ok(await click(`.bprof-profile[data-profile-id=${J(VP)}] .bprof-chev`), 'the chevron of the running row (a real mouse)');
    const fo = await ev(`(() => { const r = document.querySelector('.bprof-profile[data-profile-id=${J(VP)}]'); r.__kept = 1; const f = r.querySelector('.bprof-fold'); return { open: !f.hidden, keys: [...f.querySelectorAll('.bprof-fold-item')].map((i) => i.dataset.key), h: Math.round(r.getBoundingClientRect().height) }; })()`);
    await ev(`[...window.app.wm.windows.values()].find((w) => w.type === 'browser-profiles')._browserProfiles.load().then(() => true)`); await frame();
    const fo2 = await ev(`(() => { const r = document.querySelector('.bprof-profile[data-profile-id=${J(VP)}]'); return { same: r.__kept === 1, open: !r.querySelector('.bprof-fold').hidden }; })()`);
    ok(fo.open && fo.keys.includes('build') && fo.keys.includes('records') && fo2.same && fo2.open, `the fold opens under the row (${fo.keys.join(' · ')}; the row ${fo.h} px) and a load keeps the SAME row with its fold open`, { fo, fo2 });
    await click(`.bprof-profile[data-profile-id=${J(VP)}] .bprof-chev`);
    // a who-change patches the cell in place
    await ev(`(() => { document.querySelector('.bprof-profile[data-profile-id=${J(HP)}] .bprof-who').__kept = 1; return true; })()`);
    const u1 = (await api('GET', `/api/browser/profiles/${HP}/use`)).json;
    const w11 = await api('PATCH', `/api/browser/profiles/${HP}`, { use: { mode: 'only', who: TGS.slice(1).map((id) => ({ kind: 'task', id })) }, base: u1.base });
    const wsame = await until(() => ev(`(() => { const r = document.querySelector('.bprof-profile[data-profile-id=${J(HP)}]'); const c = r.querySelector('.bprof-who'); const shown = [...r.querySelectorAll('.bprof-who-chip')].filter((e) => getComputedStyle(e).display !== 'none').length; const m = r.querySelector('.bprof-who-more'); const n = m && getComputedStyle(m).display !== 'none' ? Number((m.textContent.match(/\\d+/) || [0])[0]) : 0; return shown + n === 11 ? { same: c.__kept === 1, shown, n } : null; })()`), 10000, 150);
    ok(w11.status === 200 && wsame && wsame.same, 'a who-change (12 → 11 rows) PATCHES the who cell in place (the same element)', wsame);
    // the ⋯ menu's record check row PATCHes and re-reads
    const nCalls = await ev('window.__badm.calls.length');
    ok(await menuAct(EXID, 'bprof-record'), '⋯ → 录制屏幕 on the stopped row');
    const patch = await until(() => ev(`window.__badm.calls.slice(${nCalls}).find((c) => c.method === 'PATCH' && c.body && 'record' in c.body) || null`), 8000, 100);
    await until(() => ev(`(window.app._browserProfiles && true)`), 1000);
    await sleep(600);
    ok(await click(`.bprof-profile[data-profile-id=${J(EXID)}] .bprof-more`), 'the ⋯ again');
    const on = await until(() => ev(`(() => { const it = document.querySelector('.context-menu .bprof-record'); return it ? { on: !!it.parentElement.querySelector('.chan-menu-check-on'), items: [...document.querySelectorAll('.context-menu .bprof-mi')].map((x) => x.dataset.act), disabled: document.querySelectorAll('.context-menu .context-menu-item.disabled').length } : null; })()`), 5000, 80);
    ok(patch && patch.body.record === true && on && on.on && on.disabled === 0, `the record check row PATCHed {record: true} and the re-read row shows it checked; the menu (${on && on.items.join(' · ')}) has no disabled item`, { patch, on });
    await ev(`document.querySelectorAll('.context-menu').forEach((m) => m.remove())`);
    // a paired machine's row: no primary; its menu has no Stop and no record switch
    ok(await click(`.bprof-profile[data-profile-id=${J(OD)}] .bprof-more`), 'the paired machine\'s ⋯');
    const pm = await until(() => ev(`(() => { const r = document.querySelector('.bprof-profile[data-profile-id=${J(OD)}]'); const items = [...document.querySelectorAll('.context-menu .bprof-mi')].map((x) => x.dataset.act); return items.length ? { primary: !!r.querySelector('.bprof-browse'), items, size: r.querySelector('.bprof-size').textContent, chips: [...r.querySelectorAll('.bprof-chips > [data-key]')].map((c) => c.dataset.key) } : null; })()`), 5000, 80);
    ok(pm && !pm.primary && !pm.items.includes('stop') && !pm.items.includes('record') && pm.items.includes('delete') && pm.size === tr('zh', 'not measured') && pm.chips.includes('host'), 'a paired machine\'s row: no primary (absent, never greyed), no Stop / record in its menu, its machine chip, "未测量"', pm);
    await ev(`document.querySelectorAll('.context-menu').forEach((m) => m.remove())`);
    // Delete… from the ⋯ menu runs the two-step dialog — on a row whose fold is open
    await click(`.bprof-profile[data-profile-id=${J(DOOM)}] .bprof-chev`);
    ok(await menuAct(DOOM, 'bprof-forget'), '⋯ → 删除… (its fold open)');
    const dlg = await until(() => ev(`(() => { const b = [...document.querySelectorAll('.dialog button')].find((x) => x.textContent === ${J(tr('zh', 'Delete'))}); const h = [...document.querySelectorAll('.dialog h3, .dialog .dialog-header')].map((x) => x.textContent).join(' '); return b ? { h } : null; })()`), 8000, 80);
    ok(dlg && dlg.h.includes(tr('zh', 'Delete {label}?', { label: 'Doomed' })), 'the same confirm as before ("删除 Doomed？") — step one of two', dlg);
    await ev(`[...document.querySelectorAll('.dialog button')].find((x) => x.textContent === ${J(tr('zh', 'Delete'))}).click()`);
    const gone = await until(() => ev(`(() => !document.querySelector('.bprof-profile[data-profile-id=${J(DOOM)}]') && [...document.querySelectorAll('.bprof-forgotten')].some((r) => r.textContent.includes('Doomed')))()`), 12000, 150);
    ok(gone, 'the row left the list and waits under 已删除（搁置） — the second step stays the user\'s click', gone);
    // the ⓘ: the retention sentence on press, gone on an outside press
    ok(await click('.bprof-info'), 'the ⓘ');
    const pop = await until(() => ev(`(() => { const p = document.querySelector('.bprof-info-pop'); return p ? { text: p.textContent, inside: p.getBoundingClientRect().right <= document.querySelector('.bprof').getBoundingClientRect().right + 1 } : null; })()`), 4000, 60);
    await click('.bprof-summary');
    const popGone = await until(() => ev(`!document.querySelector('.bprof-info-pop')`), 4000, 60);
    ok(pop && pop.inside && pop.text === (await text('.bprof-hint')) && popGone, 'the ⓘ shows the retention sentence (the Maintenance text, word for word) inside the panel and an outside press closes it', pop);
    const mt = await ev(`(() => { const s = [...document.querySelectorAll('.bprof-section')].at(-1); return { title: s.querySelector('.bprof-section-title').textContent, sweep: !!s.querySelector('.bprof-sweep button'), hint: !!s.querySelector('.bprof-hint'), cli: !!s.querySelector('.bprof-cli') }; })()`);
    ok(mt.title === tr('zh', 'Maintenance') && mt.sweep && mt.hint && mt.cli, '维护 is the last section: the Browser CLI row, the last sweep + 立即清扫, the retention text', mt);
    // 390 px: the re-flow
    await load('zh', 390, 844, true);
    await ev(DOC);
    await openPanel();
    await ev(`[...window.app.wm.windows.values()].find((w) => w.type === 'browser-profiles')._browserProfiles.load().then(() => true)`); // a panel the layout replay reopened fetched before the doctor
    await until(() => ev(`document.querySelectorAll('.bprof-profile').length >= 4`), 10000, 100);
    await frame(); await frame();
    const ph = await ev(`(${PHONE_ROWS.toString()})()`);
    ok(ph.rows >= 4 && !ph.problems.length && (await ev(`!!document.querySelector('.bprof.bprof-stacked')`)), `390 px: ${ph.rows} rows re-flowed — the titles hidden, each row's five lines in order, the acts on the name's line, nothing sideways`, ph);
    await shotEl('after-390-zh', '.bprof');
  }

  // ═══ ④ 390 px ═══
  console.log('— ④ a 390 px phone: both dialogs inside the screen');
  await load('en', 390, 844, true);
  await ev('window.app.openBrowserProfiles()');
  await until(() => ev("!!document.querySelector('.bprof-new')"), 15000, 100);
  await ev("document.querySelector('.bprof-new').click()");
  await until(() => ev("!!document.querySelector('#browser-new-profile-dialog .bnew-provider')"), 15000, 100);
  await frame();
  const r1 = await ev(`(${RECTS.toString()})('#browser-new-profile-dialog .dialog')`);
  ok(r1 && r1.n > 10 && !r1.problems.length, `390 px: the New profile… dialog — ${r1 && r1.n} parts inside it and the screen, nothing sideways, no clipped button`, r1);
  await shot('4-new-profile-390');
  await ev("document.querySelector('#browser-new-profile-dialog .bnew-cancel').click()");
  if (VP) {
    await until(() => ev(`!!document.querySelector('.bprof-profile[data-profile-id=${J(VP)}] .bprof-more')`), 10000, 100);
    await menuAct(VP, 'bprof-build-btn');
    await until(() => ev("!!document.querySelector('#browser-build-dialog .bbuild-row')"), 15000, 100);
    await frame();
    const r2 = await ev(`(${RECTS.toString()})('#browser-build-dialog .dialog')`);
    ok(r2 && r2.n > 5 && !r2.problems.length, `390 px: Change build… — ${r2 && r2.n} parts inside it and the screen`, r2);
    await shot('4-change-build-390');
  }
  ok(!errors.length, 'no uncaught page error in any leg', errors.slice(0, 3));
})();

// ═══ ⑤ the REAL binary ═══
console.log('— ⑤ the real agent-browser over a scratch HOME (browsers/ = a symlink to the account\'s): a pinned build reaches it on every call');
await (async () => {
  const V = require('../src/browser-verbs.js');
  const isShim = (p) => { try { return fs.readFileSync(p, 'utf8').slice(0, 512).includes(V.SHIM_MARKER); } catch { return false; } };
  const real = V.resolveRealBinary({ PATH: process.env.PATH || '', shimDirs: [path.join(repo, 'data', 'bin'), path.join(os.homedir(), '.vibespace', 'bin')], exists: (p) => { try { const st = fs.statSync(p); return st.isFile() && (st.mode & 0o111) !== 0; } catch { return false; } }, isShim });
  const ACCOUNT_BROWSERS = path.join(os.homedir(), '.agent-browser', 'browsers');
  const B = require('../src/browser-builds.js');
  const L = B.listBuilds({ homeDir: os.homedir() });
  const usable = L.ok ? L.builds.filter((b) => b.usable) : [];
  if (!real.ok) { skip('no real agent-browser on PATH (beside the shim) — the real-binary leg needs one'); return; }
  let ver = ''; try { ver = execFileSync(real.path, ['--version'], { encoding: 'utf8', env: Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('AGENT_BROWSER_'))) }); } catch { ver = ''; }
  if (V.versionDrift(ver)) { skip(`the real agent-browser here is ${ver.trim() || 'unknown'}, not the measured ${V.TABLE_VERSION}`); return; }
  if (usable.length < 2) { skip(`fewer than two runnable Chrome builds in ${ACCOUNT_BROWSERS} (${usable.map((b) => b.version).join(', ') || 'none'}) — the leg pins an OLDER one than the CLI's default`); return; }
  const older = usable[usable.length - 1]; // the oldest; the CLI's own default is the newest it has
  const HOME_R = path.join(ROOT, 'real-home');
  fs.mkdirSync(path.join(HOME_R, '.agent-browser'), { recursive: true });
  fs.symlinkSync(ACCOUNT_BROWSERS, path.join(HOME_R, '.agent-browser', 'browsers')); // nothing else of the account's: no profile, no config
  // this scratch machine's OWN config (written here, never copied): measured on this box (Ubuntu, AppArmor-restricted user
  // namespaces), a Chrome for Testing build dies "No usable sandbox!" without --no-sandbox — the CLI's DEFAULT build exactly
  // like a pinned one; the keeper carries the machine config's `args` (sanctionedConfig) on every call
  fs.writeFileSync(path.join(HOME_R, '.agent-browser', 'config.json'), JSON.stringify({ args: '--no-sandbox' }));
  const K = require('../src/server/browser-keeper.js');
  const D = path.join(ROOT, 'real-data'); fs.mkdirSync(D, { recursive: true });
  // verify r2 (G2): the runtime dir is the scratch's too — inherited, the real CLI put its daemon's sockets under the
  // account's own XDG_RUNTIME_DIR (the live instance's agent-browser tree) on every heavy run
  const XDG_R = path.join(ROOT, 'real-xdg'); fs.mkdirSync(XDG_R, { recursive: true, mode: 0o700 });
  const env = { ...Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('AGENT_BROWSER_'))), HOME: HOME_R, XDG_RUNTIME_DIR: XDG_R, PATH: `${path.dirname(real.path)}:${path.dirname(process.execPath)}:/usr/bin:/bin` };
  const k = K.create({ dataDir: D, homeDir: HOME_R, env: () => env, serverSetting: (x) => ({ 'browser.headed': 'no', 'browser.noDisplayMode': 'headless' })[x], liveKeys: () => new Set(), install: false, tickMs: 3600e3, log: { log() { }, warn() { }, error() { } }, hostKnown: () => false });
  const p = k.createProfile({ label: 'Real pinned', browser: { kind: 'build', version: older.version } });
  let started = null, err = null;
  try { started = await k.start(p.id, { why: 'real-binary leg' }); } catch (e) { err = e; }
  { const sd = started && started.socketDir ? String(started.socketDir) : ''; ok(!started || sd.startsWith(XDG_R + '/'), `the real CLI's sockets live under the scratch runtime dir (${sd || 'none'}), never the account's`); }
  if (!ok(!!started && started.state === 'ready', `the real CLI launched the profile pinned to Chrome ${older.version}`, err && (err.code + ': ' + err.message))) { try { await k.stop(p.id, { why: 'user' }); } catch { } return; }
  const rec = k._reg().browsers[p.id];
  const rb = k.list().browsers[p.id].runningBuild;
  ok(rb === older.version, `the RUNNING browser's own /json/version says ${rb} — the pinned ${older.version}, not the CLI's default ${usable[0].version} (the env reached the real CLI on the launch AND on its own get cdp-url after it — a call without it would have relaunched the default)`, { rb, cdpBrowser: rec.cdpBrowser });
  let cmd = ''; try { cmd = rec.browser && rec.browser.pid ? fs.readFileSync(`/proc/${rec.browser.pid}/cmdline`, 'utf8').split('\0')[0] : ''; } catch { cmd = ''; }
  ok(!cmd || cmd.includes('chrome-' + older.version), `…and the browser process the keeper captured runs that build's program (${cmd || 'not readable'})`);
  try { await k.stop(p.id, { why: 'user' }); } catch { /* the cleanup ends it */ }
})();

// ═══ ⑥ verify r2 (H1): the REAL agent-browser, TWO versions — a running browser keeps the CLI it was launched with ═══
// The coordinator's ruling: a `browser.cli` switch never restarts a running browser — the 0.38.x daemon restarts itself and
// its Chrome for a client of another version (measured 2026-10-01: "Daemon version mismatch detected, restarting…", the
// Chrome pid replaced, the active tab back on the first). The whole chain is real: the keeper + the routes in-process, the
// shipped vibespace-browser over them, two real CLI versions, a real headless Chrome (scratch HOME + XDG_RUNTIME_DIR).
console.log('— ⑥ the real agent-browser, two versions: a `browser.cli` switch never restarts a running browser (verify r2, H1)');
await (async () => {
  const V = require('../src/browser-verbs.js');
  const isShim = (p) => { try { return fs.readFileSync(p, 'utf8').slice(0, 512).includes(V.SHIM_MARKER); } catch { return false; } };
  const real = V.resolveRealBinary({ PATH: process.env.PATH || '', shimDirs: [path.join(repo, 'data', 'bin'), path.join(os.homedir(), '.vibespace', 'bin')], exists: (p) => { try { const st = fs.statSync(p); return st.isFile() && (st.mode & 0o111) !== 0; } catch { return false; } }, isShim });
  const noAB = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('AGENT_BROWSER_')));
  const verOf = (bin) => { try { return (execFileSync(bin, ['--version'], { encoding: 'utf8', env: noAB }).match(/(\d+\.\d+\.\d+)/) || [])[1] || null; } catch { return null; } };
  if (!real.ok) { skip('no real agent-browser on PATH (beside the shim)'); return; }
  const cur = verOf(real.path);
  const PREV = process.env.VIBESPACE_TEST_PREV_CLI || '';
  if (!PREV) { skip(`VIBESPACE_TEST_PREV_CLI is unset — this leg needs a SECOND agent-browser version beside the one on PATH (${cur}): an npm prefix, e.g. \`npm install --prefix <dir> --no-save --ignore-scripts agent-browser@0.38.0\``); return; }
  let pv = null; try { pv = JSON.parse(fs.readFileSync(path.join(PREV, 'node_modules', 'agent-browser', 'package.json'), 'utf8')).version; } catch { pv = null; }
  if (!pv || pv === cur) { skip(`VIBESPACE_TEST_PREV_CLI (${PREV}) holds ${pv || 'no agent-browser'} — a version other than the one on PATH (${cur}) is needed`); return; }
  const ACCOUNT_BROWSERS = path.join(os.homedir(), '.agent-browser', 'browsers');
  const H = path.join(ROOT, 'h1-home'); fs.mkdirSync(path.join(H, '.agent-browser'), { recursive: true });
  fs.symlinkSync(ACCOUNT_BROWSERS, path.join(H, '.agent-browser', 'browsers'));
  fs.writeFileSync(path.join(H, '.agent-browser', 'config.json'), JSON.stringify({ args: '--no-sandbox' })); // this scratch machine's own (⑤'s measured reason)
  const XDG = path.join(ROOT, 'h1-xdg'); fs.mkdirSync(XDG, { recursive: true, mode: 0o700 });
  const D = path.join(ROOT, 'h1-data'), T = path.join(D, 'browser-tools'); fs.mkdirSync(T, { recursive: true });
  // the previous version as VibeSpace's own install of it: its folder + the witness the keeper writes after the program said its version
  const PRE = path.join(T, V.cliInstallDirName(pv)); execFileSync('cp', ['-a', PREV, PRE]);
  const NAT = path.join(PRE, 'node_modules', 'agent-browser', 'bin', V.cliNativeName({ platform: process.platform, arch: process.arch, musl: false }));
  fs.chmodSync(NAT, 0o755);
  if (!ok(verOf(NAT) === pv, `the previous CLI says ${pv}`)) return;
  fs.writeFileSync(path.join(PRE, 'verified.json'), JSON.stringify({ version: pv, path: NAT, at: Date.now(), says: pv }));
  const pages = http.createServer((req, res) => { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(`<title>${req.url.slice(1) || 'root'}</title>${req.url}`); });
  servers.add(pages);
  const PP = await new Promise((r) => pages.listen(0, '127.0.0.1', () => r(pages.address().port)));
  const env = { ...noAB, HOME: H, XDG_RUNTIME_DIR: XDG, PATH: `${path.dirname(real.path)}:${path.dirname(process.execPath)}:/usr/bin:/bin` };
  const st = { 'browser.cli': pv, 'browser.headed': 'no', 'browser.noDisplayMode': 'headless' };
  const KEY = 'bk-0000a1b1', KEY2 = 'bk-0000a1b2';
  const pairs = (k2) => [`AGENT_BROWSER_SESSION=vs-${k2}`, `AGENT_BROWSER_NAMESPACE=vs-${k2}`, 'AGENT_BROWSER_IDLE_TIMEOUT_MS=0'];
  const K = require('../src/server/browser-keeper.js');
  const k = K.create({ dataDir: D, homeDir: H, env: () => env, serverSetting: (x) => st[x], liveKeys: () => new Set([KEY, KEY2]), install: false, tickMs: 3600e3, log: { log() { }, warn() { }, error() { } }, hostKnown: () => false });
  const express = require('express'); const R = require('../src/routes/browser.js');
  const TOK = 'vsst_' + 'r'.repeat(24), TOK2 = 'vsst_' + 's'.repeat(24);
  const app = express(); app.use(express.json());
  R.setup({ keeper: k, activeSessions: new Map([['sess-r1', { agentToken: TOK, _browserKey: KEY, _browserEnv: pairs(KEY), _browserVariant: 'N', name: 'Kept' }], ['sess-r2', { agentToken: TOK2, _browserKey: KEY2, _browserEnv: pairs(KEY2), _browserVariant: 'N', name: 'New' }]]), browserEnv: () => null });
  app.use(R.router);
  const api = await new Promise((r) => { const s2 = app.listen(0, '127.0.0.1', () => r(s2)); });
  servers.add(api);
  const BIN = path.join(D, 'bin'); fs.mkdirSync(BIN, { recursive: true });
  fs.copyFileSync(path.join(repo, 'data', 'bin', 'vibespace-browser'), path.join(BIN, 'vibespace-browser'));
  fs.copyFileSync(path.join(repo, 'src', 'browser-verbs.js'), path.join(BIN, 'vibespace-browser-verbs.js'));
  fs.copyFileSync(path.join(repo, 'src', 'browser-stuck.js'), path.join(BIN, 'vibespace-browser-stuck.js'));
  const PRELOAD = path.join(ROOT, 'h1-passwd.cjs'); fs.writeFileSync(PRELOAD, `const os = require('os'); const real = os.userInfo; os.userInfo = (o) => ({ ...real(o), homedir: ${JSON.stringify(H)} });\n`);
  const agent = (tok, argv) => new Promise((resolve) => { const c = spawn(process.execPath, ['--require', PRELOAD, path.join(BIN, 'vibespace-browser'), ...argv], { env: { PATH: env.PATH, HOME: H, XDG_RUNTIME_DIR: XDG, VIBESPACE_API: `http://127.0.0.1:${api.address().port}`, VIBESPACE_SESSION_TOKEN: tok }, stdio: ['ignore', 'pipe', 'pipe'] }); procs.add(c); let so = '', se = ''; c.stdout.on('data', (d) => { so += d; }); c.stderr.on('data', (d) => { se += d; }); c.on('exit', (code) => { procs.delete(c); resolve({ code, so: so.trim(), se: se.trim() }); }); });
  const exeOf = (pid) => { try { return fs.readlinkSync(`/proc/${pid}/exe`); } catch { return null; } };
  const recOf = (bk) => { const e = k.ephemeralFor(bk); return e ? k.browserOf(e.profileId) : null; };
  try {
    let a = await agent(TOK, ['open', `http://127.0.0.1:${PP}/one`]);
    if (!ok(a.code === 0, `conversation 1's first command started its browser under the pinned ${pv}`, a)) return;
    a = await agent(TOK, ['tab', 'new', `http://127.0.0.1:${PP}/two`]);
    const r0 = recOf(KEY);
    const daemon0 = r0.pid, chrome0 = r0.browser && r0.browser.pid;
    ok(a.code === 0 && r0.cli && r0.cli.version === pv && exeOf(daemon0) === NAT && chrome0, `…its daemon runs ${pv} (its own program, /proc), its Chrome pid ${chrome0}; tab two is the current tab`, { cli: r0.cli, exe: exeOf(daemon0), a });
    st['browser.cli'] = 'path'; // THE SWITCH — the panel's "Use the one on PATH"
    const row = (await k.cliFacts()).running;
    ok(row.previous === 1 && row.versions.join() === pv, `the row: 1 browser still on the previous CLI (${pv})`, row);
    a = await agent(TOK, ['get', 'title']);
    const r1 = recOf(KEY);
    ok(a.code === 0 && a.so.split('\n').pop() === 'two' && !/version mismatch/i.test(a.se), `the conversation's NEXT command after the switch answers "two" with no "Daemon version mismatch, restarting…"`, a);
    ok(r1.pid === daemon0 && exeOf(daemon0) === NAT && r1.browser && r1.browser.pid === chrome0 && fs.existsSync(`/proc/${chrome0}`), `…its daemon (pid ${daemon0}, ${pv}) and its Chrome (pid ${chrome0}) are the ones it launched`, { daemon: [daemon0, r1.pid, exeOf(daemon0)], chrome: [chrome0, r1.browser && r1.browser.pid] });
    a = await agent(TOK, ['tab', 'list']);
    ok(a.code === 0 && /→ \[t2\][^\n]*two/.test(a.so), '…and the active tab is still tab 2', a.so);
    a = await agent(TOK2, ['open', `http://127.0.0.1:${PP}/three`]);
    const rN = recOf(KEY2);
    ok(a.code === 0 && rN && rN.cli && rN.cli.version === cur && exeOf(rN.pid) && exeOf(rN.pid) !== NAT, `a NEW launch (conversation 2) runs the current CLI ${cur}`, { cli: rN && rN.cli, exe: rN && exeOf(rN.pid) });
    fs.rmSync(PRE, { recursive: true, force: true }); // the previous install REMOVED while conversation 1's browser runs on it
    a = await agent(TOK, ['get', 'title']);
    const r2 = recOf(KEY);
    ok(a.code === 1 && /\[browser_cli_gone\]/.test(a.se) && /restart it to use the current CLI/.test(a.se) && !/version mismatch/i.test(a.se), '…removed: the next command is refused BY NAME (browser_cli_gone, "restart it to use the current CLI") — never a silent fall to PATH', a.se);
    ok(r2.pid === daemon0 && fs.existsSync(`/proc/${daemon0}`) && fs.existsSync(`/proc/${chrome0}`), '…and its daemon and Chrome are untouched (they keep their pages until they stop)', { daemon0, chrome0 });
    ok((await k.cliFacts()).running.gone === 1, '…the row: 1 browser runs on a CLI that is no longer installed');
  } finally {
    for (const bk of [KEY, KEY2]) { const e = k.ephemeralFor(bk); if (e) { try { await k.stop(e.profileId, { why: 'user' }); } catch { } } }
    try { await new Promise((r) => api.close(r)); } catch { } try { await new Promise((r) => pages.close(r)); } catch { }
  }
})();

// ═══ ⑦ verify r2 (B5): the REAL agent-browser + Chrome — a new build that starts, then closes within seconds ═══
// Change build… to a build that launches and dies at 3 s (a scratch build folder whose `chrome` runs the account's newest
// measured Chrome under `timeout -s KILL 3`): the conversation is told "changed", then — the keeper's tick sees the loss
// inside the settle window — the browser falls back to the build it replaced, "fell-back" is told, ONE For-you notice names
// the build, the tab reopened once per launch (the journal's own count). Measured before the fix: healed 3× on the dead
// build, browser_unstable, the conversation told only "changed".
console.log('— ⑦ the real agent-browser: a Chrome build that starts and closes within seconds falls back, and says so (verify r2, B5)');
await (async () => {
  const V = require('../src/browser-verbs.js');
  const isShim = (p) => { try { return fs.readFileSync(p, 'utf8').slice(0, 512).includes(V.SHIM_MARKER); } catch { return false; } };
  const real = V.resolveRealBinary({ PATH: process.env.PATH || '', shimDirs: [path.join(repo, 'data', 'bin'), path.join(os.homedir(), '.vibespace', 'bin')], exists: (p) => { try { const st = fs.statSync(p); return st.isFile() && (st.mode & 0o111) !== 0; } catch { return false; } }, isShim });
  if (!real.ok) { skip('no real agent-browser on PATH (beside the shim)'); return; }
  const BBm = require('../src/browser-builds.js');
  const L = BBm.listBuilds({ homeDir: os.homedir() });
  const usable = L.ok ? L.builds.filter((b) => b.usable) : [];
  let timeoutBin = null; for (const d of ['/usr/bin', '/bin']) { if (fs.existsSync(path.join(d, 'timeout'))) { timeoutBin = path.join(d, 'timeout'); break; } }
  if (!usable.length || !timeoutBin) { skip(`needs a measured Chrome build in the account's browsers/ (${usable.length}) and coreutils timeout (${timeoutBin || 'none'})`); return; }
  const chromeOf = path.join(os.homedir(), '.agent-browser', 'browsers', 'chrome-' + usable[0].version, 'chrome');
  const H = path.join(ROOT, 'b5-home'); const HB = path.join(H, '.agent-browser', 'browsers'); fs.mkdirSync(HB, { recursive: true });
  fs.writeFileSync(path.join(H, '.agent-browser', 'config.json'), JSON.stringify({ args: '--no-sandbox' }));
  const BAD = '999.0.0.1'; fs.mkdirSync(path.join(HB, 'chrome-' + BAD), { recursive: true });
  fs.writeFileSync(path.join(HB, 'chrome-' + BAD, 'chrome'), `#!/bin/sh\nexec ${timeoutBin} -s KILL 3 ${chromeOf} "$@"\n`, { mode: 0o755 });
  const XDG = path.join(ROOT, 'b5-xdg'); fs.mkdirSync(XDG, { recursive: true, mode: 0o700 });
  const RH = path.join(ROOT, 'b5-runhome'); fs.mkdirSync(path.join(RH, '.agent-browser'), { recursive: true }); fs.symlinkSync(path.join(os.homedir(), '.agent-browser', 'browsers'), path.join(RH, '.agent-browser', 'browsers'));
  const env = { ...Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('AGENT_BROWSER_'))), HOME: RH, XDG_RUNTIME_DIR: XDG, PATH: `${path.dirname(real.path)}:${path.dirname(process.execPath)}:/usr/bin:/bin` };
  const lines = [], todos = [], told = [];
  const K = require('../src/server/browser-keeper.js');
  const KEY = 'bk-0000a7b5';
  const k = K.create({ dataDir: path.join(ROOT, 'b5-data'), homeDir: H, env: () => env, serverSetting: (x) => ({ 'browser.headed': 'no', 'browser.noDisplayMode': 'headless' })[x], liveKeys: () => new Set([KEY]), install: false, tickMs: 1000, log: { log: (...a) => lines.push(a.join(' ')), warn: (...a) => lines.push(a.join(' ')), error() { } }, hostKnown: () => false, userTodos: { add: (w, item) => { todos.push(item.text); return { id: 'u' + todos.length }; } } });
  let p = null;
  try {
    p = k.createProfile({ label: 'Settling' });
    await k.start(p.id, { why: 'real B5 leg' });
    await k.attach({ profileId: p.id, browserKey: KEY, sessionId: 'sess-b5', by: 'user' });
    k.onRelaunch((ev) => told.push(ev.outcome));
    const r = await k.setBrowserChoice({ profileId: p.id, choice: { kind: 'build', version: BAD }, by: 'user' });
    ok(r.ok && r.restarted && told.join() === 'changed', `Change build… to ${BAD} (it starts, then closes at 3 s): restarted, the conversation told "changed"`, { r: r.restarted, told });
    const done = await until(() => told.length >= 2, 30000, 200);
    ok(!!done && told.join() === 'changed,fell-back' && !(k.profile(p.id).browser) && k.list().browsers[p.id].state === 'ready', '…its loss inside the settle window FALLS BACK: "fell-back" told, the choice back on the default build, the browser running again', { told, choice: k.profile(p.id).browser || 'default', state: k.list().browsers[p.id].state });
    const reopenLines = lines.filter((l) => /tab\(s\) reopened/.test(l));
    ok(reopenLines.length === 2 && reopenLines.every((l) => /1\/1 tab\(s\) reopened/.test(l)), '…the conversation\'s tab reopened ONCE per launch (the change\'s, the fall-back\'s)', reopenLines);
    ok(todos.length === 1 && new RegExp(`Chrome ${BAD.replace(/\./g, '\\.')} closed within seconds of starting — it is back on the default build`).test(todos[0]) && !lines.some((l) => /browser_unstable|keeps closing/.test(l)), '…ONE For-you notice names the build that closed; never healed on it until browser_unstable', { todos, unstable: lines.filter((l) => /unstable/.test(l)) });
  } catch (e) { ok(false, 'the real B5 leg ran', String(e && e.stack || e).slice(0, 400)); }
  finally { try { if (p) await k.stop(p.id, { why: 'user' }); } catch { } try { k.shutdown?.(); } catch { } }
})();

console.log(fail ? `FAIL (${fail})${skipped ? ` · ${skipped} skipped` : ''}` : `ALL PASS (${pass})${skipped ? ` · ${skipped} skipped` : ''}`);
process.exit(fail ? 1 : 0);

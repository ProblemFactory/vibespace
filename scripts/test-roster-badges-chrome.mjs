#!/usr/bin/env node
// THE OWNER'S ROSTER PICTURE, DRAWN AND MEASURED (hotfix 2.369.401 — the owner 2026-11-13, a picture of the Agents roster on
// 2.369.400 in zh, four account rows, and then the word «不如还是继续用 h/d»). HEAVY (a worktree hub + headless Chrome).
// The REAL Agents panel over four subscriptions in the shape of that picture (no 5-hour window: the 7d ring and the Fable cap
// ring), their caps read hours or days before their siblings:
//   row 1 — badge 2d, the counts under the rings 7d, the row's own age 97m
//   row 2 — badge 41h (the widest two-digit hours a badge shows: at 48 h it is 2d), counts 4d
//   row 3 — badge 2d, counts 41h, the row's age 27h
//   row 4 — badge 4d, counts 21h, the row's age 24h
// in en, zh AND ja, in this box's face and the runner's (DejaVu first — SharedContext/vibespace-actions-runner-repro.md), at a
// wide panel and at the narrowest list that still draws rings (341 px — at 340 its container query draws one pill). MEASURED:
//   ① every badge is ONE line and crosses neither its ring's label nor another ring;
//   ② every badge is INSIDE the box that clips its row (the nearest scrolling ancestor) — the first row with the list at its top;
//   ③ ONE WIDGET, ONE UNIT STYLE: the badge (the reading's age), the counts under the rings (the time to the reset) and the
//      row's own age are MARKS — m / h / d in every language («41h», «2d», «97m»); the ring's tooltip keeps the sentence in the
//      interface's words («…41小时前读取»);
//   ④ the row's own age is whole (not cut, not ellipsised) — read off the FIXTURE'S clock (the page's Date starts at the seed).
// VS_ROSTER_BADGES_PNG=<dir> keeps the pictures. NETWORK SAFETY: every credential is fabricated and EXPIRED. SKIPs without chrome.
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePorts, scratch, scratchHome, ONBOARDED_SOURCE, vncEnv, endRootedProcesses } from './scratch.mjs';
const VNC_ENV = await vncEnv();
const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome/chromium'); process.exit(0); }
const PNG = process.env.VS_ROSTER_BADGES_PNG ? path.resolve(process.env.VS_ROSTER_BADGES_PNG) : scratch('roster-badges-shots');
fs.mkdirSync(PNG, { recursive: true });
const FACES = ['box', 'runner'], LANGS = ['zh', 'en', 'ja'];
const [PORT, ...CDP_PORTS] = await freePorts(1 + FACES.length);
const wt = scratch('roster-badges-wt');
const home = scratchHome('roster-badges-home', fs);
let failed = 0, passed = 0;
const check = (n, c, e) => { if (c) { passed++; console.log(`  ✓ ${n}`); } else { failed++; console.error(`  ✗ ${n}${e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 1500) : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000, step = 200) => { const t = Date.now() + ms; while (Date.now() < t) { let v = null; try { v = await fn(); } catch { } if (v) return v; await sleep(step); } return null; };

try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch { }
execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'server.js', 'package.json']) execSync(`rm -rf ${wt}/${f} && cp -r ${repo}/${f} ${wt}/${f}`);
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
const expiredCreds = JSON.stringify({ claudeAiOauth: { accessToken: 'expired-test-token', expiresAt: Date.now() - 1000 } });
fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
fs.writeFileSync(path.join(home, '.claude', '.credentials.json'), expiredCreds);
// the CLI shape is the fixture's, never the box's (test-roster-reset-eta's scratch login shell, the INSTALLED shape)
const CLI_BIN = path.join(home, '.local', 'bin'), TOOLS = path.join(home, '.vs-shape', 'tools'), SHAPE = path.join(home, '.vs-shape', 'installed');
for (const d of [CLI_BIN, TOOLS, SHAPE]) fs.mkdirSync(d, { recursive: true });
fs.writeFileSync(path.join(CLI_BIN, 'claude'), '#!/bin/sh\n[ "$1" = --version ] && { echo "2.1.314 (Claude Code)"; exit 0; }\nexit 1\n', { mode: 0o755 });
fs.writeFileSync(path.join(CLI_BIN, 'codex'), '#!/bin/sh\n[ "$1" = --version ] && { echo "codex-cli 0.130.0"; exit 0; }\nexit 1\n', { mode: 0o755 });
fs.symlinkSync(['/usr/bin/printenv', '/bin/printenv'].find((p) => fs.existsSync(p)) || '/usr/bin/printenv', path.join(TOOLS, 'printenv'));
fs.writeFileSync(path.join(SHAPE, 'login-shell'), `#!/bin/sh\nPATH='${CLI_BIN}:${TOOLS}'; export PATH\nwhile [ $# -gt 0 ]; do case "$1" in -c) shift; exec /bin/sh -c "$1";; *) shift;; esac; done; exit 9\n`, { mode: 0o755 });
const hubPath = (process.env.PATH || '').split(':').filter((d) => d && !['claude', 'codex'].some((n) => fs.existsSync(path.join(d, n)))).join(':');
const srvEnv = { ...process.env, ...VNC_ENV, PORT: String(PORT), HOME: home, PATH: hubPath, SHELL: path.join(SHAPE, 'login-shell'), VIBESPACE_SKIP_AGENT_HOOKS: '1' };
for (const k of ['CLAUDE_CMD', 'CODEX_CMD', 'ANTHROPIC_API_KEY', 'OPENAI_API_KEY']) delete srvEnv[k];
let srv = null;
const bootServer = () => { srv = spawn(process.execPath, ['server.js'], { cwd: wt, env: srvEnv, stdio: 'ignore' }); return srv; };
const chromes = [];
const cleanup = () => {
  for (const c of chromes) { try { c.kill('SIGKILL'); } catch { } }
  try { srv?.kill('SIGKILL'); } catch { }
  try { endRootedProcesses(wt); } catch { }
  try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch { }
  try { fs.rmSync(home, { recursive: true, force: true }); } catch { }
};
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(1); });
const waitServer = async () => { for (let i = 0; i < 120; i++) { try { await fetch(`http://127.0.0.1:${PORT}/api/home`); return true; } catch { await sleep(250); } } return false; };
const api = async (p, init) => (await fetch(`http://127.0.0.1:${PORT}${p}`, init)).json();
const post = (p, body) => api(p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

// the four rows of the owner's picture — every time DERIVED from the clock at the seed
const M = 60e3, H = 60 * M, D = 24 * H, seedAt = Date.now(), sec = (ms) => Math.floor(ms / 1000);
const ROWS = [
  { name: 'Alpha Max', fetched: seedAt - 97 * M, capRead: seedAt - 97 * M - 50 * H, reset: 7 * D + 2 * H, u7: 0.08, uCap: 0.12, badge: '2d', counts: '7d', age: '97m' },
  { name: 'Beta Max', fetched: seedAt - 3 * M, capRead: seedAt - 41 * H - 10 * M, reset: 4 * D + 2 * H, u7: 0.62, uCap: 0.93, badge: '41h', counts: '4d', age: '' },
  { name: 'Gamma Max', fetched: seedAt - 27 * H, capRead: seedAt - 27 * H - 25 * H, reset: 41 * H + 20 * M, u7: 0.64, uCap: 0.95, badge: '2d', counts: '41h', age: '27h' },
  { name: 'Delta Max', fetched: seedAt - 24 * H, capRead: seedAt - 24 * H - 72 * H, reset: 21 * H + 20 * M, u7: 0.96, uCap: 0.97, badge: '4d', counts: '21h', age: '24h' },
];
const MARK = /^\d+[mhd]$/;
// THE FIXTURE'S «NOW» IS THE PAGE'S (the .401 cut mirror: the runner's ja pass drew «98m» — a minute had passed between the seed
// and the read): every document starts its clock at seedAt, so an age the page computes is the fixture's, never the wall clock's
const PAGE_CLOCK = `(() => { const RD = Date, t0 = RD.now(), seed = ${seedAt}; const now = () => seed + (RD.now() - t0);
  function D(...a) { if (!new.target) return new RD(now()).toString(); return a.length ? new RD(...a) : new RD(now()); }
  D.prototype = RD.prototype; D.now = now; D.parse = RD.parse; D.UTC = RD.UTC; globalThis.Date = D; })()`;

try {
  bootServer();
  check('worktree server boots', await waitServer());
  const ids = [];
  for (const r of ROWS) { const a = await post('/api/accounts/subscription', { name: r.name }); ids.push(a?.id); }
  check('four subscriptions minted', ids.every(Boolean), ids);
  const cacheDir = path.join(wt, 'data', 'usage-cache'); fs.mkdirSync(cacheDir, { recursive: true });
  ROWS.forEach((r, i) => {
    fs.writeFileSync(path.join(wt, 'data', 'subs', ids[i], '.credentials.json'), expiredCreds);
    fs.writeFileSync(path.join(cacheDir, ids[i] + '.json'), JSON.stringify({ overallStatus: 'allowed', fetchedAt: r.fetched, source: 'cli-usage', fiveHourAbsent: seedAt - 6 * D,
      sevenDay: { utilization: r.u7, status: 'allowed', resetsAt: sec(seedAt + r.reset), state: 'running' },
      scopedWeekly: [{ name: 'Fable', utilization: r.uCap, resetsAt: sec(seedAt + r.reset), state: 'running' }], scopedFetchedAt: r.capRead }));
  });
  srv.kill('SIGKILL'); await sleep(400); bootServer();
  check('the server reboots over the seeded readings', await waitServer());

  const WebSocket = require('ws');
  const launch = async (face, cdpPort) => {
    const prof = scratch('roster-badges-' + face); fs.mkdirSync(prof, { recursive: true });
    const env = { ...process.env }; delete env.DBUS_SESSION_BUS_ADDRESS;
    if (face === 'runner') {   // the hosted runner's face: dejavu + liberation + opentype/noto (+ emoji) — runner-repro's FONTCONFIG_FILE
      const emoji = path.join(prof, 'emoji'); fs.mkdirSync(emoji, { recursive: true }); try { fs.symlinkSync('/usr/share/fonts/truetype/noto/NotoColorEmoji.ttf', path.join(emoji, 'NotoColorEmoji.ttf')); } catch { }
      const fc = path.join(prof, 'fonts.conf'); fs.writeFileSync(fc, `<?xml version="1.0"?><!DOCTYPE fontconfig SYSTEM "fonts.dtd"><fontconfig><dir>/usr/share/fonts/truetype/dejavu</dir><dir>/usr/share/fonts/truetype/liberation</dir><dir>/usr/share/fonts/opentype/noto</dir><dir>${emoji}</dir><cachedir>${path.join(prof, 'fc')}</cachedir><include ignore_missing="yes">/etc/fonts/conf.d</include></fontconfig>`);
      env.FONTCONFIG_FILE = fc;
    }
    const c = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${cdpPort}`, '--no-first-run', '--disable-gpu', '--password-store=basic', '--disable-background-timer-throttling', '--window-size=1200,800', `--user-data-dir=${path.join(prof, 'p')}`, 'about:blank'], { stdio: 'ignore', env });
    chromes.push(c);
    const target = await until(async () => (await (await fetch(`http://127.0.0.1:${cdpPort}/json`)).json()).find((t) => t.type === 'page'), 20000, 250);
    if (!target) throw new Error(`chrome (${face}) never exposed a page`);
    const ws = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
    await new Promise((r) => ws.on('open', r));
    let seq = 0; const pend = new Map(), errors = [];
    ws.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); return; } if (m.method === 'Runtime.exceptionThrown') errors.push(String(m.params?.exceptionDetails?.exception?.description || 'exception').split('\n')[0]); });
    const cdp = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, (m) => (m.error ? rej(new Error(m.error.message)) : res(m.result))); ws.send(JSON.stringify({ id, method, params })); });
    const ev = async (expr) => { const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error('page threw: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text)); return r.result.value; };
    await cdp('Page.enable'); await cdp('Runtime.enable');
    await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
    await cdp('Page.addScriptToEvaluateOnNewDocument', { source: PAGE_CLOCK });
    await cdp('Emulation.setDeviceMetricsOverride', { width: 1200, height: 800, deviceScaleFactor: 2, mobile: false });
    return { face, cdp, ev, errors };
  };
  // the roster's rows as drawn: each aged ring's badge, the counts, the row's own age, the clipping box
  const MEASURE = `(() => { const R = (e) => e.getBoundingClientRect(); const cross = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
    const sec = document.querySelector('.agents-machine-sec[data-host=""]'); if (!sec) return null; const list = sec.querySelector('.acct-list'); if (!list) return null;
    const clipOf = (e) => { for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) { const cs = getComputedStyle(p); if (/(auto|scroll|hidden|clip)/.test(cs.overflowY + ' ' + cs.overflowX) || cs.contain.includes('paint')) return p; } return document.documentElement; };
    return { listW: Math.round(R(list).width * 10) / 10, rows: [...list.querySelectorAll('.acct-key-row')].filter((row) => row.querySelector('.acct-usage-donut')).map((row, i) => {
      const rings = [...row.querySelectorAll('.acct-usage-donut')];
      const badges = [...row.querySelectorAll('.acct-donut-age')].map((b) => { const col = b.closest('.acct-donut-col'), ring = col.querySelector('.acct-usage-donut'), lab = ring.querySelector('span'), rb = R(b), cs = getComputedStyle(b);
        const lh = parseFloat(cs.lineHeight) || 10, bt = parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth), clip = clipOf(b), rc = R(clip);
        return { text: b.textContent, lines: Math.round((rb.height - bt) / lh), overLabel: Math.round(cross(rb, R(lab))), overOther: Math.round(rings.filter((x) => x !== ring).reduce((s, x) => s + cross(rb, R(x)), 0)),
          cutTop: Math.round(Math.max(0, rc.top - rb.top) * 10) / 10, cutBottom: Math.round(Math.max(0, rb.bottom - rc.bottom) * 10) / 10, clip: (clip.className || clip.tagName).toString().slice(0, 40), tip: ring.title || '' }; });
      const age = row.querySelector('.acct-usage-age > span');
      return { i, name: row.querySelector('.acct-key-name')?.textContent || '', badges, counts: [...row.querySelectorAll('.acct-donut-eta')].map((e) => e.textContent.trim()).filter(Boolean),
        age: age ? { text: age.textContent, whole: age.scrollWidth <= age.clientWidth + 0.5 && R(age).right <= R(row).right + 0.5 } : null };
    }) }; })()`;
  const pages = [];
  for (let i = 0; i < FACES.length; i++) pages.push(await launch(FACES[i], CDP_PORTS[i]));
  for (const P of pages) {
    for (const lang of LANGS) {
      await P.cdp('Page.addScriptToEvaluateOnNewDocument', { source: `try { localStorage.setItem('vibespace.lang', ${JSON.stringify(lang)}); } catch {}` });
      await P.cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
      const up = await until(() => P.ev(`!!(window.app && document.querySelector('.rail-item[data-rail="agents"]') && !document.getElementById('loading-screen'))`), 40000, 250);
      if (!up) { check(`${P.face} ${lang}: the page comes up`, false); continue; }
      // open the Agents panel (a reload may keep it open — a click on its rail item would close it)
      await P.ev(`(() => { app.sidebar.toggle(true); const sec = document.querySelector('.agents-machine-sec[data-host=""]'); if (!sec || !sec.getBoundingClientRect().width) document.querySelector('.rail-item[data-rail="agents"]').click(); return 1; })()`);
      await until(() => P.ev(`(() => { const s = document.querySelector('.agents-machine-sec[data-host=""] .acct-list'); return !!s && s.getBoundingClientRect().width > 0; })()`), 15000, 250);
      for (const [label, want] of [['wide', 504], ['narrowest', null]]) {
        let width = want;
        if (want == null) {   // the narrowest list that still draws rings: 341 px (at 340 the container query draws ONE pill)
          const m0 = await until(() => P.ev(MEASURE), 15000, 300);
          width = 504 - Math.round((m0?.listW || 487) - 341);
        }
        const setW = (w) => P.ev(`(() => { app.sidebar.el.style.width = '${w}px'; app.sidebar._applySidebarLayoutWidth?.(); return 1; })()`);
        await setW(width);
        if (want == null) { await sleep(300); const m1 = await P.ev(MEASURE); if (m1 && Math.round(m1.listW) !== 341) { width -= Math.round(m1.listW) - 341; await setW(width); } }
        const m = await until(async () => { const x = await P.ev(MEASURE); return x && x.rows.length >= 4 && x.rows.every((r) => r.badges.length >= 1) ? x : null; }, 20000, 300);
        if (!m) { check(`${P.face} ${lang} ${label}: the four rows draw their rings and badges`, false, await P.ev(MEASURE).catch((e) => e.message)); continue; }
        await P.ev(`(() => { const s = document.querySelector('.agents-machine-sec[data-host=""] .acct-list'); let p = s; while (p && p !== document.body) { if (/(auto|scroll)/.test(getComputedStyle(p).overflowY)) { p.scrollTop = 0; } p = p.parentElement; } return 1; })()`);
        await sleep(200);
        const mm = await P.ev(MEASURE);
        const said = mm.rows.map((r) => `row ${r.i + 1}: badge ${r.badges.map((b) => `«${b.text}» ${b.lines} line(s), ${b.overLabel} px² over its label, cut ${b.cutTop}/${b.cutBottom} px by ${b.clip}`).join(', ')}; counts ${r.counts.join(' ')}; age «${r.age ? r.age.text : ''}»${r.age && !r.age.whole ? ' (CUT)' : ''}`).join(' · ');
        const badges = mm.rows.flatMap((r) => r.badges);
        check(`${P.face} ${lang} ${label} (list ${mm.listW} px): ① every badge ONE line, off its ring's label and every other ring — ${said}`, badges.length >= 4 && badges.every((b) => b.lines === 1 && b.overLabel === 0 && b.overOther === 0), said);
        check(`${P.face} ${lang} ${label}: ② every badge INSIDE the box that clips its row — the first row at the list's top included`, badges.every((b) => b.cutTop === 0 && b.cutBottom === 0), badges.map((b) => `«${b.text}» cut ${b.cutTop}/${b.cutBottom} by ${b.clip}`).join(' · '));
        const byName = (r) => mm.rows.find((x) => x.name === r.name) || { badges: [], counts: [], age: null };   // the roster sorts by name
        const want4 = ROWS.map((r) => r.badge).join(' '), got4 = ROWS.map((r) => byName(r).badges[0]?.text).join(' ');
        check(`${P.face} ${lang} ${label}: ③ ONE UNIT STYLE — the badges (the reading's age) ${got4}, the counts under the rings (the time to the reset), the rows' own ages: m / h / d in every language; the tooltip keeps the sentence`,
          got4 === want4 && mm.rows.every((r) => r.counts.every((c) => /^\d+[mhd]/.test(c)) && (!r.age || !r.age.text || MARK.test(r.age.text))) && badges.every((b) => MARK.test(b.text)) && (lang === 'en' || badges.every((b) => /[^\x00-\x7f]/.test(b.tip))),
          { want4, got4, counts: mm.rows.map((r) => r.counts), ages: mm.rows.map((r) => r.age && r.age.text), tips: badges.map((b) => b.tip.slice(-40)) });
        check(`${P.face} ${lang} ${label}: ④ the rows' own ages are whole and say ${ROWS.map((r) => r.age || '—').join(' / ')}, the counts ${ROWS.map((r) => r.counts).join(' / ')} (${mm.rows.map((r) => r.age ? `«${r.age.text}»` : '—').join(' ')})`, mm.rows.every((r) => !r.age || r.age.whole) && ROWS.map((r) => (byName(r).age ? byName(r).age.text : '')).join(' ') === ROWS.map((r) => r.age).join(' ') && ROWS.every((r) => (byName(r).counts[0] || '') === r.counts), mm.rows.map((r) => ({ name: r.name, age: r.age, counts: r.counts })));
        const clip = await P.ev(`(() => { const s = document.querySelector('.agents-machine-sec[data-host=""] .acct-list'); const r = s.getBoundingClientRect(); return { x: Math.max(0, r.right - 300), y: Math.max(0, r.top - 6), width: Math.min(300, r.width), height: Math.min(420, r.height + 12) }; })()`);
        const s = await P.cdp('Page.captureScreenshot', { format: 'png', clip: { ...clip, scale: 2 } }); fs.writeFileSync(path.join(PNG, `${P.face}-${lang}-${label}.png`), Buffer.from(s.data, 'base64'));
      }
    }
    check(`${P.face}: no page exception`, P.errors.length === 0, P.errors.slice(0, 5));
  }
} catch (e) { failed++; console.error('  ✗ ' + ((e && e.stack) || e)); }
finally { for (const c of chromes) { try { c.kill('SIGKILL'); } catch { } } try { srv?.kill('SIGKILL'); } catch { } }
console.log(`PNGs: ${PNG}`);
console.log(`\ntest-roster-badges-chrome: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);

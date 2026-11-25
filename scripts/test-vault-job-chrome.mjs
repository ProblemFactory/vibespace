#!/usr/bin/env node
// test-vault-job-chrome — B-a08e L2 IN A REAL PAGE (lane vault-job-approval; 主开发 r850 item 1, the chrome legs the line owed): a
// worktree hub seeded BEFORE its boot with a vault (three keys the owner stored) and three Background jobs over them —
// «telegram-bot» and «mail-bot» waiting for the owner's approval, «weather-poller» approved (its vault-job grant row) — one headless
// Chrome:
//   ① 1280: the Background Work rail — the waiting job's card says «Uses from the vault: Telegram bot», why it waits and its ONE
//      door «Open For you»; the approved one names «Weather API» with its ✕
//   ② «Open For you» opens THAT card — the For-you window's selected item is the job's approval card, its Allow on screen
//   ③ Allow at 1280: 验证是你 (the second password, in the page's own dialog) ⇒ the job STARTS by itself
//   ④ the Vault window: each approved job is a chip on its secret's row (its name · running · started N× · ✕) — the count read when it
//      lands (the hand-over's end), never between the two frames
//   ⑤ the chip's ✕: the theme's confirm (never a native dialog) ⇒ the job STOPS, its chip leaves the row
//   ⑥ 390 (a phone): «mail-bot»'s card — its Allow on screen, 验证是你, the job starts; then the job card's ✕ in the Background Work
//      window: the confirm ⇒ stopped
// Why its own suite (the line says it): test-jobs-panel pins its triage fixture's counts and test-vault-window-chrome sets its vault up
// from «not set up» — a hub whose vault and jobs exist before the boot is this suite's own world.
// The job processes the approvals start are ended through the hub's own stop route; their program exits by itself after 90 s.
// SKIPs without chrome. Worktree-isolated (own data/, a scratch HOME, VIBESPACE_SKIP_AGENT_HOOKS=1, VS_NO_REAL_CLI=1), free ports.
// Run: node scripts/test-vault-job-chrome.mjs
import { execSync, spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePorts, ONBOARDED_SOURCE, vncEnv, CHROME_STORE, CHROME_QUIET } from './scratch.mjs';
import { mintRoot, startHub, strippedEnv } from './hub-boot.mjs';   // THE hub boot (test-architecture §57c) — its root's processes ended by the helper (§57b)
import { checker } from './lib/check.mjs';
const VNC_ENV = await vncEnv(); // per-run singleton-Desktop display + port for the server this suite boots (test-architecture §57)
const require = createRequire(import.meta.url);

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome/chromium'); process.exit(0); }

const [PORT, CDP_PORT] = await freePorts(2);
const root = mintRoot('vault-job-chrome'), wt = path.join(root, 't');
const home = path.join(root, 'home'); fs.mkdirSync(home, { recursive: true });
const chromeHome = path.join(root, 'chrome-home'); fs.mkdirSync(chromeHome, { recursive: true });   // the suite's own browser carries a HOME in the root (the helper ends it with the root)
const SECOND = `vjc second password ${process.pid}`;   // the scratch vault's second password
const { ok, report } = checker();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// every wait is for WHAT HAPPENED, bounded, and its outcome is read by the check that follows (null at the bound)
const until = async (fn, ms = 20000, step = 200) => { const t = Date.now() + ms; while (Date.now() < t) { let v = null; try { v = await fn(); } catch { } if (v) return v; await sleep(step); } return null; };

execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'server.js', 'scripts']) { execSync(`rm -rf ${wt}/${f} && cp -r ${repo}/${f} ${wt}/${f}`); }
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
execSync('npm run build:bundles', { cwd: wt, stdio: 'ignore' });

// ── THE SEED, before the first boot — in a CHILD that exits (the jobs registry's lock goes with it) ──
const dataDir = path.join(wt, 'data');
fs.mkdirSync(dataDir, { recursive: true });
fs.writeFileSync(path.join(wt, 'vjc-bot.js'), "const fs = require('fs'); for (const k of Object.keys(process.env)) if (/_FD$/.test(k)) { try { fs.readFileSync(Number(process.env[k])); } catch { } } setTimeout(() => process.exit(0), 90e3); setInterval(() => { }, 60e3);\n");
const seedFile = path.join(wt, 'vjc-seed.cjs');
fs.writeFileSync(seedFile, `'use strict';
const path = require('path'), crypto = require('crypto');
const tree = process.argv[2], PW = process.env.VJC_SECOND, dd = path.join(tree, 'data');
const R = (p) => require(path.join(tree, p));
(async () => {
  const v = R('src/server/vault-engine.js').create({ dataDir: dd, log: { log() { }, warn() { } }, idleTimer: false, register: false });
  await v.setup(PW);
  const PD = R('src/server/vault-paste-door.js').create({ vault: v, log: () => { } });
  const val = () => 'vjc-' + crypto.randomBytes(16).toString('hex');
  const e1 = PD.addEntry({ label: 'Telegram bot', kind: 'api-key', value: val(), by: 'user' });
  const e2 = PD.addEntry({ label: 'Weather API', kind: 'api-key', value: val(), by: 'user' });
  const e3 = PD.addEntry({ label: 'Mail key', kind: 'api-key', value: val(), by: 'user' });
  if (!e1.ok || !e2.ok || !e3.ok) throw new Error('entries: ' + JSON.stringify([e1, e2, e3]));
  const GS = R('src/server/grants-store.js').create({ dataDir: dd });
  const { JobManager } = R('src/jobs.js');
  const jm = new JobManager({ dataDir: dd, broadcast() { }, notifyUser() { return { ok: true }; }, log() { }, memoryRungs: [] });
  jm.init(); for (const t of jm._timers || []) clearInterval(t);
  const owner = { conversation: { id: 'conv-vjc' }, sessionId: 'w-vjc', createdBy: 'agent', groupsSnapshot: [] };
  const ctx = { conversationId: 'conv-vjc', groups: new Set() };
  const cmd = { argv: [process.execPath, path.join(tree, 'vjc-bot.js')], cwd: tree };
  const mk = (name, use) => (jm.create({ kind: 'service', restart: 'never', name, cmd, owner, vault: [use] }, ctx) || {}).job;
  const j1 = mk('telegram-bot', 'TG_TOKEN=' + e1.ref), j2 = mk('weather-poller', 'WEATHER_KEY=' + e2.ref), j3 = mk('mail-bot', 'MAIL_KEY=' + e3.ref);
  if (!j1 || !j2 || !j3) throw new Error('jobs not created');
  const g = GS.set('vault-job', 'secrets:' + e2.entry + '#secret', { to: [{ kind: 'conversation', key: 'conv-vjc', jobs: [j2.id] }] }, 'seed');
  if (!g.ok) throw new Error('grant: ' + JSON.stringify(g));
  try { jm.shutdown(); } catch { }
  try { v.close && v.close(); } catch { }
  process.stdout.write(JSON.stringify({ e1: e1.entry, e2: e2.entry, e3: e3.entry, j1: j1.id, j2: j2.id, j3: j3.id }) + '\\n');
  process.exit(0);
})().catch((e) => { console.error(e && e.stack || e); process.exit(1); });
`);
const sr = spawnSync(process.execPath, [seedFile, wt], { cwd: wt, encoding: 'utf8', timeout: 120000, env: { PATH: process.env.PATH, HOME: home, LANG: 'C.UTF-8', VS_NO_REAL_CLI: '1', VIBESPACE_SKIP_AGENT_HOOKS: '1', VJC_SECOND: SECOND } });   // the second password rides the env, never argv
let S = null;
try { S = JSON.parse(String(sr.stdout || '').trim().split('\n').pop()); } catch { S = null; }
ok(!!(sr.status === 0 && !!S), 'the seed (a child that exited): a vault with three keys the owner stored, three jobs over them, ONE approved by its grant row', { status: sr.status, err: String(sr.stderr || '').slice(0, 800) });
if (!S) { try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch { } report(); }
const ROW = (entry) => `secrets:${entry}#secret`;

const hub = startHub({ root, tree: wt, port: PORT, env: { ...strippedEnv(), ...VNC_ENV, HOME: home, VIBESPACE_SKIP_AGENT_HOOKS: '1', VS_NO_REAL_CLI: '1', VIBESPACE_PASSWORD: '' } });
const chrome = spawn(CHROME, [...CHROME_QUIET, ...CHROME_STORE, '--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--disable-background-timer-throttling', '--window-size=1400,900', `--user-data-dir=${wt}-chrome`, 'about:blank'], { stdio: 'ignore', env: { ...process.env, HOME: chromeHome } });
const jobsNow = async () => { try { const r = await fetch(`http://127.0.0.1:${PORT}/api/jobs`); const j = await r.json(); return r.status === 200 && Array.isArray(j.jobs) ? j.jobs : null; } catch { return null; } };
const jobOf = async (id) => ((await jobsNow()) || []).find((j) => j.id === id) || null;
let cleaned = false;
const cleanup = () => {
  if (cleaned) return; cleaned = true;
  try { chrome.kill('SIGKILL'); } catch { }
  try { hub.stop(); } catch { }
  try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch { }
};
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(1); });

ok(!!(await hub.ready()), 'the worktree server boots over the seed');
ok(!!(!!(await until(jobsNow, 30000, 250))), 'the jobs engine answers (GET /api/jobs)');

const WebSocket = require('ws');
const target = await until(async () => (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json()).find((t) => t.type === 'page'), 20000, 250);
const ws = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
await new Promise((r) => ws.on('open', r));
let seq = 0; const pend = new Map(), cdpEvents = new Set();   // cdpEvents: ⑦'s own control of one response (Fetch.requestPaused)
ws.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } else if (m.method) for (const f of cdpEvents) { try { f(m); } catch { } } });
const cdp = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, (m) => (m.error ? rej(new Error(m.error.message)) : res(m.result))); ws.send(JSON.stringify({ id, method, params })); });
const evalJs = async (expr) => { const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error('page threw: ' + (r.exceptionDetails.exception?.description || JSON.stringify(r.exceptionDetails)).slice(0, 400)); return r.result.value; };
await cdp('Page.enable');
await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
// the page's native dialogs are COUNTED (a theme dialog is the only one this road may draw)
await cdp('Page.addScriptToEvaluateOnNewDocument', { source: 'window.__vjcNative = 0; for (const k of ["confirm", "alert", "prompt"]) { const f = window[k]; window[k] = function () { window.__vjcNative++; return f.apply(this, arguments); }; }' });
const openPage = async (w, h, mobile) => {
  await cdp('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile });
  await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
  await evalJs('new Promise((res, rej) => { const t0 = Date.now(); (function w() { if (window.app) return res(app.ready); if (Date.now() - t0 > 30000) return rej(new Error("no app after 30s")); setTimeout(w, 200); })(); })');
};
// 验证是你: the second password typed into the page's own dialog when it asks → 'pw-typed' | 'no-ask'
const reauthIfAsked = async () => {
  const asked = await until(() => evalJs(`document.querySelector('#vault-reveal-dialog input[type=password]') ? 'pw' : null`), 6000, 150);
  if (!asked) return 'no-ask';
  await evalJs(`(() => { const i = document.querySelector('#vault-reveal-dialog input[type=password]'); i.value = ${JSON.stringify(SECOND)}; i.dispatchEvent(new Event('input', { bubbles: true })); const go = document.querySelector('#vault-reveal-dialog .vault-reveal-go'); if (go) go.click(); return !!go; })()`);
  await until(() => evalJs(`!document.getElementById('vault-reveal-dialog') || null`), 10000, 150);
  return 'pw-typed';
};
const CARD = (id) => `document.querySelector('.jobs-card[data-job=' + ${JSON.stringify(JSON.stringify(id))} + ']')`;
const vaultLineOf = (id) => evalJs(`(() => { const c = ${CARD(id)}; if (!c) return null; const v = c.querySelector('.jobs-card-vault'); if (!v) return { line: false };
  return { line: true, head: v.querySelector('.jobs-vault-head')?.textContent || null, chips: [...v.querySelectorAll('.jobs-chip-vault')].map((x) => (x.firstChild && x.firstChild.nodeType === 3 ? x.firstChild.textContent : x.textContent)), x: v.querySelectorAll('.jobs-vault-x').length, wait: v.querySelector('.jobs-vault-wait')?.textContent || null, door: v.querySelector('.jobs-vault-door')?.textContent || null }; })()`);
const chipsOf = (entry) => evalJs(`(() => { const r = document.querySelector('.vw-row[data-id=' + ${JSON.stringify(JSON.stringify(ROW(entry)))} + ']'); if (!r) return null; return [...r.querySelectorAll('.vw-job-chip')].map((c) => ({ words: c.querySelector('.vw-job-chip-words')?.textContent || '', x: !!c.querySelector('.vw-job-x') })); })()`);
// stage L3's F1: the JOB card's ✕ takes back all of its secrets — its confirm says so («Take back every secret of …»); a Vault row's chip asks «Take it back from …»
const confirmShown = () => evalJs(`(() => { const o = [...document.querySelectorAll('.dialog-overlay')].filter((x) => /Take it back|Take back every secret/.test(x.textContent)).pop(); if (!o) return null; const ok = o.querySelector('.dialog-footer .btn-create'); return { text: o.textContent.slice(0, 300), ok: !!ok, native: window.__vjcNative }; })()`);
const confirmOk = () => evalJs(`(() => { const o = [...document.querySelectorAll('.dialog-overlay')].filter((x) => /Take it back|Take back every secret/.test(x.textContent)).pop(); const ok = o && o.querySelector('.dialog-footer .btn-create'); if (ok) ok.click(); return !!ok; })()`);
// THE WINDOW'S ARM (src/lib/press-arm.js): an Allow pressed within 700 ms of its pane appearing or moving is refused with «That Allow moved
// under the pointer just now» — the press is tried again after THAT refusal (what happened), never after a fixed sleep; → { tries, refused } once
// the 验证是你 dialog asks | null
const pressAllow = async () => {
  let refused = 0;
  for (let i = 0; i < 8; i++) {
    await evalJs(`(() => { const a = document.querySelector('[data-act="job-allow"]'); if (a) a.click(); return !!a; })()`);
    const got = await until(() => evalJs(`document.querySelector('#vault-reveal-dialog input[type=password]') ? 'pw' : (document.body.innerText.includes('moved under the pointer') ? 'refused' : null)`), 4000, 100);
    if (got === 'pw') return { tries: i + 1, refused };
    if (got !== 'refused') return null;
    refused++;
    await until(() => evalJs(`!document.body.innerText.includes('moved under the pointer') || null`), 12000, 200);   // the refusal's toast gone: the next press is a new one
  }
  return null;
};
// on screen: scrolled to first (as a person does), then inside the viewport AND the topmost element at its centre (nothing covers it —
// a person can press it: round whmslzr9y), its size said
const inView = (sel) => evalJs(`(() => { const b = document.querySelector(${JSON.stringify(sel)}); if (!b) return null; b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect(); const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { w: Math.round(r.width), h: Math.round(r.height), inside: r.left >= 0 && r.top >= 0 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1, topmost: !!top && (top === b || b.contains(top)) }; })()`);

try {
  // ── THE UNLOCK: the vault the seed set up is locked at the boot; the page unlocks it — the jobs are judged again ──
  await openPage(1280, 900, false);
  const un = await evalJs(`fetch('/api/vault/unlock', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: ${JSON.stringify(SECOND)} }) }).then((r) => r.status)`);
  const ready = await until(async () => {
    const js = await jobsNow(); if (!js) return null;
    const a = js.find((j) => j.id === S.j1), b = js.find((j) => j.id === S.j2), c = js.find((j) => j.id === S.j3);
    const cardOf = (j) => ((j && j.vaultUses) || []).map((x) => x.card).find(Boolean) || null;
    return a && a.state === 'waiting' && a.waitFor === 'approval' && cardOf(a) && c && c.state === 'waiting' && c.waitFor === 'approval' && cardOf(c) && b && b.state === 'up' ? { a: cardOf(a), c: cardOf(c) } : null;
  }, 45000, 400);
  ok(!!(un === 200 && !!ready), 'unlocked from the page ⇒ the two jobs wait for the owner\'s approval, each with its card (GET /api/jobs `vaultUses[].card`), the approved one RUNS', { un, jobs: ((await jobsNow()) || []).map((j) => [j.id, j.state, j.waitFor, (j.vaultUses || []).map((x) => [x.label, x.approved, !!x.card])]) });
  if (!ready) throw new Error('the scene never formed — no legs over a scene that did not happen');

  // ① 1280: THE BACKGROUND WORK RAIL — the job card's vault line
  await evalJs('app.openJobs(); true');
  const l1 = await until(async () => { const v = await vaultLineOf(S.j1); return v && v.line && v.door ? v : null; }, 15000);
  const l2 = await until(async () => { const v = await vaultLineOf(S.j2); return v && v.line && v.x ? v : null; }, 15000);
  ok(!!(!!l1 && l1.head === 'Uses from the vault:' && JSON.stringify(l1.chips) === '["Telegram bot"]' && l1.x === 0 && l1.wait === 'waiting for your approval — its card is in For you' && l1.door === 'Open For you'), '① 1280: the WAITING job\'s card — «Uses from the vault:» + «Telegram bot», why it waits («waiting for your approval — its card is in For you») and its ONE door «Open For you» (no ✕ on a value not yet approved)', l1);
  ok(!!(!!l2 && JSON.stringify(l2.chips) === '["Weather API"]' && l2.x === 1 && !l2.wait), '① 1280: the APPROVED job\'s card names «Weather API» with its ✕ (take it back)', l2);

  // ② «Open For you» opens THAT card
  await evalJs(`(() => { const b = ${CARD(S.j1)}.querySelector('.jobs-vault-door'); b.click(); return true; })()`);
  const sel = await until(() => evalJs(`(() => { const r = document.getElementById('iw-row-' + ${JSON.stringify(ready.a)}); const a = document.querySelector('[data-act="job-allow"]'); return r && r.getAttribute('aria-selected') === 'true' && a ? { selected: true, allow: a.textContent } : null; })()`), 15000);
  ok(!!(!!sel), '② «Open For you» opens THE job\'s card — the For-you window\'s selected item is its approval card, Allow on screen (never the whole tray)', sel || { row: await evalJs(`!!document.getElementById('iw-row-' + ${JSON.stringify(ready.a)})`) });

  // ③ ALLOW at 1280: 验证是你 ⇒ the job starts by itself
  const allowAt = await inView('[data-act="job-allow"]');
  const press1 = await pressAllow();
  const pw1 = press1 ? await reauthIfAsked() : 'no-ask';
  console.log(`      the Allow presses at 1280: ${JSON.stringify(press1)} (a refusal = the window's arm, said by the window)`);
  const up1 = await until(async () => { const j = await jobOf(S.j1); return j && j.state === 'up' && (j.vaultUses || []).some((x) => x.approved === true) ? j : null; }, 30000, 400);
  ok(!!(!!allowAt && allowAt.inside && allowAt.topmost && pw1 === 'pw-typed' && !!up1), '③ 1280: Allow (on screen) asks 验证是你 first — the second password in the page\'s own dialog — and the job STARTS by itself, approved', { allowAt, press1, pw1, job: up1 && { state: up1.state } });

  // ④ THE VAULT WINDOW: each approved job is a chip on its secret's row
  await evalJs("window.dispatchEvent(new Event('vs-vault-door')); true");
  // THE WORDS THEMSELVES (box row 210, 主开发 r2176): a job is «running» when its wrapper starts, and its start COUNT is the vault-use
  // line written when the hand-over ENDS (the wrapper's ACK — src/jobs.js _handValues); that line's `vault-contents` makes the window
  // re-read and redraw the row (src/lib/vault-window.js contentsMoved, the row's patch key carries its jobs) — so the chip says
  // «started 1×» a moment after «running»: the leg waits for its words within the bound (never a sleep), then judges what it read
  const chipSays = (entry, re) => async () => { const c = await chipsOf(entry); return c && c.length && re.test(c[0].words) ? c : null; };
  const c1 = (await until(chipSays(S.e1, /· running · started 1×$/), 15000)) || await chipsOf(S.e1);
  const c2 = (await until(chipSays(S.e2, /· running · started 1×$/), 15000)) || await chipsOf(S.e2);
  ok(!!(!!c1 && !!c2 && /^Background job: telegram-bot · running · started 1×$/.test(c1[0].words) && /^Background job: weather-poller · running · started 1×$/.test(c2[0].words) && c1[0].x && c2[0].x), '④ the Vault window: «Telegram bot»\'s row and «Weather API»\'s row each carry their job\'s chip — its name · running · started 1× — with its ✕', { c1, c2 });

  // ⑤ THE CHIP'S ✕: the theme's confirm ⇒ stopped, the chip gone
  const xAt = await inView(`.vw-row[data-id="${ROW(S.e2)}"] .vw-job-x`);   // the chip's ✕: on screen, nothing covering it
  await evalJs(`(() => { const r = document.querySelector('.vw-row[data-id=' + ${JSON.stringify(JSON.stringify(ROW(S.e2)))} + ']'); const x = r && r.querySelector('.vw-job-x'); if (x) x.click(); return !!x; })()`);
  const conf = await until(confirmShown, 8000, 150);
  ok(!!(!!xAt && xAt.inside && xAt.topmost && !!conf && conf.ok && /weather-poller/.test(conf.text) && /cannot be taken back/.test(conf.text) && conf.native === 0), '⑤ the chip\'s ✕ (on screen, the topmost element at its centre) asks in the THEME\'s confirm (a dialog overlay, never a native confirm) naming the job and what cannot be taken back', { xAt, conf });
  await confirmOk();
  const down2 = await until(async () => { const j = await jobOf(S.j2); return j && j.desiredUp === false && j.state !== 'up' && !(j.vaultUses || []).some((x) => x.approved) ? j : null; }, 20000, 400);
  const gone2 = await until(async () => { const c = await chipsOf(S.e2); return c && c.length === 0 ? 'gone' : null; }, 15000);
  ok(!!(!!down2 && gone2 === 'gone'), '⑤ confirmed ⇒ the job is STOPPED (no restart), its approval gone, and its chip leaves «Weather API»\'s row', { job: down2 && { state: down2.state, desiredUp: down2.desiredUp }, chips: await chipsOf(S.e2) });

  // ⑥ 390 — A PHONE: the For-you card's Allow, then the job card's ✕. A phone IS a touch screen (the block's hosted run, r2073): the
  // touch emulation on — as test-phone-six-chrome does — so the product's touch floor applies (public/style.css: under (hover: none)
  // and (pointer: coarse) every .iw-act is ≥ 36 px); a 390-wide page with a mouse sized the Allow from its 11 px font alone (23 px
  // with the hosted runner's fonts, ≥ 24 with the test machines' — the leg's old bound read the fonts, never the product)
  await cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await openPage(390, 844, true);
  const coarse390 = await evalJs(`matchMedia('(hover: none) and (pointer: coarse)').matches`);   // the premise said: the page IS a touch screen
  await evalJs(`app.openInbox({ itemId: ${JSON.stringify(ready.c)} }); true`);
  const allow390 = await until(async () => { const v = await inView('[data-act="job-allow"]'); return v && v.w > 0 ? v : null; }, 15000);
  const txt390 = await evalJs(`document.body.innerText.includes('mail-bot')`);
  const press3 = await pressAllow();
  const pw3 = press3 ? await reauthIfAsked() : 'no-ask';
  console.log(`      the Allow presses at 390: ${JSON.stringify(press3)}`);
  const up3 = await until(async () => { const j = await jobOf(S.j3); return j && j.state === 'up' ? j : null; }, 30000, 400);
  ok(!!(!!allow390 && allow390.inside && allow390.topmost && coarse390 === true && allow390.h >= 36 && txt390 === true && pw3 === 'pw-typed' && !!up3), `⑥ 390: «mail-bot»\'s card opens with its Allow ON SCREEN (inside the viewport, ${allow390 ? allow390.w + '×' + allow390.h : '?'} px on a touch screen (${coarse390 ? 'coarse pointer' : 'NOT a touch screen'}): the touch floor ≥ 36 px — the For-you window\'s own action row); Allow ⇒ 验证是你 (a fresh page asks again) ⇒ the job starts`, { coarse390, allow390, txt390, press3, pw3, job: up3 && up3.state });
  await evalJs('app.openJobs({ forceWindow: true }); true');
  const l3 = await until(async () => { const v = await vaultLineOf(S.j3); return v && v.line && v.x ? v : null; }, 15000);
  const x390 = await inView('.jobs-win .jobs-card[data-job="' + S.j3 + '"] .jobs-vault-x');
  await evalJs(`(() => { const c = document.querySelector('.jobs-win .jobs-card[data-job="${S.j3}"]'); const x = c && c.querySelector('.jobs-vault-x'); if (x) x.click(); return !!x; })()`);
  const conf3 = await until(confirmShown, 8000, 150);
  await confirmOk();
  const down3 = await until(async () => { const j = await jobOf(S.j3); return j && j.desiredUp === false && j.state !== 'up' ? j : null; }, 20000, 400);
  ok(!!(!!l3 && !!x390 && x390.inside && x390.topmost && !!conf3 && conf3.ok && conf3.native === 0 && !!down3), '⑥ 390: the job card\'s ✕ (on screen) asks in the theme\'s confirm ⇒ the job STOPS — no native dialog on any road', { l3, x390, conf3, job: down3 && { state: down3.state, desiredUp: down3.desiredUp } });

  // ⑦ A NOTIFY DURING THE WINDOW'S FIRST READ (主开发 r2966 — the candidate's hosted run 45112121215: the first chip read «running»
  // with no start count, for good). «telegram-bot» stopped first; the page opened afresh; the Vault window's FIRST /api/vault/contents
  // answer HELD by this suite's own control of that one response (the CDP Fetch domain at the response stage: the list the server
  // answered BEFORE the start); the job STARTED while it is held, until its new use line's ONE notify has reached the page; the answer
  // let go ⇒ the chip reaches the new count. RED: the release's order (the notify dropped while there is no list yet) — the page's
  // bundle built as the tree builds it (its build's own flags: minified) with that one order put back in src/lib/vault-window.js,
  // served for /bundle.js by the same control
  const releaseBundle = async () => {
    const src = fs.readFileSync(path.join(wt, 'src', 'lib', 'vault-window.js'), 'utf8');
    const from = '    if (contentsBusy) { contentsAgain = true; return; }\n    if (!st.data) return;\n';
    const hits = src.split(from).length - 1;
    if (hits !== 1) return { hits, js: null };
    const swapped = src.replace(from, '    if (!st.data) return;\n    if (contentsBusy) { contentsAgain = true; return; }\n');
    const r = await require('esbuild').build({ entryPoints: [path.join(wt, 'src', 'client.js')], bundle: true, write: false, outfile: path.join(root, 'release-order', 'bundle.js'), format: 'iife', platform: 'browser', target: 'es2020', loader: { '.css': 'css' }, minify: true, logLevel: 'silent',
      plugins: [{ name: 'release-order', setup(b) { b.onLoad({ filter: /[\\/]src[\\/]lib[\\/]vault-window\.js$/ }, () => ({ contents: swapped, loader: 'js' })); } }] });
    const js = (r.outputFiles || []).find((o) => o.path.endsWith('.js'));
    return { hits, js: js ? js.text : null };
  };
  const jobAct = (act) => evalJs(`fetch('/api/jobs/${S.j1}/${act}', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).then(async (r) => ({ status: r.status, body: (await r.text()).slice(0, 300) }))`);
  const firstReadScene = async (release) => {
    const held = [], out = { swapped: release ? release.hits : null, n0: null, stopped: null, held: 0, start: null, notified: false, after: null, chip: null, last: null };
    const onPause = async (m) => {
      if (m.method !== 'Fetch.requestPaused') return;
      const p = m.params;
      if (!/\/bundle\.js(?:[?#]|$)/.test(p.request.url)) { held.push(p); return; }   // the contents answer: held
      await cdp('Fetch.fulfillRequest', { requestId: p.requestId, responseCode: p.responseStatusCode || 200, responseHeaders: p.responseHeaders || [], body: Buffer.from(release.js, 'utf8').toString('base64') });
    };
    cdpEvents.add(onPause);
    try {
      await cdp('Emulation.setTouchEmulationEnabled', { enabled: false });
      if (release) { await cdp('Network.enable'); await cdp('Network.setCacheDisabled', { cacheDisabled: true }); await cdp('Fetch.enable', { patterns: [{ urlPattern: '*/bundle.js*', requestStage: 'Response' }] }); }
      await openPage(1280, 800, false);   // a fresh page: no Vault window yet
      if (release) await cdp('Fetch.disable');
      await jobAct('stop');
      out.stopped = !!(await until(async () => { const j = await jobOf(S.j1); return j && j.state !== 'up' && j.state !== 'starting' ? j.state : null; }, 30000, 250));
      const list = await evalJs(`fetch('/api/vault/contents').then((r) => r.json())`);
      const row = ((list && list.rows) || []).find((r) => r.id === ROW(S.e1));
      out.n0 = Number((((row && row.jobs) || []).find((j) => j.id === S.j1) || {}).starts) || 0;
      await evalJs("window.__vcN = 0; app.ws.onGlobal((m) => { if (m && m.type === 'vault-contents') window.__vcN++; }); true");
      await cdp('Fetch.enable', { patterns: [{ urlPattern: '*/api/vault/contents*', requestStage: 'Response' }] });
      await evalJs("window.dispatchEvent(new Event('vs-vault-door')); true");
      await until(() => held.length >= 1 || null, 15000, 100);
      out.held = held.length;
      const vc0 = await evalJs('window.__vcN');
      out.start = await jobAct('start');
      out.notified = !!(await until(async () => ((await evalJs('window.__vcN')) > vc0) || null, 30000, 150));   // the new use line's notify reached the page — the first read still held
      const ja = await jobOf(S.j1); out.after = ja && { state: ja.state, runs: (ja.runs || []).length };
      for (const p of held.splice(0)) { try { await cdp('Fetch.continueRequest', { requestId: p.requestId }); } catch { } }
      await cdp('Fetch.disable');
      const want = new RegExp('· running · started ' + (out.n0 + 1) + '×$');
      out.chip = await until(async () => { const c = await chipsOf(S.e1); return c && c.length && want.test(c[0].words) ? c[0].words : null; }, release ? 8000 : 15000);
      out.last = ((await chipsOf(S.e1)) || [])[0] || null;
    } finally {
      cdpEvents.delete(onPause);
      try { await cdp('Fetch.disable'); } catch { }
      if (release) { try { await cdp('Network.setCacheDisabled', { cacheDisabled: false }); } catch { } }
    }
    return out;
  };
  const r7 = await firstReadScene(null);
  ok(!!(r7.stopped && r7.held === 1 && r7.notified && !!r7.chip), '⑦ a notify during the Vault window\'s FIRST read (its first list held while «telegram-bot» starts, the new use line\'s notify in the page before the list): the chip reaches its new count once the list is let go', r7);
  const rel = await releaseBundle().catch((e) => ({ hits: -1, js: null, error: String((e && e.message) || e).slice(0, 300) }));
  const c7 = rel.js ? await firstReadScene(rel) : { swapped: rel.hits, error: rel.error || 'no bundle built' };
  ok(!!(c7.swapped === 1 && c7.stopped && c7.held === 1 && c7.notified && !c7.chip), 'CONTROL — the release\'s order (a notify while the window has no list yet dropped), the page\'s bundle built as the tree builds it with that one order put back: the chip never reaches the new count — RED on the copy', c7);
} catch (e) {
  ok(false, 'the legs ran to their end', String((e && (e.stack || e.message)) || e));
} finally {
  // the job processes the approvals started: ended through the hub's own stop route (their program also exits by itself)
  for (const id of [S.j1, S.j2, S.j3]) { try { await evalJs(`fetch('/api/jobs/${id}/stop', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).then((r) => r.status)`); } catch { } }   // the page's own stop (a person's road)
  await until(async () => { const js = await jobsNow(); return js && [S.j1, S.j2, S.j3].every((id) => { const j = js.find((x) => x.id === id); return !j || j.state !== 'up'; }) ? true : null; }, 15000, 400);
  try { ws.close(); } catch { }
}
cleanup();
report();

#!/usr/bin/env node
// test-attention-policy-ui — HEAVY (lane attention-policy, owner 2026-10-13: "应该允许禁用原来的固定规则，或者直接加个配置
// 选项可以改怎么判断需关注"; chrome, ZERO vendor calls). The REAL Channels panel + the REAL settings-ui (esbuild iifes of the
// tree) in headless chrome (zh, light) over the REAL channels router + engine (a fake 'im' account: a direct chat, two
// hand-overs, four rows for the judge) + D1's REAL decision engine over a FAKE provider on loopback:
//   ① desk 1100 px: the ⚙ door opens 「需关注 · 怎么判断」 — the Settings block's own 11 rows (renderBlock), the preset
//     on 固定规则 + 判断模型, the readout 今天判断了 N 条 · 命中 M 条;
//   ② flipping 「有人直接发给我、我还没读的」 takes the direct chat off the first screen AT ONCE (the count drops by one); it
//     stays under 全部; flipped back, it returns;
//   ③ the preset 只用判断模型 turns every rule switch off and the judge's on — only judged rows are listed; back to both;
//   ④ the judge's switch writes through the plugin's own config door (never a settings key); the preset reads 只用固定规则;
//   ⑤ phone 390 px: the door is a sheet with the same rows, nothing wider than the screen;
//   ⑥ the Settings window (its own content renderer) searched for 需关注 finds the block;
//   ⑦ CONTROL: a panel whose firstScreen ignores the policy keeps the direct chat after the same flip.
// PNGs → ATTENTION_POLICY_PNG_DIR: door-desk.png, door-phone.png, settings.png.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePort, scratch, ONBOARDED_SOURCE } from './scratch.mjs';

const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = process.env.ATTENTION_POLICY_PNG_DIR || '';
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome/chromium'); process.exit(0); }
let pass = 0, fail = 0;
const ok = (c, msg, detail) => { if (c) { pass++; console.log('  ✓ ' + msg); } else { fail++; console.log('  ✗ ' + msg + (detail !== undefined ? '\n      ' + String(typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 900) : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const quiet = { log() { }, warn() { }, error() { } };
const ENG = require(path.join(repo, 'src/server/channels-engine.js'));
const DE = require(path.join(repo, 'src/server/decision-engine.js'));
const CH = require(path.join(repo, 'src/channels/index.js'));
const fake = require(path.join(repo, 'src/channels/fake.js'));
const REC = require(path.join(repo, 'src/channel-record.js'));
const express = require(path.join(repo, 'node_modules/express'));
const esbuild = require(path.join(repo, 'node_modules/esbuild'));
const WebSocket = require(path.join(repo, 'node_modules/ws'));

// ── the fake provider: OpenAI dialect, each answer after DELAY ms; a record whose own part says URGENT needs you ──
const DELAY = 1200;
const got = [];
const recordPart = (input) => String(input).split('———').pop();
const prov = http.createServer((req, res) => {
  let b = ''; req.on('data', (c) => { b += c; });
  req.on('end', async () => {
    const body = JSON.parse(b);
    const g = { at: Date.now(), body, answeredAt: 0 };
    got.push(g);
    await sleep(DELAY);
    const rp = recordPart(body.input), hot = /URGENT/.test(rp);
    const P = { needs_now: hot ? 0.86 : 0.22, asks_me: hot ? 0.9 : 0.1, deadline_money: hot ? 0.75 : 0.05, money: /Contract/.test(rp) ? 0.9 : 0.1 };
    g.answeredAt = Date.now();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ answers: body.questions.map((q) => ({ type: 'predicate', name: q.name, probability: P[q.name] !== undefined ? P[q.name] : 0.3 })), usage: { input_tokens: Math.ceil(b.length / 4) } }));
  });
});
const PPORT = await freePort();
await new Promise((r) => prov.listen(PPORT, '127.0.0.1', r));

// ── the engines ──
const root = scratch('attention-policy-ui');
const dataDir = path.join(root, 'data');
fs.mkdirSync(path.join(dataDir, 'channels'), { recursive: true });
fs.writeFileSync(path.join(dataDir, 'channels', 'adapters.json'), JSON.stringify({ v: 1, adapters: [{ id: 'im', kind: 'im', label: 'Team chat', enabled: true, auth: { tokenEnc: null, expiresAt: null, scopes: [] }, lastPass: null, consecutiveFailures: 0, push: { enabled: true, claimedExclusive: 'unknown', state: null, lastEventAt: null, missRate: 0, demotedAt: null, demotedWhy: null, samples: [] }, scan: null }] }));
const T0 = Date.now();
const TITLES = ['Invoice URGENT', 'Handed one', 'Lunch plans', 'Handed two URGENT', 'Contract URGENT', 'Newsletter', 'Ada direct'];
const W = new Map(TITLES.map((title, i) => [`c${i}`, { id: `c${i}`, title, recs: [0, 1].map((k) => ({ vendorId: `c${i}-m${k}`, at: T0 - (i + 2) * 60e3 + k * 1000, author: { id: 'u1', name: 'Ada', isSelf: false, isBot: false }, text: k ? `${title}: can you look at this today?` : 'earlier line' })) }]));
const registry = CH.createChannelRegistry();
registry.register({
  kind: 'im', caps: { ...fake.fakePoll.caps, receive: 'poll', attachments: 'fetch', olderHistory: 'page', budget: { unit: 'request', default: 100000, settingKey: null, metered: true } },
  create(record) {
    const rec = (id, m) => REC.makeRecord({ adapterId: record.id, convId: id, vendorId: m.vendorId, at: m.at, author: m.author, text: m.text, attachments: [], threadKey: id, raw: {} });
    return {
      auth: { async state() { return { state: 'connected', expiresAt: null, scopes: ['x'], why: null }; } },
      async listConversations() { return { conversations: [...W.values()].map((x) => REC.makeConversation({ id: x.id, title: x.title, kind: x.id === 'c6' ? 'dm' : 'group', lastAt: x.recs[x.recs.length - 1].at })), cursor: null, complete: true }; },
      async convCaps() { return { read: 'yes', sendAs: [], why: 'read-only-mailbox', at: Date.now() }; },
      async history(id) { const x = W.get(id); return { records: x.recs.map((m) => rec(id, m)), anchor: x.recs[x.recs.length - 1].vendorId, reachedAnchor: true, complete: true }; },
      async older() { return { records: [], exhausted: true }; },
    };
  },
});
const decision = DE.create({ dataDir, integrations: { resolveIntegration: () => ({ values: { provider: 'openai', apiKey: 'sk-fake-ui', model: '' }, source: 'user' }) }, baseUrlFor: { openai: `http://127.0.0.1:${PPORT}` }, log: quiet });
let plug = { enabled: true, config: { attention: false } };   // OFF while the fixture is built: the page's first read starts the judging
decision.attachPlugin({ peek: () => plug, settings: () => plug.config });   // int263 seam (a2): plugin-settings-p0's engine reads the switches from the plugin's settings rows
const pages = new Set();
const SV = { 'decision.attentionBlock': 'Invoices and contracts matter to me.' };   // the server's settings (POST /api/settings stand-in)
const eng = ENG.create({ dataDir, registry, env: {}, broadcast: (m) => { for (const p of pages) p.fire(m); }, serverSetting: (k) => SV[k], liveSessions: () => [], deliver: null, log: quiet, decisionEngine: decision });
await eng.pass('im', { force: true });
// the direct chat: two messages the owner has not read (a first pass's history is its baseline — set as the kept fact)
await eng.store.index.update(() => { const en = eng.store.index.entry('im', 'c6', { create: false }); en.unread = 2; });
// lane attention-rule-at-you: a group chat (also handed to Ops desk) where a person @-ed the owner 10 min ago, unread — the kept facts
const AY_AT = Date.now() - 10 * 60e3;
await eng.store.index.update(() => { const en = eng.store.index.entry('im', 'c3', { create: false }); en.atYouAts = [AY_AT]; en.atYouLast = { at: AY_AT, text: 'can you sign the March invoice today?', who: 'Dana' }; en.readAt = Math.min(Number(en.readAt) || 0, AY_AT - 1); });
for (const id of ['c1', 'c3']) await eng.setAssignment('im', id, { principal: { kind: 'agent', id: `cid-${id}`, name: 'Ops desk' }, mode: 'all' });
plug = { enabled: true, config: { attention: true } };
const idle = async () => { for (let i = 0; i < 300 && !eng.attention.idle(); i++) await sleep(25); };

// ── the bundles: the REAL panel, the REAL settings control ──
const dir = path.join(root, 'web');
fs.mkdirSync(dir, { recursive: true });
const build = (name, entry) => esbuild.build({ stdin: { contents: entry, resolveDir: repo, loader: 'js' }, bundle: true, format: 'iife', platform: 'browser', target: 'es2020', outfile: path.join(dir, name), loader: { '.css': 'empty' }, logLevel: 'error' });
const PANEL = path.join(repo, 'src/lib/channels-panel.js');
const entry = `import { renderChannelsPanel } from ${JSON.stringify(PANEL)};
import { SettingsUI } from ${JSON.stringify(path.join(repo, 'src/lib/settings-ui.js'))};
import { SETTINGS_SCHEMA } from ${JSON.stringify(path.join(repo, 'src/lib/settings-schema.js'))};
const hs = new Set(), vals = {}, ls = {};
window.__vals = vals;
const def = (k) => (SETTINGS_SCHEMA[k] ? SETTINGS_SCHEMA[k].default : undefined);
const settings = {
  get: (k) => (k in vals ? vals[k] : def(k)),
  set: (k, v) => { vals[k] = v; fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ [k]: v }) }); for (const f of [...(ls[k] || [])]) f(v); },
  isModified: (k) => k in vals && vals[k] !== def(k), reset: (k) => settings.set(k, def(k)),
  on: (k, f) => { (ls[k] = ls[k] || new Set()).add(f); }, off: (k, f) => { if (ls[k]) ls[k].delete(f); },
};
const app = { settings, isMobile: innerWidth < 600, ws: { onGlobal: (h) => { hs.add(h); return () => hs.delete(h); }, offGlobal: (h) => hs.delete(h), onStateChange() {}, offStateChange() {} }, wm: { windows: new Map(), createWindow() { throw new Error('no wm'); } }, openChannel: () => {} };
app._settingsUI = new SettingsUI(app);
window.__fire = (m) => { for (const h of [...hs]) h(m); };
const q = new URLSearchParams(location.search).get('settings');
if (q) {
  // the Settings window's own content renderer, its search box filled (SettingsUI.open's search)
  const ui = app._settingsUI, host = document.getElementById('host');
  ui._search = q.toLowerCase(); ui._facts = {};
  host.className = 'settings-body';
  const nav = document.createElement('nav'); nav.className = 'settings-nav';
  const content = document.createElement('div'); content.className = 'settings-content';
  host.append(nav, content);
  ui._renderContent(content, nav);
} else renderChannelsPanel(app, document.getElementById('host'));`;
await esbuild.build({ stdin: { contents: entry, resolveDir: repo, loader: 'js' }, bundle: true, format: 'iife', platform: 'browser', target: 'es2020', outfile: path.join(dir, 'panel.js'), loader: { '.css': 'empty' }, logLevel: 'error' });
// THE CONTROL: the same page over a panel whose firstScreen is never handed the policy (the switches drawn, ignored)
const PANEL_SRC = fs.readFileSync(PANEL, 'utf8');
const IGNORED = 'firstScreen(rows, { view: VIEW, q, now, policy: attnPolicy() })';
const ctlPlugin = { name: 'policy-ignored', setup(b) { b.onLoad({ filter: /channels-panel\.js$/ }, () => ({ contents: PANEL_SRC.replace(IGNORED, 'firstScreen(rows, { view: VIEW, q, now })'), loader: 'js', resolveDir: path.dirname(PANEL) })); } };
await esbuild.build({ stdin: { contents: entry, resolveDir: repo, loader: 'js' }, bundle: true, format: 'iife', platform: 'browser', target: 'es2020', outfile: path.join(dir, 'ctl.js'), loader: { '.css': 'empty' }, logLevel: 'error', plugins: [ctlPlugin] });

// ── the page server: the REAL channels router + the bundles + style.css ──
const app = express();
app.use(express.json());
const routes = require(path.join(repo, 'src/routes/channels.js'));
routes.setup({ getEngine: () => eng });
app.use(routes.router);
// the plugin's own door (the GET /api/plugins row + POST /api/plugins/<id>/config of mounts-plugins-wiring, over `plug`)
const PLUG_WRITES = [], SET_KEYS = [];
app.get('/api/plugins', (req, res) => res.json({ plugins: [{ id: 'decision-api', enabled: plug.enabled, configured: true, decision: { ...plug.config } }] }));
// lane decision-spend-readout: the plugin's status row (mounts-plugins-wiring GET /api/plugins/:id/status) — the REAL decision
// engine's `today` + `month` under the plugin's shape (src/plugins/decision-api.js status)
app.get('/api/plugins/decision-api/status', (req, res) => res.json({ installed: true, running: plug.enabled, enabled: plug.enabled, configured: true, decision: { ...decision.status(), ...plug.config } }));
app.post('/api/plugins/decision-api/config', (req, res) => { PLUG_WRITES.push(req.body); plug = { ...plug, config: { ...plug.config, ...req.body } }; res.json({ ok: true }); });
app.post('/api/settings', (req, res) => { SET_KEYS.push(...Object.keys(req.body || {})); Object.assign(SV, req.body || {}); res.json({ ok: true }); });
app.get('/api/channel-groups', (req, res) => res.json({ groups: [] }));
app.all('/api/user-state', (req, res) => res.json(req.method === 'GET' ? { channelsPanelFolds: { internal: false, 'acct:im': false } } : { ok: true }));
app.get('/style.css', (req, res) => res.type('css').send(fs.readFileSync(path.join(repo, 'public/style.css'))));
app.get('/:b.js', (req, res) => res.type('js').send(fs.readFileSync(path.join(dir, req.params.b + '.js'))));
app.get('/', (req, res) => res.type('html').send(`<!doctype html><html data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/style.css"><style>body{margin:0;background:var(--bg-root)} #win{background:var(--bg-window);width:${req.query.w || '520px'};min-height:100vh;box-sizing:border-box;padding:10px 8px}</style><script>try{localStorage.setItem('vibespace.lang','zh')}catch{}</script></head><body><div id="win"><div id="host" class="rail-panel rail-panel-channels chan-window"></div></div><script src="/${req.query.b || 'panel'}.js"></script></body></html>`));
const PORT = await freePort();
const srv = await new Promise((r) => { const s = app.listen(PORT, '127.0.0.1', () => r(s)); });

const CDP_PORT = await freePort();
const chromeDir = scratch('attention-policy-ui-chrome');
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars', '--font-render-hinting=none', `--user-data-dir=${chromeDir}`, 'about:blank'], { stdio: 'ignore' });
const cleanup = () => { try { chrome.kill('SIGKILL'); } catch { } try { srv.close(); prov.close(); } catch { } for (const d of [chromeDir, root]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { } } };
process.on('exit', cleanup);
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(143); });
for (let i = 0; i < 120; i++) { try { await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json(); break; } catch { await sleep(250); } }
async function page(w, h, query) {
  const tg = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(tg.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
  await new Promise((r) => ws.on('open', r));
  let seq = 0; const pend = new Map();
  ws.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
  const cdp = (method, params = {}) => new Promise((r) => { const id = ++seq; pend.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
  await cdp('Runtime.enable'); await cdp('Page.enable');
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
  await cdp('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile: w < 600 });
  const ev = async (expr) => { const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails) throw new Error('page threw: ' + JSON.stringify(r.result.exceptionDetails).slice(0, 600)); return r.result?.result?.value; };
  const p = { ev, fire: (m) => { ev(`window.__fire && window.__fire(${JSON.stringify(m)})`).catch(() => { }); }, close: () => { pages.delete(p); try { ws.close(); } catch { } } };
  p.go = async () => { await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/?${query}` }); };
  p.shot = async (file) => { if (!SHOTS) return; fs.mkdirSync(SHOTS, { recursive: true }); const [ww, hh] = await ev(`(() => { const b = document.getElementById('win').getBoundingClientRect(); return [Math.ceil(b.width), Math.ceil(Math.min(b.height, 1400))]; })()`); const r = await cdp('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: ww, height: hh, scale: 1 } }); fs.writeFileSync(path.join(SHOTS, file), Buffer.from(r.result.data, 'base64')); };
  pages.add(p);
  return p;
}
const ROWS = `(() => [...document.querySelectorAll('.chan-grow[data-grow^="im/"]')].map((r) => { const g = r.querySelector('.chan-grow-tag'); const rr = r.getBoundingClientRect(); return { key: r.dataset.grow, tag: g ? g.dataset.tag : null, text: g ? g.textContent : '', btns: [...r.querySelectorAll('.chan-judge-btn')].map((b) => b.dataset.judge + ':' + b.title), right: Math.round(rr.right), vis: rr.width > 0 }; }))()`;
const judgedKeys = (rows) => rows.filter((r) => r.tag === 'judged').map((r) => r.key).sort().join();
async function until(p, pred, ms = 8000) { const t = Date.now(); let v; while (Date.now() - t < ms) { v = await p.ev(ROWS).catch(() => []); if (pred(v)) return v; await sleep(50); } return v; }

const waitFor = async (p, expr, pred, ms = 8000) => { const t = Date.now(); let v; while (Date.now() - t < ms) { v = await p.ev(expr).catch(() => null); if (pred(v)) return v; await sleep(50); } return v; };
const DOOR = `document.querySelector('[data-attention-door]')`;
const BLOCK = `(() => { const b = document.querySelector('[data-settings-block="attention"]'); if (!b) return null; const r = b.getBoundingClientRect(); return { rows: [...b.querySelectorAll('.settings-row')].map((x) => ({ label: x.querySelector('.settings-row-label')?.textContent || '', on: x.querySelector('.settings-toggle input') ? x.querySelector('.settings-toggle input').checked : null })), radio: ([...b.querySelectorAll('input[type=radio]')].find((i) => i.checked) || {}).value || null, today: (b.querySelector('[data-attention-today]') || {}).textContent || '', head: (b.querySelector('.settings-subsection-title') || {}).textContent || '', inPop: !!b.closest('.chan-attn-pop'), inSheet: !!b.closest('#chan-attn-sheet'), sw: b.scrollWidth, cw: b.clientWidth, right: Math.round(r.right), vw: innerWidth }; })()`;
const flip = (p, label) => p.ev(`(() => { const r = [...document.querySelectorAll('[data-settings-block="attention"] .settings-row')].find((x) => x.querySelector('.settings-row-label')?.textContent === ${JSON.stringify(label)}); r.querySelector('.settings-toggle input').click(); return true; })()`);
const pick = (p, v) => p.ev(`(document.querySelector('[data-settings-block="attention"] input[type=radio][value="${v}"]').click(), true)`);
const HEADN = `parseInt((document.querySelector('.chan-view-btn[data-view="focus"]') || {}).textContent, 10)`;
const DIRECT = '有人直接发给我、我还没读的', AT_YOU = '有人 @ 了我、我还没读的', JUDGE = '让判断模型挑出需要我的（Decision API）';
const JUDGE_READY = `(() => { const i = document.querySelector('[data-settings-block="attention"] input[data-plugin-feature="decision-api.attention"]'); return !!(i && !i.disabled && i.checked); })()`;
const settled = async (p) => { await waitFor(p, JUDGE_READY, (v) => v === true); await sleep(350); };   // the plugin's answer drawn, the toggle's transition done
const has = (rows, key, tag) => rows.some((r) => r.key === key && (!tag || r.tag === tag));

console.log('① desk 1100 px: the ⚙ door opens the block — the Settings window\'s own rows');
const d = await page(1100, 900, 'w=100%25');
await d.go();
let rows = await until(d, (rs) => has(rs, 'im/c6', 'direct') && judgedKeys(rs) === 'im/c0,im/c4', 12000);
const ayRow = await d.ev(`(() => { const r = document.querySelector('.chan-grow[data-grow="im/c3"]'); const g = r && r.querySelector('.chan-grow-tag'); const l = r && r.querySelector('.chan-grow-last'); return r ? { tag: g ? g.dataset.tag : null, text: g ? g.textContent : '', last: l ? l.textContent : '' } : null; })()`);
ok(ayRow && ayRow.tag === 'at-you' && /@我 · 1 条/.test(ayRow.text) && ayRow.last === 'Dana: can you sign the March invoice today?', 'lane attention-rule-at-you: the @-ed group wears 「@我 · 1 条」 (it outranks its hand-over) and its preview quotes the mentioning message', ayRow);
await d.shot('row.png');
ok(has(rows, 'im/c6', 'direct') && has(rows, 'im/c1', 'assigned') && judgedKeys(rows) === 'im/c0,im/c4', 'the first screen: the direct chat, the hand-overs and the two judged rows', { rows: rows.map((r) => r.key + ':' + r.tag), c6: ((eng.digest({ keys: ['im/c6'] }).conversations || [])[0] || {}) });
await idle();
await d.ev(`(${DOOR}.click(), true)`);
let st = await waitFor(d, BLOCK, (s) => s && /今天：判断了 \d+ 条/.test(s.today));
ok(st && st.inPop && st.rows.length === 12 && st.head === '需关注 · 怎么判断' && st.radio === 'both' && st.rows.filter((r) => r.on === true).length === 9 && st.rows.some((r) => r.label === AT_YOU && r.on === true), 'the door: a popover holding 「需关注 · 怎么判断」 — 12 rows, the preset on 固定规则 + 判断模型, the 8 rules (+ 「有人 @ 了我、我还没读的」, lane attention-rule-at-you) and the judge on', st);
ok(st && /今天：判断了 4 条 · 命中 2 条/.test(st.today), 'the readout under the judge\'s switch: 今天：判断了 4 条 · 命中 2 条 (four rows judged, two at 0.86)', st && st.today);
// lane decision-spend-readout: the same line says what the judge COST today (the PURE decisionTodayLine's money half) —
// four calls to the fake provider moved money, so it is never 「$0」 nor $0.00; the by-use breakdown is the hover
st = await waitFor(d, BLOCK, (s) => s && /已花 /.test(s.today));
const money = await d.ev(`(() => { const l = document.querySelector('[data-settings-block="attention"] [data-attention-today]'); return l ? { text: l.textContent, title: l.title } : null; })()`);
ok(money && /^今天：判断了 4 条 · 命中 2 条 · 已花 (< \$0\.01|\$\d+\.\d\d)（上限 \$1\.00）$/.test(money.text) && !/已花 \$0（|\$0\.00/.test(money.text) && /^需关注 (< )?\$0?\.?\d/.test(money.title), 'the 需关注 block\'s judge line carries the money: 「…命中 2 条 · 已花 <money>（上限 $1.00）」, never $0 after 4 calls; 需关注 $… on hover', money);
await settled(d);
await d.shot('door-desk.png');

console.log('② 「有人直接发给我」 off ⇒ the direct chat leaves the first screen live; it stays under 全部');
const n0 = await d.ev(HEADN);
await flip(d, DIRECT);
rows = await until(d, (rs) => rs.length && !has(rs, 'im/c6'));
const n1 = await d.ev(HEADN);
ok(!has(rows, 'im/c6') && has(rows, 'im/c1', 'assigned') && judgedKeys(rows) === 'im/c0,im/c4', 'flipped off: the direct chat is gone at once (no reload, no fetch) — the hand-overs and judged rows stay', rows.map((r) => r.key + ':' + r.tag));
ok(n0 - n1 === 1, `the header's count drops by one (${n0} → ${n1})`);
await sleep(200);
ok(SV['channels.attention.rule.direct'] === false && (await d.ev(BLOCK) || {}).inPop, 'the switch is a setting like any other (saved), and the door stays open under the hand');
await d.ev(`(document.querySelector('.chan-view-btn[data-view="all"]').click(), true)`);
rows = await until(d, (rs) => has(rs, 'im/c6'));
ok(has(rows, 'im/c6'), 'under 全部 the direct chat is still there', rows.map((r) => r.key));
await d.ev(`(document.querySelector('.chan-view-btn[data-view="focus"]').click(), true)`);
await d.ev(`(${DOOR}.click(), true)`);
await waitFor(d, BLOCK, (s) => s && s.rows.length === 12);
await flip(d, DIRECT);
rows = await until(d, (rs) => has(rs, 'im/c6', 'direct'));
ok(has(rows, 'im/c6', 'direct') && (await d.ev(HEADN)) === n0, 'flipped back on: the direct chat returns and the count with it');

console.log('③ the preset 只用判断模型: every rule off, the judge on ⇒ only judged rows');
await pick(d, 'judge');
st = await waitFor(d, BLOCK, (s) => s && s.radio === 'judge' && s.rows.filter((r) => r.on === true).length === 1);
ok(st && st.rows.filter((r) => r.on === true).map((r) => r.label).join() === JUDGE && plug.config.attention === true, 'the preset set the switches it claims: the 8 rules off, the judge\'s on', st && st.rows.filter((r) => r.on === true).map((r) => r.label));
rows = await until(d, (rs) => rs.length && rs.every((r) => r.tag === 'judged'));
ok(rows.length && rows.every((r) => r.tag === 'judged') && has(rows, 'im/c0') && has(rows, 'im/c4') && !has(rows, 'im/c6'), 'only the judge: every listed row is a judged one', rows.map((r) => r.key + ':' + r.tag));
await pick(d, 'both');
rows = await until(d, (rs) => has(rs, 'im/c6', 'direct') && has(rs, 'im/c1', 'assigned'));
ok(has(rows, 'im/c6', 'direct') && has(rows, 'im/c1', 'assigned') && Object.keys(SV).filter((k) => k.startsWith('channels.attention.rule.')).every((k) => SV[k] === true), 'back to 固定规则 + 判断模型: every rule on, the facts listed again');

console.log('④ the judge\'s switch = the plugin\'s own (one store)');
await waitFor(d, JUDGE_READY, (v) => v === true);   // the preset re-filled the block: its judge's switch re-reads the plugin first
const w0 = PLUG_WRITES.length;
await flip(d, JUDGE);
st = await waitFor(d, BLOCK, (s) => s && s.radio === 'rules');
const vals = await d.ev('window.__vals');
ok(plug.config.attention === false && PLUG_WRITES.length === w0 + 1 && PLUG_WRITES[w0].attention === false && !('channels.attention.judge' in vals) && !SET_KEYS.includes('channels.attention.judge') && !SET_KEYS.includes('channels.attention.preset'), 'off: ONE write to POST /api/plugins/decision-api/config {attention:false}; no settings key for the judge or the preset — ever', { writes: PLUG_WRITES.slice(w0), keys: [...new Set(SET_KEYS)] });
ok(st && st.radio === 'rules', 'the preset reads back 只用固定规则');
await flip(d, JUDGE);
st = await waitFor(d, BLOCK, (s) => s && s.radio === 'both');
ok(plug.config.attention === true && st && st.radio === 'both', 'on again: the plugin\'s switch is on and the preset reads 固定规则 + 判断模型');

console.log('⑤ phone 390 px: the door is a sheet');
const ph = await page(390, 844, 'w=100%25');
await ph.go();
await until(ph, (rs) => has(rs, 'im/c1'));
await ph.ev(`(${DOOR}.click(), true)`);
st = await waitFor(ph, BLOCK, (s) => s && s.inSheet);
ok(st && st.inSheet && st.rows.length === 12 && st.sw <= st.cw + 1 && st.right <= st.vw, 'the sheet: the same 12 rows, nothing wider than the 390 px screen', st && { sw: st.sw, cw: st.cw, right: st.right, vw: st.vw });
await settled(ph);
await ph.shot('door-phone.png');
ph.close();

console.log('⑥ the Settings window: searching 需关注 finds the block');
const sp = await page(900, 1000, 'w=100%25&b=panel&settings=' + encodeURIComponent('需关注'));
await sp.go();
st = await waitFor(sp, BLOCK, (s) => s && s.rows.length);
// int263 seam (b): in the Settings window the threshold + 我在乎什么 are the Decision API plugin's rows (插件 › Decision API, plugin-settings-p0);
// the block draws its own NINE there — the Channels ⚙ door (legs above) draws all eleven (alsoBlock)
ok(st && st.rows.length === 10 && st.head === '需关注 · 怎么判断', 'the window\'s own content renderer, its search 需关注: the block under its head, its own 10 rows', st && st.rows.map((r) => r.label));
await settled(sp);
await sp.shot('settings.png');
sp.close();

console.log('⑦ CONTROL: a panel that ignores the policy');
const cp = await page(1100, 900, 'w=100%25&b=ctl');
await cp.go();
await until(cp, (rs) => has(rs, 'im/c6', 'direct'));
await cp.ev(`(${DOOR}.click(), true)`);
await waitFor(cp, BLOCK, (s) => s && s.rows.length === 12);
await flip(cp, DIRECT);
await sleep(1000);
const cr = await cp.ev(ROWS);
ok(has(cr, 'im/c6'), 'CONTROL: the same flip on a panel whose firstScreen is never handed the policy leaves the direct chat listed ⇒ leg ② is the policy\'s doing (RED without it)', cr.map((r) => r.key));
cp.close();
d.close();

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass} passed, 0 failed)`);
process.exit(fail ? 1 : 0);

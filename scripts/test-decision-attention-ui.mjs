#!/usr/bin/env node
// test-decision-attention-ui — HEAVY (lane decision-attention, D2 of docs/design-decision-api.zh.md; chrome, ZERO vendor
// calls). The REAL Channels panel (an esbuild iife of the tree) in headless chrome (zh, light) over the REAL channels
// router + the REAL channels engine (a fake 'im' account: six rows, two handed to an agent = FACT-tagged) + D1's REAL
// decision engine, whose OpenAI-dialect requests go to a FAKE provider on loopback that answers each call after 1.2 s:
//   ① desk 1100 px: the rows are painted BEFORE any answer came back; then four calls — one record each, all 8 rubric
//     questions, none naming a fact-tagged row — and the two rows the judge put at 0.86 wear the judged chip with p and
//     the clause words (问你 · 截止或钱款) and the ✓ / ✗ pair; a row judged 0.22 does not;
//   ② a reload re-renders the chips with NO new call (the cache + D1's memo);
//   ③ ✗ on a judged row: the chip goes at once, data/decision-examples.json holds the example, the next scan judges the
//     other untagged rows again with it (three calls) — never a fact-tagged row; ✓ on another keeps its chip;
//   ④ "never judge" through the real PUT route: the account's chips are gone; cleared ⇒ back;
//   ⑤ phone 390 px: the chips and the pair fit the screen;
//   ⑥ the settings block (the REAL settings-ui control of `decision.attentionBlock`): "Draft from my recent decisions"
//     places PROPOSED lines in the box — nothing saved until Save; Save saves them.
// PNGs → DECISION_ATTENTION_PNG_DIR: desk.png, phone.png, block.png.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePort, scratch, ONBOARDED_SOURCE } from './scratch.mjs';

const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = process.env.DECISION_ATTENTION_PNG_DIR || '';
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
const root = scratch('decision-attention-ui');
const dataDir = path.join(root, 'data');
fs.mkdirSync(path.join(dataDir, 'channels'), { recursive: true });
fs.writeFileSync(path.join(dataDir, 'channels', 'adapters.json'), JSON.stringify({ v: 1, adapters: [{ id: 'im', kind: 'im', label: 'Team chat', enabled: true, auth: { tokenEnc: null, expiresAt: null, scopes: [] }, lastPass: null, consecutiveFailures: 0, push: { enabled: true, claimedExclusive: 'unknown', state: null, lastEventAt: null, missRate: 0, demotedAt: null, demotedWhy: null, samples: [] }, scan: null }] }));
const T0 = Date.now();
const TITLES = ['Invoice URGENT', 'Handed one', 'Lunch plans', 'Handed two URGENT', 'Contract URGENT', 'Newsletter'];
const W = new Map(TITLES.map((title, i) => [`c${i}`, { id: `c${i}`, title, recs: [0, 1].map((k) => ({ vendorId: `c${i}-m${k}`, at: T0 - (i + 2) * 60e3 + k * 1000, author: { id: 'u1', name: 'Ada', isSelf: false, isBot: false }, text: k ? `${title}: can you look at this today?` : 'earlier line' })) }]));
const registry = CH.createChannelRegistry();
registry.register({
  kind: 'im', caps: { ...fake.fakePoll.caps, receive: 'poll', attachments: 'fetch', olderHistory: 'page', budget: { unit: 'request', default: 100000, settingKey: null, metered: true } },
  create(record) {
    const rec = (id, m) => REC.makeRecord({ adapterId: record.id, convId: id, vendorId: m.vendorId, at: m.at, author: m.author, text: m.text, attachments: [], threadKey: id, raw: {} });
    return {
      auth: { async state() { return { state: 'connected', expiresAt: null, scopes: ['x'], why: null }; } },
      async listConversations() { return { conversations: [...W.values()].map((x) => REC.makeConversation({ id: x.id, title: x.title, kind: 'group', lastAt: x.recs[1].at })), cursor: null, complete: true }; },
      async convCaps() { return { read: 'yes', sendAs: [], why: 'read-only-mailbox', at: Date.now() }; },
      async history(id) { const x = W.get(id); return { records: x.recs.map((m) => rec(id, m)), anchor: x.recs[1].vendorId, reachedAnchor: true, complete: true }; },
      async older() { return { records: [], exhausted: true }; },
    };
  },
});
const decision = DE.create({ dataDir, integrations: { resolveIntegration: () => ({ values: { provider: 'openai', apiKey: 'sk-fake-ui', model: '' }, source: 'user' }) }, baseUrlFor: { openai: `http://127.0.0.1:${PPORT}` }, log: quiet });
let plug = { enabled: true, config: { attention: false } };   // OFF while the fixture is built: the page's first read starts the judging
decision.attachPlugin({ peek: () => plug });
const pages = new Set();
const eng = ENG.create({ dataDir, registry, env: {}, broadcast: (m) => { for (const p of pages) p.fire(m); }, serverSetting: (k) => (k === 'decision.attentionBlock' ? 'Invoices and contracts matter to me.' : undefined), liveSessions: () => [], deliver: null, log: quiet, decisionEngine: decision });
await eng.pass('im', { force: true });
for (const id of ['c1', 'c3']) await eng.setAssignment('im', id, { principal: { kind: 'agent', id: `cid-${id}`, name: 'Ops desk' }, mode: 'all' });
plug = { enabled: true, config: { attention: true } };
const idle = async () => { for (let i = 0; i < 300 && !eng.attention.idle(); i++) await sleep(25); };

// ── the bundles: the REAL panel, the REAL settings control ──
const dir = path.join(root, 'web');
fs.mkdirSync(dir, { recursive: true });
const build = (name, entry) => esbuild.build({ stdin: { contents: entry, resolveDir: repo, loader: 'js' }, bundle: true, format: 'iife', platform: 'browser', target: 'es2020', outfile: path.join(dir, name), loader: { '.css': 'empty' }, logLevel: 'error' });
await build('panel.js', `import { renderChannelsPanel } from ${JSON.stringify(path.join(repo, 'src/lib/channels-panel.js'))};
const hs = new Set();
const app = { ws: { onGlobal: (h) => { hs.add(h); return () => hs.delete(h); }, offGlobal: (h) => hs.delete(h), onStateChange() {}, offStateChange() {} }, wm: { windows: new Map(), createWindow() { throw new Error('no wm'); } }, openChannel: () => {} };
window.__fire = (m) => { for (const h of [...hs]) h(m); };
renderChannelsPanel(app, document.getElementById('host'));`);
await build('block.js', `import { SettingsUI } from ${JSON.stringify(path.join(repo, 'src/lib/settings-ui.js'))};
import { SETTINGS_SCHEMA } from ${JSON.stringify(path.join(repo, 'src/lib/settings-schema.js'))};
const vals = { 'decision.attentionBlock': 'Anything from my manager.' }; window.__sets = [];
const settings = { get: (k) => vals[k] ?? '', set: (k, v) => { vals[k] = v; window.__sets.push([k, v]); }, isModified: (k) => !!vals[k] };
const ui = new SettingsUI({ settings });
const row = document.createElement('div'); row.className = 'settings-row';
const sc = SETTINGS_SCHEMA['decision.attentionBlock'];
row.innerHTML = '<div class="settings-row-info"><div class="settings-row-label"></div><div class="settings-row-desc"></div></div><div class="settings-row-control"></div>';
row.querySelector('.settings-row-label').textContent = sc.label; row.querySelector('.settings-row-desc').textContent = sc.description;
row.querySelector('.settings-row-control').appendChild(ui._createControl('decision.attentionBlock', sc, row));
document.getElementById('host').appendChild(row);`);

// ── the page server: the REAL channels router + the bundles + style.css ──
const app = express();
app.use(express.json());
const routes = require(path.join(repo, 'src/routes/channels.js'));
routes.setup({ getEngine: () => eng });
app.use(routes.router);
app.get('/api/channel-groups', (req, res) => res.json({ groups: [] }));
app.all('/api/user-state', (req, res) => res.json(req.method === 'GET' ? { channelsPanelFolds: { internal: false, 'acct:im': false } } : { ok: true }));
app.get('/style.css', (req, res) => res.type('css').send(fs.readFileSync(path.join(repo, 'public/style.css'))));
app.get('/:b.js', (req, res) => res.type('js').send(fs.readFileSync(path.join(dir, req.params.b + '.js'))));
app.get('/', (req, res) => res.type('html').send(`<!doctype html><html data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/style.css"><style>body{margin:0;background:var(--bg-root)} #win{background:var(--bg-window);width:${req.query.w || '520px'};min-height:100vh;box-sizing:border-box;padding:10px 8px}</style><script>try{localStorage.setItem('vibespace.lang','zh')}catch{}</script></head><body><div id="win"><div id="host" class="rail-panel rail-panel-channels chan-window"></div></div><script src="/${req.query.b || 'panel'}.js"></script></body></html>`));
const PORT = await freePort();
const srv = await new Promise((r) => { const s = app.listen(PORT, '127.0.0.1', () => r(s)); });

const CDP_PORT = await freePort();
const chromeDir = scratch('decision-attention-ui-chrome');
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

console.log('① desk 1100 px: the rows first, then the judged chips');
const d = await page(1100, 900, 'w=100%25');
await d.go();
const painted = await until(d, (rows) => rows.some((r) => r.key === 'im/c1' && r.vis));
const paintAt = Date.now();
const answeredBefore = got.filter((g) => g.answeredAt && g.answeredAt <= paintAt).length;
ok(painted.some((r) => r.key === 'im/c1' && r.tag === 'assigned') && answeredBefore === 0, `the first screen is painted (the fact rows) while NO judgment has come back yet (${answeredBefore} answered at paint; the provider answers after ${DELAY} ms)`, painted);
const judged = await until(d, (rows) => judgedKeys(rows) === 'im/c0,im/c4', 10000);
const chipAt = Date.now();
ok(judgedKeys(judged) === 'im/c0,im/c4', `the two rows judged 0.86 wear the judged chip ${chipAt - paintAt} ms after the paint (patched in by the broadcast)`, judged);
const c0 = judged.find((r) => r.key === 'im/c0') || {};
ok(/需要你 · 0\.86/.test(c0.text) && c0.text.includes('问你') && c0.text.includes('截止或钱款') && !/URGENT|probability|needs_now/.test(c0.text), 'the chip says 需要你 · 0.86 · 问你、截止或钱款 — our words, nothing of the vendor\'s', c0.text);
ok(c0.btns.length === 2 && c0.btns[0].startsWith('needs:') && c0.btns[1].startsWith('not:'), 'a judged row carries the ✓ / ✗ pair (with tooltips)', c0.btns);
ok(!judged.some((r) => r.key === 'im/c2' && r.tag === 'judged'), 'Lunch plans (judged 0.22) has no chip');
await sleep(300);
ok(got.length === 4 && got.every((g) => g.body.questions.length === 8 && (String(g.body.input).match(/\[record\]/g) || []).length === 1) && !got.some((g) => /Handed/.test(g.body.input)), `four records ⇒ four calls (${got.length}), each ONE record with the full 8-question rubric; no fact-tagged row was sent`, got.map((g) => recordPart(g.body.input).slice(0, 40)));
await d.shot('desk.png');

console.log('② a reload re-renders the chips with no new call');
await idle();
let n = got.length;
await d.go();
const again = await until(d, (rows) => judgedKeys(rows) === 'im/c0,im/c4');
await sleep(400);
ok(judgedKeys(again) === 'im/c0,im/c4' && got.length === n, `after the reload the chips are drawn from the first read, ${got.length - n} new calls`, got.slice(n).map((g) => [g.at - T0, recordPart(g.body.input).slice(0, 60)]).concat(got.slice(0, n).map((g) => [g.at - T0, recordPart(g.body.input).slice(0, 30)])));

console.log('③ ✗ on a judged row: the chip goes at once, an example is written, the others are judged again with it');
await idle();
n = got.length;
await d.ev(`document.querySelector('.chan-grow[data-grow="im/c0"] .chan-judge-btn[data-judge="not"]').click()`);
const afterNot = await until(d, (rows) => !rows.some((r) => r.key === 'im/c0' && r.tag === 'judged'), 3000);
const exFile = path.join(dataDir, 'decision-examples.json');
const ex = fs.existsSync(exFile) ? JSON.parse(fs.readFileSync(exFile, 'utf8')).examples : [];
ok(!afterNot.some((r) => r.key === 'im/c0' && r.tag === 'judged') && ex.length === 1 && ex[0].key === 'im/c0' && ex[0].verdict === 'not' && got.length === n, 'the chip is gone at once (no call) and data/decision-examples.json holds {im/c0, not}', ex);
await d.go();   // the next first read: the examples moved the memo keys of the other rows
for (let i = 0; i < 160 && got.length - n < 3; i++) await sleep(50);
await idle();
await sleep(300);
const re = got.slice(n);
ok(re.length === 3 && re.every((g) => String(g.body.input).includes('→ not')) && !re.some((g) => /Handed|Invoice/.test(recordPart(g.body.input))), `the next first read judged the 3 other untagged rows again, each input carrying the example; no fact row, not the labeled row (${re.length})`, re.map((g) => recordPart(g.body.input).slice(0, 40)));
await d.ev(`document.querySelector('.chan-grow[data-grow="im/c4"] .chan-judge-btn[data-judge="needs"]').click()`);
await sleep(500);
const afterYes = await d.ev(ROWS);
ok(afterYes.some((r) => r.key === 'im/c4' && r.tag === 'judged') && JSON.parse(fs.readFileSync(exFile, 'utf8')).examples[0].verdict === 'needs', '✓ on Contract URGENT keeps its chip and is the newest example');

console.log('④ never judge this account (the real PUT route)');
const put = (body) => fetch(`http://127.0.0.1:${PORT}/api/channels/adapters/im`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json());
const pj = await put({ judge: 'never' });
await d.go();
const never = await until(d, (rows) => rows.some((r) => r.key === 'im/c1') && !rows.some((r) => r.tag === 'judged'));
ok(pj.ok && pj.judge === 'never' && !never.some((r) => r.tag === 'judged'), '"never judge": the account\'s chips are gone', pj);
await put({ judge: null });
await d.go();
const back = await until(d, (rows) => rows.some((r) => r.key === 'im/c4' && r.tag === 'judged'));
ok(back.some((r) => r.key === 'im/c4' && r.tag === 'judged'), 'cleared: the chip is back');
d.close();

console.log('⑤ phone 390 px');
const ph = await page(390, 844, 'w=100%25');
await ph.go();
const prow = await until(ph, (rows) => rows.some((r) => r.key === 'im/c4' && r.tag === 'judged'));
const vw = await ph.ev('[document.documentElement.clientWidth, document.documentElement.scrollWidth]');
ok(prow.some((r) => r.key === 'im/c4' && r.tag === 'judged' && r.btns.length === 2) && vw[1] <= vw[0] && prow.every((r) => r.right <= vw[0]), 'the judged chip and its pair on a phone; nothing wider than the screen', { vw, prow });
await ph.shot('phone.png');
ph.close();

console.log('⑥ the settings block: "Draft from my recent decisions" proposes, never saves');
await idle();
n = got.length;
const sp = await page(1100, 700, 'b=block&w=720px');
await sp.go();
for (let i = 0; i < 80; i++) { if (await sp.ev(`!!document.querySelector('[data-draft="decision"]')`).catch(() => false)) break; await sleep(100); }
await sp.ev(`document.querySelector('[data-draft="decision"]').click()`);
let st = null;
for (let i = 0; i < 100; i++) { st = await sp.ev(`(() => { const ta = document.querySelector('.settings-multiline-text'); const sv = [...document.querySelectorAll('.settings-multiline .settings-link-btn')].find((b) => !b.dataset.draft); return { value: ta.value, sets: window.__sets.length, save: sv && !sv.hidden }; })()`); if (st.value.split('\n').length > 1) break; await sleep(100); }
ok(st.value.startsWith('Anything from my manager.') && /money, invoices or payments/i.test(st.value) && st.sets === 0 && st.save, 'the proposed lines land in the box under the person\'s own text — NOT saved (0 sets), the Save button shown', st);
ok(got.slice(n).length === 2 && got.slice(n).every((g) => g.body.questions.length === 20), `the draft asked the 20 catalogue questions of each of the 2 labeled examples (${got.slice(n).length} calls)`);
await sp.shot('block.png');
await sp.ev(`[...document.querySelectorAll('.settings-multiline .settings-link-btn')].find((b) => !b.dataset.draft).click()`);
const saved = await sp.ev('window.__sets');
ok(saved.length === 1 && saved[0][0] === 'decision.attentionBlock' && /money/i.test(saved[0][1]), 'Save saves the edited block (one set)', saved);
sp.close();

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass} passed, 0 failed)`);
process.exit(fail ? 1 : 0);

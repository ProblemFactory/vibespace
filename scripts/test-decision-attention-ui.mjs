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
//     places PROPOSED lines in the box — nothing saved until Save; Save saves them;
//   ⑦ 「从我的判定起草」 (lane rule-learning, design q-037 P0): the OpenAI row of ①–⑥ ⇒ GET / POST
//     /api/channels/decision/learn answer 404 by name and the row draws NO drafter button (the census of [data-draft]); an
//     agent token ⇒ 403; an OpenRouter row ⇒ the button replaces the catalogue's, a press = ONE chat request to the fake
//     (provider {zdr: true, data_collection: deny}; only the examples' digests + the block — never a body), and the card
//     under the box: 3 proposed lines (an edit with its evidence chip, a new line, and one `unsupported` — 「无依据」, NOT
//     ticked), the model + price + zero-data-retention sentence, the note under ONE 技术细节 fold, no raw JSON; nothing
//     saved until 保存, which writes the edited, ticked lines (one set); phone 390 the card fits and 放弃 writes nothing;
//   ⑧ lane rule-learning-fix (verify r1 F2 / F3): a 152-character block line the model KEPT (its copy cut at 120) ⇒ the
//     card shows the WHOLE line, ticked 原样保留, and 保存 writes it whole; an 11-line block + 12 new lines ⇒ the card
//     counts what 保存 would write — 「超出 1 500 字符（N）——去掉几行或缩短后再保存」, 保存 disabled, a press writes
//     nothing; unticking new lines releases it and 保存 writes ALL 11 kept lines; the row's door refuses a 1 600-character
//     value by name (a toast, no set) — never a slice.
//   ⑨ lane rule-learning-fix-r2 (verify r2 F4 / F5 / F6 / G7): a 156-character edit ⇒ 「太长——已截短」, NOT ticked, its
//     box cut at a word boundary without a marker, the whole text under the row's own closed 技术细节 fold; ONE header per
//     kind (「提议删掉的行」 over the named removal only, 「保留的原文」 over the line that stays); a real click on the cut
//     rewording unticks the line it rewords and that row says so; the default 保存 writes the person's lines; phone 390
//     fits; a block STORED at 1 768 characters ⇒ 「原文已超过 1 500 字符（1768）——保存前要截掉 268 字」 at the card's top,
//     every stored line a row, 保存 waits — three real unticks release it and 保存 writes 11 whole lines.
//   ⑩ lane learn-card-untick (verify r3 R3-F1): a PRE-TICKED rewording (「已勾选：这一行将被改写」) — the line it rewords
//     has its own row under 保留的原文, unticked, 「已由上面的改写替换——要留原文就取消上面的勾」; a real click unticks the
//     rewording ⇒ the line is ticked again and both rows say so; 保存 writes the person's line (r3: it was dropped, unsaid).
// PNGs → DECISION_ATTENTION_PNG_DIR: desk.png, phone.png, block.png, learn-desk.png, learn-phone.png, learn-long-kept.png,
// learn-over.png, learn-cut-headers.png, learn-cut-fold.png, learn-cut-phone.png, learn-stored-over.png, learn-untick.png.
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
// lane rule-learning: the fake's OpenRouter chat completions route (the text-model client) — its own log, ONE proposal
const chats = [];
const PROPOSAL = { lines: [
  { text: 'Invoices, contracts and payments', kind: 'edit', line: 1, from: [1, 2], evidence: '两次都和合同或款项有关' },
  { text: 'Outages and incidents', kind: 'add', line: null, from: [2], evidence: '一次故障需要你' },
  { text: 'Anything from the board', kind: 'add', line: null, from: [], evidence: '' },
], removed: [], note: 'One line has no example behind it.' };
let proposalNow = PROPOSAL;   // ⑧ swaps the fake's proposal
let serverBlock = 'Invoices and contracts matter to me.';   // ⑧ swaps the owner's block the server reads
const recordPart = (input) => String(input).split('———').pop();
const prov = http.createServer((req, res) => {
  let b = ''; req.on('data', (c) => { b += c; });
  req.on('end', async () => {
    const body = JSON.parse(b);
    if (req.url === '/api/v1/chat/completions') {
      chats.push({ at: Date.now(), body, raw: b, auth: req.headers.authorization || '' });
      await sleep(300);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ id: 'gen-1', model: body.model, choices: [{ message: { role: 'assistant', content: JSON.stringify(proposalNow) } }], usage: { prompt_tokens: Math.ceil(b.length / 4), completion_tokens: 120, cost: 0.0062 } }));
    }
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
const keyRow = { provider: 'openai', apiKey: 'sk-fake-ui', model: '' };   // ⑦ turns it into an OpenRouter row
const decision = DE.create({ dataDir, integrations: { resolveIntegration: () => ({ values: { ...keyRow }, source: 'user' }) }, baseUrlFor: { openai: `http://127.0.0.1:${PPORT}`, openrouter: `http://127.0.0.1:${PPORT}` }, log: quiet });
let plug = { enabled: true, config: { attention: false } };   // OFF while the fixture is built: the page's first read starts the judging
decision.attachPlugin({ peek: () => plug, settings: () => plug.config || {} }); // lane plugin-settings-p0: the engine reads the settings rows
const pages = new Set();
const eng = ENG.create({ dataDir, registry, env: {}, broadcast: (m) => { for (const p of pages) p.fire(m); }, serverSetting: (k) => (k === 'decision.attentionBlock' ? serverBlock : undefined), liveSessions: () => [], deliver: null, log: quiet, decisionEngine: decision });
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
row.classList.add('settings-row-stack');   // as SettingsUI's own row does for a textarea control (settings-ui.js _renderRow) — the card's width follows the row
document.getElementById('host').appendChild(row);`);

// ── the page server: the REAL channels router + the bundles + style.css ──
const app = express();
app.use(express.json());
const routes = require(path.join(repo, 'src/routes/channels.js'));
routes.setup({ getEngine: () => eng });
app.use(routes.router);
app.get('/api/channel-groups', (req, res) => res.json({ groups: [] }));
// lane attention-predicate-shared: 「相关」 open (`related: false`) — these legs read the hand-overs' rows, which fold under it by default
app.all('/api/user-state', (req, res) => res.json(req.method === 'GET' ? { channelsPanelFolds: { internal: false, related: false, 'acct:im': false } } : { ok: true }));
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
  // lane rule-learning-fix: the last `h` px of the page down to the bottom of `sel` (a long card's notice + buttons)
  p.shotBottom = async (file, sel, h = 900) => { if (!SHOTS) return; fs.mkdirSync(SHOTS, { recursive: true }); const [ww, bottom] = await ev(`(() => { const b = document.getElementById('win').getBoundingClientRect(), e = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return [Math.ceil(b.width), Math.ceil(e.bottom + window.scrollY + 12)]; })()`); const y = Math.max(0, bottom - h); const r = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y, width: ww, height: bottom - y, scale: 1 } }); fs.writeFileSync(path.join(SHOTS, file), Buffer.from(r.result.data, 'base64')); };
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

console.log('⑦ 「从我的判定起草」 (lane rule-learning): no OpenRouter key ⇒ no button, no route; with one ⇒ the proposal card, saved only by 保存');
const api = (method, url, headers = {}) => fetch(`http://127.0.0.1:${PORT}${url}`, { method, headers }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
const g404 = await api('GET', '/api/channels/decision/learn'), p404 = await api('POST', '/api/channels/decision/learn');
ok(g404.status === 404 && g404.body.code === 'no-learn' && g404.body.why === 'not-openrouter' && p404.status === 404 && p404.body.code === 'no-learn' && chats.length === 0, 'the OpenAI row of ①–⑥ ⇒ GET and POST /api/channels/decision/learn answer 404 by name (no-learn · not-openrouter), 0 chat requests', [g404, p404]);
const drafts = (p) => p.ev(`[...document.querySelectorAll('[data-draft]')].map((b) => b.dataset.draft + ':' + b.textContent)`);
const np = await page(1100, 700, 'b=block&w=720px');
await np.go();
for (let i = 0; i < 80; i++) { if (await np.ev(`!!document.querySelector('[data-draft]')`).catch(() => false)) break; await sleep(100); }
await sleep(800);   // the GET has answered (404)
const noKeyBtns = await drafts(np);
ok(noKeyBtns.length === 1 && noKeyBtns[0].startsWith('decision:') && !(await np.ev(`!!document.querySelector('[data-draft="learn"], [data-learn-card]')`)), 'and the row draws NO drafter button — the catalogue draft stays the only door (census of [data-draft])', noKeyBtns);
np.close();
keyRow.provider = 'openrouter'; keyRow.apiKey = ['sk-or-v1-', 'a'.repeat(48)].join('');
const ag = await api('POST', '/api/channels/decision/learn', { authorization: 'Bearer vsst_' + 'b'.repeat(24) });
const agG = await api('GET', '/api/channels/decision/learn', { authorization: 'Bearer vsst_' + 'b'.repeat(24) });
ok(ag.status === 403 && agG.status === 403 && chats.length === 0, 'an agent token ⇒ 403 on both verbs — the owner\'s block is never drafted for an agent; 0 chat requests', [ag.status, agG.status]);
const g200 = await api('GET', '/api/channels/decision/learn');
ok(g200.status === 200 && g200.body.exists && g200.body.label === 'Gemini 3.8 Flash' && g200.body.model === 'google/gemini-3.8-flash', 'an OpenRouter row with a key ⇒ GET answers the drafter (Gemini 3.8 Flash by default)', g200);
const CARD = `(() => { const c = document.querySelector('[data-learn-card]'); if (!c) return null; const vw = document.documentElement.clientWidth; return {
  head: c.querySelector('.learn-card-head').textContent, sub: c.querySelector('.learn-card-sub').textContent, text: c.innerText,
  rows: [...c.querySelectorAll('.learn-rows:not(.learn-removed) > .learn-row')].map((r) => ({ op: r.dataset.op, un: r.dataset.unsupported === '1', tick: r.querySelector('.learn-tick').checked, text: r.querySelector('.learn-text').value, chip: (r.querySelector('.learn-chip') || {}).textContent, ev: (r.querySelector('.learn-evidence') || {}).textContent || '', evTitle: (r.querySelector('.learn-evidence') || {}).title || '', none: (r.querySelector('.learn-none') || {}).textContent || '', why: (r.querySelector('.learn-why') || {}).textContent || '' })),
  folds: [...c.querySelectorAll('[data-fold="tech"]')].map((f) => ({ open: f.open, text: f.textContent })), btns: [...c.querySelectorAll('.learn-actions button')].map((b) => b.textContent),
  wide: [...c.querySelectorAll('*')].filter((e) => e.getBoundingClientRect().right > vw + 0.5).length, sw: document.documentElement.scrollWidth, vw,
  ticks: [...c.querySelectorAll('.learn-tick')].map((t) => Math.round(t.getBoundingClientRect().height)), act: [...c.querySelectorAll('.learn-actions button')].map((b) => Math.round(b.getBoundingClientRect().height)),
}; })()`;
const press = async (p) => {
  for (let i = 0; i < 80; i++) { if (await p.ev(`!!document.querySelector('[data-draft="learn"]')`).catch(() => false)) break; await sleep(100); }
  const btns = await drafts(p);
  await p.ev(`document.querySelector('[data-draft="learn"]').click()`);
  let c = null;
  for (let i = 0; i < 100 && !c; i++) { await sleep(100); c = await p.ev(CARD); }
  return { btns, c };
};
const lp = await page(1100, 900, 'b=block&w=720px');
await lp.go();
const { btns: keyBtns, c } = await press(lp);
ok(keyBtns.length === 1 && keyBtns[0] === 'learn:从我的判定起草', 'with the key the catalogue button GAVE WAY to 「从我的判定起草」 (one draft door)', keyBtns);
ok(chats.length === 1 && JSON.stringify(chats[0].body.provider) === JSON.stringify({ zdr: true, data_collection: 'deny' }) && chats[0].body.model === 'google/gemini-3.8-flash' && chats[0].body.response_format.json_schema.strict === true, 'a press = ONE chat request to the fake: the zero-data-retention routing, the strict schema, the Flash tier', chats.map((x) => x.body.provider));
const sentUser = chats[0] ? chats[0].body.messages[1].content : '';
ok(/\[block\] 1 line\n1\. Invoices and contracts matter to me\./.test(sentUser) && /#1 (needs|not) · /.test(sentUser) && /Contract URGENT/.test(sentUser) && !/earlier line/.test(chats[0] ? chats[0].raw : 'earlier line') && !/sk-or-v1/.test(chats[0] ? chats[0].raw : ''), 'it carried the block + the examples\' digests ONLY — the older message of the conversation (never in a digest) and the key are not in the body', sentUser.slice(0, 260));
ok(c && c.head === 'Gemini 3.8 Flash 读了你的 2 个判定，提议 3 行' && /你标的 2 个 · 推断 0 个/.test(c.sub) && /摘要经 OpenRouter 送到零数据保留端点/.test(c.sub) && /\$0\.006/.test(c.sub), 'the head says who did what to which thing (the model read 2 of your decisions, proposes 3 lines); the sub: own / inferred, the ZDR sentence, the price', c && [c.head, c.sub]);
ok(c && c.rows.length === 3 && c.rows[0].op === 'edit' && c.rows[0].tick && c.rows[0].chip === '改写' && c.rows[0].ev === '依据 #1 #2' && /#1 [✓✗] /.test(c.rows[0].evTitle) && /原来：Invoices and contracts matter to me\./.test(c.rows[0].why)
  && c.rows[1].op === 'add' && c.rows[1].tick && c.rows[1].chip === '新增' && c.rows[1].ev === '依据 #2'
  && c.rows[2].un && !c.rows[2].tick && c.rows[2].none === '无依据' && !c.rows[2].ev, 'the 3 lines: an edit (改写 · 依据 #1 #2, the digests in its title, what it was), a new line (新增 · 依据 #2), and the UNSUPPORTED one — 「无依据」, NOT ticked', c && c.rows);
ok(c && c.folds.length === 1 && !c.folds[0].open && c.folds[0].text.includes('One line has no example behind it.') && !/[{}]|"lines"|\bkind\b|unsupported|json/i.test(c.text.replace(c.folds[0].text, '')) && c.btns.join() === '放弃,保存', 'card grammar: the model\'s note only under ONE closed 技术细节 fold, no raw JSON anywhere; 放弃 · 保存', c && { folds: c.folds, btns: c.btns });
ok(await lp.ev('window.__sets.length') === 0, 'nothing is saved by the proposal (0 sets) — the route never writes');
await lp.shot('learn-desk.png');
await lp.ev(`(() => { const t = document.querySelector('[data-learn-card] .learn-text'); t.value = 'Invoices, contracts and payments due'; t.dispatchEvent(new Event('input', { bubbles: true })); })()`);
await lp.ev(`document.querySelector('[data-learn-card] .learn-save').click()`);
await sleep(200);
const savedL = await lp.ev('window.__sets');
const after = await lp.ev(`({ card: !!document.querySelector('[data-learn-card]'), box: document.querySelector('.settings-multiline-text').value })`);
ok(savedL.length === 1 && savedL[0][0] === 'decision.attentionBlock' && savedL[0][1] === 'Invoices, contracts and payments due\nOutages and incidents' && !after.card && after.box === savedL[0][1], '保存 writes ONE set through the settings door: the edited line + the ticked new line (the unticked unsupported one is not written); the card closes, the box shows it', { savedL, after });
lp.close();
const jl = fs.readFileSync(path.join(dataDir, 'decision-journal.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((j) => j.use === 'learn');
ok(jl.length === 1 && jl[0].outcome === 'ok' && jl[0].zdr === true && jl[0].usd === 0.0062 && decision.status().today.byUse.learn.usd === 0.0062, 'the engine journalled ONE learn call (zdr true, usd = the vendor\'s usage.cost 0.0062) and counted it in the day', jl);
const pp = await page(390, 844, 'b=block&w=100%25');
await pp.go();
const { c: pc } = await press(pp);
ok(pc && pc.rows.length === 3 && pc.wide === 0 && pc.sw <= pc.vw && pc.ticks.every((h) => h >= 20) && pc.act.every((h) => h >= 32), `phone 390: the card fits (nothing past ${pc && pc.vw} px, scrollWidth ${pc && pc.sw}); ticks ≥ 20 px, 放弃 / 保存 ≥ 32 px tall`, pc && { wide: pc.wide, sw: pc.sw, ticks: pc.ticks, act: pc.act });
await pp.shot('learn-phone.png');
await pp.ev(`document.querySelector('[data-learn-card] .learn-discard').click()`);
await sleep(150);
ok(!(await pp.ev(`!!document.querySelector('[data-learn-card]')`)) && (await pp.ev('window.__sets.length')) === 0 && chats.length === 2, '放弃 drops the card and writes nothing (0 sets); two presses = two chat requests in all');
pp.close();

console.log('⑧ lane rule-learning-fix: a long kept line saved whole (F2), the 1 500 count and its notice (F3), the door refuses by name');
const FIT = `(() => { const c = document.querySelector('[data-learn-card]'); if (!c) return null; const f = c.querySelector('.learn-fit'), s = c.querySelector('.learn-save'); return { shown: !!f && !f.hidden && f.getBoundingClientRect().height > 0, text: f ? f.textContent : null, state: f ? f.dataset.state : null, save: s.textContent, disabled: s.disabled, ticks: [...c.querySelectorAll('.learn-tick')].map((t) => t.checked) }; })()`;
const LONG_LINE = 'Anything my manager or the finance team sends about invoices, contracts or payments that are due this week, and anything that asks me to approve or sign';
serverBlock = LONG_LINE;
proposalNow = { lines: [{ text: LONG_LINE.slice(0, 52) + ' …[70 characters omitted]… ' + LONG_LINE.slice(-30), kind: 'keep', line: 1, from: [], evidence: '' }], removed: [], note: '' };
const fp = await page(1100, 900, 'b=block&w=720px');
await fp.go();
const { c: fc } = await press(fp);
const ff = await fp.ev(FIT);
ok(fc && fc.rows.length === 1 && fc.rows[0].op === 'keep' && fc.rows[0].tick && !fc.rows[0].un && fc.rows[0].chip === '原样保留' && fc.rows[0].text === LONG_LINE && !fc.rows[0].none && ff && !ff.shown && ff.save === '保存' && !ff.disabled,
  `F2: the ${LONG_LINE.length}-character line the model kept (its copy cut at 120 with an elision) ⇒ ONE row, ticked 原样保留, the box holds the WHOLE line — no 无依据, no notice, 「保存」`, { row: fc && fc.rows[0], fit: ff });
await fp.shot('learn-long-kept.png');
const setsF2 = await fp.ev('window.__sets.length');
await fp.ev(`document.querySelector('[data-learn-card] .learn-save').click()`);
await sleep(150);
const savedF2 = (await fp.ev('window.__sets')).slice(setsF2);
ok(savedF2.length === 1 && savedF2[0][1] === LONG_LINE, 'F2: 保存 writes the block WHOLE through the settings door (verify r1 saw "" written here)', savedF2);
fp.close();
const OWN11 = Array.from({ length: 11 }, (_, i) => `rule ${String(i + 1).padStart(2, '0')}: ` + `the person's own words about what matters, line ${i + 1} `.repeat(3).slice(0, 118));
serverBlock = OWN11.join('\n');
proposalNow = { lines: Array.from({ length: 12 }, (_, i) => ({ text: `new criterion ${i + 1}: messages about the quarterly budget review that ask me directly`, kind: 'add', line: null, from: [1], evidence: 'seen in #1' })), removed: [], note: '' };
const op = await page(1100, 2300, 'b=block&w=720px');   // tall enough that the long card's bottom (the notice, 保存) is rendered
await op.go();
const { c: oc } = await press(op);
const of1 = await op.ev(FIT);
const nOver = Number((/（(\d+)）/.exec((of1 && of1.text) || '') || [])[1]);
ok(oc && oc.rows.length === 12 && of1 && of1.shown && of1.state === 'over' && of1.text === `超出 1 500 字符（${nOver}）——去掉几行或缩短后再保存` && nOver > 1500 && of1.disabled && of1.ticks.filter(Boolean).length === 23,
  `F3: 11 kept lines + 12 new ⇒ the card counts what 保存 would write (${nOver}) and says 「超出 1 500 字符（${nOver}）——去掉几行或缩短后再保存」; 保存 is disabled`, of1);
await op.shotBottom('learn-over.png', '[data-learn-card]');
const setsF3 = await op.ev('window.__sets.length');
await op.ev(`document.querySelector('[data-learn-card] .learn-save').click()`);
await sleep(100);
ok((await op.ev('window.__sets.length')) === setsF3 && (await op.ev(`!!document.querySelector('[data-learn-card]')`)), 'F3: a press on the disabled 保存 writes NOTHING (never a slice) and the card stays');
await op.ev(`[...document.querySelectorAll('[data-learn-card] .learn-rows:not(.learn-removed) .learn-tick')].slice(1).forEach((t) => t.click())`);
const of2 = await op.ev(FIT);
ok(of2 && !of2.shown && !of2.disabled && of2.save === '保存', 'F3: unticking 11 of the new lines (real clicks ⇒ the change events) brings it under — the notice goes, 保存 is pressable', of2);
await op.ev(`document.querySelector('[data-learn-card] .learn-save').click()`);
await sleep(150);
const savedF3 = (await op.ev('window.__sets')).slice(setsF3);
ok(savedF3.length === 1 && OWN11.every((l) => savedF3[0][1].split('\n').includes(l)) && savedF3[0][1].length <= 1500 && !(await op.ev(`!!document.querySelector('[data-learn-card]')`)), `F3: 保存 writes the one new line + ALL 11 kept lines (${savedF3[0] ? savedF3[0][1].length : 0} chars) — nothing cut; the card closes`, savedF3.map((x) => x[1].length));
const setsDoor = await op.ev('window.__sets.length');
const door = await op.ev(`(async () => { const ta = document.querySelector('.settings-multiline-text'); ta.value = 'z'.repeat(1600); ta.dispatchEvent(new Event('change')); await new Promise((r) => setTimeout(r, 100)); return { sets: window.__sets.length, toasts: [...document.querySelectorAll('.global-toast-body')].map((x) => x.textContent) }; })()`);
ok(door.sets === setsDoor && door.toasts.some((x) => x === '没有保存——1600 个字符，最多 1500'), 'the row\'s write door refuses a 1 600-character value BY NAME (「没有保存——1600 个字符，最多 1500」) and writes nothing — the old door sliced it silently', door);
op.close();

console.log('⑨ lane rule-learning-fix-r2 (verify r2 F4 / F5 / F6 / G7): a cut line unticked with its own fold, one header per kind, a block stored over 1 500 said');
const R9 = `(() => { const c = document.querySelector('[data-learn-card]'); if (!c) return null; const vw = document.documentElement.clientWidth; return {
  rows: [...c.querySelectorAll('.learn-rows:not(.learn-removed) > .learn-row')].map((r) => ({ op: r.dataset.op, long: r.dataset.long === '1', tick: r.querySelector('.learn-tick').checked, text: r.querySelector('.learn-text').value, chip: (r.querySelector('.learn-long') || {}).textContent || '', folds: [...r.querySelectorAll('details[data-fold="tech"]')].map((d) => ({ open: d.open, text: d.querySelector('.learn-note').textContent })) })),
  heads: [...c.querySelectorAll('.learn-removed-head')].map((h) => [h.textContent, h.dataset.list]),
  lists: [...c.querySelectorAll('.learn-rows.learn-removed')].map((l) => [l.dataset.list, [...l.children].map((r) => ({ op: r.dataset.op, tick: r.querySelector('.learn-tick').checked, text: r.querySelector('.learn-old').textContent, why: r.querySelector('.learn-why').textContent }))]),
  stored: (() => { const s = c.querySelector('.learn-stored'); return s ? { text: s.textContent, shown: s.getBoundingClientRect().height > 0, top: Math.round(s.getBoundingClientRect().top - c.getBoundingClientRect().top) } : null; })(),
  fit: (() => { const f = c.querySelector('.learn-fit'); return { shown: !f.hidden && f.getBoundingClientRect().height > 0, text: f.textContent }; })(),
  save: { text: c.querySelector('.learn-save').textContent, disabled: c.querySelector('.learn-save').disabled },
  wide: [...c.querySelectorAll('*')].filter((e) => e.getBoundingClientRect().right > vw + 0.5).length, sw: document.documentElement.scrollWidth, vw,
}; })()`;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const CUT_EDIT = 'Forum digests and newsletters only when they mention an invoice, a contract or a payment that is due this week, or ask me to approve or sign something today';
serverBlock = `${LONG_LINE}\nForum digests never matter\nLunch polls never matter`;
proposalNow = { lines: [{ text: LONG_LINE, kind: 'keep', line: 1, from: [], evidence: '' }, { text: CUT_EDIT, kind: 'edit', line: 2, from: [1], evidence: 'seen in #1' }], removed: [{ line: 3, reason: 'you marked lunch polls not needed' }], note: '' };
const kp = await page(1100, 1100, 'b=block&w=720px');
await kp.go();
await press(kp);
const k1 = await kp.ev(R9);
ok(k1 && k1.rows.length === 2 && k1.rows[0].op === 'keep' && k1.rows[0].tick && k1.rows[0].text === LONG_LINE
  && k1.rows[1].op === 'edit' && k1.rows[1].long && !k1.rows[1].tick && k1.rows[1].chip === '太长——已截短' && CUT_EDIT.startsWith(k1.rows[1].text) && k1.rows[1].text.length <= 120 && CUT_EDIT[k1.rows[1].text.length] === ' ' && !/omitted|…\[/.test(k1.rows[1].text)
  && k1.rows[1].folds.length === 1 && !k1.rows[1].folds[0].open && k1.rows[1].folds[0].text === CUT_EDIT,
  `F4: the ${CUT_EDIT.length}-character edit ⇒ 「太长——已截短」, NOT ticked, its box cut at a word boundary (${k1 && k1.rows[1] ? k1.rows[1].text.length : 0} characters, no marker), the model's whole text under the row's own closed 技术细节 fold`, k1 && k1.rows);
ok(k1 && same(k1.heads, [['提议删掉的行', 'remove'], ['保留的原文', 'kept']]) && same(k1.lists.map(([l, rs]) => [l, rs.map((r) => [r.op, r.tick])]), [['remove', [['remove', false]]], ['kept', [['shortened', true]]]]) && k1.lists[1][1][0].why === '上面的改写太长、已截短——这一行保留',
  'F5: ONE header per kind — 「提议删掉的行」 over the named removal only (unticked), 「保留的原文」 over the line the cut edit rewords (ticked, 「上面的改写太长、已截短——这一行保留」)', k1 && { heads: k1.heads, lists: k1.lists });
await kp.shot('learn-cut-headers.png');
const CUT_TICK = `document.querySelectorAll('[data-learn-card] .learn-rows:not(.learn-removed) .learn-tick')[1].click()`;
await kp.ev(CUT_TICK);
const k2 = await kp.ev(R9);
ok(k2 && k2.rows[1].tick && !k2.lists[1][1][0].tick && k2.lists[1][1][0].why === '已由上面的改写替换——要留原文就取消上面的勾', 'G7: ticking the cut rewording (a real click) unticks the line it rewords, and that row says 「已由上面的改写替换——要留原文就取消上面的勾」', k2 && [k2.rows[1].tick, k2.lists[1][1][0]]);
await kp.ev(CUT_TICK);
const k2b = await kp.ev(R9);
ok(k2b && !k2b.rows[1].tick && k2b.lists[1][1][0].tick && k2b.lists[1][1][0].why === '上面的改写太长、已截短——这一行保留', 'G7: unticking it again gives the line back, with its own words', k2b && k2b.lists[1][1][0]);
await kp.ev(`document.querySelector('[data-learn-card] .learn-rows:not(.learn-removed) details[data-fold="tech"]').open = true`);
await kp.shot('learn-cut-fold.png');
const sets9 = await kp.ev('window.__sets.length');
await kp.ev(`document.querySelector('[data-learn-card] .learn-save').click()`);
await sleep(150);
const saved9 = (await kp.ev('window.__sets')).slice(sets9);
ok(saved9.length === 1 && saved9[0][1] === `${LONG_LINE}\nForum digests never matter`, "F4: the default 保存 writes the person's lines — the kept 152-character line and the line the cut edit rewords; the named removal leaves; never the cut text, never a marker", saved9);
kp.close();
const kq = await page(390, 1400, 'b=block&w=100%25');
await kq.go();
await press(kq);
const k3 = await kq.ev(R9);
ok(k3 && k3.wide === 0 && k3.sw <= k3.vw && k3.rows[1] && k3.rows[1].chip === '太长——已截短' && k3.heads.length === 2, `phone 390: the cut row with its chip and fold and the two headers fit (nothing past ${k3 && k3.vw} px)`, k3 && { wide: k3.wide, sw: k3.sw });
await kq.shot('learn-cut-phone.png');
kq.close();
const words9 = (n, seed) => { let s = ''; let i = 0; while (s.length < n) s += `${seed}${i++} `; return s.slice(0, n).replace(/\s+$/, (m) => 'x'.repeat(m.length)); };
const STORED9 = Array.from({ length: 14 }, (_, i) => `stored rule ${i + 1}: ` + words9(110, 'legacy')).join('\n');
serverBlock = STORED9;
proposalNow = { lines: [{ text: 'stored rule 1', kind: 'keep', line: 1, from: [], evidence: '' }], removed: [], note: '' };
const sq = await page(1100, 2600, 'b=block&w=720px');
await sq.go();
const nChat = chats.length;
await press(sq);
const k4 = await sq.ev(R9);
const sent9 = chats[nChat] ? chats[nChat].body.messages[1].content : '';
ok(k4 && k4.stored && k4.stored.shown && k4.stored.text === `原文已超过 1 500 字符（${STORED9.length}）——保存前要截掉 ${STORED9.length - 1500} 字` && k4.fit.shown && k4.save.disabled && k4.lists.length === 1 && k4.lists[0][1].length === 13 && k4.lists[0][1].every((r) => r.tick) && k4.lists[0][1].map((r) => r.text).join('\n') === STORED9.split('\n').slice(1).join('\n') && /1\. stored rule 1:/.test(sent9) && !/stored rule 13:/.test(sent9),
  `F6: a block stored at ${STORED9.length} characters ⇒ 「${k4 && k4.stored ? k4.stored.text : '-'}」 at the card's top; all 13 other lines are rows (the tail kept, ticked), the count is over and 保存 waits; the model was sent only the judge's read`, k4 && { stored: k4.stored, fit: k4.fit, kept: k4.lists[0] && k4.lists[0][1].length });
await sq.shot('learn-stored-over.png');
await sq.ev(`[...document.querySelectorAll('[data-learn-card] .learn-rows.learn-removed .learn-tick')].slice(-3).forEach((t) => t.click())`);
const k5 = await sq.ev(R9);
const sets10 = await sq.ev('window.__sets.length');
await sq.ev(`document.querySelector('[data-learn-card] .learn-save').click()`);
await sleep(150);
const saved10 = (await sq.ev('window.__sets')).slice(sets10);
ok(k5 && !k5.fit.shown && !k5.save.disabled && saved10.length === 1 && saved10[0][1].length <= 1500 && saved10[0][1].split('\n').length === 11 && saved10[0][1].split('\n').every((l) => STORED9.split('\n').includes(l)), 'F6: unticking 3 stored lines (real clicks) brings it under 1 500 — 保存 writes 11 whole stored lines; which ones left was the person\'s choice', saved10.map((x) => x[1].length));
sq.close();

console.log('⑩ lane learn-card-untick (verify r3 R3-F1): unticking a PRE-TICKED rewording keeps the person\'s line — both rows say so (real clicks)');
const R10 = `(() => { const c = document.querySelector('[data-learn-card]'); if (!c) return null; const vw = document.documentElement.clientWidth;
  const rw = c.querySelector('.learn-rows:not(.learn-removed) > .learn-row'), st = rw.querySelector('.learn-state'), lr = c.querySelector('.learn-rows.learn-removed > .learn-row');
  return { rw: { tick: rw.querySelector('.learn-tick').checked, state: st ? st.textContent : null, shown: !!st && st.getBoundingClientRect().height > 0 },
    line: lr ? { op: lr.dataset.op, tick: lr.querySelector('.learn-tick').checked, text: lr.querySelector('.learn-old').textContent, why: lr.querySelector('.learn-why').textContent, list: lr.parentElement.dataset.list } : null,
    wide: [...c.querySelectorAll('*')].filter((e) => e.getBoundingClientRect().right > vw + 0.5).length }; })()`;
serverBlock = 'Invoices due this week matter to me\nForum digests do not';
proposalNow = { lines: [{ text: 'Invoices this week, and contracts', kind: 'edit', line: 1, from: [1], evidence: 'seen in #1' }], removed: [], note: '' };
const up = await page(1100, 900, 'b=block&w=720px');
await up.go();
await press(up);
const u1 = await up.ev(R10);
ok(u1 && u1.rw.tick && u1.rw.state === '已勾选：这一行将被改写' && u1.rw.shown && u1.line && u1.line.op === 'replaced' && !u1.line.tick && u1.line.text === 'Invoices due this week matter to me' && u1.line.why === '已由上面的改写替换——要留原文就取消上面的勾' && u1.line.list === 'kept',
  'R3-F1: a supported rewording comes pre-ticked, saying 「已勾选：这一行将被改写」; the line it rewords has its own row under 保留的原文 — unticked, 「已由上面的改写替换——要留原文就取消上面的勾」', u1);
await up.ev(`document.querySelector('[data-learn-card] .learn-rows:not(.learn-removed) .learn-tick').click()`);
const u2 = await up.ev(R10);
ok(u2 && !u2.rw.tick && u2.rw.state === '未勾选：原文不会被改写' && u2.line && u2.line.tick && u2.line.why === '上面的改写未勾选——这一行保留' && u2.wide === 0,
  'R3-F1: a real click unticks the rewording ⇒ the person\'s line is ticked again, both rows saying so (「未勾选：原文不会被改写」 / 「上面的改写未勾选——这一行保留」); nothing past the card', u2);
await up.shotBottom('learn-untick.png', '[data-learn-card]');
const sets11 = await up.ev('window.__sets.length');
await up.ev(`document.querySelector('[data-learn-card] .learn-save').click()`);
await sleep(150);
const saved11 = (await up.ev('window.__sets')).slice(sets11);
ok(saved11.length === 1 && saved11[0][1] === 'Invoices due this week matter to me\nForum digests do not', 'R3-F1: 保存 then writes the person\'s line — never dropped (verify r3: 保存 wrote «Forum digests do not» alone, unsaid)', saved11);
up.close();

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass} passed, 0 failed)`);
process.exit(fail ? 1 : 0);

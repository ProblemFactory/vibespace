#!/usr/bin/env node
// test-decision-rule — HEAVY (lane decision-rule, D3 of docs/design-decision-api.zh.md §2.5; in-process + headless
// Chrome; ZERO vendor calls). The `decision` rule over the REAL channels engine + D1's REAL decision engine (the
// integration store's key, the plugin row's switches) + a FAKE decisions provider on loopback that counts calls and
// questions (OpenAI dialect; it answers from the record's own `body:` line):
//   A one predicate rule (agent 3's row) + one ROUTE rule (groups A and B's rows) on one conversation ⇒ ONE call per
//     record carrying BOTH questions; the predicate hit wakes agent 3 with its why line; the route hands the record to
//     group B's member (agent 2) — never group A's — and the next record (billing) to group A's; every wake through
//     the ladder's money door (`channel-message`, no new spend reason);
//   B a re-pass after a restart (a fresh channels store, a new decision engine over the same data) makes NO call — the
//     memo — and still wakes;
//   C the rule's hour cap spent ⇒ no call + ONE journal line (not one per record);
//   D the plugin off ⇒ no call + one journal line per rule; the routing switch off ⇒ only the predicate is asked;
//   E the Notify… dialog's decision row in Chrome (the REAL editor, an esbuild iife over a stub HTTP server): the
//     condition, the route options, the threshold, the cost line from the server's estimate, Save carries the moved
//     threshold and the routes; the plugin OFF is said ON the row with Open Plugins (no greyed control); desk 1100 (en)
//     + phone 390 (zh); PNGs → DECISION_RULE_PNG_DIR (editor.png, phone.png).
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePort, scratch, ONBOARDED_SOURCE } from './scratch.mjs';

const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const F = require(path.join(repo, 'src/channel-filter.js'));
const ENG = require(path.join(repo, 'src/server/channels-engine.js'));
const CH = require(path.join(repo, 'src/channels/index.js'));
const { makeRecord, makeConversation } = require(path.join(repo, 'src/channel-record.js'));
const S = require(path.join(repo, 'src/server/integration-store.js'));
const DE = require(path.join(repo, 'src/server/decision-engine.js'));
const { PluginManager } = require(path.join(repo, 'src/plugins.js'));
const DP = require(path.join(repo, 'src/plugins/llm.js'));
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? '\n    ' + String(typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 900) : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SHOTS = process.env.DECISION_RULE_PNG_DIR || '';

// ── the fake provider (OpenAI dialect): it judges the record's own `body:` line ──
const got = [];
const fake = http.createServer((req, res) => {
  let b = ''; req.on('data', (c) => { b += c; });
  req.on('end', () => {
    let body = null; try { body = JSON.parse(b); } catch { }
    got.push({ path: req.url, raw: b, body });
    const json = (code, o) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
    if (req.url !== '/v1/decisions' || !body) return json(404, { error: 'no such route' });
    const line = (/\nbody: ([^\n]*)/.exec(body.input) || [])[1] || '';
    const answers = body.questions.map((q) => {
      if (q.type === 'predicate') return { type: 'predicate', name: q.name, probability: /invoice/i.test(line) ? 0.9 : 0.1 };
      const pick = /server|outage/i.test(line) ? 'tech' : 'billing';
      const p = pick === 'tech' ? 0.85 : 0.8;
      return { type: 'choice', name: q.name, choice: pick, probabilities: q.choices.map((c) => ({ value: c.value, probability: c.value === pick ? p : (1 - p) / (q.choices.length - 1) })), confidence: p };
    });
    json(200, { answers, usage: { input_tokens: Math.ceil(b.length / 4) } });
  });
});
const FPORT = await freePort();
await new Promise((r) => fake.listen(FPORT, '127.0.0.1', r));
const BASE = { openai: `http://127.0.0.1:${FPORT}` };

const ROOT = scratch('decision-rule');
fs.mkdirSync(ROOT, { recursive: true });
const quiet = { log() {}, warn() {}, error() {} };
const DDIR = path.join(ROOT, 'decision'); fs.mkdirSync(DDIR, { recursive: true });
const SECRET = 'sk-dummy-decision-rule-0001';
let sObj = {}; // lane plugin-settings-p0: the plugin's switches are settings rows — one settings store that outlives a "restart" (data/settings.json does)
function decisionSide() {
  const store = S.create({ dataDir: DDIR, env: {}, log: quiet });
  const eng = DE.create({ dataDir: DDIR, integrations: store, baseUrlFor: BASE, log: quiet });
  const pm = new PluginManager({ dataDir: DDIR, plugins: [DP], decisionEngine: eng, settings: { read: () => sObj, patch: (p) => { sObj = { ...sObj, ...p }; for (const [k, v] of Object.entries(sObj)) if (v === null) delete sObj[k]; } } });
  return { store, eng, pm };
}
let D = decisionSide();
D.store.setIntegration('llm', { provider: 'openai', apiKey: SECRET });
D.pm.setEnabled('llm', true);
D.pm.setConfig('llm', { rules: true, routing: true });

const GA = { kind: 'group', id: 'T-a', name: 'Billing desk' }, GB = { kind: 'group', id: 'T-b', name: 'Tech desk' }, AG3 = { kind: 'agent', id: 'agent-3', name: 'Ledger' };
const PRED = F.validateRule({ kind: 'decision', condition: 'the sender asks me to pay an invoice' }).rule;
const ROUTE = F.validateRule({ kind: 'decision', condition: 'which desk should take this message', question: 'choice', threshold: 0.6, choices: [{ value: 'billing', description: 'money, invoices, refunds', to: GA }, { value: 'tech', description: 'outages, bugs, servers', to: GB }] }).rule;
const LIVE = [{ cid: 'agent-1', name: 'One', groups: ['T-a'] }, { cid: 'agent-2', name: 'Two', groups: ['T-b'] }, { cid: 'agent-3', name: 'Ledger', groups: [] }];

async function world(name, { watchers, decisionEngine = D.eng }) {
  const A = 'dr', OPS = 'ops';
  const recs = [];
  const mint = (vid, text) => makeRecord({ adapterId: A, convId: OPS, vendorId: vid, at: Date.now() + recs.length, author: { id: 'u-ada', name: 'Ada', isSelf: false, isBot: false }, text, mentions: [], attachments: [], replyTo: null, threadKey: OPS, raw: {} });
  const mod = {
    kind: A,
    caps: { receive: 'poll', history: 'page', pollInterval: { hot: 30, cold: 300, floor: 10 }, listConversations: true, sendAs: ['user'], identityMarking: 'none', identityMarkingWhere: null, identityMarkingText: null, tosRisk: 'none', idempotency: 'key', threading: 'thread-id', editSent: false, readReceipts: false, attachments: 'metadata' },
    create() {
      return {
        auth: { async state() { return { state: 'connected', expiresAt: null, scopes: ['fake'], why: null }; } },
        async listConversations() { return { conversations: [makeConversation({ id: OPS, vendorId: OPS, title: 'Ops room', kind: 'group', participants: 'Ada', lastAt: null })], cursor: null, complete: true }; },
        async convCaps() { return { read: 'yes', sendAs: ['user'], why: null, at: Date.now() }; },
        async history(convId, { anchor = null, limit = 50 } = {}) {
          let idx = 0;
          if (anchor) { const at = recs.findIndex((r) => r.vendorId === anchor); idx = at >= 0 ? at + 1 : 0; }
          const anchorFound = !anchor || idx > 0;
          const pending = recs.slice(idx), page = pending.slice(0, limit), drained = page.length === pending.length;
          return { records: page, anchor: page.length ? page[page.length - 1].vendorId : anchor, reachedAnchor: anchorFound && drained, complete: anchorFound && drained };
        },
        async send() { return { ok: true, vendorMessageId: 'x', at: Date.now(), sentAs: 'user' }; },
        async reconcile() { return { unknown: true }; },
      };
    },
  };
  const ladder = { calls: [], stash: [],
    async deliverToConversation(cid, text, opts) { ladder.calls.push({ cid, text, opts }); return { ok: true, lane: 'message' }; },
    stashFor(cid, env) { ladder.stash.push({ cid, ...env }); } };
  const lines = [];
  const log = { log: (s) => lines.push(String(s)), warn: (s) => lines.push(String(s)), error: (s) => lines.push(String(s)) };
  const dataDir = path.join(ROOT, name);
  fs.mkdirSync(path.join(dataDir, 'channels'), { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'channels', 'adapters.json'), JSON.stringify({ v: 1, adapters: [{ id: A, kind: A, label: 'DR chat', enabled: true, linkedAt: 1, auth: { tokenEnc: null, expiresAt: null, scopes: [] }, lastPass: null, consecutiveFailures: 0, push: null, scan: null }] }));
  const registry = CH.createChannelRegistry(); registry.register(mod);
  const base = Date.now(); let offset = 0;
  const e = ENG.create({ dataDir, env: {}, registry, broadcast: () => {}, log, deliver: ladder, userTodos: { add() { return { id: 'x' }; }, get() { return null; }, setStatus() {} }, serverSetting: () => undefined, liveSessions: () => LIVE, now: () => base + offset, decisionEngine });
  await e.pass(A, { force: true });
  const OPSC = { kind: 'conversation', convId: OPS };
  const a = await e.setAccess(A, OPSC, [{ principal: AG3, authority: 'draft' }, { principal: GA, authority: 'draft' }, { principal: GB, authority: 'draft' }]);
  const s = await e.setWatchers(A, OPSC, watchers);
  const ingest = async (vid, text) => { offset += 61e3; recs.push(mint(vid, text)); await e.pass(A, { force: true }); await e.settleWakes(); };
  return { e, ladder, lines, ingest, set: { a, s }, stop: () => { try { e.stop && e.stop(); } catch { } } };
}
const W = (principal, rules) => ({ principal, notify: 'wake', delivery: 'wake', mode: 'filtered', filter: { match: 'any', rules } });
const callsTo = (w, cid) => w.ladder.calls.filter((c) => c.cid === cid);

console.log('A one call per record carrying both questions; the predicate wakes, the route picks group B');
const R1 = 'Invoice 42 is overdue and the server is down — please pay the hosting bill today.';
{
  const w = await world('a', { watchers: [W(AG3, [PRED]), W(GA, [ROUTE]), W(GB, [ROUTE])] });
  ok(w.set.a.ok && w.set.s.ok && w.set.s.watchers.length === 3, 'setup: three access rows, three watchers (agent 3: the predicate; groups A and B: the same route rule)', w.set.s);
  await w.ingest('dr-1', R1);
  const q = got[got.length - 1];
  ok(got.length === 1 && q.body.questions.length === 2 && q.body.questions.map((x) => x.type).join() === 'predicate,choice', `ONE call for the record with BOTH questions (the route rule on two rows = one question): ${got.length} call, ${q && q.body.questions.length} questions`, got.map((g) => g.body && g.body.questions.map((x) => x.name)));
  const ch = q.body.questions.find((x) => x.type === 'choice');
  ok(ch && ch.choices.map((c) => c.value).join() === 'billing,tech,none' && /money, invoices/.test(ch.choices[0].description) && q.body.questions[0].instructions.includes(PRED.condition), 'the questions carry the conditions; the choice offers billing / tech / none with the person\'s descriptions', ch);
  ok(!q.raw.includes(SECRET) && q.body.input.includes('body: Invoice 42 is overdue') && !q.body.input.includes(PRED.condition), 'the input = the record (the condition rides the question, paid once); no key in the body');
  const c3 = callsTo(w, 'agent-3'), c2 = callsTo(w, 'agent-2'), c1 = callsTo(w, 'agent-1');
  ok(c3.length === 1 && c3[0].text.includes('decision: the sender asks me to pay an invoice → 0.90'), 'the predicate hit (p 0.90 ≥ 0.70) wakes agent 3 — the wake block names the condition and the probability', c3.map((c) => c.text.slice(0, 600)));
  ok(c2.length === 1 && c2[0].text.includes('decision: which desk should take this message → Tech desk 0.85') && c1.length === 0, 'the ROUTE hands the record to group B\'s member (agent 2) — group A\'s member (agent 1) gets nothing', { c1: c1.length, c2: c2.map((c) => c.text.slice(0, 400)) });
  ok(w.ladder.calls.every((c) => c.opts && c.opts.spendReason === 'channel-message'), 'every wake rides the ladder\'s existing money door (spendReason channel-message — no new spend reason)');
  await w.ingest('dr-2', 'Could you refund the duplicate charge on my card?');
  const q2 = got[got.length - 1];
  ok(got.length === 2 && q2.body.questions.length === 2 && callsTo(w, 'agent-1').length === 1 && callsTo(w, 'agent-1')[0].text.includes('→ Billing desk 0.80') && callsTo(w, 'agent-3').length === 1 && callsTo(w, 'agent-2').length === 1, 'the next record: one more call; billing ⇒ group A\'s member is woken, the predicate (p 0.10) wakes nobody');
  const st = D.eng.status().today.byUse;
  ok(st.routing && st.routing.calls === 2 && !st.rule, 'D1 counts the two calls under `routing` (a call that carries a route is the routing use)', st);
  w.stop();
}

console.log('B a re-pass after a restart makes NO call (the memo) and still wakes');
{
  D = decisionSide();   // a new decision engine over the same data: the memo is read back from data/decision-memo.json
  const n = got.length;
  const w = await world('b', { watchers: [W(AG3, [PRED]), W(GA, [ROUTE]), W(GB, [ROUTE])], decisionEngine: D.eng });
  await w.ingest('dr-1', R1);
  ok(got.length === n && callsTo(w, 'agent-3').length === 1 && callsTo(w, 'agent-2').length === 1 && callsTo(w, 'agent-1').length === 0, `the same record judged again after a restart: 0 new calls (${got.length - n}); agent 3 and group B are still woken from the memo's answers`);
  w.stop();
}

console.log('C the rule\'s hour cap spent ⇒ no call + ONE journal line');
{
  const P1 = { ...PRED, perHour: 1 };
  const w = await world('c', { watchers: [W(AG3, [P1])] });
  const n = got.length;
  await w.ingest('dr-c1', 'Invoice 7 is due Friday.');
  await w.ingest('dr-c2', 'Invoice 8 is due Monday.');
  await w.ingest('dr-c3', 'Invoice 9 is due Tuesday.');
  const said = w.lines.filter((l) => /decision rule d[0-9a-f]{16} not judged — per-hour/.test(l));
  ok(got.length === n + 1 && callsTo(w, 'agent-3').length === 1, `perHour 1: the first record is judged (1 call), the next two are not (${got.length - n} call in all) — no wake for them`);
  ok(said.length === 1, `ONE journal line for the spent hour, not one per record (${said.length})`, w.lines);
  w.stop();
}

console.log('D the plugin off ⇒ no call; the routing switch off ⇒ only the predicate is asked');
{
  D.pm.setEnabled('llm', false);
  const w = await world('d', { watchers: [W(AG3, [PRED]), W(GB, [ROUTE])] });
  const n = got.length;
  await w.ingest('dr-d1', 'Invoice 11 — the server is down.');
  await w.ingest('dr-d2', 'Invoice 12 — the server is down again.');
  const off = w.lines.filter((l) => /not judged — plugin-off/.test(l));
  ok(got.length === n && !w.ladder.calls.length && off.length === 2, `plugin off: 0 calls, 0 wakes, one journal line per rule (${off.length}) — not per record`, w.lines);
  D.pm.setEnabled('llm', true);
  D.pm.setConfig('llm', { routing: false });
  await w.ingest('dr-d3', 'Invoice 13 — the server is down for good.');
  const q = got[got.length - 1];
  ok(got.length === n + 1 && q.body.questions.length === 1 && q.body.questions[0].type === 'predicate' && callsTo(w, 'agent-3').length === 1 && !callsTo(w, 'agent-2').length && w.lines.some((l) => /not judged — feature-off/.test(l)), 'routing off: the call carries ONLY the predicate (rules on); the route is said feature-off and routes nothing');
  D.pm.setConfig('llm', { routing: true });
  w.stop();
}

// ── E the Notify… dialog's decision row in headless Chrome ───────────────────
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP the editor leg: no chrome/chromium'); finish(); }
const express = require(path.join(repo, 'node_modules/express'));
const esbuild = require(path.join(repo, 'node_modules/esbuild'));
const web0 = path.join(ROOT, 'web'); fs.mkdirSync(web0, { recursive: true });
await esbuild.build({ stdin: { contents: `import { showNotifyDialog } from ${JSON.stringify(path.join(repo, 'src/lib/channel-filter-editor.js'))};
window.app = { isMobile: innerWidth < 600, wm: { windows: new Map() }, sidebar: { _webuiSessions: [{ backendSessionId: 'agent-3', name: 'Ledger' }], _tasks: [{ id: 'T-a', title: 'Billing desk' }, { id: 'T-b', title: 'Tech desk' }] }, openPluginsDialog() { window.__plugins = (window.__plugins || 0) + 1; } };
window.__open = () => showNotifyDialog(window.app, { kind: 'conversation', conv: { adapterId: 'dr', id: 'ops', title: 'Ops room' } });
window.__open();`, resolveDir: repo, loader: 'js' }, bundle: true, format: 'iife', platform: 'browser', target: 'es2020', outfile: path.join(web0, 'dlg.js'), loader: { '.css': 'empty' }, logLevel: 'error',
  plugins: [{ name: 'stamp', setup(b) { b.onResolve({ filter: /build-version\.js$/ }, () => ({ path: 'stamp', namespace: 'stamp' })); b.onLoad({ filter: /.*/, namespace: 'stamp' }, () => ({ contents: 'export const BUILD_VERSION = "test";', loader: 'js' })); } }] });
const HIST = Array.from({ length: 140 }, (_, i) => makeRecord({ adapterId: 'dr', convId: 'ops', vendorId: `h${i}`, at: Date.now() - i * 1.2 * 3600e3, author: { id: 'u-ada', name: 'Ada', isSelf: false, isBot: false }, text: `message ${i}`, mentions: [], attachments: [], replyTo: null, threadKey: 'ops', raw: {} }));
const saved = [];
let convRules = null;   // lane dm-reply-infers (F): the reply rule's row instead of the two decision rules
const conv = () => ({ id: 'ops', adapterId: 'dr', title: 'Ops room', own: { access: [{ principal: AG3, authority: 'draft' }, { principal: GA, authority: 'draft' }, { principal: GB, authority: 'draft' }], watchers: [{ ...W(AG3, convRules || [PRED, ROUTE]), dailyWakeCap: 40, digestMinutes: 30 }] }, eligibleAbove: [], authorityCaps: { offersSend: false, sendWhy: 'read-only-adapter', policyRequiresReview: true }, stats: { msgs7d: 140 } });
const web = express();
web.use(express.json());
web.get('/', (req, res) => res.type('html').send(`<!doctype html><html data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/style.css"><style>body{margin:0;background:var(--bg-root)}</style></head><body><script>${req.query.lang ? `localStorage.setItem('vibespace.lang', ${JSON.stringify(String(req.query.lang))});` : ''}</script><script src="/dlg.js"></script></body></html>`));
web.get('/dlg.js', (req, res) => res.type('js').send(fs.readFileSync(path.join(web0, 'dlg.js'))));
web.get('/style.css', (req, res) => res.type('css').send(fs.readFileSync(path.join(repo, 'public/style.css'))));
web.get('/api/plugins', (req, res) => res.json({ plugins: D.pm.list() }));
web.get('/api/channels/dr/ops', (req, res) => res.json({ conversation: conv(), adapter: { id: 'dr', auth: { user: 'me' } } }));
web.post('/api/channels/dr/ops/estimate', (req, res) => res.json({ ok: true, estimate: F.estimate(req.body.filter, HIST, { now: Date.now() }) }));
web.post('/api/channels/dr/ops/rules/preview', (req, res) => res.json({ ok: true, matches: [], total: 0 }));
web.put('/api/channels/dr/ops/watchers', (req, res) => { saved.push(req.body); res.json({ ok: true, watchers: req.body.watchers }); });
web.use((req, res) => res.status(404).json({ error: 'not in this harness' }));
const PORT = await freePort();
const srv = await new Promise((r) => { const s = web.listen(PORT, '127.0.0.1', () => r(s)); });
const CDP_PORT = await freePort();
const chromeDir = scratch('decision-rule-chrome');
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars', '--font-render-hinting=none', `--user-data-dir=${chromeDir}`, 'about:blank'], { stdio: 'ignore' });
const cleanup = () => { try { chrome.kill('SIGKILL'); } catch {} try { srv.close(); fake.close(); } catch {} for (const d of [chromeDir, ROOT]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} } };
process.on('exit', cleanup);
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(143); });
const WebSocket = require(path.join(repo, 'node_modules/ws'));
for (let i = 0; i < 120; i++) { try { await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json(); break; } catch { await sleep(250); } }
async function page(w, h, lang, ready = `document.querySelectorAll('.chan-af-decision').length === 2`) {
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
  const until = async (expr, n = 80) => { for (let i = 0; i < n; i++) { await sleep(150); if (await ev(expr).catch(() => false)) return true; } return false; };
  await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/?lang=${lang}` });
  await until(ready);
  const press = async (sel) => { const r = await ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; e.scrollIntoView({ block: 'center' }); const b = e.getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; })()`); if (!r) return false; for (const type of ['mousePressed', 'mouseReleased']) await cdp('Input.dispatchMouseEvent', { type, x: r[0], y: r[1], button: 'left', clickCount: 1 }); return true; };
  const shot = async (file, sel) => { if (!SHOTS) return; fs.mkdirSync(SHOTS, { recursive: true }); await ev(`document.querySelector(${JSON.stringify(sel)}).scrollIntoView({ block: 'start' })`); await sleep(200); const r = await cdp('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(SHOTS, file), Buffer.from(r.result.data, 'base64')); };
  return { ev, until, press, shot, close: () => { try { ws.close(); } catch {} } };
}
const ROW = `(() => {
  const rows = [...document.querySelectorAll('.chan-af-decision')];
  return rows.map((b) => ({ cond: b.querySelector('.chan-dec-cond')?.value, q: b.querySelector('.chan-dec-q')?.value, th: b.querySelector('.chan-dec-thv')?.textContent, ph: b.querySelector('.chan-dec-ph')?.value,
    opts: [...b.querySelectorAll('.chan-dec-opt')].map((o) => [o.querySelector('.chan-dec-val')?.value, o.querySelector('.chan-dec-to')?.value].join('>')), cost: b.querySelector('.chan-dec-cost')?.textContent,
    off: b.querySelector('.chan-dec-off')?.textContent || null, disabled: [...b.querySelectorAll('input,select,textarea')].some((x) => x.disabled) })).concat([{ sw: document.documentElement.scrollWidth, vw: document.documentElement.clientWidth }]);
})()`;
{
  const pg = await page(1100, 1000, 'en');
  await pg.until(`/judgments\\/day/.test(document.querySelector('.chan-dec-cost')?.textContent || '')`);
  const R = await pg.ev(ROW);
  const [p, c] = R;
  ok(p && p.cond === PRED.condition && p.q === 'predicate' && p.th === '0.70' && p.ph === '20' && !p.opts.length, 'desk (en): the predicate row — the condition, yes/no, threshold 0.70, 20 an hour', p);
  ok(c && c.q === 'choice' && c.th === '0.60' && c.opts.join() === 'billing>group:T-a,tech>group:T-b', 'desk: the route row — one of billing → group A, tech → group B', c);
  const est = F.estimate({ rules: [PRED] }, HIST, { now: Date.now() });
  const want = F.decisionCost({ recordsPerDay: est.decision.judgedPerDay, perHour: 20, tokensPerCall: 1500, pricePerMtok: 0.1, budgetCents: 100 });
  ok(new RegExp(`^≈ ${want.judgmentsPerDay} judgments/day ≈ \\$${want.usdPerDay.toFixed(4).replace('.', '\\.')} at the current price — within your \\$1\\.00 daily budget\\. How often`).test(p.cost) && /known only once it runs/.test(p.cost), `desk: the COST LINE from the server's estimate × D1's ceiling × the price ("${p.cost}")`, { want, cost: p.cost });
  ok(!p.off && !c.off && !p.disabled && !c.disabled, 'desk: the plugin on with a key and both switches ⇒ no off line; nothing greyed');
  await pg.shot('editor.png', '.chan-af-list');
  await pg.ev(`(() => { const r = document.querySelectorAll('.chan-dec-th')[1]; r.value = '0.8'; r.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  const saveSel = await pg.ev(`(() => { const b = [...document.querySelectorAll('#chan-notify-dialog button, .chan-notify button')].find((x) => /^Save/.test(x.textContent.trim())); if (b) b.setAttribute('data-test-save', '1'); return !!b; })()`);
  ok(saveSel && await pg.press('[data-test-save]') && await pg.until(`true`, 6) && saved.length === 1, 'desk: Save sends the watchers', saved.length);
  const sw = saved[0] && saved[0].watchers && saved[0].watchers[0];
  const sr = sw && sw.filter && sw.filter.rules;
  ok(sr && sr.length === 2 && sr[1].kind === 'decision' && sr[1].threshold === 0.8 && sr[1].choices.map((o) => `${o.value}>${o.to.kind}:${o.to.id}`).join() === 'billing>group:T-a,tech>group:T-b' && F.validateFilter(sw.filter).ok, 'desk: the saved row carries the moved threshold (0.80) and both routes — and passes the server\'s validator', sw);
  pg.close();
  D.pm.setEnabled('llm', false);
  const ph = await page(390, 844, 'zh');
  await ph.until(`!!document.querySelector('.chan-dec-off')`);
  const Z = await ph.ev(ROW);
  const fit = Z[Z.length - 1];
  ok(Z[0].off && /LLM 插件已关闭/.test(Z[0].off) && Z[1].off && !Z[0].disabled && !Z[1].disabled, `phone (zh): the plugin OFF is said on the row ("${Z[0].off}") — the controls stay live, never greyed`, Z);
  ok(fit.sw <= fit.vw + 1, `phone 390: the dialog fits (scrollWidth ${fit.sw} ≤ ${fit.vw})`, fit);
  ok(await ph.press('.chan-dec-open') && await ph.until(`window.__plugins === 1`, 10), 'phone: Open Plugins on the row opens the Plugins card (app.openPluginsDialog)');
  await ph.shot('phone.png', '.chan-af-decision');
  ph.close();
  D.pm.setEnabled('llm', true);
}
// ── F lane dm-reply-infers (B-6b4b): the reply rule's «Also judge plain replies» box — opt-in, saved as `infer`, the plugin
//    off SAID on it (the marker road works either way) ──
{
  const INFER = `(() => { const b = document.querySelector('.chan-af-infer'); if (!b) return null; const tick = b.querySelector('.chan-af-infer-tick'); const note = b.querySelector('.chan-af-infer-note');
    return { on: !!(tick && tick.checked), label: b.querySelector('.chan-af-infer-on')?.textContent || '', note: note && !note.hidden ? note.textContent : null, off: b.querySelector('.chan-dec-off')?.textContent || null, sw: document.documentElement.scrollWidth, vw: document.documentElement.clientWidth }; })()`;
  const saveNow = async (pg) => { await pg.ev(`(() => { const b = [...document.querySelectorAll('#chan-notify-dialog button, .chan-notify button')].find((x) => /^Save/.test(x.textContent.trim())); if (b) b.setAttribute('data-test-save', '1'); return !!b; })()`); return pg.press('[data-test-save]'); };
  const n0 = saved.length;
  convRules = [{ kind: 'reply-to-sent' }];
  const pg = await page(1100, 1000, 'en', `!!document.querySelector('.chan-af-infer')`);
  const r0 = await pg.ev(INFER);
  ok(r0 && !r0.on && /Also judge plain replies \(LLM plugin\)/.test(r0.label) && r0.note === null && !r0.off, 'F desk (en): the reply rule\'s row carries the box — OFF by default, its note folded, nothing said about the plugin', r0);
  await pg.press('.chan-af-infer-tick');
  await pg.until(`document.querySelector('.chan-af-infer-tick').checked`, 10);
  const r1 = await pg.ev(INFER);
  ok(r1.on && /judged once: is it an answer to it\?/.test(r1.note || '') && /Settings › Channels/.test(r1.note || '') && !r1.off, 'F desk: ticked ⇒ the note says what is judged, once, and where the window is set; the plugin on ⇒ no off line', r1);
  await pg.shot('infer.png', '.chan-af-list');
  ok(await saveNow(pg) && await pg.until('true', 6) && saved.length === n0 + 1, 'F desk: Save sends the row', saved.length - n0);
  const sr = saved[n0] && saved[n0].watchers && saved[n0].watchers[0] && saved[n0].watchers[0].filter;
  ok(sr && JSON.stringify(sr.rules) === JSON.stringify([{ kind: 'reply-to-sent', infer: true }]) && F.validateFilter(sr).ok, 'F desk: the saved rule is `{kind: reply-to-sent, infer: true}` — the one grammar the CLI\'s --infer writes', sr);
  pg.close();
  convRules = [{ kind: 'reply-to-sent', infer: true }];
  const p2 = await page(1100, 1000, 'en', `!!document.querySelector('.chan-af-infer')`);
  const r2 = await p2.ev(INFER);
  await p2.press('.chan-af-infer-tick');
  await p2.until(`!document.querySelector('.chan-af-infer-tick').checked`, 10);
  ok(r2 && r2.on && await saveNow(p2) && await p2.until('true', 6) && saved.length === n0 + 2 && JSON.stringify(saved[n0 + 1].watchers[0].filter.rules) === JSON.stringify([{ kind: 'reply-to-sent' }]), 'F desk: a stored `infer: true` draws ticked; unticked and saved ⇒ the rule is `{kind}` alone again (the marker-only row, byte for byte)', saved[n0 + 1] && saved[n0 + 1].watchers[0].filter);
  p2.close();
  D.pm.setEnabled('llm', false);
  const p3 = await page(390, 844, 'zh', `!!document.querySelector('.chan-af-infer .chan-dec-off')`);
  const r3 = await p3.ev(INFER);
  ok(r3 && r3.on && /也判定普通回复/.test(r3.label) && /LLM 插件已关闭/.test(r3.off || '') && /引用和话题里的回复照常通知/.test(r3.off || '') && r3.sw <= r3.vw + 1, `F phone 390 (zh): the plugin OFF is said on the ticked box ("${r3 && r3.off}") — quotes and topic replies still notify; the dialog fits`, r3);
  ok(await p3.press('.chan-af-infer .chan-dec-open') && await p3.until('window.__plugins >= 1', 10), 'F phone: Open Plugins on the box opens the Plugins card');
  await p3.shot('infer-phone.png', '.chan-af-infer');
  p3.close();
  D.pm.setEnabled('llm', true);
  convRules = null;
}
finish();
function finish() {
  console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
  process.exit(fail ? 1 : 0);
}

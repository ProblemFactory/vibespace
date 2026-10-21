#!/usr/bin/env node
// THE EFFORT MENU IS THE HARNESS'S OWN (lane effort-menu-per-harness; the owner 2026-10-21 13:4xZ, on an Antigravity
// conversation's status bar — model gemini-4-argon-high, 推理强度: ? — the effort menu offered 默认(重置) / low / medium /
// high / xhigh / max / ultracode: «antigravity 也是这几个档位吗？»).
//
// agy --effort takes low|medium|high|xhigh|max. GET /api/session-options answered ONE list made for claude (the claude
// CLI's parsed levels + claude's declared ultracode) to every backend, the bar's `?? the harness's own extras` fallback
// never fired (claude's were always there), and a picked ultracode reached agy as NO effort, without a word.
//
//   ① THE ROWS — every chat harness declares ui.effortLevels / effortExtras on its descriptor (= the client META):
//      antigravity = agy's five (the adapter's AGY_EFFORTS, the one array; the wrapper's list agrees), no extras;
//      claude 'cli-help' + ultracode; codex 'model-catalog'; opencode null.
//   ② THE ANSWER per backend — the route's PURE sessionOptionsAnswer over the REAL harness registry.
//   ③ THE CLIENT BUILDER per backend — effortOptions(backend, answer) = the harness's rows; hasEffortMenu; the seed.
//   ④ THE REAL BAR (a fake DOM, no chrome) — the chip per backend: antigravity shows the COMMANDED effort «as asked at
//      start», «?» only when nothing was asked; opencode has NO effort chip; the menu asks with its backend.
//   ⑤ THE REFUSAL BY NAME — agyFlags / the chat spawn / the mid-session pick throw effort_not_supported with agy's
//      levels, and the REAL ws-create (a stub pty) answers an antigravity create asking ultracode by name, spawning nothing.
//   ⑥ MUTANTS — the route answering claude's rows to every backend (the base) ⇒ ② RED; the agy adapter dropping
//      instead of refusing (the base) ⇒ ⑤ RED.
// The menu itself, opened in a real document: scripts/test-effort-menu-chrome.mjs (heavy).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { scratchDir } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const require = createRequire(import.meta.url);
let pass = 0, fail = 0;
const ok = (c, msg, detail) => { if (c) { pass++; console.log(`  ✓ ${msg}`); } else { fail++; console.log(`  ✗ ${msg}${detail !== undefined ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 500) : ''}`); } };
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
const J = (x) => JSON.stringify(x);
const FIVE = ['low', 'medium', 'high', 'xhigh', 'max'];
const H = require(path.join(REPO, 'src/harnesses'));
const E = require(path.join(REPO, 'src/harness-efforts.js'));
const AGY = require(path.join(REPO, 'src/adapters/agy.js'));
const am = await import(pathToFileURL(path.join(REPO, 'src/lib/agent-meta.js')).href);
// the codex catalog shape /api/available-models carries (src/harnesses/codex-models.js: efforts per model)
const CATALOG = { codex: [{ id: 'gpt-a', efforts: ['low', 'medium', 'high', 'xhigh'] }, { id: 'gpt-b', efforts: ['minimal', 'low', 'max', 'ultra'] }] };
const answer = (fn, backend, extra = {}) => fn({ backend, ...extra }, { harnessOf: (id) => H.get(id), cliLevels: FIVE, permissionModes: ['default'], catalog: CATALOG });

console.log('— ① THE ROWS: each chat harness declares its own effort levels + extras (descriptor = client META)');
{
  const row = (id) => H.get(id).ui;
  ok(row('antigravity').effortLevels === AGY.AGY_EFFORTS && J(row('antigravity').effortLevels) === J(FIVE) && !row('antigravity').effortExtras,
    'antigravity: ui.effortLevels IS the adapter\'s AGY_EFFORTS (one array: low|medium|high|xhigh|max), no effortExtras', row('antigravity').effortLevels);
  const wrapperList = (read('data/bin/agy-wrapper.js').match(/const EFFORTS = Object\.freeze\((\[[^\]]*\])\)/) || [])[1];
  ok(wrapperList && J(JSON.parse(wrapperList.replace(/'/g, '"'))) === J(['', ...FIVE]), 'the agy wrapper\'s own list (a standalone file) is the same five + agy\'s default', wrapperList);
  ok(row('claude').effortLevels === 'cli-help' && J((row('claude').effortExtras || []).map((x) => x.value)) === '["ultracode"]',
    'claude: \'cli-help\' (the CLI\'s parsed --effort levels) + its own ultracode extra');
  ok(row('codex').effortLevels === 'model-catalog' && !row('codex').effortExtras, 'codex: \'model-catalog\' (per model), no extras');
  ok(row('opencode').effortLevels === null && !row('opencode').effortExtras, 'opencode: null — no effort menu');
  ok(H.get('shell').ui === undefined && !am.hasEffortMenu('shell'), 'shell (a terminal harness, no chat): no ui row, no effort menu');
  for (const id of ['claude', 'codex', 'shell', 'opencode', 'antigravity']) {
    ok(J(am.BACKEND_META[id].ui?.effortLevels ?? null) === J(H.get(id).ui?.effortLevels ?? null) && J(am.BACKEND_META[id].ui?.effortExtras ?? null) === J(H.get(id).ui?.effortExtras ?? null),
      `${id}: the client META carries the same effortLevels / effortExtras`);
  }
}

console.log('— ② THE ANSWER per backend: GET /api/session-options?backend=<id> (the PURE sessionOptionsAnswer, the real registry)');
const ANSWER_ROWS = [
  ['antigravity', {}, FIVE, []],
  ['claude', {}, FIVE, ['ultracode']],
  ['codex', { model: 'gpt-a' }, ['low', 'medium', 'high', 'xhigh'], []],
  ['codex', {}, ['minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra'], []],
  ['shell', {}, null, []],
  ['opencode', {}, null, []],
  ['no-such-harness', {}, null, []],
];
function judgeAnswers(fn) {
  return ANSWER_ROWS.map(([be, q, lv, ex]) => {
    const a = answer(fn, be, q);
    const got = [a.effortLevels, (a.effortExtras || []).map((x) => x.value)];
    return J(got) === J([lv, ex]) ? '' : `${be}${q.model ? '/' + q.model : ''}: ${J(got)} ≠ ${J([lv, ex])}`;
  });
}
{
  const v = judgeAnswers(E.sessionOptionsAnswer);
  ANSWER_ROWS.forEach(([be, q, lv, ex], i) => ok(!v[i], `${be}${q.model ? ` (model ${q.model})` : ''}: levels ${J(lv)}, extras ${J(ex)} — its OWN rows`, v[i]));
  const legacy = E.sessionOptionsAnswer({}, { harnessOf: (id) => H.get(id), cliLevels: FIVE, permissionModes: ['default'], catalog: CATALOG });
  ok(legacy.backend === 'claude' && J(legacy.effortLevels) === J(FIVE) && legacy.effortExtras.map((x) => x.value).join() === 'ultracode' && J(legacy.permissionModes) === '["default"]',
    'an ask without a backend is the old claude ask (an older client keeps its answer)');
  const noXhigh = E.sessionOptionsAnswer({ backend: 'claude' }, { harnessOf: (id) => H.get(id), cliLevels: ['low', 'medium', 'high', 'max'] });
  ok(noXhigh.effortExtras.length === 0, 'claude whose CLI parsed no xhigh ⇒ ultracode is absent by name (the effort-ultracode gate, unchanged)');
  const route = read('server.js').match(/app\.get\('\/api\/session-options'[\s\S]*?\n\}\);/)?.[0] || '';
  ok(/sessionOptionsAnswer\(req\.query, \{ harnessOf: [^}]*cliLevels: EFFORT_LEVELS, permissionModes: PERMISSION_MODES, catalog: AVAILABLE_MODELS \}\)/.test(route) && !/EFFORT_EXTRAS/.test(read('server.js')),
    'the route answers sessionOptionsAnswer(req.query, …) — no claude-only EFFORT_EXTRAS left in server.js', route.slice(0, 300));
}

console.log('— ③ THE CLIENT BUILDER per backend: effortOptions(backend, the answer) = that harness\'s rows');
{
  const head = { value: '', label: 'Default (reset)' };
  const rows = (be) => { const a = answer(E.sessionOptionsAnswer, be); return am.effortOptions(be, a.effortLevels, a.effortExtras, { head, capitalize: false }).map((r) => r.value); };
  ok(J(rows('antigravity')) === J(['', ...FIVE]), 'antigravity: Default + low … max — no ultracode', rows('antigravity'));
  ok(J(rows('claude')) === J(['', ...FIVE, 'ultracode']), 'claude: Default + low … max + ultracode', rows('claude'));
  ok(am.hasEffortMenu('antigravity') && am.hasEffortMenu('claude') && am.hasEffortMenu('codex') && !am.hasEffortMenu('opencode') && !am.hasEffortMenu('no-such-harness'),
    'hasEffortMenu = the declared row: antigravity / claude / codex yes, opencode / an unknown harness no');
  ok(J(am.effortSeedLevels('antigravity')) === J(FIVE) && J(am.effortSeedLevels('claude')) === J(FIVE) && J(am.effortSeedLevels('opencode')) === '[]',
    'the seed (before / without an answer): the declared list (antigravity), the classic five (claude\'s --help), none (opencode)');
  const caps = ['claude', 'codex', 'shell', 'opencode', 'antigravity'].filter((id) => 'effort' in (am.BACKEND_META[id].caps || {}));
  ok(caps.length === 0, 'the client-only caps.effort flag is gone (it said false for antigravity while the bar offered claude\'s ladder) — one fact, the declared row', caps);
  const app = read('src/lib/app.js'), props = read('src/lib/session-props.js');
  ok(app.includes("['row-effort', isShell || !hasEffortMenu(backend)]") && props.includes("if (hasEffortMenu(s.backend || 'claude'))")
    && app.includes("efforts: effortOptions('antigravity', uiRow('antigravity').effortLevels, uiRow('antigravity').effortExtras,")
    && app.includes("fetchJson('/api/session-options?backend=claude')"),
    'the New Session dialog\'s effort row and Session Properties\' follow hasEffortMenu; the dialog\'s antigravity rows are its declared levels; claude\'s fetch asks for claude');
}

console.log('— ④ THE REAL BAR (a fake DOM): the effort chip per backend');
class FakeEl {
  constructor(tag) { this.tagName = String(tag).toUpperCase(); this.attrs = new Map(); this.childNodes = []; this.parentNode = null; this._html = ''; }
  get children() { return this.childNodes.filter((n) => n instanceof FakeEl); }
  setAttribute(k, v) { this.attrs.set(k, String(v)); }
  getAttribute(k) { return this.attrs.has(k) ? this.attrs.get(k) : null; }
  hasAttribute(k) { return this.attrs.has(k); }
  removeAttribute(k) { this.attrs.delete(k); }
  get className() { return this.getAttribute('class') || ''; }
  set className(v) { this.setAttribute('class', v); }
  get title() { return this.getAttribute('title') || ''; }
  get innerHTML() { return this._html; }
  set innerHTML(h) { this._html = String(h); }
  get textContent() { return this._html.replace(/<[^>]*>/g, ''); }
  appendChild(n) { return this.insertBefore(n, null); }
  insertBefore(n, ref) { if (n.parentNode) n.parentNode.removeChild(n); const i = ref ? this.childNodes.indexOf(ref) : -1; if (i < 0) this.childNodes.push(n); else this.childNodes.splice(i, 0, n); n.parentNode = this; return n; }
  removeChild(n) { const i = this.childNodes.indexOf(n); if (i >= 0) this.childNodes.splice(i, 1); n.parentNode = null; return n; }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }
  addEventListener() {}
  get isConnected() { return true; }
}
{
  const { ChatStatusBar } = await import(pathToFileURL(path.join(REPO, 'src/lib/chat-status-bar.js')).href);
  globalThis.document = { createElement: (t) => new FakeEl(t) };
  const chip = (backend, status) => {
    const bar = new ChatStatusBar({ send() {} }, 'sid-effort', { backend, getToolMsg: () => null, openSubagentViewer() {}, openInTempEditor() {} });
    if (status) bar.applyStatus(status);
    const el = bar.element.children.find((c) => c.getAttribute('data-chip') === 'effort');
    return el ? { text: el.textContent, title: el.title } : null;
  };
  const asked = chip('antigravity', { model: 'gemini-4-argon-high', effort: 'high' });
  ok(asked && asked.text === 'high' && /^Reasoning effort as asked at start \(the CLI reports no per-turn effort\)/.test(asked.title),
    'antigravity, effort asked at start: the chip says it — «as asked at start (the CLI reports no per-turn effort)» (was «?» territory)', asked);
  const none = chip('antigravity', { model: 'gemini-4-argon-high' });
  ok(none && none.text === 'effort: ?' && /^No effort was asked at start and the CLI reports none/.test(none.title),
    'antigravity, nothing asked: «?» stays — and its title says why (nothing asked, nothing reported, agy\'s own default)', none);
  ok(chip('opencode', { model: 'm' }) === null, 'opencode (no effort levels): NO effort chip — not a «?» that opens claude\'s ladder');
  const cl = chip('claude', { model: 'claude-fable-5-1', effort: 'xhigh' }), cx = chip('codex', { model: 'gpt-a', effort: 'high' });
  ok(cl && /as last commanded/.test(cl.title) && cx && /as reported per turn/.test(cx.title), 'claude (commanded) and codex (per turn) keep their own titles', [cl?.title, cx?.title]);
  const bar = read('src/lib/chat-status-bar.js');
  ok(bar.includes("fetch(`/api/session-options?backend=${encodeURIComponent(this._backend || 'claude')}`)") && !bar.includes("fetch('/api/session-options')")
    && bar.includes('addItems(ladder(effortSeedLevels(this._backend)));'),
    'the bar\'s menu asks /api/session-options WITH its backend; a failed ask falls back to THIS harness\'s seed (never claude\'s five + ultracode)');
}

console.log('— ⑤ THE REFUSAL BY NAME: agy cannot take it ⇒ effort_not_supported with its levels, never dropped');
const { createAdapterRegistry } = require(path.join(REPO, 'src/adapters/index.js'));
const Wp = (f) => '/w/' + f;
const registry = () => createAdapterRegistry({
  claudeCmd: '/opt/bin/claude', codexCmd: '/opt/bin/codex', chatWrapper: Wp('chat-wrapper.js'), codexChatWrapper: Wp('codex-chat-wrapper.js'),
  acpWrapper: Wp('acp-wrapper.js'), acpCommands: { opencode: '/opt/bin/opencode', antigravity: '/opt/bin/agy' }, ptyWrapper: Wp('pty-wrapper.js'), buffersDir: '/b',
});
const caught = (fn) => { try { fn(); return null; } catch (e) { return e; } };
{
  const e1 = caught(() => AGY.agyFlags({ effort: 'ultracode' }));
  ok(e1?.code === 'effort_not_supported' && J(e1.levels) === J(FIVE) && /Antigravity has no reasoning effort "ultracode" — agy --effort takes low, medium, high, xhigh, max/.test(e1.message),
    'agyFlags({effort: ultracode}) THROWS effort_not_supported naming agy\'s five (was: silently no --effort)', e1?.message);
  ok(J(AGY.agyFlags({ effort: 'max' })) === '["--effort","max"]' && J(AGY.agyFlags({ effort: '' })) === '[]', 'a level agy has rides --effort; Default (\'\') rides nothing');
  const agy = registry().get('antigravity');
  const e2 = caught(() => agy.buildSessionArgs({ mode: 'chat', effort: 'ultracode' })), e3 = caught(() => agy.formatSetEffort('ultracode'));
  ok(e2?.code === 'effort_not_supported' && e3?.code === 'effort_not_supported', 'the chat spawn spec and the mid-session pick (formatSetEffort) refuse it the same way', [e2?.message, e3?.message]);
  ok(agy.buildSessionArgs({ mode: 'chat', effort: 'xhigh' }).env.AGY_WEBUI_EFFORT === 'xhigh' && JSON.parse(agy.formatSetEffort('low')).effort === 'low',
    'a level agy has: AGY_WEBUI_EFFORT carries it; the pick is the ACP set-effort frame');
  const ws = read('src/ws-handler.js');
  ok(/try \{ effortLine = adapter\.formatSetEffort\(data\.effort\); \}\s*catch \(e\) \{\s*if \(e\?\.code === 'effort_not_supported'\) \{ try \{ ws\.send\(JSON\.stringify\(\{ type: 'error', code: e\.code, scope: 'action', sessionId: data\.sessionId, effort: e\.effort, levels: e\.levels/.test(ws)
    && ws.indexOf('effortLine = adapter.formatSetEffort') < ws.indexOf('session._effort = data.effort || null;'),
    'ws set-effort: a refused pick answers the client by name BEFORE anything is written or remembered as the session\'s effort');
}
const SOCK = scratchDir('effort-sock'), BUF = scratchDir('effort-buf'), CWD = scratchDir('effort-cwd');
async function drive(mod, data, reg = registry()) {
  const sent = [], spawned = [], active = new Map(), noop = () => undefined;
  const ctx = new Proxy({
    activeSessions: active, WS_OPEN: 1, sessionCounterRef: { value: 0 }, adapterRegistry: reg, hosts: null, accounts: null, os, fs, path,
    execFileSync: require('child_process').execFileSync, ensureDir: (d) => fs.mkdirSync(d, { recursive: true }),
    SOCKETS_DIR: SOCK, BUFFERS_DIR: BUF, PTY_WRAPPER: Wp('pty-wrapper.js'), CHAT_WRAPPER: Wp('chat-wrapper.js'),
    NODE_CMD: '/n/node', DTACH_CMD: '/stub/dtach', ENV_CMD: '/usr/bin/env', CLAUDE_CMD: '/opt/bin/claude', EDITOR_CMD: '/stub/editor/code', AGENT_BIN_DIR: '/stub/bin', PORT: 1, X_ENV: {},
    cliCmds: { forSpawn: async (b, c) => c }, USAGE_STATUSLINE_CMD: '/stub/vibespace-usage', userStatuslineCmd: () => '',
    serverSetting: noop, harnessSetting: noop, harnessDeclares: () => false, harnessSpawnSettings: () => ({}),
    integrationEnabled: () => true, readSessionMeta: () => null, readLayouts: () => ({}), getSyncStore: () => null,
    pty: { spawn: (cmd, args, opts) => { spawned.push({ cmd, args, env: opts.env }); return { pid: 4242, onData() { }, onExit() { }, write() { }, resize() { }, kill() { } }; } },
    setupSessionPty: (s, id, p) => { s.pty = p; },
  }, { get: (t, k) => (k in t ? t[k] : (typeof k === 'string' && /^[a-z]/.test(k) ? noop : undefined)) });
  const handler = mod.createWsCreateHandler({
    ctx, agentEnv: () => ({ PATH: '/usr/bin:/bin', HOME: '/home/u' }), crashLoopRef: { map: new Map() }, noConvoRef: { map: new Map() },
    execFileAsync: async () => ({ stdout: '', stderr: '' }), pickCodexThreadCandidate: () => null,
    getSessionKey: (s) => `${s.backend}:${s.backendSessionId}`, normalizeComparablePath: (p) => p,
  });
  await handler({ readyState: 1, send: (t) => sent.push(JSON.parse(t)) }, { type: 'create', mode: 'chat', cwd: CWD, reqId: 'r1', ...data }, new Set());
  return { sent, spawned };
}
/** the verdict of an antigravity create asking ultracode: '' = refused by name, nothing spawned */
const refusedByName = (x) => {
  const err = x.sent.find((m) => m.type === 'error');
  if (x.spawned.length) return `SPAWNED (AGY_WEBUI_EFFORT=${J(x.spawned[0].env?.AGY_WEBUI_EFFORT)}) — the pick dropped, no word`;
  if (!err || err.code !== 'effort_not_supported' || J(err.levels) !== J(FIVE) || !/"ultracode"/.test(err.message)) return `no named refusal: ${J(x.sent).slice(0, 200)}`;
  return '';
};
const wsCreate = require(path.join(REPO, 'src/ws-create.js'));
{
  const x = await drive(wsCreate, { backend: 'antigravity', effort: 'ultracode' });
  ok(!refusedByName(x), 'the REAL ws-create: an antigravity create asking ultracode answers effort_not_supported (agy\'s five, the value named) and spawns NOTHING', refusedByName(x));
  const y = await drive(wsCreate, { backend: 'antigravity', effort: 'high' });
  ok(y.spawned.length === 1 && y.spawned[0].env.AGY_WEBUI_EFFORT === 'high' && y.sent.find((m) => m.type === 'created')?.effort === 'high',
    'an antigravity create asking high: AGY_WEBUI_EFFORT=high reaches the wrapper, and the creator\'s reply carries it (the chip\'s commanded value)', y.sent.map((m) => m.type));
  const z = await drive(wsCreate, { backend: 'claude', effort: 'ultracode' });
  ok(z.spawned.length === 1 && !z.sent.some((m) => m.type === 'error'), 'claude asking ultracode still starts (it IS claude\'s own extra) — the refusal is per harness');
}

console.log('— ⑥ MUTANTS: each restores the base shape in a copy ⇒ the leg goes RED');
{
  const M = mutantCopies('chat-status-bar-effort', REPO);
  const src = read('src/harness-efforts.js');
  const A = "  return { backend, ...effortAnswerFor(harness, { cliLevels, catalogModels: catalog?.[backend] || [], model }), permissionModes: permissionModes || [] };\n";
  ok(src.split(A).length === 2, 'setup: the answer is ONE identifiable statement in src/harness-efforts.js');
  const base = M.load('src/harness-efforts.js', src.replace(A, "  return { backend, ...effortAnswerFor(harnessOf('claude'), { cliLevels }), permissionModes: permissionModes || [] }; // the base: claude's answer to every backend\n"), 'claude-for-all');
  const v = judgeAnswers(base.sessionOptionsAnswer);
  ok(/^antigravity: \[\["low","medium","high","xhigh","max"\],\["ultracode"\]\]/.test(v[0]) && /^opencode: /.test(v[5]),
    'MUTANT the route answering claude\'s rows to every backend (2.369.336) ⇒ ② RED: antigravity gets ultracode, opencode a ladder', v.filter(Boolean));
  const asrc = read('src/adapters/agy.js');
  const R = "  if (!v || AGY_EFFORTS.includes(v)) return null;\n";
  ok(asrc.split(R).length === 2, 'setup: the refusal is ONE identifiable statement in src/adapters/agy.js');
  const mut = M.load('src/adapters/agy.js', asrc.replace(R, "  return null; // the base: no refusal\n").replace("          AGY_WEBUI_EFFORT: effort || '',", "          AGY_WEBUI_EFFORT: AGY_EFFORTS.includes(effort) ? effort : '',"), 'agy-drops');
  const reg = registry(), real = reg.get('antigravity');
  const mutAgy = new mut.AgyAdapter(real.config);
  const x = await drive(wsCreate, { backend: 'antigravity', effort: 'ultracode' }, { ...reg, get: (id) => (id === 'antigravity' ? mutAgy : reg.get(id)) });
  ok(/^SPAWNED \(AGY_WEBUI_EFFORT=""\)/.test(refusedByName(x)), 'MUTANT the agy adapter dropping instead of refusing (2.369.336) ⇒ ⑤ RED: it spawns with no effort, without a word', refusedByName(x));
}
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);

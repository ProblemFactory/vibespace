#!/usr/bin/env node
// THE STATUS BAR SHOWS WHAT THE HARNESS REPORTS (lane agy-status-bar-facts, 2026-10-21 — the owner, on an Antigravity
// conversation: «agy 的 chatview 缺少很多信息啊 什么 context 啊，cache rate，产物啊啥的下面都没有了»).
// agy's stream carries `usage` on its result, but the wrapper kept it in the sidecar only — the bar, which reads the
// stream's usage, had nothing. And what agy's usage COUNTS was never measured: on the owner's two conversations it is the
// CONVERSATION'S RUNNING TOTAL (= the sum over every model call of every turn of agy's own transcript, to the token), so
// the live context is the turn's LAST model call, never a sum.
//   ① PURE: src/agy-turn-usage.js — agy's usage, the delta of two totals, the current turn in a transcript tail (cut or
//      whole), the record's fields; src/status-bar-facts.js — the window table, what a row lacks.
//   ② THE NORMALIZER: the wrapper's `usage` record → the ONE usage meta every bar reads (the last call = context + cache,
//      the total = the odometer, the turn's spend + time) + the served model only when agy NAMED it; chatStatus replays it.
//   ③ THE REAL BAR (a fake DOM, no chrome) per harness, each gated on its declared ui.statusBar: antigravity = context %
//      against the model's documented window / «window unknown» for a slug not in the table, ⚡ cache, Σ odometer with
//      the thinking share, the turn's time; claude / opencode say «not reported» for what they lack (opencode: no ⚡0%).
//   ④ MUTANTS — the bar with the cache row's gate cut (the base: opencode drew ⚡0%) ⇒ ③ RED; the context taken from the
//      turn's SUM ⇒ 677 % on the measured shape ⇒ ① RED.
// The page itself: scripts/test-agy-status-bar-chrome.mjs (heavy). Run: node scripts/test-status-bar-facts.mjs
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { scratchDir } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const require = createRequire(import.meta.url);
let pass = 0, fail = 0;
const ok = (c, msg, detail) => { if (c) { pass++; console.log(`  ✓ ${msg}`); } else { fail++; console.log(`  ✗ ${msg}${detail !== undefined ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 600) : ''}`); } };
const J = (x) => JSON.stringify(x);
const U = require(path.join(REPO, 'src/agy-turn-usage.js'));
const SB = require(path.join(REPO, 'src/status-bar-facts.js'));
const H = require(path.join(REPO, 'src/harnesses'));
const { AcpMessageManager, AcpSessionMessages } = require(path.join(REPO, 'src/acp-message-manager.js'));
const FIX = path.join(REPO, 'scripts/fixtures/agy-status-bar');
const TRANSCRIPT = fs.readFileSync(path.join(FIX, 'transcript.jsonl'), 'utf8');
const AGY_ROW = H.get('antigravity').ui.statusBar;

console.log('— ① PURE: what agy counts, and the turn in its own transcript');
// THE MEASURED FACT (the owner's conversations, 2026-10-21, shapes only): the stream's running total = the transcript's
// sums. One turn of 90 calls: 545 062 in / 172 175 out / 6 556 922 cache reads (total 717 237 = in + out); five turns:
// 577 850 / 58 173 / 4 065 912. The last call of the first conversation: 2 379 in + 87 849 cached = 90 228 = its context.
const OWNER_1 = { input_tokens: 545062, output_tokens: 172175, thinking_tokens: 70363, cache_read_tokens: 6556922, total_tokens: 717237 };
ok(OWNER_1.total_tokens === OWNER_1.input_tokens + OWNER_1.output_tokens && OWNER_1.cache_read_tokens > OWNER_1.input_tokens,
  'the measured shape: total = input + output (thinking reported beside it), input EXCLUDES cache reads (6.56 M read from cache against 545 k input)');
ok(J(U.usageOf(OWNER_1)) === J({ input: 545062, output: 172175, thinking: 70363, cacheRead: 6556922, total: 717237 }) && U.usageOf(null) === null && U.usageOf([]) === null && J(U.usageOf({ input_tokens: -3, output_tokens: 'x' })) === J({ input: 0, output: 0, thinking: 0, cacheRead: 0, total: 0 }),
  'usageOf: agy\'s five counters, absent / negative / junk = 0, a non-object = null');
const tt = U.transcriptTurn(TRANSCRIPT);
ok(tt.complete && tt.calls === 2 && tt.input === 3538 + 2379 && tt.cacheRead === 10191 + 87849 && tt.output === 169 + 1315 && J(tt.last) === J({ input: 2379, cacheRead: 87849, output: 1315 }),
  'transcriptTurn: the CURRENT turn = the model rows after the last USER_INPUT (a checkpoint and a tool row are not calls), its last call = the live context', tt);
const cut = TRANSCRIPT.slice(TRANSCRIPT.indexOf('"step_index": 5') - 30);
const tc = U.transcriptTurn(cut);
ok(!tc.complete && tc.calls === 2 && J(tc.last) === J(tt.last), 'a tail cut INSIDE the turn (no USER_INPUT, a broken first line): the last call is still exact, the turn is marked incomplete', tc);
ok(J(U.transcriptTurn('')) === J({ calls: 0, input: 0, output: 0, cacheRead: 0, last: null, complete: false }) && U.transcriptTurn('not json\n{bad').last === null, 'no transcript text / garbage ⇒ no call, no last');
const prev = U.usageOf({ input_tokens: 1000, output_tokens: 100, thinking_tokens: 40, cache_read_tokens: 5000, total_tokens: 1100 });
const now = U.usageOf({ input_tokens: 1500, output_tokens: 160, thinking_tokens: 70, cache_read_tokens: 9000, total_tokens: 1660 });
ok(J(U.deltaOf(now, prev)) === J({ input: 500, output: 60, thinking: 30, cacheRead: 4000, total: 560 }) && U.deltaOf(now, null) === null && U.deltaOf(prev, now) === null,
  'deltaOf: the turn = this total − the last one; no earlier total, or a counter that went DOWN ⇒ null (never a guessed split)');
const full = U.turnUsage({ usage: OWNER_1, prev: null, transcript: tt, model: 'gemini-4-argon-high', modelFrom: 'asked', durationSeconds: 61.7 });
ok(J(full.total) === J(U.usageOf(OWNER_1)) && full.turn.calls === 2 && full.turn.total === full.turn.input + full.turn.output && full.turn.thinking === null && J(full.last) === J(tt.last) && full.model === 'gemini-4-argon-high' && full.modelFrom === 'asked' && full.durationSeconds === 61.7,
  'turnUsage: total = the stream\'s running total; turn = the transcript\'s rows (thinking only from a delta — the transcript has no thinking count); last = the last call; the asked model; the result\'s time', full);
const viaDelta = U.turnUsage({ usage: { input_tokens: 1500, output_tokens: 160, thinking_tokens: 70, cache_read_tokens: 9000, total_tokens: 1660 }, prev, transcript: tc });
ok(J(viaDelta.turn) === J({ input: 500, output: 60, thinking: 30, cacheRead: 4000, total: 560, calls: null }) && J(viaDelta.last) === J(tc.last) && viaDelta.model === null && viaDelta.modelFrom === null,
  'an incomplete tail: the turn is the delta of two totals, the last call still the transcript\'s; no model known ⇒ null, not a guess', viaDelta);
ok(U.turnUsage({ usage: { input_tokens: 0, output_tokens: 0, thinking_tokens: 0, cache_read_tokens: 0, total_tokens: 0 } }) === null && U.turnUsage({ usage: null }) === null && U.turnUsage({ usage: OWNER_1 }).last === null,
  'agy counted nothing (the unauthenticated refusal) ⇒ no record; no transcript ⇒ last null (the bar keeps what it had)');
ok(U.turnUsage({ usage: OWNER_1, model: 'gemini-4-argon-high', modelFrom: 'agy' }).modelFrom === 'agy', 'a slug agy NAMED is marked agy (the served model); one it was only started with is «asked»');
const ctxPct = (last) => Math.round(((last.input + last.cacheRead) / SB.windowOf(AGY_ROW, 'gemini-4-argon-high')) * 100);
ok(ctxPct(full.last) === 9 && SB.windowOf(AGY_ROW, 'gemini-4-argon-high') === 1048576, 'the context of the measured shape = 90 228 of the documented 1 048 576 = 9 % (the window table: Google\'s model page, named in the descriptor)');
ok(SB.windowOf(AGY_ROW, 'gemini-3.1-pro-high') === 1048576 && SB.windowOf(AGY_ROW, 'GEMINI-3.8-FLASH-medium') === 1048576 && SB.windowOf(AGY_ROW, 'gemini-4-argonaut') === 0 && SB.windowOf(AGY_ROW, '') === 0 && SB.windowOf(H.get('claude').ui.statusBar, 'gemini-4-argon-high') === 0,
  'windowOf: a slug = <code>-<level> (case-insensitive), a longer name sharing letters is NOT the model, no model / a \'reported\' row ⇒ 0');

console.log('— ② THE NORMALIZER: the wrapper\'s `usage` record → the usage meta, chatStatus');
const REC = { ts: '2026-10-21T14:10:21Z', type: 'acp', kind: 'usage', sessionId: 'c0ffee00-0000-4000-8000-00000000a9c1', ...full };
const ops = [];
const mm = new AcpMessageManager('sid-usage');
mm.onOp((op) => ops.push(op));
mm.processLive(REC);
const um = ops.find((o) => o.op === 'meta' && o.subtype === 'usage');
ok(um && um.data.input_tokens === 2379 && um.data.cache_read_input_tokens === 87849 && um.data.cache_creation_input_tokens === 0 && um.data.totals.total_tokens === 717237 && um.data.totals.cached_input_tokens === 6556922 && um.data.totals.reasoning_output_tokens === 70363 && um.data.turnMs === 61700 && um.data.turn.calls === 2,
  'the usage meta: the LAST call is the context + cache (claude\'s last-message reading), the running total is the odometer (codex\'s totals shape: cached = cache reads, reasoning = thinking), the turn\'s spend + time ride beside', um?.data);
ok(!ops.some((o) => o.subtype === 'served-model'), 'a model agy was only STARTED with is not announced as served');
const ops2 = []; const mm2 = new AcpMessageManager('sid-usage2'); mm2.onOp((o) => ops2.push(o));
mm2.processLive({ ...REC, last: null, modelFrom: 'agy' });
const um2 = ops2.find((o) => o.subtype === 'usage');
ok(um2 && um2.data.input_tokens === 0 && um2.data.cache_read_input_tokens === 0 && um2.data.totals.total_tokens === 717237 && ops2.some((o) => o.subtype === 'served-model' && o.data.model === 'gemini-4-argon-high'),
  'no last call (no transcript): zero context fields — the bar keeps its reading — the odometer still moves; a model agy NAMED is the served model', um2?.data);
const BUF = scratchDir('sbf-buf');
const buffer = [{ type: 'acp', kind: 'session', sessionId: REC.sessionId, cwd: '/w', how: 'new', model: 'gemini-4-argon-high' }, REC].map((r) => J(r)).join('\n') + '\n';
const st = new AcpSessionMessages({ buffer }, 'sess-x', { buffersDir: BUF }).chatStatus();
ok(st && st.lastUsage.input_tokens === 2379 && st.lastUsage.cache_read_input_tokens === 87849 && st.totalUsage.total_tokens === 717237 && st.turnMs === 61700 && st.turnUsage.calls === 2,
  'chatStatus (attach / reload) replays the journal: the same last call, total, turn and time', st);
fs.writeFileSync(path.join(BUF, 'sess-old.json'), J({ backend: 'antigravity', model: 'gemini-4-argon-high', usage: { ...OWNER_1, at: 1 } }));
const old = new AcpSessionMessages({ buffer: buffer.split('\n')[0] + '\n' }, 'sess-old', { buffersDir: BUF }).chatStatus();
ok(old && old.totalUsage.total_tokens === 717237 && old.totalUsage.cached_input_tokens === 6556922 && old.totalUsage.reasoning_output_tokens === 70363 && old.lastUsage === null,
  'a conversation whose wrapper predates the record (dtach keeps it across an update): the odometer from the sidecar\'s own running total — the context stays unknown (no last call)', old);
fs.writeFileSync(path.join(BUF, 'sess-acp.json'), J({ backend: 'opencode', usage: { used: 5000, size: 128000 } }));
ok(new AcpSessionMessages({ buffer: buffer.split('\n')[0] + '\n' }, 'sess-acp', { buffersDir: BUF }).chatStatus().totalUsage === null, 'an ACP sidecar\'s {used, size} is no running total (no odometer invented)');

console.log('— ③ THE REAL BAR (a fake DOM) per harness, gated on its declared row');
class FakeEl {
  constructor(tag) { this.tagName = String(tag).toUpperCase(); this.attrs = new Map(); this.childNodes = []; this.parentNode = null; this._html = ''; this.style = {}; this.dataset = {}; }
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
async function barOf(file) {
  const { ChatStatusBar } = await import(pathToFileURL(file).href); // imported BEFORE the fake document (utils.js binds real listeners at load when one exists)
  globalThis.document = { createElement: (t) => new FakeEl(t) };
  return (backend, status, usage) => {
    const bar = new ChatStatusBar({ send() {} }, 'sid-facts', { backend, getToolMsg: () => null, openSubagentViewer() {}, openInTempEditor() {} });
    if (status) bar.applyStatus(status);
    for (const u of [].concat(usage || [])) bar.updateUsage(u);
    const chips = Object.fromEntries(bar.element.children.map((c) => [c.getAttribute('data-chip'), { text: c.textContent, title: c.title }]));
    return chips;
  };
}
const bar = await barOf(path.join(REPO, 'src/lib/chat-status-bar.js'));
{
  const a = bar('antigravity', { model: 'gemini-4-argon-high' }, um.data);
  ok(a.ctx && /^9%\[90k\/1\.0m\]$/.test(a.ctx.text.replace(/\s+/g, '')) && /Context: 90k of 1\.0m tokens/.test(a.ctx.title) && /documented window/.test(a.ctx.title),
    'antigravity: context % against the model\'s DOCUMENTED window (9 % [90k/1.0m]) — the title names the table as the window\'s source', a.ctx);
  ok(a.cache && /97%/.test(a.cache.text) && /\(88k of 90k\)/.test(a.cache.title), 'antigravity: ⚡ the last call\'s cache hit rate (97 %), claude\'s rule', a.cache);
  ok(a.odometer && a.odometer.text === 'Σ717k' && /in 545k, cached 6\.6m, out 172k, thinking 70k = 10% of the total/.test(a.odometer.title),
    'antigravity: Σ the odometer = agy\'s running total (717k), its title the split and the THINKING SHARE (10 % of the total)', a.odometer);
  ok(a['turn-time'] && /1m01s/.test(a['turn-time'].text) && /The last turn took 1m01s · it spent 7k tokens \(in 6k, cached 98k, out 1k\) over 2 model calls/.test(a['turn-time'].title),
    'antigravity: the turn\'s own time (1m01s) and its spend in the title', a['turn-time']);
  ok(!a.unreported, 'antigravity reports all five — no «not reported» chip', a.unreported);
  const u = bar('antigravity', { model: 'gemini-9-ultra-high' }, um.data);
  ok(u['ctx-unknown'] && u['ctx-unknown'].text === '90k/window unknown' && /window is unknown \(it is not in this harness's window table\)/.test(u['ctx-unknown'].title) && !u.ctx,
    'a slug NOT in the table: «window unknown» with the token count — never a guessed percentage', u['ctx-unknown']);
  const keep = bar('antigravity', { model: 'gemini-4-argon-high' }, [um.data, um2.data]);
  ok(keep.ctx && /9%/.test(keep.ctx.text), 'a later reading with no last call (no transcript) keeps the context it had — a sum never becomes a context', keep.ctx);
  const c = bar('claude', { model: 'claude-fable-5-1', contextWindow: 200000, lastUsage: { input_tokens: 2000, cache_read_input_tokens: 48000, cache_creation_input_tokens: 0 } }, { input_tokens: 2000, cache_read_input_tokens: 48000, cache_creation_input_tokens: 0, totals: { total_tokens: 99 } });
  ok(c.ctx && /25%/.test(c.ctx.text) && c.cache && /96%/.test(c.cache.text) && !c.odometer && !c['turn-time'],
    'claude: context + cache as before; no Σ / time chip even when a feed carries totals (its row declares neither)', c);
  ok(c.unreported && c.unreported.text === 'not reported' && c.unreported.title === 'Not reported by this harness: token total, turn time', 'claude: ONE «not reported» chip naming what it lacks (token total, turn time) — never a blank', c.unreported);
  const o = bar('opencode', { model: 'm' }, { input_tokens: 30000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, contextWindow: 128000, totals: null });
  ok(o.ctx && /23%/.test(o.ctx.text) && !o.cache && !o['cache-k'], 'opencode (ACP: usage_update has no cache field): context yes, NO ⚡0% (the base drew a cache rate the stream never reported)', o);
  ok(o.unreported && o.unreported.title === 'Not reported by this harness: cache hit rate, token total, turn time', 'opencode: «not reported» names the cache hit rate, the token total and the turn time', o.unreported);
  const x = bar('codex', { model: 'gpt-a' }, { input_tokens: 40000, cache_read_input_tokens: 30000, cache_creation_input_tokens: 0, contextWindow: 400000, totals: { total_tokens: 900000, input_tokens: 800000, cached_input_tokens: 500000, output_tokens: 100000, reasoning_output_tokens: 60000 } });
  ok(x.odometer && x.odometer.text === 'Σ900k' && /thinking 60k = 7% of the total/.test(x.odometer.title) && x.unreported?.title === 'Not reported by this harness: turn time',
    'codex: its totals are the same odometer row (Σ900k, reasoning = the thinking share); it lacks only the turn time', x);
}

console.log('— ④ MUTANTS: each rule above is load-bearing');
const M = mutantCopies('status-bar-facts', REPO);
{
  const src = fs.readFileSync(path.join(REPO, 'src/lib/chat-status-bar.js'), 'utf8');
  const gate = '    if (facts.cache && this._statusLastCacheRead != null && this._statusLastInputTokens) {';
  ok(src.includes(gate), 'control anchor: the cache chip is gated on the facts row');
  const mbar = await barOf(M.write('src/lib/chat-status-bar.js', src.replace(gate, '    if (this._statusLastCacheRead != null && this._statusLastInputTokens) {'), 'nogate', { esm: true }));
  const o = mbar('opencode', { model: 'm' }, { input_tokens: 30000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, contextWindow: 128000 });
  ok(o.cache && /0%/.test(o.cache.text), 'RED (the base shape): without the row gate opencode draws ⚡0% — a cache rate its stream never reported (③ sees it)', o.cache);
  const usrc = fs.readFileSync(path.join(REPO, 'src/agy-turn-usage.js'), 'utf8');
  const lastLine = '  const last = transcript && transcript.last ? { ...transcript.last } : null;';
  ok(usrc.includes(lastLine), 'control anchor: the context is the transcript\'s LAST call');
  const MU = M.load('src/agy-turn-usage.js', usrc.replace(lastLine, '  const last = turn ? { input: turn.input, cacheRead: turn.cacheRead, output: turn.output } : null;'), 'sum-as-context');
  const bad = MU.turnUsage({ usage: OWNER_1, transcript: { complete: true, calls: 90, input: 545062, output: 172175, cacheRead: 6556922, last: { input: 2379, cacheRead: 87849, output: 1315 } } });
  ok(ctxPct(bad.last) === 677, 'RED: the context taken from the turn\'s SUM reads 677 % of the window on the owner\'s measured turn (① sees 9 %)', ctxPct(bad.last));
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);

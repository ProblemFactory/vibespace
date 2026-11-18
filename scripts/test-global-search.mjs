#!/usr/bin/env node
// test-global-search — SEARCH EVERYTHING (lane global-search, .221): the PURE rules as tables
// (src/search-model.js), the index worker over FIXTURE transcripts of two harnesses (a claude JSONL,
// a codex rollout, a codex .jsonl.zst — every one through its descriptor's reader), the measured size
// bound (index ≤ 6× the indexed text, PRINTED), cursor resume after a kill mid-walk (row count exact),
// the live door (a real normalizer's cards), artifacts (index, re-index on edit, removal), the routes
// (cookie-only, agent 403, scope, operators only), the rebuild, and the censuses (no harness id, no
// store of the five clear kinds) — with 4 patched-copy controls: the trigram tokenizer, no cursor,
// the index under data/, a raw-shape branch for one harness.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import http from 'node:http';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { mutantCopies } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const FIX = path.join(REPO, 'scripts/fixtures/global-search');
const MUT = mutantCopies('global-search', REPO);
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (e !== undefined ? ' — ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 600) : '')); } };
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
const M = require(path.join(REPO, 'src/search-model.js'));
const SI = require(path.join(REPO, 'src/server/search-index.js'));
const quiet = { log() { }, warn() { }, error() { } };

// ── §1 THE PURE RULES ──
console.log('§1 the PURE rules (search-model.js)');
const SEG = [
  ['限额刷新', '限额 额刷 刷新'], ['限额', '限额'], ['额', '额'], ['Gmail 限额', 'Gmail 限额'], ['カタカナ', 'カタ タカ カナ'], ['ひらがな', 'ひら らが がな'],
  ['한국어', '한국 국어'], ['abc限额def', 'abc 限额 def'], ['quota-units 2026', 'quota-units 2026'], ['𠀀𠀁', '𠀀𠀁'], ['你好，世界', '你好 ， 世界'],
];
for (const [i, o] of SEG) ok(M.segment(i).replace(/\s+/g, ' ').trim() === o, `segment(${JSON.stringify(i)}) → ${JSON.stringify(o)}`, M.segment(i));
const QF = [
  ['限额', '"限额"'], ['限额刷新', '"限额 额刷 刷新"'], ['限额 Gmail', '"限额" AND "gmail" *'], ['unresp', '"unresp" *'], ['a', '"a"'], ['额', '"额" *'],
  ['"quota units" 限额', '"quota units" AND "限额"'], ['NEAR(a b)', '"near a" AND "b"'], ['AND OR NOT', '"and" AND "or" AND "not" *'], ['col:x', '"col x"'], ['*', ''], ['"" ()', ''], ['  ', ''], ['^-+', ''],
];
for (const [i, o] of QF) ok(M.queryFor(i) === o, `queryFor(${JSON.stringify(i)}) → ${JSON.stringify(o)}`, M.queryFor(i));
const card = (role, content) => ({ id: 's:k', role, content });
ok(M.textOf(card('user', [{ type: 'text', text: 'hi' }])) === 'hi' && M.textOf(card('assistant', [{ type: 'thinking', text: 'no' }, { type: 'text', text: 'yes' }, { type: 'tool_call', input: { a: 1 } }])) === 'yes',
  'textOf: user / assistant text blocks only (thinking + tool call excluded)');
ok(M.textOf(card('tool', [{ type: 'tool_result', output: 'x' }])) === '' && M.textOf(card('system', [{ type: 'text', text: 'x' }])) === '' && M.textOf(null) === '', 'textOf: a tool / system card or nothing → not indexed');
ok(Buffer.byteLength(M.textOf(card('user', [{ type: 'text', text: '限'.repeat(40000) }]))) <= 64 * 1024, 'textOf: one row is capped at 64 KB (never mid-character)');
const KIND = [['/a/b.md', 'text'], ['/a/b.TS', 'text'], ['/a/b.html', 'html'], ['/a/b.docx', 'docx'], ['/a/b.png', null], ['/a/b.pdf', null]];
for (const [p, k] of KIND) ok(M.kindOf(p).kind === k, `kindOf(${p}) → ${k}${k ? '' : ' (skipped: ' + M.kindOf(p).skipped + ')'}`);
const html = M.artifactTextOf({ path: '/x.html', bytes: Buffer.from(fs.readFileSync(path.join(FIX, 'page.html'))) });
ok(/报告/.test(html.text) && /HTML 里的限额 & more/.test(html.text) && !/styleword|scriptword/.test(html.text), 'artifactTextOf(html): text only — style / script dropped, entities decoded', html);
ok(M.artifactTextOf({ path: '/x.bin.txt', bytes: Buffer.from([0, 1, 2, 65]) }).skipped === 'binary content' && M.artifactTextOf({ path: '/x.png', bytes: Buffer.from('x') }).skipped, 'artifactTextOf: binary bytes and unknown kinds are skipped WITH a reason');
const sn = M.snippetOf('x'.repeat(200) + ' 今天的限额刷新了 Gmail ' + 'y'.repeat(200), M.highlightTerms('限额 gmail'));
ok(sn.head && sn.tail && sn.text.length <= 140 && sn.ranges.length === 2 && sn.ranges.every(([a, b]) => ['限额', 'gmail'].includes(sn.text.slice(a, b).toLowerCase())), 'snippetOf: ±60 chars around the first hit, ranges = offsets of every term in the snippet', sn);
const rows = [{ kind: 'message', sid: 'A', score: -3, ts: 1 }, { kind: 'message', sid: 'A', score: -2, ts: 2 }, { kind: 'message', sid: 'B', score: -3, ts: 9 }, { kind: 'message', sid: 'A', score: -1, ts: 3 }, { kind: 'message', sid: 'A', score: -1, ts: 4 }, { kind: 'artifact', sessionId: 'C', path: '/p', score: -5, mtime: 1 }];
const rk = M.rankRows(rows);
ok(rk.map((g) => g.sid).join(',') === 'C,B,A' && rk[2].hits.length === 3 && rk[2].more === 1 && rk[2].hits[2].ts === 4, 'rankRows: grouped by conversation, best bm25 first, a tie by recency, ≤ 3 shown + "+N more"', rk.map((g) => [g.sid, g.hits.length, g.more]));

// ── §2 THE QUERY FUZZ against a real FTS5 table (unicode61, our segmentation) ──
console.log('§2 queryFor fuzz: 500 random strings never throw and never match everything');
{
  const emit = process.emitWarning; process.emitWarning = () => { }; // node:sqlite's ExperimentalWarning (expected)
  const { DatabaseSync } = require('node:sqlite');
  process.emitWarning = emit;
  const db = new DatabaseSync(':memory:');
  db.exec("CREATE VIRTUAL TABLE f USING fts5(body, tokenize = 'unicode61 remove_diacritics 2')");
  const docs = ['alpha bravo 限额刷新', 'charlie delta 发现页', 'echo foxtrot カタカナ', 'golf hotel 한국어', 'india juliet quota'];
  for (const d of docs) db.prepare('INSERT INTO f (body) VALUES (?)').run(M.segment(d));
  const CH = ['"', '(', ')', '*', '^', ':', '-', '+', 'AND', 'OR', 'NOT', 'NEAR', ' ', '{', '}', ',', 'a', 'b', '限', '额', 'カ', '\\', "'", '.', '/', 'x', '0', 'alpha', 'q'];
  let seed = 0x5eed; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  let threw = 0, all = 0, empty = 0; const bad = [];
  for (let i = 0; i < 500; i++) {
    let s = ''; const n = 1 + Math.floor(rnd() * 8); for (let j = 0; j < n; j++) s += CH[Math.floor(rnd() * CH.length)];
    let mq; try { mq = M.queryFor(s); } catch (e) { threw++; bad.push(s); continue; }
    if (!mq) { empty++; continue; }
    try { const c = db.prepare('SELECT COUNT(*) AS n FROM f WHERE f MATCH ?').get(mq).n; if (c === docs.length) { all++; bad.push(s); } } catch (e) { threw++; bad.push(s + ' ⇒ ' + mq + ' ⇒ ' + e.message); }
  }
  ok(threw === 0 && all === 0, `500 fuzzed queries: ${threw} threw, ${all} matched every row, ${empty} had no words (answered empty)`, bad.slice(0, 4));
  ok(db.prepare('SELECT COUNT(*) AS n FROM f WHERE f MATCH ?').get(M.queryFor('限额')).n === 1 && db.prepare('SELECT COUNT(*) AS n FROM f WHERE f MATCH ?').get(M.queryFor('qu')).n === 1, 'the 2-character Chinese query and a trailing Latin prefix each find their row');
}

// ── a scratch HOME with the fixture transcripts where each harness's locate looks ──
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-home-'));
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-data-'));
process.env.HOME = home;
const SID = '0f5e1a00-0000-4000-8000-00000000a001', TA = '0199aaaa-0000-7000-8000-00000000c0a1', TB = '0199bbbb-0000-7000-8000-00000000c0b2';
const proj = path.join(home, '.claude/projects/-w-proj'); fs.mkdirSync(proj, { recursive: true });
fs.copyFileSync(path.join(FIX, `claude-${SID}.jsonl`), path.join(proj, SID + '.jsonl'));
const cdir = path.join(home, '.codex/sessions/2026/10/05'); fs.mkdirSync(cdir, { recursive: true });
fs.copyFileSync(path.join(FIX, 'codex-rollout-a.jsonl'), path.join(cdir, `rollout-2026-10-05T10-00-00-${TA}.jsonl`));
fs.writeFileSync(path.join(cdir, `rollout-2026-10-05T10-00-00-${TB}.jsonl.zst`), zlib.zstdCompressSync(fs.readFileSync(path.join(FIX, 'codex-rollout-b.jsonl'))));
const CONVS = [{ sid: SID, backend: 'claude', cwd: '/w/proj' }, { sid: TA, backend: 'codex', cwd: '/w/codex' }, { sid: TB, backend: 'codex', cwd: '/w/codex' }];
const mk = (o = {}) => SI.create({ dataDir, homeDir: home, log: quiet, exitHook: false, bootDelayMs: 1e9, ...o });

console.log('§3 the worker over fixture transcripts of two harnesses (each through its descriptor)');
let ix = mk();
ix.start();
const idx = [];
for (const c of CONVS) idx.push(await ix.call('indexConversation', c));
ok(idx.every((r) => r.parsed && r.rows >= 2), `claude JSONL + codex rollout + codex .jsonl.zst all parsed (${idx.map((r) => r.rows + ' rows').join(', ')})`, idx);
const q = async (s, scope) => (await ix.search({ q: s, scope }));
let r = await q('限额');
const sids = new Set(r.hits.map((h) => h.sid));
ok(sids.has(SID) && sids.has(TA) && sids.has(TB) && r.hits.every((h) => h.snippet.ranges.length), `"限额" (2 characters) lists all three conversations with highlighted snippets (${r.total} hits)`, r.hits.map((h) => [h.sid.slice(0, 6), h.snippet.text]));
r = await q('限额 refill');
ok(r.hits.length === 1 && r.hits[0].sid === SID && r.hits[0].role === 'assistant', '"限额 refill" narrows to the one assistant message (AND between terms)', r.hits);
ok((await q('unresp')).hits.length === 1 && (await q('カタカナ')).hits.length === 1 && (await q('한국어')).hits.length === 1, 'a trailing Latin prefix, a katakana run and a Hangul run each find their message');
const none = await Promise.all(['zebrathought', 'toolargword', 'toolresultword'].map((w) => q(w)));
ok(none.every((x) => x.total === 0), 'thinking, tool inputs and tool results of both harnesses are NOT indexed', none.map((x) => x.total));
ok((await q('NEAR(" *')).total === 0 && (await q('"" ()')).empty === 'no-words', 'a query of operators only answers empty (never everything, never an error)');

console.log('§4 the size bound + the backfill rate (measured, printed)');
{
  const big = path.join(home, '.claude/projects/-w-big'); fs.mkdirSync(big, { recursive: true });
  const BS = '0f5e1a00-0000-4000-8000-00000000b16b';
  const W = ['限额', '刷新', '发现页', '读取', '浏览器', '回复', 'quota', 'refill', 'browser', 'thread', 'reply', 'index', 'カタカナ', '検索', 'search', 'message'];
  let seed = 7; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const lines = [];
  for (let i = 0; i < 3000; i++) {
    let t = ''; for (let j = 0; j < 40; j++) t += W[Math.floor(rnd() * W.length)] + (rnd() < 0.5 ? ' ' : '');
    lines.push(JSON.stringify(i % 2 ? { type: 'assistant', uuid: 'b' + i, sessionId: BS, timestamp: new Date(1e12 + i * 1000).toISOString(), message: { id: 'msg_b' + i, role: 'assistant', content: [{ type: 'text', text: t }, { type: 'tool_use', id: 't' + i, name: 'Bash', input: { command: 'x'.repeat(600) } }] } }
      : { type: 'user', uuid: 'b' + i, sessionId: BS, timestamp: new Date(1e12 + i * 1000).toISOString(), message: { role: 'user', content: t } }));
  }
  fs.writeFileSync(path.join(big, BS + '.jsonl'), lines.join('\n') + '\n');
  // the rate is the BACKFILL's own (its progress record: bytes read, ms) — the product's number, printed, never judged
  await ix.close(); ix = mk({ listConversations: async () => [{ sid: BS, backend: 'claude', cwd: '/w/big' }] }); ix.start();
  await ix.backfill({ reason: 'suite' });
  const bf = ix.stats().backfill, br = { rows: bf.rows, bytes: bf.bytes }, ms = Math.max(1, bf.ms);
  const before = (await ix.status()).index;
  await ix.close(); ix = mk(); ix.start(); // a restart checkpoints the WAL: the main file is the index's real size
  const st = (await ix.status()).index;
  const ratio = st.bytes / st.textBytes;
  console.log(`    MEASURED: ${st.rows} rows, ${(st.textBytes / 1048576).toFixed(2)} MB of indexed text → index ${(st.bytes / 1048576).toFixed(2)} MB = ${(ratio * 100).toFixed(0)} % of the text; backfill ${(br.bytes / 1048576).toFixed(2)} MB of JSONL in ${ms.toFixed(0)} ms = ${(br.bytes / 1048576 / (ms / 1000)).toFixed(1)} MB/s`);
  ok(br.rows === 3000 && ratio <= 6, `index ≤ 6× the indexed text on the fixture (${(ratio * 100).toFixed(0)} %, detail=full: phrase queries need positions)`, { st, before });
}

console.log('§5 cursor resume: a worker killed mid-walk indexes nothing twice');
async function walkResume(workerFile) {
  const d2 = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-data2-'));
  const make = () => SI.create({ dataDir: d2, homeDir: home, log: quiet, exitHook: false, bootDelayMs: 1e9, ...(workerFile ? { workerFile } : {}) });
  let a = make(); a.start();
  for (const c of CONVS.slice(0, 2)) await a.call('indexConversation', c);
  await a.close(); // the kill: a third conversation never started
  a = make(); a.start();
  const second = [];
  for (const c of CONVS) second.push(await a.call('indexConversation', c));
  const rows = (await a.call('status', {})).rows;
  await a.close({ final: true });
  return { parsed: second.filter((x) => x.parsed).length, rows };
}
const expectRows = idx.reduce((n, x) => n + x.rows, 0);
const res = await walkResume(null);
ok(res.parsed === 1 && res.rows === expectRows, `after the kill the walk re-read 1 of 3 transcripts (the cursors held the other 2) and the row count is exact (${res.rows} = ${expectRows})`, res);
const W0 = read('src/search-index-worker.js');
const noCursor = MUT.write('src/search-index-worker.js', W0.replace("if (cur && !reread && cur.size === st.size && cur.mtime === mtime) return", "if (false) return"), 'nocursor');
const resN = await walkResume(noCursor);
ok(resN.parsed === 3, `CONTROL (no cursor): the resumed walk re-reads all 3 transcripts — the resume leg goes RED (${resN.parsed} parsed)`, resN);

console.log('§6 the live door: a real normalizer\'s new complete cards are appended');
{
  const { createMessageManager } = require(path.join(REPO, 'src/normalizers.js'));
  const LS = '0f5e1a00-0000-4000-8000-0000000011fe';
  const s = { backend: 'claude', backendSessionId: LS, host: '', _normEpoch: 1, _normalizer: createMessageManager('claude', 'w-live') };
  await ix.close(); ix = mk({ liveDebounceMs: 20 }); SI.use(ix);
  s._normalizer.processLive({ type: 'user', uuid: 'lu1', message: { role: 'user', content: '直播里的限额问题' } });
  s._normalizer.processLive({ type: 'assistant', uuid: 'la1', message: { id: 'msg_live_1', role: 'assistant', content: [{ type: 'text', text: 'live answer about 限额' }] } });
  s._normalizer.processLive({ type: 'result', subtype: 'success' }); // the turn ends: the streaming card completes
  SI.noteLive(s); SI.noteLive(s);
  await new Promise((rr) => setTimeout(rr, 300));
  r = await q('限额');
  const live = r.hits.filter((h) => h.sid === LS);
  ok(live.length === 2 && live.every((h) => /^(u|m):/.test(h.uuid)), `two live cards appended once each through SI.noteLive (debounced) — mids are the normalizer's record keys (${live.map((h) => h.uuid).join(', ')})`, live);
  SI.noteLive(s); await new Promise((rr) => setTimeout(rr, 200));
  ok((await q('直播')).hits.length === 1, 'a second flush of the same cards appends nothing (no duplicate rows)');
  ok(/feedLive: \(s, m\) => \{ feedLive\(s, m\); SEARCH\.noteLive\(s\); \}/.test(read('src/server/session-stdout.js')), 'session-stdout\'s ONE feedLive gate (every stdout consumer feeds through it) tells the search index');
}

console.log('§7 artifacts: indexed, re-indexed on an edit, removed when the file is gone');
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-art-'));
  const md = path.join(dir, 'note.md'), ht = path.join(dir, 'page.html'), png = path.join(dir, 'x.png');
  fs.copyFileSync(path.join(FIX, 'note.md'), md); fs.copyFileSync(path.join(FIX, 'page.html'), ht); fs.writeFileSync(png, Buffer.from([0x89, 0x50]));
  SI.noteArtifact({ sessionId: 'w-a', host: '', path: md }); SI.noteArtifact({ sessionId: 'w-a', host: '', path: ht }); SI.noteArtifact({ sessionId: 'w-a', host: '', path: png });
  await ix.call('status', {});
  r = await q('限额', 'artifacts');
  ok(r.hits.length === 2 && r.hits.every((h) => h.kind === 'artifact' && h.sessionId === 'w-a'), `a .md and a .html artifact are found by their contents (scope=artifacts → files only: ${r.hits.map((h) => path.basename(h.path)).join(', ')})`, r.hits);
  const AR = require(path.join(REPO, 'src/server/artifact-registry.js'));
  fs.writeFileSync(md, '# 改过的笔记\n\nnewword 出现了\n'); fs.utimesSync(md, new Date(), new Date(Date.now() + 5000));
  AR.noteEdit({ sessionId: 'nobody', host: '', path: md });
  await ix.call('status', {});
  ok((await q('newword', 'artifacts')).hits.length === 1 && (await q('发现页', 'artifacts')).hits.length === 0, 'the registry\'s noteEdit re-reads the file: the new words are found, the old ones are gone');
  fs.unlinkSync(ht);
  await ix.call('sweepArtifacts', {});
  ok((await q('报告', 'artifacts')).hits.length === 0 && (await q('限额', 'chats')).hits.every((h) => h.kind === 'message'), 'a file gone since it was indexed leaves at the next sweep; scope=chats lists messages only');
  ok(/require\('\.\/search-index\.js'\)\.noteArtifact\(\{ sessionId: session\.sockName/.test(read('src/server/artifact-registry.js')), 'the registry\'s ONE writer (noteOp) hands every new / edited row\'s file to the index');
}

console.log('§8 the routes: cookie-only, scope, operators, status, rebuild');
{
  const routes = {};
  const app = { get: (p, h) => { routes['GET ' + p] = h; }, post: (p, h) => { routes['POST ' + p] = h; } };
  SI.mount(app, ix);
  const call = (k, { query = {}, headers = {} } = {}) => new Promise((resolve) => { const res = { code: 200, status(c) { this.code = c; return this; }, json(b) { resolve({ code: this.code, body: b }); } }; routes[k]({ query, headers }, res); });
  let a = await call('GET /api/search', { query: { q: '限额' }, headers: { authorization: 'Bearer vsst_abc' } });
  const b = await call('GET /api/search/status', { headers: { authorization: 'Bearer jbt_x' } });
  const c = await call('POST /api/search/rebuild', { headers: { authorization: 'Bearer vsst_abc' } });
  ok(a.code === 403 && a.body.code === 'agent_forbidden' && b.code === 403 && c.code === 403, 'an agent\'s session / job token is refused on all three routes (403 agent_forbidden)');
  a = await call('GET /api/search', { query: { q: '限额', scope: 'chats', limit: '2' } });
  ok(a.code === 200 && a.body.hits.length >= 2 && a.body.hits.every((h) => h.kind === 'message') && a.body.groups.length === 2 && typeof a.body.took === 'number', `cookie read: scope + limit (= conversations) honoured (${a.body.groups.length} conversations, total ${a.body.total})`, a.body);
  a = await call('GET /api/search', { query: { q: '(( "" ** ))' } });
  ok(a.code === 200 && a.body.total === 0 && a.body.hits.length === 0, 'a query that is only operators: 200, empty');
  const stt = await call('GET /api/search/status');
  ok(stt.body.index && stt.body.index.rows > 3000 && stt.body.dir && !stt.body.dir.startsWith(dataDir), 'status: rows + bytes + the index dir (on local disk, not under data/)', stt.body);
  ok(a.body.index && 'lastBuild' in a.body.index && a.body.index.backfill && typeof a.body.index.backfill.running === 'boolean', 'the search answer says how the index stands (state, backfill, lastBuild) — a window words «Indexing…» beside its count', a.body.index);
  const rb = await call('POST /api/search/rebuild');
  await new Promise((rr) => setTimeout(rr, 100));
  ok(rb.body.rebuilding && (await ix.call('status', {})).rows === 0, 'rebuild drops every row (the walk then re-reads the conversations)');
}

console.log('§9 the controls: trigram, the index under data/, a raw-shape branch; the store census');
{
  const tri = MUT.write('src/search-index-worker.js', W0.replace(/unicode61 remove_diacritics 2/, 'trigram'), 'trigram');
  const d3 = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-data3-'));
  const t = SI.create({ dataDir: d3, homeDir: home, log: quiet, exitHook: false, workerFile: tri }); t.start();
  for (const c of CONVS) await t.call('indexConversation', c);
  const tr = await t.search({ q: '限额' });
  await t.close({ final: true });
  ok(tr.total === 0, `CONTROL (trigram tokenizer): the 2-character Chinese query finds ${tr.total} rows — the §3 leg goes RED`);
  const O0 = read('src/server/search-index.js');
  const under = MUT.load('src/server/search-index.js', O0.replace("return { dir: path.join(homeDir, '.vibespace', 'db', hash), real };", "return { dir: path.join(dataDir, 'search-db'), real };").replace("if (dataReal && (inside(path.resolve(dir), dataReal) || inside(real, dataReal))) return REASON.UNDER_DATA;", ''), 'underdata');
  const judgeDir = (o) => { const x = o.create({ dataDir, homeDir: home, log: quiet, exitHook: false }); x.start(); const d = x.stats(); x.close({ final: true }); return d.state === 'starting' && !path.resolve(d.dir).startsWith(fs.realpathSync(dataDir)); };
  ok(judgeDir(SI) && !judgeDir(under), 'the index starts on local disk outside data/; CONTROL (the index under data/, the refusal removed) is RED');
  ok(SI.localDiskVerdict(path.join(dataDir, 'x'), fs.realpathSync(dataDir)) === 'index-under-data' && SI.localDiskVerdict('/tmp/x', '/nowhere', { statfs: () => ({ type: 0x6969 }) }) === 'not-local-disk' && SI.localDiskVerdict('/tmp/x', '/nowhere', { statfs: () => ({ type: 0xef53 }) }) === null,
    'the local-disk rule refuses data/ and an NFS / CIFS / FUSE mount by name, accepts ext4');
  // the no-harness-id census (test-architecture §46's rule over the three search files)
  const ID = /['"`](?:claude|codex|opencode|antigravity|acp|shell)['"`]|\b(?:response_item|event_msg|session_meta|function_call|tool_use|tool_result)\b|\.type\s*===?\s*['"`](?:user|assistant|result|message)['"`]/;
  const offenders = (txt) => txt.split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l) && ID.test(l.replace(/\/\/.*$/, '')));
  const FILES = ['src/search-model.js', 'src/search-index-worker.js', 'src/server/search-index.js'];
  const hits = FILES.flatMap((f) => offenders(read(f)).map((l) => f + ': ' + l.trim().slice(0, 80)));
  ok(hits.length === 0, `the three search files name no harness and parse no raw record shape (${FILES.length} files)`, hits);
  const raw = W0.replace("  const shape = { backend,", "  if (backend === 'codex') { for (const l of fs.readFileSync(file, 'utf8').split('\\n')) { const rec = JSON.parse(l); if (rec.type === 'response_item') S.insMsg.run(sid, host, backend, l.slice(0, 9), 0, 'user', l); } }\n  const shape = { backend,");
  ok(raw !== W0 && offenders(raw).length >= 1, 'CONTROL (a raw-shape branch for one harness in the worker) is caught by the census');
  const STORES = /\b(tasks|userTodos|sessionStatus|getJobs|getGroups|groupsEngine|recordClear|stashFor)\b/;
  ok(FILES.every((f) => !STORES.test(read(f).replace(/\/\/.*$/gm, ''))), 'the index reads none of the five "Clear content…" stores — a copy of transcripts + files (test-record-clear-census declares it)');
}
console.log('§10 a cleared group message is not found (B-b291): judged at every write, swept at the clear, handed to every worker');
{
  const { createChannelStore } = require(path.join(REPO, 'src/channel-store.js'));
  const G = require(path.join(REPO, 'src/channel-groups.js'));
  const RC = require(path.join(REPO, 'src/record-clear.js'));
  const N = require(path.join(REPO, 'src/normalizers.js'));
  const GE_REL = 'src/server/groups-engine.js';
  const ME = 'a11ce000-0000-4000-8000-00000000a001', OTHER = 'b0b00000-0000-4000-8000-00000000b002';
  const ROSTER = [{ cid: ME, name: 'me', groups: ['tg'], reachability: null }, { cid: OTHER, name: 'other', groups: ['tg'], reachability: null }];
  // the PURE rule the ladder's judge and the index share (src/record-clear.js)
  const W1 = RC.clearWitness('the  zirconquill\n ledger: totals attached and a great deal more words after them');
  ok(W1 === 'the zirconquill ledger: totals attached ' && Array.from(W1).length === 40 && RC.clearWitness('好的') === '好的', 'the witness: the first 40 code points of the whitespace-folded words');
  ok(RC.redactWitnessLines('- [11-17T22:50Z] me: the zirconquill ledger: totals attached\n- [11-17T22:51Z] me: and a plain line', [RC.clearWitness('the zirconquill ledger: totals attached')]) === `- ${RC.CLEARED_TEXT}\n- [11-17T22:51Z] me: and a plain line`
    && RC.redactWitnessLines('好的\nme: 好的\n好的吗', [], ['好的']) === `- ${RC.CLEARED_TEXT}\n- ${RC.CLEARED_TEXT}\n好的吗` && RC.redactWitnessLines('好的 x', ['好的']) === null && RC.redactWitnessLines('nothing', [W1]) === null,
    'the line rule: a line carrying a witness becomes the sentence line; a short message only as a whole line (or its «Name: » tail)');
  const proj = path.join(home, '.claude/projects/-w-clr'); fs.mkdirSync(proj, { recursive: true });
  let nSid = 0;
  const sidNew = () => `0f5e1a00-0000-4000-8000-0000c1ea${String(++nSid).padStart(4, '0')}`;
  const jsonl = (sid, texts) => { fs.writeFileSync(path.join(proj, sid + '.jsonl'), texts.map((t, i) => JSON.stringify({ type: 'user', uuid: `${sid.slice(-4)}-u${i}`, sessionId: sid, timestamp: new Date(2e12 + i * 1000).toISOString(), message: { role: 'user', content: t } })).join('\n') + '\n'); return { sid, backend: 'claude', cwd: '/w/clr' }; };
  const LEDGER = 'the zirconquill ledger: totals attached\nsecond line of the ledger'; // two lines: a card keeps them, a report folds them
  const F1MSG = 'Quarterly numbers for the marrowbank board are below\nRevenue 4.2M this quarter\nPlan: acquire Quillmere in Q1'; // the reader's F1: the first line holds the whole witness
  const F3MSG = 'the\u200b vellichor memo: plans for the quarter ahead and more'; // the reader's F3: a format character a report line drops
  const wake = (report) => `Another Claude session sent a message:\n${report}\n\nThis came from another Claude session — not typed by your user.`;
  async function scene(workerFile = null, GEmod = null, SIm = SI) {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-clr-'));
    const store0 = createChannelStore({ dir: path.join(d, 'channels') });
    const reads = { sync: 0, async: 0 }; // originalsOf's reads (a record looked up, a whole log) — the reader's F4
    const store = new Proxy(store0, { get: (t, k) => (k === 'findRecord' ? (...a) => { reads.sync++; return t.findRecord(...a); }
      : k === 'readTail' ? (a, b, o) => { if (o && o.limit >= 1e6) reads.sync++; return t.readTail(a, b, o); }
      : k === 'readTailAsync' ? (a, b, o) => { if (o && o.limit >= 1e6) reads.async++; return t.readTailAsync(a, b, o); } : t[k]) });
    let t = 2e12;
    const mkGE = () => (GEmod || require(path.join(REPO, GE_REL))).create({ store, deliver: null, broadcast() { }, now: () => (t += 60000), roster: () => ROSTER, groupSetting: () => 'none', onCleared: (gid) => SIm.noteCleared(gid), log: quiet });
    let ge = mkGE();
    const wire = () => SIm.setClearedSource((gid, o) => ge.clearedCopies(gid, o), () => ge.clearedCopiesAsync()); // the channels wiring's seam
    wire();
    const g1 = (await ge.create({ by: G.OWNER, name: 'wake', members: [ME, OTHER], quiet: true, consent: () => ({ ok: true }) })).group.id;
    const g2 = (await ge.create({ by: G.OWNER, name: 'other', members: [ME, OTHER], quiet: true, consent: () => ({ ok: true }) })).group.id;
    const post = async (g, text) => (await ge.post({ group: g, from: ME, text })).message;
    const p1 = await post(g1, LEDGER), p2 = await post(g1, 'and a plain line'), p4 = await post(g1, '好的');
    const pF1 = await post(g1, F1MSG), pF3 = await post(g1, F3MSG), pDone = await post(g1, 'done!'); await post(g1, 'all done! thanks');
    await post(g2, LEDGER); await post(g2, '好的');
    const reportOf = (g) => G.reportFor(store.groups.live().groups[g], store.readTail('groups', g, { limit: 50 }), OTHER, { budget: 8192 }).text;
    const R1 = reportOf(g1), R2 = reportOf(g2);
    const make = () => SIm.use(SIm.create({ dataDir: d, homeDir: home, log: quiet, exitHook: false, bootDelayMs: 1e9, liveDebounceMs: 20, ...(workerFile ? { workerFile } : {}) }));
    let x = make(); x.start();
    const C1 = jsonl(sidNew(), [wake(R1), `pasted for the record:\n${R1}`, wake(R2)]);
    await x.call('indexConversation', C1);
    // LIVE: a report card (the ring's, id …:gm:<group>:<instant>), a wake's card (the ladder's: its own id, peerGroup) of
    // p1, a wake's card of F1MSG as written (several lines), and a card of F1MSG that names NO group (a harness whose
    // card carries none — the reader's F2)
    const s = { backend: 'claude', backendSessionId: sidNew(), host: '', _normEpoch: 1, _historyLoaded: true, _normalizer: N.createMessageManager('claude', 'w-clr') };
    N.feedPeerCard(s, { fromName: 'me', text: p1.text, group: { id: g1, at: p1.at, name: 'wake' } });
    N.feedPeerCard(s, { fromName: 'me', text: p1.text, group: { id: g1, at: p2.at, name: 'wake' }, recorded: wake(R1) });
    N.feedPeerCard(s, { fromName: 'me', text: pF1.text, group: { id: g1, at: pF3.at, name: 'wake' }, recorded: wake(R1) });
    s._normalizer.injectPeerCard({ fromName: 'me', text: pF1.text, kind: 'peer' });
    // the cure's controls (lens three): a ring card of p1 whose words are OTHER words (only its card key clears it), and a
    // live card of g1 that carries the message's first line + a note (only its group, carried live, lets the line rule judge it)
    const s2 = { backend: 'claude', backendSessionId: sidNew(), host: '', _normEpoch: 1, _historyLoaded: true, _normalizer: N.createMessageManager('claude', 'w-clr2') };
    N.feedPeerCard(s2, { fromName: 'me', text: 'a card that kept other words', group: { id: g1, at: p1.at, name: 'wake' } });
    s2._normalizer.injectPeerCard({ fromName: 'me', text: `${F1MSG.split('\n')[0]}\nand a note from me`, kind: 'peer', group: { id: g1, at: p4.at, name: 'wake' } });
    SIm.noteLive(s); SIm.noteLive(s2); await new Promise((rr) => setTimeout(rr, 40)); await x.call('status', {}); // the debounce, then the FIFO
    const find = async (w) => (await x.search({ q: w, scope: 'chats', limit: 50 })).hits;
    const o = { g1, g2 };
    o.before = (await find('zirconquill')).length;
    o.f1before = (await find('Quillmere')).length; o.f3before = (await find('vellichor')).length; o.thanks = (await find('thanks')).length;
    // THE CLEAR (the engine's own door, the worker running): p1, the short p4, F1MSG, F3MSG and «done!» of g1
    const rc = await ge.clearMessages({ group: g1, ids: [p1.vendorId, p4.vendorId, pF1.vendorId, pF3.vendorId], by: G.OWNER });
    o.cleared = rc.cleared.length;
    const r0 = reads.sync;
    await ge.clearMessages({ group: g1, ids: [pDone.vendorId], by: G.OWNER });
    o.readsAtClear = reads.sync - r0;                         // the clear's own lookup only — the set grew from its records
    await x.call('status', {}); // the FIFO: the sweep is done
    const hits = await find('zirconquill');
    o.after = hits.length; o.afterOther = hits.filter((h) => h.sid === C1.sid).length;
    o.plain = (await find('plain line')).length;           // the cleared record's neighbours keep their words
    o.pasted = (await find('pasted record')).length;
    o.short = (await find('好的')).length;                  // g2's short message stays; g1's is gone
    o.liveRows = hits.filter((h) => h.sid === s.backendSessionId).length;
    o.f1after = (await find('Quillmere')).length;          // a later line of a card that holds the message as written (F1, F2)
    o.f3after = (await find('vellichor')).length;           // a hidden character in the first 40 (F3)
    o.thanksAfter = (await find('thanks')).length;          // «done!» cleared: a longer line holding it stays (F6)
    o.keyOnly = (await find('kept other words')).length;    // a card of the record whose words differ: its key clears it
    o.marrow = (await find('marrowbank')).length;            // every copy of F1MSG's first line, the live card that carries only its group too
    // THE READERS' SHOULD: the person's OWN message with the same whole words, in an unrelated conversation, stays found
    const C4 = jsonl(sidNew(), [F1MSG]);
    await x.call('indexConversation', C4);
    o.ownStays = (await find('Quillmere')).filter((h) => h.sid === C4.sid).length;
    // A RESTART: the next worker is handed the same set — nothing to sweep, nothing comes back
    await x.close(); x = make(); x.start();
    o.restart = (await find('zirconquill')).length;
    // AFTER THE CLEAR, a conversation indexed for the first time (its transcript holds g1's report as delivered)
    const C2 = jsonl(sidNew(), [wake(R1)]);
    await x.call('indexConversation', C2);
    o.lateRows = (await find('zirconquill')).filter((h) => h.sid === C2.sid).length + (await find('Quillmere')).filter((h) => h.sid === C2.sid).length;
    // A CLEAR WHILE NO WORKER RUNS: indexed before, cleared with the worker gone, swept when the next one starts
    const p6 = await post(g1, 'the quartzfennel memo for the board');
    const C3 = jsonl(sidNew(), [wake(reportOf(g1))]);
    await x.call('indexConversation', C3);
    o.p6before = (await find('quartzfennel')).length;
    await x.close();
    await ge.clearMessages({ group: g1, ids: [p6.vendorId], by: G.OWNER });
    // …and A HUB BOOT: a fresh engine (its cache empty) — the worker's set is read off the loop, a search waits for it
    ge = mkGE(); wire();
    const r1 = reads.sync, a1 = reads.async;
    x = make(); x.start();
    o.p6after = (await find('quartzfennel')).length;
    o.bootSync = reads.sync - r1; o.bootAsync = reads.async - a1;
    // A REBUILD re-derives every row through the judge
    await x.call('drop', {});
    for (const c of [C1, C2, C3]) await x.call('indexConversation', c);
    o.rebuilt = (await find('zirconquill')).length + (await find('quartzfennel')).length + (await find('vellichor')).length;
    await x.close({ final: true }); store0.close();
    SIm.setClearedSource(null);
    return o;
  }
  const o = await scene();
  ok(o.before === 5 && o.cleared === 4 && o.f1before >= 3 && o.f3before >= 2, `setup: before the clear the words are found — 5 rows of the ledger (a wake's card, a pasted report, the other group's card, a live report card, a live wake card), ${o.f1before} of a message written on several lines, ${o.f3before} of one with a hidden character`, o);
  ok(o.after === 1 && o.afterOther === 1, `after the clear (the worker running) only the OTHER group's message with the same words is found (${o.after})`, o);
  ok(o.plain === 2 && o.pasted === 1 && o.liveRows === 0, 'the rows keep every other line — the next message, a pasted report\'s own words; a live card of the message is the sentence', o);
  ok(o.short === 1, `a SHORT message (2 characters, under the witness) is cleared as a whole line of its group's card only — the other group's stays (${o.short})`, o);
  ok(o.f1after === 0, `a message written on several lines (its first line longer than the witness) is gone from a card that holds it as written, and from a card that names no group (${o.f1after})`, o);
  ok(o.f3after === 0, `a message with a hidden character in its first 40 is gone from the copies that wrote it belted (${o.f3after})`, o);
  ok(o.keyOnly === 0 && o.marrow === 0, `a card of the record whose words differ is cleared by its key; a live card that carries only the group is judged by the line rule (${o.keyOnly}, ${o.marrow})`, o);
  ok(o.ownStays === 1, `the person's own message with the same whole words, in an unrelated conversation, stays found (${o.ownStays}) — only a PEER card that names no group is judged whole`, o);
  ok(o.thanks === o.thanksAfter && o.thanks >= 1, `a short cleared message («done!») clears no longer line that holds it («all done! thanks» stays: ${o.thanksAfter})`, o);
  ok(o.readsAtClear === 1, `a later clear reads only its own record — the set grows from it, never the group's log again (${o.readsAtClear} read)`, o);
  ok(o.restart === 1 && o.lateRows === 0, 'a restart brings nothing back; a conversation first indexed after the clear is judged at its write', o);
  ok(o.p6before === 1 && o.p6after === 0 && o.bootSync === 0 && o.bootAsync >= 1, `a clear made while no worker ran is swept by the next worker; at a boot the set is read off the loop (${o.bootSync} sync, ${o.bootAsync} async reads) and the first search waits for it`, o);
  ok(o.rebuilt === 1, `a rebuild re-derives every row through the judge (${o.rebuilt})`, o);
  // THE SCHEMA STEP KEEPS A RELEASE'S ROWS (the cure's reader N1): a conversation the backfill cannot read again (a harness
  // with no transcript reader) stays found; one it can read is read again and its rows replaced; a RED control (the old drop)
  const mkV1 = () => {
    const d5 = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-v1-'));
    const dir5 = SI.indexDirFor(d5, home).dir; fs.mkdirSync(dir5, { recursive: true });
    const { DatabaseSync } = require('node:sqlite');
    const TOK = "tokenize = 'unicode61 remove_diacritics 2'";
    const db1 = new DatabaseSync(path.join(dir5, 'search.db'));
    for (const q of ["CREATE TABLE msg (id INTEGER PRIMARY KEY, sid TEXT NOT NULL, host TEXT NOT NULL DEFAULT '', backend TEXT, mid TEXT NOT NULL, ts INTEGER, role TEXT, body TEXT NOT NULL, UNIQUE (host, sid, mid))",
      `CREATE VIRTUAL TABLE msg_fts USING fts5 (body, content = 'msg', content_rowid = 'id', ${TOK}, detail = full)`,
      "CREATE TABLE art (id INTEGER PRIMARY KEY, sessionId TEXT, host TEXT NOT NULL DEFAULT '', path TEXT NOT NULL, mtime INTEGER, kind TEXT, skipped TEXT, body TEXT NOT NULL DEFAULT '', UNIQUE (host, path))",
      `CREATE VIRTUAL TABLE art_fts USING fts5 (body, content = 'art', content_rowid = 'id', ${TOK}, detail = full)`,
      'CREATE TABLE cursor (file TEXT PRIMARY KEY, sid TEXT, host TEXT, size INTEGER, mtime INTEGER, lines INTEGER, state TEXT)',
      'CREATE TABLE meta (k TEXT PRIMARY KEY, v TEXT)']) db1.exec(q);   // the release's schema 1, letter for letter
    const ins = db1.prepare('INSERT INTO msg (sid, host, backend, mid, ts, role, body) VALUES (?, ?, ?, ?, ?, ?, ?)'), fts = db1.prepare('INSERT INTO msg_fts (rowid, body) VALUES (?, ?)');
    const put = (sid, backend, mid, body) => { const r = ins.run(sid, '', backend, mid, 1, 'user', body); fts.run(r.lastInsertRowid, M.segment(body)); };
    put('ag-conv-1', 'antigravity', 'x1', 'the olivequartz note of a conversation no transcript reader can read');
    put(MIG_SID, 'claude', 'u:m-old', 'the stalewords row the release wrote');
    db1.prepare('INSERT INTO cursor (file, sid, host, size, mtime, lines, state) VALUES (?, ?, ?, ?, ?, ?, ?)').run(MIG_FILE, MIG_SID, '', fs.statSync(MIG_FILE).size, Math.floor(fs.statSync(MIG_FILE).mtimeMs), 1, 'done');
    db1.prepare('INSERT INTO meta (k, v) VALUES (?, ?)').run('lastBuild', '1790000000000');
    db1.exec('PRAGMA user_version = 1'); db1.close();
    return d5;
  };
  const MIG_SID = '0f5e1a00-0000-4000-8000-00000000e1a1';
  const MIG_DIR = path.join(home, '.claude/projects/-w-mig'); fs.mkdirSync(MIG_DIR, { recursive: true });
  const MIG_FILE = path.join(MIG_DIR, MIG_SID + '.jsonl');
  fs.writeFileSync(MIG_FILE, JSON.stringify({ type: 'user', uuid: 'm-1', sessionId: MIG_SID, timestamp: new Date(2e12).toISOString(), message: { role: 'user', content: 'the freshlinden words of the transcript' } }) + '\n');
  const migrateScene = async (workerFile = null) => {
    const x5 = SI.create({ dataDir: mkV1(), homeDir: home, log: quiet, exitHook: false, bootDelayMs: 1e9, ...(workerFile ? { workerFile } : {}) }); x5.start();
    await x5.call('status', {});
    const f5 = async (w) => (await x5.search({ q: w, scope: 'chats' })).hits.length;
    const m = { migrated: x5.stats().ready && x5.stats().ready.migrated, lastBuild: x5.stats().lastBuild, kept: await f5('olivequartz') };
    const r = await x5.call('indexConversation', { sid: MIG_SID, backend: 'claude', cwd: '/w/mig' });
    Object.assign(m, { reread: !!(r && r.parsed), stale: await f5('stalewords'), fresh: await f5('freshlinden') });
    await x5.close({ final: true });
    return m;
  };
  const mg = await migrateScene();
  ok(mg.migrated === 'schema 1 → 2, rows kept' && mg.kept === 1 && !!mg.lastBuild, `an index written by the release (schema 1) is MIGRATED, not dropped: a conversation no transcript reader can read stays found, the index counts as built (${mg.migrated})`, mg);
  ok(mg.reread && mg.stale === 0 && mg.fresh === 1, 'a conversation its transcript can give again is read again, its rows replaced (the release\'s row gone, the transcript\'s words found)', mg);
  // the controls: the change removed ⇒ the legs go RED
  const W2 = read('src/search-index-worker.js'), GE2 = read(GE_REL), O2 = read('src/server/search-index.js');
  const pin = (src, s) => { const n = src.split(s).length - 1; if (n !== 1) ok(false, `the control's anchor is in its file once: ${s}`, n); return s; };
  const wmut = (from, to, tag) => MUT.write('src/search-index-worker.js', W2.replace(pin(W2, from), to), tag);
  const oj = await scene(wmut('const body = judgeRow(mid, M.textOf(m), grp);', 'const body = M.textOf(m);', 'nojudge'));
  ok(oj.lateRows >= 1 && oj.rebuilt >= 2, `CONTROL (no judge at the write): a conversation indexed after the clear and a rebuild find the words again (${oj.lateRows}, ${oj.rebuilt})`, oj);
  const os2 = await scene(wmut('  for (const [gid, f] of Object.entries(fresh)) {\n    if (!CL.has(gid)) continue;', '  for (const [gid, f] of []) {\n    if (!CL.has(gid)) continue;', 'nosweep'));
  ok(os2.after >= 4 && os2.p6after === 1, `CONTROL (no sweep): the rows written before the clear still find the words (${os2.after}, ${os2.p6after})`, os2);
  const og = await scene(wmut('if (grp !== gid && !out.includes(`(${gid})`)) continue;', 'if (false) continue;', 'nogate'));
  ok(og.rebuilt === 0, `CONTROL (no group gate): the OTHER group's message with the same words is cleared too at a rebuild — the precision leg goes RED (${og.rebuilt})`, og);
  const ow = await scene(wmut('  if (WHOLE_LENS.size) {', '  if (false) {', 'nowhole'));
  ok(ow.f1after >= 1, `CONTROL (no whole-message digest): a later line of a message written on several lines is found again (${ow.f1after})`, ow);
  const ofl = await scene(wmut('const SUBSTRING_FLOOR = 12;', 'const SUBSTRING_FLOOR = 4;', 'floor4'));
  ok(ofl.thanksAfter < ofl.thanks, `CONTROL (a 4-unit substring floor): «all done! thanks» is cleared with «done!» (${ofl.thanks} → ${ofl.thanksAfter})`, ofl);
  const ob = await scene(null, MUT.load(GE_REL, GE2.replace(pin(GE2, "const forms = [...new Set([raw, G.reportWords(raw), card ? card.text : ''].map(foldWs).filter(Boolean))];"), 'const forms = [foldWs(raw)].filter(Boolean);'), 'rawonly'));
  ok(ob.f3after >= 1, `CONTROL (the record's own bytes only, no belted form): the message with a hidden character is found again (${ob.f3after})`, ob);
  const on = await scene(null, MUT.load(GE_REL, GE2.replace(pin(GE2, '      try { noteClearedNeedles(gid, out.cleared.map((vid) => found.get(vid)).filter(Boolean)); } catch { heldNeedles.delete(gid); }'), ''), 'nogrow'));
  ok(on.readsAtClear > 1, `CONTROL (the set not grown by the clear): a later clear reads the group's records again (${on.readsAtClear} reads)`, on);
  const os3 = await scene(null, null, MUT.load('src/server/search-index.js', O2.replace(pin(O2, "    if (all && typeof all.then === 'function') {"), '    if (false) {'), 'syncboot'));
  const WAIT = "    if (clearedReady) { let t; await Promise.race([clearedReady, new Promise((r) => { t = setTimeout(r, CLEARED_WAIT_MS); t.unref?.(); })]); clearTimeout(t); } // B-b291: no answer before the worker holds the whole cleared set\n";
  const onw = await scene(null, null, MUT.load('src/server/search-index.js', O2.replace(pin(O2, WAIT), ''), 'nowait'));
  ok(onw.p6after >= 1, `CONTROL (no wait for the whole set at a boot): the first search answers from the cache-only set and finds the words (${onw.p6after})`, onw);
  const omg = await migrateScene(wmut("if (!fresh && uv > 0 && uv < SCHEMA_VERSION && migrate())", "if (false)", 'nomigrate'));
  ok(omg.kept === 0, `CONTROL (the schema step drops the index, as before the cure): the conversation no transcript reader can read is gone from search (${omg.kept})`, omg);
  const ok2 = await scene(wmut("  if (typeof mid === 'string' && mid.startsWith('gm:')) {", "  if (false) {", 'nokey'));
  ok(ok2.keyOnly >= 1, `CONTROL (no card-key branch): a card of the record whose words differ is found again (${ok2.keyOnly})`, ok2);
  const CARRY = "...(m.peerGroup ? { peerGroup: { id: m.peerGroup.id } } : m.originKind === 'peer-message' ? { peerCard: true } : {})";
  const ocar = await scene(null, null, MUT.load('src/server/search-index.js', O2.replace(pin(O2, CARRY), "...(m.originKind === 'peer-message' ? { peerCard: true } : {})"), 'nocarry'));
  ok(ocar.marrow >= 1, `CONTROL (the live door drops the card's group): the live card that carries only its group is found again (${ocar.marrow})`, ocar);
  const ogp = await scene(wmut("if ((grp === '' || grp === gid) && c.wholes.get(h) === f.length", "if ((!grp || grp === gid) && c.wholes.get(h) === f.length", 'anyrow'));
  ok(ogp.ownStays === 0, `CONTROL (every row of no group judged whole): the person's own message is hidden — the precision leg goes RED (${ogp.ownStays})`, ogp);
  ok(os3.bootSync >= 1, `CONTROL (a boot reads the set on the loop): the start does a synchronous log read (${os3.bootSync})`, os3);
  // R2 (the cure's reader): a cleared group whose log cannot be read at a boot is named PARTIAL and never cached — asked
  // again, never handed over as a «whole» set
  {
    const d6 = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-part-'));
    const st0 = createChannelStore({ dir: path.join(d6, 'channels') });
    let failAsync = false, asyncReads = 0;
    const st6 = new Proxy(st0, { get: (t, k) => (k === 'readTailAsync' ? async (...a) => { asyncReads++; if (failAsync) throw Object.assign(new Error('an unreadable log (stand-in)'), { code: 'EIO' }); return t.readTailAsync(...a); } : t[k]) });
    let t6 = 2e12;
    const mk6 = () => require(path.join(REPO, GE_REL)).create({ store: st6, deliver: null, broadcast() { }, now: () => (t6 += 60000), roster: () => ROSTER, groupSetting: () => 'none', log: quiet });
    const ge6 = mk6();
    const g6 = (await ge6.create({ by: G.OWNER, name: 'part', members: [ME, OTHER], quiet: true, consent: () => ({ ok: true }) })).group.id;
    const p6 = (await ge6.post({ group: g6, from: ME, text: 'the hollowfern words' })).message;
    await ge6.clearMessages({ group: g6, ids: [p6.vendorId], by: G.OWNER });
    const ge7 = mk6();                       // a boot: its cache is empty
    failAsync = true; const r1 = await ge7.clearedCopiesAsync();
    failAsync = false; const r2 = await ge7.clearedCopiesAsync();
    ok(r1.partial.includes(g6) && !r1.groups[g6] && r2.partial.length === 0 && r2.groups[g6] && r2.groups[g6].keys.length === 1 && asyncReads === 2,
      `a group whose log could not be read is named partial, not cached, and read again at the next ask (${asyncReads} async reads)`, { r1, r2 });
    st0.close();
  }
  // the wiring (channels-wiring: the ONE place the engine and the index meet) + the device words the sentence
  const CWT = read('src/server/channels-wiring.js');
  ok(/try \{ SEARCH\.noteCleared\(gid\); \}/.test(CWT) && CWT.includes('SEARCH.setClearedSource((gid, o) => groups.clearedCopies(gid, o), () => groups.clearedCopiesAsync());'), 'the channels wiring tells the index of every clear and hands it the groups engine\'s clearedCopies (+ its async twin for a start)');
  ok(/const words = \(x\) => \(x\.includes\(CLEARED_TEXT\) \? x\.split\(CLEARED_TEXT\)\.join\(clearedText\(\)\) : x\);/.test(read('src/lib/search-window.js')), 'a snippet holding the sentence words it in the device\'s language (the marks keep their offsets)');
  // THE READERS' MUST: an answer while the index (re)builds never says «No matches» alone
  const SWm = await import(pathToFileURL(path.join(REPO, 'src/lib/search-window.js')).href);
  const line = (r) => SWm.searchStatusText(r);
  const running = line({ total: 0, index: { state: 'ready', backfill: { running: true, done: 12, total: 400 }, lastBuild: null } });
  const notYet = line({ total: 2, took: 3, index: { state: 'ready', backfill: { running: false }, lastBuild: null } });
  const notYet0 = line({ total: 0, index: { state: 'ready', backfill: { running: false }, lastBuild: null } });
  const built = line({ total: 0, index: { state: 'ready', backfill: { running: false }, lastBuild: 1790000000000 } });
  const walking = line({ total: 3, took: 4, index: { state: 'ready', backfill: { running: true, done: 1, total: 9 }, lastBuild: 1790000000000 } });
  ok(running === 'No matches · Indexing 12 of 400 conversations…' && notYet === '2 matches · 3 ms · The index starts a minute after the server' && notYet0 === 'No matches · The index starts a minute after the server' && built === 'No matches' && walking === '3 matches · 4 ms',
    `the count line says the index is building beside «No matches» / «N matches» until one build finished; a periodic walk over a whole index adds nothing («${running}» · «${notYet}» · «${notYet0}» · «${built}» · «${walking}»)`);
  ok(/status\.textContent = searchStatusText\(r\);/.test(read('src/lib/search-window.js')) && /app\.ws\.onGlobal\(onClear\)/.test(read('src/lib/search-window.js')) && /app\.ws\.offGlobal\(onClear\)/.test(read('src/lib/search-window.js')),
    'the window paints that line, and asks an open query again when a group message is cleared anywhere (listener removed with the window)');
}
await ix.close({ final: true });
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);

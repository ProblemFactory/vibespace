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
const noCursor = MUT.write('src/search-index-worker.js', W0.replace("if (cur && cur.size === st.size && cur.mtime === mtime) return", "if (false) return"), 'nocursor');
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
  const ID = /['"`](?:claude|codex|opencode|acp|shell)['"`]|\b(?:response_item|event_msg|session_meta|function_call|tool_use|tool_result)\b|\.type\s*===?\s*['"`](?:user|assistant|result|message)['"`]/;
  const offenders = (txt) => txt.split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l) && ID.test(l.replace(/\/\/.*$/, '')));
  const FILES = ['src/search-model.js', 'src/search-index-worker.js', 'src/server/search-index.js'];
  const hits = FILES.flatMap((f) => offenders(read(f)).map((l) => f + ': ' + l.trim().slice(0, 80)));
  ok(hits.length === 0, `the three search files name no harness and parse no raw record shape (${FILES.length} files)`, hits);
  const raw = W0.replace("  const shape = { backend,", "  if (backend === 'codex') { for (const l of fs.readFileSync(file, 'utf8').split('\\n')) { const rec = JSON.parse(l); if (rec.type === 'response_item') S.insMsg.run(sid, host, backend, l.slice(0, 9), 0, 'user', l); } }\n  const shape = { backend,");
  ok(raw !== W0 && offenders(raw).length >= 1, 'CONTROL (a raw-shape branch for one harness in the worker) is caught by the census');
  const STORES = /\b(tasks|userTodos|sessionStatus|getJobs|getGroups|groupsEngine|recordClear|stashFor)\b/;
  ok(FILES.every((f) => !STORES.test(read(f).replace(/\/\/.*$/gm, ''))), 'the index reads none of the five "Clear content…" stores — a copy of transcripts + files (test-record-clear-census declares it)');
}
await ix.close({ final: true });
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);

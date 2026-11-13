#!/usr/bin/env node
// test-file-preview-mount — lane file-preview-mount (userW inc-mvq4hn9x-v51k, 2.369.358: «在 chat 模式下，command 加点击打开
// Excel 的时候会报错：Error: refused: a synchronous fs call on a storage mount from the main thread»). The hub's journal:
// `[mount-guard] readFileSync(<a storage mount>/…/<file>.xlsx) from src/routes/files.js:413 refused — use SafeFs/async`.
// The guard was right (2.369.350's law); the preview route still read the workbook with the xlsx lib's OWN sync read on the
// main thread, and the refusal reached the person RAW. Over the REAL files router (express, 127.0.0.1:0), the REAL mount
// guard (src/server/sync-fs-witness.js through loop-blame's fs wrapper, armed) and a fake storage root (a registry row,
// as the canary suite classes one), a REAL one-worker SafeFs pool:
//   ① R1 a workbook ON the storage root previews — the sheets, equal to the lib's own parse of the same bytes (2 sheets,
//      CJK, numbers); the guard refused nothing; a Word document there converts (mammoth over the BUFFER ≡ the oracle)
//   ② the 20 MB cap is said by name before a byte is read (a sparse 21 MB .xlsx / .docx ⇒ 413 with its size)
//   ③ the PARSE is off the loop too: a workbook whose in-main parse holds the loop P ms previews with the main loop's
//      worst timer lag well under P (on the base the route parsed in-main: the lag ≈ P)
//   ④ R2 a refusal still met (the pool down ⇒ SafeFs's in-main fallback, the only road left on the main thread) is SAID:
//      code storage_sync_refused, the storage's name, the release, the way on — never the guard's raw words; the journal
//      keeps its call-site line; an answer of ANOTHER router carrying the refusal is not re-said (the door is this
//      router's)
//   ⑤ the client's words: fsErrorText (src/lib/file-explorer-ops.js — the viewer's and the chat link-open's) says
//      storage_sync_refused in zh / ja / en through t() — the dictionaries hold both sentences
// RED on 6428c67e: ① the raw «refused: …», ③ the lag ≈ P, ④ the raw refusal, ⑤ the English `error` on a zh device.
// Round 2 (主开发's acceptance of 19e1f74c):
//   ⑥ the parse is bounded in every dimension and each cut is NAMED: a 60-sheet workbook ⇒ 50 + truncated.sheets = 10;
//      a 2500-character cell ⇒ its first 2000 + «…»; a 300-column sheet ⇒ 256; ③'s 40 001 rows ⇒ cut.rows = 35 001
//   ⑦ the READ is the bound: a FIFO fed 3 MB past a 1 MB cap is read to cap + 1 bytes — the writer's push ends in EPIPE
//   ⑧ the sentence is the PREVIEW road's: a write, a mkdir, a rename the guard refused keep their own words
//   ⑨ a document parse runs in its OWN lane (src/safe-fs.js LANES): a stat with a short deadline while a parse runs (the
//      fixture's __sleep in the parse lane) answers at once and the parse completes; a second parse whose turn never
//      came is refused by name (parse_busy — the route says it too); a parse while the lane's worker respawns waits for
//      it, never the main thread; ⑤ says parse_busy in zh / ja / en
// RED on 19e1f74c: ⑥ 60 sheets, the cell whole, no `truncated`; ⑦ the writer pushed all 4 MB; ⑧ the preview's
// sentence on a write; ⑨ the stat's deadline killed the parse (one IO worker held both); ⑤ the raw `error`.
// Round 3 (主开发's acceptance of b7092c4d):
//   ⑩ a cut is a fact about the cells PARSED, never the extent the file declares: a 3-row sheet declaring A1:C1048576, a
//      3-column one declaring A1:AMJ3, a 6000-row A–C sheet with one note in J5999 ⇒ no false cut (the last: its rows,
//      which DO go on, and no columns); the control, 6000 rows of data ⇒ «the first 5000 rows»; `declared` = information
//   ⑪ a queued parse has two clocks: its deadline starts when it is SENT (A 1000 ms, B queued 50 ms later with 1500 ms ⇒
//      B runs whole, the lane's worker never killed); a job past its WAIT bound (waitMs) is refused parse_busy, never sent
//   ⑫ the blocked-mount door is asked again at the send: a mount marked blocked while the job waited ⇒ storage-blocked
//   ⑬ an abandoned request leaves the queue: two waiters whose clients went are never sent, the third runs next — over
//      the lane (AbortSignal) and over the route (its response closed before the answer)
// RED on b7092c4d: ⑩ the declared extent's cuts (1 048 573 rows, 768 columns, 7 columns) and ⑥'s 35 001; ⑪ B killed at
// its leftover (timeouts 1, restarts 1) and the waiter sent; ⑫ B parsed inside the blocked mount; ⑬ the gone ones parsed first.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { execFileSync, spawn } from 'node:child_process';

const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0, failed = 0;
const ok = (c, n, e) => { if (c) { passed++; console.log(`  ✓ ${n}`); } else { failed++; console.error(`  ✗ ${n}${e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 900) : ''}`); } };
const express = require('express');
const XLSX = require('xlsx');
const mammoth = require('mammoth');
const LB = require(path.join(REPO, 'src/server/loop-blame.js'));
const SW = require(path.join(REPO, 'src/server/sync-fs-witness.js'));
const { SafeFs } = require(path.join(REPO, 'src/safe-fs.js'));
const RELEASE = JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8')).version;
process.env.VIBESPACE_SAFEFS_TEST = '1'; // ⑨: the worker's __sleep fixture (a stand-in for a long parse) runs only with it

// ── fixtures, written BEFORE the guard is armed ──
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-fpm-'));
const STORE = path.join(DIR, 'NAS'), LOCAL = path.join(DIR, 'local'), DATA = path.join(DIR, 'data');
for (const d of [STORE, LOCAL, DATA]) fs.mkdirSync(d, { recursive: true });
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['项目', 'Q1', 'Q2'], ['收入', 120, 135.5], ['成本', 80, 91], ['', null, 'Σ']]), '汇总');
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['id', 'name'], [1, 'alpha'], [2, 'ベータ']]), 'Rows');
const BOOK = path.join(STORE, '季度报表.xlsx');
fs.writeFileSync(BOOK, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
const DOC = path.join(STORE, 'paper.docx');
fs.copyFileSync(path.join(REPO, 'scripts/fixtures/docx/apa-title-page.docx'), DOC);
const BIG_X = path.join(STORE, 'big.xlsx'), BIG_D = path.join(STORE, 'big.docx');
for (const f of [BIG_X, BIG_D]) { const fd = fs.openSync(f, 'w'); fs.ftruncateSync(fd, 21 * 1024 * 1024); fs.closeSync(fd); }   // sparse: no bytes written
const oracleOf = (buf) => { const w = XLSX.read(buf, { type: 'buffer' }); return w.SheetNames.map((name) => ({ name, data: XLSX.utils.sheet_to_json(w.Sheets[name], { header: 1 }).slice(0, 5000) })); };
const rowsOf = (sheets) => (sheets || []).map(({ name, data }) => ({ name, data }));
const SHEETS = oracleOf(fs.readFileSync(BOOK));
const DOC_HTML = (await mammoth.convertToHtml({ buffer: fs.readFileSync(DOC) })).value;
// ③'s workbook: big enough that its in-main parse is a hold worth naming (on a LOCAL path: the base reaches its parse)
const rows = [['n', 'name', 'qty', 'price', 'note', 'a', 'b', 'c']];
for (let i = 1; i <= 40000; i++) rows.push([i, `item ${i}`, i % 97, (i * 1.37) % 1000, i % 3 ? 'ok' : '备注', i * 2, `x${i % 13}`, i % 7]);
const heavy = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(heavy, XLSX.utils.aoa_to_sheet(rows), 'big');
const HEAVY = path.join(LOCAL, 'heavy.xlsx');
fs.writeFileSync(HEAVY, XLSX.write(heavy, { type: 'buffer', bookType: 'xlsx' }));
const HEAVY_BUF = fs.readFileSync(HEAVY);
// ⑥'s workbook (on the storage root): 60 sheets — the first holds a 2500-character cell, the second 300 columns
const many = XLSX.utils.book_new();
for (let i = 0; i < 60; i++) XLSX.utils.book_append_sheet(many, XLSX.utils.aoa_to_sheet(i === 0 ? [['k', 'v'], ['long', '长'.repeat(2500)]] : i === 1 ? [Array.from({ length: 300 }, (_, c) => c)] : [['n'], [i]]), 'S' + i);
const MANY = path.join(STORE, 'sixty.xlsx');
fs.writeFileSync(MANY, XLSX.write(many, { type: 'buffer', bookType: 'xlsx' }));
// ⑩'s workbook (on the storage root): three declared-past-the-data sheets and the control
const declaredAs = (aoa, ref) => { const ws = XLSX.utils.aoa_to_sheet(aoa); ws['!ref'] = ref; return ws; };
const r6000 = Array.from({ length: 6000 }, (_, i) => [i + 1, `r${i + 1}`, i * 2]);
const noted = XLSX.utils.aoa_to_sheet(r6000);
XLSX.utils.sheet_add_aoa(noted, [['note']], { origin: 'J5999' });
const cuts = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(cuts, declaredAs([[1, 2, 3], [4, 5, 6], [7, 8, 9]], 'A1:C1048576'), 'tall');
XLSX.utils.book_append_sheet(cuts, declaredAs([[1, 2, 3], [4, 5, 6], [7, 8, 9]], 'A1:AMJ3'), 'wide');
XLSX.utils.book_append_sheet(cuts, noted, 'noted');
XLSX.utils.book_append_sheet(cuts, XLSX.utils.aoa_to_sheet(r6000), 'full');
const CUTS = path.join(STORE, 'declared.xlsx');
fs.writeFileSync(CUTS, XLSX.write(cuts, { type: 'buffer', bookType: 'xlsx' }));
const FIFO = path.join(LOCAL, 'feed.fifo');   // ⑦
execFileSync('mkfifo', [FIFO]);
const RENAME_ME = path.join(STORE, 'rename-me.txt');   // ⑧
fs.writeFileSync(RENAME_ME, 'x');
let P = Infinity;
for (let i = 0; i < 2; i++) { const t0 = performance.now(); oracleOf(HEAVY_BUF); P = Math.min(P, performance.now() - t0); }

// ── the guard: loop-blame's ONE fs wrapper + the witness, the storage root a registry row (the canary suite's shape) ──
const journal = [];
LB.install({ root: REPO });
const W = SW.create({ rootDir: REPO, dataDir: DATA, fresh: true, armed: true, live: false, log: { warn: (l) => journal.push(l) },
  readMountinfo: () => '', registry: () => [{ mountpoint: STORE, name: 'NAS', id: 'mnt-fpm' }] });
W.start();
let threw = null;
try { fs.readFileSync(BOOK); } catch (e) { threw = e; }
ok(threw && threw.code === 'EVSMOUNTSYNC' && threw.message === SW.REFUSAL, `the harness: a main-thread readFileSync on the fake storage root is REFUSED by the real guard (${threw && threw.code})`);

const filesRouter = require(path.join(REPO, 'src/routes/files.js'));
const pool = new SafeFs({ poolSize: 1, name: 'fpm' });
const serve = async (locals) => {
  const app = express();
  app.use(express.json());
  Object.assign(app.locals, locals);
  app.use(filesRouter);
  // ANOTHER router's answer carrying the guard's words (④: the door is the files router's, never the hub's)
  app.get('/api/other/refused', (req, res) => res.status(400).json({ error: SW.REFUSAL }));
  const srv = app.listen(0, '127.0.0.1');
  await new Promise((r) => srv.once('listening', r));
  return { srv, base: `http://127.0.0.1:${srv.address().port}` };
};
const get = async (base, p) => { const r = await fetch(base + p); let body = null; try { body = await r.json(); } catch { } return { status: r.status, body }; };
const post = async (base, p, b) => { const r = await fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }); let body = null; try { body = await r.json(); } catch { } return { status: r.status, body }; };
const settle = (p) => p.then((ok) => ({ ok }), (e) => ({ err: e.message, code: e.code, status: e.status }));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const q = (p) => encodeURIComponent(p);
const A = await serve({ safeFs: pool });

try {
  console.log('① R1 a workbook on a storage mount previews (read + parsed in the SafeFs pool)');
  const refused0 = W.counts.refused;
  const x = await get(A.base, `/api/file/excel?path=${q(BOOK)}`);
  ok(x.status === 200 && JSON.stringify(rowsOf(x.body?.sheets)) === JSON.stringify(SHEETS), `GET /api/file/excel on the storage root ⇒ the sheets, equal to the lib's own parse of the bytes (${x.status}: ${JSON.stringify(x.body).slice(0, 160)})`);
  ok(x.body?.sheets?.length === 2 && x.body.sheets[0].name === '汇总' && x.body.sheets[0].data[1][2] === 135.5 && x.body.sheets[1].data[2][1] === 'ベータ', '…both sheets, the CJK names and cells, the numbers as numbers');
  const d = await get(A.base, `/api/file/docx?path=${q(DOC)}`);
  ok(d.status === 200 && d.body?.html === DOC_HTML && DOC_HTML.length > 200, `GET /api/file/docx on the storage root ⇒ mammoth's html of the BUFFER ≡ the oracle (${d.status}, ${d.body?.html?.length} chars)`);
  ok(W.counts.refused === refused0 && !journal.some((l) => /src\/routes\/files\.js/.test(l)), `the guard refused nothing on the way (${W.counts.refused - refused0} refusals; ${journal.filter((l) => /files\.js/.test(l)).join(' | ')})`);

  console.log('② the 20 MB cap, said by name before a byte is read');
  const bx = await get(A.base, `/api/file/excel?path=${q(BIG_X)}`);
  ok(bx.status === 413 && bx.body?.error === 'Excel file too large to preview (21.0 MB > 20 MB)', `a 21 MB workbook ⇒ 413 by name (${bx.status}: ${bx.body?.error})`);
  const bd = await get(A.base, `/api/file/docx?path=${q(BIG_D)}`);
  ok(bd.status === 413 && bd.body?.error === 'file too large to preview (21.0 MB > 20 MB)', `a 21 MB document ⇒ 413 by name (${bd.status}: ${bd.body?.error})`);

  console.log(`③ the parse is off the loop (this workbook's in-main parse: P = ${Math.round(P)} ms)`);
  let worst = 0, last = performance.now();
  const tick = setInterval(() => { const now = performance.now(); worst = Math.max(worst, now - last - 5); last = now; }, 5);
  const h = await get(A.base, `/api/file/excel?path=${q(HEAVY)}`);
  clearInterval(tick);
  ok(h.status === 200 && h.body?.sheets?.[0]?.data?.length === 5000 && h.body.sheets[0].data[4999][0] === 4999, `the 40 000-row workbook previews (5000 rows serialized) (${h.status})`);
  ok(P >= 150 && worst < P / 3, `the main loop's worst timer lag across the request: ${Math.round(worst)} ms — well under P/3 = ${Math.round(P / 3)} ms (P ≥ 150 ms makes the hold worth naming)`);

  console.log('④ R2 a refusal still met is SAID — the storage by name, why, the way on');
  const B = await serve({});   // no pool: SafeFs's in-main fallback runs the op on the main thread — the guard refuses it
  try {
    const want = `this file is on the storage «NAS», and this kind of preview cannot be shown for a file on a storage yet — download it, or copy it to a local folder and open it there`;
    for (const route of [`/api/file/excel?path=${q(BOOK)}`, `/api/file/info?path=${q(BOOK)}`, `/api/file/content?path=${q(path.join(STORE, 'notes.txt'))}`]) {
      const r = await get(B.base, route);
      ok(r.body?.code === 'storage_sync_refused' && r.body.error === want && r.body.params?.mount === 'NAS' && !('release' in r.body.params) && !/\d+\.\d+\.\d+/.test(r.body.error) && !String(r.body.error).includes(SW.REFUSAL),
        `${route.split('?')[0]} ⇒ code storage_sync_refused, «NAS», the release — never the raw words (${r.status}: ${JSON.stringify(r.body).slice(0, 220)})`);
    }
    ok(journal.some((l) => /^\[mount-guard\] openSync\(.*季度报表\.xlsx\) from src\/safe-fs-worker\.js:\d+ readCapped refused — use SafeFs\/async; the mount «.*NAS»$/.test(l)),
      `the journal keeps its call-site line (${journal.filter((l) => /mount-guard/.test(l)).slice(0, 2).join(' | ')})`);
    const o = await get(B.base, '/api/other/refused');
    ok(o.status === 400 && o.body?.error === SW.REFUSAL && !o.body.code, `another router's answer is its own (the door is the files router's) (${JSON.stringify(o.body)})`);
  } finally { B.srv.close(); }

  console.log('⑤ the client says storage_sync_refused in the reader\'s language (fsErrorText through t())');
  {
    const esbuild = require('esbuild');
    const out = path.join(DIR, 'fet.mjs');
    const stub = { name: 'build-version', setup(b) { b.onResolve({ filter: /build-version\.js$/ }, () => ({ path: 'bv', namespace: 'stub' })); b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: "export const BUILD_VERSION = 'test';", loader: 'js' })); } };
    await esbuild.build({ stdin: { contents: "export { fsErrorText } from './src/lib/file-explorer-ops.js';", resolveDir: REPO, loader: 'js' }, bundle: true, format: 'esm', platform: 'node', target: 'es2022', outfile: out, logLevel: 'silent', loader: { '.css': 'text' }, plugins: [stub] });
    const body = { error: 'the server’s English', code: 'storage_sync_refused', params: { mount: 'NAS', release: '9.9.9' } };
    const said = {};
    const src = fs.readFileSync(path.join(REPO, 'src/lib/file-explorer-ops.js'), 'utf8');
    const keys = [...src.matchAll(/t\('(this file is on (?:the|a) storage[^']*)'/g)].map((m) => m[1]);   // the person's words name «the storage» (主开发's merged read)
    for (const lang of ['zh', 'ja', 'en']) {
      globalThis.localStorage = { getItem: () => lang, setItem() {}, removeItem() {} };
      const { fsErrorText } = await import(pathToFileURL(out).href + '?lang=' + lang);
      said[lang] = [fsErrorText(body), fsErrorText({ ...body, params: { mount: '', release: '9.9.9' } }), fsErrorText({ error: 'the server’s English', code: 'parse_busy' })];
    }
    delete globalThis.localStorage;
    ok(keys.length === 2, `fsErrorText words the code in two sentences (a named storage / an unnamed one) (${keys.length})`);
    ok(said.en[0] === 'this file is on the storage «NAS», and this kind of preview cannot be shown for a file on a storage yet — download it, or copy it to a local folder and open it there' && said.en[1].startsWith('this file is on a storage, and'),
      `en: the sentence with the storage's name, no version (主开发's merged read: a version promised a fix the hub already holds) (${said.en[0]})`);
    for (const l of ['zh', 'ja']) {
      ok(said[l][0] !== said.en[0] && said[l][0].includes('NAS') && !/\d+\.\d+\.\d+/.test(said[l][0]) && !said[l][0].includes('the server’s English') && said[l][1] !== said.en[1],
        `${l}: its own sentence through t(), the name in it, no version (${said[l][0]})`);
    }
    ok(said.en[2] === 'another document is being parsed — try again in a moment' && said.zh[2] !== said.en[2] && said.ja[2] !== said.en[2] && ![said.zh[2], said.ja[2]].some((x) => x.includes('English')),
      `parse_busy (⑨) in zh / ja / en through t() (${said.zh[2]} | ${said.ja[2]} | ${said.en[2]})`);
  }

  console.log('⑥ the parse is bounded in every dimension, each cut NAMED (r2)');
  {
    const r = await get(A.base, `/api/file/excel?path=${q(MANY)}`);
    ok(r.status === 200 && r.body?.sheets?.length === 50 && r.body.truncated?.sheets === 10 && r.body.sheets[49].name === 'S49',
      `a 60-sheet workbook ⇒ 50 sheets + truncated.sheets = 10 (${r.status}: ${r.body?.sheets?.length} sheets, ${JSON.stringify(r.body?.truncated)})`);
    const cell = r.body?.sheets?.[0]?.data?.[1]?.[1];
    ok(typeof cell === 'string' && cell.length === 2001 && cell.endsWith('…') && r.body.sheets[0].cut?.cells === 1 && r.body.truncated?.cells === 1,
      `a 2500-character cell ⇒ its first 2000 + «…», cut.cells = 1 (${cell?.length} chars, ${JSON.stringify(r.body?.sheets?.[0]?.cut)})`);
    const wide = r.body?.sheets?.[1];
    ok(wide?.data?.[0]?.length === 256 && wide.data[0][255] === 255 && wide.cut?.cols === 44 && r.body.truncated?.cols === 44,
      `a 300-column sheet ⇒ 256 columns, cut.cols = 44 (${wide?.data?.[0]?.length}, ${JSON.stringify(wide?.cut)})`);
    ok(JSON.stringify(r.body?.limits) === JSON.stringify({ rows: 5000, sheets: 50, cols: 256, cell: 2000 }), `the limits the viewer says ride the answer (${JSON.stringify(r.body?.limits)})`);
    ok(h.body?.truncated?.rows === 1 && h.body.sheets?.[0]?.cut?.rows === 1 && h.body.sheets[0].data.length === 5000 && h.body.sheets[0].declared?.rows === 40001,
      `③'s 40 001-row sheet ⇒ its first 5000 rows, cut.rows = 1 (the parse met data one row past the cap — r3: never a count from the extent the file declares, which rides as declared.rows) (${JSON.stringify(h.body?.truncated)}, ${JSON.stringify(h.body?.sheets?.[0]?.declared)})`);
  }

  console.log('⑦ the READ is the bound — a FIFO fed 3 MB past a 1 MB cap is read to cap + 1 bytes, never to its end (r2)');
  {
    const CAP = 1 << 20, FED = CAP + 3 * (1 << 20);
    const writer = spawn(process.execPath, ['-e', `const fs = require('fs'); const fd = fs.openSync(${JSON.stringify(FIFO)}, 'w'); const b = Buffer.alloc(65536, 97); let n = 0;
      try { while (n < ${FED}) n += fs.writeSync(fd, b, 0, Math.min(b.length, ${FED} - n)); } catch (e) { } process.stdout.write(String(n));`], { stdio: ['ignore', 'pipe', 'inherit'] });
    let out = '';
    writer.stdout.on('data', (d) => { out += d; });
    const closed = new Promise((r) => writer.once('close', r));
    const rd = await settle(pool.call('readFile', { path: FIFO, capBytes: CAP }));
    await closed;
    const pushed = Number(out);
    ok(rd.status === 413 && rd.err === 'file too large to preview (over 1 MB)', `the (cap + 1)th byte says «too big» by name — its size unknown (${JSON.stringify(rd)})`);
    ok(pushed > 0 && pushed <= CAP + 1 + 256 * 1024 && pushed < FED, `the writer pushed ${pushed} of ${FED} bytes before EPIPE — the worker read at most cap + 1 = ${CAP + 1} (+ what sat in the pipe, ≤ 256 KiB)`);
  }

  console.log('⑧ the sentence is the PREVIEW road\'s — a write, a mkdir, a rename the guard refused keep their own words (r2)');
  {
    const C = await serve({});   // the pool down again: the routes' in-main fallback meets the guard
    try {
      for (const [route, body] of [['/api/file/write', { path: path.join(STORE, 'new.txt'), content: 'x' }], ['/api/mkdir', { path: path.join(STORE, 'new-dir') }], ['/api/rename', { oldPath: RENAME_ME, newPath: path.join(STORE, 'renamed.txt') }]]) {
        const r = await post(C.base, route, body);
        ok(r.status === 400 && !r.body?.code && String(r.body?.error).startsWith(SW.REFUSAL) && !String(r.body?.error).includes('preview road'),
          `${route} ⇒ its own words (err.message + roMountHint), never the preview's sentence (${r.status}: ${JSON.stringify(r.body).slice(0, 200)})`);
      }
      const there = await Promise.all([RENAME_ME, path.join(STORE, 'new.txt'), path.join(STORE, 'new-dir')].map((p) => pool.call('exists', { path: p })));   // the pool's eyes: a test's own sync look is refused too
      ok(JSON.stringify(there.map((x) => !!(x && (x.exists ?? x)))) === '[true,false,false]', `nothing was written on the way — the guard refused each (${JSON.stringify(there)})`);
    } finally { C.srv.close(); }
  }

  console.log('⑨ a document parse runs in its OWN lane — a stat never kills it, a second parse waits its turn (r2)');
  {
    const sleeping = settle(pool.call('__sleep', { ms: 1500 }, { lane: 'parse' }));
    await sleep(150);
    const t0 = performance.now();
    const st = await settle(pool.call('stat', { path: BOOK }, { timeoutMs: 300 }));
    const statMs = performance.now() - t0;
    const busy = await settle(pool.call('xlsxSheets', { path: BOOK, capBytes: 20 << 20 }, { timeoutMs: 300 }));
    const sl = await sleeping;
    ok(!!st.ok && statMs < 300, `a stat with a 300 ms deadline while a 1.5 s parse runs (the fixture's __sleep, in the parse lane) answers at once — the IO pool holds no parse (${Math.round(statMs)} ms, ${st.err || 'ok'})`);
    ok(busy.code === 'parse_busy' && busy.status === 503 && busy.err === 'another document is being parsed — try again in a moment', `a second parse whose 300 ms turn never came is refused by name — parse_busy (${JSON.stringify(busy)})`);
    ok(sl.ok?.slept === 1500, `…and the parse ahead completes: neither the stat's deadline nor the waiting parse's killed it (${sl.err || JSON.stringify(sl.ok)})`);
    const next = await settle(pool.call('xlsxSheets', { path: BOOK, capBytes: 20 << 20 }));
    ok(JSON.stringify(rowsOf(next.ok?.sheets)) === JSON.stringify(SHEETS), `the lane then takes the next parse (${next.err || next.ok?.sheets?.length + ' sheets'})`);
    const killed = await settle(pool.call('__sleep', { ms: 1500 }, { lane: 'parse', timeoutMs: 300 }));   // a parse past its deadline: the lane's worker killed, respawning
    const refused1 = W.counts.refused;
    const t1 = performance.now();
    const after = await settle(pool.call('xlsxSheets', { path: BOOK, capBytes: 20 << 20 }));
    ok(killed.status === 503 && JSON.stringify(rowsOf(after.ok?.sheets)) === JSON.stringify(SHEETS) && W.counts.refused === refused1,
      `a parse that arrives while the lane's worker respawns (a deadline kill) WAITS for it — never the main thread: the sheets after ${Math.round(performance.now() - t1)} ms, the guard refused nothing (${killed.err}; ${after.err || 'ok'}; ${W.counts.refused - refused1} refusals)`);
    const pool2 = new SafeFs({ poolSize: 1, name: 'fpm-busy', timeouts: { xlsxSheets: 400 } });
    const D = await serve({ safeFs: pool2 });
    try {
      const hold = settle(pool2.call('__sleep', { ms: 1500 }, { lane: 'parse' }));
      await sleep(150);
      const r = await get(D.base, `/api/file/excel?path=${q(BOOK)}`);
      ok(r.status === 503 && r.body?.code === 'parse_busy' && r.body.error === 'another document is being parsed — try again in a moment',
        `the route says it: 503 parse_busy (a workbook whose 400 ms turn never came) (${r.status}: ${JSON.stringify(r.body)})`);
      const held = await hold;
      ok(held.ok?.slept === 1500, `…the parse ahead completes (${held.err || 'ok'})`);
    } finally { D.srv.close(); pool2.close(); }
  }

  console.log('⑩ a cut is a fact about the cells PARSED, never the extent the file declares (r3)');
  {
    const r = await get(A.base, `/api/file/excel?path=${q(CUTS)}`);
    const by = Object.fromEntries((r.body?.sheets || []).map((x) => [x.name, x]));
    const none = (c) => c && c.rows === 0 && c.cols === 0 && c.cells === 0;
    const seen = (x) => JSON.stringify({ rows: x?.data?.length, cols: x?.data?.[0]?.length, cut: x?.cut, declared: x?.declared });
    ok(r.status === 200 && none(by.tall?.cut) && JSON.stringify(by.tall.data) === '[[1,2,3],[4,5,6],[7,8,9]]' && by.tall.declared?.rows === 1048576,
      `a 3 × 3 sheet declared A1:C1048576 ⇒ all 3 rows shown, no cut (the declared 1 048 576 rows ride as information) (${r.status}: ${seen(by.tall)})`);
    ok(none(by.wide?.cut) && JSON.stringify(by.wide.data) === '[[1,2,3],[4,5,6],[7,8,9]]' && by.wide.declared?.cols === 1024,
      `a 3-column sheet declared A1:AMJ3 ⇒ its 3 columns whole, no «the first 256 columns» (${seen(by.wide)})`);
    ok(by.noted?.cut?.cols === 0 && by.noted.cut.cells === 0 && by.noted.cut.rows === 1 && by.noted.data.length === 5000 && by.noted.data.every((row) => row.length <= 3),
      `6000 rows of A–C + one note in J5999 ⇒ the 3 columns whole — no columns cut (J sits past the rows parsed); the rows cut, which is true (rows 5001–6000 hold data) (${seen(by.noted)})`);
    ok(by.full?.cut?.rows > 0 && by.full.cut.cols === 0 && by.full.data.length === 5000 && by.full.data[4999][0] === 5000,
      `the control: 6000 rows of data ⇒ «the first 5000 rows» (cut.rows ${by.full?.cut?.rows}, ${by.full?.data?.length} rows shown)`);
    ok(r.body?.truncated?.rows === 2 && r.body.truncated.cols === 0 && r.body.truncated.cells === 0 && r.body.truncated.sheets === 0,
      `the workbook's truncated counts only the real cuts — the two sheets whose rows go on (${JSON.stringify(r.body?.truncated)})`);
  }

  const spySends = (lane) => { const sent = []; const send0 = lane._send.bind(lane); lane._send = (rec, op, payload, ms) => { sent.push(op + (payload?.tag ? ':' + payload.tag : '')); return send0(rec, op, payload, ms); }; return sent; };

  console.log('⑪ a queued parse has two clocks — the wait, then its own deadline from the SEND (r3)');
  {
    const pool3 = new SafeFs({ poolSize: 1, name: 'fpm-clock' });
    try {
      const L = pool3.lane('parse'), sent = spySends(L);
      const t0 = performance.now();
      const a = settle(pool3.call('__sleep', { ms: 1000, tag: 'A' }, { lane: 'parse' }));
      await sleep(50);
      const b = settle(pool3.call('__sleep', { ms: 1000, tag: 'B' }, { lane: 'parse', timeoutMs: 1500 }).then((x) => ({ ...x, at: performance.now() - t0 })));
      let cAt = 0;
      const c = settle(pool3.call('__sleep', { ms: 10, tag: 'C' }, { lane: 'parse', waitMs: 200, timeoutMs: 5000 }).finally(() => { cAt = performance.now() - t0; }));
      const [ra, rb, rc] = await Promise.all([a, b, c]);
      const st = L.stats();
      ok(ra.ok?.slept === 1000 && rb.ok?.slept === 1000 && rb.ok.at >= 1900,
        `A 1000 ms, B queued 50 ms later with a 1500 ms deadline ⇒ B runs WHOLE after A (its clock starts at the send) (A ${ra.err || 'ok'}; B ${rb.err || 'ok at ' + Math.round(rb.ok.at) + ' ms'})`);
      ok(st.alive === 1 && st.restarts === 0 && st.timeouts === 0, `…the lane's worker never killed (${JSON.stringify(st)})`);
      ok(rc.code === 'parse_busy' && cAt < 800 && !sent.includes('__sleep:C'),
        `a job past its WAIT bound (waitMs 200 of a 5 s deadline) is refused parse_busy in main, never sent (${JSON.stringify(rc)} at ${Math.round(cAt)} ms; sent ${sent.join(', ')})`);
    } finally { pool3.close(); }
  }

  console.log('⑫ the blocked-mount door is asked again when a waiting job is SENT (r3)');
  {
    let BLOCKED = false;
    const pool4 = new SafeFs({ poolSize: 1, name: 'fpm-door', blocked: (p) => (BLOCKED && p.startsWith(STORE + path.sep) ? STORE : false) });
    try {
      const sent = spySends(pool4.lane('parse'));
      const a = settle(pool4.call('__sleep', { ms: 600 }, { lane: 'parse' }));
      await sleep(50);
      const b = settle(pool4.call('xlsxSheets', { path: BOOK, capBytes: 20 << 20 }));
      BLOCKED = true;   // the mount went dark while B waited
      const ra = await a, t1 = performance.now();
      const rb = await b;
      ok(ra.ok?.slept === 600 && rb.code === 'storage-blocked' && rb.status === 503 && performance.now() - t1 < 200 && !sent.includes('xlsxSheets'),
        `a workbook queued on a mount that was marked blocked while it waited ⇒ refused storage-blocked in ms at its turn, never sent into the worker (${JSON.stringify(rb).slice(0, 160)}; sent ${sent.join(', ')})`);
    } finally { pool4.close(); }
  }

  console.log('⑬ an abandoned request leaves the queue — never sent; the next one runs (r3)');
  {
    const pool5 = new SafeFs({ poolSize: 1, name: 'fpm-gone' });
    const E = await serve({ safeFs: pool5 });
    try {
      const L = pool5.lane('parse'), sent = spySends(L);
      const t0 = performance.now();
      const a = settle(pool5.call('__sleep', { ms: 800, tag: 'A' }, { lane: 'parse' }));
      const acB = new AbortController(), acC = new AbortController();
      await sleep(30);
      const b = settle(pool5.call('__sleep', { ms: 800, tag: 'B' }, { lane: 'parse', signal: acB.signal }));
      const c = settle(pool5.call('__sleep', { ms: 800, tag: 'C' }, { lane: 'parse', signal: acC.signal }));
      const d = settle(pool5.call('__sleep', { ms: 10, tag: 'D' }, { lane: 'parse' }).then((x) => ({ ...x, at: performance.now() - t0 })));
      await sleep(100);
      acB.abort(); acC.abort();
      const [, rb, rc, rd] = await Promise.all([a, b, c, d]);
      ok(rb.code === 'request_gone' && rc.code === 'request_gone' && rd.ok?.slept === 10 && rd.ok.at < 1500 && JSON.stringify(sent) === '["__sleep:A","__sleep:D"]',
        `two waiters whose requests are gone leave the queue, never sent — the third runs right after the running one (B ${rb.code || rb.err || 'ran'}, C ${rc.code || rc.err || 'ran'}; D at ${Math.round(rd.ok?.at)} ms; sent ${sent.join(', ')})`);
      sent.length = 0;
      const hold = settle(pool5.call('__sleep', { ms: 1200, tag: 'hold' }, { lane: 'parse' }));
      await sleep(50);
      const http = await import('node:http');
      const leave = () => { const rq = http.get(`${E.base}/api/file/excel?path=${q(BOOK)}`, { agent: false }); rq.on('error', () => { }); return rq; };
      const gone = [leave(), leave()];
      await sleep(250);
      for (const rq of gone) rq.destroy();   // the clients went (the window closed) before their turn
      await sleep(100);
      const live = await get(E.base, `/api/file/excel?path=${q(BOOK)}`);
      await hold;
      ok(live.status === 200 && JSON.stringify(rowsOf(live.body?.sheets)) === JSON.stringify(SHEETS) && JSON.stringify(sent) === '["__sleep:hold","xlsxSheets"]',
        `over the route: two workbook requests closed by their clients while queued are never parsed — the live one runs next (${live.status}; sent ${sent.join(', ')})`);
    } finally { E.srv.close(); pool5.close(); }
  }
} finally {
  A.srv.close();
  pool.close();
  LB.setHook(null);
  W.stop();
  fs.rmSync(DIR, { recursive: true, force: true });
}
console.log(failed ? `FAILED ${failed} / ${passed + failed}` : `ALL PASS (${passed})`);
process.exit(failed ? 1 : 0);

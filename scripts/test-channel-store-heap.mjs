#!/usr/bin/env node
// test-channel-store-heap — 主开发 r2542 (lane gmail-connect-wall's find: the channels' settled heap grew by an object the size of
// the index). The store hold keeps a family's START-READ TEXT «until the caller takes it once» (src/store-hold.js), and the channel
// store took the value alone, so index.json's whole text stayed for the store's life. A stand-in index of 8 000 rows (a title
// outside Latin-1 in each: V8 then holds the text two bytes a character), the store opened in a child of its own (--expose-gc),
// its SETTLED heap a row (after the open's layout warm-up landed):
//   ① under TWICE the file's bytes a row (the text alone would be that). RED: the store that keeps the text (its takeText line
//      removed) — its heap a row larger by at least 1.5 × the file's bytes a row.
// Run: node scripts/test-channel-store-heap.mjs
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import './scratch.mjs';   // §113's order (主开发 r1845): the first import after node's own
import { checker } from './lib/check.mjs';
import { anchored } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const SRC = fs.readFileSync(path.join(REPO, 'src/channel-store.js'), 'utf8');
const CHILD = path.join(REPO, 'scripts/fixtures/channel-store-heap-child.cjs');
const M = mutantCopies('store-heap', REPO);
const { ok, report } = checker();
const N = 8000;
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'store-heap-'));
let seedN = 7; const rnd = () => (seedN = (seedN * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const WORDS = 'the quick brown fox jumps over a lazy dog while agents build lanes and gates turn green'.split(' ');
const text = (n) => { let t = ''; while (t.length < n) t += WORDS[Math.floor(rnd() * WORDS.length)] + ' '; return t.slice(0, n); };
const conv = {};
for (let i = 0; i < N; i++) {
  const id = `t${i.toString(36)}x${Math.floor(rnd() * 1e9).toString(36)}`, k = `gmail/${id}`;
  conv[k] = { key: k, id, adapterId: 'gmail', vendorId: id, title: `${text(30)} — 会话 ${i}`, kind: rnd() < 0.5 ? 'dm' : 'group', participants: text(120), lastAt: 1795000000000 - i * 1000, unread: i % 7, preview: text(420), lane: { via: 'poll' }, readAt: 1795000000000 - i * 2000 };
}
const indexText = JSON.stringify({ v: 1, conversations: conv, updatedAt: 1795000000000, accountAssignments: {} }, null, 1);
const bpr = Buffer.byteLength(indexText) / N;
function heapOf(storePath, tag) {
  const dir = path.join(ROOT, tag); fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, 'index.json'), indexText);
  const r = spawnSync(process.execPath, ['--expose-gc', CHILD, storePath, REPO, dir], { encoding: 'utf8', timeout: 60000, maxBuffer: 1 << 24 });
  const line = (r.stdout || '').trim().split('\n').pop() || '';
  try { return JSON.parse(line); } catch { return { error: `no answer (rc ${r.status}): ${(r.stderr || '').slice(-300)}` }; }
}
const per = (j) => (j && Number.isFinite(j.heap) ? j.heap / N : NaN);
const cur = heapOf(path.join(REPO, 'src/channel-store.js'), 'cure');
ok(cur.rows === N && cur.warmed >= 1 && per(cur) < 2 * bpr, `① the store over ${N} rows (index.json ${bpr.toFixed(0)} bytes a row, a title outside Latin-1): its settled heap ${per(cur).toFixed(0)} bytes a row — under twice the file's bytes a row (${(2 * bpr).toFixed(0)}: the start-read text alone would be that)`, cur);
const KEEP = M.write('src/channel-store.js', anchored(SRC, '    fam.H.takeText();   // 主开发 r2542', '    void 0;   // 主开发 r2542', 'the start read\'s text kept'), 'keep-text');
const red = heapOf(KEEP, 'keep-text');
ok(red.rows === N && per(red) - per(cur) >= 1.5 * bpr, `① RED CONTROL: the store that keeps the start read's text — ${per(red).toFixed(0)} bytes a row, ${(per(red) - per(cur)).toFixed(0)} above the cure (at least 1.5 × the file's ${bpr.toFixed(0)}) — the leg above would go red`, red);
fs.rmSync(ROOT, { recursive: true, force: true });
report();

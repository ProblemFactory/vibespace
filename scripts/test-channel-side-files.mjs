#!/usr/bin/env node
// test-channel-side-files — B-f276 family, slice «channel-side-files» (lane bl-loop-a, 主开发 r4781): THE CHANNEL STORE's SIDE FILES
// under the store-read law. FAST, in-process: a real channel store on a scratch folder, its own store writer; an UNREADABLE file is a
// PLACED refusal of the read call for that one path (fs.readFileSync answers it with the error, every other path as itself — never
// permissions, never a broken disk), a TORN file is its bytes.
//   ① THE TWO MEMOS (<account>/search-memo.json and feed-misses.json — DERIVED by 主开发 r3183 / r3188: lost, the next vendor answer
//      rebuilds them, nothing of the person's is lost): a missing memo reads as none and says nothing; an unreadable or a torn one
//      reads as none and is SAID, once a file, with its code; reading it writes nothing (the torn bytes are the file's, byte for byte,
//      after every reader asked) until the next answer writes a fresh memo (the ruling's road); a good file then reads as it is.
//      RED: the tip's memoRead — every failure silent.
// Run: node scripts/test-channel-side-files.mjs
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { anchored, scratch } from './scratch.mjs';   // FIRST after node's own (§113)
import { checker } from './lib/check.mjs';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';

const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const require = createRequire(import.meta.url);
const { ok, report } = checker();
const ROOT = scratch('channel-side-files');
const S = require(path.join(REPO, 'src/channel-store.js'));
const SW = require(path.join(REPO, 'src/store-writer.js'));
const SRC = fs.readFileSync(path.join(REPO, 'src/channel-store.js'), 'utf8');
const MB = mutantCopies('channel-side-files', REPO);
const T = Date.parse('2026-11-26T05:00:00Z');
const said = [];
const log = { info() { }, log() { }, debug() { }, error() { }, warn: (...a) => said.push(a.map(String).join(' ')) };
const quiet = { info() { }, log() { }, debug() { }, error() { }, warn() { } };
let seq = 0;
const open = (Smod = S) => { const dir = path.join(ROOT, `s${++seq}`), w = SW.create({ log: quiet }); return { dir, w, st: Smod.createChannelStore({ dir, log, now: () => T, writer: w }) }; };
const shut = (o) => { try { o.st.close(); } catch { } try { o.w.stop(); } catch { } };
// THE PLACED REFUSAL: fs.readFileSync answers ONE path with the error (the store's own `fs` is this module object), every other as itself
const refuseRead = (file, code = 'EIO') => { const r0 = fs.readFileSync; fs.readFileSync = function (p, ...a) { if (String(p) === file) throw Object.assign(new Error(`${code}: a placed refusal`), { code }); return r0.call(this, p, ...a); }; return () => { fs.readFileSync = r0; }; };
const bytesOf = (f) => { try { return fs.readFileSync(f); } catch { return null; } };

console.log('① the two memos (derived): missing says nothing; unreadable or torn reads as none, said once with its code, written by nothing but the next answer');
async function memoLeg(Smod, kind) {
  const o = open(Smod), A = 'acct-a';
  const read = kind === 'search' ? (id) => o.st.searchMemoRead(id) : (id) => o.st.feedMissRead(id);
  const write = kind === 'search' ? (id, v) => o.st.searchMemoWrite(id, v) : (id, v) => o.st.feedMissWrite(id, v);
  const file = path.join(o.dir, A, kind === 'search' ? 'search-memo.json' : 'feed-misses.json');
  const out = {};
  said.length = 0;
  out.missing = { v: read(A), said: said.length };
  // UNREADABLE: the placed refusal (a fresh store: the memo's first read is the file's)
  shut(o);
  const o2 = open(Smod); const file2 = path.join(o2.dir, A, path.basename(file));
  fs.mkdirSync(path.dirname(file2), { recursive: true }); fs.writeFileSync(file2, JSON.stringify({ kept: 'the bytes before' }));
  const before2 = bytesOf(file2);
  said.length = 0;
  const read2 = kind === 'search' ? (id) => o2.st.searchMemoRead(id) : (id) => o2.st.feedMissRead(id);
  const undo = refuseRead(file2);
  let v2a, v2b; try { v2a = read2(A); v2b = read2(A); } finally { undo(); }
  out.unreadable = { v: [v2a, v2b], said: said.slice(), same: Buffer.compare(bytesOf(file2), before2) === 0 };
  shut(o2);
  // TORN: its bytes
  const o3 = open(Smod); const file3 = path.join(o3.dir, A, path.basename(file));
  fs.mkdirSync(path.dirname(file3), { recursive: true }); fs.writeFileSync(file3, '{"entries": [["a", {"t');
  const before3 = bytesOf(file3);
  said.length = 0;
  const read3 = kind === 'search' ? (id) => o3.st.searchMemoRead(id) : (id) => o3.st.feedMissRead(id);
  const write3 = kind === 'search' ? (id, v) => o3.st.searchMemoWrite(id, v) : (id, v) => o3.st.feedMissWrite(id, v);
  out.torn = { v: [read3(A), read3(A)], said: said.slice(), same: Buffer.compare(bytesOf(file3), before3) === 0 };
  // the ruling's road: the next answer writes a fresh memo; read again in a NEW store (the file's) it is that memo
  write3(A, { fresh: kind });
  await o3.w.durable(file3);
  shut(o3);
  const o4 = open(Smod); const file4 = path.join(o4.dir, A, path.basename(file));
  fs.mkdirSync(path.dirname(file4), { recursive: true }); fs.copyFileSync(file3, file4);
  const read4 = kind === 'search' ? (id) => o4.st.searchMemoRead(id) : (id) => o4.st.feedMissRead(id);
  out.healed = read4(A);
  shut(o4);
  void write; return out;
}
for (const kind of ['search', 'feed']) {
  const r = await memoLeg(S, kind);
  const name = kind === 'search' ? 'search-memo.json' : 'feed-misses.json';
  ok(r.missing.v === null && r.missing.said === 0, `① ${name} MISSING: none, nothing said (a first run)`, r.missing);
  ok(r.unreadable.v[0] === null && r.unreadable.v[1] === null && r.unreadable.said.length === 1 && /could not be read \(EIO\)/.test(r.unreadable.said[0]) && /derived memo/.test(r.unreadable.said[0]) && r.unreadable.same,
    `① ${name} UNREADABLE (a placed EIO of its read): none, SAID ONCE over two reads with its code («${(r.unreadable.said[0] || '').slice(0, 90)}…»), the file's bytes untouched`, r.unreadable);
  ok(r.torn.v[0] === null && r.torn.v[1] === null && r.torn.said.length === 1 && /could not be read \(torn\)/.test(r.torn.said[0]) && r.torn.same,
    `① ${name} TORN (its bytes): none, said once («torn»), the torn bytes the file's byte for byte after both reads`, r.torn);
  ok(!!r.healed && r.healed.fresh === kind, `① ${name}: the next answer wrote a fresh memo (the ruling's road, derived) and a store opened on it reads it as it is`, r.healed);
}
// RED: the tip's memoRead — every failure answered none in silence
{
  const TIP = "    let text;\n    try { text = fs.readFileSync(file, 'utf-8'); } catch (e) { if (!e || e.code !== 'ENOENT') memoSay(file, (e && e.code) || 'unreadable'); return null; }\n    try { return JSON.parse(text); } catch { memoSay(file, 'torn'); return null; }\n";
  const Sred = MB.load('src/channel-store.js', anchored(SRC, TIP, "    try { return JSON.parse(fs.readFileSync(file, 'utf-8')); } catch { return null; }   /* RED: the tip's read */\n", 'red: the tip\'s memoRead'), 'tip-memo-read');
  const r = await memoLeg(Sred, 'search');
  ok(r.unreadable.said.length === 0 && r.torn.said.length === 0, `RED: the tip's memoRead reads an unreadable and a torn memo as none IN SILENCE (said ${r.unreadable.said.length} / ${r.torn.said.length})`, { unreadable: r.unreadable.said, torn: r.torn.said });
}

for (const r of copiesCensus(MB.files, MB.dir, REPO, { minCopies: 1, label: 'B-f276 side files ' })) ok(r.pass, r.name, r.pass ? undefined : r.detail);
report();

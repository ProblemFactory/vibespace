#!/usr/bin/env node
// test-channel-side-files — B-f276 family, slice «channel-side-files» (lane bl-loop-a, 主开发 r4781): THE CHANNEL STORE's SIDE FILES
// under the store-read law. FAST, in-process: a real channel store on a scratch folder, its own store writer; an UNREADABLE file is a
// PLACED refusal of the read call for that one path (fs.readFileSync answers it with the error, every other path as itself — never
// permissions, never a broken disk), a TORN file is its bytes.
//   ① THE TWO MEMOS (<account>/search-memo.json and feed-misses.json — DERIVED by 主开发 r3183 / r3188: lost, the next vendor answer
//      rebuilds them, nothing of the person's is lost): a missing memo reads as none and says nothing; an unreadable or a torn one
//      reads as none and is SAID, once a failing stretch, with its code — a good read clears the mark, so a second stretch is said
//      again (主开发 r4906); reading it writes nothing (the torn bytes are the file's, byte for byte, after every reader asked) until the
//      next answer writes a fresh memo (the ruling's road); a good file then reads as it is. REDS: the base's memoRead — every failure
//      silent; the mark never cleared — the second stretch silent.
//   ② THE MESSAGE LOG (msgs/<account>/<conv>.ndjson): an EIO of its read at a prepend throws (held: the log's bytes untouched); a line
//      that does not parse is KEPT AS IT IS IN ITS PLACE (主开发 r4906: right after the parsed line before it — here between the third
//      and the fourth message) by both rewrites — a prepend of an older page and a retention trim past a bound — and the readers
//      still skip it. REDS: the base's prepend and the base's trim (the line gone); 270349f47's prepend (the line moved to the end).
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
  // r4906: the memo READS AGAIN (the placed refusal lifted), then a SECOND failing stretch: said again
  const good = read2(A), saidAt = said.length, undo2 = refuseRead(file2);
  let v2c; try { v2c = read2(A); read2(A); } finally { undo2(); }
  out.again = { good: !!good && good.kept === 'the bytes before', v: v2c, said: said.slice(saidAt) };
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
  ok(r.again.good && r.again.v === null && r.again.said.length === 1 && /could not be read \(EIO\)/.test(r.again.said[0]),
    `① ${name}: after it READ AGAIN, a second failing stretch is SAID AGAIN, once over two reads (主开发 r4906: the mark cleared by the good read)`, r.again);
  ok(r.torn.v[0] === null && r.torn.v[1] === null && r.torn.said.length === 1 && /could not be read \(torn\)/.test(r.torn.said[0]) && r.torn.same,
    `① ${name} TORN (its bytes): none, said once («torn»), the torn bytes the file's byte for byte after both reads`, r.torn);
  ok(!!r.healed && r.healed.fresh === kind, `① ${name}: the next answer wrote a fresh memo (the ruling's road, derived) and a store opened on it reads it as it is`, r.healed);
}
// RED: the tip's memoRead — every failure answered none in silence
const CLR = "    try { const v = JSON.parse(text); memoSaid.delete(file); return v; } catch { memoSay(file, 'torn'); return null; }   // read again: a later failure is said again (r4906)\n";
{
  const TIP = "    let text;\n    try { text = fs.readFileSync(file, 'utf-8'); } catch (e) { if (!e || e.code !== 'ENOENT') memoSay(file, (e && e.code) || 'unreadable'); return null; }\n" + CLR;
  const Sred = MB.load('src/channel-store.js', anchored(SRC, TIP, "    try { return JSON.parse(fs.readFileSync(file, 'utf-8')); } catch { return null; }   /* RED: the tip's read */\n", 'red: the tip\'s memoRead'), 'tip-memo-read');
  const r = await memoLeg(Sred, 'search');
  ok(r.unreadable.said.length === 0 && r.torn.said.length === 0, `RED: the tip's memoRead reads an unreadable and a torn memo as none IN SILENCE (said ${r.unreadable.said.length} / ${r.torn.said.length})`, { unreadable: r.unreadable.said, torn: r.torn.said });
  const Sonce = MB.load('src/channel-store.js', anchored(SRC, CLR, "    try { return JSON.parse(text); } catch { memoSay(file, 'torn'); return null; }   /* RED: 270349f47's memoRead, the mark never cleared */\n", 'red: the mark kept'), 'mark-kept');
  const r2 = await memoLeg(Sonce, 'search');
  ok(r2.unreadable.said.length === 1 && r2.again.good && r2.again.said.length === 0, `RED: 270349f47's memoRead (the mark kept for the process) says the first stretch and the SECOND IN SILENCE (said ${r2.unreadable.said.length} / ${r2.again.said.length})`, r2.again);
}

console.log('② the message log: an EIO of its read held; a line that does not parse kept as it is by the prepend and by the trim');
const TORN = '{"vendorId":"m-torn","at":' + (T - 2500) + ',"text":"a crash mid-wri';
/** THE TORN LINE's PLACE in a log's text: the vendor ids of the lines just before and just after it (null at an end) */
const placeOf = (text) => { const L = text.split('\n').filter(Boolean), i = L.indexOf(TORN), id = (l) => { try { return JSON.parse(l).vendorId; } catch { return '(torn)'; } }; return i < 0 ? null : { before: i > 0 ? id(L[i - 1]) : null, after: i + 1 < L.length ? id(L[i + 1]) : null }; };
const between = (pl) => !!pl && pl.before === 'm3' && pl.after === 'm4';
async function logLeg(Smod) {
  const o = open(Smod), A = 'acct-b', C = 'conv-1', file = path.join(o.dir, 'msgs', A, `${C}.ndjson`);
  const rec = (i, at) => ({ id: `m${i}`, vendorId: `m${i}`, convId: C, at, text: `message ${i}`, author: { id: 'p1', name: 'Pat' } });
  o.st.appendRecords(A, C, [rec(1, T - 3000), rec(2, T - 2000), rec(3, T - 1000)]);
  fs.appendFileSync(file, TORN + '\n');   // a line torn by a crash mid-write (its bytes), between whole ones
  o.st.appendRecords(A, C, [rec(4, T - 500)]);
  const out = {};
  const b0 = bytesOf(file), undo = refuseRead(file);   // THE PLACED EIO of the rewrite's read
  try { o.st.prependRecords(A, C, [rec(0, T - 9000)]); out.eio = 'no throw'; } catch (e) { out.eio = e && e.code; } finally { undo(); }
  out.eioSame = Buffer.compare(bytesOf(file), b0) === 0;
  const p = o.st.prependRecords(A, C, [rec(0, T - 9000)]);   // an older page: the log rewritten
  const t1 = fs.readFileSync(file, 'utf8');
  out.prepend = { appended: p.appended, kept: t1.split('\n').includes(TORN), older: t1.includes('"vendorId":"m0"'), lines: t1.split('\n').filter(Boolean).length, place: placeOf(t1) };
  out.read = o.st.readTail(A, C, { limit: 50 }).map((r) => r.vendorId);
  // past the count bound (3 of the 5 records; its pivot m3 parses): m0..m2 dropped, the log rewritten
  const tr = o.st.trim(A, C, { days: 3650, maxRecords: 3, floorDays: 0 });
  const t2 = fs.readFileSync(file, 'utf8');
  out.trim = { removed: tr.removed, kept: t2.split('\n').includes(TORN), left: t2.split('\n').filter(Boolean).length, place: placeOf(t2) };
  shut(o);
  return out;
}
{
  const r = await logLeg(S);
  ok(r.eio === 'EIO' && r.eioSame, `② a PLACED EIO of the log's read at a prepend: the rewrite throws (${r.eio}) — held, the log's bytes untouched`, r);
  ok(r.prepend.appended === 1 && r.prepend.older && r.prepend.kept && between(r.prepend.place), `② a prepend of an older page rewrote the log (${r.prepend.lines} lines) and KEPT the line that does not parse, byte for byte, IN ITS PLACE: between the third and the fourth message (${JSON.stringify(r.prepend.place)})`, r.prepend);
  ok(JSON.stringify(r.read) === JSON.stringify(['m0', 'm1', 'm2', 'm3', 'm4']), `② the readers still skip it: readTail answers ${r.read.join(' ')}`, r.read);
  ok(r.trim.removed === 3 && r.trim.kept && between(r.trim.place), `② a retention trim past its count bound dropped ${r.trim.removed} record(s) and KEPT the line that does not parse IN ITS PLACE, between the third and the fourth message (${r.trim.left} lines left; ${JSON.stringify(r.trim.place)})`, r.trim);
}
// REDS: the tip's two rewrites — each drops the line
{
  const PRE = "    for (const l of lines) { let r; try { r = JSON.parse(l); } catch { (olds.length ? olds[olds.length - 1].torn : head).push(l); continue; } olds.push({ r, torn: [] }); }\n";
  const Spre = MB.load('src/channel-store.js', anchored(SRC, PRE, "    for (const l of lines) { let r; try { r = JSON.parse(l); } catch { continue; /* RED: the tip's prepend drops it */ } olds.push({ r, torn: [] }); }\n", 'red: the tip\'s prepend'), 'tip-prepend');
  const rp = await logLeg(Spre);
  ok(rp.prepend.appended === 1 && !rp.prepend.kept, 'RED: the tip\'s prepend rewrites the log WITHOUT the line that does not parse (it is gone)', rp.prepend);
  // RED (主开发 r4906): 270349f47's prepend — the line kept, but written after the merged records: MOVED TO THE END
  const PLACE = "    const head = [], olds = [];   // each parsed line with the lines that do not parse right after it; before any parsed line: head\n" + PRE
    + "    const merged = olds.concat(fresh.map((r) => ({ r, torn: [] }))).sort((a, b) => cmpRecord(a.r, b.r));\n    const out = head.slice();\n    for (const x of merged) { out.push(JSON.stringify(x.r)); for (const t of x.torn) out.push(t); }\n";
  const Send = MB.load('src/channel-store.js', anchored(SRC, PLACE, "    const parsed = [], torn = [];\n    for (const l of lines) { try { parsed.push(JSON.parse(l)); } catch { torn.push(l); } }\n    const merged = parsed.concat(fresh).sort(cmpRecord);\n    const out = merged.map((r) => JSON.stringify(r)).concat(torn);   /* RED: 270349f47's prepend — moved to the end */\n", 'red: moved to the end'), 'moved-to-end');
  const re = await logLeg(Send);
  ok(re.prepend.appended === 1 && re.prepend.kept && !between(re.prepend.place) && !!re.prepend.place && re.prepend.place.before === 'm4' && re.prepend.place.after === null, `RED: 270349f47's prepend keeps the line but MOVES IT TO THE END, after the fourth message (${JSON.stringify(re.prepend.place)})`, re.prepend);
  const TRIM = "    const kept = lines.filter((l) => recAtKept(l) >= cutoff);";
  const Strim = MB.load('src/channel-store.js', anchored(SRC, TRIM, "    const kept = lines.filter((l) => recAt(l) >= cutoff); /* RED: the tip's trim */", 'red: the tip\'s trim'), 'tip-trim');
  const rt = await logLeg(Strim);
  ok(rt.prepend.kept && rt.trim.removed > 0 && !rt.trim.kept, 'RED: the tip\'s trim drops the line that does not parse with the records past its bound', rt.trim);
}

for (const r of copiesCensus(MB.files, MB.dir, REPO, { minCopies: 5, label: 'B-f276 side files ' })) ok(r.pass, r.name, r.pass ? undefined : r.detail);
report();

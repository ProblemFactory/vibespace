#!/usr/bin/env node
// test-otel-replay-slices.mjs — FAST (in-process + three node children): THE STORED-EVENTS REPLAY AT A START, each law on a
// small placed stash (row B-360d, lane hub-loop-stalls — 主开发 r713 / r725 / r738). The owner's size is measured by the heavy
// test-otel-replay-measure; here every law has a leg and, where an earlier form could break it, a RED control. The release's
// own ingest is one of them: scripts/fixtures/otel-replay/otel-ingest-944de13f9.js.frozen, loaded over the same files.
//   ⓪ THE LINE READER (src/ndjson-lines.js): lines cut by a read's end are carried, offsets are the file's, an unterminated
//      last line is a line, a blank one is not, a line longer than a read is skipped whole and counted.
//   ① THE READS: the spill and the stash each through ONE descriptor, no read over 4 MiB, nothing read whole (no readFile /
//      readFileSync of either), no buffer joined past a read, and the trim handed to the writer as byte RANGES (no stash
//      byte on the main thread). RED: the release (whole reads, one joined buffer) and a copy reading in one 64 MiB read.
//   ② THE MAP never over its cap WHILE it replays (sampled at every turn), the newest rids by file order kept. RED: the
//      release and a copy with the cap cut out of the replay.
//   ③ THE TRIM LANDS on a BUSY start (a spill drains while it is due) and keeps the count rule exactly — the newest 60 000
//      known lines inside 30 days and every unknown-org one, in file order, the unterminated last line given its newline —
//      then the drained lines. RED: the release skips it (the file grew while it wrote).
//   ④ A FAILED TRIM (the writer's temp cannot be made) leaves the stash whole, says so, and the drained lines land alone.
//   ⑤ TAKEN ONCE: (a) a spill whose records are also the stash's last lines (a stop between the two writes) — none stashed
//      twice; RED: a copy whose cap keeps the OLDEST rids. (b) A HARD STOP INSIDE THE REPLAY, for real: a child hub killed
//      (SIGKILL) between two reads of its replay with three posts waiting, then a second start that the exporter sends them
//      to again — the stash is its old bytes plus one line per record; RED: a copy with the rid dedupe cut out (twice each).
//   ⑥ THE ROAD WITH NO CALLER, REMOVED: no synchronous read of the stash left in the ingest; observedOrgForRid answers a
//      promise once the replay ended, nothing read in the caller's tick. RED: the release (answered in the tick, the stash
//      read whole there).
//   ⑦ THE MIGRATION'S READ (r725 b): a stash whose read FAILS leaves 2026-09-backfill-ledger-by-slot failed by the runner's
//      own law (not recorded: it runs again), a readable one records it run. RED: the release's readOtelStash (the throw
//      swallowed, recorded as run with 0 rows).
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { checker } from './lib/check.mjs';
import { mutantCopies } from './mutant-copy.mjs';
import { anchored } from './scratch.mjs';

const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { ok, report } = checker();
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-otel-slices-'));
process.on('exit', () => { try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { } });
const NOW = Date.now(), DAY = 86400e3, CAP = 60000, READ = 4 * 1048576;
const ORG = '9a1b2c3d-1111-2222-3333-444455556666', BACKFILL = '2026-09-backfill-ledger-by-slot';
const groups = new Map([['org:' + ORG, { accountIds: ['sub-true'] }]]);
const INGEST = path.join(REPO, 'src/server/otel-ingest.js');
const SRC = fs.readFileSync(path.join(REPO, 'src/server/otel-ingest.js'), 'utf8');
const RELEASE = fs.readFileSync(path.join(REPO, 'scripts/fixtures/otel-replay/otel-ingest-944de13f9.js.frozen'), 'utf8');
const SW = require(path.join(REPO, 'src/store-writer.js')).storeWriter();
const M = mutantCopies('otel-replay-slices', REPO);
const READ_LINE = 'const STASH_READ = { readBytes: READ_BYTES, maxLine: READ_BYTES, sliceMs: REPLAY_SLICE_MS, turn: nextTurn };';
const CAP_LINE = '    if (truth.size > MAX_TRUTH) { truth.delete(order[head++]); if (head >= MAX_TRUTH) { order.splice(0, head); head = 0; } }';
const mods = {
  cure: require(INGEST),
  release: M.load('src/server/otel-ingest.js', RELEASE, 'release'),
  whole: M.load('src/server/otel-ingest.js', anchored(SRC, READ_LINE, 'const STASH_READ = { readBytes: 64 * 1048576, maxLine: 64 * 1048576, sliceMs: Infinity, turn: () => Promise.resolve() };', 'one whole read'), 'whole'),
  uncapped: M.load('src/server/otel-ingest.js', anchored(SRC, '\n' + CAP_LINE, '', 'the cap while it replays'), 'uncapped'),
  oldest: M.load('src/server/otel-ingest.js', anchored(SRC, '    truth.set(rid, acct); order.push(rid);\n' + CAP_LINE, '    if (truth.size >= MAX_TRUTH) return;   // MUTANT: the cap keeps the OLDEST rids\n    truth.set(rid, acct); order.push(rid);', 'the cap keeps the oldest'), 'oldest'),
};
const NODEDUPE = M.write('src/server/otel-ingest.js', anchored(SRC, '      const dup = truth.has(rec.rid);', '      const dup = false;   // MUTANT: no rid dedupe', 'the rid dedupe'), 'nodedupe');
const NOLEDGER = M.load('src/server/otel-ingest.js', anchored(SRC, '    if (!ran) { console.log(', '    if (false) { console.log(', 'the ledger asked'), 'noledger');
const SYNCREWRITE = M.load('src/server/otel-ingest.js', anchored(SRC, '    const trim = trimOwed && !(o && o.sync) ? trimOwed : null;', '    const trim = trimOwed ? trimOwed : null;   // MUTANT: a synchronous flush rewrites too', 'the sync flush guard'), 'syncrewrite');
const FAILED200 = M.load('src/server/otel-ingest.js', anchored(SRC, '        if (!onDisk && trimFailed) return res.status(503)', '        if (false) return res.status(503)', 'a failed trim answered «retry»'), 'failed200');
const REC = (rid) => ({ timeUnixNano: String(NOW - 60000) + '000000', body: { stringValue: 'claude_code.api_request' }, attributes: Object.entries({ 'session.id': { stringValue: 'sess-p' }, 'organization.id': { stringValue: ORG }, 'event.name': { stringValue: 'api_request' }, model: { stringValue: 'm' }, input_tokens: { intValue: 1 }, output_tokens: { intValue: 1 }, cost_usd: { doubleValue: 0 }, request_id: { stringValue: rid } }).map(([key, value]) => ({ key, value })) });
const PAYLOAD = (recs) => ({ resourceLogs: [{ resource: { attributes: [] }, scopeLogs: [{ scope: { name: 'x' }, logRecords: recs }] }] });
/** THE ROUTE (POST /otel/v1/logs) with one record: its answer, and whether its line was on disk when it was answered */
const callLogs = (oi, stash, rid) => new Promise((resolve) => {
  const tok = oi.envFor().OTEL_EXPORTER_OTLP_HEADERS.split('=')[1];
  const req = { socket: { remoteAddress: '127.0.0.1' }, headers: { 'x-vibespace-otel': tok }, body: PAYLOAD([REC(rid)]) };
  const res = { code: 200, status(x) { this.code = x; return this; }, set() { return this; }, json(b) { let t = ''; try { t = fs.readFileSync(stash, 'utf8'); } catch { } resolve({ code: this.code, onDisk: countIn(t, rid), error: b && b.error }); return this; } };
  Promise.resolve(oi.logs(req, res)).catch((e) => resolve({ err: String(e) }));
});
const make = (mod, dataDir) => mod.create({ dataDir, PORT: 0, getUsageHistory: () => null, identityGroups: () => groups, listAccounts: () => [], serverSetting: () => undefined });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rec = (rid, ts = NOW - 60e3) => ({ event: 'api_request', ts, rid, sid: 'sess-1', orgUuid: ORG, accountUuid: null, email: null, model: 'm', i: 1, o: 1, cr: 0, cw: 0, costUsd: 0, cliVersion: '2.1.235' });
const countIn = (t, rid) => { let n = 0; for (let k = t.indexOf(`"rid":"${rid}"`); k >= 0; k = t.indexOf(`"rid":"${rid}"`, k + 1)) n++; return n; };
/** rid → how many lines of `t` carry it (one pass) */
const ridCounts = (t) => { const m = new Map(); for (const x of t.matchAll(/"rid":"([^"]+)"/g)) m.set(x[1], (m.get(x[1]) || 0) + 1); return m; };
const forget = (dir) => { for (const f of ['otel-truth.ndjson', 'otel-truth.pending.ndjson']) { try { SW.forget(path.join(dir, 'usage-history', f)); } catch { } } };

console.log('⓪ the line reader (src/ndjson-lines.js)');
{
  const { eachLine, eachLineSync } = require(path.join(REPO, 'src/ndjson-lines.js'));
  const f = path.join(ROOT, 'lines.ndjson');
  const body = 'alpha\nbeta-gamma\n\n' + 'x'.repeat(40) + '\nlast-one';
  fs.writeFileSync(f, body);
  const seen = [], seenA = [];
  const fd = fs.openSync(f, 'r');
  const st = eachLineSync(fd, (buf, a, nl, at) => seen.push([buf.toString('utf8', a, nl), at]), { readBytes: 7, maxLine: 16 });
  fs.closeSync(fd);
  const fh = await fs.promises.open(f, 'r');
  const stA = await eachLine(fh, (buf, a, nl, at) => seenA.push([buf.toString('utf8', a, nl), at]), { readBytes: 7, maxLine: 16, sliceMs: 0 });
  await fh.close();
  const want = [['alpha', 0], ['beta-gamma', 6], ['last-one', 59]];
  ok(JSON.stringify(seen) === JSON.stringify(want) && JSON.stringify(seenA) === JSON.stringify(want) && st.long === 1 && stA.long === 1 && st.bytes === body.length && st.lines === 3,
    `reads of 7 bytes: the cut lines carried, the file's offsets, the blank line skipped, the 40-byte line (past 16) skipped whole and counted, the unterminated last line handed (sync and async alike)`, { seen, seenA, st, stA });
}

// THE PLACED STASH A (① ② ③ ④): 190 000 lines (~13.7 MB, past FILE_MAX), oldest first — every 10th past the horizon, an unknown
// org every 997th inside it, a blank line, a torn one, and a last line with no newline; the migration recorded as run
const NA = 190000, partsA = [], kindsA = [];
for (let k = 0; k < NA; k++) {
  if (k === 1000) { partsA.push('\n'); kindsA.push('blank'); continue; }
  if (k === 2000) { partsA.push('{"rid":"req_torn","ts":\n'); kindsA.push('torn'); continue; }
  const old = k % 10 === 7, unknown = !old && k % 997 === 5;
  partsA.push(JSON.stringify({ rid: 'req_a' + String(k).padStart(7, '0'), ts: old ? NOW - 40 * DAY - k : NOW - 20 * DAY + k * 1000, ...(unknown ? { acctKnown: false } : { acct: 'sub-' + (k % 3), acctKnown: true }) }) + '\n');
  kindsA.push(old ? 'old' : unknown ? 'unknown' : 'known');
}
partsA[NA - 1] = partsA[NA - 1].slice(0, -1);
const bodyA = partsA.join('');
const knownA = []; for (let k = 0; k < NA; k++) if (kindsA[k] === 'known') knownA.push(k);
const keepA = new Set(knownA.slice(-CAP)); for (let k = 0; k < NA; k++) if (kindsA[k] === 'unknown') keepA.add(k);
const expectA = []; for (let k = 0; k < NA; k++) if (keepA.has(k)) expectA.push(partsA[k].endsWith('\n') ? partsA[k] : partsA[k] + '\n');
const keptA = expectA.join(''), SPILL_A = 50;
const bodyS = partsA.slice(0, 80000).join('');   // a smaller stash (~5.8 MB: past a read, under FILE_MAX — no trim) for the read and map controls
const RAN = { applied: { [BACKFILL]: NOW - DAY }, reports: { [BACKFILL]: { at: NOW - DAY, stash: 0 } } };   // run, 0 rows: an instance born after it
const placeA = (tag, { ledger = RAN, body = bodyA } = {}) => {
  const d = path.join(ROOT, 'a-' + tag), h = path.join(d, 'usage-history');
  fs.mkdirSync(h, { recursive: true });
  fs.writeFileSync(path.join(h, 'otel-truth.ndjson'), body);
  const s = []; for (let k = 0; k < SPILL_A; k++) s.push(JSON.stringify(rec('req_spill' + String(k).padStart(4, '0'))) + '\n');
  fs.writeFileSync(path.join(h, 'otel-truth.pending.ndjson'), s.join(''));
  if (ledger) fs.writeFileSync(path.join(d, 'migrations.json'), JSON.stringify(ledger));
  return d;
};
/** one start of `mod` over a placed dir, probed: the reads of the stash and the spill, whole reads, joined buffers, the bytes
 *  its producer hands the writer, the map at every turn, the longest turn; then the trim's end and the drained lines on disk */
async function startOver(mod, d, { trim = true } = {}) {
  const stash = path.join(d, 'usage-history', 'otel-truth.ndjson'), spill = path.join(d, 'usage-history', 'otel-truth.pending.ndjson');
  const which = (p) => (String(p) === stash ? 'stash' : String(p) === spill ? 'spill' : null);
  const P = { opens: { stash: 0, spill: 0 }, readMax: { stash: 0, spill: 0 }, whole: [], concatMax: 0, handed: 0, mapPeak: 0, gapMax: 0, ino0: fs.statSync(stash).ino, size0: fs.statSync(stash).size, said: [] };
  const fsp = fs.promises, open0 = fsp.open, readFile0 = fsp.readFile, rfs0 = fs.readFileSync, concat0 = Buffer.concat, dirty0 = SW.dirty, warn0 = console.warn, log0 = console.log;
  fsp.open = async function (p, ...a) {
    const h = await open0.call(this, p, ...a), k = which(p);
    if (k) { P.opens[k]++; const r0 = h.read.bind(h); h.read = (buf, off, len, pos) => { P.readMax[k] = Math.max(P.readMax[k], len == null ? buf.length : len); return r0(buf, off, len, pos); }; }
    return h;
  };
  fsp.readFile = function (p, ...a) { if (which(p)) P.whole.push(which(p) + ' (fs.promises.readFile)'); return readFile0.call(this, p, ...a); };
  fs.readFileSync = function (p, ...a) { if (which(p)) P.whole.push(which(p) + ' (readFileSync)'); return rfs0.call(this, p, ...a); };
  Buffer.concat = function (list, len) { const r = concat0.call(this, list, len); if (r.length > P.concatMax) P.concatMax = r.length; return r; };
  SW.dirty = function (f, o) {
    if (f === stash && o && typeof o.produce === 'function' && !o.produce.probed) {
      const p0 = o.produce, w = (...a) => { const r = p0(...a); const b = r == null ? 0 : typeof r === 'string' ? Buffer.byteLength(r) : r.append != null ? Buffer.byteLength(String(r.append)) : r.then != null ? Buffer.byteLength(String(r.then)) : (r.byteLength || 0); if (b > P.handed) P.handed = b; return r; };
      w.probed = true; o = { ...o, produce: w };
    }
    return dirty0.call(this, f, o);
  };
  console.warn = (...a) => { P.said.push(a.join(' ')); }; console.log = (...a) => { P.said.push(a.join(' ')); };
  let oi = null, spin = true, last = performance.now();
  const turn = () => { const t = performance.now(); if (t - last > P.gapMax) P.gapMax = t - last; last = t; if (oi) { const n = oi.stats().rids; if (n > P.mapPeak) P.mapPeak = n; } if (spin) setImmediate(turn); };
  setImmediate(turn);
  try {
    oi = make(mod, d);
    await oi.replayed;
    // the trim's end: the file renamed (a new inode), its outcome said, or the release's own temp seen and gone (skipped) — bounded
    let tmpSeen = false;
    for (let k = 0; trim && k < 200; k++) {
      const has = fs.existsSync(stash + '.tmp'); tmpSeen ||= has;
      if (fs.statSync(stash).ino !== P.ino0 || (tmpSeen && !has) || P.said.some((l) => /trim FAILED|kept WHOLE/.test(l))) break;
      await sleep(25);
    }
    for (let k = 0; k < 100 && countIn(rfs0.call(fs, stash, 'utf8'), 'req_spill0049') === 0; k++) await sleep(25);   // the drained lines on disk (the suite's own read, never the probe's)
    await SW.durable(stash).catch(() => false);
  } finally {
    spin = false; fsp.open = open0; fsp.readFile = readFile0; fs.readFileSync = rfs0; Buffer.concat = concat0; SW.dirty = dirty0; console.warn = warn0; console.log = log0;
  }
  P.rewritten = fs.statSync(stash).ino !== P.ino0;
  P.text = fs.readFileSync(stash, 'utf8');
  P.oi = oi;
  return P;
}
const brief = (P) => ({ opens: P.opens, readMax: P.readMax, whole: P.whole, concatMax: P.concatMax, handed: P.handed, mapPeak: P.mapPeak, gapMax: Math.round(P.gapMax), rewritten: P.rewritten, size: P.text.length });

console.log(`①②③ a busy start over a placed stash of ${bodyA.length} bytes (${NA} lines; ${knownA.length} known inside 30 days), a spill of ${SPILL_A}`);
const R = {};
ok(bodyA.length > 12 * 1048576 && bodyS.length > READ, `premise: the stash is past FILE_MAX (${bodyA.length} bytes), the smaller one past one read (${bodyS.length})`);
for (const tag of ['cure', 'release']) { const d = placeA(tag); R[tag] = await startOver(mods[tag], d); forget(d); }
for (const tag of ['whole', 'uncapped']) { const d = placeA(tag, { body: bodyS }); R[tag] = await startOver(mods[tag], d, { trim: false }); forget(d); }
const C = R.cure;
console.log(`  · the cure: ${JSON.stringify(brief(C))}`);
console.log(`  · the release: ${JSON.stringify(brief(R.release))}`);
ok(C.opens.stash === 1 && C.opens.spill === 1 && C.readMax.stash > 0 && C.readMax.stash <= READ && C.readMax.spill <= READ && C.whole.length === 0 && C.concatMax <= READ,
  `① the spill and the stash each through ONE descriptor, no read over 4 MiB (${C.readMax.stash}), nothing read whole, no buffer joined past a read (${C.concatMax} bytes at most)`, brief(C));
ok(C.handed < 64 * 1024 && C.rewritten, `① the trim reached the writer as byte RANGES: the most its producer handed the main thread's writer is ${C.handed} bytes (the drained lines) for a ${keptA.length}-byte kept set`, brief(C));
ok(R.release.whole.length >= 2 && R.release.concatMax >= keptA.length - 64, `① RED CONTROL (the release, 944de13f9): ${R.release.whole.join(', ')}; one joined buffer of ${R.release.concatMax} bytes`, brief(R.release));
ok(R.whole.readMax.stash > READ, `① RED CONTROL (a copy reading the stash in one 64 MiB read): a read of ${R.whole.readMax.stash} bytes`, brief(R.whole));
ok(C.mapPeak > 0 && C.mapPeak <= CAP && C.oi.stats().rids <= CAP, `② the map never over its cap WHILE it replays (at most ${C.mapPeak} rids at any turn; ${knownA.length} known rids placed)`, brief(C));
{
  const keptRid = 'req_a' + String(knownA[knownA.length - CAP + SPILL_A]).padStart(7, '0'), gone = 'req_a' + String(knownA[knownA.length - CAP - 1]).padStart(7, '0');
  const a = await C.oi.observedOrgForRid(keptRid), b = await C.oi.observedOrgForRid(gone);
  ok(a !== undefined && b === undefined, `② the newest rids by file order are the ones kept (${keptRid}: ${a}; ${gone}, older than the newest ${CAP}: ${b})`);
}
ok(R.uncapped.mapPeak > CAP && R.release.mapPeak > CAP, `② RED CONTROLS: a copy with the cap cut out of the replay held ${R.uncapped.mapPeak} rids at a turn (the smaller stash), the release ${R.release.mapPeak}`);
{
  const rest = C.text.startsWith(keptA) ? C.text.slice(keptA.length) : null;
  const drained = rest == null ? -1 : rest.split('\n').filter(Boolean).length, once = rest != null && Array.from({ length: SPILL_A }, (_, k) => countIn(rest, 'req_spill' + String(k).padStart(4, '0'))).every((n) => n === 1);
  ok(C.rewritten && rest != null && drained === SPILL_A && once && !rest.startsWith('\n'),
    `③ THE TRIM LANDS on the busy start: the stash is the count rule's ${keptA.length} bytes exactly (the newest ${CAP} known lines inside 30 days, every unknown one, the last line given its newline) then the ${SPILL_A} drained lines once each`, { rewritten: C.rewritten, size: C.text.length, kept: keptA.length, drained });
  ok(C.said.filter((l) => l.includes('the stash trimmed by its writer')).length === 1, '③ …said once in the journal', C.said.filter((l) => l.includes('[otel]')).slice(0, 4));
}
ok(!R.release.rewritten && R.release.text.length > bodyA.length, `③ RED CONTROL (the release): its trim did not land on the busy start — the stash still ${R.release.text.length} bytes (the drain appended while it wrote)`, brief(R.release));
{ // ③b THE KEEP RULE asks the ledger: no record ⇒ kept WHOLE; recorded with 0 rows over rows from before the law ⇒ kept WHOLE
  const decide = async (mod, d) => {
    const said = [], w0 = console.warn, l0 = console.log, dz = SW.dirty; let owed = false;
    SW.dirty = function (f, o) { if (o && o.name === 'otel-truth.write') owed = true; return dz.call(this, f, o); };
    console.warn = (...a) => { said.push(a.join(' ')); }; console.log = (...a) => { said.push(a.join(' ')); };
    try { const oi = make(mod, d); await oi.replayed; } finally { SW.dirty = dz; console.warn = w0; console.log = l0; }
    forget(d);
    return { owed, whole: said.filter((l) => l.includes('kept WHOLE')).length, said: said.filter((l) => l.includes('[otel]')).slice(0, 2) };
  };
  const k1 = await decide(mods.cure, placeA('noledger', { ledger: null })), k1r = await decide(NOLEDGER, placeA('noledger-red', { ledger: null }));
  ok(!k1.owed && k1.whole === 1, '③b the ledger does not record the backfill migration as run: no trim owed, the stash kept WHOLE, said once', k1);
  ok(k1r.owed, '③b RED CONTROL (a copy that trims without asking the ledger): a trim owed over rows that migration may still read', k1r);
  const preLaw = JSON.stringify({ rid: 'req_prelaw', ts: Date.UTC(2026, 7, 1), acct: 'sub-0', acctKnown: true }) + '\n';
  const k2 = await decide(mods.cure, placeA('zero-rows', { body: preLaw + bodyA }));
  ok(!k2.owed && k2.whole === 1 && /0 rows/.test(k2.said.join(' ')), '③b recorded as run with 0 rows over a stash holding a known row from before 2026-09-07 (the release\'s reader failed on it): kept WHOLE, said', k2);
}
{ // ③c the exit's synchronous flush is never handed the rewrite (the next start trims)
  const syncAsk = async (mod, tag) => {
    const d = placeA('sync-' + tag), stash = path.join(d, 'usage-history', 'otel-truth.ndjson'), ino = fs.statSync(stash).ino, dz = SW.dirty;
    let first;
    SW.dirty = function (f, o) {
      if (f === stash && o && typeof o.produce === 'function' && !o.produce.syncProbe) { const p0 = o.produce; const w = (...a) => { if (first === undefined) { first = p0({ sync: true }); return first; } return p0(...a); }; w.syncProbe = true; o = { ...o, produce: w }; }
      return dz.call(this, f, o);
    };
    try { const oi = make(mod, d); await oi.replayed; for (let k = 0; k < 80 && first === undefined; k++) await sleep(25); await SW.durable(stash).catch(() => false); } finally { SW.dirty = dz; }
    const out = { rewrite: !!(first && first.rewrite), append: !!(first && first.append != null && String(first.append).includes('req_spill0049')), renamed: fs.statSync(stash).ino !== ino };
    forget(d);
    return out;
  };
  const y = await syncAsk(mods.cure, 'cure'), yr = await syncAsk(SYNCREWRITE, 'red');
  ok(!y.rewrite && y.append && !y.renamed, '③c a synchronous flush (the exit) is handed the drained lines as an APPEND, never the rewrite — the stash not renamed', y);
  ok(yr.rewrite, '③c RED CONTROL (a copy whose synchronous flush rewrites too): it was handed the rewrite', yr);
}

console.log('④ a failed trim');
{
  const run4 = async (mod, tag, { settle = true } = {}) => {
    const d = placeA('fail-' + tag), stash = path.join(d, 'usage-history', 'otel-truth.ndjson'), tmp = `${stash}.tmp-${process.pid}-w`, ino = fs.statSync(stash).ino;
    fs.mkdirSync(tmp);   // the writer's temp cannot be opened: the rewrite fails on its thread
    const said = [], w0 = console.warn, l0 = console.log;
    console.warn = (...a) => { said.push(a.join(' ')); }; console.log = (...a) => { said.push(a.join(' ')); };
    let ans;
    try {
      const oi = make(mod, d);
      const post = callLogs(oi, stash, 'req_post_fail');   // a post before the replay ended: it waits, its line rides the trim's job
      await oi.replayed; ans = await post;
      for (let k = 0; settle && k < 160 && countIn(fs.readFileSync(stash, 'utf8'), 'req_post_fail') === 0; k++) await sleep(25);   // its line's own append (after the writer's back-off)
      if (settle) await SW.durable(stash).catch(() => false);
    } finally { console.warn = w0; console.log = l0; }
    const t = fs.readFileSync(stash, 'utf8');
    fs.rmSync(tmp, { recursive: true, force: true }); forget(d);
    return { ans, renamed: fs.statSync(stash).ino !== ino, whole: t.startsWith(bodyA), drained: countIn(t.slice(bodyA.length), 'req_spill0049'), post: countIn(t.slice(bodyA.length), 'req_post_fail'), said: said.filter((l) => l.includes('trim FAILED')).length };
  };
  const f = await run4(mods.cure, 'cure'), fr = await run4(FAILED200, 'red', { settle: false });
  ok(!f.renamed && f.whole && f.drained === 1 && f.post === 1 && f.said === 1, `④ a failed trim: the stash stays whole as it was (${bodyA.length} bytes first), the failure said once, the drained lines and the post's line land after it, alone`, f);
  ok(f.ans && f.ans.code === 503 && f.ans.onDisk === 0, `④ the post whose line rode the failed trim is answered «retry» (${f.ans && f.ans.code}), never 200 for a line not on disk`, f.ans);
  ok(fr.ans && fr.ans.code === 200 && fr.ans.onDisk === 0, `④ RED CONTROL (a copy that reads a failed trim as a failing storage): answered ${fr.ans && fr.ans.code} with its line not on disk (${fr.ans && fr.ans.onDisk}) — a kill there loses a row the exporter never sends again`, fr.ans);
}

console.log('⑤ taken once');
{ // (a) the spill's records are also the stash's last 500 lines (a stop between the stash's append and the spill's rewrite)
  const NB = 61000, lines = []; for (let k = 0; k < NB; k++) lines.push(JSON.stringify({ rid: 'req_b' + String(k).padStart(6, '0'), ts: NOW - 3600e3 + k, acct: 'sub-true', acctKnown: true }) + '\n');
  const spillB = []; for (let k = NB - 500; k < NB; k++) spillB.push(JSON.stringify(rec('req_b' + String(k).padStart(6, '0'))) + '\n');
  for (let k = 0; k < 500; k++) spillB.push(JSON.stringify(rec('req_bnew' + String(k).padStart(4, '0'))) + '\n');
  const run = async (mod, tag) => {
    const d = path.join(ROOT, 'b-' + tag), h = path.join(d, 'usage-history'); fs.mkdirSync(h, { recursive: true });
    fs.writeFileSync(path.join(h, 'otel-truth.ndjson'), lines.join('')); fs.writeFileSync(path.join(h, 'otel-truth.pending.ndjson'), spillB.join(''));
    const oi = make(mod, d); await oi.replayed;
    const stash = path.join(h, 'otel-truth.ndjson'), spill = path.join(h, 'otel-truth.pending.ndjson');
    for (let k = 0; k < 120 && countIn(fs.readFileSync(stash, 'utf8'), 'req_bnew0499') === 0; k++) await sleep(25);
    await SW.durable(stash).catch(() => false);
    for (let k = 0; k < 120 && fs.readFileSync(spill, 'utf8') !== ''; k++) { await sleep(25); await SW.durable(spill).catch(() => false); }
    const n = ridCounts(fs.readFileSync(stash, 'utf8'));
    const twice = []; for (let k = NB - 500; k < NB; k++) if (n.get('req_b' + String(k).padStart(6, '0')) !== 1) twice.push(k);
    const fresh = Array.from({ length: 500 }, (_, k) => n.get('req_bnew' + String(k).padStart(4, '0'))).filter((x) => x === 1).length;
    forget(d);
    return { twice: twice.length, fresh, spill: fs.readFileSync(spill, 'utf8').length, stashed: oi.stats().stashed };
  };
  const a = await run(mods.cure, 'cure'), b = await run(mods.oldest, 'oldest');
  ok(a.twice === 0 && a.fresh === 500 && a.stashed === 500 && a.spill === 0, `⑤a a spill whose 500 records are also the stash's last lines (${NB} known rids, past the cap): none stashed twice, the 500 new ones once, the spill emptied`, a);
  ok(b.twice === 500, `⑤a RED CONTROL (a copy whose cap keeps the OLDEST ${CAP} rids): ${b.twice} of the 500 stashed a second time`, b);
}
{ // (b) A HARD STOP INSIDE THE REPLAY, for real: a child hub, killed between two of its reads, then a second start
  const NC = 100000, linesC = []; for (let k = 0; k < NC; k++) linesC.push(JSON.stringify({ rid: 'req_c' + String(k).padStart(6, '0'), ts: NOW - 3600e3 + k, acct: 'sub-true', acctKnown: true }) + '\n');
  const bodyC = linesC.join('');
  const child = path.join(ROOT, 'child.cjs');
  fs.writeFileSync(child, `'use strict';
const fs = require('fs'), path = require('path');
const [modPath, dataDir, mode] = process.argv.slice(2);
const W = require(${JSON.stringify(path.join(REPO, 'src/store-writer.js'))}).storeWriter();
const ORG = ${JSON.stringify(ORG)}, groups = new Map([['org:' + ORG, { accountIds: ['sub-true'] }]]);
const stash = path.join(dataDir, 'usage-history', 'otel-truth.ndjson'), spill = path.join(dataDir, 'usage-history', 'otel-truth.pending.ndjson');
let oi = null, reads = 0;
if (mode === 'A') {   // THE STOP, placed inside the replay: at its second read of the stash, once the waiting posts are on disk
  const open0 = fs.promises.open;
  fs.promises.open = async function (p, ...a) {
    const h = await open0.call(this, p, ...a);
    if (String(p) === stash) { const r0 = h.read.bind(h); h.read = async (...x) => { if (++reads === 2) { await W.durable(spill, { timeoutMs: 5000 }); fs.writeFileSync(path.join(dataDir, 'killed-at'), String(oi.stats().rids)); process.kill(process.pid, 'SIGKILL'); await new Promise(() => { }); } return r0(...x); }; }
    return h;
  };
}
const REC = (rid) => ({ timeUnixNano: String(Date.now() - 60000) + '000000', body: { stringValue: 'claude_code.api_request' }, attributes: Object.entries({ 'session.id': { stringValue: 'sess-c' }, 'organization.id': { stringValue: ORG }, 'event.name': { stringValue: 'api_request' }, model: { stringValue: 'm' }, input_tokens: { intValue: 1 }, output_tokens: { intValue: 1 }, cost_usd: { doubleValue: 0 }, request_id: { stringValue: rid } }).map(([key, value]) => ({ key, value })) });
const PAYLOAD = (recs) => ({ resourceLogs: [{ resource: { attributes: [] }, scopeLogs: [{ scope: { name: 'x' }, logRecords: recs }] }] });
oi = require(modPath).create({ dataDir, PORT: 0, getUsageHistory: () => null, identityGroups: () => groups, listAccounts: () => [], serverSetting: () => undefined });
// THE EXPORTER: three posts at the start (in A they are never answered — it stops first; B gets them again)
const posts = ['req_post1', 'req_post2', 'req_post3'].map((rid) => oi._ingest(PAYLOAD([REC(rid)])));
(async () => {
  await Promise.all(posts); await oi.replayed;
  await W.durable(stash, { timeoutMs: 5000 });
  for (let k = 0; k < 200; k++) { let t = null; try { t = fs.readFileSync(spill, 'utf8'); } catch { t = ''; } if (t === '') break; await new Promise((r) => setTimeout(r, 25)); await W.durable(spill, { timeoutMs: 1000 }).catch(() => false); }
  process.stdout.write(JSON.stringify({ rids: oi.stats().rids, stashed: oi.stats().stashed }) + '\\n');
  process.exit(0);
})();
`);
  const runChild = (modPath, d, mode) => new Promise((resolve) => {
    const c = spawn(process.execPath, [child, modPath, d, mode], { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env } });
    let out = '', err = ''; c.stdout.on('data', (b) => { out += b; }); c.stderr.on('data', (b) => { err += b; });
    const t = setTimeout(() => { try { c.kill('SIGKILL'); } catch { } }, 30000);
    c.on('exit', (code, signal) => { clearTimeout(t); resolve({ code, signal, out: out.trim(), err: err.trim().slice(-400) }); });
  });
  // the stop (one child), then the start over the state it left — twice from the same state (a copy): the cure's start, and the control's
  const d = path.join(ROOT, 'c-cure'), h = path.join(d, 'usage-history'); fs.mkdirSync(h, { recursive: true });
  fs.writeFileSync(path.join(h, 'otel-truth.ndjson'), bodyC);
  const A = await runChild(INGEST, d, 'A');
  const killedAt = (() => { try { return Number(fs.readFileSync(path.join(d, 'killed-at'), 'utf8')); } catch { return -1; } })();
  const afterA = fs.readFileSync(path.join(h, 'otel-truth.ndjson'), 'utf8'), spillA = (() => { try { return fs.readFileSync(path.join(h, 'otel-truth.pending.ndjson'), 'utf8'); } catch { return ''; } })();
  const d2 = path.join(ROOT, 'c-nodedupe'); fs.cpSync(d, d2, { recursive: true });
  const startAgain = async (modB, dd) => {
    const B = await runChild(modB, dd, 'B'), t = fs.readFileSync(path.join(dd, 'usage-history', 'otel-truth.ndjson'), 'utf8');
    return { A: { signal: A.signal, killedAt, stashKept: afterA === bodyC, spilled: ['req_post1', 'req_post2', 'req_post3'].filter((x) => countIn(spillA, x) === 1).length }, B: { code: B.code, out: B.out, err: B.code ? B.err : '' }, oldKept: t.startsWith(bodyC), once: ['req_post1', 'req_post2', 'req_post3'].map((x) => countIn(t.slice(bodyC.length), x)) };
  };
  const s = await startAgain(INGEST, d), r = await startAgain(NODEDUPE, d2);
  ok(s.A.signal === 'SIGKILL' && s.A.killedAt > 0 && s.A.killedAt < NC && s.A.stashKept && s.A.spilled === 3,
    `⑤b setup: the first start was KILLED inside its replay (${s.A.killedAt} of ${NC} rids replayed), its stash untouched, the three waiting posts in its spill`, s.A);
  ok(s.B.code === 0 && s.oldKept && s.once.every((n) => n === 1), `⑤b the second start, the posts sent again: the stash is its old ${bodyC.length} bytes plus ONE line per record (${s.once.join(', ')})`, s);
  ok(r.A.signal === 'SIGKILL' && r.oldKept && r.once.every((n) => n === 2), `⑤b RED CONTROL (the second start over a copy with the rid dedupe cut out): every record twice (${r.once.join(', ')})`, r);
}

console.log('⑥ the road with no caller');
{
  const strip = (t) => t.split('\n').map((l) => (/^\s*(\/\/|\*|\/\*)/.test(l) ? '' : l.replace(/(^|\s)\/\/.*$/, '$1'))).join('\n');
  const code = strip(SRC), rel = strip(RELEASE);
  const SYNC = /\bfs\.(?:readFileSync|readSync|existsSync|statSync|renameSync)\(\s*file\b|\bfinishReplay\b/g;
  ok(!(code.match(SYNC) || []).length && (rel.match(SYNC) || []).length >= 4, `⑥ no synchronous read of the stash left in the ingest (the release had ${(rel.match(SYNC) || []).length}: finishReplay, its existsSync + readFileSync, the trim's statSync + renameSync)`, code.match(SYNC));
  const d = path.join(ROOT, 'f'), h = path.join(d, 'usage-history'); fs.mkdirSync(h, { recursive: true });
  const lines = []; for (let k = 0; k < 20000; k++) lines.push(JSON.stringify({ rid: 'req_f' + String(k).padStart(6, '0'), ts: NOW - 3600e3 + k, acct: 'sub-true', acctKnown: true }) + '\n');
  fs.writeFileSync(path.join(h, 'otel-truth.ndjson'), lines.join(''));
  const inTick = (mod) => {
    let bytes = 0; const rfs0 = fs.readFileSync;
    fs.readFileSync = function (p, ...a) { const r = rfs0.call(this, p, ...a); if (String(p).includes('otel-truth')) bytes += r.length; return r; };
    let oi, out; try { oi = make(mod, d); out = oi.observedOrgForRid('req_f019999'); } finally { fs.readFileSync = rfs0; }
    return { oi, out, bytes, promise: !!(out && typeof out.then === 'function') };
  };
  const c = inTick(mods.cure), cv = await c.out, r = inTick(mods.release);
  ok(c.promise && c.bytes === 0 && cv === 'sub-true', `⑥ observedOrgForRid answers a PROMISE, ${c.bytes} stash bytes read in the caller's tick, the answer once the replay ended (${cv})`);
  ok(!r.promise && r.bytes > 1048576 && r.out === 'sub-true', `⑥ RED CONTROL (the release): answered in the caller's tick (${r.out}) after reading ${r.bytes} stash bytes there`);
  await c.oi.replayed; await r.oi.replayed; forget(d);
}

console.log('⑦ the migration\'s read');
{
  const { runMigrations } = require(path.join(REPO, 'src/migration-runner.js'));
  const BFSRC = fs.readFileSync(path.join(REPO, 'src/ledger-slot-backfill.js'), 'utf8');
  const a7 = BFSRC.indexOf('function readOtelStash(historyDir) {'), b7 = a7 < 0 ? -1 : BFSRC.indexOf('\n}\n', a7);
  ok(a7 > 0 && b7 > a7, '⑦ premise: src/ledger-slot-backfill.js has its readOtelStash');
  const RELEASE_READ = /* stale-pins: kept — the release's read, planted back as the RED control */ `function readOtelStash(historyDir) {
  const byRid = new Map(), bySid = new Map();
  let rows = 0;
  let text = ''; try { text = fs.readFileSync(path.join(historyDir, 'otel-truth.ndjson'), 'utf-8'); } catch { return { byRid, bySid, rows }; }
  for (const line of text.split('\\n')) {
    if (!line) continue;
    let r; try { r = JSON.parse(line); } catch { continue; }
    if (!r || !r.acctKnown || !r.rid) continue;
    rows++;
    const acct = r.acct ?? null;
    if (!byRid.has(r.rid)) byRid.set(r.rid, { acct, sid: r.sid || null, ts: Number(r.ts) || 0 });
    if (r.sid) { const l = bySid.get(r.sid) || []; l.push({ acct, ts: Number(r.ts) || 0 }); bySid.set(r.sid, l); }
  }
  return { byRid, bySid, rows };
}`;   // src/ledger-slot-backfill.js at 944de13f9, verbatim but one comment
  const cureBF = require(path.join(REPO, 'src/ledger-slot-backfill.js'));
  const relBF = M.load('src/ledger-slot-backfill.js', anchored(BFSRC, BFSRC.slice(a7, b7 + 2), RELEASE_READ, 'the release\'s read'), 'release-read');
  const once = (mod, d) => { const warns = []; const r = runMigrations({ ledgerPath: path.join(d, 'migrations.json'), migrations: [{ id: BACKFILL, run: () => mod.backfillLedgerBySlot({ dataDir: d, id: BACKFILL }) }], log: () => { }, warn: (l) => warns.push(l) }); let L = {}; try { L = JSON.parse(fs.readFileSync(path.join(d, 'migrations.json'), 'utf8')); } catch { } return { status: r[0] && r[0].status, error: r[0] && r[0].error, recorded: !!(L.applied && L.applied[BACKFILL]), stash: L.reports && L.reports[BACKFILL] ? L.reports[BACKFILL].stash : null, warns }; };
  const mkD = (tag) => { const d = path.join(ROOT, 'g-' + tag); fs.mkdirSync(path.join(d, 'usage-history', 'otel-truth.ndjson'), { recursive: true }); return d; };   // a DIRECTORY where the stash is: its read fails (EISDIR)
  const dC = mkD('cure'), c1 = once(cureBF, dC);
  fs.rmSync(path.join(dC, 'usage-history', 'otel-truth.ndjson'), { recursive: true, force: true });
  fs.writeFileSync(path.join(dC, 'usage-history', 'otel-truth.ndjson'), JSON.stringify({ rid: 'req_u', ts: NOW, acctKnown: false }) + '\n');
  const c2 = once(cureBF, dC);
  ok(c1.status === 'failed' && !c1.recorded && /EISDIR|directory/i.test(String(c1.error)) && c2.status === 'ran' && c2.recorded,
    `⑦ a stash whose read FAILS: the migration failed by the runner's law (${c1.status}, not recorded: ${c1.error}); the next start, its stash readable, records it run (${c2.status})`, { c1, c2 });
  const r1 = once(relBF, mkD('release'));
  ok(r1.status === 'ran' && r1.recorded && r1.stash === 0, `⑦ RED CONTROL (the release's read): the throw swallowed — recorded as RUN with ${r1.stash} stash rows over a stash it never read`, r1);
  const MIG = fs.readFileSync(path.join(REPO, 'src/server/migrations.js'), 'utf8'), row = MIG.slice(MIG.indexOf(`id: '${BACKFILL}'`), MIG.indexOf('const rep = backfillLedgerBySlot(', MIG.indexOf(`id: '${BACKFILL}'`)) + 1);
  ok(MIG.includes(`id: '${BACKFILL}'`) && row.length > 1 && !/\btry\s*\{/.test(row.slice(row.indexOf('run() {'))) && SRC.includes(`const BACKFILL_ID = '${BACKFILL}';`),
    `⑦ the hub's row runs the backfill with no catch of its own (a throw reaches the runner), and the ingest's keep rule names the same migration id`);
}
console.log('⑧ the writer\'s rewrite job (src/store-writer-worker.js rewriteJob, src/store-writer.js partsOf)');
{
  const { writeJob } = require(path.join(REPO, 'src/store-writer-worker.js'));
  const { partsOf } = require(path.join(REPO, 'src/store-writer.js'));
  const d = path.join(ROOT, 'h'); fs.mkdirSync(d, { recursive: true });
  const f = path.join(d, 's.ndjson'), tmp = f + '.tmp-t';
  const place = () => { fs.writeFileSync(f, 'a1\nb22\nc333\nd4444'); fs.appendFileSync(f, '\nE5\n'); };   // 17 bytes read by the replay (its last line unterminated), then an append
  const job = (over = {}) => { const p = partsOf({ rewrite: { ranges: Float64Array.from([3, 7, 12, 18]), size: 17 }, then: 'F6\n' }); return { file: f, tmp, parts: p.parts, append: false, rewrite: p.rewrite, ...over }; };
  place(); writeJob(job());
  ok(fs.readFileSync(f, 'utf8') === 'b22\nd4444\n\nE5\nF6\n' && !fs.existsSync(tmp), 'the kept ranges, the unterminated last kept line given its newline, the bytes appended after the read, then the job\'s own lines — renamed over the file');
  const tryJob = (fsx, m) => { place(); const before = fs.readFileSync(f, 'utf8'); let err = null; try { writeJob(m, fsx); } catch (e) { err = e; } try { fs.unlinkSync(tmp); } catch { } return { code: err && err.code, whole: fs.readFileSync(f, 'utf8') === before }; };
  let n = 0; const shortFs = { ...fs, writeSync: (...a) => (++n > 1 ? 0 : fs.writeSync(...a)) };
  const a = tryJob(shortFs, job()), b = tryJob(fs, job({ rewrite: { ranges: Float64Array.from([3, 7]), size: 400 } })), c = tryJob(fs, job({ rewrite: { ranges: Float64Array.from([3, 30]), size: 17 } }));
  ok(a.code === 'ESHORT' && a.whole && b.code === 'ESHRUNK' && b.whole && c.code === 'EBADRANGE' && c.whole, `every byte or nothing: a short write (${a.code}), a file shorter than the bytes its ranges came from (${b.code}), a range out of it (${c.code}) — each fails, the file whole as it was`, { a, b, c });
  fs.writeFileSync(f, 'a1\nb22\n'); fs.appendFileSync(f, 'E5');   // 7 bytes read; an append past them that ended torn
  const p2 = partsOf({ rewrite: { ranges: Float64Array.from([0, 3]), size: 7 }, then: 'F6\n' });
  writeJob({ file: f, tmp, parts: p2.parts, append: false, rewrite: p2.rewrite });
  ok(fs.readFileSync(f, 'utf8') === 'a1\nE5\nF6\n', 'bytes past the read that end torn get their newline before the job\'s own lines');
  let bad = null; try { partsOf({ rewrite: { ranges: [3, 7], size: 17 } }); } catch (e) { bad = e.code; }
  ok(bad === 'EBADBYTES', `a rewrite whose ranges are not a Float64Array of pairs is that store's failed write (${bad})`);
}
console.log('⑨ a torn tail');
{
  const tornRun = async (mod, tag, tail) => {
    const d = path.join(ROOT, 'i-' + tag), h = path.join(d, 'usage-history'); fs.mkdirSync(h, { recursive: true });
    const stash = path.join(h, 'otel-truth.ndjson');
    fs.writeFileSync(stash, JSON.stringify({ rid: 'req_i0', ts: NOW - 3600e3, acct: 'sub-true', acctKnown: true }) + '\n' + tail);
    const oi = make(mod, d); await oi.replayed;
    const a = await callLogs(oi, stash, 'req_post_torn');
    const line = fs.readFileSync(stash, 'utf8').split('\n').find((l) => l.includes('req_post_torn')) || '';
    let own = false; try { own = JSON.parse(line).rid === 'req_post_torn'; } catch { }
    forget(d);
    return { code: a.code, own };
  };
  const t1 = await tornRun(mods.cure, 'short', '{"rid":"req_torn","ts":'), t2 = await tornRun(mods.cure, 'long', 'x'.repeat(READ + 1024)), tr = await tornRun(mods.release, 'release', '{"rid":"req_torn","ts":');
  ok(t1.own && t2.own && t1.code === 200 && t2.code === 200, `⑨ a stash ending in a torn line — short, or longer than a read (skipped whole) — gets the next post's line on a line of its own`, { t1, t2 });
  ok(!tr.own, '⑨ RED CONTROL (the release): its first append was glued onto the torn tail — the record unreadable', tr);
}
report();

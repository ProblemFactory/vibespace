#!/usr/bin/env node
// test-otel-replay-measure.mjs — HEAVY (in-process; ~1 GB written twice, ~1 GB resident on the release's code): THE STORED-
// EVENTS REPLAY AT A START, measured over a PLACED stash of the owner's kind (row B-360d, lane hub-loop-stalls, 主开发's r713 /
// r725 / r738). THE OWNER'S STASH on 11-20 (counted by the coordinator, lines and megabytes only): 476 631 564 bytes,
// 1 019 053 lines (468 bytes on average, ~25 000 a day, the oldest 43 days back); 1 017 823 known-org lines and 1 230 unknown;
// inside 30 days 746 418 known lines (349.5 MB) and every unknown one. The release read all of it into ONE buffer at every
// start, kept an uncapped rid map while it replayed, joined the kept lines in ONE turn, and skipped its trim whenever the
// file grew meanwhile (a busy hub: always).
// PART 1 — THE REPLAY. A stash placed to those proportions (made-up records of the REAL line shape: the parsed record of
// src/otel-truth.js + what src/server/otel-ingest.js adds), oldest first; a spill of known-org records waiting beside it (a
// hub stopped mid-replay leaves one: the start is a BUSY one, the drain appends while the trim is due); the migrations ledger
// recording 2026-09-backfill-ledger-by-slot as run (the owner's case: the count rule). The REAL ingest starts over them.
// PRINTED: the bytes and lines placed; what today's 30-day rule and the count rule each keep; the loop's turns (a 1 ms ticker:
// bands, every turn over 50 ms, the longest); the resident memory before / at its peak / after; the rid map's largest size
// WHILE it replays; the trim's outcome. JUDGED: no turn over 250 ms; the map within its cap while it replays; THE TRIM LANDS
// on that busy start (r725 a) and keeps exactly the count rule's lines plus what was appended.
// PART 2 — THE MIGRATION'S READ (r725 b). A stash past the runtime's longest string (536 870 888 characters) is read by
// src/ledger-slot-backfill.js readOtelStash: every known row comes back. Its RED control, the release's read verbatim (one
// readFileSync into one string): the throw is swallowed and it answers «no stash» (0 rows).
// Env: VS_STASH_BYTES (default 480 000 000), VS_STASH_OLD_SHARE (default 0.266 — the owner's lines past 30 days),
// VS_LONG_BYTES (default 540 000 000; 0 skips part 2, said).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { checker } from './lib/check.mjs';

const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { ok, report } = checker();
const num = (v, d) => (v != null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : d);
const TARGET = num(process.env.VS_STASH_BYTES, 480e6), OLD_SHARE = num(process.env.VS_STASH_OLD_SHARE, 0.266), LONG = num(process.env.VS_LONG_BYTES, 540e6);
const DAY = 86400e3, NOW = Date.now(), CAP = 60000, UNKNOWN_EVERY = 1000, V8_LONGEST = 536870888;
// THE PLACED FILES LIVE ON DISK (主开发 r915's MUST): the scratch roots' DISK one (src/fixture-guard.js TMP_ROOTS[1], /var/tmp) —
// never the system temp folder, which on the hub box is memory — and are removed at EVERY exit: the end, a red, a throw, a signal
const DISK = require('../src/fixture-guard.js').TMP_ROOTS[1];   // relative to this file: the scratch roots' second, the disk one
const ROOT = fs.mkdtempSync(path.join(DISK, 'vs-otel-replay-'));
const endRoot = () => { try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (e) { process.stderr.write(`the scratch ${ROOT} could not be removed: ${e.message}\n`); } };
process.on('exit', endRoot);
for (const [sig, n] of [['SIGINT', 2], ['SIGTERM', 15], ['SIGHUP', 1]]) process.on(sig, () => { endRoot(); process.exit(128 + n); });
const say = (x) => console.log('  · ' + x);
const mib = (b) => (b / 1048576).toFixed(1) + ' MiB';
const ORGS = [0, 1, 2, 3].map((k) => '0b5e7d20-0000-4000-8000-0000000000' + String(k).padStart(2, '0'));
const ridOf = (i) => 'req_011CV' + String(i).padStart(24, '0');

/** one record of the parsed api_request shape (src/otel-truth.js) */
const recOf = (i, ts) => ({
  event: 'api_request', ts, rid: ridOf(i), sid: 'sess-' + String(i % 5000).padStart(6, '0') + '-0000-4000-8000-000000000000',
  orgUuid: ORGS[i % 4], accountUuid: 'a1c0ffee-0000-4000-8000-00000000' + String(i % 4).padStart(4, '0'),
  email: 'member' + (i % 4) + '@team-account.example.invalid', model: i % 3 ? 'claude-opus-5-5' : 'claude-sonnet-5-5',
  i: 1000 + (i % 9000), o: 200 + (i % 4000), cr: 50000 + (i % 190000), cw: i % 5000, costUsd: Math.round((i % 1000) * 1234.567) / 1e6, cliVersion: '2.1.328',
});
/** one stash line: the record + what the ingest adds; `unknown` = an org this hub does not know (no acct, acctKnown false) */
const lineOf = (i, ts, unknown) => JSON.stringify({ ...recOf(i, ts), ...(unknown ? { acctKnown: false } : { acct: 'sub-' + (i % 4), acctKnown: true, attributed: 'sub-' + (i % 4), labelMatchesSlot: true }) }) + '\n';
/** a stash of `target` bytes, oldest first: the first `oldShare` of its lines 31+ days back, the rest spread over 29 days,
 *  every UNKNOWN_EVERY-th line inside the horizon an unknown org → its counts, and the bytes of each kind of line */
function placeStash(file, target, oldShare) {
  const estLines = Math.ceil(target / lineOf(0, NOW, false).length), oldN = Math.floor(estLines * oldShare), step = (29 * DAY) / Math.max(1, estLines - oldN);
  const P = { bytes: 0, lines: 0, oldN, oldBytes: 0, unknown: 0, unknownBytes: 0, known: [] };   // known: the byte length of each known line inside the horizon, in file order
  const fd = fs.openSync(file, 'w');
  let slab = [], slabBytes = 0;
  while (P.bytes < target) {
    const i = P.lines, old = i < oldN, unknown = !old && i % UNKNOWN_EVERY === 0;
    const ts = old ? NOW - 31 * DAY - (oldN - i) * 1000 : Math.min(NOW - 60e3, NOW - 29 * DAY + (i - oldN) * step);
    const l = lineOf(i, Math.round(ts), unknown);
    if (old) P.oldBytes += l.length; else if (unknown) { P.unknown++; P.unknownBytes += l.length; } else P.known.push(l.length);
    slab.push(l); slabBytes += l.length; P.bytes += l.length; P.lines++;
    if (slabBytes >= 8e6) { fs.writeSync(fd, slab.join('')); slab = []; slabBytes = 0; }
  }
  if (slab.length) fs.writeSync(fd, slab.join(''));
  fs.closeSync(fd);
  return P;
}

console.log(`the stored-events replay at a start, over a placed stash of ${TARGET} bytes (row B-360d)`);
console.log('§1 THE REPLAY (a busy start: a spill waits; the migration recorded as run)');
{
  const dataDir = path.join(ROOT, 'data'), hist = path.join(dataDir, 'usage-history'), file = path.join(hist, 'otel-truth.ndjson');
  fs.mkdirSync(hist, { recursive: true });
  const P = placeStash(file, TARGET, OLD_SHARE);
  const SPILL = 2000;
  { const s = []; for (let k = 0; k < SPILL; k++) s.push(JSON.stringify(recOf(P.lines + k, NOW - 30e3)) + '\n'); fs.writeFileSync(path.join(hist, 'otel-truth.pending.ndjson'), s.join('')); }
  fs.writeFileSync(path.join(dataDir, 'migrations.json'), JSON.stringify({ applied: { '2026-09-backfill-ledger-by-slot': NOW - 60 * DAY } }));
  const size0 = fs.statSync(file).size;
  const inHorizon = P.bytes - P.oldBytes, countKept = P.known.slice(-CAP).reduce((n, b) => n + b, 0) + P.unknownBytes;
  say(`THE PLACED STASH: ${P.bytes} bytes (${mib(P.bytes)}), ${P.lines} lines (${(P.bytes / P.lines).toFixed(0)} bytes on average) — ${P.oldN} past the 30-day horizon (${mib(P.oldBytes)}); inside it ${P.known.length} known and ${P.unknown} unknown-org lines; the spill: ${SPILL} known-org records`);
  say(`WHAT EACH RULE KEEPS of it: today's 30-day rule ${inHorizon} bytes (${mib(inHorizon)}, ${P.known.length + P.unknown} lines); the count rule (the newest ${CAP} known + every unknown inside 30 days) ${countKept} bytes (${mib(countKept)}, ${Math.min(CAP, P.known.length) + P.unknown} lines)`);
  ok(size0 === P.bytes, `the stash on disk is the bytes placed (${size0})`, size0);
  // the module and its dependencies loaded BEFORE the ticker: a first require is the suite's own turn, never the replay's
  const OI = require(path.join(REPO, 'src/server/otel-ingest.js'));
  const groups = new Map(ORGS.map((o, k) => ['org:' + o, { accountIds: ['sub-' + k] }]));
  require(path.join(REPO, 'src/store-writer.js')).storeWriter();
  // THE TICKER: a 1 ms interval in the timers phase; a gap is a turn the loop could not take a timer in
  const turns = [], bands = { '≤5': 0, '≤20': 0, '≤50': 0, '≤100': 0, '≤250': 0, '>250': 0 };
  let ingest = null, last = performance.now(), rssPeak = 0, abPeak = 0, mapPeak = 0, n = 0, longest = 0;
  const t0 = performance.now(), rss0 = process.memoryUsage.rss();
  const tick = setInterval(() => {
    const now = performance.now(), gap = now - last; last = now;
    bands[gap <= 5 ? '≤5' : gap <= 20 ? '≤20' : gap <= 50 ? '≤50' : gap <= 100 ? '≤100' : gap <= 250 ? '≤250' : '>250']++;
    if (gap > longest) longest = gap;
    if (gap > 50) turns.push({ at: Math.round(now - t0), ms: Math.round(gap) });
    const r = process.memoryUsage.rss(); if (r > rssPeak) rssPeak = r;
    if (++n % 10 === 0) {
      const ab = process.memoryUsage().arrayBuffers; if (ab > abPeak) abPeak = ab;
      if (ingest) { const s = ingest.stats().rids; if (s > mapPeak) mapPeak = s; }
    }
  }, 1);
  let replayMs = null, ridsAfter = null, trim = 'no rewrite within 120 s', sizeAfter = null, trimMs = null;
  try {
    ingest = OI.create({ dataDir, PORT: 0, getUsageHistory: () => null, identityGroups: () => groups, listAccounts: () => [], serverSetting: () => undefined });
    await ingest.replayed;
    replayMs = Math.round(performance.now() - t0);
    ridsAfter = ingest.stats().rids;
    // THE TRIM: the file shrinks (renamed over it), or the release's own temp appears and goes with the file as it was (skipped)
    let tmpSeen = false;
    const tEnd = performance.now() + 120000;
    while (performance.now() < tEnd) {
      const has = fs.existsSync(file + '.tmp'); tmpSeen ||= has;
      const s = fs.statSync(file).size;
      if (s < size0) { sizeAfter = s; trim = 'rewrote the stash'; break; }
      if (tmpSeen && !has) { sizeAfter = s; trim = 'SKIPPED — the file grew while the kept lines were written (an append landed)'; break; }
      await new Promise((r) => setTimeout(r, 50));
    }
    trimMs = Math.round(performance.now() - t0);
    await new Promise((r) => setTimeout(r, 1000));   // the turns after it
  } finally {
    clearInterval(tick);
  }
  const rss1 = process.memoryUsage.rss();
  const top = turns.slice().sort((a, b) => b.ms - a.ms).slice(0, 12);
  say(`the replay: ${replayMs} ms; THE MAP: at most ${mapPeak} rids WHILE it replayed, ${ridsAfter} after; THE TRIM ${trim}${sizeAfter != null ? ` (${size0} → ${sizeAfter} bytes)` : ''} by ${trimMs} ms`);
  say(`THE LOOP: ${n} ticks — ${Object.entries(bands).map(([k, v]) => `${k} ms: ${v}`).join(' · ')}; the longest turn ${Math.round(longest)} ms`);
  say(`THE TURNS OVER 50 ms (ms from the start: length): ${turns.slice(0, 40).map((x) => `${x.at}: ${x.ms}`).join(', ') || 'none'}${turns.length > 40 ? ` … ${turns.length} in all` : ''}`);
  say(`THE MEMORY (resident): before ${mib(rss0)} · peak ${mib(rssPeak)} (+${mib(rssPeak - rss0)}) · after ${mib(rss1)}; the buffers' peak ${mib(abPeak)}`);
  ok(longest <= 250, `no loop turn over 250 ms while ${mib(P.bytes)} of stash replayed and trimmed (the longest: ${Math.round(longest)} ms)`, top);
  ok(mapPeak > 0 && mapPeak <= CAP && ridsAfter <= CAP, `the map stays within its cap WHILE it replays (at most ${mapPeak} rids, the cap ${CAP})`, { mapPeak, ridsAfter });
  // what the trim kept, read back line by line (the suite's own read of a file now ~30 MB)
  let kept = null;
  if (trim === 'rewrote the stash') {
    kept = { known: 0, unknown: 0, old: 0, spill: 0, firstKnown: null, bad: 0 };
    for (const l of fs.readFileSync(file, 'utf8').split('\n')) {
      if (!l) continue;
      let r; try { r = JSON.parse(l); } catch { kept.bad++; continue; }
      const i = Number(String(r.rid).slice(9));
      if (i >= P.lines) kept.spill++; else if (i < P.oldN) kept.old++; else if (r.acctKnown) { kept.known++; if (kept.firstKnown == null) kept.firstKnown = i; } else kept.unknown++;
    }
    say(`THE KEPT LINES: ${kept.known} known (the oldest of them line ${kept.firstKnown}), ${kept.unknown} unknown, ${kept.old} past the horizon, ${kept.spill} drained from the spill, ${kept.bad} unreadable`);
  }
  ok(trim === 'rewrote the stash', `THE TRIM LANDS on a busy start (the drain appends while it is due): ${trim}`, trim);
  ok(!!kept && kept.known === Math.min(CAP, P.known.length) && kept.unknown === P.unknown && kept.old === 0 && kept.spill === SPILL && kept.bad === 0,
    `it keeps the count rule's lines exactly — the newest ${CAP} known, all ${P.unknown} unknown, none past the horizon — and the ${SPILL} the drain appended`, kept);
  fs.rmSync(path.join(ROOT, 'data'), { recursive: true, force: true });
}

console.log('§2 THE MIGRATION\'S READ of a stash past the runtime\'s longest string');
if (!(LONG > 0)) say('SKIPPED — VS_LONG_BYTES=0');
else {
  const hist = path.join(ROOT, 'long', 'usage-history'), file = path.join(hist, 'otel-truth.ndjson');
  fs.mkdirSync(hist, { recursive: true });
  const P = placeStash(file, LONG, 0);
  const knownAll = P.known.length;
  say(`THE PLACED STASH: ${P.bytes} bytes, ${P.lines} lines (${knownAll} known) — past the longest string by ${P.bytes - V8_LONGEST} bytes`);
  ok(P.bytes > V8_LONGEST, `the file is past the runtime's longest string (${P.bytes} > ${V8_LONGEST})`, P.bytes);
  // THE RELEASE'S READ, verbatim (src/ledger-slot-backfill.js at 944de13f9, the function's first lines) — the RED control
  const releaseRead = (historyDir) => {
    const byRid = new Map(), bySid = new Map();
    let rows = 0;
    let text = ''; try { text = fs.readFileSync(path.join(historyDir, 'otel-truth.ndjson'), 'utf-8'); } catch { return { byRid, bySid, rows }; }
    for (const line of text.split('\n')) {
      if (!line) continue;
      let r; try { r = JSON.parse(line); } catch { continue; }
      if (!r || !r.acctKnown || !r.rid) continue;
      rows++;
      const acct = r.acct ?? null;
      if (!byRid.has(r.rid)) byRid.set(r.rid, { acct, sid: r.sid || null, ts: Number(r.ts) || 0 });
      if (r.sid) { const l = bySid.get(r.sid) || []; l.push({ acct, ts: Number(r.ts) || 0 }); bySid.set(r.sid, l); }
    }
    return { byRid, bySid, rows };
  };
  const red = releaseRead(hist);
  ok(red.rows === 0, `RED CONTROL: the release's read swallows the throw and answers «no stash» (${red.rows} rows)`, red.rows);
  const { readOtelStash } = require(path.join(REPO, 'src/ledger-slot-backfill.js'));
  const rssA = process.memoryUsage.rss(), tA = performance.now();
  let got = null, threw = null;
  try { got = readOtelStash(hist); } catch (e) { threw = e; }
  const msA = Math.round(performance.now() - tA);
  say(`the tree's read: ${threw ? 'THREW ' + threw.message : `${got.rows} rows, ${got.byRid.size} rids, ${got.bySid.size} sessions`} in ${msA} ms (resident ${mib(rssA)} → ${mib(process.memoryUsage.rss())})`);
  ok(!threw && !!got && got.rows === knownAll && got.byRid.size === knownAll, `the tree's read takes every known row of it by rows (${got ? got.rows : threw.message} of ${knownAll})`, got && got.rows);
}
fs.rmSync(ROOT, { recursive: true, force: true });
report();

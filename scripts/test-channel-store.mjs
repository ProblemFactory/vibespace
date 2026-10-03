#!/usr/bin/env node
// THE CHANNEL STORE (docs/design-communication-panel.zh.md §5 + §5.1; gate row
// `test-channel-store`).
//
// THE LEG THIS SUITE EXISTS FOR is §5.1's: TWO CONCURRENT PASSES, each
// advancing its OWN cursor, with a READ-MODIFY-WRITE copy as the negative
// control — because `writeJsonAtomic` is atomic at the filesystem layer only,
// and the read-modify-write AROUND it is not. Two adapter passes are
// overlapping BY DESIGN (single-flight is per ADAPTER), so a snapshot-compute-
// write-back shape loses whichever landed first. A clobbered ANCHOR advance
// makes the next pass SKIP messages rather than re-read them; a clobbered
// unread count is a silently wrong badge.
//
// Everything here runs against REAL files in a per-pid scratch dir (never a
// machine-global path — scripts/scratch.mjs mints the name from the ONE
// fixture convention in src/fixture-guard.js).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { scratch } from './scratch.mjs';
import { mutantCopies, copiesCensus, sweepLegacy } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? '\n    ' + e : '')); } };

const S = require(path.join(REPO, 'src/channel-store.js'));
const ROOT = scratch('chanstore');
const cleanup = () => { try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch {} };
process.on('exit', cleanup);
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(143); });
fs.rmSync(ROOT, { recursive: true, force: true });

// ── PATCHED-COPY HYGIENE ──────────────────────────────────────────────────
// ⑤b's (and r3's) negative controls load PRE-FIX copies of src/channel-store.js.
// They are written OUTSIDE the tree (scripts/mutant-copy.mjs: this process's
// scratch dir, `require` re-bound on line 1 to the real module's path, so its
// relative requires resolve as a sibling's) and ⑩ measures that while they
// exist. They used to be gitignored siblings, src/.channel-store.prefix-*.js —
// a SIGKILL stranded one, and every src/ scanner running beside this suite read
// a second channel-store. Each control still gets its OWN file (node caches
// modules by resolved path; two controls sharing a name would drive the FIRST
// patch twice) — the helper numbers every copy.
const MUTCS = mutantCopies('channel-store', REPO);
sweepLegacy(REPO, ['src'], /^\.channel-store\.prefix-(\d+)(?:-\d+)?\.js$/);   // what a pre-fix run stranded (dead PIDs only)

let seq = 0;
const mk = (name) => S.createChannelStore({ dir: path.join(ROOT, name || `s${++seq}`) });
const NOW = Date.now();
const rec = (conv, i, at) => ({ id: `a:${conv}:v${i}`, adapterId: 'a', convId: conv, vendorId: `v${i}`, at: at || NOW - (100 - i) * 1000, author: { id: 'u', name: 'U', isSelf: false, isBot: false }, text: `m${i}`, mentions: [], attachments: [], replyTo: null, threadKey: null, raw: {} });

// ── ① append-only log + dedup by vendorId (invariants 1 and 2) ──
{
  const st = mk('append');
  const w1 = st.appendRecords('a', 'c', [rec('c', 1), rec('c', 2), rec('c', 3)]);
  ok(w1.appended === 3 && w1.duplicates === 0, 'a first batch appends everything');
  const w2 = st.appendRecords('a', 'c', [rec('c', 2), rec('c', 3), rec('c', 4)]);
  ok(w2.appended === 1 && w2.duplicates === 2, 'A REPLAYED PAGE IS A NO-OP — Lark\'s anchor semantics guarantee one at every boundary');
  const lines = fs.readFileSync(st.logPath('a', 'c'), 'utf-8').trim().split('\n');
  ok(lines.length === 4 && lines.every((l) => JSON.parse(l).vendorId), 'the log is NDJSON, one record per line (appending stays O(1))');
  const st2 = S.createChannelStore({ dir: st.dir });
  ok(st2.appendRecords('a', 'c', [rec('c', 3)]).duplicates === 1, 'the dedup set REBUILDS from the log tail — a restart does not forget what it already has');
  st.close(); st2.close();
}

// ── ② reading a page ──
{
  const st = mk('read');
  st.appendRecords('a', 'c', Array.from({ length: 20 }, (_, i) => rec('c', i)));
  const tail = st.readTail('a', 'c', { limit: 5 });
  ok(tail.length === 5 && tail[4].vendorId === 'v19' && tail[0].vendorId === 'v15', 'readTail returns the NEWEST n, oldest-first', tail.map((r) => r.vendorId).join(','));
  const before = st.readTail('a', 'c', { limit: 3, before: tail[0].at });
  ok(before.length === 3 && before.every((r) => r.at < tail[0].at), '`before` pages strictly backwards (the window\'s upward scroll)');
  ok(st.readTail('a', 'nope', { limit: 5 }).length === 0, 'a conversation with no log reads as empty, never as a throw');
  ok(st.countSince('a', 'c', tail[2].at) === 2, 'countSince re-derives unread from the log and the read mark (invariant 7: a derived value is never only a stored one)');
  st.close();
}

// ── ③ retention: min(N, M days) with a 7-day FLOOR (invariant 5) ──
{
  const day = 86400e3;
  const st = mk('trim');
  const old = Array.from({ length: 5 }, (_, i) => rec('c', i, NOW - (200 - i) * day));
  const recent = Array.from({ length: 5 }, (_, i) => rec('c', 100 + i, NOW - (3 - i * 0.1) * day));
  st.appendRecords('a', 'c', [...old, ...recent]);
  const t = st.trim('a', 'c');
  ok(t.removed === 5 && t.kept === 5, '200-day-old records are dropped at the 90-day bound', JSON.stringify(t));
  ok(st.readTail('a', 'c', { limit: 99 }).every((r) => r.at > NOW - 90 * day), 'nothing older than the bound survives');

  const st2 = mk('trim-floor');
  st2.appendRecords('a', 'c', Array.from({ length: 12 }, (_, i) => rec('c', i, NOW - (6 - i * 0.4) * day)));
  const t2 = st2.trim('a', 'c', { maxRecords: 3 });
  ok(t2.removed === 0 && t2.kept === 12, 'THE 7-DAY FLOOR beats the record count — the estimator is defined over the last 7 days, so nothing inside it is ever dropped', JSON.stringify(t2));
  const t3 = st2.trim('a', 'c', { maxRecords: 3, floorDays: 0 });
  ok(t3.kept === 3, 'NEGATIVE CONTROL: with the floor removed the same store trims to the record count (the floor is what held, not an inert parameter)', JSON.stringify(t3));
  ok(st2.trim('a', 'nothing-here').kept === 0, 'trimming a log that does not exist is a no-op');
  st.close(); st2.close();
}

// ── ④ §5.1 THE SERIALIZED INDEX OWNER — the leg this suite exists for ──
{
  const st = mk('concurrent');
  // Two passes, exactly as the scheduler runs them: they INTERLEAVE across
  // awaits (single-flight is per adapter, so Lark and Gmail overlap by design).
  const step = () => new Promise((r) => setTimeout(r, 1));
  async function passVia(update, adapterId, convId, anchor, unread) {
    const before = st.index.snapshot();          // a snapshot read is NOT a lock
    await step();
    await update(adapterId, convId, anchor, unread, before);
  }
  const viaDoor = (adapterId, convId, anchor, unread) => st.index.update(() => {
    const e = st.index.entry(adapterId, convId);
    e.anchor = anchor; e.unread = unread;
  });
  await Promise.all([
    passVia(viaDoor, 'lark', 'c1', 'lark-9', 4),
    passVia(viaDoor, 'gmail', 'c2', 'gmail-7', 2),
  ]);
  const ix = st.index.snapshot().conversations;
  ok(ix['lark/c1'].anchor === 'lark-9' && ix['gmail/c2'].anchor === 'gmail-7', 'TWO CONCURRENT PASSES EACH ADVANCE THEIR OWN CURSOR', JSON.stringify(ix));
  ok(ix['lark/c1'].unread === 4 && ix['gmail/c2'].unread === 2, '…and neither loses the other\'s unread count');

  // NEGATIVE CONTROL: the read-modify-write shape around one atomic write.
  // Both passes read the SAME snapshot, mutate their own copy and write it
  // back — the second write erases the first. This is the exact shape
  // `index.update()` exists to make unreachable.
  const rmwDir = path.join(ROOT, 'rmw');
  fs.mkdirSync(rmwDir, { recursive: true });
  const rmwFile = path.join(rmwDir, 'index.json');
  fs.writeFileSync(rmwFile, JSON.stringify({ v: 1, conversations: {} }));
  const viaRmw = async (adapterId, convId, anchor, unread) => {
    const snap = JSON.parse(fs.readFileSync(rmwFile, 'utf-8'));   // READ
    await step();                                                  // …and the other pass runs here
    snap.conversations[`${adapterId}/${convId}`] = { anchor, unread }; // MODIFY
    S.writeJsonAtomic(rmwFile, snap);                              // WRITE (atomic at the fs layer only)
  };
  await Promise.all([
    viaRmw('lark', 'c1', 'lark-9', 4),
    viaRmw('gmail', 'c2', 'gmail-7', 2),
  ]);
  const lost = JSON.parse(fs.readFileSync(rmwFile, 'utf-8')).conversations;
  ok(Object.keys(lost).length === 1, 'NEGATIVE CONTROL: the read-modify-write copy LOSES one pass\'s advance entirely (a clobbered anchor makes the next pass SKIP messages)', JSON.stringify(lost));

  // The door also serializes: a throwing update must not break the chain.
  let after = null;
  await st.index.update(() => { throw new Error('boom'); }).catch(() => {});
  await st.index.update(() => { after = 'ran'; });
  ok(after === 'ran', 'a REJECTED update is handed to its own caller and leaves the chain usable for everyone behind it');
  st.close();
}

// ── ⑤ invariant 4's ORDER: the log is durable before the anchor moves ──
{
  const st = mk('order');
  // A pass that crashes AFTER the append but BEFORE the index update must cost
  // a re-read, never a skip.
  st.appendRecords('a', 'c', [rec('c', 1), rec('c', 2)]);
  // (no index.update — simulate the crash)
  st.close();
  const re = S.createChannelStore({ dir: path.join(ROOT, 'order') });
  ok(re.readTail('a', 'c', { limit: 9 }).length === 2, 'the records are durable');
  ok((re.index.snapshot().conversations['a/c'] || {}).anchor == null, '…and the anchor did NOT move, so the next pass re-reads');
  ok(re.appendRecords('a', 'c', [rec('c', 1), rec('c', 2)]).appended === 0, 'the re-read is absorbed by the dedup (invariant 2) — a crash costs a re-read, never a duplicate');
  re.close();
}

// ── ⑤b THE SET REMEMBERS ONLY WHAT IS DURABLE (r2, CRITICAL) ──
// One transient append failure used to make every record in the batch a
// PERMANENT duplicate: `rememberVendorId` ran inside the selection loop, so a
// throw from `appendFileSync` left the set claiming the log held records it
// never wrote. The next pass reported `appended:0, duplicates:N`, the engine
// read that as a complete pass and advanced the anchor PAST them. Silent,
// permanent message loss with no crash and no error.
{
  const st = mk('durable-dedup');
  const batch = [rec('c', 1), rec('c', 2), rec('c', 3)];
  const fp = st.logPath('a', 'c');
  fs.mkdirSync(fp, { recursive: true });   // a DIRECTORY where the log must be = EISDIR
  let threw = null;
  try { st.appendRecords('a', 'c', batch); } catch (e) { threw = e; }
  ok(threw && /EISDIR|illegal operation|directory/i.test(String(threw.message || threw)),
    'a failed append THROWS rather than reporting success', String(threw && threw.message).slice(0, 80));
  fs.rmdirSync(fp);
  const w = st.appendRecords('a', 'c', batch);
  ok(w.appended === 3 && w.duplicates === 0,
    'THE NEXT PASS STILL WRITES ALL THREE — the set remembers a vendorId only after its bytes are durable', JSON.stringify(w));
  ok(st.readTail('a', 'c', { limit: 9 }).length === 3, '…and they really are on disk');
  st.close();
  // r2's OWN shape (r4): the one throw that lands NOTHING and happens BEFORE
  // the write — a FILE where the adapter DIRECTORY must be makes `mkdirSync`
  // throw at the door — so ⑤i's invalidation, which only fires for a throw
  // INSIDE the write, never sees it. Only the ORDER protects this path.
  const st2 = mk('durable-dedup-door');
  const batch2 = [rec('d', 1), rec('d', 2), rec('d', 3)];
  const dp = path.dirname(st2.logPath('b', 'd'));
  fs.writeFileSync(dp, '');
  let threw2 = null;
  try { st2.appendRecords('b', 'd', batch2); } catch (e) { threw2 = e; }
  ok(threw2 && /^(EEXIST|ENOTDIR)$/.test(String(threw2.code)), 'a throw BEFORE the write (the adapter directory is a file) throws too, and lands nothing', String(threw2 && threw2.code));
  fs.unlinkSync(dp);
  const w2 = st2.appendRecords('b', 'd', batch2);
  ok(w2.appended === 3 && w2.duplicates === 0, '…and the next pass still writes all three — the set claimed nothing, so there was nothing to forget', JSON.stringify(w2));
  st2.close();
}

// ⑤b NEGATIVE CONTROL — a patched copy of the REAL module with the remember
// moved back INSIDE the selection loop must lose the batch. (A patched copy,
// not a hand-written mock: the control has to be the shipped code minus one
// named property.) TWO ARMS SINCE r4, because two layers now guard a throw
// and each owes its own control: reverting r2's ORDER alone leaves ⑤i's
// invalidation standing, and that covers the zero-byte EISDIR throw too (it
// drops the polluted set with everything else) — so the r2-only arm must
// show the belt HOLDING on EISDIR and FAILING on r2's own shape (the throw
// BEFORE the write, which r4 structurally cannot see), and only reverting
// BOTH reproduces r1 on the EISDIR fixture. A control that reverts one layer
// and reproduces nothing is not evidence that the layer is inert.
// SINCE r5 a THIRD layer guards the same throws one step earlier: the strict
// dedup REBUILD refuses an unreadable log (both fixtures here — a directory
// where the log must be, a file where the adapter directory must be — make
// the rebuild's open/read fail, so with r5 standing the set is never built,
// nothing can be polluted, and neither arm below could reproduce anything).
// Both arms therefore run on bytes with r5 stripped as well, so they still
// isolate r2 and r4; r5 owes and has its OWN control (⑤j).
{
  const shipped = fs.readFileSync(path.join(REPO, 'src/channel-store.js'), 'utf-8');
  const src = shipped.replace("if (strict && e.code !== 'ENOENT') throw e; ", '').replace("if (strict) throw e; ", '');
  ok(src !== shipped && (src.match(/throw e/g) || []).length === (shipped.match(/throw e/g) || []).length - 2,
    'NEGATIVE CONTROL setup: r5 (the strict rebuild) is stripped from both arms — it would otherwise refuse both fixtures before the set exists');
  const R2_ONLY = src
    .replace("      inBatch.add(r.vendorId);\n      fresh.push(r);",
             "      rememberVendorId(set, r.vendorId);\n      fresh.push(r);")
    .replace("    // DURABLE NOW — and only now may the set claim to hold them.\n    for (const r of fresh) rememberVendorId(set, r.vendorId);\n", "");
  const BOTH = R2_ONLY.replace("      dedup.delete(`${adapterId}/${convId}`);   // r4: the log is the only witness now\n", "");
  ok(R2_ONLY !== src && !/DURABLE NOW/.test(R2_ONLY) && /inBatch/.test(src) && BOTH !== R2_ONLY,
    'NEGATIVE CONTROL setup: both pre-fix spellings were reconstructed from the shipped bytes (a control that cannot be built proves nothing)');
  // one failed append of each shape, then the retry — on the SAME live store
  const drive = (PS, name) => {
    const st = PS.createChannelStore({ dir: path.join(ROOT, name) });
    const batch = [rec('c', 1), rec('c', 2), rec('c', 3)];
    const fp = st.logPath('a', 'c');
    fs.mkdirSync(fp, { recursive: true });                 // EISDIR: a throw INSIDE the write, zero bytes
    try { st.appendRecords('a', 'c', batch); } catch {}
    fs.rmdirSync(fp);
    const inside = st.appendRecords('a', 'c', batch);
    const dp = path.dirname(st.logPath('b', 'd'));
    fs.writeFileSync(dp, '');                              // EEXIST: a throw BEFORE the write
    try { st.appendRecords('b', 'd', batch); } catch {}
    fs.unlinkSync(dp);
    const before = st.appendRecords('b', 'd', batch);
    const rows = st.readTail('a', 'c', { limit: 9 }).length + st.readTail('b', 'd', { limit: 9 }).length;
    st.close();
    return { inside, before, rows };
  };
  const arms = [['r2-only', R2_ONLY], ['both', BOTH]];
  for (const [arm, PRE] of arms) {
    const pf = MUTCS.write('src/channel-store.js', PRE, 'prefix');
    try {
      const r = drive(require(pf), `durable-dedup-pre-${arm}`);
      if (arm === 'r2-only') {
        ok(r.inside.appended === 3 && r.inside.duplicates === 0,
          'NEGATIVE CONTROL (r2 order reverted, r4 kept, r5 stripped): on the zero-byte EISDIR throw the BELT holds — r4 drops the polluted set with everything else, so the retry still writes all three', JSON.stringify(r.inside));
        ok(r.before.appended === 0 && r.before.duplicates === 3,
          'NEGATIVE CONTROL (r2 order reverted, r4 kept, r5 stripped): on the throw BEFORE the write the whole batch becomes DUPLICATES — r2\'s own shape, which r4 structurally cannot see', JSON.stringify(r.before));
      } else {
        ok(r.inside.appended === 0 && r.inside.duplicates === 3 && r.before.appended === 0 && r.before.duplicates === 3,
          'NEGATIVE CONTROL (r2+r4 reverted, r5 stripped): the r1 copy reports the whole batch as DUPLICATES after one failed append of EITHER shape — the shape that advanced the anchor past nine real messages', JSON.stringify(r));
        ok(r.rows === 0, 'NEGATIVE CONTROL (r2+r4 reverted, r5 stripped): …and both logs are empty, for ever', String(r.rows));
      }
    } finally { /* MUTCS's scratch dir is removed at exit */ }
  }
}

// ── ⑤g A TRUNCATED FINAL LINE MAY NOT SWALLOW THE NEXT RECORD (r3) ──
// The other half of ⑤b. An append is not atomic — node's writeFileSync loops
// write(2) and throws AFTER earlier chunks landed, and a SIGKILL / OOM kill /
// power loss leaves the same bytes — so the log can end in HALF A LINE. ⑤b's
// fixture (a DIRECTORY where the log must be) is the ONE failure that writes
// ZERO bytes, which is why it could not see this: the re-offered batch was
// appended straight onto the fragment, its FIRST record became one
// unparseable line `readTail` skips, and the durable set (correctly, per ⑤b)
// remembered it — every later pass reported it as a duplicate. One message,
// silently, for ever.
{
  const st = mk('partial-line');
  st.appendRecords('a', 'c', [rec('c', 1), rec('c', 2), rec('c', 3)]);
  const fp = st.logPath('a', 'c');
  // the byte state an interrupted append leaves: a HALF line, no trailing \n
  fs.appendFileSync(fp, JSON.stringify(rec('c', 4)).slice(0, 40));
  ok(!fs.readFileSync(fp).subarray(-1).equals(Buffer.from('\n')), 'FIXTURE: the log ends in a partial line (the shape ⑤b\'s EISDIR fixture cannot produce)');
  const re = S.createChannelStore({ dir: st.dir });          // a restart: the set is rebuilt from the tail
  const w = re.appendRecords('a', 'c', [rec('c', 4), rec('c', 5)]);
  ok(w.appended === 2 && w.healed === true, 'the re-offered batch appends BOTH records and SAYS it sealed the fragment first', JSON.stringify(w));
  const served = re.readTail('a', 'c', { limit: 99 }).map((r) => r.vendorId);
  ok(served.join(',') === 'v1,v2,v3,v4,v5', 'EVERY record is served — the fragment stayed as one unparseable line nobody parses, and swallowed nothing', served.join(','));
  const lines = fs.readFileSync(fp, 'utf-8').split('\n').filter(Boolean);
  ok(lines.length === 6 && lines.filter((l) => { try { JSON.parse(l); return false; } catch { return true; } }).length === 1,
    'on disk: five records plus exactly ONE sealed fragment', String(lines.length));
  ok(re.appendRecords('a', 'c', [rec('c', 4), rec('c', 5)]).duplicates === 2, 'a later pass sees v4 as the duplicate it now really is');
  ok(re.appendRecords('a', 'c', [rec('c', 6)]).healed === false, 'a healthy log is not "healed" (the flag is a fact, not a habit)');
  st.close(); re.close();
}

// ⑤g NEGATIVE CONTROL — the shipped module with the sealing writer swapped
// back for the r2 `appendFileSync` must lose v4 for ever.
{
  const src = fs.readFileSync(path.join(REPO, 'src/channel-store.js'), 'utf-8');
  const PRE = src.replace("      healed = appendLines(fp, fresh.map((r) => JSON.stringify(r)).join('\\n') + '\\n');",
                          "      healed = false; fs.appendFileSync(fp, fresh.map((r) => JSON.stringify(r)).join('\\n') + '\\n');");
  ok(PRE !== src, 'NEGATIVE CONTROL setup: the r2 writer was reconstructed from the shipped bytes');
  const pf = MUTCS.write('src/channel-store.js', PRE, 'prefix');
  try {
    const PS = require(pf);
    const st = PS.createChannelStore({ dir: path.join(ROOT, 'partial-line-pre') });
    st.appendRecords('a', 'c', [rec('c', 1), rec('c', 2), rec('c', 3)]);
    const fp = st.logPath('a', 'c');
    fs.appendFileSync(fp, JSON.stringify(rec('c', 4)).slice(0, 40));
    const re = PS.createChannelStore({ dir: st.dir });
    const w = re.appendRecords('a', 'c', [rec('c', 4), rec('c', 5)]);
    const served = re.readTail('a', 'c', { limit: 99 }).map((r) => r.vendorId);
    ok(w.appended === 2 && served.join(',') === 'v1,v2,v3,v5',
      'NEGATIVE CONTROL: the r2 writer reports v4 appended and cannot serve it — its bytes are glued to the fragment', served.join(','));
    ok(re.appendRecords('a', 'c', [rec('c', 4)]).duplicates === 1, 'NEGATIVE CONTROL: …and every later pass calls it a duplicate: dropped for ever');
    st.close(); re.close();
  } finally { /* MUTCS's scratch dir is removed at exit */ }
}

// ── ⑤i A FAILED APPEND THAT STOPPED ON A RECORD BOUNDARY (r4) ──
// The half of ⑤g the seal cannot see. r2 left the dedup set untouched when
// the write threw ("remember only what is durable"), but the bytes that DID
// land are durable too, and the live set did not know it. The seal recovers
// a fragment that is UNPARSEABLE (mid-record); when the interrupted write
// stopped exactly after a record's `}` (sealed → a valid line) or after its
// `\n` (nothing to seal), the SAME process re-offered the batch, appended
// that record AGAIN, and the append-only log served it twice for ever —
// `unread` and paging carrying a phantom message no reader removes. A restart
// was already correct (the set is rebuilt from disk and `readTail` parses a
// final line without `\n`), which is what says the mechanism is the stale
// LIVE set, not the file. Driven through the REAL module with `fs.writeSync`
// landing a prefix and then throwing ENOSPC ONCE — the module's own named
// errno and the short-write shape the r3 header describes; ⑤g's hand-written
// fragment is the mid-record cut only, so it could not see either boundary.
const realWriteSync = fs.writeSync;
function faultNextWrite(landBytes) {
  let armed = true;
  fs.writeSync = function (fd, buf, off, len, pos) {
    if (!armed) return realWriteSync.call(fs, fd, buf, off, len, pos);
    armed = false;
    if (landBytes > 0) realWriteSync.call(fs, fd, buf, off, Math.min(landBytes, len), pos);
    const e = new Error('ENOSPC: no space left on device, write'); e.code = 'ENOSPC'; e.errno = -28; e.syscall = 'write';
    throw e;
  };
}
const unfault = () => { fs.writeSync = realWriteSync; };
const V4 = JSON.stringify(rec('c', 4));      // the record whose line the cut lands in
const MID = 40;                              // ⑤g's shape: inside the record
const CUTS = [['after v4\'s `\\n`', V4.length + 1], ['after v4\'s `}`', V4.length], ['mid-record (⑤g\'s shape)', MID]];
/** One store, one faulted append of [v4,v5], then the retry — on the same
 *  live store, or on a fresh one over the same directory (`restart`). */
function boundaryRetry(PS, name, land, { restart = false } = {}) {
  const st = PS.createChannelStore({ dir: path.join(ROOT, name) });
  st.appendRecords('a', 'c', [rec('c', 1), rec('c', 2), rec('c', 3)]);
  const fp = st.logPath('a', 'c');
  const sizeBefore = fs.statSync(fp).size;
  let threw = null;
  faultNextWrite(land);
  try { st.appendRecords('a', 'c', [rec('c', 4), rec('c', 5)]); } catch (e) { threw = e; } finally { unfault(); }
  const landed = fs.statSync(fp).size - sizeBefore;
  const use = restart ? PS.createChannelStore({ dir: st.dir }) : st;
  const retry = use.appendRecords('a', 'c', [rec('c', 4), rec('c', 5)]);
  const served = use.readTail('a', 'c', { limit: 99 }).map((r) => r.vendorId);
  const lines = fs.readFileSync(fp, 'utf-8').split('\n').filter(Boolean);
  const out = {
    code: threw && threw.code, landed, retry, served: served.join(','), dup: served.length - new Set(served).size,
    unread: use.countSince('a', 'c', 0), lines: lines.length,
    unparseable: lines.filter((l) => { try { JSON.parse(l); return false; } catch { return true; } }).length,
  };
  st.close(); if (restart) use.close();
  return out;
}
{
  for (const [shape, land] of CUTS) {
    const mid = land === MID;
    const r = boundaryRetry(S, `boundary-${land}`, land);
    ok(r.code === 'ENOSPC' && r.landed === land, `FIXTURE (cut ${shape}): the write landed exactly ${land} bytes and then threw ENOSPC (a positive control that the fault reached the module)`, JSON.stringify({ code: r.code, landed: r.landed }));
    ok(r.retry.appended === (mid ? 2 : 1) && r.retry.duplicates === (mid ? 0 : 1),
      mid ? `cut ${shape}: the same-process retry writes BOTH — the fragment is unparseable, so neither record landed`
          : `cut ${shape}: THE SAME-PROCESS RETRY WRITES ONLY v5 — the cached set was dropped at the throw and rebuilt from the log, which already holds v4`, JSON.stringify(r.retry));
    ok(r.served === 'v1,v2,v3,v4,v5' && r.dup === 0 && r.unread === 5, `cut ${shape}: five records served once each and unread counts five — no phantom row`, `${r.served} unread=${r.unread}`);
    ok(r.retry.healed === (land !== V4.length + 1) && r.unparseable === (mid ? 1 : 0) && r.lines === (mid ? 6 : 5),
      `cut ${shape}: ${mid ? 'the seal closed the fragment (one unparseable line stays)' : land === V4.length ? 'the seal closed the unterminated v4 line into a valid one' : 'nothing needed sealing'} — healed is a fact, not a habit`,
      JSON.stringify({ healed: r.retry.healed, lines: r.lines, unparseable: r.unparseable }));
    const rr = boundaryRetry(S, `boundary-${land}-restart`, land, { restart: true });
    ok(rr.retry.appended === r.retry.appended && rr.retry.duplicates === r.retry.duplicates && rr.served === r.served && rr.unread === r.unread,
      `cut ${shape}: BYTE-IDENTICAL to a restart — the retry re-derives the set exactly as a fresh process does`, JSON.stringify(rr.retry));
  }
  ok(fs.writeSync === realWriteSync, 'the fault harness restored fs.writeSync (nothing below runs against a patched fs)');
}

// ⑤i NEGATIVE CONTROL — the shipped module with the r4 invalidation removed
// (r3's bytes: the set is KEPT across the throw) must serve v4 twice on both
// boundary shapes, and ONLY in the process that threw — a restart over the
// same directory is correct, which pins the mechanism to the LIVE set; and
// it must be fine on the mid-record cut, which is why ⑤g never saw this.
{
  const src = fs.readFileSync(path.join(REPO, 'src/channel-store.js'), 'utf-8');
  const PRE = src.replace("      dedup.delete(`${adapterId}/${convId}`);   // r4: the log is the only witness now\n", "");
  ok(PRE !== src, 'NEGATIVE CONTROL setup: the r3 spelling (the set kept across the throw) was reconstructed from the shipped bytes');
  const pf = MUTCS.write('src/channel-store.js', PRE, 'prefix');
  try {
    const PS = require(pf);
    for (const [shape, land] of CUTS) {
      const r = boundaryRetry(PS, `boundary-pre-${land}`, land);
      const rr = boundaryRetry(PS, `boundary-pre-${land}-restart`, land, { restart: true });
      if (land === MID) {
        ok(r.dup === 0 && rr.dup === 0 && r.served === 'v1,v2,v3,v4,v5',
          `NEGATIVE CONTROL (cut ${shape}): the r3 bytes are FINE on the one shape ⑤g drives — which is exactly why ⑤g could not see the boundary shapes`, r.served);
        continue;
      }
      ok(r.retry.appended === 2 && r.retry.duplicates === 0 && r.served === 'v1,v2,v3,v4,v4,v5' && r.dup === 1 && r.unread === 6,
        `NEGATIVE CONTROL (cut ${shape}): the r3 bytes append v4 AGAIN — six rows served for five records and unread counts a phantom, for ever`, `${r.served} unread=${r.unread}`);
      ok(rr.retry.appended === 1 && rr.retry.duplicates === 1 && rr.dup === 0 && rr.unread === 5,
        `NEGATIVE CONTROL (cut ${shape}): …while a RESTART over the same log is correct — the mechanism is the stale LIVE set, not the file`, JSON.stringify(rr.retry));
    }
  } finally { /* MUTCS's scratch dir is removed at exit */ }
  ok(fs.writeSync === realWriteSync, 'the fault harness restored fs.writeSync after the control too');
}

// ── ⑤j A LOG THAT CANNOT BE READ IS NOT A LOG THAT HOLDS NOTHING (r5) ──
// The r4 class one layer over. The dedup REBUILD (the one reader whose answer
// writes bytes) derived its set from `readTail`, whose catches collapsed EVERY
// open/read error — EMFILE, EIO, EACCES — into an empty read; the empty set
// was CACHED, the next append wrote the whole re-offered batch as fresh, and a
// replayed boundary record landed twice for ever. The rebuild runs on every
// conversation's FIRST append after a boot, so this is the post-restart shape.
// Driven through the REAL module with `fs.openSync` failing ONCE on the log
// at the rebuild (a fresh store over an existing log = a restart), the batch
// being the boundary replay Lark's anchor semantics guarantee ([v5, v6] after
// v1..v5 are on disk). The fixed module THROWS the errno out of
// `appendRecords` (the pass fails, the anchor stays), lands nothing, caches
// nothing, and the retry appends only v6; the pre-fix bytes land v5 again.
const realOpenSync = fs.openSync;
function faultNextOpen(fpWanted, code) {
  let armed = true;
  fs.openSync = function (fp, ...rest) {
    if (armed && String(fp) === fpWanted) {
      armed = false;
      const e = new Error(`${code}: injected open failure, open '${fp}'`); e.code = code; e.syscall = 'open'; e.path = fp;
      throw e;
    }
    return realOpenSync.call(fs, fp, ...rest);
  };
}
const unfaultOpen = () => { fs.openSync = realOpenSync; };
/** Five records on disk, a RESTART, then the boundary replay [v5, v6] with
 *  the log's open failing once at the rebuild. */
function rebuildUnderFault(PS, name, code) {
  const st0 = PS.createChannelStore({ dir: path.join(ROOT, name) });
  st0.appendRecords('a', 'c', [1, 2, 3, 4, 5].map((i) => rec('c', i)));
  const fp = st0.logPath('a', 'c');
  st0.close();
  const st = PS.createChannelStore({ dir: st0.dir });          // the restart: no live set
  const sizeBefore = fs.statSync(fp).size;
  let threw = null, first = null;
  faultNextOpen(fp, code);
  try { first = st.appendRecords('a', 'c', [rec('c', 5), rec('c', 6)]); } catch (e) { threw = e; } finally { unfaultOpen(); }
  const landedBytes = fs.statSync(fp).size - sizeBefore;
  const retry = st.appendRecords('a', 'c', [rec('c', 5), rec('c', 6)]);   // the re-offer, fault gone
  const served = st.readTail('a', 'c', { limit: 99 }).map((r) => r.vendorId);
  const out = { threw: threw && threw.code, first, landedBytes, retry, served: served.join(','), dup: served.length - new Set(served).size, unread: st.countSince('a', 'c', 0) };
  st.close();
  return out;
}
{
  for (const code of ['EMFILE', 'EIO', 'EACCES']) {
    const r = rebuildUnderFault(S, `rebuild-${code}`, code);
    ok(r.threw === code && r.first === null && r.landedBytes === 0,
      `${code} at the dedup rebuild: appendRecords THROWS the errno (the pass fails, the anchor stays) and lands NOTHING — an unreadable log is not an empty one`, JSON.stringify({ threw: r.threw, first: r.first, landedBytes: r.landedBytes }));
    ok(r.retry.appended === 1 && r.retry.duplicates === 1,
      `${code}: the retry re-derives the set from the log (nothing was cached at the throw) — v5 is a duplicate, only v6 is written`, JSON.stringify(r.retry));
    ok(r.served === 'v1,v2,v3,v4,v5,v6' && r.dup === 0 && r.unread === 6,
      `${code}: six records served once each, unread counts six — no phantom row`, `${r.served} unread=${r.unread}`);
  }
  // POSITIVE CONTROL: ENOENT is still "no log yet" under strict — a brand-new
  // conversation's first append must not throw.
  {
    const st = S.createChannelStore({ dir: path.join(ROOT, 'rebuild-enoent') });
    let threw = null, w = null;
    try { w = st.appendRecords('a', 'fresh', [rec('fresh', 1)]); } catch (e) { threw = e; }
    ok(!threw && w && w.appended === 1, 'POSITIVE CONTROL: a conversation with no log yet (ENOENT) still appends — strict refuses errors, not absence', JSON.stringify({ threw: threw && threw.code, w }));
    st.close();
  }
  // READERS stay lenient: a render-side readTail over an unreadable log is an
  // empty read (it self-heals next tick); only the write-side rebuild refuses.
  {
    const st = S.createChannelStore({ dir: path.join(ROOT, 'rebuild-reader') });
    st.appendRecords('a', 'c', [rec('c', 1)]);
    const fp = st.logPath('a', 'c');
    let threw = null, got = null;
    faultNextOpen(fp, 'EIO');
    try { got = st.readTail('a', 'c', { limit: 5 }); } catch (e) { threw = e; } finally { unfaultOpen(); }
    ok(!threw && Array.isArray(got) && got.length === 0, 'a plain (non-strict) reader still answers an unreadable log with an empty read — the refusal is scoped to the one caller whose answer writes bytes', JSON.stringify({ threw: threw && threw.code, got }));
    st.close();
  }
  ok(fs.openSync === realOpenSync, 'the open-fault harness restored fs.openSync');
}

// ⑤j NEGATIVE CONTROL — the r4 bytes (both catches swallow every error) must
// return {appended:2} on the faulted first call and serve v5 TWICE for ever.
{
  const src = fs.readFileSync(path.join(REPO, 'src/channel-store.js'), 'utf-8');
  const PRE = src.replace("if (strict && e.code !== 'ENOENT') throw e; ", '').replace("if (strict) throw e; ", '');
  ok(PRE !== src && (PRE.match(/throw e/g) || []).length === (src.match(/throw e/g) || []).length - 2, 'NEGATIVE CONTROL setup: the r4 spelling (every read error is an empty read) was reconstructed from the shipped bytes');
  const pf = MUTCS.write('src/channel-store.js', PRE, 'prefix');
  try {
    const PS = require(pf);
    const r = rebuildUnderFault(PS, 'rebuild-pre-EIO', 'EIO');
    ok(r.threw === null && r.first && r.first.appended === 2 && r.first.duplicates === 0,
      'NEGATIVE CONTROL: the r4 bytes read the unreadable log as EMPTY and append the whole replay — v5 written again', JSON.stringify({ threw: r.threw, first: r.first }));
    ok(r.served === 'v1,v2,v3,v4,v5,v5,v6' && r.dup === 1 && r.unread === 7,
      'NEGATIVE CONTROL: …and the log serves seven rows for six records, for ever', `${r.served} unread=${r.unread}`);
  } finally { /* MUTCS's scratch dir is removed at exit */ }
  ok(fs.openSync === realOpenSync, 'the open-fault harness restored fs.openSync after the control too');
}

// ── ⑤h HISTORY BEYOND ONE WINDOW IS REACHABLE (r3) ──
// `readTail` read the LAST `TAIL_BYTES` once and filtered by the boundary, so
// once the window's paging walked past 2 MiB every page came back empty and
// the window just stopped — while `trim()` deliberately KEEPS 5,000 records /
// 90 days, so at the retention cap the oldest were unreachable BY
// CONSTRUCTION for any average record over ~419 bytes. The r2 ⑤ class one
// layer down: the bytes on disk, the user can never scroll back to them.
{
  const st = mk('deep');
  const T0 = NOW - 3 * 86400e3;
  const line = 'the deploy finished, logs look clean; can someone look at the staging box? moved the meeting to 3pm; that ticket is ready for review; heads up the nightly job was slow again; thanks merged. '.repeat(3);
  const all = [];
  for (let i = 0; i < 3000; i++) all.push({ ...rec('c', i, T0 + i * 1000), vendorId: `m${String(i).padStart(5, '0')}`, text: line });
  for (let i = 0; i < all.length; i += 500) st.appendRecords('a', 'c', all.slice(i, i + 500));
  const size = fs.statSync(st.logPath('a', 'c')).size;
  ok(size > S.TAIL_BYTES, `FIXTURE: 3,000 ordinary chat lines are ${(size / 1048576).toFixed(2)} MiB — past one ${S.TAIL_BYTES / 1048576} MiB window and inside the ${S.RETENTION_MAX_RECORDS}-record retention`, String(size));
  ok(st.trim('a', 'c').kept === 3000, 'FIXTURE: retention KEEPS every one of them (the reader must serve what the writer keeps)');
  const page = (store) => {
    const seen = new Set(); let before = null, beforeId = null, pages = 0;
    for (;;) { const p = store.readTail('a', 'c', { limit: 50, before, beforeId }); if (!p.length || pages > 200) break; pages++; for (const r of p) seen.add(r.vendorId); before = Number(p[0].at); beforeId = p[0].vendorId; }
    return { seen, pages };
  };
  const got = page(st);
  ok(got.seen.size === 3000, `paging back exactly as the window does reaches ALL 3,000 (${got.pages} pages)`, `${got.seen.size} reached`);
  ok(st.readTail('a', 'c', { limit: 50 }).map((r) => r.vendorId).join(',') === all.slice(-50).map((r) => r.vendorId).join(','), 'the first page (no boundary) is still the newest 50, in order');
  ok(st.readTail('a', 'c', { limit: 2, before: Number(all[1].at), beforeId: all[1].vendorId }).map((r) => r.vendorId).join(',') === 'm00000', 'the very first record is reachable, and the page before it is empty (a terminating walk)');
  // THE SAME READER REBUILDS THE DEDUP SET, so the fix reaches invariant 2 too:
  // a replayed page older than the window is still a no-op.
  ok(st.appendRecords('a', 'c', [all[0], all[10]]).duplicates === 2, 'a replayed page OLDER than one window is a duplicate, not a second line (the dedup set is rebuilt from the whole log)');
  st.close();
}

// ⑤h NEGATIVE CONTROL — the shipped reader with its walk pinned to ONE window
// (the r2 shape) must strand the oldest records and forget them in the set.
{
  const src = fs.readFileSync(path.join(REPO, 'src/channel-store.js'), 'utf-8');
  const PRE = src.replace('      while (end > 0 && out.length < want) {', '      while (end === size) {');
  ok(PRE !== src, 'NEGATIVE CONTROL setup: the one-window reader was reconstructed from the shipped bytes');
  const pf = MUTCS.write('src/channel-store.js', PRE, 'prefix');
  try {
    const PS = require(pf);
    const st = PS.createChannelStore({ dir: path.join(ROOT, 'deep-pre') });
    const T0 = NOW - 3 * 86400e3;
    const line = 'the deploy finished, logs look clean; can someone look at the staging box? moved the meeting to 3pm; that ticket is ready for review; heads up the nightly job was slow again; thanks merged. '.repeat(3);
    const all = [];
    for (let i = 0; i < 3000; i++) all.push({ ...rec('c', i, T0 + i * 1000), vendorId: `m${String(i).padStart(5, '0')}`, text: line });
    for (let i = 0; i < all.length; i += 500) st.appendRecords('a', 'c', all.slice(i, i + 500));
    const seen = new Set(); let before = null, beforeId = null, pages = 0;
    for (;;) { const p = st.readTail('a', 'c', { limit: 50, before, beforeId }); if (!p.length || pages > 200) break; pages++; for (const r of p) seen.add(r.vendorId); before = Number(p[0].at); beforeId = p[0].vendorId; }
    ok(seen.size < 3000 && !seen.has('m00000'), `NEGATIVE CONTROL: the one-window reader strands ${3000 - seen.size} of 3,000 — the window stops, silently, with the bytes on disk`, String(seen.size));
    const dupe = PS.createChannelStore({ dir: st.dir });      // a fresh set, rebuilt from the tail
    ok(dupe.appendRecords('a', 'c', [all[0]]).appended === 1, 'NEGATIVE CONTROL: …and its dedup set has FORGOTTEN the oldest record, so a replayed page writes it twice');
    st.close(); dupe.close();
  } finally { /* MUTCS's scratch dir is removed at exit */ }
}

// ── ⑤c A BATCH MAY CARRY THE SAME vendorId TWICE ──
// The in-batch set is what keeps the durable one honest without letting a
// vendor page and its own replayed boundary write the record twice.
{
  const st = mk('batch-dup');
  const w = st.appendRecords('a', 'c', [rec('c', 1), rec('c', 1), rec('c', 2)]);
  ok(w.appended === 2 && w.duplicates === 1, 'a repeat WITHIN one batch is a duplicate, not a second line', JSON.stringify(w));
  ok(st.readTail('a', 'c', { limit: 9 }).length === 2, '…and the log holds two lines');
  st.close();
}

// ── ⑤d PAGING IS A TOTAL ORDER, NOT A TIMESTAMP (r2) ──
// `at` is NOT unique: a Lark burst shares a millisecond and Gmail's
// internalDate is second-derived. Paging on it alone with a strict `<` made
// every record of such a group at or after a page boundary permanently
// unreachable — the bytes on disk, no way to scroll back to them.
{
  const T0 = 1789000000000;
  const st = mk('page-order');
  const all = [];
  // zero-padded so the (at, vendorId) order and the numeric order agree —
  // the point of this leg is the GROUPS, not the id-sort rule.
  for (let g = 0; g < 4; g++) for (let k = 0; k < 3; k++) all.push({ ...rec('c', g * 3 + k, T0 + g * 1000), vendorId: `m${String(g * 3 + k).padStart(2, '0')}` });
  st.appendRecords('a', 'c', all);

  // page exactly as src/lib/channel-window.js pages: limit 2 (a boundary
  // INSIDE a group), boundary = the first record of the page just rendered.
  const seen = [];
  let before = null, beforeId = null;
  for (let i = 0; i < 20; i++) {
    const page = st.readTail('a', 'c', { limit: 2, before, beforeId });
    if (!page.length) break;
    for (const r of page) seen.push(r.vendorId);
    before = Number(page[0].at); beforeId = page[0].vendorId;
  }
  const want = all.map((r) => r.vendorId);
  const missing = want.filter((v) => !seen.includes(v));
  ok(!missing.length, 'EVERY record is reachable through the window when a page boundary falls inside a group sharing one instant', `missing ${missing.join(',')} · saw ${seen.join(',')}`);
  ok(new Set(seen).size === seen.length, '…and none is served twice', seen.join(','));

  // NEGATIVE CONTROL: the retired call — `before` alone, strict `<`.
  const lost = [];
  let b2 = null;
  for (let i = 0; i < 20; i++) {
    const page = st.readTail('a', 'c', { limit: 2, before: b2 });
    if (!page.length) break;
    for (const r of page) lost.push(r.vendorId);
    b2 = Math.min(...page.map((x) => Number(x.at)), b2 === null ? Infinity : b2);
  }
  const gone = want.filter((v) => !lost.includes(v));
  ok(gone.length === 4 && gone.join(',') === 'm00,m03,m06,m09',
    'NEGATIVE CONTROL: paging on `at` ALONE strands one record per equal-timestamp group, for ever', gone.join(','));

  // A caller that cannot name a boundary record still TERMINATES (the old
  // shape is the fallback, not a hang).
  ok(st.readTail('a', 'c', { limit: 2, before: T0 + 1000, beforeId: null }).every((r) => Number(r.at) < T0 + 1000),
    'with no beforeId the whole equal-`at` group is at-or-after — lossy, but terminating');
  st.close();
}

// ── ⑤e THE SERVED ORDER IS THE PAGING ORDER ──
{
  const st = mk('page-sorted');
  const T = 1789111000000;
  st.appendRecords('a', 'c', [
    { ...rec('c', 9, T), vendorId: 'm9' }, { ...rec('c', 1, T), vendorId: 'm1' }, { ...rec('c', 5, T), vendorId: 'm5' },
  ]);
  ok(st.readTail('a', 'c', { limit: 9 }).map((r) => r.vendorId).join(',') === 'm1,m5,m9',
    'records sharing one instant come back ordered by vendorId — ranking on one order and slicing by another is what made the boundary ambiguous');
  st.close();
}

// ── ⑤f adapters.json HAS ONE OWNER TOO (r2) ──
{
  const st = mk('adapters-owner');
  await st.adapters.update((a) => { a.adapters.push({ id: 'x', kind: 'k', lastPass: null, consecutiveFailures: 0 }); });
  ok(st.adapters.live().adapters.length === 1, 'the live object holds the row');
  ok(JSON.parse(fs.readFileSync(st.adaptersFile, 'utf-8')).adapters[0].id === 'x', 'the door writes it atomically');
  // Two concurrent updates on DIFFERENT rows must both survive.
  await st.adapters.update((a) => { a.adapters.push({ id: 'y', kind: 'k', lastPass: null, consecutiveFailures: 0 }); });
  const both = await Promise.all([
    st.adapters.update((a) => { a.adapters.find((r) => r.id === 'x').consecutiveFailures = 5; }),
    st.adapters.update((a) => { a.adapters.find((r) => r.id === 'y').lastPass = { at: 1, ok: true, code: null }; }),
  ]).then(() => JSON.parse(fs.readFileSync(st.adaptersFile, 'utf-8')).adapters);
  ok(both.find((r) => r.id === 'x').consecutiveFailures === 5 && both.find((r) => r.id === 'y').lastPass,
    'TWO CONCURRENT UPDATES BOTH SURVIVE — a failing adapter\'s health is not wiped by a healthy neighbour', JSON.stringify(both));
  ok(S.createChannelStore({ dir: st.dir }).adapters.live().adapters.length === 2, 'and the file is read ONCE at construction, never re-parsed per call');
  st.close();
}

// ── ⑥ atomic index + coalesced flush ──
{
  const st = mk('flush');
  await st.index.update(() => { st.index.entry('a', 'c').tracked = true; });
  ok(st.index.isDirty() === true, 'an update marks the index dirty rather than writing per change');
  ok(st.index.flush() === true && st.index.isDirty() === false, 'flush writes once and clears the flag');
  ok(st.index.flush() === false, 'a second flush with nothing dirty is a no-op (coalesced, never per change)');
  ok(JSON.parse(fs.readFileSync(st.indexFile, 'utf-8')).conversations['a/c'].tracked === true, 'the index is on disk, written atomically');
  st.close();
  ok(S.createChannelStore({ dir: st.dir }).index.snapshot().conversations['a/c'].tracked === true, 'and it survives a restart');
}

// ── ⑦ the audit log is APPEND-ONLY and rolls into archive/ ──
{
  let clock = Date.parse('2026-09-10T12:00:00Z');
  const st = S.createChannelStore({ dir: path.join(ROOT, 'audit'), now: () => clock });
  st.audit({ kind: 'x', who: 'me' });
  st.audit({ kind: 'y', who: 'me' });
  ok(fs.readFileSync(st.auditFile, 'utf-8').trim().split('\n').length === 2, 'audit lines append');
  // MTIME IS NOT THE DAY: the fixture's real mtime is today, while the lines
  // belong to the injected clock's day. Rolling on mtime would archive a file
  // that had not rolled at all — which is what this leg measures.
  clock = Date.parse('2026-09-10T18:00:00Z');
  st.audit({ kind: 'still-today' });
  ok(!fs.existsSync(path.join(st.archiveDir, 'audit-2026-09-10.ndjson')) && fs.readFileSync(st.auditFile, 'utf-8').trim().split('\n').length === 3,
    'the roll reads the day off the file\'s OWN last line, never off mtime (a backup or an rsync rewrites mtime; `at` is the stamp we wrote)', fs.readdirSync(st.archiveDir).join(','));

  clock = Date.parse('2026-09-11T09:00:00Z');
  st.audit({ kind: 'z', who: 'me' });
  const shard = path.join(st.archiveDir, 'audit-2026-09-10.ndjson');
  ok(fs.existsSync(shard) && fs.readFileSync(shard, 'utf-8').trim().split('\n').length === 3, 'yesterday is ARCHIVED, never deleted', fs.readdirSync(st.archiveDir).join(','));
  ok(fs.readFileSync(st.auditFile, 'utf-8').trim().split('\n').length === 1, 'today starts fresh');

  // A SECOND roll naming the SAME archive day (a clock that moved backwards, a
  // restore, two rolls in one process) must APPEND to that shard.
  const back = S.createChannelStore({ dir: st.dir, now: () => clock });
  clock = Date.parse('2026-09-10T23:30:00Z');
  back.audit({ kind: 'late' });                       // re-opens 09-10
  clock = Date.parse('2026-09-11T10:00:00Z');
  back.audit({ kind: 'w', who: 'me' });               // rolls 09-10 again
  // 3 lines from the first roll + the ONE `late` line this second roll carries.
  ok(fs.readFileSync(shard, 'utf-8').trim().split('\n').length === 4, 'a SECOND roll onto the same day APPENDS — naming a shard by date and overwriting it is how an archive loses the reason it exists', String(fs.readFileSync(shard, 'utf-8').trim().split('\n').length));
  ok(fs.existsSync(path.join(st.archiveDir, 'audit-2026-09-11.ndjson')), 'a clock that moves BACKWARDS rolls too — the open file always belongs to exactly one day, whichever direction the clock went');
  st.close(); back.close();
}

// ── ⑧ a vendor id may not escape its directory ──
{
  const bad = (v) => { try { S.safeSeg(v); return false; } catch { return true; } };
  ok(bad('a/b') && bad('..') && bad('.') && bad('a\\b') && bad(''), 'a path segment carrying a slash, a backslash, a dot-dot or nothing is REFUSED (channel ids come from vendors — this is a boundary, not a formality)');
  ok(S.safeSeg('Lark:chat+1@x') === 'Lark:chat+1@x' && S.safeSeg('ünïcode').includes('%'), 'ordinary ids pass through; anything else is percent-encoded rather than silently dropped');
  const st = mk('safe');
  let threw = false;
  try { st.appendRecords('../../etc', 'passwd', [rec('c', 1)]); } catch { threw = true; }
  ok(threw, 'the refusal reaches the append path, not just the helper');
  st.close();
}

// ── ⑧b RETENTION HAS A CALLER — a policy nobody enforces is not a policy ──
{
  const eng = fs.readFileSync(path.join(REPO, 'src/server/channels-engine.js'), 'utf-8').replace(/^\s*\/\/.*$/gm, '');
  ok(/store\.trim\(/.test(eng), 'the ingest engine CALLS store.trim — the retention bounds above are enforced by something, not just implemented');
  // 2026-09-26: at most every TRIM_EVERY_MS per conversation (the trim rewrites the log) — still
  // only after a pass that APPENDED, still on the ONE conversation that grew
  ok(/if \(trimNow\)[^\n]*store\.trim\(rec\.id, convId\)/.test(eng) && /if \(appended && \(!en\.trimmedAt \|\| now\(\) - en\.trimmedAt >= TRIM_EVERY_MS\)\) \{ en\.trimmedAt = now\(\); trimNow = true; \}/.test(eng), '…right after a pass that actually appended, on the ONE conversation that grew, at most every TRIM_EVERY_MS (a timer sweeping every conversation would re-read logs nothing touched)', eng.split('\n').filter((l) => /store\.trim|trimNow = true/.test(l)).join(' | '));
}

// ── ⑨ tier + hygiene pins ──
{
  const src = fs.readFileSync(path.join(REPO, 'src/channel-store.js'), 'utf-8');
  // A CENSUS READS CODE: this file's own header names the export it refuses
  // to have, so prose is blanked before asking whether one survives.
  const noComments = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const reqs = [...src.matchAll(/require\('([^']+)'\)/g)].map((m) => m[1]);
  ok(reqs.every((r) => ['fs', 'path', 'crypto', './channel-record.js', './channel-reactions.js', './channel-thread.js'].includes(r)), 'the store is SHARED: node builtins only — fs, path, and crypto for the attachment cache\'s file names (2026-09-26) — plus, since lane channel-threads, the PURE modules the side log\'s dedup key and compaction fold are theirs, and (lane lark-threads) the place patch\'s widen-only rules (SHARED may import PURE)', reqs.join(','));
  ok(!/module\.exports[\s\S]*writeIndex|exports\.writeIndex/.test(src), 'there is deliberately NO "write the whole index back" export — the serialized owner is the index\'s only writer (§5.1)');
  ok(!/writeAdapters/.test(noComments), '…and none for adapters.json either (r2): every caller used to re-parse and write its own private copy back, which is the read-modify-write lost update this invariant exists to eliminate');
  ok(/appendLines\(fp[\s\S]{0,300}?for \(const r of fresh\) rememberVendorId/.test(src) && !/if \(set\.has\(r\.vendorId\)[\s\S]{0,120}?rememberVendorId/.test(src), 'the dedup set is written AFTER the bytes are durable, never inside the selection loop');
  ok(!/appendFileSync\(fp/.test(noComments) && /function writeAll\(fd, str\)[\s\S]{0,200}?while \(off < buf\.length\) off \+= fs\.writeSync/.test(src),
    'the message log is written through the sealing, LOOPING writer (r3) — `appendFileSync` throws after a partial chunk and `fs.writeSync` does not retry a short write');
  ok(/try \{\s*healed = appendLines\(fp[\s\S]{0,200}?\} catch \(e\) \{[\s\S]{0,160}?dedup\.delete\(`\$\{adapterId\}\/\$\{convId\}`\);[\s\S]{0,120}?throw e;/.test(src),
    'a throw from INSIDE the write DROPS the cached dedup set before it propagates (r4) — a prefix may be durable and only the log knows which records; the set is rebuilt from the bytes on the retry');
  ok(!fs.readFileSync(path.join(REPO, 'src/channel-store.js')).includes(0), 'no raw NUL byte (it would hide the module from grep, file(1) and every source census)');
  ok(/writeJsonAtomic/.test(src) && !/fs\.writeFileSync\(indexFile/.test(src), 'the index goes through writeJsonAtomic (tmp+rename) — a bare writeFileSync is silent data loss on the exact crash this product exists to survive');
}


console.log('§r3 a BLOCKED family refuses the ACTION, not only the write (r3 finding 6)');
{
  const dir = path.join(ROOT, 'blocked', 'channels');
  fs.mkdirSync(path.join(dir, 'msgs'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'archive'), { recursive: true });
  const HALF = '{"v":1,"half';
  for (const n of ['index.json', 'adapters.json', 'outbox.json', 'groups.json', 'wake-pace.json']) fs.writeFileSync(path.join(dir, n), HALF);
  fs.chmodSync(dir, 0o555);   // the rename cannot happen — the BLOCKED rung
  let canRename = false;
  try { fs.renameSync(path.join(dir, 'index.json'), path.join(dir, 'probe')); fs.renameSync(path.join(dir, 'probe'), path.join(dir, 'index.json')); canRename = true; } catch {}
  if (canRename) console.log('  … SKIP: a read-only directory still allows a rename here (running as root?) — no blocked rung to produce');
  else {
    const warns = [];
    const st = S.createChannelStore({ dir, log: { warn: (...a) => warns.push(a.join(' ')), log() {}, info() {} } });
    ok(['index.json', 'adapters.json', 'outbox.json', 'groups.json'].every((f) => st.quarantined.some((q) => q.file === f && q.blocked === true)), 'FIXTURE: every family is BLOCKED (named in store.quarantined)', JSON.stringify(st.quarantined));
    let ixErr = null;
    const r = await st.index.update((ix) => { ix.conversations['fake/c1'] = { key: 'fake/c1', id: 'c1', adapterId: 'fake', tracked: true }; }).then(() => 'RESOLVED', (e) => { ixErr = e; return 'rejected'; });
    ok(r === 'rejected' && ixErr && ixErr.code === 'store-blocked' && ixErr.status === 503 && /index\.json/.test(ixErr.message), 'index.update over a BLOCKED index.json REJECTS with code store-blocked (503) — never a success the next restart takes back', JSON.stringify({ r, code: ixErr && ixErr.code, status: ixErr && ixErr.status }));
    ok(!st.index.entry('fake', 'c1', { create: false }), '…and the mutation never ran: nothing lives in memory that the disk will not hold');
    for (const fam of ['adapters', 'outbox', 'groups']) {
      let e = null;
      await st[fam].update(() => {}).catch((x) => { e = x; });
      ok(e && e.code === 'store-blocked' && e.status === 503, `${fam}.update over a blocked file rejects with code store-blocked (503) — a route answers {error, code} the panel can word`, JSON.stringify(e && { code: e.code, status: e.status }));
    }
    // the ROUTE answers the code (routes/channels.js fail()): the panel's routeErrorText words it
    const express = require(path.join(REPO, 'node_modules/express'));
    const GE = require(path.join(REPO, 'src/server/groups-engine.js'));
    const CR = require(path.join(REPO, 'src/routes/channels.js'));
    const RA = 'aaaaaaaa-1111-4000-8000-000000000001', RB = 'bbbbbbbb-2222-4000-8000-000000000002';
    const ge = GE.create({ store: st, deliver: null, broadcast() {}, roster: () => [{ cid: RA, name: 'alpha', groups: ['t'] }, { cid: RB, name: 'beta', groups: ['t'] }], groupSetting: () => 'none', log: { info() {}, warn() {}, log() {} } });
    CR.setup({ getEngine: () => null, getGroups: () => ge, authEnabled: () => true });
    const app = express(); app.use(express.json()); app.use(CR.router);
    const srv = await new Promise((resolve) => { const s2 = app.listen(0, '127.0.0.1', () => resolve(s2)); });
    const rr = await fetch(`http://127.0.0.1:${srv.address().port}/api/channel-groups`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'x', members: [RA, RB], quiet: true }) }).then(async (x) => ({ status: x.status, body: await x.json() }));
    await new Promise((resolve) => srv.close(resolve));
    ok(rr.status === 503 && rr.body.code === 'store-blocked' && /groups\.json/.test(rr.body.error), 'the owner\'s create over a blocked groups.json answers 503 {error, code:"store-blocked"} (was 500 with code null)', JSON.stringify(rr));
    const W = fs.readFileSync(path.join(REPO, 'src/lib/channel-words.js'), 'utf-8');
    ok((W.match(/case 'store-blocked'/g) || []).length === 2, 'PIN: both route-error worders (channels + groups) say store-blocked in words');
    const pw = warns.length;
    st.pace.set({ v: 1, pairs: { 'a|b': 1 }, senders: {} });
    st.pace.flush();
    st.pace.set({ v: 1, pairs: { 'a|c': 2 }, senders: {} });
    st.pace.flush();
    ok(fs.readFileSync(path.join(dir, 'wake-pace.json'), 'utf-8') === HALF && warns.slice(pw).filter((l) => /wake-pace\.json not written/.test(l)).length === 2, 'the BLOCKED pace ledger is never overwritten either, and EVERY refused flush says so (not only the first)', JSON.stringify(warns.slice(pw)));
    st.close();
  }
  fs.chmodSync(dir, 0o755);
  const src = fs.readFileSync(path.join(REPO, 'src/channel-store.js'), 'utf-8');
  ok(!/_said/.test(src), 'PIN: no once-only flag silences a refused index flush after its first line');
}


// ── ⑪ THE SIDE LOG (lane channel-threads, invariant 8 — spec §3.2 / §7.1 "test-channel-side-store") ──
// A reaction added or removed, a vendor's thread count: facts that change AFTER a message was written, appended to
// the conversation's side log and folded at read time. The same discipline as the message log: dedup by `sideKey`
// (a replayed event is a no-op), remember only after the bytes, drop the set on a throw, a strict rebuild; and the
// side log is invisible to every message reader.
{
  const R = require(path.join(REPO, 'src/channel-record.js'));
  const side = (x) => R.validateSide(x).side;
  const d = (msg, at, op, key, actor, rid) => side({ k: 'rx', msg, at, form: 'delta', op, key, actor: { id: actor }, src: 'event', ...(rid ? { rid } : {}) });
  const st = mk('side');
  st.appendRecords('a', 'c', [rec('c', 1), rec('c', 2), rec('c', 3)]);
  // a replayed Lark event (no reaction id — L10) and a Slack (msg, name, user) twin: one line each
  const w1 = st.appendSide('a', 'c', [d('v1', NOW, 'add', 'THUMBSUP', 'ou_a'), d('v1', NOW, 'add', 'THUMBSUP', 'ou_a')]);
  const w2 = st.appendSide('a', 'c', [d('v1', NOW, 'add', 'THUMBSUP', 'ou_a')]);
  const w3 = st.appendSide('a', 'c', [d('v2', NOW + 1, 'add', 'thumbsup', 'U1', null), d('v2', NOW + 1, 'add', 'thumbsup', 'U1', null)]);
  ok(w1.appended === 1 && w1.duplicates === 1 && w2.appended === 0 && w2.duplicates === 1 && w3.appended === 1, 'attack 3: a replayed reaction event is ONE side line (dedup by sideKey, within a batch and across batches)', JSON.stringify([w1, w2, w3]));
  const w4 = st.appendSide('a', 'c', [d('v1', NOW + 5, 'add', 'OK', 'ou_b', 'rid-1'), d('v1', NOW + 6, 'add', 'OK', 'ou_b', 'rid-1')]);
  ok(w4.appended === 1, 'a vendor reaction id IS the dedup key when it is issued');
  const re = S.createChannelStore({ dir: st.dir });
  ok(re.appendSide('a', 'c', [d('v1', NOW, 'add', 'THUMBSUP', 'ou_a')]).duplicates === 1, 'after a restart the side dedup set is rebuilt from the side log (a boundary replay is still a no-op)');
  // readSide by needle: a line naming another message is not parsed
  const onlyV1 = re.readSide('a', 'c', { msgs: new Set(['v1']) });
  ok(onlyV1.length === 2 && onlyV1.every((x) => x.msg === 'v1'), 'readSide returns only the lines naming the asked messages');
  fs.appendFileSync(re.sidePath('a', 'c'), '{"k":"rx","msg":"v3","at":1,"form":"delta" THIS LINE IS NOT JSON\n');
  ok(re.readSide('a', 'c', { msgs: new Set(['v1']) }).length === 2 && re.readSide('a', 'c', { msgs: new Set(['v3']) }).length === 0, '…a line naming another message is skipped without parsing its body; a broken one contributes nothing');
  // invariant 8: the message readers never see a side line
  ok(re.readTail('a', 'c', { limit: 99 }).length === 3 && re.countSince('a', 'c', 0) === 3, 'invariant 8: readTail and countSince (unread) see the three messages only — never a side line');
  const found = await re.search('a', 'THUMBSUP');
  ok(found.results.length === 0 && found.files === 1, 'invariant 8: search reads the message log only (the side log lives in a `~side/` subdirectory it never opens)', JSON.stringify(found));
  ok(re.sidePath('a', 'c').includes(`${path.sep}~side${path.sep}`) && !S.safeSeg('x~side').includes('~'), 'the side log sits in `~side/` — a name no vendor id can spell (safeSeg escapes `~`), so a conversation `c.side` never collides with `c`\'s side log');
  // the r2 / r4 discipline: a throw INSIDE the write drops the cached set; the rebuild is strict
  const sp = re.sidePath('a', 'c');
  const saved = fs.readFileSync(sp);
  fs.unlinkSync(sp); fs.mkdirSync(sp);                                  // EISDIR inside the write
  let threw = null; try { re.appendSide('a', 'c', [d('v2', NOW + 9, 'add', 'OK', 'ou_z')]); } catch (e) { threw = e.code; }
  fs.rmdirSync(sp); fs.writeFileSync(sp, saved);
  const again = re.appendSide('a', 'c', [d('v2', NOW + 9, 'add', 'OK', 'ou_z')]);
  ok(threw && again.appended === 1, 'a throw INSIDE the side write drops the cached set — the retry re-derives it from the log and writes the line (never a phantom duplicate)', `${threw} ${JSON.stringify(again)}`);
  const re2 = S.createChannelStore({ dir: st.dir });
  fs.chmodSync(sp, 0o000);
  let strict = null; try { re2.appendSide('a', 'c', [d('v2', NOW + 10, 'add', 'OK', 'ou_q')]); } catch (e) { strict = e.code; }
  fs.chmodSync(sp, 0o644);
  const after = re2.appendSide('a', 'c', [d('v2', NOW + 10, 'add', 'OK', 'ou_q')]);
  ok((strict === 'EACCES' || process.getuid && process.getuid() === 0) && after.appended === 1, 'a side log that cannot be READ at rebuild THROWS (EACCES) — nothing is cached as "empty"; the next append re-reads it', `${strict} ${JSON.stringify(after)}`);
  st.close(); re.close(); re2.close();
}
// the trim: a message dropped by retention drops its side lines; a kept one is COMPACTED (attack 17: 5 000
// messages, 40 000 side lines ⇒ ≤ 2 × the message count; the newest snapshot survives, newer deltas fold into it)
{
  const R = require(path.join(REPO, 'src/channel-record.js'));
  const Rx = require(path.join(REPO, 'src/channel-reactions.js'));
  const st = mk('side-trim');
  const OLD = NOW - 120 * 86400e3;
  st.appendRecords('a', 'c', [{ ...rec('c', 0), at: OLD }]);
  const recs = []; for (let i = 1; i <= 5000; i++) recs.push({ ...rec('c', i), at: NOW - (5001 - i) * 1000 });
  st.appendRecords('a', 'c', recs);
  const sides = [];
  sides.push(R.validateSide({ k: 'rx', msg: 'v0', at: OLD + 1, form: 'delta', op: 'add', key: 'OK', actor: { id: 'u0' }, src: 'event' }).side);
  for (let i = 0; i < 40000; i++) { const m = 'v' + (1 + (i % 5000)); sides.push(R.validateSide({ k: 'rx', msg: m, at: NOW + i, form: 'delta', op: i % 7 === 0 ? 'remove' : 'add', key: ['OK', 'PARTY', 'SOB'][i % 3], actor: { id: 'u' + (i % 37) }, src: 'event' }).side); }
  sides.push(R.validateSide({ k: 'th', msg: 'v1', at: NOW, src: 'history', count: 3 }).side, R.validateSide({ k: 'th', msg: 'v1', at: NOW + 5, src: 'history', count: 4 }).side);
  const w = st.appendSide('a', 'c', sides);
  const before = st.readSide('a', 'c', { msgs: new Set(['v1']), limit: 1e9 });
  const foldBefore = Rx.foldReactions(before.filter((x) => x.k === 'rx'), {});
  const tr = st.trim('a', 'c');
  const lines = fs.readFileSync(st.sidePath('a', 'c'), 'utf-8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  ok(w.appended === 40003 && lines.length <= 2 * 5000, `attack 17: 40 003 side lines over 5 000 kept messages trim to ${lines.length} (≤ 2 × the message count)`, JSON.stringify(tr));
  ok(!lines.some((x) => x.msg === 'v0'), 'a message dropped by retention (120 days old) drops its side lines with it');
  const after = st.readSide('a', 'c', { msgs: new Set(['v1']) });
  const foldAfter = Rx.foldReactions(after.filter((x) => x.k === 'rx'), {});
  ok(JSON.stringify(foldAfter.map((x) => [x.key, x.count])) === JSON.stringify(foldBefore.map((x) => [x.key, x.count])) && after.filter((x) => x.k === 'th').length === 1 && after.find((x) => x.k === 'th').count === 4, 'the compacted message folds to the SAME counts, and only its NEWEST thread stat is kept', JSON.stringify([foldBefore.map((x) => [x.key, x.count]), foldAfter.map((x) => [x.key, x.count])]));
  // attack 13: side lines for a conversation that never got a message log are "message gone" at the next trim
  st.appendSide('a', 'orphan', [R.validateSide({ k: 'rx', msg: 'm', at: NOW, form: 'delta', op: 'add', key: 'OK', actor: { id: 'u' }, src: 'event' }).side]);
  st.trim('a', 'orphan');
  ok(fs.readFileSync(st.sidePath('a', 'orphan'), 'utf-8') === '', 'attack 13: a side line for a conversation with no message log is trimmed as "message gone" — never orphaned for ever');
  st.close();
}
// verify r1 (MONEY / the event loop): the side log's GROWTH is bounded where it happens and a READ is a bounded tail.
// Before: a 20 000-event storm on ONE message (no message append ⇒ no trim ⇒ no compaction) made every page read
// two synchronous whole-file reads of 2.8 MiB on the event loop, for ever.
{
  const R = require(path.join(REPO, 'src/channel-record.js'));
  const Rx = require(path.join(REPO, 'src/channel-reactions.js'));
  const st = mk('side-growth');
  st.appendRecords('a', 'c', [rec('c', 1)]);
  const all = [];
  const mkD = (i) => R.validateSide({ k: 'rx', msg: 'v1', at: 1e12 + i, form: 'delta', op: Math.floor(i / 300) % 2 ? 'remove' : 'add', key: 'OK', actor: { id: 'u' + (i % 300) }, src: 'event' }).side;
  let compactions = 0;
  for (let i = 0; i < 20000; i += 100) { const batch = []; for (let j = i; j < i + 100; j++) { const d = mkD(j); batch.push(d); all.push(d); } const w = st.appendSide('a', 'c', batch); if (w.compacted) compactions++; }
  const size = fs.statSync(st.sidePath('a', 'c')).size;
  const oracle = Rx.foldReactions(all, {});
  const folded = Rx.foldReactions(st.readSide('a', 'c', { msgs: new Set(['v1']) }).filter((x) => x.k === 'rx'), {});
  ok(size <= S.SIDE_COMPACT_BYTES + 200 * 1024 && compactions >= 1, `20 000 events on ONE message with no message append: the side log compacts as it grows (${compactions}×) and stays under ${(S.SIDE_COMPACT_BYTES / 1048576).toFixed(0)} MiB + one batch (${(size / 1024).toFixed(0)} KiB)`, JSON.stringify([size, compactions]));
  ok(JSON.stringify(folded.map((x) => [x.key, x.count])) === JSON.stringify(oracle.map((x) => [x.key, x.count])) && oracle[0] && oracle[0].count === 200, 'the compacted log folds to the SAME counts as the whole stream (200 of 300 members reacted at the end)', JSON.stringify([folded.map((x) => [x.key, x.count]), oracle.map((x) => [x.key, x.count])]));
  // the READ is the newest window: a line beyond SIDE_READ_BYTES from the end is not read at all
  const st2 = mk('side-window');
  st2.appendRecords('a', 'c', [rec('c', 1), rec('c', 2)]);
  const sp = st2.sidePath('a', 'c');
  fs.mkdirSync(path.dirname(sp), { recursive: true });
  const filler = JSON.stringify(R.validateSide({ k: 'rx', msg: 'v2', at: 5, form: 'delta', op: 'add', key: 'OK', actor: { id: 'filler-' + 'x'.repeat(200) }, src: 'event' }).side);
  const headLine = JSON.stringify(R.validateSide({ k: 'rx', msg: 'v1', at: 1, form: 'delta', op: 'add', key: 'SOB', actor: { id: 'head' }, src: 'event' }).side);
  const tailLine = JSON.stringify(R.validateSide({ k: 'rx', msg: 'v1', at: 9, form: 'delta', op: 'add', key: 'OK', actor: { id: 'tail' }, src: 'event' }).side);
  const nFill = Math.ceil((S.SIDE_READ_BYTES + 512 * 1024) / (filler.length + 1));
  fs.writeFileSync(sp, headLine + '\n' + Array.from({ length: nFill }, () => filler).join('\n') + '\n' + tailLine + '\n');
  const got = st2.readSide('a', 'c', { msgs: new Set(['v1']) });
  ok(fs.statSync(sp).size > S.SIDE_READ_BYTES && got.length === 1 && got[0].actor.id === 'tail', `readSide reads the newest ${(S.SIDE_READ_BYTES / 1048576).toFixed(0)} MiB only (a ${(fs.statSync(sp).size / 1048576).toFixed(1)} MiB file: the line at its head is beyond the window; the one at its tail is read)`, JSON.stringify(got.map((x) => x.actor.id)));
  st.close(); st2.close();
  // CONTROLS: a copy that never compacts on growth keeps every line; a copy that reads the whole file finds the head line
  const src = fs.readFileSync(path.join(REPO, 'src/channel-store.js'), 'utf-8');
  const G = "      try { compacted = trimSide(adapterId, convId, { liveIds: null }); sideCompactFailedAt.delete(ck); }";
  const W = "    const tail = sideTail(sidePath(adapterId, convId), Math.max(64 * 1024, Number(maxBytes) || SIDE_READ_BYTES));";
  ok(src.split(G).length === 2 && src.split(W).length === 2, 'CONTROL setup: the growth compaction and the tail window are each present once');
  const PG = require(MUTCS.write('src/channel-store.js', src.replace(G, '      try { }'), 'side-nocompact'));
  const sg = PG.createChannelStore({ dir: path.join(ROOT, 'side-nocompact') });
  sg.appendRecords('a', 'c', [rec('c', 1)]);
  for (let i = 0; i < 20000; i += 100) { const batch = []; for (let j = i; j < i + 100; j++) batch.push(mkD(j)); sg.appendSide('a', 'c', batch); }
  const gSize = fs.statSync(sg.sidePath('a', 'c')).size;
  ok(gSize > 2 * S.SIDE_COMPACT_BYTES && fs.readFileSync(sg.sidePath('a', 'c'), 'utf-8').split('\n').filter(Boolean).length === 20000, `CONTROL: the copy without the growth compaction keeps all 20 000 lines (${(gSize / 1048576).toFixed(1)} MiB) — the growth leg would be red`);
  sg.close();
  const PW = require(MUTCS.write('src/channel-store.js', src.replace(W, "    const tail = { text: fs.readFileSync(sidePath(adapterId, convId), 'utf-8'), cut: false };"), 'side-wholeread'));
  const sw = PW.createChannelStore({ dir: path.join(ROOT, 'side-wholeread') });
  sw.appendRecords('a', 'c', [rec('c', 1), rec('c', 2)]);
  const swp = sw.sidePath('a', 'c'); fs.mkdirSync(path.dirname(swp), { recursive: true }); fs.copyFileSync(sp, swp);
  const gotW = sw.readSide('a', 'c', { msgs: new Set(['v1']) });
  ok(gotW.length === 2, 'CONTROL: the copy that reads the whole file finds the head line too (2 lines) — the window leg would be red');
  sw.close();
}
// verify r1 (continued, MONEY / the event loop): a COMPACTED log past the trigger. Before: 5 000 messages each holding a
// list snapshot = a 5.4 MiB log that is already one line per message — every append re-read, re-parsed and re-wrote the
// whole file (43 ms per reaction event, 10.8 MiB read + 5.4 MiB written each), and every message whose snapshot sat
// before the newest SIDE_READ_BYTES was invisible to every read (a new reaction on an old message folded into its line
// at the file's head, outside the window). Now a compaction keeps the most recently changed messages, last, within
// SIDE_KEEP_BYTES.
{
  const R = require(path.join(REPO, 'src/channel-record.js'));
  const Rx = require(path.join(REPO, 'src/channel-reactions.js'));
  const N = 5000;
  const id32 = (p, i) => p + String(i).padStart(32, '0');
  const snapOf = (i) => R.validateSide({ k: 'rx', msg: `v${i}`, at: 1e12 + i * 1000 + 5, form: 'snapshot', src: 'list', list: ['THUMBSUP', 'OK', 'DONE'].map((k, j) => ({ key: k, count: 4, by: [0, 1, 2, 3].map((x) => id32('ou_', x + j)), rids: [0, 1, 2, 3].map((x) => id32('rid_', i * 10 + x + j)) })) }).side;
  const deltaOf = (i, n) => R.validateSide({ k: 'rx', msg: `v${i}`, at: 2e12 + n, form: 'delta', op: 'add', key: 'PARTY', actor: { id: id32('ou_z', n) }, src: 'event' }).side;
  const run = (SM, name, EV = 300) => {
    const st = SM.createChannelStore({ dir: path.join(ROOT, name), log: { log() {}, warn() {}, error() {} } });
    const recs = []; for (let i = 0; i < N; i++) recs.push(rec('c', i, 1e12 + i * 1000));
    st.appendRecords('a', 'c', recs);
    for (let i = 0; i < N; i += 500) st.appendSide('a', 'c', Array.from({ length: 500 }, (_, j) => snapOf(i + j)));
    const fp = st.sidePath('a', 'c');
    const size0 = fs.statSync(fp).size;
    const rf = fs.readFileSync, rn = fs.renameSync, ro = fs.openSync;
    let reads = 0, rewrites = 0;
    // a whole-log read = the log opened for reading (the window read, verify r2) or read whole (the pre-r2 reader)
    fs.readFileSync = function (q, ...a) { if (String(q) === fp) reads++; return rf.call(this, q, ...a); };
    fs.openSync = function (q, fl, ...a) { if (String(q) === fp && (fl === 'r' || fl === undefined)) reads++; return ro.call(this, q, fl, ...a); };
    fs.renameSync = function (a, b, ...r) { if (String(b) === fp) rewrites++; return rn.call(this, a, b, ...r); };
    const t0 = process.hrtime.bigint();
    try { for (let n = 0; n < EV; n++) st.appendSide('a', 'c', [deltaOf(N - 1 - (n % 50), n)]); }
    finally { fs.readFileSync = rf; fs.renameSync = rn; fs.openSync = ro; }
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    // a new reaction on the OLDEST message after the storm: is it visible to a read?
    st.appendSide('a', 'c', [deltaOf(0, 99999)]);
    const got = st.readSide('a', 'c', { msgs: new Set(['v0']) });
    const f0 = Rx.foldReactions(got.filter((x) => x.k === 'rx'), {});
    const tailIds = new Set(st.readSide('a', 'c', { msgs: new Set(Array.from({ length: 50 }, (_, j) => `v${N - 1 - j}`)) }).map((x) => x.msg));
    const out = { size0, size: fs.statSync(fp).size, reads, rewrites, ms, oldestSeen: f0.some((x) => x.key === 'PARTY'), recentAll: tailIds.size === 50 };
    st.close();
    return out;
  };
  const real = run(S, 'side-thrash');
  ok(real.size0 <= S.SIDE_COMPACT_BYTES + 600 * 1024 && real.size <= S.SIDE_COMPACT_BYTES + 64 * 1024, `5 000 messages' snapshots: the compacted log stays bounded (${(real.size0 / 1024).toFixed(0)} KiB after the snapshots, ${(real.size / 1024).toFixed(0)} KiB after the storm; the trigger is ${S.SIDE_COMPACT_BYTES / 1024} KiB, a compaction keeps ≤ ${S.SIDE_KEEP_BYTES / 1024} KiB)`, JSON.stringify(real));
  ok(real.reads <= 3 && real.rewrites <= 1, `300 reaction events on a log past the trigger: ${real.reads} whole-file read(s), ${real.rewrites} rewrite(s) (${real.ms.toFixed(0)} ms) — a compaction is SIDE_KEEP_BYTES of appends away, never one per event`, JSON.stringify(real));
  ok(real.oldestSeen && real.recentAll, 'a new reaction on the OLDEST message is visible to a read, and so is every recently changed message (the compacted log never outgrows the read window; the most recently changed sit last)', JSON.stringify(real));
  // CONTROL: the pre-fix compaction (every message kept, first-appearance order) — re-read + re-written per event, and
  // the oldest message's new reaction folded into a line outside the window
  const src = fs.readFileSync(path.join(REPO, 'src/channel-store.js'), 'utf-8');
  const BOUND = '      if (from < groups.length && bytes + b > SIDE_KEEP_BYTES) break;';
  const ORDER = '    const order = [...byMsg.keys()].sort((a, b) => last.get(a) - last.get(b));';
  ok(src.split(BOUND).length === 2 && src.split(ORDER).length === 2, 'CONTROL setup: the output bound and the recency order are each present once');
  const PT = require(MUTCS.write('src/channel-store.js', src.replace(BOUND, '      if (false) break;').replace(ORDER, '    const order = [...byMsg.keys()];'), 'side-unbounded-compaction'));
  const pre = run(PT, 'side-thrash-pre', 20);
  // (verify r2: the compaction's INPUT is the read window now, so even the pre-fix compaction can no longer fold a new
  // reaction into a line outside the window — the visibility half has a second belt; the THRASH half is still this
  // control's to show)
  ok(pre.size > S.SIDE_COMPACT_BYTES && pre.reads >= 20 && pre.rewrites >= 20, `CONTROL: the pre-fix compaction (no output bound) re-reads the ${(pre.size / 1048576).toFixed(1)} MiB log ${pre.reads}× and re-writes it ${pre.rewrites}× for 20 events (${pre.ms.toFixed(0)} ms) — the thrash assert above would be red`, JSON.stringify(pre));
}
// NEGATIVE CONTROL — a copy that REMEMBERS the side keys BEFORE the bytes: one failed write makes the line a phantom duplicate
{
  const src = fs.readFileSync(path.join(REPO, 'src/channel-store.js'), 'utf-8');
  const PRE = src.replace("      inBatch.add(k);\n      fresh.push(x);\n    }\n    if (!fresh.length) return { appended: 0, duplicates, msgs: [] };", "      inBatch.add(k); set.add(k);\n      fresh.push(x);\n    }\n    if (!fresh.length) return { appended: 0, duplicates, msgs: [] };").replace("    catch (e) { sideDedup.delete(`${adapterId}/${convId}`); throw e; }", '    catch (e) { throw e; }');
  ok(PRE !== src, 'NEGATIVE CONTROL setup: the remember-before-the-bytes side writer was reconstructed from the shipped bytes');
  const PS = require(MUTCS.write('src/channel-store.js', PRE, 'side-prefix'));
  const R = require(path.join(REPO, 'src/channel-record.js'));
  const st = PS.createChannelStore({ dir: path.join(ROOT, 'side-pre') });
  st.appendRecords('a', 'c', [rec('c', 1)]);
  const x = R.validateSide({ k: 'rx', msg: 'v1', at: NOW, form: 'delta', op: 'add', key: 'OK', actor: { id: 'u' }, src: 'event' }).side;
  st.appendSide('a', 'c', [R.validateSide({ k: 'rx', msg: 'v1', at: NOW - 1, form: 'delta', op: 'add', key: 'SOB', actor: { id: 'w' }, src: 'event' }).side]);   // the set is cached now
  const sp = st.sidePath('a', 'c');
  const saved = fs.readFileSync(sp);
  fs.unlinkSync(sp); fs.mkdirSync(sp);                                  // EISDIR inside the write
  try { st.appendSide('a', 'c', [x]); } catch {}
  fs.rmdirSync(sp); fs.writeFileSync(sp, saved);
  const again = st.appendSide('a', 'c', [x]);
  ok(again.appended === 0 && again.duplicates === 1 && st.readSide('a', 'c', { msgs: new Set(['v1']) }).length === 1, 'NEGATIVE CONTROL: the remember-before copy calls the never-written reaction a DUPLICATE for ever (the real store appends it — above)', JSON.stringify(again));
  st.close();
}

// ── ⑫ THE SIDE-LOG COST CENSUS (lane channel-threads verify r2, MONEY / the event loop) ──
// Round 1 found three instances of one class (a storm grew the side log without bound; a compact-but-large log was
// re-read + re-written per event; a reaction event scanned the store). This is the census of the class:
//  (a) STATIC, grep-derived (comments stripped): nothing outside the store names the side log's place; every store
//      function that touches a side file is on a CLOSED table with its bound; none reads a file whole
//      (`fs.readFileSync`) — every read is `sideTail`'s bounded `readSync` (the newest SIDE_READ_BYTES); a write is
//      `appendLines` (append-only) or the compaction's temp + rename; the engine never widens a side read.
//  (b) BYTES, deterministic: 100 reaction events (the append + the broadcast fold's read) on a 1 / 2 / 4 MiB log read
//      at most one window per event after the first, the SAME bytes whatever the log's size — with a working
//      compaction and with one that FAILS (its temp path refused: verify r2 — it used to be retried per event, each
//      attempt reading the whole growing file).
//  (c) TIME: the same 100 events, 2× the log ⇒ ≤ 2.5× the time (n / 2n interleaved, median, ≤ 3 attempts), on the
//      compaction's worst case (one message's distinct keys).
//  CONTROLS: the pre-r2 store (whole-file reads, a failed compaction retried per event) reads MORE per event as the
//  log grows (b red); a store bound to the pre-r1 quadratic compactSide reads ×4 per doubling (c red).
console.log('\n⑫ the side-log cost census — bounded reads, append-only writes, O(1) amortised per event');
{
  const R = require(path.join(REPO, 'src/channel-record.js'));
  const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/(^|[^:\\'"`])\/\/.*$/gm, '$1');
  const STORE = 'src/channel-store.js';
  const srcS = fs.readFileSync(path.join(REPO, STORE), 'utf-8');
  // (a) THE STATIC CENSUS
  const SIDE_FNS = {
    sidePath: 'the path — `msgs/<a>/~side/<conv>.ndjson`',
    sideTail: 'THE READ PRIMITIVE: one readSync of at most `maxBytes` from the end (a partial first line dropped)',
    sideWindow: 'the lines of the read window — sideTail(…, SIDE_READ_BYTES)',
    sideLines: 'sideWindow',
    sideDedupSet: 'the dedup rebuild — sideLines (the window)',
    appendSide: 'appendLines (append-only) + the growth compaction past SIDE_COMPACT_BYTES, backed off SIDE_KEEP_BYTES after a failure',
    readSide: 'sideTail (the window, ≥ 64 KiB, default SIDE_READ_BYTES)',
    trimSide: 'sideWindow + a temp write ≤ SIDE_KEEP_BYTES + rename',
    trim: 'trimSide (inside the message trim — its own reads and writes are the MESSAGE log\'s, bounded by retention)',
    placesOf: 'lane lark-threads (A1): sideLines (the window) — the place patches folded ONCE per conversation, cached (PLACE_CACHE_MAX)',
  };
  const VIA_ONLY = new Set(['trim']);   // touches a side file only through a listed function
  const code = strip(srcS);
  // each function's body = its declaration to its own closing brace at the factory's indent (a one-line arrow: its line)
  const bodies = new Map();
  for (const m of code.matchAll(/\n  (?:async\s+)?function\s+(\w+)\s*\(|\n  const (\w+) = \(/g)) {
    const end = m[1] ? code.indexOf('\n  }\n', m.index + 1) + 4 : code.indexOf('\n', m.index + 1);
    bodies.set(m[1] || m[2], code.slice(m.index, end > m.index ? end : code.length));
  }
  const touches = [...bodies].filter(([n, b]) => /\b(?:sidePath|sideTail|sideWindow|sideLines|sideDedupSet|trimSide)\(|SIDE_DIR\b/.test(b) && n !== 'sidePath').map(([n]) => n);
  const unlisted = touches.filter((n) => !SIDE_FNS[n]);
  const dead = Object.keys(SIDE_FNS).filter((n) => !bodies.has(n));
  const wholeReads = Object.keys(SIDE_FNS).filter((n) => !VIA_ONLY.has(n) && bodies.has(n) && /\bfs\.(?:readFileSync|promises\.readFile)\(/.test(bodies.get(n)));
  const tailRead = /const n = fs\.readSync\(fd, b, 0, maxBytes, size - maxBytes\);/.test(bodies.get('sideTail') || '') && /if \(size <= maxBytes\)/.test(bodies.get('sideTail') || '');
  const windowRead = /sideTail\(sidePath\(adapterId, convId\), SIDE_READ_BYTES/.test(bodies.get('sideWindow') || '') && /sideTail\(sidePath\(adapterId, convId\), Math\.max\(64 \* 1024, Number\(maxBytes\) \|\| SIDE_READ_BYTES\)\)/.test(bodies.get('readSide') || '');
  const writes = Object.keys(SIDE_FNS).filter((n) => !VIA_ONLY.has(n) && bodies.has(n) && /\bfs\.(?:writeFileSync|appendFileSync|renameSync)\(|\bappendLines\(/.test(bodies.get(n)));
  ok(touches.length >= 6 && !unlisted.length && !dead.length, `(a) every store function that touches a side file is on the closed table (${touches.join(', ')})${unlisted.length ? ' — UNLISTED: ' + unlisted.join(', ') : ''}${dead.length ? ' — dead rows: ' + dead.join(', ') : ''}`);
  ok(!wholeReads.length && tailRead && windowRead, `(a) no side function reads a file whole — every read is sideTail's bounded readSync, the window SIDE_READ_BYTES (${(S.SIDE_READ_BYTES / 1048576).toFixed(0)} MiB)${wholeReads.length ? ' — whole reads in: ' + wholeReads.join(', ') : ''}`);
  ok(writes.sort().join() === 'appendSide,trimSide' && /appendLines\(fp, /.test(bodies.get('appendSide')) && /const tmp = `\$\{fp\}\.tmp-\$\{process\.pid\}`;[\s\S]*fs\.renameSync\(tmp, fp\)/.test(bodies.get('trimSide')), `(a) the side writes are appendSide's append (append-only) and trimSide's temp + rename (${writes.join(', ')})`);
  const walkJs = (d, out = []) => { for (const e of fs.readdirSync(path.join(REPO, d), { withFileTypes: true })) { const f = `${d}/${e.name}`; if (e.isDirectory()) walkJs(f, out); else if (/\.(c|m)?js$/.test(e.name)) out.push(f); } return out; };
  const namers = walkJs('src').filter((f) => f !== STORE && /\bsidePath\(|\bSIDE_DIR\b|['"`]~side\b|\bsideTail\(|\bsideLines\(/.test(strip(fs.readFileSync(path.join(REPO, f), 'utf-8'))));
  const eng = strip(fs.readFileSync(path.join(REPO, 'src/server/channels-engine.js'), 'utf-8'));
  const widened = [...eng.matchAll(/store\.readSide\([^)]*\)/g)].map((m) => m[0]).filter((c) => /maxBytes|limit/.test(c));
  ok(!namers.length && !widened.length && [...eng.matchAll(/store\.readSide\(/g)].length >= 2, `(a) nothing outside the store names the side log's place (${namers.length ? namers.join(', ') : 'none'}) and no engine read widens the window (${widened.length ? widened.join(' | ') : 'none'})`);
  // (b) + (c) the per-event cost at 1 / 2 / 4 MiB
  const id24 = (p, i) => p + String(i).padStart(24, '0');
  const snapOf = (i) => R.validateSide({ k: 'rx', msg: `v${i}`, at: 1e12 + i * 1000 + 5, form: 'snapshot', src: 'list', list: ['THUMBSUP', 'OK'].map((k, j) => ({ key: k, count: 3, by: [0, 1, 2].map((x) => id24('ou_', x + j)), rids: [0, 1, 2].map((x) => id24('rid_', i * 10 + x + j)) })) }).side;
  const keyDelta = (i) => R.validateSide({ k: 'rx', msg: 'hot', at: 1e12 + i, form: 'delta', op: 'add', key: 'K_' + 'x'.repeat(48) + i, actor: { id: 'u' + (i % 300) }, src: 'event' }).side;   // long distinct keys (a common prefix): each comparison of a per-key scan costs its length
  const evDelta = (msg, n) => R.validateSide({ k: 'rx', msg, at: 2e12 + n, form: 'delta', op: 'add', key: 'PARTY', actor: { id: id24('ou_z', n) }, src: 'event' }).side;
  let runSeq = 0;
  /** ONE run: a fresh store, a preloaded side log of `mib` MiB (`shape` 'rooms' = distinct messages' snapshots, 'hot' = one
   *  message's distinct keys — the compaction's worst case), then 100 events = the append + the broadcast fold's read. */
  const costRun = (SM, mib, { shape = 'rooms', failing = false } = {}) => {
    const st = SM.createChannelStore({ dir: path.join(ROOT, `cost-${++runSeq}`), log: { log() {}, warn() {}, error() {} } });
    const fp = st.sidePath('a', 'c');
    fs.mkdirSync(path.dirname(fp), { recursive: true });
    const lines = []; let bytes = 0, i = 0;
    while (bytes < mib * 1048576) { const l = JSON.stringify(shape === 'hot' ? keyDelta(i) : snapOf(i)); i++; lines.push(l); bytes += l.length + 1; }
    fs.writeFileSync(fp, lines.join('\n') + '\n');
    const msgOf = (n) => (shape === 'hot' ? 'hot' : `v${i - 1 - (n % 20)}`);
    if (failing) fs.mkdirSync(`${fp}.tmp-${process.pid}`, { recursive: true });   // every compaction attempt: EISDIR on its temp write
    let read = 0, first = 0;
    const rf = fs.readFileSync, rs = fs.readSync;
    fs.readFileSync = function (q, ...a) { const o = rf.call(this, q, ...a); if (String(q) === fp) read += Buffer.byteLength(o); return o; };
    fs.readSync = function (...a) { const n = rs.apply(this, a); read += n; return n; };
    const t0 = process.hrtime.bigint();
    try {
      for (let n = 0; n < 100; n++) {
        st.appendSide('a', 'c', [evDelta(msgOf(n), n)]);
        st.readSide('a', 'c', { msgs: new Set([msgOf(n)]) });
        if (n === 0) first = read;
      }
    } finally { fs.readFileSync = rf; fs.readSync = rs; }
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    if (failing) { try { fs.rmdirSync(`${fp}.tmp-${process.pid}`); } catch { } }
    st.close && st.close();
    return { ms, perEvent: (read - first) / 99, read };
  };
  const bytesLeg = (SM, failing) => [1, 2, 4].map((mib) => ({ mib, ...costRun(SM, mib, { failing }) }));
  const W = S.SIDE_READ_BYTES;
  const inWindow = (rows) => rows.every((r) => r.perEvent <= W + 64 * 1024);
  const flat = (rows) => inWindow(rows) && rows[2].perEvent <= 1.25 * rows[0].perEvent;
  const good = bytesLeg(S, false), bad = bytesLeg(S, true);
  const fmt = (rows) => rows.map((r) => `${r.mib} MiB: ${(r.perEvent / 1024).toFixed(0)} KiB/event`).join(', ');
  ok(flat(good), `(b) 100 events with a working compaction read ≤ one window per event, the same whatever the log's size (${fmt(good)})`);
  ok(inWindow(bad), `(b) …and with a compaction that FAILS every attempt (the log grows): never more than ONE WINDOW per event whatever its size — a failed compaction is retried SIDE_KEEP_BYTES later, never per event (${fmt(bad)})`);
  // (c) time, interleaved n / 2n, median of 5 pairs, ≤ 3 attempts, on the compaction's worst case
  const timeLeg = (SM) => {
    const out = [];
    for (const [a, b] of [[1, 2], [2, 4]]) {
      const tries = [];
      for (let t = 0; t < 3; t++) {
        const rs = [];
        for (let k = 0; k < 5; k++) { const x = costRun(SM, a, { shape: 'hot' }).ms, y = costRun(SM, b, { shape: 'hot' }).ms; rs.push(y / x); }
        rs.sort((p, q) => p - q);
        tries.push(rs[2]);
        if (rs[2] <= 2.5) break;
      }
      out.push({ from: a, to: b, r: tries[tries.length - 1], tries });
    }
    return out;
  };
  const tl = timeLeg(S);
  ok(tl.every((x) => x.r <= 2.5), `(c) 100 events on the compaction's worst case (one message's distinct keys): 2× the log ⇒ ≤ 2.5× the time — ${tl.map((x) => `${x.from}→${x.to} MiB ×${x.r.toFixed(2)}${x.tries.length > 1 ? ` (attempts ${x.tries.map((r) => '×' + r.toFixed(2)).join(', ')})` : ''}`).join(', ')}`);
  // CONTROL (i): the pre-r2 store — the whole-file window reader and the per-event retry of a failed compaction
  const PRE_WIN = "    try { tail = sideTail(sidePath(adapterId, convId), SIDE_READ_BYTES, { strict }); } catch (e) { if (strict) throw e; return { lines: [], cut: false }; }";
  const PRE_GATE = '    if (size > SIDE_COMPACT_BYTES && !(failedAt !== undefined && size < failedAt + SIDE_KEEP_BYTES)) {';
  ok(srcS.split(PRE_WIN).length === 2 && srcS.split(PRE_GATE).length === 2, 'CONTROL (i) setup: the window read and the compaction back-off are each present once');
  const preSrc = srcS.replace(PRE_WIN, "    try { tail = { text: fs.readFileSync(sidePath(adapterId, convId), 'utf-8'), cut: false }; } catch (e) { if (strict && e.code !== 'ENOENT') throw e; return { lines: [], cut: false }; }").replace(PRE_GATE, '    if (size > SIDE_COMPACT_BYTES) {');
  const PS = require(MUTCS.write(STORE, preSrc, 'side-pre-r2'));
  const preBad = bytesLeg(PS, true);
  ok(!inWindow(preBad) && preBad[2].perEvent >= 2 * preBad[0].perEvent, `CONTROL (i): the pre-r2 store under a failing compaction reads the WHOLE growing log per event — more than a window, more as it grows (${fmt(preBad)}) — (b) would be red`);
  // CONTROL (ii): a store bound to the pre-r1 QUADRATIC compactSide (a closed world: the store copy requires the copy)
  const rxSrc = fs.readFileSync(path.join(REPO, 'src/channel-reactions.js'), 'utf-8');
  const qSrc = rxSrc
    .replace('    const order = new Set();   // first appearance, never removed (a key that fell to 0 and came back keeps its place)', '    const order = [];')
    .replace('      if (count > 0) { state.set(e.key, { count, by }); order.add(e.key); }', '      if (count > 0) { state.set(e.key, { count, by }); order.push(e.key); }')
    .replace('        if (!s) { s = { count: 0, by: [] }; state.set(x.key, s); order.add(x.key); }', '        if (!s) { s = { count: 0, by: [] }; state.set(x.key, s); if (!order.includes(x.key)) order.push(x.key); }');
  ok((qSrc.match(/order\.push/g) || []).length === 2 && qSrc.includes('order.includes(x.key)'), 'CONTROL (ii) setup: the pre-r1 quadratic compactSide was reconstructed (3 edits)');
  const qPath = MUTCS.write('src/channel-reactions.js', qSrc, 'compact-quadratic');
  const IMP = "const { compactSide } = require('./channel-reactions.js');";
  ok(srcS.split(IMP).length === 2, 'CONTROL (ii) setup: the store imports compactSide once');
  const QS = require(MUTCS.write(STORE, srcS.replace(IMP, `const { compactSide } = require(${JSON.stringify(qPath)});`), 'side-quadratic'));
  const qt = timeLeg(QS);
  ok(qt[0].tries.length === 3 && qt[0].tries.every((r) => r > 2.5), `CONTROL (ii): bound to the pre-r1 quadratic compaction the same leg reads ${qt[0].tries.map((r) => '×' + r.toFixed(2)).join(', ')} per doubling (1→2 MiB) on every attempt — (c) would be red`);
}

// ⑫b verify r2 (MONEY): the custom-emoji picture cache's BOUND — the pictures live in the account's attachment LRU
// (`~emoji` — a name no conversation id spells), counted in its usage and evicted least-recently-used with the
// attachments at the account's budget; a picture used since outlives an older one
console.log('⑫b the custom-emoji picture cache: the account\'s attachment budget, LRU');
{
  const st = mk('emoji-lru');
  const MB = 1024 * 1024;
  const budget = 2 * MB;
  const e1 = await st.attachmentPut('a', '~emoji', 'party_parrot', { data: Buffer.alloc(300 * 1024, 1), name: 'party_parrot.png', mime: 'image/png' }, { budgetBytes: budget });
  const e2 = await st.attachmentPut('a', '~emoji', 'shipit', { data: Buffer.alloc(300 * 1024, 2), name: 'shipit.png', mime: 'image/png' }, { budgetBytes: budget });
  ok(st.attachmentUsage('a').bytes === 600 * 1024 && st.attachmentUsage('a').files === 2 && !String(e1.file).includes('party_parrot'), 'two custom-emoji pictures count in the ACCOUNT\'s attachment usage (their file names are hashes, never the key)', JSON.stringify(st.attachmentUsage('a')));
  await new Promise((r) => setTimeout(r, 5));
  st.attachmentGet('a', '~emoji', 'shipit');   // drawn since: the LRU keeps it
  await new Promise((r) => setTimeout(r, 5));
  const a1 = await st.attachmentPut('a', 'c', 'att-1', { data: Buffer.alloc(700 * 1024, 3), name: 'a.bin', mime: 'application/octet-stream' }, { budgetBytes: budget });
  const a2 = await st.attachmentPut('a', 'c', 'att-2', { data: Buffer.alloc(800 * 1024, 4), name: 'b.bin', mime: 'application/octet-stream' }, { budgetBytes: budget });
  const u = st.attachmentUsage('a');
  ok(u.bytes <= budget && [...(a1.evicted || []), ...(a2.evicted || [])].length === 1 && !st.attachmentGet('a', '~emoji', 'party_parrot') && !!st.attachmentGet('a', '~emoji', 'shipit') && !!st.attachmentGet('a', 'c', 'att-2'), `past the budget the least-recently-used picture goes first — the untouched emoji evicted, the one drawn since kept, the newest attachment kept (${Math.round(u.bytes / 1024)} KiB ≤ ${budget / 1024} KiB; evicted ${[...(a1.evicted || []), ...(a2.evicted || [])].length})`, JSON.stringify(u));
  st.close && st.close();
}

// ⑬ lane lark-threads (A1, 2026-10-01 — the owner's post: a Lark message stored BEFORE anyone answered it in a thread
// carries no thread id, and the log's dedup kept that first copy for ever; the later copy naming the thread was thrown
// away). THE PLACE DOOR: widen-only (null → the vendor's key / root; never the reverse, never another field), every append
// path offers its duplicates, every read serves the patched record, ONE write-hook event per widening, the side
// compaction keeps the patch, the log's trim folds it into the line and drops the side line. CONTROL: the pre-lane
// append (duplicates offered to nobody) loses the thread.
console.log('\n⑬ lane lark-threads: the place door (widen-only)');
{
  const R = require(path.join(REPO, 'src/channel-record.js'));
  const hooks = [];
  const st = S.createChannelStore({ dir: path.join(ROOT, 'place'), onWrite: (a, c, w) => hooks.push({ a, c, kind: w && w.kind, patched: w && w.patched }) });
  const root = { ...rec('g', 1), text: 'the post' };
  const reply = { ...rec('g', 2), replyTo: 'v1', threadKey: 'v1', root: 'v1', text: 'a quote' };   // a quote reply: a chain key
  st.appendRecords('a', 'g', [root, reply, rec('g', 3)]);
  // the vendor's later copy of the root: it heads a topic now (the chat listing re-read / the walk's repeated root)
  const later = { ...root, threadKey: 'omt_born', text: 'EDITED TEXT', author: { id: 'x', name: 'Mallory', isSelf: false, isBot: false } };
  const a1 = st.appendRecords('a', 'g', [later, rec('g', 4)]);
  const tail = st.readTail('a', 'g', { limit: 10 });
  const r1 = tail.find((r) => r.vendorId === 'v1');
  ok(a1.appended === 1 && a1.duplicates === 1 && a1.widened.length === 1 && a1.widened[0].vendorId === 'v1' && a1.widened[0].threadKey === 'omt_born' && r1.threadKey === 'omt_born' && r1.text === 'the post' && r1.author.name === 'U',
    '⑬ a later copy of a stored root that names its new thread WIDENS the stored place (threadKey null → omt_born) through appendRecords — the text and the author stay the first copy\'s (never any other field)', JSON.stringify({ a1, r1 }));
  const ph = hooks.filter((h) => h.kind === 'place');
  ok(ph.length === 1 && ph[0].a === 'a' && ph[0].c === 'g' && JSON.stringify(ph[0].patched) === JSON.stringify([{ vendorId: 'v1', threadKey: 'omt_born', root: null }]), '⑬ ONE write-hook event per widening, naming the patched message (the engine\'s caches and windows re-derive from it)', JSON.stringify(ph));
  // NEVER THE REVERSE, NEVER A KEY REPLACED: a copy without the thread, a copy naming ANOTHER thread, a chain key replaced
  const a2 = st.appendRecords('a', 'g', [{ ...root, threadKey: null }, { ...root, threadKey: 'omt_other' }, { ...reply, threadKey: 'omt_x' }]);
  const t2 = st.readTail('a', 'g', { limit: 10 });
  ok(a2.widened.length === 0 && t2.find((r) => r.vendorId === 'v1').threadKey === 'omt_born' && t2.find((r) => r.vendorId === 'v2').threadKey === 'v1' && st.placesOf('a', 'g').size === 1,
    '⑬ widen-only: a copy without the thread, a copy naming another thread and a stored chain key are all no-ops (no side line, no flip)', JSON.stringify(a2.widened));
  // verify r1 F5: a copy naming ANOTHER thread than the stored one is refused (never changed) and SAID once per conversation
  {
    const warned = [];
    const st6 = S.createChannelStore({ dir: path.join(ROOT, 'place-conflict'), log: { warn: (m) => warned.push(String(m)), log() {} } });
    st6.appendRecords('a', 'g', [{ ...root, threadKey: 'omt_first' }, rec('g', 2)]);
    const c1 = st6.widenPlaces('a', 'g', [{ vendorId: 'v1', threadKey: 'omt_OTHER' }], { src: 'recheck' });
    const c2 = st6.widenPlaces('a', 'g', [{ vendorId: 'v1', threadKey: 'omt_OTHER' }], { src: 'recheck' });
    const c3 = st6.appendRecords('a', 'g', [{ ...root, threadKey: 'omt_THIRD' }]);
    const kept = st6.readTail('a', 'g', { limit: 5 }).find((r) => r.vendorId === 'v1').threadKey;
    ok(c1.widened.length === 0 && JSON.stringify(c1.conflicts) === JSON.stringify([{ vendorId: 'v1', stored: 'omt_first', offered: 'omt_OTHER' }]) && c2.conflicts.length === 1 && c3.widened.length === 0 && kept === 'omt_first' && warned.filter((w) => /DIFFERENT thread id/.test(w)).length === 1 && /omt_first/.test(warned[0]) && /omt_OTHER/.test(warned[0]),
      '⑬ verify r1 F5: a copy naming another thread is refused by name (`conflicts`: stored + offered), the stored place never changes, and the door SAYS it once per conversation (three offers, one line)', JSON.stringify({ c1, c2: c2.conflicts, kept, warned }));
    st6.close();
  }
  // the DOOR directly: an unknown message is `unknown` (the caller ingests it); a root offered for a reply that lacks one
  const d1 = st.widenPlaces('a', 'g', [{ vendorId: 'v-nope', threadKey: 'omt_z' }, { vendorId: 'v3', root: 'v3' }, { vendorId: 'v3', threadKey: 'omt_3' }], { src: 'walk' });
  ok(JSON.stringify(d1.unknown) === JSON.stringify(['v-nope']) && d1.widened.length === 1 && d1.widened[0].vendorId === 'v3' && d1.widened[0].threadKey === 'omt_3' && d1.widened[0].root === null,
    '⑬ the door judges only a STORED message (unknown ⇒ named back, never written); a root equal to the message is no root (no line); a second offer of one message is judged against the first\'s widening', JSON.stringify(d1));
  // EVERY READ serves the patch: findRecord, oldestRecord, search — and a fresh store over the same dir (a restart)
  const st2 = S.createChannelStore({ dir: path.join(ROOT, 'place') });
  const fr = st2.findRecord('a', 'g', 'v1'), od = st2.oldestRecord('a', 'g');
  {
    const sr = await st2.search('a', 'the post');
    ok(fr && fr.threadKey === 'omt_born' && od && od.vendorId === 'v1' && od.threadKey === 'omt_born' && sr.results.length === 1 && sr.results[0].threadKey === 'omt_born' && st2.readTail('a', 'g', { limit: 10 }).find((r) => r.vendorId === 'v3').threadKey === 'omt_3',
      '⑬ every reader serves the patched record — findRecord, oldestRecord, search, readTail — across a restart (the side line is the durable fact)', JSON.stringify({ fr: fr && fr.threadKey, od: od && od.threadKey, sr: sr.results.map((r) => r.threadKey) }));
  }
  // THE BYTES: the message line is untouched (append-only), the patch is ONE validated side line
  const logText = fs.readFileSync(st2.logPath('a', 'g'), 'utf-8');
  const sideL = fs.readFileSync(st2.sidePath('a', 'g'), 'utf-8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  ok(!logText.includes('omt_born') && sideL.length === 2 && sideL.every((x) => x.k === 'pl' && R.validateSide(x).ok) && sideL.find((x) => x.msg === 'v3').src === 'walk',
    '⑬ the message log stays append-only (the line as first written); each widening is ONE validated `pl` side line naming where it came from', JSON.stringify(sideL));
  // THE SIDE COMPACTION KEEPS IT: 1+ MiB of reactions on another message — the place line survives, never "forgotten"
  const many = [];
  for (let i = 0; i < 9000; i++) many.push(R.validateSide({ k: 'rx', msg: 'v4', at: NOW + i, form: 'delta', op: i % 2 ? 'remove' : 'add', key: 'OK', actor: { id: `u${i % 300}`, name: 'Some One With A Long Name ' + i }, src: 'event' }).side);
  for (let i = 0; i < many.length; i += 500) st2.appendSide('a', 'g', many.slice(i, i + 500));
  const st3 = S.createChannelStore({ dir: path.join(ROOT, 'place') });
  const sideAfter = fs.readFileSync(st3.sidePath('a', 'g'), 'utf-8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  ok(fs.statSync(st3.sidePath('a', 'g')).size < S.SIDE_COMPACT_BYTES * 2 && sideAfter.filter((x) => x.k === 'pl').length === 2 && st3.readTail('a', 'g', { limit: 10 }).find((r) => r.vendorId === 'v1').threadKey === 'omt_born',
    '⑬ the side log\'s growth compaction (a reaction storm past 1 MiB) KEEPS the place lines — a patch is never forgotten like an old reaction', JSON.stringify({ size: fs.statSync(st3.sidePath('a', 'g')).size, pl: sideAfter.filter((x) => x.k === 'pl').length }));
  // THE TRIM FOLDS IT: the message line carries the place, the side line goes; the read is unchanged
  const tr = st3.trim('a', 'g');
  const log2 = fs.readFileSync(st3.logPath('a', 'g'), 'utf-8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const side2 = fs.readFileSync(st3.sidePath('a', 'g'), 'utf-8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const st4 = S.createChannelStore({ dir: path.join(ROOT, 'place') });
  ok(tr.folded === 2 && log2.find((r) => r.vendorId === 'v1').threadKey === 'omt_born' && log2.find((r) => r.vendorId === 'v3').threadKey === 'omt_3' && side2.filter((x) => x.k === 'pl').length === 0 && st4.placesOf('a', 'g').size === 0 && st4.readTail('a', 'g', { limit: 10 }).find((r) => r.vendorId === 'v1').threadKey === 'omt_born',
    '⑬ the log\'s trim FOLDS the patches into the message lines (temp + rename) and only then drops the side lines — the read is unchanged', JSON.stringify({ tr, pl: side2.filter((x) => x.k === 'pl') }));
  // the PREPEND path (an older page) offers its duplicates too
  const st5 = S.createChannelStore({ dir: path.join(ROOT, 'place-pre') });
  st5.appendRecords('a', 'h', [rec('h', 10), rec('h', 11)]);
  const pp = st5.prependRecords('a', 'h', [{ ...rec('h', 10), threadKey: 'omt_old' }, rec('h', 9, NOW - 500e3)]);
  ok(pp.appended === 1 && pp.widened.length === 1 && st5.readTail('a', 'h', { limit: 5 }).find((r) => r.vendorId === 'v10').threadKey === 'omt_old', '⑬ the backfill (prependRecords) offers its duplicates to the door as well', JSON.stringify(pp));
  // CONTROL: the pre-lane append — a duplicate offered to nobody — keeps the key-less first copy for ever
  const src = fs.readFileSync(path.join(REPO, 'src/channel-store.js'), 'utf-8');
  const PRE = src.replace("if (set.has(r.vendorId) || inBatch.has(r.vendorId)) { duplicates++; if (set.has(r.vendorId) && (r.threadKey || r.root)) offers.push(r); continue; }", "if (set.has(r.vendorId) || inBatch.has(r.vendorId)) { duplicates++; continue; }");
  ok(PRE !== src, '⑬ CONTROL setup: the pre-lane append (duplicates offered to nobody) was reconstructed from the shipped bytes');
  const PS = require(MUTCS.write('src/channel-store.js', PRE, 'place-pre-lane'));
  const sc = PS.createChannelStore({ dir: path.join(ROOT, 'place-ctl') });
  sc.appendRecords('a', 'g', [root]);
  sc.appendRecords('a', 'g', [later]);
  ok(sc.readTail('a', 'g', { limit: 5 })[0].threadKey === null && sc.placesOf('a', 'g').size === 0, '⑬ CONTROL: through the pre-lane append the later copy naming the thread is thrown away — the root never heads its topic (the owner\'s post)');
  for (const x of [st, st2, st3, st4, st5, sc]) x.close();
}

// ── ⑩ THE TREE IS NEVER WRITTEN (B-0220 generalized, batch r1) ──
// Measured HERE, while every patched copy this run made still exists (the exit
// handlers remove them — a census taken after exit passes on the pre-fix
// placement too). The copies used to be SIBLINGS inside src/ (gitignored, so
// a plain `git status` never saw them) and any suite scanning src/ beside this
// one counted them as product code; they are written to this process's scratch
// dir now (scripts/mutant-copy.mjs).
console.log('\n⑬ the incremental index write (B-f32b verify r1): an async update, a row born past the door, the map order');
{
  const src = fs.readFileSync(path.join(REPO, 'src/channel-store.js'), 'utf-8');
  const qlog = { log() {}, info() {}, warn() {}, error() {} };
  const RT = (k, v) => (k.startsWith('_') ? undefined : v);
  const disk = (dir) => fs.readFileSync(path.join(dir, 'index.json'), 'utf-8');
  // the gates' drift census (VIBESPACE_CHANNELS_INDEX_VERIFY) rewrites a drifted write whole — it would heal the controls below
  const verifyEnv = process.env.VIBESPACE_CHANNELS_INDEX_VERIFY; delete process.env.VIBESPACE_CHANNELS_INDEX_VERIFY;
  const legs = async (M, tag) => {
    const res = {};
    { // (a) an async update fn, a write inside its await, the fn changes its row after it
      const dir = path.join(ROOT, `ir1-async-${tag}`); fs.mkdirSync(dir, { recursive: true });
      const st = M.createChannelStore({ dir, log: qlog });
      await st.index.update(() => { st.index.entry('a', 'c0').title = 'boot'; }); st.index.flush();
      await st.index.update(() => { st.index.entry('a', 'c1').unread = 5; });   // a write is owed (the flush below is a real one)
      await st.index.update(async () => { const en = st.index.entry('a', 'c2'); en.v = 1; await new Promise((r) => setTimeout(r, 1)); st.index.flush(); en.v = 2; });
      st.index.flush();
      res.async = JSON.parse(disk(dir)).conversations['a/c2'].v;
      st.close();
    }
    { // (b) a row BORN outside entry() (the one-door rule broken): one sweep cycle writes it
      const dir = path.join(ROOT, `ir1-born-${tag}`); fs.mkdirSync(dir, { recursive: true });
      const st = M.createChannelStore({ dir, log: qlog });
      await st.index.update(() => { for (let i = 0; i < 600; i++) st.index.entry('a', 'c' + i); }); st.index.flush();
      st.index.live()['a/ghost'] = { key: 'a/ghost', id: 'ghost', adapterId: 'a', title: 'born past the door' };
      for (let i = 0; i < 3; i++) st.index.sweep();
      st.index.flush();
      res.born = !!JSON.parse(disk(dir)).conversations['a/ghost'];
      st.close();
    }
    { // (c) the file keeps the map's order: a row removed + re-born in one write window; a touch before a birth
      const dir = path.join(ROOT, `ir1-order-${tag}`); fs.mkdirSync(dir, { recursive: true });
      const st = M.createChannelStore({ dir, log: qlog });
      await st.index.update(() => { for (let i = 0; i < 600; i++) st.index.entry('a', 'c' + i); }); st.index.flush();
      await st.index.update(() => { const r = st.index.rows(); delete r['a/c20']; st.index.touch('a/c20'); st.index.entry('a', 'c20').title = 'reborn'; });
      st.index.flush();
      res.reborn = disk(dir) === JSON.stringify(st.index.snapshot(), RT, 1);
      await st.index.update(() => { st.index.touch('a/x'); st.index.entry('a', 'y'); st.index.entry('a', 'x'); });
      st.index.flush();
      res.early = disk(dir) === JSON.stringify(st.index.snapshot(), RT, 1);
      st.close();
    }
    return res;
  };
  const head = await legs(S, 'head');
  ok(head.async === 2, `⑬ an async update fn whose await saw a write: the next write carries the row's LAST state (disk v=${head.async}, memory 2) — the update's rows are marked again at its end`);
  ok(head.born, '⑬ a row born outside entry() reaches the disk within one sweep cycle (the cycle end counts the map against the cached chunks)');
  ok(head.reborn && head.early, `⑬ the incremental file = the whole-file bytes when a row is removed + re-born (${head.reborn}) and when a row is touched before its birth (${head.early})`);
  const DONE = "const done = () => { curTouch = null; if (t.all) { touchAll('update reached the whole map'); } else for (const k of t) { dirtyKeys.add(k); fire(k); } };";
  const CYCLE = /\n    \/\/ verify r1: a row BORN outside `entry\(\)`[^\n]*\n    if \(!drift && sweepAt[^\n]*\n[^\n]*\n[^\n]*\n    \}/;
  const REBORN = /\n      if \(layout && layout\.chunkOf\.has\(key\)\) touchAll\([^\n]*/;
  const TOUCH = /  function touch\(key\) \{[^\n]*/;
  ok(src.includes(DONE) && CYCLE.test(src) && REBORN.test(src) && TOUCH.test(src), '⑬ fixture: the three rules are where the controls cut them');
  const ma = await legs(require(MUTCS.write('src/channel-store.js', src.replace(DONE, 'const done = () => { curTouch = null; if (t.all) fire(null); else for (const k of t) fire(k); };'), 'ir1-nore-mark')), 'm-async');
  ok(ma.async === 1, `⑬ CONTROL: the rows NOT marked again at the update's end — the disk keeps the row as the await left it (v=${ma.async}) — red`);
  const mb = await legs(require(MUTCS.write('src/channel-store.js', src.replace(CYCLE, ''), 'ir1-nocount')), 'm-born');
  ok(!mb.born, '⑬ CONTROL: the sweep without the cycle-end count — the row born past the door never reaches the disk — red');
  const mc = await legs(require(MUTCS.write('src/channel-store.js', src.replace(REBORN, '').replace(TOUCH, '  function touch(key) { touchKey(String(key)); }'), 'ir1-noorder')), 'm-order');
  ok(!mc.reborn && !mc.early, `⑬ CONTROL: without the re-birth / missing-row touch rules the file's order departs from the whole-file bytes (re-born ${mc.reborn}, touched early ${mc.early}) — red`);
  if (verifyEnv !== undefined) process.env.VIBESPACE_CHANNELS_INDEX_VERIFY = verifyEnv;
}

console.log('\n⑩ the patched copies never touch the tree');
for (const r of copiesCensus(MUTCS.files, MUTCS.dir, REPO, { minCopies: 5 })) ok(r.pass, '⑩ ' + r.name + (r.pass ? '' : ' — ' + r.detail));

console.log(fail ? `\nFAILED (${pass} passed, ${fail} failed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);

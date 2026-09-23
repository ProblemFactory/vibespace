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
// ⑤b's negative control writes a PRE-FIX copy of src/channel-store.js BESIDE
// the real module (it must be a SIBLING or that module's relative requires do
// not resolve). The `finally` unlinks it, but a SIGKILL runs no cleanup — and
// a dirty tree is what the release gate REFUSES on. So: it is gitignored (the
// assert below fails if that stanza is ever removed) AND swept at start by PID
// LIVENESS, never by age: this suite can legitimately run twice in one
// worktree, and deleting a copy a LIVE run is importing is worse than litter.
const PATCH_DIR = path.join(REPO, 'src');
// `-<pid>` (⑤b) or `-<pid>-<n>` (r3's controls): each control gets its OWN
// name, because node caches modules by resolved path and two controls sharing
// a filename would silently drive the FIRST patch twice.
const PATCH_RE = /^\.channel-store\.prefix-(\d+)(?:-\d+)?\.js$/;
let patchSeq = 0;
const patchPath = () => path.join(PATCH_DIR, `.channel-store.prefix-${process.pid}-${++patchSeq}.js`);
{
  let swept = 0, spared = [];
  for (const f of fs.readdirSync(PATCH_DIR)) {
    const m = f.match(PATCH_RE);
    if (!m) continue;
    let alive = false;
    try { process.kill(Number(m[1]), 0); alive = true; } catch (e) { alive = e && e.code === 'EPERM'; }
    if (alive) { spared.push(f); continue; }
    try { fs.unlinkSync(path.join(PATCH_DIR, f)); swept++; } catch {}
  }
  if (swept || spared.length) console.log(`  … swept ${swept} stranded patched copies, spared ${spared.length} live (${spared.join(',') || 'none'})`);
}
{
  const gi = fs.readFileSync(path.join(REPO, '.gitignore'), 'utf-8');
  ok(/^src\/\.channel-store\.prefix-\*\.js$/m.test(gi),
    'the pre-fix copy this suite writes into src/ is GITIGNORED — a SIGKILL strands one, and a dirty tree is what the release gate refuses on');
}

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
    const pf = patchPath();
    fs.writeFileSync(pf, PRE);
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
    } finally { try { fs.unlinkSync(pf); } catch {} }
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
  const pf = patchPath();
  fs.writeFileSync(pf, PRE);
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
  } finally { try { fs.unlinkSync(pf); } catch {} }
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
  const pf = patchPath();
  fs.writeFileSync(pf, PRE);
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
  } finally { try { fs.unlinkSync(pf); } catch {} }
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
  const pf = patchPath();
  fs.writeFileSync(pf, PRE);
  try {
    const PS = require(pf);
    const r = rebuildUnderFault(PS, 'rebuild-pre-EIO', 'EIO');
    ok(r.threw === null && r.first && r.first.appended === 2 && r.first.duplicates === 0,
      'NEGATIVE CONTROL: the r4 bytes read the unreadable log as EMPTY and append the whole replay — v5 written again', JSON.stringify({ threw: r.threw, first: r.first }));
    ok(r.served === 'v1,v2,v3,v4,v5,v5,v6' && r.dup === 1 && r.unread === 7,
      'NEGATIVE CONTROL: …and the log serves seven rows for six records, for ever', `${r.served} unread=${r.unread}`);
  } finally { try { fs.unlinkSync(pf); } catch {} }
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
  const pf = patchPath();
  fs.writeFileSync(pf, PRE);
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
  } finally { try { fs.unlinkSync(pf); } catch {} }
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
  ok(/if \(appended\)[^\n]*store\.trim\(/.test(eng), '…right after a pass that actually appended, on the ONE conversation that grew (a timer sweeping every conversation would re-read logs nothing touched)', eng.split('\n').filter((l) => /store\.trim/.test(l)).join(' | '));
}

// ── ⑨ tier + hygiene pins ──
{
  const src = fs.readFileSync(path.join(REPO, 'src/channel-store.js'), 'utf-8');
  // A CENSUS READS CODE: this file's own header names the export it refuses
  // to have, so prose is blanked before asking whether one survives.
  const noComments = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const reqs = [...src.matchAll(/require\('([^']+)'\)/g)].map((m) => m[1]);
  ok(reqs.every((r) => ['fs', 'path'].includes(r)), 'the store is SHARED: node builtins only, and only the two it needs', reqs.join(','));
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

console.log(fail ? `\nFAILED (${pass} passed, ${fail} failed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);

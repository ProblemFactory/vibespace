#!/usr/bin/env node
// lane ledger-dedup-law ROUND 2 (B-7f9e, the acceptance of e11e1f61) — THE WHOLE-LEDGER LAWS, each leg beside the RED it
// answers (every leg fails on e11e1f61, the round-1 tip):
//   ① no money decision from a partial ledger — 20 000 rows, a 256 KiB takeover bound, 64 KiB warm steps, two steps in:
//     costBetweenMulti says `partial` (e11e1f61: a few hundred of 20 000 requests answered as the whole), the estimator
//     writes no rates.json and answers no estimate, the anchor sweep waits and runs ONCE on the whole ledger, the automatic
//     pool decision is skipped and said once
//   ② a reload mid-warm RESTARTS the warm — 5000 rows three times, three warm steps, the shard's dedup ends: a warm is
//     pending again and the next sync reader loads nothing in its own tick (e11e1f61: the cache is gone, the reader parses
//     the whole ledger)
//   ③ a standing item per SUBJECT — the usage harvest stands; the writer sweep's act of the same kind on the same machine
//     gets its OWN item (e11e1f61: ask_standing under the harvest's words); Allow once on the harvest's item lets no other
//     subject's act go (e11e1f61: the next background act took it)
//   ④ a standing item CLOSES — its subject's act allowed by the instance-wide setting, the setting alone (re-judged), a week
//     silent («no longer asked»); a boot re-judges instead of restoring
//   ⑤ F4 says what HAPPENED — a dedup that fails (EACCES) leaves the machine paused with the error and the next try in the
//     notice (never «resumes by itself»); retried at a later pause past the backoff; back in shape ⇒ resumed + closed
//   ⑥ F4 ONE notice per machine, reconciled at boot — still out of shape ⇒ the same item stays (size re-worded in place); in
//     shape ⇒ closed; a new size never files a second one
//   ⑦ F4 the shape judged WHOLE — the sample spans head, middle and tail; a 448 MiB SPARSE shard whose first 64 MiB are unique
//     and the rest one window three times ⇒ paused 'ratio' by the ingest index's exact count, deduped, resumed (e11e1f61:
//     the sample reads it in shape and the batch is appended)
// ROUND 3 (the acceptance of d9753fa8 — each leg fails on d9753fa8):
//   ⑧ consent is per SUBJECT on every road — the JOIN: a background act never joins an agent's card (d9753fa8: a DENIED
//     harvest joined the agent's card and went on the owner's Allow of the AGENT; an open item stayed open while its act
//     went that way); the harvest's own Allow closes its item; a Deny holds through a silent week and a restart; the words
//     name the subject they cover
//   ⑨ F4 one notion of «proven» (by inode): a proven file rewritten under a new inode gets its dedup (d9753fa8: none, for
//     the life of the process, under «the repeated rows are being removed»); proven and still over ⇒ `proven-over`, said
//     once, never retried; every remedy state has its own row in the notice and the Usage window
//   ⑩ F4 the boot judges by the rule that opened the notice: an exact-ratio notice is never closed by the sample — it waits
//     for the index («judging», after the ledger loads), then the same rule judges it (d9753fa8: closed as shape-ok,
//     reopened at the next ingest — a flap at every restart)
//   ⑪ F4 an `ids` pause is no dedup loop: no run, its own words, said once (d9753fa8: a full-shard dedup at every backoff,
//     each removing 0, under «rows were removed»)
// ROUND 4 (the acceptance of 4e94e377 — ⑫ fails on 4e94e377):
//   ⑫ F4 a pause is a fact about ONE shard (host × month), never the host: a proven-over October + a batch of October and
//     November ⇒ November appended, October HELD and counted, the cursor past the batch (4e94e377: the whole batch refused,
//     November never written); a re-send held once; the hold BOUNDED — past it the oldest held rows dropped and COUNTED;
//     the counts read back after a restart; back in shape (the bound raised) ⇒ the held rows ingested in order through the
//     ledger law, the hold gone, the notice closed — each machine's month at its own ingest
//   ⑤ ⑦ ⑪ re-derived: their batches are held now (never refused), so «in shape» is proven by the shard holding each held
//     event ONCE (the drain's, the re-send a duplicate), and ⑪'s notice is re-worded when its held count moves
// ROUND 5 (the acceptance of ff094d46 — ⑬ ⑭ fail on ff094d46; the push road's ack: scripts/test-usage-events-push.mjs):
//   ⑬ F4 a resume FOLLOWS a drain: a drain that fails (ENOSPC) keeps the month paused (drain-failed, its own words), tried
//     again at the machine's every ingest (any month) and at a restart (ff094d46: resumed first — no pause, no notice, the
//     rows stranded); ONE notice per (machine, file): a rename re-words the same item, a read one is reopened at a restart,
//     'resumed' closes it whatever it says (ff094d46: a second item, the first open for ever); a hold write that fails is
//     ITS month's (ff094d46: stamped on the batch's later months); the dropped count is a SET — a crash between a drop's
//     marker and its unlink is counted once, and never drained (ff094d46: 24 dropped for 20 sent, «dropped» rows recorded)
//   ⑭ a Deny is readable before the first act: Deny → restart → the subject's act before the boot reconcile ⇒ refused at
//     once, the item stays denied; the store never reopens a decided item; check() reads the stored decision of a subject
//     it holds no entry for (ff094d46: reopened, held 60 s, ask_expired)
//   ⑥ re-derived: a month back in shape at boot is closed by its drain's end (the reconcile keeps it while its hold is on disk)
// ROUND 6 (the acceptance of d2ff4026 — ⑮ ⑯ fail on d2ff4026; the push suite's cleanup: its own RED in the lane report):
//   ⑮ F4 the dropped set is a set of ROWS — a window over the hold's bound re-sent six times is counted once (d2ff4026: the
//     cut keyed by its place — re-held and still counted, then the segments it pushed out counted again), the segment road
//     too, a restart reads it back; a re-sent dropped row the hold has room for is held and leaves the set; R1: a drained
//     hold whose files could not be unlinked never names the next hold's rows (d2ff4026: the ids reused — 0/8 recorded)
//   ⑯ F4 a notice is keyed by (host id, file) from its FIRST filing — two machines of one name are two items, told apart
//     by the host id's short form; one resumes ⇒ the other's stays open (d2ff4026: ONE item by its words, closed by the
//     first resume while the second month is still held)
// ROUND 7 (the acceptance of 4f42eaa3 — ⑰ ⑱ fail on 4f42eaa3; each probe a reviewer's, rebuilt: 4 KiB hold, 1 KiB segments):
//   ⑰ F4 the disk never says «dropped» about a row memory still holds — the rows land first, the set's lines after them
//     name only what landed: ENOSPC on the rows ⇒ the hold as it was after a restart (4f42eaa3: 8 held + 12 dropped, 4
//     acked events deleted; the re-sent window 15 + 0 for 30); a torn append (half written, then ENOSPC) is cut back —
//     the set and the rows (4f42eaa3: the next line glued to the fragment, 4 rows counted nowhere); a drained row leaves
//     the segment it was read from and the bound counts undrained bytes (4f42eaa3: a harvest mid-drain pushed the
//     draining segment out — «40 dropped» for 36 missing); a retirement is RECORDED before the unlinks (4f42eaa3: a
//     drained generation whose unlinks failed read back as live at a restart, its closed notice reopened); a listing
//     that fails (EIO) is no empty disk (4f42eaa3: acked, a hold minted gen 0 on top of the live one); a rotation past
//     a generation's numbers is refused loudly; a compaction's .tmp is swept; the compaction bound is 4× the SET
//   ⑱ F4 the moving-list law: a twin's tag is sticky while its item is open — the 7-step sequence as a table
//     (4f42eaa3: B's tag dropped at its own re-word while A was closed, and again once A and C closed)
// ROUND 8 (the acceptance of 9a0d429d — ⑲ fails on 9a0d429d; each probe a reviewer's, from the scratch (.rev-ldl7, .rev-ordr/p,
//   .rev-skeptic, .rev-int7), its window rebuilt where the async hold has none of its own):
//   ⑲ F4 a record outlives every file it describes (a retired generation's set kept while a segment of it is left); dedup and
//     the drain cursor are two things (a re-send mid-drain held nothing twice); a dropped count is said in every shape (a
//     restart before the store flushed, out of shape at it, in shape with no notice); the listing failure is a state (100
//     ingests under EIO: ≤ 2 readdirs, 1 line, 1 notice, retryAfter, the in-shape month recorded); a `retired` line in a
//     live generation is ignored; the drain cursor is persisted (f); a row the ledger has is never held and a hold's end is
//     filtered against the index (g); an unverified cut seals its segment; a pause that holds nothing resumes; a stored
//     tagged label reads as its name; the loop law (no synchronous fs call on _held/ past the one listing; timedSync arms
//     its name before the call); the standing item is not a decision row (its own action.type)
// ROUND 9 (the acceptance of 3c4fa614 — ⑳ fails on 3c4fa614): a set file is a generation (read back at a boot, its count
//   said); a month that needs no hold never waits; the count is the generation's, never summed; every wait is bounded
//   and said; the standing item is a notice
// ROUND 10 (the acceptance of 7f4df6a9 — ㉑ fails on 7f4df6a9; the chain rebased onto 2.369.360 first):
//   ㉑ a notice closes when what it names is READ, across a restart too; a notice names a real file (a read's error carries
//     none); a hung close is said; every deferred answer carries `retryAfter`; the waiters are counted back; an unsaid
//     count is tried again once a minute and a window's count is flushed at its end; nothing is unlinked unread (an older
//     generation's set is said, as «Earlier»); a row that fits is never pushed out by the rows that arrived with the
//     drain; the tracer's fold never crosses a hold
// ROUND 11 (the acceptance of 3c8c0501 — ㉒ fails on 3c8c0501; the hold road moved to src/usage-hold-road.js first):
//   ㉒ a retry is a retry (the unsaid count tried once a window on its own clock while the machine sends; a line only with a
//     try); one generation bound; every counter comes down on every road (a pass that throws); a set file that is no set
//     file is unread (kept and said); a fold key names the site; a long text keys its run by a digest, never itself
//   ㉑ (6) re-pinned: the window's end TRIES (r10 said «tried again» there and tried nothing)
// ROUND 12 (the acceptance of 935a9f0b — ㉓ fails on 935a9f0b):
//   ㉓ a line that is no record never blocks: a live generation's set file with one is set aside (its bytes intact), rewritten
//     from its records, said once, and the hold goes on (every row recorded, every batch acked); an older generation's is
//     moved aside and never becomes the month's live one (three lives); a cut record is read by the writer's grammar (our
//     own writer's one-byte cut); the words name the file + the line, never «permissions»; the bound; a set-aside that fails
//   ㉒ (5) re-pinned: the older generation's set that is no set is SET ASIDE and said (r11 kept it «read again at the next start»)
// ROUND 14 (the acceptance of 7da5b435 — ㉔ fails on a1d92418):
//   ㉔ the error's class decides, never the file's age: ONE classifier for a set whose read throws, on both roads — what passes
//     (EMFILE, ENFILE, ENOMEM, ESTALE, ETIMEDOUT, EAGAIN, EBUSY) is kept and read again (an older one at the next start, its
//     count said then; the live one by its timer), the disk's refusal (EACCES, EISDIR, ENOTDIR, ENXIO) sets it aside unread,
//     an EIO is marked at the first start and set aside at the second; the live set set aside keeps its notice's count as
//     «Earlier»; the set-aside notice's words follow what was done (a copy there or not, the line still in the file or not)
//   ⑳ (3, the set) PINS NOW: a live set's EACCES sets it aside unread (the month acked at once) — r9's state stays the segment's
// ROUND 15 (the acceptance of f3027952 — ㉕ fails on f3027952):
//   ㉕ the hold is read whole before anything is decided: a live set refused with its segments fails the hold WHOLE (the set
//     kept as it was, unmarked, ONE notice; fixed ⇒ read back intact, its count checkable); a refused set beside a segment
//     whose read passes is set aside only by the read that reads the hold whole; an older set's judgement and a live set's
//     lines that are no record wait for the hold too; a count nobody checked is «not known» (the live set refused after its
//     count was said «may already be recorded»; an older set with no `checked` record); a codeless read error passes
// In-process, no server; sparse files for every big shape (fs.truncateSync / a write at an offset — no disk, no load).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);

let pass = 0, fail = 0;
const ok = (c, n, d) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n); if (d !== undefined) console.error('    ' + JSON.stringify(d).slice(0, 700)); } };
const legMs = [];
const leg = async (name, fn) => { const t0 = performance.now(); try { await fn(); } catch (e) { fail++; console.error(`  ✗ ${name} — threw: ${String((e && e.stack) || e).split('\n').slice(0, 3).join(' | ')}`); } legMs.push(`${name} ${Math.round(performance.now() - t0)} ms`); };
/** One loop turn's work, timed (the boot law's unit): → [its value, ms]. */
const turn = (fn) => { const t0 = performance.now(); const v = fn(); return [v, performance.now() - t0]; };
const tick = () => new Promise((r) => setImmediate(r));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-ldw-'));
// r11: the scratch goes on EVERY exit (a leg that left the event loop with its top-level await unsettled exits 13 and never
// reached the last line: two /tmp/vs-ldw-* dirs of round 10's work stayed behind)
process.on('exit', () => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { } });
const KiB = 1024, MiB = 1024 * KiB, GiB = 1024 * MiB;
// r8: an ingest that goes to a hold answers once its hold's ASYNC road did (a promise) — quiet() awaits it and settles every
// UsageHistory's road (holdsSettled; absent on a tree whose hold is synchronous — then nothing)
const quiet = async (fn) => { const w = console.warn, l = console.log, said = []; console.warn = (...a) => said.push(a.join(' ')); console.log = (...a) => said.push(a.join(' ')); try { const v = await fn(); await settle(); return [v, said]; } finally { console.warn = w; console.log = l; } };
const quietAsync = async (fn) => { const w = console.warn, l = console.log, said = []; console.warn = (...a) => said.push(a.join(' ')); console.log = (...a) => said.push(a.join(' ')); try { const v = await fn(); await settle(); return [v, said]; } finally { console.warn = w; console.log = l; } };
// r8: what an ingest answers, its console kept — NOT settled (a drain in steps goes on: the mid-drain legs)
const quietRaw = async (fn) => { const w = console.warn, l = console.log, said = []; console.warn = (...a) => said.push(a.join(' ')); console.log = (...a) => said.push(a.join(' ')); try { return [await fn(), said]; } finally { console.warn = w; console.log = l; } };
const opt = (rel) => { try { return require(REPO + rel); } catch { return {}; } };

const { UsageHistory: UsageHistory0 } = require(REPO + '/src/usage-history.js');
// r8: every UsageHistory a leg builds — `settle()` waits for each one's hold road (a hold's every file call is async now)
const ALL_UH = [];
class UsageHistory extends UsageHistory0 { constructor(...a) { super(...a); ALL_UH.push(this); } }
const settle = async () => { for (const u of ALL_UH) if (typeof u.holdsSettled === 'function') await u.holdsSettled(); };
// r8: a fault a leg injects into a SYNC fs call (fs.unlinkSync = …) reaches the hold's async road too: while fs.<x>Sync is
// not the original, fs.promises.<x> runs the replacement (on a tree whose hold is synchronous it is never consulted)
{
  const PAIRS = { appendFile: 'appendFileSync', truncate: 'truncateSync', unlink: 'unlinkSync', readdir: 'readdirSync', stat: 'statSync', writeFile: 'writeFileSync', rename: 'renameSync', mkdir: 'mkdirSync' };
  for (const [a, sy] of Object.entries(PAIRS)) {
    const orig = fs[sy], pa = fs.promises[a];
    fs.promises[a] = function (...args) { if (fs[sy] !== orig && !fs[sy].__count) { try { return Promise.resolve(fs[sy](...args)); } catch (e) { return Promise.reject(e); } } return pa.apply(this, args); };
  }
}
const { costBetweenMulti } = require(REPO + '/src/usage-anchors.js');
const EST = require(REPO + '/src/usage-estimator.js');
const LSN = opt('/src/server/ledger-shape-notice.js');
const LD = opt('/src/usage-ledger-dedup.js');
const T0 = Date.UTC(2026, 9, 22, 23, 0, 0, 195);
const SHARD = 'events-2026-10.ndjson';
const dirOf = (name) => { const d = path.join(tmp, name); fs.mkdirSync(path.join(d, 'usage-history'), { recursive: true }); return d; };
const shardOf = (dataDir) => path.join(dataDir, 'usage-history', SHARD);
const size = (f) => { try { return fs.statSync(f).size; } catch { return -1; } };
const newUh = (dataDir) => new UsageHistory({ dataDir, homeDir: path.join(dataDir, 'home') });
// a local ledger row (its account = the machine login, priced) and a remote one the way the hub ingests it
const local = (i) => JSON.stringify({ rid: `req_local_${String(i).padStart(8, '0')}`, ts: T0 + i * 1000, sid: 'sid-' + (i % 5), be: 'claude', model: 'claude-opus-5-5', acct: null, atype: 'unknown', aname: null, mode: 'chat', cwd: '/srv/work/hub', origin: 'main', i: 7, cw5: 0, cw1: 2, cr: 900, o: 120, tier: null });
const row = (i, host = 'host-m') => JSON.stringify({ rid: `h:${host}:req_${String(i).padStart(8, '0')}`, ts: T0 + i * 1000, sid: 'sid-' + (i % 7), be: 'claude', model: 'claude-opus-5-5', acct: host, atype: 'host', aname: 'M', mode: null, host, cwd: '/srv/work/app', origin: 'main', i: 10 + (i % 5), cw5: 1, cw1: 0, cr: 5000, o: 300, tier: null });
const remote = (i) => JSON.stringify({ rid: 'req_' + String(i).padStart(8, '0'), ts: T0 + i * 1000, sid: 'sid-' + (i % 7), model: 'claude-opus-5-5', cwd: '/srv/work/app', origin: 'main', i: 10, cw5: 1, cw1: 0, cr: 5000, o: 300, tier: null });
const batchOf = (from, n) => Array.from({ length: n }, (_, k) => remote(from + k)).join('\n') + '\n';
const loadedRows = (uh) => (uh._evCache ? uh._evCache.events.length + uh._evCache.cold.n : 0);
/** The rids of a ledger / hold file, in its order (small fixtures — a whole read). */
const ridsOf = (f) => { try { return fs.readFileSync(f, 'utf-8').split('\n').map((l) => { try { return JSON.parse(l).rid || null; } catch { return null; } }).filter(Boolean); } catch { return []; } };
const hidOf = (i, host = 'host-m') => `h:${host}:req_${String(i).padStart(8, '0')}`;
/** Is every one of these events in the file exactly once? */
const onceIn = (f, ids, host) => { const all = ridsOf(f); return ids.every((i) => all.filter((r) => r === hidOf(i, host)).length === 1); };

console.log('① NO MONEY DECISION FROM A PARTIAL LEDGER — 20 000 rows, two warm steps in');
await leg('①', async () => {
  const d = dirOf('w1'), N = 20000;
  fs.writeFileSync(shardOf(d), Array.from({ length: N }, (_, i) => local(i)).join('\n') + '\n');
  const uh = newUh(d), q = [];
  uh.takeoverMaxBytes = 256 * KiB; // the product's 8 MiB, scaled with the fixture (the acceptance's own numbers)
  const warm = uh.warmStepped({ chunkBytes: 64 * KiB, next: (fn) => q.push(fn) });
  q.shift()(); // …two warm steps in (the first ran in the call)
  const ids = ['__global__'], from = T0 - 1, to = T0 + N * 1000;
  const c1 = costBetweenMulti(uh, ids, from, to);
  ok(c1.requests < N && c1.partial === true, `① costBetweenMulti two steps into the warm: ${c1.requests} of ${N} requests, $${c1.total} — partial: ${c1.partial} (e11e1f61: the same count answered as the whole, silently)`, { requests: c1.requests, partial: c1.partial });
  const c1b = costBetweenMulti(uh, ids, from, to);
  ok(c1b.partial === true, '① …and a partial answer is never memoized (the second ask reads again, still partial)');
  // the estimator: no rate learned from it, none written, no estimate
  const ad = path.join(d, 'usage-anchors'); fs.mkdirSync(ad, { recursive: true });
  const ue = new EST.UsageEstimator({ lagS: 0, anchorsDir: ad, usageHistory: () => uh, resolveIdentity: () => ({ identityKey: 'ident-1' }) }); // the Max priors: rates exist with no pair
  ue.ratesFor('ident-1');
  const raw = { fetchedAt: T0 + N * 1000, fiveHour: { utilization: 0.4, resetsAt: Math.floor((T0 + N * 1000) / 1000) + 3600 }, sevenDay: { utilization: 0.3, resetsAt: Math.floor((T0 + N * 1000) / 1000) + 86400 } };
  const est = ue.estimateFor(null, raw, T0 + N * 1000 + 60e3);
  ok(!fs.existsSync(path.join(ad, 'rates.json')) && est === null, `① the estimator during the warm: rates.json ${fs.existsSync(path.join(ad, 'rates.json')) ? 'WRITTEN' : 'not written'}, the estimate ${est === null ? 'none (the reading stands)' : 'computed off part of the ledger'} (e11e1f61: written + computed)`, { est });
  // the engine's sweep + its automatic decision, through the gate
  const gate = typeof EST.wholeLedgerGate === 'function' ? EST.wholeLedgerGate({ ledger: uh, log: (m) => said.push(m), onWhole: () => { wholes++; } }) : null;
  const said = []; let wholes = 0, sweeps = 0, sweptReq = -1, sweptPartial = null;
  const sweep = () => { sweeps++; const c = costBetweenMulti(uh, ids, from, to); sweptReq = c.requests; sweptPartial = !!c.partial; };
  const r1 = gate ? gate.run(sweep) : (sweep(), 'ran'), r2 = gate ? gate.run(sweep) : 'ran', held = gate ? gate.holds() : false;
  ok(r1 === 'waiting' && r2 === 'waiting' && sweeps === 0 && held === true && said.length === 1 && /ledger still loading/.test(said[0]), `① the anchor sweep WAITS (${r1}, a second ask joins it — ${sweeps} run), the automatic pool decision is skipped (holds: ${held}), said once: «${said[0] || ''}»`, { r1, r2, sweeps, said });
  while (q.length) q.shift()();
  await warm; await tick(); await tick();
  const c2 = costBetweenMulti(uh, ids, from, to);
  ok(sweeps === 1 && sweptReq === N && sweptPartial === false && wholes === 1 && c2.requests === N && !c2.partial, `① the warm ends ⇒ the sweep runs ONCE on the whole ledger (${sweptReq} requests), the pools are decided again (onWhole ×${wholes}), costBetweenMulti whole: ${c2.requests} requests, $${c2.total}`, { sweeps, sweptReq, wholes, c2: c2.requests });
  ue.ratesFor('ident-1');
  ok(fs.existsSync(path.join(ad, 'rates.json')), '① on the whole ledger the rates are learned and written again (the first ask after the warm)');
  // the wiring: the engine's two money writers stand behind the gate
  const eng = fs.readFileSync(path.join(REPO, 'src/server/usage-pool-engine.js'), 'utf8');
  const auto = eng.slice(eng.indexOf('function maybePoolAutoSwitchForPool('), eng.indexOf('function maybePoolAutoSwitchForPool(') + 600);
  ok(/function sweepUsageAnchors\(\) \{ return _wholeLedger\.run\(sweepUsageAnchorsNow\); \}/.test(eng) && /if \(_wholeLedger\.holds\(\)\) return;/.test(auto) && /wholeLedgerGate\(\{\s*ledger: usageHistory/.test(eng), '① the wiring: the pool engine\'s sweep goes through the gate, its automatic decision returns while it holds');
});

console.log('② A RELOAD MID-WARM RESTARTS THE WARM — 5000 rows three times, three steps in, the dedup ends');
await leg('②', async () => {
  const d = dirOf('w2'), sh = shardOf(d), N = 5000, lines = [];
  for (let k = 0; k < 3; k++) for (let i = 0; i < N; i++) lines.push(row(i));
  fs.writeFileSync(sh, lines.join('\n') + '\n');
  const uh = newUh(d), q = [];
  uh.takeoverMaxBytes = 256 * KiB;
  const warm = uh.warmStepped({ chunkBytes: 64 * KiB, next: (fn) => q.push(fn) });
  q.shift()(); q.shift()(); // three warm steps
  const before = loadedRows(uh);
  const [res] = await quietAsync(() => uh.dedupShard(sh, { archiveDir: path.join(d, 'archive'), sliceMs: 40 }));
  const c = uh._evCache;
  ok(res && res.renamed && res.removed === 2 * N && c && c.pending && uh.ledgerLoading && uh.ledgerLoading(), `② the dedup ends mid-warm (${before} rows loaded, ${res && res.removed} repeated rows removed): a warm is PENDING again — ${c ? `${loadedRows(uh)} rows, pending ${!!c.pending}` : 'the cache is gone'} (e11e1f61: the cache nulled, the warm ended)`, { before, removed: res && res.removed, cache: !!c, pending: !!(c && c.pending) });
  const r0 = loadedRows(uh);
  const [, ms] = turn(() => uh._loadEvents());
  const r1 = loadedRows(uh);
  ok(r1 === r0 && r1 < N, `② the next sync reader loads NOTHING in its own tick: ${r0} → ${r1} rows (${ms.toFixed(1)} ms; e11e1f61: it parsed the whole ledger, ${N} rows, there)`, { r0, r1, ms });
  let maxMs = 0, steps = 0;
  while (q.length) { const [, m] = turn(() => q.shift()()); steps++; if (m > maxMs) maxMs = m; }
  const w = await warm;
  ok(w && w.restarts === 1 && loadedRows(uh) === N && maxMs < 250, `② the restarted warm runs to its end stepped (${steps} more steps, the longest ${maxMs.toFixed(1)} ms < 250 — the boot law): ${loadedRows(uh)} rows, restarts ${w && w.restarts}`, w);
  let waited = false;
  const uh2 = newUh(dirOf('w2b')); fs.writeFileSync(shardOf(path.join(tmp, 'w2b')), lines.join('\n') + '\n');
  uh2.takeoverMaxBytes = 256 * KiB; const q2 = [];
  const warm2 = uh2.warmStepped({ chunkBytes: 64 * KiB, next: (fn) => q2.push(fn) });
  const p = (uh2.whenWarm ? uh2.whenWarm() : Promise.resolve()).then(() => { waited = true; });
  await quietAsync(() => uh2.dedupShard(shardOf(path.join(tmp, 'w2b')), { archiveDir: path.join(tmp, 'w2b', 'archive'), sliceMs: 40 }));
  await tick();
  const pendingAfterDedup = !waited;
  while (q2.length) q2.shift()();
  await warm2; await p;
  ok(pendingAfterDedup && waited && loadedRows(uh2) === N, '② whenWarm() stays pending through the restart and resolves when the restarted warm ends (the readers that wait for it read the whole, deduped ledger)');
});

const ASK = opt('/src/server/hub-act-ask.js');
const P = require(REPO + '/src/hub-act-policy.js');
const { UserTodoManager } = require(REPO + '/src/user-todos.js');
const { HostManager } = require(REPO + '/src/hosts.js');
function asker(name, { setting = () => undefined, userTodos = null, clock = null } = {}) {
  const d = dirOf(name);
  const hosts = new HostManager({ dataDir: d });
  hosts.setDialToken('mac1', 'x'.repeat(64));
  const hid = hosts.findByDeviceId('mac1').id;
  clock = clock || { t: 1_800_000_000_000 };
  const todos = userTodos || new UserTodoManager({ dataDir: d, expirySweepMs: 0, now: () => clock.t });
  const timers = [];
  const mk = () => ASK.create({ hosts, userTodos: todos, log: () => { }, now: () => clock.t, instanceKind: 'cluster', settingOf: (k) => (k === P.SETTING_KEY ? setting() : undefined), timers: { set: (fn, ms) => { const h = { fn, ms, live: true }; timers.push(h); return h; }, clear: (h) => { if (h) h.live = false; } } });
  const fire = () => { for (const h of timers.splice(0)) if (h.live) { h.live = false; h.fn(); } };
  const items = () => todos._state.items.filter((i) => i.action && (i.action.type === 'hub-act-ask' || i.action.type === 'hub-act-standing')); // r8: a standing item has its own type
  return { d, hosts, hid, clock, todos, asker: mk(), mk, fire, items };
}
const act = (by, cmd = 'ls') => ({ op: 'run-cmd', cmd, args: [], by });
const HARVEST = act('system:usage-harvest', 'node'), SWEEP = act('system:writer-sweep', 'find'), MOUNTS = act('system:machine-mounts', 'mount');
/** One background act held its 60 s and refused: → its code. */
async function heldOut(w, payload) { const p = w.asker.check(w.hid, payload); await tick(); w.clock.t += 61000; w.fire(); const g = await p; return g && (g.code || (g.ok ? 'allowed' : g.ask)); }

console.log('③ A STANDING ITEM PER SUBJECT — machine × kind × who asks');
await leg('③', async () => {
  const w = asker('w3');
  const c0 = await heldOut(w, HARVEST);
  const u = w.items().find((i) => /^Usage of mac1 is not being recorded/.test(i.text));
  ok(c0 === 'ask_expired' && u && u.status === 'open', '③ the usage harvest\'s first act held and refused ⇒ its standing item («Usage of mac1 is not being recorded»)', w.items().map((i) => i.text));
  const pw = w.asker.check(w.hid, SWEEP); await tick();
  const n2 = w.items().length;
  w.clock.t += 61000; w.fire(); const g = await pw;
  const mine = w.items().filter((i) => i !== u && i.action.by === 'system:writer-sweep');
  ok(n2 === 2 && g && g.code === 'ask_expired' && mine.length === 1 && mine[0].status === 'open' && !/^Usage of/.test(mine[0].text) && w.items().find((i) => i.id === u.id).action.count === 1, `③ the writer sweep's act of the SAME kind on the SAME machine ⇒ its OWN standing item in its own words («${mine[0] ? mine[0].text : ''}»), held its own 60 s (${g && g.code}); the harvest's count untouched (e11e1f61: ask_standing at once, counted under the harvest's words)`, { n2, code: g && g.code, items: w.items().map((i) => [i.text, i.action.by, i.action.count]) });
  const c2 = await w.asker.check(w.hid, SWEEP);
  const counts = Object.fromEntries((w.asker.standingList ? w.asker.standingList() : []).map((x) => [x.by, x.count]));
  ok(c2 && c2.code === 'ask_standing' && w.items().length === 2 && counts['system:writer-sweep'] === 2 && counts['system:usage-harvest'] === 1, `③ the writer sweep's next act: refused at once on ITS item, counted there (${counts['system:writer-sweep']}; the harvest's ${counts['system:usage-harvest']})`, { c2, counts });
  await w.asker.answer(u.action.askId, { answer: 'once', by: 'user', answeredBy: 'human:0123456789ab' });
  const pm = w.asker.check(w.hid, MOUNTS); await tick();
  const mHeld = w.asker.list().some((k) => k.by === 'system:machine-mounts');
  w.clock.t += 61000; w.fire(); const gm = await pm;
  let ghNow = null; const ph = w.asker.check(w.hid, HARVEST).then((x) => { ghNow = ghNow || x; return x; }); await tick(); await tick();
  const gh = ghNow; w.clock.t += 61000; w.fire(); await ph; // (e11e1f61: the harvest's act is held again — its once was spent)
  ok(mHeld && gm && gm.ok !== true && gh && gh.ok === true, `③ Allow once on the harvest's item: the machine-mounts act is NOT let go by it (${gm && (gm.code || gm.ask)} — e11e1f61: allowed), the harvest's own next act goes (${gh && gh.ask})`, { gm, gh });
});

console.log('④ A STANDING ITEM CLOSES — allowed by any road, the setting, a week silent; a boot re-judges');
await leg('④', async () => {
  let setting = 'auto';
  const w = asker('w4', { setting: () => setting });
  await heldOut(w, HARVEST);
  const u = w.items()[0];
  setting = 'everyone';
  const g = await w.asker.check(w.hid, HARVEST);
  ok(g === null && w.todos.get(u.id).status === 'done' && w.todos.get(u.id).resolvedBy === 'allowed', `④ the instance-wide setting allows the act ⇒ it goes and its standing item CLOSES (${w.todos.get(u.id).status}/${w.todos.get(u.id).resolvedBy}; e11e1f61: still open)`, w.todos.get(u.id));
  setting = 'auto';
  await heldOut(w, SWEEP);
  const s = w.items().find((i) => i.action.by === 'system:writer-sweep' && i.status === 'open');
  setting = 'everyone';
  const n = typeof w.asker.reevaluate === 'function' ? w.asker.reevaluate() : 0;
  ok(s && n === 1 && w.todos.get(s.id).status === 'done' && w.todos.get(s.id).resolvedBy === 'always', `④ the setting alone (no act comes): the next re-judge closes it (${s && w.todos.get(s.id).resolvedBy})`, s && w.todos.get(s.id));
  setting = 'auto';
  await heldOut(w, MOUNTS);
  const m = w.items().find((i) => i.action.by === 'system:machine-mounts' && i.status === 'open');
  w.clock.t += 7 * 24 * 3600e3;
  if (typeof w.asker.reevaluate === 'function') w.asker.reevaluate();
  ok(m && w.todos.get(m.id).status === 'done' && w.todos.get(m.id).resolvedBy === 'no-longer-asked', `④ a subject silent for 7 days: its item closes «no longer asked» (${m && w.todos.get(m.id).resolvedBy})`, m && w.todos.get(m.id));
  const pNext = w.asker.check(w.hid, MOUNTS); await tick();
  const fresh = w.asker.list().some((k) => k.by === 'system:machine-mounts');
  w.clock.t += 61000; w.fire(); await pNext;
  ok(fresh, '④ …and its next act asks afresh (held its 60 s), never refused under the closed item');
  // a boot: an open standing item from before the restart is RE-JUDGED (the setting allows it now ⇒ closed), never restored
  const open = w.items().filter((i) => i.status === 'open');
  setting = 'everyone';
  const a2 = w.mk(); a2.reconcile();
  ok(open.length === 1 && w.todos.get(open[0].id).status === 'done' && !a2.standingList().length, `④ a restart with the setting now allowing it: reconcile closes the item (${w.todos.get(open[0].id).resolvedBy}) instead of restoring it (e11e1f61: restored, open)`, a2.standingList());
});

console.log('⑤ F4 SAYS WHAT HAPPENED — a dedup that fails, the retry, the shard back in shape');
await leg('⑤', async () => {
  const d = dirOf('w5'), sh = shardOf(d), rows = [];
  for (let k = 0; k < 3; k++) for (let i = 0; i < 400; i++) rows.push(row(i));
  fs.writeFileSync(sh, rows.join('\n') + '\n');
  const uh = newUh(d), todos = new UserTodoManager({ dataDir: d, expirySweepMs: 0 });
  uh.shapeRatioMinBytes = 0; // the product's 64 MiB, scaled (a 3× file of 1200 rows)
  uh.remedyRetryMs = 300; // the product's 10 min, scaled
  const said = [];
  const wired = LSN.wire ? LSN.wire({ usageHistory: uh, userTodos: todos, log: () => { }, reconcileAfterMs: null }) : null;
  const on = uh.onShape; uh.onShape = (e) => { said.push(e); on && on(e); };
  const notices = () => todos._state.items.filter((i) => i.sessionKey === 'usage-ledger');
  fs.chmodSync(path.dirname(sh), 0o555); // the dedup's new copy cannot be written: EACCES
  let r1;
  try { [r1] = await quiet(() => uh.ingestRemoteEvents('host-m', 'M', batchOf(9000, 5))); await quietAsync(async () => { for (let i = 0; i < 400 && uh._dedupJobs && uh._dedupJobs.size; i++) await sleep(5); }); }
  finally { fs.chmodSync(path.dirname(sh), 0o755); }
  const n1 = notices(), last = said[said.length - 1] || {};
  const rem = last.remedy || {};
  ok(r1 && r1.paused && n1.length === 1 && rem.state === 'failed' && rem.code === 'EACCES' && rem.nextAt > Date.now() - 1000, `⑤ a dedup that FAILS: the machine stays paused and is said again with the outcome (${rem.state} ${rem.code}, the next try at a later pause)`, { said: said.map((e) => [e.kind, e.remedy && e.remedy.state]) });
  ok(n1[0] && /What happened: removing the repeated rows failed — EACCES/.test(n1[0].detail) && /tries again after \d\d:\d\d UTC/.test(n1[0].detail) && !/resumes by itself/.test(n1[0].detail) && !/resumes/.test(n1[0].detail.split('\n')[2] || ''), '⑤ the notice says what happened, when it is tried again, what to do — never «resumes by itself» (e11e1f61: it did, while paused for the life of the process)', n1[0] && n1[0].detail);
  const [r2] = await quiet(() => uh.ingestRemoteEvents('host-m', 'M', batchOf(9000, 5)));
  ok(r2.paused && !(uh._dedupJobs && uh._dedupJobs.size) && notices().length === 1, '⑤ a pause inside the backoff: no new run, the ONE notice (no second item)');
  await sleep(320);
  const [r3] = await quiet(() => uh.ingestRemoteEvents('host-m', 'M', batchOf(9000, 5)));
  const job = uh._dedupJobs && [...uh._dedupJobs.values()][0];
  await quietAsync(async () => { if (job) await job.catch(() => { }); });
  const [r4] = await quiet(() => uh.ingestRemoteEvents('host-m', 'M', batchOf(9000, 5)));
  const n4 = notices();
  // r4 re-derived: it PINNED «in shape ⇒ the re-sent batch appended (5)»; the batch was refused whole while paused. It PINS
  // NOW: the 5 events were HELD at the pauses (once), and in shape they are in the ledger exactly once — the hold's drain
  // appended them, the re-sent batch is 5 duplicates
  ok(r3.paused && job && onceIn(sh, [9000, 9001, 9002, 9003, 9004]) && r4.duplicates === 5 && !uh.ingestPaused().length && n4.length === 1 && n4[0].status === 'done' && n4[0].resolvedBy === 'shape-ok', `⑤ past the backoff the next pause RETRIES (a run in flight: ${!!job}); in shape ⇒ recorded again: the 5 events held across the pauses are in the ledger ONCE (the hold drained; the re-sent batch ${r4.duplicates} duplicates) and the one notice closes (${n4[0] && n4[0].resolvedBy}) — e11e1f61: never retried, paused for good`, { r3: !!r3.paused, r4, n: n4.map((i) => [i.status, i.resolvedBy]) });
  ok(wired && typeof wired.reconcile === 'function', '⑤ the wiring answers {open, reconcile} (the boot door ⑥ proves)');
});

console.log('⑥ F4 ONE NOTICE PER MACHINE, RECONCILED AT BOOT');
await leg('⑥', async () => {
  const d = dirOf('w6'), sh = shardOf(d);
  fs.writeFileSync(sh, [row(0), row(1), row(2)].join('\n') + '\n');
  const small = size(sh);
  fs.truncateSync(sh, 3 * GiB); // SPARSE
  const todos = new UserTodoManager({ dataDir: d, expirySweepMs: 0 });
  const notices = () => todos._state.items.filter((i) => i.sessionKey === 'usage-ledger');
  const life = () => {
    const uh = newUh(d);
    uh.dedupShard = (f) => { const p = new Promise(() => { }); if (uh._dedupJobs) uh._dedupJobs.set(f, p); return p; }; // its 3 GiB pass is not this leg's
    const wired = LSN.wire({ usageHistory: uh, userTodos: todos, log: () => { }, reconcileAfterMs: null });
    return { uh, wired };
  };
  const L1 = life();
  await quiet(() => L1.uh.ingestRemoteEvents('host-m', 'M', batchOf(9000, 5)));
  const first = notices();
  fs.truncateSync(sh, 3.5 * GiB); // the file grew while paused (another writer of the month)
  const L2 = life(); // a restart
  const [n2] = await quiet(() => (L2.wired && L2.wired.reconcile ? L2.wired.reconcile() : -1));
  const after = notices();
  ok(first.length === 1 && n2 === 0 && after.length === 1 && after[0].id === first[0].id && after[0].status === 'open' && /3\.50 GiB/.test(after[0].detail) && L2.uh.ingestPaused().some((p) => p.host === 'host-m'), `⑥ a restart, the shard still out of shape: the SAME notice stays (1 item), its size re-worded in place (3.50 GiB), the machine paused again from boot (e11e1f61: no reconcile; a new size string is a second item)`, after.map((i) => [i.status, i.text, i.detail.split('\n')[0]]));
  fs.truncateSync(sh, small);
  const L3 = life();
  const [n3] = await quiet(() => (L3.wired && L3.wired.reconcile ? L3.wired.reconcile() : -1));
  const end = notices();
  // r5 re-derived — PINNED «the reconcile closes it» (n3 = 1, the held rows drained after); PINS NOW the drain FIRST: the
  // reconcile keeps the notice while the month's hold is on disk (n3 = 0), the boot's drain records the 5 held events
  // (each once), and only then the pause ends and the notice closes
  ok(end.length === 1 && end[0].status === 'done' && end[0].resolvedBy === 'shape-ok' && !L3.uh.ingestPaused().length && onceIn(sh, [9000, 9001, 9002, 9003, 9004]), `⑥ a restart with the shard back in shape: its 5 held events drained first (each in the ledger once), then the notice closes (${end[0] && end[0].resolvedBy}), nothing paused`, end.map((i) => [i.status, i.resolvedBy]));
});

console.log('⑦ F4 THE SHAPE JUDGED WHOLE — head, middle, tail; a 448 MiB sparse shard, first 64 MiB unique, the rest 3×');
await leg('⑦', async () => {
  const d = dirOf('w7'), sh = shardOf(d);
  // each row followed by a 1 MiB hole: 64 unique rows over the first 64 MiB, then a 128-row window three times
  const order = [];
  for (let i = 0; i < 64; i++) order.push(i);
  for (let k = 0; k < 3; k++) for (let i = 0; i < 128; i++) order.push(1000 + i);
  const fd = fs.openSync(sh, 'w'); let at = 0;
  try { for (const i of order) { const b = Buffer.from(row(i) + '\n'); fs.writeSync(fd, b, 0, b.length, at); at += b.length + MiB; } } finally { fs.closeSync(fd); }
  fs.truncateSync(sh, at - MiB); // the file ends with its last row's newline
  const uniqueHead = order.slice(0, 64).length, rows = order.length, distinct = new Set(order).size;
  const s = LD.shapeOf ? LD.shapeOf(sh) : {};
  const wins = s.windows || [];
  ok(wins.length === 16 && wins[0] === 0 && wins[15] === s.size - MiB && wins.some((x) => Math.abs(x - s.size / 2) < s.size / 15) && wins.every((x, i) => !i || x > wins[i - 1]), `⑦ the sample spans the head, the middle and the tail: 16 windows at ${wins.slice(0, 3).map((x) => (x / MiB).toFixed(0)).join(', ')} … ${wins.slice(-2).map((x) => (x / MiB).toFixed(0)).join(', ')} MiB of ${(s.size / MiB).toFixed(0)} — and it reads the shard ~${s.ratio == null ? '—' : s.ratio.toFixed(2)}× (a repeat far from its first copy is never in two windows)`, { wins, ratio: s.ratio });
  const uh = newUh(d);
  const [r1] = await quiet(() => uh.ingestRemoteEvents('host-m', 'M', batchOf(9000, 5)));
  await quietAsync(() => uh.ingestIndexSettled());
  const s0 = size(sh);
  const [r2] = await quiet(() => uh.ingestRemoteEvents('host-m', 'M', batchOf(9000, 5)));
  ok(r1.deferred && r2.paused && r2.paused.why === 'ratio' && r2.appended === 0 && size(sh) === s0, `⑦ a ${(s0 / MiB).toFixed(0)} MiB shard, ${uniqueHead} unique rows over its first 64 MiB then one window 3×: its index read it whole ⇒ PAUSED, why ratio ${r2.paused && r2.paused.ratio}× (${rows} rows / ${distinct} distinct), nothing appended (e11e1f61: in shape — appended ${r2.appended})`, { r1, r2 });
  const job = uh._dedupJobs && [...uh._dedupJobs.values()][0];
  const [res] = await quietAsync(async () => (job ? job : null));
  const [r3] = await quiet(() => uh.ingestRemoteEvents('host-m', 'M', batchOf(9000, 5)));
  // r4 re-derived: it PINNED «resumed ⇒ the re-sent batch appended (5)»; it PINS NOW: the batch held at the pause is in the
  // ledger ONCE after the dedup (the hold drained at the resume), the re-sent batch 5 duplicates
  ok(res && res.renamed && res.removed === rows - distinct && onceIn(sh, [9000, 9001, 9002, 9003, 9004]) && r3.duplicates === 5 && !uh.ingestPaused().length, `⑦ the remedy dedups it (${res && res.removed} repeated rows removed — the holes stepped over, never copied: ${(size(sh) / KiB).toFixed(0)} KiB left) and the machine is recorded again: the 5 held events in the ledger once (the re-sent batch ${r3.duplicates} duplicates)`, { res, r3 });
});

console.log('⑧ CONSENT IS PER SUBJECT ON EVERY ROAD — a background act never joins an agent\'s card (round 3)');
await leg('⑧', async () => {
  let setting = 'auto';
  const w = asker('w8', { setting: () => setting });
  const AGENT = act('agent:claude:c1', 'ls');
  const countOf = (by) => ((w.asker.standingList ? w.asker.standingList() : []).find((x) => x.by === by) || {}).count;
  const ANS = { by: 'user', answeredBy: 'human:0123456789ab' };
  // the harvest's OPEN standing item (refused once, nobody answered) + an agent's card up on the same machine × kind
  await heldOut(w, HARVEST);
  const u = w.items().find((i) => i.action.standing && i.action.by === 'system:usage-harvest');
  const pa = w.asker.check(w.hid, AGENT); await tick();
  const card = w.items().find((i) => !i.action.standing && i.status === 'open');
  let gh = null; const ph = w.asker.check(w.hid, HARVEST).then((x) => { gh = x; return x; }); await tick(); await tick();
  const atOnce = gh;
  await w.asker.answer(card.action.askId, { answer: 'once', ...ANS });
  const ga = await pa; await ph;
  ok(card && ga && ga.ok === true && atOnce && atOnce.code === 'ask_standing' && gh && gh.code === 'ask_standing' && w.todos.get(u.id).status === 'open' && countOf('system:usage-harvest') === 2,
    `⑧ the harvest's act while an AGENT's card is up: refused at once on its OWN item (${gh && (gh.code || gh.ask)}, counted ${countOf('system:usage-harvest')}) — the owner's Allow of the agent let the agent's act go and no other (d9753fa8: it joined the agent's card and went, its item still open)`, { atOnce, gh, item: w.todos.get(u.id).status });
  // the harvest's OWN Allow once: its item closes, its next act goes
  await w.asker.answer(u.action.askId, { answer: 'once', ...ANS });
  const g1 = await w.asker.check(w.hid, HARVEST);
  ok(w.todos.get(u.id).status === 'done' && w.todos.get(u.id).resolvedBy === 'allowed' && g1 && g1.ok === true, `⑧ the harvest's OWN Allow once: its item closes (${w.todos.get(u.id).resolvedBy}) and its next act goes`, { item: w.todos.get(u.id), g1 });
  // THE PROBE: a DENIED harvest + an agent's card allowed once ⇒ the harvest stays refused
  await heldOut(w, HARVEST); // it asks afresh: its one item reopened
  await w.asker.answer(u.action.askId, { answer: 'deny', ...ANS });
  const pa2 = w.asker.check(w.hid, AGENT); await tick();
  const card2 = w.items().find((i) => !i.action.standing && i.status === 'open');
  let gd = null; const pd = w.asker.check(w.hid, HARVEST).then((x) => { gd = x; return x; }); await tick(); await tick();
  await w.asker.answer(card2.action.askId, { answer: 'once', ...ANS });
  const ga2 = await pa2; await pd;
  ok(ga2 && ga2.ok === true && gd && gd.ok !== true && gd.code === 'hub_act_denied', `⑧ THE PROBE — a DENIED harvest + an agent's card allowed once: the agent's act goes, the harvest stays refused (${gd && (gd.code || gd.ask)}; d9753fa8: allowed — it joined the card)`, { gd });
  // the Deny holds through a silent week …
  w.clock.t += 7 * 24 * 3600e3 + 1000;
  if (w.asker.reevaluate) w.asker.reevaluate();
  const ps = w.asker.check(w.hid, HARVEST); await tick();
  const heldAfterWeek = w.asker.list().some((k) => k.by === 'system:usage-harvest');
  w.clock.t += 61000; w.fire(); const gs = await ps;
  ok(!heldAfterWeek && gs && gs.code === 'hub_act_denied' && w.todos.get(u.id).status !== 'open', `⑧ the Deny HOLDS through a silent week: refused at once (${gs && (gs.code || gs.ask)}), never asked afresh (d9753fa8: «no longer asked» lifted it — held, its item reopened)`, { heldAfterWeek, gs, item: w.todos.get(u.id).status });
  // … and a restart
  const a2 = w.mk(); a2.reconcile();
  const pr = a2.check(w.hid, HARVEST); await tick();
  const heldAfterBoot = a2.list().some((k) => k.by === 'system:usage-harvest');
  w.clock.t += 61000; w.fire(); const gr = await pr;
  ok(!heldAfterBoot && gr && gr.code === 'hub_act_denied' && w.todos.get(u.id).status !== 'open' && w.todos.get(u.id).resolvedBy === 'denied', `⑧ the Deny HOLDS across a restart: the next life refuses the harvest at once (${gr && (gr.code || gr.ask)}), its item stays denied (d9753fa8: asked again, the denied item reopened)`, { heldAfterBoot, gr, item: [w.todos.get(u.id).status, w.todos.get(u.id).resolvedBy] });
  // … until the owner allows THAT subject: its item reopened, Allow once
  w.todos.setStatus(u.id, 'open', 'user');
  await a2.answer(u.action.askId, { answer: 'once', ...ANS });
  const go = await a2.check(w.hid, HARVEST);
  ok(go && go.ok === true && w.todos.get(u.id).status === 'done' && w.todos.get(u.id).resolvedBy === 'allowed', '⑧ …until the owner allows THAT subject: its item reopened and allowed once ⇒ its next act goes and the item closes (allowed)', { go, item: [w.todos.get(u.id).status, w.todos.get(u.id).resolvedBy] });
  // … or the instance-wide setting allows it — then the Deny is over for good: a next life asks again, never restores it
  w.clock.t += P.QUIET_MS + 1000;
  const pq = a2.check(w.hid, HARVEST); await tick(); w.clock.t += 61000; w.fire(); await pq;
  await a2.answer(u.action.askId, { answer: 'deny', ...ANS });
  setting = 'everyone';
  const gAll = await a2.check(w.hid, HARVEST);
  setting = 'auto';
  const a3 = w.mk(); a3.reconcile();
  const p3 = a3.check(w.hid, HARVEST); await tick();
  const asksAgain = a3.list().some((k) => k.by === 'system:usage-harvest');
  w.clock.t += 61000; w.fire(); await p3;
  ok(gAll === null && w.todos.get(u.id).resolvedBy !== 'denied' && asksAgain, `⑧ a Deny the instance-wide setting overrode: the act goes, its item no longer says denied (${w.todos.get(u.id).resolvedBy}), and the next life asks again instead of restoring the Deny`, { gAll, item: w.todos.get(u.id).resolvedBy, asksAgain });
  const how = (it) => String((it && it.detail) || '').split('\n')[1] || '';
  // r9: PINNED the harvest item's «Allow once lets the next act of …» / «Deny keeps … refused» → PINS NOW its way out (the
  // standing item is a notice — no answers drawn, so its words name none): the machine's Hub automation, the harvest named
  ok(/with the other acts of this kind by agent:claude:c1 waiting beside it — no one else's/.test(how(card)) && /every kind and every asker/.test(how(card)) && /To let system:usage-harvest act on mac1, set its Hub automation to Always allow/.test(how(w.todos.get(u.id))) && !/Allow once|Deny/.test(how(w.todos.get(u.id))),
    '⑧ the words name the subject they cover: the agent card\'s Allow once = that conversation\'s acts, no one else\'s; Always on this machine = every kind and every asker; the harvest\'s item names the harvest and its way out — no answer it does not draw (d9753fa8: «with any act of the same kind waiting beside it»)', [how(card), how(w.todos.get(u.id))]);
  w.fire();
});

console.log('⑨ F4 ONE NOTION OF «PROVEN» (by inode); proven and still over ⇒ proven-over; a row for every remedy state');
const N = await import(pathToFileURL(REPO + '/src/lib/usage-ledger-note.js').href);
const UHM = require(REPO + '/src/usage-history.js');
await leg('⑨', async () => {
  const d = dirOf('w9'), sh = shardOf(d);
  fs.writeFileSync(sh, Array.from({ length: 400 }, (_, i) => row(i)).join('\n') + '\n');
  const uh = newUh(d), todos = new UserTodoManager({ dataDir: d, expirySweepMs: 0 });
  uh.shapeMaxBytes = 64 * KiB; // the product's 2 GiB, scaled (400 distinct rows, ~130 KiB)
  LSN.wire({ usageHistory: uh, userTodos: todos, log: () => { }, reconcileAfterMs: null });
  const said = []; const on = uh.onShape; uh.onShape = (e) => { said.push(e); on && on(e); };
  const real = uh.dedupShard.bind(uh); let runs = 0; uh.dedupShard = (f, o) => { runs++; return real(f, o); };
  const notices = () => todos._state.items.filter((i) => i.sessionKey === 'usage-ledger');
  const drain = async () => { for (let i = 0; i < 400 && uh._dedupJobs.size; i++) await sleep(5); };
  const remNow = () => (uh.ingestPaused()[0] || {}).remedy || {};
  await quietAsync(async () => { await uh.ingestRemoteEvents('host-m', 'M', batchOf(9000, 5)); await drain(); });
  const s1 = remNow(), n1 = notices();
  ok(runs === 1 && s1.state === 'proven-over' && n1.length === 1 && n1[0].status === 'open' && /already deduplicated/.test(n1[0].detail) && /stopped trying/.test(n1[0].detail) && !/removing the repeated rows in the background/.test(n1[0].detail),
    `⑨ over the bound, and its dedup found no repeated row: paused, state ${s1.state || '—'}, said «over 2 GiB and already deduplicated» — removing rows cannot help, VibeSpace stopped trying (d9753fa8: resumed — a proven shard was never paused for its size)`, { s1, n: n1.map((i) => [i.status, i.resolvedBy]) });
  const ino0 = fs.statSync(sh).ino;
  fs.copyFileSync(sh, sh + '.repair'); fs.renameSync(sh + '.repair', sh); // a tmp + rename repair: the same rows under a NEW inode
  await quietAsync(async () => { await uh.ingestRemoteEvents('host-m', 'M', batchOf(9000, 5)); await drain(); });
  const s2 = remNow();
  ok(fs.statSync(sh).ino !== ino0 && runs === 2 && s2.state === 'proven-over', `⑨ the same file rewritten under a NEW inode: unproven again ⇒ it gets its dedup (${runs - 1} run), then ${s2.state || '—'} again (d9753fa8: no run — paused for size under state none, for the life of the process)`, { runs, s2 });
  uh.remedyRetryMs = 1; // a backoff cannot bring a run back: there is none
  const n0 = said.length;
  for (let k = 0; k < 3; k++) { await sleep(5); await quietAsync(async () => { await uh.ingestRemoteEvents('host-m', 'M', batchOf(9000, 5)); await drain(); }); }
  ok(runs === 2 && said.length === n0 && notices().length === 1, `⑨ three later pauses: no dedup re-run (${runs - 2}), nothing said again (${said.length - n0}) — the remedy stopped, said once`, { runs, said: said.length - n0 });
  const STATES = ['running', 'judging', 'failed', 'not-rewritten', 'insufficient', 'proven-over', 'ids', 'none'];
  const running = N.LEDGER_NOTE_WORDS.pausedRunning || N.LEDGER_NOTE_WORDS.paused;
  const rowsOf = STATES.map((state) => { const rec = { host: 'host-m', hostName: 'M', shard: SHARD, size: 3 * GiB, why: 'size', remedy: { state, code: 'EACCES', error: 'x', nextAt: Date.now() + 60e3 } }; return [state, (N.ledgerNote({ ingestPaused: [rec] })[0] || {}).words, LSN.noticeOf(rec).detail]; });
  const bad = rowsOf.filter(([state, words, detail]) => !words || (state === 'running' ? words !== running : words === running || /removing the repeated rows in the background/.test(detail)));
  ok(JSON.stringify(UHM.REMEDY_STATES) === JSON.stringify(STATES) && !bad.length && new Set(rowsOf.map(([, x]) => x)).size === STATES.length && Object.keys(LSN.D_NOW).sort().join() === [...STATES].sort().join(),
    `⑨ every state the remedy can be in (${STATES.join(' / ')}) has its OWN row in the Usage window and the notice — none falls back to «the repeated rows are being removed» (falling back: ${rowsOf.filter(([s, x]) => s !== 'running' && x === running).map(([s]) => s).join(', ') || 'none'}; d9753fa8: judging, proven-over, ids, none)`, bad.map(([s, x]) => [s, x]));
});

console.log('⑩ F4 THE BOOT JUDGES BY THE RULE THAT OPENED IT — an exact-ratio notice waits for the index');
await leg('⑩', async () => {
  const d = dirOf('w10'), sh = shardOf(d);
  // each row followed by a 1 MiB hole: 8 unique rows, then a 16-row window three times — 56 MiB the sample reads one row a window
  const order = []; for (let i = 0; i < 8; i++) order.push(i); for (let k = 0; k < 3; k++) for (let i = 0; i < 16; i++) order.push(1000 + i);
  const fd = fs.openSync(sh, 'w'); let at = 0;
  try { for (const i of order) { const b = Buffer.from(row(i) + '\n'); fs.writeSync(fd, b, 0, b.length, at); at += b.length + MiB; } } finally { fs.closeSync(fd); }
  fs.truncateSync(sh, at - MiB);
  const s = LD.shapeOf(sh);
  const todos = new UserTodoManager({ dataDir: d, expirySweepMs: 0 });
  const moves = []; todos.onStatus((it, { status, by }) => { if (it && it.sessionKey === 'usage-ledger') moves.push([status, by]); });
  const notices = () => todos._state.items.filter((i) => i.sessionKey === 'usage-ledger');
  const life = () => {
    const uh = newUh(d); uh.shapeRatioMinBytes = 0; // the product's 64 MiB, scaled (a 56 MiB sparse file)
    uh.dedupShard = (f) => { const p = new Promise(() => { }); uh._dedupJobs.set(f, p); return p; }; // its pass is ⑦'s to prove
    return { uh, wired: LSN.wire({ usageHistory: uh, userTodos: todos, log: () => { }, reconcileAfterMs: null }) };
  };
  const L1 = life();
  await quiet(() => L1.uh.ingestRemoteEvents('host-m', 'M', batchOf(9000, 5)));
  await quietAsync(() => L1.uh.ingestIndexSettled());
  const [r1] = await quiet(() => L1.uh.ingestRemoteEvents('host-m', 'M', batchOf(9000, 5)));
  const first = notices();
  ok(s.ratio != null && s.ratio <= 2 && r1.paused && r1.paused.why === 'ratio' && r1.paused.ratio > 2 && first.length === 1 && first[0].status === 'open', `⑩ a shard the sample reads in shape (${s.ratio == null ? '—' : s.ratio.toFixed(2)}×) and its index out of it (${r1.paused && r1.paused.ratio}× — ${order.length} rows / ${new Set(order).size} distinct): paused by the exact count, ONE notice`, { s: s.ratio, r1 });
  const L2 = life(); // a restart: no index loaded 3 s after boot
  const [n2] = await quiet(() => L2.wired.reconcile());
  const mid = notices(), p2 = L2.uh.ingestPaused()[0];
  ok(n2 === 0 && mid.length === 1 && mid[0].id === first[0].id && mid[0].status === 'open' && p2 && p2.remedy && (p2.remedy.state === 'judging' ? /judges the file by it/.test(mid[0].detail) : p2.remedy.state === 'running' && p2.why === 'ratio' && /removing the repeated rows in the background/.test(mid[0].detail)), `⑩ the restart's reconcile does NOT close it (r8: the hold's read-back is async — by its end the warmed index may have judged it, by the same rule: ${p2 && p2.remedy && p2.remedy.state}) (closed ${n2}; d9753fa8: closed by the sample, shape-ok) — the machine stays paused «judging» until the index is read after the ledger loads`, { n2, items: mid.map((i) => [i.status, i.resolvedBy]), remedy: p2 && p2.remedy });
  await quietAsync(async () => { await L2.uh.whenWarm(); for (let i = 0; i < 400 && L2.uh._judgeKick && L2.uh._judgeKick.size; i++) await sleep(5); });
  const [r3] = await quiet(() => L2.uh.ingestRemoteEvents('host-m', 'M', batchOf(9000, 5)));
  const end = notices(), p3 = L2.uh.ingestPaused()[0];
  ok(end.length === 1 && end[0].id === first[0].id && end[0].status === 'open' && !moves.length && r3.paused && r3.paused.why === 'ratio' && p3 && p3.remedy.state === 'running' && /removing the repeated rows in the background/.test(end[0].detail), `⑩ the index read, the SAME rule judges it: still ${r3.paused && r3.paused.ratio}× ⇒ paused, its dedup running — the one notice never closed nor reopened across the restart (${moves.length} status move(s); d9753fa8: closed at boot, reopened at the next ingest — a flap at every restart)`, { moves, r3 });
});

console.log('⑪ F4 AN `ids` PAUSE IS NO DEDUP LOOP — its own words, the remedy stops');
await leg('⑪', async () => {
  const d = dirOf('w11'), sh = shardOf(d);
  fs.writeFileSync(sh, Array.from({ length: 300 }, (_, i) => row(i)).join('\n') + '\n');
  const uh = newUh(d), todos = new UserTodoManager({ dataDir: d, expirySweepMs: 0 });
  uh.remedyRetryMs = 20; // the product's 10 min, scaled — a loop would run again at every later pause
  LSN.wire({ usageHistory: uh, userTodos: todos, log: () => { }, reconcileAfterMs: null });
  const said = []; const on = uh.onShape; uh.onShape = (e) => { said.push(e); on && on(e); };
  const real = uh.dedupShard.bind(uh); let runs = 0; uh.dedupShard = (f, o) => { runs++; return real(f, o); };
  const drain = async () => { for (let i = 0; i < 400 && uh._dedupJobs.size; i++) await sleep(5); };
  const [r0] = await quiet(() => uh.ingestRemoteEvents('host-m', 'M', batchOf(9000, 5)));
  const ix = uh._ingestIx.get(sh);
  if (ix) ix.over = true; // past the index's bound (LD.MAX_IDS = 5 000 000 distinct rids) — set by hand: a 5 M-row fixture is load
  for (let k = 0; k < 4; k++) { await quietAsync(async () => { await uh.ingestRemoteEvents('host-m', 'M', batchOf(9100 + k, 1)); await drain(); }); await sleep(30); }
  const p = uh.ingestPaused()[0] || {}, rem = p.remedy || {}, n = todos._state.items.filter((i) => i.sessionKey === 'usage-ledger');
  // r4 re-derived: it PINNED one 'paused' emission over the 4 pauses; each pause now HOLDS its new row, and a held count
  // that moves is news (the same item re-worded in place) — it PINS NOW one emission per count (1 → 4), each in state ids
  const pz = said.filter((e) => e.kind === 'paused'), paused = pz.length, counts = pz.map((e) => e.held);
  ok(r0.appended === 5 && p.why === 'ids' && runs === 0 && rem.state === 'ids' && paused === 4 && counts.join() === '1,2,3,4' && pz.every((e) => e.remedy && e.remedy.state === 'ids') && n.length === 1 && /more distinct records than the index keeps/.test(n[0].detail) && /stopped trying/.test(n[0].detail) && !/were removed/.test(n[0].detail) && /4 events of 2026-10 held/.test(n[0].detail),
    `⑪ a month with more distinct rows than the index keeps: paused 'ids', NO dedup (${runs} run(s) over 4 pauses past the backoff — d9753fa8: one at every backoff, each removing 0), state ${rem.state || '—'}, said in its own words, ONE item re-worded only as its held count moved (${counts.join(' → ')}), never «rows were removed»`, { runs, rem, counts, now: n[0] && n[0].detail.split('\n')[2] });
  const note = N.ledgerNote({ ingestPaused: uh.ingestPaused() })[0];
  ok(note && note.words === N.LEDGER_NOTE_WORDS.pausedIds, '⑪ the Usage window says it in a row of its own (pausedIds)', note);
});

console.log('⑫ F4 A PAUSE IS PER SHARD (host × month) — a proven-over October never stops November; held, counted, bounded, drained in order (round 4)');
await leg('⑫', async () => {
  const d = dirOf('w12'), sh = shardOf(d), nov = path.join(d, 'usage-history', 'events-2026-11.ndjson'), heldDir = path.join(d, 'usage-history', '_held');
  fs.writeFileSync(sh, Array.from({ length: 400 }, (_, i) => row(i)).join('\n') + '\n'); // 400 distinct rows, ~110 KiB
  const NOV = 800000; // remote(NOV + k): 2026-11-01 (T0 + 800 000 s)
  const seams = (uh) => { uh.shapeMaxBytes = 64 * KiB; uh.holdMaxBytes = 4 * KiB; uh.holdSegBytes = 1 * KiB; return uh; }; // the product's 2 GiB / 64 MiB / 16 MiB, scaled (a row is ~260 B)
  const todos = new UserTodoManager({ dataDir: d, expirySweepMs: 0 });
  const notices = () => todos._state.items.filter((i) => i.sessionKey === 'usage-ledger');
  const life = () => { const uh = seams(newUh(d)); const wired = LSN.wire({ usageHistory: uh, userTodos: todos, log: () => { }, reconcileAfterMs: null }); return { uh, wired }; };
  const L1 = life(), uh = L1.uh;
  await quietAsync(() => uh.dedupShard(sh)); // a real pass over THIS inode: no repeated row — proven
  const oct0 = size(sh);
  // the batch: 5 October events (the over month) + 5 November ones, read from the device cursor {…}
  const [r1] = await quiet(() => uh.ingestRemoteEvents('host-m', 'M', batchOf(9000, 5) + batchOf(NOV, 5), { cursors: { '/home/u/.claude/projects/p/a.jsonl': 4242 }, since: 'hub' }));
  const cur = uh.hostCursorOf ? uh.hostCursorOf('host-m') : null;
  ok(r1 && r1.appended === 5 && onceIn(nov, [NOV, NOV + 1, NOV + 2, NOV + 3, NOV + 4]) && size(sh) === oct0 && r1.held === 5 && r1.paused && r1.paused.why === 'size' && r1.paused.remedy && r1.paused.remedy.state === 'proven-over' && r1.paused.held === 5 && cur && cur.cursors && cur.cursors['/home/u/.claude/projects/p/a.jsonl'] === 4242,
    `⑫ a proven-over October + a batch of October and November: November APPENDED (${r1 && r1.appended}), October HELD and counted (${r1 && r1.held}; its file untouched), the hub's cursor past the whole batch — here November's file holds ${ridsOf(nov).length} row(s) (4e94e377: the whole batch refused, 0 appended, November never written)`, { r1, cur: cur && cur.cursors });
  const n1 = notices(), w0 = LSN.noticeOf ? LSN.noticeOf({ ...(r1 && r1.paused), holdMax: undefined }) : {};
  ok(n1.length === 1 && n1[0].status === 'open' && /^Usage of M for 2026-10 is held/.test(n1[0].text) && /5 events of 2026-10 held until the file is back in shape/.test(n1[0].detail) && /its other months are recorded as usual/.test(n1[0].detail) && /at most 64 MiB/.test(w0.detail || ''),
    `⑫ said: ONE notice for M × 2026-10 — «${n1[0] ? n1[0].text : ''}», «5 events of 2026-10 held until the file is back in shape», the other months recorded, the bound named (64 MiB in the product)`, n1.map((i) => [i.text, i.detail.split('\n')[1]]));
  const notes = N.ledgerNote({ ingestPaused: uh.ingestPaused() });
  ok(notes.length === 2 && notes[0].words === N.LEDGER_NOTE_WORDS.pausedProvenOver && notes[1].words === N.LEDGER_NOTE_WORDS.pausedHeld && notes[1].vars.held === '5' && notes[1].vars.month === '2026-10', '⑫ the Usage window says it: the month\'s row (pausedProvenOver) and what is held (pausedHeld: 5 of 2026-10)', notes);
  // a November-only batch: appended; October stays paused and held
  const [r2] = await quiet(() => uh.ingestRemoteEvents('host-m', 'M', batchOf(NOV + 5, 3)));
  // a re-send of the same October window + 3 new and one the LEDGER already holds (req 5: in the October file)
  const [r3] = await quiet(() => uh.ingestRemoteEvents('host-m', 'M', batchOf(9000, 8) + remote(5) + '\n'));
  const p3 = uh.ingestPaused().find((p) => p.host === 'host-m') || {};
  ok(r2 && r2.appended === 3 && p3.shard === SHARD && r3 && r3.appended === 0 && r3.held === 4 && r3.duplicates === 5 && p3.held === 9 && size(sh) === oct0,
    `⑫ November alone: appended (${r2 && r2.appended}), October still paused; the window re-sent: held ONCE (+${r3 && r3.held}, ${r3 && r3.duplicates} duplicates — ${p3.held} held), the October file untouched`, { r2, r3, held: p3.held });
  // THE BOUND: another machine's October, 12 batches of 4 rows (~1 KiB each) into a 4 KiB hold of 1 KiB segments
  const b = 'host-b';
  const rowsB = []; for (let k = 0; k < 12; k++) { const ids = [9500 + 4 * k, 9501 + 4 * k, 9502 + 4 * k, 9503 + 4 * k]; rowsB.push(...ids); await quiet(() => uh.ingestRemoteEvents(b, 'B', ids.map((i) => remote(i)).join('\n') + '\n')); }
  const pb = uh.ingestPaused().find((p) => p.host === b) || {};
  // r6 re-derived: it PINNED every file of B's hold under the bound — the dropped set lives BESIDE the hold now (its own
  // file: the dropped rows' ids, never a position), so it PINS NOW the held rows' segments under the bound and the set
  // file naming exactly the dropped rows
  const all = fs.existsSync(heldDir) ? fs.readdirSync(heldDir).filter((f) => f.includes('~host-b.')) : [], files = all.filter((f) => f.endsWith('.ndjson'));
  const onDisk = files.reduce((a, f) => a + size(path.join(heldDir, f)), 0), keptB = files.sort((x, y) => Number(x.split('.')[1]) - Number(y.split('.')[1])).flatMap((f) => ridsOf(path.join(heldDir, f)));
  const setB = new Set(); for (const f of all.filter((x) => x.endsWith('.dropped'))) for (const l of fs.readFileSync(path.join(heldDir, f), 'utf8').split('\n')) { try { const j = JSON.parse(l); for (const r of j.gone || []) setB.add(r); for (const r of j.back || []) setB.delete(r); } catch { } }
  ok(pb.dropped > 0 && pb.held + pb.dropped === rowsB.length && onDisk <= 4 * KiB && keptB.join() === rowsB.slice(pb.dropped).map((i) => hidOf(i, b)).join() && setB.size === pb.dropped && rowsB.slice(0, pb.dropped).every((i) => setB.has(hidOf(i, b))),
    `⑫ the hold is BOUNDED: ${onDisk} B of held rows on disk for B's October (≤ 4 KiB, the product's 64 MiB scaled) — past it the ${pb.dropped} OLDEST held rows dropped and COUNTED (${pb.held} held + ${pb.dropped} dropped = ${rowsB.length} sent; the set beside it names those ${setB.size} rows), the newest kept in order`, { held: pb.held, dropped: pb.dropped, onDisk, files: all, set: setB.size });
  const nb = notices().find((i) => /^Usage of B for 2026-10/.test(i.text));
  ok(nb && new RegExp(`Past the bound: the ${pb.dropped} oldest held events of 2026-10 were dropped`).test(nb.detail) && N.ledgerNote({ ingestPaused: [pb] }).some((x) => (x.words === N.LEDGER_NOTE_WORDS.pausedDropped || x.words === N.LEDGER_NOTE_WORDS.pausedDroppedMaybe) && x.vars.dropped === String(pb.dropped)), // r8: B's rows were held while the month's index was not in memory — «may already be recorded»
    `⑫ the drop is SAID, never silent: B's own notice «Past the bound: the ${pb.dropped} oldest held events of 2026-10 were dropped — counted here, never recorded» and the Usage window's pausedDropped row`, nb && nb.detail.split('\n'));
  // A RESTART: the holds read back — the counts and the dropped count the same, the same notices
  const before = notices().map((i) => i.id).sort().join();
  const L2 = life();
  await quiet(() => L2.wired && L2.wired.reconcile && L2.wired.reconcile());
  await quietAsync(async () => { for (let i = 0; i < 400 && L2.uh._dedupJobs.size; i++) await sleep(5); }); // its one dedup pass after a restart (proven is in memory)
  const m2 = L2.uh.ingestPaused().find((p) => p.host === 'host-m') || {}, b2 = L2.uh.ingestPaused().find((p) => p.host === b) || {};
  ok(m2.held === 9 && b2.held === pb.held && b2.dropped === pb.dropped && notices().filter((i) => i.status === 'open').map((i) => i.id).sort().join() === before,
    `⑫ a restart reads every hold back: M ${m2.held} held, B ${b2.held} held + ${b2.dropped} dropped (the marker line) — the same two notices, open`, { m2: [m2.held, m2.dropped], b2: [b2.held, b2.dropped] });
  // BACK IN SHAPE — the owner raises the bound: each machine's month at its own next ingest (a November batch)
  L2.uh.shapeMaxBytes = 2 * GiB;
  const [r5] = await quiet(() => L2.uh.ingestRemoteEvents('host-m', 'M', batchOf(NOV + 8, 2)));
  const octRids = ridsOf(sh), tailM = octRids.slice(400);
  const heldM = [9000, 9001, 9002, 9003, 9004, 9005, 9006, 9007].map((i) => hidOf(i));
  const nm = notices().find((i) => /^Usage of M for 2026-10/.test(i.text)), stillB = L2.uh.ingestPaused().some((p) => p.host === b);
  ok(r5 && r5.appended === 2 && tailM.join() === heldM.join() && octRids.filter((r) => r === hidOf(5)).length === 1 && nm && nm.status === 'done' && nm.resolvedBy === 'shape-ok' && stillB && !(fs.existsSync(heldDir) && fs.readdirSync(heldDir).some((f) => f.includes('~host-m.'))),
    `⑫ the bound raised, M's next ingest: its October RESUMED — the ${heldM.length} held events appended IN ORDER (req 5 the ledger already had: 0 bytes, the ledger law), its hold gone, its notice closed (${nm && nm.resolvedBy}); B's October waits for B's own ingest`, { r5, tailM, nm: nm && [nm.status, nm.resolvedBy], stillB });
  const [r6] = await quiet(() => L2.uh.ingestRemoteEvents(b, 'B', batchOf(NOV + 20, 1)));
  const tailB = ridsOf(sh).slice(400 + heldM.length);
  ok(r6 && r6.appended === 1 && tailB.join() === rowsB.slice(pb.dropped).map((i) => hidOf(i, b)).join() && !L2.uh.ingestPaused().length && notices().every((i) => i.status !== 'open'),
    `⑫ B's next ingest: its ${tailB.length} held events appended in order (the ${pb.dropped} dropped never), nothing paused, every notice closed`, { r6, tailB: tailB.length });
});

console.log('⑬ F4 A RESUME FOLLOWS A DRAIN; ONE NOTICE PER (machine, file); A HOLD ERROR IS ITS MONTH\'S; THE DROPPED COUNT IS A SET (round 5)');
await leg('⑬', async () => {
  const NOV = 800000; // remote(NOV + k): 2026-11-01
  // the product's 2 GiB / 64 MiB / 16 MiB, scaled (a row is ~260 B); the month's dedup is not this leg's (it never ends)
  const seams = (uh) => { uh.shapeMaxBytes = 64 * KiB; uh.holdMaxBytes = 4 * KiB; uh.holdSegBytes = 1 * KiB; uh.dedupShard = (f) => { const p = new Promise(() => { }); uh._dedupJobs.set(f, p); return p; }; return uh; };
  const world = (name) => {
    const d = dirOf(name), sh = shardOf(d);
    fs.writeFileSync(sh, Array.from({ length: 400 }, (_, i) => row(i)).join('\n') + '\n'); // 400 distinct rows, ~110 KiB: over the seam
    const todos = new UserTodoManager({ dataDir: d, expirySweepMs: 0 });
    const notices = () => todos._state.items.filter((i) => i.sessionKey === 'usage-ledger');
    const life = () => { const uh = seams(newUh(d)); const wired = LSN.wire({ usageHistory: uh, userTodos: todos, log: () => { }, reconcileAfterMs: null }); return { uh, wired }; };
    const heldDir = path.join(d, 'usage-history', '_held');
    const heldFiles = (host = 'host-m') => (fs.existsSync(heldDir) ? fs.readdirSync(heldDir).filter((f) => f.includes(`~${host}.`)) : []);
    return { d, sh, todos, notices, life, heldFiles };
  };
  const pausedOf = (uh, host = 'host-m', shard = SHARD) => uh.ingestPaused().find((p) => p.host === host && p.shard === shard) || null;
  const ENOSPC = () => Object.assign(new Error('ENOSPC: no space left on device, write'), { code: 'ENOSPC' });
  /** The disk full for the files `when` picks: fs.appendFileSync refuses them until the returned undo. */
  const refuseAppend = (when) => { const real = fs.appendFileSync; fs.appendFileSync = function (f, ...a) { if (when(String(f))) throw ENOSPC(); return real.call(this, f, ...a); }; return () => { fs.appendFileSync = real; }; };
  const OCT5 = [9000, 9001, 9002, 9003, 9004].map((i) => hidOf(i));

  // ── A RESUME FOLLOWS A DRAIN ──
  {
    const W = world('w13a'), L1 = W.life(), uh = L1.uh;
    await quiet(() => uh.ingestRemoteEvents('host-m', 'M', batchOf(9000, 5))); // October out of shape: its 5 held
    uh.shapeMaxBytes = 2 * GiB; // back in shape (the bound raised) …
    let undo = refuseAppend((f) => f === W.sh); // … and the disk full for the month's file
    await quiet(() => uh.ingestRemoteEvents('host-m', 'M', batchOf(NOV, 2))); // the machine's next ingest (November): October's drain fails
    const p1 = pausedOf(uh), n1 = W.notices();
    ok(p1 && p1.drain && p1.drain.state === 'failed' && p1.drain.code === 'ENOSPC' && p1.held === 5 && n1.length === 1 && n1[0].status === 'open' && /5 held events could not be recorded: ENOSPC — retrying/.test(n1[0].detail) && W.heldFiles().length > 0 && ridsOf(W.sh).length === 400,
      `⑬ a drain that FAILS (ENOSPC) once the month is back in shape: the month stays PAUSED (${p1 ? `drain-failed, ${p1.held} held` : 'no pause'}), its notice open and re-worded «5 held events could not be recorded: ENOSPC — retrying», the rows still held (ff094d46: resumed BEFORE the drain — no pause, the notice closed, the rows stranded)`, { p1, n: n1.map((i) => [i.status, i.text, i.detail.split('\n')[3]]) });
    await quiet(() => uh.ingestRemoteEvents('host-m', 'M', batchOf(NOV + 2, 1))); // still full: tried again at the machine's next ingest (any month)
    const p2 = pausedOf(uh);
    ok(p2 && p2.drain && p2.drain.tries === 2 && p2.held === 5 && W.notices().length === 1, `⑬ tried again at the machine's every ingest, ANY month (a November batch): still full ⇒ try ${p2 && p2.drain ? p2.drain.tries : 0}, still held, still one notice (ff094d46: never — the month was no longer paused)`, p2);
    undo();
    await quiet(() => uh.ingestRemoteEvents('host-m', 'M', batchOf(NOV + 3, 1))); // room again: the machine's next ingest drains it
    const n3 = W.notices();
    ok(ridsOf(W.sh).slice(400).join() === OCT5.join() && !pausedOf(uh) && n3.length === 1 && n3[0].status === 'done' && n3[0].resolvedBy === 'shape-ok' && !W.heldFiles().length,
      `⑬ room again, the machine's next ingest: the 5 held events recorded IN ORDER, THEN the pause ends and its one notice closes (${n3[0] && n3[0].resolvedBy}) — the hold gone (ff094d46: still stranded in the hold)`, { tail: ridsOf(W.sh).slice(400), n3: n3.map((i) => [i.status, i.resolvedBy]) });
    // … and at a RESTART: still full ⇒ the boot tries (drain-failed, the same notice open); room ⇒ the boot drains it
    const V = world('w13a2'), M1 = V.life();
    await quiet(() => M1.uh.ingestRemoteEvents('host-m', 'M', batchOf(9000, 5)));
    M1.uh.shapeMaxBytes = 2 * GiB;
    undo = refuseAppend((f) => f === V.sh);
    await quiet(() => M1.uh.ingestRemoteEvents('host-m', 'M', batchOf(NOV, 1)));
    const M2 = V.life(); M2.uh.shapeMaxBytes = 2 * GiB;
    await quiet(() => M2.wired.reconcile());
    const b1 = pausedOf(M2.uh), vb = V.notices().map((i) => ({ ...i })); // as the boot left them (the items are live)
    undo();
    const M3 = V.life(); M3.uh.shapeMaxBytes = 2 * GiB;
    await quiet(() => M3.wired.reconcile());
    const ve = V.notices();
    ok(b1 && b1.drain && b1.drain.state === 'failed' && vb.length === 1 && vb[0].status === 'open' && ridsOf(V.sh).slice(400).join() === OCT5.join() && !pausedOf(M3.uh) && ve.length === 1 && ve[0].status === 'done',
      `⑬ at a restart: still full ⇒ the boot's try fails and the month stays paused (${b1 && b1.drain ? b1.drain.state : 'not paused'}, its one notice ${vb[0] && vb[0].status}); room ⇒ the boot drains it in order and the notice closes (ff094d46: no pause after the failure — nothing said)`, { b1, vb: vb.map((i) => i.status), ve: ve.map((i) => [i.status, i.resolvedBy]) });
  }

  // ── ONE NOTICE PER (machine, file) ──
  {
    const W = world('w13b'), L1 = W.life(), uh = L1.uh;
    await quiet(() => uh.ingestRemoteEvents('host-m', 'M', batchOf(9000, 3)));
    const id0 = W.notices()[0] && W.notices()[0].id;
    await quiet(() => uh.ingestRemoteEvents('host-m', 'Build box', batchOf(9003, 2))); // the machine RENAMED while paused (2 more held)
    const nb = W.notices();
    ok(nb.length === 1 && nb[0].id === id0 && nb[0].status === 'open' && /^Usage of Build box for 2026-10 is held/.test(nb[0].text) && /5 events of 2026-10 held/.test(nb[0].detail),
      `⑬ the machine RENAMED while paused: the SAME item re-worded in place («${nb[nb.length - 1] ? nb[nb.length - 1].text.slice(0, 40) : ''}…», 5 held) — ${nb.length} item(s) (ff094d46: a second item filed, the first one left open)`, nb.map((i) => [i.id === id0, i.status, i.text]));
    W.todos.readNotices([id0], true, 'user'); // the owner marks it read
    const L2 = W.life(); await quiet(() => L2.wired.reconcile()); // a restart reads the hold back (the boot knows the host id only)
    const nr = W.notices();
    ok(nr.length === 1 && nr[0].id === id0 && nr[0].status === 'open' && /^Usage of Build box for 2026-10/.test(nr[0].text),
      `⑬ marked read, then a restart reads the hold back: the SAME item reopened, still «Build box» — ${nr.length} item(s) (ff094d46: a second one, «Usage of host-m …»)`, nr.map((i) => [i.id === id0, i.status, i.text]));
    L2.uh.shapeMaxBytes = 2 * GiB;
    await quiet(() => L2.uh.ingestRemoteEvents('host-m', 'Build box', batchOf(NOV, 1)));
    const ne = W.notices();
    ok(ne.length === 1 && ne.every((i) => i.status !== 'open') && ne[0].resolvedBy === 'shape-ok', `⑬ back in shape: 'resumed' closes its one item whatever it says (${ne.map((i) => `${i.status}/${i.resolvedBy}`).join(', ')}) — none left open`, ne.map((i) => [i.status, i.resolvedBy, i.text]));
  }

  // ── A HOLD ERROR IS ITS MONTH'S ──
  {
    const W = world('w13c'), L1 = W.life(), uh = L1.uh, SEP = 'events-2026-09.ndjson';
    fs.writeFileSync(path.join(W.d, 'usage-history', SEP), Array.from({ length: 400 }, (_, i) => row(20000 + i)).join('\n') + '\n'); // September over the seam too
    const sepAt = Date.UTC(2026, 8, 20, 12, 0, 0);
    const sep = (n) => Array.from({ length: n }, (_, k) => JSON.stringify({ rid: 'req_sep_' + k, ts: sepAt + k * 1000, sid: 'sid-1', model: 'claude-opus-5-5', cwd: '/srv/work/app', origin: 'main', i: 10, cw5: 1, cw1: 0, cr: 5000, o: 300, tier: null })).join('\n') + '\n';
    const undo = refuseAppend((f) => f.includes(`${path.sep}_held${path.sep}events-2026-09~`)); // September's hold cannot be written
    const [r1] = await quiet(() => uh.ingestRemoteEvents('host-m', 'M', sep(3) + batchOf(9000, 3))); // September first, then October
    undo();
    const ps = pausedOf(uh, 'host-m', SEP), po = pausedOf(uh);
    const ns = W.notices().find((i) => /for 2026-09/.test(i.text)), no = W.notices().find((i) => /for 2026-10/.test(i.text));
    ok(ps && ps.holdError === 'ENOSPC' && po && !po.holdError && po.held === 3 && ns && /could not be held beside the file \(ENOSPC\)/.test(ns.detail) && no && /3 events of 2026-10 held until/.test(no.detail) && !/could not be held/.test(no.detail) && r1 && Array.isArray(r1.holdFailed) && r1.holdFailed.length === 1 && r1.holdFailed[0].month === '2026-09' && r1.ack === false,
      `⑬ a hold write that fails is ITS month's: September «could not be held (ENOSPC)», October held and said so (${po ? po.held : 0} held${po && po.holdError ? `, yet stamped «${po.holdError}»` : ''}) — the answer names the month (holdFailed ${JSON.stringify(r1 && r1.holdFailed)}), not acked (ff094d46: October's notice said «could not be held» while its rows were held)`, { ps: ps && ps.holdError, po: po && [po.held, po.holdError], r1 });
    const [r2] = await quiet(() => uh.ingestRemoteEvents('host-m', 'M', sep(3) + batchOf(9000, 3))); // the device sends it again, the disk has room
    const ps2 = pausedOf(uh, 'host-m', SEP), ns2 = W.notices().find((i) => /for 2026-09/.test(i.text));
    ok(ps2 && !ps2.holdError && ps2.held === 3 && ns2 && !/could not be held/.test(ns2.detail) && r2 && r2.ack === true && !r2.holdFailed && r2.held === 3 && r2.duplicates === 3,
      `⑬ …reset per month: the re-sent batch with room ⇒ September held (${ps2 ? ps2.held : 0}), its error gone, October's 3 duplicates of its hold — acked`, { ps2, r2 });
  }

  // ── THE DROPPED COUNT IS A SET ──
  {
    const W = world('w13d'), L1 = W.life(), host = 'host-c', sent = [];
    const send = async (u, k) => { const ids = [0, 1, 2, 3].map((j) => 9600 + 4 * k + j); sent.push(...ids); await quiet(() => u.ingestRemoteEvents(host, 'C', ids.map((i) => remote(i)).join('\n') + '\n')); };
    for (let k = 0; k < 3; k++) await send(L1.uh, k); // three segments (~1 KiB each) of a 4 KiB hold
    // THE CRASH: the fourth batch's append lands — the set's line names the segment it drops (r6: by its rows) — and the
    // process dies before the unlink
    const realUnlink = fs.unlinkSync;
    fs.unlinkSync = function (f, ...a) { if (String(f).includes(`${path.sep}_held${path.sep}`)) return undefined; return realUnlink.call(this, f, ...a); };
    try { await send(L1.uh, 3); } finally { fs.unlinkSync = realUnlink; }
    const d1 = (pausedOf(L1.uh, host) || {}).dropped;
    const L2 = W.life(); await quiet(() => L2.wired.reconcile()); // the next life reads the hold back
    const c2 = pausedOf(L2.uh, host) || {};
    const nc = W.notices().find((i) => /^Usage of C for 2026-10/.test(i.text));
    ok(d1 > 0 && c2.dropped === d1 && c2.held + c2.dropped === sent.length && nc && new RegExp(`the ${c2.dropped} oldest held events of 2026-10 were dropped`).test(nc.detail),
      `⑬ a crash between a drop's marker and its unlink: the next life counts it ONCE — ${c2.held} held + ${c2.dropped} dropped = ${(c2.held || 0) + (c2.dropped || 0)} for ${sent.length} sent, the notice says ${c2.dropped} (ff094d46: the surviving segment held again beside its count)`, { d1, held: c2.held, dropped: c2.dropped, sent: sent.length });
    await send(L2.uh, 4); // the next drop: the set grows by one segment, never by the one it already holds
    const c3 = pausedOf(L2.uh, host) || {};
    ok(c3.held + c3.dropped === sent.length && c3.dropped > c2.dropped, `⑬ …and the next drop counts only what it drops: ${c3.held} held + ${c3.dropped} dropped = ${(c3.held || 0) + (c3.dropped || 0)} for ${sent.length} sent (ff094d46: 24 for 20 — the survivor dropped and counted twice)`, { held: c3.held, dropped: c3.dropped, sent: sent.length });
    L2.uh.shapeMaxBytes = 2 * GiB;
    await quiet(() => L2.uh.ingestRemoteEvents(host, 'C', batchOf(NOV, 1))); // back in shape: drained
    const got = ridsOf(W.sh).filter((r) => r.startsWith(`h:${host}:`)), want = sent.slice(c3.dropped).map((i) => hidOf(i, host));
    ok(got.join() === want.join() && !sent.slice(0, c3.dropped).some((i) => got.includes(hidOf(i, host))), `⑬ drained: the ${got.length} held events recorded in order, none of the ${c3.dropped} «never recorded» among them — recorded + dropped = ${got.length + (c3.dropped || 0)} for ${sent.length} sent (ff094d46: dropped rows recorded too)`, { got: got.length, want: want.length, dropped: c3.dropped });
  }
});

console.log('⑭ A DENY IS READABLE BEFORE THE FIRST ACT — the act in the 3 s before the boot reconcile (round 5)');
await leg('⑭', async () => {
  const ANS = { by: 'user', answeredBy: 'human:0123456789ab' };
  const w = asker('w14');
  await heldOut(w, HARVEST);
  const u = w.items().find((i) => i.action.standing && i.action.by === 'system:usage-harvest');
  await w.asker.answer(u.action.askId, { answer: 'deny', ...ANS });
  w.todos.flush();
  const timers = [];
  const mkOn = (todos) => ASK.create({ hosts: w.hosts, userTodos: todos, log: () => { }, now: () => w.clock.t, instanceKind: 'cluster', settingOf: () => undefined, timers: { set: (fn, ms) => { const h = { fn, ms, live: true }; timers.push(h); return h; }, clear: (h) => { if (h) h.live = false; } } });
  const fire = () => { for (const h of timers.splice(0)) if (h.live) { h.live = false; h.fn(); } };
  // THE RESTART: the store read back from disk, the asker built — the subject's act comes before any reconcile
  const t2 = new UserTodoManager({ dataDir: w.d, expirySweepMs: 0, now: () => w.clock.t });
  const a2 = mkOn(t2);
  const p = a2.check(w.hid, HARVEST); await tick();
  const held = a2.list().some((k) => k.by === 'system:usage-harvest'), mid = t2.get(u.id);
  w.clock.t += 61000; fire(); const g = await p;
  const it2 = t2.get(u.id);
  ok(!held && g && g.code === 'hub_act_denied' && mid && mid.status !== 'open' && it2 && it2.status !== 'open' && it2.resolvedBy === 'denied',
    `⑭ Deny → restart → the subject's act before the boot reconcile: refused AT ONCE by the Deny (${g && (g.code || g.ask)}), its item stays denied (${it2 && `${it2.status}/${it2.resolvedBy}`}) (ff094d46: the item reopened, the act held 60 s, ask_expired)`, { held, g, mid: mid && [mid.status, mid.resolvedBy], it2: it2 && [it2.status, it2.resolvedBy] });
  await quiet(() => a2.reconcile());
  const p2 = a2.check(w.hid, HARVEST); await tick(); w.clock.t += 61000; fire(); const g2 = await p2;
  ok(g2 && g2.code === 'hub_act_denied' && t2.get(u.id).status !== 'open' && t2._state.items.filter((i) => i.action && i.action.standing).length === 1, `⑭ …and the boot reconcile after it changes nothing: still refused (${g2 && g2.code}), one item, denied`, { g2 });
  // the store's own law: a re-file of a decided item is refused by the decision — returned as it is, never reopened
  const it = t2.get(u.id);
  const again = t2.add('machines', { origin: 'machines', text: it.text, detail: 'asked again', kind: 'action', by: 'agent', sessionName: 'Machines', action: it.action });
  ok(again && again.decided === true && t2.get(u.id).status !== 'open' && t2.get(u.id).detail !== 'asked again', `⑭ the store: a re-file of the item the owner decided is the Deny's — returned decided (${again && again.decided}), never reopened (ff094d46: reopened with the new words)`, again && [again.status, again.decided]);
  // check() reads the stored decision of a subject it holds no entry for (here: a store that took the item after the asker was built)
  const t3 = new UserTodoManager({ dataDir: dirOf('w14b'), expirySweepMs: 0, now: () => w.clock.t });
  const a3 = mkOn(t3);
  t3._state.items.push(JSON.parse(JSON.stringify(t2.get(u.id))));
  const p3 = a3.check(w.hid, HARVEST); await tick();
  const held3 = a3.list().some((k) => k.by === 'system:usage-harvest');
  w.clock.t += 61000; fire(); const g3 = await p3;
  ok(!held3 && g3 && g3.code === 'hub_act_denied' && t3.get(u.id).status !== 'open', `⑭ check() with no entry for the subject consults its stored decision: refused at once (${g3 && (g3.code || g3.ask)}), the item not reopened (ff094d46: reopened, held, ${g3 && g3.code !== 'hub_act_denied' ? g3.code : 'ask_expired'})`, { held3, g3, st: t3.get(u.id).status });
  // the owner allowing THAT subject still ends the Deny: its item reopened (by the owner) and allowed once ⇒ its next act goes
  t2.setStatus(u.id, 'open', 'user');
  await a2.answer(u.action.askId, { answer: 'once', ...ANS });
  const go = await a2.check(w.hid, HARVEST);
  ok(go && go.ok === true && t2.get(u.id).status === 'done' && t2.get(u.id).resolvedBy === 'allowed', '⑭ …and the owner can still lift it: the item reopened by the owner and allowed once ⇒ the next act goes (the decision is final against a RE-FILE, never against the owner)', { go, item: [t2.get(u.id).status, t2.get(u.id).resolvedBy] });
});

console.log('⑮ F4 THE DROPPED SET IS A SET OF ROWS — a re-sent window over the bound counted once; R1: a stale hold never names a new one (round 6)');
await leg('⑮', async () => {
  const NOV = 800000; // remote(NOV + k): 2026-11-01
  const seams = (uh) => { uh.shapeMaxBytes = 64 * KiB; uh.holdMaxBytes = 4 * KiB; uh.holdSegBytes = 1 * KiB; uh.dedupShard = (f) => { const p = new Promise(() => { }); uh._dedupJobs.set(f, p); return p; }; return uh; };
  const world = (name) => {
    const d = dirOf(name), sh = shardOf(d);
    fs.writeFileSync(sh, Array.from({ length: 400 }, (_, i) => row(i)).join('\n') + '\n'); // 400 distinct rows, ~110 KiB: over the seam
    const todos = new UserTodoManager({ dataDir: d, expirySweepMs: 0 });
    const notices = () => todos._state.items.filter((i) => i.sessionKey === 'usage-ledger');
    const life = () => { const uh = seams(newUh(d)); const wired = LSN.wire({ usageHistory: uh, userTodos: todos, log: () => { }, reconcileAfterMs: null }); return { uh, wired }; };
    const heldDir = path.join(d, 'usage-history', '_held');
    const heldFiles = (host) => (fs.existsSync(heldDir) ? fs.readdirSync(heldDir).filter((f) => f.includes(`~${host}.`)) : []);
    return { d, sh, todos, notices, life, heldFiles };
  };
  const pausedOf = (uh, host) => uh.ingestPaused().find((p) => p.host === host && p.shard === SHARD) || null;
  const sum = (uh, host) => { const p = pausedOf(uh, host) || {}; return { held: p.held, dropped: p.dropped, t: (p.held || 0) + (p.dropped || 0) }; };
  const lines = (ids) => ids.map((i) => remote(i)).join('\n') + '\n';
  const ledgerOf = (W, host) => ridsOf(W.sh).filter((r) => r.startsWith(`h:${host}:`));

  // ── THE RE-SEND PROBE: one window of 30 events over the 4 KiB hold, sent, then re-sent six times ──
  {
    const W = world('w15a'), L1 = W.life(), host = 'host-r', ids = Array.from({ length: 30 }, (_, k) => 9700 + k), sums = [];
    for (let k = 0; k < 7; k++) { await quiet(() => L1.uh.ingestRemoteEvents(host, 'R', lines(ids))); sums.push(sum(L1.uh, host)); }
    const nr = W.notices().find((i) => /^Usage of R\b/.test(i.text));
    ok(sums[0].dropped > 0 && sums.every((x) => x.t === 30) && sums.every((x) => x.dropped === sums[0].dropped) && nr && new RegExp(`the ${sums[6].dropped} oldest held events`).test(nr.detail),
      `⑮ a window of 30 events over the hold's bound, sent, then RE-SENT six times (an older daemon re-walks its window): held + dropped = ${sums.map((x) => x.t).join(' → ')} for 30 sent, the notice says ${sums[6].dropped} «never recorded» (d2ff4026: 30 → 45 → 61 → 77 → 93 → 109 → 125 — the cut keyed by its PLACE, re-held and still counted)`, sums);
    // the set file compacted (its lines rewritten as the set, by a rename) — then a restart reads the set back
    const h1 = L1.uh._holds.get([...L1.uh._holds.keys()].find((k) => k.includes('~host-r')));
    if (h1 && typeof L1.uh._dropCompact === 'function') L1.uh._dropCompact(h1);
    const sf = W.heldFiles(host).filter((f) => f.endsWith('.dropped')), sl = sf.length === 1 ? fs.readFileSync(path.join(W.d, 'usage-history', '_held', sf[0]), 'utf8').split('\n').filter(Boolean) : [];
    ok(sl.length === 1 && (JSON.parse(sl[0]).gone || []).length === sums[6].dropped, `⑮ the set beside the hold: ONE file of the dropped rows' ids (${sl.length} line(s), ${sl[0] ? (JSON.parse(sl[0]).gone || []).length : 0} ids once compacted) — the re-sends wrote nothing to it`, sf);
    const L2 = W.life(); await quiet(() => L2.wired.reconcile()); // a restart reads the set back
    const s2 = sum(L2.uh, host);
    await quiet(() => L2.uh.ingestRemoteEvents(host, 'R', lines(ids)));
    const s3 = sum(L2.uh, host);
    ok(s2.t === 30 && s2.dropped === sums[6].dropped && s3.t === 30 && s3.dropped === s2.dropped, `⑮ a restart reads the set back (${s2.held} held + ${s2.dropped} dropped) and the window once more: ${s3.t} for 30`, { s2, s3 });
    L2.uh.shapeMaxBytes = 2 * GiB; // back in shape: drained at the machine's next ingest
    await quiet(() => L2.uh.ingestRemoteEvents(host, 'R', batchOf(NOV, 1)));
    const got = ledgerOf(W, host), dropped = ids.filter((i) => !got.includes(hidOf(i, host)));
    ok(got.length === s3.held && new Set(got).size === got.length && dropped.length === s3.dropped && got.length + dropped.length === 30 && !pausedOf(L2.uh, host),
      `⑮ back in shape: ${got.length} recorded, each once + ${dropped.length} dropped = ${got.length + dropped.length} for 30 sent — the notice's «never recorded» is what the ledger lacks (d2ff4026: 127 said for 16 missing)`, { got: got.length, dropped: dropped.length, said: s3.dropped });
  }
  // ── THE SEGMENT ROAD: 12 batches (the oldest segments dropped), the same 12 re-sent in their order ──
  {
    const W = world('w15b'), L1 = W.life(), host = 'host-q', sent = Array.from({ length: 48 }, (_, k) => 9800 + k);
    for (let k = 0; k < 12; k++) await quiet(() => L1.uh.ingestRemoteEvents(host, 'Q', lines(sent.slice(4 * k, 4 * k + 4))));
    const s1 = sum(L1.uh, host);
    for (let k = 0; k < 12; k++) await quiet(() => L1.uh.ingestRemoteEvents(host, 'Q', lines(sent.slice(4 * k, 4 * k + 4))));
    const s2 = sum(L1.uh, host);
    ok(s1.dropped > 0 && s1.t === 48 && s2.t === 48 && s2.dropped === s1.dropped, `⑮ the segment road: 12 batches past the bound (${s1.dropped} dropped with their segments), the same 12 re-sent in their order — ${s1.t} then ${s2.t} for 48 sent (d2ff4026: 48 then 96 — a dropped segment's rows forgotten, held again, counted again under a new id)`, { s1, s2 });
  }
  // ── ROOM AGAIN: a re-sent dropped row the hold has room for is HELD, and leaves the set ──
  {
    const W = world('w15c'), L1 = W.life(), host = 'host-p', ids = Array.from({ length: 30 }, (_, k) => 9850 + k);
    await quiet(() => L1.uh.ingestRemoteEvents(host, 'P', lines(ids)));
    const s1 = sum(L1.uh, host);
    L1.uh.holdMaxBytes = 64 * KiB; // the owner gives the hold room
    const [r2] = await quiet(() => L1.uh.ingestRemoteEvents(host, 'P', lines(ids)));
    const s2 = sum(L1.uh, host);
    L1.uh.shapeMaxBytes = 2 * GiB;
    await quiet(() => L1.uh.ingestRemoteEvents(host, 'P', batchOf(NOV, 1)));
    const got = ledgerOf(W, host);
    ok(s1.dropped > 0 && s2.held === 30 && s2.dropped === 0 && r2 && r2.ack === true && got.length === 30 && new Set(got).size === 30,
      `⑮ room again: the ${s1.dropped} dropped events re-sent are HELD and leave the set (${s2.held} held + ${s2.dropped} dropped — recorded after all), then all 30 recorded, each once (d2ff4026: held AND still counted, 45 for 30)`, { s1, s2, got: got.length });
  }
  // ── R1: a drained hold whose files could not be unlinked never names the NEXT hold's rows ──
  {
    const W = world('w15d'), L1 = W.life(), host = 'host-s', old = Array.from({ length: 48 }, (_, k) => 9900 + k);
    for (let k = 0; k < 12; k++) await quiet(() => L1.uh.ingestRemoteEvents(host, 'S', lines(old.slice(4 * k, 4 * k + 4))));
    const d0 = (pausedOf(L1.uh, host) || {}).dropped;
    // back in shape, every unlink of the hold refused (EBUSY — a file still open on the data dir's NFS): drained, the files stay
    L1.uh.shapeMaxBytes = 2 * GiB;
    const realUnlink = fs.unlinkSync;
    fs.unlinkSync = function (f, ...a) { if (String(f).includes(`${path.sep}_held${path.sep}`)) throw Object.assign(new Error('EBUSY: resource busy or locked, unlink'), { code: 'EBUSY' }); return realUnlink.call(this, f, ...a); };
    try { await quiet(() => L1.uh.ingestRemoteEvents(host, 'S', batchOf(NOV, 1))); } finally { fs.unlinkSync = realUnlink; }
    const stale = W.heldFiles(host).length, resumed = !pausedOf(L1.uh, host), oldIn = ledgerOf(W, host).length;
    // out of shape again: a NEW hold of the same month — 8 new events, two batches
    L1.uh.shapeMaxBytes = 64 * KiB;
    const fresh = Array.from({ length: 8 }, (_, k) => 9960 + k);
    await quiet(() => L1.uh.ingestRemoteEvents(host, 'S', lines(fresh.slice(0, 4))));
    await quiet(() => L1.uh.ingestRemoteEvents(host, 'S', lines(fresh.slice(4))));
    const p1 = pausedOf(L1.uh, host) || {};
    const L2 = W.life(); await quiet(() => L2.wired.reconcile()); // a restart reads the holds back
    const p2 = pausedOf(L2.uh, host) || {};
    L2.uh.shapeMaxBytes = 2 * GiB;
    await quiet(() => L2.uh.ingestRemoteEvents(host, 'S', batchOf(NOV + 1, 1)));
    const got = ledgerOf(W, host), rec = fresh.filter((i) => got.filter((r) => r === hidOf(i, host)).length === 1).length;
    ok(d0 > 0 && resumed && stale > 0 && p1.held === 8 && !p1.dropped && p2.held === 8 && !p2.dropped && rec === 8 && new Set(got).size === got.length && got.length === oldIn + 8,
      `⑮ R1: a drained hold whose ${stale} file(s) could not be unlinked (EBUSY) never names the NEXT hold's rows — the new hold of 8 read back after a restart: ${p2.held} held + ${p2.dropped || 0} dropped, then ${rec}/8 recorded, each once (d2ff4026: the new segments reused the old ids — the stale set dropped them at the read-back: 12 held + 36 dropped, 0/8 recorded)`, { d0, stale, p1: [p1.held, p1.dropped], p2: [p2.held, p2.dropped], rec, got: got.length, oldIn });
  }
});

console.log('⑯ F4 A NOTICE IS KEYED BY (host id, file) FROM ITS FIRST FILING — two machines of one name are two items (round 6)');
await leg('⑯', async () => {
  const NOV = 800000;
  const seams = (uh) => { uh.shapeMaxBytes = 64 * KiB; uh.holdMaxBytes = 4 * KiB; uh.holdSegBytes = 1 * KiB; uh.dedupShard = (f) => { const p = new Promise(() => { }); uh._dedupJobs.set(f, p); return p; }; return uh; };
  const world = (name) => {
    const d = dirOf(name), sh = shardOf(d);
    fs.writeFileSync(sh, Array.from({ length: 400 }, (_, i) => row(i)).join('\n') + '\n');
    const todos = new UserTodoManager({ dataDir: d, expirySweepMs: 0 });
    const notices = () => todos._state.items.filter((i) => i.sessionKey === 'usage-ledger');
    const life = () => { const uh = seams(newUh(d)); const wired = LSN.wire({ usageHistory: uh, userTodos: todos, log: () => { }, reconcileAfterMs: null }); return { uh, wired }; };
    return { d, sh, todos, notices, life };
  };
  const pausedOf = (uh, host) => uh.ingestPaused().find((p) => p.host === host && p.shard === SHARD) || null;
  const W = world('w16'), L1 = W.life(), A = 'host-1a2b3c4d', B = 'host-dial-M'; // an ssh machine and a paired one, both named «M»
  await quiet(() => L1.uh.ingestRemoteEvents(A, 'M', batchOf(9000, 3)));
  await quiet(() => L1.uh.ingestRemoteEvents(B, 'M', batchOf(9010, 2)));
  const n1 = W.notices().filter((i) => i.status === 'open'), ia = n1.find((i) => i.text.includes('1a2b3c4d')), ib = n1.find((i) => i.text.includes('dial-M'));
  ok(n1.length === 2 && ia && ib && ia.id !== ib.id && /^Usage of M \(1a2b3c4d\) for 2026-10 is held/.test(ia.text) && /3 events of 2026-10 held/.test(ia.detail) && /2 events of 2026-10 held/.test(ib.detail),
    `⑯ two machines named «M» paused on one month: TWO items, told apart by the host id's short form — ${n1.map((i) => `«${i.text.slice(0, 32)}…»`).join(', ')} (d2ff4026: ONE item — the second filing matched the first by its words)`, n1.map((i) => [i.id, i.text.slice(0, 40), i.detail.split('\n')[1].slice(0, 60)]));
  // the item's id is its key's: the same (host id, file) in another store is the same id
  const V = world('w16b'), M1 = V.life();
  await quiet(() => M1.uh.ingestRemoteEvents(A, 'M', batchOf(9000, 1)));
  const va = V.notices()[0];
  ok(ia && va && va.id === ia.id, `⑯ the item's id is derived from (host id, file) — never minted by a text match: the same key in another store is the same id (${va && va.id})`, { a: ia && ia.id, v: va && va.id });
  // a restart: the same two items, the same ids
  const L2 = W.life(); await quiet(() => L2.wired.reconcile());
  const n2 = W.notices().filter((i) => i.status === 'open');
  ok(n2.length === 2 && ia && ib && n2.some((i) => i.id === ia.id) && n2.some((i) => i.id === ib.id), `⑯ a restart reads both back: ${n2.length} open, the same ids`, n2.map((i) => i.id));
  // the file back in shape: A's next ingest resumes A — B's month is still held until B's own ingest
  L2.uh.shapeMaxBytes = 2 * GiB;
  await quiet(() => L2.uh.ingestRemoteEvents(A, 'M', batchOf(NOV, 1)));
  const a3 = ia && W.todos.get(ia.id), b3 = ib && W.todos.get(ib.id), stillB = !!pausedOf(L2.uh, B);
  ok(a3 && a3.status === 'done' && a3.resolvedBy === 'shape-ok' && b3 && b3.status === 'open' && stillB,
    `⑯ A's month resumed: A's item closed (${a3 && `${a3.status}/${a3.resolvedBy}`}), B's still OPEN while B's month is held (${b3 && b3.status}; B paused: ${stillB}) (d2ff4026: the one shared item closed — B's held month said nowhere)`, { a3: a3 && [a3.status, a3.resolvedBy], b3: b3 && b3.status, stillB });
  await quiet(() => L2.uh.ingestRemoteEvents(B, 'M', batchOf(NOV + 1, 1)));
  const b4 = ib && W.todos.get(ib.id);
  ok(b4 && b4.status === 'done' && !pausedOf(L2.uh, B) && W.notices().every((i) => i.status !== 'open'), `⑯ …and B's own ingest resumes B and closes B's item (${b4 && `${b4.status}/${b4.resolvedBy}`})`, b4 && [b4.status, b4.resolvedBy]);
});

console.log('⑰ F4 THE HOLD\'S DISK NEVER SAYS «DROPPED» ABOUT A ROW MEMORY HOLDS; A DRAINED ROW LEAVES ITS SEGMENT; A RETIREMENT IS RECORDED (round 7)');
await leg('⑰', async () => {
  const NOV = 800000; // remote(NOV + k): 2026-11-01
  const seams = (uh) => { uh.shapeMaxBytes = 64 * KiB; uh.holdMaxBytes = 4 * KiB; uh.holdSegBytes = 1 * KiB; uh.dedupShard = (f) => { const p = new Promise(() => { }); uh._dedupJobs.set(f, p); return p; }; return uh; };
  const world = (name) => {
    const d = dirOf(name), sh = shardOf(d);
    fs.writeFileSync(sh, Array.from({ length: 400 }, (_, i) => row(i)).join('\n') + '\n'); // 400 distinct rows, ~110 KiB: over the seam
    const todos = new UserTodoManager({ dataDir: d, expirySweepMs: 0 });
    const notices = () => todos._state.items.filter((i) => i.sessionKey === 'usage-ledger');
    const life = () => { const uh = seams(newUh(d)); const wired = LSN.wire({ usageHistory: uh, userTodos: todos, log: () => { }, reconcileAfterMs: null }); return { uh, wired }; };
    const heldDir = path.join(d, 'usage-history', '_held');
    const heldFiles = (host) => (fs.existsSync(heldDir) ? fs.readdirSync(heldDir).filter((f) => f.includes(`~${host}.`)) : []);
    return { d, sh, todos, notices, life, heldDir, heldFiles };
  };
  const pausedOf = (uh, host) => uh.ingestPaused().find((p) => p.host === host && p.shard === SHARD) || null;
  const sum = (uh, host) => { const p = pausedOf(uh, host) || {}; return { held: p.held, dropped: p.dropped, t: (p.held || 0) + (p.dropped || 0) }; };
  const lines = (ids) => ids.map((i) => remote(i)).join('\n') + '\n';
  const ledgerOf = (W, host) => ridsOf(W.sh).filter((r) => r.startsWith(`h:${host}:`));
  const fail = (code) => Object.assign(new Error(`${code}: injected`), { code });
  const realAppend = fs.appendFileSync, realTrunc = fs.truncateSync, realUnlink = fs.unlinkSync, realReaddir = fs.readdirSync;
  /** fs.appendFileSync refuses the files `when` picks (ENOSPC); `torn`: it writes the first half of the bytes first. */
  const refuse = (when, { torn = false } = {}) => { fs.appendFileSync = function (f, data, ...a) { if (when(String(f))) { if (torn) { const b = Buffer.from(typeof data === 'string' ? data : String(data)); realAppend.call(this, f, b.subarray(0, b.length >> 1), ...a); } throw fail('ENOSPC'); } return realAppend.call(this, f, data, ...a); }; return () => { fs.appendFileSync = realAppend; }; };
  const segOf = (host) => (f) => f.includes(`~${host}.`) && f.endsWith('.ndjson'), setOf = (host) => (f) => f.includes(`~${host}.`) && f.endsWith('.dropped');
  const ack = (r) => !!(r && r.ack);

  // ── 1. ENOSPC ON THE ROWS: the hold at its bound (12 held + 8 dropped), the next batch's rows refused, then a restart ──
  {
    const W = world('w17a'), L1 = W.life(), host = 'host-b', sent = Array.from({ length: 20 }, (_, k) => 9500 + k);
    for (let k = 0; k < 5; k++) await quiet(() => L1.uh.ingestRemoteEvents(host, 'B', lines(sent.slice(4 * k, 4 * k + 4))));
    const s0 = sum(L1.uh, host);
    const undo = refuse(segOf(host));
    let r6; try { [r6] = await quiet(() => L1.uh.ingestRemoteEvents(host, 'B', lines([9520, 9521, 9522, 9523]))); } finally { undo(); }
    const s1 = sum(L1.uh, host);
    const L2 = W.life(); await quiet(() => L2.wired.reconcile());
    const s2 = sum(L2.uh, host);
    L2.uh.shapeMaxBytes = 2 * GiB;
    await quiet(() => L2.uh.ingestRemoteEvents(host, 'B', batchOf(NOV, 1)));
    const got = ledgerOf(W, host).filter((r) => sent.some((i) => hidOf(i, host) === r));
    ok(s0.held === 12 && s0.dropped === 8 && r6 && !ack(r6) && r6.holdFailed && r6.holdFailed[0].error === 'ENOSPC' && s1.held === 12 && s1.dropped === 8 && s2.held === 12 && s2.dropped === 8 && got.length === 12 && new Set(got).size === 12,
      `⑰ ENOSPC on the ROWS (20 acked: ${s0.held} held + ${s0.dropped} dropped; the next batch unacked, ${r6 && r6.holdFailed ? r6.holdFailed[0].error : '—'}): memory ${s1.held} + ${s1.dropped}, after a restart ${s2.held} + ${s2.dropped}, back in shape ${got.length} of the 20 acked recorded, each once (4f42eaa3: 8 + 12 after the restart — the set's line had landed first, the read-back deleted a live, acked segment as «dropped»; 8 recorded)`, { s0, s1, s2, got: got.length, r6: r6 && { ack: r6.ack, holdFailed: r6.holdFailed } });
  }
  // ── 1b. THE P2 SHAPE: a window over the bound (15 + 15), the bound raised, the window re-sent with its rows refused ──
  {
    const W = world('w17b'), L1 = W.life(), host = 'host-p', ids = Array.from({ length: 30 }, (_, k) => 9850 + k);
    await quiet(() => L1.uh.ingestRemoteEvents(host, 'P', lines(ids)));
    const s0 = sum(L1.uh, host);
    L1.uh.holdMaxBytes = 64 * KiB;
    const undo = refuse(segOf(host));
    let r2; try { [r2] = await quiet(() => L1.uh.ingestRemoteEvents(host, 'P', lines(ids))); } finally { undo(); }
    const s1 = sum(L1.uh, host);
    const L2 = W.life(); await quiet(() => L2.wired.reconcile());
    const s2 = sum(L2.uh, host);
    ok(s0.dropped === 15 && s0.held === 15 && r2 && !ack(r2) && s1.t === 30 && s1.dropped === 15 && s2.held === 15 && s2.dropped === 15,
      `⑰ the re-sent window, its rows refused (ENOSPC, unacked): memory ${s1.held} + ${s1.dropped}, after a restart ${s2.held} held + ${s2.dropped} dropped = ${s2.t} for 30 (4f42eaa3: 15 + 0 — the «back» line had landed, the 15 rows neither held nor counted)`, { s0, s1, s2 });
  }
  // ── 3. A TORN SET APPEND: half its bytes written, then ENOSPC — and the same with the cut refused too ──
  for (const cutToo of [false, true]) {
    const W = world(cutToo ? 'w17c2' : 'w17c'), L1 = W.life(), host = cutToo ? 'host-v' : 'host-t', base0 = cutToo ? 9600 : 9700;
    const sent = Array.from({ length: 32 }, (_, k) => base0 + k);
    for (let k = 0; k < 5; k++) await quiet(() => L1.uh.ingestRemoteEvents(host, 'T', lines(sent.slice(4 * k, 4 * k + 4))));
    const s0 = sum(L1.uh, host);
    const undo = refuse(setOf(host), { torn: true });
    if (cutToo) fs.truncateSync = function (f, ...a) { if (setOf(host)(String(f))) throw fail('EIO'); return realTrunc.call(this, f, ...a); };
    let rt; try { [rt] = await quiet(() => L1.uh.ingestRemoteEvents(host, 'T', lines(sent.slice(20, 24)))); } finally { undo(); fs.truncateSync = realTrunc; }
    for (let k = 6; k < 8; k++) await quiet(() => L1.uh.ingestRemoteEvents(host, 'T', lines(sent.slice(4 * k, 4 * k + 4))));
    const s1 = sum(L1.uh, host);
    const L2 = W.life(); await quiet(() => L2.wired.reconcile());
    const s2 = sum(L2.uh, host);
    ok(s0.held === 12 && s0.dropped === 8 && rt && !ack(rt) && s1.held === 12 && s1.dropped === 16 && s2.held === 12 && s2.dropped === 16,
      `⑰ a TORN set append${cutToo ? ' whose cut back is refused too (EIO — the set rewritten whole at the next append)' : ' (half its bytes, then ENOSPC — cut back, the rows with it)'}: unacked; two more batches — memory ${s1.held} + ${s1.dropped}, after a restart ${s2.held} + ${s2.dropped} (4f42eaa3: 12 + 12 — the next line glued to the fragment, 4 rows counted nowhere)`, { s0, s1, s2 });
  }
  // ── 3b. A TORN ROWS APPEND: half the rows written, then ENOSPC ──
  {
    const W = world('w17d'), L1 = W.life(), host = 'host-u', sent = Array.from({ length: 24 }, (_, k) => 9400 + k);
    for (let k = 0; k < 5; k++) await quiet(() => L1.uh.ingestRemoteEvents(host, 'U', lines(sent.slice(4 * k, 4 * k + 4))));
    const undo = refuse(segOf(host), { torn: true });
    let rt; try { [rt] = await quiet(() => L1.uh.ingestRemoteEvents(host, 'U', lines(sent.slice(20, 24)))); } finally { undo(); }
    const s1 = sum(L1.uh, host), segFiles = W.heldFiles(host).filter((f) => f.endsWith('.ndjson')).length;
    const L2 = W.life(); await quiet(() => L2.wired.reconcile());
    const s2 = sum(L2.uh, host);
    L2.uh.shapeMaxBytes = 2 * GiB;
    await quiet(() => L2.uh.ingestRemoteEvents(host, 'U', batchOf(NOV, 1)));
    const got = ledgerOf(W, host).filter((r) => sent.some((i) => hidOf(i, host) === r));
    ok(rt && !ack(rt) && segFiles === 3 && s1.held === 12 && s1.dropped === 8 && s2.held === 12 && s2.dropped === 8 && got.length === 12 && new Set(got).size === 12 && sent.slice(8, 20).every((i) => got.includes(hidOf(i, host))),
      `⑰ a TORN rows append (half, then ENOSPC — cut back; the file it created unlinked: ${segFiles} segment files): unacked; memory ${s1.held} + ${s1.dropped}, after a restart ${s2.held} + ${s2.dropped}, back in shape the 12 held recorded, each once (got ${got.length})`, { s1, s2, segFiles, got: got.length });
    // a hold whose only file holds no whole row (a failed append's leftover, a torn fragment) is no hold: nothing paused, nothing said
    const Y = world('w17d2'); fs.mkdirSync(Y.heldDir, { recursive: true }); fs.writeFileSync(path.join(Y.heldDir, 'events-2026-10~host-y.0.ndjson'), '{"rid":"h:host-y:req_1","ts":');
    const Y1 = Y.life(); await quiet(() => Y1.wired.reconcile());
    const py = pausedOf(Y1.uh, 'host-y'), ny = Y.notices().filter((i) => i.status === 'open').length;
    ok(!py && ny === 0 && Y.heldFiles('host-y').length === 0, `⑰ a hold whose only file holds no whole row reads back as NO hold: ${py ? `paused (held ${py.held})` : 'nothing paused'}, ${ny} notice(s), its file unlinked (4f42eaa3: a pause of 0 held events, said)`, { py: py && [py.held, py.dropped], ny, left: Y.heldFiles('host-y') });
  }
  // ── 2. A DRAINED ROW LEAVES ITS SEGMENT: a harvest mid-drain, the drain in steps (the reviewer's probe, three variants) ──
  for (const v of ['ok', 'enospc', 'more']) {
    const W = world('w17e-' + v), L1 = W.life(), uh = L1.uh, host = 'host-q', sent = Array.from({ length: 48 }, (_, k) => 9800 + k);
    for (let k = 0; k < 12; k++) await quiet(() => uh.ingestRemoteEvents(host, 'Q', lines(sent.slice(4 * k, 4 * k + 4))));
    const s0 = sum(uh, host);
    await quiet(() => uh._ingestIndex && uh._ingestIndex(W.sh)); // the month's index read inline first (the drain's own law)
    uh.shapeMaxBytes = 2 * GiB; uh.ingestIndexInlineBytes = 2048; // back in shape; the hold (3 KiB) drains in steps
    const said = [];
    const keep = async (fn) => { const [r, l] = await quietRaw(fn); said.push(...l); return r; }; // r8: answered, not settled — the drain goes on
    await keep(() => uh.ingestRemoteEvents(host, 'Q', batchOf(NOV, 1)));
    const h = [...uh._holds.values()].find((x) => x.host === host);
    let window = false;
    // r8: the window both trees have — the oldest segment's 4 rows in the ledger, the hold still draining (r7: its rows read,
    // its file not yet unlinked; r8: its end recorded and its file unlinked in the same step)
    for (let i = 0; i < 4000 && h && h.draining; i++) { if (ledgerOf(W, host).length === 4) { window = true; break; } await tick(); }
    // mid-drain: the oldest segment read into the ledger — new October events arrive (one batch; 'more': two)
    const fresh = Array.from({ length: v === 'more' ? 8 : 4 }, (_, k) => 9900 + k);
    await keep(() => uh.ingestRemoteEvents(host, 'Q', lines(fresh))); // r8: 'more' = ONE batch of 8 (r7 sent two — a drain step may now run between them)
    const midDropped = ((uh.holdsNow ? uh.holdsNow() : []).find((x) => x.host === host) || {}).dropped; // the hold's own count (a draining month's record is not re-said)
    let undo = () => { };
    if (v === 'enospc') undo = refuse((f) => f === W.sh);
    try { for (let i = 0; i < 4000 && h && h.draining; i++) { const [, l] = await quietRaw(() => tick()); said.push(...l); } const [, l2] = await quietAsync(() => null); said.push(...l2); } finally { undo(); }
    const all = [...sent, ...fresh], inLedger = ledgerOf(W, host).filter((r) => all.some((i) => hidOf(i, host) === r));
    const p = pausedOf(uh, host), held = p ? p.held || 0 : 0, missing = all.length - inLedger.length - held;
    const drainSaid = said.map((l) => /(\d+) older held row\(s\) had been dropped/.exec(l)).filter(Boolean).map((m) => Number(m[1]));
    const n = W.notices().find((i) => /^Usage of Q\b/.test(i.text)), nSaid = n ? Number((/the (\d+) oldest held events/.exec(n.detail) || [])[1] || 0) : 0;
    const told = v === 'enospc' ? (p ? p.dropped : -1) : drainSaid.length ? drainSaid[drainSaid.length - 1] : midDropped;
    const okEnd = (v === 'enospc' ? !!(p && p.drain && p.drain.state === 'failed' && n && n.status === 'open') : !p && drainSaid.length > 0 && n && n.status === 'done') && nSaid === missing;
    // r10 PINNED → PINS NOW: 'more' pinned 40 missing — the 8 new events pushed out an undrained segment (4 more dropped); since
    // r10 rows that would push out a row not drained yet WAIT for the drain's next step (usage-history _holdAppend): 36, the
    // count from before the drain, in every variant
    ok(window && s0.held === 12 && s0.dropped === 36 && told === missing && midDropped === missing && okEnd && missing === 36,
      `⑰ a harvest MID-DRAIN (${v === 'ok' ? 'in shape' : v === 'enospc' ? 'the drain then refused — ENOSPC on the ledger' : '8 new events at once: they wait for the drain\'s next step — none of the undrained rows pushed out'}): ${told} said dropped (its ${v === 'enospc' ? 'open' : 'closed'} notice: «the ${nSaid} oldest held events»), ${missing} missing (${inLedger.length} recorded + ${held} held of ${all.length} sent) (4f42eaa3: ${v === 'more' ? 'the drained rows counted with the drop' : '40 said for 36 missing'} — a drained row stayed in its segment's rids, the bound counted the drained bytes)`, { window, s0, midDropped, told, missing, inLedger: inLedger.length, held, drainSaid, nSaid, p: p && [p.held, p.dropped, p.drain && p.drain.state] });
  }
  // ── 4. A RETIREMENT IS RECORDED: a drain whose every unlink fails (EBUSY), the notice closed, a restart before the next hold ──
  {
    const W = world('w17f'), L1 = W.life(), host = 'host-s', old = Array.from({ length: 48 }, (_, k) => 9300 + k);
    for (let k = 0; k < 12; k++) await quiet(() => L1.uh.ingestRemoteEvents(host, 'S', lines(old.slice(4 * k, 4 * k + 4))));
    L1.uh.shapeMaxBytes = 2 * GiB;
    fs.unlinkSync = function (f, ...a) { if (String(f).includes(`${path.sep}_held${path.sep}`)) throw fail('EBUSY'); return realUnlink.call(this, f, ...a); };
    try { await quiet(() => L1.uh.ingestRemoteEvents(host, 'S', batchOf(NOV, 1))); } finally { fs.unlinkSync = realUnlink; }
    const n1 = W.notices().find((i) => /^Usage of S\b/.test(i.text)), left1 = W.heldFiles(host).length, closed = !!(n1 && n1.status === 'done');
    const L2 = W.life(); await quiet(() => L2.wired.reconcile()); // the restart: the month out of shape again (the seams), no new event yet
    const n2 = W.notices().find((i) => /^Usage of S\b/.test(i.text)), p2 = pausedOf(L2.uh, host), left2 = W.heldFiles(host).length;
    const fresh = Array.from({ length: 8 }, (_, k) => 9360 + k);
    await quiet(() => L2.uh.ingestRemoteEvents(host, 'S', lines(fresh.slice(0, 4))));
    await quiet(() => L2.uh.ingestRemoteEvents(host, 'S', lines(fresh.slice(4))));
    const s3 = sum(L2.uh, host), n3 = W.notices().find((i) => /^Usage of S\b/.test(i.text)), n3Said = n3 ? Number((/the (\d+) oldest held events/.exec(n3.detail) || [])[1] || 0) : 0;
    L2.uh.shapeMaxBytes = 2 * GiB;
    await quiet(() => L2.uh.ingestRemoteEvents(host, 'S', batchOf(NOV + 1, 1)));
    const got = ledgerOf(W, host), rec = fresh.filter((i) => got.filter((r) => r === hidOf(i, host)).length === 1).length;
    ok(closed && left1 > 0 && !p2 && n2 && n2.status === 'done' && left2 === 0 && s3.held === 8 && !s3.dropped && n3Said === 0 && rec === 8,
      `⑰ a drained generation whose ${left1} file(s) could not be unlinked (EBUSY) — its notice closed — then a restart BEFORE the next hold: nothing paused, the notice stays ${n2 && n2.status} (no «12 held … 36 dropped» reopened), the files unlinked unread (${left2} left); 8 new events: ${s3.held} held + ${s3.dropped || 0} dropped, ${rec}/8 recorded (4f42eaa3: read back as the LIVE hold — the closed notice reopened, then «44 dropped» for 36 missing)`, { closed, left1, p2: p2 && [p2.held, p2.dropped], n2: n2 && n2.status, left2, s3, n3Said, rec });
  }
  // ── 5 (e5). A LISTING THAT FAILS (EIO) IS NO EMPTY DISK ──
  {
    const W = world('w17g'), L1 = W.life(), host = 'host-l', sent = Array.from({ length: 32 }, (_, k) => 9200 + k);
    for (let k = 0; k < 8; k++) await quiet(() => L1.uh.ingestRemoteEvents(host, 'L', lines(sent.slice(4 * k, 4 * k + 4))));
    const s0 = sum(L1.uh, host);
    fs.readdirSync = function (p, ...a) { if (String(p) === W.heldDir) throw fail('EIO'); return realReaddir.call(this, p, ...a); };
    let L2, r1;
    try { L2 = W.life(); L2.uh.holdListRetryMs = 20; await quiet(() => L2.wired.reconcile()); [r1] = await quiet(() => L2.uh.ingestRemoteEvents(host, 'L', lines([9240, 9241, 9242]))); } finally { fs.readdirSync = realReaddir; }
    const m1 = sum(L2.uh, host);
    await sleep(80); await settle(); // r8: the listing's own retry (≥ 20 ms here) reads the hold back
    const [r2] = await quiet(() => L2.uh.ingestRemoteEvents(host, 'L', lines([9240, 9241, 9242])));
    const s2 = sum(L2.uh, host);
    ok(s0.t === 32 && r1 && !ack(r1) && r1.holdFailed && r1.holdFailed[0].error === 'EIO' && ack(r2) && s2.t === 35 && s2.dropped === s0.dropped,
      `⑰ (e5) the hold's listing fails (EIO) after a restart: the batch unacked, holdFailed ${r1 && r1.holdFailed ? r1.holdFailed[0].error : '—'} (memory ${m1.t || 0}); the listing back ⇒ the hold read back and the batch held: ${s2.held} + ${s2.dropped} = ${s2.t} for 35 sent (4f42eaa3: acked, a hold minted gen 0 on top of the live files — 3 + 0 against a truth of ${s0.held} + ${s0.dropped} + 3)`, { s0, r1: r1 && { ack: r1.ack, holdFailed: r1.holdFailed, held: r1.held }, m1, s2 });
  }
  // ── 5 (e3, a3, g). The numbers' span refused LOUDLY; a compaction's .tmp swept; the compaction bound is 4× the SET ──
  {
    const W = world('w17h'), L1 = W.life(), host = 'host-e';
    for (let k = 0; k < 2; k++) await quiet(() => L1.uh.ingestRemoteEvents(host, 'E', lines([9100 + 4 * k, 9101 + 4 * k, 9102 + 4 * k, 9103 + 4 * k])));
    const h = [...L1.uh._holds.values()].find((x) => x.host === host);
    const span = 1e6, gen = h && Number.isFinite(h.gen) ? h.gen : 0;
    if (h) h.nextSeq = (gen + 1) * span - 1; // the generation's last number next
    const [ra] = await quiet(() => L1.uh.ingestRemoteEvents(host, 'E', lines([9110, 9111, 9112, 9113])));
    const [rb, saidB] = await quiet(() => L1.uh.ingestRemoteEvents(host, 'E', lines([9114, 9115, 9116, 9117])));
    const segs = W.heldFiles(host).filter((f) => f.endsWith('.ndjson')).map((f) => Number(f.split('.')[1]));
    ok(ack(ra) && rb && !ack(rb) && rb.holdFailed && rb.holdFailed[0].error === 'hold-seq-bound' && saidB.some((l) => /refused \(hold-seq-bound\)/.test(l)) && segs.every((q) => Math.floor(q / span) === gen),
      `⑰ (e3) a rotation past the generation's ${span} numbers is REFUSED, loudly (${rb && rb.holdFailed ? rb.holdFailed[0].error : 'acked'}; the log names it) — never a segment numbered as the next generation's (${segs.join(', ')})`, { ra: ra && ra.ack, rb: rb && { ack: rb.ack, holdFailed: rb.holdFailed }, segs });
    // a3: a compaction killed between its write and its rename left a .tmp — the next listing sweeps it
    const W2 = world('w17i'), M1 = W2.life(), h2 = 'host-k';
    for (let k = 0; k < 5; k++) await quiet(() => M1.uh.ingestRemoteEvents(h2, 'K', lines([9000 + 4 * k, 9001 + 4 * k, 9002 + 4 * k, 9003 + 4 * k])));
    const set = W2.heldFiles(h2).find((f) => f.endsWith('.dropped'));
    if (set) fs.writeFileSync(path.join(W2.heldDir, set + '.tmp'), '{"gone":["half');
    // g/z2: the set file 30× its set (gone/back churn) — a read-back must judge the compaction by the SET, not the file
    if (set) fs.appendFileSync(path.join(W2.heldDir, set), '{"gone":["h:host-k:req_x"]}\n{"back":["h:host-k:req_x"]}\n'.repeat(2000));
    const big = set ? size(path.join(W2.heldDir, set)) : 0;
    const M2 = W2.life(); await quiet(() => M2.wired.reconcile());
    const tmpLeft = W2.heldFiles(h2).some((f) => f.endsWith('.tmp'));
    await quiet(() => M2.uh.ingestRemoteEvents(h2, 'K', lines([9020, 9021, 9022, 9023])));
    const after = set ? size(path.join(W2.heldDir, set)) : 0, k2 = sum(M2.uh, h2);
    ok(set && !tmpLeft && big > 100 * KiB && after > 0 && after < 4 * KiB && k2.dropped === 12,
      `⑰ (a3) a compaction's .tmp left by a kill is swept at the listing (${tmpLeft ? 'still there' : 'gone'}); (g) a set file ${big} B for a set of 8 rids is compacted at the next append (${after} B; ${k2.dropped} dropped) — the bound is 4× the SET read back (4f42eaa3: 4× the file — kept)`, { set, tmpLeft, big, after, k2 });
  }
});

console.log('⑱ F4 THE MOVING-LIST LAW — A TWIN\'S TAG IS STICKY WHILE ITS ITEM IS OPEN (round 7)');
await leg('⑱', async () => {
  const NOV = 800000;
  const seams = (uh) => { uh.shapeMaxBytes = 64 * KiB; uh.holdMaxBytes = 4 * KiB; uh.holdSegBytes = 1 * KiB; uh.dedupShard = (f) => { const p = new Promise(() => { }); uh._dedupJobs.set(f, p); return p; }; return uh; };
  const d = dirOf('w18'), sh = shardOf(d);
  fs.writeFileSync(sh, Array.from({ length: 400 }, (_, i) => row(i)).join('\n') + '\n');
  const todos = new UserTodoManager({ dataDir: d, expirySweepMs: 0 });
  const uh = seams(newUh(d)); LSN.wire({ usageHistory: uh, userTodos: todos, log: () => { }, reconcileAfterMs: null });
  const A = 'host-1a2b3c4d', B = 'host-dial-M', C = 'host-9f8e7d6c'; // three machines named «M»
  const ITEM = (host) => todos._state.items.find((i) => i.sessionKey === 'usage-ledger' && i.i18n && i.i18n.text && i.i18n.text.params.host === host) || null;
  const label = (host) => { const it = ITEM(host); if (!it) return '—'; if (it.status !== 'open') return '(closed)'; const m = /^Usage of (.+?) for 2026-10/.exec(it.text); return m ? m[1] : it.text.slice(0, 30); };
  let next = 9000;
  const oct = async (host, n = 1) => await quiet(() => uh.ingestRemoteEvents(host, 'M', batchOf((next += 10), n)));
  const resume = async (host) => { uh.shapeMaxBytes = 2 * GiB; await quiet(() => uh.ingestRemoteEvents(host, 'M', batchOf(NOV + (next += 10), 1))); uh.shapeMaxBytes = 64 * KiB; };
  const rows = [];
  const step = (n, what) => rows.push([n, what, label(A), label(B), label(C)]);
  await oct(A); step(1, 'A alone');
  await oct(B, 2); step(2, 'B appears');
  await resume(A); step(3, 'A resumes');
  await oct(B, 3); step(4, 'B re-words (held 2 → 5)');
  await oct(A); step(5, 'A pauses again');
  await oct(C); step(6, 'a third machine C');
  await resume(A); await resume(C); await oct(B); step(7, 'A and C resume, B re-words');
  const want = [
    [1, 'M', '—', '—'], [2, 'M (1a2b3c4d)', 'M (dial-M)', '—'], [3, '(closed)', 'M (dial-M)', '—'], [4, '(closed)', 'M (dial-M)', '—'],
    [5, 'M (1a2b3c4d)', 'M (dial-M)', '—'], [6, 'M (1a2b3c4d)', 'M (dial-M)', 'M (9f8e7d6c)'], [7, '(closed)', 'M (dial-M)', '(closed)'],
  ];
  console.log('    step | what                        | A               | B            | C');
  for (const r of rows) console.log(`    ${r[0]}    | ${String(r[1]).padEnd(27)} | ${String(r[2]).padEnd(15)} | ${String(r[3]).padEnd(12)} | ${r[4]}`);
  const bad = rows.filter((r, i) => r[2] !== want[i][1] || r[3] !== want[i][2] || r[4] !== want[i][3]).map((r) => r[0]);
  const ids = [A, B, C].map((x) => ITEM(x) && ITEM(x).id);
  ok(!bad.length && new Set(ids).size === 3, `⑱ the moving-list law over the 7 steps: a tag, once given to an open item, stays until that item closes; a twin tags the new item and the open ones once; a close relabels nobody; a re-word keeps it — every step as the table wants${bad.length ? ` — steps ${bad.join(', ')} differ` : ''} (4f42eaa3: B's tag dropped at steps 4 and 7 — re-derived from the open twins at each filing)`, { bad, rows });
});

console.log('⑲ F4 A RECORD OUTLIVES ITS FILES · DEDUP ≠ THE DRAIN CURSOR · A COUNT IS ALWAYS SAID · THE LISTING FAILURE IS A STATE · THE LOOP LAW (round 8)');
await leg('⑲', async () => {
  const NOV = 800000;
  const seams = (uh) => { uh.shapeMaxBytes = 64 * KiB; uh.holdMaxBytes = 4 * KiB; uh.holdSegBytes = 1 * KiB; uh.dedupShard = (f) => { const p = new Promise(() => { }); uh._dedupJobs.set(f, p); return p; }; return uh; };
  const world = (name) => {
    const d = dirOf(name), sh = shardOf(d);
    fs.writeFileSync(sh, Array.from({ length: 400 }, (_, i) => row(i)).join('\n') + '\n');
    let todos = new UserTodoManager({ dataDir: d, expirySweepMs: 0 });
    const W = { d, sh, heldDir: path.join(d, 'usage-history', '_held') };
    W.todos = () => todos;
    W.notices = () => todos._state.items.filter((i) => i.sessionKey === 'usage-ledger');
    W.life = () => { const uh = seams(newUh(d)); const wired = LSN.wire({ usageHistory: uh, userTodos: todos, log: () => { }, reconcileAfterMs: null }); return { uh, wired }; };
    // a restart whose notice store is read back from DISK (its 500 ms debounce: what was not flushed is lost)
    W.reboot = () => { if (todos._writeTimer) { clearTimeout(todos._writeTimer); todos._writeTimer = null; } todos = new UserTodoManager({ dataDir: d, expirySweepMs: 0 }); };
    W.heldFiles = (host) => (fs.existsSync(W.heldDir) ? realReaddir(W.heldDir).filter((f) => f.includes(`~${host}.`)).sort() : []);
    return W;
  };
  const pausedOf = (uh, host) => uh.ingestPaused().find((p) => p.host === host && p.shard === SHARD) || null;
  const sum = (uh, host) => { const p = pausedOf(uh, host) || {}; return { held: p.held, dropped: p.dropped }; };
  const lines = (ids) => ids.map((i) => remote(i)).join('\n') + '\n';
  const ledgerOf = (W, host) => ridsOf(W.sh).filter((r) => r.startsWith(`h:${host}:`));
  const said = (W, host) => { const n = W.notices().find((i) => i.i18n && i.i18n.text && i.i18n.text.params && i.i18n.text.params.host === host); return n ? { status: n.status, dropped: Number((/the (\d+) oldest held events|: (\d+) held events were dropped/.exec(n.detail) || [])[1] || (/: (\d+) held events were dropped/.exec(n.text) || [])[1] || 0) } : null; };
  const fail = (code) => Object.assign(new Error(`${code}: injected`), { code });
  const realUnlink = fs.unlinkSync, realAppend = fs.appendFileSync, realReaddir = fs.readdirSync.bind(fs), realTrunc = fs.truncateSync, realStat = fs.statSync;
  const busy = (pick) => { fs.unlinkSync = function (f, ...a) { if (String(f).includes(`${path.sep}_held${path.sep}`) && pick(String(f))) throw fail('EBUSY'); return realUnlink.call(this, f, ...a); }; return () => { fs.unlinkSync = realUnlink; }; };
  const segFile = (f) => f.endsWith('.ndjson');
  const ack = (r) => !!(r && r.ack);
  const hold48 = async (W, L, host, name, base = 9300) => { const ids = Array.from({ length: 48 }, (_, k) => base + k); for (let k = 0; k < 12; k++) await quiet(() => L.uh.ingestRemoteEvents(host, name, lines(ids.slice(4 * k, 4 * k + 4)))); return ids; };

  // ── 1. A RECORD OUTLIVES EVERY FILE IT DESCRIBES: the drain's segment unlinks refused (EBUSY), then at restart 1 still
  // refused while the set's unlink works; restart 2 — the reviewers' probe (.rev-skeptic/probe-retired.mjs, .rev-ldl7/probe1)
  for (const path2 of ['boot', 'create']) {
    const W = world('w19a-' + path2), host = 'host-s', L1 = W.life();
    await hold48(W, L1, host, 'S');
    L1.uh.shapeMaxBytes = 2 * GiB;
    let undo = busy(() => true); try { await quiet(() => L1.uh.ingestRemoteEvents(host, 'S', batchOf(NOV, 1))); } finally { undo(); }
    const f0 = W.heldFiles(host), n0 = said(W, host);
    undo = busy(segFile);
    let L2; try { L2 = W.life(); if (path2 === 'boot') await quiet(() => L2.wired.reconcile()); else await quiet(() => L2.uh.ingestRemoteEvents(host, 'S', lines([9360, 9361]))); } finally { undo(); }
    const f1 = W.heldFiles(host), setKept = f1.some((f) => /\.0\.dropped$/.test(f)) || !f1.some((f) => /\.\d{1,5}\.ndjson$/.test(f));
    const L3 = W.life(); await quiet(() => L3.wired.reconcile());
    const p3 = pausedOf(L3.uh, host), n3 = said(W, host), f3 = W.heldFiles(host).filter((f) => /\.\d{1,5}\.ndjson$/.test(f)); // gen 0's segments
    // then the month out of shape + 4 new events: none of the 12 recorded ones counted «dropped»
    await quiet(() => L3.uh.ingestRemoteEvents(host, 'S', lines([9400, 9401, 9402, 9403])));
    const s4 = sum(L3.uh, host);
    const good = path2 === 'boot' ? !p3 && n3 && n3.status === 'done' && !f3.length && s4.held === 4 && s4.dropped === 0 : setKept && !f3.length && s4.dropped === 0;
    ok(n0 && n0.status === 'done' && f0.length === 4 && good,
      `⑲ (1, ${path2}) a retired generation whose segment unlinks keep failing across restart 1 (the set's unlink works): its record kept while a file of it is left (restart 1: ${f1.length} file(s), the set ${setKept ? 'kept' : 'GONE'}); restart 2 ${p3 ? `paused ${p3.held} + ${p3.dropped}` : 'nothing paused'}, the notice ${n3 ? n3.status : '—'}, ${f3.length} drained segment(s) left; 4 new events ⇒ ${s4.held} held + ${s4.dropped} dropped (9a0d429d: the set unlinked at restart 1 — restart 2 read 12 recorded rows back as LIVE, the closed notice reopened)`,
      { f0, f1, p3: p3 && [p3.held, p3.dropped], n3, f3, s4 });
  }

  // ── 2. DEDUP AND THE DRAIN CURSOR ARE TWO THINGS: mid-drain (the oldest segment's 4 rows in the ledger, the hold still
  // draining) the device re-sends its window — the 12 rows it had sent last, 4 of them recorded — then new events
  for (const fresh of [4, 12]) {
    const W = world('w19b-' + fresh), L1 = W.life(), uh = L1.uh, host = 'host-q', sent = await hold48(W, L1, host, 'Q', 9800);
    const s0 = sum(uh, host);
    await quiet(() => uh._ingestIndex(W.sh));
    uh.shapeMaxBytes = 2 * GiB; uh.ingestIndexInlineBytes = 2048; // back in shape; the hold drains in steps
    await quietRaw(() => uh.ingestRemoteEvents(host, 'Q', batchOf(NOV, 1)));
    const h = [...uh._holds.values()].find((x) => x.host === host);
    let window = false;
    for (let i = 0; i < 4000 && h && h.draining; i++) { if (ledgerOf(W, host).length === 4) { window = true; break; } await tick(); }
    const [rA] = await quietRaw(() => uh.ingestRemoteEvents(host, 'Q', lines(sent.slice(36, 48))));
    const nw = Array.from({ length: fresh }, (_, k) => 9900 + k);
    for (let k = 0; k < fresh; k += 4) await quietRaw(() => uh.ingestRemoteEvents(host, 'Q', lines(nw.slice(k, k + 4))));
    for (let i = 0; i < 4000 && h && h.draining; i++) await quietRaw(() => tick());
    await quiet(() => null);
    const got = ledgerOf(W, host), all = [...sent.slice(36), ...nw], rec = all.filter((i) => got.includes(hidOf(i, host))).length;
    const missing = sent.length + nw.length - sent.concat(nw).filter((i) => got.includes(hidOf(i, host))).length, n = said(W, host);
    ok(window && s0.held === 12 && s0.dropped === 36 && rA && rA.duplicates === 12 && (fresh > 4 || rec === all.length) && n && n.status === 'done' && n.dropped === missing,
      `⑲ (2, +${fresh} new) a re-send MID-DRAIN of 12 held rows (4 already drained): ${rA ? rA.duplicates : '—'} duplicates (none held twice); ${rec} of ${all.length} recorded (the last-held + the new); the closed notice says ${n ? n.dropped : '—'} dropped for ${missing} missing (9a0d429d: a drained rid left the duplicate check — 4 held again, an undrained acked segment pushed out: 12 of 16 recorded with 4 new; 48 said for 44 missing with 12 new)`,
      { window, rA: rA && { dup: rA.duplicates, held: rA.held }, rec, missing, n });
  }

  // ── 3. A DROPPED COUNT IS ALWAYS SAID: one batch over the bound (15 held + 33 dropped); d1 the drain's unlinks refused and
  // a restart before the notice store's debounce flushed; d1c the store flushed while open, a restart out of shape; d2 a
  // restart in shape with no notice on disk — the reviewers' probe (.rev-ordr/p/d.mjs)
  for (const v of ['d1', 'd1c', 'd2']) {
    const W = world('w19c-' + v), host = 'host-x', L1 = W.life(), ids = Array.from({ length: 48 }, (_, k) => 9300 + k);
    await quiet(() => L1.uh.ingestRemoteEvents(host, 'X', lines(ids)));
    const s0 = sum(L1.uh, host);
    if (v === 'd1c') W.todos().flush();
    if (v !== 'd2') { L1.uh.shapeMaxBytes = 2 * GiB; const undo = busy(segFile); try { await quiet(() => L1.uh.ingestRemoteEvents(host, 'X', batchOf(NOV, 1))); } finally { undo(); } }
    W.reboot();
    const L2 = W.life(); if (v === 'd2') L2.uh.shapeMaxBytes = 2 * GiB;
    await quiet(() => L2.wired.reconcile());
    if (v !== 'd2') { L2.uh.shapeMaxBytes = 2 * GiB; await quiet(() => L2.uh.ingestRemoteEvents(host, 'X', batchOf(NOV + 1, 1))); }
    const n = said(W, host), rec = ids.filter((i) => ledgerOf(W, host).includes(hidOf(i, host))).length;
    ok(s0.held === 15 && s0.dropped === 33 && n && n.dropped === 33 && rec === 15,
      `⑲ (3, ${v}) 15 held + 33 dropped, ${v === 'd1' ? 'drained (its unlinks refused), a restart before the store flushed' : v === 'd1c' ? 'the store flushed while open, drained, a restart out of shape' : 'a restart in shape, no notice on disk'}: ${n ? `the notice (${n.status}) says ${n.dropped}` : 'NO notice'} for ${48 - rec} missing (9a0d429d: ${v === 'd1' ? 'retired with 0 notices on disk — never said' : v === 'd1c' ? 're-worded «0 held» without its «Past the bound» line, closed without it' : 'the 33 only in a log line'})`,
      { s0, n, rec });
  }

  // ── 4. THE LISTING FAILURE IS A STATE WITH A BACKOFF: 100 ingests under EIO after a restart — the reviewers' probe
  // (.rev-ordr/p/e.mjs), every batch an October row (the paused month) + a November one (in shape)
  {
    const W = world('w19d'), host = 'host-l', L1 = W.life();
    for (let k = 0; k < 5; k++) await quiet(() => L1.uh.ingestRemoteEvents(host, 'L', lines([9200 + 4 * k, 9201 + 4 * k, 9202 + 4 * k, 9203 + 4 * k])));
    let readdirs = 0;
    fs.readdirSync = function (p, ...a) { if (String(p) === W.heldDir) { readdirs++; throw fail('EIO'); } return realReaddir(p, ...a); };
    const out = [];
    let L2, warn = 0, after = null;
    try {
      L2 = W.life();
      const [, s1] = await quiet(() => L2.wired.reconcile()); warn += s1.filter((l) => /could not be listed/.test(l)).length;
      for (let i = 0; i < 100; i++) { const [r, s] = await quiet(() => L2.uh.ingestRemoteEvents(host, 'L', lines([9300 + i, NOV + i]))); out.push(r); warn += s.filter((l) => /could not be listed/.test(l)).length; }
    } finally { fs.readdirSync = realReaddir; }
    const listNotices = W.notices().filter((i) => i.itemKey === 'hold-list'), last = out[out.length - 1] || {}, listOpen = listNotices.map((i) => i.status).join();
    const novIn = out.reduce((a, r) => a + ((r && r.appended) || 0), 0);
    L2.uh.holdListRetryMs = 10; if (L2.uh._listFail && L2.uh._listFail.timer) { clearTimeout(L2.uh._listFail.timer); L2.uh._listHeld().catch(() => { }); }
    await sleep(30); await settle();
    after = W.notices().filter((i) => i.itemKey === 'hold-list');
    ok(readdirs <= 2 && warn === 1 && listOpen === 'open' && !ack(last) && last.holdFailed && last.holdFailed.length === 1 && last.holdFailed[0].month === '2026-10' && last.retryAfter > 0 && novIn === 100 && after.length === 1 && after[0].status === 'done',
      `⑲ (4) 100 ingests under EIO: ${readdirs} readdir(s) of _held, ${warn} warn line(s), ${listNotices.length} notice(s) «${listNotices[0] ? listNotices[0].text.slice(0, 48) : '—'}»; each batch unacked for October only (holdFailed ${(last.holdFailed || []).map((f) => f.month).join(',')}), retryAfter ${last.retryAfter} s; the in-shape November recorded (${novIn} of 100); the listing back ⇒ the notice closed (${after[0] ? after[0].status : '—'}) (9a0d429d: a readdir and a warn line per month per batch — 202 and 201 for these 100 — no notice, no retryAfter, November refused with October)`,
      { readdirs, warn, listNotices: listNotices.length, last: { ack: last.ack, holdFailed: last.holdFailed, retryAfter: last.retryAfter }, novIn, after: after.map((i) => i.status) });
  }

  // ── 5. A `retired` LINE IN A LIVE GENERATION IS NO RECORD OF OURS (bug injection — .rev-ordr/p/c.mjs c4) ──
  {
    const W = world('w19e'), host = 'host-r', L1 = W.life(), ids = Array.from({ length: 20 }, (_, k) => 9500 + k);
    for (let k = 0; k < 5; k++) await quiet(() => L1.uh.ingestRemoteEvents(host, 'R', lines(ids.slice(4 * k, 4 * k + 4))));
    const s0 = sum(L1.uh, host), set = W.heldFiles(host).find((f) => f.endsWith('.dropped'));
    realAppend(path.join(W.heldDir, set), JSON.stringify({ retired: 0 }) + '\n');
    const L2 = W.life(); const [, sl] = await quiet(() => L2.wired.reconcile());
    const s2 = sum(L2.uh, host);
    L2.uh.shapeMaxBytes = 2 * GiB; await quiet(() => L2.uh.ingestRemoteEvents(host, 'R', batchOf(NOV, 1)));
    const rec = ids.filter((i) => ledgerOf(W, host).includes(hidOf(i, host))).length;
    ok(s0.held === 12 && s0.dropped === 8 && s2.held === 12 && s2.dropped === 8 && rec === 12 && sl.some((l) => /says «retired» while/.test(l)),
      `⑲ (5) an injected «retired» line in a LIVE generation (12 held + 8 dropped): read back ${s2.held} + ${s2.dropped}, the line named in a log line and ignored; back in shape ⇒ ${rec} of 12 recorded (9a0d429d: honoured — 12 + 8 deleted silently, «0 events held», 0/20 recorded)`, { s2, rec });
  }

  // ── 6 (f). THE DRAIN CURSOR IS PERSISTED: the oldest segment read into the ledger, then the process dies (no turn after);
  // a restart finds the month out of shape again; 8 new events push a segment out (.rev-ordr/p/f.mjs, its window both
  // trees have: the oldest segment's 4 rows in the ledger, the hold still draining)
  {
    const W = world('w19f'), L1 = W.life(), uh = L1.uh, host = 'host-q', sent = Array.from({ length: 12 }, (_, k) => 9800 + k);
    for (let k = 0; k < 3; k++) await quiet(() => uh.ingestRemoteEvents(host, 'Q', lines(sent.slice(4 * k, 4 * k + 4))));
    await quiet(() => uh._ingestIndex(W.sh));
    uh.shapeMaxBytes = 2 * GiB; uh.ingestIndexInlineBytes = 2048;
    await quietRaw(() => uh.ingestRemoteEvents(host, 'Q', batchOf(NOV, 1)));
    const h = [...uh._holds.values()].find((x) => x.host === host);
    let window = false;
    for (let i = 0; i < 4000 && h && h.draining; i++) { if (ledgerOf(W, host).length === 4) { window = true; break; } await tick(); }
    // the process dies here: nothing of it runs on (its hold's road stopped: every later job of it refused)
    if (h) { h.io = new Promise(() => { }); uh._holds.clear(); }
    ALL_UH.splice(ALL_UH.indexOf(uh), 1); if (uh._inflight) uh._inflight.clear(); // a dead process is never waited for
    const L2 = W.life(); await quiet(() => L2.wired.reconcile());
    const fresh = Array.from({ length: 8 }, (_, k) => 9900 + k);
    await quiet(() => L2.uh.ingestRemoteEvents(host, 'Q', lines(fresh.slice(0, 4))));
    await quiet(() => L2.uh.ingestRemoteEvents(host, 'Q', lines(fresh.slice(4))));
    L2.uh.shapeMaxBytes = 2 * GiB; await quiet(() => L2.uh.ingestRemoteEvents(host, 'Q', batchOf(NOV + 1, 1)));
    const all = [...sent, ...fresh], got = ledgerOf(W, host), missing = all.filter((i) => !got.includes(hidOf(i, host))).length, n = said(W, host);
    ok(window && n && n.dropped === missing,
      `⑲ (6, f) a crash after the oldest segment was read into the ledger: restart out of shape + 8 new events ⇒ the notice says ${n ? n.dropped : '—'} dropped for ${missing} missing (9a0d429d: 8 for 4 — the drained segment read back as held, its 4 recorded rows dropped «never recorded»)`, { window, n, missing });
  }

  // ── 7 (g). A ROW THE LEDGER HAS IS NEVER HELD — the month's index consulted when it is in memory; the count a hold ends
  // with filtered against the index the drain loads (.rev-ordr/p/g.mjs: 8 recorded rows re-sent, then 12 new, 4 KiB) ──
  for (const restart of [false, true]) {
    const W = world('w19g-' + restart), L1 = W.life(), host = 'host-g', early = Array.from({ length: 8 }, (_, k) => 9000 + k);
    L1.uh.shapeMaxBytes = 2 * GiB;
    await quiet(() => L1.uh.ingestRemoteEvents(host, 'G', lines(early)));
    let L = L1; if (restart) L = W.life(); else L.uh.shapeMaxBytes = 64 * KiB;
    const win = [...early, ...Array.from({ length: 12 }, (_, k) => 9100 + k)];
    for (let k = 0; k < 5; k++) await quiet(() => L.uh.ingestRemoteEvents(host, 'G', lines(win.slice(4 * k, 4 * k + 4))));
    const sp = sum(L.uh, host), open = said(W, host), maybe = !!W.notices().find((i) => /some of them may already be recorded/.test(i.detail));
    L.uh.shapeMaxBytes = 2 * GiB; await quiet(() => L.uh.ingestRemoteEvents(host, 'G', batchOf(NOV, 1)));
    const rec = win.filter((i) => ledgerOf(W, host).includes(hidOf(i, host))).length, n = said(W, host);
    ok(rec === 20 && n && n.status === 'done' && n.dropped === 0 && (restart ? maybe && sp.dropped === 8 : sp.dropped === 0),
      `⑲ (7, g${restart ? ', after a restart' : ''}) 8 recorded rows re-sent + 12 new: paused ${sp.held} + ${sp.dropped}${restart ? ` (the index not in memory: the open notice says «${maybe ? 'some of them may already be recorded' : 'never recorded'}»)` : ' (the index in memory: the 8 are duplicates, never held)'}; 20 of 20 recorded and the closed notice says ${n ? n.dropped : '—'} dropped (9a0d429d: «8 dropped» for 0 missing)`, { sp, open, n, rec });
  }

  // ── 8. AN UNVERIFIED CUT SEALS ITS SEGMENT (.rev-ldl7/probe4.mjs): A acked, B torn with the truncate and the stat refused, C
  // acked, D torn (its cut works), E acked ⇒ every acked row recorded ──
  {
    const W = world('w19h'), L1 = W.life(), uh = L1.uh, host = 'host-c';
    uh.holdMaxBytes = 64 * KiB; uh.holdSegBytes = 32 * KiB;
    const isSeg = (f) => String(f).includes(`~${host}.`) && String(f).endsWith('.ndjson');
    const tear = () => { fs.appendFileSync = function (f, data, ...a) { if (isSeg(f)) { const b = Buffer.from(String(data)); realAppend.call(this, f, b.subarray(0, b.length >> 1), ...a); throw fail('ENOSPC'); } return realAppend.call(this, f, data, ...a); }; };
    const restore = () => { fs.appendFileSync = realAppend; fs.truncateSync = realTrunc; fs.statSync = realStat; };
    const acked = [];
    const send = async (ids) => { const [r] = await quiet(() => uh.ingestRemoteEvents(host, 'C', lines(ids))); if (ack(r)) acked.push(...ids); return r; };
    await send([1, 2, 3, 4].map((x) => 9000 + x));
    tear(); fs.truncateSync = function (f, ...a) { if (isSeg(f)) throw fail('EIO'); return realTrunc.call(this, f, ...a); }; fs.statSync = function (f, ...a) { if (isSeg(f)) throw fail('EIO'); return realStat.call(this, f, ...a); };
    try { await send([5, 6, 7, 8].map((x) => 9000 + x)); } finally { restore(); }
    await send([9, 10, 11, 12].map((x) => 9000 + x));
    tear(); try { await send([13, 14, 15, 16].map((x) => 9000 + x)); } finally { restore(); }
    await send([17, 18].map((x) => 9000 + x));
    uh.shapeMaxBytes = 2 * GiB; await quiet(() => uh.ingestRemoteEvents(host, 'C', batchOf(NOV, 1)));
    const got = ledgerOf(W, host), lost = acked.filter((i) => !got.includes(hidOf(i, host)));
    ok(acked.length === 10 && !lost.length, `⑲ (8) a cut whose truncate AND stat failed (−1) seals its segment: ${acked.length - lost.length} of ${acked.length} acked rows recorded${lost.length ? `, LOST ${lost.join(',')}` : ''} (9a0d429d: 8 of 10 — a later cut back truncated rows an append between had landed and acked)`, { acked, lost });
  }

  // ── 9. A PAUSE WITH NO HOLD RESUMES at the first ingest that records its month (.rev-ldl7/probe3.mjs — the listing failed
  // at the boot, then works; .rev-rf7p/probe5.mjs — the hold write refused, then the bound raised, the same life) ──
  for (const v of ['boot-eio', 'same-life']) {
    const W = world('w19i-' + v), host = 'host-x', L1 = W.life();
    fs.appendFileSync = function (f, ...a) { if (String(f).includes(`${path.sep}_held${path.sep}`)) throw fail('ENOSPC'); return realAppend.call(this, f, ...a); };
    let r1; try { [r1] = await quiet(() => L1.uh.ingestRemoteEvents(host, 'X', lines([9000, 9001]))); } finally { fs.appendFileSync = realAppend; }
    let L = L1;
    if (v === 'boot-eio') {
      fs.mkdirSync(W.heldDir, { recursive: true });
      fs.readdirSync = function (p, ...a) { if (String(p) === W.heldDir) throw fail('EIO'); return realReaddir(p, ...a); };
      try { L = W.life(); L.uh.holdListRetryMs = 10; L.uh.shapeMaxBytes = 2 * GiB; await quiet(() => L.wired.reconcile()); } finally { fs.readdirSync = realReaddir; }
      await sleep(40); await settle();
    } else L.uh.shapeMaxBytes = 2 * GiB;
    for (let k = 0; k < 5; k++) await quiet(() => L.uh.ingestRemoteEvents(host, 'X', lines([9002 + 2 * k, 9003 + 2 * k])));
    const p = pausedOf(L.uh, host), n = W.notices().find((i) => i.i18n && i.i18n.text.params.host === host), rows = ledgerOf(W, host).length;
    ok(r1 && !ack(r1) && !p && n && n.status === 'done' && rows >= 10,
      `⑲ (9, ${v}) a pause that holds nothing (its hold write refused${v === 'boot-eio' ? ', then a boot whose listing failed once' : ', then the bound raised'}), its month in shape and taking rows: ${p ? `still paused (${p.drain ? p.drain.state : p.why})` : 'resumed'}, its notice ${n ? n.status : '—'}, ${rows} rows recorded (9a0d429d: ${v === 'boot-eio' ? 'paused «pending» and its notice open for the rest of the month' : 'paused for its size, the notice open — the base too'})`,
      { p: p && [p.why, p.drain], n: n && n.status, rows });
  }

  // ── 10. A TAG STORED IN THE LABEL (the reviewers' literal fixture, .rev-int7/p/probe-tag.mjs S3: an item 4f42eaa3's relabel
  // left — «M (1a2b3c4d)», its tag, no `name`) reads as its bare name: a twin of that name is told apart; a restart's
  // reconcile never doubles it ──
  {
    const W = world('w19j'), A = 'host-1a2b3c4d', B = 'host-dial-M';
    const L1 = W.life();
    await quiet(() => L1.uh.ingestRemoteEvents(A, 'M', batchOf(9000, 1)));
    W.todos().reshapeItems((it) => { if (!it.i18n || it.i18n.text.params.host !== A) return false; delete it.i18n.text.params.name; it.i18n.text.params.machine = 'M (1a2b3c4d)'; it.i18n.text.params.tag = '1a2b3c4d'; it.text = 'Usage of M (1a2b3c4d) for 2026-10 is held — the usage ledger file events-2026-10.ndjson is out of shape'; return true; });
    await quiet(() => L1.uh.ingestRemoteEvents(B, 'M', batchOf(9010, 1)));
    const b1 = (W.notices().find((i) => i.i18n && i.i18n.text.params.host === B) || {}).text || '';
    W.todos().flush(); W.reboot();
    const L2 = W.life(); await quiet(() => L2.wired.reconcile());
    const a = W.notices().find((i) => i.i18n && i.i18n.text.params.host === A);
    ok(/^Usage of M \(dial-M\) for/.test(b1) && a && a.status === 'open' && /^Usage of M \(1a2b3c4d\) for/.test(a.text) && !/\) \(/.test(a.text) && a.i18n.text.params.name === 'M',
      `⑲ (10) a label that carries its tag and no name reads as its bare name: the twin filed beside it «${b1.slice(0, 26)}», after the restart's reconcile «${a ? a.text.slice(0, 40) : '—'}» (9a0d429d: the twin filed untagged «M», then «M (1a2b3c4d) (1a2b3c4d)»)`, { b1, a: a && a.text });
  }

  // ── 11. THE LOOP LAW: a hold's file calls are off the main thread (its async road) — counted: every synchronous fs call
  // on `_held/` while a hold is written past its bound, compacted, read back after a restart and drained ──
  {
    const W = world('w19k'), host = 'host-z', SYNC = ['appendFileSync', 'writeFileSync', 'readFileSync', 'openSync', 'readSync', 'truncateSync', 'statSync', 'unlinkSync', 'renameSync', 'mkdirSync', 'readdirSync'];
    const real = Object.fromEntries(SYNC.map((n) => [n, fs[n]])), seen = [];
    for (const n of SYNC) { fs[n] = function (...a) { const p = String(a[0]); if (p.includes(`${path.sep}_held`)) seen.push(n); return real[n].apply(this, a); }; fs[n].__count = true; } // a counter, never a fault: the async road keeps its own calls
    let fdHeld = new Set();
    const ro = fs.openSync; fs.openSync = function (...a) { const fd = ro.apply(this, a); if (String(a[0]).includes(`${path.sep}_held`)) fdHeld.add(fd); return fd; };
    const rr = fs.readSync; fs.readSync = function (fd, ...a) { if (fdHeld.has(fd)) seen.push('readSync(fd)'); return rr.call(this, fd, ...a); };
    try {
      const L1 = W.life(); L1.uh.holdMaxBytes = 16 * KiB; L1.uh.holdSegBytes = 4 * KiB;
      const ids = Array.from({ length: 200 }, (_, k) => 9000 + k);
      for (let k = 0; k < 200; k += 20) await quiet(() => L1.uh.ingestRemoteEvents(host, 'Z', lines(ids.slice(k, k + 20))));
      const h = [...L1.uh._holds.values()].find((x) => x.host === host); if (h) h.compactAt = 0;
      await quiet(() => L1.uh.ingestRemoteEvents(host, 'Z', lines([9300])));
      const L2 = W.life(); await quiet(() => L2.wired.reconcile());
      L2.uh.shapeMaxBytes = 2 * GiB; await quiet(() => L2.uh.ingestRemoteEvents(host, 'Z', batchOf(NOV, 1)));
    } finally { for (const n of SYNC) fs[n] = real[n]; fs.openSync = ro; fs.readSync = rr; }
    const byFn = seen.reduce((m, n) => ((m[n] = (m[n] || 0) + 1), m), {});
    const onlyListing = Object.keys(byFn).every((n) => n === 'readdirSync') && (byFn.readdirSync || 0) <= 2;
    ok(onlyListing, `⑲ (11) the loop law: a hold written past its bound, compacted, read back and drained makes ${seen.length} synchronous fs call(s) on _held/ (${JSON.stringify(byFn)}) — only the one listing per process (9a0d429d: every append, the compaction's write, the read-back's reads and the unlinks on the main thread)`, byFn);
  }

  // ── 12. timedSync ARMS its name BEFORE the call: the sync fs witness's live slot names the store a hung call is made for ──
  {
    const TS = require(REPO + '/src/timed-sync.js'), WIT = opt('/src/server/sync-fs-witness.js');
    const w = WIT.create ? WIT.create({ fresh: true, live: false, armed: false, rootDir: '/nowhere', dataDir: '/nowhere/data', readMountinfo: () => '' }) : null;
    let inflight = null;
    const wasOn = typeof TS.enabled === 'function' && TS.enabled(); TS.enable(true); // the server turns it on at boot
    try { if (w) TS.timedSync('usage-shards.write', () => { w.hook.before('appendFileSync', ['/tmp/x'], null); inflight = w.inflight(); w.hook.after('appendFileSync', ['/tmp/x'], 0, Date.now(), undefined, false, null); }); } finally { TS.enable(wasOn); if (TS.reset) TS.reset(); }
    const armedNow = typeof TS.armed === 'function' ? TS.armed() : 'none';
    const words = WIT.callWords ? WIT.callWords({ fn: 'appendFileSync', path: '/d/x', store: 'usage-shards.write', ms: 12000, mount: null }) : '';
    ok(inflight && inflight.store === 'usage-shards.write' && armedNow === null && /\(usage-shards\.write\)/.test(words),
      `⑲ (12) timedSync arms its name before the call: the witness's live slot names it (${inflight ? inflight.store : '—'}), disarmed after (${armedNow}), its words «${words.slice(0, 60)}» (9a0d429d: recorded only once the call returned — a hung call never named its store)`, { inflight, armedNow });
  }

  // ── 13. THE STANDING ITEM IS NOT A DECISION ROW — its own action.type (the cards stay hub-act-ask) ──
  {
    const HA = require(REPO + '/src/server/hub-act-ask.js');
    ok(HA.STANDING_TYPE === 'hub-act-standing' && HA.ACTION_TYPE === 'hub-act-ask' && /type: STANDING_TYPE, askId: st\.askId/.test(fs.readFileSync(REPO + '/src/server/hub-act-ask.js', 'utf8')),
      `⑲ (13) a background subject's standing item files with its OWN action.type (${HA.STANDING_TYPE || 'hub-act-ask, like a card'}) — never a decision row (9a0d429d: hub-act-ask, which lane wake-approve-card's registry makes a decision row: its no-longer-asked close and the owner's reopen refused)`);
  }
});
console.log('⑳ F4 A SET FILE IS A GENERATION · A MONTH THAT NEEDS NO HOLD NEVER WAITS · THE COUNT IS THE GENERATION\'S · EVERY WAIT IS BOUNDED AND SAID (round 9)');
await leg('⑳', async () => {
  const NOV = 800000;
  const seams = (uh) => { uh.shapeMaxBytes = 64 * KiB; uh.holdMaxBytes = 4 * KiB; uh.holdSegBytes = 1 * KiB; uh.dedupShard = (f) => { const p = new Promise(() => { }); uh._dedupJobs.set(f, p); return p; }; return uh; };
  const world = (name) => {
    const d = dirOf(name), sh = shardOf(d);
    fs.writeFileSync(sh, Array.from({ length: 400 }, (_, i) => row(i)).join('\n') + '\n');
    let todos = new UserTodoManager({ dataDir: d, expirySweepMs: 0 });
    const W = { d, sh, nov: path.join(d, 'usage-history', 'events-2026-11.ndjson'), heldDir: path.join(d, 'usage-history', '_held') };
    W.todos = () => todos;
    W.notices = () => todos._state.items.filter((i) => i.sessionKey === 'usage-ledger');
    W.life = (inShape = false) => { const uh = seams(newUh(d)); if (inShape) uh.shapeMaxBytes = 2 * GiB; const wired = LSN.wire({ usageHistory: uh, userTodos: todos, log: () => { }, reconcileAfterMs: null }); return { uh, wired }; };
    W.reboot = () => { if (todos._writeTimer) { clearTimeout(todos._writeTimer); todos._writeTimer = null; } todos = new UserTodoManager({ dataDir: d, expirySweepMs: 0 }); };
    W.heldFiles = (host) => (fs.existsSync(W.heldDir) ? realReaddir(W.heldDir).filter((f) => f.includes(`~${host}.`)).sort() : []);
    return W;
  };
  const pausedOf = (uh, host) => uh.ingestPaused().find((p) => p.host === host && p.shard === SHARD) || null;
  const sum = (uh, host) => { const p = pausedOf(uh, host) || {}; return { held: p.held, dropped: p.dropped }; };
  const lines = (ids) => ids.map((i) => remote(i)).join('\n') + '\n';
  const ledgerOf = (f, host) => ridsOf(f).filter((r) => r.startsWith(`h:${host}:`));
  // the item of (host, the October file) — the «Past the bound» count its words say (the generation's), and an «Earlier» one
  const said = (W, host) => { const n = W.notices().find((i) => i.i18n && i.i18n.text && i.i18n.text.params && i.i18n.text.params.host === host && !/^(hold-read|set-aside)\n/.test(String(i.itemKey || ''))); return n ? { status: n.status, dropped: Number((/the (\d+) oldest held events|: (\d+) held events were dropped/.exec(n.detail) || [])[1] || (/: (\d+) held events were dropped/.exec(n.text) || [])[1] || 0), earlier: Number((/Earlier: (\d+) held events/.exec(n.detail) || [])[1] || 0), text: n.text } : null; };
  const fail = (code) => Object.assign(new Error(`${code}: injected`), { code });
  const realUnlink = fs.unlinkSync, realAppend = fs.appendFileSync, realReaddir = fs.readdirSync.bind(fs), realOpen = fs.promises.open, realPReaddir = fs.promises.readdir;
  const busy = (pick) => { fs.unlinkSync = function (f, ...a) { if (String(f).includes(`${path.sep}_held${path.sep}`) && pick(String(f))) throw fail('EBUSY'); return realUnlink.call(this, f, ...a); }; return () => { fs.unlinkSync = realUnlink; }; };
  const segFile = (f) => f.endsWith('.ndjson');
  const ack = (r) => !!(r && r.ack);
  /** a process that dies NOW: nothing of it runs on, it is never waited for */
  const die = (uh) => { for (const h of uh._holds.values()) h.io = new Promise(() => { }); uh._holds.clear(); const i = ALL_UH.indexOf(uh); if (i >= 0) ALL_UH.splice(i, 1); if (uh._inflight) uh._inflight.clear(); uh.onShape = null; };
  /** a file this process cannot read (EACCES — chmod 000; a root run, which reads it anyway, gets the open refused) → undo */
  const deny = (file) => {
    fs.chmodSync(file, 0); let real = true; try { fs.closeSync(fs.openSync(file, 'r')); real = false; } catch { }
    if (!real) fs.promises.open = function (f, ...a) { if (String(f) === file) return Promise.reject(Object.assign(new Error(`EACCES: permission denied, open '${file}'`), { code: 'EACCES', path: file })); return realOpen.call(this, f, ...a); };
    return () => { try { fs.chmodSync(file, 0o644); } catch { } fs.promises.open = realOpen; }; // r14: a set the disk refused is moved aside — its old path is gone
  };
  const race = (p, ms) => Promise.race([Promise.resolve(p).then((r) => ({ r })), sleep(ms).then(() => ({ timeout: true }))]);

  // ── 1. A SET FILE IS A GENERATION (no fault — .acc8 skep8-probe-oos-again): 15 held + 33 dropped; back in shape by a hair,
  // the drain's own rows push the file out again (the hold, empty, goes on with its count); the store on disk; a restart
  // still out of shape — is the 33 still said? ──
  {
    const W = world('w20a'), host = 'host-x', L1 = W.life(), ids = Array.from({ length: 48 }, (_, k) => 9300 + k);
    await quiet(() => L1.uh.ingestRemoteEvents(host, 'X', lines(ids)));
    const s0 = sum(L1.uh, host);
    L1.uh.shapeMaxBytes = fs.statSync(W.sh).size + 600;
    await quiet(() => L1.uh.ingestRemoteEvents(host, 'X', batchOf(NOV, 1)));
    const s1 = sum(L1.uh, host), n1 = said(W, host);
    W.todos().flush(); W.reboot();
    const L2 = W.life(); L2.uh.shapeMaxBytes = L1.uh.shapeMaxBytes; die(L1.uh);
    await quiet(() => L2.wired.reconcile());
    const s2 = sum(L2.uh, host), n2 = said(W, host), f2 = W.heldFiles(host);
    await quiet(() => L2.uh.ingestRemoteEvents(host, 'X', lines([9400, 9401])));
    const s3 = sum(L2.uh, host), n3 = said(W, host);
    ok(s0.held === 15 && s0.dropped === 33 && s1.held === 0 && s1.dropped === 33 && n1 && n1.dropped === 33 && n2 && n2.status === 'open' && n2.dropped === 33 && s2.dropped === 33 && f2.includes('events-2026-10~host-x.0.dropped') && s3.held === 2 && s3.dropped === 33 && n3 && n3.dropped === 33,
      `⑳ (1) a drained generation (its set alone on disk, its notice on disk saying 33) read back at a boot still out of shape: paused ${s2.held} + ${s2.dropped}, the notice ${n2 ? `${n2.status} says ${n2.dropped}` : '—'}, the set ${f2.length ? 'kept' : 'GONE'}; + 2 new ⇒ ${s3.held} + ${s3.dropped}, said ${n3 ? n3.dropped : '—'} (3c4fa614: paused 0 + 0, the notice re-worded without its count, the set unlinked — 33 rows said nowhere)`,
      { s0, s1, n1, s2, n2, f2, s3, n3 });
  }

  // ── 2. THE COUNT OUTLIVES A STORE THAT REFUSED IT (.acc8c c3 / c3r): the end's notice cannot be put on disk (the store's
  // writes refused), the process dies; a restart with the store writable — c3: d2's shape (a restart in shape, no notice
  // on disk), c3r: the 'resumed' road ──
  for (const v of ['c3', 'c3r']) {
    const W = world('w20b-' + v), host = 'host-x', L1 = W.life(), ids = Array.from({ length: 48 }, (_, k) => 9300 + k);
    await quiet(() => L1.uh.ingestRemoteEvents(host, 'X', lines(ids)));
    let L = L1;
    if (v === 'c3') { W.reboot(); die(L1.uh); L = W.life(true); } else L.uh.shapeMaxBytes = 2 * GiB;
    const T = W.todos(); let refused = 0;
    T._flush = () => { refused++; throw fail('ENOSPC'); };
    if (v === 'c3') await quiet(() => L.wired.reconcile()); else await quiet(() => L.uh.ingestRemoteEvents(host, 'X', batchOf(NOV, 1)));
    const kept = W.heldFiles(host);
    die(L.uh); W.reboot();
    const L2 = W.life(true); await quiet(() => L2.wired.reconcile());
    await quiet(() => L2.uh.ingestRemoteEvents(host, 'X', batchOf(NOV + 1, 1)));
    const n = said(W, host), rec = ids.filter((i) => ledgerOf(W.sh, host).includes(hidOf(i, host))).length, f = W.heldFiles(host);
    ok(refused > 0 && kept.some((x) => x.endsWith('.dropped')) && n && n.dropped === 33 && rec === 15 && !f.length,
      `⑳ (2, ${v}) 15 held + 33 dropped, drained with the For-you store refusing its writes (${refused}), the process dead before it could write: the set kept (${kept.join(' ') || 'nothing'}); a restart with the store writable says ${n ? `${n.dropped} (${n.status})` : 'NOTHING'} for ${48 - rec} missing, then ends the hold (${f.length} file(s) left) (3c4fa614: no notice, no file — 33 never said; \`unsaid\` written, never read)`,
      { refused, kept, n, rec, f });
  }

  // ── 3. A MONTH THAT NEEDS NO HOLD NEVER WAITS (.acc8 skep8-probe-readback-fail; .acc8c e): October's hold unreadable after a
  // restart (EACCES — a segment, then the set file), the device's window: the October row + its November rows ──
  for (const which of ['segment', 'set']) {
    const W = world('w20c-' + which), host = 'host-x', L1 = W.life();
    for (let k = 0; k < (which === 'set' ? 5 : 1); k++) await quiet(() => L1.uh.ingestRemoteEvents(host, 'X', lines([9300 + 4 * k, 9301 + 4 * k, 9302 + 4 * k, 9303 + 4 * k])));
    const target = W.heldFiles(host).find((f) => (which === 'set' ? f.endsWith('.dropped') : f.endsWith('.ndjson')));
    W.todos().flush(); W.reboot();
    const undo = deny(path.join(W.heldDir, target));
    const L2 = W.life(); L2.uh.holdListRetryMs = 60; die(L1.uh);
    const answers = []; let lines2 = 0;
    try {
      const [, s0] = await quiet(() => L2.wired.reconcile()); lines2 += s0.filter((l) => /could not be read/.test(l)).length;
      for (let k = 0; k < 6; k++) { const [r, s] = await quiet(() => L2.uh.ingestRemoteEvents(host, 'X', lines([9400, ...Array.from({ length: k + 1 }, (_, j) => NOV + j)]))); answers.push(r); lines2 += s.filter((l) => /could not be read/.test(l)).length; }
    } finally { undo(); }
    const novIn = ledgerOf(W.nov, host).length, last = answers[answers.length - 1] || {};
    const reads = W.notices().filter((i) => String(i.itemKey || '').startsWith('hold-read')), readOpen = reads.map((i) => i.status).join();
    await sleep(80); await settle(); // its own timer reads it again (the seam: 60 ms)
    const [rB] = await quiet(() => L2.uh.ingestRemoteEvents(host, 'X', lines([9400, NOV + 6])));
    const nov7 = ledgerOf(W.nov, host).length, after = W.notices().filter((i) => String(i.itemKey || '').startsWith('hold-read')).map((i) => i.status).join();
    // r14 (PINNED → PINS NOW for the set): THE ERROR'S CLASS DECIDES, NEVER THE FILE'S AGE — EACCES on a LIVE set is «the disk
    // will not read this file», set aside unread as an older one's is (a1d92418 retried the live one on its timer, every
    // October batch unacked, and set the older one aside): the month goes on at once, no hold-read notice, the set-aside one
    // said once. A SEGMENT (acked rows to record — never set aside) keeps r9's state: kept, read again by its timer
    const asides = W.notices().filter((i) => String(i.itemKey || '').startsWith('set-aside\n'));
    if (which === 'segment') {
      ok(novIn === 6 && nov7 === 7 && answers.every((r) => r && !r.deferred && r.holdFailed && r.holdFailed.length === 1 && r.holdFailed[0].month === '2026-10' && r.holdFailed[0].error === 'EACCES' && r.retryAfter > 0) && lines2 === 1 && reads.length === 1 && readOpen === 'open' && /cannot be read \(EACCES\)/.test(reads[0].text) && reads[0].detail.includes(target) && ack(rB) && after === 'done',
        `⑳ (3, the ${which} file EACCES) 6 batches after the restart: November ${novIn} of 6 recorded (${nov7} of 7 once it is read); October answered ${last.holdFailed ? last.holdFailed.map((f) => `${f.month}:${f.error}`).join(',') : last.deferred || '—'}, retryAfter ${last.retryAfter}; ${lines2} «could not be read» line(s); ${reads.length} notice(s) naming ${reads[0] && reads[0].detail.includes(target) ? 'the file' : 'NOT the file'}; the file readable again ⇒ its timer reads it, the next batch ${ack(rB) ? 'acked' : 'NOT acked'}, the notice ${after || '—'} (3c4fa614: every batch «deferred ledger-hold-loading» — November 0 of 6, 2 warn lines a batch, no retryAfter, no notice)`,
        { novIn, answers: answers.map((r) => r && { ack: r.ack, deferred: r.deferred, holdFailed: r.holdFailed, retryAfter: r.retryAfter }), lines2, reads: reads.map((i) => i.text), after, rB: rB && { ack: rB.ack, holdFailed: rB.holdFailed } });
    } else {
      ok(novIn === 6 && nov7 === 7 && answers.every((r) => r && r.ack && !r.holdFailed && !r.deferred) && lines2 === 1 && !reads.length && asides.length === 1 && /could not be read \(EACCES\) — set aside unread/.test(asides[0].text) && ack(rB) && fs.readdirSync(path.join(W.d, 'usage-history', '_set-aside')).length === 1,
        `⑳ (3, the set file EACCES — PINS NOW, r14) 6 batches after the restart: November ${novIn} of 6 recorded; October ${answers.filter((r) => r && r.ack && !r.holdFailed).length} of 6 acked at once — the set SET ASIDE unread (${asides.length} notice${asides[0] ? ': «' + asides[0].text + '»' : ''}), ${reads.length} hold-read notice(s), ${lines2} «could not be read» line(s) (a1d92418: retried on its timer — October 0 of 6 acked, while an older set's EACCES was set aside: the rule followed the file's age)`,
        { novIn, answers: answers.map((r) => r && { ack: r.ack, deferred: r.deferred, holdFailed: r.holdFailed }), lines2, reads: reads.map((i) => i.text), asides: asides.map((i) => i.text) });
    }
  }

  // ── 4. THE COUNT IS THE GENERATION'S (.acc8 skep8-probe-carried-double; .acc8c c4): the drain's segment unlinks EBUSY and
  // the store refusing at the end; a restart out of shape says the 33 (a «dropped» item); then 4 new events of the month —
  // the SAME generation continued ──
  {
    const W = world('w20d'), host = 'host-x', ids = Array.from({ length: 48 }, (_, k) => 9300 + k);
    W.todos()._flush = () => { throw fail('ENOSPC'); };
    const L1 = W.life();
    await quiet(() => L1.uh.ingestRemoteEvents(host, 'X', lines(ids)));
    L1.uh.shapeMaxBytes = 2 * GiB;
    const undo = busy(segFile); try { await quiet(() => L1.uh.ingestRemoteEvents(host, 'X', batchOf(NOV, 1))); } finally { undo(); }
    die(L1.uh); W.reboot();
    const L2 = W.life(); await quiet(() => L2.wired.reconcile());
    const n0 = said(W, host);
    await quiet(() => L2.uh.ingestRemoteEvents(host, 'X', lines([9400, 9401, 9402, 9403])));
    const s1 = sum(L2.uh, host), n1 = said(W, host);
    L2.uh.shapeMaxBytes = 2 * GiB; await quiet(() => L2.uh.ingestRemoteEvents(host, 'X', lines([9404])));
    const n2 = said(W, host), all = [...ids, 9400, 9401, 9402, 9403, 9404], missing = all.filter((i) => !ledgerOf(W.sh, host).includes(hidOf(i, host))).length;
    ok(n0 && n0.dropped === 33 && s1.held === 4 && s1.dropped === 33 && n1 && n1.dropped === 33 && !n1.earlier && n2 && n2.status === 'done' && n2.dropped === 33 && !n2.earlier && missing === 33,
      `⑳ (4) one generation read back after a crash (its «dropped» item open, saying ${n0 ? n0.dropped : '—'}) takes 4 new events: paused ${s1.held} + ${s1.dropped}, the notice says ${n1 ? n1.dropped : '—'}${n1 && n1.earlier ? ` + earlier ${n1.earlier}` : ''}; back in shape it closes with ${n2 ? n2.dropped : '—'} for ${missing} missing (3c4fa614: «66» — the item's 33 added again as \`carried\`)`,
      { n0, s1, n1, n2, missing });
  }

  // ── 5. WHAT THE INDEX TOLD IS A RECORD (.acc8c c2f): ⑲ 7g after a restart (8 recorded rows re-sent + 12 new; the end
  // filtered the 8 — «0 dropped»), the segment unlinks EBUSY and the `retired` append ENOSPC; a restart in shape with the
  // index not in memory ──
  {
    const W = world('w20e'), host = 'host-g', L0 = W.life(true), early = Array.from({ length: 8 }, (_, k) => 9000 + k);
    await quiet(() => L0.uh.ingestRemoteEvents(host, 'G', lines(early)));
    const L1 = W.life(); die(L0.uh);
    const win = [...early, ...Array.from({ length: 12 }, (_, k) => 9100 + k)];
    for (let k = 0; k < 5; k++) await quiet(() => L1.uh.ingestRemoteEvents(host, 'G', lines(win.slice(4 * k, 4 * k + 4))));
    const s0 = sum(L1.uh, host);
    fs.appendFileSync = function (f, t, ...a) { if (String(f).endsWith('.dropped') && String(t).includes('"retired"')) throw fail('ENOSPC'); return realAppend.call(this, f, t, ...a); };
    L1.uh.shapeMaxBytes = 2 * GiB;
    const undo = busy(segFile);
    try { await quiet(() => L1.uh.ingestRemoteEvents(host, 'G', batchOf(NOV, 1))); } finally { undo(); fs.appendFileSync = realAppend; }
    const n1 = said(W, host);
    W.todos().flush(); W.reboot(); die(L1.uh);
    const L2 = W.life(true); await quiet(() => L2.wired.reconcile());
    const n2 = said(W, host), missing = win.filter((i) => !ledgerOf(W.sh, host).includes(hidOf(i, host))).length;
    ok(s0.held === 12 && s0.dropped === 8 && n1 && n1.status === 'done' && n1.dropped === 0 && n2 && n2.status === 'done' && n2.dropped === 0 && missing === 0,
      `⑳ (5, c2f) the end said 0 (the 8 «dropped» were in the ledger), its \`retired\` refused: a restart in shape, the index not in memory, says ${n2 ? `${n2.dropped} (${n2.status})` : '—'} for ${missing} missing (3c4fa614: the closed notice reopened «8 held events were dropped — never recorded» for 0 missing)`,
      { s0, n1, n2, missing });
  }

  // ── 6. A HUNG READ-BACK IS BOUNDED AND SAID (.acc8 skep8-probe-hung-readback (b), skepC-readback-only): life 1 holds 2
  // October rows; life 2's every open of a `_held/` file never answers; 3 batches, each an October row + a November one ──
  {
    const W = world('w20f'), host = 'host-x', L1 = W.life();
    await quiet(() => L1.uh.ingestRemoteEvents(host, 'X', lines([9300, 9301])));
    die(L1.uh);
    let hung = 0;
    fs.promises.open = function (f, ...a) { if (String(f).includes(`${path.sep}_held${path.sep}`)) { hung++; return new Promise(() => { }); } return realOpen.call(this, f, ...a); };
    const L2 = W.life(); L2.uh.holdAnswerMs = 200; L2.uh.holdSlowMs = 100;
    const out = []; let saidLines = [];
    try {
      for (let k = 0; k < 3; k++) { const [b, s] = await quietRaw(() => race(L2.uh.ingestRemoteEvents(host, 'X', lines([9302 + k, NOV + k])), 1500)); out.push(b); saidLines = saidLines.concat(s); }
    } finally { fs.promises.open = realOpen; }
    const novIn = ledgerOf(W.nov, host).length, waited = saidLines.filter((l) => /read-back of .* has waited/.test(l)).length, inflight = L2.uh._inflight ? L2.uh._inflight.size : -1;
    die(L2.uh); // its read-back never answers: never waited for
    ok(out.every((b) => !b.timeout && b.r && !ack(b.r) && b.r.holdFailed && b.r.holdFailed[0].error === 'hold-slow') && novIn === 3 && waited >= 1 && hung === 1 && inflight <= 2,
      `⑳ (6) a read-back that never answers (${hung} open hung): 3 batches answered ${out.map((b) => (b.timeout ? 'NOTHING in 1.5 s' : b.r.holdFailed ? b.r.holdFailed.map((f) => f.error).join(',') : 'acked')).join(' / ')} within the bound (200 ms); November ${novIn} of 3 recorded; ${waited} «has waited» line(s) for the read-back; ${inflight} promise(s) in flight (3c4fa614: no answer at all, 0 November rows, nothing said, a promise per batch piling in flight)`,
      { out: out.map((b) => (b.timeout ? 'timeout' : b.r)), novIn, waited, hung, inflight });
  }

  // ── 7. THE LISTING'S RETRY IS SAID WHILE IT WAITS (.acc8 acc8-loop retry): the boot's listing EIO; its async retry hangs ──
  {
    const W = world('w20g'), host = 'host-l', L1 = W.life();
    await quiet(() => L1.uh.ingestRemoteEvents(host, 'L', lines([9300, 9301])));
    die(L1.uh);
    fs.readdirSync = function (p, ...a) { if (String(p) === W.heldDir) throw fail('EIO'); return realReaddir(p, ...a); };
    let release = null, retries = 0;
    fs.promises.readdir = function (p, ...a) { if (String(p) === W.heldDir) { retries++; return new Promise((res) => { release = () => res(realReaddir(p)); }); } return realPReaddir.call(this, p, ...a); };
    const L2 = W.life(); L2.uh.holdListRetryMs = 20; L2.uh.holdSlowMs = 60;
    let st = null, said7 = [];
    try {
      const [, s0] = await quietRaw(() => L2.wired.reconcile()); said7 = said7.concat(s0);
      const [, s1] = await quietRaw(() => sleep(140)); said7 = said7.concat(s1);
      st = L2.uh.holdListFailed();
    } finally { fs.readdirSync = realReaddir; fs.promises.readdir = realPReaddir; }
    if (release) release();
    const [, s2] = await quiet(() => sleep(20)); said7 = said7.concat(s2);
    const waited = said7.filter((l) => /listing of _held has waited/.test(l)).length, back = said7.some((l) => /listed again/.test(l));
    ok(retries === 1 && st && st.retrying === true && st.retryAfter >= 1 && waited >= 1 && back && !L2.uh.holdListFailed(),
      `⑳ (7) the listing's retry hangs: «has waited» said ${waited}× while it waits, holdListFailed() says ${st ? `retrying ${st.retrying}, retryAfter ${st.retryAfter} s` : '—'}; released ⇒ ${back ? 'listed again' : 'NOT listed'} (3c4fa614: nothing said until «listed again», holdListFailed() the old state)`,
      { retries, st, waited, back });
  }

  // ── 8. A RE-WORD NEVER LOSES A COUNT (.acc8c a2, pre-existing): a hold ends «36 dropped» (closed); the month's next hold —
  // in the same life and after a restart (no file of the old one left) — reopens the item ──
  for (const restart of [false, true]) {
    const W = world('w20h-' + restart), host = 'host-s', L1 = W.life(), ids = Array.from({ length: 48 }, (_, k) => 9300 + k);
    for (let k = 0; k < 12; k++) await quiet(() => L1.uh.ingestRemoteEvents(host, 'S', lines(ids.slice(4 * k, 4 * k + 4))));
    L1.uh.shapeMaxBytes = 2 * GiB; await quiet(() => L1.uh.ingestRemoteEvents(host, 'S', batchOf(NOV, 1)));
    const n0 = said(W, host);
    let L = L1;
    if (restart) { W.todos().flush(); W.reboot(); L = W.life(); die(L1.uh); await quiet(() => L.wired.reconcile()); } else L.uh.shapeMaxBytes = 64 * KiB;
    await quiet(() => L.uh.ingestRemoteEvents(host, 'S', lines([9400, 9401, 9402, 9403])));
    const s1 = sum(L.uh, host), n1 = said(W, host), items = W.notices().filter((i) => !String(i.itemKey || '').startsWith('hold-read')).length;
    ok(n0 && n0.status === 'done' && n0.dropped === 36 && s1.held === 4 && s1.dropped === 0 && n1 && n1.status === 'open' && n1.dropped === 0 && n1.earlier === 36 && items === 1,
      `⑳ (8${restart ? ', after a restart' : ''}) a hold closed «36 dropped»; the month's next hold reopens its item: paused ${s1.held} + ${s1.dropped}, the item says ${n1 ? `${n1.dropped} of its own + «Earlier: ${n1.earlier}»` : '—'} (${items} item) (3c4fa614 and 9a0d429d: re-worded without the 36)`,
      { n0, s1, n1, items });
  }

  // ── 9. THE STANDING ITEM IS A NOTICE — filed `kind: 'notice'`, its type in no answer list (rendered: test-user-todos-layout) ──
  {
    const HA = require(REPO + '/src/server/hub-act-ask.js'), src = fs.readFileSync(REPO + '/src/server/hub-act-ask.js', 'utf8');
    const row = fs.readFileSync(REPO + '/src/lib/user-todos-row.js', 'utf8'), lay = fs.readFileSync(REPO + '/src/lib/inbox-window-layout.js', 'utf8'), act = fs.readFileSync(REPO + '/src/lib/user-todos-actions.js', 'utf8'), rep = require(REPO + '/src/inbox-reply.js');
    const filed = /kind: 'notice', by: 'agent', sessionName: 'Machines',[^\n]*\n\s*action: \{ type: STANDING_TYPE/.test(src);
    const answered = [row, lay, act].filter((s) => s.includes(`'${HA.STANDING_TYPE}'`)).length + ((rep.ANSWER_ACTION_TYPES || []).includes(HA.STANDING_TYPE) ? 1 : 0);
    ok(HA.STANDING_TYPE === 'hub-act-standing' && filed && answered === 0,
      `⑳ (9) the standing item files as a notice (${filed ? 'kind notice' : 'kind action'}) and ${answered} answer list(s) name its type — no Allow once / Always / Deny drawn (3c4fa614: kind action, 4 answer lists — rendered with the 60 s card's three answers)`, { filed, answered });
  }
});
console.log('㉑ F4 A NOTICE CLOSES WHEN WHAT IT NAMES IS READ · A NOTICE NAMES A REAL FILE · EVERY WAIT IS SAID · EVERY DEFERRED ANSWER CARRIES retryAfter · A COUNT IS SAID EVEN WHEN NOTHING COMES BACK · NOTHING IS UNLINKED UNREAD · A ROW THAT FITS IS NEVER PUSHED OUT · A FOLD NEVER CROSSES A HOLD (round 10)');
await leg('㉑', async () => {
  const NOV = 800000;
  const seams = (uh) => { uh.shapeMaxBytes = 64 * KiB; uh.holdMaxBytes = 4 * KiB; uh.holdSegBytes = 1 * KiB; uh.dedupShard = (f) => { const p = new Promise(() => { }); uh._dedupJobs.set(f, p); return p; }; return uh; };
  const world = (name) => {
    const d = dirOf(name), sh = shardOf(d);
    fs.writeFileSync(sh, Array.from({ length: 400 }, (_, i) => row(i)).join('\n') + '\n');
    let todos = new UserTodoManager({ dataDir: d, expirySweepMs: 0 });
    const W = { d, sh, nov: path.join(d, 'usage-history', 'events-2026-11.ndjson'), heldDir: path.join(d, 'usage-history', '_held') };
    W.todos = () => todos;
    W.notices = () => todos._state.items.filter((i) => i.sessionKey === 'usage-ledger');
    W.reads = () => W.notices().filter((i) => String(i.itemKey || '').startsWith('hold-read'));
    W.life = (inShape = false) => { const uh = seams(newUh(d)); if (inShape) uh.shapeMaxBytes = 2 * GiB; const wired = LSN.wire({ usageHistory: uh, userTodos: todos, log: () => { }, reconcileAfterMs: null }); return { uh, wired }; };
    W.reboot = () => { if (todos._writeTimer) { clearTimeout(todos._writeTimer); todos._writeTimer = null; } todos = new UserTodoManager({ dataDir: d, expirySweepMs: 0 }); };
    W.heldFiles = (host) => (fs.existsSync(W.heldDir) ? fs.readdirSync(W.heldDir).filter((f) => f.includes(`~${host}.`)).sort() : []);
    return W;
  };
  const lines = (ids) => ids.map((i) => remote(i)).join('\n') + '\n';
  const octOf = (W, host) => ridsOf(W.sh).filter((r) => r.startsWith(`h:${host}:`));
  const said = (W, host) => { const n = W.notices().find((i) => i.i18n && i.i18n.text && i.i18n.text.params && i.i18n.text.params.host === host && !/^(hold-read|set-aside)\n/.test(String(i.itemKey || ''))); return n ? { status: n.status, dropped: Number((/the (\d+) oldest held events|: (\d+) held events were dropped/.exec(n.detail + ' ' + n.text) || []).slice(1).find(Boolean) || 0), earlier: Number((/Earlier: (\d+) held events/.exec(n.detail) || [])[1] || 0) } : null; };
  const realOpen = fs.promises.open;
  const race = (p, ms) => Promise.race([Promise.resolve(p).then((r) => ({ r })), sleep(ms).then(() => ({ timeout: true }))]);
  const die = (uh) => { for (const h of uh._holds.values()) h.io = new Promise(() => { }); uh._holds.clear(); const i = ALL_UH.indexOf(uh); if (i >= 0) ALL_UH.splice(i, 1); if (uh._inflight) uh._inflight.clear(); uh.onShape = null; for (const f of (uh._readFail || new Map()).values()) clearTimeout(f.timer); for (const s of (uh._lines || new Map()).values()) if (s && s.timer) clearTimeout(s.timer); for (const s of (uh._retries || new Map()).values()) if (s && s.timer) clearTimeout(s.timer); };
  /** the segment's open refused (EACCES, with its path — as the OS says it) → undo */
  const deny = (file) => { fs.promises.open = function (f, ...a) { if (String(f) === file) return Promise.reject(Object.assign(new Error(`EACCES: permission denied, open '${file}'`), { code: 'EACCES', path: file })); return realOpen.call(this, f, ...a); }; return () => { fs.promises.open = realOpen; }; };
  /** the segment opens; a call of its FileHandle (`read`: rejected EIO with NO path, as FileHandle.read says it; `close`: hangs
   *  until released) → {undo, release} */
  const handle = (file, how) => {
    const held = [];
    fs.promises.open = async function (f, ...a) {
      const fh = await realOpen.call(this, f, ...a);
      if (String(f) !== file) return fh;
      return new Proxy(fh, { get(t, k) {
        if (how === 'eio-read' && k === 'read') return () => Promise.reject(Object.assign(new Error('EIO: i/o error, read'), { code: 'EIO', errno: -5, syscall: 'read' }));
        if (how === 'hang-close' && k === 'close') return () => new Promise((res) => held.push(() => t.close().then(res, res)));
        const v = t[k]; return typeof v === 'function' ? v.bind(t) : v;
      } });
    };
    return { undo: () => { fs.promises.open = realOpen; }, release: () => { for (const r of held.splice(0)) r(); } };
  };
  /** the segment's open hangs until released (a read-back in flight) → {undo, release} */
  const gate = (file) => { const held = []; fs.promises.open = function (f, ...a) { if (String(f) === file) return new Promise((res, rej) => held.push(() => realOpen.call(this, f, ...a).then(res, rej))); return realOpen.call(this, f, ...a); }; return { undo: () => { fs.promises.open = realOpen; }, release: () => { for (const r of held.splice(0)) r(); } }; };
  const segOf = (W, host) => path.join(W.heldDir, W.heldFiles(host).find((f) => f.endsWith('.ndjson')) || 'none');
  /** life 1: four October rows held (the month out of shape), the store on disk, the process gone → the world */
  const held4 = async (name, host) => {
    const W = world(name), L1 = W.life();
    await quiet(() => L1.uh.ingestRemoteEvents(host, 'X', lines([9300, 9301, 9302, 9303])));
    W.todos().flush(); W.reboot(); die(L1.uh);
    return W;
  };

  // ── 1. A NOTICE CLOSES WHEN WHAT IT NAMES IS READ — ACROSS A RESTART (skep9-probe-readnotice-restart): life 2 cannot read
  // the segment (EACCES), its notice on disk; life 3 reads it — the boot reconcile once, as server.js runs it ──
  {
    const host = 'host-x', W = await held4('w21a', host), seg = segOf(W, host);
    let undo = deny(seg);
    const L2 = W.life(); L2.uh.holdListRetryMs = 1e6;
    await quiet(() => L2.wired.reconcile());
    const r2 = W.reads().map((i) => i.status).join(',');
    W.todos().flush(); die(L2.uh); W.reboot(); undo();
    const L3 = W.life();
    const [n3] = await quiet(() => L3.wired.reconcile());
    await quiet(() => sleep(100));
    const r3 = W.reads().map((i) => i.status).join(','), h3 = (L3.uh.holdsNow().find((x) => x.host === host) || {}).held;
    // … and in one life (the read-back's own timer): unreadable, then readable again
    undo = deny(seg); L3.uh._holds.clear(); L3.uh._heldList = null; L3.uh.holdListRetryMs = 40;
    await quiet(() => L3.wired.reconcile());
    const r4 = W.reads().map((i) => i.status).join(',');
    undo(); await quiet(() => sleep(150));
    const r5 = W.reads().map((i) => i.status).join(',');
    die(L3.uh);
    ok(r2 === 'open' && r3 === 'done' && h3 === 4 && r4 === 'open' && r5 === 'done',
      `㉑ (1) a «cannot be read» notice from before a restart, its file readable in the new process: ${r3} after the boot reconcile (reconcile closed ${n3}; the hold read back, ${h3} held) — in one life: ${r4} → ${r5} (7f4df6a9: open for ever — the reconcile judged it the instant its read-back started, the read's success said nothing)`,
      { r2, r3, n3, h3, r4, r5 });
  }

  // ── 2. A NOTICE NAMES A REAL FILE: the segment opens, its read fails EIO (a FileHandle's error carries no path) ──
  {
    const host = 'host-x', W = await held4('w21b', host), seg = segOf(W, host), f = handle(seg, 'eio-read');
    const L2 = W.life(); L2.uh.holdListRetryMs = 1e6;
    let l2 = [];
    try { [, l2] = await quiet(() => L2.wired.reconcile()); } finally { f.undo(); }
    const it = W.reads()[0], name = path.basename(seg);
    const inNotice = !!(it && it.detail.includes(`_held/${name} could not be read (EIO)`)), inLine = l2.some((l) => l.includes(`(EIO: ${name})`));
    die(L2.uh);
    ok(inNotice && inLine,
      `㉑ (2) a read-back whose READ fails (EIO, no path on the error): the notice names ${it ? (/_held\/(\S+) could not be read/.exec(it.detail) || [])[1] : '—'}, the journal «${(l2.find((l) => /could not be read \(EIO/.test(l)) || '—').replace(/^.*\((EIO: [^)]*)\).*$/, '$1')}» — the segment's own name (7f4df6a9: the hold's key, «events-2026-10~host-x» — no such file)`,
      { detail: it && it.detail.split('\n')[0], line: l2.find((l) => /EIO/.test(l)) });
  }

  // ── 3. EVERY WAIT IS SAID — the close too (claim 1 X1): the segment read, its close() hangs ──
  {
    const host = 'host-x', W = await held4('w21c', host), seg = segOf(W, host), f = handle(seg, 'hang-close');
    const L2 = W.life(); L2.uh.holdSlowMs = 50; L2.uh.holdAnswerMs = 300;
    let l2 = [], r = null;
    try {
      [, l2] = await quietRaw(async () => { L2.wired.reconcile(); await sleep(120); });
      const [x, l3] = await quietRaw(() => race(L2.uh.ingestRemoteEvents(host, 'X', lines([9304])), 2000)); r = x; l2 = l2.concat(l3);
    } finally { f.release(); f.undo(); }
    await quiet(() => sleep(20));
    const waited = l2.filter((l) => /has waited/.test(l) && l.includes(path.basename(seg)));
    die(L2.uh);
    ok(waited.length >= 1 && r && !r.timeout && r.r && r.r.holdFailed && r.r.holdFailed[0].error === 'hold-slow',
      `㉑ (3) a read-back whose close() hangs: «${(waited[0] || '—').slice(8, 90)}…» said ${waited.length}×; the month's batch answered ${r && r.r ? `${r.r.holdFailed ? r.r.holdFailed.map((x) => x.error).join(',') : 'acked'}` : 'NOTHING'} at the bound (7f4df6a9: bounded but never said — the close was the one call outside the road's wrapper)`,
      { waited, r: r && r.r });
  }

  // ── 4. EVERY DEFERRED ANSWER CARRIES retryAfter (claim 0 (d)): a read-back in flight, 9 October batches — 8 wait, the 9th is refused at
  // once (`hold-busy`), the 8 answered `hold-slow` at the bound — and each carries `retryAfter` ──
  {
    const host = 'host-x', W = await held4('w21d', host), seg = segOf(W, host), g = gate(seg);
    const L2 = W.life(); L2.uh.holdAnswerMs = 300;
    let busy = null, slow = [];
    try {
      L2.uh.restoreHolds();
      // ONE capture around the concurrent batches (captures nested out of order would leave the console swapped)
      [[busy, slow]] = await quietRaw(async () => {
        const ps = []; for (let k = 0; k < 8; k++) ps.push(L2.uh.ingestRemoteEvents(host, 'X', lines([9400 + k])));
        const b9 = await L2.uh.ingestRemoteEvents(host, 'X', lines([9500]));
        return [b9, await Promise.all(ps)];
      });
    } finally { g.release(); g.undo(); }
    await quiet(() => sleep(20));
    const slowOk = slow.length === 8 && slow.every((x) => x && x.holdFailed && x.holdFailed[0].error === 'hold-slow' && x.retryAfter >= 1);
    const busyOk = !!(busy && busy.holdFailed && busy.holdFailed[0].error === 'hold-busy' && busy.retryAfter >= 1);
    die(L2.uh);
    ok(busyOk && slowOk,
      `㉑ (4) the 9th batch while 8 wait for a read-back: ${busy && busy.holdFailed ? busy.holdFailed[0].error : '—'} with retryAfter ${busy ? busy.retryAfter : '—'} s; the 8 at the bound: ${[...new Set(slow.map((x) => (x && x.holdFailed ? x.holdFailed[0].error : '—')))].join(',')} with retryAfter ${[...new Set(slow.map((x) => (x ? x.retryAfter : '—')))].join(',')} s (7f4df6a9: neither carried one — only a failed read-back's month did)`,
      { busy, slow: slow.slice(0, 2) });
  }

  // ── 5. THE WAITERS ARE COUNTED BACK (the reviewer's unreported minor): a read-back in flight; 8 batches of October + a
  // November whose index loads in steps (each answered `deferred` whole) — then an October batch ──
  {
    const host = 'host-x', W = await held4('w21e', host), seg = segOf(W, host), g = gate(seg);
    fs.writeFileSync(W.nov, Array.from({ length: 100 }, (_, i) => row(NOV + 1000 + i)).join('\n') + '\n'); // in shape (< 64 KiB), past the index's inline 2 KiB
    const L2 = W.life(); L2.uh.holdAnswerMs = 300; L2.uh.ingestIndexInlineBytes = 2048;
    let defs = [], next = null, waiting = -1;
    try {
      L2.uh.restoreHolds();
      for (let k = 0; k < 8; k++) defs.push((await quietRaw(() => L2.uh.ingestRemoteEvents(host, 'X', lines([9400 + k, NOV + k]))))[0]);
      const h = L2.uh._holds.get(`events-2026-10~${host}`); waiting = h ? h.waiting : -1;
      const p = quietRaw(() => L2.uh.ingestRemoteEvents(host, 'X', lines([9500])));
      await sleep(20); g.release(); [next] = await p;
    } finally { g.release(); g.undo(); }
    await quiet(() => sleep(20));
    const deferred = defs.filter((x) => x && x.deferred === 'ledger-index-loading').length;
    die(L2.uh);
    ok(deferred === 8 && waiting === 0 && next && !(next.holdFailed && next.holdFailed.some((x) => x.error === 'hold-busy')),
      `㉑ (5) 8 batches deferred whole (a month's index loading) while their October waited: the hold counts ${waiting} waiting after them; the next October batch ${next ? (next.holdFailed ? next.holdFailed.map((x) => x.error).join(',') : next.ack ? 'acked' : 'unacked') : '—'} (7f4df6a9: 8 counted for ever — the next batch refused hold-busy with nobody waiting)`,
      { deferred, waiting, next });
  }

  // ── 6. AN UNSAID COUNT IS TRIED AGAIN AT MOST ONCE A MINUTE (claim 0 (b)): 15 held + 33 dropped, the store refusing every
  // write; back in shape — the end cannot put its count on disk; 4 more ingests of November ──
  {
    const W = world('w21f'), host = 'host-x', L1 = W.life(), ids = Array.from({ length: 48 }, (_, k) => 9300 + k);
    await quiet(() => L1.uh.ingestRemoteEvents(host, 'X', lines(ids)));
    const t = W.todos(), realFlush = t.flush, realSave = t._save;
    t.flush = () => { throw Object.assign(new Error('EROFS: read-only file system'), { code: 'EROFS' }); }; t._save = () => { };
    const evs = []; const on = L1.uh.onShape; L1.uh.onShape = (ev) => { if (ev && (ev.kind === 'dropped' || ev.kind === 'resumed')) evs.push(ev.kind); return on(ev); };
    L1.uh.shapeMaxBytes = 2 * GiB; L1.uh.sayAgainMs = 800;
    let all = [];
    try {
      const [, l0] = await quiet(() => L1.uh.ingestRemoteEvents(host, 'X', batchOf(NOV, 1))); all = all.concat(l0);
      const first = evs.length;
      for (let k = 1; k <= 4; k++) { const [, l] = await quiet(() => L1.uh.ingestRemoteEvents(host, 'X', batchOf(NOV + k, 1))); all = all.concat(l); }
      const again = evs.length - first;
      const [, lf] = await quiet(() => sleep(900)); all = all.concat(lf);
      const atEnd = evs.length - first - again;
      const flushLine = all.filter((l) => /not on disk in their notice yet/.test(l));
      // PINNED (r10): the window's end said «(3 more ingest(s) since the last try)» and sent nothing. PINS NOW (r11, a retry is
      // a retry): the window's end TRIES — the count sent again, its line said by that try
      ok(first === 1 && again === 1 && atEnd === 1 && flushLine.length === 2 && /— tried again now;/.test(flushLine[0] || '') && /\(3 ingest\(s\) since the last try did not try\)/.test(flushLine[1] || ''),
        `㉑ (6) the store refusing every write: the end's count sent ${first}×, then ${again}× over 4 more ingests (once a window), ${atEnd}× at the window's end; its lines: ${flushLine.length} — «…${(flushLine[1] || '—').slice(-56)}» (7f4df6a9: sent at every ingest — 4 more, a wire line each; 3c8c0501: 0× at the window's end, its line claiming a try)`,
        { first, again, atEnd, evs, flushLine });
    } finally { t.flush = realFlush; t._save = realSave; die(L1.uh); }
  }

  // ── 7. A COUNT IS SAID EVEN WHEN ITS KEY NEVER COMES BACK (claim 1 (b)): 7 batches of a machine whose hold's appends hang,
  // answered hold-slow — then nothing more ──
  {
    const W = world('w21g'), host = 'host-x', L1 = W.life(); L1.uh.holdAnswerMs = 100; L1.uh.sayAgainMs = 300;
    const realAppend = fs.promises.appendFile, held = [];
    fs.promises.appendFile = function (f, ...a) { if (String(f).includes(`${path.sep}_held${path.sep}`)) return new Promise((res, rej) => held.push(() => realAppend.call(this, f, ...a).then(res, rej))); return realAppend.call(this, f, ...a); };
    let all = [];
    try {
      const [, l] = await quietRaw(async () => { const ps = []; for (let k = 0; k < 7; k++) ps.push(L1.uh.ingestRemoteEvents(host, 'X', lines([9300 + k]))); await Promise.all(ps); await sleep(450); });
      all = all.concat(l);
    } finally { fs.promises.appendFile = realAppend; for (const r of held.splice(0)) r(); }
    await quiet(() => sleep(20));
    const slowLines = all.filter((l) => /could not be held \(hold-slow\)/.test(l));
    die(L1.uh);
    ok(slowLines.length === 2 && /\(6 more batch\(es\) since the last such line\)/.test(slowLines[1] || ''),
      `㉑ (7) 7 hold-slow batches of one machine, then silence: ${slowLines.length} line(s) — the window's count «${(/\((\d+ more batch\(es\))/.exec(slowLines[1] || '') || [])[1] || 'never said'}» flushed at its end (7f4df6a9: 1 line — the 6 said only with a next batch that never came)`,
      { slowLines });
  }

  // ── 8. NOTHING IS UNLINKED UNREAD (claim 0 (a)): two set files at a boot — generation 0 counting 33 (never retired), 2 counting
  // 5 — and no item yet; the month in shape. And with the store refusing writes: the older set stays ──
  for (const refuse of [false, true]) {
    const W = world('w21h-' + refuse), host = 'host-x';
    fs.mkdirSync(W.heldDir, { recursive: true });
    const set = (gen, ids) => fs.writeFileSync(path.join(W.heldDir, `events-2026-10~${host}.${gen}.dropped`), JSON.stringify({ gone: ids.map((i) => hidOf(i, host)) }) + '\n');
    set(0, Array.from({ length: 33 }, (_, k) => 9000 + k)); set(2, Array.from({ length: 5 }, (_, k) => 9100 + k));
    const t = W.todos(), realFlush = t.flush, realSave = t._save;
    if (refuse) { t.flush = () => { throw Object.assign(new Error('EROFS: read-only file system'), { code: 'EROFS' }); }; t._save = () => { }; }
    const L = W.life(true);
    try { await quiet(() => L.wired.reconcile()); await quiet(() => sleep(50)); } finally { t.flush = realFlush; t._save = realSave; }
    const n = said(W, host), left = W.heldFiles(host), items = W.notices().length;
    die(L.uh);
    if (!refuse) ok(n && n.dropped === 5 && n.earlier === 33 && items === 1 && !left.includes(`events-2026-10~${host}.0.dropped`),
      `㉑ (8) two set files at a boot (generation 0: 33, generation 2: 5): the one item says ${n ? `${n.dropped} + «Earlier: ${n.earlier}»` : '—'}, generation 0's file ${left.includes(`events-2026-10~${host}.0.dropped`) ? 'kept' : 'unlinked once said'} (7f4df6a9: 5, generation 0 deleted unread — its 33 said nowhere)`,
      { n, left, items });
    else ok(left.includes(`events-2026-10~${host}.0.dropped`),
      `㉑ (8, the store refusing writes) generation 0's set ${left.includes(`events-2026-10~${host}.0.dropped`) ? 'stays on disk until its count is said' : 'GONE, its count unsaid'} (7f4df6a9: deleted unread)`, { left });
  }

  // ── 9. A ROW THAT FITS IS NEVER PUSHED OUT BY THE ROWS THAT ARRIVED WITH THE DRAIN (claim 1 (a), pre-existing): 15 rows
  // held at the 4 KiB bound (4005 B); back in shape — the batch that starts the drain carries an October row (three of them) ──
  {
    const W = world('w21i'), host = 'host-x', L1 = W.life(), ids = Array.from({ length: 15 }, (_, k) => 9300 + k);
    await quiet(() => L1.uh.ingestRemoteEvents(host, 'X', lines(ids)));
    const s0 = L1.uh.ingestPaused().find((p) => p.host === host) || {};
    L1.uh.shapeMaxBytes = 2 * GiB;
    for (let k = 0; k < 3; k++) { await quiet(() => L1.uh.ingestRemoteEvents(host, 'X', lines([9400 + k, NOV + k]))); await sleep(30); }
    await quiet(() => sleep(50));
    const all = [...ids, 9400, 9401, 9402], got = octOf(W, host), rec = all.filter((i) => got.filter((r) => r === hidOf(i, host)).length === 1).length;
    const n = said(W, host);
    die(L1.uh);
    ok(s0.held === 15 && !s0.dropped && rec === 18 && !(n && n.dropped),
      `㉑ (9) a hold of ${s0.held} rows at its bound back in shape, the drain started by a batch carrying October rows: ${rec} of 18 recorded, ${n ? n.dropped : 0} said dropped (7f4df6a9: the batch appended before the drain's first step pushed the held rows out — 3 of 18 recorded, 15 «dropped»)`,
      { s0: [s0.held, s0.dropped], rec, n });
  }

  // ── 10. A FOLD NEVER CROSSES A HOLD (unverified 0, skep9-probe-tracer-fold — pure): 600 short calls across two 240 ms holds,
  // with and without the loop turning between them; a call made inside another (readFileSync's own open + read) ──
  {
    const BT = require(REPO + '/src/server/boot-trace.js'), f = path.join(REPO, 'package.json'), here = /test-ledger-whole-law\.mjs/;
    const sitesOf = BT.sitesOf || (() => []);
    const run = (withTurn) => {
      let clock = 0, turnNo = 0; const ops = [], orig = fs.existsSync;
      fs.existsSync = function (...a) { clock += 0.5; return orig.apply(this, a); };
      const undo = BT.wrapSync({ ops, now: () => clock, turn: () => turnNo });
      try { for (let k = 0; k < 600; k++) { clock += 0.3; if (withTurn && k === 300) turnNo++; fs.existsSync(f); } } finally { undo(); fs.existsSync = orig; }
      return [{ at: 0, ms: 240 }, { at: 240, ms: 240 }].map((g) => { const s = sitesOf(ops, g); return { ms: s.reduce((a, x) => a + x.ms, 0), named: s.some((x) => here.test(x.what)), cap: g.ms }; });
    };
    const a = run(false), b = run(true);
    let nested = 0; { const ops = []; let clock = 0; const undo = BT.wrapSync({ ops, now: () => (clock += 0.01) }); try { for (let i = 0; i < 1000; i++) fs.readFileSync(f); } finally { undo(); } nested = ops.filter((o) => !o.nested).length; }
    const good = (hs) => hs.every((x) => x.named && x.ms > 0 && x.ms <= x.cap);
    ok(good(a) && good(b) && nested <= 10,
      `㉑ (10) the tracer: two 240 ms holds of short calls — hold 1 ${a[0].ms} ms, hold 2 ${a[1].ms} ms (the loop turning between them: ${b[0].ms} + ${b[1].ms}), each naming its site; 1000 readFileSync at one site fold into ${nested} op(s) (7f4df6a9: ONE op of 600 calls — hold 1 credited 300 ms of its 240, hold 2 «sites: []»; 1000 ops, one per read)`,
      { a, b, nested });
  }
});
await leg('㉒', async () => {
  console.log('㉒ A RETRY IS A RETRY · ONE GENERATION BOUND · EVERY COUNTER COMES DOWN ON EVERY ROAD · A SET FILE THAT IS NO SET FILE IS UNREAD · A FOLD KEY NAMES THE SITE · A LONG TEXT KEYS ITS RUN BY A DIGEST');
  const NOV = 800000;
  const seams = (uh) => { uh.shapeMaxBytes = 64 * KiB; uh.holdMaxBytes = 4 * KiB; uh.holdSegBytes = 1 * KiB; uh.dedupShard = (f) => { const p = new Promise(() => { }); uh._dedupJobs.set(f, p); return p; }; return uh; };
  const world = (name) => {
    const d = dirOf(name), sh = shardOf(d);
    fs.writeFileSync(sh, Array.from({ length: 400 }, (_, i) => row(i)).join('\n') + '\n');
    const todos = new UserTodoManager({ dataDir: d, expirySweepMs: 0 });
    const W = { d, sh, nov: path.join(d, 'usage-history', 'events-2026-11.ndjson'), heldDir: path.join(d, 'usage-history', '_held') };
    W.todos = () => todos;
    W.notices = () => todos._state.items.filter((i) => i.sessionKey === 'usage-ledger');
    W.life = (inShape = false) => { const uh = seams(newUh(d)); if (inShape) uh.shapeMaxBytes = 2 * GiB; const wired = LSN.wire({ usageHistory: uh, userTodos: todos, log: () => { }, reconcileAfterMs: null }); return { uh, wired }; };
    W.heldFiles = (host) => (fs.existsSync(W.heldDir) ? fs.readdirSync(W.heldDir).filter((f) => f.includes(`~${host}.`)).sort() : []);
    return W;
  };
  const lines = (ids) => ids.map((i) => remote(i)).join('\n') + '\n';
  const said = (W, host) => { const n = W.notices().find((i) => i.i18n && i.i18n.text && i.i18n.text.params && i.i18n.text.params.host === host && !/^(hold-read|set-aside)\n/.test(String(i.itemKey || ''))); return n ? { status: n.status, dropped: Number((/the (\d+) oldest held events|: (\d+) held events were dropped/.exec(n.detail + ' ' + n.text) || []).slice(1).find(Boolean) || 0), earlier: Number((/Earlier: (\d+) held events/.exec(n.detail) || [])[1] || 0) } : null; };
  const die = (uh) => { for (const h of uh._holds.values()) h.io = new Promise(() => { }); uh._holds.clear(); const i = ALL_UH.indexOf(uh); if (i >= 0) ALL_UH.splice(i, 1); if (uh._inflight) uh._inflight.clear(); uh.onShape = null; for (const f of (uh._readFail || new Map()).values()) clearTimeout(f.timer); for (const m of [uh._lines, uh._retries]) for (const s of (m || new Map()).values()) if (s && s.timer) clearTimeout(s.timer); };
  /** the console of `fn` kept while it runs AND while the timers it armed fire (`ms` after it) — no settle: the legs below
   *  watch a road that goes on */
  const watch = async (fn) => { const w = console.warn, l = console.log, out = []; console.warn = (...a) => out.push(a.join(' ')); console.log = (...a) => out.push(a.join(' ')); try { return [await fn(), out]; } finally { console.warn = w; console.log = l; } };

  // ── 1. A RETRY IS A RETRY (MAJOR, skep10-unsaid-starve): 15 held + 33 dropped, back in shape, the store refusing writes —
  // the end cannot put its count on disk; then the store works again and the machine sends every 100 ms (the window 300 ms) ──
  {
    const W = world('w22a'), host = 'host-x', L1 = W.life(), t = W.todos(), realFlush = t.flush, realSave = t._save;
    const evs = [];
    let ended = null, tRecover = 0, out = [], sends = 0, unsaid = true, files = [];
    try {
      await quiet(() => L1.uh.ingestRemoteEvents(host, 'X', lines(Array.from({ length: 48 }, (_, k) => 9300 + k))));
      t.flush = () => { throw Object.assign(new Error('EROFS: read-only file system'), { code: 'EROFS' }); }; t._save = () => { };
      const on = L1.uh.onShape; L1.uh.onShape = (ev) => { if (ev && (ev.kind === 'dropped' || ev.kind === 'resumed')) evs.push({ kind: ev.kind, at: Date.now() }); return on(ev); };
      L1.uh.shapeMaxBytes = 2 * GiB; L1.uh.sayAgainMs = 300;
      [, out] = await watch(async () => {
        await L1.uh.ingestRemoteEvents(host, 'X', batchOf(NOV, 1)); await settle(); // the drain's end: the store refuses ⇒ unsaid
        await L1.uh.ingestRemoteEvents(host, 'X', batchOf(NOV + 1, 1)); await settle(); // the first try again: refused again
        t.flush = realFlush; t._save = realSave; tRecover = Date.now(); // the store works again
        const before = evs.length;
        for (let k = 0; k < 20; k++) {
          await L1.uh.ingestRemoteEvents(host, 'X', batchOf(NOV + 2 + k, 1)); await sleep(100);
          const h = [...L1.uh._holds.values()].find((x) => x.base === 'events-2026-10');
          if (ended === null && !(h && h.unsaid)) ended = Date.now() - tRecover;
        }
        await settle();
        sends = evs.length - before;
        const h = [...L1.uh._holds.values()].find((x) => x.base === 'events-2026-10'); unsaid = !!(h && h.unsaid);
        files = W.heldFiles(host);
      });
    } finally { t.flush = realFlush; t._save = realSave; die(L1.uh); }
    const tries = out.filter((l) => /not on disk in their notice yet/.test(l));
    ok(sends >= 1 && !unsaid && files.length === 0 && ended !== null && ended <= 300 + 250 && tries.length >= 1 && tries.every((l) => /— tried again now;/.test(l)),
      `㉒ (1) the store back while the machine sends every 100 ms (window 300 ms): the count sent ${sends}× during the ingests, the hold ended ${ended} ms after the store came back, its set file ${files.length ? 'KEPT' : 'gone'}; ${tries.length} «tried again» line(s), each said by a try (3c8c0501: sent 0×, the hold unsaid for as long as the machine sends, «tried again at most once a minute (3 more ingest(s) since the last try)» 7× with no try)`,
      { sends, unsaid, files, ended, tries: tries.map((l) => l.slice(-110)) });
  }

  // ── 2. THE RETRY'S OWN CLOCK (r11-retry-cadence): a call every 50 ms for 1 s, the window 200 ms — a try at least once a
  // window, a line only with a try (on a tree without `_retryPaced`: r10's road, `_sayAgain`'s answer) ──
  {
    const uh = newUh(dirOf('w22b')); uh.sayAgainMs = 200;
    const t0 = Date.now(), acted = [];
    const act = () => { acted.push(Date.now() - t0); return true; }, words = (n) => `the try${n ? ` (${n} call(s) since the last try did not try)` : ''}`;
    const call = typeof uh._retryPaced === 'function' ? () => uh._retryPaced('k', act, words) : () => { if (uh._sayAgain('k', words)) act(); };
    const [, out] = await watch(async () => { for (let k = 0; k < 20; k++) { call(); await sleep(50); } await sleep(260); });
    die(uh);
    const gaps = acted.slice(1).map((x, i) => x - acted[i]), maxGap = gaps.length ? Math.max(...gaps) : Infinity;
    ok(acted.length >= 5 && maxGap <= 200 + 60 && out.length === acted.length,
      `㉒ (2) 20 calls 50 ms apart, the window 200 ms: ${acted.length} tries, the longest gap ${maxGap} ms, ${out.length} line(s) for ${acted.length} tries (3c8c0501: one try at the first call, then «(N more since the last try)» lines every window with no try)`,
      { acted, out: out.slice(0, 8) });
  }

  // ── 3. ONE BOUND (skep10-gen-max): a notice item naming generation HOLD_GEN_MAX (1e9) — the month's next hold is REFUSED by
  // name, nothing acked into a file the listing skips; 999 999 998 (control) mints the last generation, read back at a restart ──
  {
    const life = async (name, seen) => {
      const W = world(name), host = 'host-x', L = W.life();
      L.uh.holdGenSeen(host, 'events-2026-10.ndjson', seen);
      const [r, out] = await quiet(() => L.uh.ingestRemoteEvents(host, 'X', lines([9300, 9301, 9302, 9303, 9304])));
      const files = W.heldFiles(host);
      die(L.uh);
      const L2 = W.life(); L2.uh.restoreHolds(); await settle();
      const back = (L2.uh.holdsNow().find((x) => x.host === host) || {}).held || 0;
      die(L2.uh);
      return { ack: r.ack, err: (r.holdFailed || []).map((x) => x.error).join(','), files, back, said: out.some((l) => /could not be held \(hold-gen-max\)/.test(l)) };
    };
    const a = await life('w22c', 1e9), b = await life('w22c2', 999999998);
    ok(!a.ack && a.err === 'hold-gen-max' && a.files.length === 0 && a.said && b.ack && b.files.length >= 1 && b.files.every((x) => x.includes('.999999999')) && b.back === 5,
      `㉒ (3) a stored generation 1e9: the next hold ${a.ack ? 'ACKED' : 'refused'} (${a.err || '—'}${a.said ? ', said' : ''}), ${a.files.length} file(s) written; 999 999 998: acked, ${b.files.join(',')}, ${b.back} read back at a restart (3c8c0501: acked, held 5 in events-2026-10~host-x.1000000001000000.ndjson — the next boot's listing skips it, 0 read back)`,
      { a, b });
  }

  // ── 4. EVERY COUNTER COMES DOWN ON EVERY ROAD (probe-waitleak): October's hold read back in flight, November's ledger append
  // throwing ENOSPC — 8 batches of [October, November] throw; then a 9th, October alone ──
  {
    const W = world('w22d'), host = 'host-x', L1 = W.life();
    await quiet(() => L1.uh.ingestRemoteEvents(host, 'X', lines([9300, 9301, 9302, 9303])));
    die(L1.uh);
    const seg = path.join(W.heldDir, W.heldFiles(host).find((f) => f.endsWith('.ndjson')));
    const realOpen = fs.promises.open, realAppend = fs.appendFileSync, held = [];
    let threw = 0, waiting = -1, ends = -1, ninth = null;
    try {
      fs.promises.open = function (f, ...a) { if (String(f) === seg) return new Promise((res, rej) => held.push(() => realOpen.call(this, f, ...a).then(res, rej))); return realOpen.call(this, f, ...a); };
      fs.appendFileSync = function (f, ...a) { if (String(f) === W.nov) throw Object.assign(new Error('ENOSPC: no space left on device, write'), { code: 'ENOSPC' }); return realAppend.call(this, f, ...a); };
      const L2 = W.life(); L2.uh.holdAnswerMs = 300; L2.uh.restoreHolds();
      await watch(async () => {
        for (let k = 0; k < 8; k++) { try { const r = L2.uh.ingestRemoteEvents(host, 'X', lines([9310 + k, NOV + k])); if (r && r.then) r.catch(() => { }); } catch (e) { if (e && e.code === 'ENOSPC') threw++; } }
        const h = L2.uh._holds.get(`events-2026-10~${host}`); waiting = h ? h.waiting : -1; ends = h && h.waitEnds ? h.waitEnds.length : -1;
        fs.appendFileSync = realAppend;
        const r9 = L2.uh.ingestRemoteEvents(host, 'X', lines([9330]));
        await sleep(20); for (const r of held.splice(0)) r();
        ninth = await Promise.resolve(r9);
      });
      die(L2.uh);
    } finally { fs.promises.open = realOpen; fs.appendFileSync = realAppend; for (const r of held.splice(0)) r(); }
    const busy = !!(ninth && (ninth.holdFailed || []).some((x) => x.error === 'hold-busy'));
    ok(threw === 8 && waiting === 0 && ends === 0 && !busy,
      `㉒ (4) 8 batches whose November append threw ENOSPC while their October waited for its read-back: the hold counts ${waiting} waiting, ${ends} bound(s) after them; the 9th October batch ${ninth ? (ninth.ack ? 'acked' : (ninth.holdFailed || []).map((x) => x.error).join(',') || 'unacked') : '—'} (3c8c0501: 8 waiting for ever, the 9th refused hold-busy with nobody waiting)`,
      { threw, waiting, ends, ninth: ninth && { ack: ninth.ack, holdFailed: ninth.holdFailed } });
  }

  // ── 5. A SET FILE THAT IS NO SET FILE IS UNREAD (claim 0 (f)): a boot with generation 2's set (5) and generation 0's — garbage
  // (binary bytes; {"gone":"33"}), a torn last line, a hole a crash left (NUL bytes) ──
  {
    const host = 'host-x', base = `events-2026-10~${host}`, gone = (n, from) => JSON.stringify({ gone: Array.from({ length: n }, (_, k) => hidOf(from + k, host)) }) + '\n';
    const cases = [
      ['binary bytes', Buffer.from([0, 1, 2, 0xff, 0xfe, 0x7b, 0x7b, 0x7b, 10, 0x67, 0x61, 0x72, 10])],
      ['«gone» no list', '{"gone":"33"}\n{"gone":33}\n'],
      ['a torn last line', gone(10, 9000) + '{"gone":["' + hidOf(9050, host) + '","h:ho'],
      ['a hole before a line', Buffer.concat([Buffer.alloc(16), Buffer.from(gone(7, 9100))])],
    ];
    const got = {};
    for (const [name, body] of cases) {
      const W = world('w22e-' + name.replace(/\W+/g, '-')); fs.mkdirSync(W.heldDir, { recursive: true });
      fs.writeFileSync(path.join(W.heldDir, `${base}.0.dropped`), body); fs.writeFileSync(path.join(W.heldDir, `${base}.2.dropped`), gone(5, 9200));
      const L = W.life(true);
      const [, out] = await watch(async () => { L.wired.reconcile(); await sleep(80); await settle(); });
      const n = said(W, host);
      // r12: an older generation's set that is no set is SET ASIDE (moved, its bytes intact) and said — never kept for the next start
      const aside = (() => { try { return fs.readdirSync(path.join(W.d, 'usage-history', '_set-aside')); } catch { return []; } })();
      const intact = aside.length === 1 && fs.readFileSync(path.join(W.d, 'usage-history', '_set-aside', aside[0])).equals(Buffer.from(body));
      got[name] = { kept: W.heldFiles(host).includes(`${base}.0.dropped`), aside: aside.length, intact, said: out.filter((l) => /\(generation 0, an older one\) (is|are) no record of a set/.test(l)).length, torn: out.some((l) => /generation 0 ends in a torn line/.test(l)), dropped: n && n.dropped, earlier: n && n.earlier };
      die(L.uh);
    }
    const g = (k) => got[k] || {};
    const setAside = (x) => !x.kept && x.aside === 1 && x.intact && x.said === 1;
    ok(setAside(g('binary bytes')) && setAside(g('«gone» no list')) && !g('a torn last line').aside && !g('a hole before a line').aside
      && !g('a torn last line').kept && g('a torn last line').torn && g('a torn last line').earlier === 10 && g('a hole before a line').earlier === 7 && !g('a hole before a line').kept
      && Object.values(got).every((x) => x.dropped === 5),
      `㉒ (5) a set file that is no set file: binary bytes ${setAside(g('binary bytes')) ? 'SET ASIDE (bytes intact) + said once' : g('binary bytes').kept ? 'KEPT in _held/' : 'UNLINKED'}, {"gone":"33"} ${setAside(g('«gone» no list')) ? 'SET ASIDE (bytes intact) + said once' : g('«gone» no list').kept ? 'KEPT in _held/' : 'UNLINKED'}; a torn last line: «Earlier: ${g('a torn last line').earlier}»${g('a torn last line').torn ? ', said torn' : ''}; a hole before a line: «Earlier: ${g('a hole before a line').earlier}» (3c8c0501: the garbage read as 0 and UNLINKED, nothing said; 935a9f0b: KEPT «read again at the next start» — the month's live hold once the newer one ended, ㉓ (2))`,
      got);
  }

  // ── 6. A FOLD KEY NAMES THE SITE (skep10-tracer-two-sites, refute10-tracer-fd-reuse — pure, a fake clock): two sites
  // alternating statSync on one path; a reader after another on a reused fd ──
  {
    const BT = require(REPO + '/src/server/boot-trace.js'), f = path.join(REPO, 'package.json'), here = /test-ledger-whole-law\.mjs:(\d+)/;
    let clock = 0; const ops = [], orig = fs.statSync;
    fs.statSync = function (...a) { clock += 0.4; return orig.apply(this, a); };
    let undo = BT.wrapSync({ ops, now: () => clock, turn: () => 0 });
    const siteA = () => fs.statSync(f);
    const siteB = () => fs.statSync(f);
    try { for (let k = 0; k < 100; k++) { clock += 0.1; siteA(); clock += 0.1; siteB(); } } finally { undo(); fs.statSync = orig; }
    const by = {}; for (const s of BT.sitesOf(ops, { at: 0, ms: 200 }, 5)) { const m = here.exec(s.what); if (m) by[m[1]] = (by[m[1]] || 0) + s.ms; }
    const ops2 = []; let c2 = 0; const realRead = fs.readSync;
    undo = BT.wrapSync({ ops: ops2, now: () => (c2 += 0.2), turn: () => 0 });
    const readerA = (p) => { const fd = fs.openSync(p, 'r'), b = Buffer.alloc(16); try { for (let i = 0; i < 20; i++) fs.readSync(fd, b, 0, 16, 0); } finally { fs.closeSync(fd); } return fd; };
    const readerB = (p) => { const fd = fs.openSync(p, 'r'), b = Buffer.alloc(16); try { for (let i = 0; i < 20; i++) fs.readSync(fd, b, 0, 16, 0); } finally { fs.closeSync(fd); } return fd; };
    let fds; try { fds = [readerA(f), readerB(path.join(REPO, 'src/server/boot-trace.js'))]; } finally { undo(); fs.readSync = realRead; }
    const reads = ops2.filter((o) => o.op === 'fs.readSync').map((o) => ({ n: o.n, line: (here.exec(o.site) || [])[1] }));
    const lines2 = Object.keys(by);
    ok(lines2.length === 2 && Object.values(by).every((ms) => ms >= 30 && ms <= 50) && fds[0] === fds[1] && new Set(reads.map((r) => r.line)).size === 2 && reads.reduce((a, r) => a + r.n, 0) === 40,
      `㉒ (6) the tracer: two sites alternating statSync on one path — ${lines2.length} site(s) named (${Object.entries(by).map(([l, ms]) => `line ${l} ${ms} ms`).join(', ')}); two readers on a reused fd (#${fds[0]}, #${fds[1]}) — ${reads.length} op(s) at ${new Set(reads.map((r) => r.line)).size} site(s) (3c8c0501: one site, credited all 80 ms — the second never named; the second reader's 20 reads folded into the first's op)`,
      { by, reads, fds });
  }

  // ── 7. A LONG TEXT KEYS ITS RUN BY A DIGEST (probe-tracer-json-key3): 40 JSON.parse of 2 MiB texts in ONE turn, traced ──
  {
    const BT = require(REPO + '/src/server/boot-trace.js');
    const v8m = require('v8'), vm = require('vm'); v8m.setFlagsFromString('--expose_gc'); const gc = vm.runInNewContext('gc');
    const mb = () => process.memoryUsage().heapUsed / MiB;
    let clock = 0; const ops = [];
    const undo = BT.wrapSync({ ops, now: () => (clock += 0.01), turn: () => 0 });
    let base, inTurn;
    try { gc(); base = mb(); for (let k = 0; k < 40; k++) { const s = JSON.stringify({ k, pad: 'x'.repeat(2 * MiB) }); JSON.parse(s); } gc(); inTurn = mb(); } finally { undo(); }
    const shown = ops.filter((o) => o.op === 'JSON.parse').map((o) => o.site.length);
    ok(inTurn - base < 32 && shown.every((n) => n < 400),
      `㉒ (7) the tracer: 40 JSON.parse of 2 MiB in one turn — the heap ${Math.round(base)} → ${Math.round(inTurn)} MiB within the turn, ${shown.length} op(s), the longest site ${Math.max(0, ...shown)} chars (3c8c0501: 4 → 166 MiB — each text kept in its run's key)`,
      { base, inTurn, shown });
  }
});
// lane ledger-dedup-law r12 (the acceptance of 935a9f0b — ㉓ fails on 935a9f0b): A LINE THAT IS NO RECORD NEVER BLOCKS
await leg('㉓', async () => {
  console.log('㉓ A LINE THAT IS NO RECORD NEVER BLOCKS — set aside (its bytes intact), said once, the hold goes on · A CUT RECORD IS READ BY THE WRITER\'S GRAMMAR');
  const seams = (uh) => { uh.shapeMaxBytes = 64 * KiB; uh.dedupShard = (f) => { const p = new Promise(() => { }); uh._dedupJobs.set(f, p); return p; }; return uh; };
  const world = (name) => {
    const d = dirOf(name), sh = shardOf(d);
    fs.writeFileSync(sh, Array.from({ length: 400 }, (_, i) => row(i)).join('\n') + '\n');
    const todos = new UserTodoManager({ dataDir: d, expirySweepMs: 0 });
    const W = { d, sh, heldDir: path.join(d, 'usage-history', '_held'), asideDir: path.join(d, 'usage-history', '_set-aside') };
    W.todos = todos;
    W.open = () => todos._state.items.filter((i) => i.sessionKey === 'usage-ledger' && i.status === 'open');
    W.asideItems = () => todos._state.items.filter((i) => i.sessionKey === 'usage-ledger' && String(i.itemKey || '').startsWith('set-aside\n'));
    W.life = (inShape = false) => { const uh = seams(newUh(d)); if (inShape) uh.shapeMaxBytes = 2 * GiB; const wired = LSN.wire({ usageHistory: uh, userTodos: todos, log: () => { }, reconcileAfterMs: null }); return { uh, wired }; };
    W.held = () => (fs.existsSync(W.heldDir) ? fs.readdirSync(W.heldDir).sort() : []);
    W.aside = () => { try { return fs.readdirSync(W.asideDir).sort(); } catch { return []; } };
    W.inLedger = (host) => fs.readFileSync(sh, 'utf8').split('\n').filter((l) => l.includes(`"rid":"h:${host}:`)).length;
    return W;
  };
  const lines = (ids) => ids.map((i) => remote(i)).join('\n') + '\n';
  const die = (uh) => { for (const h of uh._holds.values()) h.io = new Promise(() => { }); uh._holds.clear(); const i = ALL_UH.indexOf(uh); if (i >= 0) ALL_UH.splice(i, 1); if (uh._inflight) uh._inflight.clear(); uh.onShape = null; for (const f of (uh._readFail || new Map()).values()) clearTimeout(f.timer); for (const m of [uh._lines, uh._retries]) for (const s of (m || new Map()).values()) if (s && s.timer) clearTimeout(s.timer); };
  const asideSaid = (out) => out.filter((l) => /no record of a set|\(an older one\) could not be read/.test(l));
  const blocked = (out) => out.filter((l) => /set-garbage|could not be read \(set/.test(l));
  /** a live generation: 20 rows held (acked) out of shape; its set file then given `tail` after one valid line → the gen's set path */
  const liveHold = async (W, host, tail) => {
    const ids = Array.from({ length: 20 }, (_, k) => 9300 + k), L1 = W.life();
    const [a1] = await quiet(() => L1.uh.ingestRemoteEvents(host, 'X', lines(ids)));
    die(L1.uh);
    const seg = W.held().find((f) => f.endsWith('.ndjson')), gen = seg ? Math.floor(Number(seg.split('.')[1]) / 1e6) : 0;
    const df = path.join(W.heldDir, `events-2026-10~${host}.${gen}.dropped`);
    if (tail != null) fs.appendFileSync(df, Buffer.concat([Buffer.from(JSON.stringify({ gone: [hidOf(1, host)] }) + '\n'), Buffer.from(tail)]));
    return { ids, a1, df };
  };

  // ── 1. THE LIVE GENERATION'S GARBAGE LINE (probe-live-set-garbage): 20 rows held and acked; its set file then given a valid
  // line + one that is no record (garbage; a line whose first 16 bytes a crash zeroed; a kind a newer build writes); life 2
  // restarts IN shape with one more October batch; life 3 starts again ──
  {
    const host = 'host-x', got = {};
    const cases = [['a garbage line', 'garbage\n'], ['its first bytes zeroed', Buffer.concat([Buffer.alloc(16), Buffer.from(`"${hidOf(2, host)}"]}\n`)])], ['a kind a newer build writes', '{"moved":["h:host-x:req_00000003"]}\n']];
    for (const [name, tail] of cases) {
      const W = world('w23a-' + name.replace(/\W+/g, '-'));
      const { ids, a1, df } = await liveHold(W, host, tail);
      const before = fs.readFileSync(df);
      const L2 = W.life(true);
      const [a2, out] = await quiet(async () => { L2.wired.reconcile(); await sleep(100); await settle(); return L2.uh.ingestRemoteEvents(host, 'X', lines([9400])); });
      await settle();
      const asides = W.aside(), copy = asides.length === 1 ? fs.readFileSync(path.join(W.asideDir, asides[0])) : null;
      const items = W.asideItems().filter((i) => i.status === 'open');
      const g = got[name] = { acked: !!(a1 && a1.ack && a2 && a2.ack), holdFailed: ((a2 && a2.holdFailed) || []).map((x) => x.error), recorded: W.inLedger(host), of: ids.length + 1, held: W.held(), asides: asides.length, intact: !!copy && copy.equals(before), said: asideSaid(out).length, line: asideSaid(out)[0] || '', blocked: blocked(out).length, item: items.length === 1 ? items[0].detail.split('\n')[0] : items.length, urgency: items[0] && items[0].urgency, permissions: W.open().some((i) => /permissions/.test(i.detail)), readFailed: L2.uh._readFail.size };
      die(L2.uh);
      const L3 = W.life(true);
      const [, out3] = await quiet(async () => { L3.wired.reconcile(); await sleep(60); await settle(); });
      g.life3 = { said: asideSaid(out3).length + blocked(out3).length, held: W.held().length, readFailed: L3.uh._readFail.size, asides: W.aside().length, itemOpen: W.asideItems().filter((i) => i.status === 'open').length };
      die(L3.uh);
    }
    const good = (g) => g.acked && !g.holdFailed.length && g.recorded === g.of && !g.held.length && g.asides === 1 && g.intact && g.said === 1 && !g.blocked
      && /^\[usage\] the hold events-2026-10~host-x: line 2 of events-2026-10~host-x\.\d+\.dropped \(generation \d+\) is no record of a set .* set aside, its bytes intact, as _set-aside\/events-2026-10~host-x\.\d+\.dropped\.\d{8}T\d{6}Z; the set rewritten from its 1 record\(s\) — the hold goes on$/.test(g.line)
      && typeof g.item === 'string' && /^What: line 2 of data\/usage-history\/_held\/events-2026-10~host-x\.\d+\.dropped is no record VibeSpace writes\. VibeSpace kept every other record of the file and set the line aside: the file as it was, bytes intact, is data\/usage-history\/_set-aside\/events-2026-10~host-x\./.test(g.item)
      && g.urgency === 'normal' && !g.permissions && !g.readFailed && !g.life3.said && !g.life3.held && !g.life3.readFailed && g.life3.asides === 1 && g.life3.itemOpen === 1;
    ok(Object.values(got).every(good),
      `㉓ (1) a LIVE generation's set with a line that is no record — ${Object.entries(got).map(([n, g]) => `${n}: ${g.recorded} of ${g.of} rows recorded, every batch ${g.acked && !g.holdFailed.length ? 'acked' : 'NOT acked (' + g.holdFailed.join(',') + ')'}, _held/ ${g.held.length ? 'holds ' + g.held.join(',') : 'empty'}, ${g.asides} file(s) set aside${g.intact ? ' (its bytes intact)' : ''}, said ${g.said}× in the journal, ${typeof g.item === 'string' ? 'its notice names the file + line 2 + the copy' : (g.item || 0) + ' notice(s)'}${g.permissions ? ', «permissions» said' : ''}; life 3 ${g.life3.said || g.life3.held || g.life3.readFailed ? 'NOT clean' : 'clean'} (the notice kept open: ${g.life3.itemOpen})`).join(' · ')} (935a9f0b: the read-back threw set-garbage for ever — 0 of 21 recorded, the batch unacked, «check the file's permissions»)`,
      got);
  }

  // ── 2. AN OLDER GENERATION'S SET NEVER BECOMES THE LIVE ONE (skep11-garbage-resurfaces + -blocks-month): generation 0's set
  // is no set ({"gone":"33"}; 4 rids + binary bytes; a directory) beside generation 2's (5 dropped); life 1 starts in shape,
  // life 2 out of shape with 3 batches, life 3 in shape ──
  {
    const host = 'host-x', base = `events-2026-10~${host}`, got = {};
    const cases = [
      ['{"gone":"33"}', (f) => fs.writeFileSync(f, '{"gone":"33"}\n'), 0],
      ['4 rids + binary bytes', (f) => fs.writeFileSync(f, Buffer.concat([Buffer.from(JSON.stringify({ gone: [1, 2, 3, 4].map((k) => hidOf(9500 + k, host)) }) + '\n'), Buffer.from([1, 2, 0xff, 0xfe, 10])])), 4],
      ['a directory (EISDIR — unreadable)', (f) => fs.mkdirSync(f), 0],
    ];
    for (const [name, make, earlier] of cases) {
      const W = world('w23b-' + name.replace(/\W+/g, '-')); fs.mkdirSync(W.heldDir, { recursive: true });
      const f0 = path.join(W.heldDir, `${base}.0.dropped`); make(f0);
      const bytes0 = fs.statSync(f0).isFile() ? fs.readFileSync(f0) : null;
      fs.writeFileSync(path.join(W.heldDir, `${base}.2.dropped`), JSON.stringify({ gone: [1, 2, 3, 4, 5].map((k) => hidOf(9200 + k, host)) }) + '\n');
      const evs = [], said = [];
      const L1 = W.life(true), on1 = L1.uh.onShape; L1.uh.onShape = (ev) => { evs.push({ life: 1, ...ev }); return on1(ev); };
      const [, out1] = await quiet(async () => { L1.wired.reconcile(); await sleep(80); await settle(); }); said.push(...asideSaid(out1));
      const held1 = W.held(), asides = W.aside();
      const moved = asides.length === 1 ? path.join(W.asideDir, asides[0]) : null;
      const intact = !!moved && (bytes0 ? fs.statSync(moved).isFile() && fs.readFileSync(moved).equals(bytes0) : fs.statSync(moved).isDirectory());
      die(L1.uh);
      const L2 = W.life(false), acks = [];
      const [, out2] = await quiet(async () => { L2.wired.reconcile(); await sleep(60); await settle(); for (let i = 0; i < 3; i++) acks.push(await L2.uh.ingestRemoteEvents(host, 'X', lines([9600 + 2 * i, 9601 + 2 * i]))); });
      said.push(...asideSaid(out2));
      const failed2 = L2.uh._readFail.size + blocked(out2).length;
      die(L2.uh);
      const L3 = W.life(true);
      const [, out3] = await quiet(async () => { L3.wired.reconcile(); await sleep(100); await settle(); }); said.push(...asideSaid(out3));
      const g = got[name] = { held1, asides: asides.length, intact, dropped: evs.filter((e) => e.kind === 'dropped').map((e) => `${e.gen}:${e.dropped}`).sort().join(','), said: said.length, line: said[0] || '', acks: acks.map((a) => !!(a && a.ack) && !((a && a.holdFailed) || []).length), failed2, failed3: L3.uh._readFail.size + blocked(out3).length, recorded3: W.inLedger(host), held3: W.held(), item: (W.asideItems()[0] || {}).text || '' };
      g.earlier = earlier;
      die(L3.uh);
    }
    const good = (g) => !g.held1.length && g.asides === 1 && g.intact && g.said === 1 && g.dropped === (g.earlier ? `0:${g.earlier},2:5` : '2:5') && g.acks.length === 3 && g.acks.every(Boolean) && !g.failed2 && !g.failed3 && g.recorded3 === 6 && !g.held3.length && /set aside/.test(g.item);
    ok(Object.values(got).every(good),
      `㉓ (2) an OLDER generation's set that is no set, across three lives — ${Object.entries(got).map(([n, g]) => `${n}: life 1 set it aside (${g.asides} file${g.intact ? ', bytes intact' : ''}; _held/ ${g.held1.length ? 'holds ' + g.held1.join(',') : 'empty'}; counts said ${g.dropped}), said ${g.said}× over 3 lives; life 2 out of shape: ${g.acks.filter(Boolean).length} of 3 batches acked${g.failed2 ? ', a read-back FAILED' : ''}; life 3: ${g.failed3 ? 'a read-back FAILED' : 'clean'}, ${g.recorded3} of 6 rows recorded, _held/ ${g.held3.length ? 'holds ' + g.held3.join(',') : 'empty'}`).join(' · ')} (935a9f0b: the file kept «read again at the next start», life 2 read it as the month's live hold — 0 of 3 acked, set-garbage at every start)`,
      got);
  }

  // ── 3. A CUT RECORD IS READ BY THE WRITER'S GRAMMAR (skep11-one-byte-cut): the set's reader over the shapes a cut leaves, and
  // OUR OWN WRITER leaving one — a mark that landed 1 byte (ENOSPC) and whose cut-back failed (EIO), then the next mark ──
  {
    const host = 'host-x', W = world('w23c'), RD = W.life(true).uh;
    const rec = JSON.stringify({ gone: [hidOf(1, host), hidOf(2, host)] }) + '\n', f = path.join(W.d, 'case.dropped');
    const cases = [
      ['«{"»', rec + '{"', 'cut'], ['«{»', rec + '{', 'cut'], ['«{» then the next record on its own line', rec + '{\n' + JSON.stringify({ below: 3 }) + '\n', 'cut'], ['a hole, then «{»', rec + '\0\0\0\0{', 'cut'],
      ['a 120-byte tail cut mid-rid', rec + '{"gone":["' + hidOf(3, host) + '","' + hidOf(4, host) + '","' + hidOf(5, host) + '","h:host-x:req_000', 'cut'],
      ['a tail «{"…» with garbage past its 64th byte', rec + '{"gone":["' + 'a'.repeat(70) + '"]}garbage', 'bad'],
      ['«{"gone":"33"}»', rec + '{"gone":"33"}\n', 'bad'],
    ];
    const got = {};
    for (const [name, body, want] of cases) {
      fs.writeFileSync(f, body);
      let r; try { const s = await RD._readSet(f); r = s.bad && s.bad.length ? 'bad' : s.torn ? 'cut' : 'whole'; if (s.gone.size !== 2) r += ` (gone ${s.gone.size})`; } catch (e) { r = `THROWS ${e.code}`; }
      got[name] = { want, got: r };
    }
    die(RD);
    // our own writer: a live hold of 2 rows out of shape; a `checked` mark lands 1 byte and fails (ENOSPC), its cut-back fails
    // (EIO); the next mark goes on its own line ⇒ «…{\n{"checked":2}\n»; a restart out of shape takes a batch
    const W2 = world('w23c-writer'), { df } = await liveHold(W2, host, null);
    const fp = fs.promises, realAppend = fp.appendFile, realTrunc = fp.truncate;
    const L1 = W2.life();
    let set = '', a2 = null, out2 = [];
    try {
      await quiet(async () => { L1.wired.reconcile(); await sleep(60); await settle(); });
      const h = L1.uh._holds.get(`events-2026-10~${host}`);
      fs.writeFileSync(df, rec); h.goneBytes = rec.length; // its set: 2 dropped
      let once = true;
      fp.appendFile = async (p, text) => { if (once && String(p) === df) { once = false; await realAppend(p, String(text).slice(0, 1)); throw Object.assign(new Error('ENOSPC: no space left on device'), { code: 'ENOSPC' }); } return realAppend(p, text); };
      fp.truncate = async (p, n) => { if (String(p) === df) throw Object.assign(new Error('EIO: i/o error'), { code: 'EIO' }); return realTrunc(p, n); };
      await L1.uh._holdMark(h, { checked: 2 }); await L1.uh._holdMark(h, { checked: 2 });
    } finally { fp.appendFile = realAppend; fp.truncate = realTrunc; }
    set = fs.readFileSync(df, 'utf8');
    die(L1.uh);
    const L2 = W2.life();
    [a2, out2] = await quiet(async () => { L2.wired.reconcile(); await sleep(60); await settle(); return L2.uh.ingestRemoteEvents(host, 'X', lines([9700])); });
    const writer = { set, ack: !!(a2 && a2.ack), holdFailed: ((a2 && a2.holdFailed) || []).map((x) => x.error), readFailed: L2.uh._readFail.size, aside: asideSaid(out2).length + blocked(out2).length, gone: (L2.uh._holds.get(`events-2026-10~${host}`) || { gone: new Set() }).gone.size };
    die(L2.uh);
    ok(Object.values(got).every((x) => x.got === x.want) && writer.set === rec + '{\n{"checked":2}\n' && writer.ack && !writer.holdFailed.length && !writer.readFailed && !writer.aside && writer.gone === 2,
      `㉓ (3) the set's reader by the writer's grammar — ${Object.entries(got).map(([n, x]) => `${n}: ${x.got}${x.got === x.want ? '' : ' (want ' + x.want + ')'}`).join(' · ')}; OUR writer's own one-byte cut (${JSON.stringify(writer.set.slice(rec.length))}): a restart out of shape ${writer.ack ? 'acks' : 'does NOT ack'} the batch${writer.holdFailed.length ? ' (' + writer.holdFailed.join(',') + ')' : ''}, ${writer.gone} dropped read back, ${writer.aside ? 'said garbage' : 'nothing set aside'} (935a9f0b: «{» and «{\\n{…}» threw set-garbage — the live hold failed for ever; a «{"» tail with garbage after its 64th byte read as cut)`,
      { got, writer });
  }

  // ── 4. THE WORDS, THE BOUND, A SET-ASIDE THAT FAILS, A SECOND ONE: _set-aside full (SET_ASIDE_MAX files) ⇒ no copy, the set
  // rewritten all the same; _set-aside unwritable (a FILE of that name) ⇒ read past, the file kept as it is — the hold goes
  // on in both; a second line set aside on the same hold re-words its ONE notice (reopened once read) ──
  {
    const host = 'host-x', RD = require(REPO + '/src/usage-hold-road.js'), MAX = RD.SET_ASIDE_MAX || 64, got = {};
    for (const [name, prep] of [['_set-aside full', (W) => { fs.mkdirSync(W.asideDir, { recursive: true }); for (let k = 0; k < MAX; k++) fs.writeFileSync(path.join(W.asideDir, `old-${k}`), ''); }], ['_set-aside unwritable', (W) => fs.writeFileSync(W.asideDir, 'a file where the folder goes')]]) {
      const W = world('w23d-' + name.replace(/\W+/g, '-'));
      const { ids, df } = await liveHold(W, host, 'garbage\n');
      prep(W);
      const L2 = W.life(true);
      const [a2, out] = await quiet(async () => { L2.wired.reconcile(); await sleep(100); await settle(); return L2.uh.ingestRemoteEvents(host, 'X', lines([9400])); });
      await settle();
      const item = W.asideItems()[0];
      got[name] = { ack: !!(a2 && a2.ack), recorded: W.inLedger(host), of: ids.length + 1, line: asideSaid(out)[0] || '', said: asideSaid(out).length, item: item ? item.detail.split('\n')[0] : '', readFailed: L2.uh._readFail.size };
      die(L2.uh);
    }
    // a second setting-aside on one hold: the owner reads the first notice (done), a later line lands in the same hold's set
    const W = world('w23d-second');
    await liveHold(W, host, 'garbage one\n');
    const L2 = W.life(false); await quiet(async () => { L2.wired.reconcile(); await sleep(80); await settle(); });
    const first = W.asideItems()[0], firstDetail = first && first.detail; if (first) W.todos.setStatus(first.id, 'done', 'owner');
    const df2 = path.join(W.heldDir, W.held().find((n) => n.endsWith('.dropped')) || 'none');
    die(L2.uh);
    fs.appendFileSync(df2, 'garbage two\n');
    const L3 = W.life(false); const [, out3] = await quiet(async () => { L3.wired.reconcile(); await sleep(80); await settle(); });
    const items = W.asideItems(), again = items[0];
    const second = { items: items.length, reopened: !!again && again.status === 'open', reworded: !!again && firstDetail !== again.detail, said: asideSaid(out3).length, asides: W.aside().length };
    die(L3.uh);
    const g = (k) => got[k] || {};
    ok(g('_set-aside full').ack && g('_set-aside full').recorded === g('_set-aside full').of && /not copied \(_set-aside holds \d+ files, its bound\); the set rewritten from its 1 record\(s\) — the hold goes on/.test(g('_set-aside full').line) && /already holds \d+ files, so no copy of it was kept/.test(g('_set-aside full').item)
      && g('_set-aside unwritable').ack && g('_set-aside unwritable').recorded === g('_set-aside unwritable').of && /it could not be set aside \(E[A-Z]+\); read past those lines \(the file kept as it is; set aside at its next read\) — the hold goes on/.test(g('_set-aside unwritable').line) && /read past the line; it could not set the file aside \(E[A-Z]+\)/.test(g('_set-aside unwritable').item)
      && Object.values(got).every((x) => x.said === 1 && !x.readFailed)
      && second.items === 1 && second.reopened && second.reworded && second.said === 1 && second.asides === 2,
      `㉓ (4) the words — the bound: ${g('_set-aside full').recorded} of ${g('_set-aside full').of} recorded, «${(g('_set-aside full').line.split(' — ')[1] || '').slice(0, 120)}»; an unwritable _set-aside: ${g('_set-aside unwritable').recorded} of ${g('_set-aside unwritable').of} recorded, «${(g('_set-aside unwritable').line.split(' — ')[1] || '').slice(0, 140)}»; a second line on one hold: ${second.items} notice (${second.reopened ? 'reopened' : 'NOT reopened'}, ${second.reworded ? 're-worded' : 'NOT re-worded'}), ${second.asides} copies (935a9f0b: every one of these blocked the month — set-garbage)`,
      { got, second });
  }

  // ── 5. A FILING WITHOUT A KEY NEVER MERGES INTO A KEYED ITEM (the r11 claim runner: lane r6's `!i.itemKey` guard on add()'s
  // unkeyed find was pinned by no suite — without it a text twin is folded into the keyed notice and its identity is lost) ──
  {
    const d = dirOf('w23e'), todos = new UserTodoManager({ dataDir: d, expirySweepMs: 0 });
    const words = { origin: 'server', kind: 'notice', urgency: 'high', by: 'agent', sessionName: 'Usage', text: 'Usage of X for 2026-10 is held — the usage ledger file events-2026-10.ndjson is out of shape' };
    const keyed = todos.add('usage-ledger', { ...words, itemKey: 'host-x\nevents-2026-10.ndjson' });
    const plain = todos.add('usage-ledger', { ...words }), again = todos.add('usage-ledger', { ...words });
    const items = todos._state.items.filter((i) => i.sessionKey === 'usage-ledger');
    ok(!!keyed && !!plain && keyed.id !== plain.id && plain.id === again.id && items.length === 2 && items.filter((i) => i.itemKey).length === 1,
      `㉓ (5) a filing with the words of a KEYED notice and no key: ${keyed && plain && keyed.id !== plain.id ? 'a new item' : 'MERGED into the keyed one'} (a second such filing ${plain && again && plain.id === again.id ? 'joins it' : 'does NOT join it'}) — ${items.length} item(s), ${items.filter((i) => i.itemKey).length} keyed (without lane r6's \`!i.itemKey\` guard: one item, the keyed notice taken by a text twin)`,
      { keyed: keyed && keyed.id, plain: plain && plain.id, again: again && again.id, n: items.length });
  }
});
// lane ledger-dedup-law r14 (the acceptance of 7da5b435 — ㉔ fails on a1d92418): THE ERROR'S CLASS DECIDES, NEVER THE FILE'S AGE
await leg('㉔', async () => {
  console.log('㉔ THE ERROR\'S CLASS DECIDES, NEVER THE FILE\'S AGE — one classifier for a set whose read throws, on both roads · THE WORDS FOLLOW THE EVENT');
  const RD = require(REPO + '/src/usage-hold-road.js');
  const seams = (uh) => { uh.shapeMaxBytes = 64 * KiB; uh.holdListRetryMs = 60; uh.dedupShard = (f) => { const p = new Promise(() => { }); uh._dedupJobs.set(f, p); return p; }; return uh; };
  const world = (name) => {
    const d = dirOf(name), sh = shardOf(d);
    fs.writeFileSync(sh, Array.from({ length: 400 }, (_, i) => row(i)).join('\n') + '\n');
    const todos = new UserTodoManager({ dataDir: d, expirySweepMs: 0 });
    const W = { d, sh, todos, heldDir: path.join(d, 'usage-history', '_held'), asideDir: path.join(d, 'usage-history', '_set-aside') };
    W.items = () => todos._state.items.filter((i) => i.sessionKey === 'usage-ledger');
    W.asideItems = () => W.items().filter((i) => String(i.itemKey || '').startsWith('set-aside\n'));
    W.life = (inShape = false) => { const uh = seams(newUh(d)); if (inShape) uh.shapeMaxBytes = 2 * GiB; const wired = LSN.wire({ usageHistory: uh, userTodos: todos, log: () => { }, reconcileAfterMs: null }); const evs = []; const on = uh.onShape; uh.onShape = (ev) => { evs.push(ev); return on(ev); }; return { uh, wired, evs }; };
    W.held = () => (fs.existsSync(W.heldDir) ? fs.readdirSync(W.heldDir).sort() : []);
    W.aside = () => { try { return fs.readdirSync(W.asideDir).sort(); } catch { return []; } };
    W.inLedger = (host) => fs.readFileSync(sh, 'utf8').split('\n').filter((l) => l.includes(`"rid":"h:${host}:`)).length;
    return W;
  };
  const lines = (ids) => ids.map((i) => remote(i)).join('\n') + '\n';
  const die = (uh) => { for (const h of uh._holds.values()) h.io = new Promise(() => { }); uh._holds.clear(); const i = ALL_UH.indexOf(uh); if (i >= 0) ALL_UH.splice(i, 1); if (uh._inflight) uh._inflight.clear(); uh.onShape = null; for (const f of (uh._readFail || new Map()).values()) clearTimeout(f.timer); for (const m of [uh._lines, uh._retries]) for (const s of (m || new Map()).values()) if (s && s.timer) clearTimeout(s.timer); };
  const realOpen = fs.promises.open, realWrite = fs.promises.writeFile, realUnlink = fs.promises.unlink;
  /** every open of `file` refused with `code` (`once`: the first only) → undo */
  const refuse = (file, code, once = false) => { let n = 0; fs.promises.open = function (f, ...a) { if (String(f) === file && (!once || !n++)) return Promise.reject(Object.assign(new Error(`${code}: injected, open '${file}'`), { code, path: file })); return realOpen.call(this, f, ...a); }; return () => { fs.promises.open = realOpen; }; };
  const keptSaid = (out) => out.filter((l) => /could not be read \([A-Z]+: [^)]*\) — kept, read again at the next start/.test(l));
  const host = 'host-x', base = `events-2026-10~${host}`;
  const sets = (W) => { fs.mkdirSync(W.heldDir, { recursive: true }); const f0 = path.join(W.heldDir, `${base}.0.dropped`); fs.writeFileSync(f0, JSON.stringify({ gone: [1, 2, 3, 4, 5, 6, 7].map((k) => hidOf(9100 + k, host)) }) + '\n'); fs.writeFileSync(path.join(W.heldDir, `${base}.2.dropped`), JSON.stringify({ gone: [1, 2, 3, 4, 5].map((k) => hidOf(9200 + k, host)) }) + '\n'); return f0; };
  const droppedOf = (evs) => evs.filter((e) => e.kind === 'dropped').map((e) => `${e.gen}:${e.dropped}`).sort().join(',');

  // ── 1. THE ONE CLASSIFIER (PURE): what passes, what the disk refuses, and what may pass once (EIO, a code no list knows) ──
  {
    const want = { EMFILE: 'passes', ENFILE: 'passes', ENOMEM: 'passes', ESTALE: 'passes', ETIMEDOUT: 'passes', EAGAIN: 'passes', EBUSY: 'passes', EACCES: 'refused', EISDIR: 'refused', ENOTDIR: 'refused', ENXIO: 'refused', EIO: 'once', EPERM: 'once', 'EWHATEVER': 'once' };
    const got = Object.fromEntries(Object.keys(want).map((c) => [c, typeof RD.setReadClass === 'function' ? RD.setReadClass(c) : 'NO CLASSIFIER']));
    ok(Object.keys(want).every((c) => got[c] === want[c]),
      `㉔ (1) ONE classifier for a set whose read throws — ${['passes', 'refused', 'once'].map((k) => `${k}: ${Object.keys(got).filter((c) => got[c] === k).join(' ') || '—'}`).join(' · ')}${Object.values(got).includes('NO CLASSIFIER') ? ' (a1d92418: NO CLASSIFIER — the file\'s age decided)' : ''}`, got);
  }

  // ── 2. AN OLDER GENERATION'S SET, ITS READ FAILING WITH WHAT PASSES (corr/emfile-older-gen + probe-stale-transient-eio): gen 0
  // (7 dropped) beside gen 2 (5); life 1 in shape, every open of gen 0 refused — and the month held again in that life (a second
  // read, the same error); life 2 none ⇒ kept, said once, its 7 said at life 2 ──
  {
    const got = {};
    for (const code of ['EMFILE', 'ENFILE', 'ENOMEM', 'ESTALE', 'ETIMEDOUT', 'EAGAIN', 'EBUSY', 'EIO']) {
      const W = world('w24b-' + code), f0 = sets(W);
      const L1 = W.life(true), undo = refuse(f0, code);
      let out1 = [];
      try { [, out1] = await quiet(async () => { L1.wired.reconcile(); await sleep(60); await settle(); L1.uh.shapeMaxBytes = 64 * KiB; await L1.uh.ingestRemoteEvents(host, 'X', lines([9300, 9301])); await settle(); }); } finally { undo(); }
      const g = got[code] = { kept1: W.held().includes(`${base}.0.dropped`), marked1: W.held().includes(`${base}.0.dropped.unread`), asides1: W.aside().length, said1: keptSaid(out1).length, dropped1: droppedOf(L1.evs) };
      die(L1.uh);
      const L2 = W.life(true);
      await quiet(async () => { L2.wired.reconcile(); await sleep(80); await settle(); });
      g.dropped2 = droppedOf(L2.evs); g.held2 = W.held(); g.asides2 = W.aside().length; g.earlier = W.items().some((i) => /(^|,)0:7(,|$)/.test(String((((i.i18n || {}).text || {}).params || {}).ended || '')) || /: 7 held events were dropped|the 7 oldest held events/.test(`${i.text}\n${i.detail}`)); // generation 0's 7 — its own entry (the «Earlier» line sums the ended ones)
      die(L2.uh);
    }
    const good = (c, g) => g.kept1 && g.marked1 === (c === 'EIO') && !g.asides1 && g.said1 === 1 && g.dropped1 === '2:5' && g.dropped2.split(',').includes('0:7') && !g.held2.length && !g.asides2 && g.earlier;
    ok(Object.entries(got).every(([c, g]) => good(c, g)),
      `㉔ (2) an OLDER generation's set whose read fails with what passes — ${Object.entries(got).map(([c, g]) => `${c}: life 1 ${g.kept1 ? 'KEPT' : 'NOT kept'}${g.marked1 ? ' + marked' : ''}${g.asides1 ? `, ${g.asides1} SET ASIDE` : ''}, said ${g.said1}× over two reads; life 2 said ${g.dropped2 || 'nothing'}${g.earlier ? ' («7» in its notice)' : ''}, _held/ ${g.held2.length ? 'holds ' + g.held2.join(',') : 'empty'}`).join(' · ')} (a1d92418: moved aside unread at life 1 — «its count is not known», the 7 never said)`,
      got);
  }

  // ── 3. THE DISK'S REFUSAL SETS IT ASIDE UNREAD (EACCES, ENOTDIR, ENXIO — injected; EISDIR — a directory) and an EIO at TWO
  // starts (marked at the first, set aside at the second, said as the disk's answer); a third start is clean ──
  {
    const got = {};
    for (const code of ['EACCES', 'ENOTDIR', 'ENXIO', 'EISDIR', 'EIO twice']) {
      const W = world('w24c-' + code.replace(/\W+/g, '-')), f0 = sets(W);
      if (code === 'EISDIR') { fs.rmSync(f0); fs.mkdirSync(f0); }
      const bytes0 = code === 'EISDIR' ? null : fs.readFileSync(f0), lifeOf = [];
      for (let n = 1; n <= 3; n++) {
        const L = W.life(true), undo = code === 'EISDIR' || n === 3 || (code !== 'EIO twice' && n > 1) ? () => { } : refuse(f0, code === 'EIO twice' ? 'EIO' : code);
        let out = [];
        try { [, out] = await quiet(async () => { L.wired.reconcile(); await sleep(80); await settle(); }); } finally { undo(); }
        lifeOf.push({ held: W.held(), asides: W.aside(), kept: keptSaid(out).length, unread: out.filter((l) => /could not be read \(E[A-Z]+/.test(l) && /set aside, its bytes intact/.test(l)).length, twice: out.some((l) => /at a start before this one too/.test(l)) });
        die(L.uh);
      }
      const it = W.asideItems()[0], moved = W.aside()[0] ? path.join(W.asideDir, W.aside()[0]) : null;
      got[code] = { lifeOf, item: it ? it.text : '', twiceLine: !!it && /could not be read at the start before this one either/.test(it.detail), nowLine: !!it && /misses the ones this file named/.test(it.detail), intact: !!moved && (bytes0 ? fs.readFileSync(moved).equals(bytes0) : fs.statSync(moved).isDirectory()) };
    }
    const good = (c, g) => {
      const [a, b, z] = g.lifeOf, at = c === 'EIO twice' ? 1 : 0, setAt = g.lifeOf[at];
      return setAt.asides.length === 1 && setAt.unread === 1 && !setAt.held.includes(`${base}.0.dropped`) && g.intact && /could not be read \(E[A-Z]+\) — set aside unread; nothing waits/.test(g.item) && g.nowLine
        && (c === 'EIO twice' ? a.kept === 1 && a.held.includes(`${base}.0.dropped.unread`) && !a.asides.length && setAt.twice && g.twiceLine && !setAt.held.some((f) => f.endsWith('.unread')) : !g.twiceLine)
        && !z.kept && !z.unread && !z.held.length && z.asides.length === 1 && (c === 'EIO twice' || (!b.kept && !b.unread));
    };
    ok(Object.entries(got).every(([c, g]) => good(c, g)),
      `㉔ (3) the disk's refusal — ${Object.entries(got).map(([c, g]) => `${c}: ${g.lifeOf.map((l, i) => `life ${i + 1} ${l.unread ? 'SET ASIDE unread' : l.kept ? 'kept' + (l.held.some((f) => f.endsWith('.unread')) ? ' + marked' : '') : l.held.length ? 'holds ' + l.held.join(',') : 'clean'}`).join(', ')}${g.intact ? ' (bytes intact)' : ''}${g.twiceLine ? ', said as the disk\'s answer' : ''}`).join(' · ')} (a1d92418: every one set aside at life 1 — an EIO too)`,
      got);
  }

  // ── 4. THE LIVE ROAD, THE SAME CLASSIFIER: a live hold (20 rows held, 3 dropped said in its notice by a restart); then a restart
  // out of shape whose read of the live set fails — EMFILE (once: r9's state, read again by its timer), EACCES (set aside unread
  // at once: the month acked, the notice's 3 kept as «Earlier»), EIO at two starts (r9's state + marked, then set aside) ──
  {
    const got = {};
    for (const code of ['EMFILE', 'EACCES', 'EIO']) {
      const W = world('w24d-' + code), ids = Array.from({ length: 20 }, (_, k) => 9300 + k), L1 = W.life();
      await quiet(() => L1.uh.ingestRemoteEvents(host, 'X', lines(ids)));
      die(L1.uh);
      const seg = W.held().find((f) => f.endsWith('.ndjson')), gen = seg ? Math.floor(Number(seg.split('.')[1]) / 1e6) : 0;
      const df = path.join(W.heldDir, `${base}.${gen}.dropped`);
      fs.appendFileSync(df, JSON.stringify({ gone: [1, 2, 3].map((k) => hidOf(8800 + k, host)) }) + '\n');
      const L2 = W.life(); await quiet(async () => { L2.wired.reconcile(); await sleep(60); await settle(); }); // the 3 said
      const said3 = W.items().some((x) => /the 3 oldest held events/.test(x.detail));
      die(L2.uh);
      const g = got[code] = { said3, lives: [] };
      for (let n = 3; n <= (code === 'EIO' ? 4 : 3); n++) {
        const L = W.life(), undo = refuse(df, code, code === 'EMFILE'); // the fault for the whole start (EMFILE: its first open)
        const acks = []; let late = null;
        try {
          await quiet(async () => { L.wired.reconcile(); await sleep(40); await settle(); for (let k = 0; k < 2; k++) acks.push(await L.uh.ingestRemoteEvents(host, 'X', lines([9400 + 2 * n + k]))); });
          await sleep(120); await settle(); // r9's timer (60 ms) reads it again
          [late] = await quiet(() => L.uh.ingestRemoteEvents(host, 'X', lines([9500 + n])));
        } finally { undo(); }
        const item = W.items().find((x) => !/^(hold-read|set-aside)\n/.test(String(x.itemKey || '')) && x.i18n && x.i18n.text && x.i18n.text.params && x.i18n.text.params.host === host);
        g.lives.push({ acks: acks.map((a) => !!(a && a.ack) && !((a && a.holdFailed) || []).length), late: !!(late && late.ack), asides: W.aside().length, marked: W.held().some((f) => f.endsWith('.unread')), readItems: W.items().filter((i) => String(i.itemKey || '').startsWith('hold-read\n') && i.status === 'open').length, asideItem: (W.asideItems()[0] || {}).text || '', earlier3: !!item && /Earlier: 3 held events/.test(item.detail), gone: (L.uh._holds.get(base) || { gone: new Set() }).gone.size });
        die(L.uh);
      }
    }
    const e = got.EMFILE, a = got.EACCES, i = got.EIO;
    const okE = e.said3 && !e.lives[0].acks.some(Boolean) && e.lives[0].late && !e.lives[0].asides && e.lives[0].gone === 3;
    const okA = a.said3 && a.lives[0].acks.every(Boolean) && a.lives[0].asides === 1 && /could not be read \(EACCES\) — set aside unread/.test(a.lives[0].asideItem) && !a.lives[0].readItems && a.lives[0].earlier3;
    const okI = i.said3 && !i.lives[0].acks.some(Boolean) && i.lives[0].marked && !i.lives[0].asides && i.lives[1].acks.every(Boolean) && i.lives[1].asides === 1 && !i.lives[1].marked && /could not be read \(EIO\) — set aside unread/.test(i.lives[1].asideItem) && i.lives[1].earlier3;
    ok(okE && okA && okI,
      `㉔ (4) the LIVE road, the same classifier — EMFILE: ${e.lives[0].acks.filter(Boolean).length} of 2 acked while it failed, read again by its timer ⇒ the next batch ${e.lives[0].late ? 'acked' : 'NOT acked'}, ${e.lives[0].asides} set aside, its count ${e.lives[0].gone} kept · EACCES: ${a.lives[0].acks.filter(Boolean).length} of 2 acked at once, ${a.lives[0].asides} set aside unread, ${a.lives[0].readItems} hold-read notice(s), the notice's 3 ${a.lives[0].earlier3 ? 'kept as «Earlier»' : 'NOT kept'} · EIO: start 1 ${i.lives[0].acks.filter(Boolean).length} of 2 acked${i.lives[0].marked ? ', marked' : ''}; start 2 ${i.lives[1].acks.filter(Boolean).length} of 2 acked, ${i.lives[1].asides} set aside unread${i.lives[1].earlier3 ? ', the 3 kept as «Earlier»' : ''} (a1d92418: every live read error retried — EACCES unacked for ever — while an older one's was set aside)`,
      got);
  }

  // ── 5. THE WORDS FOLLOW THE EVENT (probe-aside-words): a bad line in a set, then what the disk could do — each notice's headline
  // says «set aside» only when a copy IS there, its What line says what became of the file and the line ──
  {
    const P = fs.promises, got = {};
    const fill = (W) => { fs.mkdirSync(W.asideDir, { recursive: true }); for (let k = 0; k < (RD.SET_ASIDE_MAX || 64); k++) fs.writeFileSync(path.join(W.asideDir, `old-${k}`), ''); };
    const cases = [
      ['live, copied + rewritten', false, () => { }],
      ['live, the copy refused (EEXIST)', false, (W) => fs.writeFileSync(W.asideDir, 'a file where the folder goes')],
      ['live, copied, the rewrite failed (EIO)', false, () => { P.writeFile = function (p, ...x) { if (String(p).endsWith('.dropped.tmp')) return Promise.reject(Object.assign(new Error('EIO: injected'), { code: 'EIO' })); return realWrite.call(this, p, ...x); }; }],
      ['live, past the bound, rewritten', false, fill],
      ['live, past the bound, the rewrite failed (EIO)', false, (W) => { fill(W); P.writeFile = function (p, ...x) { if (String(p).endsWith('.dropped.tmp')) return Promise.reject(Object.assign(new Error('EIO: injected'), { code: 'EIO' })); return realWrite.call(this, p, ...x); }; }],
      ['older, moved', true, () => { }],
      ['older, past the bound, removed', true, fill],
      ['older, past the bound, its unlink failed (EBUSY)', true, (W, f) => { fill(W); P.unlink = function (p, ...x) { if (String(p) === f) return Promise.reject(Object.assign(new Error('EBUSY: injected'), { code: 'EBUSY' })); return realUnlink.call(this, p, ...x); }; }],
    ];
    for (const [name, older, fault] of cases) {
      const W = world('w24e-' + name.replace(/\W+/g, '-')); fs.mkdirSync(W.heldDir, { recursive: true });
      const f = path.join(W.heldDir, `${base}.${older ? 0 : 2}.dropped`);
      fs.writeFileSync(f, JSON.stringify({ gone: [1, 2, 3].map((k) => hidOf(9500 + k, host)) }) + '\n' + 'GARBAGE-LINE\n');
      if (older) fs.writeFileSync(path.join(W.heldDir, `${base}.2.dropped`), JSON.stringify({ gone: [1, 2].map((k) => hidOf(9200 + k, host)) }) + '\n');
      const L = W.life(false); let at = null, before = 0;
      const on = L.uh.onShape; L.uh.onShape = (ev) => { if (ev.kind === 'set-aside') at = { file: fs.existsSync(f) ? fs.readFileSync(f, 'latin1') : null, copies: W.aside().length - before }; return on(ev); };
      try { fault(W, f); before = W.aside().length; await quiet(async () => { L.wired.reconcile(); await sleep(80); await settle(); }); } finally { P.writeFile = realWrite; P.unlink = realUnlink; }
      const it = W.asideItems()[0], what = it ? it.detail.split('\n')[0] : '';
      const copy = !!at && at.copies > 0, still = !!at && at.file != null && at.file.includes('GARBAGE'), goneFile = !!at && at.file == null;
      const headOk = !!it && (copy ? /— set aside; nothing waits$/.test(it.text) : /— read past it; nothing waits$/.test(it.text));
      const whatOk = still ? /still in the file|read past the line/.test(what) && !/removed the line|set the line aside|removed the file/.test(what)
        : goneFile ? (older ? (copy ? /moved the file as it was/ : /then removed the file/).test(what) : false)
          : /removed the line|set the line aside/.test(what);
      got[name] = { copy, still, goneFile, headOk, whatOk, text: it ? it.text.split(' — ')[1] : 'NO NOTICE', what: what.slice(0, 160) };
      die(L.uh);
    }
    ok(Object.values(got).every((g) => g.headOk && g.whatOk),
      `㉔ (5) the words follow the event — ${Object.entries(got).map(([n, g]) => `${n}: «${g.text}»${g.headOk && g.whatOk ? '' : ' ✗ (' + (g.copy ? 'a copy' : 'no copy') + ', ' + (g.goneFile ? 'the file gone' : g.still ? 'the line still in it' : 'the line gone') + ': «' + g.what + '»)'}`).join(' · ')} (a1d92418: «set aside» with no copy, «removed the line» with the line still in, «kept every other record» for a file deleted)`,
      got);
  }
});
// lane ledger-dedup-law r15 (the acceptance of f3027952 — ㉕ fails on f3027952): THE HOLD IS READ WHOLE BEFORE ANYTHING IS DECIDED
await leg('㉕', async () => {
  console.log('㉕ THE HOLD IS READ WHOLE BEFORE ANYTHING IS DECIDED — one classification over the whole hold, one notice · A COUNT NOBODY CHECKED IS «NOT KNOWN» · A CODELESS ERROR PASSES');
  const RD = require(REPO + '/src/usage-hold-road.js');
  const seams = (uh) => { uh.shapeMaxBytes = 64 * KiB; uh.holdListRetryMs = 60; uh.dedupShard = (f) => { const p = new Promise(() => { }); uh._dedupJobs.set(f, p); return p; }; return uh; };
  const world = (name) => {
    const d = dirOf(name), sh = shardOf(d);
    fs.writeFileSync(sh, Array.from({ length: 400 }, (_, i) => row(i)).join('\n') + '\n');
    const todos = new UserTodoManager({ dataDir: d, expirySweepMs: 0 });
    const W = { d, sh, todos, heldDir: path.join(d, 'usage-history', '_held'), asideDir: path.join(d, 'usage-history', '_set-aside') };
    W.items = () => todos._state.items.filter((i) => i.sessionKey === 'usage-ledger');
    W.open = (kind) => W.items().filter((i) => String(i.itemKey || '').startsWith(kind + '\n') && i.status === 'open').length;
    W.month = () => W.items().find((x) => !/^(hold-read|set-aside)\n/.test(String(x.itemKey || '')) && x.i18n && x.i18n.text && x.i18n.text.params && x.i18n.text.params.host === host);
    W.life = (inShape = false) => { const uh = seams(newUh(d)); if (inShape) uh.shapeMaxBytes = 2 * GiB; const wired = LSN.wire({ usageHistory: uh, userTodos: todos, log: () => { }, reconcileAfterMs: null }); const evs = []; const on = uh.onShape; uh.onShape = (ev) => { evs.push(ev); return on(ev); }; return { uh, wired, evs }; };
    W.held = () => (fs.existsSync(W.heldDir) ? fs.readdirSync(W.heldDir).sort() : []);
    W.aside = () => { try { return fs.readdirSync(W.asideDir).sort(); } catch { return []; } };
    return W;
  };
  const lines = (ids) => ids.map((i) => remote(i)).join('\n') + '\n';
  const die = (uh) => { for (const h of uh._holds.values()) h.io = new Promise(() => { }); uh._holds.clear(); const i = ALL_UH.indexOf(uh); if (i >= 0) ALL_UH.splice(i, 1); if (uh._inflight) uh._inflight.clear(); uh.onShape = null; for (const f of (uh._readFail || new Map()).values()) clearTimeout(f.timer); for (const m of [uh._lines, uh._retries]) for (const s of (m || new Map()).values()) if (s && s.timer) clearTimeout(s.timer); };
  const realOpen = fs.promises.open;
  /** every open of each file refused — `faults`: file → {code (null: an error with no code — V8's allocation failure), once} → undo */
  const deny = (faults) => { const n = new Map(); fs.promises.open = function (f, ...a) { const x = faults.get(String(f)); if (x && (!x.once || !n.get(String(f)))) { n.set(String(f), 1); return Promise.reject(x.code ? Object.assign(new Error(`${x.code}: injected, open '${f}'`), { code: x.code, path: String(f) }) : new RangeError('Array buffer allocation failed')); } return realOpen.call(this, f, ...a); }; return () => { fs.promises.open = realOpen; }; };
  const host = 'host-x', base = `events-2026-10~${host}`;
  const loaded = async (uh, ms = 3000) => { for (let t = 0; t < ms; t += 20) { const h = uh._holds.get(base); if (h && !h.loading) return h; await sleep(20); await settle(); } return uh._holds.get(base) || null; };
  /** a live hold of 20 rows, 3 dropped said by a restart (its item: «some of them may already be recorded») → {df, seg} */
  const liveHold = async (W, { garbage = false, said = true } = {}) => {
    const L1 = W.life(); await quiet(() => L1.uh.ingestRemoteEvents(host, 'X', lines(Array.from({ length: 20 }, (_, k) => 9300 + k)))); die(L1.uh);
    const segName = W.held().find((f) => f.endsWith('.ndjson')), gen = Math.floor(Number(segName.split('.')[1]) / 1e6);
    const df = path.join(W.heldDir, `${base}.${gen}.dropped`);
    fs.appendFileSync(df, JSON.stringify({ gone: [1, 2, 3].map((k) => hidOf(8800 + k, host)) }) + '\n' + (garbage ? 'GARBAGE-LINE\n' : ''));
    if (said && !garbage) { const L2 = W.life(); await quiet(async () => { L2.wired.reconcile(); await sleep(60); await settle(); }); die(L2.uh); }
    return { df, seg: path.join(W.heldDir, segName), gen };
  };
  const journalAt = (out, re) => out.findIndex((l) => re.test(l));

  // ── 1. THE SET AND ITS SEGMENTS REFUSED TOGETHER (probe-live-eacces-segments: a root-run server's 0600 files) — the hold fails
  // WHOLE: nothing moved, nothing marked, ONE notice; the owner fixes the permissions ⇒ the hold reads back intact, its count
  // checkable (the base's recovery). And a set the disk refuses beside a segment whose read passes (EMFILE once): judged only
  // when the hold reads whole (the timer's read) — set aside then, never at the read its segment failed ──
  {
    const got = {};
    for (const [name, setCode, segCode, segOnce] of [['set + segment EACCES', 'EACCES', 'EACCES', false], ['set EIO + segment EACCES', 'EIO', 'EACCES', false], ['set EACCES + segment EMFILE once', 'EACCES', 'EMFILE', true]]) {
      const W = world('w25a-' + name.replace(/\W+/g, '-')), { df, seg } = await liveHold(W);
      const bytes0 = fs.readFileSync(df);
      const L = W.life(), undo = deny(new Map([[df, { code: setCode }], [seg, { code: segCode, once: segOnce }]]));
      const acks = []; let out = [], under = null;
      try {
        [, out] = await quiet(async () => {
          L.wired.reconcile(); await sleep(40); await settle();
          for (let k = 0; k < 2; k++) acks.push(await L.uh.ingestRemoteEvents(host, 'X', lines([9400 + k])));
          if (segOnce) { await loaded(L.uh); await settle(); }
          under = { held: W.held(), asides: W.aside().length, marked: W.held().some((f) => f.endsWith('.unread')), read: W.open('hold-read'), aside: W.open('set-aside'), intact: fs.existsSync(df) && fs.readFileSync(df).equals(bytes0) };
        });
      } finally { undo(); }
      // the owner fixes the permissions: the timer reads the hold again
      let late = null;
      const [, out2] = await quiet(async () => { await loaded(L.uh); [late] = [await L.uh.ingestRemoteEvents(host, 'X', lines([9500]))]; await settle(); });
      const h = L.uh._holds.get(base), it = W.month();
      got[name] = { acks: acks.map((a) => !!(a && a.ack) && !((a && a.holdFailed) || []).length), under, late: !!(late && late.ack), gone: h ? h.gone.size : null, asides: W.aside().length, read: W.open('hold-read'), aside: W.open('set-aside'), maybe: !!it && /the 3 oldest held events of 2026-10 were dropped — counted here; some of them may already be recorded/.test(it.detail), order: [journalAt(out.concat(out2), /could not be read \(EACCES: [^)]*\.dropped\) — 2026-10 of host-x waits/), journalAt(out.concat(out2), /set aside, its bytes intact/)] };
      die(L.uh);
    }
    const a = got['set + segment EACCES'], e = got['set EIO + segment EACCES'], m = got['set EACCES + segment EMFILE once'];
    const whole = (g) => !g.acks.some(Boolean) && g.under.held.some((f) => f.endsWith('.dropped')) && g.under.intact && !g.under.asides && !g.under.marked && g.under.read === 1 && !g.under.aside;
    const back = (g) => g.late && g.gone === 3 && !g.asides && !g.read && !g.aside && g.maybe;
    const okM = !m.acks.some(Boolean) && m.late && m.asides === 1 && !m.read && m.aside === 1 && m.order[0] >= 0 && m.order[1] > m.order[0];
    ok(whole(a) && back(a) && whole(e) && back(e) && okM,
      `㉕ (1) the hold is read whole before anything is decided — ${[['set + segment EACCES', a], ['set EIO + segment EACCES', e]].map(([n, g]) => `${n}: under the fault ${g.acks.filter(Boolean).length} of 2 acked, the set ${g.under.intact ? 'KEPT as it was' : g.under.asides ? 'SET ASIDE' : 'CHANGED'}${g.under.marked ? ' + MARKED' : ''}, ${g.under.read} hold-read + ${g.under.aside} set-aside notice(s) open; fixed ⇒ the next batch ${g.late ? 'acked' : 'NOT acked'}, the hold gone ${g.gone}${g.maybe ? ' (its 3 still «may already be recorded»)' : ''}, ${g.asides} set aside, ${g.read + g.aside} notice(s) open`).join(' · ')} · set EACCES + segment EMFILE once: ${m.asides} set aside ${m.order[1] > m.order[0] && m.order[0] >= 0 ? 'only at the read that read the hold whole (after the failed one)' : m.order[1] >= 0 ? 'BEFORE its segment was read' : '—'}, the month ${m.late ? 'acked' : 'NOT acked'}, ${m.read + m.aside} notice(s) open (f3027952: the set moved for good while the month waited, «set aside unread; nothing waits» beside «that month waits»)`,
      got);
  }

  // ── 2. AN OLDER SET THE DISK REFUSES BESIDE A LIVE HOLD THAT CANNOT BE READ (the same 0600 files): the older one's judgement
  // waits for the hold — kept, unmarked, ONE notice; fixed ⇒ its 7 said, the live hold read. And a live set with a line that
  // is no record beside a refused segment: neither copied nor rewritten until the hold reads whole ──
  {
    const got = {};
    {
      const W = world('w25b-older'), { df, seg } = await liveHold(W, { said: false });
      // the live hold's files renamed to generation 2; an older generation 0's set (7 dropped) beside it
      const seg2 = seg.replace(/\.(\d+)\.ndjson$/, (_, q) => `.${2e6 + (Number(q) % 1e6)}.ndjson`), df2 = df.replace(/\.\d+\.dropped$/, '.2.dropped'), old = df.replace(/\.\d+\.dropped$/, '.0.dropped');
      fs.renameSync(seg, seg2); fs.renameSync(df, df2);
      fs.writeFileSync(old, JSON.stringify({ gone: [1, 2, 3, 4, 5, 6, 7].map((k) => hidOf(9100 + k, host)) }) + '\n');
      const L = W.life(), undo = deny(new Map([[old, { code: 'EACCES' }], [seg2, { code: 'EACCES' }]]));
      let under = null;
      try { await quiet(async () => { L.wired.reconcile(); await sleep(40); await settle(); await L.uh.ingestRemoteEvents(host, 'X', lines([9400])); under = { held: W.held(), asides: W.aside().length, marked: W.held().some((f) => f.endsWith('.unread')), read: W.open('hold-read'), aside: W.open('set-aside') }; }); } finally { undo(); }
      let late = null;
      await quiet(async () => { await loaded(L.uh); late = await L.uh.ingestRemoteEvents(host, 'X', lines([9500])); await settle(); });
      got.older = { under, late: !!(late && late.ack), said7: L.evs.some((ev) => ev.kind === 'dropped' && String(ev.gen) === '0' && ev.dropped === 7), asides: W.aside().length, read: W.open('hold-read'), aside: W.open('set-aside'), oldGone: !fs.existsSync(old) };
      die(L.uh);
    }
    {
      const W = world('w25b-garbage'), { df, seg } = await liveHold(W, { garbage: true });
      const bytes0 = fs.readFileSync(df);
      const L = W.life(), undo = deny(new Map([[seg, { code: 'EACCES' }]]));
      let under = null;
      try { await quiet(async () => { L.wired.reconcile(); await sleep(40); await settle(); await L.uh.ingestRemoteEvents(host, 'X', lines([9400])); under = { asides: W.aside().length, intact: fs.readFileSync(df).equals(bytes0), read: W.open('hold-read'), aside: W.open('set-aside') }; }); } finally { undo(); }
      let late = null;
      await quiet(async () => { await loaded(L.uh); late = await L.uh.ingestRemoteEvents(host, 'X', lines([9500])); await settle(); });
      got.garbage = { under, late: !!(late && late.ack), asides: W.aside().length, rewritten: !fs.readFileSync(df, 'latin1').includes('GARBAGE'), read: W.open('hold-read'), aside: W.open('set-aside') };
      die(L.uh);
    }
    const o = got.older, g = got.garbage;
    const okO = o.under.held.includes(`${base}.0.dropped`) && !o.under.asides && !o.under.marked && o.under.read === 1 && !o.under.aside && o.late && o.said7 && o.oldGone && !o.asides && !o.read && !o.aside;
    const okG = !g.under.asides && g.under.intact && g.under.read === 1 && !g.under.aside && g.late && g.asides === 1 && g.rewritten && !g.read && g.aside === 1;
    ok(okO && okG,
      `㉕ (2) an older set's judgement and a live set's lines that are no record wait for the hold — the older set refused beside a refused segment: ${o.under.asides ? `${o.under.asides} SET ASIDE` : 'kept'}${o.under.marked ? ' + MARKED' : ''}, ${o.under.read} hold-read + ${o.under.aside} set-aside notice(s); fixed ⇒ its 7 ${o.said7 ? 'said' : 'NOT said'}, the month ${o.late ? 'acked' : 'NOT acked'} · a live set with a line that is no record beside a refused segment: ${g.under.asides ? 'COPIED' : 'not copied'}, ${g.under.intact ? 'not rewritten' : 'REWRITTEN'}, ${g.under.read} + ${g.under.aside} notice(s); fixed ⇒ ${g.asides} copied, ${g.rewritten ? 'rewritten' : 'NOT rewritten'}, ${g.aside} set-aside notice, the month ${g.late ? 'acked' : 'NOT acked'}`,
      got);
  }

  // ── 3. A COUNT NOBODY CHECKED IS «NOT KNOWN» (keeplost-maybe-probe): the live set refused (its segment reads) after its 3 were
  // said «may already be recorded» ⇒ «Earlier: 3 … whether they were recorded is not known» (f3027952: «counted, never
  // recorded»); an older set read at a boot with no `checked` record says so too, one with it «never recorded»; the words
  // of a part not known (PURE) ──
  {
    const got = {};
    {
      const W = world('w25c-keeplost'), { df } = await liveHold(W);
      const L = W.life(), undo = deny(new Map([[df, { code: 'EACCES' }]]));
      try { await quiet(async () => { L.wired.reconcile(); await sleep(40); await settle(); await L.uh.ingestRemoteEvents(host, 'X', lines([9400])); }); } finally { undo(); }
      const it = W.month(), q = (it && it.i18n && it.i18n.text && it.i18n.text.params) || {};
      got.keepLost = { line: it ? (it.detail.split('\n').find((l) => /^Earlier:/.test(l)) || '') : '', maybe: q.maybe || '' };
      die(L.uh);
    }
    for (const checked of [false, true]) {
      const W = world('w25c-older-' + checked); fs.mkdirSync(W.heldDir, { recursive: true });
      fs.writeFileSync(path.join(W.heldDir, `${base}.0.dropped`), JSON.stringify({ gone: [1, 2, 3, 4, 5, 6, 7].map((k) => hidOf(9100 + k, host)) }) + '\n' + (checked ? JSON.stringify({ checked: 7 }) + '\n' : ''));
      fs.writeFileSync(path.join(W.heldDir, `${base}.2.dropped`), JSON.stringify({ gone: [1, 2, 3, 4, 5].map((k) => hidOf(9200 + k, host)) }) + '\n' + JSON.stringify({ checked: 5 }) + '\n');
      const L = W.life(true); await quiet(async () => { L.wired.reconcile(); await sleep(80); await settle(); });
      const it = W.items().find((x) => x.i18n && x.i18n.text && x.i18n.text.params && x.i18n.text.params.host === host);
      got['older ' + (checked ? 'checked' : 'unchecked')] = it ? (it.detail.split('\n').find((l) => /^Earlier:/.test(l)) || '') : '';
      die(L.uh);
    }
    const n = LSN.noticeOf({ host, hostName: 'X', shard: 'events-2026-10.ndjson', month: '2026-10', size: 3 * GiB, why: 'size', remedy: { state: 'running' }, held: 4, dropped: 2, gen: 3, ended: new Map([['0', 7], ['1', 5]]), maybe: new Map([['0', 7]]) });
    got.part = (n.detail.split('\n').find((l) => /^Earlier:/.test(l)) || '');
    got.partParams = n.i18n.text.params.maybe || '';
    const NK = /^Earlier: (\d+) held events of 2026-10 had been dropped past the bound — counted; whether they were recorded is not known\.$/;
    ok(NK.test(got.keepLost.line) && /^Earlier: 3 /.test(got.keepLost.line) && /(^|,)\?:3(,|$)/.test(got.keepLost.maybe) && NK.test(got['older unchecked']) && /^Earlier: 7 /.test(got['older unchecked'])
      && /^Earlier: 7 held events of 2026-10 had been dropped past the bound — counted, never recorded\.$/.test(got['older checked'])
      && got.part === 'Earlier: 12 held events of 2026-10 had been dropped past the bound — counted, never recorded; for 7 of them that is not known.' && got.partParams === '0:7',
      `㉕ (3) a count nobody checked is «not known» — the live set refused after its 3 «may already be recorded»: «${got.keepLost.line.replace(/^Earlier: /, '') || 'NO LINE'}» · an older set read at a boot, unchecked: «${got['older unchecked'].replace(/^Earlier: /, '')}», checked: «${got['older checked'].replace(/^Earlier: /, '')}» · a part not known (PURE): «${got.part.replace(/^Earlier: /, '')}» (f3027952: every one «counted, never recorded»)`,
      got);
  }

  // ── 4. A CODELESS ERROR PASSES (V8's «Array buffer allocation failed» — no code): an older set (7) beside a newer one (5), its
  // read failing so at TWO starts ⇒ kept both times, never marked, never set aside; the third start says its 7 (f3027952:
  // classed by its message as a code no list knows — marked, then set aside unread: the 7 lost) ──
  {
    const cls = typeof RD.readClassOf === 'function' ? RD.readClassOf(new RangeError('Array buffer allocation failed')) : 'NO CLASSIFIER OF THE ERROR';
    const W = world('w25d-codeless'); fs.mkdirSync(W.heldDir, { recursive: true });
    const f0 = path.join(W.heldDir, `${base}.0.dropped`);
    fs.writeFileSync(f0, JSON.stringify({ gone: [1, 2, 3, 4, 5, 6, 7].map((k) => hidOf(9100 + k, host)) }) + '\n');
    fs.writeFileSync(path.join(W.heldDir, `${base}.2.dropped`), JSON.stringify({ gone: [1, 2, 3, 4, 5].map((k) => hidOf(9200 + k, host)) }) + '\n');
    const lives = [];
    for (let n = 1; n <= 3; n++) {
      const L = W.life(true), undo = n < 3 ? deny(new Map([[f0, { code: null }]])) : () => { };
      try { await quiet(async () => { L.wired.reconcile(); await sleep(80); await settle(); }); } finally { undo(); }
      lives.push({ kept: W.held().includes(`${base}.0.dropped`), marked: W.held().includes(`${base}.0.dropped.unread`), asides: W.aside().length, said7: L.evs.some((ev) => ev.kind === 'dropped' && String(ev.gen) === '0' && ev.dropped === 7) });
      die(L.uh);
    }
    const good = cls === 'passes' && lives[0].kept && lives[1].kept && !lives[0].marked && !lives[1].marked && !lives.some((l) => l.asides) && !lives[0].said7 && !lives[1].said7 && lives[2].said7 && !lives[2].kept;
    ok(good,
      `㉕ (4) a codeless error passes — readClassOf(RangeError «Array buffer allocation failed») = ${cls}; an older set failing so at two starts: ${lives.map((l, i) => `life ${i + 1} ${l.asides ? 'SET ASIDE' : l.kept ? 'kept' + (l.marked ? ' + MARKED' : '') : 'gone'}${l.said7 ? ', its 7 said' : ''}`).join(', ')}`,
      { cls, lives });
  }
});
fs.rmSync(tmp, { recursive: true, force: true }); // after the last leg (r8: ⑲ ran after it and left its scratch behind)
console.log('  · ' + legMs.join(' · '));
console.log(fail ? `${fail} FAILED (${pass} passed)` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0);

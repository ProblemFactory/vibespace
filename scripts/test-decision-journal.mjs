#!/usr/bin/env node
// test-decision-journal — B-0248's next part (the coordinator's r2403 / r2417): THE DECISION ENGINE'S JOURNAL THROUGH THE STORE WRITER,
// under its six laws — the journal carries a MONEY belt (B-a85f): a billed call's line was appended on the loop so that a kill between
// the vendor's answer and the counter's landing never lost the spend. Off the loop, that belt is the call's RESERVATION line, ON DISK
// before the vendor request is built. In-process, stand-ins only: a stand-in writer (held, failing, landing on demand; the worker's
// rewriteJob emulated) and a fake provider (fetchImpl) — no vendor call, no CLI.
//   ① laws 1+2: a reservation that does not land ⇒ nothing asked, refused by name, its slot given back, never counted (RED: the ask first)
//   ② law 2: a reservation past its bound ⇒ refused by name, nothing asked
//   ③ law 3: two at once at the last slot ⇒ one refused (RED: the slot taken after the write, no second look)
//   ④ the owner's gates judged again once the line landed: a budget lowered meanwhile ⇒ nothing asked (RED: no second look)
//   ⑤ law 4: a kill between the reservation and the result ⇒ the next start counts it spent, ONCE (RED: a boot that skips reservations)
//   ⑥ law 5: the trim under an append in flight ⇒ no line lost; the day's rows and a reservation with no result kept (RED: the release's
//      trim on the loop); the index follows the file through a second trim (every line whole, each once)
//   ⑦ law 6: the first journal line after a start reads nothing of the file (RED: a whole-file count)
//   ⑧ law 1 on the text-model client's road (RED: the ask first); the road counts a call once when the storage writes
//   ⑨ r2581 (2): a trim whose rewrite keeps failing never locks the journal — the file whole, the next write an append (RED: armed again)
//   ⑩ a day the belt keeps whole (past 6 000 lines): one rewrite, then appends (RED: a trim due at every write)
//   ⑪ the drafter's second look after its landing (RED: none); a judgment's answer waits for its own lines (RED: no wait)
//   ⑫ r3739: a line that is not a row (a reservation a stop cut mid-write) survives two trims, the rows each keeps the same, its
//      number in the trim's one line (RED: today's trim drops it)
import { scratchDir, anchored } from './scratch.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
import { checker } from './lib/check.mjs';
const require = createRequire(import.meta.url);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MUT = mutantCopies('decision-journal', repo);
const { ok, report } = checker();   // THE ONE GUARDED HELPER (B-1747): a non-boolean condition or a swapped name throws
const ROOT = scratchDir('decision-journal');
let seq = 0;
const fresh = (tag) => { const d = path.join(ROOT, `${++seq}-${tag}`); fs.mkdirSync(d, { recursive: true }); return d; };
const tick = () => new Promise((r) => setImmediate(r));
const until = async (fn, n = 400) => { for (let k = 0; k < n && !fn(); k++) await tick(); return fn(); };
const quiet = { log() { }, warn() { }, error() { }, info() { } };
const DE = require(path.join(repo, 'src/server/decision-engine.js'));
const DM = require(path.join(repo, 'src/decision-model.js'));
const TM = require(path.join(repo, 'src/server/text-model-client.js'));
const SRC = fs.readFileSync(path.join(repo, 'src/server/decision-engine.js'), 'utf8');
const DMSRC = fs.readFileSync(path.join(repo, 'src/decision-model.js'), 'utf8');
const TSRC = fs.readFileSync(path.join(repo, 'src/server/text-model-client.js'), 'utf8');
const JF = 'decision-journal.jsonl';
const T0 = Date.UTC(2026, 10, 20, 12, 0, 0);
const DAY0 = DM.dayOf(T0, 0);
// a secret-shaped key is built at run time (never a literal in the tree)
const KEY = ['sk', 'test', 'b0248', 'k'.repeat(16)].join('-'), KEY_OR = ['sk', 'or', 'v1', 'r'.repeat(40)].join('-');
const integ = { resolveIntegration: () => ({ values: { provider: 'openai', apiKey: KEY }, source: 'user' }) };
const integOR = { resolveIntegration: () => ({ values: { provider: 'openrouter', apiKey: KEY_OR, model: '' }, source: 'user' }) };
const rows = (dir) => { try { return fs.readFileSync(path.join(dir, JF), 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return { torn: l.slice(0, 80) }; } }); } catch { return []; } };
const spend = (dir) => DM.daySpendByUse(rows(dir), DAY0, () => 0).byUse;

/** A STAND-IN WRITER: one store a file; `auto` lands a write on the next turn; `fail` fails every write (its store hears it, the change
 *  stays owed); `take(file)` hands a write to «the thread» and holds it (an append's fd is opened NOW, as the worker's would be — it
 *  lands in the inode it opened); the worker's rewriteJob emulated byte for byte (src/store-writer-worker.js) */
const standIn = () => {
  const st = { stores: new Map(), auto: true, fail: false, failRewrite: false, rewrites: 0, taken: null, asks: 0 };
  const S = (f) => { let s = st.stores.get(f); if (!s) st.stores.set(f, s = { o: null, version: 0, written: 0, waiters: [], nd: null }); return s; };
  const settleW = (s, ok) => { s.waiters = s.waiters.filter((w) => { if (!ok || w.v <= s.written) { clearTimeout(w.t); w.res(ok); return false; } return true; }); };
  const rewriteJob = (f, b) => {
    const old = fs.readFileSync(f), size = b.rewrite.size, R = b.rewrite.ranges, parts = [];
    if (old.length < size) throw Object.assign(new Error('shrunk'), { code: 'ESHRUNK' });
    for (let k = 0; k < R.length; k += 2) {
      const a = R[k], e = R[k + 1];
      if (!(a >= 0 && e > a && e <= size + 1)) throw Object.assign(new Error(`a kept range out of the file: [${a}, ${e}) of ${size}`), { code: 'EBADRANGE' });
      if (e > size) parts.push(old.subarray(a, size), Buffer.from('\n')); else parts.push(old.subarray(a, e));
    }
    if (old.length > size) { const past = old.subarray(size); parts.push(past); if (past[past.length - 1] !== 10) parts.push(Buffer.from('\n')); }
    parts.push(Buffer.from(b.then || ''));
    fs.writeFileSync(f + '.tmp-standin', Buffer.concat(parts)); fs.renameSync(f + '.tmp-standin', f);
  };
  const apply = (f, b, fd) => {
    if (b == null) return;
    if (typeof b === 'object' && !Buffer.isBuffer(b) && 'append' in b) { if (fd != null) { fs.writeSync(fd, b.append); fs.closeSync(fd); } else fs.appendFileSync(f, b.append); return; }
    if (typeof b === 'object' && b.rewrite) return rewriteJob(f, b);
    fs.writeFileSync(f, b);
  };
  const failWith = (s) => { const e = Object.assign(new Error('a stand-in storage that fails'), { code: 'EIO' }); s.nd = { why: 'failed', code: 'EIO' }; if (s.o.onWritten) s.o.onWritten(false, e); settleW(s, false); };
  const doWrite = (f, s, o = {}) => {
    const v = s.version; let b;
    if (st.fail) { b = s.o.produce(o); return failWith(s); }   // its bytes were made, the storage failed them
    b = s.o.produce(o);
    if (b && typeof b === 'object' && b.rewrite) { st.rewrites++; if (st.failRewrite) { const e = Object.assign(new Error('a rewrite job on the main thread (a stand-in)'), { code: 'EREWRITEMAIN' }); s.nd = { why: 'failed', code: 'EREWRITEMAIN' }; if (s.o.onWritten) s.o.onWritten(false, e); return settleW(s, false); } }
    try { apply(f, b, null); } catch (e) { s.nd = { why: 'failed', code: e.code }; if (s.o.onWritten) s.o.onWritten(false, e); return settleW(s, false); }
    s.written = v; s.nd = null; if (s.o.onWritten) s.o.onWritten(true, null); settleW(s, true);
  };
  const W = {
    st,
    dirty(f, o) { const s = S(f); s.o = o; s.version++; if (st.auto) setImmediate(() => W.land([f])); },
    pending(f) { const s = st.stores.get(f); return !!(s && s.written < s.version); },
    durable(f, { timeoutMs = 60000 } = {}) { st.asks++; const s = S(f); if (s.written >= s.version && !(st.taken && st.taken.f === f)) return Promise.resolve(true); return new Promise((res) => { const w = { v: s.version, res }; w.t = setTimeout(() => { s.waiters = s.waiters.filter((x) => x !== w); s.nd = { why: 'queued' }; res(false); }, timeoutMs); s.waiters.push(w); }); },
    whyNotDurable(f) { const s = st.stores.get(f); return s ? s.nd : null; },
    flushSync(files) { W.land(files || [...st.stores.keys()], { sync: true }); return { written: [], left: [] }; },
    forget() { },
    land(files = [...st.stores.keys()], o = {}) { for (const f of files) { const s = st.stores.get(f); if (!s || s.written >= s.version || (st.taken && st.taken.f === f)) continue; doWrite(f, s, o); } },
    take(f) { const s = st.stores.get(f), v = s.version, b = s.o.produce({}); const fd = b && typeof b === 'object' && 'append' in b ? fs.openSync(f, 'a') : null; st.taken = { f, s, v, b, fd }; },
    landTaken() { const x = st.taken; st.taken = null; apply(x.f, x.b, x.fd); x.s.written = x.v; if (x.s.o.onWritten) x.s.o.onWritten(true, null); settleW(x.s, true); },
  };
  return W;
};
/** the fake provider (openai's dialect): every question answered as a predicate; `hang` never answers (a stop before the answer) */
const vendor = (asks, { hang = false } = {}) => async (url, opts) => {
  asks.push(url);
  if (hang) return new Promise(() => { });
  const req = JSON.parse(await new Response(opts.body).text());
  return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({ answers: (req.questions || []).map((q) => ({ type: 'predicate', name: q.name, probability: 0.7 })), usage: { input_tokens: 120, output_tokens: 4 } }) };
};
const mk = (Mod, { dir, writer, fetchImpl, cents = 100, landMs = 400, log = quiet }) => {
  const e = Mod.create({ dataDir: dir, integrations: integ, fetchImpl, writer, now: () => T0, tzOffset: () => 0, log, reserveLandMs: landMs, timeoutMs: 60000 });
  let c = cents; e.attachPlugin({ peek: () => ({ enabled: true }), settings: () => ({ dailyBudgetCents: c }) }); e.setCents = (x) => { c = x; };
  return e;
};
const TEST_WORDS_RE = /spending line could not be written to the data folder — nothing was charged/;   // the Test's sentence for reservation-unwritten (r2581 (3))
const LAND = "    { const landed = await reservationLanded(id, use, t); if (!landed.ok) return { ok: false, why: landed.why, detail: landed.detail }; }\n";
const AGAIN = SRC.slice(SRC.indexOf("    { const again = verdictOf(use, {"), SRC.indexOf("    const sent = M.scrubQuestions(qs);"));
const SLOT = "    open.set(id, { use, usd: estUsd });\n";
const COUNT = "    if (jKnown && (!jWhole || jIdx.length + (jWriting ? jWriting.lines.length : 0) + jOwed.length > Math.max(JOURNAL_MAX, jKeptFloor) * 1.2)) jTrimDue = true;   // law 6: the count from the index (+ the lines on their way)\n";
const engineCopy = (pairs, tag) => MUT.load('src/server/decision-engine.js', pairs.reduce((src, [a, b, o]) => anchored(src, a, b, tag, o), SRC), tag);

console.log('① laws 1+2: no reservation on disk, no judgment');
const failingStorage = async (Mod) => {
  const dir = fresh('fail'), W = standIn(), asks = []; W.st.fail = true;
  const e = mk(Mod, { dir, writer: W, fetchImpl: vendor(asks) });
  const r1 = await e.testRunner(); const asked1 = asks.length, inFlight = e.status().today.inFlight, spent1 = e.ledger.spentUsd();
  W.st.fail = false; W.land();
  const j1 = rows(dir), res = j1.filter((x) => x.outcome === 'reserved'), rel = j1.filter((x) => x.outcome === 'released');
  const sp1 = spend(dir);
  const r2 = await e.testRunner();   // asked AGAIN once the storage writes
  W.land();
  return { error: r1.error, asked1, inFlight, spent1, reserved: res.length, released: rel.length, paired: res.length === 1 && rel.length === 1 && res[0].call === rel[0].call, sp1: Object.keys(sp1).length, ok2: r2.ok, asked2: asks.length, calls2: (spend(dir).test || {}).calls || 0 };
};
{ const r = await failingStorage(DE);
  ok(TEST_WORDS_RE.test(r.error) && r.asked1 === 0 && r.inFlight === 0 && r.spent1 === 0, 'a reservation whose write FAILED refuses the judgment by name (reservation-unwritten): nothing asked of the vendor, its slot given back in memory', r);
  ok(r.paired && r.sp1 === 0, '…its reservation and a «released» line are paired in the journal once the storage writes: the day counts NOTHING for it', r);
  ok(r.ok2 && r.asked2 === 1 && r.calls2 === 1, '…asked again, the judgment goes through and the day counts it ONCE (never twice)', r); }
{ const r = await failingStorage(engineCopy([[LAND, '']], 'ask-first'));
  ok(r.asked1 === 1, 'CONTROL (a copy that asks without waiting for its reservation): the vendor is asked with nothing on disk — red', r); }

console.log('② law 2: a reservation past its bound');
{ const dir = fresh('bound'), W = standIn(), asks = []; W.st.auto = false;
  const e = mk(DE, { dir, writer: W, fetchImpl: vendor(asks), landMs: 150 });
  const t0 = Date.now(), r = await e.testRunner(), ms = Date.now() - t0;
  ok(TEST_WORDS_RE.test(r.error) && asks.length === 0 && ms >= 140 && e.status().today.inFlight === 0, 'a reservation still queued past its bound (150 ms here) refuses the judgment by name, nothing asked, its slot given back', { r, ms, asks: asks.length }); }

console.log('③ law 3: the ceiling counts what is in flight');
const estOne = async () => { const dir = fresh('est'), W = standIn(); const e = mk(DE, { dir, writer: W, fetchImpl: vendor([]) }); await e.testRunner(); W.land(); return rows(dir).find((x) => x.outcome === 'reserved').reserved; };
const EST = await estOne();
const lastSlot = async (Mod) => {
  const dir = fresh('slot'), W = standIn(), asks = []; W.st.auto = false;
  const e = mk(Mod, { dir, writer: W, fetchImpl: vendor(asks), cents: EST * 1.5 * 100 });
  const p1 = e.testRunner(), p2 = e.testRunner();
  await tick(); W.st.auto = true; W.land();
  const [r1, r2] = await Promise.all([p1, p2]); W.land();
  return { asks: asks.length, oks: [r1.ok, r2.ok], errors: [r1.error, r2.error], est: EST };
};
{ const r = await lastSlot(DE);
  ok(r.asks === 1 && r.oks.filter(Boolean).length === 1 && r.errors.includes('daily-budget'), 'two judgments at once at the LAST slot: the first takes it in the deciding step, the second is refused (daily-budget); ONE vendor ask', r); }
{ const r = await lastSlot(engineCopy([[AGAIN, '']], 'slot-alone'));
  ok(r.asks === 1, '…the slot ALONE holds it (a copy without the second look after the landing): one ask', r); }
{ const r = await lastSlot(engineCopy([[SLOT, ''], [LAND, LAND + SLOT], [AGAIN, '']], 'slot-after-write'));
  ok(r.asks === 2, 'CONTROL (a copy that takes the slot only after the reservation is written, no second look): both pass the ceiling — two asks — red', r); }

console.log('④ the owner\'s gates judged again once the reservation landed');
const lowered = async (Mod) => {
  const dir = fresh('lowered'), W = standIn(), asks = []; W.st.auto = false;
  const e = mk(Mod, { dir, writer: W, fetchImpl: vendor(asks), cents: 100 });
  const p = e.testRunner(); await tick();
  e.setCents(0); W.st.auto = true; W.land();   // the owner lowers the day's budget to nothing while the line is written
  const r = await p; W.land();
  return { asks: asks.length, error: r.error, released: rows(dir).filter((x) => x.outcome === 'released').length, inFlight: e.status().today.inFlight, day: Object.keys(spend(dir)).length };
};
{ const r = await lowered(DE);
  ok(r.asks === 0 && r.error === 'daily-budget' && r.released === 1 && r.inFlight === 0 && r.day === 0, 'a budget LOWERED to nothing while the reservation was written: judged again at its landing — refused (daily-budget), nothing asked, released, nothing counted', r); }
{ const r = await lowered(engineCopy([[AGAIN, '']], 'no-second-look'));
  ok(r.asks === 1, 'CONTROL (a copy without the second look): the vendor is asked past the owner\'s new budget — red', r); }

console.log('⑤ law 4: never under-counted');
const killed = async (Mod) => {
  const dir = fresh('kill'), asks = [];
  const e = mk(DE, { dir, writer: standIn(), fetchImpl: vendor(asks, { hang: true }) });
  e.testRunner();   // its reservation lands, the vendor is asked — and the hub stops before the answer: no result line, no counter
  await until(() => asks.length === 1);
  const res = rows(dir).find((x) => x.outcome === 'reserved');
  const boot = () => { const W = standIn(); const x = mk(Mod, { dir, writer: W, fetchImpl: vendor([]) }); W.land(); return x.status().today.byUse.test || { usd: 0, calls: 0 }; };
  const b1 = boot(), b2 = boot();
  return { asked: asks.length, reserved: res && res.reserved, b1, b2 };
};
{ const r = await killed(DE);
  ok(r.asked === 1 && r.reserved > 0 && Math.abs(r.b1.usd - r.reserved) < 1e-9 && r.b1.calls === 1, 'a stop between the reservation and the result: the next start counts the call SPENT (its reserved estimate, one call)', r);
  ok(Math.abs(r.b2.usd - r.reserved) < 1e-9 && r.b2.calls === 1, '…ONCE: a start after it reads the same day (no second count)', r); }
{ const r = await killed(engineCopy([["    const j = M.daySpendByUse(rows, day0, tzOffset);", "    const j = M.daySpendByUse(rows.filter((x) => !x || x.outcome !== 'reserved'), day0, tzOffset);"]], 'boot-skips-reservations'));
  ok(r.b1.usd === 0, 'CONTROL (a copy whose boot skips reservations): the stopped call is not counted — the day under-counted — red', r); }

console.log('⑥ law 5: the trim loses nothing the belt reads');
const seed = (dir, n) => {
  const lines = [JSON.stringify({ at: T0 - 40 * 86400e3, use: 'attention', call: 'gone.1', outcome: 'reserved', reserved: 0.0002, est: 2000 })];   // a stop 40 days ago: no result
  for (let i = 0; i < 300; i++) lines.push(JSON.stringify({ at: T0 - 35 * 86400e3 + i * 1000, use: 'inbox', outcome: 'ok', usd: 0.00001, inputTokens: 100, note: 'past 30 days' }));
  const mid = n - 1 - 300 - 50;
  for (let i = 0; i < mid; i++) lines.push(JSON.stringify({ at: T0 - 25 * 86400e3 + i * 60e3, use: 'inbox', outcome: 'ok', usd: 0.00001, inputTokens: 100, seq: i }));
  for (let i = 0; i < 50; i++) lines.push(JSON.stringify({ at: T0 - (50 - i) * 60e3, use: 'attention', outcome: 'ok', usd: 0.00002, inputTokens: 200, today: i }));
  fs.writeFileSync(path.join(dir, JF), lines.join('\n') + '\n');
};
const trimUnderAppend = async (Mod) => {
  const dir = fresh('trim'); seed(dir, 5999);
  const W = standIn(); W.st.auto = false;
  const e = mk(Mod, { dir, writer: W, fetchImpl: vendor([]) });
  const F = path.join(dir, JF);
  e.ledger.journal({ use: 'learn', outcome: 'refused', why: 'line-A' });   // 6 000 lines
  W.take(F);                                                               // its append is on its way (the thread opened the file)
  e.ledger.journal({ use: 'learn', outcome: 'refused', why: 'line-B' });   // 6 001: a trim is owed
  W.landTaken(); W.land(); W.land();
  const j = rows(dir);
  return { n: j.length, A: j.filter((x) => x.why === 'line-A').length, B: j.filter((x) => x.why === 'line-B').length, today: j.filter((x) => Number.isInteger(x.today)).length, orphan: j.filter((x) => x.call === 'gone.1').length, past30: j.filter((x) => x.note === 'past 30 days').length, torn: j.filter((x) => x.torn).length, e, W, dir };
};
{ const r = await trimUnderAppend(DE);
  ok(r.A === 1 && r.B === 1 && r.torn === 0, 'a trim owed while an append is on its way: the append lands, then ONE rewrite keeps it and the next line — no line lost, none twice', { ...r, e: undefined, W: undefined });
  ok(r.today === 50 && r.orphan === 1 && r.past30 === 0 && r.n <= 5003, '…it keeps every row of the belt\'s day (50), the reservation with no result from 40 days ago, drops the rows past 30 days, and ends within the cap', { n: r.n, today: r.today, orphan: r.orphan, past30: r.past30 });
  // the index follows the file: 1 200 more lines (a second trim), every line whole and each once
  r.W.st.auto = true;
  for (let i = 0; i < 1200; i++) r.e.ledger.journal({ use: 'learn', outcome: 'refused', why: `more-${i}` });
  await until(() => !r.W.pending(path.join(r.dir, JF)));
  const j = rows(r.dir), more = new Map();
  for (const x of j) if (typeof x.why === 'string' && x.why.startsWith('more-')) more.set(x.why, (more.get(x.why) || 0) + 1);
  ok(j.every((x) => !x.torn) && more.size === 1200 && [...more.values()].every((v) => v === 1) && j.filter((x) => Number.isInteger(x.today)).length === 50 && j.filter((x) => x.call === 'gone.1').length === 1, '…and through a SECOND trim the index still matches the file: every line whole, each of the 1 200 new lines once, the day\'s and the open reservation kept', { n: j.length, more: more.size, torn: j.filter((x) => x.torn).length }); }
{ const TRIM_OLD = "    if (jIdx.length + (jWriting ? jWriting.lines.length : 0) + jOwed.length > JOURNAL_MAX * 1.2) { const keep = fs.readFileSync(F.journal, 'utf8').split('\\n').filter(Boolean).slice(-JOURNAL_MAX); fs.writeFileSync(F.journal + '.t', keep.join('\\n') + '\\n'); fs.renameSync(F.journal + '.t', F.journal); jIdx = keep.map(() => ({})); jWriting = null; }   // the release's trim, on the loop\n";   // the control writes the old trigger back on purpose — stale-pins: kept
  const r = await trimUnderAppend(engineCopy([[COUNT, TRIM_OLD]], 'trim-on-the-loop'));
  ok(r.A === 0, 'CONTROL (a copy with the release\'s trim — read, rewrite, rename on the loop): the append already on its way lands in the replaced file — a line LOST — red', { A: r.A, B: r.B, n: r.n }); }

console.log('⑦ law 6: the count comes from the start\'s own tail read');
const firstLine = async (Mod) => {
  const dir = fresh('count'); seed(dir, 3000);
  const e = mk(Mod, { dir, writer: standIn(), fetchImpl: vendor([]) });
  let reads = 0; const r0 = fs.readFileSync, o0 = fs.openSync;
  fs.readFileSync = function (p, ...a) { if (String(p).endsWith(JF)) reads++; return r0.call(this, p, ...a); };
  fs.openSync = function (p, ...a) { if (String(p).endsWith(JF) && (!a[0] || a[0] === 'r')) reads++; return o0.call(this, p, ...a); };
  try { e.ledger.journal({ use: 'learn', outcome: 'refused', why: 'first' }); } finally { fs.readFileSync = r0; fs.openSync = o0; }
  return { reads };
};
{ const r = await firstLine(DE); ok(r.reads === 0, 'the first journal line after a start reads NOTHING of the file (the count is the start\'s tail index)', r); }
{ const r = await firstLine(engineCopy([[COUNT, "    if (fs.readFileSync(F.journal, 'utf8').split('\\n').filter(Boolean).length + jOwed.length > JOURNAL_MAX * 1.2) jTrimDue = true;   // the release's whole-file count\n"]], 'whole-count'));   // the control writes the old trigger back on purpose — stale-pins: kept
  ok(r.reads >= 1, 'CONTROL (a copy that counts the file again): a whole read on the loop at the first line — red', r); }

console.log('⑧ law 1 on the text-model client\'s road');
const textRoad = async (TMmod, { fail }) => {
  const dir = fresh('text'), W = standIn(), asks = []; W.st.fail = fail;
  const fetchImpl = async (url) => { asks.push(url); return { status: 200, ok: true, headers: { get: () => null }, json: async () => ({ choices: [{ message: { content: '{"ok":true}' } }], usage: { prompt_tokens: 40, completion_tokens: 5, cost: 0.002 } }) }; };
  const e = DE.create({ dataDir: dir, writer: W, fetchImpl, now: () => T0, tzOffset: () => 0, log: quiet, integrations: integOR, reserveLandMs: 400 });
  e.attachPlugin({ peek: () => ({ enabled: true }), settings: () => ({ rules: true, dailyBudgetCents: 100, learnModel: 'flash' }) });
  const tm = TMmod.create({ integrations: integOR, ledger: e.ledger, fetchImpl, now: () => T0, log: quiet });
  const r = await tm.complete({ use: 'learn', messages: [{ role: 'user', content: 'x' }], schema: {}, est: 500 });
  W.st.fail = false; W.land(); await tick(); W.land();
  const j = rows(dir);
  return { ok: r.ok, why: r.why, asks: asks.length, inFlight: e.status().today.inFlight, released: j.filter((x) => x.outcome === 'released').length, paired: j.filter((x) => x.outcome === 'reserved').length === 1 && new Set(j.filter((x) => x.call).map((x) => x.call)).size === 1, calls: (spend(dir).learn || {}).calls || 0 };
};
{ const r = await textRoad(TM, { fail: true });
  ok(!r.ok && r.why === 'reservation-unwritten' && r.asks === 0 && r.inFlight === 0 && r.released === 1, 'the drafter\'s completion whose reservation did not land is refused by name: nothing asked, the hold given back, its reservation released', r); }
{ const r = await textRoad(TM, { fail: false });
  ok(r.ok && r.asks === 1 && r.paired && r.calls === 1, '…on a storage that writes, the completion is asked once and the day counts it ONCE (its reservation paired with its result)', r); }
{ const NOWAIT = "      if (!landed.ok) return { ok: false, why: landed.why };\n";
  const r = await textRoad(MUT.load('src/server/text-model-client.js', anchored(TSRC, NOWAIT, '', 'text-ask-first'), 'text-ask-first'), { fail: true });
  ok(r.asks === 1, 'CONTROL (a copy of the client that asks whatever its reservation answered): the vendor is asked with nothing on disk — red', r); }

console.log('⑨ r2581 (2): a trim that keeps failing never locks the journal; a failed trim leaves the file whole');
const failingTrim = async (Mod) => {
  const dir = fresh('failtrim'); seed(dir, 5999);
  const W = standIn(); W.st.auto = false; W.st.failRewrite = true;   // the writer gone main-only: every rewrite job refused
  const asks = [], e = mk(Mod, { dir, writer: W, fetchImpl: vendor(asks) });
  e.ledger.journal({ use: 'learn', outcome: 'refused', why: 'line-A' }); e.ledger.journal({ use: 'learn', outcome: 'refused', why: 'line-B' });   // 6 001: a trim is owed
  W.land(); const afterFail = rows(dir).length; W.land(); W.land();
  W.st.auto = true; const r = await e.testRunner(); W.land();   // and a judgment after it: its reservation lands
  const j = rows(dir);
  return { afterFail, n: j.length, A: j.filter((x) => x.why === 'line-A').length, B: j.filter((x) => x.why === 'line-B').length, ok: r.ok, asks: asks.length, rewrites: W.st.rewrites, seeded: j.filter((x) => Number.isInteger(x.seq)).length };
};
{ const r = await failingTrim(DE);
  ok(r.afterFail === 5999 && r.seeded === 5648, 'a trim whose rewrite job FAILED leaves the file whole as it was (5 999 lines, every seeded row)', r);
  ok(r.A === 1 && r.B === 1 && r.ok && r.asks === 1 && r.rewrites === 1, '…the next write is a plain APPEND (no trim until the next start): its lines land, and the next judgment\'s reservation lands and is asked', r); }
{ const r = await failingTrim(engineCopy([["      jKnown = false; jTrimDue = false;\n", "      if (w.trim) jTrimDue = true; else jKnown = false;   // the shape before r2581: a failed trim armed again\n"]], 'trim-armed-again'));
  ok(r.A === 0 && !r.ok && r.asks === 0, 'CONTROL (a copy that arms the failed trim again): every write is the same refused rewrite — no line lands, the judgment refused — red', r); }

console.log('⑩ the should: a day the belt keeps whole (past 6 000 lines) never makes every write a rewrite');
const bigDay = async (Mod) => {
  const dir = fresh('bigday');
  const lines = []; for (let i = 0; i < 7000; i++) lines.push(JSON.stringify({ at: T0 - (7000 - i) * 5000, use: 'attention', outcome: 'ok', usd: 0.00001, inputTokens: 100, today: i }));
  fs.writeFileSync(path.join(dir, JF), lines.join('\n') + '\n');
  const W = standIn(), e = mk(Mod, { dir, writer: W, fetchImpl: vendor([]) });
  for (let i = 0; i < 10; i++) { e.ledger.journal({ use: 'learn', outcome: 'refused', why: `day-${i}` }); W.land(); }
  return { rewrites: W.st.rewrites, n: rows(dir).length };
};
{ const r = await bigDay(DE);
  ok(r.rewrites === 1 && r.n === 7010, 'a day of 7 000 lines (all kept by the belt): ONE rewrite, then appends — the next trim is due past 1.2 × what the last one kept', r); }
{ const r = await bigDay(engineCopy([[COUNT, COUNT.replace('Math.max(JOURNAL_MAX, jKeptFloor) * 1.2', 'JOURNAL_MAX * 1.2')]], 'trim-every-write'));   // the control writes the old trigger back on purpose — stale-pins: kept
  ok(r.rewrites === 10, 'CONTROL (a copy whose trim is due past 6 000 always): every write rewrites the whole file — red', r); }

console.log('⑪ the shoulds: the drafter\'s second look after the landing; a judgment\'s answer waits for its lines');
const textLowered = async (TMmod) => {
  const dir = fresh('textlow'), W = standIn(), asks = []; W.st.auto = false;
  const fetchImpl = async (url) => { asks.push(url); return { status: 200, ok: true, headers: { get: () => null }, json: async () => ({ choices: [{ message: { content: '{"ok":true}' } }], usage: { prompt_tokens: 40, completion_tokens: 5, cost: 0.002 } }) }; };
  const e = DE.create({ dataDir: dir, writer: W, fetchImpl, now: () => T0, tzOffset: () => 0, log: quiet, integrations: integOR, reserveLandMs: 400 });
  let cents = 100; e.attachPlugin({ peek: () => ({ enabled: true }), settings: () => ({ rules: true, dailyBudgetCents: cents, learnModel: 'flash' }) });
  const tm = TMmod.create({ integrations: integOR, ledger: e.ledger, fetchImpl, now: () => T0, log: quiet });
  const p = tm.complete({ use: 'learn', messages: [{ role: 'user', content: 'x' }], schema: {}, est: 500 }); await tick();
  cents = 0; W.st.auto = true; W.land();   // the owner lowers the budget to nothing while the drafter's reservation is written
  const r = await p; W.land();
  return { ok: r.ok, why: r.why, asks: asks.length, inFlight: e.status().today.inFlight, released: rows(dir).filter((x) => x.outcome === 'released').length };
};
{ const r = await textLowered(TM);
  ok(!r.ok && r.why === 'daily-budget' && r.asks === 0 && r.inFlight === 0 && r.released === 1, 'the drafter: a budget lowered to nothing while its reservation was written — judged again at the landing, refused (daily-budget), nothing asked, released', r); }
{ const SECOND = TSRC.slice(TSRC.indexOf("      const s2 = settings(), a2 = RL.availability("), TSRC.indexOf("    const body = Object.freeze({"));
  const r = await textLowered(MUT.load('src/server/text-model-client.js', anchored(TSRC, SECOND, "    }\n", 'text-no-second-look'), 'text-no-second-look'));
  ok(r.asks === 1, 'CONTROL (a copy of the client without its second look): the vendor is asked past the owner\'s new budget — red', r); }
const answerWaits = async (Mod) => {
  const dir = fresh('waits'), W = standIn(), asks = []; W.st.auto = false;
  const e = mk(Mod, { dir, writer: W, fetchImpl: vendor(asks) });
  let done = false; const p = e.testRunner().then((x) => { done = true; return x; });
  await tick(); W.land(); await until(() => asks.length === 1);   // the reservation lands, the vendor answers
  await until(() => W.pending(path.join(dir, 'decision-usage.json')) && W.pending(path.join(dir, JF)));
  W.land([path.join(dir, 'decision-usage.json')]); for (let k = 0; k < 20; k++) await tick();   // the counter lands, the result line not yet
  const before = done; W.land([path.join(dir, JF)]); const r = await p;
  return { before, ok: r.ok, asks: asks.length };
};
{ const r = await answerWaits(DE);
  ok(r.before === false && r.ok && r.asks === 1, 'a judgment\'s answer waits (bounded) for its own journal lines: with the counter landed and the result line still owed it has not answered; it answers once the line lands', r); }
{ const WAIT = SRC.slice(SRC.indexOf("    if (jSeq !== j0 && !(r && r.why === 'reservation-unwritten'))"), SRC.indexOf("    return r;\n  }\n  async function judgeCall("));
  const r = await answerWaits(engineCopy([[WAIT, '']], 'answer-no-wait'));
  ok(r.before === true, 'CONTROL (a copy whose answer does not wait for its lines): it answers before its result line is on disk — red', r); }

console.log('⑫ r3739: a line that is not a row is never dropped by a trim, outside the count of rows');
const CUT = '{"at":' + (T0 - 3600e3) + ',"use":"attention","call":"cut.1","outcome":"reser';   // a reservation line a stop cut mid-write
const notRowTrims = async (Mod, { damaged }) => {
  const dir = fresh('notrow'), F = path.join(dir, JF); seed(dir, 5999);
  if (damaged) { const ls = fs.readFileSync(F, 'utf8').split('\n').filter(Boolean); ls.splice(1, 1); fs.writeFileSync(F, ls.join('\n') + '\n' + CUT); }   // the file's torn tail, in the place of one row past 30 days (every trim drops it): the same count of lines
  const said = [], log = { ...quiet, log: (l) => said.push(String(l)) };
  const W = standIn(); W.st.auto = false;
  const e = mk(Mod, { dir, writer: W, fetchImpl: vendor([]), log });
  e.ledger.journal({ use: 'learn', outcome: 'refused', why: 'nr-A' }); e.ledger.journal({ use: 'learn', outcome: 'refused', why: 'nr-B' });   // 6 001 lines: a trim is owed
  W.land(); const t1 = rows(dir);                                                                          // the first trim
  for (let i = 0; i < 1200; i++) e.ledger.journal({ use: 'learn', outcome: 'refused', why: `nr-more-${i}` });   // past 1.2 × what it kept
  W.land(); const t2 = rows(dir);                                                                          // the second trim, at ONE landing
  const cut = (j) => j.filter((x) => typeof x.torn === 'string' && x.torn.includes('"cut.1"')).length, rowsOf = (j) => j.filter((x) => !x.torn).length;
  return { rewrites: W.st.rewrites, cut1: cut(t1), cut2: cut(t2), rows1: rowsOf(t1), rows2: rowsOf(t2), torn2: t2.filter((x) => x.torn).length, said: said.filter((l) => l.includes('the journal trimmed by its writer')) };
};
{ const c = await notRowTrims(DE, { damaged: false }), d = await notRowTrims(DE, { damaged: true });
  ok(d.rewrites === 2 && c.rewrites === 2 && d.cut1 === 1 && d.cut2 === 1 && d.torn2 === 1, 'a reservation line a stop cut mid-write (the file\'s torn tail: not a row) survives TWO trims, once each, nothing else torn', { d: { ...d, said: undefined }, c: { ...c, said: undefined } });
  ok(d.rows1 === c.rows1 && d.rows2 === c.rows2 && c.cut1 === 0, '…the count of rows unchanged: each trim keeps the same rows as the file without that line', { rows: [d.rows1, d.rows2], clean: [c.rows1, c.rows2] });
  ok(d.said.length === 2 && d.said.every((l) => l.includes('and 1 line(s) that are not rows as they are')) && c.said.length === 2 && c.said.every((l) => l.includes('and 0 line(s) that are not rows as they are')), '…and the trim\'s ONE journal line says how many it kept (a number only)', { d: d.said, c: c.said }); }
{ const DROPS = MUT.write('src/decision-model.js', anchored(DMSRC, "    if (!r || typeof r !== 'object' || !Number.isFinite(Number(r.at))) { keep.push(i); continue; }", "    if (!r || typeof r !== 'object' || !Number.isFinite(Number(r.at))) continue;", 'trim-drops-not-rows'), 'trim-drops-not-rows');
  const r = await notRowTrims(engineCopy([["const M = require('../decision-model.js');\n", `const M = require(${JSON.stringify(DROPS)});\n`]], 'trim-drops-not-rows'), { damaged: true });
  ok(r.cut1 === 0 && r.rewrites === 2, 'CONTROL (the engine over a copy of today\'s trim, r3739): the first trim drops the cut line — bytes no reader read, lost to a timed sweep — red', { ...r, said: undefined }); }

for (const row of copiesCensus(MUT.files, MUT.dir, repo, { minCopies: 11, label: 'CONTROL: ' })) ok(!!row.pass, row.name, row.detail);
report();

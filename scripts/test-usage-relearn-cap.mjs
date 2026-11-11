#!/usr/bin/env node
// A FOLD OWNS WHAT IT FOLDS · NO DECISION ON A MIXED BASIS (usage-relearn-stepped rounds 3–4 — split from
// test-usage-relearn-stepped under the fast tier's 10 s; its world in scripts/usage-relearn-world.mjs). src/usage-estimator.js:
//   §13 past the line cache's live cap (scaled: the same evictIdle rule at a lower cap) every identity lands, read whole at most
//       once after the epoch's prime, nothing read after the landing, ONE fold's uncached lines at a time
//   §14 the dirty mark · §15 a late row mid-fold · §16 the fast path's signature · §17 a repaired file retries at once
//   §18 a filesystem with no birth time (the inode and the proof windows decide the tail)
//   §19 NO DECISION ON A MIXED BASIS (a cold boot reads every member raw until all can be estimated; a restart seeds the last
//       rates from rates.json) · §20 the pins that bite (an uncached identity's rates = a synchronous fold's; the 4 MB stop,
//       a cached identity's rewrite under it too;
//       one fold holds uncached lines — driven by an eviction mid-fold) · §21 the basis bounded (a member whose fold throws, whose
//       file keeps changing or whose meta is starved holds its pool raw ≤ 60 s — after a throw not at all —, said by name and
//       said again when it recovers; a poisoned anchor after a restart is named too: «read raw: its estimate failed»)
//   §22 A FIRST LEARN IS NEVER STARVED BY RE-FOLDS (round 5: a cold boot under a ledger row every pass — the identities with
//       no rates go before the re-folds of those that serve stale ones) · §23 THE HOLDER OF THE ONE SLOT ALWAYS RUNS (round 6:
//       a restart with a partial seed — every identity learns, every seeded one refreshes, no turn spends nothing; the reason
//       lines read from the state, in §21)
// Each row with its planted RED (scripts/mutant-copy.mjs). Run: node scripts/test-usage-relearn-cap.mjs (~7 s, no network)
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { mutantCopies } from './mutant-copy.mjs';
import { world, same, stepper, rmWorld, bucketsAt, DAY, NOW, EST, STEP } from './usage-relearn-world.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? ' — ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 600) : '')); } };
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');

console.log('§13 A FOLD OWNS WHAT IT FOLDS — past the live cap every identity lands, read once (round 3, the MUST)');
{
  // anchor files written for N identities beside a world's ledger; the estimator's live cap scaled down (the same evictIdle
  // rule as at 128 MB — the cache refuses a newcomer once the live set would pass it)
  const T0 = NOW - 40 * DAY;
  const mkFile = (dir, key, n, acct) => { const out = []; let prev = null; for (let j = 0; j < n; j++) { const fetchedAt = Math.floor(T0 + j * ((39 * DAY) / n)); const rec = { ts: fetchedAt + 500, fetchedAt, source: 'statusline', accountId: acct, identityKey: key, buckets: bucketsAt(fetchedAt), prevFetchedAt: prev, costSince: prev ? { total: 1 + (j % 7) * 0.1, byFamily: { fable: 0.4, opus: 0.6, sonnet: 0, haiku: 0, other: 0 }, requests: 3 } : null }; out.push(JSON.stringify(rec)); prev = fetchedAt; } fs.writeFileSync(path.join(dir, 'anchors-' + key.replace(/[^\w.@-]/g, '_').slice(0, 80) + '.ndjson'), out.join('\n') + '\n'); };
  const fleet = (UE, sizes, capOf) => {
    const w = world(REPO, { seed: 91, rows: 2000 });
    const keys = sizes.map((n, k) => { const key = 'org:f' + k; mkFile(w.adir, key, n, ['sub-a', 'sub-b', 'sub-c', 'sub-d'][k % 4]); return key; });
    const bytes = keys.map((k) => fs.statSync(path.join(w.adir, 'anchors-' + k.replace(/[^\w.@-]/g, '_') + '.ndjson')).size);
    const est = new (UE || w.est.constructor)({ anchorsDir: w.adir, usageHistory: w.uh, resolveIdentity: (a) => ({ identityKey: keys[['sub-a', 'sub-b', 'sub-c', 'sub-d'].indexOf(a)] || keys[0] }), lagS: 20 });
    est.linesLiveMaxBytes = capOf(bytes); est.primeOpts = { syncMaxRows: 1e9 }; est.primeIfCold(); // the first learn's prime: each file read once an epoch (commit B)
    const r0 = new Map(est.wholeReadsOf || []), S = stepper(est);
    let maxOwn = 0; const fr = est._foldRun.bind(est); est._foldRun = (f) => { const r = fr(f); maxOwn = Math.max(maxOwn, [...est._folds.values()].filter((x) => x.own && !x.done && x.steps).length); return r; };
    for (let round = 0; round < 5; round++) { for (const k of keys) est.ratesFor(k); let t = 0; while (S.q.length && t < 5000) { S.turn(); t++; } }
    const landed = keys.filter((k) => { const c = est._rateCache.get(k); return c && !c.stale && c.rates; }).length;
    const reads = keys.map((k) => ((est.wholeReadsOf && est.wholeReadsOf.get(k)) || 0) - (r0.get(k) || 0)), primeReads = [...r0.values()].reduce((x, y) => x + y, 0);
    const w0 = est.wholeReads || 0, t0r = est.tailReads || 0, f0 = est.foldsStarted || 0;
    for (let round = 0; round < 5; round++) { for (const k of keys) est.ratesFor(k); for (const a of ['sub-a', 'sub-b', 'sub-c', 'sub-d']) est.estimateFor(a, null, NOW + round); while (S.q.length) S.turn(); }
    const after = { whole: (est.wholeReads || 0) - w0, tail: (est.tailReads || 0) - t0r, folds: (est.foldsStarted || 0) - f0 };
    // an anchor sweep appends a record to every identity: the estimates that follow read the appended bytes (the meta's tail), never a file whole
    const wS = est.wholeReads || 0, mS = est.metaTailReads || 0;
    for (const k of keys) { const fp = path.join(w.adir, 'anchors-' + k.replace(/[^\w.@-]/g, '_') + '.ndjson'), ls = fs.readFileSync(fp, 'utf8').trim().split('\n'), l = JSON.parse(ls[ls.length - 1]); fs.appendFileSync(fp, JSON.stringify({ ...l, fetchedAt: l.fetchedAt + 60e3, ts: l.ts + 60e3, prevFetchedAt: l.fetchedAt }) + '\n'); }
    for (const a of ['sub-a', 'sub-b', 'sub-c', 'sub-d']) est.estimateFor(a, null, NOW + 60e3); // past the estimate memo's 30 s
    after.sweepWhole = (est.wholeReads || 0) - wS; after.sweepMetaTail = (est.metaTailReads || 0) - mS;
    const cap = est.linesLiveMaxBytes, live = est._lineBytes || 0, admitted = keys.filter((k) => est._lineCache.has(k)).length;
    rmWorld(w);
    return { ids: keys.length, landed, reads, primeReads, after, cap, live, admitted, maxOwn, abandoned: est.foldsAbandoned || 0, total: bytes.reduce((x, y) => x + y, 0), biggest: Math.max(...bytes) };
  };
  const WORLDS = [
    ['3 identities, the cap one and a half of them (the verifier\'s 3 × 150 000 at 128 MB)', [2000, 2000, 2000], (b) => Math.floor(b[0] * 1.5)],
    ['2 identities, the cap 1.4 of one (a skeptic\'s 2 × 200 000)', [1500, 1500], (b) => Math.floor(b[0] * 1.4)],
    ['27 identities, the cap 60 % of their bytes (the owner\'s shape × 8)', [400, 320, 140, 44, 720, 22, 11, 540, 290, 110, 430, 250, 18, 900, 320, 470, 72, 220, 360, 32, 650, 140, 250, 54, 400, 790, 180], (b) => Math.floor(b.reduce((x, y) => x + y, 0) * 0.6)],
  ];
  const rs = WORLDS.map(([name, sizes, cap]) => ({ name, ...fleet(null, sizes, cap) }));
  for (const r of rs) ok(r.landed === r.ids && r.reads.every((n) => n <= 1) && r.reads.filter((n) => n === 1).length === r.ids - r.admitted && r.after.whole === 0 && r.after.tail === 0 && r.after.folds === 0 && r.after.sweepWhole === 0 && r.after.sweepMetaTail >= 1 && r.live <= r.cap && r.admitted < r.ids && r.maxOwn <= 1,
    `PAST THE CAP — ${r.name}: ${r.admitted} of ${r.ids} admitted (live ${r.live} ≤ cap ${r.cap} bytes); every identity landed (${r.landed}/${r.ids}), each read whole AT MOST ONCE after the epoch's prime (${r.reads.filter((n) => n === 1).length} not admitted: once each; ${r.admitted} admitted: from the cache — the prime read ${r.primeReads} files once), then 5 rounds of asks + estimates read nothing and fold nothing (${r.after.whole} whole, ${r.after.tail} tail, ${r.after.folds} folds), and after a sweep's append every estimate reads appended bytes only (${r.after.sweepWhole} whole, ${r.after.sweepMetaTail} meta tails); folds holding uncached lines at a time ≤ ${r.maxOwn} (the overdraft: one identity's lines, here ≤ ${r.biggest} file bytes)`, r);
  const M = mutantCopies('usage-relearn-stepped-noentry', REPO), src = read('src/usage-estimator.js'), from = "      f.file = lr ? lr.sig : this._sigNow(identityKey); f.nLines = lines.length; f.at = Date.now();";
  const EM = src.includes(from) ? require(M.write('src/usage-estimator.js', src.replace(from, "      f.file = this._lineCache.has(identityKey) ? (lr ? lr.sig : null) : 'no entry'; f.nLines = lines.length; f.at = Date.now();"), 'no-entry')) : null;
  const R = EM ? fleet(EM.UsageEstimator, WORLDS[0][1], WORLDS[0][2]) : null;
  ok(!!R && (R.landed < R.ids || R.reads.some((n) => n > 1)), `RED: «no cache entry» read as moved (round 2) ⇒ ${R && R.landed} of ${R && R.ids} landed, whole reads ${R && R.reads.join('/')}, ${R && R.abandoned} folds abandoned`, R);
  const M2 = mutantCopies('usage-relearn-stepped-overdraft', REPO), from2 = "    if (!firstsWaiting && (cachedNow || (!own && (this._coldBytes || 0) < COLD_READ_TURN_BYTES))) f.open();";
  const EM2 = src.includes(from2) ? require(M2.write('src/usage-estimator.js', src.replace(from2, '    if (!firstsWaiting) f.open();').replace("        if (!f.steps) { const own = this._ownFold && !this._ownFold.done && this._ownFold !== f; if (own || (!this._readsNoFile(f.key) && (this._coldBytes || 0) >= COLD_READ_TURN_BYTES) || (!f.first && this._firstsQueued(f))) return false; f.open(); }", '        if (!f.steps) { if (!f.first && this._firstsQueued(f)) return false; f.open(); }'), 'overdraft')) : null;
  const R2 = EM2 ? fleet(EM2.UsageEstimator, WORLDS[0][1], WORLDS[0][2]) : null;
  ok(!!R2 && R2.maxOwn > 1, `RED: no bound on the folds that hold uncached lines ⇒ ${R2 && R2.maxOwn} at a time (the cap overdrawn by more than one identity)`, R2);
}

console.log('§14 THE DIRTY MARK — rows that land with an invalidation mid-fold: the landing is stale, the next ask refolds (round 3)');
{
  const scene = async (UE) => {
    const w = world(REPO, { seed: 93, rows: 2000, pairs: [6000, 300, 120, 400], steps: [2, 30, 60, 20] });
    const est = UE ? new UE({ anchorsDir: w.adir, usageHistory: w.uh, resolveIdentity: w.est.resolveIdentity, lagS: 20 }) : w.est, S = stepper(est), key = 'email:a@x';
    est.primeOpts = { syncMaxRows: 1e9 }; est.primeIfCold();
    for (const [k] of w.IDS) { est.ratesFor(k); while (S.q.length) S.turn(); }
    est.invalidate(key); est.ratesFor(key); S.turn(); // the fold in flight
    const text = [0, 1, 2].map((k) => JSON.stringify({ rid: 'dirty-' + k, ts: NOW - 20e3 + k, sid: 'sd', model: 'claude-opus-5-5', cwd: '/w', origin: 'main', i: 900, cw5: 0, cw1: 0, cr: 10, o: 40 })).join('\n') + '\n';
    let r = await w.uh.ingestRemoteEvents('H7', 'H7', text); if (r && r.deferred) { await w.uh.ingestIndexSettled?.(); r = await w.uh.ingestRemoteEvents('H7', 'H7', text); }
    for (const [k] of w.IDS) est.invalidate(k); // the real ingest road, then server.js's invalidate of every identity
    while (S.q.length) S.turn();
    const c = est._rateCache.get(key), f0 = est.foldsStarted; est.ratesFor(key); const refold = est.foldsStarted - f0;
    while (S.q.length) S.turn();
    rmWorld(w);
    return { appended: r && r.appended, stale: !!(c && c.stale), refold };
  };
  const r = await scene(null);
  ok(r.appended === 3 && r.stale && r.refold === 1, `THE DIRTY MARK: 3 rows through the real ingest road + the invalidate mid-fold ⇒ the landing is stale (${r.stale}) and the next ask folds again (${r.refold})`, r);
  const M = mutantCopies('usage-relearn-stepped-dirty', REPO), src = read('src/usage-estimator.js'), from = '        else { const stale = f.dirty || f.late();';
  const EM = src.includes(from) ? require(M.write('src/usage-estimator.js', src.replace(from, '        else { const stale = f.late();'), 'no-dirty')) : null;
  const R = EM ? await scene(EM.UsageEstimator) : null;
  ok(!!R && !R.stale && R.refold === 0, `RED: the dirty mark ignored ⇒ the landing served fresh (${R && !R.stale}), the next ask folds nothing (${R && R.refold})`, R);
}

console.log('§15 A LATE ROW OF ITS ACCOUNTS MID-FOLD (the hub\'s own sessions — no invalidation): the landing is stale (round 3, small 1)');
{
  const scene = (UE) => {
    const w = world(REPO, { seed: 95, rows: 2000, pairs: [6000, 300, 120, 400], steps: [2, 30, 60, 20] });
    const est = UE ? new UE({ anchorsDir: w.adir, usageHistory: w.uh, resolveIdentity: w.est.resolveIdentity, lagS: 20 }) : w.est, S = stepper(est), key = 'email:a@x';
    est.primeOpts = { syncMaxRows: 1e9 }; est.primeIfCold();
    for (const [k] of w.IDS) { est.ratesFor(k); while (S.q.length) S.turn(); }
    est.invalidate(key); est.ratesFor(key); S.turn(); // the fold in flight
    w.append([w.mkRow(NOW - 3 * 3600e3, { acct: 'sub-a', i: 3000000 })]); // a late row of its account, inside its anchors' span — no invalidate
    while (S.q.length) S.turn();
    const c = est._rateCache.get(key), landedStale = !!(c && c.stale), f0 = est.foldsStarted; est.ratesFor(key); const refold = est.foldsStarted - f0; // read at the landing (a later invalidate marks this entry in place)
    w.append([w.mkRow(NOW - 10e3, { acct: 'sub-a', i: 3000 })]); // a live row (after its last anchor): moves no pair
    est.invalidate(key); est.ratesFor(key); while (S.q.length) S.turn(); est.ratesFor(key); S.turn(); const c2 = est._rateCache.get(key);
    while (S.q.length) S.turn();
    rmWorld(w);
    return { stale: landedStale, refold, liveStale: !!(c2 && c2.stale) };
  };
  const r = scene(null);
  ok(r.stale && r.refold === 1, `A LATE ROW mid-fold (sub-a, 3 h ago, no invalidation) ⇒ the landing is stale (${r.stale}) and the next ask folds again (${r.refold})`, r);
  const M = mutantCopies('usage-relearn-stepped-late', REPO), src = read('src/usage-estimator.js'), from = '        else { const stale = f.dirty || f.late();';
  const EM = src.includes(from) ? require(M.write('src/usage-estimator.js', src.replace(from, '        else { const stale = f.dirty;'), 'no-late')) : null;
  const R = EM ? scene(EM.UsageEstimator) : null;
  ok(!!R && !R.stale && R.refold === 0, `RED: arrivals not read at the landing ⇒ the mixed landing served fresh (${R && !R.stale})`, R);
}

console.log('§16 THE FAST PATH TRUSTS THE WHOLE SIGNATURE — a same-size rewrite with its mtime restored is read again (round 3, small 2)');
{
  const scene = (UE) => {
    const w = world(REPO, { seed: 97, rows: 2000, pairs: [800, 300, 120, 400], steps: [2, 30, 60, 20] });
    const est = new (UE || w.est.constructor)({ anchorsDir: w.adir, usageHistory: w.uh, resolveIdentity: w.est.resolveIdentity, lagS: 20 }), key = 'email:a@x';
    const fp = est._file(key); fs.utimesSync(fp, 1.79e9, 1.79e9); est.lines(key); const st0 = fs.statSync(fp); // a whole-second mtime: restorable exactly
    const buf = fs.readFileSync(fp); const at = buf.indexOf('"u":0.') + 6; const d = String.fromCharCode(buf[at]) === '9' ? '8' : '9'; // one digit changed in place: the same size
    const fd = fs.openSync(fp, 'r+'); fs.writeSync(fd, d, at); fs.closeSync(fd); fs.utimesSync(fp, 1.79e9, 1.79e9); // …and its mtime restored
    const st1 = fs.statSync(fp); est.invalidate(key);
    const got = est.lines(key), fresh = new (w.est.constructor)({ anchorsDir: w.adir, usageHistory: w.uh, resolveIdentity: w.est.resolveIdentity, lagS: 20 }).lines(key);
    rmWorld(w);
    return { sameSize: st1.size === st0.size, sameMtime: st1.mtimeMs === st0.mtimeMs, equal: same(got, fresh) };
  };
  const r = scene(null);
  ok(r.sameSize && r.sameMtime && r.equal, `a same-size in-place rewrite with its mtime restored (size ${r.sameSize ? 'same' : 'moved'}, mtime ${r.sameMtime ? 'same' : 'moved'}) ⇒ the cached lines equal a fresh read (${r.equal}) — the ctime moved`, r);
  const M = mutantCopies('usage-relearn-stepped-sig', REPO), src = read('src/usage-estimator.js'), from = '    if (c && c.sig === sigOf(st)) {';
  const EM = src.includes(from) ? require(M.write('src/usage-estimator.js', src.replace(from, '    if (c && c.mtimeMs === st.mtimeMs && c.size === st.size && c.ino === st.ino) {'), 'mtime-size-ino')) : null;
  const R = EM ? scene(EM.UsageEstimator) : null;
  ok(!!R && !R.equal, `RED: the fast path by mtime + size + inode (round 2) ⇒ the old lines kept (${R && !R.equal})`, R);
}

console.log('§17 A FOLD THAT THREW, ITS RECORD REPAIRED — tried again at once, not at the backoff\'s end (round 3, small 4)');
{
  const scene = (UE) => {
    const w = world(REPO, { seed: 99, rows: 2000, pairs: [3000, 300, 120, 400], steps: [2, 30, 60, 20] });
    const est = UE ? new UE({ anchorsDir: w.adir, usageHistory: w.uh, resolveIdentity: w.est.resolveIdentity, lagS: 20 }) : w.est, S = stepper(est), key = 'email:a@x';
    est.primeOpts = { syncMaxRows: 1e9 }; est.primeIfCold();
    for (const [k] of w.IDS) { est.ratesFor(k); while (S.q.length) S.turn(); }
    const f = path.join(w.adir, 'anchors-' + w.UA.anchorSlug(key) + '.ndjson'), good = fs.readFileSync(f, 'utf8'), ls = good.trim().split('\n'), last = JSON.parse(ls[ls.length - 1]);
    fs.appendFileSync(f, JSON.stringify({ ...last, fetchedAt: last.fetchedAt + 60e3, ts: last.ts + 60e3, prevFetchedAt: last.fetchedAt, buckets: { ...last.buckets, scopedWeekly: 5 } }) + '\n');
    const cw = console.warn; console.warn = () => { };
    let after = null;
    try {
      est.invalidate(key); est.ratesFor(key); while (S.q.length) S.turn(); // it threw: a backoff of 5 s
      fs.writeFileSync(f + '.tmp', good + JSON.stringify({ ...last, fetchedAt: last.fetchedAt + 60e3, ts: last.ts + 60e3, prevFetchedAt: last.fetchedAt }) + '\n'); fs.renameSync(f + '.tmp', f); // the repair
      est.invalidate(key); const f0 = est.foldsStarted; est.ratesFor(key); while (S.q.length) S.turn();
      const c = est._rateCache.get(key); after = { folds: est.foldsStarted - f0, landed: !!(c && !c.stale), failed: !!(est._foldFail && est._foldFail.get(key)) };
    } finally { console.warn = cw; }
    rmWorld(w);
    return after;
  };
  const r = scene(null);
  ok(r.folds === 1 && r.landed && !r.failed, `the poison record repaired (a rewrite) + invalidate inside the backoff ⇒ folded at once (${r.folds}) and landed (${r.landed})`, r);
  const M = mutantCopies('usage-relearn-stepped-backoff', REPO), src = read('src/usage-estimator.js'), from = '    if (ff && Date.now() < ff.retryAt && ff.sig === this._sigNow(identityKey)) return null;';
  const EM = src.includes(from) ? require(M.write('src/usage-estimator.js', src.replace(from, '    if (ff && Date.now() < ff.retryAt) return null;'), 'backoff-kept')) : null;
  const R = EM ? scene(EM.UsageEstimator) : null;
  ok(!!R && R.folds === 0 && !R.landed, `RED: the backoff kept over a repaired file ⇒ ${R && R.folds} folds, the pre-throw rates served`, R);
}

console.log('§18 A FILESYSTEM WITH NO BIRTH TIME — the inode and the proof windows carry the tail decision');
{
  const real = fs.statSync;
  fs.statSync = function (...a) { const st = real.apply(this, a); try { Object.defineProperty(st, 'birthtimeMs', { value: 0 }); } catch { } return st; };
  let rs;
  try {
    const KEY = 'email:nb', T1 = 1.7e12;
    const mk = (i, x = {}) => ({ fetchedAt: T1 + i * 60e3, ts: T1 + i * 60e3, prevFetchedAt: i ? T1 + (i - 1) * 60e3 : undefined, costSince: { total: 1 + (i % 7) * 0.1 }, buckets: { fiveHour: { u: (i % 300) / 300 }, sevenDay: { u: (i % 900) / 900 } }, ...x });
    const txt = (r) => r.map((x) => JSON.stringify(x)).join('\n') + '\n', atomic = (fp, t) => { fs.writeFileSync(fp + '.tmp', t); fs.renameSync(fp + '.tmp', fp); };
    const base = []; for (let i = 0; i < 2000; i++) base.push(mk(i));
    const scenes = {
      'two rewrites, the second grows': (fp) => { atomic(fp, txt(base.filter((r, i) => i % 40 !== 3))); atomic(fp, txt(base.map((r) => ({ ...r, slot: 'z' })).concat([mk(5000)]))); },
      'an in-place rewrite that grows': (fp) => { fs.writeFileSync(fp, txt(base.filter((r, i) => i % 40 !== 3).map((r) => ({ ...r, slot: 'x' })))); },
      'another file takes the inode': (fp) => { fs.unlinkSync(fp); const o = fp + '.other'; fs.writeFileSync(o, txt(base.map((r) => ({ ...r, slot: 'q' })))); fs.renameSync(o, fp); },
      'a plain append': (fp) => { fs.appendFileSync(fp, txt([mk(2000), mk(2001)])); },
    };
    rs = Object.entries(scenes).map(([name, fn]) => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-rls-nb-')), mkE = () => new EST.UsageEstimator({ anchorsDir: dir, usageHistory: null, resolveIdentity: () => null, lagS: 0 });
      const e = mkE(), fp = e._file(KEY); fs.writeFileSync(fp, txt(base)); e.lines(KEY); fn(fp); e.invalidate(KEY);
      const t0 = e.tailReads || 0, got = e.lines(KEY), fresh = mkE().lines(KEY), tail = (e.tailReads || 0) - t0;
      fs.rmSync(dir, { recursive: true, force: true });
      return { name, equal: same(got, fresh), tail, btime: real(path.join(os.tmpdir())).birthtimeMs !== undefined };
    });
  } finally { fs.statSync = real; }
  ok(rs.every((x) => x.equal) && rs.find((x) => x.name === 'a plain append').tail === 1, `with every birth time reported 0 (some network mounts): ${rs.map((x) => `${x.name} ${x.equal ? '=' : '≠'}${x.tail ? ' (tail)' : ''}`).join(' · ')} — the inode and the proof windows decide (the ctime only guards the fast path: an append moves it too)`, rs);
}
console.log('§19 NO DECISION ON A MIXED BASIS — a cold boot reads every member raw until all can be estimated; a restart remembers (round 4)');
{
  const T0 = NOW - 40 * DAY, ACC = ['sub-a', 'sub-b', 'sub-c', 'sub-d'];
  const mk = (dir, key, n, acct) => { const out = []; let prev = null; for (let j = 0; j < n; j++) { const fetchedAt = Math.floor(T0 + j * ((39 * DAY) / n)); out.push(JSON.stringify({ ts: fetchedAt + 500, fetchedAt, source: 'statusline', accountId: acct, identityKey: key, buckets: bucketsAt(fetchedAt), prevFetchedAt: prev, costSince: prev ? { total: 1 + (j % 7) * 0.1, byFamily: { fable: 0.4, opus: 0.6, sonnet: 0, haiku: 0, other: 0 }, requests: 3 } : null })); prev = fetchedAt; } fs.writeFileSync(path.join(dir, 'anchors-' + key.replace(/[^\w.@-]/g, '_').slice(0, 80) + '.ndjson'), out.join('\n') + '\n'); };
  const OWNER = [1, 2, 2, 1, 152, 3, 3, 6, 11290, 7672, 3558, 3916, 4360, 1990, 5272, 3871, 3897, 3625, 217, 4776, 6132, 6682, 1248, 4023, 2741, 5, 6284];
  const boot = (UE, scale, { restart = false } = {}) => {
    const w = world(REPO, { seed: 101, rows: 2000 });
    const keys = OWNER.map((n, k) => { const key = 'org:b' + k; mk(w.adir, key, Math.max(1, Math.round(n * scale)), 'm' + k); return key; });
    const members = keys.map((k, i) => 'm' + i), keyOf = (a) => ({ identityKey: keys[members.indexOf(a)] || null });
    const mkEst = () => { const e = new (UE || w.est.constructor)({ anchorsDir: w.adir, usageHistory: w.uh, resolveIdentity: keyOf, lagS: 20 }); e.primeOpts = { syncMaxRows: 1e9 }; e.primeIfCold(); return e; };
    if (restart) { const e0 = mkEst(), S0 = stepper(e0); for (let r = 0; r < 60 && keys.some((k) => !e0._rateCache.get(k)); r++) { for (const k of keys) e0.ratesFor(k); while (S0.q.length) S0.turn(); } e0.flushRates(); e0.close(); } // the hub before its restart
    const est = mkEst(), S = stepper(est);
    const passes = [];
    for (let pass = 0; pass < 80; pass++) {
      const raw = est.basisRaw(members); // the decision's basis, asked first (as the pool engine asks it)
      const reads = members.map((id) => (raw ? 'raw' : (est.estimateFor(id, null, NOW + pass) ? 'est' : 'raw')));
      passes.push({ raw, mixed: reads.includes('raw') && reads.includes('est'), est: reads.filter((x) => x === 'est').length });
      if (!raw && reads.every((x) => x === 'est')) break;
      let t = 0; while (S.q.length && t < 3) { S.turn(); t++; }
    }
    rmWorld(w);
    return { scale, restart, passes: passes.length, mixed: passes.filter((x) => x.mixed).length, firstRaw: passes[0].raw, firstEst: passes[0].est, endEst: passes[passes.length - 1].est, seeded: est.ratesSeeded || 0 };
  };
  const rs = [boot(null, 0.05), boot(null, 0.1)]; // the owner's shape scaled (× 8: the verifier's q.js boot scene)
  for (const r of rs) ok(r.mixed === 0 && r.firstRaw && r.endEst === OWNER.length, `A COLD BOOT at the owner's shape × ${r.scale} (27 identities, no rates.json): ${r.passes} passes until every member could be estimated — the first decision reads all ${OWNER.length} RAW, ${r.mixed} passes mixed, then all ${r.endEst} estimated`, r);
  const rr = boot(null, 0.1, { restart: true });
  ok(rr.mixed === 0 && !rr.firstRaw && rr.firstEst === OWNER.length && rr.seeded >= OWNER.length, `A RESTART: the last rates seeded from rates.json (${rr.seeded}) ⇒ the first decision reads every member ESTIMATED at once (${rr.firstEst} of ${OWNER.length}), never mixed — the hub does not forget`, rr);
  const M = mutantCopies('usage-relearn-stepped-basis', REPO), src = read('src/usage-estimator.js'), from = '  basisRaw(accountIds) {\n';
  const EM = src.includes(from) ? require(M.write('src/usage-estimator.js', src.replace(from, '  basisRaw(accountIds) { return false;\n'), 'mixed')) : null;
  const R = EM ? boot(EM.UsageEstimator, 0.1) : null;
  ok(!!R && R.mixed > 0, `RED: no basis rule ⇒ ${R && R.mixed} of ${R && R.passes} passes rank members on a MIXED basis (estimated beside raw)`, R);
  const M2 = mutantCopies('usage-relearn-stepped-noseed', REPO), from2 = '  _seedRates() {\n    this._seeded = true;\n';
  const EM2 = src.includes(from2) ? require(M2.write('src/usage-estimator.js', src.replace(from2, '  _seedRates() {\n    this._seeded = true; return;\n'), 'no-seed')) : null;
  const R2 = EM2 ? boot(EM2.UsageEstimator, 0.1, { restart: true }) : null;
  ok(!!R2 && R2.firstRaw && R2.firstEst < OWNER.length, `RED: rates.json not read back ⇒ a restart's first decision reads raw (${R2 && R2.firstRaw}), ${R2 && R2.firstEst} of ${OWNER.length} estimated — it forgot`, R2);
}

console.log('§20 THE PINS THAT BITE — the rates past the cap; the 4 MB stop; one fold holds uncached lines, driven (round 4)');
{
  const T0 = NOW - 40 * DAY;
  const mk = (dir, key, n, acct) => { const out = []; let prev = null; for (let j = 0; j < n; j++) { const fetchedAt = Math.floor(T0 + j * ((39 * DAY) / n)); out.push(JSON.stringify({ ts: fetchedAt + 500, fetchedAt, source: 'statusline', accountId: acct, identityKey: key, buckets: bucketsAt(fetchedAt), prevFetchedAt: prev, costSince: prev ? { total: 1 + (j % 7) * 0.1, byFamily: { fable: 0.4, opus: 0.6, sonnet: 0, haiku: 0, other: 0 }, requests: 3 } : null })); prev = fetchedAt; } const f = path.join(dir, 'anchors-' + key.replace(/[^\w.@-]/g, '_').slice(0, 80) + '.ndjson'); fs.writeFileSync(f, out.join('\n') + '\n'); return fs.statSync(f).size; };
  // (1) an identity the cache refused: its rates EQUAL a synchronous fold's over its own lines
  const pastCap = (UE) => {
    const w = world(REPO, { seed: 103, rows: 2000 }), keys = ['org:p0', 'org:p1', 'org:p2'], sizes = keys.map((k, i) => mk(w.adir, k, 1200, ['sub-a', 'sub-b', 'sub-c'][i]));
    const est = new (UE || w.est.constructor)({ anchorsDir: w.adir, usageHistory: w.uh, resolveIdentity: (a) => ({ identityKey: keys[['sub-a', 'sub-b', 'sub-c'].indexOf(a)] }), lagS: 20 });
    est.linesLiveMaxBytes = Math.floor(sizes[0] * 1.5); est.primeOpts = { syncMaxRows: 1e9 }; est.primeIfCold();
    const S = stepper(est); for (let r = 0; r < 4; r++) { for (const k of keys) est.ratesFor(k); while (S.q.length) S.turn(); }
    const out = keys.filter((k) => !est._lineCache.has(k)).map((k) => { const lines = new (w.est.constructor)({ anchorsDir: w.adir, usageHistory: w.uh, resolveIdentity: () => null, lagS: 20 }).lines(k); const sync = EST.learnRates(lines, { priors: est.priorsFor(k), costFn: est._costFn(est.accountIdsFor(k, [], lines)) }); const c = est._rateCache.get(k); return { k, equal: !!c && same(c.rates, sync) }; });
    rmWorld(w); return out;
  };
  const pc = pastCap(null);
  ok(pc.length >= 2 && pc.every((x) => x.equal), `THE RATES PAST THE CAP: ${pc.length} identities the cache refused — each one's landed rates equal a synchronous fold over its own lines (${pc.map((x) => x.equal).join(' / ')})`, pc);
  const M = mutantCopies('usage-relearn-stepped-cacheonly', REPO), src = read('src/usage-estimator.js'), from = "      const lines = this.lines(identityKey), lr = this._lastRead && this._lastRead.key === identityKey ? this._lastRead : null;";
  const EM = src.includes(from) ? require(M.write('src/usage-estimator.js', src.replace(from, "      this.lines(identityKey); const lines = (this._lineCache.get(identityKey) || {}).lines || [], lr = this._lastRead && this._lastRead.key === identityKey ? this._lastRead : null;"), 'cache-only')) : null;
  const PR = EM ? pastCap(EM.UsageEstimator) : null;
  ok(!!PR && PR.some((x) => !x.equal), `RED: a fold that folds only what the cache holds ⇒ ${PR && PR.filter((x) => !x.equal).length} uncached identities' rates differ from the synchronous fold`, PR);
  // (2) THE 4 MB STOP: one handler asks 8 cold identities of ~1.5 MB — the files read whole in that turn stop past 4 MB (the first never deferred)
  const stop = (UE) => {
    const w = world(REPO, { seed: 105, rows: 2000 }), keys = [0, 1, 2, 3, 4, 5].map((i) => 'org:s' + i), sizes = keys.map((k) => mk(w.adir, k, 3000, 'sub-a'));
    const est = new (UE || w.est.constructor)({ anchorsDir: w.adir, usageHistory: w.uh, resolveIdentity: () => null, lagS: 20 }); est.primeOpts = { syncMaxRows: 1e9 }; est.primeIfCold();
    const S = stepper(est); est.reloadRates(); // cold again: no line cache, no rates (a restart's state, the prime done)
    const w0 = est.wholeReads || 0; for (const k of keys) est.ratesFor(k); const inTurn = (est.wholeReads || 0) - w0; // ONE handler, one turn
    let t = 0; while (S.q.length && t < 400) { S.turn(); t++; }
    const landed = keys.filter((k) => est._rateCache.get(k) && est._rateCache.get(k).rates).length;
    rmWorld(w); return { inTurn, bytesInTurn: inTurn * sizes[0], landed, ids: keys.length, file: sizes[0] };
  };
  const st = stop(null);
  ok(st.inTurn * st.file <= 4 * 1024 * 1024 + st.file && st.inTurn < st.ids && st.landed === st.ids, `THE 4 MB STOP: one handler asks ${st.ids} cold identities of ${(st.file / 1048576).toFixed(2)} MB — ${st.inTurn} read whole in that turn (${(st.bytesInTurn / 1048576).toFixed(1)} MB ≤ 4 MB + the first), the rest on the next turns; all ${st.landed} landed`, st);
  const M2 = mutantCopies('usage-relearn-stepped-nostop', REPO), from2 = 'const COLD_READ_TURN_BYTES = 4 * 1024 * 1024;';
  const EM2 = src.includes(from2) ? require(M2.write('src/usage-estimator.js', src.replace(from2, 'const COLD_READ_TURN_BYTES = Infinity;'), 'no-stop')) : null;
  const SR = EM2 ? stop(EM2.UsageEstimator) : null;
  ok(!!SR && SR.inTurn === SR.ids, `RED: the stop removed ⇒ the one handler reads all ${SR && SR.inTurn} files whole (${SR && (SR.bytesInTurn / 1048576).toFixed(1)} MB in one turn)`, SR);
  // (2b) round 5 (small): an identity the cache HOLDS, its file rewritten in place (same length, a changed byte), is a cold read too
  const restop = (UE) => {
    const w = world(REPO, { seed: 115, rows: 2000 }), keys = [0, 1, 2, 3, 4, 5].map((i) => 'org:w' + i), sizes = keys.map((k) => mk(w.adir, k, 3000, 'sub-a'));
    const est = new (UE || w.est.constructor)({ anchorsDir: w.adir, usageHistory: w.uh, resolveIdentity: () => null, lagS: 20 }); est.primeOpts = { syncMaxRows: 1e9 }; est.primeIfCold();
    const S = stepper(est); est.reloadRates();
    for (let r = 0; r < 40 && keys.some((k) => !(est._rateCache.get(k) || {}).rates); r++) { for (const k of keys) est.ratesFor(k); while (S.q.length) S.turn(); }
    const cached = keys.filter((k) => est._lineCache.has(k)).length;
    for (const k of keys) { const f = path.join(w.adir, 'anchors-' + k.replace(/[^\w.@-]/g, '_').slice(0, 80) + '.ndjson'); fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace('"requests":3', '"requests":4')); est.invalidate(k); } // in place: the inode kept
    const w0 = est.wholeReads || 0; for (const k of keys) est.ratesFor(k); const inTurn = (est.wholeReads || 0) - w0; // ONE handler, one turn
    let t = 0; while (S.q.length && t < 400) { S.turn(); t++; }
    const landed = keys.filter((k) => est._rateCache.get(k) && est._rateCache.get(k).rates && !est._rateCache.get(k).stale).length;
    rmWorld(w); return { cached, inTurn, ids: keys.length, file: sizes[0], landed };
  };
  const rw = restop(null);
  ok(rw.cached === rw.ids && rw.inTurn * rw.file <= 4 * 1024 * 1024 + rw.file && rw.inTurn < rw.ids && rw.landed === rw.ids, `THE 4 MB STOP BINDS A REWRITE: ${rw.ids} identities the cache holds, each file (${(rw.file / 1048576).toFixed(2)} MB) rewritten in place ⇒ ${rw.inTurn} read whole in the one handler's turn (${(rw.inTurn * rw.file / 1048576).toFixed(1)} MB ≤ 4 MB + the first), the rest after; all ${rw.landed} landed fresh`, rw);
  const M2b = mutantCopies('usage-relearn-stepped-cachedopen', REPO), from2b = '    const cachedNow = this._readsNoFile(identityKey);';
  const EM2b = src.includes(from2b) ? require(M2b.write('src/usage-estimator.js', src.replace(from2b, '    const cachedNow = this._lineCache.has(identityKey);'), 'cached-open')) : null;
  const RW = EM2b ? restop(EM2b.UsageEstimator) : null;
  ok(!!RW && RW.inTurn === RW.ids, `RED: «the cache holds it» taken for «no read» (round 4) ⇒ the handler reads all ${RW && RW.inTurn} rewritten files whole in one turn`, RW);
  // (3) ONE FOLD HOLDS UNCACHED LINES — driven: a cached fold's entry evicted mid-fold (evictIdle's live block) while another fold owns uncached lines
  const evict = (UE) => {
    const w = world(REPO, { seed: 107, rows: 2000 }), keys = ['org:e0', 'org:e1'], sizes = keys.map((k, i) => mk(w.adir, k, 5000, ['sub-a', 'sub-b'][i]));
    const est = new (UE || w.est.constructor)({ anchorsDir: w.adir, usageHistory: w.uh, resolveIdentity: () => null, lagS: 20 });
    est.linesLiveMaxBytes = Math.floor(sizes[0] * 1.3); est.primeOpts = { syncMaxRows: 1e9 }; est.primeIfCold();
    const S = stepper(est); est.reloadRates(); est.linesLiveMaxBytes = Math.floor(sizes[0] * 1.3);
    est.ratesFor(keys[0]); // A: admitted (the cache holds its lines)
    S.turn(); est.ratesFor(keys[1]); // B: refused — the fold that owns uncached lines
    let maxOut = 0; const sample = () => { const n = [...est._folds.values()].filter((f) => f.steps && !f.done && est._lineCache.get(f.key)?.lines !== f.lines).length; if (n > maxOut) maxOut = n; };
    const fr = est._foldRun.bind(est); est._foldRun = (f) => { const r = fr(f); sample(); return r; };
    const aIn = est._folds.has(keys[0]) && est._lineCache.has(keys[0]), bOwn = !!(est._ownFold && est._ownFold.key === keys[1]);
    est._lineCache.delete(keys[0]); // evictIdle's live block lets A's lines go mid-fold
    let t = 0; while (S.q.length && t < 400) { S.turn(); t++; }
    for (let r = 0; r < 4; r++) { for (const k of keys) est.ratesFor(k); let u = 0; while (S.q.length && u < 400) { S.turn(); u++; } }
    const landed = keys.filter((k) => est._rateCache.get(k) && est._rateCache.get(k).rates).length;
    rmWorld(w); return { aIn, bOwn, maxOut, yielded: est.foldsYielded || 0, landed };
  };
  const ev = evict(null);
  ok(ev.aIn && ev.bOwn && ev.maxOut <= 1 && ev.yielded >= 1 && ev.landed === 2, `ONE FOLD HOLDS UNCACHED LINES, judged at every chunk and every turn's start: A's entry evicted mid-fold while B owns uncached lines ⇒ A yields (${ev.yielded}), folds holding lines outside the cache at any chunk ≤ ${ev.maxOut}; both land after (${ev.landed})`, ev);
  const M3 = mutantCopies('usage-relearn-stepped-nochunkown', REPO), from3 = "  _ownJudge(f) {\n";
  const EM3 = src.includes(from3) ? require(M3.write('src/usage-estimator.js', src.replace(from3, "  _ownJudge(f) { return false;\n"), 'no-chunk-own')) : null;
  const ER = EM3 ? evict(EM3.UsageEstimator) : null;
  ok(!!ER && ER.maxOut > 1, `RED: ownership judged only at the open (no judgement at a chunk or a turn) ⇒ ${ER && ER.maxOut} folds hold lines outside the cache at once`, ER);
}
console.log('§21 THE BASIS IS BOUNDED — a member that cannot learn holds its pool raw ≤ 60 s (after a throw: not at all), said by name, said again when it recovers (rounds 4b + 5)');
{
  const T0 = NOW - 40 * DAY;
  const mk = (dir, key, n, acct, poison = false) => { const out = []; let prev = null; for (let j = 0; j < n; j++) { const fetchedAt = Math.floor(T0 + j * ((39 * DAY) / n)); const b = bucketsAt(fetchedAt); if (poison && j === n - 1) b.scopedWeekly = 5; out.push(JSON.stringify({ ts: fetchedAt + 500, fetchedAt, source: 'statusline', accountId: acct, identityKey: key, buckets: b, prevFetchedAt: prev, costSince: prev ? { total: 1 + (j % 7) * 0.1, byFamily: { fable: 0.4, opus: 0.6, sonnet: 0, haiku: 0, other: 0 }, requests: 3 } : null })); prev = fetchedAt; } const f = path.join(dir, 'anchors-' + key.replace(/[^\w.@-]/g, '_').slice(0, 80) + '.ndjson'); fs.writeFileSync(f, out.join('\n') + '\n'); return f; };
  const ALONE = /\[usage\] org:pp (has no rates after \d+ s \(.+\) — the pool estimates its other members and reads it raw|has no read of its file after \d+ s \(.+\) — the pool estimates its members without waiting for it|is read raw: its estimate failed \(.+\) — the pool estimates its other members)/;
  const BACK = /\[usage\] org:pp (has rates again — estimated with its pool|is estimated again \(.+\) — with its pool)/;
  const members = ['h0', 'h1', 'h2', 'pp'], keys = ['org:h0', 'org:h1', 'org:h2', 'org:pp'];
  const listen = () => { const said = [], cw = console.warn, cl = console.log; console.warn = (...a) => said.push(a.join(' ')); console.log = (...a) => said.push(a.join(' ')); return { said, off: () => { console.warn = cw; console.log = cl; } }; };
  const sum = (said) => ({ alone: said.filter((l) => ALONE.test(l)), back: said.filter((l) => BACK.test(l)) });
  const scene = (UE, kind) => {
    const w = world(REPO, { seed: 109, rows: 2000 });
    const files = keys.map((k, i) => mk(w.adir, k, i === 3 ? (kind === 'storm' ? 4000 : 400) : 300, members[i], kind === 'throw' && i === 3));
    const est = new (UE || w.est.constructor)({ anchorsDir: w.adir, usageHistory: w.uh, resolveIdentity: (a) => ({ identityKey: keys[members.indexOf(a)] || null }), lagS: 20 });
    est.primeOpts = { syncMaxRows: 1e9 }; est.primeIfCold();
    const S = stepper(est), L = listen(), realNow = Date.now; let shift = 0; Date.now = () => realNow() + shift;
    const read = (k) => { const raw = est.basisRaw(members); return { raw, reads: members.map((id) => (raw ? 'raw' : (est.estimateFor(id, null, NOW + k) ? 'est' : 'raw'))) }; };
    const storm = (k) => fs.appendFileSync(files[3], JSON.stringify({ fetchedAt: realNow() + k, ts: realNow() + k, accountId: 'pp', identityKey: 'org:pp', buckets: bucketsAt(NOW) }) + '\n');
    let early = null, after = null, late = null, back = null;
    try {
      for (let k = 0; k < 10; k++) { if (kind === 'storm') storm(k); early = read(k); let t = 0; while (S.q.length && t < 2) { S.turn(); t++; } } // the first passes (< 60 s): every first learn under way
      if (kind === 'starve') { est._meta.delete('org:pp'); fs.appendFileSync(files[3], '{}\n'); est._coldBytes = 1e12; read(40); } // its meta gone, the turn's budget spent
      shift = 61e3; if (kind === 'starve') est._coldBytes = 1e12; if (kind === 'storm') storm(61); after = read(99);
      shift = 600e3; if (kind === 'starve') est._coldBytes = 1e12; if (kind === 'storm') storm(600); late = read(600); // ten minutes on
      if (kind === 'throw') mk(w.adir, 'org:pp', 400, 'pp'); // the record repaired (its fold tried again at once — §17)
      for (let k = 0; k < 30 && !sum(L.said).back.length; k++) { if (kind === 'starve') est._coldBytes = 0; back = read(700 + k); let t = 0; while (S.q.length && t < 4) { S.turn(); t++; } } // the storm over, the budget back
    } finally { Date.now = realNow; L.off(); }
    rmWorld(w);
    const x = sum(L.said), at = kind === 'throw' ? early : after;
    return { kind, raw: at.raw, healthy: at.reads.slice(0, 3).every((v) => v === 'est'), problemRaw: at.reads[3] === 'raw', lateRaw: late.raw, said: x.alone.length, back: x.back.length, backEst: !!back && !back.raw && back.reads.every((v) => v === 'est'), line: (x.alone[0] || '').slice(0, 150), again: (x.back[0] || '').slice(0, 90) };
  };
  const WHEN = { throw: 'at once after its fold threw (pass 10, < 60 s)', storm: 'at 61 s', starve: 'at 61 s' };
  const WHY = { throw: /\(its fold threw \(/, storm: /\(its file changed \d+ times since its first learn began\)/, starve: /\(the turn's cold-read budget was spent when it was asked\)/ }; // round 6: the reason from the state
  for (const kind of ['throw', 'storm', 'starve']) {
    const x = scene(null, kind);
    ok(!x.raw && x.healthy && (kind === 'starve' || x.problemRaw) && !x.lateRaw && x.said === 1 && WHY[kind].test(x.line) && x.back === 1 && x.backEst, `BOUNDED (${kind}) ${WHEN[kind]}: its pool not held raw — 3 healthy members estimated, the one that cannot learn ${kind === 'starve' ? 'on what it has (its estimate memo)' : 'read raw alone'}, said once by name («${x.line}»); recovered ⇒ said again («${x.again}») and all 4 estimated`, x);
  }
  // the poison after a restart: rates.json holds that member's rates ⇒ basisRaw is false, but its estimate throws on the poisoned anchor
  const restart = (UE) => {
    const w = world(REPO, { seed: 111, rows: 2000 }), files = keys.map((k, i) => mk(w.adir, k, i < 3 ? 3000 : 300, members[i])); // the healthy ones past a turn's step: their relearn does not land inside the first ask
    const mkE = () => { const e = new (UE || w.est.constructor)({ anchorsDir: w.adir, usageHistory: w.uh, resolveIdentity: (a) => ({ identityKey: keys[members.indexOf(a)] || null }), lagS: 20 }); e.primeOpts = { syncMaxRows: 1e9 }; e.primeIfCold(); return e; };
    const e0 = mkE(), S0 = stepper(e0); for (let r = 0; r < 20 && keys.some((k) => !(e0._rateCache.get(k) || {}).rates); r++) { for (const k of keys) e0.ratesFor(k); while (S0.q.length) S0.turn(); } e0.flushRates(); e0.close(); // the hub before its restart
    mk(w.adir, 'org:pp', 300, 'pp', true); // its last record poisoned after rates.json was written
    const est = mkE(), S = stepper(est), L = listen(); let first = null, back = null, seeded = 0, marked = false;
    try {
      const read = (k) => { const raw = est.basisRaw(members); return { raw, reads: members.map((id) => { if (raw) return 'raw'; const e = est.estimateFor(id, null, NOW + k); if (e && e.ratesSeeded) marked = true; return e ? 'est' : 'raw'; }) }; };
      first = read(0); seeded = est.ratesSeeded || 0;
      for (let k = 1; k < 6; k++) { read(k); let t = 0; while (S.q.length && t < 3) { S.turn(); t++; } }
      mk(w.adir, 'org:pp', 300, 'pp'); // repaired
      for (let k = 0; k < 30 && !sum(L.said).back.length; k++) { back = read(40 + k); let t = 0; while (S.q.length && t < 4) { S.turn(); t++; } }
    } finally { L.off(); }
    rmWorld(w); const x = sum(L.said);
    return { seeded, raw: first.raw, healthy: first.reads.slice(0, 3).every((v) => v === 'est'), problemRaw: first.reads[3] === 'raw', marked, said: x.alone.length, back: x.back.length, backEst: !!back && back.reads.every((v) => v === 'est'), line: (x.alone[0] || '').slice(0, 150), again: (x.back[0] || '').slice(0, 110) };
  };
  const rp = restart(null);
  ok(rp.seeded >= 4 && !rp.raw && rp.healthy && rp.problemRaw && rp.marked && rp.said === 1 && rp.back === 1 && rp.backEst, `THE POISON AFTER A RESTART (its rates in the seed): basisRaw false, 3 estimated on the seeded rates (marked ratesSeeded), the poisoned member read raw and NAMED («${rp.line}»); repaired ⇒ «${rp.again}»`, rp);
  const src = read('src/usage-estimator.js');
  const mut = (tag, from, to) => { const M = mutantCopies('usage-relearn-stepped-' + tag, REPO); return src.includes(from) ? require(M.write('src/usage-estimator.js', src.replace(from, to), tag)) : null; };
  const E60 = mut('unbounded', 'age >= (this.basisHoldMaxMs || BASIS_HOLD_MAX_MS) ?', 'false ?');
  const R60 = E60 ? ['storm', 'starve'].map((k) => scene(E60.UsageEstimator, k)) : null;
  ok(!!R60 && R60.every((x) => x.raw && x.lateRaw && !x.healthy), `RED: the 60 s removed (the hold unbounded) ⇒ ${R60 && R60.filter((x) => x.lateRaw).length} of 2 pools raw for good (${R60 && R60.map((x) => x.kind).join(', ')}: raw at 61 s and at 10 min)`, R60);
  const ETH = mut('nothrow', 'const why = failed ? `its fold threw (${failed.why})` :', 'const why = false ? `its fold threw (${failed.why})` :');
  const RTH = ETH ? scene(ETH.UsageEstimator, 'throw') : null;
  ok(!!RTH && RTH.raw && !RTH.healthy, `RED: «after a throw» removed ⇒ the throwing member holds its pool raw at once after the throw (raw ${RTH && RTH.raw}) — until the 60 s`, RTH);
  const ENM = mut('unnamed', "this._sayAlone(ik, String((e && e.message) || e).slice(0, 120), 0, 'estimate'); }", 'void 0; }');
  const RNM = ENM ? restart(ENM.UsageEstimator) : null;
  ok(!!RNM && RNM.problemRaw && RNM.said === 0, `RED: a failed estimate not named ⇒ the poisoned member read raw with ${RNM && RNM.said} lines naming it`, RNM);
  // round 6: THE REASON FROM THE STATE — a fold still running past the 60 s, one waiting behind another's (round 5 said «its file
  // keeps changing» of files nobody touched); one chunk a turn (relearnStepLines 250), the clock moved by hand
  const reasonScene = (UE, kind) => {
    const w = world(REPO, { seed: 119, rows: 2000 }), ms = ['h0', 'bg', 'pp'], ks = ['org:h0', 'org:bg', 'org:pp'];
    const files = ks.map((k, i) => mk(w.adir, k, kind === 'running' ? [300, 300, 8000][i] : [300, 6000, 6000][i], ms[i]));
    const est = new (UE || w.est.constructor)({ anchorsDir: w.adir, usageHistory: w.uh, resolveIdentity: (a) => ({ identityKey: ks[ms.indexOf(a)] || null }), lagS: 20 });
    const cap = kind === 'behind' ? Math.floor(fs.statSync(files[0]).size * 3) : 0; // behind: h0 admitted, bg and pp past the cap
    if (cap) est.linesLiveMaxBytes = cap; est.primeOpts = { syncMaxRows: 1e9 }; est.primeIfCold(); if (cap) est.linesLiveMaxBytes = cap; est.relearnStepLines = 250;
    const S = stepper(est), Lx = listen(), realNow = Date.now; let shift = 0; Date.now = () => realNow() + shift;
    try { for (let k = 0; k < 10; k++) { est.basisRaw(ms); let u = 0; while (S.q.length && u < 2) { S.turn(); u++; } } shift = 61e3; est.basisRaw(ms); } finally { Date.now = realNow; Lx.off(); }
    const lineOf = (k) => (Lx.said.find((l) => l.includes(`[usage] ${k} has no rates after`)) || '').slice(0, 170);
    rmWorld(w); return { kind, pp: lineOf('org:pp'), bg: lineOf('org:bg') };
  };
  const rr = reasonScene(null, 'running'), rb = reasonScene(null, 'behind');
  ok(/\(its fold is still running \(\d+ of 32 chunks\)\)/.test(rr.pp), `THE REASON — A FOLD STILL RUNNING at 61 s (8 000 lines, one chunk a turn): «${rr.pp}»`, rr);
  ok(/\(it waits behind org:bg's fold \(the one fold that holds lines outside the cache\)\)/.test(rb.pp) && /\(its fold is still running/.test(rb.bg), `THE REASON — WAITING BEHIND ANOTHER'S FOLD (both past the cache's cap): «${rb.pp}» · its holder «${rb.bg.slice(0, 70)}…»`, rb);
  const EGS = mut('guess', ": moves ? `its file changed ${moves} times since its first learn began` : this._waitWhy(fold && !fold.done ? fold : null)) : null;", ": 'its file keeps changing — no fold of it lands') : null;");
  const RGS = EGS ? reasonScene(EGS.UsageEstimator, 'running') : null;
  ok(!!RGS && /its file keeps changing/.test(RGS.pp), `RED: round 5's guess ⇒ «${RGS && RGS.pp.slice(0, 90)}…» of a file nobody touched`, RGS);
  const EBK = mut('noback', '  _sayBack(ik) {\n', '  _sayBack(ik) { return;\n');
  const RBK = EBK ? scene(EBK.UsageEstimator, 'throw') : null;
  ok(!!RBK && RBK.said === 1 && RBK.back === 0, `RED: the recovery unsaid ⇒ the journal ends on «${RBK && RBK.line.slice(0, 40)}…» (${RBK && RBK.back} lines after the repair)`, RBK);
}

console.log('§22 A FIRST LEARN IS NEVER STARVED BY RE-FOLDS — a cold boot under a ledger row every pass (every identity invalidated): no rates goes before stale rates (round 5)');
{
  const T0 = NOW - 40 * DAY, OWNER = [1, 2, 2, 1, 152, 3, 3, 6, 11290, 7672, 3558, 3916, 4360, 1990, 5272, 3871, 3897, 3625, 217, 4776, 6132, 6682, 1248, 4023, 2741, 5, 6284];
  const mk = (dir, key, n, acct) => { const out = []; let prev = null; for (let j = 0; j < n; j++) { const fetchedAt = Math.floor(T0 + j * ((39 * DAY) / n)); out.push(JSON.stringify({ ts: fetchedAt + 500, fetchedAt, source: 'statusline', accountId: acct, identityKey: key, buckets: bucketsAt(fetchedAt), prevFetchedAt: prev, costSince: prev ? { total: 1 + (j % 7) * 0.1, byFamily: { fable: 0.4, opus: 0.6, sonnet: 0, haiku: 0, other: 0 }, requests: 3 } : null })); prev = fetchedAt; } fs.writeFileSync(path.join(dir, 'anchors-' + key.replace(/[^\w.@-]/g, '_').slice(0, 80) + '.ndjson'), out.join('\n') + '\n'); };
  const rows = (UE, scale, perPass, PASSES) => {
    const w = world(REPO, { seed: 113, rows: 2000 }), sizes = OWNER.map((n) => Math.max(1, Math.round(n * scale)));
    const keys = sizes.map((n, k) => { const key = 'org:r' + k; mk(w.adir, key, n, 'm' + k); return key; });
    const members = keys.map((k, i) => 'm' + i), keyOf = (a) => ({ identityKey: keys[members.indexOf(a)] || null });
    const est = new (UE || w.est.constructor)({ anchorsDir: w.adir, usageHistory: w.uh, resolveIdentity: keyOf, lagS: 20 }); est.primeOpts = { syncMaxRows: 1e9 }; est.primeIfCold();
    const S = stepper(est), cw = console.warn, cl = console.log; console.warn = () => { }; console.log = () => { };
    let all = -1, pass = 0;
    try {
      for (; pass < PASSES; pass++) {
        for (const k of keys) est.invalidate(k); // a ledger row: every identity invalidated (server.js's row hook)
        const raw = est.basisRaw(members); if (!raw) for (const id of members) est.estimateFor(id, null, NOW + pass); // the pass's decision
        if (keys.every((k) => (est._rateCache.get(k) || {}).rates)) { all = pass; break; }
        for (let t = 0; t < perPass && S.q.length; t++) S.turn(); // the pass's turns, counted
      }
    } finally { console.warn = cw; console.log = cl; }
    const without = keys.filter((k) => !(est._rateCache.get(k) || {}).rates).length;
    rmWorld(w); return { scale, perPass, lines: sizes.reduce((a, b) => a + b, 0), all, passes: pass, without, stale: est.landedStale || 0, idle: est.turnsIdle || 0 };
  };
  const SCALE = 0.25, PER = 2, rs = rows(null, SCALE, PER, 120), BOUND = Math.ceil(rs.lines / (PER * STEP)) + 4; // the first learns' lines at the pass's step budget, +4 passes
  ok(rs.all >= 0 && rs.all <= BOUND && rs.without === 0 && rs.idle === 0, `A COLD BOOT UNDER A ROW EVERY PASS (the owner's 27 × ${SCALE}, ${rs.lines} lines; every identity invalidated each pass; ${PER} turns of ${STEP} lines a pass): all 27 have rates at pass ${rs.all} (stated bound: ${BOUND} = the lines ÷ the pass's budget + 4), ${rs.stale} landings stale on the way, ${rs.idle} turns spent nothing`, rs);
  const M = mutantCopies('usage-relearn-stepped-refoldfirst', REPO), src = read('src/usage-estimator.js'), from = '    f.first = !((this._rateCache.get(identityKey) || {}).rates);\n';
  const EM = src.includes(from) ? require(M.write('src/usage-estimator.js', src.replace(from, '    f.first = true;\n'), 'refold-first')) : null; // round 4's queue: no class, the smallest left first
  const R = EM ? rows(EM.UsageEstimator, SCALE, PER, 120) : null;
  ok(!!R && R.all < 0 && R.without > 0, `RED: re-folds in the queue beside first learns (round 4's order) ⇒ after ${R && R.passes} passes ${R && R.without} of 27 identities still have NO rates — starved by the re-folds of the ones that landed`, R);
}

console.log('§23 THE HOLDER OF THE ONE SLOT ALWAYS RUNS — a restart with a partial seed (rates.json holds 20 of 27): every identity learns, every seeded one refreshes, no turn spends nothing (round 6)');
{
  const T0 = NOW - 40 * DAY, OWNER = [1, 2, 2, 1, 152, 3, 3, 6, 11290, 7672, 3558, 3916, 4360, 1990, 5272, 3871, 3897, 3625, 217, 4776, 6132, 6682, 1248, 4023, 2741, 5, 6284];
  const mk = (dir, key, n, acct) => { const out = []; let prev = null; for (let j = 0; j < n; j++) { const fetchedAt = Math.floor(T0 + j * ((39 * DAY) / n)); out.push(JSON.stringify({ ts: fetchedAt + 500, fetchedAt, source: 'statusline', accountId: acct, identityKey: key, buckets: bucketsAt(fetchedAt), prevFetchedAt: prev, costSince: prev ? { total: 1 + (j % 7) * 0.1, byFamily: { fable: 0.4, opus: 0.6, sonnet: 0, haiku: 0, other: 0 }, requests: 3 } : null })); prev = fetchedAt; } const f = path.join(dir, 'anchors-' + key.replace(/[^\w.@-]/g, '_').slice(0, 80) + '.ndjson'); fs.writeFileSync(f, out.join('\n') + '\n'); return fs.statSync(f).size; };
  const partial = (UE, scale, PER, PASSES) => {
    const w = world(REPO, { seed: 121, rows: 2000 }), sizes = OWNER.map((n) => Math.max(1, Math.round(n * scale))), bytes = [];
    const keys = sizes.map((n, k) => { const key = 'org:q' + k; bytes.push(mk(w.adir, key, n, 'm' + k)); return key; });
    const members = keys.map((k, i) => 'm' + i), keyOf = (a) => ({ identityKey: keys[members.indexOf(a)] || null }), CAP = Math.floor(Math.max(...bytes) * 0.6); // the largest files past the line cache's cap (× 8's shape: one slot for uncached lines)
    const mkE = (C) => { const e = new C({ anchorsDir: w.adir, usageHistory: w.uh, resolveIdentity: keyOf, lagS: 20 }); e.linesLiveMaxBytes = CAP; e.primeOpts = { syncMaxRows: 1e9 }; e.primeIfCold(); e.linesLiveMaxBytes = CAP; return e; };
    const e0 = mkE(w.est.constructor), S0 = stepper(e0), seeded = keys.slice(0, 20); // the hub before its restart learned 20 (the last 7 never landed there)
    for (let r = 0; r < 400 && seeded.some((k) => !(e0._rateCache.get(k) || {}).rates); r++) { for (const k of seeded) e0.ratesFor(k); let u = 0; while (S0.q.length && u < 50) { S0.turn(); u++; } }
    e0.flushRates(); e0.close();
    const est = mkE(UE || w.est.constructor), S = stepper(est), said = [], cw = console.warn, cl = console.log; console.warn = (...a) => said.push(a.join(' ')); console.log = () => { };
    let all = -1, pass = 0, holder0 = null;
    try {
      for (; pass < PASSES; pass++) {
        const raw = est.basisRaw(members); if (!raw) for (const id of members) est.estimateFor(id, null, NOW + pass); // the pass's decision
        if (pass === 0) holder0 = est._ownFold ? { key: est._ownFold.key, seededRates: !!(est._rateCache.get(est._ownFold.key) || {}).seeded } : null;
        if (keys.every((k) => { const c = est._rateCache.get(k); return c && c.rates && !c.seeded; })) { all = pass; break; }
        for (let u = 0; u < PER && S.q.length; u++) S.turn(); // the pass's turns, counted
      }
    } finally { console.warn = cw; console.log = cl; }
    const without = keys.filter((k) => !(est._rateCache.get(k) || {}).rates).length, stillSeeded = keys.filter((k) => (est._rateCache.get(k) || {}).seeded).length;
    rmWorld(w); return { scale, perPass: PER, lines: sizes.reduce((a, b) => a + b, 0), seeded: est.ratesSeeded || 0, holder0, all, passes: pass, without, stillSeeded, idle: est.turnsIdle || 0, idleLine: (said.find((l) => /a relearn turn spent nothing/.test(l)) || '').slice(0, 170) };
  };
  const SCALE = 0.25, PER = 2, ps = partial(null, SCALE, PER, 160), BOUND = Math.ceil((2 * ps.lines) / (PER * STEP)) + 6; // every line folded twice at most (the seeded re-folds + the first learns) at the pass's budget, + 6 passes
  ok(ps.seeded === 20 && ps.holder0 && ps.holder0.seededRates && ps.all >= 0 && ps.all <= BOUND && ps.without === 0 && ps.stillSeeded === 0 && ps.idle === 0, `A RESTART WITH A PARTIAL SEED (the owner's 27 × ${SCALE}, ${ps.lines} lines, rates.json 20 of 27; the largest past the cache's cap): the slot taken at boot by a SEEDED identity's re-fold (${ps.holder0 && ps.holder0.key}) — all 27 learned and every seeded one refreshed at pass ${ps.all} (stated bound ${BOUND}: every line twice at ${PER} turns of ${STEP} a pass, + 6); ${ps.idle} turns spent nothing`, ps);
  const M = mutantCopies('usage-relearn-stepped-wall', REPO), src = read('src/usage-estimator.js');
  const a = "      if (Q.length > 1) Q.sort((x, y) => ((x.first ? 0 : x === holder ? 1 : 2) - (y.first ? 0 : y === holder ? 1 : 2)) || (", b = "      for (let ended = true; ended && Q.length && (this._turnLeft ?? 1) > 0;) { ended = false; for (let i = 0; i < Q.length && (this._turnLeft ?? 1) > 0; i++) if (this._foldRun(Q[i])) { Q.splice(i--, 1); ended = true; } }";
  const EM = src.includes(a) && src.includes(b) ? require(M.write('src/usage-estimator.js', src.replace(a, "      if (Q.length > 1) Q.sort((x, y) => ((x.first ? 0 : 1) - (y.first ? 0 : 1)) || (").replace(b, '      while (Q.length && (this._turnLeft ?? 1) > 0) { if (this._foldRun(Q[0])) Q.shift(); else break; }'), 'wall')) : null; // round 5's turn: first learns first, the turn stops at its head
  const R = EM ? partial(EM.UsageEstimator, SCALE, PER, 160) : null;
  ok(!!R && R.all < 0 && R.without > 0 && R.idle > 0 && /its head org:q\d+: it waits behind org:q\d+'s fold/.test(R.idleLine), `RED: round 5's turn (the queue stops at a head that cannot open) ⇒ after ${R && R.passes} passes ${R && R.without} identities never learned, ${R && R.stillSeeded} still on the seed; ${R && R.idle} turns spent nothing, said once: «${R && R.idleLine}»`, R);
}
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);

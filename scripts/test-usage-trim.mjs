#!/usr/bin/env node
// THE HOT WINDOW'S TRIM AND THE COLD ID INDEXES (usage-cpu U1, lane bl-loop-a, 2026-11-18 — B-360d's text). The hub's main
// thread held 36.2 s over 25 holds in _sortHot's full sort (every trim dropped the sorted view, so the next sync reader
// sorted every hot row), 11.5 s over 7 holds in the trims themselves (a map + a sort of every hot row, a scan, four arrays
// rebuilt — ONE turn, once per scan append at the ceiling) and 2.9 s in HashIndex.settle (each pass start copied the whole
// cold index). Judged by COUNTS, never a clock:
//   §1 the cold indexes settle into levels: 50 settles of 100 ids write the same entries over 40 000 and 200 000 settled ids,
//      the runs stay few, every id answers once from its run, the parts carry the runs. CONTROLS (planted): the release's
//      whole merge (the work grows with the index); a settle that never merges (the runs pile up)
//   §2 the trim on the hub's road at 10 000 and 100 000 hot rows: nothing moves in the asking tick; the pass is split into
//      steps of ≤ the batch and visits each hot row once; the commit turn's loops visit the rows that moved + the rows that
//      arrived meanwhile; 0 full sorts after it (the view = the full stable sort, its sizes beside it); a byte trim leaves the
//      window at ≤ 7/8 of the ceiling. CONTROLS (planted): the release's dropped view ⇒ a full sort of every row; the trim
//      inline on the hub's road ⇒ the asking tick moves every row; the trim spans as many loop turns as it has steps (an
//      independent ticker; CONTROL a driver that runs every step in one callback); §2b a REAL pass over shard bytes on the
//      hub's road: past the ceiling it owes the trim (never in its tick), the trim cuts to 7/8, the next small append trims
//      nothing; a row below the cut that comes while the stage is open waits hot and the trim asks again by itself
//   §3 late rows across a trim: one inside the window and one below the cut, arriving mid-trim, stay hot; the view = the full
//      stable sort; every priced row and count = an untrimmed twin's; the next trim moves the late one; each late row is in the
//      window ONCE. CONTROL (planted) the commit that swaps over the rows that came meanwhile ⇒ they are lost
//   §3t (the chain's cure) the equal-instant tie: a late row at the ms of a moved row — the signature and a read-order sum = the twin's
//   §3b A READER BETWEEN TWO BATCHES SEES A WHOLE WINDOW (the coordinator's 04:47Z ruling, item 1): over a real shard-backed
//      ledger, eventForRid / eventForMid / ledgerKnowsId / every priced row / every count asked mid-pass and mid-stage answer
//      what they answered before the trim (the window is built aside and swapped in one commit turn), and the same after it
//   §3c NOTHING CALLS THE TRIM WHOLE ON THE HUB (item 3): across a boot (the fold worker's first load), a rebuild swap and a
//      pass over a scan's appended bytes, the hub's instance runs _trimHot 0 times (every trim through its steps); _trimHot's
//      one caller is _trimOwed (an instance that is not the hub's: the fold worker's, a CLI's, a test's)
//   §3d THE HEADROOM AND A READER'S WINDOW (item 4): at the byte ceiling, the 7-day window (the longest the pool's estimates and
//      the dark-host index ask on the loop) reads 0 rows from the cold columns with the headroom and without it (planted); a
//      window past 7/8 of the hot span reads its oldest rows from the in-memory cold columns now (counted, said); every answer
//      equal
//   §4 the roads that end a trim early: a walk out at the commit (the stage dropped, nothing moved, the walk's end asks
//      again — also through a REAL walk: aggregateAsync's fold with the trim owed inside its plan), a throw while staging (no
//      stage left behind, the cache as it was), the cache replaced mid-trim (the old one untouched)
//   §5 the cut over the sorted view = ledgerCutoff over the rows (300 random windows: ties at the edge, the ceiling, prev)
//   §6 a row the columns cannot hold, below the cut: the trim after the one that kept it makes no pass for it (and a coldable
//      one that comes below the cut is still moved); an index's old-shape parts; 65 late rows (the linear merge) = the sort
//   §7 (usage-cpu U5) THE BYTES THE HUB APPENDED ARE TAKEN A SLICE A TURN — a scan's new shard bytes were taken by the next
//      sync reader's pass, every slice in its one turn (1.5 s held): 12 000 appended rows (~3 MB) taken in steps of one 1 MiB
//      slice, the cache then = a synchronous load's; a reader mid-way takes over only within TAKEOVER_MAX_BYTES; the scan and
//      a host batch both ask for it. CONTROL the release's road (the next reader) takes all 12 000 in one call
// Run: node scripts/test-usage-trim.mjs (no network, no worker)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mutantCopies } from './mutant-copy.mjs';
import { armWatchdog } from './suite-watchdog.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const CB = require('../src/cache-bounds.js');
const { UsageHistory } = require('../src/usage-history.js');
const { UsageCells } = require('../src/usage-cells.js');   // (B-360d cells small) §2b's hub-built cells take the worker's headroom
armWatchdog();
let pass = 0, fail = 0;
const ok = (c, m, e) => { if (typeof m !== 'string') throw new TypeError(`ok(cond, name): the name is a ${typeof m} — the arguments are swapped?`); if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m + (e !== undefined ? ' — ' + JSON.stringify(e).slice(0, 600) : '')); } };
// B-0d3e: a red control's product edit, its anchor judged BY NAME — any count but one (for 'all' / 'join' / 'first' or a /g
// anchor: none) is a red row of this suite's own check naming the anchor and the file; the copy is then built as before (nothing
// crashes). 'first' = an anchor the product holds more than once today: the first one is patched, as it always was
function editAnchor(text, from, to, file, mode = 'one') {
  const t = String(text), re = from instanceof RegExp, many = mode !== 'one' || (re && from.global);
  const n = re ? [...t.matchAll(new RegExp(from.source, from.flags.replace(/[gy]/g, '') + 'g'))].length : t.split(String(from)).length - 1;
  if (many ? n === 0 : n !== 1) { const shown = re ? String(from) : JSON.stringify(String(from)).slice(0, 100); ok(false, `ANCHOR (${file}): ${shown} — found ${n} times, ${many ? 'at least one' : 'one'} meant: the copy is not the control it says`); }
  return mode === 'join' ? t.split(from).join(to) : mode === 'all' ? t.replaceAll(from, to) : t.replace(from, to);
}
const eq = (a, b, m) => { const x = JSON.stringify(a), y = JSON.stringify(b); ok(x === y, m + (x === y ? '' : `\n     got  ${x.slice(0, 300)}\n     want ${y.slice(0, 300)}`)); };
const DAY = 86400e3, BATCH = 16384; // BATCH = usage-history's TRIM_BATCH_ROWS (the hub's step)
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-usage-trim-'));
let seed = 11;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const pick = (a) => a[Math.floor(rnd() * a.length)];
const shardOf = (ts) => { const d = new Date(ts); return `events-${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}.ndjson`; };
let rn = 0;
function mkRow(ts) {
  const host = rnd() < 0.15 ? 'H1' : null, n = ++rn;
  const ev = { ts, rid: host ? `h:H1:req_${n}` : (rnd() < 0.05 ? undefined : `req_${n}`), mid: rnd() < 0.8 ? `msg_${n}` : undefined, sid: 's' + (n % 23),
    model: pick(['claude-opus-4-1', 'claude-sonnet-4-5', 'claude-haiku-4-5', 'claude-fable-5-1']), be: rnd() < 0.2 ? 'codex' : 'claude', acct: pick([null, 'acc-a', 'acc-b']),
    i: Math.floor(rnd() * 5000), o: Math.floor(rnd() * 3000), cw5: Math.floor(rnd() * 20000), cw1: rnd() < 0.3 ? null : Math.floor(rnd() * 900), cr: Math.floor(rnd() * 90000) };
  if (host) ev.host = host;
  if (rnd() < 0.02) delete ev.i; // an absent count: NaN cost on both sides
  return ev;
}
const realNow = Date.now, T = realNow(); Date.now = () => T; // one clock: the cutoff = now − window

// a ledger cache built in memory through the real admission (_take), every row at its own place (shard 0, its offset)
const take = (uh, c, rows, st) => { for (const ev of rows) { const j = JSON.stringify(ev); uh._take(c, ev, 0, st.off, j.length + 1, st.seen, CB.idHash(j)); st.off += j.length + 1; } };
const mk = (n, { hub = true, max = 1e15, U = UsageHistory, rows = null } = {}) => {
  const uh = new U({ dataDir: path.join(tmp, 'd'), homeDir: tmp }); uh.ledgerWindowMs = 40 * DAY; uh.ledgerHotMaxBytes = max; uh.firstLoadInWorker = hub;
  const c = uh._evCache = uh._newCache(); c.shards = [shardOf(T)]; c.checkedAt = Infinity; c.whole = true;
  const st = { off: 0, seen: new Set() }, rs = rows || Array.from({ length: n }, () => mkRow(T - Math.floor(rnd() * 44 * DAY)));
  take(uh, c, rs, st);
  return { uh, c, st, rows: rs };
};
const writeRowsTo = (base, evs) => { const by = new Map(); for (const ev of evs) { const f = shardOf(ev.ts); if (!by.has(f)) by.set(f, []); by.get(f).push(JSON.stringify(ev)); } for (const [f, ls] of by) fs.appendFileSync(path.join(base, f), ls.join('\n') + '\n'); };
const ticker = () => { const t = { n: 0, done: false }; const tk = () => { t.n++; if (!t.done) setImmediate(tk); }; setImmediate(tk); return t; }; // loop turns, counted from outside the trim
const settled = async (c) => { while (c.trimP) await c.trimP; }; // a trim and the one it asked for after it
const sameView = (c) => {
  const full = c.events.slice().sort((a, b) => (a.ts || 0) - (b.ts || 0)), at = new Map(c.events.map((e, i) => [e, i]));
  return c.sorted.length === full.length && full.every((e, i) => e === c.sorted[i]) && c.sortedSz.length === full.length && c.sortedSz.every((z, i) => z === c.sizes[at.get(c.sorted[i])]);
};
const v = (x) => (x === undefined || (typeof x === 'number' && Number.isNaN(x)) ? 'absent' : x === null ? 0 : x); // the columns' contract: null prices as 0, absent as NaN
const sig = (u) => [...u._events(0, T + DAY)].map((e) => [e.ts, e.i, e.o, e.cw5, e.cw1, e.cr, e.acct || null, e.be, e.model].map(v).join(',')).sort().join('|');
const counts = (u) => [T - 43 * DAY, T - 41 * DAY, T - 30 * DAY, T - DAY, T].map((t) => u._evCountUpTo(t));

try {
  console.log('§1 the cold indexes settle into levels');
  {
    const lv = (N, X) => {
      const x = new X.HashIndex(); x.tk = new Float64Array(N + 4096); x.tv = new Float64Array(N + 4096); // the N ids land in ONE run
      for (let k = 0; k < N; k++) x.put(X.idHash('n' + k), k);
      x.settle(); const w0 = x.work;
      for (let r = 0; r < 50; r++) { for (let k = 0; k < 100; k++) x.put(X.idHash(`p${r}-${k}`), 1e7 + r * 100 + k); x.settle(); }
      return { work: x.work - w0, runs: x.rk.length, x };
    };
    const a = lv(40000, CB), b = lv(200000, CB);
    ok(a.work === b.work && a.work <= 50 * 100 * 12 && b.runs >= 1 && b.runs <= 6, `50 settles of 100 ids: ${a.work} entries written over 40 000 ids, ${b.work} over 200 000 (the index's size never enters), ${b.runs} run(s) above the oldest`);
    let miss = 0;
    for (let r = 0; r < 50; r += 7) for (let k = 0; k < 100; k += 13) { const f = b.x.findSorted(CB.idHash(`p${r}-${k}`)); if (f.length !== 1 || f[0] !== 1e7 + r * 100 + k) miss++; }
    for (const k of [0, 777, 199999]) { const f = b.x.findSorted(CB.idHash('n' + k)); if (f.length !== 1 || f[0] !== k) miss++; }
    const t = CB.HashIndex.fromParts(b.x.parts());
    ok(!miss && t.findSorted(CB.idHash('p49-99'))[0] === 1e7 + 4999 && t.find(CB.idHash('n5'))[0] === 5 && b.x.findSorted(CB.idHash('nope')).length === 0 && t.work === b.x.work, `every id answers once from its run (${miss} wrong); the parts carry the runs`);
    const src = fs.readFileSync(path.join(REPO, 'src/cache-bounds.js'), 'utf8');
    const LOOP = 'while (this.rk.length && this.rk[this.rk.length - 1].length <= 4 * K.length)', MAIN = 'if (!this.rk.length && this.keys.length <= 4 * K.length)';
    const M = mutantCopies('usage-trim-levels', REPO);
    const whole = M.load('src/cache-bounds.js', editAnchor(editAnchor(src, LOOP, 'while (this.rk.length)', "src/cache-bounds.js"), MAIN, 'if (!this.rk.length)', "src/cache-bounds.js"), 'whole');
    const never = M.load('src/cache-bounds.js', editAnchor(editAnchor(src, LOOP, 'while (false)', "src/cache-bounds.js"), MAIN, 'if (!this.keys.length)', "src/cache-bounds.js"), 'never');
    const aw = lv(40000, whole), bw = lv(200000, whole), nv = lv(40000, never);
    ok(src.split(LOOP).length === 2 && src.split(MAIN).length === 2 && bw.work > 3 * aw.work, `control (every settle merges the whole index — the release's): ${aw.work} vs ${bw.work} entries written ⇒ RED`);
    ok(nv.runs === 50, `control (a settle that never merges): ${nv.runs} runs pile up ⇒ RED by the runs' bound`);
  }

  console.log('§2 the trim on the hub\'s road');
  const hubRun = async (n, U = UsageHistory, max = 1e15) => {
    const { uh, c } = mk(n, { U, max });
    uh._sortedEvents(); const full0 = c.fullSorts, hot0 = c.events.length, bytes0 = c.hotBytes;
    const turns = ticker();
    uh._trimOwed(c);
    const asked = { rows: c.events.length, cold: c.cold.n, trimmed: !!c.lastTrim };
    await settled(c); turns.done = true;
    uh._sortedEvents();
    return { n, hot0, bytes0, asked, t: c.lastTrim || {}, full: (c.fullSorts || 0) - full0, cold: c.cold.n, c, turns: turns.n };
  };
  for (const n of [10000, 100000]) {
    const r = await hubRun(n), t = r.t, below = t.cutVisits;
    ok(r.asked.rows === r.hot0 && r.asked.cold === 0 && !r.asked.trimmed, `${n} hot rows: the sync road's trim moves nothing in the asking tick (${r.asked.rows} hot, ${r.asked.cold} cold)`);
    ok(t.end === 'moved' && t.moved > n / 20 && r.cold === t.moved && t.passVisits === n && t.stageVisits === below && t.steps >= Math.floor((n + 2 * below) / BATCH) && t.maxStep <= BATCH && r.turns >= t.steps,
      `${n} hot rows: ${t.moved} moved; the pass visited each of the ${n} rows once in ${t.steps + 1} step(s) of ≤ ${t.maxStep}, the stage ${t.stageVisits}; the trim spanned ${r.turns} loop turns`, t);
    ok(t.commitVisits === t.moved && r.full === 0 && (n > 10000 || sameView(r.c)), `${n} hot rows: the commit turn's loops visited ${t.commitVisits} rows (= the rows moved, nothing arrived); ${r.full} full sort(s) after it${n > 10000 ? '' : ' — the view = the full stable sort, its sizes beside it'}`);
  }
  {
    const probe = mk(10000).c, max = Math.floor(probe.hotBytes * 0.6); // a byte ceiling below what the rows hold
    const r = await hubRun(10000, UsageHistory, max);
    ok(r.t.end === 'moved' && r.c.hotBytes <= max - Math.floor(max / 8) && r.c.hotBytes > 0, `a byte trim cuts the window to ≤ 7/8 of its ceiling (${r.c.hotBytes} ≤ ${max - Math.floor(max / 8)} of ${max}): the next eighth of it arriving trims nothing`);
  }
  {
    const M = mutantCopies('usage-trim-trim', REPO), src = fs.readFileSync(path.join(REPO, 'src/usage-history.js'), 'utf8');
    const VIEW = 'c.sorted = head.concat(V.slice(lo)); c.sortedSz = headSz.concat(VZ.slice(lo));', OWED = '_trimOwed(c) { if (this.firstLoadInWorker) this._trimLater(c); else this._trimHot(); }';
    ok(src.split(VIEW).length === 2 && src.split(OWED).length === 2, 'the controls\' premise: the view filter and the hub\'s road are each one site of the module');
    const rd = await hubRun(10000, M.load('src/usage-history.js', editAnchor(src, VIEW, 'c.sorted = null; c.sortedSz = null;', "src/usage-history.js"), 'dropped').UsageHistory);
    ok(rd.full === 1, `control (the release's view dropped at every trim): ${rd.full} full sort of every hot row ⇒ RED`);
    const ri = await hubRun(10000, M.load('src/usage-history.js', editAnchor(src, OWED, '_trimOwed(c) { this._trimHot(); }', "src/usage-history.js"), 'inline').UsageHistory);
    ok(ri.asked.trimmed && ri.asked.cold > 0, `control (the trim inline on the hub's road): the asking tick moved ${ri.asked.cold} rows ⇒ RED`);
    const STEP = 'if (!r.done) return setImmediate(step);';
    const r1 = await hubRun(100000, M.load('src/usage-history.js', editAnchor(src, STEP, 'if (!r.done) return step();', "src/usage-history.js"), 'one-callback').UsageHistory);
    ok(src.split(STEP).length === 2 && r1.t.steps >= 7 && r1.turns < 3, `control (a driver that runs every step in one callback): ${r1.t.steps + 1} steps in ${r1.turns} loop turn(s) ⇒ RED by the turn count`);
    const s0 = fs.readFileSync(path.join(REPO, 'src/usage-history.js'), 'utf8');
    ok((s0.match(/this\._trimOwed\(c\)/g) || []).length === 3, 'both sync-road trims (the hourly slide, the byte ceiling) and a walk\'s end ask _trimOwed (each driven for real below: §2b, §4)');
  }

  console.log('§2b a real pass on the hub\'s road');
  {
    const base = path.join(tmp, 'pass', 'usage-history'); fs.mkdirSync(base, { recursive: true });
    writeRowsTo(base, Array.from({ length: 2000 }, () => mkRow(T - DAY - Math.floor(rnd() * 9 * DAY))));
    const u = new UsageHistory({ dataDir: path.dirname(base), homeDir: tmp }); u.ledgerWindowMs = 40 * DAY; u.warm();
    // (B-360d cells small) a cache built on this thread is FIXED once whole; give it the headroom the worker's hand-over gives, so the
    // appends below never stand its cells down (that asks a rebuild in the worker, whose swap would replace the cache §4's walk holds)
    if (u._evCache.cells) u._evCache.cells.sizedTo(UsageCells.headroomOf(u._evCache.cells.n));
    const c = u._evCache, max = Math.floor(c.hotBytes * 1.05); u.ledgerHotMaxBytes = max; u.firstLoadInWorker = true; // the hub's ledger, its first load landed
    writeRowsTo(base, Array.from({ length: 400 }, () => mkRow(T - Math.floor(rnd() * DAY)))); c.checkedAt = 0;
    const lt0 = c.lastTrim; u._loadEvents();
    const asked = { trimmed: c.lastTrim !== lt0, owed: !!c.trimP, hot: c.hotBytes };
    await settled(c);
    ok(!asked.trimmed && asked.owed && asked.hot > max && c.lastTrim.end === 'moved' && c.hotBytes <= max - Math.floor(max / 8) && c.cold.n === c.lastTrim.moved, `the pass past the ceiling OWES the trim (none in its tick: ${asked.hot} > ${max}); the trim then cuts to ${c.hotBytes} ≤ 7/8 of it`);
    writeRowsTo(base, Array.from({ length: 30 }, () => mkRow(T - Math.floor(rnd() * DAY)))); c.checkedAt = 0;
    const lt1 = c.lastTrim; u._loadEvents();
    ok(!c.trimP && c.lastTrim === lt1 && c.hotBytes <= max, `the next small append (${c.hotBytes} ≤ ${max}) trims nothing — the headroom`);
    globalThis.__u4walk = { u, c, base }; // §4's real walk reads this ledger
  }
  {
    const { uh, c, st } = mk(100000); // the hub's road: the driver's steps, a row below the cut while the stage is open
    c.cutoff = T - 43 * DAY; uh._sortedEvents();
    uh._trimOwed(c);
    let late = null;
    for (let k = 0; k < 400 && !late; k++) { await new Promise((r) => setImmediate(r)); if (c.cold.sn) { late = mkRow(T - Math.floor(43.5 * DAY)); take(uh, c, [late], st); } }
    const heldHot = !!late && c.events.includes(late), first = c.lastTrim;
    await settled(c);
    ok(heldHot && first.cameBelow === 1 && c.lastTrim !== first && !c.events.includes(late) && c.cold.n === first.moved + 1, `a row below the cut that came while the stage was open waited hot (${first.cameBelow} came below), and the trim asked again by itself: it is cold now`, { cameBelow: first.cameBelow, second: c.lastTrim.end });
  }

  console.log('§3 late rows across a trim');
  {
    const { uh, c, st, rows } = mk(10000, { hub: false });
    c.cutoff = T - 43 * DAY; // an earlier slide's (rows below it that arrived first are still hot: allowed)
    uh._sortedEvents();
    const g = uh._trimSteps(500);
    let r = g.next(); while (!r.done && !c.cold.sn) r = g.next(); // the stage is open
    const late = [mkRow(T - 20 * DAY), mkRow(T - Math.floor(43.5 * DAY))]; // the second is below the cutoff: outside a trim it would go cold at once
    take(uh, c, late, st);
    const underTrim = { hot: late.every((e) => c.events.includes(e)), cold: c.cold.n };
    uh._sortedEvents(); // a reader merges them into the view mid-trim
    while (!r.done) r = g.next();
    const twin = mk(0, { hub: false, rows: [...rows, ...late].map((e) => ({ ...e })) }).uh; twin._sortedEvents();
    ok(underTrim.hot && underTrim.cold === 0 && c.lastTrim.end === 'moved' && sameView(c) && c.events.includes(late[1]) && c.cold.n + c.events.length === 10002 && c.lastTrim.commitVisits === c.lastTrim.moved + 2 + 1,
      `a late row inside the window and one below the cut, arriving mid-trim, stay HOT (${c.lastTrim.moved} moved; the commit turn visited the 2 arrivals + the moved rows + the one kept below the cut); the view = the full stable sort`, c.lastTrim);
    eq([sig(uh), counts(uh)], [sig(twin), counts(twin)], 'the trimmed ledger answers the untrimmed twin: every priced row, every count up to a ts');
    ok(c.events.filter((e) => e === late[0] || e === late[1]).length === 2, 'each late row is in the window once (not lost, not doubled)');
    const cold1 = c.cold.n; uh._trimHot();
    ok(!c.events.includes(late[1]) && c.cold.n === cold1 + 1 && sameView(c) && sig(uh) === sig(twin), `the next trim moves the late row below the cut (${c.lastTrim.moved} moved; the twin's totals still)`);
    const srcC = fs.readFileSync(path.join(REPO, 'src/usage-history.js'), 'utf8'), CARRY = "      for (let i = n; i < m; i++) { ne.push(evs[i]); ns.push(c.sizes[i]); nl.push(c.locs[i]); nh.push(c.hrh[i]); hb += c.sizes[i]; stat.commitVisits++; if ((evs[i].ts || 0) < cut) below++; }\n";
    const Swap = mutantCopies('usage-trim-carry', REPO).load('src/usage-history.js', editAnchor(srcC, CARRY, '      // (the release\'s form: the arrays swapped over the rows that came meanwhile)\n', "src/usage-history.js"), 'swap-over').UsageHistory;
    const x = mk(10000, { hub: false, U: Swap }); x.uh._sortedEvents();
    const gx = x.uh._trimSteps(500); let rx = gx.next(); while (!rx.done && !x.c.cold.sn) rx = gx.next();
    const lx = [mkRow(T - 20 * DAY)]; take(x.uh, x.c, lx, x.st); while (!rx.done) rx = gx.next();
    ok(srcC.split(CARRY).length === 2 && !x.c.events.includes(lx[0]), 'control (the commit that swaps the arrays over the rows that came meanwhile): the late row is LOST ⇒ RED');
  }

  console.log('§3b a reader between two batches sees a whole window');
  {
    const base = path.join(tmp, 'reader', 'usage-history'); fs.mkdirSync(base, { recursive: true });
    const rowsR = Array.from({ length: 6000 }, () => mkRow(T - Math.floor(rnd() * 30 * DAY))); writeRowsTo(base, rowsR);
    const u = new UsageHistory({ dataDir: path.dirname(base), homeDir: tmp }); u.ledgerWindowMs = 40 * DAY; u.warm();
    const c = u._evCache; u.ledgerWindowMs = 10 * DAY; // the window shrinks: two thirds of the hot rows go below the cut
    const movedOne = c.events.find((e) => e.ts < T - 11 * DAY && e.rid && e.mid && !e.host), keptOne = c.events.find((e) => e.ts > T - 9 * DAY && e.rid && e.mid && !e.host);
    const ask = async () => JSON.stringify([sig(u), counts(u), u.ledgerKnowsId(movedOne.rid), u.ledgerKnowsId(keptOne.mid), (await u.eventForRid(movedOne.rid))?.ts, (await u.eventForMid(movedOne.mid))?.ts, (await u.eventForRid(keptOne.rid))?.ts]);
    const before = await ask();
    u._sortedEvents();
    const g = u._trimSteps(500), seen = { pass: 0, stage: 0 };
    let r = g.next(), same = true;
    while (!r.done) {
      const t = c.lastTrim || {};
      if (!seen.pass && t.passVisits > 0 && t.passVisits < t.rows) { seen.pass = 1; same = same && (await ask()) === before; }
      if (!seen.stage && c.cold.sn > 0) { seen.stage = 1; same = same && (await ask()) === before; }
      r = g.next();
    }
    const after = await ask();
    ok(seen.pass && seen.stage && same && after === before && c.lastTrim.end === 'moved' && c.cold.n > 3000, `a reader asked mid-pass and mid-stage answers what it answered before the trim (eventForRid / eventForMid / ledgerKnowsId / every priced row / every count): the window is built aside and swapped in ONE commit turn; after it (${c.cold.n} rows cold, read at their places) the same answers`, { seen, same, after: after === before });
  }

  console.log('§3c nothing calls the trim whole on the hub');
  {
    const base = path.join(tmp, 'boot', 'usage-history'); fs.mkdirSync(base, { recursive: true });
    writeRowsTo(base, Array.from({ length: 3000 }, () => mkRow(T - Math.floor(rnd() * 44 * DAY))));
    const u = new UsageHistory({ dataDir: path.dirname(base), homeDir: tmp, firstLoadInWorker: true }); u.ledgerWindowMs = 40 * DAY;
    let whole = 0; const th = u._trimHot.bind(u); u._trimHot = () => { whole++; return th(); };
    u._loadEvents(); await u.bootLoadSettled(); // THE BOOT: the first load in the fold worker
    const afterBoot = { whole, rows: u._evCache.events.length + u._evCache.cold.n, cold: u._evCache.cold.n };
    await u._requestRebuild('the rebuild swap of test-usage-trim §3c'); // A REBUILD SWAP
    const c1 = u._evCache;
    u.ledgerHotMaxBytes = Math.floor(c1.hotBytes * 0.9); // A SCAN's bytes past the ceiling
    writeRowsTo(base, Array.from({ length: 300 }, () => mkRow(T - Math.floor(rnd() * DAY)))); c1.checkedAt = 0;
    u._loadEvents(); await settled(c1);
    const srcH = fs.readFileSync(path.join(REPO, 'src/usage-history.js'), 'utf8');
    ok(afterBoot.whole === 0 && afterBoot.rows === 3000 && afterBoot.cold > 0 && whole === 0 && c1.lastTrim && c1.lastTrim.end === 'moved' && (srcH.match(/this\._trimHot\(\)/g) || []).length === 2 && /_trimOwed\(c\) \{ if \(this\.firstLoadInWorker\) this\._trimLater\(c\); else this\._trimHot\(\); \}/.test(srcH) && /\(this\.passTrim \?\? !isMainThread\) && !stepped && !this\.firstLoadInWorker[^\n]*this\._trimHot\(\)/.test(srcH),
      `a boot (${afterBoot.rows} rows, ${afterBoot.cold} cold, the worker's own trims), a rebuild swap and a scan's pass past the ceiling: ${whole} whole trims on the hub's instance (the pass's trim ran through its steps: «${c1.lastTrim && c1.lastTrim.end}»); _trimHot's callers are _trimOwed, for an instance that is not the hub's, and the pass's own trim in a WORKER THREAD only (B-360d cut 3: never the hub's instance) — _trimOwed, for an instance that is not the hub's`);
  }

  console.log('§3d the headroom and a reader\'s window');
  {
    const srcR = fs.readFileSync(path.join(REPO, 'src/usage-history.js'), 'utf8'), HEAD = 'maxBytes: max - Math.floor(max / HOT_HEADROOM)';
    const NoHead = mutantCopies('usage-trim-headroom', REPO).load('src/usage-history.js', editAnchor(srcR, HEAD, 'maxBytes: max', "src/usage-history.js"), 'release-ceiling').UsageHistory;
    const rowsH = Array.from({ length: 20000 }, (_, k) => mkRow(T - Math.floor((k / 20000) * 40 * DAY)));
    const run = (U) => {
      const { uh, c } = mk(0, { hub: false, U, rows: rowsH.map((e) => ({ ...e })) });
      uh.ledgerHotMaxBytes = Math.floor(c.hotBytes / 2); // the ceiling binds: about 20 days of these rows stay hot
      uh._sortedEvents(); uh._trimHot();
      const coldIn = (days) => { const from = T - days * DAY; let n = 0; for (const e of uh._events(from, T + DAY)) if (!('sid' in e)) n++; return n; }; // a cold row comes back with the priced columns only
      return { span: (T - c.cutoff) / DAY, c7: coldIn(7), c19: coldIn(19), sig: sig(uh), counts: JSON.stringify(counts(uh)) };
    };
    const h = run(UsageHistory), rel = run(NoHead);
    console.log(`  the hot span: ${rel.span.toFixed(1)} days at the release's cut, ${h.span.toFixed(1)} with the headroom; a 19-day window reads ${rel.c19} rows from the cold columns at the release's cut, ${h.c19} with it`);
    ok(srcR.split(HEAD).length === 2 && h.c7 === 0 && rel.c7 === 0 && h.sig === rel.sig && h.counts === rel.counts && h.span < rel.span && h.c19 >= rel.c19, `the 7-day window reads ${h.c7} cold rows with the headroom (${rel.c7} at the release's cut); every answer equal; a window past 7/8 of the span reads its oldest rows from the in-memory cold columns (${h.c19} vs ${rel.c19}) — the merged road, the same answer`);
  }

  console.log('§4 the roads that end a trim early');
  {
    const a = mk(10000, { hub: false });
    a.uh._sortedEvents(); const hot0 = a.c.events.length, ev0 = a.c.events;
    const g = a.uh._trimSteps(500);
    let r = g.next(); while (!r.done && !a.c.cold.sn) r = g.next();
    a.c.walking = 1; // a walk's plan is out when the commit comes
    while (!r.done) r = g.next();
    ok(a.c.lastTrim.end === 'a walk is out — the stage dropped' && a.c.cold.n === 0 && a.c.cold.sn === 0 && a.c.events === ev0 && a.c.events.length === hot0 && a.c.trimOwed === true && !a.c.trim,
      'a walk out at the commit: the stage is dropped, nothing moved, the cache as it was, a trim owed');
    a.c.walking = 0; a.c.trimOwed = false; a.uh._trimOwed(a.c);
    ok(a.c.lastTrim.end === 'moved' && a.c.cold.n === a.c.lastTrim.moved && a.c.cold.n > 0, `…the trim owed then moves ${a.c.cold.n} rows`);
    const { u, c } = globalThis.__u4walk; // a REAL walk (§2b's ledger): the fold in the worker, the trim owed inside its plan
    u.ledgerWindowMs = 5 * DAY; // rows go below the cut: a trim to run
    let during = null;
    u.walkHook = async () => { u._trimOwed(c); await settled(c); during = c.lastTrim.end; };
    const res = await u.aggregateAsync({ from: T - 30 * DAY, to: T + DAY, rows: true }).catch((e) => ({ error: e.message }));   // the ROW road (B-360d unit 1: the window answers from the cells; the walk under a trim is the row road's)
    u.walkHook = null; await settled(c);
    ok(during === 'a walk is out — owed to its end' && c.lastTrim.end === 'moved' && c.lastTrim.moved > 0 && res && res.totals && res.totals.requests > 2000, `a real walk (aggregateAsync over ${res && res.totals && res.totals.requests} rows): a trim asked inside its plan never starts under it (owed); the walk's end runs it — «${c.lastTrim.end}», ${c.lastTrim.moved} rows`, { during, res: res && (res.error || res.totals) });
    { // r6 (the test machine's number): a STAGED row weighs TRIM_STAGE_COST visits — one step of 16 288 staged rows held 60.7 ms there
      const w = mk(10000, { hub: false }); w.uh._sortedEvents();
      let staged = 0, maxPer = 0; const sg = w.c.cold.stage.bind(w.c.cold); w.c.cold.stage = (...x) => { staged++; return sg(...x); };
      const gw = w.uh._trimSteps(160); let rw = gw.next();
      while (!rw.done) { maxPer = Math.max(maxPer, staged); staged = 0; rw = gw.next(); }
      maxPer = Math.max(maxPer, staged);
      ok(w.c.lastTrim.end === 'moved' && w.c.lastTrim.moved > 100 && maxPer <= 10 && w.c.lastTrim.maxStep <= 160, `a stage step at a batch of 160 visits holds ≤ 10 staged rows (${maxPer} of ${w.c.lastTrim.moved}): a staged row weighs 16 visits (3.7 µs vs 0.3 µs measured), the step never past its batch (${w.c.lastTrim.maxStep})`);
    }
    const b = mk(10000, { hub: false });
    b.uh._sortedEvents(); const bh = b.c.events.length, bcut = b.c.cutoff, stage0 = b.c.cold.stage.bind(b.c.cold);
    let k = 0; b.c.cold.stage = (...x) => { if (++k === 50) throw new Error('a stage that failed'); return stage0(...x); };
    let threw = null; try { b.uh._trimHot(); } catch (e) { threw = e; }
    ok(threw && /a stage that failed/.test(threw.message) && b.c.cold.sn === 0 && b.c.cold.n === 0 && b.c.events.length === bh && b.c.cutoff === bcut && !b.c.trim, 'a throw while staging: no stage left behind, nothing moved, the cutoff as it was, the next trim free to run');
    const d = mk(10000, { hub: false });
    d.uh._sortedEvents(); const dh = d.c.events.length;
    const gd = d.uh._trimSteps(500);
    let rd = gd.next(); while (!rd.done && !d.c.cold.sn) rd = gd.next();
    d.uh._evCache = d.uh._newCache(); // a rebuild swapped another cache in
    while (!rd.done) rd = gd.next();
    ok(d.c.lastTrim.end === 'gone' && d.c.cold.n === 0 && d.c.cold.sn === 0 && d.c.events.length === dh && !d.c.trim, 'the cache replaced mid-trim: the trim stops, the old cache untouched (no stage left in it)');
  }

  console.log('§5 the cut over the sorted view = ledgerCutoff');
  {
    let bad = 0;
    for (let k = 0; k < 300; k++) {
      const m = 1 + Math.floor(rnd() * 60), tss = Array.from({ length: m }, () => T - Math.floor(rnd() * 12) * DAY), sizes = tss.map(() => 1 + Math.floor(rnd() * 40));
      const ix = tss.map((_, i) => i).sort((p, q) => (tss[p] - tss[q]) || (p - q)), total = sizes.reduce((x, y) => x + y, 0);
      const q = { nowMs: T, windowMs: Math.floor(rnd() * 14) * DAY, maxBytes: Math.floor(rnd() * total * 1.2), prev: rnd() < 0.2 ? T - Math.floor(rnd() * 12) * DAY : -Infinity };
      if (CB.ledgerCutoff({ ...q, tss, sizes }) !== CB.ledgerCutoffSorted({ ...q, sorted: ix.map((i) => ({ ts: tss[i] })), sizes: ix.map((i) => sizes[i]), total }).cut) bad++;
    }
    ok(bad === 0, `ledgerCutoffSorted = ledgerCutoff on 300 random windows (ties at the edge, the ceiling, prev): ${bad} differ`);
  }

  console.log('§6 a row the columns cannot hold, below the cut');
  {
    const rows = Array.from({ length: 2000 }, () => mkRow(T - Math.floor(rnd() * 30 * DAY)));
    rows.push({ ...mkRow(T - 42 * DAY), i: 1.5 }); // a token count the columns cannot hold exactly: it stays hot
    const { uh, c } = mk(0, { hub: false, rows });
    uh._sortedEvents(); uh._trimHot();
    const first = c.lastTrim.end; uh._trimHot();
    ok(first === 'nothing coldable below the cut' && c.lastTrim.end === 'the same rows below the cut, none coldable' && c.lastTrim.passVisits === 0 && c.cold.n === 0, `the trim that kept it: «${first}»; the next: «${c.lastTrim.end}», ${c.lastTrim.passVisits} rows visited`);
    const cut0 = c.cutoff; c.cutoff = -Infinity; take(uh, c, [mkRow(T - 42 * DAY)], { off: 1e6, seen: new Set() }); c.cutoff = cut0; // a coldable row that sits hot below the cut (as one held while a stage was open does)
    uh._sortedEvents(); uh._trimHot();
    ok(c.lastTrim.end === 'moved' && c.lastTrim.moved === 1 && c.cold.n === 1, `…a coldable row that then comes below the cut is still moved (${c.lastTrim.moved})`);
    const old = CB.HashIndex.fromParts({ keys: Float64Array.of(1, 2), vals: Float64Array.of(10, 20), tk: new Float64Array(4096), tv: new Float64Array(4096), tn: 0, merges: 0 });
    old.put(3, 30); old.settle();
    ok(old.findSorted(2)[0] === 20 && old.findSorted(3)[0] === 30 && old.findSorted(1)[0] === 10 && old.work === 1 + 3, 'an index\'s old-shape parts (no runs, no work counter) take new ids and answer every one');
    const L = mk(10000, { hub: false }); L.uh._sortedEvents(); const f0 = L.c.fullSorts;
    take(L.uh, L.c, Array.from({ length: 65 }, () => mkRow(T - Math.floor(rnd() * 30 * DAY))), L.st); L.uh._sortedEvents();
    ok(sameView(L.c) && L.c.fullSorts === f0, '65 late rows (past the binary placement\'s 64: the linear merge) = the full stable sort, no full sort');
  }

  console.log('§7 the bytes the hub appended, a slice a turn');
  {
    const base = path.join(tmp, 'absorb', 'usage-history'); fs.mkdirSync(base, { recursive: true });
    const writeRows = (evs) => { const by = new Map(); for (const ev of evs) { const f = shardOf(ev.ts); if (!by.has(f)) by.set(f, []); by.get(f).push(JSON.stringify(ev)); } for (const [f, ls] of by) fs.appendFileSync(path.join(base, f), ls.join('\n') + '\n'); };
    writeRows(Array.from({ length: 2000 }, () => mkRow(T - 2 * DAY - Math.floor(rnd() * 8 * DAY))));
    const mkA = () => { const u = new UsageHistory({ dataDir: path.dirname(base), homeDir: tmp }); u.ledgerWindowMs = 40 * DAY; u.ledgerHotMaxBytes = 1e9; u.warm(); return u; };
    const counted = (u) => { const o = { n: 0 }, tk = u._take.bind(u); u._take = (...a) => { o.n++; return tk(...a); }; return o; };
    const hub = mkA(), rel = mkA(); hub.firstLoadInWorker = true; // the hub's ledger, its first load landed
    const more = Array.from({ length: 12000 }, () => mkRow(T - Math.floor(rnd() * DAY))), minLine = Math.min(...more.map((e) => JSON.stringify(e).length + 1));
    writeRows(more); hub._evCache.checkedAt = 0; rel._evCache.checkedAt = 0;
    const relN = counted(rel); rel._loadEvents();
    const hubN = counted(hub); const p1 = hub._absorbStepped(), steps = hub._evCache.absorbed, firstTick = hubN.n;
    await p1;
    const perSlice = Math.ceil((1 << 20) / minLine) + 1, maxStep = Math.max(...steps);
    const sigA = (u) => { const c = u._evCache; return JSON.stringify([c.events.length + c.cold.n, [...c.rids].sort().slice(0, 50), c.hotBytes]); };
    ok(steps.length >= 3 && maxStep <= perSlice && firstTick <= perSlice && hub._evCache.events.length + hub._evCache.cold.n === 14000 && sigA(hub) === sigA(rel), `the hub took the 12 000 appended rows in ${steps.length} steps of ≤ ${maxStep} rows (one 1 MiB slice ≤ ${perSlice}), its cache = a synchronous load's`);
    ok(relN.n === 12000, `control (the release's road — the next sync reader): ${relN.n} rows taken in ONE call ⇒ RED`);
    writeRows(Array.from({ length: 12000 }, () => mkRow(T - Math.floor(rnd() * DAY)))); hub._evCache.checkedAt = 0;
    const p2 = hub._absorbStepped(); const before = hubN.n; hub._loadEvents(); const tookOver = hubN.n - before;
    await p2;
    ok(tookOver > 0 && tookOver * minLine <= 8 * (1 << 20) && hub._evCache.events.length + hub._evCache.cold.n === 26000 && !hub._evCache.pending, `a sync reader mid-way takes over ${tookOver} rows — within TAKEOVER_MAX_BYTES (8 slices), the rest of the pass with it`);
    // MORE THAN THE TAKEOVER BOUND LEFT (the adversarial read's must): an async reader WAITS for the absorb — never a promise
    // already settled (the boot's warm), which a reader that asks again turned into a microtask loop; a stale small reading of
    // what is left never lets a sync reader take it all; bytes that come mid-absorb are taken by the pass it chains
    const big = mkA(); big.firstLoadInWorker = true; big.takeoverMaxBytes = 64 * 1024;
    const nBig = big._evCache.events.length + big._evCache.cold.n;
    writeRows(Array.from({ length: 12000 }, () => mkRow(T - Math.floor(rnd() * DAY)))); big._evCache.checkedAt = 0;
    big._evCache.loading = { bytesLeft: 1, at: T }; // a stale reading from before
    const bigN = counted(big), pb = big._absorbStepped(), w = big._waitBigWarm(), before2 = bigN.n; big._loadEvents(); const tookBig = bigN.n - before2;
    const raceOf = (p0) => Promise.race([p0.then(() => 'settled'), new Promise((r) => setImmediate(() => r('waiting')))]);
    const firstLook = await raceOf(w);
    const stillRunning = !!big._evCache.absorbing;
    const rel5 = Object.create(big); rel5._waitBigWarm = function () { if (this._booting()) return this._bootWait(); return this._pendingLeft() > this._takeoverMax() ? this.warmSettled() : null; }; // the release's body
    const relLook = await raceOf(rel5._waitBigWarm() || Promise.resolve());
    writeRows(Array.from({ length: 500 }, () => mkRow(T - Math.floor(rnd() * DAY)))); const chained = big._absorbStepped(); // bytes that come mid-absorb
    const agg = await big.aggregateAsync({ from: T - 20 * DAY, to: T + DAY, rows: true }); await pb; await chained;   // the row road (B-360d unit 1)
    ok(w === big._evCache.absorbing || firstLook === 'waiting', 'an async reader mid-absorb (more than the takeover bound left) gets the absorb to wait for');
    ok(firstLook === 'waiting' && tookBig === 0 && agg && agg.totals && agg.totals.requests === nBig + 12500 && big._evCache.events.length + big._evCache.cold.n === nBig + 12500 && !big._evCache.absorbing,
      `…it waits (${firstLook}), a sync reader takes over nothing past the bound (${tookBig} rows — a stale small reading reset), the bytes that came mid-absorb are taken by the pass it chains: ${agg && agg.totals && agg.totals.requests} rows answered`);
    ok(stillRunning && relLook === 'settled', `control (the release's _waitBigWarm — the boot's warm, ended): «${relLook}» before one loop turn while the absorb still ran (${stillRunning}) ⇒ RED (a reader that asks again loops in microtasks); a reverted cure hangs this suite, and the suite watchdog names it`);
    // a pass that ends inside its first step (nothing new) never leaves a settled promise behind: the next append is still taken stepped
    const none = big._absorbStepped(); await none;
    const leftAfter = big._evCache.absorbing;
    writeRows(Array.from({ length: 12000 }, () => mkRow(T - Math.floor(rnd() * DAY))));
    const again = big._absorbStepped(), stepsAgain = big._evCache.absorbed; await again;
    ok(leftAfter == null && stepsAgain && stepsAgain.length >= 3 && big._evCache.events.length + big._evCache.cold.n === nBig + 24500, `an absorb that found nothing ends with no promise left on the cache (${leftAfter}); the next append is taken in ${stepsAgain && stepsAgain.length} steps`);
    const srcA = fs.readFileSync(path.join(REPO, 'src/usage-history.js'), 'utf8');
    ok(/if \(appendedNow\) await this\._absorbStepped\(\);/.test(srcA) && /if \(appended\) this\._absorbStepped\(\);/.test(srcA), 'the scan awaits it before it settles; a host batch asks for it');
  }
  console.log('§3t the equal-instant tie (the chain\'s cure, small — last: its rows draw nothing the legs before use)');
  { // a coldable row that comes while the stage is open, at the SAME ms as a row this trim MOVES, waits hot and moves at the next
    // trim — it then sits after that row in the columns (the untrimmed twin keeps load order). Pinned: the scene's preconditions (a
    // tie with a MOVED row, held hot), the row neither lost nor doubled, every priced row and count = the twin's (the signature,
    // order-free), a read-order sum within 1e-12 relative — a one-row reorder's ulp is inside it: the leg pins the scene, not the bit
    const { uh, c, st, rows } = mk(10000, { hub: false });
    c.cutoff = T - 43 * DAY; uh._sortedEvents();
    const g = uh._trimSteps(500); let r = g.next(); while (!r.done && !c.cold.sn) r = g.next();   // the stage is open
    const deep = rows.filter((e) => (e.ts || 0) < T - 43.8 * DAY), tieTs = deep.length ? deep[0].ts : 0;
    const late = { ...deep[0], rid: 'req_tie_late', mid: 'msg_tie_late', host: undefined, i: 1234, o: 567, cr: 8910 };   // no draw of the seeded rows: the legs before keep their sequence
    take(uh, c, [late], st);
    while (!r.done) r = g.next();
    const movedTie = c.cold.n > 0 && !c.events.some((e) => e !== late && e.ts === tieTs);   // the row it ties with went cold in this trim
    const heldHot = c.events.includes(late);
    uh._trimHot();                                                                          // the next trim moves the late row
    const twin = mk(0, { hub: false, rows: [...rows, late].map((e) => ({ ...e })) }).uh; twin._sortedEvents();
    const sumIn = (u) => { let s = 0; for (const e of u._events(0, T + DAY)) s += (Number(e.i) || 0) * 3e-6 + (Number(e.o) || 0) * 1.5e-5 + (Number(e.cw5) || 0) * 3.75e-6 + (Number(e.cr) || 0) * 3e-7; return s; };
    const a = sumIn(uh), b = sumIn(twin);
    ok(deep.length > 0 && movedTie && heldHot && !c.events.includes(late) && sig(uh) === sig(twin) && JSON.stringify(counts(uh)) === JSON.stringify(counts(twin)) && Math.abs(a - b) <= 1e-12 * Math.max(1, Math.abs(b)),
      `a row at the SAME ms as a moved row, come while the stage was open: held hot, moved at the next trim; every priced row and count = the untrimmed twin's, the read-order sum ${a === b ? 'equal to the bit' : `within its last ulp (${(a - b).toExponential(2)})`}`, { deep: deep.length, movedTie, heldHot, a, b });
  }

  console.log('§6 B-360d cut 3 (主开发 r2764 / r2798): the pass trims as it reads — the same ledger to the byte, wherever the slices fall');
  {
    const base = path.join(tmp, 'cut3', 'usage-history'); fs.mkdirSync(base, { recursive: true });
    const seed0 = seed; seed = 4242;
    const rows = Array.from({ length: 24000 }, () => mkRow(T - Math.floor(rnd() * 70 * DAY)));   // 70 days: past the 40-day window a row goes cold at its read; inside it the hot set passes its ceiling many times
    // ROWS OF ONE TIME (lane lg-providers' read): the rows of one reply share their timestamp — 150 groups of three to five rows, spread over
    // the whole span (some fall just below or just above the pass's own cuts: counted below), shuffled apart like any rows
    const groupTs = new Set();
    for (let g = 0; g < 150; g++) { const k = 60 + g * 150, size = 3 + (g % 3); for (let q = 1; q < size; q++) rows[k + q].ts = rows[k].ts; groupTs.add(rows[k].ts); }
    // A REQUEST ID MET AGAIN ACROSS SHARDS (the first copy wins), a third of them RE-ATTRIBUTED (another account) — some later, some earlier
    const firsts = rows.filter((e) => e.rid && !e.host).slice(0, 600);
    const repeats = firsts.map((e, k) => ({ ...e, ts: e.ts + (k % 2 ? 3 * DAY : -2 * DAY), acct: k % 3 ? e.acct : 'acc-z', i: (e.i || 0) + 1 }));
    // ROWS OUT OF ORDER IN TIME: each shard shuffled (this carries a row read after a pass's cut that is older than it), and old rows
    // written into the newest shard (50–65 days: below the window, so they only go cold at their read — what the release already did)
    const all = rows.concat(repeats);
    for (let k = all.length - 1; k > 0; k--) { const j = Math.floor(rnd() * (k + 1)); [all[k], all[j]] = [all[j], all[k]]; }
    writeRowsTo(base, all);
    const newest = path.join(base, shardOf(T)), late = Array.from({ length: 300 }, () => mkRow(T - 50 * DAY - Math.floor(rnd() * 15 * DAY)));
    fs.appendFileSync(newest, late.map((e) => JSON.stringify(e)).join('\n') + '\n');
    // A SHARD CUT SHORT: an unfinished last row (no newline) — no road takes it
    fs.appendFileSync(newest, JSON.stringify(mkRow(T - DAY)).slice(0, 60));
    seed = seed0;
    const src = fs.readFileSync(path.join(REPO, 'src/usage-history.js'), 'utf8');
    const MID = /\n {8}if \(\(this\.passTrim \?\? !isMainThread\) && !stepped[^\n]*\n/;
    const M = mutantCopies('usage-trim-cut3', REPO);
    const RELEASE = M.load('src/usage-history.js', editAnchor(src, MID, '\n', 'src/usage-history.js'), 'release').UsageHistory;   // the release's road: ONE trim, at the pass's end
    const STAGE = '        if (i !== undefined) { const loc = c.locs[i]; c.cold.stage(ev, Math.floor(loc / 4294967296), loc % 4294967296, c.hrh[i]); }\n';
    const DROPS = M.load('src/usage-history.js', editAnchor(src, STAGE, '        if (i !== undefined) { const loc = c.locs[i]; if (!(globalThis.__cut3Drop && globalThis.__cut3Drop-- === 1)) c.cold.stage(ev, Math.floor(loc / 4294967296), loc % 4294967296, c.hrh[i]); }\n', 'src/usage-history.js'), 'drops').UsageHistory;
    const DOUBLES = M.load('src/usage-history.js', editAnchor(src, STAGE, '        if (i !== undefined) { const loc = c.locs[i]; c.cold.stage(ev, Math.floor(loc / 4294967296), loc % 4294967296, c.hrh[i]); if (globalThis.__cut3Twice && globalThis.__cut3Twice-- === 1) c.cold.stage(ev, Math.floor(loc / 4294967296), loc % 4294967296, c.hrh[i]); }\n', 'src/usage-history.js'), 'doubles').UsageHistory;
    const MAX = 400 * 1024;   // the hot ceiling, far under the window's ~3 MB of rows: the pass passes it many times
    const ridsOf = [...new Set(all.concat(late).map((e) => e.rid).filter(Boolean))], midsOf = [...new Set(all.concat(late).map((e) => e.mid).filter(Boolean))];
    const dump = (u) => {
      const c = u._evCache; c.cold.settle(); for (const k of Object.keys(c.cold.idx)) c.cold.idx[k].settle();
      const n = c.cold.n, sl = (a) => Array.from(a.subarray ? a.subarray(0, n) : a.slice(0, n), (x) => (Number.isNaN(x) ? 'NaN' : x));
      return JSON.stringify({ hot: c.events.map((e) => JSON.stringify(e)), sizes: c.sizes, locs: c.locs.map(String), hrh: c.hrh.map(String), hotBytes: c.hotBytes, cutoff: c.cutoff,
        rids: [...c.rids], mids: [...c.mids], coldN: n, ts: sl(c.cold.ts), rh: sl(c.cold.rh), sh: sl(c.cold.sh), off: sl(c.cold.off), tok: c.cold.tok.map(sl), names: c.cold.nm.map((col, k) => Array.from(col.subarray(0, n), (id) => c.cold.names[k].vals[id])),   // DECODED: a name's id may be numbered otherwise on another road; readers decode by value
        midAt: midsOf.map((m) => [...c.cold.idx.mid.findSorted(CB.idHash(m))].map(String).sort().join('/')), srcWm: [...c.srcWm].sort(), hostAcct: [...(c.hostAcct || new Map())].map(([h, m]) => [h, [...m].map(([a, l]) => [a, l.ts.slice().sort((x, y) => x - y)])]).sort(),
        ridAt: ridsOf.map((r) => [...c.cold.idx.rid.findSorted(CB.idHash(r))].map(String).sort().join('/')), consumed: [...c.consumed] });
    };
    const run = (U, slice) => {
      const u = new U({ dataDir: path.dirname(base), homeDir: tmp }); u.ledgerWindowMs = 40 * DAY; u.ledgerHotMaxBytes = MAX; u.tailStepBytes = slice; u.passTrim = true;   // the fold worker's road (a worker thread), here in-process
      let trims = 0, peak = 0; const cuts = []; const own = u._trimHot; u._trimHot = function () { trims++; peak = Math.max(peak, this._evCache.events.length); const r = own.call(this); if (this._evCache.lastTrim && Number.isFinite(this._evCache.lastTrim.cut)) cuts.push(this._evCache.lastTrim.cut); return r; };
      // r3668's SHOULD: count the repeats that CROSS A TRIM — the first copy taken hot, its id gone from the hot set (trimmed cold) by
      // the time the repeat is read; a re-attributed repeat (another account) counted apart
      const firstAt = new Map(); let crossed = 0, crossedRe = 0; const take0 = u._take;
      u._take = function (cc, ev, ...rest) { const id = ev.rid, f = id && repeatIds.has(id) ? firstAt.get(id) : null; if (f && f.hot && !cc.rids.has(id)) { crossed++; if ((ev.acct || null) !== f.acct) crossedRe++; } const r = take0.call(this, cc, ev, ...rest); if (id && repeatIds.has(id) && !firstAt.has(id)) firstAt.set(id, { hot: r === 1, acct: ev.acct || null }); return r; };
      u._loadEvents();
      const d = dump(u), c = u._evCache, byRid = new Map(); for (const e of c.events) if (e.rid) byRid.set(e.rid, (byRid.get(e.rid) || 0) + 1);   // after dump's settle: an id's hot rows + its places in the cold rid index
      return { trims, peak, cuts, crossed, crossedRe, once: firsts.map((e) => (byRid.get(e.rid) || 0) + [...c.cold.idx.rid.findSorted(CB.idHash(e.rid))].length), dump: d, sig: sig(u), counts: JSON.stringify(counts(u)), totals: JSON.stringify(u.aggregate({ to: T + DAY }).totals) };
    };
    const repeatIds = new Set(firsts.map((e) => e.rid));
    const r0 = run(RELEASE, 64 * 1024), r1 = run(UsageHistory, 64 * 1024), r2 = run(UsageHistory, 4 * 1024), r3 = run(UsageHistory, 1024 * 1024);
    console.log(`      the release: ${r0.trims} trim(s), at most ${r0.peak} hot rows · this pass at 64 KiB: ${r1.trims} trims, at most ${r1.peak} · at 4 KiB: ${r2.trims}, ${r2.peak} · at 1 MiB: ${r3.trims}, ${r3.peak} — ${JSON.parse(r1.dump).coldN} rows cold, ${JSON.parse(r1.dump).hot.length} hot`);
    const same = (a, b) => a.dump === b.dump && a.sig === b.sig && a.counts === b.counts && a.totals === b.totals;
    { const u = new UsageHistory({ dataDir: path.dirname(base), homeDir: tmp }); u.ledgerWindowMs = 40 * DAY; u.ledgerHotMaxBytes = MAX; let t = 0; const own = u._trimHot; u._trimHot = function () { t++; return own.call(this); }; u._loadEvents();
      ok(t === 2, `ON THE MAIN THREAD (the hub, a migration's own instance) the pass trims as the release does: at its start and its end (${t} trims) — never more work on the hub's loop`); }
    ok(r0.trims === 2 && r1.trims > 4 && r2.trims > 4 && r3.trims >= 3, `the release trims at its pass's start (the window's cut) and ONCE at its end; this pass trims as it reads (${r1.trims} / ${r2.trims} / ${r3.trims} trims at 64 KiB / 4 KiB / 1 MiB slices)`);
    ok(same(r0, r1) && same(r0, r2) && same(r0, r3), 'THE SAME LEDGER TO THE BYTE: the release\'s pass and this pass at three slice sizes leave the same hot rows (in order, with their sizes, places and hashes), the same two id sets, the same cold columns and indexes after their settle, the same cutoff — and every reader\'s figure (each row\'s fields, the counts by time, the money\'s totals) equal');
    ok(r1.peak * 2 < r0.peak && r2.peak * 2 < r0.peak, `the hot set as the pass reads: at most ${r1.peak} / ${r2.peak} rows against the release's ${r0.peak} (the rows inside the window waited for its one end trim)`);
    const onceAll = (r) => r.once.length === 600 && r.once.every((x) => x === 1);
    ok([r1, r2, r3].every((r) => r.crossed > 0 && r.crossedRe > 0), `A REPEAT CROSSES A TRIM on every slice size (its first copy taken hot, its id trimmed out of the hot set before the repeat was read): 64 KiB ${r1.crossed} (re-attributed ${r1.crossedRe}) · 4 KiB ${r2.crossed} (${r2.crossedRe}) · 1 MiB ${r3.crossed} (${r3.crossedRe}) · the release ${r0.crossed} (${r0.crossedRe}) — the pass's own seen set catches each`);
    ok([r0, r1, r2, r3].every(onceAll), `A REQUEST ID MET AGAIN is ONE row after the pass on every road (600 ids read twice, across shards, a third re-attributed): the release ${r0.once.filter((x) => x === 1).length} · 64 KiB ${r1.once.filter((x) => x === 1).length} · 4 KiB ${r2.once.filter((x) => x === 1).length} · 1 MiB ${r3.once.filter((x) => x === 1).length} of 600 — the pass's own seen set catches a repeat whose first copy went cold at an earlier trim`);
    // rows of one time on either side of the pass's own cuts: REACHED (the same-time groups nearest a cut, within 12 h, below it and at or above it)
    const near = (r) => { let below = 0, above = 0, at = 0; for (const t of groupTs) for (const ct of r.cuts) { if (t === ct) at++; else if (t < ct && ct - t <= 12 * 3600e3) below++; else if (t > ct && t - ct <= 12 * 3600e3) above++; } return { below, above, at }; };
    const n1 = near(r1), n2 = near(r2);
    ok(n1.below > 0 && n1.above > 0 && n2.below > 0 && n2.above > 0, `ROWS OF ONE TIME around the pass's own cuts are in the comparison: at 64 KiB ${n1.below} group(s) just below a cut, ${n1.above} just above, ${n1.at} at one · at 4 KiB ${n2.below} / ${n2.above} / ${n2.at}`);
    globalThis.__cut3Drop = 1; const rd = run(DROPS, 64 * 1024); globalThis.__cut3Drop = 0;
    globalThis.__cut3Twice = 1; const rt = run(DOUBLES, 64 * 1024); globalThis.__cut3Twice = 0;
    const HALF = M.load('src/usage-history.js', editAnchor(src, 'pass.trimmed = (pass.trimmed || 0) + 1; this._trimHot();', 'pass.trimmed = (pass.trimmed || 0) + 1; { const m0 = this.ledgerHotMaxBytes; this.ledgerHotMaxBytes = Math.floor(this._ledgerHotMaxBytes() / 2); this._trimHot(); this.ledgerHotMaxBytes = m0; }', 'src/usage-history.js'), 'half').UsageHistory;
    const rh = run(HALF, 64 * 1024);
    ok(!same(r0, rd) && !same(r0, rt) && !same(r0, rh), `RED: a trim that DROPS one row, one that DOUBLES one row, and THE PASS's TRIM CUTTING TO HALF THE CEILING (an early cut above the end's: ${JSON.parse(rh.dump).hot.length} rows end hot against the release's ${JSON.parse(r0.dump).hot.length}) are each not the release's ledger by the same comparison`);
  }
} finally { Date.now = realNow; }
fs.rmSync(tmp, { recursive: true, force: true });
console.log(fail ? `✗ ${fail} failed, ${pass} passed` : `ALL PASS ${pass} passed`);
process.exit(fail ? 1 : 0);

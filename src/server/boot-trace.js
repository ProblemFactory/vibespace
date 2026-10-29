'use strict';
// THE BOOT HOLDS (B-1319, lane boot-loop-hold, 2026-10-13). A boot that holds the main loop stalls everything that
// waits on it — the paired devices' links, the keeper, every child's stdout, the first page, the canary. Production
// said "main loop held 7450ms" 8 s after a restart; on a production-shaped instance the lane named the holds: the
// ledger warm parsing ~400 MB in ONE tick (3.5 s), the restore asking `fuser` once per socket inside the listen tick
// (1.2 s for 13 sessions), the OTel stash read + rewritten whole before the port opened (0.5 s) — each moved off the
// loop where its rule says (usage-history warmStepped, boot-restore probeSockets, otel-ingest's replay).
//
// THIS IS THE BOOT'S OWN CLOCK, always on: from the first lines of server.js for WINDOW_MS it ticks every TICK_MS and
// records every gap ≥ HOLD_MS (the loop did not turn), named by the boot step that ran in it — `step(name, fn)` for a
// synchronous step, `span(name, promise)` for one that runs a slice per tick. The FIRST gap is the main-module
// evaluation (the code loading and the stores read before the port opens): reported as `mainMs`, never a hold —
// nothing outside the process waits on it (the port is not open yet). When the window closes the report is written to
// data/boot-trace.json; GET /api/boot-trace answers it live and ⚙ → Diagnostics report lists the top 5 holds.
//
// VIBESPACE_BOOT_TRACE=1 also NAMES the sync work inside each hold: every fs.*Sync / execFileSync / execSync /
// spawnSync call and every JSON.parse of ≥ 1 MB is timed with its first repo frame until the window closes, and each
// hold lists its top sites. A diagnostics door (a stack per call) — never on by default.
// Lane ledger-dedup-law r12: A HOLD OF PURE CPU IS NAMED TOO — the calls above are a hold's sync CALLS; a hold that made
// none (the sync ledger warm: 98 % of its 4 s is parsing lines, its reads landed outside it on a slow boot — `sites: []`;
// the browser census's walk of the process table) named nothing. VIBESPACE_BOOT_TRACE=1 also SAMPLES the main thread's
// stack (the in-process inspector's profiler, every CPU_SAMPLE_US), and each hold names the repo frames its samples stood
// in (`cpu <function> (<file>:<line>)`, the garbage collector by its name) beside its calls. VIBESPACE_BOOT_TRACE_CPU=1
// arms the sampler alone (no call is wrapped — a sample costs the loop µs): the gate's measured boot names every hold.
// The samples are FOLDED ONCE — at the window's close, or when a report asks (`GET /api/boot-trace?cpu=1`, `report({cpu:
// true})`): the profiler is never restarted (a start re-logs every compiled function — ~150 ms of the loop on a booted
// hub; folding at each report made the gate's 250 ms poll a hold of its own). Before the fold a hold names its calls only.
// Round 14: A HOLD IS NAMED ONLY BY WHAT FILLS IT — each source (the calls, the CPU samples) names a hold when what it saw
// there is at least half the hold's span or NAME_MIN_MS; below that its sites ride the hold as `faint` (said, never its
// name). r12 named a hold by ANY site in it: one 1 ms sample of a process the box stopped for 300 ms named the hold
// «cpu (program)», so «every hold is named» could not fail once the sampler ran. Round 15: what a source saw is its RAW
// time, summed unrounded and rounded once (`seen` — r14 summed the sites' ms after rounding each: 600 calls of 0.4 ms at
// 600 sites summed 0 and their 240 ms of a 300 ms hold went `faint`); a hold's `faint` sites are listed, greyed, in
// ⚙ Diagnostics under the named ones (src/lib/setup-flows.js — r14 rendered `sites` only: they vanished from the table).
// VIBESPACE_BOOT_TRACE_SYNC=1 is the gate's RED control (scripts/test-boot-loop-hold.mjs): the boot's ledger warm runs
// the old way, in one tick on the loop.
// NOTES (B-92a4): a boot step's own lines that outlive its span — the restore's probe-pending sessions and the re-probe's
// verdicts after listen — `note(text)`, answered live by GET /api/boot-trace (`notes`) and listed in ⚙ Diagnostics.
const fs = require('fs');
const path = require('path');
const { performance, monitorEventLoopDelay } = require('perf_hooks');

const TICK_MS = 10;
const HOLD_MS = 100;      // recorded from here; the gate's law is 250 ms
const WINDOW_MS = 90000;  // past the boot's deferred steps (the ledger warm starts 8 s after listen)
const KEEP = 20;          // holds kept in the report, longest first
const BIG_PARSE = 1 << 20;
const NOTES_KEEP = 40;
const NAME_MIN_MS = 100; // r14: a source names a hold when it saw at least this much of it (or half its span)

let one = null;

/** The boot clock (one per process; a second call answers the first). */
function start({ dataDir, env = process.env, now = () => performance.now(), windowMs = Number(env.VIBESPACE_BOOT_TRACE_WINDOW_MS) || WINDOW_MS } = {}) {
  // lane vault-slow-load addendum: the main thread's slow SYNC fs calls are kept from here (server.js's 5th line — before the
  // modules that destructure fs): a blocked loop names its blocker (src/server/loop-blame.js)
  try { if (dataDir) require('./loop-blame.js').install({ root: path.dirname(dataDir) }); } catch { }
  // lane hub-fuse-sync-guard: THE WITNESS + THE MOUNT GUARD ride that wrapper from here (src/server/sync-fs-witness.js) —
  // a held loop names its call, and the main thread never waits on a storage mount (server.js wires the canary, the
  // mounts registry and the setting once they exist)
  try { if (dataDir) require('./sync-fs-witness.js').create({ rootDir: path.dirname(dataDir), dataDir }).start(); } catch (e) { console.warn('[sync-fs] the witness did not start —', e && e.message); }
  if (one) return one;
  const startAt = now(), steps = [], spans = [], gaps = [], ops = [], notes = [];
  let label = null, sticky = null, last = startAt, mainMs = null, mainEndAt = null, listenAt = null, closed = false, resolveDone, turns = 0;
  const done = new Promise((r) => { resolveDone = r; });
  const eld = monitorEventLoopDelay({ resolution: 20 }); eld.enable();
  const tick = () => {
    const t = now();
    if (mainMs === null) { // the first turn of the loop: the main-module evaluation ends at mainEnd() (server.js's last line); what ran after it before this turn (the listen callback) is a hold
      mainMs = Math.round((mainEndAt ?? t) - startAt);
      last = mainEndAt ?? t;
    }
    const gap = t - last - TICK_MS;
    if (gap >= HOLD_MS) gaps.push({ at: Math.round(last), ms: Math.round(gap), label: label || sticky, t0: last, t1: t }); // r11: t0/t1 the hold's exact span (the window its sites are credited in)
    last = t; sticky = null; turns++;
    if (t - startAt >= windowMs) close();
  };
  const timer = setInterval(tick, TICK_MS); if (timer.unref) timer.unref();
  const unwrap = env.VIBESPACE_BOOT_TRACE === '1' ? wrapSync({ ops, now, turn: () => turns }) : () => { };
  const cpu = env.VIBESPACE_BOOT_TRACE === '1' || env.VIBESPACE_BOOT_TRACE_CPU === '1' ? cpuSampler({ now }) : null; // r12
  const nameOf = (g) => {
    if (g.label) return g.label;
    const overlap = (x) => Math.max(0, Math.min(g.at + g.ms, x.at + x.ms) - Math.max(g.at, x.at));
    const s = steps.filter((x) => overlap(x) > 0).sort((a, b) => overlap(b) - overlap(a))[0];
    if (s) return s.name;
    const sp = spans.filter((x) => x.at <= g.at && (x.ms == null || g.at <= x.at + x.ms)).sort((a, b) => b.at - a.at)[0];
    return sp ? sp.name : null;
  };
  // a hold is the span between two turns of the clock: [last, t]. r11: the exact span (r10 used the rounded [at - 1, at +
  // ms + TICK_MS]: two holds in a row overlapped by 1 ms and an op there was credited to both)
  const holdWin = (g) => (g.t1 != null ? { at: g.t0, ms: g.t1 - g.t0 } : { at: g.at - 1, ms: g.ms + TICK_MS + 1 });
  // r12: a hold's calls (top 3) and the frames its CPU stood in (top 3, `cpu …`). r14: each source NAMES the hold only when
  // what it saw there fills it (`fills`) — else its sites are the hold's `faint` ones (said, never its name)
  const holdSites = (g) => {
    const w = holdWin(g), sites = [], faint = [];
    for (const all of [ops.length ? sitesOf(ops, w, Infinity) : [], cpu ? cpu.sitesIn(w, Infinity) : []]) (fills(all, w) ? sites : faint).push(...all.slice(0, 3));
    return { sites, ...(faint.length ? { faint } : {}) };
  };
  function report({ cpu: foldCpu = false } = {}) {
    if (cpu && (foldCpu || closed)) cpu.drain(false); // r12: folded ONCE, never restarted (a restart re-logs every compiled function)
    const holds = gaps.slice().sort((a, b) => b.ms - a.ms).slice(0, KEEP).map((g) => ({ at: g.at, ms: g.ms, name: nameOf(g), ...(ops.length || cpu ? holdSites(g) : {}) }));
    return { pid: process.pid, startedAt: Math.round(performance.timeOrigin + startAt), startAt: Math.round(startAt), mainMs, listenAt: listenAt == null ? null : Math.round(listenAt), windowMs, closed, traced: env.VIBESPACE_BOOT_TRACE === '1',
      ...(env.VIBESPACE_BOOT_TRACE === '1' ? { ops: ops.length, opsDropped: ops.dropped || 0 } : {}), // r12: the ops kept, and those past OPS_MAX — a hold with `sites: []` says whether its ops were dropped
      ...(cpu ? { cpu: cpu.facts() } : {}), // r12: the sampler's samples (kept, dropped, its interval) — or why it could not run
      maxHoldMs: gaps.reduce((m, g) => Math.max(m, g.ms), 0), eldMaxMs: Math.round(eld.max / 1e6), holds, steps: steps.map((s) => ({ name: s.name, at: Math.round(s.at), ms: Math.round(s.ms) })), spans: spans.map((s) => ({ name: s.name, at: Math.round(s.at), ms: s.ms == null ? null : Math.round(s.ms), ...(s.facts || {}) })), notes: notes.slice() };
  }
  function close() {
    if (closed) return;
    closed = true; clearInterval(timer); eld.disable(); unwrap();
    const rep = report();
    if (cpu) cpu.stop(); // r12: after the report's last drain
    if (dataDir) {
      const file = path.join(dataDir, 'boot-trace.json');
      fs.promises.writeFile(file + '.tmp', JSON.stringify(rep, null, 1)).then(() => fs.promises.rename(file + '.tmp', file)).catch(() => { }).finally(() => resolveDone(rep));
    } else resolveDone(rep);
  }
  one = {
    syncControl: env.VIBESPACE_BOOT_TRACE_SYNC === '1',
    /** A synchronous boot step, named: a hold it causes carries its name. */
    step(name, fn) { const prev = label, t0 = now(); label = name; try { return fn(); } finally { label = prev; steps.push({ name, at: t0, ms: now() - t0 }); } },
    /** A boot step that runs a slice per tick: its holds (if any) carry its name; `facts(result)` rides the report. */
    span(name, promise, facts = () => null) { const s = { name, at: now(), ms: null, facts: null }; spans.push(s); Promise.resolve(promise).then((r) => { s.facts = facts(r) || null; }, () => { }).finally(() => { s.ms = now() - s.at; }); return promise; },
    /** A line a boot step keeps saying past its span (B-92a4: the restore's re-probe) — live in the report, the newest kept. */
    note(text) { notes.push({ at: Math.round(now()), text: String(text).slice(0, 300) }); if (notes.length > NOTES_KEEP) notes.shift(); },
    /** server.js's last line: the main-module evaluation is over. */
    mainEnd() { if (mainEndAt === null) mainEndAt = now(); },
    /** The listen callback's first line: until the next tick, a hold is the listen callback's. */
    listening() { if (listenAt === null) listenAt = now(); sticky = 'listen'; },
    report, close, done,
    /** GET /api/boot-trace — this boot's holds (live until the window closes). */
    register(app) { app.get('/api/boot-trace', (req, res) => res.json(report({ cpu: !!(req.query && req.query.cpu === '1') }))); }, // r12: ?cpu=1 folds the sampler's samples (once)
  };
  return one;
}

/** r14: do a source's sites in window w ({at, ms}) — every one of them, not its top 3 — FILL it: at least half its span or
 *  NAME_MIN_MS (PURE). One sample, or one short call, in a hold the box made is no name of it. r15: weighed by the RAW time
 *  the source saw there (`sites.seen`: sitesOf's / sitesIn's unrounded sum over every site), rounded once — never the
 *  sum of the sites' rounded ms (sub-ms calls at many sites summed 0). */
function fills(sites, w) { const ms = Math.round(Number.isFinite(sites.seen) ? sites.seen : sites.reduce((n, x) => n + x.ms, 0)); return ms > 0 && (ms >= NAME_MIN_MS || ms >= w.ms / 2); }

/** VIBESPACE_BOOT_TRACE=1: every sync fs / child call + every ≥ 1 MB JSON.parse, timed with its first repo frame. Returns the unwrap.
 *  Lane ledger-dedup-law r9: A SITE IS NAMED BY ITS CALLS, never by a 1 ms floor — every call is kept, a run of calls at one
 *  site (each starting ≤ 1 ms after the one before ended) folded into one op (`n` calls, their summed ms): a hold made of
 *  many short calls (the ledger warm's sync tail read, TAIL_STEP_BYTES slices under 1 ms each since e11e1f61) named no
 *  site at all. Bounded: OPS_MAX ops, the rest counted (`dropped`).
 *  r10: A FOLD NEVER CROSSES A HOLD — an op is closed when the loop turns (`turn()`, the boot clock's tick count: a hold is
 *  the span between two ticks, so an op lies inside one) or once it spans FOLD_MS (the bound when no clock turns — a pure
 *  run); r9 folded a run across holds into ONE op credited whole to the first (300 ms of a 240 ms hold, the next `sites: []`).
 *  A run is keyed by (depth, call, its path / fd) — each its own open op, so a call made INSIDE another (readFileSync's
 *  openSync + readSync) and a second file read in turn no longer break every run; the stack is captured ONCE per op, at its
 *  first call (a call that joins an open op is timed, never walked).
 *  r11: A FOLD KEY NAMES THE SITE — every call's site is taken (its frames as CallSite objects, no text formatted; the first
 *  in the repo outside the tracer, its line formatted ONCE per code location) and a run is keyed by (depth, call, SITE,
 *  path / fd): a fold joins only the same site's calls (r10 keyed it without the site: a second site's calls on the same
 *  path or a reused fd within 1 ms joined the first site's op, and the second was never named). A string argument longer
 *  than ARG_KEY_MAX (a ≥ 1 MB JSON.parse text) keys its run by its length + a digest, never by itself, and is shown as its
 *  size (r10 kept every big text parsed in a turn in its key: 4 → 166 MiB over 40 parses of 2 MiB). */
const OPS_MAX = 200000;
const FOLD_MS = HOLD_MS / 2;
const OPEN_MAX = 1024;   // open runs kept per turn (distinct depth × call × site × path); past it they are closed
const SITES_MAX = 4096;  // r11: call sites remembered (each one's line, formatted once)
const ARG_KEY_MAX = 512; // r11: a longer string argument keys its run by its length + a digest
/** r11: a long string's stand-in — its length + an FNV digest of 64 chars spread over it (numbers: a slice would keep the
 *  whole text alive). */
const digestOf = (x) => { let h = 2166136261; const step = Math.max(1, Math.floor(x.length / 64)); for (let i = 0; i < x.length; i += step) h = Math.imul(h ^ x.charCodeAt(i), 16777619); return `${x.length}~${(h >>> 0).toString(36)}`; };
/** The ms each site spent INSIDE a window w = {at, ms} — PURE over wrapSync's ops: an op's calls are spread over its span and
 *  credited by OVERLAP (an op that began before the window or ends after it gives it only its share), never by where it
 *  began; a call made inside another traced call (`nested`) is its caller's time. Top `top`, longest first; r15: the
 *  array's `seen` = the raw ms of every site (unrounded). */
function sitesOf(ops, w, top = 3) {
  const by = new Map(), a0 = w.at, a1 = w.at + w.ms;
  for (const o of ops) {
    if (o.nested) continue;
    const b0 = o.at, b1 = o.at + (o.span || 0);
    const share = b1 > b0 ? o.ms * Math.max(0, Math.min(a1, b1) - Math.max(a0, b0)) / (b1 - b0) : (b0 >= a0 && b0 < a1 ? o.ms : 0);
    if (share > 0) { const k = `${o.op} ${o.site}`; by.set(k, (by.get(k) || 0) + share); }
  }
  const all = [...by].sort((a, b) => b[1] - a[1]), out = all.slice(0, top).map(([k, ms]) => ({ ms: Math.round(ms), what: k }));
  out.seen = all.reduce((n, [, ms]) => n + ms, 0); // r15: the raw time of every site (`fills` weighs it, rounded once)
  return out;
}
function wrapSync({ ops, now, turn = () => 0 }) {
  const root = path.join(__dirname, '..', '..') + path.sep, undo = [];
  let depth = 0, openTurn = null;
  const open = new Map(); // site line → (`${depth} ${call} ${path | fd}` → the op its next call may join) — this turn only
  let openN = 0;
  const sites = new Map(); // r11: a caller's code location — its file → (its position → its site line); each line formatted once
  let sitesN = 0;
  const repoFile = new Map(); // a frame's file name → is it a repo file outside node_modules and the tracer (judged once)
  // the first repo frame of the `limit` frames above the traced call `w` → its line (formatted once per location) | null
  const siteIn = (w, limit) => {
    const lim = Error.stackTraceLimit, prep = Error.prepareStackTrace;
    let cs = null;
    try { Error.stackTraceLimit = limit; Error.prepareStackTrace = (_, frames) => frames; const o = {}; Error.captureStackTrace(o, w); cs = o.stack; } finally { Error.prepareStackTrace = prep; Error.stackTraceLimit = lim; }
    for (const c of Array.isArray(cs) ? cs : []) {
      const f = (c.getFileName && c.getFileName()) || '';
      let mine = repoFile.get(f);
      if (mine === undefined) { mine = typeof f === 'string' && f.includes(root) && !f.includes('node_modules') && !f.includes('boot-trace.js'); if (repoFile.size < SITES_MAX) repoFile.set(f, mine); }
      if (!mine) continue;
      const pos = typeof c.getPosition === 'function' ? c.getPosition() : c.getLineNumber() * 1e5 + c.getColumnNumber();
      let byPos = sites.get(f), line = byPos && byPos.get(pos);
      if (line === undefined) {
        line = String(c).replace(/^at /, '').split(root).join('');
        if (sitesN < SITES_MAX) { if (!byPos) sites.set(f, byPos = new Map()); byPos.set(pos, line); sitesN++; }
      }
      return line;
    }
    return null;
  };
  // the caller's own frame first (a repo file's own call — one frame), the walk of 12 when it is not the repo's
  const site = (w) => siteIn(w, 1) ?? siteIn(w, 12) ?? '?';
  const wrap = (obj, name, label, keep = () => true) => {
    const orig = obj[name];
    if (typeof orig !== 'function') return;
    const w = obj[name] = function (...a) {
      const t0 = now(); depth++;
      try { return orig.apply(this, a); } finally {
        depth--; const ms = now() - t0;
        if (keep(a)) {
          const tn = turn(); if (tn !== openTurn || openN > OPEN_MAX) { open.clear(); openN = 0; openTurn = tn; } // the loop turned: every run is closed
          const x = a[0], s = site(w), long = typeof x === 'string' && x.length > ARG_KEY_MAX;
          const arg = typeof x === 'string' ? (long ? digestOf(x) : x) : typeof x === 'number' ? '#' + x : '', key = `${depth} ${label} ${arg}`;
          let at = open.get(s); if (!at) open.set(s, at = new Map());
          const o = at.get(key);
          if (o && t0 - (o.at + o.span) <= 1 && t0 + ms - o.at <= FOLD_MS) { o.ms += ms; o.n++; o.span = t0 + ms - o.at; }
          else if (ops.length < OPS_MAX) {
            let what = ''; try { what = typeof x !== 'string' ? '' : label === 'JSON.parse' ? `${Math.round(x.length / 1024)} KiB` : long ? `${x.length} chars` : x.split(root).join('').slice(0, 120); } catch { }
            const op = { op: label, at: t0, ms, span: ms, n: 1, site: `${s}${what ? ' ' + what : ''}`, nested: depth > 0 };
            ops.push(op); at.set(key, op); openN++;
          } else ops.dropped = (ops.dropped || 0) + 1;
        }
      }
    };
    undo.push(() => { obj[name] = orig; });
  };
  for (const n of ['readFileSync', 'readdirSync', 'statSync', 'lstatSync', 'existsSync', 'writeFileSync', 'appendFileSync', 'renameSync', 'readSync', 'openSync', 'realpathSync']) wrap(fs, n, 'fs.' + n);
  const cp = require('child_process');
  for (const n of ['execFileSync', 'execSync', 'spawnSync']) wrap(cp, n, n);
  wrap(JSON, 'parse', 'JSON.parse', (a) => typeof a[0] === 'string' && a[0].length >= BIG_PARSE);
  return () => { for (const u of undo.splice(0)) u(); };
}

/** r12: THE CPU SAMPLER — the main thread's stack every CPU_SAMPLE_US (the in-process inspector's profiler; its sample times
 *  are the monotonic clock's µs, put on the tracer's clock by one offset taken at its start). `drain(again)` folds the
 *  samples in (stop, read; `again` starts it once more — the tracer never asks: a start re-logs every compiled function) — each kept as (its time, the first repo frame from the top of its stack: its
 *  function and line; outside the tracer and node_modules; the garbage collector and V8's own work by their names; an idle
 *  sample is no hold's and is not kept). `sitesIn({at, ms}, top)` → the frames a window's samples stood in, their ms
 *  (samples × the interval), as `{ms, what: 'cpu …'}`. Bounded: CPU_SAMPLES_MAX samples, the rest counted. → null when no
 *  inspector can be had (a build without it): the report says so (`cpu.error`). */
const CPU_SAMPLE_US = 1000;
const CPU_SAMPLES_MAX = 200000;
function cpuSampler({ now }) {
  const root = path.join(__dirname, '..', '..') + path.sep;
  const at = [], what = [], names = [], nameIx = new Map();
  let session = null, running = false, off = 0, dropped = 0, error = null;
  const ix = (n) => { let k = nameIx.get(n); if (k === undefined) { k = names.length; names.push(n); nameIx.set(n, k); } return k; };
  const post = (m, q) => { let out = null; session.post(m, q || {}, (e, r) => { if (e) error = String((e && e.message) || e).slice(0, 120); else out = r || {}; }); return out; }; // the in-process session answers synchronously
  const begin = () => { off = now() - Number(process.hrtime.bigint()) / 1e6; running = !!post('Profiler.start'); };
  try { const inspector = require('inspector'); session = new inspector.Session(); session.connect(); post('Profiler.enable'); post('Profiler.setSamplingInterval', { interval: CPU_SAMPLE_US }); begin(); }
  catch (e) { error = String((e && e.message) || e).slice(0, 120); session = null; }
  function fold(prof) {
    const byId = new Map(), parent = new Map(), memo = new Map();
    for (const n of prof.nodes || []) { byId.set(n.id, n); for (const c of n.children || []) parent.set(c, n.id); }
    const frameOf = (id) => {
      let k = memo.get(id);
      if (k !== undefined) return k;
      const n0 = byId.get(id), fn0 = n0 ? n0.callFrame.functionName : '';
      if (fn0 === '(idle)') k = -1; // the loop waiting — no hold's
      else if (fn0 === '(garbage collector)' || fn0 === '(program)') k = ix(fn0);
      else {
        for (let n = n0; n && k === undefined; n = byId.get(parent.get(n.id))) {
          const u = String(n.callFrame.url || '').replace(/^file:\/\//, '');
          if (u.startsWith(root) && !u.includes('node_modules') && !u.endsWith('boot-trace.js')) k = ix(`${n.callFrame.functionName || '(anonymous)'} (${u.slice(root.length)}:${n.callFrame.lineNumber + 1})`);
        }
        if (k === undefined) k = ix('(outside the repo)');
      }
      memo.set(id, k); return k;
    };
    let t = prof.startTime || 0;
    for (let i = 0; i < (prof.samples || []).length; i++) {
      t += prof.timeDeltas[i] || 0;
      const k = frameOf(prof.samples[i]);
      if (k < 0) continue;
      if (at.length >= CPU_SAMPLES_MAX) { dropped++; continue; }
      at.push(off + t / 1000); what.push(k);
    }
  }
  return {
    drain(again) { if (!session || !running) return; const r = post('Profiler.stop'); running = false; if (r && r.profile) fold(r.profile); if (again) begin(); },
    sitesIn(w, top = 3) {
      let lo = 0, hi = at.length; while (lo < hi) { const m = (lo + hi) >> 1; if (at[m] < w.at) lo = m + 1; else hi = m; } // the samples are in time order
      const by = new Map();
      for (let i = lo; i < at.length && at[i] <= w.at + w.ms; i++) by.set(what[i], (by.get(what[i]) || 0) + 1);
      const all = [...by].sort((a, b) => b[1] - a[1]), out = all.slice(0, top).map(([k, n]) => ({ ms: Math.round(n * CPU_SAMPLE_US / 1000), what: `cpu ${names[k]}` }));
      out.seen = all.reduce((t, [, n]) => t + n, 0) * CPU_SAMPLE_US / 1000; // r15: every sample's time, unrounded (`fills`)
      return out;
    },
    facts() { return { samples: at.length, dropped, intervalUs: CPU_SAMPLE_US, running, ...(error ? { error } : {}) }; }, // `running`: not folded yet
    stop() { this.drain(false); try { if (session) { post('Profiler.disable'); session.disconnect(); } } catch { } session = null; },
  };
}

module.exports = { start, wrapSync, sitesOf, cpuSampler, fills, TICK_MS, HOLD_MS, WINDOW_MS, FOLD_MS, ARG_KEY_MAX, CPU_SAMPLE_US, NAME_MIN_MS };

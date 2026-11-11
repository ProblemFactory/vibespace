'use strict';
/**
 * THE SATURATED LOOP NAMES ITS TOP FUNCTIONS (lane hub-loop-stalls, commit 3). An owner's hub ran its main thread at
 * 85–93 % of a core in user space from MANY MEDIUM CALLBACKS, each under the hold watchdog's second (src/loop-hold.js): it
 * named the long holds and said nothing of the rest. PURE: every number and word of a CPU capture comes from here. The ORCH
 * halves are the watchdog thread (src/server/sync-fs-witness-worker.js: the ticks, the asks, the file) and the main
 * thread's book (src/server/loop-holds.js: the trigger, the collector's record, the block, the routes).
 *
 * THE CAPTURE — ONE bounded profile of the main thread: CAPTURE_MS at one tick every CAPTURE_EVERY_MS, taken from the
 * watchdog THREAD by commit 1's sampler at a dense rate (Runtime.evaluate of the one constant SAMPLE_EXPR, nothing enabled —
 * never V8's Profiler: Profiler.start held the main thread 2.1 s at a 2.3 GB heap, and that grows with the heap). Each tick
 * is classed by the main thread's KERNEL STATE FIRST (tickOf):
 *   · asleep in its own loop's poll (wait channel ep_poll) with its beat fresh ⇒ IDLE — never asked, never work, and never
 *     booked on the answer of an ask (the answer of an ask posted before it books only the ticks that were not idle);
 *   · a hold of a second or more open ⇒ HELD — the hold watchdog asks for it and its own [loop-hold] line names it;
 *   · stopped (SIGSTOP, a frozen cgroup) ⇒ NOT RUNNING;
 *   · else — on the CPU, or asleep in another call ⇒ ONE ask (none in flight), or booked on the ask in flight. Every tick an
 *     ask waits for is booked on the stack that answers it: an ask lands at the first JavaScript, so time inside native
 *     code (a parse, a regular expression, a synchronous system call, the collector) is counted on its JavaScript CALLER —
 *     said in the block. An answer with no JavaScript frame ⇒ «on the CPU outside JavaScript»; an ask the loop never ran
 *     ⇒ the same; another ask out (a hold's) ⇒ NOT SAMPLED.
 * THE TABLE (aggregate) is read off the capture's own .cpuprofile (the V8 format — a real V8 profile reads the same way):
 * self time by function summed over every call path — a sample's self is its innermost frame with a script (a built-in's
 * time on its caller); paths relative to the install; node_modules and Node's internals grouped by package; a function it
 * cannot name «(anonymous)» with its file:line; every share of the WHOLE window, idle included — idle is never work. Rows
 * under FLOOR_SHARE are not listed (400 samples place a share above about 3 %).
 * THE COLLECTOR'S SHARE comes from the process's own record (gcSplit: the main thread's gc entries of the same window).
 * THE BLOCK (blockLines): ONE journal block of at most BLOCK_LINES lines.
 * THE TRIGGER (triggerVerdict, ONE verdict): the sysinfo lag watch's level ≥ LAG_LEVEL (median lag ≥ 300 ms over 3 min,
 * src/sysinfo.js) or the hold watchdog's holds ≥ HOLDS_RATE.n in HOLDS_RATE.windowMs — then at most one capture per
 * INTERVAL_MS (a capture of the door's counts too) and PER_DAY automatic ones in a day; never with the switch off
 * (telemetry.loopHoldSampling — the door still works), a debugger port open, the heap near its limit.
 * THE COST, bounded and said: one ask's own run past ASK_BOUND_MS halves the rate (down to one ask per RATE_FLOOR_MS); the
 * asks' own run past COST_SHARE_MAX of the window stops the capture early; the frames and stacks kept ≤ MEM_BYTES, the
 * profile ≤ NODES_MAX call-path nodes; the newest KEEP_FILES .cpuprofile files kept.
 */
const LH = require('./loop-hold.js');

const CAPTURE_MS = 20000;        // the window (the brief: a stated 10–20 s)
const CAPTURE_EVERY_MS = 50;     // one tick (a kernel-state read, an ask when on the CPU) every 50 ms: 400 a window
const INTERVAL_MS = 30 * 60000;  // at most one capture per 30 min — automatic or the door's
const PER_DAY = 6;               // automatic captures in a rolling day, at most
const DAY_MS = 24 * 3600000;
const LAG_LEVEL = 1;             // src/sysinfo.js's event-loop lag level: 1 = median lag ≥ 300 ms over 3 min, 2 = ≥ 800 ms
const HOLDS_RATE = Object.freeze({ n: 5, windowMs: 10 * 60000 });   // the hold watchdog's holds (≥ 1 s) in the last 10 min
const TRIGGER_EVERY_MS = 15000;  // the main thread reads the verdict's inputs this often (one timer, unref'd)
const FLOOR_SHARE = 0.03;        // rows under 3 % of the window are not listed (400 samples: ±1.7 points at 3 %)
const BLOCK_LINES = 15;          // the journal block, at most
const ASK_BOUND_MS = 4;          // one ask's own run on the main thread past this ⇒ the rate halves (a very large heap)
const RATE_FLOOR_MS = 400;       // the rate halves no further than one ask per 400 ms
const COST_SHARE_MAX = 0.02;     // the asks' own run past 2 % of the window ⇒ the capture stops early
const MEM_BYTES = 1024 * 1024;   // the capture's frames + stacks in the watchdog thread's memory, at most
const NODES_MAX = 5000;          // the profile's call-path nodes, at most (past it: one «(past the node cap)» node)
const KEEP_FILES = 10;           // the newest .cpuprofile files kept under data/cpu-profiles/
const PROFILE_DIR = 'cpu-profiles';
const NAME_BUDGET_MS = 2000;     // the capture's end: the time for reading the sources its names need
const ANSWER_WAIT_MS = 2000;     // the capture's end: the ask in flight is waited for this long
const OUTSIDE_URL = 'outside:';  // a frame outside the install (its path is never kept)

// the special nodes of a .cpuprofile — V8's own names where V8 has one
const N = Object.freeze({ root: '(root)', idle: '(idle)', native: '(program)', gc: '(garbage collector)', held: '(held a second or more)', stopped: '(not running)', unsampled: '(not sampled)', pastCap: '(past the node cap)' });
const SPECIAL = new Map([[N.root, 'root'], [N.idle, 'idle'], [N.native, 'native'], [N.gc, 'gc'], [N.held, 'held'], [N.stopped, 'stopped'], [N.unsampled, 'unsampled'], [N.pastCap, 'js']]);
const CLASS_NODE = { idle: N.idle, native: N.native, held: N.held, stopped: N.stopped, unsampled: N.unsampled };

const NATIVE_NOTE = 'time inside native calls is counted on the JavaScript caller';
const CAUSES = { lag: 'lag', holds: 'holds', door: 'door' };
/** why a due capture did not run — the words of the one line a failure says (said once per cause) */
const NOT_RUN = {
  debugger: 'a debugger is attached to the server — the sampler stands down while it is',
  heap: 'the server’s memory is near its limit — sampling it now could run it out of memory',
  inspector: 'this server’s Node has no inspector',
  no_watchdog: 'the server’s watchdog thread is not running',
  lost: 'the watchdog thread did not answer',
  unknown: 'the server has not read its settings yet',
};
/** a capture that ran and stopped early, by cause */
const STOPPED = {
  cost: 'the asks had taken their bound of the main thread',
  debugger: 'a debugger was attached',
  heap: 'the server’s memory came near its limit',
  off: 'the setting was turned off',
};

const round1 = (x) => Math.round(x * 10) / 10;
const pct1 = (share) => `${round1(100 * (share || 0)).toFixed(1)} %`;
const secs1 = (ms) => round1((ms || 0) / 1000).toFixed(1);

/** PURE: one tick's class by the main thread's kernel state — 'idle' | 'held' | 'stopped' | 'booked' (the ask in flight
 *  answers it) | 'ask' (post one: it answers this tick) | 'unsampled' (another ask is out). `state` from its stat
 *  (src/loop-hold.js stateOf), `wchan` / `sys` its wait channel and syscall files' text, `beatAgeMs` how old its beat is. */
function tickOf({ state = null, wchan = '', sys = '', beatAgeMs = Infinity, freshMs = 2 * LH.BEAT_MS + LH.NO_ANSWER_MS, holdOpen = false, mine = false, other = false } = {}) {
  if (state === 'stopped') return 'stopped';
  const w = String(wchan || '').trim(), s = String(sys || '').trim();
  // ITS OWN LOOP'S POLL with the beat fresh: idle (an epoll wait with the beat STALE is a synchronous child's own loop)
  if (s !== 'running' && w === 'ep_poll' && beatAgeMs <= freshMs) return 'idle';
  if (holdOpen) return 'held';
  if (mine) return 'booked';
  if (other) return 'unsampled';
  return 'ask';
}

/** PURE: read `<n>:` + n characters at `i` → [string, next] or null (the sample's length-prefixed encoding) */
function readLen(t, i) {
  const m = /^(\d{1,7}):/.exec(t.slice(i, i + 9));
  if (!m) return null;
  const n = Number(m[1]), at = i + m[0].length;
  return at + n <= t.length ? [t.slice(at, at + n), at + n] : null;
}
/** PURE: a sample's answer text → {form, frames} with RAW frames {fn, file, line, encl, evalish}, innermost first — named
 *  and classed only at the capture's end (src/loop-hold.js frameOf, once the sources are read). Forms as sampleOf's. */
function rawFramesOf(text) {
  if (typeof text !== 'string') return { form: 'none', frames: [] };
  if (text === 'A') return { form: 'accessor', frames: [] };
  if (text === 'D') return { form: 'debugger', frames: [] };
  if (text[0] === 'S') {
    const r = readLen(text, 1);
    if (!r) return { form: 'none', frames: [] };
    const lines = r[0].split('\n');
    if (lines[0] !== 'Error' || lines.length < 2) return { form: 'formatting', frames: [] };
    const raw = lines.slice(1).map(LH.stringFrame);
    if (raw.some((x) => x === null)) return { form: 'formatting', frames: [] };
    return { form: 'string', frames: raw.slice(1, 32).map((x) => ({ fn: null, file: x.file, line: x.line, encl: 0, evalish: !!x.evalish })) };
  }
  if (text[0] !== 'C') return { form: 'none', frames: [] };
  const frames = [];
  let i = 1;
  while (i < text.length && frames.length < 32) {
    const a = readLen(text, i); if (!a) break;
    const b = readLen(text, a[1]); if (!b) break;
    const m = /^(\d{1,9}),(\d{1,9})([en])/.exec(text.slice(b[1], b[1] + 21)); if (!m) break;
    frames.push({ fn: a[0], file: b[0], line: Number(m[1]), encl: Number(m[2]), evalish: m[3] === 'e' });
    i = b[1] + m[0].length;
  }
  return { form: 'calls', frames };
}
/** PURE: a classed frame (src/loop-hold.js frameOf) and its raw frame → a V8 callFrame. The function's OWN line
 *  (0-based, V8's), its name only where frameOf kept it; a built-in has no script; a frame outside the install keeps
 *  no path. */
function callFrameOf(f, raw = {}) {
  const own = Number.isInteger(raw.encl) && raw.encl > 0 ? raw.encl : Number.isInteger(raw.line) && raw.line > 0 ? raw.line : 0;
  if (!f || f.cls === 'builtin') return { functionName: '', url: '', lineNumber: -1, columnNumber: -1 };
  if (f.cls === 'outside') return { functionName: '', url: OUTSIDE_URL, lineNumber: -1, columnNumber: -1 };
  if (f.cls === 'syncfs') return { functionName: f.fn || '', url: LH.SYNC_FS_URL, lineNumber: -1, columnNumber: -1 };   // asleep in a wrapped sync fs call
  return { functionName: f.fn || '', url: f.file, lineNumber: own - 1, columnNumber: -1 };
}

/** PURE: THE .cpuprofile of a capture — the V8 format DevTools opens. `ticks` [{t (monotonic ms), k}] — k a stack's index
 *  or a class ('idle' | 'native' | 'held' | 'stopped' | 'unsampled'); `stacks` [frame ids, innermost first]; `frames`
 *  [callFrame] by id. A tick stands for the time to the next one (the last: to `endedM`). ≤ NODES_MAX nodes. */
function profileOf({ ticks = [], stacks = [], frames = [], startedM = 0, endedM = null, everyMs = CAPTURE_EVERY_MS, finalEveryMs = null, how = null, nodesMax = NODES_MAX } = {}) {
  const nodes = [];
  const mk = (callFrame) => { const n = { id: nodes.length + 1, callFrame: { scriptId: '0', ...callFrame }, hitCount: 0, children: [] }; nodes.push(n); return n; };
  const root = mk({ functionName: N.root, url: '', lineNumber: -1, columnNumber: -1 });
  const kids = new Map();   // node id → Map(key → node)
  const childOf = (p, key, callFrame) => {
    let m = kids.get(p.id); if (!m) { m = new Map(); kids.set(p.id, m); }
    let c = m.get(key);
    if (!c) {
      if (nodes.length >= nodesMax) return null;
      c = mk(callFrame); m.set(key, c); p.children.push(c.id);
    }
    return c;
  };
  const special = (name) => childOf(root, 's:' + name, { functionName: name, url: '', lineNumber: -1, columnNumber: -1 });
  let past = null;
  const pastCap = () => past || (past = (() => { const m = kids.get(root.id) || new Map(); kids.set(root.id, m); const c = mk({ functionName: N.pastCap, url: '', lineNumber: -1, columnNumber: -1 }); m.set('s:' + N.pastCap, c); root.children.push(c.id); return c; })());
  const leafOf = new Map();   // stack index → leaf node
  const samples = [], timeDeltas = [];
  let prev = startedM;
  for (const tk of ticks) {
    let leaf = null;
    if (typeof tk.k === 'number') {
      leaf = leafOf.get(tk.k);
      if (!leaf) {
        const st = stacks[tk.k] || [];
        let p = root;
        for (let i = st.length - 1; i >= 0 && p; i--) { const id = st[i]; p = childOf(p, 'f:' + id, frames[id] || { functionName: '', url: '', lineNumber: -1, columnNumber: -1 }); }
        leaf = p && p !== root ? p : p === root ? special(N.native) : null;
        if (!leaf) leaf = pastCap();
        leafOf.set(tk.k, leaf);
      }
    } else leaf = special(CLASS_NODE[tk.k] || N.native) || pastCap();
    leaf.hitCount++;
    samples.push(leaf.id);
    timeDeltas.push(Math.max(0, Math.round((tk.t - prev) * 1000)));
    prev = tk.t;
  }
  const end = endedM != null ? endedM : prev + everyMs;
  return {
    nodes, startTime: Math.round(startedM * 1000), endTime: Math.round(end * 1000), samples, timeDeltas,
    $vibespace: { sampledEveryMs: everyMs, ...(finalEveryMs && finalEveryMs !== everyMs ? { finalEveryMs } : {}), how: how || `sampled every ${everyMs} ms on average (each interval drawn between ${everyMs / 2} and ${1.5 * everyMs} ms) from the watchdog thread, no V8 profiler: idle from the main thread's kernel state; ${NATIVE_NOTE}` },
  };
}

/** PURE: a script url → the install-relative path ('' when it is not the install's), node: ids as they are */
function relOf(url, root) {
  let u = String(url || '');
  if (u.startsWith('file://')) { try { u = decodeURIComponent(u.slice(7)); } catch { u = u.slice(7); } }
  if (!u) return { kind: 'builtin' };
  if (u === LH.SYNC_FS_URL) return { kind: 'syncfs' };
  if (u.startsWith('node:')) return { kind: 'internals', rel: u };
  if (u === OUTSIDE_URL) return { kind: 'outside' };
  const r = typeof root === 'string' && root ? root.replace(/\/+$/, '') + '/' : null;
  if (u.startsWith('/')) { if (r && u.startsWith(r) && !u.includes('/../')) u = u.slice(r.length); else return { kind: 'outside' }; }
  else if (/^[a-z][\w+.-]*:/i.test(u) || u.includes('../')) return { kind: 'outside' };
  return { kind: 'install', rel: u };
}
/** PURE: the package of an install-relative path inside node_modules (the LAST node_modules: a nested dependency is its own), else null */
function packageOf(rel) {
  const i = String(rel || '').lastIndexOf('node_modules/');
  if (i < 0 || (i > 0 && rel[i - 1] !== '/')) return null;
  const parts = rel.slice(i + 13).split('/');
  if (!parts[0]) return null;
  return parts[0].startsWith('@') && parts[1] ? `${parts[0]}/${parts[1]}` : parts[0];
}

/** PURE: a .cpuprofile (the capture's own, or V8's) → THE TABLE: self time by function summed over call paths, each share of
 *  the whole window. → {totalMs, samples, ms: {js, native, gc, idle, held, stopped, unsampled}, share: {…}, rows (every row,
 *  largest first: {kind: 'fn' | 'package' | 'internals' | 'outside', key, fn, loc, ms, share, functions, modules?}),
 *  listed (≥ floor, ≤ rowsMax), under: {rows, share}} */
function aggregate(profile, { root = null, floor = FLOOR_SHARE, rowsMax = BLOCK_LINES - 5 } = {}) {
  const p = profile || {};
  const nodes = Array.isArray(p.nodes) ? p.nodes : [];
  const byId = new Map(), parent = new Map();
  for (const n of nodes) byId.set(n.id, n);
  for (const n of nodes) for (const c of n.children || []) parent.set(c, n.id);
  const samples = Array.isArray(p.samples) ? p.samples : [], deltas = Array.isArray(p.timeDeltas) ? p.timeDeltas : [];
  // a sample stands for the time to the next sample (the last: to the profile's end)
  const ts = []; let t = Number(p.startTime) || 0;
  for (let i = 0; i < samples.length; i++) { t += Number(deltas[i]) || 0; ts.push(t); }
  const endUs = Number(p.endTime) || t;
  const dur = (i) => Math.max(0, (i + 1 < ts.length ? ts[i + 1] : Math.max(endUs, ts[i])) - ts[i]) / 1000;
  const ms = { js: 0, native: 0, gc: 0, idle: 0, held: 0, stopped: 0, unsampled: 0 };
  const rows = new Map();
  const memo = new Map();   // leaf id → {cls, row?, via?}
  // THE INSTALL'S OWN CALLER of a package / Node-internals / outside row: the first frame up the stack in the install's own
  // code (not node_modules) — «which of its own code» the time came through
  const viaOf = (n0) => {
    for (let x = n0; x; x = byId.get(parent.get(x.id))) {
      const cf = x.callFrame || {}; if (!cf.url) continue;
      const r = relOf(cf.url, root); if (r.kind !== 'install' || packageOf(r.rel)) continue;
      const line = Number.isInteger(cf.lineNumber) && cf.lineNumber >= 0 ? cf.lineNumber + 1 : null;
      return { key: `${r.rel}:${line}:${cf.functionName || ''}`, words: `${cf.functionName || '(anonymous)'} · ${r.rel}${line != null ? ':' + line : ''}` };
    }
    return null;
  };
  const classOf = (leafId) => {
    if (memo.has(leafId)) return memo.get(leafId);
    let n = byId.get(leafId), out = null;
    const name = (x) => (x && x.callFrame ? String(x.callFrame.functionName || '') : '');
    const url = (x) => (x && x.callFrame ? String(x.callFrame.url || '') : '');
    if (!n) out = { cls: 'native' };
    else if (!url(n) && SPECIAL.has(name(n)) && SPECIAL.get(name(n)) !== 'js') out = { cls: SPECIAL.get(name(n)) === 'root' ? 'native' : SPECIAL.get(name(n)) };
    else if (!url(n) && name(n) === N.pastCap) out = { cls: 'js', row: { kind: 'fn', key: 'past', fn: N.pastCap, loc: '', fnKey: 'past' } };
    else {
      // a built-in's time on its JavaScript caller (the innermost frame WITH a script)
      while (n && !url(n) && !SPECIAL.has(name(n))) n = byId.get(parent.get(n.id));
      if (!n || !url(n)) out = { cls: 'native' };
      else {
        const cf = n.callFrame, r = relOf(cf.url, root), line = Number.isInteger(cf.lineNumber) && cf.lineNumber >= 0 ? cf.lineNumber + 1 : null;
        const fnName = String(cf.functionName || '');
        // THE TIME OF A SYNC FS CALL ON THE CALL (the owner's .393 capture read «Node.js internals — 72 % through hr ·
        // src/server/loop-blame.js:51»: asleep in the wrapped calls, booked on the wrapper's first line after them)
        if (r.kind === 'syncfs') out = { cls: 'native', row: { kind: 'syncfs', key: 'syncfs:' + fnName, fn: `asleep in ${fnName || 'a synchronous fs call'}`, loc: '', fnKey: 'syncfs:' + fnName }, via: viaOf(n) };
        else if (r.kind === 'internals') out = { cls: 'js', row: { kind: 'internals', key: 'internals', fn: 'Node.js internals', module: r.rel, fnKey: `${r.rel}:${line}:${fnName}` }, via: viaOf(n) };
        else if (r.kind === 'outside' || r.kind === 'builtin') out = { cls: 'js', row: { kind: 'outside', key: 'outside', fn: '(outside the install)', fnKey: `${cf.url}:${line}:${fnName}` }, via: viaOf(n) };
        else {
          const pkg = packageOf(r.rel);
          if (pkg) out = { cls: 'js', row: { kind: 'package', key: 'pkg:' + pkg, fn: pkg, loc: `node_modules/${pkg}`, fnKey: `${r.rel}:${line}:${fnName}` }, via: viaOf(n) };
          else { const k = `${r.rel}:${line == null ? '?' : line}:${fnName}`; out = { cls: 'js', row: { kind: 'fn', key: 'fn:' + k, fn: fnName || '(anonymous)', loc: `${r.rel}${line != null ? ':' + line : ''}`, fnKey: k } }; }
        }
      }
    }
    memo.set(leafId, out);
    return out;
  };
  let totalMs = 0;
  for (let i = 0; i < samples.length; i++) {
    const d = dur(i), c = classOf(samples[i]);
    totalMs += d;
    ms[c.cls] = (ms[c.cls] || 0) + d;
    if (c.row) {
      let r = rows.get(c.row.key);
      if (!r) { r = { kind: c.row.kind, key: c.row.key, fn: c.row.fn, loc: c.row.loc || '', ms: 0, fns: new Set(), mods: new Map(), vias: new Map() }; rows.set(c.row.key, r); }
      r.ms += d; r.fns.add(c.row.fnKey);
      if (c.via) { const v = r.vias.get(c.via.key) || { words: c.via.words, ms: 0 }; v.ms += d; r.vias.set(c.via.key, v); }
      if (c.row.module) r.mods.set(c.row.module, (r.mods.get(c.row.module) || 0) + d);
    }
  }
  const share = {}; for (const k of Object.keys(ms)) share[k] = totalMs > 0 ? ms[k] / totalMs : 0;
  const all = [...rows.values()].map((r) => {
    const modules = [...r.mods.entries()].sort((a, b) => b[1] - a[1]).map((x) => x[0]);
    const loc = r.kind === 'internals' ? modules.slice(0, 3).join(', ') + (modules.length > 3 ? ', …' : '') : r.loc;
    const via = [...r.vias.values()].sort((a, b) => b.ms - a.ms)[0] || null;
    return { kind: r.kind, key: r.key, fn: r.fn, loc, ms: r.ms, share: totalMs > 0 ? r.ms / totalMs : 0, functions: r.fns.size, ...(r.kind === 'internals' ? { modules: modules.slice(0, 10) } : {}),
      ...(via && r.kind !== 'fn' ? { via: via.words, viaShare: r.ms > 0 ? via.ms / r.ms : 0 } : {}) };
  }).sort((a, b) => b.ms - a.ms || (a.key < b.key ? -1 : 1));
  const listed = all.filter((r) => r.share >= floor).slice(0, Math.max(0, rowsMax));
  const rest = all.slice(listed.length);
  return { totalMs, samples: samples.length, ms, share, rows: all, listed, under: { rows: rest.length, share: rest.reduce((a, r) => a + r.share, 0) }, floor };
}

/** PURE: one row's words — «share % · function · file:line» (a package / Node's internals: the package and how many functions) */
function rowWords(r) {
  const s = pct1(r.share).padStart(7);
  const fns = `${r.functions} function${r.functions === 1 ? '' : 's'}`;
  const via = r.via ? ` — ${r.viaShare >= 0.995 ? 'all' : `${Math.round(100 * r.viaShare)} %`} through ${r.via}` : '';
  if (r.kind === 'package' || r.kind === 'internals') return `${s} · ${r.fn} · ${r.loc} (${fns})${via}`;
  if (r.kind === 'outside') return `${s} · ${r.fn} · ${fns}${via}`;
  if (r.kind === 'syncfs') return `${s} · ${r.fn}${via}`;   // «asleep in readFileSync — 72 % through _loadArchive · src/jobs.js:291»
  return `${s} · ${r.fn} · ${r.loc || '?'}`;
}

/** PURE: the collector's share of the window from the process's OWN record — gc entries [{at (monotonic ms), ms, kind}]
 *  clipped to [fromM, toM]. null entries ⇒ not split (`why`). */
function gcSplit(entries, fromM, toM, why = null) {
  const W = Math.max(0, (toM || 0) - (fromM || 0));
  if (!Array.isArray(entries) || !(W > 0)) return { split: false, why: why || 'no record of the collector' };
  const by = {}; let ms = 0, n = 0;
  for (const e of entries) {
    if (!e || !(e.ms >= 0) || !Number.isFinite(e.at)) continue;   // one that began before the window is clipped, never dropped
    const a = Math.max(fromM, e.at), b = Math.min(toM, e.at + e.ms);
    if (b <= a) continue;
    const k = LH.GC_KINDS[e.kind] || (typeof e.kind === 'string' ? e.kind : 'other');
    by[k] = (by[k] || 0) + (b - a); ms += b - a; n++;
  }
  return { split: true, ms, share: ms / W, n, by, windowMs: W };
}
function gcWords(g) {
  if (!g || g.split === false) return `GC not split — ${(g && g.why) || 'no record of the collector'}`;
  const W = g.windowMs > 0 ? g.windowMs : 0;
  const parts = W ? Object.entries(g.by || {}).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${pct1(v / W)}`) : [];
  return `GC: ${pct1(g.share)} of the window${parts.length ? ` (${parts.join(', ')})` : ''} — the collector's own record; its time is inside the shares above`;
}

/** PURE: the cause's words */
function causeWords(cause, { lag = null, holds = 0, holdsRate = HOLDS_RATE } = {}) {
  if (cause === CAUSES.lag) return `the loop is degraded — the lag watch's level ${lag && lag.level != null ? lag.level : '?'}${lag && lag.medianMs != null ? ` (median lag ${Math.round(lag.medianMs)} ms over 3 min)` : ''}`;
  if (cause === CAUSES.holds) return `the loop is degraded — ${holds} holds of a second or more in the last ${Math.round(holdsRate.windowMs / 60000)} min`;
  return 'captured on request';
}

/** PURE: THE BLOCK — ONE journal block of at most BLOCK_LINES lines, every line «[cpu-profile] …»:
 *   the head (the cause, the window, the samples) · the rows · the split · the collector · the two notes · the cost (+ the
 *   rate halved, an early stop, the file). Rows are cut to fit (the rest counted with the floor's). */
function blockLines(c, { maxLines = BLOCK_LINES } = {}) {
  const a = c.agg || { listed: [], share: {}, under: { rows: 0, share: 0 }, samples: 0 };
  const P = '[cpu-profile] ';
  const head = `${P}${c.causeWords || causeWords(c.cause, c)} — the main thread for ${secs1(c.windowMs)} s, ${a.samples} samples every ${c.everyMs} ms${c.finalEveryMs && c.finalEveryMs !== c.everyMs ? ` (then every ${c.finalEveryMs} ms)` : ''}: where its time went, by function (self time)`;
  const sh = a.share || {};
  const split = [`JavaScript ${pct1(sh.js)}`, `on the CPU outside JavaScript ${pct1(sh.native)}`, `idle ${pct1(sh.idle)} (asleep in its own loop)`];
  if (sh.held > 0) split.push(`in holds of a second or more ${pct1(sh.held)} (each named in its own [loop-hold] line)`);
  if (sh.stopped > 0) split.push(`not running ${pct1(sh.stopped)}`);
  if (sh.unsampled > 0) split.push(`not sampled ${pct1(sh.unsampled)}`);
  if (sh.gc > 0) split.push(`garbage collector ${pct1(sh.gc)}`);
  const cost = [`${a.samples} samples, the asks themselves took ${Math.round(c.costMs || 0)} ms of the main thread (${pct1((c.costMs || 0) / Math.max(1, c.windowMs || 1))})`];
  if (c.halved) cost.push(`the rate halved${c.halved.times > 1 ? ` ${c.halved.times} times` : ''} to every ${c.finalEveryMs} ms — an ask took ${(c.halved.askMs || 0).toFixed(2)} ms of the main thread (the bound ${c.askBoundMs != null ? c.askBoundMs : ASK_BOUND_MS} ms)`);
  if (c.stopped) cost.push(`it stopped early at ${secs1(c.windowMs)} s: ${STOPPED[c.stopped] || c.stopped}`);
  if (c.file) cost.push(`kept as data/${PROFILE_DIR}/${c.file}`);
  else if (c.fileError) cost.push(`its .cpuprofile was not kept (${c.fileError})`);
  const tail = [
    `${P}  the split: ${split.join(' · ')}`,
    `${P}  ${gcWords(c.gc)}`,
    `${P}  ${NATIVE_NOTE}; functions under ${Math.round(100 * (a.floor != null ? a.floor : FLOOR_SHARE))} % are not listed`,
    `${P}  ${cost.join('; ')}`,
  ];
  const room = Math.max(0, maxLines - 1 - tail.length);
  const listed = (a.listed || []).slice(0, room);
  const cut = (a.listed || []).slice(listed.length);
  const rows = listed.map((r) => `${P}  ${rowWords(r)}`);
  const underN = (a.under ? a.under.rows : 0) + cut.length, underS = (a.under ? a.under.share : 0) + cut.reduce((x, r) => x + r.share, 0);
  if (underN > 0) tail[0] += ` — JavaScript not listed: ${underN} more row${underN === 1 ? '' : 's'}, ${pct1(underS)} together`;
  return [head, ...rows, ...tail].slice(0, maxLines);
}

/** PURE: THE TRIGGER — ONE verdict. → {go, cause, why ('healthy' | 'unknown' | 'off' | 'running' | 'debugger' | 'heap' |
 *  'interval' | 'day'), nextAt?}. `captures` [{at (wall ms), auto}] — every capture this hub kept (the files under data/
 *  name them, so a restart does not reset the bounds); `lag` = src/sysinfo.js loopLagNow(); `holdsRecent` = the hold
 *  watchdog's holds in the last HOLDS_RATE.windowMs; `sampling` = the switch as the watchdog reads it. */
function triggerVerdict({ now, lag = null, holdsRecent = 0, captures = [], running = false, sampling = {}, debuggerOpen = false, heapHigh = false,
  intervalMs = INTERVAL_MS, perDay = PER_DAY, holdsRate = HOLDS_RATE, lagLevel = LAG_LEVEL } = {}) {
  const cause = lag && Number(lag.level) >= lagLevel ? CAUSES.lag : holdsRecent >= holdsRate.n ? CAUSES.holds : null;
  if (!cause) return { go: false, why: 'healthy', cause: null };
  if (!sampling || sampling.known === false) return { go: false, why: 'unknown', cause };
  if (sampling.on === false) return { go: false, why: 'off', cause };
  if (running) return { go: false, why: 'running', cause };
  if (debuggerOpen === true || sampling.debugger === true) return { go: false, why: 'debugger', cause };
  if (heapHigh === true || sampling.heapHigh === true) return { go: false, why: 'heap', cause };
  let last = null;
  for (const c of captures || []) if (c && Number.isFinite(c.at) && (last == null || c.at > last)) last = c.at;
  if (last != null && now - last < intervalMs) return { go: false, why: 'interval', cause, nextAt: last + intervalMs };
  const day = (captures || []).filter((c) => c && c.auto && Number.isFinite(c.at) && now - c.at < DAY_MS).length;
  if (day >= perDay) return { go: false, why: 'day', cause };
  return { go: true, why: null, cause };
}
/** the verdict's «did not run» causes that are a FAILURE of a due capture (said once a cause) — the rest are the bounds */
const FAILS = new Set(['debugger', 'heap']);

/** PURE: a capture's file name: «<UTC time>-<auto|door>.cpuprofile» (sortable; the time is the capture's start) */
const FILE_RE = /^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z-(auto|door)\.cpuprofile$/;
function fileName(atWall, auto) { return `${new Date(atWall).toISOString().replace(/[:.]/g, '-')}-${auto ? 'auto' : 'door'}.cpuprofile`; }
function fileOf(name) {
  const m = FILE_RE.exec(String(name || ''));
  if (!m) return null;
  const at = Date.parse(`${m[1]}T${m[2]}:${m[3]}:${m[4]}.${m[5]}Z`);
  return Number.isFinite(at) ? { name: String(name), at, auto: m[6] === 'auto' } : null;
}
/** PURE: the files to keep (the newest `keep`) and to remove, of a directory's names (other names are never touched) */
function keptFiles(names, keep = KEEP_FILES) {
  const ours = (names || []).map(fileOf).filter(Boolean).sort((a, b) => b.at - a.at || (a.name < b.name ? 1 : -1));
  return { keep: ours.slice(0, keep), drop: ours.slice(keep) };
}

/** PURE: what a capture's result says to a person and to the bundle (bounded: the listed rows, the split, the lines) */
function publicCapture(c) {
  const a = c.agg || { listed: [], share: {}, under: { rows: 0, share: 0 }, samples: 0 };
  return {
    id: c.id, startedAt: c.startedAt, endedAt: c.endedAt, auto: !!c.auto, cause: c.cause || null, causeWords: c.causeWords || null,
    windowMs: Math.round(c.windowMs || 0), everyMs: c.everyMs, ...(c.finalEveryMs && c.finalEveryMs !== c.everyMs ? { finalEveryMs: c.finalEveryMs } : {}),
    samples: a.samples, costMs: Math.round(c.costMs || 0), ...(c.stopped ? { stopped: c.stopped, stoppedWords: STOPPED[c.stopped] || null } : {}),
    rows: (a.listed || []).map((r) => ({ kind: r.kind, fn: r.fn, loc: r.loc, pct: round1(100 * r.share), functions: r.functions, ...(r.via ? { via: r.via, viaPct: Math.round(100 * r.viaShare) } : {}), words: rowWords(r).trim() })),
    under: { rows: a.under ? a.under.rows : 0, pct: round1(100 * (a.under ? a.under.share : 0)) },
    split: Object.fromEntries(Object.entries(a.share || {}).map(([k, v]) => [k, round1(100 * v)])),
    gc: c.gc && c.gc.split ? { pct: round1(100 * c.gc.share), by: Object.fromEntries(Object.entries(c.gc.by || {}).map(([k, v]) => [k, round1(100 * v / Math.max(1, c.windowMs || 1))])) } : { split: false, why: (c.gc && c.gc.why) || null },
    file: c.file || null, ...(c.fileError ? { fileError: c.fileError } : {}), lines: c.lines || [],
  };
}

module.exports = {
  tickOf, rawFramesOf, readLen, callFrameOf, profileOf, relOf, packageOf, aggregate, rowWords, gcSplit, gcWords, causeWords, blockLines,
  triggerVerdict, FAILS, fileName, fileOf, keptFiles, FILE_RE, publicCapture,
  CAPTURE_MS, CAPTURE_EVERY_MS, INTERVAL_MS, PER_DAY, DAY_MS, LAG_LEVEL, HOLDS_RATE, TRIGGER_EVERY_MS, FLOOR_SHARE, BLOCK_LINES, ASK_BOUND_MS,
  RATE_FLOOR_MS, COST_SHARE_MAX, MEM_BYTES, NODES_MAX, KEEP_FILES, PROFILE_DIR, NAME_BUDGET_MS, ANSWER_WAIT_MS, OUTSIDE_URL, N, NATIVE_NOTE, NOT_RUN, STOPPED, CAUSES,
};

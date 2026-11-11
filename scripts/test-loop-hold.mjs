#!/usr/bin/env node
// test-loop-hold — lane hub-loop-stalls (a fleet user's hub was held 10–70 s, its watchdog said «on the CPU» and named
// nothing). FAST = PURE only (the tier rule): src/loop-hold.js and the memory census's two new lines, over text fixtures
// and an injected clock — no child process, no timer, no wall-clock bound. The live legs (real children, real holds) are
// scripts/test-loop-hold-live.mjs (heavy).
//   ① LAW G — the words: a function name + file:line only for the hub's own code (server.js, src/, node_modules/,
//      scripts/) or a node: internal; a built-in is «(built-in)»; a path holding a person's name, a plugin's folder,
//      data/, eval'd code, a name that is not an identifier ⇒ «(outside the repo)» / «(anonymous)», no name, no path
//   ② the sample's own text: parsed, its two frames skipped; the expression restores Error.prepareStackTrace /
//      stackTraceLimit (present or absent before), returns ONE string, and a throw inside it restores them too
//   ③ LAW A — the scheduler's facts parsed from /proc text (a command with spaces and parens; schedstat; cgroup v2 + v1
//      cpu.stat; the cgroup paths; pressure; VmRSS), the delta, and THE VERDICT per hold: JavaScript / native code or
//      garbage collection / in the kernel (kernel time, and asleep in a call) / waiting for a CPU (a THROTTLED POD and a
//      run-queue-starved thread) / garbage collection; the plain-words numbers; the starved watchdog
//   ④ the lines: the resume line (every part), the boot's, the unsampled reasons, the live words, the public hold
//   ⑤ the schedule (1, 2, 4 … × the hold, ≤ 7), THE CAP (20 an hour, rolling, injected clock), THE TABLE (200 keys + «other»)
//   ⑥ law L — a profile's shares and line; law K — the hourly census line and the heap-high line
// Run: node scripts/test-loop-hold.mjs
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';

const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const require = createRequire(import.meta.url);
const LH = require(path.join(REPO, 'src/loop-hold.js'));
const MC = require(path.join(REPO, 'src/memory-census.js'));
let pass = 0, fail = 0;
const ok = (c, n, d) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (d !== undefined ? ' — ' + JSON.stringify(d) : '')); } };
const ROOT = '/srv/app/vibespace';

// ── ① LAW G ──────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('① law G — what a frame may say');
{
  const f = (fn, file, line = 7, evalish = false) => LH.frameText(LH.frameOf({ fn, file, line, evalish }, ROOT));
  ok(f('loadIndex', ROOT + '/src/search-index.js', 40) === 'loadIndex (src/search-index.js:40)', 'a frame of the hub\'s own src/ — its function and repo-relative file:line', f('loadIndex', ROOT + '/src/search-index.js', 40));
  ok(f('main', ROOT + '/server.js', 12) === 'main (server.js:12)' && f('Receiver.parse', ROOT + '/node_modules/ws/lib/receiver.js', 9) === 'Receiver.parse (node_modules/ws/lib/receiver.js:9)',
    'server.js and node_modules/ under the root are the hub\'s own code');
  ok(f('processChunkSync', 'node:zlib', 463) === 'processChunkSync (node:zlib:463)' && f('listOnTimeout', 'node:internal/timers', 585) === 'listOnTimeout (node:internal/timers:585)', 'a node: internal — its function and its module:line');
  ok(f('test', '') === '(built-in)', 'a V8 built-in (no file, not eval) is «(built-in)» — no name');
  ok(f('secretFn', '', 1, true) === '(outside the repo)', 'eval\'d code (no file) is «(outside the repo)» — no name');
  const person = f('readMail', '/home/jane-doe/.vibespace/plugins/mail/index.js', 3);
  const plugin = f('onLoad', ROOT + '/data/plugins/acme-sync/index.js', 3);
  const other = f('x', '/opt/elsewhere/lib.js', 3);
  const fileUrl = f('esm', 'file://' + ROOT + '/src/x.mjs', 5);
  ok(person === '(outside the repo)' && !/jane|doe|mail|plugins|readMail/.test(person) && plugin === '(outside the repo)' && !/acme|data|onLoad/.test(plugin) && other === '(outside the repo)',
    'a path holding a person\'s name, a plugin\'s folder (even under the root\'s data/) and any other path ⇒ «(outside the repo)» with no name and no path', { person, plugin, other });
  ok(fileUrl === 'esm (src/x.mjs:5)', 'a file:// URL of the hub\'s own code reads as its path');
  ok(f('a b', ROOT + '/src/x.js') === '(anonymous) (src/x.js:7)' && f('x'.repeat(61), ROOT + '/src/x.js') === '(anonymous) (src/x.js:7)' && f('get "sk-abc"', ROOT + '/src/x.js') === '(anonymous) (src/x.js:7)' && f('', ROOT + '/src/x.js') === '(anonymous) (src/x.js:7)',
    'a function name that is not an identifier (spaces, quotes, > 60 chars, empty) is «(anonymous)»');
  ok(f('x', ROOT + '/src/../../etc/x.js') === '(outside the repo)' && f('x', ROOT + '/src/we ird.js') === '(outside the repo)' && f('x', ROOT + 'x/src/a.js') === '(outside the repo)',
    'a path that climbs out, carries a space, or only shares the root\'s prefix ⇒ outside');
  ok(f('x', ROOT + '/docs/a.js') === '(outside the repo)' && f('x', ROOT + '/public/bundle.js') === '(outside the repo)', 'under the root but not the server\'s code (docs/, public/) ⇒ outside');
}

// ── ② the sample ────────────────────────────────────────────────────────────────────────────────────────────────
console.log('② the sample — its encoding, its own frame, what it restores, what no name can forge');
const enc = (frames) => 'C' + frames.map(([fn, file, line, ev, encl]) => `${fn.length}:${fn}${file.length}:${file}${line},${encl || 0}${ev ? 'e' : 'n'}`).join('');
{
  const fr = LH.parseSample(enc([['busyHog', ROOT + '/src/hogs.js', 38], ['', '', 0], ['tick', ROOT + '/src/server/y.js', 52], ['listOnTimeout', 'node:internal/timers', 585]]), ROOT);
  ok(fr.length === 4 && LH.chainWords(fr) === 'busyHog (src/hogs.js:38) ← (built-in) ← tick (src/server/y.js:52)' && LH.keyFrame(fr) === 'src/hogs.js:38' && LH.keyWords(fr) === 'busyHog (src/hogs.js:38)',
    'the encoded text → frames → the chain (≤ 3); the table\'s key is the first repo frame\'s LOCATION, its words beside it', [LH.chainWords(fr), LH.keyFrame(fr)]);
  const deep = LH.parseSample(enc([['slice', 'node:buffer', 1], ['processChunkSync', 'node:zlib', 463], ['zlibBufferSync', 'node:zlib', 182], ['syncBufferWrapper', 'node:zlib', 816], ['zlibHog', ROOT + '/src/hogs.js', 9]]), ROOT);
  ok(LH.chainWords(deep) === 'slice (node:buffer:1) ← processChunkSync (node:zlib:463) ← zlibBufferSync (node:zlib:182) ← … zlibHog (src/hogs.js:9)' && LH.keyFrame(deep) === 'src/hogs.js:9', 'a deeper repo frame rides the chain after «…» and keys the table', LH.chainWords(deep));
  ok(LH.parseSample(null, ROOT).length === 0 && LH.parseSample('x\ty', ROOT).length === 0 && LH.chainWords([]) === '(no frame)' && LH.sampleOf('C3:abc').frames.length === 0, 'anything that is not the encoding reads as no frame (a truncated frame is dropped, never guessed)');
  // NO NAME FORGES A FRAME — a name holding tabs, newlines and a fake «file\tline» is ONE name
  const forged = 'sk_live_INJECTEDabc123\t' + ROOT + '/src/x.js\t7\t0\nzz';
  const ff = LH.sampleOf(enc([[forged, '/opt/elsewhere/lib.js', 3], ['john.smith\t' + ROOT + '/server.js\t1\t0', '/opt/elsewhere/lib.js', 4]]), ROOT);
  const fw = ff.frames.map(LH.frameText).join(' | ');
  ok(ff.frames.length === 2 && ff.frames.every((f) => f.cls === 'outside') && !/sk_live|john|src\/x\.js|server\.js/.test(fw), `two forged names (tab + newline + a repo file in the name) stay ONE field each: «(outside the repo)», no name, no file (${fw})`);
  const fr2 = LH.sampleOf(enc([[forged, ROOT + '/src/real.js', 7]]), ROOT).frames[0];
  ok(fr2.cls === 'repo' && fr2.fn === '(anonymous)' && LH.frameText(fr2) === '(anonymous) (src/real.js:7)', 'a forged name on a REAL repo frame is «(anonymous)» — the location is the frame\'s own');
  const isRepoFile = (rel) => rel === 'server.js' || rel === 'src/real.js';
  ok(LH.frameText(LH.frameOf({ fn: 'vmHog', file: ROOT + '/src/fake-vm.js', line: 1 }, ROOT, isRepoFile)) === '(outside the repo)' && LH.frameText(LH.frameOf({ fn: 'ok', file: ROOT + '/src/real.js', line: 2 }, ROOT, isRepoFile)) === 'ok (src/real.js:2)',
    'a frame is a repo frame only when its file is a REAL file of the repo (a vm script given a non-existent repo-looking name is outside)');
}
// round 3 (6): NO NAME THAT THE REPO'S OWN SOURCE DOES NOT SPELL AT THAT PLACE — a repo frame keeps its name only when the
// file's own line at the function's own start spells it; else its location alone
console.log('② (6) a repo frame\'s name only where its source spells it');
{
  const SRC = { 'src/hogs.js': ["'use strict';", 'function busyHog(ms) { spin(ms); }', 'const arrowHog = (ms) => spin(ms);', 'class Hogs { member(ms) { spin(ms); } static stat(ms) { spin(ms); } }',
    'const obj = { method(ms) { spin(ms); }, prop: function (ms) { spin(ms); } };', 'exports.exported = function (ms) { spin(ms); };', 'function computedSelf(key, ms) { const o = { [key]: function () { spin(ms); } }; return o[key](); }',
    'module.exports.run = (f) => (function () { spin(1); })();'], 'src/loop-hold.js': ["'use strict';", '/** a comment */'], 'server.js': ["'use strict';"] };
  const lineOf = (rel, n) => (SRC[rel] || [])[n - 1] ?? null;
  const isReal = (rel) => rel in SRC;
  const F = (fn, rel, line, encl) => LH.frameText(LH.frameOf({ fn, file: ROOT + '/' + rel, line, encl }, ROOT, isReal, lineOf));
  const honest = [['busyHog', 2], ['arrowHog', 3], ['member', 4], ['stat', 4], ['method', 5], ['prop', 5], ['exports.exported', 6]];
  const hw = honest.map(([fn, n]) => F(fn, 'src/hogs.js', n, n));
  ok(hw.every((w, i) => w === `${honest[i][0]} (src/hogs.js:${honest[i][1]})`), 'HONEST NAMES STAY — a declaration, an arrow assigned to a const, a class member, a static member, a method, a property function, an exports.x function: each printed (its own line spells it)', hw);
  ok(F('', 'src/hogs.js', 8, 8) === '(anonymous) (src/hogs.js:8)', 'an anonymous function: «(anonymous)» at its location');
  const computed = [F('sk_live_COMPUTEDabc', 'src/hogs.js', 7, 7), F('john.smith', 'src/hogs.js', 7, 7)];
  ok(computed.every((w) => w === 'src/hogs.js:7'), 'a repo function NAMED BY A RUNTIME VALUE (a computed key: «sk_live_COMPUTEDabc», «john.smith») ⇒ its location alone — the value never leaves', computed);
  const vm = [F('sk_live_VMreal', 'src/loop-hold.js', 1, 1), F('johnSmithVm', 'server.js', 1, 1)];
  ok(vm.every((w) => !/sk_live|john/i.test(w)) && vm[0] === 'src/loop-hold.js:1' && vm[1] === 'server.js:1', 'a vm script compiled under a REAL repo file\'s name: its function\'s name is not in that file at that line ⇒ the location alone (the named residual: a location can be planted, never a name)', vm);
  ok(F('busyHog', 'src/hogs.js', 2, 0) === 'src/hogs.js:2' && F('busyHog', 'src/hogs.js', 2, 99) === 'src/hogs.js:2', 'no own line (an old Node gives 0) or a line past the file ⇒ the location alone, never a name unchecked');
  ok(LH.spelledIn('const busyHogX = 1; busyHog2()', 'busyHog') === false && LH.spelledIn('x.busyHog(1)', 'busyHog') === true && LH.spelledIn('a$b = 1', 'a') === false && LH.spelledIn(null, 'x') === false,
    'spelled = a WHOLE token (busyHogX / busyHog2 / a$b do not spell busyHog / a)');
}
// round 3 (11): every Node internal module id — a hyphen, an uppercase letter, digits — is an internal
{
  const ids = (process.moduleLoadList || []).filter((x) => /^NativeModule /.test(x)).map((x) => x.slice('NativeModule '.length));
  const bad = ids.filter((id) => LH.frameOf({ fn: 'f', file: 'node:' + id, line: 3 }, ROOT).cls !== 'node');
  ok(ids.length > 50 && !bad.length && LH.frameOf({ fn: 'f', file: 'node:internal/streams/end-of-stream', line: 3 }, ROOT).cls === 'node' && LH.frameOf({ fn: 'f', file: 'node:internal/readline/emitKeypressEvents', line: 3 }, ROOT).cls === 'node',
    `every NativeModule id this Node loaded (${ids.length}) reads as a node: internal — end-of-stream, emitKeypressEvents, pbkdf2 included`, bad.slice(0, 6));
}
// THE EXPRESSION ITSELF, evaluated here through the hook a witness installs (an indirect eval's own frame = Runtime.evaluate's: one)
console.log('② the expression — one constant text, its answer only through the note, a full stack still counted');
{
  const E = Error, l0 = E.stackTraceLimit, hadOwn = Object.prototype.hasOwnProperty.call(E, 'prepareStackTrace'), p0 = E.prepareStackTrace;
  const notes = [], Zc = new Int32Array(2), B = new Int32Array(8); B[3] = 41;
  let dbgNow = false;
  const hook = Object.freeze({ dbg: () => dbgNow, note: (o) => { notes.push(o); }, z: Zc, b: B });
  Object.defineProperty(globalThis, LH.HOOK_KEY, { value: hook, configurable: true, enumerable: false });
  function caller() { return (0, eval)(LH.SAMPLE_EXPR); }   // eslint-disable-line no-eval
  const out = caller(), cf = LH.sampleOf(out, REPO).frames;
  ok(typeof out === 'string' && out[0] === 'C' && cf.some((f) => f.fn === 'caller' && f.file === 'scripts/test-loop-hold.mjs') && notes.length === 1 && notes[0] === out && Zc[0] === 1 && Zc[1] === 41,
    'the expression answers ONE string in the encoding — its own frame skipped, its caller read back — through note(out); the ENTERED cell counted with the beat then (plain stores)');
  ok(LH.sampleExpr() === LH.SAMPLE_EXPR && LH.sampleExpr(7) === LH.SAMPLE_EXPR && !/\d{3,}/.test(LH.SAMPLE_EXPR.replace(/1e9/g, '')), 'ONE constant text whatever is asked — never the ask\'s number (a text new to V8 at every ask kept ~3.5 KB of main-thread heap each, for good)');
  ok(!/\bvar\b/.test(LH.SAMPLE_EXPR) && /^\{ const H = globalThis\['vibespace\.loopHold'\], Z = H && H\.z;/.test(LH.SAMPLE_EXPR) && !/Symbol\.for/.test(LH.SAMPLE_EXPR) && !('H' in globalThis) && !('out' in globalThis),
    'a block: block-scoped names only (nothing global left behind); the hook reached by a property read, no call');
  ok(E.stackTraceLimit === l0 && Object.prototype.hasOwnProperty.call(E, 'prepareStackTrace') === hadOwn && E.prepareStackTrace === p0, 'Error.stackTraceLimit and Error.prepareStackTrace are as before (own property kept as it was)');
  const hubHook = (_, cs) => cs; E.prepareStackTrace = hubHook; E.stackTraceLimit = 1;   // the hub's own window (user-todos.js, jobs.js)
  const out2 = caller();
  ok(E.prepareStackTrace === hubHook && E.stackTraceLimit === 1 && LH.sampleOf(out2, REPO).frames.some((f) => f.fn === 'caller'), 'inside the hub\'s own prepareStackTrace window: the sample reads its frames with ITS hook and gives the hub\'s back');
  delete E.prepareStackTrace; E.stackTraceLimit = l0;
  caller();
  ok(!Object.prototype.hasOwnProperty.call(E, 'prepareStackTrace') && E.stackTraceLimit === l0, 'with no own prepareStackTrace before, none after (deleted, never left as undefined)');
  if (hadOwn) E.prepareStackTrace = p0;
  const outside = new Function('f', 'return f();');   // eval'd code: no file
  const forged = 'sk_live_INJECTEDabc123\t' + ROOT + '/src/x.js\t7\t0\nzz';
  Object.defineProperty(outside, 'name', { value: forged });
  const fo = LH.sampleOf(outside(caller), REPO).frames.map(LH.frameText).join(' | ');
  ok(!/sk_live|src\/x\.js/.test(fo), `in process: a function renamed «sk_live…\\t…/src/x.js\\t7…» answers no forged frame (${fo.slice(0, 160)})`);
  // a throw inside it (a call site that throws — what a full stack does): restored, caught, NO note, but ENTERED counted ⇒ the watchdog's «deep» JavaScript
  const n0 = notes.length, z0 = Zc[0], p1 = E.prepareStackTrace;
  const thrown = (0, eval)(LH.SAMPLE_EXPR.replace('c.getFunctionName()', '(function(){ throw new RangeError("stack") })()'));   // eslint-disable-line no-eval
  ok(thrown === '' && E.prepareStackTrace === p1 && E.stackTraceLimit === l0 && notes.length === n0 && Zc[0] === z0 + 1, 'a sample that throws mid-way restores prepareStackTrace and stackTraceLimit, throws nothing out, leaves NO note — and its ENTERED cell moved (the watchdog reads «the stack was nearly full»)');
  ok(!/\b(Promise|then|setTimeout|setImmediate|nextTick|queueMicrotask|async|await)\b/.test(LH.SAMPLE_EXPR), 'the expression schedules nothing and makes no promise (no Promise / then / timers / nextTick / async)');
  ok(/finally \{ if \(dp\) E\.prepareStackTrace = p; else delete E\.prepareStackTrace; if \(dl\) E\.stackTraceLimit = l; else delete E\.stackTraceLimit; \}/.test(LH.SAMPLE_EXPR), 'the restore is a finally of plain stores and deletes (no call can throw there)');
  ok(/f = typeof f === 'string' \? f : ''; u = typeof u === 'string' \? u : ''/.test(LH.SAMPLE_EXPR) && /f\.length \+ ':' \+ f \+ u\.length \+ ':' \+ u/.test(LH.SAMPLE_EXPR), 'every string in the answer is LENGTH-PREFIXED, and a non-string from a call site is \'\'');
  { let gets = 0, sets = 0; const d0 = Object.getOwnPropertyDescriptor(E, 'prepareStackTrace');
    Object.defineProperty(E, 'prepareStackTrace', { configurable: true, get() { gets++; return undefined; }, set() { sets++; } });
    const a = caller();
    Object.defineProperty(E, 'prepareStackTrace', d0 || { configurable: true, writable: true, value: undefined }); if (!d0) delete E.prepareStackTrace;
    ok(a === 'A' && notes[notes.length - 1] === 'A' && gets === 0 && sets === 0 && E.stackTraceLimit === l0 && LH.sampleOf('A').form === 'accessor', 'an accessor on Error.prepareStackTrace: the sample answers «A» and invokes it 0 times (the sampler stands down)', { a, gets, sets }); }
  { dbgNow = true; const a = caller(); dbgNow = false;
    ok(a === 'D' && notes[notes.length - 1] === 'D' && LH.sampleOf('D').form === 'debugger', 'a debugger port open NOW (asked ON the main thread through the hook) ⇒ «D» (the sampler stands down)'); }
  { const keepL = E.stackTraceLimit; delete E.stackTraceLimit; caller(); const back = Object.prototype.hasOwnProperty.call(E, 'stackTraceLimit'); E.stackTraceLimit = keepL;
    ok(!back, 'a deleted Error.stackTraceLimit stays deleted after a sample (restored by delete)'); }
  // inside the program's own stack formatting — V8's default STRING, read for LOCATIONS only, and only when every line reads as V8's own
  { let inner = null; const p2 = E.prepareStackTrace;
    E.prepareStackTrace = function programsOwnPrep(e, cs) { inner = caller(); return cs; };
    void new E().stack; E.prepareStackTrace = p2;
    const sm = LH.sampleOf(inner, REPO);
    ok(typeof inner === 'string' && inner[0] === 'S' && sm.form === 'string' && sm.frames.some((f) => f.cls === 'repo' && f.file === 'scripts/test-loop-hold.mjs' && f.fn === null) && !LH.chainWords(sm.frames).includes(REPO),
      `inside the program's own prepareStackTrace: the string form, locations only (no name), repo-relative, no absolute path (${LH.chainWords(sm.frames).slice(0, 160)})`, inner && inner.slice(0, 600)); }
  // the string form with an OUTSIDE function's multi-line name planting a location line of a real repo file: the whole sample is unreadable
  { const outside2 = new Function('f', 'return f();');
    Object.defineProperty(outside2, 'name', { value: 'q\n    at ' + REPO + '/src/loop-hold.js:77:1\nzz' });
    let inner = null; const p2 = E.prepareStackTrace;
    E.prepareStackTrace = function programsOwnPrep(e, cs) { inner = outside2(caller); return cs; };
    void new E().stack; E.prepareStackTrace = p2;
    const sm = LH.sampleOf(inner, REPO);
    ok(sm.form === 'formatting' && sm.frames.length === 0, 'the string form with an outside name planting «    at <repo>/src/loop-hold.js:77:1» ⇒ «frames unreadable (inside the program\'s own stack formatting)» as a whole — never a culprit', sm); }
  delete globalThis[LH.HOOK_KEY];
  { const body = 'Error\n    at <anonymous>:4:20\n    at slowPrep (' + ROOT + '/src/hogs.js:9:5)\n    at Array.from (<anonymous>)\n    at readMail (/home/jane-doe/.vibespace/plugins/mail/index.js:3:1)\n    at new Thing (' + ROOT + '/src/thing.js:2:7)\n    at eval (eval at run (' + ROOT + '/src/r.js:1:1), <anonymous>:1:1)\n    at async Promise.all (index 0)\n    at ' + ROOT + '/server.js:40:9\n    at JSON.parse (<anonymous>)';
    const sm = LH.sampleOf('S' + body.length + ':' + body, ROOT), w = sm.frames.map(LH.frameText);
    ok(JSON.stringify(w) === JSON.stringify(['src/hogs.js:9', '(built-in)', '(outside the repo)', 'src/thing.js:2', '(outside the repo)', '(built-in)', 'server.js:40', '(built-in)']),
      'the string form, every line in V8\'s own format: its own frame skipped; a repo frame by its LOCATION only (no name); a built-in; a person\'s path ⇒ outside; an eval origin ⇒ outside (never read); «(index 0)» a built-in', w);
    for (const [why, bad] of [['a header that is not «Error»', body.replace(/^Error/, 'X\n    at ' + ROOT + '/src/a.js:1:1')], ['a line a name broke (no «    at »)', body + '\nzz (outside.js:3:5)'], ['a name with a space', body.replace('slowPrep', 'slow prep')]])
      ok(LH.sampleOf('S' + bad.length + ':' + bad, ROOT).form === 'formatting', `the string form with ${why} ⇒ unreadable as a whole`); }
  // ONE key whichever form answered: «x» from call sites and the string form's location-only frame share the table row
  { const tbl = new Map(), named = LH.parseSample(enc([['repoCallsOutside', ROOT + '/src/a.js', 5]]), ROOT);
    const strFrames = LH.sampleOf((() => { const b = 'Error\n    at <anonymous>:1:1\n    at Object.repoCallsOutside (' + ROOT + '/src/a.js:5:2)'; return 'S' + b.length + ':' + b; })(), ROOT).frames;
    LH.tableAdd(tbl, { verdict: 'JavaScript', frameKey: LH.keyFrame(strFrames), frame: LH.keyWords(strFrames) }, 1000);
    LH.tableAdd(tbl, { verdict: 'JavaScript', frameKey: LH.keyFrame(named), frame: LH.keyWords(named) }, 2000);
    const rows = LH.tableRows(tbl);
    ok(rows.length === 1 && rows[0].count === 2 && rows[0].frame === 'repoCallsOutside (src/a.js:5)' && LH.keyFrame(strFrames) === 'src/a.js:5', 'one function, ONE table row whichever form answered — keyed by its location, shown by its name once known', rows); }
}

// ── ③ LAW A ─────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('③ law A — the scheduler\'s facts and the verdict');
const STAT = (ut, st, majflt = 0) => `4242 (node (hub) x) R 1 4242 4242 0 -1 4194560 100 0 ${majflt} 0 ${ut} ${st} 0 0 20 0 11 0 100 1000 200`;
const at0 = 1e12;
const R = (at, { ut, st, run, wait, thr, nthr, cpuSome = 0, memSome = 0, rss = 512 * 1024 }) => LH.readingOf({ at, stat: STAT(ut, st), schedstat: `${run * 1e6} ${wait * 1e6} 100`,
  cpuStat: thr == null ? null : `usage_usec 1\nnr_periods 100\nnr_throttled ${nthr}\nthrottled_usec ${thr * 1000}\n`, cpuPressure: `some avg10=0.00 avg60=0.00 avg300=0.00 total=${cpuSome * 1000}\nfull avg10=0.00 avg60=0.00 avg300=0.00 total=0\n`,
  memPressure: `some avg10=0.00 avg60=0.00 avg300=0.00 total=${memSome * 1000}\nfull avg10=0.00 avg60=0.00 avg300=0.00 total=0\n`, status: `Name:\tnode\nVmRSS:\t ${rss} kB\n` });
{
  const t = LH.parseTaskStat(STAT(1120, 70, 3));
  ok(t && t.uMs === 11200 && t.sMs === 700 && t.majflt === 3, 'stat: utime / stime / majflt read after the command\'s LAST «)» (a command with spaces and parens)', t);
  ok(JSON.stringify(LH.parseSchedstat('659610 1200 7\n')) === '{"runNs":659610,"waitNs":1200}' && LH.parseSchedstat('') === null, 'schedstat: run + run-queue time; absent ⇒ null');
  ok(JSON.stringify(LH.parseCpuStat('usage_usec 9\nnr_periods 40\nnr_throttled 12\nthrottled_usec 9800000\n')) === '{"nrThrottled":12,"throttledUs":9800000}'
    && JSON.stringify(LH.parseCpuStat('nr_periods 40\nnr_throttled 12\nthrottled_time 9800000000\n')) === '{"nrThrottled":12,"throttledUs":9800000}' && LH.parseCpuStat('usage_usec 9\n') === null,
    'cpu.stat: cgroup v2 throttled_usec, v1 throttled_time (ns); a root cgroup without throttling ⇒ null (nothing said)');
  const v2 = LH.cpuStatPaths('0::/kubepods.slice/pod-1/c1\n'), v1 = LH.cpuStatPaths('12:cpu,cpuacct:/docker/abc\n11:memory:/docker/abc\n');
  ok(v2[0] === '/sys/fs/cgroup/kubepods.slice/pod-1/c1/cpu.stat' && v2.includes('/sys/fs/cgroup/cpu.stat') && v1[0] === '/sys/fs/cgroup/cpu,cpuacct/docker/abc/cpu.stat' && v1.includes('/sys/fs/cgroup/cpu/docker/abc/cpu.stat')
    && LH.cpuStatPaths('0::/../x\n').every((p) => !p.includes('..')), 'the cgroup\'s cpu.stat found through /proc/self/cgroup (v2, v1\'s cpu controller, the namespace root last; a climbing path never)', { v2, v1 });
  ok(JSON.stringify(LH.parsePressure('some avg10=1.00 avg60=0.00 avg300=0.00 total=1001\nfull avg10=0.00 avg60=0.00 avg300=0.00 total=7\n')) === '{"someUs":1001,"fullUs":7}' && LH.parseRss('VmRSS:\t  2048 kB\n') === 2097152, 'pressure totals and VmRSS');
  // THE MEASURED TABLE (the independent check's robustness/results.md, each a 2 s hold on this box; v24): the verdict in its order
  const Z = R(at0, { ut: 0, st: 0, run: 0, wait: 0 });
  const V = (W, f, s = {}) => LH.verdict({ d: LH.schedDelta(Z, R(at0 + W, f)), ...s });
  const rows = [
    ['(a) JS busy', V(2000, { ut: 200, st: 1, run: 2000, wait: 0 }, { n: { js: 3 } }), 'JavaScript'],
    ['(b) JSON.parse of 2 M objects — asked ON THE CPU, answered only at its end', V(1100, { ut: 99, st: 8, run: 1066, wait: 2 }, { n: { native: 1 } }), 'native code or garbage collection'],
    ["(b') a gc() loop — its collections cover the hold", V(1750, { ut: 170, st: 3, run: 1735, wait: 12 }, { n: { native: 1 }, gcMs: 1600 }), 'garbage collection'],
    ['(c) reading /dev/zero — stime 0.95 of it, a sample answered between reads', V(2000, { ut: 10, st: 189, run: 2000, wait: 0 }, { n: { js: 2 } }), 'in the kernel (on the CPU)'],
    ["(c') a statSync loop — stime 0.53, a sample answered", V(2000, { ut: 94, st: 106, run: 1995, wait: 2 }, { n: { js: 2 } }), 'JavaScript'],
    ['(d) execFileSync sleep 2 — run 3 ms', V(2000, { ut: 1, st: 0, run: 3, wait: 0 }, { n: { kernel: 1 } }), 'in the kernel (blocked)'],
    ["(d') Atomics.wait 2 s — run 1 ms, though it services interrupts", V(2000, { ut: 0, st: 0, run: 1, wait: 0 }, { n: { js: 3 } }), 'in the kernel (blocked)'],
    ['(e) STARVED — one competitor on its CPU, wait 0.50 W, even with a frame', V(2000, { ut: 98, st: 0, run: 986, wait: 1011 }, { n: { js: 2 } }), 'waiting for a CPU'],
    ['(f) SIGSTOP 2 s — nothing ran, the watchdog late by W', V(2000, { ut: 0, st: 0, run: 0, wait: 0 }, { lateMs: 2000 }), 'not running (stopped, frozen or blocked)'],
    ['(g) a BLOCKED main thread with a LATE watchdog (run 3 ms; the watchdog late 1 200 of 2 000) — no more than it knows', V(2000, { ut: 0, st: 0, run: 3, wait: 0 }, { lateMs: 1200 }), 'not running (stopped, frozen or blocked)'],
    ['(h) a 1.8 s JavaScript loop NOBODY SAMPLED (off, past the cap, a debugger) — «not asked» is never «none seen»', V(2000, { ut: 180, st: 1, run: 1800, wait: 2 }, { n: {} }), 'on the CPU in user mode — JavaScript or native code, not sampled'],
    ['(i) not sampled and no scheduler facts', LH.verdict({ d: null, n: {} }), 'not sampled, and no scheduler facts'],
    ['(j) round 4: a sync child, asked ASLEEP, the window too short to judge', LH.verdict({ d: null, n: { kernel: 1 } }), 'in the kernel (blocked)'],
    ['(k) round 4: asked while STOPPED', LH.verdict({ d: null, n: { stopped: 2 } }), 'not running (stopped, frozen or blocked)'],
    ['(l) round 4: not answered at JavaScript speed, its state unread', LH.verdict({ d: null, n: { notJs: 1 } }), 'not in JavaScript when asked (its kernel state unread)'],
  ];
  for (const [n, got, want] of rows) ok(got === want, `${n} ⇒ ${want}`, got);
  // the order decides: a stopped process is never «in the kernel», a starved one never «JavaScript»
  ok(V(2000, { ut: 0, st: 0, run: 0, wait: 0 }, { lateMs: 900 }) === 'in the kernel (blocked)', 'the watchdog late < 0.5 W: blocked in the kernel, not stopped');
  // a THROTTLED POD (a fixture: no quota on the box measured — untested on a real quota; its throttled tasks stay on the
  // run queue, so schedstat's wait carries the throttled time)
  const podD = LH.schedDelta(R(at0, { ut: 0, st: 0, run: 0, wait: 0, thr: 0, nthr: 0 }), R(at0 + 12400, { ut: 100, st: 10, run: 1100, wait: 11000, thr: 9800, nthr: 98, cpuSome: 11000 }));
  ok(LH.verdict({ d: podD, n: { js: 1 } }) === 'waiting for a CPU', 'THE THROTTLED POD (fixture) ⇒ waiting for a CPU, even with a frame answered');
  const pw = LH.schedWords(podD);
  ok(pw === "the main thread ran 1.1 s of the 12.4 s measured (user 1.0, kernel 0.1) — waited 11.0 s for a CPU; its group was throttled 9.8 s (98 times); the box's pressure: cpu 11.0 s", 'the plain words: what ran of the window measured, the run-queue wait, the throttling (untested on a real quota), the box\'s pressure', pw);
  // NEVER BY THE GROUP OR THE BOX: huge throttling / pressure / group usage while the main thread ran and answered ⇒ JavaScript
  const loud = LH.schedDelta(R(at0, { ut: 0, st: 0, run: 0, wait: 0, thr: 0, nthr: 0 }), R(at0 + 2000, { ut: 199, st: 1, run: 1990, wait: 4, thr: 1900, nthr: 19, cpuSome: 1900, memSome: 1500 }));
  ok(LH.verdict({ d: loud, n: { js: 2 } }) === 'JavaScript', 'the cgroup\'s throttling and the box\'s pressure never decide a verdict (only the main thread\'s own run / wait / stime and the watchdog\'s lateness)');
  ok(LH.verdict({ d: null, n: { js: 2 } }) === 'JavaScript' && LH.verdict({ d: null, n: { native: 1 } }) === 'native code or garbage collection' && LH.verdict({ d: null, n: { kernel: 1, js: 1 } }) === 'in the kernel (blocked)' && LH.verdict({ d: null, n: { js: 2, kernel: 1 } }) === 'JavaScript',
    'no scheduler facts (no procfs): the asks alone decide — the class most asks fell in; a tie goes to the kernel\'s word');
  const noSched = LH.schedDelta(LH.readingOf({ at: at0, stat: STAT(0, 0) }), LH.readingOf({ at: at0 + 3000, stat: STAT(290, 5) }));
  ok(noSched.ranMs === 2950 && noSched.waitMs === null && noSched.throttledMs === null && LH.schedWords(noSched) === 'the main thread ran 3.0 s of the 3.0 s measured (user 2.9, kernel 0.1)', 'no schedstat, no cgroup: ran = user + kernel, nothing said about waits or throttling', LH.schedWords(noSched));
  ok(LH.STOPPED_LATE_SHARE === 0.5 && LH.STOPPED_RUN_SHARE === 0.05 && LH.WAIT_SHARE === 0.2 && LH.RAN_SHARE === 0.2 && LH.KERNEL_SHARE === 0.6 && LH.JS_FAST_MS === 2 && LH.NO_ANSWER_MS === 50, 'the thresholds are the measured table\'s, stated in the module (round 4: JavaScript speed = 2 ms, four times the largest measured)');
}

// ── ④ the lines ──────────────────────────────────────────────────────────────────────────────────────────────────
console.log('④ the lines');
{
  const d = LH.schedDelta(R(at0, { ut: 0, st: 0, run: 0, wait: 0 }), R(at0 + 12400, { ut: 1120, st: 70, run: 11900, wait: 30, rss: 3.9 * 1024 * 1024 }));
  const h = { from: at0, to: at0 + 12400, ms: 12400, d,
    samples: [...Array(4)].map(() => ({ kind: 'js', words: 'busyHog (src/x.js:38) ← tick (src/server/y.js:52)', key: 'busyHog (src/x.js:38)' })).concat([{ cls: 'native', kind: 'none', words: LH.ASK_WORDS.native, key: '(native)' }, { cls: 'native', kind: 'none', words: LH.ASK_WORDS.native, key: '(native)' }]),
    after: 'loadIndex (src/search-index.js:40)', gc: [{ at: at0 + 100, ms: 3100, kind: 4 }, { at: at0 + 9000, ms: 80, kind: 1 }, { at: at0 - 5000, ms: 900, kind: 4 }],
    mem: { heapUsed: 3.4 * 2 ** 30, heapLimit: 4.1 * 2 ** 30, external: 0.4 * 2 ** 30, rss: 3.9 * 2 ** 30 }, eluBefore: 0.78, starvedMs: 3200 };
  const line = LH.holdLine(h);
  const want = '[loop-hold] the main loop was held 12.4 s — JavaScript: the main thread ran 11.9 s of the 12.4 s measured (user 11.2, kernel 0.7); 6 samples: busyHog (src/x.js:38) ← tick (src/server/y.js:52) ×4, on the CPU, not in JavaScript (native code or a collection) ×2; the first JavaScript after it: loadIndex (src/search-index.js:40); garbage collection: mark-compact 3.1 s, scavenge 0.1 s inside the hold; heap 3.4 of 4.1 GB, external 0.4 GB, rss 3.9 GB; the loop was 78 % busy in the minute before; the watchdog was starved 3.2 s too';
  ok(line === want, 'THE resume line: verdict, the scheduler\'s numbers, the samples ×count, the first JavaScript after it, the collections INSIDE the hold (one before it is not), memory, utilization, the starved watchdog', line);
  const f = LH.foldHold(h);
  ok(f.verdict === 'JavaScript' && f.frame === 'busyHog (src/x.js:38)' && f.js === 4 && f.none === 2 && Math.round(f.gc.ms) === 3180, 'the fold: verdict, the table\'s frame, the counts, the collections inside', f);
  const boot = LH.holdLine({ boot: true, from: 0, to: 69591, ms: 69591, samples: [{ kind: 'js', words: 'restoreSessions (server.js:1760)', key: 'restoreSessions (server.js:1760)' }], d: null });
  ok(boot.startsWith('[loop-hold] the boot held the main loop 69.6 s before its first turn — JavaScript: 1 sample: restoreSessions (server.js:1760) ×1'), 'the boot\'s own words', boot);
  for (const [why, words] of [['off', 'sampling is off in Settings'], ['debugger', 'a debugger is attached'], ['cap', '20 holds were sampled in the last hour'], ['inspector', 'this Node has no inspector']]) {
    const l = LH.holdLine({ from: 0, to: 2000, ms: 2000, unsampled: why, d: LH.schedDelta(R(at0, { ut: 0, st: 0, run: 0, wait: 0 }), R(at0 + 2000, { ut: 190, st: 5, run: 1950, wait: 0 })) });
    ok(l.includes(`not sampled (${words})`) && /ran \d\.\d s of the 2\.0 s measured \(user/.test(l) && / — on the CPU in user mode — JavaScript or native code, not sampled: /.test(l), `unsampled (${why}): said, law A's numbers still printed, and the VERDICT says it was not sampled — never «native»`, l);
  }
  // condition 3: three answers with their own words — never «native / kernel», never «idle»
  const deep = LH.holdLine({ from: 0, to: 1500, ms: 1500, samples: [{ kind: 'js', words: LH.WORDS.deep, key: LH.KEYS.deep }, { kind: 'js', words: LH.WORDS.deep, key: LH.KEYS.deep }], d: null });
  const betw = LH.holdLine({ from: 0, to: 1500, ms: 1500, samples: [{ kind: 'js', words: LH.WORDS.between, key: LH.KEYS.between }], d: null });
  ok(/ — JavaScript: no scheduler window covered it — the samples alone say where it was; 2 samples: the stack was nearly full \(deep recursion\) ×2$/.test(deep) && / — JavaScript: no scheduler window covered it — the samples alone say where it was; 1 sample: between JavaScript frames \(promise \/ microtask jobs\) ×1$/.test(betw),
    'a RangeError answer ⇒ «the stack was nearly full (deep recursion)»; a stack with no JavaScript frame ⇒ «between JavaScript frames (promise / microtask jobs)» — both JavaScript', [deep, betw]);
  const unseen = LH.holdLine({ from: 0, to: 2000, ms: 2000, unsampled: 'unseen', lateMs: 2000, starvedMs: 2000, d: LH.schedDelta(R(at0, { ut: 0, st: 0, run: 0, wait: 0 }), R(at0 + 2000, { ut: 0, st: 0, run: 0, wait: 0 })) });
  ok(unseen.startsWith('[loop-hold] the main loop was held 2.0 s — not running (stopped, frozen or blocked): the main thread ran 0.0 s of the 2.0 s measured') && unseen.includes('not sampled (the watchdog was not running either)') && !unseen.includes('starved'),
    'a hold the watchdog could not see while it lasted (a stopped process, a paused VM): not running, said at the next turn — never «starved» beside it', unseen);
  const nf = LH.foldHold({ from: 0, to: 800, ms: 800, samples: [{ cls: 'native', kind: 'none', words: LH.ASK_WORDS.native, key: '(native)' }], afterKey: 'sleepHog (src/hogs.js:4)', after: 'getStderr (node:internal/x:1) ← … sleepHog (src/hogs.js:4)', d: null });
  ok(nf.frame === 'sleepHog (src/hogs.js:4) (after)' && nf.verdict === 'native code or garbage collection', 'no frame inside the hold: the table names the first JavaScript after it, marked «(after)»', nf);
  ok(LH.liveWords({ samples: [{ kind: 'js', words: 'busyHog (src/x.js:38)' }, { kind: 'js', words: 'busyHog (src/x.js:38)' }], d: null }) === 'JavaScript: busyHog (src/x.js:38) [2 of 2 samples]'
    && LH.liveWords({ samples: [], pendingMs: 9000, pendingState: 'running' }) === 'no JavaScript answered for 9.0 s (on the CPU: native code or a collection)'
    && LH.liveWords({ samples: [], pendingMs: 9000, pendingState: 'asleep', pendingKernel: 'pipe_read in read' }) === 'asleep in the kernel since it was asked 9.0 s ago (pipe_read in read)'
    && LH.liveWords({ samples: [], pendingMs: 9000 }) === 'no JavaScript answered for 9.0 s (not in JavaScript)' && LH.liveWords({ unsampled: 'cap' }) === 'not sampled (20 holds were sampled in the last hour)',
    'the live words: the latest frames with the count, an ask unanswered by the thread\'s state at the post (on the CPU / asleep with its wait channel / unread), unsampled');
  ok(LH.heldWords({ ms: 1750, msHi: 2000 }) === '1.8–2.0 s' && LH.heldWords({ ms: 1800, msHi: 1820 }) === '1.8 s' && LH.heldWords({ ms: 69591 }) === '69.6 s'
    && LH.holdLine({ from: 0, ms: 1750, msHi: 2000, d: null, samples: [] }).startsWith('[loop-hold] the main loop was held 1.8–2.0 s — '),
    'held is a RANGE from the main thread\'s own beats (at least the gap less a beat, at most the gap) when they differ; the window measured is said as such («of the Y s measured»)');
  const pub = LH.publicHold({ ...h, line });
  ok(pub.line === line && pub.verdict === 'JavaScript' && pub.frame === 'busyHog (src/x.js:38)' && pub.samples === 6 && pub.ranMs === 11900 && !('d' in pub) && !('mem' in pub),
    'the public hold carries the formatter\'s words and numbers only');
  ok(LH.gcOf([], 0, 1).words === '' && LH.memWords(null) === '' && LH.memWords({ heapUsed: 2 ** 30, heapLimit: 4 * 2 ** 30, external: null, rss: null }) === 'heap 1.0 of 4.0 GB', 'no collection / no memory ⇒ nothing said; a partial memory says its part');
}

// ── ⑤ schedule, cap, table ───────────────────────────────────────────────────────────────────────────────────────
console.log('⑤ the schedule, the cap, the table');
{
  const due = [999, 1000, 1999, 2000, 4000, 8000, 16000, 32000, 64000].map((ms, i) => LH.sampleDue([0, 0, 1, 1, 2, 3, 4, 5, 6][i], ms));
  ok(JSON.stringify(due) === '[false,true,false,true,true,true,true,true,true]' && !LH.sampleDue(7, 1e9) && LH.SAMPLES_PER_HOLD === 7, 'samples at held ≈ 1, 2, 4, 8, 16, 32, 64 s — never an 8th', due);
  ok(LH.sampleDue(0, 100, 100) && LH.sampleDue(1, 200, 100) && !LH.sampleDue(1, 199, 100), 'the schedule follows an injected hold length (the live suite\'s 100 ms)');
  // condition 6: THE RATE IS A SAFETY BOUND — periodic samples of a free loop near the heap limit ran Node 24 out of memory
  // with a third less data; a change that samples faster goes RED here: a hold's samples ≥ 1 s apart from its first
  // second on, ≤ 7, ≤ 20 sampled holds an hour, the profile ≥ 1 s apart and refused / stopped past 85 % of the heap
  { const due = []; for (let ms = 0, k = 0; ms <= 200000; ms += 10) if (LH.sampleDue(k, ms)) { due.push(ms); k++; }
    const gaps = due.slice(1).map((x, i) => x - due[i]);
    ok(LH.HOLD_MS >= 1000 && due[0] >= 1000 && gaps.every((g) => g >= 1000) && due.length <= 7 && LH.CAP_PER_HOUR <= 20 && LH.PROFILE_EVERY_MS >= 1000 && LH.PROFILE_HEAP_SHARE <= 0.85,
      `the sampling rate stays within the measured safe bound (samples at ${due.map((x) => x / 1000).join(', ')} s; cap ${LH.CAP_PER_HOUR}/h; profile every ${LH.PROFILE_EVERY_MS} ms, refused past ${LH.PROFILE_HEAP_SHARE * 100} % of the heap)`); }
  ok(LH.samplesBound(1900) === 1 && LH.samplesBound(2000) === 2 && LH.samplesBound(70000) === 7 && LH.samplesBound(300, 100) === 2 && LH.samplesBound(99, 100) === 0, 'the most samples a hold may carry under the schedule (the live suite bounds each hold by it)');
  { const big = { holds: [...Array(50)].map((_, i) => ({ at: i, line: 'x'.repeat(6000) })), table: [...Array(201)].map((_, i) => ({ verdict: 'JavaScript', frame: 'f'.repeat(1500) + i, count: 1, totalMs: 1, worstMs: 1 })) };
    const b = LH.boundReport(big, 64 * 1024), n = new TextEncoder().encode(JSON.stringify(b)).length;
    ok(n <= 64 * 1024 && b.truncated && b.truncated.maxBytes === 65536 && JSON.stringify(LH.boundReport({ holds: [], table: [] }, 1024)) === '{"holds":[],"table":[]}', `the incident bundle's share has an explicit byte bound (a 10 000-hold book: ${n} bytes ≤ 64 KB, the cut said); a small report is unchanged`); }
  const times = []; let t = 5e12, allowed = 0;
  for (let i = 0; i < 25; i++) { if (LH.capAllows(times, t)) { times.push(t); allowed++; } t += 60000; }
  ok(allowed === 20, `the cap: 20 sampled holds in a rolling hour (25 holds a minute apart ⇒ ${allowed})`);
  ok(!LH.capAllows(times, t) && LH.capAllows(times, times[0] + 3600000 + 1) && times.length === 19, 'the 21st is refused; an hour after the first, one more is allowed (the window rolls)');
  const tbl = new Map();
  for (let i = 0; i < 205; i++) LH.tableAdd(tbl, { verdict: 'JavaScript', frame: `f${i} (src/x.js:${i})` }, 1000 + i);
  LH.tableAdd(tbl, { verdict: 'JavaScript', frame: 'f3 (src/x.js:3)' }, 5000);
  const rows = LH.tableRows(tbl), other = rows.find((r) => r.verdict === 'other'), f3 = rows.find((r) => r.frame === 'f3 (src/x.js:3)');
  ok(tbl.size === 201 && other && other.count === 5 && other.totalMs === 6010 && other.frame === '(other)' && f3.count === 2 && f3.totalMs === 6003 && f3.worstMs === 5000 && rows[0] === other,
    'the table: 200 keys, the rest folded into «other»; count / total / worst per (verdict, frame); sorted by total held', { size: tbl.size, other, f3 });
}

// ── ⑥ laws L and K ───────────────────────────────────────────────────────────────────────────────────────────────
console.log('⑥ law L (the profile) and law K (memory on the record)');
{
  const p = LH.profileOf({ startedAt: 0, endedAt: 600000, samples: 600, idle: 180, between: 60, noJs: 60, js: 300, by: { 'tick (src/server/y.js:52)': 200, 'render (src/x.js:9)': 100 } });
  ok(p.idlePct === 30 && p.betweenPct === 10 && p.noJsPct === 10 && p.jsPct === 50 && p.top[0].frame === 'tick (src/server/y.js:52)' && p.top[0].pct === 33.3 && /within 50 ms/.test(p.note), 'a profile: the idle share, between JavaScript frames, the no-JavaScript share, each frame\'s share, the honest note', p);
  ok(LH.profileLine(p) === '[loop-hold] profile of 600 s (600 samples): idle 30 %, between JavaScript frames 10 %, no JavaScript frame 10 %, JavaScript 50 % — tick (src/server/y.js:52) 33.3 %, render (src/x.js:9) 16.7 %', 'its journal line', LH.profileLine(p));
  ok(/ — It stopped early: the server’s memory neared its limit\.$/.test(LH.profileLine(LH.profileOf({ startedAt: 0, endedAt: 9000, samples: 9, idle: 9, by: {}, stopped: 'heap' }))) && LH.profileLine(LH.profileOf({ refused: 'heap', startedAt: 1, endedAt: 1 })) === '[loop-hold] the profile did not run — the heap is above 85 % of its limit',
    'a profile stopped by the heap, or refused by it, says so');
  ok(LH.profileLine(LH.profileOf({ refused: 'off', startedAt: 1, endedAt: 1 })) === '[loop-hold] the profile did not run — sampling is off in Settings' && LH.profileLine(LH.profileOf({ refused: 'lost', startedAt: 1, endedAt: 1 })) === '[loop-hold] the profile ran until the watchdog thread stopped — its samples are lost', 'a refused profile says why; a LOST one ran until its watchdog stopped — never «did not run» (round 4)');
  { const q = LH.profileOf({ startedAt: 0, endedAt: 4000, samples: 4, js: 2, unsampled: 2, by: { 'src/a.js:5': 2 }, names: { 'src/a.js:5': 'f (src/a.js:5)' } });
    ok(q.notSampledPct === 50 && q.noJsPct === 0 && q.top[0].frame === 'f (src/a.js:5)' && /not sampled 50 %/.test(LH.profileLine(q)), 'a stand-down inside a profile (an accessor, a debugger) is «not sampled», never «no JavaScript frame»; a frame shown by its name, keyed by its location', q); }
  const c = MC.memoryCensus({ main: { heapTotal: 2 * 2 ** 30, heapUsed: 1.8 * 2 ** 30, external: 0.3 * 2 ** 30, rss: 3 * 2 ** 30 }, workers: [], smaps: null });
  const hl = MC.hourLine(c, 7.6, 3.4);
  ok(/^\[memory\] census, up 7\.6 h: main heap \d+ MB, 0 workers 0 MB, external \d+ MB, native \d+ MB, RSS 3072 MB \(no smaps: the parts add up to RSS\); the census held the loop 3 ms$/.test(hl), 'the hourly line: the boot census\'s parts, the uptime, what the census held the loop', hl);
  ok(MC.bootLine(c).startsWith('[memory] boot census: main heap'), 'the boot line is unchanged');
  ok(MC.heapHighLine(3.4 * 2 ** 30, 4.1 * 2 ** 30) === '[memory] the heap is at 3.4 of 4.1 GB — collections get long (the process stops when it reaches the limit)' && MC.heapHighLine(3.2 * 2 ** 30, 4.1 * 2 ** 30) === null && MC.heapHighLine(1, 0) === null,
    'heap past 80 % of its limit ⇒ the line; below it (or no limit) ⇒ none');
}

// ── ⑦ ROUND 4 — A SAMPLE SPEAKS FOR WHERE THE THREAD WAS WHEN IT WAS ASKED: THE PURE TABLE ─────────────────────────────
console.log('⑦ round 4 — the law over {asked 0…3} × {latency} × {state at the post} × {frames / none} × {window} × {scheduler facts}');
{
  const W = 2000, FROM = 10000, TO = FROM + W, BEAT0 = 7;
  const SCHED = { user: [{ ut: 190, st: 5, run: 1950, wait: 0 }, 0], kernel: [{ ut: 10, st: 189, run: 2000, wait: 0 }, 0], blocked: [{ ut: 0, st: 0, run: 3, wait: 0 }, 0],
    starved: [{ ut: 98, st: 0, run: 986, wait: 1011 }, 0], stopped: [{ ut: 0, st: 0, run: 0, wait: 0 }, 2000] };
  const BY_SCHED = { kernel: LH.V.kernel, blocked: LH.V.blocked, starved: LH.V.waiting, stopped: LH.V.notRunning };
  const readingAt = (at, f) => R(at, f || { ut: 0, st: 0, run: 0, wait: 0 });
  // the scheduler WINDOW: covers the hold / covers too little of it (the watchdog started or stood still late) / none
  const WINDOW = { covers: (f) => LH.coveredDelta(readingAt(FROM - 100), readingAt(TO + 100, f), FROM, TO), little: (f) => LH.coveredDelta(readingAt(FROM + 0.6 * W), readingAt(TO + 100, f), FROM, TO), none: () => null };
  const FRAMES = { kind: 'js', words: 'busyHog (src/hogs.js:2)', key: 'src/hogs.js:2', keyWords: 'busyHog (src/hogs.js:2)' };
  const EMPTY = { kind: 'js', words: LH.WORDS.between, key: LH.KEYS.between, keyWords: LH.KEYS.between, empty: true };
  const LAT = { fast: 0.3, late: 30, never: null };
  let rows = 0; const bad = [];
  for (const asked of [0, 1, 2, 3]) for (const lat of Object.keys(LAT)) for (const state of ['running', 'asleep', 'stopped', 'unknown']) for (const said of ['frames', 'none']) for (const win of Object.keys(WINDOW)) for (const [sk, [f, lateMs]] of Object.entries(SCHED)) {
    if (!asked && (lat !== 'fast' || state !== 'running' || said !== 'frames')) continue;   // nothing asked: one row per window × facts
    const asks = [...Array(asked)].map((_, i) => { const postedAt = FROM + 1000 + i * 200; return { postedAt, answeredAt: LAT[lat] == null ? null : postedAt + LAT[lat], state, kernel: state === 'asleep' ? 'pipe_read in read' : null, answer: LAT[lat] == null ? null : said === 'frames' ? FRAMES : EMPTY, beat: LAT[lat] == null ? null : BEAT0 }; });
    const J = LH.judgeAsks(asks, { beat0: BEAT0, holdEnd: TO });
    const d = WINDOW[win](f);
    const h = { from: FROM, to: TO, fromM: FROM, toM: TO, ms: W - 250, msHi: W, samples: J.samples, outside: J.outside, after: J.after && J.after.words, afterKey: J.after && J.after.key, lateMs: win === 'covers' ? lateMs : 0, d };
    const fo = LH.foldHold(h), line = LH.holdLine(h);
    rows++;
    // the expectation, spelled ONCE from the law
    const answeredFast = lat === 'fast' && said === 'frames' && (state === 'running' || state === 'unknown');
    const cls = !asked ? null : state === 'asleep' ? 'kernel' : state === 'stopped' ? 'stopped' : lat === 'fast' ? (said === 'frames' ? 'js' : 'end') : state === 'running' ? 'native' : 'notJs';
    const schedFirst = win === 'covers' ? BY_SCHED[sk] : null;
    // round 5 (law B): a covering window decides by time — here mostly on the CPU (sk 'user': an asleep part under PART_SHARE),
    // so an asleep / stopped ask is printed as a sample and never names the hold
    const cpuWin = !schedFirst && !!d && d.ranMs >= (1 - LH.PART_SHARE) * d.wallMs;
    const want = schedFirst || (cpuWin && (cls === 'kernel' || cls === 'stopped') ? LH.V.cpu : cls === 'kernel' ? LH.V.blocked : cls === 'stopped' ? LH.V.notRunning : cls === 'js' ? LH.V.js : cls === 'native' ? LH.V.native : cls === 'notJs' ? LH.V.notJs : d ? LH.V.unsampled : LH.V.unknown);
    const problems = [];
    if (fo.verdict !== want) problems.push(`verdict ${fo.verdict} ≠ ${want}`);
    // THE INVARIANTS, checked in every cell
    if (fo.verdict === LH.V.js && !answeredFast) problems.push('«JavaScript» without an answer at JavaScript speed with a frame');
    if (fo.verdict === LH.V.native && !(state === 'running' && lat !== 'fast')) problems.push('«native» not from an ask posted on the CPU and unanswered at JavaScript speed');
    if (state === 'asleep' && asked && fo.verdict === LH.V.native) problems.push('asleep at the post ⇒ native');
    if (state === 'asleep' && asked && !schedFirst && !line.includes('asleep: pipe_read in read')) problems.push('asleep at the post: the wait channel not said');
    if (asked && cls === 'end' && !line.includes('not sampled (no sample landed inside it — asked ' + asked + ' time')) problems.push('asked, nothing inside, not said');
    if (/[:;—]\s*$/.test(line) || /;\s*;/.test(line)) problems.push('an empty tail');
    if (d && !line.includes('the main thread ran ')) problems.push('the scheduler\'s numbers unlabelled');
    if (problems.length) bad.push({ asked, lat, state, said, win, sk, problems, line });
  }
  ok(rows === 3 * 5 + 3 * 3 * 4 * 2 * 3 * 5 && !bad.length, `THE LAW over ${rows} cells: «JavaScript» only from an answer at JavaScript speed (≤ ${LH.JS_FAST_MS} ms) with a frame; «native» only from an ask posted ON THE CPU and not answered at that speed; asleep at the post ⇒ the kernel with its wait channel whatever the window covers; stopped ⇒ not running; unread ⇒ «not in JavaScript», never native; no frame at JavaScript speed ⇒ the loop's own machinery, said; the scheduler's verdict first when its window covers the hold; no empty tail`, bad.slice(0, 3));
  // an answer AFTER the held code returned is never inside: run in / after the beat that ended the gap, or with no
  // JavaScript on its stack — the hold's end is the fact, never a margin
  const A = (o) => LH.askOf({ postedAt: 100, answeredAt: 100.3, state: 'running', answer: FRAMES, beat: BEAT0, beat0: BEAT0, holdEnd: 2000, ...o }).cls;
  ok(A({}) === 'js' && A({ beat: -1 }) === 'end' && A({ beat: BEAT0 + 1 }) === 'end' && A({ answer: EMPTY }) === 'end' && A({ postedAt: 2000, answeredAt: 2000.2 }) === 'outside' && A({ answeredAt: 100 + LH.JS_FAST_MS + 0.01 }) === 'native' && A({ answeredAt: 100 + LH.JS_FAST_MS }) === 'js'
    && A({ answer: { kind: 'js', words: LH.WORDS.deep, key: LH.KEYS.deep, deep: true }, answeredAt: null }) === 'js',
    'askOf: before the ending beat at JavaScript speed with a frame ⇒ inside; in the beat itself, a later beat, or no JavaScript on its stack ⇒ at its end; posted after the end ⇒ not this hold\'s; one hundredth of a ms past JavaScript speed ⇒ native; a full stack ⇒ JavaScript by its own error');
  // ROUND 5 (law B): THE WINDOW SAYS HOW MUCH, A SAMPLE SAYS WHERE — the split between on the CPU and asleep is the window's,
  // by TIME; the samples name each part; a sample of the smaller part never names the hold; two real parts are said in time
  // order with their seconds; no covering window ⇒ the line says so
  {
    const win = (ran, wall, user = ran, kernel = 0) => LH.schedDelta(R(50000, { ut: 0, st: 0, run: 0, wait: 0 }), R(50000 + wall, { ut: user / 10, st: kernel / 10, run: ran, wait: 0 }));
    const S = (cls, at, o = {}) => cls === 'js' ? { cls, kind: 'js', words: 'busyHog (src/hogs.js:2)', key: 'src/hogs.js:2', keyWords: 'busyHog (src/hogs.js:2)', at, ...o }
      : cls === 'kernel' ? { cls, kind: 'none', words: o.w || 'asleep: futex_do_wait in futex', key: `(${o.w || 'asleep: futex_do_wait in futex'})`, keyWords: `(${o.w || 'asleep: futex_do_wait in futex'})`, at }
      : { cls, kind: 'none', words: 'on the CPU, not in JavaScript (native code or a collection)', key: '(native)', keyWords: '(native)', at };
    const L = (samples, d, ms = 1600) => { const h = { from: 50000, to: 50000 + ms, fromM: 50000, toM: 50000 + ms, ms, samples, d }; return { line: LH.holdLine(h), fo: LH.foldHold(h) }; };
    // (i) a native JSON.parse on Node 24: the window says it RAN 1.4 s of 1.7 s; one ask landed while it joined V8's helpers
    const i1 = L([S('kernel', 50400)], win(1400, 1700));
    const i2 = L([S('kernel', 50400), S('native', 50900)], win(1400, 1700));
    ok(i1.fo.verdict === LH.V.cpu && !/ — in the kernel \(blocked\)/.test(i1.line) && /1 sample: asleep: futex_do_wait in futex/.test(i1.line)
      && i2.fo.verdict === LH.V.native && !/in the kernel \(blocked\)/.test(i2.line),
      `law B (i): a window that says the thread RAN 1.4 s of 1.7 s is never named by its one asleep sample — «${i1.line.slice(i1.line.indexOf(' — ') + 3, i1.line.indexOf(' — ') + 70)}…»; with a native sample beside it: native`, { i1: i1.line, i2: i2.line });
    // (ii) 2.1 s of JavaScript, then 2.6 s asleep in a sync child: two parts, in time order, with the window's seconds
    const ii = L([S('js', 50300), S('js', 51200), S('kernel', 53500, { w: 'asleep: pipe_read in read' })], win(2100, 4700), 4500);
    const iiRev = L([S('kernel', 50300, { w: 'asleep: pipe_read in read' }), S('js', 53500), S('js', 54000)], win(2100, 4700), 4500);
    // the follow-up (minor 1): the parts' seconds over the HOLD's own span (4.5 s here; the window measured 4.7 s)
    ok(/ — JavaScript for 2\.1 s, then in the kernel \(blocked\) for 2\.4 s: /.test(ii.line) && ii.fo.verdict === `${LH.V.js}, then ${LH.V.blocked}` && ii.fo.frameKey === 'src/hogs.js:2'
      && / — in the kernel \(blocked\) for 2\.4 s, then JavaScript for 2\.1 s: /.test(iiRev.line),
      `law B (ii): a hold with two real parts is said as two, in time order, with the window's seconds — «${ii.line.slice(ii.line.indexOf(' — ') + 3, ii.line.indexOf(' — ') + 75)}…»`, { ii: ii.line, iiRev: iiRev.line });
    // the larger part decides when the other is no REAL part (under PART_SHARE), and a part with no sample of its own is said
    const big = L([S('kernel', 50300), S('kernel', 50600), S('js', 51000)], win(3900, 4700), 4500);   // ran 83 %: the two asleep samples never name it
    const sl = L([S('js', 50300), S('js', 50600), S('kernel', 51000)], win(1000, 4700), 4500);       // asleep 79 %: the JavaScript samples are where it was
    ok(big.fo.verdict === LH.V.js && sl.fo.verdict === LH.V.blocked && /where it was \(3 samples\)/.test(sl.line),
      'law B: the window\'s larger part names the hold whatever the count of samples (2 asleep samples never name an 83 % on-CPU hold; 2 JavaScript samples are «where it was» in a 79 % asleep one)', { big: big.line, sl: sl.line });
  }
  // ROUND 5 — the smaller items' words: (1) the unseen road with the watchdog on time; (2) a window two holds share; (3) stat R
  // with no covering window is «running or waiting for a CPU», never «on the CPU» as a fact
  {
    const dW = win0 => LH.schedDelta(R(60000, { ut: 0, st: 0, run: 0, wait: 0 }), R(60000 + win0, { ut: 240, st: 0, run: 2400, wait: 0 }));
    const onTime = LH.holdLine({ from: 0, to: 900, ms: 900, msHi: 1150, unsampled: LH.unseenWhy({ starvedMs: 0 }), d: null });
    const starved = LH.holdLine({ from: 0, to: 900, ms: 900, msHi: 1150, unsampled: LH.unseenWhy({ starvedMs: 1500 }), d: null, starvedMs: 1500 });
    ok(/not sampled \(the watchdog ran on time, but none of its checks came after the hold’s first second — it asks only from then\)/.test(onTime) && !/was not running either/.test(onTime) && /not sampled \(the watchdog was not running either\)/.test(starved),
      '(smaller 1) a hold the watchdog did not watch: on time ⇒ none of its checks came after the first second; ≥ 1 s late ⇒ it was not running either', { onTime, starved });
    const sh = dW(4200); sh.shared = 2;
    const shared = LH.holdLine({ from: 0, to: 1200, ms: 1200, unsampled: 'between', d: sh }), alone = LH.holdLine({ from: 0, to: 1200, ms: 1200, unsampled: 'between', d: dW(4200) });
    ok(/ran 2\.4 s of the 4\.2 s measured \(user 2\.4, kernel 0\.0\) \(one window for the 2 holds the watchdog slept through — these numbers are theirs together\)/.test(shared) && !/one window for/.test(alone),
      '(smaller 2) two holds inside one long watchdog sleep: the window they share is said on each line', { shared });
    const J = LH.judgeAsks([{ postedAt: 100, answeredAt: 400, state: 'running', answer: null, beat: null }], { beat0: 1, holdEnd: 2000, windowed: false });
    const nw = LH.holdLine({ from: 0, to: 2000, ms: 1800, msHi: 2000, samples: J.samples, outside: J.outside, d: null });
    const Jw = LH.judgeAsks([{ postedAt: 100, answeredAt: 400, state: 'running', answer: null, beat: null }], { beat0: 1, holdEnd: 2000 });
    ok(J.samples[0].cls === 'runnable' && / — not in JavaScript when asked \(running or waiting for a CPU\): /.test(nw) && !/on the CPU, not in JavaScript/.test(nw) && Jw.samples[0].cls === 'native',
      '(smaller 3) stat R, a late answer, NO covering window ⇒ «running or waiting for a CPU, not in JavaScript» — never «on the CPU» as a fact; with a window: native as before', { nw });
  }
  // ROUND 5 (smaller 6): a profile row keeps its FUNCTION in front when its path is cut; rows that still meet are numbered
  {
    const tail = '/node_modules/' + 'deep/'.repeat(80) + 'dist/index.js:1';
    const by = {}, names = {};
    for (let i = 0; i < 50; i++) { const k = `/p${i}` + tail + `:${i}`; by[k] = 100 - i; names[k] = `handler${i} (${k.slice(1)})`; }
    by['/q' + tail + ':0'] = 1; names['/q' + tail + ':0'] = `handler0 (q${tail}:0)`;   // the same function name, another location with the same tail
    const f = LH.foldProfileBy(by, names, 60), ws = Object.values(f.names);
    ok(ws.length === 51 && new Set(ws).size === 51 && ws.filter((w) => /^handler\d+ \(…/.test(w)).length === 50 && ws.some((w) => /^\(#2\) handler0 \(…/.test(w)) && ws.every((w) => w.length <= 300),
      `(smaller 6) 51 frames whose long paths share a tail: 51 distinct rows, each with its FUNCTION in front («${ws[0].slice(0, 40)}…»), the one that still met numbered`, ws.slice(0, 3));
  }
  // THE FOLLOW-UP (round 5's accepted verdict, minors 1–3): the parts' shares over the HOLD's span; the unseen road says how
  // late the watchdog was; parts that interleave are said as such
  {
    const win2 = (ran, wall) => LH.schedDelta(R(70000, { ut: 0, st: 0, run: 0, wait: 0 }), R(70000 + wall, { ut: ran / 10, st: 0, run: ran, wait: 0 }));
    const Sx = (cls, at) => cls === 'js' ? { cls, kind: 'js', words: 'busyHog (src/hogs.js:2)', key: 'src/hogs.js:2', keyWords: 'busyHog (src/hogs.js:2)', at } : { cls, kind: 'none', words: 'asleep: hrtimer_nanosleep in clock_nanosleep', key: '(asleep)', keyWords: '(asleep)', at };
    const Lx = (samples, d, ms, msHi) => { const h = { from: 70000, to: 70000 + msHi, fromM: 70000, toM: 70000 + msHi, ms, msHi, samples, d }; return { line: LH.holdLine(h), fo: LH.foldHold(h) }; };
    // (1) a 2.0 s JavaScript hog with 0.42 s of naps inside a 2.42 s hold, the window measuring 2.9 s around it
    const m1 = Lx([Sx('js', 70300), Sx('kernel', 71500), Sx('js', 71900)], win2(2000, 2900), 2170, 2420);
    ok(m1.fo.verdict === LH.V.js && !/, then /.test(m1.line), `minor 1: a 2.0 s hog with 0.42 s of naps in a 2.42 s hold (window 2.9 s) is JavaScript — its naps are no REAL part over the hold's own span (round 5 said «then in the kernel (blocked) for 0.8 s» 3 of 16 times)`, m1.line);
    // (2) the unseen road with the watchdog 0.65 s late — under its 1 s starved bar — says so
    const late = LH.holdLine({ from: 0, to: 1100, ms: 900, msHi: 1150, unsampled: LH.unseenWhy({ starvedMs: 650 }), unseenLateMs: 650, d: null });
    const onTime = LH.holdLine({ from: 0, to: 1100, ms: 900, msHi: 1150, unsampled: LH.unseenWhy({ starvedMs: 40 }), unseenLateMs: 40, d: null });
    ok(/not sampled \(the watchdog ran 0\.7 s late \(under the 1 s it calls starved\), and none of its checks came after/.test(late) && !/ran on time/.test(late) && /the watchdog ran on time/.test(onTime),
      'minor 2: the unseen road with the watchdog 0.65 s late says how late (round 5 said «on time»); 40 ms late is on time', { late, onTime });
    // (3) JavaScript, asleep, JavaScript — two real parts that INTERLEAVE: both named, «interleaved», never one «then»
    const m3 = Lx([Sx('js', 70300), Sx('kernel', 71800), Sx('js', 73400)], win2(2100, 4700), 4300, 4500);
    ok(/ — JavaScript for 2\.1 s and in the kernel \(blocked\) for 2\.4 s, interleaved: /.test(m3.line), `minor 3: JavaScript, asleep, JavaScript — said as two parts, interleaved (${m3.line.slice(m3.line.indexOf(' — ') + 3, m3.line.indexOf(' — ') + 90)})`, m3.line);
  }
  // ROUND 5 (law A): AN ASK THE SAMPLER WITHDREW IS NOT A SAMPLE — a stand-down answer (a debugger opened, an accessor on
  // Error.prepareStackTrace) and, in a hold during which the sampler stood down, an ask with no answer say nothing about
  // the thread: never «running, no fast answer» ⇒ native. The hold is «not sampled (why)» unless ANOTHER ask was answered.
  {
    const posted = (i, o = {}) => ({ postedAt: FROM + 500 + i * 200, answeredAt: null, state: 'running', answer: null, beat: null, ...o });
    const lineOf = (asks, standDown, why) => { const J = LH.judgeAsks(asks, { beat0: BEAT0, holdEnd: TO, standDown });
      const h = { from: FROM, to: TO, fromM: FROM, toM: TO, ms: W - 250, msHi: W, samples: J.samples, outside: J.outside, after: null, d: WINDOW.covers(SCHED.user[0]), unsampled: J.samples.length ? null : why, standDown: J.samples.length ? standDown : null };
      return { J, line: LH.holdLine(h), fo: LH.foldHold(h) }; };
    const w1 = lineOf([posted(0, { withdrawn: true })], 'debugger', 'debugger');                       // the one ask came back as a stand-down
    const w2 = lineOf([posted(0), posted(1, { withdrawn: true })], 'debugger', 'debugger');          // one in flight, then a debugger by SIGUSR1
    const w3 = lineOf([posted(0)], 'accessor', 'accessor');                                          // an accessor: the ask unanswered
    const real = lineOf([posted(0, { answeredAt: FROM + 500.3, answer: FRAMES, beat: BEAT0 }), posted(1, { withdrawn: true })], 'debugger', 'debugger');
    const noStand = lineOf([posted(0)], null, null);                                                 // no stand-down: the round-4 law stands
    ok(w1.J.samples.length === 0 && w1.J.outside.withdrawn === 1 && /not sampled \(a debugger is attached\)/.test(w1.line) && !w1.line.includes(LH.V.native) && !w1.line.includes('on the CPU, not in JavaScript') && w1.fo.verdict !== LH.V.native
      && w2.J.samples.length === 0 && w2.J.outside.withdrawn === 2 && /not sampled \(a debugger is attached\)/.test(w2.line)
      && w3.J.samples.length === 0 && /not sampled \(Error\.prepareStackTrace is an accessor/.test(w3.line) && !w3.line.includes(LH.V.native) && w3.fo.verdict !== LH.V.native,
      `law A (round 5): an ask the sampler withdrew — a stand-down answer, or no answer in a hold it stood down in — is no sample: «${w1.line.split(': ').slice(1).join(': ').slice(0, 160)}»`, { w1: w1.line, w2: w2.line, w3: w3.line });
    ok(real.J.samples.length === 1 && real.J.samples[0].cls === 'js' && real.J.outside.withdrawn === 1 && /1 sample: busyHog/.test(real.line) && /then a debugger is attached: the sampler stood down/.test(real.line)
      && noStand.J.samples.length === 1 && noStand.J.samples[0].cls === 'native',
      'law A: ANOTHER ask of the same hold that was really answered samples it (the withdrawn one is still no sample); with no stand-down an unanswered ask on the CPU is native as before', { real: real.line, noStand: noStand.J.samples });
  }
  const late = LH.askOf({ postedAt: 100, answeredAt: 140, state: 'running', answer: FRAMES, beat: BEAT0, beat0: BEAT0, holdEnd: 2000 });
  const lateOut = LH.askOf({ postedAt: 100, answeredAt: 2100, state: 'running', answer: FRAMES, beat: BEAT0 + 1, beat0: BEAT0, holdEnd: 2000 });
  ok(late.cls === 'native' && late.after && late.after.words === 'busyHog (src/hogs.js:2)' && lateOut.cls === 'native' && lateOut.after === null,
    'a late answer that ran BEFORE the loop turned is «the first JavaScript after it» (the held code\'s own continuation); one that ran after the loop turned names nothing', [late, lateOut]);
  ok(LH.landedOf({ beat: 7, beat0: 7 }) === 'inside' && LH.landedOf({ beat: -1, beat0: 7 }) === 'end' && LH.landedOf({ beat: 8, beat0: 7 }) === 'after' && LH.END_MS === undefined, 'landedOf has no END_MS margin any more (the beat count alone)');
  ok(LH.stateOf('4242 (node) R 1 2 3') === 'running' && LH.stateOf('4242 (no de) )) S 1') === 'asleep' && LH.stateOf('1 (x) D 1') === 'asleep' && LH.stateOf('1 (x) T 1') === 'stopped' && LH.stateOf('1 (x) t 1') === 'stopped' && LH.stateOf('1 (x) Z 1') === 'unknown' && LH.stateOf(null) === 'unknown',
    'stateOf: the letter after the command\'s LAST closing paren (a command may hold parens and spaces)');
}
// ── ⑧ round 3 (9): THE PHANTOM-HOLD RULE, PURE — a hold the watchdog could not watch is the MAIN thread's gap's alone ──────
console.log('⑧ round 3 — the rule for a hold nobody watched (the main thread\'s own gap; never the watchdog\'s lateness)');
{
  const U = (mainGap, late) => LH.isUnseenHold({ mainGap, late, beatMs: 250, holdMs: 1000 });
  const table = [[21, 1600, false, 'the round-1 repro: the watchdog alone blocked 1.6 s, the loop beat every 20 ms'], [251, 60000, false, 'a watchdog stopped a minute, the loop fresh'], [1124, 5000, false, 'a gap one ms short of hold + half a beat (round 4: the ONE bar — the middle of [gap − beat, gap])'],
    [1125, 0, true, 'a gap of hold + half a beat, the watchdog punctual'], [3000, 3000, true, 'the whole process stopped 3 s (both late)'], [NaN, 2000, false, 'no gap read']];
  const got = table.map(([g, l]) => U(g, l));
  ok(LH.isHoldOf({ lo: 1000 }) && !LH.isHoldOf({ lo: 999 }) && LH.isHoldOf({ lo: 900, hi: 1100 }) && !LH.isHoldOf({ lo: 899, hi: 1100 }) && LH.isGapHold(1125) && !LH.isGapHold(1124) && !LH.isGapHold(NaN),
    'round 4 — ONE bar for a hold, watched or not (and for what enters the main thread\'s ring): the middle of its range reaches HOLD_MS; a known length (the boot) is its own middle');
  ok(table.every(([, , want], i) => got[i] === want), `the predicate's table: ${table.map(([g, l, w, why]) => `${why} (gap ${g}, late ${l}) ⇒ ${w}`).join('; ')}`, got);
  const roundOne = (mainGap, late) => late >= 1000 - 250;   // the rule round 2 removed — RED against the table's first row
  ok(roundOne(21, 1600) === true && U(21, 1600) === false, 'the round-1 rule (the watchdog\'s own lateness) would invent the first row\'s hold; the predicate does not');
}
// ── ⑨ round 3 (4, 5): a profile's result is bounded by construction; ONE table of words for why it stopped ────────────
console.log('⑨ round 3 — the profile\'s result always fits, its shares sum to 100 %, one sentence per cause');
{
  const by = {}, names = {};
  for (let i = 0; i < 5000; i++) { const k = 'node_modules/' + 'a-long-package-folder/'.repeat(12) + `m${i}.js:${i + 1}`; by[k] = 1 + (i % 4); names[k] = `fn${i} (${k})`; }
  const js = Object.values(by).reduce((a, b) => a + b, 0), f = LH.foldProfileBy(by, names);
  const r = { startedAt: 0, endedAt: 600000, samples: js + 300, idle: 200, between: 40, noJs: 50, unsampled: 10, js, by: f.by, names: f.names, other: f.other, locations: f.locations };
  const bytes = new TextEncoder().encode(JSON.stringify(r)).length, p = LH.profileOf(r);
  const sum = Math.round(10 * (p.idlePct + p.betweenPct + p.noJsPct + p.notSampledPct + p.top.reduce((a, x) => a + x.pct, 0))) / 10;
  ok(Object.keys(f.by).length === LH.PROFILE_KEEP && f.locations === 5000 && bytes < 64 * 1024 && sum === 100 && p.top[p.top.length - 1].frame === '(other)' && p.top.length === LH.PROFILE_TOP + 1 && p.locations === 5000,
    `5 000 distinct frame locations with long paths ⇒ a result of ${bytes} bytes (< the 64 KB slot), the top ${LH.PROFILE_TOP} + one «(other)» row, every share summing to ${sum} %`);
  const small = LH.profileOf({ startedAt: 0, endedAt: 3000, samples: 3, idle: 1, js: 2, by: { 'src/a.js:1': 2 }, names: {} });
  ok(small.idlePct + small.jsPct === 100 && !small.top.some((x) => x.other), 'a small profile has no «(other)» row and still sums to 100 %');
  const causes = Object.keys(LH.PROFILE_STOPPED), words = causes.map((c) => LH.profileOf({ startedAt: 0, endedAt: 1, samples: 1, idle: 1, stopped: c }).stoppedWords);
  ok(causes.length >= 6 && new Set(words).size === causes.length && words.every((w, i) => w === LH.PROFILE_STOPPED[causes[i]]) && words.every((w, i) => i === causes.indexOf('heap') || !/memory/.test(w)),
    `ONE sentence per cause (${causes.join(', ')}), each its own — a debugger, the setting off, a lost watchdog are never «memory»`, words);
  ok(LH.profileOf({ samples: 1, idle: 1, stopped: 'a-cause-from-a-newer-server' }).stoppedWords === LH.PROFILE_STOPPED_ANY && LH.PROFILE_STOPPED_ANY === 'It stopped early.', 'a cause the table does not know ⇒ the neutral sentence, never another cause\'s');
  const dl = LH.profileLine(LH.profileOf({ startedAt: 0, endedAt: 4000, samples: 4, idle: 4, stopped: 'debugger' }));
  ok(dl.endsWith(' — ' + LH.PROFILE_STOPPED.debugger), 'the journal line says the SAME sentence the Diagnostics paragraph shows', dl);
  const acc = LH.profileOf({ startedAt: 0, endedAt: 4000, samples: 4, unsampled: 4, unsampledWhy: 'accessor' });
  ok(acc.notSampledPct === 100 && acc.notSampledWords === LH.PROFILE_UNSAMPLED.accessor && LH.profileLine(acc).includes(LH.PROFILE_UNSAMPLED.accessor), 'a profile stood down by an accessor: «not sampled 100 %» and WHY');
  const fs = await import('node:fs');
  const SF = fs.readFileSync(path.join(REPO, 'src/lib/setup-flows.js'), 'utf8');
  const sec = SF.slice(SF.indexOf("const pf = lh.profile || {};"), SF.indexOf("One sample a second; a sample that does not answer within 50 ms"));
  ok(sec.includes("t(l.stoppedWords || 'It stopped early.')") && !/memory neared/.test(sec) && sec.includes('not sampled {ns} %') && sec.includes("t(l.notSampledWords ||"),
    'Diagnostics (src/lib/setup-flows.js) words a stop with the server\'s sentence for ITS cause (neutral when none), never a fixed «memory» sentence, and shows the «not sampled» share with why');
}

// ── ⑪ ROUND 4 — the smaller items, PURE / in process ──────────────────────────────────────────────────────────────────
console.log('⑪ round 4 — the smaller items');
{
  // (7) the last profile's state is the TABLE's sentence (three languages by i18n-check's key table), never the raw token
  const toks = ['heap', 'off', 'debugger', 'unknown', 'inspector', 'lost'];
  const said = toks.map((k) => LH.profileOf({ refused: k, startedAt: 1, endedAt: 1 }).refusedWords);
  ok(said.every((w, i) => typeof w === 'string' && w.endsWith('.') && !w.includes(`(${toks[i]})`) && w === LH.PROFILE_REFUSED[toks[i]]) && /ran until the server’s watchdog thread stopped/.test(LH.PROFILE_REFUSED.lost) && !/did not run/.test(LH.PROFILE_REFUSED.lost)
    && LH.profileOf({ refused: 'something-new', startedAt: 1, endedAt: 1 }).refusedWords === LH.PROFILE_REFUSED_ANY,
    '(7) every way the last profile did not run is the table\'s sentence; «lost» RAN until its watchdog stopped; a cause the table does not know is the neutral sentence', said);
  const sf = fs.readFileSync(path.join(REPO, 'src/lib/setup-flows.js'), 'utf8');
  ok(/t\(l\.refusedWords \|\| 'The last profile did not run\.'\)/.test(sf) && !/The last profile did not run \(\{why\}\)/.test(sf) && /no_inspector: t\('The profile did not start: this server’s Node has no inspector\.'\)/.test(sf),
    '(7) the window draws the sentence (no «({why})» token), and the press names a Node without an inspector');
  // (7) the press rules, in process: no watchdog ⇒ refused before «running»; then the inspector, the setting, the switch, a debugger, the heap
  const LB = require(path.join(REPO, 'src/server/loop-holds.js'));
  const press = (st, o = {}) => { const b = LB.create({ log: { warn() {}, log() {} }, samplingState: () => st, askProfile: o.noAsk ? null : () => {}, heap: () => o.heap || { heapUsed: 1, heapLimit: 100, external: 0 }, debuggerNow: () => !!o.dbg, eluEveryMs: 1e9 }); try { return b.startProfile(1000); } finally { try { b.stop(); } catch { } } };
  const P = [press({ watchdog: false }), press({ known: false }), press({ known: true, on: false }), press({ known: true, on: true }, { dbg: true }), press({ known: true, on: true }, { heap: { heapUsed: 90, heapLimit: 100, external: 0 } }), press({ known: true, on: true }, { noAsk: true }), press({ known: true, on: true })];
  ok(P.map((r) => r.error || (r.ok ? 'ok' : '?')).join() === 'no_watchdog,setting_unknown,sampling_off,debugger_attached,heap_near_limit,no_watchdog,ok',
    '(10) the press rules: a dead watchdog, the setting unread, the switch off, a debugger, the heap — each refused BY NAME at the press; a live one runs', P.map((r) => r.error || r.ok));
  // (5) a sample that THREW: «deep recursion» only for a full stack — any other error by its own class (round 3: every throw was «deep recursion»)
  const T = (o) => LH.thrownOf(o);
  ok(T({ className: 'RangeError' }).deep === true && T({ description: 'RangeError: Maximum call stack size exceeded' }).deep === true && T({ text: 'Uncaught RangeError: Maximum call stack size exceeded' }).deep === true
    && T({ className: 'TypeError', description: 'TypeError: x is not a function' }).words === 'the sample could not run (TypeError)' && !T({ className: 'TypeError' }).deep
    && T({ className: 'Weird Class <script>' }).words === 'the sample could not run (an error)' && T({ err: new Error('x') }).words === 'the sample could not run (the session refused it)',
    '(5) a sample that threw says «the stack was nearly full (deep recursion)» only when it was; another error is «the sample could not run (<its class>)» — the class a plain word, else «an error»');
  ok(LH.askOf({ postedAt: 0, answeredAt: 0.4, state: 'running', answer: T({ className: 'TypeError' }), beat: 1, beat0: 1, holdEnd: 9 }).cls === 'js' && LH.askOf({ postedAt: 0, answeredAt: 30, state: 'running', answer: T({ className: 'TypeError' }), beat: 1, beat0: 1, holdEnd: 99 }).after === null,
    '(5) a sample that could not run answered at JavaScript speed WAS in JavaScript; late, it names no «after» frame');
  // (4) OFF MID-HOLD: the switch and a debugger re-read at every step of a live hold
  ok(LH.stepRefusalOf(1 | 8) === null && LH.stepRefusalOf(8) === 'off' && LH.stepRefusalOf(1 | 2 | 8) === 'debugger' && LH.stepRefusalOf(1) === 'unknown'
    && /const why = LH\.stepRefusalOf\(Atomics\.load\(I, 6\)\);/.test(fs.readFileSync(path.join(REPO, 'src/server/sync-fs-witness-worker.js'), 'utf8').slice(fs.readFileSync(path.join(REPO, 'src/server/sync-fs-witness-worker.js'), 'utf8').indexOf('function stepHold')).slice(0, 600)),
    '(4) a live hold asks again only while sampling is on, known, and no debugger is attached — re-read at EVERY step (stepHold)');
  // (8) a long profile key is cut keeping its TAIL (its file and line) — two locations never merge into one row
  const long = (x) => 'node_modules/' + x.repeat(400) + '/index.js:';
  const fp = LH.foldProfileBy({ [long('a') + '1']: 5, [long('a') + '2']: 3, [long('b') + '1']: 2 }, {});
  const fk = Object.keys(fp.by);
  ok(fk.length === 3 && fk.every((k) => k.length <= LH.PROFILE_WORD_MAX) && fk.some((k) => k.endsWith('/index.js:1')) && fk.some((k) => k.endsWith('/index.js:2')) && Object.values(fp.by).join() === '5,3,2',
    '(8) profile keys longer than 300 characters: cut keeping the tail (the file and its line), each location its own row', fk.map((k) => k.slice(-14)));
  // (9) the name roads: a name only inside a string or a comment on the function's own line is not spelled there; a
  //     node: frame keeps its name only for one of Node's own loaded modules
  ok(LH.spelledIn('function busyHog(ms) {', 'busyHog') && !LH.spelledIn("const f = load('busyHog'); // busyHog", 'busyHog') && !LH.spelledIn('/* busyHog */ return x;', 'busyHog') && !LH.spelledIn('const t = `busyHog`;', 'busyHog') && LH.spelledIn("o['k'] = function busyHog() {", 'busyHog'),
    '(9) a token inside a string, a template or a comment on the enclosing line spells nothing; outside them it does');
  const known = (id) => id === 'internal/timers';
  ok(LH.frameOf({ fn: 'listOnTimeout', file: 'node:internal/timers', line: 581 }, '/r', null, null, known).fn === 'listOnTimeout' && LH.frameOf({ fn: 'stealMe', file: 'node:internal/forged', line: 3 }, '/r', null, null, known).fn === null
    && LH.frameText(LH.frameOf({ fn: 'stealMe', file: 'node:internal/forged', line: 3 }, '/r', null, null, known)) === 'node:internal/forged:3',
    '(9) a vm script named «node:…» is not one of Node\'s loaded modules: said by its location alone, never with its name');
  ok(LH.frameOf({ fn: 'f', file: '/r/src/x.js', line: 3, encl: 3 }, '/r', () => LH.UNREAD, null).unread === true && LH.frameText(LH.frameOf({ fn: 'f', file: '/r/src/x.js', line: 3, encl: 3 }, '/r', null, () => LH.UNREAD)) === 'src/x.js:3',
    'MUST 2: a frame whose file or line was NOT read (the budget spent, the sources slow) is said by its location alone — never «outside the repo», never a name');
  ok(LH.holdLine({ from: 0, ms: 1500, d: null, samples: [{ cls: 'js', kind: 'js', words: 'src/x.js:3', key: 'src/x.js:3' }], namesUnread: { n: 2, why: 'slow' } }).includes('the frames of 2 source files said by location alone (the source files answered slowly — names are not read for ten minutes)'),
    'MUST 2: the line says how many files\' frames were left by location and why');
  // (10) THE MONOTONIC CLOCKS — every length on both threads from process.hrtime (one clock, never the wall's)
  const W0 = fs.readFileSync(path.join(REPO, 'src/server/sync-fs-witness-worker.js'), 'utf8'), M0 = fs.readFileSync(path.join(REPO, 'src/server/sync-fs-witness.js'), 'utf8'), B0 = fs.readFileSync(path.join(REPO, 'src/server/loop-holds.js'), 'utf8');
  const monoRe = /const mono = \(\) => \{ const t = process\.hrtime\(\); return t\[0\] \* 1e3 \+ t\[1\] \/ 1e6; \};/;
  ok([W0, M0, B0].every((t) => monoRe.test(t)) && !/const mono = \(\) => Date\.now/.test(W0 + M0 + B0) && /now = mono,/.test(B0),
    '(10) the monotonic clock is spelled once per thread as process.hrtime (the watchdog, the main thread\'s beat, the book) — the mutant «mono = Date.now» is red here, not only in the heavy suite');
  // (10) THE EXACT-100.0 SHARE LAW — largest remainder (Math.round would give 99.9 / 100.1 here)
  const sum10 = (a) => Math.round(a.reduce((x, y) => x + y, 0) * 10);
  const cases = [[1, 1, 1], [1, 1, 1, 1, 1, 1, 1], [2, 2, 2, 3], [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], [333, 333, 334], [1, 0, 0, 0]];
  ok(cases.every((c) => sum10(LH.sharesOf(c)) === 1000) && cases.some((c) => Math.round(c.map((x) => Math.round(1000 * x / c.reduce((a, b) => a + b, 0))).reduce((a, b) => a + b, 0)) !== 1000) && JSON.stringify(LH.sharesOf([1, 1, 1])) === '[33.4,33.3,33.3]',
    '(10) the shares sum to EXACTLY 100.0 in every case — and plain rounding would not (the control is in the same cases)', cases.map((c) => LH.sharesOf(c)));
}

// (3) THE HEAP THAT FILLS — the old generation against its own limit (numbers measured on this box's Node 22 and 24)
{
  const MiB = 1048576, sp = (young) => [{ space_name: 'new_space', space_used_size: young * MiB }, { space_name: 'old_space', space_used_size: 1 }];
  const F = (limitMb, usedMb, argv, major, young = 0) => LH.heapFillOf({ stats: { heap_size_limit: limitMb * MiB, used_heap_size: usedMb * MiB }, spaces: sp(young), argv, nodeMajor: major });
  const rows = [[F(288, 82, ['--max-old-space-size=96'], 24), 96, true], [F(144, 82, ['--max-old-space-size=96'], 22), 96, true], [F(288, 80, ['--max-old-space-size=96'], 24), 96, false],
    [F(4288, 3500, [], 24), 4096, true], [F(4144, 3400, [], 22), 4096, false], [F(108, 83, ['--max-semi-space-size=4'], 24), 96, true], [F(288, 86, ['--max_old_space_size', '96'], 24, 4), 96, true],
    [F(288, 85, ['--max-old-space-size=200', '--max-old-space-size=96'], 24, 5), 96, false]];
  ok(rows.every(([f, lim, hi]) => Math.round(f.limit / MiB) === lim && f.high === hi),
    '(3) the bound is the OLD generation\'s: the stated --max-old-space-size (Node 24: heap_size_limit 288 MB of which 192 MB is the young reserve; Node 22: 144 MB, 48 MB), else the limit less three semi-spaces; the young generation\'s use is not the old\'s; a later flag wins', rows.map(([f]) => [Math.round(f.limit / MiB), Math.round(f.used / MiB), f.high]));
  const v8 = require('v8'), real = LH.heapFillOf({ stats: v8.getHeapStatistics(), spaces: v8.getHeapSpaceStatistics(), argv: LH.nodeArgv(), nodeMajor: Number(process.versions.node.split('.')[0]) });
  ok(real.limit > 0 && real.limit < v8.getHeapStatistics().heap_size_limit && real.used > 0 && real.used < v8.getHeapStatistics().used_heap_size + 1 && real.high === false,
    `(3) with this process's REAL heap statistics: the old generation's limit ${Math.round(real.limit / MiB)} MB of a heap_size_limit of ${Math.round(v8.getHeapStatistics().heap_size_limit / MiB)} MB, ${Math.round(real.used / MiB)} MB of it used`);
}

// ROUND 5 (smaller 4): THE MONOTONIC CLOCK BY BEHAVIOUR — the witness made with its DEFAULTS (its `now`, its thread), a REAL
// 300 ms hold of this thread with the date stepped +1 h inside it: ONE hold, its range containing the truth, sampled
// («JavaScript») — a witness timing the main thread by the date would read it «not sampled» or as an hour (the mutant
// «now = Date.now» kept the textual pin above green)
console.log('⑫ round 5 — the monotonic clock, by behaviour (a date step inside a real hold)');
{
  const SFW = require(path.join(REPO, 'src/server/sync-fs-witness.js'));
  const said = [];
  const W = SFW.create({ rootDir: REPO, armed: true, readMountinfo: () => '', fresh: true, beatMs: 20, holdMs: 100, noAnswerMs: 50, liveMs: 60000, capPerHour: 20,
    log: { warn: (l) => said.push(String(l)), log() {}, error() {}, info() {} }, holdsOptions: { eluEveryMs: 50, eluBeforeMs: 500 } }).start({ installHook: false });
  await new Promise((r) => setTimeout(r, 800));   // the watchdog's thread up, its first checks done
  const realNow = Date.now; let truth = 0;
  try {
    const m0 = performance.now(); let stepped = false;
    while (performance.now() - m0 < 300) { if (!stepped && performance.now() - m0 >= 150) { const r0 = realNow; Date.now = () => r0() + 3600000; stepped = true; } }
    truth = performance.now() - m0;
    await new Promise((r) => setTimeout(r, 900));
  } finally { Date.now = realNow; }
  const rep = W.holds().report(); try { W.stop(); } catch { }
  const hs = (rep.holds || []).filter((h) => h.ms >= 100);
  const h = hs[0];
  ok(hs.length === 1 && h && h.ms <= truth + 1 && (h.msHi || h.ms) + 40 >= truth && (h.msHi || h.ms) < 3 * truth && h.verdict === LH.V.js,
    `⑫ a real ${truth.toFixed(0)} ms hold with the date stepped +1 h inside it, the witness with its default clock: ONE hold of ${h && h.ms}–${h && h.msHi} ms (the truth inside), «${h && h.verdict}»`, { holds: (rep.holds || []).map((x) => [x.ms, x.msHi, x.verdict, x.line]) });
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);

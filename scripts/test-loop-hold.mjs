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
import vm from 'node:vm';
import { anchored } from './scratch.mjs';

const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const require = createRequire(import.meta.url);
const LH = require(path.join(REPO, 'src/loop-hold.js'));
const MC = require(path.join(REPO, 'src/memory-census.js'));
let pass = 0, fail = 0;
const ok = (c, n, d) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (d !== undefined ? ' — ' + JSON.stringify(d) : '')); } };
// B-0d3e: a red control's product edit, its anchor judged BY NAME — any count but one (for 'all' / 'join' / 'first' or a /g
// anchor: none) is a red row of this suite's own check naming the anchor and the file; the copy is then built as before (nothing
// crashes). 'first' = an anchor the product holds more than once today: the first one is patched, as it always was
function editAnchor(text, from, to, file, mode = 'one') {
  const t = String(text), re = from instanceof RegExp, many = mode !== 'one' || (re && from.global);
  const n = re ? [...t.matchAll(new RegExp(from.source, from.flags.replace(/[gy]/g, '') + 'g'))].length : t.split(String(from)).length - 1;
  if (many ? n === 0 : n !== 1) { const shown = re ? String(from) : JSON.stringify(String(from)).slice(0, 100); ok(false, `ANCHOR (${file}): ${shown} — found ${n} times, ${many ? 'at least one' : 'one'} meant: the copy is not the control it says`); }
  return mode === 'join' ? t.split(from).join(to) : mode === 'all' ? t.replaceAll(from, to) : t.replace(from, to);
}
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
  // B-1409 (主开发 18:12Z): «waiting for a CPU» names a hold only when the wait is its LARGER part — a hold of 1.2 s that ran
  // JavaScript 0.9 s and waited 0.3 s is named by its function, the wait beside it; one that waited 0.9 s of 1.2 s is
  // «waiting for a CPU»; an ask whose stat read said asleep and whose syscall read said running says so, never «asleep: on the CPU»
  { const fn = 'parseHog (src/hogs.js:25)', js = [...Array(3)].map(() => ({ kind: 'js', words: `${fn} ← tick (src/server/y.js:52)`, key: fn }));
    const mixed = LH.holdLine({ from: at0, to: at0 + 1200, ms: 1200, d: LH.schedDelta(R(at0, { ut: 0, st: 0, run: 0, wait: 0 }), R(at0 + 1200, { ut: 90, st: 0, run: 900, wait: 300 })), samples: js });
    const starved = LH.holdLine({ from: at0, to: at0 + 1200, ms: 1200, d: LH.schedDelta(R(at0, { ut: 0, st: 0, run: 0, wait: 0 }), R(at0 + 1200, { ut: 30, st: 0, run: 300, wait: 900 })), samples: js.slice(0, 1) });
    ok(/^\[loop-hold\] the main loop was held 1\.2 s — JavaScript; it also waited 0\.3 s for a CPU: /.test(mixed) && mixed.includes(fn) && !/— waiting for a CPU/.test(mixed),
      'B-1409: a hold of 1.2 s that ran JavaScript 0.9 s and waited 0.3 s is named by its FUNCTION, with «it also waited 0.3 s for a CPU» beside it', mixed);
    ok(/^\[loop-hold\] the main loop was held 1\.2 s — waiting for a CPU: /.test(starved) && !/it also waited/.test(starved), 'B-1409: a hold that waited 0.9 s of 1.2 s is «waiting for a CPU» (the wait is its larger part)', starved);
    const woke = LH.askOf({ state: 'asleep', kernel: LH.RUNNING_KERNEL_WORDS }), asleep = LH.askOf({ state: 'asleep', kernel: 'futex_wait_queue in futex' });
    ok(woke.words === 'asleep at the ask, on the CPU a moment later' && !/asleep: on the CPU/.test(woke.words) && asleep.words === 'asleep: futex_wait_queue in futex',
      'B-1409: an ask whose stat read said asleep and whose syscall read, a moment later, said running says «asleep at the ask, on the CPU a moment later» — never «asleep: on the CPU»', { woke, asleep }); }
  const boot = LH.holdLine({ boot: true, from: 0, to: 69591, ms: 69591, samples: [{ kind: 'js', words: 'restoreSessions (server.js:1760)', key: 'restoreSessions (server.js:1760)' }], d: null });
  ok(boot.startsWith('[loop-hold] the boot held the main loop 69.6 s before its first turn — JavaScript: 1 sample: restoreSessions (server.js:1760) ×1'), 'the boot\'s own words', boot);
  for (const [why, words] of [['off', 'sampling is off in Settings'], ['debugger', 'a debugger is attached'], ['heap', 'the heap is above 85 % of its limit'], ['inspector', 'this Node has no inspector']]) {
    const l = LH.holdLine({ from: 0, to: 2000, ms: 2000, unsampled: why, d: LH.schedDelta(R(at0, { ut: 0, st: 0, run: 0, wait: 0 }), R(at0 + 2000, { ut: 190, st: 5, run: 1950, wait: 0 })) });
    ok(l.includes(`not sampled (${words})`) && /ran \d\.\d s of the 2\.0 s measured \(user/.test(l) && / — on the CPU in user mode — JavaScript or native code, not sampled: /.test(l), `unsampled (${why}): said, law A's numbers still printed, and the VERDICT says it was not sampled — never «native»`, l);
  }
  // THE INSTRUMENT IS TRANSPARENT (the owner's .393 boot capture: «12.4 % · Node.js internals … — 72 % through hr ·
  // src/server/loop-blame.js:51» — 34 of its 395 samples, each under a src caller of a sync fs call): an ask posted while a
  // wrapped call slept is answered at the wrapper's first line after it; those frames name the CALLER, never the instrument
  { const ROOT = '/srv/hub', at = (fn, f, line) => ({ fn, file: f.startsWith('node:') ? f : `${ROOT}/${f}`, line, encl: line, evalish: false });
    const owner = [at('hrtimeBigInt', 'node:internal/bootstrap/node', 436), at('hr', 'src/server/loop-blame.js', 51), at('wrapped', 'src/server/loop-blame.js', 58), at('_loadArchive', 'src/jobs.js', 291), at('listOnTimeout', 'node:internal/timers', 594)];
    const hook = [at('encodeInto', 'node:internal/encoding', 360), at('liveBegin', 'src/server/sync-fs-witness.js', 139), at('before', 'src/server/sync-fs-witness.js', 161), at('wrapped', 'src/server/loop-blame.js', 58), at('readJson', 'src/harnesses/helper-transcripts.js', 22)];
    const own = [at('hr', 'src/server/loop-blame.js', 51), at('wrapped', 'src/server/loop-blame.js', 58), at('refresh', 'src/server/sync-fs-witness.js', 129), at('listOnTimeout', 'node:internal/timers', 594)];
    const plain = [at('busyHog', 'src/x.js', 38)];
    const T = typeof LH.instrumentTrim === 'function' ? LH.instrumentTrim : (x) => x;
    ok(T(owner, ROOT)[0].fn === '_loadArchive' && T(owner, ROOT).length === 2 && T(hook, ROOT)[0].fn === 'readJson' && T(own, ROOT)[0].fn === 'refresh' && T(own, ROOT).length === 2 && T(plain, ROOT) === plain,
      'the instrument\'s innermost frames (loop-blame, the witness\'s hook, the node frames among them) are dropped — the owner\'s sample lands on _loadArchive (src/jobs.js:291), a hook frame on readJson; the witness\'s OWN work (its timer, which called through the wrapper) names its own frame — refresh, never the wrapper (主开发 2026-11-18 12:20Z) — and a stack with no instrument frame is kept whole');
    const enc = (frames) => 'C' + frames.map((f) => `${f.fn.length}:${f.fn}${f.file.length}:${f.file}${f.line},${f.encl}n`).join('');
    const sm = LH.sampleOf(enc(owner), ROOT, () => true);
    ok(sm.form === 'calls' && sm.frames[0] && sm.frames[0].cls === 'repo' && sm.frames[0].file === 'src/jobs.js' && !sm.frames.some((f) => /loop-blame/.test(f.file || '')),
      `a hold's sample of that shape names its caller — «${LH.chainWords(sm.frames)}» (2.369.395: hr (src/server/loop-blame.js:51) first)`, sm.frames.slice(0, 3)); }
  // THE LOOP FIRST (the owner's «[local-index] … that disk is not answering» at the exact ends of 12.5 / 6.5 / 14 s LOOP
  // holds on a local home): the witness says how long the main loop was held in a window — its beat's gap ring + the gap open now
  { const SW = require(path.join(REPO, 'src/server/sync-fs-witness.js')), H = SW.heldWithin, o = { beatMs: 250, holdMs: 1000 };
    ok(typeof H === 'function' && H([[10000, 5000]], null, 0, 20000, o) === 4750 && H([], 15000, 0, 27000, o) === 11750 && H([[10000, 5000]], 15000, 0, 27000, o) === 16500
      && H([], 3100, 3000, 15700, o) === 12350 && H([], 15600, 3000, 15700, o) === 0 && H([[10000, 600]], null, 0, 20000, o) === 350 && H([[10000, 5000]], null, 8000, 9000, o) === 1000,
      'the main loop\'s held time in a window: a recorded gap held its gap less one beat (clipped to the window), a gap OPEN past a hold\'s size held to the window\'s end, a fresh beat holds nothing; the owner\'s 12.5 s hold under a write begun 0.1 s before it ⇒ 12.35 s');
    ok(typeof SW.loopHeldMs === 'function' && /loopHeld: \(fromM, toM = now\(\)\) => \{/.test(fs.readFileSync(path.join(REPO, 'src/server/sync-fs-witness.js'), 'utf8')), 'the boot\'s witness answers it for a wall-clock window (loopHeldMs) from the beat\'s own ring (loopHeld)'); }
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
    && LH.liveWords({ samples: [], pendingMs: 9000 }) === 'no JavaScript answered for 9.0 s (not in JavaScript)' && LH.liveWords({ unsampled: 'heap' }) === 'not sampled (the heap is above 85 % of its limit)',
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
  // second on, ≤ 7, the later ones within the hour's time budget (≤ 1 % of the main thread), none past 85 % of the heap,
  // the profile ≥ 1 s apart and refused / stopped past 85 % of the heap
  { const due = []; for (let ms = 0, k = 0; ms <= 200000; ms += 10) if (LH.sampleDue(k, ms)) { due.push(ms); k++; }
    const gaps = due.slice(1).map((x, i) => x - due[i]);
    ok(LH.HOLD_MS >= 1000 && due[0] >= 1000 && gaps.every((g) => g >= 1000) && due.length <= 7 && LH.ASK_BUDGET_MS <= 36000 && LH.PROFILE_EVERY_MS >= 1000 && LH.PROFILE_HEAP_SHARE <= 0.85,
      `the sampling rate stays within the measured safe bound (samples at ${due.map((x) => x / 1000).join(', ')} s; the later samples' budget ${LH.ASK_BUDGET_MS / 1000} s of the main thread an hour; profile every ${LH.PROFILE_EVERY_MS} ms, refused past ${LH.PROFILE_HEAP_SHARE * 100} % of the heap)`); }
  ok(LH.samplesBound(1900) === 1 && LH.samplesBound(2000) === 2 && LH.samplesBound(70000) === 7 && LH.samplesBound(300, 100) === 2 && LH.samplesBound(99, 100) === 0, 'the most samples a hold may carry under the schedule (the live suite bounds each hold by it)');
  { const big = { holds: [...Array(50)].map((_, i) => ({ at: i, line: 'x'.repeat(6000) })), table: [...Array(201)].map((_, i) => ({ verdict: 'JavaScript', frame: 'f'.repeat(1500) + i, count: 1, totalMs: 1, worstMs: 1 })) };
    const b = LH.boundReport(big, 64 * 1024), n = new TextEncoder().encode(JSON.stringify(b)).length;
    ok(n <= 64 * 1024 && b.truncated && b.truncated.maxBytes === 65536 && JSON.stringify(LH.boundReport({ holds: [], table: [] }, 1024)) === '{"holds":[],"table":[]}', `the incident bundle's share has an explicit byte bound (a 10 000-hold book: ${n} bytes ≤ 64 KB, the cut said); a small report is unchanged`); }
  // EVERY HOLD GETS ITS FIRST SAMPLE (lane hub-loop-stalls, the owner's .393 hub: 54 of 74 holds — 214 of ~300 s — «not
  // sampled (20 holds were sampled in the last hour)»): the decision of the tree as it stands (2.369.395's count, when that
  // is what it has) over 30 holds in a row a minute apart — every one sampled
  { const ON = 8 | 1, times = []; let t = 5e12, named = 0;
    const decide = (flags) => (typeof LH.holdRefusalOf === 'function' ? LH.holdRefusalOf(flags) : LH.capAllows(times, t) ? (times.push(t), null) : 'cap');
    for (let i = 0; i < 30; i++) { if (decide(ON) === null) named++; t += 60000; }
    ok(named === 30, `EVERY HOLD GETS ITS FIRST SAMPLE: 30 holds in a row a minute apart ⇒ ${named} sampled — no count stops it (2.369.395: 20, then «20 holds were sampled in the last hour»)`);
    const R = typeof LH.holdRefusalOf === 'function' ? LH.holdRefusalOf : () => null;
    ok(R(ON | 4) === 'heap' && LH.stepRefusalOf(ON | 4) === 'heap' && R(ON | 2) === 'debugger' && R(8) === 'off' && R(0) === 'unknown' && R(ON, { inspector: false }) === 'inspector' && R(ON) === null,
      'the gates that stay: the heap at ≥ 85 % of its limit refuses the first sample AND every later step, a debugger, sampling off, the setting not read, no inspector');
    const spent = [], B = LH.ASK_BUDGET_MS;
    const bOk = typeof LH.budgetAllows === 'function' && LH.budgetAllows(spent, t) && (spent.push({ at: t, ms: B - 1 }), LH.budgetAllows(spent, t + 1)) && (spent.push({ at: t + 2, ms: 2 }), !LH.budgetAllows(spent, t + 3)) && LH.budgetAllows(spent, t + 2 + 3600000 + 1) && spent.length === 0;
    ok(bOk && B === 36000, `the later samples' TIME budget: their own main-thread runs summed over the rolling hour under ${B / 1000} s (1 % of it) — past it a hold takes only its first; the window rolls`);
    const lb = LH.holdLine({ from: 0, to: 2000, ms: 2000, samples: [{ kind: 'js', words: 'busyHog (src/x.js:38)', key: 'busyHog (src/x.js:38)' }], budgetSpent: true, d: null });
    ok(lb.includes('later samples not asked: the samples used their time budget (36 s of the main thread in the hour)') && lb.includes('busyHog (src/x.js:38)'), 'a hold past the budget says its first sample AND that the later ones were not asked', lb);
    const W = fs.readFileSync(path.join(REPO, 'src/server/sync-fs-witness-worker.js'), 'utf8');
    ok(/h\.unsampled = LH\.holdRefusalOf\(flags, \{ inspector: !!inspector \}\)/.test(W) && !/capAllows/.test(W) && /if \(h\.k >= 1 && !LH\.budgetAllows\(askSpent, now, askBudgetMs\)\) \{ h\.budgetSpent = true; return; \}/.test(W) && /askSpent\.push\(\{ at: mono\(\), ms: q\.ownUs \/ 1000 \}\)/.test(W),
      'the watchdog: startHold takes the pure gates (no count), stepHold asks a LATER sample only within the budget, each answered hold ask books its own run'); }
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
    ok(/not sampled \(none of the watchdog’s checks came while it was held \(another ask was in flight, or the watchdog ran late under the 1 s it calls starved\)\)/.test(onTime) && !/was not running either/.test(onTime) && /not sampled \(the watchdog was not running either\)/.test(starved),
      '(smaller 1) a hold the watchdog did not watch: under the starved bar ⇒ none of its checks came while it was held (B-7c97: an on-time watchdog asks every counted hold — what is left is an ask in flight or a late watchdog); ≥ 1 s late ⇒ it was not running either', { onTime, starved });
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
    ok(/not sampled \(the watchdog ran 0\.7 s late \(under the 1 s it calls starved\), and none of its checks came while the hold lasted\)/.test(late) && !/ran on time/.test(late) && /none of the watchdog’s checks came while it was held/.test(onTime) && !/ran 0\.0 s late/.test(onTime),
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
  ok(LH.askOf({ postedAt: 0, answeredAt: 0.4, state: 'running', answer: T({ className: 'TypeError' }), beat: 1, beat0: 1, holdEnd: 9000 }).cls === 'js' && LH.askOf({ postedAt: 0, answeredAt: 30, state: 'running', answer: T({ className: 'TypeError' }), beat: 1, beat0: 1, holdEnd: 99 }).after === null,
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
// B-518e: what ⑫ may judge follows what the witness MEASURED of its own thread (⑫b, below). The truth (the spin's own
// performance.now span) already holds any wait inside the spin; the hold's lower bound is the beat gap less one beat, so its
// excess over the truth is the gap's time OUTSIDE the spin — a wait for a CPU there, or the main thread's own run (its
// timers, the hold's asks, a collection) — and an ask that lands while the thread waits reads «not in JavaScript». So the
// CLASS is excused only when the WITNESS'S OWN RULE says the thread waited (LH.waitedMuch: a wait of a fifth of the hold or
// more, the share at which its line says «it also waited N s for a CPU» — the three packed reds waited 100 ms and more of
// ~300); below that share the class is JUDGED («JavaScript»), and so it is when the wait cannot be read (no scheduler
// facts — said by name). An excused hold must still be SAMPLED (its own count, a class read off a sample). The range may
// pass the truth by at most the window's measured wait (+1 ms) — a lenient reading (the wait is the window's, from the
// reading before the hold to the one after), not a law of the hold; the hour bound (< 3 × the truth) is not relaxed.
// NOT cured, said (B-518e-loop's readers): a watchdog thread starved through the whole hold reads samples 0 («not sampled»)
// whatever the wait — rare, red. (The main thread's own run in the gap after the spin, the second of their two, is READ since
// r1649 and stated as the margin: judge12's afterMs below.)
const NOT_SAMPLED = [LH.V.unsampled, LH.V.unknown, LH.V.cpu];
const excused12 = (x) => !!x && x.waitMs != null && LH.waitedMuch({ wallMs: x.msHi || x.ms, waitMs: x.waitMs });   // (the witness's own window is at least the hold's upper bound)
// r1649 (the load row — seen red at 4861f5e5c-20261121204803-both, UTC: «ONE hold of 302–322 ms … 0 ms» of wait, truth 300): the
// leg IS A MEASURE OF TIME. Its one excess left unread above — the main thread's OWN run in the gap after the spin, before the
// next beat is served — is now READ in the same run (⑫'s `afterMs`: from the spin's end to the first timer turn after it, which
// the beat, expired during the spin, cannot follow) and passed here as a margin STATED from that reading, printed in the line;
// the pure controls (⑫b) pass none
function judge12(x, truth, afterMs = 0) {
  if (!x) return false;
  return x.ms <= truth + 1 + (x.waitMs > 0 ? x.waitMs : 0) + (afterMs > 0 ? afterMs : 0) && (x.msHi || x.ms) + 40 >= truth && (x.msHi || x.ms) < 3 * truth
    && (excused12(x) ? x.samples >= 1 && !NOT_SAMPLED.includes(x.verdict) : x.verdict === LH.V.js || x.verdict === LH.V.tie);   // r116 (b): the spin calls performance.now() — an ask inside that native call is native, so a 1:1 of JavaScript and native is THE TIE, true and counted (the machine's UTC run at b056a2453: «JavaScript ×1 and native code or garbage collection ×1 (a tie, in the order they came)»); this leg guards the clock, never the class
}
console.log('⑫a B-f534 — after the exit mark the watchdog connects to nothing (the REAL thread, in this process)');
{
  // The same witness, two real holds of this thread ON THE CPU: before its exitMark() the watchdog asks the hold (the sample's
  // own first call runs here — counted, never a clock): THE CONTROL; after it, the same hold is asked NOTHING (the watchdog reads
  // EXITING before every connect). The mark found no session held (nothing in flight between the holds) and so waited for none
  const SFW = require(path.join(REPO, 'src/server/sync-fs-witness.js'));
  const W8 = require(path.join(REPO, 'src/server/sync-fs-witness-worker.js'));
  let evals = 0; const gopd = Object.getOwnPropertyDescriptor;
  Object.getOwnPropertyDescriptor = function (o, k) { if (o === Error && k === 'prepareStackTrace') evals++; return gopd.call(Object, o, k); };
  const W = SFW.create({ rootDir: REPO, armed: true, readMountinfo: () => '', fresh: true, beatMs: 20, holdMs: 100, noAnswerMs: 50, liveMs: 60000, censusEveryMs: 0,
    log: { warn() {}, log() {}, error() {}, info() {} }, holdsOptions: { eluEveryMs: 50, eluBeforeMs: 500 } }).start({ installHook: false });
  let before = null, after = null, mark = null, hs = [], tries = 0, seenAtMark = [];
  // ONE spin, its length in STEPS (never a clock): until `asks` samples ran here, or `n` steps. Warmed first, so both measured
  // spins run the same compiled loop. THE CONTROL spins until the watchdog's first ask runs here; after the mark the spin runs
  // as many steps again, doubling until the witness itself records a hold past the bar (its own beats, at most five tries) —
  // a hold the watchdog would have asked — and every one of those steps is asked nothing
  const spinFor = (n, asks) => { const e0 = evals; let i = 0; for (; i < n && (asks === 0 || evals - e0 < asks); i++) { } return { steps: i, asked: evals - e0 }; };
  const pastBar = () => ((W.holds() && W.holds().report().holds) || []).filter((h) => h.ms >= 100);
  try {
    for (let k = 0; k < 20; k++) spinFor(2e5, 0);   // the loop compiled before anything is measured
    await new Promise((r) => setTimeout(r, 800));   // the watchdog's thread up, its first checks done
    before = spinFor(4e9, 1);                         // CONTROL: on the CPU until the watchdog's ask runs here
    await new Promise((r) => setTimeout(r, 300));     // that hold over, nothing in flight
    mark = W.exitMark();
    seenAtMark = pastBar().map((h) => JSON.stringify(h)); const seen0 = seenAtMark.length;
    after = { steps: 0, asked: 0 };
    for (let n = Math.max(1, before.steps); tries < 5 && pastBar().length === seen0; n *= 2) {
      tries++; const r = spinFor(n, 0); after.steps += r.steps; after.asked += r.asked;
      await new Promise((r2) => setTimeout(r2, 300));   // its record written
    }
    hs = (W.holds() && W.holds().report().holds) || [];
  } finally { Object.getOwnPropertyDescriptor = gopd; try { W.stop(); } catch { } }
  const fresh = hs.filter((h) => h.ms >= 100 && !seenAtMark.includes(JSON.stringify(h))), unasked = fresh.filter((h) => !h.samples);   // ONLY the holds recorded after the mark
  ok(!!before && before.asked >= 1 && !!after && after.asked === 0 && !!mark && mark.held === 0 && mark.left === 0 && fresh.length >= 1 && unasked.length === fresh.length,
    `⑫a before the exit mark the watchdog asked this thread (${before && before.asked} sample ran here after ${before && before.steps} steps); after it, ${after && after.steps} steps on the CPU in ${tries} tr${tries === 1 ? 'y' : 'ies'} — a hold the witness recorded past the bar (${unasked.map((h) => h.ms + ' ms').join(', ') || 'NONE'}) — were asked ${after && after.asked} times; the mark found ${mark && mark.held} sessions held`, { before, after, tries, mark, holds: hs.map((h) => ({ ms: h.ms, samples: h.samples })) });
  // THE ORDER THE PAIR RESTS ON (source pins — the fast tier cannot force the 20 ms window of a NATIVE hold at an exit, where the
  // residual lived: test-loop-hold-live's legs 5 and (7) sweep it): the watchdog counts up BEFORE its connect and reads EXITING
  // after; counts down AFTER a disconnect; answers the memory ask first, then `exiting`; the main thread stores EXITING BEFORE it
  // reads the count, and waits only on the count, at most SESSION_MS + 5 ms on the monotonic clock
  const WSRC = fs.readFileSync(path.join(REPO, 'src/server/sync-fs-witness-worker.js'), 'utf8'), MSRC = fs.readFileSync(path.join(REPO, 'src/server/sync-fs-witness.js'), 'utf8');
  const order = (src, ...parts) => { let at = -1; for (const p of parts) { const i = src.indexOf(p, at + 1); if (i < 0 || i <= at) return false; at = i; } return true; };
  ok(order(WSRC, 'heldUp();', 'if (exitingNow()) { heldDown(); return false; }', 'sess = new inspector.Session(); sess.connectToMainThread();')
    && order(WSRC, 'sess.disconnect(); heldDown(); return true; }') && order(WSRC, 'if (s0) { openSessions.delete(q); try { s0.disconnect(); } catch { } heldDown(); }')
    && order(WSRC, 'if (answerMemory(msg, parentPort)) return;', "if (msg && msg.ev === 'exiting') { for (const q of [...openSessions]) closeSession(q); return; }")
    && order(MSRC, 'Atomics.store(I, EXIT_SLOT, 1);', 'let n = Atomics.load(NI, HELD_SLOT);', "worker.postMessage({ ev: 'exiting' })", 'const until = mono() + LH.SESSION_MS + 5;', 'Atomics.wait(NI, HELD_SLOT, n, left)'),
    '⑫a the order the pair rests on: the watchdog counts up before its connect and reads EXITING after it, counts down after each disconnect, answers the memory ask before `exiting`; the main thread stores EXITING before it reads the count and waits on the count alone, at most SESSION_MS + 5 ms');
  ok(SFW.EXIT_SLOT === W8.EXIT_SLOT && SFW.HELD_SLOT === W8.HELD_SLOT && SFW.EXIT_SLOT === 7 && SFW.HELD_SLOT === 7,
    '⑫a the two threads name the same slots (the live slot\'s [7] = exiting, the note slot\'s [7] = the sessions held)');
}
console.log('⑫ round 5 — the monotonic clock, by behaviour (a date step inside a real hold)');
{
  const SFW = require(path.join(REPO, 'src/server/sync-fs-witness.js'));
  const said = [];
  const W = SFW.create({ rootDir: REPO, armed: true, readMountinfo: () => '', fresh: true, beatMs: 20, holdMs: 100, noAnswerMs: 50, liveMs: 60000,
    log: { warn: (l) => said.push(String(l)), log() {}, error() {}, info() {} }, holdsOptions: { eluEveryMs: 50, eluBeforeMs: 500 } }).start({ installHook: false });
  await new Promise((r) => setTimeout(r, 800));   // the watchdog's thread up, its first checks done
  const realNow = Date.now; let truth = 0, afterMs = 0;
  try {
    const m0 = performance.now(); let stepped = false;
    while (performance.now() - m0 < 300) { if (!stepped && performance.now() - m0 >= 150) { const r0 = realNow; Date.now = () => r0() + 3600000; stepped = true; } }
    truth = performance.now() - m0;
    const tEnd = performance.now(); await new Promise((r) => setTimeout(r, 0)); afterMs = performance.now() - tEnd;   // r1649: the main thread's own run after the spin, read
    await new Promise((r) => setTimeout(r, 900));
  } finally { Date.now = realNow; }
  const rep = W.holds().report(); try { W.stop(); } catch { }
  const hs = (rep.holds || []).filter((h) => h.ms >= 100);
  const h = hs[0];
  ok(hs.length === 1 && judge12(h, truth, afterMs),
    `⑫ a real ${truth.toFixed(0)} ms hold with the date stepped +1 h inside it, the witness with its default clock: ONE hold of ${h && h.ms}–${h && h.msHi} ms (the truth inside; the thread's own wait for a CPU, as the witness measured it: ${h && h.waitMs} ms; the main thread's own run after the spin, read in this run: ${afterMs.toFixed(1)} ms — the margin, stated), «${h && h.verdict}»${h && excused12(h) ? ` — it waited a fifth of the hold or more (the witness's own rule), so judged SAMPLED (${h.samples} samples), not on its class` : h && h.waitMs == null ? ' — NO SCHEDULER FACTS on this machine: the class judged' : ''}`, { holds: (rep.holds || []).map((x) => [x.ms, x.msHi, x.verdict, x.waitMs, x.samples, x.line]) });
}
// ⑫b B-518e — THE JUDGE OVER FIXED HOLDS (pure; the leg's controls). ⑫ was red THREE times on the first test machine in
// packed runs, green alone: «302–322 ms, native code or garbage collection» (truth 302; run 2ae16d9e9, the box's zone),
// «303–323 ms, JavaScript» (truth 300; the same run, UTC) and «338–358 ms, JavaScript» (truth 300; run 191e02d46, UTC),
// every line «— waited 0.1 s for a CPU» (a part the witness writes from 100 ms: the fixtures carry the smallest wait each
// line allows). The old judge read the MACHINE; the new one judges what the thread really ran, and the clock mutant's two
// readings (an hour; «not sampled») stay red, as do a scheduler's verdict with no sample and a class flipped with no wait.
{
  const PACKED = [[{ ms: 302, msHi: 322, verdict: LH.V.native, waitMs: 100, samples: 2 }, 302], [{ ms: 303, msHi: 323, verdict: LH.V.js, waitMs: 100, samples: 2 }, 300],
    [{ ms: 338, msHi: 358, verdict: LH.V.js, waitMs: 100, samples: 2 }, 300]];
  const old12 = (x, truth) => !!x && x.ms <= truth + 1 && (x.msHi || x.ms) + 40 >= truth && (x.msHi || x.ms) < 3 * truth && x.verdict === LH.V.js;
  ok(PACKED.every(([x, truth]) => judge12(x, truth)) && PACKED.every(([x, truth]) => !old12(x, truth)),
    '⑫b the three packed-run holds (each «waited 0.1 s for a CPU», as its line said) read green; the old judge reads all three red — what it judged was the machine');
  const RED = [
    ['the class flipped with NO wait measured', { ms: 301, msHi: 321, verdict: LH.V.native, waitMs: 0, samples: 3 }, 300],
    ['the clock mutant: an hour', { ms: 3600301, msHi: 3600321, verdict: LH.V.js, waitMs: 100, samples: 2 }, 300],
    ['the clock mutant: not sampled', { ms: 301, msHi: 321, verdict: LH.V.unsampled, waitMs: 100, samples: 0 }, 300],
    ['a scheduler verdict, no sample (waiting)', { ms: 301, msHi: 321, verdict: LH.V.waiting, waitMs: 200, samples: 0 }, 300],
    ['a scheduler verdict, no sample (blocked; excused, so judged on its samples)', { ms: 301, msHi: 321, verdict: LH.V.blocked, waitMs: 100, samples: 0 }, 300],
    ['a sample counted but a not-sampled class (excused)', { ms: 301, msHi: 321, verdict: LH.V.cpu, waitMs: 100, samples: 1 }, 300],
    ['no sample and no scheduler facts (the class judged: «not sampled»)', { ms: 301, msHi: 321, verdict: LH.V.unknown, waitMs: null, samples: 0 }, 300],
    ['past the truth by more than its wait', { ms: 360, msHi: 380, verdict: LH.V.js, waitMs: 20, samples: 2 }, 300],
    // A PLANTED MISCLASSIFICATION ON A QUIET RUN (the 06:13Z verdict's «as if a must»): a quiet machine waits a millisecond or
    // a few too — the class is judged there, so a wrong class is caught; and with no scheduler facts it is judged too
    ['a wrong class at a 1 ms wait (a quiet machine)', { ms: 301, msHi: 321, verdict: LH.V.native, waitMs: 1, samples: 3 }, 300],
    ['a wrong class at a 5 ms wait', { ms: 301, msHi: 321, verdict: LH.V.runnable, waitMs: 5, samples: 3 }, 300],
    ['a wrong class just under a fifth of the hold (63 ms of 321)', { ms: 301, msHi: 321, verdict: LH.V.native, waitMs: 63, samples: 3 }, 300],
    ['a wrong class with no scheduler facts', { ms: 301, msHi: 321, verdict: LH.V.native, waitMs: null, samples: 3 }, 300],
  ];
  const GREEN = [
    ['a quiet hold read «JavaScript» (0 ms of wait)', { ms: 301, msHi: 321, verdict: LH.V.js, waitMs: 0, samples: 3 }, 300],
    ['«JavaScript» at a 5 ms wait (the class judged, and right)', { ms: 301, msHi: 321, verdict: LH.V.js, waitMs: 5, samples: 3 }, 300],
    ['«JavaScript» with no scheduler facts (the class judged, and right)', { ms: 301, msHi: 321, verdict: LH.V.js, waitMs: null, samples: 3 }, 300],
    ['a fifth of the hold waited (65 ms of 321): excused, sampled', { ms: 301, msHi: 321, verdict: LH.V.native, waitMs: 65, samples: 2 }, 300],
  ];
  ok(RED.every(([, x, truth]) => !judge12(x, truth)) && GREEN.every(([, x, truth]) => judge12(x, truth)),
    `⑫b red: ${RED.map(([w]) => w).join(' · ')}; green: ${GREEN.map(([w]) => w).join(' · ')}`, { red: RED.filter(([, x, truth]) => judge12(x, truth)).map(([w]) => w), green: GREEN.filter(([, x, truth]) => !judge12(x, truth)).map(([w]) => w) });
}

// «THE NUMBER» (lane hub-loop-stalls, 2026-11-16 — the owner's hub: «725 holds and 2455 s in the kernel (blocked)», counted by
// hand off the journal): THE HELD SECONDS PER DAY BY CAUSE, DERIVED from the rows the hub already keeps (src/telemetry.js
// Telemetry.heldDays over kind 'metric' · name 'srv-loop-hold-ms', the cause = the verdict before « · »), cut by UTC days;
// the summary gains them; ⚙ Diagnostics «Main loop held» draws today / yesterday / seven days; the sync-fs held row names
// its call SITE. Fixture rows on the day edges (the first and the last ms of a UTC day) so a local-zone cut, an edge off by
// one, a cause dropped or the site gone turn a line red.
console.log('⑬ the number — the held seconds per day by cause, from the telemetry rows (UTC days), the summary, the table, the site');
{
  const { Telemetry } = require(path.join(REPO, 'src/telemetry.js'));
  const HD = (rows, now) => (typeof Telemetry.heldDays === 'function' ? Telemetry.heldDays(rows, now) : null);   // a tree without it: each leg red by name
  const DAY = 86400000;
  const BLOCKED = LH.V.blocked, JS = LH.V.js, WAIT = LH.V.waiting;
  const hold = (ts, value, detail, o = {}) => ({ ts, kind: 'metric', name: 'srv-loop-hold-ms', value, ...(detail === undefined ? {} : { detail }), version: 't', ...o });
  // the rows around `now`'s UTC day: d0 = its first ms
  const rowsAt = (now) => {
    const d0 = Math.floor(now / DAY) * DAY;
    return [
      hold(d0, 4000, `${BLOCKED} · writeJsonAtomic (src/channel-store.js:275)`),        // today's FIRST ms
      hold(now - 60000, 1500, `${JS} · foldPass (src/x.js:9) · then more`),             // today — a frame holding « · » too
      hold(now - 30000, 1000, undefined),                                                // today — no detail ⇒ «(no cause recorded)»
      hold(d0 - 1, 2000, `${BLOCKED} · peopleWrite (src/channel-store.js:1813)`),       // yesterday's LAST ms
      hold(d0 - DAY, 1200, `${WAIT} · (none)`),                                          // yesterday's FIRST ms
      hold(d0 - 6 * DAY, 3000, `${BLOCKED} · writeBuffersAtomic (src/channel-store.js:285)`), // the seven days' FIRST ms
      hold(d0 - 6 * DAY - 1, 9000, `${BLOCKED} · (outside)`),                           // the day BEFORE the seven: counted nowhere
      hold(d0 + DAY, 5000, `${BLOCKED} · (tomorrow)`),                                  // after today: counted nowhere
      { ts: now - 1000, kind: 'metric', name: 'srv-loop-canary-ms', value: 7000 },       // another metric: not a hold row
      { ts: now - 1000, kind: 'event', name: 'srv-loop-hold-ms', value: 7000, detail: `${BLOCKED} · x` },   // not a metric
      hold(now - 45000, 9000, `${JS} · boot (server.js:1) · (the boot)`),               // the BOOT's own hold (loop-day-report R5): apart, never a cause
    ];
  };
  const c = (cause, ms, count) => ({ cause, ms, count });
  const expect = (now) => {
    const day = (ms) => new Date(ms).toISOString().slice(0, 10), d0 = Math.floor(now / DAY) * DAY;
    return { cut: 'UTC',
      // loop-day-report R5: THE CAUSE = the hourly report's key — the hub's code location in the frame, else the verdict;
      // the boot's own hold apart (`boot`), in no total and no cause
      today: { from: day(d0), to: day(d0), ms: 6500, count: 3, boot: { ms: 9000, count: 1 }, causes: [c('src/channel-store.js:275', 4000, 1), c('src/x.js:9', 1500, 1), c('(no cause recorded)', 1000, 1)] },
      yesterday: { from: day(d0 - DAY), to: day(d0 - DAY), ms: 3200, count: 2, boot: { ms: 0, count: 0 }, causes: [c('src/channel-store.js:1813', 2000, 1), c(WAIT, 1200, 1)] },
      week: { from: day(d0 - 6 * DAY), to: day(d0), ms: 12700, count: 6, boot: { ms: 9000, count: 1 }, causes: [c('src/channel-store.js:275', 4000, 1), c('src/channel-store.js:285', 3000, 1), c('src/channel-store.js:1813', 2000, 1), c('src/x.js:9', 1500, 1), c(WAIT, 1200, 1), c('(no cause recorded)', 1000, 1)] } };
  };
  const J = (x) => JSON.stringify(x);
  const NOW = Date.UTC(2026, 10, 16, 10, 0, 0);   // 2026-11-16T10:00:00Z
  const got = HD(rowsAt(NOW), NOW);
  ok(J(got) === J(expect(NOW)),
    '(1) today 6.5 s in 3 (the blocked 4.0 at its first ms, JavaScript 1.5, no cause 1.0) · yesterday 3.2 s in 2 (its last and first ms) · the seven days 12.7 s in 6 — by cause, the larger first; the day before the seven, a row after today, another metric and a non-metric count nowhere', got);
  ok(!!got && got.today.from === '2026-11-16' && got.yesterday.from === '2026-11-15' && got.week.from === '2026-11-10' && got.week.to === '2026-11-16'
    && ['today', 'yesterday', 'week'].every((k) => got[k].ms === got[k].causes.reduce((s, x) => s + x.ms, 0) && got[k].count === got[k].causes.reduce((s, x) => s + x.count, 0)),
    '(1) the periods are UTC dates (today = the date of now, yesterday the one before, the seven = today and the six before) and each total is the sum of its causes', got && [got.today.from, got.yesterday.from, got.week.from, got.week.to]);
  // THE CUT IS UTC, WHATEVER THE PROCESS'S ZONE: the same rows under +08:00 and −08:00 — a local cut moves yesterday's last ms
  // into today (+08) or today's first ms into yesterday (−08); this fixture tells them apart (the control below)
  const tz0 = process.env.TZ, zoned = {}, localCut = {};
  const localDay = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  try {
    for (const tz of ['Asia/Shanghai', 'America/Los_Angeles']) {
      process.env.TZ = tz;
      zoned[tz] = J(HD(rowsAt(NOW), NOW));
      localCut[tz] = rowsAt(NOW).slice(0, 8).filter((r) => localDay(r.ts) === localDay(NOW)).reduce((s, r) => s + r.value, 0);
    }
  } finally { if (tz0 === undefined) delete process.env.TZ; else process.env.TZ = tz0; }
  ok(Object.values(zoned).every((z) => z === J(expect(NOW))) && localCut['Asia/Shanghai'] !== 6500 && localCut['America/Los_Angeles'] !== 6500,
    `(2) the day cut is UTC under any process zone (+08:00 and −08:00 give the same numbers); CONTROL: a local-zone cut of these rows reads today ${localCut['Asia/Shanghai']} / ${localCut['America/Los_Angeles']} ms, not 6500`, { localCut });
  // (3) THE SUMMARY GAINS THEM — the real Telemetry over a scratch data dir, the rows in their own monthly shards (a seven
  // days across two months), with `days: 1` (the rail's ask): the number is never cut by the summary's window
  const os = await import('node:os');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-lh-number-'));
  try {
    const tel = new Telemetry({ dataDir: tmp, version: 't' });
    const NOW2 = Date.UTC(2026, 10, 2, 12, 0, 0);   // 2026-11-02T12:00Z — the seven days start 2026-10-27
    const rows2 = rowsAt(NOW2);
    for (const r of rows2) fs.appendFileSync(tel._shard(r.ts), JSON.stringify(r) + '\n');
    const shards = fs.readdirSync(path.join(tmp, 'telemetry')).filter((f) => f.startsWith('events-')).sort();
    const s1 = await tel.summary({ days: 1, now: NOW2 }), s14 = await tel.summary({ days: 14, now: NOW2 });   // B-360d unit 2: the summary is read in its worker
    ok(J(s1.loopHeld) === J(expect(NOW2)) && J(s14.loopHeld) === J(expect(NOW2)) && J(shards) === J(['events-2026-10.ndjson', 'events-2026-11.ndjson']) && s1.loopHeld?.week?.from === '2026-10-27',
      `(3) GET /api/telemetry/summary's loopHeld = the rows' number, read from ${shards.join(' + ')}, the same with days=1 and days=14 (the summary's own window never cuts the seven days)`, s1.loopHeld);
    ok(s14.metrics['srv-loop-hold-ms'] && s14.metrics['srv-loop-hold-ms'].count === 9 && s14.byName['metric:srv-loop-hold-ms'] === 9 && s14.byName['event:srv-loop-hold-ms'] === 1,
      '(3) the summary\'s other tables are unchanged by it (srv-loop-hold-ms still a metric with its percentiles)', s14.metrics['srv-loop-hold-ms']);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  // (4) THE SITE: the sync-fs held row says the call's site — the witness's src/ frame, file:line and the function
  const { createFsCanary } = require(path.join(REPO, 'src/server/fs-canary.js'));
  const recs = [];
  const can = createFsCanary({ file: '/nonexistent', probe: { call: async () => ({}), close() {} }, record: (r) => recs.push(r), log: () => {} });
  can.held({ fn: 'writeFileSync', path: '/srv/x/data/channels/adapters.json.tmp-1', ms: 4012, class: 'local', mount: null, caller: 'src/channel-store.js:275 writeJsonAtomic' });
  can.held({ fn: 'openSync', path: '/srv/x/node_modules/y', ms: 1100, class: 'local', mount: null, caller: null });
  const det = recs.filter((r) => r.name === 'srv-sync-fs-held-ms').map((r) => r.detail);
  ok(J(det) === J(['fn=writeFileSync class=local site=src/channel-store.js:275 writeJsonAtomic', "fn=openSync class=local site=(not the hub's own code)"]),
    '(4) srv-sync-fs-held-ms\'s detail carries the call SITE (file:line + function); a call no frame of the hub made says so', det);
  // (5) THE TABLE BY ITS WORDS — the client's own drawing (src/lib/setup-flows.js heldDaysTable, extracted), en / zh / ja
  const SF = fs.readFileSync(path.join(REPO, 'src/lib/setup-flows.js'), 'utf8');
  const a = SF.indexOf('function heldDaysTable('), b = SF.indexOf('// end heldDaysTable');
  const draw = a > 0 && b > a ? new Function(SF.slice(a, b) + '\nreturn heldDaysTable;')() : () => '';
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const tOf = (dict) => (k, p) => { let s = dict && Object.prototype.hasOwnProperty.call(dict, k) ? dict[k] : k; if (p) s = s.replace(/\{(\w+)\}/g, (m, x) => (p[x] !== undefined ? String(p[x]) : m)); return s; };
  const words = (html) => html.replace(/<\/(td|p|h3)>/g, ' | ').replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
  const en = words(draw(got, { t: tOf(null), esc }));
  const WANT = `Held per day, by cause | Seconds the main loop was held, and in brackets how many holds — from the telemetry this server keeps. The days are UTC days; today is 2026-11-16. | `
    + `cause | today | yesterday | 7 days | src/channel-store.js:275 | 4.0 s (1) | — | 4.0 s (1) | src/channel-store.js:285 | — | — | 3.0 s (1) | src/channel-store.js:1813 | — | 2.0 s (1) | 2.0 s (1) | `
    + `src/x.js:9 | 1.5 s (1) | — | 1.5 s (1) | ${WAIT} | — | 1.2 s (1) | 1.2 s (1) | (no cause recorded) | 1.0 s (1) | — | 1.0 s (1) | all causes | 6.5 s (3) | 3.2 s (2) | 12.7 s (6) | `
    + `the boot (apart — not in all causes) | 9.0 s (1) | — | 9.0 s (1) | A boot’s own holds are apart from 2.369.407 on; rows written before carry no mark and count among the causes. |`;
  ok(en === WANT, `(5) the table's words (en): ${en}`, { want: WANT });
  const zh = (await import(path.join(REPO, 'src/lib/i18n-zh.js'))).default, ja = (await import(path.join(REPO, 'src/lib/i18n-ja.js'))).default;
  const keys = [...SF.slice(a, b).matchAll(/\bt\('((?:[^'\\]|\\.)*)'/g)].map((m) => m[1]);
  const zhW = words(draw(got, { t: tOf(zh), esc })), jaW = words(draw(got, { t: tOf(ja), esc }));
  ok(keys.length === 10 && keys.every((k) => typeof zh[k] === 'string' && typeof ja[k] === 'string' && zh[k] !== k && ja[k] !== k)
    && zhW.startsWith('每天卡住的时间（按原因） | 主循环被卡住的秒数') && zhW.includes('今天是 2026-11-16') && zhW.includes('原因 | 今天 | 昨天 | 7 天 |') && zhW.includes('全部原因 | 6.5 s (3) | 3.2 s (2) | 12.7 s (6)')
    && jaW.startsWith('日ごとの停止（原因別） | メインループが止まっていた秒数') && jaW.includes('今日は 2026-11-16') && jaW.includes('原因 | 今日 | 昨日 | 7日間 |') && jaW.includes('すべての原因 | 6.5 s (3)'),
    `(5) every word it says has a zh and a ja row (${keys.length} keys) — zh: ${zhW.slice(0, 60)}… ja: ${jaW.slice(0, 60)}…`, { keys: keys.filter((k) => !(zh[k] && ja[k])), zhW, jaW });
  const empty = words(draw(HD([], NOW), { t: tOf(null), esc }));
  const evil = draw(HD([hold(NOW - 5, 1000, '<img src=x onerror=1> · y')], NOW), { t: tOf(null), esc });
  let zonedDraw = ''; try { process.env.TZ = 'Asia/Shanghai'; zonedDraw = draw(got, { t: tOf(null), esc }); } finally { if (tz0 === undefined) delete process.env.TZ; else process.env.TZ = tz0; }
  ok(empty.endsWith('| No hold of a second or more in the last seven days. |') && draw(undefined, { t: tOf(null), esc }) === '' && draw({}, { t: tOf(null), esc }) === ''
    && !evil.includes('<img') && !evil.includes('onerror') && evil.includes('(other)') && words(zonedDraw) === en,
    '(5) no hold in the seven days ⇒ the one sentence; a server older than the field ⇒ nothing; a cause outside the fixed key prints «(other)» (nothing of its text reaches the page); the drawing reads no zone (+08:00 draws the same words)', { empty });
  ok(/\$\{heldDaysTable\(d\.loopHeld, \{ t, esc \}\)\}/.test(SF.slice(SF.indexOf("<h2>${esc(t('Main loop held'))}</h2>"), SF.indexOf("const pf = lh.profile || {};"))),
    '(5) ⚙ Diagnostics «Main loop held» draws it from the summary it already fetched (d.loopHeld), inside its own section');
}

console.log('⑭ B-fe0b — the ask\'s own delivery names no hold; node\'s own code inside a hold says so (measured on Node 22.23.4 and 24.22.1)');
{
  // the frames below are MEASURED (a worker session asking the product's own expression of a main thread in each state,
  // both Nodes): an idle loop answered with NO frame 14 490 of 14 491 times (Node 24; 13 036 of 13 037 on Node 22); a
  // channel's first MessageEvent ran undici's lazy load — under node's loader, often deep in what it pulls (crypto, tls,
  // http2), the 31-frame stack cut before its bottom; a sync gzip answered in slice (node:buffer) under processChunkSync
  const S = (frames) => LH.sampleOf(enc(frames), ROOT).frames;
  const A = (frames) => { const sm = LH.sampleOf(enc(frames), ROOT); return LH.framesAnswer(sm.frames, sm.form, sm.cut); };
  const R0 = 'node:internal/bootstrap/realm', U = 'node:internal/deps/undici/undici';
  const UNDICI8 = [['__require', U, 6], ['', U, 1230], ['compileForInternalLoader', R0, 398], ['requireBuiltin', R0, 429], ['lazyMessageEvent', 'node:internal/worker/io', 108], ['onMessageEvent', 'node:internal/worker/io', 320],
    ['[nodejs.internal.kHybridDispatch]', 'node:internal/event_target', 845], ['', 'node:internal/per_context/messageport', 23]];
  const UNDICI31 = [['set', '', 0], ['createSupportedAlgorithms', 'node:internal/crypto/util', 61], ['', 'node:internal/crypto/util', 80],
    ...[['node:internal/tls/secure-context'], ['node:internal/tls/common'], ['node:tls'], ['node:internal/http2/core'], ['node:http2']].flatMap(([f]) => [['compileForInternalLoader', R0, 398], ['requireBuiltin', R0, 429], ['', f, 1]]),
    ['compileForInternalLoader', R0, 398], ['requireBuiltin', R0, 429], ['requireWithFallbackInDeps', R0, 475],
    ...['lib/dispatcher/client-h2.js', 'lib/dispatcher/client.js', 'lib/dispatcher/pool.js', 'lib/dispatcher/agent.js', 'lib/global.js'].flatMap((m) => [[m, U, 1056], ['__require', U, 6]])];
  const WEBSTREAMS22 = [['getNonWritablePropertyDescriptor', 'node:internal/webstreams/readablestream', 12], ['', 'node:internal/webstreams/readablestream', 3], ['compileForInternalLoader', R0, 398], ['requireBuiltin', R0, 429],
    ['lib/web/fetch/response.js', U, 1056], ['__require', U, 6], ['', U, 1230], ['compileForInternalLoader', R0, 398], ['requireBuiltin', R0, 429], ['lazyMessageEvent', 'node:internal/worker/io', 108], ['onMessageEvent', 'node:internal/worker/io', 320]];
  const ZLIB = [['slice', 'node:buffer', 1], ['processChunkSync', 'node:zlib', 463], ['zlibBufferSync', 'node:zlib', 182], ['syncBufferWrapper', 'node:zlib', 816], ['zlibHog', ROOT + '/src/hogs.js', 9]];
  const TIMERS = [['peek', 'node:internal/priority_queue', 26], ['processTimers', 'node:internal/timers', 520]];
  const HTTP = [['push', '', 0], ['compileForInternalLoader', R0, 398], ['requireBuiltin', R0, 429], ['', 'node:_http_agent', 1], ['compileForInternalLoader', R0, 398], ['requireBuiltin', R0, 429], ['', 'node:http', 1],
    ['compileForInternalLoader', R0, 398], ['requireBuiltin', R0, 429], ['loadHttp', ROOT + '/src/x.js', 3]];
  const OWN_SESSION = [['', '', 0], ['post', 'node:inspector', 140], ['askSelf', ROOT + '/src/x.js', 7]];
  const STREAM = [['readableAddChunk', 'node:internal/streams/readable', 9], ['Readable.push', 'node:internal/streams/readable', 4], ['onStreamRead', 'node:internal/stream_base_commons', 189]];
  const INSPECTOR_ONLY = [['get', '', 0], ['#onMessage', 'node:inspector', 70], ['', 'node:inspector', 120], ['', 'node:internal/inspector/network', 5]];
  const ud = A(UNDICI8), u31 = A(UNDICI31), w22 = A(WEBSTREAMS22), zl = A(ZLIB), tm = A(TIMERS), ht = A(HTTP), osn = A(OWN_SESSION), st = A(STREAM);
  const NO = 'with no frame of ours below it', CUT = 'the stack cut before any frame of ours';
  ok(ud.words.startsWith(`node’s own code — undici, ${NO}: `) && ud.key === '(node’s own code — undici)' && ud.keyWords === ud.key && !ud.empty,
    `a channel's first MessageEvent (undici's lazy load, measured): «${ud.words}», keyed by the module — never a frame of undici's bundle`, ud);
  { // the two answer forms judge «cut» at the SAME depth (the batch-78 readers' should): the call-site form's own frame is
    // skipped inside the expression (i = 1), the string form's at sampleOf (raw.slice(1)) — 31 frames below it is a full
    // answer in both, 30 is not
    const SS = (n) => { const t = ['Error', '    at self (node:internal/self:1:1)', ...Array.from({ length: n }, (_, i) => `    at f${i} (node:internal/deps/undici/undici:${i + 1}:1)`)].join('\n'); return 'S' + t.length + ':' + t; };
    const CC = (n) => enc(Array.from({ length: n }, (_, i) => [`f${i}`, 'node:internal/deps/undici/undici', i + 1]));
    const f = (t) => { const sm = LH.sampleOf(t, ROOT); return [sm.form, sm.cut, sm.frames.length, LH.framesAnswer(sm.frames, sm.form, sm.cut).words.replace(/^.*undici, /, '').split(': ')[0]]; };
    const r = { s31: f(SS(31)), s30: f(SS(30)), c31: f(CC(31)), c30: f(CC(30)) };
    ok(r.s31[0] === 'string' && r.c31[0] === 'calls' && r.s31[1] === true && r.c31[1] === true && r.s30[1] === false && r.c30[1] === false
      && r.s31[3] === CUT && r.c31[3] === CUT && r.s30[3] === NO && r.c30[3] === NO && r.s31[2] === 31 && r.c31[2] === 31,
      'the string form and the call-site form judge a full answer at the same depth: 31 frames below the sample\'s own = «the stack cut…», 30 = «no frame of ours below it», in both', r);
  }
  ok(UNDICI31.length === LH.SAMPLE_FRAMES && u31.words.startsWith(`node’s own code — undici, ${CUT}: `) && u31.key === ud.key && w22.words.split(': ')[0] === ud.words.split(': ')[0],
    'the same load in a FULL answer (31 frames, cut inside crypto / tls / http2 — Node 24) and inside webstreams (Node 22): still undici — the bundled dependency in the run names it, never the innermost module; the full one never claims «no frame of ours»', { u31, w22 });
  ok(zl.words === 'node’s own code — zlib, driven by zlibHog (src/hogs.js:9)' && zl.key === 'src/hogs.js:9' && zl.keyWords === 'zlibHog (src/hogs.js:9)',
    `a sync gzip answered in slice (node:buffer) under processChunkSync: «${zl.words}» — keyed by our frame, as before`, zl);
  ok(st.words.startsWith(`node’s own code — streams, ${NO}: `) && tm.words.startsWith(`node’s own code — timers, ${NO}: `) && ht.words === 'node’s own code — http, driven by loadHttp (src/x.js:3)' && osn.words === 'node’s own code — inspector, driven by askSelf (src/x.js:7)' && !osn.empty,
    'stream glue run from the loop (its innermost module, never stream_base_commons); node\'s timers with nothing of ours (priority_queue is a helper); a lazy require of http by our code (the module node\'s loader was loading at the outermost level, never the http_agent it pulled); this thread\'s OWN inspector session — held code driven by ours, never the delivery', { st: st.words, tm: tm.words, ht: ht.words, osn: osn.words });
  const del = A([]), ins = A(INSPECTOR_ONLY), bi = A([['test', '', 0]]), ours = A([['busyHog', ROOT + '/src/hogs.js', 38], ['', 'node:internal/timers', 585]]);
  ok(del.empty && ins.empty && del.words === LH.WORDS.between && !bi.empty && bi.words === '(built-in)' && ours.words === 'busyHog (src/hogs.js:38) ← (anonymous) (node:internal/timers:585)' && ours.key === 'src/hogs.js:38',
    'THE DELIVERY: no frame, or only the inspector\'s dispatch (with V8 built-ins), is the empty answer; a built-in alone and a stack whose first frame is ours keep their words', { del, ins, bi, ours });
  // in a hold: two asks answered at JavaScript speed inside undici's load + one on the CPU unanswered (B-1409's fourth case,
  // .393 self-hosted, Node 24) — JavaScript, as the ruling says, and the samples SAY undici; the delivery of an idle ask names nothing
  const FROM = 50000, TO = FROM + 1500, B0 = 3;
  const at = (i, answer, ms = 0.05) => ({ postedAt: FROM + 300 + i * 300, answeredAt: answer ? FROM + 300 + i * 300 + ms : null, state: 'running', answer, beat: B0 });
  const holdOf = (asks) => { const J = LH.judgeAsks(asks, { beat0: B0, holdEnd: TO }); const h = { from: FROM, to: TO, fromM: FROM, toM: TO, ms: 1500, samples: J.samples, outside: J.outside, d: null }; return { fo: LH.foldHold(h), line: LH.holdLine(h) }; };
  // the ask's own delivery: posted inside the hold, answered in its LAST beat once the held code returned (an empty
  // answer earlier in a hold is a promise flood's — read as the hold's end too, round 4's law, kept here)
  const mixed = holdOf([at(0, ud), at(1, ud), at(2, null)]), gz = holdOf([at(0, zl), at(1, zl)]), idle = holdOf([{ postedAt: TO - 100, answeredAt: TO - 99.95, state: 'running', answer: del, beat: B0 }]);
  // r5456 (A FAST ANSWER IN NODE's OWN CODE THAT DRIVES NATIVE CALLS IS NO PROOF OF JAVASCRIPT): zlib's two fast samples alone are
  // THE TIE. undici is node's own JAVASCRIPT (no native driver): its two keep «JavaScript», as B-1409's ruling said. The samples are
  // said as before (whose), word for word
  ok(mixed.fo.verdict === LH.V.js && mixed.line.includes(`node’s own code — undici, ${NO}: `) && mixed.line.includes(' ×2') && mixed.fo.frame === '(node’s own code — undici)',
    `undici's load inside a hold: JavaScript for the verdict, and the hold says whose — ${mixed.line}`, mixed);
  ok(gz.fo.verdict === LH.V.tie && gz.line.includes(`${LH.V.js} ×2 and ${LH.V.native} ×2 (a tie, in the order they came)`) && gz.line.includes('node’s own code — zlib, driven by zlibHog (src/hogs.js:9) ×2') && gz.fo.frame === 'zlibHog (src/hogs.js:9)', `a zlib hold (two fast answers in node's own code): THE TIE, never «JavaScript» alone (r5456): ${gz.line}`, gz);
  { // r5456's RED: the release's fold (a fast answer is JavaScript wherever it stood) says «JavaScript» alone for that zlib hold — and
    // a fast answer in the person's OWN code (a frame of the repo) keeps «JavaScript»
    const SRC5456 = fs.readFileSync(path.join(REPO, 'src/loop-hold.js'), 'utf8'), A5456 = "  const nv = nodeOwnJs ? { ...n, native: (n.native || 0) + js } : n;\n";
    ok(SRC5456.split(A5456).length === 2, 'control setup: the fold\'s node-own count is found once in src/loop-hold.js');
    const LHX = (() => { const m = { exports: {} }; vm.compileFunction(anchored(SRC5456, A5456, "  const nv = n;   /* MUTANT: the release's fold */\n", 'r5456-release-fold'), ['module', 'exports', 'require'], { filename: 'loop-hold-r5456-release-fold-mutant.js' })(m, m.exports, require); return m.exports; })();
    const gzx = LHX.foldHold({ from: FROM, to: TO, fromM: FROM, toM: TO, ms: 1500, samples: LH.judgeAsks([at(0, zl), at(1, zl)], { beat0: B0, holdEnd: TO }).samples, outside: {}, d: null });
    ok(gzx.verdict === LH.V.js, `CONTROL r5456 (the release's fold, in a copy) on that zlib hold: «${LH.V.js}» alone — red by name`, gzx.verdict);
    const own = { kind: 'js', words: 'ourHog (src/x.js:3)', key: 'src/x.js:3', keyWords: 'ourHog (src/x.js:3)' };
    const oh = holdOf([at(0, own), at(1, own)]);
    ok(oh.fo.verdict === LH.V.js, `r5456: two fast answers in the person's OWN code keep «${LH.V.js}»: ${oh.line}`, oh.fo.verdict);
    // node's own GLUE: the clock read a JavaScript hog of ours calls in its loop (the heavy box's round 4 tail and its late-watchdog hog
    // answered there: «node’s own code — bootstrap, driven by pbkdfHog») keeps «JavaScript»; RED: the rule over EVERY node module
    // (a first form of this cure, in a copy) ties it
    const clk = A([['hrtimeBigInt', 'node:internal/bootstrap/node', 120], ['busyHog', ROOT + '/src/hogs.js', 2]]), ck2 = holdOf([at(0, clk), at(1, clk)]);
    ok(clk.module === 'bootstrap' && clk.words === 'node\u2019s own code \u2014 bootstrap, driven by busyHog (src/hogs.js:2)' && ck2.fo.verdict === LH.V.js, `r5456: two fast answers in node's own glue (a clock read under busyHog) keep «${LH.V.js}»: ${ck2.line}`, { clk, v: ck2.fo.verdict });
    const AN = "  const nodeOwnJs = js > 0 && samples.every((x) => clsOf(x) !== 'js' || NATIVE_DRIVERS.has(x.module));\n";
    const LHA = SRC5456.split(AN).length === 2 ? (() => { const m = { exports: {} }; vm.compileFunction(anchored(SRC5456, AN, "  const nodeOwnJs = js > 0 && samples.every((x) => clsOf(x) !== 'js' || !!x.module);   /* MUTANT: every node module */\n", 'r5456-any-module'), ['module', 'exports', 'require'], { filename: 'loop-hold-r5456-any-module-mutant.js' })(m, m.exports, require); return m.exports; })() : null;
    const ckx = LHA ? LHA.foldHold({ from: FROM, to: TO, fromM: FROM, toM: TO, ms: 1500, samples: LH.judgeAsks([at(0, clk), at(1, clk)], { beat0: B0, holdEnd: TO }).samples, outside: {}, d: null }) : null;
    ok(!!LHA && ckx && ckx.verdict === LH.V.tie, `CONTROL r5456 (the rule over every node module, in a copy) on that clock hold: the tie — red by name (${ckx && ckx.verdict})`, ckx && ckx.verdict);
  }
  // an inspector frame ABOVE a frame of ours is never the delivery (the batch-78 readers' should): the thread's own session,
  // and the dispatch's frames over our caller — both name the hold, driven by ours
  const overOurs = A([...INSPECTOR_ONLY, ['askSelf', ROOT + '/src/x.js', 7]]), insp = holdOf([at(0, osn), at(1, overOurs)]);
  ok(!overOurs.empty && overOurs.words === 'node\u2019s own code \u2014 inspector, driven by askSelf (src/x.js:7)' && insp.fo.verdict === LH.V.js && insp.fo.inside === 2
    && insp.line.includes('node\u2019s own code \u2014 inspector, driven by askSelf (src/x.js:7) \u00d72'), `an inspector frame above a frame of ours names the hold, never «no hold»: ${insp.line}`, { overOurs, insp });
  ok(idle.fo.verdict !== LH.V.js && idle.fo.inside === 0 && idle.line.includes('not sampled (no sample landed inside it — asked 1 time: the answer came at its end, with no frame of it)'),
    `the ask's own delivery names no hold: ${idle.line}`, idle);
  { // the watchdog's answer IS this function (the worker's textAnswer)
    const WK = fs.readFileSync(path.join(REPO, 'src/server/sync-fs-witness-worker.js'), 'utf8');
    ok(/\n  return LH\.framesAnswer\(sm\.frames, sm\.form, sm\.cut === true\);\n\}/.test(WK) && !/LH\.chainWords\(/.test(WK), 'the watchdog thread answers through LH.framesAnswer with the answer\'s cut (no chain words of its own)');
  }
  { // RED CONTROLS: each rule cut alone — a patched copy compiled in memory (src/loop-hold.js requires nothing; no file is
    // written, the tree never touched) — its pin goes red
    const SRC = fs.readFileSync(path.join(REPO, 'src/loop-hold.js'), 'utf8');
    const load = (src) => { const m = { exports: {} }; vm.compileFunction(src, ['module', 'exports', 'require'], { filename: 'loop-hold-fe0b-mutant.js' })(m, m.exports, require); return m.exports; };
    // B-0d3e: the anchor judged BY NAME — a moved or doubled anchor is a red row naming it and the file (then null: the RED
    // CONTROLS row below reds too, nothing crashes)
    const cut = (from, to) => { const n = SRC.split(from).length - 1; if (n !== 1) { ok(false, `ANCHOR (src/loop-hold.js): ${JSON.stringify(from).slice(0, 100)} — found ${n} times, one meant: the red control builds nothing`); return null; } return load(editAnchor(SRC, from, to, "src/loop-hold.js")); };
    const noOwn = cut('  const o = nodeOwnOf(frames);\n', '  const o = null;\n'), noIns = cut('  return inspector > 0;\n', '  return false;\n'), noDeps = cut('if (DEPS_FILE.test(run[j].file)) owner = run[j];', '{ }');
    const noLoader = cut('    for (let j = k - 1; j >= 0 && !owner; j--) if (!LOADER_FILE.test(run[j].file)) owner = run[j];\n', ''), noHelper = cut('!HELPER_MODULE.has(moduleOf(run[j].file))', 'true');
    const noCut = cut("(cut ? ', the stack cut before any frame of ours' : ', with no frame of ours below it')", "', with no frame of ours below it'");
    const r = (L, f) => { const sm = L.sampleOf(enc(f), ROOT); return L.framesAnswer(sm.frames, sm.form, sm.cut); };
    const red = { own: noOwn && !/node’s own code/.test(r(noOwn, UNDICI8).words) && !/node’s own code/.test(r(noOwn, ZLIB).words), inspector: noIns && !r(noIns, INSPECTOR_ONLY).empty,
      deps: noDeps && /— http2, /.test(r(noDeps, UNDICI31).words) && r(noDeps, UNDICI8).words === ud.words, loader: noLoader && /— http_agent, /.test(r(noLoader, HTTP).words),
      helper: noHelper && /— buffer, /.test(r(noHelper, ZLIB).words), cut: noCut && r(noCut, UNDICI31).words.includes(`, ${NO}: `) };
    ok(Object.values(red).every((v) => v === true), `RED CONTROLS: without the rule undici and zlib say their chains (${noOwn && r(noOwn, UNDICI8).words.slice(0, 60)}…); without the inspector branch its dispatch is a sample; without the bundled dependency first the full stack says «${noDeps && r(noDeps, UNDICI31).words}»; without the loader rule «${noLoader && r(noLoader, HTTP).words}»; without the helpers «${noHelper && r(noHelper, ZLIB).words}»; without the cut the full stack claims «${NO}»`, red);
  }
}

console.log('⑮ B-7c97 — a hold never names the measuring wrapper; every counted hold is asked while it lasts; a spawn is named by its caller (the owner\'s incident inc-mwlgtu4o-uosz)');
{
  const ans = (frames) => { const sm = LH.sampleOf(enc(frames), ROOT); return LH.framesAnswer(sm.frames, sm.form, sm.cut); };
  const LB = ROOT + '/src/server/loop-blame.js', SW = ROOT + '/src/server/sync-fs-witness.js';
  // the witness's own rows (int359/loopw/ranked-all.txt 62 / 63 / 65 / 217 / 496): a V8 built-in innermost, then the instrument
  // RECONSTRUCTED from row 62's sample (a chain cut at 3 frames): realpathSync runs in agy-store-fs's storePath (lines 24–25),
  // reached through open (31) and read (40) — line 42 (readFileSync) is another sample of that hold
  const R62 = [['', '', 0], ['realpathSync', 'node:fs', 2878], ['wrapped', LB, 64], ['storePath', ROOT + '/src/agy-store-fs.js', 24], ['open', ROOT + '/src/agy-store-fs.js', 31], ['read', ROOT + '/src/agy-store-fs.js', 40]];
  const R217 = [['', '', 0], ['callerOf', LB, 35], ['wrapped', LB, 67], ['readAll', ROOT + '/src/x.js', 3]];
  const R496 = [['', '', 0], ['before', SW, 174], ['wrapped', LB, 60], ['claudeLoginState', ROOT + '/src/harnesses/claude.js', 103]];
  const ALONE = [['', '', 0], ['wrapped', LB, 60], ['refresh', SW, 129], ['listOnTimeout', 'node:internal/timers', 594]];
  const EVALD = [['', '', 0, true], ['wrapped', LB, 64], ['read', ROOT + '/src/agy-store-fs.js', 42]];
  const a62 = ans(R62), a217 = ans(R217), a496 = ans(R496), alone = ans(ALONE), evald = ans(EVALD);
  ok(a62.key === 'src/agy-store-fs.js:24' && /^storePath \(src\/agy-store-fs\.js:24\)/.test(a62.words) && !/loop-blame/.test(a62.words) && a217.key === 'src/x.js:3' && a496.key === 'src/harnesses/claude.js:103',
    `a sample answered in a V8 built-in under the instrument names the CALLER of the wrapped call, never the wrapper: «${a62.words}» (the hub's «(built-in) ← realpathSync ← wrapped (loop-blame line 64)», 28.4 s in 4 holds); callerOf / the witness's hook the same`, { a62, a217, a496 });
  ok(alone.key === 'src/server/sync-fs-witness.js:129' && !/loop-blame/.test(alone.words) && /src\/server\/loop-blame\.js/.test(evald.key),
    'a stack that is the instrument\'s ALONE (the witness\'s own timer, calling through the wrapper) stays the instrument\'s — named by its OWN frame, refresh, never the wrapper\'s line (主开发 12:20Z); an eval\'d frame is never passed (it stops the trim)', { alone: alone.key, evald: evald.key });
  // THE FIRST ASK: for every phase of the watchdog's check against the last beat, the first check at or past firstAskMs falls
  // INSIDE the smallest gap the book counts (the one bar); due at the bar itself, some phases miss a 1.0–1.25 s hold
  const H = LH.HOLD_MS, B = LH.BEAT_MS;
  let G0 = H; while (!LH.isGapHold(G0, B, H)) G0++;   // the smallest gap that is a hold
  const firstCheck = (phase, first) => { let s = phase; while (s < first) s += B; return s; };
  const missWith = (first) => { const m = []; for (let p = 0; p < B; p++) if (firstCheck(p, first) >= G0) m.push(p); return m; };
  const now = missWith(LH.firstAskMs(H, B)), release = missWith(H);
  ok(LH.firstAskMs(H, B) === H - B && LH.firstAskMs() === 750 && !now.length && release.length > 0 && LH.sampleDue(0, H - B, H, LH.SAMPLES_PER_HOLD, LH.firstAskMs(H, B)) && !LH.sampleDue(0, H - B - 1, H, LH.SAMPLES_PER_HOLD, LH.firstAskMs(H, B)) && LH.sampleDue(1, 2 * H, H, LH.SAMPLES_PER_HOLD, LH.firstAskMs(H, B)) && !LH.sampleDue(1, 2 * H - 1, H, LH.SAMPLES_PER_HOLD, LH.firstAskMs(H, B)),
    `the first ask comes due one beat before the bar (${LH.firstAskMs(H, B)} ms): for every one of the ${B} phases its check falls inside the smallest counted gap (${G0} ms); due at the bar (the release), ${release.length} phases of ${B} miss a hold that short — the owner's 43 «not sampled» holds of 1.0–1.25 s; the later asks keep 2, 4, 8 … × the bar`, { G0, now: now.length, release: release.length });
  { // the watchdog thread follows it (no fast suite runs the thread over a hold at the bar: test-loop-hold-live is heavy)
    const WK = fs.readFileSync(path.join(REPO, 'src/server/sync-fs-witness-worker.js'), 'utf8');
    ok(/if \(!hold && stale >= \(boot \? holdMs : LH\.firstAskMs\(holdMs, beatMs\)\)\) \{ hold = startHold\(now, boot\);/.test(WK) && /LH\.sampleDue\(h\.k, now - h\.fromM, holdMs, samplesPerHold, LH\.firstAskMs\(holdMs, beatMs\)\)/.test(WK)
      && /if \(LH\.holdEndVerdict\(\{ first: h\.first, matched: !!g, lostSinceOpen: gapsLost - \(h\.lost0 \|\| 0\), msHi: h\.msHi, beatMs, holdMs \}\) === 'drop'\) \{ afterWait\.delete\(h\); h\.dropped = true; return; \}/.test(WK)
      && /lost0: gapsLost,/.test(WK) && /afterModule: J\.after && J\.after\.module \? J\.after\.module : null/.test(WK)
      && /const openHold = \(now\) => !!hold && \(hold\.first \|\| now - hold\.fromM >= holdMs\);/.test(WK) && (WK.match(/holdOpen: openHold\(now\)/g) || []).length === 2 && /if \(!openHold\(now\)\) takeCensusAsk\(\{ kind: 'capture'/.test(WK) && /if \(!openHold\(now\) && takeCensusAsk\(\{ kind: 'profile'/.test(WK)
      && /if \(h\.k === 0 && !h\.first && now - h\.fromM < holdMs && inflight\) return;/.test(WK),
      'the watchdog opens a candidate one beat before the bar (the boot\'s at the bar) and asks it there only when nothing is in flight; its end is the PURE verdict (a record with no ringed gap is no hold); the capture and the census count a record as a held tick only from the bar, and a capture or a profile takes the census\'s ask in flight until then; the fold gets the after-answer\'s module');
  }
  { // (its adversarial read F1) THE END OF A RECORD: the main thread rings every gap that is a hold — no ringed gap, no hold,
    // however late the watchdog read the beat (a 900 ms stall read a beat late gave «held 0.9–1.15 s», a hold that never was)
    const V = (o) => LH.holdEndVerdict({ beatMs: B, holdMs: H, ...o });
    const rows = { late: V({ msHi: 1150 }), lateLong: V({ msHi: 2650 }), matched: V({ matched: true, msHi: 1150 }), boot: V({ first: true, msHi: 300 }), overflow: V({ lostSinceOpen: 2, msHi: 1200 }), overflowShort: V({ lostSinceOpen: 2, msHi: 1000 }) };
    ok(rows.late === 'drop' && rows.lateLong === 'drop' && rows.matched === 'keep' && rows.boot === 'keep' && rows.overflow === 'estimate' && rows.overflowShort === 'drop',
      'a record with NO ringed gap is dropped whatever the late read of the beat says (1.15 s, 2.65 s); a ringed gap and the boot are kept; only a ring that overflowed since the record opened is estimated, and kept past the bar', rows);
    const SRC1 = fs.readFileSync(path.join(REPO, 'src/loop-hold.js'), 'utf8');
    const m = { exports: {} }; const from1 = '  if (lostSinceOpen > 0) return isGapHold(msHi, beatMs, holdMs) ? \'estimate\' : \'drop\';';
    if (SRC1.split(from1).length === 2) vm.compileFunction(editAnchor(SRC1, from1, '  return isGapHold(msHi, beatMs, holdMs) ? \'estimate\' : \'drop\';', "src/loop-hold.js"), ['module', 'exports', 'require'], { filename: 'loop-hold-7c97-f1.js' })(m, m.exports, require);
    const mut = m.exports.holdEndVerdict ? m.exports.holdEndVerdict({ beatMs: B, holdMs: H, msHi: 1150 }) : null;
    ok(mut === 'estimate', `RED CONTROL: judged by the late read of the beat (7089a8ee5's candidate rule), the 900 ms stall read a beat late is kept as a hold (${mut})`, mut);
  }
  // A SPAWN IS NAMED BY ITS CALLER: asleep on the exec-status pipe, the first JavaScript after it node's child_process start
  const SPAWN = (caller, line) => [['', 'node:diagnostics_channel', 314], ['spawn', 'node:internal/child_process', 489], ['spawn', 'node:child_process', 813], [caller, ROOT + '/src/' + line.split(':')[0], Number(line.split(':')[1])]];
  const sleepy = { cls: 'kernel', kind: 'none', words: 'asleep: anon_pipe_read in read', key: '(asleep: anon_pipe_read in read)', keyWords: '(asleep: anon_pipe_read in read)' };
  const foldWith = (L, after) => L.foldHold({ from: 0, to: 1300, ms: 1300, d: null, samples: [sleepy], after: after && after.words, afterKey: after && after.key, afterKeyWords: after && after.keyWords, afterModule: after && after.module });
  const mnt = ans(SPAWN('', 'mounts.js:1466')), job = ans(SPAWN('_spawn', 'jobs.js:1839')), busy = ans([['busyHog', ROOT + '/src/hogs.js', 2]]), anon = ans(SPAWN('', 'x.js:1').slice(0, 3));
  const fm = foldWith(LH, mnt), fj = foldWith(LH, job), fb = foldWith(LH, busy), fa = foldWith(LH, anon);
  ok(mnt.module === 'child_process' && fm.verdict === LH.V.blocked && fm.frameKey === 'src/mounts.js:1466 (starting a child process)' && fm.frame === 'asleep starting a child process — (anonymous) (src/mounts.js:1466)'
    && fj.frameKey === 'src/jobs.js:1839 (starting a child process)' && fj.frameKey !== fm.frameKey,
    `a hold asleep while starting a child process is the SPAWNER's row: «${fm.frame}» — the mount probe and the job start two rows, never one «anon_pipe_read» for every spawner (21.5 s in 16 holds)`, { fm, fj });
  { // (its adversarial read F2) a WHOLE synchronous child run (spawnSync / execFileSync: asleep in ep_poll, the first JavaScript
    // after it node's child_process) is WAITED for, never «starting»
    const ep = { cls: 'kernel', kind: 'none', words: 'asleep: ep_poll in epoll_wait', key: '(asleep: ep_poll in epoll_wait)', keyWords: '(asleep: ep_poll in epoll_wait)' };
    const sync = ans([['spawnSync', 'node:child_process', 870], ['execFileSync', 'node:child_process', 920], ['', ROOT + '/src/server/ops-routes.js', 188]]);
    const fs2 = LH.foldHold({ from: 0, to: 30000, ms: 30000, d: null, samples: [ep], after: sync.words, afterKey: sync.key, afterKeyWords: sync.keyWords, afterModule: sync.module });
    ok(sync.module === 'child_process' && fs2.frameKey === 'src/server/ops-routes.js:188 (waiting for a child process)' && fs2.frame === 'asleep waiting for a child process \u2014 (anonymous) (src/server/ops-routes.js:188)',
      `a hold asleep for a whole synchronous child run is the caller's, said as a WAIT: «${fs2.frame}» — never «starting» (that is the exec-status pipe's alone)`, fs2);
  }
  { // (its adversarial read F4) THE WATCHDOG'S ROAD: askOf → judgeAsks carry the after-answer's module into the hold's facts
    const J = LH.judgeAsks([{ postedAt: 400, answeredAt: 1290, state: 'asleep', kernel: 'anon_pipe_read in read', answer: mnt, beat: 3 }], { beat0: 3, holdEnd: 1300 });
    const fj2 = LH.foldHold({ from: 0, to: 1300, ms: 1300, d: null, samples: J.samples, after: J.after && J.after.words, afterKey: J.after && J.after.key, afterKeyWords: J.after && J.after.keyWords, afterModule: J.after && J.after.module });
    const SRC2 = fs.readFileSync(path.join(REPO, 'src/loop-hold.js'), 'utf8'), from2 = ', ...(answer.module ? { module: answer.module } : {}) } : null;';
    const m2 = { exports: {} }; if (SRC2.split(from2).length === 2) vm.compileFunction(editAnchor(SRC2, from2, ' } : null;', "src/loop-hold.js"), ['module', 'exports', 'require'], { filename: 'loop-hold-7c97-f4.js' })(m2, m2.exports, require);
    const J0 = m2.exports.judgeAsks ? m2.exports.judgeAsks([{ postedAt: 400, answeredAt: 1290, state: 'asleep', kernel: 'anon_pipe_read in read', answer: mnt, beat: 3 }], { beat0: 3, holdEnd: 1300 }) : null;
    const f0 = J0 ? m2.exports.foldHold({ from: 0, to: 1300, ms: 1300, d: null, samples: J0.samples, after: J0.after && J0.after.words, afterKey: J0.after && J0.after.key, afterKeyWords: J0.after && J0.after.keyWords, afterModule: J0.after && J0.after.module }) : null;
    ok(J.after && J.after.module === 'child_process' && fj2.frameKey === 'src/mounts.js:1466 (starting a child process)' && f0 && f0.frameKey === '(asleep: anon_pipe_read in read)',
      'the road the watchdog takes (an asleep ask → askOf → judgeAsks → the facts) carries the module to the fold; RED CONTROL: askOf without it folds every start into the wait channel again', { J: J.after, fj2: fj2.frameKey, red: f0 && f0.frameKey });
  }
  ok(fb.frameKey === '(asleep: anon_pipe_read in read)' && fa.frameKey === '(asleep: anon_pipe_read in read)',
    'a sleep followed by anything but a child process start (our own JavaScript) keeps its wait channel; a start with no frame of ours below it names nobody new', { fb: fb.frameKey, fa: fa.frameKey });
  { // RED CONTROLS (patched copies compiled in memory): the release's trim, the helper list without diagnostics_channel, no spawner rule
    const SRC = fs.readFileSync(path.join(REPO, 'src/loop-hold.js'), 'utf8');
    const load = (src) => { const m = { exports: {} }; vm.compileFunction(src, ['module', 'exports', 'require'], { filename: 'loop-hold-7c97-mutant.js' })(m, m.exports, require); return m.exports; };
    // B-0d3e: the anchor judged BY NAME — a moved or doubled anchor is a red row naming it and the file (then null: the RED
    // CONTROLS row below reds too, nothing crashes)
    const cut = (from, to) => { const n = SRC.split(from).length - 1; if (n !== 1) { ok(false, `ANCHOR (src/loop-hold.js): ${JSON.stringify(from).slice(0, 100)} — found ${n} times, one meant: the red control builds nothing`); return null; } return load(editAnchor(SRC, from, to, "src/loop-hold.js")); };
    const oldTrim = cut(" && !(f === '' && !(raw[i] && raw[i].evalish))) break; }", ') break; }');
    const noHelper = cut("'per_context', 'diagnostics_channel']", "'per_context']");
    const noSpawnBy = cut("const spawnBy = !topOf('js') && v === V.blocked && h.afterModule === 'child_process'", 'const spawnBy = false && !topOf(\'js\') && v === V.blocked && h.afterModule === \'child_process\'');
    const ansWith = (L, f) => { const sm = L.sampleOf(enc(f), ROOT); return L.framesAnswer(sm.frames, sm.form, sm.cut); };
    const red = { trim: oldTrim && /loop-blame\.js:64/.test(ansWith(oldTrim, R62).key), helper: noHelper && ansWith(noHelper, SPAWN('', 'mounts.js:1466')).module === 'diagnostics_channel', spawnBy: noSpawnBy && foldWith(noSpawnBy, mnt).frameKey === '(asleep: anon_pipe_read in read)' };
    ok(Object.values(red).every((v) => v === true), `RED CONTROLS: the release's trim keys the wrapper (${oldTrim && ansWith(oldTrim, R62).key}); without the helper the spawn is node's «diagnostics_channel»; without the spawner rule every start is one wait-channel row`, red);
  }
  { // (its verdict's shoulds, 08:54Z) A BAR UNDER THREE BEATS asks at the bar (one beat before it would sit within a beat of
    // an ordinary beat's age: a candidate and an ask at many checks); the SPAWN WORDS need the kernel's own sample (a blocked window with
    // no kernel sample keeps the «(after)» row — no evidence of the exec-status pipe nor of ep_poll)
    const FA = [[1000, 250, 750], [100, 20, 80], [90, 30, 60], [100, 50, 100], [100, 60, 100], [1000, 1000, 1000], [1000, 2000, 1000]];
    const faBad = FA.filter(([h, b, w]) => LH.firstAskMs(h, b) !== w);
    const NOK = { from: 0, to: 1300, ms: 1300, d: { wallMs: 1300, ranMs: 20 }, samples: [], after: mnt.words, afterKey: mnt.key, afterKeyWords: mnt.keyWords, afterModule: mnt.module };
    const fk = LH.foldHold(NOK);
    const SRC3 = fs.readFileSync(path.join(REPO, 'src/loop-hold.js'), 'utf8');
    const load3 = (src) => { const m = { exports: {} }; vm.compileFunction(src, ['module', 'exports', 'require'], { filename: 'loop-hold-7c97-cure.js' })(m, m.exports, require); return m.exports; };
    const cut3 = (from, to) => (SRC3.split(from).length === 2 ? load3(SRC3.replace(from, to)) : null);
    const noFloor = cut3('(holdMs >= 3 * beatMs ? holdMs - beatMs : holdMs)', 'Math.max(0, holdMs - beatMs)');   // stale-pins: kept (the red control rebuilds the line before this cure)
    const noKernelNeed = cut3(" && !/^\\(/.test(h.afterKey) && !!top;", " && !/^\\(/.test(h.afterKey);");   // stale-pins: kept (the red control rebuilds the line before this cure)
    const rk = noKernelNeed ? noKernelNeed.foldHold(NOK) : null;
    const redFA = noFloor ? FA.filter(([h, b, w]) => noFloor.firstAskMs(h, b) !== w).length : 0;
    ok(!faBad.length && fk.verdict === LH.V.blocked && fk.frameKey === `${mnt.key} (after)` && noFloor && noFloor.firstAskMs(1000, 1000) === 0 && redFA === 4 && rk && rk.frameKey === `${mnt.key} (waiting for a child process)`,
      `a bar of three beats or more asks one beat before it, a shorter bar at the bar itself (${FA.map(([h, b]) => `${h}/${b} → ${LH.firstAskMs(h, b)}`).join(', ')}); a blocked hold with no kernel sample keeps «${fk.frameKey}»; RED CONTROLS: the unit's first formula misses ${redFA} of the ${FA.length} rows and asks at 0 ms for a bar of one beat (${noFloor && noFloor.firstAskMs(1000, 1000)}), and the spawn words without the kernel's sample claim «${rk && rk.frameKey}»`, { faBad, fk: fk.frameKey, v: fk.verdict, rk: rk && rk.frameKey });
  }
}

console.log('⑯ the train\'s close (主开发 2026-11-18 12:37Z; test-loop-hold-live (D) red at 01a4d9a73) — round 4\'s two laws in the node-own rule');
{
  const OUT = '/tmp/lh-outside.js', CHILD = '/tmp/lh-child.cjs';   // files outside the repo (a plugin, a script under a symlink leading out)
  const loaded = (id) => id !== 'internal/forged';   // the runtime's loaded ids: every id here but the forged one
  const ans = (frames, L = LH) => { const sm = L.sampleOf(enc(frames), ROOT, null, null, loaded); return L.framesAnswer(sm.frames, sm.form, sm.cut); };
  const HR = ['hrtimeBigInt', 'node:internal/bootstrap/node', 436];   // the hog's own process.hrtime.bigint() (Node 24: bootstrap/node)
  const VMR = [['runInThisContext', 'node:vm', 316], ['', CHILD, 12], ['listOnTimeout', 'node:internal/timers', 594], ['processTimers', 'node:internal/timers', 529]];
  const D2 = [HR, ['outsideHog', OUT, 1], ...VMR];                        // (D) the hog under a repo symlink leading OUT
  const D3a = [['forgedInternal', 'node:internal/forged', 1], ...VMR];    // (D) a vm script calling itself node:internal/forged
  const D3b = [HR, ['forgedInternal', 'node:internal/forged', 1], ...VMR];
  const DEEP = [HR, ['pluginFn', OUT, 7], ['busyHog', ROOT + '/src/hogs.js', 38]];   // a plugin between the runtime and our code
  const NONE = [HR, ['', 'node:internal/timers', 594]];                 // nothing below the run
  const d2 = ans(D2), a = ans(D3a), b = ans(D3b), deep = ans(DEEP), none = ans(NONE);
  ok(d2.words === 'node’s own code — bootstrap, driven by (outside the repo)' && d2.key === '(outside the repo)' && !/outsideHog|lh-outside/.test(d2.words + d2.key + d2.keyWords) && deep.words === d2.words,
    `(b) THE DRIVER IS THE FIRST FRAME BELOW THE RUN: the hog's clock read on a script outside the repo is «${d2.words}» — never «with no frame of ours below it», never a deeper frame of ours past the plugin`, { d2, deep });
  ok(!/node’s own code/.test(a.words) && /node:internal\/forged:1/.test(a.words) && a.key === 'node:internal/forged:1' && !/forgedInternal/.test(a.words + a.key + a.keyWords)
    && b.words === 'node’s own code — bootstrap, driven by node:internal/forged:1' && !/forgedInternal/.test(b.words + b.key),
    `(a) ONLY AN ID THE RUNTIME LOADED IS THE RUNTIME'S OWN: a vm script named node:internal/forged is said by its location alone — «${a.words}» — and below a real runtime frame it is the driver by its location: «${b.words}»`, { a, b });
  ok(none.words.startsWith('node’s own code — bootstrap, with no frame of ours below it: ') && none.key === '(node’s own code — bootstrap)' && none.noOurs === true,
    'nothing below the run: «with no frame of ours below it: <the runtime\'s top frames>», keyed by the module, counted apart (noOurs)', none);
  // the holds, through the watchdog's own road (askOf → judgeAsks → the fold → the line), as the live suite reads them
  const FROM = 90000, TO = FROM + 300, B0 = 6;
  const hold = (answers) => { const J = LH.judgeAsks(answers.map((x, i) => ({ postedAt: FROM + 50 + i * 100, answeredAt: FROM + 50.05 + i * 100, state: 'running', answer: x, beat: B0 })), { beat0: B0, holdEnd: TO }); return LH.holdLine({ from: FROM, to: TO, fromM: FROM, toM: TO, ms: 300, samples: J.samples, outside: J.outside, d: null }); };
  const l2 = hold([d2, d2]), l3 = hold([a, b]);
  ok(/\(outside the repo\)/.test(l2) && !/outsideHog|link-out|lh-outside/.test(l2) && /node:internal\/forged/.test(l3) && !/forgedInternal/.test(l3) && !/node’s own code — forged/.test(l3),
    `the two (D) holds as the live suite reads them — «${l2}» · «${l3}»`, { l2, l3 });
  // RED CONTROLS: the tip as it was (01a4d9a73 / d1ff2d7c1), each law cut alone — a patched copy compiled in memory
  const SRC = fs.readFileSync(path.join(REPO, 'src/loop-hold.js'), 'utf8');
  const load = (src) => { const m = { exports: {} }; vm.compileFunction(src, ['module', 'exports', 'require'], { filename: 'loop-hold-close410-mutant.js' })(m, m.exports, require); return m.exports; };
  // B-0d3e: the anchor judged BY NAME — a moved or doubled anchor is a red row naming it and the file (then null: the RED
  // CONTROLS row below reds too, nothing crashes)
  const cut = (from, to) => { const n = SRC.split(from).length - 1; if (n !== 1) { ok(false, `ANCHOR (src/loop-hold.js): ${JSON.stringify(from).slice(0, 100)} — found ${n} times, one meant: the red control builds nothing`); return null; } return load(editAnchor(SRC, from, to, "src/loop-hold.js")); };
  const tipDriver = cut('driver: end < frames.length && frames[end] ? frames[end] : null };', 'driver: repoFrame(frames.slice(end)) };');   // stale-pins: kept (the red control rebuilds the tip's driver)
  const tipForged = cut("const runtimeOwn = (f) => !!f && f.cls === 'node' && f.notLoaded !== true;", "const runtimeOwn = (f) => !!f && f.cls === 'node';");
  const rd = tipDriver ? ans(D2, tipDriver) : null, rp = tipDriver ? ans(DEEP, tipDriver) : null, rf = tipForged ? ans(D3a, tipForged) : null;
  ok(rd && rd.words.startsWith('node’s own code — bootstrap, with no frame of ours below it') && rp && rp.words === 'node’s own code — bootstrap, driven by busyHog (src/hogs.js:38)' && rf && rf.words.startsWith('node’s own code — forged, '),
    `RED CONTROLS (the tip as it was): the driver read as the first frame OF OURS forgets the script outside the repo («${rd && rd.words}») and skips the plugin for our frame past it («${rp && rp.words}»); a forged id taken as the runtime's own: «${rf && rf.words}»`, { rd, rp, rf });
}

console.log('⑰ B-9f0c — the runtime\'s own ids, WHOLE: its bootstrap scripts and a lazily loaded module are the runtime\'s own; a forged id is not');
{
  const RT = LH.runtimeIdsOf({ bind: () => process.binding('natives'), argv: [], nodeOptions: '' });
  const ids = new Set(RT.ids), loadedList = (process.moduleLoadList || []).filter((x) => x.startsWith('NativeModule ')).map((x) => x.slice(13));
  ok(RT.why === null && ids.size > 300 && ids.has('internal/bootstrap/node') && ids.has('internal/bootstrap/realm') && ids.has('internal/deps/undici/undici') && !ids.has('internal/forged'),
    `${process.version}: the runtime's own ids (${ids.size}) hold its bootstrap scripts (realm: the loader's frames; node: hrtimeBigInt) and the lazy dependency undici — never a forged id`, { n: ids.size });
  // the watchdog's question as it asks it now (the loaded list ∪ the whole list) against the loaded list alone (before B-9f0c)
  const whole = new Set([...loadedList, ...ids]), only = new Set(loadedList);
  const ask = (frames, set) => { const sm = LH.sampleOf(enc(frames), ROOT, null, null, (id) => set.has(id)); return LH.framesAnswer(sm.frames, sm.form, sm.cut); };
  const D2 = [['hrtimeBigInt', 'node:internal/bootstrap/node', 436], ['outsideHog', '/tmp/lh-outside.js', 1], ['runInThisContext', 'node:vm', 316], ['listOnTimeout', 'node:internal/timers', 594]];
  const LAZY = [['__require', 'node:internal/deps/undici/undici', 6], ['compileForInternalLoader', 'node:internal/bootstrap/realm', 398], ['requireBuiltin', 'node:internal/bootstrap/realm', 429], ['lazyMessageEvent', 'node:internal/worker/io', 108], ['onMessageEvent', 'node:internal/worker/io', 320]];
  const FORGED = [['forgedInternal', 'node:internal/forged', 1], ['runInThisContext', 'node:vm', 316]];
  const w2 = ask(D2, whole), wl = ask(LAZY, whole), wf = ask(FORGED, whole);
  ok(w2.words === 'node’s own code — bootstrap, driven by (outside the repo)' && wl.words.startsWith('node’s own code — undici, ') && wl.key === '(node’s own code — undici)' && !/node’s own code/.test(wf.words) && /node:internal\/forged:1/.test(wf.words),
    `with the whole list the live shapes read as ruled: «${w2.words}» · «${wl.words}» · a forged id by its location «${wf.words}»`, { w2, wl, wf });
  const o2 = ask(D2, only), ol = ask(LAZY, only);
  const listsBootstrap = only.has('internal/bootstrap/node') && only.has('internal/bootstrap/realm');
  ok(listsBootstrap || (!/driven by \(outside the repo\)/.test(o2.words) && ol.key !== '(node’s own code — undici)'),
    listsBootstrap ? `${process.version}'s loaded list already names its bootstrap scripts — the control is moot on this Node` : `RED CONTROL (the loaded list alone, as before B-9f0c): «${o2.words}» · «${ol.words}» — the runtime's own frames read as not loaded`, { o2: o2.words, ol: ol.words });
  // THE BOX'S RED AT 25ef02f08 (主开发 13:35Z): a module the runtime loads AFTER the witness started — zlib, the pbkdf2 file —
  // is in the whole list and not in a start-time snapshot: the run goes THROUGH it and the driver is the hog
  const ZL = [['slice', 'node:buffer', 1], ['processChunkSync', 'node:zlib', 463], ['zlibBufferSync', 'node:zlib', 182], ['syncBufferWrapper', 'node:zlib', 816], ['zlibHog', ROOT + '/src/hogs.js', 9]];
  const PB = [['from', 'node:buffer', 300], ['pbkdf2Sync', 'node:internal/crypto/pbkdf2', 83], ['pbkdfHog', ROOT + '/src/hogs.js', 72]];
  const atStart = new Set([...loadedList.filter((x) => x !== 'zlib' && x !== 'internal/crypto/pbkdf2'), 'buffer']);   // the witness started before both loaded
  const atStartWhole = new Set([...atStart, ...ids]);
  const z = ask(ZL, atStartWhole), pk = ask(PB, atStartWhole), zr = ask(ZL, atStart), pr = ask(PB, atStart);
  ok(ids.has('zlib') && ids.has('internal/crypto/pbkdf2') && z.words === 'node’s own code — zlib, driven by zlibHog (src/hogs.js:9)' && z.key === 'src/hogs.js:9' && pk.words === 'node’s own code — crypto, driven by pbkdfHog (src/hogs.js:72)' && pk.key === 'src/hogs.js:72',
    `a sync zlib hold and a pbkdf2 hold whose modules loaded AFTER the witness started: the run goes through them, the hog drives — «${z.words}» · «${pk.words}»`, { z, pk });
  ok(zr.words === 'node’s own code — buffer, driven by node:zlib:463' && pr.words === 'node’s own code — buffer, driven by node:internal/crypto/pbkdf2:83',
    `RED CONTROL (the tip's list: the start-time snapshot alone): the box's two red lines word for word — «${zr.words}» · «${pr.words}»`, { zr: zr.words, pr: pr.words });
  // the flags: under --pending-deprecation the call prints DEP0111 (measured on Node 24.22.1 / 22.23.4) — never made there
  const never = () => { throw new Error('the binding was called'); };
  const f = [LH.runtimeIdsOf({ bind: never, argv: ['--pending-deprecation'] }), LH.runtimeIdsOf({ bind: never, nodeOptions: '--max-old-space-size=96 --pending-deprecation' }), LH.runtimeIdsOf({ bind: never }), LH.runtimeIdsOf({ bind: () => ({}) }), LH.runtimeIdsOf({ bind: () => ({ 'internal/x': 1 }), nodeOptions: '--pending-deprecations' })];
  ok(f[0].why === 'pending-deprecation' && f[1].why === 'pending-deprecation' && f[2].why === 'unavailable' && f[3].why === 'unavailable' && f[4].why === null && f[4].ids[0] === 'internal/x' && LH.RUNTIME_IDS_WORDS[f[0].why] && LH.RUNTIME_IDS_WORDS[f[2].why],
    'the call is never made under --pending-deprecation (argv or NODE_OPTIONS); a call that throws or answers nothing falls back by its fixed word', f.map((x) => x.why));
  const WK = fs.readFileSync(path.join(REPO, 'src/server/sync-fs-witness-worker.js'), 'utf8'), SWS = fs.readFileSync(path.join(REPO, 'src/server/sync-fs-witness.js'), 'utf8');
  ok(/const RUNTIME_IDS = LH\.runtimeIdsOf\(\{ bind: \(\) => process\.binding\('natives'\), argv: process\.execArgv, nodeOptions: process\.env\.NODE_OPTIONS \}\);/.test(WK) && /\.\.\.RUNTIME_IDS\.ids\]\);/.test(WK)
    && /if \(RUNTIME_IDS\.why\) \{ try \{ parentPort && parentPort\.postMessage\(\{ ev: 'idsFallback', why: RUNTIME_IDS\.why \}\); \} catch \{ \} \}/.test(WK)
    && /if \(m && m\.ev === 'idsFallback'\) \{ const w = LH\.RUNTIME_IDS_WORDS\[m\.why\]; if \(w\) \{ try \{ log\.warn\?\.\(`\[sync-fs\] the watchdog names node frames from the modules loaded at its start/.test(SWS),
    'the watchdog thread asks the whole list with its own flags and says a fallback ONCE; the witness turns it into ONE journal line of fixed words');
}

console.log('⑱ 主开发 2026-11-18 12:20Z — a stack that ends in the runtime, or is cut before any frame of ours, says so: never the measuring wrapper\'s line');
{
  const ans = (frames, L = LH) => { const sm = L.sampleOf(enc(frames), ROOT); return L.framesAnswer(sm.frames, sm.form, sm.cut); };
  // every control of this section is built from an ANCHOR in src/loop-hold.js and fails BY NAME when the anchor is not there once
  const mutantLH = (name, anchor, repl) => {
    const src = fs.readFileSync(path.join(REPO, 'src/loop-hold.js'), 'utf8');
    if (src.split(anchor).length !== 2) { ok(false, `the anchor of the control «${name}» is not in the source (once): ${JSON.stringify(anchor.trim())}`); return null; }
    const m = { exports: {} };
    vm.compileFunction(editAnchor(src, anchor, () => repl, "src/loop-hold.js"), ['module', 'exports', 'require'], { filename: `loop-hold-${name}-mutant.js` })(m, m.exports, require);
    return m.exports;
  };
  const LBF = ROOT + '/src/server/loop-blame.js', SWF = ROOT + '/src/server/sync-fs-witness.js', LDR = 'node:internal/modules/cjs/loader';
  // a wrapped realpathSync made by node's own module loader: nothing of the tree below it (the owner's incident row)
  const RUNTIME = [['', '', 0], ['realpathSync', 'node:fs', 2878], ['wrapped', LBF, 64], ['toRealPath', LDR, 467], ['Module._findPath', LDR, 700], ['Module._resolveFilename', LDR, 1180], ['Module._load', LDR, 1010], ['require', 'node:internal/modules/helpers', 136]];
  // the witness's hook INSIDE the wrapper (its clock, its slot) goes with the wrapper
  const HOOKED = [['liveBegin', SWF, 139], ['before', SWF, 174], ['wrapped', LBF, 60], ['toRealPath', LDR, 467], ['Module._findPath', LDR, 700]];
  // a FULL answer (31 frames) cut inside the loader under the wrapper: a frame of ours may lie beyond the cut
  const CUT31 = [['', '', 0], ['statSync', 'node:fs', 1700], ['wrapped', LBF, 64], ...Array.from({ length: 28 }, (_, i) => [`f${i}`, LDR, 100 + i])];
  const rt = ans(RUNTIME), hk = ans(HOOKED), c31 = ans(CUT31);
  const NO = 'with no frame of ours below it', CUTW = 'the stack cut before any frame of ours';
  ok(rt.words.startsWith(`node’s own code — fs, ${NO}: `) && /realpathSync \(node:fs:2878\)/.test(rt.words) && !/loop-blame/.test(rt.words + rt.key + rt.keyWords) && rt.key === '(node’s own code — fs)' && rt.noOurs === true,
    `a wrapped call made by node's own loader, nothing of ours below it: «${rt.words}» — the runtime's own top frames, keyed by the module, never «src/server/loop-blame.js:64»`, rt);
  ok(!/sync-fs-witness|loop-blame/.test(hk.words + hk.key) && hk.noOurs === true && CUT31.length === LH.SAMPLE_FRAMES && c31.words.startsWith(`node’s own code — fs, ${CUTW}: `) && c31.noOurs === true && !/loop-blame/.test(c31.key + c31.words),
    `the witness's hook inside the wrapper goes with it («${hk.words}»); a full answer cut inside the loader says «${CUTW}» with its top frames, never the wrapper's line`, { hk, c31 });
  // the hold, through the watchdog's own road (askOf → judgeAsks → the fold), and an «after» row from the same answer
  const FROM = 70000, TO = FROM + 1400, B0 = 4;
  const q = (at, late, state = 'running') => ({ postedAt: FROM + at, answeredAt: FROM + at + (late ? 1000 : 0.05), state, answer: rt, beat: B0 });
  const J = LH.judgeAsks([q(300), q(700)], { beat0: B0, holdEnd: TO }), hj = { from: FROM, to: TO, fromM: FROM, toM: TO, ms: 1400, samples: J.samples, outside: J.outside, d: null };
  const fo = LH.foldHold(hj), line = LH.holdLine(hj);
  const JA = LH.judgeAsks([q(300, true)], { beat0: B0, holdEnd: TO });
  const fa = LH.foldHold({ from: FROM, to: TO, fromM: FROM, toM: TO, ms: 1400, samples: JA.samples, outside: JA.outside, d: null, after: JA.after && JA.after.words, afterKey: JA.after && JA.after.key, afterKeyWords: JA.after && JA.after.keyWords, afterModule: JA.after && JA.after.module });
  const ours = LH.foldHold({ from: FROM, to: TO, fromM: FROM, toM: TO, ms: 1400, samples: LH.judgeAsks([{ ...q(300), answer: ans([['busyHog', ROOT + '/src/hogs.js', 38]]) }], { beat0: B0, holdEnd: TO }).samples, outside: {}, d: null });
  ok(fo.verdict === LH.V.tie && fo.noOurs === true && line.includes(`node’s own code — fs, ${NO}: `) && !/loop-blame/.test(line) && fa.frameKey === '(node’s own code — fs) (after)' && fa.noOurs === false && ours.noOurs === false,
    `the hold says it — ${line}; its fold is marked for the day report (noOurs — under r5456's tie too: the class changed, never the frame); an «after» row from the same answer (read only when no ask found JavaScript: «${fa.verdict}») keeps that verdict as its cause, unmarked (its second reader's S1); a hold of our own code never`, { fo: { v: fo.verdict, k: fo.frameKey, n: fo.noOurs }, fa: { k: fa.frameKey, n: fa.noOurs }, ours: ours.noOurs });
  { // r5456's RED for the mark: the release's mark line (the verdict «JavaScript» alone) drops it on that tie — the day report would
    // count the runtime's own hold under the tie's cause, never «no frame of ours»
    const M5456 = '  const noOurs = (v === V.js || (nodeOwnJs && v === V.tie)) && !!jsTop && samples.every((x) => clsOf(x) !== \'js\' || x.key !== jsTop.key || x.noOurs === true);\n';
    const mr = mutantLH('r5456-mark-js-alone', M5456, '  const noOurs = v === V.js && !!jsTop && samples.every((x) => clsOf(x) !== \'js\' || x.key !== jsTop.key || x.noOurs === true);\n');   // stale-pins: kept — the release's mark line, this RED's replacement (gone from the product on purpose)
    const fr = mr ? mr.foldHold(hj) : null;
    ok(fr && fr.verdict === LH.V.tie && fr.noOurs === false, `CONTROL r5456 (the release's mark line, in a copy) on that tie: the mark is lost — red by name (${fr && fr.verdict}, noOurs ${fr && fr.noOurs})`, fr && { v: fr.verdict, n: fr.noOurs });
  }
  { // the main thread hands the fold's mark to the day report; the watchdog thread carries none for an «after» row
    const WK = fs.readFileSync(path.join(REPO, 'src/server/sync-fs-witness-worker.js'), 'utf8'), HL = fs.readFileSync(path.join(REPO, 'src/server/loop-holds.js'), 'utf8');
    ok(!/afterNoOurs/.test(WK) && /f\(\{ ms: h\.ms, verdict: h\.fold\.verdict, frame: h\.fold\.frame, boot: !!h\.boot, noOurs: !!h\.fold\.noOurs \}\)/.test(HL),
      'the watchdog thread carries no «after» mark into the hold\'s facts (an «after» row never marks a hold); the main thread hands the fold\'s mark to the hour\'s tally (loop-day-report)');
  }
  // (its reader's S1) the wrapper's OWN clock read inside it — perfNow → performance.now — goes with the wrapper: a runtime frame
  // stays only when the wrapper itself called it (the wrapped call's work)
  const CLOCK = [['now', 'node:internal/perf/utils', 30], ['perfNow', LBF, 61], ['wrapped', LBF, 75], ['toRealPath', LDR, 467], ['Module._findPath', LDR, 700]];
  const ck = ans(CLOCK);
  const KEEPALL = '    if (k === w) left.push(raw[j]);\n';
  const mk = mutantLH('keep-all', KEEPALL, '    left.push(raw[j]);\n');
  const ckRed = mk ? ans(CLOCK, mk) : null;
  ok(ck.words.startsWith(`node’s own code — modules, ${NO}: `) && !/perf|loop-blame/.test(ck.words + ck.key) && ck.noOurs === true && ckRed && /node’s own code — perf/.test(ckRed.words),
    `the wrapper's own clock read under a loader-made call goes with the wrapper: «${ck.words}»; RED CONTROL (every runtime frame inside the wrapper kept): «${ckRed && ckRed.words}»`, { ck, ckRed });
  { // (its reader's M1) the watchdog thread hands each sample's mark to the main thread; the hold's record carries it to the day table
    const WK = fs.readFileSync(path.join(REPO, 'src/server/sync-fs-witness-worker.js'), 'utf8'), HB = fs.readFileSync(path.join(REPO, 'src/server/loop-holds.js'), 'utf8');
    ok(/keyWords: x\.keyWords, \.\.\.\(x\.noOurs === true \? \{ noOurs: true \} : \{\}\)/.test(WK) && /\$\{h\.fold\.noOurs \? ' · \(no frame of ours\)' : ''\}\$\{h\.boot \? ' · \(the boot\)' : ''\}/.test(HB),
      'the watchdog thread\'s samples keep their mark across the thread (the fold\'s JavaScript top reads it live); the hold\'s journal record says it for the day table');
  }
  // (its second reader's S1 / S2) THE MARK IS THE «JavaScript» VERDICT'S ALONE, and EVERY sample of the row says it: the same
  // runtime-only row under a window that says «waiting for a CPU» keeps that verdict as its cause, as the release booked it;
  // a plugin's stack topped by a built-in shares the key «(built-in)» with a stack of built-ins alone and never marks the hold
  const WAITD = { wallMs: 1400, ranMs: 300, waitMs: 1000 };
  const fw = LH.foldHold({ ...hj, d: WAITD });
  const MARK = '  const noOurs = (v === V.js || (nodeOwnJs && v === V.tie)) && !!jsTop && samples.every((x) => clsOf(x) !== \'js\' || x.key !== jsTop.key || x.noOurs === true);\n';
  const mv = mutantLH('any-verdict', MARK, '  const noOurs = !!jsTop && samples.every((x) => clsOf(x) !== \'js\' || x.key !== jsTop.key || x.noOurs === true);\n');
  const fwRed = mv ? mv.foldHold({ ...hj, d: WAITD }) : null;
  ok(fw.verdict === LH.V.waiting && fw.frameKey === '(node’s own code — fs)' && fw.noOurs === false && fwRed && fwRed.verdict === LH.V.waiting && fwRed.noOurs === true,
    `a runtime-only row under «${fw.verdict}» keeps that verdict as the hold's cause, unmarked; RED CONTROL (the mark under any verdict): noOurs ${fwRed && fwRed.noOurs}`, { fw: { v: fw.verdict, k: fw.frameKey, n: fw.noOurs }, red: fwRed && fwRed.noOurs });
  const PLUG = [['', '', 0], ['plugHog', '/opt/a-plugin/hog.js', 12]], BUILT = [['', '', 0], ['', '', 0]];
  const pa = ans(PLUG), ba = ans(BUILT);
  const hp = { from: FROM, to: TO, fromM: FROM, toM: TO, ms: 1400, samples: LH.judgeAsks([{ ...q(200), answer: pa }, { ...q(500), answer: pa }, { ...q(800), answer: ba }], { beat0: B0, holdEnd: TO }).samples, outside: {}, d: null };
  const fp = LH.foldHold(hp);
  const msm = mutantLH('one-sample', MARK, '  const noOurs = (v === V.js || (nodeOwnJs && v === V.tie)) && !!jsTop && samples.some((x) => clsOf(x) === \'js\' && x.key === jsTop.key && x.noOurs === true);\n');
  const fpRed = msm ? msm.foldHold(hp) : null;
  ok(pa.key === '(built-in)' && !pa.noOurs && ba.key === '(built-in)' && ba.noOurs === true && fp.verdict === LH.V.js && fp.frameKey === '(built-in)' && fp.noOurs === false && fpRed && fpRed.noOurs === true,
    `a plugin's hold topped by a built-in (key «${fp.frameKey}», shared with a stack of built-ins alone) is never marked; RED CONTROL (one marked sample of the row marks it): noOurs ${fpRed && fpRed.noOurs}`, { pa, ba, fp: { v: fp.verdict, k: fp.frameKey, n: fp.noOurs }, red: fpRed && fpRed.noOurs });
  // RED CONTROL: the release's trim (a run that reaches the stack's end is kept whole) names the wrapper's line
  const CUTR = '  if (w < 0) return raw;\n';
  const m = mutantLH('cutstack', CUTR, '  return raw;\n');
  const rel = m ? ans(RUNTIME, m) : null;
  ok(rel && rel.key === 'src/server/loop-blame.js:64' && /loop-blame/.test(rel.words) && !rel.noOurs, `RED CONTROL: the release's trim keeps the stack whole and names the wrapper's line — «${rel && rel.words}»`, rel);
}

console.log('r116 + r147 (lane hub-loop-stalls): an ask at the hold\'s EDGE is its LAST MOMENT, never its class; a tie on the CPU says BOTH');
{
  // BOTH edge cases MADE by construction — an ask placed inside the hold's last SESSION_MS (answered 3–4 ms before its end), never by
  // luck or load — on a window that says the thread was on the CPU the whole hold: (1) a native call's own continuation answered it
  // (afterParse ← jsonHog); (2) a TRUE JavaScript hold's own last moment answered it (busyHog). One sample cannot tell them apart.
  const FROM = 30000, B0 = 9;
  const Rw = (at, f) => R(at, f || { ut: 0, st: 0, run: 0, wait: 0 });
  const winCpu = (ms) => LH.schedDelta(Rw(FROM, { ut: 0, st: 0, run: 0, wait: 0 }), Rw(FROM + ms, { ut: ms / 10, st: 0, run: ms, wait: 0 }));
  const CONT = { kind: 'js', words: 'afterParse (src/hogs.js:4) ← jsonHog (src/hogs.js:5)', key: 'src/hogs.js:4', keyWords: 'afterParse (src/hogs.js:4)' };
  const BUSY = { kind: 'js', words: 'busyHog (src/hogs.js:2)', key: 'src/hogs.js:2', keyWords: 'busyHog (src/hogs.js:2)' };
  const native = (postedAt, fr = CONT) => ({ postedAt, answeredAt: postedAt + 30, state: 'running', answer: fr, beat: B0 });   // posted on the CPU, answered late
  const jsAt = (postedAt, fr) => ({ postedAt, answeredAt: postedAt + 0.3, state: 'running', answer: fr, beat: B0 });   // answered at JavaScript speed
  const holdOf = (Lh, asks, ms, d = winCpu(ms), extra = {}) => {
    const TO = FROM + ms, J = Lh.judgeAsks(asks, { beat0: B0, holdEnd: TO });
    const h = { from: FROM, to: TO, fromM: FROM, toM: TO, ms, msHi: ms, samples: J.samples, outside: J.outside, after: J.after && J.after.words, afterKey: J.after && J.after.key, last: J.last && J.last.words, d, ...extra };
    return { J, fo: Lh.foldHold(h), line: Lh.holdLine(h) };
  };
  const words = (line) => { const i = line.indexOf(' — '); return i < 0 ? line : line.slice(i + 3, i + 140); };
  const LAST = (fr) => `its last moment: ${fr.words} (the held work's end, or the JavaScript right after it)`;
  // (1) THE ONE-ASK NATIVE SHAPE and (2) THE ONE-ASK JAVASCRIPT SHAPE: the same neutral words, the window's own verdict, never a class
  const c1 = holdOf(LH, [jsAt(FROM + 1196, CONT)], 1200), c2 = holdOf(LH, [jsAt(FROM + 1196, BUSY)], 1200);
  ok(c1.J.samples.length === 0 && c1.J.outside.edge === 1 && c1.fo.verdict === LH.V.unsampled && c1.line.includes(LAST(CONT)) && !c1.line.includes('the first JavaScript after it'),
    `(1) a native call's continuation answered the one ask: the window's own verdict («${c1.fo.verdict}»), the ask said as its last moment — never «JavaScript», never «after it»: «${words(c1.line)}…»`, c1.line);
  ok(c2.fo.verdict === LH.V.unsampled && c2.line.includes(LAST(BUSY)) && !c2.line.includes('the first JavaScript after it'),
    `(2) a TRUE JavaScript hold's last moment answered the one ask: the same neutral words — true in both cases — and the window's own verdict («${c2.fo.verdict}»)`, c2.line);
  // (3) THE TWO-ASK NATIVE SHAPE: an inside sample keeps its class; (4) a JavaScript hold with inside samples stays JavaScript, its edge said apart
  const c3 = holdOf(LH, [native(FROM + 750), jsAt(FROM + 2097, CONT)], 2100), c4 = holdOf(LH, [jsAt(FROM + 750, BUSY), jsAt(FROM + 2000, BUSY), jsAt(FROM + 2996, BUSY)], 3000);
  // (its read 3 M1) the law's own two-ask native shape: the late answer and the edge ask land in ONE frame — said once, AND as its last moment
  const ALSO = ` — also its last moment (the held work's end, or the JavaScript right after it)`;
  ok(c3.fo.verdict === LH.V.native && c3.line.includes(`the first JavaScript after it: ${CONT.words}${ALSO}`) && c4.fo.verdict === LH.V.js && c4.line.includes(LAST(BUSY)),
    `(3) a native sample inside + an edge ask in the same frame ⇒ native, the frame said once — after it, and also its last moment; (4) JavaScript samples inside + an edge ask ⇒ JavaScript, its last moment said apart — «${words(c3.line)}…» / «${c4.fo.verdict}»`, { c3: c3.line, c4: c4.line });
  // the shapes the read named unlegged: an edge-only hold with NO window; two edge asks (the latest frame, said once); an unreadable edge frame
  const e0 = holdOf(LH, [jsAt(FROM + 1196, CONT)], 1200, null), e2 = holdOf(LH, [jsAt(FROM + 1185, BUSY), jsAt(FROM + 1196, CONT)], 1200);
  const eu = holdOf(LH, [jsAt(FROM + 1196, { kind: 'js', words: LH.KEYS.unreadable, key: LH.KEYS.unreadable, keyWords: LH.KEYS.unreadable })], 1200);
  ok(e0.fo.verdict === LH.V.unknown && e0.line.includes(LAST(CONT)) && e2.J.outside.edge === 2 && e2.line.includes(LAST(CONT)) && e2.line.split('its last moment: ').length === 2 && eu.J.outside.edge === 1 && !eu.line.includes('its last moment: '),
    `no window: the edge-only hold says «${e0.fo.verdict}» and its last moment; two edge asks: the latest frame, said once; an unreadable edge frame: counted, no frame`, { e0: e0.line, e2: e2.line, eu: eu.line });
  // (its read 4 S2) a deep stack answered at the edge is the edge too — its answer time (the worker's receipt) is an upper bound; never the hold's name
  const deepA = LH.askOf({ postedAt: FROM + 1190, answeredAt: FROM + 1199, state: 'running', answer: { kind: 'js', deep: true, words: LH.WORDS.deep, key: LH.KEYS.deep, keyWords: LH.KEYS.deep }, beat: B0, beat0: B0, holdEnd: FROM + 1200 });
  const deepIn = LH.askOf({ postedAt: FROM + 750, answeredAt: FROM + 751, state: 'running', answer: { kind: 'js', deep: true, words: LH.WORDS.deep, key: LH.KEYS.deep, keyWords: LH.KEYS.deep }, beat: B0, beat0: B0, holdEnd: FROM + 1200 });
  ok(deepA.cls === 'edge' && !deepA.last && deepIn.cls === 'js', `a deep stack answered at the edge is the edge («${deepA.cls}», no frame said); well inside it is a JavaScript sample («${deepIn.cls}»)`, { deepA, deepIn });
  // (its read 4 S4 / read 5 S1) a one-ask edge hold says «last moment» ONCE: «answered as it ended» + its frame, or — no frame to say — «answered at its last moment»
  const edgeWords = (l) => (l.split('not sampled (').slice(-1)[0] || '').slice(0, 110);
  ok(c1.line.split('last moment').length === 2 && c1.line.includes('answered as it ended') && eu.line.split('last moment').length === 2 && eu.line.includes('answered at its last moment'),
    `a one-ask edge hold says its last moment once — with its frame («${edgeWords(c1.line)}…»), and with none («${edgeWords(eu.line)}…»)`, { c1: c1.line, eu: eu.line });
  // (its read 4 N8) a native sample inside + an edge ask in ANOTHER frame: both said, the last moment once
  const c5 = holdOf(LH, [native(FROM + 750), jsAt(FROM + 2097, BUSY)], 2100);
  ok(c5.fo.verdict === LH.V.native && c5.line.includes(`the first JavaScript after it: ${CONT.words};`) && c5.line.includes(LAST(BUSY)) && c5.line.split('last moment').length === 2, `a native sample + an edge ask in another frame: native, the late answer after it, the edge as its last moment once`, c5.line);
  // CONTROLS (green on the release too — they guard the cure, they are no REDs): samples only inside native work ⇒ native; one inside JavaScript sample ⇒ JavaScript
  const nat = holdOf(LH, [native(FROM + 750), native(FROM + 2000)], 3000), js1 = holdOf(LH, [jsAt(FROM + 750, BUSY)], 1300);
  ok(nat.fo.verdict === LH.V.native && js1.fo.verdict === LH.V.js, `CONTROLS: samples only inside native work ⇒ native (${nat.fo.verdict}); one JavaScript sample well inside ⇒ JavaScript (${js1.fo.verdict})`, { nat: nat.line, js1: js1.line });
  // (5) A TIE INSIDE (a window): BOTH, in the order they came, each counted, in the line; the table and the day report keep ONE fixed word
  const tNJ = holdOf(LH, [native(FROM + 750), jsAt(FROM + 2000, BUSY)], 3000), tJN = holdOf(LH, [jsAt(FROM + 750, BUSY), native(FROM + 2000)], 3000);
  const T = new Map(); LH.tableAdd(T, tNJ.fo, 3000); LH.tableAdd(T, tJN.fo, 3000);
  ok(tNJ.fo.verdict === LH.V.tie && tJN.fo.verdict === LH.V.tie && words(tNJ.line).startsWith(`${LH.V.native} ×1 and ${LH.V.js} ×1 (a tie, in the order they came)`) && words(tJN.line).startsWith(`${LH.V.js} ×1 and ${LH.V.native} ×1 (a tie, in the order they came)`) && T.size === 1,
    `(5) a tie on the CPU: the line says both, counted, in order («${words(tNJ.line).slice(0, 90)}…»); the table keeps ONE row under «${LH.V.tie}» (${T.size})`, { a: tNJ.line, b: tJN.line });
  // (6) THE NO-WINDOW TIE: the samples alone — the same both-words, never a winner by list order
  const tNo = holdOf(LH, [native(FROM + 750), jsAt(FROM + 2000, BUSY)], 3000, null);
  ok(tNo.fo.verdict === LH.V.tie && words(tNo.line).startsWith(`${LH.V.native} ×1 and ${LH.V.js} ×1 (a tie, in the order they came)`), `(6) no scheduler window: a tie says both too («${words(tNo.line).slice(0, 90)}…»)`, tNo.line);
  // (its read 4 NIT) the no-window tie production makes: without a window a late ask is «runnable», never «native»
  const runnableAt = (postedAt) => ({ postedAt, answeredAt: postedAt + 30, state: 'running', answer: CONT, beat: B0 });
  const TOw = FROM + 3000, Jw = LH.judgeAsks([runnableAt(FROM + 750), jsAt(FROM + 2000, BUSY)], { beat0: B0, holdEnd: TOw, windowed: false });
  const hw = { from: FROM, to: TOw, fromM: FROM, toM: TOw, ms: 3000, msHi: 3000, samples: Jw.samples, outside: Jw.outside, after: Jw.after && Jw.after.words, d: null };
  const fw = LH.foldHold(hw), lw = LH.holdLine(hw);
  ok(fw.verdict === LH.V.tie && words(lw).startsWith(`${LH.V.runnable} ×1 and ${LH.V.js} ×1 (a tie, in the order they came)`), `the no-window tie as production makes it: «${words(lw).slice(0, 100)}…»`, lw);
  // (r237's should) a THREE-way tie with no window names all three, in the order they came — never two of them
  const unreadAt = (postedAt) => ({ postedAt, answeredAt: postedAt + 30, state: 'unknown', answer: CONT, beat: B0 });
  const J3 = LH.judgeAsks([runnableAt(FROM + 750), jsAt(FROM + 1500, BUSY), unreadAt(FROM + 2200)], { beat0: B0, holdEnd: TOw, windowed: false });
  const h3 = { from: FROM, to: TOw, fromM: FROM, toM: TOw, ms: 3000, msHi: 3000, samples: J3.samples, outside: J3.outside, after: J3.after && J3.after.words, d: null };
  const f3 = LH.foldHold(h3), l3 = LH.holdLine(h3);
  ok(f3.verdict === LH.V.tie && l3.includes(` — ${LH.V.runnable} ×1 and ${LH.V.js} ×1 and ${LH.V.notJs} ×1 (a tie, in the order they came): `), `a three-way tie with no window names all three, in order (the whole line read — the three words run past the short excerpt): «${words(l3).slice(0, 150)}…»`, l3);
  { // its RED CONTROL: the copy that words a no-window tie over the CPU classes first names two of the three
    const SRC3 = fs.readFileSync(path.join(REPO, 'src/loop-hold.js'), 'utf8'), A3 = "(h.d && h.d.wallMs > 0 ? tieWords(nv, CPU_CLS, fa, gcShare) : tieWords(nv, ['js', 'native', 'runnable', 'notJs'], fa, false))";   // r5456: the fold's counts are `nv` (a node-own fast sample counts as native too)
    let red3 = null;
    if (SRC3.split(A3).length !== 2) ok(false, `the anchor of the control «tie-two-of-three» is not in src/loop-hold.js (once)`);
    else { const m = { exports: {} }; vm.compileFunction(anchored(SRC3, A3, "(tieWords(nv, CPU_CLS, fa, gcShare) || tieWords(nv, ['js', 'native', 'runnable', 'notJs'], fa, false))", 'tie-two-of-three'), ['module', 'exports', 'require'], { filename: 'loop-hold-tie-two-of-three-mutant.js' })(m, m.exports, require); red3 = m.exports.holdLine(h3); }   // stale-pins: kept (the RED's copy of the old wording, deliberately absent from the product)
    ok(!!red3 && !red3.includes(` — ${LH.V.runnable} ×1 and ${LH.V.js} ×1 and ${LH.V.notJs} ×1 (a tie, in the order they came): `), `RED CONTROL (the CPU classes first): the three-way no-window tie names two of three («${red3 && words(red3).slice(0, 110)}…»)`, red3);
  }
  // (its read 3 S1) the tie's native word names a collection only on the verdict's own rule (its SHARE), never the observer merely on
  const tGc0 = holdOf(LH, [native(FROM + 750), jsAt(FROM + 2000, BUSY)], 3000, winCpu(3000), { gc: [] });
  ok(tGc0.fo.verdict === LH.V.tie && words(tGc0.line).startsWith(`${LH.V.native} ×1 and ${LH.V.js} ×1`), `the collector observed, no collection: the tie says «${LH.V.native}», never «${LH.V.gc}» («${words(tGc0.line).slice(0, 70)}…»)`, tGc0.line);
  // (its read 3 S2) the day report books a tie under its fixed word — never under its JavaScript sample's frame (a JavaScript hold keeps its frame)
  const LDR = require(path.join(REPO, 'src/loop-day-report.js'));
  // (its read 4 S1) a tie that is one part of two books under the tie's word too
  const cTie2 = LDR.causeOf({ verdict: `${LH.V.tie}, then ${LH.V.blocked}`, frame: BUSY.words });
  const cTie = LDR.causeOf({ verdict: LH.V.tie, frame: BUSY.words }), cJs = LDR.causeOf({ verdict: LH.V.js, frame: BUSY.words });
  ok(cTie === LH.V.tie && cTie2 === LH.V.tie && cJs === 'src/hogs.js:2', `the day report: a tie books under «${cTie}» — alone or a part of two (${cTie2}); a JavaScript hold under its frame (${cJs})`, { cTie, cTie2, cJs });
  // THE RED CONTROLS, each over the copy that lacks its rule
  const mut = (name, anchor, repl) => {
    const src = fs.readFileSync(path.join(REPO, 'src/loop-hold.js'), 'utf8');
    if (src.split(anchor).length !== 2) { ok(false, `the anchor of the control «${name}» is not in the source (once): ${JSON.stringify(anchor.trim().slice(0, 80))}`); return null; }
    const m = { exports: {} };
    vm.compileFunction(anchored(src, anchor, repl, name), ['module', 'exports', 'require'], { filename: `loop-hold-${name}-mutant.js` })(m, m.exports, require);
    return m.exports;
  };
  const noEdge = mut('no-edge', '  if (fast && ranInside && framed && Number.isFinite(holdEnd) && Number.isFinite(answeredAt) && holdEnd - answeredAt <= SESSION_MS) {', '  if (false) {');
  const asAfter = mut('edge-as-after', "    if (a.cls === 'edge') { outside.edge++; if (a.last) last = a.last; continue; }", "    if (a.cls === 'edge') { outside.edge++; if (a.last && !after) after = a.last; continue; }");
  const noTie = mut('no-tie', '  const cpuV = tie ? V.tie : (', '  const cpuV = (');
  const noAlso = mut('no-also', "${h.last && h.last === h.after ? ' — also its last moment (the held work\\'s end, or the JavaScript right after it)' : ''}", '');
  const noTieNoWin = mut('no-tie-no-window', "  if (top === 'js' && tieWords(n, ['js', 'native', 'runnable', 'notJs'], firstAt, gc)) return V.tie;", '');
  const r4 = noAlso ? holdOf(noAlso, [native(FROM + 750), jsAt(FROM + 2097, CONT)], 2100) : null, r5 = noTieNoWin ? holdOf(noTieNoWin, [native(FROM + 750), jsAt(FROM + 2000, BUSY)], 3000, null) : null;
  ok(!!r4 && !r4.line.includes('its last moment'), `RED (the same frame dropped — read 3's M1): the two-ask native hold never says its last moment`, r4 && r4.line);
  ok(!!r5 && r5.fo.verdict !== LH.V.tie, `RED (no window, a winner by list order): the tie reads «${r5 && r5.fo.verdict}»`, r5 && r5.line);
  const ldrSrc = fs.readFileSync(path.join(REPO, 'src/loop-day-report.js'), 'utf8'), TIE_LINE = "  if (typeof verdict === 'string' && verdict.split(', then ').includes(TIE)) return TIE;";
  let rTie = null;
  if (ldrSrc.split(TIE_LINE).length !== 2) ok(false, `the anchor of the control «tie-by-frame» is not in src/loop-day-report.js (once): ${JSON.stringify(TIE_LINE.trim().slice(0, 80))}`);
  else { const m = { exports: {} }; vm.compileFunction(anchored(ldrSrc, TIE_LINE, '', 'tie-by-frame'), ['module', 'exports', 'require'], { filename: 'loop-day-report-tie-by-frame-mutant.js' })(m, m.exports, require); rTie = m.exports.causeOf({ verdict: LH.V.tie, frame: BUSY.words }); }
  ok(rTie === 'src/hogs.js:2', `RED (a tie booked by its frame): the day report books the tie under «${rTie}» — the JavaScript hog where half the time was native`, rTie);
  const r1 = noEdge ? holdOf(noEdge, [jsAt(FROM + 1196, CONT)], 1200) : null, r2 = asAfter ? holdOf(asAfter, [jsAt(FROM + 1196, BUSY)], 1200) : null, r3 = noTie ? holdOf(noTie, [native(FROM + 750), jsAt(FROM + 2000, BUSY)], 3000) : null;
  ok(!!r1 && r1.fo.verdict === LH.V.js, `RED (no edge rule — the release): the native continuation's one ask names the hold «${r1 && r1.fo.verdict}»`, r1 && r1.line);
  ok(!!r2 && r2.line.includes('the first JavaScript after it: busyHog'), `RED (r116's first wording, the edge as «after it»): a true JavaScript hold's own last moment is said as what ran AFTER it — false (${r2 && words(r2.line).slice(0, 60)}…)`, r2 && r2.line);
  ok(!!r3 && r3.fo.verdict !== LH.V.tie, `RED (a winner by list order): the tie reads «${r3 && r3.fo.verdict}»`, r3 && r3.line);
  // (r942 — the hosted runner's red at the .414 candidate ac510a55d, test-loop-hold-live's law B) THE TWO-SAMPLE TIE WITH NO COLLECTION
  // OBSERVER, placed (planted samples: no clock, no load): one sample in JavaScript, then one on the CPU outside it, as the runner's
  // 0.3 s hold gave. The line names the second by its hedged class «native code or garbage collection» — native code OR a collection —
  // and states no collection as a FACT. The meaning, judged: the words «garbage collection» stand only inside that class's own name
  const collectionStated = (line) => /garbage collection/.test(String(line).split(LH.V.native).join(''));
  const tie942 = holdOf(LH, [jsAt(FROM + 750, BUSY), native(FROM + 2000)], 3000);
  ok(tie942.fo.verdict === LH.V.tie && words(tie942.line).startsWith(`${LH.V.js} ×1 and ${LH.V.native} ×1 (a tie, in the order they came)`) && !collectionStated(tie942.line),
    `(r942) a two-sample tie with no collection observer names the sample outside JavaScript by its hedged class and states no collection as a fact («${words(tie942.line).slice(0, 96)}…»)`, tie942.line);
  ok(/garbage collection/.test(tie942.line), `(r942) why the heavy leg changed: a WORD check («garbage collection» anywhere in the line) reads that hedged class's name as a claim — the honest line it refused on the runner`, tie942.line);
  const gcFact = mut('native-as-collection', "k === 'native' ? (gc ? V.gc : V.native) :", "k === 'native' ? V.gc :");
  const red942 = gcFact ? holdOf(gcFact, [jsAt(FROM + 750, BUSY), native(FROM + 2000)], 3000) : null;
  ok(!!red942 && collectionStated(red942.line), `(r942) RED CONTROL: a copy that names that sample «${LH.V.gc}» with no observer states a collection as a fact — the meaning check catches it («${red942 && words(red942.line).slice(0, 80)}…»)`, red942 && red942.line);
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);

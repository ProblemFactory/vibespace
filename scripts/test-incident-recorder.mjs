#!/usr/bin/env node
// THE CONSOLE RING KEEPS THE STACK, AND THE STACK NAMES THE LINE (lane vault-chip-zone-errors, inc-mvi50qdh-ygmh /
// inc-mvi5ggqh-1tz8: two uncaught errors at every start reached the incident bundle as a message and «bundle.js?v=…:1» —
// the minified client is ONE line, so nothing named the code). Fast tier, in-process + one child node:
//   ① src/lib/incident-stack.js (PURE): stackHead keeps the first 3 `at` frames of a REAL V8 stack, the page's origin cut,
//      the bundle's line:column kept, whole frames only, ≤ 400 chars; '' for a string rejection / no error (the
//      ResizeObserver note); frameOf reads a frame back (named, anonymous, async; null for `<anonymous>`)
//   ② the recorder (src/lib/incident-recorder.js): its `uncaught` AND `unhandled` entries spread the stack of e.error /
//      e.reason through stackHead with location.origin (source pins: the module draws the page) — the message and src stay
//   ③ THE CAP: a FULL console ring of the worst entries (CAP.console read off the recorder, every field at its bound) is
//      measured as the capture posts it (JSON) and as the hub writes it (bundle.json, indent 1) — far inside the hub's
//      body cap (express.json's limit, read off server.js)
//   ④ scripts/symbolicate.mjs end to end: a tiny bundle built by the REAL esbuild with the client step's flags, run in
//      node:vm under the address the page loads it from (`/bundle.js?v=<mtime>`), throws a REAL TypeError (`.length` of
//      undefined); the entry the recorder would write (stackHead) in a fake incident ⇒ the CLI maps the frame to its src/
//      file:line:col (the map ALWAYS rebuilt in memory, byte-identical — a map file planted beside the bundle is not read);
//      a frame from ANOTHER build is refused (v differs) unless --any-build; MUTANT: a bundle one byte off ⇒ refused (the
//      map would map other bytes); THE FLAGS ARE PARSED, NEVER COPIED: flagsOf(clientBuildOptions(the REAL package.json))
//      == the client step's own flag list, a changed build line is followed (MUTANT --target=es2022 ⇒ es2022), an unknown
//      flag throws (CONTROL), and symbolicate.mjs names no flag value of its own; decodeMappings vs a hand-made VLQ line
//   ⑤ the REAL client bundle (when built): the map rebuilt in memory maps the recorder's fill word back to
//      src/lib/chat-enter-keys.js — the road an incident's frame takes
//   ⑥ THE TAB'S NAVIGATION DIARY (src/lib/nav-log.js, lane phone-back-reload — every boot with its navigation type,
//      every back with its verdict, the re-arm's landing, the exit, the stale-tab step; it survives the loads in the
//      tab): the ring keeps the last NAV_LOG_CAP rows; a full ring of the widest rows stays small; prevDocTail reads
//      the PREVIOUS document's last rows only; entriesShape carries no URL; the PRIVACY CENSUS — every navNote( call in
//      src/lib writes only the declared keys (never a URL, a title, a record's words); the snapshot carries the diary
//   ⑦ THE WHEEL AND THE FINE SCROLL TRACE (lane run-open-jump, B-a7a9 — inc-mvzai8oc-j70t: one scroll event moved a
//      chat 767 px 0–1 ms after an input stamp no ring could name): src/lib/scroll-forensics.js (PURE) — one wheel record
//      per 100 ms burst of ONE deltaMode {t, k, el, deltaY summed, deltaMode, ctrl, n, stBefore at the scroller's last
//      scroll event, stAfter at the close} (CONTROL: without the map stBefore reads the moved position), deltaY read before
//      deltaMode, a mode change splits the burst; r2: THE WHEEL RING IS ITS OWN — 60 s of 60 Hz wheeling after 20 presses
//      leaves the 20 presses and says how many bursts it dropped (CONTROL: r1's shared ring keeps 0 presses); the fine
//      window keeps its HEAD and TAIL at 240 Hz with one dropped-count marker (CONTROL: r1's 300 cap lost the arm); r3: two
//      full windows fit (the toggle → ↓ shape keeps the first arm), no marker without a drop, the front trim counted;
//      wheelScroller, the fine entry; the wiring pins (pointerType, rings.wheel, either ring shipped, the arm FIRST in
//      _setRunOpen with no live layout read) + MUTANTS; a full ring's bytes
// Run: node scripts/test-incident-recorder.mjs
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { scratch } from './scratch.mjs';

const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
let pass = 0, fail = 0;
const ok = (n, c, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? ' — ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 900) : '')); } };
const read = (p) => fs.readFileSync(path.join(REPO, p), 'utf8');
const TMP = scratch('incident-recorder');
fs.mkdirSync(TMP, { recursive: true });
process.on('exit', () => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { } });

const S = await import(pathToFileURL(path.join(REPO, 'src/lib/incident-stack.js')).href);
const SY = await import(pathToFileURL(path.join(REPO, 'scripts/symbolicate.mjs')).href);

console.log('① stackHead / frameOf (PURE)');
{
  const ORIGIN = 'https://hub.example.invalid:3456';
  const deep = (n) => { if (n === 0) { const o = undefined; return o.length; } return deep(n - 1); };
  let err = null;
  try { deep(6); } catch (e) { err = e; }
  // the page's frames carry its origin: rewrite this file's own frames as the bundle's address
  const asPage = { stack: err.stack.split('\n').map((l, i) => (i === 0 ? l : l.replace(/\(([^()]+):(\d+):(\d+)\)$/, `(${ORIGIN}/bundle.js?v=1792588246450:$2:$3)`))).join('\n') };
  const h = S.stackHead(asPage, ORIGIN);
  const lines = h.split('\n');
  ok(`a real V8 stack (${err.stack.split('\n').length} lines) keeps exactly ${S.STACK_FRAMES} frames, every one an \`at\` line`, lines.length === S.STACK_FRAMES && lines.every((l) => l.startsWith('at ')), h);
  ok('the page origin is cut and the bundle’s line:column is kept', !h.includes(ORIGIN) && lines.every((l) => /\(\/bundle\.js\?v=1792588246450:\d+:\d+\)$/.test(l)), h);
  ok(`STACK_MAX is 400 and the head never exceeds it (${h.length})`, S.STACK_MAX === 400 && h.length <= 400);
  const long = { stack: `TypeError: x\n    at ${'a'.repeat(390)} (/bundle.js?v=1:1:2)\n    at b (/bundle.js?v=1:1:3)` };
  const lh = S.stackHead(long, '');
  ok('whole frames only: a frame too long for the room keeps its LOCATION (its name goes), never cut mid-address', lh === 'at /bundle.js?v=1:1:2\nat b (/bundle.js?v=1:1:3)', lh);
  ok('nothing to keep ⇒ \'\': a string rejection, null, an object without a stack, a message-only error event', ['', S.stackHead('boom'), S.stackHead(null), S.stackHead({ message: 'x' }), S.stackHead(undefined, ORIGIN)].every((x) => x === ''));
  const f1 = S.frameOf('at Ye (/bundle.js?v=1792588246450:1:3415923)');
  const f2 = S.frameOf('at /bundle.js?v=7:12:34');
  const f3 = S.frameOf('at async Object.run (/bundle.js?v=7:1:99)');
  ok('frameOf reads a named frame, an anonymous one and an async one back', f1 && f1.fn === 'Ye' && f1.file === '/bundle.js?v=1792588246450' && f1.line === 1 && f1.col === 3415923 && f2 && f2.fn === '' && f2.line === 12 && f2.col === 34 && f3 && f3.fn === 'async Object.run' && f3.col === 99, { f1, f2, f3 });
  ok('frameOf: not a frame ⇒ null (`at <anonymous>`, native code, a message line)', [S.frameOf('at <anonymous>'), S.frameOf('at Array.map (native)'), S.frameOf('TypeError: x')].every((x) => x === null));
}

console.log('② the recorder writes it on BOTH error entries');
{
  const rec = read('src/lib/incident-recorder.js');
  ok('the recorder imports stackHead from the PURE module', /import \{ stackHead \} from '\.\/incident-stack\.js';/.test(rec));
  ok('stackOf = stackHead(err, location.origin), and only a non-empty head adds the field', /const stackOf = \(err\) => \{ const s = stackHead\(err, location\.origin\); return s \? \{ stack: s \} : \{\}; \};/.test(rec));
  ok('the `uncaught` entry keeps m + src and spreads stackOf(e.error)', /l: 'uncaught', m: String\(e\.message \|\| ''\)\.slice\(0, 400\), src: `\$\{e\.filename \|\| ''\}:\$\{e\.lineno \|\| 0\}`, \.\.\.stackOf\(e\.error\) \}/.test(rec));
  ok('the `unhandled` entry spreads stackOf(e.reason)', /l: 'unhandled', m: String\(e\.reason\?\.message \|\| e\.reason \|\| ''\)\.slice\(0, 400\), \.\.\.stackOf\(e\.reason\) \}/.test(rec));
}

console.log('③ the cap');
let ringBytes = 0;
{
  const rec = read('src/lib/incident-recorder.js');
  const cap = Number((/const CAP = \{ action: \d+, ws: \d+, console: (\d+), op: \d+ \};/.exec(rec) || [])[1]);
  const limit = (/express\.json\(\{ limit: '(\d+)mb' \}\)/.exec(read('server.js')) || [])[1];
  const capBytes = Number(limit) * 1024 * 1024;
  ok(`CAP.console (${cap}) and the hub's body cap (${limit} MB, express.json) read off the sources`, cap > 0 && capBytes > 0);
  const frame = (i) => `at ${'x'.repeat(60)}${i} (/bundle.js?v=1792588246450:1:${3415923 + i})`;
  const worst = { t: 1792588394214, l: 'unhandled', m: 'm'.repeat(400), src: `https://${'h'.repeat(60)}.example.invalid:3456/bundle.js?v=1792588246450:1`, stack: S.stackHead({ stack: `E\n${[0, 1, 2, 3].map((i) => '    ' + frame(i)).join('\n')}` }, '') };
  const ring = Array.from({ length: cap }, () => worst);
  const posted = Buffer.byteLength(JSON.stringify(ring));
  const written = Buffer.byteLength(JSON.stringify(ring, null, 1));
  const bare = Buffer.byteLength(JSON.stringify(ring.map(({ stack, ...r }) => r)));
  ringBytes = written;
  ok(`a FULL console ring of the worst entries: ${(posted / 1024).toFixed(0)} KB posted, ${(written / 1024).toFixed(0)} KB in bundle.json (+${((posted - bare) / 1024).toFixed(0)} KB for the stacks) — under 1% of the ${limit} MB cap`, worst.stack.length <= 400 && written < capBytes / 100, { posted, written, bare, capBytes });
}

console.log('④ scripts/symbolicate.mjs end to end');
{
  const CK = path.join(TMP, 'checkout');
  fs.mkdirSync(path.join(CK, 'src/lib'), { recursive: true });
  fs.mkdirSync(path.join(CK, 'public'), { recursive: true });
  fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(CK, 'node_modules'));
  // the client step's own flags (package.json's), on a two-file client whose throw sits on a known line
  const realPkg = JSON.parse(read('package.json'));
  const realOpts = SY.clientBuildOptions(realPkg);
  ok('clientBuildOptions reads the REAL package.json client step (bundle, minify, iife, public/bundle.js, the .css loader)', realOpts.bundle && realOpts.minify && realOpts.format === 'iife' && realOpts.outfile === 'public/bundle.js' && realOpts.loader['.css'] === 'css', realOpts);
  // 主开发's ruling (2026-10-21): the flags are PARSED off the build script at run time — never a copied list
  const realStep = realPkg.scripts.build.split('&&').map((s) => s.trim()).find((s) => s.startsWith('esbuild src/client.js'));
  const stepFlags = realStep.split(/\s+/).slice(2).sort();
  ok(`CENSUS: the parsed flags ARE the build script's client step (${stepFlags.length}: ${stepFlags.join(' ')})`, JSON.stringify(SY.flagsOf(realOpts)) === JSON.stringify(stepFlags), { parsed: SY.flagsOf(realOpts), script: stepFlags });
  const moved = SY.clientBuildOptions({ scripts: { build: realPkg.scripts.build.replace(/--target=\S+/, '--target=es2022') } });
  ok('MUTANT: the build line changed (--target=es2022) ⇒ the parse follows it — nothing to drift', moved.target === 'es2022' && JSON.stringify(SY.flagsOf(moved)) !== JSON.stringify(SY.flagsOf(realOpts)), SY.flagsOf(moved));
  const symSrc = read('scripts/symbolicate.mjs');
  const symCode = symSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const OWN_RE = /es20\d\d|['"](?:iife|esm|cjs|browser|node)['"]|public\/bundle\.js|bundle\.js\.map|--sourcemap=/g;
  const own = (symCode.match(OWN_RE) || []);
  ok('symbolicate.mjs names no flag VALUE of its own (target, format, platform, outfile) and reads no map file — only what package.json says (the flag NAMES are its parser\'s vocabulary)', own.length === 0, own);
  ok('CONTROL: a copied flag list planted in that source is caught (`const OPTS = { target: \'es2020\', format: \'iife\' }`)', ((symCode + "\nconst OPTS = { target: 'es2020', format: 'iife' };").match(OWN_RE) || []).length === 2);
  let threw = '';
  try { SY.clientBuildOptions({ scripts: { build: 'esbuild src/client.js --bundle --outfile=public/bundle.js --define:x=1' } }); } catch (e) { threw = e.message; }
  ok('CONTROL: a flag the tool does not know throws (a silent difference would map other bytes)', /does not know: --define:x=1/.test(threw), threw);
  const step = realPkg.scripts.build.split('&&').map((s) => s.trim()).find((s) => s.startsWith('esbuild src/client.js'));
  fs.writeFileSync(path.join(CK, 'package.json'), JSON.stringify({ name: 'sym-fixture', scripts: { build: step } }));
  fs.writeFileSync(path.join(CK, 'src/lib/rings.js'), [
    '// the fixture: a renderer that reads a missing list',
    'export function countOf(rows) {',
    '  const list = rows.items;',
    '  return list.length;',
    '}',
    '',
  ].join('\n'));
  fs.writeFileSync(path.join(CK, 'src/client.js'), "import { countOf } from './lib/rings.js';\nglobalThis.__boom = () => countOf({});\n");
  const esbuild = require('esbuild');
  const out = await esbuild.build({ ...realOpts, entryPoints: [path.join(CK, 'src/client.js')], outfile: path.join(CK, 'public/bundle.js'), absWorkingDir: CK, sourcemap: 'external', sourcesContent: false, write: false, logLevel: 'silent' });
  const js = out.outputFiles.find((f) => f.path.endsWith('bundle.js'));
  const mp = out.outputFiles.find((f) => f.path.endsWith('bundle.js.map'));
  fs.writeFileSync(path.join(CK, 'public/bundle.js'), js.contents);
  ok('an external map leaves the bundle with NO sourceMappingURL (the page never asks for it)', !/sourceMappingURL/.test(Buffer.from(js.contents).toString('utf8')));
  const v = Math.floor(fs.statSync(path.join(CK, 'public/bundle.js')).mtimeMs);
  const ORIGIN = 'http://127.0.0.1:1';
  const ctx = vm.createContext({});
  vm.runInContext(Buffer.from(js.contents).toString('utf8'), ctx, { filename: `${ORIGIN}/bundle.js?v=${v}` });
  let e = null;
  try { ctx.__boom(); } catch (x) { e = x; }
  ok('the bundle throws a REAL TypeError — `.length` of undefined', !!e && /Cannot read properties of undefined \(reading 'length'\)/.test(e.message), e && e.message);
  const stack = S.stackHead(e, ORIGIN);
  ok('the entry the recorder writes: frames on /bundle.js?v=<mtime>:1:<col>', /^at \S+ \(\/bundle\.js\?v=\d+:1:\d+\)$/.test(stack.split('\n')[0]), stack);
  const otherBuild = stack.split('\n')[0].replace(/\?v=\d+/, `?v=${v - 60000}`);
  const inc = { id: 'inc-fixture-0001', clientVersion: '0.0.0', client: { rings: { console: [
    { t: 1792588374949, l: 'unhandled', m: 'no stack here' },
    { t: 1792588394214, l: 'uncaught', m: "Uncaught TypeError: Cannot read properties of undefined (reading 'length')", src: `${ORIGIN}/bundle.js?v=${v}:1`, stack },
    { t: 1792588394218, l: 'uncaught', m: 'from the build before', stack: otherBuild },
  ] } } };
  const incFile = path.join(TMP, 'bundle.json');
  fs.writeFileSync(incFile, JSON.stringify(inc));
  const run = (...extra) => { try { return { rc: 0, out: execFileSync(process.execPath, ['--no-warnings', path.join(REPO, 'scripts/symbolicate.mjs'), incFile, '--checkout', CK, ...extra], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) }; } catch (x) { return { rc: x.status, out: String(x.stdout || '') + String(x.stderr || '') }; } };
  const r1 = run();
  ok('the CLI maps the top frame to src/lib/rings.js:4:15 — the `.length` read of the missing list (the map rebuilt in memory, byte-identical)', r1.rc === 0 && /→\s+src\/lib\/rings\.js:4:15/.test(r1.out) && /rebuilt in memory \(byte-identical/.test(r1.out), r1.out);
  ok('… a frame from ANOTHER build is not mapped (its v differs) and the summary counts it', /another build: v=\d+, this checkout's bundle is v=\d+/.test(r1.out) && /2 frame\(s\) mapped, 1 from another build/.test(r1.out), r1.out);
  ok('… an entry without a stack prints nothing; the frames outside the bundle pass through as they are', !r1.out.includes('no stack here') && /at .*test-incident-recorder\.mjs/.test(r1.out), r1.out);
  const r2 = run('--any-build');
  ok('--any-build maps the other build’s frame too', r2.rc === 0 && /3 frame\(s\) mapped$/.test(r2.out.trim()), r2.out);
  const lie = JSON.parse(Buffer.from(mp.contents).toString('utf8')); lie.sources = lie.sources.map(() => 'src/planted.js');
  fs.writeFileSync(path.join(CK, 'public/bundle.js.map'), JSON.stringify(lie));
  const r3 = run();
  ok('a map FILE planted beside the bundle is never read — the map is rebuilt in memory every time', r3.rc === 0 && /rebuilt in memory/.test(r3.out) && /→\s+src\/lib\/rings\.js:4:15/.test(r3.out) && !/planted/.test(r3.out), r3.out);
  fs.rmSync(path.join(CK, 'public/bundle.js.map'));
  fs.appendFileSync(path.join(CK, 'public/bundle.js'), ' ');
  fs.utimesSync(path.join(CK, 'public/bundle.js'), v / 1000, v / 1000);
  const r4 = run();
  ok('MUTANT: a served bundle one byte off ⇒ REFUSED (the rebuilt map would map other bytes)', r4.rc !== 0 && /the rebuilt bundle differs from public\/bundle\.js/.test(r4.out), r4.out);
  // decodeMappings: a hand-made line — [0,0,0,0] then [+5, 0, +2, -3, +1] (the name), then [+1]
  const vlq = (n) => { let x = n < 0 ? (-n << 1) | 1 : n << 1; let s = ''; do { let d = x & 31; x >>>= 5; if (x) d |= 32; s += 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'[d]; } while (x); return s; };
  const seg = (...a) => a.map(vlq).join('');
  const dm = SY.decodeMappings(`${seg(0, 0, 0, 0)},${seg(5, 0, 2, -3, 1)},${seg(1)};${seg(7, 0, 1, 4)}`);
  ok('decodeMappings: absolute values across segments and lines (negative deltas, a name index, a 1-field segment)', JSON.stringify(dm) === JSON.stringify([[[0, 0, 0, 0], [5, 0, 2, -3, 1], [6]], [[7, 0, 3, 1]]]), dm);
  const lk = SY.lookup({ sources: ['a.js'], names: ['n0', 'n1'] }, dm, 1, 6);
  ok('lookup: the last segment at or before the column, 1-based out', lk && lk.source === 'a.js' && lk.line === 3 && lk.col === -2 && lk.name === 'n1', lk);
}

console.log('⑤ the real client bundle');
{
  const bundle = path.join(REPO, 'public/bundle.js');
  if (!fs.existsSync(bundle)) console.log('  · SKIP: no public/bundle.js here (npm run build makes it; the gate builds first)');
  else {
    let ctx = null, why = '';
    try { ctx = await SY.mapFor(REPO); } catch (e) { why = e.message; }
    if (!ctx && /differs/.test(why)) console.log(`  · SKIP: this tree's bundle is not built from this tree (${why.slice(0, 80)}…)`);
    else {
      const line1 = fs.readFileSync(bundle, 'utf8').split('\n')[0];
      const col = line1.indexOf('"(fill)"') + 1;
      const p = ctx && col > 0 ? SY.lookup(ctx.map, ctx.decoded, 1, col) : null;
      ok('the client map (rebuilt in memory, byte-identical) maps the recorder’s fill word to src/lib/chat-enter-keys.js', !!p && path.relative(REPO, path.resolve(ctx.mapDir, p.source)) === 'src/lib/chat-enter-keys.js', { why, col, p });
    }
  }
}

console.log('⑥ the tab\'s navigation diary (lane phone-back-reload)');
{
  const navCopy = path.join(TMP, 'nav-log.mjs'); fs.writeFileSync(navCopy, read('src/lib/nav-log.js'));
  const store = new Map();
  globalThis.sessionStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) };
  const NL = await import(pathToFileURL(navCopy).href);
  for (let i = 0; i < 200; i++) NL.navNote({ k: 'pop', v: 'close', tg: 'window', ex: i });
  const log = NL.navLogRead();
  ok(`the ring keeps the last ${NL.NAV_LOG_CAP} rows (200 written), newest last, each stamped with t + this document's id`, log.length === NL.NAV_LOG_CAP && log[0].ex === 200 - NL.NAV_LOG_CAP && log.at(-1).ex === 199 && log.every((r) => typeof r.t === 'number' && r.d === NL.DOC_ID), { n: log.length, first: log[0], last: log.at(-1) });
  store.clear();
  const wide = { k: 'boot', type: 'back_forward', step: 'rebuild', st: 'other', len: 50, ents: 'x'.repeat(50) + '*S', disc: 1, ref: 'other', vis: 'visible' };
  for (let i = 0; i < 80; i++) NL.navNote({ ...wide, i });
  const bytes = Buffer.byteLength(store.get(NL.NAV_LOG_KEY));
  ok(`a full diary of the widest row (a 50-entry shape) stays small: ${(bytes / 1024).toFixed(1)} KB ≤ 16 KB in sessionStorage — and the hub's body cap never feels it`, bytes <= 16 * 1024, bytes);
  const tail = NL.prevDocTail([{ d: 'a', k: 'boot' }, { d: 'b', k: 'boot' }, { d: 'b', k: 'pop', v: 'arm' }, { d: 'b', k: 'hide' }, { d: 'me', k: 'boot' }], 'me');
  ok('prevDocTail: the PREVIOUS document\'s last rows (up to 3, oldest first) — never an older document\'s, never this one\'s', tail.map((r) => r.d + r.k).join() === 'bboot,bpop,bhide' && NL.prevDocTail([], 'me').length === 0 && NL.prevDocTail([{ d: 'me', k: 'boot' }], 'me').length === 0, tail);
  const shape = NL.entriesShape([{ same: false, path: '/' }, { same: true, path: '/' }, { same: true, path: '/' }, { same: false, path: '/p/abc' }], 1, '/');
  ok('entriesShape: the entries as S / x (this document or another), * = current, o = not the app\'s page — no URL, no path text', shape === 'x*SSxo' && NL.entriesShape(null, 0, '/') === '', shape);
  try { store.set(NL.NAV_LOG_KEY, '{not json'); NL.navNote({ k: 'boot' }); } catch (e) { ok('a corrupt diary never throws', false, e.message); }
  ok('a corrupt diary is started again, never thrown', NL.navLogRead().length === 1);
  delete globalThis.sessionStorage;
  // THE PRIVACY CENSUS: every navNote( and exitIntentWrite( call under src/, PARSED (acorn) — acceptance round 3: round
  // 2's regex read only a literal `navNote({…})` and only `key:` pairs, so a ternary argument and a shorthand key went
  // unseen. A call's argument must be a literal row (either side of a ternary); each key declared, none spread or
  // computed; each value read for a URL / title / text (a PURE shaper's arguments aside: what it answers is a shape);
  // the function never passed around as a value (an alias the census could not follow).
  // round 2: came (a way in: back / forward / other), ek (8 chars of the browser's random entry key — no URL, no title),
  // the hop rows' n / stay / why / drop
  const KEYS = new Set(['k', 'type', 'step', 'st', 'len', 'ents', 'disc', 'ref', 'vis', 'v', 'tg', 'ex', 'ms', 'landed', 'push', 'skip', 'load', 'p', 'b', 's', 'd2', 'capture', 'id', 'came', 'ek', 'n', 'stay', 'why', 'drop', 'slow', 'abort']);
  const FNS = new Map([['navNote', KEYS], ['exitIntentWrite', new Set(['t', 'hop', 'key', 'to'])]]);
  const acorn = require('acorn');
  const URLISH = /href|url|title|text|name|search|hash|referr|origin|host|path|cookie|location|document/i;
  const SHAPERS = new Set(['entriesShape', 'entryKey']);
  const walkAst = (n, fn, parent = null) => {
    if (!n || typeof n.type !== 'string' || fn(n, parent) === false) return;
    for (const [k, v] of Object.entries(n)) { if (k === 'loc') continue; if (Array.isArray(v)) v.forEach((x) => walkAst(x, fn, n)); else if (v && typeof v.type === 'string') walkAst(v, fn, n); }
  };
  const readsOf = (v) => { const out = []; walkAst(v, (n) => { if (n.type === 'CallExpression' && n.callee.type === 'Identifier' && SHAPERS.has(n.callee.name)) return false; if (n.type === 'Identifier') out.push(n.name); if (n.type === 'Literal' && typeof n.value === 'string' && /^(https?:|data:|\/)/.test(n.value)) out.push('a URL literal'); }); return out; };
  const rowsOf = (a) => (a.type === 'ObjectExpression' ? [a] : a.type === 'ConditionalExpression' ? [...rowsOf(a.consequent), ...rowsOf(a.alternate)] : [null]);
  const OWN = new Set(['FunctionDeclaration', 'ImportSpecifier', 'ExportSpecifier']);
  function privacyCensus(src, file) {
    const out = [];
    walkAst(acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module', locations: true }), (n, parent) => {
      if (n.type === 'Identifier' && FNS.has(n.name) && parent && !OWN.has(parent.type) && !(parent.type === 'CallExpression' && parent.callee === n)) out.push({ file, line: n.loc.start.line, fn: n.name, keys: [], bad: ['used as a value'] });
      if (n.type !== 'CallExpression' || n.callee.type !== 'Identifier' || !FNS.has(n.callee.name)) return;
      const fn = n.callee.name, keys = [], bad = [];
      if (n.arguments.length !== 1) bad.push(`${n.arguments.length} arguments`);
      for (const row of n.arguments.length ? rowsOf(n.arguments[0]) : []) {
        if (!row) { bad.push('an argument that is no literal row'); continue; }
        for (const p of row.properties) {
          if (p.type !== 'Property' || p.computed) { bad.push(p.type === 'SpreadElement' ? 'a spread' : 'a computed key'); continue; }
          const k = p.key.type === 'Identifier' ? p.key.name : String(p.key.value);
          keys.push(k);
          if (!FNS.get(fn).has(k)) bad.push(`key ${k}${p.shorthand ? ' (shorthand)' : ''}`);
          const r = readsOf(p.value).filter((x) => URLISH.test(x) || x === 'a URL literal');
          if (r.length) bad.push(`${k} reads ${r.join(' / ')}`);
        }
      }
      out.push({ file, line: n.loc.start.line, fn, keys, bad });
    });
    return out;
  }
  const calls = [];
  for (const f of fs.readdirSync(path.join(REPO, 'src'), { recursive: true }).filter((x) => x.endsWith('.js'))) {
    const src = read('src/' + f);
    if (/\b(navNote|exitIntentWrite)\b/.test(src)) calls.push(...privacyCensus(src, f));
  }
  const bad = calls.filter((c) => c.bad.length || (c.fn === 'navNote' && !c.keys.includes('k')));
  const nNote = calls.filter((c) => c.fn === 'navNote').length, nIntent = calls.filter((c) => c.fn === 'exitIntentWrite').length;
  ok(`PRIVACY CENSUS (parsed): ${nNote} navNote( + ${nIntent} exitIntentWrite( calls (${[...new Set(calls.map((c) => c.file))].join(', ')}) — each argument a literal row (either side of a ternary), only declared keys (shorthand ones too), no value reading a url / href / title / text / location`, nNote >= 15 && nIntent >= 2 && bad.length === 0 && calls.some((c) => c.keys.length > 1 && c.line && /mobile-back/.test(c.file)), bad);
  const PLANTED = {
    'a ternary argument whose branch reads location.href': "navNote(cond ? { k: 'hop', why: location.href } : { k: 'hop', n: 1 });",
    'a shorthand key the set never declared': "const href = location.href; navNote({ k: 'hop', href });",
    'a declared key, its value the URL': "navNote({ k: 'boot', why: document.URL });",
    'a spread row': "navNote({ k: 'boot', ...row });",
    'a variable for the row': 'navNote(row);',
    'an alias': "const nn = navNote; nn({ k: 'boot', u: location.href });",
    'an intent carrying the title': "exitIntentWrite({ t: Date.now(), hop: 0, key: document.title, to: 'below' });",
  };
  const missed = Object.entries(PLANTED).filter(([, src]) => !privacyCensus(src, 'planted').some((c) => c.bad.length)).map(([n]) => n);
  ok(`CONTROL: the census reds each of ${Object.keys(PLANTED).length} planted calls (${Object.keys(PLANTED).join('; ')})`, missed.length === 0, missed);
  const round2 = (src) => [...src.matchAll(/\bnavNote\(\{([^}]*)\}\)/g)].some((m) => [...m[1].matchAll(/(?:^|,)\s*([a-z0-9]+)\s*:/gi)].map((x) => x[1]).some((k) => !KEYS.has(k)));
  ok('CONTROL (RED from round 2): round 2\'s regex census passes the ternary and the shorthand shapes — this one reds both', !round2(PLANTED['a ternary argument whose branch reads location.href']) && !round2(PLANTED['a shorthand key the set never declared']) && round2("navNote({ k: 'boot', href: location.href })"));
  const rec = read('src/lib/incident-recorder.js');
  ok('the snapshot carries the diary (out.navLog = navLogRead()) — every capture, manual or automatic', rec.includes("import { navLogRead } from './nav-log.js';") && rec.includes('try { out.navLog = navLogRead(); } catch { }'));
  ok('autoCaptureIncident takes the toast\'s words (a back that cost a load is no freeze); the freeze words stay the default', /app\.autoCaptureIncident = async \(reason, detail, \{ toastKey = 'Freeze captured automatically \(\{id\}\) — see Diagnostics → Incidents' \} = \{\}\) => \{/.test(rec) && rec.includes('showToast(t(toastKey, { id: r.id }));'));
}

console.log('⑦ THE WHEEL AND THE FINE SCROLL TRACE (lane run-open-jump, B-a7a9 — inc-mvzai8oc-j70t; r2: their own rings, the window\'s head kept)');
{
  const F = await import(pathToFileURL(path.join(REPO, 'src/lib/scroll-forensics.js')).href);
  // a fake clock + timer: the coalescing window is driven by hand
  let clock = 1000; const timers = [];
  const later = (fn, ms) => timers.push({ at: clock + ms, fn });
  const tick = (ms) => { clock += ms; for (const tm of timers.splice(0).sort((x, y) => x.at - y.at)) { if (tm.at <= clock) tm.fn(); else timers.push(tm); } };
  const list = { nodeType: 1, scrollTop: 1950, scrollHeight: 2787, clientHeight: 837, parentElement: null };
  const card = { nodeType: 1, scrollTop: 0, scrollHeight: 40, clientHeight: 40, parentElement: list };
  const lastSt = new Map([[list, 1950]]);
  const ring = [];
  const onWheel = F.createWheelRecorder({ now: () => clock, later, describe: (el) => (el === card ? 'div.card' : '?'), scrollerOf: () => list, push: (r) => ring.push(r), lastSt });
  list.scrollTop = 1850; // the compositor applied the first notch BEFORE the main thread saw the wheel (measured)
  onWheel({ target: card, deltaY: -100, deltaMode: 0, ctrlKey: false });
  tick(30); onWheel({ target: card, deltaY: -66.666, deltaMode: 0, ctrlKey: true });
  list.scrollTop = 1783;
  tick(80); // the 100 ms window closes
  onWheel({ target: card, deltaY: 1, deltaMode: 2, ctrlKey: false }); // a NEW burst: a page-mode notch
  tick(100);
  const [a, b] = ring;
  ok(`ONE record per 100 ms burst (${ring.length} for 3 events in two bursts), pushed at the burst's first event`, ring.length === 2 && a.t === 1000 && b.t === 1110, ring);
  ok('the wheel record\'s shape: {t, k:"wheel", el, deltaY (summed, 2 decimals), deltaMode, ctrl, n, stBefore, stAfter}',
    JSON.stringify(Object.keys(a)) === JSON.stringify(['t', 'k', 'el', 'deltaY', 'deltaMode', 'ctrl', 'n', 'stBefore', 'stAfter'])
    && a.k === 'wheel' && a.el === 'div.card' && a.deltaY === -166.67 && a.deltaMode === 0 && a.ctrl === 1 && a.n === 2, a);
  ok(`stBefore = the scroller at its LAST SCROLL EVENT (${a.stBefore}; the main thread read ${1850} — already moved), stAfter = at the window's close (${a.stAfter})`, a.stBefore === 1950 && a.stAfter === 1783, a);
  ok('a page-mode notch says so (deltaMode 2) — the question the capture could not answer', b.deltaMode === 2 && b.deltaY === 1 && b.n === 1 && b.ctrl === 0, b);
  // CONTROL: no lastSt ⇒ stBefore is the current position (the old reading) — the map is what makes it «before»
  const ring2 = []; const w2 = F.createWheelRecorder({ now: () => clock, later, describe: () => 'x', scrollerOf: () => list, push: (r) => ring2.push(r) });
  list.scrollTop = 1700; w2({ target: card, deltaY: -10, deltaMode: 0 }); tick(100);
  ok('CONTROL: without the scroll listener\'s map stBefore reads the already-moved position (1700 = stAfter)', ring2[0]?.stBefore === 1700 && ring2[0]?.stAfter === 1700, ring2);
  // r2 5d: a burst never sums two units — a change of deltaMode closes it
  const ring3 = []; const w3 = F.createWheelRecorder({ now: () => clock, later, describe: () => 'x', scrollerOf: () => list, push: (r) => ring3.push(r) });
  w3({ target: card, deltaY: 3, deltaMode: 1 }); tick(10); w3({ target: card, deltaY: 120, deltaMode: 0 }); tick(100);
  ok(`a mode change inside 100 ms splits the burst: 3 lines and 120 px are two records (${ring3.map((r) => r.deltaY + '@' + r.deltaMode).join(', ')}), never «123, mode 1»`, ring3.length === 2 && ring3[0].deltaY === 3 && ring3[0].deltaMode === 1 && ring3[1].deltaY === 120 && ring3[1].deltaMode === 0, ring3);
  // r2 5a: deltaY is read before deltaMode (Firefox answers later listeners in lines once deltaMode was read first)
  const order = []; const w4 = F.createWheelRecorder({ now: () => clock, later, describe: () => 'x', scrollerOf: () => list, push: () => {} });
  w4({ target: card, get deltaY() { order.push('deltaY'); return -5; }, get deltaMode() { order.push('deltaMode'); return 0; } }); tick(100);
  ok(`deltaY is read BEFORE deltaMode (${order.join(' → ')})`, order[0] === 'deltaY' && order.includes('deltaMode'), order);
  // r2 2 — THE CROWD-OUT, measured: 20 presses, then 60 s of 60 Hz wheeling; the recorder's own two rings
  const CAPA = 500;
  const pushA = (r, e) => { r.push(e); if (r.length > CAPA) r.splice(0, r.length - CAPA); };
  const run60 = (intoAction) => {
    const action = [], wheel = []; let pushed = 0; clock = 50000;
    for (let i = 0; i < 20; i++) pushA(action, { t: clock + i, k: 'ptr', el: 'x', x: 1, y: 1, pointerType: 'mouse' });
    const w = F.createWheelRecorder({ now: () => clock, later, describe: () => 'list', scrollerOf: () => list, push: (r) => { pushed++; return intoAction ? pushA(action, r) : F.pushCapped(wheel, F.WHEEL_RING_CAP, r); } });
    for (let i = 0; i < 60 * 60; i++) { w({ target: card, deltaY: -4, deltaMode: 0 }); tick(1000 / 60); }
    tick(200);
    return { ptr: action.filter((x) => x.k === 'ptr').length, wheelInAction: action.filter((x) => x.k === 'wheel').length, wheel: wheel.length, dropped: wheel[0]?.droppedBefore || 0, pushed };
  };
  let own; try { own = run60(false); } catch (e) { own = { error: String(e.message || e) }; } // a tree without the wheel ring reds HERE by name, never throws the suite
  const shared = run60(true);
  ok(`60 s of 60 Hz wheeling after 20 presses: the action ring keeps all ${own.ptr} presses; the wheel ring holds ${own.wheel} bursts (WHEEL_RING_CAP ${F.WHEEL_RING_CAP}) and says it dropped ${own.dropped} of ${own.pushed} on its first record`, own.ptr === 20 && own.wheelInAction === 0 && own.wheel === F.WHEEL_RING_CAP && own.pushed > 500 && own.dropped === own.pushed - F.WHEEL_RING_CAP, own);
  ok(`CONTROL (r1's wiring — wheel records in the shared 500-entry action ring): the same minute leaves ${shared.ptr} of 20 presses and no count of the loss`, shared.ptr === 0 && shared.wheelInAction === CAPA, shared);
  // the scroller: the nearest ancestor that overflows AND lets it scroll
  const style = (ov) => () => ({ overflowY: ov });
  const pre = { nodeType: 1, scrollHeight: 400, clientHeight: 100, parentElement: list };
  const inner = { nodeType: 1, scrollHeight: 10, clientHeight: 10, parentElement: pre };
  ok('wheelScroller: a clipped (overflow hidden) box is passed over; the list (overflow auto) is the scroller', F.wheelScroller(inner, (n) => ({ overflowY: n === pre ? 'hidden' : 'auto' }), 'ROOT') === list);
  ok('…an overflowing auto box under the pointer is the scroller; nothing scrollable ⇒ the document\'s', F.wheelScroller(inner, style('auto'), 'ROOT') === pre && F.wheelScroller({ nodeType: 1, scrollHeight: 5, clientHeight: 5, parentElement: null }, style('auto'), 'ROOT') === 'ROOT');
  // the fine entry: the writer since the previous scroll event, else 'none'
  const e1 = F.fineScrollEntry({ now: 5000, st: 1950.4, sh: 2787, ch: 837, writeSeq: 7, seenSeq: 6, writeAt: 4983, writeBy: 'fsb', userAt: 4968 });
  const e2 = F.fineScrollEntry({ now: 5304, st: 59, sh: 2787, ch: 837, writeSeq: 7, seenSeq: 7, writeAt: 4983, writeBy: 'fsb', userAt: 5304 });
  ok('the fine entry\'s shape: {t, st, sh, ch, by, writeAgo, wheelAgo}', JSON.stringify(Object.keys(e1)) === JSON.stringify(['t', 'st', 'sh', 'ch', 'by', 'writeAgo', 'wheelAgo']) && e1.st === 1950, e1);
  ok(`a scroll event AFTER a stamped write names it (by ${e1.by}, writeAgo ${e1.writeAgo}); one with no write since the last event is the browser's own (by ${e2.by}, wheelAgo ${e2.wheelAgo})`, e1.by === 'fsb' && e1.writeAgo === 17 && e2.by === 'none' && e2.writeAgo === 321 && e2.wheelAgo === 0, { e1, e2 });
  // r2 3 — a 2 s window at 240 Hz = 480 events: the HEAD (the arm + the first FINE_HEAD) and the TAIL survive, the middle is counted
  const fr = []; F.pushFine(fr, { t: 0, arm: 'runOpen', at: 'press' });
  for (let i = 1; i <= 480; i++) F.pushFine(fr, { t: i, st: i, by: 'none' });
  const drop = fr.find((x) => 'dropped' in x);
  ok(`240 Hz × 2 s: the arm marker survives (${fr[0]?.arm}), the first ${F.FINE_HEAD} events follow it, ONE marker counts the ${drop?.dropped} dropped from the middle, the last ${F.FINE_TAIL} end it (${fr.length} entries)`,
    fr[0]?.arm === 'runOpen' && fr[1].t === 1 && fr[F.FINE_HEAD].t === F.FINE_HEAD && drop?.dropped === 480 - F.FINE_HEAD - F.FINE_TAIL && fr[fr.length - 1].t === 480 && fr[fr.length - F.FINE_TAIL].t === 480 - F.FINE_TAIL + 1 && fr.length === 1 + F.FINE_HEAD + 1 + F.FINE_TAIL, { n: fr.length, drop });
  const r1push = (r, e) => { r.push(e); if (r.length > 300) r.splice(0, r.length - 300); }; // r1's pushFine: one cap, oldest first
  const fr1 = []; r1push(fr1, { t: 0, arm: 'runOpen' }); for (let i = 1; i <= 480; i++) r1push(fr1, { t: i });
  ok(`CONTROL (r1's ring, cap 300): the same window loses its arm marker and its first ${fr1[0].t - 1} events — the START, where a cause lives`, !fr1.some((x) => x.arm) && fr1[0].t === 181, fr1[0]);
  const fr2 = []; F.pushFine(fr2, { t: 0, arm: 'scrollBtn' }); for (let i = 1; i <= 900; i++) F.pushFine(fr2, i === 450 ? { t: i, arm: 'runOpen' } : { t: i });
  const marks2 = fr2.filter((x) => 'dropped' in x).map((x) => x.dropped);
  ok(`two busy windows (r3): BOTH fit whole (${fr2.length} ≤ FINE_SCROLL_CAP ${F.FINE_SCROLL_CAP} = 2 × 402) — the FIRST window's arm (${fr2[0].arm}) and its marker (${marks2[0]}) survive beside the second's (${marks2[1]}), nothing trimmed`,
    F.FINE_SCROLL_CAP >= 2 * 402 && fr2.length <= F.FINE_SCROLL_CAP && fr2[0].arm === 'scrollBtn' && !('droppedBefore' in fr2[0]) && fr2.some((x) => x.arm === 'runOpen') && JSON.stringify(marks2) === JSON.stringify([449 - F.FINE_HEAD - F.FINE_TAIL, 450 - F.FINE_HEAD - F.FINE_TAIL]), { n: fr2.length, head: fr2[0], marks2 });
  const fr3 = []; F.pushFine(fr3, { t: 0, arm: 'runOpen' }); for (let i = 1; i <= 288; i++) F.pushFine(fr3, { t: i }); // 1.2 s at 240 Hz
  F.pushFine(fr3, { t: 289, arm: 'scrollBtn' }); for (let i = 290; i <= 769; i++) F.pushFine(fr3, { t: i }); // then the ↓ — the incident's own shape
  ok(`toggle, then ↓ 1.2 s later at 240 Hz: the first window keeps its arm and all ${fr3.findIndex((x) => x.arm === 'scrollBtn') - 1} events (the acceptance measured 92 entries lost uncounted at a 600 cap)`, fr3[0].arm === 'runOpen' && fr3[1].t === 1 && fr3.findIndex((x) => x.arm === 'scrollBtn') === 289 && !fr3.some((x) => 'droppedBefore' in x));
  const fr4 = []; F.pushFine(fr4, { t: 0, arm: 'runOpen' }); for (let i = 1; i <= 300; i++) F.pushFine(fr4, { t: i });
  ok('a window of 201–400 events drops nothing and writes NO marker (r3: it wrote {dropped: 0})', fr4.length === 301 && !fr4.some((x) => 'dropped' in x));
  const fr5 = []; let pushedEntries = 0;
  for (let w = 0; w < 3; w++) { F.pushFine(fr5, { t: w * 1000, arm: 'runOpen' }); pushedEntries++; for (let i = 1; i <= 480; i++) F.pushFine(fr5, { t: w * 1000 + i }); pushedEntries += 401; } // 402 entries left per window
  ok(`three busy windows: the ring's FRONT trim is COUNTED on its first entry (droppedBefore ${fr5[0].droppedBefore} = ${pushedEntries} − ${F.FINE_SCROLL_CAP}) — never silent`, fr5.length === F.FINE_SCROLL_CAP && fr5[0].droppedBefore === pushedEntries - F.FINE_SCROLL_CAP && fr5.filter((x) => x.arm).length === 2, { n: fr5.length, head: fr5[0] });
  // the wiring (source pins: the module draws the page)
  const rec = read('src/lib/incident-recorder.js');
  const cv = read('src/lib/chat-view.js');
  ok('the recorder: ptr records carry pointerType; the wheel listener feeds its OWN ring (rings.wheel through pushCapped), with the scroll listener\'s map — never rings.action',
    rec.includes("pointerType: e.pointerType || '' });") && /const rings = \{ action: \[\], ws: \[\], console: \[\], op: \[\], wheel: \[\] \};/.test(rec)
    && /document\.addEventListener\('wheel', createWheelRecorder\(\{[\s\S]{0,400}lastSt,[\s\S]{0,300}push: \(rec\) => pushCapped\(rings\.wheel, WHEEL_RING_CAP, rec\),\s*\}\), \{ capture: true, passive: true \}\);/.test(rec)
    && !/push\(rings\.action, CAP\.action, rec\)/.test(rec)
    && /document\.addEventListener\('scroll', \(e\) => \{[^\n]*lastSt\.set\(n, n\.scrollTop\);[^\n]*\{ capture: true, passive: true \}\);/.test(rec));
  ok('…the capture ships a window whose coarse ring is empty but whose fine ring is not (either ring), and its fine ring',
    rec.includes('if (!v?._traceRing?.length && !v?._scrollFine?.length) continue;') && rec.includes('if (v._scrollFine?.length) traces[winId].fine = v._scrollFine.slice(-FINE_SCROLL_CAP);'));
  ok('…and the nav-log import keeps its own comment (the scroll-forensics import is its own line)', rec.includes("import { navLogRead } from './nav-log.js'; // lane phone-back-reload: the tab's diary"));
  const setRunOpen = cv.match(/\n  _setRunOpen\(run, open\) \{[\s\S]*?\n  \}\n/)?.[0] || '';
  const armPin = (src) => /^\n  _setRunOpen\(run, open\) \{\n    if \(!run\?\.header\) return;\n    if \(!this\._runsMutating\) this\._armScrollFine\(open \? 'runOpen' : 'runClose'\);/.test(src) && (src.match(/_armScrollFine\(/g) || []).length === 1;
  const armFn = cv.match(/\n  _armScrollFine\(why\) \{[\s\S]*?\n  \}\n/)?.[0] || '';
  ok('the chat view ARMS the window BEFORE the toggle (the first line of _setRunOpen, outside a pass) and at the ↓ press; every scroll event inside it is kept BEFORE the coarse 400 px filter',
    armPin(setRunOpen)
    && /this\._setPinned\(true, 'scrollBtn'\);\n\s*this\._armScrollFine\('scrollBtn'\);/.test(cv)
    && /if \(Date\.now\(\) < \(this\._scrollFineUntil \|\| 0\)\) this\._noteFineScroll\(st\);[^\n]*\n\s*if \(Math\.abs\(st - last\) < 400\) return;/.test(cv));
  const noLayoutPin = (fn) => !!fn && !/scrollTop|scrollHeight|clientHeight|getBoundingClientRect|offset(Top|Height)/.test(fn) && /const now = Date\.now\(\), g = this\._geomSeen;/.test(fn) && fn.includes("at: 'press'");
  ok('…and the arm reads NO live layout: the geometry the scroll handler last saw (_geomSeen, set in its rAF read), marked «at: press»',
    noLayoutPin(armFn)
    && /const \{ scrollTop, scrollHeight, clientHeight \} = this\._messageList;\n\s*this\._geomSeen = \{ st: Math\.round\(scrollTop\), sh: scrollHeight, ch: clientHeight, t: Date\.now\(\) \};/.test(cv));
  ok('…every stamped write counts (_traceExpect bumps _stWriteSeq) — the fine trace\'s writer test', /_traceExpect\(by\) \{ this\._lastStWriteAt = Date\.now\(\); this\._lastStWriteBy = by \|\| ''; this\._stWriteSeq = \(this\._stWriteSeq \|\| 0\) \+ 1; \}/.test(cv));
  // MUTANTS: the arm back AFTER the toggles (r1's place) ⇒ the pin reds; a live read in the arm ⇒ its pin reds
  const mutant = setRunOpen.replace("\n    if (!this._runsMutating) this._armScrollFine(open ? 'runOpen' : 'runClose');", '').replace('    if (outsidePass) {\n', "    if (outsidePass) {\n      this._armScrollFine(run.open ? 'runOpen' : 'runClose');\n");
  ok('MUTANT: the arm moved back after the toggles (r1) reds the arm pin', mutant !== setRunOpen && armPin(setRunOpen) && !armPin(mutant));
  const liveArm = armFn.replace('const now = Date.now(), g = this._geomSeen;', 'const now = Date.now(), l = this._messageList, g = { st: l.scrollTop, sh: l.scrollHeight, ch: l.clientHeight, t: now };');
  ok('MUTANT: a live layout read put back in the arm reds the no-layout pin', liveArm !== armFn && noLayoutPin(armFn) && !noLayoutPin(liveArm));
  // the bundle bound: a full fine ring of the widest entries + a full wheel ring
  const wide = { t: 1793625787053, st: 123456, sh: 1234567, ch: 12345, by: 'extendTop:delta', writeAgo: 1234567, wheelAgo: 1234567 };
  const wheelRec = { t: 1793625787053, k: 'wheel', el: 'div.chat-compact-content<div.chat-compact-msg<div.chat-msg.chat-msg-assistant<div.chat-message-list.chat-minimap-active', deltaY: -12345.67, deltaMode: 0, ctrl: 1, n: 999, stBefore: 123456, stAfter: 123456, droppedBefore: 123456 };
  const kb = Buffer.byteLength(JSON.stringify({ fine: Array(F.FINE_SCROLL_CAP).fill(wide), wheel: Array(F.WHEEL_RING_CAP).fill(wheelRec) }, null, 1)) / 1024;
  ok(`a full fine ring (${F.FINE_SCROLL_CAP}) + a full wheel ring (${F.WHEEL_RING_CAP}) = ${kb.toFixed(0)} KB per window in bundle.json — far inside the hub's body cap`, kb < 512, kb);
}

console.log(`\nfull console ring with stacks: ${(ringBytes / 1024).toFixed(0)} KB in bundle.json`);
console.log(fail ? `\nFAILED (${pass} passed, ${fail} failed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);

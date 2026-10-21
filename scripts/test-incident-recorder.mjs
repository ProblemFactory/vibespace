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

console.log(`\nfull console ring with stacks: ${(ringBytes / 1024).toFixed(0)} KB in bundle.json`);
console.log(fail ? `\nFAILED (${pass} passed, ${fail} failed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
